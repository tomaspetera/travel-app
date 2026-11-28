// Odolnost při výpadku jediného zdroje (čistý režim: Aviasales přes Travelpayouts – 429, 5xx, timeout): aplikace nesmí
// tvrdit „nic jsem nenašel“ / „z okolí zatím nic“, schovat dřívější ceny radaru ani smazat cenu hlídání.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
vm.runInNewContext(readFileSync(new URL('../public/js/alerts.js', import.meta.url), 'utf8'), ctx);
const H = ctx.window.SearchHelp, A = ctx.window.Alerts;
const FL = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
const slice = (from, to) => { const a = FL.indexOf(from), b = FL.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return FL.slice(a, b); };

const TP = (o) => ({ id: 'travelpayouts', state: 'error', error: 'výpadek zdroje cen (HTTP 502)', outage: 'down', ...o });

test('allDown: úplný výpadek = všechny zdroje chyba, down nebo blocked (stejně jako serverový searchEvent)', () => {
  assert.equal(H.allDown([TP()]), true);
  assert.equal(H.allDown([TP({ outage: 'blocked', retryAfter: 60 })]), true);
  assert.equal(H.allDown([TP(), { id: 'kiwi', state: 'error', outage: 'down' }]), true);
  assert.equal(H.allDown([TP({ state: 'partial', error: '', outage: 'partial' })]), false, 'část dotazů prošla = prázdný výsledek');
  assert.equal(H.allDown([TP(), { id: 'ryanair', state: 'done', outage: null }]), false, 'jiný zdroj odpověděl');
  assert.equal(H.allDown([]), false);
  assert.equal(H.allDown(undefined), false);
});

test('výsledky hledání při úplném výpadku: „Ceny se teď nepodařilo načíst“, žádné návrhy na rozšíření ani „Nic jsem nenašel“', () => {
  const src = slice('  function cleanEmpty(', '  function legHtml(');
  const esc = (s) => String(s);
  // kiwiBanner (s cardNote „hledání tuhle nabídku nevrátilo“) a groundBanner („Letadlo – nic nenalezeno“) jen u obyčejného
  // prázdného výsledku; při výpadku jen karty výpadku s ↻ (lowcostBanner, kiwiOnly)
  const emptyState = new Function('SearchHelp', 'esc', 'czk', 'plural', 'ikona', 'kiwiBanner', 'groundBanner', 'lowcostBanner', 'kiwiOnly', 'nearbyHtml', 'smartHelp', 'actReg', 'provName', 'safeUrl', 'buyRel', 'adTag',
    `${src}; return emptyState;`)(H, esc, (n) => `${n} Kč`, (n, a) => `${n} ${a}`, (n) => `[${n}]`, () => '<div class="card-note">nevrátilo</div>', () => '<div class="gnd">Letadlo nic nenalezeno</div>',
    () => '<div class="kiwi-note">↻ Zkusit znovu</div>', () => '', () => '<div class="nearby">DNY</div>',
    () => '<div class="smart-help">Zkus jedním kliknutím</div>', [], (id) => id, esc, () => '', () => '');
  const res = (providers) => ({ providers, origins: [{ iata: 'PRG' }], destination: { kind: 'city', label: 'Barcelona' }, query: {}, filters: {} });
  const dead = emptyState(res([TP({ outage: 'blocked', retryAfter: 90 })]));
  assert.match(dead, /<h2>Ceny se teď nepodařilo načíst<\/h2>/);
  assert.match(dead, /nic neprohledalo – neznamená to, že let není/);
  assert.match(dead, /↻ Zkusit znovu/, 'karta výpadku s odpočtem nahoře zůstává');
  assert.match(dead, /Chyby zdrojů/);
  assert.doesNotMatch(dead, /Nic jsem nenašel|nenašel žádný let|Zkus jedním kliknutím|DNY|nevrátilo|nic nenalezeno/);
  // částečný výpadek (něco prošlo) je obyčejný prázdný výsledek – nápověda zůstává
  const part = emptyState(res([TP({ state: 'partial', error: '', outage: 'partial' }), { id: 'kiwi', state: 'done' }]));
  assert.match(part, /Nic jsem nenašel/);
  assert.match(part, /Zkus jedním kliknutím/);
  assert.match(part, /nevrátilo/, 'mimo výpadek karta z Kam letět levně zůstává');
});

