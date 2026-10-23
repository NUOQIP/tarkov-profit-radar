import {build,transform} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export async function buildClient(root=resolve(dirname(fileURLToPath(import.meta.url)),'..')){
  const aliases={'/engine.js':'model.mjs','/media.mjs':'media.mjs','/comments-ui.js':'comments-ui.mjs',
    '/accounts-ui.js':'accounts-ui.mjs','/account-sync.mjs':'account-sync.mjs','/update-window.js':'update-window.mjs',
    '/quicklook.js':'quicklook.mjs','/navigation.mjs':'navigation.mjs','/loot-priority.mjs':'loot-priority.mjs',
    '/dashboard-client.mjs':'dashboard-client.mjs','/row-cache.mjs':'row-cache.mjs'};
  const result=await build({entryPoints:[join(root,'app/app.js')],bundle:true,minify:true,write:false,
    format:'esm',platform:'browser',target:['es2022'],charset:'utf8',legalComments:'none',
    plugins:[{name:'radar-browser-paths',setup(builder){
      builder.onResolve({filter:/^\//},args=>aliases[args.path]?{path:join(root,'app',aliases[args.path])}:null);
    }}]});
  const css=(await Promise.all(['style.css','community.css','accounts.css','terminal.css','archive.css','archive-crafts.css','archive-details.css'].map(name=>readFile(join(root,'app',name),'utf8')))).join('\n');
  const style=await transform(css,{loader:'css',minify:true,charset:'utf8',target:['chrome110','firefox115','safari16.4']});
  const directory=join(root,'public/client');await mkdir(directory,{recursive:true});
  const manifest={version:1};
  for(const [name,extension,contents] of [['script','js',result.outputFiles[0].contents],['style','css',Buffer.from(style.code)]]){
    const hash=createHash('sha256').update(contents).digest('hex'),filename=`radar-${hash.slice(0,16)}.${extension}`;
    await writeFile(join(directory,filename),contents);
    manifest[name]={path:'/assets/'+filename,sha256:hash,bytes:contents.length};
  }
  await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildClient(),null,2));
