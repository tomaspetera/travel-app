// Drobnosti z UX kontroly před spuštěním: pevná spodní lišta (U35), obecný seznam balení bez rad závislých na zemi
// (U30), první ukázka ✨ Zkus napsat a řádek kukátka bez bubliny. Klasické skripty přes node:vm (jako dalsi-pocitac).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const appJs = read('public/js/app.js');

test('spodní lišta: pevně Přehled · Lety · Cesty · Objevuj · Další, i když uživatel nejvíc otevírá Svět a Doporučení', () => {
  const src = appJs.slice(appJs.indexOf('const NAV = ['), appJs.indexOf('/** ⋯ Další:'));
  const els = {};
  const ctx = {
    S: { navUse: { world: 99, recommend: 99, flights: 0, trip: 0, explore: 0 } }, // přeskládaná lišta z dřívějška
    $: (s) => (els[s] = els[s] || {}), $$: () => [], WORLD_VIEWS: ['map', 'countries'], lastWorld: 'map',
    go() {}, openMore() {}, save() {},
  };
  vm.createContext(ctx);
  vm.runInContext(`${src}\nbuildNav();`, ctx);
  const order = [...els['#mobileNav'].innerHTML.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(order, ['Přehled', 'Lety', 'Cesty', 'Objevuj', 'Další']);
  // počítání otevření zůstává (tipy na Přehledu), lištu ale neřadí
  assert.match(src, /function navCount\(v\)/);
  // ⋯ Další ani novinky už neslibují, že se lišta sama seřadí
  assert.doesNotMatch(appJs, /samy seřadí|otevíráš nejčastěji/);
});

test('obecný seznam balení: bez adaptéru a hotovosti v místní měně (odporovaly radám o zásuvkách a měně podle země)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${read('public/js/data.js')}\nthis.PACK = PACK;`, ctx);
  const pack = [...ctx.PACK];
  assert.ok(pack.includes('Pas / OP') && pack.includes('Cestovní pojištění'));
  assert.deepEqual(pack.filter((x) => /adaptér|místní měně/i.test(x)), []);
});

test('✨ Zkus napsat: první ukázka „Barcelona na víkend v březnu“ – konkrétní místo, víkend a měsíc', () => {
  const fl = read('public/js/flights.js');
  const src = fl.slice(fl.indexOf('const homeWord = '), fl.indexOf('function paintSmartTry()'));
  const ctx = { S: {}, MNS_IN: ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'] };
  vm.createContext(ctx);
  vm.runInContext(`${src}; this.tryList = tryList;`, ctx);
  for (const t of ['2026-11-27', '2027-06-10']) assert.equal(ctx.tryList(t)[0], 'Barcelona na víkend v březnu', t);
  // a chytré hledání jí rozumí: Barcelona, víkend, březen
  const c = { window: {}, console };
  vm.createContext(c);
  vm.runInContext(read('public/js/searchhelp.js'), c);
  vm.runInContext(read('public/js/smart.js'), c);
  const presets = { weekend: { nMin: 1, nMax: 3, out: [4, 5, 6], back: [0, 1] } };
  const r = c.window.Smart.parse('Barcelona na víkend v březnu', { today: '2026-11-27', presets, holidays: [], holidayDates: c.window.SearchHelp.holidayDates });
  assert.deepEqual([...r.to], ['Barcelona']);
  assert.equal(r.patch.len, 'weekend');
  assert.equal(r.patch.dFrom, '2027-03-01');
});

test('Najít lety v Letech bez lupy (stejně jako na Přehledu), i po hledání; kukátko bez bubliny schová celý řádek', () => {
  assert.match(read('public/index.html'), /id="doSearch" type="submit">Najít lety<\/button>/);
  assert.doesNotMatch(read('public/js/flights.js'), /🔎 Najít lety/);
  assert.match(read('public/css/kukatko.css'), /^:root\[data-brand="letsi"\] \.kuk-rada:has\(\.kuk-hlas:empty\) \{ display: none; \}$/m);
});
