// Pomáhat se zlepšováním: záznam průchodu návštěvou a podrobnější počty jen se souhlasem – server/lib/traces.js
// (čištění, strop, zápis do Upstash, odvolání), POST /api/trace a GET /api/traces, klient public/js/count.js přes
// node:vm (bez souhlasu nic neposílá ani neposlouchá) a souhrny pro stránku Statistiky (public/js/statistiky.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { config } = await import('../server/config.js');
const { EVENTS } = await import('../server/lib/counts.js');
const { cleanTrace, makeTraces, memoryTraces, upstashTraces, TRACE_EVENTS, CAP, TTL_SEC, MAX_STEPS } = await import('../server/lib/traces.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const T0 = Date.UTC(2027, 0, 12, 10, 0, 0);
const ID = 'ab12cd34';

/* ---------- server/lib/traces.js ---------- */
test('cleanTrace: jen id [a-z0-9]{8}, neklesající celé sekundy a názvy bez Plus, průzkumu a odpovědí', () => {
  assert.deepEqual(cleanTrace({ id: ID, s: [[0, 'view_dashboard'], [12, 'search_done'], [12, 'rage_flights']] }), { id: ID, steps: [[0, 'view_dashboard'], [12, 'search_done'], [12, 'rage_flights']] });
  assert.deepEqual(cleanTrace({ id: ID, del: 1 }), { id: ID, del: true });
  const bad = [
    null, 'x', {}, { id: 'AB12CD34', s: [[0, 'app_open']] }, { id: 'ab12cd3', s: [[0, 'app_open']] }, { id: ID, s: [] },
    { id: ID, s: [[0, 'price_199']] }, { id: ID, s: [[0, 'mq_empty_lost']] }, { id: ID, s: [[0, 'plus_offer_click']] },
    { id: ID, s: [[0, 'limit_shown']] }, { id: ID, s: [[0, 'look_letsi']] }, { id: ID, s: [[0, 'search_empty']] },
    { id: ID, s: [[0, 'Praha → Řím']] }, { id: ID, s: [[0, 'app_open', 'navíc']] }, { id: ID, s: [[5, 'app_open'], [4, 'search_done']] },
    { id: ID, s: [[1.5, 'app_open']] }, { id: ID, s: [[-1, 'app_open']] }, { id: ID, s: [[86401, 'app_open']] },
    { id: ID, s: Array.from({ length: MAX_STEPS + 1 }, () => [0, 'app_open']) }, { id: ID, del: true },
  ];
  for (const b of bad) assert.equal(cleanTrace(b), null, JSON.stringify(b).slice(0, 80));
  // povolená podmnožina: view_*, hlavní akce a rage_*, nic z ochoty platit a odpovědí
  assert.ok(TRACE_EVENTS.includes('view_flights') && TRACE_EVENTS.includes('rage_world') && TRACE_EVENTS.includes('trip_saved'));
  assert.ok(TRACE_EVENTS.every((e) => EVENTS.includes(e) && !/^(price_|plus_|limit_|mq_)/.test(e)));
});

/** Upstash ve falešné síti: zapamatuje si každý pipeline dotaz, HLEN vrátí hlen. */
function fakeUpstash(hlen = 0, hash = {}) {
  const calls = [];
  const req = async (url, o) => {
    calls.push({ url, cmds: o.body });
    return o.body.map(([c]) => ({ result: c === 'HLEN' ? hlen : c === 'HGETALL' ? Object.entries(hash).flat() : 1 }));
  };
  return { store: upstashTraces('https://eu1.upstash.example', 'tok', req), calls };
}

test('flush: HLEN + HSET + EXPIRE na 30 dní jednou za okno, nic víc; bez záznamů žádný dotaz', async () => {
  const { store, calls } = fakeUpstash(0);
  const t = makeTraces(store, { now: () => T0 });
  await t.flush();
  assert.equal(calls.length, 0);
  assert.ok(t.add(cleanTrace({ id: ID, s: [[0, 'view_flights']] })));
  assert.ok(t.add(cleanTrace({ id: ID, s: [[0, 'view_flights'], [40, 'search_done']] })), 'novější odeslání téže návštěvy přepíše');
  assert.ok(t.add(cleanTrace({ id: 'zz99zz99', s: [[0, 'view_trip']] })));
  await t.flush();
  assert.deepEqual(calls.map((c) => c.cmds), [
    [['HLEN', 'tr:2027-01-12']],
    [['HSET', 'tr:2027-01-12', ID, '[[0,"view_flights"],[40,"search_done"]]', 'zz99zz99', '[[0,"view_trip"]]'], ['EXPIRE', 'tr:2027-01-12', String(30 * 86400)]],
  ]);
  assert.equal(TTL_SEC, 2592000);
  assert.ok(calls.every((c) => c.url === 'https://eu1.upstash.example/pipeline'));
  await t.flush();
  assert.equal(calls.length, 2, 'nic nového = žádný zápis');
});

test('strop návštěv za den přes HLEN (přežije restart); další kroky už zapsané návštěvy se do stropu nepočítají', async () => {
  const { store, calls } = fakeUpstash(CAP - 1);
  const t = makeTraces(store, { now: () => T0 });
  t.add(cleanTrace({ id: 'aaaaaaaa', s: [[0, 'app_open']] }));
  t.add(cleanTrace({ id: 'bbbbbbbb', s: [[0, 'app_open']] }));
  await t.flush();
  const hset = calls.find((c) => c.cmds[0][0] === 'HSET').cmds[0];
  assert.deepEqual(hset.slice(2).filter((_, i) => i % 2 === 0), ['aaaaaaaa'], 'jen jedna nová se vejde');
  calls.length = 0;
  t.add(cleanTrace({ id: 'aaaaaaaa', s: [[0, 'app_open'], [9, 'search_done']] }));
  t.add(cleanTrace({ id: 'cccccccc', s: [[0, 'app_open']] }));
  const full = fakeUpstash(CAP);
  Object.assign(store, { hlen: full.store.hlen }); // den je plný
  await t.flush();
  const h2 = calls.find((c) => c.cmds[0][0] === 'HSET').cmds[0];
  assert.deepEqual(h2.slice(2).filter((_, i) => i % 2 === 0), ['aaaaaaaa']);
  // v paměti mezi zápisy nejvýš CAP návštěv
  const m = makeTraces(memoryTraces(), { now: () => T0, cap: 2 });
  assert.deepEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc'].map((id) => m.add(cleanTrace({ id, s: [[0, 'app_open']] }))), [true, true, false]);
});

test('odvolání {id, del:1}: pryč z paměti a HDEL dnes i včera; nepovedený zápis se zahodí', async () => {
  const { store, calls } = fakeUpstash(0);
  const t = makeTraces(store, { now: () => T0 + 3600e3 });
  t.add(cleanTrace({ id: ID, s: [[0, 'app_open']] }));
  t.add(cleanTrace({ id: ID, del: 1 }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls.map((c) => c.cmds), [[['HDEL', 'tr:2027-01-12', ID], ['HDEL', 'tr:2027-01-11', ID]]]);
  await t.flush();
  assert.equal(calls.length, 1, 'odvolaná návštěva se už nezapíše');
  const broken = makeTraces({ kind: 'x', hlen: async () => { throw new Error('výpadek'); }, write: async () => assert.fail('nezapisovat'), read: async () => [], del: async () => {} }, { now: () => T0 });
  broken.add(cleanTrace({ id: ID, s: [[0, 'app_open']] }));
  await assert.doesNotReject(broken.flush());
});

test('traces(): jen kroky bez ID a dne, období 7–30 dní, 30 dní jedním dotazem a mezipaměť', async () => {
  const { store, calls } = fakeUpstash(0, { [ID]: '[[0,"app_open"],[5,"view_flights"]]', zz99zz99: 'poškozené' });
  let now = T0;
  const t = makeTraces(store, { now: () => now });
  const r = await t.traces(7);
  assert.equal(r.days, 7);
  assert.deepEqual(plain(r.visits), Array(7).fill([[0, 'app_open'], [5, 'view_flights']]));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmds.length, 30, 'HGETALL 30 dní v jednom pipeline');
  assert.equal((await t.traces(90)).days, 30);
  assert.equal((await t.traces('x')).days, 30);
  assert.equal(calls.length, 1, 'do 10 minut z mezipaměti');
  now += 11 * 60e3;
  await t.traces(7);
  assert.equal(calls.length, 2);
});

test('POST /api/trace: 204 vždy (i zahozený záznam), jen POST, tělo nad 4 KB 413, 30 za 10 minut z adresy', async () => {
  const post = (body, ip = '203.0.113.50') => fetch(`${base}/api/trace`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body });
  assert.equal((await post(JSON.stringify({ id: ID, s: [[0, 'app_open']] }))).status, 204);
  assert.equal((await post('nesmysl')).status, 204);
  assert.equal((await post(JSON.stringify({ id: ID, s: [[0, 'price_799']] }))).status, 204);
  assert.equal((await fetch(`${base}/api/trace`)).status, 405);
  assert.equal((await post('x'.repeat(5000), '203.0.113.51')).status, 413);
  for (let i = 0; i < 26; i++) await post('{}', '203.0.113.52');
  for (let i = 0; i < 4; i++) assert.equal((await post('{}', '203.0.113.52')).status, 204);
  assert.equal((await post('{}', '203.0.113.52')).status, 429, '31. za 10 minut');
});

