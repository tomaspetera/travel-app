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
  // cíl sám, letiště v zemi cíle a hned vedle cíle se jako místo odletu nenabízejí
  const to = (id, cc, lat, lon, airports) => ({ ...RES, destination: { kind: 'airports', airports }, destinationLabels: [{ id, cc, lat, lon }] });
  assert.deepEqual(plain(H.nearHubs(to('ap:BER', 'DE', 52.3667, 13.5033, ['BER'])).map((h) => h.iata)), ['VIE'], 'Berlín: ani Berlín, ani Mnichov');
  assert.deepEqual(plain(H.nearHubs(to('ap:VIE', 'AT', 48.1103, 16.5697, ['VIE'])).map((h) => h.iata)), ['BER', 'MUC', 'FRA']);
  assert.deepEqual(plain(H.nearHubs(to('ap:BTS', 'SK', 48.17, 17.21, ['BTS'])).map((h) => h.iata)), ['BER', 'MUC', 'FRA'], 'Bratislava: Vídeň je hned vedle');
  assert.deepEqual(plain(H.nearHubs({ ...RES, destination: { kind: 'countries', countries: ['DE'] }, destinationLabels: [{ id: 'cc:DE', cc: 'DE' }] }).map((h) => h.iata)), ['VIE']);
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

/* ---------- filtry času a přestupů ---------- */
const TL = (from, to, dep, arr, extra = {}) => ({ from, to, dep, arr, date: dep.slice(0, 10), hasTime: true, stops: 0, durationMin: null, ...extra });
// T1: tam ráno přímý, zpět večer přímý (přílet 21:30)
const T1 = { id: 'T1', out: TL('PRG', 'BCN', '2026-11-12T07:00:00', '2026-11-12T09:15:00', { durationMin: 135 }), back: TL('BCN', 'PRG', '2026-11-16T19:00:00', '2026-11-16T21:30:00', { durationMin: 150 }) };
// T2: tam odpoledne s přestupem 3 h 10 min v MUC (přílet 23:40), zpět ráno přímý
const T2 = { id: 'T2', out: TL('PRG', 'BCN', '2026-11-12T13:00:00', '2026-11-12T23:40:00', { stops: 1, durationMin: 640, layovers: [{ at: 'MUC', min: 190 }] }), back: TL('BCN', 'PRG', '2026-11-16T06:30:00', '2026-11-16T09:00:00', { durationMin: 150 }) };
// T3: tam v noci, 2 přestupy bez časů úseků, přílet ráno dalšího dne; zpět bez známého času
const T3 = { id: 'T3', out: TL('VIE', 'BCN', '2026-11-12T01:10:00', '2026-11-13T07:20:00', { stops: 2, durationMin: 1810 }), back: { from: 'BCN', to: 'VIE', dep: '2026-11-16T00:00:00', date: '2026-11-16', hasTime: false, stops: 0 } };
// T4: jen tam večer, bez délky letu – přílet i délka odhadem (estMin)
const T4 = { id: 'T4', out: TL('BRQ', 'BCN', '2026-11-12T18:30:00', '2026-11-12T21:05:00', { arrEst: true, estMin: 155 }), back: null };
const TT = [T1, T2, T3, T4];
const tf = (x) => ({ ...H.freshTime(), ...x });
const idsOk = (trips, f) => trips.filter((t) => H.timeOk(t, f)).map((t) => t.id);

test('dayPart / legMinutes / maxLayover: část dne odletu, délka i odhadem, nejdelší přestup', () => {
  assert.deepEqual([T1.out, T2.out, T3.out, T4.out, T3.back].map(H.dayPart), ['morning', 'afternoon', 'night', 'evening', null]);
  const at = (hh) => H.dayPart(TL('PRG', 'BCN', `2026-11-12T${hh}:00`));
  assert.deepEqual(['04:59', '05:00', '11:59', '12:00', '17:59', '18:00', '23:59', '00:00'].map(at), ['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night']);
  assert.deepEqual([T1.out, T4.out, T3.back].map(H.legMinutes), [135, 155, null]);
  assert.deepEqual([T1.out, T2.out, T3.out].map(H.maxLayover), [null, 190, null]);
  assert.deepEqual(plain(H.DAYPARTS.map((p) => p[0])), ['morning', 'afternoon', 'evening', 'night']);
});

