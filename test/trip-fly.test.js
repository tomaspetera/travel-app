// Cesta přes víc měst letadlem (3 a víc letů s návratem domů) v průvodci: místa trasy a noci podle letů, mezi místy
// let (t.flight.mid), ubytování a program pro každé místo, všechny lety ve shrnutí, kalendáři a plánovači.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load(state = {}) {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = ${JSON.stringify(state)}, __els = {}, __all = {}, __toasts = [], __go = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = (s) => __all[s] || [];
    var go = (v) => { __go.push(v); }; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var toast = (msg) => { __toasts.push(msg); }; var byIso = {}; var PACK = ['Pas'];
    window.scrollTo = () => {};`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const leg = (from, to, date, dep, arr, fromTz = 'Europe/Rome', toTz = 'Europe/Rome', arrDate = date) => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${arrDate}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: `https://air.example/${from}-${to}`,
});
const ROM = { key: 'ROM', id: 'metro:ROM', label: 'Řím (Itálie)', cc: 'IT', country: 'Itálie', lat: 41.9, lon: 12.5 };
const BCN = { key: 'BCN', id: 'ap:BCN', label: 'Barcelona', cc: 'ES', country: 'Španělsko', lat: 41.39, lon: 2.17 };
const OUT = leg('PRG', 'FCO', '2026-11-10', '10:00', '12:00', 'Europe/Prague');
const MID = leg('FCO', 'BCN', '2026-11-13', '07:35', '09:20', 'Europe/Rome', 'Europe/Madrid');
const BACK = leg('BCN', 'PRG', '2026-11-16', '18:10', '20:35', 'Europe/Madrid', 'Europe/Prague');
const ARR = {
  FCO: { iata: 'FCO', city: 'Řím', mode: 'train', how: 'vlak Leonardo Express', czk: 350, min: 32, basis: 'table', lat: 41.9, lon: 12.5 },
  BCN: { iata: 'BCN', city: 'Barcelona', mode: 'bus', how: 'autobus Aerobús', czk: 180, min: 35, basis: 'table', lat: 41.39, lon: 2.17 },
};
function begin(ctx, { mid = [MID], back = BACK, stops = [ROM, BCN] } = {}) {
  const t = { id: 'x', out: OUT, mid, back, flightCzk: 3000, groundCzk: 200, bagCzk: 0, arrCzk: 1060, perPersonCzk: 4260, totalCzk: 8520, provider: 'demo-air', combined: false, bookUrl: null, deal: { level: 'normal' } };
  ctx.window.Trip.start({ t, g: { dest: ROM }, result: { origins: [], query: { adults: 2, bags: 'none' }, home: null, arrivals: ARR }, stops });
  return ctx.S.trip;
}
function render(ctx, step) {
  ctx.S.trip.step = step;
  ctx.window.Trip.render();
  return sp(ctx.__els['#tripStep'].innerHTML);
}

test('cesta přes víc měst: jde do průvodce, jen když má každé město aspoň 1 noc a známou polohu', () => {
  const { Trip } = load().window;
  assert.equal(Trip.flyOk({ out: OUT, mid: [MID], back: BACK }, [ROM, BCN]), true);
  // přílet do Říma a týž den dál do Barcelony – v Římě žádná noc
  assert.equal(Trip.flyOk({ out: OUT, mid: [leg('FCO', 'BCN', '2026-11-10', '18:00', '20:00')], back: BACK }, [ROM, BCN]), false);
  // let neznámo kam (úsek „do Itálie“ s letem jinam) – bez polohy místa
  assert.equal(Trip.flyOk({ out: OUT, mid: [MID], back: BACK }, [null, BCN]), false);
  // bez letu domů není kdy skončit
  assert.equal(Trip.flyOk({ out: OUT, mid: [MID], back: null }, [ROM, BCN]), false);
});

test('cesta přes víc měst: trasa podle letů – místa, noci a termíny z letů, noc v letadle do žádného místa nepatří', () => {
  const c = load();
  const t = begin(c);
  assert.equal(t.route.fixed, 'flights');
  assert.deepEqual(plain(t.route.bases.map((b) => [b.name, b.nights, b.cc])), [['Řím', 3, 'IT'], ['Barcelona', 3, 'ES']]);
  assert.deepEqual(plain(c.window.Trip.baseDates(t)), [{ checkin: '2026-11-10', checkout: '2026-11-13', nights: 3 }, { checkin: '2026-11-13', checkout: '2026-11-16', nights: 3 }]);
  // mezi místy se letí – žádné přejezdy autem ani jízdenky
  assert.equal(c.window.Trip.costs(t).transfers, 0);
  // noční let mezi místy (odlet 13. 11. ve 23:00, přílet 14. 11. v 6:30): Řím do 13., Barcelona od 14.
  const c2 = load();
  const t2 = begin(c2, { mid: [leg('FCO', 'BCN', '2026-11-13', '23:00', '06:30', 'Europe/Rome', 'Europe/Madrid', '2026-11-14')] });
  assert.deepEqual(plain(c2.window.Trip.baseDates(t2)), [{ checkin: '2026-11-10', checkout: '2026-11-13', nights: 3 }, { checkin: '2026-11-14', checkout: '2026-11-16', nights: 2 }]);
  assert.deepEqual(plain(t2.route.bases.map((b) => b.nights)), [3, 2]);
  // program místa: od příletu do odletu dalšího letu
  assert.deepEqual(plain(c2.window.Trip.baseProgram(t2, 1)), { start: '2026-11-14', end: '2026-11-16', arrivalTime: '06:30', departureTime: '18:10' });
  assert.deepEqual(plain(c2.window.Trip.baseProgram(t2, 0)), { start: '2026-11-10', end: '2026-11-13', arrivalTime: '12:00', departureTime: '23:00' });
});

