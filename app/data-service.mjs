import { MARKETS, MODEL_VERSION, EVENT_METADATA_VERSION, applyEventMetadata, normalizeSnapshot, normalizeProfile, collectLoot, collectFlips, collectCrafts, analyzeHistory, analyzeHistorySummary, mergeRecentQuotes, quoteStatus, feeBasePrice, isShortOpportunity } from './model.mjs';
import { DASHBOARD_VERSION, compactSignals, makeDashboard } from './dashboard.mjs';
const MINUTE=60000, DAY=86400000;
const cache=new class extends Map{
  set(key,value){super.delete(key);super.set(key,value);while(this.size>16)this.delete(this.keys().next().value);return this;}
}(), inflight=new WeakMap(), encodedDashboards=new WeakMap(), dashboardReadAt=new WeakMap();
const keyFor=(store,key)=>`${store.namespace}:${key}`;
async function once(store,key,fn) {
  // R2 stores are created per request. Do not share an in-flight I/O promise across
  // Worker requests: a disconnected caller can otherwise strand later callers.
  let pending=inflight.get(store);
  if(!pending){pending=new Map();inflight.set(store,pending);}
  if(pending.has(key))return pending.get(key);
  const work=fn().finally(()=>pending.delete(key));pending.set(key,work);return work;
}
async function upstream(path) {
  const response=await fetch(`https://json.tarkov.dev/${path}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`上游暂不可用（${response.status}）`);
  return response.json();
}
export function r2Store(bucket) {
  if(!bucket)throw new Error('行情存储尚未连接');
  return {
    namespace:'hosted',
    async read(key){const obj=await bucket.get(key);return obj?obj.json():null;},
    async write(key,value){await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});},
    async update(key,change){
      for(let attempt=0;attempt<4;attempt++){
        const object=await bucket.get(key),prior=object?await object.json():null;
        const next=change(prior);if(next===null)return;
        const onlyIf=object?{etagMatches:object.etag}:new Headers({'If-None-Match':'*'});
        const written=await bucket.put(key,JSON.stringify(next),{onlyIf,httpMetadata:{contentType:'application/json'}});
        if(written)return;
      }
      throw new Error('并发留档未完成，等待下次采集');
    }
  };
}
async function cachedSource(store,market,name,maxAge) {
  const key=`source/${market}/${name}.json`;
  const old=await store.read(key);
  if(old&&Date.now()-old.at<maxAge)return old.value;
  try{
    const value=await upstream(`${market}/${name}`),entry={at:Date.now(),value};
    await store.write(key,entry);return value;
  }catch(error){if(maxAge>5*MINUTE&&old&&Date.now()-old.at<7*DAY)return old.value;throw error;}
}
export async function snapshot(store,market) {
  const key=`snapshot/${market}.json`,memoryKey=keyFor(store,key);
  return once(store,memoryKey,async()=>{
    const prior=applyEventMetadata(cache.get(memoryKey)||await store.read(key));
    if(prior?.version===2&&prior.modelVersion===MODEL_VERSION&&prior.profileMetadataVersion===2&&prior.imageVersion===1&&prior.categoryMetadataVersion===1&&Date.now()-Date.parse(prior.fetchedAt)<5*MINUTE)return prior;
    try{
      const parts={},names=['items','items_zh','items_en','traders','hideout','barters','crafts','tasks','tasks_zh'];
      for(let index=0;index<names.length;index+=6){
        await Promise.all(names.slice(index,index+6).map(async name=>{
          const age=['items','traders','barters','crafts'].includes(name)?5*MINUTE:12*60*MINUTE;
          parts[name]=await cachedSource(store,market,name,age);
        }));
      }
      const data=normalizeSnapshot(parts,market);
      const taskMap=parts.tasks?.data?.tasks||{},zh=parts.tasks_zh?.data||{};
      data.tasks=Object.fromEntries(Object.values(taskMap).map(t=>[t.id,{id:t.id,name:zh[t.name]||t.normalizedName,level:t.minPlayerLevel}]));
      delete data.taskNames;
      await store.write(key,data);cache.set(memoryKey,data);
      try{await recordDay(store,data);}catch{data.collectionWarning='收益档案暂未保存，当前行情可用。';}
      return data;
    }catch(error){
      if(prior?.version===2)return {...prior,warning:`更新失败，保留 ${prior.fetchedAt} 的快照：${error.message}`};
      throw error;
    }
  });
}
function versionOf(row,data){
  return JSON.stringify([MODEL_VERSION,data.flea.sellOfferFeeRate,data.flea.sellRequirementFeeRate,feeBasePrice(row.item,data),row.count,row.seconds||0,
    row.recipe?.map(m=>[m.item.id,m.count,m.tool]) || [],row.level,row.task||null,row.editions||[]]);
}
export async function recordDay(store,data,now=Date.now()) {
  const date=new Date(now).toISOString().slice(0,10),hour=Math.floor(now/3600000),key=`ledger/${data.market}/${date}.json`;
  const profile={...normalizeProfile(),includeLosses:true,includeEvents:true};
  const all=[...collectFlips(data,profile,now),...collectCrafts(data,profile,now)];
  const change=oldDay=>{
  const prior=oldDay||{date,market:data.market,modelVersion:MODEL_VERSION,hours:[],rows:{}};
  if(prior.hours.includes(hour))return null;
  // Keep only paired fresh sale and material observations; no stale-output profits.
  for(const row of all){
    if(quoteStatus(row.item,data,{},now)!=='可参考'&&row.channel==='跳蚤')continue;
    const version=versionOf(row,data),old=prior.rows[row.id];
    const value=row.profit;
    const entry=old?.version===version?old:{version,count:0,sum:0,min:Infinity,max:-Infinity,positive:0,kind:row.kind};
    entry.count++;entry.sum+=value;entry.min=Math.min(entry.min,value);entry.max=Math.max(entry.max,value);
    if(value>0)entry.positive++;
    prior.rows[row.id]=entry;
  }
  prior.hours.push(hour);prior.updatedAt=new Date(now).toISOString();
  return prior;
  };
  if(store.update)await store.update(key,change);
  else await once(store,keyFor(store,`write/${key}`),async()=>{const next=change(await store.read(key));if(next)await store.write(key,next);});
  cache.delete(keyFor(store,`ledger-index/${data.market}`));
}
export async function profitHistory(store,market,now=Date.now()) {
  const key=keyFor(store,`ledger-index/${market}`),old=cache.get(key);
  if(old&&now-old.at<60*MINUTE)return old.value;
  const days=[];
  for(let index=0;index<=30;index++){
    const date=new Date(now-index*DAY).toISOString().slice(0,10);
    days.push(`ledger/${market}/${date}.json`);
  }
  const records=[];
  for(let index=0;index<days.length;index+=5){
    const values=await Promise.all(days.slice(index,index+5).map(k=>store.read(k)));
    records.push(...values.filter(Boolean));
  }
  const value={market,days:records.length,records};
  cache.set(key,{at:now,value});return value;
}
export async function history(store,market,id) {
  const key=`history/${market}/${id}.json`,memoryKey=keyFor(store,key);
  return once(store,memoryKey,async()=>{
    const old=cache.get(memoryKey)||await store.read(key);
    if(old&&Date.now()-old.at<30*MINUTE)return old;
    try{
      const raw=await upstream(`${market}/prices/${id}`);
      if(!Array.isArray(raw.data))throw new Error('历史数据格式异常');
      const cutoff=Date.now()-32*DAY;
      const result={market,id,at:Date.now(),points:raw.data.filter(p=>p.timestamp>=cutoff&&p.priceMin>0)};
      await store.write(key,result);cache.set(memoryKey,result);return result;
    }catch(error){if(old)return {...old,warning:'历史数据暂未更新'};throw error;}
  });
}
export async function scanSignals(store,data,limit=12) {
  const key=`signals/${data.market}.json`,memoryKey=keyFor(store,key);
  return once(store,memoryKey,async()=>{
    const [stored,scanState]=await Promise.all([store.read(key),store.read(`signal-scan/${data.market}.json`)]);
    const now=Date.now(),book=compactSignals(stored,data,now),attempts=scanState?.attempts||{};
    const candidates=collectLoot(data,{includeEvents:true}).filter(r=>['可参考','报价延迟'].includes(r.status)&&(r.slotValue>=20000||r.item.change48>=10));
    const eligible=candidates.filter(r=>{
      const attempt=attempts[r.item.id],backoff=attempt?.failures?Math.min(6*60,60*2**Math.min(attempt.failures-1,3))*MINUTE:60*MINUTE;
      return (!attempt||now-attempt.at>=backoff)&&(!book.entries[r.item.id]||now-book.entries[r.item.id].at>=60*MINUTE);
    });
    // Reserve capacity for old known histories as well as new items. A 48h fall
    // must not hide a price which is still well above the weekly normal.
    const rising=eligible.map(r=>({r,s:book.entries[r.item.id]?.summary?analyzeHistorySummary(book.entries[r.item.id].summary,r.item,data,{},now):null}))
      .filter(({r,s})=>s?.watch||s?.short||s?.change7>=.15||s?.change24>=.2||r.item.change48>=10)
      .sort((a,b)=>(b.s?.riseChange??b.s?.change7??b.r.item.change48/100)-(a.s?.riseChange??a.s?.change7??a.r.item.change48/100)).map(x=>x.r);
    const oldest=(a,b)=>(attempts[a.item.id]?.at||book.entries[a.item.id]?.at||0)-(attempts[b.item.id]?.at||book.entries[b.item.id]?.at||0);
    const known=eligible.filter(r=>book.entries[r.item.id]&&now-book.entries[r.item.id].at>=12*60*MINUTE).sort(oldest);
    const unseen=eligible.filter(r=>!book.entries[r.item.id]).sort(oldest);
    const fair=[];for(let n=0;n<Math.max(known.length,unseen.length);n++){if(known[n])fair.push(known[n]);if(unseen[n])fair.push(unseen[n]);}
    const selected=[...new Map([...rising.slice(0,Math.floor(limit/2)),...fair,...rising].map(r=>[r.item.id,r])).values()].slice(0,limit);
    for(let index=0;index<selected.length;index+=6){
      await Promise.all(selected.slice(index,index+6).map(async r=>{
        const previous=attempts[r.item.id];let failed=true;
        try{
          const result=await history(store,data.market,r.item.id);
          const entry=compactSignals({entries:{[r.item.id]:result}},data).entries[r.item.id];
          if(entry){
            // The full-history source can update less often than live quotes.
            entry.summary.recent=mergeRecentQuotes([...(book.entries[r.item.id]?.summary.recent||[]),...entry.summary.recent],r.item);
            book.entries[r.item.id]=entry;
          }
          failed=Boolean(result.warning)||!result.points?.length;
        }catch{ /* Missing evidence is never replaced with an invented trend. */ }
        attempts[r.item.id]={at:Date.now(),failures:failed?(previous?.failures||0)+1:0};
      }));
    }
    const allowed=new Set(candidates.map(r=>r.item.id));
    for(const [id,entry] of Object.entries(book.entries)) if(!data.items[id]||Date.now()-entry.at>2*DAY)delete book.entries[id];
    book.checkedAt=new Date().toISOString();book.total=candidates.length;
    book.checked=candidates.filter(r=>book.entries[r.item.id]).length;
    await store.write(key,book);
    await store.write(`signal-scan/${data.market}.json`,{attempts:Object.fromEntries(Object.entries(attempts).filter(([id,a])=>data.items[id]&&now-a.at<7*DAY))});
    return { ...book, entries:Object.fromEntries(Object.entries(book.entries).filter(([id])=>allowed.has(id))) };
  });
}
export async function digest(store,market,origin) {
  const data=await snapshot(store,market),book=await store.read(`signals/${market}.json`),profile=normalizeProfile(),rows=[...collectFlips(data,profile),...collectCrafts(data,profile)].sort((a,b)=>b.profit-a.profit);
  const items=rows.slice(0,10).map(r=>{
    const h=book?.entries[r.item.valuationId||r.item.id],s=h?.summary?analyzeHistorySummary(h.summary,r.item,data,profile):h?.points?analyzeHistory(h.points,r.item,data,profile):null;
    return {id:r.id,itemId:r.item.id,name:r.item.name,type:r.kind,profit:Math.round(r.profit),hourly:r.hourly?Math.round(r.hourly):null,
      basis:r.kind==='craft'&&r.fuel===null?'before-fuel':'after-fee',cost:Math.round(r.purchase),market,short:isShortOpportunity(r,s),
      quoteAt:r.item.scan,conditions:{trader:r.trader?.name,level:r.level,task:r.task||null,station:r.station?.name},
      url:`${origin}/?market=${market}&item=${r.item.id}`};
  });
  return {version:1,market,generatedAt:data.fetchedAt,source:data.source,delivery:'read-only; no QQ messages sent',items,
    text:[`塔科夫赚钱监控 · ${MARKETS[market]}`,...items.slice(0,5).map(i=>`${i.name} · 预计${i.basis==='before-fuel'?'扣燃料前':''}收益 ₽${i.profit.toLocaleString('zh-CN')}`),`${origin}/?market=${market}`].join('\n')};
}
const validDashboard=value=>value?.version===DASHBOARD_VERSION&&value.modelVersion===MODEL_VERSION&&value.snapshot?.eventMetadataVersion===EVENT_METADATA_VERSION;
async function saveDashboard(store,data,book) {
  const result=makeDashboard(data,book,await profitHistory(store,data.market));
  await store.write(`dashboard/${data.market}.json`,result);
  dashboardReadAt.set(result,Date.now());
  cache.set(keyFor(store,`dashboard/${data.market}`),result);return result;
}
export async function collectMarket(store,market,limit=18) {
  return once(store,`collect/${market}`,async()=>{
    const data=await snapshot(store,market);
    // Publish current quotes with available evidence before slow upstream scans.
    await saveDashboard(store,data,await store.read(`signals/${market}.json`));
    const book=await scanSignals(store,data,limit);
    return saveDashboard(store,data,book);
  });
}
async function refreshInBackground(store,market) {
  // R2-backed lease coalesces visitors across Worker isolates. Expiry recovers crashes.
  let acquired=false;const key=`refresh-lease/${market}.json`,now=Date.now();
  const claim=old=>{acquired=false;if(old&&now-old.at<5*MINUTE)return null;acquired=true;return {at:now};};
  if(store.update)await store.update(key,claim);
  else {const value=claim(await store.read(key));if(value)await store.write(key,value);}
  if(acquired)await collectMarket(store,market,12);
}
export async function dashboard(store,market,waitUntil) {
  const key=`dashboard/${market}.json`,memoryKey=keyFor(store,`dashboard/${market}`);
  return once(store,`read/${key}`,async()=>{
    let ready=cache.get(memoryKey);
    // Other Worker isolates can publish a newer bundle. Recheck shared storage
    // periodically instead of retaining an isolate's first bundle indefinitely.
    if(!ready||Date.now()-(dashboardReadAt.get(ready)||0)>=30000){
      try{ready=(await store.read(key))||ready;}
      catch(error){if(!validDashboard(ready))throw error;}
      if(ready)dashboardReadAt.set(ready,Date.now());
    }
    if(!validDashboard(ready)){
      // Upgrade existing caches without making the visitor wait for new histories.
      const cached=await store.read(`snapshot/${market}.json`);
      const data=cached?.version===2&&cached.modelVersion===MODEL_VERSION?applyEventMetadata(cached):await snapshot(store,market);
      ready=await saveDashboard(store,data,await store.read(`signals/${market}.json`));
    }
    cache.set(memoryKey,ready);
    if(waitUntil&&(Date.now()-Date.parse(ready.snapshot.fetchedAt)>=5*MINUTE||Date.now()-Date.parse(ready.preparedAt)>=5*MINUTE)){
      waitUntil(refreshInBackground(store,market).catch(()=>{}));
    }
    return ready;
  });
}
export async function handleApi(request,store,context={}) {
  const url=new URL(request.url),market=url.searchParams.get('market')||'pve';
  const json=(value,status=200,headers={})=>{
    const isDashboard=Boolean(value?.snapshot&&value.version===DASHBOARD_VERSION);
    let body=isDashboard?encodedDashboards.get(value):null;
    if(!body){body=JSON.stringify(value);if(isDashboard)encodedDashboards.set(value,body);}
    return new Response(body,{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  };
  if(request.method!=='GET')return json({error:'只支持读取'},405);
  if(!Object.hasOwn(MARKETS,market))return json({error:'未知市场'},400);
  try{
    if(url.pathname==='/api/dashboard'){
      const ready=await dashboard(store,market,context.waitUntil),etag=`"dashboard-${market}-${ready.preparedAt}-${DASHBOARD_VERSION}"`;
      const headers={'ETag':etag,'Cache-Control':'public, max-age=30, stale-while-revalidate=60'};
      if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
      return json(ready,200,headers);
    }
    if(url.pathname==='/api/snapshot')return json((await dashboard(store,market,context.waitUntil)).snapshot);
    if(url.pathname==='/api/history'){
      const id=url.searchParams.get('id');if(!/^[0-9a-f]{24}$/.test(id||''))return json({error:'物品 ID 无效'},400);
      return json(await history(store,market,id));
    }
    if(url.pathname==='/api/signals')return json((await dashboard(store,market,context.waitUntil)).signals);
    if(url.pathname==='/api/ledger')return json(await profitHistory(store,market));
    if(url.pathname==='/api/collect'){
      await refreshInBackground(store,market);
      const ready=await dashboard(store,market);
      return json({market,fetchedAt:ready.snapshot.fetchedAt,warning:ready.snapshot.warning||null,historyChecked:ready.signals.checked,historyTotal:ready.signals.total});
    }
    if(url.pathname==='/api/health')return json({ok:true,service:'tarkov-profit-radar',modelVersion:MODEL_VERSION,markets:Object.keys(MARKETS)});
    return json({error:'接口不存在'},404);
  }catch(error){return json({error:error.message},502);}
}
