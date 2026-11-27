// Emoji nikdy v nadpisu ani v tlačítku – ikony Letsi (public/vendor/letsi/ikony, ikona() → <span class="ico i-…">);
// vlajky zemí smí (CLAUDE.md, nález U5). Hlídá zdroj nadpisů a tlačítek a popisky, ze kterých se tlačítka skládají
// (krokovník průvodce, filtry a přepínače Objevuj, aktivity v seznamu věcí). public/js/flights.js zatím ne – emoji
// ve výsledcích Letů přijdou na řadu zvlášť.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

/** Barevná emoji v textu: znaky s obrázkovou podobou (nebo s přepínačem U+FE0F); vlajky (regionální písmena) a textové
 *  znaky jako ↩ ✓ ▾ ne – ty se kreslí písmem jako text. */
export function emoji(s) {
  return String(s).match(/(?![\u{1F1E6}-\u{1F1FF}])(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)/gu) || [];
}

/** Nadpisy a tlačítka ve zdroji (HTML i šablony v JS), které obsahují emoji: ['soubor:řádek: <tag>…'] */
export function emojiVNadpisech(src, f = '') {
  const out = [];
  for (const m of src.matchAll(/<(h[1-6]|button|summary)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    if (emoji(m[2]).length) out.push(`${f}:${src.slice(0, m.index).split('\n').length}: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  return out;
}

/** Pole popisků `const JMÉNO = [ … ];` ze zdroje (i přes víc řádků). */
const pole = (src, name) => {
  const i = src.indexOf(`const ${name} = [`);
  assert.ok(i >= 0, name);
  return src.slice(i, src.indexOf('];', i) + 2);
};

test('emoji(): pozná emoji, vlajku a textové znaky nechá', () => {
  assert.deepEqual(emoji('✈️ Let 🏨'), ['✈️', '🏨']);
  assert.deepEqual(emoji('🇮🇹 Řím ↩ Jiný let ✓ ▾ ↔ ✔'), []);
  assert.deepEqual(emoji('⭐ vše'), ['⭐']);
  assert.deepEqual(emoji('<span class="ico i-let" aria-hidden="true"></span> Najít lety'), []);
});

test('emojiVNadpisech(): najde emoji v nadpisu, tlačítku a summary, vlajku ani ikonu ne', () => {
  const src = '<h3>🧾 Cena</h3>\n<button>${flag(cc)} Řím</button><button type="button">${ikona(\'let\')} Let</button>\n<summary>📍 Místa</summary><h2>🇵🇹 Lisabon</h2>';
  assert.deepEqual(emojiVNadpisech(src, 'x').map((x) => x.split(': ')[0]), ['x:1', 'x:3']);
});

test('nadpisy a tlačítka bez emoji: průvodce, Shrnutí, Objevuj, okna a formulář (mimo flights.js)', () => {
  const files = ['index.html', ...readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'flights.js').map((f) => `js/${f}`)];
  assert.ok(files.includes('js/trip.js') && files.includes('js/places.js') && files.includes('js/pretrip.js'));
  assert.deepEqual(files.flatMap((f) => emojiVNadpisech(read(f), f)), []);
});

test('tlačítka skládaná z popisků: krokovník, filtry a přepínače Objevuj, aktivity seznamu věcí bez emoji', () => {
  const trip = read('js/trip.js'), places = read('js/places.js'), pretrip = read('js/pretrip.js');
  // krokovník: druhá položka je název ikony Letsi, vykreslí ji ikona(); hotový krok ✓
  const steps = pole(trip, 'STEPS');
  assert.deepEqual([...steps.matchAll(/\['(\w+)', '([a-z-]+)', '[^']+'\]/g)].map((m) => [m[1], m[2]]),
    [['flight', 'let'], ['route', 'mapa'], ['stay', 'ubytovani'], ['car', 'auto'], ['program', 'program'], ['summary', 'hotovo']]);
  assert.match(trip, /<span>\$\{done\(i\) \? '✓' : ikona\(s\[1\]\)\}<\/span>\$\{s\[2\]\}<\/button>/);
  // přehled cesty vpravo (počítač): řádky jsou tlačítka kroků, ikona přes ikona()
  assert.match(trip, /<span class="ta-ico">\$\{ikona\(ico\)\}<\/span>/);
  for (const n of ['INTERESTS', 'TRIP_INTERESTS', 'MODES', 'BIKE_KINDS', 'HIKE_KINDS', 'BIKE_TYPES', 'BIKE_SCENERY', 'BIKE_HILLS', 'TRANSPORTS']) {
    assert.deepEqual(emoji(pole(places, n)), [], n);
  }
  assert.deepEqual(emoji(pole(pretrip, 'ACTS')), [], 'ACTS');
  // filtr kategorií míst jen názvem (emoji kategorie zůstává na mapě a v kartě místa)
  assert.match(places, /data-cat="\$\{c\}" class="\$\{ex\.cat === c \? 'on' : ''\}">\$\{\(CAT\[c\] \|\| CAT\.sight\)\[1\]\}<\/button>/);
  // přepínač režimů na telefonu: krátký název bez emoji nad ním
  assert.match(places, /<span class="m-short">\$\{MODE_SHORT\[id\]\}<\/span>/);
});

test('aktivní krok krokovníku: ikona 20 px jako ve spodní liště, Nocí na Pistácii a s obrysem barvou textu', () => {
  assert.match(read('css/trip.css'), /^\.stepbar \.st \.ico\{width:20px;height:20px\}$/m);
  assert.match(read('css/letsi.css'), /^:root\[data-brand="letsi"\] \.stepbar \.st\.on>span\{background:#D6DE82;color:#14161F;outline:2px solid var\(--text\);outline-offset:2px\}$/m);
});
