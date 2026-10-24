// Nával uživatelů: limit z jedné adresy s omezenou pamětí, mezipaměť s úklidem a pojistkou paměti, sdílené stejné
// hledání, hotový výsledek stejného hledání na chvíli z paměti, strop souběžných hledání s frontou, strop rozběhnutých
// hledání na adresu, časové limity příjmu požadavku a pojistky po 429 u Ryanairu a Wizz Air.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stubFetch, ymdPlus } from './helpers.js';

// Malý strop, ať se dá ověřit fronta i odmítnutí (config se čte při prvním importu – proto až dynamické importy níž).
process.env.ATLAS_MOCK = '1';
process.env.SEARCH_CONCURRENCY = '1';
process.env.SEARCH_QUEUE = '1';
const { RateLimiter } = await import('../server/lib/ratelimit.js');
const { TTLCache } = await import('../server/lib/cache.js');
const { sharedRuns, gate, perClient, recentResults } = await import('../server/lib/crowd.js');
const { createServer, _searchClients, completeResult } = await import('../server/index.js');
const { config } = await import('../server/config.js');
const { mockProviders } = await import('../server/providers/mock.js');
const { ryanair, _resetRyanairBlock } = await import('../server/providers/ryanair.js');
const { wizzair } = await import('../server/providers/wizzair.js');
const { providerStatus } = await import('../server/providers/index.js');
const { ONE_WAY } = await import('./fixtures/ryanair.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('RateLimiter: limit v okně, za kolik sekund znovu, klouzavé okno', () => {
  const rl = new RateLimiter({ windowMs: 60e3 });
  const t0 = 1_000_000;
  assert.equal(rl.hit('a', 2, t0), 0);
  assert.equal(rl.hit('a', 2, t0 + 10e3), 0);
  assert.equal(rl.hit('a', 2, t0 + 20e3), 40, 'nejstarší vypadne z okna za 40 s');
  assert.equal(rl.hit('b', 2, t0 + 20e3), 0, 'jiná adresa má vlastní limit');
  assert.equal(rl.hit('a', 2, t0 + 60e3 + 1), 0, 'po minutě zase projde');
  assert.equal(rl.hit('a', 0, t0), 0, '0 = bez limitu');
});

test('RateLimiter: omezená paměť – neaktivní adresy pryč, aktivní limit zůstane (dřív se při 5 000 adresách smazal všem)', () => {
  const rl = new RateLimiter({ windowMs: 60e3, maxKeys: 100 });
  const t0 = 1_000_000;
  for (let i = 0; i < 95; i++) rl.hit(`stara-${i}`, 5, t0);
  rl.hit('vytrvalec', 1, t0 + 59e3);
  assert.equal(rl.size, 96);
  // o minutu později: staré adresy jsou mimo okno → při překročení stropu zmizí, vytrvalec má limit dál vyčerpaný
  for (let i = 0; i < 60; i++) rl.hit(`nova-${i}`, 5, t0 + 61e3);
  assert.ok(rl.size <= 100, `adres ${rl.size}`);
  assert.ok(rl.hit('vytrvalec', 1, t0 + 61e3) > 0, 'aktivní adresa limit neztratí');
  // nával samých nových adres: paměť drží strop (nejdéle neaktivní adresy pryč)
  for (let i = 0; i < 1000; i++) rl.hit(`naval-${i}`, 5, t0 + 62e3);
  assert.ok(rl.size <= 100, `adres ${rl.size}`);
});

test('TTLCache: prošlé záznamy se jednou za minutu uklidí, i když se na ně nikdo neptá', async () => {
  const c = new TTLCache(100, { softBytes: 0 });
  c.set('kratky', 1, 1);
  c.set('dlouhy', 2, 60e3);
  await sleep(5);
  c.set('dalsi', 3, 60e3);
  assert.ok(c.map.has('kratky'), 'do minuty se neuklízí');
  c.swept = Date.now() - 61e3;
  c.set('jeste', 4, 60e3);
  assert.equal(c.map.has('kratky'), false);
  assert.deepEqual([...c.map.keys()], ['dlouhy', 'dalsi', 'jeste']);
});

