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
  assert.match(rows[i - 2], /^2026-11-13 🚪 Z ubytování na letiště FCO vyraž nejpozději v 4:43.*brzy ráno/);
  assert.match(rows[i + 1], /^2026-11-13 🚌 Z letiště BCN → Barcelona/);
  assert.match(rows[i + 2], /^2026-11-13 🏨 Barcelona · 3 noci/);
  assert.ok(!rows.some((x) => /Přejezd/.test(x)));
  const ev = c.window.Trip.calendarEvents(t).map((e) => e.title);
  assert.equal(ev.filter((x) => /^✈️/.test(x)).length, 3, ev.join('\n'));
  assert.ok(ev.includes('🚪 Vyraž na letiště FCO'));
  assert.ok(!ev.some((x) => /Přejezd/.test(x)));
  const s = render(c, 'summary');
  assert.match(s, /1\. Letenka PRG → FCO/); assert.match(s, /2\. Letenka FCO → BCN/); assert.match(s, /3\. Letenka BCN → PRG/);
  assert.match(s, /https:\/\/air\.example\/FCO-BCN/);
  // plánovač: všechny lety s časy, bez přejezdů mezi místy
  c.S.trips = [];
  c.__els['#sumSave'].onclick();
  const p = c.S.trips[0];
  assert.deepEqual(plain(p.legs.map((l) => `${l.from}-${l.to} ${l.dep}`)), ['PRG-FCO 2026-11-10T10:00', 'FCO-BCN 2026-11-13T07:35', 'BCN-PRG 2026-11-16T18:10']);
  assert.match(p.flight, /^1\. PRG→FCO .*, 2\. FCO→BCN .*, 3\. BCN→PRG .* · samostatné letenky$/);
  assert.match(p.notes, /Trasa: Řím \(3 noci\) → Barcelona \(3 noci\)/);
  assert.equal(p.dest, 'Řím → Barcelona');
  assert.match(p.name, /^Řím → Barcelona 10\.\s?11\./);
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

test('cesta přes víc měst: odlet z druhého letiště téhož města (CIA → FCO) je jen poznámka, z jiného města varování', () => {
  const c = load();
  const t = begin(c);
  t.flight.out = { ...t.flight.out, to: 'CIA' };
  const r = render(c, 'route');
  assert.match(r, /odlétáš z jiného letiště \(FCO\)/);
  assert.doesNotMatch(r, /cestu mezi letišti si naplánuj/);
});

test('cesta přes víc měst: let z jiného města (Řím → let z Neapole) – přejezd na letiště spočítá server, je v průběhu cesty, ceně i „kdy vyrazit“', async () => {
  const c = load();
  const t = begin(c, { mid: [{ ...MID, from: 'NAP' }] });
  t.arrival.mid = [{ from: null, to: t.arrival.mid[0].to }];
  const asked = [];
  c.fetch = async (url, o) => { asked.push([url, JSON.parse(o.body)]); return { ok: true, json: async () => ({ legs: { departure: { km: 225, carMin: 150, transitMin: 75, transitKind: 'rail', fast: true, fareCzk: 620, transitUrl: 'https://maps.example/rom-nap', carUrl: 'https://maps.example/c' } } }) }; };
  assert.match(render(c, 'route'), /počítám cestu na letiště NAP/);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(asked.map(([u, b]) => [u, b.departure, b.bases[0].name, b.transport]), [['api/stayplan', 'NAP', 'Řím', 'transit']]);
  const r = render(c, 'route');
  assert.match(r, /Na letiště NAP: <b>~1 h 15 min vlakem<\/b>/);
  assert.match(r, /~620 Kč\/os\./);
  assert.doesNotMatch(r, /naplánuj/);
  const rows = c.window.Trip.timeline(t).map((x) => `${x[0]} ${x[1]} ${sp(x[2]).replace(/<[^>]+>/g, '')}`);
  assert.ok(rows.some((x) => /^2026-11-13 🚆 Řím → letiště NAP · ~1 h 15 min vlakem \(jízdní řád\)/.test(x)), rows.join('\n'));
  assert.ok(rows.some((x) => /Z ubytování na letiště NAP vyraž nejpozději v 4:20/.test(x)), 'přejezd 75 min + 2 h před odletem 7:35');
  assert.equal(c.window.Trip.costs(t).transfers, 620 * 2);
  // odkaz a uložená cesta přejezd nesou
  assert.equal(c.window.Trip.sanitizeTrip(plain(t)).route.gaps.g0NAP.transitMin, 75);
  // server přejezd nespočítal → varování jako dřív, bez dalších dotazů
  const c2 = load();
  const t2 = begin(c2, { mid: [{ ...MID, from: 'NAP' }] });
  t2.arrival.mid = [{ from: null, to: null }];
  let n = 0;
  c2.fetch = async () => { n++; return { ok: false, status: 503, json: async () => ({ error: 'x' }) }; };
  render(c2, 'route');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.match(render(c2, 'route'), /Další let odlétá z NAP, přiletíš na FCO – cestu mezi letišti si naplánuj/);
  assert.equal(n, 1);
});

