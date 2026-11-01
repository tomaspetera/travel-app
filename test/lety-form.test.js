// Formulář Letů: sekce „Cestující, zavazadla a další“ (dřív „Další možnosti“) – pořadí polí, jízdné, sbalený seznam letišť.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const src = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/flights.css', import.meta.url), 'utf8');
const more = html.slice(html.indexOf('<details class="more" id="moreOpts">'), html.indexOf('</details>\n\n', html.indexOf('id="moreOpts"')));

test('sekce se jmenuje podle toho, co v ní je, a pole jdou podle důležitosti – doprava na letiště a z letiště až na konci', () => {
  assert.match(more, /<summary><span class="more-t">Cestující, zavazadla a další<\/span><span class="faint" id="moreSummary"><\/span><\/summary>/);
  const at = id => { const i = more.indexOf(`id="${id}"`); assert.ok(i > 0, id); return i; };
  const order = ['paxBtn', 'maxPrice', 'bags', 'directOnly', 'openJaw', 'outDays', 'backDays', 'groundOn', 'groundMode', 'kmHalf', 'gmOwn', 'gmCar', 'arrivalOn'];
  assert.deepEqual(order.map(at), order.map(at).slice().sort((a, b) => a - b), 'pořadí polí');
  // na víc sloupcích (počítač) se Max. cena a Lety posunou vedle Cestujících – Zavazadla jsou přes celou šířku
  assert.match(css, /\.more-grid\{[^}]*grid-auto-flow:row dense/);
});

test('seznam letišť s vlastní cenou je sbalený pod jedním řádkem; styly sekce nesahají na jeho summary', () => {
  assert.match(more, /<details class="gm-own" id="gmOwn" hidden><summary><span class="gm-own-t">✏️ Jezdíš levněji\? Uprav cenu<\/span><span class="faint" id="gmOwnSum"><\/span><\/summary>/);
  assert.ok(more.indexOf('id="gmOwnList"') > more.indexOf('id="gmOwn"'));
  // details.more summary (bez >) by vnořenému summary dal ikonu 🧳, šipku i odsazení hlavičky sekce
  assert.doesNotMatch(css, /details\.more(\[open\])? summary/);
  // souhrn sbaleného seznamu: počet letišť, nebo kde už platí tvoje cena
  const m = src.match(/\$\('#gmOwnSum'\)\.textContent = ([^;]+);/);
  assert.ok(m);
  const sum = new Function('mine', 'aps', `return ${m[1]};`);
  assert.equal(sum([], [1, 2, 3, 4, 5]), '5 letišť');
  assert.equal(sum([], [1, 2]), '2 letiště');
  assert.equal(sum([], [1]), '1 letiště');
  assert.equal(sum(['PRG', 'PED'], [1, 2, 3]), 'tvoje: PRG, PED');
});

test('jízdné: zaškrtnuté poloviční = násobek 0,5; jiný násobek ze staršího hledání ukáže pole „jízdné ×“', () => {
  assert.match(more, /<input type="checkbox" id="kmHalf"> poloviční jízdné \(žák, student, senior\)/);
  assert.match(more, /<label class="gm-in" id="kmRateOwn" hidden[^>]*>jízdné × <input class="input xs" type="number" id="kmRate" value="1"/);
  assert.match(css, /\.field label\.gm-in\[hidden\]\{display:none\}/, 'label.gm-in má display:inline-flex – bez toho by hidden nefungoval');
  const fn = src.match(/function paintKmRate\(\) \{[\s\S]*?\n {2}\}/);
  assert.ok(fn, 'paintKmRate');
  const run = (value, focused = false) => {
    const el = { kmRate: { value }, kmHalf: { checked: null }, kmRateOwn: { hidden: false } };
    const $ = s => el[s.slice(1)];
    const document = { activeElement: focused ? el.kmRate : null };
    new Function('$', 'document', `${fn[0]}; paintKmRate();`)($, document);
    return { half: el.kmHalf.checked, own: !el.kmRateOwn.hidden };
  };
  assert.deepEqual(run('1'), { half: false, own: false });
  assert.deepEqual(run('0.5'), { half: true, own: false });
  assert.deepEqual(run('0.7'), { half: false, own: true }, 'starší vlastní násobek zůstane vidět');
  assert.deepEqual(run('0'), { half: false, own: true }, '× 0 = nepočítat – jde vrátit');
  // pole, do kterého se zrovna píše, nezmizí pod rukama (napsané „1“ ho schová až po opuštění)
  assert.deepEqual(run('1', true), { half: false, own: true });
  // zaškrtávátko přepíše #kmRate a pošle change – náhled letišť, ↻ Přepočítat a koncept jako při ruční změně
  assert.match(src, /\$\('#kmHalf'\)\.onchange = e => \{ e\.stopPropagation\(\); \$\('#kmRate'\)\.value = e\.target\.checked \? '0\.5' : '1'; \$\('#kmRate'\)\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\); \};/);
});

