// Souhrnné počítání bez sledování lidí: server/lib/counts.js (pevný seznam událostí, denní součty, zápis do úložiště
// po dávkách, žádná IP adresa), POST /api/count a GET /api/stats, klient public/js/count.js přes node:vm (nic
// neukládá do prohlížeče) a zapojení v app.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { EVENTS, TTL_DAYS, MAX_BODY, clampDays, makeCounter, memoryCounts, upstashCounts } = await import('../server/lib/counts.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const T0 = Date.UTC(2027, 0, 12, 10, 0, 0);
const DAY = 86400e3;

test('pevný seznam událostí: 33 názvů, jen ty se počítají', () => {
  assert.equal(EVENTS.length, 33);
  assert.equal(new Set(EVENTS).size, 33);
  for (const e of ['app_open', 'view_trips', 'search_done', 'buy_click', 'trip_saved', 'limit_shown', 'plus_offer_click', 'sesit_click', 'price_0', 'price_799', 'look_letsi']) assert.ok(EVENTS.includes(e), e);
  assert.ok(EVENTS.every((e) => /^[a-z0-9_]{3,20}$/.test(e)));
  const c = makeCounter(memoryCounts(), { now: () => T0 });
  assert.equal(c.hit('search_done'), true);
  for (const bad of ['search', 'SEARCH_DONE', 'search_done ', '', null, undefined, 42, ['app_open'], { e: 'app_open' }, 'cnt:2027-01-12:app_open', '__proto__']) assert.equal(c.hit(bad), false, String(bad));
});

test('součet za den (UTC) a stats: dny od nejstaršího, total, čeká-li zápis i po něm stejně', async () => {
  let t = T0 - DAY;
  const c = makeCounter(memoryCounts(), { now: () => t });
  c.hit('app_open'); // 11. 1.
  t = T0;
  for (let i = 0; i < 3; i++) c.hit('search_done');
  c.hit('app_open');
  t = Date.UTC(2027, 0, 12, 23, 59, 59); // pořád 12. 1. UTC
  c.hit('search_done');
  const want = {
    days: [{ day: '2027-01-10', counts: {} }, { day: '2027-01-11', counts: { app_open: 1 } }, { day: '2027-01-12', counts: { app_open: 1, search_done: 4 } }],
    total: { app_open: 2, search_done: 4 },
  };
  assert.deepEqual(await c.stats(3), want, 'před zápisem do úložiště');
  await c.flush();
  assert.deepEqual(await c.stats(3), want, 'po zápisu');
  assert.deepEqual((await c.stats(1)).days, [{ day: '2027-01-12', counts: { app_open: 1, search_done: 4 } }]);
  t = Date.UTC(2027, 0, 13, 0, 0, 1); // po půlnoci UTC nový den
  c.hit('search_done');
  assert.deepEqual((await c.stats(2)).days, [{ day: '2027-01-12', counts: { app_open: 1, search_done: 4 } }, { day: '2027-01-13', counts: { search_done: 1 } }]);
  assert.equal((await c.stats(30)).days.length, 30);
  assert.deepEqual([undefined, null, '', 'abc', '0', '1', '7', '90', '91', '9999', '-3', '2.9'].map(clampDays), [30, 30, 30, 30, 30, 1, 7, 90, 90, 90, 1, 2]);
});

