import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createRadarServer} from '../app/http-server.mjs';
import {clientAssets} from '../app/client-assets.mjs';
import {collectLoot,collectCatalog,collectFlips,collectCrafts,normalizeProfile,resolveTradingProfile} from '../app/model.mjs';
import {createRowCache} from '../app/row-cache.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),baseline=resolve(process.argv[2]);
const {createRadarServer:previousServer}=await import(pathToFileURL(join(baseline,'app/http-server.mjs')));
const sample=JSON.parse(await readFile(join(root,'.cache/v2/dashboard/pve.json'),'utf8'));
const stamp=Date.now();sample.preparedAt=new Date(stamp).toISOString();sample.snapshot.fetchedAt=sample.preparedAt;
const fixtures=()=>({namespace:crypto.randomUUID(),read:async key=>key==='dashboard/pve.json'?sample:null,write:async()=>{}});
async function endpoint(factory,encoding){
  const server=factory(fixtures(),new Map());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api/dashboard?market=pve`;
  const get=async headers=>{const at=performance.now(),response=await fetch(url,{headers:{'Accept-Encoding':encoding,...headers}});await response.arrayBuffer();return {ms:performance.now()-at,status:response.status,bytes:Number(response.headers.get('content-length'))||0,etag:response.headers.get('etag')};};
  try{
    const first=await get(),warm=[];for(let n=0;n<5;n++)warm.push((await get()).ms);
    const unchanged=await get({'If-None-Match':first.etag});
    return {firstMs:first.ms,warmMeanMs:warm.reduce((a,b)=>a+b)/warm.length,wireBytes:first.bytes,unchangedMs:unchanged.ms,unchangedBytes:unchanged.bytes,unchangedStatus:unchanged.status};
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
}
async function burst(factory,encoding){
  const server=factory(fixtures(),new Map());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const at=performance.now();await Promise.all(Array.from({length:8},async()=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/dashboard`,{headers:{'Accept-Encoding':encoding}});if(r.status!==200)throw new Error('Burst request failed');await r.arrayBuffer();}));
    return performance.now()-at;
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
}
const profile=resolveTradingProfile(normalizeProfile(),sample.snapshot),collectors={loot:collectLoot,catalog:collectCatalog,flips:collectFlips,crafts:collectCrafts},cached=createRowCache(collectors);
function calculate(reuse){const at=performance.now();for(const [kind,collect] of Object.entries(collectors))reuse?cached(sample.snapshot,kind,profile):collect(sample.snapshot,profile);return performance.now()-at;}
calculate(false);calculate(true);const raw=[],reused=[];for(let n=0;n<10;n++){raw.push(calculate(false));reused.push(calculate(true));}
const aliases={'/radar.js':'app.js','/engine.js':'model.mjs','/media.mjs':'media.mjs','/comments-ui.js':'comments-ui.mjs','/accounts-ui.js':'accounts-ui.mjs','/account-sync.mjs':'account-sync.mjs','/update-window.js':'update-window.mjs','/quicklook.js':'quicklook.mjs','/navigation.mjs':'navigation.mjs','/loot-priority.mjs':'loot-priority.mjs','/spt-rarity.mjs':'spt-rarity.mjs'};
const graph=new Map();
async function visit(route){if(graph.has(route))return;const source=await readFile(join(baseline,'app',aliases[route]),'utf8');graph.set(route,source);for(const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)){const child=new URL(match[1],new URL(route,'https://fixture')).pathname;if(aliases[child])await visit(child);}}
await visit('/radar.js');
const manifest=JSON.parse(await readFile(join(root,'public/client/manifest.json'),'utf8')),bundle=await readFile(join(root,'public/client',manifest.script.path.split('/').at(-1)));
const result={at:new Date().toISOString(),sample:{items:Object.keys(sample.snapshot.items).length,histories:Object.keys(sample.signals.entries).length,plainBytes:Buffer.byteLength(JSON.stringify(sample))},
  before:await endpoint(previousServer,'gzip'),afterGzip:await endpoint(createRadarServer,'gzip'),afterBrotli:await endpoint(createRadarServer,'br'),
  coldBurst8:{beforeMs:await burst(previousServer,'gzip'),afterGzipMs:await burst(createRadarServer,'gzip'),afterBrotliMs:await burst(createRadarServer,'br')},
  rowRecomputeMeanMs:raw.reduce((a,b)=>a+b)/raw.length,rowReuseMeanMs:reused.reduce((a,b)=>a+b)/reused.length,
  scripts:{beforeRequests:graph.size,beforeGzipBytes:[...graph.values()].reduce((sum,body)=>sum+gzipSync(body).length,0),afterRequests:1,afterGzipBytes:gzipSync(bundle).length}};
await mkdir(join(root,'work'),{recursive:true});await writeFile(join(root,'work/performance-20261023.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
