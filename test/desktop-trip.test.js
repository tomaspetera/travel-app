// Průvodce Cestou na počítači (public/css/desktop-trip.css): jen od 1280 px – telefon, tablet a malý notebook beze
// změny – a načtené hned za desktop.css; přehled cesty (#tripAside) a pravý sloupec Shrnutí mimo počítač bez vlivu.
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

test('desktop-trip.css: všechna pravidla jen v @media od 1280 px', () => {
  const heads = topLevel(css);
  assert.ok(heads.length >= 2, heads.join(' | '));
  for (const h of heads) assert.match(h, /^@media \(min-width:(1280|1600)px\)/, h);
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
