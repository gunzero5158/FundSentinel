import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {mkdir,readFile,writeFile,rename,open,unlink,stat} from 'node:fs/promises';
import path from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {emptyWorkspace,Workspace,Channel,fundMetrics,digest,freshDigest} from './domain';

export const cloud=()=>!!process.env.NEXT_PUBLIC_SUPABASE_URL;
export function admin(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('请配置 Supabase URL 与服务角色密钥');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function identify(request:Request):Promise<string>{
  if(cloud()){
    const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)throw new HttpError(401,'请先登录');
    const {data,error}=await admin().auth.getUser(token);if(error||!data.user)throw new HttpError(401,'登录已过期');
    // Optional allowlist: open email sign-up otherwise lets anyone spend the Vision quota. WeChat accounts are server-created.
    const allowed=(process.env.ALLOWED_EMAILS??'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean),email=(data.user.email??'').toLowerCase();
    if(allowed.length&&!allowed.includes(email)&&!email.endsWith('@fundsentinel.invalid'))throw new HttpError(403,'此账号未获授权使用');
    return data.user.id;
  }
  // A Host header is insufficient: forbid local mode in hosted production and require loopback URL + Host.
  const url=new URL(request.url),host=request.headers.get('host')??'';
  if(process.env.VERCEL || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))throw new HttpError(503,'公开部署必须配置 Supabase 登录与数据库');
  // A reverse proxy or tunnel may rewrite Host to loopback; a non-loopback client or host in its forwarding headers,
  // or a public Referer, gives it away. Next.js itself fills x-forwarded-* with the local socket values.
  const loopback=(v:string)=>/^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|::ffff:127\.\d+\.\d+\.\d+)(:\d+)?$/.test(v.trim());
  const proxied=['x-forwarded-for','x-forwarded-host','x-real-ip','cf-connecting-ip','true-client-ip'].some(h=>(request.headers.get(h)??'').split(',').some(v=>v.trim()&&!loopback(v)))||request.headers.has('forwarded');
  const referer=request.headers.get('referer');let foreign=false;try{foreign=!!referer&&!loopback(new URL(referer).host);}catch{foreign=true;}
  if(proxied||foreign)throw new HttpError(503,'检测到经代理或公网访问；本地模式仅限本机浏览器，公开访问请配置 Supabase 登录');
  return 'local';
}
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
const fundVersion=(f:Workspace['funds'][string])=>`${f.fetchedAt}|${f.history.length}|${f.history.at(-1)?.date}`;
const dataPath=()=>path.join(process.cwd(),'data','workspace.json');
function seal(channels:Channel[]):string{
  if(!channels.length)return '';
  const hex=process.env.CHANNEL_ENCRYPTION_KEY;if(!hex||!/^[a-f0-9]{64}$/i.test(hex))throw new Error('配置通知前请设置 32 字节 CHANNEL_ENCRYPTION_KEY');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(hex,'hex'),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(channels),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64')).join('.');
}
function unseal(value:string):Channel[]{
  if(!value)return [];
  const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64'));
  const key=process.env.CHANNEL_ENCRYPTION_KEY;if(!key)throw new Error('缺少通知解密密钥');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'));
}
// Fund versions as loaded, so a save only writes NAV histories that actually changed (each can be hundreds of KB).
const loadedFunds=new WeakMap<Workspace,Map<string,string>>();
export async function load(user:string):Promise<Workspace>{
  if(cloud()){
    const {data,error}=await admin().rpc('load_workspace',{p_user:user});if(error)throw new Error(error.message);
    if(!data)return emptyWorkspace();
    const channels=unseal(data.encrypted_channels??'');delete data.encrypted_channels;
    const w:Workspace={...emptyWorkspace(),...data,channels};
    // A fund written without a current digest (e.g. by the Python monitor) arrives in full once; digest it and store
    // the digest so later loads only receive the tail. The write is guarded by fetchedAt and is safe to repeat.
    for(const f of Object.values(w.funds))if(!f.partial&&!freshDigest(f)){
      f.stats=digest(f);const {error}=await admin().rpc('set_fund_stats',{p_code:f.code,p_stats:f.stats});if(error)console.error('set_fund_stats',f.code,error.message);
    }
    loadedFunds.set(w,new Map(Object.entries(w.funds).map(([code,f])=>[code,fundVersion(f)])));
    return w;
  }
  try{return {...emptyWorkspace(),...JSON.parse(await readFile(dataPath(),'utf8'))};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return emptyWorkspace();throw e;}
}
export async function save(user:string,w:Workspace,expected:number):Promise<void>{
  if(cloud()){
    const {channels,...rest}=w,loaded=loadedFunds.get(w);
    // Never write a loaded tail back over the full history; written funds carry their digest.
    const funds=Object.fromEntries(Object.entries(w.funds).filter(([code,f])=>!f.partial&&loaded?.get(code)!==fundVersion(f)).map(([code,f])=>[code,{...f,stats:freshDigest(f)??digest(f)}]));
    const {error}=await admin().rpc('commit_workspace',{p_user:user,p_expected:expected,p_workspace:{...rest,funds,encrypted_channels:seal(channels)}});
    if(error)throw new HttpError(error.message.includes('revision conflict')?409:500,error.message);
    w.revision=expected+1;loadedFunds.set(w,new Map(Object.entries(w.funds).map(([code,f])=>[code,fundVersion(f)])));return;
  }
  await mkdir(path.dirname(dataPath()),{recursive:true});
  const lockPath=dataPath()+'.lock';let lock;
  for(let i=0;i<40;i++){
    try{lock=await open(lockPath,'wx');break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
      // A save holds the lock for milliseconds; an old lock was left by a killed process and would block saving forever.
      const age=await stat(lockPath).then(s=>Date.now()-s.mtimeMs).catch(()=>0);if(age>30_000){await unlink(lockPath).catch(()=>{});continue;}
      await new Promise(r=>setTimeout(r,50));}
  }
  if(!lock)throw new HttpError(409,'另一项任务正在保存，请稍后重试');
  const temp=dataPath()+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
    const current=await load(user);if(current.revision!==expected)throw new HttpError(409,'数据已被另一项操作更新，请刷新后重试');
    w.revision=expected+1;await writeFile(temp,JSON.stringify(w),{encoding:'utf8',mode:0o600});await rename(temp,dataPath());
  }finally{await lock.close();await unlink(lockPath);await unlink(temp).catch(()=>{});}
}
export function publicWorkspace(w:Workspace){
  const windows=[...new Set([252,60,1260,...w.rules.map(r=>r.window)])];
  const funds=Object.fromEntries(Object.entries(w.funds).map(([code,f])=>{
    const summaries=Object.fromEntries(windows.flatMap(window=>[0,3,5].map(years=>[`${window}:${years}`,fundMetrics(f,window,years)])));
    const p=w.positions.find(p=>p.code===code);
    if(p)summaries.sinceAdded=fundMetrics({...f,history:f.history.filter(h=>h.date>=p.addedAt),summaries:undefined,stats:undefined},1_000_000);
    // Full-resolution histories remain in the database. Downsample only chart transport,
    // preserving the latest two daily points and full-series precomputed risk metrics.
    const step=Math.max(1,Math.ceil(f.history.length/398));
    const history=freshDigest(f)?.chart??f.history.filter((_,i)=>i%step===0||i>=f.history.length-2);
    return [code,{...f,history,summaries,stats:undefined,partial:undefined}];
  }));
  return {...w,funds,channels:w.channels.map(c=>({...c,endpoint:'••••••（已保存）'}))};
}
