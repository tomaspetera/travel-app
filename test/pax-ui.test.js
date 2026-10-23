// Cestující s dětmi v prohlížeči: počty a texty (SearchHelp), odložené nabídky (Pins), sdílená nabídka (OfferShare)
// a rozpočet průvodce Cestou (Trip) – dítě platí sedadlo, miminko na klíně se do ceny nepočítá. Bez dětí beze změny.
// Klasické skripty prohlížeče přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const ctx = { console, TextEncoder, TextDecoder, btoa, atob, CompressionStream, DecompressionStream, location: { origin: 'https://atlas.example', pathname: '/' }, navigator: {} };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['searchhelp.js', 'sharelink.js', 'pins.js', 'offershare.js']) vm.runInContext(src(f), ctx, { filename: f });
ctx.ShareLink = ctx.window.ShareLink;
const { SearchHelp: H, Pins, OfferShare: O } = ctx;

test('paxOf: děti a miminka volitelně, stejné meze jako server (sedadel nejvýš 9, miminko na dospělého)', () => {
  assert.deepEqual(plain(H.paxOf({ adults: 2 })), { adults: 2, children: 0, infants: 0, seats: 2 }, 'starší formulář bez dětí');
  assert.deepEqual(plain(H.paxOf({ adults: '2', children: '2', infants: '1' })), { adults: 2, children: 2, infants: 1, seats: 4 }, 'skrytá pole formuláře');
  assert.deepEqual(plain(H.paxOf({ adults: 1, infants: 2 })), { adults: 1, children: 0, infants: 1, seats: 1 });
  assert.deepEqual(plain(H.paxOf({ adults: 8, children: 4 })), { adults: 8, children: 1, infants: 0, seats: 9 });
  assert.deepEqual(plain(H.paxOf(null)), { adults: 1, children: 0, infants: 0, seats: 1 });
});

test('texty cestujících: tlačítko, souhrn, cena celkem a poznámka – bez dětí jako dřív', () => {
  assert.equal(H.paxTxt({ adults: 2 }), '2 dospělí');
  assert.equal(H.paxTxt({ adults: 2, children: 1, infants: 1 }), '2 dospělí · 1 dítě · 1 miminko');
  assert.equal(H.paxTxt({ adults: 5, children: 3 }), '5 dospělých · 3 děti');
  assert.equal(H.paxShort({ adults: 2 }), '2 os.');
  assert.equal(H.paxShort({ adults: 2, children: 2, infants: 1 }), '2 dosp. + 2 děti + miminko');
  assert.equal(H.paxTotalLbl({ adults: 2 }), 'celkem 2 os.');
  assert.equal(H.paxTotalLbl({ adults: 2, children: 2 }), 'celkem za 4 osoby');
  assert.equal(H.paxTotalLbl({ adults: 3, children: 3, infants: 1 }), 'celkem za 6 osob + miminko');
  assert.equal(H.paxTotalLbl({ adults: 1, infants: 1 }), 'celkem za 1 osobu + miminko');
  assert.deepEqual([H.paxTotalOn({ adults: 1 }), H.paxTotalOn({ adults: 1, infants: 1 }), H.paxTotalOn({ adults: 2 })], [false, true, true]);
  assert.equal(H.paxNote({ adults: 2 }), '');
  assert.equal(H.paxNote({ adults: 2, children: 2 }), 'děti platí na sedadlo jako dospělí');
  assert.equal(H.paxNote({ adults: 2, children: 1, infants: 1 }), 'dítě platí na sedadlo jako dospělý, miminko na klíně – poplatek aerolinky se doplní při nákupu');
});

test('kidsBuyNote: Ryanair a Wizz Air mají děti v odkazu, ostatní je přidají na webu; bez dětí nic', () => {
  const name = (id) => ({ ryanair: 'Ryanair', wizzair: 'Wizz Air', kiwi: 'Kiwi.com', travelpayouts: 'Aviasales' })[id] || id;
  const fam = { adults: 2, children: 2, infants: 1 };
  assert.equal(H.kidsBuyNote({ adults: 2 }, ['kiwi'], name), '');
  assert.equal(H.kidsBuyNote(fam, [], name), '', 'bez odkazu (demo) nic');
  assert.equal(H.kidsBuyNote(fam, ['ryanair'], name), 'Ryanair: děti a miminko už v odkazu');
  assert.equal(H.kidsBuyNote({ adults: 1, children: 1 }, ['kiwi'], name), 'Kiwi.com: dítě přidej na webu (odkaz jen s dospělými)');
  assert.equal(H.kidsBuyNote(fam, ['wizzair', 'travelpayouts', 'wizzair'], name), 'Wizz Air: děti a miminko už v odkazu · Aviasales: děti a miminko přidej na webu (odkaz jen s dospělými)');
});

