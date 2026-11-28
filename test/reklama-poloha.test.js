// Předstartovní kontrola (sit-soukromi-2, -3, -4): tlačítka koupě letenky přes partnerský tp.media označená jako reklama
// (rel=sponsored + štítek, jako ubytování v Cestě), domov z 📍 Moje poloha jen na ~1 km (i dřív uložený) a Objevuj → Tady
// na ~100 m v prohlížeči i na serveru. Funkce front-endu jsou skutečné řádky vybrané podle jména.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const FL = read('public/js/flights.js');
const APP = read('public/js/app.js');
const PLACES = read('public/js/places.js');
const plain = (v) => JSON.parse(JSON.stringify(v));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? '').trim()) ? String(u).trim() : '#');

const TP = 'https://tp.media/r?marker=1&p=4114&u=https%3A%2F%2Fwww.aviasales.com%2Fsearch%2FPRG0112LIS1';
const RYR = 'https://www.ryanair.com/cz/cs/trip/flights/select?originIata=PRG&destinationIata=STN';

/** bookButtons z flights.js i s pomůckami affBuy/buyRel/adTag. */
function bookButtonsFn() {
  const helpers = FL.match(/^ *const affBuy = [^\n]+\n *const buyRel = [^\n]+\n *const adTag = [^\n]+\n/m);
  const fn = FL.match(/^ *function bookButtons\(t\) \{\n[\s\S]*?\n {2}\}\n/m);
  assert.ok(helpers && fn, 'flights.js: affBuy/buyRel/adTag a bookButtons');
  return new Function('esc', 'safeUrl', 'provColor', 'shopName', 'SearchHelp', 'sameRound', `${helpers[0]}${fn[0]} return bookButtons;`)(
    esc, safeUrl, () => '#123', (id) => (id === 'travelpayouts' ? 'Aviasales' : 'Ryanair'), { isCached: () => true }, () => null);
}

test('koupě letenky přes tp.media: rel="sponsored nofollow noopener" a štítek reklama; přímý odkaz aerolinky beze změny', () => {
  const bb = bookButtonsFn();
  const aff = bb({ bookUrl: TP, provider: 'travelpayouts' });
  assert.match(aff, /rel="sponsored nofollow noopener">Otevřít na Aviasales ↗ <span class="ad-tag">reklama<\/span><\/a>/);
  const own = bb({ bookUrl: RYR, provider: 'ryanair' });
  assert.match(own, /rel="noopener">Otevřít u Ryanair ↗<\/a>/);
  assert.doesNotMatch(own, /ad-tag|sponsored/);
  // tam a zpět zvlášť: štítek jen u partnerského letu; podobná adresa jinde (http, jiná doména) partnerská není
  const two = bb({ out: { bookUrl: TP, provider: 'travelpayouts' }, back: { bookUrl: RYR, provider: 'ryanair' } });
  assert.equal((two.match(/ad-tag/g) || []).length, 1);
  for (const u of ['http://tp.media/r?x', 'https://evil.cz/https://tp.media/', 'https://tp.media.evil.cz/r']) assert.doesNotMatch(bb({ bookUrl: u, provider: 'travelpayouts' }), /sponsored/, u);
  // demo bez odkazu: šedé tlačítko jako dřív
  assert.match(bb({ out: { provider: 'ryanair' } }), /^<span class="btn sm ghost"/);
});

test('všechna tlačítka koupě ve flights.js (výsledky, víc měst, detail radaru, poznámka karty, odložené, sdílená nabídka) jdou přes buyRel a adTag', () => {
  for (const name of ['bookButtons', 'mBuy', 'dpBuy', 'openOffer']) {
    const body = FL.match(new RegExp(`function ${name}\\([^)]*\\) \\{\\n[\\s\\S]*?\\n {2}\\}\\n`));
    assert.ok(body, name);
    assert.match(body[0], /rel="\$\{buyRel\((url|u)\)\}">[^\n]*\$\{adTag\((url|u)\)\}/, name);
  }
  // poznámka „Na kartě radaru bylo…“ a karta odloženého z radaru
  assert.match(FL, /Koupit nabídku z karty'\} \$\{esc\(shop\(p\)\)\} ↗<\/a>\$\{adTag\(u\)\}/);
  assert.match(FL, /const buy = \(r\.buy \|\| \[\]\)[^\n]+rel="\$\{buyRel\(u\)\}"[^\n]+↗\$\{adTag\(u\)\}<\/a>/);
  // žádné tlačítko koupě (class book) s pevným rel="noopener"
  assert.doesNotMatch(FL, /class="btn sm book"[^\n]*?rel="noopener"/);
});

test('štítek na tlačítku: barva textu tlačítka (šedý by na barevné ploše nebyl čitelný), na úzkém tlačítku pod textem', () => {
  assert.match(read('public/css/trip.css'), /^\.btn \.ad-tag\{color:inherit;border-color:currentColor;margin-left:0\}/m);
  // Tam/Zpět vedle sebe na 412 px: bez zalomení by se text vedle štítku zúžil na tři řádky („Tam:“ / „Aviasales“ / „↗“)
  assert.match(read('public/css/flights.css'), /^\.btn\.book\{flex-wrap:wrap;row-gap:4px\}$/m);
});

/** load() z app.js s uloženým stavem (jako test/migrate.test.js). */
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = .*|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
function loadWith(stored) {
  const ctx = { localStorage: { getItem: () => JSON.stringify(stored) } };
  vm.createContext(ctx);
  vm.runInContext(`${pick('LS', 'load', 'fixState', 'coarseGeo', 'migrateGeo', 'migratePrices', 'defState')}\nvar S = load();`, ctx, { filename: 'app-state.js' });
  return plain(ctx.S);
}

test('📍 Moje poloha: nový domov na 2 desetinná místa (~1 km)', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/searchhelp.js'), ctx);
  assert.equal(ctx.window.SearchHelp.myPlace(50.087654, 14.421234).id, 'geo:50.09,14.42|Moje poloha');
  assert.equal(ctx.window.SearchHelp.myPlace(-33.86785, -151.20732).id, 'geo:-33.87,-151.21|Moje poloha');
});