test('GET /api/traces: bez STATS_KEY 404, bez klíče a se špatným 401, se správným 200 + no-store', async () => {
  assert.equal((await fetch(`${base}/api/traces`)).status, 404, 'pseudonymní údaje nikdy veřejně');
  config.statsKey = 'klic-ke-statistikam-0123456789';
  try {
    const get = (auth) => fetch(`${base}/api/traces?days=7`, { headers: { 'x-forwarded-for': '198.51.100.70', ...(auth ? { authorization: auth } : {}) } });
    assert.equal((await get()).status, 401);
    assert.equal((await get('Bearer spatny')).status, 401);
    const ok = await get('Bearer klic-ke-statistikam-0123456789');
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    const j = await ok.json();
    assert.equal(j.days, 7);
    assert.ok(Array.isArray(j.visits));
  } finally {
    config.statsKey = '';
  }
  const idx = read('server/index.js');
  assert.match(idx, /Promise\.all\(\[counter\.flush\(\), traces\.flush\(\)\]\)/, 'záznamy se zapíšou i při SIGTERM');
});

/* ---------- public/js/count.js ve falešném prohlížeči ---------- */
const COUNT_SRC = read('public/js/count.js');
function browser({ help = null } = {}) {
  const log = { beacons: [], listen: [], stored: {} };
  let now = T0;
  const ls = { getItem: (k) => (k in log.stored ? log.stored[k] : null), setItem: (k, v) => { log.stored[k] = String(v); } };
  if (help !== null) log.stored.atlas_help = help;
  const on = (who) => ({
    addEventListener: (type, f) => log.listen.push([who, type, f]),
    removeEventListener: (type, f) => { log.listen = log.listen.filter((x) => !(x[0] === who && x[1] === type && x[2] === f)); },
  });
  const doc = { baseURI: 'https://letsi.example/', visibilityState: 'visible', ...on('document') };
  const ctx = {
    URL, JSON, String, Math, Array, Uint8Array, Set, Object, Number,
    Date: { now: () => now },
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } },
    localStorage: ls, document: doc,
    navigator: { onLine: true, sendBeacon: (url, body) => { log.beacons.push({ url: url.replace('https://letsi.example/', ''), body: JSON.parse(body) }); return true; } },
  };
  ctx.window = Object.assign(ctx, on('window'));
  vm.createContext(ctx);
  vm.runInContext(COUNT_SRC, ctx, { filename: 'count.js' });
  const fire = (type) => log.listen.filter((x) => x[1] === type).forEach((x) => x[2]({ target: null }));
  const hide = () => { doc.visibilityState = 'hidden'; fire('visibilitychange'); doc.visibilityState = 'visible'; };
  const traces = () => log.beacons.filter((b) => b.url === 'api/trace').map((b) => b.body);
  const counts = () => log.beacons.filter((b) => b.url === 'api/count').map((b) => b.body.e);
  return { C: ctx.Count, log, hide, traces, counts, tick: (ms) => { now += ms; }, now: () => now };
}

