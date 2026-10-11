// Mřížka termínů (den odletu × počet nocí) u flexibilního termínu: optimalizátor (DEMO lety z mock.js, žádné dotazy
// na zdroje), kompaktní calendar.grid v odpovědi hledání (i s cestami buněk, které top nemá) a pomocníci pro UI
// (gridModel, gridSummary, gridTrips, lastPack) ze searchhelp.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { bestRoundTrips, calendarArray, dateOk, gridArray, legsPerDay, returnFits } = await import('../server/lib/optimizer.js');
const { mockProviders } = await import('../server/providers/mock.js');
const { makeLeg, makeTrip } = await import('../server/lib/fares.js');
const { destKey } = await import('../server/lib/airports.js');
const { daysBetween } = await import('../server/lib/dates.js');
const { search } = await import('../server/lib/search.js');

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const H = ctx.window.SearchHelp;
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu

// DEMO lety Vídeň / Bratislava / Brno ↔ Londýn (všechna letiště) – pevná data, výsledek nezávisí na dnešku
const HOME = ['VIE', 'BTS', 'BRQ'];
const LON = ['STN', 'LTN', 'LGW', 'LHR', 'SEN', 'LCY'];
async function demoLegs(dateFrom, dateTo, backTo) {
  const out = [];
  const back = [];
  for (const p of mockProviders) {
    for (const h of HOME) {
      for (const d of LON) {
        out.push(...await p.daily({ from: h, to: d, dateFrom, dateTo }));
        back.push(...await p.daily({ from: d, to: h, dateFrom, dateTo: backTo }));
      }
    }
  }
  return { out, back };
}
const GROUND = { VIE: 310, BTS: 140, BRQ: 0 };
const groundOf = (i) => GROUND[i] ?? 0;
const extra = (l) => (l.stops ? 180 : 95); // zavazadla + cesta do města (příplatek k letu)
const OPTS = { nightsMin: 2, nightsMax: 6, limit: 300, perDestLimit: 120, perDay: 3, legsPerDay: 2, extra };
const costOf = (t) => t.out.czk + groundOf(t.out.from) + extra(t.out) + t.back.czk + groundOf(t.back.to) + extra(t.back);
const ids = (trips) => trips.map((t) => t.id);

test('mřížka termínů: každá buňka = nejlevnější ze všech dvojic (den odletu × noci) – limit návratů na let nejlevnější návrat neodřízne', async () => {
  const { out, back } = await demoLegs('2027-03-01', '2027-03-20', '2027-03-26');
  assert.ok(out.length > 100 && back.length > 100, `DEMO lety: ${out.length} tam, ${back.length} zpět`);
  const cal = { out: new Map(), back: new Map(), grid: new Map() };
  bestRoundTrips(out, back, groundOf, { ...OPTS, calendar: cal });
  // hrubou silou: varianty dne jako optimalizátor (legsPerDay), termín, návrat stihnutelný, open-jaw v cíli jen v rámci města
  const want = new Map();
  const outs = legsPerDay(out, 2, extra);
  const backs = legsPerDay(back, 2, extra);
  for (const o of outs) {
    for (const b of backs) {
      if (b.from !== o.to && destKey(b.from) !== destKey(o.to)) continue;
      if (!dateOk(o.date, null, OPTS) || !dateOk(o.date, b.date, OPTS) || !returnFits(o, b)) continue;
      const k = `${o.date}|${daysBetween(o.date, b.date)}`;
      const c = o.czk + groundOf(o.from) + extra(o) + b.czk + groundOf(b.to) + extra(b);
      if (!(want.get(k) <= c)) want.set(k, c);
    }
  }
  const got = [...cal.grid].map(([k, e]) => [k, e.cost]).sort();
  assert.ok(got.length >= 60, `buněk: ${got.length}`);
  assert.deepEqual(got, [...want].sort());
  // buňka nese i své lety (cestu jde složit), jejich cena = buňka
  for (const [k, e] of cal.grid) assert.equal(costOf(makeTrip(e.o, e.b)), e.cost, k);
  // víc návratů na den, než optimalizátor páruje (3 × 2 varianty) – limit tu opravdu platí, přesto hrubá síla = mřížka
  const perDay = new Map();
  for (const b of backs) perDay.set(b.date, (perDay.get(b.date) || 0) + 1);
  assert.ok(Math.max(...perDay.values()) > 6, 'limit návratů na let se uplatní');
  // řádek mřížky = kalendář podle dne odletu (stejné dvojice)
  for (const d of calendarArray(cal.out)) {
    const row = [...cal.grid.values()].filter((e) => e.outDate === d.date).map((e) => e.cost);
    assert.equal(Math.min(...row), d.cost, d.date);
  }
});

