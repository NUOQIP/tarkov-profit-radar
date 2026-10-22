import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createAccountsStore} from './accounts-store.mjs';
import {createAccountsHandler} from './accounts-service.mjs';
import {createRadarServer} from './http-server.mjs';
const originalPassword='player-test-passphrase',nextPassword='changed-test-passphrase';
async function proof(store,email,purpose){let delivered;const result=await store.sendCode(email,email,async m=>{delivered=m;},purpose);return {email,challenge:result.challenge,code:delivered.code};}
test('verified registration adds a password without exposing it; both sign-in methods use the same account',async t=>{
  let now=1700000000000;const store=createAccountsStore(':memory:',{now:()=>now});t.after(()=>store.close());
  const input=await proof(store,'new@qq.com','register');
  assert.throws(()=>store.verifyCode(input,'ip'),{status:400});
  await assert.rejects(store.register({...input,password:'short'},'ip'),{status:400});
  const registered=await store.register({...input,password:originalPassword},'ip');assert.equal(registered.user.hasPassword,true);
  assert(!JSON.stringify(registered).includes(originalPassword));assert(registered.created);
  await assert.rejects(store.register({...input,password:originalPassword},'ip'),{status:400});
  await assert.rejects(store.loginPassword({email:input.email,password:'wrong-password'},'ip'),{status:401});
  await assert.rejects(store.loginPassword({email:'missing@qq.com',password:originalPassword},'ip'),{status:401});
  const logged=await store.loginPassword({email:input.email,password:originalPassword},'ip');assert.equal(logged.user.id,registered.user.id);assert.equal(logged.created,false);
  now+=60001;const otp=store.verifyCode(await proof(store,input.email,'login'),'ip');assert.equal(otp.user.id,registered.user.id);assert.equal(otp.user.hasPassword,true);
  now+=60001;await assert.rejects(store.register({...await proof(store,input.email,'register'),password:nextPassword},'ip'),{status:409});
  assert.equal((await store.loginPassword({email:input.email,password:originalPassword},'ip')).user.id,registered.user.id);
});
test('existing passwordless accounts migrate in place; reset preserves conditions and revokes all older sessions',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-password-'));assert(dir.startsWith(resolve(tmpdir())+sep));const path=join(dir,'accounts.sqlite');
  const old=new DatabaseSync(path);old.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,nickname TEXT NOT NULL,created_at TEXT NOT NULL); INSERT INTO accounts VALUES ('legacy','legacy@qq.com','老拾荒者','2026-01-01');`);old.close();
  let now=1700000000000,store=createAccountsStore(path,{now:()=>now});t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
  const first=store.verifyCode(await proof(store,'legacy@qq.com','login'),'ip');assert.equal(first.user.id,'legacy');assert.equal(first.user.hasPassword,false);
  const settings=store.saveSettings(first.user.id,{profiles:{pve:{playerLevel:24}},favorites:{pve:['5d1b392c86f77425243e98fe']}},0);
  await assert.rejects(store.loginPassword({email:'legacy@qq.com',password:originalPassword},'ip'),{status:401});
  now+=60001;const setProof=await proof(store,'legacy@qq.com','password');const set=await store.resetPassword({...setProof,password:originalPassword},'ip');
  assert.equal(store.authenticate(first.token),null);assert.equal(set.user.id,'legacy');assert.equal(set.user.nickname,'老拾荒者');assert.deepEqual(set.settings,settings.settings);
  assert.equal(set.user.hasPassword,true);assert(store.authenticate(set.token));
  store.close();store=createAccountsStore(path,{now:()=>now});const second=await store.loginPassword({email:'legacy@qq.com',password:originalPassword},'ip');assert.equal(second.user.id,'legacy');
  now+=60001;const resetProof=await proof(store,'legacy@qq.com','password');const reset=await store.resetPassword({...resetProof,password:nextPassword},'ip');
  assert.equal(store.authenticate(set.token),null);assert.equal(store.authenticate(second.token),null);assert(store.authenticate(reset.token));
  await assert.rejects(store.resetPassword({...resetProof,password:originalPassword},'ip'),{status:400});
  await assert.rejects(store.loginPassword({email:'legacy@qq.com',password:originalPassword},'ip'),{status:401});
  assert.equal((await store.loginPassword({email:'legacy@qq.com',password:nextPassword},'ip')).settings.profiles.pve.playerLevel,24);
  for(const file of [path,path+'-wal']){let bytes;try{bytes=await readFile(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}assert(!bytes.includes(Buffer.from(originalPassword)));assert(!bytes.includes(Buffer.from(nextPassword)));}
});
test('password proof is purpose-bound and single-use during simultaneous resets',async t=>{
  let now=1700000000000;const store=createAccountsStore(':memory:',{now:()=>now});t.after(()=>store.close());
  const account=store.verifyCode(await proof(store,'race@qq.com','login'),'ip');now+=60001;
  const loginProof=await proof(store,'race@qq.com','login');await assert.rejects(store.resetPassword({...loginProof,password:originalPassword},'ip'),{status:400});
  assert.equal(store.verifyCode(loginProof,'ip').user.id,account.user.id);now+=60001;
  const reset=await proof(store,'race@qq.com','password');
  const outcomes=await Promise.allSettled([store.resetPassword({...reset,password:originalPassword},'ip'),store.resetPassword({...reset,password:nextPassword},'ip')]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.status,400);
});
test('password login rate limiting also applies to nonexistent accounts',async t=>{
  const store=createAccountsStore(':memory:');t.after(()=>store.close());
  for(let n=0;n<12;n++)await assert.rejects(store.loginPassword({email:'none@qq.com',password:''},'ip'),{status:401});
  await assert.rejects(store.loginPassword({email:'none@qq.com',password:''},'ip'),{status:429});
});
test('HTTP password routes protect reset identity, origin and CSRF; passwords do not depend on mail availability',async t=>{
  let now=1700000000000,delivered,enabled=true;const accounts=createAccountsStore(':memory:',{now:()=>now});t.after(()=>accounts.close());
  const auth=createAccountsHandler(accounts,{status:async()=>({enabled,configured:true}),send:async m=>{delivered=m;}});
  const server=createRadarServer({},new Map(),{accountHandler:auth.handle});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const origin='http://127.0.0.1:'+server.address().port,call=(route,method='POST',body,headers={})=>fetch(origin+'/api/account/'+route,{method,headers:{'Content-Type':'application/json',Origin:origin,...headers},...(body?{body:JSON.stringify(body)}:{})});
  const sent=await(await call('code','POST',{email:'http@qq.com',purpose:'register'})).json();assert.equal(delivered.purpose,'register');
  const registered=await call('register','POST',{email:'http@qq.com',challenge:sent.challenge,code:delivered.code,password:originalPassword});assert.equal(registered.status,200);
  const account=await registered.json(),Cookie=registered.headers.get('set-cookie').split(';')[0],headers={Cookie,'X-CSRF-Token':account.csrf};assert(!account.token);assert.equal(account.user.hasPassword,true);
  assert.equal((await call('settings','PUT',{settings:{profiles:{pve:{playerLevel:18}}},revision:0},headers)).status,200);
  assert.equal((await call('login/password','POST',{email:'http@qq.com',password:originalPassword},{Origin:'https://evil.example'})).status,403);
  now+=60001;const change=await(await call('code','POST',{email:'http@qq.com',purpose:'password'})).json();const input={challenge:change.challenge,code:delivered.code,password:nextPassword};
  assert.equal((await call('password','PUT',input,{Cookie})).status,403);
  assert.equal((await call('password','PUT',{...input,email:'other@qq.com'},headers)).status,400);
  const changed=await call('password','PUT',input,headers);assert.equal(changed.status,200);assert.match(changed.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal((await call('settings','GET',null,headers)).status,401);
  enabled=false;const signed=await call('login/password','POST',{email:'http@qq.com',password:nextPassword});assert.equal(signed.status,200);assert.equal((await signed.json()).settings.profiles.pve.playerLevel,18);
  enabled=true;now+=60001;const reset=await(await call('code','POST',{email:'http@qq.com',purpose:'password'})).json();
  assert.equal((await call('password/reset','POST',{email:'http@qq.com',challenge:reset.challenge,code:delivered.code,password:originalPassword})).status,200);
});
