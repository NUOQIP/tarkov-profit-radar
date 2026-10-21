const $=id=>document.getElementById(id),rarities={Common:'常见',Rare:'稀有',Superrare:'超稀有',Unknown:'未收录'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageUrl=value=>{try{const u=new URL(value,location.origin);return u.protocol==='https:'||u.origin===location.origin?u.href:'';}catch{return '';}};
const date=value=>value?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'等待采集';
let csrf='',page=1,pages=1,revision=0,selectedRevision=0,rows=[],selected=null,loadId=0,timer,toastTimer,busy=false;
async function api(path,options={}){
  const response=await fetch('/admin/api'+path,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers}});
  const value=await response.json();
  if(!response.ok){if(response.status===401&&path!=='/login'){showLogin();$('login-error').textContent='登录已过期，请重新登录';}throw Object.assign(new Error(value.error||'请求失败'),{status:response.status});}
  return value;
}
function notice(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function showLogin(){$('workspace').hidden=true;$('logout').hidden=true;$('login').hidden=false;$('login-form').hidden=false;$('login-note').textContent='管理物品分类与跑刀稀有度。';$('editor').close();csrf='';}
async function enter(){
  $('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;
  await Promise.all([loadOverview(),loadItems()]);
}
async function loadOverview(){
  try{const data=await api('/overview');
    $('overview').innerHTML=data.markets.map(m=>`<div class="status-card"><div><span class="status-dot ${!m.fetchedAt||Date.now()-Date.parse(m.fetchedAt)>900000?'stale':''}"></span>${esc(m.label)}<small>${esc(date(m.fetchedAt))} 更新</small></div><div><strong>${m.items.toLocaleString()}</strong><small>物品</small></div></div>`).join('')+`<div class="status-card"><div>人工调整<small>覆盖上游分类</small></div><div><strong>${data.modified}</strong><small>件物品</small></div></div>`;
    const source=data.upstream,labels={current:'与上游一致',update:'上游有新版本',error:'检查暂未完成',checking:'检查中',unchecked:'尚未检查'};
    $('maintenance-content').innerHTML=`<div><strong>稀有度来源 · SPT ${esc(source.current.version)}</strong><p>${esc(labels[source.status]||source.status)}<br>最近检查 ${esc(date(source.checkedAt))}<br>每 ${source.intervalDays} 天自动检查</p></div><div><strong>最近修改</strong>${data.audit.length?data.audit.map(a=>`<div class="audit-entry"><code>${esc(a.id)}</code><span>${esc(date(a.at))}</span></div>`).join(''):'<p>尚无人工调整</p>'}</div>`;
  }catch(error){notice(error.message);}
}
async function loadItems(){
  const id=++loadId;$('table-wrap').setAttribute('aria-busy','true');$('previous').disabled=$('next').disabled=true;
  const query=new URLSearchParams({market:$('market').value,q:$('search').value,page,event:$('event-filter').value,modified:$('modified').checked?'1':'0'});
  try{const data=await api('/items?'+query);if(id!==loadId)return;({page,pages,revision}=data);rows=data.items;
    $('items').innerHTML=rows.map(i=>`<tr><td><button class="item-name" data-edit="${i.id}"><img loading="lazy" src="${esc(imageUrl(i.image))}" alt=""><span><strong>${i.override?'<span class="edited-dot" title="已人工修改"></span>':''}${esc(i.name)}</strong><small>${esc(i.english||i.id)}</small></span></button></td><td>${esc(i.category)}</td><td><span class="badge ${i.effective.eventOnly?'':'neutral'}">${i.effective.eventOnly?'活动物品':'非活动'}</span></td><td>${esc(rarities[i.effective.rarity])}</td><td><button class="edit-button" data-edit="${i.id}" aria-label="编辑 ${esc(i.name)}">编辑 ↗</button></td></tr>`).join('');
    $('total').textContent=`共 ${data.total.toLocaleString()} 件物品`;$('page-label').textContent=`${page} / ${pages}`;$('empty').hidden=rows.length>0;$('previous').disabled=page<=1;$('next').disabled=page>=pages;
  }catch(error){if(id===loadId)notice(error.message);}finally{if(id===loadId)$('table-wrap').setAttribute('aria-busy','false');}
}
function openEditor(id){
  selected=rows.find(i=>i.id===id);if(!selected)return;
  selectedRevision=revision;
  $('item-heading').innerHTML=`<img src="${esc(imageUrl(selected.image))}" alt=""><h2 id="editor-title">${esc(selected.name)}</h2><code>${selected.id}</code>`;
  $('edit-event').value=typeof selected.override?.eventOnly==='boolean'?String(selected.override.eventOnly):'source';$('edit-rarity').value=selected.override?.rarity||'source';
  $('event-source').textContent='原始分类：'+(selected.original.eventOnly?'活动物品':'非活动物品');$('rarity-source').textContent='原始分类：'+rarities[selected.original.rarity];
  if(selected.baseItem&&!selected.override){$('rarity-source').textContent+=' · 继承基础武器调整';}
  $('edit-error').textContent='';$('editor').showModal();
}
function editBusy(value){busy=value;for(const id of ['save','restore','close-editor','edit-event','edit-rarity'])$(id).disabled=value;$('save').textContent=value?'保存中…':'保存修改';}
async function save(restore=false){
  if(busy||!selected)return;editBusy(true);$('edit-error').textContent='';
  try{await api(`/items/${selected.id}?market=${encodeURIComponent($('market').value)}`,{method:'PATCH',body:JSON.stringify({revision:selectedRevision,eventOnly:restore||$('edit-event').value==='source'?null:$('edit-event').value==='true',rarity:restore||$('edit-rarity').value==='source'?null:$('edit-rarity').value})});
    $('editor').close();notice(restore?'已恢复原始分类':'已保存，玩家看板将在下一次行情检查时应用');await Promise.all([loadItems(),loadOverview()]);
  }catch(error){$('edit-error').textContent=error.message;if(error.status===409){await loadItems();$('edit-error').textContent='其他窗口已修改分类，请关闭并重新打开此物品。';}}finally{editBusy(false);}
}
$('login-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;$('login-error').textContent='';try{const data=await api('/login',{method:'POST',body:JSON.stringify({password:$('password').value})});csrf=data.csrf;$('password').value='';await enter();}catch(error){$('login-error').textContent=error.message;}finally{button.disabled=false;}});
$('logout').addEventListener('click',async()=>{try{await api('/logout',{method:'POST',body:'{}'});showLogin();}catch(error){notice(error.message);}});
$('filters').addEventListener('submit',event=>{event.preventDefault();clearTimeout(timer);page=1;loadItems();});
$('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;loadItems();},250);});
for(const id of ['market','event-filter','modified'])$(id).addEventListener('change',()=>{page=1;loadItems();});
$('reload').addEventListener('click',()=>Promise.all([loadItems(),loadOverview()]));
$('previous').addEventListener('click',()=>{if(page>1){page--;loadItems();}});$('next').addEventListener('click',()=>{if(page<pages){page++;loadItems();}});
$('items').addEventListener('click',event=>{const button=event.target.closest('[data-edit]');if(button)openEditor(button.dataset.edit);});
$('close-editor').addEventListener('click',()=>$('editor').close());$('editor').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('edit-form').addEventListener('submit',event=>{event.preventDefault();save();});$('restore').addEventListener('click',()=>save(true));
try{const state=await api('/session');if(state.authenticated){csrf=state.csrf;await enter();}else{$('login-form').hidden=!state.configured;$('login-note').textContent=state.configured?'管理物品分类与跑刀稀有度。':'请先在服务器设置管理员密码。';}}catch(error){$('login-note').textContent=error.message;}
