// Regresní kontrola 2 – Cesty: „Změnit let“ v ✏️ Upravit vymění let u uložené cesty (trip.js start s window.reflight),
// dřív vznikla druhá cesta se stejným názvem bez programu; obnovená stránka na #trip se 2+ cestami ukáže Moje cesty
// (app.js boot a hashView přes tabGo jako záložka), sdílená cesta z odkazu dál průvodce.
// Zástupný DOM jako v termin-cesty.test.js: $ vrací stálé objekty podle selektoru.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const APP = src('app.js');
const fnOf = (name) => APP.match(new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'm'))[0];
function load() {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  vm.runInContext(src('searchhelp.js'), ctx, { filename: 'searchhelp.js' });
  const helpers = APP.match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk|okYmd) = .*$/gm);
  assert.equal(helpers.length, 7);
  vm.runInContext(`const Ics = window.Ics, SearchHelp = window.SearchHelp;\n${helpers.join('\n')}\n${fnOf('shiftDays')}
    var S = {}, __els = {}, __toasts = [], __go = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = () => [];
    var go = (v) => { __go.push(v); }; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var toast = (msg) => { __toasts.push(msg); }; var byIso = { PT: { cs: 'Portugalsko' } }; var PACK = ['Pas', 'Nabíječka']; var enc = encodeURIComponent;
    window.scrollTo = () => {};
    // id cesty = Date.now() při založení: dvě cesty ve stejné milisekundě by test spojil do jedné
    { const real = Date.now; let last = 0; Date.now = () => (last = Math.max(last + 1, real())); }`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }; // termín vždy dopředu, ať test nezastará
const leg = (from, to, date, dep, arr) => ({ from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz: 'Europe/Prague', toTz: 'Europe/Lisbon', carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: `https://air.example/${from}-${to}`, live: false });
const LIS = { key: 'LIS', id: 'ap:LIS', label: 'Lisabon', cc: 'PT', country: 'Portugalsko', lat: 38.72, lon: -9.14 };
const ROM = { key: 'ROM', id: 'metro:ROM', label: 'Řím', cc: 'IT', country: 'Itálie', lat: 41.9, lon: 12.5 };
// let z výsledků hledání (ne vlastní): tam od..do, back = false → jen tam
function pick(c, { from = 0, to = 4, adults = 2, bags = 'none', dest = LIS, czk = 3000, back = true } = {}) {
  const ap = dest === LIS ? 'LIS' : 'FCO';
  const t = { id: 'x' + from, out: leg('PRG', ap, day(from + 40), '10:00', '12:30'), back: back ? leg(ap, 'PRG', day(to + 40), '13:30', '17:50') : null, flightCzk: czk, groundCzk: 0, bagCzk: 0, arrCzk: 0, perPersonCzk: czk, totalCzk: czk * adults, provider: 'demo-air', combined: false, bookUrl: null, deal: { level: 'normal' } };
  c.window.Trip.start({ t, g: { dest }, result: { origins: [], query: { adults, bags }, home: null, arrivals: {} }, at: Date.now() - 6e4 });
  return c.S.trip;
}
// uložená cesta do Lisabonu s programem, hotelem z nabídek, vlastní aktivitou a odškrtnutou věcí „Sbaleno“
function saved(c, o) {
  const T = c.window.Trip, t = pick(c, o), sp = T.progSpan(t), d1 = day(41);
  t.plan = { days: [{ date: d1, items: [{ id: 'p1', name: 'Belém' }] }], span: { start: sp.start, end: sp.end, arrivalTime: sp.arrivalTime || null, departureTime: sp.departureTime || null } };
  t.stay = { mode: 'pick', id: 'h1', name: 'Hotel', totalCzk: 9000, url: 'https://www.booking.com/hotel' };
  t.booked = { stay: true, 'geo:38.69,-9.21': true };
  c.S.trips = c.S.trips || [];
  T.saveToPlanner({ quiet: true });
  const e = c.S.trips.find((x) => x.tripId === t.created);
  e.days[d1].push('Večeře u Rity'); // vlastní aktivita z plánovače
  e.checklist[0].done = true; // odškrtnuté „Pas“
  return e;
}

