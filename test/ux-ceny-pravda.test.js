// Průvodce cestou netvrdí o cenách nic, co nemá (public/js/trip.js přes node:vm, zástupný DOM jako v cesta-shrnuti.test.js):
// krok Ubytování bez jediné ceny (čistý režim, „cena na webu“) bez cenových štítků, řazení podle ceny/poměru a filtru
// „do Kč/noc“; součet cesty bez jediné známé ceny bez „0 Kč“ (v hlavičce „Cenu doplníš“, ve Shrnutí „Zatím bez cen“).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load() {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  vm.runInContext(src('searchhelp.js'), ctx, { filename: 'searchhelp.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics, SearchHelp = window.SearchHelp;\n${helpers.join('\n')}
    var S = {}, __els = {}, __all = {};
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = (s) => __all[s] || [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var toast = () => {}; var byIso = {}; var PACK = ['Pas']; var enc = encodeURIComponent;
    window.scrollTo = () => {};`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const sp = (s) => String(s).replace(/[  ]/g, ' ');
const tick = () => new Promise((r) => setImmediate(r));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const leg = (from, to, date, dep, arr, fromTz, toTz) => ({ from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: `https://air.example/${from}-${to}` });
const ROM = { key: 'ROM', id: 'metro:ROM', label: 'Řím (Itálie)', cc: 'IT', country: 'Itálie', lat: 41.9, lon: 12.5 };
// Řím na 4 noci, 2 osoby; price = cena letenky za osobu (0 = vlastní let bez ceny)
function begin(ctx, price = 3000) {
  const out = leg('PRG', 'FCO', day(40), '10:00', '12:00', 'Europe/Prague', 'Europe/Rome');
  const back = leg('FCO', 'PRG', day(44), '18:10', '20:05', 'Europe/Rome', 'Europe/Prague');
  const t = { id: 'x', out, back, flightCzk: price, groundCzk: 0, bagCzk: 0, arrCzk: 0, perPersonCzk: price, totalCzk: price * 2, provider: 'demo-air', combined: false, bookUrl: null, ...(price ? {} : { own: true }) };
  ctx.window.Trip.start({ t, g: { dest: ROM }, result: { origins: [], query: { adults: 2, bags: 'none' }, home: null, arrivals: {} }, at: Date.now() });
  ctx.S.trip.verifiedAt = 1;
  return ctx.S.trip;
}
function render(ctx, step) {
  ctx.S.trip.step = step;
  ctx.window.Trip.render();
  return sp(ctx.__els['#tripStep'].innerHTML);
}
// nabídka bez ceny i hodnocení; badges jako by je poslal server (štítky bez ceny tvrdit nesmí)
const hotel = (id, km, extra = {}) => ({ id, name: `Penzion ${id}`, provider: 'osm', priceTotalCzk: null, pricePerNightCzk: null, value: null, rating: null, distanceKm: km, bookUrl: `https://booking.example/${id}`, lat: 41.9, lon: 12.5, ...extra });
function fakeStays(ctx, items) {
  ctx.fetch = async () => ({ ok: true, json: async () => ({ items: JSON.parse(JSON.stringify(items)), providers: [{ id: 'osm', name: 'OpenStreetMap', ok: true, count: items.length }], links: [{ id: 'booking', name: 'Booking.com', note: '', url: 'https://booking.example/hledat' }], query: { nights: 4, city: 'Řím' } }) });
}
const stayHtml = (c) => sp(c.__els['#stayBody'].innerHTML);
const names = (h) => [...h.matchAll(/<div class="st-name">Penzion (\w+) /g)].map((m) => m[1]);

test('stayPriced, staySorts, staySortOf: bez ceny u všech jen „Nejblíž centru“ (a hodnocení, když ho nabídky mají)', () => {
  const { stayPriced, staySorts, staySortOf } = load().window.Trip;
  const keys = (l) => l.map((o) => o[0]).join(',');
  assert.equal(stayPriced([hotel('a', 1), hotel('b', 2)]), false);
  assert.equal(stayPriced([hotel('a', 1), hotel('b', 2, { priceTotalCzk: 4000 })]), true);
  assert.equal(stayPriced([hotel('a', 1, { nightFromCzk: 900 })]), true, 'běžná cena „od ~…/noc“ je cena');
  assert.equal(keys(staySorts([hotel('a', 1, { priceTotalCzk: 4000 })])), 'value,price,rating,dist', 's cenou beze změny');
  assert.equal(keys(staySorts([hotel('a', 1), hotel('b', null)])), 'dist');
  assert.equal(keys(staySorts([hotel('a', 1, { rating: 8 })])), 'dist,rating');
  assert.equal(keys(staySorts([hotel('a', null)])), '');
  assert.equal(staySortOf('value', staySorts([hotel('a', 1)])), 'dist', 'zapamatovaný poměr bez cen → nejblíž centru');
  assert.equal(staySortOf('rating', staySorts([hotel('a', 1, { rating: 8 })])), 'rating');
  assert.equal(staySortOf('value', []), '', 'nic k řazení → pořadí od poskytovatele');
  assert.equal(staySortOf('price', staySorts([hotel('a', 1, { priceTotalCzk: 4000 })])), 'price');
});

test('krok Ubytování bez jediné ceny: bez cenových štítků, řazení podle ceny, „do Kč/noc“ a „N z N nabídek“, seřazeno od centra', async () => {
  const c = load();
  fakeStays(c, [
    hotel('a', 2.4, { badges: ['best-value', 'cheapest-good', 'cheapest'] }),
    hotel('b', 0.6, { badges: ['top-rated'] }),
    hotel('c', null),
    hotel('d', 1.1),
  ]);
  begin(c);
  const step = render(c, 'stay');
  await tick(); await tick();
  const h = stayHtml(c);
  assert.doesNotMatch(h, /Nejlepší poměr|Nejlevnější|Nejlépe hodnocené/);
  assert.doesNotMatch(h, /id="stayMax"|Kč\/noc/);
  assert.doesNotMatch(h, /nabídek/);
  assert.match(h, /<select id="staySort" aria-label="Řazení ubytování"><option value="dist" selected>📍 Nejblíž centru<\/option><\/select>/);
  assert.deepEqual(names(h), ['b', 'd', 'a', 'c'], 'nejblíž centru, bez vzdálenosti až na konci');
  assert.match(h, /Ceny uvidíš u partnera/);
  // „Ubytování neřeším →“ jen jednou (nahoře), dole až u vybraného ubytování
  assert.equal(step.split('Ubytování neřeším →').length - 1, 1);
  assert.match(step, /id="staySkipTop"/);
  c.__els['#staySkipTop'].onclick();
  assert.equal(c.S.trip.stay.mode, 'skip');
  assert.equal(render(c, 'stay').split('Ubytování neřeším →').length - 1, 1, 'po výběru zůstane jen to dole');
});

test('krok Ubytování: s cenou aspoň u části nabídek se nic nemění (štítky u hotelu s cenou, poměr, „do Kč/noc“, počet)', async () => {
  const c = load();
  fakeStays(c, [
    hotel('a', 2.4, { provider: 'demo', priceTotalCzk: 8000, pricePerNightCzk: 2000, value: 90, rating: 8.5, badges: ['best-value', 'cheapest'] }),
    hotel('b', 0.6, { badges: ['cheapest'] }), // štítek bez ceny ani tady nevykreslí
  ]);
  begin(c);
  render(c, 'stay');
  await tick(); await tick();
  const h = stayHtml(c);
  assert.match(h, /<option value="value" selected>🏆 Nejlepší poměr<\/option>/);
  assert.match(h, /id="stayMax"/);
  assert.match(h, /2 z 2 nabídek/);
  assert.equal(h.split('Nejlevnější</span>').length - 1, 1, '„Nejlevnější“ jen u hotelu s cenou');
  assert.doesNotMatch(h, /Ceny uvidíš u partnera/);
});

test('noCost: součet bez jediné známé ceny', () => {
  const { noCost } = load().window.Trip;
  assert.equal(noCost({ total: 0 }), true);
  assert.equal(noCost({ total: NaN }), true);
  assert.equal(noCost({ total: 1 }), false);
});

test('cesta bez jediné ceny: hlavička „Cenu doplníš“, Shrnutí „Zatím bez cen“ s „Doplnit cenu“ – nikde „0 Kč“', () => {
  const c = load();
  const t = begin(c, 0);
  t.stay = { mode: 'links', name: '', totalCzk: 0 };
  const s = render(c, 'summary');
  const head = sp(c.__els['#tripRoot'].innerHTML).match(/id="thTotal">(.*?)<\/div>\s*<\/div>/s)[1];
  assert.match(head, /Cenu doplníš/);
  assert.doesNotMatch(head, /0 Kč/);
  assert.doesNotMatch(s, /Celkem bez ubytování|<tr class="tot">/);
  assert.match(s, /<tr><td><\/td><td><b>Zatím bez cen<\/b> – doplň cenu letenky nebo ubytování<span class="sum-go"> · <button type="button" class="linkbtn" data-goto="stay">Doplnit cenu →<\/button><\/span><\/td><td><\/td><\/tr>/);
  assert.doesNotMatch(s, /<td>0 Kč<\/td>|Na osobu po položkách/);
  // se známou cenou (vlastní ubytování) zase součet jako dřív
  t.stay = { mode: 'manual', name: 'U známých', totalCzk: 5000 };
  assert.match(render(c, 'summary'), /<tr class="tot"><td><\/td><td>Celkem<\/td><td>5 000 Kč<\/td><\/tr>/);
  assert.match(sp(c.__els['#tripRoot'].innerHTML).match(/id="thTotal">(.*?)<\/div>\s*<\/div>/s)[1], /Celkem zatím<\/div><div class="tt">5 000 Kč/);
});

test('Shrnutí bez jediné ceny: „Doplnit cenu“ jen jednou a bez „Celkem i se vstupními poplatky“ (jen poplatek jako cena cesty)', () => {
  const c = load();
  const t = begin(c, 0);
  // vybrané ubytování bez ceny (Vyber za mě v čistém režimu): „Doplnit cenu →“ už má řádek ubytování
  t.stay = { mode: 'pick', id: 'a', name: 'Penzion a', totalCzk: 0, url: 'https://booking.example/a' };
  const E = { ready: () => true, costs: () => [{ label: 'ESTA', czk: 1000 }], transitCcs: () => [], get: () => null, kind: () => null, over: () => false, checklistHtml: () => '', reminders: () => [], load() {}, whenReady() {} };
  c.window.Entry = E; c.Entry = E;
  const s = render(c, 'summary');
  assert.match(s, /Zatím bez cen/);
  assert.equal(s.split('Doplnit cenu →').length - 1, 1);
  assert.match(s, /ESTA/, 'poplatek sám zůstane');
  assert.doesNotMatch(s, /Celkem i se vstupními poplatky/);
  // se známou cenou zase i součet s poplatky
  t.stay = { mode: 'manual', name: 'U známých', totalCzk: 5000 };
  assert.match(render(c, 'summary'), /Celkem i se vstupními poplatky<\/td><td>6 000 Kč/);
});
