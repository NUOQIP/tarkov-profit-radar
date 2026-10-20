import test from 'node:test';
import assert from 'node:assert/strict';
import {quicklookLayout,opportunityTone,normalizeQuicklookRange,quicklookRangeMatches,EVERYDAY_QUICKLOOK_RANGE} from './quicklook.mjs';
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
    assert.equal(plan.cells.reduce((n,c)=>n+c.w*c.h,0),plan.columns*plan.rows);
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
test('stepped range defaults to 50k with no ceiling and includes both preset boundaries',()=>{
  const values=[null,NaN,0,29999,30000,49999,50000,99999,100000,100001,5000000];
  assert.deepEqual(values.filter(v=>quicklookRangeMatches(v)),[50000,99999,100000,100001,5000000]);
  assert.deepEqual(values.filter(v=>quicklookRangeMatches(v,EVERYDAY_QUICKLOOK_RANGE)),[30000,49999,50000,99999,100000]);
  assert.deepEqual(normalizeQuicklookRange(null),[4,12]);
  assert.deepEqual(normalizeQuicklookRange([9,3]),[9,9]);
  assert.deepEqual(normalizeQuicklookRange([-1,100]),[0,12]);
  assert.deepEqual(normalizeQuicklookRange([12,12]),[11,12]);
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
