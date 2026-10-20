// Průvodce Cestou na počítači (public/css/desktop-trip.css): jen od 1024 px (přehled vpravo od 1280 px) – telefon
// a tablet beze změny – a načtené za desktop.css; přehled cesty (#tripAside) a pravý sloupec Shrnutí mimo počítač bez vlivu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const css = read('css/desktop-trip.css');

/** Hlavičky bloků nejvyšší úrovně (komentáře pryč) a text mimo ně. */
function topLevel(src) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0, out = '';
  const heads = [];
  for (const c of s) {
    if (c === '{') { if (depth === 0) heads.push(out.slice(out.lastIndexOf('}') + 1).trim()); depth++; out += '{'; }
    else if (c === '}') { depth--; out += '}'; } else if (depth === 0) out += c;
  }
  return heads;
}

test('desktop-trip.css: všechna pravidla jen v @media od 1024 px (telefon a tablet beze změny)', () => {
  const heads = topLevel(css);
  assert.ok(heads.length >= 3, heads.join(' | '));
  for (const h of heads) assert.match(h, /^@media \(min-width:(1024|1280|1600)px\)/, h);
});

test('desktop-trip.css: lišta kroků přilepená pod horní lištou, nižší fotka cíle, cena ve Shrnutí jen jednou', () => {
  assert.match(css, /#tripRoot>\.stepbar\{position:sticky;top:var\(--trip-bar\)/);
  assert.match(css, /#tripRoot>\.trip-head\{min-height:0;height:150px/);
  assert.match(css, /#tripRoot\[data-step=summary\] \.th-total\{display:none\}/);
  // přilepený obsah (přehled vpravo, mapa programu, pravý sloupec Shrnutí) až pod lištou kroků
  assert.match(css, /--trip-stick:160px/);
});

test('přehled vpravo má tlačítko dalšího kroku; nástroje ubytování v mřížce (ne „max Kč/noc“ samo na řádku)', () => {
  const js = read('js/trip.js');
  assert.match(js, /<div class="ta-next" id="taNext" hidden><\/div>/);
  assert.match(js, /const NEXT_IDS = \['tfNext', 'rtNext', 'stayNext', 'carNext', 'progNext', 'carSkip'\]/);
  assert.match(css, /\.ta-next\[hidden\]\{display:none\}/);
  assert.match(css, /#tripStep \.stay-tools\{display:grid;[^}]*grid-template-areas:"sort sort min" "type max count"/);
  assert.match(css, /#tripStep \.stay-tools\{grid-template-columns:[^}]*grid-template-areas:"sort min type max count"\}/);
});

test('desktop-trip.css se načítá za desktop.css (s ostatními desktop-*.css)', () => {
  const links = [...read('index.html').matchAll(/<link rel="stylesheet" href="(css\/[^"]+)">/g)].map((m) => m[1]);
  assert.ok(links.indexOf('css/desktop-trip.css') > links.indexOf('css/desktop.css') && links.indexOf('css/desktop.css') >= 0, links.join(', '));
});

test('přehled cesty a pravý sloupec Shrnutí mimo počítač nic nemění (skrytý / display:contents)', () => {
  const trip = read('css/trip.css');
  assert.match(trip, /\n\.trip-aside\{display:none\}/);
  assert.match(trip, /\n\.sum-side\{display:contents\}/);
  // tisk „Před cestou“: obal kroku (.tw-body) zůstane, přehled cesty ne
  assert.match(read('css/pretrip.css'), /#tripRoot>:not\(\.tw-body\),body\.pt-print \.trip-aside/);
});
