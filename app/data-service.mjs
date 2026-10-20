import { MARKETS, MODEL_VERSION, normalizeSnapshot, collectLoot, collectFlips, collectCrafts, analyzeHistory, quoteStatus } from './model.mjs';
const MINUTE=60000, DAY=86400000;
const cache=new class extends Map{
  set(key,value){super.delete(key);super.set(key,value);while(this.size>16)this.delete(this.keys().next().value);return this;}
}(), inflight=new WeakMap();
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
    const prior=cache.get(memoryKey)||await store.read(key);
    if(prior?.version===2&&Date.now()-Date.parse(prior.fetchedAt)<5*MINUTE)return prior;
    try{
      const parts={},names=['items','items_zh','items_en','traders','hideout','barters','crafts','tasks','tasks_zh'];
      for(let index=0;index<names.length;index+=3){
        await Promise.all(names.slice(index,index+3).map(async name=>{
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
  return JSON.stringify([MODEL_VERSION,data.flea.sellOfferFeeRate,data.flea.sellRequirementFeeRate,row.item.basePrice,row.count,row.seconds||0,
    row.recipe?.map(m=>[m.item.id,m.count,m.tool]) || [],row.level,row.task||null,row.editions||[]]);
}
export async function recordDay(store,data,now=Date.now()) {
  const date=new Date(now).toISOString().slice(0,10),hour=Math.floor(now/3600000),key=`ledger/${data.market}/${date}.json`;
  const all=[...collectFlips(data,{includeLosses:true,includeEvents:true},now),...collectCrafts(data,{includeLosses:true,includeEvents:true},now)];
  const change=oldDay=>{
  const prior=oldDay||{date,market:data.market,modelVersion:MODEL_VERSION,hours:[],rows:{}};
  if(prior.hours.includes(hour))return null;
  // Keep only paired fresh sale and material observations; no stale-output profits.
  for(const row of all){
    if(quoteStatus(row.item,data,{},now)!=='可参考'&&row.channel==='跳蚤')continue;
    const version=versionOf(row,data),old=prior.rows[row.id];
    const value=row.kind==='craft'?row.margin/row.hours:row.profit;
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
    const book=await store.read(key)||{entries:{},cursor:0,checkedAt:null};
    const candidates=collectLoot(data,{includeEvents:true}).filter(r=>['可参考','报价延迟'].includes(r.status)&&(r.slotValue>=20000||r.item.change48>=10));
    const rising=[...candidates].filter(r=>r.status==='可参考'&&r.item.change48>=10).sort((a,b)=>b.item.change48-a.item.change48);
    const priority=[...candidates.slice(0,6),...rising.slice(0,6)];
    const freshNeeded=r=>!book.entries[r.item.id]||Date.now()-book.entries[r.item.id].at>60*MINUTE;
    const unseen=[...new Map([...priority.filter(freshNeeded).slice(0,6),...candidates.filter(r=>!book.entries[r.item.id]),...rising.filter(freshNeeded),...candidates.filter(freshNeeded)].map(r=>[r.item.id,r])).values()].slice(0,limit);
    for(let index=0;index<unseen.length;index+=3){
      await Promise.all(unseen.slice(index,index+3).map(async r=>{
        try{
          const result=await history(store,data.market,r.item.id);
          book.entries[r.item.id]={at:result.at,points:result.points};
        }catch{ /* A missing history never produces a substitute trend. */ }
      }));
    }
    const allowed=new Set(candidates.map(r=>r.item.id));
    for(const [id,entry] of Object.entries(book.entries)) if(!data.items[id]||Date.now()-entry.at>2*DAY)delete book.entries[id];
    book.checkedAt=new Date().toISOString();book.total=candidates.length;
    book.checked=candidates.filter(r=>book.entries[r.item.id]).length;
    await store.write(key,book);
    return { ...book, entries:Object.fromEntries(Object.entries(book.entries).filter(([id])=>allowed.has(id))) };
  });
}
export async function digest(store,market,origin) {
  const data=await snapshot(store,market),book=await store.read(`signals/${market}.json`),rows=[...collectFlips(data),...collectCrafts(data)];
  const items=rows.slice(0,10).map(r=>{
    const h=book?.entries[r.item.id],s=h?analyzeHistory(h.points,r.item,data):null;
    return {id:r.id,itemId:r.item.id,name:r.item.name,type:r.kind,profit:Math.round(r.profit),hourly:r.hourly?Math.round(r.hourly):null,
      basis:r.kind==='craft'&&r.fuel===null?'before-fuel':'after-fee',cost:Math.round(r.purchase),market,short:Boolean(s?.short),
      quoteAt:r.item.scan,conditions:{trader:r.trader?.name,level:r.level,task:r.task||null,station:r.station?.name},
      url:`${origin}/?market=${market}&item=${r.item.id}`};
  });
  return {version:1,market,generatedAt:data.fetchedAt,source:data.source,delivery:'read-only; no QQ messages sent',items,
    text:[`塔科夫赚钱监控 · ${MARKETS[market]}`,...items.slice(0,5).map(i=>`${i.name} · 预计${i.basis==='before-fuel'?'扣燃料前':''}收益 ₽${i.profit.toLocaleString('zh-CN')}`),`${origin}/?market=${market}`].join('\n')};
}
export async function handleApi(request,store) {
  const url=new URL(request.url),market=url.searchParams.get('market')||'pve';
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(request.method!=='GET')return json({error:'只支持读取'},405);
  if(!Object.hasOwn(MARKETS,market))return json({error:'未知市场'},400);
  try{
    if(url.pathname==='/api/snapshot')return json(await snapshot(store,market));
    if(url.pathname==='/api/history'){
      const id=url.searchParams.get('id');if(!/^[0-9a-f]{24}$/.test(id||''))return json({error:'物品 ID 无效'},400);
      return json(await history(store,market,id));
    }
    if(url.pathname==='/api/signals')return json(await scanSignals(store,await snapshot(store,market)));
    if(url.pathname==='/api/ledger')return json(await profitHistory(store,market));
    if(url.pathname==='/api/feed')return json(await digest(store,market,url.origin));
    if(url.pathname==='/api/collect'){
      const data=await snapshot(store,market),signals=await scanSignals(store,data,18);
      return json({market,fetchedAt:data.fetchedAt,warning:data.warning||data.collectionWarning||null,historyChecked:signals.checked,historyTotal:signals.total});
    }
    if(url.pathname==='/api/health')return json({ok:true,modelVersion:MODEL_VERSION,markets:Object.keys(MARKETS)});
    return json({error:'接口不存在'},404);
  }catch(error){return json({error:error.message},502);}
}
