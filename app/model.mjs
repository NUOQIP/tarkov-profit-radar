export const MARKETS = { pve: 'PVE', regular: 'PVP 常规', 'pvp-season': 'PVP 赛季' };
export const CATEGORIES = {
  weapon: '武器', mods: '武器配件', armor: '护甲 / 头盔', ammo: '弹药 / 投掷物',
  keys: '钥匙 / 门卡', medical: '医疗 / 针剂', food: '食物 / 饮料',
  barter: '交换品', gear: '背包 / 装备', containers: '容器', other: '其他'
};
export const FRESH_MS = 60 * 60 * 1000;
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
export function categoryOf(item, items = {}) {
  const basis = item.properties?.baseItem ? items[item.properties.baseItem] || item : item;
  const t = basis.types || [];
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
      image: i.iconLink, url: i.link, wiki: i.wikiLink, types: i.types || [],
      width: i.width, height: i.height, stack: i.stackMaxSize || 1,
      basePrice: i.basePrice, price: i.lastLowPrice, average: i.avg24hPrice,
      low24: i.low24hPrice, high24: i.high24hPrice, change48: i.changeLast48hPercent,
      offers: i.lastOfferCount, scan: i.lastScan, updated: i.updated,
      fleaLevel: Math.max(raw.fleaMarket.minPlayerLevel || 0, i.minLevelForFlea || 0),
      defaultPreset: prop.defaultPreset, baseItem: prop.baseItem, default: prop.default,
      isPreset: (i.types || []).includes('preset'), uses: prop.uses,
      maxDurability: prop.maxDurability, units: prop.units,
      buy: i.buyFromTrader || [], sell: i.sellToTrader || [],
      excluded: EVENT_IDS.has(i.id) || CURRENCY_IDS.has(i.id)
    };
  }
  const traders = {};
  for (const t of values(parts.traders.data)) {
    traders[t.id] = { id: t.id, name: t.normalizedName, image: t.imageLink, resetTime: t.resetTime };
  }
  const names = {
    workbench: '工作台', medstation: '医疗站', lavatory: '洗手间', 'nutrition-unit': '营养部',
    'intelligence-center': '情报中心', 'booze-generator': '酿酒器', 'water-collector': '净水器',
    'bitcoin-farm': '比特币矿场', 'christmas-tree': '圣诞树', 'cultist-circle': '邪教徒法阵'
  };
  const stations = {};
  for (const s of values(parts.hideout.data)) {
    stations[s.id] = { id: s.id, name: names[s.normalizedName] || s.normalizedName, slug: s.normalizedName, image: s.imageLink };
  }
  return {
    version: 1, market, fetchedAt, source: 'https://json.tarkov.dev/' + market + '/items',
    rawCount: Object.keys(raw.items).length, flea: raw.fleaMarket, items, traders, stations,
    barters: parts.barters.data, crafts: parts.crafts.data, history: {}
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
  return Math.ceil(base * flea.sellOfferFeeRate * 4 ** p0 * count +
    price * flea.sellRequirementFeeRate * 4 ** pr * count) * discount;
}
export function quoteStatus(i, data, options = {}, now = Date.now()) {
  if (!data.flea.enabled || i.types.includes('noFlea')) return '禁售';
  if (options.playerLevel && options.playerLevel < i.fleaLevel) return '等级不足';
  if (!positive(i.price) || !Number.isFinite(Date.parse(i.scan))) return '无报价';
  const age = now - Date.parse(i.scan);
  if (age > (options.allowDelayed ? 6 * FRESH_MS : FRESH_MS)) return '报价过期';
  if (Date.parse(i.scan) > now + 60000) return '时间异常';
  if (!Number.isFinite(i.offers) || i.offers < 3) return '报价不足';
  if (positive(i.average) && (i.price > i.average * 3 || i.price < i.average * .25)) return '报价异常';
  return age > FRESH_MS ? '报价延迟' : '可参考';
}
export function sale(i, data, options = {}, count = 1, now = Date.now()) {
  const status = quoteStatus(i, data, options, now);
  const fee = ['可参考', '报价延迟'].includes(status) ? fleaFee(i.basePrice, i.price, data.flea, options.intelligence || 0, options.management || 0, count) : null;
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
    if (i.excluded || !positive(i.width * i.height)) continue;
    if (i.isPreset && !i.default) continue;
    if (i.defaultPreset && data.items[i.defaultPreset]) continue;
    const count = options.stack === 'full' ? i.stack : 1;
    const s = sale(i, data, { ...options, allowDelayed: true }, count, now);
    if (!positive(s.net)) continue;
    rows.push({ id: i.id, item: i, ...s, count, slots: i.width * i.height, slotValue: s.net / (i.width * i.height), kind: 'loot' });
  }
  return rows.sort((a, b) => b.slotValue - a.slotValue || a.id.localeCompare(b.id));
}
function materials(reqs, data, options, now) {
  const result = [];
  for (const r of reqs || []) {
    const item = data.items[r.item];
    if (!item || item.excluded || !positive(r.count)) return null;
    const attr = r.attributes || {};
    // Level-specific dogtags, functional assemblies, etc. need a state-aware quote.
    if (Object.keys(attr).some(k => k !== 'tool')) return null;
    if (attr.tool) { result.push({ ...r, item, tool: true, cost: 0 }); continue; }
    if (quoteStatus(item, data, options, now) !== '可参考') return null;
    // Flea-only procurement avoids silently assuming all traders/tasks are unlocked.
    const unitCost = Math.max(item.price, item.average || item.price);
    result.push({ ...r, item, tool: false, unitCost, cost: unitCost * r.count, source: '跳蚤较保守买入价' });
  }
  return result;
}
export function collectFlips(data, options = {}, now = Date.now()) {
  const rows = [];
  if (data.flea.foundInRaidRequired) return rows;
  const add = (id, item, purchase, trader, level, limit, task, recipe, count = 1) => {
    if (item.excluded || quoteStatus(item, data, options, now) !== '可参考') return;
    const s = sale(item, data, options, count, now);
    const profit = s.fleaNet === null ? null : s.fleaNet - purchase;
    if (!positive(profit)) return;
    rows.push({ id, kind: 'flip', item, ...s, count, purchase, profit, roi: profit / purchase,
      trader: data.traders[trader] || { name: '未知商人' }, level, limit, task, recipe });
  };
  for (const item of values(data.items)) {
    for (const [index, offer] of item.buy.entries()) {
      if (!positive(offer.priceRUB) || !['RUB', 'USD', 'EUR'].includes(offer.currency)) continue;
      add('buy-' + item.id + '-' + index, item, offer.priceRUB, offer.trader, offer.minTraderLevel, offer.buyLimit, offer.taskUnlock, null);
    }
  }
  for (const b of data.barters || []) {
    const item = data.items[b.offeredItem?.item];
    if (!item) continue;
    const recipe = materials(b.requiredItems, data, options, now);
    if (!recipe) continue;
    const purchase = recipe.reduce((sum, r) => sum + r.cost, 0);
    if (positive(purchase)) add('barter-' + b.id, item, purchase, b.trader, b.minTraderLevel, b.buyLimit, b.taskUnlock, recipe, b.offeredItem.count);
  }
  return rows.sort((a, b) => b.profit - a.profit);
}
export function collectCrafts(data, options = {}, now = Date.now()) {
  const rows = [];
  for (const c of data.crafts || []) {
    const item = data.items[c.productItem?.item], station = data.stations[c.station];
    if (!item || item.excluded || !positive(c.duration) || (c.requiredQuestItems || []).length || station?.slug === 'christmas-tree') continue;
    const recipe = materials(c.requiredItems, data, options, now);
    if (!recipe) continue;
    const count = c.productItem.count;
    const s = sale(item, data, options, count, now);
    if (!positive(s.net)) continue;
    const purchase = recipe.reduce((sum, r) => sum + r.cost, 0), hours = c.duration / 3600;
    const margin = s.net - purchase;
    const fuelKnown = Number.isFinite(options.fuelPerHour) && options.fuelPerHour >= 0;
    const fuel = fuelKnown ? hours * options.fuelPerHour : null;
    const profit = fuelKnown ? margin - fuel : margin;
    if (!positive(profit)) continue;
    rows.push({ id: 'craft-' + c.id, kind: 'craft', item, ...s, count, purchase, recipe, margin, fuel,
      profit, hourly: profit / hours, hours, seconds: c.duration, station, level: c.level, task: c.taskUnlock });
  }
  return rows.sort((a, b) => b.hourly - a.hourly);
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
  const baselineRows = clean.filter(p => p.timestamp >= now - 8 * day && p.timestamp < now - day);
  const days = new Set(baselineRows.map(p => Math.floor(p.timestamp / day)));
  const base = median(baselineRows.map(p => p.priceMin));
  const priorDay = median(clean.filter(p => p.timestamp >= now - 30 * 3600000 && p.timestamp <= now - 18 * 3600000).map(p => p.priceMin));
  const recent = clean.filter(p => p.timestamp >= now - 4 * FRESH_MS && p.offerCount >= 3);
  let short = false, premium = base ? item.price / base - 1 : null;
  if (days.size >= 6 && priorDay && recent.length >= 2 && quoteStatus(item, data, options, now) === '可参考') {
    const baseFee = fleaFee(item.basePrice, base, data.flea, options.intelligence || 0, options.management || 0);
    const currentFee = fleaFee(item.basePrice, item.price, data.flea, options.intelligence || 0, options.management || 0);
    short = baseFee !== null && currentFee !== null && premium >= .2 && item.price / priorDay >= 1.1 &&
      (item.price - currentFee) - (base - baseFee) >= 10000 &&
      recent.slice(-2).every(p => p.priceMin >= base * 1.2 && p.priceMin >= priorDay * 1.1);
  }
  return { short, long: false, baseline: base, premium, priorDay, days: days.size, confirmations: recent.length,
    reason: days.size < 6 ? '7日历史覆盖不足' : recent.length < 2 ? '缺少近4小时的两个独立报价快照' : short ? '近期涨价已确认' : '未满足短期飙升条件',
    longReason: '尚无30日配对成本与税费快照，不标长期稳定利润',
    points: clean.filter(p => p.timestamp >= now - 8 * day).slice(-120) };
}
