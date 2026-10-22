// „⚡ Poskládej celou cestu za mě“ v kroku Let (public/js/trip.js): výchozí volby všech kroků jedním klepnutím –
// jedno místo (postavená trasa zůstane), ubytování jako „Vyber za mě“, bez auta, program jako v kroku Program a Shrnutí.
// Volby uživatele zůstanou; ubytování se nenajde → stop v kroku Ubytování. Ubytování i program se tu nahrazují (fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load() {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = {}, __els = {}, __all = {}, __toasts = [], __go = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = (s) => __all[s] || [];
    var go = (v) => { __go.push(v); }; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var toast = (msg) => { __toasts.push(msg); }; var byIso = {}; var PACK = ['Pas']; var enc = encodeURIComponent;
    window.scrollTo = () => {};`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const tick = () => new Promise((r) => setImmediate(r));
const leg = (from, to, date, dep, arr, fromTz = 'Europe/Rome', toTz = 'Europe/Rome') => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: `https://air.example/${from}-${to}`,
});
const ROM = { key: 'ROM', id: 'metro:ROM', label: 'Řím (Itálie)', cc: 'IT', country: 'Itálie', lat: 41.9, lon: 12.5 };
const BCN = { key: 'BCN', id: 'ap:BCN', label: 'Barcelona', cc: 'ES', country: 'Španělsko', lat: 41.39, lon: 2.17 };
const OUT = leg('PRG', 'FCO', '2026-11-10', '10:00', '12:00', 'Europe/Prague');
const MID = leg('FCO', 'BCN', '2026-11-13', '07:35', '09:20', 'Europe/Rome', 'Europe/Madrid');
const BACK = leg('FCO', 'PRG', '2026-11-14', '18:10', '20:05', 'Europe/Rome', 'Europe/Prague');
const BACK_BCN = leg('BCN', 'PRG', '2026-11-16', '18:10', '20:35', 'Europe/Madrid', 'Europe/Prague');
// Řím na 4 noci (jedno místo), nebo Řím → Barcelona letadlem (trasa podle letů = postavená trasa přes víc míst)
function begin(ctx, { multi = false } = {}) {
  const t = { id: 'x', out: OUT, ...(multi ? { mid: [MID], back: BACK_BCN } : { back: BACK }), flightCzk: 3000, groundCzk: 200, bagCzk: 0, arrCzk: 0, perPersonCzk: 3200, totalCzk: 6400, provider: 'demo-air', combined: false, bookUrl: null, deal: { level: 'normal' } };
  ctx.window.Trip.start({ t, g: { dest: ROM }, result: { origins: [], query: { adults: 2, bags: 'none' }, home: null, arrivals: {} }, ...(multi ? { stops: [ROM, BCN] } : {}) });
  ctx.S.trip.verifiedAt = 1; // bez živého ověření ceny letu
  return ctx.S.trip;
}
function render(ctx, step) {
  ctx.S.trip.step = step;
  ctx.window.Trip.render();
  return sp(ctx.__els['#tripStep'].innerHTML);
}
const hotel = (id, value, total, extra = {}) => ({ id, name: `Hotel ${id}`, value, priceTotalCzk: total, pricePerNightCzk: total / 4, rating: 8.6, provider: 'booking', bookUrl: `https://hotel.example/${id}`, lat: 41.9, lon: 12.5, ...extra });
const DAYS = [{ date: '2026-11-11', items: [{ id: 'p1', name: 'Koloseum', lat: 41.89, lon: 12.49, category: 'sight', visitMin: 90 }] }];
// nahrazené api/stays (podle města), api/itinerary a api/geocode; fail = města, kde nabídky selžou
function fakeFetch(ctx, { fail = [], empty = [] } = {}) {
  const asked = [];
  ctx.fetch = async (url, o) => {
    const path = String(url).split('?')[0];
    asked.push([path, o && o.body ? JSON.parse(o.body) : new URLSearchParams(String(url).split('?')[1] || '').get('city')]);
    if (path === 'api/geocode') return { ok: true, json: async () => ({ items: [{ lat: 41.8933, lon: 12.4829, label: 'Řím', cc: 'IT' }] }) };
    if (path === 'api/itinerary') return { ok: true, json: async () => ({ days: DAYS, spare: [], warnings: [], places: [] }) };
    const city = new URLSearchParams(String(url).split('?')[1]).get('city');
    if (fail.includes(city)) return { ok: false, status: 503, json: async () => ({ error: 'Ubytování teď nejde načíst' }) };
    const items = empty.includes(city) ? [hotel('x', null, 0)] : city === 'Řím' ? [hotel('r1', 70, 6000), hotel('r2', 95, 8400), hotel('r3', 99, 0, { guess: true, nightFromCzk: 1500 })] : [hotel('b1', 40, 5000), hotel('b2', 95, 8100)];
    return { ok: true, json: async () => ({ items, providers: [{ name: 'Booking', ok: true }], links: [{ id: 'booking', name: 'Booking.com', note: '', url: `https://booking.example/${city}` }], query: { nights: 4 } }) };
  };
  return asked;
}

