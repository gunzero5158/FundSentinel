import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {emptyWorkspace,evaluate,digest,fundMetrics,ruleValue,Fund,Position,Rule} from '../lib/domain';
// Deterministic ~8-year daily series with drawdowns, so 3/5-year baselines differ from full history.
function longFund(n=2000):Fund{
  let seed=7,nav=1;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const history=Array.from({length:n},(_,i)=>{nav*=1+(rnd()-.5)*.04;const d=new Date(Date.UTC(2018,0,1)+i*1.5*86400_000).toISOString().slice(0,10);return {date:d,nav:Number(nav.toFixed(4)),acc:nav,adj:nav,daily:null,dividend:''};});
  return {code:'000001',name:'长序列',type:'混合',source:'fixture',adjustmentReliable:true,fetchedAt:'2026-10-20T00:00:00Z',history};
}
const rule=(type:Rule['type'],window:number,historyYears:0|3|5=0):Rule=>({id:`${type}-${window}-${historyYears}`,code:null,type,threshold:1,activation:0,step:1,buffer:0,window,historyYears,basis:'pct',label:'',paused:false});
const near=(a:number|null,b:number|null,msg:string)=>assert.ok(a===b||(a!==null&&b!==null&&Math.abs(a-b)<1e-9),`${msg}: ${a} != ${b}`);

test('digest plus a short tail reproduces every full-history metric',()=>{
  const full=longFund(),tailWindow=500,addedAt=full.history.at(-120)!.date;
  const since=full.history.findIndex(p=>p.date>=addedAt),start=Math.min(full.history.length-(tailWindow+2),since);
  const compact:Fund={...full,stats:digest(full),partial:true,history:full.history.slice(start)};
  for(const window of [0,20,60,252,500,1260])for(const years of [0,3,5] as const){
    const a=fundMetrics(full,window,years),b=fundMetrics(compact,window,years);
    for(const k of Object.keys(a) as (keyof typeof a)[])near(Number(b[k]),Number(a[k]),`${k} window=${window} years=${years}`);
  }
  const p:Position={id:'p',code:'000001',holding:true,shares:1000,cost:1,hwm:1,hwmDate:addedAt,addedAt,needsCalibration:false};
  for(const r of [rule('FUND_STAGE_DD',0),rule('FUND_STAGE_DD',500),rule('FUND_HIST_MDD',252,3),rule('FUND_DAILY_VOL',252),rule('FUND_DOWN_DAYS',252),rule('FIXED_STOP_LOSS',252)])near(ruleValue(r,p,compact),ruleValue(r,p,full),r.id);
  assert.ok(JSON.stringify(compact.history).length<JSON.stringify(full.history).length/2);
});
test('a stale digest is ignored instead of serving outdated metrics',()=>{
  const f=longFund(),old=digest({...f,history:f.history.slice(0,-1)});
  near(fundMetrics({...f,stats:old}).histDD,fundMetrics(f).histDD,'stale digest');
});
test('evaluation over a compact fund matches evaluation over the full fund',()=>{
  const run=(f:Fund)=>{const w=emptyWorkspace();w.rules=[rule('FUND_STAGE_DD',0),rule('FUND_HIST_MDD',252,5),rule('PORTFOLIO_DD',252)];w.funds={'000001':f};w.positions=[{id:'p',code:'000001',holding:true,shares:1000,cost:1,hwm:1,hwmDate:'',addedAt:f.history.at(-30)!.date,needsCalibration:false}];evaluate(w);return w.alerts.map(a=>[a.id,a.value.toFixed(9)]);};
  const full=longFund();assert.deepEqual(run({...full,stats:digest(full),partial:true,history:full.history.slice(-40)}),run(full));
});
test('Postgres returns a digest with a tail, digests stale funds once, never overwrites history with a tail',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create schema auth; create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;grant usage on schema auth,public to authenticated,service_role,anon;
      insert into auth.users values('10000000-0000-4000-8000-000000000001');`);
    await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
    await db.exec('grant all on all tables in schema public to service_role;set role service_role');
    const user='10000000-0000-4000-8000-000000000001',f=longFund(),addedAt=f.history.at(-10)!.date;
    const w={...emptyWorkspace(),funds:{'000001':f},positions:[{id:'p',code:'000001',holding:true,shares:1,cost:1,hwm:1,hwmDate:'',addedAt,needsCalibration:false}]};
    await db.query('select commit_workspace($1,$2,$3)',[user,0,JSON.stringify(w)]);
    const load=async()=>(await db.query<{data:{funds:Record<string,Fund>}}>('select load_workspace($1) as data',[user])).rows[0].data.funds['000001'];
    let loaded=await load();assert.equal(loaded.history.length,2000,'no digest yet: full history');assert.equal(loaded.partial,undefined);
    await db.query('select set_fund_stats($1,$2)',['000001',JSON.stringify({...digest(f),fetchedAt:'other'})]);
    assert.equal((await load()).history.length,2000,'digest for another fetch is rejected');
    await db.query('select set_fund_stats($1,$2)',['000001',JSON.stringify(digest(f))]);
    loaded=await load();assert.equal(loaded.partial,true);assert.equal(loaded.history[0].date,addedAt);assert.equal(loaded.history.length,10);assert.ok(loaded.stats);
    await db.query('select commit_workspace($1,$2,$3)',[user,1,JSON.stringify({...w,funds:{'000001':{...loaded,history:loaded.history.slice(-1),fetchedAt:'2099-01-01'}}})]);
    assert.equal((await db.query<{n:number}>("select jsonb_array_length(payload->'history') as n from funds")).rows[0].n,2000,'tail never written back');
    await db.query("insert into alert_rules(id,user_id,payload) values('r',$1,'{\"window\":500,\"threshold\":1}')",[user]);
    assert.equal((await load()).history.length,502,'uncommon rule window extends the tail');
    await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select set_fund_stats($1,$2)',['000001','{}']),/permission denied/);
  }finally{await db.close();}
});
