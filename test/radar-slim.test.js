// Radar na přehledu posílá v dotazu radar: true a server mu vrátí zmenšený výsledek (server/lib/search.js radarResult):
// jen pole, která radar čte, a best jen jednou (SearchHelp.radarRes ji doplní). Karty, jejich pořadí a štítky ✓, paměť
// cen (⭐ Moje cíle) i doprava na letiště a do města musí vyjít stejně jako z plného výsledku – tady stejné odvození jako
// ve flights.js radarSearch (klasické skripty prohlížeče přes node:vm) z obou. Hledání v Letech (bez radar) se nemění.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { search, radarResult } = await import('../server/lib/search.js');
const { mockProviders } = await import('../server/providers/mock.js');
const { createServer } = await import('../server/index.js');

const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['searchhelp.js', 'rank.js', 'pricecheck.js', 'pins.js', 'alerts.js']) {
  vm.runInContext(readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
}
const { SearchHelp: H, Rank, PriceCheck, Pins, Alerts } = ctx;

// DEMO zdroje s mezipamětí (jako test/scale.test.js): stejný dotaz podruhé bez skládání cen, výsledky deterministické
const memo = new Map();
for (const p of mockProviders) {
  const daily = p.daily;
  p.daily = async function (q) {
    const key = JSON.stringify([p.id, q.from, q.to, q.dateFrom, q.dateTo, q.near]);
    if (!memo.has(key)) memo.set(key, daily.call(this, q));
    return structuredClone(await memo.get(key));
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v)); // jako po síti (a objekty z jiného vm kontextu)
// dvě hledání: bez časů a statistiky kombinací (kolik letů se drželo a zahodilo naráz – podle toho, jak odpovědi
// přicházely; nabídky jsou stejné)
const stable = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'ms' || k === 'mix' ? undefined : v)));
const wxGeo = (x) => Boolean(x && Number.isFinite(x.lat) && Number.isFinite(x.lon));

/**
 * Co radar z výsledku hledání vyčte – stejně jako flights.js radarSearch: paměť cen (PriceCheck.remember → entriesOf),
 * doporučené pořadí všech cílů (Rank, SearchHelp.radarPick), uložené karty i se štítkem ✓ a dopravou (Pins.extras),
 * otisk vlastních cen, výpadek zdroje, letiště. Navíc srovnávací cena každé nabídky (Rank.score) – i těch, které kartou
 * nejsou, ale pořadí ovlivňují.
 */
function radarView(res, q, mute = []) {
  const entries = PriceCheck.entriesOf(res);
  const rc = Rank.ctxOf(res);
  const rk = Rank.radar(rc);
  const picked = H.radarPick(res.groups, q.lw, H.RADAR_KEEP, H.destKeys(mute), rk);
  const all = H.radarPick(res.groups, q.lw, Infinity, null, rk);
  const why = Rank.reasons(all.map(({ g, t }) => {
    const ts = [g.best, ...(g.options || [])].filter(Boolean), alt = q.lw ? t : ts.reduce((a, b) => (b.perPersonCzk < a.perPersonCzk ? b : a), t);
    return { t, sc: Rank.score(t, rc), label: g.dest.label, cc: g.dest.cc, minTrip: Math.min(...ts.map((x) => x.tripCzk ?? x.perPersonCzk)), ...(alt !== t ? { alt: { t: alt, sc: Rank.score(alt, rc) } } : {}) };
  }), picked.length);
  const items = picked.map(({ g, t }, i) => ({
    label: g.dest.label, cc: g.dest.cc, id: g.dest.id, czk: t.perPersonCzk, from: t.out.from, to: t.out.to, d1: t.out.date, d2: t.back?.date,
    ...(t.back && (t.back.from !== t.out.to || t.back.to !== t.out.from) ? { bf: t.back.from, bt: t.back.to } : {}),
    t1: t.out.hasTime ? String(t.out.dep).slice(11, 16) : '', a2: t.back && t.back.hasTime && t.back.arr ? String(t.back.arr).slice(0, 16) : '', deal: t.deal.level, score: t.deal.score, prov: t.out.provider,
    ...(wxGeo(g.dest) ? { lat: +g.dest.lat.toFixed(3), lon: +g.dest.lon.toFixed(3) } : {}),
    ...(t.tempHi != null ? { th: Math.round(t.tempHi) } : {}),
    ...(res.arrivals && res.arrivals[t.out.to] ? { ar: res.arrivals[t.out.to] } : {}),
    ...(({ ground, arr }) => ({ ...(ground != null ? { gc: Math.round(ground) } : {}), ...(arr != null ? { ac: Math.round(arr) } : {}) }))(Pins.extras(t, res.query, res.origins, res.arrivals)),
    ...(t.bookUrl ? { buy: [[t.bookUrl, t.provider, 'all']] } : t.out.bookUrl || t.back?.bookUrl ? { buy: [...(t.out.bookUrl ? [[t.out.bookUrl, t.out.provider, 'out']] : []), ...(t.back?.bookUrl ? [[t.back.bookUrl, t.back.provider, 'back']] : [])] } : {}),
    ...(why.has(i) ? { why: why.get(i).text, whyT: why.get(i).title } : {}),
  }));
  return plain({
    entries, items, dealBase: rc.dealBase,
    order: all.map(({ g, t }) => [g.dest.key, t === g.best ? 0 : g.options.indexOf(t)]), // plný výsledek má best zvlášť
    scores: res.groups.map((g) => g.options.map((t) => Rank.score(t, rc))),
    own: H.ownPrint(res), partial: Alerts.incomplete(res.providers), demo: res.demo, ap: (res.origins || []).map((o) => o.iata),
  });
}

