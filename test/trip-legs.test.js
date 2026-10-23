// Průvodce cestou: auto jen na některé dny (vyzvednutí a vrácení ve městě) a doprava po úsecích trasy přes víc míst
// (část autem, část vlakem / busem – jedno půjčení auta jen na úseky autem). Čisté funkce plánování (routeLegs,
// suggestModes, carRange…) i kroky Trasa a Auto vykreslené do zástupného DOM ($ vrací stálé objekty podle selektoru,
// $$ seznam z __all); public/js/trip.js přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load() {
  const ctx = { window: { scrollTo() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = { trips: [] }, __els = {}, __all = {}, __toasts = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {}, scrollIntoView() {} });
    var $$ = (s) => __all[s] || [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var confirm = () => false; var toast = (msg) => { __toasts.push(msg); };
    var byIso = { IT: { cs: 'Itálie' }, PT: { cs: 'Portugalsko' } }; var PACK = ['Pas'];`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const tick = () => new Promise((r) => setImmediate(r));
function render(c, t) {
  c.S.trip = t;
  c.__toasts.length = 0;
  c.window.Trip.render();
  return sp(c.__els['#tripStep'].innerHTML);
}
const rows = (c, t) => plain(c.window.Trip.timeline(t)).map((r) => sp(`${r[0]} ${r[1]} ${r[2]}`));

const leg = (from, to, date, dep, arr, fromTz, toTz) => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: 'https://air.example/book',
});
const arr = (iata, city, lat, lon, mode, czk) => ({ iata, city, gen: city, lat, lon, mode, how: mode, fare: 2, cur: 'EUR', czk, min: 25, km: 7, src: 'https://x.example', date: '2026-10-01', basis: 'table' });
// přejezd ze serveru (stayplan.js): km, časy autem i vlakem, palivo, mýtné a jízdenka na osobu
const x = (km, carMin, transitMin, fuelCzk, tollCzk, fareCzk, transitKind = 'rail') => ({ km, carMin, transitMin, transitKind, basis: 'route', fuelCzk, tollCzk, fareCzk, carUrl: 'https://maps.example/c', transitUrl: 'https://maps.example/t' });

// Lisabon 5 nocí: přílet 13:10, odlet zpět 15:00, z letiště metrem
const LIS_ARR = arr('LIS', 'Lisabon', 38.7223, -9.1393, 'metro', 50);
function lisbon(over = {}) {
  return {
    v: 1, created: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'car', ground: {}, groundMode: 'transit', overland: null,
    flight: { out: leg('PRG', 'LIS', '2026-11-10', '10:00', '13:10', 'Europe/Prague', 'Europe/Lisbon'), back: leg('LIS', 'PRG', '2026-11-15', '15:00', '19:40', 'Europe/Lisbon', 'Europe/Prague'), flightCzk: 3200, groundCzk: 0, bagCzk: 0, arrCzk: 100 },
    dest: { label: 'Lisabon', country: 'Portugalsko', cc: 'PT', lat: 38.7742, lon: -9.1342 },
    arrival: { out: LIS_ARR, back: LIS_ARR },
    stay: { mode: 'skip', name: 'bez ubytování', totalCzk: 0 }, car: null, plan: null, ...over,
  };
}
// Pisa → Florencie (vlakem) → Siena (autem) → letiště Pisa (autem): přílet PSA 11:45, odlet PSA 18:00
const PSA_ARR = arr('PSA', 'Pisa', 43.7228, 10.4017, 'train', 60);
const FI = { id: 'Q2044', name: 'Florencie', nameEn: 'Florence', lat: 43.7696, lon: 11.2558, cc: 'IT', country: 'Itálie', nights: 2, stay: null, plan: null };
const SI = { id: 'Q2751', name: 'Siena', nameEn: 'Siena', lat: 43.3188, lon: 11.3308, cc: 'IT', country: 'Itálie', nights: 2, stay: null, plan: null };
function pisa(legModes = [{ a: '', b: FI.id, m: 'transit' }, { a: FI.id, b: SI.id, m: 'car' }, { a: SI.id, b: '', m: 'car' }], over = {}) {
  return lisbon({
    flight: { out: leg('PRG', 'PSA', '2026-11-10', '10:00', '11:45', 'Europe/Prague', 'Europe/Rome'), back: leg('PSA', 'PRG', '2026-11-14', '18:00', '19:45', 'Europe/Rome', 'Europe/Prague'), flightCzk: 2500, groundCzk: 0, bagCzk: 0, arrCzk: 120 },
    dest: { label: 'Pisa', country: 'Itálie', cc: 'IT', lat: 43.6839, lon: 10.3927 },
    arrival: { out: PSA_ARR, back: PSA_ARR },
    route: {
      mode: 'multi', transport: 'car', legModes, exclude: [], candidates: [], notes: [],
      arrival: { iata: 'PSA', name: 'Pisa (PSA)', lat: 43.6839, lon: 10.3927 }, departure: { iata: 'PSA', name: 'Pisa (PSA)', lat: 43.6839, lon: 10.3927 },
      bases: [{ ...FI }, { ...SI }],
      transfers: [x(72, 70, 95, 300, 0, 90, 'bus')],
      legs: { arrival: x(85, 65, 70, 350, 0, 90), departure: x(110, 85, 120, 250, 80, 110) },
    },
    ...over,
  });
}
// Řím → Florencie → Benátky (přílet FCO, odlet VCE)
const ROMA = { id: 'city:ROM', name: 'Řím', lat: 41.9028, lon: 12.4964, cc: 'IT', country: 'Itálie', nights: 2, stay: null, plan: null };
const VE = { id: 'Q641', name: 'Benátky', lat: 45.4408, lon: 12.3155, cc: 'IT', country: 'Itálie', nights: 2, stay: null, plan: null };
function italy(transport = 'car', transfers = [x(277, 195, 115, 800, 540, 600), x(245, 175, 170, 700, 480, 500)], over = {}) {
  return lisbon({
    flight: { out: leg('PRG', 'FCO', '2026-11-10', '10:00', '12:00', 'Europe/Prague', 'Europe/Rome'), back: leg('VCE', 'PRG', '2026-11-16', '15:00', '16:30', 'Europe/Rome', 'Europe/Prague'), flightCzk: 2500, groundCzk: 0, bagCzk: 0, arrCzk: 0 },
    dest: { label: 'Řím', country: 'Itálie', cc: 'IT', lat: 41.9, lon: 12.5 }, arrival: null,
    route: {
      mode: 'multi', transport, exclude: [], candidates: [], notes: [], transfers,
      arrival: { iata: 'FCO', name: 'Řím (FCO)', lat: 41.8045, lon: 12.252 }, departure: { iata: 'VCE', name: 'Benátky (VCE)', lat: 45.505, lon: 12.352 },
      bases: [{ ...ROMA }, { ...FI }, { ...VE }],
      legs: { arrival: x(30, 40, 45, 120, 0, 140), departure: x(13, 20, 25, 60, 0, 80) },
    },
    ...over,
  });
}
const modes = (c, t) => plain(c.window.Trip.routeLegs(t)).map((l) => l.mode).join(' ');

test('úseky trasy: z letiště, mezi místy a na letiště, každý se svou dopravou; bez výjimek celá trasa jednou dopravou', () => {
  const c = load(), { Trip } = c.window;
  const legs = plain(Trip.routeLegs(pisa()));
  assert.deepEqual(legs.map((l) => [l.k, l.date, l.mode, l.a && l.a.name, l.b && l.b.name]), [
    [0, '2026-11-10', 'transit', null, 'Florencie'], [1, '2026-11-12', 'car', 'Florencie', 'Siena'], [2, '2026-11-14', 'car', 'Siena', null],
  ]);
  assert.deepEqual(plain(Trip.carRuns(legs)), [[1, 2]], 'auto jedním kusem: Florencie → Siena → letiště');
  assert.equal(modes(c, italy()), 'car car car car');
  assert.equal(modes(c, italy('transit')), 'transit transit transit transit');
  // stejná doprava všude = doprava celé trasy, výjimky pryč (jako přepínač nahoře)
  const t = pisa();
  assert.equal(Trip.setLegModes(t, { 0: 'car' }), false);
  assert.deepEqual([t.route.transport, plain(t.route.legModes)], ['car', []]);
  assert.equal(Trip.setLegModes(t, { 0: 'transit', 1: 'transit', 2: 'transit' }), true, 'změna dopravy celé trasy → přejezdy znovu ze serveru');
  assert.equal(t.route.transport, 'transit');
  // výjimka podle id míst: po přesunu míst zůstane u stejné dvojice
  Trip.setLegModes(t, { 1: 'car' });
  t.route.bases.reverse();
  assert.equal(modes(c, t), 'transit transit transit', 'Siena → Florencie je jiný úsek než Florencie → Siena');
  // trasa podle letů úseky po zemi nemá
  assert.deepEqual(plain(Trip.routeLegs({ ...pisa(), route: { ...pisa().route, fixed: 'flights' }, flight: { ...pisa().flight, mid: [leg('FLR', 'PSA', '2026-11-12', '09:00', '10:00')] } })), []);
});

test('návrh dopravy po úsecích: vlakem jen kde je jasně rychlejší, z letiště jako sousední přejezd, auto jedním kusem', () => {
  const c = load(), { Trip } = c.window;
  // Řím → Florencie rychlovlakem o 1 h 20 min dřív, Florencie → Benátky jen o 5 min: z FCO vlakem, Florencie → VCE autem
  assert.deepEqual(plain(Trip.suggestModes(italy())), { 0: 'transit', 1: 'transit', 2: 'car', 3: 'car' });
  // obojí rychleji vlakem → všude vlakem
  assert.deepEqual(plain(Trip.suggestModes(italy('car', [x(277, 195, 115, 800, 540, 600), x(245, 175, 150, 700, 480, 500)]))), { 0: 'transit', 1: 'transit', 2: 'transit', 3: 'transit' });
  // vlakem rychleji jen uprostřed (auto, vlak, auto = dvě půjčení) → autem jen delší část, zbytek vlakem / busem
  const four = italy('car', [x(80, 70, 90, 300, 0, 200), x(277, 195, 115, 800, 540, 600), x(245, 175, 170, 700, 480, 500)]);
  four.route.bases = [{ ...ROMA, nights: 1 }, { id: 'Q1', name: 'Orvieto', lat: 42.72, lon: 12.11, cc: 'IT', nights: 1 }, { ...FI }, { ...VE }];
  assert.deepEqual(plain(Trip.suggestModes(four)), { 0: 'transit', 1: 'transit', 2: 'transit', 3: 'car', 4: 'car' });
});

test('auto jen na 2 dny uprostřed pobytu (Lisabon 5 nocí): vyzvednutí i vrácení ve městě, metro z letiště a zpět zůstane v ceně i průběhu', () => {
  const c = load(), { Trip } = c.window;
  const t = lisbon();
  assert.deepEqual(plain(Trip.carDays(t)), ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  const city = { name: 'Lisabon', lat: 38.7223, lon: -9.1393, cc: 'PT' };
  assert.deepEqual(plain(Trip.carRange(t, '2026-11-11', '2026-11-12')), { pickup: 'LIS', dropoff: 'LIS', from: '2026-11-11T09:00', to: '2026-11-12T18:00', puCity: city, doCity: city });
  // celý pobyt = z letiště na letiště po příletu / před odletem jako dřív
  assert.deepEqual(plain(Trip.carRange(t, '2026-11-10', '2026-11-15')), { pickup: 'LIS', dropoff: 'LIS', from: '2026-11-10T13:55', to: '2026-11-15T13:00' });
  // od příletu do středy: letiště → město
  assert.deepEqual(plain(Trip.carRange(t, '2026-11-10', '2026-11-11')), { pickup: 'LIS', dropoff: 'LIS', from: '2026-11-10T13:55', to: '2026-11-11T18:00', doCity: city });
  const mid = lisbon({ car: { mode: 'manual', totalCzk: 2400, age: 30, ...Trip.carRange(t, '2026-11-11', '2026-11-12') } });
  assert.equal(Trip.costs(mid).arrival, 200, 'metro tam i zpět, 2 osoby');
  assert.equal(Trip.costs(mid).car, 2400);
  const r = rows(c, mid);
  assert.ok(r.includes('2026-11-11 🚗 Vyzvednutí auta Lisabon (město) 09:00'), r.join('\n'));
  assert.ok(r.includes('2026-11-12 🚗 Vrácení auta Lisabon (město) 18:00'));
  assert.equal(r.filter((x) => / 🚇 /.test(x)).length, 2);
  // kalendář: ve městě bez „Letiště LIS“, v zóně cíle
  const ev = plain(Trip.calendarEvents(mid)).filter((e) => /auta/.test(e.title));
  assert.deepEqual(ev.map((e) => [e.title, e.start, e.location, e.tz]), [
    ['🚗 Vyzvednutí auta (Lisabon)', '2026-11-11T09:00', 'Lisabon, Portugalsko', 'Europe/Lisbon'], ['🚗 Vrácení auta (Lisabon)', '2026-11-12T18:00', 'Lisabon, Portugalsko', 'Europe/Lisbon'],
  ]);
  // auto z letiště po příletu, ale vyzvednuté „ve městě“: cesta z letiště do města zůstane
  const town = lisbon({ car: { mode: 'manual', totalCzk: 2400, pickup: 'LIS', dropoff: 'LIS', from: '2026-11-10T13:55', to: '2026-11-15T13:00', puCity: city } });
  assert.equal(Trip.costs(town).arrival, 100, 'jen zpět autem na letiště');
});

test('krok Auto: 📅 dny auta – Lisabon jen 2. a 3. den: odkazy s městem a časy, 2 dny pronájmu, uložené auto ve městě', async () => {
  const c = load();
  const calls = [];
  c.fetch = (u) => {
    calls.push(u);
    const q = new URLSearchParams(String(u).split('?')[1]);
    const city = (p) => (q.get(`${p}City`) ? { name: q.get(`${p}City`), iata: 'LIS', km: 7 } : null);
    const body = { query: { pickup: q.get('pickup'), dropoff: q.get('dropoff'), from: q.get('from'), to: q.get('to'), pickupName: 'Lisabon – Letiště', pickupCity: city('pu'), dropoffCity: city('do'), pickupCc: 'PT', dropoffCc: 'PT' }, items: [], links: [{ id: 'kayak', name: 'Kayak', note: '', url: `https://www.cz.kayak.com/cars/LIS/${q.get('from')}` }] };
    return Promise.resolve({ ok: true, json: async () => body });
  };
  const t = lisbon();
  const h = render(c, t);
  assert.match(h, /<span class="cr-l">📅 Auto na dny<\/span>/);
  assert.match(h, /<option value="2026-11-10" selected>út 10\. 11\. · přílet<\/option>/);
  assert.match(h, /<option value="2026-11-15" selected>ne 15\. 11\. · odlet<\/option>/);
  assert.match(h, /id="carRangeN">celý pobyt</);
  assert.match(h, /vyber je níž \(📅 Auto na dny\), vyzvednutí a vrácení pak bude ve městě/, 'rada „ve městě auto nepotřebuješ“ ukáže na dny auta');
  await tick();
  // jen 2. a 3. den
  c.$('#carAge').value = '30';
  c.$('#carD1').value = '2026-11-11';
  c.$('#carD2').value = '2026-11-12';
  c.__els['#carD1'].onchange();
  await tick();
  assert.deepEqual([c.$('#carFrom').value, c.$('#carTo').value, c.$('#carPu').value, c.$('#carPu').hidden, c.$('#carPuCity').hidden], ['2026-11-11T09:00', '2026-11-12T18:00', 'LIS', true, false]);
  assert.equal(sp(c.$('#carPuCity').innerHTML), '🏙️ Lisabon');
  assert.equal(c.$('#carPuW').innerHTML, '✈️ na letišti');
  assert.equal(c.$('#carRangeN').innerHTML, '2 dny');
  assert.equal(sp(c.$('#carDays').innerHTML), '2 dny pronájmu');
  const q = new URLSearchParams(calls.at(-1).split('?')[1]);
  assert.deepEqual(['from', 'to', 'puCity', 'puLat', 'puLon', 'doCity'].map((k) => q.get(k)), ['2026-11-11T09:00', '2026-11-12T18:00', 'Lisabon', '38.7223', '-9.1393', 'Lisabon']);
  assert.match(sp(c.__els['#carBody'].innerHTML), /nejbližší letiště: LIS ~7 km od města Lisabon\)\. Pobočky přímo ve městě ukáže mapa/);
  // vrácení až v pátek a pak zpět na letiště: přepínač ✈️ na letišti
  c.$('#carPrice').value = '2400';
  c.__els['#carSave'].onclick();
  assert.deepEqual(plain(t.car), { mode: 'manual', totalCzk: 2400, pickup: 'LIS', dropoff: 'LIS', from: '2026-11-11T09:00', to: '2026-11-12T18:00', age: 30, puCity: { name: 'Lisabon', lat: 38.7223, lon: -9.1393, cc: 'PT' }, doCity: { name: 'Lisabon', lat: 38.7223, lon: -9.1393, cc: 'PT' }, url: 'https://www.cz.kayak.com/cars/LIS/2026-11-11T09:00' });
  // sdílený odkaz: město přežije, cizí pole ne
  const back = plain(c.window.Trip.sanitizeTrip({ ...plain(t), car: { ...plain(t.car), puCity: { name: 'Lisabon', lat: 38.72, lon: -9.14, cc: 'PT', evil: '<x>' }, doCity: { name: '', lat: 1, lon: 1 } } }));
  assert.deepEqual([back.car.puCity, back.car.doCity], [{ name: 'Lisabon', lat: 38.72, lon: -9.14, cc: 'PT' }, undefined]);
});