test('count.js bez souhlasu: deep nic nepošle, žádný posluchač, nic v úložišti, rage se nepočítá', () => {
  for (const help of [null, '0']) {
    const b = browser({ help });
    assert.equal(b.C.helping(), false);
    assert.equal(b.C.deep('search_done'), false);
    assert.equal(b.C.deep('search_done', 'h1'), false);
    b.C.view('flights');
    b.C.hit('search_done');
    b.hide();
    assert.deepEqual(b.counts(), ['view_flights', 'search_done'], 'jen původní souhrnné počty');
    assert.deepEqual(b.traces(), [], 'žádný záznam návštěvy');
    assert.deepEqual(b.log.listen, [], 'žádný globální posluchač klepnutí ani odchodu');
    assert.deepEqual(Object.keys(b.log.stored), help === null ? [] : ['atlas_help']);
  }
});

test('count.js souhlas: atlas_help až po klepnutí, deep pošle počet a přidá krok, once, záznam při odchodu', () => {
  const b = browser();
  b.C.view('dashboard');
  assert.deepEqual(b.log.stored, {}, 'před volbou nic');
  b.C.consent(true);
  assert.deepEqual(b.log.stored, { atlas_help: '1' });
  assert.deepEqual(b.log.listen.map((x) => `${x[0]}:${x[1]}`).sort(), ['document:pointerup', 'document:visibilitychange', 'window:pagehide']);
  b.tick(4000);
  assert.equal(b.C.deep('dash_search'), true);
  b.tick(3000);
  assert.equal(b.C.deep('flt_sort', 's1'), true);
  assert.equal(b.C.deep('flt_sort', 's1'), false, 'stejná dvojice podruhé ne');
  assert.equal(b.C.deep('flt_sort', 's2'), true);
  b.C.hit('plus_offer_click'); // nabídka Plus se počítá jako dřív, ale do záznamu nesmí
  b.C.hit('mq_trip_good');
  b.C.view('flights');
  assert.deepEqual(b.counts(), ['view_dashboard', 'dash_search', 'flt_sort', 'flt_sort', 'plus_offer_click', 'mq_trip_good', 'view_flights']);
  assert.deepEqual(b.traces(), [], 'odesílá se až při odchodu');
  b.hide();
  const [t] = b.traces();
  assert.match(t.id, /^[a-z0-9]{8}$/);
  assert.deepEqual(t.s, [[0, 'view_dashboard'], [4, 'dash_search'], [7, 'flt_sort'], [7, 'flt_sort'], [7, 'view_flights']], 'záznam od souhlasu, sekundy od začátku');
  assert.deepEqual(Object.keys(t).sort(), ['id', 's'], 'nic jiného než ID a kroky');
  b.hide();
  assert.equal(b.traces().length, 1, 'bez nových kroků se znovu neposílá');
  b.C.hit('search_done');
  b.hide();
  assert.equal(b.traces()[1].id, t.id);
  assert.equal(b.traces()[1].s.length, 6);
  // ID ani kroky nikde v úložišti
  assert.deepEqual(b.log.stored, { atlas_help: '1' });
});

