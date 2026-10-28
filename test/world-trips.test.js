// Svět pro vracejícího se uživatele (public/js/app.js): pod mapou země z proběhlých cest, které na mapě chybí
// (pastMissing), v detailu země nejbližší nadcházející cesta tam (tripTo) a „Nová cesta“ místo dřívějšího „Do plánu“.
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
  assert.match(html, /<\/div>\s*<div class="note info map-trips" id="mapTrips" hidden><\/div>\s*<div>/, 'mezi mapou a statistikami');
  assert.match(readFileSync(new URL('../public/css/atlas.css', import.meta.url), 'utf8'), /\.map-trips\[hidden\]\{display:none\}/, '.note má display:flex');
});

test('Co je nového: Svět zná tvoje cesty (nová sada novinek)', () => {
  assert.match(app, /const WN_ID = '2026-10-28a';\s*const WHATS_NEW = \[\s*\['🗺️', 'Svět zná tvoje cesty',/);
});