test('cesta přes víc měst jen tam (Praha → Řím → Barcelona): poslední město na zvolený počet nocí, bez letu zpět', () => {
  const c = load();
  const { Trip } = c.window;
  assert.equal(Trip.flyOk({ out: OUT, mid: [MID], back: null }, [ROM, BCN]), true);
  const t = begin(c, { mid: [MID], back: null });
  assert.equal(t.flight.back, null);
  assert.deepEqual(plain(t.route.bases.map((b) => [b.name, b.nights])), [['Řím', 3], ['Barcelona', 3]]);
  assert.deepEqual(plain(Trip.baseDates(t)), [{ checkin: '2026-11-10', checkout: '2026-11-13', nights: 3 }, { checkin: '2026-11-13', checkout: '2026-11-16', nights: 3 }]);
  assert.deepEqual(plain(Trip.stayDates(t)), { checkin: '2026-11-10', checkout: '2026-11-16', nights: 6 });
  assert.equal(Trip.baseProgram(t, 1).departureTime, null);
  const r = render(c, 'route');
  assert.match(r, /Kolik nocí zůstaneš v posledním místě \(Barcelona\)\?/);
  assert.doesNotMatch(r, /Let zpět/);
  // 5 nocí v Barceloně: termín posledního místa, konec pobytu i hotel tam
  t.route.bases[1].stay = { mode: 'pick', name: 'Hotel', totalCzk: 3000, checkin: '2026-11-13', checkout: '2026-11-16' };
  c.__els['#owNights'].value = '5';
  c.__els['#owNights'].onchange();
  assert.deepEqual([t.route.bases[1].nights, Trip.baseDates(t)[1].checkout, Trip.stayDates(t).checkout], [5, '2026-11-18', '2026-11-18']);
  assert.equal(t.route.bases[1].stay, null, 'hotel na staré dny pryč');
  const s = render(c, 'summary');
  assert.match(s, /1\. Letenka PRG → FCO/); assert.match(s, /2\. Letenka FCO → BCN/);
  assert.doesNotMatch(s, /3\. Letenka/);
  const back = Trip.sanitizeTrip(plain(t));
  assert.equal(back.flight.mid.length, 1);
  assert.equal(back.route.fixed, 'flights');
});

