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
const { CELL_KEYS, cellRows, search } = await import('../server/lib/search.js');

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const H = ctx.window.SearchHelp;
const pctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/pricecheck.js', import.meta.url), 'utf8'), pctx);
const P = pctx.window.PriceCheck;
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

test('hledání (DEMO): mřížka nezmění nabídky, top ani „Je to dobrá cena?“ – cesty buněk jen kompaktně v calendar.grid (řádek hodnot), mimo statistiku cen', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} }));
  try {
    const q = Q();
    const on = plain(await search(q));
    const off = plain(await search(q, () => {}, { limits: { grid: false } }));
    assert.equal(off.calendar.grid, undefined);
    const g = on.calendar.grid;
    assert.ok(g.trips.length > 20, `cest buněk mimo top: ${g.trips.length}`);
    // nabídky, výpis, skupiny, statistika cen i kalendář tam/zpět beze změny (cesty buněk nejsou v cenových poolech)
    for (const k of ['top', 'groups', 'priceStats', 'filters']) assert.deepEqual(on[k], off[k], k);
    assert.deepEqual([on.calendar.out, on.calendar.back], [off.calendar.out, off.calendar.back]);
    assert.equal(on.stats.trips, off.stats.trips);
    // kompaktně: cesta = řádek hodnot v pořadí keys (bez id, nocí, ceny celkem a úrovně ceny), každý let jednou v legs
    assert.deepEqual(g.keys, CELL_KEYS);
    assert.ok(g.trips.every((r) => Array.isArray(r) && r.length === g.keys.length && g.legs[r[0]] && g.legs[r[1]] && g.legs[r[0]].date < g.legs[r[1]].date));
    assert.equal(new Set(g.legs.map((l) => JSON.stringify(l))).size, g.legs.length, 'let jen jednou');
    const cells = plain(H.cellTrips(g, q.adults));
    assert.equal(cells.length, g.trips.length);
    const ids = new Set(on.top.map((t) => t.id));
    assert.ok(cells.every((t) => t.cell && !ids.has(t.id) && t.destKey === 'LON' && t.deal && !t.priceLevel), 'top je nemá – přidá je až prohlížeč');
    assert.ok(cells.every((t) => t.perPersonCzk === t.flightCzk + t.bagCzk && t.tripCzk === t.perPersonCzk + t.groundCzk + t.arrCzk && t.totalCzk === t.perPersonCzk * 2 && t.nights === daysBetween(t.out.date, t.back.date)));
    const full = withCells(on).top.filter((t) => !ids.has(t.id));
    assert.equal(full.length, g.trips.length);
    assert.ok(JSON.stringify(g.trips).length < 0.2 * JSON.stringify(full).length, 'řádek hodnot místo celé nabídky');
    assert.ok(JSON.stringify(on).length < 1.3 * JSON.stringify(off).length, `odpověď ${JSON.stringify(off).length} → ${JSON.stringify(on).length} znaků`);
  } finally {
    stub.restore();
  }
});

test('cesty buněk: řádek hodnot ze serveru (cellRows) složí prohlížeč (cellTrips) zpět na stejnou nabídku jako v top – id, noci, ceny, parkování; úroveň ceny dopočítá PriceCheck stejně jako server', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} }));
  try {
    for (const q of [Q(), { ...Q(), groundMode: 'car', bags: 'cabin', adults: 3, radiusKm: 300 }]) {
      const r = plain(await search(q));
      const list = r.top.filter((t) => t.back);
      assert.ok(list.length > 50);
      const back = plain(H.cellTrips(plain(cellRows(list)), r.query.adults));
      assert.equal(back.length, list.length);
      for (const [i, t] of list.entries()) {
        const { priceLevel, ...rest } = t;
        assert.deepEqual(back[i], { ...rest, cell: true }, t.id);
        const st = r.groups.find((x) => x.dest.key === t.destKey).priceStats;
        assert.deepEqual([P.assess(back[i], st).level, P.assess(back[i], st).basis], [priceLevel.level, priceLevel.basis], `úroveň ceny ${t.id}`);
      }
      if (q.groundMode === 'car') assert.ok(back.some((t) => t.parkCzk > 0) && back.some((t) => t.bagCzk > 0), 'parkování i zavazadla');
    }
    // starší odpověď (cesty buněk jako celé objekty s pořadím letů) – taky
    const legs = [{ provider: 'x', from: 'VIE', to: 'STN', dep: '2027-01-02T10:00:00', date: '2027-01-02' }, { provider: 'x', from: 'STN', to: 'VIE', dep: '2027-01-05T10:00:00', date: '2027-01-05' }];
    assert.deepEqual(plain(H.cellTrips({ legs, trips: [{ id: 'old', out: 0, back: 1, perPersonCzk: 900 }] })), [{ id: 'old', out: legs[0], back: legs[1], perPersonCzk: 900, cell: true }]);
    assert.deepEqual(plain(H.cellTrips({ legs, keys: CELL_KEYS, trips: [[0, 9]] })), [], 'chybějící let');
    assert.deepEqual(plain(H.cellTrips(undefined)), []);
  } finally {
    stub.restore();
  }
});

