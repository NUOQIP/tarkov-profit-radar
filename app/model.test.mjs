import test from 'node:test';
import assert from 'node:assert/strict';
import { fleaFee, normalizeSnapshot, collectLoot, collectFlips, collectCrafts, analyzeHistory, quoteStatus } from './model.mjs';
const now = Date.parse('2026-10-20T16:00:00Z');
const flea = { enabled: true, minPlayerLevel: 15, foundInRaidRequired: false, sellOfferFeeRate: .05, sellRequirementFeeRate: .05 };
const item = (id, patch = {}) => ({
  id, name: id, shortName: id, types: [], category: 'mods', basePrice: 100000, price: 100000, average: 100000,
  offers: 10, scan: new Date(now - 600000).toISOString(), width: 1, height: 1, stack: 1, fleaLevel: 15,
  buy: [], sell: [{ trader: 't', priceRUB: 30000 }], ...patch
});
const dataset = (items, patch = {}) => ({ market:'pve', flea, items:Object.fromEntries(items.map(i=>[i.id,i])), traders:{t:{name:'prapor'}}, stations:{s:{name:'工作台'}}, barters:[], crafts:[], ...patch });
test('fee uses supplied market parameters, count and explicit intelligence setting',()=>{
  assert.equal(fleaFee(100000,100000,flea),10000);
  assert.equal(fleaFee(100000,100000,flea,0,0,60),600000);
  assert.equal(fleaFee(100000,100000,flea,3,0),7000);
  assert.equal(fleaFee(0,100000,flea),null);
});
test('normalization preserves every equipment category and resolves actual translations',()=>{
  const raw = [
    {id:'gun',name:'gun_name',types:['gun'],properties:{}},
    {id:'scope',name:'scope_name',types:['mods'],properties:{}},
    {id:'key',name:'key_name',types:['keys'],properties:{}},
    {id:'ammo',name:'ammo_name',types:['ammo'],properties:{}},
    {id:'armor',name:'armor_name',types:['armor'],properties:{}},
    {id:'meds',name:'meds_name',types:['meds'],properties:{}},
    {id:'sugar',name:'sugar_name',types:['provisions'],properties:{}},
    {id:'bolt',name:'bolt_name',types:['barter'],properties:{}}
  ];
  const data=normalizeSnapshot({items:{data:{items:Object.fromEntries(raw.map(i=>[i.id,i])),fleaMarket:flea}},items_zh:{data:{gun_name:'步枪'}},traders:{data:{}},hideout:{data:{}},barters:{data:[]},crafts:{data:[]}},'pve');
  assert.equal(data.items.gun.name,'步枪');
  assert.deepEqual(Object.values(data.items).map(i=>i.category),['weapon','mods','keys','ammo','armor','medical','food','barter']);
});
test('noFlea and old quotes cannot inflate net value',()=>{
  const banned=item('banned',{types:['noFlea'],price:9999999});
  const old=item('old',{scan:new Date(now-7*3600000).toISOString(),price:100000});
  const rows=collectLoot(dataset([banned,old]),{},now);
  assert.equal(rows[0].slotValue,30000);
  assert.equal(rows[1].slotValue,30000);
  assert.ok(rows.every(r=>r.fleaNet===null));
});
test('delayed loot prices remain explicit references while being excluded from flipping',()=>{
  const delayed=item('rare',{scan:new Date(now-2*3600000).toISOString(),buy:[{trader:'t',priceRUB:10000,currency:'RUB'}]});
  const data=dataset([delayed]);
  const [row]=collectLoot(data,{},now);
  assert.equal(row.status,'报价延迟');assert.equal(row.slotValue,90000);
  assert.equal(collectFlips(data,{},now).length,0);
});
test('slot sorting uses dimensions, explicit stack counts and item-level flea eligibility',()=>{
  const items=[item('big',{width:2,height:2}),item('small'),item('round',{stack:60,price:1000,average:1000,basePrice:1000,sell:[]}),item('locked',{fleaLevel:35})];
  const rows=collectLoot(dataset(items),{playerLevel:20},now);
  assert.equal(rows.find(r=>r.id==='round').slotValue,900);
  assert.equal(rows.find(r=>r.id==='locked').slotValue,30000);
  assert.ok(rows.every((r,index)=>index===0||r.slotValue<=rows[index-1].slotValue));
  assert.equal(collectLoot(dataset(items),{stack:'full'},now).find(r=>r.id==='round').slotValue,54000);
});
test('default whole-gun preset replaces receiver without duplicate loot rows',()=>{
  const rows=collectLoot(dataset([item('receiver',{defaultPreset:'preset'}),item('preset',{isPreset:true,default:true,width:5,height:2}),item('custom',{isPreset:true,default:false})]),{},now);
  assert.deepEqual(rows.map(r=>r.id),['preset']);
});
test('trader cash purchases and barters both produce ranked after-fee profits',()=>{
  const output=item('scope',{buy:[{trader:'t',priceRUB:40000,currency:'RUB',minTraderLevel:2,buyLimit:2}]});
  const material=item('material',{price:10000,average:12000,basePrice:10000});
  const data=dataset([output,material],{barters:[{id:'b',trader:'t',minTraderLevel:1,offeredItem:{item:'scope',count:1},requiredItems:[{item:'material',count:2,attributes:{}}]}]});
  const rows=collectFlips(data,{},now);
  assert.equal(rows.length,2);assert.equal(rows[0].profit,66000);assert.equal(rows[1].profit,50000);
  assert.ok(rows.some(r=>r.recipe===null));
  data.flea={...flea,foundInRaidRequired:true};assert.equal(collectFlips(data,{},now).length,0);
});
test('missing or level-specific barter costs are not treated as free',()=>{
  const data=dataset([item('output')],{barters:[{id:'b',offeredItem:{item:'output',count:1},requiredItems:[{item:'missing',count:1,attributes:{}}]}]});
  assert.equal(collectFlips(data,{},now).length,0);
});
test('crafts account for output quantity, reusable tools, time and optional fuel',()=>{
  const data=dataset([item('product'),item('material',{price:10000,average:10000}),item('tool',{price:999999})],{
    crafts:[{id:'c',station:'s',duration:7200,level:1,productItem:{item:'product',count:2},requiredItems:[{item:'material',count:3,attributes:{}},{item:'tool',count:1,attributes:{tool:true}}]}]
  });
  const [without]=collectCrafts(data,{},now);assert.equal(without.fuel,null);assert.equal(without.margin,150000);
  const [withFuel]=collectCrafts(data,{fuelPerHour:10000},now);assert.equal(withFuel.profit,130000);assert.equal(withFuel.hourly,65000);
});
test('high price and single repeated timestamp cannot independently trigger short-term classification',()=>{
  const i=item('expensive',{price:160000,average:150000}),data=dataset([i]);
  const points=Array.from({length:7},(_,n)=>({priceMin:100000,timestamp:now-(n+1.5)*86400000,offerCount:10}));
  points.push({priceMin:100000,timestamp:now-86400000,offerCount:10});
  const one={priceMin:160000,timestamp:now-600000,offerCount:10};
  assert.equal(analyzeHistory([...points,one,one],i,data,{},now).short,false);
  const confirmed=analyzeHistory([...points,one,{...one,timestamp:now-1800000}],i,data,{},now);
  assert.equal(confirmed.short,true);assert.equal(confirmed.long,false);
});
test('missing scan or too few offers cannot yield trade recommendations',()=>{
  const data=dataset([]);
  assert.equal(quoteStatus(item('a',{scan:null}),data,{},now),'无报价');
  assert.equal(quoteStatus(item('a',{offers:1}),data,{},now),'报价不足');
});
