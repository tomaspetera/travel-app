// Nával uživatelů: limit z jedné adresy s omezenou pamětí, mezipaměť s úklidem a pojistkou paměti, sdílené stejné
// hledání, strop souběžných hledání s frontou, časové limity příjmu požadavku a pojistky po 429 u Ryanairu a Wizz Air.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';

// Malý strop, ať se dá ověřit fronta i odmítnutí (config se čte při prvním importu – proto až dynamické importy níž).
process.env.ATLAS_MOCK = '1';
process.env.SEARCH_CONCURRENCY = '1';
process.env.SEARCH_QUEUE = '1';
const { RateLimiter } = await import('../server/lib/ratelimit.js');
const { TTLCache } = await import('../server/lib/cache.js');
const { sharedRuns, gate } = await import('../server/lib/crowd.js');
const { createServer } = await import('../server/index.js');
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
  await assert.rejects(g(async () => { throw new Error('x'); }), /x/);
  assert.deepEqual(g.stats(), { active: 0, queued: 0, concurrency: 1, maxQueue: 1 });
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
  } finally {
    config.searchesPer10Min = prev;
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
