// Čistý režim (od 12. 1. 2027): ceny letů jsou jen orientační z mezipaměti Aviasales a živé zdroje jsou vypnuté.
// Slib aplikace o sobě (slogan v postranním panelu, nadpis a popis Letů, úvod) proto nesmí slibovat „nejlevnější“,
// „odkudkoliv kamkoliv“, „živě“ ani jména aerolinek – jen to, co Letsi splní i bez živých zdrojů.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('public/index.html');
const app = read('public/js/app.js');
const fl = read('public/js/flights.js');
const SLIB = /nejlevněj|odkudkoliv|celý svět|živ[ěé]|aktuální|ryanair|wizz|kiwi/i;

test('postranní panel: slogan pod logem neslibuje „odkudkoliv kamkoliv“', () => {
  const tag = html.match(/<div class="brand-tag">([^<]*)<\/div>/);
  assert.ok(tag, 'brand-tag');
  assert.equal(tag[1], 'levné letenky z okolí');
  assert.doesNotMatch(tag[1], SLIB);
});

test('úvod Letů: nadpis i popis sekce v menu jsou poctivé', () => {
  const h1 = html.match(/id="flHero"[\s\S]*?<h1>([^<]*)<\/h1><p>([^<]*)<\/p>/);
  assert.ok(h1, 'flHero');
  assert.equal(h1[1], 'Najdi levné letenky');
  assert.doesNotMatch(h1[1] + h1[2], SLIB);
  const nav = app.match(/\['flights', 'Lety', '([^']*)'/);
  assert.ok(nav, 'NAV Lety');
  assert.equal(nav[1], 'Levné letenky ze všech letišť v okolí');
});

test('úvod Přehledu, tlačítko hledání a Kamkoliv neslibují nejlevnější lety celého světa ani aerolinky', () => {
  const hero = html.match(/<h1 id="heroGreet">[^<]*<\/h1>\s*<p>([^<]*)<\/p>/);
  assert.ok(hero, 'heroBox');
  assert.match(hero[1], /orientační ceny/);
  assert.doesNotMatch(hero[1], SLIB);
  assert.match(html, /id="doSearch" type="submit">Najít lety<\/button>/);
  const quick = fl.match(/\['🌍', '(Kamkoliv[^']*)', '([^']*)'/);
  assert.ok(quick, 'rychlé hledání Kamkoliv');
  assert.doesNotMatch(quick[1] + quick[2], SLIB);
});
