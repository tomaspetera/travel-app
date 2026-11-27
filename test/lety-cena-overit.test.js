// Karta nabídky letu: jeden zápis ceny (každá částka s jednotkou, u víc cestujících i částka za všechny) a u orientační
// ceny ověření jako vlastní řádek s tlačítkem – čisté funkce z public/js/flights.js (priceRows, verifyTargets, verifyRow).
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

/** Úsek zdroje mezi dvěma značkami (včetně první). */
function cut(from, to) {
  const a = fl.indexOf(from), b = fl.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `úsek „${from}“ ve flights.js`);
  return fl.slice(a, b);
}
const F = new Function('SearchHelp', 'esc', 'czk', 'enc', 'yymmdd', 'shopName', 'provColor', 'safeUrl',
  `${cut('  /* ---------- zápis ceny v kartě nabídky a ověření ceny', '  // res = výsledek, ze kterého nabídka je')}
   ${fl.match(/^ *const affBuy = [^\n]+\n *const buyRel = [^\n]+\n *const adTag = [^\n]+\n/m)[0]}${cut('  function bookButtons(t) {', '  // Ryanair a Wizz Air účtují v měně země odletu')}
   return { priceRows, verifyTargets, verifyLinks, verifyRow, bookButtons };`);
const M = F(SearchHelp, esc, czk, encodeURIComponent, s => s.slice(2, 10).replace(/-/g, ''), id => id, () => '#000', u => u);
// text, jak ho uživatel čte: bez značek, kousky řádku oddělené mezerou
const txt = html => html.replace(/<\/(span|div)>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const rows = html => html.split('</div>').map(txt).filter(Boolean);

const leg = (from, to, date, live = true) => ({ from, to, date, live, provider: live ? 'ryanair' : 'travelpayouts' });
const rt = live => ({ id: 'a', out: leg('PRG', 'BCN', '2027-02-01', live), back: leg('BCN', 'PRG', '2027-02-05', live), provider: 'travelpayouts', bookUrl: 'https://example.test/x' });
const ow = live => ({ id: 'b', out: leg('PRG', 'BCN', '2027-02-01', live), back: null, provider: 'travelpayouts', bookUrl: 'https://example.test/y' });
const jaw = live => ({ id: 'c', out: leg('PRG', 'BCN', '2027-02-01', live), back: leg('GRO', 'VIE', '2027-02-05', live) });

test('zápis ceny: 1 cestující – „Letenky 1 009 Kč/os.“, jedna letenka „Letenka“, bez částky za všechny', () => {
  assert.deepEqual(rows(M.priceRows({ per: 1009, total: 1009, ret: true, q: { adults: 1 } })), ['Letenky 1 009 Kč/os.']);
  assert.deepEqual(rows(M.priceRows({ per: 659, total: 659, ret: false, q: { adults: 1 } })), ['Letenka 659 Kč/os.']);
  // s cestou na letiště a do města: stejná stavba, vlnovka a „(odhad)“
  assert.deepEqual(rows(M.priceRows({ per: 1009, total: 1009, ret: true, q: { adults: 1 }, door: 2019 })),
    ['Letenky 1 009 Kč/os.', 'S cestou na letiště a do města ~2 019 Kč/os. (odhad)']);
  assert.deepEqual(rows(M.priceRows({ per: 659, total: 659, ret: null, q: {}, door: 1200.4 })),
    ['Letenka 659 Kč/os.', 'S cestou na letiště a do města ~1 200 Kč/os. (odhad)']);
});

test('zápis ceny: 2 cestující – u obou řádků částka na osobu i za oba, každá s jednotkou nebo s „pro 2“', () => {
  assert.deepEqual(rows(M.priceRows({ per: 1009, total: 2018, ret: true, q: { adults: 2 }, door: 2019 })),
    ['Letenky 1 009 Kč/os. · pro 2 celkem 2 018 Kč', 'S cestou na letiště a do města ~2 019 Kč/os. · pro 2 ~4 038 Kč (odhad)']);
  assert.deepEqual(rows(M.priceRows({ per: 659, total: 1318, ret: false, q: { adults: 2 } })), ['Letenka 659 Kč/os. · pro 2 celkem 1 318 Kč']);
  assert.deepEqual(rows(M.priceRows({ per: 659, total: 1318, ret: false, q: { adults: 2 }, door: 900 })),
    ['Letenka 659 Kč/os. · pro 2 celkem 1 318 Kč', 'S cestou na letiště a do města ~900 Kč/os. · pro 2 ~1 800 Kč (odhad)']);
  // žádná částka bez jednotky: za každou „Kč“ je „/os.“, nebo jí předchází „pro N (celkem)“
  const all = rows(M.priceRows({ per: 1009, total: 2018, ret: true, q: { adults: 2 }, door: 2019 })).join(' ');
  assert.equal((all.match(/Kč/g) || []).length, 4);
  assert.equal((all.match(/Kč\/os\./g) || []).length + (all.match(/pro 2 (celkem )?~?[\d ]+ Kč/g) || []).length, 4);
});

test('zápis ceny: velká částka je cena na osobu; označení „orientační“ za ní; s dětmi delší popisek celku', () => {
  const html = M.priceRows({ per: 1009, total: 2018, ret: true, q: { adults: 2 }, door: 2019, mark: '<div class="cache-mark">orientační</div>' });
  assert.match(html, /^<div class="pl pr-row"><span>Letenky<\/span><span><b class="pp">1 009 Kč<\/b>\/os\.<\/span>/);
  assert.equal((html.match(/class="pp"/g) || []).length, 1, 'jen jedna velká částka');
  assert.match(html, /<b>2 018 Kč<\/b><\/span><div class="cache-mark">orientační<\/div><\/div><div class="pd pt pr-row">/);
  // rodina: 2 dospělí + dítě + miminko → 3 sedadla, miminko platí jen poplatek aerolinky
  const fam = rows(M.priceRows({ per: 1000, total: 3000, ret: true, q: { adults: 2, children: 1, infants: 1 }, door: 1500 }));
  assert.equal(fam[0], 'Letenky 1 000 Kč/os. · celkem za 3 osoby (bez poplatku za miminko) 3 000 Kč');
  assert.equal(fam[1], 'S cestou na letiště a do města ~1 500 Kč/os. · pro 3 ~4 500 Kč (odhad)');
  // karta nabídky ji skládá z priceRows; řádek „S cestou…“ jen při řazení, které s cestou počítá, a ne v 📌 Porovnat
  assert.match(fl, /<div class="pbox">\$\{priceRows\(\{ per: t\.perPersonCzk, total: t\.totalCzk, ret: t\.back, q, door: ex && tripOn\(t\) \? t\.tripCzk : null, mark: cacheMark\(SearchHelp\.isCached\(t\)\) \}\)\}/);
  assert.match(fl, /<div class="pbox">\$\{priceRows\(\{ per: r\.czk, total: r\.czk \* pax, ret: r\.d2, q: \{ adults: pax \} \}\)\}<\/div>/, '📌 karta z radaru');
  assert.ok(!fl.includes('na osobu</div>${ex ? tripLine'), 'starý zápis je pryč');
  assert.ok(!/celkem \$\{pax\} os\./.test(fl));
});

test('řádky výpisu: „i s cestou ~2 481 Kč/os.“ s jednotkou', () => {
  assert.match(fl, /i s cestou ~\$\{czk\(t\.tripCzk\)\}\/os\.<\/small>/);
  assert.ok(!/i s cestou ~\$\{czk\(t\.tripCzk\)\}<\/small>/.test(fl));
});

test('řádek ověření: jen u orientační ceny (některý let má live === false)', () => {
  assert.equal(M.verifyRow(rt(true), 2), '', 'živá cena');
  assert.equal(M.verifyRow(ow(true), 1), '');
  assert.equal(M.verifyRow({ id: 'x', out: { from: 'PRG', to: 'BCN', date: '2027-02-01' }, back: null }, 1), '', 'bez příznaku live = živá');
  const html = M.verifyRow(rt(false), 2);
  assert.match(html, /^<div class="tr-ver"><div class="tv-acts"><a class="tv-alt" href="https:\/\/www\.google\.com\/travel\/flights\?hl=cs&curr=CZK&q=Flights%20to%20BCN%20from%20PRG%20on%202027-02-01%20through%202027-02-05" target="_blank" rel="noopener">Ověřit cenu v Google Letech ↗<\/a>/);
  assert.match(html, /<a class="tv-alt" href="https:\/\/www\.skyscanner\.cz\/transport\/flights\/prg\/bcn\/270201\/270205\/\?adults=2&rtn=1" target="_blank" rel="noopener">Skyscanner ↗<\/a><\/div>/);
  assert.match(html, /<div class="tv-note">Aktuální cenu a volná místa uvidíš až u prodejce\.<\/div><\/div>$/);
  // stačí jeden orientační let (tam živě, zpět z mezipaměti)
  const mix = rt(true); mix.back.live = false;
  assert.match(M.verifyRow(mix, 1), /Ověřit cenu v Google Letech ↗/);
  // jen tam
  assert.match(M.verifyRow(ow(false), 1), /q=Flights%20from%20PRG%20to%20BCN%20on%202027-02-01%20one%20way"[^>]*>Ověřit cenu v Google Letech ↗<\/a><a class="tv-alt" href="[^"]+\/prg\/bcn\/270201\/\?adults=1&rtn=0"/);
  // návrat z jiného letiště: dva jednosměrné dotazy na Google, Skyscanner ne
  const j = M.verifyRow(jaw(false), 1);
  assert.match(j, />Ověřit let tam v Google Letech ↗<\/a><a class="tv-alt" href="[^"]+Flights%20from%20GRO%20to%20VIE%20on%202027-02-05%20one%20way"[^>]*>Let zpět ↗<\/a>/);
  assert.ok(!j.includes('skyscanner'));
  // přímé odkazy na weby aerolinek v řádku ověření nejsou (čeká se na jejich souhlas)
  for (const h of [html, j]) assert.deepEqual([...h.matchAll(/href="https:\/\/([^/"]+)/g)].map(m => m[1]).filter(d => !/^www\.(google\.com|skyscanner\.cz)$/.test(d)), []);
});

