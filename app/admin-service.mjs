import { readFile } from 'node:fs/promises';
import { MARKETS,CATEGORIES,isEventItem } from './model.mjs';
import { itemRarity } from './loot-priority.mjs';
import { dashboard } from './data-service.mjs';
import { readSptStatus } from './spt-upstream.mjs';
import { readItemOverrides,saveItemOverride,applyItemOverrides } from './item-overrides.mjs';
import { verifyPassword,secretToken,secretDigest } from './admin-auth.mjs';

const SESSION_MS=8*3600000,COOKIE='radar-admin',loopback=ip=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
const fail=(status,message)=>Object.assign(new Error(message),{status});
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
function bodyJSON(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'请使用 JSON 请求');
  if(Number(req.headers['content-length']||0)>4096)throw fail(413,'请求过大');
  return new Promise((resolve,reject)=>{
    let size=0,chunks=[];
    const done=(error,value)=>{clearTimeout(timer);req.off('data',onData);req.off('end',onEnd);req.off('error',onError);if(error){req.resume();reject(error);}else resolve(value);};
    const onData=chunk=>{size+=chunk.length;if(size>4096)done(fail(413,'请求过大'));else chunks.push(chunk);};
    const onEnd=()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();done(null,value);}catch{done(fail(400,'请求格式错误'));}};
    const onError=()=>done(fail(400,'请求中断'));
    const timer=setTimeout(()=>done(fail(408,'请求超时')),5000);timer.unref();
    req.on('data',onData);req.on('end',onEnd);req.on('error',onError);
  });
}
function accessContext(req,{ip,secure},configuredOrigin){
  const origin=new URL(`${secure?'https:':'http:'}//${req.headers.host}`).origin;
  const hostname=new URL(origin).hostname;
  const local=loopback(ip)&&['localhost','127.0.0.1','[::1]'].includes(hostname);
  if(!secure&&!local)throw fail(403,'管理端需要 HTTPS，或通过本机 SSH 转发访问');
  if(configuredOrigin&&origin!==configuredOrigin&&!local)throw fail(403,'管理入口不匹配');
  if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin)throw fail(403,'请求来源不匹配，请从管理页面操作');
  return {origin,secure};
}
const cookie=(token,secure,age=SESSION_MS/1000)=>`${COOKIE}=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
export function createAdminHandler(store,{credentialFile,origin,readCredential,comments,mail}={}){
  const sessions=new Map(),attempts=new Map();let globalAttempts={at:0,count:0};
  const credentials=readCredential||(async()=>{try{return JSON.parse(await readFile(credentialFile,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}});
  return async(req,url,context)=>{
    if(!url.pathname.startsWith('/admin/api/'))return null;
    try{
      const transport=accessContext(req,context,origin),now=Date.now();
      const credential=await credentials(),stamp=credential?secretDigest(JSON.stringify(credential)):null;
      const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
      const key=/^[A-Za-z0-9_-]{43}$/.test(raw||'')?secretDigest(raw):null;
      let session=key?sessions.get(key):null;
      if(session&&(session.expires<=now||session.stamp!==stamp)){sessions.delete(key);session=null;}
      if(req.method==='GET'&&url.pathname==='/admin/api/session')return json({authenticated:Boolean(session),configured:Boolean(credential),...(session?{csrf:session.csrf}:{})});
      if(!credential)return json({error:'请先在服务器设置管理员密码'},503);
      if(req.method==='POST'&&url.pathname==='/admin/api/login'){
        for(const [k,v] of attempts)if(now-v.at>15*60000)attempts.delete(k);
        if(attempts.size>2000)return json({error:'登录繁忙，请稍后再试'},429,{'Retry-After':'900'});
        if(now-globalAttempts.at>60000)globalAttempts={at:now,count:0};
        const attempt=attempts.get(context.ip)||{at:now,count:0};
        if(attempt.count>=5||globalAttempts.count>=30)return json({error:'尝试次数过多，请稍后再试'},429,{'Retry-After':'900'});
        attempt.count++;attempts.set(context.ip,attempt);globalAttempts.count++;
        const body=await bodyJSON(req);
        if(!await verifyPassword(body.password,credential))return json({error:'密码不正确'},401);
        attempts.delete(context.ip);
        for(const [k,v] of sessions)if(v.expires<=now)sessions.delete(k);
        while(sessions.size>=50)sessions.delete(sessions.keys().next().value);
        if(key)sessions.delete(key);
        const token=secretToken(),csrf=secretToken();sessions.set(secretDigest(token),{csrf,stamp,expires:now+SESSION_MS});
        return json({authenticated:true,csrf},200,{'Set-Cookie':cookie(token,transport.secure)});
      }
      if(!session)return json({error:'请先登录'},401);
      if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==session.csrf)return json({error:'页面验证已失效，请刷新后重试'},403);
      if(req.method==='POST'&&url.pathname==='/admin/api/logout'){
        sessions.delete(key);return json({ok:true},200,{'Set-Cookie':cookie('',transport.secure,0)});
      }
      if(url.pathname==='/admin/api/mail'&&mail){
        if(req.method==='GET')return json(await mail.status());
        if(req.method==='PUT')return json(await mail.save(await bodyJSON(req)));
      }
      if(url.pathname==='/admin/api/mail/verify'&&req.method==='POST'&&mail)return json(await mail.verify());
      if(req.method==='GET'&&url.pathname==='/admin/api/comments'){
        if(!comments)return json({error:'评论暂不可用'},503);
        return json(comments.list({moderation:true,q:url.searchParams.get('q'),cursor:url.searchParams.get('cursor')}));
      }
      const commentMatch=url.pathname.match(/^\/admin\/api\/comments\/(\d+)$/);
      if(req.method==='PATCH'&&commentMatch){
        if(!comments)return json({error:'评论暂不可用'},503);
        const body=await bodyJSON(req);
        if(Object.keys(body).some(k=>k!=='hidden'))throw fail(400,'评论设置无效');
        return json(comments.moderate(Number(commentMatch[1]),body.hidden));
      }
      if(req.method==='GET'&&url.pathname==='/admin/api/overview'){
        const config=await readItemOverrides(store);
        const markets=await Promise.all(Object.keys(MARKETS).map(async market=>{
          const ready=await store.read(`dashboard/${market}.json`);
          return {market,label:MARKETS[market],fetchedAt:ready?.snapshot?.fetchedAt||null,items:Object.keys(ready?.snapshot?.items||{}).length,warning:ready?.snapshot?.warning||null};
        }));
        return json({markets,modified:Object.keys(config.items).length,revision:config.revision,audit:config.audit.slice(0,15),upstream:await readSptStatus(store)});
      }
      const market=url.searchParams.get('market')||'pve';
      if(!Object.hasOwn(MARKETS,market))throw fail(400,'未知市场');
      if(req.method==='GET'&&url.pathname==='/admin/api/items'){
        const config=await readItemOverrides(store),data=(await dashboard(store,market)).snapshot,classified=applyItemOverrides(data,config);
        const q=(url.searchParams.get('q')||'').trim().toLocaleLowerCase().slice(0,160),event=url.searchParams.get('event'),changed=url.searchParams.get('modified')==='1';
        const all=Object.values(data.items).filter(i=>{
          if(q&&![i.id,i.name,i.shortName,i.english].some(x=>String(x||'').toLocaleLowerCase().includes(q)))return false;
          if(changed&&!config.items[i.id])return false;
          return !['true','false'].includes(event)||isEventItem(classified.items[i.id])===(event==='true');
        }).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));
        const pages=Math.max(1,Math.ceil(all.length/40)),page=Math.min(pages,Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)));
        const items=all.slice((page-1)*40,page*40).map(i=>({id:i.id,name:i.name,english:i.english,image:i.image,category:CATEGORIES[i.category]||'其他',
          original:{eventOnly:isEventItem(i),rarity:itemRarity(i).key},
          effective:{eventOnly:isEventItem(classified.items[i.id]),rarity:itemRarity(classified.items[i.id]).key},
          override:config.items[i.id]||null,baseItem:i.baseItem||null}));
        return json({market,revision:config.revision,total:all.length,page,pages,items});
      }
      const match=url.pathname.match(/^\/admin\/api\/items\/([a-f0-9]{24})$/);
      if(req.method==='PATCH'&&match){
        const data=(await dashboard(store,market)).snapshot;
        if(!data.items[match[1]])throw fail(404,'未找到物品');
        const body=await bodyJSON(req);
        if(Object.keys(body).some(k=>!['revision','eventOnly','rarity'].includes(k)))throw fail(400,'不支持的修改字段');
        const saved=await saveItemOverride(store,match[1],{eventOnly:body.eventOnly,rarity:body.rarity},body.revision);
        return json({ok:true,revision:saved.revision});
      }
      return json({error:'管理接口不存在'},404);
    }catch(error){return json({error:error.status?error.message:'管理服务暂时不可用'},error.status||500);}
  };
}
