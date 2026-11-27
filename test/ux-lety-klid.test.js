// Klidnější výsledky Letů a karty Kam letět levně (UX verdikt U13, U21, U26, U33, U42): štítek dobré ceny jen u tří
// nejlepších nabídek, cena i s cestou sbaleně, „orientační“ šedě, na kartě radaru nejvýš jeden štítek a teplota v panelu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/flights.css', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const SearchHelp = ctx.window.SearchHelp;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const czk = n => `${String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ' ')} Kč`;
const txt = html => html.replace(/<\/(span|div|summary)>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Úsek zdroje mezi dvěma značkami (včetně první). */
function cut(from, to) {
  const a = fl.indexOf(from), b = fl.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `úsek „${from}“ ve flights.js`);
  return fl.slice(a, b);
}
const line = re => { const m = fl.match(re); assert.ok(m, String(re)); return m[0]; };

test('U21: štítek dobré ceny jen u 3 nejlevnějších nabídek, které ho mají', () => {
  const goodTop = new Function(`${line(/^ *const GOOD_TOP = [^\n]+$/m)}\n${line(/^ *const goodTop = [^\n]+$/m)}; return goodTop;`)();
  const t = (id, czk, good = true) => ({ id, perPersonCzk: czk, good });
  const list = [t('a', 1500), t('b', 900), t('c', 800, false), t('d', 1200), t('e', 1000), t('f', 700)];
  assert.deepEqual([...goodTop(list, x => x.good)].sort(), ['b', 'e', 'f'], 'nejlevnější tři z dobrých, ne ta bez štítku');
  assert.deepEqual([...goodTop(list.slice(0, 2), x => x.good)].sort(), ['a', 'b'], 'méně dobrých = všechny');
  assert.equal(goodTop(list, () => false).size, 0);
  assert.deepEqual([...goodTop(list, x => x.good, 1)], ['f']);
});

test('U21: výpis bere štítek z výběru – karta, sbalený řádek i přehled cílů; 🔥 bez vysvětlení pryč', () => {
  assert.match(fl, /goodNow = goodTop\(isRoute \? flat : groups\.map\(g => g\.vis\[0\]\)\.filter\(Boolean\), showsGood\);/);
  assert.match(fl, /const pb = goodNow && showsGood\(t\) && !goodNow\.has\(t\.id\) \? '' : priceTag\(t, idx\);/, 'štítek v kartě nabídky');
  assert.match(fl, /const tag = goodNow && goodNow\.has\(t\.id\) \? GOOD_MARK \+ ' ' : '';/, 'sbalený řádek');
  assert.match(fl, /\$\{goodNow && goodNow\.has\(t\.id\) \? ' ' \+ GOOD_MARK : ''\}/, 'přehled cílů');
  // značka má vysvětlení (title) i text pro čtečku
  assert.match(line(/^ *const GOOD_MARK = [^\n]+$/m), /title="Dobrá cena[^"]+">\$\{ikona\('super-cena'\)\}<span class="sr-only"> dobrá cena<\/span>/);
  assert.ok(!fl.includes("'🔥 ' : pl && pl.level === 'low' ? '💚 '"), 'řádek bez 🔥 / 💚 u každé dobré ceny');
  assert.ok(!fl.includes('title="Jedna z nejvýhodnějších cen vůči běžné ceně na tu vzdálenost">🔥</span>'), 'přehled cílů bez holého 🔥');
});

