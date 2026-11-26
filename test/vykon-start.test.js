// První otevření na pomalé síti (předstartovní kontrola, výkon): „Najít lety“ klepnuté během načítání stránku
// neobnoví, Přehled neposkočí, až se objeví kukátko, a písmo nadpisů nebere skriptům pásmo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, statSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const INDEX = read('public/index.html');

/** Vložený skript z <head>, který hlídá odeslání formuláře na Přehledu, ve falešném dokumentu. */
function guard() {
  const head = INDEX.slice(0, INDEX.indexOf('</head>'));
  const src = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => /addEventListener\('submit'/.test(s));
  assert.ok(src, 'v <head> je vložený skript se zachycením odeslání');
  const ls = [];
  const ctx = { document: { addEventListener: (type, fn, capture) => ls.push({ type, fn, capture }) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const submit = (form) => { const e = { target: form, prevented: false, preventDefault() { this.prevented = true; } }; for (const l of ls) if (l.type === 'submit') l.fn(e); return e; };
  return { ctx, ls, submit };
}

test('„Najít lety“ před načtením skriptů: odeslání se zastaví a zapamatuje, po převzetí obsluhy projde', () => {
  const { ctx, ls, submit } = guard();
  assert.equal(ls.length, 1);
  assert.equal(ls[0].capture, true, 'zachytit dřív, než odeslání doběhne k formuláři');
  const form = { id: 'heroSearch', onsubmit: null };
  assert.equal(submit(form).prevented, true, 'bez obsluhy by prohlížeč načetl /? znovu');
  assert.equal(ctx.atlasEarlySubmit, true);
  ctx.atlasEarlySubmit = false;
  form.onsubmit = () => { };
  assert.equal(submit(form).prevented, false, 'obsluhu z flights.js nechá být (ta zavolá preventDefault sama)');
  assert.equal(ctx.atlasEarlySubmit, false);
  assert.equal(submit({ id: 'jiny', onsubmit: null }).prevented, false, 'jiné formuláře beze změny');
  // formulář pořád nemá action (odeslání by šlo na stejnou stránku) a obsluhu přiřazuje flights.js jako onsubmit
  assert.match(INDEX, /<form class="hero-search2" id="heroSearch" autocomplete="off">/);
  assert.match(read('public/js/flights.js'), /\$\('#heroSearch'\)\.onsubmit = async e => \{\s*e\.preventDefault\(\);/);
});

test('app.js boot: zapamatované klepnutí na „Najít lety“ po startu zopakuje – jen na Přehledu a s obsluhou', () => {
  const app = read('public/js/app.js');
  const boot = app.slice(app.indexOf('async function boot()'), app.indexOf('async function start()'));
  const fn = app.slice(app.indexOf('function earlySearch()'), app.indexOf('async function boot()'));
  assert.match(fn, /if \(window\.atlasEarlySubmit && hs && hs\.onsubmit && activeView === 'dashboard'\) hs\.dispatchEvent\(new Event\('submit', \{ cancelable: true \}\)\);\s*window\.atlasEarlySubmit = false;/);
  // až po start() (ten dokončí Flights.init a go('dashboard')) – jinak by start hledání přepnul zpět na Přehled
  assert.match(boot, /try \{ await start\(\); \} finally \{[^}]*\n\s*earlySearch\(\);/);
});

test('kukátko v titulku Přehledu: místo je vyhrazené v letsi.css už před načtením kukatko.js (bez poskočení)', () => {
  const css = read('public/css/letsi.css');
  const kuk = read('public/js/kukatko.js');
  // rozměr znaku a velikost na Přehledu z kukatko.js – kdyby se změnily, rezervace musí s nimi
  const vb = kuk.match(/VB = \[(-?\d+), (-?\d+), (\d+), (\d+)\]/).slice(3).map(Number);
  assert.match(kuk, /size: kde === 'prehled' \? 64 :/);
  assert.match(kuk, /prvek\('span', 'kuk-host k-znacka'\); h\.classList\.add\('kuk-s'\);/);
  assert.match(css, /:root\[data-brand="letsi"\] \.hero h1\{display:flex;align-items:center;gap:12px\}/);
  const rez = css.match(/:root\[data-brand="letsi"\] \.hero h1:not\(\.kuk-s\)::before\{content:"";flex:none;width:(\d+)px;aspect-ratio:(\d+)\/(\d+)\}/);
  assert.ok(rez, 'rezervace místa');
  assert.deepEqual(rez.slice(1).map(Number), [64, ...vb]);
  // mezera stejná jako u titulku s kukátkem (kukatko.css)
  assert.match(read('public/css/kukatko.css'), /\.hero h1\.kuk-s \{ display: flex; align-items: center; gap: 12px; \}/);
});

test('písmo nadpisů Unbounded zmenšené na latinku s češtinou (stahuje se souběžně se skripty Přehledu)', () => {
  for (const w of [600, 700]) {
    const kb = statSync(new URL(`../public/vendor/fonts/letsi/unbounded-${w}.woff2`, import.meta.url)).size / 1024;
    assert.ok(kb < 50, `unbounded-${w}.woff2 má ${kb.toFixed(1)} kB`);
    assert.ok(kb > 15, `unbounded-${w}.woff2 – podezřele malý (${kb.toFixed(1)} kB), chybí čeština?`);
  }
  assert.match(read('public/vendor/LICENSES.txt'), /Unbounded subset to Latin \+ Latin Extended-A/);
  // za Unbounded v titulcích stojí Onest – vysází znaky, které podmnožina nemá
  assert.match(read('public/css/letsi.css'), /--letsi-pismo-titulky:'Letsi','Onest',/);
});
