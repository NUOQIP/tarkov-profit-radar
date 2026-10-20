import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi,dashboard,scanSignals } from './data-service.mjs';
import { compactSnapshot,makeDashboard } from './dashboard.mjs';
import { MODEL_VERSION,sale,analyzeHistorySummary } from './model.mjs';
const now=Date.now(),id='0123456789abcdef01234567';
function fixture(market='pve'){
  return {version:2,modelVersion:MODEL_VERSION,market,fetchedAt:new Date(now).toISOString(),rawCount:1,
    flea:{enabled:true,sellOfferFeeRate:.05,sellRequirementFeeRate:.05},traders:{t:{name:'Therapist'},r:{name:'Ragman'}},stations:{},barters:[],crafts:[],tasks:{},
    items:{[id]:{id,name:'Item',types:[],sourceCategories:[],width:1,height:1,stack:1,basePrice:100000,price:150000,offers:10,scan:new Date(now).toISOString(),buy:[],sell:[{trader:'t',priceRUB:95000,currency:'RUB'},{trader:'r',priceRUB:70000,currency:'RUB'}]}}};
}
function memoryStore(entries=new Map()){
  return {namespace:crypto.randomUUID(),entries,read:async key=>structuredClone(entries.get(key)||null),write:async(key,value)=>entries.set(key,structuredClone(value))};
}
test('transport retains every item and the highest real trader bid with identical net proceeds',()=>{
  const data=fixture(),packed=compactSnapshot(data);
  assert.deepEqual(Object.keys(packed.items),Object.keys(data.items));
  assert.equal(packed.items[id].sell.length,1);
  for(const options of [{intelligence:3,management:0},{intelligence:3,management:51}]){
    const a=sale(data.items[id],data,options,1,now),b=sale(packed.items[id],packed,options,1,now);
    assert.equal(a.net,b.net);assert.equal(a.channel,b.channel);assert.equal(a.fee,b.fee);
  }
  assert.equal(data.items[id].sell.length,2);
});
test('first view upgrades cached history without an upstream scan or chart payload',async()=>{
  const data=fixture(),points=Array.from({length:30},(_,n)=>({priceMin:100000,offerCount:10,timestamp:now-(n+1)*86400000}));
  const store=memoryStore(new Map([['snapshot/pve.json',data],['signals/pve.json',{entries:{[id]:{at:now,points}}}]]));
  const result=await dashboard(store,'pve');
  assert.equal(result.snapshot.items[id].price,150000);
  assert.equal(result.signals.entries[id].points,undefined);
  assert.ok(result.signals.entries[id].summary.daily.length>=29);
  assert.equal(result.ledger.length,0);
  assert.ok(store.entries.has('dashboard/pve.json'));
});
test('dashboard ETag avoids retransmitting unchanged data and isolates markets',async()=>{
  const store=memoryStore();
  for(const market of ['pve','regular'])store.entries.set(`dashboard/${market}.json`,makeDashboard(fixture(market),null,{records:[]},now));
  const first=await handleApi(new Request('http://test/api/dashboard'),store),etag=first.headers.get('etag');
  assert.equal(first.status,200);assert.ok(etag);assert.match(first.headers.get('cache-control'),/max-age=30/);
  const second=await handleApi(new Request('http://test/api/dashboard',{headers:{'If-None-Match':etag}}),store);
  assert.equal(second.status,304);assert.equal(await second.text(),'');
  const other=await handleApi(new Request('http://test/api/dashboard?market=regular',{headers:{'If-None-Match':etag}}),store);
  assert.equal(other.status,200);assert.equal((await other.json()).market,'regular');
});
test('a stored dashboard remains readable when background I/O is stalled',async()=>{
  const ready=makeDashboard({...fixture(),fetchedAt:new Date(now-3600000).toISOString()},null,{records:[]},now-3600000);
  const store=memoryStore(new Map([['dashboard/pve.json',ready]]));
  let release;const gate=new Promise(resolve=>{release=resolve;});store.update=()=>gate;
  const tasks=[];
  try{const result=await dashboard(store,'pve',task=>tasks.push(task));assert.equal(result.preparedAt,ready.preparedAt);assert.equal(tasks.length,1);}
  finally{release();await Promise.all(tasks);}
});

test('a warm reader sees a dashboard published by another server after the cache window',async t=>{
  const first=makeDashboard(fixture(),null,{records:[]},now);
  const store=memoryStore(new Map([['dashboard/pve.json',first]]));
  t.mock.method(Date,'now',()=>now);
  assert.equal((await dashboard(store,'pve')).preparedAt,first.preparedAt);
  const next=makeDashboard(fixture(),null,{records:[]},now+1000);
  store.entries.set('dashboard/pve.json',next);
  t.mock.method(Date,'now',()=>now+31000);
  assert.equal((await dashboard(store,'pve')).preparedAt,next.preparedAt);
});
test('expired short-term evidence cannot keep a red tag while current quotes change',()=>{
  const data=fixture(),summary={at:now-7200000,baseline:100000,days:7,reference7:100000,referenceCount:7,priorDay:100000,recent:[[now-1200000,150000],[now-100000,150000]],daily:[]};
  assert.equal(analyzeHistorySummary(summary,data.items[id],data,{intelligence:3},now).short,false);
});
test('the deferred QQ feed is not a public API',async()=>{
  assert.equal((await handleApi(new Request('http://test/api/feed'),memoryStore())).status,404);
});

test('an upstream history failure with an expired fallback leaves neutral evidence without aborting collection',async t=>{
  const data=fixture(),store=memoryStore(new Map([[`history/pve/${id}.json`,{at:now-3*86400000,points:[]}]]));
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('offline');});
  const signals=await scanSignals(store,data,1);
  assert.deepEqual(signals.entries,{});assert.equal(signals.checked,0);
});
