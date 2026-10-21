import { MODEL_VERSION, summarizeHistory, mergeRecentQuotes } from './model.mjs';

export const DASHBOARD_VERSION = 2;
// Keep all source items; omit fields and lower trader bids the UI never uses.
export function compactSnapshot(data) {
  const items=Object.fromEntries(Object.entries(data.items).map(([id,item])=>{
    const {url,wiki,sourceCategories,sell,buy,...rest}=item;
    const best=(sell||[]).filter(x=>Number.isFinite(x.priceRUB)&&x.priceRUB>0).reduce((a,b)=>!a||b.priceRUB>a.priceRUB?b:a,null);
    return [id,{...rest,sourceCategories:(sourceCategories||[]).filter(k=>['5447e0e74bdc2d3c308b4567','567849dd4bdc2d150f8b456e','5448ecbe4bdc2d60728b4568'].includes(k)),
      sell:best?[{trader:best.trader,priceRUB:best.priceRUB}]:[],
      buy:(buy||[]).map(({trader,priceRUB,currency,minTraderLevel,buyLimit,taskUnlock,gameEditions})=>({trader,priceRUB,currency,minTraderLevel,buyLimit,taskUnlock,gameEditions}))}];
  }));
  return {...data,items};
}

export function compactSignals(book,data,now=Date.now()) {
  const entries={};
  for(const [id,entry] of Object.entries(book?.entries||{})){
    if(!data.items[id]||now-entry.at>2*86400000)continue;
    const summary=entry.summary||(entry.points?summarizeHistory(entry.points,data.items[id],now):null);
    if(summary)entries[id]={at:entry.at,summary:{version:3,at:entry.at,daily:summary.daily||[],recent:mergeRecentQuotes(summary.recent,data.items[id],now)}};
  }
  return {version:3,entries,checkedAt:book?.checkedAt||null,checked:Object.keys(entries).length,total:book?.total||0};
}

export function makeDashboard(data,book,ledger,now=Date.now()) {
  return {version:DASHBOARD_VERSION,modelVersion:MODEL_VERSION,market:data.market,preparedAt:new Date(now).toISOString(),
    snapshot:compactSnapshot(data),signals:compactSignals(book,data,now),ledger:ledger.records||[]};
}
