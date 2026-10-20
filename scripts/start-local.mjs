import { spawn } from 'node:child_process';
import { mkdir,open,writeFile,stat,unlink } from 'node:fs/promises';
import { dirname,resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
try{process.loadEnvFile(join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
const port=Number(process.env.PORT||8787),url=`http://127.0.0.1:${port}`;
async function running(){
  try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1000)});return (await r.json()).service==='tarkov-profit-radar';}catch{return false;}
}
await mkdir(join(root,'.cache','logs'),{recursive:true});
if(!await running()){
  const lockPath=join(root,'.cache','start.lock');let lock;
  for(let n=0;n<40&&!lock;n++){
    try{lock=await open(lockPath,'wx');}catch(error){
      if(error.code!=='EEXIST')throw error;
      if(await running())break;
      try{if(Date.now()-(await stat(lockPath)).mtimeMs>60000)await unlink(lockPath);}catch{}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  }
  if(!lock&&!await running())throw new Error('另一启动过程尚未完成，请稍后再试。');
  try{if(lock&&!await running()){
  const out=await open(join(root,'.cache','logs','server.log'),'a'),err=await open(join(root,'.cache','logs','server-error.log'),'a');
  const child=spawn(process.execPath,[join(root,'app','server.mjs')],{cwd:root,env:process.env,detached:true,windowsHide:true,stdio:['ignore',out.fd,err.fd]});
  child.unref();await out.close();await err.close();
  let ready=false;
  for(let n=0;n<30;n++){if(await running()){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}
  if(!ready)throw new Error(`启动失败，请查看 ${join(root,'.cache','logs','server-error.log')}`);
  await writeFile(join(root,'.cache','server.pid'),String(child.pid));
  }}finally{if(lock){await lock.close();await unlink(lockPath).catch(()=>{});}}
}
if(!process.argv.includes('--no-open')){
  const browser=process.platform==='win32'?spawn('explorer.exe',[url],{detached:true,windowsHide:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});
  browser.unref();
}
console.log(`本机服务已就绪：${url}`);