test('souhrn sekce vždy řekne, kdo letí a s jakým zavazadlem (cena na tom stojí), ostatní jen když se liší', () => {
  const m = src.match(/const bits = \[([^\n]+)\];\n/);
  assert.ok(m, 'bits');
  const BAG = src.match(/const BAG_SUM = (\{[^}]+\});/);
  const SearchHelp = { paxTxt: f => `${f.adults} dosp. (txt)`, paxShort: f => `${f.adults} dosp. + děti` };
  const bits = new Function('f', 'SearchHelp', `const BAG_SUM = ${BAG[1]}; return [${m[1]}];`);
  assert.deepEqual(bits({ adults: 1, children: 0, infants: 0, bags: 'none' }, SearchHelp), ['1 dosp. (txt)', 'jen malé zavazadlo']);
  assert.deepEqual(bits({ adults: 2, children: 1, infants: 0, bags: 'cabin' }, SearchHelp), ['2 dosp. + děti', 's kabinovým kufrem']);
  assert.deepEqual(bits({ adults: 2, children: 0, infants: 0, bags: undefined }, SearchHelp), ['2 dosp. (txt)', 'jen malé zavazadlo'], 'starší hledání bez zavazadel');
  assert.match(src, /if \(\+f\.kmRate === 0\.5\) bits\.push\('poloviční jízdné'\);/);
  assert.match(src, /\$\('#moreSummary'\)\.textContent = bits\.join\(' · '\);/);
});

test('cesta na letiště vypnutá: volby k ní se schovají (dřív jen zešedly)', () => {
  assert.match(css, /\.gm-off \.gm-row,\.gm-off \.gm-opt\{display:none\}/);
  assert.match(src, /\$\('\.gm-field'\)\.classList\.toggle\('gm-off', !f\.ground\);/);
});

test('Upřesnit: počet nocí hned pod volbami délky pobytu, odkaz „Kdy si vzít dovolenou“ až pod ním', () => {
  assert.ok(html.indexOf('id="lenPreset"') < html.indexOf('id="nightsRow"'));
  assert.ok(html.indexOf('id="nightsRow"') < html.indexOf('id="leavePlan"'));
});

test('texty v aplikaci odkazují na nový název sekce (Další možnosti už ve formuláři není)', () => {
  for (const f of ['flights.js', 'searchhelp.js', 'data.js']) {
    const js = readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(js, /Další možnosti/, f);
  }
  assert.doesNotMatch(html, /Další možnosti/);
});

test('horní část formuláře: rozmezí odletu má popisek, okruh letišť říká co je, u letišť stojí, že jdou vyřadit', () => {
  // „2 týdny“ bez popisku splývalo s délkou pobytu „2 týdny“ v Upřesnit
  assert.match(html, /<div class="quick-range" id="quickRange" role="group" aria-label="Rozmezí odletu">[\s\S]*?<span class="qr-l" aria-hidden="true">rozmezí<\/span><button type="button" data-d="14">2 týdny<\/button>/);
  assert.match(html, /<span class="muted">letiště v okruhu<\/span>/);
  // delší popisek: posuvník se musí umět zúžit, jinak „200 km“ na telefonu vyteče z karty
  assert.match(css, /\.radius-row input\{flex:1;min-width:0;/);
  assert.match(src, /host\.insertAdjacentHTML\('beforeend', '<span class="faint op-hint">klepnutím letiště vyřadíš z hledání \(přeškrtne se\)<\/span>'\);/);
});