test('Pisa → Florencie (vlakem) → Siena (autem) → letiště Pisa (autem): auto z Florencie (město) na letiště, ceny a průběh po úsecích', () => {
  const c = load(), { Trip } = c.window;
  const t = pisa();
  // auto jen na úseky autem: ve Florencii ráno v den přejezdu, vrácení na letišti PSA 2 h před odletem
  const car = plain(Trip.carStart(t));
  assert.deepEqual(car, { pickup: 'PSA', dropoff: 'PSA', from: '2026-11-12T09:00', to: '2026-11-14T16:00', puCity: { name: 'Florencie', lat: 43.7696, lon: 11.2558, cc: 'IT' } });
  t.car = { mode: 'manual', totalCzk: 3100, age: 30, ...car };
  // cesta z letiště do města odpadá: tam je jízdenka PSA → Florencie v přejezdech, zpět auto vrácené na letišti
  const k = Trip.costs(t);
  assert.equal(k.arrival, 0);
  assert.deepEqual(plain(Trip.transferParts(t)), { fuel: 300 + 250 + 80, fare: 90 * 2 });
  assert.equal(k.transfers, 810);
  assert.equal(k.total, 2500 * 2 + 3100 + 810);
  const r = rows(c, t);
  const at = (re) => r.findIndex((x) => re.test(x));
  assert.ok(at(/^2026-11-10 🚆 Z letiště PSA → Florencie · ~1 h 10 min vlakem \/ busem/) > 0, r.join('\n'));
  assert.ok(at(/^2026-11-12 🚗 Vyzvednutí auta Florencie \(město\) 09:00$/) > 0);
  assert.ok(at(/^2026-11-12 🚗 Přejezd Florencie → Siena · 72 km · ~1 h 10 min autem/) > at(/Vyzvednutí auta/));
  assert.ok(at(/^2026-11-14 🚗 Siena → letiště PSA · 110 km · ~1 h 25 min autem/) > 0);
  assert.ok(at(/^2026-11-14 🚗 Vrácení auta PSA 16:00$/) > 0);
  assert.equal(at(/🚆 Z letiště PSA → Pisa/), -1, 'žádná cesta z letiště do Pisy, jede se rovnou do Florencie');
  // Shrnutí: palivo a jízdenky zvlášť, auto s místy
  const h = render(c, { ...t, step: 'summary' });
  assert.match(h, /⛽<\/td><td>Přejezdy autem – palivo a mýtné \(odhad, nafta 6 l\/100 km\)<\/td><td>630 Kč/);
  assert.match(h, /🚆<\/td><td>Přejezdy vlakem \/ busem – jízdenky \(2 os\., odhad\)<\/td><td>180 Kč/);
  assert.match(h, /🚗<\/td><td>Auto · Florencie \(město\) 12\.11\. → PSA 14\.11\.<\/td><td>3 100 Kč/);
  // plánovač: přejezd svou dopravou
  c.S.trip = t;
  c.window.Trip.saveToPlanner({ stay: true });
  const notes = sp(c.S.trips[0].notes);
  assert.match(notes, /Přejezd letiště PSA → Florencie: ~1 h 10 min vlakem \/ busem/);
  assert.match(notes, /Přejezd Florencie → Siena: 72 km · ~1 h 10 min autem/);
  assert.match(notes, /Auto: Florencie \(město\) 2026-11-12T09:00 → PSA 2026-11-14T16:00 – 3 100 Kč/);
});