test('mřížka termínů: s cal.grid stejné nabídky i kalendář tam/zpět; nejlevnější cestu buňky jde složit z jejích letů, i když ji výběr nevzal', async () => {
  const { out, back } = await demoLegs('2027-04-05', '2027-05-04', '2027-05-10');
  const plainCal = { out: new Map(), back: new Map() };
  const base = bestRoundTrips(out, back, groundOf, { ...OPTS, calendar: plainCal });
  const cal = { out: new Map(), back: new Map(), grid: new Map() };
  const same = bestRoundTrips(out, back, groundOf, { ...OPTS, calendar: cal });
  assert.deepEqual(ids(same), ids(base), 'mřížka nezmění vybrané nabídky');
  assert.deepEqual(calendarArray(cal.out), calendarArray(plainCal.out));
  assert.deepEqual(calendarArray(cal.back), calendarArray(plainCal.back));
  assert.ok(calendarArray(cal.out).every((e) => !e.o && !e.b), 'kalendář tam/zpět bez letů (do odpovědi nepatří)');
  const g = gridArray(cal.grid, OPTS);
  assert.deepEqual(g.nights, [2, 6]);
  assert.equal(g.skipped, 0);
  const has = new Set(ids(same));
  let missing = 0;
  for (const [d, n, czk] of g.cells) {
    const e = cal.grid.get(`${d}|${n}`), t = makeTrip(e.o, e.b);
    assert.deepEqual([t.out.date, t.nights, Math.round(costOf(t))], [d, n, czk], `${d} ${n} nocí`);
    if (!has.has(t.id)) missing++;
  }
  assert.ok(missing > 20, `výběr (limit, 3 na den) nevzal nejlevnější cestu ${missing} buněk – proto je server dosílá zvlášť`);
});

test('gridArray: kompaktně [den, noci, Kč], nejvýš maxNights nocí kolem nejlevnější buňky a maxDates nejlevnějších dnů', () => {
  const m = new Map();
  const put = (d, n, cost) => m.set(`${d}|${n}`, { cost, outDate: d, backDate: new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10) });
  for (let i = 1; i <= 5; i++) for (let n = 1; n <= 9; n++) put(`2027-01-0${i}`, n, 1000 + i * 100 + Math.abs(n - 6) * 10);
  put('2027-01-03', 6, 640.4); // nejlevnější buňka
  const all = gridArray(m, { nightsMin: 1, nightsMax: 9 });
  assert.deepEqual([all.nights, all.cells.length, all.skipped], [[1, 9], 45, 0]);
  assert.deepEqual(all.cells[0], ['2027-01-01', 1, 1150]);
  assert.ok(all.cells.some((c) => c[0] === '2027-01-03' && c[1] === 6 && c[2] === 640), 'cena zaokrouhlená');
  const cut = gridArray(m, { nightsMin: 1, nightsMax: 9, maxNights: 4, maxDates: 3 });
  assert.deepEqual(cut.nights, [5, 8], 'okno 4 nocí kolem nejlevnější (6 nocí)');
  assert.equal(cut.skipped, 2);
  assert.deepEqual([...new Set(cut.cells.map((c) => c[0]))], ['2027-01-01', '2027-01-02', '2027-01-03'], 'tři nejlevnější dny, podle data');
  assert.ok(cut.cells.every((c) => c[1] >= 5 && c[1] <= 8));
  assert.deepEqual(gridArray(m, { nightsMin: 8, nightsMax: 12, maxNights: 3 }).nights, [8, 10], 'okno uvnitř rozsahu hledání');
  assert.deepEqual(gridArray(new Map(), { nightsMin: 2, nightsMax: 5 }), { nights: [2, 5], cells: [], skipped: 0 });
});

