// Pomoc s výsledky hledání: čistá logika z public/js/searchhelp.js (klasický skript pro prohlížeč, načtený přes node:vm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const H = ctx.window.SearchHelp;
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu
const kc = (n) => n.toLocaleString('cs-CZ') + ' Kč';

const leg = (from, to, dep, carrier, extra = {}) => ({ from, to, dep, date: dep.slice(0, 10), carrier, stops: 0, hasTime: true, czk: 1000, provider: 'kiwi', ...extra });
const trip = (out, back, perPersonCzk) => ({ id: `${out.dep}|${back?.dep}`, out, back, perPersonCzk });

const O1 = leg('PRG', 'BCN', '2026-11-12T06:00:00', 'FR');
const O2 = leg('PRG', 'BCN', '2026-11-12T14:50:00', 'FR');
const O3 = leg('VIE', 'BCN', '2026-11-12T09:45:00', 'VY', { stops: 1 });
const B1 = leg('BCN', 'PRG', '2026-11-16T07:50:00', 'VY');
const B2 = leg('BCN', 'PRG', '2026-11-16T21:50:00', 'FR');
const TRIPS = [trip(O1, B1, 3000), trip(O1, B2, 3500), trip(O2, B1, 3200), trip(O3, B2, 2900)];

test('distinctLegs: každý let tam/zpět jednou, s nejlevnější kombinací a s vybraným letem druhým směrem', () => {
  const outs = H.distinctLegs(TRIPS, 'out');
  assert.equal(outs.length, 3);
  const o1 = outs.find((x) => x.leg.dep === O1.dep);
  assert.equal(o1.count, 2);
  assert.equal(o1.best.perPersonCzk, 3000);
  assert.equal(o1.paired, null);
  // vybraný návrat B2: O1 a O3 s ním spárované, O2 ne
  const withB2 = H.distinctLegs(TRIPS, 'out', H.legSig(B2));
  assert.equal(withB2.find((x) => x.leg.dep === O1.dep).paired.perPersonCzk, 3500);
  assert.equal(withB2.find((x) => x.leg.dep === O2.dep).paired, null);
  const backs = H.distinctLegs(TRIPS, 'back', H.legSig(O2));
  assert.deepEqual(plain(backs.map((x) => [x.leg.dep.slice(11, 16), x.best.perPersonCzk, x.paired?.perPersonCzk ?? null])), [['07:50', 3000, 3200], ['21:50', 2900, null]]);
});

