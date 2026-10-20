-- FundSentinel 0.1.0. Run once in a new Supabase project SQL Editor.
begin;
create table public.funds (
  fund_code varchar(6) primary key check (fund_code ~ '^[0-9]{6}$'),
  payload jsonb not null,
  fund_name text generated always as (payload->>'name') stored,
  updated_at timestamptz not null default now()
);
create table public.workspace_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 0,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create table public.user_positions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  fund_code varchar(6) not null references public.funds(fund_code),
  payload jsonb not null,
  is_holding boolean generated always as ((payload->>'holding')::boolean) stored,
  shares numeric generated always as ((payload->>'shares')::numeric) stored,
  cost_unit numeric generated always as ((payload->>'cost')::numeric) stored,
  hwm_nav numeric generated always as ((payload->>'hwm')::numeric) stored,
  hwm_date text generated always as (payload->>'hwmDate') stored,
  last_evaluated_nav_date text generated always as (payload->>'lastEvaluated') stored,
  primary key(user_id,id), unique(user_id,fund_code),
  check ((payload->>'shares')::numeric >= 0),
  check ((payload->>'cost')::numeric >= 0)
);
create table public.alert_rules (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  fund_code text generated always as (payload->>'code') stored,
  rule_type text generated always as (payload->>'type') stored,
  trigger_threshold numeric generated always as ((payload->>'threshold')::numeric) stored,
  primary key(user_id,id),
  check ((payload->>'threshold')::numeric > 0)
);
create table public.system_heartbeat (id integer primary key check(id=1),last_seen timestamptz not null default now());
create table public.wechat_identities (openid_hash text primary key,user_id uuid unique not null references auth.users(id) on delete cascade,encrypted_openid text);
alter table public.funds enable row level security;
alter table public.workspace_meta enable row level security;
alter table public.user_positions enable row level security;
alter table public.alert_rules enable row level security;
alter table public.system_heartbeat enable row level security;
alter table public.wechat_identities enable row level security;
create policy "Authenticated NAV read" on public.funds for select to authenticated using(true);
create policy "Own workspace read" on public.workspace_meta for select to authenticated using(auth.uid()=user_id);
create policy "Own positions read" on public.user_positions for select to authenticated using(auth.uid()=user_id);
create policy "Own rules read" on public.alert_rules for select to authenticated using(auth.uid()=user_id);
-- No client writes. Application verifies bearer identity and performs bounded mutations server-side.
revoke all on public.wechat_identities,public.system_heartbeat from anon,authenticated;
grant select on public.funds,public.workspace_meta,public.user_positions,public.alert_rules to authenticated;

-- Raw points still needed after the precomputed digest: the largest uncommon rule window, the latest two points,
-- and everything since the position was added or last evaluated. History is sorted, so the result is a suffix.
create function public.history_tail(p_history jsonb,p_window integer,p_since text) returns jsonb language sql immutable set search_path=public as $$
  select coalesce(jsonb_agg(e order by i),'[]') from jsonb_array_elements(p_history) with ordinality t(e,i)
  where i > jsonb_array_length(p_history)-(p_window+2) or e->>'date' >= p_since;
$$;
create function public.load_workspace(p_user uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare meta public.workspace_meta; result jsonb; tail_window integer;
begin
  select * into meta from public.workspace_meta where user_id=p_user;
  if not found then return null; end if;
  -- 60/252/1260 are precomputed in the digest; other rule windows need raw points.
  select coalesce(max((payload->>'window')::integer) filter (where (payload->>'window')::integer not in (60,252,1260)),0) into tail_window from public.alert_rules where user_id=p_user;
  result := meta.payload || jsonb_build_object('revision',meta.revision,
    'positions',coalesce((select jsonb_agg(payload order by id) from public.user_positions where user_id=p_user),'[]'),
    'rules',coalesce((select jsonb_agg(payload order by id) from public.alert_rules where user_id=p_user),'[]'),
    -- A fund without a current digest is returned in full once so the server can compute and store it.
    'funds',coalesce((select jsonb_object_agg(f.fund_code,case when f.payload->'stats'->>'fetchedAt' is distinct from f.payload->>'fetchedAt' or f.payload->'stats'->>'lastDate' is distinct from f.payload->'history'->-1->>'date' then f.payload
        else (f.payload-'history') || jsonb_build_object('partial',true,'history',public.history_tail(f.payload->'history',tail_window,p.since)) end)
      from public.funds f join (select fund_code,min(least(payload->>'addedAt',coalesce(payload->>'lastEvaluated',payload->>'addedAt'))) as since from public.user_positions where user_id=p_user group by fund_code) p using(fund_code)),'{}'));
  return result;
end $$;
create function public.commit_workspace(p_user uuid,p_expected integer,p_workspace jsonb) returns void language plpgsql security invoker set search_path=public as $$
declare current_revision integer; item jsonb; code text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select revision into current_revision from public.workspace_meta where user_id=p_user for update;
  if coalesce(current_revision,0) <> p_expected then raise exception 'revision conflict'; end if;
  for code,item in select key,value from jsonb_each(p_workspace->'funds') loop
    -- A loaded tail must never replace the stored full history.
    if coalesce((item->>'partial')::boolean,false) then continue; end if;
    insert into public.funds(fund_code,payload) values(code,item)
    on conflict(fund_code) do update set payload=excluded.payload,updated_at=now()
    where (excluded.payload->'history'->-1->>'date') >= (funds.payload->'history'->-1->>'date');
  end loop;
  delete from public.user_positions where user_id=p_user;
  for item in select value from jsonb_array_elements(p_workspace->'positions') loop
    insert into public.user_positions(id,user_id,fund_code,payload) values(item->>'id',p_user,item->>'code',item);
  end loop;
  delete from public.alert_rules where user_id=p_user;
  for item in select value from jsonb_array_elements(p_workspace->'rules') loop
    insert into public.alert_rules(id,user_id,payload) values(item->>'id',p_user,item);
  end loop;
  insert into public.workspace_meta(user_id,revision,payload) values(p_user,p_expected+1,p_workspace-'positions'-'rules'-'funds'-'revision')
  on conflict(user_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=now();
end $$;
revoke execute on function public.load_workspace(uuid),public.commit_workspace(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.load_workspace(uuid),public.commit_workspace(uuid,integer,jsonb) to service_role;
create function public.upsert_fund(p_code text,p_payload jsonb) returns void language sql security invoker set search_path=public as $$
  insert into public.funds(fund_code,payload) values(p_code,p_payload)
  on conflict(fund_code) do update set payload=excluded.payload,updated_at=now()
  where (excluded.payload->'history'->-1->>'date') >= (funds.payload->'history'->-1->>'date');
$$;
revoke execute on function public.upsert_fund(text,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_fund(text,jsonb) to service_role;
create function public.set_fund_stats(p_code text,p_stats jsonb) returns void language sql security invoker set search_path=public as $$
  update public.funds set payload=jsonb_set(payload,'{stats}',p_stats) where fund_code=p_code and payload->>'fetchedAt'=p_stats->>'fetchedAt';
$$;
revoke execute on function public.set_fund_stats(text,jsonb),public.history_tail(jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.set_fund_stats(text,jsonb),public.history_tail(jsonb,integer,text) to service_role;
commit;
