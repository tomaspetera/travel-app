// Svět pro vracejícího se uživatele (public/js/app.js): pod mapou země z proběhlých cest, které na mapě chybí
// (pastMissing), v detailu země nejbližší nadcházející cesta tam (tripTo), „Nová cesta“ místo dřívějšího „Do plánu“
// a „Přidat zemi…“ pod mapou (countryHits, mapAddWire).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const grab = (start, end) => { const a = app.indexOf(start); assert.ok(a >= 0, start); return app.slice(a, app.indexOf(end, a)); };
const plain = (x) => JSON.parse(JSON.stringify(x));

function load(trips, visited = []) {
  const ctx = { S: { trips }, visited: new Set(visited), byIso: { AT: { cs: 'Rakousko' }, IT: { cs: 'Itálie' }, PT: { cs: 'Portugalsko' }, HU: { cs: 'Maďarsko' } }, todayLocal: () => '2026-10-28' };
  vm.createContext(ctx);
  vm.runInContext(`${grab('function tripTo(iso)', 'function openCountry(')}
    ${grab('const pastMissing = ', 'function visitedPrompt(')}
    this.tripTo = tripTo; this.pastMissing = pastMissing;`, ctx);
  return ctx;
}

const TRIPS = [
  { name: 'Lisabon 14.1.', iso: 'PT', start: '2027-01-14', end: '2027-01-18' },
  { name: 'Vídeň na víkend', iso: 'AT', start: '2026-09-18', end: '2026-09-20' },
  { name: 'Řím 30.11.', iso: 'IT', start: '2026-11-30', end: '2026-12-08' },
  { name: 'Řím teď', iso: 'IT', start: '2026-10-26', end: '2026-10-30' },
  { name: 'Podunají', iso: 'AT', isos: ['AT', 'HU'], start: '2026-08-01', end: '2026-08-10' },
  { name: 'Bez data', iso: 'PT' },
];

test('pod mapou: země z proběhlých cest, které na mapě chybí (i více zemí jedné cesty), každá jednou', () => {
  assert.deepEqual(plain(load(TRIPS).pastMissing()), ['AT', 'HU']);
  assert.deepEqual(plain(load(TRIPS, ['AT']).pastMissing()), ['HU'], 'navštívená zmizí');
  assert.deepEqual(plain(load(TRIPS, ['AT', 'HU']).pastMissing()), []);
  assert.deepEqual(plain(load([null, ...TRIPS.slice(0, 1)]).pastMissing()), [], 'nadcházející ne, prázdné místo v seznamu nevadí');
});

test('detail země: nejbližší nadcházející nebo probíhající cesta tam, proběhlá a bez data ne', () => {
  const c = load(TRIPS);
  assert.equal(c.tripTo('PT').t.name, 'Lisabon 14.1.');
  assert.equal(c.tripTo('PT').i, 0);
  assert.equal(c.tripTo('IT').t.name, 'Řím teď', 'probíhající má přednost před pozdější');
  assert.equal(c.tripTo('AT'), null, 'jen proběhlé');
  assert.equal(c.tripTo('HU'), null);
  assert.equal(load([]).tripTo('PT'), null);
});

