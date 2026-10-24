// Starší výsledek radaru (stale-while-revalidate, server/index.js revalidate): po SEARCH_RESULT_TTL dostane další se
// stejným dotazem radaru hned starší úplný výsledek se stářím a server ho jednou přepočítá na pozadí – jen na skutečný
// požadavek. Plná fronta = jen starší výsledek, nepovedený přepočet starší výsledek nezahodí, ↻ Obnovit (newerThanS) chce
// jen novější než ceny na obrazovce, hledání v Letech (bez radar) se nemění. Klíč dotazu bez proměnlivých částí, se vším,
// co mění výsledek. A aplikace: runSearch předá stáří (staleAgeS) a odklad po přetížení nezruší, radar stáří ukáže v patičce.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ymdPlus } from './helpers.js';

// Strop 1 hledání + fronta 1, ať se dá ověřit plná fronta (config se čte při prvním importu – proto dynamické importy).
process.env.ATLAS_MOCK = '1';
process.env.SEARCH_CONCURRENCY = '1';
process.env.SEARCH_QUEUE = '1';
const { createServer, _recentSearches, searchKeys, staleLine, ndjsonLine, refreshRoom } = await import('../server/index.js');
const { config } = await import('../server/config.js');
const { mockProviders } = await import('../server/providers/mock.js');
const { todayYmd } = await import('../server/lib/dates.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// Radar z aplikace (SearchHelp.radarQuery + radar: true a noPartial z runSearch) – tady s jedním cílem, ať je hledání
// v DEMO rychlé; ukládání a starší výsledek se řídí jen radar: true v dotazu (radar.test.js a radar-slim.test.js
// hledají „kamkoliv“). Každý test vlastní termín = vlastní dotaz.
const radarQ = (n) => ({ from: ['ap:VIE'], to: ['ap:BCN'], radiusKm: 0, dateFrom: ymdPlus(20), dateTo: ymdPlus(30 + n), trip: 'return', nightsMin: 3, nightsMax: 5, adults: 2, noPartial: true, radar: true });
const post = (body, ip) => fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'br, gzip', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
const lines = async (r) => (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
const stats = async () => (await (await fetch(`${base}/api/health`)).json()).searches;
/** Uložený výsledek dotazu „posunout“ do minulosti (jako by ho server spočítal před `ms`) – jako starší výsledek radaru. */
function age(body, ms) {
  const k = searchKeys(body).recent;
  const e = _recentSearches.stale(k);
  assert.ok(e, 'výsledek je uložený');
  _recentSearches.set(k, e.value, e.value.length * 2, Date.now() - ms, { stale: true });
  return e.value;
}
/** Počká, až nic nehledá (přepočet na pozadí doběhl). */
async function idle() {
  for (let i = 0; i < 400; i++) {
    const s = await stats();
    if (!s.active && !s.queued && !s.shared) return;
    await sleep(25);
  }
  throw new Error('hledání neskončilo');
}
/** Zpomalí demo zdroje a počítá jejich dotazy pro termín do `dateTo` → { count, restore }. */
function slowMock(ms, fail = false) {
  const orig = mockProviders.map((p) => p.daily);
  const calls = [];
  mockProviders.forEach((p, i) => {
    p.daily = async (a) => {
      calls.push(a);
      await sleep(ms);
      if (fail) throw new Error('výpadek zdroje');
      return orig[i].call(p, a);
    };
  });
  return { count: (to) => calls.filter((a) => a.dateTo === to).length, restore: () => mockProviders.forEach((p, i) => { p.daily = orig[i]; }) };
}

test('starší výsledek radaru: po TTL všem hned se stářím, jeden přepočet na pozadí; pak už nový výsledek', async () => {
  const body = radarQ(1);
  const first = await lines(await post(body, '10.50.0.1'));
  assert.equal(first.at(-1).type, 'result');
  age(body, 5 * 60e3);
  const s0 = await stats();
  const mock = slowMock(400);
  try {
    // 5 nových návštěvníků naráz, přepočet trvá (zdroje 400 ms na dotaz)
    const t0 = Date.now();
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => post(body, `10.50.1.${i}`)));
    const all = await Promise.all(rs.map(lines));
    for (const ls of all) {
      assert.equal(ls.length, 1, 'rovnou výsledek, bez průběhu');
      const [l] = ls;
      assert.equal(l.type, 'result');
      assert.ok(l.stale && l.stale.ageS >= 299 && l.stale.ageS <= 302, `stáří ${l.stale?.ageS} s`);
      assert.ok(Math.abs(Date.parse(l.stale.at) - (t0 - 5 * 60e3)) < 3000, `čas ${l.stale.at}`);
      assert.deepEqual(l.result, first.at(-1).result, 'stejný výsledek jako hledání před 5 min');
    }
    const s1 = await stats();
    assert.equal(s1.staleHits - s0.staleHits, 5);
    assert.equal(s1.staleRefreshes - s0.staleRefreshes, 1, 'jeden přepočet pro všech 5');
    assert.equal(s1.readyHits, s0.readyHits, 'starší výsledek se do hotových nepočítá');
    assert.equal(s1.shared, 1, 'přepočet běží');
    // další během přepočtu: zase hned starší, nový přepočet ne
    const during = await lines(await post(body, '10.50.2.1'));
    assert.ok(during[0].stale);
    await idle();
    const s2 = await stats();
    assert.equal(s2.staleRefreshes - s0.staleRefreshes, 1);
    assert.equal(s2.staleFailed, s0.staleFailed);
    const once = mock.count(body.dateTo);
    assert.ok(once > 0, 'přepočet se ptal zdrojů');
    // po přepočtu: nový (čerstvý) výsledek, bez značky a bez dalších dotazů na zdroje
    const after = await lines(await post(body, '10.50.3.1'));
    assert.equal(after.length, 1);
    assert.equal(after[0].type, 'result');
    assert.equal(after[0].stale, undefined, 'už nový výsledek');
    assert.equal(mock.count(body.dateTo), once);
    assert.equal((await stats()).readyHits - s0.readyHits, 1);
  } finally {
    mock.restore();
  }
});

