// Souhrnné počítání bez sledování lidí: server/lib/counts.js (pevný seznam událostí, denní součty, zápis do úložiště
// po dávkách, žádná IP adresa), POST /api/count a GET /api/stats, klient public/js/count.js přes node:vm (nic
// neukládá do prohlížeče) a zapojení v app.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { EVENTS, SERVER_EVENTS, MAX_EVENTS, FLUSH_MS, TTL_DAYS, MAX_BODY, clampDays, makeCounter, memoryCounts, upstashCounts, statsKeyOk } = await import('../server/lib/counts.js');
const { config } = await import('../server/config.js');
const { searchEvent } = await import('../server/index.js');

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

test('pevný seznam událostí: jedinečné názvy, nejvýš MAX_EVENTS, jen ty se počítají', () => {
  assert.equal(new Set(EVENTS).size, EVENTS.length);
  assert.ok(EVENTS.length <= MAX_EVENTS && MAX_EVENTS === 150, `${EVENTS.length} názvů`);
  assert.ok(SERVER_EVENTS.every((e) => EVENTS.includes(e)));
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

test('výpadek úložiště (B5): událost se přijme, nepovedená dávka se zahodí – nikdy se nepřičte dvakrát', async () => {
  let down = true;
  const mem = memoryCounts();
  // Upstash přičetl, ale odpověď se ztratila (časový limit): vrácená dávka by se příště přičetla podruhé
  const store = { kind: 'flaky', add: async (...a) => { await mem.add(...a); if (down) throw new Error('Upstash: odpověď se ztratila'); }, get: mem.get };
  const c = makeCounter(store, { now: () => T0 });
  assert.equal(c.hit('trip_saved'), true);
  await c.flush();
  c.hit('trip_saved');
  down = false;
  await c.flush();
  await c.flush();
  assert.deepEqual(await mem.get(['cnt:2027-01-12:trip_saved']), [2], 'každá událost jednou, ne 3');
  // úplný výpadek: dávka je pryč (ztráta je menší zlo než zdvojení) a nic se neopakuje
  let adds = 0;
  const dead = makeCounter({ kind: 'dead', add: async () => { adds++; throw new Error('Upstash nedostupný'); }, get: async (keys) => keys.map(() => null) }, { now: () => T0 });
  dead.hit('share');
  await dead.flush();
  assert.deepEqual((await dead.stats(1)).total, {});
  await dead.flush();
  assert.equal(adds, 1, 'zahozená dávka se nezkouší znovu');
});

test('rozpočet Upstash: zápis jednou za 30 min, nejvýš EVENTS.length párů v dávce, i s rezervou do 250 000 příkazů měsíčně', async () => {
  assert.equal(FLUSH_MS, 30 * 60e3);
  const N = EVENTS.length;
  // INCRBY ≤ N × 49 oken (30 min, i s flush při SIGTERM) × 31 dní, EXPIRE ≤ N × 31, čtení statistik ≤ 336 denně
  assert.ok(N * 31 * 49 + N * 31 + 31 * 336 <= 250000, `${N} názvů`);
  assert.ok(MAX_EVENTS * 31 * 49 + MAX_EVENTS * 31 + 31 * 336 <= 250000, 'strop MAX_EVENTS se do rozpočtu vejde');
  const calls = [];
  const c = makeCounter({ kind: 'spy', add: async (pairs) => { calls.push(pairs); }, get: async (keys) => keys.map(() => null) }, { now: () => T0 });
  for (let i = 0; i < 100; i++) for (const e of EVENTS) c.hit(e);
  await c.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, N);
  assert.ok(calls[0].every(([, n]) => n === 100));
});

test('klíč ke statistikám: jen Bearer se stejným klíčem, jiná délka nebo prázdný klíč = ne', () => {
  assert.equal(statsKeyOk('Bearer tajny-klic', 'tajny-klic'), true);
  for (const h of ['Bearer tajny-kli', 'Bearer tajny-klicX', 'bearer tajny-klic', 'tajny-klic', 'Basic tajny-klic', 'Bearer ', '', undefined, null]) {
    assert.equal(statsKeyOk(h, 'tajny-klic'), false, String(h));
  }
  assert.equal(statsKeyOk('Bearer x', ''), false, 'bez klíče na serveru nic neodemkne');
  assert.equal(statsKeyOk('Bearer žluť', 'žluť'), true, 'délka v bajtech, ne znacích');
  assert.match(read('server/lib/counts.js'), /timingSafeEqual\(a, b\)/);
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

test('POST /api/count: stejná událost nejvýš 30× za 10 minut z adresy, jiná projde; serverové počty z prohlížeče ne', async () => {
  const post = (e) => fetch(`${base}/api/count`, { method: 'POST', body: JSON.stringify({ e }) });
  for (let i = 0; i < 30; i++) { const r = await post('trip_auto'); await r.arrayBuffer(); assert.equal(r.status, 204, `${i + 1}.`); }
  const over = await post('trip_auto');
  assert.equal(over.status, 429, '31. stejná událost');
  assert.ok(Number(over.headers.get('retry-after')) > 0);
  assert.equal((await post('trip_summary')).status, 204, 'jiná událost z téže adresy projde');
  for (const e of SERVER_EVENTS) assert.equal((await post(e)).status, 400, `${e} počítá jen server`);
  const total = (await (await fetch(`${base}/api/stats?days=2`)).json()).total;
  assert.equal(total.trip_auto, 30);
  assert.equal(total.trip_summary, 1);
  for (const e of ['search_empty', 'search_busy', 'stay_empty']) assert.equal(total[e], undefined, e);
});

test('POST /api/count: nejvýš 120 za 10 minut z jedné adresy, pak 429', async () => {
  // různé události, ať limit adresa+událost (30) nezasáhne dřív
  const names = EVENTS.filter((e) => !SERVER_EVENTS.includes(e));
  const post = (i) => fetch(`${base}/api/count`, { method: 'POST', body: JSON.stringify({ e: names[i % names.length] }) });
  let ok = 0, last;
  for (let i = 0; i < 130 && (!last || last.status !== 429); i++) { last = await post(i); await last.arrayBuffer(); if (last.status === 204) ok++; }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  // do limitu se počítají i dotazy předchozích testů (stejná adresa) – dohromady právě 120
  assert.ok(ok > 0 && ok < 120, `${ok} přijatých`);
  assert.match(read('server/index.js'), /if \(rateLimited\(req, 120, countHits\)\)/);
});

/* ---------- serverové počty „kde to drhne“ a klíč ke statistikám ---------- */
const totalNow = async () => (await (await fetch(`${base}/api/stats?days=2`)).json()).total;

test('searchEvent: bez nabídek search_empty, když přitom neodpověděl žádný zdroj search_error, jinak nic', () => {
  const ok = { state: 'done', error: null, outage: null };
  assert.equal(searchEvent({ groups: [{}], providers: [ok] }), null);
  assert.equal(searchEvent({ groups: [], providers: [ok, { state: 'error', error: 'Kiwi: 500', outage: 'down' }] }), 'search_empty', 'aspoň jeden zdroj odpověděl');
  // tvar stavu zdroje ze server/lib/search.js (outageOf): část dotazů selhala = 'partial', zdroj ale odpověděl
  assert.equal(searchEvent({ groups: [], providers: [{ state: 'partial', error: 'chyba HTTP 500', outage: 'partial' }, { state: 'error', error: 'x', outage: 'down' }] }), 'search_empty', 'částečný výpadek není chyba');
  assert.equal(searchEvent({ groups: [], providers: [{ state: 'error', error: 'x', outage: 'down' }, { state: 'error', error: 'y', outage: 'blocked' }] }), 'search_error');
  assert.equal(searchEvent({ mode: 'multi', combos: [], providers: [{ state: 'partial', error: '1. let: x', outage: 'down' }] }), 'search_error', 'cesta přes víc měst: výpadek ve všech úsecích');
  assert.equal(searchEvent({ groups: [], providers: [] }), 'search_empty');
  assert.equal(searchEvent({ mode: 'multi', groups: [], combos: [{}], providers: [ok] }), null, 'cesta přes víc měst má kombinace, ne skupiny');
  assert.equal(searchEvent({ mode: 'multi', groups: [], combos: [], providers: [ok] }), 'search_empty');
  assert.equal(searchEvent(null), null, 'nikdo nečekal – hledání neproběhlo');
});

test('serverové počty po odpovědích: js_error, search_limit, shared_open, shared_broken; háčky busy, empty, error a stay_empty', async () => {
  const before = await totalNow();
  const n = (t, e) => (t[e] || 0) - (before[e] || 0);
  // přijaté hlášení chyby = js_error; zahozené (rozšíření prohlížeče, bez textu) ne
  const rep = (b) => fetch(`${base}/api/client-error`, { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.1' }, body: JSON.stringify(b) });
  assert.equal((await rep({ msg: 'TypeError: x is undefined', src: 'app.js:1' })).status, 204);
  assert.equal((await rep({ msg: '' })).status, 204);
  // limit hledání z jedné adresy: druhé nové hledání 429 = search_limit
  const limit = config.searchesPer10Min;
  config.searchesPer10Min = 1;
  try {
    const search = (to) => fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.2' },
      body: JSON.stringify({ from: ['ap:PRG'], to: [to], radiusKm: 0, dateFrom: new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10), dateTo: new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10), trip: 'oneway' }) });
    const first = await search('ap:LIS');
    assert.equal(first.status, 200);
    await first.text();
    const second = await search('ap:BCN');
    assert.equal(second.status, 429);
    await second.text();
  } finally {
    config.searchesPer10Min = limit;
  }
  // sdílený odkaz: otevřený 200 = shared_open, neexistující 404 = shared_broken
  const made = await (await fetch(`${base}/api/share`, { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.3' }, body: JSON.stringify({ k: 'trip', j: JSON.stringify({ v: 1, dest: { label: 'Lisabon', cc: 'PT' }, flight: { out: { from: 'PRG', to: 'LIS', date: '2027-02-03' }, back: { from: 'LIS', to: 'PRG', date: '2027-02-08' } }, route: { bases: [] } }) }) })).json();
  assert.ok(made.id, JSON.stringify(made));
  assert.equal((await fetch(`${base}/api/share/${made.id}`)).status, 200);
  const missing = made.id.replace(/./, (c) => (c === 'A' ? 'B' : 'A'));
  assert.equal((await fetch(`${base}/api/share/${missing}`)).status, 404);
  const t = await totalNow();
  assert.deepEqual([n(t, 'js_error'), n(t, 'search_limit'), n(t, 'shared_open'), n(t, 'shared_broken')], [1, 1, 1, 1]);
  // stavy, které se v demu vyvolat nedají: háček přímo u odpovědi
  const src = read('server/index.js');
  assert.match(src, /if \(fresh && searchGate\.full\(\)\) \{\n    counter\.hit\('search_busy'\);\n    return sendJson\(req, res, 503, BUSY/);
  assert.match(src, /if \(fresh && _searchClients\.full\(ip, config\.searchPerClient\)\) \{\n    counter\.hit\('search_limit'\);/);
  assert.match(src, /const ev = searchEvent\(result\);\n      if \(ev\) counter\.hit\(ev\);/);
  assert.match(src, /console\.error\('\[search\]', e\);\n      counter\.hit\('search_error'\);/);
  assert.match(src, /if \(!stays\.items\.length && stays\.query\.nights <= 30\) counter\.hit\('stay_empty'\);\n    return sendJson\(req, res, 200, stays\);/);
  // každý serverový název se někde opravdu počítá
  for (const e of SERVER_EVENTS) assert.ok(src.includes(`counter.hit('${e}')`) || e === 'search_empty', e);
});

test('/api/stats: bez STATS_KEY veřejné jako dřív; s klíčem 401 bez něj / se špatným, 200 + no-store se správným, 10 špatných za hodinu', async () => {
  const pub = await fetch(`${base}/api/stats?days=1`);
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get('cache-control'), 'public, max-age=300');
  config.statsKey = 'klic-ke-statistikam-0123456789';
  try {
    const get = (auth, ip = '198.51.100.9') => fetch(`${base}/api/stats?days=1`, { headers: { 'x-forwarded-for': ip, ...(auth ? { authorization: auth } : {}) } });
    const none = await get();
    assert.equal(none.status, 401);
    assert.equal(none.headers.get('www-authenticate'), 'Bearer');
    assert.doesNotMatch(await none.text(), /days|total/);
    const ok = await get('Bearer klic-ke-statistikam-0123456789');
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store', 'počty s klíčem nesmí zůstat ve sdílené mezipaměti');
    assert.ok((await ok.json()).days.length === 1);
    for (let i = 0; i < 10; i++) assert.equal((await get('Bearer spatny')).status, 401, `${i + 1}. špatný`);
    const over = await get('Bearer spatny');
    assert.equal(over.status, 429, '11. špatný pokus za hodinu');
    assert.ok(Number(over.headers.get('retry-after')) > 0);
    assert.equal((await get()).status, 401, 'dotaz bez klíče (první načtení stránky) do limitu nepočítá');
    assert.equal((await get('Bearer spatny', '198.51.100.10')).status, 401, 'jiná adresa má vlastní limit');
    assert.equal((await get('Bearer klic-ke-statistikam-0123456789')).status, 200, 'správný klíč projde');
  } finally {
    config.statsKey = '';
  }
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

test('count.js: bez souhlasu nic neukládá do prohlížeče – žádné cookies, úložiště ani identifikátor', () => {
  assert.doesNotMatch(COUNT_SRC, /document\.cookie|sessionStorage|indexedDB|caches\.|randomUUID|userAgent|screen\./);
  // úložiště jen kvůli volbě Pomáhat se zlepšováním (atlas_help), náhodné ID návštěvy jen se souhlasem (test/traces.test.js)
  assert.deepEqual(COUNT_SRC.match(/localStorage\.\w+\('[^']*'/g), ["localStorage.getItem('atlas_help'", "localStorage.setItem('atlas_help'"]);
  // náhoda jen k výběru, jestli se Count.ask zeptá – nikam se neposílá ani neukládá (test/mikro-otazky.test.js)
  assert.deepEqual(COUNT_SRC.match(/Math\.random\(\)[^;]*/g), ['Math.random() < o.rate)) return null']);
  // běh v prohlížeči, kde úložiště ani cookies vůbec nejsou: sáhnutí na ně by skončilo chybou
  const { C, log, ctx } = loadCount();
  C.hit('app_open');
  assert.deepEqual(log.beacons, [{ url: 'https://letsi.example/app/api/count', body: '{"e":"app_open"}' }], 'jen název události');
  assert.equal(log.fetches.length, 0);
  assert.deepEqual(Object.keys(ctx.Count).sort(), ['ask', 'consent', 'deep', 'helping', 'hit', 'rageTap', 'view', 'viewEvent']);
  assert.equal(ctx.Count.helping(), false, 'bez localStorage = bez souhlasu');
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
  assert.match(app, /activeView = v;\n  if \(window\.Count\) Count\.view\(v, opts\.mine \|\| \(v === 'trip' && tripMine\(S\.trip, S\.trips\)\)\);/);
});

/* ---------- stránka Statistiky: Kde to drhne a klíč (public/js/statistiky.js přes node:vm) ---------- */
const STATS_SRC = read('public/js/statistiky.js');
/** Stránka ve falešném prohlížeči: #stats, formulář klíče (zachytí obsluhu odeslání) a fetch s odpověďmi po řadě. */
function statsPage(replies) {
  const root = { innerHTML: '', setAttribute() {}, removeAttribute() {} };
  const form = { addEventListener: (_, f) => { form.submit = f; } };
  const input = { value: '', focus() {} };
  const asked = [];
  const c = {
    window: {}, URLSearchParams, location: { search: '' }, history: { replaceState() {} },
    document: { getElementById: (id) => ({ stats: root, statsKeyForm: form, statsKey: input })[id] || null, querySelectorAll: () => [] },
    fetch: async (u, opts) => { asked.push({ u, auth: opts && opts.headers && opts.headers.Authorization }); return replies.shift(); },
  };
  vm.createContext(c);
  vm.runInContext(STATS_SRC, c, { filename: 'statistiky.js' });
  const send = async (value) => { input.value = value; form.submit({ preventDefault() {} }); await tick(); };
  return { root, asked, send, S: c.window.Stats };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

test('statistiky rates(): na 100 v základu, seřazené, málo dat pod 30, bez základu jen počet; každý serverový název na stránce', () => {
  const { S } = statsPage([{ ok: true, json: async () => ({ days: [], total: {} }) }]);
  const total = { search_done: 200, search_empty: 30, search_limit: 3, search_error: 1, shared_open: 8, shared_broken: 2, app_open: 400, js_error: 4, stay_empty: 5 };
  const r = JSON.parse(JSON.stringify(S.rates(total)));
  assert.deepEqual(r.map((x) => [x.e, x.per100, x.few]), [
    ['shared_broken', 20, true], ['search_empty', 15, false], ['search_limit', 1.5, false], ['js_error', 1, false],
    ['search_error', 0.5, false], ['search_busy', 0, false], ['stay_empty', null, true],
  ]);
  assert.equal(r[0].base, 10, 'sdílené: otevřené + nefunkční');
  assert.equal(r.at(-1).n, 5);
  assert.ok(JSON.parse(JSON.stringify(S.rates({}))).every((x) => x.per100 === null && x.few), 'prázdná data: žádný poměr, žádná chyba');
  for (const e of SERVER_EVENTS) assert.ok(STATS_SRC.includes(`'${e}'`), e);
});

test('statistiky: 401 → pole „Klíč ke statistikám“, klíč v hlavičce, špatný „Klíč nesedí.“, správný ukáže Kde to drhne', async () => {
  const locked = { ok: false, status: 401, json: async () => ({}) };
  const stats = { ok: true, status: 200, json: async () => ({ days: [{ day: '2027-01-12', counts: {} }], total: { search_done: 40, search_empty: 4 } }) };
  const page = statsPage([locked, locked, stats]);
  await tick();
  assert.match(page.root.innerHTML, /<label for="statsKey">Klíč ke statistikám<\/label>/);
  assert.match(page.root.innerHTML, /type="password" autocomplete="current-password"/);
  assert.doesNotMatch(page.root.innerHTML, /Klíč nesedí/);
  assert.equal(page.asked[0].auth, undefined, 'napoprvé bez klíče');
  await page.send(' spatny ');
  assert.equal(page.asked[1].auth, 'Bearer spatny');
  assert.match(page.root.innerHTML, /Klíč nesedí\./);
  await page.send('dobry-klic');
  assert.equal(page.asked[2].auth, 'Bearer dobry-klic');
  assert.deepEqual(page.asked.map((a) => a.u), ['api/stats?days=30', 'api/stats?days=30', 'api/stats?days=30']);
  assert.match(page.root.innerHTML, /<h2>Kde to drhne<\/h2>/);
  assert.match(page.root.innerHTML, /Hledání bez nabídek<\/th><td>10 %<\/td><td class="note">4 z 40<\/td>/);
  assert.match(page.root.innerHTML, /poměr je proto přibližný/);
  assert.doesNotMatch(page.root.innerHTML, /undefined|NaN|null/);
  assert.doesNotMatch(STATS_SRC, /localStorage|sessionStorage|document\.cookie/, 'klíč jen v paměti stránky');
});
