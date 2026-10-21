import { isEventItem } from './model.mjs';

export const OVERRIDES_KEY='admin/item-overrides.json';
export const RARITY_KEYS=['Common','Rare','Superrare','Unknown'];
const entries=new WeakMap(),bundles=new WeakMap();
const empty=()=>({version:1,revision:0,items:{},audit:[]});
export async function readItemOverrides(store){
  const hit=entries.get(store);
  if(hit&&Date.now()-hit.at<5000)return hit.value;
  const value=await store.read(OVERRIDES_KEY)||empty();
  if(value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||!value.items||typeof value.items!=='object'||Array.isArray(value.items)||!Array.isArray(value.audit))throw new Error('物品分类数据格式错误');
  entries.set(store,{at:Date.now(),value});return value;
}
export function itemOverride(item,config){
  const own=config.items[item.id]||{},base=config.items[item.baseItem]||{};
  return {eventOnly:typeof own.eventOnly==='boolean'?own.eventOnly:base.eventOnly,
    rarity:RARITY_KEYS.includes(own.rarity)?own.rarity:base.rarity};
}
export function applyItemOverrides(data,config){
  const items=Object.fromEntries(Object.entries(data.items).map(([id,item])=>{
    const rule=itemOverride(item,config),patch={};
    if(typeof rule.eventOnly==='boolean'){
      patch.eventOnlyOverride=rule.eventOnly;patch.eventOnly=rule.eventOnly;
      patch.excluded=Boolean(item.currencyOnly||(item.excluded&&!isEventItem(item))||rule.eventOnly);
    }
    if(RARITY_KEYS.includes(rule.rarity))patch.rarityOverride=rule.rarity;
    return [id,Object.keys(patch).length?{...item,...patch}:item];
  }));
  return {...data,classificationRevision:config.revision,items};
}
export async function classifiedDashboard(store,ready){
  const config=await readItemOverrides(store),hit=bundles.get(ready);
  if(hit?.revision===config.revision)return hit.value;
  const value={...ready,snapshot:applyItemOverrides(ready.snapshot,config)};
  bundles.set(ready,{revision:config.revision,value});return value;
}
export async function saveItemOverride(store,id,patch,revision,now=new Date().toISOString()){
  if(!/^[a-f0-9]{24}$/.test(id)||!Number.isSafeInteger(revision)||revision<0)throw Object.assign(new Error('物品或版本无效'),{status:400});
  if(!patch||Object.keys(patch).some(k=>!['eventOnly','rarity'].includes(k))||
    !Object.hasOwn(patch,'eventOnly')||!Object.hasOwn(patch,'rarity')||
    !(patch.eventOnly===null||typeof patch.eventOnly==='boolean')||
    !(patch.rarity===null||RARITY_KEYS.includes(patch.rarity)))throw Object.assign(new Error('分类设置无效'),{status:400});
  await store.update(OVERRIDES_KEY,prior=>{
    const old=prior||empty();
    if(old.revision!==revision)throw Object.assign(new Error('分类已在其他窗口修改，请重新载入后保存'),{status:409});
    const next={},items={...old.items},before=items[id]||null;
    if(patch.eventOnly!==null)next.eventOnly=patch.eventOnly;
    if(patch.rarity!==null)next.rarity=patch.rarity;
    if(Object.keys(next).length)items[id]={...next,updatedAt:now};else delete items[id];
    return {version:1,revision:old.revision+1,updatedAt:now,items,
      audit:[{id,at:now,before,after:items[id]||null},...(old.audit||[])].slice(0,200)};
  });
  entries.delete(store);return readItemOverrides(store);
}