test('timeFails / timeOk: každý filtr zvlášť; co o letu nevíme, neskrývá', () => {
  assert.deepEqual(idsOk(TT, tf({})), ['T1', 'T2', 'T3', 'T4']);
  assert.deepEqual(idsOk(TT, tf({ out: ['morning', 'night'] })), ['T1', 'T3']);
  assert.deepEqual(idsOk(TT, tf({ back: ['morning'] })), ['T2', 'T3', 'T4'], 'zpět bez času i „jen tam“ projdou');
  assert.deepEqual(idsOk(TT, tf({ arrBy: 22 })), ['T1', 'T3', 'T4'], 'přílet ve 23:40 ne, ráno dalšího dne ano');
  assert.deepEqual(idsOk(TT, tf({ arrBy: 21 })), ['T3'], 'tam i zpět, i odhadnutý přílet');
  const late = { ...T1, id: 'L', out: { ...T1.out, arr: '2026-11-13T00:20:00' } };
  assert.deepEqual(idsOk([T2, late], tf({ arrBy: 24 })), ['T2'], 'půlnoc = ne v noci');
  assert.deepEqual(idsOk(TT, tf({ stops: 0 })), ['T1', 'T4']);
  assert.deepEqual(idsOk(TT, tf({ stops: 1 })), ['T1', 'T2', 'T4']);
  assert.deepEqual(idsOk(TT, tf({ maxDur: 180 })), ['T1', 'T4'], 'každým směrem; délka bez dat neskrývá');
  assert.deepEqual(idsOk(TT, tf({ maxDur: 150 })), ['T1'], 'odhad délky (estMin) se počítá');
  assert.deepEqual(idsOk(TT, tf({ maxLay: 120 })), ['T1', 'T3', 'T4'], 'let bez časů úseků se neskrývá');
  assert.deepEqual(plain(H.timeFails(T2, tf({ out: ['morning'], arrBy: 22, stops: 0, maxLay: 60 }))), ['tOut', 'arrBy', 'stops', 'maxLay']);
  assert.equal(H.timeActive(tf({})), false);
  assert.equal(H.timeActive(tf({ stops: 0 })), true);
  assert.equal(H.timeActive(null), false);
});

test('timeHidden + timeStats: kolik nabídek skrývá který filtr, rozsahy posuvníků z dat', () => {
  assert.deepEqual(plain(H.timeHidden(TT, tf({ out: ['morning'], stops: 0 }))), { by: { tOut: 3, stops: 2 }, any: 3, total: 4 });
  assert.deepEqual(plain(H.timeHidden(TT, tf({}))), { by: {}, any: 0, total: 4 });
  assert.deepEqual(plain(H.timeStats(TT)), { dur: { min: 120, max: 1860, step: 60 }, lay: { min: 180, max: 195, step: 15 }, maxStops: 2 });
  assert.deepEqual(plain(H.timeStats([T1])), { dur: { min: 135, max: 150, step: 15 }, lay: null, maxStops: 0 });
  const same = { out: TL('PRG', 'BCN', '2026-11-12T07:00:00', '2026-11-12T09:00:00', { durationMin: 120 }), back: null };
  assert.equal(H.timeStats([same]).dur, null, 'jediná délka → posuvník nemá smysl');
  assert.deepEqual(plain(H.timeStats([])), { dur: null, lay: null, maxStops: 0 });
});

test('timeChips + activeFilters: čipy s počtem skrytých nabídek, popisky podle směru', () => {
  const f = tf({ out: ['night', 'morning'], back: ['evening'], arrBy: 22, stops: 0, maxDur: 390, maxLay: 120 });
  const chips = H.activeFilters(null, { excludeOrigins: new Set(), carriers: new Set(), time: f }, {}, { hidden: { tOut: 3, maxLay: 1 }, ret: true });
  assert.deepEqual(plain(chips.map((c) => [c.key, c.label, c.hidden])), [
    ['tOut', '🛫 odlet tam ráno, v noci', 3], ['tBack', '🛬 odlet zpět večer', 0], ['arrBy', 'přílet do 22:00', 0], ['stops', 'bez přestupu', 0],
    ['maxDur', '⏱ cesta max. 6 h 30 min', 0], ['maxLay', '⌛ přestup max. 2 h', 1]]);
  assert.ok(chips.every((c) => c.time && !c.rerun));
  const one = H.timeChips(tf({ out: ['afternoon'], back: ['morning'], arrBy: 24, stops: 1 }), { ret: false });
  assert.deepEqual(plain(one.map((c) => c.label)), ['🛫 odlet odpoledne', 'přílet před půlnocí', 'max. 1 přestup'], 'jen tam: bez filtru zpět');
  assert.deepEqual(plain(H.timeChips(tf({}))), []);
});

test('smartActions: filtry času a přestupů, které skryly nabídky, napřed – zruší se hned, bez nového hledání', () => {
  const chips = H.timeChips(tf({ out: ['morning'], stops: 0, arrBy: 22 }), { hidden: { tOut: 5, stops: 9 } });
  const acts = H.smartActions(FORM, RES, { today: '2026-10-05', country, flag, time: { chips, any: 11 } });
  assert.deepEqual(plain(acts.slice(0, 3).map((a) => [a.key, a.label, a.clear])), [
    ['clearTime', 'Zrušit filtry času a přestupů (skryly 11)', 'time'],
    ['clear:stops', 'Zrušit „bez přestupu“ (skryto 9)', 'stops'],
    ['clear:tOut', 'Zrušit „🛫 odlet tam ráno“ (skryto 5)', 'tOut']]);
  assert.ok(acts.slice(0, 3).every((a) => !a.patch));
  assert.equal(acts[3].key, 'flex1', 'pak obvyklé úpravy hledání');
  const single = H.smartActions(FORM, RES, { today: '2026-10-05', country, flag, time: { chips: H.timeChips(tf({ maxLay: 60, arrBy: 20 }), { hidden: { maxLay: 2 } }), any: 2 } });
  assert.deepEqual(plain(keys(single).slice(0, 2)), ['clear:maxLay', 'flex1'], 'filtr, který nic neskryl, se nenabízí');
});