test('hledání (DEMO): odpověď s mřížkou naroste jen o kompaktní cesty buněk – i u 2 týdnů a širokého rozsahu nocí a dnů', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} }));
  try {
    const cases = [
      [{ ...Q(), nightsMin: 11, nightsMax: 16, dateFrom: ymdPlus(7), dateTo: ymdPlus(60) }, 1.33], // „2 týdny“
      [{ ...Q(), radiusKm: 300, nightsMin: 2, nightsMax: 20, dateFrom: ymdPlus(7), dateTo: ymdPlus(90) }, 1.4], // 600 buněk
    ];
    for (const [q, max] of cases) {
      const on = JSON.stringify(await search(q));
      const off = JSON.stringify(await search(q, () => {}, { limits: { grid: false } }));
      assert.ok(on.length < max * off.length, `${q.nightsMin}–${q.nightsMax} nocí: ${off.length} → ${on.length} znaků (×${(on.length / off.length).toFixed(2)})`);
    }
  } finally {
    stub.restore();
  }
});

test('hledání (DEMO): „Odkud se vyplatí letět“ i s cestami buněk – cena u letiště = nejlevnější cesta odsud a zpět ve výpisu, jaký prohlížeč ukáže', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} }));
  try {
    const home = (t) => (!t.back || t.back.to === t.out.from ? t.out.from : null);
    for (const q of [
      { ...Q(), radiusKm: 300, nightsMin: 3, nightsMax: 9, dateFrom: ymdPlus(7), dateTo: ymdPlus(60) },
      { ...Q(), from: ['ap:PRG'], radiusKm: 200, nightsMin: 5, nightsMax: 9, dateFrom: ymdPlus(7), dateTo: ymdPlus(60) },
    ]) {
      const r = plain(await search(q));
      const off = plain(await search(q, () => {}, { limits: { grid: false } }));
      const all = withCells(r).top;
      assert.ok(r.origins.filter((o) => o.best).length >= 2);
      for (const o of r.origins) {
        const mine = all.filter((t) => home(t) === o.iata).map((t) => Math.round(t.perPersonCzk));
        assert.equal(o.best ? o.best.czk : null, mine.length ? Math.min(...mine) : null, `${o.iata}: karta = výpis po klepnutí na letiště`);
        const was = off.origins.find((x) => x.iata === o.iata).best;
        if (was) assert.ok(o.best.czk <= was.czk && o.best.n >= was.n, o.iata);
      }
    }
  } finally {
    stub.restore();
  }
});

