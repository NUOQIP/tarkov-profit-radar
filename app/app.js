import { MARKETS,CATEGORIES,collectLoot,collectFlips,collectCrafts,analyzeHistory,normalizeProfile,profitStability,scenario } from '/engine.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const KEY='loot-radar-v2',params=new URLSearchParams(location.search);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(v)?Math.round(v).toLocaleString('zh-CN'):'—';
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
  return {category:Object.hasOwn(CATEGORIES,v.category)?v.category:'all',filter:['short','long','favorites'].includes(v.filter)?v.filter:'all',
    stack:v.stack==='full'?'full':'single',search:typeof v.search==='string'?v.search.slice(0,200):'',
    flipType:['buy','barter'].includes(v.flipType)?v.flipType:'all',includeEvents:v.includeEvents===true,
    criteria:{minSlot:n(c.minSlot),minProfit:n(c.minProfit),budget:n(c.budget),maxHours:n(c.maxHours),onlyExecutable:c.onlyExecutable===true,freshOnly:c.freshOnly===true}};
}
const state={
 market:Object.hasOwn(MARKETS,params.get('market'))?params.get('market'):Object.hasOwn(MARKETS,saved.market)?saved.market:'pve',
 profiles:Object.fromEntries(Object.keys(MARKETS).map(k=>[k,normalizeProfile(saved.profiles?.[k])])),
 views:Object.fromEntries(Object.keys(MARKETS).map(k=>[k,safeView(saved.views?.[k])])),favorites:{},hidden:{},
 theme:['light','dark'].includes(saved.theme)?saved.theme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),paused:false
};
for(const market of Object.keys(MARKETS)){state.favorites[market]=safeIds(saved.favorites?.[market]);state.hidden[market]=safeIds(saved.hidden?.[market]);}
function view(){return state.views[state.market] ||= {category:'all',filter:'all',stack:'single',search:'',flipType:'all',includeEvents:false,criteria:{}};}
function criteria(){return view().criteria||{};}
function options(){return {...state.profiles[state.market],stack:view().stack,onlyExecutable:criteria().onlyExecutable===true,includeEvents:view().includeEvents===true,allowDelayedTrades:true};}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('设备存储不可用，这次设置仅保留到页面关闭。');}}
let data=null,rows={loot:[],flips:[],crafts:[]},visible={loot:[],flips:[],crafts:[]},limit={loot:40,flips:30,crafts:30},sequence=0,busy=false,lastInteraction=0;
let historyBook={},ledger=[],signalCache=new Map(),pendingSnapshot=null,pendingSignals=null,detailRow=null,chartDays=7,toastTimer,applyTimer;
let signalsLoading=false,signalsInfo={checked:0,total:0},detailSequence=0;
const histories=new Map(),historyRequests=new Map();
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
async function api(path,market=state.market){const response=await fetch(`/api/${path}${path.includes('?')?'&':'?'}market=${market}`);const result=await response.json();if(!response.ok)throw new Error(result.error||'请求失败');return result;}
function syncControls(){
  const v=view();if(!CATEGORIES[v.category]&&v.category!=='all')v.category='all';
  if(!['all','short','long','favorites'].includes(v.filter))v.filter='all';
  $('#search').value=v.search||'';$('#stack').value=v.stack==='full'?'full':'single';$('#flip-type').value=v.flipType||'all';$('#include-events').checked=v.includeEvents===true;
  $$('[data-market]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.market===state.market)));
  document.documentElement.dataset.theme=state.theme;$('#theme').innerHTML=icon(state.theme==='light'?'moon':'sun');
}
function rebuild(){if(!data)return;signalCache.clear();rows={loot:collectLoot(data,options()),flips:collectFlips(data,options()),crafts:collectCrafts(data,options())};}
function historyFor(item){return histories.get(`${state.market}:${item.id}`)||historyBook[item.id];}
function signal(row){
  const key=row.id;if(signalCache.has(key))return signalCache.get(key);
  const h=historyFor(row.item),s=h?.points?analyzeHistory(h.points,row.item,data,options()):{short:false,long:false,points:[]};
  const stable=row.kind==='loot'?{long:s.long,reason:s.longReason,days:s.longDays}:profitStability(ledger,row,data,options());
  const result={...s,long:stable.long,longReason:stable.reason,longDays:stable.days};signalCache.set(key,result);return result;
}
const aliases={ledx:'检眼镜',gpu:'显卡',bitcoin:'比特币',sugar:'白糖',water:'水',filter:'滤芯',led:'ledx',xianka:'显卡',baitang:'白糖',lvxin:'滤芯',shuixing:'水',yaoshi:'钥匙',yiliaobao:'医疗包',zhentou:'注射器'};
function matches(row){
  const v=view(),c=criteria(),i=row.item;
  if(state.hidden[state.market].includes(i.id))return false;
  if(v.category!=='all'&&v.category!==i.category)return false;
  if(v.filter==='favorites'&&!state.favorites[state.market].includes(i.id))return false;
  if((v.filter==='short'||v.filter==='long')&&!signal(row)[v.filter])return false;
  if(row.kind==='loot'&&((c.minSlot||0)>row.slotValue||(c.freshOnly&&row.status!=='可参考')))return false;
  if(row.kind!=='loot'&&((c.minProfit||0)>row.profit||(c.budget>0&&row.purchase>c.budget)))return false;
  if(row.kind==='craft'&&c.maxHours>0&&row.hours>c.maxHours)return false;
  if(row.kind==='flip'&&v.flipType!=='all'&&(v.flipType==='barter')!==Boolean(row.recipe))return false;
  const term=(v.search||'').trim().toLowerCase();if(!term)return true;
  const text=[i.name,i.shortName,i.english,i.slug,row.trader?.name,row.trader?.slug,row.station?.name,...(row.recipe||[]).map(m=>`${m.item.name} ${m.item.english}`)].join(' ').toLowerCase();
  return term.split(/\s+/).every(t=>text.includes(t)||text.includes(aliases[t]||'\0'));
}
function spark(points){if(!points?.length)return '';const list=points.slice(-40),lo=Math.min(...list.map(p=>p.priceMin)),hi=Math.max(...list.map(p=>p.priceMin));const d=list.map((p,i)=>`${i?'L':'M'}${i/(list.length-1||1)*52} ${14-(p.priceMin-lo)/(hi-lo||1)*12}`).join(' ');return `<svg viewBox="0 0 53 16" class="spark" aria-label="近期报价走势"><path d="${d}"/></svg>`;}
function tags(r,s){return (r.item.eventOnly||r.eventOnly?'<span class="tag event-tag">活动限定</span>':'')+(s.short?`<span class="tag short-tag">${icon('trend')}涨价 ${percent(s.premium)}</span>`:'')+(s.long?`<span class="tag long-tag">${r.kind==='loot'?'长期高值':'长期稳定'}</span>`:'');}
function metric(label,value){return `<div><label>${label}</label><b>${value}</b></div>`;}
function card(r,index){
  const i=r.item,s=signal(r),loot=r.kind==='loot',craft=r.kind==='craft',fav=state.favorites[state.market].includes(i.id);
  const label=loot?(r.status==='报价延迟'?'延迟报价 / 格':r.fleaNet===null?'商人底价 / 格':'净到手 / 格'):craft?(r.fuel===null?'扣燃料前 / 小时':'预计净利 / 小时'):'预计净利 / 次';
  const value=loot?fmt(r.slotValue):sign(craft?r.hourly:r.profit);
  const actor=craft?r.station:r.trader;
  const route=loot?'':`<div class="route">${image(actor?.image)}<span>${esc(actor?.name||'未知')} ${craft?'Lv.':'LL'}${r.level} · ${craft?'制作':r.recipe?'兑换':'直购'}</span><span>${craft?duration(r.seconds)+' · ×'+r.count:'限购 '+(r.limit??'未知')}</span></div>`;
  const ingredients=r.recipe?`<div class="ingredients">${r.recipe.slice(0,6).map(m=>`<span class="ingredient" title="${esc(m.item.name)} · ${m.tool?'可复用工具':esc(m.source)}">${image(m.item.image)}<span>${esc(m.item.shortName)} <i>×${m.count}</i>${m.tool?' ⌁':''}</span></span>`).join('')}${r.recipe.length>6?`<span class="ingredient">+${r.recipe.length-6} 项</span>`:''}</div>`:'';
  const metrics=loot?metric('跳蚤报价 / 个',fmt(i.price))+metric(`${esc(r.channel)}净到手`,fmt(r.net))+metric(`${i.width} × ${i.height} 格`,r.count>1?`满叠 ${r.count} 件`:'单件 / 单发'):
    metric(options().materialMode==='owned'?'材料可卖净值':craft?'材料成本':'进货成本',fmt(r.purchase))+metric(craft?(r.fuel===null?'每批扣燃料前':'每批净利润'):'跳蚤挂价',craft?sign(r.profit):fmt(i.price*r.count))+metric(craft?'产出净到手':'回报率',craft?fmt(r.net):Math.round(r.roi*100)+'%');
  const quoteAt=r.quoteAt||i.scan;
  const quote=r.status==='可参考'?ago(quoteAt):r.status+(quoteAt?' · '+ago(quoteAt):'');
  return `<article class="card ${s.short?'short':s.long?'long':''}" data-row="${esc(r.id)}">
  <div class="card-main" role="button" tabindex="0" data-open="${esc(r.id)}" aria-label="查看${esc(i.name)}明细">
    <div class="item-top"><div class="item-picture">${image(i.image,i.name)}${loot?`<span class="rank">${index+1}</span>`:''}</div><div class="item-info"><div class="item-name" title="${esc(i.name)}">${esc(i.shortName||i.name)}</div><div class="item-category">${tags(r,s)||esc(CATEGORIES[i.category])}</div></div><div class="money"><strong class="${loot?'':'positive'}">${value}</strong><span class="unit">${label}</span></div></div>
    ${route}${ingredients}<div class="metrics">${metrics}</div></div>
    <div class="card-tail"><i class="quote-dot ${r.status==='可参考'?'':'old'}"></i><span class="${r.status==='可参考'?'':'age-old'}" title="所用报价中最旧的时间 ${quoteAt?clock(quoteAt):'未知'}">${esc(quote)}</span>${r.task?'<span title="查看详情中的解锁任务">· 需任务</span>':''}<span class="tail-spacer"></span>${spark(s.points)}<button class="favorite ${fav?'active':''}" data-favorite="${i.id}" aria-label="${fav?'取消收藏':'收藏'}${esc(i.name)}" aria-pressed="${fav}">${icon('star')}</button><button data-open="${esc(r.id)}" aria-label="打开${esc(i.name)}明细">${icon('chevron')}</button></div></article>`;
}
function anchors(){return Object.fromEntries(['loot','flips','crafts'].map(k=>{const el=$('#'+k),top=el.getBoundingClientRect().top;const first=[...el.querySelectorAll('.card')].find(c=>c.getBoundingClientRect().bottom>top);return [k,{top:el.scrollTop,id:first?.dataset.row,offset:first?first.getBoundingClientRect().top-top:0}];}));}
function render(preserve=false){
  if(!data)return;const savedAnchors=preserve?anchors():null,counts={};for(const r of rows.loot)counts[r.item.category]=(counts[r.item.category]||0)+1;
  $('#category').innerHTML=`<option value="all">全部分类 · ${rows.loot.length}</option>`+Object.entries(CATEGORIES).map(([k,n])=>`<option value="${k}">${n} · ${counts[k]||0}</option>`).join('');$('#category').value=view().category;
  const direct=rows.flips.filter(r=>!r.recipe).length;
  $('#overview-loot').textContent=fmt(rows.loot.length);$('#overview-flips').textContent=fmt(rows.flips.length);$('#overview-crafts').textContent=fmt(rows.crafts.length);
  $('#catalog-count').textContent=Object.keys(counts).length+' 类物品';$('#direct-count').textContent=`直购 ${direct} / 兑换 ${rows.flips.length-direct}`;
  const allFuel=rows.crafts.length&&rows.crafts.every(r=>r.fuel!==null);$('#fuel-status').textContent=allFuel?'已扣燃料分摊':'部分收益未扣燃料';$('#fuel-button').innerHTML=allFuel?'调整燃料 '+icon('chevron'):'设置燃料 '+icon('chevron');
  $('#craft-basis').innerHTML=(allFuel?'每小时净利润':'每小时收益')+' '+icon('arrow-down');
  for(const key of ['loot','flips','crafts']){
    visible[key]=rows[key].filter(matches);$('#'+key+'-count').textContent=fmt(visible[key].length);
    let message='尝试放宽分类、预算或解锁条件。',title='暂无符合条件的机会';
    if(view().filter==='favorites'){title='这里还没有收藏';message='点物品右下角的星标，下次就能快速找到。';}
    if(view().filter==='short'){title=signalsLoading?'正在核对短线历史':'尚未确认短期暴涨';message='高单价不等于短线；需要常态价、近期涨幅和两个报价快照共同确认。';}
    if(view().filter==='long'){title=key==='loot'?'长期高值观察中':'长期收益正在积累';message=key==='loot'?'需至少24日有效历史，按现行费率回算每格价值。':'需要配对材料、产物和费率记录，尚未满足条件的机会不会标绿。';}
    $('#'+key).innerHTML=visible[key].slice(0,limit[key]).map(card).join('')||`<div class="empty">${icon(view().filter==='favorites'?'star':'search')}<strong>${title}</strong><p>${message}</p><button data-reset>查看全部</button></div>`;
    if(visible[key].length>limit[key])$('#'+key).insertAdjacentHTML('beforeend',`<button class="load-more" data-more="${key}">继续查看 ${Math.min(40,visible[key].length-limit[key])} 项 ${icon('arrow-down')}</button>`);
    if(savedAnchors){const a=savedAnchors[key],el=$('#'+key),target=[...el.querySelectorAll('.card')].find(c=>c.dataset.row===a.id);el.scrollTop=a.top;if(target)el.scrollTop+=target.getBoundingClientRect().top-el.getBoundingClientRect().top-a.offset;}
    else $('#'+key).scrollTop=0;
  }
  $$('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===view().filter)));
  $('#favorite-count').textContent=state.favorites[state.market].length||'';$('#filter-active').hidden=!Object.values(criteria()).some(Boolean);
  $('#coverage').textContent=`${MARKETS[state.market]} · 全部 ${fmt(data.rawCount)} 个源对象 · ${view().includeEvents?'含已识别活动品':'已识别活动品已隐藏'} · 5 分钟检查`;
  $('#history-status').textContent=signalsLoading?'核对历史…':`历史 ${signalsInfo.checked} / ${signalsInfo.total||'—'}`;
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
    const requested=params.get('item');if(requested&&data&&!detailRow){const row=rows.loot.find(r=>r.item.id===requested);if(row)openDetail(row.id);params.delete('item');}
  }catch(error){if(seq!==sequence)return;warning(`行情暂未更新：${error.message}${data?'。保留上次成功快照。':''}`);$('#status').textContent='等待恢复';if(!data)for(const k of ['loot','flips','crafts'])$('#'+k).innerHTML=`<div class="empty">${icon('info')}<strong>行情暂不可用</strong><p>${esc(error.message)}</p><button data-retry>重试</button></div>`;}
  finally{if(seq===sequence){busy=false;$('#refresh').disabled=false;$('#refresh').classList.remove('spin');}}
}
async function loadSignals(market,seq){
  signalsLoading=true;$('#history-status').textContent='核对历史…';
  try{const book=await api('signals',market);if(state.market!==market||seq!==sequence)return;signalsLoading=false;
    if(reading()){pendingSignals=book;queueApply();}else{historyBook=book.entries||{};signalsInfo=book;signalCache.clear();render(true);}
  }catch{if(state.market===market&&seq===sequence){signalsLoading=false;$('#history-status').textContent='历史暂不可用';}}
}
function loading(){for(const k of ['loot','flips','crafts']){$('#'+k).innerHTML=Array.from({length:3},()=>'<div class="skeleton" aria-label="加载中"><div></div><div></div><div></div><div></div></div>').join('');$('#'+k+'-count').textContent='—';}}
async function getHistory(item,market=state.market){
  const key=`${market}:${item.id}`,old=histories.get(key);if(old&&Date.now()-old.at<300000)return old;if(historyRequests.has(key))return historyRequests.get(key);
  const task=api(`history?id=${item.id}`,market).then(result=>{histories.set(key,result);signalCache.clear();return result;}).finally(()=>historyRequests.delete(key));historyRequests.set(key,task);return task;
}
function stateNote(i){return i.isPreset?'默认整枪预设 · 未折叠':i.uses?`使用上限 ${i.uses} 次 · 报价未区分余次`:i.maxDurability?'报价未区分实际耐久':i.units?'报价未区分剩余容量':CATEGORIES[i.category];}
function dl(entries){return '<dl>'+entries.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')+'</dl>';}
function chartMarkup(points){
  const filtered=(points||[]).filter(p=>p.timestamp>=Date.now()-chartDays*86400000).sort((a,b)=>a.timestamp-b.timestamp);
  if(filtered.length<2)return '<p>当前区间历史不足，暂不绘制趋势。</p>';
  const lo=Math.min(...filtered.map(p=>p.priceMin)),hi=Math.max(...filtered.map(p=>p.priceMin)),first=filtered[0].timestamp,last=filtered.at(-1).timestamp;
  const coords=filtered.map(p=>[6+(p.timestamp-first)/(last-first||1)*376,112-(p.priceMin-lo)/(hi-lo||1)*96]);
  const path=coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return `<svg class="history-chart" viewBox="0 0 390 128" role="img" aria-label="${chartDays}日最低报价走势图"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".17"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="M6 16H382M6 64H382M6 112H382" stroke="var(--line)" fill="none" stroke-dasharray="3 4"/><path d="${path}L382 118L6 118Z" fill="url(#chart-fill)" color="var(--accent)"/><path d="${path}" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linejoin="round"/>${filtered.map((p,index)=>`<circle cx="${coords[index][0]}" cy="${coords[index][1]}" r="3" fill="transparent"><title>${clock(p.timestamp)} · ₽${fmt(p.priceMin)}</title></circle>`).join('')}</svg><div class="chart-caption"><span>${clock(first)}</span><span>低 ₽${fmt(lo)} / 高 ₽${fmt(hi)}</span><span>${clock(last)}</span></div>`;
}
function historyDetail(){
  if(!detailRow||!data)return;const r=detailRow,s=signal(r),h=historyFor(r.item);
  $('#history-content').innerHTML=h?.points?`${chartMarkup(h.points)}<div class="history-summary"><span>7日常态 <strong>₽${fmt(s.baseline)}</strong></span><span>当前溢价 <strong>${percent(s.premium)}</strong></span><span>24h <strong>${percent(s.change24)}</strong></span></div><p>${esc(s.reason)}。${esc(s.longReason||'历史仍在积累。')}</p>`:'<p>正在读取真实历史报价…</p>';
  updateScenario();
}
function updateScenario(){
  if(!detailRow||!$('#target-price'))return;const r=detailRow,target=Number($('#target-price').value),base=signal(r).baseline;
  const values=[['目标挂价',scenario(r,data,options(),target)],['卖价回落 10%',scenario(r,data,options(),target*.9)],['回到7日常态',base?scenario(r,data,options(),base):null]];
  $('#scenario-results').innerHTML=values.map(([name,s])=>`<div><small>${name}</small><b class="${s?.profit<0?'negative':''}">${s?(r.kind==='loot'?fmt(s.net):sign(s.profit)):'—'}</b><small>${r.kind==='loot'?'预计净到手':r.kind==='craft'&&r.fuel===null?'每批未扣燃料':'预计净利润'}</small></div>`).join('');
}
function detailMarkup(r){
  const i=r.item,loot=r.kind==='loot',craft=r.kind==='craft',s=signal(r);
  const costRows=[['跳蚤报价时间',i.scan?clock(i.scan):'未知'],['当前报价数量',fmt(i.offers)],['24小时均价',fmt(i.average)],['占格 / 数量',`${i.width} × ${i.height} / ${r.count}`],['参考状态',esc(stateNote(i))],['跳蚤条件','角色 Lv.'+i.fleaLevel],['出售渠道',esc(loot?r.channel:craft?r.channel:'跳蚤')],['上架手续费',fmt(r.fee)],['商人回收净值',fmt(r.traderNet)]];
  if(!loot)costRows.push(['材料 / 进货成本',fmt(r.purchase)]);
  for(const m of r.recipe||[])costRows.push([image(m.item.image)+esc(m.item.name)+' ×'+m.count,m.tool?`工具 · 首购${m.capital===null?'待核价':' ₽'+fmt(m.capital)}`:`${fmt(m.cost)}<br><small>${esc(m.source)}</small>`]);
  if(craft)costRows.push(['制作基础时长',duration(r.seconds)],['本批燃料分摊',r.fuel===null?'未配置':fmt(r.fuel)]);
  const conditions=r.execution?.missing||[],task=data.tasks?.[r.task];
  return `<div class="detail-identity"><div class="item-picture">${image(i.image,i.name)}</div><div><h2 id="detail-title">${esc(i.name)}</h2><div class="item-category">${esc(CATEGORIES[i.category])} · ${esc(MARKETS[state.market])}</div><div class="item-category">${tags(r,s)}</div></div></div>
  <div class="detail-actions"><button data-favorite="${i.id}">${icon('star')}${state.favorites[state.market].includes(i.id)?'已收藏':'收藏'}</button><button id="share-item">${icon('copy')}复制链接</button><button data-hide="${i.id}">${icon('eyeoff')}隐藏</button></div>
  <div class="detail-metrics"><div class="detail-metric"><small>${loot?'每格净到手':craft?(r.fuel===null?'扣燃料前 / 小时':'预计净利 / 小时'):'预计净利润 / 次'}</small><strong>₽${fmt(loot?r.slotValue:craft?r.hourly:r.profit)}</strong></div><div class="detail-metric"><small>${loot?'整件 / 所选数量净到手':craft?'每批产出净到手':'进货成本'}</small><strong>₽${fmt(loot||craft?r.net:r.purchase)}</strong></div></div>
  <section class="detail-section"><h3>价格走势<div class="chart-controls"><button data-days="7" class="${chartDays===7?'active':''}">7日</button><button data-days="30" class="${chartDays===30?'active':''}">30日</button></div></h3><div id="history-content"></div></section>
  <section class="detail-section"><h3>卖价试算</h3>${i.types.includes('noFlea')?'<p>该物品禁止上跳蚤，使用商人回收估值。</p>':`<div class="scenario-controls"><span>目标单价 ₽</span><input id="target-price" type="number" min="1" step="100" value="${i.price||1}" aria-label="目标挂牌单价"></div><div id="scenario-results" class="scenario-grid"></div>`}</section>
  ${!loot?`<section class="detail-section"><h3>执行条件</h3><div class="condition-list">${conditions.length?conditions.map(t=>`<span class="tag">${esc(t)}</span>`).join(''):'<span class="tag long-tag">已填写的解锁条件满足</span>'}</div>${r.task?`<label class="tool-line"><input type="checkbox" data-task-complete="${r.task}" ${options().completedTasks.includes(r.task)?'checked':''}>已完成 ${esc(task?.name||'解锁任务')}</label><a class="source-link" href="https://tarkov.dev/task/${r.task}" target="_blank" rel="noreferrer">查看任务 ↗</a>`:''}${(r.recipe||[]).filter(m=>m.tool).map(m=>`<label class="tool-line"><input type="checkbox" data-owned-tool="${m.item.id}" ${options().ownedTools.includes(m.item.id)?'checked':''}>我已持有 ${esc(m.item.name)}</label>`).join('')}<p>本轮剩余库存需在游戏内确认；收藏不会代表实际仓库持有。</p></section>`:''}
  <section class="detail-section"><h3>收益拆解</h3>${dl(costRows)}<p style="margin-top:12px">${r.status==='报价延迟'?'含1至6小时的延迟报价，仅供估算；不进入短线或“仅看可执行”。':r.status!=='可参考'?'跳蚤报价不满足当前条件，列表采用商人底价。':''} ${esc(stateNote(i))}。报价为市场扫描结果，不保证实际成交。</p><a class="source-link" href="https://tarkov.dev/item/${encodeURIComponent(i.slug)}?gameMode=${state.market}" target="_blank" rel="noreferrer">核对上游物品资料 ↗</a></section>`;
}
async function openDetail(id){
  const r=Object.values(rows).flat().find(r=>r.id===id);if(!r)return;
  detailRow=r;const request=++detailSequence,market=state.market;
  $('#detail-content').innerHTML=detailMarkup(r);if(!$('#detail-dialog').open)$('#detail-dialog').showModal();historyDetail();
  try{await getHistory(r.item,market);if(request===detailSequence&&market===state.market)historyDetail();}catch(error){if(request===detailSequence&&$('#history-content'))$('#history-content').innerHTML=`<p>历史暂不可用：${esc(error.message)}</p>`;}
}
function showSettings(){
  if(!data){toast('行情加载后即可配置商人与设施。');return;}
  const p=options();$('#profile-market').textContent=MARKETS[state.market];
  for(const [id,key] of [['player-level','playerLevel'],['intelligence','intelligence'],['management','management'],['material-mode','materialMode'],['fuel','fuelPerHour'],['edition','edition']])$('#'+id).value=p[key]??'';
  const traderIds=new Set([...Object.values(data.items).flatMap(i=>i.buy.map(o=>o.trader)),...data.barters.map(b=>b.trader)]);
  $('#trader-settings').innerHTML=Object.values(data.traders).filter(t=>traderIds.has(t.id)).map(t=>`<label><span>${image(t.image)}${esc(t.name)}</span><select data-trader="${t.id}" aria-label="${esc(t.name)}忠诚度"><option value="">未确认</option>${[0,1,2,3,4].map(n=>`<option value="${n}" ${p.traderLevels[t.id]===n?'selected':''}>${n?'LL '+n:'未解锁'}</option>`).join('')}</select></label>`).join('');
  const stationIds=new Set((data.crafts||[]).filter(c=>!['bitcoin-farm','cultist-circle'].includes(data.stations[c.station]?.slug)).map(c=>c.station));
  $('#station-settings').innerHTML=Object.values(data.stations).filter(s=>stationIds.has(s.id)).map(s=>`<div class="station-setting"><span>${image(s.image)}${esc(s.name)}</span><select data-station="${s.id}" aria-label="${esc(s.name)}等级"><option value="">未确认</option>${[0,1,2,3].map(n=>`<option value="${n}" ${p.stationLevels[s.id]===n?'selected':''}>${n?'Lv.'+n:'未建'}</option>`).join('')}</select><input data-station-fuel="${s.id}" type="number" min="0" step="100" value="${p.stationFuel?.[s.id]??''}" placeholder="默认分摊" aria-label="${esc(s.name)}燃料分摊"></div>`).join('');
  const taskIds=new Set([...data.barters,...data.crafts].map(r=>r.taskUnlock).filter(Boolean));
  for(const i of Object.values(data.items))for(const offer of i.buy)if(offer.taskUnlock)taskIds.add(offer.taskUnlock);
  $('#task-settings').innerHTML=[...taskIds].sort((a,b)=>(data.tasks?.[a]?.name||a).localeCompare(data.tasks?.[b]?.name||b,'zh-CN')).map(id=>`<label data-task-label><input type="checkbox" data-task="${id}" ${p.completedTasks.includes(id)?'checked':''}><span>${esc(data.tasks?.[id]?.name||id)}</span></label>`).join('')||'<p class="help">暂未读取到任务资料。</p>';
  $('#task-search').value='';$('#settings').showModal();
}
function showInfo(title,html){$('#info-title').textContent=title;$('#info-content').innerHTML=html;$('#info-dialog').showModal();}
function methodology(){showInfo('计算口径与数据状态',`<h3>行情与收益</h3><p>每5分钟检查更新，逐项显示上游报价时间。单格净值扣除上架费；直购、兑换和制作扣除材料成本。未填燃料时只显示扣燃料前收益。工具首次购置单列，不重复计入每批成本。</p><h3>红色与绿色</h3><p>短线必须比前7个完整日常态至少高20%、比约24小时前高10%，额外净到手至少1万，并有两个不同的近期报价快照确认。</p><p>左列长线依据至少24日的历史报价按现行费率回算，每格2万以上的日期至少占80%。倒货、制作的绿色标签依赖本应用逐步积累的配对成本档案，不把价格史冒充利润史。</p><h3>活动物品与数据完整度</h3><p>活动品保留在数据库。顶部开关控制是否展示已识别的活动限定物品；规则清单仍需随版本维护，不能保证识别全部新活动。报价缺少实际耐久、容量和钥匙余次，需要在游戏中核对。</p><h3>本次核验</h3><p>${data?`市场：${MARKETS[state.market]}<br>快照：${clock(data.fetchedAt)}<br>历史候选：${signalsInfo.checked} / ${signalsInfo.total}<br>收益留档：${ledger.length} 天`:'数据加载中'}</p><h3>刷新保护</h3><p>滚动、打开明细或暂停时，新行情先保留。应用更新时同时重算数值与排序，尽量保持正在看的条目位置。</p>`);}
function toggleFavorite(id){const list=state.favorites[state.market],index=list.indexOf(id);if(index<0)list.push(id);else list.splice(index,1);persist();render(true);if(detailRow?.item.id===id){const button=$('#detail-content [data-favorite]');if(button)button.innerHTML=icon('star')+(index<0?'已收藏':'收藏');}toast(index<0?'已收藏；收藏页仍按价值排序。':'已取消收藏');}
function showFilters(){const c=criteria();for(const [id,key] of [['min-slot','minSlot'],['min-profit','minProfit'],['budget','budget'],['max-hours','maxHours']])$('#'+id).value=c[key]||'';$('#only-executable').checked=c.onlyExecutable||false;$('#fresh-only').checked=c.freshOnly||false;$('#filters').showModal();}
function exportSettings(){const blob=new Blob([JSON.stringify({version:2,...state,paused:false},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='loot-radar-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importSettings(file){
  try{if(!file||file.size>512000)throw new Error('请选择小于500KB的设置文件');const p=JSON.parse(await file.text());if(p.version!==2||!p.profiles)throw new Error('不是本应用的设置备份');
    for(const m of Object.keys(MARKETS)){state.profiles[m]=normalizeProfile(p.profiles[m]);state.favorites[m]=safeIds(p.favorites?.[m]);state.hidden[m]=safeIds(p.hidden?.[m]);state.views[m]=safeView(p.views?.[m]);}
    if(['light','dark'].includes(p.theme))state.theme=p.theme;
    persist();syncControls();rebuild();render(true);$('#settings').close('cancel');toast('已导入角色条件、显示偏好与收藏。');
  }catch(error){toast('导入失败：'+error.message);}
}
document.addEventListener('click',event=>{
  const target=event.target.closest('button,[data-open]');
  if(!target)return;
  if(target.dataset.open)openDetail(target.dataset.open);
  if(target.dataset.favorite)toggleFavorite(target.dataset.favorite);
  if(target.dataset.hide){state.hidden[state.market].push(target.dataset.hide);persist();$('#detail-dialog').close();render(true);toast('已隐藏，可在“我的条件”中恢复。');}
  if(target.dataset.close)$('#'+target.dataset.close).close();
  if(target.dataset.more){limit[target.dataset.more]+=40;render(true);}
  if(target.hasAttribute('data-reset')){view().category='all';view().filter='all';view().search='';view().criteria={};view().flipType='all';syncControls();rebuild();render();persist();}
  if(target.hasAttribute('data-retry'))refresh(true);
  if(target.dataset.days){chartDays=Number(target.dataset.days);$$('[data-days]').forEach(b=>b.classList.toggle('active',Number(b.dataset.days)===chartDays));historyDetail();}
  if(target.dataset.filter){view().filter=target.dataset.filter;render();persist();}
  if(target.dataset.market&&target.dataset.market!==state.market){
    state.market=target.dataset.market;sequence++;detailSequence++;data=null;detailRow=null;historyBook={};ledger=[];signalCache.clear();pendingSnapshot=null;pendingSignals=null;
    signalsInfo={checked:0,total:0};limit={loot:40,flips:30,crafts:30};rows={loot:[],flips:[],crafts:[]};syncControls();loading();warning('');$('#pending').hidden=true;
    for(const id of ['overview-loot','overview-flips','overview-crafts'])$('#'+id).textContent='—';
    history.replaceState(null,'',`?market=${state.market}`);persist();refresh();
  }
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card-main')){e.preventDefault();openDetail(e.target.dataset.open);}if(e.key==='/'&&!$('dialog[open]')&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){e.preventDefault();$('#search').focus();}});
$('.columns').addEventListener('scroll',()=>{lastInteraction=Date.now();if(pendingSnapshot||pendingSignals)queueApply();},true);
$('#detail-dialog').addEventListener('close',()=>{detailRow=null;detailSequence++;signalCache.clear();render(true);if(pendingSnapshot||pendingSignals)queueApply();});
$('#search').addEventListener('input',e=>{view().search=e.target.value;render();persist();});
for(const [id,key] of [['category','category'],['stack','stack'],['flip-type','flipType']])$('#'+id).addEventListener('change',e=>{view()[key]=e.target.value;if(key==='stack')rebuild();render();persist();});
$('#include-events').addEventListener('change',e=>{view().includeEvents=e.target.checked;rebuild();render();persist();});
$('#refresh').addEventListener('click',()=>refresh(true));$('#apply-pending').addEventListener('click',applyPending);
$('#pause').addEventListener('click',()=>{state.paused=!state.paused;$('#pause').setAttribute('aria-pressed',String(state.paused));$('#pause').innerHTML=icon(state.paused?'play':'pause');$('#pause').setAttribute('aria-label',state.paused?'恢复自动应用行情':'暂停自动应用行情');toast(state.paused?'已暂停自动切换，后台继续获取行情。':'已恢复自动应用行情。');if(!state.paused)applyPending();});
$('#theme').addEventListener('click',()=>{state.theme=state.theme==='light'?'dark':'light';syncControls();persist();});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口不支持全屏，可放大浏览器窗口。');}});
$('#settings-button').addEventListener('click',showSettings);$('#fuel-button').addEventListener('click',showSettings);$('#filter-button').addEventListener('click',showFilters);
$('#method-button').addEventListener('click',methodology);$('#history-status').addEventListener('click',methodology);
$('#task-search').addEventListener('input',e=>$$('[data-task-label]').forEach(label=>label.hidden=!label.textContent.toLowerCase().includes(e.target.value.toLowerCase())));
$('#profile-form').addEventListener('submit',e=>{
  if(e.submitter?.value!=='save')return;
  const map=(selector,property)=>Object.fromEntries($$(selector).filter(el=>el.value!=='').map(el=>[el.dataset[property],Number(el.value)]));
  state.profiles[state.market]=normalizeProfile({...state.profiles[state.market],playerLevel:$('#player-level').value,intelligence:$('#intelligence').value,management:$('#management').value,materialMode:$('#material-mode').value,fuelPerHour:$('#fuel').value,edition:$('#edition').value,traderLevels:map('[data-trader]','trader'),stationLevels:map('[data-station]','station'),stationFuel:map('[data-station-fuel]','stationFuel'),completedTasks:$$('[data-task]:checked').map(el=>el.dataset.task)});
  persist();rebuild();render(true);toast('条件已保存，收益已重算。');
});
$('#settings').addEventListener('close',()=>{if(pendingSnapshot||pendingSignals)queueApply();});
$('#filter-form').addEventListener('submit',e=>{if(e.submitter?.value!=='save')return;view().criteria={minSlot:Number($('#min-slot').value)||0,minProfit:Number($('#min-profit').value)||0,budget:Number($('#budget').value)||0,maxHours:Number($('#max-hours').value)||0,onlyExecutable:$('#only-executable').checked,freshOnly:$('#fresh-only').checked};rebuild();render();persist();});
$('#clear-filters').addEventListener('click',()=>{view().criteria={};$('#filters').close();rebuild();render();persist();});
$('#detail-content').addEventListener('input',e=>{if(e.target.id==='target-price')updateScenario();});
$('#detail-content').addEventListener('change',e=>{
  const key=e.target.dataset.taskComplete?'completedTasks':e.target.dataset.ownedTool?'ownedTools':null;if(!key)return;
  const id=e.target.dataset.taskComplete||e.target.dataset.ownedTool,list=state.profiles[state.market][key];
  if(e.target.checked&&!list.includes(id))list.push(id);else if(!e.target.checked)state.profiles[state.market][key]=list.filter(x=>x!==id);
  persist();const previous=detailRow?.id;rebuild();if(previous)openDetail(previous);
});
$('#detail-content').addEventListener('click',async e=>{if(e.target.closest('#share-item')&&detailRow){try{await navigator.clipboard.writeText(`${location.origin}/?market=${state.market}&item=${detailRow.item.id}`);toast('物品链接已复制');}catch{toast('复制不可用，可从地址栏分享网页。');}}});
$('#export-settings').addEventListener('click',exportSettings);$('#import-settings').addEventListener('click',()=>$('#import-file').click());$('#import-file').addEventListener('change',e=>importSettings(e.target.files[0]));
$('#restore-hidden').addEventListener('click',()=>{state.hidden[state.market]=[];persist();render(true);toast('已恢复当前市场的隐藏物品。');});
$('#qq-preview').addEventListener('click',async()=>{try{const feed=await api('feed');showInfo('QQ 资讯接口',`<p>这是预留给 QQ 机器人的只读摘要，尚未绑定机器人或群，也不会自动发送。</p><h3>接口地址</h3><code>${esc(location.origin+'/api/feed?market='+state.market)}</code><h3>当前摘要</h3><pre>${esc(feed.text)}</pre><p>包含市场、税后收益、报价时间和解锁条件，具体群消息权限接入时再配置。</p>`);}catch(error){toast(error.message);}});
window.addEventListener('online',()=>refresh());window.addEventListener('offline',()=>warning('网络已离线，保留上次成功行情。'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&data&&Date.now()-Date.parse(data.fetchedAt)>300000&&!busy)refresh();});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){e.target.style.opacity='.15';e.target.title='图片暂不可用';}},true);
icons();syncControls();loading();refresh();setInterval(()=>{if(!busy)refresh();},300000);
