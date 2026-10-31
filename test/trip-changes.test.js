// Průvodce cestou po změnách: vlak/bus místo letu ve stejné dny (program a auto podle starých časů), vlak jen tam,
// trasa zapnutá po změně termínu (i hotel jednoho místa při zapnuté trase), nové hledání pro jiný počet lidí, auto (délka
// pronájmu, úpravy bez „Uložit“ i s odkazem na srovnávač, noci cesty jen tam), dny cesty bez programu a cesta z letiště
// u trasy vlakem. Kroky se vykreslí do zástupného DOM ($ vrací stálé objekty podle selektoru, $$ seznam z __all, kliknutí
// = zavolání onclick); public/js/trip.js přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
// extra: další globály (časovače pro samoukládání do Mých cest)
function load(extra = {}) {
  const ctx = { window: { scrollTo() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, ...extra };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = { trips: [] }, __els = {}, __all = {}, __toasts = [], __confirms = [], __go = [], __ok = false;
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {}, scrollIntoView() {} });
    var $$ = (s) => __all[s] || [];
    var go = (v) => { __go.push(v); }; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var confirm = (m) => { __confirms.push(m); return __ok; };
    var toast = (msg) => { __toasts.push(msg); };
    var byIso = { AT: { cs: 'Rakousko' } }; var PACK = ['Pas'];`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const tick = () => new Promise((r) => setImmediate(r));
function render(c, t) {
  c.S.trip = t;
  c.__toasts.length = 0;
  c.window.Trip.render();
  return sp(c.__els['#tripStep'].innerHTML);
}
// řádky „Průběh cesty“ ve shrnutí: „st 4. 11. 🚗 Vrácení auta VIE 08:10“
const rows = (h) => [...h.matchAll(/<div class="tl-row"><span class="tl-d">([^<]*)<\/span><span class="tl-i">([^<]*)<\/span><span>(.*?)<\/span><\/div>/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);

const leg = (from, to, date, dep, arr, fromTz, toTz) => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: 'https://air.example/book',
});
const PRAHA = { label: 'Praha', cc: 'CZ', lat: 50.08, lon: 14.43, tz: 'Europe/Prague' };
const VIDEN = { label: 'Vídeň', cc: 'AT', lat: 48.185, lon: 16.376, tz: 'Europe/Vienna' };
const Q = { from: 'geo:50.0755,14.4378|Praha', to: 'ap:VIE' };
const train = (date, dep, arr) => ({ source: 'regiojet', id: `rj${date.slice(8)}${dep.slice(0, 2)}`, date, dep: `${date}T${dep}`, arr: `${date}T${arr}`, min: 234, czk: 299, kinds: ['TRAIN'], transfers: 0, fromStation: 'hl.n.', toStation: 'Wien Hbf' });
const OV = (over = {}) => ({ on: true, q: Q, km: 254, est: { minutes: 234, czk: 299, basis: 'measured' }, from: PRAHA, to: VIDEN, out: train('2026-11-04', '06:01', '09:55'), back: train('2026-11-11', '06:01', '09:55'), links: { out: [], back: [] }, ...over });
const day = (date, cap, names = []) => ({ date, cap, kind: cap ? 'city' : 'travel', items: names.map((name, i) => ({ id: `${name}${i}`, name, lat: 48.2, lon: 16.37, category: 'sight', visitMin: 60 })) });
// Let PRG 20:00 → VIE 20:56, zpět VIE 10:10 (jako v DEMO); hotel, auto s cenou a program pro časy letu.
function vie(over = {}) {
  return {
    v: 1, created: 1791698510368, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'flight', verifiedAt: 1, ground: {},
    flight: { out: leg('PRG', 'VIE', '2026-11-04', '20:00', '20:56', 'Europe/Prague', 'Europe/Vienna'), back: leg('VIE', 'PRG', '2026-11-11', '10:10', '11:06', 'Europe/Vienna', 'Europe/Prague'), flightCzk: 1181, groundCzk: 0, bagCzk: 0 },
    dest: { label: 'Vídeň', country: 'Rakousko', cc: 'AT', lat: 48.11, lon: 16.57 }, overland: null,
    groundRef: { q: Q, km: 254, min: 234, czk: 299, basis: 'measured', worth: true, from: 'Praha', to: 'Vídeň' },
    stay: { mode: 'pick', id: 'h1', name: 'Hostel Backpackers Vienna', totalCzk: 1980, url: 'https://hotel.example/h1' },
    car: { mode: 'manual', totalCzk: 2000, pickup: 'VIE', dropoff: 'VIE', from: '2026-11-04T21:41', to: '2026-11-11T08:10', age: 30 },
    plan: { center: { lat: 48.2, lon: 16.37 }, span: { start: '2026-11-04', end: '2026-11-11', arrivalTime: '20:56', departureTime: '10:10' },
      days: [day('2026-11-04', 0), day('2026-11-05', 360, ['Hofburg']), day('2026-11-06', 360), day('2026-11-11', 0)] },
    ...over,
  };
}
/** „🚆 Pojedu vlakem / busem“ → výběr spojů (Ground bez sítě: spoj z odhadu se zadanými časy) → „✓ Pojedu tímhle“. */
async function pickTrain(c, t, times) {
  c.Ground = c.window.Ground = {
    debounce: (f) => f, liveHtml: () => '', linksHtml: () => '', hm: (m) => `${m} min`, priceTxt: (g) => `od ~${g.czk} Kč`,
    load: async ({ from }) => ({ est: { minutes: 234, czk: 299, basis: 'measured' }, km: 254, from: from === Q.from ? PRAHA : VIDEN, to: from === Q.from ? VIDEN : PRAHA, links: [] }),
    legFromEst: (date) => train(date, ...times[date]),
  };
  render(c, t);
  const [out, back = null] = Object.keys(times);
  // pole formuláře, jak je vyplní uživatel (zástupné prvky vzniknou prvním $)
  Object.assign(c.$('#ovOut'), { value: out });
  Object.assign(c.$('#ovBack'), { value: back || '' });
  c.$('#ovRet').checked = Boolean(back);
  for (const s of ['#ovOutList', '#ovBackList']) c.$(s).isConnected = true;
  c.__els['#ovStart'].onclick();
  await tick();
  assert.equal(c.__els['#ovUse'].disabled, false, 'spoje vybrané');
  c.__toasts.length = 0;
  c.__els['#ovUse'].onclick();
}

test('vlak/bus místo letu ve stejné dny: program a auto podle časů letu neplatí – hotel zůstane, shrnutí bez auta a starého programu', async () => {
  const c = load();
  const t = vie();
  await pickTrain(c, t, { '2026-11-04': ['06:01', '09:55'], '2026-11-11': ['06:01', '09:55'] });
  assert.equal(t.overland.on, true);
  assert.equal(t.stay.name, 'Hostel Backpackers Vienna', 'stejné dny → hotel platí');
  assert.equal(t.car, null, 'auto vrácené 2 h po odjezdu vlaku neplatí');
  // program pro časy letu zůstane uložený (krok Program ho přeplánuje se stejnými volbami), jen neplatí – dřív se smazal
  assert.ok(t.plan && t.plan.days.length, 'program zůstane uložený');
  assert.deepEqual(plain(c.__toasts), ['Pojedeš vlakem / busem – let se nepočítá', 'Pojedeš vlakem / busem – let se nepočítá. Jiný čas příjezdu nebo odjezdu – zadej znovu auto']);
  const r = rows(render(c, { ...t, step: 'summary' }));
  assert.ok(!r.some((x) => /auta|📍/.test(x)), r.join('\n'));
  // bez auta hlášení o vlaku a kde upravit program; stejné časy (jiný spoj ve stejný čas) nic nezahodí
  const c2 = load(), t2 = vie({ car: { mode: 'skip', totalCzk: 0 } });
  await pickTrain(c2, t2, { '2026-11-04': ['06:01', '09:55'], '2026-11-11': ['06:01', '09:55'] });
  assert.deepEqual(plain(c2.__toasts), ['Pojedeš vlakem / busem – let se nepočítá', 'Pojedeš vlakem / busem – let se nepočítá. Jiný čas příjezdu nebo odjezdu – program uprav v kroku Program']);
  assert.equal(t2.car.mode, 'skip');
  assert.ok(t2.plan, 'bez auta: program zůstane, hláška řekne, kde ho upravit');
  const same = vie({ overland: OV() });
  same.plan.span = { ...same.plan.span, arrivalTime: '09:55', departureTime: '06:01' };
  await pickTrain(c2, same, { '2026-11-04': ['06:01', '09:55'], '2026-11-11': ['06:01', '09:55'] });
  assert.ok(same.plan && same.car, 'stejné časy → program i auto zůstanou');
});

test('živá nabídka letu („Použít“) s jiným časem příletu: program znovu, auto zadej znovu; let ve stejný čas nic nezahodí', async () => {
  const c = load();
  c.SearchHelp = { isCached: () => false, liveVerdict: () => ({ st: 'ok' }) };
  const back = leg('VIE', 'PRG', '2026-11-11', '10:10', '11:06', 'Europe/Vienna', 'Europe/Prague');
  const alt = (dep, arr) => ({ out: leg('PRG', 'VIE', '2026-11-04', dep, arr, 'Europe/Prague', 'Europe/Vienna'), back, flightCzk: 990, bookUrl: 'https://kiwi.example/b' });
  c.fetch = async () => ({ ok: true, json: async () => ({ available: true, items: [alt('07:00', '07:56'), alt('20:00', '20:56')] }) });
  c.__all['[data-alt]'] = [{ dataset: { alt: '0' } }, { dataset: { alt: '1' } }];
  const use = async (t, i) => { render(c, t); c.__els['#tfVerify'].onclick(); await tick(); c.__toasts.length = 0; c.__all['[data-alt]'][i].onclick(); };
  const t = vie();
  await use(t, 0);
  assert.equal(t.flight.out.dep, '2026-11-04T07:00:00');
  assert.deepEqual([t.car, Boolean(t.plan), t.stay.name], [null, true, 'Hostel Backpackers Vienna'], 'program zůstane uložený, auto pryč');
  assert.deepEqual(plain(c.__toasts), ['Let aktualizován – jiný čas příletu nebo odletu, zadej znovu auto']);
  const u = vie();
  await use(u, 1);
  assert.deepEqual([u.car.totalCzk, Boolean(u.plan), u.flight.flightCzk], [2000, true, 990]);
  assert.deepEqual(plain(c.__toasts), ['Let aktualizován']);
});

test('program jednoho místa sestavený pro jiné časy příjezdu / odjezdu: shrnutí, kalendář ani plánovač ho nepoužijí', () => {
  const c = load();
  // vlak ve stejné dny, ale program pořád pro let (span 20:56 / 10:10) – starší uložená cesta
  const t = vie({ overland: OV(), car: null, step: 'summary' });
  const prog = (tt) => [rows(render(c, tt)).filter((x) => x.includes('📍')), plain(c.window.Trip.calendarEvents(tt)).filter((e) => e.title.startsWith('Den ')).map((e) => e.start)];
  assert.deepEqual(prog(t), [[], []]);
  c.__els['#sumSave'].onclick();
  assert.deepEqual(plain(c.S.trips[0].days), {});
  // program pro časy vlaku platí; den cesty bez programu (cap 0) ve shrnutí není, volný den ano
  t.plan.span = { ...t.plan.span, arrivalTime: '09:55', departureTime: '06:01' };
  assert.deepEqual(prog(t), [['čt 5. 11. 📍 Hofburg', 'pá 6. 11. 📍 volný den'], ['2026-11-05']]);
  c.__els['#sumSave'].onclick();
  assert.deepEqual(Object.entries(plain(c.S.trips[0].days)).filter(([, v]) => v.length), [['2026-11-05', ['Hofburg']]]);
  // let (program pro let): po příletu ve 20:56 není „volný den“, ale nic
  const fly = vie({ step: 'summary' });
  assert.deepEqual(prog(fly)[0], ['čt 5. 11. 📍 Hofburg', 'pá 6. 11. 📍 volný den']);
  // prázdný den odjezdu: „volno do odjezdu“ (ne „volný den“ nad „Z ubytování na letiště vyraž…“)
  const dep = vie({ step: 'summary' });
  dep.plan.days = [...dep.plan.days, day('2026-11-11', 30)];
  assert.deepEqual(prog(dep)[0], ['čt 5. 11. 📍 Hofburg', 'pá 6. 11. 📍 volný den', 'st 11. 11. 📍 volno do odjezdu']);
});

test('vlak/bus jen tam místo zpátečního letu: pobyt zůstane stejně dlouhý (ne 3 noci cesty jen tam), hotel platí', async () => {
  const c = load();
  const t = vie({ car: null });
  await pickTrain(c, t, { '2026-11-04': ['06:01', '09:55'] });
  assert.equal(t.overland.back, null);
  assert.equal(t.nightsOneWay, 7);
  assert.deepEqual(plain(c.window.Trip.stayDates(t)), { checkin: '2026-11-04', checkout: '2026-11-11', nights: 7 });
  assert.equal(t.stay.name, 'Hostel Backpackers Vienna');
  assert.ok(!c.__toasts.some((x) => /ubytování/.test(x)), c.__toasts.join(' | '));
  render(c, t);
  assert.match(c.__els['#tripRoot'].innerHTML, /id="thSub">Rakousko · 4\.11\.–11\.11\. · jen tam · 2 os\. · 🚆 vlakem\/busem</);
});

test('trasa přes víc míst zapnutá po změně termínu (vlak jindy, když byla vypnutá): hotel místa na staré dny se zahodí', () => {
  const c = load();
  const base = (id, name, lat, lon, nights, stay) => ({ id, name, lat, lon, nights, cc: 'AT', country: 'Rakousko', anchor: null, stay, plan: null });
  const t = vie({
    step: 'route', car: null, plan: null, stay: null,
    overland: OV({ out: train('2026-11-05', '06:01', '09:55'), back: train('2026-11-12', '06:01', '09:55') }),
    route: { mode: 'single', transport: 'car', want: 2, exclude: [], candidates: [], notes: [], legs: {},
      bases: [base('city:VIE', 'Vídeň', 48.2082, 16.3738, 3, { mode: 'pick', id: 'h1', name: 'Hostel Backpackers Vienna', totalCzk: 1980, checkin: '2026-11-04', checkout: '2026-11-07' }),
        base('Q34713', 'Salcburk', 47.8, 13.045, 4, { mode: 'manual', name: 'U Mozarta', totalCzk: 4000, checkin: '2026-11-07', checkout: '2026-11-11' })],
      transfers: [{ km: 295, carMin: 190, transitMin: 160, transitKind: 'rail', basis: 'estimate' }] },
  });
  c.__all['[data-rmode]'] = [{ dataset: { rmode: 'multi' } }];
  render(c, t);
  c.__all['[data-rmode]'][0].onclick();
  assert.equal(t.route.mode, 'multi');
  assert.equal(t.route.bases[0].stay, null, 'hotel na 4.–7. 11. pro Vídeň 5.–8. 11. neplatí');
  assert.deepEqual(plain(t.route.bases[1].stay), { mode: 'manual', name: 'U Mozarta', totalCzk: 4000, checkin: '2026-11-08', checkout: '2026-11-12' }, 'ruční cena se přesune');
  assert.equal(c.__toasts[0], 'Termín jednoho místa se změnil – hotel tam vyber znovu');
  assert.equal(c.window.Trip.costs(t).stay, 4000);
});

test('nové hledání pro jiný počet lidí nebo zavazadla se stejným letem: nová cesta – rozpracovaná zůstane v Mých cestách, neuložená sdílená až po otázce', () => {
  const c = load();
  const mine = vie({ step: 'summary' });
  const pick = (adults, bags = 'none') => c.window.Trip.start({ t: JSON.parse(JSON.stringify(mine.flight)), g: null, result: { query: { adults, bags }, origins: [] } });
  c.S.trip = mine;
  pick(2);
  assert.deepEqual([c.__confirms.length, c.__go.at(-1), c.S.trip], [0, 'trip', mine], 'stejný let i lidé → rozpracovaná cesta');
  pick(4);
  // rozpracovaná se uloží do Mých cest a zůstane tam (už ne jako sama uložená) – bez otázky
  assert.equal(c.__confirms.length, 0);
  assert.deepEqual([c.S.trip.adults, c.S.trip.stay, c.S.trip.step], [4, null, 'flight']);
  assert.deepEqual(plain(c.S.trips.map((x) => [x.tripId, x.dest, x.auto || false])), [[mine.created, 'Vídeň', false]]);
  assert.ok(c.__toasts.includes('Vídeň zůstává v Mých cestách'), c.__toasts.join(' | '));
  // sdílená cesta (cizí – sama se neukládá) s rozpracovaným: otázka jako dřív
  const shared = vie({ step: 'summary', created: 5, shared: { on: '2026-10-01' } });
  c.S.trip = shared;
  pick(2, 'cabin');
  assert.equal(c.__confirms.length, 1, 'jiná zavazadla → otázka');
  assert.match(c.__confirms[0], /^Máš rozpracovanou cestu: Vídeň \(ubytování, auto, program\)\. Nahradit ji/);
  assert.equal(c.S.trip, shared, 'bez souhlasu zůstane');
  c.__ok = true;
  pick(4);
  assert.deepEqual([c.S.trip.adults, c.S.trip.stay, c.S.trip.step, c.S.trips.length], [4, null, 'flight', 1]);
});

test('🧳 cesta se ukládá sama do Mých cest: až za výběrem letu, s prodlevou, bez kopií; sdílená ne', () => {
  const timers = [];
  const c = load({ setTimeout: (f) => timers.push(f), clearTimeout: (id) => { if (id) timers[id - 1] = null; } });
  const run = () => timers.splice(0).forEach((f) => f && f());
  const T = c.window.Trip;
  // jen vybraný let: do seznamu nic (prohlédnutý let ho nezaplní)
  const t = vie({ step: 'flight', stay: null, car: null, plan: null });
  render(c, t);
  run();
  assert.equal(c.S.trips.length, 0);
  // další krok → po chvilce v seznamu, jako sama uložená
  T.stepTo('stay');
  assert.equal(c.S.trips.length, 0, 'až po prodlevě');
  run();
  assert.deepEqual(plain(c.S.trips.map((x) => [x.tripId, x.dest, x.auto, Boolean(x.wizard)])), [[t.created, 'Vídeň', true, true]]);
  // další změny přepíšou tutéž cestu – žádná kopie, bez hlášek a přechodů
  T.stepTo('car'); T.stepTo('program'); run();
  assert.equal(c.S.trips.length, 1);
  assert.deepEqual([c.__toasts.length, c.__go.length], [0, 0]);
  // cesta bez id (starší) dostane jedno a pak se už nezdvojí
  const old = vie({ step: 'stay', created: undefined });
  render(c, old); run(); T.stepTo('car'); run();
  assert.ok(Number.isFinite(old.created));
  assert.equal(c.S.trips.filter((x) => x.tripId === old.created).length, 1);
  // sdílená (cizí) až po „💾 Uložit si ji“
  c.S.trips = [];
  const sh = vie({ step: 'summary', created: 7, shared: { on: '2026-10-01' } });
  render(c, sh); T.stepTo('program'); run();
  assert.equal(c.S.trips.length, 0);
});

test('🧳 ↺ Začít znovu sama uloženou cestu odebere z Mých cest, uloženou na přání nechá; „Začít novou cestu“ ji nechá vždy', () => {
  const c = load();
  c.__ok = true;
  const T = c.window.Trip;
  // sama uložená → zahodit i ze seznamu
  render(c, vie({ step: 'summary' }));
  c.S.trips.push({ tripId: c.S.trip.created, dest: 'Vídeň', auto: true });
  c.__els['#tripRestart'].onclick();
  assert.match(c.__confirms.at(-1), /a začít znovu\? Zmizí i z Mých cest\.$/);
  assert.deepEqual([c.S.trip, c.S.trips.length, c.__go.at(-1)], [null, 0, 'flights']);
  // uložená na přání (💾) zůstane
  render(c, vie({ step: 'summary' }));
  T.saveToPlanner({ stay: true });
  assert.equal(c.S.trips[0].auto, undefined);
  c.__els['#tripRestart'].onclick();
  assert.match(c.__confirms.at(-1), /Uložená cesta v Mých cestách zůstane\.$/);
  assert.deepEqual([c.S.trip, c.S.trips.length], [null, 1]);
  // „Začít novou cestu“ ve Shrnutí: hotová cesta zůstane (už ne jako sama uložená), bez otázky
  c.S.trips = [];
  const n = c.__confirms.length;
  const t = vie({ step: 'summary', created: 9 });
  render(c, t);
  c.__els['#sumNew'].onclick();
  assert.deepEqual(plain([c.S.trip, c.S.trips.map((x) => [x.tripId, x.auto || false]), c.__confirms.length, c.__go.at(-1)]), [null, [[9, false]], n, 'flights']);
  assert.ok(c.__toasts.includes('Vídeň zůstává v Mých cestách – vyber další let'), c.__toasts.join(' | '));
});

test('🧳 otevření jiné uložené cesty z Mých cest: rozpracovaná tam zůstane bez otázky i bez hlášky (seznam je vidět)', () => {
  const c = load();
  const mine = vie({ step: 'summary' });
  render(c, mine);
  c.window.Trip.saveToPlanner({ stay: true });
  c.__toasts.length = 0;
  const other = vie({ step: 'summary', created: 42 });
  assert.equal(c.window.Trip.openSaved(JSON.parse(JSON.stringify(other)), 42), true);
  assert.deepEqual(plain([c.S.trip.created, c.__confirms.length, c.__toasts, c.S.trips.map((x) => x.tripId)]), [42, 0, [], [mine.created]]);
});

test('🧳 znovu uložená cesta bez dat „Před cestou“ (ještě se načítají) nechá seznam na míru i s odškrtnutím; rozpočet = můj', () => {
  const mem = {}, localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  const c = load({ localStorage });
  const list = [{ t: 'Zařídit: pojištění', done: false, id: 'todo:ins' }, { t: 'Plavky', done: false, id: 'pack:ac-swim' }];
  const pt = { html: () => '', shareState: () => undefined, sanitize: () => undefined, tripKey: () => 'k', copyDone() {}, adopt() {}, reminders: () => [], plannerChecklist: () => list.map((x) => ({ ...x })) };
  c.window.PreTrip = pt; c.PreTrip = pt;
  // „Můj rozpočet“ ze Shrnutí (cíl + den cesty tam) – dřív se do Mých cest uložila cena cesty jako rozpočet
  mem.atlas_budget = JSON.stringify({ 'ATVídeň:2026-11-04': { czk: 20000, at: 1 } });
  render(c, vie({ step: 'summary' }));
  c.window.Trip.saveToPlanner({ stay: true });
  assert.equal(c.S.trips[0].budget, '20000');
  c.S.trips[0].checklist[1].done = true;
  // jiné zařízení / pomalá síť: data „Před cestou“ ještě nejsou → null; obecný PACK by seznam přepsal i s odškrtnutím
  pt.plannerChecklist = () => null;
  c.window.Trip.saveToPlanner({ stay: true });
  assert.deepEqual(plain(c.S.trips[0].checklist.map((x) => [x.t, x.done])), [['Zařídit: pojištění', false], ['Plavky', true]]);
  assert.deepEqual(plain(c.S.trips[0].genChecklist), ['Zařídit: pojištění', 'Plavky']);
  // bez vlastního rozpočtu: jako dřív cena cesty
  delete mem.atlas_budget;
  c.S.trips = [];
  c.window.Trip.saveToPlanner({ stay: true });
  assert.ok(+c.S.trips[0].budget > 0 && c.S.trips[0].budget !== '20000', c.S.trips[0].budget);
  assert.deepEqual(plain(c.S.trips[0].checklist.map((x) => x.t)), ['Pas']);
});

test('🧳 Shrnutí: „Uloženo v Mých cestách“ uloží hned (na přání) a zůstane; sdílená „💾 Uložit do Mých cest“', () => {
  const c = load();
  const h = render(c, vie({ step: 'summary' }));
  assert.match(h, /<button class="btn primary" id="sumSave">🧳 Uloženo v Mých cestách<\/button>/);
  c.__els['#sumSave'].onclick();
  assert.deepEqual([c.S.trips.length, c.S.trips[0].auto, c.__go.length], [1, undefined, 0]);
  assert.deepEqual(plain(c.__toasts), ['Cesta uložena do Mých cest']);
  c.__toasts.length = 0;
  c.__els['#sumSave'].onclick();
  assert.deepEqual(plain([c.S.trips.length, c.__toasts]), [1, ['Cesta je uložená v Mých cestách']]);
  assert.match(render(c, vie({ step: 'summary', shared: { on: '2026-10-01' } })), /id="sumSave">💾 Uložit do Mých cest<\/button>/);
});

test('auto: délka pronájmu a příplatek za vrácení jinde podle upravených časů; úpravy u zadané ceny platí i po „Pokračovat“', () => {
  const c = load();
  const h = render(c, vie({ car: null, step: 'car' }));
  assert.ok(h.includes('id="carDays">7 dní pronájmu</div>'), h.slice(h.indexOf('carDays') - 80, h.indexOf('carDays') + 80));
  const set = (v) => { for (const [k, x] of Object.entries(v)) c.__els[k].value = x; };
  set({ '#carPu': 'VIE', '#carDo': 'BTS', '#carFrom': '2026-11-04T21:41', '#carTo': '2026-11-14T10:00', '#carAge': '30' });
  c.__els['#carTo'].onchange();
  assert.equal(sp(c.__els['#carDays'].innerHTML), '10 dní pronájmu · vrácení na jiném letišti (BTS) může stát příplatek');
  set({ '#carDo': 'VIE', '#carTo': '2026-11-05T21:00' });
  c.__els['#carDo'].onchange();
  assert.equal(sp(c.__els['#carDays'].innerHTML), '1 den pronájmu');
  // uložená cena: změna vrácení bez „Uložit“ → „Pokračovat“ ji uloží (průběh cesty, kalendář) a upozorní na cenu
  const t = vie({ step: 'car' });
  render(c, t);
  set({ '#carPu': 'VIE', '#carDo': 'VIE', '#carFrom': '2026-11-04T21:41', '#carTo': '2026-11-10T18:00', '#carAge': '30' });
  c.__els['#carNext'].onclick();
  assert.deepEqual([t.car.to, t.car.totalCzk, t.step], ['2026-11-10T18:00', 2000, 'program']);
  assert.deepEqual(plain(c.__toasts), ['Změny auta uloženy – zkontroluj, jestli cena platí']);
  assert.ok(rows(render(c, { ...t, step: 'summary' })).includes('út 10. 11. 🚗 Vrácení auta VIE 18:00'));
  // beze změny nic
  const u = vie({ step: 'car' });
  render(c, u);
  set({ '#carTo': '2026-11-11T08:10' });
  c.__els['#carNext'].onclick();
  assert.deepEqual([u.car.to, c.__toasts.length], ['2026-11-11T08:10', 0]);
});

test('auto s upravenými časy („Pokračovat“ i „Uložit“): odkaz ve shrnutí vede na srovnávač s novými časy, i když se nabídky načtou až potom', async () => {
  const c = load();
  const kayak = (q) => `https://www.cz.kayak.com/cars/${q.get('pickup')}/${q.get('from')}/${q.get('to')}`;
  c.fetch = async (u) => {
    const q = new URLSearchParams(u.split('?')[1]);
    return { ok: true, json: async () => ({ query: { pickup: q.get('pickup'), dropoff: q.get('dropoff'), from: q.get('from'), to: q.get('to'), age: +q.get('age') }, items: [], links: [{ id: 'kayak', name: 'Kayak', note: '', url: kayak(q) }] }) };
  };
  const set = (v) => { for (const [k, x] of Object.entries(v)) c.$(k).value = x; };
  const OLD = 'https://www.cz.kayak.com/cars/VIE/2026-11-04T21:41/2026-11-11T08:10', NEW = 'https://www.cz.kayak.com/cars/VIE/2026-11-04T21:41/2026-11-10T18:00';
  // odkaz z uložené trasy: shrnutí v novém načtení aplikace (bez načtených nabídek)
  const link = (t) => { const h = render(load(), { ...plain(t), step: 'summary' }); return (h.match(/\d\. Auto<\/span><a class="btn sm" href="([^"]*)"/) || [])[1]; };
  // krok Auto s uloženými časy (zástupné prvky si hodnoty pamatují – nastaví se jako po vykreslení)
  const open = async (x) => { set({ '#carPu': 'VIE', '#carDo': 'VIE', '#carFrom': '2026-11-04T21:41', '#carTo': '2026-11-11T08:10', '#carAge': '30' }); render(c, x); await tick(); };
  const t = vie({ step: 'car', car: { ...vie().car, url: OLD } });
  await open(t);
  set({ '#carTo': '2026-11-10T18:00' });
  c.__els['#carTo'].onchange();
  await tick();
  c.__els['#carNext'].onclick();
  assert.deepEqual([t.car.to, t.car.url, link(t)], ['2026-11-10T18:00', NEW, NEW]);
  // „Pokračovat“ dřív, než se nabídky k novým časům načtou: starý odkaz pryč, nový po načtení
  const u = vie({ step: 'car', car: { ...vie().car, url: OLD } });
  await open(u);
  set({ '#carTo': '2026-11-10T18:00' });
  c.__els['#carTo'].onchange();
  c.__els['#carNext'].onclick();
  assert.deepEqual([u.car.to, u.car.url], ['2026-11-10T18:00', null]);
  await tick();
  assert.deepEqual([u.car.url, link(u)], [NEW, NEW]);
  // „Uložit“ s cenou hned po změně času: totéž
  const w = vie({ step: 'car', car: null });
  await open(w);
  set({ '#carTo': '2026-11-10T18:00', '#carPrice': '3000' });
  c.__els['#carTo'].onchange();
  c.__els['#carSave'].onclick();
  assert.deepEqual([w.car.totalCzk, w.car.url], [3000, null]);
  await tick();
  assert.equal(w.car.url, NEW);
});

