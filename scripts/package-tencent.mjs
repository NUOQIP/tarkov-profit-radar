import { mkdir, mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]||join(root,'outputs','tarkov-radar-tencent.tar.gz'));
const files=[
  'app/server.mjs','app/http-server.mjs','app/local-store.mjs','app/data-service.mjs',
  'app/dashboard.mjs','app/model.mjs','app/index.html','app/app.js','app/style.css',
  'app/quicklook.mjs','app/update-window.mjs','public/favicon.svg',
  'scripts/check-deployment.mjs','README.md','docs/tencent-cloud.md',
  'deploy/tencent/install.sh','deploy/tencent/radar.service',
  'deploy/tencent/nginx-private.conf','deploy/tencent/nginx-public.conf.example','deploy/tencent/nginx-http.conf.example',
  'deploy/tencent/backup.sh','deploy/tencent/backup.service','deploy/tencent/backup.timer',
];
const digest=value=>createHash('sha256').update(value).digest('hex');
await mkdir(join(root,'work'),{recursive:true});
await mkdir(dirname(output),{recursive:true});
const staging=await mkdtemp(join(root,'work','tencent-release-'));
const checksums={};
// Explicit allowlist: no credentials, caches, Git metadata or build dependencies.
for(const file of files){
  const content=(await readFile(join(root,file),'utf8')).replace(/\r\n/g,'\n');
  await mkdir(dirname(join(staging,file)),{recursive:true});
  await writeFile(join(staging,file),content);
  checksums[file]=digest(content);
}
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
const metadata={service:'tarkov-profit-radar',target:'ubuntu-24.04-x64',
  createdAt:new Date().toISOString(),commit:git(['rev-parse','HEAD']),
  dirty:Boolean(git(['status','--porcelain'])),files:checksums};
const manifest=JSON.stringify(metadata,null,2)+'\n';
await writeFile(join(staging,'RELEASE.json'),manifest);
await writeFile(join(staging,'SHA256SUMS'),
  [...Object.entries(checksums).map(([file,hash])=>`${hash}  ${file}`),`${digest(manifest)}  RELEASE.json`].join('\n')+'\n');
execFileSync('tar',['-czf',output,'-C',staging,'.'],{stdio:'inherit',windowsHide:true});
const hash=digest(await readFile(output));
await writeFile(output+'.sha256',`${hash}  ${basename(output)}\n`);
console.log(JSON.stringify({archive:output,sha256:hash,bytes:(await stat(output)).size,
  commit:metadata.commit,dirty:metadata.dirty,files:files.length},null,2));