test('⚡ Poskládej: jedno místo – hotel s nejlepším poměrem, bez auta, program a Shrnutí s poznámkou; krok Program sestavený program použije', async () => {
  const c = load();
  const t = begin(c);
  const asked = fakeFetch(c);
  const s = render(c, 'flight');
  assert.match(s, /id="tfAuto">⚡ Poskládej celou cestu za mě<\/button>/);
  assert.ok(s.indexOf('id="tfNext"') < s.indexOf('id="tfAuto"'), 'hlavní „Pokračovat“ zůstává první');
  await c.__els['#tfAuto'].onclick();
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(t.step, 'summary');
  assert.deepEqual(plain([t.stay.mode, t.stay.name, t.stay.totalCzk, t.stay.url]), ['pick', 'Hotel r2', 8400, 'https://hotel.example/r2'], 'nejvyšší poměr s cenou na tvoje dny');
  assert.deepEqual(plain(t.car), { mode: 'skip', totalCzk: 0 });
  assert.deepEqual(plain(t.plan.days), DAYS);
  // program jako v kroku Program: termín a časy z letů, střed kolem hotelu (do 3 km od středu města)
  const it = asked.find((a) => a[0] === 'api/itinerary')[1];
  assert.deepEqual([it.start, it.end, it.arrivalTime, it.departureTime, it.lat, it.lon, it.pace], ['2026-11-10', '2026-11-14', '12:00', '18:10', 41.9, 12.5, 'normal']);
  const sum = sp(c.__els['#tripStep'].innerHTML);
  assert.match(sum, /⚡ <div>Poskládáno automaticky – kterýkoli krok můžeš upravit\.<\/div>/);
  assert.match(sum, /Ubytování · 4 noci · Hotel r2/);
  assert.match(sum, /Koloseum/, 'program v průběhu cesty');
  assert.equal(c.window.Trip.costs(t).stay, 8400);
  // krok Program dostane uložený program se stejným středem a termínem (plánovač ho jen vykreslí, nesestaví znovu)
  const calls = [];
  c.Places = c.window.Places = { renderPlanner: (host, opts) => calls.push(opts) };
  c.S.trip.step = 'program'; c.window.Trip.render();
  for (let i = 0; i < 3; i++) await tick();
  assert.doesNotMatch(sp(c.__els['#tripStep'].innerHTML), /Poskládáno automaticky/, 'poznámka jen ve Shrnutí');
  const o = calls.at(-1);
  assert.equal(o.plan, t.plan);
  assert.deepEqual([o.lat, o.lon, o.start, o.end, o.arrivalTime, o.departureTime], [t.plan.center.lat, t.plan.center.lon, t.plan.span.start, t.plan.span.end, t.plan.span.arrivalTime, t.plan.span.departureTime]);
});

test('⚡ Poskládej: co už uživatel vybral, zůstane (ubytování, auto, program); rozdělaná trasa s jedním místem = jedno místo', async () => {
  const c = load();
  const t = begin(c);
  const asked = fakeFetch(c);
  t.stay = { mode: 'manual', name: 'U babičky', totalCzk: 3000 };
  t.car = { mode: 'manual', totalCzk: 4500, pickup: 'FCO', dropoff: 'FCO', from: '2026-11-10T12:45', to: '2026-11-14T16:10', age: 30 };
  t.route = { mode: 'multi', transport: 'car', bases: [{ name: 'Řím', lat: 41.9, lon: 12.5, nights: 4 }], transfers: [], legs: {}, exclude: [], candidates: [], notes: [] };
  render(c, 'flight');
  await c.__els['#tfAuto'].onclick();
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(t.step, 'summary');
  assert.equal(t.route.mode, 'single');
  assert.deepEqual(plain(t.stay), { mode: 'manual', name: 'U babičky', totalCzk: 3000 });
  assert.equal(t.car.mode, 'manual');
  assert.equal(t.car.totalCzk, 4500);
  assert.ok(!asked.some((a) => a[0] === 'api/stays'), 'ubytování se nehledá');
  // platný program zůstane, nesestavuje se znovu
  const before = asked.filter((a) => a[0] === 'api/itinerary').length;
  t.step = 'flight';
  await c.window.Trip.render();
  await c.__els['#tfAuto'].onclick();
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(asked.filter((a) => a[0] === 'api/itinerary').length, before);
  assert.equal(t.step, 'summary');
});

