// 💡 Věděl jsi? na Přehledu (app.js DASH_TIPS / tipPick): výběr tipu jen z uloženého stavu. Celý app.js potřebuje DOM –
// skutečné řádky od DASH_TIPS po tipPick se spustí přes node:vm (akce tlačítek run se nevolají).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const a = APP.indexOf('const tipNext = '), b = APP.indexOf('function renderDashTip(');
assert.ok(a > 0 && b > a, 'app.js: DASH_TIPS a tipPick');
const ctx = vm.createContext({});
vm.runInContext(APP.slice(a, b) + '\nthis.TIPS = DASH_TIPS; this.tipPick = tipPick;', ctx, { filename: 'app-tips.js' });
const { TIPS, tipPick } = ctx;
const IDS = TIPS.map(t => t.id);

const TODAY = '2026-10-22';
const kam = { form: { from: [{ id: 'ap:PRG' }], to: [{ id: 'ap:BCN' }], trip: 'return' }, at: 1 };
// uživatel po prvním hledání do Barcelony: nic dalšího nepoužil
const base = (o = {}) => ({ home: { from: [{ id: 'ap:PRG' }] }, recent: [kam], watch: [], pins: [], trips: [], trip: null, navUse: {}, ...o });
const id = (...args) => (tipPick(...args) || {}).id || null;

test('tipPick: při prvním spuštění (bez domova nebo bez hledání) žádný tip', () => {
  assert.equal(id(base({ home: null }), {}, null, TODAY), null);
  assert.equal(id(base({ home: { from: [] } }), {}, null, TODAY), null);
  assert.equal(id(base({ recent: [] }), {}, null, TODAY), null);
  assert.equal(id(base(), {}, null, TODAY), 'any');
});

test('tipPick: použité funkce se přeskočí (Kamkoliv, hlídání, 📌, ⚡ Cesta, Objevuj)', () => {
  const anyRec = { form: { from: [{ id: 'ap:PRG' }], to: [], trip: 'return' }, at: 2 };
  const s = base({ recent: [kam, anyRec] });
  assert.equal(id(s, {}, null, TODAY), 'watch');
  s.watch = [{ id: 'w1' }];
  assert.equal(id(s, {}, null, TODAY), 'pin');
  s.pins = [{ k: 'x' }];
  assert.equal(id(s, {}, null, TODAY), 'auto');
  s.trips = [{ name: 'Řím', wizard: {} }];
  assert.equal(id(s, {}, null, TODAY), 'explore');
  assert.equal(id(s, { explore: true }, null, TODAY), null, 'Objevuj má uložený stav, Na cestě bez cesty před sebou nedává smysl');
  assert.equal(id({ ...s, navUse: { explore: 2 } }, {}, null, TODAY), null);
  // Víc měst s prázdným cílem není Kamkoliv
  assert.equal(id(base({ recent: [{ form: { to: [], trip: 'multi' } }] }), {}, null, TODAY), 'any');
});

test('tipPick: Na cestě jen s cestou před sebou a bez uložené rezervace', () => {
  const used = { recent: [{ form: { to: [] } }], watch: [1], pins: [1], trip: {} };
  const past = { start: '2026-09-01', end: '2026-09-05' }, soon = { start: '2026-11-10', end: '2026-11-14' };
  assert.equal(id(base({ ...used, trips: [past] }), { explore: true }, null, TODAY), null);
  assert.equal(id(base({ ...used, trips: [past, soon] }), { explore: true }, null, TODAY), 'now');
  // probíhající cesta (začala včera) se počítá
  assert.equal(id(base({ ...used, trips: [{ start: '2026-10-21', end: '2026-10-24' }] }), { explore: true }, null, TODAY), 'now');
  assert.equal(id(base({ ...used, trips: [past, { ...soon, refs: [{ kod: 'ABC123' }] }] }), { explore: true }, null, TODAY), null);
});

test('tipPick: jeden tip denně – týž den týž, po skrytí už žádný; další den další v pořadí, skrytý nikdy', () => {
  const s = base();
  assert.equal(id(s, {}, { day: TODAY, id: 'pin', hid: [] }, TODAY), 'pin');
  assert.equal(id(s, {}, { day: TODAY, id: null, hid: ['any'] }, TODAY), null, 'skrytý dnes – dnes už nic');
  // tip dneška mezitím použit → do zítřka nic
  assert.equal(id(base({ pins: [1] }), {}, { day: TODAY, id: 'pin', hid: [] }, TODAY), null);
  assert.equal(id(s, {}, { day: '2026-10-21', id: 'any', hid: [] }, TODAY), 'watch');
  assert.equal(id(s, {}, { day: '2026-10-21', id: 'watch', hid: ['pin'] }, TODAY), 'auto');
  assert.equal(id(s, {}, { day: '2026-10-21', id: 'explore', hid: [] }, TODAY), 'any', 'za posledním znovu od začátku');
  assert.equal(id(s, {}, { day: '2026-10-21', id: 'any', hid: IDS }, TODAY), null);
  // poškozený zápis v localStorage nevadí
  assert.equal(id(s, {}, 'x', TODAY), 'any');
  assert.equal(id(s, {}, { day: 5, hid: 'x' }, TODAY), 'any');
});

test('TIPS: krátké české texty s tlačítkem', () => {
  assert.deepEqual([...IDS], ['any', 'watch', 'pin', 'auto', 'explore', 'now']);
  for (const t of TIPS) {
    assert.ok(t.h && t.btn && t.ico && typeof t.run === 'function', t.id);
    assert.ok(t.t.length <= 130, `${t.id}: text do 130 znaků (${t.t.length})`);
  }
});