test('TTLCache: nad měkkým stropem paměti zahodí starší polovinu – nejvýš jednou za 30 s', () => {
  let rss = 50;
  const c = new TTLCache(100, { softBytes: 100, rss: () => rss });
  for (let i = 0; i < 10; i++) c.set(`k${i}`, i, 60e3);
  c.memChecked = 0;
  c.set('k10', 10, 60e3);
  assert.equal(c.map.size, 11, 'pod stropem nic');
  rss = 200;
  c.memChecked = 0;
  c.set('k11', 11, 60e3);
  assert.equal(c.stats().trims, 1);
  assert.equal(c.get('k0'), undefined, 'nejstarší pryč');
  assert.equal(c.get('k10'), 10, 'novější zůstávají');
  assert.equal(c.get('k11'), 11);
  assert.equal(c.map.size, 6);
  c.memChecked = 0;
  c.set('k12', 12, 60e3);
  assert.equal(c.stats().trims, 1, 'další zahození až po 30 s (paměť se uvolňuje s GC)');
});

test('sharedRuns: stejná práce jednou pro všechny, pozdě příchozí dostane poslední průběh hned, chyba jednoho odběratele neshodí ostatní', async () => {
  const run = sharedRuns();
  let calls = 0;
  let release;
  const work = async (fan) => {
    calls++;
    fan({ type: 'progress', n: 1 });
    await new Promise((r) => { release = r; });
    fan({ type: 'progress', n: 2 });
    return { ok: calls };
  };
  const a = [];
  const b = [];
  const pa = run('k', work, (ev) => a.push(ev.n));
  await sleep(1);
  assert.equal(run.has('k'), true);
  const pb = run('k', work, (ev) => b.push(ev.n));
  run('k', work, () => { throw new Error('zavřené spojení'); });
  release();
  assert.deepEqual(await pa, { ok: 1 });
  assert.equal(await pb, await pa, 'stejný výsledek');
  assert.equal(calls, 1);
  assert.deepEqual(a, [1, 2]);
  assert.deepEqual(b, [1, 2], 'průběh 1 zopakovaný při připojení, 2 živě');
  assert.equal(run.has('k'), false, 'doběhlé se nesdílí');
  // chyba práce dostanou všichni
  const fail = async () => { await sleep(5); throw new Error('výpadek'); };
  await Promise.all([assert.rejects(run('e', fail, () => {}), /výpadek/), assert.rejects(run('e', fail, () => {}), /výpadek/)]);
  // chyba se sdílí jen po dobu běhu: další stejné hledání se spustí znovu (nedostane starou chybu)
  assert.equal(run.has('e'), false);
  assert.deepEqual(await run('e', async () => 'znovu', () => {}), 'znovu');
});

test('gate: strop souběžných úloh, fronta, plná fronta, úloha klienta, který odešel, se nespustí', async () => {
  const g = gate(1, 1);
  const order = [];
  const job = (id, ms) => async () => { order.push(`start ${id}`); await sleep(ms); order.push(`end ${id}`); return id; };
  assert.equal(g.full(), false);
  const p1 = g(job(1, 20));
  const p2 = g(job(2, 1));
  assert.equal(g.full(), true);
  assert.deepEqual(g.stats(), { active: 1, queued: 1, concurrency: 1, maxQueue: 1 });
  assert.deepEqual(await Promise.all([p1, p2]), [1, 2]);
  assert.deepEqual(order, ['start 1', 'end 1', 'start 2', 'end 2']);
  let ran = false;
  const p3 = g(job(3, 20));
  const p4 = g(async () => { ran = true; }, () => true);
  assert.equal(await p4, null);
  assert.equal(await p3, 3);
  assert.equal(ran, false);
  // plná fronta, ale klient čekající úlohy mezitím odešel: místo se uvolní pro nový požadavek
  let left = false;
  const p5 = g(job(5, 20));
  const p6 = g(async () => { ran = true; }, () => left);
  assert.equal(g.full(), true);
  left = true;
  assert.equal(g.full(), false);
  assert.equal(await p6, null);
  assert.equal(await p5, 5);
  assert.equal(ran, false);
  await assert.rejects(g(async () => { throw new Error('x'); }), /x/);
  assert.deepEqual(g.stats(), { active: 0, queued: 0, concurrency: 1, maxQueue: 1 });
});