test('do úložiště jde jen klíč cnt:<den>:<událost> a počet – žádná adresa ani zařízení; zápis po dávkách', async () => {
  const calls = [];
  const store = { kind: 'spy', add: async (...a) => { calls.push(a); }, get: async (keys) => keys.map(() => null) };
  const c = makeCounter(store, { now: () => T0 });
  for (let i = 0; i < 5; i++) c.hit('view_flights');
  c.hit('buy_click');
  assert.equal(calls.length, 0, 'událost sama do úložiště nepíše (strop příkazů Upstash)');
  await c.flush();
  assert.deepEqual(calls, [[[['cnt:2027-01-12:view_flights', 5], ['cnt:2027-01-12:buy_click', 1]], TTL_DAYS * 86400]]);
  assert.equal(TTL_DAYS, 400);
  await c.flush();
  assert.equal(calls.length, 1, 'bez nových událostí žádný zápis');
  // hit() dostane jen název události – adresu ani hlavičky z požadavku nemá odkud vzít
  const src = read('server/index.js');
  const branch = src.slice(src.indexOf("if (p === '/api/count')"), src.indexOf("if (p === '/api/stats')"));
  assert.match(branch, /if \(!counter\.hit\(b && b\.e\)\) return sendJson\(req, res, 400,/);
  assert.equal(branch.match(/counter\./g).length, 1);
  assert.doesNotMatch(read('server/lib/counts.js'), /clientIp|headers\[|user-agent|remoteAddress/i);
});

test('výpadek úložiště: událost se přijme, počet počká v paměti a zapíše se příště jednou', async () => {
  let down = true;
  const mem = memoryCounts();
  const store = { kind: 'flaky', add: async (...a) => { if (down) throw new Error('Upstash nedostupný'); return mem.add(...a); }, get: mem.get };
  const c = makeCounter(store, { now: () => T0 });
  assert.equal(c.hit('trip_saved'), true);
  await c.flush();
  assert.deepEqual((await c.stats(1)).total, { trip_saved: 1 });
  c.hit('trip_saved');
  down = false;
  await c.flush();
  await c.flush();
  assert.deepEqual((await c.stats(1)).total, { trip_saved: 2 });
  assert.deepEqual(await mem.get(['cnt:2027-01-12:trip_saved']), [2]);
});

test('čtení, které předběhl zápis, se do mezipaměti neuloží – jinak by 5 minut chyběla zapsaná dávka', async () => {
  const mem = memoryCounts();
  let release, gets = 0;
  const store = {
    kind: 'pomale-cteni',
    add: mem.add,
    // první čtení vrátí stav před zápisem, ale doběhne až po něm (dotaz do Upstash během flush())
    get: async (keys) => { gets++; const old = await mem.get(keys); if (gets === 1) await new Promise((r) => { release = r; }); return old; },
  };
  const c = makeCounter(store, { now: () => T0 });
  c.hit('trip_started');
  const slow = c.stats(1);
  await new Promise((r) => setImmediate(r));
  await c.flush();
  release();
  await slow;
  assert.deepEqual((await c.stats(1)).total, { trip_started: 1 });
  assert.equal(gets, 2, 'po zápisu se čte znovu');
});

test('Upstash: INCRBY jedním dotazem bez opakování, doba života 400 dní jen novému klíči, čtení jedním MGET', async () => {
  const sent = [];
  const req = async (url, opts) => {
    sent.push({ url, ...opts });
    const b = opts.body;
    if (url.endsWith('/pipeline')) return b.map((cmd) => ({ result: cmd[0] === 'INCRBY' ? (cmd[1].endsWith('app_open') ? 41 : Number(cmd[2])) : 1 }));
    return { result: b.slice(1).map((k) => (k.endsWith('app_open') ? '41' : null)) };
  };
  const s = upstashCounts('https://x.upstash.io', 'tajny', req);
  await s.add([['cnt:2027-01-12:app_open', 2], ['cnt:2027-01-12:share', 3]], 400 * 86400);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].url, 'https://x.upstash.io/pipeline');
  assert.deepEqual(sent[0].body, [['INCRBY', 'cnt:2027-01-12:app_open', '2'], ['INCRBY', 'cnt:2027-01-12:share', '3']]);
  assert.equal(sent[0].retries, 0, 'opakovaný pokus by přičetl podruhé');
  assert.equal(sent[0].headers.Authorization, 'Bearer tajny');
  assert.deepEqual(sent[1].body, [['EXPIRE', 'cnt:2027-01-12:share', '34560000']], 'app_open už existoval (41 ≠ 2)');
  assert.deepEqual(await s.get(['cnt:2027-01-12:app_open', 'cnt:2027-01-12:share']), ['41', null]);
  assert.deepEqual(sent[2].body, ['MGET', 'cnt:2027-01-12:app_open', 'cnt:2027-01-12:share']);
  // nečekaná odpověď = chyba (počty zůstanou v paměti počítadla), nepovedený EXPIRE zápis nezopakuje
  await assert.rejects(upstashCounts('https://x.upstash.io', 't', async () => ({ error: 'ERR' })).add([['cnt:a', 1]], 9));
  let n = 0;
  await upstashCounts('https://x.upstash.io', 't', async () => { if (n++) throw new Error('síť'); return [{ result: 1 }]; }).add([['cnt:a', 1]], 9);
  assert.equal(n, 2);
  // /api/stats čte vždy 90 dní jedním dotazem a pět minut si je pamatuje – veřejný endpoint Upstash nevyčerpá
  let gets = 0, t = T0;
  const c = makeCounter({ kind: 'x', add: async () => {}, get: async (keys) => { gets++; assert.equal(keys.length, 90 * EVENTS.length); return keys.map(() => null); } }, { now: () => t });
  await c.stats(30); await c.stats(90); await c.stats(1);
  assert.equal(gets, 1);
  t += 5 * 60e3 + 1;
  await c.stats(7);
  assert.equal(gets, 2);
});

