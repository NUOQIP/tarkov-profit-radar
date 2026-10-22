import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi,dashboard,scanSignals,history } from './data-service.mjs';
import { compactSnapshot,compactSignals,makeDashboard } from './dashboard.mjs';
import { MODEL_VERSION,CATEGORY_METADATA_VERSION,sale,summarizeHistory,analyzeHistorySummary } from './model.mjs';
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

test('the Node public-buffer adapter retains JSON, cache headers and API errors; other runtimes keep standard Responses',async()=>{
  const store=memoryStore(new Map([['dashboard/pve.json',makeDashboard(fixture(),null,{records:[]})]]));
  const context={jsonResponse:(body,status,headers)=>({body,status,headers})};
  const ready=await handleApi(new Request('http://test/api/dashboard'),store,context);
  assert.equal(ready.status,200);assert.equal(JSON.parse(ready.body).market,'pve');assert.match(ready.headers['Cache-Control'],/public/);
  const missing=await handleApi(new Request('http://test/not-found'),store,context);assert.equal(missing.status,404);assert.equal(missing.headers['Cache-Control'],'no-store');
  assert((await handleApi(new Request('http://test/api/health'),store)) instanceof Response);
});

test('many detail histories cannot evict warm market data; chart validators avoid retransmission',async t=>{
  const ready=makeDashboard(fixture(),null,{records:[]}),store=memoryStore(new Map([['dashboard/pve.json',ready]]));
  const read=store.read;let dashboardReads=0;
  store.read=async key=>{if(key==='dashboard/pve.json')dashboardReads++;return read(key);};
  await dashboard(store,'pve');assert.equal(dashboardReads,1);
  t.mock.method(globalThis,'fetch',async()=>Response.json({data:[{timestamp:now-60000,priceMin:100000,offerCount:10}]}));
  for(let n=0;n<24;n++)await history(store,'pve',n.toString(16).padStart(24,'0'));
  await dashboard(store,'pve');assert.equal(dashboardReads,1);
  const first=await handleApi(new Request('http://test/api/history?id='+id),store),etag=first.headers.get('etag');assert(first.ok);assert.match(first.headers.get('cache-control'),/max-age=60/);
  const unchanged=await handleApi(new Request('http://test/api/history?id='+id,{headers:{'If-None-Match':etag}}),store);assert.equal(unchanged.status,304);
});