test('perClient: strop na klienta, místo se vrátí jen jednou (konec i odchod klienta), prázdný klient zmizí z paměti', () => {
  const pc = perClient();
  assert.equal(pc.full('a', 2), false);
  const r1 = pc.take('a');
  const r2 = pc.take('a');
  assert.equal(pc.full('a', 2), true);
  assert.equal(pc.full('a', 3), false);
  assert.equal(pc.full('a', 0), false, '0 = bez stropu');
  assert.equal(pc.full('b', 2), false, 'jiná adresa má vlastní strop');
  r1();
  r1(); // odchod klienta i konec hledání – podruhé už nic nevrací
  assert.equal(pc.count('a'), 1);
  assert.equal(pc.full('a', 2), false);
  r2();
  assert.equal(pc.count('a'), 0);
  assert.equal(pc.size, 0, 'klient bez hledání v paměti nezůstane');
  // tisíc adres, každá jedno hledání: po skončení prázdno
  const rel = Array.from({ length: 1000 }, (_, i) => pc.take(`10.0.${i >> 8}.${i & 255}`));
  assert.equal(pc.size, 1000);
  rel.forEach((r) => r());
  assert.equal(pc.size, 0);
});

test('recentResults: hotový výsledek jen do ttl, celkem do maxBytes (ven nejdřív prošlé a nejstarší), ttl 0 = nic', () => {
  const r = recentResults({ ttlMs: 1000, maxBytes: 100 });
  assert.equal(r.set('a', 'A', 40, 0), true);
  assert.equal(r.set('b', 'B', 40, 10), true);
  assert.equal(r.get('a', 999), 'A');
  assert.equal(r.get('a', 1000), undefined, 'po ttl pryč');
  assert.equal(r.size, 1);
  assert.equal(r.set('c', 'C', 40, 20), true);
  assert.equal(r.set('d', 'D', 40, 30), true); // 120 > 100 → nejstarší (b) ven
  assert.equal(r.get('b', 30), undefined);
  assert.deepEqual([r.get('c', 30), r.get('d', 30)], ['C', 'D']);
  assert.equal(r.bytes, 80);
  assert.equal(r.set('e', 'E', 101, 40), false, 'větší než celý strop se neuloží');
  assert.equal(r.set('c', 'C2', 40, 50), true, 'nový výsledek téhož dotazu nahradí starý');
  assert.equal(r.get('c', 50), 'C2');
  assert.equal(r.bytes, 80);
  assert.equal(r.set('f', 'F', 40, 2000), true, 'prošlé záznamy uvolní místo');
  assert.deepEqual([r.size, r.bytes], [1, 40]);
  const off = recentResults({ ttlMs: 0, maxBytes: 100 });
  assert.equal(off.set('a', 'A', 1), false);
  assert.equal(off.get('a'), undefined);
});

test('completeResult: na chvíli se drží jen výsledek, který by stejné hledání hned zopakovalo', () => {
  const ok = { id: 'ryanair', state: 'done', error: null, outage: null, failed: 0, note: null };
  const r = (...ps) => ({ groups: [], providers: ps });
  // vynechané trasy bez paměti tras (pevný rozpočet od nejbližších) dopadnou napodruhé stejně
  assert.equal(completeResult(r(ok, { ...ok, id: 'wizzair', coverage: { total: 10, live: 10, memory: 0, skipped: 0 }, note: 'prohledáno 40 nejbližších z 90 tras – zbytek kvůli limitu dotazů' })), true);
  for (const bad of [{ state: 'partial' }, { state: 'error', error: 'x' }, { error: '1/3 dotazů selhalo' }, { outage: 'partial' }, { failed: 1 },
    { coverage: { total: 10, live: 6, memory: 0, skipped: 4 } }, { coverage: { total: 10, live: 6, memory: 4, skipped: 0 } },
    { note: 'celý svět + dálkové země · po 25 s ukončeno – 2 z 9 dotazů vynecháno' }]) {
    assert.equal(completeResult(r(ok, { ...ok, ...bad })), false, JSON.stringify(bad));
  }
  assert.equal(completeResult({ ...r(ok), partial: true }), false);
  assert.equal(completeResult(r()), false);
  assert.equal(completeResult(null), false);
});

