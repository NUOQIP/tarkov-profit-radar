import test from 'node:test';
import assert from 'node:assert/strict';
import { fleaFee, normalizeSnapshot, collectLoot, collectCatalog, filterCatalog, collectFlips, collectCrafts, analyzeHistory, quoteStatus, normalizeProfile, normalizeLayout, isScavengingItem, procurement, scenario, profitStability } from './model.mjs';
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

test('catalog retains unpriced, banned, event, currency and preset objects without inventing zero prices',()=>{
  const objects=[
    item('plain'),item('missing',{price:null,sell:[]}),item('banned',{types:['noFlea']}),
    item('event',{eventOnly:true,excluded:true}),item('cash',{currencyOnly:true,excluded:true}),
    item('receiver',{defaultPreset:'preset'}),item('preset',{isPreset:true,default:true}),
    item('custom',{isPreset:true,default:false}),item('no-dimensions',{width:null,height:null})
  ];
  const data=dataset(objects),rows=collectCatalog(data,{},now);
  assert.equal(rows.length,objects.length);
  assert.equal(rows.find(r=>r.id==='missing').net,null);
  assert.equal(rows.find(r=>r.id==='missing').slotValue,null);
  assert.equal(rows.find(r=>r.id==='no-dimensions').slotValue,null);
  assert.equal(rows.find(r=>r.id==='banned').fleaNet,null);
  assert.equal(rows.find(r=>r.id==='banned').traderNet,30000);
  assert.equal(rows.filter(r=>r.slotValue===null).length,2);
  assert.ok(rows.slice(-2).every(r=>r.slotValue===null));
  assert.equal(collectLoot(data,{},now).some(r=>['event','cash','receiver','custom','missing'].includes(r.id)),false);
});

test('catalog filters preserve source data and intersect category, trade state, favorites and event preference',()=>{
  const data=dataset([item('event',{eventOnly:true}),item('banned',{types:['noFlea'],category:'ammo'}),
    item('missing',{price:null,sell:[]}),item('plain'),item('cash',{currencyOnly:true})]);
  const rows=collectCatalog(data,{},now);
  assert.equal(filterCatalog(rows).length,4);
  assert.equal(filterCatalog(rows,{includeEvents:true}).length,5);
  assert.deepEqual(filterCatalog(rows,{availability:'banned'}).map(r=>r.id),['banned']);
  assert.deepEqual(filterCatalog(rows,{availability:'unpriced'}).map(r=>r.id),['missing']);
  assert.deepEqual(filterCatalog(rows,{category:'ammo',favoritesOnly:true},['banned','plain']).map(r=>r.id),['banned']);
  assert.equal(filterCatalog(rows,{availability:'flea'}).some(r=>['missing','banned'].includes(r.id)),false);
  assert.equal(Object.keys(data.items).length,5);
});

test('catalog searches full names, English, aliases and exact source IDs with deterministic value ordering',()=>{
  const gpu=item('57347ca924597744596b4e71',{name:'显卡',english:'Graphics card',price:120000,average:120000});
  const rows=collectCatalog(dataset([item('large',{width:2,height:3}),gpu,item('small'),item('stock',{name:'Magpul 枪托',english:'Magpul stock'})]),{},now);
  for(const search of ['显卡','graphics CARD',gpu.id,'gpu'])assert.deepEqual(filterCatalog(rows,{search},[],{gpu:'显卡'}).map(r=>r.id),[gpu.id]);
  assert.ok(rows.every((r,index)=>!index||rows[index-1].slotValue>=r.slotValue));
});

