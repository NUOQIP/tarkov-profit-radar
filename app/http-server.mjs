import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { handleApi } from './data-service.mjs';
const zip=promisify(gzip);

export function createRadarServer(store,files) {
  const assets=new Map(),compressed=new Map(),clients=new Map();
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost'),now=Date.now(),ip=req.socket.remoteAddress;
      const rate=clients.get(ip);
      if(!rate||now-rate.at>60000)clients.set(ip,{at:now,count:1});
      else if(++rate.count>300){res.writeHead(429,{'Retry-After':'60'});return res.end('Too many requests');}
      if(clients.size>2000)for(const [key,entry] of clients)if(now-entry.at>60000||clients.size>2000)clients.delete(key);
      let body,status=200,headers;
      if(files.has(url.pathname)&&['GET','HEAD'].includes(req.method)){
        const [path,type]=files.get(url.pathname),info=await stat(path);let asset=assets.get(path);
        if(!asset||asset.modified!==info.mtimeMs){body=await readFile(path);asset={body,modified:info.mtimeMs,etag:'"'+createHash('sha256').update(body).digest('hex').slice(0,24)+'"'};assets.set(path,asset);}
        headers={'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','ETag':asset.etag};body=asset.body;
        if(req.headers['if-none-match']===asset.etag){status=304;body=null;}
      }else{
        const response=await handleApi(new Request(url,{method:req.method,headers:req.headers}),store,{waitUntil:promise=>promise.catch(error=>console.error('Background refresh:',error.message))});
        status=response.status;headers=Object.fromEntries(response.headers);body=Buffer.from(await response.arrayBuffer());
      }
      headers['X-Content-Type-Options']='nosniff';headers['Referrer-Policy']='strict-origin-when-cross-origin';
      headers['Vary']='Accept-Encoding';
      if(body?.length>1024&&/\bgzip\b/.test(req.headers['accept-encoding']||'')&&status===200){
        const tag=headers.ETag||headers.etag,key=tag&&url.pathname+tag;
        let packed=key&&compressed.get(key);
        if(!packed){packed=await zip(body);if(key){compressed.set(key,packed);while(compressed.size>24)compressed.delete(compressed.keys().next().value);}}
        body=packed;headers['Content-Encoding']='gzip';
      }
      if(body&&status!==304)headers['Content-Length']=body.length;
      res.writeHead(status,headers);res.end(req.method==='HEAD'||status===304?undefined:body);
    }catch(error){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'服务暂时不可用'}));console.error(error.message);}
  });
  server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  return server;
}
