import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePage,migrateWorkspaceViews,moduleForPage,PAGES} from './navigation.mjs';
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

test('only items retain surge filters; retired views reset without losing favorites or conditions',()=>{
  for(const market of ['pve','regular','pvp-season']){
    const views={items:{filter:'short'},run:{filter:'short'},flips:{filter:'short',criteria:{budget:200000}},crafts:{filter:'short',station:'water'}};
    const saved={workspaceViews:{[market]:views}},migrated=migrateWorkspaceViews(saved,market);
    assert.equal(migrated.items.filter,'short');
    for(const page of ['run','flips','crafts']){
      assert.equal(migrated[page].filter,'all');
      views[page].filter='favorites';
      assert.equal(migrateWorkspaceViews(saved,market)[page].filter,'favorites');
    }
    assert.equal(migrated.flips.criteria.budget,200000);assert.equal(migrated.crafts.station,'water');
    assert.deepEqual(migrateWorkspaceViews({workspaceViews:{[market]:migrated}},market),migrated);
  }
});
test('new independent views do not leak category/search across pages or markets',()=>{
  const saved={workspaceViews:{pve:{items:{category:'weapon',search:'SA58'},run:{quicklookTypes:['keys'],search:'钥匙'}},regular:{run:{search:'不同市场'}}}};
  const m=migrateWorkspaceViews(saved,'pve');assert.equal(m.items.search,'SA58');assert.equal(m.run.search,'钥匙');
  assert.equal(migrateWorkspaceViews(saved,'regular').run.search,'不同市场');
});
