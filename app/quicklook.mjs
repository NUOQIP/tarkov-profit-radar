import {isCommonFind,compareLootPriority} from './loot-priority.mjs';

const MIN_SIDE=4,GAP=4;
const distance=(r,w,h)=>Math.hypot((r.x+r.w/2-w/2)/(w/2),(r.y+r.h/2-h/2)/(h/2));

// A centre-anchored treemap: carve one focal card, then divide the remaining
// rectangles. Every split conserves area, so there are no holes to patch later.
function mosaic(columns,rows,count,familiarCount){
  const root={x:0,y:0,w:columns,h:rows},rectangles=[];
  if(count<5||columns<MIN_SIDE*3&&rows<MIN_SIDE*3)rectangles.push(root);
  else {
    const framedX=columns>=MIN_SIDE*3,framedY=rows>=MIN_SIDE*3;
    const area=columns*rows,heroArea=Math.max(Math.sqrt(area*MIN_SIDE**2*1.8),area/Math.max(2,count)*1.8);
    const w=framedX?Math.max(MIN_SIDE,Math.min(columns-MIN_SIDE*2,Math.round(Math.sqrt(heroArea*1.1)))):columns;
    const h=framedY?Math.max(MIN_SIDE,Math.min(rows-MIN_SIDE*2,Math.round(heroArea/w))):rows;
    const x=Math.floor((columns-w)/2),y=Math.floor((rows-h)/2);
    rectangles.push({x,y,w,h,focal:true});
    if(y)rectangles.push({x:0,y:0,w:columns,h:y});
    if(y+h<rows)rectangles.push({x:0,y:y+h,w:columns,h:rows-y-h});
    if(x)rectangles.push({x:0,y,w:x,h});
    if(x+w<columns)rectangles.push({x:x+w,y,w:columns-x-w,h});
  }
  // The desired area falls smoothly with distance, leaving a few larger cards
  // near the centre and many small ones outside. Dimensions never drop below
  // the readable minimum. This is independent of item price outliers.
  const boost=Math.max(10,columns*rows/(Math.max(12,Math.min(24,familiarCount||20))*MIN_SIDE**2)*1.4);
  const target=r=>MIN_SIDE**2*(1+boost*Math.exp(-4*distance(r,columns,rows)**2));
  function division(rect){
    if(rect.focal)return null;
    let best=null;
    for(const axis of ['w','h']){
      const extent=rect[axis];if(extent<MIN_SIDE*2)continue;
      for(let cut=MIN_SIDE;cut<=extent-MIN_SIDE;cut++){
        const a={...rect,[axis]:cut},b={...rect,[axis]:extent-cut,...(axis==='w'?{x:rect.x+cut}:{y:rect.y+cut})};
        const imbalance=Math.abs(Math.log((a.w*a.h/target(a))/(b.w*b.h/target(b))));
        const aspect=Math.abs(Math.log(a.w/a.h))+Math.abs(Math.log(b.w/b.h));
        const cost=imbalance+.35*aspect;
        if(!best||cost<best.cost-1e-9)best={a,b,cost};
      }
    }
    return best;
  }
  // Cache split candidates per rectangle; resizing is cheap and price-only
  // refreshes can retain the previous plan entirely.
  const candidates=new Map();
  for(const r of rectangles)candidates.set(r,division(r));
  while(rectangles.length<count){
    let choice=null,score=1.55;
    for(const r of rectangles){
      const split=candidates.get(r),aspect=Math.max(r.w/r.h,r.h/r.w);
      const s=Math.max(r.w*r.h/target(r),aspect>2.2?1.56:0);
      if(split&&s>score){choice=r;score=s;}
    }
    if(!choice)break;
    const {a,b}=candidates.get(choice),index=rectangles.indexOf(choice);
    rectangles.splice(index,1,a,b);candidates.delete(choice);candidates.set(a,division(a));candidates.set(b,division(b));
  }
  // Highest priorities own the largest tiles, with centrality breaking ties.
  // Since common finds lead the ranking, expensive rare finds cannot take over.
  return rectangles.sort((a,b)=>Number(Boolean(b.focal))-Number(Boolean(a.focal))||b.w*b.h-a.w*a.h||distance(a,columns,rows)-distance(b,columns,rows)||a.y-b.y||a.x-b.x);
}

export function quicklookLayout(items,{width=640,height=420,compact=false,lookup=false,previous=null}={}){
  const unit=Math.max(12,Math.min(compact?14:16,Math.floor(Math.min(width,height)/28)));
  const columns=Math.max(MIN_SIDE,Math.min(96,Math.floor((width+GAP)/(unit+GAP))));
  const primaryRows=Math.max(MIN_SIDE,Math.floor((height+GAP)/(unit+GAP)));
  const rowHeight=Math.max(1,(height-GAP*(primaryRows-1))/primaryRows);
  const ranked=[...new Map(items.filter(r=>lookup||Number.isFinite(r.slotValue)&&r.slotValue>0).map(r=>[r.id,r])).values()];
  if(!lookup)ranked.sort(compareLootPriority);
  const signature=ranked.map(r=>`${r.id}:${isCommonFind(r)?1:0}`).sort().join('|');
  if(previous?.columns===columns&&previous.primaryRows===primaryRows&&previous.rowHeight===rowHeight&&previous.lookup===lookup&&previous.signature===signature)return previous;
  let cells=[];
  if(lookup){
    const w=Math.min(columns,6),h=6,perRow=Math.max(1,Math.floor(columns/w));
    cells=ranked.map((r,i)=>({id:r.id,x:i%perRow*w,y:Math.floor(i/perRow)*h,w,h,tier:'standard',group:'lookup'}));
  }else if(ranked.length){
    const common=ranked.filter(isCommonFind),other=ranked.filter(r=>!isCommonFind(r));
    const rects=mosaic(columns,primaryRows,ranked.length,common.length);
    const sizes=[...new Set(rects.filter(r=>!r.focal).map(r=>r.w*r.h))].sort((a,b)=>b-a);
    // Retain a few high-value reminders on small screens while the familiar
    // finds keep the larger central tiles. Nothing is duplicated or fabricated.
    const reminders=Math.min(other.length,Math.floor(rects.length*.2));
    const commonCount=Math.min(common.length,rects.length-reminders);
    const selected=[...common.slice(0,commonCount),...other,...common.slice(commonCount)].slice(0,rects.length);
    cells=rects.map((r,i)=>{
      const step=sizes.length>1?Math.min(3,Math.floor(4*sizes.indexOf(r.w*r.h)/sizes.length)):3;
      const tier=rects.length>1&&r.focal?'large':['medium','standard','small','micro'][step];
      return {id:selected[i].id,x:r.x,y:r.y,w:r.w,h:r.h,tier,group:'cloud'};
    });
  }
  const rows=cells.length?(lookup?Math.max(...cells.map(c=>c.y+c.h)):primaryRows):0;
  return {columns,rows,primaryRows,rowHeight,tracks:Array(rows).fill(rowHeight),sections:[],cells,lookup,signature,hidden:ranked.length-cells.length,height:rows*rowHeight+GAP*Math.max(0,rows-1)};
}
export function opportunityTone(row,signal={}){
  if(row.kind!=='loot'&&Number.isFinite(row.profit)&&row.profit<0)return 'loss';
  return signal.short?'short':signal.long?'long':'';
}
