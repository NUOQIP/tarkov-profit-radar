import test from 'node:test';
import assert from 'node:assert/strict';
import {createRowCache} from './row-cache.mjs';
import {collectCatalog} from './model.mjs';
const fixture=()=>({market:'pve',flea:{enabled:true,minPlayerLevel:15,sellOfferFeeRate:.05,sellRequirementFeeRate:.05},traders:{t:{id:'t',name:'Therapist'}},stations:{},barters:[],crafts:[],items:{a:{id:'a',name:'item',types:[],price:100000,basePrice:100000,offers:20,scan:new Date(1700000000000).toISOString(),width:1,height:1,stack:1,buy:[],sell:[{trader:'t',priceRUB:10000}]}}});
test('row reuse respects changed player levels, market snapshots and quote expiry',()=>{
  let now=1700000000000;const cache=createRowCache({catalog:collectCatalog},{now:()=>now,ttl:60000}),data=fixture();
  const player={playerLevel:79},first=cache(data,'catalog',player);
  assert.equal(cache(data,'catalog',player),first);
  const restricted=cache(data,'catalog',{playerLevel:1});assert.notEqual(restricted,first);assert.notEqual(restricted[0].net,first[0].net);
  const changed={...data,items:{a:{...data.items.a,price:200000}}};assert.notEqual(cache(changed,'catalog',player)[0].net,first[0].net);
  now+=60001;assert.notEqual(cache(data,'catalog',player),first);
  assert.deepEqual(cache(data,'catalog',player),collectCatalog(data,player,now));
});
