// Tisk cesty z prohlížeče (Ctrl+P / Uložit jako PDF) a náhled Sešitu cesty: seznam věcí a Podrobnosti se tisknou
// rozbalené i bez tlačítka Vytisknout, karta se smí zalomit mezi stránkami (žádná skoro prázdná strana) a Sešit
// čísluje dny od začátku cesty jako Průběh cesty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PT = read('public/js/pretrip.js');

/** Falešný <details>; root.querySelectorAll('details:not([open])') vrátí jen zavřené. */
function fakeRoot(states) {
  const ds = states.map((open) => ({ open }));
  return { ds, querySelectorAll: (sel) => { assert.equal(sel, 'details:not([open])'); return ds.filter((d) => !d.open); } };
}

test('tisk: unfold rozbalí sbalené details a po tisku sbalí jen ty, které rozbalil', () => {
  const src = PT.slice(PT.indexOf('function unfold(root)'), PT.indexOf('/** Tisk jen karty'));
  const unfold = vm.runInNewContext(`${src}; unfold`, {});
  const root = fakeRoot([false, true, false]);
  const refold = unfold(root);
  assert.deepEqual(root.ds.map((d) => d.open), [true, true, true], 'na papíře vše rozbalené');
  refold();
  assert.deepEqual(root.ds.map((d) => d.open), [false, true, false], 'co měl uživatel otevřené, zůstane otevřené');
  assert.doesNotThrow(() => unfold(null)(), 'bez Shrnutí na stránce nic');
});

test('tisk: rozbalení visí na beforeprint/afterprint (i Ctrl+P z prohlížeče), ne jen na tlačítku Vytisknout', () => {
  assert.match(PT, /addEventListener\('beforeprint', \(\) => \{ if \(!refold\) refold = unfold\(document\.querySelector\('#view-trip'\)\); \}\)/);
  assert.match(PT, /addEventListener\('afterprint', \(\) => \{ if \(refold\) refold\(\); refold = null; document\.body\.classList\.remove\('pt-print'\); \}\)/);
  // prohlížeč (i page.pdf v Chromiu) umí poslat beforeprint dvakrát před jedním afterprint – po tisku se sbalí vše původní
  const fn = PT.slice(PT.indexOf('function unfold(root)'), PT.indexOf('/** Tisk jen karty'));
  const wire = PT.slice(PT.indexOf('let refold = null;'), PT.indexOf("document.addEventListener('submit'"));
  const on = {}, root = fakeRoot([false, false, true]), cls = [];
  const document = { querySelector: (s) => (s === '#view-trip' ? root : null), body: { classList: { remove: (c) => cls.push(c) } } };
  vm.runInNewContext(`${fn}\n${wire}`, { window: { addEventListener: (n, f) => { on[n] = f; } }, document });
  on.beforeprint(); on.beforeprint();
  assert.deepEqual(root.ds.map((d) => d.open), [true, true, true]);
  on.afterprint();
  assert.deepEqual(root.ds.map((d) => d.open), [false, false, true]);
  assert.deepEqual(cls, ['pt-print']);
  const pl = PT.slice(PT.indexOf('function printList()'), PT.indexOf('if (typeof document'));
  assert.doesNotMatch(pl, /details/, 'printList jen přidá třídu a tiskne');
});

test('tisk: karta se smí zalomit mezi stránkami, pohromadě jen nadpis, řádek seznamu a tabulky', () => {
  const css = read('public/css/pretrip.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const print = css.slice(css.indexOf('@media print{'));
  const card = print.match(/\n\s*\.card\{([^}]*)\}/)[1];
  assert.doesNotMatch(card, /break-inside:avoid/, 'celá karta posunutá na další stranu nechá skoro prázdnou stranu');
  assert.match(print, /\.card h3,\.card li,\.card tr\{break-inside:avoid\}/);
  assert.match(print, /\.card h3\{break-after:avoid\}/);
});

test('Sešit: dny číslované od začátku cesty i když první den nemá program', () => {
  const ctx = { window: {} };
  vm.runInNewContext(read('public/js/plus.js'), ctx);
  const P = ctx.window.Plus;
  const t = { name: 'Lisabon', dest: 'Lisabon', start: '2027-01-13', end: '2027-01-21', days: { '2027-01-13': [], '2027-01-14': ['Alfama'], '2027-01-15': ['Belém'] } };
  const h = P.sesitHtml(t, '');
  assert.match(h, /Den 2 · 14\.\s1\./);
  assert.match(h, /Den 3 · 15\.\s1\./);
  assert.doesNotMatch(h, /Den 1 /);
  // bez data odjezdu (nebo den před ním) zůstane pořadí
  assert.match(P.sesitHtml({ ...t, start: '' }, ''), /Den 1 · 14\.\s1\./);
  assert.match(P.sesitHtml({ ...t, start: '2027-01-20' }, ''), /Den 1 · 14\.\s1\./);
});
