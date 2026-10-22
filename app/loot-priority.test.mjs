import test from 'node:test';
import assert from 'node:assert/strict';
import {itemRarity,lootPriority,compareLootPriority,qualifiesForRun,RUN_VALUE_CAP} from './loot-priority.mjs';
import {matchesRunScope} from './model.mjs';
import {SPT_SOURCE,SPT_GROUPS} from './spt-rarity.mjs';
const bulb='5d1b392c86f77425243e98fe',gpu='57347ca924597744596b4e71';
const row=(id,value)=>({id,item:{id},slotValue:value});

test('run value floor includes exactly 30k per slot and rejects low/unknown values',()=>{
  for(const value of [0,29999,29999.99,null,NaN,Infinity,-1])assert.equal(qualifiesForRun(row(bulb,value)),false);
  for(const value of [30000,30000.01,50000,1e7])assert.equal(qualifiesForRun(row(bulb,value)),true);
  assert.equal(qualifiesForRun({...row(bulb,20000),net:60000}),false);
});

test('SPT reference maps known examples, weapon templates and missing entries',()=>{
  assert.equal(itemRarity({id:bulb}).key,'Common');
  assert.equal(itemRarity({id:'590a373286f774287540368b'}).key,'Superrare');
  assert.equal(itemRarity({id:'preset',baseItem:bulb}).key,'Common');
  assert.equal(itemRarity({id:'new-item'}).key,'Unknown');
  assert.equal(itemRarity({id:SPT_GROUPS.Rare[0]}).key,'Rare');
  const ids=Object.values(SPT_GROUPS).flat();
  assert.equal(ids.length,new Set(ids).size);
  assert.equal(ids.length,2637);assert.equal(SPT_SOURCE.items,4673);
});
test('common worthwhile finds lead rare and unknown finds without pretending rarity is a probability',()=>{
  assert.ok(lootPriority(row(bulb,50000))>lootPriority(row(gpu,5000000)));
  assert.ok(lootPriority(row(bulb,50000))>lootPriority(row('unknown',5000000)));
  assert.ok(lootPriority(row(bulb,50000))>lootPriority(row(bulb,30000)));
  assert.ok(lootPriority(row(gpu,300000))<lootPriority(row(gpu,800000)));
  assert.ok(lootPriority(row(gpu,800000))<lootPriority(row(gpu,RUN_VALUE_CAP)));
  assert.equal(lootPriority(row(gpu,RUN_VALUE_CAP)),lootPriority(row(gpu,5000000)));
  assert.ok(lootPriority(row(SPT_GROUPS.Rare[0],50000))>lootPriority(row('unknown',50000)));
  const ranked=[row(gpu,1200000),row(bulb,30000)].map(r=>({...r,quicklookScore:lootPriority(r)})).sort(compareLootPriority);
  assert.equal(ranked[0].id,bulb);
});
test('short opportunities boost but cannot overwhelm availability',()=>{
  const r=row(gpu,80000),base=lootPriority(r);
  assert.ok(lootPriority(r,{short:true,riseChange:.2})>base);
  for(const signal of [{short:false,riseChange:2},{short:true,riseChange:-.2},{short:true,riseChange:NaN}])assert.equal(lootPriority(r,signal),base);
  for(const value of [0,null,NaN,Infinity,-1])assert.equal(lootPriority(row(bulb,value)),0);
  assert.ok(Math.abs(lootPriority(row(bulb,1e12),{short:true,riseChange:9})-100)<1e-9);
  assert.ok(Math.abs(lootPriority(row(bulb,300000),{short:true,riseChange:1})-lootPriority(row(bulb,300000))-10)<1e-9);
});
test('a query bypasses recommendation types and the 30k floor without mutating selection',()=>{
  const item={...row(bulb,29999),item:{id:bulb,category:'barter',types:[]}};
  const filters={quicklookTypes:['ammoBox']};
  assert.equal(matchesRunScope(item,filters),false);
  assert.equal(matchesRunScope(item,{...filters,search:'灯泡'}),true);
  assert.equal(matchesRunScope({...item,slotValue:null},{...filters,search:'灯泡'}),true);
  assert.equal(matchesRunScope(item,{...filters,search:'  '}),false);
  assert.equal(matchesRunScope({...item,slotValue:30000},{quicklookTypes:['barter']}),true);
  assert.deepEqual(filters,{quicklookTypes:['ammoBox']});
});