test('count.js: po 30 minutách nečinnosti nová návštěva s novým ID; uložený souhlas platí od načtení', () => {
  const b = browser({ help: '1' });
  assert.equal(b.C.helping(), true);
  assert.equal(b.log.listen.length, 3, 'posluchače hned');
  b.C.view('flights');
  b.tick(31 * 60e3);
  b.C.view('trip');
  b.hide();
  const [a, c] = b.traces();
  assert.notEqual(a.id, c.id);
  assert.deepEqual([a.s, c.s], [[[0, 'view_flights']], [[0, 'view_trip']]]);
});

test('count.js odvolání: smaže záznam téhle návštěvy (del), přestane poslouchat i posílat', () => {
  const b = browser();
  b.C.consent(true);
  b.C.deep('dash_search');
  b.hide();
  const id = b.traces()[0].id;
  b.C.consent(false);
  assert.deepEqual(b.traces()[1], { id, del: 1 });
  assert.deepEqual(b.log.stored, { atlas_help: '0' });
  assert.deepEqual(b.log.listen, []);
  assert.equal(b.C.deep('dash_search'), false);
  b.C.hit('search_done');
  b.hide();
  assert.equal(b.traces().length, 2, 'po vypnutí žádný další záznam');
  // znovu zapnuté = nová návštěva, nic se nenavazuje
  b.C.consent(true);
  b.C.hit('search_done');
  b.hide();
  assert.notEqual(b.traces()[2].id, id);
});