test('detail země: 🧳 Tvoje cesta otevře cestu jako karta v Mých cestách; „Nová cesta“ místo „Do plánu“', () => {
  const fn = grab('function openCountry(iso)', '\nfunction ');
  assert.match(fn, /const mine = tripTo\(iso\);/);
  assert.match(fn, /\$\{mine \? `<div class="note info cm-trip">🧳 <div>Tvoje cesta: <button type="button" class="linkbtn" id="cmTrip">/);
  assert.match(fn, /if \(t\.wizard\) withMod\('trip', \(\) => Trip\.openSaved\(t\.wizard, t\.tripId\)\); else openTrip\(mine\.i\);/);
  assert.match(fn, /data-cm="plan">\$\{ico\('M12 5v14M5 12h14'\)\} Nová cesta<\/button>/);
  assert.ok(!app.includes('Do plánu</button>'), 'Plánovač už není – tlačítko zakládá cestu v Mých cestách');
});

test('pod mapou: poznámka s klepnutím na zemi → navštívená; bez chybějících zemí skrytá', () => {
  const fn = grab('function refreshStats()', '\n}\n');
  assert.match(fn, /const miss = pastMissing\(\);\s*mt\.hidden = !miss\.length;/);
  assert.match(fn, /data-tvi="\$\{cc\}">\$\{flag\(cc\)\} \$\{esc\(byIso\[cc\]\.cs\)\} ＋<\/button>/);
  assert.match(fn, /setVisited\(cc, true\); toast\('Přidáno: ' \+ byIso\[cc\]\.cs\);/);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<\/div>\s*<div class="note info map-trips" id="mapTrips" hidden><\/div>\s*<div class="map-add">/, 'mezi mapou a statistikami');
  assert.match(readFileSync(new URL('../public/css/atlas.css', import.meta.url), 'utf8'), /\.map-trips\[hidden\]\{display:none\}/, '.note má display:flex');
});

test('Co je nového: Země na mapu napsáním a Svět zná tvoje cesty (nová sada novinek)', () => {
  assert.match(app, /const WHATS_NEW = \[[\s\S]*?\['🔎', 'Země na mapu napsáním',[^\n]*\],\s*\['🗺️', 'Svět zná tvoje cesty',/);
});

const countries = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url), 'utf8'));
function hits(q) {
  const ctx = { COUNTRIES: countries, norm: (x) => (x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() };
  vm.createContext(ctx);
  vm.runInContext(`${grab('function countryHits(q)', '\n// „Přidat zemi…“')}\nthis.countryHits = countryHits;`, ctx);
  return plain(ctx.countryHits(q).map((c) => c.cs));
}

test('Přidat zemi: začátek názvu bez diakritiky, i dalšího slova a anglicky; nejdřív česky začínající, nejvýš 6', () => {
  assert.equal(hits('ital')[0], 'Itálie');
  assert.equal(hits('Itálie')[0], 'Itálie');
  assert.ok(hits('spoj').includes('Spojené státy americké') || hits('spoj').some((n) => /^Spojené státy/.test(n)), JSON.stringify(hits('spoj')));
  assert.ok(hits('státy').some((n) => /Spojené státy/.test(n)), 'druhé slovo');
  assert.ok(hits('germ').includes('Německo'), 'anglicky');
  assert.equal(hits('ma')[0].slice(0, 2), 'Ma', 'česky začínající první');
  assert.ok(hits('a').length <= 6);
  assert.deepEqual(hits(''), []);
  assert.deepEqual(hits('qqq'), []);
  // hovorové názvy
  assert.equal(hits('usa')[0], 'Spojené státy americké');
  assert.equal(hits('velka brit')[0], 'Spojené království');
  assert.equal(hits('Anglie')[0], 'Spojené království');
  assert.equal(hits('holand')[0], 'Nizozemsko');
});

test('Přidat zemi: pole pod mapou, klepnutí / Enter → navštívená, navštívené jen s ✓; zapojené při otevření mapy', () => {
  const fn = grab('function mapAddWire()', '\nfunction mapPopover(');
  assert.match(fn, /`<span class="pill on">✓ \$\{flag\(c\.iso2\)\} \$\{esc\(c\.cs\)\}<\/span>`/);
  assert.match(fn, /data-addiso="\$\{c\.iso2\}">\$\{flag\(c\.iso2\)\} \$\{esc\(c\.cs\)\} ＋<\/button>/);
  assert.match(fn, /const add = iso => \{ setVisited\(iso, true\); toast\('Přidáno: ' \+ byIso\[iso\]\.cs\); inp\.value = ''; paint\(\); \};/);
  assert.match(fn, /const c = countryHits\(inp\.value\)\.find\(x => !visited\.has\(x\.iso2\)\); if \(c\) add\(c\.iso2\);/);
  assert.match(app, /async function initMap\(\) \{\s*refreshStats\(\); mapAddWire\(\);/);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="mapTrips" hidden><\/div>\s*<div class="map-add"><input class="input" id="mapAdd" type="search" placeholder="🔎 Přidat zemi, kde jsi byl\/a…" aria-label="Přidat navštívenou zemi"/);
});

test('počítač: poznámka „Z proběhlých cest“ jen na šířku obsahu, bez čipu procent v mapě (karta Procestováno je pod mapou)', () => {
  const css = readFileSync(new URL('../public/css/desktop-explore.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('@media (min-width:1024px){'), css.indexOf('@media (min-width:1024px) and (max-width:1279px)'));
  assert.match(block, /\.map-layout>\.map-trips\{justify-self:start\}/);
  assert.match(block, /\.map-chip\{display:none\}/);
  assert.match(block, /\.map-add\{max-width:560px\}/);
});

test('počasí v okně země: poloha hlavního města z dat (capLL) – i přes staré S.geo; bez capLL jen uložené S.geo, prohlížeč nic negeokóduje', () => {
  const ctx = { S: { geo: { CR: { lat: 37.34, lon: -121.89 } } } };
  vm.createContext(ctx);
  vm.runInContext(`${grab('const capitalOf = ', '\nasync function loadWeather(')}\nthis.capitalOf = capitalOf;`, ctx);
  assert.deepEqual(plain(ctx.capitalOf({ iso2: 'CR', cap: 'San José', capLL: [9.93, -84.08] })), { lat: 9.93, lon: -84.08 }, 'ne San José v Kalifornii z uloženého S.geo');
  // starší countries.json z mezipaměti bez capLL: jen uložená poloha – geokódování z prohlížeče (Open-Meteo) už není
  assert.deepEqual(plain(ctx.capitalOf({ iso2: 'CR', cap: 'San José' })), { lat: 37.34, lon: -121.89 });
  assert.equal(ctx.capitalOf({ iso2: 'SC', cap: 'Victoria' }), null);
  assert.doesNotMatch(app, /open-meteo\.com/, 'počasí jde přes server (api/weather)');
  assert.match(app, /fetch\(`api\/weather\?pts=\$\{\(\+g\.lat\)\.toFixed\(2\)\},\$\{\(\+g\.lon\)\.toFixed\(2\)\}`/);
});

test('detail země Česko: bez „Najít lety sem“ (domov), hlavní je 🌍 Objevuj celou zemi; jiné země beze změny', () => {
  const fn = grab('function openCountry(iso)', '\nfunction ');
  assert.match(fn, /\$\{iso === 'CZ' \? '' : `<button class="btn primary" data-cm="search">/);
  assert.match(fn, /`<button class="btn\$\{iso === 'CZ' \? ' primary' : ''\}" data-cm="explore">\$\{ikona\('kompas'\)\} Objevuj celou zemi<\/button>`/);
  assert.match(app, /\$\$\('#modal \[data-cm\]'\)\.forEach\(b => \{ b\.onclick = \(\) => cmActs\[b\.dataset\.cm\]\(\); \}\);/, 'obsluha jen existujících tlačítek');
});

test('Co je nového: nahoře Letsi Plus a Mám letenku, pod nimi soukromí, aktualizace plánu od kamaráda, úprava cesty a hledání větou', () => {
  assert.match(app, /const WN_ID = '2026-11-26c';\s*const WHATS_NEW = \[\s*\['✨', 'ATLAS je teď Letsi',[^\n]*\],\s*\['🤝', 'Pomáhat se zlepšováním',[^\n]*\],\s*\['⭐', 'Letsi Plus', 'podívej se, co zůstane zdarma a co chystáme navíc – a řekni nám, kolik by ti stálo za to\.[^\n]*\],\s*\['✈️', 'Letenku už máš\?',[^\n]*\],\s*\['🔒', 'Soukromí', 'počítám jen souhrnné denní počty, žádné sledování jednotlivců, pokud sám nezapneš Pomáhat se zlepšováním\.[^\n]*\],\s*\['🔄', 'Upravený plán od kamaráda bez kopií',[^\n]*🔄 Aktualizovat moji cestu[^\n]*\],\s*\['✏️', 'Cestu upravíš i po uložení',[^\n]*✏️ Upravit název a termín[^\n]*\],\s*\['✨', 'Hledání větou rozumí víc',[^\n]*Vánoce a Silvestr[^\n]*Den boje za svobodu[^\n]*s dětmi 5 a 8 let[^\n]*\],\s*\['🔎', 'Země na mapu napsáním',/);
});