test('fillLegs: filtr návratu neschová lety tam, které mu nevadí – složí se s návratem, který filtry prošel', () => {
  const c = { groundCzk: 0, bagCzk: 0 };
  const o1 = TL('PRG', 'BCN', '2026-11-12T07:00:00', '2026-11-12T09:15:00', { ...c, czk: 1000, carrier: 'FR' });
  const o2 = TL('PRG', 'BCN', '2026-11-12T19:00:00', '2026-11-12T21:15:00', { ...c, czk: 900, carrier: 'VY' });
  const b1 = TL('BCN', 'PRG', '2026-11-16T08:00:00', '2026-11-16T10:15:00', { ...c, czk: 1200, carrier: 'FR' });
  const b2 = TL('BCN', 'PRG', '2026-11-16T20:00:00', '2026-11-16T22:15:00', { ...c, czk: 700, carrier: 'VY' });
  const T = (o, b, extra = {}) => ({ id: `${o.dep}|${b.dep}`, out: o, back: b, destKey: 'BCN', combined: false, distanceKm: 1100,
    perPersonCzk: o.czk + b.czk, ...extra });
  // ze serveru: večerní let tam (o2) jen s večerním návratem (b2)
  const pre = [T(o2, b2), T(o1, b2), T(o1, b1)];
  const f = tf({ back: ['morning'] });
  const vis = pre.filter((t) => H.timeOk(t, f));
  assert.deepEqual(vis.map((t) => t.id), [T(o1, b1).id]);
  const add = H.fillLegs(pre, vis, f, { adults: 2 });
  assert.deepEqual(plain(add.map((t) => [t.out.dep, t.back.dep, t.perPersonCzk, t.totalCzk, t.composed])), [['2026-11-12T19:00:00', '2026-11-16T08:00:00', 2100, 4200, true]]);
  assert.ok(add.every((t) => H.timeOk(t, f)));
  // let tam, který vadí filtru svého směru, ani návrat, který vadí, se nepřidá
  assert.deepEqual(plain(H.fillLegs(pre, pre.filter((t) => H.timeOk(t, tf({ out: ['morning'], back: ['morning'] }))), tf({ out: ['morning'], back: ['morning'] }))), []);
  // ostatní filtry výpisu (keep), společná letenka a bez filtrů času → nic
  assert.deepEqual(plain(H.fillLegs(pre, vis, f, { keep: (t) => t.perPersonCzk <= 2000 })), []);
  assert.deepEqual(plain(H.fillLegs([T(o2, b2, { combined: true }), T(o1, b1)], vis, f)), []);
  assert.deepEqual(plain(H.fillLegs(pre, pre, tf({}))), []);
});

test('fillLegs: „Jen přímé“ Praha → Vídeň – přímé lety tam i zpět jsou, jen každý v kombinaci s přestupem (QA 6, B1)', () => {
  // ze serveru jen nejlevnější dvojice: Ryanair přes Krakov (přestup) jedním nebo oběma směry, přímý Austrian nikdy s Austrianem
  const c = { groundCzk: 0, bagCzk: 0, provider: 'kiwi' };
  const fr = (from, to, dep, arr) => TL(from, to, dep, arr, { ...c, czk: 1900, carrier: 'FR', stops: 1, durationMin: 860, layovers: [{ at: 'KRK', min: 610 }] });
  const os = (from, to, dep, arr, czk) => TL(from, to, dep, arr, { ...c, czk, carrier: 'OS', durationMin: 50 });
  const frOut = fr('PRG', 'VIE', '2026-10-20T09:15:00', '2026-10-20T23:35:00');
  const frBack = fr('VIE', 'PRG', '2026-10-23T06:00:00', '2026-10-23T22:55:00');
  const osOut = [os('PRG', 'VIE', '2026-10-20T07:30:00', '2026-10-20T08:20:00', 7900), os('PRG', 'VIE', '2026-10-20T11:15:00', '2026-10-20T12:05:00', 7545), os('PRG', 'VIE', '2026-10-20T16:50:00', '2026-10-20T17:40:00', 8100)];
  const osBack = [os('VIE', 'PRG', '2026-10-23T09:45:00', '2026-10-23T10:35:00', 4329), os('VIE', 'PRG', '2026-10-23T15:20:00', '2026-10-23T16:10:00', 4600), os('VIE', 'PRG', '2026-10-23T21:00:00', '2026-10-23T21:50:00', 5200)];
  const T = (o, b) => ({ id: `${o.dep}|${b.dep}`, out: o, back: b, destKey: 'VIE', combined: false, distanceKm: 250, perPersonCzk: o.czk + b.czk });
  const pre = [T(frOut, frBack), ...osOut.map((o) => T(o, frBack)), ...osBack.map((b) => T(frOut, b))];
  const legs = (trips) => ['out', 'back'].map((side) => H.distinctLegs(trips, side).map((x) => x.leg.dep.slice(11, 16)).sort());
  for (const [what, f] of [['jen přímé', tf({ stops: 0 })], ['přílet do 22:00', tf({ arrBy: 22 })], ['cesta max. 6 h', tf({ maxDur: 360 })], ['přestup max. 2 h', tf({ maxLay: 120 })]]) {
    const vis = pre.filter((t) => H.timeOk(t, f));
    assert.equal(vis.length, 0, `${what}: žádná kombinace ze serveru neprojde`);
    const add = H.fillLegs(pre, vis, f, { adults: 2 });
    assert.ok(add.every((t) => H.timeOk(t, f) && t.composed && !t.out.stops && !t.back.stops), what);
    assert.equal(new Set(add.map((t) => t.id)).size, add.length, `${what}: každá dvojice jednou`);
    assert.deepEqual(plain(legs(add)), [['07:30', '11:15', '16:50'], ['09:45', '15:20', '21:00']], `${what}: 3 lety tam, 3 zpět`);
    const best = add.reduce((m, t) => (t.perPersonCzk < m.perPersonCzk ? t : m));
    assert.deepEqual(plain([best.out.dep.slice(11, 16), best.back.dep.slice(11, 16), best.perPersonCzk, best.totalCzk]), ['11:15', '09:45', 7545 + 4329, 2 * (7545 + 4329)], `${what}: nejlevnější přímá dvojice`);
    // vybraný let tam → ke každému přímému návratu složená cesta s ním (sloupec Zpět, „Vybraná cesta“)
    const sel = H.distinctLegs(add, 'back', H.legSig(osOut[0]), { adults: 2, keep: (t) => H.timeOk(t, f) });
    assert.ok(sel.every((x) => x.paired && x.paired.out === osOut[0]), `${what}: s vybraným letem tam se spárují všechny přímé návraty`);
  }
});

