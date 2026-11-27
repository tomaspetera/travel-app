// Předstartovní kontrola průvodce cestou (public/js/trip.js, public/js/pretrip.js): uložené „Sbaleno“ (věci podle
// počasí i s odškrtnutím) přežije přechod na jinou cestu, dokud se podnebí načítá nebo když se nenačte; tlačítko
// „Uloženo v Mých cestách“ jen u cesty uložené na přání; po kroku průvodce fokus na nadpis kroku, ne na začátek stránky.
// Klasické skripty přes node:vm jako v pretrip.test.js a trip-changes.test.js (zástupný DOM, fetch podle testu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tick = () => new Promise((r) => setTimeout(r, 0));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }; // termín vždy dopředu
const memStorage = () => { const mem = new Map(); return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }; };

/** Průvodce s kartou „Před cestou“ (pretrip.js + trip.js); fetch = api/climate podle testu. */
function load({ storage, fetch }) {
  const ctx = { window: { scrollTo() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, URL, Intl, setTimeout, clearTimeout, localStorage: storage, fetch };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/ics.js'), ctx, { filename: 'ics.js' });
  const helpers = read('public/js/app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var byIso = {}; var S = { trips: [] }; var flag = (iso) => '[' + iso + ']'; var PACK = ['Pas / OP'];
    var __els = {}; var $ = (s) => (__els[s] ||= { innerHTML: '', value: '' }); var $$ = () => [];
    var go = () => {}; var toast = () => {}; var save = () => {};`, ctx, { filename: 'app-helpers.js' });
  for (const c of JSON.parse(read('data/countries.json'))) vm.runInContext(`byIso[${JSON.stringify(c.iso2)}] = ${JSON.stringify(c)};`, ctx);
  vm.runInContext(read('public/js/entry.js'), ctx, { filename: 'entry.js' });
  vm.runInContext('var Entry = window.Entry;', ctx);
  ctx.window.Entry.set(JSON.parse(read('data/entry.json')));
  vm.runInContext(read('public/js/pretrip.js'), ctx, { filename: 'pretrip.js' });
  vm.runInContext('var PreTrip = window.PreTrip;', ctx);
  vm.runInContext(read('public/js/trip.js'), ctx, { filename: 'trip.js' });
  ctx.window.PreTrip.set(JSON.parse(read('public/data/pretrip.json')));
  return ctx;
}
const leg = (from, to, date) => ({ from, to, date, dep: `${date}T10:00:00`, arr: `${date}T12:00:00`, hasTime: true, carrierName: 'Demo Air', provider: 'demo-air' });
/** Lisabon na 5 nocí – uložená cesta z hlášení kontroly. */
const lisbon = () => ({
  v: 1, created: 1767225600000, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', ground: {}, verifiedAt: 1,
  flight: { out: leg('PRG', 'LIS', day(60)), back: leg('LIS', 'PRG', day(65)), flightCzk: 5000, groundCzk: 0, bagCzk: 0 },
  dest: { label: 'Lisabon', country: 'Portugalsko', cc: 'PT', lat: 38.72, lon: -9.14 }, stay: null, car: null, plan: null,
});
// api/climate: stejné podnebí celý rok (přes den 15 °C, ráno 9 °C) → „Dlouhé kalhoty…“ a „Mikina nebo svetr…“
const CLIM = { hi: Array(12).fill(15), lo: Array(12).fill(9), p: Array(12).fill(40) };
const ok = () => Promise.resolve({ ok: true, status: 200, json: async () => CLIM });

test('pruvodce-2: „Sbaleno“ uložené cesty s věcmi podle počasí a odškrtnutím přežije uložení, dokud se podnebí načítá', async () => {
  const storage = memStorage();
  // 1) cesta otevřená v průvodci, podnebí načtené: uloží se seznam na míru a člověk odškrtne mikinu
  const a = load({ storage, fetch: ok });
  const t = lisbon();
  a.S.trip = t;
  assert.equal(a.window.PreTrip.plannerChecklist(t), null, 'podnebí se teprve načítá → žádný seznam');
  await tick(); await tick();
  a.window.Trip.saveToPlanner({ quiet: true });
  const layer = a.S.trips[0].checklist.find((x) => x.id === 'pack:cl-layer');
  assert.ok(layer && /^Mikina nebo svetr/.test(layer.t), JSON.stringify(a.S.trips[0].checklist.map((x) => x.id)));
  assert.ok(a.S.trips[0].checklist.some((x) => x.id === 'pack:cl-long'));
  a.window.PreTrip.setDone(a.window.PreTrip.tripKey(t), 'pack:cl-layer', true);
  a.window.Trip.saveToPlanner({ quiet: true });
  const saved = plain(a.S.trips[0]);
  assert.equal(saved.checklist.find((x) => x.id === 'pack:cl-layer').done, true);

  // 2) obnovená stránka, podnebí se ještě načítá; průvodce cestu uloží (přechod na jinou cestu → autoSave)
  let answer;
  const b = load({ storage, fetch: () => new Promise((r) => { answer = r; }) });
  b.S.trips = plain([saved]);
  b.S.trip = plain(t);
  assert.equal(b.window.PreTrip.plannerChecklist(b.S.trip), null);
  b.window.Trip.saveToPlanner({ quiet: true });
  assert.deepEqual(plain(b.S.trips[0].checklist), saved.checklist, 'seznam i odškrtnutí beze změny');
  assert.deepEqual(plain(b.S.trips[0].genChecklist), saved.genChecklist);
  assert.ok(!b.S.trips[0].checklist.some((x) => /načítám/.test(x.t)));
  // po načtení podnebí se seznam zase obnoví z průvodce – odškrtnutí zůstane
  answer({ ok: true, status: 200, json: async () => CLIM });
  await tick(); await tick();
  b.window.Trip.saveToPlanner({ quiet: true });
  assert.equal(b.S.trips[0].checklist.find((x) => x.id === 'pack:cl-layer').done, true);
});

test('pruvodce-2: podnebí se nenačte (síť, server) → uložený seznam zůstane; místo bez údajů (404, 400) seznam bez počasí dostane', async () => {
  const storage = memStorage();
  const a = load({ storage, fetch: ok });
  const t = lisbon();
  a.S.trip = t;
  a.window.PreTrip.plannerChecklist(t);
  await tick(); await tick();
  a.window.PreTrip.setDone(a.window.PreTrip.tripKey(t), 'pack:cl-layer', true);
  a.window.Trip.saveToPlanner({ quiet: true });
  const saved = plain(a.S.trips[0]);
  for (const [what, fetch] of [['bez sítě', () => Promise.reject(new TypeError('Failed to fetch'))], ['chyba serveru', () => Promise.resolve({ ok: false, status: 503, json: async () => ({}) })], ['moc dotazů', () => Promise.resolve({ ok: false, status: 429, json: async () => ({}) })]]) {
    const b = load({ storage, fetch });
    b.S.trips = plain([saved]);
    b.S.trip = plain(t);
    b.window.PreTrip.plannerChecklist(b.S.trip);
    await tick(); await tick();
    assert.equal(b.window.PreTrip.plannerChecklist(b.S.trip), null, what);
    b.window.Trip.saveToPlanner({ quiet: true });
    assert.deepEqual(plain(b.S.trips[0].checklist), saved.checklist, what);
  }
  // 404: pro místo nejsou údaje, 400: neznámé letiště – to není výpadek, seznam (bez věcí podle počasí) se sestaví jako
  // dřív (400 se nezmění ani po obnovení stránky – jinak by nová cesta měla napořád jen obecný seznam)
  for (const status of [404, 400]) {
    const c = load({ storage, fetch: () => Promise.resolve({ ok: false, status, json: async () => ({}) }) });
    c.window.PreTrip.plannerChecklist(t);
    await tick(); await tick();
    const list = plain(c.window.PreTrip.plannerChecklist(t));
    assert.ok(Array.isArray(list) && list.some((x) => x.id === 'pack:cl-weather') && !list.some((x) => x.id === 'pack:cl-layer'), String(status));
  }
});

/* ---------- jen trip.js (zástupný DOM jako v trip-changes.test.js) ---------- */
function loadTrip() {
  const ctx = { window: { scrollTo() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/ics.js'), ctx, { filename: 'ics.js' });
  const helpers = read('public/js/app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = { trips: [] }, __els = {}, __all = {}, __confirms = [], __said = [], __focus = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {}, scrollIntoView() {} });
    var $$ = (s) => __all[s] || [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']'; var toast = () => {};
    var confirm = (m) => { __confirms.push(m); return false; }; var say = (m) => { __said.push(m); };
    var byIso = { PT: { cs: 'Portugalsko' } }; var PACK = ['Pas'];`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(read('public/js/trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const sumSave = (c) => { c.window.Trip.render(); return (/id="sumSave">(.*?)<\/button>/.exec(c.__els['#tripStep'].innerHTML) || [])[1]; };

test('pruvodce-5 / U16: Shrnutí „Hotovo – zpět na Moje cesty“ (cesta se ukládá sama), sdílená „💾 Uložit do Mých cest“', () => {
  const c = loadTrip();
  c.S.trip = { ...lisbon(), stay: { mode: 'pick', id: 'h1', name: 'Hotel', totalCzk: 4000 } };
  assert.equal(sumSave(c), 'Hotovo – zpět na Moje cesty');
  c.window.Trip.saveToPlanner({ quiet: true }); // samo uložení průvodce
  assert.equal(c.S.trips[0].auto, true);
  assert.equal(sumSave(c), 'Hotovo – zpět na Moje cesty');
  c.S.trip.shared = { on: '2026-10-01' };
  assert.equal(sumSave(c), 'Uložit do Mých cest', 'sdílená (cizí) v Mých cestách není');
});

test('pruvodce-5: ↺ Začít znovu nejmenuje „auto“, když člověk zvolil „bez auta“', () => {
  const c = loadTrip();
  c.S.trip = { ...lisbon(), stay: { mode: 'pick', id: 'h1', name: 'Hotel', totalCzk: 4000 }, car: { mode: 'skip' } };
  c.window.Trip.render();
  c.__els['#tripRestart'].onclick();
  assert.match(c.__confirms.at(-1), /^Zahodit rozpracovanou cestu Lisabon \(ubytování\) a začít znovu\?/);
  c.S.trip.car = { mode: 'manual', totalCzk: 2000 };
  c.__els['#tripRestart'].onclick();
  assert.match(c.__confirms.at(-1), /\(ubytování, auto\)/);
});

test('pristupnost-1: po kroku fokus na nadpis nového kroku (tabIndex -1, bez posunu) a čtečce název; lišta s aria-current', () => {
  const c = loadTrip();
  const h3 = { focus(o) { c.__focus.push(o); } };
  c.__els['#tripStep h3'] = h3;
  c.S.trip = { ...lisbon(), step: 'stay' };
  const btn = { dataset: { step: 'car' } };
  c.__all['.stepbar [data-step]'] = [btn];
  c.window.Trip.render();
  const bar = c.__els['#tripRoot'].innerHTML;
  assert.match(bar, /data-step="stay" title="Ubytování" aria-current="step"/);
  assert.equal((bar.match(/aria-current=/g) || []).length, 1, 'jen aktivní krok');
  btn.onclick(); // lišta kroků (setStep)
  assert.deepEqual([c.S.trip.step, h3.tabIndex, plain(c.__focus), plain(c.__said)], ['car', -1, [{ preventScroll: true }], ['Krok: Auto']]);
  assert.equal(c.window.Trip.stepTo('program'), true); // Zpět telefonu (stepTo)
  assert.deepEqual([plain(c.__focus).length, c.__said.at(-1)], [2, 'Krok: Program']);
  assert.match(c.__els['#tripRoot'].innerHTML, /data-step="program" title="Program" aria-current="step"/);
});

test('pristupnost-1: „Vybrat“ u hotelu má v názvu pro čtečku i jméno hotelu (16 stejných „Vybrat“ se nedalo rozlišit)', () => {
  const src = read('public/js/trip.js');
  const btn = /<button class="btn sm [^\n]*data-pick="\$\{i\}"[^\n]*/.exec(src)[0];
  // viditelný text je začátkem názvu (WCAG 2.5.3): Vybráno / Vybrat i tak / Vybrat
  assert.ok(btn.includes(`aria-label="\${chosen ? 'Vybráno' : h.soldOut ? 'Vybrat i tak' : 'Vybrat'}: \${esc(h.name)}"`), btn);
  // výběr hotelu vede přes setStep (jedno místo) nebo na další místo trasy – v obou případech fokus na nadpis kroku
  assert.match(src, /staySlot = \{[^\n]*next: \(\) => setStep\('car'\) \}/);
  assert.match(src, /goStayBase\(any\); focusStep\(\);/);
});
