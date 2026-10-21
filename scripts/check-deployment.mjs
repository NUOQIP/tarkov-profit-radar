// Run from the server first, then from a player's network against the public URL.
const base=new URL(process.argv[2]||'http://127.0.0.1:8787');
if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw new Error('Use a plain HTTP(S) base URL without credentials.');
async function get(path,headers={}){
  const start=performance.now();
  const response=await fetch(new URL(path,base),{headers,signal:AbortSignal.timeout(60000)});
  const body=await response.text();
  return {response,body,ms:Math.round(performance.now()-start)};
}
function ensure(condition,message){if(!condition)throw new Error(message);}
const health=await get('/api/health');
ensure(health.response.ok&&JSON.parse(health.body).service==='tarkov-profit-radar','Health check failed');
for(const path of ['/api/spt-status','/api/spt-check'])ensure((await get(path)).response.status===404,'SPT management must not be public');
const rows=[];
for(const market of ['pve','regular','pvp-season']){
  const first=await get('/api/dashboard?market='+market,{'Accept-Encoding':'gzip'});
  ensure(first.response.ok,`${market}: HTTP ${first.response.status}`);
  const data=JSON.parse(first.body),count=Object.keys(data.snapshot?.items||{}).length;
  const ageMinutes=(Date.now()-Date.parse(data.snapshot?.fetchedAt))/60000;
  ensure(data.market===market&&data.snapshot?.market===market&&count>0,`${market}: missing or incorrect market data`);
  ensure(data.signals?.entries&&Array.isArray(data.ledger),`${market}: missing tags or profit ledger`);
  ensure(Number.isFinite(ageMinutes)&&ageMinutes>=-1&&ageMinutes<=15,`${market}: snapshot is stale; let collection complete, then retry`);
  ensure(!data.snapshot.warning,`${market}: upstream update failed`);
  ensure(first.response.headers.get('content-encoding')==='gzip',`${market}: gzip missing`);
  const etag=first.response.headers.get('etag');
  ensure(etag,`${market}: ETag missing`);
  const cached=await get('/api/dashboard?market='+market,{'If-None-Match':etag});
  // A background collection can legitimately replace the batch between requests.
  ensure(cached.response.status===304||(cached.response.ok&&cached.response.headers.get('etag')!==etag),`${market}: conditional requests failed`);
  rows.push({market,items:count,history:Object.keys(data.signals.entries).length,
    ageMinutes:Math.round(ageMinutes*10)/10,loadMs:first.ms,cacheMs:cached.ms,
    compressedBytes:Number(first.response.headers.get('content-length'))||null});
}
for(const path of ['/','/radar.js','/radar.css','/engine.js','/quicklook.js','/update-window.js','/navigation.mjs','/loot-priority.mjs','/spt-rarity.mjs','/fence.webp','/favicon.svg']){
  const asset=await get(path);ensure(asset.response.ok&&asset.body.length>0,`Asset missing: ${path}`);
}
ensure((await get('/api/feed')).response.status===404,'QQ endpoint should remain unavailable');
console.log(JSON.stringify({ok:true,origin:base.origin,markets:rows},null,2));