test('U26: cena i s cestou jedním sbaleným řádkem, rozpad a částka za všechny až po rozbalení', () => {
  const doorRow = new Function('SearchHelp', 'czk', `${cut('  function doorRow(', '  // res = výsledek, ze kterého nabídka je')}; return doorRow;`)(SearchHelp, czk);
  const two = doorRow(3094, { adults: 2 }, '🚆 doprava ~570 Kč/os.');
  assert.match(two, /^<details class="pd pr-door"><summary>I s cestou na letiště a do města ~3 094 Kč\/os\.<span class="pr-chev" aria-hidden="true">▾<\/span><\/summary>/);
  assert.equal(txt(two.slice(two.indexOf('</summary>'))), 'pro 2 ~6 188 Kč (odhad) 🚆 doprava ~570 Kč/os.');
  assert.ok(!doorRow(3094, { adults: 1 }, 'x').includes('pro 1'), 'jeden cestující bez „pro 1“');
  assert.ok(!/<details[^>]* open/.test(two), 'sbalené');
  // karta: cena i s cestou při každém řazení, doprava pod ní; bez ceny s cestou rámeček jako dřív
  assert.match(fl, /const door = t\.tripCzk != null && Math\.round\(t\.tripCzk\) !== Math\.round\(t\.perPersonCzk\) \? t\.tripCzk : null;/);
  assert.match(fl, /return door != null \? doorRow\(door, res\.query, body\) : `<div class="pd px">\$\{body\}<\/div>`;/);
  assert.match(css, /\.pr-door summary\{list-style:none;cursor:pointer;min-height:32px;/);
});

test('U33: „orientační“ šedě, štítek „orientační – ověř“ bez varovného rámečku (jen s neznámým příletem)', () => {
  assert.match(css, /\.cache-mark\{font-size:11px;font-weight:600;line-height:1\.3;color:var\(--faint\)\}/);
  const cacheTag = new Function('esc', `const CACHE_TIP = 'c', UNK_TIP = 'u';\n${line(/^ *const cacheTag = [^\n]+$/m)}; return cacheTag;`)(esc);
  assert.match(cacheTag({ live: false }), /^<span class="b cache-tag" title="c">orientační – ověř<\/span>$/);
  assert.match(cacheTag({ live: false, arrUnknown: true }), /^<span class="b warn cache-tag" title="c u">/);
  // stav ověření ve výpisu přepisuje štítek na místě – data-lk musí dostat i šedý štítek
  assert.match(fl, /\.replace\('cache-tag"', `cache-tag live-b" \$\{lk\}`\)/);
});

test('U42: karta Kam letět levně má nejvýš jeden štítek s textem – ten nejdůležitější', () => {
  const radarBadge = new Function('esc', 'radarHot', 'radarChange', `${cut('  const WHY_TOP', '  /** Dny dovolené na kartě radaru')}; return radarBadge;`)(
    esc, () => ['pod běžnou cenou', 'T'], x => `<span class="b good">↓ ${x.was.czk - x.czk} Kč</span>`);
  const top = { why: 'i s cestou na letiště nejlevnější', whyT: 'proč', czk: 600, was: { czk: 700 } };
  assert.equal(radarBadge(top, true), '<span class="b hot" title="T">pod běžnou cenou</span>', 'nejvýhodnější vyhraje');
  assert.equal(radarBadge(top, false), '<span class="b why" title="proč">✓ nejlevnější i s cestou</span>');
  assert.equal(radarBadge({ why: 'kratší cesta na letiště', czk: 600, was: { czk: 700 } }, false), '<span class="b good">↓ 100 Kč</span>', 'srovnání letišť jen v detailu');
  assert.equal(radarBadge({ why: 'levnější i s cestou na letiště', czk: 600 }, false), '');
  assert.equal(radarBadge({ czk: 600, newAt: 1 }, false), '', '„nové“ bez štítku');
  // na kartě vedle ⭐ 🆕 📌 jen radarBadge; štítky v jedné řadě
  assert.match(fl, /\$\{radarBadge\(x, hot\.has\(i\)\)\}`\.trim\(\);/);
  assert.match(css, /\.radar-card \.rc-badges\{position:absolute;top:10px;left:10px;right:52px;display:flex;flex-wrap:nowrap;gap:5px\}/);
  // text štítku se s ⭐ 🆕 📌 zkrátí, ikonové štítky ne
  assert.match(css, /\.radar-card \.rc-badges \.b\{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
  assert.match(css, /\.radar-card \.rc-badges :is\(\.fav-b,\.mute-b,\.new-cc,\.pin-b\)\{flex:none\}/);
});

test('U42: teplota šedě v panelu pod názvem, ne štítkem přes fotku (průměr i předpověď)', () => {
  assert.match(fl, /<span class="rc-dt">[^\n]*<\/span>\$\{clim\}<\/div>/, 'za termínem');
  assert.match(fl, /const clim = x\.th != null && !wxWin\(x\.d1\) \? `<span class="rc-t" title="Dlouhodobý průměr/);
  assert.match(fl, /const box = \$\('\.rc-meta', c\);[^\n]*\n\s+if \(box\) box\.insertAdjacentHTML\('beforeend', `<span class="rc-t"/);
  assert.ok(!fl.includes('class="b wxb clim"'), 'štítek 🌡️ přes fotku pryč');
  assert.match(css, /\.rc-meta \.rc-t\{flex:none;color:rgba\(255,255,255,\.72\)\}/);
});

test('U13: původ ceny a řádek řazení jedním klidným blokem stejným písmem', () => {
  assert.match(css, /\.cache-note\+\.sort-line\{font-size:11\.5px;margin-top:-8px\}/);
  // ve výpisu jdou hned za sebou: priceSrc a potom body, které začíná řádkem řazení
  assert.match(fl, /body = sortBar \+ body;/);
  assert.match(fl, /host\.innerHTML = summary \+ \([^\n]*priceSrc\(\{ orient: true, trip: res\.query\.trip \}\) : ''\) \+ body/);
});

test('U26: tečka před „orientační“ jen na telefonu – v úzkém sloupci na počítači se řádek zalomí a začínal by „· “', () => {
  const at = css.indexOf('.cache-mark::before{content:"· "}');
  assert.ok(at > 0, 'tečka před „orientační“ ve flights.css');
  assert.equal(css.indexOf('.cache-mark::before'), css.lastIndexOf('.cache-mark::before'), 'jen jedno pravidlo');
  // ve stejném bloku @media(max-width:560px) jako řádek ceny přes celou šířku karty
  const row = css.indexOf('  .pbox .pr-row{flex-basis:100%;justify-content:flex-start}'), open = css.lastIndexOf('@media', row);
  assert.equal(css.slice(open, css.indexOf('{', open)), '@media(max-width:560px)');
  assert.ok(at > row && !css.slice(row, at).includes('\n}'), 'uvnitř telefonního bloku');
});
