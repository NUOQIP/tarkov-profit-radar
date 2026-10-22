import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createImageHandler} from './image-cache.mjs';
import {mediaUrl} from './media.mjs';
const name='5d1b392c86f77425243e98fe-icon.webp',path='/media/v1/'+name;
const image=readFileSync(new URL('../public/fence.webp',import.meta.url));
const memoryStore=()=>{const data=new Map();return {data,read:async key=>data.get(key)||null,write:async(key,value)=>data.set(key,value)};};
const request=(handler,headers={},method='GET',url=path)=>handler({method,headers},new URL(url,'https://radar.test'));
test('image URLs allow fixed upstream asset names and reject foreign hosts or traversal',()=>{
  assert.equal(mediaUrl('https://assets.tarkov.dev/'+name),path);
  assert.equal(mediaUrl('https://assets.tarkov.dev/station-workbench.png'),'/media/v1/station-workbench.png');
  for(const input of ['https://evil.test/'+name,'http://assets.tarkov.dev/'+name,'https://assets.tarkov.dev:444/'+name,'https://user:password@assets.tarkov.dev/'+name,'https://assets.tarkov.dev/a/b.png','https://assets.tarkov.dev/'+name+'?v=1'])assert.equal(mediaUrl(input),'');
});
test('concurrent image loads share one fetch, persist across restart and use ETag without image gzip',async()=>{
  const store=memoryStore();let fetched=0;
  const fetchImage=async(url,options)=>{fetched++;assert.equal(url,'https://assets.tarkov.dev/'+name);assert.equal(options.redirect,'error');await new Promise(resolve=>setTimeout(resolve,5));return new Response(image,{headers:{'Content-Type':'image/webp'}});};
  const handler=createImageHandler(store,{fetchImage});
  const responses=await Promise.all(Array.from({length:12},()=>request(handler)));
  assert.equal(fetched,1);for(const response of responses)assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
  const first=await request(handler);assert.match(first.headers.get('cache-control'),/max-age=2592000/);assert(!first.headers.has('content-encoding'));
  const cached=await request(handler,{'if-none-match':first.headers.get('etag')});assert.equal(cached.status,304);assert.equal(await cached.text(),'');
  const restarted=createImageHandler(store,{fetchImage:()=>{throw new Error('Network offline');}});
  assert.deepEqual(Buffer.from(await(await request(restarted)).arrayBuffer()),image);
});
test('old cached images remain usable while upstream is unavailable; invalid images are not cached',async()=>{
  const store=memoryStore();let now=1000;
  const original=createImageHandler(store,{now:()=>now,fetchImage:async()=>new Response(image,{headers:{'Content-Type':'image/webp'}})});await request(original);
  now+=8*86400000;const stale=createImageHandler(store,{now:()=>now,fetchImage:async()=>{throw new Error('Offline');}});
  assert.deepEqual(Buffer.from(await(await request(stale)).arrayBuffer()),image);
  const invalid=memoryStore(),handler=createImageHandler(invalid,{fetchImage:async()=>new Response('<html>not an image</html>',{headers:{'Content-Type':'text/html'}})});
  const failed=await request(handler);assert.equal(failed.status,502);assert.equal(failed.headers.get('cache-control'),'no-store');assert.equal(invalid.data.size,0);
  assert.equal((await request(handler,{},'GET','/media/v1/%2e%2e%2fadmin.png')).status,404);
  assert.equal((await request(handler,{},'POST')).status,404);
});
test('a cold grid bounds upstream image concurrency instead of flooding the collector',async()=>{
  let active=0,peak=0;
  const handler=createImageHandler(memoryStore(),{fetchImage:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,8));active--;return new Response(image,{headers:{'Content-Type':'image/webp'}});}});
  const images=await Promise.all(Array.from({length:24},(_,index)=>request(handler,{},'GET','/media/v1/station-'+index+'.png')));
  assert.equal(images.filter(image=>image.status===200).length,24);assert(peak<=8);assert(peak>1);
});

test('failed image fetches cool down, then recover without losing conditional or HEAD metadata',async()=>{
  let now=1000,calls=0,online=false;
  const handler=createImageHandler(memoryStore(),{now:()=>now,fetchImage:async()=>{calls++;if(!online)throw new Error('offline');return new Response(image,{headers:{'Content-Type':'image/webp'}});}});
  const first=await request(handler);assert.equal(first.status,502);assert.equal(first.headers.get('retry-after'),'15');
  for(let n=0;n<10;n++)assert.equal((await request(handler)).status,502);assert.equal(calls,1);
  now+=15001;online=true;const recovered=await request(handler);assert.equal(recovered.status,200);assert.equal(calls,2);
  const head=await request(handler,{},'HEAD');assert.equal(head.headers.get('content-length'),String(image.length));assert.equal(await head.text(),'');
  const conditional=await request(handler,{'if-none-match':'"older", W/'+recovered.headers.get('etag')});assert.equal(conditional.status,304);
});

test('binary-labelled raster images are typed from their bytes; fake image and binary bodies are never cached',async()=>{
  for(const declared of ['binary/octet-stream','application/octet-stream']){
    const store=memoryStore(),handler=createImageHandler(store,{fetchImage:async()=>new Response(image,{headers:{'Content-Type':declared}})});
    const response=await request(handler);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);assert.equal(store.data.size,1);
  }
  for(const declared of ['image/jpeg','application/octet-stream']){
    const store=memoryStore(),handler=createImageHandler(store,{fetchImage:async()=>new Response('<html>error page</html>',{headers:{'Content-Type':declared}})});
    assert.equal((await request(handler)).status,502);assert.equal(store.data.size,0);
  }
});

test('a corrupt disk image is replaced instead of being served as a long-lived broken cache entry',async()=>{
  const store=memoryStore();store.data.set('media/'+name+'.json',{at:Date.now(),type:'image/webp',etag:'"broken"',data:Buffer.from('not an image').toString('base64')});
  let calls=0;const handler=createImageHandler(store,{fetchImage:async()=>{calls++;return new Response(image,{headers:{'Content-Type':'image/webp'}});}});
  const response=await request(handler);assert.equal(response.status,200);assert.equal(calls,1);assert.notEqual(response.headers.get('etag'),'"broken"');
});