test('fastPair: nejrychlejší dvojice samostatných letenek tam i zpět – přímý let tam s návratem s přestupem nestačí (QA 6, P2)', () => {
  // ze serveru jen nejlevnější kombinace: přímý Austrian vždy s Ryanairem s přestupem druhým směrem
  const c = { groundCzk: 60, bagCzk: 0, provider: 'kiwi' };
  const fr = (from, to, dep, arr, czk) => TL(from, to, dep, arr, { ...c, czk, carrier: 'FR', stops: 1, durationMin: 860 });
  const os = (from, to, dep, arr, czk) => TL(from, to, dep, arr, { ...c, czk, carrier: 'OS', durationMin: 50 });
  const frOut = fr('PRG', 'VIE', '2026-10-20T07:20:00', '2026-10-20T21:40:00', 1308);
  const frBack = fr('VIE', 'PRG', '2026-10-23T13:45:00', '2026-10-24T08:40:00', 2617);
  const osOut = [os('PRG', 'VIE', '2026-10-20T07:30:00', '2026-10-20T08:20:00', 7643), os('PRG', 'VIE', '2026-10-20T11:15:00', '2026-10-20T12:05:00', 7545)];
  const osBack = [os('VIE', 'PRG', '2026-10-23T09:45:00', '2026-10-23T10:35:00', 4329), os('VIE', 'PRG', '2026-10-23T15:20:00', '2026-10-23T16:10:00', 4366)];
  const T = (o, b) => ({ id: `${o.dep}|${b.dep}`, out: o, back: b, destKey: 'VIE', combined: false, perPersonCzk: o.czk + b.czk + 120 });
  const trips = [T(frOut, frBack), ...osOut.map((o) => T(o, frBack)), ...osBack.map((b) => T(frOut, b))];
  const door = (l) => (l.durationMin ? 30 + 120 + l.durationMin + 45 + 30 : null);
  const f = H.fastPair(trips, door, { adults: 2 });
  assert.deepEqual(plain([f.out.dep.slice(11, 16), f.back.dep.slice(11, 16), f.perPersonCzk, f.composed]), ['11:15', '09:45', 7545 + 4329 + 120, true]);
  // filtry výpisu (keep): návrat ráno ne → nejlevnější přímý návrat odpoledne
  const g = H.fastPair(trips, door, { adults: 2, keep: (t) => t.back.dep.slice(11, 13) >= '12' });
  assert.deepEqual(plain([g.out.dep.slice(11, 16), g.back.dep.slice(11, 16)]), ['11:15', '15:20']);
  // bez známé délky letu se nepočítá; společná zpáteční letenka se nerozkládá
  assert.equal(H.fastPair(trips, () => null), null);
  assert.equal(H.fastPair(trips.map((t) => ({ ...t, combined: true })), door), null);
  assert.equal(H.fastPair([], door), null);
});

test('multiPlan autem s návratem domů: nejlevnější cesta se vrací na letiště, kde auto parkuje (QA 7)', () => {
  // 1. let: z PED (levnější) nebo z PRG; 2. let domů: do PRG (levnější) nebo do PED; všechno navazuje
  const costs = [[2255, 2536], [910, 1997]];
  const links = [[[null, null], [null, null]]];
  const ends = { from: ['PED', 'PRG'], to: ['PRG', 'PED'] };
  // bez podmínky by vyšlo PED → … → PRG (auto by stálo jinde)
  assert.deepEqual(plain(H.multiPlan(costs, links, []).best), { picks: [0, 0], total: 3165 });
  const p = H.multiPlan(costs, links, [], ends);
  assert.deepEqual(plain(p.best), { picks: [1, 0], total: 3446 }, 'PRG → … → PRG');
  // cena celé cesty s každým letem: odlet z PED jen s návratem do PED, návrat do PED jen s odletem z PED
  assert.deepEqual(plain(p.through), [[2255 + 1997, 3446], [3446, 2255 + 1997]]);
  // ručně vybraný návrat jinam, než auto stojí: cesta bez podmínky (UI ji označí štítkem „auto stojí u …“)
  assert.deepEqual(plain(H.multiPlan(costs, links, [0, 0], ends).best), { picks: [0, 0], total: 3165 });
  // vybraný 1. let z PED → nejlevnější návrat do PED
  assert.deepEqual(plain(H.multiPlan(costs, links, [0, null], ends).best), { picks: [0, 1], total: 2255 + 1997 });
  // bez letu, který by se vracel na stejné letiště: aspoň něco (jako server)
  assert.deepEqual(plain(H.multiPlan(costs, links, [], { from: ['PED', 'PED'], to: ['PRG', 'PRG'] }).best), { picks: [0, 0], total: 3165 });
});