test('krok Auto na kombinované trase: kde auto vyzvednout a vrátit, 📅 dny auta mění dopravu úseků', async () => {
  const c = load();
  c.fetch = () => new Promise(() => {});
  const t = pisa();
  const h = render(c, t);
  assert.match(h, /🔀 <div><b>Trasa kombinovaně<\/b> – 🚗 autem: Florencie → Siena, Siena → letiště PSA · 🚆 vlakem \/ busem: letiště PSA → Florencie\./);
  assert.match(h, /Auto vyzvedni ve městě <b>Florencie<\/b> \(čt 12\. 11\.\) a vrať na letišti <b>PSA<\/b> \(so 14\. 11\.\) – jednosměrný pronájem/);
  assert.match(h, /<option value="2026-11-12" selected>čt 12\. 11\.<\/option>/);
  assert.match(h, /id="carPuCity">🏙️ Florencie</);
  assert.match(h, /vrácení jinde \(PSA\) může stát příplatek/);
  // auto už od příletu: všechny úseky autem (doprava celé trasy, bez výjimek)
  c.$('#carD1').value = '2026-11-10';
  c.$('#carD2').value = '2026-11-14';
  c.__els['#carD1'].onchange();
  assert.deepEqual([t.route.transport, plain(t.route.legModes || [])], ['car', []]);
  assert.deepEqual([c.$('#carFrom').value, c.$('#carPu').hidden], ['2026-11-10T12:30', false]);
  assert.match(sp(c.$('#carRoute').innerHTML), /Trasa autem: Florencie → Siena/);
  // jen 3.–4. den (Siena): z letiště i do Sieny vlakem / busem, auto v Sieně a vrácení na letišti
  c.$('#carD1').value = '2026-11-13';
  c.__els['#carD1'].onchange();
  assert.equal(modes(c, t), 'transit transit car');
  assert.deepEqual(plain(c.$('#carPuCity').innerHTML), '🏙️ Siena');
});

