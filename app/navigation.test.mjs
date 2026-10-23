import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePage,migrateWorkspaceViews,moduleForPage,PAGES,activeRunTypes,toggleRunPreset} from './navigation.mjs';
import {normalizeAccountSettings} from './account-settings.mjs';
test('old loot links resolve to the corresponding new page; direct item links remain valid',()=>{
  const saved={page:'loot',workspaceViews:{pve:{loot:{lootScope:'scavenging'}}}};
  assert.equal(resolvePage('loot',saved,'pve'),'run');
  assert.equal(resolvePage('items',saved,'pve'),'items');
  assert.equal(resolvePage(null,saved,'pve'),'run');
  assert.equal(resolvePage('monitor',saved,'pve'),'items');
  assert.equal(resolvePage('invalid',{},'pve'),'items');
  assert.equal(moduleForPage('items'),'loot');assert.equal(moduleForPage('run'),'loot');
});
test('migration splits filters, removes invisible ranges, preserves user selections',()=>{
  const saved={workspaceViews:{pve:{loot:{lootScope:'scavenging',search:'灯泡',filter:'short',quicklookTypes:['barter'],quicklookRange:[5,8],criteria:{minSlot:90000,freshOnly:true}},crafts:{station:'water'}}}};
  const original=structuredClone(saved),m=migrateWorkspaceViews(saved,'pve');
  assert.deepEqual(Object.keys(m),PAGES);
  assert.equal(m.items.search,'');assert.equal(m.run.search,'灯泡');
  assert.equal(m.run.filter,'all');
  assert.equal(m.run.criteria.minSlot,0);assert.equal(m.run.criteria.freshOnly,true);
  assert.deepEqual(m.run.quicklookTypes,['barter']);assert.equal(m.run.quicklookRange,undefined);
  assert.equal(m.crafts.station,'water');assert.deepEqual(saved,original);
  const next=migrateWorkspaceViews({workspaceViews:{pve:m}},'pve');assert.deepEqual(next,m);
});

test('retired filters reset without losing other pages favorites or view conditions',()=>{
  for(const market of ['pve','regular','pvp-season']){
    const views={items:{filter:'short'},run:{filter:'short'},flips:{filter:'short',criteria:{budget:200000}},crafts:{filter:'short',station:'water'}};
    const saved={workspaceViews:{[market]:views}},migrated=migrateWorkspaceViews(saved,market);
    assert.equal(migrated.items.filter,'short');
    for(const page of ['run','flips','crafts']){
      assert.equal(migrated[page].filter,'all');
      views[page].filter='favorites';
      assert.equal(migrateWorkspaceViews(saved,market)[page].filter,page==='run'?'all':'favorites');
    }
    assert.equal(migrated.flips.criteria.budget,200000);assert.equal(migrated.crafts.station,'water');
    assert.deepEqual(migrateWorkspaceViews({workspaceViews:{[market]:migrated}},market),migrated);
  }
});

test('old run favorites reset across local and account restore while keeping search and types',()=>{
  const saved={workspaceViews:{pve:{items:{filter:'favorites'},run:{filter:'favorites',search:'LEDX',quicklookTypes:['medical'],quicklookTypesRevision:3,ignoreFleaLevel:false},flips:{filter:'favorites'},crafts:{filter:'favorites'}}}};
  for(const source of [JSON.parse(JSON.stringify(saved)),normalizeAccountSettings(saved)]){
    const restored=migrateWorkspaceViews(source,'pve');
    assert.equal(restored.run.filter,'all');
    assert.deepEqual(restored.run.quicklookTypes,['medical']);
    assert.equal(restored.run.ignoreFleaLevel,false);
    for(const page of ['items','flips','crafts'])assert.equal(restored[page].filter,'favorites');
  }
  assert.equal(migrateWorkspaceViews(saved,'pve').run.search,'LEDX');
});
test('new independent views do not leak category/search across pages or markets',()=>{
  const saved={workspaceViews:{pve:{items:{category:'weapon',search:'SA58'},run:{quicklookTypes:['keys'],search:'钥匙'}},regular:{run:{search:'不同市场'}}}};
  const m=migrateWorkspaceViews(saved,'pve');assert.equal(m.items.search,'SA58');assert.equal(m.run.search,'钥匙');
  assert.equal(migrateWorkspaceViews(saved,'regular').run.search,'不同市场');
});
test('cycling presets and tapping the active preset restores the untouched custom filters',()=>{
  const custom={quicklookTypes:['medical','food','poster'],quicklookPreset:null,ignoreFleaLevel:false,includeEvents:true,filter:'favorites',criteria:{onlyExecutable:false}};
  const original=structuredClone(custom);
  const ammo=toggleRunPreset(custom,'ammo');assert.deepEqual(activeRunTypes(ammo),['ammoBox']);
  const keys=toggleRunPreset(ammo,'keys');assert.deepEqual(activeRunTypes(keys),['keys']);
  const mods=toggleRunPreset(keys,'mods');assert.deepEqual(activeRunTypes(mods),['mods']);
  assert.deepEqual(toggleRunPreset(mods,'mods'),custom);assert.deepEqual(custom,original);
  assert.deepEqual(activeRunTypes({...ammo,quicklookPreset:null}),custom.quicklookTypes);
});
test('local reload, account sync and market switching preserve the base selection',()=>{
  const pve=toggleRunPreset({quicklookTypes:['food','medical'],quicklookTypesRevision:3,ignoreFleaLevel:false},'ammo');
  const saved=JSON.parse(JSON.stringify({workspaceViews:{pve:{run:pve},regular:{run:{quicklookTypes:['mods'],quicklookTypesRevision:3}}}}));
  const restored=migrateWorkspaceViews(saved,'pve').run;
  assert.deepEqual(activeRunTypes(restored),['ammoBox']);
  assert.deepEqual(activeRunTypes(toggleRunPreset(restored,'ammo')),['food','medical']);
  const synced=normalizeAccountSettings(saved);
  assert.deepEqual(synced.workspaceViews.pve.run.quicklookTypes,['food','medical']);
  assert.equal(synced.workspaceViews.pve.run.ignoreFleaLevel,false);
  assert.deepEqual(synced.workspaceViews.regular.run.quicklookTypes,['mods']);
  assert.equal(synced.workspaceViews.pve.run.quicklookPreset,undefined);
});
