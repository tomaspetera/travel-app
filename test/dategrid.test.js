// Mřížka termínů (den odletu × počet nocí) u flexibilního termínu: optimalizátor (DEMO lety z mock.js, žádné dotazy
// na zdroje), kompaktní calendar.grid v odpovědi hledání a pomocníci pro UI (gridModel, gridSummary) ze searchhelp.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { bestRoundTrips, calendarArray, dateOk, gridArray, legsPerDay, returnFits } = await import('../server/lib/optimizer.js');
const { mockProviders } = await import('../server/providers/mock.js');
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

test('mřížka termínů: každá buňka = nejlevnější ze všech zvážených dvojic (den odletu × noci), i za limitem návratů na let', async () => {
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
  // víc návratů na den, než optimalizátor páruje (3 × 2 varianty) – limit tu opravdu platí
  const perDay = new Map();
  for (const b of backs) perDay.set(b.date, (perDay.get(b.date) || 0) + 1);
  assert.ok(Math.max(...perDay.values()) > 6, 'limit návratů na let se uplatní');
  // řádek mřížky = kalendář podle dne odletu (stejné dvojice)
  for (const d of calendarArray(cal.out)) {
    const row = [...cal.grid.values()].filter((e) => e.outDate === d.date).map((e) => e.cost);
    assert.equal(Math.min(...row), d.cost, d.date);
  }
});

test('mřížka termínů: s cal.grid stejné nabídky i kalendář tam/zpět; perCell výběr jen rozšíří o nejlevnější cestu každé buňky', async () => {
  const { out, back } = await demoLegs('2027-04-05', '2027-05-04', '2027-05-10');
  const plainCal = { out: new Map(), back: new Map() };
  const base = bestRoundTrips(out, back, groundOf, { ...OPTS, calendar: plainCal });
  const cal = { out: new Map(), back: new Map(), grid: new Map() };
  const same = bestRoundTrips(out, back, groundOf, { ...OPTS, calendar: cal });
  assert.deepEqual(ids(same), ids(base), 'mřížka nezmění vybrané nabídky');
  assert.deepEqual(calendarArray(cal.out), calendarArray(plainCal.out));
  assert.deepEqual(calendarArray(cal.back), calendarArray(plainCal.back));
  const cal2 = { out: new Map(), back: new Map(), grid: new Map() };
  const more = bestRoundTrips(out, back, groundOf, { ...OPTS, calendar: cal2, perCell: true });
  assert.deepEqual(calendarArray(cal2.out), calendarArray(plainCal.out));
  assert.deepEqual(calendarArray(cal2.back), calendarArray(plainCal.back));
  const has = new Set(ids(more));
  assert.ok(ids(base).every((id) => has.has(id)), 'perCell: všechny dřívější nabídky zůstanou');
  assert.ok(more.length > base.length, `perCell přidá nejlevnější cesty buněk (${base.length} → ${more.length})`);
  const g = gridArray(cal2.grid, OPTS);
  assert.deepEqual(g.nights, [2, 6]);
  assert.equal(g.skipped, 0);
  for (const [d, n, czk] of g.cells) {
    const list = more.filter((t) => t.out.date === d && t.nights === n).map(costOf);
    assert.equal(Math.min(...list), czk, `${d} ${n} nocí: nejlevnější vybraná nabídka = buňka`);
  }
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

test('hledání (DEMO): calendar.grid jen u flexibilního termínu s rozsahem nocí; buňka = nejlevnější nabídka výpisu s tím odletem a nocemi', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} })); // kurzy měn bez sítě (orientační), zdroje jsou DEMO
  try {
    const q = { from: ['ap:VIE'], to: ['metro:LON'], radiusKm: 120, dateFrom: ymdPlus(10), dateTo: ymdPlus(40), trip: 'return', nightsMin: 3, nightsMax: 6, adults: 2, kmRate: 1, groundMode: 'transit', arrival: true };
    const r = await search(q);
    const g = r.calendar.grid;
    assert.deepEqual(g.nights, [3, 6]);
    assert.ok(g.cells.length > 40 && g.cells.every((c) => c.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(c[0]) && Number.isInteger(c[2])));
    assert.ok(JSON.stringify(g).length < 20000, 'kompaktní');
    for (const [d, n, czk] of g.cells) {
      const list = r.top.filter((t) => t.out.date === d && t.nights === n).map((t) => Math.round(t.perPersonCzk));
      assert.equal(Math.min(...list), czk, `${d} ${n} nocí`);
    }
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