test('krok Trasa: přepínač 🚗 / 🚆 u každého úseku s časem a cenou, přejezdy celkem, 🔀 kombinovaně; auto podle dřívějších úseků pryč', () => {
  const c = load();
  c.__all['[data-lm]'] = [{ dataset: { lm: '2', m: 'transit' } }];
  const t = pisa(undefined, { step: 'route', car: { mode: 'manual', totalCzk: 3100, pickup: 'PSA', dropoff: 'PSA', from: '2026-11-12T09:00', to: '2026-11-14T16:00' } });
  render(c, t);
  const list = sp(c.__els['#rtList'].innerHTML), tools = sp(c.__els['#rtTools'].innerHTML);
  assert.match(tools, /<button type="button" class="on" aria-pressed="true" disabled[^>]*>🔀 Kombinovaně<\/button>/);
  assert.match(tools, /data-tr="car" class="">🚗 Autem/);
  // úsek z letiště vlakem (jízdenky za 2), přejezd autem (palivo), na letiště autem (palivo a mýtné)
  assert.match(list, /🚆 ~1 h 10 min vlakem \/ busem \(odhad\) · ~180 Kč za 2 os\./);
  assert.match(list, /<b>72 km · ~1 h 10 min autem · ~300 Kč<\/b> <span class="faint">\(podle trasy; 🚌 autobusem \/ minibusem ~1 h 35 min, ~180 Kč za 2 os\.\)<\/span>/);
  assert.match(list, /<button type="button" data-lm="0" data-m="transit" class="on" aria-pressed="true"/);
  assert.match(list, /<button type="button" data-lm="1" data-m="car" class="on"/);
  assert.match(list, /data-lm="1" data-m="transit" class="" aria-pressed="false" title="Autobusem" aria-label="Autobusem">🚌</, 'kde jezdí jen autobusy, 🚌');
  assert.match(list, /<b>Přejezdy celkem ~3 h 45 min · ~810 Kč<\/b> <span class="faint">\(🚗 2× · 🚆 1×; palivo a mýtné, jízdenky, odhad\)/);
  // Siena → letiště vlakem: auto (vybrané pro Florencie → letiště) neplatí
  c.__all['[data-lm]'][0].onclick();
  assert.equal(modes(c, t), 'transit car transit');
  assert.equal(t.car, null);
  assert.deepEqual(plain(c.__toasts), ['Doprava na trase se změnila – zadej znovu auto']);
});

