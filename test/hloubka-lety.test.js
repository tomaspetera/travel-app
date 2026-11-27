// Podrobné počty v Letech (vrstva 1B, jen se zapnutou pomocí „Pomáhat se zlepšováním“): čisté funkce ze searchhelp.js
// a pwa.js přes node:vm a zdrojové testy zapojení ve flights.js – každý název právě na jednom místě, jen přes Count.deep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const { EVENTS } = await import('../server/lib/counts.js');

const ctx = { window: {} };
vm.runInNewContext(read('public/js/searchhelp.js'), ctx);
const H = ctx.window.SearchHelp;

const NAMES = ['fix_date', 'fix_place', 'fix_filter', 'fix_warm', 'fix_ground', 'buy_age_warn', 'place_none_from', 'place_none_to',
  'sentence_ok', 'sentence_miss', 'sentence_nofrom', 'form_err_from', 'form_err_range', 'form_err_date', 'form_err_multi',
  'search_redo', 'search_slow', 'api_fail_down', 'res_all_hidden', 'res_filters', 'res_sort', 'res_view_map', 'res_view_cal',
  'res_best_jump', 'buy_rank_1', 'buy_rank_2_5', 'buy_rank_6p'];

test('27 názvů Letů je v EVENTS serveru', () => {
  assert.equal(NAMES.length, 27);
  assert.deepEqual(NAMES.filter((e) => !EVENTS.includes(e)), []);
});