const brno = { from: [{ id: 'ap:BRQ', label: 'Brno' }], radius: 200, adults: 2 };
const praha = { from: [{ id: 'ap:PRG', label: 'Praha' }], radius: 120, adults: 1 };
const today = ymdPlus(0);
const CASES = [
  ['Kdykoliv z Brna', H.radarQuery('all', brno, today)],
  ['Víkendy z Prahy', H.radarQuery('weekend', praha, today)],
  ['Svátky z Brna', H.radarQuery('holiday', brno, today)],
].filter(([, q]) => !q.none); // svátky: v příštích měsících žádný prodloužený víkend (posunuté datum testů)

test('radar: zmenšený výsledek dá stejné karty, pořadí, štítky ✓, paměť cen i dopravu jako plný – a je pod polovinou', async () => {
  for (const [name, q] of CASES) {
    const full = await search({ ...q.payload, noPartial: true });
    const small = await search({ ...q.payload, noPartial: true, radar: true });
    // radar: true = plný výsledek zmenšený radarResult (odhad vlakem/busem u cílů, který radar nečte, se ani nepočítá)
    assert.deepEqual(stable(small), stable(radarResult(full)), `${name}: radar: true = radarResult`);
    assert.ok(full.groups.length >= 12, `${name}: ${full.groups.length} cílů`);
    assert.equal(small.groups.length, full.groups.length, `${name}: stejné cíle`);
    const fullJson = JSON.stringify(full);
    const smallJson = JSON.stringify(small);
    assert.ok(smallJson.length < fullJson.length * 0.45, `${name}: ${smallJson.length} z ${fullJson.length} B`);
    assert.equal(small.groups[0].best, undefined, 'best jen jednou (options[0])');

    const ref = radarView(plain(full), q);
    assert.ok(ref.items.length >= 12 && ref.items.some((x) => x.why) && ref.entries.length > 100, `${name}: karty, štítky ✓ i paměť cen`);
    assert.deepEqual(radarView(H.radarRes(JSON.parse(smallJson)), q), ref, `${name}: totéž ze zmenšeného`);
    // 🙈 cíle: radar je přeskočí a vezme další – i ty další musí zmenšený výsledek nést stejně
    const mute = [0, 3, 7].map((i) => ({ key: ref.order[i][0] }));
    assert.deepEqual(radarView(H.radarRes(JSON.parse(smallJson)), q, mute), radarView(plain(full), q, mute), `${name}: s 🙈`);
  }
});

