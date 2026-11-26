// Ovládání klávesnicí na počítači: pořadí Tabu v úvodu Přehledu odpovídá tomu, co je vidět, a odkaz Přeskočit na obsah
// (předstartovní kontrola pocitac-5, pocitac-6). Skutečné pořadí Tabu a vzhled ověřuje Playwright ručně – tady kód a CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
const html = read('index.html'), app = read('js/app.js'), atlas = read('css/atlas.css'), dflights = read('css/desktop-flights.css');

test('úvod: tlačítka 🧳/✈️ jsou v kódu i na obrazovce za hledáním a příklady vět – Tab neskáče zpátky nahoru', () => {
  const hero = html.slice(html.indexOf('id="heroBox"'), html.indexOf('id="resumeRow"'));
  const at = id => { const i = hero.indexOf(`id="${id}"`); assert.ok(i > 0, id); return i; };
  assert.ok(at('heroSearch') < at('smartTry') && at('smartTry') < at('heroPlan') && at('heroPlan') < at('heroOwn'));
  // od 1280 px dřív absolutně vpravo nahoře vedle nadpisu (fokus po příkladech vět skočil zpátky nahoru)
  assert.doesNotMatch(dflights, /hero-plans\{[^}]*position:absolute/);
  assert.match(dflights, /@media \(min-width:1280px\)\{\s*#heroBox \.hero-plans\{flex-direction:row\}/);
  assert.doesNotMatch(html, /tabindex="[1-9]/, 'žádný kladný tabindex');
});

test('Přeskočit na obsah: první prvek stránky, vidět jen při fokusu, fokus na <main> bez změny adresy', () => {
  const body = html.slice(html.indexOf('<body>') + 6).replace(/^\s*(<!--[\s\S]*?-->\s*)*/, '');
  assert.match(body, /^<a class="skip" href="#main">Přeskočit na obsah<\/a>/);
  assert.match(html, /<main class="content" id="main" tabindex="-1">/);
  assert.match(atlas, /\.skip\{position:absolute;left:-9999px;/);
  assert.match(atlas, /\.skip:focus\{left:16px;/);
  // #main v adrese by hashchange a viewStep braly jako sekci – odkaz jen přesune fokus
  assert.match(app, /\$\('\.skip'\)\.onclick = e => \{ e\.preventDefault\(\); \$\('#main'\)\.focus\(\); \};/);
});