test('count.js rage: 3 klepnutí do 1 s na tentýž prvek = rage_<sekce> jednou za shluk, nejvýš 5×; pole a stepper ne', () => {
  const b = browser();
  b.C.view('flights');
  b.C.consent(true);
  const el = (skip = false) => ({ closest: (sel) => (skip && sel.includes('input') ? {} : null) });
  const btn = el();
  const tap = (x, ms = 200) => { b.tick(ms); return b.C.rageTap(x, b.now()); };
  assert.deepEqual([tap(btn), tap(btn), tap(btn), tap(btn)], [null, null, 'rage_flights', null], 'čtvrté ve stejném shluku už ne');
  b.tick(1500);
  assert.deepEqual([tap(btn), tap(btn), tap(btn)], [null, null, 'rage_flights'], 'po pauze nový shluk');
  assert.deepEqual([tap(btn), tap(el()), tap(btn), tap(btn)], [null, null, null, null], 'jiný prvek shluk přeruší');
  b.tick(1500);
  assert.deepEqual([tap(btn, 600), tap(btn, 600), tap(btn, 600)], [null, null, null], 'pomalé klepání není');
  const input = el(true);
  assert.deepEqual([tap(input), tap(input), tap(input)], [null, null, null]);
  for (let i = 0; i < 5; i++) { b.tick(2000); tap(btn); tap(btn); tap(btn); }
  b.tick(2000);
  assert.deepEqual([tap(btn), tap(btn), tap(btn)], [null, null, null], 'nejvýš 5× za načtení');
  // posluchač pošle počet a krok jen se sekcí – nic o prvku
  const b2 = browser({ help: '1' });
  b2.C.view('explore');
  const up = b2.log.listen.find((x) => x[1] === 'pointerup')[2];
  const x = el();
  for (let i = 0; i < 3; i++) { b2.tick(100); up({ target: x }); }
  assert.deepEqual(b2.counts(), ['view_explore', 'rage_explore']);
  for (const e of ['rage_dashboard', 'rage_flights', 'rage_trip', 'rage_explore', 'rage_world']) assert.ok(EVENTS.includes(e) && COUNT_SRC.includes(`'${e}'`), e);
});