test('multiPlan: nejlevnější celá cesta přes víc měst podle výběru, cena s každým letem a nenavazující lety', () => {
  // 3 kroky; links[i][a][b] = null (navazuje) | důvod
  const no = { why: 'short', gapMin: 60, needMin: 180 };
  const costs = [[1000, 1500], [300, 600, 400], [2000, 900]];
  const links = [
    [[no, null, null], [null, null, null]], // 1. let a=0 nestihne 2. let b=0
    [[null, { why: 'early' }], [null, null], [null, null]], // 2. let b=0 nestihne 3. let c=1
  ];
  const p = H.multiPlan(costs, links, []);
  // bez výběru: 1000 + 400 + 900 = 2300 (a=0 s b=0 nejde, b=0 s c=1 nejde)
  assert.deepEqual(plain(p.best), { picks: [0, 2, 1], total: 2300 });
  assert.deepEqual(plain(p.through), [[2300, 2800], [3800, 2500, 2300], [3400, 2300]]);
  // vybraný 2. let b=0 → jen 1. let a=1 a 3. let c=0
  const q = H.multiPlan(costs, links, [null, 0, null]);
  assert.deepEqual(plain(q.best), { picks: [1, 0, 0], total: 3800 });
  assert.deepEqual(plain(q.through[0]), [null, 3800], 'a=0 s vybraným b=0 nejde');
  assert.deepEqual(plain(q.through[1]), [3800, 2500, 2300], 'vlastní výběr kroku se při cenách jeho letů nebere v úvahu');
  assert.deepEqual(plain(q.through[2]), [3800, null]);
  // výběr, který nejde spojit
  assert.equal(H.multiPlan(costs, links, [0, 0, null]).best, null);
  // krok bez letů
  assert.equal(H.multiPlan([[100], []], [[[]]], []).best, null);
  // důvody česky
  assert.match(H.multiWhy(no, 'prev'), /od příletu předchozího letu jen 1 h – potřeba aspoň 3 h/);
  assert.match(H.multiWhy({ why: 'short', gapMin: 95, needMin: 300 }, 'next'), /do odletu vybraného dalšího letu jen 1 h 35 min – potřeba aspoň 5 h/);
  assert.match(H.multiWhy({ why: 'short', gapMin: 40, needMin: 480, move: true }, 'prev'), /jen 40 min – s přejezdem do jiného města potřeba aspoň 8 h/);
  assert.match(H.multiWhy({ why: 'early' }, 'prev'), /dřív, než vybraný předchozí let přistane/);
  assert.match(H.multiWhy({ why: 'nextday' }, 'prev'), /nejdřív další den/);
  assert.equal(H.multiWhy({ why: 'unknown', gapMin: 630, needMin: 1440 }, 'prev'), 'vybraný předchozí let má přestup a neznámý přílet (z cache) – tenhle let nejdřív 24 h po jeho odletu');
  assert.match(H.multiWhy({ why: 'unknown', needMin: 1440 }, 'next'), /^tenhle let má přestup a neznámý přílet \(z cache\) – další let nejdřív 24 h/);
  assert.equal(H.multiWhy(null), '');
});

test('radarQuery: Kdykoliv jako dřív, Víkendy jen odlet Pá/So a návrat Ne/Po (1–3 noci); po kliknutí na kartu stejné podmínky', () => {
  const home = { from: [{ id: 'ap:BRQ', label: 'Brno' }, { id: 'ap:VIE', label: 'Vídeň' }], radius: 150 };
  const all = plain(H.radarQuery('all', home, '2026-10-07'));
  assert.equal(all.mode, 'all');
  // stejné hledání jako radar před přepínačem (i pořadí polí – klíč uloženého výsledku)
  assert.equal(JSON.stringify(all.payload), JSON.stringify({ from: ['ap:BRQ', 'ap:VIE'], radiusKm: 150, to: [], dateFrom: '2026-10-10', dateTo: '2026-11-21', trip: 'return', nightsMin: 2, nightsMax: 7, adults: 1, kmRate: 1, groundMode: 'transit', arrival: true }));
  assert.deepEqual(all.form, { radius: 150, dFrom: '2026-10-10', dTo: '2026-11-21', nMin: 2, nMax: 7, outDays: [], backDays: [], len: 'custom', dateMode: 'flex', trip: 'return', maxPrice: '' });
  assert.equal(all.sub, '· Brno, Vídeň +150 km · zpáteční 2–7 nocí · příštích 6 týdnů');

  const wk = plain(H.radarQuery('weekend', home, '2026-10-07'));
  assert.equal(wk.mode, 'weekend');
  assert.deepEqual(wk.payload, { ...all.payload, nightsMin: 1, nightsMax: 3, outDays: [5, 6], backDays: [0, 1] });
  assert.deepEqual(wk.form, { ...all.form, nMin: 1, nMax: 3, outDays: [5, 6], backDays: [0, 1] });
  assert.equal(wk.sub, '· Brno, Vídeň +150 km · víkendy: odlet Pá/So, návrat Ne/Po · příštích 6 týdnů');
  assert.match(wk.empty, /víkendy/);
  // každý den odletu má v rozsahu nocí návrat v neděli nebo v pondělí a naopak – a jiný návrat rozsah nepřipustí
  const nights = [1, 2, 3];
  for (const d of [5, 6]) assert.ok(nights.some((n) => [0, 1].includes((d + n) % 7)), `odlet ${d}`);
  for (const b of [0, 1]) assert.ok(nights.some((n) => [5, 6].includes((b - n + 7) % 7)), `návrat ${b}`);

  // neznámý režim → Kdykoliv, domov bez okruhu → 200 km
  assert.equal(H.radarQuery('xyz', home, '2026-10-07').mode, 'all');
  assert.equal(H.radarQuery(undefined, { from: [{ id: 'ap:PRG', label: 'Praha' }] }, '2026-10-07').payload.radiusKm, 200);
});