test('POST /api/count: 204 bez těla, neznámá událost a neplatné tělo 400, velké tělo 413, jen POST; /api/stats jen součty', async () => {
  const post = (body, headers = {}) => fetch(`${base}/api/count`, { method: 'POST', headers, body });
  // tělo od sendBeacon je text/plain; hlavičky s adresou a zařízením se do počtů nedostanou
  const who = { 'content-type': 'text/plain;charset=UTF-8', 'x-forwarded-for': '203.0.113.77', 'cf-connecting-ip': '203.0.113.77', 'user-agent': 'TajnyProhlizec/1.0 (Pixel 7)', cookie: 'id=abc123' };
  const ok = await post(JSON.stringify({ e: 'search_done' }), who);
  assert.equal(ok.status, 204);
  assert.equal(await ok.text(), '');
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal(ok.headers.get('set-cookie'), null);
  assert.equal((await post(JSON.stringify({ e: 'search_done', id: 'u-1', ua: 'x' }))).status, 204, 'cokoli navíc se zahodí');
  assert.equal((await post(JSON.stringify({ e: 'app_open' }), { 'content-type': 'application/json' })).status, 204);
  for (const bad of [JSON.stringify({ e: 'neznama' }), JSON.stringify({ e: ['app_open'] }), JSON.stringify({}), 'null', '', '"app_open"', '{e:', 'e=app_open']) {
    assert.equal((await post(bad)).status, 400, bad);
  }
  assert.ok(MAX_BODY <= 512, 'tělo nejvýš pár set bajtů');
  assert.equal((await post(JSON.stringify({ e: 'app_open', x: 'a'.repeat(MAX_BODY) }))).status, 413);
  const get = await fetch(`${base}/api/count`);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');

  const r = await fetch(`${base}/api/stats?days=7`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=300');
  const text = await r.text();
  const j = JSON.parse(text);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(j.days.length, 7);
  assert.equal(j.days[6].day, today);
  // těsně po půlnoci UTC může být první událost ještě ve včerejšku – proto total, ne jen dnešek
  assert.deepEqual(j.total, { app_open: 1, search_done: 2 });
  assert.deepEqual(Object.keys(j), ['days', 'total']);
  assert.ok(j.days.every((d) => /^\d{4}-\d\d-\d\d$/.test(d.day) && Object.keys(d).length === 2 && Object.keys(d.counts).every((e) => EVENTS.includes(e))));
  assert.doesNotMatch(text, /203\.0\.113|127\.0\.0\.1|TajnyProhlizec|Pixel|abc123|u-1/, 'žádná adresa, zařízení ani identifikátor');
  assert.equal((await (await fetch(`${base}/api/stats`)).json()).days.length, 30);
  assert.equal((await (await fetch(`${base}/api/stats?days=500`)).json()).days.length, 90);
  assert.equal((await (await fetch(`${base}/api/stats?days=x`)).json()).days.length, 30);
});

test('POST /api/count: nejvýš 120 za 10 minut z jedné adresy, pak 429', async () => {
  const post = () => fetch(`${base}/api/count`, { method: 'POST', body: '{"e":"look_letsi"}' });
  let ok = 0, last;
  for (let i = 0; i < 130 && (!last || last.status !== 429); i++) { last = await post(); await last.arrayBuffer(); if (last.status === 204) ok++; }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  // do limitu se počítají i dotazy předchozího testu (stejná adresa) – dohromady právě 120
  const total = (await (await fetch(`${base}/api/stats?days=2`)).json()).total;
  assert.ok(ok > 0 && ok <= 120 && total.look_letsi === ok, `${ok} přijatých`);
  assert.match(read('server/index.js'), /if \(rateLimited\(req, 120, countHits\)\)/);
});

/* ---------- public/js/count.js ve falešném prohlížeči (node:vm) ---------- */
const COUNT_SRC = read('public/js/count.js');
function loadCount({ beacon = true, online = true, fetchOk = true } = {}) {
  const log = { beacons: [], fetches: [] };
  const ctx = {
    URL, JSON, String,
    document: { baseURI: 'https://letsi.example/app/' },
    navigator: { onLine: online },
    fetch: (url, opts) => { log.fetches.push({ url, ...opts }); return fetchOk ? Promise.resolve({ status: 204 }) : Promise.reject(new Error('síť')); },
  };
  if (beacon === 'throws') ctx.navigator.sendBeacon = () => { throw new Error('zakázáno'); };
  else if (beacon !== null) ctx.navigator.sendBeacon = (url, body) => { log.beacons.push({ url, body }); return beacon; };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(COUNT_SRC, ctx, { filename: 'count.js' });
  return { C: ctx.Count, log, ctx };
}

test('count.js: nic neukládá do prohlížeče – žádné cookies, úložiště ani identifikátor', () => {
  assert.doesNotMatch(COUNT_SRC, /document\.cookie|localStorage|sessionStorage|indexedDB|caches\.|crypto\.|randomUUID|Math\.random|userAgent|screen\.|Date\.now/);
  // běh v prohlížeči, kde úložiště ani cookies vůbec nejsou: sáhnutí na ně by skončilo chybou
  const { C, log, ctx } = loadCount();
  C.hit('app_open');
  assert.deepEqual(log.beacons, [{ url: 'https://letsi.example/app/api/count', body: '{"e":"app_open"}' }], 'jen název události');
  assert.equal(log.fetches.length, 0);
  assert.deepEqual(Object.keys(ctx.Count).sort(), ['hit', 'view', 'viewEvent']);
});

test('count.js: offline nic, bez sendBeacon fetch s keepalive, chyba se nikdy neprojeví', async () => {
  const off = loadCount({ online: false });
  off.C.hit('app_open');
  assert.equal(off.log.beacons.length + off.log.fetches.length, 0, 'offline se nepočítá');
  for (const beacon of [null, false]) {
    const { C, log } = loadCount({ beacon, fetchOk: false });
    assert.doesNotThrow(() => C.hit('buy_click'));
    assert.equal(log.fetches.length, 1, `sendBeacon ${beacon}`);
    const f = log.fetches[0];
    assert.deepEqual([f.url, f.method, f.body, f.keepalive, f.credentials], ['https://letsi.example/app/api/count', 'POST', '{"e":"buy_click"}', true, 'omit']);
  }
  const thr = loadCount({ beacon: 'throws' });
  assert.doesNotThrow(() => thr.C.hit('share'));
  assert.doesNotThrow(() => thr.C.hit());
  await new Promise((r) => setImmediate(r)); // odmítnutý fetch nesmí skončit jako neošetřená chyba
});

test('count.js view(): sekce → událost, jen při přepnutí; Mapa a Země jsou Svět, Moje cesty zvlášť', () => {
  const { C, log } = loadCount();
  assert.deepEqual(['dashboard', 'flights', 'trip', 'explore', 'map', 'countries', 'recommend', 'planner', 'x'].map((v) => C.viewEvent(v)),
    ['view_dashboard', 'view_flights', 'view_trip', 'view_explore', 'view_world', 'view_world', null, null, null]);
  assert.equal(C.viewEvent('trip', true), 'view_trips');
  assert.equal(C.viewEvent('flights', true), 'view_flights');
  for (const e of ['dashboard', 'flights', 'trip', 'explore', 'map'].map((v) => C.viewEvent(v)).concat('view_trips')) assert.ok(EVENTS.includes(e), e);
  const steps = [['dashboard'], ['dashboard'], ['flights'], ['flights'], ['map'], ['countries'], ['recommend'], ['flights'], ['trip'], ['trip', true], ['trip', true], ['trip']];
  for (const [v, mine] of steps) C.view(v, mine);
  assert.deepEqual(log.beacons.map((b) => JSON.parse(b.body).e), ['view_dashboard', 'view_flights', 'view_world', 'view_flights', 'view_trip', 'view_trips', 'view_trip']);
});

test('zapojení: count.js před app.js; app_open jednou při startu, sekce v go()', () => {
  const html = read('public/index.html');
  const at = (f) => html.indexOf(`<script src="js/${f}"></script>`);
  assert.ok(at('count.js') > 0 && at('count.js') < at('app.js'));
  assert.equal(html.match(/js\/count\.js/g).length, 1);
  const app = read('public/js/app.js');
  assert.match(app, /async function boot\(\) \{\n  try \{ await start\(\); \} finally \{[^}]*\n    if \(window\.Count\) Count\.hit\('app_open'\);[^\n]*\n  \}\n\}/);
  assert.equal(app.match(/Count\.hit\('app_open'\)/g).length, 1);
  assert.match(app, /activeView = v;\n  if \(window\.Count\) Count\.view\(v, opts\.mine\);/);
});
