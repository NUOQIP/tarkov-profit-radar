import test from 'node:test';
import assert from 'node:assert/strict';
import {quicklookLayout,opportunityTone} from './quicklook.mjs';
const items=Array.from({length:100},(_,i)=>({id:String(i).padStart(3,'0'),slotValue:100000-i*800}));
function valid(plan) {
  const cells=new Set(),ids=new Set();
  for(const c of plan.cells) {
    assert.ok(!ids.has(c.id));ids.add(c.id);
    assert.ok(c.x>=0&&c.y>=0&&c.x+c.w<=plan.columns&&c.y+c.h<=plan.rows);
    for(let y=c.y;y<c.y+c.h;y++)for(let x=c.x;x<c.x+c.w;x++) {
      const key=`${x}:${y}`;assert.ok(!cells.has(key));cells.add(key);
    }
  }
}
test('quicklook stays within narrow, short, desktop and wide screens without overlap',()=>{
  for(const width of [280,360,650,1150,1900,3000])for(const height of [170,350,550,1000])for(const compact of [false,true]) {
    const plan=quicklookLayout(items,{width,height,compact});valid(plan);
    assert.ok(plan.cells.length>0);assert.ok(plan.cells.some(c=>c.id==='000'));
    assert.ok(plan.cells.reduce((n,c)=>n+c.w*c.h,0)<=plan.columns*plan.rows);
  }
});
test('price updates keep unchanged tiers in place and promote newly valuable items',()=>{
  const size={width:1150,height:550},previous=quicklookLayout(items,size);
  const updated=items.map(r=>({...r,slotValue:r.id==='099'?200000:r.slotValue}));
  const next=quicklookLayout(updated,{...size,previous});valid(next);
  assert.ok(next.cells.some(c=>c.id==='099'));
  for(const cell of next.cells) {
    const old=previous.cells.find(c=>c.id===cell.id);if(old?.tier===cell.tier)assert.deepEqual(cell,old);
  }
  assert.equal(next.cells.find(c=>c.id==='099').tier,'large');
  const repriced=items.map(r=>({...r,slotValue:r.slotValue+500}));
  assert.deepEqual(quicklookLayout(repriced,{...size,previous}).cells,previous.cells);
  const resized=quicklookLayout(updated,{width:340,height:500,previous:next});valid(resized);
  assert.ok(resized.cells.some(c=>c.id==='099'));
});
test('cloud excludes unknown and nonpositive values and handles empty results',()=>{
  assert.deepEqual(quicklookLayout([{id:'missing',slotValue:null},{id:'zero',slotValue:0},{id:'bad',slotValue:NaN}]).cells,[]);
});

test('fine cloud cells make ordinary finds smaller while keeping nine-cell desktop highlights',()=>{
  const plan=quicklookLayout(items,{width:1250,height:550,showAll:true});valid(plan);
  const big=plan.cells.find(c=>c.tier==='large'),small=plan.cells.find(c=>c.tier==='small');
  assert.equal(big.w*big.h,9);assert.equal(small.w*small.h,1);
  assert.ok(plan.rowHeight<=88);assert.ok(plan.columns>=15);
  assert.ok(plan.cells.filter(c=>(c.y+c.h)*(plan.rowHeight+7)<=550).length>=40);
  const compact=quicklookLayout(items,{width:1250,height:550,compact:true,showAll:true});
  assert.ok(compact.rowHeight<plan.rowHeight);assert.ok(compact.columns>plan.columns);
});

test('tile sizes respond to score separation even when the ranking is unchanged',()=>{
  const sample=items.slice(0,30).map((r,i)=>({...r,quicklookScore:100-i}));
  const size={width:1250,height:550,showAll:true},close=quicklookLayout(sample,size);
  const gap=quicklookLayout(sample.map((r,i)=>({...r,quicklookScore:i===0?100:30-i*.1})),{...size,previous:close});
  valid(gap);assert.equal(gap.cells.length,sample.length);
  const before=close.cells.find(c=>c.id==='001'),after=gap.cells.find(c=>c.id==='001');
  assert.ok(before.w*before.h>after.w*after.h);
  const equal=quicklookLayout(sample.map(r=>({...r,quicklookScore:50})),size);
  assert.ok(equal.cells.every(c=>c.tier==='small'));
});
test('unified cloud fills available space with compact single-cell tiles',()=>{
  for(const width of [100,230,330,800,1250,1900])for(const height of [100,300,600,1000])for(const compact of [false,true]){
    const plan=quicklookLayout(items,{width,height,compact,spotlight:false});valid(plan);
    assert.equal(plan.cells.length,Math.min(items.length,plan.columns*plan.rows));
    assert.ok(plan.cells.every(c=>c.w===1&&c.h===1));
  }
  const full=quicklookLayout(items,{width:650,height:350,spotlight:false,showAll:true});valid(full);
  assert.equal(full.cells.length,items.length);
  assert.ok(full.cells.every(c=>c.w===1&&c.h===1));
  const desktop={width:1250,height:550,spotlight:false};
  assert.ok(quicklookLayout(items,{...desktop,compact:true}).cells.length>quicklookLayout(items,desktop).cells.length);
});

test('loss color wins over any stale signal; profitable long and short use distinct tones',()=>{
  assert.equal(opportunityTone({kind:'flip',profit:-1},{short:true,long:true}),'loss');
  assert.equal(opportunityTone({kind:'craft',profit:1},{long:true}),'long');
  assert.equal(opportunityTone({kind:'loot'},{short:true,long:true}),'short');
  assert.equal(opportunityTone({kind:'flip',profit:null},{}),'');
});


test('variable cloud keeps every match, follows priority and packs without collisions at all widths',()=>{
  const ranked=items.map((r,i)=>({...r,quicklookScore:100-i*.5}));
  ranked[90].quicklookScore=110;
  for(const width of [100,280,360,650,1150,1900,3000])for(const height of [170,350,550,1000])for(const compact of [false,true]){
    const size={width,height,compact,showAll:true},plan=quicklookLayout(ranked,size);valid(plan);
    assert.equal(plan.cells.length,items.length);assert.equal(plan.cells[0].id,'090');
    if(plan.columns>=5)assert.ok(plan.cells.some(c=>c.tier==='large'));
    const next=quicklookLayout(ranked.map(r=>({...r,slotValue:r.slotValue+1})),{...size,previous:plan});
    valid(next);assert.deepEqual(next.cells,plan.cells);
    const changed=ranked.filter(r=>r.id!=='050');changed.push({id:'new',slotValue:10000,quicklookScore:120});
    const refresh=quicklookLayout(changed,{...size,previous:plan});valid(refresh);
    assert.equal(refresh.cells.length,changed.length);assert.equal(refresh.cells[0].id,'new');
  }
});