test('přepočet se nepovede (výpadek zdroje) → starší výsledek platí dál; další požadavek to zkusí znovu', async () => {
  const body = radarQ(2);
  const first = await lines(await post(body, '10.51.0.1'));
  age(body, 10 * 60e3);
  const s0 = await stats();
  const mock = slowMock(20, true);
  try {
    const a = await lines(await post(body, '10.51.1.1'));
    assert.ok(a[0].stale, 'starší hned');
    await idle();
    const s1 = await stats();
    assert.equal(s1.staleRefreshes - s0.staleRefreshes, 1);
    assert.equal(s1.staleFailed - s0.staleFailed, 1, 'přepočet nedal úplný výsledek');
    assert.equal(_recentSearches.get(searchKeys(body).recent), undefined, 'neúplný výsledek se neuložil');
    const b = await lines(await post(body, '10.51.1.2'));
    assert.ok(b[0].stale && b[0].stale.ageS >= 599, 'pořád tentýž starší výsledek');
    assert.equal(b[0].stale.at, a[0].stale.at);
    assert.deepEqual(b[0].result, first.at(-1).result);
    await idle();
    assert.equal((await stats()).staleRefreshes - s0.staleRefreshes, 2, 'další požadavek = další pokus');
  } finally {
    mock.restore();
  }
  // zdroje zase odpovídají: přepočet uloží nový výsledek
  await lines(await post(body, '10.51.1.3'));
  await idle();
  const c = await lines(await post(body, '10.51.1.4'));
  assert.equal(c[0].stale, undefined);
});

test('plná fronta → jen starší výsledek, přepočet se nespustí (a nové hledání dostane 503 jako dřív)', async () => {
  const body = radarQ(3);
  await lines(await post(body, '10.52.0.1'));
  age(body, 3 * 60e3);
  const s0 = await stats();
  const mock = slowMock(200);
  try {
    // strop 1 hledání + fronta 1: obsadí je dvě jiná hledání (v Letech)
    const lety = (n) => ({ ...radarQ(3), dateTo: ymdPlus(50 + n), radar: undefined });
    const a = await post(lety(1), '10.52.1.1');
    const b = await post(lety(2), '10.52.1.2');
    assert.equal((await post(lety(3), '10.52.1.3')).status, 503, 'fronta je plná');
    const r = await post(body, '10.52.1.4');
    assert.equal(r.status, 200);
    const ls = await lines(r);
    assert.ok(ls[0].stale, 'starší výsledek i při plné frontě');
    const s1 = await stats();
    assert.equal(s1.staleSkipped - s0.staleSkipped, 1);
    assert.equal(s1.staleRefreshes, s0.staleRefreshes, 'přepočet se nespustil');
    await Promise.all([a.text(), b.text()]);
    await idle();
    assert.equal(mock.count(body.dateTo), 0, 'na zdroje se kvůli němu nešlo');
  } finally {
    mock.restore();
  }
});