test('hotel jednoho místa při zapnuté trase: vlak jindy nebo jiný počet nocí ho zahodí – po přepnutí na Jedno místo neplatí se starým termínem', async () => {
  const c = load();
  const base = (id, name, lat, lon, nights) => ({ id, name, lat, lon, nights, cc: 'AT', country: 'Rakousko', anchor: null, stay: null, plan: null });
  const route = () => ({ mode: 'multi', transport: 'transit', want: 2, exclude: [], candidates: [], notes: [], legs: {},
    bases: [base('city:VIE', 'Vídeň', 48.2082, 16.3738, 3), base('Q34713', 'Salcburk', 47.8, 13.045, 4)],
    transfers: [{ km: 295, carMin: 190, transitMin: 160, transitKind: 'rail', basis: 'estimate' }] });
  const single = (t) => { c.__all['[data-rmode]'] = [{ dataset: { rmode: 'single' } }]; render(c, { ...t, step: 'route' }); c.S.trip = t; c.__all['[data-rmode]'][0].onclick(); };
  // vlak 5.–12. 11. místo letu 4.–11. 11. (trasa zapnutá) → zpět na jedno místo: hotel na 4.–11. 11. pryč
  const t = vie({ car: null, plan: null, route: route() });
  await pickTrain(c, t, { '2026-11-05': ['06:01', '09:55'], '2026-11-12': ['06:01', '09:55'] });
  assert.equal(t.stay, null);
  assert.deepEqual(plain(c.__toasts), ['Pojedeš vlakem / busem – let se nepočítá', 'Termín pobytu se změnil – vyber ubytování znovu']);
  single(t);
  assert.deepEqual([t.route.mode, t.stay, c.window.Trip.costs(t).stay], ['single', null, 0]);
  assert.ok(!rows(render(c, { ...t, step: 'summary' })).some((x) => x.includes('🏨')));
  // ruční cena zůstane s upozorněním; hlášení o hotelu místa trasy má přednost
  const m = vie({ car: null, plan: null, route: route(), stay: { mode: 'manual', name: 'U kamaráda', totalCzk: 3000 } });
  await pickTrain(c, m, { '2026-11-05': ['06:01', '09:55'], '2026-11-12': ['06:01', '09:55'] });
  assert.deepEqual([m.stay.name, c.__toasts.at(-1)], ['U kamaráda', 'Termín pobytu se změnil – zkontroluj cenu ubytování']);
  const h = vie({ car: null, plan: null, route: route() });
  h.route.bases[0].stay = { mode: 'pick', id: 'h2', name: 'Hotel Sacher', totalCzk: 9000, checkin: '2026-11-04', checkout: '2026-11-07' };
  await pickTrain(c, h, { '2026-11-05': ['06:01', '09:55'], '2026-11-12': ['06:01', '09:55'] });
  assert.deepEqual([h.stay, h.route.bases[0].stay, c.__toasts.at(-1)], [null, null, 'Termín jednoho místa se změnil – hotel tam vyber znovu']);
  // cesta jen tam: jiný počet nocí se zapnutou trasou → hotel jednoho místa pryč (hlášení o trase má přednost)
  const ow = vie({ step: 'route', car: null, plan: null, route: route() });
  ow.flight = { ...ow.flight, back: null };
  ow.nightsOneWay = 7;
  render(c, ow);
  c.__els['#owNights'].value = '8';
  c.__els['#owNights'].onchange();
  assert.deepEqual([ow.nightsOneWay, ow.stay, plain(c.__toasts)], [8, null, ['Počet nocí se změnil – uprav jejich rozdělení v trase']]);
  single(ow);
  assert.equal(c.window.Trip.costs(ow).stay, 0);
});

