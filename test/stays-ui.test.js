// Krok Ubytování v průvodci (public/js/trip.js přes node:vm, zástupné DOM jako v xotelo.test.js): řazení a filtry
// nabídek, „zdarma storno“ jen u zdrojů, které storno znají, vybraný hotel vidět i mimo filtry, cena „za N nocí“,
// kam vede odkaz karty a pokoje v záložním odkazu na Booking.com.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { rankStays } from '../server/lib/stays.js';
import { stayLinks } from '../server/lib/links.js';

const jsSrc = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' '); // pevné mezery v částkách („4 750 Kč“)
function loadTrip(reply) {
  const ctx = { window: { scrollTo() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(jsSrc('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = jsSrc('app.js').match(/^const (esc|safeUrl|cssUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 7);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = { trips: [] }, __els = {}, __all = {}, __urls = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {}, scrollIntoView() {} });
    var $$ = (s) => __all[s] || [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']'; var toast = () => {};`, ctx, { filename: 'app-helpers.js' });
  ctx.fetch = async (u) => {
    ctx.__urls.push(String(u));
    const body = String(u).startsWith('api/stays?') ? reply(new URLSearchParams(String(u).slice(10))) : { items: [], links: [], providers: [] };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  vm.runInContext(jsSrc('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const leg = (from, to, date, dep, arr) => ({ from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz: 'Europe/Prague', toTz: 'Europe/Rome', carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: 'https://air.example/book' });
const romeTrip = (extra = {}) => ({
  v: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'stay', ground: {}, overland: null, route: null, stay: null, car: null, plan: null,
  flight: { out: leg('PRG', 'FCO', '2026-11-12', '07:00', '09:00'), back: leg('FCO', 'PRG', '2026-11-15', '18:00', '20:00'), flightCzk: 1500, groundCzk: 0, bagCzk: 0 },
  dest: { label: 'Řím', country: 'Itálie', cc: 'IT', lat: 41.8933, lon: 12.4829 }, ...extra,
});
const Q = { city: 'Řím', cityEn: 'Rome', cc: 'IT', country: 'Itálie', checkin: '2026-11-12', checkout: '2026-11-15', nights: 3, adults: 2, children: 0, infants: 0, rooms: 1 };
// 8 nabídek (víc než prvních 6 na obrazovce): [id, Kč/noc, hodnocení, recenzí, km od centra, typ, storno zdarma]
const ROWS = [
  ['h1', 3000, 9.2, 900, 2.5, 'hotel', true], ['h2', 1500, 8.0, 300, 0.6, 'apartmán', false], ['h3', 4500, 9.6, 1500, 1.2, 'hotel', true],
  ['h4', 1000, 7.0, 50, 4.0, 'hostel', null], ['h5', 2200, 8.7, 640, 0.3, 'penzion', true], ['h6', 2600, 8.4, 410, 3.1, 'hotel', false],
  ['h7', 6100, 7.8, 220, 5.2, 'hotel', false], ['h8', 1800, 8.9, 1200, 1.9, 'apartmán', true],
];
const hotels = ({ free = true, url = (id) => `https://www.booking.com/searchresults.cs.html?ss=Hotel+${id}%2C+Rome` } = {}) => rankStays(ROWS.map(([id, night, rating, reviews, km, type, fc]) => ({
  id, provider: 'demo', name: `Hotel ${id}`, type, typeLabel: type, stars: null, rating, reviews, address: '', lat: 41.9, lon: 12.49, distanceKm: km, photo: null,
  priceTotalCzk: night * 3, pricePerNightCzk: night, freeCancellation: free ? fc : null, breakfast: null, bookUrl: url(id), bookSponsored: false,
})));
const replyOf = (items) => () => ({ query: Q, providers: [{ id: 'demo', name: 'Demo', ok: true, count: items.length, ms: 1 }], items, links: stayLinks(Q) });
const html = (c) => sp(c.__els['#stayBody'].innerHTML);
const names = (c) => [...html(c).matchAll(/<div class="st-name">Hotel (h\d) /g)].map((m) => m[1]);
async function open(c, t) {
  c.S.trip = t;
  c.window.Trip.render();
  await tick(); await tick();
}

test('Ubytování: řazení podle poměru, ceny, hodnocení a vzdálenosti – prvních 6, zbytek „Další hotely“', async () => {
  const items = hotels();
  const c = loadTrip(replyOf(items));
  await open(c, romeTrip());
  const byValue = [...items].sort((a, b) => b.value - a.value).map((h) => h.id);
  assert.deepEqual(names(c), byValue.slice(0, 6), 'výchozí řazení = nejlepší poměr ze serveru');
  assert.match(html(c), /id="stayMoreN">▼ Další hotely \(2\)/);
  const sortBy = async (v) => { c.__els['#staySort'].onchange({ target: { value: v } }); return names(c); };
  assert.deepEqual(await sortBy('price'), ['h4', 'h2', 'h8', 'h5', 'h6', 'h1'], 'od nejlevnějšího (celkem za pobyt)');
  assert.deepEqual(await sortBy('dist'), ['h5', 'h2', 'h3', 'h8', 'h1', 'h6'], 'nejblíž centru');
  const rated = await sortBy('rating');
  assert.equal(rated[0], 'h3', 'nejlépe hodnocené (očištěné o počet recenzí)');
  assert.ok(!rated.includes('h4'), 'hostel s 50 recenzemi a 7,0 až na konci');
  // max. cena za noc + typ
  c.__els['#stayMax'].onchange({ target: { value: '2000' } });
  assert.deepEqual(names(c).sort(), ['h2', 'h4', 'h8']);
  c.__els['#stayType'].onchange({ target: { value: 'apartmán' } });
  assert.deepEqual(names(c).sort(), ['h2', 'h8']);
  assert.match(html(c), /2 z 8 nabídek/);
});

test('Ubytování: „zdarma storno“ jen u zdroje, který storno zná; zapamatovaný filtr jinde nic neskryje; Zrušit filtry ho vypne', async () => {
  let items = hotels();
  const c = loadTrip(() => replyOf(items)());
  const t = romeTrip();
  await open(c, t);
  assert.match(html(c), /<button type="button" class="chip st-free" id="stayFree" aria-pressed="false">zdarma storno<\/button>8 z 8 nabídek/);
  c.__els['#stayFree'].onclick();
  assert.deepEqual(names(c).sort(), ['h1', 'h3', 'h5', 'h8'], 'jen se stornem zdarma (ne false, ne neznámé)');
  assert.match(html(c), /class="chip st-free accent" id="stayFree" aria-pressed="true">✓ zdarma storno<\/button>4 z 8 nabídek/);
  // nic neodpovídá → Zrušit filtry vypne i storno
  c.__els['#stayType'].onchange({ target: { value: 'hostel' } });
  assert.deepEqual(names(c), []);
  assert.match(html(c), /Filtrům nic neodpovídá\. Uvolni hodnocení, max\. cenu, typ ubytování nebo storno zdarma\./);
  c.__els['#stayClear'].onclick();
  assert.equal(names(c).length, 6);
  assert.match(html(c), /aria-pressed="false">zdarma storno/);
  // jiný termín, zdroj storno nezná (TripAdvisor): filtr zapnutý dřív nic neskryje a přepínač tu není
  c.__els['#stayFree'].onclick();
  items = hotels({ free: false });
  t.flight.back = leg('FCO', 'PRG', '2026-11-16', '18:00', '20:00');
  await open(c, t);
  assert.equal(c.__urls.filter((u) => u.startsWith('api/stays?')).length, 2, 'nový dotaz na nový termín');
  assert.ok(!html(c).includes('stayFree'), 'bez přepínače');
  assert.match(html(c), /8 z 8 nabídek/);
});

test('Ubytování: vybraný hotel je vidět i mimo filtry a prvních 6 (nahoře, ✓ Vybráno); prázdný výsledek filtrů s ním řekne proč', async () => {
  const items = hotels();
  const c = loadTrip(replyOf(items));
  const t = romeTrip({ stay: { mode: 'pick', id: 'h7', name: 'Hotel h7', totalCzk: 18300, url: 'https://www.booking.com/x' } });
  await open(c, t);
  // h7 (nejdražší, 7,8) je podle poměru mezi posledními – mimo prvních 6
  assert.equal(names(c)[0], 'h7');
  assert.match(html(c), /<div class="stay chosen">[\s\S]*?Hotel h7 [\s\S]*?✓ Vybráno/);
  assert.equal(names(c).length, 7);
  assert.match(html(c), /id="stayMoreN">▼ Další hotely \(2\)/, 'počet dalších beze změny');
  // hodnocení 9+ ho skryje → zůstane nahoře
  c.__all['#stayMin button'] = [{ dataset: { v: '9' } }];
  c.window.Trip.render(); await tick(); await tick();
  c.__all['#stayMin button'][0].onclick();
  assert.deepEqual(names(c), ['h7', 'h1', 'h3'], 'vybraný nahoře, pak 9+ podle poměru');
  assert.match(html(c), /2 z 8 nabídek/);
  // nic neodpovídá filtrům: vybraný hotel a vysvětlení s Zrušit filtry
  c.__els['#stayMax'].onchange({ target: { value: '1000' } });
  assert.deepEqual(names(c), ['h7']);
  assert.match(html(c), /Filtrům nic neodpovídá/);
  // vybraný v prvních 6 → na svém místě, ne dvakrát
  t.stay = { mode: 'pick', id: 'h2', name: 'Hotel h2', totalCzk: 4500 };
  c.__els['#stayClear'].onclick();
  c.__els['#staySort'].onchange({ target: { value: 'price' } });
  assert.deepEqual(names(c), ['h4', 'h2', 'h8', 'h5', 'h6', 'h1']);
});

test('karta hotelu: cena „za 3 noci · …/noc“, odkaz říká kam vede (Booking.com i přes tp.media, jinak rezervovat)', async () => {
  const urls = { h1: 'https://www.booking.com/searchresults.cs.html?ss=Hotel+h1%2C+Rome', h2: `https://tp.media/r?${new URLSearchParams({ campaign_id: '84', marker: '1', p: '2076', trs: '1', sub_id: 'atlas', u: 'https://www.booking.com/searchresults.cs.html?ss=x' })}` };
  const items = hotels({ url: (id) => urls[id] || `https://atlas.nuitee.link/hotels/${id}` });
  const c = loadTrip(replyOf(items));
  await open(c, romeTrip());
  c.__els['#staySort'].onchange({ target: { value: 'price' } }); // h4 h2 h8 h5 h6 h1
  const card = (id) => html(c).split('<div class="stay ').find((x) => x.includes(`<div class="st-name">Hotel ${id} `));
  // „za 3 noci · 1 000 Kč/noc“ (na telefonu za noc na dalším řádku – oddělovač a cena za noc ve vlastních značkách)
  assert.match(card('h4'), /<div class="pp">3 000 Kč<\/div><div class="faint">za 3 noci<span class="st-sep"> · <\/span><span class="st-pn">1 000 Kč\/noc<\/span><\/div>/);
  assert.match(card('h1'), /title="Hotel na Booking\.com na tvoje dny a hosty – cenu a volno ověř tam">Booking\.com ↗<\/a>/);
  assert.match(card('h2'), />Booking\.com ↗<\/a>/, 'partnerský odkaz na Booking.com');
  assert.match(card('h4'), /title="Rezervace hotelu na tvoje dny">rezervovat ↗<\/a>/);
  assert.ok(!html(c).includes('detail ↗'));
});

// Hotel z TripAdvisoru (Xotelo) jako z mapHotel: ceny u webů s odkazy, nejlevnější první
const xoHotel = (id, rates, extra = {}) => ({
  id, provider: 'xotelo', name: `Hotel ${id}`, type: 'hotel', typeLabel: 'hotel', stars: null, rating: 9.2, rating5: 4.6, reviews: 1234, address: '', lat: 41.9, lon: 12.49, distanceKm: 1.1,
  photo: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1/x.jpg?w=400&h=-1&s=1', freeCancellation: null, breakfast: null,
  priceTotalCzk: rates[0].totalCzk, pricePerNightCzk: rates[0].perNightCzk, rates, ratesAt: Date.now(), bookUrl: rates[0].url, bookSponsored: false, ...extra,
});
const rate = (name, site, totalCzk) => ({ code: name, name, totalCzk, perNightCzk: totalCzk / 3, tax: false, site, url: site === 'trip' ? `https://www.trip.com/hotels/list?searchWord=${name}` : `https://www.booking.com/x?${name}`, sponsored: false });

test('karta na telefonu: „další weby ▾“ jen když je co schovat (ceny webů, vedlejší odkazy); rozbalí jen svou kartu a zůstane rozbalená po překreslení', async () => {
  const items = rankStays([
    xoHotel('x1', [rate('Trip.com', 'trip', 6000), rate('Booking.com', 'booking', 6300), rate('Vio.com', null, 6400)]),
    ...hotels().filter((h) => h.id === 'h1' || h.id === 'h2'),
  ]);
  const c = loadTrip(replyOf(items));
  await open(c, romeTrip());
  const card = (id) => html(c).split('<div class="stay ').find((x) => x.includes(`<div class="st-name">Hotel ${id} `));
  const x1 = card('x1');
  // fotka líně, v rámečku pevné velikosti (CSS) – ne obrázek na pozadí
  assert.match(x1, /<div class="st-img"><img src="https:\/\/dynamic-media-cdn\.tripadvisor\.com\/[^"]+" alt="" loading="lazy" decoding="async"><\/div>/);
  // hlavní odkaz s nápovědou k Trip.com hned za ním; Booking.com vedlejší (sec), ceny webů v .st-web; přepínač pod cenou
  assert.match(x1, /<span class="st-bk"><a class="linkbtn" href="https:\/\/www\.trip\.com\/[^"]+"[^>]*>Trip\.com ↗<\/a><span class="st-trh">– potvrď Hledat<\/span><\/span><span class="st-bk sec"><a [^>]*>Booking\.com ↗<\/a><\/span>/);
  assert.match(x1, /<div class="st-web"><div class="st-otas">/);
  const i = items.findIndex((h) => h.id === 'x1');
  assert.ok(x1.includes(`<button type="button" class="linkbtn st-webs-t" data-webs="${i}" aria-expanded="false">další weby ▾</button></div>`));
  assert.match(x1, /<div class="st-rate-inline"><b class="ta">4,6\/5<\/b><span class="st-rw"> Výborné<\/span> \(1 234 hodnocení\)<\/div>/);
  // ukázková data: jeden odkaz, žádné ceny webů → bez přepínače
  for (const id of ['h1', 'h2']) assert.ok(!card(id).includes('st-webs-t') && !card(id).includes('st-web'), id);
  // klepnutí: jen tahle karta (bez překreslení), text a aria-expanded; po překreslení (řazení) zůstane rozbalená
  const el = { open: false, classList: { toggle: (k, on) => { assert.equal(k, 'open'); el.open = on; } } };
  const btn = { dataset: { webs: String(i) }, attrs: {}, textContent: '', closest: (s) => (s === '.stay' ? el : null), setAttribute(k, v) { this.attrs[k] = v; } };
  c.__all['[data-webs]'] = [btn];
  c.__els['#staySort'].onchange({ target: { value: 'value' } });
  btn.onclick();
  assert.deepEqual([el.open, btn.attrs['aria-expanded'], btn.textContent], [true, 'true', 'další weby ▴']);
  c.__els['#staySort'].onchange({ target: { value: 'price' } });
  assert.ok(html(c).includes('<div class="stay open">') && card('x1').includes('aria-expanded="true">další weby ▴'));
  btn.onclick();
  assert.deepEqual([el.open, btn.attrs['aria-expanded'], btn.textContent], [false, 'false', 'další weby ▾']);
  c.__els['#staySort'].onchange({ target: { value: 'value' } });
  assert.ok(!html(c).includes(' open"'));
});

test('kompaktní karta na telefonu (trip.css): části karty v mřížce až za pravidly do 1080 px, na počítači a tabletu vše vidět', () => {
  const css = readFileSync(new URL('../public/css/trip.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // mimo @media: obal tlačítek se nepočítá (sloupec ceny jako dřív), přepínač a nápověda za odkazem jen na telefonu
  assert.match(css, /\n\.st-acts\{display:contents\}\n\.st-webs-t,\.st-trh\{display:none\}/);
  const phone = css.indexOf('.st-main,.st-price{display:contents}');
  const head = css.lastIndexOf('@media', phone);
  assert.equal(css.slice(head, css.indexOf('{', head)), '@media(max-width:560px)');
  // pravidla pro 1080 px (.stay se třemi sloupci) jsou dřív – jinak by přebila mřížku telefonu
  assert.ok(css.indexOf('@media(max-width:1080px){') < head && css.indexOf('.stay{grid-template-columns:100px') < head);
  const block = css.slice(head, css.indexOf('\n}', head));
  for (const r of ['.stay:not(.open) .st-web,.stay:not(.open) .st-bk.sec{display:none}', 'grid-template-areas:"img head pp" "tail tail tail" "acts acts acts"', '.st-webs-t{display:inline-flex']) assert.ok(block.includes(r), r);
});

test('záložní odkaz na Booking.com (nabídky se nenačetly, Shrnutí): pokoje po dvou dospělých jako na serveru, děti zvlášť', () => {
  const src = jsSrc('trip.js');
  const line = (name) => src.match(new RegExp(`^\\s*const ${name} = .*$`, 'm'))[0].trim().replace(/^const /, 'var ');
  const ctx = vm.createContext({ URLSearchParams });
  vm.runInContext([line('kidsN'), line('bookingSearch')].join('\n'), ctx);
  const p = (t) => Object.fromEntries(new URL(ctx.bookingSearch('Rome, Italy', '2026-11-12', '2026-11-15', t)).searchParams);
  assert.deepEqual(p({ adults: 2 }), { ss: 'Rome, Italy', checkin: '2026-11-12', checkout: '2026-11-15', group_adults: '2', no_rooms: '1', lang: 'cs', selected_currency: 'CZK' });
  assert.deepEqual([1, 3, 4, 12].map((n) => p({ adults: n }).no_rooms), ['1', '2', '2', '5']);
  const kids = p({ adults: 2, children: 2, infants: 1 });
  assert.deepEqual([kids.group_adults, kids.group_children, kids.no_rooms], ['2', '3', '1'], 'rodina v jednom pokoji');
});
