import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreferenceSync} from './account-sync.mjs';
const prefs=level=>({profiles:{pve:{playerLevel:level}},favorites:{pve:[]}});
const remote=(level,revision)=>({settings:prefs(level),revision});
test('autosave queues edits made during an in-flight request and keeps the new revision',async()=>{
  let finish,stored;const sync=createPreferenceSync({apply(){},save:(settings,revision)=>new Promise(resolve=>{stored={settings,revision:revision+1};finish=()=>resolve(stored);})});
  sync.bind(remote(79,1));sync.update(prefs(20));const first=sync.flush();sync.update(prefs(21));finish();await first;
  assert.equal(sync.state.revision,2);assert.equal(sync.state.settings.profiles.pve.playerLevel,21);assert.equal(sync.state.dirty,true);
  const second=sync.flush();finish();await second;assert.equal(sync.state.revision,3);assert.equal(sync.state.dirty,false);
});
test('stale cross-device writes need explicit conflict resolution',async()=>{
  let applied;const sync=createPreferenceSync({apply:value=>{applied=value;},save:async()=>{throw Object.assign(new Error('conflict'),{status:409,current:remote(40,2)});}});
  sync.bind(remote(79,1));sync.update(prefs(20));await sync.flush();assert.equal(sync.state.phase,'conflict');assert.equal(sync.state.settings.profiles.pve.playerLevel,20);
  sync.resolve(false);assert.equal(applied.profiles.pve.playerLevel,40);assert.equal(sync.state.dirty,false);
  sync.update(prefs(30));sync.remote(remote(50,3));sync.resolve(true);assert.equal(sync.state.revision,3);assert.equal(sync.state.settings.profiles.pve.playerLevel,30);assert.equal(sync.state.dirty,true);
});
test('offline drafts survive reconnect and cannot leak into a different account',async()=>{
  let saved,finish;const sync=createPreferenceSync({apply(){},cache:value=>{saved=value;},save:async()=>{throw new Error('offline');}});
  sync.bind(remote(79,1));sync.update(prefs(19));await sync.flush();assert.equal(sync.state.phase,'offline');assert.equal(saved.dirty,true);
  const draft=structuredClone(saved);sync.bind(remote(79,1),draft);assert.equal(sync.state.settings.profiles.pve.playerLevel,19);assert.equal(sync.state.phase,'pending');
  sync.bind(remote(30,2),draft);assert.equal(sync.state.phase,'conflict');
  const other=createPreferenceSync({apply(){},save:()=>new Promise(resolve=>{finish=resolve;})});other.bind(remote(79,1));other.update(prefs(10));const pending=other.flush();other.stop();other.bind(remote(40,8));finish(remote(10,2));await pending;
  assert.equal(other.state.revision,8);assert.equal(other.state.settings.profiles.pve.playerLevel,40);
});
test('a lost response to an already-committed write does not create a false conflict',async()=>{
  const sync=createPreferenceSync({apply(){},save:async()=>{throw Object.assign(new Error('conflict'),{status:409,current:remote(20,2)});}});
  sync.bind(remote(79,1));sync.update(prefs(20));await sync.flush();assert.equal(sync.state.phase,'saved');assert.equal(sync.state.revision,2);
});