test('distinctLegs + composeTrip: dvojice samostatných letenek mimo výsledky se dopočítá (vč. dopravy a zavazadel), společná letenka ne', () => {
  const c = { groundCzk: 0, bagCzk: 0 };
  const o1 = leg('PRG', 'BCN', '2026-11-12T06:00:00', 'FR', { ...c, czk: 1000, arr: '2026-11-12T08:30:00' });
  const o2 = leg('VIE', 'BCN', '2026-11-12T14:50:00', 'W6', { groundCzk: 400, bagCzk: 0, czk: 900, arr: '2026-11-12T17:20:00' });
  const b1 = leg('BCN', 'PRG', '2026-11-16T07:50:00', 'VY', { ...c, czk: 1200 });
  const b2 = leg('GRO', 'PRG', '2026-11-16T21:50:00', 'FR', { groundCzk: 0, bagCzk: 300, czk: 800 });
  const T = (o, b, extra = {}) => ({ id: `${o.dep}|${b.dep}`, out: o, back: b, destKey: 'BCN', combined: false, distanceKm: 1100, tempHi: 17,
    perPersonCzk: o.czk + o.groundCzk + o.bagCzk + b.czk + b.groundCzk + b.bagCzk, ...extra });
  const trips = [T(o1, b1), T(o2, b2)]; // o1+b2 a o2+b1 mezi výsledky nejsou
  const backs = H.distinctLegs(trips, 'back', H.legSig(o1), { adults: 2, openJaw: true });
  const x = backs.find((y) => y.leg === b2);
  assert.equal(x.paired.perPersonCzk, 1000 + 800 + 300, 'cena složené cesty = letenky + zavazadla + doprava');
  assert.deepEqual(plain([x.paired.composed, x.paired.totalCzk, x.paired.nights, x.paired.provider, x.paired.groundCzk, x.paired.bagCzk]), [true, 4200, 4, 'kiwi', 0, 300]);
  assert.equal(x.paired.back.from, 'GRO', 'open-jaw v cíli (stejné město podle destKey)');
  const outs = H.distinctLegs(trips, 'out', H.legSig(b1), { openJaw: true });
  assert.equal(outs.find((y) => y.leg === o2).paired.perPersonCzk, 900 + 400 + 1200, 'odlet z jiného domácího letiště + doprava na něj');
  // bez open-jaw: návrat jinam / z jiného letiště → nejde
  assert.equal(H.distinctLegs(trips, 'back', H.legSig(o1), { openJaw: false }).find((y) => y.leg === b2).paired, null);
  // filtry výpisu (keep) i společná zpáteční letenka → nedopočítá se
  assert.equal(H.distinctLegs(trips, 'back', H.legSig(o1), { keep: (t) => t.perPersonCzk < 2000 }).find((y) => y.leg === b2).paired, null);
  const combined = [T(o1, b1), T(o2, b2, { combined: true })];
  assert.equal(H.distinctLegs(combined, 'back', H.legSig(o1)).find((y) => y.leg === b2).paired, null);
  // stejný den: návrat dřív než 2 h po příletu nejde
  const sameDay = leg('BCN', 'PRG', '2026-11-12T09:30:00', 'VY', { ...c, czk: 500 });
  const late = leg('BCN', 'PRG', '2026-11-12T19:00:00', 'VY', { ...c, czk: 600 });
  const day = [T(o2, sameDay), T(o2, late)];
  const dayBacks = H.distinctLegs(day, 'back', H.legSig(o1), {});
  assert.equal(H.composeTrip(T(o1, b1), T(o2, sameDay)), null);
  assert.equal(dayBacks.length, 2);
  assert.equal(H.composeTrip(T(o1, b1), T(o2, late)).perPersonCzk, 1600);
});

test('sortLegs: podle ceny (spárované napřed) nebo podle času odletu', () => {
  const outs = H.distinctLegs(TRIPS, 'out');
  assert.deepEqual(plain(H.sortLegs(outs, 'price').map((x) => x.leg.dep.slice(11, 16))), ['09:45', '06:00', '14:50']);
  assert.deepEqual(plain(H.sortLegs(outs, 'time').map((x) => x.leg.dep.slice(11, 16))), ['06:00', '09:45', '14:50']);
  const pair = H.legSig(B1);
  const paired = H.sortLegs(H.distinctLegs(TRIPS, 'out', pair), 'price', pair);
  assert.deepEqual(plain(paired.map((x) => x.leg.dep.slice(11, 16))), ['06:00', '14:50', '09:45'], 'nespárovaný let (jen s jiným návratem) až na konec');
});

test('freeDeps: další odlety dne bez těch, které výsledky ukazují i s cenou', () => {
  const l = { ...O1, otherDeps: ['10:00', '14:50', '19:30'] };
  const priced = H.pricedTimes(TRIPS);
  assert.ok(priced.has('PRG|BCN|2026-11-12|FR|14:50'));
  assert.ok(!priced.has('VIE|BCN|2026-11-12|VY|09:45'), 'let s přestupem není „další let tento den“');
  assert.deepEqual(plain(H.freeDeps(l, priced)), ['10:00', '19:30']);
  assert.deepEqual(plain(H.freeDeps({ ...O3 }, priced)), []);
  assert.deepEqual(plain(H.freeDeps(l, null)), ['10:00', '14:50', '19:30']);
});

