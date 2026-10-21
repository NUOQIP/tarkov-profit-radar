import test from 'node:test';
import assert from 'node:assert/strict';
import { fleaFee, feeBasePrice, lowOfferCount, isShortOpportunity, isPriceOpportunity, summarizeHistory, analyzeHistorySummary, mergeRecentQuotes, normalizeSnapshot, categoryOf, collectLoot, collectCatalog, filterCatalog, collectFlips, collectCrafts, analyzeHistory, quoteStatus, normalizeProfile, resolvePlayerProfile, resolveTradingProfile, tradingTraders, productionStations, hasFullProgress, isScavengingItem, scavengingCategory, SCAVENGING_CATEGORIES, normalizeScavengingCategories, procurement, scenario, profitStability } from './model.mjs';
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

test('upstream wearable melee objects have their own weapon category',()=>{
  assert.equal(categoryOf({types:['wearable'],properties:{propertiesType:'ItemPropertiesMelee'}}),'melee');
  assert.equal(categoryOf({types:['wearable','backpack'],properties:{}}),'gear');
});

test('trader presets use the standard complete weapon price, never the receiver or attachment resale',()=>{
  const gun=item('gun',{defaultPreset:'standard',price:100000}),attachment=item('scope',{price:9000000,average:9000000});
  const standard=item('standard',{isPreset:true,default:true,category:'weapon',baseItem:'gun',price:200000,average:200000,basePrice:80000,offers:2});
  const preset=item('preset',{category:'weapon',isPreset:true,default:false,baseItem:'gun',price:9000000,average:9000000,containsItems:[{item:'gun',count:1},{item:'scope',count:1}],buy:[{trader:'t',priceRUB:48000,currency:'RUB'}]});
  const data=dataset([gun,standard,preset,attachment]);
  const [row]=collectFlips(data,{},now);
  assert.equal(row.item.id,'preset');assert.equal(row.item.valuationId,'standard');assert.equal(row.purchase,48000);
  assert.equal(row.item.price,200000);assert.equal(row.profit,200000-fleaFee(80000,200000,flea)-48000);
  assert.equal(row.item.offers,2);assert.equal(lowOfferCount(row.item),true);
  assert.equal(scenario(row,data,{},120000).profit,scenario({...row,item:standard},data,{},120000).profit);
  assert.equal(collectFlips(dataset([{...gun,types:['noFlea']},standard,preset,attachment]),{},now).length,0);
  assert.equal(collectFlips(dataset([gun,preset,attachment]),{includeUnavailable:true},now)[0].profit,null);
  const armor={...preset,category:'armor',price:200000,average:200000,scan:gun.scan};
  const [armorRow]=collectFlips(dataset([gun,armor]),{},now);
  assert.equal(armorRow.item.price,200000);assert.equal(armorRow.item.valuationId,undefined);
});

test('a preset barter retains material quantity and uses the lowest available material price',()=>{
  const receiver=item('receiver',{price:100000,defaultPreset:'standard'}),standard=item('standard',{price:200000,average:200000,basePrice:80000});
  const preset=item('AUT',{category:'weapon',isPreset:true,baseItem:'receiver',price:900000});
  const ram=item('ram',{price:16000,average:25000});
  const data=dataset([receiver,standard,preset,ram],{barters:[{id:'ram-trade',trader:'t',offeredItem:{item:'AUT',count:1},requiredItems:[{item:'ram',count:3}]}]});
  const [row]=collectFlips(data,{},now);
  assert.equal(row.purchase,48000);assert.equal(row.item.price,200000);assert.equal(row.profit,200000-row.fee-48000);
});

