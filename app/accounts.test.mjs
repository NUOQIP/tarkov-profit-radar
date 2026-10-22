import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {normalizeEmail,createAccountsStore,ACCOUNT_SESSION_SECONDS,ACCOUNT_SESSION_MAX_SECONDS} from './accounts-store.mjs';
import {createAccountsHandler} from './accounts-service.mjs';
import {createCommentsStore} from './comments-store.mjs';
import {createCommentsHandler} from './comments-service.mjs';
import {createRadarServer} from './http-server.mjs';
import {createMailService} from './mail-service.mjs';
import {createAdminHandler} from './admin-service.mjs';
import {passwordCredential} from './admin-auth.mjs';
import {normalizeAccountSettings} from './account-settings.mjs';
const bulb={id:'5d1b392c86f77425243e98fe',name:'电灯泡'};
async function signIn(store,email='player@qq.com',ip=email){let delivered;const sent=await store.sendCode(email,ip,async message=>{delivered=message;});return store.verifyCode({email,challenge:sent.challenge,code:delivered.code},ip);}
test('email registration accepts common providers, aliases and enterprise domains without a brand allowlist',()=>{
  for(const value of ['user@qq.com','user@163.com','user@126.com','user@outlook.com','user@gmail.com','user+game@company.example','user@mail.yahoo.co.jp'])assert.equal(normalizeEmail(value),value);
  assert.equal(normalizeEmail(' Player@QQ.COM '),'player@qq.com');
  for(const value of ['a@b','a@@qq.com','a\n@qq.com','a@qq.com,other@qq.com','.user@qq.com','u..x@qq.com','a@-invalid.com',null])assert.throws(()=>normalizeEmail(value),{status:400});
});
test('mail proof is email-bound, one-use and expires; failed guesses exhaust the challenge',async t=>{
  let now=1700000000000;const store=createAccountsStore(':memory:',{now:()=>now});t.after(()=>store.close());
  let mail;const challenge=await store.sendCode('a@qq.com','ip',async m=>{mail=m;});
  assert(!JSON.stringify(challenge).includes(mail.code));assert.equal(mail.code.length,6);
  assert.throws(()=>store.verifyCode({email:'b@qq.com',challenge:challenge.challenge,code:mail.code},'ip'),{status:400});
  const account=store.verifyCode({email:'a@qq.com',challenge:challenge.challenge,code:mail.code},'ip');assert(account.created);assert.equal(account.user.email,'a@qq.com');
  assert.throws(()=>store.verifyCode({email:'a@qq.com',challenge:challenge.challenge,code:mail.code},'ip'),{status:400});
  now+=60001;const next=await store.sendCode('a@qq.com','ip',async m=>{mail=m;});
  const bad=mail.code==='123456'?'654321':'123456';for(let i=0;i<5;i++)assert.throws(()=>store.verifyCode({email:'a@qq.com',challenge:next.challenge,code:bad},'ip'),{status:400});
  assert.throws(()=>store.verifyCode({email:'a@qq.com',challenge:next.challenge,code:mail.code},'ip'),{status:400});
  now+=60001;const expired=await store.sendCode('a@qq.com','ip',async m=>{mail=m;});now+=600001;
  assert.throws(()=>store.verifyCode({email:'a@qq.com',challenge:expired.challenge,code:mail.code},'ip'),{status:400});
});
test('mail requests throttle resends, invalidate older codes and fail closed on delivery failure',async t=>{
  let now=1700000000000;const store=createAccountsStore(':memory:',{now:()=>now});t.after(()=>store.close());let oldCode;
  const old=await store.sendCode('a@163.com','ip',async m=>{oldCode=m.code;});
  await assert.rejects(store.sendCode('a@163.com','other-ip',async()=>{}),{status:429});now+=60001;
  await assert.rejects(store.sendCode('a@163.com','ip',async()=>{throw new Error('smtp-auth-secret');}),{status:503});
  assert.throws(()=>store.verifyCode({email:'a@163.com',challenge:old.challenge,code:oldCode},'ip'),{status:400});
});
test('account sessions and settings persist, back up, and revoke individually or across devices',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-accounts-'));assert(dir.startsWith(resolve(tmpdir())+sep));const path=join(dir,'accounts.sqlite');
  let now=1700000000000,store=createAccountsStore(path,{now:()=>now});t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
  const first=await signIn(store),user=store.authenticate(first.token);assert.equal(user.user.id,first.user.id);
  const draft={profiles:{pve:{playerLevel:14,maxProgress:false,progressConfigured:true}},favorites:{pve:[bulb.id]},workspaceViews:{pve:{run:{ignoreFleaLevel:false,quicklookTypes:[],quicklookTypesRevision:3}}}};
  assert.equal(store.saveSettings(user.user.id,draft,0).revision,1);store.rename(user.user.id,'拾荒者');store.close();store=createAccountsStore(path,{now:()=>now});
  assert.equal(store.authenticate(first.token).user.nickname,'拾荒者');assert.equal(store.settings(user.user.id).settings.profiles.pve.playerLevel,14);
  assert.equal(store.settings(user.user.id).settings.workspaceViews.pve.run.ignoreFleaLevel,false);assert.deepEqual(store.settings(user.user.id).settings.workspaceViews.pve.run.quicklookTypes,[]);
  assert(!String(await readFile(path)).includes(first.token));
  const reader=new DatabaseSync(path,{readOnly:true});try{await backup(reader,join(dir,'backup.sqlite'));}finally{reader.close();}
  const restored=createAccountsStore(join(dir,'backup.sqlite'));assert.equal(restored.settings(user.user.id).revision,1);restored.close();
  now+=60001;const second=await signIn(store);assert.equal(second.created,false);store.logout(store.authenticate(first.token));assert.equal(store.authenticate(first.token),null);assert(store.authenticate(second.token));
  store.logout(store.authenticate(second.token),true);assert.equal(store.authenticate(second.token),null);
  now+=60001;const third=await signIn(store);now+=(ACCOUNT_SESSION_SECONDS+1)*1000;assert.equal(store.authenticate(third.token),null);
});

