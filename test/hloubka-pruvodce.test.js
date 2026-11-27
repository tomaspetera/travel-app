// Podrobné počty v průvodci cestou, Objevuj a načítání (vrstva 1B) jen se souhlasem „Pomáhat se zlepšováním“:
// zapojení přes Count.deep (každý název na jednom místě, nikdy Count.hit, ne v překreslení), čistá stepEvent() v trip.js,
// lazy_fail v lazy.js ve falešném prohlížeči a trychtýř průvodce na stránce Statistiky (statistiky.js přes node:vm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const { EVENTS } = await import('../server/lib/counts.js');
const TRIP = read('public/js/trip.js'), PLACES = read('public/js/places.js'), LAZY = read('public/js/lazy.js');

const OWN = {
  'trip.js': ['trip_step_route', 'trip_step_stay', 'trip_step_car', 'trip_step_program', 'trip_back',
    'trip_restart_route', 'trip_restart_stay', 'trip_restart_car', 'trip_restart_program', 'trip_restart_summary',
    'trip_auto_done', 'trip_auto_nights', 'trip_auto_stay',
    'stay_pick_offer', 'stay_pick_auto', 'stay_pick_manual', 'stay_pick_links', 'stay_pick_skip', 'stay_empty_filter', 'trip_gap'],
  'places.js': ['ex_open_sug', 'ex_open_smart', 'ex_open_enter', 'ex_open_other', 'place_none_explore', 'ex_smart_ok', 'ex_smart_miss',
    'ex_empty_list', 'ex_empty_plan', 'ex_empty_trips', 'ex_empty_country', 'ex_fix', 'ex_save', 'ex_fly'],
  'lazy.js': ['lazy_fail'],
};
const SRC = { 'trip.js': TRIP, 'places.js': PLACES, 'lazy.js': LAZY };
/** Tělo funkce na úrovni modulu (odsazení 2 mezery) – od hlavičky po zavírací závorku na stejném odsazení. */
const body = (src, head) => { const i = src.indexOf(`\n  ${head}`); assert.ok(i >= 0, head); return src.slice(i, src.indexOf('\n  }\n', i) + 4); };

test('každý podrobný název je v EVENTS, na stránce Statistiky a v kódu právě jednou – v souboru, kam patří', () => {
  const stats = read('public/js/statistiky.js');
  for (const [f, names] of Object.entries(OWN)) for (const e of names) {
    assert.ok(EVENTS.includes(e), `${e} v EVENTS`);
    assert.ok(stats.includes(`'${e}'`), `${e} na stránce Statistiky`);
    for (const [g, src] of Object.entries(SRC)) assert.equal(src.split(`'${e}'`).length - 1, g === f ? 1 : 0, `${e} v ${g}`);
  }
});

test('podrobné počty jen přes Count.deep s kontrolou (starší count.js deep nemá), nikdy jako Count.hit', () => {
  const all = Object.values(OWN).flat();
  for (const [f, src] of Object.entries(SRC)) {
    for (const m of src.matchAll(/Count\.hit\(([^)]*)\)/g)) assert.ok(!all.some((e) => m[1].includes(`'${e}'`)), `${f}: ${m[0]}`);
    for (const line of src.split('\n').filter((l) => /\bCount\.deep\(/.test(l))) assert.match(line, /window\.Count && Count\.deep\b/, `${f}: ${line.trim()}`);
  }
  // trip.js a places.js mají jeden pomocník deep(), lazy.js volá přímo
  assert.match(TRIP, /const deep = \(e, k\) => \{ if \(e && window\.Count && Count\.deep\) Count\.deep\(e, k\); \};/);
  assert.match(PLACES, /const deep = \(e, k\) => \{ if \(window\.Count && Count\.deep\) Count\.deep\(e, k\); \};/);
  assert.match(LAZY, /if \(window\.Count && Count\.deep\) Count\.deep\('lazy_fail', nameOf\(src\)\);/);
  // stávající souhrnné počty průvodce zůstaly beze změny
  assert.deepEqual([...TRIP.matchAll(/Count\.hit\('([a-z_]+)'\)/g)].map((m) => m[1]).sort(),
    ['calendar_export', 'have_ticket_start', 'share', 'trip_auto', 'trip_saved', 'trip_started', 'trip_summary']);
  assert.match(TRIP, /const first = seenOnce\(sumSeen, t\.created\);\n {4}if \(window\.Count && first\) Count\.hit\('trip_summary'\);/);
});