test('catalog uses selected stack, current profile fees and current-market eligibility',()=>{
  const ammo=item('round',{stack:60,basePrice:1000,price:1000,average:1000,sell:[{trader:'t',priceRUB:50}]});
  const data=dataset([ammo]);
  const [single]=collectCatalog(data,{},now),[full]=collectCatalog(data,{stack:'full',intelligence:3},now);
  assert.equal(single.slotValue,900);assert.equal(full.slotValue,55800);
  assert.equal(full.traderNet,3000);assert.equal(full.count,60);
  const [locked]=collectCatalog(data,{playerLevel:5},now);
  assert.equal(locked.fleaNet,null);assert.equal(locked.slotValue,50);
  const [disabled]=collectCatalog({...data,flea:{...flea,enabled:false}},{},now);
  assert.equal(disabled.banned,true);assert.equal(disabled.fleaNet,null);
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
test('crafts account for output quantity and reusable tools while ignoring legacy fuel preferences',()=>{
  const data=dataset([item('product'),item('material',{price:10000,average:10000}),item('tool',{price:999999})],{
    crafts:[{id:'c',station:'s',duration:7200,level:1,productItem:{item:'product',count:2},requiredItems:[{item:'material',count:3,attributes:{}},{item:'tool',count:1,attributes:{tool:true}}]}]
  });
  const [without]=collectCrafts(data,{},now);assert.equal(without.fuel,0);assert.equal(without.margin,150000);
  const [withFuel]=collectCrafts(data,{fuelPerHour:10000},now);assert.equal(withFuel.profit,150000);assert.equal(withFuel.hourly,75000);
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

test('event switch preserves database records and never enables currencies',()=>{
  const event=item('event',{eventOnly:true,excluded:true}),cash=item('cash',{currencyOnly:true,excluded:true}),normal=item('normal');
  const data=dataset([event,cash,normal]);
  assert.deepEqual(collectLoot(data,{},now).map(r=>r.id),['normal']);
  assert.deepEqual(collectLoot(data,{includeEvents:true},now).map(r=>r.id),['event','normal']);
  assert.equal(Object.keys(data.items).length,3);
});

test('delayed trade estimates are explicit and never confirmed executable',()=>{
  const i=item('a',{scan:new Date(now-2*3600000).toISOString(),buy:[{trader:'t',priceRUB:30000,currency:'RUB',minTraderLevel:1}]});
  const data=dataset([i],{traders:{t:{id:'t',name:'商人'}}});
  const options={allowDelayedTrades:true,playerLevel:30,traderLevels:{t:4}};
  const [estimate]=collectFlips(data,options,now);
  assert.equal(estimate.status,'报价延迟');assert.equal(estimate.execution.executable,false);
  assert.equal(collectFlips(data,{...options,onlyExecutable:true},now).length,0);
});

test('verified LL and quest unlocks are required before cheaper trader material costs',()=>{
  const task='0123456789abcdef01234567';
  const i=item('m',{buy:[{trader:'t',priceRUB:20000,currency:'RUB',minTraderLevel:2,taskUnlock:task}]});
  const data=dataset([i]);
  assert.equal(procurement(i,data,{traderLevels:{t:4}},now).cost,100000);
  assert.equal(procurement(i,data,{traderLevels:{t:2},completedTasks:[task]},now).cost,20000);
});

test('owned materials use sale opportunity cost, never zero',()=>{
  const output=item('o'),material=item('m',{price:20000,average:20000,basePrice:20000,sell:[]});
  const data=dataset([output,material],{barters:[{id:'b',trader:'t',minTraderLevel:1,offeredItem:{item:'o',count:1},requiredItems:[{item:'m',count:2}]}]});
  assert.equal(collectFlips(data,{materialMode:'owned'},now)[0].purchase,36000);
});

test('negative craft outcomes remain measurable without operating fuel costs',()=>{
  const output=item('o'),material=item('m');
  const data=dataset([output,material],{crafts:[{id:'c',station:'s',duration:7200,level:1,productItem:{item:'o',count:1},requiredItems:[]}]});
  assert.equal(collectCrafts(data,{fuelPerHour:5000,stationFuel:{s:0}},now)[0].fuel,0);
  assert.equal(collectCrafts(data,{fuelPerHour:100000},now).length,1);
  data.crafts[0].requiredItems=[{item:'m',count:2}];
  assert.equal(collectCrafts(data,{},now).length,0);
  assert.ok(collectCrafts(data,{includeLosses:true},now)[0].profit<0);
});

test('full progress defaults unlock procurement and recipes and apply maximum facility fee discount',()=>{
  const task='0123456789abcdef01234567',output=item('o'),m=item('m',{buy:[{trader:'t',priceRUB:10000,currency:'RUB',minTraderLevel:4,taskUnlock:task}]});
  const data=dataset([output,m],{crafts:[{id:'c',station:'s',duration:3600,level:3,taskUnlock:task,productItem:{item:'o',count:1},requiredItems:[{item:'m',count:1}]}]});
  const profile=normalizeProfile({playerLevel:5,intelligence:0,fuelPerHour:100000});
  assert.equal(profile.intelligence,3);assert.equal(profile.fuelPerHour,0);
  assert.equal(procurement(m,data,profile,now).cost,10000);
  const [r]=collectCrafts(data,{...profile,onlyExecutable:true},now);
  assert.equal(r.profit,83000);assert.equal(r.execution.executable,true);
  assert.equal(collectCrafts(data,{...profile,maxProgress:false,onlyExecutable:true},now).length,0);
});

test('craft ranking prioritizes money per batch even when a shorter recipe earns more per hour',()=>{
  const output=item('o');
  const recipe=(id,count,duration)=>({id,station:'s',duration,level:1,productItem:{item:'o',count},requiredItems:[]});
  const data=dataset([output],{crafts:[recipe('short',1,3600),recipe('long',2,36000)]});
  const rows=collectCrafts(data,{},now);
  assert.equal(rows[0].id,'craft-long');assert.ok(rows[0].profit>rows[1].profit);assert.ok(rows[0].hourly<rows[1].hourly);
});

test('a seven-day rise remains red after a plateau and does not require thirty days of history',()=>{
  const i=item('junk',{price:15000,average:15000,basePrice:10000}),data=dataset([i]);
  const points=Array.from({length:7},(_,n)=>({priceMin:n<3?15000:10000,timestamp:now-(n+1.5)*86400000,offerCount:10}));
  points.push({priceMin:15000,timestamp:now-86400000,offerCount:10},{priceMin:15000,timestamp:now-3600000,offerCount:10});
  const s=analyzeHistory(points,i,data,{},now);
  assert.equal(s.short,true);assert.equal(s.change7,.5);assert.equal(s.change24,0);assert.equal(s.long,false);
  assert.equal(analyzeHistory(points.map(p=>({...p,priceMin:15000})),i,data,{},now).short,false);
  assert.equal(analyzeHistory(points,{...i,scan:new Date(now-2*3600000).toISOString()},data,{},now).short,false);
});

test('scavenging scope includes useful loot types and keeps rare keys and complete guns in the database',()=>{
  const objects=[item('mod'),item('food',{category:'food'}),item('intel',{category:'barter'}),item('poster',{category:'other',name:'海报'}),item('key',{category:'keys'}),item('gun',{category:'weapon'}),item('cash',{currencyOnly:true})];
  const rows=collectLoot(dataset(objects),{},now);
  assert.deepEqual(rows.filter(r=>isScavengingItem(r.item)).map(r=>r.id).sort(),['food','intel','mod','poster']);
  assert.equal(rows.some(r=>r.id==='key'),true);
});

test('layout migration preserves all three modules, rejects invalid sizes and restores missing modules',()=>{
  const l=normalizeLayout({order:['crafts','crafts','bogus'],widths:{loot:99,crafts:2},arrangement:'hidden'});
  assert.deepEqual(l.order,['crafts','loot','flips']);assert.deepEqual(l.widths,{loot:1,flips:1,crafts:2});assert.equal(l.arrangement,'columns');
  assert.deepEqual(normalizeLayout(null).order,['loot','flips','crafts']);
});

test('long-term value needs 24 complete valid days and cannot be created from one day',()=>{
  const i=item('stable'),data=dataset([i]),start=Math.floor(now/86400000)*86400000;
  const points=Array.from({length:26},(_,n)=>({priceMin:100000,timestamp:start-(n+1)*86400000+3600000,offerCount:10}));
  assert.equal(analyzeHistory(points,i,data,{},now).long,true);
  assert.equal(analyzeHistory(points.slice(0,23),i,data,{},now).long,false);
  assert.equal(analyzeHistory(points.map(p=>({...p,offerCount:1})),i,data,{},now).long,false);
});

test('sale scenarios recompute nonlinear fees and honor flea restrictions',()=>{
  const i=item('a'),data=dataset([i]),[row]=collectLoot(data,{},now);
  const low=scenario(row,data,{},50000);
  assert.equal(low.fee,fleaFee(i.basePrice,50000,data.flea));
  assert.notEqual(low.fee,row.fee*.5);
  assert.equal(scenario({...row,item:{...i,types:['noFlea']}},data,{},50000),null);
});

test('profile import bounds inputs and ignores malformed ID collections',()=>{
  const p=normalizeProfile({playerLevel:999,fuelPerHour:-1,intelligence:5,completedTasks:'not an array',ownedTools:['x'],stationFuel:{s:0}});
  assert.equal(p.playerLevel,79);assert.equal(p.intelligence,3);assert.equal(p.fuelPerHour,0);assert.deepEqual(p.completedTasks,[]);assert.equal(p.stationFuel.s,0);
});

test('no paired history means no fabricated long-term trade profit',()=>{
  const i=item('a',{buy:[{trader:'t',priceRUB:10000,currency:'RUB',minTraderLevel:1}]}),data=dataset([i]);
  const [row]=collectFlips(data,{},now);
  assert.equal(profitStability([],row,data,{}).long,false);
});
