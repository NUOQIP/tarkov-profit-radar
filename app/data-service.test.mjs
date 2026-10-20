import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDay,handleApi,r2Store } from './data-service.mjs';
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
  assert.equal(row.count,1);assert.equal(row.positive,0);assert.equal(row.min,-60000);
});
test('public API validates market, item ID and method before contacting source',async()=>{
  const store=memoryStore();
  for(const [path,method,status] of [['/api/snapshot?market=invalid','GET',400],['/api/history?id=../../secret','GET',400],['/api/collect','POST',405],['/api/health','GET',200]]){
    const result=await handleApi(new Request('https://radar.example'+path,{method}),store);assert.equal(result.status,status);
  }
  assert.equal(store.entries.size,0);
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
