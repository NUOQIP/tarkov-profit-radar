import {createPreferenceSync} from '/account-sync.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const userIcon='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM8 14l-5 4v4h18v-4l-5-4Z"/></svg>';
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
export function createAccountUI({getSettings,applySettings,getGuestSettings,saveGuest,canRefresh=()=>true,toast=()=>{},openDialog=dialog=>dialog.showModal(),closeDialog=dialog=>dialog.close(),animatePane=()=>{}}){
  let user=null,csrf='',ready=false,muted=false,challenge=null,challengeEmail='',challengePurpose='',securityChallenge=null,nextCodeAt=0,requestBusy=false,epoch=0,timer,needsImport=false,authMode='password';
  let sessionFlight=null,lastSessionCheck=0;
  const root=document.createElement('dialog');root.id='account-dialog';root.className='drawer account-dialog';root.setAttribute('aria-labelledby','account-title');
  root.innerHTML=`<div class="dialog-heading"><div><span class="eyebrow">PLAYER ID / LOOT RADAR</span><h2 id="account-title">玩家账号</h2></div><button type="button" class="icon-button" data-account-close aria-label="关闭账号">×</button></div>
    <div class="account-scroll"><div class="account-hero"><div class="account-emblem" aria-hidden="true">${userIcon}<span>SCAV</span></div><div><strong data-account-heading>把情报带回仓库</strong><p data-account-subheading>条件 · 收藏 · 玩家评论</p></div></div>
    <section data-auth-pane><nav class="account-auth-tabs" aria-label="登录方式"><button type="button" data-auth-mode="password" aria-pressed="true">密码登录</button><button type="button" data-auth-mode="code" aria-pressed="false">验证码登录</button></nav><div class="account-auth-heading" hidden><h3 data-auth-title>创建账号</h3><button type="button" data-auth-mode="password">返回登录</button></div>
      <form class="account-form" id="account-login-form"><label>邮箱<input name="email" type="email" autocomplete="username" maxlength="254" required placeholder="你的常用邮箱"></label>
      <label data-code-field hidden>验证码<div class="account-code-row"><input name="code" aria-label="验证码" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" disabled placeholder="6位验证码"><button type="button" data-send-code>获取验证码</button></div></label>
      <label data-password-field><span data-password-label>密码</span><input name="password" type="password" aria-label="密码" autocomplete="current-password" maxlength="128" required placeholder="输入密码"></label>
      <label data-confirm-field hidden>确认密码<input name="confirm" type="password" aria-label="确认密码" autocomplete="new-password" maxlength="128" disabled placeholder="再次输入密码"></label>
      <label class="comment-trap" aria-hidden="true">网址<input name="website" tabindex="-1" autocomplete="off"></label><p class="account-message" data-auth-message role="status"></p><button type="submit" class="primary account-submit"><span data-auth-submit>登录</span><span aria-hidden="true">→</span></button><div class="account-auth-links"><button type="button" data-auth-mode="register">注册账号</button><button type="button" data-auth-mode="reset">忘记密码</button></div><p class="account-caption" data-auth-caption hidden>首次验证自动注册</p></form></section>
    <section data-member-pane hidden><div class="account-identity"><span>已验证邮箱</span><strong data-member-email></strong></div><form class="account-form nickname-form"><label>评论昵称<div class="account-code-row"><input name="nickname" aria-label="评论昵称" type="text" autocomplete="nickname" minlength="2" maxlength="20" required><button type="submit">保存</button></div></label></form><p class="account-message" data-member-message role="status"></p>
      <section class="account-storage"><div class="account-section-heading"><h3>我的档案</h3><span class="account-sync-state" data-sync-state role="status">已同步</span></div><div class="account-markets" data-account-markets></div><div class="account-storage-actions"><span>条件 · 收藏 · 筛选偏好</span><button type="button" data-sync-now>立即同步</button></div></section>
      <section class="account-choice" data-import-choice hidden><h3>带上你的条件</h3><p>登录前的设置仍保留在本机</p><div data-import-summary></div><div class="account-choice-actions"><button type="button" class="primary" data-import-local>使用本机设置</button><button type="button" data-import-default>使用默认设置</button></div></section>
      <section class="account-choice" data-sync-conflict hidden><h3>另一台设备更新了设置</h3><p>选择要保留的版本</p><div class="account-choice-actions"><button type="button" class="primary" data-keep-remote>使用账号设置</button><button type="button" data-keep-local>保留本机修改</button></div></section>
      <details class="account-security"><summary><span data-password-action>设置密码</span><span data-password-state>未设置</span></summary><form class="account-form" id="account-password-form"><label>邮箱验证码<div class="account-code-row"><input name="code" type="text" aria-label="邮箱验证码" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6位验证码"><button type="button" data-security-code>获取验证码</button></div></label><label>新密码<input name="password" type="password" aria-label="新密码" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="8–128个字符"></label><label>确认新密码<input name="confirm" type="password" aria-label="确认新密码" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="再次输入密码"></label><p class="account-message" data-password-message role="status"></p><button type="submit" class="primary">保存密码</button><p class="account-caption">保存后其他设备需重新登录</p></form></details>
      <div class="account-exit"><button type="button" data-account-logout>退出登录</button></div></section></div>`;
  document.body.append(root);
  const $=s=>root.querySelector(s),login=$('#account-login-form'),security=$('#account-password-form'),button=document.querySelector('#account-button');
  const cacheKey=()=>`loot-radar-account:${user.id}`;
  function withApply(value){if(!value)return;muted=true;try{applySettings(value);}finally{muted=false;}}
  function summary(settings){
    return Object.entries({pve:'PVE',regular:'PVP 常规','pvp-season':'PVP 赛季'}).map(([key,name])=>`<div><small>${name}</small><strong>Lv.${Number(settings?.profiles?.[key]?.playerLevel)||79}</strong><span>${settings?.favorites?.[key]?.length||0} 收藏</span></div>`).join('');
  }
  function emit(){document.querySelectorAll('[data-comment-thread]').forEach(section=>section.dispatchEvent(new Event('accountchange')));}
  function controls(){
    const phase=sync.state.phase,labels={saved:'已同步',pending:'待同步',saving:'同步中',offline:'未同步 · 重试',conflict:'待选择',empty:'待导入',expired:'请重新登录'};
    button.innerHTML=userIcon+`<span>${esc(user?.nickname||'登录')}</span>${user?`<i class="account-dot ${phase}" aria-hidden="true"></i>`:''}`;
    button.setAttribute('aria-label',user?'账号：'+user.nickname:'登录账号');button.title=user?'玩家账号 · '+(labels[phase]||'已登录'):'登录账号';
    $('[data-auth-pane]').hidden=Boolean(user);$('[data-member-pane]').hidden=!user;
    $('[data-account-heading]').textContent=user?.nickname||'把情报带回仓库';$('[data-account-subheading]').textContent=user?'PLAYER PROFILE':'条件 · 收藏 · 玩家评论';
    if(user){
      $('[data-member-email]').textContent=user.email;
      if(document.activeElement!==$('.nickname-form input'))$('.nickname-form input').value=user.nickname;
      $('[data-sync-state]').textContent=labels[phase]||'已登录';$('[data-sync-state]').dataset.phase=phase;
      $('[data-account-markets]').innerHTML=summary(getSettings());
      $('[data-password-action]').textContent=user.hasPassword?'修改密码':'设置密码';$('[data-password-state]').textContent=user.hasPassword?'已设置':'未设置';
    }
    $('[data-import-choice]').hidden=!needsImport;$('[data-sync-conflict]').hidden=phase!=='conflict';
    $('.account-storage-actions').hidden=needsImport||!['pending','offline'].includes(phase);
    document.querySelectorAll('[data-account-status]').forEach(el=>el.textContent=user?(labels[phase]||'账号设置'):'仅保存在本机 · 登录同步');
  }
  const sync=createPreferenceSync({
    save:(settings,revision)=>request('/api/account/settings',{method:'PUT',body:{settings,revision}}),
    apply:withApply,cache:value=>{if(user&&value.settings)write(cacheKey(),value);},
    status:state=>{controls();clearTimeout(timer);if(state.phase==='pending')timer=setTimeout(()=>sync.flush(),900);else if(state.phase==='offline')timer=setTimeout(()=>sync.flush(),15000);}
  });
  async function request(path,{method='GET',body,timeout=25000}={}){
    const startedAs=user?.id;
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});
    let result;try{result=await response.json();}catch{throw new Error('服务暂不可用');}
    if(!response.ok){
      if(response.status===401&&user&&user.id===startedAs){disconnect();toast('登录已过期，本机修改已保留');}
      throw Object.assign(new Error(result.error||'请求失败'),{status:response.status,current:result.current,retryAfter:Number(response.headers.get('Retry-After'))||0});
    }
    return result;
  }
  function connect(result){
    epoch++;clearTimeout(timer);user=result.user;csrf=result.csrf;needsImport=!result.settings;
    sync.bind(result,read(cacheKey()));
    if(needsImport){$('[data-import-summary]').innerHTML=`<div class="account-markets">${summary(getGuestSettings())}</div>`;open();}
    controls();emit();
  }
  function clearPasswords(){for(const form of [login,security]){form.elements.password.value='';form.elements.confirm.value='';}}
  function disconnect(){
    epoch++;clearTimeout(timer);sync.stop();user=null;csrf='';needsImport=false;securityChallenge=null;security.reset();$('.account-security').open=false;clearPasswords();setAuthMode('password');withApply(getGuestSettings());controls();emit();
  }
  function persist(){
    if(muted)return;
    if(!user){saveGuest();return;}
    if(!needsImport)sync.update(getSettings());
  }
  function open(){controls();if(!root.open)openDialog(root);}
  function sessionRequest(){
    if(!sessionFlight)sessionFlight=request('/api/account/session',{timeout:8000}).finally(()=>{sessionFlight=null;});
    return sessionFlight;
  }
  async function refresh(force=false){
    if(!ready||!canRefresh()||requestBusy||(!force&&Date.now()-lastSessionCheck<30000))return;
    const stamp=epoch;
    try{
      const result=await sessionRequest();if(stamp!==epoch)return;lastSessionCheck=Date.now();
      if(result.user){
        if(result.user.id!==user?.id)connect(result);
        else{user=result.user;csrf=result.csrf;if(!needsImport)sync.remote(result);controls();if(sync.state.dirty)sync.flush();}
      }else if(user)disconnect();
    }catch{ /* Drafts stay local; the next focus or retry will sync them. */ }
  }
  async function start(){
    try{const result=await sessionRequest();lastSessionCheck=Date.now();if(result.user)connect(result);else if(!result.emailReady)$('[data-auth-message]').textContent='邮箱服务待配置';}
    catch{$('[data-auth-message]').textContent='账号连接暂不可用，可继续浏览';}
    finally{ready=true;controls();}
  }
  function setAuthMode(mode){
    authMode=mode;const editing=mode==='register'||mode==='reset',code=mode!=='password',password=mode!=='code';
    $('.account-auth-tabs').hidden=editing;$('.account-auth-heading').hidden=!editing;$('.account-auth-links').hidden=editing;
    $('[data-auth-title]').textContent=mode==='reset'?'找回密码':'创建账号';
    root.querySelectorAll('.account-auth-tabs button').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.authMode===mode)));
    for(const [field,visible] of [['code',code],['password',password],['confirm',editing]]){
      $('[data-'+field+'-field]').hidden=!visible;login.elements[field].disabled=!visible;login.elements[field].required=visible;
    }
    login.elements.password.autocomplete=editing?'new-password':'current-password';login.elements.password.minLength=editing?8:1;
    login.elements.password.placeholder=editing?'8–128个字符':'输入密码';
    $('[data-password-label]').textContent=mode==='reset'?'新密码':'密码';
    login.elements.password.setAttribute('aria-label',mode==='reset'?'新密码':'密码');
    $('[data-auth-submit]').textContent={password:'登录',code:'登录 / 注册',register:'注册并登录',reset:'重置密码并登录'}[mode];
    $('[data-auth-caption]').hidden=mode!=='code';$('[data-auth-message]').textContent='';
    login.elements.password.value='';login.elements.confirm.value='';codeButton();
    if(root.open){animatePane($('.account-scroll'));if(editing)login.elements.email.focus({preventScroll:true});}
  }
  root.querySelectorAll('[data-auth-mode]').forEach(el=>el.addEventListener('click',()=>{if(!requestBusy)setAuthMode(el.dataset.authMode);}));
  const authPurpose=()=>({password:'login',code:'login',register:'register',reset:'password'}[authMode]);
  function codeButton(){
    const seconds=Math.max(0,Math.ceil((nextCodeAt-Date.now())/1000));
    for(const send of [$('[data-send-code]'),$('[data-security-code]')]){send.disabled=requestBusy||seconds>0;send.textContent=seconds?`${seconds}s 后重发`:requestBusy?'请稍候…':'获取验证码';}
  }
  $('[data-send-code]').addEventListener('click',async()=>{
    if(!login.elements.email.reportValidity())return;
    const email=login.elements.email.value.trim().toLowerCase();requestBusy=true;codeButton();$('[data-auth-message]').textContent='';
    try{
      const purpose=authPurpose(),result=await request('/api/account/code',{method:'POST',body:{email,website:login.elements.website.value,purpose}});
      challenge=result.challenge;challengeEmail=email;challengePurpose=purpose;nextCodeAt=Date.now()+result.retryAfter*1000;$('[data-auth-message]').textContent='验证码已发送，请查收邮箱';login.elements.code.focus();
    }catch(error){if(error.retryAfter)nextCodeAt=Date.now()+error.retryAfter*1000;$('[data-auth-message]').textContent=error.message;}
    finally{requestBusy=false;codeButton();}
  });
  login.addEventListener('submit',async event=>{
    event.preventDefault();const email=login.elements.email.value.trim().toLowerCase(),submit=login.querySelector('[type=submit]');
    if(requestBusy)return;
    if(authMode!=='password'&&(!challenge||email!==challengeEmail||challengePurpose!==authPurpose())){$('[data-auth-message]').textContent='请先获取该邮箱的验证码';return;}
    if(['register','reset'].includes(authMode)&&login.elements.password.value!==login.elements.confirm.value){$('[data-auth-message]').textContent='两次密码不一致';return;}
    submit.disabled=true;requestBusy=true;codeButton();$('[data-auth-message]').textContent='';
    try{
      const route={password:'login/password',code:'login',register:'register',reset:'password/reset'}[authMode],body={email};
      if(authMode!=='password')Object.assign(body,{code:login.elements.code.value.trim(),challenge});
      if(authMode!=='code')body.password=login.elements.password.value;
      const result=await request('/api/account/'+route,{method:'POST',body});
      login.elements.code.value='';clearPasswords();challenge=null;connect(result);$('[data-member-message]').textContent=authMode==='reset'?'密码已重置':'登录成功';
    }catch(error){$('[data-auth-message]').textContent=error.message;}finally{submit.disabled=false;requestBusy=false;codeButton();}
  });
  $('[data-security-code]').addEventListener('click',async()=>{
    if(!user||requestBusy)return;requestBusy=true;codeButton();$('[data-password-message]').textContent='';
    try{const result=await request('/api/account/code',{method:'POST',body:{email:user.email,purpose:'password'}});securityChallenge=result.challenge;nextCodeAt=Date.now()+result.retryAfter*1000;$('[data-password-message]').textContent='验证码已发送至当前邮箱';security.elements.code.focus();}
    catch(error){if(error.retryAfter)nextCodeAt=Date.now()+error.retryAfter*1000;$('[data-password-message]').textContent=error.message;}
    finally{requestBusy=false;codeButton();}
  });
  security.addEventListener('submit',async event=>{
    event.preventDefault();if(requestBusy||!user)return;
    if(!securityChallenge){$('[data-password-message]').textContent='请先获取邮箱验证码';return;}
    if(security.elements.password.value!==security.elements.confirm.value){$('[data-password-message]').textContent='两次密码不一致';return;}
    const submit=event.submitter;submit.disabled=true;requestBusy=true;codeButton();$('[data-password-message]').textContent='';
    try{
      await sync.flush();
      const result=await request('/api/account/password',{method:'PUT',body:{challenge:securityChallenge,code:security.elements.code.value.trim(),password:security.elements.password.value}});
      user=result.user;csrf=result.csrf;epoch++;securityChallenge=null;security.reset();clearPasswords();controls();emit();$('[data-password-message]').textContent='密码已保存';
    }catch(error){$('[data-password-message]').textContent=error.message;}finally{submit.disabled=false;requestBusy=false;codeButton();}
  });
  $('.nickname-form').addEventListener('submit',async event=>{
    event.preventDefault();const submit=event.submitter;submit.disabled=true;
    try{const result=await request('/api/account/profile',{method:'PATCH',body:{nickname:$('.nickname-form input').value.trim()}});user=result.user;controls();emit();$('[data-member-message]').textContent='昵称已保存';}
    catch(error){$('[data-member-message]').textContent=error.message;}finally{submit.disabled=false;}
  });
  async function importSettings(defaults=false){
    needsImport=false;withApply(defaults?{}:getGuestSettings());sync.update(getSettings());controls();await sync.flush();
  }
  $('[data-import-local]').addEventListener('click',()=>importSettings());$('[data-import-default]').addEventListener('click',()=>importSettings(true));
  $('[data-keep-remote]').addEventListener('click',()=>{sync.resolve(false);controls();});$('[data-keep-local]').addEventListener('click',()=>{sync.resolve(true);sync.flush();});
  $('[data-sync-now]').addEventListener('click',async()=>{await sync.flush();await refresh();});
  async function logout(){
    const element=$('[data-account-logout]');element.disabled=true;
    try{await sync.flush();await request('/api/account/logout',{method:'POST',body:{}});disconnect();$('[data-auth-message]').textContent='已退出登录';}
    catch(error){$('[data-member-message]').textContent=error.message;}finally{element.disabled=false;}
  }
  $('[data-account-logout]').addEventListener('click',logout);
  $('[data-account-close]').addEventListener('click',()=>closeDialog(root));
  root.addEventListener('cancel',event=>{event.preventDefault();closeDialog(root);});
  root.addEventListener('close',clearPasswords);
  root.addEventListener('click',event=>{if(event.target===root){const box=root.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeDialog(root);}});
  button.addEventListener('click',open);document.querySelectorAll('[data-account-open]').forEach(el=>el.addEventListener('click',open));
  window.addEventListener('online',()=>refresh(true));window.addEventListener('focus',()=>refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();else if(user&&!needsImport)sync.flush();});
  setInterval(()=>{if(root.open)codeButton();},1000);setInterval(()=>{if(!document.hidden)refresh();},60000);
  controls();return {start,open,persist,request,get user(){return user;}};
}