test('detail charts serve stored history immediately while one background refresh updates it',async t=>{
  const old={at:now-3600000,market:'pve',id,points:[{timestamp:now-3600000,priceMin:80000,offerCount:10}]},store=memoryStore(new Map([[`history/pve/${id}.json`,old]]));
  let release,calls=0;const gate=new Promise(resolve=>{release=resolve;}),tasks=[];
  t.mock.method(globalThis,'fetch',async()=>{calls++;await gate;return Response.json({data:[{timestamp:now-60000,priceMin:100000,offerCount:10}]});});
  try{
    const first=await history(store,'pve',id,{waitUntil:task=>tasks.push(task)});assert.equal(first.at,old.at);assert(first.warning);
    const second=await history(store,'pve',id,{waitUntil:task=>tasks.push(task)});assert.equal(second.at,old.at);assert.equal(calls,1);
  }finally{release();await Promise.all(tasks);}
  const fresh=await history(store,'pve',id);assert(fresh.at>old.at);assert.equal(fresh.warning,undefined);assert.equal(fresh.points[0].priceMin,100000);
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
test('an old summary without covered daily or hourly history cannot keep a red tag',()=>{
  const data=fixture(),summary={at:now-7200000,baseline:100000,days:7,reference7:100000,referenceCount:7,priorDay:100000,recent:[[now-1200000,150000],[now-100000,150000]],daily:[]};
  assert.equal(analyzeHistorySummary(summary,data.items[id],data,{intelligence:3},now).short,false);
});

test('live scans accumulate without extending the age of the cached daily history',()=>{
  const data=fixture(),points=Array.from({length:7},(_,n)=>({priceMin:100000,offerCount:12,timestamp:now-(n+1)*86400000}));
  const at=now-18*3600000;
  let book=compactSignals({entries:{[id]:{at,summary:summarizeHistory(points,data.items[id],now)}}},data,now);
  data.items[id].scan=new Date(now+20*60000).toISOString();
  book=compactSignals(book,data,now+20*60000);
  assert.equal(book.entries[id].at,at);assert.equal(book.entries[id].summary.at,at);
  assert.equal(analyzeHistorySummary(book.entries[id].summary,data.items[id],data,{},now+20*60000).short,true);
  assert.equal(book.entries[id].summary.recent.filter(p=>p[0]>=now).length,2);
});
test('history scanning refreshes old known items as well as discovering new ones',async t=>{
  t.mock.method(Date,'now',()=>now);
  const data=fixture(),oldId='111111111111111111111111',newId='222222222222222222222222';
  data.items[oldId]={...data.items[id],id:oldId,price:100000,average:100000,change48:-10};
  data.items[newId]={...data.items[id],id:newId,price:100000,average:100000};
  delete data.items[id];
  const points=Array.from({length:7},(_,n)=>({priceMin:100000,offerCount:12,timestamp:now-(n+1)*86400000}));
  const book={entries:{[oldId]:{at:now-18*3600000,summary:summarizeHistory(points,data.items[oldId],now)}}};
  const store=memoryStore(new Map([['signals/pve.json',book]])),requested=[];
  t.mock.method(globalThis,'fetch',async url=>{requested.push(String(url).split('/').at(-1));return {ok:true,json:async()=>({data:points})};});
  const result=await scanSignals(store,data,2);
  assert.deepEqual(requested.sort(),[oldId,newId]);assert.equal(result.entries[oldId].at,now);assert.equal(result.checked,2);
});
test('a weekly rise gets refreshed even with a negative 48h change, while failed fetches back off',async t=>{
  t.mock.method(Date,'now',()=>now);
  const data=fixture(),newId='222222222222222222222222',failedId='333333333333333333333333';
  data.items[id].change48=-10;
  data.items[newId]={...data.items[id],id:newId,change48:0};
  data.items[failedId]={...data.items[id],id:failedId,change48:200};
  const points=Array.from({length:7},(_,n)=>({priceMin:100000,offerCount:12,timestamp:now-(n+1)*86400000}));
  const store=memoryStore(new Map([
    ['signals/pve.json',{entries:{[id]:{at:now-3*3600000,summary:summarizeHistory(points,data.items[id],now)}}}],
    ['signal-scan/pve.json',{attempts:{[failedId]:{at:now-10*60000,failures:2}}}]
  ])),requested=[];
  t.mock.method(globalThis,'fetch',async url=>{requested.push(String(url).split('/').at(-1));return {ok:true,json:async()=>({data:points})};});
  await scanSignals(store,data,2);
  assert.deepEqual(requested,[id,newId]);
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


test('old dashboards reclassify event items without fetching prices or discarding histories',async()=>{
  const data=fixture(),eventId='67586bee39b1b82b0d0f9d06';
  data.items[eventId]={...data.items[id],id:eventId,eventOnly:false,excluded:false};
  const ready=makeDashboard(data,{entries:{}},{records:[]});
  delete ready.snapshot.eventMetadataVersion;ready.snapshot.items[eventId].eventOnly=false;
  const store=memoryStore(new Map([['dashboard/pve.json',ready],['snapshot/pve.json',data]]));
  const result=await dashboard(store,'pve');
  assert.equal(result.snapshot.items[eventId].eventOnly,true);
  assert.equal(result.modelVersion,MODEL_VERSION);assert.equal(result.snapshot.fetchedAt,data.fetchedAt);
  assert.equal(Object.keys(result.snapshot.items).length,2);
});

test('cached markets repair container classifications without refetching or changing prices',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{assert.fail('Classification upgrades must not fetch market data');});
  for(const market of ['pve','regular','pvp-season']){
    const data=fixture(market),caseId='5aafbde786f774389d0cbc0f';
    data.categoryMetadataVersion=1;
    data.items[caseId]={...data.items[id],id:caseId,name:'弹药箱',types:['barter','container','markedOnly'],category:'barter'};
    const book={entries:{[id]:{at:now,summary:{daily:[],recent:[[now-1000,150000]]}}}},ledger={records:[{date:'2026-10-20',market,rows:{}}]};
    const ready=makeDashboard(data,book,ledger);
    ready.snapshot.categoryMetadataVersion=1;ready.snapshot.items[caseId].category='barter';
    const store=memoryStore(new Map([[`dashboard/${market}.json`,ready],[`snapshot/${market}.json`,data],[`signals/${market}.json`,book]]));
    const result=await dashboard(store,market);
    assert.equal(result.snapshot.items[caseId].category,'containers');
    assert.equal(result.snapshot.items[caseId].price,data.items[caseId].price);
    assert.equal(result.snapshot.fetchedAt,data.fetchedAt);
    assert.equal(result.snapshot.categoryMetadataVersion,CATEGORY_METADATA_VERSION);
    assert.equal(result.modelVersion,MODEL_VERSION);
    assert.deepEqual(result.signals,ready.signals);
    assert.equal(store.entries.get(`dashboard/${market}.json`).snapshot.items[caseId].category,'containers');
  }
});
