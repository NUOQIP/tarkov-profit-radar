import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSnapshot, MARKETS } from './model.mjs';
const here = dirname(fileURLToPath(import.meta.url)), cacheDir = join(here, '..', '.cache');
await mkdir(cacheDir, { recursive: true });
const memory = new Map(), pending = new Map(), histories = new Map();
const TTL = 300000;
async function json(path) {
  const response = await fetch('https://json.tarkov.dev/' + path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('数据源返回 ' + response.status);
  return response.json();
}
async function snapshot(market) {
  let cached = memory.get(market);
  if (!cached) {
    try {
      cached = JSON.parse(await readFile(join(cacheDir, market + '.json'), 'utf8'));
      if (cached.market === market && cached.version === 1) memory.set(market, cached);
      else cached = null;
    } catch { cached = null; }
  }
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < TTL) return cached;
  if (pending.has(market)) return pending.get(market);
  const promise = (async () => {
    try {
      const names = ['items', 'items_zh', 'items_en', 'traders', 'hideout', 'barters', 'crafts'];
      const parts = {};
      for (let i = 0; i < names.length; i += 3) {
        await Promise.all(names.slice(i, i + 3).map(async name => { parts[name] = await json(market + '/' + name); }));
      }
      const result = normalizeSnapshot(parts, market);
      memory.set(market, result);
      await writeFile(join(cacheDir, market + '.json'), JSON.stringify(result));
      return result;
    } catch (error) {
      if (cached) return { ...cached, warning: '获取失败，正在显示上次成功数据：' + error.message };
      throw error;
    } finally { pending.delete(market); }
  })();
  pending.set(market, promise);
  return promise;
}
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/model.mjs', ['model.mjs', 'text/javascript; charset=utf-8']]
]);
const server = createServer(async (req, res) => {
  const send = (status, data, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
  };
  try {
    if (req.method !== 'GET') return send(405, { error: '只支持读取' });
    const url = new URL(req.url, 'http://127.0.0.1');
    if (files.has(url.pathname)) {
      const [name, type] = files.get(url.pathname);
      return send(200, await readFile(join(here, name)), type);
    }
    const market = url.searchParams.get('market') || 'pve';
    if (!Object.hasOwn(MARKETS, market)) return send(400, { error: '未知市场' });
    if (url.pathname === '/api/snapshot') return send(200, await snapshot(market));
    if (url.pathname === '/api/history') {
      const id = url.searchParams.get('id');
      if (!/^[0-9a-f]{24}$/.test(id || '')) return send(400, { error: '物品ID无效' });
      const key = market + ':' + id, prior = histories.get(key);
      if (prior && Date.now() - prior.at < TTL) return send(200, prior.data);
      const response = await json(market + '/prices/' + id);
      if (!Array.isArray(response.data)) throw new Error('历史数据格式异常');
      const result = { market, id, fetchedAt: new Date().toISOString(), points: response.data };
      histories.set(key, { at: Date.now(), data: result });
      return send(200, result);
    }
    return send(404, { error: '页面不存在' });
  } catch (error) { send(502, { error: error.message }); }
});
const port = Number(process.env.PORT || 8787);
server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
