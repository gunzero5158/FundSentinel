-- FundSentinel read optimization (2026-10). Run once in the SQL Editor of a project created with the earlier schema.sql.
begin;
create or replace function public.history_tail(p_history jsonb,p_window integer,p_since text) returns jsonb language sql immutable set search_path=public as $$
  select coalesce(jsonb_agg(e order by i),'[]') from jsonb_array_elements(p_history) with ordinality t(e,i)
  where i > jsonb_array_length(p_history)-(p_window+2) or e->>'date' >= p_since;
$$;
create or replace function public.load_workspace(p_user uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
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
create or replace function public.commit_workspace(p_user uuid,p_expected integer,p_workspace jsonb) returns void language plpgsql security invoker set search_path=public as $$
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
create or replace function public.set_fund_stats(p_code text,p_stats jsonb) returns void language sql security invoker set search_path=public as $$
  update public.funds set payload=jsonb_set(payload,'{stats}',p_stats) where fund_code=p_code and payload->>'fetchedAt'=p_stats->>'fetchedAt';
$$;
revoke execute on function public.set_fund_stats(text,jsonb),public.history_tail(jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.set_fund_stats(text,jsonb),public.history_tail(jsonb,integer,text) to service_role;
commit;