test('sealed ammo packs include packaging and every contained round in the tax base exactly once',()=>{
  const round=item('7N42',{basePrice:400,types:['ammo','noFlea']});
  const pack=item('pack',{basePrice:1000,price:160000,average:160000,types:['ammoBox'],containsItems:[{item:'7N42',count:30}],offers:7,sell:[]});
  const data=dataset([round,pack]),profile={intelligence:3,management:25};
  assert.equal(feeBasePrice(pack,data),13000);
  const row=collectLoot(data,profile,now).find(r=>r.id==='pack');
  assert.equal(row.fee,22991);assert.equal(row.net,137009);assert.equal(row.channel,'跳蚤');
  assert.equal(scenario(row,data,profile,160000).fee,row.fee);
  assert.equal(scenario({...row,count:3},data,profile,160000).fee,fleaFee(13000,160000,flea,3,25,3));
  assert.equal(feeBasePrice({...pack,containsItems:[{item:'missing',count:30}]},data),null);
  assert.equal(scenario({...row,item:{...pack,containsItems:[]}},data,profile),null);
  assert.equal(feeBasePrice({...pack,types:['preset'],basePrice:13000},data),13000);
  const points=Array.from({length:26},(_,n)=>({priceMin:160000,timestamp:now-(n+1)*86400000,offerCount:20}));
  assert.equal(analyzeHistory(points,pack,data,profile,now).longMedian,137009);
});

test('low offer counts warn without hiding positive quoted estimates; zero and unknown counts stay unpriced',()=>{
  for(const offers of [1,2,9]){
    const i=item('limited',{offers});assert.equal(lowOfferCount(i),true);
    assert.equal(quoteStatus(i,dataset([i]),{},now),'可参考');
  }
  assert.equal(lowOfferCount(item('ten',{offers:10})),false);
  assert.equal(lowOfferCount(item('unknown',{offers:null})),false);
  for(const offers of [0,null]){const i=item('none',{offers});assert.equal(quoteStatus(i,dataset([i]),{},now),'报价不足');}
});

test('all offers retains unknown-price and unknown-cost routes without inventing profits',()=>{
  const output=item('out',{price:null,buy:[{trader:'t',priceRUB:20000,currency:'RUB'}]});
  const data=dataset([output],{barters:[{id:'missing',trader:'t',offeredItem:{item:'out',count:1},requiredItems:[{item:'missing',count:1}]}]});
  assert.equal(collectFlips(data,{},now).length,0);
  const all=collectFlips(data,{includeUnavailable:true,includeLosses:true},now);
  assert.equal(all.length,2);assert.ok(all.every(r=>r.profit===null));
  const barter=all.find(r=>r.isBarter);assert.equal(barter.purchase,null);assert.equal(barter.execution.executable,false);
  const estimate=scenario(barter,data,{},100000);
  assert.equal(estimate.net,90000);assert.equal(estimate.profit,null);
});

