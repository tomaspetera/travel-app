// UX kontrola před spuštěním (ux2 lety-nakup): na kartě nabídky je nákup hned pod cenou (plné tlačítko Noc), Google Lety
// a Skyscanner jen textové odkazy, „Naplánovat celou cestu“ obrysové, u dvou samostatných letenek věta nad tlačítky
// a partnerský odkaz označený jen při zapnutém affiliate; nad Lety a Kam letět levně jeden řádek původu ceny,
// podrobnosti pod ⓘ. Čisté funkce z public/js/flights.js (priceSrc, twoTix, affNote, buyBlock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const fl = read('public/js/flights.js');
const css = read('public/css/flights.css');
const letsi = read('public/css/letsi.css');
const ctx = { window: {} };
vm.runInNewContext(read('public/js/searchhelp.js'), ctx);
const SearchHelp = ctx.window.SearchHelp;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Úsek zdroje mezi dvěma značkami (včetně první). */
function cut(from, to) {
  const a = fl.indexOf(from), b = fl.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `úsek „${from}“ ve flights.js`);
  return fl.slice(a, b);
}
// text, jak ho uživatel čte
const txt = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const { priceSrc } = new Function(`${cut('  // Původ ceny jedním krátkým řádkem', '  // karta radaru: příznak oc')}; return { priceSrc };`)();
const AFF = fl.match(/^ *const affBuy = [^\n]+\n *const buyRel = [^\n]+\n *const adTag = [^\n]+\n/m)[0];
const buyMod = (health = null) => new Function('SearchHelp', 'esc', 'safeUrl', 'provColor', 'shopName', 'health',
  `${AFF}${cut('  const sameRound = ', '  // Ryanair a Wizz Air účtují')}; return { bookButtons, twoTix, affNote };`)(SearchHelp, esc, u => u, () => '#000', id => id, health);

test('řádek původu ceny: zdroj, za 1 osobu, zpáteční / jen tam; 48 h a ostatní věty až pod ⓘ', () => {
  const rt = priceSrc({ orient: true, trip: 'return' });
  assert.match(rt, /^<details class="faint cache-note"><summary>Orientační ceny z Aviasales · za 1 osobu, zpáteční <span class="cn-i" aria-hidden="true">ⓘ<\/span>/);
  assert.match(txt(rt), /podrobnosti Našli je jiní cestující na Aviasales v posledních 48 hodinách – cena se mohla změnit\. Před nákupem ji ověř\.$/);
  // ve výchozím stavu sbalené – vidět je jen řádek v <summary>
  assert.ok(!/<details[^>]* open/.test(rt));
  assert.match(priceSrc({ orient: true, trip: 'oneway' }), /<summary>Orientační ceny z Aviasales · za 1 osobu, jen tam /);
  assert.match(priceSrc({ orient: true, trip: 'multi' }), /<summary>Orientační ceny z Aviasales · za 1 osobu <span/, 'víc měst bez „zpáteční“');
  // živé ceny (ne z mezipaměti) Aviasales za zdroj nevydávají
  const live = priceSrc({ trip: 'return', more: 'Pořadí…' });
  assert.match(live, /<summary>Ceny letenek · za 1 osobu, zpáteční /);
  assert.ok(!live.includes('Aviasales') && !live.includes('48 hodin'));
  // bez podrobností jen řádek, žádné ⓘ do prázdna
  assert.equal(priceSrc({ trip: 'return' }), '<div class="faint cache-note">Ceny letenek · za 1 osobu, zpáteční</div>');
  // na telefonu (412 px) jeden řádek drobného písma
  assert.ok(txt(rt.match(/<summary>[\s\S]*?<\/summary>/)[0]).length <= 70);
});