test('Změnit let: let se vymění u téže cesty – bez kopie, id, vlastní aktivita a odškrtnutí zůstanou, program a noci na nový termín', () => {
  const c = load(), T = c.window.Trip;
  const e = saved(c), id = e.tripId;
  c.S.trip = null; // průvodce zavřený, cesta jen v Mých cestách
  c.window.reflight = id; // app.js editTrip → „Změnit let“
  pick(c, { from: 7, to: 11, adults: 3, czk: 2500 }); // o týden později, 3 cestující
  assert.equal(c.S.trips.length, 1, 'žádná nová cesta');
  assert.equal(c.window.reflight, null, 'značka jen pro tento výběr');
  const n = c.S.trips[0];
  assert.equal(n.tripId, id);
  assert.equal(c.S.trip.created, id, 'v průvodci je tatáž cesta');
  assert.equal(n.wizard.flight.out.date, day(47));
  assert.equal(n.wizard.flight.back.date, day(51));
  assert.equal(n.wizard.flight.flightCzk, 2500);
  assert.equal(n.wizard.adults, 3);
  assert.equal(n.pax, '3');
  assert.equal(n.start, day(47));
  // program a vlastní aktivita o týden dál (Belém 41 → 48)
  assert.deepEqual(plain(n.days), { [day(48)]: ['Belém', 'Večeře u Rity'] });
  assert.deepEqual(plain(c.S.trip.plan.days.map((d) => d.date)), [day(48)]);
  assert.equal(n.checklist.find((x) => x.t === 'Pas').done, true, 'odškrtnutí zůstane');
  // hotel z nabídek platil pro původní dny a lidi; odškrtnutá rezervace místa zůstane
  assert.equal(n.wizard.stay, null);
  assert.deepEqual(plain(n.wizard.booked), { 'geo:38.69,-9.21': true });
  assert.equal(c.S.trip.step, 'flight', 'průvodce ukáže nový let');
  // další výběr bez značky je zase nová cesta (běžné „Naplánovat cestu“ z výsledků)
  pick(c, { from: 20, to: 24 });
  assert.notEqual(c.S.trip.created, id);
});

test('Změnit let: v průvodci je otevřená jiná cesta – ta zůstane v Mých cestách, měněná se vymění; let jen tam', () => {
  const c = load();
  const e = saved(c), id = e.tripId;
  c.S.trips[0].name = 'Lisabon s kamarády'; // vlastní název z ✏️ Upravit
  pick(c, { dest: ROM, from: 2, to: 5 }); // Řím z výsledků s ubytováním, uložený (jen prohlédnutou leaveTrip ze seznamu odebere)
  c.S.trip.stay = { mode: 'manual', name: 'U kamaráda', totalCzk: 3000 };
  c.window.Trip.saveToPlanner({ quiet: true });
  const rome = c.S.trip.created;
  assert.equal(c.S.trips.length, 2);
  c.window.reflight = id;
  pick(c, { from: 3, back: false, adults: 1 }); // jen tam, o 3 dny později
  assert.equal(c.S.trips.length, 2, 'žádná třetí cesta');
  assert.ok(c.S.trips.some((x) => x.tripId === rome), 'Řím zůstal');
  const n = c.S.trips.find((x) => x.tripId === id);
  assert.equal(c.S.trip.created, id);
  assert.equal(n.name, 'Lisabon s kamarády', 'vlastní název zůstane');
  assert.equal(n.wizard.flight.back, null);
  assert.equal(n.wizard.adults, 1);
  // program o 3 dny dál
  assert.equal(c.S.trip.nightsOneWay, 3); // noci pobytu jen tam z měněné cesty (start by dal výchozí)
  assert.deepEqual(Object.keys(plain(n.days)), [day(44)]);
  assert.deepEqual(plain(n.days[day(44)]), ['Belém', 'Večeře u Rity']);
});

test('Změnit let: značka bez uložené cesty (smazaná mezitím) založí novou cestu jako dřív', () => {
  const c = load();
  c.S.trips = [];
  c.window.reflight = 12345;
  pick(c);
  assert.ok(c.S.trip.created !== 12345);
  assert.equal(c.window.reflight, null);
});

test('app.js: „Změnit let“ nastaví značku, odchod z Letů ji smaže; start na #trip a Zpět jako záložka (tabGo), sdílená cesta průvodce', () => {
  const ed = fnOf('editTrip');
  assert.match(ed, /\$\('#etFlight'\); if \(ef\) ef\.onclick = \(\) => \{ modalClose\(\); window\.reflight = t\.tripId; tripFlights\(t\); \};/);
  assert.match(fnOf('go'), /if \(from === 'flights' && v !== 'flights'\) window\.reflight = null;/);
  const start = APP.match(/^async function start\(\) \{[\s\S]*?\n\}/m)[0];
  assert.match(start, /\(shared \? go : tabGo\)\(isView\(v\) \? v : 'dashboard', \{ noHash: true \}\);/);
  // hashView: Zpět na #trip se 2+ cestami → Moje cesty (mine), s jednou cestou průvodce
  const calls = [];
  const ctx = { location: { hash: '#trip' }, history: { state: null }, window: { scrollTo() {} }, showNow() {}, S: { trip: null, trips: [{ tripId: 1 }, { tripId: 2 }] } };
  vm.createContext(ctx);
  vm.runInContext(`var activeView = 'flights'; const isView = (v) => ['dashboard', 'flights', 'trip'].includes(v);
    function go(v, o) { calls.push([v, o]); activeView = v; }
    ${APP.match(/^const tripCount = .*$/m)[0]}\n${APP.match(/^const tabGo = .*$/m)[0]}\n${fnOf('hashView')}`, Object.assign(ctx, { calls }));
  ctx.hashView();
  assert.deepEqual(plain(calls.pop()), ['trip', { noHash: true, keepScroll: false, mine: true }]);
  vm.runInContext("activeView = 'flights'; S.trips = [{ tripId: 1 }];", ctx);
  ctx.hashView();
  assert.deepEqual(plain(calls.pop()), ['trip', { noHash: true, keepScroll: false }]);
});