test('simplified settings fix player and facility levels while retaining trader, task and production choices',()=>{
  const data=dataset([],{traders:{t:{id:'t',slug:'mechanic',levels:[{level:4}]},npc:{id:'npc',slug:'lightkeeper',levels:[{level:1}]}},stations:{s:{id:'s',slug:'workbench',maxLevel:3},wall:{id:'wall',slug:'defective-wall',maxLevel:6}},crafts:[{station:'s',duration:60}]});
  const p=resolveTradingProfile({maxProgress:false,progressConfigured:true,playerLevel:5,stationLevels:{s:1},traderLevels:{t:2},completedTasks:[],management:20,materialMode:'owned',edition:'unheard_edition',excludedStations:['s']},data);
  assert.equal(p.playerLevel,79);assert.equal(p.stationLevels.s,3);assert.equal(p.intelligence,3);assert.equal(p.materialMode,'buy');assert.equal(p.edition,'');
  assert.equal(p.traderLevels.t,2);assert.equal(p.management,20);assert.deepEqual(p.excludedStations,['s']);
  assert.deepEqual(tradingTraders(data).map(t=>t.id),['t']);assert.deepEqual(productionStations(data).map(s=>s.id),['s']);
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
    {id:'bolt',name:'bolt_name',types:['barter'],categories:['test-source-category'],properties:{}}
  ];
  const data=normalizeSnapshot({items:{data:{items:Object.fromEntries(raw.map(i=>[i.id,i])),fleaMarket:flea}},items_zh:{data:{gun_name:'步枪'}},traders:{data:{}},hideout:{data:{}},barters:{data:[]},crafts:{data:[]}},'pve');
  assert.equal(data.items.gun.name,'步枪');
  assert.deepEqual(data.items.bolt.sourceCategories,['test-source-category']);
  assert.equal(data.categoryMetadataVersion,1);
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
  assert.equal(rows.length,2);assert.equal(rows[0].profit,70000);assert.equal(rows[1].profit,50000);
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
test('reusable tools remain a separate purchase reference without an ownership gate',()=>{
  const task='0123456789abcdef01234567',toolId='123456789abcdef0123456789';
  const data=dataset([item('product'),item('material',{price:10000,average:10000}),item(toolId,{price:50000,average:50000})],{
    stations:{s:{id:'s',name:'工作台'}},
    crafts:[{id:'c',station:'s',duration:7200,level:1,taskUnlock:task,productItem:{item:'product',count:2},requiredItems:[{item:'material',count:3},{item:toolId,count:1,attributes:{tool:true}}]}]
  });
  const options={playerLevel:79,stationLevels:{s:1},completedTasks:[task],onlyExecutable:true};
  const [row]=collectCrafts(data,options,now);
  assert.ok(row.execution.executable);
  assert.equal(row.purchase,30000);assert.equal(row.profit,150000);
  assert.equal(row.recipe.find(m=>m.tool).capital,50000);
  const [legacy]=collectCrafts(data,{...options,ownedTools:[toolId]},now);
  assert.equal(legacy.profit,row.profit);
  assert.equal(legacy.recipe.find(m=>m.tool).capital,50000);
  assert.equal(collectCrafts(data,{...options,completedTasks:[]},now).length,0);
});
test('high price and single repeated timestamp cannot independently trigger short-term classification',()=>{
  const i=item('expensive',{price:160000,average:150000}),data=dataset([i]);
  const points=Array.from({length:7},(_,n)=>({priceMin:100000,timestamp:now-(n+1.5)*86400000,offerCount:10}));
  points.push({priceMin:100000,timestamp:now-86400000,offerCount:10});
  const one={priceMin:160000,timestamp:now-600000,offerCount:10};
  assert.equal(analyzeHistory([...points,one,one],i,data,{},now).short,false);
  const confirmed=analyzeHistory([...points,one,{...one,timestamp:now-1800000}],i,data,{},now);
  assert.equal(confirmed.short,true);assert.equal(confirmed.long,false);
  assert.equal(analyzeHistory([...points,one,{...one,timestamp:now-1800000}],{...i,offers:1},data,{},now).short,false);
});
test('missing scan or no offers cannot yield trade recommendations',()=>{
  const data=dataset([]);
  assert.equal(quoteStatus(item('a',{scan:null}),data,{},now),'无报价');
  assert.equal(quoteStatus(item('a',{offers:0}),data,{},now),'报价不足');
});

test('a rising sale price never makes loss-making flips or crafts a short opportunity',()=>{
  const output=item('output',{price:160000,average:150000,buy:[{trader:'t',priceRUB:200000,currency:'RUB'}]});
  const material=item('material',{price:200000,average:200000});
  const data=dataset([output,material],{crafts:[{id:'c',station:'s',duration:3600,productItem:{item:'output',count:1},requiredItems:[{item:'material',count:1}]}]});
  const points=Array.from({length:7},(_,n)=>({priceMin:100000,timestamp:now-(n+1.5)*86400000,offerCount:10}));
  points.push({priceMin:160000,timestamp:now-1800000,offerCount:10});
  const trend=analyzeHistory(points,output,data,{},now);assert.equal(trend.short,true);
  const losing=[...collectFlips(data,{includeLosses:true},now),...collectCrafts(data,{includeLosses:true},now)];
  assert.equal(losing.length,2);assert.ok(losing.every(r=>r.profit<0&&!isShortOpportunity(r,trend)));
  const loot=collectLoot(data,{},now).find(r=>r.item.id==='output');assert.equal(isShortOpportunity(loot,trend),true);
  output.buy[0].priceRUB=40000;
  const [winning]=collectFlips(data,{},now);assert.equal(isShortOpportunity(winning,trend),true);
  assert.equal(isShortOpportunity({...winning,profit:0},trend),false);
  assert.equal(isShortOpportunity({...winning,profit:null},trend),false);
  assert.equal(isShortOpportunity({...winning,status:'报价延迟'},trend),false);
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
  const i=item('junk',{price:15000,average:15000,basePrice:10000,sell:[]}),data=dataset([i]);
  const points=Array.from({length:7},(_,n)=>({priceMin:n<3?15000:10000,timestamp:now-(n+1.5)*86400000,offerCount:10}));
  points.push({priceMin:15000,timestamp:now-86400000,offerCount:10},{priceMin:15000,timestamp:now-3600000,offerCount:10});
  const s=analyzeHistory(points,i,data,{},now);
  assert.equal(s.short,true);assert.equal(s.change7,.5);assert.equal(s.change24,0);assert.equal(s.long,false);
  assert.equal(analyzeHistory(points.map(p=>({...p,priceMin:15000})),i,data,{},now).short,false);
  assert.equal(analyzeHistory(points,{...i,scan:new Date(now-2*3600000).toISOString()},data,{},now).short,false);
});

test('quicklook defaults include six loot types and keep all catalog items',()=>{
  const objects=[item('mod',{category:'mods'}),item('food',{category:'food'}),item('barter',{category:'barter'}),
    item('intel',{category:'barter'}),item('intel-other',{category:'other',name:'情报文件夹'}),
    item('poster',{category:'other',name:'情报海报',types:['poster']}),item('medical',{category:'medical'}),
    item('ammo-box',{category:'ammo',types:['ammoBox']}),item('ammo',{category:'ammo',types:['ammo']}),item('document',{category:'other',name:'普通文件'}),item('key',{category:'keys'}),item('gun',{category:'weapon'}),item('cash',{currencyOnly:true})];
  const rows=collectLoot(dataset(objects),{},now);
  assert.deepEqual(rows.filter(r=>isScavengingItem(r.item)).map(r=>r.id).sort(),['ammo-box','barter','food','intel','intel-other','medical','poster']);
  for(const id of ['mod','poster','medical','key','gun'])assert.equal(rows.some(r=>r.id===id),true);
  assert.equal(isScavengingItem({category:'barter',isPreset:true}),false);
  assert.equal(isScavengingItem({category:'weapon',isPreset:true,default:true},['weapon']),true);
  assert.equal(isScavengingItem({category:'barter',currencyOnly:true}),false);
  const excluded=[
    item('camera',{category:'barter',sourceCategories:['5447e0e74bdc2d3c308b4567']}),
    item('plan',{category:'barter',sourceCategories:['567849dd4bdc2d150f8b456e']}),
    item('survey',{category:'barter',slug:'topographic-survey-maps'}),
    item('map-localized',{category:'barter',name:'工厂地图'})
  ];
  assert.ok(excluded.every(i=>!isScavengingItem(i)));
  assert.ok(excluded.every(i=>!isScavengingItem(i,Object.keys(SCAVENGING_CATEGORIES))));
  assert.equal(isScavengingItem(objects.find(i=>i.id==='mod'),['mods']),true);
  assert.equal(isScavengingItem(objects.find(i=>i.id==='ammo'),['ammoBox']),false);
  assert.equal(isScavengingItem(objects.find(i=>i.id==='ammo-box'),['ammo']),false);
  assert.equal(isScavengingItem(objects.find(i=>i.id==='medical'),[]),false);
  assert.equal(scavengingCategory(item('flash-drive',{category:'barter',sourceCategories:['5448ecbe4bdc2d60728b4568']})),'intelligence');
  assert.deepEqual(normalizeScavengingCategories(['medical','medical','bad']),['medical']);
  assert.deepEqual(normalizeScavengingCategories([]),[]);
  assert.equal(collectCatalog(dataset(excluded),{},now).length,excluded.length);
  // Special-slot support alone is not the special-items category: paracord remains loot.
  assert.equal(isScavengingItem(item('paracord',{category:'barter',types:['barter','specialSlot'],sourceCategories:['590c745b86f7743cc433c5f2']})),true);
});

test('long-term value needs 24 complete valid days and cannot be created from one day',()=>{
  const i=item('stable'),data=dataset([i]),start=Math.floor(now/86400000)*86400000;
  const points=Array.from({length:26},(_,n)=>({priceMin:100000,timestamp:start-(n+1)*86400000+3600000,offerCount:10}));
  assert.equal(analyzeHistory(points,i,data,{},now).long,true);
  assert.equal(analyzeHistory(points.slice(0,23),i,data,{},now).long,false);
  assert.equal(analyzeHistory(points.map(p=>({...p,offerCount:1})),i,data,{},now).long,false);
});

test('long-term slot value requires 30000 after fees, including the current quote',()=>{
  const start=Math.floor(now/86400000)*86400000;
  const history=price=>Array.from({length:26},(_,n)=>({priceMin:price,timestamp:start-(n+1)*86400000+3600000,offerCount:10}));
  const i=item('boundary',{price:30000,average:30000,basePrice:30000});
  const data=dataset([i],{flea:{...flea,sellOfferFeeRate:0,sellRequirementFeeRate:0}});
  assert.equal(analyzeHistory(history(30000),i,data,{},now).long,true);
  assert.equal(analyzeHistory(history(29999),i,data,{},now).long,false);
  assert.equal(analyzeHistory(history(30000),{...i,price:29999},data,{},now).long,false);
  assert.equal(analyzeHistory(history(30000),i,dataset([i]),{},now).long,false);
});

test('full defaults become editable facility, trader and task selections that persist after changes',()=>{
  const task='000000000000000000000001',station='000000000000000000000002',trader='000000000000000000000003';
  const i=item('out'),mat=item('material',{buy:[{trader,priceRUB:20000,currency:'RUB',minTraderLevel:4,taskUnlock:task}]});
  const data=dataset([i,mat],{tasks:{[task]:{id:task,name:'任务'}},traders:{[trader]:{id:trader,levels:[{level:1},{level:4}]}},stations:{[station]:{id:station,name:'情报中心',slug:'intelligence-center',maxLevel:3},warehouse:{id:'warehouse',name:'仓库',maxLevel:4}},crafts:[{id:'r',station,level:3,taskUnlock:task,duration:3600,productItem:{item:i.id,count:2},requiredItems:[{item:mat.id,count:1}]}]});
  const p=resolvePlayerProfile({},data);
  assert.equal(p.maxProgress,false);assert.equal(p.progressConfigured,true);assert.equal(p.stationLevels.warehouse,4);
  assert.equal(p.stationLevels[station],3);assert.equal(p.intelligence,3);assert.equal(p.traderLevels[trader],4);assert.deepEqual(p.completedTasks,[task]);assert.equal(hasFullProgress(p,data),true);
  assert.equal(procurement(mat,data,p,now).cost,20000);
  const edited=resolvePlayerProfile({...p,stationLevels:{...p.stationLevels,[station]:2},completedTasks:[],management:20},data);
  assert.equal(edited.intelligence,2);assert.equal(edited.management,20);assert.deepEqual(edited.completedTasks,[]);assert.equal(hasFullProgress(edited,data),false);
  assert.equal(procurement(mat,data,edited,now).cost,100000);
  const reloaded=resolvePlayerProfile(JSON.parse(JSON.stringify(edited)),data);
  assert.deepEqual(reloaded,edited);
  assert.equal(collectCrafts(data,{...edited,onlyExecutable:true},now).length,0);
  assert.equal(resolvePlayerProfile(edited,data,true).stationLevels[station],3);
  assert.equal(resolvePlayerProfile({...edited,playerLevel:1},data,true).playerLevel,79);
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

const historyWeek=price=>Array.from({length:7},(_,n)=>({priceMin:price,timestamp:now-(n+1)*86400000,offerCount:12}));
test('the weekly normal ignores one abnormal day and gives each day equal weight',()=>{
  const i=item('normal',{price:150000,average:150000}),data=dataset([i]);
  const points=historyWeek(150000);points[6].priceMin=50000;
  for(let n=0;n<200;n++)points.push({...points[6],timestamp:points[6].timestamp+n*1000});
  const s=analyzeHistory(points,i,data,{},now);
  assert.equal(s.baseline,150000);assert.equal(s.short,false);assert.equal(s.watch,false);
});
test('a 24h spike is found even when the earlier weekly market was more expensive',()=>{
  const i=item('rebound',{price:150000,average:125000}),data=dataset([i]);
  const points=historyWeek(200000);
  for(let hours=6;hours<=30;hours+=2)points.push({priceMin:100000,timestamp:now-hours*3600000,offerCount:12});
  points.push({priceMin:150000,timestamp:now-3600000,offerCount:12});
  const s=analyzeHistory(points,i,data,{},now);
  assert.equal(s.short,true);assert.equal(s.riseWindow,'24h');assert.equal(s.riseBaseline,100000);assert.ok(s.extraNet>0);
  assert.ok(s.change7<0);
});
test('one new elevated scan is visible as a lead but only independent scans confirm it',()=>{
  const i=item('new-rise',{price:125000,average:110000}),data=dataset([i]),points=historyWeek(100000);
  const s=analyzeHistory(points,i,data,{},now),[row]=collectLoot(data,{},now);
  assert.equal(s.short,false);assert.equal(s.watch,true);assert.equal(isPriceOpportunity(row,s),true);assert.equal(isShortOpportunity(row,s),false);
  assert.equal(s.extraNet,125000-fleaFee(100000,125000,flea)-90000);
  const summary=summarizeHistory(points,i,now);
  for(let n=0;n<10;n++)summary.recent=mergeRecentQuotes(summary.recent,i,now+n*60000);
  assert.equal(analyzeHistorySummary(summary,i,data,{},now+10*60000).short,false);
  const later={...i,scan:new Date(now+20*60000).toISOString()};
  assert.equal(analyzeHistorySummary(summary,later,data,{},now+20*60000).short,true);
});
test('low offers and delayed quotes remain unconfirmed, and expired quotes are not opportunities',()=>{
  const i=item('rise',{price:150000,average:150000}),data=dataset([i]);
  const points=[...historyWeek(100000),{priceMin:150000,timestamp:now-3*3600000,offerCount:12}];
  for(const offers of [3,9]){const s=analyzeHistory(points,{...i,offers},data,{},now);assert.equal(s.short,false);assert.equal(s.watch,true);}
  for(const offers of [0,1,2])assert.equal(analyzeHistory(points,{...i,offers},data,{},now).watch,false);
  const delayed=analyzeHistory(points,{...i,scan:new Date(now-2*3600000).toISOString()},data,{},now);
  assert.equal(delayed.short,false);assert.equal(delayed.watch,true);
  const expired=analyzeHistory(points,{...i,scan:new Date(now-7*3600000).toISOString()},data,{},now);
  assert.equal(expired.short,false);assert.equal(expired.watch,false);
});
test('a live rise can use a cached daily baseline without pretending the history was refreshed',()=>{
  const i=item('rise',{price:150000,average:150000}),data=dataset([i]);
  const summary=summarizeHistory([...historyWeek(100000),{priceMin:150000,timestamp:now-3600000,offerCount:12}],i,now);
  summary.at=now-18*3600000;
  assert.equal(analyzeHistorySummary(summary,i,data,{},now).short,true);
  summary.at=now-25*3600000;
  assert.equal(analyzeHistorySummary(summary,i,data,{},now).short,false);
});
test('taxes and the trader floor must leave real additional proceeds; loss-making routes stay out of both states',()=>{
  const i=item('rise',{price:150000,average:150000,sell:[{trader:'t',priceRUB:145000}]}),data=dataset([i]);
  const points=[...historyWeek(100000),{priceMin:150000,timestamp:now-3600000,offerCount:12}];
  const s=analyzeHistory(points,i,data,{},now);assert.equal(s.short,false);assert.equal(s.watch,false);
  for(const kind of ['flip','craft'])for(const profit of [-1,0,null]){
    assert.equal(isPriceOpportunity({kind,profit,status:'可参考'},{watch:true}),false);
    assert.equal(isPriceOpportunity({kind,profit,status:'可参考'},{short:true}),false);
  }
});
test('unknown observation depth cannot confirm a spike, and live history stays bounded',()=>{
  const i=item('rise',{price:150000,average:150000}),data=dataset([i]);
  const points=[...historyWeek(100000),{priceMin:150000,timestamp:now-3600000}];
  assert.equal(analyzeHistory(points,i,data,{},now).short,false);
  const dense=Array.from({length:36*60},(_,n)=>[now-n*60000,150000,12]);
  const recent=mergeRecentQuotes(dense,i,now);
  assert.ok(recent.length<=57);assert.ok(recent.every(p=>dense.some(d=>d[0]===p[0])));
});
test('small per-round increases remain useful to batch sellers without inventing full-stack profit',()=>{
  const i=item('ammo',{price:1500,average:1500,basePrice:1000,stack:60,sell:[],types:['ammo']}),data=dataset([i]);
  const points=[...historyWeek(1000),{priceMin:1500,timestamp:now-3600000,offerCount:12}];
  const s=analyzeHistory(points,i,data,{},now);
  assert.equal(s.short,true);assert.ok(s.extraNet>0&&s.extraNet<1000);
  assert.equal(s.extraNet,1500-fleaFee(1000,1500,flea)-900);
});
