// ℹ️ O aplikaci: seznam zdrojů a věta o provizi podle /api/health (public/js/about.js přes node:vm). Vypnutý zdroj
// (čistý režim bez Ryanairu, Wizz Airu, Kiwi, Xotela a Mapy.com) se v okně neukáže; bez health žádný starý pevný seznam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('public/js/about.js'), ctx, { filename: 'about.js' });
const A = ctx.About;

const prov = (on, ids = ['ryanair', 'wizzair', 'kiwi', 'liteapi', 'xotelo', 'osm', 'travelpayouts']) => ids.map((id) => ({ id, enabled: on.includes(id) }));
const ALL = { ok: true, demo: false, affiliate: true, providers: prov(['ryanair', 'wizzair', 'kiwi', 'xotelo', 'osm', 'travelpayouts']), maps: [{ id: 'mapy', enabled: true }] };
const TP_ONLY = { ok: true, demo: false, affiliate: false, providers: prov(['travelpayouts']), maps: [{ id: 'mapy', enabled: false }] };
const row = (list, title) => { const r = list.find((x) => x[1] === title); return r ? r[2] : null; };

test('zdroje: vše zapnuté – letenky, Xotelo, penziony z OSM i Mapy.com', () => {
  const s = A.sources(ALL);
  assert.equal(row(s, 'Letenky'), 'Ryanair a Wizz Air (přímo z jejich webů), Kiwi.com, Travelpayouts / Aviasales (ceny z vyhledávání za posledních ~48 h)');
  assert.equal(row(s, 'Ubytování'), 'TripAdvisor přes Xotelo (orientační ceny), penziony z OpenStreetMap (bez ceny); odkazy na Booking.com, Airbnb, Trip.com, Agodu a Hostelworld');
  assert.match(row(s, 'Mapy a trasy'), /^OpenFreeMap a OpenStreetMap, Mapy\.com, BRouter/);
  assert.equal(s.map((x) => x[1]).join('|'), 'Letenky|Ubytování|Vlak a bus|Počasí a podnebí|Mapy a trasy|Místa a program|Fotky|Palivo a kurzy|Vstup a letiště|Vlajky');
  const html = A.html({ version: 'v', health: ALL });
  for (const x of ['Ryanair', 'Wizz Air', 'Kiwi.com', 'Travelpayouts / Aviasales', 'Xotelo', 'Mapy.com']) assert.ok(html.includes(x), x);
});

test('zdroje: jen Travelpayouts (čistý režim) – vypnuté zdroje se neukážou', () => {
  const s = A.sources(TP_ONLY);
  assert.equal(row(s, 'Letenky'), 'Travelpayouts / Aviasales (ceny z vyhledávání za posledních ~48 h)');
  assert.equal(row(s, 'Ubytování'), 'odkazy na Booking.com, Airbnb, Trip.com, Agodu a Hostelworld');
  assert.equal(row(s, 'Vlak a bus'), 'RegioJet, FlixBus a IDOS jen jako odkazy', 'RegioJet živě jen, když ho health hlásí');
  const list = A.html({ version: 'v', health: TP_ONLY }).split('<h4 class="ab-h">Odkud jsou data</h4>')[1].split('</ul>')[0];
  for (const x of ['Ryanair', 'Wizz Air', 'Kiwi', 'Xotelo', 'TripAdvisor', 'Mapy.com', 'LiteAPI', 'spoje a ceny na vyžádání']) assert.ok(!list.includes(x), x);
  // samotný Ryanair a RegioJet hlášený zapnutý
  const one = A.sources({ providers: [{ id: 'ryanair', enabled: true }, { id: 'regiojet', enabled: true }] });
  assert.equal(row(one, 'Letenky'), 'Ryanair (přímo z jeho webu)');
  assert.match(row(one, 'Vlak a bus'), /^RegioJet \(spoje a ceny na vyžádání\)/);
  // health bez jediného zdroje letenek: řádek Letenky vůbec není (nic nenačítá)
  assert.equal(row(A.sources({ providers: [] }), 'Letenky'), null);
});

