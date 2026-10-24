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

test('distinctLegs + composeTrip: dvojice samostatných letenek mimo výsledky se dopočítá (letenky + zavazadla, s dopravou tripCzk), společná letenka ne', () => {
  const c = { groundCzk: 0, bagCzk: 0 };
  const o1 = leg('PRG', 'BCN', '2026-11-12T06:00:00', 'FR', { ...c, czk: 1000, arr: '2026-11-12T08:30:00' });
  const o2 = leg('VIE', 'BCN', '2026-11-12T14:50:00', 'W6', { groundCzk: 400, bagCzk: 0, czk: 900, arr: '2026-11-12T17:20:00' });
  const b1 = leg('BCN', 'PRG', '2026-11-16T07:50:00', 'VY', { ...c, czk: 1200 });
  const b2 = leg('GRO', 'PRG', '2026-11-16T21:50:00', 'FR', { groundCzk: 0, bagCzk: 300, czk: 800 });
  const T = (o, b, extra = {}) => ({ id: `${o.dep}|${b.dep}`, out: o, back: b, destKey: 'BCN', combined: false, distanceKm: 1100, tempHi: 17,
    perPersonCzk: o.czk + o.bagCzk + b.czk + b.bagCzk, ...extra });
  const trips = [T(o1, b1), T(o2, b2)]; // o1+b2 a o2+b1 mezi výsledky nejsou
  const backs = H.distinctLegs(trips, 'back', H.legSig(o1), { adults: 2, openJaw: true });
  const x = backs.find((y) => y.leg === b2);
  assert.equal(x.paired.perPersonCzk, 1000 + 800 + 300, 'cena složené cesty = letenky + zavazadla');
  assert.deepEqual(plain([x.paired.composed, x.paired.totalCzk, x.paired.nights, x.paired.provider, x.paired.groundCzk, x.paired.bagCzk, x.paired.tripCzk]), [true, 4200, 4, 'kiwi', 0, 300, 2100]);
  assert.equal(x.paired.back.from, 'GRO', 'open-jaw v cíli (stejné město podle destKey)');
  const outs = H.distinctLegs(trips, 'out', H.legSig(b1), { openJaw: true });
  const vie = outs.find((y) => y.leg === o2).paired;
  assert.deepEqual([vie.perPersonCzk, vie.tripCzk], [900 + 1200, 900 + 1200 + 400], 'odlet z jiného domácího letiště, doprava na něj v tripCzk');
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
    { onlyDeals: true, maxPrice: 3000, outDate: '2026-11-12', excludeOrigins: new Set(['VIE']), excludeCarriers: new Set(['wizzair']) }, { ryanair: 'Ryanair', wizzair: 'Wizz Air' });
  assert.deepEqual(plain(chips.map((c) => [c.key, c.label, c.hidden || 0, Boolean(c.rerun)])), [
    ['maxPrice', `do ${kc(2000)}`, 12, true], ['directOnly', 'jen přímé lety', 0, true], ['onlyDeals', '🔥 jen výhodné', 0, false],
    ['viewPrice', `max. ${kc(3000)}`, 0, false], ['outDate', 'odlet 12. 11.', 0, false], ['origins', 'bez VIE', 0, false], ['carriers', 'bez Wizz Air', 0, false],
  ]);
  assert.deepEqual(plain(H.activeFilters(null, { excludeOrigins: new Set(), excludeCarriers: new Set() })), []);
});