test('načtení stavu: dřív uložená přesná 📍 Moje poloha (domov, formulář Letů, Nedávno) se zaokrouhlí, ostatní data zůstanou', () => {
  const me = { id: 'geo:50.0877,14.4212|Moje poloha', label: 'Moje poloha', flag: '📍', type: 'place' };
  const city = { id: 'geo:49.1952,16.6080|Brno', label: 'Brno', type: 'city' };
  const s = loadWith({
    pv: 2, trips: [{ id: 1, days: {}, checklist: [] }], visited: ['CZ'],
    home: { from: [me], radius: 150, adults: 2 },
    form: { from: [me, city], to: [], radius: 100 },
    recent: [{ form: { from: [me] }, at: 5 }, { at: 6 }],
  });
  const coarse = { ...me, id: 'geo:50.09,14.42|Moje poloha' };
  assert.deepEqual(s.home, { from: [coarse], radius: 150, adults: 2 });
  assert.deepEqual(s.form, { from: [coarse, city], to: [], radius: 100 }, 'město s přesnou polohou se nemění');
  assert.deepEqual(s.recent, [{ form: { from: [coarse] }, at: 5 }, { at: 6 }]);
  assert.deepEqual([s.trips, s.visited, s.pv], [[{ id: 1, days: {}, checklist: [] }], ['CZ'], 2]);
  // bez domova a formuláře (nový uživatel, starý stav) nic nespadne
  const empty = loadWith({ pv: 2 });
  assert.deepEqual([empty.home, empty.form, empty.recent], [null, null, []]);
});

test('načtení stavu v pořadí jako v app.js: zaokrouhlení nespadne a ostatní data zůstanou (const před load() = prázdný stav)', () => {
  // vybírání podle jména výše pořadí změní – tady skutečný úsek app.js od LS po defState, jak běží v prohlížeči
  const a = APP.indexOf("const LS = 'atlas_v1';"), b = APP.indexOf('\n', APP.indexOf('function defState()'));
  assert.ok(a > 0 && b > a, 'app.js: úsek stavu');
  const me = { id: 'geo:50.0877,14.4212|Moje poloha', label: 'Moje poloha', flag: '📍', type: 'place' };
  const ctx = { localStorage: { getItem: () => JSON.stringify({ pv: 2, visited: ['CZ', 'AT'], trips: [{ id: 1, days: {}, checklist: [] }], home: { from: [me], radius: 150 } }) } };
  vm.createContext(ctx);
  vm.runInContext(`${APP.slice(a, b)}\nthis.S = S;`, ctx, { filename: 'app-state-order.js' });
  const s = plain(ctx.S);
  assert.deepEqual([s.visited, s.trips], [['CZ', 'AT'], [{ id: 1, days: {}, checklist: [] }]]);
  assert.equal(s.home.from[0].id, 'geo:50.09,14.42|Moje poloha');
});

test('Objevuj → Tady: poloha na 3 desetinná místa před openOther (adresa /api/poi i atlas_explore_v1)', () => {
  const m = PLACES.match(/( *const geo3 = [^\n]+\n *\$\('#exGeo', root\)\.onclick = \(\) => \{\n[\s\S]*?\n {4}\};\n)/);
  assert.ok(m, 'places.js: geo3 a exGeo');
  let opened = null;
  const root = {};
  const $ = () => root;
  const navigator = { geolocation: { getCurrentPosition: (ok) => ok({ coords: { latitude: 50.087654, longitude: 14.421234 } }) } };
  new Function('$', 'root', 'navigator', 'dd', 'openOther', 'toast', m[1])($, root, navigator, {}, (p) => { opened = p; }, () => {});
  root.onclick();
  assert.deepEqual(opened, { lat: 50.088, lon: 14.421, label: 'Moje okolí', geo: true });
});

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('server /api/poi a /api/poi/trips: přesná poloha ze staršího klienta se zaokrouhlí na 3 desetinná místa', async () => {
  // demo místo 0 leží přesně na zadané poloze (mockPlaces/mockTrips) – ukáže, s čím server dál pracuje
  const r = await (await fetch(`${base}/api/poi?lat=50.087654&lon=14.421234&radius=10`)).json();
  assert.equal(r.items[0].lat, 50.088);
  const t = await (await fetch(`${base}/api/poi/trips?lat=-33.867851&lon=151.207321`)).json();
  assert.equal(t.items[0].lat, -33.868);
  // chybějící poloha dál 400 (zaokrouhlení z NaN neudělá 0)
  assert.equal((await fetch(`${base}/api/poi?lat=&lon=14.4`)).status, 400);
});
