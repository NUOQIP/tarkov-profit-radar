// Only public market bundles are persisted here. Account data never enters this cache.
const MARKETS=new Set(['pve','regular','pvp-season']);
const MAX_AGE=86400000;
function valid(entry,market,now){
  const value=entry?.value;
  return MARKETS.has(market)&&value?.version===2&&value.market===market&&value.snapshot?.market===market&&
    value.snapshot.items&&value.signals?.entries&&Number.isFinite(entry.savedAt)&&now-entry.savedAt>=0&&now-entry.savedAt<MAX_AGE;
}
export function browserDashboardStore(indexedDB=globalThis.indexedDB){
  let opening;
  function open(){
    if(!opening)opening=new Promise(resolve=>{
      if(!indexedDB){resolve(null);return;}
      let settled=false;
      const done=db=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);resolve(db);};
      const timer=setTimeout(()=>done(null),300);
      try{
        const request=indexedDB.open('loot-radar-public-market',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('dashboards');
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();done(db);};
        request.onerror=request.onblocked=()=>done(null);
      }catch{done(null);}
    });
    return opening;
  }
  async function run(mode,key,value){
    const db=await open();if(!db)return null;
    return new Promise(resolve=>{
      let settled=false,result=null;
      const done=value=>{if(!settled){settled=true;clearTimeout(timer);resolve(value);}};
      const timer=setTimeout(()=>done(null),mode==='readonly'?300:1500);
      try{
        const tx=db.transaction('dashboards',mode),store=tx.objectStore('dashboards');
        const request=mode==='readonly'?store.get(key):store.put(value,key);
        request.onsuccess=()=>{result=request.result;};
        tx.oncomplete=()=>done(result);tx.onerror=tx.onabort=()=>done(null);
      }catch{done(null);}
    });
  }
  return {read:key=>run('readonly',key),write:(key,value)=>run('readwrite',key,value)};
}
export function createDashboardClient({fetcher=globalThis.fetch,store=browserDashboardStore(),now=Date.now,modelVersion}={}){
  const memory=new Map(),reads=new Map();
  const usable=(entry,market)=>valid(entry,market,now())&&(!modelVersion||entry.value.modelVersion===modelVersion);
  async function read(market){
    if(!MARKETS.has(market))return null;
    let entry=memory.get(market);
    if(!entry){
      if(!reads.has(market))reads.set(market,Promise.resolve().then(()=>store.read(market)).catch(()=>null).finally(()=>reads.delete(market)));
      entry=await reads.get(market);
      // A newer network response may have arrived while IndexedDB was reading.
      entry=memory.get(market)||entry;
      if(usable(entry,market))memory.set(market,entry);
    }
    return usable(entry,market)?entry.value:null;
  }
  async function load(market,{signal}={}){
    if(!MARKETS.has(market))throw new Error('未知市场');
    const cached=memory.get(market),headers=cached?.etag?{'If-None-Match':cached.etag}:{};
    let response=await fetcher('/api/dashboard?market='+encodeURIComponent(market),{signal,headers,credentials:'omit',cache:'no-cache'});
    if(response.status===304){
      if(usable(cached,market))return cached.value;
      response=await fetcher('/api/dashboard?market='+encodeURIComponent(market),{signal,credentials:'omit',cache:'reload'});
    }
    const value=await response.json();
    signal?.throwIfAborted();
    if(!response.ok)throw new Error(value.error||'行情读取失败');
    const entry={value,etag:response.headers.get('etag'),savedAt:now()};
    if(!usable(entry,market))throw new Error('行情数据不完整');
    memory.set(market,entry);
    // Persistence is best effort; quota limits must not block displaying the market.
    Promise.resolve().then(()=>store.write(market,entry)).catch(()=>{});
    return value;
  }
  return {read,load};
}
