import test from 'node:test';
import assert from 'node:assert/strict';
import {itemRarity,lootPriority,compareLootPriority,qualifiesForRun,RUN_VALUE_CAP} from './loot-priority.mjs';
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
test('common worthwhile finds outrank rare extremes, without promoting cheap clutter',()=>{
  assert.ok(lootPriority(row(bulb,50000))>lootPriority(row(gpu,5000000)));
  assert.ok(lootPriority(row(gpu,100000))>lootPriority(row(bulb,1000)));
  assert.ok(lootPriority(row(gpu,300000))<lootPriority(row(gpu,800000)));
  assert.ok(lootPriority(row(gpu,800000))<lootPriority(row(gpu,RUN_VALUE_CAP)));
  assert.equal(lootPriority(row(gpu,RUN_VALUE_CAP)),lootPriority(row(gpu,5000000)));
  assert.ok(lootPriority(row(bulb,50000))>lootPriority(row(bulb,10000)));
  assert.ok(lootPriority(row(bulb,50000))>lootPriority(row('unknown',50000)));
  assert.ok(lootPriority(row('unknown',50000))>lootPriority(row(gpu,50000)));
});
test('only positive short opportunities boost priority; scores remain bounded',()=>{
  const r=row(gpu,80000),base=lootPriority(r);
  assert.ok(lootPriority(r,{short:true,riseChange:.2})>base);
  assert.equal(lootPriority(r,{short:false,riseChange:2}),base);
  assert.equal(lootPriority(r,{short:true,riseChange:-.2}),base);
  assert.equal(lootPriority(r,{short:true,riseChange:NaN}),base);
  for(const value of [0,null,NaN,Infinity,-1])assert.equal(lootPriority(row(bulb,value)),0);
  assert.ok(Math.abs(lootPriority(row(bulb,1e12),{short:true,riseChange:9})-100)<1e-9);
  assert.ok(Math.abs(lootPriority(row(bulb,300000),{short:true,riseChange:1})-lootPriority(row(bulb,300000))-10)<1e-9);
  assert.ok(Math.abs(lootPriority(row('5c0530ee86f774697952d952',1000000))-47.5)<1e-9);
  assert.ok(Math.abs(lootPriority(row(bulb,1000000))-lootPriority(row(gpu,1000000))-42.5)<1e-9);
  const ranked=[row(gpu,200000),row(bulb,50000)].map(r=>({...r,quicklookScore:lootPriority(r)})).sort(compareLootPriority);
  assert.equal(ranked[0].id,bulb);
});