test('trip_step_* a trip_back: jeden háček v setStep() a stepTo(), ne v render(), summaryStep() ani autoGo() (⚡)', () => {
  assert.match(body(TRIP, 'function setStep(step) {'), /if \(!T\(\)\) return;\n {4}stepCount\(T\(\), step\);/);
  assert.match(body(TRIP, 'function stepTo(step) {'), /return false;\n {4}stepCount\(t, step\);/);
  for (const head of ['function render() {', 'function summaryStep() {', 'function autoGo(t, step, kind, msg) {']) {
    assert.doesNotMatch(body(TRIP, head), /stepCount|stepEvent|STEP_EV|trip_step_|trip_back/, head);
  }
  assert.doesNotMatch(body(TRIP, 'function autoGo(t, step, kind, msg) {'), /deep\(/);
  // posun vpřed jednou za cestu (onceKey = t.created), návrat pokaždé
  assert.match(TRIP, /const stepCount = \(t, to\) => \{ const e = stepEvent\(t\.step, to\); deep\(e, e === STEP_EV\[to\] \? t\.created : undefined\); \};/);
});

test('trip_restart_*: jen v obsluze ↺ po potvrzení s postupem (restart() → true), ne v restart() (volá ho i newAfterPast)', () => {
  const r = body(TRIP, 'function restart() {');
  assert.doesNotMatch(r, /trip_restart_|RESTART_EV|deep\(/);
  assert.match(r, /if \(done\.length && !confirm\([^\n]*\)\) return;/, 'zrušené potvrzení vrátí undefined');
  assert.match(r, /return done\.length > 0;\n {2}\}$/);
  assert.match(TRIP, /\$\('#tripRestart'\)\.onclick = \(\) => \{ const at = t\.step; if \(restart\(\)\) deep\(RESTART_EV\[at\]\); \};/);
  assert.doesNotMatch(TRIP, /RESTART_EV\.flight|flight: 'trip_restart/, 'na kroku Let se nepočítá');
  assert.match(body(TRIP, 'function newAfterPast() {'), /if \(!e\) return restart\(\);/);
});

test('ostatní háčky průvodce: ⚡ výsledek, způsob výběru ubytování, filtry skryly vše jednou za dotaz, mezera ve Shrnutí', () => {
  const auto = body(TRIP, 'async function autoTrip() {');
  assert.match(auto, /\{ deep\('trip_auto_nights'\); return autoGo\(t, 'route'/);
  assert.match(auto, /if \(st\.stop\) \{\n {8}deep\('trip_auto_stay'\);/);
  assert.match(auto, /deep\('trip_auto_done'\);\n {6}autoGo\(t, 'summary', 'ok', AUTO_DONE\);/);
  // ✨ Vyber za mě jen ručně (⚡ volá autoPickStays přímo, bez stayPick)
  assert.match(TRIP, /if \(res\.ok\.length\) stayPick\('auto'\);/);
  assert.doesNotMatch(body(TRIP, 'async function autoStay(t) {'), /stayPick/);
  assert.equal(TRIP.split("stayPick('manual')").length - 1, 2, 'vlastní cena u jednoho místa i místa trasy');
  assert.equal(TRIP.split("stayPick('links')").length - 1, 2);
  assert.match(TRIP, /const doPick = h => \{ pickSeq\+\+; stayPick\('offer'\);/);
  assert.match(TRIP, /const skip = \(\) => \{ pickSeq\+\+; stayPick\('skip'\);/);
  assert.match(body(TRIP, 'function renderStays() {'), /if \(!items\.length\) deep\('stay_empty_filter', d\.key\);/);
  assert.match(body(TRIP, 'function summaryStep() {'), /\[data-goto\]', host\)\.forEach\(b => b\.onclick = \(\) => \{ deep\('trip_gap'\);/);
});

test('Objevuj: otevření v místě volání (ne v openPlace), nenalezené místo jen z hledání, prázdné výsledky jednou za místo', () => {
  assert.doesNotMatch(body(PLACES, 'function openPlace(s, o = { start: true, days: true }) {'), /deep\(|ex_open_/);
  // exNotFound volá i prázdný okruh – nenalezené místo se počítá až v hledání
  assert.doesNotMatch(body(PLACES, 'function exNotFound(el, text) {'), /deep\(/);
  // jednou za pokus (missNext zvýší n jen u nového textu, ne u dopsaného písmene ani téhož textu znovu)
  assert.match(PLACES, /else \{ const n = exMiss\.n; exNotFound\(q\.closest\('\.ex-search'\), sugFor\); if \(exMiss\.n > n\) deep\('place_none_explore'\); \}/);
  assert.match(PLACES, /pick\(sugs\[\+o\.dataset\.i\], 'ex_open_sug'\)/);
  assert.match(PLACES, /if \(a === 'pick'\) pick\(sugs\[act\], enter\);/);
  assert.match(PLACES, /if \(r\.length\) pick\(r\[0\], enter\); else show\(\);/);
  assert.match(PLACES, /if \(!down\) deep\(s \? 'ex_smart_ok' : 'ex_smart_miss'\);/, 'výpadek sítě není nepochopená věta');
  assert.equal(PLACES.split('openOther(').length - 1, 4, 'Inspirace (2×), Naposledy, 📍 Tady');
  assert.match(PLACES, /deep\('ex_empty_list', `\$\{p\.label\}\|\$\{ex\.radius\}`\)/);
  assert.match(PLACES, /if \(!cap\) \{ deep\('ex_empty_country', cc\);/);
  assert.match(PLACES, /const exFix = b => \{ if \(b\.closest && b\.closest\('\.empty'\)\) deep\('ex_fix'\); \};/);
  assert.match(PLACES, /const store = asNew => \{\n {6}deep\('ex_save'\);/);
});

test('stepEvent(): vpřed na Trasu–Program trip_step_*, na Shrnutí nic (trip_summary), zpět trip_back, jinak null', () => {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(TRIP, ctx, { filename: 'trip.js' });
  const { stepEvent } = ctx.window.Trip;
  assert.equal(stepEvent('flight', 'route'), 'trip_step_route');
  assert.equal(stepEvent('route', 'stay'), 'trip_step_stay');
  assert.equal(stepEvent('flight', 'car'), 'trip_step_car', 'skok lištou kroků dopředu');
  assert.equal(stepEvent('car', 'program'), 'trip_step_program');
  assert.equal(stepEvent('program', 'summary'), null);
  assert.equal(stepEvent('summary', 'stay'), 'trip_back');
  assert.equal(stepEvent('stay', 'flight'), 'trip_back');
  assert.equal(stepEvent('stay', 'stay'), null);
  assert.equal(stepEvent('stay', 'nic'), null);
  assert.equal(stepEvent(undefined, 'route'), null);
});

test('lazy.js: nenačtený modul → lazy_fail jednou s názvem modulu; bez Count.deep (starší count.js) nic nespadne', async () => {
  const run = (Count) => {
    const scripts = [];
    const ctx = {
      Promise, Map, Set, String, Error, Count,
      document: { currentScript: { getAttribute: (n) => (n === 'data-later' ? 'js/places.js js/trip.js?v=1' : null) }, createElement: () => ({ remove() {} }), head: { appendChild: (el) => scripts.push(el) } },
      setTimeout,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(LAZY, ctx, { filename: 'lazy.js' });
    return { L: ctx.Lazy, scripts };
  };
  const calls = [];
  const { L, scripts } = run({ hit() {}, deep: (e, k) => calls.push([e, k]) });
  const p = L.need('trip').catch(() => 'chyba');
  scripts[0].onload();
  scripts[1].onerror();
  assert.equal(await p, 'chyba');
  assert.deepEqual(calls, [['lazy_fail', 'trip']]);
  const old = run({ hit() {} });
  const q = old.L.need('places').catch(() => 'chyba');
  old.scripts[0].onerror();
  assert.equal(await q, 'chyba');
});

test('Statistiky: trychtýř průvodce s ↺ na kroku, procento jen mezi kroky ze stejné skupiny, ⚡ a Objevuj', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/statistiky.js'), ctx, { filename: 'statistiky.js' });
  const S = ctx.window.Stats;
  const total = { trip_started: 100, trip_step_route: 20, trip_restart_route: 2, trip_step_stay: 10, trip_step_car: 5, trip_step_program: 4, trip_summary: 40, trip_saved: 10, trip_restart_summary: 3 };
  const f = JSON.parse(JSON.stringify(S.tripFunnel(total)));
  assert.deepEqual(f.map((x) => [x.e, x.n, x.pct, x.restart, x.all]), [
    ['trip_started', 100, null, null, true],
    ['trip_step_route', 20, null, 2, false],
    ['trip_step_stay', 10, 50, 0, false],
    ['trip_step_car', 5, 50, 0, false],
    ['trip_step_program', 4, 80, 0, false],
    ['trip_summary', 40, null, 3, true],
    ['trip_saved', 10, 25, null, true],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(S.TRIP_AUTO.map(([e]) => e))), ['trip_auto_done', 'trip_auto_nights', 'trip_auto_stay']);
  assert.ok(S.EXPLORE.every(([, base]) => base.join() === 'view_explore'));
  const r = JSON.parse(JSON.stringify(S.rates({ view_explore: 50, place_none_explore: 5 }, S.EXPLORE)));
  assert.deepEqual([r[0].e, r[0].per100, r[0].few], ['place_none_explore', 10, false]);
  assert.match(read('public/js/statistiky.js'), /Jen lidé, kteří si sami zapnuli „Pomáhat se zlepšováním“/);
});