test('radarStale: starší výsledek stejného dotazu (i z jiného dne) bez prošlých odletů; jiný domov, režim nebo okruh ne', () => {
  const home = { from: [{ id: 'ap:BRQ', label: 'Brno' }], radius: 200 };
  const then = H.radarQuery('weekend', home, '2026-10-07'), now = H.radarQuery('weekend', home, '2026-10-10');
  const entry = { key: JSON.stringify(then.payload), at: 1, items: [{ d1: '2026-10-09', label: 'Prošlý' }, { d1: '2026-10-10', label: 'Dnes' }, { d1: '2026-11-06', label: 'Listopad' }] };
  const r = plain(H.radarStale(entry, JSON.stringify(now.payload), '2026-10-10'));
  assert.deepEqual(r.items.map((x) => x.label), ['Dnes', 'Listopad']);
  assert.equal(r.at, 1);
  assert.equal(entry.items.length, 3, 'uložený výsledek se nemění');
  // jiný režim, jiný domov nebo okruh → nic
  assert.equal(H.radarStale(entry, JSON.stringify(H.radarQuery('all', home, '2026-10-10').payload), '2026-10-10'), null);
  assert.equal(H.radarStale(entry, JSON.stringify(H.radarQuery('weekend', { ...home, radius: 150 }, '2026-10-10').payload), '2026-10-10'), null);
  assert.equal(H.radarStale(entry, JSON.stringify(H.radarQuery('weekend', { from: [{ id: 'ap:PRG', label: 'Praha' }] }, '2026-10-10').payload), '2026-10-10'), null);
  // všechno prošlé, chybějící nebo poškozený záznam → nic
  assert.equal(H.radarStale({ ...entry, items: [{ d1: '2026-10-01' }] }, JSON.stringify(now.payload), '2026-10-10'), null);
  assert.equal(H.radarStale(null, JSON.stringify(now.payload), '2026-10-10'), null);
  assert.equal(H.radarStale({ key: '{nejson', items: [] }, JSON.stringify(now.payload), '2026-10-10'), null);
});

test('radarDiff: zlevnění a zdražení cíle od minula, nový cíl; značka vydrží nezměněnou cenu, šum kurzu ne', () => {
  const home = { from: [{ id: 'ap:BRQ', label: 'Brno' }], radius: 200 };
  const key = (d) => JSON.stringify(H.radarQuery('all', home, d).payload);
  const T0 = Date.parse('2026-10-08T09:00:00Z'), T1 = T0 + 6 * 3600e3, T2 = T1 + 1800e3;
  const it = (id, czk) => ({ id, label: id, czk, d1: '2026-11-01' });
  const prev = { key: key('2026-10-08'), at: T0, items: [it('ROM', 2000), it('LON', 1500), it('BCN', 1800)] };
  const now = plain(H.radarDiff(prev, [it('ROM', 1580), it('LON', 1520), it('BCN', 2100), it('OSL', 900)], key('2026-10-08'), T1));
  const by = Object.fromEntries(now.map((x) => [x.id, x]));
  assert.deepEqual(by.ROM.was, { czk: 2000, at: T0 }, 'zlevnilo o 420 Kč');
  assert.equal(by.LON.was, undefined, '+20 Kč (1,3 %) je šum');
  assert.deepEqual(by.BCN.was, { czk: 1800, at: T0 }, 'zdražilo');
  assert.equal(by.OSL.newAt, T1, 'nový cíl');
  assert.equal(by.ROM.newAt, undefined);
  // za půl hodiny stejné ceny → značky zůstanou; další den (jiný rozsah dat) taky
  const again = plain(H.radarDiff({ key: key('2026-10-08'), at: T1, items: now }, [it('ROM', 1580), it('OSL', 900)], key('2026-10-09'), T2));
  assert.deepEqual(again[0].was, { czk: 2000, at: T0 });
  assert.equal(again[1].newAt, T1);
  // po 3 dnech značka zlevnění zmizí, „nové“ po dni
  const late = plain(H.radarDiff({ key: key('2026-10-08'), at: T1, items: now }, [it('ROM', 1580), it('OSL', 900)], key('2026-10-11'), T0 + 4 * 864e5));
  assert.equal(late[0].was, undefined);
  assert.equal(late[1].newAt, undefined);
  // jiný domov nebo žádný minulý výsledek → beze změn
  const other = JSON.stringify(H.radarQuery('all', { from: [{ id: 'ap:PRG', label: 'Praha' }] }, '2026-10-08').payload);
  assert.deepEqual(plain(H.radarDiff(prev, [it('ROM', 1)], other, T1)), [it('ROM', 1)]);
  assert.deepEqual(plain(H.radarDiff(null, [it('ROM', 1)], key('2026-10-08'), T1)), [it('ROM', 1)]);
});

