// Formulář Letů: sekce „Cestující, zavazadla a další“ (dřív „Další možnosti“) – pořadí polí, jízdné, sbalený seznam letišť.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTINENT_BY_KEY, continentCountries } from '../server/lib/longhaul.js';

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
  assert.match(readFileSync(new URL("../public/css/desktop-flights.css", import.meta.url), "utf8"), /@media \(min-width:1024px\)\{\n  \/\*[^*]*\*\/\n  \.more-grid\{grid-auto-flow:row dense\}/);
});

test('seznam letišť s vlastní cenou je sbalený pod jedním řádkem; styly sekce nesahají na jeho summary', () => {
  assert.match(more, /<details class="gm-own" id="gmOwn" hidden><summary><span class="gm-own-t"><span class="ico i-upravit" aria-hidden="true"><\/span> Jezdíš levněji\? Uprav cenu<\/span><span class="faint" id="gmOwnSum"><\/span><\/summary>/);
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

test('schované pole „jízdné ×“ (vypnutá cesta na letiště, autem) je mimo kontrolu formuláře – neplatná hodnota nezablokuje hledání', () => {
  assert.match(src, /\$\('#kmRate'\)\.disabled = !f\.ground \|\| f\.groundMode === 'car';/);
});

test('autem bez cesty na letiště nic neomezuje: v dotazu veřejnou dopravou × 0, návrat i na jiné letiště jde zaškrtnout', () => {
  assert.match(src, /const carOn = \(\) => carMode\(\) && \$\('#groundOn'\)\.checked;/);
  assert.match(src, /function syncOpenJaw\(\) \{\n    const cb = \$\('#openJaw'\), car = carOn\(\);/);
  assert.match(src, /\['#groundOn', '#kmRate'\]\.forEach\(s => \$\(s\)\.onchange = \(\) => \{ syncOpenJaw\(\);/);
  const m = src.match(/const groundPayload = f => \{\n([\s\S]*?)\n  \};/);
  const gp = new Function('S', 'SearchHelp', `return f => {\n${m[1]}\n};`)({ accessOwn: {} }, { ownClean: () => null, carPayload: () => ({ carFuel: 'diesel' }) });
  assert.deepEqual(gp({ ground: false, groundMode: 'car', kmRate: 1 }), { kmRate: 0, groundMode: 'transit' });
  assert.deepEqual(gp({ ground: true, groundMode: 'car', kmRate: 1 }), { kmRate: 1, groundMode: 'car', carFuel: 'diesel' });
});

test('neplatné pole ve sbalené sekci se rozbalí – hledání potichu nestojí', () => {
  assert.match(src, /\$\('#searchForm'\)\.addEventListener\('invalid', e => \{\n      const d = e\.target\.closest\('details'\);\n      if \(d && !d\.open\) d\.open = true;/);
});

test('schovaná délka pobytu (jen tam, přesná data) je mimo kontrolu formuláře', () => {
  assert.match(src, /\$\('#nMin'\)\.disabled = \$\('#nMax'\)\.disabled = !\(ret && !exact\);/);
});

test('Max. cena bere libovolnou částku – krok 100 by 1550 Kč zablokoval bublinou prohlížeče', () => {
  const inp = html.match(/<input[^>]*id="maxPrice"[^>]*>/)[0];
  assert.match(inp, /step="1"/);
});

test('čip 🏙️ Evropa dá do Kam světadíl Evropa (ne kamkoliv s Alžírskem a Tuniskem)', () => {
  assert.match(src, /else if \(k === 'eu'\) toInput\.set\(\[\{ id: 'ct:europe', label: 'Evropa', flag: '🇪🇺' \}\]\);/);
  assert.doesNotMatch(src, /Evropa = kamkoliv/);
  // server světadíl zná a severní Afriku do něj nepočítá
  assert.equal(CONTINENT_BY_KEY.get('europe').cs, 'Evropa');
  const cc = continentCountries('europe');
  assert.ok(cc.includes('ES') && cc.includes('IT'));
  for (const x of ['DZ', 'TN', 'MA', 'EG']) assert.ok(!cc.includes(x), x);
});

test('Víc měst: přidané město smaže odkud návratu jen předvyplněné, ručně zadané zůstane', () => {
  const fn = src.match(/\n {2}function mlAdd\(\) \{[\s\S]*?\n {2}\}\n/)[0];
  const idsOf = items => (items || []).map(x => x.id).sort().join('|');
  const run = (legs, home) => {
    let out;
    const rows = Array.from({ length: 9 }, () => ({ to: { input: { focus() {} } } }));
    new Function('mlRead', 'ML_MAX', 'idsOf', 'fromInput', 'SearchHelp', 'addDays', 'mlRender', 'formEdited', 'mlRows',
      `let mlTouched; ${fn} mlAdd();`)(() => legs, 6, idsOf, { items: home }, { diffDays: () => 6 }, d => d, l => { out = l; }, () => {}, rows);
    return out;
  };
  const P = [{ id: 'ap:PRG' }], R = [{ id: 'ap:FCO' }], N = [{ id: 'ap:NAP' }];
  // Praha → Řím, Neapol → Praha: návrat z Neapole zůstane
  let l = run([{ from: P, to: R, date: '' }, { from: N, to: P, date: '' }], P);
  assert.equal(l.length, 3);
  assert.deepEqual(l[2].from, N);
  // Praha → Řím, Řím → Praha (předvyplněné): odkud návratu se uvolní pro nové město
  l = run([{ from: P, to: R, date: '' }, { from: R, to: P, date: '' }], P);
  assert.deepEqual(l[1].from, R);
  assert.deepEqual(l[2].from, []);
});

test('🔔 upozornění se nabízí jen na počítači – na telefonu ani tlačítko, ani dotaz na povolení', () => {
  const m = src.match(/const notifCtor = \(\) => ([\s\S]*?);\n/);
  assert.ok(m);
  const ok = (ua, { mobile = false, desk = true } = {}) => new Function('navigator', 'window', 'matchMedia', `return ${m[1]};`)(
    { userAgent: ua, userAgentData: { mobile } }, { matchMedia: 1 }, q => ({ matches: desk && /pointer: fine/.test(q) && /hover: hover/.test(q) }));
  const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
  assert.equal(ok(WIN), true);
  assert.equal(ok(WIN, { desk: false }), false, 'úzké okno / dotyk');
  assert.equal(ok(WIN, { mobile: true }), false);
  assert.equal(ok('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'), false);
  assert.equal(ok('Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0'), false);
  // na telefonu žádný text ani tlačítko; askNotif bez stavu „default“ o povolení neprosí
  assert.match(src, /notifCtor\(\) \? Alerts\.notifState\([^)]*\) : 'phone'/);
  assert.match(src, /phone: '',/);
  assert.match(src, /function askNotif\(\) \{\n {4}if \(notifOk\(\) !== 'default'\) return renderWatch\(\);/);
});

test('hlídání při plném úložišti nehlásí „uloženo“ – změna se vrátí a ohlásí', () => {
  const fn = src.match(/\n {2}function watchSave\(undo\) \{[\s\S]*?\n {2}\}\n/)[0];
  const mk = ok => {
    const log = [];
    const f = new Function('save', 'renderWatch', 'updateWatchBtn', 'updateWatchBadges', 'toast', `${fn} return watchSave;`)(
      () => (ok ? undefined : false), () => log.push('render'), () => {}, () => {}, (t, k) => log.push(k));
    return { f, log };
  };
  let undone = false;
  let x = mk(true);
  assert.equal(x.f(() => { undone = true; }), true);
  assert.equal(undone, false);
  x = mk(false);
  assert.equal(x.f(() => { undone = true; }), false);
  assert.equal(undone, true);
  assert.deepEqual(x.log, ['render', 'err']);
  // všechny změny seznamu hlídání jdou přes watchSave, ne holé save()
  const body = name => src.match(new RegExp(`\\n {2}(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}\\n`))[0];
  for (const name of ['addWatch', 'delWatch', 'setRoll']) {
    assert.match(body(name), /watchSave\(/, name);
    assert.doesNotMatch(body(name), /\bsave\(\)/, name);
  }
  assert.match(body('setTarget'), /if \(!done\) \{ save\(\); renderNews\(\); return; \}[\s\S]*watchSave\(/);
});

test('Flights.searchTo: termín prodlouženého víkendu (noci, dny, předvečer) jde do formuláře; bez nich beze změny', () => {
  const i = src.indexOf('  function searchTo(');
  const fn = src.slice(i, src.indexOf('\n  }\n', i) + 4);
  const run = (opts) => {
    const got = [];
    const searchTo = new Function('go', 'S', 'defaultForm', 'prefsOf', 'today', 'addDays', 'SearchHelp', 'setForm', 'askFrom', 'startSearch', `${fn} return searchTo;`)(
      () => {}, { form: { from: [{ id: 'ap:PRG' }], radius: 100 } },
      () => ({ from: [], trip: 'return', len: 'week', nMin: 5, nMax: 9, outDays: [], backDays: [], depAfter: null, dateMode: 'any' }),
      () => ({ adults: 2 }), () => '2026-11-28', (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10),
      { diffDays: (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) }, (f) => got.push(f), () => {}, () => {});
    searchTo([{ id: 'country:IT' }], opts);
    return got[0];
  };
  const to = [{ id: 'country:IT' }], base = { from: [{ id: 'ap:PRG' }], radius: 100, exclude: [], trip: 'return', len: 'week', adults: 2, to };
  // Doporučení (rozsah měsíce) jako dřív: noci a dny z výchozího formuláře
  assert.deepEqual(run({ dFrom: '2027-01-01', dTo: '2027-01-31' }), { ...base, nMin: 5, nMax: 9, outDays: [], backDays: [], depAfter: null, dateMode: 'flex', dFrom: '2027-01-01', dTo: '2027-01-31' });
  // prodloužený víkend (SearchHelp.holidayDates): Velikonoce 2027
  const h = { dFrom: '2027-03-25', dTo: '2027-03-26', nMin: 3, nMax: 4, outDays: [4, 5], backDays: [1], depAfter: { date: '2027-03-25', time: '16:00' } };
  assert.deepEqual(run(h), { ...base, ...h, dateMode: 'flex' });
  // jen část voleb: zbytek z výchozího formuláře
  assert.deepEqual(run({ dFrom: '2027-03-25', dTo: '2027-03-26', nMin: 3 }), { ...base, nMin: 3, nMax: 9, outDays: [], backDays: [], depAfter: null, dateMode: 'flex', dFrom: '2027-03-25', dTo: '2027-03-26' });
  // bez platného rozsahu (víkend už proběhl) noci a dny víkendu nezužují výchozí termín
  assert.deepEqual(run({ ...h, dFrom: '2026-03-25', dTo: '2026-03-26' }), { ...base, nMin: 5, nMax: 9, outDays: [], backDays: [], depAfter: null, dateMode: 'any' });
  // přesná data a nic jako dřív
  assert.equal(run({ xOut: '2027-02-01', xBack: '2027-02-05', nMin: 1 }).nMin, 5);
  assert.deepEqual(run(undefined), { ...base, nMin: 5, nMax: 9, outDays: [], backDays: [], depAfter: null, dateMode: 'any' });
});