test('auto na dvou oddělených částech trasy: upozornění, jedno auto i přes úsek mezi nimi, nebo auto jen na delší část', () => {
  const c = load(), { Trip } = c.window;
  const split = () => { const t = italy(); Trip.setLegModes(t, { 1: 'transit' }); return { ...t, step: 'route' }; };
  let t = split();
  assert.equal(modes(c, t), 'car transit car car');
  assert.deepEqual(plain(Trip.carRuns(Trip.routeLegs(t))), [[0, 0], [2, 3]]);
  // výchozí auto: delší část (Florencie → Benátky → VCE), ve Florencii ráno v den přejezdu
  assert.deepEqual(plain(Trip.carStart(t)), { pickup: 'FCO', dropoff: 'VCE', from: '2026-11-14T09:00', to: '2026-11-16T13:00', puCity: { name: 'Florencie', lat: 43.7696, lon: 11.2558, cc: 'IT' } });
  c.__all['[data-carfix]'] = [{ dataset: { carfix: 'fill' } }];
  render(c, t);
  const list = sp(c.__els['#rtList'].innerHTML);
  assert.match(list, /Auto na 2 oddělených částech trasy<\/b> \(letiště FCO → Řím a Florencie → Benátky, Benátky → letiště VCE\) – to jsou 2 půjčení/);
  assert.match(list, /data-carfix="fill">Jedno auto – autem i Řím → Florencie</);
  assert.match(list, /data-carfix="keep">Auto jen Florencie → Benátky, Benátky → letiště VCE, zbytek vlakem \/ busem</);
  c.__all['[data-carfix]'][0].onclick();
  assert.deepEqual([modes(c, t), t.route.transport, plain(t.route.legModes)], ['car car car car', 'car', []]);
  t = split();
  Trip.setLegModes(t, {});
  assert.equal(modes(c, t), 'car transit car car');
  c.__all['[data-carfix]'] = [{ dataset: { carfix: 'keep' } }];
  render(c, t);
  c.__all['[data-carfix]'][0].onclick();
  assert.equal(modes(c, t), 'transit transit car car');
});