// odpověď hledání jako v prohlížeči: cesty buněk mřížky (kompaktně v calendar.grid) přidané do top
const withCells = (r) => plain(H.gridTrips(plain(r)));
const cellKey = (t) => `${t.out.date}|${t.nights}`;
function cellsCovered(r, label = '') {
  const all = withCells(r).top;
  for (const [d, n, czk] of r.calendar.grid.cells) {
    const list = all.filter((t) => cellKey(t) === `${d}|${n}`).map((t) => Math.round(t.perPersonCzk));
    assert.equal(Math.min(...list), czk, `${label}${d} ${n} nocí: ve výpisu je nabídka s cenou buňky`);
  }
  return all;
}
const Q = () => ({ from: ['ap:VIE'], to: ['metro:LON'], radiusKm: 120, dateFrom: ymdPlus(10), dateTo: ymdPlus(40), trip: 'return', nightsMin: 3, nightsMax: 6, adults: 2, kmRate: 1, groundMode: 'transit', arrival: true });

test('hledání (DEMO): calendar.grid jen u flexibilního termínu s rozsahem nocí; buňka = nejlevnější nabídka výpisu s tím odletem a nocemi', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} })); // kurzy měn bez sítě (orientační), zdroje jsou DEMO
  try {
    const q = Q();
    const r = await search(q);
    const g = r.calendar.grid;
    assert.deepEqual(g.nights, [3, 6]);
    assert.ok(g.cells.length > 40 && g.cells.every((c) => c.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(c[0]) && Number.isInteger(c[2])));
    assert.ok(JSON.stringify(g.cells).length < 20000, 'buňky kompaktně');
    cellsCovered(r);
    for (const c of r.calendar.out) {
      const row = g.cells.filter((x) => x[0] === c.date).map((x) => x[2]);
      assert.equal(Math.min(...row), Math.round(c.cost), `řádek ${c.date} = kalendář podle dne odletu`);
    }
    assert.equal((await search({ ...q, nightsMin: 4, nightsMax: 4 })).calendar.grid, undefined, 'jeden počet nocí → bez mřížky');
    assert.equal((await search({ ...q, exactOut: ymdPlus(20), exactBack: ymdPlus(24), flexDays: 2 })).calendar.grid, undefined, 'přesná data → bez mřížky');
    assert.ok(stub.calls.every((c) => !/ryanair|wizz|kiwi|travelpayouts|aviasales/i.test(c.url)), 'žádné dotazy na zdroje letů');
  } finally {
    stub.restore();
  }
});

test('hledání (DEMO): mřížka nezmění nabídky, top ani „Je to dobrá cena?“ – cesty buněk jen kompaktně v calendar.grid, mimo statistiku cen', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} }));
  try {
    const q = Q();
    const on = plain(await search(q));
    const off = plain(await search(q, () => {}, { limits: { grid: false } }));
    assert.equal(off.calendar.grid, undefined);
    const g = on.calendar.grid;
    assert.ok(g.trips.length > 20, `cest buněk mimo top: ${g.trips.length}`);
    // nabídky, výpis, skupiny, statistika cen i kalendář tam/zpět beze změny (cesty buněk nejsou v cenových poolech)
    for (const k of ['top', 'groups', 'priceStats', 'origins', 'filters']) assert.deepEqual(on[k], off[k], k);
    assert.deepEqual([on.calendar.out, on.calendar.back], [off.calendar.out, off.calendar.back]);
    assert.equal(on.stats.trips, off.stats.trips);
    // cesty buněk ohodnocené proti stejné statistice: úroveň ceny = jako by byly mezi ostatními, jen se nepočítají
    assert.ok(g.trips.every((t) => t.priceLevel && t.priceLevel.n === on.priceStats.n && t.deal && t.destKey === 'LON'));
    const ids = new Set(on.top.map((t) => t.id));
    assert.ok(g.trips.every((t) => !ids.has(t.id)), 'top je nemá – přidá je až prohlížeč');
    // kompaktně: každý let jednou, cesta odkazuje na jeho pořadí – menší než celé nabídky
    assert.ok(g.trips.every((t) => g.legs[t.out] && g.legs[t.back] && g.legs[t.out].date < g.legs[t.back].date));
    assert.equal(new Set(g.legs.map((l) => JSON.stringify(l))).size, g.legs.length, 'let jen jednou');
    const full = withCells(on).top.filter((t) => !ids.has(t.id));
    assert.equal(full.length, g.trips.length);
    assert.ok(JSON.stringify({ legs: g.legs, trips: g.trips }).length < 0.75 * JSON.stringify(full).length, 'lety se neopakují');
    assert.ok(JSON.stringify(on).length < 1.45 * JSON.stringify(off).length, `odpověď ${JSON.stringify(off).length} → ${JSON.stringify(on).length} znaků`);
  } finally {
    stub.restore();
  }
});

