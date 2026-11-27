// Termín cesty jde změnit (U10): ✏️ Upravit u cesty s vlastním letem posune let, program i název (trip.js retimeSaved),
// u letu z výsledků „Změnit let“ a „↩ Jiný let“ otevřou Lety s cílem a daty cesty (app.js tripFlights).
// Zástupný DOM jako v mam-letenku.test.js: $ vrací stálé objekty podle selektoru, kliknutí = zavolání onclick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const APP = src('app.js');
const fnOf = (name) => APP.match(new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'm'))[0];
function load() {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  vm.runInContext(src('searchhelp.js'), ctx, { filename: 'searchhelp.js' });
  const helpers = APP.match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk|okYmd) = .*$/gm);
  assert.equal(helpers.length, 7);
  vm.runInContext(`const Ics = window.Ics, SearchHelp = window.SearchHelp;\n${helpers.join('\n')}\n${fnOf('shiftDays')}
    var S = {}, __els = {}, __toasts = [], __go = [], __search = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = () => [];
    var go = (v) => { __go.push(v); }; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var toast = (msg) => { __toasts.push(msg); }; var byIso = { PT: { cs: 'Portugalsko' } }; var PACK = ['Pas']; var enc = encodeURIComponent;
    var tripFlights = (t) => { __search.push(JSON.parse(JSON.stringify({ to: t.wizard.flight.out.to, iso: t.iso, start: t.start, end: t.end }))); };
    window.scrollTo = () => {};`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const LIS = { id: 'geo:38.72,-9.14|Lisabon', type: 'city', label: 'Lisabon', cc: 'PT', lat: 38.72, lon: -9.14, sub: 'letiště v okolí: LIS' };

test('fitPlan: program na kratší termín – dny za koncem k poslednímu dni, delší termín nic nemaže, přes konec měsíce', () => {
  const { fitPlan } = load().window.Trip;
  const p = { days: [{ date: '2027-03-29', items: [{ name: 'a' }] }, { date: '2027-03-31', items: [{ name: 'b' }] }, { date: '2027-04-02', items: [{ name: 'c' }] }], prefs: { pace: 'normal' } };
  const w = (start, end) => ({ start, end, arrivalTime: '', departureTime: null });
  // zkrácení přes konec měsíce: 2. 4. → 31. 3. (k poslednímu dni), nic nezmizí
  const k = plain(fitPlan(p, w('2027-03-29', '2027-03-31')));
  assert.deepEqual(k.days.map((d) => [d.date, d.items.map((x) => x.name)]), [['2027-03-29', ['a']], ['2027-03-31', ['b', 'c']]]);
  // span podle nového termínu (prázdný čas = null – tak ho ukládá krok Program, tripPlan ho pak uzná)
  assert.deepEqual(k.span, { start: '2027-03-29', end: '2027-03-31', arrivalTime: null, departureTime: null });
  assert.deepEqual(k.prefs, { pace: 'normal' }, 'volby programu zůstanou');
  // prodloužení: dny beze změny
  assert.deepEqual(plain(fitPlan(p, w('2027-03-29', '2027-04-05'))).days, plain(p.days));
  // původní program se nemění
  assert.equal(p.days.length, 3);
});

test('retimeSaved: cesta s vlastním letem na nový termín – let, program, vlastní aktivity, název s datem a cestující', () => {
  const c = load(), T = c.window.Trip;
  T.start({ ...T.ownFlightTrip({ dest: LIS, out: '2027-03-27', back: '2027-04-01', adults: 2 }), step: 'route' });
  const t = c.S.trip;
  // program jednoho místa (jak ho uloží krok Program) a hotel z nabídek
  const sp = T.progSpan(t);
  t.plan = { days: ['2027-03-27', '2027-03-28', '2027-03-30', '2027-04-01'].map((date, i) => ({ date, items: [{ id: 'p' + i, name: 'Místo ' + i }] })), span: { start: sp.start, end: sp.end, arrivalTime: sp.arrivalTime || null, departureTime: sp.departureTime || null } };
  t.stay = { mode: 'pick', id: 'h1', name: 'Hotel', totalCzk: 9000, url: 'https://www.booking.com/hotel?checkin=2027-03-27' };
  t.booked = { stay: true };
  c.S.trips = [];
  T.saveToPlanner({ quiet: true });
  const e = c.S.trips[0];
  assert.equal(e.name, 'Lisabon 27.3.');
  assert.deepEqual(plain(e.days['2027-03-28']), ['Místo 1']);
  e.days['2027-03-30'].push('Večeře u Rity'); // vlastní aktivita z plánovače
  c.S.trip = null; // cesta jen v Mých cestách (průvodce zavřený)
  // o 14 dní později a o 2 dny kratší (27. 3.–1. 4. → 10.–13. 4.), 3 cestující
  const msg = c.window.Trip.retimeSaved(e, { start: '2027-04-10', end: '2027-04-13', adults: '3' });
  assert.equal(msg, 'hotel vyber v průvodci znovu');
  assert.equal(c.S.trip, null, 'zavřený průvodce zůstane zavřený');
  const n = c.S.trips[0];
  assert.equal(c.S.trips.length, 1, 'bez kopie');
  assert.equal(n.start, '2027-04-10');
  assert.equal(n.end, '2027-04-13');
  assert.equal(n.pax, '3');
  assert.equal(n.name, 'Lisabon 10.4.', 'název s datem podle nového odjezdu');
  assert.match(n.flight, /10\.4\..*zpět .*13\.4\./);
  assert.equal(n.wizard.flight.out.date, '2027-04-10');
  assert.equal(n.wizard.flight.back.date, '2027-04-13');
  assert.equal(n.wizard.adults, 3);
  assert.equal(n.wizard.stay, null, 'hotel z nabídek platil pro původní dny');
  assert.equal(n.wizard.booked.stay, undefined);
  // program: posun o 14 dní, poslední den (původně 1. 4. → 15. 4.) přidaný k 13. 4.; vlastní aktivita s ním
  assert.deepEqual(plain(n.days), { '2027-04-10': ['Místo 0'], '2027-04-11': ['Místo 1'], '2027-04-13': ['Místo 2', 'Místo 3', 'Večeře u Rity'] });
  // další uložení z průvodce (otevřít a uložit) nic nezdvojí ani neztratí
  T.openSaved(n.wizard, n.tripId);
  T.saveToPlanner({ quiet: true });
  assert.deepEqual(plain(c.S.trips[0].days), plain(n.days));
});

test('retimeSaved: jen posun (stejná délka) nechá program platný; cesta otevřená v průvodci se upraví i tam', () => {
  const c = load(), T = c.window.Trip;
  T.start({ ...T.ownFlightTrip({ dest: LIS, out: '2027-01-30', back: '2027-02-02', adults: 1 }), step: 'route' });
  const t = c.S.trip, sp = T.progSpan(t);
  t.plan = { days: [{ date: '2027-01-31', items: [{ id: 'x', name: 'Belém' }] }], span: { start: sp.start, end: sp.end, arrivalTime: sp.arrivalTime || null, departureTime: null } };
  c.S.trips = [];
  T.saveToPlanner({ quiet: true });
  assert.equal(T.retimeSaved(c.S.trips[0], { start: '2027-02-27', end: '2027-03-02', adults: '1' }), '');
  assert.equal(c.S.trip.flight.out.date, '2027-02-27', 'otevřená cesta v průvodci má nový termín');
  assert.deepEqual(plain(c.S.trip.plan.days.map((d) => d.date)), ['2027-02-28']);
  assert.deepEqual(plain(c.S.trips[0].days), { '2027-02-28': ['Belém'] });
  // bez návratu: let jen tam
  T.retimeSaved(c.S.trips[0], { start: '2027-02-27', end: '', adults: '1' });
  assert.equal(c.S.trip.flight.back, null);
  // let jen tam: návrat je konec pobytu – zpáteční let se nepřidá, změní se počet nocí
  T.retimeSaved(c.S.trips[0], { start: '2027-03-01', end: '2027-03-06', adults: '1' });
  assert.equal(c.S.trip.flight.back, null);
  assert.equal(c.S.trip.nightsOneWay, 5);
  assert.equal(c.S.trips[0].end, '2027-03-06');
  // let vybraný z výsledků se tudy měnit nedá
  assert.equal(T.retimeSaved({ ...c.S.trips[0], wizard: { ...c.S.trips[0].wizard, flight: { ...c.S.trips[0].wizard.flight, own: false } } }, { start: '2027-05-01', end: '', adults: '1' }), null);
});

test('↩ Jiný let: bez výsledků do téhož cíle otevře Lety s cílem a daty cesty (dřív prázdné hledání)', () => {
  const c = load(), T = c.window.Trip;
  T.start(T.ownFlightTrip({ dest: LIS, out: '2027-03-27', back: '2027-04-01' }));
  c.S.trip.step = 'flight';
  T.render();
  c.__els['#tfBack'].onclick();
  assert.deepEqual(plain(c.__search), [{ to: 'LIS', iso: 'PT', start: '2027-03-27', end: '2027-04-01' }]);
  // výsledky hledání do téhož cíle na obrazovce: zpět k nim (výpis i s posunem), bez nového hledání
  c.__els['#results'] = { firstElementChild: {} };
  c.S.form = { to: [{ id: 'ap:LIS' }] };
  c.__els['#tfBack'].onclick();
  assert.equal(c.__search.length, 1);
  assert.deepEqual(plain(c.__go.slice(-1)), ['flights']);
  // výsledky jiného cíle: hledat do cíle cesty
  c.S.form = { to: [{ id: 'ap:BCN' }] };
  c.__els['#tfBack'].onclick();
  assert.equal(c.__search.length, 2);
});

test('tripFlights: cesta z průvodce s cílem městem hledá na letiště letu, s termínem cesty', () => {
  const calls = [];
  const ctx = { window: {}, S: {}, byIso: { PT: { cs: 'Portugalsko' } }, flag: (cc) => `[${cc}]`, go: (v) => calls.push(['go', v]) };
  ctx.window.Flights = ctx.Flights = { searchTo: (to, o) => calls.push(['to', to, o]), searchLegs: (l) => calls.push(['legs', l.length]) };
  vm.createContext(ctx);
  vm.runInContext(APP.match(/^window\.tripFlights = t => \{[\s\S]*?\n\};/m)[0], ctx);
  const own = { wizard: { flight: { own: true, out: { from: '', to: 'LIS', date: '2027-03-27' } }, dest: { id: 'geo:38.72,-9.14|Lisabon', label: 'Lisabon', cc: 'PT' } }, iso: 'PT', start: '2027-03-27', end: '2027-04-01' };
  ctx.window.tripFlights(own);
  assert.deepEqual(plain(calls.pop()), ['to', [{ id: 'ap:LIS', label: 'Lisabon', flag: '[PT]' }], { xOut: '2027-03-27', xBack: '2027-04-01' }]);
  // vlastní cesta z Objevuj bez letiště: země jako dřív
  ctx.window.tripFlights({ iso: 'PT', start: '2027-05-01', end: '' });
  assert.deepEqual(plain(calls.pop()), ['to', [{ id: 'cc:PT', label: 'Portugalsko', flag: '[PT]' }], { xOut: '2027-05-01', xBack: '' }]);
  assert.match(APP, /^window\.planSearch = i => tripFlights\(S\.trips\[i\]\);$/m);
});

test('✏️ Upravit: vlastní let mění termín („Upravit název a termín“), let z výsledků jen ke čtení se „Změnit let“', () => {
  const m = APP.match(/^const ownWiz = .*$/m)[0], l = APP.match(/^const tripEditLbl = .*$/m)[0];
  const tripEditLbl = new Function(`${m}\n${l}; return tripEditLbl;`)();
  assert.equal(tripEditLbl({ wizard: { flight: { out: {} } } }), 'Upravit název');
  assert.equal(tripEditLbl({ wizard: { flight: { own: true, out: {} } } }), 'Upravit název a termín');
  assert.equal(tripEditLbl({ name: 'Řím' }), 'Upravit název a termín');
  const ed = fnOf('editTrip');
  assert.match(ed, /const own = ownWiz\(t\), fixed = Boolean\(t\.wizard\) && !own;/);
  assert.match(ed, /id="etFlight"[^>]*>\$\{ikona\('let'\)\} Změnit let<\/button>/);
  assert.match(ed, /\$\('#etFlight'\); if \(ef\) ef\.onclick = \(\) => \{ modalClose\(\); tripFlights\(t\); \};/);
  assert.match(ed, /Trip\.retimeSaved\(t, \{ start, end, adults: pax \}\)/);
});