test('cesta přes víc měst: krok Let ukáže všechny lety bez živého ověření, Trasa je jen přehled, Auto radí půjčit jen na místě', () => {
  const c = load();
  begin(c);
  const f = render(c, 'flight');
  assert.match(f, /Vybrané lety \(3\)/);
  assert.match(f, /1\. let · /); assert.match(f, /2\. let · /); assert.match(f, /3\. let · /);
  assert.match(f, /Každý let je samostatná letenka/);
  assert.doesNotMatch(f, /tfVerify/, 'živé ověření umí jen tam a zpět');
  assert.equal(c.S.trip.verifiedAt, undefined);
  const r = render(c, 'route');
  assert.match(r, /Trasa podle letů/);
  assert.match(r, /Řím.*3<\/b> noci.*2\. let FCO → BCN.*Barcelona.*3<\/b> noci/s);
  assert.doesNotMatch(r, /data-nm|data-del|rtQ/, 'místa ani noci se neupravují');
  const a = render(c, 'car');
  assert.match(a, /Mezi místy letíš/);
  assert.match(a, /id="carPu" value="FCO"/); assert.match(a, /id="carDo" value="FCO"/);
});

test('cesta přes víc měst: průběh cesty, kalendář, shrnutí a plánovač mají všechny lety (a cestu na letiště mezi nimi)', () => {
  const c = load();
  const t = begin(c);
  const rows = c.window.Trip.timeline(t).map((x) => `${x[0]} ${x[1]} ${sp(x[2]).replace(/<[^>]+>/g, '')}`);
  const i = rows.findIndex((x) => /✈️ FCO 07:35 → BCN 09:20 .*Řím → Barcelona/.test(x));
  assert.ok(i > 0, rows.join('\n'));
  assert.match(rows[i - 1], /^2026-11-13 🚆 Řím → letiště FCO · vlak Leonardo Express/);
  assert.match(rows[i - 2], /^2026-11-13 🚪 Z ubytování na letiště FCO vyraž nejpozději v 5:03.*brzy ráno/);
  assert.match(rows[i + 1], /^2026-11-13 🚌 Z letiště BCN → Barcelona/);
  assert.match(rows[i + 2], /^2026-11-13 🏨 Barcelona · 3 noci/);
  assert.ok(!rows.some((x) => /Přejezd/.test(x)));
  const ev = c.window.Trip.calendarEvents(t).map((e) => e.title);
  assert.equal(ev.filter((x) => /^✈️/.test(x)).length, 3, ev.join('\n'));
  assert.ok(ev.includes('🚪 Vyraž na letiště FCO'));
  assert.ok(!ev.some((x) => /Přejezd/.test(x)));
  const s = render(c, 'summary');
  assert.match(s, /1\. letenka: PRG → FCO/); assert.match(s, /2\. letenka: FCO → BCN/); assert.match(s, /3\. letenka: BCN → PRG/);
  assert.match(s, /https:\/\/air\.example\/FCO-BCN/);
  // plánovač: všechny lety s časy, bez přejezdů mezi místy
  c.S.trips = [];
  c.__els['#sumSave'].onclick();
  const p = c.S.trips[0];
  assert.deepEqual(plain(p.legs.map((l) => `${l.from}-${l.to} ${l.dep}`)), ['PRG-FCO 2026-11-10T10:00', 'FCO-BCN 2026-11-13T07:35', 'BCN-PRG 2026-11-16T18:10']);
  assert.match(p.flight, /^1\. PRG→FCO .*, 2\. FCO→BCN .*, 3\. BCN→PRG .* · samostatné letenky$/);
  assert.match(p.notes, /Trasa: Řím \(3 noci\) → Barcelona \(3 noci\)/);
  assert.doesNotMatch(p.notes, /Přejezd/);
  assert.equal(p.wizard.flight.mid.length, 1);
});

test('cesta přes víc měst: odkaz a uložená cesta vrátí lety mezi místy i trasu podle letů; bez letů mezi místy je to obyčejná trasa', () => {
  const c = load();
  const t = begin(c);
  const back = c.window.Trip.sanitizeTrip(plain(t));
  assert.equal(back.flight.mid.length, 1);
  assert.equal(back.flight.mid[0].to, 'BCN');
  assert.equal(back.route.fixed, 'flights');
  assert.equal(back.arrival.mid[0].from.iata, 'FCO');
  assert.deepEqual(plain(c.window.Trip.baseDates(back)), plain(c.window.Trip.baseDates(t)));
  // poškozený odkaz bez letů mezi místy: trasa se dál dá upravit jako každá jiná (bez pevných termínů)
  const bad = c.window.Trip.sanitizeTrip({ ...plain(t), flight: { ...plain(t.flight), mid: 'x' } });
  assert.equal(bad.flight.mid, undefined);
  assert.equal(c.window.Trip.baseDates(bad)[1].checkin, '2026-11-13');
  c.S.trip = bad; bad.step = 'route'; c.window.Trip.render();
  assert.doesNotMatch(sp(c.__els['#tripStep'].innerHTML), /Trasa podle letů/);
});