test('radarResult: pole, která radar čte – i ta, která DEMO nemá (odkaz obchodu, neznámý přílet, odhad délky, přestup)', () => {
  const leg = (from, to, date, extra) => ({
    provider: 'kiwi', carrier: 'FR', carrierName: 'Ryanair', flightNo: 'FR 1', from, to, fromTz: 'Europe/Prague', toTz: 'Europe/Rome', dep: `${date}T06:10:00`,
    arr: null, arrEst: false, date, hasTime: true, price: 20, currency: 'EUR', czk: 500, prevCzk: null, stops: 0, durationMin: null, live: true,
    bookUrl: 'https://example.com/let', foundAt: null, otherDeps: ['09:00'], ...extra,
  });
  const out = leg('PRG', 'BGY', '2026-11-20', { stops: 1, arrUnknown: true, estMin: 140, layovers: [{ at: 'VIE', min: 95, cc: 'AT' }] });
  const back = leg('BGY', 'PRG', '2026-11-23', { durationMin: 85, arr: '2026-11-23T08:35:00' });
  const t = {
    id: 'x', out, back, flightCzk: 1000, nights: 3, provider: 'kiwi', combined: true, bookUrl: 'https://example.com/cesta', groundCzk: 100, bagCzk: 0,
    arrCzk: 120, perPersonCzk: 1000, tripCzk: 1220, totalCzk: 2000, tempHi: 14, distanceKm: 600, deal: { score: 2, level: 'good', drop: null }, destKey: 'MIL',
    priceLevel: { level: 'low', basis: 'search', reason: 'nejlevnější', ref: 1500, vsRef: -33, pos: 0, n: 9 },
  };
  const res = {
    query: { trip: 'return', arrival: true }, mode: 'explore', origins: [{ iata: 'PRG', ground: { czk: 50, minutes: 40 } }], providers: [{ id: 'kiwi', state: 'done' }], demo: false,
    arrivals: { BGY: { czk: 60, min: 50 }, MXP: { czk: 200, min: 60 } },
    groups: [{
      dest: { key: 'MIL', id: 'metro:MIL', label: 'Milán', cc: 'IT', country: 'Itálie', lat: 45.46, lon: 9.19, airportDistKm: null, airports: ['BGY'], climate: { m: 11, hi: 14 } },
      best: t, options: [t], count: 9, minFlightCzk: 1000, fromBest: { PRG: 1000 }, ground: { km: 800 },
      priceStats: { n: 9, min: 1000, p25: 1200, median: 1500, p75: 1800, max: 2500, dateFrom: '2026-11-01', dateTo: '2026-11-30', mins: [['PRG', '2026-11', 1000]] },
    }],
  };
  const r = radarResult(res);
  const keep = (l) => ({ from: l.from, to: l.to, date: l.date, dep: l.dep, arr: l.arr, hasTime: true, stops: l.stops, durationMin: l.durationMin, provider: 'kiwi', bookUrl: 'https://example.com/let' });
  assert.deepEqual(r.groups, [{
    dest: { key: 'MIL', id: 'metro:MIL', label: 'Milán', cc: 'IT', lat: 45.46, lon: 9.19 },
    options: [{
      perPersonCzk: 1000, tripCzk: 1220, flightCzk: 1000, groundCzk: 100, arrCzk: 120, destKey: 'MIL', distanceKm: 600, nights: 3, tempHi: 14,
      bookUrl: 'https://example.com/cesta', provider: 'kiwi', deal: { level: 'good', score: 2 }, priceLevel: { level: 'low' },
      out: { ...keep(out), arrUnknown: true, estMin: 140, layovers: [{ at: 'VIE', min: 95, cc: 'AT' }] }, back: keep(back),
    }],
    minFlightCzk: 1000,
    priceStats: { n: 9, median: 1500, mins: [['PRG', '2026-11', 1000]] },
  }]);
  assert.deepEqual(r.arrivals, { BGY: { czk: 60, min: 50 } }, 'cesta do města jen k letištím nabídek');
  for (const k of ['query', 'mode', 'origins', 'providers', 'demo']) assert.equal(r[k], res[k], k);
  assert.equal(res.groups[0].best.out.carrierName, 'Ryanair', 'plný výsledek se nemění');
});

test('radar: SearchHelp.radarRes doplní best jen zmenšenému výsledku, plný (starší server) nechá být', () => {
  const t0 = { id: 'a' };
  const t1 = { id: 'b' };
  const small = H.radarRes({ groups: [{ options: [t0, t1] }, null, { options: [] }] });
  assert.equal(small.groups[0].best, t0);
  assert.equal(small.groups[2].best, undefined);
  const best = { id: 'x' };
  assert.equal(H.radarRes({ groups: [{ best, options: [t0] }] }).groups[0].best, best);
  assert.equal(H.radarRes(null), null);
});

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function viaHttp(body) {
  const r = await fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 200);
  const text = await r.text();
  const last = JSON.parse(text.trim().split('\n').at(-1));
  assert.equal(last.type, 'result', last.error);
  return { result: last.result, bytes: Buffer.byteLength(text) };
}

test('radar přes /api/search: zmenšený jen s radar: true; hledání v Letech (stejný dotaz bez radar) dál celé', async () => {
  const q = CASES[1][1];
  const lety = await viaHttp({ ...q.payload, noPartial: true });
  const radar = await viaHttp({ ...q.payload, noPartial: true, radar: true });
  // Lety: best, celé lety (dopravce, časová pásma), podnebí cíle, odhad vlakem/busem – jako dřív
  const g = lety.result.groups[0];
  assert.equal(JSON.stringify(g.best), JSON.stringify(g.options[0]));
  assert.ok(g.best.id && g.best.out.carrierName && g.best.out.fromTz && g.dest.climate && 'count' in g);
  assert.ok(lety.result.groups.some((x) => x.ground), 'odhad vlakem/busem u cílů');
  // radar: totéž zmenšené, hotový výsledek Let mu nepatří (jiný klíč)
  assert.deepEqual(stable(radar.result), stable(radarResult(lety.result)));
  assert.ok(radar.bytes < lety.bytes * 0.45, `${radar.bytes} z ${lety.bytes} B`);
});
