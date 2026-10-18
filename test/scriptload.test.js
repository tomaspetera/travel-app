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

test('skripty z index.html se načtou bez chyby (pořadí jako v prohlížeči)', () => {
  const order = [...read('index.html').matchAll(/<script src="js\/([a-z0-9]+\.js)"/g)].map((m) => m[1]);
  assert.ok(order.length >= 15 && order.includes('flights.js') && order.includes('trip.js'), order.join(', '));
  const base = { console, URLSearchParams, TextEncoder, TextDecoder, Date, Math, JSON, Set, Map, WeakMap, Promise, Intl, Number, String, Array, Object, RegExp, Error, Symbol, encodeURIComponent, decodeURIComponent, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  const ctx = new Proxy(base, { has: () => true, get: (t, k) => (k in t ? t[k] : dummy()) });
  vm.createContext(ctx);
  ctx.window = ctx;
  for (const f of order) assert.doesNotThrow(() => vm.runInContext(read(`js/${f}`), ctx, { filename: f }), f);
});