const NB = {
  out: {
    around: '2026-11-12', from: '2026-11-09', to: '2026-11-15',
    days: [{ date: '2026-11-10', cost: 1290, carrierName: 'Ryanair', stops: 0 }, { date: '2026-11-12', cost: 2400, carrierName: 'Vueling', stops: 0 }, { date: '2026-11-13', cost: 1500, carrierName: 'Ryanair', stops: 0 }],
    lowcostOnDay: false, lowcostNear: ['2026-11-10', '2026-11-13', '2026-11-15'], lowcostNames: ['Ryanair'],
  },
  back: {
    around: '2026-11-16', from: '2026-11-13', to: '2026-11-19',
    days: [{ date: '2026-11-16', cost: 1613, carrierName: 'Ryanair', stops: 0 }], lowcostOnDay: true, lowcostNear: [], lowcostNames: ['Ryanair'],
  },
  hint: 'V den odletu nemá Ryanair volný let – nejbližší lety: 10. 11., 13. 11., 15. 11.',
};

test('nearStrip: 7 dní kolem data, ceny, zadaný a nejlevnější den, návrat ne před odletem', () => {
  const s = H.nearStrip(NB.out);
  assert.equal(s.length, 7);
  assert.deepEqual(plain(s.map((d) => d.cost)), [null, 1290, null, 2400, 1500, null, null]);
  assert.equal(s.find((d) => d.around).date, '2026-11-12');
  assert.equal(s.find((d) => d.best).date, '2026-11-10');
  const b = H.nearStrip(NB.back, { minDate: '2026-11-15' });
  assert.deepEqual(plain(b.filter((d) => d.disabled).map((d) => d.date)), ['2026-11-13', '2026-11-14']);
  assert.equal(b.some((d) => d.best), false, 'jediná cena není „nejlevnější den“');
  assert.deepEqual(plain(H.nearStrip(null)), []);
});

test('nearHeadline: v zadaný den nízkonákladovka nemá volný let → nejbližší dny s cenou; jinak levnější den vedle', () => {
  assert.equal(H.nearHeadline(NB), `V den odletu nemá Ryanair volný let – 10. 11. od ${kc(1290)}, 13. 11. od ${kc(1500)}`);
  const cheapFar = { out: { ...NB.out, lowcostNear: ['2026-11-11', '2026-11-13', '2026-11-15'], days: [{ date: '2026-11-11', cost: 1500 }, { date: '2026-11-13', cost: 1400 }, { date: '2026-11-15', cost: 900 }] } };
  assert.equal(H.nearHeadline(cheapFar), `V den odletu nemá Ryanair volný let – 11. 11. od ${kc(1500)}, 13. 11. od ${kc(1400)} · nejlevněji 15. 11. od ${kc(900)}`);
  const two = { ...NB, out: { ...NB.out, lowcostNames: ['Ryanair', 'Wizz Air'] } };
  assert.match(H.nearHeadline(two), /^V den odletu nemají Ryanair ani Wizz Air volný let – /);
  const flies = { out: { ...NB.out, lowcostOnDay: true }, back: NB.back };
  assert.equal(H.nearHeadline(flies), `Levněji vedle: tam 10. 11. od ${kc(1290)}`);
  const same = { out: { ...NB.out, lowcostOnDay: true, days: [{ date: '2026-11-12', cost: 1000 }, { date: '2026-11-13', cost: 980 }] }, back: null };
  assert.equal(H.nearHeadline(same), null, 'o 2 % levnější den vedle nestojí za zmínku');
  assert.equal(H.nearHeadline(null), null);
});

test('kiwiOutage: výpadek Kiwi a které zdroje i tak něco našly', () => {
  assert.equal(H.kiwiOutage([{ id: 'kiwi', outage: null }]), null);
  assert.equal(H.kiwiOutage([{ id: 'ryanair', found: 3 }]), null, 'Kiwi vypnuté');
  const down = H.kiwiOutage([{ id: 'ryanair', found: 2 }, { id: 'wizzair', found: 0 }, { id: 'kiwi', outage: 'down', failed: 3 }]);
  assert.deepEqual(plain(down), { level: 'down', retryAfter: 0, failed: 3, others: ['ryanair'] });
  assert.equal(H.kiwiOutage([{ id: 'kiwi', outage: 'blocked', retryAfter: 41.6 }]).retryAfter, 42);
});

