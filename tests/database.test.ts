import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {emptyWorkspace} from '../lib/domain';

test('Postgres schema: transactional save, stale revision rollback, monotonic NAV, RLS and RPC privilege isolation',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create schema auth; create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,service_role,anon;
      insert into auth.users values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');`);
    await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
    await db.exec('grant all on all tables in schema public to service_role;');
    const one='10000000-0000-4000-8000-000000000001',two='10000000-0000-4000-8000-000000000002';
    const w=emptyWorkspace();w.funds['000001']={code:'000001',name:'测试',type:'混合',source:'fixture',adjustmentReliable:true,fetchedAt:'',history:[{date:'2026-10-19',nav:1,acc:1,adj:1,daily:0,dividend:''}]};
    w.positions=[{id:'one',code:'000001',holding:true,shares:100,cost:1,hwm:1,hwmDate:'2026-10-19',addedAt:'2026-10-19',needsCalibration:false}];
    await db.exec('set role service_role');
    await db.query('select commit_workspace($1,$2,$3)',[one,0,JSON.stringify(w)]);
    await db.query('select commit_workspace($1,$2,$3)',[two,0,JSON.stringify({...w,positions:[{...w.positions[0],id:'two',shares:200}]})]);
    const loaded=await db.query<{data:typeof w}>('select load_workspace($1) as data',[one]);assert.equal(loaded.rows[0].data.positions[0].shares,100);assert.equal(loaded.rows[0].data.revision,1);
    await assert.rejects(db.query('select commit_workspace($1,$2,$3)',[one,0,JSON.stringify(w)]),/revision conflict/);
    await assert.rejects(db.query('select commit_workspace($1,$2,$3)',[one,1,JSON.stringify({...w,funds:{},positions:[{...w.positions[0],code:'999999'}]})]),/foreign key/);
    assert.equal((await db.query<{data:typeof w}>('select load_workspace($1) as data',[one])).rows[0].data.positions[0].code,'000001');
    const old={...w.funds['000001'],history:[{...w.funds['000001'].history[0],date:'2026-10-18',nav:.5}]};await db.query('select upsert_fund($1,$2)',['000001',JSON.stringify(old)]);
    assert.equal((await db.query<{data:typeof w}>('select load_workspace($1) as data',[one])).rows[0].data.funds['000001'].history[0].nav,1);
    await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${one}',false)`);
    const rows=await db.query<{shares:string}>('select shares from user_positions');assert.equal(rows.rows.length,1);assert.equal(Number(rows.rows[0].shares),100);
    assert.equal((await db.query('select * from workspace_meta')).rows.length,1);
    await assert.rejects(db.query('select load_workspace($1)',[two]),/permission denied/);
    await assert.rejects(db.exec('update user_positions set payload=payload'),/permission denied/);
    await assert.rejects(db.exec('select * from wechat_identities'),/permission denied/);
    await db.exec('reset role;set role anon');await assert.rejects(db.exec('select * from user_positions'),/permission denied/);
  }finally{await db.close();}
});