test('hledání (DEMO): max. cena na osobu – kalendář ani mřížka nenabídnou dražší den či buňku; každá buňka i den mají ve výpisu nabídku se svou cenou', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} }));
  try {
    const q = Q();
    const free = plain(await search(q));
    const costs = free.calendar.grid.cells.map((c) => c[2]).sort((a, b) => a - b);
    const max = costs[Math.floor(costs.length / 2)];
    assert.ok(free.calendar.out.some((d) => d.cost > max) && costs.some((c) => c > max), 'bez limitu jsou i dražší dny a buňky');
    const r = plain(await search({ ...q, maxPrice: max }));
    assert.ok(r.filters.hidden.maxPrice > 0);
    const g = r.calendar.grid;
    assert.ok(g.cells.length > 10 && g.cells.every((c) => c[2] <= max), 'buňky do max. ceny');
    assert.ok(r.calendar.out.length && [...r.calendar.out, ...r.calendar.back].every((d) => d.cost <= max), 'dny kalendáře do max. ceny');
    const all = cellsCovered(r, 'max. cena: ');
    for (const d of r.calendar.out) {
      const day = all.filter((t) => t.out.date === d.date).map((t) => Math.round(t.perPersonCzk));
      assert.equal(Math.min(...day), Math.round(d.cost), `${d.date}: ve výpisu nabídka s cenou dne`);
    }
    // buňky do limitu mají stejnou cenu jako bez něj (dražší jen zmizely)
    const before = new Map(free.calendar.grid.cells.map((c) => [c[0] + '|' + c[1], c[2]]));
    assert.ok(g.cells.every((c) => before.get(c[0] + '|' + c[1]) === c[2]));
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
  const leg = (from, to, date, dep = '10:00') => ({ provider: 'demo-air', from, to, date, dep: `${date}T${dep}:00`, czk: 500, pad: 'x'.repeat(300) });
  const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const trip = (id, o, b, czk) => ({ id, out: leg('VIE', 'STN', o), back: leg('STN', 'VIE', b), nights: diff(o, b), perPersonCzk: czk });
  const top = [trip('a', '2026-11-18', '2026-11-21', 1500), trip('b', '2026-11-19', '2026-11-22', 2500)];
  const legs = [leg('VIE', 'STN', '2026-11-18'), leg('STN', 'VIE', '2026-11-22', '18:00'), leg('STN', 'VIE', '2026-11-23', '18:00')];
  const vals = { groundCzk: 200, bagCzk: 0, arrCzk: 300, parkCzk: 0, bagEst: 0, combined: 0, bookUrl: null, tempHi: 11, distanceKm: 1240, destKey: 'LON', deal: [1.8, 'good', null] };
  const row = (o, b, flightCzk) => CELL_KEYS.map((k) => ({ ...vals, out: o, back: b, flightCzk })[k]);
  const grid = { nights: [3, 5], cells: [['2026-11-18', 3, 1500], ['2026-11-18', 4, 1800], ['2026-11-18', 5, 3100]], skipped: 0, legs, keys: CELL_KEYS, trips: [row(0, 1, 1800), row(0, 2, 3100)] };
  const res = { mode: 'route', query: { adults: 2 }, groups: [], top, calendar: { kind: 'trip', out: [], back: [], grid } };
  const r = H.gridTrips(res);
  assert.equal(r, res);
  const id4 = 'demo-air|VIE|STN|2026-11-18T10:00:00|demo-air|STN|VIE|2026-11-22T18:00:00';
  const id5 = 'demo-air|VIE|STN|2026-11-18T10:00:00|demo-air|STN|VIE|2026-11-23T18:00:00';
  assert.deepEqual(plain(r.top.map((t) => t.id)), ['a', id4, 'b', id5], 'podle ceny');
  assert.deepEqual(plain(r.top[1]), {
    id: id4, out: legs[0], back: legs[1], flightCzk: 1800, nights: 4, provider: 'demo-air', combined: false, bookUrl: null, groundCzk: 200, bagCzk: 0, arrCzk: 300,
    perPersonCzk: 1800, tripCzk: 2300, totalCzk: 3600, tempHi: 11, distanceKm: 1240, deal: { score: 1.8, level: 'good', drop: null }, destKey: 'LON', cell: true,
  });
  assert.equal(r.top[3].perPersonCzk, 3100);
  assert.notEqual(r.top[1].out, r.top[3].out, 'každá cesta má své lety');
  assert.equal(H.gridTrips(r).top.length, 4, 'podruhé nic nepřidá');
  assert.equal(H.gridTrips({ mode: 'route', top: [top[0]], calendar: { grid: { nights: [3, 5], cells: [] } } }).top.length, 1, 'stará odpověď bez cest buněk');
  assert.equal(H.gridTrips(null), null);
  // uložit: cesty buněk jen v calendar.grid (ne dvakrát), po načtení zase v top
  const c = { at: 1000, form: { from: [{ id: 'ap:VIE' }] }, payload: {}, res: r };
  const saved = JSON.parse(H.lastPack(c, 1e7));
  assert.deepEqual(saved.res.top.map((t) => t.id), ['a', 'b']);
  assert.deepEqual(saved.res.calendar.grid.trips, plain(grid.trips));
  assert.deepEqual(plain(H.gridTrips(H.lastLoad(H.lastPack(c, 1e7), 2000).res).top.map((t) => t.id)), ['a', id4, 'b', id5]);
  assert.equal(r.top.length, 4, 'výsledek v paměti beze změny');

  // zkrácené (velké hledání): co nejvíc nejlevnějších bez mezer, vždy ale nejlevnější z každého dne odletu (kalendář) a z
  // každé buňky mřížky, která cestu v calendar.grid nemá. 40 kombinací 1. 12.: 3–6 nocí po řadě, od m35 jen 7 nocí →
  // buňka „1. 12. / 7 nocí“ má nejlevnější cestu až m35, daleko za nejlevnějšími.
  const many = Array.from({ length: 40 }, (_, i) => trip('m' + i, '2026-12-01', `2026-12-0${i < 35 ? 4 + (i % 4) : 8}`, 1000 + i * 10));
  const cells = [...grid.cells, ...[3, 4, 5, 6].map((n) => ['2026-12-01', n, 1000 + (n - 3) * 10]), ['2026-12-01', 7, 1350]];
  const big = { ...c, res: H.gridTrips({ ...res, top: [...many, ...top], calendar: { ...res.calendar, grid: { ...grid, nights: [3, 7], cells } } }) };
  const ids = (s) => JSON.parse(s).res.top.map((t) => t.id);
  const len = (t) => JSON.stringify(t).length + 1;
  const empty = JSON.stringify({ ...big, res: { ...big.res, top: [] } }).length;
  const full = H.lastPack(big, 1e7);
  assert.equal(ids(full).length, 42);
  // o znak méně: pryč jen nejdražší kombinace, která není jediná svého dne ani buňky (m39; dražší „b“ je jediná 19. 11.)
  assert.deepEqual(ids(H.lastPack(big, full.length - 1)), [...many.slice(0, 39).map((t) => t.id), 'a', 'b']);
  // těsně: povinné (m0–m3 a m35 za buňky 1. 12., „a“ za den i buňku 18. 11., „b“ za den 19. 11.) + 4 nejlevnější další
  const must = ['m0', 'm1', 'm2', 'm3', 'm35', 'a', 'b'], more = ['m4', 'm5', 'm6', 'm7'];
  const byId = new Map([...many, ...top].map((t) => [t.id, t]));
  const cap = empty + [...must, ...more].reduce((s, id) => s + len(byId.get(id)), 0);
  const cut = H.lastPack(big, cap);
  assert.ok(cut.length <= cap);
  assert.deepEqual(ids(cut), ['m0', 'm1', 'm2', 'm3', ...more, 'm35', 'a', 'b']);
  const back = plain(H.gridTrips(H.lastLoad(cut, 2000).res));
  for (const [d, n, czk] of cells) {
    const list = back.top.filter((t) => cellKey(t) === `${d}|${n}`).map((t) => t.perPersonCzk);
    assert.equal(Math.min(...list), czk, `po obnovení má buňka ${d} ${n} nocí nabídku se svou cenou`);
  }
  // na povinné cesty buněk místo není → bez mřížky (buňka bez cesty by nic neukázala), jen nejlevnější dnů + nejlevnější další
  const noGrid = (({ grid: _, ...cal }) => ({ ...big, res: { ...big.res, calendar: cal, top: [] } }))(big.res.calendar);
  const cap2 = JSON.stringify(noGrid).length + ['m0', 'a', 'b', 'm1'].reduce((s, id) => s + len(byId.get(id)), 0);
  assert.ok(cap2 < cap - 2 * len(byId.get('m35')), 'na buňky (m1–m3, m35) místo není');
  const slim = JSON.parse(H.lastPack(big, cap2));
  assert.equal(slim.res.calendar.grid, undefined);
  assert.deepEqual(slim.res.calendar.out, big.res.calendar.out, 'kalendář zůstane');
  assert.deepEqual(slim.res.top.map((t) => t.id), ['m0', 'm1', 'a', 'b']);
  assert.equal(H.gridModel(H.gridTrips(H.lastLoad(JSON.stringify(slim), 2000).res).calendar.grid), null, 'po obnovení bez mřížky');
  assert.equal(H.lastPack(big, JSON.stringify(noGrid).length + 100), null, 'nevejdou se ani nejlevnější dnů');
  // vysvětlující: dřív (40 nejlevnějších + den) by buňka „1. 12. / 7 nocí“ o svou jedinou cestu přišla
  assert.ok(!many.slice(0, 35).some((t) => t.nights === 7));
});

