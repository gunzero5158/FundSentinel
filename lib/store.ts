import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {emptyWorkspace,Workspace,Channel,fundMetrics} from './domain';

export const cloud=()=>!!process.env.NEXT_PUBLIC_SUPABASE_URL;
export function admin(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('请配置 Supabase URL 与服务角色密钥');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function identify(request:Request):Promise<string>{
  if(cloud()){
    const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)throw new HttpError(401,'请先登录');
    const {data,error}=await admin().auth.getUser(token);if(error||!data.user)throw new HttpError(401,'登录已过期');return data.user.id;
  }
  // A Host header is insufficient: forbid local mode in hosted production and require loopback URL + Host.
  const url=new URL(request.url),host=request.headers.get('host')??'';
  if(process.env.VERCEL || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))throw new HttpError(503,'公开部署必须配置 Supabase 登录与数据库');
  return 'local';
}
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
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
export async function load(user:string):Promise<Workspace>{
  if(cloud()){
    const {data,error}=await admin().rpc('load_workspace',{p_user:user});if(error)throw new Error(error.message);
    if(!data)return emptyWorkspace();
    const channels=unseal(data.encrypted_channels??'');delete data.encrypted_channels;
    return {...emptyWorkspace(),...data,channels};
  }
  try{return {...emptyWorkspace(),...JSON.parse(await readFile(dataPath(),'utf8'))};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return emptyWorkspace();throw e;}
}
export async function save(user:string,w:Workspace,expected:number):Promise<void>{
  if(cloud()){
    const {channels,...rest}=w;
    const {error}=await admin().rpc('commit_workspace',{p_user:user,p_expected:expected,p_workspace:{...rest,encrypted_channels:seal(channels)}});
    if(error)throw new HttpError(error.message.includes('revision conflict')?409:500,error.message);
    w.revision=expected+1;return;
  }
  await mkdir(path.dirname(dataPath()),{recursive:true});
  const lockPath=dataPath()+'.lock';let lock;
  for(let i=0;i<40;i++){
    try{lock=await open(lockPath,'wx');break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,50));}
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
    if(p)summaries.sinceAdded=fundMetrics({...f,history:f.history.filter(h=>h.date>=p.addedAt),summaries:undefined},1_000_000);
    // Full-resolution histories remain in the database. Downsample only chart transport,
    // preserving the latest two daily points and full-series precomputed risk metrics.
    const step=Math.max(1,Math.ceil(f.history.length/398));
    const history=f.history.filter((_,i)=>i%step===0||i>=f.history.length-2);
    return [code,{...f,history,summaries}];
  }));
  return {...w,funds,channels:w.channels.map(c=>({...c,endpoint:'••••••（已保存）'}))};
}
