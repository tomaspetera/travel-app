// Regresní kontrola 2 – Cesty: „Změnit let“ v ✏️ Upravit vymění let u uložené cesty (trip.js start s window.reflight),
// dřív vznikla druhá cesta se stejným názvem bez programu; obnovená stránka na #trip se 2+ cestami ukáže Moje cesty
// (app.js boot a hashView přes tabGo jako záložka), sdílená cesta z odkazu dál průvodce. „↩ Jiný let“ v průvodci
// (otherFlight) se stejnou značkou – let do téhož cíle se vymění i u cesty ještě neuložené.
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
function pick(c, { from = 0, to = 4, adults = 2, bags = 'none', dest = LIS, czk = 3000, back = true, dep = '10:00', oe = {} } = {}) {
  const ap = dest === LIS ? 'LIS' : 'FCO';
  const t = { id: 'x' + from, out: { ...leg('PRG', ap, day(from + 40), dep, '12:30'), ...oe }, back: back ? leg(ap, 'PRG', day(to + 40), '13:30', '17:50') : null, flightCzk: czk, groundCzk: 0, bagCzk: 0, arrCzk: 0, perPersonCzk: czk, totalCzk: czk * adults, provider: 'demo-air', combined: false, bookUrl: null, deal: { level: 'normal' } };
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

test('Změnit let: v Letech vybraný let jinam (jiný cíl) založí novou cestu – Lisabon s programem zůstane beze změny', () => {
  const c = load();
  const e = saved(c), id = e.tripId, before = JSON.stringify(e.wizard.flight);
  c.S.trip = null;
  c.window.reflight = id;
  pick(c, { dest: ROM, from: 7, to: 11 });
  assert.equal(c.window.reflight, null);
  assert.notEqual(c.S.trip.created, id, 'Řím je nová cesta');
  assert.equal(c.S.trip.dest.label, 'Řím');
  const n = c.S.trips.find((x) => x.tripId === id);
  assert.equal(JSON.stringify(n.wizard.flight), before, 'let Lisabonu se nezměnil');
  assert.equal(n.dest, 'Lisabon');
});

// „↩ Jiný let“ v průvodci (trip.js otherFlight): značka jako „Změnit let“ – vybraný let do téhož cíle vymění let u této
// cesty, dřív vznikla druhá (komentář ve start() to popisoval jako záměr)
function jinyLet(c) {
  c.S.trip.step = 'flight';
  c.window.Trip.render();
  c.__els['#tfBack'].onclick();
  assert.equal(c.window.reflight, c.S.trip.created, 'značka = id cesty v průvodci');
  assert.equal(c.__go.at(-1), 'flights');
}

test('↩ Jiný let: uložená cesta otevřená v průvodci – let se vymění u ní, bez kopie, program na nový termín', () => {
  const c = load();
  const e = saved(c), id = e.tripId;
  assert.equal(c.S.trip.created, id);
  jinyLet(c);
  pick(c, { from: 7, to: 11, czk: 2500 });
  assert.equal(c.window.reflight, null);
  assert.equal(c.S.trips.length, 1, 'žádná nová cesta');
  assert.equal(c.S.trip.created, id);
  const n = c.S.trips[0];
  assert.equal(n.wizard.flight.out.date, day(47));
  assert.equal(n.wizard.flight.flightCzk, 2500);
  assert.deepEqual(plain(n.days), { [day(48)]: ['Belém', 'Večeře u Rity'] });
});

test('↩ Jiný let: cesta ještě neuložená v Mých cestách se vymění na místě se vším vyplněným – bez otázky a bez druhé', () => {
  const c = load();
  c.S.trips = [];
  const t = pick(c), id = t.created;
  t.stay = { mode: 'manual', name: 'U kamaráda', totalCzk: 3000 };
  t.booked = { 'geo:38.69,-9.21': true };
  t.nightsOneWay = 5;
  jinyLet(c);
  let asked = 0;
  c.confirm = () => { asked++; return true; }; // leaveTrip by se ptal „Nahradit ji novou cestou?“
  pick(c, { from: 3, back: false, adults: 1 });
  assert.equal(asked, 0);
  assert.equal(c.window.reflight, null);
  assert.equal(c.S.trip.created, id, 'tatáž cesta');
  assert.equal(c.S.trip.flight.out.date, day(43));
  assert.equal(c.S.trip.flight.back, null);
  assert.equal(c.S.trip.adults, 1);
  assert.deepEqual(plain(c.S.trip.stay), { mode: 'manual', name: 'U kamaráda', totalCzk: 3000 }, 'ručně zadané ubytování zůstane');
  assert.deepEqual(plain(c.S.trip.booked), { 'geo:38.69,-9.21': true });
  assert.equal(c.S.trip.nightsOneWay, 5);
  assert.equal(c.S.trip.step, 'flight');
  assert.equal(c.S.trips.length, 0, 'do Mých cest nic navíc');
});

test('↩ Jiný let: let jinam založí novou cestu, rozpracovaná stará zůstane v Mých cestách beze změny', () => {
  const c = load();
  c.S.trips = [];
  const t = pick(c), id = t.created, before = JSON.stringify(t.flight);
  t.stay = { mode: 'manual', name: 'U kamaráda', totalCzk: 3000 };
  jinyLet(c);
  pick(c, { dest: ROM, from: 7, to: 11 });
  assert.equal(c.window.reflight, null);
  assert.notEqual(c.S.trip.created, id);
  assert.equal(c.S.trip.dest.label, 'Řím');
  assert.equal(c.S.trip.stay, null);
  const e = c.S.trips.find((x) => x.tripId === id);
  assert.ok(e, 'Lisabon s ubytováním uložen (leaveTrip)');
  assert.equal(JSON.stringify(e.wizard.flight), before);
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

// Regresní kontrola 3 – ↩ Jiný let / Změnit let: tentýž let znovu nesmí smazat hotel ani vrátit průvodce na krok Let
// (dřív se u cesty se značkou vždy volal reflightTrip → dropPicked); jiný let řekne, co zmizelo; Lety jako odbočka
// z průvodce (Zpět do Cesty, ne na Přehled – po něm vznikala druhá cesta).
const FRESH = { foundAt: 1, czk: 2999, prevCzk: 3500, otherDeps: ['08:00'] }; // nabídka z jiného hledání: jiné vedlejší údaje

test('↩ Jiný let → tentýž let (z jiného hledání): hotel i krok zůstanou, žádná kopie ani hláška', () => {
  const c = load();
  const e = saved(c), id = e.tripId;
  jinyLet(c);
  c.S.trip.step = 'program'; // krok, na kterém cesta byla (lišta kroků jen prohlíží)
  pick(c, { oe: FRESH });
  assert.equal(c.window.reflight, null);
  assert.equal(c.S.trips.length, 1);
  assert.equal(c.S.trip.created, id);
  assert.equal(c.S.trip.step, 'program', 'krok se nezmění');
  assert.equal(c.S.trip.stay.name, 'Hotel', 'hotel zůstane');
  assert.equal(c.S.trips[0].wizard.stay.name, 'Hotel');
  assert.deepEqual(plain(c.__toasts), []);
  assert.equal(c.__go.at(-1), 'trip');
});

test('Změnit let → tentýž let u cesty jen v Mých cestách: otevře ji beze změny (hotel, Shrnutí)', () => {
  const c = load();
  const e = saved(c), id = e.tripId;
  c.S.trip = null;
  c.window.reflight = id;
  pick(c, { oe: FRESH });
  assert.equal(c.S.trips.length, 1);
  assert.equal(c.S.trip.created, id);
  assert.equal(c.S.trip.step, 'summary');
  assert.equal(c.S.trip.stay.name, 'Hotel');
  assert.equal(c.S.trips[0].wizard.stay.name, 'Hotel');
});

test('↩ Jiný let → jiný let: jiný čas téhož dne hotel nechá, jiné dny ho odeberou s hláškou proč', () => {
  const c = load();
  saved(c);
  jinyLet(c);
  pick(c, { dep: '07:00' });
  assert.equal(c.S.trip.flight.out.dep.slice(11, 16), '07:00');
  assert.equal(c.S.trip.stay.name, 'Hotel', 'stejné noci → hotel platí');
  assert.deepEqual(plain(c.__toasts), []);
  jinyLet(c);
  pick(c, { from: 7, to: 11 });
  assert.equal(c.S.trip.stay, null);
  assert.equal(c.S.trips.length, 1);
  assert.match(c.__toasts.at(-1), /^Let vyměněn – hotel platil pro původní let, vyber ho znovu/);
});

test('↩ Jiný let u sdílené cesty: po výměně letu už netvrdí „ceny z doby sdílení“, zůstane sdílená', () => {
  const c = load(), T = c.window.Trip;
  c.S.trips = [];
  const t = pick(c);
  t.shared = { on: '2026-11-20' };
  t.flight.pricedAt -= 864e5; // cena ze dne sdílení
  pick(c); // tentýž let z dnešního hledání: cesta beze změny, cena letu je ale teď dnešní
  assert.equal(c.S.trip, t);
  assert.deepEqual(plain(t.shared), {});
  t.shared = { on: '2026-11-20' };
  jinyLet(c);
  pick(c, { from: 3, to: 6 });
  assert.equal(c.S.trip.created, t.created);
  assert.deepEqual(plain(c.S.trip.shared), {});
  assert.equal(T.sanitizeTrip(plain(c.S.trip)).shared.on ?? null, null, 'po obnovení stránky taky bez dne');
  c.S.trip.step = 'flight';
  T.render();
  assert.match(c.__els['#tripRoot'].innerHTML, /Sdílená cesta<\/b> – ceny se mohly změnit/);
  assert.equal(c.S.trips.length, 0, 'sdílená se sama neuloží');
});

test('↩ Jiný let: Lety jako odbočka z průvodce (drill) – Zpět do Cesty; pak tentýž let bez značky kopii nezaloží', () => {
  const c = load();
  const e = saved(c), id = e.tripId, calls = [];
  c.go = (v, o) => calls.push([v, o]);
  c.tripFlights = (t, o) => calls.push(['tripFlights', o]);
  c.S.trip.step = 'flight';
  c.window.Trip.render();
  c.__els['#tfBack'].onclick(); // bez výsledků → hledání do cíle cesty
  assert.deepEqual(plain(calls.pop()), ['tripFlights', { drill: true }]);
  c.__els['#results'] = { firstElementChild: {} };
  c.S.form = { to: [{ id: 'ap:LIS' }] };
  c.__els['#tfBack'].onclick(); // výsledky do téhož cíle na obrazovce
  assert.deepEqual(plain(calls.pop()), ['flights', { drill: true }]);
  // Zpět z Letů (app.js go: odchod z Letů značku zruší), pak Vpřed a tentýž let
  c.window.reflight = null;
  c.go = (v) => c.__go.push(v);
  pick(c, { oe: FRESH });
  assert.equal(c.S.trips.length, 1, 'žádná druhá cesta');
  assert.equal(c.S.trip.created, id);
  assert.equal(c.S.trip.stay.name, 'Hotel');
  // app.js: tripFlights s drill napřed krok historie odbočky (Flights.searchTo pak už jen v Letech)
  const got = [];
  const ctx = { window: {}, S: {}, byIso: {}, flag: () => '', go: (v, o) => got.push([v, o]) };
  ctx.window.Flights = ctx.Flights = { searchTo: () => got.push(['searchTo']) };
  vm.createContext(ctx);
  vm.runInContext(APP.match(/^window\.tripFlights = \(t, o = \{\}\) => \{[\s\S]*?\n\};/m)[0], ctx);
  ctx.window.tripFlights({ place: { id: 'ap:LIS' }, start: day(40), end: '' }, { drill: true });
  assert.deepEqual(plain(got), [['flights', { drill: true }], ['searchTo']]);
  // historie: odbočka z Cesty je krok navíc nad ní – Zpět vrátí do průvodce
  const vh = vm.runInContext(`${APP.match(/^const histDepth = .*$/m)[0]}\n${fnOf('viewHist')}\nviewHist`, vm.createContext({}));
  assert.deepEqual(plain(vh('flights', { atlasV: 1 }, '#trip', true)), { back: 0, how: 'drill' });
});

test('tentýž let za jinou cenu z jiného hledání: cesta ukáže cenu, na kterou uživatel klepl, ne starou (Jiný let – hotel ve stejné dny zůstane)', () => {
  const c = load();
  const e = saved(c), id = e.tripId;
  jinyLet(c);
  pick(c, { oe: FRESH, czk: 3300 });
  assert.equal(c.S.trips.length, 1);
  assert.equal(c.S.trip.created, id);
  assert.equal(c.S.trip.flight.flightCzk, 3300, 'cena z výběru, ne stará 3000');
  assert.equal(c.S.trips[0].wizard.flight.flightCzk, 3300);
  assert.equal(c.S.trip.stay.name, 'Hotel', 'stejné noci a lidé → hotel platí');
  // bez značky (nové hledání, tentýž let dráž): stará cena v otevřené cestě nezůstane
  pick(c, { oe: { ...FRESH, foundAt: 2 }, czk: 3600 });
  assert.equal(c.S.trip.flight.flightCzk, 3600);
});
