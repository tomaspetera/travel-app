// Závěrečná kontrola – okno cesty v Mých cestách (public/js/app.js): rozpočet bez překreslení okna, fokus po Enteru,
// smazaná aktivita s ↩ Vrátit, poškozená uložená cesta, název .ics (ics.js) a vlastní položky ze Shrnutí průvodce
// v „Sbaleno“ (pretrip.js patch → trip.js autoSoon). Klasické skripty přes node:vm, DOM jen jako malé náhražky.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const APP = read('public/js/app.js');
const grab = (start, end) => { const a = APP.indexOf(start); assert.ok(a >= 0, start); const b = APP.indexOf(end, a); assert.ok(b > a, end); return APP.slice(a, b); };
const plain = (x) => JSON.parse(JSON.stringify(x));

/** Okno cesty: náhrada $ s prvky podle id; reTrip okno „překreslí“ (nové prvky – starý fokus je pryč). */
function tripWindow(trips) {
  const log = { saved: 0, changed: 0, opened: 0, focus: [], toasts: [] };
  let els = {};
  const el = (id) => (els[id] ||= { id, innerHTML: '', value: '', focus() { log.focus.push(id); }, classList: { contains: () => ctx.__show } });
  const ctx = vm.createContext({
    S: { trips }, log, __show: true, window: {},
    $: (s) => el(s.replace(/^#/, '')),
    document: { getElementById: (id) => el(id) },
    save: () => { log.saved++; }, tripsChanged: () => { log.changed++; },
    openTrip: () => { log.opened++; els = {}; },
    toast: (...a) => log.toasts.push(a),
  });
  vm.runInContext(`var tripShown = S.trips[0];
    const tripIdx = i => (tripShown && S.trips[i] !== tripShown ? S.trips.indexOf(tripShown) : i);
    const reTrip = i => { save(); openTrip(i); tripsChanged(); };
    ${grab('// po Enteru zpět do (překresleného) pole', 'window.addRef = ')}
    ${grab('window.setBudget = ', 'window.setNotes = ')}
    var addAct = window.addAct, delAct = window.delAct, addCheck = window.addCheck;`, ctx);
  return { ctx, log, el, W: ctx.window };
}

test('rozpočet: uloží se bez překreslení okna (klepnutí na ✕ nebo do Poznámek projde), přepíše se jen „Na osobu“', () => {
  const t = { name: 'Lisabon', pax: '2', budget: '', days: {}, checklist: [] };
  const { log, el, W } = tripWindow([t]);
  W.setBudget(0, '50000');
  assert.equal(t.budget, '50000');
  assert.equal(log.opened, 0, 'okno se nepřekreslí');
  assert.equal(log.saved, 1);
  assert.equal(log.changed, 1, 'karta v Mých cestách pod oknem ano');
  assert.match(el('tripPerPax').innerHTML, /Na osobu: <b[^>]*>25[\s ]000 Kč<\/b>/);
  W.setBudget(0, '');
  assert.equal(el('tripPerPax').innerHTML, '', 'bez rozpočtu bez řádku');
  // okno ukazuje řádek z téže funkce (a v obsluze rozpočtu už žádné překreslení)
  assert.match(APP, /<div id="tripPerPax">\$\{perPaxHtml\(t\)\}<\/div>/);
  assert.doesNotMatch(grab('window.setBudget = ', 'window.setNotes = '), /reTrip|openTrip/);
});

test('aktivita a položka Sbaleno Enterem: fokus zpět do překresleného pole, další text se neztratí', () => {
  const t = { name: 'Lisabon', days: { '2026-12-28': [] }, checklist: [] };
  const { log, el, W } = tripWindow([t]);
  el('act-0-2026-12-28').value = 'Oceánárium';
  W.addAct(0, '2026-12-28');
  assert.equal(log.opened, 1);
  assert.deepEqual(log.focus, ['act-0-2026-12-28'], 'fokus v novém poli téhož dne');
  el('act-0-2026-12-28').value = 'Pastéis de Belém';
  W.addAct(0, '2026-12-28');
  assert.deepEqual(t.days['2026-12-28'], ['Oceánárium', 'Pastéis de Belém']);
  el('newCheck-0').value = 'Kniha';
  W.addCheck(0);
  assert.equal(log.focus.at(-1), 'newCheck-0');
  assert.deepEqual(plain(t.checklist), [{ t: 'Kniha', done: false }]);
});

test('smazání aktivity ✕: hned, „↩ Vrátit“ ji vrátí na stejné místo – i když se mezitím změnilo pořadí cest', () => {
  const t = { name: 'Lisabon', days: { d: ['Alfama', 'Belém', 'Bairro Alto'] }, checklist: [] };
  const { ctx, log, W } = tripWindow([t]);
  W.delAct(0, 'd', 1);
  assert.deepEqual(t.days.d, ['Alfama', 'Bairro Alto']);
  const [msg, , ms, act] = log.toasts.at(-1);
  assert.equal(msg, 'Aktivita smazána');
  assert.equal(ms, 6000);
  assert.equal(act.label, '↩ Vrátit');
  ctx.S.trips.unshift({ name: 'Jiná', days: {}, checklist: [] }); // cesta navíc před ní
  const opened = log.opened;
  act.run();
  assert.deepEqual(t.days.d, ['Alfama', 'Belém', 'Bairro Alto']);
  assert.equal(log.opened, opened + 1, 'otevřené okno se překreslí');
  // zavřené okno se znovu neotevře, jen uloží; smazaná cesta → nic
  W.delAct(1, 'd', 0); ctx.__show = false;
  const o2 = log.opened, s2 = log.saved;
  log.toasts.at(-1)[3].run();
  assert.deepEqual(t.days.d, ['Alfama', 'Belém', 'Bairro Alto']);
  assert.equal(log.opened, o2);
  assert.equal(log.saved, s2 + 1);
  W.delAct(1, 'd', 0); ctx.S.trips.splice(1, 1);
  log.toasts.at(-1)[3].run();
  assert.deepEqual(t.days.d, ['Belém', 'Bairro Alto']);
});

test('poškozená uložená cesta (null v Sbaleno, bez days, start číslem): opraví se při načtení, zdravá data zůstanou', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`${grab('function fixState(s)', '// Ceny letů jsou od pv 2')}\nthis.fixState = fixState;`, ctx);
  const fix = (s) => plain(ctx.fixState(s));
  assert.deepEqual(fix({ trips: [{ name: 'Řím', checklist: [null, { t: 'Pas' }, 'x', { t: 5 }], start: 123 }] }).trips,
    [{ name: 'Řím', checklist: [{ t: 'Pas' }], start: '', days: {} }]);
  assert.deepEqual(fix({ trips: [{ name: 7, days: [], dest: {}, end: null }] }).trips, [{ name: '', days: {}, dest: '', end: null, checklist: [] }]);
  assert.deepEqual(fix({ trips: [{ days: { a: ['Alfama'], b: 'x', c: null }, checklist: { t: 'x' } }] }).trips, [{ days: { a: ['Alfama'] }, checklist: [] }]);
  const ok = { name: 'Lisabon', dest: 'Lisabon', start: '2027-01-04', end: '2027-01-08', days: { '2027-01-04': ['Alfama'] }, checklist: [{ t: 'Pas', done: true, id: 'pack:doc-op' }], budget: '20000' };
  assert.deepEqual(fix({ trips: [plain(ok)] }).trips, [ok], 'zdravá cesta beze změny');
});