test('lowcostBanner prázdného výsledku: „lety se nepodařilo načíst“, ne „ve výsledcích chybí“ (jiné zdroje v čistém režimu nejsou)', () => {
  const ikona = (n) => `<span class="ico i-${n}" aria-hidden="true"></span>`;
  const banner = new Function('SearchHelp', 'lastResultAt', 'ikona', `${slice('  function lowcostBanner(', '  function kiwiOnly(')}; return lowcostBanner;`)(H, Date.now(), ikona);
  const empty = banner({ providers: [TP({ outage: 'blocked', retryAfter: 60 })], groups: [] });
  assert.match(empty, /<b>Aviasales teď neodpověděl<\/b> – jeho lety se nepodařilo načíst\./);
  assert.doesNotMatch(empty, /ve výsledcích chybí/);
});

test('hlavička průběhu: ✓ jen když žádný zdroj neselhal', () => {
  assert.match(FL, /<summary class="ph">\$\{\(ev\.providers \|\| \[\]\)\.some\(p => p\.outage \|\| p\.state === 'error'\) \? '' : '✓ '\}\$\{head\}/);
});

test('radar: úplný výpadek bez karet je chyba (radarFail se staršími kartami a ↻), neuloží se do S.radar jako čerstvý výsledek', () => {
  const rs = slice('  async function radarSearch(', '  function radarProgress(');
  const thr = rs.indexOf("if (!(res.groups || []).length && SearchHelp.allDown(res.providers)) {");
  assert.ok(thr > 0, 'kontrola výpadku v radarSearch');
  assert.ok(thr < rs.indexOf('SearchHelp.radarEntry(') && thr < rs.indexOf('S.radar = '), 'před uložením výsledku');
  assert.match(rs.slice(thr, thr + 400), /throw Object\.assign\(new Error\('zdroj cen teď neodpovídá – zkus to za chvíli'\), \{ until:/);
  // renderRadar chybu předá radarFail (starší karty s upozorněním, jinak hláška s ↻); smyčka paintRadar ↔ radarFail
  // nehrozí – radarStale bez karet vrací null
  assert.match(FL, /radarFail\(q, old, e\);\n\s*\}\n\s*\}/);
  assert.equal(H.radarStale({ key: '{}', at: 1, items: [], partial: true }, '{}', '2027-01-12'), null);
});

