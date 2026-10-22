import test from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'node:http';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';
import { clientAddress,createRadarServer,acceptedEncoding,matchesEtag } from './http-server.mjs';

const request=(peer,header)=>({socket:{remoteAddress:peer},headers:{'x-real-ip':header}});
test('forwarded client addresses require an explicitly trusted loopback proxy',()=>{
  assert.equal(clientAddress(request('127.0.0.1','198.51.100.1')),'127.0.0.1');
  assert.equal(clientAddress(request('203.0.113.1','198.51.100.1'),true),'203.0.113.1');
  assert.equal(clientAddress(request('::ffff:127.0.0.1','198.51.100.1'),true),'198.51.100.1');
  for(const header of ['198.51.100.1, 203.0.113.1','bad-address',undefined]){
    assert.equal(clientAddress(request('127.0.0.1',header),true),'127.0.0.1');
  }
});

test('compression negotiation respects quality and validators accept weak or multiple tags',()=>{
  assert.equal(acceptedEncoding('gzip, br'),'br');assert.equal(acceptedEncoding('br;q=0, gzip;q=.8'),'gzip');
  assert.equal(acceptedEncoding('br;q=.5, gzip;q=1'),'gzip');assert.equal(acceptedEncoding('gzip;q=0'),null);
  assert.equal(acceptedEncoding('br;q=invalid'),null);assert(matchesEtag('"old", W/"value"','"value"'));
  assert(matchesEtag('*','W/"value"'));assert(!matchesEtag('"old"','W/"value"'));
});

test('immutable assets reuse compressed bytes, return empty 304/HEAD, and private responses stay separate',async t=>{
  const content=Buffer.from('/* readable browser bundle */\n'.repeat(3000));
  const files=new Map([['/assets/test.js',[null,'text/javascript',{body:content,immutable:true}]]]);
  const server=createRadarServer({},files,{accountHandler:async(req,url)=>url.pathname==='/api/account/session'?Response.json({marker:req.headers.cookie||'guest',text:'private '.repeat(200)},{headers:{'Cache-Control':'no-store'}}):null});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const origin='http://127.0.0.1:'+server.address().port;
  const raw=(path,headers={},method='GET')=>new Promise((resolve,reject)=>{
    get(origin+path,{headers,method},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));response.on('error',reject);}).on('error',reject);
  });
  const br=await raw('/assets/test.js',{'Accept-Encoding':'br, gzip'});assert.equal(br.headers['content-encoding'],'br');assert.match(br.headers['cache-control'],/immutable/);assert.deepEqual(brotliDecompressSync(br.body),content);
  const gz=await raw('/assets/test.js',{'Accept-Encoding':'gzip'});assert.equal(gz.headers['content-encoding'],'gzip');assert.deepEqual(gunzipSync(gz.body),content);
  const concurrent=await Promise.all(Array.from({length:8},()=>raw('/assets/test.js',{'Accept-Encoding':'br'})));for(const result of concurrent)assert.deepEqual(result.body,br.body);
  const unchanged=await raw('/assets/test.js',{'If-None-Match':br.headers.etag});assert.equal(unchanged.status,304);assert.equal(unchanged.body.length,0);
  const head=await raw('/assets/test.js',{},'HEAD');assert.equal(Number(head.headers['content-length']),content.length);assert.equal(head.body.length,0);
  for(const marker of ['account-a','account-b']){
    const response=await raw('/api/account/session',{Cookie:marker,'Accept-Encoding':'br'});
    assert.equal(response.headers['cache-control'],'no-store');assert.equal(JSON.parse(brotliDecompressSync(response.body)).marker,marker);
  }
});

test('separate visitors behind the configured proxy do not share the request limit',async t=>{
  const server=createRadarServer({},new Map(),{trustLoopbackProxy:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/api/health`;
  async function get(ip){const r=await fetch(url,{headers:{'X-Real-IP':ip}});await r.arrayBuffer();return r.status;}
  for(let i=0;i<300;i++)assert.equal(await get('198.51.100.1'),200);
  assert.equal(await get('198.51.100.1'),429);
  assert.equal(await get('198.51.100.2'),200);
});