test('Řím → Florencie → Benátky celé vlakem: beze změny – žádné auto, jízdenky za přejezdy, úseky vlakem v průběhu', () => {
  const c = load(), { Trip } = c.window;
  const t = italy('transit');
  assert.equal(plain(Trip.routeLegs(t)).every((l) => l.mode === 'transit'), true);
  assert.deepEqual(plain(Trip.transferParts(t)), { fuel: 0, fare: (140 + 600 + 500 + 80) * 2 });
  assert.equal(Trip.costs(t).transfers, 2640);
  const r = rows(c, t);
  assert.ok(r.some((x) => /^2026-11-12 🚆 Přejezd Řím → Florencie · ~1 h 55 min vlakem/.test(x)), r.join('\n'));
  assert.ok(r.some((x) => /^2026-11-14 🚆 Přejezd Florencie → Benátky · ~2 h 50 min vlakem/.test(x)));
  const h = render(c, { ...t, step: 'summary' });
  assert.match(h, /🚆<\/td><td>Přejezdy na trase – jízdenky \(2 os\., odhad\)<\/td><td>2 640 Kč/);
  assert.doesNotMatch(h, /⛽|Přejezdy autem|počítám <b>autem<\/b>/);
  // krok Trasa: přepínač nahoře Vlakem, u úseků 🚆, žádný návrh ani dvě auta
  render(c, { ...t, step: 'route' });
  const list = sp(c.__els['#rtList'].innerHTML);
  assert.match(sp(c.__els['#rtTools'].innerHTML), /data-tr="transit" class="on">🚆 Vlakem a busem/);
  assert.doesNotMatch(list, /rt-sug|car-split/);
  assert.match(list, /<b>Přejezdy celkem ~[^<]+ · ~2 640 Kč<\/b>/);
  // sdílený odkaz: výjimky úseků přežijí, nesmysly ne
  const s = plain(Trip.sanitizeTrip({ ...plain(italy()), route: { ...plain(italy().route), legModes: [{ a: '', b: 'city:ROM', m: 'transit' }, { a: 'x y', b: 'Q641', m: 'car' }, { a: 'Q2044', b: 'Q641', m: 'plane' }] } }));
  assert.deepEqual(s.route.legModes, [{ a: '', b: 'city:ROM', m: 'transit' }]);
});

