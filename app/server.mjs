import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectMarket,dashboard } from './data-service.mjs';
import { MARKETS } from './model.mjs';
import { localStore } from './local-store.mjs';
import { createRadarServer } from './http-server.mjs';
import { checkSptUpstream } from './spt-upstream.mjs';
import { createAdminHandler } from './admin-service.mjs';
import { createImageHandler } from './image-cache.mjs';
import { createCommentsStore } from './comments-store.mjs';
import { createCommentsHandler } from './comments-service.mjs';
import { createAccountsStore } from './accounts-store.mjs';
import { createAccountsHandler } from './accounts-service.mjs';
import { createMailService } from './mail-service.mjs';
import { clientAssets } from './client-assets.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=join(here,'..');
const dataDir=resolve(process.env.DATA_DIR||join(root,'.cache','v2')),store=localStore(dataDir);
const files=new Map([
  ['/',[join(here,'index.html'),'text/html']],
  ['/admin',[join(here,'admin.html'),'text/html']],
  ['/admin/',[join(here,'admin.html'),'text/html']],
  ['/admin/admin.js',[join(here,'admin.js'),'text/javascript']],
  ['/admin/admin.css',[join(here,'admin.css'),'text/css']],
  ['/radar.js',[join(here,'app.js'),'text/javascript']],
  ['/radar.css',[join(here,'style.css'),'text/css']],
  ['/terminal.css',[join(here,'terminal.css'),'text/css']],
  ['/ui-motion.mjs',[join(here,'ui-motion.mjs'),'text/javascript']],
  ['/community.css',[join(here,'community.css'),'text/css']],
  ['/engine.js',[join(here,'model.mjs'),'text/javascript']],
  ['/update-window.js',[join(here,'update-window.mjs'),'text/javascript']],
  ['/quicklook.js',[join(here,'quicklook.mjs'),'text/javascript']],
  ['/navigation.mjs',[join(here,'navigation.mjs'),'text/javascript']],
  ['/loot-priority.mjs',[join(here,'loot-priority.mjs'),'text/javascript']],
  ['/spt-rarity.mjs',[join(here,'spt-rarity.mjs'),'text/javascript']],
  ['/media.mjs',[join(here,'media.mjs'),'text/javascript']],
  ['/comments-ui.js',[join(here,'comments-ui.mjs'),'text/javascript']],
  ['/accounts-ui.js',[join(here,'accounts-ui.mjs'),'text/javascript']],
  ['/account-sync.mjs',[join(here,'account-sync.mjs'),'text/javascript']],
  ['/dashboard-client.mjs',[join(here,'dashboard-client.mjs'),'text/javascript']],
  ['/row-cache.mjs',[join(here,'row-cache.mjs'),'text/javascript']],
  ['/accounts.css',[join(here,'accounts.css'),'text/css']],
  ['/fence.webp',[join(root,'public','fence.webp'),'image/webp']],
  ['/favicon.svg',[join(root,'public','favicon.svg'),'image/svg+xml']]
]);
const comments=createCommentsStore(join(dataDir,'community','comments.sqlite'));
const accounts=createAccountsStore(join(dataDir,'community','accounts.sqlite'));
const mail=createMailService(join(dataDir,'admin','mail.json'));
const accountHandler=createAccountsHandler(accounts,mail);
const commentsHandler=createCommentsHandler(comments,{requireUser:accountHandler.requireUser,findItem:async(id,market)=>(await dashboard(store,market)).snapshot.items[id]});
const imageHandler=createImageHandler(store);
const adminHandler=createAdminHandler(store,{credentialFile:process.env.ADMIN_CREDENTIAL_FILE||join(dataDir,'admin','credentials.json'),origin:process.env.ADMIN_ORIGIN,comments,mail});
const server=createRadarServer(store,process.env.CLIENT_BUNDLE==='0'?files:await clientAssets(root,files),{trustLoopbackProxy:process.env.TRUST_PROXY==='loopback',adminHandler,accountHandler:accountHandler.handle,commentsHandler,imageHandler}),port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>{console.log('http://'+host+':'+port);warm();checkSpt();});
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
function checkSpt(){if(!stopping)checkSptUpstream(store).catch(error=>console.error('SPT check: '+error.message));}
const sptTimer=setInterval(checkSpt,3600000);sptTimer.unref();
function shutdown(){stopping=true;clearInterval(timer);clearInterval(sptTimer);server.close(()=>{accounts.close();comments.close();process.exit(0);});server.closeIdleConnections();setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