test('fixKind: druh nápovědy jen u prázdného výsledku, u neprázdného (Málo výsledků?) nic', () => {
  const empty = { groups: [] }, some = { groups: [{}] };
  const cases = { flex1: 'fix_date', flex3: 'fix_date', anyDay: 'fix_date', longer: 'fix_date', nights: 'fix_date', month: 'fix_date', oneway: 'fix_date',
    hubs: 'fix_place', radius: 'fix_place', country: 'fix_place', continent: 'fix_place', anywhere: 'fix_place',
    clearTime: 'fix_filter', 'clear:stops': 'fix_filter', 'clear:maxPrice': 'fix_filter', noPrice: 'fix_filter', noDirect: 'fix_filter',
    warm: 'fix_warm', ground: 'fix_ground' };
  for (const [k, e] of Object.entries(cases)) {
    assert.equal(H.fixKind(k, empty), e, k);
    assert.equal(H.fixKind(k, some), null, `${k} u neprázdného`);
  }
  assert.equal(H.fixKind('neznamy', empty), null);
  assert.equal(H.fixKind('flex1', null), null, 'bez výsledku nic');
  // cesta přes víc měst: prázdná podle kombinací, groups tam bývá prázdné i s nabídkami
  assert.equal(H.fixKind('clear:time', { mode: 'multi', groups: [], combos: [{}] }), null);
  assert.equal(H.fixKind('clear:time', { mode: 'multi', groups: [], combos: [] }), 'fix_filter');
  // každý klíč, který smartActions může vrátit, má druh (jinak by se klepnutí tiše nepočítalo)
  const sa = body(read('public/js/searchhelp.js'), 'function smartActions(', '\n  }\n');
  const keys = [...sa.matchAll(/(?:add\(|key: )'([a-zA-Z0-9:]+)/g)].map((m) => m[1]);
  assert.ok(keys.length >= 10);
  assert.deepEqual(keys.filter((k) => !H.fixKind(k, empty)), []);
});

test('formErrKind: stejné pořadí kontrol jako startSearch', () => {
  const T = '2027-01-12';
  const base = { from: [{ id: 'ap:PRG' }], trip: 'return', dateMode: 'flex', dFrom: '2027-02-01', dTo: '2027-03-01' };
  assert.equal(H.formErrKind(base, T), null);
  assert.equal(H.formErrKind({ ...base, from: [] }, T), 'form_err_from');
  assert.equal(H.formErrKind({ ...base, from: [], trip: 'multi' }, T, { msg: 'x' }), 'form_err_from', 'odkud se kontroluje první');
  assert.equal(H.formErrKind({ ...base, trip: 'multi' }, T, { msg: 'x' }), 'form_err_multi');
  assert.equal(H.formErrKind({ ...base, trip: 'multi' }, T, null), null);
  assert.equal(H.formErrKind({ ...base, dTo: '2027-01-20' }, T), 'form_err_range', 'konec před začátkem');
  assert.equal(H.formErrKind({ ...base, dTo: '2028-01-07' }, T), 'form_err_range', 'víc než 359 dní dopředu');
  assert.equal(H.formErrKind({ ...base, dTo: '2028-01-06' }, T), null);
  const ex = { ...base, dateMode: 'exact', xOut: '2027-02-01', xBack: '2027-02-05' };
  assert.equal(H.formErrKind(ex, T), null);
  assert.equal(H.formErrKind({ ...ex, xOut: '' }, T), 'form_err_date');
  assert.equal(H.formErrKind({ ...ex, xOut: '2027-01-11' }, T), 'form_err_date', 'odlet v minulosti');
  assert.equal(H.formErrKind({ ...ex, xBack: '2027-01-31' }, T), 'form_err_date', 'návrat před odletem');
  assert.equal(H.formErrKind({ ...ex, trip: 'oneway', xBack: '' }, T), null);
});

test('buyRank: 1., 2.–5., 6. a dál; mimo výpis nic', () => {
  assert.deepEqual([0, 1, 4, 5, 30].map(H.buyRank), ['buy_rank_1', 'buy_rank_2_5', 'buy_rank_2_5', 'buy_rank_6p', 'buy_rank_6p']);
  assert.equal(H.buyRank(-1), null);
  assert.equal(H.buyRank(undefined), null);
});

test('pwa.js every(): výpadek serveru nejvýš 1× za minutu', () => {
  const c = { window: {} };
  vm.runInNewContext(read('public/js/pwa.js'), c);
  const due = c.window.Pwa.every(60e3);
  assert.deepEqual([due(1000), due(2000), due(60999), due(61000), due(62000)], [true, false, false, true, false]);
  const src = read('public/js/pwa.js');
  // jen převedená chyba sítě a ne offline (netError vrací jiný objekt), jen přes Count.deep
  assert.match(src, /if \(err !== e && !err\.offline && window\.Count && Count\.deep && downDue\(\)\) Count\.deep\('api_fail_down'\);/);
  assert.match(src, /const downDue = every\(60e3\);/);
});

/* ---------- zdrojové testy zapojení ---------- */
const FL = read('public/js/flights.js');
const JS = readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'statistiky.js')
  .map((f) => [f, read(`public/js/${f}`)]);
const body = (src, start, end) => {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
};

test('každý název je v aplikaci vypsaný celý právě na jednom místě', () => {
  for (const e of NAMES) {
    const hits = JS.flatMap(([f, s]) => (s.split(`'${e}'`).length - 1 ? Array(s.split(`'${e}'`).length - 1).fill(f) : []));
    assert.equal(hits.length, 1, `${e}: ${hits.join(', ') || 'nikde'}`);
  }
});

test('flights.js: podrobné počty jen přes Count.deep, žádný nový Count.hit', () => {
  const hits = [...FL.matchAll(/Count\.hit\(([^)]*)\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(hits, ["'search_anywhere'", "'search_done'", "k === 'buy' ? 'buy_click' : 'verify_click'"]);
  // každé volání Count.deep je za kontrolou, že ho count.js má (starší count.js v otevřené záložce deep nemá)
  for (const line of FL.split('\n').filter((l) => l.includes('Count.deep('))) {
    assert.ok(/Count && Count\.deep/.test(line) || /^\s*if \((formErr|ev)\) Count\.deep\(/.test(line), line.trim());
  }
  assert.match(FL, /const formErr = window\.Count && Count\.deep \? SearchHelp\.formErrKind\(/);
  assert.match(FL, /const ev = window\.Count && Count\.deep \? SearchHelp\.fixKind\(key, lastResult\) : null;/);
  const rank = body(FL, "if (k === 'buy' && view.mode === 'list' && window.Count && Count.deep) {", 'if (ev) Count.deep(ev);');
  // Přehled cílů (Kamkoliv, země): .trip-row je jen v rozbalené kartě za řádkem cíle – pořadí podle .cmp-row, ne 0
  assert.match(rank, /row\.closest\('\.cmp-card'\)/);
  assert.match(rank, /SearchHelp\.buyRank\(card \? \$\$\('\.cmp-row', list\)\.indexOf\(card\.previousElementSibling\) : \$\$\('\.trip-row, \.trip-mini', list\)\.indexOf\(row\)\)/);
  // karta cíle je v přehledu sourozenec řádku (ne uvnitř), jinak by previousElementSibling nebyl .cmp-row
  assert.match(FL, /<\/div>\$\{open \? `<div class="cmp-card">\$\{groupCard\(g\)\}<\/div>` : ''\}`;/);
});

test('fix_* jen přes fixKind (prázdný výsledek) z nápovědy, čipu filtru a teploty', () => {
  assert.ok(!/'fix_/.test(FL), 'názvy fix_* jsou jen v searchhelp.js za kontrolou resEmpty');
  assert.match(body(read('public/js/searchhelp.js'), 'function fixKind(', '\n  }'), /if \(!resEmpty\(res\)\) return null;/);
  const help = body(FL, 'function wireHelp(host) {', '$$(\'[data-gshow]\'');
  assert.match(help, /if \(!a\) return; fixHit\(a\.key\);/);
  assert.match(FL, /b\.onclick = \(\) => \{ fixHit\('clear:' \+ b\.dataset\.af\); clearFilter/);
  assert.match(FL, /b\.onclick = \(\) => \{ fixHit\('warm'\); setMinTemp/);
});

test('place_none_* v PlaceInput.fetch() po plném dohledání, ne v open(); příznak maže close()', () => {
  const fetchBody = body(FL, '    async fetch() {', '\n    open(err) {');
  assert.match(fetchBody, /const r = await this\.lookup\(q, signal\);[\s\S]*if \(!r\.hit && !r\.items\.length && q === this\.input\.value\.trim\(\) && !this\.noneSent\)[\s\S]*Count\.deep\(this\.origin \? 'place_none_from' : 'place_none_to'\)/);
  assert.doesNotMatch(body(FL, '\n    open(err) {', '\n    close() {'), /place_none|Count\./);
  assert.match(FL, /close\(\) \{ this\.noneSent = false;/);
});

test('ostatní háčky na místě: hledání, věta, výsledky, nákup', () => {
  const start = body(FL, 'async function startSearch(opts = {}) {', '\n  // Průběžný výsledek');
  assert.match(start, /if \(running\) \{ running\.ctl\.abort\(\); if \(window\.Count && Count\.deep\) Count\.deep\('search_redo'\); \}/);
  assert.match(start, /if \(e\.name === 'AbortError'\) return;\n.*\n\s+if \(e\.timeout && window\.Count && Count\.deep\) Count\.deep\('search_slow'\);/);
  // ↺ Začít znovu ruší hledání taky, ale to není „jiné hledání“
  assert.doesNotMatch(body(FL, 'function resetSearch() {', '\n  }'), /search_redo/);
  assert.match(body(FL, 'function smartRun(hit, from) {', '\n  }'), /'sentence_nofrom' : hit\.miss && hit\.miss\.length \? 'sentence_miss' : 'sentence_ok'/);
  assert.match(body(FL, 'function ageBuy(e) {', '\n  }'), /e\.preventDefault\(\);\n\s+ageWarned = at;\n\s+if \(window\.Count && Count\.deep\) Count\.deep\('buy_age_warn'\);/);
  const wr = body(FL, 'function wireResults() {', '$$(\'[data-fo]\'');
  for (const e of ['res_sort', 'res_best_jump', 'res_filters', 'res_view_map', 'res_view_cal']) assert.ok(wr.includes(`deep('${e}')`), e);
  // filtry jen při otevření, pohled jen při skutečném přepnutí (ne klepnutí na už vybraný)
  assert.match(wr, /if \(!open\) view\.timeOpen = false; else deep\('res_filters'\);/);
  assert.match(wr, /if \(b\.dataset\.v !== view\.mode\) \{ if \(b\.dataset\.v === 'map'\)/);
  // hodnoty data-v ve #viewSeg: map a cal opravdu existují
  assert.match(FL, /\['map', 'Mapa'\], \['cal', 'Kalendář'\]\]/);
  // všechno skryly filtry: 1× za výsledek (překreslení stejného výsledku se nepočítá znovu)
  assert.match(FL, /Count\.deep\('res_all_hidden', String\(lastResultAt\)\)/);
});

test('statistiky: řádky Letů jen s názvy z EVENTS a všech 27 se ukáže', async () => {
  const c = { window: {} };
  vm.createContext(c);
  vm.runInContext(read('public/js/statistiky.js'), c);
  const S = c.window.Stats;
  const used = [...S.FL_SNAGS, ...S.FL_FIX, ...S.FL_RES].flatMap(([e, bases]) => [e, ...bases]).concat(S.FL_RANK.opts.map(([e]) => e));
  assert.deepEqual(used.filter((e) => !EVENTS.includes(e)), []);
  assert.deepEqual(NAMES.filter((e) => !used.includes(e)), []);
  const r = S.rates({ search_empty: 40, fix_date: 10, fix_place: 2 }, S.FL_FIX);
  assert.equal(r[0].e, 'fix_date');
  assert.equal(r[0].per100, 25);
  assert.equal(r[0].few, false);
});