test('hledání (DEMO) + lastPack: i zkrácené uložené hledání má po obnovení u každé buňky mřížky i dne kalendáře nabídku se stejnou cenou jako před uložením a z výpisu co nejvíc nejlevnějších', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} }));
  try {
    const q = { ...Q(), radiusKm: 300, nightsMin: 2, nightsMax: 12, dateFrom: ymdPlus(7), dateTo: ymdPlus(70) };
    const r = withCells(await search(q));
    const c = { at: 1000, form: { from: [{ id: 'ap:VIE' }] }, payload: q, res: r };
    const full = H.lastPack(c, 1e9);
    const empty = JSON.stringify({ ...c, res: { ...r, groups: r.groups.map((g) => ({ ...g, options: g.options.slice(0, 3) })), top: [] } }).length;
    const minBy = (list, key) => { const m = {}; for (const t of list) { const k = key(t), p = Math.round(t.perPersonCzk); if (k && !(m[k] <= p)) m[k] = p; } return m; };
    const dayOf = (t) => t.out.date;
    const want = { day: minBy(r.top, dayOf), cell: minBy(r.top, (t) => t.back && cellKey(t)) };
    const own = r.top.filter((t) => !t.cell);
    const gridKeys = new Set(r.top.filter((t) => t.cell).map(cellKey)), must = new Set(), seen = new Set();
    for (const t of own) for (const k of [t.out.date, t.back && !gridKeys.has(cellKey(t)) && cellKey(t)]) if (k && !seen.has(k)) { seen.add(k); must.add(t.id); }
    assert.ok(own.length > 150 && r.calendar.grid.cells.length > 300, `výpis ${own.length}, buněk ${r.calendar.grid.cells.length}`);
    // 0,99 a 0,85: s mřížkou (povinné cesty dnů a buněk zaberou ~60–72 % výpisu); 0,45: na ně místo není → bez mřížky,
    // jen povinné nejlevnější dnů (~30 %) a nejlevnější další
    for (const share of [0.99, 0.85, 0.45]) {
      const cap = Math.round(empty + (full.length - empty) * share);
      const s = H.lastPack(c, cap);
      assert.ok(s && s.length <= cap, `podíl ${share}: ${s && s.length} ≤ ${cap}`);
      const back = plain(H.gridTrips(H.lastLoad(s, 2000).res));
      assert.deepEqual(minBy(back.top, dayOf), want.day, `podíl ${share}: nejlevnější každého dne odletu`);
      const grid = back.calendar.grid;
      assert.equal(Boolean(grid), share > 0.5, `podíl ${share}: mřížka ${grid ? 'zůstala' : 'vynechaná'}`);
      const cell = minBy(back.top, (t) => t.back && cellKey(t));
      if (grid) for (const [d, n, czk] of grid.cells) assert.equal(cell[`${d}|${n}`], czk, `podíl ${share}: buňka ${d} ${n} nocí`);
      // z výpisu nejlevnější bez mezer, za nimi jen povinné (nejlevnější svého dne nebo buňky bez cesty v calendar.grid)
      const kept = new Set(back.top.filter((t) => !t.cell).map((t) => t.id));
      const gap = own.findIndex((t) => !kept.has(t.id)), prefix = gap < 0 ? own.length : gap;
      assert.ok(prefix > 0, `podíl ${share}: nejlevnějších ${prefix}`);
      if (share < 0.9) assert.ok(prefix < own.length && kept.size > prefix, `podíl ${share}: zkrácené (${prefix} nejlevnějších + ${kept.size - prefix} povinných z ${own.length})`);
      assert.ok(own.slice(prefix).every((t) => !kept.has(t.id) || must.has(t.id)), `podíl ${share}: za nejlevnějšími jen povinné`);
      if (share === 0.99) assert.ok(kept.size > 0.95 * own.length, `skoro celý výpis: ${kept.size} z ${own.length}`);
    }
  } finally {
    stub.restore();
  }
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
  const v = { outDate: '2026-11-18', nights: 4, excludeOrigins: new Set(), excludeCarriers: new Set() };
  assert.deepEqual(plain(H.activeFilters(null, v).map((c) => [c.key, c.label])), [['outDate', 'odlet 18. 11., 4 noci']]);
  assert.deepEqual(plain(H.activeFilters(null, { ...v, nights: 1 }).map((c) => c.label)), ['odlet 18. 11., 1 noc']);
  assert.deepEqual(plain(H.activeFilters(null, { ...v, nights: 7 }).map((c) => c.label)), ['odlet 18. 11., 7 nocí']);
  assert.deepEqual(plain(H.activeFilters(null, { ...v, nights: null }).map((c) => c.label)), ['odlet 18. 11.']);
});
