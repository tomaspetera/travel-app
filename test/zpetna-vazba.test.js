// Testovací verze a krátké otázky testerům (public/js/otazky.js): kdy smí otázka přijít (nejvýš 1 denně, nikdy během
// hledání a psaní, „Teď ne“, zodpovězená se nevrátí, nejvýš 2 dny bez odpovědi), výběr otázky, karta bez volného
// textu bez FEEDBACK_EMAIL, e-mail s předvyplněnou otázkou a zapojení do Přehledu a okna Další.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(read('public/js/about.js'), ctx);
vm.runInContext(read('public/js/otazky.js'), ctx);
const O = ctx.window.Otazky, A = ctx.window.About;

const D1 = '2027-01-12', D2 = '2027-01-13', D3 = '2027-01-14';

test('pick(): nic během hledání, psaní nebo jiné prosby; po hledání „Našel jsi…“, po cestě průvodce, od 3. dne návštěvy „Co tě sem vrací?“', () => {
  assert.equal(O.pick({}, { busy: true, search: true }, D1), null);
  assert.equal(O.pick({}, { search: false, trip: false }, D1), null, 'bez důvodu se neptá');
  assert.equal(O.pick({}, { search: true, trip: true }, D1), 'found', 'přednost má hledání');
  assert.equal(O.pick({ done: ['found'] }, { search: true, trip: true }, D1), 'miss');
  let st = O.visit(O.visit({}, D1), D2);
  assert.equal(O.pick(st, {}, D2), null, '2. den návštěvy ještě ne');
  st = O.visit(O.visit(st, D2), D3);
  assert.equal(st.v, 3, 'tentýž den se znovu nepočítá');
  assert.equal(O.pick(st, {}, D3), 'back');
  assert.equal(O.pick(null, { search: true }, D1), 'found', 'poškozený nebo chybějící stav = prázdný');
  assert.equal(O.pick('x', { search: true }, D1), 'found');
});

test('nejvýš 1 otázka denně: ukázaná se ten den vrací, jiná ne; Teď ne ji pro dnešek zavře; zodpovězená se nevrátí', () => {
  let st = O.shown({}, 'found', D1);
  assert.equal(O.pick(st, { search: true, trip: true }, D1), 'found', 'po překreslení Přehledu tatáž');
  assert.equal(O.pick(st, { busy: true, search: true }, D1), null);
  const no = O.later(st, D1);
  assert.equal(O.pick(no, { search: true, trip: true }, D1), null, 'Teď ne: dnes už nic');
  assert.equal(O.pick(no, { search: true, trip: true }, D2), 'found', 'zítra znovu');
  const ans = O.answer(st, 'found');
  assert.equal(O.pick(ans, { search: true, trip: true }, D1), null, 'po odpovědi dnes už nic');
  assert.equal(O.pick(ans, { search: true, trip: true }, D2), 'miss', 'zítra jiná, zodpovězená ne');
  assert.deepEqual(plain(O.answer(ans, 'found').done), ['found'], 'bez zdvojení');
});

test('otázka bez odpovědi se ukáže nejvýš ve 2 dnech, pak přijde další', () => {
  let st = O.shown({}, 'found', D1);
  st = O.shown(st, 'found', D1); // překreslení týž den se nepočítá
  assert.equal(st.n.found, 1);
  st = O.shown(st, 'found', D2);
  assert.equal(st.n.found, 2);
  assert.equal(O.pick(st, { search: true }, D3), null);
  assert.equal(O.pick(st, { search: true, trip: true }, D3), 'miss');
});

test('karta: volby A–D, „Jiné – napiš“ jen s FEEDBACK_EMAIL, Teď ne, oblast role=status už předem', () => {
  const bare = O.cardHtml('found', null), mail = O.cardHtml('found', 'ahoj@letsi.example');
  for (const html of [bare, mail]) {
    assert.match(html, /Našel jsi, co jsi hledal\?/);
    assert.equal((html.match(/data-ask="mq_found_(yes|almost|no|price)"/g) || []).length, 4);
    assert.match(html, /id="askNo">Teď ne</);
    assert.match(html, /role="status"/);
    assert.match(html, /role="group" aria-labelledby="askQ"/);
    assert.doesNotMatch(html, /<input|<textarea|contenteditable/, 'volný text se v aplikaci nepíše');
  }
  assert.doesNotMatch(bare, /mq_found_other|Jiné/);
  assert.match(mail, /data-ask="mq_found_other">Jiné – napiš</);
  assert.equal(O.cardHtml('nic', 'a@b.cz'), '');
  // každá otázka má 4 volby + Jiné
  for (const q of O.QS) assert.deepEqual([q.opts.length, q.opts.at(-1)[1]], [5, 'Jiné – napiš'], q.id);
});

test('e-mail k odpovědi: předvyplněná otázka a odpověď v těle, jen s platnou adresou', () => {
  const url = A.mailto('ahoj@letsi.example', '2027-01-12a', 'krátká otázka', O.mailBody('Co tě sem vrací?', 'Jiné'));
  assert.equal(url, `mailto:ahoj@letsi.example?subject=${encodeURIComponent('Letsi – zpětná vazba (verze 2027-01-12a, obrazovka: krátká otázka)')}&body=${encodeURIComponent('Otázka: Co tě sem vrací?\nOdpověď: Jiné\n\n')}`);
  assert.equal(A.mailto('x', 'v', 's', 'b'), null);
  assert.doesNotMatch(A.mailto('a@b.cz', 'v', 's'), /body=/, 'bez těla jako dřív');
});

test('zapojení: karta na Přehledu (ne při uvítání a vedle souhlasu), tip počká, značka v Další a v panelu, skript v index.html', () => {
  const app = read('public/js/app.js'), html = read('public/index.html'), src = read('public/js/otazky.js');
  assert.match(app, /if \(window\.Otazky\) Otazky\.render\(\$\('#askCard'\), wnFirst \|\| !\$\('#whatsNew'\)\.hidden\);\n  renderDashTip\(\);/);
  assert.match(app, /if \(typeof Otazky !== 'undefined' && Otazky\.pending\(\)\) \{ el\.hidden = true;/);
  assert.match(app, /if \(window\.Otazky\) Otazky\.addToMenu\(m\);/);
  assert.match(html, /<div class="card dash-tip ask-card" id="askCard" hidden><\/div>/);
  assert.match(html, /<script src="js\/plus\.js"><\/script>\n<script src="js\/otazky\.js"><\/script>/);
  // nikdy uprostřed úkolu: během hledání (Flights.busy) ani s kurzorem v poli
  assert.match(src, /busy: busy \|\| typing \|\| searching/);
  assert.match(src, /matches\('input, textarea, select, \[contenteditable\]'\)/);
  // odpověď stejnou cestou jako průzkum ceny: jen Count.hit s pevným názvem, žádný vlastní požadavek na server
  assert.match(src, /if \(window\.Count\) Count\.hit\(e\);/);
  assert.doesNotMatch(src, /fetch\(|sendBeacon|XMLHttpRequest/);
  // výzva „Napiš, co ti vadí“ je skrytá, dokud nepřijde platná adresa
  assert.match(src, /<a class="test-fb" id="\$\{id\}" hidden>Napiš, co ti vadí<\/a>/);
  assert.match(src, /if \(href\) \{ a\.href = href; a\.hidden = false; \}/);
  // panel na počítači: jen desktop CSS v @media
  assert.match(read('public/css/desktop.css'), /\.side-test\{/);
  assert.doesNotMatch(read('public/css/atlas.css'), /\.side-test/);
});
