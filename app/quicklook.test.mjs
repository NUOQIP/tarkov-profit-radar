import test from 'node:test';
import assert from 'node:assert/strict';
import {quicklookLayout,opportunityTone} from './quicklook.mjs';
const items=Array.from({length:129},(_,i)=>({id:String(i).padStart(3,'0'),item:{rarityOverride:i<20?'Common':i<50?'Rare':'Superrare'},slotValue:100000-i*500,quicklookScore:100-i*.3}));
function valid(plan,{full=false}={}){
  const occupied=new Set(),ids=new Set();
  for(const c of plan.cells){
    assert.ok(!ids.has(c.id));ids.add(c.id);
    assert.ok(c.x>=0&&c.y>=0&&c.x+c.w<=plan.columns&&c.y+c.h<=plan.rows);
    assert.ok(c.w>=4&&c.h>=4);
    for(let y=c.y;y<c.y+c.h;y++)for(let x=c.x;x<c.x+c.w;x++){
      const key=`${x}:${y}`;assert.ok(!occupied.has(key),`overlap at ${key}`);occupied.add(key);
    }
  }
  if(full)assert.equal(occupied.size,plan.columns*plan.rows,'the mosaic must cover every cell without holes');
}
const distance=(c,p)=>Math.hypot((c.x+c.w/2-p.columns/2)/(p.columns/2),(c.y+c.h/2-p.primaryRows/2)/(p.primaryRows/2));
test('screen-bounded mosaics tile every cell without overlap, gaps, duplicates or off-screen cards',()=>{
  for(const width of [100,280,360,650,1150,1900,3000])for(const height of [170,350,550,1000])for(const compact of [false,true]){
    const plan=quicklookLayout(items,{width,height,compact});valid(plan,{full:true});
    assert.ok(plan.cells.length<=items.length);assert.equal(plan.hidden,items.length-plan.cells.length);
    assert.deepEqual(plan.sections,[]);assert.equal(plan.rows,plan.primaryRows);
    assert.ok(Math.abs(plan.height-height)<.0001);
  }
});
test('five visual sizes form a centre with smaller peripheral cards and a visible rare reminder',()=>{
  const rare={id:'ledx',item:{rarityOverride:'Superrare'},slotValue:1200000,quicklookScore:99};
  const plan=quicklookLayout([rare,...items],{width:1250,height:600,compact:true});valid(plan,{full:true});
  const hero=plan.cells.find(c=>c.tier==='large'),reminder=plan.cells.find(c=>c.id==='ledx');
  assert.equal(new Set(plan.cells.map(c=>c.tier)).size,5);assert.equal(hero.id,'000');assert.ok(distance(hero,plan)<.05);
  assert.ok(reminder);assert.ok(hero.w*hero.h>reminder.w*reminder.h*3);
  const centre=plan.cells.filter(c=>distance(c,plan)<.6),outside=plan.cells.filter(c=>distance(c,plan)>.9);
  const average=list=>list.reduce((sum,c)=>sum+c.w*c.h,0)/list.length;
  assert.ok(average(centre)>average(outside)*2);
  assert.ok(plan.hidden>0);assert.ok(plan.cells.every(c=>c.y+c.h<=plan.primaryRows));
});
test('quote refreshes preserve positions; explicit repacking and rarity changes update the ranking',()=>{
  const size={width:1150,height:550},previous=quicklookLayout(items,size);
  const updated=items.map(r=>({...r,slotValue:r.slotValue+500}));
  assert.deepEqual(quicklookLayout(updated,{...size,previous}).cells,previous.cells);
  const moved=items.map(r=>({...r,quicklookScore:r.id==='019'?110:r.quicklookScore}));
  assert.deepEqual(quicklookLayout(moved,{...size,previous}).cells,previous.cells);
  assert.equal(quicklookLayout(moved,size).cells[0].id,'019');
  const changed=items.map(r=>r.id==='000'?{...r,item:{rarityOverride:'Superrare'}}:r);
  assert.notEqual(quicklookLayout(changed,{...size,previous}).cells[0].id,'000');
  const resized=quicklookLayout(updated,{width:340,height:500,previous});valid(resized,{full:true});
  assert.ok(resized.cells.length<previous.cells.length);
});
test('lookup can find low, zero and unknown values without hiding additional results',()=>{
  const candidates=[{id:'missing',slotValue:null},{id:'zero',slotValue:0},{id:'low',slotValue:2000},{id:'exact',slotValue:30000}];
  assert.deepEqual(quicklookLayout(candidates,{lookup:true}).cells.map(c=>c.id),candidates.map(r=>r.id));
  assert.equal(quicklookLayout(candidates).cells.length,2);
  assert.deepEqual(quicklookLayout([]).cells,[]);
  const hits=quicklookLayout(items,{lookup:true,width:340,height:350});valid(hits);
  assert.equal(hits.cells.length,items.length);assert.ok(hits.height>350);assert.equal(hits.hidden,0);
});
test('lookups retain relevance order and equal-sized readable tiles',()=>{
  const hits=[{id:'exact',slotValue:5000},{id:'related',slotValue:90000},{id:'unknown',slotValue:null}];
  const plan=quicklookLayout(hits,{lookup:true,width:900});valid(plan);
  assert.deepEqual(plan.cells.map(c=>c.id),hits.map(r=>r.id));assert.ok(plan.cells.every(c=>c.w===6&&c.h===6&&c.tier==='standard'));
  assert.ok(plan.cells.every(c=>c.y===0));assert.deepEqual(plan.sections,[]);
});
test('compact and sparse selections remain bounded, and rare-only presets retain a focal point',()=>{
  const size={width:1250,height:550};
  const standard=quicklookLayout(items,size),compact=quicklookLayout(items,{...size,compact:true});
  assert.ok(compact.columns>standard.columns);assert.ok(compact.cells.length>=standard.cells.length);
  for(const count of [1,2,3,4,5,8,12,20]){
    const sparse=quicklookLayout(items.slice(0,count),size);valid(sparse,{full:true});assert.ok(sparse.cells.length<=count);
  }
  const preset=quicklookLayout(items.slice(25),size),hero=preset.cells.find(c=>c.tier==='large');
  valid(preset,{full:true});assert.ok(hero);assert.ok(distance(hero,preset)<.05);
});
test('loss color wins over stale signals and short-term color wins over long-term',()=>{
  assert.equal(opportunityTone({kind:'flip',profit:-1},{short:true,long:true}),'loss');
  assert.equal(opportunityTone({kind:'craft',profit:1},{long:true}),'long');
  assert.equal(opportunityTone({kind:'loot'},{short:true,long:true}),'short');
  assert.equal(opportunityTone({kind:'flip',profit:null},{}),'');
});
