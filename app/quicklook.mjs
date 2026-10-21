// Dense cells with larger highlights. All matching items remain scrollable.
export function quicklookLayout(items,{width=640,height=420,compact=false,spotlight=true,showAll=false,previous=null}={}){
  const columns=Math.max(1,Math.min(20,Math.floor((width+7)/(compact?98:110))));
  const viewportRows=Math.max(1,Math.floor((height+7)/(compact?119:131)));
  const ranked=[...new Map(items.filter(r=>Number.isFinite(r.slotValue)&&r.slotValue>0).map(r=>[r.id,r])).values()]
    .sort((a,b)=>(b.quicklookScore??b.slotValue)-(a.quicklookScore??a.slotValue)||b.slotValue-a.slotValue||a.id.localeCompare(b.id));
  const shape=rank=>{
    if(!spotlight||columns<3)return {w:1,h:1,tier:'small'};
    if(columns>=5&&(rank===0||(columns>=9&&rank===3)))return {w:2,h:2,tier:'large'};
    if([0,1,2,5,8].includes(rank))return {w:2,h:1,tier:'medium'};
    return {w:1,h:1,tier:'small'};
  };
  const area=ranked.reduce((sum,_,rank)=>{const s=shape(rank);return sum+s.w*s.h;},0);
  const capacityRows=showAll?Math.max(viewportRows,Math.ceil(area/columns)+2):viewportRows;
  function pack(retained=[]){
    const occupied=new Set(),cells=[],placed=new Set();
    const fits=(x,y,w,h)=>x+w<=columns&&y+h<=capacityRows&&Array.from({length:w*h},(_,n)=>(y+Math.floor(n/w))*columns+x+n%w).every(k=>!occupied.has(k));
    function place(cell){
      cells.push(cell);placed.add(cell.id);
      for(let y=cell.y;y<cell.y+cell.h;y++)for(let x=cell.x;x<cell.x+cell.w;x++)occupied.add(y*columns+x);
    }
    for(const c of retained)if(fits(c.x,c.y,c.w,c.h))place({...c});
    let cursor=0;
    for(let rank=0;rank<ranked.length;rank++){
      const item=ranked[rank];if(placed.has(item.id))continue;
      const desired=shape(rank);
      while(occupied.has(cursor))cursor++;
      if(cursor>=columns*capacityRows)break;
      let position=-1;
      for(let n=cursor;n<columns*capacityRows;n++)if(fits(n%columns,Math.floor(n/columns),desired.w,desired.h)){position=n;break;}
      const size=position>=0?desired:{w:1,h:1,tier:'small'};
      if(position<0)position=cursor;
      place({id:item.id,x:position%columns,y:Math.floor(position/columns),...size});
    }
    const order=new Map(ranked.map((r,i)=>[r.id,i]));cells.sort((a,b)=>order.get(a.id)-order.get(b.id));
    return cells;
  }
  let cells=pack();
  const selected=new Map(cells.map(c=>[c.id,c]));
  // Keep unchanged tiers still during quote ticks, while promoting new highlights.
  if(previous?.columns===columns&&previous.cells.length===cells.length){
    cells=pack(previous.cells.filter(c=>selected.get(c.id)?.tier===c.tier&&c.y+c.h<=capacityRows));
  }
  const rows=showAll?Math.max(1,...cells.map(c=>c.y+c.h)):viewportRows;
  return {columns,rows,cells};
}
export function opportunityTone(row,signal={}){
  if(row.kind!=='loot'&&Number.isFinite(row.profit)&&row.profit<0)return 'loss';
  return signal.short?'short':signal.long?'long':'';
}