test('hlídání: úplný výpadek při kontrole je chyba kontroly – cena i checked zůstanou, i po mnoha kontrolách', () => {
  const NOW = Date.UTC(2027, 0, 12, 10), HR = 3600e3;
  let w = { id: 'w', pv: A.PV, best: { czk: 1872 }, checked: NOW - 7 * HR, history: [{ t: NOW - 7 * HR, czk: 1872 }] };
  for (let i = 0; i < 5; i++) {
    const r = A.applyCheck(w, null, NOW + i * HR, undefined, { partial: true, down: true });
    assert.equal(r.skipped, true);
    assert.equal(r.down, true);
    assert.equal(r.prev, 1872);
    w = r.w;
  }
  assert.equal(w.best.czk, 1872, 'cena zůstává');
  assert.equal(w.checked, NOW - 7 * HR, 'checked se nemění – hlídání zůstane na řadě');
  assert.equal(w.tried, NOW + 4 * HR);
  assert.equal(A.isStale(w, NOW + 5 * HR), true);
  // nové hlídání bez ceny: žádné „nic nenalezeno“, zkusí se znovu
  const n = A.applyCheck({ id: 'n' }, null, NOW, undefined, { partial: true, down: true });
  assert.equal(n.skipped, true);
  assert.equal(n.w.checked, undefined);
  // cena nalezená (třeba z mezipaměti serveru) platí dál
  assert.equal(A.applyCheck(w, { czk: 1500 }, NOW, undefined, { partial: true, down: true }).w.best.czk, 1500);
  // checkOne: ruční kontrola pravdivý toast, automatická ukončí cyklus
  assert.match(FL, /down: SearchHelp\.allDown\(res\.providers\)/);
  assert.match(FL, /if \(r\.down\) \{ if \(auto\) return 'stop'; toast\(`\$\{cur\.label\}: zdroj cen teď neodpovídá – /);
});

test('texty výpadku neutrálně (zdroj cen), ne „aerolinka neodpověděla“ – v čistém režimu se žádná aerolinka neptá', () => {
  assert.doesNotMatch(FL, /část aerolinek neodpověděla|některá aerolinka teď neodpověděla/);
  assert.match(FL, /⚠️ zdroj cen neodpověděl celý – ceny můžou být vyšší/);
  assert.match(FL, /zdroj cen teď neodpověděl celý – cenu \$\{czk\(r\.prev\)\} nechávám/);
});

test('hlavička průběhu při úplném výpadku: „Ceny se nepodařilo načíst“, ne „Prohledáno N letišť“ / „Ceny z posledních 48 h“', () => {
  assert.match(slice('  function renderProgress(', '  function countryInfo('), /const head = res \? \(SearchHelp\.allDown\(res\.providers\) \? 'Ceny se nepodařilo načíst' : doneHead\(/);
});

test('cesta přes víc měst při úplném výpadku: karta „Ceny se teď nepodařilo načíst“ místo kroků „V tento den jsem let nenašel“', () => {
  const rm = slice('  function renderMulti(', '  function mEmptyTxt(');
  // jen trasa a karta výpadku – řazení, „tlačítkem u každého letu“ ani patička o cenách (žádný let tu není)
  assert.match(rm, /SearchHelp\.allDown\(res\.providers\) \? kiwiBanner\(res\) \+ `<div class="res-head">\$\{route\}<\/div>` \+ downCard\(res\)\n\s*: head \+ steps \+ body/);
  const route = rm.slice(rm.indexOf('const route = '), rm.indexOf('const head = '));
  assert.ok(route.length > 0);
  assert.doesNotMatch(route, /mSort|mc-note|tlačítkem u každého letu|res-foot|filterChips/);
  const downCard = new Function('esc', 'provName', 'ikona', `${slice('  function downCard(', '  function emptyState(')}; return downCard;`)(String, (id) => id, (n) => `[${n}]`);
  const html = downCard({ mode: 'multi', providers: [TP({ outage: 'blocked', retryAfter: 60 })], legs: [{ options: [] }, { options: [] }] });
  assert.match(html, /<h2>Ceny se teď nepodařilo načíst<\/h2>/);
  assert.match(html, /neznamená to, že let není/);
  assert.match(html, /travelpayouts:<\/b> výpadek zdroje cen/);
  assert.doesNotMatch(html, /nenašel/);
});

test('hledání při úplném výpadku nepřepíše dřívější výsledky ani uložené z minula (chyba s until do catch „kept“, jako radar)', () => {
  const ss = slice('    const job = (async () => {', '    running = { key: pkey, ctl, job };');
  // dřívější výsledek z výpadku se nechrání (druhá karta výpadku s ↻ bez odpočtu pod „Níže zůstávají výsledky“)
  const thr = ss.indexOf('if (keepOnDown(lastResult, lastResultPayload, res, payload)) {');
  assert.ok(thr > 0, 'kontrola výpadku ve startSearch');
  for (const x of ['lastResult = res;', "Count.hit('search_done')", 'PriceCheck.remember(res)', 'S.recent = ', 'saveLast(']) assert.ok(thr < ss.indexOf(x), `před ${x}`);
  assert.match(ss.slice(thr, thr + 400), /throw Object\.assign\(new Error\('Zdroj cen teď neodpovídá – zkus to za chvíli\.'\), \{ until:/);
  // catch nechá dřívější výsledky zašedlé pod hláškou a ↻ s odpočtem
  assert.match(ss, /const kept = !s\.shown && lastResult && !\$\('#results'\)\.children\.length;/);
  assert.match(ss, /retryBtn\('searchRetry', e\.until\)/);
});

test('Hlídat při úplném výpadku: nové hlídání nezkontrolované (zůstane na řadě), známá cena se nepřepíše', () => {
  const NOW = Date.UTC(2027, 0, 12, 10), key = (w) => w.k;
  const old = { id: 'o', k: 'PRG-BCN', pv: A.PV, best: { czk: 1872 }, checked: NOW - 3600e3, history: [{ at: NOW - 3600e3, czk: 1872 }] };
  let list = [old];
  for (let i = 0; i < 4; i++) {
    const r = A.upsertWatch(list, { id: 'n' + i, k: 'PRG-BCN', label: 'Praha → Barcelona', sub: 's', form: {}, best: null, history: [], checked: 0 }, key, { now: NOW + i, down: true });
    assert.equal(r.dup, true);
    assert.equal(r.w.best.czk, 1872, 'cena zůstává i po opakovaném Hlídat');
    assert.equal(r.w.checked, NOW - 3600e3, 'checked se nemění');
    list = r.list;
  }
  // nové hlídání bez ceny (checked 0) je pro automatickou kontrolu hned na řadě
  assert.equal(A.isStale({ checked: 0 }, NOW), true);
  const aw = slice('  async function addWatch(', '  function watchCard(');
  assert.match(aw, /const down = !b && SearchHelp\.allDown\(res\.providers\);/);
  assert.match(aw, /checked: down \? 0 : Date\.now\(\), \.\.\.\(down \? \{ tried: Date\.now\(\) \} : \{\}\)/);
  assert.match(aw, /partial: Alerts\.incomplete\(res\.providers\), down \}\)/);
});

test('průběh před první odpovědí serveru: rozbalené „podrobnosti“ nejsou prázdné', () => {
  const rp = slice('  function renderProgress(', '  function countryInfo(');
  assert.match(rp, /const body = rows \|\| '<div class="pnote">Čekám na odpověď serveru…<\/div>';/);
  assert.match(rp, /<\/summary>\$\{body\}<\/details>`;/);
  assert.match(rp, /sum\.insertAdjacentHTML\('afterend', body\);/);
});

test('karta vlak/bus bez emoji v nadpisu a popiscích (ikony Letsi)', () => {
  const g = slice('  function groundCompare(', '  /** Panel se spoji pod srovnáním');
  assert.doesNotMatch(g, /🚆|✈️/);
  assert.match(g, /<span class="gb-ic">\$\{ikona\('vlak'\)\}<\/span>/);
  assert.match(g, /\$\{ikona\('let'\)\} Letadlo/);
});

test('Zdroje cen (počítač): ubytování „bez ceny“ není zdroj cen; výpadek Aviasales pravdivě, ne „orientačně“ a „blokováno“', () => {
  const src = FL.slice(FL.indexOf('  const srcOn = '), FL.indexOf('  /** Lety jen z mezipaměti'));
  const f = new Function('esc', 'health', `${src}; return { srcLine, srcBoxHtml };`)(String, null);
  const tp = (o) => ({ id: 'travelpayouts', name: 'Letenky (Aviasales)', kind: 'cached', enabled: true, ...o });
  const osm = { id: 'osm', name: 'Ubytování (OpenStreetMap)', kind: 'stays', tag: 'bez ceny', enabled: true };
  const rj = { id: 'regiojet', name: 'RegioJet', kind: 'ground', enabled: true };
  assert.equal(f.srcLine({ providers: [osm, tp(), rj] }), 'Ceny orientačně · 1 zdroj');
  assert.doesNotMatch(f.srcBoxHtml({ providers: [osm, tp(), rj] }), /OpenStreetMap/);
  const down = { providers: [osm, tp({ blocked: true, retryAfter: 600 }), rj] };
  assert.equal(f.srcLine(down), 'Ceny letů teď nejdou načíst');
  assert.match(f.srcBoxHtml(down), /teď nejde/);
  assert.doesNotMatch(f.srcBoxHtml(down), /blokováno/);
  // hotely s cenou dál jedou, lety ne – pořád „lety teď nejdou“
  assert.equal(f.srcLine({ providers: [tp({ blocked: true }), { id: 'xotelo', kind: 'stays', tag: 'orientačně', enabled: true }] }), 'Ceny letů teď nejdou načíst');
  // jeden zdroj letů vypadl, druhý jede: počítá se jen ten, co jede
  assert.equal(f.srcLine({ providers: [tp({ blocked: true }), { id: 'ryanair', kind: 'live', enabled: true }] }), 'Ceny živě · 1 zdroj');
});

test('výpadek při hledání jiného cíle: dřívější výsledky (jiný cíl) se nechrání – karta výpadku pro nový cíl', () => {
  const keepOnDown = new Function('SearchHelp', `${slice('  const destKey = ', '  async function startSearch(')}; return keepOnDown;`)(H);
  const ok = { providers: [{ id: 'travelpayouts', state: 'done' }], groups: [{ id: 'g' }] };
  const dead = { providers: [TP({ outage: 'blocked', retryAfter: 120 })], groups: [] };
  const rim = { from: ['PRG'], to: ['c:FCO'] }, lis = { from: ['PRG'], to: ['c:LIS'] };
  assert.equal(keepOnDown(ok, rim, dead, rim), true, 'stejný cíl: dřívější výsledky zůstanou pod hláškou');
  assert.equal(keepOnDown(ok, rim, dead, { ...rim, dateFrom: '2027-02-01' }), true, 'jiné datum, stejný cíl');
  assert.equal(keepOnDown(ok, rim, dead, lis), false, 'jiný cíl: nabídky do Říma pod hledáním Lisabonu ne');
  assert.equal(keepOnDown(ok, null, dead, lis), false, 'neznámý dotaz dřívějších výsledků');
  assert.equal(keepOnDown(dead, lis, dead, lis), false, 'dřívější výsledek z výpadku se nechrání');
  assert.equal(keepOnDown(ok, rim, ok, rim), false, 'hledání prošlo');
  // víc měst: cíl = města všech letů
  const ml = (to) => ({ trip: 'multi', legs: [{ from: ['PRG'], to: ['c:FCO'] }, { from: ['c:FCO'], to }] });
  assert.equal(keepOnDown(ok, ml(['c:BCN']), dead, ml(['c:BCN'])), true);
  assert.equal(keepOnDown(ok, ml(['c:BCN']), dead, ml(['c:MAD'])), false);
  assert.equal(keepOnDown(ok, rim, dead, ml(['c:FCO'])), false, 'obyčejné hledání → víc měst');
});

test('Zdroje cen (počítač) po obnově zdroje: hledání s cenami zruší „teď nejde“ a panel se překreslí', () => {
  const src = FL.slice(FL.indexOf('  const srcOn = '), FL.indexOf('  /** Lety jen z mezipaměti'));
  const f = new Function('esc', 'health', 'SearchHelp', `${src}; return { srcLine, srcHeal };`)(String, null, H);
  const tp = { id: 'travelpayouts', name: 'Letenky (Aviasales)', kind: 'cached', enabled: true, blocked: true, retryAfter: 60 };
  const h = { providers: [tp, { id: 'osm', kind: 'stays', tag: 'bez ceny', enabled: true }] };
  const PROV = { travelpayouts: tp }; // useHealth: PROV ukazuje na tytéž objekty
  assert.equal(f.srcLine(h), 'Ceny letů teď nejdou načíst');
  assert.equal(f.srcHeal(h, [TP({ outage: 'blocked' })]), false, 'pořád výpadek');
  assert.equal(tp.blocked, true);
  assert.equal(f.srcHeal(h, [TP({ state: 'partial', error: '', outage: 'partial' })]), true, 'část dotazů prošla – zdroj jede');
  assert.equal(PROV.travelpayouts.blocked, false);
  tp.blocked = true; // Wizz Air z paměti tras: část výsledků, ale zdroj dál blokuje (server: blocked) – zůstane „teď nejde“
  assert.equal(f.srcHeal(h, [TP({ state: 'partial', error: '429 – ceny jen z paměti', outage: 'partial', blocked: true })]), false, 'blokuje dál');
  assert.equal(tp.blocked, true);
  tp.blocked = false;
  assert.equal(f.srcLine(h), 'Ceny orientačně · 1 zdroj');
  assert.equal(f.srcHeal(h, [{ id: 'travelpayouts', state: 'done' }]), false, 'nic k překreslení');
  assert.equal(f.srcHeal(null, [{ id: 'travelpayouts', state: 'done' }]), false, 'bez /api/health');
  const ss = slice('    const job = (async () => {', '    running = { key: pkey, ctl, job };');
  assert.match(ss, /lastResult = res; lastResultAt = Date\.now\(\); lastResultPayload = payload; restored = false;\n\s*if \(srcHeal\(health, res\.providers\)\) renderSources\(\);/);
});
