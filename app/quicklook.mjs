// A bounded packing layout: new quotes keep surviving items in their seats.
export function quicklookLayout(items, {width, height, compact = false, spotlight = true, showAll = false, previous = null} = {}) {
  const columns = Math.max(1, Math.min(spotlight?12:20, Math.floor(((width || 640) + 8) / (spotlight?(compact?128:146):(compact?92:104)))));
  let rows = Math.max(1, Math.min(spotlight?6:10, Math.floor(((height || 420) + 8) / (spotlight?(compact?122:136):(compact?96:112)))));
  const ranked = [...new Map(items.filter(r => Number.isFinite(r.slotValue) && r.slotValue > 0).map(r => [r.id,r])).values()]
    .sort((a,b) => b.slotValue-a.slotValue || a.id.localeCompare(b.id));
  if(showAll&&!spotlight)rows=Math.max(rows,Math.ceil(ranked.length/columns));
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
    let cursor=0;
    for(let rank=0;rank<candidates.length && occupied.size<capacity;rank++) {
      const item=candidates[rank];if(placed.has(item.id))continue;
      if(!spotlight){
        while(occupied.has(cursor))cursor++;
        place({id:item.id,x:cursor%columns,y:Math.floor(cursor/columns),w:1,h:1,tier:'small'});
        cursor++;continue;
      }
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

export const QUICKLOOK_VALUE_STEPS = [0,10000,20000,30000,50000,80000,100000,150000,200000,300000,500000,1000000,null];
export const DEFAULT_QUICKLOOK_RANGE = [4,12];
export const EVERYDAY_QUICKLOOK_RANGE = [3,6];
export function normalizeQuicklookRange(range) {
  const last=QUICKLOOK_VALUE_STEPS.length-1;
  if(!Array.isArray(range)||range.length!==2||!range.every(Number.isInteger))return [...DEFAULT_QUICKLOOK_RANGE];
  const low=Math.max(0,Math.min(last-1,range[0]));
  return [low,Math.max(low,Math.min(last,range[1]))];
}
export function quicklookRangeMatches(value,range) {
  const [low,high]=normalizeQuicklookRange(range);
  return Number.isFinite(value)&&value>0&&value>=QUICKLOOK_VALUE_STEPS[low]&&
    (QUICKLOOK_VALUE_STEPS[high]===null||value<=QUICKLOOK_VALUE_STEPS[high]);
}

export function opportunityTone(row, signal = {}) {
  if(row.kind!=='loot' && Number.isFinite(row.profit) && row.profit<0)return 'loss';
  return signal.short?'short':signal.long?'long':'';
}
