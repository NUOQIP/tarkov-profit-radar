import { MARKETS,CATEGORIES,applyEventMetadata,collectLoot,collectCatalog,collectFlips,collectCrafts,summarizeHistory,mergeRecentQuotes,analyzeHistorySummary,normalizeProfile,resolveTradingProfile,tradingTraders,productionStations,traderMaxLevel,stationMaxLevel,profileTaskIds,hasFullProgress,isScavengingItem,SCAVENGING_CATEGORIES,DEFAULT_SCAVENGING_CATEGORIES,SCAVENGING_SELECTION_VERSION,migrateScavengingCategories,profitStability,isPriceOpportunity,lowOfferCount } from '/engine.js';
import { createUpdateWindow } from '/update-window.js';
import { quicklookLayout,opportunityTone } from '/quicklook.js';
import { PAGES,moduleForPage,resolvePage,migrateWorkspaceViews,supportsSurgeFilter } from '/navigation.mjs';
import { itemRarity,lootPriority,compareLootPriority,qualifiesForRun,PRIORITY_WEIGHTS } from '/loot-priority.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const KEY='loot-radar-v2',params=new URLSearchParams(location.search);
const QUICKLOOK_PRESETS={keys:{types:['keys']},mods:{types:['mods']},ammo:{types:['ammoBox']}};
const matchesQuicklookPreset=(v,p)=>v.quicklookTypes.length===p.types.length&&p.types.every(k=>v.quicklookTypes.includes(k));
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
const solidIcons={
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
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}
const image=(url,name='',className='',fallback='')=>/^https:\/\/assets\.tarkov\.dev\//.test(url||'')?`<img src="${esc(url)}" alt="${esc(name)}" class="${className}"${/^https:\/\/assets\.tarkov\.dev\//.test(fallback)&&fallback!==url?` data-fallback="${esc(fallback)}"`:''} loading="lazy" decoding="async">`:'';
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
    quicklookView:v.quicklookView==='list'?'list':'cloud',station:typeof v.station==='string'?v.station:'all',
    quicklookTypes,quicklookTypesRevision:SCAVENGING_SELECTION_VERSION,
    criteria:{minSlot:n(c.minSlot),minProfit:n(c.minProfit),budget:n(c.budget),maxHours:n(c.maxHours),onlyExecutable:c.onlyExecutable===true,freshOnly:c.freshOnly===true}};
}
const state={
 market:Object.hasOwn(MARKETS,params.get('market'))?params.get('market'):Object.hasOwn(MARKETS,saved.market)?saved.market:'pve',
 uiRevision:UI_REVISION,
 page:resolvePage(params.get('view'),saved,params.get('market')||saved.market||'pve'),
 profiles:Object.fromEntries(Object.keys(MARKETS).map(k=>[k,normalizeProfile(saved.profiles?.[k])])),
 views:Object.fromEntries(Object.keys(MARKETS).map(k=>[k,safeView(saved.views?.[k])])),favorites:{},
 workspaceViews:Object.fromEntries(Object.keys(MARKETS).map(m=>[m,Object.fromEntries(Object.entries(migrateWorkspaceViews(saved,m)).map(([k,v])=>[k,safeView(v)]))])),
 density:saved.density==='compact'?'compact':'standard',
 theme:['light','dark'].includes(saved.theme)?saved.theme:'dark',paused:false
};
for(const market of Object.keys(MARKETS)){
  state.favorites[market]=safeIds(saved.favorites?.[market]);
  for(const v of Object.values(state.workspaceViews[market]))Object.assign(v,{includeEvents:state.views[market].includeEvents});
}
function view(){return state.workspaceViews[state.market][state.page];}
function allViews(){return [state.views[state.market],...Object.values(state.workspaceViews[state.market])];}
function criteria(){return view().criteria||{};}
let profileComplete=false,animateNext=true,enterTimer;
function options(){return {...state.profiles[state.market],stack:'single',historyFullProgress:profileComplete,onlyExecutable:criteria().onlyExecutable===true,includeEvents:view().includeEvents===true,allowDelayedTrades:true};}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('设备存储不可用，这次设置仅保留到页面关闭。');}}
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
  document.documentElement.dataset.theme=state.theme;$('#theme').innerHTML=icon(state.theme==='light'?'moon':'sun');
}
function rebuild(){
  if(!data)return;
  state.profiles[state.market]=resolveTradingProfile(state.profiles[state.market],data);persist();
  profileComplete=hasFullProgress(state.profiles[state.market],data);
  signalCache.clear();itemSignalCache.clear();rows={loot:collectLoot(data,options()),flips:collectFlips(data,{...options(),includeLosses:true,includeUnavailable:true}),crafts:collectCrafts(data,{...options(),includeLosses:true})};
  catalogRows=collectCatalog(data,options());catalogById=new Map(catalogRows.map(r=>[r.id,r]));routeIndex=new Map();
  for(const r of [...rows.flips,...rows.crafts])for(const id of new Set([r.item.id,...(r.recipe||[]).map(m=>m.item.id)])){
    if(!routeIndex.has(id))routeIndex.set(id,[]);routeIndex.get(id).push(r);
  }
}
function switchPage(page){
  if(!PAGES.includes(page)||state.page===page)return;
  screenScroll[state.page]={list:$('#'+moduleForPage(state.page)).scrollTop,cloud:$('#loot .quicklook-board')?.scrollTop||0};
  state.page=page;animateNext=true;syncControls();rebuild();render();
  $('#'+moduleForPage(page)).scrollTop=screenScroll[page].list;
  if(inCloud()&&$('#loot .quicklook-board'))$('#loot .quicklook-board').scrollTop=screenScroll[page].cloud;
  history.replaceState(null,'',`?market=${state.market}&view=${page}`);persist();
}
function syncWorkspace(){
  const page=state.page,mod=moduleForPage(page);
  document.body.dataset.page=page;
  const titles={items:['01','物品一览',''],run:['02','跑刀速览','拾取优先级 ↓'],flips:['03','商人倒货','单次净利 ↓'],crafts:['04','藏身处制作','']};
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
    $$('[data-quicklook-preset]').forEach(b=>b.setAttribute('aria-pressed',String(matchesQuicklookPreset(v,QUICKLOOK_PRESETS[b.dataset.quicklookPreset]))));
  }
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
  const h=historyFor(row.item),itemKey=row.item.id;
  let s=itemSignalCache.get(itemKey);
  if(!s){
    const stored=historyBook[row.item.valuationId||row.item.id];let summary=stored?.summary||h?.summary;
    if(h?.points){
      const loaded={...summarizeHistory(h.points,row.item),at:h.at};
      const recent=mergeRecentQuotes([...(summary?.recent||[]),...loaded.recent],row.item);
      summary={...(summary&&stored?.at>=h.at?summary:loaded),recent};
    }
    s=summary?analyzeHistorySummary(summary,row.item,data,options()):{short:false,watch:false,long:false,points:[]};itemSignalCache.set(itemKey,s);
  }
  const stable=row.kind==='loot'?{long:s.long,reason:s.longReason,days:s.longDays}:profitStability(ledger,row,data,options());
  const short=isPriceOpportunity(row,s);
  const result={...s,short,watch:false,long:stable.long&&(row.kind==='loot'||row.profit>0),longReason:stable.reason,longDays:stable.days};signalCache.set(key,result);return result;
}
const aliases={ledx:'ledx',gpu:'显卡',bitcoin:'比特币',sugar:'白糖',water:'水',filter:'滤芯',led:'ledx',xianka:'显卡',baitang:'白糖',lvxin:'滤芯',shuixing:'水',yaoshi:'钥匙',yiliaobao:'医疗包',zhentou:'注射器'};
function matches(row){
  const v=view(),c=criteria(),i=row.item,quick=row.kind==='loot'&&inQuicklook();
  if(quick&&(!qualifiesForRun(row)||!isScavengingItem(i,v.quicklookTypes)))return false;
  if(row.kind==='craft'&&v.station!=='all'&&row.station?.id!==v.station)return false;
  if(!quick&&v.category!=='all'&&v.category!==i.category)return false;
  if(v.filter==='favorites'&&!state.favorites[state.market].includes(i.id))return false;
  if(v.filter==='short'&&!signal(row).short)return false;
  if(row.kind==='loot'&&((!quick&&(c.minSlot||0)>row.slotValue)||(c.freshOnly&&row.status!=='可参考')))return false;
  if(row.kind!=='loot'&&((c.minProfit>0&&(!Number.isFinite(row.profit)||c.minProfit>row.profit))||(c.budget>0&&(!Number.isFinite(row.purchase)||row.purchase>c.budget))))return false;
  if(row.kind==='craft'&&c.maxHours>0&&row.hours>c.maxHours)return false;
  const term=(v.search||'').trim().toLowerCase();if(!term)return true;
  const text=[i.id,i.name,i.shortName,i.english,i.slug,row.trader?.name,row.trader?.slug,row.station?.name,...(row.recipe||[]).map(m=>`${m.item.name} ${m.item.english}`)].join(' ').toLowerCase();
  const words=new Set(text.split(/[^a-z0-9]+/));
  return term.split(/\s+/).every(t=>aliases[t]?text.includes(aliases[t])||words.has(t):text.includes(t));
}
function tags(r,s){
  const risk=data.flea.enabled&&!r.item.types.includes('noFlea')&&lowOfferCount(r.item);
  const vendor=data.traders[r.vendor?.trader]?.name;
  const traderWins=vendor&&Number.isFinite(r.traderNet)&&Number.isFinite(r.fleaNet)&&r.traderNet>r.fleaNet;
  return (risk?`<span class="tag quote-risk" title="当前仅 ${r.item.offers} 条报价，可能存在虚标">报价数过低 <b>${r.item.offers}</b></span>`:'')+
    (traderWins?`<span class="tag trader-tag" title="比跳蚤税后多 ₽${fmt(r.traderNet-r.fleaNet)}">卖 ${esc(vendor)}</span>`:'')+
    (s.short?`<span class="tag short-tag">${icon('trend')}${s.riseWindow==='24h'?'24h':'7日'} ${percent(s.riseChange)}</span>`:'')+
    (s.long?`<span class="tag long-tag">${r.kind==='loot'?'长期高值':'长期稳定'}</span>`:'')+
    (r.item.eventOnly||r.eventOnly?'<span class="tag event-tag">活动限定</span>':'');
}
function metric(label,value){return `<div><label>${label}</label><b>${value}</b></div>`;}
function quicklookTile(r,cell,index){
  const i=r.item,s=signal(r),rarity=itemRarity(i),tone=opportunityTone(r,s),old=quicklookPrices.get(r.id);
  const small=cell.tier==='small';
  const amount=r.slotValue>=10000?(Math.round(r.slotValue/1000)/10).toLocaleString('zh-CN',{maximumFractionDigits:1}):fmt(r.slotValue);
  const unit=r.slotValue>=10000?'万':'₽';
  const packCount=i.types.includes('ammoBox')?(i.containsItems||[]).reduce((sum,p)=>sum+p.count,0):0;
  const name=(i.shortName||i.name)+(packCount?' ×'+packCount:'');
  const vendor=data.traders[r.vendor?.trader]?.name;
  const traderWins=vendor&&Number.isFinite(r.fleaNet)&&Number.isFinite(r.traderNet)&&r.traderNet>r.fleaNet;
  const risk=data.flea.enabled&&!i.types.includes('noFlea')&&lowOfferCount(i);
  const status=s.short?`<span class="cloud-signal">${icon('trend')}${s.riseWindow==='24h'?'24h':'7日'} ${percent(s.riseChange)}</span>`:s.long?'<span class="cloud-signal">长期高值</span>':rarity.key!=='Unknown'?`<span class="cloud-signal rarity-label">${rarity.label}</span>`:'';
  const flag=risk?`<span class="cloud-risk" title="当前仅 ${i.offers} 条报价，可能存在虚标">报价 ${i.offers}</span>`:'';
  const note=traderWins?`<span class="cloud-vendor">卖 ${esc(vendor)}</span>`:r.fleaNet===null&&vendor?`<span class="cloud-vendor">${esc(vendor)} 回收</span>`:'';
  return `<button class="quicklook-tile ${tone} tier-${cell.tier}${old!==undefined&&old!==r.slotValue?' quote-changed':''}" data-open="${esc(r.id)}" data-cloud-id="${esc(r.id)}" style="grid-column:${cell.x+1}/span ${cell.w};grid-row:${cell.y+1}/span ${cell.h};--order:${Math.min(index,12)}" aria-label="${esc(i.name)}，单格净值 ${fmt(r.slotValue)} 卢布，查看明细" title="${esc(i.name)} · 单格净值 ₽${fmt(r.slotValue)}">
    ${small?'':`<span class="cloud-topline">${status}${flag}</span>`}
    <span class="cloud-art">${image(i.art||i.image,'','cloud-image',i.image)}</span>
    <span class="cloud-caption"><span class="cloud-name">${esc(name)}</span><span class="cloud-value"><strong>${amount}</strong><span>${unit}${small?'':'<small>/ 格</small>'}</span></span>${small?'':note}</span>
    ${small?'':`<span class="cloud-open" aria-hidden="true">${icon('chevron')}</span>`}
  </button>`;
}
function renderQuicklook(){
  const root=$('#loot');
  if(!root.querySelector('.quicklook-unified'))root.innerHTML=`<div class="quicklook-board quicklook-unified"><div class="quicklook-grid"></div></div><div class="quicklook-foot"><span id="quicklook-coverage"></span><button data-quicklook-view="list">查看完整列表 ${icon('chevron')}</button></div>`;
  const key=JSON.stringify([state.market,view(),state.density]);
  const previous=key===quicklookKey?quicklookPlan:null;
  const grid=root.querySelector('.quicklook-grid'),board=grid.parentElement;
  const compact=state.density==='compact',height=board.clientHeight-20;
  const fit=quicklookLayout([],{width:board.clientWidth-20,height,compact});
  const plan=quicklookLayout(visible.loot,{width:board.clientWidth-20,height,compact,showAll:true,previous});
  const rowHeight=plan.rowHeight;
  grid.style.height=(plan.rows*rowHeight+7*(plan.rows-1)+20)+'px';
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
    const priorImage=old.querySelector('img'),nextImage=fresh.querySelector('img');
    if(priorImage&&nextImage&&(priorImage.src===nextImage.src||priorImage.src===nextImage.dataset.fallback))nextImage.replaceWith(priorImage);
    for(const attribute of ['class','style','title','aria-label'])old.setAttribute(attribute,fresh.getAttribute(attribute));
    old.replaceChildren(...fresh.childNodes);return old;
  });
  grid.replaceChildren(...tiles);
  quicklookPlan=plan;quicklookKey=key;quicklookMarkup=markup;
  quicklookPrices=new Map(visible.loot.map(r=>[r.id,r.slotValue]));
  if(focused)root.querySelector(`[data-cloud-id="${focused}"]`)?.focus({preventScroll:true});
  $('#quicklook-coverage').textContent=`${fmt(visible.loot.length)} 项 · 按拾取优先级排列${plan.rows>fit.rows?' · 下滑查看更多':''}`;
}
function card(r,index){
  const i=r.item,s=signal(r),loot=r.kind==='loot',craft=r.kind==='craft',fav=state.favorites[state.market].includes(i.id);
  const perItem=loot&&!inQuicklook(),vendor=data.traders[r.vendor?.trader]?.name;
  const label=loot?(perItem?'净利 / 个':'净到手 / 格'):craft?'净利 / 批':'净利 / 次';
  const value=loot?fmt(perItem?r.net:r.slotValue):Number.isFinite(r.profit)?sign(r.profit):'待估值';
  const actor=craft?r.station:r.trader;
  const timing=craft?`<span class="craft-timing"><span>${duration(r.seconds)} · ×${r.count}</span><span>时薪 ${sign(r.hourly)}</span></span>`:`<span>限购 ${r.limit??'未知'}</span>`;
  const route=loot?'':`<div class="route">${image(actor?.image)}<span>${esc(actor?.name||'未知')} ${craft?'Lv.':'LL'}${r.level} · ${craft?'制作':r.isBarter?'兑换':'直购'}${r.execution?.missing.some(x=>/Lv\.|LL|任务|等级|版本/.test(x))?' <b class="condition-tag">未解锁</b>':''}</span>${timing}</div>`;
  const ingredients=r.recipe?`<div class="ingredients">${r.recipe.slice(0,6).map(m=>`<span class="ingredient" title="${esc(m.item.name)} · ${m.tool?'可复用工具':esc(m.source)}">${image(m.item.image)}<span>${esc(m.item.shortName)} <i>×${m.count}</i>${m.tool?' ⌁':''}</span></span>`).join('')}${r.recipe.length>6?`<span class="ingredient">+${r.recipe.length-6} 项</span>`:''}</div>`:'';
  const metrics=metric('最低价',fmt(i.price))+metric('24h均价',fmt(i.average))+
    (loot?metric(vendor?`较 ${esc(vendor)}`:'商人对比',`<span title="跳蚤扣税后净到手减去商人回收价">${Number.isFinite(r.fleaNet)&&Number.isFinite(r.traderNet)?sign(r.fleaNet-r.traderNet):'—'}</span>`):metric(craft?'材料成本':'进货成本',fmt(r.purchase)));
  const extra=loot?`<span>${i.width} × ${i.height} 格</span><span>${perItem?'单格 ₽'+fmt(r.slotValue):'单件 ₽'+fmt(r.net)}</span>`:
    craft?'':
    `<span>${r.roi===null?'':`回报率 ${fmt(r.roi*100)}%`}</span><span>预计净回款 ${r.count>1?'×'+r.count+' ':''} ${fmt(r.fleaNet)}</span>`;

  const quoteAt=r.quoteAt||i.scan;
  const quote=r.status==='可参考'||(loot&&inQuicklook()&&r.status==='报价延迟')?ago(quoteAt):r.status+(quoteAt?' · '+ago(quoteAt):'');
  return `<article style="--order:${Math.min(index,7)}" class="card ${opportunityTone(r,s)}" data-row="${esc(r.id)}">
  <div class="card-main" role="button" tabindex="0" data-open="${esc(r.id)}" aria-label="查看${esc(i.name)}明细">
    <div class="item-top"><div class="item-picture">${image(i.image,i.name)}${loot?`<span class="rank">${index+1}</span>`:''}</div><div class="item-info"><div class="item-name" title="${esc(i.name)}">${esc(i.shortName||i.name)}</div><div class="item-category">${i.isPreset?`<span class="tag">${i.category==='weapon'?'武器预设':'装备预设'}</span>`:''}${tags(r,s)||(i.isPreset?'':esc(CATEGORIES[i.category]))}</div></div><div class="money"><strong class="${loot?'':r.profit<0?'negative':'positive'}">${value}</strong><span class="unit">${label}</span></div></div>
    ${route}${ingredients}<div class="metrics">${metrics}</div>${extra?`<div class="card-extra">${extra}</div>`:''}</div>
    <div class="card-tail"><i class="quote-dot ${r.status==='可参考'?'':'old'}"></i><span class="${r.status==='可参考'?'':'age-old'}" title="所用报价中最旧的时间 ${quoteAt?clock(quoteAt):'未知'}">${esc(quote)}</span><span class="tail-spacer"></span><button class="favorite ${fav?'active':''}" data-favorite="${i.id}" aria-label="${fav?'取消收藏':'收藏'}${esc(i.name)}" aria-pressed="${fav}">${icon('star')}</button><button data-open="${esc(r.id)}" aria-label="打开${esc(i.name)}明细">${icon('chevron')}</button></div></article>`;
}
function anchors(){return Object.fromEntries(['loot','flips','crafts'].map(k=>{const el=$('#'+k),top=el.getBoundingClientRect().top;const first=[...el.querySelectorAll('.card')].find(c=>c.getBoundingClientRect().bottom>top);return [k,{top:el.scrollTop,id:first?.dataset.row,offset:first?first.getBoundingClientRect().top-top:0}];}));}
function render(preserve=false){
  if(!data)return;syncQuicklook();const savedAnchors=preserve?anchors():null,counts={};for(const r of (rows[moduleForPage(state.page)]||rows.loot))counts[r.item.category]=(counts[r.item.category]||0)+1;
  $('#category').innerHTML=`<option value="all">全部分类 · ${(rows[moduleForPage(state.page)]||rows.loot).length}</option>`+Object.entries(CATEGORIES).map(([k,n])=>`<option value="${k}">${n} · ${counts[k]||0}</option>`).join('');$('#category').value=view().category;
  const stations=[...new Map(rows.crafts.filter(r=>r.station).map(r=>[r.station.id,r.station])).values()];
  $('#station-filter').innerHTML='<option value="all">全部设施</option>'+stations.map(st=>`<option value="${esc(st.id)}">${esc(st.name)}</option>`).join('');
  if(!stations.some(st=>st.id===view().station))view().station='all';$('#station-filter').value=view().station;

  for(const key of ['loot','flips','crafts']){
    visible[key]=rows[key].filter(matches);
    if(key==='loot'){
      if(inQuicklook())visible[key]=visible[key].map(r=>({...r,quicklookScore:lootPriority(r,signal(r))})).sort(compareLootPriority);
      else visible[key].sort((a,b)=>b.net-a.net||a.id.localeCompare(b.id));
    }
    $('#'+key+'-count').textContent=fmt(visible[key].length);
    if(moduleForPage(state.page)!==key)continue;
    if(key==='loot'&&inCloud()&&visible.loot.length){renderQuicklook();continue;}
    let message=inQuicklook()?'跑刀仅显示单格净值 ≥ 3万的物品，可调整类型或搜索。':'尝试放宽分类、预算或解锁条件。',title='暂无符合条件的机会';
    if(view().filter==='favorites'){title='这里还没有收藏';message='点物品右下角的星标，下次就能快速找到。';}
    if(view().filter==='short'){title=signalsLoading?'正在核对涨价机会':'暂无符合条件的涨价机会';message='尝试放宽筛选，或稍后查看新行情。';}
    $('#'+key).innerHTML=visible[key].slice(0,limit[key]).map(card).join('')||`<div class="empty">${icon(view().filter==='favorites'?'star':'search')}<strong>${title}</strong><p>${message}</p>${key==='loot'&&inQuicklook()?'<button data-page="items">在物品一览中查找</button>':''}<button data-reset>重置筛选</button></div>`;
    if(inCloud()&&!visible[key].length)$('#'+key+' .empty').insertAdjacentHTML('beforeend','<button data-quicklook-view="list">查看完整列表</button>');
    if(visible[key].length>limit[key])$('#'+key).insertAdjacentHTML('beforeend',`<button class="load-more" data-more="${key}">继续查看 ${Math.min(40,visible[key].length-limit[key])} 项 ${icon('arrow-down')}</button>`);
    if(savedAnchors){const a=savedAnchors[key],el=$('#'+key),target=[...el.querySelectorAll('.card')].find(c=>c.dataset.row===a.id);el.scrollTop=a.top;if(target)el.scrollTop+=target.getBoundingClientRect().top-el.getBoundingClientRect().top-a.offset;}
    else $('#'+key).scrollTop=0;
  }
  $$('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===view().filter)));
  $('#favorite-count').textContent=state.favorites[state.market].length||'';renderFilterSummary();
  $('#coverage').hidden=inQuicklook();$('#coverage').textContent=`${MARKETS[state.market]} · ${fmt(data.rawCount)} 物品 · 每5分钟刷新`;

  if(animateNext){const el=$('#'+moduleForPage(state.page));el.classList.add('is-entering');clearTimeout(enterTimer);enterTimer=setTimeout(()=>$$('.is-entering').forEach(e=>e.classList.remove('is-entering')),650);animateNext=false;}
}
function renderFilterSummary(){
  const v=view(),chips=[];
  if(!inQuicklook()&&v.category!=='all')chips.push(['category',CATEGORIES[v.category]]);
  if(view().includeEvents)chips.push(['events','含活动品']);
  for(const [key,label] of [['minSlot','单格 ≥'],['minProfit','净利 ≥'],['budget','预算 ≤'],['maxHours','工时 ≤'],['onlyExecutable','条件已满足'],['freshOnly','1小时内报价']]){
    if(inQuicklook()&&key==='minSlot')continue;
    const n=criteria()[key];if(n)chips.push([key,typeof n==='boolean'?label:label+' '+fmt(n)+(key==='maxHours'?'h':'')]);
  }
  $('#filter-label').textContent=inQuicklook()?`筛选·${v.quicklookTypes.length}`:'筛选';
  $('#filter-button').setAttribute('aria-label',inQuicklook()?`筛选·${v.quicklookTypes.length}，已勾选 ${v.quicklookTypes.length} 种物品类型`:'筛选');
  $('#filter-active').hidden=inQuicklook()||!chips.length;$('#filter-active').textContent=chips.length;
  $('#active-filters').hidden=!chips.length;$('#active-filters').innerHTML=chips.map(([key,label])=>`<button data-clear-filter="${key}" aria-label="移除${esc(label)}筛选">${esc(label)}${icon('x')}</button>`).join('');
}

function reading(){return state.paused||$('dialog[open]')||Date.now()-lastInteraction<1500;}
function updateStatus(){if(data)$('#status').textContent='获取 '+new Date(data.fetchedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}
function warning(message){$('#warning').hidden=!message;$('#warning').textContent=message||'';$('#connection-dot').classList.toggle('offline',Boolean(message));}
function queueApply(){
  clearTimeout(applyTimer);
  const pending=Boolean(pendingSnapshot||pendingSignals);$('#pending').hidden=!pending;
  if(!pending){updateWindow.clear();return;}
  updateWindow.start();updateWindow.setPaused(state.paused);
  const left=updateWindow.remaining();
  if(!state.paused&&left<=0){applyPending();return;}
  $('#pending-countdown').textContent=state.paused?'自动更新已暂停':`${Math.ceil(left/1000)} 秒后自动更新`;
  $('#pending').style.setProperty('--remaining',String(left/updateDelay));
  $('#pending').classList.toggle('is-paused',state.paused);
  if(!state.paused)applyTimer=setTimeout(queueApply,Math.min(1000,left));
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
  detailRow=fresh;$('#detail-content').innerHTML=detailMarkup(fresh);historyDetail();
  $$('#detail-content details').forEach((d,n)=>d.open=Boolean(expanded[n]));
  $('#detail-dialog').scrollTop=scroll;
}
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
function loadingPhase(phase,message){
  $('#loading-title').textContent=message;
  $$('#market-loader [data-stage]').forEach((el,index)=>{el.classList.toggle('current',index===phase);el.classList.toggle('done',index<phase);});
}
function finishLoading(){document.body.dataset.loading='false';$('#market-stage').setAttribute('aria-busy','false');}
async function refresh(force=false){
  refreshAbort?.abort();refreshAbort=new AbortController();
  const seq=++sequence,market=state.market;busy=true;$('#refresh').disabled=true;$('#refresh').classList.add('spin');
  if(!data){loading();$('#status').textContent='获取行情中';}
  try{
    const result=await api('dashboard',market,refreshAbort.signal);if(seq!==sequence)return;
    if(!data){loadingPhase(1,'正在核对价格与收益');await nextPaint();if(seq!==sequence)return;}
    const snapshot=applyEventMetadata(result.snapshot);
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
function executionConditions(r,showSatisfied=true){
  const missing=r.execution?.missing||[],task=data.tasks?.[r.task];
  return `${missing.length||showSatisfied?`<div class="condition-list">${missing.length?missing.map(t=>`<span class="tag">${esc(t)}</span>`).join(''):'<span class="tag long-tag">当前条件满足</span>'}</div>`:''}${r.task&&!options().maxProgress?`<div class="execution-task"><label class="tool-line"><input type="checkbox" data-task-complete="${r.task}" ${options().completedTasks.includes(r.task)?'checked':''}>已完成 ${esc(task?.name||'解锁任务')}</label><a class="source-link" href="https://tarkov.dev/task/${r.task}" target="_blank" rel="noreferrer">查看任务 ↗</a></div>`:''}`;
}
function flipExecution(r){
  const ready=r.execution?.executable===true,missing=r.execution?.missing||[];
  const stateLabel=ready?'条件已满足':missing.length&&missing.every(x=>['含延迟报价','待估值'].includes(x))?'需核对报价':'条件未满足';
  return `<section class="trade-execution" aria-label="本次倒货"><div class="trade-execution-heading"><h3>本次倒货</h3><span class="execution-state ${ready?'ready':'pending'}">${icon(ready?'check':'info')}${stateLabel}</span></div>
    <div class="trade-route"><div class="route-step"><span class="route-step-icon">${icon(r.isBarter?'box':'backpack')}</span><span><small>准备</small><strong>${r.isBarter?'兑换材料':'采购资金'}</strong></span></div>${icon('chevron','route-arrow')}<div class="route-step"><span><strong>${esc(r.trader?.name||'未知商人')}</strong><small>${Number.isFinite(r.level)?`LL${r.level} · `:''}${r.isBarter?'兑换':'直购'} ×${fmt(r.count)}</small></span></div>${icon('chevron','route-arrow')}<div class="route-step"><span><strong>跳蚤</strong><small>出售 ×${fmt(r.count)}</small></span></div></div>
    <div class="trade-limit"><span>每轮限购</span><b>${Number.isFinite(r.limit)&&r.limit>0?fmt(r.limit):'未知'}</b></div>${executionConditions(r,false)}</section>`;
}
function detailMarkup(r){
  const i=r.item,loot=r.kind==='loot',craft=r.kind==='craft',s=signal(r);
  const materialRows=(r.recipe||[]).map(m=>`<button class="cost-material" data-open="${esc(m.item.id)}">${image(m.item.image)}<span class="cost-material-name"><strong>${esc(m.item.name)} <em>×${m.count}</em></strong><small>${m.tool?'可复用工具':`${esc(m.source)} · 单价 ₽${fmt(m.unitCost)}`}</small></span><span class="cost-material-value"><b>${m.tool?(m.capital===null?'待核价':'₽'+fmt(m.capital)):'₽'+fmt(m.cost)}</b>${m.tool?'<small>首购另计</small>':''}</span>${icon('chevron')}</button>`).join('');
  return `<div class="detail-identity"><div class="item-picture">${image(i.image,i.name)}</div><div><h2 id="detail-title">${esc(i.name)}</h2><div class="item-category">${esc(CATEGORIES[i.category])} · ${esc(MARKETS[state.market])}</div><div class="item-category">${tags(r,s)}</div></div></div>
  <div class="detail-actions">${detailTrail.length?'<button id="detail-back">← 返回</button>':''}<button data-favorite="${i.id}">${icon('star')}${state.favorites[state.market].includes(i.id)?'已收藏':'收藏'}</button><button id="share-item">${icon('copy')}复制链接</button></div>
  <div class="detail-metrics"><div class="detail-metric"><small>${loot?'净利 / 个':craft?'最终净利润 / 批':'预计净利润 / 次'}</small><strong class="${!loot&&r.profit<0?'negative':''}">₽${fmt(loot?r.net:r.profit)}</strong></div><div class="detail-metric"><small>${loot?'每格净到手':craft?'每批产出净到手':'预计净回款'}</small><strong>₽${fmt(loot?r.slotValue:r.net)}</strong></div></div>
  ${r.kind==='flip'?flipExecution(r):''}
  ${loot?channelComparison(r):`<section class="purchase-detail"><div class="trade-summary"><span>${craft?'材料成本':'进货成本'} <b>₽${fmt(r.purchase)}</b></span><span>上架手续费 <b>₽${fmt(r.fee)}</b></span></div>${materialRows?`<div class="cost-materials">${materialRows}</div>`:''}${craft?`<div class="craft-reference"><span>制作 ${duration(r.seconds)} · 产出 ×${r.count}</span><span>参考时薪 ${sign(r.hourly)}</span></div>`:''}</section>`}
  <div class="quote-reference"><span>最低价 <b>₽${fmt(i.price)}</b></span><span>24h均价 <b>₽${fmt(i.average)}</b></span><span>${fmt(i.offers)} 条报价</span></div>
  <section class="detail-section"><h3>价格走势<div class="chart-controls"><button data-days="7" class="${chartDays===7?'active':''}">7日</button><button data-days="30" class="${chartDays===30?'active':''}">30日</button></div></h3><div id="history-content"></div></section>
  ${relatedRoutes(r)}
  ${craft?`<section class="detail-section"><h3>执行条件</h3>${executionConditions(r)}</section>`:''}
  <div class="detail-source"><span>${i.scan?clock(i.scan):'报价时间未知'}</span><a class="source-link" href="https://tarkov.dev/item/${encodeURIComponent(i.slug)}?gameMode=${state.market}" target="_blank" rel="noreferrer">上游资料 ↗</a></div>`;
}
async function openDetail(id,remember=true){
  const r=catalogById.get(id)||Object.values(rows).flat().find(r=>r.id===id);if(!r)return;
  if(remember&&$('#detail-dialog').open&&detailRow&&detailRow.id!==id)detailTrail.push(detailRow.id);
  detailRow=r;const request=++detailSequence,market=state.market;
  $('#detail-content').innerHTML=detailMarkup(r);if(!$('#detail-dialog').open)$('#detail-dialog').showModal();$('#detail-dialog').scrollTop=0;historyDetail();
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
  const selectLevels=(current,max)=>Array.from({length:max+1},(_,n)=>`<option value="${n}" ${current===n?'selected':''}>${n?'LL '+n:'未解锁'}</option>`).join('');
  $('#station-settings').innerHTML=productionStations(data).map(st=>`<div class="station-setting"><label class="station-identity"><input type="checkbox" data-production="${st.id}" aria-label="${esc(st.name)}参与推荐" ${p.excludedStations.includes(st.id)?'':'checked'}>${image(st.image)}<span>${esc(st.name)}</span></label><select data-station="${st.id}" aria-label="${esc(st.name)}等级">${Array.from({length:stationMaxLevel(st,data)+1},(_,n)=>`<option value="${n}" ${p.stationLevels[st.id]===n?'selected':''}>${n?`Lv.${n}`:'未建造'}</option>`).join('')}</select></div>`).join('');
  $('#trader-settings').innerHTML=tradingTraders(data).map(t=>`<label><span>${image(t.image)}${esc(t.name)}</span><select data-trader="${t.id}" aria-label="${esc(t.name)}忠诚度">${selectLevels(p.traderLevels[t.id]||0,traderMaxLevel(t))}</select></label>`).join('');
  $('#task-settings').innerHTML=profileTaskIds(data).sort((a,b)=>(data.tasks?.[a]?.name||a).localeCompare(data.tasks?.[b]?.name||b,'zh-CN')).map(id=>`<label data-task-label><input type="checkbox" data-task="${id}" ${p.completedTasks.includes(id)?'checked':''}><span>${esc(data.tasks?.[id]?.name||id)}</span></label>`).join('');
  $('#task-search').value='';$('#tasks-empty').hidden=true;taskSelectionSummary();
}
function profileFromForm(){
  return resolveTradingProfile({...state.profiles[state.market],maxProgress:false,progressConfigured:true,
    traderLevels:{...state.profiles[state.market].traderLevels,...Object.fromEntries($$('[data-trader]').map(e=>[e.dataset.trader,Number(e.value)]))},
    stationLevels:{...state.profiles[state.market].stationLevels,...Object.fromEntries($$('[data-station]').map(e=>[e.dataset.station,Number(e.value)]))},
    excludedStations:$$('[data-production]').filter(e=>!e.checked).map(e=>e.dataset.production),
    completedTasks:$$('[data-task]').filter(e=>e.checked).map(e=>e.dataset.task)},data);
}
function showSettings(){
  if(!data){toast('行情加载后即可配置角色条件。');return;}
  $('#profile-market').textContent=MARKETS[state.market];renderProfileInputs(state.profiles[state.market]);settingsTab('stations');$('#settings').showModal();
}
function showInfo(title,html){$('#info-title').textContent=title;$('#info-content').innerHTML=html;$('#info-dialog').showModal();}
function toggleFavorite(id){const list=state.favorites[state.market],index=list.indexOf(id);if(index<0)list.push(id);else list.splice(index,1);persist();render(true);if(detailRow?.item.id===id){const button=$('#detail-content [data-favorite]');if(button)button.innerHTML=icon('star')+(index<0?'已收藏':'收藏');}toast(index<0?'已收藏；收藏页仍按价值排序。':'已取消收藏');}
function showFilters(){
  const c=criteria(),quick=inQuicklook(),mod=moduleForPage(state.page);
  $('#filters-title').textContent=quick?'跑刀速览筛选':'筛选条件';
  $('#quicklook-filter-fields').hidden=!quick;$('#coarse-category-field').hidden=quick;
  $('#clear-filters').textContent=quick?'恢复默认':'清除筛选';
  if(quick)renderQuicklookTypeChoices(view().quicklookTypes);
  for(const [id,key] of [['min-slot','minSlot'],['min-profit','minProfit'],['budget','budget'],['max-hours','maxHours']])$('#'+id).value=c[key]||'';
  $('#only-executable').checked=c.onlyExecutable||false;$('#fresh-only').checked=c.freshOnly||false;
  $('#category').value=view().category;$('#include-events').checked=view().includeEvents;
  $$('[data-filter-for]').forEach(el=>el.hidden=el.dataset.filterFor==='trades'?!['flips','crafts'].includes(mod):el.dataset.filterFor!==mod);
  $('#min-slot-field').hidden=mod!=='loot'||quick;
  $('#filters').showModal();
}
function exportSettings(){const blob=new Blob([JSON.stringify({version:4,...state,paused:false},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='loot-radar-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importSettings(file){
  try{if(!file||file.size>512000)throw new Error('请选择小于500KB的设置文件');const p=JSON.parse(await file.text());if(![2,3,4].includes(p.version)||!p.profiles)throw new Error('不是本应用的设置备份');
    for(const m of Object.keys(MARKETS)){state.profiles[m]=normalizeProfile(p.profiles[m]);state.favorites[m]=safeIds(p.favorites?.[m]);state.workspaceViews[m]=Object.fromEntries(Object.entries(migrateWorkspaceViews(p,m)).map(([k,v])=>[k,safeView(v)]));state.views[m]=safeView(p.views?.[m]);}
    for(const m of Object.keys(MARKETS)){for(const v of Object.values(state.workspaceViews[m]))Object.assign(v,{includeEvents:state.views[m].includeEvents});}
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
  if(target.dataset.clearFilter){const key=target.dataset.clearFilter,v=view();if(key==='events')allViews().forEach(x=>x.includeEvents=false);else if(key==='category')v[key]='all';else view().criteria[key]=0;syncControls();rebuild();render();persist();}
  if(target.dataset.more){limit[target.dataset.more]+=40;render(true);}
  if(target.hasAttribute('data-reset')||target.id==='reset-visible-filters')resetCurrentFilters();
  if(target.hasAttribute('data-retry'))refresh(true);
  if(target.dataset.days){chartDays=Number(target.dataset.days);$$('[data-days]').forEach(b=>b.classList.toggle('active',Number(b.dataset.days)===chartDays));historyDetail();}
  if(target.dataset.quicklookView){view().quicklookView=target.dataset.quicklookView;animateNext=true;render();persist();}
  if(target.dataset.quicklookPreset||target.id==='quicklook-default'){
    const preset=QUICKLOOK_PRESETS[target.dataset.quicklookPreset]||{types:DEFAULT_SCAVENGING_CATEGORIES};
    view().quicklookTypes=[...preset.types];animateNext=true;render();persist();
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
$('#search').addEventListener('input',e=>{view().search=e.target.value;render();persist();});
$('#refresh').addEventListener('click',()=>refresh(true));$('#apply-pending').addEventListener('click',applyPending);
$('#pause').addEventListener('click',()=>{state.paused=!state.paused;$('#pause').setAttribute('aria-pressed',String(state.paused));$('#pause').innerHTML=icon(state.paused?'play':'pause');const label=state.paused?'恢复自动应用行情':'暂停自动应用行情';$('#pause').setAttribute('aria-label',label);$('#pause').title=label;toast(state.paused?'自动更新已暂停':'自动更新已恢复');queueApply();});
$('#theme').addEventListener('click',()=>{state.theme=state.theme==='light'?'dark':'light';syncControls();persist();});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口不支持全屏，可放大浏览器窗口。');}});
$('#priority-info').addEventListener('click',()=>showInfo('拾取优先级',`<p class="priority-weights">${Object.entries({availability:'常见程度',value:'单格价值',short:'短期涨价'}).map(([key,label])=>`<span>${label} <b>${Math.round(PRIORITY_WEIGHTS[key]*100)}%</b></span>`).join(' · ')}</p>`));
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
  if(inQuicklook())view().quicklookTypes=$$('[data-quicklook-type]').filter(el=>el.checked).map(el=>el.dataset.quicklookType);
  else view().category=$('#category').value;
  view().criteria={minSlot:inQuicklook()?0:Number($('#min-slot').value)||0,minProfit:Number($('#min-profit').value)||0,budget:Number($('#budget').value)||0,maxHours:Number($('#max-hours').value)||0,onlyExecutable:$('#only-executable').checked,freshOnly:$('#fresh-only').checked};
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
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){if(e.target.dataset.fallback){const fallback=e.target.dataset.fallback;delete e.target.dataset.fallback;e.target.src=fallback;return;}e.target.style.opacity='.15';e.target.title='图片暂不可用';}},true);
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
icons();syncControls();persist();loading();refresh();setInterval(()=>{if(!busy)refresh();},300000);
