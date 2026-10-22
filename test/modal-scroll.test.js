// Otevřené okno (#modalBg): stránka pod ním se neposouvá – zámek na body (ne na html, jinak body s height:100% a
// vlastním overflow začne posouvat samo sebe a stránka skočí nahoru), okno samo posun neřetězí dál.
// Karty radaru se „super cenou“ bez růžového rámečku (jen štítek 🔥), jako ostatní karty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

test('atlas.css: otevřené okno zamkne posun stránky přes body a samo posun neřetězí', () => {
  const css = read('css/atlas.css');
  assert.match(css, /html:has\(#modalBg\.show\) body\{overflow:hidden\}/);
  assert.doesNotMatch(css, /html:has\(#modalBg\.show\)\{[^}]*overflow:hidden/, 'overflow na html zastaví přenos z body – stránka skočí nahoru');
  assert.match(css, /\.modal\{[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.modal-bg\{overscroll-behavior:contain\}/);
});

test('flights.css: karta radaru se super cenou nemá vlastní rámeček', () => {
  assert.doesNotMatch(read('css/flights.css'), /\.radar-card\.hot\{/);
});
