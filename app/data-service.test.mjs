import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDay,handleApi,r2Store,snapshot } from './data-service.mjs';
import { MODEL_VERSION } from './model.mjs';
const now=Date.parse('2026-10-21T03:00:00Z');
function memoryStore(){
  const entries=new Map();
  return {namespace:crypto.randomUUID(),entries,read:async k=>structuredClone(entries.get(k)||null),write:async(k,v)=>entries.set(k,structuredClone(v))};
}
const fixture=()=>({market:'pve',flea:{enabled:true,sellOfferFeeRate:.05,sellRequirementFeeRate:.05},traders:{t:{id:'t',name:'t'}},stations:{},barters:[],crafts:[],items:{
  a:{id:'a',name:'a',types:[],price:100000,average:100000,basePrice:100000,offers:10,scan:new Date(now-100000).toISOString(),fleaLevel:15,width:1,height:1,stack:1,buy:[{trader:'t',priceRUB:150000,currency:'RUB',minTraderLevel:1}],sell:[]}
}});
test('ledger records losing routes and deduplicates repeated collection within an hour',async()=>{
  const store=memoryStore(),data=fixture();await recordDay(store,data,now);await recordDay(store,data,now+10000);
  const day=await store.read('ledger/pve/2026-10-21.json'),row=day.rows['buy-a-0'];
  assert.equal(row.count,1);assert.equal(row.positive,0);assert.equal(row.min,-57000);
});
test('public API validates market, item ID and method before contacting source',async()=>{
  const store=memoryStore();
  for(const [path,method,status] of [['/api/snapshot?market=invalid','GET',400],['/api/history?id=../../secret','GET',400],['/api/collect','POST',405],['/api/health','GET',200]]){
    const result=await handleApi(new Request('https://radar.example'+path,{method}),store);assert.equal(result.status,status);
  }
  assert.equal(store.entries.size,0);
});

test('craft ledger stores net money per batch with the same full-progress fee basis as the UI',async()=>{
  const store=memoryStore(),data=fixture();data.stations={s:{id:'s',slug:'workbench'}};
  data.crafts=[{id:'batch',station:'s',level:3,duration:36000,productItem:{item:'a',count:2},requiredItems:[]}];
  await recordDay(store,data,now);
  const day=await store.read('ledger/pve/2026-10-21.json');
  assert.equal(day.rows['craft-batch'].min,186000);
});

test('R2 ledger update retries a concurrent writer without dropping its observations',async()=>{
  let value=null,revision=0,conflict=true;
  const bucket={
    async get(){const copy=structuredClone(value),etag=String(revision);return copy?{etag,json:async()=>copy}:null;},
    async put(key,body,options){
      if(conflict){conflict=false;value={hours:[1]};revision++;return null;}
      assert.equal(options.onlyIf.etagMatches,String(revision));
      value=JSON.parse(body);revision++;return {etag:String(revision)};
    }
  };
  await r2Store(bucket).update('test.json',old=>({hours:[...(old?.hours||[]),2]}));
  assert.deepEqual(value.hours,[1,2]);
});

test('a stalled hosted request cannot hold a later request behind its I/O promise',async()=>{
  const data={...fixture(),version:2,modelVersion:MODEL_VERSION,profileMetadataVersion:2,market:'regular',fetchedAt:new Date().toISOString()};
  let release,reads=0;
  const gate=new Promise(resolve=>{release=resolve;});
  const bucket={async get(){reads++;if(reads===1)await gate;return {json:async()=>structuredClone(data)};}};
  const first=snapshot(r2Store(bucket),'regular');
  let timer;
  try{
    const next=await Promise.race([
      snapshot(r2Store(bucket),'regular'),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('later request joined stalled request')),150);})
    ]);
    assert.equal(next.market,'regular');assert.equal(reads,2);
  }finally{clearTimeout(timer);release();await first;}
});
