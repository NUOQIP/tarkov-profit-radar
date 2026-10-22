// Derived prices are keyed by the exact snapshot, valuation options and time window.
export function createRowCache(collectors,{now=Date.now,ttl=60000,maxEntries=8}={}){
  const snapshots=new WeakMap();
  return function rows(snapshot,kind,options){
    let cache=snapshots.get(snapshot);
    if(!cache){cache=new Map();snapshots.set(snapshot,cache);}
    const key=JSON.stringify([kind,options]),stamp=now(),hit=cache.get(key);
    if(hit&&stamp-hit.at>=0&&stamp-hit.at<ttl){cache.delete(key);cache.set(key,hit);return hit.rows;}
    const result=collectors[kind](snapshot,options,stamp);
    cache.delete(key);cache.set(key,{at:stamp,rows:result});
    while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
    return result;
  };
}
