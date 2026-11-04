// Lety (public/js/flights.js): drobnosti výpisu – délka letu, „Další kombinace“, sdílená nabídka, blok vlastní ceny.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
const nb = (s) => s.replace(/ /g, ' ');

test('délka letu pod hodinu bez „0 h“ (dřív „0 h 50 min“)', () => {
  const m = src.match(/const dur = (m => [^\n]+?: ''); \/\//);
  assert.ok(m, 'dur()');
  const pad = (n) => String(n).padStart(2, '0');
  const dur = new Function('pad', `return ${m[1]};`)(pad);
  assert.equal(nb(dur(50)), '50 min');
  assert.equal(nb(dur(60)), '1 h 00 min');
  assert.equal(nb(dur(125)), '2 h 05 min');
  assert.equal(dur(0), '');
  assert.equal(dur(undefined), '');
});

test('pohled Lety: „Další kombinace“ jen když opravdu přibudou (dřív po rozbalení „(0)“ při víc než 30)', () => {
  const m = src.match(/\$\{(Math\.min\(30, picked\.length\) > n) \? `<button type="button" class="more-btn" data-lmore="1">/);
  assert.ok(m, 'podmínka tlačítka');
  const shown = new Function('picked', 'n', `return ${m[1]};`);
  const many = Array(50);
  assert.equal(shown(many, 30), false, 'po rozbalení (n = 30) už nic nepřibude');
  assert.equal(shown(many, 1), true);
  assert.equal(shown(Array(3), 3), false);
  assert.equal(shown(Array(2), 1), true);
});

test('sdílená nabídka bez počtu nocí skloňuje noci (dřív „1 dní“, „3 dní“)', () => {
  assert.match(src, /o\.nights != null \? nightsTxt\(o\.nights\) : nightsTxt\(SearchHelp\.diffDays\(o\.out\.date, o\.back\.date\)\)/);
  assert.doesNotMatch(src, /diffDays\([^)]*\)\} dní`/);
});

test('smazané Odkud schová i blok „Jezdíš levněji?“ s letišti předchozího Odkud', () => {
  assert.match(src, /if \(!f\.from\.length\) \{ originPreview = \[\]; apSumPaint\(\); renderOwn\(\);/);
});
