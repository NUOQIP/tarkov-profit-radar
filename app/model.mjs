export const MARKETS = { pve: 'PVE', regular: 'PVP 常规', 'pvp-season': 'PVP 赛季' };
export const CATEGORIES = {
  weapon: '武器', melee: '近战武器', mods: '武器配件', armor: '护甲 / 头盔', ammo: '弹药 / 投掷物',
  keys: '钥匙 / 门卡', medical: '医疗 / 针剂', food: '食物 / 饮料',
  barter: '交换品', gear: '背包 / 装备', containers: '容器', other: '其他'
};
export const FRESH_MS = 60 * 60 * 1000;
export const LONG_TERM_SLOT_MIN = 30000;
// Explicit, reviewable exclusions. This is not a complete source of spawn availability.
export const EVENT_IDS = new Set([
  '59ef13ca86f77445fd0e2483', '5a43943586f77416ad2f06e2', '5a43957686f7742a2c2f11b0',
  '5df8a6a186f77412640e2e80', '5df8a72c86f77412640e2e83', '5df8a77486f77412672a1e3f',
  '61b9e1aaef9a1b5d6a79899a', '634959225289190e5e773b3b', '655c67ab0d37ca5135388f4b',
  '674d91ce6e862d5a95059ed6', '674da9cf0cb4bcde7103c07b', '67586c61a0c49554ed0bb4a8',
  '6759af0f9c8a538dd70bfae6', '6936fe4a3f4d6dfa3900c33c',
  '68f119c6121d878a2303eee3', '68f11adfcd0babab2c0fb003'
]);
const CURRENCY_IDS = new Set(['5449016a4bdc2d6f028b456f', '5696686a4bdc2da3298b456a', '569668774bdc2da2298b4568', '5d235b4d86f7742e017bc88a']);
const positive = n => Number.isFinite(n) && n > 0;
const values = x => Array.isArray(x) ? x : Object.values(x || {});
export const MODEL_VERSION = '2026-10-21-v5';
export const TRADING_NAMES={prapor:'Prapor',therapist:'Therapist',fence:'Fence',skier:'Skier',peacekeeper:'Peacekeeper',mechanic:'Mechanic',ragman:'Ragman',jaeger:'Jaeger',ref:'Ref'};
export const tradingTraders=data=>values(data.traders).filter(t=>Object.hasOwn(TRADING_NAMES,t.slug));
export const productionStations=data=>values(data.stations).filter(s=>!['bitcoin-farm','cultist-circle'].includes(s.slug)&&(data.crafts||[]).some(c=>c.station===s.id&&positive(c.duration)));
export function normalizeProfile(input = {}) {
  if(!input || typeof input!=='object' || Array.isArray(input)) input={};
  const number = (value, min, max, fallback = null) => value === null || value === '' || value === undefined ? fallback : Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  const levels = (map, max) => Object.fromEntries(Object.entries(map || {}).filter(([k]) => /^[a-z0-9-]{1,64}$/i.test(k)).map(([k,v]) => [k, number(v,0,max,0)]));
  return {
    maxProgress:input.maxProgress!==false,
    progressConfigured:input.progressConfigured===true,
    playerLevel:number(input.playerLevel,1,79), intelligence:input.maxProgress!==false?3:number(input.intelligence,0,3,3),
    management:number(input.management,0,51,0), fuelPerHour:0,
    traderLevels:levels(input.traderLevels,4), stationLevels:levels(input.stationLevels,10), stationFuel:levels(input.stationFuel,10000000),
    completedTasks:(Array.isArray(input.completedTasks)?input.completedTasks:[]).filter(x=>/^[0-9a-f]{24}$/.test(x)),
    ownedTools:(Array.isArray(input.ownedTools)?input.ownedTools:[]).filter(x=>/^[0-9a-f]{24}$/.test(x)),
    excludedStations:(Array.isArray(input.excludedStations)?input.excludedStations:[]).filter(x=>/^[a-z0-9-]{1,64}$/i.test(x)),
    edition:typeof input.edition==='string'?input.edition:'',
    materialMode:input.materialMode==='owned'?'owned':'buy', onlyExecutable:input.onlyExecutable===true, includeEvents:input.includeEvents===true,
    stack:input.stack==='full'?'full':'single'
  };
}
export function stationMaxLevel(station,data) {
  return Number.isFinite(station.maxLevel)?station.maxLevel:Math.max(station.slug==='intelligence-center'?3:0,...(data.crafts||[]).filter(c=>c.station===station.id).map(c=>Number(c.level)||0));
}
export function traderMaxLevel(trader) { return Math.max(1,...(trader.levels||[]).map(l=>Number(l.level)||0)); }
export function profileTaskIds(data) {
  return [...new Set([...Object.keys(data.tasks||{}),...(data.barters||[]).map(r=>r.taskUnlock),...(data.crafts||[]).map(r=>r.taskUnlock),...values(data.items).flatMap(i=>(i.buy||[]).map(o=>o.taskUnlock))])].filter(id=>/^[0-9a-f]{24}$/.test(id||''));
}
// Materialize the full-progress default once. Subsequent user edits remain explicit.
export function resolvePlayerProfile(input,data,reset=false) {
  const p=normalizeProfile(input);
  if(reset || (!p.progressConfigured && p.maxProgress)) {
    p.playerLevel=reset?79:(p.playerLevel||79);
    p.stationLevels=Object.fromEntries(values(data.stations).map(s=>[s.id,stationMaxLevel(s,data)]));
    p.traderLevels=Object.fromEntries(values(data.traders).map(t=>[t.id,traderMaxLevel(t)]));
    p.completedTasks=profileTaskIds(data);
  }
  p.maxProgress=false;p.progressConfigured=true;p.stack='single';
  const intelligence=values(data.stations).find(s=>s.slug==='intelligence-center');
  if(intelligence && p.stationLevels[intelligence.id]!==undefined)p.intelligence=p.stationLevels[intelligence.id];
  return p;
}
export function hasFullProgress(profile,data) {
  if(profile.maxProgress)return true;
  return profile.playerLevel>=Math.max(data.flea?.minPlayerLevel||15,...values(data.items).map(i=>i.fleaLevel||0)) &&
    values(data.stations).every(s=>(profile.stationLevels?.[s.id]??-1)>=stationMaxLevel(s,data)) &&
    values(data.traders).every(t=>(profile.traderLevels?.[t.id]??-1)>=traderMaxLevel(t)) &&
    profileTaskIds(data).every(id=>profile.completedTasks?.includes(id));
}
export function resolveTradingProfile(input,data,reset=false) {
  const p=resolvePlayerProfile(input,data,reset);
  p.playerLevel=79;p.intelligence=3;p.edition='';p.materialMode='buy';
  p.stationLevels=Object.fromEntries(values(data.stations).map(s=>[s.id,stationMaxLevel(s,data)]));
  if(reset)p.excludedStations=[];
  return p;
}
export const SCAVENGING_CATEGORIES = {
  barter:'交换用品',food:'饮食',intelligence:'情报',ammoBox:'弹药包',medical:'医疗物品',
  weapon:'武器',melee:'近战武器',mods:'武器配件',armor:'护甲 / 头盔',ammo:'弹药 / 投掷物',
  keys:'钥匙 / 门卡',gear:'背包 / 装备',containers:'容器',poster:'海报',other:'其他'
};
export const DEFAULT_SCAVENGING_CATEGORIES = ['barter','food','intelligence','ammoBox','medical'];
export function normalizeScavengingCategories(selected) {
  return Array.isArray(selected)?[...new Set(selected.filter(k=>Object.hasOwn(SCAVENGING_CATEGORIES,k)))]:[...DEFAULT_SCAVENGING_CATEGORIES];
}
// Disjoint browsing categories. Special equipment and maps stay outside quicklook.
export function scavengingCategory(item) {
  if((item.isPreset && !item.default) || item.currencyOnly) return null;
  const sourceCategories=item.sourceCategories||[];
  const special=sourceCategories.includes('5447e0e74bdc2d3c308b4567');
  const map=sourceCategories.includes('567849dd4bdc2d150f8b456e') || /(?:^|-)maps?(?:-|$)/i.test(item.slug||'') || /地图/.test(item.name||'');
  if(special||map)return null;
  if(item.types?.includes('ammoBox'))return 'ammoBox';
  if(item.types?.includes('poster'))return 'poster';
  if(sourceCategories.includes('5448ecbe4bdc2d60728b4568') || item.types?.includes('intelligence') ||
    (['barter','other'].includes(item.category)&&/情报|intelligence/i.test([item.name,item.english,item.slug].join(' '))))return 'intelligence';
  return Object.hasOwn(SCAVENGING_CATEGORIES,item.category)?item.category:'other';
}
export function isScavengingItem(item, selected = DEFAULT_SCAVENGING_CATEGORIES) {
  const category=scavengingCategory(item);
  return category!==null&&selected.includes(category);
}
export function categoryOf(item, items = {}) {
  const basis = item.properties?.baseItem ? items[item.properties.baseItem] || item : item;
  const t = basis.types || [];
  if(basis.properties?.propertiesType==='ItemPropertiesMelee')return 'melee';
  if (t.includes('gun')) return 'weapon';
  if (t.some(s => ['armor', 'helmet', 'armorPlate'].includes(s))) return 'armor';
  if (t.some(s => ['ammo', 'ammoBox', 'grenade'].includes(s))) return 'ammo';
  if (t.includes('mods')) return 'mods';
  if (t.includes('keys')) return 'keys';
  if (t.some(s => ['meds', 'injectors'].includes(s))) return 'medical';
  if (t.includes('provisions')) return 'food';
  if (t.includes('barter')) return 'barter';
  if (t.includes('container')) return 'containers';
  if (t.some(s => ['wearable', 'rig', 'backpack', 'headphones', 'glasses'].includes(s))) return 'gear';
  return 'other';
}
export function normalizeSnapshot(parts, market, fetchedAt = new Date().toISOString()) {
  const raw = parts.items.data;
  if (!raw?.items || !raw.fleaMarket) throw new Error('物品数据结构不完整');
  const zh = parts.items_zh?.data || {}, en = parts.items_en?.data || {};
  const label = (key, fallback) => zh[key] || en[key] || fallback || key;
  const items = {};
  for (const i of values(raw.items)) {
    const prop = i.properties || {};
    items[i.id] = {
      id: i.id, name: label(i.name, i.normalizedName), shortName: label(i.shortName, i.normalizedName),
      english: en[i.name] || i.normalizedName, slug: i.normalizedName, category: categoryOf(i, raw.items),
      image: i.iconLink, art: i.image512pxLink || i.baseImageLink || i.iconLink, url: i.link, wiki: i.wikiLink, types: i.types || [], sourceCategories:i.categories||[],
      width: i.width, height: i.height, stack: i.stackMaxSize || 1,
      basePrice: i.basePrice, price: i.lastLowPrice, average: i.avg24hPrice,
      low24: i.low24hPrice, high24: i.high24hPrice, change48: i.changeLast48hPercent,
      offers: i.lastOfferCount, scan: i.lastScan, updated: i.updated,
      fleaLevel: Math.max(raw.fleaMarket.minPlayerLevel || 0, i.minLevelForFlea || 0),
      defaultPreset: prop.defaultPreset, baseItem: prop.baseItem, default: prop.default,
      isPreset: (i.types || []).includes('preset'), uses: prop.uses,
      containsItems:(i.containsItems||[]).map(c=>({item:c.item,count:c.count})),
      maxDurability: prop.maxDurability, units: prop.units,
      buy: i.buyFromTrader || [], sell: i.sellToTrader || [],
      eventOnly:EVENT_IDS.has(i.id), currencyOnly:CURRENCY_IDS.has(i.id),
      excluded: EVENT_IDS.has(i.id) || CURRENCY_IDS.has(i.id)
    };
  }
  const traders = {};
  for (const t of values(parts.traders.data)) {
    traders[t.id] = { id: t.id, name: TRADING_NAMES[t.normalizedName] || t.normalizedName, slug:t.normalizedName, image: t.imageLink, resetTime: t.resetTime, levels:t.levels };
  }
  const names = {
    workbench: '工作台', medstation: '医疗站', lavatory: '洗手间', 'nutrition-unit': '营养部',
    'intelligence-center': '情报中心', 'booze-generator': '酿酒器', 'water-collector': '净水器',
    'bitcoin-farm': '比特币矿场', 'christmas-tree': '圣诞树', 'cultist-circle': '邪教徒法阵',
    library:'图书馆',gym:'健身房','shooting-range':'靶场','scav-case':'Scav宝箱','gear-rack':'装备架',
    heating:'供暖',generator:'发电机',vents:'通风',security:'安全门',stash:'仓库','rest-space':'休息区',
    illumination:'照明','hall-of-fame':'荣誉大厅','air-filtering-unit':'空气过滤器','solar-power':'太阳能',
    'defective-wall':'破损的墙','weapon-rack':'武器架'
  };
  const stations = {};
  for (const s of values(parts.hideout.data)) {
    stations[s.id] = { id: s.id, name: names[s.normalizedName] || s.normalizedName, slug: s.normalizedName, image: s.imageLink, maxLevel:Math.max(0,...(s.levels||[]).map(l=>l.level||0)) };
  }
  return {
    version: 2, profileMetadataVersion:2, imageVersion:1, categoryMetadataVersion:1, modelVersion:MODEL_VERSION, market, fetchedAt, source: 'https://json.tarkov.dev/' + market + '/items',
    rawCount: Object.keys(raw.items).length, flea: raw.fleaMarket, items, traders, stations,
    barters: parts.barters.data, crafts: parts.crafts.data, history: {},
    tasks:parts.tasks?.data || {}, taskNames:parts.tasks_zh?.data || {}
  };
}
export function fleaFee(base, price, flea, intelligence = 0, management = 0, count = 1) {
  if (!positive(base) || !positive(price) || !positive(count) ||
      !Number.isFinite(flea.sellOfferFeeRate) || !Number.isFinite(flea.sellRequirementFeeRate)) return null;
  let p0 = Math.log10(base / price), pr = Math.log10(price / base);
  if (price < base) p0 **= 1.08;
  else pr **= 1.08;
  const discount = intelligence >= 3 ? 1 - (.01 * management + 1) * .3 : 1;
  if (discount <= 0) return null;
  return Math.round((base * flea.sellOfferFeeRate * 4 ** p0 * count +
    price * flea.sellRequirementFeeRate * 4 ** pr * count) * discount);
}
// Ammo-box basePrice is the packaging alone. Count the contained rounds once,
// using handbook values, not flea quotes or the rounds' flea eligibility.
// Presets already include their components in basePrice and must not be summed.
export function feeBasePrice(item, data) {
  if (!item.types?.includes('ammoBox')) return positive(item.basePrice) ? item.basePrice : null;
  if (!Number.isFinite(item.basePrice) || item.basePrice < 0 || !item.containsItems?.length) return null;
  let total=item.basePrice;
  for(const content of item.containsItems){
    const round=data.items[typeof content.item==='string'?content.item:content.item?.id];
    if(!round || !positive(round.basePrice) || !positive(content.count))return null;
    total+=round.basePrice*content.count;
  }
  return positive(total)?total:null;
}
export const lowOfferCount = item => Number.isFinite(item.offers) && item.offers >= 0 && item.offers < 10;
export function isShortOpportunity(row, trend) {
  return Boolean(trend?.short && row.status!=='报价延迟' &&
    (row.kind==='loot' ? row.channel==='跳蚤' && positive(row.fleaNet) : positive(row.profit)));
}
export function quoteStatus(i, data, options = {}, now = Date.now()) {
  if (!data.flea.enabled || i.types.includes('noFlea')) return '禁售';
  if (!options.maxProgress && options.playerLevel && options.playerLevel < i.fleaLevel) return '等级不足';
  if (!positive(i.price) || !Number.isFinite(Date.parse(i.scan))) return '无报价';
  const age = now - Date.parse(i.scan);
  if (age > (options.allowDelayed ? 6 * FRESH_MS : FRESH_MS)) return '报价过期';
  if (Date.parse(i.scan) > now + 60000) return '时间异常';
  if (!Number.isFinite(i.offers) || i.offers < 1) return '报价不足';
  if (positive(i.average) && (i.price > i.average * 3 || i.price < i.average * .25)) return '报价异常';
  return age > FRESH_MS ? '报价延迟' : '可参考';
}
export function sale(i, data, options = {}, count = 1, now = Date.now()) {
  const status = quoteStatus(i, data, options, now);
  const fee = ['可参考', '报价延迟'].includes(status) ? fleaFee(feeBasePrice(i,data), i.price, data.flea, options.intelligence || 0, options.management || 0, count) : null;
  const fleaNet = fee === null ? null : i.price * count - fee;
  const vendor = i.sell.filter(x => positive(x.priceRUB)).sort((a, b) => b.priceRUB - a.priceRUB)[0];
  const traderNet = vendor ? vendor.priceRUB * count : null;
  const useFlea = fleaNet !== null && fleaNet > (traderNet ?? 0);
  return {
    status, fee, fleaNet, traderNet, vendor,
    net: useFlea ? fleaNet : traderNet,
    channel: useFlea ? '跳蚤' : vendor ? (data.traders[vendor.trader]?.name || '商人') : '无有效售价'
  };
}
export function collectLoot(data, options = {}, now = Date.now()) {
  const rows = [];
  for (const i of values(data.items)) {
    if (isExcluded(i,options) || !positive(i.width * i.height)) continue;
    if (i.isPreset && !i.default) continue;
    if (i.defaultPreset && data.items[i.defaultPreset]) continue;
    const count = options.stack === 'full' ? i.stack : 1;
    const s = sale(i, data, { ...options, allowDelayed: true }, count, now);
    if (!positive(s.net)) continue;
    rows.push({ id: i.id, item: i, ...s, count, slots: i.width * i.height, slotValue: s.net / (i.width * i.height), kind: 'loot' });
  }
  return rows.sort((a, b) => b.slotValue - a.slotValue || a.id.localeCompare(b.id));
}
// The catalog retains every source object, including items with no usable sale price.
// Display preferences filter these rows without removing anything from the snapshot.
export function collectCatalog(data, options = {}, now = Date.now()) {
  return values(data.items).map(i => {
    const count = options.stack === 'full' && positive(i.stack) ? i.stack : 1;
    const slots = positive(i.width) && positive(i.height) ? i.width * i.height : null;
    const s = sale(i, data, {...options, allowDelayed:true}, count, now);
    return {id:i.id, item:i, ...s, kind:'loot', catalog:true, count, slots,
      slotValue:slots !== null && Number.isFinite(s.net) ? s.net / slots : null,
      banned:!data.flea.enabled || i.types.includes('noFlea')};
  }).sort((a,b) => {
    if (a.slotValue === null || b.slotValue === null) {
      if (a.slotValue !== b.slotValue) return a.slotValue === null ? 1 : -1;
    } else if (a.slotValue !== b.slotValue) return b.slotValue - a.slotValue;
    return a.id.localeCompare(b.id);
  });
}
export function filterCatalog(rows, filters = {}, favorites = [], aliases = {}) {
  const terms = String(filters.search || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const starred = new Set(favorites);
  return rows.filter(r => {
    const i = r.item;
    if (i.eventOnly && !filters.includeEvents) return false;
    if (filters.category && filters.category !== 'all' && i.category !== filters.category) return false;
    if (filters.favoritesOnly && !starred.has(i.id)) return false;
    if (filters.availability === 'flea' && r.fleaNet === null) return false;
    if (filters.availability === 'banned' && !r.banned) return false;
    if (filters.availability === 'unpriced' && Number.isFinite(r.net)) return false;
    const text = [i.id,i.name,i.shortName,i.english,i.slug].join(' ').toLowerCase();
    // Known abbreviations match their alias or a full English token (GPU must not match Magpul).
    const words = new Set(text.split(/[^a-z0-9]+/));
    return terms.every(t => aliases[t] ? text.includes(aliases[t]) || words.has(t) : text.includes(t));
  });
}
export function isExcluded(item,options={}) {
  if(item.currencyOnly)return true;
  if(item.eventOnly)return !options.includeEvents;
  return Boolean(item.excluded);
}
export function procurement(item, data, options = {}, now = Date.now()) {
  const status=quoteStatus(item,data,{...options,allowDelayed:options.allowDelayedTrades===true},now);
  let best = ['可参考','报价延迟'].includes(status) ? {cost:item.price,source:'跳蚤',flea:true,status} : null;
  for (const offer of item.buy || []) {
    if (!positive(offer.priceRUB) || !['RUB','USD','EUR'].includes(offer.currency)) continue;
    if (!options.maxProgress && (options.traderLevels?.[offer.trader] ?? -1) < offer.minTraderLevel) continue;
    if (!options.maxProgress && offer.taskUnlock && !options.completedTasks?.includes(offer.taskUnlock)) continue;
    if (offer.gameEditions?.length && !offer.gameEditions.includes(options.edition)) continue;
    if (!best || offer.priceRUB < best.cost) best={cost:offer.priceRUB,source:data.traders[offer.trader]?.name||'商人',flea:false};
  }
  return best;
}
function materials(reqs, data, options, now) {
  const result = [];
  for (const r of reqs || []) {
    const item = data.items[r.item];
    if (!item || isExcluded(item,options) || !positive(r.count)) return null;
    const attr = r.attributes || {};
    // Level-specific dogtags, functional assemblies, etc. need a state-aware quote.
    if (Object.keys(attr).some(k => k !== 'tool')) return null;
    const buy = procurement(item,data,options,now);
    if (attr.tool) { result.push({ ...r, item, tool: true, cost: 0, capital:options.ownedTools?.includes(item.id)?0:buy?.cost ?? null, source:buy?.source }); continue; }
    const owned = options.materialMode==='owned' ? sale(item,data,{...options,allowDelayed:options.allowDelayedTrades===true},1,now) : null;
    const unitCost = owned ? owned.net : buy?.cost;
    if (!positive(unitCost)) return null;
    result.push({ ...r, item, tool: false, unitCost, cost: unitCost * r.count, source:owned?'已有材料可卖净值':buy.source, flea:owned?owned.channel==='跳蚤':buy.flea, status:owned?owned.status:buy.status });
  }
  return result;
}
export function executionStatus(row, data, options = {}) {
  const missing = [];
  if(row.kind==='flip'&&!Number.isFinite(row.profit))missing.push('待估值');
  if(row.status==='报价延迟')missing.push('含延迟报价');
  if (!options.maxProgress && (row.kind==='flip' || row.channel==='跳蚤')) {
    if (!options.playerLevel) missing.push('角色等级未配置');
    else if (options.playerLevel < row.item.fleaLevel) missing.push('跳蚤等级不足');
  }
  if (!options.maxProgress && row.kind==='flip' && (options.traderLevels?.[row.trader?.id] ?? -1) < row.level) missing.push(`${row.trader?.name || '商人'} LL${row.level}`);
  if (!options.maxProgress && row.kind==='craft' && (options.stationLevels?.[row.station?.id] ?? -1) < row.level) missing.push(`${row.station?.name || '设施'} Lv.${row.level}`);
  if (!options.maxProgress && row.task && !options.completedTasks?.includes(row.task)) missing.push('任务待确认');
  if (row.editions?.length && !row.editions.includes(options.edition)) missing.push('版本资格待确认');
  if (row.recipe?.some(m=>m.tool && !options.ownedTools?.includes(m.item.id))) missing.push('工具待确认');
  if (!options.maxProgress && row.recipe?.some(m=>m.flea && (!options.playerLevel || options.playerLevel<m.item.fleaLevel))) missing.push('材料跳蚤等级待确认');
  return { executable:missing.length===0, missing };
}
export function collectFlips(data, options = {}, now = Date.now()) {
  const rows = [];
  if (data.flea.foundInRaidRequired) return rows;
  const add = (id, item, purchase, trader, level, limit, task, recipe, count = 1, editions = []) => {
    // A trader preset is an acquisition route for the same weapon. Use its
    // standard complete-gun quote, not a stripped receiver or a rare build quote.
    // Attachment proceeds are deliberately excluded.
    if(item.isPreset&&item.category==='weapon'&&data.items[item.baseItem]){
      const base=data.items[item.baseItem];
      const standard=data.items[base.defaultPreset];
      if(standard){
        item={...item,...Object.fromEntries(['basePrice','price','average','low24','high24','offers','scan','updated','fleaLevel'].map(k=>[k,standard[k]])),
          types:[...new Set([...item.types,...base.types,...standard.types])],valuationId:standard.id,valuationName:base.name};
      }else{
        item={...item,basePrice:null,price:null,average:null,scan:null,offers:null,valuationId:base.id,valuationName:base.name};
      }
    }
    const tradeOptions={...options,allowDelayed:options.allowDelayedTrades===true};
    if (isExcluded(item,options)) return;
    const s=sale(item,data,tradeOptions,count,now);
    const profit=Number.isFinite(s.fleaNet)&&Number.isFinite(purchase)?s.fleaNet-purchase:null;
    if(!options.includeUnavailable&&(!Number.isFinite(profit)||(!options.includeLosses&&!positive(profit))))return;
    const row={ id, kind: 'flip', item, ...s, net:s.fleaNet, count, purchase, profit, roi:positive(purchase)&&profit!==null?profit/purchase:null,
      trader: data.traders[trader] || { id:trader, name: '未知商人' }, level, limit, task, recipe, editions, isBarter:id.startsWith('barter-') };
    row.eventOnly=Boolean(item.eventOnly||recipe?.some(m=>m.item.eventOnly));
    if(recipe?.some(m=>!m.tool&&m.flea&&m.status==='报价延迟'))row.status='报价延迟';
    row.quoteAt=oldestQuote(row);
    row.execution=executionStatus(row,data,options);
    if (!options.onlyExecutable || row.execution.executable) rows.push(row);
  };
  for (const item of values(data.items)) {
    for (const [index, offer] of item.buy.entries()) {
      if (!positive(offer.priceRUB) || !['RUB', 'USD', 'EUR'].includes(offer.currency)) continue;
      add('buy-' + item.id + '-' + index, item, offer.priceRUB, offer.trader, offer.minTraderLevel, offer.buyLimit, offer.taskUnlock, null,1,offer.gameEditions || []);
    }
  }
  for (const b of data.barters || []) {
    const item = data.items[b.offeredItem?.item];
    if (!item) continue;
    const recipe = materials(b.requiredItems, data, options, now);
    if (!recipe && !options.includeUnavailable) continue;
    const purchase = recipe?recipe.reduce((sum, r) => sum + r.cost, 0):null;
    if (positive(purchase)||options.includeUnavailable) add('barter-' + b.id, item, purchase, b.trader, b.minTraderLevel, b.buyLimit, b.taskUnlock, recipe, b.offeredItem.count,b.gameEditions || []);
  }
  return rows.sort((a,b)=>(b.profit??-Infinity)-(a.profit??-Infinity)||a.id.localeCompare(b.id));
}
export function collectCrafts(data, options = {}, now = Date.now()) {
  const rows = [];
  for (const c of data.crafts || []) {
    const item = data.items[c.productItem?.item], station = data.stations[c.station];
    if(options.excludedStations?.includes(c.station))continue;
    if(['bitcoin-farm','cultist-circle'].includes(station?.slug))continue;
    if (!item || isExcluded(item,options) || !positive(c.duration) || (c.requiredQuestItems || []).length || (station?.slug === 'christmas-tree' && !options.includeEvents)) continue;
    const recipe = materials(c.requiredItems, data, options, now);
    if (!recipe) continue;
    const count = c.productItem.count;
    const s = sale(item, data, {...options,allowDelayed:options.allowDelayedTrades===true}, count, now);
    if (!positive(s.net)) continue;
    const purchase = recipe.reduce((sum, r) => sum + r.cost, 0), hours = c.duration / 3600;
    const margin = s.net - purchase;
    const fuel=0;
    const profit = margin;
    if (!Number.isFinite(profit) || (!options.includeLosses && !positive(profit))) continue;
    const row={ id: 'craft-' + c.id, kind: 'craft', item, ...s, count, purchase, recipe, margin, fuel,
      profit, hourly: profit / hours, hours, seconds: c.duration, station, level: c.level, task: c.taskUnlock, editions:c.gameEditions || [] };
    row.eventOnly=Boolean(item.eventOnly||recipe.some(m=>m.item.eventOnly)||station?.slug==='christmas-tree');
    if(recipe.some(m=>!m.tool&&m.flea&&m.status==='报价延迟'))row.status='报价延迟';
    row.quoteAt=oldestQuote(row);
    row.execution=executionStatus(row,data,options);
    if (!options.onlyExecutable || row.execution.executable) rows.push(row);
  }
  return rows.sort((a, b) => b.profit - a.profit || b.hourly - a.hourly || a.id.localeCompare(b.id));
}
function oldestQuote(row){
  const stamps=[row.channel==='跳蚤'||row.kind==='flip'?row.item.scan:null,...(row.recipe||[]).filter(m=>!m.tool&&m.flea).map(m=>m.item.scan)].filter(s=>Number.isFinite(Date.parse(s)));
  return stamps.sort((a,b)=>Date.parse(a)-Date.parse(b))[0] || row.item.scan;
}
const median = a => {
  const s = [...a].sort((x, y) => x - y); if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export function analyzeHistory(points, item, data, options = {}, now = Date.now()) {
  const day = 86400000;
  const current = { priceMin: item.price, timestamp: Date.parse(item.scan), offerCount: item.offers };
  const clean = [...new Map([...(points || []), current].filter(p => positive(p.priceMin) && Number.isFinite(p.timestamp) && p.timestamp <= now + 60000)
    .map(p => [p.timestamp, p])).values()].sort((a, b) => a.timestamp - b.timestamp);
  const baselineRows = clean.filter(p => p.timestamp >= now - 8 * day && p.timestamp < now - day && p.offerCount >= 3);
  const days = new Set(baselineRows.map(p => Math.floor(p.timestamp / day)));
  const base = median(baselineRows.map(p => p.priceMin));
  const priorDay = median(clean.filter(p => p.timestamp >= now - 30 * 3600000 && p.timestamp <= now - 18 * 3600000).map(p => p.priceMin));
  const referenceRows=baselineRows.filter(p=>p.timestamp<now-6*day);
  const reference7=median(referenceRows.map(p=>p.priceMin));
  const change7=reference7?item.price/reference7-1:null;
  const recent = clean.filter(p => p.timestamp >= now - 4 * FRESH_MS && p.offerCount >= 3);
  const confirmed=recent.filter(p=>reference7 && p.priceMin>=reference7*1.2);
  const independent=confirmed.length>=2 && confirmed.at(-1).timestamp-confirmed[0].timestamp>=15*60000;
  let short = false, premium = base ? item.price / base - 1 : null;
  let extraNet=null;
  if (days.size >= 6 && referenceRows.length >= 2 && independent && item.offers>=3 && quoteStatus(item, data, options, now) === '可参考') {
    const baseFee = fleaFee(feeBasePrice(item,data), reference7, data.flea, options.intelligence || 0, options.management || 0);
    const currentFee = fleaFee(feeBasePrice(item,data), item.price, data.flea, options.intelligence || 0, options.management || 0);
    if(baseFee!==null&&currentFee!==null)extraNet=(item.price-currentFee)-(reference7-baseFee);
    short = extraNet!==null && change7 >= .2 && extraNet>0 && extraNet>=Math.max(0,reference7-baseFee)*.1 &&
      recent.slice(-2).every(p => p.priceMin >= reference7*1.2);
  }
  const completeDay = Math.floor(now / day) * day;
  const daily = new Map();
  for(const p of clean) if(p.timestamp>=completeDay-30*day && p.timestamp<completeDay && p.offerCount>=3) {
    const k=Math.floor(p.timestamp/day);if(!daily.has(k))daily.set(k,[]);daily.get(k).push(p.priceMin);
  }
  const stackCount=options.stack==='full'?(item.stack||1):1;
  const historicalSlots=[...daily.values()].map(list=>{
    const price=median(list),fee=fleaFee(feeBasePrice(item,data),price,data.flea,options.intelligence||0,options.management||0,stackCount);
    return fee===null?null:(price*stackCount-fee)/(item.width*item.height);
  }).filter(Number.isFinite).sort((a,b)=>a-b);
  const stableDays=historicalSlots.filter(n=>n>=LONG_TERM_SLOT_MIN).length;
  const lowerQuartile=historicalSlots[Math.floor(historicalSlots.length*.25)] ?? null;
  const currentFee=fleaFee(feeBasePrice(item,data),item.price,data.flea,options.intelligence||0,options.management||0,stackCount);
  const currentSlot=currentFee===null?0:(item.price*stackCount-currentFee)/(item.width*item.height);
  const long=historicalSlots.length>=24 && stableDays/historicalSlots.length>=.8 && lowerQuartile>=LONG_TERM_SLOT_MIN && currentSlot>=LONG_TERM_SLOT_MIN &&
    ['可参考','报价延迟'].includes(quoteStatus(item,data,{...options,allowDelayed:true},now)) && !item.excluded;
  return { short, long, baseline: base, premium, reference7,change7,extraNet,priorDay, change24:priorDay?item.price/priorDay-1:null, days: days.size, confirmations: recent.length,
    reason: days.size < 6 || referenceRows.length<2 ? '7日历史覆盖不足' : !independent ? '尚无两个间隔15分钟的近期高价快照' : short ? '比约7日前涨价至少20%，税后增收已确认' : '未满足7日急涨条件',
    longDays:historicalSlots.length, lowerQuartile, longMedian:median(historicalSlots),
    longReason: long ? '30日价格按现行费率回算：至少24日有效，至少80%日期每格净值达到3万。不是历史实际成交利润。' : `30日高值观察 ${historicalSlots.length}/30 天；当前尚未满足每格3万的稳定高值条件。`,
    points: clean.filter(p => p.timestamp >= now - 30 * day).slice(-600) };
}
export function scenario(row,data,options={},price=row.item.price) {
  if(!positive(price)||row.item.types.includes('noFlea')||!data.flea.enabled) return null;
  const fee=fleaFee(feeBasePrice(row.item,data),price,data.flea,options.intelligence||0,options.management||0,row.count);
  if(fee===null) return null;
  const fleaNet=price*row.count-fee;
  const net=row.kind==='flip'?fleaNet:Math.max(fleaNet,row.traderNet || 0);
  const profit=row.kind==='loot'?net:Number.isFinite(row.purchase)?net-row.purchase-(row.fuel||0):null;
  return {price,fee,net,profit,hourly:row.hours&&profit!==null?profit/row.hours:null,slotValue:net/(row.item.width*row.item.height)};
}
export function profitStability(records,row,data,options={},now=Date.now()) {
  const expected=JSON.stringify([MODEL_VERSION,data.flea.sellOfferFeeRate,data.flea.sellRequirementFeeRate,feeBasePrice(row.item,data),row.count,row.seconds||0,
    row.recipe?.map(m=>[m.item.id,m.count,m.tool]) || [],row.level,row.task||null,row.editions||[]]);
  const today=new Date(now).toISOString().slice(0,10),cutoff=new Date(now-30*86400000).toISOString().slice(0,10);
  const matching=(records||[]).filter(d=>d.date>=cutoff&&d.date<today).map(d=>d.rows?.[row.id]).filter(r=>r?.version===expected && r.count>=4);
  const values=matching.map(r=>r.min).sort((a,b)=>a-b);
  const lower=values[Math.floor(values.length*.25)]??null;
  const compatible=(options.historyFullProgress??hasFullProgress(options,data)) && (options.intelligence||0)===3 && (options.management||0)===0 && !options.edition;
  const long=compatible && options.materialMode!=='owned' && matching.length>=24 && values.filter(v=>v>0).length/values.length>=.8 && lower>10000;
  return {long,days:matching.length,lower,reason:long?'至少24日配对成本记录支持稳定收益':!compatible?'当前角色条件与历史收益档案不同，暂不判定长线':`配对收益档案 ${matching.length}/30 天（每日至少4次）`};
}