test('z radaru do formuláře (radarPax): rodina z minulého hledání zůstane, bez dětí počet lidí radaru – i u 📌 karty radaru', () => {
  assert.deepEqual(plain(H.radarPax({ adults: 2 }, 3)), { adults: 3, children: 0, infants: 0 });
  assert.deepEqual(plain(H.radarPax(null, 2)), { adults: 2, children: 0, infants: 0 });
  assert.deepEqual(plain(H.radarPax({ adults: 2, children: 1 }, 3)), {}, 'děti zůstanou (prefsOf(S.form))');
  assert.deepEqual(plain(H.radarPax({ adults: 2, infants: 1 }, 2)), {}, 'miminko nezmizí');
  // karta radaru, ⭐ Moje cíle i 🔎 Najít tento termín u odložené karty radaru (dřív tam rodina zmizela: dospělí = lidé
  // radaru, děti a miminka 0)
  const F = src('flights.js');
  const body = (name) => F.slice(F.indexOf(`function ${name}(`), F.indexOf('\n  }\n', F.indexOf(`function ${name}(`)));
  for (const fn of ['radarGo', 'searchFavs', 'pinSearch']) assert.match(body(fn), /\.\.\.radarPax\([^)]*\)/, fn);
  assert.doesNotMatch(body('pinSearch'), /children: p\.q\.children/);
});

test('mřížka termínů (gridTrips): cena celkem za všechna sedadla', () => {
  const l = (from, to, date) => ({ from, to, date, dep: `${date}T08:00:00`, provider: 'ryanair' });
  const res = { query: { adults: 2, children: 1, infants: 1 }, top: [], calendar: { grid: { keys: ['out', 'back', 'flightCzk', 'bagCzk', 'groundCzk', 'arrCzk'], legs: [l('PRG', 'BCN', '2026-11-10'), l('BCN', 'PRG', '2026-11-14')], trips: [[0, 1, 2000, 0, 0, 0]] } } };
  assert.equal(H.gridTrips(res).top[0].totalCzk, 6000, '3 sedadla, miminko bez ceny');
  assert.equal(H.gridTrips({ ...res, top: [], query: { adults: 2 } }).top[0].totalCzk, 4000);
});

const leg = (from, to, date, extra = {}) => ({ provider: 'ryanair', carrier: 'FR', carrierName: 'Ryanair', from, to, date, dep: `${date}T06:10:00`, arr: `${date}T08:05:00`, hasTime: true, czk: 900, stops: 0, live: true, bookUrl: 'https://www.ryanair.com/cz/cs/trip/flights/select?adults=2&children=2&infants=1', ...extra });
const T = { id: 'fr|PRG|NAP', out: leg('PRG', 'NAP', '2026-11-13'), back: leg('NAP', 'PRG', '2026-11-15'), flightCzk: 1800, perPersonCzk: 1800, tripCzk: 1900, totalCzk: 7200, bagCzk: 0, groundCzk: 60, arrCzk: 40, nights: 2, provider: 'ryanair', bookUrl: null };
const Q = { adults: 2, bags: 'none', groundMode: 'transit', kmRate: 1, arrival: true };
const resOf = (q) => ({ mode: 'route', query: q, origins: [], arrivals: {}, groups: [] });
const AT = Date.UTC(2026, 9, 22, 12, 30), NOW = AT + 36e5;
const kc = (s) => s.replace(/[\u00a0\u202f]/g, ' '); // tisíce odděluje Intl nedělitelnou mezerou

