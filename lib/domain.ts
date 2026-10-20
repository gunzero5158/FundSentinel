export const VERSION = '0.1.0';
export const DISCLAIMER = '本工具仅基于公开历史净值及用户自行录入的数据提供客观指标计算与阈值通知，不构成任何投资建议。';
export type Point = {date: string; nav: number; acc: number; adj: number | null; daily: number | null; dividend: string};
export type FundStats = {reliable:boolean;stageDD:number;mdd:number;histDD:number;ratio:number;downDays:number;daily:number;peak:number};
export type Fund = {code: string; name: string; type: string; source: string; history: Point[]; adjustmentReliable: boolean; fetchedAt: string; summaries?:Record<string,FundStats>};
export type Position = {id: string; code: string; holding: boolean; shares: number; cost: number; hwm: number; hwmDate: string; addedAt: string; lastEvaluated?: string; needsCalibration: boolean};
export const RULE_TYPES = ['TRAILING_STOP_NAV','TRAILING_STOP_RET','TRAILING_STOP_PROFIT','FIXED_TAKE_PROFIT','FIXED_STOP_LOSS','PORTFOLIO_DD','FUND_STAGE_DD','FUND_HIST_MDD','FUND_DAILY_VOL','FUND_DOWN_DAYS'] as const;
export type RuleType = typeof RULE_TYPES[number];
export const RULE_NAMES: Record<RuleType,string> = {
  TRAILING_STOP_NAV: '最高净值相对回撤', TRAILING_STOP_RET: '最高收益率回落百分点', TRAILING_STOP_PROFIT: '纯浮盈回吐比例',
  FIXED_TAKE_PROFIT: '累计收益阈值', FIXED_STOP_LOSS: '累计亏损阈值', PORTFOLIO_DD: '组合高点回撤',
  FUND_STAGE_DD: '基金阶段高点回撤', FUND_HIST_MDD: '历史最大回撤比例', FUND_DAILY_VOL: '单日复权波动', FUND_DOWN_DAYS: '连续下跌交易日',
};
export type Rule = {id: string; code: string | null; type: RuleType; threshold: number; activation: number; step: number; buffer: number; window: number; historyYears?:0|3|5; basis: 'pct'|'amount'; label: string; paused: boolean};
export type RuleState = {status: 'ARMED'|'TRIGGERED'; value?: number; date?: string; evaluated?: string};
export type Alert = {id: string; code: string; ruleId: string; date: string; title: string; value: number; threshold: number; label: string; escalation: boolean; read: boolean};
export type Channel = {id: string; kind: 'bark'|'wecom'|'feishu'|'dingtalk'|'pushplus'|'serverchan'|'wechat'|'wechatOfficial'; endpoint: string; enabled: boolean; remaining?:number};
export type Delivery = {id: string; channelId: string; alertIds: string[]; status: 'pending'|'sent'; attempts: number; error?: string};
export type Workspace = {revision: number; positions: Position[]; rules: Rule[]; states: Record<string,RuleState>; alerts: Alert[]; funds: Record<string,Fund>; portfolioHwm: number; portfolioSignature: string; channels: Channel[]; deliveries: Delivery[]; lastSync?: string; syncErrors: string[]; demo: boolean;ocrUsage?:{date:string;count:number};officialNonce?:string;deliveryLease?:{owner:string;expires:number}};
export function emptyWorkspace(): Workspace {
  return {revision:0,positions:[],rules:defaultRules(),states:{},alerts:[],funds:{},portfolioHwm:0,portfolioSignature:'',channels:[],deliveries:[],syncErrors:[],demo:false};
}
export function defaultRules(): Rule[] {
  return [
    ['TRAILING_STOP_NAV',5,5],['FIXED_STOP_LOSS',5,0],['FUND_HIST_MDD',90,0],['PORTFOLIO_DD',3,0],
  ].map(([type,threshold,activation],i)=>({id:`default-${i}`,code:null,type:type as RuleType,threshold:Number(threshold),activation:Number(activation),step:2,buffer:1,window:252,basis:'pct',label:'',paused:false}));
}
export function latest(f: Fund): Point { if(!f.history.length) throw new Error('基金缺少有效净值'); return f.history[f.history.length-1]; }
export function positionMetrics(p: Position,f: Fund) {
  const t=latest(f), prev=f.history.at(-2), hwm=Math.max(p.hwm,t.nav), ret=p.cost>0?(t.nav/p.cost-1)*100:0;
  return {nav:t.nav,date:t.date,market:p.shares*t.nav,cost:p.shares*p.cost,profit:p.shares*(t.nav-p.cost),ret,hwm,
    hwmReturn:p.cost>0?(hwm/p.cost-1)*100:0,ddNav:(hwm-t.nav)/hwm*100,ddRet:p.cost>0?(hwm-t.nav)/p.cost*100:0,
    ddProfit:hwm>p.cost?(hwm-t.nav)/(hwm-p.cost)*100:0,today:prev?p.shares*(t.nav-prev.nav):null};
}
export function fundMetrics(f: Fund,window=252,historyYears=0):FundStats {
  if(f.summaries?.[`${window}:${historyYears}`])return f.summaries[`${window}:${historyYears}`];
  const reliable=f.adjustmentReliable && f.history.length>0 && f.history.every(p=>p.adj!==null), points=f.history;
  if(!reliable) return {reliable:false,stageDD:0,mdd:0,histDD:0,ratio:0,downDays:0,daily:0,peak:0};
  const values=points.map(p=>p.adj!), cur=values.at(-1)!;
  const start=new Date(points.at(-1)!.date);start.setUTCFullYear(start.getUTCFullYear()-historyYears);
  const histValues=historyYears?points.filter(p=>p.date>=start.toISOString().slice(0,10)).map(p=>p.adj!):values;
  const before=histValues.slice(0,-1),historical=before.length?before:histValues;
  let peak=historical[0],mdd=0;
  for(const v of historical){peak=Math.max(peak,v);mdd=Math.max(mdd,(peak-v)/peak*100);}
  const histPeak=Math.max(...histValues), stagePeak=Math.max(...values.slice(-Math.max(1,window)));
  let downDays=0;for(let i=values.length-1;i>0 && values[i]<values[i-1];i--)downDays++;
  const histDD=(histPeak-cur)/histPeak*100;
  return {reliable:true,stageDD:(stagePeak-cur)/stagePeak*100,mdd,histDD,ratio:mdd>0?histDD/mdd*100:0,downDays,daily:values.length>1?(cur/values.at(-2)!-1)*100:0,peak:histPeak};
}
export function effectiveRules(w: Workspace,code: string): Rule[] {
  const specific=w.rules.filter(r=>r.code===code), types=new Set(specific.map(r=>r.type));
  return [...w.rules.filter(r=>r.code===null && r.type!=='PORTFOLIO_DD' && !types.has(r.type)),...specific];
}
export function ruleValue(r: Rule,p: Position,f: Fund): number | null {
  const m=positionMetrics(p,f);
  const since=f.history.filter(point=>point.date>=p.addedAt);
  const fm=r.type==='FUND_STAGE_DD'&&r.window===0?(f.summaries?.sinceAdded??fundMetrics({...f,history:since,summaries:undefined},1_000_000)):fundMetrics(f,r.window,r.historyYears??0);
  if(r.type.startsWith('FUND_')){
    if(!fm.reliable) return null;
    return {FUND_STAGE_DD:fm.stageDD,FUND_HIST_MDD:fm.mdd>0?fm.ratio:null,FUND_DAILY_VOL:Math.abs(fm.daily),FUND_DOWN_DAYS:fm.downDays}[r.type as 'FUND_STAGE_DD'];
  }
  if(!p.holding || p.needsCalibration) return null;
  if(['TRAILING_STOP_NAV','TRAILING_STOP_RET','TRAILING_STOP_PROFIT'].includes(r.type) && (m.hwmReturn<r.activation || m.hwm<=p.cost)) return null;
  switch(r.type){
    case 'TRAILING_STOP_NAV': return m.ddNav;
    case 'TRAILING_STOP_RET': return m.ddRet;
    case 'TRAILING_STOP_PROFIT': return m.ddProfit;
    case 'FIXED_TAKE_PROFIT': return r.basis==='amount'?m.profit:m.ret;
    case 'FIXED_STOP_LOSS': return r.basis==='amount'?-m.profit:-m.ret;
    default:return null;
  }
}
export function transition(s: RuleState | undefined,r: Rule,value: number,date: string): {state:RuleState;notify:boolean;escalation:boolean} {
  const old=s??{status:'ARMED'};
  if(r.paused || (old.evaluated && date<=old.evaluated))return {state:old,notify:false,escalation:false};
  const next={...old,evaluated:date};
  if(value<r.threshold-r.buffer)return {state:{status:'ARMED',evaluated:date},notify:false,escalation:false};
  const escalation=old.status==='TRIGGERED';
  if(value+1e-9>=r.threshold && (!escalation || value+1e-9>=(old.value??r.threshold)+r.step))
    return {state:{status:'TRIGGERED',value,date,evaluated:date},notify:true,escalation};
  return {state:next,notify:false,escalation:false};
}
export function evaluate(w: Workspace): Workspace {
  for(const p of w.positions){
    const f=w.funds[p.code];if(!f)continue;
    const t=latest(f);if(p.lastEvaluated && p.lastEvaluated>=t.date)continue;
    // Any missed corporate action since the previous evaluation invalidates the personal cost basis.
    const actions=f.history.filter(x=>x.dividend && x.date>(p.lastEvaluated??t.date.slice(0,0)) && x.date>=p.addedAt);
    if(p.holding && actions.length){
      p.needsCalibration=true;
      for(const a of actions){const id=`corporate:${p.id}:${a.date}`;if(!w.alerts.some(x=>x.id===id))w.alerts.push({id,code:p.code,ruleId:'corporate',date:a.date,title:'分红除权校准提醒：请确认份额与成本',value:0,threshold:0,label:a.dividend,escalation:false,read:false});}
    }
    if(!p.needsCalibration && t.nav>p.hwm){p.hwm=t.nav;p.hwmDate=t.date;}
    for(const r of effectiveRules(w,p.code)){
      const value=ruleValue(r,p,f);if(value===null)continue;
      const key=`${r.id}:${p.id}`,next=transition(w.states[key],r,value,t.date);w.states[key]=next.state;
      if(next.notify)w.alerts.push({id:`${key}:${t.date}`,code:p.code,ruleId:r.id,date:t.date,title:RULE_NAMES[r.type],value,threshold:r.threshold,label:r.label,escalation:next.escalation,read:false});
    }
    p.lastEvaluated=t.date;
  }
  const held=w.positions.filter(p=>p.holding && w.funds[p.code]);
  const signature=held.map(p=>`${p.id}:${p.shares}:${p.cost}`).sort().join('|');
  const market=held.reduce((sum,p)=>sum+positionMetrics(p,w.funds[p.code]).market,0);
  // A contribution/withdrawal changes the base; never interpret it as market drawdown.
  if(signature!==w.portfolioSignature){w.portfolioHwm=market;w.portfolioSignature=signature;for(const r of w.rules.filter(r=>r.type==='PORTFOLIO_DD'))delete w.states[`${r.id}:portfolio`];}
  const dates=held.map(p=>latest(w.funds[p.code]).date);
  // Only evaluate a portfolio on a common NAV date; mixed QDII dates are explicitly pending.
  if(held.length && new Set(dates).size===1 && !held.some(p=>p.needsCalibration)){
    w.portfolioHwm=Math.max(w.portfolioHwm,market);
    for(const r of w.rules.filter(r=>r.type==='PORTFOLIO_DD')){
      const value=w.portfolioHwm>0?(w.portfolioHwm-market)/w.portfolioHwm*100:0;
      const key=`${r.id}:portfolio`,next=transition(w.states[key],r,value,dates[0]);w.states[key]=next.state;
      if(next.notify)w.alerts.push({id:`${key}:${dates[0]}`,code:'portfolio',ruleId:r.id,date:dates[0],title:RULE_NAMES.PORTFOLIO_DD,value,threshold:r.threshold,label:r.label,escalation:next.escalation,read:false});
    }
  }
  return w;
}