test('Kam letět levně: jeden řádek nad kartami, pro kolik cestujících, doprava, pořadí a fotky pod ⓘ (nic nezmizelo)', () => {
  assert.ok(!fl.includes('radar-what'), 'dřívější věta nad kartami');
  assert.ok(!fl.includes('Orientační nejnižší ceny za 1 dospělého'), 'rozpor „při 2 cestujících“ × „za 1 dospělého“');
  const more = fl.match(/const radarMore = `([^\n]+)`;/)[1];
  const at = adults => new Function('q', `return \`${more}\`;`)({ payload: { adults } });
  assert.match(at(2), /^Cena za osobu při 2 cestujících, zpáteční letenka – doprava na letiště je u nabídky zvlášť\. Pořadí počítá s cenou i s cestou/);
  assert.match(at(1), /^Cena za osobu, zpáteční letenka/);
  assert.match(at(2), /Fotky měst z <a href="https:\/\/unsplash\.com\/[^"]+"[^>]*>Unsplash<\/a>, <a href="https:\/\/www\.pexels\.com"[^>]*>Pexels<\/a> a Wikimedia Commons/);
  // patička pod kartami bez fotek (jsou pod ⓘ), čas načtení zůstává
  assert.match(fl, /Načteno \$\{when\}[^\n]*klepni na kartu: detail, koupit let nebo všechny termíny<\/div>`;/);
  // výchozí počet cestujících se nemění (2 dospělí)
  assert.match(fl, /adults: 2/);
});

test('dvě samostatné letenky: věta jen u dvou tlačítek Tam / Zpět', () => {
  const { twoTix } = buyMod();
  const leg = (from, to, extra = {}) => ({ from, to, date: '2027-02-01', provider: 'travelpayouts', ...extra });
  assert.equal(twoTix({ out: leg('PRG', 'BCN', { bookUrl: 'https://a' }), back: leg('BCN', 'PRG', { bookUrl: 'https://b' }) }), true, 'kombinace');
  assert.equal(twoTix({ bookUrl: 'https://x', out: leg('PRG', 'BCN'), back: leg('BCN', 'PRG') }), false, 'jeden odkaz na zpáteční');
  assert.equal(twoTix({ out: leg('PRG', 'BCN', { bookUrl: 'https://a' }), back: null }), false, 'jen tam');
});

test('partnerský odkaz: drobná věta u nákupu jen se zapnutým affiliate a odkazem tp.media', () => {
  const tp = 'https://tp.media/r?marker=1&u=https%3A%2F%2Fwww.aviasales.com%2F';
  const NOTE = '<div class="buy-cur faint aff-note">partnerský odkaz – Letsi může dostat provizi, cenu to nemění</div>';
  assert.equal(buyMod({ affiliate: true }).affNote([tp]), NOTE);
  assert.equal(buyMod({ affiliate: true }).affNote([undefined, null, tp]), NOTE, 'odkaz letu zpět');
  assert.equal(buyMod({ affiliate: false }).affNote([tp]), '', 'affiliate vypnutý');
  assert.equal(buyMod(null).affNote([tp]), '', '/api/health ještě není');
  assert.equal(buyMod({ affiliate: true }).affNote(['https://www.ryanair.com/cz/cs']), '', 'přímý odkaz aerolinky');
  assert.equal(buyMod({ affiliate: true }).affNote([undefined]), '', 'demo bez odkazu');
});

test('blok nákupu: věta o dvou letenkách, tlačítka, partnerský odkaz a poznámky v tomhle pořadí', () => {
  const line = fl.match(/^ *const buyBlock = [^\n]+$/m)[0];
  const { twoTix, affNote } = buyMod({ affiliate: true });
  const buyBlock = new Function('twoTix', 'affNote', 'bookButtons', 'buyNote', 'kidsNote', 'buyProvs', `${line}; return buyBlock;`)(
    twoTix, affNote, () => '<a class="btn sm book">B</a>', () => '<div class="buy-cur">💱</div>', () => '<div class="pax-buy">👶</div>', () => []);
  const t = { out: { from: 'PRG', to: 'BCN', date: '2027-02-01', bookUrl: 'https://tp.media/a' }, back: { from: 'BCN', to: 'PRG', date: '2027-02-05', bookUrl: 'https://tp.media/b' } };
  assert.equal(buyBlock(t, {}), '<div class="tr-buyw"><div class="buy-two">2 samostatné letenky – kup obě</div><div class="tr-buy"><a class="btn sm book">B</a></div>'
    + '<div class="buy-cur faint aff-note">partnerský odkaz – Letsi může dostat provizi, cenu to nemění</div><div class="buy-cur">💱</div><div class="pax-buy">👶</div></div>');
});

test('karta nabídky: nákup pod cenou nad „Je to dobrá cena?“, Naplánovat obrysové, ověření textovými odkazy', () => {
  // priceBox vloží blok nákupu hned za cenu (zavazadla, děti) – před dopravu na letiště a „Je to dobrá cena?“
  assert.match(fl, /<div class="pd pax-note">👶 \$\{esc\(note\)\}<\/div>` : ''\}\$\{buy\}\n\s+\$\{ex \? extrasHtml\(t, res\) : ''\}\n\s+\$\{idx != null && levelFor\(t\) \? `<button type="button" class="linkbtn pc-ask"/);
  const row = cut('  function tripRow(t, g, idx) {', '  /* ---------- 📅 termín nabídky v kalendáři');
  assert.match(row, /\$\{priceBox\(t, idx, lastResult, true, buyBlock\(t, lastResult\.query\)\)\}/);
  assert.match(row, /<button type="button" class="btn sm" data-pick="\$\{idx\}"/, 'Naplánovat bez primary');
  assert.ok(!row.includes('bookButtons('), 'nákup už není pod Naplánovat');
  // 📌 Odložené: nákup nad Naplánovat, to obrysové
  assert.match(fl, /<div class="pin-act">\$\{buyBlock\(t, p\.q\)\}<button type="button" class="btn sm" data-pgo=/);
  // Google Lety a Skyscanner jako odkaz „Let zpět ↗“, ne obrysové tlačítko
  assert.match(fl, /verA\(g, g\.leg \? 'Ověřit let tam v Google Letech ↗' : 'Ověřit cenu v Google Letech ↗', 'tv-alt'\)/);
  // telefon: Tam / Zpět vedle sebe přes celou šířku, na 360 px a užším pod sebou
  assert.match(css, /@media\(max-width:560px\)\{[\s\S]*?\.pbox \.tr-buyw\{flex-basis:100%\}\n  \.pbox \.tr-buy\{flex-direction:row\}/);
  assert.match(css, /@media\(max-width:380px\)\{\n  \.tr-act \.tr-buy,\.pbox \.tr-buy\{flex-wrap:wrap;min-width:0\}/);
  assert.match(css, /\.tr-buyw \.btn\{min-height:44px\}/);
});

test('vzhled Letsi: nákup plným tlačítkem Noc (v tmavém Pistácie s Nocí), ne barvou prodejce', () => {
  assert.match(letsi, /:root\[data-brand="letsi"\] \.btn\.book\{background:var\(--letsi-tlacitko\);color:var\(--letsi-tlacitko-text\)\}/);
  // demo bez odkazu zůstává šedé (neaktivní) – není to .book
  assert.match(fl, /<span class="btn sm ghost" title="Demo data nemají rezervační odkaz" style="opacity:\.55">/);
});