test('active sessions renew at most daily, survive restart and retain absolute expiry and revocation',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-session-renewal-'));assert(dir.startsWith(resolve(tmpdir())+sep));
  let now=1700000000000;const started=now,path=join(dir,'accounts.sqlite');
  let store=createAccountsStore(path,{now:()=>now});t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
  const login=await signIn(store),original=login.expiresAt;
  now+=12*3600000;assert.equal(store.authenticate(login.token,{renew:true}).renewed,false);
  now+=12*3600000+1;
  const renewed=store.authenticate(login.token,{renew:true});assert(renewed.renewed);assert(renewed.expiresAt>original);assert.equal(renewed.csrf,login.csrf);
  assert.equal(store.authenticate(login.token,{renew:true}).renewed,false);
  store.close();store=createAccountsStore(path,{now:()=>now});assert.equal(store.authenticate(login.token).expiresAt,renewed.expiresAt);
  // A 30-day session from the previous release upgrades on the next authenticated visit.
  const db=new DatabaseSync(path);db.prepare('UPDATE account_sessions SET expires=?').run(now+30*86400000);db.close();
  const migrated=store.authenticate(login.token,{renew:true});assert(migrated.renewed);assert.equal(migrated.expiresAt,now+ACCOUNT_SESSION_SECONDS*1000);
  for(let day=50;day<365;day+=50){now=started+day*86400000;assert(store.authenticate(login.token,{renew:true}));}
  assert.equal(store.authenticate(login.token).expiresAt,started+ACCOUNT_SESSION_MAX_SECONDS*1000);
  now=started+ACCOUNT_SESSION_MAX_SECONDS*1000;assert.equal(store.authenticate(login.token,{renew:true}),null);
  now+=60001;const next=await signIn(store);store.logout(store.authenticate(next.token));assert.equal(store.authenticate(next.token,{renew:true}),null);
});