test('cesta jen tam: jiný počet nocí zahodí i auto (vrácení podle konce pobytu), hlášení se spojí', () => {
  const c = load();
  const ow = (over) => { const t = vie({ step: 'route', ...over }); t.flight = { ...t.flight, back: null }; return t; };
  const nights = (t, v) => { render(c, t); c.__els['#owNights'].value = v; c.__els['#owNights'].onchange(); };
  const a = ow({ car: { mode: 'manual', totalCzk: 3000, pickup: 'VIE', dropoff: 'VIE', from: '2026-11-04T21:41', to: '2026-11-07T10:00' } });
  nights(a, '1');
  assert.deepEqual([a.nightsOneWay, a.car, a.stay], [1, null, null]);
  assert.deepEqual(plain(c.__toasts), ['Počet nocí se změnil – vyber ubytování znovu. Zadej znovu i auto']);
  const b = ow({ stay: { mode: 'skip', totalCzk: 0 } });
  nights(b, '5');
  assert.deepEqual(plain(c.__toasts), ['Počet nocí se změnil – zadej znovu auto']);
  assert.equal(c.window.Trip.costs(b).car, 0);
  // stejný počet (i po oříznutí 50 → 30) nic nezahodí; auto „nepotřebuji“ zůstane
  const d = ow({ nightsOneWay: 30 });
  nights(d, '50');
  assert.deepEqual([d.car.totalCzk, d.stay.name, c.__toasts.length], [2000, 'Hostel Backpackers Vienna', 0]);
  const e = ow({ car: { mode: 'skip', totalCzk: 0 }, stay: null });
  nights(e, '4');
  assert.deepEqual([e.car.mode, c.__toasts.length], ['skip', 0]);
});