test('↻ Obnovit (newerThanS = stáří cen na obrazovce): starší výsledek jen novější, jinak se hledá; nový výsledek pod stejným klíčem', async () => {
  const body = radarQ(4);
  await lines(await post(body, '10.53.0.1'));
  age(body, 4 * 60e3);
  const s0 = await stats();
  const mock = slowMock(10);
  try {
    // obrazovka ukazuje ceny staré 10 min, starší výsledek serveru je ze 4 min → hned ten (je novější)
    const newer = await lines(await post({ ...body, newerThanS: 600 }, '10.53.1.0'));
    assert.deepEqual([newer.length, newer[0].type], [1, 'result']);
    assert.ok(newer[0].stale && newer[0].stale.ageS >= 239, 'starší výsledek, novější než obrazovka');
    await idle(); // jeho přepočet
    assert.equal((await stats()).staleRefreshes - s0.staleRefreshes, 1);
    age(body, 4 * 60e3);
    const n0 = mock.count(body.dateTo);
    // obrazovka ukazuje právě tenhle starší výsledek (4 min) → hledá se jako dřív
    const ls = await lines(await post({ ...body, newerThanS: 240 }, '10.53.1.1'));
    assert.ok(ls.some((l) => l.type === 'progress'), 'hledá se (průběh)');
    assert.equal(ls.at(-1).type, 'result');
    assert.equal(ls.at(-1).stale, undefined);
    assert.ok(mock.count(body.dateTo) > n0, 'zdroje se ptaly');
    // výsledek s newerThanS je tentýž dotaz: další bez něj ho dostane hotový
    const again = await lines(await post(body, '10.53.1.2'));
    assert.deepEqual([again.length, again[0].stale], [1, undefined]);
    assert.equal((await stats()).staleHits - s0.staleHits, 1);
  } finally {
    mock.restore();
  }
});

test('↻ Obnovit hned po starším výsledku nevrátí tentýž, i když ageS zaokrouhlené nahoru (240,6 s → 241)', async () => {
  const body = radarQ(8);
  await lines(await post(body, '10.56.0.1'));
  age(body, 240600); // po SEARCH_RESULT_TTL (2 min)
  const mock = slowMock(300); // přepočet na pozadí ještě běží, starší výsledek je pořád uložený
  try {
    const [s1] = await lines(await post(body, '10.56.1.1'));
    assert.equal(s1.stale.ageS, 241);
    // jako flights.js: čas cen z ageS, newerThanS = jejich stáří na obrazovce
    const at = Date.now() - s1.stale.ageS * 1000;
    const newerThanS = Math.max(0, Math.floor((Date.now() - at) / 1000));
    const ls = await lines(await post({ ...body, newerThanS }, '10.56.1.2'));
    assert.equal(ls.at(-1).type, 'result');
    assert.equal(ls.at(-1).stale, undefined, 'nový výsledek, ne tentýž starší');
    await idle();
  } finally {
    mock.restore();
  }
});