test('filtr aerolinek vyřazuje (aerolinka, která přibude s konečným výsledkem, je vidět); „jen lety odsud“ i pro nová letiště', () => {
  const names = { ryanair: 'Ryanair', wizzair: 'Wizz Air', kiwi: 'Kiwi.com' };
  const chip = (ex, used) => plain(H.activeFilters(null, { excludeOrigins: new Set(), excludeCarriers: new Set(ex) }, names, {}, { carriers: used }))[0].label;
  // náhled: Ryanair a Wizz Air, vypnutý Wizz Air → konečný přidá Kiwi.com, které zůstane zapnuté
  assert.equal(chip(['wizzair'], ['ryanair', 'wizzair']), 'bez Wizz Air');
  assert.equal(chip(['wizzair'], ['ryanair', 'wizzair', 'kiwi']), 'bez Wizz Air');
  // zbyla jediná ze tří aerolinek výsledku → „jen X“
  assert.equal(chip(['wizzair', 'kiwi'], ['ryanair', 'wizzair', 'kiwi']), 'jen Ryanair');
  assert.equal(chip(['wizzair', 'kiwi'], undefined), 'bez Wizz Air, Kiwi.com');
  // „jen lety z BRQ“ v náhledu (BRQ, VIE) → konečný výsledek přidá přestupní letiště MUC: vyřadí se taky
  assert.deepEqual([...H.onlyOriginSet('BRQ', ['BRQ', 'VIE', 'MUC'], new Set(['VIE']))].sort(), ['MUC', 'VIE']);
  assert.deepEqual([...H.onlyOriginSet('BRQ', ['BRQ'], new Set())], []);
  // letiště „jen odsud“ ve výsledku není → nic se nemění (jinak by filtr schoval vše)
  const ex = new Set(['VIE']);
  assert.equal(H.onlyOriginSet('PRG', ['BRQ', 'VIE'], ex), ex);
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

test('smartActions: Za teplem do cíle, kde tak teplo nebývá → jen širší cíl nebo delší termín', () => {
  const f = { ...FORM, dateMode: 'flex', to: [{ id: 'ap:BCN', type: 'airport' }], dFrom: '2026-10-10', dTo: '2026-11-15', outDays: [5], radius: 50, minTemp: 30, maxPrice: '1500', directOnly: true };
  const r = { ...RES, groups: [], destinationLabels: [{ cc: 'ES' }], warm: { minTemp: 30, destHi: 22 }, filters: { maxPrice: 1500, directOnly: true, hidden: { maxPrice: 0, directOnly: 0 } } };
  assert.deepEqual(plain(keys(H.smartActions(f, r, { today: '2026-10-05', country, flag }))), ['longer', 'country', 'anywhere'], 'letiště, dny, noci, jen tam ani filtry podnebí cíle nezmění');
  // cíl teplý bývá (nebo jsou výsledky): všechny úpravy jako dřív
  const all = ['anyDay', 'longer', 'hubs', 'country', 'oneway', 'noPrice', 'noDirect', 'anywhere'];
  assert.deepEqual(plain(keys(H.smartActions(f, { ...r, warm: { minTemp: 30, destHi: 31 } }, { today: '2026-10-05', country, flag }))), all);
  assert.deepEqual(plain(keys(H.smartActions(f, { ...r, warm: { minTemp: 30, destHi: null } }, { today: '2026-10-05', country, flag }))), all);
  assert.deepEqual(plain(keys(H.smartActions(f, { ...r, groups: [{}] }, { today: '2026-10-05', country, flag }))), all);
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

test('directHint: nejlevnější s přestupem → nejlevnější přímý let tam i zpět a o kolik dráž', () => {
  const c = (t, czk) => ({ ...t, perPersonCzk: czk });
  const t2 = c(T2, 2000), t1 = c(T1, 2600), t4 = c(T4, 3100);
  assert.deepEqual(plain(H.directHint([t2, t1], [t2, t1, t4], tf({}))), { czk: 2600, more: 600, from: 'PRG' });
  assert.equal(H.directHint([c(T1, 1900), t2], [t1, t2], tf({})), null, 'nejlevnější je přímý');
  assert.deepEqual(plain(H.directHint([t1, t2], [t2, t1], tf({}))).more, 600, 'výpis řazený jinak než podle ceny');
  assert.equal(H.directHint([t2], [t2, t1], tf({ stops: 1 })), null, 'filtr přestupů už je nastavený');
  assert.equal(H.directHint([t2], [t2, c(T3, 900)], tf({})), null, 'jinde jen s přestupem');
  assert.equal(H.directHint([t2], [t2, t1, t4], tf({ out: ['night'] })), null, 'přímé lety neprojdou filtrem času');
  assert.equal(H.directHint([], [t1], tf({})), null);
});

test('distinctLegs: týž let pod kódem dceřiné aerolinky (W4 z Kiwi, W6 z wizzair.com) je jeden řádek s levnější variantou', () => {
  const leg = (carrier, czk, provider) => ({ from: 'PRG', to: 'FCO', dep: '2026-11-12T15:05:00', date: '2026-11-12', carrier, stops: 0, czk, provider });
  const t = (l, czk) => ({ out: l, back: null, perPersonCzk: czk });
  const w6 = leg('W6', 1279, 'wizzair'), w4 = leg('W4', 1216, 'kiwi');
  const list = H.distinctLegs([t(w6, 1500), t(w4, 1437)], 'out');
  assert.equal(list.length, 1);
  assert.equal(list[0].leg.carrier, 'W4', 'řádek podle levnější varianty');
  assert.equal(list[0].best.perPersonCzk, 1437);
  assert.equal(H.legSig(w4), H.legSig(w6));
});

test('directNear: přímý let jen o málo dráž než nejlevnější s přestupem → index ve sloupci', () => {
  const x = (stops, czk, paired) => ({ leg: { stops }, best: { perPersonCzk: czk }, paired: paired == null ? null : { perPersonCzk: paired } });
  assert.deepEqual(plain(H.directNear([x(1, 2063), x(0, 2154), x(0, 2542)])), { i: 1, more: 91 });
  assert.equal(H.directNear([x(1, 2000), x(1, 2100), x(0, 2900)]), null, 'přímý o 900 Kč (45 %) dráž – ne');
  assert.deepEqual(plain(H.directNear([x(1, 4000), x(0, 4550)])), { i: 1, more: 550 }, '15 % z vyšší ceny');
  assert.equal(H.directNear([x(0, 2000), x(1, 1900)]), null, 'nejlevnější je přímý');
  assert.equal(H.directNear([x(1, 2000)]), null);
  assert.deepEqual(plain(H.directNear([x(1, 9, 2000), x(0, 9, null), x(0, 9, 2200)], 'sig')), { i: 2, more: 200 }, 's vybraným letem druhým směrem: jen spárované');
});

test('timeChips + activeFilters: čipy s počtem skrytých nabídek, popisky podle směru', () => {
  const f = tf({ out: ['night', 'morning'], back: ['evening'], arrBy: 22, stops: 0, maxDur: 390, maxLay: 120 });
  const chips = H.activeFilters(null, { excludeOrigins: new Set(), excludeCarriers: new Set(), time: f }, {}, { hidden: { tOut: 3, maxLay: 1 }, ret: true });
  assert.deepEqual(plain(chips.map((c) => [c.key, c.label, c.hidden])), [
    ['tOut', '🛫 odlet tam ráno, v noci', 3], ['tBack', '🛬 odlet zpět večer', 0], ['arrBy', 'přílet do 22:00', 0], ['stops', 'bez přestupu', 0],
    ['maxDur', '⏱ cesta max. 6\u00a0h 30\u00a0min', 0], ['maxLay', '⌛ přestup max. 2\u00a0h', 1]]);
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

test('reach: kdy vyrazit z domu a kdy budeš doma (odhad) – noc veřejnou dopravou, letiště ve městě, auto, předchozí večer', () => {
  const VIE = { mode: 'transit', minutes: 175 };
  const at = (from, dep, extra) => ({ out: TL(from, 'BCN', dep, null, extra), back: null });
  const r = H.reach(at('VIE', '2026-11-12T06:30:00'), VIE, null);
  assert.deepEqual(plain([r.out.clock, r.out.min, r.out.early, r.out.warn, r.out.prevDay, r.out.text, r.back]), ['1:35', 95, true, true, false, '⏰ z domu už v 1:35', null]);
  assert.equal(r.out.title, 'Odlet 06:30 − 2\u00a0h na letišti − ~2\u00a0h 55\u00a0min cesta na letiště VIE (vlak / bus a MHD, odhad) = vyrazit z domu ~1:35. Veřejná doprava v noci většinou nejede – ověř první spoj (IDOS), jinak taxi nebo noc u letiště.');
  // letiště ve tvém městě: v noci taxi, ne varování
  const prg = H.reach(at('PRG', '2026-11-12T06:00:00'), { mode: 'transit', local: true, minutes: 40 }, null).out;
  assert.deepEqual(plain([prg.clock, prg.early, prg.warn, prg.local]), ['3:20', true, false, true]);
  assert.match(prg.title, /taxi/);
  // se serverovým nightMin (čas autem): taxi ~25 min místo denní MHD 55 min
  const night = H.reach(at('PRG', '2026-11-12T06:00:00'), { mode: 'transit', local: true, minutes: 55, nightMin: 25 }, null).out;
  assert.deepEqual(plain([night.clock, night.taxi, night.warn, night.text]), ['3:35', true, false, '🚕 z domu ve 3:35']);
  assert.match(night.title, /~25\u00a0min cesta na letiště PRG \(v noci taxi, odhad\).*Denní MHD by trvala ~55\u00a0min\./);
  const day = H.reach(at('PRG', '2026-11-12T10:00:00'), { mode: 'transit', local: true, minutes: 55, nightMin: 25 }, null).out;
  assert.deepEqual([day.clock, day.taxi], ['7:05', undefined], 've dne MHD');
  const car = H.reach(at('BRQ', '2026-11-12T06:00:00'), { mode: 'car', minutes: 130 }, null).out;
  assert.deepEqual(plain([car.clock, car.early, car.warn]), ['1:50', true, false]);
  assert.ok(car.text.startsWith('🚗'), car.text);
  assert.match(car.title, /autem, odhad/);
  // odlet v noci → z domu předchozí večer (to brzy není)
  const eve = H.reach(at('VIE', '2026-11-12T01:30:00'), VIE, null).out;
  assert.deepEqual(plain([eve.clock, eve.min, eve.prevDay, eve.early, eve.warn]), ['20:35', -205, true, false, false]);
  assert.match(eve.title, /~20:35 předchozího dne\.$/);
  // návrat: přílet + 45 min + cesta domů
  const back = H.reach({ out: TL('PRG', 'BCN', '2026-11-12T10:00:00', null), back: TL('BCN', 'VIE', '2026-11-15T20:40:00', '2026-11-15T23:30:00') }, null, VIE).back;
  assert.deepEqual(plain([back.clock, back.late, back.warn, back.text]), ['3:10', true, true, '🏠 domů až ~3:10']);
  assert.match(back.title, /^Přílet 23:30 \+ 45\u00a0min na letišti \+ ~2\u00a0h 55\u00a0min cesta z letiště VIE domů \(vlak \/ bus a MHD, odhad\) = doma ~3:10\. Veřejná doprava v noci/);
  const home = (arr) => H.reach({ out: TL('PRG', 'BCN', '2026-11-12T10:00:00', null), back: TL('BCN', 'VIE', '2026-11-15T18:00:00', arr) }, null, VIE).back;
  assert.deepEqual(plain(['2026-11-15T20:40:00', '2026-11-15T20:50:00', '2026-11-16T01:19:00', '2026-11-16T01:20:00'].map((a) => [home(a).clock, home(a).late])),
    [['0:20', false], ['0:30', true], ['4:59', true], ['5:00', false]], 'doma 0:30–5:00 = pozdě');
  assert.equal(H.reach({ out: TL('PRG', 'BCN', '2026-11-12T10:00:00', null), back: TL('BCN', 'VIE', '2026-11-15T21:00:00', '2026-11-15T23:30:00') }, null, { mode: 'car', minutes: 175 }).back.text, '🚗 domů ~3:10');
  // neznámý čas, přílet nebo doprava → nic
  assert.equal(H.reach(at('VIE', '2026-11-12T06:30:00', { hasTime: false }), VIE, null).out, null);
  assert.equal(H.reach({ out: TL('PRG', 'BCN', '2026-11-12T10:00:00', null), back: TL('BCN', 'VIE', '2026-11-15T21:00:00', null) }, null, VIE).back, null);
  assert.equal(H.reach(at('VIE', '2026-11-12T06:30:00'), { ...VIE, off: true }, null).out, null, 'doprava na letiště vypnutá');
  assert.equal(H.reach(at('VIE', '2026-11-12T06:30:00'), null, null).out, null);
  assert.equal(H.reach(at('VIE', '2026-11-12T06:30:00'), VIE, null, { before: 150 }).out.clock, '1:05', 'mimo Schengen 2,5 h');
  // předložka a čas
  assert.deepEqual([H.ve(160), H.ve(95), H.ve(13 * 60 + 40), H.ve(-205), H.ve(1440 + 300)], ['ve', 'v', 've', 've', 'v']);
  assert.deepEqual([H.clockTxt(95), H.clockTxt(-205), H.clockTxt(1630), H.clockTxt(0)], ['1:35', '20:35', '3:10', '0:00']);
});

test('reach jako filtr „Jen dostupné z domova“: skryje jen noc veřejnou dopravou mimo tvé město; co nevíme, neskrývá', () => {
  const ctx = H.reachCtx([{ iata: 'VIE', ground: { mode: 'transit', minutes: 175 } }, { iata: 'PRG', ground: { mode: 'transit', minutes: 40, local: true } }, { iata: 'BRQ', ground: { mode: 'transit', minutes: 30, off: true } }]);
  assert.deepEqual(plain(ctx), { min: { VIE: 175, PRG: 40 }, local: ['PRG'], cc: {} });
  // let mimo Schengen (i Irsko a Kypr): na letišti 2,5 h místo 2 h – země cíle z výsledků
  const ctx2 = H.reachCtx([{ iata: 'VIE', ground: { mode: 'transit', minutes: 175 } }], [{ dest: { key: 'LON', cc: 'GB' } }, { dest: { key: 'BCN', cc: 'ES' } }]);
  assert.deepEqual(plain(ctx2.cc), { LON: 'GB', BCN: 'ES' });
  assert.deepEqual([H.beforeFor('GB'), H.beforeFor('IE'), H.beforeFor('CY'), H.beforeFor('ES'), H.beforeFor('CH'), H.beforeFor(''), H.beforeFor(null)], [150, 150, 150, 120, 120, 120, 120]);
  assert.equal(H.reachCtx([{ iata: 'VIE', ground: { mode: 'car', minutes: 160 } }, { iata: 'PRG', ground: null }]), null, 'autem se dá jet kdykoliv');
  assert.equal(H.reachCtx(null), null);
  const f = tf({ reach: ctx });
  assert.equal(H.freshTime().reach, null);
  assert.equal(H.timeActive(f), true);
  const trip = (from, dep, extra) => ({ out: TL(from, 'BCN', dep, null, extra), back: null });
  assert.deepEqual(plain(H.timeFails(trip('VIE', '2026-11-12T06:30:00'), f)), ['reach']);
  assert.deepEqual(plain(H.timeFails(trip('VIE', '2026-11-12T09:30:00'), f)), []);
  assert.deepEqual(plain(H.timeFails(trip('PRG', '2026-11-12T06:00:00'), f)), [], 'z letiště ve tvém městě taxi');
  assert.deepEqual(plain(H.timeFails(trip('VIE', '2026-11-12T06:30:00', { hasTime: false }), f)), [], 'neznámý čas');
  assert.deepEqual(plain(H.timeFails(trip('BRQ', '2026-11-12T06:00:00'), f)), [], 'neznámá doprava');
  // návrat domů v noci; jednotlivý let (fillLegs) jen svým směrem
  const late = TL('BCN', 'VIE', '2026-11-15T20:40:00', '2026-11-15T23:30:00');
  assert.deepEqual(plain(H.timeFails({ out: TL('PRG', 'BCN', '2026-11-12T10:00:00', null), back: late }, f)), ['reach']);
  assert.deepEqual(plain(H.timeFails({ back: late }, f)), ['reach']);
  assert.deepEqual(plain(H.timeFails({ back: { ...late, to: 'PRG' } }, f)), []);
  assert.deepEqual(plain(H.timeChips(f).map((c) => [c.key, c.label])), [['reach', '🏠 jen dostupné z domova']]);
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
  assert.deepEqual(plain([f.out.dep.slice(11, 16), f.back.dep.slice(11, 16), f.perPersonCzk, f.tripCzk, f.composed]), ['11:15', '09:45', 7545 + 4329, 7545 + 4329 + 120, true]);
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
  assert.match(H.multiWhy(no, 'prev'), /od příletu předchozího letu jen 1\u00a0h – potřeba aspoň 3\u00a0h/);
  assert.match(H.multiWhy({ why: 'short', gapMin: 95, needMin: 300 }, 'next'), /do odletu vybraného dalšího letu jen 1\u00a0h 35\u00a0min – potřeba aspoň 5\u00a0h/);
  assert.match(H.multiWhy({ why: 'short', gapMin: 40, needMin: 480, move: true }, 'prev'), /jen 40\u00a0min – s přejezdem do jiného města potřeba aspoň 8\u00a0h/);
  assert.match(H.multiWhy({ why: 'early' }, 'prev'), /dřív, než vybraný předchozí let přistane/);
  assert.match(H.multiWhy({ why: 'nextday' }, 'prev'), /nejdřív další den/);
  assert.equal(H.multiWhy({ why: 'unknown', gapMin: 630, needMin: 1440 }, 'prev'), 'vybraný předchozí let má přestup a neznámý přílet (z cache) – tenhle let nejdřív 24\u00a0h po jeho odletu');
  assert.match(H.multiWhy({ why: 'unknown', needMin: 1440 }, 'next'), /^tenhle let má přestup a neznámý přílet \(z cache\) – další let nejdřív 24\u00a0h/);
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
  assert.equal(wk.sub, '· Brno, Vídeň +150 km · víkendy: odlet pá nebo so, návrat ne nebo po · příštích 6 týdnů');
  assert.match(wk.empty, /víkendy/);
  // každý den odletu má v rozsahu nocí návrat v neděli nebo v pondělí a naopak – a jiný návrat rozsah nepřipustí
  const nights = [1, 2, 3];
  for (const d of [5, 6]) assert.ok(nights.some((n) => [0, 1].includes((d + n) % 7)), `odlet ${d}`);
  for (const b of [0, 1]) assert.ok(nights.some((n) => [5, 6].includes((b - n + 7) % 7)), `návrat ${b}`);

  // neznámý režim → Kdykoliv, domov bez okruhu → 200 km
  assert.equal(H.radarQuery('xyz', home, '2026-10-07').mode, 'all');
  // cena za osobu pro počet cestujících z formuláře (proklik z karty hledá pro stejný počet)
  assert.equal(H.radarQuery('all', home, '2026-10-07').payload.adults, 1);
  assert.equal(H.radarQuery('weekend', { ...home, adults: 2 }, '2026-10-07').payload.adults, 2);
  assert.equal(H.radarQuery('all', { ...home, adults: 'x' }, '2026-10-07').payload.adults, 1);
  assert.equal(H.radarQuery('all', { ...home, adults: 50 }, '2026-10-07').payload.adults, 9);
  assert.equal(H.radarQuery(undefined, { from: [{ id: 'ap:PRG', label: 'Praha' }] }, '2026-10-07').payload.radiusKm, 200);
});

test('dowList: dny v týdnu česky jako jinde v aplikaci („pá nebo so“, ne „Pá,So“), od pondělí, bez neplatných', () => {
  assert.equal(H.dowList([5, 6]), 'pá nebo so');
  assert.equal(H.dowList([6, 5]), 'pá nebo so', 'pořadí podle týdne, ne podle klepnutí');
  assert.equal(H.dowList([0, 1]), 'po nebo ne', 'týden od pondělí jako tlačítka dnů ve formuláři');
  assert.equal(H.dowList([4, 5, 6]), 'čt, pá nebo so');
  assert.equal(H.dowList([3]), 'st');
  assert.equal(H.dowList([5, 5, 9, -1, 'x', null]), 'pá');
  assert.equal(H.dowList([]), '');
  assert.equal(H.dowList(undefined), '');
  // shrnutí „Další možnosti“ v Letech skládá „odlet …“ a „návrat …“ z dowList (dřív DOW[d].join(','))
  const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  assert.match(fl, /bits\.push\(\.\.\.SearchHelp\.dowBits\(f\)\)/);
  assert.doesNotMatch(fl, /DOW\[d\]\)\.join\(','\)/);
});

test('dowBits: shrnutí Další možnosti – dny odletu i návratu, jen kde je hledání použije', () => {
  const f = { trip: 'return', dateMode: 'flex', outDays: [6, 4, 5], backDays: [1, 0] };
  // návrat po odletu: týden u dnů návratu od dne za prvním dnem odletu (dřív by dowList dal „po nebo ne“)
  assert.deepEqual(plain(H.dowBits(f)), ['odlet čt, pá nebo so', 'návrat ne nebo po'], 'dřív chyběly dny návratu');
  assert.deepEqual(plain(H.dowBits({ ...f, outDays: [3, 4, 5], backDays: [2, 1, 0] })), ['odlet st, čt nebo pá', 'návrat ne, po nebo út'], 'prodloužený víkend');
  assert.deepEqual(plain(H.dowBits({ ...f, outDays: [5], backDays: [0, 5] })), ['odlet pá', 'návrat ne nebo pá'], 'pá → ne, nebo za týden pá');
  assert.deepEqual(plain(H.dowBits({ ...f, outDays: [6, 0], backDays: [1, 2] })), ['odlet so nebo ne', 'návrat po nebo út']);
  // bez dnů odletu od začátku bloku: ne + po přes konec týdne
  assert.deepEqual(plain(H.dowBits({ ...f, outDays: [] })), ['návrat ne nebo po'], 'jen návrat');
  assert.deepEqual(plain(H.dowBits({ ...f, outDays: [], backDays: [6, 0] })), ['návrat so nebo ne']);
  assert.deepEqual(plain(H.dowBits({ ...f, outDays: [], backDays: [5, 1, 3] })), ['návrat po, st nebo pá']);
  assert.deepEqual(plain(H.dowBits({ ...f, outDays: [], backDays: [2] })), ['návrat út']);
  assert.equal(H.dowList([0, 1], 0), 'ne nebo po', 'from = den, od kterého se týden počítá');
  assert.equal(H.dowList([0, 1]), 'po nebo ne', 'bez from od pondělí jako dřív');
  assert.deepEqual(plain(H.dowBits({ ...f, backDays: [] })), ['odlet čt, pá nebo so']);
  assert.deepEqual(plain(H.dowBits({ ...f, trip: 'oneway' })), ['odlet čt, pá nebo so'], 'jen tam: návrat se nehledá');
  assert.deepEqual(plain(H.dowBits({ ...f, dateMode: 'exact' })), [], 'přesná data dny v týdnu nemají (pole je schované)');
  assert.deepEqual(plain(H.dowBits({ ...f, trip: 'multi' })), [], 'víc měst taky ne');
  assert.deepEqual(plain(H.dowBits({ trip: 'return', dateMode: 'flex', outDays: [], backDays: [] })), []);
  assert.deepEqual(plain(H.dowBits(null)), []);
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
  const opt = (i) => ({ id: 't' + i, perPersonCzk: 1000 + i, tripCzk: 1100 + i, pad: 'x'.repeat(200) });
  const res = { mode: 'explore', groups: Array.from({ length: 20 }, (_, g) => ({ dest: { key: 'd' + g }, best: opt(0), options: Array.from({ length: 8 }, (_, i) => opt(i)) })), top: [] };
  const c = { at: 1000, form: { from: [{ id: 'ap:BRQ' }] }, payload: {}, res };
  const full = H.lastPack(c, 1e7);
  assert.equal(JSON.parse(full).res.groups[0].options.length, 8);
  const slim = H.lastPack(c, JSON.stringify(c).length - 1);
  assert.ok(slim);
  assert.equal(JSON.parse(slim).res.groups[0].options.length, 3);
  assert.equal(JSON.parse(slim).res.groups.length, 20);
  // nevejdou se ani 3 nabídky na cíl (Kamkoliv ze 6 letišť, 150 cílů): aspoň nejlevnější z každého cíle – po zavření
  // aplikace (třeba na cestě bez signálu) výsledky zůstanou
  const one = H.lastPack(c, slim.length - 1);
  assert.ok(one, 'nejlevnější nabídka každého cíle se vejde');
  assert.deepEqual(JSON.parse(one).res.groups.map((g) => g.options.map((o) => o.id).join()), Array(20).fill('t0'));
  assert.equal(H.lastLoad(one, 1000 + 36e5).res.groups.length, 20, 'zkrácené se i obnoví');
  assert.equal(H.lastPack(c, one.length - 1), null);
  assert.equal(H.lastPack(c, 100), null);
  const now = 1000 + 3 * 36e5;
  assert.equal(H.lastLoad(full, now).res.groups.length, 20);
  assert.equal(H.lastLoad(full, 1000 + 13 * 36e5), null, 'starší než 12 h');
  assert.equal(H.lastLoad('{', now), null);
  assert.equal(H.lastLoad(null, now), null);
  assert.equal(H.lastLoad(JSON.stringify({ at: 1000, res }), now), null, 'bez formuláře');
  // ze starší verze (cena i s dopravou na letiště, nabídky bez tripCzk) se neobnoví
  const old = { ...c, res: { ...res, groups: res.groups.map((g) => ({ ...g, options: g.options.map(({ tripCzk, ...o }) => o) })) } };
  assert.equal(H.lastLoad(JSON.stringify(old), now), null);
  // cesta přes víc měst (groups prázdné, kombinace v combos): stejně
  const multi = { ...c, res: { mode: 'multi', groups: [], combos: [{ perPersonCzk: 3000, tripCzk: 3400 }] } };
  assert.ok(H.lastLoad(JSON.stringify(multi), now));
  assert.equal(H.lastLoad(JSON.stringify({ ...multi, res: { ...multi.res, combos: [{ perPersonCzk: 3400 }] } }), now), null);
});

test('savedWhen: čas hledání a jak dávno', () => {
  const at = new Date(2026, 9, 10, 9, 5).getTime();
  assert.equal(H.savedWhen(at, at + 6e4), '9:05 (před chvílí)');
  assert.equal(H.savedWhen(at, at + 25 * 6e4), '9:05 (před 25 min)');
  assert.equal(H.savedWhen(at, at + 3.5 * 36e5), '9:05 (před 3 h)');
  assert.equal(H.savedWhen(new Date(2026, 9, 9, 21, 40).getTime(), at), 'včera 21:40 (před 11 h)');
});

test('resultAge: stáří cen – po hodině staré, po 3 h hodně, čas a „před …“ (dny od předvčerejška), „ze včera“', () => {
  const at = new Date(2026, 9, 10, 9, 12).getTime(), m = (n) => at + n * 6e4;
  const pick = (a) => a && [a.min, a.stale, a.old, a.z, a.when, a.txt];
  assert.deepEqual(pick(H.resultAge(at, m(1))), [1, false, false, 'z', '9:12', '9:12 (před chvílí)']);
  assert.deepEqual(pick(H.resultAge(at, m(59))), [59, false, false, 'z', '9:12', '9:12 (před 59 min)']);
  assert.deepEqual(pick(H.resultAge(at, m(60))), [60, true, false, 'z', '9:12', '9:12 (před 1 h)'], 'hodina = staré (poznámka 🕘)');
  assert.deepEqual(pick(H.resultAge(at, m(179))), [179, true, false, 'z', '9:12', '9:12 (před 2 h)']);
  assert.deepEqual(pick(H.resultAge(at, m(180))), [180, true, true, 'z', '9:12', '9:12 (před 3 h)'], '3 h = hláška u Koupit');
  // přes půlnoc: „ze včera“ s hodinami (i přes den), od předvčerejška datum a dny
  assert.deepEqual(pick(H.resultAge(at, new Date(2026, 9, 11, 0, 20).getTime())), [908, true, true, 'ze', 'včera 9:12', 'včera 9:12 (před 15 h)']);
  assert.equal(H.resultAge(at, new Date(2026, 9, 11, 22, 0).getTime()).txt, 'včera 9:12 (před 36 h)');
  assert.deepEqual(pick(H.resultAge(new Date(2026, 9, 3, 14, 12).getTime(), new Date(2026, 9, 11, 10, 0).getTime())).slice(3), ['z', '3. 10. 14:12', '3. 10. 14:12 (před 8 dny)']);
  assert.equal(H.resultAge(new Date(2026, 9, 9, 23, 50).getTime(), new Date(2026, 9, 11, 0, 10).getTime()).txt, '9. 10. 23:50 (před 2 dny)');
  assert.equal(H.resultAge(new Date(2025, 11, 30, 8, 5).getTime(), new Date(2026, 0, 4, 8, 0).getTime()).txt, '30. 12. 2025 8:05 (před 5 dny)', 'jiný rok s rokem');
  // hodiny jiného zařízení napřed: nic záporného; bez času (starší cesta, poškozená data) → null
  assert.deepEqual(pick(H.resultAge(m(5), at)), [0, false, false, 'z', '9:17', '9:17 (před chvílí)']);
  for (const x of [0, -5, null, undefined, NaN, Infinity, '1760000000000']) assert.equal(H.resultAge(x, at), null, String(x));
  assert.equal(H.savedWhen(at, m(200)), H.resultAge(at, m(200)).txt, 'obnovené výsledky říkají totéž');
  // dny podle kalendáře i přes změnu času (v Praze 28. 3. 2027 – 240 h zpět by krátce po půlnoci bylo o den dřív)
  assert.equal(H.resultAge(new Date(2027, 2, 23, 23, 30).getTime(), new Date(2027, 3, 3, 0, 30).getTime()).txt, '23. 3. 23:30 (před 11 dny)');
  assert.equal(H.resultAge(new Date(2027, 2, 24, 0, 30).getTime(), new Date(2027, 3, 3, 0, 30).getTime()).txt, '24. 3. 0:30 (před 10 dny)');
  // s dneškem posunutým o dny (testy s SHIFT_DAYS) jen podle rozdílu – o 10 dní v kalendáři (ne 240 h: změna času)
  const now = Date.now(), d10 = new Date(now); d10.setDate(d10.getDate() - 10);
  assert.deepEqual(pick(H.resultAge(now - 61 * 6e4, now)).slice(0, 3), [61, true, false]);
  assert.equal(H.resultAge(d10.getTime(), now).txt.endsWith('(před 10 dny)'), true);
});

test('shownAt/ageNote: čas cen na obrazovce – náhled nedokončeného hledání ze svého času, ne z klepnutí; poznámka 🕘', () => {
  const at = new Date(2026, 9, 10, 5, 39).getTime(), pv = new Date(2026, 9, 10, 5, 49).getTime(), now = new Date(2026, 9, 10, 10, 49).getTime();
  assert.equal(H.shownAt({ groups: [] }, at, now), at, 'konečný výsledek: čas hledání (i obnovený)');
  assert.equal(H.shownAt({ groups: [], partial: true, at: pv }, at, now), pv, 'náhled po chybě hledání: jeho čas, ne „teď“');
  assert.equal(H.shownAt({ groups: [], partial: true }, at, now), now, 'náhled bez času (běžící hledání): teď');
  assert.equal(H.shownAt(null, at, now), 0);
  // let vybraný z náhledu po 5 h: „cena z 5:49 (před 5 h)“, ne „(před chvílí)“; Koupit (3 h) i poznámka (1 h) platí
  const a = H.resultAge(H.shownAt({ partial: true, at: pv }, at, now), now);
  assert.deepEqual([a.txt, a.stale, a.old], ['5:49 (před 5 h)', true, true]);
  assert.equal(H.ageNote(a, true), 'Průběžné výsledky z 5:49 (před 5 h) – hledání se nedokončilo a ceny se mezitím mohly změnit.');
  assert.equal(H.ageNote(H.resultAge(at, now), false), 'Výsledky hledání z 5:39 (před 5 h) – ceny se mezitím mohly změnit.');
  assert.equal(H.ageNote(H.resultAge(at, new Date(2026, 9, 11, 9, 0).getTime()), false), 'Výsledky hledání ze včera 5:39 (před 27 h) – ceny se mezitím mohly změnit.');
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

test('recentWhen: zúžený termín na čip Nedávno – celý měsíc, krátký rozsah; výchozí okno a přesná data ne', () => {
  assert.equal(H.recentWhen({ dateMode: 'flex', dFrom: '2026-12-01', dTo: '2026-12-31' }), 'prosinec');
  assert.equal(H.recentWhen({ dateMode: 'flex', dFrom: '2026-10-18', dTo: '2026-10-31' }), '18.–31. 10.');
  assert.equal(H.recentWhen({ dateMode: 'flex', dFrom: '2026-10-25', dTo: '2026-12-17' }), '');
  assert.equal(H.recentWhen({ dateMode: 'exact', xOut: '2026-11-03', dFrom: '2026-11-01', dTo: '2026-11-05' }), '');
  assert.equal(H.recentWhen(null), '');
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

test('🏠 vlastní ceny a radar: klíč bez nich, otisk letišť radaru – cena mimo okruh radar nezahodí, změna u jeho letiště bez falešného „↓“', () => {
  // otisk z výsledku: jen letiště s použitou vlastní cenou, podle abecedy; z nastavení jen pro letiště výsledku
  const res = { origins: [{ iata: 'VIE', ground: { own: true, czk: 350 } }, { iata: 'BRQ', ground: { czk: 30 } }, { iata: 'BTS', ground: { own: true, czk: 0 } }] };
  assert.equal(H.ownPrint(res), 'BTS:0,VIE:350');
  assert.equal(H.ownPrint({ origins: [] }), '');
  assert.equal(H.ownPrint(null), '');
  assert.equal(H.ownPrintFor({ VIE: 350, BTS: 0, MUC: 500 }, ['BRQ', 'VIE', 'BTS']), 'BTS:0,VIE:350');
  assert.equal(H.ownPrintFor(null, ['BRQ']), '');
  const home = { from: [{ id: 'ap:BRQ', label: 'Brno' }], radius: 150 };
  const q = (own) => H.radarQuery('all', { ...home, own }, '2026-10-16').payload;
  assert.deepEqual(plain(q({ MUC: 400 }).accessOverride), { MUC: 400 }, 'do hledání pořád jdou');
  assert.ok(H.radarSame(JSON.stringify(q({ MUC: 400 })), JSON.stringify(q({ MUC: 999 }))), 'radarSame vlastní ceny nerozlišuje');
  assert.ok(!H.radarSame(JSON.stringify(q({})), JSON.stringify(H.radarQuery('all', { ...home, radius: 200 }, '2026-10-16').payload)));
  // uložený výsledek s otiskem a letišti: MUC (mimo okruh) radar nezahodí, BRQ ano; bez ap jen když vlastní ceny nejsou
  const key = JSON.stringify(q({}));
  const it = (id, czk) => ({ id, label: id, czk, d1: '2026-11-01' });
  const e1 = H.radarEntry(null, [it('ROM', 2000), it('LON', 1500)], key, 1, { own: 'BRQ:100', ap: ['BRQ', 'VIE'] });
  assert.deepEqual([e1.own, plain(e1.ap)], ['BRQ:100', ['BRQ', 'VIE']]);
  assert.equal(H.radarOwnOk(e1, { BRQ: 100, MUC: 999 }), true);
  assert.equal(H.radarOwnOk(e1, { BRQ: 0, MUC: 999 }), false);
  assert.equal(H.radarOwnOk(e1, { MUC: 999 }), false, 'smazaná vlastní cena BRQ');
  assert.equal(H.radarOwnOk({ key, items: [] }, null), true, 'starší výsledek bez vlastních cen platí');
  assert.equal(H.radarOwnOk({ key, items: [] }, { BRQ: 0 }), false);
  assert.equal(H.radarOwnOk(null, null), false);
  // nový výsledek s jiným otiskem: ceny se posunuly vlastní cenou na letiště → bez „↓“ i „nové“; se stejným otiskem značky
  const e2 = H.radarEntry(e1, [it('ROM', 1740), it('LON', 1240), it('OSL', 900)], key, 2, { own: 'BRQ:0', ap: ['BRQ', 'VIE'] });
  assert.ok(e2.items.every((x) => !x.was && !x.newAt), 'žádné falešné „↓“');
  const e3 = H.radarEntry(e2, [it('ROM', 1500), it('LON', 1240), it('OSL', 900)], key, 3, { own: 'BRQ:0', ap: ['BRQ', 'VIE'] });
  assert.deepEqual(plain(e3.items[0].was), { czk: 1740, at: 2 });
  // výpadek zdroje: základ si otisk nese dál
  const p = H.radarEntry(e3, [it('ROM', 1900)], key, 4, { partial: true, own: 'BRQ:0', ap: ['BRQ'] });
  assert.equal(p.base.own, 'BRQ:0');
  assert.equal(H.radarEntry(p, [it('ROM', 1200)], key, 5, { own: 'BRQ:0', ap: ['BRQ'] }).items[0].was.czk, 1500);
  // starší volání bez own: porovnání jako dřív
  assert.deepEqual(plain(H.radarDiff(e1, [it('ROM', 1500)], key, 9).map((x) => x.was)), [{ czk: 2000, at: 1 }]);
});

test('prefGroups keep: jediné město hledané země (Malta – server destination.sole) 🙈 neschová, ostatní ano', () => {
  const g = (key) => ({ dest: { key, id: `ap:${key}` } });
  const lists = { fav: [], mute: [{ id: 'ap:MLA', key: 'MLA', label: 'Malta', cc: 'MT' }, { id: 'ap:TIA', key: 'TIA', label: 'Tirana', cc: 'AL' }] };
  const keys = (r) => plain(r.groups.map((x) => x.dest.key));
  const r = H.prefGroups([g('MLA')], lists, { keep: ['MLA'] });
  assert.deepEqual([keys(r), r.muted, r.mutedIn], [['MLA'], 0, 0], 'bez čipu „🙈 skryto“');
  assert.deepEqual(keys(H.prefGroups([g('MLA')], lists)), [], 'bez keep (Kamkoliv) schované');
  const two = H.prefGroups([g('MLA'), g('TIA'), g('LUX')], lists, { keep: ['MLA', 'LUX'] });
  assert.deepEqual([keys(two), two.muted], [['MLA', 'LUX'], 1]);
  assert.deepEqual(keys(H.prefGroups([g('MLA'), g('LUX')], { fav: [], mute: lists.mute }, { keep: ['MLA'], favOnly: true })), [], '⭐ jen moje cíle platí dál');
  assert.deepEqual(keys(H.prefGroups([g('MLA')], lists, { keep: 'MLA' })), [], 'keep jen pole');
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

test('fastKey: cena + délka cesty – neznámá délka s přestupem se odhadne opatrně (6 h na přestup)', () => {
  const l = (durationMin, stops = 0) => ({ durationMin, stops });
  assert.equal(H.tripMinutes(l(600, 1), 9000), 600);
  assert.equal(H.tripMinutes({ stops: 1 }, 9000), Math.round(9000 / 750 * 60 + 30 + 360));
  assert.equal(H.tripMinutes({ stops: 0 }, 750), 90);
  // dálkový let: levnější o 450 Kč, ale bez známé délky a s přestupem → za dražším se známými 14 h 40 min
  const known = { perPersonCzk: 11871, distanceKm: 8500, out: l(880, 1), back: l(900, 1) };
  const unknown = { perPersonCzk: 11419, distanceKm: 8500, out: { stops: 1 }, back: { stops: 1 } };
  assert.ok(H.fastKey(known) < H.fastKey(unknown));
  // živá data Brno → Bangkok (10/2026): Air Arabia bez délky 11 419 Kč vs. Air China 14 h 40 / 15 h 05 za 11 871 Kč
  const ca = { perPersonCzk: 11871, distanceKm: 8451, out: l(880, 1), back: l(905, 1) };
  const g9 = { perPersonCzk: 11419, distanceKm: 8451, out: { stops: 1 }, back: { stops: 1 } };
  assert.ok(H.fastKey(ca) < H.fastKey(g9), `${H.fastKey(ca)} < ${H.fastKey(g9)}`);
  // jen tam
  assert.equal(H.fastKey({ perPersonCzk: 1000, distanceKm: 500, out: l(120) }), 1000 + 2 * 250);
  assert.equal(H.fastKey({ perPersonCzk: 1000, distanceKm: 500, out: l(120) }, 250, 180), 1000 + 5 * 250, 'i 3 h cesty na letiště');
  assert.equal(H.fastKey({ perPersonCzk: 1000, tripCzk: 1400, distanceKm: 500, out: l(120) }, 250, 180), 1400 + 5 * 250, 'i cena dopravy na letiště a do města');
});

test('prodloužené víkendy: Velikonoce, české svátky, most přes út/čt, středa se přeskočí', () => {
  assert.deepEqual(['2026', '2027', '2028', '2029'].map((y) => H.easter(+y)), ['2026-04-05', '2027-03-28', '2028-04-16', '2029-04-01']);
  const h = H.czHolidays(2027);
  assert.equal(h.size, 13);
  assert.deepEqual([h.get('2027-03-26'), h.get('2027-03-29'), h.get('2027-11-17')], ['Velký pátek', 'Velikonoční pondělí', 'Den boje za svobodu']);
  // 28. 10. 2026 je středa (přeskočí se), 17. 11. 2026 úterý → So–Út s volnem v pondělí
  assert.deepEqual(plain(H.longWeekend('2026-10-12')), { start: '2026-11-14', end: '2026-11-17', nights: 3, name: 'Den boje za svobodu', bridge: '2026-11-16' });
  assert.deepEqual(plain(H.longWeekend('2026-11-18')), { start: '2026-12-24', end: '2026-12-27', nights: 3, name: 'Vánoce', bridge: null });
  assert.equal(H.longWeekend('2026-12-28').start, '2027-01-01', 'Nový rok v pátek');
  assert.equal(H.longWeekend('2027-01-05').name, 'Velký pátek');
  assert.equal(H.longWeekend('2027-04-20').start, '2027-07-03', '1. a 8. 5. 2027 jsou v sobotu');
  assert.equal(H.longWeekend('2026-11-15').start, '2026-12-24', 'už začatý víkend se nenabídne');
  assert.equal(H.longWeekend('2026-11-18', 10), null, 'nic v horizontu');
  // radar: odlet večer předem nebo ráno, návrat poslední volný den
  const home = { from: [{ id: 'ap:BRQ', label: 'Brno' }], radius: 200 };
  const q = H.radarQuery('holiday', home, '2026-10-10');
  assert.deepEqual(plain([q.mode, q.payload.dateFrom, q.payload.dateTo, q.payload.nightsMin, q.payload.nightsMax, q.payload.outDays, q.payload.backDays]), ['holiday', '2026-11-13', '2026-11-14', 3, 4, [5, 6], [2]], 'odlet pá/so, návrat jen út');
  assert.match(q.sub, /prodloužený víkend 14\. 11\.–17\. 11\. \(Den boje za svobodu, s volnem 16\. 11\.\)/);
  assert.deepEqual(plain([q.form.dFrom, q.form.dTo, q.form.nMin, q.form.nMax]), ['2026-11-13', '2026-11-14', 3, 4]);
  // těsně před víkendem: odlet nejdřív zítra
  assert.equal(H.radarQuery('holiday', home, '2026-11-12').payload.dateFrom, '2026-11-13');
  assert.equal(H.radarQuery('holiday', home, '2026-11-13').lw.start, '2026-12-24', 'méně než 2 dny předem → další');
});

test('longWeekends: nejbližší tři prodloužené víkendy na výběr; radar podle vybraného, neplatný výběr → nejbližší', () => {
  const l = H.longWeekends('2026-10-12');
  assert.deepEqual(plain(l.map((x) => [x.start, x.end])), [['2026-11-14', '2026-11-17'], ['2026-12-24', '2026-12-27'], ['2027-01-01', '2027-01-03']]);
  const home = { from: [{ id: 'ap:BRQ', label: 'Brno' }], radius: 200 };
  const q = H.radarQuery('holiday', home, '2026-10-10', '2026-12-24');
  assert.deepEqual(plain([q.lw.start, q.payload.dateFrom, q.payload.dateTo, q.lw.all.length]), ['2026-12-24', '2026-12-23', '2026-12-24', 3]);
  assert.equal(H.radarQuery('holiday', home, '2026-10-10', '2020-01-01').lw.start, '2026-11-14');
  assert.equal(H.radarQuery('holiday', home, '2026-10-10', null).lw.start, '2026-11-14');
});

test('radarPick: u svátků jen odlet první volný den nebo večer předem (od 16:00), po ceně; jinak nejlepší nabídka skupiny', () => {
  const t = (date, dep, czk, hasTime = true) => ({ out: { date, dep: `${date}T${dep}:00`, hasTime }, perPersonCzk: czk });
  const lw = { start: '2026-11-14', end: '2026-11-17' };
  const g1 = { dest: { key: 'a' }, best: t('2026-11-13', '08:25', 900), options: [t('2026-11-13', '08:25', 900), t('2026-11-13', '18:10', 1200), t('2026-11-14', '07:00', 1100)] };
  const g2 = { dest: { key: 'b' }, best: t('2026-11-13', '11:50', 500), options: [t('2026-11-13', '11:50', 500)] };
  const g3 = { dest: { key: 'c' }, best: t('2026-11-13', '00:00', 700, false), options: [t('2026-11-13', '00:00', 700, false)] };
  const p = H.radarPick([g1, g2, g3], lw);
  assert.deepEqual(plain(p.map((x) => [x.g.dest.key, x.t.perPersonCzk])), [['c', 700], ['a', 1100]], 'b jen dopoledne v pátek → pryč');
  assert.deepEqual(plain(H.radarPick([g1, g2], null).map((x) => x.t.perPersonCzk)), [900, 500], 'bez svátků beze změny');
});

test('radarRoute: karta radaru ukáže i návrat na jiné letiště a zpět z jiného letiště v cíli (kombinace z Kamkoliv)', () => {
  // návrat nerozdělitelně (pevné mezery) – na úzké kartě se zalomí před ↩
  const sp = (s) => s.replace(/\u00a0/g, ' ');
  assert.equal(H.radarRoute({ from: 'BRQ', to: 'WAW' }), 'BRQ → WAW');
  assert.equal(sp(H.radarRoute({ from: 'JCL', to: 'POZ', bf: 'POZ', bt: 'PED' })), 'JCL → POZ ↩ PED');
  assert.equal(H.radarRoute({ from: 'BRQ', to: 'WAW', bf: 'WMI', bt: 'BRQ' }), 'BRQ → WAW ↩\u00a0WMI\u00a0→\u00a0BRQ');
  assert.equal(sp(H.radarRoute({ from: 'VIE', to: 'STN', bf: 'LTN', bt: 'BTS' })), 'VIE → STN ↩ LTN → BTS');
});

test('placeGuess (plánovač): metropole, velká letiště, jedno jasně větší; jinak nic nehádat', async () => {
  const { localSuggestions } = await import('../server/lib/places.js');
  const g = (name) => { const x = H.placeGuess(localSuggestions(name), name); return x ? `${x.cc} ${x.id}` : null; };
  const want = {
    'Londýn': 'GB metro:LON', Barcelona: 'ES metro:BCN', 'Řím': 'IT metro:ROM', // metropole vyhrává nad London (Kanada) / Barcelona (Venezuela)
    Florencie: 'IT ap:FLR', Sydney: 'AU ap:SYD', Valencie: 'ES ap:VLC', Petrohrad: 'RU ap:LED', Aberdeen: 'GB ap:ABZ', Victoria: 'CA ap:YYJ',
    Lisabon: 'PT ap:LIS', Kos: 'GR ap:KGS', lisabon: 'PT ap:LIS',
    Birmingham: null, // 9,6 × 3 mil. cestujících – nehádat
    // malé letiště nebo letiště bez údajů o cestujících nerozhoduje (Bagan v Myanmaru ≠ Qinhuangdao v Číně)
    Bagan: null, Toledo: null, Waterloo: null, Bathurst: null, 'Punta Gorda': null,
  };
  for (const [name, exp] of Object.entries(want)) assert.equal(g(name), exp, name);
  assert.equal(H.placeGuess([], 'Lisabon'), null);
  assert.equal(H.placeGuess(null, ''), null);
  // město z geokódování v jiné zemi (Toledo ve Španělsku) – letiště v USA ho nepřebije
  const tol = [...localSuggestions('Toledo'), { id: 'geo:1', type: 'city', label: 'Toledo', cc: 'ES' }];
  assert.equal(H.placeGuess(tol, 'Toledo'), null);
});

test('živé ověření cen z mezipaměti: isCached, liveKey, liveVerdict, livePick', () => {
  const leg = (from, to, date, live) => ({ from, to, date, live });
  const cached = { out: leg('PRG', 'BCN', '2026-11-06', false), back: leg('BCN', 'PRG', '2026-11-09', true), flightCzk: 2000 };
  const liveT = { out: leg('VIE', 'BCN', '2026-11-06', true), back: leg('BCN', 'VIE', '2026-11-09', true), flightCzk: 1800 };
  const oneWay = { out: leg('BRQ', 'STN', '2026-11-06', false), back: null, flightCzk: 900 };
  assert.equal(H.isCached(cached), true);
  assert.equal(H.isCached({ ...liveT, back: leg('BCN', 'VIE', '2026-11-09', false) }), true); // jen zpáteční let z cache
  assert.equal(H.isCached(liveT), false);
  assert.equal(H.isCached(oneWay), true);
  assert.equal(H.isCached(null), false);
  assert.equal(H.liveKey(cached, 2), 'PRG|BCN|2026-11-06|BCN>PRG@2026-11-09|2');
  assert.equal(H.liveKey(oneWay, 1), 'BRQ|STN|2026-11-06||1');
  // ±10 % jako průvodce cestou
  assert.deepEqual(plain(H.liveVerdict(2000, [{ flightCzk: 2150 }, { flightCzk: 2600 }])), { st: 'ok', min: 2150 });
  assert.deepEqual(plain(H.liveVerdict(2000, [{ flightCzk: 2300 }])), { st: 'dearer', min: 2300 });
  assert.deepEqual(plain(H.liveVerdict(2000, [{ flightCzk: 1700 }])), { st: 'ok', min: 1700 });
  assert.deepEqual(plain(H.liveVerdict(2000, [{ flightCzk: 0 }, {}])), { st: 'none', min: null });
  assert.deepEqual(plain(H.liveVerdict(2000, [], 'Kiwi: HTTP 500')), { st: 'err', min: null });
  assert.deepEqual(plain(H.liveVerdict(2000, undefined)), { st: 'none', min: null });
  // výběr: první nabídka z prvních 10 cílů, jen z cache, nejvýš 3, už ověřené vynechat
  const g = (t) => ({ vis: [t] });
  const groups = [g(liveT), g(cached), g(oneWay), g({ ...cached, out: leg('PRG', 'LIS', '2026-11-06', false) }), g({ ...cached, out: leg('PRG', 'OPO', '2026-11-06', false) })];
  assert.deepEqual(plain(H.livePick(groups, { adults: 2 }).map((t) => t.out.to)), ['BCN', 'STN', 'LIS']);
  assert.deepEqual(plain(H.livePick(groups, { adults: 2, done: (k) => k.startsWith('PRG|BCN') }).map((t) => t.out.to)), ['STN', 'LIS', 'OPO']);
  assert.deepEqual(plain(H.livePick(groups, { rows: 2 }).map((t) => t.out.to)), ['BCN']);
  assert.equal(H.livePick([...Array(10)].map(() => g(liveT)).concat(groups)).length, 0); // jen prvních 10 cílů
  assert.deepEqual(plain(H.livePick(null)), []);
});

test('🆕 nové země: až od 3 označených zemí, cíle bez země zůstávají, čip se počtem skrytých', () => {
  const vis = ['CZ', 'AT', 'DE'];
  assert.equal(H.isNewCountry('ES', vis), true);
  assert.equal(H.isNewCountry('AT', vis), false);
  assert.equal(H.isNewCountry('ES', ['CZ', 'AT']), false); // pod prahem – s prázdnou mapou by „nové“ bylo všechno
  assert.equal(H.isNewCountry('', vis), false);
  assert.equal(H.isNewCountry(undefined, vis), false);
  assert.equal(H.isNewCountry('ES', new Set(vis)), true);
  assert.equal(H.wasThere('AT', vis), true);
  assert.equal(H.wasThere('AT', ['AT', 'CZ']), false);
  assert.equal(H.wasThere('', vis), false);
  assert.equal(H.wasThere('AT', null), false);
  const g = (cc) => ({ dest: { cc } });
  assert.deepEqual(plain(H.newSplit([g('ES'), g('AT'), g(''), g('FR')], vis)), { keep: 3, hidden: 1 });
  assert.deepEqual(plain(H.newSplit([g('ES'), g('AT'), g(''), g('FR')], ['CZ', 'AT'])), { keep: 4, hidden: 0 });
  assert.deepEqual(plain(H.newSplit(null, vis)), { keep: 0, hidden: 0 });
  const chips = H.activeFilters(null, { newOnly: true, excludeOrigins: new Set(), excludeCarriers: new Set() }, {}, {}, { newHidden: 4 });
  assert.deepEqual(plain(chips), [{ key: 'newOnly', label: '🆕 jen nové země', hidden: 4 }]);
  assert.deepEqual(plain(H.activeFilters(null, { newOnly: false, excludeOrigins: new Set(), excludeCarriers: new Set() })), []);
});

test('originCompare: odkud se vyplatí letět – nejbližší (ne přestupní) letiště jako základ, rozdíl ceny a času cesty', () => {
  const origins = [
    { iata: 'BRQ', city: 'Brno', distKm: 5, ground: { mode: 'transit', minutes: 25 }, best: { czk: 2100, n: 5 } },
    { iata: 'VIE', city: 'Vídeň', distKm: 125, ground: { mode: 'transit', minutes: 105 }, best: { czk: 1650, n: 3 } },
    { iata: 'MUC', city: 'Mnichov', hub: true, distKm: 60, ground: { minutes: 300 }, best: { czk: 1500, n: 1 } },
    { iata: 'KTW', city: 'Katovice', distKm: 190, ground: { minutes: 150 }, best: null },
  ];
  const res = { mode: 'explore', query: { trip: 'return' }, origins };
  const oc = plain(H.originCompare(res));
  assert.equal(oc.ref.iata, 'BRQ', 'přestupní MUC není základ, i když je blíž');
  assert.deepEqual(oc.rows.map((r) => r.iata), ['MUC', 'VIE', 'BRQ', 'KTW']);
  assert.equal(oc.win.iata, 'MUC');
  const vie = oc.rows[1];
  assert.deepEqual([vie.diff, vie.extraMin, vie.n, vie.mode, vie.minutes, vie.ref, vie.city], [-450, 160, 3, 'transit', 105, false, 'Vídeň']);
  assert.equal(H.originDiffTxt(vie), '−450 Kč · +2\u00a0h 40\u00a0min cesty');
  assert.deepEqual([oc.rows[2].ref, oc.rows[2].diff, oc.rows[2].extraMin, H.originDiffTxt(oc.rows[2])], [true, null, null, 'nejbližší letiště']);
  assert.deepEqual([oc.rows[0].hub, oc.rows[0].mode, oc.rows[0].diff, oc.rows[3].czk, oc.rows[3].n], [true, null, -600, null, 0]);
  assert.equal(H.originDiffTxt({ diff: 0, extraMin: -40 }), 'stejně · −40\u00a0min cesty');
  assert.equal(H.originDiffTxt({ diff: 1250, extraMin: 0 }), `+${kc(1250)}`);
  // jedním směrem: cesta na letiště jen tam
  assert.equal(plain(H.originCompare({ ...res, query: { trip: 'oneway' } })).rows[1].extraMin, 80);
  // cesta přes víc měst, cena jen z jednoho letiště, starší výsledek bez best → nic
  const one = origins.map((o) => (o.iata === 'BRQ' ? o : { ...o, best: null }));
  const old = origins.map(({ best, ...o }) => o);
  for (const r of [{ ...res, mode: 'multi' }, { ...res, origins: one }, { ...res, origins: old }, null]) {
    assert.deepEqual(plain(H.originCompare(r)), { rows: [], ref: null, win: null, jaw: null, filtered: false });
  }
  // nejbližší letiště je zároveň nejlevnější (stejná cena → základ napřed)
  const same = plain(H.originCompare({ ...res, origins: [origins[1], { ...origins[0], best: { czk: 1650, n: 2 } }] }));
  assert.deepEqual([same.win.iata, same.win.ref, same.rows[1].diff, same.rows[1].extraMin], ['BRQ', true, 0, 160]);
  // cena dopravy na letiště na osobu: veřejnou dopravou tam i zpět (VIE 2 × 360 proti BRQ 2 × 30 = +660 → letenka
  // o 450 levnější, s dopravou o 210 dráž); autem palivo + parkování na typickou délku cesty (carTrip)
  const priced = origins.map((o) => ({ ...o, ground: { ...o.ground, czk: { BRQ: 30, VIE: 360 }[o.iata] } }));
  const pc = plain(H.originCompare({ ...res, origins: priced }));
  const pv = pc.rows.find((r) => r.iata === 'VIE');
  assert.deepEqual([pv.diff, pv.extraCzk], [-450, 660]);
  assert.equal(H.originDiffTxt(pv), `−450 Kč (s dopravou +${kc(210)}) · +2\u00a0h 40\u00a0min cesty`);
  assert.equal(pc.rows.find((r) => r.iata === 'MUC').extraCzk, null, 'bez ceny dopravy nic');
  assert.equal(plain(H.originCompare({ ...res, query: { trip: 'oneway' }, origins: priced })).rows.find((r) => r.iata === 'VIE').extraCzk, 330, 'jen tam');
  const car = (fuel, park) => ({ mode: 'car', minutes: 60, czk: fuel, fuelCzk: fuel, parkBaseCzk: 0, parkDayCzk: park, adults: 1, tolls: [] });
  const cars = [{ ...origins[0], ground: car(100, 0) }, { ...origins[1], ground: car(400, 100) }];
  const cc = plain(H.originCompare({ ...res, query: { trip: 'return', nightsMin: 2, nightsMax: 4 }, origins: cars }));
  assert.equal(cc.rows.find((r) => r.iata === 'VIE').extraCzk, 2 * 400 + 4 * 100 - 2 * 100, 'palivo tam i zpět + parkování 4 dny');
});

test('originCompare/originFoot: návrat na jiné letiště se k letištím nepočítá, patička: cena letenek, doprava zvlášť', () => {
  const o = (iata, distKm, minutes, best) => ({ iata, city: iata, distKm, ground: { mode: 'transit', minutes }, best });
  const rt = (from, to, perPersonCzk) => ({ out: { from }, back: { to }, perPersonCzk });
  // server: PED 1807 a BRQ 1845 jen tam i zpět přes totéž letiště, BTS jen s návratem jinam (best null)
  const res = {
    mode: 'route', query: { trip: 'return', kmRate: 1, groundMode: 'transit', arrival: true, bags: 'none' },
    origins: [o('BRQ', 0, 40, { czk: 1845, n: 11 }), o('PED', 118, 140, { czk: 1807, n: 16 }), o('BTS', 116, 160, null)],
    top: [rt('PED', 'BRQ', 1617.4), rt('BRQ', 'BRQ', 1845), rt('PED', 'PED', 1807), rt('BTS', 'BRQ', 2114)],
  };
  const oc = plain(H.originCompare(res));
  assert.equal(oc.jaw, 1617, 'nejlevnější s návratem jinam (ve výpisu)');
  assert.deepEqual(oc.rows.map((r) => [r.iata, r.czk, r.jaw, r.extraMin]), [['PED', 1807, 1, 200], ['BRQ', 1845, 2, null], ['BTS', null, 1, 240]]);
  const foot = H.originFoot(res, oc);
  assert.match(foot, /^Cena letenek na osobu \(doprava na letiště a do města je u nabídek zvlášť\) – nejlevnější/);
  assert.match(foot, /jen s odletem i návratem na totéž letiště/);
  assert.doesNotMatch(foot, /parkování|zavazadel/);
  assert.match(foot, /Čas = odhad cesty na letiště tam i zpět; „s dopravou“ = rozdíl i s odhadem její ceny na osobu\./);
  // autem: parkování, kufr; bez nabídek s návratem jinam bez poznámky
  const car = { ...res, query: { ...res.query, groundMode: 'car', bags: 'cabin' }, top: [] };
  assert.equal(H.originCompare(car).jaw, null);
  assert.match(H.originFoot(car), /^Cena letenek na osobu vč\. zavazadel \(doprava na letiště a do města je u nabídek zvlášť\) – nejlevnější ze všech nalezených nabídek, nejen z těch ve výpisu\. /);
  // doprava na letiště vypnutá (kmRate 0): bez času cesty na letiště; jedním směrem bez „tam i zpět“
  const off = { ...res, query: { ...res.query, kmRate: 0 }, top: [] };
  assert.doesNotMatch(H.originFoot(off), /Čas = odhad/);
  const noArr = H.originFoot({ ...res, query: { ...res.query, arrival: false, trip: 'oneway' }, top: [] });
  assert.match(noArr, /Čas = odhad cesty na letiště; /);
});

test('originCompare v Kamkoliv (bez top): návraty jinam z nabídek cílů – kombinace z už stažených letů', () => {
  const o = (iata, distKm, best) => ({ iata, city: iata, distKm, ground: { mode: 'transit', minutes: distKm }, best });
  const rt = (from, to, perPersonCzk) => ({ out: { from }, back: { to }, perPersonCzk });
  // VIE jen s návratem do BTS (Ryanair tam, Wizz Air zpět) – server ho k žádnému letišti nepočítá
  const res = {
    mode: 'explore', query: { trip: 'return', kmRate: 1, arrival: false },
    origins: [o('BRQ', 5, { czk: 1500, n: 2 }), o('BTS', 120, { czk: 1700, n: 1 }), o('VIE', 125, null)],
    top: null,
    groups: [{ options: [rt('VIE', 'BTS', 1200.4), rt('BRQ', 'BRQ', 1500)] }, { options: [rt('BTS', 'BTS', 1700), rt('BRQ', 'BRQ', 1900)] }],
  };
  const oc = plain(H.originCompare(res));
  assert.equal(oc.jaw, 1200);
  assert.deepEqual(oc.rows.map((r) => [r.iata, r.czk, r.jaw]), [['BRQ', 1500, 0], ['BTS', 1700, 1], ['VIE', null, 1]]);
  assert.match(H.originFoot(res, oc), /jen s odletem i návratem na totéž letiště/);
  assert.equal(H.originCompare({ ...res, groups: [{ options: [rt('BRQ', 'BRQ', 1500)] }] }).jaw, null);
});

test('originCompare s filtry výpisu: ceny z nabídek, které výpis ukazuje; „nejbližší s nabídkou“; čip „jen z X“', () => {
  const origins = [
    { iata: 'BRQ', city: 'Brno', distKm: 5, ground: { mode: 'transit', minutes: 25 }, best: { czk: 2100, n: 5 } },
    { iata: 'BTS', city: 'Bratislava', distKm: 130, ground: { mode: 'transit', minutes: 160 }, best: { czk: 1800, n: 2 } },
    { iata: 'VIE', city: 'Vídeň', distKm: 125, ground: { mode: 'transit', minutes: 105 }, best: { czk: 1650, n: 3 } },
  ];
  const res = { mode: 'route', query: { trip: 'return' }, origins, top: [] };
  const t = (from, back, czk) => ({ out: { from }, back: { to: back }, perPersonCzk: czk });
  // filtry nechaly z VIE jen dražší nabídku, z BRQ jen návrat jinam → BRQ bez ceny, základ = nejbližší s nabídkou (VIE)
  const oc = plain(H.originCompare(res, { trips: [t('VIE', 'VIE', 1900), t('VIE', 'VIE', 2400), t('BRQ', 'VIE', 1500), t('BTS', 'BTS', 2000)] }));
  assert.equal(oc.filtered, true);
  assert.deepEqual(oc.rows.map((r) => [r.iata, r.czk, r.n]), [['VIE', 1900, 2], ['BTS', 2000, 1], ['BRQ', null, 0]]);
  assert.equal(oc.ref.iata, 'VIE');
  assert.equal(oc.ref.nearest, false);
  assert.equal(H.originDiffTxt(oc.ref), 'nejbližší s nabídkou');
  assert.equal(oc.jaw, 1500);
  assert.match(H.originFoot(res, oc), /nejlevnější z nabídek, které ukazují filtry výpisu/);
  // bez filtrů: ze serveru, BRQ je nejbližší
  const all = plain(H.originCompare(res));
  assert.equal(all.ref.iata, 'BRQ');
  assert.equal(all.ref.nearest, true);
  assert.equal(H.originDiffTxt(all.ref), 'nejbližší letiště');
  // čip filtru letišť: zbylo jediné → „jen z X“
  const chip = (ex) => plain(H.activeFilters(null, { excludeOrigins: new Set(ex), excludeCarriers: new Set() }, {}, {}, { origins: ['BRQ', 'BTS', 'VIE'] }))[0].label;
  assert.equal(chip(['BRQ', 'BTS']), 'jen z VIE');
  assert.equal(chip(['BRQ']), 'bez BRQ');
});

test('průběžné výsledky: pruh „… ještě hledá (12/30)…“ česky (jeden / víc zdrojů, bez počtu dotazů, dokončuji)', () => {
  const NAMES = { kiwi: 'Kiwi.com', wizzair: 'Wizz Air', ryanair: 'Ryanair' };
  const nameOf = (id) => NAMES[id] || id;
  const p = (id, state, done = 0, calls = 0) => ({ id, state, done, calls });
  assert.equal(H.partialHead([p('ryanair', 'done', 8, 8), p('kiwi', 'running', 12, 30)], nameOf), 'Průběžné výsledky – Kiwi.com ještě hledá (12/30)…');
  assert.equal(H.partialHead([p('ryanair', 'done'), p('wizzair', 'running', 5, 9), p('kiwi', 'running', 12, 30)], nameOf),
    'Průběžné výsledky – Wizz Air (5/9) a Kiwi.com (12/30) ještě hledají…');
  assert.equal(H.partialHead([p('ryanair', 'pending'), p('wizzair', 'running', 5, 9), p('kiwi', 'running')], nameOf),
    'Průběžné výsledky – Ryanair, Wizz Air (5/9) a Kiwi.com ještě hledají…', 'zdroj bez dotazů bez počtu');
  assert.equal(H.partialHead([p('ryanair', 'done'), p('kiwi', 'error')], nameOf), 'Průběžné výsledky – dokončuji…', 'všechno doběhlo, skládá se výsledek');
  assert.equal(H.partialHead(null), 'Průběžné výsledky – dokončuji…');
});

test('průběžné výsledky: výchozí cena ♡ hlídání jen z čerstvého konečného výsledku téhož dotazu', () => {
  const now = 1_800_000_000_000;
  const res = { groups: [] };
  const ok = (r, o = {}) => H.reusable(r, { at: now - 60e3, key: '{"a":1}', want: '{"a":1}', now, ...o });
  assert.equal(ok(res), true);
  assert.equal(ok({ ...res, partial: true }), false, 'průběžný (část zdrojů) → hledat znovu, ne výchozí cena');
  assert.equal(ok(res, { want: '{"a":2}' }), false, 'jiný dotaz');
  assert.equal(ok(res, { at: now - 31 * 60e3 }), false, 'starší než 30 min');
  assert.equal(ok(null), false);
});

test('průběžné výsledky: chyba hledání po náhledu jako věta – tečka za hláškou bez ní, ne „Server neposlal výsledek Výsledky níž…“', () => {
  const tail = ' Výsledky níž jsou jen průběžné – hledání se nedokončilo.';
  assert.equal(H.partialFail('Server neposlal výsledek'), 'Server neposlal výsledek.' + tail);
  assert.equal(H.partialFail('network error'), 'network error.' + tail, 'přerušený stream (Chrome)');
  assert.equal(H.partialFail('Hledání trvalo moc dlouho.'), 'Hledání trvalo moc dlouho.' + tail, 'tečka jen jednou');
  assert.equal(H.partialFail('Zkus to za chvíli!  '), 'Zkus to za chvíli!' + tail);
  assert.equal(H.partialFail(''), 'Hledání selhalo.' + tail);
});

/* ---------- ⭐ Moje cíle a 🙈 Nezajímá mě ---------- */
const dst = (key, label, cc = 'XX', metro = false) => ({ id: `${metro ? 'metro' : 'ap'}:${key}`, key, label, cc });
const OPO = dst('OPO', 'Porto', 'PT'), EIN = dst('EIN', 'Eindhoven', 'NL'), LON = dst('LON', 'Londýn', 'GB', true), CRL = dst('CRL', 'Charleroi', 'BE');

test('destKeyOf + destPref: klíč města z id skupiny (metro i letiště), ⭐ / 🙈 / nic', () => {
  assert.equal(H.destKeyOf('metro:LON'), 'LON');
  assert.equal(H.destKeyOf('ap:OPO'), 'OPO');
  for (const bad of ['cc:PT', 'ct:asia', 'geo:41.1,-8.6|Porto', 'ap:opo', 'ap:OPOX', '', null, undefined]) assert.equal(H.destKeyOf(bad), null, String(bad));
  const lists = { fav: [OPO], mute: [EIN, LON] };
  assert.equal(H.destPref('OPO', lists), 'fav');
  assert.equal(H.destPref('LON', lists), 'mute');
  assert.equal(H.destPref('BCN', lists), null);
  assert.equal(H.destPref('OPO', null), null);
  assert.equal(H.destPref('OPO', { fav: null, mute: undefined }), null, 'poškozený stav nic nerozbije');
  assert.deepEqual([...H.destKeys([OPO, null, { label: 'bez klíče' }, LON])], ['OPO', 'LON']);
});

test('destPrefSet: město jen v jednom seznamu, zpět = z obou pryč, plný seznam (30) nic nezmění, vstup se nemění', () => {
  const l0 = { fav: [OPO], mute: [EIN] };
  const a = H.destPrefSet(l0, { id: 'ap:EIN', label: 'Eindhoven', cc: 'NL' }, 'fav');
  assert.deepEqual(plain(a), { fav: [OPO, EIN], mute: [] }, '🙈 → ⭐ přesune');
  assert.deepEqual(plain(l0), { fav: [OPO], mute: [EIN] }, 'vstup beze změny');
  assert.deepEqual(plain(H.destPrefSet(l0, OPO, 'fav')), plain(l0), 'už tam je – pořadí zůstane');
  assert.deepEqual(plain(H.destPrefSet(l0, OPO, null)), { fav: [], mute: [EIN] });
  assert.deepEqual(plain(H.destPrefSet(l0, { id: 'metro:LON', label: 'Londýn', cc: 'GB', extra: 1 }, 'mute')), { fav: [OPO], mute: [EIN, LON] }, 'jen známá pole');
  assert.deepEqual(plain(H.destPrefSet(null, { id: 'ap:CRL', label: '', cc: 'be' }, 'mute')), { fav: [], mute: [{ id: 'ap:CRL', key: 'CRL', label: 'CRL', cc: '' }] });
  assert.deepEqual(plain(H.destPrefSet(l0, { id: 'cc:PT', label: 'Portugalsko' }, 'fav')), plain(l0), 'země není město');
  const full = { fav: Array.from({ length: 30 }, (_, i) => dst('A' + String(i).padStart(2, '0'), 'X' + i)), mute: [EIN] };
  assert.equal(H.destPrefSet(full, CRL, 'fav'), null, 'plný seznam');
  assert.equal(H.destPrefSet(full, EIN, 'fav'), null, 'ani přesunem – 🙈 zůstane');
  assert.equal(H.destPrefSet(full, OPO, 'mute').mute.length, 2, 'druhý seznam má místo');
  assert.deepEqual(plain(H.destTop([OPO, EIN, LON], 'LON').map((x) => x.key)), ['LON', 'OPO', 'EIN']);
  assert.deepEqual(plain(H.destTop([OPO, EIN], 'BCN').map((x) => x.key)), ['OPO', 'EIN']);
});

test('radarPick: 🙈 cíle (skip) se do n nepočítají – místo nich další nejlevnější, samy zůstanou na svém místě, i u svátků', () => {
  const g = (key, czk) => ({ dest: { key }, best: { out: { date: '2026-11-14', hasTime: false }, perPersonCzk: czk }, options: [] });
  const gs = [g('EIN', 500), g('OPO', 900), g('CRL', 600), g('LON', 1200)];
  const keys = (r) => plain(r.map((x) => x.g.dest.key));
  assert.deepEqual(keys(H.radarPick(gs, null, 2)), ['EIN', 'OPO']);
  assert.deepEqual(keys(H.radarPick(gs, null, 2, new Set(['EIN']))), ['EIN', 'OPO', 'CRL'], '2 mimo 🙈 + 🙈 před nimi');
  assert.deepEqual(keys(H.radarPick(gs, null, 12, new Set(['EIN', 'CRL']))), ['EIN', 'OPO', 'CRL', 'LON']);
  assert.deepEqual(keys(H.radarPick(gs, null, 1, new Set(['CRL']))), ['EIN'], '🙈 za n-tým cílem už ne');
  const lw = { start: '2026-11-14', end: '2026-11-17' };
  assert.deepEqual(keys(H.radarPick(gs, lw, 2, new Set(['EIN']))), ['EIN', 'CRL', 'OPO'], 'u svátků po ceně');
  assert.deepEqual(keys(H.radarPick([null, ...gs], null, 1, null)), ['EIN']);
  assert.equal(H.RADAR_N, 12);
  assert.ok(H.RADAR_KEEP > H.RADAR_N, 'radar si drží rezervu karet');
});

test('radar a 🙈: cíl skrytý už při hledání se po vrácení z 🙈 ukáže na svém místě z uložených karet (bez nového hledání)', () => {
  const g = (key, czk) => ({ dest: { key, id: 'ap:' + key }, best: { out: { date: '2026-11-14', hasTime: false }, perPersonCzk: czk }, options: [] });
  const gs = Array.from({ length: 30 }, (_, i) => g('C' + String(i).padStart(2, '0'), 500 + i * 10));
  const OMR = dst('C01', 'Oradea');
  // uložení jako radarSearch: RADAR_KEEP cílů mimo 🙈 + 🙈 cíl na svém místě
  const items = H.radarPick(gs, null, H.RADAR_KEEP, H.destKeys([OMR])).map(({ g: x }) => ({ id: x.dest.id, czk: x.best.perPersonCzk }));
  assert.equal(items.length, H.RADAR_KEEP + 1);
  const ids = (s) => plain(s.map(({ x }) => x.id));
  assert.ok(!ids(H.radarShown(items, [OMR])).includes('ap:C01'), 'skrytý');
  assert.equal(H.radarShown(items, [OMR]).length, H.RADAR_N);
  const back = H.radarShown(items, []);
  assert.deepEqual(ids(back).slice(0, 3), ['ap:C00', 'ap:C01', 'ap:C02'], 'po vrácení z 🙈 zase druhý');
  assert.equal(back.length, H.RADAR_N);
});

test('radarDiff / radarEntry: „nové“ a „↓“ proti kartám, které radar minule ukazoval (bez 🙈, prvních 12 z uložené rezervy)', () => {
  const key = JSON.stringify({ from: ['ap:BRQ'], radiusKm: 200, dateFrom: '2026-10-18', dateTo: '2026-11-29' });
  const it = (code, czk) => ({ id: 'ap:' + code, label: code, czk, d1: '2026-11-10' });
  const codes = Array.from({ length: 20 }, (_, i) => 'C' + String(i).padStart(2, '0'));
  const T0 = Date.parse('2026-10-15T08:00:00Z'), T1 = T0 + 3600e3;
  // minule: C14 patnáctý (uložený v rezervě, neukázaný), teď třetí za 530 Kč
  const prev = { key, at: T0, items: codes.map((c, i) => it(c, 500 + i * 20)) };
  const now = [it('C00', 500), it('C01', 520), it('C14', 530), ...codes.filter((c) => !['C00', 'C01', 'C14'].includes(c)).map((c, i) => it(c, 560 + i * 20))];
  const by = (r) => Object.fromEntries(plain(r).map((x) => [x.label, x]));
  const a = by(H.radarEntry(prev, now, key, T1).items);
  assert.equal(a.C14.newAt, T1, 'minule ho radar neukázal → nové');
  assert.equal(a.C14.was, undefined, 'žádné „↓“ od ceny, kterou uživatel neviděl');
  assert.equal(a.C01.newAt, undefined);
  assert.equal(a.C12.newAt, T1, 'třináctý minule taky neukázaný');
  // 🙈: C02 minule skrytý (místo něj se ukázal C12) – C12 už známý; C02 bez značky (po vrácení z 🙈 není „nové“)
  const mute = [dst('C02', 'C02')];
  const b = by(H.radarDiff(prev, now, key, T1, mute));
  assert.equal(b.C12.newAt, undefined, 'C12 minule vidět byl');
  assert.equal(b.C02.newAt, undefined);
  assert.equal(b.C02.was, undefined);
  assert.equal(b.C14.newAt, T1);
  assert.equal(b.C13.newAt, T1);
  // starší uložený radar s 12 kartami a bez seznamů: jako dřív
  const old = by(H.radarDiff({ ...prev, items: prev.items.slice(0, 12) }, now, key, T1));
  assert.equal(old.C14.newAt, T1);
  assert.equal(old.C00.newAt, undefined);
});

test('radarShown: karty bez 🙈 (i těch, které přibyly do seznamu až po hledání), nejvýš 12, s pořadím v uloženém výsledku', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ id: i === 3 ? 'metro:LON' : `ap:A${String(i).padStart(2, '0')}`, czk: 500 + i }));
  const all = H.radarShown(items, []);
  assert.equal(all.length, 12);
  assert.deepEqual(plain(all.map((s) => s.i)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const muted = H.radarShown(items, [LON, dst('A00', 'x')]);
  assert.equal(muted.length, 12, 'další uložené karty se posunou');
  assert.deepEqual(plain(muted.map((s) => s.i)), [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(muted[2].x, items[4]);
  assert.equal(H.radarShown(items.slice(0, 12), [LON]).length, 11, 'starší uložený radar (12 karet) do obnovení o kartu méně');
  assert.deepEqual(plain(H.radarShown([{ id: 'ap:EIN' }], [EIN])), []);
  assert.deepEqual(plain(H.radarShown(null, null)), []);
});

test('prefGroups (computeGroups v Kamkoliv): 🙈 schované s počítadlem, ukázat je jde, „⭐ jen moje cíle“ počítá schované', () => {
  const g = (d) => ({ dest: { key: d.key, id: d.id } });
  const gs = [g(EIN), g(OPO), g(LON), g(CRL), g(dst('BCN', 'Barcelona', 'ES', true))];
  const lists = { fav: [OPO], mute: [EIN, CRL, dst('TBS', 'Tbilisi')] };
  const keys = (r) => plain(r.groups.map((x) => x.dest.key));
  const base = H.prefGroups(gs, lists);
  assert.deepEqual(keys(base), ['OPO', 'LON', 'BCN'], 'pořadí beze změny');
  assert.deepEqual(plain({ ...base, groups: undefined }), { muted: 2, mutedIn: 2, favIn: 1, notFav: 0 }, 'TBS ve výsledku není');
  const shown = H.prefGroups(gs, lists, { showMuted: true });
  assert.deepEqual(keys(shown), ['EIN', 'OPO', 'LON', 'CRL', 'BCN']);
  assert.deepEqual([shown.muted, shown.mutedIn], [0, 2], 'ukázané: čip ví, kolik jich je');
  const fav = H.prefGroups(gs, lists, { favOnly: true });
  assert.deepEqual(keys(fav), ['OPO']);
  assert.deepEqual([fav.muted, fav.notFav], [2, 2], '🙈 počítá 🙈, ostatní ⭐ filtr');
  assert.deepEqual(keys(H.prefGroups(gs, { fav: [], mute: [] })), ['EIN', 'OPO', 'LON', 'CRL', 'BCN']);
  assert.deepEqual(keys(H.prefGroups(gs, null)), ['EIN', 'OPO', 'LON', 'CRL', 'BCN'], 'bez seznamů nic neschová');
  // čip aktivního filtru „⭐ jen moje cíle“ se schovanými cíli
  const chip = plain(H.activeFilters(null, { favOnly: true, excludeOrigins: new Set(), excludeCarriers: new Set() }, {}, {}, { favHidden: fav.notFav }));
  assert.deepEqual(chip, [{ key: 'favOnly', label: '⭐ jen moje cíle', hidden: 2 }]);
});

test('🔎 Co tam je: střed města pro místa k vidění – metropole, město z cesty z letiště, jinak dohledat', () => {
  const ar = (city, lat, lon, basis = 'table') => ({ iata: 'X', city, lat, lon, basis });
  assert.deepEqual(plain(H.destCenter({ id: 'metro:PAR', label: 'Paříž', lat: 48.8566, lon: 2.3522 }, ar('Paříž', 48.8566, 2.3522))), { lat: 48.8566, lon: 2.3522, label: 'Paříž' });
  // cena nabídky počítá cestu do Mnichova (FMM) / do Palmy (PMI) – místa tam, ne kolem letiště
  assert.deepEqual(plain(H.destCenter({ id: 'ap:FMM', label: 'Memmingen (Mnichov)', lat: 47.9881, lon: 10.2382 }, ar('Mnichov', 48.1374, 11.5755))), { lat: 48.1374, lon: 11.5755, label: 'Mnichov' });
  assert.deepEqual(plain(H.destCenter({ id: 'ap:PMI', label: 'Mallorca', lat: 39.55, lon: 2.73 }, ar('Palma', 39.5696, 2.6502, 'access'))), { lat: 39.5696, lon: 2.6502, label: 'Palma' });
  // odhad cesty zná jen polohu letiště; bez cesty, bez polohy
  assert.equal(H.destCenter({ id: 'ap:TPS', label: 'Trapani', lat: 37.9114, lon: 12.488 }, { ...ar('Trapani', 37.9114, 12.488), basis: 'estimate' }), null);
  assert.equal(H.destCenter({ id: 'ap:TPS', label: 'Trapani', lat: 37.9114, lon: 12.488 }, null), null);
  assert.equal(H.destCenter({ id: 'metro:XXX', label: 'X', lat: null, lon: null }, null), null);
  assert.equal(H.destCenter({ id: 'ap:KUT', lat: 42.17, lon: 42.48 }, ar('', 42.27, 42.7)), null, 'bez názvu města ne');
  // názvy k dohledání: napřed hlavní, pak část před pomlčkou / lomítkem, pak závorka
  assert.deepEqual(plain(['Trapani', 'Kréta (Heraklion)', 'Pécs-Pogány', 'Karlsruhe/Baden-Baden', 'Clermont-Ferrand', 'Tenerife (jih)', '', null].map((x) => H.geoNames(x))), [
    ['Trapani'], ['Kréta', 'Heraklion'], ['Pécs-Pogány', 'Pécs'], ['Karlsruhe/Baden-Baden', 'Karlsruhe'], ['Clermont-Ferrand', 'Clermont'], ['Tenerife', 'jih'], [], []]);
  // geokódování: obydlené místo ve stejné zemi do 60 km od letiště (ostrov, kraj ani stejnojmenné město jinde ne)
  const TPS = { lat: 37.9114, lon: 12.488 };
  const items = [{ label: 'Trapani', cc: 'US', lat: 37.9, lon: -90, fc: 'PPL' }, { label: 'Sicílie', cc: 'IT', lat: 37.6, lon: 14.0, fc: 'ADM1' },
    { label: 'Trapani', cc: 'IT', lat: 38.0176, lon: 12.5365, fc: 'PPLA2' }];
  assert.deepEqual(plain(H.geoCenter(items, 'IT', TPS)), { lat: 38.0176, lon: 12.5365, label: 'Trapani' });
  assert.equal(H.geoCenter([{ label: 'Kréta', cc: 'GR', lat: 35.2, lon: 24.9, fc: 'ISL' }], 'GR', { lat: 35.34, lon: 25.18 }), null);
  assert.equal(H.geoCenter([{ label: 'Trapani', cc: 'IT', lat: 38.6, lon: 12.5 }], 'IT', TPS), null, '77 km – jiné místo');
  assert.deepEqual(plain(H.geoCenter([{ label: 'Řešov', cc: 'PL', lat: 50.04, lon: 22.0 }], 'PL', { lat: 50.11, lon: 22.02 })), { lat: 50.04, lon: 22.0, label: 'Řešov' }, 'místní data bez druhu místa');
  assert.equal(H.geoCenter(items, 'IT', null), null);
  assert.equal(H.geoCenter(undefined, 'IT', TPS), null);
});

test('🔎 Co tam je: pobyt pro Objevuj – dní od příletu do návratu, víkend jen přes sobotu s nedělí nebo od pátku / soboty', () => {
  // 23. 10. 2026 je pátek
  assert.deepEqual(plain(H.stayPlan('2026-10-23', '2026-10-25')), { days: 3, weekend: true });
  assert.deepEqual(plain(H.stayPlan('2026-10-24', '2026-10-24')), { days: 1, weekend: true });
  assert.deepEqual(plain(H.stayPlan('2026-10-22', '2026-10-26')), { days: 5, weekend: false }, 'čt–po: delší pobyt');
  assert.deepEqual(plain(H.stayPlan('2026-10-20', '2026-10-22')), { days: 3, weekend: false }, 'út–čt není víkend');
  assert.deepEqual(plain(H.stayPlan('2026-10-25', '2026-10-27')), { days: 3, weekend: false }, 'ne–út není víkend');
  assert.deepEqual(plain(H.stayPlan('2026-10-24', '2026-10-26')), { days: 3, weekend: true }, 'so–po');
  // přes sobotu nestačí: s nedělí nebo od pátku / soboty
  assert.deepEqual(plain(H.stayPlan('2026-10-21', '2026-10-24')), { days: 4, weekend: false }, 'st–so není víkend');
  assert.deepEqual(plain(H.stayPlan('2026-10-22', '2026-10-24')), { days: 3, weekend: false }, 'čt–so není víkend');
  assert.deepEqual(plain(H.stayPlan('2026-10-23', '2026-10-24')), { days: 2, weekend: true }, 'pá–so');
  assert.deepEqual(plain(H.stayPlan('2026-10-22', '2026-10-25')), { days: 4, weekend: true }, 'čt–ne');
  assert.deepEqual(plain(H.stayPlan('2026-10-23', '2026-10-26')), { days: 4, weekend: true }, 'pá–po');
  assert.deepEqual(plain(H.stayPlan('2026-10-23', null)), { days: 0, weekend: false }, 'jen tam');
  assert.deepEqual(plain(H.stayPlan('', '2026-10-25')), { days: 0, weekend: false });
  // noční let: přílet až po dni návratu by dal 0 dní – aspoň den
  assert.equal(H.stayPlan('2026-10-26', '2026-10-25').days, 1);
});

test('odkud = celá země (bez domova): srovnání letišť proti nejlevnějšímu, patička bez odhadu cesty na letiště', () => {
  const o = (iata, czk) => ({ iata, city: iata, distKm: 0, best: { czk, n: 3 } });
  const res = { mode: 'explore', query: { trip: 'return', kmRate: 1, arrival: true }, origins: [o('PRG', 765), o('BRQ', 710), o('OSR', 900)] };
  const oc = H.originCompare(res);
  assert.equal(oc.ref.iata, 'BRQ', 'základ = nejlevnější, ne první v seznamu');
  assert.equal(oc.ref.nearest, false, 'žádné „nejbližší“');
  const foot = H.originFoot(res, oc);
  assert.doesNotMatch(foot, /vč\. dopravy na letiště|Čas = odhad/);
  // s domovem i čas cesty na letiště (odhad)
  const home = { ...res, origins: res.origins.map((x, i) => ({ ...x, distKm: 20 + i * 100, ground: { czk: 100, minutes: 30 } })) };
  assert.match(H.originFoot(home), /Čas = odhad cesty na letiště tam i zpět/);
});

test('lastPack: zkrácené nabídky cíle si nechají nejlevnější z každého letiště odletu (filtr „jen lety z X“ po obnovení)', () => {
  const t = (from, czk, i) => ({ id: `${from}${i}`, out: { from, to: 'BCN', date: '2026-11-12' }, back: { from: 'BCN', to: from, date: '2026-11-15' }, perPersonCzk: czk, pad: 'x'.repeat(4000) });
  const options = [t('PRG', 900, 1), t('PRG', 950, 2), t('PRG', 990, 3), t('PRG', 999, 4), t('VIE', 1200, 5), t('BTS', 1300, 6)];
  const c = { at: 1, res: { mode: 'explore', groups: Array.from({ length: 80 }, (_, i) => ({ dest: { key: `D${i}` }, options })) } };
  const packed = JSON.parse(H.lastPack(c, 1.8e6, 3)); // celé (~2 MB) se nevejde
  assert.deepEqual(packed.res.groups[0].options.map(x => x.out.from), ['PRG', 'PRG', 'PRG', 'VIE', 'BTS']);
});

test('👀 prohlížené cíle: nejnovější první, každý jednou, bez ⭐/🙈 a starších 21 dní', () => {
  const d = 864e5, now = 100 * d, J = x => JSON.parse(JSON.stringify(x));
  let l = H.viewedAdd([], { id: 'metro:LIS', label: 'Lisabon', at: now - 30 * d });
  l = H.viewedAdd(l, { id: 'ap:OPO', label: 'Porto', czk: 1890, at: now - 2 * d });
  l = H.viewedAdd(l, { id: 'ap:KLU', label: 'Klagenfurt', at: now - d });
  l = H.viewedAdd(l, { id: 'ap:OPO', label: 'Porto', czk: 1700, at: now });
  l = H.viewedAdd(l, { id: 'geo:1,2|Vesnice', label: 'Vesnice', at: now }); // bez klíče letiště se nepamatuje
  assert.deepEqual(J(l.map(x => x.label)), ['Porto', 'Klagenfurt', 'Lisabon']);
  assert.equal(l[0].czk, 1700);
  assert.deepEqual(J(H.viewedPick(l, now).map(x => x.label)), ['Porto', 'Klagenfurt']);
  assert.deepEqual(J(H.viewedPick(l, now, new Set(['KLU'])).map(x => x.label)), ['Porto']);
  assert.equal(H.viewedAdd(Array.from({ length: 9 }, (_, i) => ({ id: `ap:A${String(i).padStart(2, '0')}` })), { id: 'ap:ZZZ' }).length, 6);
  assert.equal(H.viewedPick(null, now).length, 0);
});

test('weekendHabit: aspoň 3 z posledních 5 hledání na víkend / prodloužený víkend / svátek', () => {
  const r = (...lens) => lens.map(len => ({ form: { trip: 'return', len } }));
  assert.equal(H.weekendHabit(r('weekend', 'long', 'week', 'holiday')), true);
  assert.equal(H.weekendHabit(r('weekend', 'week', 'week', 'long')), false);
  // starší než 5 posledních se nepočítají, víc měst taky ne
  assert.equal(H.weekendHabit([...r('week', 'week', 'week'), { form: { trip: 'multi', len: 'weekend' } }, ...r('weekend', 'weekend', 'weekend')]), false);
  assert.equal(H.weekendHabit(null), false);
});

test('groundChanged: po hledání jinak nastavená cesta na letiště (vlastní cena, jízdné ×, autem) → „↻ Přepočítat“', () => {
  const q = { from: ['PRG'], kmRate: 1, groundMode: 'transit', accessOverride: { PED: 100, BRQ: 0 } };
  assert.equal(H.groundChanged(q, { kmRate: 1, groundMode: 'transit', accessOverride: { BRQ: 0, PED: 100 } }), false, 'pořadí letišť nevadí');
  assert.equal(H.groundChanged(q, { kmRate: 1, groundMode: 'transit', accessOverride: { BRQ: 0, PED: 0 } }), true, 'jiná vlastní cena');
  assert.equal(H.groundChanged(q, { kmRate: 0.5, groundMode: 'transit', accessOverride: { BRQ: 0, PED: 100 } }), true, 'jízdné × 0,5');
  assert.equal(H.groundChanged(q, { kmRate: 1, groundMode: 'transit' }), true, 'vlastní ceny smazané');
  assert.equal(H.groundChanged({ kmRate: 1, groundMode: 'car', carFuel: 'diesel', carCons: 6 }, { kmRate: 1, groundMode: 'car', carFuel: 'petrol', carCons: 7 }), true, 'jiný pohon');
  assert.equal(H.groundChanged(null, { kmRate: 1 }), false, 'bez výsledku nic');
});

test('smartDirect: „jen přímé“ z věty platí pro tu větu – další věta bez něj ho vypne, zaškrtnuté ve formuláři nechá', () => {
  // věta s „přímé“ ho zapne a zapamatuje si, že ho zapnula věta
  assert.deepEqual(plain(H.smartDirect({ directOnly: true }, false)), { directOnly: true, smart: true });
  // další věta bez „přímé“: zapnula ho věta → vypnout
  assert.deepEqual(plain(H.smartDirect({ nMin: 5 }, true)), { directOnly: false, smart: false });
  // zaškrtnuté ručně ve formuláři (ne věta) → beze změny (bez directOnly)
  assert.deepEqual(plain(H.smartDirect({}, false)), { smart: false });
  assert.deepEqual(plain(H.smartDirect(null, false)), { smart: false });
});

test('resumeKind: cesta kamaráda z odkazu (#trip=), kterou si příjemce neuložil, není na Přehledu „Tvoje cesta“', () => {
  // importFromHash dává cizí cestě shared a krok Shrnutí – dřív z toho karta ↩ Pokračuj udělala „Tvoje cesta“
  assert.equal(H.resumeKind({ step: 'summary', shared: { on: '2026-10-23' } }), 'shared');
  assert.equal(H.resumeKind({ step: 'stay', shared: { on: null } }), 'shared', 'i když si v ní příjemce prochází kroky');
  // po 💾 Uložit si ji (shared smazané) je vlastní
  assert.equal(H.resumeKind({ step: 'summary' }), 'done');
  assert.equal(H.resumeKind({ step: 'program' }), 'draft');
  assert.equal(H.resumeKind(null), 'draft');
  const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  assert.match(fl, /shared \? 'Sdílená cesta' : done \? 'Tvoje cesta' : 'Rozpracovaná cesta'/);
});

test('homeOf: čip „Odkud letíš?“ v uvítání → domov radaru jako z nastavení domova (místo z našeptávače, 150 km, 2 osoby)', async () => {
  const { localSuggestions } = await import('../server/lib/places.js');
  assert.deepEqual(plain(H.HOME_CITIES.map((c) => c[0])), ['Praha', 'Brno', 'Ostrava', 'Vídeň', 'Bratislava']);
  for (const [name] of H.HOME_CITIES) {
    const h = plain(H.homeOf(name));
    assert.equal(h.radius, 150);
    assert.equal(h.adults, 2);
    assert.equal(h.from.length, 1);
    // stejné ID, název, vlajka a poloha jako město, které nabídne našeptávač v poli Odkud
    const s = localSuggestions(name, 6, { role: 'from' }).find((x) => x.type === 'city' && x.label === name);
    assert.ok(s, name);
    const { id, type, label, flag, cc, lat, lon } = s;
    assert.deepEqual(h.from[0], { id, type, label, flag, cc, lat, lon });
  }
  assert.equal(plain(H.homeOf('Brno')).from[0].id, 'geo:49.1952,16.6080|Brno');
  // 📍 Moje poloha: stejné místo jako tlačítko 📍 v Letech
  const me = H.myPlace(49.19523, 16.60801);
  assert.deepEqual(plain(me), { id: 'geo:49.1952,16.6080|Moje poloha', label: 'Moje poloha', flag: '📍', type: 'place' });
  assert.deepEqual(plain(H.homeOf(me)), { from: [plain(me)], radius: 150, adults: 2 });
  // neznámé město, nic → null (domov se nemění)
  assert.equal(H.homeOf('Plzeň'), null);
  assert.equal(H.homeOf(null), null);
  assert.equal(H.homeOf({}), null);
  // místo z našeptávače (pole „Jiné město nebo letiště…“ v uvítání) = domov jako z čipu
  const ped = { id: 'ap:PED', label: 'Pardubice', flag: '🇨🇿', type: 'airport' };
  assert.deepEqual(plain(H.homeOf(ped)), { from: [ped], radius: 150, adults: 2 });
});

test('„Odkud letíš?“ se nový uživatel ptá jedno místo: uvítání (čipy + pole), radar jen odkáže, čip domova dá kurzor do pole', () => {
  const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  // uvítání: otázka, čipy měst a pole pro jiné město (výběr = domov jako z čipu)
  assert.match(app, /<b id="wcHomeL">Odkud letíš\?<\/b><div class="wc-chips">.*<div class="place-input wc-from" id="wcFrom"><\/div>/);
  assert.match(app, /new Flights\.PlaceInput\(wf, \{ origin: true, max: 1, [^}]*onChange: \(\) => \{ if \(pi\.items\.length\) setHome\(pi\.items\[0\]\); \} \}\)/);
  // radar se mezitím neptá podruhé (jen věta) a po skrytí uvítání se zeptá on
  assert.match(fl, /if \(!edit && \$\('#whatsNew:not\(\[hidden\]\) \.wc-home'\)\) \{\n\s+host\.innerHTML = '<div class="card radar-setup radar-wait">/);
  assert.doesNotMatch(fl.match(/radar-wait">([^']*)'/)[1], /\?/, 'věta bez otázky');
  assert.match(app, /if \(asked && window\.Flights && !S\.home\?\.from\?\.length\) Flights\.renderRadar\(\);/);
  // čip domova bez domova není další otázka a vede do pole (posun + kurzor), změna domova klávesnici neotvírá
  assert.match(fl, /: '📍 Nastavit domov';/);
  assert.doesNotMatch(fl, /'📍 Odkud létáš\?'/);
  assert.match(fl, /chip\.onclick = \(\) => \{ go\('dashboard'\); setTimeout\(\(\) => homeAsk\(Boolean\(h\)\), 60\); \};/);
  const ask = fl.slice(fl.indexOf('function homeAsk(edit)'), fl.indexOf('function homeAsk(edit)') + 600);
  assert.match(ask, /const wc = !edit && \$\('#whatsNew:not\(\[hidden\]\) \.wc-home \.pi-input'\);/);
  assert.match(ask, /const inp = wc \|\| \(!edit && \$\('#radarFrom \.pi-input'\)\);/);
  assert.match(ask, /inp\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\);\n\s+inp\.focus\(\{ preventScroll: true \}\);/);
});
