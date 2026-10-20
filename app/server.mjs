import { createServer } from 'node:http';
import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi,snapshot,scanSignals } from './data-service.mjs';
import { MARKETS } from './model.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=join(here,'..'),cacheDir=join(root,'.cache','v2');
const store={
  namespace:'local',
  async read(key){try{return JSON.parse(await readFile(join(cacheDir,key),'utf8'));}catch{return null;}},
  async write(key,value){
    const path=join(cacheDir,key);await mkdir(dirname(path),{recursive:true});
    const temp=path+'.'+crypto.randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value));await rename(temp,path);
  }
};
const files=new Map([
  ['/',[join(here,'index.html'),'text/html']],
  ['/radar.js',[join(here,'app.js'),'text/javascript']],
  ['/radar.css',[join(here,'style.css'),'text/css']],
  ['/engine.js',[join(here,'model.mjs'),'text/javascript']],
  ['/update-window.js',[join(here,'update-window.mjs'),'text/javascript']],
  ['/quicklook.js',[join(here,'quicklook.mjs'),'text/javascript']],
  ['/favicon.svg',[join(root,'public','favicon.svg'),'image/svg+xml']]
]);
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(files.has(url.pathname)&&req.method==='GET'){
      const [path,type]=files.get(url.pathname);
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      return res.end(await readFile(path));
    }
    const response=await handleApi(new Request(url,{method:req.method}),store);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
const port=Number(process.env.PORT||8787);
server.listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));
let harvesting=false;
async function harvest(){
  if(harvesting)return;harvesting=true;
  try{for(const market of Object.keys(MARKETS)){try{const data=await snapshot(store,market);await scanSignals(store,data,12);}catch(error){console.error(MARKETS[market]+': '+error.message);}}}
  finally{harvesting=false;}
}
// Keeps public market data collecting even when all browser tabs are closed.
const timer=setInterval(harvest,300000);timer.unref();
process.on('SIGINT',()=>{clearInterval(timer);server.close(()=>process.exit(0));});