test('zdroje: health nedostupné – jen to, co platí vždy, a obecná věta u letenek', () => {
  for (const hl of [null, undefined, false, {}, { providers: 'x' }]) {
    const s = A.sources(hl);
    assert.equal(row(s, 'Letenky'), 'Zdroje se načítají…', String(hl));
    assert.equal(row(s, 'Ubytování'), 'odkazy na Booking.com, Airbnb, Trip.com, Agodu a Hostelworld');
    assert.ok(!s.some((x) => /Ryanair|Wizz|Kiwi|Travelpayouts|Xotelo|Mapy\.com/.test(x[2])), String(hl));
  }
  // licence a atribuce zůstávají v každém stavu
  for (const hl of [null, TP_ONLY, ALL]) {
    const html = A.html({ version: 'v', health: hl });
    for (const x of ['GeoNames (CC BY 4.0)', 'MET Norway', 'OpenStreetMap', 'ČSÚ', 'https://creativecommons.org/licenses/by/4.0/', 'OpenFlights (ODbL)']) assert.ok(html.includes(x), x);
  }
});

test('zdroje: id odpovídají tomu, co hlásí server (/api/health providers a maps)', () => {
  const idx = read('server/providers/index.js');
  for (const id of ['ryanair', 'wizzair', 'kiwi', 'liteapi', 'xotelo', 'osm', 'travelpayouts']) assert.match(idx, new RegExp(`id: '${id}'`), id);
  assert.match(read('server/lib/mapy.js'), /id: 'mapy', name: 'Mapy\.com', kind: 'maps', enabled:/);
  assert.match(read('server/index.js'), /affiliate: affiliateOn\('aviasales'\), providers: providerStatus\(\), maps: \[mapyStatus\(\)\]/);
});

test('Jak to funguje a z čeho žiju: nad zdroji, věta o provizi podle affiliate', () => {
  const head = '<h4 class="ab-h">Jak to funguje a z čeho žiju</h4>';
  const on = A.html({ version: 'v', health: ALL });
  assert.ok(on.indexOf(head) > 0 && on.indexOf(head) < on.indexOf('Odkud jsou data'), 'oddíl nad Odkud jsou data');
  assert.match(on, /Ceny porovnávám, letenku i ubytování koupíš vždy přímo u aerolinky nebo prodejce\. Hledání a plánování je zdarma a bez reklamních bannerů\./);
  assert.match(on, /Z některých odkazů na prodejce můžu dostat provizi\. Cenu ani pořadí výsledků to nemění\./);
  assert.doesNotMatch(on, /provizi z nich nemám/);
  const off = A.html({ version: 'v', health: TP_ONLY });
  assert.match(off, /Odkazy na prodejce jsou obyčejné odkazy, provizi z nich nemám\./);
  assert.doesNotMatch(off, /můžu dostat provizi|může Letsi dostat provizi/);
  const none = A.html({ version: 'v' });
  assert.doesNotMatch(none, /provizi/, 'bez health se o provizi nic netvrdí');
  for (const html of [on, off, none]) {
    assert.equal(html.match(/[Žž]ádná aerolinka ani partner si za lepší pozici neplatí/g).length, 1, 'věta jen jednou');
    assert.ok(html.indexOf('za lepší pozici neplatí') < html.indexOf('Odkud jsou data'), 'věta v novém oddílu');
    assert.match(html, /<h4 class="ab-h">Ceny jsou orientační<\/h4>/);
  }
});

test('uvítání nového uživatele: pod úvodní větou řádek o tom, kde se kupuje', () => {
  assert.match(read('public/js/app.js'), /<h3 class="wc-h">👋 Vítej! Najdu levné letenky a poskládám z nich celou cestu\.<\/h3>\n\s*<p class="faint wc-how" style="font-size:12\.5px;[^"]*">Ceny porovnávám, letenku koupíš u aerolinky nebo prodejce\. Zdarma, bez placených pozic\.<\/p>/);
  // výsledky se ve výchozím stavu řadí „👍 Doporučené“ (rank.js: cena i s cestou na letiště, přestupy, časy), ne od nejlevnější
  assert.match(read('public/js/flights.js'), /let view = \{ mode: 'list', sort: 'best',/);
  assert.match(read('public/js/app.js'), /<b>Vyber let<\/b><small>nahoře doporučené podle ceny, cesty a časů, doprava na letiště zvlášť pod cenou<\/small>/);
  assert.doesNotMatch(read('public/js/app.js'), /nejlevnější letenky nahoře/);
});