test('přepočet podrží stejné hledání, které už čeká ve frontě a jeho zakladatel odešel – fronta ho nezahodí', async () => {
  const body = radarQ(7);
  await lines(await post(body, '10.55.0.1'));
  age(body, 6 * 60e3);
  const k = searchKeys(body).recent;
  const s0 = await stats();
  const mock = slowMock(150);
  try {
    // strop 1 hledání: obsadí ho hledání v Letech; ↻ Obnovit (newerThanS 0 – starší výsledek ne) čeká ve frontě
    const busy = post({ ...radarQ(7), dateTo: ymdPlus(60), radar: undefined }, '10.55.1.1');
    await sleep(50);
    const ac = new AbortController();
    const refresh = fetch(`${base}/api/search`, { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.55.1.2' }, body: JSON.stringify({ ...body, newerThanS: 0 }) });
    const r1 = await refresh;
    assert.equal(r1.status, 200);
    assert.equal((await stats()).queued, 1, 've frontě');
    ac.abort(); // zavřel stránku
    await sleep(50);
    // nový návštěvník: starší výsledek hned; stejné hledání už čeká → nový přepočet ne, jen ho podrží
    const b = await lines(await post(body, '10.55.1.3'));
    assert.ok(b[0].stale);
    await (await busy).text();
    await idle();
    const s1 = await stats();
    assert.equal(s1.staleRefreshes, s0.staleRefreshes, 'žádný druhý přepočet');
    assert.ok(_recentSearches.get(k), 'čekající hledání doběhlo – nový výsledek');
    const c = await lines(await post(body, '10.55.1.4'));
    assert.equal(c[0].stale, undefined);
  } finally {
    mock.restore();
  }
});

test('refreshRoom: přepočet hned, nebo když zůstane aspoň polovina fronty pro hledání lidí', () => {
  const st = (active, queued, concurrency = 4, maxQueue = 20) => ({ active, queued, concurrency, maxQueue });
  assert.equal(refreshRoom(st(3, 0)), true, 'volné místo – začne hned');
  assert.equal(refreshRoom(st(4, 0)), true);
  assert.equal(refreshRoom(st(4, 9)), true);
  assert.equal(refreshRoom(st(4, 10)), false, 'polovina fronty obsazená');
  assert.equal(refreshRoom(st(1, 0, 1, 1)), true, 'fronta 1: první místo ano');
  assert.equal(refreshRoom(st(1, 1, 1, 1)), false);
  assert.equal(refreshRoom(st(1, 0, 1, 0)), false, 'bez fronty jen hned');
});

test('hledání v Letech (bez radar): výsledek jen do SEARCH_RESULT_TTL, starší výsledek radaru nikdy nedostane', async () => {
  const letyOf = (b) => JSON.parse(JSON.stringify({ ...b, radar: undefined }));
  const lety = letyOf(radarQ(5));
  await lines(await post(lety, '10.54.0.1'));
  const lk = searchKeys(lety).recent;
  assert.ok(_recentSearches.get(lk), 'hotový výsledek na chvíli ano');
  const ttl = config.searchResultTtlS * 1000;
  assert.equal(_recentSearches.stale(lk, Date.now() + ttl + 1000), undefined, 'po TTL pryč – starší výsledek Lety nemají');
  // radar se stejnými podmínkami: starší výsledek ano (do SEARCH_STALE_TTL), ale jen pro dotaz s radar: true
  const radar = radarQ(5);
  await lines(await post(radar, '10.54.0.2'));
  const rk = searchKeys(radar).recent;
  assert.notEqual(rk, lk);
  assert.ok(_recentSearches.stale(rk, Date.now() + ttl + 1000), 'radar po TTL jako starší');
  assert.equal(_recentSearches.stale(rk, Date.now() + config.searchStaleS * 1000 + 1000), undefined, 'po SEARCH_STALE_TTL pryč');
  // starší výsledek radaru existuje, hledání v Letech se stejnými podmínkami ho nedostane – hledá
  const radar6 = radarQ(6);
  await lines(await post(radar6, '10.54.0.3'));
  age(radar6, 5 * 60e3);
  const s0 = await stats();
  const mock = slowMock(5);
  try {
    const ls = await lines(await post(letyOf(radar6), '10.54.1.1'));
    assert.ok(ls.some((l) => l.type === 'progress'), 'hledá se');
    assert.ok(!ls.some((l) => l.stale), 'bez značky stáří');
    assert.equal(ls.at(-1).type, 'result');
    assert.ok(mock.count(radar6.dateTo) > 0, 'zdroje se ptaly');
    assert.equal((await stats()).staleHits, s0.staleHits);
  } finally {
    mock.restore();
  }
  await idle();
});

test('klíč dotazu: bez newerThanS, se vším, co mění výsledek, a s dnešním datem; radar z aplikace bez proměnlivých částí', () => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
  const { radarQuery } = ctx.window.SearchHelp;
  const home = { from: [{ id: 'ap:PRG', label: 'Praha' }], radius: 200, adults: 2 };
  const app = (mode, h = home, today = ymdPlus(0)) => ({ ...radarQuery(mode, h, today).payload, noPartial: true, radar: true });
  // dva návštěvníci se stejným domovem, okruhem, režimem a počtem lidí = stejný klíč (sdílí hotový i starší výsledek)
  assert.equal(searchKeys(app('all')).recent, searchKeys(JSON.parse(JSON.stringify(app('all')))).recent);
  assert.equal(searchKeys({ ...app('all'), newerThanS: 120 }).recent, searchKeys(app('all')).recent, 'newerThanS do klíče nepatří');
  assert.equal(searchKeys({ ...app('all'), newerThanS: 120 }).body.newerThanS, undefined, 'ani do hledání');
  assert.deepEqual([120, 0, -1, '60', null, undefined].map((v) => searchKeys({ ...app('all'), newerThanS: v }).maxAgeS), [120, 0, Infinity, Infinity, Infinity, Infinity]);
  assert.ok(searchKeys(app('all')).recent.startsWith(`${todayYmd()}|`), 'dnešní datum serveru');
  const keys = new Set([
    app('all'), app('weekend'), app('all', { ...home, adults: 1 }), app('all', { ...home, radius: 100 }),
    app('all', { ...home, from: [{ id: 'ap:BRQ', label: 'Brno' }] }), app('all', { ...home, own: { PRG: 350 } }),
    app('all', home, ymdPlus(1)), { ...app('all'), radar: undefined },
  ].map((b) => searchKeys(JSON.parse(JSON.stringify(b))).recent));
  assert.equal(keys.size, 8, 'režim, počet lidí, okruh, domov, 🏠 vlastní ceny, termíny i radar mění klíč');
  // svátky: každý prodloužený víkend vlastní dotaz (jiné termíny a dny odletu)
  const lw = radarQuery('holiday', home, ymdPlus(0));
  if (!lw.none && lw.lw.all.length > 1) {
    const other = radarQuery('holiday', home, ymdPlus(0), lw.lw.all[1].start);
    assert.notEqual(searchKeys(lw.payload).recent, searchKeys(other.payload).recent);
  }
  // nic proměnlivého (čas, náhodné číslo) – dotaz za chvíli je tentýž
  assert.equal(JSON.stringify(app('all')), JSON.stringify(app('all')));
  assert.ok(!/"(at|ts|now|nonce|t)":/.test(JSON.stringify(app('all'))), JSON.stringify(app('all')));
});

test('staleLine: hotový řádek se značkou stáří, výsledek beze změny (bez nového převodu); jiný řádek → null', () => {
  const result = { groups: [{ dest: { label: 'Řím' } }], providers: [] };
  const line = ndjsonLine({ type: 'result', result });
  const at = Date.parse('2026-10-24T10:00:00Z');
  const s = staleLine(line, at, at + 12 * 60e3 + 400);
  assert.ok(s.endsWith('\n'));
  const ev = JSON.parse(s);
  assert.deepEqual(ev, { type: 'result', stale: { at: '2026-10-24T10:00:00.000Z', ageS: 720 }, result });
  assert.equal(JSON.parse(staleLine(line, at, at - 5000)).stale.ageS, 0, 'hodiny pozpátku → 0');
  assert.equal(staleLine('{"type":"error","error":"x"}\n', at), null);
  assert.equal(staleLine(undefined, at), null);
});

/* ---------- aplikace: runSearch předá stáří, patička radaru ho ukáže ---------- */
const FLIGHTS = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
const cut = (re, what) => { const m = FLIGHTS.match(re); assert.ok(m, what); return m[0]; };

test('aplikace: starší výsledek odklad po přetížení (Retry-After) nezruší, nové hledání ano', async () => {
  const code = [
    cut(/^ {2}async function httpErr\(r\) \{[\s\S]*?^ {2}function retryTick\(b\) \{[\s\S]*?^ {2}\}$/m, 'flights.js: httpErr … retryTick'),
    cut(/^ {2}async function runSearch\([\s\S]*?^ {2}\}$/m, 'flights.js: runSearch'),
    'globalThis.T = { runSearch, overloadNow };',
  ].join('\n');
  const answers = [];
  const ctx = { window: {}, fetch: async () => answers.shift(), TextDecoder, JSON, Date, Math, URL, console, setInterval, clearInterval, setTimeout, clearTimeout, AbortController, AbortSignal };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../public/js/pwa.js', import.meta.url), 'utf8'), ctx);
  ctx.Pwa = ctx.window.Pwa;
  vm.runInContext(code, ctx, { filename: 'flights-search.js' });
  const line = ndjsonLine({ type: 'result', result: { groups: [], providers: [] } });
  answers.push(new Response(JSON.stringify({ error: 'ATLAS teď hledá pro hodně lidí najednou – zkus to prosím za minutu.' }), { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '60' } }));
  await assert.rejects(ctx.T.runSearch({ from: ['ap:PRG'] }));
  const ov = ctx.T.overloadNow();
  assert.ok(ov, 'odklad po 503');
  answers.push(new Response(staleLine(line, Date.now() - 5 * 60e3), { status: 200 }));
  assert.equal((await ctx.T.runSearch({ radar: true })).staleAgeS, 300);
  assert.equal(ctx.T.overloadNow(), ov, 'starší výsledek (server ho pošle i při plné frontě) odklad nezruší');
  answers.push(new Response(line, { status: 200 }));
  await ctx.T.runSearch({ radar: true });
  assert.equal(ctx.T.overloadNow(), null, 'hledání, které server přijal, ano');
});

test('aplikace: runSearch u staršího výsledku vrátí staleAgeS (podle serveru), u běžného ne', async () => {
  const code = [
    cut(/^ {2}async function httpErr\(r\) \{[\s\S]*?^ {2}\}$/m, 'flights.js: httpErr'),
    'let overload = null;',
    cut(/^ {2}async function runSearch\([\s\S]*?^ {2}\}$/m, 'flights.js: runSearch'),
    'globalThis.T = { runSearch };',
  ].join('\n');
  const answers = [];
  const ctx = { window: {}, fetch: async () => answers.shift(), TextDecoder, JSON, Date, Math };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'flights-search.js' });
  const result = { groups: [{ dest: { label: 'Řím' } }], providers: [] };
  const line = ndjsonLine({ type: 'result', result });
  answers.push(new Response(staleLine(line, Date.now() - 12 * 60e3), { status: 200 }));
  const r = await ctx.T.runSearch({ radar: true });
  assert.equal(r.staleAgeS, 720);
  assert.deepEqual(r.groups, result.groups);
  answers.push(new Response(line, { status: 200 }));
  assert.equal((await ctx.T.runSearch({ radar: true })).staleAgeS, undefined);
});