test('hledání (DEMO): zpáteční letenka (celá cena) posune okno nocí – každá buňka konečné mřížky má ve výpisu nabídku se svou cenou', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} }));
  try {
    const q = { ...Q(), dateTo: ymdPlus(60), nightsMax: 16 };
    const OUT = ymdPlus(30);
    // jako Travelpayouts: jedna levná zpáteční letenka VIE → STN na n nocí (na kraji rozsahu 3–16)
    const tp = (n) => ({
      id: 'travelpayouts', name: 'Zpáteční (test)', live: false,
      async stations() { return null; },
      async routes(o) { return { has: (x) => o === 'VIE' && x === 'STN' }; },
      async explore({ origin, destination }) {
        if (origin !== 'VIE' || destination !== 'STN') return [];
        const c = { provider: 'travelpayouts', carrier: 'XX', carrierName: 'X', live: false, currency: 'CZK', czk: null, price: null, stops: 0, durationMin: 130 };
        const back = new Date(Date.parse(`${OUT}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
        return [makeTrip(makeLeg({ ...c, from: 'VIE', to: 'STN', dep: `${OUT}T09:00:00` }), makeLeg({ ...c, from: 'STN', to: 'VIE', dep: `${back}T18:00:00` }), { combinedCzk: 150 })];
      },
    });
    const own = (await search(q)).calendar.grid.nights; // okno jen z letů tam a zpět
    const moved = [];
    for (const [n, win] of [[16, [7, 16]], [3, [3, 12]]]) {
      const r = plain(await search(q, () => {}, { providers: [...mockProviders, tp(n)] }));
      const g = r.calendar.grid;
      assert.deepEqual(g.nights, win, `okno 10 nocí kolem zpáteční letenky na ${n} nocí`);
      const cell = g.cells.find((c) => c[0] === OUT && c[1] === n);
      assert.ok(cell && cell[2] < 1000, `buňka zpáteční letenky: ${JSON.stringify(cell)}`);
      const all = cellsCovered(r, `zpáteční na ${n} nocí: `);
      assert.ok(all.some((t) => t.combined && cellKey(t) === `${OUT}|${n}`), 'zpáteční letenka ve výpisu');
      if (JSON.stringify(win) !== JSON.stringify(own)) moved.push(n);
    }
    assert.ok(moved.length, `aspoň jednou okno jinde než bez zpáteční letenky (${own})`);
    assert.ok(stub.calls.every((c) => !/ryanair|wizz|kiwi|travelpayouts|aviasales/i.test(c.url)), 'žádné dotazy na zdroje letů');
  } finally {
    stub.restore();
  }
});

test('gridTrips + lastPack: cesty buněk z calendar.grid do top (podle ceny, jednou); uložené poslední hledání je má jen kompaktně, po načtení zase všechny', () => {
  const leg = (date, dep = '10:00') => ({ date, from: 'VIE', to: 'STN', dep: `${date}T${dep}:00`, czk: 500, pad: 'x'.repeat(300) });
  const trip = (id, o, b, czk) => ({ id, out: leg(o), back: leg(b), nights: diff(o, b), perPersonCzk: czk });
  const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const top = [trip('a', '2026-11-18', '2026-11-21', 1500), trip('b', '2026-11-19', '2026-11-22', 2500)];
  const legs = [leg('2026-11-18'), leg('2026-11-22', '18:00'), leg('2026-11-23', '18:00')];
  const grid = { nights: [3, 5], cells: [['2026-11-18', 3, 1500], ['2026-11-18', 4, 1800], ['2026-11-18', 5, 3100]], skipped: 0, legs,
    trips: [{ id: 'c4', out: 0, back: 1, nights: 4, perPersonCzk: 1800 }, { id: 'c5', out: 0, back: 2, nights: 5, perPersonCzk: 3100 }] };
  const res = { mode: 'route', groups: [], top, calendar: { kind: 'trip', out: [], back: [], grid } };
  const r = H.gridTrips(res);
  assert.equal(r, res);
  assert.deepEqual(plain(r.top.map((t) => t.id)), ['a', 'c4', 'b', 'c5'], 'podle ceny');
  assert.deepEqual(plain(r.top[1].back), legs[1]);
  assert.notEqual(r.top[1].out, r.top[3].out, 'každá cesta má své lety');
  assert.equal(H.gridTrips(r).top.length, 4, 'podruhé nic nepřidá');
  assert.equal(H.gridTrips({ mode: 'route', top: [top[0]], calendar: { grid: { nights: [3, 5], cells: [] } } }).top.length, 1, 'stará odpověď bez cest buněk');
  assert.equal(H.gridTrips(null), null);
  // uložit: cesty buněk jen v calendar.grid (ne dvakrát), po načtení zase v top
  const c = { at: 1000, form: { from: [{ id: 'ap:VIE' }] }, payload: {}, res: r };
  const saved = JSON.parse(H.lastPack(c, 1e7));
  assert.deepEqual(saved.res.top.map((t) => t.id), ['a', 'b']);
  assert.equal(saved.res.calendar.grid.trips.length, 2);
  assert.deepEqual(plain(H.gridTrips(H.lastLoad(H.lastPack(c, 1e7), 2000).res).top.map((t) => t.id)), ['a', 'c4', 'b', 'c5']);
  assert.equal(r.top.length, 4, 'výsledek v paměti beze změny');
  // zkrácené (velké hledání): 40 nejlevnějších + nejlevnější z každého dalšího dne odletu, cesty buněk zůstanou v calendar.grid
  const day = (i) => `2026-12-${String(i < 60 ? 1 + (i % 2) : 3 + (i % 28)).padStart(2, '0')}`; // 60 nejlevnějších jen 1. a 2. 12.
  const many = Array.from({ length: 120 }, (_, i) => trip('m' + i, day(i), '2027-01-05', 1000 + i));
  const big = { ...c, res: { ...r, top: H.gridTrips({ ...r, top: many }).top } };
  const cap = H.lastPack(big, 1e7).length - 1;
  const cut = JSON.parse(H.lastPack(big, cap));
  assert.equal(cut.res.top.length, 40 + 28, '40 nejlevnějších + 28 dalších dnů po jedné');
  assert.deepEqual(cut.res.top.slice(40).map((t) => t.id), Array.from({ length: 28 }, (_, i) => 'm' + (60 + i)), 'z každého dne ta nejlevnější');
  assert.equal(new Set(cut.res.top.map((t) => t.out.date)).size, 30, 'každý den odletu má aspoň nejlevnější nabídku');
  assert.ok(cut.res.top.every((t) => !t.id.startsWith('c')));
  assert.equal(cut.res.calendar.grid.trips.length, 2);
  assert.equal(H.gridTrips(H.lastLoad(JSON.stringify(cut), 2000).res).top.filter((t) => t.id.startsWith('c')).length, 2, 'po zkrácení buňky mřížky nepřijdou o své cesty');
});

test('gridSummary: nejlevnější buňka česky (den v týdnu, datum, 1 noc / 2–4 noci / 5+ nocí), shoda → dřívější odlet a méně nocí', () => {
  const s = H.gridSummary([['2026-11-19', 5, 2300], ['2026-11-18', 4, 1650], ['2026-11-20', 3, 1900]]);
  assert.deepEqual(plain(s), { date: '2026-11-18', n: 4, cost: 1650, text: 'Nejlevněji: odlet st 18. 11., 4 noci' });
  assert.equal(H.gridSummary([['2026-11-21', 1, 900]]).text, 'Nejlevněji: odlet so 21. 11., 1 noc');
  assert.equal(H.gridSummary([['2026-11-22', 5, 900]]).text, 'Nejlevněji: odlet ne 22. 11., 5 nocí');
  assert.equal(H.gridSummary([['2026-11-23', 0, 900]]).text, 'Nejlevněji: odlet po 23. 11., 0 nocí');
  assert.equal(H.gridSummary([['2026-12-01', 2, 900]]).text, 'Nejlevněji: odlet út 1. 12., 2 noci');
  const tie = H.gridSummary([['2026-11-20', 5, 1000], ['2026-11-19', 6, 1000], ['2026-11-19', 4, 1000]]);
  assert.deepEqual([tie.date, tie.n], ['2026-11-19', 4]);
  assert.equal(H.gridSummary([]), null);
  assert.equal(H.gridSummary(null), null);
  assert.equal(H.gridSummary([['2026-11-19', 4, null]]), null, 'bez ceny');
});

test('gridModel: řádky podle dne, sloupce noci, minimum řádku; s filtry z načtených nabídek (gone = filtr skryl); stará odpověď bez mřížky', () => {
  const grid = { nights: [3, 5], cells: [['2026-11-18', 3, 2100], ['2026-11-18', 4, 1650], ['2026-11-19', 5, 2300]], skipped: 0 };
  const m = plain(H.gridModel(grid));
  assert.deepEqual(m.nights, [3, 4, 5]);
  assert.deepEqual(m.rows.map((r) => [r.date, r.min, r.cells.map((c) => c.cost)]), [['2026-11-18', 1650, [2100, 1650, null]], ['2026-11-19', 2300, [null, null, 2300]]]);
  assert.equal(m.best.text, 'Nejlevněji: odlet st 18. 11., 4 noci');
  assert.ok(m.rows.every((r) => r.cells.every((c) => !c.gone)));
  // filtry času a přestupů: jen nabídky, které prošly (mimo mřížku serveru se nepřidají)
  const leg = (date) => ({ date, from: 'VIE', to: 'STN', dep: `${date}T10:00:00` });
  const trip = (o, b, czk) => ({ out: leg(o), back: leg(b), perPersonCzk: czk });
  const f = plain(H.gridModel(grid, [trip('2026-11-18', '2026-11-21', 2400.4), trip('2026-11-18', '2026-11-21', 2250), trip('2026-11-19', '2026-11-24', 2600), trip('2026-11-25', '2026-11-28', 900)]));
  assert.deepEqual(f.rows.map((r) => [r.date, r.min, r.cells.map((c) => (c.gone ? 'x' : c.cost))]), [['2026-11-18', 2250, [2250, 'x', null]], ['2026-11-19', 2600, [null, null, 2600]]]);
  assert.deepEqual([f.best.date, f.best.n, f.best.cost], ['2026-11-18', 3, 2250]);
  const none = plain(H.gridModel(grid, []));
  assert.equal(none.best, null);
  assert.equal(none.rows.flatMap((r) => r.cells).filter((c) => c.gone).length, 3);
  assert.equal(H.gridModel(undefined), null, 'stará odpověď bez calendar.grid');
  assert.equal(H.gridModel({ nights: [3, 5], cells: [] }), null);
  assert.equal(H.gridModel({ cells: [['2026-11-18', 3, 1]] }), null);
});

test('activeFilters: buňka mřížky = čip „odlet 18. 11., 4 noci“ (jeden čip, zruší den i noci)', () => {
  const v = { outDate: '2026-11-18', nights: 4, excludeOrigins: new Set(), carriers: new Set() };
  assert.deepEqual(plain(H.activeFilters(null, v).map((c) => [c.key, c.label])), [['outDate', 'odlet 18. 11., 4 noci']]);
  assert.deepEqual(plain(H.activeFilters(null, { ...v, nights: 1 }).map((c) => c.label)), ['odlet 18. 11., 1 noc']);
  assert.deepEqual(plain(H.activeFilters(null, { ...v, nights: 7 }).map((c) => c.label)), ['odlet 18. 11., 7 nocí']);
  assert.deepEqual(plain(H.activeFilters(null, { ...v, nights: null }).map((c) => c.label)), ['odlet 18. 11.']);
});
