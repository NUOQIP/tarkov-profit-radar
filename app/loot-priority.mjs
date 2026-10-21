import {SPT_SOURCE,SPT_GROUPS} from './spt-rarity.mjs';
export {SPT_SOURCE};
const rarityById=new Map(Object.entries(SPT_GROUPS).flatMap(([rarity,ids])=>ids.map(id=>[id,rarity])));
const grades={Common:{key:'Common',label:'常见',availability:1},Rare:{key:'Rare',label:'稀有',availability:.55},Superrare:{key:'Superrare',label:'超稀有',availability:.15},Unknown:{key:'Unknown',label:'未收录',availability:.5}};
export const PRIORITY_WEIGHTS=Object.freeze({value:.4,availability:.5,short:.1});
export const RUN_VALUE_CAP=1000000;
export const RUN_MIN_VALUE=30000;
export const qualifiesForRun=row=>Number.isFinite(row.slotValue)&&row.slotValue>=RUN_MIN_VALUE;
export function itemRarity(item={}){
  // Preset objects use the underlying weapon template's rarity.
  const key=rarityById.get(item.baseItem)||rarityById.get(item.id)||rarityById.get(item.valuationId)||'Unknown';
  return grades[key];
}
export function lootPriority(row,signal={}){
  if(!Number.isFinite(row.slotValue)||row.slotValue<=0)return 0;
  const value=Math.min(1,Math.log1p(row.slotValue/10000)/Math.log1p(RUN_VALUE_CAP/10000));
  const availability=itemRarity(row.item).availability*Math.min(1,row.slotValue/30000);
  const change=Number.isFinite(signal.riseChange)?Math.max(0,signal.riseChange):0;
  const short=signal.short&&change>0?.6+.4*Math.min(1,change):0;
  return 100*(PRIORITY_WEIGHTS.value*value+PRIORITY_WEIGHTS.availability*availability+PRIORITY_WEIGHTS.short*short);
}
export function compareLootPriority(a,b){
  return b.quicklookScore-a.quicklookScore || b.slotValue-a.slotValue || a.id.localeCompare(b.id);
}
