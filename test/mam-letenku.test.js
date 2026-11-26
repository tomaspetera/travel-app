// „Letenku už mám“ (průvodce cestou bez hledání letu – trip.js ownFlightTrip, haveTicket), řádek „Koupeno?“ po návratu
// od prodejce (flights.js) a zapojení souhrnných počítadel (count.js → server/lib/counts.js EVENTS).
// Zástupný DOM jako v cesta-shrnuti.test.js: $ vrací stálé objekty podle selektoru, kliknutí = zavolání onclick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { EVENTS } from '../server/lib/counts.js';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load(health) {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  vm.runInContext(src('searchhelp.js'), ctx, { filename: 'searchhelp.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics, SearchHelp = window.SearchHelp;\n${helpers.join('\n')}
    var S = {}, __els = {}, __all = {}, __toasts = [], __go = [], __hits = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = (s) => __all[s] || [];
    var go = (v) => { __go.push(v); }; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var toast = (msg) => { __toasts.push(msg); }; var byIso = { PT: { cs: 'Portugalsko' } }; var PACK = ['Pas']; var enc = encodeURIComponent;
    var Count = window.Count = { hit: (e) => { __hits.push(e); } };
    window.scrollTo = () => {};`, ctx, { filename: 'app-helpers.js' });
  if (health) ctx.Flights = ctx.window.Flights = { warm: async () => health };
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const tick = () => new Promise((r) => setImmediate(r));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
// místa, jak je vrací našeptávač (api/places)
const LIS = { id: 'ap:LIS', type: 'airport', label: 'Lisabon', iata: 'LIS', cc: 'PT', lat: 38.78, lon: -9.14, sub: 'Lisbon Humberto Delgado Airport · LIS · Portugalsko' };
const PRAHA = { id: 'geo:50.0880,14.4208|Praha', type: 'city', label: 'Praha', cc: 'CZ', lat: 50.088, lon: 14.42, sub: 'letiště v okolí: PRG, DRS, JCL, PED' };
const P = (id, enabled, kind) => ({ id, name: id, enabled, ...(kind ? { kind } : {}) });
const FULL = { ok: true, demo: false, providers: [P('ryanair', true), P('kiwi', true), P('xotelo', true, 'stays'), P('osm', true, 'stays'), P('travelpayouts', true)] };
function render(ctx, step) {
  ctx.S.trip.step = step;
  ctx.window.Trip.render();
  return sp(ctx.__els['#tripStep'].innerHTML);
}

test('ownFlightTrip: ruční zadání → stejný tvar { t, g, result } jako vybraná nabídka; bez ceny, s ruční cenou, jen tam', () => {
  const { ownFlightTrip } = load().window.Trip;
  const x = plain(ownFlightTrip({ dest: LIS, from: PRAHA, out: day(30), back: day(35), adults: '2' }));
  assert.deepEqual(Object.keys(x), ['t', 'g', 'result']);
  const leg = (from, to, date) => ({ from, to, date, dep: null, arr: null, hasTime: false, provider: 'own', carrierName: 'vlastní let' });
  assert.deepEqual(x.t, { id: 'own', own: true, out: leg('PRG', 'LIS', day(30)), back: leg('LIS', 'PRG', day(35)), flightCzk: 0, groundCzk: 0, bagCzk: 0, arrCzk: 0, provider: 'own', bookUrl: null });
  assert.deepEqual(x.g, { dest: { label: 'Lisabon', country: 'Portugalsko', cc: 'PT', lat: 38.78, lon: -9.14, id: 'ap:LIS' } });
  assert.deepEqual(x.result, { origins: [], query: { adults: 2, bags: 'none' }, home: { label: 'Praha' }, arrivals: {} });
  // ruční cena za osobu: označená (manual), zaokrouhlená
  const m = plain(ownFlightTrip({ dest: LIS, out: day(30), back: '', priceCzk: '2499.6' }));
  assert.equal(m.t.manual, true);
  assert.equal(m.t.flightCzk, 2500);
  // jen tam, bez místa odletu: kód '???' jako u poškozeného letu (sanitizeTrip), nikdo ho nezná
  assert.equal(m.t.back, null);
  assert.equal(m.t.out.from, '???');
  assert.equal(m.result.home, null);
  assert.equal(m.result.query.adults, 1);
  // metropole bez iata: kód z id
  assert.equal(ownFlightTrip({ dest: { id: 'metro:LON', label: 'Londýn' }, out: day(3) }).t.out.to, 'LON');
  // neplatné: bez cíle, bez data, návrat před odletem
  assert.equal(ownFlightTrip({ out: day(3) }), null);
  assert.equal(ownFlightTrip({ dest: LIS, out: '' }), null);
  assert.equal(ownFlightTrip({ dest: LIS, out: day(10), back: day(9) }), null);
});

test('vlastní let v průvodci: rovnou Trasa, žádné ověřování ceny, „orientační“, „hledáno …“ ani odkazy na prodejce', async () => {
  const c = load(FULL);
  const asked = [];
  c.fetch = async (url) => { asked.push(String(url).split('?')[0]); return { ok: true, json: async () => ({ items: [], available: false }) }; };
  const { ownFlightTrip, start, costs } = c.window.Trip;
  start({ ...ownFlightTrip({ dest: LIS, from: PRAHA, out: day(30), back: day(35), adults: 2 }), step: 'route' });
  const t = c.S.trip;
  assert.equal(t.step, 'route');
  assert.equal(t.flight.own, true);
  assert.equal(t.flight.pricedAt, undefined, 'bez času ceny – žádné „hledáno …“ a ↻ Ověř cenu');
  assert.deepEqual(plain(c.__hits), ['trip_started']);
  // krok Let i po stavu serveru s živým ověřením (liveOn): nic se neověřuje
  const s = render(c, 'flight');
  await tick(); await tick();
  assert.ok(!asked.includes('api/verify'), 'api/verify se nevolá');
  assert.equal(t.verifiedAt, undefined);
  const s2 = render(c, 'flight');
  for (const h of [s, s2]) {
    assert.match(h, /✈️ Vlastní let/);
    assert.match(h, /<b>bez ceny<\/b>/);
    assert.doesNotMatch(h, /tfVerify|orientační|Aviasales|hledáno|tfPrice|Koupit/);
  }
  assert.equal(costs(t).flights, 0);
  // Shrnutí: vlastní let bez ceny se do Celkem nepočítá, v „Co zarezervovat“ letenka není
  let sum = render(c, 'summary');
  assert.match(sum, /Vlastní let \(2 os\.\) – bez ceny<\/td><td>—/);
  assert.doesNotMatch(sum, /data-bk="flight|Letenka tam|Koupit letenky|tf-ori">orientační/);
  // s ruční cenou: „zadáno ručně“ a v Celkem za oba cestující
  t.flight.flightCzk = 2500; t.flight.manual = true;
  sum = render(c, 'summary');
  assert.match(sum, /Vlastní let \(2 os\.\) – zadáno ručně<\/td><td>5\s000\sKč/);
  assert.equal(costs(t).total, 5000);
  assert.match(render(c, 'flight'), /2\s500\sKč<small class="tf-ori">zadáno ručně<\/small>/);
});

test('trip_summary jednou za cestu a otevření stránky – ne při každém překreslení Shrnutí', () => {
  const c = load();
  const { ownFlightTrip, start } = c.window.Trip;
  start(ownFlightTrip({ dest: LIS, out: day(30), back: day(33) }));
  render(c, 'summary'); render(c, 'summary'); render(c, 'flight'); render(c, 'summary');
  assert.deepEqual(plain(c.__hits), ['trip_started', 'trip_summary']);
  // jiná cesta (jiné created) se počítá znovu
  c.S.trip.created += 1;
  render(c, 'summary');
  assert.equal(c.__hits.filter((e) => e === 'trip_summary').length, 2);
  // 📅 Do kalendáře na klepnutí (stažení .ics dělá app.js – tady zástupce)
  c.icsDownload = () => {};
  c.__els['#sumIcs'].onclick();
  assert.equal(c.__hits.at(-1), 'calendar_export');
});

test('Koupeno?: druh odkazu u nabídky a nejvýš jednou za nabídku (flights.js offerKind, seenOnce)', () => {
  const F = src('flights.js');
  const kindSrc = F.match(/^ {2}const offerKind = (.*);$/m)[1], onceSrc = F.match(/^ {2}const seenOnce = (.*);$/m)[1];
  const offerKind = new Function(`return ${kindSrc};`)(), seenOnce = new Function(`return ${onceSrc};`)();
  assert.equal(offerKind('https://www.google.com/travel/flights?q=x', false, false), 'verify');
  assert.equal(offerKind('https://www.skyscanner.cz/transport/flights/prg/lis/', false, false), 'verify');
  assert.equal(offerKind(null, false, true), 'verify', '⚡ Ověřit cenu živě');
  assert.equal(offerKind('https://www.aviasales.com/search/x', true, false), 'buy');
  assert.equal(offerKind('https://www.ryanair.com/x', true, false), 'buy');
  assert.equal(offerKind('https://example.cz/info', false, false), null, 'jiný odkaz v kartě (Info o zemi…) se nepočítá');
  const seen = new Set();
  assert.equal(seenOnce(seen, 'a'), true);
  assert.equal(seenOnce(seen, 'a'), false);
  assert.equal(seenOnce(seen, 'b'), true);
  assert.equal(seenOnce(seen, undefined), false);
  // řádek se ukáže jen přes seenOnce a jen v kartě (žádné okno)
  const show = F.match(/function boughtShow\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(show, /if \(!row \|\| !seenOnce\(boughtSeen, b\.tid\)\) return;/);
  assert.match(show, /row\.insertAdjacentHTML\('beforeend', '<div class="tr-bought">Koupeno\? <button type="button" class="linkbtn" data-bought>Doplň si k letence zbytek cesty →<\/button><\/div>'\)/);
  assert.match(show, /onclick = \(\) => pickTrip\(b\.r\.t, b\.r\.g, b\.res\)/, 'stejně jako tlačítko průvodce u nabídky');
  assert.doesNotMatch(show, /modalOpen|alert\(/);
  assert.match(F, /document\.addEventListener\('visibilitychange', boughtShow\);/);
});

test('počítadla: každá událost na právě jednom místě, jen přes window.Count a jen ze seznamu EVENTS', () => {
  const dir = new URL('../public/js/', import.meta.url);
  const hits = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'count.js')) {
    src(f).split('\n').forEach((line, i) => {
      if (!/\bCount\.hit\(/.test(line)) return;
      assert.match(line, /window\.Count/, `${f}:${i + 1} volá Count.hit bez kontroly window.Count`);
      for (const m of line.matchAll(/Count\.hit\(([^)]*)\)/g)) for (const [, e] of m[1].replace(/=== '\w+'/g, '').matchAll(/'([a-z0-9_]+)'/g)) (hits[e] ||= []).push(`${f}:${i + 1}`);
    });
  }
  for (const e of Object.keys(hits)) assert.ok(EVENTS.includes(e), `${e} není v EVENTS`);
  const mine = { 'flights.js': ['search_done', 'search_anywhere', 'verify_click', 'buy_click'], 'trip.js': ['trip_started', 'trip_auto', 'trip_summary', 'trip_saved', 'share', 'calendar_export', 'have_ticket_start'], 'app.js': ['app_open', 'look_letsi'] };
  for (const [f, evs] of Object.entries(mine)) for (const e of evs) {
    assert.equal((hits[e] || []).length, 1, `${e}: ${(hits[e] || []).join(', ') || 'nikde'}`);
    assert.ok(hits[e][0].startsWith(f + ':'), `${e} má být v ${f}`);
  }
  const trip = src('trip.js'), app = src('app.js');
  // uložení na přání, ne samo (autoSave → saveToPlanner({ quiet: true }) skončí dřív)
  assert.match(trip, /if \(o\.quiet\) return save\(\);[^\n]*\n {4}if \(window\.Count\) Count\.hit\('trip_saved'\);/);
  assert.match(app, /if \(window\.Count && document\.documentElement\.dataset\.brand === 'letsi'\) Count\.hit\('look_letsi'\);/);
});

test('Přehled: „Letenku už mám“ vedle „Naplánovat celou dovolenou“ otevře formulář průvodce; novinka a WN_ID', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), app = src('app.js');
  assert.match(html, /<div class="hero-plans">\s*<button type="button" class="hero-plan" id="heroPlan">[^\n]*\n\s*<button type="button" class="hero-plan" id="heroOwn">✈️ Letenku už mám<span class="hp-more"> – doplň zbytek cesty<\/span> <span aria-hidden="true">→<\/span><\/button>\s*<\/div>/);
  assert.match(app, /const ho = \$\('#heroOwn'\); if \(ho\) ho\.onclick = \(\) => \{ go\('trip'\); if \(window\.Lazy\) Lazy\.run\('trip', \(\) => Trip\.haveTicket\(\)\);/);
  // nahoře ⭐ ATLAS Plus (stejná vlna), hned pod ním tahle novinka
  assert.match(app, /const WHATS_NEW = \[\s*\['🤝', 'Pomáhat se zlepšováním',[^\n]*\],\s*\['⭐', 'ATLAS Plus',[^\n]*\],\s*\['✈️', 'Letenku už máš\?', 'na <b>Přehledu<\/b> doplníš zbytek cesty – trasu, ubytování i program\.'\],/);
  // formulář: cíl, tam, zpět (nepovinné), cestující, cena (nepovinné), odkud (nepovinné); počítadlo při otevření
  const ht = src('trip.js').match(/function haveTicket\(\) \{[\s\S]*?\n {2}\}/)[0];
  for (const id of ['ownTo', 'ownOut', 'ownBack', 'ownPax', 'ownPrice', 'ownFrom']) assert.match(ht, new RegExp(`id="${id}"`));
  assert.match(ht, /if \(x\) start\(\{ \.\.\.x, step: 'route' \}\);/);
  assert.match(ht, /Count\.hit\('have_ticket_start'\)/);
  // dvě pole vedle sebe: minmax(0,1fr) – s 1fr pole „Zpět“ (datum) na 412 px přetékalo z karty
  const css = readFileSync(new URL('../public/css/trip.css', import.meta.url), 'utf8');
  assert.match(css, /\.own-form \.own-row\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);/);
});
