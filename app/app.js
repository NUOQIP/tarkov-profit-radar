import { MARKETS, CATEGORIES, collectLoot, collectFlips, collectCrafts, analyzeHistory } from '/model.mjs';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const storageKey = 'eft-radar-live-v1';
let saved = {}; try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
const state = { market: Object.hasOwn(MARKETS, saved.market) ? saved.market : 'pve', category: 'all', filter: 'all', stack: 'single', search: '', flipType: 'all', profiles: saved.profiles || {} };
let data = null, requestSequence = 0, busy = false, scanning = false, scanRun = 0;
let lists = { loot: [], flips: [], crafts: [] }, limits = { loot: 40, flips: 30, crafts: 30 };
const opened = new Set(), histories = new Map(), historyRequests = new Map();
const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString('zh-CN') : '—';
const sign = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const esc = value => String(value ?? '').replace(/[&<>"']/g, s => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[s]));
const clock = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
const timeAgo = value => {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (!Number.isFinite(minutes)) return '未知';
  return minutes < 60 ? minutes + ' 分钟前' : minutes < 1440 ? Math.floor(minutes / 60) + ' 小时前' : Math.floor(minutes / 1440) + ' 天前';
};
const image = (url, name, className='item-img') => /^https:\/\/assets\.tarkov\.dev\//.test(url || '') ? `<img class="${className}" src="${esc(url)}" alt="${esc(name)}" loading="lazy" decoding="async">` : `<span class="${className}" aria-label="${esc(name)}"></span>`;
const metric = (name, value) => `<div><span>${name}</span><b>${value}</b></div>`;
const rows = entries => `<dl>${entries.map(([name,value])=>`<dt>${name}</dt><dd>${value}</dd>`).join('')}</dl>`;
const options = () => ({ ...(state.profiles[state.market] || {}), stack: state.stack });
const signal = item => {
  const entry = histories.get(state.market + ':' + item.id);
  return entry?.points && data ? analyzeHistory(entry.points,item,data,options()) : entry?.signal;
};
function persist() { try { localStorage.setItem(storageKey, JSON.stringify({ market: state.market, profiles: state.profiles })); } catch {} }
function stateNote(i) {
  if (i.isPreset) return '整套默认预设 · 未折叠';
  if (i.maxDurability) return '按满耐久估值';
  if (i.uses) return '按满次数估值 · ' + i.uses + ' 次';
  if (i.units) return '按满容量估值';
  return CATEGORIES[i.category];
}
function historyMarkup(item) {
  const h = histories.get(state.market + ':' + item.id);
  if (!h) return '<p>正在核对历史报价…</p>';
  if (h.error) return '<p>历史暂不可用：' + esc(h.error) + '</p>';
  const s = signal(item);
  const prices = s.points.map(p => p.priceMin), max = Math.max(...prices, 1);
  const bars = s.points.filter((_, index) => index % Math.max(1, Math.ceil(s.points.length / 45)) === 0);
  return `<p>${esc(s.reason)}${s.baseline ? ' · 7 日基准 ₽' + fmt(s.baseline) + ' · 当前 ' + sign(s.premium * 100) + '%' : ''}</p>
    ${bars.length ? `<div class="history-bar" role="img" aria-label="最近八日最低报价走势">${bars.map(p => `<span style="height:${Math.max(3,p.priceMin / max * 100)}%" title="${clock(p.timestamp)} ₽${fmt(p.priceMin)}"></span>`).join('')}</div>` : ''}
    <p>${esc(s.longReason)}</p>`;
}
function renderEntry(r, rank) {
  const i = r.item, s = signal(i), isLoot = r.kind === 'loot', craft = r.kind === 'craft';
  const titleValue = isLoot ? fmt(r.slotValue) : sign(craft ? r.hourly : r.profit);
  const lootLabel = r.status === '报价延迟' ? '延迟报价净值 / 格' : r.fleaNet === null && !['禁售','等级不足'].includes(r.status) ? '商人底价 / 格' : '预计净到手 / 格';
  const primaryLabel = isLoot ? lootLabel : craft ? (r.fuel === null ? '未扣燃料 / 小时' : '预计净利 / 小时') : '预计净利润 / 次';
  const badge = s?.short ? '短线 · 涨价确认' : '';
  const top = `<div class="item-top">${image(i.image,i.name)}<div><div class="name">${esc(i.shortName || i.name)}</div><div class="meta">${esc(isLoot ? stateNote(i) : CATEGORIES[i.category])}</div><div class="signal">${badge}</div></div><div class="money"><div class="main-value">${titleValue}</div><div class="meta">${primaryLabel}</div></div></div>`;
  const quote = `<span class="${['报价过期','报价延迟'].includes(r.status) ? 'old' : ''}">${r.status === '可参考' ? '报价 ' + timeAgo(i.scan) : esc(r.status) + (i.scan ? ' · ' + timeAgo(i.scan) : '')}</span>`;
  let body = '', detail = [];
  if (isLoot) {
    body = `<div class="metrics">${metric('跳蚤报价 / 个',fmt(i.price))}${metric(esc(r.channel)+'净到手',fmt(r.net))}${metric(`${i.width}×${i.height} · ${r.count>1?'满堆叠':'单个'}`,r.count+' 件 / '+r.slots+' 格')}</div>`;
    detail = [['完整名称',esc(i.name)],['跳蚤报价时间',i.scan?clock(i.scan):'未知'],['跳蚤条件','Lv.'+i.fleaLevel],['当前报价数',fmt(i.offers)],['24小时均价',fmt(i.average)],['上架费（所选数量）',fmt(r.fee)],['跳蚤净到手',fmt(r.fleaNet)],['商人净到手',fmt(r.traderNet)],['每格净到手',fmt(r.slotValue)]];
  } else {
    const actor = craft ? r.station : r.trader;
    const route = craft ? `${esc(actor?.name || '设施')} Lv.${r.level}` : `${esc(actor?.name || '商人')} LL${r.level} · ${r.recipe?'兑换':'直购'}`;
    const suffix = craft ? `${Math.floor(r.seconds/3600)?Math.floor(r.seconds/3600)+'时':''}${Math.ceil(r.seconds%3600/60)}分 · ×${r.count}` : `每轮限 ${r.limit ?? '未知'}`;
    body += `<div class="route">${image(actor?.image,'','avatar')}<span>${route}</span><span class="right">${suffix}</span></div>`;
    if (r.recipe) body += `<div class="ingredients">${r.recipe.map(m=>`<span>${image(m.item.image,'','avatar')}${esc(m.item.shortName || m.item.name)} ×${m.count}${m.tool?'（工具）':''}</span>`).join('')}</div>`;
    body += `<div class="metrics">${metric(craft?'材料成本':'进货成本',fmt(r.purchase))}${metric(craft?(r.fuel===null?'每批未扣燃料':'每批净利'):'跳蚤挂价',craft?sign(r.profit):fmt(i.price*r.count))}${metric(craft?'产出售价':'回报率',craft?fmt(r.net):Math.round(r.roi*100)+'%')}</div>`;
    const requiredFleaLevel=Math.max(i.fleaLevel,...(r.recipe||[]).filter(m=>!m.tool).map(m=>m.item.fleaLevel));
    detail = [['完整名称',esc(i.name)],['出售渠道',craft?esc(r.channel):'跳蚤'],['产出数量',r.count],['产物 / 材料跳蚤条件','Lv.'+requiredFleaLevel],['挂牌收入',fmt(i.price*r.count)],['上架费',fmt(r.fee)],['材料 / 进货成本',fmt(r.purchase)]];
    for(const m of r.recipe || []) detail.push([`${esc(m.item.name)} ×${m.count}`,m.tool?'工具不消耗':fmt(m.cost)]);
    if (craft) detail.push(['燃料分摊',r.fuel === null ? '未配置，尚未扣除' : fmt(r.fuel)],['基础制作时间',Math.floor(r.seconds/60)+'分'+r.seconds%60+'秒']);
    detail.push([craft&&r.fuel===null?'每批扣燃料前收益':'预计净利润',fmt(r.profit)]);
    if (r.task) detail.push(['解锁任务',`<a href="https://tarkov.dev/task/${encodeURIComponent(r.task)}" target="_blank" rel="noreferrer">查看任务条件 ↗</a>`]);
  }
  return `<details class="entry ${s?.short?'short':''}" data-key="${esc(r.id)}" data-item="${i.id}" ${opened.has(r.id)?'open':''}>
    <summary>${top}${body}<div class="tail">${quote}<span>${!isLoot&&r.task?'需任务解锁 · ':''}${isLoot?'#'+rank+' · ':''}明细 ⌄</span></div></summary>
    <div class="detail">${rows(detail)}${r.status==='报价延迟'?'<p>这里使用 1 至 6 小时内的最近报价作参考，不是当前成交保证，也不用于倒货或短线推荐。</p>':r.status!=='可参考'?'<p>当前跳蚤报价未用于计算。这里显示可确认的商人底价，不代表该物品只能卖这个价。</p>':''}<div class="history">${opened.has(r.id)?historyMarkup(i):''}</div><p><a href="https://tarkov.dev/item/${encodeURIComponent(i.slug)}?gameMode=${encodeURIComponent(state.market)}" target="_blank" rel="noreferrer">核对数据源 ↗</a></p></div>
  </details>`;
}
function match(r) {
  if (state.category !== 'all' && r.item.category !== state.category) return false;
  if (state.filter === 'long') return false;
  if (state.filter === 'short' && !signal(r.item)?.short) return false;
  if (!state.search.trim()) return true;
  const term = state.search.trim().toLowerCase();
  return [r.item.name,r.item.english,r.item.shortName,r.station?.name,r.trader?.name,...(r.recipe||[]).map(m=>m.item.name)].join(' ').toLowerCase().includes(term);
}
function render(preserveScroll = false) {
  if (!data) return;
  const scroll = Object.fromEntries(['loot','flips','crafts'].map(k=>[k,$('#'+k).scrollTop]));
  const rawLoot = collectLoot(data,options()), rawFlips = collectFlips(data,options()), rawCrafts = collectCrafts(data,options());
  lists = { loot:rawLoot.filter(match), flips:rawFlips.filter(match).filter(r=>state.flipType==='all'||(state.flipType==='barter'?r.recipe:!r.recipe)), crafts:rawCrafts.filter(match) };
  const counts = {};
  for (const r of rawLoot) counts[r.item.category] = (counts[r.item.category] || 0) + 1;
  $('#category').innerHTML = `<option value="all">全部物品 · ${rawLoot.length}</option>` + Object.entries(CATEGORIES).map(([key,name])=>`<option value="${key}">${name} · ${counts[key]||0}</option>`).join('');
  $('#category').value=state.category;
  $('#catalog-count').textContent='覆盖 '+Object.keys(counts).length+' 类';
  for(const key of ['loot','flips','crafts']){
    $('#'+key+'-count').textContent=lists[key].length+' 项';
    let empty = state.filter==='long' ? '还没有 30 日可核验的收益记录，暂不标长线。' : state.filter==='short' ? (scanning?'正在核对历史报价…':'暂未确认符合条件的短期暴涨物品。') : '没有符合当前分类、报价时效和成本条件的机会。';
    $('#'+key).innerHTML = lists[key].slice(0,limits[key]).map((r,index)=>renderEntry(r,index+1)).join('') || `<p class="empty">${empty}</p>`;
    if(lists[key].length>limits[key]) $('#'+key).insertAdjacentHTML('beforeend',`<button type="button" class="load-more" data-more="${key}">继续查看 ${Math.min(40,lists[key].length-limits[key])} 项</button>`);
    $('#'+key).scrollTop=preserveScroll?scroll[key]:0;
  }
  const direct=rawFlips.filter(r=>!r.recipe).length, barter=rawFlips.length-direct;
  $('#craft-basis').textContent=Number.isFinite(options().fuelPerHour)?'预计净利润 / 小时 ↓':'扣燃料前收益 / 小时 ↓';
  $('#fuel-button').textContent=Number.isFinite(options().fuelPerHour)?'燃料 '+fmt(options().fuelPerHour)+'/时':'设置燃料';
  $('#coverage').textContent=`${data.rawCount} 个源物品 · 筛后 ${rawLoot.length} 项 · 直购 ${direct} / 兑换 ${barter} · 历史证据不足时不染色`;
  $$('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===state.filter)));
  // Missing artwork should retain the readable name, never substitute a different item.
  $$('.entry img').forEach(img=>img.addEventListener('error',()=>{img.style.opacity='.2';},{once:true}));
}
async function getHistory(item, market=state.market) {
  const key=market+':'+item.id;
  if(historyRequests.has(key))return historyRequests.get(key);
  if(histories.has(key)&&Date.now()-histories.get(key).at<300000)return histories.get(key);
  const targetData=data, config=options();
  const task=(async()=>{
    try {
      const response=await fetch('/api/history?market='+encodeURIComponent(market)+'&id='+item.id);
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      const value={at:Date.now(),points:result.points,signal:analyzeHistory(result.points,item,targetData,config)};
      histories.set(key,value);return value;
    } catch(error){const value={at:Date.now(),error:error.message};histories.set(key,value);return value;}
    finally{historyRequests.delete(key);}
  })();historyRequests.set(key,task);return task;
}
async function scanShort(){
  if(!data||scanning)return;
  scanning=true;const market=state.market,run=++scanRun;
  const candidates=collectLoot(data,options()).filter(r=>r.status==='可参考'&&r.item.change48>=10&&(!state.category||state.category==='all'||r.item.category===state.category)).sort((a,b)=>b.item.change48-a.item.change48).slice(0,12);
  for(let index=0;index<candidates.length;index+=2){
    if(state.market!==market||run!==scanRun)return;
    $('#status').textContent='核对短线历史 '+Math.min(index+2,candidates.length)+' / '+candidates.length;
    await Promise.all(candidates.slice(index,index+2).map(r=>getHistory(r.item,market)));
    if(run!==scanRun)return;
    if(state.market===market)render(true);
  }
  scanning=false;
  if(state.market===market){render(true);updateStatus();}
}
function updateStatus(){if(data)$('#status').textContent=`获取 ${clock(data.fetchedAt)} · 5分钟检查`; }
async function refresh(){
  const seq=++requestSequence,market=state.market;busy=true;$('#refresh').disabled=true;$('#status').textContent='正在获取 '+MARKETS[market]+' 行情…';
  try{
    const response=await fetch('/api/snapshot?market='+encodeURIComponent(market));
    const result=await response.json();if(!response.ok)throw new Error(result.error||'获取失败');
    if(seq!==requestSequence)return;
    data=result;$('#warning').hidden=!result.warning;$('#warning').textContent=result.warning||'';
    render(true);updateStatus();
    if(state.filter==='short')scanShort();
  }catch(error){
    if(seq!==requestSequence)return;
    $('#warning').hidden=false;$('#warning').textContent='行情获取失败：'+error.message+(data?'；保留上次成功数据。':'；稍后可重试。');
    if(!data) for(const key of ['loot','flips','crafts'])$('#'+key).innerHTML='<p class="empty">数据暂不可用，没有填入替代价格。</p>';
    $('#status').textContent='获取失败';
  }finally{if(seq===requestSequence){busy=false;$('#refresh').disabled=false;}}
}
function settings(){
  const profile=options();
  $('#player-level').value=profile.playerLevel||'';$('#intelligence').value=profile.intelligence||0;
  $('#management').value=profile.management||0;$('#fuel').value=Number.isFinite(profile.fuelPerHour)?profile.fuelPerHour:'';
  $('#settings').showModal();
}
$('#market').value=state.market;
$('#market').addEventListener('change',e=>{
  state.market=e.target.value;data=null;opened.clear();persist();requestSequence++;scanRun++;scanning=false;
  for(const key of ['loot','flips','crafts']){$('#'+key).innerHTML='<p class="empty">正在加载 '+MARKETS[state.market]+'，不沿用其他市场价格…</p>';$('#'+key+'-count').textContent='';}
  $('#warning').hidden=true;refresh();
});
$('#search').addEventListener('input',e=>{state.search=e.target.value;render();});
$('#category').addEventListener('change',e=>{state.category=e.target.value;scanRun++;scanning=false;render();if(state.filter==='short')scanShort();});
$('#stack').addEventListener('change',e=>{state.stack=e.target.value;render();});
$('#flip-type').addEventListener('change',e=>{state.flipType=e.target.value;render();});
$$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;render();if(state.filter==='short')scanShort();}));
$('#refresh').addEventListener('click',refresh);$('#settings-button').addEventListener('click',settings);$('#fuel-button').addEventListener('click',settings);
$('#settings').addEventListener('close',()=>{
  if($('#settings').returnValue!=='save')return;
  state.profiles[state.market]={
    playerLevel:$('#player-level').value?Number($('#player-level').value):null,
    intelligence:Number($('#intelligence').value),management:Number($('#management').value),
    fuelPerHour:$('#fuel').value===''?null:Number($('#fuel').value)
  };persist();histories.clear();render(true);
});
$('.columns').addEventListener('click',event=>{
  const more=event.target.closest('[data-more]');
  if(more){limits[more.dataset.more]+=40;render(true);return;}
  const summary=event.target.closest('.entry > summary');if(!summary)return;
  const detail=summary.parentElement,market=state.market;
  requestAnimationFrame(async()=>{
    if(!detail.open){opened.delete(detail.dataset.key);return;}
    opened.add(detail.dataset.key);
    const item=data?.items[detail.dataset.item];if(!item)return;
    detail.querySelector('.history').innerHTML=historyMarkup(item);
    await getHistory(item,market);
    if(state.market!==market)return;
    $$(`.entry[data-item="${item.id}"]`).forEach(entry=>{
      entry.classList.toggle('short',Boolean(signal(item)?.short));
      entry.querySelector('.signal').textContent=signal(item)?.short?'短线 · 涨价确认':'';
      if(entry.open)entry.querySelector('.history').innerHTML=historyMarkup(item);
    });
  });
});
setInterval(()=>{if(!busy)refresh();},300000);
refresh();