test('activeFilters: filtry ze serveru (se skrytými nabídkami) i z výpisu', () => {
  const chips = H.activeFilters({ maxPrice: 2000, directOnly: true, hidden: { maxPrice: 12, directOnly: 0 } },
    { onlyDeals: true, maxPrice: 3000, outDate: '2026-11-12', excludeOrigins: new Set(['VIE']), carriers: new Set(['ryanair']) }, { ryanair: 'Ryanair' });
  assert.deepEqual(plain(chips.map((c) => [c.key, c.label, c.hidden || 0, Boolean(c.rerun)])), [
    ['maxPrice', `do ${kc(2000)}`, 12, true], ['directOnly', 'jen přímé lety', 0, true], ['onlyDeals', '🔥 jen výhodné', 0, false],
    ['viewPrice', `max. ${kc(3000)}`, 0, false], ['outDate', 'odlet 12. 11.', 0, false], ['origins', 'bez VIE', 0, false], ['carriers', 'jen Ryanair', 0, false],
  ]);
  assert.deepEqual(plain(H.activeFilters(null, { excludeOrigins: new Set(), carriers: new Set() })), []);
});

test('isThin: méně než 3 kombinace (konkrétní cíl) nebo 3 destinace', () => {
  assert.equal(H.isThin({ mode: 'route', top: [1, 2], groups: [1] }), true);
  assert.equal(H.isThin({ mode: 'route', top: [1, 2, 3], groups: [1] }), false);
  assert.equal(H.isThin({ mode: 'explore', top: null, groups: [1, 2] }), true);
  assert.equal(H.isThin(null), false);
});

const PRAHA = { lat: 50.0875, lon: 14.4213 };
const country = (cc) => ({ US: { name: 'USA', cont: 'Severní Amerika' }, ES: { name: 'Španělsko', cont: 'Evropa' }, TH: { name: 'Thajsko', cont: 'Asie' } })[cc] || null;
const flag = (cc) => `[${cc}]`;
const FORM = {
  from: [{ id: 'ap:PRG', label: 'Praha', flag: '[CZ]', type: 'airport' }], to: [{ id: 'ap:JFK', label: 'New York', type: 'airport' }],
  radius: 200, trip: 'return', dateMode: 'exact', xOut: '2026-11-12', xBack: '2026-11-19', xFlex: 0, maxPrice: '', directOnly: false,
  dFrom: '2026-10-12', dTo: '2026-12-11', nMin: 5, nMax: 9, outDays: [], backDays: [],
};
const RES = {
  mode: 'route', home: PRAHA, origins: [{ iata: 'PRG' }, { iata: 'DRS' }], hubs: [], destination: { kind: 'airports' },
  destinationLabels: [{ id: 'ap:JFK', cc: 'US' }], filters: { maxPrice: null, directOnly: false, hidden: { maxPrice: 0, directOnly: 0 } },
};
const keys = (acts) => acts.map((a) => a.key);

test('nearHubs: nejbližší přestupní letiště do 450 km, která hledání ještě neprošlo', () => {
  assert.deepEqual(plain(H.nearHubs(RES).map((h) => h.iata)), ['BER', 'VIE', 'MUC']);
  assert.deepEqual(plain(H.nearHubs({ ...RES, hubs: ['BER', 'MUC', 'VIE'] }).map((h) => h.iata)), ['FRA'], 'dálkové hledání je už prošlo');
  assert.deepEqual(plain(H.nearHubs({ ...RES, home: null, origins: [{ iata: 'PRG', lat: 50.1, lon: 14.26 }] }, 1).map((h) => h.iata)), ['BER']);
  assert.deepEqual(plain(H.nearHubs({ origins: [] })), []);
});

