import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkspace,evaluate,positionMetrics,fundMetrics,ruleValue,transition,Rule,Fund,Position,effectiveRules} from '../lib/domain';
import {parseEastmoney,historicalPeak,extractAssignment} from '../lib/fetcher';
import {positionSchema,validateOcr} from '../lib/validation';
import {validateEndpoint} from '../lib/notifications';
const rule=(type:Rule['type']='TRAILING_STOP_NAV',threshold=5):Rule=>({id:'r',code:null,type,threshold,activation:5,step:2,buffer:1,window:60,basis:'pct',label:'纪律A',paused:false});
const fund=(values=[1,1.2,1.14]):Fund=>({code:'000001',name:'测试',type:'混合',source:'fixture',adjustmentReliable:true,fetchedAt:'',history:values.map((nav,i)=>({date:`2026-10-${String(i+10).padStart(2,'0')}`,nav,adj:nav,acc:nav,daily:null,dividend:''}))});
const position=():Position=>({id:'p',code:'000001',holding:true,shares:10000,cost:1,hwm:1.2,hwmDate:'2026-10-11',addedAt:'2026-10-10',needsCalibration:false});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('document examples: three distinct trailing metrics and exact NAV accounting',()=>{
  const p=position(),f=fund(),m=positionMetrics(p,f);near(m.market,11400);near(m.profit,1400);near(m.ret,14);near(m.ddNav,5);near(m.ddRet,6);near(m.ddProfit,30);
  near(ruleValue(rule('TRAILING_STOP_NAV'),p,f)!,5);near(ruleValue(rule('TRAILING_STOP_RET'),p,f)!,6);near(ruleValue(rule('TRAILING_STOP_PROFIT'),p,f)!,30);
});
test('no pure-profit denominator when never profitable or below activation',()=>{const p={...position(),hwm:.99};assert.equal(ruleValue(rule('TRAILING_STOP_PROFIT'),p,fund([.95,.98])),null);assert.equal(ruleValue({...rule(),activation:30},position(),fund()),null);});
test('loss/target percentage and amount thresholds',()=>{const p=position(),f=fund([1,.94]);near(ruleValue(rule('FIXED_STOP_LOSS'),p,f)!,6);near(ruleValue({...rule('FIXED_STOP_LOSS'),basis:'amount'},p,f)!,600);near(ruleValue({...rule('FIXED_TAKE_PROFIT'),basis:'amount'},p,fund())!,1400);});
test('hysteresis: first crossing, silence, escalation, safe buffer, rearm',()=>{
  const r=rule();let result=transition(undefined,r,5,'2026-10-10');assert.ok(result.notify);assert.equal(result.state.status,'TRIGGERED');
  result=transition(result.state,r,5.3,'2026-10-11');assert.equal(result.notify,false);
  result=transition(result.state,r,7,'2026-10-12');assert.ok(result.notify&&result.escalation);
  result=transition(result.state,r,4.2,'2026-10-13');assert.equal(result.state.status,'TRIGGERED');
  result=transition(result.state,r,3.9,'2026-10-14');assert.equal(result.state.status,'ARMED');
  assert.ok(transition(result.state,r,5,'2026-10-15').notify);
});
test('same NAV date and older dates are idempotent; paused rule stays silent',()=>{const r=rule(),first=transition(undefined,r,5,'2026-10-12');assert.equal(transition(first.state,r,9,'2026-10-12').notify,false);assert.equal(transition(first.state,r,10,'2026-10-11').notify,false);assert.equal(transition(undefined,{...r,paused:true},8,'2026-10-13').notify,false);});
test('shared global rules have independent per-fund states, overrides replace only matching type',()=>{
  const w=emptyWorkspace();w.rules=[rule(),{...rule('FIXED_STOP_LOSS'),id:'loss'},{...rule(),id:'override',code:'000002',threshold:4}];
  w.funds={'000001':fund(),'000002':{...fund([1,1.1,1.09]),code:'000002'}};w.positions=[position(),{...position(),id:'p2',code:'000002',hwm:1.1}];evaluate(w);
  assert.ok(w.alerts.some(a=>a.code==='000001'));assert.ok(!w.alerts.some(a=>a.code==='000002'));assert.equal(w.states['r:p'].status,'TRIGGERED');assert.equal(effectiveRules(w,'000002').filter(r=>r.type==='TRAILING_STOP_NAV').length,1);
  const count=w.alerts.length;evaluate(w);assert.equal(w.alerts.length,count);
});
test('dividend: raw personal loss is suppressed, adjusted fund series remains stable',()=>{
  const w=emptyWorkspace(),f=fund([1,1.2,1.1]);f.history[2].adj=1.2;f.history[2].dividend='每份分红0.1元';w.funds={'000001':f};w.positions=[position()];w.rules=[rule(),rule('FIXED_STOP_LOSS',1),rule('FUND_DAILY_VOL',2)];evaluate(w);
  assert.ok(w.positions[0].needsCalibration);assert.equal(w.alerts.length,1);assert.equal(w.alerts[0].ruleId,'corporate');near(fundMetrics(f).daily,0);
  f.history.push({...f.history[2],date:'2026-10-13',nav:1.05,dividend:''});evaluate(w);assert.equal(w.alerts.length,1,'calibration lock must persist after ex-date');
});
test('missed intermediate dividend is caught after an outage',()=>{const w=emptyWorkspace(),f=fund([1,1.2,1.1,1.11]);f.history[2].dividend='分红';w.funds={'000001':f};w.positions=[{...position(),lastEvaluated:'2026-10-11'}];evaluate(w);assert.ok(w.positions[0].needsCalibration);assert.ok(w.alerts.some(a=>a.ruleId==='corporate'));});
test('watchlist never generates position alerts or portfolio market value',()=>{const w=emptyWorkspace();w.positions=[{...position(),holding:false,shares:0,cost:0}];w.funds={'000001':fund()};w.rules=[rule(),rule('FUND_STAGE_DD',4)];evaluate(w);assert.equal(w.portfolioHwm,0);assert.equal(w.alerts.length,1);assert.equal(w.alerts[0].title,'基金阶段高点回撤');});
test('MDD baseline excludes latest point so new historical extreme can exceed 100%',()=>{const f=fund([1,1.2,1.08,1.2,.96]),m=fundMetrics(f);near(m.mdd,10);near(m.histDD,20);near(m.ratio,200);});
test('missing adjusted series disables objective alerts instead of substituting cumulative NAV',()=>{const f=fund();f.adjustmentReliable=false;f.history[2].adj=null;assert.equal(fundMetrics(f).reliable,false);assert.equal(ruleValue(rule('FUND_HIST_MDD'),position(),f),null);});
test('portfolio transfers rebase HWM; identical holdings retain drawdown',()=>{
  const w=emptyWorkspace();w.positions=[position()];w.funds={'000001':fund([1,1.2])};w.rules=[rule('PORTFOLIO_DD',3)];evaluate(w);near(w.portfolioHwm,12000);
  w.funds['000001']=fund([1,1.2,1.14]);evaluate(w);assert.ok(w.alerts.some(a=>a.code==='portfolio'));
  w.positions[0].shares=5000;evaluate(w);near(w.portfolioHwm,5700);
});
test('strict OCR rejects missing cost or P/L, accepts explicit zero P/L, never coerces strings',()=>{
  const full={fund_code:'000001',cost_unit:1,holding_shares:100,holding_profit:0};assert.ok(validateOcr([full])[0].is_valid);assert.equal(validateOcr([{...full,cost_unit:null}])[0].is_valid,false);assert.equal(validateOcr([{...full,holding_profit:null}])[0].is_valid,false);assert.equal(validateOcr([{...full,cost_unit:'1.0'}])[0].is_valid,false);assert.equal(validateOcr([{...full,holding_shares:-1}])[0].is_valid,false);assert.ok(validateOcr([{...full,holding_shares:null,holding_amount:100}])[0].is_valid);
});
test('history peak is chosen from requested period or latest; invalid manual peak rejected',()=>{const f=fund();near(historicalPeak(f,'60').nav,1.2);near(historicalPeak(f,'today').nav,1.14);near(historicalPeak(f,'date','2026-10-12').nav,1.14);assert.throws(()=>historicalPeak(f,'manual',undefined,1.1));});
test('safe CDN parser reinvests dividends without eval and preserves timezone',()=>{
  const times=[Date.parse('2026-10-10T00:00:00+08:00'),Date.parse('2026-10-11T00:00:00+08:00')];
  const raw=[{x:times[0],y:1.2,equityReturn:0,unitMoney:''},{x:times[1],y:1.1,equityReturn:0,unitMoney:'分红0.1'}];
  const source=`var fS_name="测试";var Data_netWorthTrend=${JSON.stringify(raw)};var Data_ACWorthTrend=${JSON.stringify([[times[0],1.2],[times[1],1.2]])};`;
  const f=parseEastmoney('000001',source);assert.equal(f.history[1].date,'2026-10-11');near(f.history[1].adj!,1.2);assert.ok(f.adjustmentReliable);
  const exactSource=source.replace('"y":1.1,"equityReturn":0,"unitMoney":"分红0.1"','"y":1.20004,"equityReturn":0,"unitMoney":""');
  near(parseEastmoney('000001',exactSource).history[1].adj!,1.20004);
  assert.throws(()=>extractAssignment('var fS_name=(function(){throw 1})()','fS_name'));
});
test('holding validation rejects incomplete accounting, arbitrary fund codes, and invalid start mode',()=>{assert.ok(!positionSchema.safeParse({code:'../../x',holding:true,shares:2,cost:1}).success);assert.ok(!positionSchema.safeParse({code:'000001',holding:true}).success);assert.ok(!positionSchema.safeParse({code:'000001',holding:false,peakMode:'date'}).success);});
test('notification endpoints reject arbitrary URLs, localhost, userinfo and redirects by design',()=>{assert.throws(()=>validateEndpoint('bark','http://127.0.0.1/key'));assert.throws(()=>validateEndpoint('bark','https://api.day.app.evil.com/key'));assert.throws(()=>validateEndpoint('bark','https://secret@api.day.app/key'));assert.equal(validateEndpoint('bark','https://api.day.app/key').hostname,'api.day.app');});
test('objective history can use 3-year / 5-year baseline or stage since observation entry',()=>{
  const f=fund([1,2,1,1.2,1.08]);f.history[0].date='2020-01-01';f.history[1].date='2020-02-01';f.history[2].date='2020-03-01';
  near(fundMetrics(f).mdd,50);near(fundMetrics(f,252,3).mdd,0);near(fundMetrics(f,252,5).mdd,0);
  const p={...position(),addedAt:f.history[3].date};near(ruleValue({...rule('FUND_STAGE_DD'),window:0},p,f)!,10);
});
test('historical personal watermarks never silently cross an uncalibrated ex-dividend event',()=>{const f=fund();f.history[1].dividend='每份分红';assert.throws(()=>historicalPeak(f,'60'),/分红或拆分/);near(historicalPeak(f,'today').nav,1.14);});
test('holding validation accepts keep mode for updating positions and preserves existing inputs',()=>{assert.ok(positionSchema.safeParse({id:'p1',code:'000001',holding:true,shares:5000,cost:1.2,peakMode:'keep'}).success);assert.ok(positionSchema.safeParse({id:'p1',code:'000002',holding:false,peakMode:'keep'}).success);});
