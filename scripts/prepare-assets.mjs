import { copyFileSync, mkdirSync } from 'node:fs';

// Plain browser assets stay outside the framework's CSS-to-RSC transformation.
mkdirSync(new URL('../public/',import.meta.url),{recursive:true});
for(const [source,target] of [['app/style.css','radar.css'],['app/app.js','radar.js'],['app/model.mjs','engine.js'],['app/update-window.mjs','update-window.js'],['app/quicklook.mjs','quicklook.js']]){
  copyFileSync(new URL('../'+source,import.meta.url),new URL('../public/'+target,import.meta.url));
}
await import('./run-framework.mjs');
