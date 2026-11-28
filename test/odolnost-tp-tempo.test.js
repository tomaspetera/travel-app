// Odolnost čistého režimu: Travelpayouts je od 12. 1. jediný zdroj letů a jeho oficiální limit prices_for_dates je
// 600 dotazů za minutu (pak 429 do konce minuty). Tempo pro celý server, podíl jednoho hledání ve frontě, doba blokace
// po 429 z X-Rate-Limit-Reset a strop dohledání po dnech u dlouhého období.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';
import { limiter, pacer } from '../server/lib/http.js';
import { travelpayouts, resetTravelpayouts, TP_PACE } from '../server/providers/travelpayouts.js';
import { refineRoutes } from '../server/lib/search.js';

const ok = { body: { success: true, data: [] } };
const tick = () => new Promise((r) => setImmediate(r));

test('tp-limity-1: 1000 dotazů naráz → za libovolnou minutu pod limitem 600', async () => {
  // podvržený čas (Date i setTimeout) začíná na 0 – stav tempa pak ostatním testům nepřekáží (je „v minulosti“)
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const stamps = [];
  const stub = stubFetch(() => { stamps.push(Date.now()); return ok; });
  try {
    const dests = ['BCN', 'MAD', 'LIS', 'FCO'];
    const all = Promise.all(Array.from({ length: 1000 }, (_, i) => {
      const d = ymdPlus(1 + (i % 250));
      return travelpayouts.daily({ from: 'PRG', to: dests[Math.floor(i / 250)], dateFrom: d, dateTo: d });
    }));
    let done = false;
    all.then(() => { done = true; });
    for (let t = 0; !done && t < 300e3; t += 25) {
      await tick();
      mock.timers.tick(25);
    }
    assert.ok(done, 'všechny dotazy doběhly');
    assert.equal(stamps.length, 1000);
    let most = 0;
    for (let i = 0, j = 0; i < stamps.length; i++) {
      while (j < stamps.length && stamps[j] - stamps[i] < 60e3) j++;
      most = Math.max(most, j - i);
    }
    assert.ok(most <= 600, `za minutu ${most} dotazů`);
    assert.ok(most >= 450, `tempo zbytečně pomalé: ${most} za minutu`);
  } finally {
    stub.restore();
    mock.timers.reset();
    resetTravelpayouts();
  }
});

test('pacer: po klidu burst hned, pak rozestup gapMs', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  try {
    const pace = pacer(100, 3);
    const starts = [];
    for (let i = 0; i < 6; i++) pace().then(() => starts.push(i));
    await tick();
    assert.deepEqual(starts, [0, 1, 2], 'první 3 hned');
    mock.timers.tick(100);
    await tick();
    assert.deepEqual(starts, [0, 1, 2, 3]);
    mock.timers.tick(200);
    await tick();
    assert.deepEqual(starts, [0, 1, 2, 3, 4, 5]);
    assert.ok(TP_PACE.burst + 60e3 / TP_PACE.gapMs <= 600, 'nastavení Travelpayouts pod oficiálním limitem');
  } finally {
    mock.timers.reset();
  }
});

test('tp-limity-3: malé hledání vedle těžkého skončí rychle (vlastní podíl ve frontě)', async () => {
  const stub = stubFetch(async () => { await new Promise((r) => setTimeout(r, 40)); return ok; });
  try {
    // těžké hledání: 30 měsíců = 30 dotazů, podíl 3 jako v search.js
    const heavy = travelpayouts.explore({ origin: 'VIE', dateFrom: ymdPlus(1), dateTo: ymdPlus(900), share: limiter(3) });
    await new Promise((r) => setTimeout(r, 10));
    const t0 = Date.now();
    const d = ymdPlus(20);
    await travelpayouts.daily({ from: 'BRQ', to: 'BCN', dateFrom: d, dateTo: d, share: limiter(3) });
    const ms = Date.now() - t0;
    assert.ok(ms < 500, `malé hledání čekalo ${ms} ms`);
    await heavy;
  } finally {
    stub.restore();
  }
});

test('tp-limity-4: 429 s X-Rate-Limit-Reset: 40 → Travelpayouts vynechán na ~40 s, ne 2 min', async () => {
  resetTravelpayouts();
  const stub = stubFetch(() => ({ status: 429, body: { message: 'rate limit' }, headers: { 'X-Rate-Limit-Reset': '40', 'X-Rate-Limit-Remaining': '0' } }));
  try {
    const d = ymdPlus(40);
    await assert.rejects(travelpayouts.daily({ from: 'OSR', to: 'BCN', dateFrom: d, dateTo: d }), /429/);
    assert.ok(travelpayouts.isBlocked());
    const s = travelpayouts.retryAfter();
    assert.ok(s >= 39 && s <= 40, `blokace ${s} s`);
  } finally {
    stub.restore();
    resetTravelpayouts();
  }
});

test('tp-limity-4: 429 bez hlaviček → záloha 2 min', async () => {
  resetTravelpayouts();
  const stub = stubFetch(() => ({ status: 429, body: {} }));
  try {
    const d = ymdPlus(41);
    await assert.rejects(travelpayouts.daily({ from: 'OSR', to: 'MAD', dateFrom: d, dateTo: d }));
    const s = travelpayouts.retryAfter();
    assert.ok(s >= 119 && s <= 120, `blokace ${s} s`);
  } finally {
    stub.restore();
    resetTravelpayouts();
  }
});

test('tp-limity-2: dohledání po dnech u zdroje z mezipaměti – krátké období beze změny, celý rok 3 trasy', () => {
  const tp = { live: false };
  assert.equal(refineRoutes({ live: true }, 13, true), 10, 'živé zdroje beze změny');
  assert.equal(refineRoutes(tp, 2, true), 10, 'radar / formulář (2 měsíce)');
  assert.equal(refineRoutes(tp, 3, true), 10);
  assert.equal(refineRoutes(tp, 6, true), 8);
  assert.equal(refineRoutes(tp, 13, true), 3, 'celý rok zpátečně: 3 × 26 = 78 dotazů místo 260');
  assert.equal(refineRoutes(tp, 13, false), 7, 'jednosměrně jen jeden směr');
});
