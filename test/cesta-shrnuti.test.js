// Průvodce cestou před spuštěním v „čistém režimu“ (public/js/trip.js): ⚡ jako hlavní volba kroku Let, ✓ v liště kroků
// jen za skutečný výběr, Shrnutí s průběhem cesty po dnech nahoře a součtem, který přizná chybějící ubytování, a co
// průvodce (ne)slibuje, když server neumí živé ověření ceny letu (Kiwi) nebo nemá ceny hotelů (/api/health).
// Zástupný DOM jako v trip-auto.test.js: $ vrací stálé objekty podle selektoru, kliknutí = zavolání onclick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
// health = odpověď /api/health, kterou má aplikace z načítání (Flights.warm); bez ní průvodce Flights nevidí vůbec
function load(health) {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  vm.runInContext(src('searchhelp.js'), ctx, { filename: 'searchhelp.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics, SearchHelp = window.SearchHelp;\n${helpers.join('\n')}
    var S = {}, __els = {}, __all = {}, __toasts = [], __go = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = (s) => __all[s] || [];
    var go = (v) => { __go.push(v); }; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var toast = (msg) => { __toasts.push(msg); }; var byIso = {}; var PACK = ['Pas']; var enc = encodeURIComponent;
    window.scrollTo = () => {};`, ctx, { filename: 'app-helpers.js' });
  if (health) ctx.Flights = ctx.window.Flights = { warm: async () => health };
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const tick = () => new Promise((r) => setImmediate(r));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }; // termín vždy dopředu, ať test nezastará
const leg = (from, to, date, dep, arr, fromTz = 'Europe/Rome', toTz = 'Europe/Rome', extra = {}) => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: `https://air.example/${from}-${to}`, ...extra,
});
const ROM = { key: 'ROM', id: 'metro:ROM', label: 'Řím (Itálie)', cc: 'IT', country: 'Itálie', lat: 41.9, lon: 12.5 };
const BCN = { key: 'BCN', id: 'ap:BCN', label: 'Barcelona', cc: 'ES', country: 'Španělsko', lat: 41.39, lon: 2.17 };
// Řím na 4 noci; cached = cena z mezipaměti Aviasales (lety mají live === false); at = čas výsledku hledání
function begin(ctx, { cached = false, at = Date.now() - 2 * 36e5, multi = false, verified = true } = {}) {
  const live = cached ? { live: false } : {};
  const out = leg('PRG', 'FCO', day(40), '10:00', '12:00', 'Europe/Prague', 'Europe/Rome', live);
  const back = multi ? leg('BCN', 'PRG', day(46), '18:10', '20:35', 'Europe/Madrid', 'Europe/Prague', live) : leg('FCO', 'PRG', day(44), '18:10', '20:05', 'Europe/Rome', 'Europe/Prague', live);
  const mid = multi ? { mid: [leg('FCO', 'BCN', day(43), '07:35', '09:20', 'Europe/Rome', 'Europe/Madrid', live)] } : {};
  const t = { id: 'x', out, ...mid, back, flightCzk: 3000, groundCzk: 200, bagCzk: 0, arrCzk: 0, perPersonCzk: 3200, totalCzk: 6400, provider: 'demo-air', combined: false, bookUrl: null, deal: { level: 'good' } };
  ctx.window.Trip.start({ t, g: { dest: ROM }, result: { origins: [], query: { adults: 2, bags: 'none' }, home: null, arrivals: {} }, at, ...(multi ? { stops: [ROM, BCN] } : {}) });
  if (verified) ctx.S.trip.verifiedAt = 1; // samočinné ověření ceny už proběhlo (jednou za cestu)
  return ctx.S.trip;
}
function render(ctx, step) {
  ctx.S.trip.step = step;
  ctx.window.Trip.render();
  return sp(ctx.__els['#tripStep'].innerHTML);
}
const root = (ctx) => sp(ctx.__els['#tripRoot'].innerHTML);
// ✓ v liště kroků: které kroky ho mají
const ticks = (ctx) => [...root(ctx).matchAll(/<button type="button" class="st ([^"]*)" data-step="(\w+)"[^>]*><span>([^<]*)<\/span>/g)].filter((m) => m[3] === '✓').map((m) => m[2]);
// stav serveru: čistý režim (jen mezipaměť Aviasales a ubytování z OpenStreetMap bez cen) a běžný provoz
const P = (id, enabled, kind) => ({ id, name: id, enabled, ...(kind ? { kind } : {}) });
const CLEAN = { ok: true, demo: false, providers: [P('ryanair', false), P('wizzair', false), P('kiwi', false), P('liteapi', false, 'stays'), P('xotelo', false, 'stays'), P('osm', true, 'stays'), P('travelpayouts', true)] };
const FULL = { ok: true, demo: false, providers: [P('ryanair', true), P('kiwi', true), P('liteapi', false, 'stays'), P('xotelo', true, 'stays'), P('osm', true, 'stays'), P('travelpayouts', true)] };
const DEMO = { ok: true, demo: true, providers: [P('demo-air', true), P('demo-jet', true)] };
const osm = (id, km, extra = {}) => ({ id, name: `Penzion ${id}`, provider: 'osm', priceTotalCzk: null, value: null, rating: null, distanceKm: km, bookUrl: `https://booking.example/${id}`, lat: 41.9, lon: 12.5, ...extra });
const DAYS = [{ date: day(41), items: [{ id: 'p1', name: 'Koloseum', lat: 41.89, lon: 12.49, category: 'sight', visitMin: 90 }] }];
// nahrazené api/stays (ubytování z OpenStreetMap bez cen), api/itinerary, api/geocode a api/verify
function fakeFetch(ctx, { items = [osm('a', 2.4), osm('b', 0.6), osm('c', null)] } = {}) {
  const asked = [];
  ctx.fetch = async (url) => {
    const path = String(url).split('?')[0];
    asked.push(path);
    if (path === 'api/verify') return { ok: true, json: async () => ({ available: false, items: [] }) };
    if (path === 'api/geocode') return { ok: true, json: async () => ({ items: [{ lat: 41.8933, lon: 12.4829, label: 'Řím', cc: 'IT' }] }) };
    if (path === 'api/itinerary') return { ok: true, json: async () => ({ days: DAYS, spare: [], warnings: [], places: [] }) };
    if (path === 'api/nature') return { ok: true, json: async () => ({ area: null }) };
    return { ok: true, json: async () => ({ items, osmFallback: true, providers: [{ id: 'osm', name: 'OpenStreetMap', ok: true, count: items.length }], links: [{ id: 'booking', name: 'Booking.com', note: '', url: 'https://booking.example/hledat' }], query: { nights: 4, city: 'Řím' } }) };
  };
  return asked;
}

test('krok Let: ⚡ Poskládej je hlavní volba hned pod letem, vedle „Projdu to krok za krokem →“; zdvojené Pokračovat v kartě není, hotová cesta má zase Pokračovat', () => {
  const c = load();
  const t = begin(c);
  let s = render(c, 'flight');
  const iLegs = s.indexOf('class="tl-legs"'), iAuto = s.indexOf('id="tfAuto"'), iNext = s.indexOf('id="tfNext"'), iCosts = s.indexOf('class="tf-costs"');
  assert.ok(iLegs > 0 && iLegs < iAuto && iAuto < iNext && iNext < iCosts, '⚡ a krok za krokem mezi vybraným letem a cenami');
  assert.match(s, /<button type="button" class="btn primary" id="tfAuto">⚡ Poskládej celou cestu za mě<\/button><button class="btn" id="tfNext" data-next="Pokračovat: Trasa →">Projdu to krok za krokem →<\/button>/);
  assert.doesNotMatch(s, />Pokračovat: Trasa →</, 'v kartě není druhé „Pokračovat: Trasa →“ (plovoucí lišta bere popisek z data-next)');
  // vedlejší tlačítko dělá totéž co dřívější Pokračovat
  c.__els['#tfNext'].onclick();
  assert.equal(t.step, 'route');
  // hotová cesta: ⚡ by nic nepřidal → hlavní je zase „Pokračovat: Trasa →“
  Object.assign(t, { stay: { mode: 'skip', name: 'bez ubytování', totalCzk: 0 }, car: { mode: 'skip', totalCzk: 0 }, plan: { days: [{ date: day(41), items: [] }] } });
  s = render(c, 'flight');
  assert.doesNotMatch(s, /tfAuto|krok za krokem/);
  assert.match(s, /<button class="btn primary" id="tfNext">Pokračovat: Trasa →<\/button>/);
});

test('lišta kroků: ✓ jen za skutečný výběr nebo výslovné „neřeším“ – krok, kterým se jen prošlo, ho nemá', () => {
  const c = load();
  const t = begin(c);
  const { stepDone } = c.window.Trip;
  // přeskočeno rovnou na Shrnutí: dřív ✓ u všech pěti kroků před ním
  render(c, 'summary');
  assert.deepEqual(ticks(c), ['flight']);
  assert.deepEqual(['flight', 'route', 'stay', 'car', 'program', 'summary'].map((k) => stepDone(t, k)), [true, false, false, false, false, false]);
  // trasa: potvrzené „Jedno místo celý pobyt“ je výběr
  render(c, 'route');
  c.__els['#rtNext'].onclick();
  assert.equal(t.step, 'stay');
  assert.deepEqual(ticks(c), ['flight', 'route']);
  // „jen odkazy“ a „bez auta“ jsou výslovné volby; program zatím žádný
  t.stay = { mode: 'skip', name: 'bez ubytování', totalCzk: 0 };
  t.car = { mode: 'skip', totalCzk: 0 };
  render(c, 'summary');
  assert.deepEqual(ticks(c), ['flight', 'route', 'stay', 'car']);
  // i po návratu na dřívější krok zůstává ✓ u toho, co je vybrané (aktuální krok ho neukazuje)
  render(c, 'route');
  assert.deepEqual(ticks(c), ['flight', 'stay', 'car']);
});

test('Shrnutí bez ubytování: řádek „Ubytování – zatím nevybráno · Vybrat →“ otevře krok Ubytování a součet se jmenuje „Celkem bez ubytování“', () => {
  const c = load();
  const t = begin(c);
  const { stayGap, totalLbl } = c.window.Trip;
  const go = { dataset: { goto: 'stay' } };
  c.__all['[data-goto]'] = [go];
  let s = render(c, 'summary');
  assert.match(s, /<tr><td>🏨<\/td><td>Ubytování – zatím nevybráno<span class="sum-go"> · <button type="button" class="linkbtn" data-goto="stay">Vybrat →<\/button><\/span><\/td><td>—<\/td><\/tr>/);
  assert.match(s, /<tr class="tot"><td><\/td><td>Celkem bez ubytování<\/td><td>6 400 Kč<\/td><\/tr>/);
  go.onclick();
  assert.equal(t.step, 'stay');
  // „jen odkazy“: ubytování v součtu pořád chybí; „neřeším“ a vybrané s cenou ne
  t.stay = { mode: 'links', name: '', totalCzk: 0 };
  assert.deepEqual(plain(stayGap(t)), { gap: 'all', pick: false });
  assert.match(render(c, 'summary'), /zatím bez ceny, vyber přes odkaz níž<\/td><td>—<\/td><\/tr>[\s\S]*<td>Celkem bez ubytování<\/td>/);
  t.stay = { mode: 'skip', name: 'bez ubytování', totalCzk: 0 };
  assert.deepEqual(plain(stayGap(t)), { gap: null, pick: false });
  assert.match(render(c, 'summary'), /<tr class="tot"><td><\/td><td>Celkem<\/td>/);
  t.stay = { mode: 'pick', name: 'Hotel Roma', totalCzk: 8000, url: 'https://hotel.example/r' };
  s = render(c, 'summary');
  assert.match(s, /<tr class="tot"><td><\/td><td>Celkem<\/td><td>14 400 Kč<\/td><\/tr>/);
  assert.doesNotMatch(s, /data-goto/);
  assert.deepEqual([null, 'all', 'part'].map((gap) => totalLbl({ gap })), ['Celkem', 'Celkem bez ubytování', 'Celkem bez části ubytování']);
});

test('Shrnutí trasy přes víc míst: ubytování jen někde → „Celkem bez části ubytování“ a Vybrat → vede na první místo bez něj', () => {
  const c = load();
  const t = begin(c, { multi: true });
  const { stayGap } = c.window.Trip;
  assert.equal(t.route.bases.length, 2);
  assert.deepEqual(plain(stayGap(t)), { gap: 'all', pick: true });
  t.route.bases[0].stay = { mode: 'pick', name: 'Hotel Roma', totalCzk: 6000 };
  assert.deepEqual(plain(stayGap(t)), { gap: 'part', pick: true });
  const go = { dataset: { goto: 'stay' } };
  c.__all['[data-goto]'] = [go];
  const s = render(c, 'summary');
  assert.match(s, /Ubytování zatím bez ceny · Barcelona<span class="sum-go"> · <button type="button" class="linkbtn" data-goto="stay">Vybrat →<\/button>/);
  assert.match(s, /<td>Celkem bez části ubytování<\/td>/);
  go.onclick();
  assert.equal(t.step, 'stay');
  assert.match(sp(c.__els['#tripStep'].innerHTML), /class="bt on[^"]*" data-bt="1"/, 'otevřená záložka místa bez ubytování');
  t.route.bases[1].stay = { mode: 'skip', name: 'bez ubytování', totalCzk: 0 };
  assert.deepEqual(plain(stayGap(t)), { gap: null, pick: false });
});

test('liveOn / stayPricesOn: bez /api/health jako dřív; Kiwi vypnuté = bez živého ověření; ceny hotelů jen s Xotelem, LiteAPI nebo v ukázkových datech', () => {
  const { liveOn, stayPricesOn } = load().window.Trip;
  assert.deepEqual([liveOn(null), liveOn({}), liveOn(FULL), liveOn(CLEAN), liveOn(DEMO)], [true, true, true, false, false]);
  assert.deepEqual([stayPricesOn(null), stayPricesOn({}), stayPricesOn(FULL), stayPricesOn(CLEAN), stayPricesOn(DEMO)], [true, true, true, false, true]);
  // enabled musí být opravdu true (ne chybějící, ne text); zapnuté jen LiteAPI stačí
  assert.equal(liveOn({ providers: [{ id: 'kiwi' }] }), false);
  assert.equal(liveOn({ providers: [{ id: 'kiwi', enabled: 'true' }] }), false);
  assert.equal(stayPricesOn({ providers: [P('liteapi', true, 'stays'), P('xotelo', false, 'stays')] }), true);
  assert.equal(stayPricesOn({ providers: [P('osm', true, 'stays')] }), false);
});

test('bez živého ověření (Kiwi vypnuté): žádné „Ověřit živou cenu“ ani „↻ Ověř cenu“, nic se samo neověřuje, místo toho věta o prodejci', async () => {
  const old = Date.now() - 3 * 864e5; // cena stará 3 dny – s ověřením by Shrnutí nabídlo „↻ Ověř cenu“
  // stav serveru neznámý (nebo běžný provoz): jako dřív
  for (const health of [null, FULL]) {
    const c = load(health);
    const asked = fakeFetch(c);
    begin(c, { at: old, verified: false });
    render(c, 'flight');
    await tick(); await tick();
    const s = sp(c.__els['#tripStep'].innerHTML);
    assert.match(s, /id="tfVerify"[^>]*>🔄 Ověřit živou cenu</);
    assert.match(s, /id="tfAge">↻ Ověř cenu</);
    assert.doesNotMatch(s, /uvidíš až u prodejce/);
    assert.deepEqual(asked, ['api/verify'], 'první otevření kroku cenu ověří samo');
    assert.match(render(c, 'summary'), /id="sumAge">↻ Ověř cenu</);
  }
  // čistý režim: stav serveru dorazí až po prvním vykreslení → krok se překreslí bez tlačítek a samočinné ověření
  // na stav počká (dřív se při prvním otevření průvodce ověřovalo dřív, než stav serveru dorazil)
  const c = load(CLEAN);
  const asked = fakeFetch(c);
  const t = begin(c, { at: old, verified: false });
  render(c, 'flight');
  await tick(); await tick();
  assert.equal(t.verifiedAt, undefined);
  assert.deepEqual(asked, [], 'ani první otevření průvodce se v čistém režimu samo neověřuje');
  let s = sp(c.__els['#tripStep'].innerHTML);
  assert.doesNotMatch(s, /tfVerify|Ověřit živou cenu|Ověř cenu|tfAge/);
  assert.match(s, /<div class="faint tf-age">hledáno [^<]*\(před 3 dny\)<\/div><div class="faint tf-seller">Aktuální cenu a volná místa uvidíš až u prodejce\.<\/div>/);
  // stav serveru už známý: nová cesta se při otevření kroku Let sama neověřuje
  c.S.trip = null;
  const t2 = begin(c, { at: old, verified: false });
  render(c, 'flight');
  await tick();
  assert.equal(t2.verifiedAt, undefined);
  assert.deepEqual(asked, []);
  s = render(c, 'summary');
  assert.doesNotMatch(s, /Ověř cenu|sumAge/);
  assert.match(s, /Letenky \(2 os\.\)<div class="faint tf-age">hledáno [^<]*<\/div><div class="faint tf-seller">Aktuální cenu a volná místa uvidíš až u prodejce\.<\/div><\/td>/);
});

test('čistý režim: klepnutí na „↻ Ověř cenu“ vykreslené dřív, než dorazil stav serveru, nic neověřuje ani neslibuje', async () => {
  const old = Date.now() - 3 * 864e5;
  for (const step of ['flight', 'summary']) {
    const c = load(CLEAN);
    const asked = fakeFetch(c);
    const t = begin(c, { at: old });
    const id = step === 'flight' ? '#tfAge' : '#sumAge';
    c.__els['#tfAlt'] = { innerHTML: '' };
    // stav serveru ještě neznámý → tlačítko je vidět (jako dřív) a uživatel na něj hned klepne
    assert.match(render(c, step), new RegExp(`id="${id.slice(1)}">↻ Ověř cenu<`));
    c.__els[id].onclick();
    await tick(); await tick();
    assert.deepEqual(asked, [], `${step}: žádné api/verify`);
    assert.doesNotMatch(c.__els['#tfAlt'].innerHTML, /Ověřuji/, `${step}: žádné „Ověřuji aktuální ceny…“`);
    assert.equal(t.step, step, 'Shrnutí zůstane Shrnutím');
    const s = sp(c.__els['#tripStep'].innerHTML);
    assert.doesNotMatch(s, /Ověř cenu|tfAge|sumAge/);
    assert.match(s, /uvidíš až u prodejce/);
  }
});

test('orientační cena (let z mezipaměti, live === false): „orientační“ u částky v kroku Let i ve Shrnutí, „hledáno 15:15“ místo „cena z“, bez štítku „💚 Dobrá cena“', () => {
  const tag = (t, idx, pl) => `<span class="b ${pl.level === 'low' ? 'good">💚 Dobrá cena' : 'dear">🔺 Dráž než obvykle'}</span>`;
  const mk = (cached, level = 'low') => {
    const c = load();
    c.Flights = c.window.Flights = { priceTag: tag };
    c.PriceCheck = c.window.PriceCheck = { assess: () => ({ level, reason: 'o 20 % pod obvyklou cenou' }) };
    return { c, t: begin(c, { cached }) };
  };
  // živá cena: beze změny
  let { c, t } = mk(false);
  assert.equal(c.window.Trip.flightCached(t), false);
  let s = render(c, 'flight');
  assert.match(s, /<span>Letenky<\/span><b>3 000 Kč<\/b>/);
  assert.match(s, /<div class="tf-price"><span class="b good">💚 Dobrá cena<\/span><span class="faint">o 20 % pod obvyklou cenou<\/span>/);
  assert.match(s, /<div class="faint tf-age">hledáno \d{1,2}:\d\d \(před 2 h\)<\/div>/);
  assert.doesNotMatch(s, /cena z |orientační/);
  assert.doesNotMatch(render(c, 'summary'), /orientační<\/small>/);
  // z mezipaměti
  ({ c, t } = mk(true));
  assert.equal(c.window.Trip.flightCached(t), true);
  s = render(c, 'flight');
  assert.match(s, /<span>Letenky<\/span><b>3 000 Kč<small class="tf-ori">orientační<\/small><\/b>/);
  assert.match(s, /<div class="tf-price"><span class="faint">o 20 % pod obvyklou cenou<\/span>/, 'štítek pryč, důvod a „Je to dobrá cena?“ zůstávají');
  assert.doesNotMatch(s, /Dobrá cena<\/span>/);
  s = render(c, 'summary');
  assert.match(s, /<td>✈️<\/td><td>Letenky \(2 os\.\)<div class="faint tf-age">hledáno \d{1,2}:\d\d \(před 2 h\)<\/div><\/td><td>6 000 Kč<small class="tf-ori">orientační<\/small><\/td>/);
  // „dráž než obvykle“ platí i u orientační ceny; stačí jeden let z mezipaměti
  ({ c, t } = mk(true, 'high'));
  assert.match(render(c, 'flight'), /<div class="tf-price"><span class="b dear">/);
  ({ c, t } = mk(false));
  t.flight.back.live = false;
  assert.equal(c.window.Trip.flightCached(t), true);
  t.overland = { on: true, out: { date: day(40) } };
  assert.equal(c.window.Trip.flightCached(t), false, 'vlakem / busem se cena letenek neukazuje');
});

test('tlDays: průběh cesty po dnech; zkrácení až od 12 řádků a po celých dnech (první den vždy celý)', () => {
  const { tlDays } = load().window.Trip;
  const rows = (...counts) => counts.flatMap((n, d) => Array.from({ length: n }, (_, i) => [`2027-01-${10 + d}`, '📍', `ř${d}.${i}`]));
  const shape = (r, ...o) => plain(tlDays(r, ...o)).map((d) => `${d.day.slice(8)}:${d.rows.length}${d.cut ? '×' : ''}`).join(' ');
  assert.deepEqual(plain(tlDays([])), []);
  // řádky téhož dne pod jeden nadpis, pořadí zůstává
  const d = plain(tlDays(rows(2, 1)));
  assert.deepEqual(d.map((x) => [x.day, x.rows.map((r) => r[2]), x.cut]), [['2027-01-10', ['ř0.0', 'ř0.1'], false], ['2027-01-11', ['ř1.0'], false]]);
  // 11 řádků: celé; 12: dny, které se do 8 řádků nevejdou, schované – i všechny další
  assert.equal(shape(rows(3, 3, 3, 2)), '10:3 11:3 12:3 13:2');
  assert.equal(shape(rows(3, 3, 3, 3)), '10:3 11:3 12:3× 13:3×');
  assert.equal(shape(rows(4, 4, 1, 1, 1, 1)), '10:4 11:4 12:1× 13:1× 14:1× 15:1×');
  assert.equal(shape(rows(5, 4, 1, 2)), '10:5 11:4× 12:1× 13:2×', 'za schovaným dnem už nic nevykukuje, i kdyby se vešlo');
  // první den delší než strop zůstane celý; jediný den se nekrátí vůbec
  assert.equal(shape(rows(11, 1)), '10:11 11:1×');
  assert.equal(shape(rows(14)), '10:14');
  // meze jdou zadat (top, from)
  assert.equal(shape(rows(2, 2, 2), 3, 5), '10:2 11:2× 12:2×');
});

test('Shrnutí: „Průběh cesty“ je první karta (po dnech), „Cena cesty“ pod ní; pod cenou řádek jen pro tisk', () => {
  const c = load();
  const t = begin(c);
  t.plan = { days: [{ date: day(41), items: [{ name: 'Koloseum', lat: 41.89, lon: 12.49 }] }] };
  const s = render(c, 'summary');
  const iTl = s.indexOf('<span class="ico i-kalendar" aria-hidden="true"></span> Průběh cesty'), iCost = s.indexOf('🧾 Cena cesty'), iBook = s.indexOf('✅ Co zarezervovat');
  assert.ok(iTl > 0 && iTl < iCost && iCost < iBook, 'průběh, cena, rezervace');
  assert.equal(s.split('<span class="ico i-kalendar" aria-hidden="true"></span> Průběh cesty').length, 2, 'jen jednou');
  // den jako nadpis a pod ním jeho řádky
  const days = [...s.matchAll(/<section class="tl-g[^"]*"><h4 class="tl-gh">([^<]*)<\/h4>/g)].map((m) => m[1]);
  assert.equal(days.length, new Set(days).size, 'každý den jeden nadpis');
  assert.ok(days.length >= 3, days.join(' | '));
  assert.doesNotMatch(s, /tl-cut|Zobrazit celý průběh|<details class="tl-more"/, 'krátký průběh se nekrátí');
  assert.match(s, /<div class="sum-print" id="sumPrint">Ceny k \d{1,2}\. \d{1,2}\. \d{4} \d{1,2}:\d\d – orientační, platí cena u prodejce\.<\/div>/);
  assert.equal(c.window.Trip.printNote(new Date(2027, 0, 12, 9, 5).getTime()), 'Ceny k 12. 1. 2027 9:05 – orientační, platí cena u prodejce.');
});

test('trip.css: tisk Shrnutí schová tlačítka a pole rozpočtu, průběh cesty krátí jen obrazovka telefonu, řádek „Ceny k…“ je jen na papíře', () => {
  const css = readFileSync(new URL('../public/css/trip.css', import.meta.url), 'utf8');
  assert.match(css, /@media screen and \(max-width:860px\)\{\.tl-cut \.tl-x\{display:none\}/, 'zkrácení není pro tisk ani počítač');
  assert.match(css, /\n\.sum-print\{display:none\}\n@media print\{/);
  const print = css.slice(css.indexOf('@media print{'));
  for (const sel of ['#view-trip .btn', '#view-trip button', '#view-trip .sum-acts', '#view-trip .bud-in', '#view-trip input:not([type=checkbox])']) assert.ok(print.includes(sel), sel);
  assert.match(print, /\.sum-print\{display:block/);
  assert.doesNotMatch(css, /tl-more/, 'starý rozbalovací <details> je pryč');
});

test('noPriceCand: bez cen hotelů nejbližší ubytování ke středu místa; hotely z okolí jen když v místě nic není', () => {
  const { noPriceCand } = load().window.Trip;
  const q = { city: 'Řím' };
  assert.equal(noPriceCand([osm('a', 2.4), osm('b', 0.6), osm('c', null)], q).id, 'b');
  assert.equal(noPriceCand([osm('a', 1, { rating: 7 }), osm('b', 1, { rating: 9 })], q).id, 'b', 'stejně daleko → lépe hodnocené');
  assert.equal(noPriceCand([osm('x', null), osm('y', 5)], q).id, 'y', 'bez známé vzdálenosti až za ostatními');
  assert.equal(noPriceCand([osm('far', 0.2, { nearby: { place: 'Tivoli' } }), osm('own', 6)], q).id, 'own');
  assert.equal(noPriceCand([osm('far', 9, { nearby: { place: 'Tivoli' } })], q).id, 'far');
  assert.equal(noPriceCand([osm('sold', 0.1, { soldOut: true }), { id: 'bezjmena', distanceKm: 0.1 }], q), null);
  assert.equal(noPriceCand(null, q), null);
});

test('server bez cen hotelů: ⚡ neslibuje poměr ceny a hodnocení, vybere ubytování blízko centra bez ceny a Shrnutí řekne „cena zatím neznámá“ (ne „zkus to za chvíli“)', async () => {
  const c = load(CLEAN);
  fakeFetch(c);
  const t = begin(c);
  render(c, 'flight');
  await tick(); await tick(); // stav serveru dorazil → krok Let překreslený
  let s = sp(c.__els['#tripStep'].innerHTML);
  assert.match(s, /<small>Vyberu ubytování blízko centra\. Cenu doplníš podle nabídky u prodejce\. Bez auta, s programem na místě\. Co už máš vybrané, nechám/);
  assert.doesNotMatch(s, /poměrem ceny/);
  await c.__els['#tfAuto'].onclick();
  assert.equal(t.step, 'summary', c.__els['#tripStep'].innerHTML.slice(0, 300));
  assert.deepEqual(plain(t.stay), { mode: 'pick', id: 'b', name: 'Penzion b', totalCzk: 0, url: 'https://booking.example/b', lat: 41.9, lon: 12.5, rating: null, provider: 'osm' });
  s = sp(c.__els['#tripStep'].innerHTML);
  assert.match(s, /<td>🏨<\/td><td>Ubytování · 4 noci · Penzion b · cena zatím neznámá – doplň ji ručně nebo otevři nabídku<span class="sum-go"> · <button type="button" class="linkbtn" data-goto="stay">Doplnit cenu →<\/button><\/span><\/td><td>—<\/td>/);
  assert.match(s, /<td>Celkem bez ubytování<\/td>/);
  assert.doesNotMatch(s, /zkus to za chvíli/);
  assert.ok(c.__toasts.every((m) => !/zkus to za chvíli/.test(m)), c.__toasts.join(' | '));
  // krok Ubytování: u vybraného totéž s odkazem na nabídku; hledání neslibuje ceny
  s = render(c, 'stay');
  assert.match(s, /Vybráno: <b>Penzion b<\/b> · <span class="st-noprice">cena zatím neznámá – doplň ji ručně nebo otevři nabídku<\/span> <a href="https:\/\/booking\.example\/b" target="_blank" rel="noopener">Otevřít nabídku ↗<\/a>/);
  assert.doesNotMatch(s, /poměrem ceny|Ceny se zjišťují/);
  // doplněná cena → běžný řádek a „Celkem“
  t.stay.totalCzk = 9000;
  s = render(c, 'summary');
  assert.match(s, /Ubytování · 4 noci · Penzion b<\/td><td>9 000 Kč<\/td>/);
  assert.match(s, /<tr class="tot"><td><\/td><td>Celkem<\/td><td>15 400 Kč<\/td><\/tr>/);
});

test('server s cenami hotelů (nebo neznámý stav): slib i chování jako dřív – ubytování bez ceny ⚡ nevybere', async () => {
  for (const health of [null, FULL, DEMO]) {
    const c = load(health);
    fakeFetch(c);
    const t = begin(c);
    render(c, 'flight');
    await tick(); await tick();
    assert.match(sp(c.__els['#tripStep'].innerHTML), /<small>Ubytování s nejlepším poměrem ceny a hodnocení blízko centra \(do 3 km\), bez auta a program na místě\./);
    await c.__els['#tfAuto'].onclick();
    assert.equal(t.step, 'stay');
    assert.equal(t.stay, null);
    assert.match(sp(c.__els['#tripStep'].innerHTML), /Ceny hotelů tu nemám – vyber z ubytování v místě a doplň cenu\. Auto a program jsem zatím nechal\./);
  }
});

test('plovoucí lišta v kroku Let: kopie říká „Pokračovat: Trasa →“ a ukáže se, až je „krok za krokem“ odrolované – dokud je pod okrajem, ⚡ nezakrývá', () => {
  // zástupná stránka jako v trip-next.test.js: okno 844 px, spodní lišta od 770, horní lišta do 68
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext('var S = { trips: [] }; var $ = () => null, $$ = () => []; var esc = (s) => String(s);', ctx);
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  const box = (top, h) => ({ top, bottom: top + h, height: h });
  const page = (top, own = true) => {
    const btn = { textContent: own ? 'Projdu to krok za krokem →' : 'Pokračovat: Trasa →', dataset: own ? { next: 'Pokračovat: Trasa →' } : {}, disabled: false, id: 'tfNext', isConnected: true, style: {},
      classList: { contains: (c) => c === 'primary' && !own }, getBoundingClientRect: () => box(top, 48) };
    const els = { '#tripNext': { hidden: true, dataset: {}, innerHTML: '', firstElementChild: {} }, '.mobile-nav': { getBoundingClientRect: () => box(770, 62) }, '.topbar': { getBoundingClientRect: () => box(0, 68) },
      '#view-trip': { classList: { contains: (c) => c === 'active' } }, '#tripStep #tfNext': btn };
    ctx.$ = (s) => els[s] || null;
    ctx.innerHeight = 844;
    ctx.getComputedStyle = () => ({ display: 'flex' });
    ctx.Trip.phoneNext();
    return { bar: els['#tripNext'], btn };
  };
  // pod okrajem (malý telefon, ⚡ vykukuje nad lištou) i celé vidět: bez kopie, tlačítko v kartě zůstává vidět
  for (const top of [740, 900, 400]) { const p = page(top); assert.equal(p.bar.hidden, true, `top ${top}`); assert.equal(p.btn.style.visibility, ''); }
  // odrolováno nahoru: kopie s popiskem kam vede, jako hlavní tlačítko
  const up = page(-40);
  assert.equal(up.bar.hidden, false);
  assert.equal(up.bar.innerHTML, '<button type="button" class="btn primary">Pokračovat: Trasa →</button>');
  // hotová cesta (bez ⚡, běžné Pokračovat) se chová jako ostatní kroky: pod okrajem kopie je
  assert.equal(page(740, false).bar.hidden, false);
});
