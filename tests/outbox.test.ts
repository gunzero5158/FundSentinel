import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkspace,evaluate,addAlert,Rule,Fund,Position,Alert} from '../lib/domain';
import {parseEastmoney} from '../lib/fetcher';
import {armChannel,compactOutbox,deliverPending,message,queueNotifications} from '../lib/notifications';
const rule=(type:Rule['type'],threshold:number):Rule=>({id:'r',code:null,type,threshold,activation:0,step:2,buffer:1,window:60,basis:'pct',label:'',paused:false});
const fund=(code:string,values:number[],start=10):Fund=>({code,name:code,type:'混合',source:'fixture',adjustmentReliable:true,fetchedAt:'',history:values.map((nav,i)=>({date:`2026-10-${String(i+start).padStart(2,'0')}`,nav,adj:nav,acc:nav,daily:null,dividend:''}))});
const position=(id:string,code:string):Position=>({id,code,holding:true,shares:10000,cost:1,hwm:1,hwmDate:'2026-10-10',addedAt:'2026-10-10',needsCalibration:false});
const alert=(id:string):Omit<Alert,'seq'>=>({id,code:'000001',ruleId:'r',date:'2026-10-10',title:'测试提醒',value:6,threshold:5,label:'',escalation:false,read:false});

test('CDN parser tolerates null cumulative NAV and derives it from unit NAV',()=>{
  const t=(d:number)=>Date.parse(`2026-10-${d}T00:00:00+08:00`);
  const raw=[{x:t(10),y:1.2,equityReturn:0,unitMoney:''},{x:t(11),y:1.25,equityReturn:0,unitMoney:''},{x:t(12),y:1.3,equityReturn:0,unitMoney:''}];
  const acc=[[t(10),2.2],[t(11),null],[t(12),2.3]];
  const f=parseEastmoney('513100',`var fS_name="纳指";var Data_netWorthTrend=${JSON.stringify(raw)};var Data_ACWorthTrend=${JSON.stringify(acc)};`);
  assert.equal(f.history.length,3);assert.ok(Math.abs(f.history[1].acc-2.25)<1e-9);assert.equal(f.history[2].acc,2.3);assert.ok(f.adjustmentReliable);
});
test('a new channel only receives alerts created after it was added',()=>{
  const w=emptyWorkspace();for(let i=0;i<50;i++)addAlert(w,alert('old'+i));
  const c={id:'bark',kind:'bark' as const,endpoint:'https://api.day.app/k',enabled:true};armChannel(w,c);w.channels.push(c);
  queueNotifications(w);assert.equal(w.deliveries.length,0);
  addAlert(w,alert('new'));queueNotifications(w);assert.deepEqual(w.deliveries[0].alertIds,['new']);
  queueNotifications(w);assert.equal(w.deliveries.length,1,'an alert is queued once per channel');
});
test('channels saved before cursors existed keep their delivery-history semantics',()=>{
  const w=emptyWorkspace();w.alerts=[{...alert('a'),seq:undefined},{...alert('b'),seq:undefined}];
  w.channels=[{id:'bark',kind:'bark',endpoint:'https://api.day.app/k',enabled:true}];w.deliveries=[{id:'d',channelId:'bark',alertIds:['a'],status:'sent',attempts:1}];
  queueNotifications(w);assert.deepEqual(w.deliveries[1].alertIds,['b']);
  addAlert(w,alert('c'));queueNotifications(w);assert.deepEqual(w.deliveries[2].alertIds,['c']);
});
test('oversized batches are cut to the platform limit with a pointer to the dashboard',()=>{
  const w=emptyWorkspace();for(let i=0;i<200;i++)addAlert(w,alert('a'+i));
  const body=message(w.alerts,w,3500);assert.ok(Buffer.byteLength(body,'utf8')<=3500);assert.match(body,/另有 \d+ 条提醒/);
  assert.doesNotMatch(message(w.alerts.slice(0,1),w,3500),/另有/);
});
test('a permanently failing channel stops retrying after the attempt limit',async()=>{
  const w=emptyWorkspace();addAlert(w,alert('a'));w.channels=[{id:'bark',kind:'bark',endpoint:'https://api.day.app/k',enabled:true,cursor:0}];queueNotifications(w);
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('offline');};
  try{for(let i=0;i<10;i++)await deliverPending(w);}finally{globalThis.fetch=original;}
  assert.equal(w.deliveries[0].status,'failed');assert.equal(w.deliveries[0].attempts,8);
});
test('exhausted WeChat subscription waits instead of burning attempts',async()=>{
  const w=emptyWorkspace();addAlert(w,alert('a'));w.channels=[{id:'wechat',kind:'wechat',endpoint:'openid',enabled:true,remaining:0,cursor:0}];queueNotifications(w);
  await deliverPending(w);assert.equal(w.deliveries[0].status,'pending');assert.equal(w.deliveries[0].attempts,0);
});
test('compaction bounds alerts and history but keeps everything still pending',()=>{
  const w=emptyWorkspace();for(let i=0;i<400;i++)addAlert(w,alert('a'+i));
  w.channels=[{id:'bark',kind:'bark',endpoint:'https://api.day.app/k',enabled:true}];
  w.deliveries=[...Array.from({length:150},(_,i)=>({id:'s'+i,channelId:'bark',alertIds:['a'+i],status:'sent' as const,attempts:1})),{id:'p',channelId:'bark',alertIds:['a0'],status:'pending',attempts:0},{id:'gone',channelId:'removed',alertIds:['a1'],status:'pending',attempts:0}];
  compactOutbox(w);
  assert.equal(w.deliveries.length,101);assert.ok(w.deliveries.some(d=>d.id==='p'));assert.ok(!w.deliveries.some(d=>d.id==='gone'));
  assert.equal(w.alerts.length,301);assert.ok(w.alerts.some(a=>a.id==='a0'));assert.ok(!w.alerts.some(a=>a.id==='a1'));
});
test('portfolio with a lagging QDII is evaluated once every holding has advanced',()=>{
  const w=emptyWorkspace();w.rules=[rule('PORTFOLIO_DD',3)];w.positions=[position('p1','000001'),position('p2','000002')];
  w.funds={'000001':fund('000001',[1,1.2,1.2]),'000002':fund('000002',[1,1.2])};evaluate(w);
  assert.equal(w.portfolioHwm,24000);assert.equal(w.states['r:portfolio'].evaluated,'2026-10-11');
  // Domestic fund falls on a new date while the QDII still lags: same set of "earliest" NAV, no re-evaluation.
  w.funds['000001']=fund('000001',[1,1.2,1.2,1.0]);evaluate(w);assert.equal(w.alerts.length,0);
  // QDII catches up: the portfolio is evaluated with both latest NAVs and the drawdown is reported.
  w.funds['000002']=fund('000002',[1,1.2,1.15]);evaluate(w);
  const a=w.alerts.find(a=>a.code==='portfolio');assert.ok(a);assert.equal(a.date,'2026-10-12');
  evaluate(w);assert.equal(w.alerts.filter(a=>a.code==='portfolio').length,1,'idempotent per NAV set');
});