const q = { from: ['ap:VIE'], to: ['ap:BCN'], radiusKm: 0, dateFrom: ymdPlus(20), dateTo: ymdPlus(30), trip: 'return', nightsMin: 3, nightsMax: 5 };
const post = (body, ip, signal) => fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body), signal });
const lastLine = async (r) => JSON.parse((await r.text()).trim().split('\n').at(-1));
/** Zpomalí demo zdroje (ať hledání běží déle) a počítá jejich dotazy → { calls, restore }. */
function slowMock(ms) {
  const orig = mockProviders.map((p) => p.daily);
  const calls = [];
  mockProviders.forEach((p, i) => {
    p.daily = async (a) => {
      calls.push(a);
      await sleep(ms);
      return orig[i].call(p, a);
    };
  });
  return { calls, restore: () => mockProviders.forEach((p, i) => { p.daily = orig[i]; }) };
}

test('server: časové limity příjmu požadavku (pomalý klient nedrží spojení)', () => {
  assert.equal(server.headersTimeout, 20e3);
  assert.equal(server.requestTimeout, 30e3);
});

test('server: stejné hledání od 6 lidí naráz = jedno hledání (stejně dotazů na zdroje jako jedno), výsledek dostanou všichni', async () => {
  const mock = slowMock(300);
  try {
    const one = { ...q, dateTo: ymdPlus(31) };
    assert.equal((await lastLine(await post(one, '10.1.0.1'))).type, 'result');
    const single = mock.calls.length;
    assert.ok(single > 0);
    mock.calls.length = 0;
    const same = { ...q, dateTo: ymdPlus(32) };
    // první hledání se rozběhne, ostatní přijdou, zatímco čeká na zdroje (300 ms)
    const first = post(same, '10.1.1.0');
    while (!mock.calls.length) await sleep(5);
    const rs = [await first, ...await Promise.all(Array.from({ length: 5 }, (_, i) => post(same, `10.1.1.${i + 1}`)))];
    const lines = await Promise.all(rs.map(lastLine));
    assert.ok(rs.every((r) => r.status === 200));
    assert.ok(lines.every((l) => l.type === 'result'));
    assert.equal(mock.calls.length, single, 'dotazy na zdroje jen za jedno hledání');
    assert.deepEqual(lines[5].result.groups, lines[0].result.groups);
  } finally {
    mock.restore();
  }
});

test('server: stejné hledání po doběhnutí = hotový výsledek z paměti (bez dotazů na zdroje, tentýž řádek), frontu nezabere', async () => {
  const mock = slowMock(150);
  try {
    const body = { ...q, dateTo: ymdPlus(37), noPartial: true };
    const first = (await (await post(body, '10.9.0.1')).text()).trim().split('\n');
    const ours = () => mock.calls.filter((x) => x.dateTo === ymdPlus(37)).length; // dotazy tam právě tohoto hledání
    const once = ours();
    assert.ok(once > 0);
    // strop 1 hledání + fronta 1 plné jiným hledáním – hotový výsledek přesto hned (nic se nepočítá)
    const a = await post({ ...q, dateTo: ymdPlus(38) }, '10.9.0.2');
    const b = await post({ ...q, dateTo: ymdPlus(39) }, '10.9.0.3');
    const again = await post(body, '10.9.0.4');
    assert.equal(again.status, 200);
    const lines = (await again.text()).trim().split('\n');
    assert.deepEqual(lines, [first.at(-1)], 'rovnou výsledek, tentýž do posledního znaku');
    assert.equal(JSON.parse(lines[0]).type, 'result');
    await Promise.all([a.text(), b.text()]);
    assert.equal(ours(), once, 'na zdroje jen za první hledání');
  } finally {
    mock.restore();
  }
});

test('server: neúplný výsledek (část dotazů na zdroj selhala) se nedrží – stejné hledání („Zkusit znovu“) se počítá znovu', async () => {
  const orig = mockProviders.map((p) => p.daily);
  let calls = 0;
  mockProviders.forEach((p, i) => {
    p.daily = async (a) => {
      if (++calls === 1) throw new Error('výpadek zdroje');
      return orig[i].call(p, a);
    };
  });
  try {
    const body = { ...q, dateTo: ymdPlus(40) };
    const r1 = await lastLine(await post(body, '10.9.1.1'));
    assert.equal(r1.type, 'result');
    assert.ok(r1.result.providers.some((s) => s.state === 'partial' || s.state === 'error'), 'jeden zdroj s výpadkem');
    const before = calls;
    const r2 = await lastLine(await post(body, '10.9.1.2'));
    assert.ok(calls > before, 'hledalo se znovu');
    assert.ok(r2.result.providers.every((s) => s.state === 'done'));
    const done = calls;
    const r3 = await lastLine(await post(body, '10.9.1.3'));
    assert.equal(calls, done, 'úplný výsledek už z paměti');
    assert.deepEqual(r3.result.groups, r2.result.groups);
  } finally {
    mockProviders.forEach((p, i) => { p.daily = orig[i]; });
  }
});

