import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectMarket,dashboard } from './data-service.mjs';
import { MARKETS } from './model.mjs';
import { localStore } from './local-store.mjs';
import { createRadarServer } from './http-server.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=join(here,'..');
const store=localStore(resolve(process.env.DATA_DIR||join(root,'.cache','v2')));
const files=new Map([
  ['/',[join(here,'index.html'),'text/html']],
  ['/radar.js',[join(here,'app.js'),'text/javascript']],
  ['/radar.css',[join(here,'style.css'),'text/css']],
  ['/engine.js',[join(here,'model.mjs'),'text/javascript']],
  ['/update-window.js',[join(here,'update-window.mjs'),'text/javascript']],
  ['/quicklook.js',[join(here,'quicklook.mjs'),'text/javascript']],
  ['/navigation.mjs',[join(here,'navigation.mjs'),'text/javascript']],
  ['/loot-priority.mjs',[join(here,'loot-priority.mjs'),'text/javascript']],
  ['/spt-rarity.mjs',[join(here,'spt-rarity.mjs'),'text/javascript']],
  ['/fence.webp',[join(root,'public','fence.webp'),'image/webp']],
  ['/favicon.svg',[join(root,'public','favicon.svg'),'image/svg+xml']]
]);
const server=createRadarServer(store,files,{trustLoopbackProxy:process.env.TRUST_PROXY==='loopback'}),port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>{console.log('http://'+host+':'+port);warm();});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
let harvesting=false,stopping=false;
async function warm(){
  for(const market of Object.keys(MARKETS)){
    if(stopping)return;
    try{await dashboard(store,market);}catch(error){console.error(MARKETS[market]+': '+error.message);}
  }
  if(!stopping)harvest();
}
async function harvest(){
  if(harvesting||stopping)return;harvesting=true;
  try{for(const market of Object.keys(MARKETS)){if(stopping)break;try{await collectMarket(store,market,24);}catch(error){console.error(MARKETS[market]+': '+error.message);}}}
  finally{harvesting=false;}
}
const timer=setInterval(harvest,300000);timer.unref();
function shutdown(){stopping=true;clearInterval(timer);server.close(()=>process.exit(0));server.closeIdleConnections();setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
