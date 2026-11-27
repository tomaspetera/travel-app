// Navazující drobnosti po kontrole (vlna 6): den 1 (Noc) vidět i v tmavém režimu a na tmavé mapě hned po přepnutí,
// tlačítko Vybrat při ověřování volna hlásí čtečce totéž co na obrazovce a odkazy partnerů u hotelu nesou jeho název.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { rankStays } from '../server/lib/stays.js';
import { stayLinks } from '../server/lib/links.js';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

// places.js jako v mapy-objevuj.test.js
const dataset = {};
const ctx = { console, URLSearchParams, setTimeout, clearTimeout, Weather: {}, toast: () => {}, document: { documentElement: { dataset } } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src('app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx);
vm.runInContext('const fmtDate = (d) => d;', ctx);
for (const f of ['smart.js', 'places.js']) vm.runInContext(src(f), ctx, { filename: f });
const { dayCol, dayInk, _t } = ctx.Places;

test('den 1 v kartě (puntík programu, kolečko místa v Trase): barva textu motivu – v tmavém režimu Vápno s číslem Noc', () => {
  Object.assign(dataset, { brand: 'letsi', map: 'light' });
  assert.equal(dayCol(0, undefined, true), 'var(--text)');
  assert.equal(dayInk(dayCol(0, undefined, true)), 'var(--bg)');
  // tmavá mapa karty nemění (ta sledují režim aplikace), mapa dál podle svého stylu
  dataset.map = 'dark';
  assert.equal(dayCol(0, undefined, true), 'var(--text)');
  assert.equal(dayCol(0), '#F3F4F0');
  // ostatní dny i ATLAS beze změny
  assert.equal(dayCol(1, undefined, true), '#D6DE82');
  dataset.brand = 'atlas';
  assert.equal(dayCol(0, undefined, true), '#5b8cff');
  // tokeny, na které den 1 v kartě spoléhá: Noc/Vápno podle režimu
  const css = readFileSync(new URL('../public/css/letsi.css', import.meta.url), 'utf8');
  assert.match(css, /data-theme="light"\]\{[^}]*--bg:#F3F4F0;[^}]*--text:#14161F;/);
  assert.match(css, /data-theme="dark"\]\{[^}]*--bg:#14161F;[^}]*--text:#F3F4F0;/);
  // všechny puntíky dnů v kartách berou barvu motivu
  const placesJs = src('places.js');
  assert.equal((placesJs.match(/<span style="color:\$\{dayCol\(i, DAY_COLORS, true\)\}">●<\/span>/g) || []).length, 3);
  assert.doesNotMatch(placesJs, /<span style="color:\$\{dayCol\(i\)\}">/);
});

// zástupná značka mapy (maplibregl.Marker.getElement)
const mk = (cls, col) => {
  const el = { classList: { contains: (c) => cls.split(' ').includes(c) }, dataset: { col }, style: { background: col, color: '' } };
  return { getElement: () => el, el };
};

test('přepnutí mapy: den 1 se přebarví hned (značky i čáry), střed a ostatní barvy zůstanou', () => {
  Object.assign(dataset, { brand: 'letsi', map: 'dark' });
  const day1 = mk('mk big num', '#14161F'), day2 = mk('mk num', '#D6DE82'), ctr = mk('mk ctr', '#14161F'), st = mk('mk num', '#0ea5e9');
  const ms = { markers: [day1, day2, ctr, st], lines: { features: [{ properties: { color: '#14161F' } }, { properties: { color: '#8E949E' } }] } };
  _t.recolor(ms, true);
  assert.deepEqual([day1.el.style.background, day1.el.style.color, day1.el.dataset.col], ['#F3F4F0', '#14161F', '#F3F4F0']);
  assert.equal(day2.el.style.background, '#D6DE82');
  assert.equal(ctr.el.style.background, '#14161F', 'střed s bílým lemem zůstane Nocí');
  assert.equal(st.el.style.background, '#0ea5e9');
  assert.deepEqual(ms.lines.features.map((f) => f.properties.color), ['#F3F4F0', '#8E949E']);
  // a zpátky na světlou
  _t.recolor(ms, false);
  assert.deepEqual([day1.el.style.background, day1.el.style.color], ['#14161F', '#F3F4F0']);
  assert.equal(ms.lines.features[0].properties.color, '#14161F');
  // ATLAS nic nepřebarvuje; mapa bez čar nespadne
  dataset.brand = 'atlas';
  _t.recolor(ms, true);
  assert.equal(day1.el.style.background, '#14161F');
  dataset.brand = 'letsi';
  _t.recolor({ markers: [], lines: null }, true);
  // retheme přebarví před výměnou stylu (čáry se pak vykreslí z ms.lines), značka si barvu pamatuje v data-col
  assert.match(src('places.js'), /recolor\(ms, dark\);\n\s*ms\.styleReady = false;/);
  assert.match(src('places.js'), /el\.style\.background = pt\.color;\n\s*el\.dataset\.col = pt\.color;/);
});

test('Vybrat při ověřování volna: aria-label „Ověřuji volno: hotel“, potom zpátky', async () => {
  const fn = src('trip.js').match(/ {2}async function checkStay\(d, h, btn\) \{[\s\S]*?\n {2}\}\n/)[0];
  // ariaLabel = odraz atributu aria-label v prohlížeči
  const btn = { innerHTML: 'Vybrat', disabled: false, ariaLabel: 'Vybrat: Hotel Roma' };
  let during = null;
  const c = { URLSearchParams, fetch: async () => { during = { html: btn.innerHTML, aria: btn.ariaLabel, disabled: btn.disabled }; return { ok: true, json: async () => ({ available: true }) }; } };
  vm.createContext(c);
  vm.runInContext(`${fn}\nthis.checkStay = checkStay;`, c);
  const r = await c.checkStay({ params: { checkin: '2026-11-12' } }, { id: 'xo:g1-d2', provider: 'xotelo', name: 'Hotel Roma' }, btn);
  assert.equal(r.available, true);
  assert.deepEqual(during, { html: '<span class="spin"></span> Ověřuji volno…', aria: 'Ověřuji volno: Hotel Roma', disabled: true });
  assert.deepEqual([btn.innerHTML, btn.ariaLabel, btn.disabled], ['Vybrat', 'Vybrat: Hotel Roma', false]);
});

// krok Ubytování v průvodci (zástupné DOM jako stays-ui.test.js)
function loadTrip(reply) {
  const c = { window: { scrollTo() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(c);
  vm.runInContext(src('ics.js'), c, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|cssUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = { trips: [] }, __els = {}, __all = {};
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {}, scrollIntoView() {} });
    var $$ = (s) => __all[s] || [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']'; var toast = () => {};`, c, { filename: 'app-helpers.js' });
  c.fetch = async (u) => {
    const body = String(u).startsWith('api/stays?') ? reply() : { items: [], links: [], providers: [] };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  vm.runInContext(src('trip.js'), c, { filename: 'trip.js' });
  return c;
}
const leg = (from, to, date, dep, arr) => ({ from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz: 'Europe/Prague', toTz: 'Europe/Rome', carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: 'https://air.example/book' });
const Q = { city: 'Řím', cityEn: 'Rome', cc: 'IT', country: 'Itálie', checkin: '2026-11-12', checkout: '2026-11-15', nights: 3, adults: 2, children: 0, infants: 0, rooms: 1 };

test('karta hotelu: odkazy partnerů mají v aria-label název hotelu (i s & v názvu jen jednou escapované)', async () => {
  const items = rankStays([
    { id: 'h1', provider: 'demo', name: 'Hotel Roma & Spa', type: 'hotel', typeLabel: 'hotel', rating: 8.8, reviews: 300, address: '', lat: 41.9, lon: 12.49, distanceKm: 1, photo: null, priceTotalCzk: 9000, pricePerNightCzk: 3000, bookUrl: 'https://www.booking.com/searchresults.cs.html?ss=Hotel+Roma', bookSponsored: false },
    { id: 'xo:g1-d2', provider: 'xotelo', name: 'Albergo Nord', type: 'hotel', typeLabel: 'hotel', rating: 8.1, reviews: 90, address: '', lat: 41.9, lon: 12.49, distanceKm: 2, photo: null, priceTotalCzk: 7500, pricePerNightCzk: 2500, bookUrl: 'https://www.trip.com/hotels/x', bookSponsored: false,
      rates: [{ site: 'trip', name: 'Trip.com', url: 'https://www.trip.com/hotels/x', totalCzk: 7500, perNightCzk: 2500 }, { site: 'booking', name: 'Booking.com', url: 'https://www.booking.com/hotel/x', totalCzk: 7800, perNightCzk: 2600 }] },
  ]);
  const c = loadTrip(() => ({ query: Q, providers: [{ id: 'demo', name: 'Demo', ok: true, count: items.length, ms: 1 }], items, links: stayLinks(Q) }));
  c.S.trip = { v: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'stay', ground: {}, overland: null, route: null, stay: null, car: null, plan: null,
    flight: { out: leg('PRG', 'FCO', '2026-11-12', '07:00', '09:00'), back: leg('FCO', 'PRG', '2026-11-15', '18:00', '20:00'), flightCzk: 1500, groundCzk: 0, bagCzk: 0 },
    dest: { label: 'Řím', country: 'Itálie', cc: 'IT', lat: 41.8933, lon: 12.4829 } };
  c.window.Trip.render();
  await tick(); await tick();
  const html = c.__els['#stayBody'].innerHTML;
  assert.match(html, /<span class="st-bk"><a [^>]*aria-label="Booking\.com: Hotel Roma &amp; Spa">Booking\.com ↗<\/a>/);
  assert.match(html, /<a [^>]*aria-label="Trip\.com: Albergo Nord">Trip\.com ↗<\/a>/);
  assert.match(html, /<span class="st-bk sec"><a [^>]*aria-label="Booking\.com: Albergo Nord">Booking\.com ↗<\/a>/);
  assert.match(html, /aria-label="Vybrat: Hotel Roma &amp; Spa"/);
});