test('session renewal refreshes the persistent secure cookie, but public pages and expired tokens do not renew it',async t=>{
  let now=Date.now();const store=createAccountsStore(':memory:',{now:()=>now});t.after(()=>store.close());
  const login=await signIn(store),handler=createAccountsHandler(store,{status:async()=>({enabled:true,configured:true})});
  const request={method:'GET',headers:{host:'radar.example',cookie:'radar-player='+login.token}},url=new URL('https://radar.example/api/account/session');
  const first=await handler.handle(request,url,{secure:true,ip:'198.51.100.1'});assert(!first.headers.has('set-cookie'));assert.equal(first.headers.get('cache-control'),'no-store');
  now+=86400001;
  const second=await handler.handle(request,url,{secure:true,ip:'198.51.100.1'}),cookie=second.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly; SameSite=Strict/);assert.match(cookie,/Expires=/);assert.match(cookie,/; Secure$/);assert(!cookie.includes('Domain='));
  assert.equal((await second.json()).user.id,login.user.id);
  assert.equal(await handler.handle(request,new URL('https://radar.example/api/dashboard'),{secure:true,ip:'198.51.100.1'}),null);
  now+=ACCOUNT_SESSION_SECONDS*1000+1;
  const expired=await handler.handle(request,url,{secure:true,ip:'198.51.100.1'});assert.equal((await expired.json()).user,null);assert(!expired.headers.has('set-cookie'));
});
test('settings reject stale writes and strip navigation, secrets and unknown data',async t=>{
  const store=createAccountsStore(':memory:');t.after(()=>store.close());const a=await signIn(store),b=await signIn(store,'b@qq.com');
  const original=store.saveSettings(a.user.id,{profiles:{pve:{playerLevel:21}},email:'secret@x.com',csrf:'secret',page:'run',workspaceViews:{pve:{items:{search:'secret search'}}}},0);
  assert.throws(()=>store.saveSettings(a.user.id,{profiles:{pve:{playerLevel:22}}},0),error=>error.status===409&&error.current.revision===1);
  assert.equal(store.settings(b.user.id).settings,null);assert(!JSON.stringify(original.settings).includes('secret'));assert.equal(original.settings.workspaceViews.pve.items.search,'');
  assert.equal(store.saveSettings(a.user.id,original.settings,1).revision,1);
  assert.equal(normalizeAccountSettings({profiles:{pve:{playerLevel:1000}}}).profiles.pve.playerLevel,79);
});
test('HTTP accounts protect sessions, origin, CSRF, private settings and comment authorship',async t=>{
  const accounts=createAccountsStore(':memory:'),comments=createCommentsStore(':memory:');t.after(()=>{accounts.close();comments.close();});let delivered;
  const mail={status:async()=>({enabled:true,configured:true}),send:async m=>{delivered=m;}};
  const auth=createAccountsHandler(accounts,mail),commentsHandler=createCommentsHandler(comments,{findItem:async id=>id===bulb.id?bulb:null,requireUser:auth.requireUser});
  const server=createRadarServer({},new Map(),{accountHandler:auth.handle,commentsHandler});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));const origin='http://127.0.0.1:'+server.address().port;
  const call=(path,method='GET',body,headers={})=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...headers},...(body?{body:JSON.stringify(body)}:{})});
  const endpoint='/api/comments?item='+bulb.id;
  assert.equal((await call(endpoint)).status,200);assert.equal((await call(endpoint,'POST',{text:'未登录不能发布'})).status,401);
  assert.equal((await call('/api/account/settings')).status,401);
  assert.equal((await call('/api/account/code','POST',{email:'player@qq.com'},{Origin:'https://evil.example'})).status,403);
  const sent=await(await call('/api/account/code','POST',{email:'player@qq.com'})).json();assert(sent.challenge);assert(!sent.code);
  const response=await call('/api/account/login','POST',{email:'player@qq.com',challenge:sent.challenge,code:delivered.code});assert.equal(response.status,200);
  const account=await response.json(),Cookie=response.headers.get('set-cookie').split(';')[0],headers={Cookie,'X-CSRF-Token':account.csrf};
  assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.equal(response.headers.get('cache-control'),'no-store');assert(!account.token);
  assert.equal((await call('/api/account/settings','PUT',{settings:{},revision:0},{Cookie})).status,403);
  assert.equal((await call('/api/account/settings','PUT',{settings:{},revision:0},headers)).status,200);
  assert.equal((await call('/api/account/settings','PUT',{userId:'another',settings:{},revision:1},headers)).status,400);
  assert.equal((await call('/api/account/profile','PATCH',{nickname:'账号昵称'},headers)).status,200);
  assert.equal((await call(endpoint,'POST',{nickname:'冒用名字',text:'不能冒用昵称'},headers)).status,400);
  const posted=await call(endpoint,'POST',{text:'来自已验证邮箱的评论'},headers);assert.equal(posted.status,201);assert.equal((await posted.json()).comment.nickname,'账号昵称');
  const publicComments=JSON.stringify(await(await call(endpoint)).json());assert(!publicComments.includes('player@qq.com'));assert(!publicComments.includes(account.user.id));
  assert.equal((await call('/api/account/logout','POST',{},headers)).status,200);assert.equal((await call('/api/account/settings','GET',null,headers)).status,401);
});
test('SMTP configuration keeps secrets private, requires TLS and reports delivery failure',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-mail-'));assert(dir.startsWith(resolve(tmpdir())+sep));t.after(()=>rm(dir,{recursive:true,force:true}));
  let options,message;const mail=createMailService(join(dir,'mail.json'),{transport:settings=>{options=settings;return {verify:async()=>true,sendMail:async m=>{message=m;return {accepted:[m.to]};},close(){}};}});
  assert.equal((await mail.status()).configured,false);await assert.rejects(mail.send({email:'player@qq.com',code:'123456'}),{status:503});
  const saved=await mail.save({enabled:true,provider:'qq',user:'sender@qq.com',from:'',password:'test-authorization-code'});
  assert(!JSON.stringify(saved).includes('test-authorization-code'));assert.equal(saved.passwordSet,true);
  await mail.save({...saved,password:'',passwordSet:undefined,configured:undefined}).then(()=>assert.fail('Unknown fields accepted'),error=>assert.equal(error.status,400));
  await mail.save({enabled:true,provider:'qq',user:'sender@qq.com',from:'',password:''});await mail.verify();
  assert.equal(options.secure,true);assert.equal(options.requireTLS,true);assert.equal(options.debug,false);assert.equal(options.disableFileAccess,true);
  await mail.send({email:'player@outlook.com',code:'123456'});assert.equal(message.to,'player@outlook.com');assert.match(message.text,/123456/);
});
test('admin email settings require admin auth and CSRF and never return the SMTP secret',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-mail-admin-'));assert(dir.startsWith(resolve(tmpdir())+sep));t.after(()=>rm(dir,{recursive:true,force:true}));
  const credential=await passwordCredential('test-admin-password-only'),mail=createMailService(join(dir,'mail.json'));
  const server=createRadarServer({},new Map(),{adminHandler:createAdminHandler({}, {readCredential:async()=>credential,mail})});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));const origin='http://127.0.0.1:'+server.address().port;
  const call=(path,method='GET',body,headers={})=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...headers},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await call('/admin/api/mail')).status,401);const login=await call('/admin/api/login','POST',{password:'test-admin-password-only'}),session=await login.json(),Cookie=login.headers.get('set-cookie').split(';')[0];
  const config={enabled:true,provider:'qq',user:'test@qq.com',password:'private-smtp-authorization'};
  assert.equal((await call('/admin/api/mail','PUT',config,{Cookie})).status,403);
  const saved=await call('/admin/api/mail','PUT',config,{Cookie,'X-CSRF-Token':session.csrf});assert.equal(saved.status,200);assert(!(await saved.text()).includes(config.password));
  assert(!(await(await call('/admin/api/mail','GET',null,{Cookie})).text()).includes(config.password));
});