test('trasa vlakem / busem: cesta z letiště do města se nepočítá ve směru, kde ji nahradí jízdenka z posledního místa na letiště', () => {
  const c = load();
  const arr = (back) => ({ iata: 'VIE', city: 'Vídeň', gen: 'Vídně', mode: 'train', how: back ? 'vlak S7' : 'vlak S7 do centra', czk: 110, min: 25, basis: 'table', lat: 48.2082, lon: 16.3738 });
  const t = vie({
    step: 'summary', car: null, plan: null, stay: null, arrival: { out: arr(false), back: arr(true) },
    route: { mode: 'multi', transport: 'transit', want: 2, exclude: [], candidates: [], notes: [],
      bases: [{ id: 'city:VIE', name: 'Vídeň', lat: 48.2082, lon: 16.3738, nights: 3, cc: 'AT', stay: null, plan: null }, { id: 'Q34713', name: 'Salcburk', lat: 47.8, lon: 13.045, nights: 4, cc: 'AT', stay: null, plan: null }],
      transfers: [{ km: 295, carMin: 190, transitMin: 160, transitKind: 'rail', basis: 'estimate', fareCzk: 700 }],
      legs: { arrival: { km: 21, carMin: 28, transitMin: 39, fareCzk: 110 }, departure: { km: 304, carMin: 200, transitMin: 222, fareCzk: 900 } } },
  });
  t.flight.arrCzk = 220;
  const k = c.window.Trip.costs(t);
  // Salcburk → letiště VIE je v přejezdech (900 Kč/os.) – vlak S7 z Vídně na letiště se nejede
  assert.deepEqual([k.arrival, k.transfers], [110 * 2, (700 + 900) * 2]);
  const h = render(c, t);
  assert.ok(h.includes('<td>Doprava z letiště do města (odhad)</td><td>220\u00a0Kč</td>'), h.slice(h.indexOf('Doprava'), h.indexOf('Doprava') + 80));
  // krok Let: řádek ceny na osobu s poznámkou, proč je nižší
  assert.ok(sp(render(c, { ...t, step: 'flight' })).includes('<span>Z letiště do města<small>bez úseku v přejezdech trasy</small></span><b>~110\u00a0Kč</b>'));
  // první místo daleko od letiště: počítá se jen cesta z města na letiště
  const far = { ...t, route: { ...t.route, bases: [...t.route.bases].reverse(), legs: { arrival: t.route.legs.departure, departure: t.route.legs.arrival } } };
  assert.equal(c.window.Trip.costs(far).arrival, 110 * 2);
  assert.ok(render(c, far).includes('<td>Doprava z města na letiště (odhad)</td>'));
  // autem beze změny (konce kryje doprava z letiště, pokud auto není z letiště); bez odhadu jízdenky beze změny
  assert.equal(c.window.Trip.costs({ ...t, route: { ...t.route, transport: 'car' } }).arrival, 220 * 2);
  assert.equal(c.window.Trip.costs({ ...t, route: { ...t.route, legs: {} } }).arrival, 220 * 2);
  // trasa vlakem: první den po příletu ve 20:56 bez programu (cap 0) ve shrnutí není, volno přes den ano
  t.route.bases[0].plan = { center: { lat: 48.2, lon: 16.37 }, days: [day('2026-11-04', 0), day('2026-11-05', 360), day('2026-11-06', 360, ['Prátr'])] };
  const r = rows(render(c, t)).filter((x) => x.includes('📍'));
  assert.deepEqual(r, ['čt 5. 11. 📍 Vídeň: volno', 'pá 6. 11. 📍 Vídeň: Prátr']);
  // prázdný den přejezdu a odjezdu: „volno do přejezdu“ / „volno do odjezdu“ (nad přejezdem a cestou na letiště)
  t.route.bases[0].plan.days.push(day('2026-11-07', 60));
  t.route.bases[1].plan = { center: { lat: 47.8, lon: 13.04 }, days: [day('2026-11-08', 360, ['Pevnost']), day('2026-11-11', 30)] };
  const r2 = rows(render(c, t)).filter((x) => x.includes('📍'));
  assert.ok(r2.includes('so 7. 11. 📍 Vídeň: volno do přejezdu') && r2.includes('st 11. 11. 📍 Salcburk: volno do odjezdu'), r2.join('\n'));
  // noční přílet na trase (0:40): ubytování prvního místa až pod cestou z letiště, v noci „spíš taxi“
  t.flight.out = { ...t.flight.out, dep: '2026-11-04T22:30:00', arr: '2026-11-05T00:40:00' };
  const all = rows(render(c, t));
  const iRide = all.findIndex((x) => /Z letiště VIE → Vídeň/.test(x)), iHotel = all.findIndex((x) => /🏨 <b>Vídeň<\/b>|🏨 Vídeň/.test(x));
  assert.ok(iRide >= 0 && iHotel > iRide && /v noci spíš taxi/.test(all[iRide]) && all[iHotel].startsWith('čt 5. 11.'), all.join('\n'));
});