test('aplikace: patička radaru „Aktualizováno 14:02 (před 12 min)“ – stáří jen u cen starších 2 min', () => {
  const ctx = { window: {}, Date };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../public/js/alerts.js', import.meta.url), 'utf8'), ctx);
  ctx.Alerts = ctx.window.Alerts;
  vm.runInContext(cut(/^ {2}const radarAgo = .*$/m, 'flights.js: radarAgo') + '\nglobalThis.radarAgo = radarAgo;', ctx);
  const now = Date.now();
  assert.equal(ctx.radarAgo(now - 12 * 60e3), ' (před 12 min)');
  assert.equal(ctx.radarAgo(now - 30e3), '', 'čerstvé bez stáří');
  assert.equal(ctx.radarAgo(now - 3 * 36e5), ' (před 3 h)');
  assert.equal(ctx.radarAgo(undefined), '');
  assert.equal(ctx.radarAgo(0), '', 'bez času nic');
  // radar uloží výsledek (i do paměti cen) s časem spočítání (stáří od serveru), ne s časem příchodu
  assert.match(FLIGHTS, /const at = Date\.now\(\) - \(res\.staleAgeS > 0 \? res\.staleAgeS \* 1e3 : 0\);\s+PriceCheck\.remember\(res, \{ now: at \}\);/);
  assert.match(FLIGHTS, /SearchHelp\.radarEntry\(radarCached\(q\), items, key, at,/);
  // ↻ Obnovit u radaru s cenami: newerThanS = stáří cen na obrazovce; jinak bez něj
  assert.match(FLIGHTS, /radarSearch\(q, key, force && old \? Math\.max\(0, Math\.floor\(\(Date\.now\(\) - old\.at\) \/ 1000\)\) : null\)/);
});