test('server: nad stropem souběžných hledání a frontou → 503 česky s Retry-After; čekající ve frontě doběhne', async () => {
  const mock = slowMock(150);
  try {
    // hlavičky odpovědi přijdou, až je hledání v běhu / ve frontě
    const a = await post({ ...q, dateTo: ymdPlus(33) }, '10.2.0.1');
    const b = await post({ ...q, dateTo: ymdPlus(34) }, '10.2.0.2'); // fronta
    const c = await post({ ...q, dateTo: ymdPlus(35) }, '10.2.0.3');
    assert.equal(c.status, 503);
    assert.equal(c.headers.get('retry-after'), '60');
    assert.match((await c.json()).error, /hodně lidí najednou – zkus to prosím za minutu/);
    // stejné jako běžící se i tak připojí (nic navíc nestojí)
    const a2 = await post({ ...q, dateTo: ymdPlus(33) }, '10.2.0.4');
    for (const r of [a, b, a2]) {
      assert.equal(r.status, 200);
      assert.equal((await lastLine(r)).type, 'result');
    }
  } finally {
    mock.restore();
  }
});

test('server: hledání ve frontě, jehož klient mezitím odešel, se vůbec nespustí', async () => {
  const mock = slowMock(150);
  try {
    const a = await post({ ...q, dateTo: ymdPlus(36) }, '10.3.0.1');
    const ctl = new AbortController();
    const gone = { ...q, dateFrom: ymdPlus(21), dateTo: ymdPlus(36) };
    const b = await post(gone, '10.3.0.2', ctl.signal); // ve frontě
    ctl.abort();
    await b.text().catch(() => null);
    assert.equal((await lastLine(a)).type, 'result');
    await sleep(50);
    assert.equal(mock.calls.filter((x) => x.dateFrom === ymdPlus(21)).length, 0, 'na zdroje se nešlo');
  } finally {
    mock.restore();
  }
});

test('server: hledání čekající ve frontě posílá znamení { type: wait } – aplikace ho po 2 min bez dat nevzdá (Pwa.readOrStall)', async () => {
  const mock = slowMock(500);
  const prev = config.searchPingMs;
  config.searchPingMs = 40; // v aplikaci 20 s proti 2 min API_WAIT – tady zmenšené
  try {
    const t0 = Date.now();
    const a = await post({ ...q, dateFrom: ymdPlus(24), dateTo: ymdPlus(47) }, '10.7.0.1'); // běží
    const b = await post({ ...q, dateFrom: ymdPlus(25), dateTo: ymdPlus(47) }, '10.7.0.2'); // čeká ve frontě
    // nejdelší pauza bez dat v odpovědi čekajícího (readOrStall ji měří od posledního bajtu)
    const reader = b.body.getReader(), dec = new TextDecoder();
    let last = Date.now(), gap = 0, text = '';
    for (;;) {
      const { value, done } = await reader.read();
      gap = Math.max(gap, Date.now() - last);
      last = Date.now();
      if (done) break;
      text += dec.decode(value, { stream: true });
    }
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal((await lastLine(a)).type, 'result');
    assert.ok(Date.now() - t0 > 500, 'první hledání drželo frontu přes 0,5 s');
    assert.ok(gap < 300, `ve frontě bez dat ${gap} ms`);
    assert.equal(lines[0].type, 'wait', 'znamení dřív než průběh');
    assert.equal(lines.at(-1).type, 'result', 'a pak výsledek');
    // aplikace znamení přeskočí (runSearch zná jen progress / partial / result / error)
    const flights = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
    assert.match(flights, /if \(ev\.type === 'progress' && onProgress\) onProgress\(ev\);[\s\S]{0,300}else if \(ev\.type === 'error'\) error = ev\.error;\n\s*\}/);
  } finally {
    config.searchPingMs = prev;
    mock.restore();
  }
});

