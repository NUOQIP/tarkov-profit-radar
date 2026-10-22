import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {clientAssets} from './client-assets.mjs';
test('packaged HTML uses verified fingerprinted assets while development retains source routes',async t=>{
  const root=await mkdtemp(join(tmpdir(),'radar-client-assets-'));assert(root.startsWith(resolve(tmpdir())+sep));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=new Map([['/radar.js',['source','text/javascript']]]);assert.equal(await clientAssets(root,source),source);
  await mkdir(join(root,'public/client'),{recursive:true});await mkdir(join(root,'app'));
  await writeFile(join(root,'app/index.html'),'<head><link rel="stylesheet" href="/radar.css"><link rel="stylesheet" href="/community.css"><link rel="stylesheet" href="/accounts.css"><link rel="stylesheet" href="/terminal.css"></head><script type="module" src="/radar.js"></script>');
  const manifest={version:1};
  for(const [kind,extension,body] of [['script','js','console.log("ready")'],['style','css','body{color:#ccc}']]){
    const sha256=createHash('sha256').update(body).digest('hex'),name=`radar-${sha256.slice(0,16)}.${extension}`;
    manifest[kind]={path:'/assets/'+name,sha256};await writeFile(join(root,'public/client',name),body);
  }
  await writeFile(join(root,'public/client/manifest.json'),JSON.stringify(manifest));
  const prepared=await clientAssets(root,source),html=prepared.get('/')[2].body.toString();
  assert(html.includes(manifest.script.path));assert(html.includes(manifest.style.path));assert(html.includes('modulepreload'));
  assert(!html.includes('/accounts.css'));assert(!html.includes('/terminal.css'));assert(prepared.get(manifest.script.path)[2].immutable);assert(prepared.has('/radar.js'));
  await writeFile(join(root,'public/client',manifest.script.path.split('/').at(-1)),'tampered');
  await assert.rejects(clientAssets(root,source),/checksum/);
});
