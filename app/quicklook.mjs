// A bounded packing layout: new quotes keep surviving items in their seats.
export function quicklookLayout(items, {width, height, compact = false, spotlight = true, previous = null} = {}) {
  const columns = Math.max(1, Math.min(spotlight?12:16, Math.floor(((width || 640) + 10) / (spotlight?(compact?128:146):(compact?104:120)))));
  const rows = Math.max(1, Math.min(spotlight?6:8, Math.floor(((height || 420) + 10) / (spotlight?(compact?122:136):(compact?96:126)))));
  const ranked = [...new Map(items.filter(r => Number.isFinite(r.slotValue) && r.slotValue > 0).map(r => [r.id,r])).values()]
    .sort((a,b) => b.slotValue-a.slotValue || a.id.localeCompare(b.id));
  const capacity = columns * rows;
  const largeCount = spotlight && columns >= 6 && rows >= 3 ? 1 : 0;
  const mediumCount = spotlight && columns >= 4 ? Math.min(3, Math.floor(capacity / 8)) : 0;
  function pack(retained = [], candidates = ranked) {
    const occupied = new Set(), cells = [];
    const fits = (x,y,w,h) => x>=0 && y>=0 && x+w<=columns && y+h<=rows &&
      Array.from({length:w*h},(_,n) => (y+Math.floor(n/w))*columns+x+n%w).every(n => !occupied.has(n));
    function place(cell) {
      cells.push(cell);
      for(let y=cell.y;y<cell.y+cell.h;y++)for(let x=cell.x;x<cell.x+cell.w;x++)occupied.add(y*columns+x);
    }
    for(const c of retained)if(fits(c.x,c.y,c.w,c.h))place({...c});
    const placed = new Set(cells.map(c => c.id));
    for(let rank=0;rank<candidates.length && occupied.size<capacity;rank++) {
      const item=candidates[rank];if(placed.has(item.id))continue;
      const tier=rank<largeCount?'large':rank<largeCount+mediumCount?'medium':'small';
      const w=tier==='small'?1:2,h=tier==='large'?2:1;
      const positions=[];
      if(tier==='large')positions.push([Math.floor((columns-w)/2),Math.floor((rows-h)/2)]);
      for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)positions.push([x,y]);
      const spot=positions.find(([x,y])=>fits(x,y,w,h));
      const fallback=spot||positions.find(([x,y])=>fits(x,y,1,1));
      if(fallback)place({id:item.id,x:fallback[0],y:fallback[1],w:spot?w:1,h:spot?h:1,tier:spot?tier:'small'});
    }
    return cells;
  }
  const fresh=pack();
  if(previous?.columns!==columns || previous?.rows!==rows)return {columns,rows,cells:fresh};
  const selected=new Map(fresh.map(c=>[c.id,c]));
  const retained=previous.cells.filter(c=>selected.get(c.id)?.tier===c.tier);
  const cells=pack(retained,ranked.filter(r=>selected.has(r.id)));
  return {columns,rows,cells};
}

export function partitionQuicklook(items, {includeLower = false} = {}) {
  const everyday=[],high=[];
  for(const item of items){
    const value=item.slotValue;
    if(!Number.isFinite(value)||value<=0)continue;
    if(value>=100000)high.push(item);
    else if(includeLower||value>=30000)everyday.push(item);
  }
  return {everyday,high};
}

export function opportunityTone(row, signal = {}) {
  if(row.kind!=='loot' && Number.isFinite(row.profit) && row.profit<0)return 'loss';
  return signal.short?'short':signal.long?'long':'';
}
