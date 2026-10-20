import { MARKETS,CATEGORIES,collectLoot,collectCatalog,filterCatalog,collectFlips,collectCrafts,analyzeHistory,normalizeProfile,resolveTradingProfile,tradingTraders,productionStations,traderMaxLevel,profileTaskIds,hasFullProgress,isScavengingItem,profitStability,scenario } from '/engine.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const KEY='loot-radar-v2',params=new URLSearchParams(location.search);
const UI_REVISION=6;
const PAGES=['loot','flips','crafts','items'],MODULES={loot:'捡什么 · 卖什么',flips:'商人倒货',crafts:'藏身处制作'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(v)?(Math.sign(v)*Math.round(Math.abs(v))).toLocaleString('zh-CN'):'—';
const sign=v=>Number.isFinite(v)?(v>=0?'+':'−')+fmt(Math.abs(v)):'—';
const percent=v=>Number.isFinite(v)?sign(v*100)+'%':'—';
const clock=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const ago=v=>{const n=(Date.now()-Date.parse(v))/60000;return !Number.isFinite(n)?'时间未知':n<60?Math.max(0,Math.floor(n))+'分钟前':n<1440?Math.floor(n/60)+'小时前':Math.floor(n/1440)+'天前';};
const duration=seconds=>seconds>=3600?`${Math.floor(seconds/3600)}时${Math.ceil(seconds%3600/60)||''}${seconds%3600?'分':''}`:Math.ceil(seconds/60)+'分';
const paths={
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 2M4 16l2 2a7 7 0 0 0 12-1"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 5 11 7-11 7Z"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 moon:'<path d="M20 14A8.5 8.5 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
 sliders:'<path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10M9 3v6m4 0V3m0 6v6m4-6v6M6 15v6m4-6v6"/>',
 filter:'<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',star:'<path d="m12 3 2.8 5.6L21 9.5l-4.5 4.4 1 6.1-5.5-2.9L6.5 20l1-6.1L3 9.5l6.2-.9Z"/>',
 backpack:'<path d="M8 6V4a4 4 0 0 1 8 0v2M6 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><path d="M7 12h10v6H7Z"/>',
 exchange:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',craft:'<path d="m14 5 5 5M3 21l7-7m2-10-2 2 8 8 3-3-3-3 1-3-4-2Z"/><path d="m5 3 4 4-2 3-4-4m7 6 10 10"/>',
 'arrow-down':'<path d="M12 4v16m-5-5 5 5 5-5"/>',chevron:'<path d="m9 5 7 7-7 7"/>',x:'<path d="m6 6 12 12M18 6 6 18"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',trend:'<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
 eyeoff:'<path d="m3 3 18 18M10 10a3 3 0 0 0 4 4M9 5c5-2 10 2 13 7-1 2-2 3-3 4M6 6c-2 2-4 4-4 6 4 7 11 9 16 5"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',check:'<path d="m5 12 4 4L20 5"/>',box:'<path d="m12 3 9 5v10l-9 5-9-5V8Z M3 8l9 5 9-5M12 13v10"/>'
};
const icon=(name,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.box}</svg>`;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}
const image=(url,name='',className='')=>/^https:\/\/assets\.tarkov\.dev\//.test(url||'')?`<img src="${esc(url)}" alt="${esc(name)}" class="${className}" loading="lazy" decoding="async">`:'';
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('eft-radar-live-v1')||'{}');}catch{}
if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
const safeIds=value=>Array.isArray(value)?value.filter(x=>/^[0-9a-f]{24}$/.test(x)):[];
function safeView(v={}){
  if(!v||typeof v!=='object')v={};
  const c=v.criteria||{},n=x=>Number.isFinite(Number(x))?Math.max(0,Math.min(1e10,Number(x))):0;
  return {category:Object.hasOwn(CATEGORIES,v.category)?v.category:'all',filter:['short','favorites'].includes(v.filter)?v.filter:'all',
    search:typeof v.search==='string'?v.search.slice(0,200):'',
    includeEvents:v.includeEvents===true,
    lootScope:v.lootScope==='scavenging'?'scavenging':'all',station:typeof v.station==='string'?v.station:'all',
    criteria:{minSlot:n(c.minSlot),minProfit:n(c.minProfit),budget:n(c.budget),maxHours:n(c.maxHours),onlyExecutable:c.onlyExecutable===true,freshOnly:c.freshOnly===true}};
}
function safeCatalogView(v={}){
  if(!v||typeof v!=='object')v={};
  return {search:typeof v.search==='string'?v.search.slice(0,200):'',category:Object.hasOwn(CATEGORIES,v.category)?v.category:'all',
    availability:['flea','banned','unpriced'].includes(v.availability)?v.availability:'all',favoritesOnly:v.favoritesOnly===true};
}
const state={
 market:Object.hasOwn(MARKETS,params.get('market'))?params.get('market'):Object.hasOwn(MARKETS,saved.market)?saved.market:'pve',
 uiRevision:UI_REVISION,
 page:params.get('view')==='monitor'?'loot':PAGES.includes(params.get('view'))?params.get('view'):PAGES.includes(saved.page)?saved.page:'loot',
 profiles:Object.fromEntries(Object.keys(MARKETS).map(k=>[k,normalizeProfile(saved.profiles?.[k])])),
 views:Object.fromEntries(Object.keys(MARKETS).map(k=>[k,safeView(saved.views?.[k])])),favorites:{},
 workspaceViews:Object.fromEntries(Object.keys(MARKETS).map(m=>[m,Object.fromEntries(['loot','flips','crafts'].map(k=>[k,safeView(saved.workspaceViews?.[m]?.[k])]))])),
 catalogViews:Object.fromEntries(Object.keys(MARKETS).map(k=>[k,safeCatalogView(saved.catalogViews?.[k])])),
 density:saved.density==='compact'?'compact':'standard',
 theme:saved.uiRevision===UI_REVISION&&['light','dark'].includes(saved.theme)?saved.theme:'dark',paused:false
};
for(const market of Object.keys(MARKETS)){
  state.favorites[market]=safeIds(saved.favorites?.[market]);
  if(saved.uiRevision!==UI_REVISION)state.workspaceViews[market].loot.lootScope='all';
  for(const v of Object.values(state.workspaceViews[market]))Object.assign(v,{includeEvents:state.views[market].includeEvents});
}
function view(){return state.workspaceViews[state.market][state.page==='items'?'loot':state.page];}
function allViews(){return [state.views[state.market],...Object.values(state.workspaceViews[state.market])];}
function catalogView(){return state.catalogViews[state.market];}
function criteria(){return view().criteria||{};}
let profileComplete=false,animateNext=true,enterTimer;
function options(){return {...state.profiles[state.market],stack:'single',historyFullProgress:profileComplete,onlyExecutable:criteria().onlyExecutable===true,includeEvents:view().includeEvents===true,allowDelayedTrades:true};}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('设备存储不可用，这次设置仅保留到页面关闭。');}}
let data=null,rows={loot:[],flips:[],crafts:[]},visible={loot:[],flips:[],crafts:[]},limit={loot:40,flips:30,crafts:30},sequence=0,busy=false,lastInteraction=0;
let historyBook={},ledger=[],signalCache=new Map(),pendingSnapshot=null,pendingSignals=null,detailRow=null,chartDays=7,toastTimer,applyTimer;
let signalsLoading=false,signalsInfo={checked:0,total:0},detailSequence=0;
let catalogRows=[],catalogById=new Map(),catalogPage=1,detailTrail=[],routeIndex=new Map();
const catalogPageSize=60,screenScroll={loot:{loot:0,flips:0,crafts:0},flips:{loot:0,flips:0,crafts:0},crafts:{loot:0,flips:0,crafts:0},items:0};
const histories=new Map(),historyRequests=new Map();
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
async function api(path,market=state.market){
  try{
    const response=await fetch(`/api/${path}${path.includes('?')?'&':'?'}market=${market}`,{signal:AbortSignal.timeout(45000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'请求失败');return result;
  }catch(error){if(error.name==='TimeoutError'||error.name==='AbortError')throw new Error('行情连接超时，请点击刷新重试');throw error;}
}
function syncControls(){
  document.body.dataset.density=state.density;$('#density-label').textContent=state.density==='compact'?'紧凑':'标准';$('#density-button').setAttribute('aria-pressed',String(state.density==='compact'));$('#density-button').setAttribute('aria-label','网格密度：'+(state.density==='compact'?'紧凑，点击切换标准':'标准，点击切换紧凑'));
  const v=view();if(!CATEGORIES[v.category]&&v.category!=='all')v.category='all';
  if(!['all','short','favorites'].includes(v.filter))v.filter='all';
  $('#search').value=v.search||'';$('#include-events').checked=v.includeEvents===true;
  const cv=catalogView();$('#catalog-search').value=cv.search;$('#catalog-category').value=cv.category;$('#catalog-availability').value=cv.availability;$('#catalog-events').checked=v.includeEvents;
  $('#catalog-favorites').setAttribute('aria-pressed',String(cv.favoritesOnly));
  $$('button[data-page]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.page===state.page)));
  $('#monitor-toolbar').hidden=state.page==='items';$('#monitor-panel').hidden=state.page==='items';
  syncWorkspace();
  $('#catalog-toolbar').hidden=state.page!=='items';$('#catalog-panel').hidden=state.page!=='items';
  $$('[data-market]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.market===state.market)));
  document.documentElement.dataset.theme=state.theme;$('#theme').innerHTML=icon(state.theme==='light'?'moon':'sun');
}
function rebuild(){
  if(!data)return;
  state.profiles[state.market]=resolveTradingProfile(state.profiles[state.market],data);persist();
  profileComplete=hasFullProgress(state.profiles[state.market],data);$('#profile-summary').textContent=profileComplete?'满进度':'自定义条件';
  signalCache.clear();rows={loot:collectLoot(data,options()),flips:collectFlips(data,{...options(),includeLosses:true,includeUnavailable:true}),crafts:collectCrafts(data,{...options(),includeLosses:true})};
  catalogRows=collectCatalog(data,options());catalogById=new Map(catalogRows.map(r=>[r.id,r]));routeIndex=new Map();
  for(const r of [...rows.flips,...rows.crafts])for(const id of new Set([r.item.id,...(r.recipe||[]).map(m=>m.item.id)])){
    if(!routeIndex.has(id))routeIndex.set(id,[]);routeIndex.get(id).push(r);
  }
}
function switchPage(page){
  if(!PAGES.includes(page)||state.page===page)return;
  if(state.page!=='items')for(const k of Object.keys(MODULES))screenScroll[state.page][k]=$('#'+k).scrollTop;
  else screenScroll.items=$('#catalog-scroll').scrollTop;
  state.page=page;animateNext=true;syncControls();rebuild();render(true);
  if(page!=='items')for(const k of Object.keys(MODULES))$('#'+k).scrollTop=screenScroll[page][k];
  else $('#catalog-scroll').scrollTop=screenScroll.items;
  history.replaceState(null,'',`?market=${state.market}&view=${page}`);persist();
}
function syncWorkspace(){
  const page=state.page;
  document.body.dataset.page=page;
  const titles={loot:['01','捡什么 · 卖什么','单格净值 ↓'],flips:['02','商人倒货','单次净利 ↓'],crafts:['03','藏身处制作','每批净利 ↓'],items:['04','物品一览','单格净值 ↓']};
  $('#page-number').textContent=titles[page][0];$('#page-title').textContent=titles[page][1];$('#sort-indicator').textContent=titles[page][2];
  $$('[data-page-count]').forEach(el=>el.hidden=el.dataset.pageCount!==page);
  $('#context-toolbar').hidden=page==='items';$('#catalog-context').hidden=page!=='items';
  $('#loot-scopes').hidden=page!=='loot';$('#station-filter-label').hidden=page!=='crafts';
  $$('[data-module]').forEach(el=>el.hidden=el.dataset.module!==page);
  $$('[data-loot-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lootScope===view().lootScope)));
}
function resetCurrentFilters(){
  const v=view();Object.assign(v,safeView({includeEvents:v.includeEvents}));
  syncControls();rebuild();render();persist();
}

function historyFor(item){if(item.valuationId)item=data.items[item.valuationId];return histories.get(`${state.market}:${item.id}`)||historyBook[item.id];}
function signal(row){
  const key=row.id;if(signalCache.has(key))return signalCache.get(key);
  const h=historyFor(row.item),s=h?.points?analyzeHistory(h.points,row.item,data,options()):{short:false,long:false,points:[]};
  const stable=row.kind==='loot'?{long:s.long,reason:s.longReason,days:s.longDays}:profitStability(ledger,row,data,options());
  const result={...s,long:stable.long,longReason:stable.reason,longDays:stable.days};signalCache.set(key,result);return result;
}
const aliases={ledx:'ledx',gpu:'显卡',bitcoin:'比特币',sugar:'白糖',water:'水',filter:'滤芯',led:'ledx',xianka:'显卡',baitang:'白糖',lvxin:'滤芯',shuixing:'水',yaoshi:'钥匙',yiliaobao:'医疗包',zhentou:'注射器'};
function catalogRow(r){
  const i=r.item,s=signal(r),fav=state.favorites[state.market].includes(i.id);
  const fleaBest=r.fleaNet!==null&&r.channel==='跳蚤',traderBest=r.traderNet!==null&&r.channel!=='跳蚤';
  const variant=i.isPreset?(i.category==='weapon'?(i.default?'默认整枪':'改装预设'):'装备预设'):i.defaultPreset&&i.category==='weapon'?'机匣':i.currencyOnly?'货币':'';
  const quoted=!r.banned&&Number.isFinite(i.price)&&i.price>0;
  const cells=[`<td><button class="catalog-item" data-open="${i.id}"><span class="item-picture">${image(i.image)}</span><span class="catalog-identity"><strong>${esc(i.name)}</strong><span>${esc(CATEGORIES[i.category])}${variant?' · '+variant:''}</span><span class="catalog-tags">${tags(r,s)}</span></span></button></td>`,
    `<td data-label="占格"><b>${r.slots===null?'—':i.width+' × '+i.height}</b><small>${r.count>1?'×'+fmt(r.count)+' 满叠':i.stack>1?'可叠 '+fmt(i.stack):'单件'}</small></td>`,
    `<td data-label="跳蚤单价" class="${r.status==='可参考'?'':'quote-muted'}"><b>${quoted?fmt(i.price):'—'}</b><small>24h均价 ${fmt(i.average)}</small><small title="${i.scan?clock(i.scan):'报价时间未知'}">${r.status==='可参考'?ago(i.scan):esc(r.status)}</small></td>`,
    `<td data-label="跳蚤净到手" class="${fleaBest?'best-channel':''}"><b>${fmt(r.fleaNet)}${fleaBest?icon('check'):''}</b><small>${r.fee===null?'—':'手续费 '+fmt(r.fee)}</small></td>`,
    `<td data-label="商人回收" class="${traderBest?'best-channel':''}"><b>${fmt(r.traderNet)}${traderBest?icon('check'):''}</b><small>${esc(data.traders[r.vendor?.trader]?.name|| (r.vendor?'商人':'不收购'))}</small></td>`,
    `<td data-label="单格净值" class="catalog-slot"><b>${fmt(r.slotValue)}</b><small>${Number.isFinite(r.net)?esc(r.channel):'暂无有效售价'}</small></td>`,
    `<td class="catalog-star"><button class="favorite ${fav?'active':''}" data-favorite="${i.id}" aria-label="${fav?'取消收藏':'收藏'}${esc(i.name)}" aria-pressed="${fav}">${icon('star')}</button></td>`];
  return `<tr data-catalog-id="${i.id}" data-open="${i.id}" class="${s.short?'short':s.long?'long':''}">${cells.join('')}</tr>`;
}
function renderCatalog(preserve=false){
  if(!data||state.page!=='items')return;
  const scroller=$('#catalog-scroll'),scroll=preserve?scroller.scrollTop:0;
  const oldFirst=preserve?[...$('#catalog-body').children].find(el=>el.getBoundingClientRect().bottom>scroller.getBoundingClientRect().top+50):null;
  const oldId=oldFirst?.dataset.catalogId,offset=oldFirst?oldFirst.getBoundingClientRect().top-scroller.getBoundingClientRect().top:0;
  const f=catalogView(),filtered=filterCatalog(catalogRows,{...f,includeEvents:view().includeEvents},state.favorites[state.market],aliases);
  const pages=Math.max(1,Math.ceil(filtered.length/catalogPageSize));catalogPage=Math.min(catalogPage,pages);
  const start=(catalogPage-1)*catalogPageSize,counts={};
  for(const r of catalogRows)if(view().includeEvents||!r.item.eventOnly)counts[r.item.category]=(counts[r.item.category]||0)+1;
  $('#catalog-category').innerHTML='<option value="all">全部分类</option>'+Object.entries(CATEGORIES).map(([k,n])=>`<option value="${k}">${n} · ${counts[k]||0}</option>`).join('');$('#catalog-category').value=f.category;
  $('#items-count').textContent=fmt(filtered.length);$('#items-total').textContent=`/ ${fmt(catalogRows.length)} 个物品档案`;
  $('#catalog-body').innerHTML=filtered.slice(start,start+catalogPageSize).map(catalogRow).join('');
  $('#catalog-empty').hidden=filtered.length>0;
  $('#catalog-empty').innerHTML=filtered.length?'':`${icon('search')}<strong>没有符合条件的物品</strong><p>${f.favoritesOnly?'试试取消“只看收藏”，或调整其他筛选。':'试试更短的名称、英文简称，或调整分类与活动开关。'}</p><button data-catalog-reset>重置筛选</button>`;
  $('#catalog-range').textContent=filtered.length?`${fmt(start+1)}–${fmt(Math.min(start+catalogPageSize,filtered.length))} / ${fmt(filtered.length)} 项 · 卢布 ₽`:'0 项';
  $('#catalog-page').textContent=`${catalogPage} / ${pages}`;$('#catalog-prev').disabled=catalogPage<=1;$('#catalog-next').disabled=catalogPage>=pages;
  $('#catalog-favorites').setAttribute('aria-pressed',String(f.favoritesOnly));
  $('#catalog-summary').textContent=(CATEGORIES[f.category]||'全部分类')+' · 单格净值倒序';
  scroller.scrollTop=scroll;
  const target=oldId?$('#catalog-body').querySelector(`[data-catalog-id="${oldId}"]`):null;
  if(target)scroller.scrollTop+=target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-offset;
}
function matches(row){
  const v=view(),c=criteria(),i=row.item;
  if(row.kind==='loot'&&v.lootScope==='scavenging'&&!isScavengingItem(i))return false;
  if(row.kind==='craft'&&v.station!=='all'&&row.station?.id!==v.station)return false;
  if(v.category!=='all'&&v.category!==i.category)return false;
  if(v.filter==='favorites'&&!state.favorites[state.market].includes(i.id))return false;
  if(v.filter==='short'&&!signal(row).short)return false;
  if(row.kind==='loot'&&((c.minSlot||0)>row.slotValue||(c.freshOnly&&row.status!=='可参考')))return false;
  if(row.kind!=='loot'&&((c.minProfit>0&&(!Number.isFinite(row.profit)||c.minProfit>row.profit))||(c.budget>0&&(!Number.isFinite(row.purchase)||row.purchase>c.budget))))return false;
  if(row.kind==='craft'&&c.maxHours>0&&row.hours>c.maxHours)return false;
  const term=(v.search||'').trim().toLowerCase();if(!term)return true;
  const text=[i.name,i.shortName,i.english,i.slug,row.trader?.name,row.trader?.slug,row.station?.name,...(row.recipe||[]).map(m=>`${m.item.name} ${m.item.english}`)].join(' ').toLowerCase();
  const words=new Set(text.split(/[^a-z0-9]+/));
  return term.split(/\s+/).every(t=>aliases[t]?text.includes(aliases[t])||words.has(t):text.includes(t));
}
function tags(r,s){return (r.item.eventOnly||r.eventOnly?'<span class="tag event-tag">活动限定</span>':'')+(s.short?`<span class="tag short-tag">${icon('trend')}7日 ${percent(s.change7)}</span>`:'')+(s.long?`<span class="tag long-tag">${r.kind==='loot'?'长期高值':'长期稳定'}</span>`:'');}
function metric(label,value){return `<div><label>${label}</label><b>${value}</b></div>`;}
function card(r,index){
  const i=r.item,s=signal(r),loot=r.kind==='loot',craft=r.kind==='craft',fav=state.favorites[state.market].includes(i.id);
  const label=loot?(r.fleaNet===null?'商人净值 / 格':'净到手 / 格'):craft?'净利 / 批':'净利 / 次';
  const value=loot?fmt(r.slotValue):Number.isFinite(r.profit)?sign(r.profit):'待估值';
  const actor=craft?r.station:r.trader;
  const route=loot?'':`<div class="route">${image(actor?.image)}<span>${esc(actor?.name||'未知')} ${craft?'Lv.':'LL'}${r.level} · ${craft?'制作':r.isBarter?'兑换':'直购'}${r.execution?.missing.some(x=>/Lv\.|LL|任务|等级|版本/.test(x))?' <b class="condition-tag">未解锁</b>':''}</span><span>${craft?duration(r.seconds)+' · ×'+r.count:'限购 '+(r.limit??'未知')}</span></div>`;
  const ingredients=r.recipe?`<div class="ingredients">${r.recipe.slice(0,6).map(m=>`<span class="ingredient" title="${esc(m.item.name)} · ${m.tool?'可复用工具':esc(m.source)}">${image(m.item.image)}<span>${esc(m.item.shortName)} <i>×${m.count}</i>${m.tool?' ⌁':''}</span></span>`).join('')}${r.recipe.length>6?`<span class="ingredient">+${r.recipe.length-6} 项</span>`:''}</div>`:'';
  const metrics=metric('最低价',fmt(i.price))+metric('24h均价',fmt(i.average))+
    (loot?metric(`${esc(r.channel)}净到手`,fmt(r.net)):metric(craft?'材料成本':'进货成本',fmt(r.purchase)));
  const extra=loot?`<span>${i.width} × ${i.height} 格${r.count>1?' · ×'+r.count:''}</span><span>${r.fleaNet!==null&&r.traderNet!==null?'较商人 '+sign(r.fleaNet-r.traderNet):esc(r.channel)}</span>`:
    craft?`<span>产出净值 ${fmt(r.net)}</span><span>时薪 ${sign(r.hourly)}</span>`:
    `<span>${r.roi===null?'':`回报率 ${fmt(r.roi*100)}%`}</span><span>预计净回款 ${r.count>1?'×'+r.count+' ':''} ${fmt(r.fleaNet)}</span>`;

  const quoteAt=r.quoteAt||i.scan;
  const quote=r.status==='可参考'?ago(quoteAt):r.status+(quoteAt?' · '+ago(quoteAt):'');
  return `<article style="--order:${Math.min(index,7)}" class="card ${s.short?'short':s.long?'long':''}" data-row="${esc(r.id)}">
  <div class="card-main" role="button" tabindex="0" data-open="${esc(r.id)}" aria-label="查看${esc(i.name)}明细">
    <div class="item-top"><div class="item-picture">${image(i.image,i.name)}${loot?`<span class="rank">${index+1}</span>`:''}</div><div class="item-info"><div class="item-name" title="${esc(i.name)}">${esc(i.shortName||i.name)}</div><div class="item-category">${i.isPreset?`<span class="tag">${i.category==='weapon'?'武器预设':'装备预设'}</span>`:''}${tags(r,s)||esc(CATEGORIES[i.category])}</div></div><div class="money"><strong class="${loot?'':r.profit<0?'negative':'positive'}">${value}</strong><span class="unit">${label}</span></div></div>
    ${route}${ingredients}<div class="metrics">${metrics}</div><div class="card-extra">${extra}</div></div>
    <div class="card-tail"><i class="quote-dot ${r.status==='可参考'?'':'old'}"></i><span class="${r.status==='可参考'?'':'age-old'}" title="所用报价中最旧的时间 ${quoteAt?clock(quoteAt):'未知'}">${esc(quote)}</span><span class="tail-spacer"></span><button class="favorite ${fav?'active':''}" data-favorite="${i.id}" aria-label="${fav?'取消收藏':'收藏'}${esc(i.name)}" aria-pressed="${fav}">${icon('star')}</button><button data-open="${esc(r.id)}" aria-label="打开${esc(i.name)}明细">${icon('chevron')}</button></div></article>`;
}
function anchors(){return Object.fromEntries(['loot','flips','crafts'].map(k=>{const el=$('#'+k),top=el.getBoundingClientRect().top;const first=[...el.querySelectorAll('.card')].find(c=>c.getBoundingClientRect().bottom>top);return [k,{top:el.scrollTop,id:first?.dataset.row,offset:first?first.getBoundingClientRect().top-top:0}];}));}
function render(preserve=false){
  if(!data)return;const savedAnchors=preserve&&state.page!=='items'?anchors():null,counts={};for(const r of (rows[state.page]||rows.loot))counts[r.item.category]=(counts[r.item.category]||0)+1;
  $('#category').innerHTML=`<option value="all">全部分类 · ${(rows[state.page]||rows.loot).length}</option>`+Object.entries(CATEGORIES).map(([k,n])=>`<option value="${k}">${n} · ${counts[k]||0}</option>`).join('');$('#category').value=view().category;
  const stations=[...new Map(rows.crafts.filter(r=>r.station).map(r=>[r.station.id,r.station])).values()];
  $('#station-filter').innerHTML='<option value="all">全部设施</option>'+stations.map(st=>`<option value="${esc(st.id)}">${esc(st.name)}</option>`).join('');
  if(!stations.some(st=>st.id===view().station))view().station='all';$('#station-filter').value=view().station;
  $$('[data-loot-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lootScope===view().lootScope)));

  for(const key of ['loot','flips','crafts']){
    visible[key]=rows[key].filter(matches);$('#'+key+'-count').textContent=fmt(visible[key].length);
    if(state.page!==key)continue;
    let message='尝试放宽分类、预算或解锁条件。',title='暂无符合条件的机会';
    if(view().filter==='favorites'){title='这里还没有收藏';message='点物品右下角的星标，下次就能快速找到。';}
    if(view().filter==='short'){title=signalsLoading?'正在核对短线历史':'尚未确认7日急涨';message='相对约7日前涨价20%以上，并由近期两个报价快照确认。';}
    $('#'+key).innerHTML=visible[key].slice(0,limit[key]).map(card).join('')||`<div class="empty">${icon(view().filter==='favorites'?'star':'search')}<strong>${title}</strong><p>${message}</p>${key==='loot'&&view().lootScope==='scavenging'?'<button data-loot-scope="all">在全部物品中查找</button>':''}<button data-reset>重置筛选</button></div>`;
    if(visible[key].length>limit[key])$('#'+key).insertAdjacentHTML('beforeend',`<button class="load-more" data-more="${key}">继续查看 ${Math.min(40,visible[key].length-limit[key])} 项 ${icon('arrow-down')}</button>`);
    if(savedAnchors){const a=savedAnchors[key],el=$('#'+key),target=[...el.querySelectorAll('.card')].find(c=>c.dataset.row===a.id);el.scrollTop=a.top;if(target)el.scrollTop+=target.getBoundingClientRect().top-el.getBoundingClientRect().top-a.offset;}
    else $('#'+key).scrollTop=0;
  }
  $$('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===view().filter)));
  $('#favorite-count').textContent=state.favorites[state.market].length||'';renderFilterSummary();
  $('#coverage').textContent=`${MARKETS[state.market]} · ${fmt(data.rawCount)} 物品 · 每5分钟刷新`;

  renderCatalog(preserve);
  if(animateNext){const el=state.page==='items'?$('#catalog-panel'):$('#'+state.page);el.classList.add('is-entering');clearTimeout(enterTimer);enterTimer=setTimeout(()=>$$('.is-entering').forEach(e=>e.classList.remove('is-entering')),650);animateNext=false;}
}
function renderFilterSummary(){
  const v=state.page==='items'?catalogView():view(),chips=[];
  if(v.category!=='all')chips.push(['category',CATEGORIES[v.category]]);
  if(view().includeEvents)chips.push(['events','含活动品']);
  if(state.page==='items'){if(v.availability!=='all')chips.push(['availability',{flea:'跳蚤可估值',banned:'跳蚤禁售',unpriced:'暂无售价'}[v.availability]]);}
  else for(const [key,label] of [['minSlot','单格 ≥'],['minProfit','净利 ≥'],['budget','预算 ≤'],['maxHours','工时 ≤'],['onlyExecutable','条件已满足'],['freshOnly','1小时内报价']]){
    const n=criteria()[key];if(n)chips.push([key,typeof n==='boolean'?label:label+' '+fmt(n)+(key==='maxHours'?'h':'')]);
  }
  $('#filter-active').hidden=!chips.length;$('#filter-active').textContent=chips.length;
  $('#active-filters').hidden=!chips.length;$('#active-filters').innerHTML=chips.map(([key,label])=>`<button data-clear-filter="${key}" aria-label="移除${esc(label)}筛选">${esc(label)}${icon('x')}</button>`).join('');
}

function reading(){return state.paused||$('dialog[open]')||Date.now()-lastInteraction<1500;}
function updateStatus(){if(data)$('#status').textContent='获取 '+new Date(data.fetchedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}
function warning(message){$('#warning').hidden=!message;$('#warning').textContent=message||'';$('#connection-dot').classList.toggle('offline',Boolean(message));}
function queueApply(){
  $('#pending').hidden=!pendingSnapshot&&!pendingSignals;
  clearTimeout(applyTimer);if(!state.paused)applyTimer=setTimeout(()=>{if(!reading())applyPending();else queueApply();},1800);
}
function applyPending(){
  if(pendingSnapshot){data=pendingSnapshot;pendingSnapshot=null;rebuild();updateStatus();}
  if(pendingSignals){historyBook=pendingSignals.entries||{};signalsInfo=pendingSignals;pendingSignals=null;signalCache.clear();}
  render(true);$('#pending').hidden=true;
}
async function refresh(force=false){
  const seq=++sequence,market=state.market;busy=true;$('#refresh').disabled=true;$('#refresh').classList.add('spin');
  if(!data)$('#status').textContent='获取行情中';
  try{
    const result=await api('snapshot',market);if(seq!==sequence)return;
    warning(result.warning||result.collectionWarning);
    if(data&&reading()&&!force){pendingSnapshot=result;queueApply();}else{data=result;rebuild();render(true);updateStatus();}
    loadSignals(market,seq);api('ledger',market).then(r=>{if(state.market===market){ledger=r.records||[];signalCache.clear();if(!reading())render(true);}}).catch(()=>{});
    const requested=params.get('item');if(requested&&data&&!detailRow){if(catalogById.has(requested))openDetail(requested);else toast('当前市场未找到这个物品。');params.delete('item');}
  }catch(error){if(seq!==sequence)return;warning(`行情暂未更新：${error.message}${data?'。保留上次成功快照。':''}`);$('#status').textContent='等待恢复';if(!data){for(const k of ['loot','flips','crafts'])$('#'+k).innerHTML=`<div class="empty">${icon('info')}<strong>行情暂不可用</strong><p>${esc(error.message)}</p><button data-retry>重试</button></div>`;$('#catalog-body').innerHTML='';$('#catalog-empty').hidden=false;$('#catalog-empty').innerHTML=`${icon('info')}<strong>物品档案暂不可用</strong><button data-retry>重新获取</button>`;$('#catalog-range').textContent='等待行情恢复';}}
  finally{if(seq===sequence){busy=false;$('#refresh').disabled=false;$('#refresh').classList.remove('spin');}}
}
async function loadSignals(market,seq){
  signalsLoading=true;
  try{const book=await api('signals',market);if(state.market!==market||seq!==sequence)return;signalsLoading=false;
    if(reading()){pendingSignals=book;queueApply();}else{historyBook=book.entries||{};signalsInfo=book;signalCache.clear();render(true);}
  }catch{if(state.market===market&&seq===sequence)signalsLoading=false;}
}
function loading(){for(const k of ['loot','flips','crafts']){$('#'+k).innerHTML=Array.from({length:3},()=>'<div class="skeleton" aria-label="加载中"><div></div><div></div><div></div><div></div></div>').join('');$('#'+k+'-count').textContent='—';}
  const categories='<option value="all">全部分类</option>'+Object.entries(CATEGORIES).map(([k,n])=>`<option value="${k}">${n}</option>`).join('');
  $('#category').innerHTML=categories;$('#category').value=view().category;$('#catalog-category').innerHTML=categories;$('#catalog-category').value=catalogView().category;
  $('#coverage').textContent=`${MARKETS[state.market]} · 正在读取该市场行情`;
  $('#catalog-body').innerHTML='';$('#catalog-empty').hidden=false;$('#catalog-empty').innerHTML=`${icon('box')}<strong>正在读取物品档案…</strong>`;
  $('#items-count').textContent='—';$('#items-total').textContent='';$('#catalog-range').textContent='读取物品档案中';$('#catalog-page').textContent='—';$('#catalog-prev').disabled=true;$('#catalog-next').disabled=true;
}
async function getHistory(item,market=state.market){
  if(item.valuationId)item=data.items[item.valuationId];
  const key=`${market}:${item.id}`,old=histories.get(key);if(old&&Date.now()-old.at<300000)return old;if(historyRequests.has(key))return historyRequests.get(key);
  const task=api(`history?id=${item.id}`,market).then(result=>{histories.set(key,result);signalCache.clear();return result;}).finally(()=>historyRequests.delete(key));historyRequests.set(key,task);return task;
}
function dl(entries){return '<dl>'+entries.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')+'</dl>';}
let chartSeries=[],chartActive=-1;
function chartMarkup(points){
  const filtered=(points||[]).filter(p=>p.timestamp>=Date.now()-chartDays*86400000).sort((a,b)=>a.timestamp-b.timestamp);
  chartSeries=[];chartActive=-1;
  if(filtered.length<2)return '<p>暂无价格走势</p>';
  const lo=Math.min(...filtered.map(p=>p.priceMin)),hi=Math.max(...filtered.map(p=>p.priceMin)),first=filtered[0].timestamp,last=filtered.at(-1).timestamp;
  chartSeries=filtered.map(p=>({...p,x:6+(p.timestamp-first)/(last-first||1)*376,y:112-(p.priceMin-lo)/(hi-lo||1)*96}));
  const path=chartSeries.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  return `<div class="chart-wrap"><svg class="history-chart" viewBox="0 0 390 128" tabindex="0" role="img" aria-label="${chartDays}日价格走势，移动鼠标或按左右方向键查看报价"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".17"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="M6 16H382M6 64H382M6 112H382" stroke="var(--line)" fill="none" stroke-dasharray="3 4"/><path d="${path}L382 118L6 118Z" fill="url(#chart-fill)" color="var(--accent)"/><path d="${path}" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linejoin="round"/><g id="chart-cursor" hidden><line y1="8" y2="118" stroke="var(--accent)" stroke-dasharray="3 3"/><circle r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></g></svg><div class="chart-tooltip" id="chart-tooltip" hidden><time></time><strong></strong></div></div><div class="chart-caption"><span>${clock(first)}</span><span>低 ₽${fmt(lo)} / 高 ₽${fmt(hi)}</span><span>${clock(last)}</span></div>`;
}
function showChartPoint(index){
  if(!chartSeries.length||!$('#chart-cursor'))return;
  chartActive=Math.max(0,Math.min(chartSeries.length-1,index));const p=chartSeries[chartActive];
  const cursor=$('#chart-cursor'),tip=$('#chart-tooltip');cursor.hidden=false;cursor.removeAttribute('hidden');
  cursor.querySelector('line').setAttribute('x1',p.x);cursor.querySelector('line').setAttribute('x2',p.x);
  cursor.querySelector('circle').setAttribute('cx',p.x);cursor.querySelector('circle').setAttribute('cy',p.y);
  tip.hidden=false;tip.querySelector('time').textContent=clock(p.timestamp);tip.querySelector('strong').textContent='₽ '+fmt(p.priceMin);
  tip.style.left=Math.max(18,Math.min(82,p.x/390*100))+'%';
}
function inspectChartPointer(event){
  const chart=event.target.closest('.history-chart');if(!chart||!chartSeries.length)return;
  const matrix=chart.getScreenCTM();if(!matrix)return;
  const x=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()).x;
  let index=0;for(let n=1;n<chartSeries.length;n++)if(Math.abs(chartSeries[n].x-x)<Math.abs(chartSeries[index].x-x))index=n;
  showChartPoint(index);
}

function historyDetail(){
  if(!detailRow||!data)return;const r=detailRow,s=signal(r),h=historyFor(r.item);
  if(r.item.currencyOnly){$('#history-content').innerHTML='<p>货币条目不提供跳蚤价格走势。</p>';updateScenario();return;}
  $('#history-content').innerHTML=h?.points?`${chartMarkup(h.points)}<div class="history-summary"><span>7日常态 <strong>₽${fmt(s.baseline)}</strong></span><span>7日涨幅 <strong>${percent(s.change7)}</strong></span><span>24h <strong>${percent(s.change24)}</strong></span></div>`:'<p>正在读取真实历史报价…</p>';
  updateScenario();
}
function updateScenario(){
  if(!detailRow||!$('#target-price'))return;
  const count=detailRow.kind==='loot'?Math.max(1,Math.min(100000,Math.floor(Number($('#sale-quantity')?.value)||1))):detailRow.count;
  const r={...detailRow,count,traderNet:detailRow.traderNet===null?null:detailRow.traderNet/detailRow.count*count};
  const target=Number($('#target-price').value),base=signal(detailRow).baseline;
  const values=[['按目标挂价',scenario(r,data,options(),target)],['按24h均价',scenario(r,data,options(),r.item.average)],['回到7日常态',base?scenario(r,data,options(),base):null]];
  $('#scenario-results').innerHTML=values.map(([name,x])=>`<div><small>${name}</small><b class="${x?.profit<0?'negative':''}">${x?(r.kind==='loot'?fmt(x.net):sign(x.profit)):'—'}</b><small>${r.kind==='loot'?count+'件净到手':'每批 / 次净利'}</small><small>${x?'跳蚤税费 '+fmt(x.fee):'—'}</small></div>`).join('');
}

function channelComparison(r){
  const vendor=data.traders[r.vendor?.trader],fleaBest=r.fleaNet!==null&&r.channel==='跳蚤';
  const difference=Number.isFinite(r.fleaNet)&&Number.isFinite(r.traderNet)?Math.abs(r.fleaNet-r.traderNet):null;
  return `<section class="detail-section"><h3>卖给谁<span class="subtle">${r.count>1?'所选 '+fmt(r.count)+' 件合计':'单件 / 单发'}</span></h3><div class="channel-comparison">
    <div class="${fleaBest?'chosen':''}"><span>跳蚤 · 扣税后${fleaBest?icon('check'):''}</span><strong>₽${fmt(r.fleaNet)}</strong><small>${r.fleaNet===null?esc(r.status):'上架费 ₽'+fmt(r.fee)}</small></div>
    <div class="${!fleaBest&&r.traderNet!==null?'chosen':''}"><span>${esc(vendor?.name||'商人回收')}${!fleaBest&&r.traderNet!==null?icon('check'):''}</span><strong>₽${fmt(r.traderNet)}</strong><small>${r.traderNet===null?'暂无回收报价':'即时回收，无上架费'}</small></div></div>
    ${difference!==null?`<p class="channel-difference">${difference>0?`${esc(r.channel)}多到手 <strong>₽${fmt(difference)}</strong>`:'两种渠道净到手相同'}${r.status==='报价延迟'?' · 含延迟报价':''}</p>`:''}</section>`;
}
function relatedRoutes(r){
  const routes=(routeIndex.get(r.item.id)||[]).filter(x=>x.id!==r.id),preset=data.items[r.item.defaultPreset],base=data.items[r.item.baseItem];
  const presetLink=preset?`<button class="preset-link" data-open="${preset.id}">${image(preset.image)}查看默认整枪估值 ${icon('chevron')}</button>`:base?`<button class="preset-link" data-open="${base.id}">查看基础武器 / 机匣 ${icon('chevron')}</button>`:'';
  if(!routes.length&&!presetLink)return '';
  const routeMarkup=x=>{
    const made=x.item.id===r.item.id,tool=x.recipe?.find(m=>m.item.id===r.item.id)?.tool;
    const actor=x.kind==='craft'?x.station:x.trader,label=made?(x.kind==='craft'?'制作产出':x.isBarter?'兑换取得':'商人直购'):(tool?'作为工具':'作为材料');
    const basis=x.kind==='craft'?'每批净利':'每次净利';
    return `<button class="related-route" data-open="${esc(x.id)}">${image(x.item.image)}<span><strong>${esc(x.item.shortName||x.item.name)}</strong><small>${label} · ${esc(actor?.name||'未知')}${x.level?' '+(x.kind==='craft'?'Lv.':'LL')+x.level:''}</small></span><span class="related-profit"><b>${sign(x.profit)}</b><small>${basis}</small></span>${icon('chevron')}</button>`;
  };
  return `<section class="detail-section"><h3>相关赚钱路线${routes.length?`<span class="count">${routes.length}</span>`:''}</h3>${presetLink}${routes.slice(0,5).map(routeMarkup).join('')}${routes.length>5?`<details class="more-routes"><summary>展开其余 ${routes.length-5} 条路线</summary>${routes.slice(5).map(routeMarkup).join('')}</details>`:''}</section>`;
}
function detailMarkup(r){
  const i=r.item,loot=r.kind==='loot',craft=r.kind==='craft',s=signal(r);
  const costRows=[['跳蚤报价时间',i.scan?clock(i.scan):'未知'],['当前报价数量',fmt(i.offers)],['24小时均价',fmt(i.average)],['出售渠道',esc(loot?r.channel:craft?r.channel:'跳蚤')],['上架手续费',fmt(r.fee)],['商人回收净值',fmt(r.traderNet)]];
  if(!loot)costRows.push(['材料 / 进货成本',fmt(r.purchase)]);
  for(const m of r.recipe||[])costRows.push([`<button class="material-link" data-open="${m.item.id}">${image(m.item.image)}${esc(m.item.name)} ×${m.count} ${icon('chevron')}</button>`,m.tool?`工具 · 首购${m.capital===null?'待核价':' ₽'+fmt(m.capital)}`:`${fmt(m.cost)}<br><small>${esc(m.source)}</small>`]);
  if(craft)costRows.push(['制作基础时长',duration(r.seconds)],['参考每小时收益',sign(r.hourly)]);
  const conditions=r.execution?.missing||[],task=data.tasks?.[r.task];
  return `<div class="detail-identity"><div class="item-picture">${image(i.image,i.name)}</div><div><h2 id="detail-title">${esc(i.name)}</h2><div class="item-category">${esc(CATEGORIES[i.category])} · ${esc(MARKETS[state.market])}</div><div class="item-category">${tags(r,s)}</div></div></div>
  <div class="detail-actions">${detailTrail.length?'<button id="detail-back">← 返回</button>':''}<button data-favorite="${i.id}">${icon('star')}${state.favorites[state.market].includes(i.id)?'已收藏':'收藏'}</button><button id="share-item">${icon('copy')}复制链接</button></div>
  <div class="detail-metrics"><div class="detail-metric"><small>${loot?'每格净到手':craft?'最终净利润 / 批':'预计净利润 / 次'}</small><strong class="${!loot&&r.profit<0?'negative':''}">₽${fmt(loot?r.slotValue:r.profit)}</strong></div><div class="detail-metric"><small>${loot?'整件 / 所选数量净到手':craft?'每批产出净到手':'预计净回款'}</small><strong>₽${fmt(r.net)}</strong></div></div>
  ${loot?channelComparison(r):`<div class="trade-summary"><span>${craft?'材料成本':'进货成本'} <b>₽${fmt(r.purchase)}</b></span><span>上架手续费 <b>₽${fmt(r.fee)}</b></span></div>`}
  <section class="detail-section"><h3>价格走势<div class="chart-controls"><button data-days="7" class="${chartDays===7?'active':''}">7日</button><button data-days="30" class="${chartDays===30?'active':''}">30日</button></div></h3><div id="history-content"></div></section>
  <section class="detail-section"><h3>卖价试算</h3>${i.types.includes('noFlea')||!data.flea.enabled?'<p>当前市场禁止该物品上跳蚤。</p>':`<div class="price-reference"><button data-price="${i.price||''}">最低价 ₽${fmt(i.price)}</button><button data-price="${i.average||''}">24h均价 ₽${fmt(i.average)}</button></div>${loot?`<label class="quantity-control">出售数量<input id="sale-quantity" type="number" min="1" max="100000" step="1" value="${r.count}"></label>`:''}<div class="scenario-controls"><span>目标单价 ₽</span><input id="target-price" type="number" min="1" step="100" value="${i.price>0?i.price:''}" placeholder="输入期望挂价" aria-label="目标挂牌单价"></div><div id="scenario-results" class="scenario-grid"></div>`}</section>
  ${relatedRoutes(r)}
  ${!loot?`<section class="detail-section"><h3>执行条件</h3><div class="condition-list">${conditions.length?conditions.map(t=>`<span class="tag">${esc(t)}</span>`).join(''):'<span class="tag long-tag">当前条件满足</span>'}</div>${r.task&&!options().maxProgress?`<label class="tool-line"><input type="checkbox" data-task-complete="${r.task}" ${options().completedTasks.includes(r.task)?'checked':''}>已完成 ${esc(task?.name||'解锁任务')}</label><a class="source-link" href="https://tarkov.dev/task/${r.task}" target="_blank" rel="noreferrer">查看任务 ↗</a>`:''}${(r.recipe||[]).filter(m=>m.tool).map(m=>`<label class="tool-line"><input type="checkbox" data-owned-tool="${m.item.id}" ${options().ownedTools.includes(m.item.id)?'checked':''}>我已持有 ${esc(m.item.name)}</label>`).join('')}</section>`:''}
  <section class="detail-section"><h3>收益拆解</h3>${dl(costRows)}<a class="source-link" href="https://tarkov.dev/item/${encodeURIComponent(i.slug)}?gameMode=${state.market}" target="_blank" rel="noreferrer">核对上游物品资料 ↗</a></section>`;
}
async function openDetail(id,remember=true){
  const r=catalogById.get(id)||Object.values(rows).flat().find(r=>r.id===id);if(!r)return;
  if(remember&&$('#detail-dialog').open&&detailRow&&detailRow.id!==id)detailTrail.push(detailRow.id);
  detailRow=r;const request=++detailSequence,market=state.market;
  $('#detail-content').innerHTML=detailMarkup(r);if(!$('#detail-dialog').open)$('#detail-dialog').showModal();historyDetail();
  if(r.item.currencyOnly)return;
  try{await getHistory(r.item,market);if(request===detailSequence&&market===state.market)historyDetail();}catch(error){if(request===detailSequence&&$('#history-content'))$('#history-content').innerHTML=`<p>${/404/.test(error.message)?'上游暂未提供该物品的价格历史。':'历史暂不可用：'+esc(error.message)}</p>`;}
}
function closePanel(dialog,value='cancel'){
  if(!dialog.open||dialog.classList.contains('is-closing'))return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){dialog.close(value);return;}
  dialog.classList.add('is-closing');setTimeout(()=>{dialog.close(value);dialog.classList.remove('is-closing');},170);
}
function settingsTab(key){
  $$('[data-settings-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.settingsTab===key)));
  $$('[data-settings-panel]').forEach(p=>p.hidden=p.dataset.settingsPanel!==key);$('.settings-scroll').scrollTop=0;
}
function taskSelectionSummary(){
  const all=$$('[data-task]'),count=all.filter(e=>e.checked).length;
  $('#tasks-all').checked=all.length>0&&count===all.length;$('#tasks-all').indeterminate=count>0&&count<all.length;$('#task-count').textContent=`${count} / ${all.length}`;
}
function renderProfileInputs(p){
  $('#management').value=p.management;
  $('#progress-description').textContent=hasFullProgress(p,data)?'满商人 · 全任务完成':'自定义商人与任务';
  const selectLevels=(current,max)=>Array.from({length:max+1},(_,n)=>`<option value="${n}" ${current===n?'selected':''}>${n?'LL '+n:'未解锁'}</option>`).join('');
  $('#station-settings').innerHTML=productionStations(data).map(st=>`<label class="station-setting"><span>${image(st.image)}<span>${esc(st.name)}</span></span><input type="checkbox" data-production="${st.id}" aria-label="${esc(st.name)}参与推荐" ${p.excludedStations.includes(st.id)?'':'checked'}></label>`).join('');
  $('#trader-settings').innerHTML=tradingTraders(data).map(t=>`<label><span>${image(t.image)}${esc(t.name)}</span><select data-trader="${t.id}" aria-label="${esc(t.name)}忠诚度">${selectLevels(p.traderLevels[t.id]||0,traderMaxLevel(t))}</select></label>`).join('');
  $('#task-settings').innerHTML=profileTaskIds(data).sort((a,b)=>(data.tasks?.[a]?.name||a).localeCompare(data.tasks?.[b]?.name||b,'zh-CN')).map(id=>`<label data-task-label><input type="checkbox" data-task="${id}" ${p.completedTasks.includes(id)?'checked':''}><span>${esc(data.tasks?.[id]?.name||id)}</span></label>`).join('');
  $('#task-search').value='';$('#tasks-empty').hidden=true;taskSelectionSummary();
}
function profileFromForm(){
  return resolveTradingProfile({...state.profiles[state.market],maxProgress:false,progressConfigured:true,management:$('#management').value,
    traderLevels:{...state.profiles[state.market].traderLevels,...Object.fromEntries($$('[data-trader]').map(e=>[e.dataset.trader,Number(e.value)]))},
    excludedStations:$$('[data-production]').filter(e=>!e.checked).map(e=>e.dataset.production),
    completedTasks:$$('[data-task]').filter(e=>e.checked).map(e=>e.dataset.task)},data);
}
function showSettings(){
  if(!data){toast('行情加载后即可配置角色条件。');return;}
  $('#profile-market').textContent=MARKETS[state.market];renderProfileInputs(state.profiles[state.market]);settingsTab('player');$('#settings').showModal();
}
function showInfo(title,html){$('#info-title').textContent=title;$('#info-content').innerHTML=html;$('#info-dialog').showModal();}
function toggleFavorite(id){const list=state.favorites[state.market],index=list.indexOf(id);if(index<0)list.push(id);else list.splice(index,1);persist();render(true);if(detailRow?.item.id===id){const button=$('#detail-content [data-favorite]');if(button)button.innerHTML=icon('star')+(index<0?'已收藏':'收藏');}toast(index<0?'已收藏；收藏页仍按价值排序。':'已取消收藏');}
function showFilters(){
  const c=criteria(),catalog=state.page==='items';
  $('#normal-filter-fields').hidden=catalog;$('#catalog-filter-fields').hidden=!catalog;
  for(const [id,key] of [['min-slot','minSlot'],['min-profit','minProfit'],['budget','budget'],['max-hours','maxHours']])$('#'+id).value=c[key]||'';
  $('#only-executable').checked=c.onlyExecutable||false;$('#fresh-only').checked=c.freshOnly||false;
  $('#category').value=view().category;$('#include-events').checked=view().includeEvents;
  $('#catalog-category').value=catalogView().category;$('#catalog-availability').value=catalogView().availability;$('#catalog-events').checked=view().includeEvents;
  $$('[data-filter-for]').forEach(el=>el.hidden=el.dataset.filterFor==='trades'?!['flips','crafts'].includes(state.page):el.dataset.filterFor!==state.page);
  $('#filters').showModal();
}
function exportSettings(){const blob=new Blob([JSON.stringify({version:3,...state,paused:false},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='loot-radar-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importSettings(file){
  try{if(!file||file.size>512000)throw new Error('请选择小于500KB的设置文件');const p=JSON.parse(await file.text());if(![2,3].includes(p.version)||!p.profiles)throw new Error('不是本应用的设置备份');
    for(const m of Object.keys(MARKETS)){state.profiles[m]=normalizeProfile(p.profiles[m]);state.favorites[m]=safeIds(p.favorites?.[m]);state.workspaceViews[m]=Object.fromEntries(['loot','flips','crafts'].map(k=>[k,safeView(p.workspaceViews?.[m]?.[k])]));state.views[m]=safeView(p.views?.[m]);state.catalogViews[m]=safeCatalogView(p.catalogViews?.[m]);}
    for(const m of Object.keys(MARKETS)){if(p.uiRevision!==UI_REVISION)state.workspaceViews[m].loot.lootScope='all';for(const v of Object.values(state.workspaceViews[m]))Object.assign(v,{includeEvents:state.views[m].includeEvents});}
    if(['light','dark'].includes(p.theme))state.theme=p.theme;if(['standard','compact'].includes(p.density))state.density=p.density;
    persist();syncControls();rebuild();render(true);$('#settings').close('cancel');toast('已导入角色条件、显示偏好与收藏。');
  }catch(error){toast('导入失败：'+error.message);}
}
document.addEventListener('click',event=>{
  const target=event.target.closest('button,[data-open]');
  if(!target)return;
  if(target.dataset.open)openDetail(target.dataset.open);
  if(target.dataset.page)switchPage(target.dataset.page);
  if(target.id==='detail-back'&&detailTrail.length)openDetail(detailTrail.pop(),false);
  if(target.dataset.favorite)toggleFavorite(target.dataset.favorite);

  if(target.dataset.close)closePanel($('#'+target.dataset.close));
  if(target.dataset.settingsTab)settingsTab(target.dataset.settingsTab);
  if(target.dataset.clearFilter){const key=target.dataset.clearFilter,v=state.page==='items'?catalogView():view();if(key==='events')allViews().forEach(x=>x.includeEvents=false);else if(['category','availability'].includes(key))v[key]='all';else view().criteria[key]=0;catalogPage=1;syncControls();rebuild();render();persist();}
  if(target.dataset.more){limit[target.dataset.more]+=40;render(true);}
  if(target.hasAttribute('data-reset')||target.id==='reset-visible-filters')resetCurrentFilters();
  if(target.hasAttribute('data-retry'))refresh(true);
  if(target.dataset.days){chartDays=Number(target.dataset.days);$$('[data-days]').forEach(b=>b.classList.toggle('active',Number(b.dataset.days)===chartDays));historyDetail();}
  if(target.dataset.lootScope){view().lootScope=target.dataset.lootScope;animateNext=true;render();persist();}
  if(target.hasAttribute('data-price')&&Number(target.dataset.price)>0){$('#target-price').value=target.dataset.price;updateScenario();}
  if(target.dataset.filter){view().filter=target.dataset.filter;animateNext=true;render();persist();}
  if(target.id==='catalog-reset'||target.hasAttribute('data-catalog-reset')){state.catalogViews[state.market]=safeCatalogView();catalogPage=1;syncControls();renderCatalog();renderFilterSummary();persist();}
  if(target.dataset.market&&target.dataset.market!==state.market){
    state.market=target.dataset.market;sequence++;detailSequence++;data=null;detailRow=null;detailTrail=[];historyBook={};ledger=[];signalCache.clear();pendingSnapshot=null;pendingSignals=null;
    catalogRows=[];catalogById=new Map();routeIndex=new Map();catalogPage=1;screenScroll.items=0;for(const p of ['loot','flips','crafts'])screenScroll[p]={loot:0,flips:0,crafts:0};
    signalsInfo={checked:0,total:0};limit={loot:40,flips:30,crafts:30};rows={loot:[],flips:[],crafts:[]};syncControls();loading();warning('');$('#pending').hidden=true;
    history.replaceState(null,'',`?market=${state.market}&view=${state.page}`);persist();refresh();
  }
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card-main')){e.preventDefault();openDetail(e.target.dataset.open);}if(e.key==='/'&&!$('dialog[open]')&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){e.preventDefault();$(state.page==='items'?'#catalog-search':'#search').focus();}});
for(const el of [$('.columns'),$('#catalog-scroll')])el.addEventListener('scroll',()=>{lastInteraction=Date.now();if(pendingSnapshot||pendingSignals)queueApply();},true);
$('#detail-dialog').addEventListener('close',()=>{detailRow=null;detailTrail=[];detailSequence++;signalCache.clear();render(true);if(pendingSnapshot||pendingSignals)queueApply();});
$('#search').addEventListener('input',e=>{view().search=e.target.value;render();persist();});
$('#catalog-search').addEventListener('input',e=>{catalogView().search=e.target.value;catalogPage=1;renderCatalog();persist();});
$('#catalog-favorites').addEventListener('click',()=>{catalogView().favoritesOnly=!catalogView().favoritesOnly;catalogPage=1;renderCatalog();persist();});
for(const [id,step] of [['catalog-prev',-1],['catalog-next',1]])$('#'+id).addEventListener('click',()=>{catalogPage=Math.max(1,catalogPage+step);renderCatalog();$('#catalog-scroll').focus({preventScroll:true});});
$('#refresh').addEventListener('click',()=>refresh(true));$('#apply-pending').addEventListener('click',applyPending);
$('#pause').addEventListener('click',()=>{state.paused=!state.paused;$('#pause').setAttribute('aria-pressed',String(state.paused));$('#pause').innerHTML=icon(state.paused?'play':'pause');$('#pause').setAttribute('aria-label',state.paused?'恢复自动应用行情':'暂停自动应用行情');toast(state.paused?'已暂停自动切换，后台继续获取行情。':'已恢复自动应用行情。');if(!state.paused)applyPending();});
$('#theme').addEventListener('click',()=>{state.theme=state.theme==='light'?'dark':'light';syncControls();persist();});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口不支持全屏，可放大浏览器窗口。');}});
$('#settings-button').addEventListener('click',showSettings);$('#filter-button').addEventListener('click',showFilters);
$('#density-button').addEventListener('click',()=>{state.density=state.density==='standard'?'compact':'standard';syncControls();persist();});
$('#profile-form').addEventListener('submit',e=>{
  e.preventDefault();if(e.submitter?.value!=='save'){closePanel($('#settings'));return;}
  state.profiles[state.market]=profileFromForm();persist();rebuild();render(true);closePanel($('#settings'),'save');toast('已按你的条件重新计算');
});
$('#reset-progress').addEventListener('click',()=>renderProfileInputs(resolveTradingProfile(profileFromForm(),data,true)));
$('#stations-max').addEventListener('click',()=>$$('[data-production]').forEach(e=>e.checked=true));
$('#traders-max').addEventListener('click',()=>$$('[data-trader]').forEach(e=>e.value=traderMaxLevel(data.traders[e.dataset.trader])));
$('#tasks-all').addEventListener('change',e=>{$$('[data-task]').forEach(t=>t.checked=e.target.checked);taskSelectionSummary();});
$('#task-settings').addEventListener('change',taskSelectionSummary);
$('#task-search').addEventListener('input',e=>{const q=e.target.value.trim().toLocaleLowerCase();$$('[data-task-label]').forEach(l=>l.hidden=!l.textContent.toLocaleLowerCase().includes(q));$('#tasks-empty').hidden=$$('[data-task-label]').some(l=>!l.hidden);});
$('#settings').addEventListener('close',()=>{if(pendingSnapshot||pendingSignals)queueApply();});
$('#filter-form').addEventListener('submit',e=>{
  e.preventDefault();if(e.submitter?.value!=='save'){closePanel($('#filters'));return;}
  const catalog=state.page==='items',events=$(catalog?'#catalog-events':'#include-events').checked;
  allViews().forEach(v=>v.includeEvents=events);
  if(catalog){catalogView().category=$('#catalog-category').value;catalogView().availability=$('#catalog-availability').value;catalogPage=1;}
  else {view().category=$('#category').value;if(['weapon','melee','mods','armor','ammo','keys','medical','gear','containers'].includes(view().category))view().lootScope='all';
    view().criteria={minSlot:Number($('#min-slot').value)||0,minProfit:Number($('#min-profit').value)||0,budget:Number($('#budget').value)||0,maxHours:Number($('#max-hours').value)||0,onlyExecutable:$('#only-executable').checked,freshOnly:$('#fresh-only').checked};}
  animateNext=true;syncControls();rebuild();render();persist();closePanel($('#filters'),'save');
});
$('#clear-filters').addEventListener('click',()=>{allViews().forEach(v=>v.includeEvents=false);if(state.page==='items'){state.catalogViews[state.market]=safeCatalogView();catalogPage=1;syncControls();rebuild();render();persist();}else resetCurrentFilters();closePanel($('#filters'));});
$$('dialog').forEach(dialog=>{
  dialog.addEventListener('cancel',e=>{e.preventDefault();closePanel(dialog);});
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel(dialog);});
});
$('#detail-content').addEventListener('input',e=>{if(['target-price','sale-quantity'].includes(e.target.id))updateScenario();});
$('#detail-content').addEventListener('change',e=>{
  const key=e.target.dataset.taskComplete?'completedTasks':e.target.dataset.ownedTool?'ownedTools':null;if(!key)return;
  const id=e.target.dataset.taskComplete||e.target.dataset.ownedTool,list=state.profiles[state.market][key];
  if(e.target.checked&&!list.includes(id))list.push(id);else if(!e.target.checked)state.profiles[state.market][key]=list.filter(x=>x!==id);
  persist();const previous=detailRow?.id;rebuild();if(previous)openDetail(previous);
});
$('#detail-content').addEventListener('click',async e=>{if(e.target.closest('#share-item')&&detailRow){try{await navigator.clipboard.writeText(`${location.origin}/?market=${state.market}&view=items&item=${detailRow.item.id}`);toast('物品链接已复制');}catch{toast('复制不可用，可从地址栏分享网页。');}}});
$('#export-settings').addEventListener('click',exportSettings);$('#import-settings').addEventListener('click',()=>$('#import-file').click());$('#import-file').addEventListener('change',e=>importSettings(e.target.files[0]));

$('#qq-preview').addEventListener('click',async()=>{try{const feed=await api('feed');showInfo('QQ 资讯接口',`<p>这是预留给 QQ 机器人的只读摘要，尚未绑定机器人或群，也不会自动发送。</p><h3>接口地址</h3><code>${esc(location.origin+'/api/feed?market='+state.market)}</code><h3>当前摘要</h3><pre>${esc(feed.text)}</pre><p>包含市场、税后收益、报价时间和解锁条件，具体群消息权限接入时再配置。</p>`);}catch(error){toast(error.message);}});
window.addEventListener('online',()=>refresh());window.addEventListener('offline',()=>warning('网络已离线，保留上次成功行情。'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&data&&Date.now()-Date.parse(data.fetchedAt)>300000&&!busy)refresh();});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){e.target.style.opacity='.15';e.target.title='图片暂不可用';}},true);
$('#station-filter').addEventListener('change',e=>{view().station=e.target.value;render();persist();});
if(params.get('view')==='monitor'){params.set('view','loot');history.replaceState(null,'',`?${params}`);}
for(const type of ['pointermove','pointerdown'])$('#detail-content').addEventListener(type,inspectChartPointer);
$('#detail-content').addEventListener('pointerout',e=>{if(e.pointerType==='mouse'&&e.target.closest('.history-chart')&&!e.relatedTarget?.closest?.('.history-chart')){$('#chart-tooltip')?.setAttribute('hidden','');$('#chart-cursor')?.setAttribute('hidden','');}});
$('#detail-content').addEventListener('focusin',e=>{if(e.target.matches('.history-chart'))showChartPoint(chartActive<0?chartSeries.length-1:chartActive);});
$('#detail-content').addEventListener('keydown',e=>{if(!e.target.matches('.history-chart')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();showChartPoint(e.key==='Home'?0:e.key==='End'?chartSeries.length-1:chartActive+(e.key==='ArrowRight'?1:-1));});
icons();syncControls();persist();loading();refresh();setInterval(()=>{if(!busy)refresh();},300000);
