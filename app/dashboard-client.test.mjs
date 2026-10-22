import test from 'node:test';
import assert from 'node:assert/strict';
import {createDashboardClient,browserDashboardStore} from './dashboard-client.mjs';
const fixture=(market='pve',price=50000)=>({version:2,modelVersion:'test-model',market,snapshot:{market,items:{bulb:{price}}},signals:{entries:{}},ledger:[]});
const storage=()=>{const entries=new Map();return {entries,read:async key=>structuredClone(entries.get(key)),write:async(key,value)=>entries.set(key,structuredClone(value))};};
test('a repeat visit reuses the public bundle and validates with ETag without account cookies',async()=>{
  const store=storage(),requests=[];let count=0;
  const options={store,modelVersion:'test-model',fetcher:async(url,settings)=>{requests.push([url,settings]);return ++count===1?Response.json(fixture(),{headers:{ETag:'W/"one"'}}):new Response(null,{status:304});}};
  const first=createDashboardClient(options),value=await first.load('pve');await new Promise(resolve=>setImmediate(resolve));
  const next=createDashboardClient(options);assert.deepEqual(await next.read('pve'),value);assert.deepEqual(await next.load('pve'),value);
  assert.equal(requests[1][1].headers['If-None-Match'],'W/"one"');assert.equal(requests[1][1].credentials,'omit');
  assert.deepEqual(Object.keys(store.entries.get('pve')).sort(),['etag','savedAt','value']);
});
test('cache rejects wrong markets, incompatible models, future timestamps and old entries',async()=>{
  const now=1700000000000;
  for(const entry of [{value:fixture('regular'),savedAt:now},{value:{...fixture(),modelVersion:'old'},savedAt:now},{value:fixture(),savedAt:now+1},{value:fixture(),savedAt:now-86400000}]){
    const client=createDashboardClient({store:{read:async()=>entry},now:()=>now,modelVersion:'test-model'});
    assert.equal(await client.read('pve'),null);
  }
});
test('a late disk read cannot overwrite newer prices and failed persistence cannot block market display',async()=>{
  let release;const disk=new Promise(resolve=>{release=resolve;});
  const client=createDashboardClient({store:{read:()=>disk,write:async()=>{throw new Error('quota');}},fetcher:async()=>Response.json(fixture('pve',60000))});
  const loading=client.read('pve');await new Promise(resolve=>setImmediate(resolve));
  const current=await client.load('pve');release({value:fixture('pve',40000),savedAt:Date.now()});
  assert.equal((await loading).snapshot.items.bulb.price,60000);assert.equal((await client.read('pve')),current);
});
test('offline recovery retains the last bundle; an unexpected 304 without a bundle retries unconditionally',async()=>{
  const store=storage(),value=fixture();store.entries.set('pve',{value,savedAt:Date.now(),etag:'"known"'});
  const offline=createDashboardClient({store,fetcher:async()=>{throw new Error('offline');}});assert.deepEqual(await offline.read('pve'),value);
  await assert.rejects(offline.load('pve'),/offline/);assert.deepEqual(await offline.read('pve'),value);
  let count=0;const retry=createDashboardClient({store,fetcher:async()=>++count===1?new Response(null,{status:304}):Response.json(value)});
  assert.deepEqual(await retry.load('pve'),value);assert.equal(count,2);
  assert.equal(await browserDashboardStore(null).read('pve'),null);
});
