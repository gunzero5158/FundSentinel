import {Alert,Channel,DISCLAIMER,Workspace,latest,positionMetrics,fundMetrics} from './domain';
const HOSTS:Record<Channel['kind'],string[]>={bark:['api.day.app'],wecom:['qyapi.weixin.qq.com'],feishu:['open.feishu.cn'],dingtalk:['oapi.dingtalk.com'],pushplus:['www.pushplus.plus','pushplus.plus'],serverchan:['sctapi.ftqq.com'],wechat:[],wechatOfficial:[]};
export function validateEndpoint(kind:Channel['kind'],endpoint:string){
  const u=new URL(endpoint);if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS[kind]?.includes(u.hostname))throw new Error('请填写对应通知平台的官方 HTTPS 地址');
  return u;
}
// Platform payload ceilings in UTF-8 bytes (WeCom markdown 4096, APNs/Bark 4096, DingTalk 20000), with headroom for title and disclaimer.
const LIMITS:Partial<Record<Channel['kind'],number>>={bark:3000,wecom:3500,dingtalk:18000,feishu:18000,pushplus:18000,serverchan:18000,wechatOfficial:18000};
const MAX_ATTEMPTS=8;
const bytes=(text:string)=>Buffer.byteLength(text,'utf8');
export function message(alerts:Alert[],w:Workspace,limit=18000){
  const footer=`\n\n${DISCLAIMER}`,blocks=alerts.map(a=>{
  const f=w.funds[a.code],p=w.positions.find(p=>p.code===a.code),m=f&&p?positionMetrics(p,f):null,fm=f?fundMetrics(f):null;
  return `【${a.title}】\n${a.code==='portfolio'?'账户组合':f?.name??a.code}（${a.code}） · 触发净值日期 ${a.date}\n指标 ${a.value.toFixed(2)} / 阈值 ${a.threshold.toFixed(2)}${a.escalation?' · 阶梯升级':''}${a.label?`\n个人标签：${a.label}`:''}`
    +(f?`\n最新确认净值 ${latest(f).nav.toFixed(4)}（${latest(f).date}）`:'')
    +(m&&p?.holding?`\n持仓收益率 ${m.ret.toFixed(2)}% · 最高收益率 ${m.hwmReturn.toFixed(2)}% · 最高净值回撤 ${m.ddNav.toFixed(2)}%`:'')
    +(fm?.reliable?`\n基金本轮回撤 ${fm.histDD.toFixed(2)}% · 历史最大回撤 ${fm.mdd.toFixed(2)}%`:'');
  });
  // An oversized batch is rejected by the platform on every retry; send what fits and point to the dashboard.
  const kept:string[]=[];let size=bytes(footer)+120;
  for(const b of blocks){if(kept.length&&size+bytes(b)+2>limit)break;kept.push(b);size+=bytes(b)+2;}
  const more=blocks.length-kept.length;
  return kept.join('\n\n')+(more?`\n\n……另有 ${more} 条提醒，请打开看板查看`:'')+footer;
}
export async function sendChannel(c:Channel,body:string):Promise<void>{
  if(c.kind==='wechatOfficial'){const {sendOfficial}=await import('./wechat-official');await sendOfficial(c.endpoint,body);return;}
  if(c.kind==='wechat'){
    if(!c.remaining||c.remaining<=0)throw new Error('微信订阅额度不足');
    const {sendWechat}=await import('./wechat');await sendWechat(c.endpoint,'基金自定义指标触发');return;
  }
  const u=validateEndpoint(c.kind,c.endpoint),title='净值哨兵 · 指标触发汇总';let payload:unknown;
  switch(c.kind){
    case 'bark':payload={title,body,group:'FundSentinel',url:process.env.APP_URL||undefined};break;
    case 'wecom':payload={msgtype:'markdown',markdown:{content:`${title}\n${body}`}};break;
    case 'feishu':payload={msg_type:'text',content:{text:`${title}\n${body}`}};break;
    case 'dingtalk':payload={msgtype:'markdown',markdown:{title,text:`${title}\n${body}`}};break;
    case 'pushplus':payload={token:u.searchParams.get('token'),title,content:body,template:'txt'};break;
    case 'serverchan':payload={title,desp:body};break;
  }
  const response=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`通知 HTTP ${response.status}`);
  const result=await response.json();
  const code=result.errcode??result.code??result.errno??result.data?.errno??0;
  if(![0,200].includes(Number(code)))throw new Error(`平台拒绝通知（错误码 ${String(code)}）`);
}
// A newly added or re-enabled channel starts after the existing alerts instead of receiving the whole history.
export function armChannel(w:Workspace,c:Channel){c.cursor=w.alertSeq??0;}
export function queueNotifications(w:Workspace){
  for(const c of w.channels.filter(c=>c.enabled)){
    let ids:string[];
    if(c.cursor===undefined){
      // Channels saved before cursors existed: fall back once to the delivery history.
      const covered=new Set(w.deliveries.filter(d=>d.channelId===c.id).flatMap(d=>d.alertIds));
      ids=w.alerts.filter(a=>!covered.has(a.id)).map(a=>a.id);
    }else ids=w.alerts.filter(a=>(a.seq??0)>c.cursor!).map(a=>a.id);
    c.cursor=w.alertSeq??0;
    if(ids.length)w.deliveries.push({id:crypto.randomUUID(),channelId:c.id,alertIds:ids,status:'pending',attempts:0});
  }
}
// Keeps the workspace bounded: alerts and delivery history otherwise grow with every scan forever.
export function compactOutbox(w:Workspace,keepAlerts=300,keepDeliveries=100){
  const channels=new Set(w.channels.map(c=>c.id));
  w.deliveries=w.deliveries.filter(d=>channels.has(d.channelId));
  const pending=w.deliveries.filter(d=>d.status==='pending'),done=w.deliveries.filter(d=>d.status!=='pending');
  w.deliveries=[...done.slice(-keepDeliveries),...pending];
  const needed=new Set(pending.flatMap(d=>d.alertIds)),recent=new Set(w.alerts.slice(-keepAlerts).map(a=>a.id));
  w.alerts=w.alerts.filter(a=>recent.has(a.id)||needed.has(a.id));
}
export async function deliverPending(w:Workspace):Promise<void>{
  const pending=w.deliveries.filter(d=>d.status==='pending'),started=Date.now();
  for(let i=0;i<pending.length&&Date.now()-started<25_000;i+=4)await Promise.all(pending.slice(i,i+4).map(async d=>{
    const c=w.channels.find(c=>c.id===d.channelId&&c.enabled);if(!c)return;
    // An exhausted WeChat subscription is not a delivery failure; wait for the user to subscribe again.
    if(c.kind==='wechat'&&!(c.remaining&&c.remaining>0))return;
    d.attempts++;
    try{await sendChannel(c,message(w.alerts.filter(a=>d.alertIds.includes(a.id)),w,LIMITS[c.kind]));if(c.kind==='wechat')c.remaining=Math.max(0,(c.remaining??0)-1);d.status='sent';delete d.error;}
    catch{if(d.attempts>=MAX_ATTEMPTS){d.status='failed';d.error=`通知连续 ${MAX_ATTEMPTS} 次发送失败，已停止重试，请检查通道配置`;}else d.error='通知发送失败，已保留队列，下次任务重试';}
  }));
}
