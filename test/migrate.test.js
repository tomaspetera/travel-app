// Přechod na ceny jen za letenku (pv 2) při načtení uloženého stavu (app.js load / migratePrices / defState). Celý
// app.js potřebuje DOM – funkce jsou skutečné řádky vybrané podle jména, localStorage je náhrada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = .*|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
const plain = (v) => JSON.parse(JSON.stringify(v));
function loadWith(stored) {
  const ctx = { localStorage: { getItem: () => (stored === undefined ? null : JSON.stringify(stored)) } };
  vm.createContext(ctx);
  vm.runInContext(`${pick('LS', 'load', 'migratePrices', 'defState')}\nvar S = load();`, ctx, { filename: 'app-state.js' });
  return plain(ctx.S);
}
const RADAR = { at: 1, items: [{ to: 'LIS', czk: 2400 }] };

test('load: uložený stav ze starší verze (bez pv) – radar pryč, „naposledy prohlížené“ bez cen; s pv 2 beze změny', () => {
  const old = loadWith({ radar: RADAR, viewed: [{ key: 'LIS', czk: 2400 }, 'x'], trips: [{ id: 1 }] });
  assert.deepEqual([old.pv, old.radar, old.viewed, old.trips], [2, null, [{ key: 'LIS', czk: null }, 'x'], [{ id: 1 }]]);
  const cur = loadWith({ pv: 2, radar: RADAR, viewed: [{ key: 'LIS', czk: 2400 }] });
  assert.deepEqual([cur.radar, cur.viewed], [RADAR, [{ key: 'LIS', czk: 2400 }]]);
  assert.equal(loadWith(undefined).pv, 2, 'nový uživatel');
});