test('📌 odložená nabídka: děti v nastavení ceny (jiná nabídka než bez nich), bez dětí klíč jako dřív', () => {
  const g = { dest: { key: 'NAP', id: 'metro:NAP', label: 'Neapol', cc: 'IT' } };
  const solo = Pins.fromRow(T, g, resOf({ ...Q, children: 0, infants: 0 }), AT, NOW);
  const fam = Pins.fromRow(T, g, resOf({ ...Q, children: 2, infants: 1 }), AT, NOW);
  assert.equal(Pins.basis(solo.q), '2|none|transit|1', 'bez dětí stejný klíč jako odložené nabídky ze starší verze');
  assert.equal(Pins.basis(fam.q), '2+2+1|none|transit|1');
  assert.notEqual(solo.k, fam.k);
  assert.deepEqual([fam.q.children, fam.q.infants, 'children' in solo.q], [2, 1, false]);
  // záloha / cizí vstup: děti se zachovají jen v mezích
  const back = Pins.clean([fam, { ...fam, k: 'x', q: { ...fam.q, children: 9, infants: 5 } }], { today: '2026-10-22', now: NOW });
  assert.deepEqual(plain(back.map((p) => [p.q.children ?? null, p.q.infants ?? null])), [[2, 1], [null, null]]);
  assert.match(kc(Pins.shareText([fam], { now: NOW })), /celkem 7 200 Kč za 4 os\. vč\. 2 dětí \+ miminko \(poplatek aerolinky navíc\)/);
});

test('📤 sdílená nabídka: sedadla, děti a miminka v odkazu; starší odkaz bez nich = dospělí', () => {
  const g = { dest: { key: 'NAP', id: 'metro:NAP', label: 'Neapol', cc: 'IT' } };
  const fam = Pins.fromRow(T, g, resOf({ ...Q, children: 2, infants: 1 }), AT, NOW);
  const o = JSON.parse(O.json(fam));
  assert.deepEqual([o.pax, o.ch, o.inf, o.total], [4, 2, 1, 7200]);
  assert.deepEqual(plain(O.paxQ(o)), { adults: 2, children: 2, infants: 1 });
  assert.match(kc(O.text(o)), /celkem 7 200 Kč za 4 os\. vč\. 2 dětí \+ miminko \(poplatek aerolinky navíc\)/);
  const old = O.sanitize({ out: o.out, czk: 1800, pax: 2, total: 3600 });
  assert.deepEqual([old.ch, old.inf, plain(O.paxQ(old))], [undefined, undefined, { adults: 2, children: 0, infants: 0 }]);
  const bad = O.sanitize({ out: o.out, czk: 1800, pax: 2, ch: 2, inf: 3 });
  assert.deepEqual([bad.ch, bad.inf], [undefined, undefined], 'dětí nejvýš pax − 1, miminek nejvýš dospělých');
});

// průvodce Cestou: trip.js s pomocnými řádky z app.js (jako test/trip-integration.test.js)
function loadTrip() {
  const c = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(c);
  vm.runInContext(src('ics.js'), c, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = {}, __els = {};
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = () => []; var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']'; var toast = () => {};`, c, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), c, { filename: 'trip.js' });
  return c.window.Trip;
}

test('průvodce Cestou: letenky, doprava a rozpočet na osobu za sedadla (dospělí + děti), miminko bez ceny', () => {
  const Trip = loadTrip();
  const base = {
    v: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', ground: {}, groundMode: 'transit',
    flight: { out: leg('PRG', 'NAP', '2026-11-13'), back: leg('NAP', 'PRG', '2026-11-15'), flightCzk: 1800, groundCzk: 100, bagCzk: 0, arrCzk: 0 },
    dest: { label: 'Neapol', country: 'Itálie', cc: 'IT' }, stay: { mode: 'manual', name: 'Byt', totalCzk: 6000 }, car: null, plan: null, overland: null,
  };
  const solo = Trip.costs(base);
  assert.deepEqual([solo.flights, solo.ground, solo.total, solo.perPerson], [3600, 200, 9800, 4900], 'bez dětí jako dřív');
  const fam = Trip.costs({ ...base, children: 2, infants: 1 });
  assert.deepEqual([fam.flights, fam.ground, fam.stay, fam.total, fam.perPerson], [7200, 400, 6000, 13600, 3400]);
  assert.equal(plain(Trip.budgetGroups({ ...base, children: 2, infants: 1 }))[0].pp, 1800);
  // odkaz ze sdílené cesty / zálohy: děti v mezích, bez nich nic navíc
  const t = Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...base, children: 2, infants: 5 })));
  assert.deepEqual([t.adults, t.children, t.infants], [2, 2, 2]);
  const a = Trip.sanitizeTrip(JSON.parse(JSON.stringify(base)));
  assert.deepEqual(['children' in a, 'infants' in a], [false, false]);
});
