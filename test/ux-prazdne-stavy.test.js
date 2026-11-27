// Prázdné a pomalé stavy v čistém režimu (ceny jen z mezipaměti Aviasales): prázdné hledání v Letech a prázdný radar
// neříkají „nic jsem nenašel“, ale proč a kudy dál (Kamkoliv, delší termín, hledání trasy rovnou na Aviasales – odkaz
// ze serveru, žádné ceny navíc); dotaz na API, který přes 4 s visí u uspaného serveru, ukáže „Probouzím server…“.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { emptyTpSearch, search } = await import('../server/lib/search.js');

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const fl = read('public/js/flights.js');
/** Úsek zdroje mezi dvěma značkami (včetně první). */
function cut(from, to) {
  const a = fl.indexOf(from), b = fl.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `úsek „${from}“ ve flights.js`);
  return fl.slice(a, b);
}
const { cleanEmpty } = new Function(`${cut('  function cleanEmpty(res)', '  function emptyState(res)')}; return { cleanEmpty };`)();
const { radarEmptyTxt } = new Function(`${cut('  function radarEmptyTxt(', '  /** Prázdný radar:')}; return { radarEmptyTxt };`)();

function loadPwa() {
  const ctx = { window: {}, URL, console, setTimeout, clearTimeout, AbortController, AbortSignal };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/pwa.js'), ctx, { filename: 'pwa.js' });
  return ctx.window.Pwa;
}

const TP = [{ id: 'travelpayouts', state: 'done', found: 0, error: null }];
const route = (extra = {}) => ({ providers: TP, origins: [{ iata: 'BRQ' }], destination: { kind: 'airports', label: 'Barcelona' }, filters: { hidden: {} }, warm: null,
  tpSearch: { url: 'https://www.aviasales.com/search/BRQ0512BCN10122?currency=eur', from: 'BRQ', to: 'BCN' }, ...extra });

test('cleanEmpty: čistý režim a prázdná trasa → proč nic (48 h na Aviasales), Kamkoliv z letiště a odkaz na hledání na Aviasales', () => {
  const c = cleanEmpty(route());
  assert.equal(c.title, 'Na tohle zatím nemám cenu');
  assert.match(c.msg, /posledních 48 hodin hledali na Aviasales – z BRQ do cíle Barcelona pro tyhle termíny zatím nikdo\. Let přesto může existovat\./);
  assert.match(c.msg, /Zkus jiný termín, Kamkoliv z BRQ nebo hledání rovnou na Aviasales\.$/);
  assert.doesNotMatch(c.msg, /nenašel/, 'neobviňuje, neříká „nic není“');
  assert.equal(c.anywhere, 'BRQ');
  assert.deepEqual(c.link, route().tpSearch);
  // bez odkazu ze serveru (nebo s jiným než https) Aviasales neslibuje
  for (const tpSearch of [undefined, null, { url: 'javascript:alert(1)', from: 'BRQ', to: 'BCN' }]) {
    const n = cleanEmpty(route({ tpSearch }));
    assert.equal(n.link, null);
    assert.match(n.msg, /Zkus jiný termín nebo Kamkoliv z BRQ\.$/);
  }
  // víc letišť odletu
  assert.match(cleanEmpty(route({ origins: [{ iata: 'BRQ' }, { iata: 'VIE' }] })).msg, /z BRQ, VIE do cíle/);
});

test('cleanEmpty: Kamkoliv bez odkazu (Aviasales potřebuje cíl) – radí jiný měsíc nebo delší termín', () => {
  const c = cleanEmpty(route({ destination: { kind: 'anywhere', label: 'Kamkoliv' } }));
  assert.equal(c.link, null);
  assert.equal(c.anywhere, '', 'Kamkoliv už je');
  assert.match(c.msg, /– z BRQ pro tyhle termíny zatím nikdo\. Let přesto může existovat\. Zkus jiný měsíc nebo delší termín\.$/);
});

test('cleanEmpty: živý režim, chyba zdroje, skrývající filtr nebo „za teplem“ → null (původní hláška beze změny)', () => {
  assert.equal(cleanEmpty(route({ providers: [...TP, { id: 'ryanair', state: 'done' }] })), null, 'živé zdroje');
  assert.equal(cleanEmpty(route({ providers: [{ id: 'travelpayouts', error: 'Aviasales neodpověděl' }] })), null, 'výpadek – ne „nikdo nehledal“');
  assert.equal(cleanEmpty(route({ providers: [] })), null);
  assert.equal(cleanEmpty(route({ filters: { hidden: { maxPrice: 3 } } })), null);
  assert.equal(cleanEmpty(route({ filters: { hidden: { directOnly: 2 } } })), null);
  assert.equal(cleanEmpty(route({ warm: { minTemp: 25, dropped: 4 } })), null);
});