test('⚡ Poskládej: ubytování selže nebo nic s cenou nenajde → stop v kroku Ubytování s hláškou, auto ani program se nevyberou', async () => {
  for (const [opt, msg] of [[{ fail: ['Řím'] }, /Ubytování s cenou se nepodařilo najít – vyber ho prosím ručně, nebo to zkus za chvíli\./], [{ empty: ['Řím'] }, /Ubytování s cenou se nepodařilo najít/]]) {
    const c = load();
    const t = begin(c);
    const asked = fakeFetch(c, opt);
    render(c, 'flight');
    await c.__els['#tfAuto'].onclick();
    for (let i = 0; i < 4; i++) await tick();
    assert.equal(t.step, 'stay');
    assert.equal(t.stay, null);
    assert.equal(t.car, null, 'auto zůstane nevybrané');
    assert.equal(t.plan, null);
    assert.ok(!asked.some((a) => a[0] === 'api/itinerary'));
    const s = sp(c.__els['#tripStep'].innerHTML);
    assert.match(s, /class="note warn auto-note" id="autoNote">⚠️ <div>/);
    assert.match(s, msg);
    // tlačítko v kroku Let zase jde zmáčknout
    const f = render(c, 'flight');
    assert.match(f, /id="tfAuto">⚡ Poskládej/);
    assert.doesNotMatch(f, /autoNote/);
  }
});

test('⚡ Poskládej: trasa přes víc míst zůstane – ubytování přes „Vyber za mě“ v každém místě, program pro každé místo', async () => {
  const c = load();
  const t = begin(c, { multi: true });
  const asked = fakeFetch(c);
  const s = render(c, 'flight');
  assert.match(s, /program na místě – trasa zůstane/);
  await c.__els['#tfAuto'].onclick();
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(t.step, 'summary');
  assert.equal(t.route.mode, 'multi');
  assert.deepEqual(plain(t.route.bases.map((b) => [b.name, b.stay.name, b.stay.checkin, b.stay.checkout])), [
    ['Řím', 'Hotel r2', '2026-11-10', '2026-11-13'],
    ['Barcelona', 'Hotel b2', '2026-11-13', '2026-11-16'],
  ]);
  assert.deepEqual(plain(t.car), { mode: 'skip', totalCzk: 0 });
  assert.deepEqual(plain(t.route.bases.map((b) => b.plan && b.plan.days.length)), [1, 1]);
  assert.deepEqual(asked.filter((a) => a[0] === 'api/itinerary').map((a) => [a[1].start, a[1].end]), [['2026-11-10', '2026-11-13'], ['2026-11-13', '2026-11-16']]);
  assert.match(sp(c.__els['#tripStep'].innerHTML), /Poskládáno automaticky/);
});

test('⚡ Poskládej: trasa – v jednom místě ubytování nejde → stop na tom místě, vybrané hotely a vlastní volba zůstanou', async () => {
  const c = load();
  const t = begin(c, { multi: true });
  fakeFetch(c, { fail: ['Barcelona'] });
  render(c, 'flight');
  await c.__els['#tfAuto'].onclick();
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(t.step, 'stay');
  assert.equal(t.route.bases[0].stay.name, 'Hotel r2', 'co je hotové, zůstane');
  assert.equal(t.route.bases[1].stay, null);
  assert.equal(t.car, null);
  const s = sp(c.__els['#tripStep'].innerHTML);
  assert.match(s, /⚠️ <div>Vybráno: Řím\. Barcelona: ubytování s cenou jsem nenašel/);
  assert.match(s, /<h3 style="font-size:15.5px">2\. Barcelona<\/h3>/, 'otevřené místo bez ubytování');

  // vlastní ubytování v Římě zůstane, hledá se jen Barcelona
  const c2 = load();
  const t2 = begin(c2, { multi: true });
  const asked = fakeFetch(c2);
  t2.route.bases[0].stay = { mode: 'manual', name: 'U babičky', totalCzk: 3000, checkin: '2026-11-10', checkout: '2026-11-13' };
  render(c2, 'flight');
  await c2.__els['#tfAuto'].onclick();
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(t2.step, 'summary');
  assert.deepEqual(plain(t2.route.bases.map((b) => b.stay.name)), ['U babičky', 'Hotel b2']);
  assert.deepEqual(asked.filter((a) => a[0] === 'api/stays').map((a) => a[1]), ['Barcelona']);
});