test('lowcostOutage: výpadek Ryanairu nebo Wizz Air (Kiwi a ostatní zdroje se sem nepočítají)', () => {
  assert.deepEqual(plain(H.lowcostOutage([{ id: 'ryanair', outage: null }, { id: 'wizzair' }, { id: 'kiwi', outage: 'down' }])), []);
  assert.deepEqual(plain(H.lowcostOutage([{ id: 'ryanair', outage: 'down' }, { id: 'wizzair', outage: 'blocked', retryAfter: 600 }, { id: 'travelpayouts', outage: 'down' }])),
    [{ id: 'ryanair', name: 'Ryanair', level: 'down', retryAfter: 0 }, { id: 'wizzair', name: 'Wizz Air', level: 'blocked', retryAfter: 600 }]);
  assert.deepEqual(plain(H.lowcostOutage([{ id: 'wizzair', outage: 'partial', failed: 2 }])), [{ id: 'wizzair', name: 'Wizz Air', level: 'partial', retryAfter: 0 }]);
  assert.deepEqual(plain(H.lowcostOutage(undefined)), []);
});

test('nightsRange: české tvary podle horní meze', () => {
  assert.equal(H.nightsRange(1, 3), '1–3 noci');
  assert.equal(H.nightsRange(2, 7), '2–7 nocí');
  assert.equal(H.nightsRange(5, 9), '5–9 nocí');
  assert.equal(H.nightsRange(1, 1), '1 noc');
  assert.equal(H.nightsRange(4, 4), '4 noci');
  assert.equal(H.nightsRange(7, 7), '7 nocí');
});

test('lastPack/lastLoad: poslední výsledky – celé, zkrácené na 3 nabídky na cíl, nebo nic; staré se neobnoví', () => {
  const opt = (i) => ({ id: 't' + i, perPersonCzk: 1000 + i, pad: 'x'.repeat(200) });
  const res = { mode: 'explore', groups: Array.from({ length: 20 }, (_, g) => ({ dest: { key: 'd' + g }, best: opt(0), options: Array.from({ length: 8 }, (_, i) => opt(i)) })), top: [] };
  const c = { at: 1000, form: { from: [{ id: 'ap:BRQ' }] }, payload: {}, res };
  const full = H.lastPack(c, 1e7);
  assert.equal(JSON.parse(full).res.groups[0].options.length, 8);
  const slim = H.lastPack(c, JSON.stringify(c).length - 1);
  assert.ok(slim);
  assert.equal(JSON.parse(slim).res.groups[0].options.length, 3);
  assert.equal(JSON.parse(slim).res.groups.length, 20);
  assert.equal(H.lastPack(c, 100), null);
  const now = 1000 + 3 * 36e5;
  assert.equal(H.lastLoad(full, now).res.groups.length, 20);
  assert.equal(H.lastLoad(full, 1000 + 13 * 36e5), null, 'starší než 12 h');
  assert.equal(H.lastLoad('{', now), null);
  assert.equal(H.lastLoad(null, now), null);
  assert.equal(H.lastLoad(JSON.stringify({ at: 1000, res }), now), null, 'bez formuláře');
});

test('savedWhen: čas hledání a jak dávno', () => {
  const at = new Date(2026, 9, 10, 9, 5).getTime();
  assert.equal(H.savedWhen(at, at + 6e4), '9:05 (před chvílí)');
  assert.equal(H.savedWhen(at, at + 25 * 6e4), '9:05 (před 25 min)');
  assert.equal(H.savedWhen(at, at + 3.5 * 36e5), '9:05 (před 3 h)');
  assert.equal(H.savedWhen(new Date(2026, 9, 9, 21, 40).getTime(), at), 'včera 21:40 (před 11 h)');
});

test('recentAdd/recentForm: nedávná hledání bez opakování, termíny v minulosti pryč, začatý rozsah od dneška', () => {
  const key = (e) => e.form.k;
  let l = H.recentAdd(null, { form: { k: 'a' } }, key);
  l = H.recentAdd(l, { form: { k: 'b' } }, key);
  l = H.recentAdd(l, { form: { k: 'a' } }, key);
  assert.deepEqual(plain(l.map(key)), ['a', 'b']);
  for (const k of 'cdefg') l = H.recentAdd(l, { form: { k } }, key);
  assert.deepEqual(plain(l.map(key)), ['g', 'f', 'e', 'd', 'c']);
  assert.deepEqual(plain(H.recentAdd([null, { x: 1 }], { form: { k: 'a' } }, key).map(key)), ['a'], 'poškozené položky pryč');

  const T = '2026-10-10', from = [{ id: 'ap:BRQ' }];
  assert.equal(H.recentForm({ from: [], dateMode: 'flex', dFrom: T, dTo: '2026-11-01' }, T), null);
  assert.equal(H.recentForm({ from, dateMode: 'flex', dFrom: '2026-09-01', dTo: '2026-10-09' }, T), null);
  assert.equal(H.recentForm({ from, dateMode: 'flex', dFrom: '2026-09-20', dTo: '2026-11-01' }, T).dFrom, T);
  const f = { from, dateMode: 'flex', dFrom: '2026-10-20', dTo: '2026-11-01' };
  assert.equal(H.recentForm(f, T), f);
  assert.equal(H.recentForm({ from, dateMode: 'exact', xOut: '2026-10-09' }, T), null);
  assert.ok(H.recentForm({ from, dateMode: 'exact', xOut: T }, T));
  assert.equal(H.recentForm({ from, trip: 'multi', legs: [{ date: '2026-10-01' }] }, T), null);
  assert.ok(H.recentForm({ from, trip: 'multi', legs: [{ date: '2026-10-12' }] }, T));
});

