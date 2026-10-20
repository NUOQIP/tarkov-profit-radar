import test from 'node:test';
import assert from 'node:assert/strict';
import {quicklookLayout,opportunityTone,inQuicklookBand} from './quicklook.mjs';
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
test('the everyday band contains 30000 through 99999 and makes more room for overlooked loot',()=>{
  assert.equal(inQuicklookBand(30000,'everyday'),true);
  assert.equal(inQuicklookBand(55000,'everyday'),true);
  assert.equal(inQuicklookBand(29999,'everyday'),false);
  assert.equal(inQuicklookBand(100000,'everyday'),false);
  assert.equal(inQuicklookBand(100000,'high'),true);
  assert.equal(inQuicklookBand(null,'all'),false);
  const size={width:1120,height:440,compact:true};
  const focused=quicklookLayout(items,{...size,spotlight:false});valid(focused);
  assert.ok(focused.cells.length>=30);
  assert.ok(focused.cells.length>quicklookLayout(items,size).cells.length);
  const mobile=quicklookLayout(items,{width:340,height:460,compact:true,spotlight:false});valid(mobile);
  assert.ok(mobile.cells.length>=12);
});
test('loss color wins over any stale signal; profitable long and short use distinct tones',()=>{
  assert.equal(opportunityTone({kind:'flip',profit:-1},{short:true,long:true}),'loss');
  assert.equal(opportunityTone({kind:'craft',profit:1},{long:true}),'long');
  assert.equal(opportunityTone({kind:'loot'},{short:true,long:true}),'short');
  assert.equal(opportunityTone({kind:'flip',profit:null},{}),'');
});