test('flights.js: prázdný výsledek v čistém režimu – nadpis a text z cleanEmpty, odkaz s rel/štítkem reklamy, Kamkoliv jen jednou', () => {
  const es = cut('  function emptyState(res)', '  function legHtml(');
  assert.match(es, /const cl = cleanEmpty\(res\), help = smartHelp\(res, true\);/, 'nápověda dřív – podle ní se Kamkoliv nezdvojí');
  assert.match(es, /!actReg\.some\(a => a\.key === 'anywhere'\)/);
  assert.match(es, /href="\$\{esc\(safeUrl\(cl\.link\.url\)\)\}" target="_blank" rel="\$\{buyRel\(cl\.link\.url\)\}">Hledat \$\{esc\(cl\.link\.from\)\} → \$\{esc\(cl\.link\.to\)\} na Aviasales ↗\$\{adTag\(cl\.link\.url\)\}/);
  assert.match(es, /<h2>\$\{cl \? cl\.title : /);
  assert.match(es, /\$\{cl \? esc\(cl\.msg\) : msg\}/);
  assert.match(fl, /\$\$\('\[data-anyw\]', host\)\.forEach\(b => b\.onclick = \(\) => \{ fixHit\('anywhere'\); rerun\(\{ to: \[\] \}\); \}\);/);
});

test('radarEmptyTxt: čistý režim – proč nic a Kamkoliv na delší termín; jinak text dotazu', () => {
  const q = (mode, extra = {}) => ({ mode, empty: `původní ${mode}`, ...extra });
  assert.equal(radarEmptyTxt(q('all'), false, '27. 3.'), 'původní all', 'živý režim beze změny');
  assert.equal(radarEmptyTxt(q('holiday', { none: true }), true), 'původní holiday', 'žádný prodloužený víkend – mezipaměť za to nemůže');
  assert.equal(radarEmptyTxt(q('all'), true, '27. 3.'), 'Orientační ceny beru z toho, co jiní cestující za posledních 48 hodin hledali na Aviasales – na příštích 6 týdnů z okolí zatím nic. Zkus větší okruh nebo Kamkoliv až do 27. 3.');
  assert.match(radarEmptyTxt(q('weekend'), true, '27. 3.'), /na víkendy v příštích 6 týdnech z okolí zatím nic\. Zkus větší okruh nebo Kamkoliv až do 27\. 3\.$/);
  assert.match(radarEmptyTxt(q('holiday'), true, ''), /na nejbližší prodloužený víkend z okolí zatím nic\. Zkus větší okruh nebo Kdykoliv\.$/);
  assert.match(radarEmptyTxt(q('all'), true, ''), /Zkus větší okruh\.$/);
  // tlačítko Kamkoliv do … jen v čistém režimu, ne u svátků
  const re = cut('  function radarEmpty(q, icon)', '  /** Nastavení domova radaru');
  assert.match(re, /const dTo = clean && !q\.none && q\.mode !== 'holiday' \? SearchHelp\.addDays\(today\(\), 120\) : '';/);
  assert.match(re, /provOn\(health, 'travelpayouts'\) && !provOn\(health, 'ryanair'\) && !provOn\(health, 'wizzair'\) && !provOn\(health, 'kiwi'\)/);
});

test('emptyTpSearch: odkaz na hledání trasy na Aviasales jen v čistém režimu; přesná data, jinak první den termínu', () => {
  const q = { trip: 'return', dateFrom: '2026-12-05', dateTo: '2027-01-10', nightsMin: 5, nightsMax: 9, adults: 2, exact: null };
  const r = emptyTpSearch(q, ['travelpayouts'], 'BRQ', 'BCN');
  assert.deepEqual({ ...r, url: undefined }, { url: undefined, from: 'BRQ', to: 'BCN' });
  assert.match(r.url, /^https:\/\/www\.aviasales\.com\/search\/BRQ0512BCN10122\?currency=eur/, 'odlet 5. 12., návrat po 5 nocích, 2 dospělí');
  assert.match(emptyTpSearch({ ...q, exact: { out: '2026-12-20', back: '2026-12-27', backFrom: '2026-12-25' } }, ['travelpayouts'], 'BRQ', 'BCN').url, /search\/BRQ2012BCN27122\?/, 'přesná data bez ± dnů');
  assert.match(emptyTpSearch({ ...q, trip: 'oneway' }, ['travelpayouts'], 'PRG', 'LIS').url, /search\/PRG0512LIS2\?/, 'jen tam');
  assert.equal(emptyTpSearch(q, ['travelpayouts', 'ryanair'], 'BRQ', 'BCN'), null, 'živý režim beze změny');
  assert.equal(emptyTpSearch(q, [], 'BRQ', 'BCN'), null);
  assert.equal(emptyTpSearch(q, ['travelpayouts'], 'BRQ', undefined), null);
});

test('hledání: prázdná trasa jen s Aviasales → tpSearch ve výsledku; s nabídkami nebo v DEMO bez něj; žádný dotaz na ceny navíc', async () => {
  const stub = stubFetch(() => ({ status: 503, body: {} }));
  try {
    const tp = { id: 'travelpayouts', name: 'Aviasales (test)', live: false, async stations() { return null; }, async routes() { return { has: () => true }; }, async explore() { return []; } };
    const q = { from: ['ap:BRQ'], to: ['ap:BCN'], radiusKm: 0, dateFrom: ymdPlus(20), dateTo: ymdPlus(30), trip: 'return', nightsMin: 3, nightsMax: 5, adults: 1 };
    const r = await search(q, () => {}, { providers: [tp] });
    assert.equal(r.groups.length, 0);
    assert.equal(r.tpSearch.from, 'BRQ');
    assert.equal(r.tpSearch.to, 'BCN');
    assert.match(r.tpSearch.url, /^https:\/\/www\.aviasales\.com\/search\/BRQ\d{4}BCN\d{4}1\?currency=eur/);
    assert.equal((await search(q)).tpSearch, undefined, 'DEMO (jiné zdroje než Aviasales): bez odkazu');
    assert.ok(stub.calls.every((c) => !/aviasales|travelpayouts/i.test(c.url)), 'odkaz se jen složí');
  } finally {
    stub.restore();
  }
});

test('wakeDue: „Probouzím server“ po 4 s bez odpovědi – ne, když server v posledních 10 min odpověděl', () => {
  const P = loadPwa();
  assert.equal(P.WAKE_MS, 4000);
  assert.equal(P.wakeDue(0, null, 3999), false, 'krátké čekání');
  assert.equal(P.wakeDue(0, null, 4000), true);
  const T = 3600e3;
  assert.equal(P.wakeDue(T, T - 5 * 60e3, T + 9000), false, 'server je vzhůru, jen dlouho počítá');
  assert.equal(P.wakeDue(T, T - 20 * 60e3, T + 5000), true, 'po 20 min nečinnosti usnul');
  assert.equal(P.wakeDue(T, T + 1000, T + 5000), false, 'mezitím odpověděl jiný dotaz');
});

test('wakeWatch: pruh jednou po 4 s, „ok“ s odpovědí, „fail“ s chybou; odpověď jiného dotazu ho schová; rychlá odpověď nic', () => {
  const P = loadPwa();
  let t = 0;
  const timers = [];
  const run = (ms) => { t += ms; timers.splice(0).forEach((f) => (f.at <= t ? f.fn() : timers.push(f))); };
  const mk = () => { const seen = []; return { seen, w: P.wakeWatch((s) => seen.push(s), { now: () => t, later: (fn, ms) => timers.push({ fn, at: t + ms }) }) }; };

  let { seen, w } = mk();
  const quick = w.start();
  run(300); quick(true); run(5000);
  assert.deepEqual(seen, [], 'server vzhůru: žádný pruh');

  ({ seen, w } = mk());
  const a = w.start(); run(1000);
  const b = w.start(); run(3000);
  assert.deepEqual(seen, ['wait'], 'po 4 s');
  run(1000);
  assert.deepEqual(seen, ['wait'], 'druhý čekající dotaz pruh neopakuje');
  a(true);
  assert.deepEqual(seen, ['wait', 'ok'], 'server odpověděl – i druhý dotaz už jen počítá');
  b(true); a(true);
  assert.deepEqual(seen, ['wait', 'ok']);
  // dotaz chvíli po odpovědi serveru: žádný pruh
  const c = w.start(); run(30e3);
  assert.deepEqual(seen, ['wait', 'ok']);
  c(true);

  ({ seen, w } = mk());
  const d = w.start(); run(4000);
  d(false);
  assert.deepEqual(seen, ['wait', 'fail'], 'chyba / limit 2 min: pruh pryč, hlášku s Zkusit znovu ukáže obsah');
});

test('pwa.js obal fetch hlídá probouzení u každého dotazu na API (502–504 = ještě spí); flights.js kreslí pruh přes Pwa.onWake', () => {
  const pw = read('public/js/pwa.js');
  assert.match(pw, /const done = wake\.start\(\);\n\s+\/\/[^\n]*\n\s+p\.then\(\(r\) => done\(!\(r\.status >= 502 && r\.status <= 504\)\), \(\) => done\(false\)\);/);
  assert.match(pw, /api\.onWake = \(fn\) => \{ wakeFn = fn; if \(wake\.shown\) fn\('wait'\); \};/);
  assert.match(fl, /if \(window\.Pwa && Pwa\.onWake\) Pwa\.onWake\(wakeBar\);/);
  assert.match(fl, /<b>Probouzím server, chvilku to trvá…<\/b>/);
  assert.doesNotMatch(fl, /setTimeout\(\(\) => wakeBar\('wait'\)/, 'pruh už nespouští jen stav serveru při startu');
  assert.doesNotMatch(pw + fl, /setInterval\([^)]*api\//, 'žádné periodické dotazy na server (keep-alive)');
});
