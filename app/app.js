import { MARKETS,CATEGORIES,applyEventMetadata,applyCategoryMetadata,collectLoot,collectCatalog,collectFlips,collectCrafts,summarizeHistory,mergeRecentQuotes,analyzeHistorySummary,normalizeProfile,resolveTradingProfile,tradingTraders,productionStations,traderMaxLevel,stationMaxLevel,profileTaskIds,hasFullProgress,isEventItem,matchesRunScope,SCAVENGING_CATEGORIES,DEFAULT_SCAVENGING_CATEGORIES,SCAVENGING_SELECTION_VERSION,migrateScavengingCategories,profitStability,isPriceOpportunity,lowOfferCount } from '/engine.js';
import {mediaUrl,preserveImages,updateCardList,reconcileChildren} from '/media.mjs';
import {commentThreadMarkup,mountComments} from '/comments-ui.js';
import {createAccountUI} from '/accounts-ui.js';
import { createUpdateWindow } from '/update-window.js';
import { quicklookLayout,opportunityTone } from '/quicklook.js';
import { PAGES,moduleForPage,resolvePage,migrateWorkspaceViews,supportsSurgeFilter,QUICKLOOK_PRESETS,activeRunTypes,toggleRunPreset } from '/navigation.mjs';
import { lootPriority,compareLootPriority,runValuationOptions,PRIORITY_WEIGHTS,RUN_MIN_VALUE } from '/loot-priority.mjs';
import {createDashboardClient} from '/dashboard-client.mjs';
import {createRowCache} from '/row-cache.mjs';
import {MODEL_VERSION} from '/engine.js';
import {createInterfaceMotion} from './ui-motion.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const motion=createInterfaceMotion();
const KEY='loot-radar-v2',params=new URLSearchParams(location.search);
const UI_REVISION=7;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(v)?(Math.sign(v)*Math.round(Math.abs(v))).toLocaleString('zh-CN'):'—';
const sign=v=>Number.isFinite(v)?(v>=0?'+':'−')+fmt(Math.abs(v)):'—';
const percent=v=>Number.isFinite(v)?sign(v*100)+'%':'—';
const clock=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const ago=v=>{const n=(Date.now()-Date.parse(v))/60000;return !Number.isFinite(n)?'时间未知':n<60?Math.max(0,Math.floor(n))+'分钟前':n<1440?Math.floor(n/60)+'小时前':Math.floor(n/1440)+'天前';};
const duration=seconds=>seconds>=3600?`${Math.floor(seconds/3600)}时${Math.ceil(seconds%3600/60)||''}${seconds%3600?'分':''}`:Math.ceil(seconds/60)+'分';
const paths={
 list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 sliders:'<path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10M9 3v6m4 0V3m0 6v6m4-6v6M6 15v6m4-6v6"/>',
 filter:'<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',star:'<path d="m12 3 2.8 5.6L21 9.5l-4.5 4.4 1 6.1-5.5-2.9L6.5 20l1-6.1L3 9.5l6.2-.9Z"/>',
 backpack:'<path d="M8 6V4a4 4 0 0 1 8 0v2M6 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><path d="M7 12h10v6H7Z"/>',
 exchange:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',craft:'<path d="m14 5 5 5M3 21l7-7m2-10-2 2 8 8 3-3-3-3 1-3-4-2Z"/><path d="m5 3 4 4-2 3-4-4m7 6 10 10"/>',
 'arrow-down':'<path d="M12 4v16m-5-5 5 5 5-5"/>',chevron:'<path d="m9 5 7 7-7 7"/>',x:'<path d="m6 6 12 12M18 6 6 18"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',trend:'<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
 eyeoff:'<path d="m3 3 18 18M10 10a3 3 0 0 0 4 4M9 5c5-2 10 2 13 7-1 2-2 3-3 4M6 6c-2 2-4 4-4 6 4 7 11 9 16 5"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',check:'<path d="m5 12 4 4L20 5"/>',box:'<path d="m12 3 9 5v10l-9 5-9-5V8Z M3 8l9 5 9-5M12 13v10"/>'
};
const solidIcons={
 crown:'<path d="m2 6 5 4 5-7 5 7 5-4-3 12H5Zm3 14h14v2H5Z"/>',
 'preset-keys':'<path fill-rule="evenodd" d="M8 3a7 7 0 1 0 6.3 10H18v3h3v-3h2V8h-8.7A7 7 0 0 0 8 3Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/>',
 'preset-mods':'<path d="M1 9h7l2-2h10v1h7V6h2v2h3v3H22l-2 2 2 6-3 1-3-7h-2l-1 5h-3l1-6H8l-5 4H1v-4l2-1Z"/><path d="M11 5h6v1h-6Z"/>',
 'preset-ammo':'<path d="M7 1 4 5v4h6V5ZM4 10h6v9H4Zm-1 10h8v3H3ZM17 5l-3 4v4h6V9Zm-3 9h6v5h-6Zm-1 6h8v3h-8Z"/>',
 refresh:'<path d="M4.2 7.5a9 9 0 0 1 14.16-1.86L20 4v7h-7l3.45-3.45a6.3 6.3 0 0 0-9.91 1.3ZM19.8 16.5a9 9 0 0 1-14.16 1.86L4 20v-7h7l-3.45 3.45a6.3 6.3 0 0 0 9.91-1.3Z"/>',
 'nav-loot':'<path d="M11 5H3L1 7v4l2 2h5v3H1v3h8l2-2v-5l-2-2H4V8h7Zm12 0h-8l-2 2v10l2 2h8v-3h-7V8h7Z"/><path fill-rule="evenodd" d="M28 5h6l4 14h-3l-.9-3H28l-.9 3h-3Zm.9 8h4.3L31 7.5Z"/><path d="M39 5h3l3 10 3-10h3l-4 14h-4ZM1 2h12v1H1Zm37 19h13v1H38Z"/>',
 'nav-flips':'<path d="m16 1 7 6-7 6V9H3V5h13ZM8 11v4h13v4H8v4l-7-6Z"/>',
 'nav-crafts':Array.from({length:6},(_,n)=>`<path transform="rotate(${n*60} 12 12)" d="M6.06 1.86h7.86l3.9 6.78-1.38 2.4-4.02-6.72h-7.5Z"/>`).join(''),
 'nav-items':'<path d="M2 2h8v8H2Zm12 0h8v8h-8ZM2 14h8v8H2Zm12 0h8v8h-8Z"/>',
 'nav-profile':'<circle cx="12" cy="7" r="5"/><path d="M9 14h6l6 5v3H3v-3Z"/>'
};
const icon=(name,cls='')=>solidIcons[name]?`<svg class="solid-icon ${cls}" viewBox="0 0 ${name==='nav-loot'?52:name==='preset-mods'?32:24} 24" fill="currentColor" stroke="none" aria-hidden="true">${solidIcons[name]}</svg>`:`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.box}</svg>`;
const loyaltyBadge=(level,trader)=>Number.isFinite(level)?level===traderMaxLevel(trader||{})?`<span class="loyalty-badge" role="img" aria-label="最高忠诚度" title="最高忠诚度">${icon('crown','loyalty-crown')}</span>`:`LL${level}`:'';
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}
const image=(url,name='',className='',fallback='')=>mediaUrl(url)?`<img src="${esc(mediaUrl(url))}" data-image-key="${esc(mediaUrl(url))}" alt="${esc(name)}" class="${className}"${mediaUrl(fallback)&&fallback!==url?` data-fallback="${esc(mediaUrl(fallback))}"`:''} loading="lazy" decoding="async">`:'';
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('eft-radar-live-v1')||'{}');}catch{}
if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
const safeIds=value=>Array.isArray(value)?value.filter(x=>/^[0-9a-f]{24}$/.test(x)):[];
function safeView(v={}){
  if(!v||typeof v!=='object')v={};
  const c=v.criteria||{},n=x=>Number.isFinite(Number(x))?Math.max(0,Math.min(1e10,Number(x))):0;
  const quicklookTypes=migrateScavengingCategories(v.quicklookTypes,v.quicklookTypesRevision);
  return {category:Object.hasOwn(CATEGORIES,v.category)?v.category:'all',filter:['short','favorites'].includes(v.filter)?v.filter:'all',
    search:typeof v.search==='string'?v.search.slice(0,200):'',
    includeEvents:v.includeEvents===true,
    ignoreFleaLevel:v.ignoreFleaLevel!==false,
    quicklookView:v.quicklookView==='list'?'list':'cloud',station:typeof v.station==='string'?v.station:'all',
    quicklookPreset:Object.hasOwn(QUICKLOOK_PRESETS,v.quicklookPreset)?v.quicklookPreset:null,
    quicklookTypes,quicklookTypesRevision:SCAVENGING_SELECTION_VERSION,
    criteria:{minSlot:n(c.minSlot),minProfit:n(c.minProfit),budget:n(c.budget),maxHours:n(c.maxHours),onlyExecutable:c.onlyExecutable===true}};
}
const state={
 market:Object.hasOwn(MARKETS,params.get('market'))?params.get('market'):Object.hasOwn(MARKETS,saved.market)?saved.market:'pve',
 uiRevision:UI_REVISION,
 page:resolvePage(params.get('view'),saved,params.get('market')||saved.market||'pve'),
 profiles:Object.fromEntries(Object.keys(MARKETS).map(k=>[k,normalizeProfile(saved.profiles?.[k])])),
 views:Object.fromEntries(Object.keys(MARKETS).map(k=>[k,safeView(saved.views?.[k])])),favorites:{},
 workspaceViews:Object.fromEntries(Object.keys(MARKETS).map(m=>[m,Object.fromEntries(Object.entries(migrateWorkspaceViews(saved,m)).map(([k,v])=>[k,safeView(v)]))])),
 density:saved.density==='compact'?'compact':'standard',
 theme:'dark'
};
for(const market of Object.keys(MARKETS)){
  state.favorites[market]=safeIds(saved.favorites?.[market]);
  for(const v of Object.values(state.workspaceViews[market]))Object.assign(v,{includeEvents:state.views[market].includeEvents});
}
function view(){return state.workspaceViews[state.market][state.page];}
function allViews(){return [state.views[state.market],...Object.values(state.workspaceViews[state.market])];}
function criteria(){return view().criteria||{};}
let profileComplete=false,animateNext=true;
function options(){return {...state.profiles[state.market],stack:'single',historyFullProgress:profileComplete,onlyExecutable:criteria().onlyExecutable===true,includeEvents:view().includeEvents===true,allowDelayedTrades:true};}
let account=null;
const dashboardClient=createDashboardClient({modelVersion:MODEL_VERSION});
const cachedRows=createRowCache({loot:collectLoot,catalog:collectCatalog,flips:collectFlips,crafts:collectCrafts});
function saveGuest(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('设备存储不可用，这次设置仅保留到页面关闭。');}}
function persist(){if(account)account.persist();else saveGuest();}
function accountSettings(){
  const clean=v=>({...safeView(v),search:'',quicklookPreset:null});
  return {version:1,profiles:Object.fromEntries(Object.entries(state.profiles).map(([m,p])=>[m,normalizeProfile({...p,edition:'',stationFuel:{},completedTasks:[...new Set(p.completedTasks)]})])),favorites:Object.fromEntries(Object.entries(state.favorites).map(([m,ids])=>[m,[...new Set(ids)]])),views:Object.fromEntries(Object.entries(state.views).map(([m,v])=>[m,clean(v)])),
    workspaceViews:Object.fromEntries(Object.entries(state.workspaceViews).map(([m,pages])=>[m,Object.fromEntries(Object.entries(pages).map(([p,v])=>[p,clean(v)]))])),theme:state.theme,density:state.density};
}
function applyAccountSettings(p){
  for(const m of Object.keys(MARKETS)){
    state.profiles[m]=normalizeProfile(p.profiles?.[m]);state.favorites[m]=safeIds(p.favorites?.[m]);state.views[m]=safeView(p.views?.[m]);
    state.workspaceViews[m]=Object.fromEntries(Object.entries(migrateWorkspaceViews(p,m)).map(([k,v])=>[k,safeView(v)]));
    for(const v of Object.values(state.workspaceViews[m]))v.includeEvents=state.views[m].includeEvents;
  }
  state.theme='dark';state.density=p.density==='compact'?'compact':'standard';
  syncControls();rebuild();render(true);
  if(data&&$('#settings').open)renderProfileInputs(state.profiles[state.market]);
  if(detailRow){const row=detailRow;openDetail(row.id);}
}
function guestSettings(){try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch{return {};}}
let data=null,rows={loot:[],flips:[],crafts:[]},visible={loot:[],flips:[],crafts:[]},limit={loot:40,flips:30,crafts:30},sequence=0,busy=false,lastInteraction=0;
let historyBook={},ledger=[],signalCache=new Map(),itemSignalCache=new Map(),pendingSnapshot=null,pendingSignals=null,pendingLedger=null,detailRow=null,chartDays=7,toastTimer,applyTimer;
const updateWindow=createUpdateWindow(),updateDelay=15000;
let refreshAbort=null;
let signalsLoading=false,signalsInfo={checked:0,total:0},detailSequence=0;
let catalogRows=[],catalogById=new Map(),detailTrail=[],routeIndex=new Map();
const screenScroll=Object.fromEntries(PAGES.map(p=>[p,{list:0,cloud:0}]));
const histories=new Map(),historyRequests=new Map();
let quicklookPlan=null,quicklookKey='',quicklookPrices=new Map(),quicklookMarkup=new Map(),quicklookResizeFrame;
const inQuicklook=()=>state.page==='run';
const inCloud=()=>inQuicklook()&&view().quicklookView!=='list';
function lootOptions(){const current=options();return inQuicklook()?runValuationOptions(current,view().ignoreFleaLevel):current;}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
async function api(path,market=state.market,signal){
  try{
    const response=await fetch(`/api/${path}${path.includes('?')?'&':'?'}market=${market}`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'请求失败');return result;
  }catch(error){if(error.name==='TimeoutError'||error.name==='AbortError')throw new Error('行情连接超时，请点击刷新重试');throw error;}
}
function syncControls(){
  document.body.dataset.density=state.density;$('#density-label').textContent=state.density==='compact'?'紧凑':'标准';$('#density-button').setAttribute('aria-pressed',String(state.density==='compact'));$('#density-button').setAttribute('aria-label','网格密度：'+(state.density==='compact'?'紧凑，点击切换标准':'标准，点击切换紧凑'));
  const v=view();if(!CATEGORIES[v.category]&&v.category!=='all')v.category='all';
  if(!['all','short','favorites'].includes(v.filter))v.filter='all';
  $('#search').value=v.search||'';$('#include-events').checked=v.includeEvents===true;
  $$('button[data-page]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.page===state.page)));
  syncWorkspace();
  $$('[data-market]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.market===state.market)));
  document.documentElement.dataset.theme='dark';
  motion.nav();
}
function rebuild(){
  if(!data)return;
  const previousProfile=JSON.stringify(state.profiles[state.market]);
  state.profiles[state.market]=resolveTradingProfile(state.profiles[state.market],data);
  if(previousProfile!==JSON.stringify(state.profiles[state.market]))persist();
  profileComplete=hasFullProgress(state.profiles[state.market],data);
  signalCache.clear();itemSignalCache.clear();rows={loot:cachedRows(data,'loot',lootOptions()),flips:cachedRows(data,'flips',{...options(),includeLosses:true,includeUnavailable:true}),crafts:cachedRows(data,'crafts',{...options(),includeLosses:true})};
  catalogRows=cachedRows(data,'catalog',lootOptions());catalogById=new Map(catalogRows.map(r=>[r.id,r]));routeIndex=new Map();
  for(const r of [...rows.flips,...rows.crafts])for(const id of new Set([r.item.id,...(r.recipe||[]).map(m=>m.item.id)])){
    if(!routeIndex.has(id))routeIndex.set(id,[]);routeIndex.get(id).push(r);
  }
}
function switchPage(page){
  if(!PAGES.includes(page)||state.page===page)return;
  screenScroll[state.page]={list:$('#'+moduleForPage(state.page)).scrollTop,cloud:$('#loot .quicklook-board')?.scrollTop||0};
  const direction=PAGES.indexOf(page)>PAGES.indexOf(state.page)?1:-1;
  motion.changePage(()=>{
    state.page=page;animateNext=false;syncControls();rebuild();render();
    $('#'+moduleForPage(page)).scrollTop=screenScroll[page].list;
    if(inCloud()&&$('#loot .quicklook-board'))$('#loot .quicklook-board').scrollTop=screenScroll[page].cloud;
  },direction);
  history.replaceState(null,'',`?market=${state.market}&view=${page}`);persist();
}
function syncWorkspace(){
  const page=state.page,mod=moduleForPage(page);
  document.body.dataset.page=page;
  const titles={items:['01','物品一览',''],run:['02','跑刀速览','排序优先级 ↓'],flips:['03','商人倒货','单次净利 ↓'],crafts:['04','藏身处制作','']};
  $('#page-number').textContent=titles[page][0];$('#page-title').textContent=titles[page][1];$('#sort-indicator').textContent=titles[page][2];$('#sort-indicator').hidden=!titles[page][2];
  $$('[data-page-count]').forEach(el=>el.hidden=el.dataset.pageCount!==mod);
  $('#station-filter-label').hidden=page!=='crafts';
  $('#surge-filter').hidden=!supportsSurgeFilter(page);
  $$('[data-module]').forEach(el=>el.hidden=el.dataset.module!==mod);
  syncQuicklook();
}
function syncQuicklook(){
  const active=inQuicklook(),cloud=inCloud();
  document.body.dataset.quicklook=cloud?'cloud':active?'list':'off';
  $('#quicklook-controls').hidden=!active;$('#quicklook-presets').hidden=!active;
  $('#standard-context').hidden=active;$('#run-data-controls').hidden=!active;
  if(active){
    const v=view();
    $$('[data-quicklook-preset]').forEach(b=>b.setAttribute('aria-pressed',String(v.quicklookPreset===b.dataset.quicklookPreset)));
  }
  $('#search-clear').hidden=!view().search;
  $$('[data-quicklook-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.quicklookView===view().quicklookView)));
  $('#quicklook-repack').hidden=!cloud;
  $('#quicklook-favorites').title=view().filter==='favorites'?'取消仅看收藏':'仅看收藏';
  $('#quicklook-favorites').setAttribute('aria-label',$('#quicklook-favorites').title);
  $('#loot').classList.toggle('quicklook-view',cloud);
  $('#loot').setAttribute('aria-label',active?'跑刀速览物品':'物品一览');
}
function renderQuicklookTypeChoices(selected){
  $('#quicklook-type-options').innerHTML=Object.entries(SCAVENGING_CATEGORIES).map(([key,label])=>`<label class="type-choice"><input type="checkbox" data-quicklook-type="${key}" ${selected.includes(key)?'checked':''}><span>${esc(label)}</span></label>`).join('');
}
function resetCurrentFilters(){
  const v=view();Object.assign(v,safeView({includeEvents:v.includeEvents,quicklookView:v.quicklookView}));
  syncControls();rebuild();render();persist();
}

function historyFor(item){if(item.valuationId)item=data.items[item.valuationId];return histories.get(`${state.market}:${item.id}`)||historyBook[item.id];}
function signal(row){
  const key=row.id;if(signalCache.has(key))return signalCache.get(key);
  const h=historyFor(row.item),itemKey=row.item.id+(row.kind==='loot'&&inQuicklook()?':run':':player');
  const valuationOptions=row.kind==='loot'?lootOptions():options();
  let s=itemSignalCache.get(itemKey);
  if(!s){
    const stored=historyBook[row.item.valuationId||row.item.id];let summary=stored?.summary||h?.summary;
    if(h?.points){
      const loaded={...summarizeHistory(h.points,row.item),at:h.at};
      const recent=mergeRecentQuotes([...(summary?.recent||[]),...loaded.recent],row.item);
      summary={...(summary&&stored?.at>=h.at?summary:loaded),recent};
    }
    s=summary?analyzeHistorySummary(summary,row.item,data,valuationOptions):{short:false,watch:false,long:false,points:[]};itemSignalCache.set(itemKey,s);
  }
  const stable=row.kind==='loot'?{long:s.long,reason:s.longReason,days:s.longDays}:profitStability(ledger,row,data,options());
  const short=isPriceOpportunity(row,s);
  const result={...s,short,watch:false,long:stable.long&&(row.kind==='loot'||row.profit>0),longReason:stable.reason,longDays:stable.days};signalCache.set(key,result);return result;
}
const aliases={ledx:'ledx',gpu:'显卡',bitcoin:'比特币',sugar:'白糖',water:'水',filter:'滤芯',led:'ledx',xianka:'显卡',baitang:'白糖',lvxin:'滤芯',shuixing:'水',yaoshi:'钥匙',yiliaobao:'医疗包',zhentou:'注射器'};
function matches(row){
  const v=view(),c=criteria(),i=row.item,quick=row.kind==='loot'&&inQuicklook();
  const term=(v.search||'').trim().toLowerCase(),lookup=quick&&Boolean(term);
  if(quick&&isEventItem(i)&&!v.includeEvents)return false;
  if(quick&&!matchesRunScope(row,{search:term,quicklookTypes:activeRunTypes(v),minValue:RUN_MIN_VALUE}))return false;
  if(row.kind==='craft'&&v.station!=='all'&&row.station?.id!==v.station)return false;
  if(!quick&&v.category!=='all'&&v.category!==i.category)return false;
  if(!lookup&&v.filter==='favorites'&&!state.favorites[state.market].includes(i.id))return false;
  if(v.filter==='short'&&!signal(row).short)return false;
  if(row.kind==='loot'&&!quick&&(c.minSlot||0)>row.slotValue)return false;
  if(row.kind!=='loot'&&((c.minProfit>0&&(!Number.isFinite(row.profit)||c.minProfit>row.profit))||(c.budget>0&&(!Number.isFinite(row.purchase)||row.purchase>c.budget))))return false;
  if(row.kind==='craft'&&c.maxHours>0&&row.hours>c.maxHours)return false;
  if(!term)return true;
  const text=[i.id,i.name,i.shortName,i.english,i.slug,row.trader?.name,row.trader?.slug,row.station?.name,...(row.recipe||[]).map(m=>`${m.item.name} ${m.item.english}`)].join(' ').toLowerCase();
  const words=new Set(text.split(/[^a-z0-9]+/));
  return term.split(/\s+/).every(t=>aliases[t]?text.includes(aliases[t])||words.has(t):text.includes(t));
}
function tags(r,s){
  const risk=data.flea.enabled&&!r.item.types.includes('noFlea')&&lowOfferCount(r.item);
  const vendor=data.traders[r.vendor?.trader]?.name;
  const traderWins=vendor&&Number.isFinite(r.traderNet)&&r.channel!=='跳蚤';
  return ((!data.flea.enabled||r.item.types.includes('noFlea'))?'<span class="tag banned-tag">跳蚤禁售</span>':'')+
    (r.status==='等级不足'?`<span class="tag level-tag">跳蚤 Lv.${Math.max(data.flea.minPlayerLevel||15,r.item.fleaLevel||0)}</span>`:'')+
    (risk?`<span class="tag quote-risk" title="当前仅 ${r.item.offers} 条报价">报价数过低 <b>${r.item.offers}</b></span>`:'')+
    (traderWins?`<span class="tag trader-tag"${Number.isFinite(r.fleaReferenceNet)?` title="较跳蚤 ${sign(r.traderNet-r.fleaReferenceNet)}"`:''}>卖 ${esc(vendor)}</span>`:'')+
    (s.short?`<span class="tag short-tag">${icon('trend')}${s.riseWindow==='24h'?'24h':'7日'} ${percent(s.riseChange)}</span>`:'')+
    (s.long?`<span class="tag long-tag">${r.kind==='loot'?'长期高值':'长期稳定'}</span>`:'')+
    (r.item.eventOnly||r.eventOnly?'<span class="tag event-tag">活动限定</span>':'');
}
function metric(label,value){return `<div><label>${label}</label><b>${value}</b></div>`;}
function quicklookTile(r,cell,index){
  const i=r.item,s=signal(r),tone=opportunityTone(r,s),old=quicklookPrices.get(r.id);
  const amount=r.slotValue>=10000?(Math.round(r.slotValue/1000)/10).toLocaleString('zh-CN',{maximumFractionDigits:1}):fmt(r.slotValue);
  const unit=Number.isFinite(r.slotValue)?r.slotValue>=10000?'万':'₽':'';
  const packCount=i.types.includes('ammoBox')?(i.containsItems||[]).reduce((sum,p)=>sum+p.count,0):0;
  const name=(cell.group==='lookup'?i.name:i.shortName||i.name)+(packCount?' ×'+packCount:'');
  return `<button class="quicklook-tile ${tone} tier-${cell.tier}${cell.w>=cell.h*1.35?' cloud-wide':''}${old!==undefined&&old!==r.slotValue?' quote-changed':''}" data-open="${esc(r.id)}" data-cloud-id="${esc(r.id)}" data-cloud-group="${cell.group}" style="grid-column:${cell.x+1}/span ${cell.w};grid-row:${cell.y+1}/span ${cell.h};--order:${Math.min(index,12)}" aria-label="${esc(i.name)}，单格净值 ${fmt(r.slotValue)} 卢布，查看明细" title="${esc(i.name)} · 净利/格 ₽${fmt(r.slotValue)}">
    <span class="cloud-art">${image(i.art,'','cloud-image')}</span>
    <span class="cloud-caption"><span class="cloud-name">${esc(name)}</span><span class="cloud-value"><strong>${amount}</strong><span>${unit}</span></span></span>
  </button>`;
}
function renderQuicklook(){
  const root=$('#loot');
  if(!root.querySelector('.quicklook-unified'))root.innerHTML=`<div class="quicklook-board quicklook-unified"><div class="quicklook-grid"></div><button class="load-more" data-more="loot" hidden>更多结果</button></div>`;
  const key=JSON.stringify([state.market,view(),state.density]);
  const previous=key===quicklookKey?quicklookPlan:null;
  const grid=root.querySelector('.quicklook-grid'),board=grid.parentElement;
  const compact=state.density==='compact',height=board.clientHeight-20,lookup=Boolean(view().search.trim());
  const shown=lookup?visible.loot.slice(0,limit.loot):visible.loot;
  const plan=quicklookLayout(shown,{width:board.clientWidth-20,height,compact,lookup,previous});
  board.classList.toggle('is-lookup',lookup);
  if(!lookup)$('#loot-count').textContent=fmt(plan.cells.length);
  grid.style.height=(plan.height+20)+'px';grid.style.gridTemplateRows=plan.tracks.map(n=>n+'px').join(' ');
  board.querySelector('.load-more').hidden=!lookup||shown.length===visible.loot.length;
  if(key!==quicklookKey)board.scrollTop=0;
  grid.style.setProperty('--cloud-columns',plan.columns);grid.style.setProperty('--cloud-rows',plan.rows);
  const focused=root.contains(document.activeElement)?document.activeElement.dataset.cloudId:null;
  const existing=new Map([...root.querySelectorAll('[data-cloud-id]')].map(el=>[el.dataset.cloudId,el]));
  const markup=new Map(),byId=new Map(visible.loot.map(r=>[r.id,r]));
  const tiles=plan.cells.map((c,index)=>{
    const html=quicklookTile(byId.get(c.id),c,index),old=existing.get(c.id);markup.set(c.id,html);
    if(old&&quicklookMarkup.get(c.id)===html)return old;
    const template=document.createElement('template');template.innerHTML=html;const fresh=template.content.firstElementChild;
    if(!old)return fresh;
    preserveImages(old,fresh);
    for(const attribute of ['class','style','title','aria-label','data-cloud-group'])old.setAttribute(attribute,fresh.getAttribute(attribute));
    old.replaceChildren(...fresh.childNodes);return old;
  });
  reconcileChildren(grid,tiles);
  quicklookPlan=plan;quicklookKey=key;quicklookMarkup=markup;
  quicklookPrices=new Map(visible.loot.map(r=>[r.id,r.slotValue]));
  if(focused)root.querySelector(`[data-cloud-id="${focused}"]`)?.focus({preventScroll:true});
}
function card(r,index){
  const i=r.item,s=signal(r),loot=r.kind==='loot',craft=r.kind==='craft',fav=state.favorites[state.market].includes(i.id);
  const perItem=loot&&!inQuicklook(),vendor=data.traders[r.vendor?.trader]?.name;
  const label=loot?(perItem?'净利/个':'净利/格'):craft?'净利/批':'净利/次';
  const value=loot?fmt(perItem?r.net:r.slotValue):Number.isFinite(r.profit)?sign(r.profit):'待估值';
  const actor=craft?r.station:r.trader;
  const timing=craft?`<span class="craft-timing"><span>${duration(r.seconds)} · ×${r.count}</span><span>时薪 ${sign(r.hourly)}</span></span>`:`<span>限购 ${r.limit??'未知'}</span>`;
  const route=loot?'':`<div class="route">${image(actor?.image)}<span>${esc(actor?.name||'未知')} ${craft?'Lv.'+r.level:loyaltyBadge(r.level,actor)} · ${craft?'制作':r.isBarter?'兑换':'直购'}${r.execution?.missing.some(x=>/Lv\.|LL|任务|等级|版本/.test(x))?' <b class="condition-tag">未解锁</b>':''}</span>${timing}</div>`;
  const ingredients=r.recipe?`<div class="ingredients">${r.recipe.slice(0,6).map(m=>`<span class="ingredient" title="${esc(m.item.name)} · ${m.tool?'可复用工具':esc(m.source)}">${image(m.item.image)}<span>${esc(m.item.shortName)} <i>×${m.count}</i>${m.tool?' ⌁':''}</span></span>`).join('')}${r.recipe.length>6?`<span class="ingredient">+${r.recipe.length-6} 项</span>`:''}</div>`:'';
  const traderBest=r.channel!=='跳蚤'&&Number.isFinite(r.traderNet),difference=Number.isFinite(r.fleaReferenceNet)&&Number.isFinite(r.traderNet)?(traderBest?r.traderNet-r.fleaReferenceNet:r.fleaReferenceNet-r.traderNet):null;
  const chargedFee=r.channel==='跳蚤'?r.fee:0;
  const totalCost=Number.isFinite(r.purchase)&&Number.isFinite(chargedFee)?r.purchase+chargedFee:null;
  const gross=r.channel==='跳蚤'?i.price*r.count:r.traderNet;
  const metrics=loot?metric('跳蚤最低价',fmt(i.price))+metric(traderBest?'较 跳蚤':vendor?`较 ${esc(vendor)}`:'商人对比',difference===null?'—':sign(difference)):
    metric((r.channel!=='跳蚤'?'商人收购价':'跳蚤最低价')+(r.count>1?' ×'+r.count:''),fmt(gross))+metric('总成本',fmt(totalCost));
  const extra=loot?`<span>${i.width} × ${i.height} 格</span>${perItem?'':`<span>净利/个 ₽${fmt(r.net)}</span>`}`:
    '';
  return `<article style="--order:${Math.min(index,7)}" class="card ${opportunityTone(r,s)}" data-row="${esc(r.id)}" data-open="${esc(r.id)}">
  <div class="card-main" role="button" tabindex="0" data-open="${esc(r.id)}" aria-label="查看${esc(i.name)}明细">
    <div class="item-top"><div class="item-picture">${image(i.art||i.image,i.name,'',i.image)}${loot?`<span class="rank">${index+1}</span>`:''}</div><div class="item-info"><div class="item-name" title="${esc(i.name)}">${esc(i.shortName||i.name)}</div><div class="item-category">${i.isPreset?`<span class="tag">${i.category==='weapon'?'武器预设':'装备预设'}</span>`:''}${tags(r,s)||(i.isPreset?'':esc(CATEGORIES[i.category]))}</div></div><div class="money"><strong class="${loot?'':r.profit<0?'negative':'positive'}">${value}</strong><span class="unit">${label}</span></div></div>
    ${route}${ingredients}<div class="metrics ${loot?'metrics-loot':'metrics-trade'}">${metrics}</div>${extra?`<div class="card-extra">${extra}</div>`:''}</div>
    <div class="card-tail"><span class="tail-spacer"></span><button class="favorite ${fav?'active':''}" data-favorite="${i.id}" aria-label="${fav?'取消收藏':'收藏'}${esc(i.name)}" aria-pressed="${fav}">${icon('star')}</button><button data-open="${esc(r.id)}" aria-label="打开${esc(i.name)}明细">明细 ${icon('chevron')}</button></div></article>`;
}
function anchors(){return Object.fromEntries([moduleForPage(state.page)].map(k=>{const el=$('#'+k),top=el.getBoundingClientRect().top;const first=[...el.querySelectorAll('.card')].find(c=>c.getBoundingClientRect().bottom>top);return [k,{top:el.scrollTop,id:first?.dataset.row,offset:first?first.getBoundingClientRect().top-top:0}];}));}
function render(preserve=false){
  const before=animateNext?motion.capture($('#'+moduleForPage(state.page))):null;
  if(!data)return;syncQuicklook();const savedAnchors=preserve?anchors():null,counts={};for(const r of (rows[moduleForPage(state.page)]||rows.loot))counts[r.item.category]=(counts[r.item.category]||0)+1;
  $('#category').innerHTML=`<option value="all">全部分类 · ${(rows[moduleForPage(state.page)]||rows.loot).length}</option>`+Object.entries(CATEGORIES).map(([k,n])=>`<option value="${k}">${n} · ${counts[k]||0}</option>`).join('');$('#category').value=view().category;
  const stations=[...new Map(rows.crafts.filter(r=>r.station).map(r=>[r.station.id,r.station])).values()];
  $('#station-filter').innerHTML='<option value="all">全部设施</option>'+stations.map(st=>`<option value="${esc(st.id)}">${esc(st.name)}</option>`).join('');
  if(!stations.some(st=>st.id===view().station))view().station='all';$('#station-filter').value=view().station;

  for(const key of [moduleForPage(state.page)]){
    const lookup=key==='loot'&&inQuicklook()&&Boolean(view().search.trim());
    visible[key]=(lookup?catalogRows:rows[key]).filter(matches);
    if(key==='loot'){
      if(lookup){
        const term=view().search.trim().toLowerCase(),query=aliases[term]||term;
        const relevance=r=>Math.max(...[r.item.name,r.item.shortName,r.item.english,r.item.slug].filter(Boolean).map(t=>t.toLowerCase()===query?2:t.toLowerCase().startsWith(query)?1:0));
        visible[key].sort((a,b)=>relevance(b)-relevance(a)||(b.slotValue??-Infinity)-(a.slotValue??-Infinity)||a.id.localeCompare(b.id));
      }
      else if(inQuicklook())visible[key]=visible[key].map(r=>({...r,quicklookScore:lootPriority(r,signal(r))})).sort(compareLootPriority);
      else visible[key].sort((a,b)=>b.net-a.net||a.id.localeCompare(b.id));
    }
    $('#'+key+'-count').textContent=fmt(visible[key].length);
    if(key==='loot'&&inCloud()&&visible.loot.length){renderQuicklook();continue;}
    let message=inQuicklook()?'调整筛选，或搜索物品查价。':'尝试放宽分类、预算或解锁条件。',title='暂无符合条件的机会';
    if(lookup){title='未找到物品';message='试试名称、简称或英文名。';}
    if(!lookup&&view().filter==='favorites'){title='这里还没有收藏';message='点物品右下角的星标，下次就能快速找到。';}
    if(view().filter==='short'){title=signalsLoading?'正在核对涨价机会':'暂无符合条件的涨价机会';message='尝试放宽筛选，或稍后查看新行情。';}
    updateCardList($('#'+key),visible[key].slice(0,limit[key]).map(card).join('')||`<div class="empty">${icon(view().filter==='favorites'?'star':'search')}<strong>${title}</strong><p>${message}</p>${key==='loot'&&inQuicklook()?'<button data-page="items">在物品一览中查找</button>':''}<button data-reset>重置筛选</button></div>`);
    if(visible[key].length>limit[key])$('#'+key).insertAdjacentHTML('beforeend',`<button class="load-more" data-more="${key}">继续查看 ${Math.min(40,visible[key].length-limit[key])} 项 ${icon('arrow-down')}</button>`);
    if(savedAnchors){const a=savedAnchors[key],el=$('#'+key),target=[...el.querySelectorAll('.card')].find(c=>c.dataset.row===a.id);el.scrollTop=a.top;if(target)el.scrollTop+=target.getBoundingClientRect().top-el.getBoundingClientRect().top-a.offset;}
    else $('#'+key).scrollTop=0;
  }
  $$('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===view().filter)));
  $('#favorite-count').textContent=state.favorites[state.market].length||'';renderFilterSummary();
  $('#coverage').hidden=inQuicklook();$('#coverage').textContent=`${MARKETS[state.market]} · ${fmt(data.rawCount)} 物品 · 每5分钟刷新`;

  if(animateNext){motion.reflow($('#'+moduleForPage(state.page)),before);animateNext=false;}
}
function renderFilterSummary(){
  const v=view(),chips=[];
  if(!inQuicklook()&&v.category!=='all')chips.push(['category',CATEGORIES[v.category]]);
  if(view().includeEvents)chips.push(['events','含活动品']);
  for(const [key,label] of [['minSlot','单格 ≥'],['minProfit','净利 ≥'],['budget','预算 ≤'],['maxHours','工时 ≤'],['onlyExecutable','条件已满足']]){
    if(inQuicklook()&&key==='minSlot')continue;
    const n=criteria()[key];if(n)chips.push([key,typeof n==='boolean'?label:label+' '+fmt(n)+(key==='maxHours'?'h':'')]);
  }
  const selected=activeRunTypes(v);
  $('#filter-label').textContent=inQuicklook()?`筛选·${selected.length}`:'筛选';
  $('#filter-button').setAttribute('aria-label',inQuicklook()?`筛选·${selected.length}，已勾选 ${selected.length} 种物品类型`:'筛选');
  $('#filter-active').hidden=inQuicklook()||!chips.length;$('#filter-active').textContent=chips.length;
  $('#active-filters').hidden=!chips.length;$('#active-filters').innerHTML=chips.map(([key,label])=>`<button data-clear-filter="${key}" aria-label="移除${esc(label)}筛选">${esc(label)}${icon('x')}</button>`).join('');
}

function reading(){return $('dialog[open]')||Date.now()-lastInteraction<1500;}
function updateStatus(){if(data)$('#status').textContent='获取 '+new Date(data.fetchedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}
function warning(message){$('#warning').hidden=!message;$('#warning').textContent=message||'';$('#connection-dot').classList.toggle('offline',Boolean(message));}
function queueApply(){
  clearTimeout(applyTimer);
  const pending=Boolean(pendingSnapshot||pendingSignals);$('#pending').hidden=!pending;
  if(!pending){updateWindow.clear();return;}
  updateWindow.start();
  const left=updateWindow.remaining();
  if(left<=0){applyPending();return;}
  $('#pending-countdown').textContent=`${Math.ceil(left/1000)} 秒后自动更新`;
  $('#pending').style.setProperty('--remaining',String(left/updateDelay));
  applyTimer=setTimeout(queueApply,Math.min(1000,left));
}
function applyPending(){
  clearTimeout(applyTimer);updateWindow.clear();
  const changed=Boolean(pendingSnapshot||pendingSignals);
  if(pendingSignals){historyBook=pendingSignals.entries||{};signalsInfo=pendingSignals;pendingSignals=null;}
  if(pendingLedger){ledger=pendingLedger;pendingLedger=null;}
  signalCache.clear();itemSignalCache.clear();
  if(pendingSnapshot){data=pendingSnapshot;pendingSnapshot=null;rebuild();updateStatus();}
  if(changed){render(true);refreshOpenDetail();}$('#pending').hidden=true;
}
function refreshOpenDetail(){
  if(!detailRow||!$('#detail-dialog').open)return;
  const fresh=detailRow.catalog?catalogById.get(detailRow.id):Object.values(rows).flat().find(r=>r.id===detailRow.id);
  if(!fresh)return;
  const scroll=$('#detail-dialog').scrollTop;
  const expanded=$$('#detail-content details').map(d=>d.open);
  detailRow=fresh;renderDetailContent(fresh);historyDetail();
  $$('#detail-content details').forEach((d,n)=>d.open=Boolean(expanded[n]));
  $('#detail-dialog').scrollTop=scroll;
}
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
function loadingPhase(phase,message){
  $('#loading-title').textContent=message;
  $$('#market-loader [data-stage]').forEach((el,index)=>{el.classList.toggle('current',index===phase);el.classList.toggle('done',index<phase);});
}
function finishLoading(){document.body.dataset.loading='false';$('#market-stage').setAttribute('aria-busy','false');if(!document.body.dataset.readyMs){document.body.dataset.readyMs=String(Math.round(performance.now()));performance.mark('radar-ready');}}
async function refresh(force=false){
  refreshAbort?.abort();refreshAbort=new AbortController();
  const seq=++sequence,market=state.market;busy=true;$('#refresh').disabled=true;$('#refresh').classList.add('spin');
  if(!data){loading();$('#status').textContent='获取行情中';}
  try{
    if(!data){
      const cached=await dashboardClient.read(market);if(seq!==sequence)return;
      if(cached){
        loadingPhase(2,'正在还原市场情报');await nextPaint();if(seq!==sequence)return;
        pendingSnapshot=applyCategoryMetadata(applyEventMetadata(cached.snapshot));pendingSignals=cached.signals;pendingLedger=cached.ledger||[];
        applyPending();finishLoading();
        warning(Date.now()-Date.parse(cached.snapshot.fetchedAt)>15*60000?'行情更新中，当前显示上次成功快照。':'');
      }
    }
    const result=await dashboardClient.load(market,{signal:AbortSignal.any([refreshAbort.signal,AbortSignal.timeout(45000)])});if(seq!==sequence)return;
    if(!data){loadingPhase(1,'正在核对价格与收益');await nextPaint();if(seq!==sequence)return;}
    const snapshot=applyCategoryMetadata(applyEventMetadata(result.snapshot));
    warning(snapshot.warning||snapshot.collectionWarning||(Date.now()-Date.parse(snapshot.fetchedAt)>15*60000?'行情更新中，当前显示上次成功快照。':''));
    if(!data||force||snapshot.fetchedAt!==data.fetchedAt||snapshot.classificationRevision!==data.classificationRevision||result.signals.checkedAt!==signalsInfo.checkedAt){
      pendingSnapshot=snapshot;pendingSignals=result.signals;pendingLedger=result.ledger||[];
      if(data&&!force)queueApply();
      else{
        loadingPhase(2,'正在标记赚钱机会');await nextPaint();if(seq!==sequence)return;
        applyPending();finishLoading();
      }
    }
    const requested=params.get('item');if(requested&&data&&!detailRow){if(catalogById.has(requested))openDetail(requested);else toast('当前市场未找到这个物品。');params.delete('item');}
  }catch(error){
    if(seq!==sequence)return;
    warning(`行情暂未更新：${error.message}${data?'。保留上次成功快照。':''}`);$('#status').textContent='等待恢复';
    if(!data){$('#market-loader').classList.add('failed');$('#loading-title').textContent='情报连接中断';$('#loading-retry').hidden=false;}
  }finally{if(seq===sequence){busy=false;$('#refresh').disabled=false;$('#refresh').classList.remove('spin');}}
}
function loading(){
  document.body.dataset.loading='true';$('#market-stage').setAttribute('aria-busy','true');$('#market-loader').classList.remove('failed');$('#loading-retry').hidden=true;
  loadingPhase(0,'正在接收市场情报');
  for(const k of ['loot','flips','crafts']){$('#'+k).innerHTML='';$('#'+k+'-count').textContent='—';}
  const categories='<option value="all">全部分类</option>'+Object.entries(CATEGORIES).map(([k,n])=>`<option value="${k}">${n}</option>`).join('');
  $('#category').innerHTML=categories;$('#category').value=view().category;
  $('#coverage').textContent=`${MARKETS[state.market]} · 正在读取该市场行情`;

}
async function getHistory(item,market=state.market){
  if(item.valuationId)item=data.items[item.valuationId];
  const key=`${market}:${item.id}`,old=histories.get(key);if(old&&Date.now()-old.at<300000)return old;if(historyRequests.has(key))return historyRequests.get(key);
  const task=api(`history?id=${item.id}`,market).then(result=>{histories.set(key,result);signalCache.clear();itemSignalCache.clear();return result;}).finally(()=>historyRequests.delete(key));historyRequests.set(key,task);return task;
}
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
  if(r.item.currencyOnly){$('#history-content').innerHTML='<p>货币条目不提供跳蚤价格走势。</p>';return;}
  $('#history-content').innerHTML=h?.points?`${chartMarkup(h.points)}<div class="history-summary"><span>7日常态 <strong>₽${fmt(s.baseline)}</strong></span><span>较常态 <strong>${percent(s.change7)}</strong></span><span>24h <strong>${percent(s.change24)}</strong></span></div>`:'<p>正在读取真实历史报价…</p>';
}

function channelComparison(r){
  const vendor=data.traders[r.vendor?.trader],fleaBest=r.fleaNet!==null&&r.channel==='跳蚤';
  const unavailable=r.status==='禁售'?'跳蚤禁售':r.status==='等级不足'?'跳蚤 Lv.'+Math.max(data.flea.minPlayerLevel||15,r.item.fleaLevel||0):'暂无可用报价';
  return `<section class="detail-section"><h3>卖给谁</h3><div class="channel-comparison">
    <div class="${fleaBest?'chosen':''}"><span>跳蚤${fleaBest?icon('check'):''}</span><strong>₽${fmt(r.fleaReferenceNet)}</strong><small>${r.fleaNet===null?unavailable:'手续费 ₽'+fmt(r.fee)}</small></div>
    <div class="${!fleaBest&&r.traderNet!==null?'chosen':''}"><span>${esc(vendor?.name||'商人')}${!fleaBest&&r.traderNet!==null?icon('check'):''}</span><strong>₽${fmt(r.traderNet)}</strong></div></div></section>`;
}
function relatedRoutes(r){
  const routes=(routeIndex.get(r.item.id)||[]).filter(x=>x.id!==r.id),preset=data.items[r.item.defaultPreset],base=data.items[r.item.baseItem];
  const presetLink=preset?`<button class="preset-link" data-open="${preset.id}">${image(preset.image)}查看默认整枪估值 ${icon('chevron')}</button>`:base?`<button class="preset-link" data-open="${base.id}">查看基础武器 / 机匣 ${icon('chevron')}</button>`:'';
  if(!routes.length&&!presetLink)return '';
  const routeMarkup=x=>{
    const made=x.item.id===r.item.id,tool=x.recipe?.find(m=>m.item.id===r.item.id)?.tool;
    const actor=x.kind==='craft'?x.station:x.trader,label=made?(x.kind==='craft'?'制作产出':x.isBarter?'兑换取得':'商人直购'):(tool?'作为工具':'作为材料');
    const basis=x.kind==='craft'?'净利/批':'净利/次';
    return `<button class="related-route" data-open="${esc(x.id)}">${image(x.item.image)}<span><strong>${esc(x.item.shortName||x.item.name)}</strong><small>${label} · ${esc(actor?.name||'未知')}${x.level?' '+(x.kind==='craft'?'Lv.'+x.level:loyaltyBadge(x.level,actor)):''}</small></span><span class="related-profit"><b>${sign(x.profit)}</b><small>${basis}</small></span>${icon('chevron')}</button>`;
  };
  return `<section class="detail-section"><h3>相关赚钱路线${routes.length?`<span class="count">${routes.length}</span>`:''}</h3>${presetLink}${routes.slice(0,5).map(routeMarkup).join('')}${routes.length>5?`<details class="more-routes"><summary>展开其余 ${routes.length-5} 条路线</summary>${routes.slice(5).map(routeMarkup).join('')}</details>`:''}</section>`;
}
function executionConditions(r,showSatisfied=true){
  const missing=r.execution?.missing||[],task=data.tasks?.[r.task];
  return `${missing.length||showSatisfied?`<div class="condition-list">${missing.length?missing.map(t=>`<span class="tag">${esc(t)}</span>`).join(''):'<span class="tag long-tag">当前条件满足</span>'}</div>`:''}${r.task&&!options().maxProgress?`<div class="execution-task"><label class="tool-line"><input type="checkbox" data-task-complete="${r.task}" ${options().completedTasks.includes(r.task)?'checked':''}>已完成 ${esc(task?.name||'解锁任务')}</label><a class="source-link" href="https://tarkov.dev/task/${r.task}" target="_blank" rel="noreferrer">查看任务 ↗</a></div>`:''}`;
}
function flipExecution(r){
  const ready=r.execution?.executable===true,missing=r.execution?.missing||[];
  const stateLabel=ready?'条件已满足':missing.length&&missing.every(x=>x==='待估值')?'待估值':'条件未满足';
  return `<section class="trade-execution" aria-label="本次倒货"><div class="trade-execution-heading"><h3>本次倒货</h3><span class="execution-state ${ready?'ready':'pending'}">${icon(ready?'check':'info')}${stateLabel}</span></div>
    <div class="trade-route"><div class="route-step"><span class="route-step-icon">${icon(r.isBarter?'box':'backpack')}</span><span><small>准备</small><strong>${r.isBarter?'兑换材料':'采购资金'}</strong></span></div>${icon('chevron','route-arrow')}<div class="route-step"><span><strong>${esc(r.trader?.name||'未知商人')}</strong><small>${Number.isFinite(r.level)?`${loyaltyBadge(r.level,r.trader)} · `:''}${r.isBarter?'兑换':'直购'} ×${fmt(r.count)}</small></span></div>${icon('chevron','route-arrow')}<div class="route-step"><span><strong>${esc(r.channel)}</strong><small>出售 ×${fmt(r.count)}</small></span></div></div>
    <div class="trade-limit"><span>每轮限购</span><b>${Number.isFinite(r.limit)&&r.limit>0?fmt(r.limit):'未知'}</b></div>${executionConditions(r,false)}</section>`;
}
function detailMarkup(r){
  const i=r.item,loot=r.kind==='loot',craft=r.kind==='craft',s=signal(r);
  const chargedFee=r.channel==='跳蚤'?r.fee:0,gross=r.channel==='跳蚤'?i.price*r.count:r.traderNet;
  const materialRows=(r.recipe||[]).map(m=>`<button class="cost-material" data-open="${esc(m.item.id)}">${image(m.item.image)}<span class="cost-material-name"><strong>${esc(m.item.name)} <em>×${m.count}</em></strong><small>${m.tool?'可复用工具':`${esc(m.source)} · 单价 ₽${fmt(m.unitCost)}`}</small></span><span class="cost-material-value"><b>${m.tool?(m.capital===null?'待核价':'₽'+fmt(m.capital)):'₽'+fmt(m.cost)}</b>${m.tool?'<small>首购另计</small>':''}</span>${icon('chevron')}</button>`).join('');
  return `<div class="detail-identity"><div class="item-picture">${image(i.art||i.image,i.name,'',i.image)}</div><div><h2 id="detail-title">${esc(i.name)}</h2><div class="item-category">${esc(CATEGORIES[i.category])} · ${esc(MARKETS[state.market])}</div><div class="item-category">${tags(r,s)}</div></div></div>
  <div class="detail-actions">${detailTrail.length?'<button id="detail-back">← 返回</button>':''}<button data-favorite="${i.id}">${icon('star')}${state.favorites[state.market].includes(i.id)?'已收藏':'收藏'}</button><button id="share-item">${icon('copy')}复制链接</button></div>
  <div class="detail-metrics ${loot?'':'profit-focus'}"><div class="detail-metric"><small>${loot?'净利/个':craft?'净利/批':'净利/次'}</small><strong class="${!loot&&r.profit<0?'negative':''}">₽${fmt(loot?r.net:r.profit)}</strong></div>${loot?`<div class="detail-metric"><small>净利/格</small><strong>₽${fmt(r.slotValue)}</strong></div>`:''}</div>
  ${r.kind==='flip'?flipExecution(r):''}
  ${loot?channelComparison(r):`<section class="purchase-detail"><div class="trade-summary"><span>${(r.channel!=='跳蚤'?'商人收购价':'跳蚤最低价')+(r.count>1?' ×'+r.count:'')} <b>₽${fmt(gross)}</b></span><span>${craft?'材料成本':'进货成本'} <b>₽${fmt(r.purchase)}</b></span><span>手续费 <b>₽${fmt(chargedFee)}</b></span></div>${materialRows?`<div class="cost-materials">${materialRows}</div>`:''}${craft?`<div class="craft-reference"><span>制作 ${duration(r.seconds)} · 产出 ×${r.count}</span><span>时薪 ${sign(r.hourly)}</span></div>`:''}</section>`}
  <div class="quote-reference">${loot?`<span>跳蚤最低价 <b>₽${fmt(i.price)}</b></span>`:''}<span>24h均价 <b>₽${fmt(i.average)}</b></span><span>${fmt(i.offers)} 条报价</span></div>
  <section class="detail-section"><h3>价格走势<div class="chart-controls"><button data-days="7" class="${chartDays===7?'active':''}">7日</button><button data-days="30" class="${chartDays===30?'active':''}">30日</button></div></h3><div id="history-content"></div></section>
  ${relatedRoutes(r)}
  ${craft?`<section class="detail-section"><h3>执行条件</h3>${executionConditions(r)}</section>`:''}
  ${commentThreadMarkup(i,state.market)}
  <div class="detail-source"><a class="source-link" href="https://tarkov.dev/item/${encodeURIComponent(i.slug)}?gameMode=${state.market}" target="_blank" rel="noreferrer">物品资料 ↗</a></div>`;
}
function renderDetailContent(r){
  const root=$('#detail-content'),template=document.createElement('template');template.innerHTML=detailMarkup(r);
  preserveImages(root,template.content);
  const previous=root.querySelector('[data-comment-thread]'),next=template.content.querySelector('[data-comment-thread]');
  if(previous&&next&&previous.dataset.commentThread===next.dataset.commentThread&&previous.dataset.commentMarket===next.dataset.commentMarket)next.replaceWith(previous);
  root.replaceChildren(...template.content.childNodes);mountComments(root.querySelector('[data-comment-thread]'),account);
}
async function openDetail(id,remember=true,source=document.activeElement){
  const r=catalogById.get(id)||Object.values(rows).flat().find(r=>r.id===id);if(!r)return;
  if(remember&&$('#detail-dialog').open&&detailRow&&detailRow.id!==id)detailTrail.push(detailRow.id);
  detailRow=r;const request=++detailSequence,market=state.market;
  const wasOpen=$('#detail-dialog').open;
  renderDetailContent(r);
  if(!wasOpen)motion.open($('#detail-dialog'),source);
  else {motion.swap($('#detail-content'),!remember);($('#detail-back')||$('#detail-dialog [data-close]')).focus({preventScroll:true});}
  $('#detail-dialog').scrollTop=0;historyDetail();
  if(r.item.currencyOnly)return;
  try{await getHistory(r.item,market);if(request===detailSequence&&market===state.market)historyDetail();}catch(error){if(request===detailSequence&&$('#history-content'))$('#history-content').innerHTML=`<p>${/404/.test(error.message)?'上游暂未提供该物品的价格历史。':'历史暂不可用：'+esc(error.message)}</p>`;}
}
function closePanel(dialog,value='cancel'){
  return motion.close(dialog,value);
}
function settingsTab(key){
  $$('[data-settings-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.settingsTab===key)));
  $$('[data-settings-panel]').forEach(p=>p.hidden=p.dataset.settingsPanel!==key);$('.settings-scroll').scrollTop=0;
  if($('#settings').open)motion.swap($(`[data-settings-panel="${key}"]`));
}
function taskSelectionSummary(){
  const all=$$('[data-task]'),count=all.filter(e=>e.checked).length;
  $('#tasks-all').checked=all.length>0&&count===all.length;$('#tasks-all').indeterminate=count>0&&count<all.length;$('#task-count').textContent=`${count} / ${all.length}`;
}
function renderProfileInputs(p){
  $('#player-level').value=p.playerLevel||79;
  const selectLevels=(current,max)=>Array.from({length:max+1},(_,n)=>`<option value="${n}" ${n===max?'data-max aria-label="最高忠诚度"':''} ${current===n?'selected':''}>${n===max?'👑':n?'LL '+n:'未解锁'}</option>`).join('');
  $('#station-settings').innerHTML=productionStations(data).map(st=>`<div class="station-setting"><label class="station-identity"><input type="checkbox" data-production="${st.id}" aria-label="${esc(st.name)}参与推荐" ${p.excludedStations.includes(st.id)?'':'checked'}>${image(st.image)}<span>${esc(st.name)}</span></label><select data-station="${st.id}" aria-label="${esc(st.name)}等级">${Array.from({length:stationMaxLevel(st,data)+1},(_,n)=>`<option value="${n}" ${p.stationLevels[st.id]===n?'selected':''}>${n?`Lv.${n}`:'未建造'}</option>`).join('')}</select></div>`).join('');
  $('#trader-settings').innerHTML=tradingTraders(data).map(t=>`<label><span>${image(t.image)}${esc(t.name)}</span><span class="trader-level-picker"><select data-trader="${t.id}" aria-label="${esc(t.name)}忠诚度">${selectLevels(p.traderLevels[t.id]||0,traderMaxLevel(t))}</select><span class="max-loyalty-icon" aria-hidden="true">${icon('crown','loyalty-crown')}</span></span></label>`).join('');
  $('#task-settings').innerHTML=profileTaskIds(data).sort((a,b)=>(data.tasks?.[a]?.name||a).localeCompare(data.tasks?.[b]?.name||b,'zh-CN')).map(id=>`<label data-task-label><input type="checkbox" data-task="${id}" ${p.completedTasks.includes(id)?'checked':''}><span>${esc(data.tasks?.[id]?.name||id)}</span></label>`).join('');
  $('#task-search').value='';$('#tasks-empty').hidden=true;taskSelectionSummary();
}
function profileFromForm(){
  return resolveTradingProfile({...state.profiles[state.market],maxProgress:false,progressConfigured:true,
    playerLevel:Number($('#player-level').value),
    traderLevels:{...state.profiles[state.market].traderLevels,...Object.fromEntries($$('[data-trader]').map(e=>[e.dataset.trader,Number(e.value)]))},
    stationLevels:{...state.profiles[state.market].stationLevels,...Object.fromEntries($$('[data-station]').map(e=>[e.dataset.station,Number(e.value)]))},
    excludedStations:$$('[data-production]').filter(e=>!e.checked).map(e=>e.dataset.production),
    completedTasks:$$('[data-task]').filter(e=>e.checked).map(e=>e.dataset.task)},data);
}
function showSettings(){
  if(!data){toast('行情加载后即可配置角色条件。');return;}
  $('#profile-market').textContent=MARKETS[state.market];renderProfileInputs(state.profiles[state.market]);settingsTab('stations');motion.open($('#settings'));
}
function showInfo(title,html){$('#info-title').textContent=title;$('#info-content').innerHTML=html;motion.open($('#info-dialog'));}
function toggleFavorite(id){const list=state.favorites[state.market],index=list.indexOf(id);if(index<0)list.push(id);else list.splice(index,1);persist();render(true);if(detailRow?.item.id===id){const button=$('#detail-content [data-favorite]');if(button)button.innerHTML=icon('star')+(index<0?'已收藏':'收藏');}toast(index<0?'已收藏；收藏页仍按价值排序。':'已取消收藏');}
function showFilters(){
  const c=criteria(),quick=inQuicklook(),mod=moduleForPage(state.page);
  $('#filters-title').textContent=quick?'跑刀速览筛选':'筛选条件';
  $('#quicklook-filter-fields').hidden=!quick;$('#coarse-category-field').hidden=quick;
  $('#clear-filters').textContent=quick?'恢复默认':'清除筛选';
  if(quick){renderQuicklookTypeChoices(activeRunTypes(view()));$('#quicklook-ignore-flea-level').checked=view().ignoreFleaLevel;}
  for(const [id,key] of [['min-slot','minSlot'],['min-profit','minProfit'],['budget','budget'],['max-hours','maxHours']])$('#'+id).value=c[key]||'';
  $('#only-executable').checked=c.onlyExecutable||false;
  $('#category').value=view().category;$('#include-events').checked=view().includeEvents;
  $$('[data-filter-for]').forEach(el=>el.hidden=el.dataset.filterFor==='trades'?!['flips','crafts'].includes(mod):el.dataset.filterFor!==mod);
  $('#min-slot-field').hidden=mod!=='loot'||quick;
  motion.open($('#filters'));
}
function exportSettings(){const blob=new Blob([JSON.stringify({version:4,...state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='loot-radar-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importSettings(file){
  try{if(!file||file.size>512000)throw new Error('请选择小于500KB的设置文件');const p=JSON.parse(await file.text());if(![2,3,4].includes(p.version)||!p.profiles)throw new Error('不是本应用的设置备份');
    for(const m of Object.keys(MARKETS)){state.profiles[m]=normalizeProfile(p.profiles[m]);state.favorites[m]=safeIds(p.favorites?.[m]);state.workspaceViews[m]=Object.fromEntries(Object.entries(migrateWorkspaceViews(p,m)).map(([k,v])=>[k,safeView(v)]));state.views[m]=safeView(p.views?.[m]);}
    for(const m of Object.keys(MARKETS)){for(const v of Object.values(state.workspaceViews[m]))Object.assign(v,{includeEvents:state.views[m].includeEvents});}
    if(['standard','compact'].includes(p.density))state.density=p.density;
    persist();syncControls();rebuild();render(true);closePanel($('#settings'),'cancel');toast('已导入角色条件、显示偏好与收藏。');
  }catch(error){toast('导入失败：'+error.message);}
}
document.addEventListener('click',event=>{
  const target=event.target.closest('button,[data-open]');
  if(!target)return;
  if(target.dataset.open)openDetail(target.dataset.open,true,target);
  if(target.dataset.page)switchPage(target.dataset.page);
  if(target.id==='detail-back'&&detailTrail.length)openDetail(detailTrail.pop(),false);
  if(target.dataset.favorite){toggleFavorite(target.dataset.favorite);motion.favorite(target.dataset.favorite);}
  if(target.hasAttribute('data-open-settings'))showSettings();

  if(target.dataset.close)closePanel($('#'+target.dataset.close));
  if(target.dataset.settingsTab)settingsTab(target.dataset.settingsTab);
  if(target.dataset.clearFilter){const key=target.dataset.clearFilter,v=view();if(key==='events')allViews().forEach(x=>x.includeEvents=false);else if(key==='category')v[key]='all';else view().criteria[key]=0;syncControls();rebuild();render();persist();}
  if(target.dataset.more){limit[target.dataset.more]+=40;render(true);}
  if(target.hasAttribute('data-reset')||target.id==='reset-visible-filters')resetCurrentFilters();
  if(target.hasAttribute('data-retry'))refresh(true);
  if(target.dataset.days){chartDays=Number(target.dataset.days);$$('[data-days]').forEach(b=>b.classList.toggle('active',Number(b.dataset.days)===chartDays));historyDetail();}
  if(target.dataset.quicklookView){view().quicklookView=target.dataset.quicklookView;animateNext=true;render();persist();}
  if(target.dataset.quicklookPreset){
    const v=view();
    Object.assign(v,toggleRunPreset(v,target.dataset.quicklookPreset));
    animateNext=true;render();persist();
  }
  if(target.dataset.quicklookSelect){const choice=target.dataset.quicklookSelect;$$('[data-quicklook-type]').forEach(el=>el.checked=choice==='all'||(choice==='default'&&DEFAULT_SCAVENGING_CATEGORIES.includes(el.dataset.quicklookType)));}
  if(target.id==='quicklook-repack'){quicklookPlan=null;animateNext=true;render(true);}
  if(target.dataset.filter){
    if(target.dataset.filter==='short'&&!supportsSurgeFilter(state.page))return;
    view().filter=target.id==='quicklook-favorites'&&view().filter==='favorites'?'all':target.dataset.filter;animateNext=true;render();persist();
  }
  if(target.dataset.market&&target.dataset.market!==state.market){
    clearTimeout(applyTimer);updateWindow.clear();
    state.market=target.dataset.market;sequence++;detailSequence++;data=null;detailRow=null;detailTrail=[];historyBook={};ledger=[];signalCache.clear();pendingSnapshot=null;pendingSignals=null;pendingLedger=null;itemSignalCache.clear();
    catalogRows=[];catalogById=new Map();routeIndex=new Map();for(const p of PAGES)screenScroll[p]={list:0,cloud:0};
    signalsInfo={checked:0,total:0};limit={loot:40,flips:30,crafts:30};rows={loot:[],flips:[],crafts:[]};syncControls();loading();warning('');$('#pending').hidden=true;
    history.replaceState(null,'',`?market=${state.market}&view=${state.page}`);persist();refresh();
  }
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card-main')){e.preventDefault();openDetail(e.target.dataset.open);}if(e.key==='/'&&!$('dialog[open]')&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){e.preventDefault();$('#search').focus();}});
for(const el of [$('.columns')])el.addEventListener('scroll',()=>{lastInteraction=Date.now();if(pendingSnapshot||pendingSignals)queueApply();},true);
$('#detail-dialog').addEventListener('close',()=>{detailRow=null;detailTrail=[];detailSequence++;signalCache.clear();render(true);if(pendingSnapshot||pendingSignals)queueApply();});
let searchTimer;
$('#search').addEventListener('input',e=>{view().search=e.target.value;limit.loot=40;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{render();persist();},100);});
$('#search-clear').addEventListener('click',()=>{clearTimeout(searchTimer);view().search='';$('#search').value='';limit.loot=40;render();persist();$('#search').focus();});
$('#search').addEventListener('keydown',e=>{if(e.key==='Escape'&&view().search){e.preventDefault();$('#search-clear').click();}});
$('#refresh').addEventListener('click',()=>refresh(true));$('#apply-pending').addEventListener('click',applyPending);
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口不支持全屏，可放大浏览器窗口。');}});
$('#priority-info').addEventListener('click',()=>showInfo('排序优先级',`<p class="priority-weights">${Object.entries({availability:'常见程度',value:'单格价值',short:'短期涨价'}).map(([key,label])=>`<span>${label} <b>${Math.round(PRIORITY_WEIGHTS[key]*100)}%</b></span>`).join(' · ')}</p><p>≥${fmt(RUN_MIN_VALUE/10000)}万 / 格</p>`));
$('#settings-button').addEventListener('click',showSettings);$('#filter-button').addEventListener('click',showFilters);
$('#density-button').addEventListener('click',()=>{state.density=state.density==='standard'?'compact':'standard';syncControls();if(inCloud()&&data)renderQuicklook();persist();});
$('#profile-form').addEventListener('submit',e=>{
  e.preventDefault();if(e.submitter?.value!=='save'){closePanel($('#settings'));return;}
  state.profiles[state.market]=profileFromForm();persist();rebuild();render(true);closePanel($('#settings'),'save');toast('已按你的条件重新计算');
});
$('#reset-progress').addEventListener('click',()=>renderProfileInputs(resolveTradingProfile(profileFromForm(),data,true)));
$('#stations-all').addEventListener('click',()=>$$('[data-production]').forEach(e=>e.checked=true));
$('#stations-max').addEventListener('click',()=>$$('[data-station]').forEach(e=>e.value=stationMaxLevel(data.stations[e.dataset.station],data)));
$('#traders-max').addEventListener('click',()=>$$('[data-trader]').forEach(e=>e.value=traderMaxLevel(data.traders[e.dataset.trader])));
$('#tasks-all').addEventListener('change',e=>{$$('[data-task]').forEach(t=>t.checked=e.target.checked);taskSelectionSummary();});
$('#task-settings').addEventListener('change',taskSelectionSummary);
$('#task-search').addEventListener('input',e=>{const q=e.target.value.trim().toLocaleLowerCase();$$('[data-task-label]').forEach(l=>l.hidden=!l.textContent.toLocaleLowerCase().includes(q));$('#tasks-empty').hidden=$$('[data-task-label]').some(l=>!l.hidden);});
$('#settings').addEventListener('close',()=>{if(pendingSnapshot||pendingSignals)queueApply();});
$('#filter-form').addEventListener('submit',e=>{
  e.preventDefault();if(e.submitter?.value!=='save'){closePanel($('#filters'));return;}
  allViews().forEach(v=>v.includeEvents=$('#include-events').checked);
  if(inQuicklook()){
    view().quicklookTypes=$$('[data-quicklook-type]').filter(el=>el.checked).map(el=>el.dataset.quicklookType);
    view().quicklookPreset=null;
    view().ignoreFleaLevel=$('#quicklook-ignore-flea-level').checked;
  }
  else view().category=$('#category').value;
  view().criteria={minSlot:inQuicklook()?0:Number($('#min-slot').value)||0,minProfit:Number($('#min-profit').value)||0,budget:Number($('#budget').value)||0,maxHours:Number($('#max-hours').value)||0,onlyExecutable:$('#only-executable').checked};
  animateNext=true;syncControls();rebuild();render();persist();closePanel($('#filters'),'save');
});
$('#clear-filters').addEventListener('click',()=>{allViews().forEach(v=>v.includeEvents=false);resetCurrentFilters();closePanel($('#filters'));});
$$('dialog').forEach(dialog=>{
  dialog.addEventListener('cancel',e=>{e.preventDefault();closePanel(dialog);});
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel(dialog);});
});
$('#detail-content').addEventListener('change',e=>{
  const key='completedTasks',id=e.target.dataset.taskComplete;if(!id)return;
  const list=state.profiles[state.market][key];
  if(e.target.checked&&!list.includes(id))list.push(id);else if(!e.target.checked)state.profiles[state.market][key]=list.filter(x=>x!==id);
  persist();const previous=detailRow?.id;rebuild();if(previous)openDetail(previous);
});
$('#detail-content').addEventListener('click',async e=>{if(e.target.closest('#share-item')&&detailRow){try{await navigator.clipboard.writeText(`${location.origin}/?market=${state.market}&view=items&item=${detailRow.item.id}`);toast('物品链接已复制');}catch{toast('复制不可用，可从地址栏分享网页。');}}});
$('#export-settings').addEventListener('click',exportSettings);$('#import-settings').addEventListener('click',()=>$('#import-file').click());$('#import-file').addEventListener('change',e=>importSettings(e.target.files[0]));

window.addEventListener('online',()=>refresh());window.addEventListener('offline',()=>warning('网络已离线，保留上次成功行情。'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&data&&Date.now()-Date.parse(data.fetchedAt)>300000&&!busy)refresh();});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){const img=e.target;if(img.dataset.fallback){const fallback=img.dataset.fallback;delete img.dataset.fallback;img.src=fallback;return;}if(!img.dataset.retried){img.dataset.retried='true';setTimeout(()=>{if(img.isConnected)img.src=img.getAttribute('src');},2500);return;}img.style.opacity='.15';img.title='图片暂不可用';}},true);
document.addEventListener('load',e=>{if(e.target.tagName==='IMG'){e.target.style.opacity='';e.target.removeAttribute('title');}},true);
$('#station-filter').addEventListener('change',e=>{view().station=e.target.value;render();persist();});
if(params.get('view')!==state.page){params.set('view',state.page);history.replaceState(null,'',`?${params}`);}
for(const type of ['pointermove','pointerdown'])$('#detail-content').addEventListener(type,inspectChartPointer);
$('#detail-content').addEventListener('pointerout',e=>{if(e.pointerType==='mouse'&&e.target.closest('.history-chart')&&!e.relatedTarget?.closest?.('.history-chart')){$('#chart-tooltip')?.setAttribute('hidden','');$('#chart-cursor')?.setAttribute('hidden','');}});
$('#detail-content').addEventListener('focusin',e=>{if(e.target.matches('.history-chart'))showChartPoint(chartActive<0?chartSeries.length-1:chartActive);});
$('#detail-content').addEventListener('keydown',e=>{if(!e.target.matches('.history-chart')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();showChartPoint(e.key==='Home'?0:e.key==='End'?chartSeries.length-1:chartActive+(e.key==='ArrowRight'?1:-1));});
new ResizeObserver(()=>{
  cancelAnimationFrame(quicklookResizeFrame);
  quicklookResizeFrame=requestAnimationFrame(()=>{if(inCloud()&&data&&visible.loot.length)renderQuicklook();});
}).observe($('#loot'));
icons();syncControls();saveGuest();loading();
account=createAccountUI({getSettings:accountSettings,applySettings:applyAccountSettings,getGuestSettings:guestSettings,saveGuest,toast,canRefresh:()=>!$('dialog[open]'),openDialog:dialog=>motion.open(dialog),closeDialog:closePanel,animatePane:root=>motion.swap(root)});
account.start();refresh();setInterval(()=>{if(!busy&&!document.hidden)refresh();},300000);
