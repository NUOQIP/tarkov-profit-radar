import {readJsonBody} from './http-body.mjs';
import {ACCOUNT_SESSION_SECONDS} from './accounts-store.mjs';
const COOKIE='radar-player',local=ip=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
const fail=(status,message)=>Object.assign(new Error(message),{status});
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});
const cookie=(token,secure,expiresAt=Date.now()+ACCOUNT_SESSION_SECONDS*1000)=>`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.ceil((expiresAt-Date.now())/1000))}; Expires=${new Date(expiresAt).toUTCString()}${secure?'; Secure':''}`;
export function createAccountsHandler(accounts,mail){
  function signedIn(result,req,context){
    const old=session(req);if(old)accounts.logout(old);
    const {token,...publicResult}=result;return json(publicResult,200,{'Set-Cookie':cookie(token,context.secure,result.expiresAt)});
  }
  function token(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);}
  function session(req,renew=false){
    return accounts.authenticate(token(req),{renew});
  }
  function requireUser(req,context){
    const origin=new URL(`${context.secure?'https:':'http:'}//${req.headers.host}`);
    if(!context.secure&&!(local(context.ip)&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))throw fail(403,'登录需要 HTTPS');
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin.origin)throw fail(403,'请从本站操作');
    const found=session(req);if(!found)throw fail(401,'请先登录');
    if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==found.csrf)throw fail(403,'登录状态已更新，请重试');
    return found;
  }
  async function handle(req,url,context){
    if(!url.pathname.startsWith('/api/account/'))return null;
    try{
      const origin=new URL(`${context.secure?'https:':'http:'}//${req.headers.host}`);
      if(!context.secure&&!(local(context.ip)&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))throw fail(403,'登录需要 HTTPS');
      if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin.origin)throw fail(403,'请从本站操作');
      const route=url.pathname.slice('/api/account/'.length);
      if(req.method==='GET'&&route==='session'){
        const found=session(req,true),ready=await mail.status();
        return json({user:found?.user||null,emailReady:ready.enabled&&ready.configured,...(found?{csrf:found.csrf,expiresAt:found.expiresAt,...accounts.settings(found.user.id)}:{})},200,
          found?.renewed?{'Set-Cookie':cookie(token(req),context.secure,found.expiresAt)}:{});
      }
      if(req.method==='POST'&&route==='code'){
        const body=await readJsonBody(req);if(Object.keys(body).some(k=>!['email','website','purpose'].includes(k))||body.website)throw fail(400,'请求无效');
        const ready=await mail.status();if(!ready.enabled||!ready.configured)throw fail(503,'邮箱服务尚未配置');
        return json(await accounts.sendCode(body.email,context.ip,mail.send,body.purpose));
      }
      if(req.method==='POST'&&route==='login'){
        const body=await readJsonBody(req);if(Object.keys(body).some(k=>!['email','challenge','code'].includes(k)))throw fail(400,'请求无效');
        return signedIn(accounts.verifyCode(body,context.ip),req,context);
      }
      if(req.method==='POST'&&route==='login/password'){
        const body=await readJsonBody(req);if(Object.keys(body).some(k=>!['email','password'].includes(k)))throw fail(400,'请求无效');
        return signedIn(await accounts.loginPassword(body,context.ip),req,context);
      }
      if(req.method==='POST'&&['register','password/reset'].includes(route)){
        const body=await readJsonBody(req);if(Object.keys(body).some(k=>!['email','challenge','code','password'].includes(k)))throw fail(400,'请求无效');
        return signedIn(await accounts[route==='register'?'register':'resetPassword'](body,context.ip),req,context);
      }
      const found=requireUser(req,context);
      if(route==='password'&&req.method==='PUT'){
        const body=await readJsonBody(req);if(Object.keys(body).some(k=>!['challenge','code','password'].includes(k)))throw fail(400,'请求无效');
        return signedIn(await accounts.resetPassword({...body,email:found.user.email},context.ip),req,context);
      }
      if(route==='settings'&&req.method==='GET')return json(accounts.settings(found.user.id));
      if(route==='settings'&&req.method==='PUT'){
        const body=await readJsonBody(req,500000);
        if(!body.settings||typeof body.settings!=='object'||Array.isArray(body.settings)||Object.keys(body).some(k=>!['settings','revision'].includes(k)))throw fail(400,'设置格式无效');
        return json(accounts.saveSettings(found.user.id,body.settings,body.revision));
      }
      if(route==='profile'&&req.method==='PATCH'){
        const body=await readJsonBody(req);if(Object.keys(body).some(k=>k!=='nickname'))throw fail(400,'昵称设置无效');
        return json({user:accounts.rename(found.user.id,body.nickname)});
      }
      if(route==='logout'&&req.method==='POST'){
        const body=await readJsonBody(req);accounts.logout(found,body.all===true);return json({ok:true},200,{'Set-Cookie':cookie('',context.secure,0)});
      }
      return json({error:'账号接口不存在'},404);
    }catch(error){return json({error:error.status?error.message:'账号服务暂不可用',...(error.current?{current:error.current}:{})},error.status||500,error.retryAfter?{'Retry-After':String(error.retryAfter)}:{});}
  }
  return {handle,session,requireUser};
}
