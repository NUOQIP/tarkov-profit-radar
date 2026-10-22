import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzip,brotliCompress,constants } from 'node:zlib';
import { promisify } from 'node:util';
import { isIP } from 'node:net';
import { handleApi } from './data-service.mjs';
const zip=promisify(gzip),brotli=promisify(brotliCompress);
export function acceptedEncoding(header=''){
  const choices=new Map();
  for(const part of header.toLowerCase().split(',')){
    const [name,...params]=part.trim().split(';'),quality=params.find(p=>p.trim().startsWith('q='));
    const q=quality?Number(quality.trim().slice(2)):1;
    choices.set(name,Number.isFinite(q)&&q>=0&&q<=1?q:0);
  }
  const br=choices.get('br')??choices.get('*')??0,gz=choices.get('gzip')??choices.get('*')??0;
  return br>0&&br>=gz?'br':gz>0?'gzip':null;
}
export function matchesEtag(header,etag){
  return typeof header==='string'&&header.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag.replace(/^W\//,''));
}

export function clientAddress(request,trustLoopbackProxy=false) {
  const peer=request.socket.remoteAddress||'unknown',forwarded=request.headers['x-real-ip'];
  const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);
  return trustLoopbackProxy&&loopback&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:peer;
}

export function secureRequest(request,trustLoopbackProxy=false) {
  return Boolean(request.socket.encrypted||(trustLoopbackProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress)&&request.headers['x-forwarded-proto']==='https'));
}

export function createRadarServer(store,files,{trustLoopbackProxy=false,adminHandler,accountHandler,commentsHandler,imageHandler}={}) {
  const assets=new Map(),publicBodies=new Map(),compressed=new Map(),compressing=new Map(),clients=new Map();let compressedBytes=0,publicBytes=0;
  function jsonResponse(text,status,headers){
    const control=headers['Cache-Control']||headers['cache-control']||'',tag=headers.ETag||headers.etag,key=status===200&&tag&&/public/.test(control)&&!/private|no-store/i.test(control)?tag:null;
    let body=key&&publicBodies.get(key);
    if(body){publicBodies.delete(key);publicBodies.set(key,body);}
    else{
      body=Buffer.from(text);
      if(key){
        publicBodies.set(key,body);publicBytes+=body.length;
        while(publicBytes>48*1024*1024||publicBodies.size>96){const oldest=publicBodies.keys().next().value;publicBytes-=publicBodies.get(oldest).length;publicBodies.delete(oldest);}
      }
    }
    return {body,status,headers};
  }
  async function encode(body,encoding,key){
    const hit=key&&compressed.get(key);
    if(hit){compressed.delete(key);compressed.set(key,hit);return hit;}
    if(key&&compressing.has(key))return compressing.get(key);
    const work=(async()=>{
      const packed=encoding==='br'?await brotli(body,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}):await zip(body);
      if(key){
        compressed.set(key,packed);compressedBytes+=packed.length;
        while(compressedBytes>16*1024*1024||compressed.size>64){
          const oldest=compressed.keys().next().value;compressedBytes-=compressed.get(oldest).length;compressed.delete(oldest);
        }
      }
      return packed;
    })().finally(()=>{if(key)compressing.delete(key);});
    if(key)compressing.set(key,work);return work;
  }
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost'),now=Date.now(),ip=clientAddress(req,trustLoopbackProxy);
      const media=url.pathname.startsWith('/media/'),clientKey=ip+(media?':media':':api'),rate=clients.get(clientKey);
      if(!rate||now-rate.at>60000)clients.set(clientKey,{at:now,count:1});
      else if(++rate.count>(media?1000:300)){res.writeHead(429,{'Retry-After':'60'});return res.end('Too many requests');}
      if(clients.size>2000)for(const [key,entry] of clients)if(now-entry.at>60000||clients.size>2000)clients.delete(key);
      let body,status=200,headers;
      const context={ip,secure:secureRequest(req,trustLoopbackProxy)};
      const directResponse=(adminHandler&&await adminHandler(req,url,context))||(accountHandler&&await accountHandler(req,url,context))||(commentsHandler&&await commentsHandler(req,url,context))||(imageHandler&&await imageHandler(req,url,context));
      if(directResponse){
        status=directResponse.status;headers=Object.fromEntries(directResponse.headers);body=Buffer.from(await directResponse.arrayBuffer());
        if(directResponse.headers.getSetCookie?.().length)headers['set-cookie']=directResponse.headers.getSetCookie();
        req.resume();
      }else if(files.has(url.pathname)&&['GET','HEAD'].includes(req.method)){
        const [path,type,options={}]=files.get(url.pathname),assetKey=path||url.pathname;let asset=assets.get(assetKey);
        if(!asset||(!options.immutable&&!options.body&&now-asset.checkedAt>=1000)){
          const info=options.body?null:await stat(path);
          if(!asset||asset.modified!==info?.mtimeMs){
            const content=options.body||await readFile(path);
            asset={body:content,modified:info?.mtimeMs,etag:'W/"'+createHash('sha256').update(content).digest('hex').slice(0,24)+'"'};
          }
          asset.checkedAt=now;assets.set(assetKey,asset);
        }
        headers={'content-type':type+(type.startsWith('image/')?'':'; charset=utf-8'),
          'cache-control':options.immutable?'public, max-age=31536000, immutable':type.startsWith('image/')?'public, max-age=2592000, stale-while-revalidate=31536000':'no-cache',etag:asset.etag};body=asset.body;
        if(matchesEtag(req.headers['if-none-match'],asset.etag)){status=304;body=null;}
      }else{
        const response=await handleApi(new Request(url,{method:req.method,headers:req.headers}),store,{jsonResponse,waitUntil:promise=>promise.catch(error=>console.error('Background refresh:',error.message))});
        status=response.status;
        if(response instanceof Response){headers=Object.fromEntries(response.headers);body=Buffer.from(await response.arrayBuffer());}
        else{headers=response.headers;body=response.body;}
      }
      headers=Object.fromEntries(Object.entries(headers).map(([key,value])=>[key.toLowerCase(),value]));
      headers['x-content-type-options']='nosniff';headers['referrer-policy']='strict-origin-when-cross-origin';
      headers['x-frame-options']='DENY';
      if(url.pathname==='/admin'||url.pathname.startsWith('/admin/')){
        headers['cache-control']='no-store';headers['x-frame-options']='DENY';
        headers['content-security-policy']="default-src 'self'; img-src 'self' https:; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
        headers['referrer-policy']='no-referrer';headers['x-robots-tag']='noindex, nofollow';
      }
      headers.vary=[...new Set((headers.vary||'').split(',').map(v=>v.trim()).filter(Boolean).concat('Accept-Encoding'))].join(', ');
      const encoding=acceptedEncoding(req.headers['accept-encoding']);
      if(body?.length>1024&&encoding&&status===200&&/^(?:text\/|application\/(?:json|javascript))/.test(headers['content-type']||'')&&!headers['content-encoding']){
        const tag=headers.etag,key=tag&&!/no-store|private/i.test(headers['cache-control']||'')?url.pathname+url.search+'|'+tag+'|'+encoding:null;
        body=await encode(body,encoding,key);headers['content-encoding']=encoding;
      }
      if(body&&status!==304&&!(req.method==='HEAD'&&headers['content-length']))headers['content-length']=body.length;
      res.writeHead(status,headers);res.end(req.method==='HEAD'||status===304?undefined:body);
    }catch(error){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'服务暂时不可用'}));console.error(error.message);}
  });
  server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  return server;
}