test('server: 429 z limitu adresy má Retry-After (za kolik sekund znovu) a českou hlášku', async () => {
  const prev = config.searchesPer10Min;
  config.searchesPer10Min = 1;
  try {
    const ok = await post({ ...q, dateTo: ymdPlus(37) }, '10.4.0.1');
    assert.equal(ok.status, 200);
    await ok.text();
    const r = await post({ ...q, dateTo: ymdPlus(38) }, '10.4.0.1');
    assert.equal(r.status, 429);
    const s = Number(r.headers.get('retry-after'));
    assert.ok(s > 590 && s <= 600, String(s));
    assert.match((await r.json()).error, /Příliš mnoho hledání/);
    // aplikace u chybové odpovědi hledání (429, 503) ukáže českou hlášku serveru (pole error), ne „HTTP 429“
    const flights = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
    assert.match(flights, /const r = await fetch\('api\/search'[^\n]*\n\s*if \(!r\.ok \|\| !r\.body\) \{\s*const e = await httpErr\(r\);/);
    assert.match(flights, /async function httpErr\(r\) \{\s*if \(window\.Pwa && Pwa\.httpError\) return Pwa\.httpError\(r\);\s*const j = await r\.json\(\)\.catch\(\(\) => \(\{\}\)\);\s*return new Error\(j\.error \|\|/);
  } finally {
    config.searchesPer10Min = prev;
  }
});

/** Počká, až platí cond() (nejvýš ~2 s). */
async function until(cond) {
  for (let i = 0; i < 200 && !cond(); i++) await sleep(10);
  return cond();
}

test('server: jedna adresa nezaplní frontu – nad stropem rozběhnutých hledání 429 česky s Retry-After, ostatní projdou', async () => {
  const mock = slowMock(150);
  const prev = config.searchPerClient;
  config.searchPerClient = 1;
  try {
    const mine = { ...q, dateFrom: ymdPlus(22), dateTo: ymdPlus(40) };
    const a = await post(mine, '10.5.0.1'); // běží
    assert.equal(_searchClients.count('10.5.0.1'), 1);
    // druhé jiné hledání z téže adresy: fronta má místo (nebylo by 503), ale adresa je na stropu
    const a2 = await post({ ...mine, dateTo: ymdPlus(41) }, '10.5.0.1');
    assert.equal(a2.status, 429);
    assert.equal(a2.headers.get('retry-after'), '30');
    assert.match((await a2.json()).error, /moc hledání naráz – počkej prosím, až některé doběhne/);
    // jiná adresa se do fronty dostane
    const b = await post({ ...mine, dateTo: ymdPlus(42) }, '10.5.0.2');
    assert.equal(b.status, 200);
    // stejné hledání, které už běží (obnovená stránka, druhé okno): frontu nezabere – projde i nad stropem
    const a3 = await post(mine, '10.5.0.1');
    assert.equal(a3.status, 200);
    for (const r of [a, b, a3]) assert.equal((await lastLine(r)).type, 'result');
    assert.equal(_searchClients.size, 0, 'po skončení hledání se počty vrátí na prázdno');
    // a adresa může hledat znovu
    const again = await post({ ...mine, dateTo: ymdPlus(41) }, '10.5.0.1');
    assert.equal(again.status, 200);
    assert.equal((await lastLine(again)).type, 'result');
    assert.equal(_searchClients.size, 0);
  } finally {
    config.searchPerClient = prev;
    mock.restore();
  }
});

test('server: místo na adrese se vrátí hned po odchodu klienta (i když hledání ještě běží) a po chybě hledání', async () => {
  const mock = slowMock(300);
  const prev = config.searchPerClient;
  config.searchPerClient = 1;
  try {
    const ctl = new AbortController();
    const left = { ...q, dateFrom: ymdPlus(23), dateTo: ymdPlus(43) };
    const a = await post(left, '10.6.0.1', ctl.signal);
    assert.equal(a.status, 200);
    while (!mock.calls.some((x) => x.dateFrom === ymdPlus(23))) await sleep(5);
    ctl.abort(); // zrušené hledání (uživatel změnil formulář)
    await a.text().catch(() => null);
    assert.ok(await until(() => _searchClients.size === 0), 'místo se vrátilo hned po odchodu');
    // jeho hledání ještě běží (zdroje odpovídají 300 ms) – nové hledání téže adresy přesto projde (čeká ve frontě)
    const b = await post({ ...left, dateTo: ymdPlus(44) }, '10.6.0.1');
    assert.equal(b.status, 200);
    assert.equal((await lastLine(b)).type, 'result');
    // hledání, které skončí chybou (špatný dotaz), místo taky vrátí
    const bad = await post({ ...q, from: [] }, '10.6.0.1');
    assert.equal(bad.status, 200);
    assert.equal((await lastLine(bad)).type, 'error');
    const ok = await post({ ...left, dateTo: ymdPlus(45) }, '10.6.0.1');
    assert.equal(ok.status, 200);
    assert.equal((await lastLine(ok)).type, 'result');
    assert.equal(_searchClients.size, 0, 'nic nezůstalo započtené');
  } finally {
    config.searchPerClient = prev;
    mock.restore();
  }
});

test('Ryanair: po 429 se na chvíli vynechá (podle Retry-After) – další dotazy ani letový řád nevyjdou, stav vidí aplikace', async () => {
  const stub = stubFetch((url) => {
    if (url.includes('/farfnd/')) return { status: 429, body: 'Too Many Requests', headers: { 'retry-after': '90' } };
    if (url.includes('/timtbl/')) return { body: { days: [] } };
    return { body: '<html></html>', headers: { 'content-type': 'text/html' } };
  });
  const farfnd = () => stub.calls.filter((c) => c.url.includes('/farfnd/')).length;
  try {
    await assert.rejects(ryanair.explore({ origin: 'VIE', dateFrom: ymdPlus(4), dateTo: ymdPlus(9) }), /Ryanair dočasně omezuje dotazy \(429\)/);
    assert.equal(farfnd(), 1, '429 se nezkouší na druhé doméně');
    assert.equal(ryanair.isBlocked(), true);
    assert.ok(ryanair.retryAfter() > 85 && ryanair.retryAfter() <= 90);
    await assert.rejects(ryanair.daily({ from: 'VIE', to: 'STN', dateFrom: ymdPlus(4), dateTo: ymdPlus(6) }), /429/);
    assert.deepEqual(await ryanair.departures('VIE', 'STN', [ymdPlus(4)]), {});
    assert.equal(farfnd(), 1, 'během pojistky žádný další dotaz');
    assert.equal(stub.calls.filter((c) => c.url.includes('/timtbl/')).length, 0);
    config.mock = false;
    try {
      const st = providerStatus().find((p) => p.id === 'ryanair');
      assert.equal(st.blocked, true);
      assert.ok(st.retryAfter > 0);
    } finally {
      config.mock = true;
    }
    _resetRyanairBlock();
    stub.restore();
    const ok = stubFetch((url) => (url.includes('/farfnd/') ? { body: ONE_WAY } : { body: '<html></html>', headers: { 'content-type': 'text/html' } }));
    try {
      assert.equal((await ryanair.explore({ origin: 'VIE', dateFrom: ymdPlus(4), dateTo: ymdPlus(10) })).length, 2, 'po pojistce zase normálně');
    } finally {
      ok.restore();
    }
  } finally {
    stub.restore();
    _resetRyanairBlock();
  }
});

test('Wizz Air: po 429 už nevyjdou ani dotazy, které čekaly ve frontě relace', async () => {
  const stub = stubFetch((url) => {
    if (url.startsWith('https://www.wizzair.com/')) return { body: '<script>apiUrl:"https://be.wizzair.com/30.1.0/Api"</script>', headers: { 'content-type': 'text/html' } };
    if (url.endsWith('/userSession/new')) return { body: '{}', headers: { 'set-cookie': 'RequestVerificationToken=abc; path=/' } };
    if (url.includes('/search/timetableV2')) return { status: 429, body: 'Too Many Requests' };
    return { status: 404, body: '{}' };
  });
  try {
    const to = ['BCN', 'MAD', 'LTN', 'FCO', 'CIA', 'BGY'];
    const res = await Promise.allSettled(to.map((d) => wizzair.daily({ from: 'VIE', to: d, dateFrom: ymdPlus(5), dateTo: ymdPlus(20) })));
    assert.ok(res.every((r) => r.status === 'rejected' && /429/.test(r.reason.message)));
    const sent = stub.calls.filter((c) => c.url.includes('timetableV2')).length;
    assert.ok(sent <= 3, `odešlo ${sent} dotazů – jen první v každé ze 3 relací, ne všech 6`);
    assert.equal(wizzair.isBlocked(), true);
  } finally {
    stub.restore();
  }
});