test('živá cena: odkazy v řádku „Ověřit:“ jako dřív', () => {
  assert.equal(M.verifyLinks(rt(true), 2),
    '<a href="https://www.google.com/travel/flights?hl=cs&curr=CZK&q=Flights%20to%20BCN%20from%20PRG%20on%202027-02-01%20through%202027-02-05" target="_blank" rel="noopener">Google Flights</a>'
    + ' · <a href="https://www.skyscanner.cz/transport/flights/prg/bcn/270201/270205/?adults=2&rtn=1" target="_blank" rel="noopener">Skyscanner</a>');
  assert.match(M.verifyLinks(jaw(true), 1), />tam \(Google\)<\/a> · <a [^>]+>zpět \(Google\)<\/a>$/);
});

test('karta nabídky: řádek ověření pod cenou, u orientační ceny zbytek bez „Ověřit:“; u živé dnešní podoba', () => {
  assert.match(fl, /<div class="tr-more">\$\{SearchHelp\.isCached\(t\) \? more\.slice\(3\) : `<span class="faint">Ověřit:<\/span> \$\{verifyLinks\(t\)\}\$\{more\}`\}<\/div>\n\s+<\/div>\$\{verifyRow\(t, lastResult\.query\.adults\)\}<\/div>`;/);
  // „more“ začíná oddělovačem „ · “ (slice(3) ho u orientační ceny uřízne) a končí 📌 a 📤
  assert.match(fl, /const more = `\$\{SearchHelp\.isCached\(t\) && liveOn\(\) \? ` · <button[^\n]+ · <button type="button" class="linkbtn pin-l" data-pin="\$\{idx\}">[^\n]+📤 Sdílet<\/button>`;/);
  // odkazy aspoň 44 px (od ux2 oba textové – nákup je nad nimi); na telefonu hned pod cenou (cena i ověření před lety)
  assert.match(css, /\.tv-alt\{[^}]*min-height:44px;/);
  const phone = css.match(/@media\(max-width:560px\)\{\n  \.trip-row\{grid-template-columns:1fr\}[\s\S]*?\n\}/);
  assert.ok(phone, 'blok telefonu');
  assert.match(phone[0], /\.trip-row>\.pbox\{order:-1\}\n  \.trip-row>\.tr-ver\{order:-1[;}]/);
  assert.match(css, /@media\(max-width:1080px\)\{[\s\S]*?\.trip-row>\.tr-act\{order:1\}/);
});

test('tlačítko prodejce: u orientační ceny „Otevřít na Aviasales ↗“, u živé „Koupit“', () => {
  assert.match(M.bookButtons(rt(false)), />Otevřít na Aviasales ↗<\/a>$/);
  assert.match(M.bookButtons(ow(false)), />Otevřít na Aviasales ↗<\/a>$/);
  assert.match(M.bookButtons(rt(true)), />Koupit na Aviasales ↗<\/a>$/);
  assert.match(M.bookButtons({ ...ow(true), provider: 'ryanair' }), />Koupit u ryanair ↗<\/a>$/);
});