test('ubytování „jen odkazy“: v průběhu i poznámkách „zatím nevybráno“; nový hotel / auto zruší ✓ v Co zarezervovat; týž den bez „jen odkazy“', () => {
  const tj = src('trip.js');
  // průběh cesty a poznámky do Mých cest – ne prázdné „Ubytování:“
  // (přílet po půlnoci: řádek až v den příletu, pod cestou z letiště)
  assert.match(tj, /rows\.push\(\[\[checkin, arrivalAt\(outLeg\(t\)\)\.slice\(0, 10\)\]\.sort\(\)\[1\], '🏨', `Ubytování: \$\{esc\(hotelName\(t\.stay\) \|\| 'zatím nevybráno'\)\}`\]\)/);
  assert.match(tj, /`Ubytování: \$\{hotelName\(t\.stay\) \|\| 'zatím nevybráno'\}\$\{t\.stay\.totalCzk \? ' – ' \+ czk\(t\.stay\.totalCzk\) : ''\}/);
  assert.doesNotMatch(tj, /Ubytování: \$\{esc\(t\.stay\.name \|\| ''\)\}/);
  // ✓ patří k výběru: každé nové ubytování (jedno místo i místo trasy) a auto ho zruší
  assert.match(tj, /const unbook = \(t, id\) => \{ if \(t && t\.booked\) delete t\.booked\[id\]; \};/);
  assert.match(tj, /set: v => \{ T\(\)\.stay = v; unbook\(T\(\), 'stay'\); \}/);
  assert.match(tj, /set: v => \{ b\.stay = \{ \.\.\.v, checkin: d\.checkin, checkout: d\.checkout \}; unbook\(t, stayBookId\(b, d\)\); \}/);
  assert.equal((tj.match(/unbook\(t, 'stay'\)/g) || []).length, 3, 'vlastní cena, jen odkazy, ⚡ výběr');
  assert.equal((tj.match(/unbook\(t, 'car'\)/g) || []).length, 3, 'nové auto, změna míst a časů (i bez Uložit)');
  // zpáteční let týž den: jen „Ubytování neřeším“ (bez ceny a „jen odkazy“, které by ve shrnutí neměly odkaz)
  assert.match(tj, /\$\{nights < 1 \? '' : '<button class="btn ghost" id="stayLinks">Vyberu později – jen odkazy →<\/button>'\}/);
  assert.match(tj, /const sl = \$\('#stayLinks'\); if \(sl\) sl\.onclick =/);
  assert.match(tj, /const ms = \$\('#manSave'\); if \(ms\) ms\.onclick =/);
});

test('průběh cesty: přílet po půlnoci – ubytování pod cestou z letiště (ne den předem nad ní), v noci „spíš taxi“', () => {
  const c = load();
  const ao = { iata: 'VIE', city: 'Vídeň', gen: 'Vídně', mode: 'train', how: 'vlak S7 do centra', czk: 110, min: 25, basis: 'table', lat: 48.2082, lon: 16.3738 };
  const t = vie({ step: 'summary', car: null, plan: null, arrival: { out: ao } });
  // let 4. 11. ve 23:30, přílet 5. 11. ve 4:52 (pokoj od večera 4. 11.)
  t.flight.out = { ...t.flight.out, dep: '2026-11-04T23:30:00', arr: '2026-11-05T04:52:00' };
  const r = rows(render(c, t));
  const iArr = r.findIndex((x) => x.startsWith('čt 5. 11. 🚆')), iHotel = r.findIndex((x) => x.includes('🏨 Ubytování'));
  assert.ok(iArr >= 0 && iHotel > iArr && r[iHotel].startsWith('čt 5. 11.'), r.join('\n'));
  assert.match(r[iArr], /v noci spíš taxi/);
  // přílet večer ve 20:56 beze změny: bez nočního upozornění, ubytování v den příletu
  const day = rows(render(c, vie({ step: 'summary', car: null, plan: null, arrival: { out: ao } })));
  assert.ok(day.some((x) => x.startsWith('st 4. 11. 🏨')) && !day.some((x) => /v noci spíš taxi/.test(x)), day.join('\n'));
});
