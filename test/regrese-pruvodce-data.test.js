// Drobnosti z regresní kontroly: poškozený uložený stav a poloha domova (app.js load / fixState / migrateGeo),
// obnova ze zálohy (backup.js parse), fokus po kroku Program (trip.js programStep) a toast pod listem Plus (app.js saveTrip).
// Celý app.js potřebuje DOM – funkce jsou skutečné řádky vybrané podle jména, localStorage je náhrada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const APP = read('public/js/app.js');
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = .*|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
const plain = (v) => JSON.parse(JSON.stringify(v));
function loadWith(stored) {
  const ctx = { localStorage: { getItem: () => JSON.stringify(stored) } };
  vm.createContext(ctx);
  vm.runInContext(`${pick('LS', 'load', 'fixState', 'coarseGeo', 'migrateGeo', 'migratePrices', 'defState')}\nvar S = load();`, ctx, { filename: 'app-state.js' });
  return plain(ctx.S);
}
const GEO = { id: 'geo:50.0877,14.4212|Moje poloha', label: 'Moje poloha' };
const GEO_OK = 'geo:50.09,14.42|Moje poloha';

test('load: prázdná položka v Nedávno, hlídání, odložených nebo v domově nesmaže stav ani nezůstane (start by spadl)', () => {
  const s = loadWith({
    pv: 2, trips: [{ name: 'Řím' }], recent: [null, 'x'], watch: [null, { id: 'w1', form: {} }], pins: [null, { id: 'p1' }],
    home: { from: [null, { id: 'ap:PRG' }, 5], radius: 150 }, form: { from: [null], trip: 'oneway' }, visited: ['PT'],
  });
  assert.deepEqual(s.recent, []);
  assert.deepEqual(s.watch, [{ id: 'w1', form: {} }]);
  assert.deepEqual(s.pins, [{ id: 'p1' }]);
  assert.deepEqual(s.home, { from: [{ id: 'ap:PRG' }], radius: 150 });
  assert.deepEqual(s.form, { from: [], trip: 'oneway' });
  assert.deepEqual([s.trips, s.visited], [[{ name: 'Řím' }], ['PT']], 'ostatní data zůstanou');
  // domov bez from (nebo jako text) se nemění
  assert.deepEqual(loadWith({ pv: 2, home: 'PRG' }).home, 'PRG');
  assert.deepEqual(loadWith({ pv: 2, home: { radius: 100 } }).home, { radius: 100 });
});

test('load: hlídané ceny ze starší verze dostanou polohu domova na ~1 km jako domov a Nedávno', () => {
  const s = loadWith({ pv: 2, watch: [{ id: 'w1', form: { from: [GEO, { id: 'ap:PRG' }] } }, { id: 'w2' }] });
  assert.deepEqual(s.watch[0].form.from.map((p) => p.id), [GEO_OK, 'ap:PRG']);
  assert.deepEqual(s.watch[1], { id: 'w2' });
});

test('záloha a přenos: parse() zaokrouhlí 📍 Moje poloha v domově i v hlídaných cenách (coarseGeo z app.js)', () => {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  // v prohlížeči je coarseGeo globální funkce z app.js (načten před backup.js)
  vm.runInContext(pick('coarseGeo'), ctx, { filename: 'app-geo.js' });
  vm.runInContext(read('public/js/backup.js'), ctx, { filename: 'backup.js' });
  const form = { from: [GEO], to: [], trip: 'return', dFrom: '2026-12-01', dTo: '2026-12-20' };
  const text = JSON.stringify({ app: 'atlas', v: ctx.Backup.V, at: '2026-11-01T10:00:00Z', data: { home: { from: [GEO], radius: 200, adults: 2 }, watch: [{ id: 'w1', label: 'x', form }] } });
  const inc = plain(ctx.Backup.parse(text));
  assert.equal(inc.home.from[0].id, GEO_OK);
  assert.equal(inc.watch[0].form.from[0].id, GEO_OK);
  // bez coarseGeo (vlastní deps) se nic nerozbije, jen zůstane, jak přišlo
  assert.equal(plain(ctx.Backup.parse(text, {})).home.from[0].id, GEO.id);
});

test('průvodce: krok Program (vykreslí se až po čekání) vrátí ztracený fokus na svůj nadpis, bez druhého ohlášení kroku', () => {
  const src = read('public/js/trip.js');
  const body = src.slice(src.indexOf('async function programStep()'), src.indexOf('/* ---------- ⚡ Poskládej'));
  const at = (s) => { const i = body.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('await progOpts(t)') < at('host.innerHTML') && at('host.innerHTML') < at('focusStep()'));
  assert.match(body, /if \(focusLate && document\.activeElement === document\.body\) focusStep\(\);/);
  // jen po přechodu (focusStep nadpis nenašel), ne při otevření cesty na kroku Program – tam by nadpis dostal rámeček
  assert.match(src, /function focusStep\(step\) \{\n    const h = \$\('#tripStep h3'\);\n    focusLate = !h;/);
});

test('nová cesta: toast „Cesta vytvořena“ jen bez otevřeného okna (list Plus s otázkou na cenu ho nemá pod sebou)', () => {
  const body = APP.slice(APP.indexOf('async function saveTrip('), APP.indexOf('/** „Hledat lety“ u cesty v plánovači'));
  assert.match(body, /\{ if \(!\$\('#modalBg'\)\.classList\.contains\('show'\)\) toast\('Cesta vytvořena'\); tripsChanged\(\); return; \}/);
});