test('cesta přes víc měst: „✨ Vyber za mě“ vybere v každém místě bez ubytování hotel s nejlepším poměrem', async () => {
  const c = load();
  const t = begin(c);
  const asked = [];
  const hotel = (id, value, total, extra = {}) => ({ id, name: `Hotel ${id}`, value, priceTotalCzk: total, pricePerNightCzk: total / 3, rating: 8.6, provider: 'xotelo', bookUrl: `https://hotel.example/${id}`, lat: 41.9, lon: 12.5, ...extra });
  c.fetch = async (url) => {
    const q = new URLSearchParams(url.split('?')[1]);
    asked.push(q.get('city'));
    const items = q.get('city') === 'Řím'
      // nejvyšší value bez ceny na tvoje dny se nevybere
      ? [hotel('r1', 70, 6000), hotel('r2', 100, 0, { guess: true, nightFromCzk: 1500 }), hotel('r3', 90, 7200)]
      : [hotel('b1', 40, 5000), hotel('b2', 95, 8100)];
    return { ok: true, json: async () => ({ items, providers: [{ name: 'Xotelo', ok: true }], links: [{ id: 'booking', name: 'Booking.com', note: '', url: `https://booking.example/${q.get('city')}` }], query: { nights: 3 } }) };
  };
  const tick = () => new Promise((r) => setImmediate(r));
  const s = render(c, 'stay');
  assert.match(s, /✨ Nechceš vybírat\?/);
  assert.match(s, /V každém místě vyberu hotel s nejlepším poměrem/);
  await tick();
  await c.__els['#stayAuto'].onclick();
  await tick();
  assert.deepEqual(plain(t.route.bases.map((b) => [b.stay.name, b.stay.totalCzk, b.stay.checkin, b.stay.checkout, b.stay.url])), [
    ['Hotel r3', 7200, '2026-11-10', '2026-11-13', 'https://hotel.example/r3'],
    ['Hotel b2', 8100, '2026-11-13', '2026-11-16', 'https://hotel.example/b2'],
  ]);
  // Řím už byl v mezipaměti z kroku – jen jeden dotaz na každé místo
  assert.deepEqual(asked.filter((x) => x === 'Řím').length, 1);
  assert.equal(t.route.bases[1].searchUrl, 'https://booking.example/Barcelona');
  assert.match(c.__toasts.at(-1), /Vybráno: Řím, Barcelona/);
  // vše vybráno: bez nabídky, rovnou dál k autu
  const s2 = render(c, 'stay');
  assert.doesNotMatch(s2, /Nechceš vybírat/);
  assert.match(s2, /✓ Ubytování máš ve všech místech<\/b><small>Celkem 15\s300\sKč/);
  assert.match(s2, /Pokračovat k autu →/);
  assert.equal(c.window.Trip.costs(t).stay, 7200 + 8100);

  // vlastní výběr zůstane, nabídka jen pro zbývající místo; místo bez cen zůstane nevybrané
  const c2 = load();
  const t2 = begin(c2);
  t2.route.bases[1].stay = { mode: 'manual', name: 'U babičky', totalCzk: 3000 };
  c2.fetch = async () => ({ ok: true, json: async () => ({ items: [hotel('x', null, 0)], providers: [{ name: 'Xotelo', ok: true }], links: [], query: { nights: 3 } }) });
  assert.match(render(c2, 'stay'), /V 1 zbývajícím místě vyberu/);
  await tick();
  await c2.__els['#stayAuto'].onclick();
  assert.equal(t2.route.bases[0].stay, null);
  assert.equal(t2.route.bases[1].stay.name, 'U babičky');
  assert.match(c2.__toasts.at(-1), /Ceny hotelů zatím nepřišly/);

  // hotely z TripAdvisoru: volno se ověří – vyprodaný nejlepší se přeskočí, další se vybere s cenou z ověření
  const c3 = load();
  const t3 = begin(c3);
  const checks = [];
  const xo = (id, value, total) => hotel(`xo:g187791-d${id}`, value, total, { provider: 'xotelo' });
  c3.fetch = async (url) => {
    if (String(url).startsWith('api/stays/check?')) {
      const q = new URLSearchParams(url.split('?')[1]);
      checks.push(q.get('hotel'));
      const sold = q.get('hotel') === 'g187791-d1';
      return { ok: true, json: async () => (sold ? { available: false } : { available: true, priceTotalCzk: 6400, pricePerNightCzk: 2133, rates: [], at: 1 }) };
    }
    return { ok: true, json: async () => ({ items: [xo(1, 99, 6000), xo(2, 90, 7000), xo(3, 80, 7500)], providers: [{ name: 'Xotelo', ok: true }], links: [], query: { nights: 3 } }) };
  };
  render(c3, 'stay');
  await tick();
  await c3.__els['#stayAuto'].onclick();
  await tick();
  assert.deepEqual(plain(t3.route.bases.map((b) => [b.stay.name, b.stay.totalCzk])), [['Hotel xo:g187791-d2', 6400], ['Hotel xo:g187791-d2', 6400]]);
  assert.deepEqual(checks, ['g187791-d1', 'g187791-d2', 'g187791-d1', 'g187791-d2'], 'nejvýš do prvního s volnem');
  assert.match(c3.__toasts.at(-1), /Vybráno: Řím, Barcelona · volno ověřeno teď/);
});