test('radarEntry: výsledek s výpadkem zdroje bez značek a příští porovnání proti poslednímu úplnému', () => {
  const key = JSON.stringify({ from: ['ap:BRQ'], radiusKm: 200, dateFrom: '2026-10-12', dateTo: '2026-11-21' });
  const it = (id, czk) => ({ id, label: id, czk });
  const full = H.radarEntry(null, [it('a', 1000), it('b', 2000)], key, 1);
  assert.deepEqual(plain(full.items), [it('a', 1000), it('b', 2000)]);
  // výpadek: a zdražilo (Ryanair chyběl), b zmizelo, c nové – nic z toho se neukáže
  const part = H.radarEntry(full, [it('a', 1900), it('c', 2500)], key, 2, { partial: true });
  assert.equal(part.partial, true);
  assert.ok(part.items.every((x) => !x.was && !x.newAt), 'bez značek');
  assert.equal(part.base.at, 1);
  // další výpadek – základ zůstane ten úplný
  const part2 = H.radarEntry(part, [it('a', 1950)], key, 3, { partial: true });
  assert.equal(part2.base.at, 1);
  // zase úplný: porovná se s úplným z času 1 (a beze změny, c nové)
  const back = H.radarEntry(part2, [it('a', 1000), it('c', 2500)], key, 4);
  assert.equal(back.partial, undefined);
  assert.equal(back.items[0].was, undefined, 'a se proti úplnému nezměnilo');
  assert.equal(back.items[1].newAt, 4);
  // jiný domov: základ se nepoužije
  const other = JSON.stringify({ from: ['ap:PRG'], radiusKm: 200, dateFrom: '2026-10-12', dateTo: '2026-11-21' });
  assert.equal(H.radarEntry(full, [it('a', 1)], other, 5, { partial: true }).base, null);
});

test('dataAge: stáří ověřeného údaje – čerstvé nic, od 3 měsíců „před N měsíci“, od půl roku „mohlo se změnit“', () => {
  assert.equal(H.dataAge('2026-10', '2026-12-20').txt, '');
  assert.equal(H.dataAge('2026-10-07', '2027-02-01').txt, ' · před 4 měsíci');
  const old = H.dataAge('2026-10', '2027-06-15');
  assert.deepEqual([old.months, old.old, old.txt], [8, true, ' · před 8 měsíci – mohlo se změnit']);
  assert.equal(H.dataAge('2026-10', '2027-11-01').txt, ' · před rokem – mohlo se změnit');
  assert.equal(H.dataAge('2026-10', '2029-01-01').txt, ' · před 2 lety – mohlo se změnit');
  assert.equal(H.dataAge('', '2027-01-01').txt, '');
  assert.equal(H.dataAge('2027-01', '2026-10-10').months, 0, 'budoucí datum = čerstvé');
  // jízdné z letiště: zdroj i se stářím
  const a = { basis: 'table', src: 'https://www.example.com/x', date: '2026-10-07' };
  assert.match(H.arrivalSource(a, '2026-10-10'), /, ověřeno 7\. 10\. 2026\.$/);
  assert.match(H.arrivalSource(a, '2027-05-10'), /, ověřeno 7\. 10\. 2026 · před 7 měsíci – mohlo se změnit\.$/);
});

test('fastKey: cena + délka cesty – neznámá délka s přestupem se odhadne opatrně (4 h na přestup)', () => {
  const l = (durationMin, stops = 0) => ({ durationMin, stops });
  assert.equal(H.tripMinutes(l(600, 1), 9000), 600);
  assert.equal(H.tripMinutes({ stops: 1 }, 9000), Math.round(9000 / 750 * 60 + 30 + 240));
  assert.equal(H.tripMinutes({ stops: 0 }, 750), 90);
  // dálkový let: levnější o 450 Kč, ale bez známé délky a s přestupem → za dražším se známými 14 h 40 min
  const known = { perPersonCzk: 11871, distanceKm: 8500, out: l(880, 1), back: l(900, 1) };
  const unknown = { perPersonCzk: 11419, distanceKm: 8500, out: { stops: 1 }, back: { stops: 1 } };
  assert.ok(H.fastKey(known) < H.fastKey(unknown));
  // jen tam
  assert.equal(H.fastKey({ perPersonCzk: 1000, distanceKm: 500, out: l(120) }), 1000 + 2 * 250);
});
