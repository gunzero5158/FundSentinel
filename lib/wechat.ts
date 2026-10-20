import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {admin,HttpError,load,save} from './store';
export async function wechatLogin(code:string){
  const appid=process.env.WECHAT_APP_ID,secret=process.env.WECHAT_APP_SECRET;
  if(!appid||!secret)throw new HttpError(503,'尚未配置微信小程序 AppID 与 AppSecret');
  const url=new URL('https://api.weixin.qq.com/sns/jscode2session');url.search=new URLSearchParams({appid,secret,js_code:code,grant_type:'authorization_code'}).toString();
  const response=await fetch(url,{signal:AbortSignal.timeout(15000),cache:'no-store'}),data=await response.json();
  if(data.errcode||typeof data.openid!=='string')throw new HttpError(401,'微信登录凭证无效，请重试');
  const hash=createHash('sha256').update(appid+':'+data.openid).digest('hex'),db=admin();
  const {data:identity,error:identityError}=await db.from('wechat_identities').select('user_id').eq('openid_hash',hash).maybeSingle();if(identityError)throw identityError;
  const email=`wx-${hash}@fundsentinel.invalid`;let user=identity?.user_id;
  if(!user){
    const {data:created,error}=await db.auth.admin.createUser({email,password:randomBytes(48).toString('base64url'),email_confirm:true});if(error||!created.user)throw new HttpError(502,'无法建立微信账户，请稍后重试');
    user=created.user.id;const {error:insertError}=await db.from('wechat_identities').insert({openid_hash:hash,user_id:user});if(insertError)throw insertError;
  }
  const {data:link,error:linkError}=await db.auth.admin.generateLink({type:'magiclink',email});
  if(linkError||!link.properties?.hashed_token)throw new HttpError(502,'登录凭证生成失败');
  const {data:session,error:sessionError}=await db.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'});
  if(sessionError||!session.session)throw new HttpError(502,'微信会话建立失败');
  const w=await load(user);if(!w.channels.some(c=>c.kind==='wechat')){w.channels.push({id:'wechat',kind:'wechat',endpoint:data.openid,enabled:false,remaining:0});await save(user,w,w.revision);}
  return {access_token:session.session.access_token,refresh_token:session.session.refresh_token,templateId:process.env.WECHAT_TEMPLATE_ID??''};
}
let tokenCache:{value:string;expires:number}|undefined;
export async function sendWechat(openid:string,title:string){
  if(!process.env.WECHAT_TEMPLATE_ID)throw new Error('缺少微信订阅模板');
  if(!tokenCache||tokenCache.expires<Date.now()){
    const url=new URL('https://api.weixin.qq.com/cgi-bin/token');url.search=new URLSearchParams({grant_type:'client_credential',appid:process.env.WECHAT_APP_ID??'',secret:process.env.WECHAT_APP_SECRET??''}).toString();
    const response=await fetch(url,{signal:AbortSignal.timeout(15000),cache:'no-store'}),result=await response.json();if(!result.access_token)throw new Error('微信 access_token 获取失败');
    tokenCache={value:result.access_token,expires:Date.now()+(result.expires_in-120)*1000};
  }
  // Template field names must match the exact template approved for the account.
  const fields=JSON.parse(process.env.WECHAT_TEMPLATE_FIELDS??'{"thing1":"title","date2":"date","thing3":"notice"}');
  const values:Record<string,string>={title:title.slice(0,20),date:new Date(Date.now()+8*3600_000).toISOString().slice(0,10),notice:'自定义客观指标触发，请查看详情'};
  const data=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{value:values[String(value)]??String(value)}]));
  const response=await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(tokenCache.value)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({touser:openid,template_id:process.env.WECHAT_TEMPLATE_ID,page:'pages/index/index',data,miniprogram_state:process.env.WECHAT_MINIPROGRAM_STATE??'formal'}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(result.errcode)throw new Error(`微信订阅通知失败 ${result.errcode}`);
}