test('kalendář z Mých cest: soubor „letsi-….ics“, bez názvu „letsi.ics“ (UID událostí zůstávají – nový export je přepíše)', () => {
  assert.match(APP, /icsDownload\('letsi-' \+ t\.name/);
  assert.doesNotMatch(APP, /icsDownload\('atlas-/);
  const got = [];
  const a = { click() { got.push(a.download); }, remove() {} };
  const ctx = vm.createContext({ window: {}, Blob, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, setTimeout: () => 0,
    document: { createElement: () => a, body: { appendChild() {} } } });
  vm.runInContext(read('public/js/ics.js'), ctx);
  const ev = [{ title: 'Cesta', start: '2027-01-04' }];
  ctx.window.Ics.download('', ev);
  ctx.window.Ics.download('letsi-Lisabon 4. 1.', ev);
  assert.deepEqual(got, ['letsi.ics', 'letsi-Lisabon-4.-1.ics']);
});

/* ---------- Shrnutí průvodce → Sbaleno v Mých cestách ---------- */
const PT = JSON.parse(read('public/data/pretrip.json'));
const ENTRY = JSON.parse(read('data/entry.json'));
const COUNTRIES = JSON.parse(read('data/countries.json'));
/** Průvodce jako v prohlížeči (helpery z app.js, vstupní podmínky, pretrip.js, trip.js); časovač autoSoon ručně. */
function wizard() {
  const timers = [];
  const on = {};
  const ctx = { window: { addEventListener() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, URL, Intl, CompressionStream, DecompressionStream,
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, document: { getElementById: () => null, querySelector: () => null, addEventListener: (k, fn) => { on[k] = fn; } }, location: { origin: 'https://letsi.example', pathname: '/', hash: '' } };
  vm.createContext(ctx);
  for (const f of ['ics', 'sharelink']) vm.runInContext(read(`public/js/${f}.js`), ctx, { filename: `${f}.js` });
  const helpers = APP.match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`var ShareLink = window.ShareLink; const Ics = window.Ics;\n${helpers.join('\n')}
    var byIso = {}; var S = { trips: [] }; var flag = (iso) => '[' + iso + ']'; var PACK = ['Pas / OP'];
    var __els = {}; var $ = (s) => (__els[s] ||= { innerHTML: '', value: '' }); var $$ = () => []; var go = () => {}; var toast = () => {}; var save = () => {};`, ctx);
  for (const c of COUNTRIES) vm.runInContext(`byIso[${JSON.stringify(c.iso2)}] = ${JSON.stringify(c)};`, ctx);
  vm.runInContext(read('public/js/entry.js'), ctx, { filename: 'entry.js' });
  vm.runInContext('var Entry = window.Entry;', ctx);
  ctx.window.Entry.set(plain(ENTRY));
  vm.runInContext(read('public/js/pretrip.js'), ctx, { filename: 'pretrip.js' });
  vm.runInContext('var PreTrip = window.PreTrip;', ctx);
  vm.runInContext(read('public/js/trip.js'), ctx, { filename: 'trip.js' });
  vm.runInContext('var Trip = window.Trip;', ctx);
  ctx.window.PreTrip.set(plain(PT));
  return { c: ctx, P: ctx.window.PreTrip, Trip: ctx.window.Trip, timers, on };
}
const leg = (from, to, date) => ({ from, to, date, dep: `${date}T10:00:00`, arr: `${date}T14:00:00`, hasTime: true, provider: 'demo-air', carrierName: 'Demo Air' });

test('Shrnutí → Sbaleno: vlastní položka a věci k moři se do uložené cesty propíšou samy (autoSoon), odškrtnutí zůstanou', () => {
  const { c, P, Trip, timers, on } = wizard();
  const t = { v: 1, created: 1767225600000, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', ground: {}, stay: null, car: null, plan: null,
    flight: { out: leg('PRG', 'LIS', '2027-07-10'), back: leg('LIS', 'PRG', '2027-07-17'), flightCzk: 5000 }, dest: { label: 'Lisabon', cc: 'PT', lat: 38.72, lon: -9.14 } };
  c.S.trip = t;
  Trip.saveToPlanner({ quiet: true });
  const saved = () => c.S.trips.find((x) => x.tripId === t.created);
  const pass = saved().checklist.find((x) => x.id === 'pack:doc-op');
  assert.ok(pass, JSON.stringify(saved().checklist.slice(0, 4)));
  pass.done = true; P.fromPlanner(saved(), pass); // odškrtnuto v Mých cestách (app.js toggleCheck)
  timers.length = 0;
  assert.equal(P.addCustom(t, 'Kniha na pláž'), '');
  assert.equal(timers.length, 1, 'uložení do Mých cest naplánované');
  P.html(t, { isos: ['PT'], climate: [] }); // karta ve Shrnutí
  on.click({ target: { closest: (q) => (q === '#preTrip [data-pt-act]' ? { dataset: { ptAct: 'beach' } } : null) } }); // čip „Pláž a moře“
  assert.equal(timers.length, 2);
  timers.at(-1)(); // autoSave (při ‹ Moje cesty a zavření aplikace se dokončí hned)
  const ck = saved().checklist;
  assert.ok(ck.some((x) => x.t === 'Kniha na pláž'), 'vlastní položka');
  assert.ok(ck.some((x) => x.id === 'pack:ac-swim' && x.t === 'Plavky'), 'věci k moři');
  assert.equal(ck.find((x) => x.id === 'pack:doc-op').done, true, 'odškrtnutí zůstalo');
  assert.equal(c.S.trips.length, 1, 'tatáž cesta, bez kopie');
});
