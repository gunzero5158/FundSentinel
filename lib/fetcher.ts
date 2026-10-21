import {Fund, Point} from './domain';

export function extractAssignment(source:string,name:string): unknown {
  const match=new RegExp(`(?:var\\s+)?${name}\\s*=\\s*`).exec(source);
  if(!match)throw new Error(`数据源缺少 ${name}`);
  const start=match.index+match[0].length;
  let quote='',escaped=false,depth=0,end=start;
  for(;end<source.length;end++){
    const c=source[end];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='"'){quote=c;continue;}if(c==='['||c==='{')depth++;if(c===']'||c==='}')depth--;
    if(depth===0 && (c===';'||c==='\n'))break;
  }
  return JSON.parse(source.slice(start,end).trim());
}
function dateOf(timestamp:number):string {return new Date(timestamp+8*3600_000).toISOString().slice(0,10);}
function positive(v:unknown):number {const n=Number(v);if(!Number.isFinite(n)||n<=0)throw new Error('净值必须为正数');return n;}
export function parseEastmoney(code:string,source:string):Fund {
  const raw=extractAssignment(source,'Data_netWorthTrend');
  const acc=extractAssignment(source,'Data_ACWorthTrend');
  if(!Array.isArray(raw)||!raw.length||!Array.isArray(acc))throw new Error('净值数据为空或格式异常');
  // The source occasionally publishes null cumulative NAV for a few dates; one gap must not reject the whole fund.
  const cumulative=new Map(acc.filter((p:unknown[])=>Number(p[1])>0).map((p:unknown[])=>[dateOf(Number(p[0])),positive(p[1])]));
  const unique=new Map<string,Point>();
  for(const r of raw){
    const date=dateOf(Number(r.x)),nav=positive(r.y),daily=r.equityReturn===undefined||r.equityReturn===null?null:Number(r.equityReturn);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('净值日期缺失');
    unique.set(date,{date,nav,acc:cumulative.get(date)??NaN,adj:null,daily:daily!==null&&Number.isFinite(daily)?daily:null,dividend:String(r.unitMoney??'').trim()});
  }
  const history=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
  // Cumulative NAV = unit NAV + paid distributions, so without a distribution it moves one-for-one with unit NAV.
  history.forEach((p,i)=>{if(!Number.isFinite(p.acc))p.acc=i&&!p.dividend?history[i-1].acc+p.nav-history[i-1].nav:p.nav;});
  let reliable=true,adj=history[0].nav;
  for(let i=0;i<history.length;i++){
    const p=history[i];
    if(i>0){
      if(!p.dividend)adj*=p.nav/history[i-1].nav;
      else if(p.daily!==null && p.daily>-100)adj*=1+p.daily/100;
      else reliable=false;
    }
    p.adj=reliable?adj:null;
  }
  let name=code;try{name=String(extractAssignment(source,'fS_name'));}catch{}
  return {code,name,type:'公募基金',source:'天天基金 · 盘后披露',history,adjustmentReliable:reliable,fetchedAt:new Date().toISOString()};
}
export async function fetchFund(code:string):Promise<Fund> {
  if(!/^\d{6}$/.test(code))throw new Error('请输入 6 位基金代码');
  let error:unknown;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js`,{signal:AbortSignal.timeout(18000),cache:'no-store',redirect:'error',headers:{'User-Agent':'FundSentinel/0.2.0','Referer':'https://fund.eastmoney.com/'}});
      if(!response.ok)throw new Error(`净值源 HTTP ${response.status}`);
      const source=await response.text();if(source.length>8_000_000)throw new Error('净值响应过大');
      const fund=parseEastmoney(code,source),today=new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
      if(fund.history.at(-1)!.date>today)throw new Error('净值日期在未来，拒绝入库');
      return fund;
    }catch(e){error=e;}
  }
  throw new Error(`${code} 净值暂不可用，保留上次数据：${error instanceof Error?error.message:'连接失败'}`);
}
export function historicalPeak(f:Fund,mode:string,start?:string,manual?:number):{nav:number;date:string} {
  const latest=f.history.at(-1)!;
  if(mode==='manual'){
    if(!manual||!Number.isFinite(manual)||manual<latest.nav)throw new Error('历史最高净值不得低于当前净值');
    return {nav:manual,date:latest.date};
  }
  const points=mode==='today'?[latest]:mode==='date'?f.history.filter(p=>p.date>=(start??'9999')):f.history.slice(-60);
  if(!points.length)throw new Error('所选建仓日期没有可用的历史净值');
  if(mode!=='today'&&points.slice(1).some(p=>p.dividend))throw new Error('回溯区间包含分红或拆分，请选择最新净值或手动输入校准后的历史最高净值');
  return points.reduce((peak,p)=>p.nav>peak.nav?{nav:p.nav,date:p.date}:peak,{nav:points[0].nav,date:points[0].date});
}