test('smartActions: přesná data do New Yorku → ± dny, přestupní letiště, celá země a světadíl, jen tam, celý měsíc', () => {
  const acts = H.smartActions(FORM, RES, { today: '2026-10-05', country, flag });
  assert.deepEqual(plain(keys(acts)), ['flex1', 'flex3', 'hubs', 'country', 'continent', 'oneway', 'month']);
  const by = Object.fromEntries(acts.map((a) => [a.key, a]));
  assert.deepEqual(plain(by.flex3.patch), { xFlex: 3 });
  assert.equal(by.hubs.label, 'Přidat přestupní letiště (Berlín, Vídeň, Mnichov)');
  assert.deepEqual(plain(by.hubs.patch.from.map((x) => x.id)), ['ap:PRG', 'ap:BER', 'ap:VIE', 'ap:MUC']);
  assert.equal(by.hubs.patch.from[2].flag, '[AT]');
  assert.deepEqual(plain(by.country.patch.to), [{ id: 'cc:US', label: 'USA', flag: '[US]', type: 'country' }]);
  assert.equal(by.continent.patch.to[0].id, 'ct:namerica');
  assert.deepEqual(plain(by.month.patch), { dateMode: 'flex', dFrom: '2026-11-01', dTo: '2026-11-30', outDays: [], backDays: [], len: 'custom', nMin: 5, nMax: 9 });
  assert.equal(by.month.label, 'Celý listopad flexibilně (5–9 nocí)');
});

test('smartActions: filtr, který nabídky skryl, je první; ± dny jen dokud nejsou; Evropa → kamkoliv', () => {
  const f = { ...FORM, to: [{ id: 'ap:BCN', type: 'airport' }], xFlex: 1, maxPrice: '1500', directOnly: true, trip: 'oneway', xBack: null, xOut: '2026-09-20' };
  const r = { ...RES, destinationLabels: [{ cc: 'ES' }], filters: { maxPrice: 1500, directOnly: true, hidden: { maxPrice: 7, directOnly: 0 } } };
  const acts = H.smartActions(f, r, { today: '2026-09-10', country, flag });
  assert.deepEqual(plain(keys(acts)), ['noPrice', 'flex3', 'hubs', 'country', 'noDirect', 'month', 'anywhere']);
  assert.equal(acts[0].label, 'Zrušit limit ceny (skryl 7)');
  assert.deepEqual(plain(acts[0].patch), { maxPrice: '' });
  const month = acts.find((a) => a.key === 'month');
  assert.equal(month.label, 'Celé září flexibilně');
  assert.equal(month.patch.dFrom, '2026-09-10', 'ne do minulosti');
  assert.equal(month.patch.nMin, undefined, 'jen tam: bez nocí');
});

test('smartActions: flexibilní hledání do země → dny v týdnu, delší termín, víc nocí, světadíl', () => {
  const f = { ...FORM, dateMode: 'flex', to: [{ id: 'cc:TH', type: 'country' }], outDays: [4, 5], backDays: [0], dFrom: '2026-10-10', dTo: '2026-10-31', nMin: 7, nMax: 9, radius: 50,
    from: [1, 2, 3, 4, 5].map((i) => ({ id: 'x' + i })) };
  const r = { ...RES, destination: { kind: 'countries' }, destinationLabels: [{ id: 'cc:TH', cc: 'TH' }] };
  const acts = H.smartActions(f, r, { today: '2026-10-05', country, flag });
  assert.deepEqual(plain(keys(acts)), ['anyDay', 'longer', 'nights', 'radius', 'continent', 'oneway']);
  const by = Object.fromEntries(acts.map((a) => [a.key, a]));
  assert.equal(by.longer.label, 'Delší termín (až do 30. 11.)');
  assert.deepEqual(plain(by.nights.patch), { nMin: 5, nMax: 11, len: 'custom' });
  assert.deepEqual(plain(by.radius.patch), { radius: 250 }, '5 míst odletu už je maximum → aspoň větší okruh');
  assert.equal(by.continent.label, 'Celý světadíl: Asie');
});