test('aplikace: karta souhlasu až od další návštěvy, obě tlačítka stejná, přepínač v Další a v O aplikaci', () => {
  const app = read('public/js/app.js');
  const card = app.match(/function helpCard\(el\) \{[\s\S]*?\n\}/)[0];
  assert.match(card, /localStorage\.getItem\('atlas_help'\) != null/);
  assert.match(card, /if \(chosen \|\| wnFirst \|\| !window\.Count \|\| !Count\.consent\) return;/, 'ne při první návštěvě (uvítání)');
  assert.match(card, /<button type="button" class="btn" data-help="1">Zapnout<\/button><button type="button" class="btn" data-help="0">Ne, díky<\/button>/);
  assert.match(card, /Záznam nese jen náhodné číslo návštěvy, žádné jméno ani IP adresu, a smaže se nejpozději do 31 dnů\. Platí, dokud to nevypneš v Další\./);
  assert.doesNotMatch(card, /setItem/, 'volbu zapisuje jen Count.consent po klepnutí');
  assert.match(app, /if \(el\.hidden\) return helpCard\(el\);/);
  assert.match(app, /helpSwitch\(\$\('#moreHelp'\)\);/);
  assert.match(app, /toast\(on \? 'Zapnuto\. Díky, že pomáháš!' : 'Vypnuto\. Záznam téhle návštěvy jsem smazal\.'\)/);
  assert.match(read('public/js/about.js'), /helpSwitch\(document\.querySelector\('#abHelp'\)\)/);
  // ostatní volají vždy s pojistkou (starší count.js v otevřené záložce deep nemá)
  for (const f of ['app.js', 'flights.js', 'trip.js', 'places.js']) {
    const src = read(`public/js/${f}`);
    assert.deepEqual([...src.matchAll(/[^\n]{0,40}Count\.deep\(/g)].filter((m) => !/Count && Count\.deep && Count\.deep\($/.test(m[0])).map((m) => m[0]), [], f);
  }
});

/* ---------- Statistiky: Cesty návštěv (čisté funkce) ---------- */
test('statistiky: kde návštěvy končí, co dělali před odchodem, začátky, co následovalo po rage, medián délky', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/statistiky.js'), ctx);
  const S = ctx.window.Stats;
  const v = [
    [[0, 'view_dashboard'], [5, 'view_flights'], [6, 'view_flights'], [40, 'search_done'], [50, 'rage_flights']],
    [[0, 'view_dashboard'], [5, 'view_flights'], [30, 'search_done'], [100, 'buy_click']],
    [[0, 'view_trip'], [20, 'rage_trip'], [25, 'view_dashboard']],
  ];
  assert.deepEqual(plain(S.names(v[0])), ['view_dashboard', 'view_flights', 'search_done', 'rage_flights'], 'opakování hned po sobě = jeden krok');
  assert.deepEqual(plain(S.exits(v)), [['buy_click', 1, 33], ['rage_flights', 1, 33], ['view_dashboard', 1, 33]]);
  assert.deepEqual(plain(S.lastSteps(v, 2))[0], ['rage_trip → view_dashboard', 1, 33]);
  assert.deepEqual(plain(S.topPaths(v, 2))[0], ['view_dashboard → view_flights', 2, 67]);
  assert.deepEqual(plain(S.after(v, (e) => e.startsWith('rage_'))), [['(odchod)', 1, 50], ['view_dashboard', 1, 50]]);
  assert.deepEqual(plain(S.visitStats(v)), { n: 3, median: 50 });
  assert.deepEqual(plain(S.visitStats([])), { n: 0, median: null });
  assert.deepEqual(plain(S.exits(null)), []);
  assert.equal(S.RAGE.length, 5);
  // jednotlivé návštěvy se na stránce neukazují – jen souhrny (zásady 3.7)
  assert.doesNotMatch(read('public/js/statistiky.js'), /náhodn\w* návštěv/i);
});
