import { copyFileSync, mkdirSync } from 'node:fs';

// Plain browser assets stay outside the framework's CSS-to-RSC transformation.
mkdirSync(new URL('../public/',import.meta.url),{recursive:true});
for(const [source,target] of [['app/style.css','radar.css'],['app/app.js','radar.js'],['app/model.mjs','engine.js'],['app/update-window.mjs','update-window.js'],['app/quicklook.mjs','quicklook.js'],['app/navigation.mjs','navigation.mjs'],['app/loot-priority.mjs','loot-priority.mjs'],['app/spt-rarity.mjs','spt-rarity.mjs']]){
  copyFileSync(new URL('../'+source,import.meta.url),new URL('../public/'+target,import.meta.url));
}
for(const file of ['media.mjs','community.css','account-sync.mjs','accounts.css','dashboard-client.mjs','row-cache.mjs','terminal.css','ui-motion.mjs'])copyFileSync(new URL('../app/'+file,import.meta.url),new URL('../public/'+file,import.meta.url));
copyFileSync(new URL('../app/comments-ui.mjs',import.meta.url),new URL('../public/comments-ui.js',import.meta.url));
copyFileSync(new URL('../app/accounts-ui.mjs',import.meta.url),new URL('../public/accounts-ui.js',import.meta.url));
await import('./run-framework.mjs');
