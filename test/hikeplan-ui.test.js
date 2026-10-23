// Túra na každý den v aplikaci (public/js/places.js přes node:vm): karta dne s cílem, startem, délkou, převýšením,
// časem, obtížností, občerstvením a variantami; odhad bez trasy, dny bez túry, cizí data z odkazu escapovaná; uložení do
// plánovače, „Krkonoše na 3 dny“ v Objevuj = túra na každý den, trasa dne pro „📍 Dnes na cestě“. Plán ze serveru
// (planHikes nad daty z Krkonoš – test/fixtures/hike-krkonose.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as F from './fixtures/hike-krkonose.js';

const H = await import('../server/lib/hikeplan.js');
const { parseRoute, hikeMinutes } = await import('../server/lib/bike.js');

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const ctx = { console, URLSearchParams, setTimeout, clearTimeout, Weather: {} }; // Weather: místa pro počasí a západ slunce v kartě
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src('app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx);
vm.runInContext('const fmtDate = (d) => d;', ctx);
for (const f of ['smart.js', 'places.js']) vm.runInContext(src(f), ctx, { filename: f });
const T = ctx.Places._t;
const { Smart } = ctx;
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (h) => h.replace(/[ \t\r\n]+/g, ' '); // nezlomitelné mezery (\u00a0) zůstanou
const XSS = '<img src=x onerror=alert(1)>';

const SNEZKA = (() => { const r = parseRoute(F.BROUTER_PEC_SNEZKA); return { ...r, minutes: hikeMinutes(r.km, r.ascent, r.descent) }; })();
const route = async (s, g) => {
  if (g.name === 'Sněžka') return SNEZKA;
  const km = 9.6;
  return { km, ascent: 520, descent: 520, minutes: hikeMinutes(km, 520, 520), geometry: [[s.lon, s.lat, 830], [g.lon, g.lat, 1350], [s.lon, s.lat, 830]] };
};
const deps = { places: async () => F.places(F.PEC_PLACES), trailheads: async () => [], route, food: async () => H.foodRows(F.OVERPASS_FOOD) };
const PEC = { lat: F.PEC.lat, lon: F.PEC.lon, label: 'Pec pod Sněžkou', city: 'Pec pod Sněžkou', country: 'Česko' };
const planOf = async (q) => ({ kind: 'hike', ...plain(await H.planHikes({ ...F.PEC, start: '2027-07-09', end: '2027-07-11', ...q }, deps)), center: PEC });

test('karta dne túry: cíl a start, délka, převýšení, čas a obtížnost, chaty po cestě, déšť a mlha, GPX a odkazy', async () => {
  const plan = await planOf({ arrivalTime: '10:00', departureTime: '18:00' });
  const h = sp(T.hikePlanHtml(plan, PEC));
  assert.match(h, /🥾 Túra na každý den · Krkonoše – každý den jiný cíl/);
  const i = plan.days.findIndex((d) => d.hike && d.hike.goal.name === 'Sněžka');
  const day = sp(T.hikeDayHtml(plan.days[i], i, PEC, plan));
  assert.match(day, /<b>⛰️ Sněžka<\/b> <span class="faint">z: Pec pod Sněžkou · hlavní vrchol · nejvýš/);
  assert.match(day, /nejvýš ~1\u00a0\d{3}\u00a0m n\.\u00a0m\./);
  assert.match(day, /<b>13,9\u00a0km<\/b><span>↗ 934 m<\/span><span>↘ 934 m<\/span><span>⏱️ ~6\u00a0h 43\u00a0min chůze<\/span><span class="hk-diff hk-d3">náročná<\/span>/);
  assert.match(day, /🚶 Start: <b>Pec pod Sněžkou<\/b> – pěšky tam a zpět/);
  assert.match(day, /🍽️ Po cestě: 🛖 Bouda Růžohorky <span class="faint">\(3,1\u00a0km\)<\/span> · ☕ Česká poštovna/);
  assert.match(day, /🌧️ Když prší nebo je mlha: jen k chatě <b>Bouda Růžohorky<\/b> a zpět \(~6,2\u00a0km, ~3\u00a0h\)\. Za bouřky, mlhy či silného větru na hřebeny a vrcholy nechoď\./);
  assert.match(day, /data-hdrop="Q617511"[^>]*>✕ jiný cíl/);
  assert.match(day, /data-hgpx="\d"/);
  assert.match(day, /túra: <a class="linkbtn" href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;origin=50\.69170%2C15\.73330[^"]*travelmode=walking/);
  assert.match(day, /<svg class="elev"/);
  assert.match(day, /data-sun="50\.73611,15\.74028,2027-07-\d\d,\d\d:\d\d"/, 'návrat po setmění podle západu slunce u cíle');
  assert.ok(!day.includes('🧒'), 'bez dětí bez varianty s dětmi');
  // túra delší, než den dovolí: rada vyrazit brzy nebo zkrátit
  assert.match(T.hikeDayHtml({ ...plan.days[i], hike: { ...plan.days[i].hike, long: true } }, i, PEC, plan), /⏳ <div>Dlouhá túra – vyraz brzy ráno \(se startem 08:30 a přestávkami zpět kolem 16:34\), nebo ji zkrať\./);
  // s dětmi: bližší cíle (do 3,7 km) a u každého dne varianta pro děti
  const kids = await planOf({ kids: true });
  assert.ok(kids.days.every((d) => d.hike && !/Sněžka/.test(d.hike.goal.name)), 'Sněžka (5 km, 934 m) s dětmi ne');
  assert.ok(kids.days.every((d) => /🧒 S dětmi: /.test(T.hikeDayHtml(d, 0, PEC, kids))));
  assert.match(T.kidsTxt({ kids: { kind: 'turn', minutes: 60 } }), /🧒 S dětmi: celá túra je na děti dlouhá – otočte se po ~1\u00a0h chůze\./);
  assert.match(T.kidsTxt({ kids: { kind: 'ok' } }), /túra je zvládnutelná i s dětmi/);
  assert.match(h, /Čas chůze podle turistického vzorce DIN 33466 \(4 km\/h, 300 m stoupání a 500 m klesání za hodinu/);
  assert.match(h, /Obtížnost: lehká do 3 h chůze a 400 m stoupání, náročná nad 6 h/);
  assert.match(h, /<summary>Další cíle v okolí \(\d\)<\/summary>/);
});

test('odhad bez trasy, občerstvení „nevím“, den bez túry, kratší den bez času a start u cíle', async () => {
  const est = { date: '2027-07-10', type: 'full', from: '08:30', to: '18:00', budget: 475, items: [],
    hike: { goal: { id: 'g', name: 'Luční hora', kind: 'summit', theme: 'other', lat: 50.7278, lon: 15.6825 }, start: { kind: 'town', name: 'Špindlerův Mlýn', lat: 50.7256, lon: 15.6094, km: 9.4, toGoal: 5.2 },
      km: 14.5, ascent: null, descent: null, minutes: null, estimate: true, difficulty: null, food: null, rain: { kind: 'turn', km: 7.3 }, exposed: true, mapyUrl: 'https://mapy.com/fnc/v1/route?x=1', googleUrl: 'https://www.google.com/maps/dir/?api=1' } };
  const h = sp(T.hikeDayHtml(est, 1, PEC, { fromBase: true }));
  assert.match(h, /<b>~14,5\u00a0km<\/b><span>tam a zpět – odhad vzdušnou čarou, převýšení a čas ověř v Mapy\.com<\/span>/);
  assert.match(h, /🏘️ Start: <b>Špindlerův Mlýn<\/b> <span class="faint">\(obec – autem nebo busem, ~9,4\u00a0km od ubytování · 5,2\u00a0km vzdušnou čarou od cíle\)<\/span>/);
  assert.match(h, /🍽️ Občerstvení po cestě teď nevím – chaty a restaurace ověř v Mapy\.com/);
  assert.match(h, /zkrať túru – otoč to v půlce \(po ~7,3\u00a0km\)/);
  assert.ok(!h.includes('hk-diff') && !h.includes('data-hgpx') && !h.includes('data-sun'), 'bez obtížnosti, GPX a západu slunce');
  // ze středu oblasti (Objevuj) bez „od ubytování“
  assert.ok(!T.hikeDayHtml(est, 1, PEC, { fromBase: false }).includes('od ubytování'));
  // den příjezdu bez túry a kratší den odjezdu, na který túra nestačí
  assert.match(T.hikeDayHtml({ date: '2027-07-09', type: 'rest', arrival: true, note: 'arrival', items: [] }, 0, PEC, {}), /Den příjezdu – na túru už není čas: procházka po okolí a odpočinek\./);
  const short = { ...est, type: 'short', departure: true, budget: 125, hike: { ...est.hike, minutes: 285, km: 10.9, ascent: 636, descent: 636, estimate: false, long: true, difficulty: { level: 2, label: 'střední' }, food: [] } };
  const s = sp(T.hikeDayHtml(short, 2, PEC, { fromBase: true }));
  assert.match(s, /Den 3 · [^·]+ · den odjezdu · kratší túra/);
  assert.match(s, /Na celou túru dnes není čas \(~4\u00a0h 45\u00a0min chůze, den má na chůzi ~2\u00a0h 5\u00a0min\) – jdi jen kus cesty a otoč to nejpozději po ~1\u00a0h/);
  assert.match(s, /🍽️ Po cestě jsem chatu ani restauraci nenašel – vezmi si svačinu a pití\./);
});

test('plán z cizího odkazu (#trip=): názvy escapované, čísla jen jako čísla, geometrie jen platná', () => {
  const bad = { date: '2027-07-10', type: 'full', from: '08:30', budget: XSS, items: [],
    hike: { goal: { id: `"${XSS}`, name: XSS, kind: XSS, lat: 50.7, lon: 15.7, url: 'javascript:alert(1)' }, start: { kind: 'town', name: XSS, km: XSS, toGoal: XSS }, km: XSS, ascent: XSS, minutes: 200, top: XSS, back: XSS,
      difficulty: { level: XSS, label: XSS }, food: [{ name: XSS, kind: 'hut', km: XSS }], rain: { kind: 'hut', name: XSS, km: XSS }, kids: { kind: 'goal', name: XSS }, geometry: [[XSS, 1], [2, 3]],
      mapyUrl: 'javascript:alert(1)', googleUrl: XSS } };
  const h = T.hikeDayHtml(bad, 0, PEC, {});
  assert.ok(!h.includes('<img'), h);
  assert.ok(!h.includes('javascript:'));
  assert.ok(!h.includes('data-hgpx') && !h.includes('<svg'), 'neplatná geometrie se nekreslí');
  assert.ok(!h.includes('hk-diff'));
});

test('uložení do plánovače: túry jako řádky dnů s délkou a odkazy do Mapy.com v poznámkách', async () => {
  const plan = await planOf({});
  const e = plain(T.plannerEntry({ hikes: plan, place: { label: 'Pec pod Sněžkou', cc: 'CZ' } }));
  assert.equal(e.src, 'hikes');
  assert.equal(e.name, 'Túry: Pec pod Sněžkou');
  assert.deepEqual([e.start, e.end], ['2027-07-09', '2027-07-11']);
  const all = Object.values(e.days).flat();
  assert.ok(all.some((x) => x === '🥾 Sněžka – z: Pec pod Sněžkou (13,9 km, ↗ 934 m, ~6 h 43 min chůze)'), all.join('\n'));
  assert.match(e.notes, /Sněžka: https:\/\/mapy\.com\/fnc\/v1\/route\?mapset=outdoor/);
  // „📍 Dnes na cestě“: den túry vede na trasu túry, ne na pěší trasu po městě
  const d = plan.days.find((x) => x.hike && x.hike.goal.name === 'Sněžka');
  assert.deepEqual(plain(ctx.Places.dayRoute(PEC, d)), { trip: false, hike: true, url: d.hike.googleUrl, mapy: d.hike.mapyUrl });
});

test('Objevuj: „Krkonoše na 3 dny“ = túra na každý den (ne program po místech), Pěšky si druh pamatuje; program ve městě v horách nabídne túry', () => {
  const ex = T.ex;
  Object.assign(ex, { mode: 'city', days: 1, auto: null });
  ex.hike.kind = 'loop';
  T.exploreApply(Smart.parseExplore('Krkonoše na 3 dny', { today: '2026-10-22' }), { label: 'Krkonoše', lat: 50.7672, lon: 15.6222, nature: 'range', km: 20 });
  assert.deepEqual([ex.mode, ex.hike.kind, ex.days], ['hike', 'days', 3]);
  assert.equal(T.curKey(), 'hikes');
  assert.equal(T.keyKind('hikes'), 'hikes');
  // město na 3 dny zůstane programem
  ex.hike.kind = 'loop';
  T.exploreApply(Smart.parseExplore('Lisabon na 3 dny', { today: '2026-10-22' }), { label: 'Lisabon', lat: 38.72, lon: -9.14 });
  assert.deepEqual([ex.mode, ex.hike.kind], ['city', 'loop']);
  // zapamatovaný stav nese druh Pěšky, cizí hodnota se zahodí
  assert.equal(T.uiRestore({ hike: { kind: 'days' } }, '2026-10-10').hike.kind, 'days');
  assert.equal(T.uiRestore({ hike: { kind: 'hack' } }, '2026-10-10').hike.kind, undefined);
  assert.deepEqual(plain(T.HIKE_KINDS.map((k) => k[0])), ['loop', 'days']);
  // program po místech, který vyšel v horách (rural), nabídne túry; plán túr ani město ne
  assert.equal(T.isRural({ days: [{ rural: true, items: [] }] }), true);
  assert.equal(T.isRural({ days: [{ items: [] }] }), false);
  assert.equal(T.isRural({ kind: 'hike', days: [{ rural: true }] }), false);
  Object.assign(ex, { mode: 'city', days: 3, auto: null });
  ex.hike.kind = 'loop';
});

// Krok Program s minimální náhražkou stránky: jeden „prvek“ na selektor, přepínač druhu jako dvě tlačítka.
function fakeEl() {
  const kids = new Map();
  const tpk = [{ dataset: { tpk: 'hike' } }, { dataset: { tpk: 'city' } }];
  return {
    innerHTML: '', hidden: false, isConnected: true, dataset: {}, style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, setAttribute() {},
    querySelector(s) { if (!kids.has(s)) kids.set(s, fakeEl()); return kids.get(s); },
    querySelectorAll: (s) => (s === '[data-tpk]' ? tpk : []),
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('krok Program: přepnutí na program po místech, než túry doběhnou – pozdní túry program cesty nepřepíšou ani se nevykreslí', async () => {
  const hikeJson = plain(await H.planHikes({ ...F.PEC, start: '2027-07-09', end: '2027-07-11' }, deps));
  const json = (j) => ({ ok: true, status: 200, json: async () => j });
  let hikeDone = null;
  let hikeCalls = 0;
  const fetch = async (url) => {
    if (url.startsWith('api/nature')) return json({ area: { cs: 'Krkonoše', kind: 'range' } });
    if (url === 'api/hikeplan') { hikeCalls++; return new Promise((r) => { hikeDone = () => r(json(hikeJson)); }); } // túry poprvé i 40 s
    if (url === 'api/itinerary') return json({ days: [{ date: '2027-07-09', kind: 'city', items: [], cap: 300 }], spare: [], places: [] });
    return json({ items: [] });
  };
  const c = { console, URLSearchParams, setTimeout, clearTimeout, fetch, document: { createElement() { throw new Error('bez mapy'); } } };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(src('app.js').match(/^const (\$|esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), c);
  vm.runInContext('const fmtDate = (d) => d;', c);
  for (const f of ['smart.js', 'places.js']) vm.runInContext(src(f), c, { filename: f });
  const host = fakeEl();
  const kinds = [];
  c.Places.renderPlanner(host, { ...PEC, start: '2027-07-09', end: '2027-07-11', onPlan: (p) => kinds.push(p.kind || 'city') });
  for (let i = 0; i < 20 && !hikeDone; i++) await tick();
  assert.ok(hikeDone, 'v horách se napřed plánují túry');
  const kindEl = host.querySelector('#tpKind');
  const btn = (k) => kindEl.querySelectorAll('[data-tpk]').find((b) => b.dataset.tpk === k);
  const shown = () => host.querySelector('#tpBody').querySelector('#tpPlan').innerHTML;
  btn('city').onclick();
  for (let i = 0; i < 20; i++) await tick();
  assert.deepEqual(kinds, ['city']);
  hikeDone();
  for (let i = 0; i < 20; i++) await tick();
  assert.deepEqual(kinds, ['city'], 'program cesty zůstane po místech, jak uživatel zvolil');
  assert.ok(!shown().includes('hk-day'), 'pod přepínačem „Program po místech“ nejsou túry');
  // zpět na túry: hotové túry hned, bez nového plánování
  btn('hike').onclick();
  for (let i = 0; i < 20; i++) await tick();
  assert.deepEqual(kinds, ['city', 'hike']);
  assert.ok(shown().includes('hk-day'));
  assert.equal(hikeCalls, 1);
});
