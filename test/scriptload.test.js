// Všechny skripty aplikace se v pořadí z index.html načtou bez chyby na nejvyšší úrovni – chytí např. použití
// konstanty před jejím řádkem (TDZ: `let view = { ...freshView() }` nad `const flatPage = …` by Lety vůbec
// nenačetlo, a ostatní testy flights.js celý nespouštějí). Prohlížeč (document, fetch, localStorage…) je atrapa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
// atrapa: libovolná vlastnost i volání vrací zase atrapu (ne Promise – `then` chybí)
const dummy = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : dummy()),
  apply: () => dummy(), construct: () => dummy(),
});

// skripty stránky v pořadí z index.html, pak moduly, které lazy.js načte až po startu (data-later – v prohlížeči se
// spustí po všech skriptech stránky)
const INDEX = read('index.html');
const EAGER = [...INDEX.matchAll(/<script src="js\/([a-z0-9]+\.js)"/g)].map((m) => m[1]);
const LATER = INDEX.match(/<script src="js\/lazy\.js" data-later="([^"]+)"[^>]*><\/script>/)[1].split(' ').map((u) => u.replace(/^js\//, ''));
const BASE = { console, URLSearchParams, TextEncoder, TextDecoder, Date, Math, JSON, Set, Map, WeakMap, Promise, Intl, Number, String, Array, Object, RegExp, Error, Symbol, encodeURIComponent, decodeURIComponent, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };

test('skripty z index.html se načtou bez chyby (pořadí jako v prohlížeči)', () => {
  const order = [...EAGER, ...LATER];
  assert.ok(order.length >= 15 && order.includes('flights.js') && order.includes('trip.js'), order.join(', '));
  const ctx = new Proxy({ ...BASE }, { has: () => true, get: (t, k) => (k in t ? t[k] : dummy()) });
  vm.createContext(ctx);
  ctx.window = ctx;
  for (const f of order) assert.doesNotThrow(() => vm.runInContext(read(`js/${f}`), ctx, { filename: f }), f);
});

test('skripty stránky se načtou i bez odložených modulů (průvodce, Objevuj, Před cestou ještě nejsou – lazy.js)', () => {
  assert.deepEqual(LATER, ['sharecard.js', 'pretrip.js', 'places.js', 'trip.js']);
  // Trip, Places, PreTrip a ShareCard při načtení skriptů stránky neexistují: `window.Trip && …` projde, `Trip.x` na nejvyšší
  // úrovni skriptu by spadlo (TypeError)
  const gone = new Set(['Trip', 'Places', 'PreTrip', 'ShareCard']);
  const ctx = new Proxy({ ...BASE }, { has: () => true, get: (t, k) => (k in t ? t[k] : gone.has(k) ? undefined : dummy()) });
  vm.createContext(ctx);
  ctx.window = ctx;
  for (const f of EAGER) {
    assert.ok(!LATER.includes(f), `${f}: odložený modul se nesmí načítat i se stránkou`);
    assert.doesNotThrow(() => vm.runInContext(read(`js/${f}`), ctx, { filename: f }), f);
  }
  for (const g of gone) assert.equal(ctx[g], undefined, `${g} vznikl až s odloženým modulem`);
});
