import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localStore } from './local-store.mjs';
import { passwordCredential,verifyPassword } from './admin-auth.mjs';
import { createAdminHandler } from './admin-service.mjs';
import { createRadarServer,secureRequest } from './http-server.mjs';
import { saveItemOverride,readItemOverrides,applyItemOverrides } from './item-overrides.mjs';
import { itemRarity,lootPriority } from './loot-priority.mjs';
import { isEventItem,isExcluded,MODEL_VERSION,MARKETS } from './model.mjs';
import { makeDashboard } from './dashboard.mjs';

const id='aaaaaaaaaaaaaaaaaaaaaaaa',presetId='bbbbbbbbbbbbbbbbbbbbbbbb',eventId='cccccccccccccccccccccccc';
const data=market=>({market,version:2,modelVersion:MODEL_VERSION,fetchedAt:new Date().toISOString(),traders:{},stations:{},flea:{},barters:[],crafts:[],items:{
  [id]:{id,name:'灯泡',english:'Light bulb',category:'barter',price:60000,width:1,height:1,buy:[],sell:[],types:[]},
  [presetId]:{id:presetId,baseItem:id,name:'测试预设',category:'weapon',buy:[],sell:[],types:[]},
  [eventId]:{id:eventId,name:'活动测试物品',eventOnly:true,excluded:true,category:'food',buy:[],sell:[],types:[]}
}});
async function fixture(t){const path=await mkdtemp(join(tmpdir(),'radar-admin-test-')),store=localStore(path);t.after(()=>rm(path,{recursive:true,force:true}));return {path,store};}
test('password hashes are salted, verified and reject malformed input',async()=>{
  const a=await passwordCredential('test-password-strong'),b=await passwordCredential('test-password-strong');
  assert.notEqual(a.hash,b.hash);assert.equal(await verifyPassword('test-password-strong',a),true);assert.equal(await verifyPassword('wrong-password',a),false);
  assert.equal(await verifyPassword({},a),false);await assert.rejects(passwordCredential('short'));await assert.rejects(passwordCredential('a'.repeat(129)));
});
test('manual classifications persist, inherit to presets, and restore without modifying source',async t=>{
  const {store,path}=await fixture(t),source=data('pve'),original=structuredClone(source);
  await saveItemOverride(store,id,{eventOnly:true,rarity:'Common'},0);
  await saveItemOverride(store,eventId,{eventOnly:false,rarity:'Superrare'},1);
  const config=await readItemOverrides(localStore(path)),edited=applyItemOverrides(source,config);
  assert.equal(isEventItem(edited.items[id]),true);assert.equal(isEventItem(edited.items[presetId]),true);
  assert.equal(itemRarity(edited.items[presetId]).key,'Common');assert.equal(isEventItem(edited.items[eventId]),false);assert.equal(isExcluded(edited.items[eventId],{}),false);
  assert.equal(edited.classificationRevision,2);assert.deepEqual(source,original);
  const rareRow={item:edited.items[eventId],slotValue:60000},commonRow={item:edited.items[id],slotValue:60000};assert.ok(lootPriority(commonRow)>lootPriority(rareRow));
  await saveItemOverride(store,eventId,{eventOnly:null,rarity:null},2);const restored=applyItemOverrides(source,await readItemOverrides(store));
  assert.equal(isEventItem(restored.items[eventId]),true);assert.equal(itemRarity(restored.items[eventId]).key,itemRarity(original.items[eventId]).key);
});
test('explicit false clears built-in event classification but never unhides currency',async()=>{
  const builtIn='5df8a72c86f77412640e2e83';
  const source={items:{[builtIn]:{id:builtIn,eventOnly:true,excluded:true},[id]:{id,currencyOnly:true,excluded:true}}};
  const edited=applyItemOverrides(source,{revision:1,items:{[builtIn]:{eventOnly:false},[id]:{eventOnly:false}}});
  assert.equal(isEventItem(edited.items[builtIn]),false);assert.equal(isExcluded(edited.items[builtIn],{}),false);assert.equal(isExcluded(edited.items[id],{}),true);
});
test('simultaneous editors cannot overwrite one another or inject unknown fields',async t=>{
  const {store}=await fixture(t);
  const results=await Promise.allSettled([saveItemOverride(store,id,{eventOnly:true,rarity:'Common'},0),saveItemOverride(store,eventId,{eventOnly:false,rarity:'Rare'},0)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  await assert.rejects(saveItemOverride(store,'../secret',{eventOnly:true,rarity:null},1));await assert.rejects(saveItemOverride(store,id,{eventOnly:true,rarity:'Epic'},1));
});
test('HTTPS detection only trusts explicitly configured loopback proxies',()=>{
  const req={socket:{remoteAddress:'203.0.113.4'},headers:{'x-forwarded-proto':'https'}};
  assert.equal(secureRequest(req,true),false);req.socket.remoteAddress='127.0.0.1';assert.equal(secureRequest(req),false);assert.equal(secureRequest(req,true),true);
});
test('admin authentication, CSRF, shared classifications, ETags and logout work end to end',async t=>{
  const {store}=await fixture(t);for(const market of Object.keys(MARKETS))await store.write(`dashboard/${market}.json`,makeDashboard(data(market),null,{records:[]}));
  let credential=await passwordCredential('test-password-strong');
  const server=createRadarServer(store,new Map(),{trustLoopbackProxy:true,adminHandler:createAdminHandler(store,{readCredential:async()=>credential})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`,origin=base.replace('http:','https:');
  const remote={'X-Real-IP':'198.51.100.1','X-Forwarded-Proto':'https',Origin:origin,'Content-Type':'application/json'};
  const request=(path,options={})=>fetch(base+path,{...options,headers:{...remote,...options.headers}});
  assert.equal((await request('/admin/api/items')).status,401);
  assert.equal((await request('/admin/api/login',{method:'POST',body:'{}',headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await request('/admin/api/session',{headers:{'X-Forwarded-Proto':'http'}})).status,403);
  assert.equal((await request('/admin/api/login',{method:'POST',body:JSON.stringify({password:'wrong'})})).status,401);
  const login=await request('/admin/api/login',{method:'POST',body:JSON.stringify({password:'test-password-strong'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).csrf,headers={Cookie:cookie,'X-CSRF-Token':csrf};
  assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);assert.match(login.headers.get('set-cookie'),/Secure/);
  const list=await (await request('/admin/api/items?q=Light',{headers})).json();assert.equal(list.total,1);assert.equal(list.items[0].id,id);
  const overview=await request('/admin/api/overview',{headers});assert.equal(overview.status,200);assert.equal((await overview.json()).markets.length,3);
  const before=await request('/api/dashboard');const tag=before.headers.get('etag');await before.arrayBuffer();
  const body=JSON.stringify({revision:0,eventOnly:true,rarity:'Rare'});
  assert.equal((await request('/admin/api/items/'+id,{method:'PATCH',body,headers:{Cookie:cookie}})).status,403);
  assert.equal((await request('/admin/api/items/'+id,{method:'PATCH',body,headers})).status,200);
  assert.equal((await request('/admin/api/items/'+id,{method:'PATCH',body,headers})).status,409);
  for(const market of Object.keys(MARKETS)){
    const result=await request('/api/dashboard?market='+market,{headers:{'If-None-Match':tag}});assert.equal(result.status,200);assert.notEqual(result.headers.get('etag'),tag);
    const published=await result.json();assert.equal(published.snapshot.items[id].eventOnly,true);assert.equal(published.snapshot.items[id].rarityOverride,'Rare');
    assert.equal(published.audit,undefined);assert.equal(published.snapshot.audit,undefined);assert.equal(JSON.stringify(published).includes(credential.hash),false);
  }
  assert.equal((await request('/admin/api/logout',{method:'POST',body:'{}',headers})).status,200);assert.equal((await request('/admin/api/items',{headers})).status,401);
  const second=await request('/admin/api/login',{method:'POST',body:JSON.stringify({password:'test-password-strong'})}),secondCookie=second.headers.get('set-cookie').split(';')[0];await second.arrayBuffer();
  credential=await passwordCredential('replacement-password');assert.equal((await request('/admin/api/items',{headers:{Cookie:secondCookie}})).status,401);
});
test('admin login is disabled until configured and throttles repeated failures',async t=>{
  const {store}=await fixture(t);let credential=null;
  const server=createRadarServer(store,new Map(),{adminHandler:createAdminHandler(store,{readCredential:async()=>credential})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`,login=()=>fetch(base+'/admin/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{"password":"wrong"}'});
  assert.equal((await login()).status,503);credential=await passwordCredential('test-password-strong');
  for(let n=0;n<5;n++)assert.equal((await login()).status,401);assert.equal((await login()).status,429);
});