test('krok Trasa u trasy autem: 💡 vlakem rychleji – jedním klepnutím vlakem jen tyto přejezdy, autem zbytek', () => {
  const c = load();
  const t = { ...italy(), step: 'route' };
  render(c, t);
  const list = sp(c.__els['#rtList'].innerHTML);
  assert.match(list, /💡 Vlakem rychleji: Řím → Florencie ~1 h 55 min \(autem ~3 h 15 min\) · <button type="button" class="linkbtn" id="rtSug">Vlakem tyto přejezdy, autem zbytek ›<\/button>/);
  c.__els['#rtSug'].onclick();
  assert.equal(modes(c, t), 'transit transit car car');
  assert.doesNotMatch(sp(c.__els['#rtList'].innerHTML), /rt-sug/, 'návrh použitý');
  // krok Auto: totéž tlačítko u rady „Vlakem rychleji“
  const t2 = { ...italy(), step: 'car' };
  c.fetch = () => new Promise(() => {});
  c.__all['[data-carsug]'] = [{ dataset: { carsug: '1' } }];
  assert.match(render(c, t2), /data-carsug="1">Vlakem tyto přejezdy, autem zbytek ›/);
  c.__all['[data-carsug]'][0].onclick();
  assert.equal(modes(c, t2), 'transit transit car car');
});
