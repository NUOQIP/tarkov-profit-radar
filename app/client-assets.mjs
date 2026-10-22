import {readFile,readdir} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
const filename=/^radar-([0-9a-f]{16})\.(js|css)$/;
export async function clientAssets(root,files){
  const folder=join(root,'public/client');let manifest;
  try{manifest=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')return files;throw error;}
  if(manifest.version!==1)throw new Error('Unsupported client bundle');
  for(const kind of ['script','style']){
    const entry=manifest[kind],match=entry?.path?.match(/^\/assets\/(radar-([0-9a-f]{16})\.(js|css))$/);
    if(!match||match[3]!==({script:'js',style:'css'})[kind]||!entry.sha256?.startsWith(match[2]))throw new Error('Invalid client bundle manifest');
    const body=await readFile(join(folder,match[1]));
    if(createHash('sha256').update(body).digest('hex')!==entry.sha256)throw new Error('Client bundle checksum mismatch');
  }
  const result=new Map(files),html=await readFile(join(root,'app/index.html'),'utf8');
  const rendered=html.replace('href="/radar.css"',`href="${manifest.style.path}"`)
    .replace(/<link rel="stylesheet" href="\/(?:community|accounts|terminal)\.css">/g,'')
    .replace('src="/radar.js"',`src="${manifest.script.path}"`)
    .replace('</head>',`<link rel="modulepreload" href="${manifest.script.path}"></head>`);
  result.set('/',[null,'text/html',{body:Buffer.from(rendered)}]);
  // Previously deployed bundles can remain available during a page-load cutover.
  for(const name of await readdir(folder)){
    if(!filename.test(name))continue;
    result.set('/assets/'+name,[join(folder,basename(name)),name.endsWith('.js')?'text/javascript':'text/css',{immutable:true}]);
  }
  return result;
}
