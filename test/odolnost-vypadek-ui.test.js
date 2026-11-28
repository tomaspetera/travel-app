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
  const emptyState = new Function('SearchHelp', 'esc', 'czk', 'plural', 'ikona', 'kiwiBanner', 'groundBanner', 'nearbyHtml', 'smartHelp', 'actReg', 'provName', 'safeUrl', 'buyRel', 'adTag',
    `${src}; return emptyState;`)(H, esc, (n) => `${n} Kč`, (n, a) => `${n} ${a}`, (n) => `[${n}]`, () => '<div class="kiwi-note">↻ Zkusit znovu</div>', () => '', () => '<div class="nearby">DNY</div>',
    () => '<div class="smart-help">Zkus jedním kliknutím</div>', [], (id) => id, esc, () => '', () => '');
  const res = (providers) => ({ providers, origins: [{ iata: 'PRG' }], destination: { kind: 'city', label: 'Barcelona' }, query: {}, filters: {} });
  const dead = emptyState(res([TP({ outage: 'blocked', retryAfter: 90 })]));
  assert.match(dead, /<h2>Ceny se teď nepodařilo načíst<\/h2>/);
  assert.match(dead, /nic neprohledalo – neznamená to, že let není/);
  assert.match(dead, /↻ Zkusit znovu/, 'karta výpadku s odpočtem nahoře zůstává');
  assert.match(dead, /Chyby zdrojů/);
  assert.doesNotMatch(dead, /Nic jsem nenašel|nenašel žádný let|Zkus jedním kliknutím|DNY/);
  // částečný výpadek (něco prošlo) je obyčejný prázdný výsledek – nápověda zůstává
  const part = emptyState(res([TP({ state: 'partial', error: '', outage: 'partial' }), { id: 'kiwi', state: 'done' }]));
  assert.match(part, /Nic jsem nenašel/);
  assert.match(part, /Zkus jedním kliknutím/);
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
