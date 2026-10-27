// Zdi textu na telefonu (412 a 360 px): vysvětlivky pod výsledky Letů, ve Filtrech a pod kalendářem Kamkoliv jsou
// krátké – rozpis zdrojů a výpočtu je sbalený pod „Jak počítám ▾“ nebo v title; tipy v Letech se vejdou do 5 řádků,
// na které je telefon ořízne (jinak končily uprostřed věty). Túry a trasy v Objevuj: places-ui / hikeplan-ui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('tipy v Letech: každý nejvýš ~170 znaků – na 360 px 5 řádků, víc telefon uřízne (u „Hlídej cenu“ i výhradu)', () => {
  const ctx = vm.createContext({});
  vm.runInContext(read('js/data.js').match(/^const TIPS=.*$/m)[0].replace(/^const TIPS/, 'globalThis.TIPS'), ctx);
  assert.ok(ctx.TIPS.length >= 5);
  for (const [, h, t] of ctx.TIPS) assert.ok([...t].length <= 170, `${h}: ${[...t].length} znaků`);
  // řez na 5 řádků je jen na telefonu (pruh do strany) – kdyby se zvedl, tenhle limit by šel povolit
  assert.match(noComments(read('css/flights.css')), /#flightTips \.tip p\{display:-webkit-box;-webkit-line-clamp:5;/);
  const hlid = ctx.TIPS.find((x) => x[1] === 'Hlídej cenu')[2];
  assert.match(hlid, /dokud ho máš otevřený/, 'podstatná výhrada zůstala');
});

test('patička výsledků Letů: vidět co cena je, zdroje odhadů, kurz a teplota až pod „Jak počítám“ (dřív 16–20 řádků)', () => {
  const js = read('js/flights.js');
  assert.match(js, /function footMore\(html\) \{ return ` <details class="foot-more"><summary>Jak počítám<\/summary>\$\{html\}<\/details>`; \}/);
  const foots = [...js.matchAll(/<div class="res-foot faint">(.*?)\$\{footMore\(`(.*?)`\)\}<\/div>`/g)];
  assert.equal(foots.length, 2, 'Kamkoliv a konkrétní cíl + cesta přes víc měst');
  for (const [, shown, more] of foots) {
    assert.match(shown, /^Ceny jsou za letenky na osobu \$\{bagFoot\(res\.query\.bags\)\}\. Doprava na letiště/);
    assert.ok(shown.length < 200, `vidět jen dvě věty: ${shown}`);
    assert.doesNotMatch(shown, /Kurz|groundFoot|arrivalFoot|NASA|Živé ceny/);
    assert.match(more, /groundFoot\(res/);
    assert.match(more, /Kurz: \$\{fxFoot\(res\)\}/);
  }
  assert.match(foots[0][2], /NASA POWER 2001–2020/, 'teplota u cíle dál vysvětlená');
  const css = noComments(read('css/atlas.css'));
  assert.match(css, /\.foot-more>summary\{[^}]*cursor:pointer;color:var\(--accent-ink\)/);
  assert.match(css, /\.foot-more\[open\]>summary::after\{content:' ▴'\}/);
});

test('Filtry: poznámka o pořadí krátce (rozpis v title), bez „po najetí nebo podržení“ – na telefonu se title neukáže', () => {
  const js = read('js/flights.js');
  const m = js.match(/<div class="faint rank-note"\$\{view\.sort === 'best' \? ' title="([^"]+)"' : ''\}>Pořadí určuje jen zvolené řazení – žádná aerolinka ani partner si za lepší pozici neplatí\.\$\{view\.sort === 'best' \? '([^']+)' : ''\}/);
  assert.ok(m, 'rank-note');
  assert.match(m[1], /nočními odjezdy, tím, kolik zbude času na místě, a cenou pod obvyklou/, 'celý rozpis v title');
  assert.ok(m[2].length <= 110, m[2]);
  assert.doesNotMatch(js, /podržení rozpis/);
  // přiznání partnerských odkazů zůstává vidět
  assert.match(js, /Odkazy na Aviasales jsou partnerské \(affiliate, <span class="ad-tag">reklama<\/span>\)/);
});

test('kalendář Kamkoliv: poznámka pod kalendářem na 3–4 řádky, „tam i zpět“ už je v nadpisu', () => {
  const js = read('js/flights.js');
  const fn = js.slice(js.indexOf('function destCalHtml('), js.indexOf('function calendarHtml('));
  assert.match(fn, /V každém dni nejlevnější cíl z nalezených nabídek – další termíny ukáže hledání do jednoho cíle\./);
  assert.doesNotMatch(fn, /u každého cíle pár nejlevnějších termínů/);
  // co je v ceně jen se zavazadly nebo max. cenou (to nadpis neříká)
  assert.match(fn, /const inclTxt = BAG_LBL\[q\.bags\] \|\| q\.maxPrice \?/);
  assert.match(fn, /\$\{inclTxt \? ` Cena na osobu: \$\{inclTxt\}\.` : ''\}/);
});

test('řádek Kamkoliv na telefonu: termín a ✓ důvod přes celou šířku pod názvem i cenou (vedle ceny zbylo ~105 px)', () => {
  const js = read('js/flights.js');
  // letiště ve vlastním prvku (do mřížky se rovná samo), dny dovolené na začátku termínu – ne před letišti
  assert.match(js, /<div class="faint cmp-sub"><span class="cmp-ap">\$\{esc\(t\.out\.from\)\} → \$\{esc\(t\.out\.to\)\}.*?<\/span><span class="cmp-when"><span class="cmp-dot"> · <\/span>\$\{lt \? `<span class="cmp-lv"/);
  const css = noComments(read('css/flights.css'));
  const phone = css.slice(css.indexOf('@media(max-width:560px){\n  .cmp-row{'));
  const block = phone.slice(0, phone.indexOf('\n}\n'));
  assert.match(block, /\.cmp-main,\.cmp-sub\{display:contents\}/);
  // vyšší selektor než základní .cmp-hit:has(>.cmp-why)>.cmp-flag{grid-row:span 2} – jinak fotka roztáhla první dva řádky
  assert.match(block, /\.cmp-hit>\.cmp-flag,\.cmp-hit:has\(>\.cmp-why\)>\.cmp-flag\{grid-area:1\/1\/5\/2\}/);
  assert.match(block, /\.cmp-price\{grid-area:1\/3\/3\/4;align-self:start\}/);
  assert.match(block, /\.cmp-when\{grid-area:3\/2\/4\/4\}/);
  assert.match(block, /\.cmp-why\{grid-area:4\/2\/5\/4;[^}]*white-space:normal/, 'na 360 px se důvod zalomí, neuřízne');
});
