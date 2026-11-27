// UX kontrola Letů: řádek „Řazeno: … · Seřadit od nejlevnější“ nad výpisem (U6) a štítky jiného letiště, meta řádek
// „z Prahy a okolí (5 letišť)“ a čipy letišť s názvem města a jednotkou (U7). Klasické skripty prohlížeče přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getAirport } from '../server/lib/airports.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('public/js/searchhelp.js'), ctx, { filename: 'searchhelp.js' });
const H = ctx.SearchHelp;
const fl = read('public/js/flights.js');
const app = read('public/js/app.js');
const plain = (v) => JSON.parse(JSON.stringify(v));
// 2. pád z app.js (doGen) – meta řádek ho používá
const doGen = new Function(`${app.match(/const doGen = s => \{[\s\S]+?\n\};/)[0]}\nreturn doGen;`)();

test('U6: řádek nad výpisem říká, podle čeho je seřazeno, a nabídne opačné řazení', () => {
  assert.deepEqual(plain(H.sortLine('best', 'Doporučené (i s cestou na letiště, časy, výhodnost)')), { now: 'doporučené (i s cestou na letiště)', to: 'total', link: 'Seřadit od nejlevnější' });
  assert.deepEqual(plain(H.sortLine('total', 'Nejlevnější letenka')), { now: 'od nejlevnější', to: 'best', link: 'Doporučené' });
  assert.deepEqual(plain(H.sortLine('warm', 'Nejtepleji')), { now: 'nejtepleji', to: 'total', link: 'Seřadit od nejlevnější' }, 'jiné řazení: jeho popisek a cesta k nejlevnější');
  // „od nejlevnější“ = stejné řazení jako „Nejlevnější letenka“ ve Filtrech (sortKey: cena letenky na osobu)
  assert.match(fl, /\['total', `Nejlevnější letenka/);
  assert.match(fl, /default: return t\.perPersonCzk;/);
  // odkaz přepne view.sort jako volba ve Filtrech; řádek jen u Seznamu a Karet, nad výpisem
  assert.match(fl, /const setSort = v => \{ view\.sort = v; deep\('res_sort'\); rerender\(\); \};\n *\$\('#sortSel', host\)\.onchange = e => setSort\(e\.target\.value\);\n *\$\$\('\[data-sortto\]', host\)\.forEach\(b => b\.onclick = \(\) => setSort\(b\.dataset\.sortto\)\);/);
  assert.match(fl, /const sortBar = \(view\.mode === 'list' \|\| view\.mode === 'cards'\)/);
  assert.match(fl, /\n *body = sortBar \+ body;\n *\/\/ patička/);
  assert.match(fl, /<select id="sortSel"[^>]*>\s*\$\{sortOpts\.map\(/, 'Řazení ve Filtrech zůstává');
});

// Praha → Barcelona jako v nálezu: 5 letišť odletu, cíl BCN + GRO + REU
const res = {
  home: { label: 'Praha' },
  origins: [{ iata: 'PRG', city: 'Praha' }, { iata: 'PED', city: 'Pardubice' }, { iata: 'KLV', city: 'Karlovy Vary' }, { iata: 'DRS', city: 'Drážďany' }, { iata: 'JCL', city: 'České Budějovice' }],
  destination: { kind: 'airports', label: 'Barcelona', airports: ['BCN', 'GRO', 'REU'], cities: { BCN: 'Barcelona', GRO: 'Barcelona-Girona', REU: 'Barcelona-Reus' } },
};
const leg = (from, to) => ({ from, to });

test('U7: štítek u nabídky, která letí odjinud nebo jinam než zadané město – české názvy, bez „Barcelona-“', () => {
  const c = H.apCtx(res);
  assert.deepEqual([...c.home], ['PRG']);
  assert.deepEqual([...c.main], ['BCN']);
  assert.deepEqual(plain(H.apTags({ out: leg('KLV', 'GRO'), back: leg('REU', 'KLV') }, c)), ['z letiště Karlovy Vary', 'na letiště Girona']);
  assert.deepEqual(plain(H.apTags({ out: leg('PRG', 'BCN'), back: leg('BCN', 'PRG') }, c)), [], 'Praha → Barcelona: bez štítku');
  assert.deepEqual(plain(H.apTags({ out: leg('PED', 'BCN') }, c)), ['z letiště Pardubice']);
  assert.deepEqual(plain(H.apTags({ out: leg('PRG', 'BCN'), back: leg('BCN', 'PED') }, c)), ['zpět na letiště Pardubice'], 'návrat jinam než do Prahy');
  assert.deepEqual(plain(H.apTags({ out: leg('PED', 'BCN'), back: leg('BCN', 'PRG') }, c)), ['z letiště Pardubice'], 'návrat do Prahy bez štítku');
  // starý štítek „↩ návrat na letiště …“ jen tam, kde návrat do zadaného města štítek neřekl (jinak dvakrát totéž)
  assert.match(fl, /if \(t\.back && t\.back\.to !== t\.out\.from && \(!apNow\.home\.size \|\| apNow\.home\.has\(t\.back\.to\)\)\) out\.push\(/);
  assert.equal(H.apName('REU', c), 'Reus');
  assert.equal(H.apName('XYZ', c), 'XYZ', 'název neznámý → kód');
});

test('U7: Kamkoliv a hledání bez známého města – cíl se neoznačuje, odlet podle nejbližšího letiště', () => {
  const c = H.apCtx({ home: { label: 'Kolín' }, origins: [{ iata: 'PRG', city: 'Praha' }, { iata: 'PED', city: 'Pardubice' }, { iata: 'VIE', city: 'Vídeň', hub: true }], destination: { kind: 'anywhere', label: 'Kamkoliv' } });
  assert.deepEqual([...c.home], ['PRG'], 'zadané město bez letiště → nejbližší letiště (výsledek je řadí podle vzdálenosti)');
  assert.equal(c.main, null);
  assert.deepEqual(plain(H.apTags({ out: leg('VIE', 'BCN') }, c)), ['z letiště Vídeň']);
  // starý uložený výsledek bez názvů a bez domova: nic nespadne, kódy zůstanou
  const old = H.apCtx({ origins: [{ iata: 'PRG' }, { iata: 'BRQ' }], destination: { label: 'Barcelona', airports: ['BCN'] } });
  assert.deepEqual(plain(H.apTags({ out: leg('BRQ', 'BCN') }, old)), ['z letiště BRQ']);
  assert.deepEqual(plain(H.apTags({ out: leg('PRG', 'BCN') }, H.apCtx(null))), []);
});

test('U7: meta řádek „z Prahy a okolí (5 letišť)“ místo kódů; nesklonné jméno bez 2. pádu; jedno letiště kódem', () => {
  assert.equal(H.originsTxt(res, doGen), 'z Prahy a okolí (5 letišť)');
  assert.equal(H.originsTxt({ ...res, home: { label: 'Brno' }, origins: res.origins.slice(0, 3) }, doGen), 'z Brna a okolí (3 letiště)');
  assert.equal(H.originsTxt({ ...res, home: { label: 'Karlovy Vary' } }, doGen), 'odlet: Karlovy Vary a okolí (5 letišť)');
  assert.equal(H.originsTxt({ ...res, origins: res.origins.slice(0, 1) }, doGen), null);
  assert.match(fl, /<div class="muted" style="font-size:13px">\$\{originsHead\(res\)\} · /);
});

test('U7: čip letiště ve Filtrech s názvem města a jednotkou („PED · Pardubice · cesta ~240 Kč“), štítek ve kartě i řádku', () => {
  assert.match(fl, /\$\{o\.iata\}\$\{SearchHelp\.apName\(o\.iata, apNow\) !== o\.iata \? ` · \$\{esc\(SearchHelp\.apName\(o\.iata, apNow\)\)\}` : ''\}/);
  assert.match(fl, /`\$\{o\.ground\.own \? '🏠 ' : ''\}cesta ~\$\{czk\(o\.ground\.czk\)\}`/);
  assert.match(fl, /function badges\(t, g, idx\) \{\n    const out = \[apTagsHtml\(t\)\];/, 'karta: štítek první');
  assert.match(fl, /<span class="tm-ap">\$\{tg\}<\/span>/, 'krátký řádek na telefonu');
  const css = read('public/css/flights.css');
  assert.match(css, /\.ap-tag\{max-width:100%;white-space:normal\}/, 'dlouhé jméno se zalomí ve štítku – nepřeteče přes kartu ani se neuřízne');
});

test('U7: server posílá české názvy letišť cíle (destination.cities)', () => {
  assert.match(read('server/lib/search.js'), /\.\.\.\(routeMode \? \{ cities: Object\.fromEntries\(destAirports\.map\(\(a\) => \[a, getAirport\(a\)\?\.cityCs \|\| a\]\)\) \} : \{\}\)/);
  assert.equal(getAirport('GRO').cityCs, 'Barcelona-Girona');
  assert.equal(getAirport('KLV').cityCs, 'Karlovy Vary');
});
