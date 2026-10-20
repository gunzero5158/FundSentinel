import 'server-only';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {cloud,HttpError,load,save} from './store';
function key(){const secret=process.env.CHANNEL_ENCRYPTION_KEY;if(!secret||!/^[a-f0-9]{64}$/i.test(secret))throw new HttpError(503,'请配置通知加密密钥');return Buffer.from(secret,'hex');}
function sign(value:string){return createHmac('sha256',key()).update('wechat-official:'+value).digest('base64url');}
export async function startOfficial(user:string){
  if(!cloud()||!process.env.WECHAT_OFFICIAL_APP_ID||!process.env.WECHAT_OFFICIAL_APP_SECRET||!process.env.APP_URL)throw new HttpError(503,'请先配置微信服务号与 HTTPS 站点');
  const w=await load(user),nonce=randomBytes(8).toString('hex'),value=`${user}|${Math.floor(Date.now()/1000)+600}|${nonce}`,state=`${value}|${sign(value)}`;
  w.officialNonce=nonce;await save(user,w,w.revision);
  const u=new URL('https://open.weixin.qq.com/connect/oauth2/authorize');u.search=new URLSearchParams({appid:process.env.WECHAT_OFFICIAL_APP_ID,redirect_uri:process.env.APP_URL+'/api/wechat-official/callback',response_type:'code',scope:'snsapi_base',state}).toString();u.hash='wechat_redirect';return u.toString();
}
export async function completeOfficial(code:string,state:string){
  const parts=state.split('|');if(parts.length!==4)throw new HttpError(400,'绑定状态无效');
  const [user,expires,nonce,signature]=parts,value=[user,expires,nonce].join('|'),expected=Buffer.from(sign(value)),supplied=Buffer.from(signature);
  if(!/^[a-f0-9-]{36}$/i.test(user)||expected.length!==supplied.length||!timingSafeEqual(expected,supplied)||Number(expires)<Date.now()/1000)throw new HttpError(400,'绑定链接已失效，请重新发起');
  const w=await load(user);if(w.officialNonce!==nonce)throw new HttpError(400,'此绑定链接已使用或被替换');
  const u=new URL('https://api.weixin.qq.com/sns/oauth2/access_token');u.search=new URLSearchParams({appid:process.env.WECHAT_OFFICIAL_APP_ID??'',secret:process.env.WECHAT_OFFICIAL_APP_SECRET??'',code,grant_type:'authorization_code'}).toString();
  const r=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(15000)}),data=await r.json();if(data.errcode||!data.openid)throw new HttpError(400,'微信授权失败，请在微信内重新打开绑定链接');
  w.channels=[...w.channels.filter(c=>c.kind!=='wechatOfficial'),{id:'wechatOfficial',kind:'wechatOfficial',endpoint:data.openid,enabled:true}];delete w.officialNonce;await save(user,w,w.revision);
}
let cached:{token:string;expires:number}|undefined;
export async function sendOfficial(openid:string,content:string){
  if(!process.env.WECHAT_OFFICIAL_TEMPLATE_ID)throw new Error('服务号模板未配置');
  if(!cached||cached.expires<Date.now()){
    const u=new URL('https://api.weixin.qq.com/cgi-bin/token');u.search=new URLSearchParams({grant_type:'client_credential',appid:process.env.WECHAT_OFFICIAL_APP_ID??'',secret:process.env.WECHAT_OFFICIAL_APP_SECRET??''}).toString();const r=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(15000)}),data=await r.json();if(!data.access_token)throw new Error('服务号 token 获取失败');cached={token:data.access_token,expires:Date.now()+(data.expires_in-120)*1000};
  }
  const fields=JSON.parse(process.env.WECHAT_OFFICIAL_TEMPLATE_FIELDS??'{"thing1":"title","time2":"date","thing3":"notice"}'),values:Record<string,string>={title:'基金自定义指标触发',date:new Date(Date.now()+8*3600_000).toISOString().slice(0,19).replace('T',' '),notice:'客观阈值触发，请查看详情',detail:content};
  const data=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{value:values[String(v)]??String(v)}]));
  const r=await fetch(`https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(cached.token)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({touser:openid,template_id:process.env.WECHAT_OFFICIAL_TEMPLATE_ID,url:process.env.APP_URL,data}),signal:AbortSignal.timeout(15000)}),result=await r.json();if(result.errcode)throw new Error('服务号模板投递失败');
}
