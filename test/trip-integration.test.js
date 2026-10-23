// Průvodce cestou tam, kde se potkávají funkce: vlak/bus místo letu × trasa přes víc míst × ubytování,
// a sdílený odkaz s „Je to dobrá cena?“. Kroky průvodce se vykreslí do zástupného DOM ($ vrací stálé objekty
// podle selektoru, kliknutí = zavolání onclick); public/js/trip.js a pomocné řádky z app.js přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transferEstimate, evaluateRoute } from '../server/lib/stayplan.js';
import { routeKey } from '../server/lib/transfers.js';
process.env.FUEL_LIVE = '0'; // přejezdy počítají palivo – ceny vestavěné, bez sítě (ČSÚ, Evropská komise, ECB)

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load(state = {}) {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, __saves: 0 };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = ${JSON.stringify(state)}, __els = {}, __all = {}, __toasts = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = (s) => __all[s] || [];
    var go = () => {}; var save = () => { __saves++; }; var flag = (cc) => '[' + cc + ']';
    var toast = (msg) => { __toasts.push(msg); };`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`);
// totéž s pevnými mezerami, jak délku píše průvodce (render() je přes sp převádí na obyčejné) – poznámky, kalendář, průběh
const hmNb = (m) => (m >= 60 ? `${Math.floor(m / 60)}\u00a0h${m % 60 ? ' ' + (m % 60) + '\u00a0min' : ''}` : `${m}\u00a0min`);

const leg = (from, to, date, dep, arr, fromTz, toTz) => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: 'https://air.example/book',
});
const VIDEN = { label: 'Vídeň', cc: 'AT', lat: 48.185, lon: 16.376, tz: 'Europe/Vienna', regiojet: true, flixbus: true };
const OV = (over = {}) => ({
  on: true, q: { from: 'geo:50.0755,14.4378|Praha', to: 'ap:VIE' }, km: 252, est: { minutes: 234, czk: 299, basis: 'measured' },
  from: { label: 'Praha', cc: 'CZ', lat: 50.08, lon: 14.43, tz: 'Europe/Prague', regiojet: true, flixbus: true }, to: VIDEN,
  out: { source: 'regiojet', id: '8730597632', date: '2026-11-11', dep: '2026-11-11T06:01', arr: '2026-11-11T10:21', min: 260, czk: 299, kinds: ['TRAIN'], transfers: 0, fromStation: 'hl.n.', toStation: 'Wien Hbf' },
  back: { source: 'regiojet', id: '8730597999', date: '2026-11-15', dep: '2026-11-15T17:00', arr: '2026-11-15T21:20', min: 260, czk: 299, kinds: ['TRAIN'], transfers: 0, fromStation: 'Wien Hbf', toStation: 'hl.n.' },
  links: { out: [{ id: 'regiojet', name: 'RegioJet', url: 'https://regiojet.cz/?departureDate=2026-11-11' }], back: [{ id: 'regiojet', name: 'RegioJet', url: 'https://regiojet.cz/?departureDate=2026-11-15' }] },
  ...over,
});
const SALCBURK = { id: 'Q34713', name: 'Salcburk', nameEn: 'Salzburg', lat: 47.8, lon: 13.045, cc: 'AT', country: 'Rakousko', nights: 2, stay: null, plan: null };
// Přejezdy z města příjezdu vlakem (Vídeň) a zpět spočítá server (api/stayplan s ground → groundLegs) –
// stejnou funkcí se tu připraví; klíč = poloha města, prvního a posledního místa (jako groundKey v trip.js).
const GROUND = evaluateRoute([{ name: 'Vídeň', lat: 48.2082, lon: 16.3738, cc: 'AT', country: 'Rakousko' }, SALCBURK], { ground: { name: 'Vídeň', lat: VIDEN.lat, lon: VIDEN.lon, cc: 'AT', country: 'Rakousko' } }).groundLegs;
const GROUND_KEY = '48.185,16.376|48.208,16.374|47.800,13.045';
// Let do Vídně, ale jede se vlakem; trasa Vídeň (2 noci) → Salcburk (2 noci), přejezdy ze serveru vedou k letišti VIE.
function trip(over = {}) {
  return {
    v: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', ground: {},
    flight: { out: leg('PRG', 'VIE', '2026-11-10', '07:00', '08:00', 'Europe/Prague', 'Europe/Vienna'), back: leg('VIE', 'PRG', '2026-11-14', '19:00', '20:00', 'Europe/Vienna', 'Europe/Prague'), flightCzk: 3000, groundCzk: 0, bagCzk: 0 },
    dest: { label: 'Vídeň', country: 'Rakousko', cc: 'AT', lat: 48.11, lon: 16.57 }, stay: null, car: null, plan: null, overland: OV(),
    route: {
      mode: 'multi', transport: 'car', want: 2, exclude: [], candidates: [],
      notes: ['Z posledního místa (Salcburk) na letiště VIE je to ~3 h 20 min – v den odletu vyraz včas, nebo poslední noc stráv blíž letišti.'],
      arrival: { iata: 'VIE', name: 'Vídeň (VIE)', lat: 48.11, lon: 16.57 }, departure: { iata: 'VIE', name: 'Vídeň (VIE)', lat: 48.11, lon: 16.57 },
      bases: [{ id: 'city:VIE', name: 'Vídeň', lat: 48.2082, lon: 16.3738, cc: 'AT', country: 'Rakousko', anchor: 'arrival', nights: 2, stay: null, plan: null }, { ...SALCBURK }],
      transfers: [{ ...transferEstimate({ lat: 48.2082, lon: 16.3738 }, SALCBURK), long: true, carUrl: 'https://maps.example/a', transitUrl: 'https://maps.example/b' }],
      legs: { arrival: { km: 21, carMin: 28, transitMin: 39, carUrl: 'https://maps.example/c' }, departure: { km: 304, carMin: 200, transitMin: 222, carUrl: 'https://maps.example/d' } },
      // dlouhý přejezd zpět k vlaku (long podle zvolené dopravy určuje server)
      groundLegs: { key: GROUND_KEY, arrival: GROUND.arrival, departure: { ...GROUND.departure, long: true } },
    },
    ...over,
  };
}
function render(ctx, t) {
  ctx.S.trip = t;
  ctx.__toasts.length = 0;
  ctx.window.Trip.render();
  return sp(ctx.__els['#tripStep'].innerHTML);
}

test('průvodce: vlak/bus + víc míst – přejezd z posledního místa zpět k vlaku/busu v trase i ve shrnutí, ne „na letiště“', () => {
  const c = load();
  const back = GROUND.departure; // přejezd zpět k vlaku ze serveru
  assert.ok(back.km > 250 && back.carMin > 180, 'Salcburk → Vídeň je dlouhý přejezd');
  assert.equal(back.basis, 'estimate');
  const want = `${back.km} km · ~${hm(back.carMin)} autem (odhad)`;
  // krok Trasa
  render(c, { ...trip(), step: 'route' });
  const list = sp(c.__els['#rtList'].innerHTML);
  const odjezd = list.slice(list.indexOf('Odjezd vlakem / busem'));
  assert.match(odjezd, /^Odjezd vlakem \/ busem <b>Vídeň<\/b> · ne 15\. 11\. 17:00/);
  assert.ok(odjezd.includes(want), `pod odjezdem přejezd ze Salcburku: ${odjezd.slice(0, 300)}`);
  assert.ok(odjezd.includes('href="https://www.google.com/maps/dir/?api=1&amp;origin=Salcburk%2C+Rakousko&amp;destination=V%C3%ADde%C5%88%2C+Rakousko&amp;travelmode=driving"'));
  const prijezd = list.slice(list.indexOf('Příjezd vlakem / busem'), list.indexOf('class="rb"'));
  assert.ok(!/ km · /.test(prijezd), 'Vídeň (1. místo) je u nádraží – žádný přejezd');
  assert.ok(!list.includes('na letiště VIE'), 'upozornění na cestu na letiště s vlakem neplatí');
  assert.ok(list.includes(`Z posledního místa (Salcburk) zpět k vlaku / busu (Vídeň) je to ~${hm(back.carMin)}`));
  // shrnutí: přejezd v den odjezdu před vlakem domů
  const h = render(c, trip());
  const rows = [...h.matchAll(/<div class="tl-row"><span class="tl-d">([^<]*)<\/span><span class="tl-i">([^<]*)<\/span><span>(.*?)<\/span><\/div>/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
  const i = rows.findIndex((r) => r.includes(`Salcburk → Vídeň · ${want}`));
  assert.ok(i > 0, rows.join('\n'));
  assert.match(rows[i], /^ne 15\. 11\. 🚗/);
  assert.match(rows[i + 1], /^ne 15\. 11\. 🚆 Vídeň → Praha · 17:00 → 21:20/);
  assert.ok(!rows.some((r) => /letiště/.test(r)), 's vlakem žádná cesta na letiště ani z něj');
  // jen tam (bez vlaku zpět): přejezd zpět se nepočítá; letadlem: zase přejezd na letiště ze serveru
  assert.ok(!render(c, trip({ overland: OV({ back: null }) })).includes('Salcburk → Vídeň ·'));
  const fly = render(c, trip({ overland: OV({ on: false }) }));
  assert.ok(fly.includes('Salcburk → letiště VIE · 304 km · ~3 h 20 min autem (odhad)'));
});

test('průvodce: přímý vlak z tabulky jízdních řádů (fast) – „vlakem (jízdní řád)“ místo „vlakem / busem (odhad)“, jinak beze změny', () => {
  const c = load();
  const t = trip({ overland: null, step: 'route' });
  t.route.transport = 'transit';
  const x = t.route.transfers[0];
  assert.equal(x.fast, true, 'Vídeň → Salcburk je v tabulce přímých vlaků');
  const time = `~${hm(x.transitMin)} vlakem`;
  // krok Trasa
  render(c, t);
  const list = sp(c.__els['#rtList'].innerHTML);
  assert.ok(list.includes(`<b>${time}</b> <span class="faint">(jízdní řád; autem ~${hm(x.carMin)})</span>`), list.slice(list.indexOf('rt-tr'), list.indexOf('rt-tr') + 300));
  // krok Auto: vlakem mezi místy
  const car = render(c, { ...t, step: 'car' });
  assert.ok(car.includes(`Vídeň → Salcburk · 🚆 ${time} (jízdní řád) · <a href=`), car.slice(car.indexOf('rt-trains'), car.indexOf('rt-trains') + 300));
  assert.ok(car.includes('Čas je odhad (u přímého vlaku podle jízdního řádu) – skutečné spoje ukáže odkaz'));
  // shrnutí, kalendář a poznámky v plánovači
  const s = render(c, { ...t, step: 'summary' });
  assert.ok(s.includes(`Přejezd Vídeň → Salcburk · ${time} (jízdní řád)`), s.slice(s.indexOf('Přejezd'), s.indexOf('Přejezd') + 200));
  const cal = plain(c.window.Trip.calendarEvents({ ...t, step: 'summary' })).find((e) => /Přejezd/.test(e.title));
  assert.match(cal.description, /~\d.* vlakem \(jízdní řád\)/);
  assert.ok(!cal.description.includes('vlakem / busem'), cal.description);
  vm.runInContext("var byIso = { AT: { cs: 'Rakousko' } }; var PACK = ['Pas']; S.trips = [];", c);
  c.__els['#sumSave'].onclick();
  assert.ok(c.S.trips[0].notes.split('\n').includes(`Přejezd Vídeň → Salcburk: ~${hmNb(x.transitMin)} vlakem (jízdní řád)`), c.S.trips[0].notes);
  // odhad (bez fast) a autem beze změny
  delete x.fast;
  render(c, t);
  assert.ok(sp(c.__els['#rtList'].innerHTML).includes(`<b>~${hm(x.transitMin)} vlakem / busem</b> <span class="faint">(odhad; autem ~${hm(x.carMin)})</span>`));
  assert.ok(!render(c, { ...t, step: 'car' }).includes('jízdního řádu'));
  x.fast = true;
  render(c, { ...t, route: { ...t.route, transport: 'car' } });
  assert.ok(sp(c.__els['#rtList'].innerHTML).includes(`<b>${x.km} km · ~${hm(x.carMin)} autem</b> <span class="faint">(odhad; 🚆 vlakem ~${hm(x.transitMin)})</span>`), 'autem je čas dál odhad');
});

test('průvodce: zpět k letu s jiným termínem – poslední hlášení řekne, že vybraný hotel je pryč', () => {
  const c = load();
  // vlak 11.–15. 11., hotel vybraný na ty dny; let je 10.–14. 11.
  const t = trip({ route: null, step: 'flight', stay: { mode: 'pick', id: 'h1', name: 'Hotel Wien', totalCzk: 8000 }, car: { mode: 'manual', totalCzk: 3000, from: '2026-11-11T11:00', to: '2026-11-15T16:00', pickup: 'VIE', dropoff: 'VIE' } });
  const h = render(c, t);
  assert.match(h, /✈️ Radši letět \(PRG → VIE\)/);
  c.__els['#ovFly'].onclick();
  assert.equal(t.overland.on, false);
  assert.equal(t.stay, null, 'hotel na jiné dny se zahodí');
  assert.equal(t.car, null);
  assert.equal(c.__toasts.at(-1), 'Termín pobytu se změnil – vyber ubytování znovu', `hlášení: ${c.__toasts.join(' | ')}`);
  // beze změny termínu jen „Zpět k letu“
  const same = trip({ route: null, step: 'flight', overland: OV({ out: { ...OV().out, date: '2026-11-10', dep: '2026-11-10T06:01', arr: '2026-11-10T10:21' }, back: { ...OV().back, date: '2026-11-14', dep: '2026-11-14T17:00', arr: '2026-11-14T21:20' } }), stay: { mode: 'pick', id: 'h1', name: 'Hotel Wien', totalCzk: 8000 } });
  render(c, same);
  c.__els['#ovFly'].onclick();
  assert.deepEqual(plain(c.__toasts), ['Zpět k letu']);
  assert.equal(same.stay.name, 'Hotel Wien');
});

test('průvodce: vlak/bus jen tam u zpátečního letu – krok Let řekne, že let zpět se nepočítá', () => {
  const c = load();
  const h = render(c, trip({ route: null, step: 'flight', overland: OV({ back: null }) }));
  assert.match(h, /Let zpět \(VIE → PRG\) se nepočítá – byl součástí letenky\. Cestu zpět si zařiď zvlášť, nebo v <b>🔄 Změnit spoje<\/b> zaškrtni „i zpět vlakem \/ busem“\./);
  assert.ok(!render(c, trip({ route: null, step: 'flight' })).includes('se nepočítá – byl součástí letenky'), 'vlak i zpět: bez poznámky');
  const ow = trip({ route: null, step: 'flight', overland: OV({ back: null }) });
  ow.flight = { ...ow.flight, back: null };
  assert.ok(!render(c, ow).includes('se nepočítá – byl součástí letenky'), 'let jen tam: není co vysvětlovat');
});

test('sanitizeTrip: „Je to dobrá cena?“ ze sdíleného odkazu – statistika jen s čísly a daty, neznámá úroveň ceny pryč', () => {
  const c = load();
  const { Trip } = c.window;
  const stats = { n: 12, min: 1500, p25: 1800, median: 2100, p75: 2600, max: 4100, dateFrom: '2026-11-10', dateTo: '2026-11-12' };
  const pl = { level: 'low', basis: 'search', reason: 'levnější než 80 % nabídek do tohoto cíle', ref: 2400, vsRef: -30, pos: 20, n: 12 };
  const base = () => ({ ...trip({ route: null }), priceStats: { ...stats, mins: [['PRG', '2026-11', 1500]], x: 'y' } });
  const ok = Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...base(), flight: { ...base().flight, priceLevel: pl } })));
  assert.deepEqual(plain(ok.priceStats), stats);
  assert.deepEqual(plain(ok.flight.priceLevel), pl);
  for (const bad of [{ level: 'constructor', reason: 'x', ref: 1, vsRef: 1 }, { level: 'low', reason: 'x', ref: '1', vsRef: 1 }, { level: 'high', reason: 'x', ref: 1, vsRef: 1, pos: 'x' }, 'low']) {
    const t = Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...base(), flight: { ...base().flight, priceLevel: bad } })));
    assert.equal(t.flight.priceLevel, undefined, JSON.stringify(bad));
  }
  for (const bad of [{ ...stats, dateFrom: 5 }, { ...stats, median: 'x' }, { ...stats, n: -1 }, [1, 2], 'x']) {
    assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...base(), priceStats: bad }))).priceStats, null, JSON.stringify(bad));
  }
});

test('cena letu v průvodci: „cena z …“ z času výsledku v kroku Let i ve Shrnutí, po dni u nezakoupeného letu „↻ Ověř cenu“ jen na klepnutí; odkaz čas nese, nesmysl zahodí', async () => {
  const c = load();
  vm.runInContext(src('searchhelp.js'), c, { filename: 'searchhelp.js' });
  c.SearchHelp = c.window.SearchHelp;
  c.window.scrollTo = () => {};
  const { Trip, SearchHelp: H } = c.window;
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }; // dnešek i s posunutým datem (SHIFT_DAYS)
  const fl = { id: 'x1', out: leg('PRG', 'VIE', day(30), '07:00', '08:00', 'Europe/Prague', 'Europe/Vienna'), back: leg('VIE', 'PRG', day(34), '19:00', '20:00', 'Europe/Vienna', 'Europe/Prague'), flightCzk: 1170, groundCzk: 0, bagCzk: 0 };
  const res = { query: { adults: 2, bags: 'none' }, origins: [], groups: [] };
  const ageTxt = (t) => { const a = H.resultAge(t.flight.pricedAt, Date.now()); return `cena ${a.z} ${a.txt}`; };
  // čas výsledku hledání (i obnoveného před 2 h) → cena z něj; nabídka ve výpisu se nemění
  const at = Date.now() - 2 * 36e5;
  Trip.start({ t: fl, g: null, result: res, at });
  const t = c.S.trip;
  assert.equal(t.flight.pricedAt, at);
  assert.equal(fl.pricedAt, undefined, 'nabídka ve výpisu (a uložené výsledky) bez času');
  t.verifiedAt = 1; // automatické ověření proběhlo při prvním otevření (jednou za cestu, beze změny)
  const calls = [];
  const alt = { out: fl.out, back: fl.back, flightCzk: 1350, bookUrl: 'https://kiwi.example/b' };
  c.fetch = async (u) => { calls.push(String(u)); return { ok: true, json: async () => ({ available: true, items: [alt] }) }; };
  let h = render(c, t);
  assert.ok(h.includes(`<div class="faint tf-age">${ageTxt(t)}</div>`), h.slice(h.indexOf('Letenky'), h.indexOf('Letenky') + 400));
  assert.match(ageTxt(t), /^cena ze? (včera )?\d{1,2}:\d\d \(před 2 h\)$/);
  assert.ok(!h.includes('Ověř cenu'), 'mladší než den: jen čas');
  // bez času z výsledku od teď; čas z budoucnosti se nebere
  for (const x of [undefined, 0, Date.now() + 864e5]) {
    c.S.trip = null;
    const t0 = Date.now();
    Trip.start({ t: fl, g: null, result: res, at: x });
    assert.ok(c.S.trip.flight.pricedAt >= t0 && c.S.trip.flight.pricedAt <= Date.now(), String(x));
    assert.equal(c.S.trip.flight.pricedAt, c.S.trip.created);
  }
  c.S.trip = t;
  // starší než den: „(před 8 dny)“ + „↻ Ověř cenu“, ale samo se nic neověřuje (otevření cesty, další kroky)
  const d8 = new Date(); d8.setDate(d8.getDate() - 8); d8.setHours(14, 12, 0, 0);
  t.flight.pricedAt = d8.getTime();
  h = render(c, t);
  assert.ok(ageTxt(t).endsWith(' 14:12 (před 8 dny)'), ageTxt(t));
  assert.ok(h.includes(`<div class="faint tf-age">${ageTxt(t)} · <button type="button" class="linkbtn" id="tfAge">↻ Ověř cenu</button></div>`));
  const s0 = render(c, { ...t, step: 'summary' });
  assert.ok(s0.includes(`Letenky (2 os.)<div class="faint tf-age">${ageTxt(t)} · <button type="button" class="linkbtn" id="sumAge">↻ Ověř cenu</button></div></td>`), s0.slice(s0.indexOf('Letenky'), s0.indexOf('Letenky') + 300));
  assert.equal(calls.length, 0, 'žádné ověření bez klepnutí');
  // klepnutí = dosavadní ruční ověření (Kiwi.com): nabídky pod letem, cena letu se sama nepřepíše
  c.S.trip = t; t.step = 'flight'; render(c, t);
  c.__els['#tfAge'].onclick();
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^api\/verify\?from=PRG&to=VIE&out=/);
  assert.equal(t.flight.flightCzk, 1170);
  assert.equal(t.flight.pricedAt, d8.getTime(), 'ověření bez „Použít“ čas ceny nemění');
  // ve Shrnutí: na krok Let a ověřit (jednou)
  t.step = 'summary'; render(c, t);
  c.__els['#sumAge'].onclick();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([t.step, calls.length], ['flight', 2]);
  // zakoupený let (odškrtnutý v „Co zarezervovat“), odlet v minulosti, vlak/bus místo letu: bez „↻ Ověř cenu“
  assert.ok(!render(c, { ...t, booked: { flight0: true } }).includes('Ověř cenu'));
  assert.ok(render(c, { ...t, booked: { flight0: true } }).includes(ageTxt(t)), 'čas ceny zůstane');
  assert.ok(!render(c, { ...t, flight: { ...t.flight, out: { ...t.flight.out, date: day(-1) } } }).includes('Ověř cenu'));
  assert.ok(!render(c, { ...t, overland: OV(), step: 'summary' }).includes('tf-age'));
  // starší cesta bez času: nic
  const old = { ...t, flight: { ...t.flight, pricedAt: undefined } };
  assert.ok(!render(c, old).includes('tf-age') && !render(c, { ...old, step: 'summary' }).includes('tf-age'));
  // tentýž let za stejnou cenu z novějšího hledání: cena k jeho času; za jinou cenu (nebo ze staršího) beze změny
  c.S.trip = t;
  Trip.start({ t: { ...fl, flightCzk: 1300 }, g: null, result: res, at: Date.now() - 6e4 });
  assert.equal(t.flight.pricedAt, d8.getTime());
  Trip.start({ t: fl, g: null, result: res, at: d8.getTime() - 864e5 });
  assert.equal(t.flight.pricedAt, d8.getTime());
  Trip.start({ t: fl, g: null, result: res, at: Date.now() - 6e4 });
  assert.equal(c.S.trip, t, 'pořád tatáž cesta');
  assert.ok(Date.now() - t.flight.pricedAt < 7e4 && !render(c, t).includes('Ověř cenu'));
  // sdílený odkaz čas ceny nese (příjemce ví, jak stará cena je); sanitizeTrip pustí jen rozumný čas
  let link = null;
  c.ShareLink = c.window.ShareLink = { prepare: (k, json) => { link = json; } };
  t.flight.pricedAt = d8.getTime();
  render(c, { ...t, step: 'summary' });
  assert.equal(JSON.parse(link).flight.pricedAt, d8.getTime());
  assert.equal(Trip.sanitizeTrip(JSON.parse(link)).flight.pricedAt, d8.getTime());
  for (const bad of ['1760000000000', 0, -5, 12345, Date.now() + 3 * 864e5, { x: 1 }, null]) {
    assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...JSON.parse(link), flight: { ...JSON.parse(link).flight, pricedAt: bad } }))).flight.pricedAt, undefined, JSON.stringify(bad));
  }
  // odkaz na tutéž cestu jen s jiným časem ceny (tentýž let vybraný znovu) je pořád tatáž cesta – otevře se ta rozpracovaná
  c.S.trip = t; c.__toasts.length = 0;
  c.location = { hash: '#trip=abc' }; c.history = { replaceState() {} };
  c.ShareLink.unpack = async () => JSON.stringify({ ...JSON.parse(link), flight: { ...JSON.parse(link).flight, pricedAt: d8.getTime() - 5 * 864e5 } });
  assert.equal(await Trip.importFromHash(), true);
  assert.deepEqual([c.S.trip === t, t.flight.pricedAt, plain(c.__toasts)], [true, d8.getTime(), ['Tuhle cestu už máš rozpracovanou – otevírám ji']]);
  // „Použít“ u živé nabídky: nová cena platí od teď
  t.step = 'flight'; render(c, t);
  c.__els['#tfVerify'].onclick();
  await new Promise((r) => setImmediate(r));
  c.__all['[data-alt]'] = [{ dataset: { alt: '0' } }];
  c.__els['#tfVerify'].onclick();
  await new Promise((r) => setImmediate(r));
  const t1 = Date.now();
  c.__all['[data-alt]'][0].onclick();
  assert.equal(c.S.trip.flight.flightCzk, 1350);
  assert.ok(c.S.trip.flight.pricedAt >= t1 && c.S.trip.flight.pricedAt <= Date.now());
});

test('cena letu v průvodci: cena z paměti tras (memAgeMin, „⏱ cena před 5 h“) je o své stáří starší; otevřený průvodce „cena z …“ obnoví (Trip.ageRefresh), odškrtnutá letenka hned bez „↻ Ověř cenu“', async () => {
  const c = load();
  vm.runInContext(src('searchhelp.js'), c, { filename: 'searchhelp.js' });
  c.SearchHelp = c.window.SearchHelp;
  c.window.scrollTo = () => {};
  const { Trip, SearchHelp: H } = c.window;
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const wz = (o, b) => ({ id: 'w1', out: { ...leg('BUD', 'LTN', day(30), '07:00', '08:40', 'Europe/Budapest', 'Europe/London'), provider: 'wizzair', ...(o !== undefined ? { memAgeMin: o } : {}) },
    back: { ...leg('LTN', 'BUD', day(34), '19:00', '22:30', 'Europe/London', 'Europe/Budapest'), provider: 'wizzair', ...(b !== undefined ? { memAgeMin: b } : {}) }, flightCzk: 990, groundCzk: 0, bagCzk: 0 });
  const res = { query: { adults: 1, bags: 'none' }, origins: [], groups: [] };
  const ageTxt = (t) => { const a = H.resultAge(t.flight.pricedAt, Date.now()); return `cena ${a.z} ${a.txt}`; };
  // výsledek hledání před 10 min, cena letu tam z paměti tras 5 h stará (zpět 2 h): cena je stará 5 h 10 min
  const at = Date.now() - 10 * 6e4;
  Trip.start({ t: wz(300, 120), g: null, result: res, at });
  const t = c.S.trip;
  assert.equal(t.flight.pricedAt, at - 300 * 6e4, 'nejstarší z letu tam a zpět');
  assert.match(ageTxt(t), /^cena ze? (včera )?\d{1,2}:\d\d \(před 5 h\)$/);
  // jen let zpět z paměti; bez času výsledku od teď minus stáří; nesmysl jako čerstvá cena
  for (const [o, b, min, x] of [[undefined, 90, 90, at], ['45', undefined, 45, at], ['abc', -5, 0, at], [Infinity, null, 0, at], [300, 120, 300, 0], [300, 120, 300, Date.now() + 864e5]]) {
    c.S.trip = null;
    const t0 = Date.now();
    Trip.start({ t: wz(o, b), g: null, result: res, at: x });
    const p = c.S.trip.flight.pricedAt;
    if (x === at) assert.equal(p, at - min * 6e4, JSON.stringify([o, b]));
    else assert.ok(p >= t0 - min * 6e4 && p === c.S.trip.created - min * 6e4, String(x));
  }
  // tentýž let z novějšího hledání (paměť pořád 5 h): čas z něj minus stáří; bez času výsledku beze změny
  c.S.trip = t;
  const at2 = Date.now() - 6e4;
  Trip.start({ t: wz(300, 120), g: null, result: res, at: at2 });
  assert.deepEqual([c.S.trip === t, t.flight.pricedAt], [true, at2 - 300 * 6e4]);
  Trip.start({ t: wz(300, 120), g: null, result: res, at: 0 });
  assert.equal(t.flight.pricedAt, at2 - 300 * 6e4);

  // Průvodce zůstal otevřený na kroku Let (Android drží aplikaci): návrat do aplikace / 5min tik přepíše jen řádek s časem
  t.verifiedAt = 1;
  const calls = [];
  c.fetch = async (u) => { calls.push(String(u)); return { ok: true, json: async () => ({ available: true, items: [] }) }; };
  render(c, t);
  const el = c.$('#tripStep .tf-age'), alt = c.$('#tfAlt');
  alt.innerHTML = 'nabídky z ověření';
  assert.equal(Trip.ageRefresh(), true);
  assert.equal(sp(el.outerHTML), `<div class="faint tf-age">${ageTxt(t)}</div>`, 'mladší než den: jen čas');
  // o den a půl později (čas ceny o 36 h dřív): „před …“ znovu a „↻ Ověř cenu“, klepnutí ověří; výsledek ověření zůstal
  t.flight.pricedAt -= 36 * 36e5;
  assert.equal(Trip.ageRefresh(), true);
  assert.equal(sp(el.outerHTML), `<div class="faint tf-age">${ageTxt(t)} · <button type="button" class="linkbtn" id="tfAge">↻ Ověř cenu</button></div>`);
  assert.match(ageTxt(t), /\(před (4\d h|2 dny)\)$/);
  assert.equal(alt.innerHTML, 'nabídky z ověření');
  assert.equal(calls.length, 0, 'samo se nic neověřuje');
  c.__els['#tfAge'].onclick();
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1);
  // Shrnutí: totéž s id sumAge; odškrtnutá letenka → hned bez „↻ Ověř cenu“ (čas zůstane), zrušené odškrtnutí → zpět
  const fb = { dataset: { bk: 'flight0' }, checked: true }, sb = { dataset: { bk: 'stay' }, checked: true };
  c.__all['[data-bk]'] = [fb, sb];
  t.step = 'summary'; render(c, t);
  assert.equal(Trip.ageRefresh(), true);
  assert.ok(el.outerHTML.includes('id="sumAge">↻ Ověř cenu</button>'), el.outerHTML);
  fb.onchange();
  assert.equal(t.booked.flight0, true);
  assert.equal(sp(el.outerHTML), `<div class="faint tf-age">${ageTxt(t)}</div>`);
  fb.checked = false; fb.onchange();
  assert.ok(el.outerHTML.includes('id="sumAge">↻ Ověř cenu</button>'));
  el.outerHTML = 'beze změny';
  sb.onchange();
  assert.deepEqual([t.booked.stay, el.outerHTML], [true, 'beze změny'], 'jiné odškrtnutí řádek s cenou letu nepřepisuje');
  // ↻ ve Shrnutí → krok Let a ověření (jednou, i u cesty, která se ještě neověřovala – třeba ze sdíleného odkazu)
  render(c, t);
  c.__els['#sumAge'].onclick();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([t.step, calls.length], ['flight', 2]);
  delete t.verifiedAt; t.step = 'summary'; render(c, t);
  c.__els['#sumAge'].onclick();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([t.step, calls.length, t.verifiedAt > 0], ['flight', 3, true]);
  // jiný krok, průvodce není na obrazovce, bez cesty: nic
  t.step = 'stay';
  assert.equal(Trip.ageRefresh(), false);
  t.step = 'flight';
  const $0 = c.$;
  c.$ = (s) => (s === '#view-trip.active' ? null : $0(s));
  assert.equal(Trip.ageRefresh(), false);
  c.$ = $0;
  c.S.trip = null;
  assert.equal(Trip.ageRefresh(), false);
});

test('průvodce: let s přestupem – krok Let i průběh cesty ukážou kde (k zemi „jen přestup“ v 🛂 Před cestou)', () => {
  const c = load();
  const t = trip({ route: null, overland: null, step: 'flight', dest: { label: 'Cancún', country: 'Mexiko', cc: 'MX' } });
  t.flight.out = { ...t.flight.out, to: 'CUN', stops: 1, layovers: [{ at: 'JFK', min: 150, cc: 'US' }] };
  t.flight.back = { ...t.flight.back, from: 'CUN', stops: 2, layovers: [{ at: 'YYZ', min: 65, cc: 'CA' }, { at: 'FRA<b>', min: 'x' }] };
  const h = render(c, t);
  assert.match(h, /<div class="tl-meta">Demo Air · DA 1 · 1× přestup \(JFK 2 h 30 min\)<\/div>/);
  assert.match(h, /<div class="tl-meta">Demo Air · DA 1 · 2× přestup \(YYZ 1 h 5 min, FRA&lt;b&gt;\)<\/div>/, 'texty z dat escapované');
  const s = render(c, { ...t, step: 'summary' });
  // průběh cesty jako krok Let: dopravce, číslo letu (tabule na letišti) a přestupy
  assert.match(s, /🛫<\/span><span>PRG 07:00 → CUN 08:00 · Demo Air · DA 1 · 1× přestup \(JFK 2 h 30 min\)<\/span>/);
  assert.match(s, /🛬<\/span><span>CUN 19:00 → PRG 20:00 · Demo Air · DA 1 · 2× přestup/, 'i přílet zpět');
  // přímý let beze změny
  assert.match(render(c, trip({ route: null, overland: null })), /🛫<\/span><span>PRG 07:00 → VIE 08:00 · Demo Air · DA 1<\/span>/);
});

test('průvodce: přílet / příjezd další den má „+1“ jako ve výsledcích (noční let, noční bus)', () => {
  const c = load();
  const t = trip({ route: null, overland: null, step: 'flight' });
  t.flight.out = { ...t.flight.out, dep: '2026-11-10T21:25:00', arr: '2026-11-11T00:51:00' };
  assert.match(render(c, t), /<b>21:25<\/b><small>PRG<\/small><\/span><i class="tl-line" aria-hidden="true"><\/i><span><b>00:51 \+1<\/b><small>VIE<\/small>/);
  assert.match(render(c, { ...t, step: 'summary' }), /PRG 21:25 → VIE 00:51 \+1 · Demo Air/);
  // noční bus zpět: krok Let, shrnutí i odkaz do Google Kalendáře
  const ov = OV({ back: { ...OV().back, dep: '2026-11-15T22:40', arr: '2026-11-16T06:28', kinds: ['BUS'] } });
  const o = trip({ route: null, step: 'flight', overland: ov });
  assert.match(render(c, o), /Zpět: Vídeň → Praha<\/b> · ne 15\. 11\. 22:40 → 06:28 \+1/);
  assert.match(render(c, { ...o, step: 'summary' }), /🚌<\/span><span>Vídeň → Praha · 22:40 → 06:28 \+1 · bus/);
  assert.match(c.window.Trip.tripEvent(o).description, /🚌 Vídeň → Praha 22:40 → 06:28 \+1/);
  assert.doesNotMatch(render(c, { ...o, step: 'summary' }), /06:01 → 10:21 \+/, 'týž den bez +1');
});

test('průběh cesty: noční let – z letiště na 1. místo až v den příletu, zpět i s časem příletu a domů v den přistání', () => {
  const c = load();
  const t = trip({ overland: null, ground: { out: { minutes: 45 }, back: { minutes: 45 } } });
  t.flight.out = { ...t.flight.out, dep: '2026-11-10T21:25:00', arr: '2026-11-11T00:51:00' };
  t.flight.back = { ...t.flight.back, dep: '2026-11-14T23:30:00', arr: '2026-11-15T00:40:00' };
  const s = render(c, t);
  const row = (day, text) => new RegExp(`<span class="tl-d">${day}</span><span class="tl-i">[^<]*</span><span>${text}`);
  assert.match(s, row('út 10\\. 11\\.', 'Cesta na letiště PRG'));
  assert.match(s, row('út 10\\. 11\\.', 'PRG 21:25 → VIE 00:51 \\+1'));
  assert.match(s, row('st 11\\. 11\\.', 'Z letiště VIE → Vídeň'), 'přejezd z letiště v den příletu');
  assert.match(s, row('so 14\\. 11\\.', 'VIE 23:30 → PRG 00:40 \\+1 · Demo Air'), 'let zpět i s příletem');
  assert.match(s, row('ne 15\\. 11\\.', 'Cesta z letiště PRG domů'), 'domů v den přistání');
  assert.doesNotMatch(s, row('út 10\\. 11\\.', 'Z letiště VIE'));
});

test('průvodce: západní Afrika – čas podle trasy, autobusem / minibusem (ne vlakem), přechod hranice; sdílený odkaz', () => {
  const c = load();
  vm.runInContext("var byIso = { NG: { cs: 'Nigérie' }, BJ: { cs: 'Benin' } };", c);
  const bases = [
    { id: 'city:LOS', name: 'Lagos', lat: 6.455, lon: 3.3841, cc: 'NG', country: 'Nigérie', anchor: 'arrival', nights: 2, stay: null, plan: null },
    { id: 'Q3799', name: 'Porto Novo', nameEn: 'Porto-Novo', lat: 6.4969, lon: 2.6289, cc: 'BJ', country: 'Benin', nights: 2, stay: null, plan: null },
    { id: 'Q193', name: 'Abeokuta', lat: 7.1557, lon: 3.3451, cc: 'NG', country: 'Nigérie', nights: 2, stay: null, plan: null },
  ];
  // časy z trasy autem (BRouter) jako ze serveru
  const routes = new Map([[routeKey(bases[0], bases[1]), { km: 122.5, min: 123 }], [routeKey(bases[1], bases[2]), { km: 208.1, min: 184 }]]);
  const LOS = { iata: 'LOS', name: 'Lagos (LOS)', lat: 6.5774, lon: 3.3212, cc: 'NG' };
  const ev = (transport) => evaluateRoute(bases, { arrival: LOS, departure: LOS, transport, routes });
  const t = trip({
    overland: null, step: 'route', dest: { label: 'Lagos', country: 'Nigérie', cc: 'NG', lat: 6.5774, lon: 3.3212 },
    flight: { ...trip().flight, out: leg('PRG', 'LOS', '2026-11-10', '07:00', '15:00', 'Europe/Prague', 'Africa/Lagos'), back: leg('LOS', 'PRG', '2026-11-16', '20:00', '05:00', 'Africa/Lagos', 'Europe/Prague') },
    route: { mode: 'multi', transport: 'car', want: 3, exclude: [], candidates: [], arrival: LOS, departure: LOS, bases, ...ev('car') },
  });
  const list = () => sp(c.__els['#rtList'].innerHTML);
  render(c, t);
  let h = list();
  // u přejezdu čas i cena zvolenou dopravou (palivo a mýtné), v závorce druhá doprava s jízdenkami za oba
  assert.match(h, /<b>123 km · ~3 h 25 min autem · ~\d[\d ]* Kč<\/b> <span class="faint">\(podle trasy; 🚌 autobusem \/ minibusem ~6 h 10 min, ~\d[\d ]* Kč za 2 os\.\)<\/span>/, h.slice(h.indexOf('rt-tr'), h.indexOf('rt-tr') + 400));
  assert.ok(h.includes('🛂 přechod hranice Nigérie → Benin – počítej s kontrolou a vízem – ověř podmínky vstupu'));
  assert.ok(h.includes('🛂 přechod hranice Benin → Nigérie'));
  assert.ok(!/vlakem/.test(h), 'v Beninu ani Nigérii vlakem nejezdí');
  assert.ok(h.includes('trasa v Google Maps ↗'));
  assert.ok(sp(c.__els['#tripStep'].innerHTML).length > 0);
  // veřejnou dopravou: autobus / minibus, odkaz „ověř spoje“
  Object.assign(t.route, { transport: 'transit' }, ev('transit'));
  render(c, t);
  h = list();
  assert.ok(h.includes('<span class="rt-ic">🚌</span>'));
  assert.match(h, /<b>~6 h 10 min autobusem \/ minibusem · ~\d[\d ]* Kč za 2 os\.<\/b> <span class="faint">\(odhad; autem ~3 h 25 min, ~\d[\d ]* Kč\)<\/span>/);
  assert.ok(h.includes('ověř spoje v Google Maps ↗'));
  assert.ok(t.route.transfers[0].long && t.route.transfers[1].long, 'přes 3 h 45 min veřejnou dopravou = dlouhý přejezd');
  // shrnutí a kalendář: stejné časy, hranice v časové ose
  const s = render(c, { ...t, step: 'summary' });
  assert.ok(s.includes('Přejezd Lagos → Porto Novo · ~6 h 10 min autobusem / minibusem (odhad) · 🛂 hranice Nigérie → Benin'), s.slice(s.indexOf('Přejezd'), s.indexOf('Přejezd') + 200));
  const cal = plain(c.window.Trip.calendarEvents(t)).filter((e) => /Přejezd/.test(e.title));
  assert.deepEqual(cal.map((e) => [e.title, e.durationMin]), [['🚌 Přejezd Lagos → Porto Novo', 370], ['🚌 Přejezd Porto Novo → Abeokuta', 410]]);
  assert.match(cal[0].description, /🛂 Přechod hranice Nigérie → Benin/);
  // Lagos → Cotonou → Porto Novo: cesta z posledního místa na letiště vede přes hranici – i v časové ose a v plánovači
  const b2 = [bases[0], { id: 'Q43595', name: 'Cotonou', lat: 6.3654, lon: 2.4183, cc: 'BJ', country: 'Benin', nights: 2, stay: null, plan: null }, { ...bases[1] }];
  const ev2 = evaluateRoute(b2, { arrival: LOS, departure: LOS, transport: 'car' });
  const t2 = { ...t, step: 'summary', route: { ...t.route, transport: 'car', bases: b2, ...ev2, legs: { arrival: { ...ev2.legs.arrival, carMin: 50 }, departure: { ...ev2.legs.departure, carMin: 190 } } } };
  const dep = t2.route.legs.departure;
  assert.deepEqual(dep.border, { from: 'BJ', to: 'NG' });
  const s2 = render(c, t2);
  assert.ok(s2.includes(`Porto Novo → letiště LOS · ${dep.km} km · ~3 h 10 min autem (odhad) · 🛂 hranice Benin → Nigérie`), s2.slice(s2.indexOf('Porto Novo → letiště'), s2.indexOf('Porto Novo → letiště') + 160));
  vm.runInContext("var PACK = ['Pas']; S.trips = [];", c);
  c.__els['#sumSave'].onclick();
  const x0 = t2.route.transfers[0];
  const notes = c.S.trips[0].notes.split('\n');
  assert.ok(notes.includes(`Přejezd Lagos → Cotonou: ${x0.km}\u00a0km · ~${hmNb(x0.carMin)} autem (odhad) · 🛂 hranice Nigérie → Benin`), notes.join('\n'));
  assert.ok(notes.includes(`Přejezd Porto Novo → letiště LOS: ${dep.km}\u00a0km · ~3\u00a0h 10\u00a0min autem (odhad) · 🛂 hranice Benin → Nigérie`));
  assert.ok(notes.some((n) => n.startsWith('Přejezd letiště LOS → Lagos: ')));
  // program: cestu z/na letiště nad hodinu (kterou kryje rezerva programu) ubere z prvního a posledního dne
  const [p0, p2] = [0, 2].map((i) => c.window.Trip.baseProgram(t2, i));
  assert.equal(p0.arrivalTime, '15:00', 'z letiště 50 min – stačí rezerva 1,5 h po příletu');
  assert.equal(p2.departureTime, '17:45', 'odlet 20:00, na letiště 3 h 10 min → program jako před odletem v 17:45 (do 14:45)');
  const far = { ...t2, route: { ...t2.route, legs: { ...t2.route.legs, arrival: { ...t2.route.legs.arrival, carMin: 200 } } } };
  assert.equal(c.window.Trip.baseProgram(far, 0).arrivalTime, '17:30', 'přílet 15:00 + 3 h 20 min cesty');
  // sdílený odkaz: nová pole přejezdu se zachovají, škodlivá pryč
  const raw = JSON.parse(JSON.stringify(t));
  raw.route.transfers[1] = { ...raw.route.transfers[1], transitKind: '<b>', basis: 'x', border: { from: 'BJ', to: 'N<' }, hsr: 'yes' };
  Object.assign(raw.route.transfers[0], { fast: true }); // přímý vlak z tabulky spojů
  Object.assign(raw.route.transfers[1], { fast: 'yes' });
  raw.route.groundLegs = { key: '1,2|3,4|5,6', arrival: raw.route.transfers[0], departure: null, extra: 1 };
  Object.assign(raw.route.bases[1], { gid: 2392087 });
  Object.assign(raw.route.bases[2], { gid: '1;drop' });
  const r = plain(c.window.Trip.sanitizeTrip(raw).route);
  assert.deepEqual(r.bases.map((b) => b.gid), [undefined, 2392087, undefined], 'ID GeoNames jen jako celé číslo');
  assert.deepEqual([r.transfers[0].transitKind, r.transfers[0].basis, r.transfers[0].border], ['bus', 'route', { from: 'NG', to: 'BJ' }]);
  assert.deepEqual([r.transfers[1].transitKind, r.transfers[1].basis, r.transfers[1].border, r.transfers[1].hsr], [undefined, 'estimate', null, undefined], 'neznámý druh dopravy → přepočítá se');
  assert.deepEqual([r.transfers[0].fast, r.transfers[1].fast], [true, undefined], 'příznak přímého vlaku jen jako true');
  assert.deepEqual(Object.keys(r.groundLegs), ['key', 'arrival', 'departure']);
  assert.equal(r.groundLegs.arrival.carMin, t.route.transfers[0].carMin);
  raw.route.groundLegs.key = '<script>';
  assert.equal(c.window.Trip.sanitizeTrip(raw).route.groundLegs, null);
});

test('kdy vyrazit: z domu na let tam a z ubytování na let zpět – průběh cesty i kalendář (odhad, 2 h před odletem)', () => {
  const c = load();
  vm.runInContext(`${src('searchhelp.js')}\nvar SearchHelp = window.SearchHelp;`, c, { filename: 'searchhelp.js' }); // předložky „ve 3:15“ / „v 1:35“
  const AB = { out: null, back: { iata: 'VIE', city: 'Vídeň', how: 'vlak S7', min: 40, czk: 120, mode: 'train', basis: 'table', lat: 48.2, lon: 16.37 } };
  const t = trip({ route: null, overland: null, ground: { out: { minutes: 45 }, back: { minutes: 45 } }, arrival: AB });
  t.flight.out = { ...t.flight.out, dep: '2026-11-10T06:00:00', arr: '2026-11-10T07:00:00' };
  t.flight.back = { ...t.flight.back, dep: '2026-11-14T07:00:00', arr: '2026-11-14T08:00:00' };
  const { leaveBy } = c.window.Trip;
  const lb = plain(leaveBy(t));
  assert.deepEqual(lb.home, { date: '2026-11-10', hm: '03:15', min: 45, airport: 'PRG', before: 120, hint: null }, 'odlet 6:00 − 2 h − 45 min');
  assert.deepEqual([lb.hotel.date, lb.hotel.hm, lb.hotel.min, lb.hotel.airport, lb.hotel.before], ['2026-11-14', '04:00', 60, 'VIE', 120]);
  assert.match(lb.hotel.hint, /^brzy ráno – taxi objednej předem/);
  // odlet krátce po půlnoci → z domu předchozí večer; odlet zpět večer → po check-outu
  const late = { ...t, flight: { ...t.flight, out: { ...t.flight.out, dep: '2026-11-10T00:40:00', arr: '2026-11-10T01:40:00' }, back: { ...t.flight.back, dep: '2026-11-14T18:00:00', arr: '2026-11-14T19:00:00' } } };
  const lb2 = plain(leaveBy(late));
  assert.deepEqual([lb2.home.date, lb2.home.hm], ['2026-11-09', '21:55']);
  assert.deepEqual([lb2.hotel.date, lb2.hotel.hm], ['2026-11-14', '15:00'], 'jízda 40 min + 20 min na zastávku a čekání');
  assert.match(lb2.hotel.hint, /^check-out bývá do 11:00 – zavazadla nech na recepci/);
  const night = plain(leaveBy({ ...t, flight: { ...t.flight, back: { ...t.flight.back, date: '2026-11-15', dep: '2026-11-15T00:30:00', arr: '2026-11-15T01:30:00' } } }).hotel);
  assert.deepEqual([night.date, night.hm, night.hint], ['2026-11-14', '21:30', null], 'noční let: z ubytování předchozí večer, bez rady o check-outu');
  // průběh cesty: z domu před cestou na letiště, z ubytování před cestou z města na letiště
  const rows = (h) => [...h.matchAll(/<div class="tl-row"><span class="tl-d">([^<]*)<\/span><span class="tl-i">([^<]*)<\/span><span>(.*?)<\/span><\/div>/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
  const r1 = rows(render(c, t));
  const at = (re) => r1.findIndex((r) => re.test(r));
  assert.equal(r1[0], 'út 10. 11. 🚪 Vyraž z domu nejpozději ve 3:15 <span class="faint">(~45 min na letiště PRG + 2 h před odletem, odhad)</span>', r1.join('\n'));
  assert.ok(at(/^út 10\. 11\. 🚆 Cesta na letiště PRG/) === 1 && at(/🛫 PRG 06:00/) === 2, r1.join('\n'));
  const h = at(/🚪 Z ubytování/);
  assert.equal(r1[h], 'so 14. 11. 🚪 Z ubytování na letiště VIE vyraž nejpozději ve 4:00 <span class="faint">(~1 h cesta + 2 h před odletem, odhad)</span> · brzy ráno – taxi objednej předem, nebo přespi u letiště');
  assert.match(r1[h + 1], /^so 14\. 11\. 🚆 Vídeň → letiště VIE.* · v noci spíš taxi \(v odhadu ceny je MHD\)$/, 'vyráží se před 5:00 – MHD ještě nejede');
  assert.match(r1[h + 2], /^so 14\. 11\. 🛬 VIE 07:00/);
  // letiště, kde už počítáme taxi (Hurghada, Djerba…): bez „v odhadu ceny je MHD“ – odhad je tam taxi
  const tx = trip({ route: null, overland: null, ground: { out: { minutes: 45 }, back: { minutes: 45 } }, arrival: { out: null, back: { ...AB.back, mode: 'taxi', how: 'taxi' } } });
  tx.flight.out = t.flight.out; tx.flight.back = t.flight.back;
  const rt = rows(render(c, tx)), ht = rt.findIndex((r) => /🚪 Z ubytování/.test(r));
  assert.ok(ht >= 0 && !/v noci spíš taxi/.test(rt[ht + 1]), rt.join('\n'));
  // let zpět po půlnoci: cesta na letiště už předchozí večer, hned po řádku 🚪 (ne v den odletu)
  const nt = { ...t, flight: { ...t.flight, back: { ...t.flight.back, date: '2026-11-15', dep: '2026-11-15T00:30:00', arr: '2026-11-15T01:30:00' } } };
  const r3 = rows(render(c, nt));
  const h3 = r3.findIndex((r) => /🚪 Z ubytování/.test(r));
  assert.ok(h3 >= 0 && /^so 14\. 11\. 🚪/.test(r3[h3]) && /^so 14\. 11\. 🚆 Vídeň → letiště VIE/.test(r3[h3 + 1]), r3.join('\n'));
  assert.doesNotMatch(r3[h3 + 1], /v noci spíš taxi/, 've 21:30 ještě jezdí');
  const r2 = rows(render(c, late));
  assert.ok(r2.includes('po 9. 11. 🚪 Vyraž z domu nejpozději ve 21:55 <span class="faint">(~45 min na letiště PRG + 2 h před odletem, odhad)</span>'), r2.join('\n'));
  assert.ok(r2.some((r) => r.startsWith('so 14. 11. 🚪 Z ubytování na letiště VIE vyraž nejpozději v 15:00') && r.endsWith(' · check-out bývá do 11:00 – zavazadla nech na recepci')));
  // kalendář: začátek v pásmu letiště, trvá cestu na letiště
  const cal = plain(c.window.Trip.calendarEvents(t)).filter((e) => e.title.startsWith('🚪'));
  assert.deepEqual(cal.map((e) => [e.title, e.start, e.tz, e.durationMin, e.location]), [
    ['🚪 Vyraž z domu na letiště PRG', '2026-11-10T03:15', 'Europe/Prague', 45, 'Letiště PRG'],
    ['🚪 Vyraž na letiště VIE', '2026-11-14T04:00', 'Europe/Vienna', 60, 'Letiště VIE']]);
  assert.equal(cal[0].description, 'Odhad: ~45\u00a0min cesta na letiště + 2\u00a0h před odletem. Spoj ověř (IDOS).');
  assert.equal(cal[1].description, 'Odhad: ~1\u00a0h cesta z ubytování na letiště + 2\u00a0h před odletem.\nBrzy ráno – taxi objednej předem, nebo přespi u letiště.');
  const ics = c.window.Ics.build(c.window.Trip.calendarEvents(t), { now: Date.UTC(2026, 9, 5) });
  // do souboru .ics s obyčejnými mezerami (pevné jsou jen kvůli zalamování na telefonu)
  assert.ok(ics.replace(/\r\n /g, '').includes('DESCRIPTION:Odhad: ~45 min cesta na letiště + 2 h před odletem. Spoj ověř (IDOS).'));
  assert.ok(!ics.includes('\u00a0'));
  assert.ok(ics.includes('DTSTART:20261110T021500Z\r\nDTEND:20261110T030000Z'), '3:15 v Praze = 2:15Z, 45 min');
  // bez času z domu (neznámá cesta na letiště, neznámý čas odletu); auto vrácené na letišti; vlak/bus místo letu
  assert.equal(leaveBy({ ...t, ground: {} }).home, null);
  assert.equal(leaveBy({ ...t, flight: { ...t.flight, out: { ...t.flight.out, hasTime: false } } }).home, null);
  assert.equal(leaveBy({ ...t, arrival: null }).hotel, null);
  assert.equal(leaveBy({ ...t, car: { mode: 'pick', pickup: 'VIE', dropoff: 'VIE', from: '2026-11-10T09:00', to: '2026-11-14T05:00' } }).hotel, null, 'čas dává vrácení auta');
  assert.deepEqual(plain(leaveBy({ ...t, overland: OV() })), { home: null, hotel: null });
  // mimo Schengen o půl hodiny dřív – podle země (Irsko a Kypr jsou v EU, ale mimo Schengen)
  const uk = plain(leaveBy({ ...t, dest: { label: 'Londýn', cc: 'GB' } }));
  assert.deepEqual([uk.home.hm, uk.home.before, uk.hotel.hm, uk.hotel.before], ['02:45', 150, '03:30', 150]);
  assert.equal(leaveBy({ ...t, dest: { label: 'Dublin', cc: 'IE' } }).home.before, 150, 'Irsko: mimo Schengen');
  assert.equal(leaveBy({ ...t, dest: { label: 'Larnaka', cc: 'CY' } }).home.before, 150, 'Kypr: mimo Schengen');
  assert.equal(leaveBy(t).home.hm, '03:15', 'Rakousko = Schengen');
  // letiště ve tvém městě před 4:30: taxi (čas autem ze serveru) místo denní MHD; ve dne MHD
  const taxi = { ...t, ground: { out: { minutes: 55, local: true, mode: 'transit', nightMin: 25 } } };
  assert.deepEqual(plain([leaveBy(taxi).home.hm, leaveBy(taxi).home.min, leaveBy(taxi).home.taxi]), ['03:35', 25, true]);
  assert.ok(rows(render(c, taxi)).some((r) => r.includes('Vyraž z domu nejpozději ve 3:35 <span class="faint">(~25 min taxi na letiště PRG')));
  // řádek cesty pod tím taky taxi (ne denní MHD s jiným časem), cena cesty dál MHD
  const tr = rows(render(c, taxi)), ti = tr.findIndex((r) => r.includes('🚪 Vyraž z domu'));
  assert.match(tr[ti + 1], /^út 10\. 11\. 🚕 Taxi na letiště PRG \(~25 min, v noci MHD nejede – objednej předem; v ceně cesty je MHD, odhad\)$/, tr.join('\n'));
  const dayT = { ...taxi, flight: { ...t.flight, out: { ...t.flight.out, dep: '2026-11-10T10:00:00', arr: '2026-11-10T11:00:00' } } };
  assert.deepEqual([leaveBy(dayT).home.hm, leaveBy(dayT).home.taxi], ['07:05', undefined]);
  // jedno místo, zpět z letiště jiného města (Paříž → … Londýn): cesta z ubytování se z tabulky letiště spočítat nedá
  const twoCities = { ...t, arrival: { out: { iata: 'XXX', city: 'Paříž', min: 35 }, back: { iata: 'STN', city: 'Londýn', min: 48 } }, flight: { ...t.flight, back: { ...t.flight.back, from: 'STN' } } };
  assert.equal(leaveBy(twoCities).hotel, null);
  // noc změny na letní čas (28. 3. 2027 ve 2:00): odlet 6:30 − 2 h − 2 h 55 min = 0:35 zimního času, ne 1:35
  const dst = plain(leaveBy({ ...t, ground: { out: { minutes: 175 } }, flight: { ...t.flight, out: { ...t.flight.out, date: '2027-03-28', dep: '2027-03-28T06:30:00', arr: '2027-03-28T08:30:00' } } }).home);
  assert.deepEqual([dst.date, dst.hm], ['2027-03-28', '00:35']);
  // minuty z cizího odkazu: text, nesmysl nebo obří číslo → bez řádku, žádný pád
  for (const minutes of ['45', '0x2D', 1e12, -5, NaN]) assert.doesNotThrow(() => leaveBy({ ...t, ground: { out: { minutes } } }));
  assert.equal(leaveBy({ ...t, ground: { out: { minutes: 1e12 } } }).home, null);
  assert.equal(leaveBy({ ...t, ground: { out: { minutes: '45' } } }).home.hm, '03:15', 'číslo jako text se přečte jako číslo');
});

test('let z průběžných výsledků: „Je to dobrá cena?“ až z konečného výsledku téhož hledání (statistika i úroveň ceny), ne z části zdrojů', () => {
  const c = load();
  const { Trip } = c.window;
  // štítek: úroveň ceny letu, jinak ze statistiky (jako PriceCheck.assess)
  c.window.PriceCheck = c.PriceCheck = { assess: (f, st) => f.priceLevel || (st ? { level: 'normal', reason: `ze statistiky (${st.n} nabídek)` } : null) };
  c.window.Flights = c.Flights = { priceTag: (f, i, pl) => `<b class="pl">${pl.level}</b>`, priceCheck: () => {} };
  const q = { from: ['ap:BRQ'], to: [], dateFrom: '2026-11-01', dateTo: '2026-11-30', adults: 2, bags: 'none' };
  const st = (n, median) => ({ n, min: 800, p25: 850, median, p75: 950, max: 1200, dateFrom: '2026-11-10', dateTo: '2026-11-20', mins: [['BRQ', '2026-11', 800]] });
  const noMins = (s) => plain({ ...s, mins: undefined });
  const fl = { ...trip().flight, id: 'demo-air|BRQ|OMR|2026-11-10T07:00:00', destKey: 'OMR', priceLevel: { level: 'low', reason: 'z náhledu', ref: 900, vsRef: -10 } };
  const grp = (stats, options = []) => ({ dest: { key: 'OMR', label: 'Oradea', cc: 'RO', country: 'Rumunsko', lat: 47.03, lon: 21.9 }, priceStats: stats, options });
  const preview = { partial: true, query: q, origins: [], groups: [grp(st(6, 886), [fl])] };
  Trip.start({ t: fl, g: preview.groups[0], result: preview });
  const t = c.S.trip;
  assert.deepEqual([t.priceStats, t.flight.priceLevel, t.statsWait], [null, undefined, JSON.stringify(q)], 'statistika ani úroveň ceny z části zdrojů se neuloží');
  assert.equal(fl.priceLevel.reason, 'z náhledu', 'nabídka ve výpisu beze změny');
  t.verifiedAt = 1;
  assert.doesNotMatch(render(c, t), /Je to dobrá cena\?/, 'krok Let bez štítku, dokud hledání nedoběhne');
  // jiné hledání ani další průběžný výsledek ho nedoplní
  assert.equal(Trip.finalStats({ query: { ...q, adults: 1 }, origins: [], groups: [grp(st(9, 870))] }), false);
  assert.equal(Trip.finalStats(preview), false);
  assert.equal(t.priceStats, null);
  // konečný výsledek téhož hledání: statistika cíle (bez mins) a úroveň ceny téhož letu z něj, štítek v kroku Let hned
  const lvl = { level: 'normal', reason: 'kolem obvyklé ceny', ref: 900, vsRef: -2 };
  const fin = { query: JSON.parse(JSON.stringify(q)), origins: [], groups: [grp(st(8, 873), [{ ...fl, priceLevel: lvl }])] };
  assert.equal(Trip.finalStats(fin), true);
  assert.deepEqual([plain(t.priceStats), plain(t.flight.priceLevel), t.statsWait], [noMins(st(8, 873)), lvl, undefined]);
  assert.match(sp(c.__els['#tfPl'].innerHTML), /<b class="pl">normal<\/b><span class="faint">kolem obvyklé ceny<\/span>.*Je to dobrá cena\?/);
  assert.equal(Trip.finalStats(fin), false, 'jen jednou');
  // let v konečném výsledku chybí (vypadl z nejlepších nabídek) → úroveň se dopočítá ze statistiky; konkrétní cíl: statistika trasy
  c.S.trip = null;
  Trip.start({ t: { ...fl, id: 'jiný' }, g: null, result: { partial: true, query: { ...q, to: ['metro:LON'] }, origins: [], priceStats: st(3, 990), groups: [] } });
  const r = c.S.trip;
  assert.equal(Trip.finalStats({ query: { ...q, to: ['metro:LON'] }, origins: [], priceStats: st(14, 905), groups: [], top: [{ ...fl, priceLevel: lvl }] }), true);
  assert.deepEqual([plain(r.priceStats), r.flight.priceLevel], [noMins(st(14, 905)), undefined]);
  // z konečného výsledku jako dřív (statistika hned, úroveň ceny letu zůstane), na nic nečeká
  c.S.trip = null;
  Trip.start({ t: fl, g: fin.groups[0], result: fin });
  assert.deepEqual([plain(c.S.trip.priceStats), c.S.trip.flight.priceLevel.reason, c.S.trip.statsWait], [noMins(st(8, 873)), 'z náhledu', undefined]);
  // cesta z odkazu, zálohy či uložená na konečný výsledek v tomto prohlížeči nečeká
  assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...trip({ route: null }), statsWait: JSON.stringify(q) }))).statsWait, undefined);
});

test('let z průběžných výsledků, jejichž hledání konečný výsledek nepřineslo (zrušené jiným hledáním, chyba, znovu otevřená aplikace): „Je to dobrá cena?“ z průběžného výsledku s poznámkou', () => {
  const setup = (c) => {
    c.window.PriceCheck = c.PriceCheck = { assess: (f, st) => f.priceLevel || (st ? { level: 'normal', reason: `ze statistiky (${st.n} nabídek)` } : null) };
    c.window.Flights = c.Flights = { priceTag: (f, i, pl) => `<b class="pl">${pl.level}</b>`, priceCheck: () => {} };
  };
  const c = load();
  setup(c);
  const { Trip } = c.window;
  const q = { from: ['ap:BRQ'], to: [], dateFrom: '2026-11-01', dateTo: '2026-11-30', adults: 2, bags: 'none' };
  const st = (n, median) => ({ n, min: 800, p25: 850, median, p75: 950, max: 1200, dateFrom: '2026-11-10', dateTo: '2026-11-20', mins: [['BRQ', '2026-11', 800]] });
  const noMins = (s) => plain({ ...s, mins: undefined });
  const fl = { ...trip().flight, id: 'demo-air|BRQ|OMR|2026-11-10T07:00:00', destKey: 'OMR', priceLevel: { level: 'low', reason: 'z náhledu', ref: 900, vsRef: -10 } };
  const grp = (stats, options = []) => ({ dest: { key: 'OMR', label: 'Oradea', cc: 'RO', country: 'Rumunsko', lat: 47.03, lon: 21.9 }, priceStats: stats, options });
  const preview = { partial: true, query: q, origins: [], groups: [grp(st(6, 886), [fl])] };
  Trip.start({ t: fl, g: preview.groups[0], result: preview });
  const t = c.S.trip;
  assert.deepEqual([t.priceStats, t.statsWait], [null, JSON.stringify(q)], 'dokud hledání běží, čeká se na konečný výsledek');
  // skončilo jiné hledání → cesty se netýká
  assert.equal(Trip.statsGiveUp(JSON.stringify({ ...q, adults: 1 })), false);
  assert.equal(t.statsWait, JSON.stringify(q));
  // hledání, ze kterého let je, skončilo bez konečného výsledku → statistika průběžného výsledku, s poznámkou
  assert.equal(Trip.statsGiveUp(JSON.stringify(q)), true);
  assert.deepEqual([plain(t.priceStats), t.statsWait, t.statsPreview, t.statsPart, t.flight.priceLevel], [noMins(st(6, 886)), undefined, undefined, JSON.stringify(q), undefined]);
  assert.match(sp(c.__els['#tfPl'].innerHTML), /<b class="pl">normal<\/b><span class="faint">ze statistiky \(6 nabídek\) · podle průběžných výsledků, hledání nedoběhlo<\/span>.*Je to dobrá cena\?/);
  t.verifiedAt = 1;
  assert.match(render(c, t), /podle průběžných výsledků, hledání nedoběhlo/);
  assert.equal(Trip.statsGiveUp(JSON.stringify(q)), false, 'jen jednou');
  // totéž hledání později doběhne: statistika a úroveň ceny z konečného výsledku, poznámka zmizí
  const lvl = { level: 'normal', reason: 'kolem obvyklé ceny', ref: 900, vsRef: -2 };
  assert.equal(Trip.finalStats({ query: q, origins: [], groups: [grp(st(8, 873), [{ ...fl, priceLevel: lvl }])] }), true);
  assert.deepEqual([plain(t.priceStats), plain(t.flight.priceLevel), t.statsPart], [noMins(st(8, 873)), lvl, undefined]);
  assert.doesNotMatch(sp(c.__els['#tfPl'].innerHTML), /průběžných/);
  // aplikace znovu otevřená s cestou, která na konečný výsledek čekala: hned statistika průběžného výsledku (a uložit)
  const waiting = { ...plain(trip({ route: null })), flight: { ...fl, priceLevel: undefined }, priceStats: null, statsWait: JSON.stringify(q), statsPreview: noMins(st(5, 900)) };
  const c2 = load({ trip: waiting });
  setup(c2);
  assert.deepEqual([plain(c2.S.trip.priceStats), c2.S.trip.statsWait, c2.S.trip.statsPreview, c2.S.trip.statsPart], [noMins(st(5, 900)), undefined, undefined, JSON.stringify(q)]);
  assert.equal(c2.__saves, 1);
  assert.equal(load({ trip: plain(trip({ route: null })) }).__saves, 0, 'cesta, která na nic nečeká, se při otevření neukládá');
  // odkaz, záloha či uložená cesta: totéž (příznak bez dotazu hledání), cizí hodnoty pryč
  const s = Trip.sanitizeTrip(JSON.parse(JSON.stringify(waiting)));
  assert.deepEqual([plain(s.priceStats), s.statsWait, s.statsPreview, s.statsPart], [noMins(st(5, 900)), undefined, undefined, true]);
  const bad = Trip.sanitizeTrip(JSON.parse(JSON.stringify({ ...waiting, statsWait: undefined, statsPreview: { n: 'x' }, statsPart: 0 })));
  assert.deepEqual([bad.priceStats, bad.statsPreview, bad.statsPart], [null, undefined, undefined]);
});

test('průvodce: trasa autem bez auta – v kroku Auto „Bez auta – mezi místy vlakem a busem“, ve Shrnutí upozornění', () => {
  const c = load();
  c.fetch = () => new Promise(() => {}); // přepočet přejezdů ze serveru tu nedoběhne – stačí, že se spustí
  c.window.scrollTo = () => {};
  const t = trip({ overland: OV({ on: false }), step: 'car' });
  // shrnutí: přejezdy autem, auto nevybrané → upozornění; s autem ani vlakem ne
  const warn = 'Přejezdy mezi místy trasy počítám <b>autem</b>, ale auto nemáš vybrané';
  assert.ok(render(c, { ...t, step: 'summary' }).includes(warn));
  assert.ok(render(c, { ...t, step: 'summary', car: { mode: 'skip', totalCzk: 0 } }).includes(warn), 'Auto nepotřebuji');
  assert.ok(!render(c, { ...t, step: 'summary', car: { mode: 'manual', totalCzk: 5000, pickup: 'VIE', dropoff: 'VIE', from: '2026-11-10T09:00', to: '2026-11-14T16:00' } }).includes(warn));
  assert.ok(!render(c, { ...t, step: 'summary', route: { ...t.route, transport: 'transit' } }).includes(warn));
  // krok Auto: volba bez auta přepne přejezdy na vlak a bus a pokračuje k programu
  const h = render(c, t);
  // Vídeň → Salcburk vlakem ~2 h 45 min, autem ~3 h 15 min → bez auta jako hlavní volba, s důvodem u trasy
  assert.match(h, /<button class="btn primary" id="carTransit" title="[^"]+">Bez auta – mezi místy vlakem a busem →<\/button>/);
  assert.match(h, /Vlakem rychleji:<\/b> Vídeň → Salcburk/);
  c.__els['#carTransit'].onclick();
  assert.deepEqual([t.route.transport, t.car.mode, t.step], ['transit', 'skip', 'program']);
  // trasa vlakem, nebo jedno místo: volba se nenabízí
  assert.ok(!render(c, { ...t, step: 'car' }).includes('id="carTransit"'));
  assert.ok(!render(c, { ...trip({ overland: OV({ on: false }), step: 'car' }), route: { ...t.route, mode: 'single' } }).includes('id="carTransit"'));
});

test('v noci taxi s pevnou cenou (Řím 55 € za auto): v průběhu cesty i v ceně místo MHD – jen v noci, děleno dospělými', () => {
  const c = load();
  vm.runInContext(`${src('searchhelp.js')}\nvar SearchHelp = window.SearchHelp;`, c, { filename: 'searchhelp.js' });
  const { costs, timeline, sanitizeTrip, leaveBy } = c.window.Trip;
  const FCO = { iata: 'FCO', city: 'Řím', gen: 'Říma', how: 'vlak Leonardo Express do Roma Termini', min: 32, czk: 340, fare: 14, cur: 'EUR', mode: 'train', basis: 'table', lat: 41.9028, lon: 12.4964, taxi: { fare: 55, cur: 'EUR', pax: 4, czk: 1340 } };
  // let zpět v 7:00 → z ubytování ve 4:08 (32 min + 20 min na zastávku + 2 h): v noci; přílet v 9:00 ve dne
  const t = trip({ route: null, overland: null, ground: {}, dest: { label: 'Řím', country: 'Itálie', cc: 'IT', lat: 41.8, lon: 12.25 }, arrival: { out: FCO, back: FCO } });
  t.flight = { ...t.flight, arrCzk: 680, out: leg('PRG', 'FCO', '2026-11-10', '07:00', '09:00', 'Europe/Prague', 'Europe/Rome'), back: leg('FCO', 'PRG', '2026-11-14', '07:00', '09:00', 'Europe/Rome', 'Europe/Prague') };
  assert.equal(leaveBy(t).hotel.hm, '04:08');
  // 2 dospělí: tam vlak 340 Kč/os., zpět taxi 1 340 Kč za auto / 2
  assert.equal(costs(t).arrival, (340 + 670) * 2);
  const day = { ...t, flight: { ...t.flight, back: { ...t.flight.back, dep: '2026-11-14T12:00:00', arr: '2026-11-14T14:00:00' } } };
  assert.equal(costs(day).arrival, 680 * 2, 've dne MHD');
  // 5 dospělých: dvě auta (4 + 1) → 2 × 1 340 / 5 = 536 Kč/os.
  assert.equal(costs({ ...t, adults: 5 }).arrival, (340 + 536) * 5);
  // přílet po 23:00 i odlet v noci: oba úseky taxi
  const late = { ...t, flight: { ...t.flight, out: { ...t.flight.out, dep: '2026-11-10T21:30:00', arr: '2026-11-10T23:30:00' } } };
  assert.equal(costs(late).arrival, 670 * 2 * 2);
  // průběh cesty: řádek cesty na letiště s pevnou cenou taxi; ve dne nic
  const txt = (x) => timeline(x).map((r) => r[2]);
  assert.equal(txt(t).find((r) => r.startsWith('Řím → letiště FCO')), 'Řím → letiště FCO · vlak Leonardo Express · ~32\u00a0min · 14\u00a0€ (~340\u00a0Kč)/os. · v noci taxi, pevná cena 55 € za auto (v odhadu ceny započteno)');
  assert.doesNotMatch(txt(day).find((r) => r.startsWith('Řím → letiště FCO')), /v noci/);
  // krok Let: tam i zpět přes FCO – jeden řádek s „zpět stejně“ (cena „a zpět“ je za oba směry)
  const fs = render(c, { ...day, step: 'flight' });
  assert.match(fs, /Z letiště FCO → Řím · vlak Leonardo Express do Roma Termini · ~32 min · 14 € \(~340 Kč\)\/os\. · zpět stejně/);
  assert.doesNotMatch(fs, /Řím → letiště FCO/);
  assert.match(txt(late).find((r) => r.startsWith('Z letiště FCO → Řím')), / · v noci taxi, pevná cena 55 € za auto \(v odhadu ceny započteno\)$/);
  assert.doesNotMatch(txt(t).find((r) => r.startsWith('Z letiště FCO → Řím')), /taxi/, 'přílet v 9:00');
  // souhrn: řádek dopravy říká, co se počítá
  const html = render(c, { ...t, step: 'summary' });
  assert.ok(html.includes('Doprava z letiště do města a zpět (odhad) · taxi na letiště FCO (noc) 55 € za auto'), html.slice(html.indexOf('Doprava'), html.indexOf('Doprava') + 200));
  // krok Let: na osobu (340 + 670 Kč) a proč
  assert.ok(render(c, { ...t, step: 'flight' }).includes('<span>Z letiště do města a zpět<small>taxi na letiště FCO (noc) 55 € za auto</small></span><b>~1 010 Kč</b>'));
  // Paříž podle části města (horní cena v odhadu), Atény noční cena
  const CDG = { ...FCO, iata: 'CDG', city: 'Paříž', how: 'vlak RER B do centra', taxi: { fare: 56, hi: 65, cur: 'EUR', pax: 4, czk: 1580 } };
  assert.match(txt({ ...t, arrival: { out: CDG, back: CDG } }).find((r) => r.includes('→ letiště CDG')), / · v noci taxi, pevná cena 56–65 € za auto podle části města \(v odhadu ceny započteno 65 €\)$/);
  const ATH = { ...FCO, iata: 'ATH', city: 'Atény', how: 'autobus X95 na Syntagma', mode: 'bus', taxi: { fare: 50, night: 65, nightFrom: '00:00', nightTo: '05:00', cur: 'EUR', pax: 4, czk: 1580, dayCzk: 1215 } };
  assert.match(txt({ ...t, arrival: { out: ATH, back: ATH } }).find((r) => r.includes('→ letiště ATH')), / · v noci taxi, pevná noční cena 65 € za auto \(v odhadu ceny započteno\)$/);
  // bez pevné ceny, bez cesty do města v ceně, nebo autem z letiště: jako dřív
  const noFare = { ...t, arrival: { out: { ...FCO, taxi: undefined }, back: { ...FCO, taxi: undefined } } };
  assert.equal(costs(noFare).arrival, 680 * 2);
  assert.match(txt(noFare).find((r) => r.startsWith('Řím → letiště FCO')), / · v noci spíš taxi \(v odhadu ceny je MHD\)$/);
  const off = { ...t, flight: { ...t.flight, arrCzk: 0 } };
  assert.equal(costs(off).arrival, 0);
  assert.match(txt(off).find((r) => r.startsWith('Řím → letiště FCO')), / · v noci spíš taxi \(v odhadu ceny je MHD\)$/);
  const car = { ...late, car: { mode: 'manual', totalCzk: 3000, pickup: 'FCO', dropoff: 'FCO', from: '2026-11-11T00:15', to: '2026-11-14T04:30' } };
  assert.equal(costs(car).arrival, 0, 'auto z letiště i na letiště');
  // sdílený odkaz / uložená cesta: taxi jen čísla v mezích
  const san = plain(sanitizeTrip(plain({ ...t, arrival: { out: { ...FCO, taxi: { ...FCO.taxi, src: 'javascript:x', evil: 1 } }, back: { ...FCO, taxi: { fare: 'x', cur: 'EUR', czk: 5 } } } })).arrival);
  assert.deepEqual(san.out.taxi, { fare: 55, cur: 'EUR', czk: 1340, pax: 4 });
  assert.equal(san.back.taxi, undefined);
  // noční hodiny a denní cena projdou, nesmysl ne
  const sanA = plain(sanitizeTrip(plain({ ...t, arrival: { out: ATH, back: { ...ATH, taxi: { ...ATH.taxi, nightFrom: '0:00', dayCzk: -5 } } } })).arrival);
  assert.deepEqual([sanA.out.taxi.nightFrom, sanA.out.taxi.nightTo, sanA.out.taxi.dayCzk], ['00:00', '05:00', 1215]);
  assert.deepEqual([sanA.back.taxi.nightFrom, sanA.back.taxi.dayCzk], [undefined, undefined]);
});

test('v noci taxi: Atény – noční cena jen 0–5 h (přílet ve 23:30 denní 50 €, v 1:30 noční 65 €); odchod z ubytování ve 4:00', () => {
  const c = load();
  vm.runInContext(`${src('searchhelp.js')}\nvar SearchHelp = window.SearchHelp;`, c, { filename: 'searchhelp.js' });
  const { costs, timeline, leaveBy } = c.window.Trip;
  const ATH = { iata: 'ATH', city: 'Atény', gen: 'Atén', how: 'autobus X95 na Syntagma', min: 32, czk: 140, fare: 5.5, cur: 'EUR', mode: 'bus', basis: 'table', lat: 37.98, lon: 23.73, taxi: { fare: 50, night: 65, nightFrom: '00:00', nightTo: '05:00', cur: 'EUR', pax: 4, czk: 1580, dayCzk: 1215 } };
  const base = trip({ route: null, overland: null, ground: {}, dest: { label: 'Atény', country: 'Řecko', cc: 'GR', lat: 37.98, lon: 23.73 }, arrival: { out: ATH, back: ATH } });
  const tz = 'Europe/Athens';
  const flight = (out, back) => ({ ...base.flight, arrCzk: 280, out, back });
  const day = leg('ATH', 'PRG', '2026-11-14', '12:00', '13:30', tz, 'Europe/Prague');
  const txt = (x) => timeline(x).map((r) => r[2]);
  // přílet ve 23:30: MHD už nejede, taxi za denní cenu (noční až od půlnoci)
  const late = { ...base, flight: flight(leg('PRG', 'ATH', '2026-11-10', '20:30', '23:30', 'Europe/Prague', tz), day) };
  assert.equal(costs(late).arrival, (1215 / 2 + 140) * 2);
  assert.match(txt(late).find((r) => r.startsWith('Z letiště ATH → Atény')), / · v noci taxi, pevná cena 50 € za auto \(v odhadu ceny započteno\)$/);
  assert.ok(render(c, { ...late, step: 'summary' }).includes('taxi z letiště ATH (noc) 50 € za auto'));
  // přílet v 1:30: noční 65 €
  const night = { ...base, flight: flight({ ...leg('PRG', 'ATH', '2026-11-10', '22:30', '01:30', 'Europe/Prague', tz), arr: '2026-11-11T01:30:00' }, day) };
  assert.equal(costs(night).arrival, (1580 / 2 + 140) * 2);
  assert.match(txt(night).find((r) => r.startsWith('Z letiště ATH → Atény')), / · v noci taxi, pevná noční cena 65 € za auto \(v odhadu ceny započteno\)$/);
  // odlet v 6:52 → z ubytování ve 4:00 (32 min + 20 min na zastávku + 2 h): noční 65 €; ve 23:30 (odlet 2:22) denní 50 €
  const early = { ...base, flight: flight(leg('PRG', 'ATH', '2026-11-10', '07:00', '10:00', 'Europe/Prague', tz), leg('ATH', 'PRG', '2026-11-14', '06:52', '08:22', tz, 'Europe/Prague')) };
  assert.equal(leaveBy(early).hotel.hm, '04:00');
  assert.equal(costs(early).arrival, (140 + 1580 / 2) * 2);
  assert.match(txt(early).find((r) => r.startsWith('Atény → letiště ATH')), / · v noci taxi, pevná noční cena 65 € za auto \(v odhadu ceny započteno\)$/);
  const eve = { ...base, flight: flight(early.flight.out, { ...leg('ATH', 'PRG', '2026-11-14', '02:22', '03:52', tz, 'Europe/Prague'), date: '2026-11-15', dep: '2026-11-15T02:22:00', arr: '2026-11-15T03:52:00' }) };
  assert.equal(leaveBy(eve).hotel.hm, '23:30');
  assert.equal(costs(eve).arrival, (140 + 1215 / 2) * 2);
  assert.match(txt(eve).find((r) => r.startsWith('Atény → letiště ATH')), / · v noci taxi, pevná cena 50 € za auto \(v odhadu ceny započteno\)$/);
  // Řím (pevná cena bez nočních hodin): ve 4:00 taxi 55 €
  const FCO = { ...ATH, iata: 'FCO', city: 'Řím', how: 'vlak Leonardo Express do Roma Termini', mode: 'train', czk: 340, taxi: { fare: 55, cur: 'EUR', pax: 4, czk: 1340 } };
  const rome = { ...early, flight: { ...early.flight, arrCzk: 680 }, arrival: { out: FCO, back: FCO } };
  assert.equal(leaveBy(rome).hotel.hm, '04:00');
  assert.equal(costs(rome).arrival, (340 + 1340 / 2) * 2);
  // souhrn: řádky ceny dají dohromady „Celkem“ – 1, 2 i 5 dospělých (5 → dvě auta), oba úseky taxi
  const both = { ...night, flight: { ...night.flight, back: early.flight.back } };
  for (const adults of [1, 2, 5]) {
    const x = { ...both, adults, step: 'summary' };
    const cc = costs(x);
    assert.equal(cc.arrival, Math.round((adults > 4 ? 2 : 1) * 1580 * 2), `${adults} os.: dvakrát noční taxi za auto`);
    const tab = render(c, x).match(/<table class="cost">([\s\S]*?)<\/table>/)[1];
    const nums = [...tab.matchAll(/<tr><td>[^<]*<\/td><td>[\s\S]*?<\/td><td>([^<]*)<\/td><\/tr>/g)].map((m) => Number(m[1].replace(/\D/g, '')));
    const tot = Number(tab.match(/<tr class="tot"><td><\/td><td>Celkem<\/td><td>([^<]*)</)[1].replace(/\D/g, ''));
    assert.equal(nums.reduce((s, n) => s + n, 0), tot, `${adults} os.: ${nums.join(' + ')} = ${tot}`);
    assert.equal(tot, cc.total);
  }
});

test('shrnutí: rozpočet po položkách za osobu i celkem (odhady označené) a Můj rozpočet – kolik zbývá / o kolik dražší', () => {
  const c = load();
  const { costs, budgetGroups, budgetLeft } = c.window.Trip;
  // Můj rozpočet: bez rozpočtu nic; zbývá; dražší (pruh plný, ne přes 100 %)
  assert.equal(budgetLeft(20000, 0), null);
  assert.equal(budgetLeft(20000, NaN), null);
  assert.deepEqual(plain(budgetLeft(15000, 20000)), { left: 5000, over: false, pct: 75 });
  assert.deepEqual(plain(budgetLeft(26000, 20000)), { left: -6000, over: true, pct: 100 });
  assert.deepEqual(plain(budgetLeft(0, 20000)), { left: 20000, over: false, pct: 0 });
  // let + trasa autem: letenky a zavazadla, ubytování (v Salcburku odhad), auto a přejezdy
  const t = trip({ overland: OV({ on: false }), car: { mode: 'manual', totalCzk: 5000 } });
  t.flight.bagCzk = 500;
  t.route.bases[0].stay = { mode: 'manual', totalCzk: 4000, name: 'Hotel Wien' };
  t.route.bases[1].stay = { mode: 'pick', totalCzk: 3000, name: 'Hotel Salzburg', est: true };
  t.route.transfers[0].fuelCzk = 800; // palivo Vídeň → Salcburk (jinak počítá server)
  const cc = costs(t), g = plain(budgetGroups(t));
  assert.deepEqual(g.map((x) => x.label), ['Letenky a zavazadla', 'Ubytování', 'Auto a přejezdy'], 'prázdná doprava na letiště se nevypíše');
  assert.deepEqual(g[0], { icon: '✈️', label: 'Letenky a zavazadla', czk: 7000, est: true, pp: 3500 });
  assert.deepEqual(g[1], { icon: '🏨', label: 'Ubytování', czk: 7000, est: true, pp: 3500 });
  assert.equal(g[2].czk, 5000 + cc.transfers);
  assert.ok(cc.transfers > 0 && g[2].est, 'přejezdy jsou odhad');
  assert.equal(g.reduce((s, x) => s + x.czk, 0), cc.total, 'skupiny dají dohromady Celkem');
  // bez zavazadel a s ručně zadaným ubytováním: letenky i ubytování nejsou odhad
  t.flight.bagCzk = 0; delete t.route.bases[1].stay.est;
  const g2 = plain(budgetGroups(t));
  assert.deepEqual(g2.slice(0, 2).map((x) => [x.label, x.est]), [['Letenky', false], ['Ubytování', false]]);
  // vlak/bus z RegioJetu: skupina Vlak / bus bez odhadu, jen přejezdy
  const ov = plain(budgetGroups(trip()));
  assert.deepEqual(ov.map((x) => [x.label, x.est]), [['Vlak / bus', false], ['Přejezdy', true]]);
  assert.equal(ov[0].czk, 299 * 2 * 2);
  assert.equal(ov[0].pp, 299 * 2);
  // ve shrnutí: tabulka po položkách, odhady s „~“ a pole Můj rozpočet
  const h = render(c, t);
  assert.ok(h.includes('<td>Po položkách</td><td>na osobu</td><td>celkem</td>'));
  assert.match(h, /Auto a přejezdy <span class="faint">· odhad<\/span><\/td><td>~/);
  assert.ok(h.includes('id="myBudget"'));
  assert.ok(h.includes('Zadej, kolik chceš za cestu utratit'), 'bez rozpočtu jen nápověda');
  // psaní do pole: řádek pod ním ukáže, o kolik je cesta dražší (localStorage v testu není – nevadí)
  const kc = (n) => sp(vm.runInContext(`czk(${n})`, c)), total = costs(t).total; // už bez zavazadel
  c.__els['#myBudget'].value = '1000';
  c.__els['#myBudget'].oninput();
  assert.ok(sp(c.__els['#budgetOut'].innerHTML).includes(`Cesta je o <b>${kc(total - 1000)}</b> dražší než rozpočet`));
  assert.ok(c.__els['#budgetOut'].innerHTML.includes('class="bud-bar over"'));
  c.__els['#myBudget'].value = String(total + 2000);
  c.__els['#myBudget'].oninput();
  assert.ok(sp(c.__els['#budgetOut'].innerHTML).includes(`Zbývá <b>${kc(2000)}</b>`));
  assert.ok(!c.__els['#budgetOut'].innerHTML.includes('bud-miss'), 'všechno má cenu – bez poznámky');
});

test('Můj rozpočet: položka bez ceny (ubytování místa trasy, auto, přejezdy…) se v součtu počítá jako 0 – poznámka u porovnání', () => {
  const c = load();
  const { budgetMissing, costs } = c.window.Trip;
  const miss = (t) => plain(budgetMissing(t));
  // let + trasa autem: Vídeň s cenou ubytování, Salcburk zatím bez ceny
  const t = trip({ overland: OV({ on: false }), car: { mode: 'manual', totalCzk: 5000 } });
  t.route.bases[0].stay = { mode: 'manual', totalCzk: 4000, name: 'Hotel Wien' };
  t.route.transfers[0].fuelCzk = 800;
  assert.deepEqual(miss(t), ['ubytování (Salcburk)']);
  t.route.bases[1].stay = { mode: 'links' }; // jen odkazy na hledání – cena neznámá
  assert.deepEqual(miss(t), ['ubytování (Salcburk)']);
  t.route.bases[1].stay = { mode: 'skip', totalCzk: 0 }; // „neřeším“ – nechybí
  assert.deepEqual(miss(t), []);
  t.route.bases[0].stay = null; t.route.bases[1].stay = null;
  assert.deepEqual(miss(t), ['ubytování (Vídeň, Salcburk)']);
  // auto vybrané bez ceny, přejezd bez spočítaného paliva (starší uložená trasa), letenka bez ceny
  t.car = { mode: 'manual', totalCzk: 0 };
  delete t.route.transfers[0].fuelCzk;
  t.flight.flightCzk = 0;
  assert.deepEqual(miss(t), ['letenky', 'ubytování (Vídeň, Salcburk)', 'auto', 'přejezdy mezi místy']);
  t.car = { mode: 'skip', totalCzk: 0 }; t.flight.flightCzk = 3000;
  t.route.transport = 'transit'; t.route.transfers[0].fareCzk = 450; // vlakem / busem: jízdenka má cenu
  assert.deepEqual(miss(t), ['ubytování (Vídeň, Salcburk)']);
  // vlak / bus místo letu: jízdenka bez ceny
  const o = trip();
  assert.ok(!miss(o).includes('jízdenky na vlak / bus'), 'spoje RegioJetu mají cenu');
  o.overland.back.czk = 0;
  assert.ok(miss(o).includes('jízdenky na vlak / bus'));
  // jedno místo: ubytování nevybrané (krok přeskočený) chybí, „bez ubytování“ a zadaná cena ne
  const s = trip({ overland: OV({ on: false }), route: { mode: 'single' }, stay: null });
  assert.deepEqual(miss(s), ['ubytování']);
  s.stay = { mode: 'skip', name: 'bez ubytování', totalCzk: 0 };
  assert.deepEqual(miss(s), []);
  s.stay = { mode: 'manual', totalCzk: 6000 };
  assert.deepEqual(miss(s), []);

  // ve shrnutí: s rozpočtem poznámka pod porovnáním – „Zbývá“ není celá pravda
  t.route.bases[0].stay = { mode: 'manual', totalCzk: 4000, name: 'Hotel Wien' };
  const h = render(c, t);
  assert.ok(h.includes('Ubytování zatím bez ceny · Salcburk'), 'v tabulce ceny řádek bez ceny');
  c.__els['#myBudget'].value = String(costs(t).total + 5000);
  c.__els['#myBudget'].oninput();
  const out = sp(c.__els['#budgetOut'].innerHTML);
  assert.ok(out.includes('Zbývá <b>'), out);
  assert.ok(out.includes('<div class="bud-miss">⚠️ Zatím bez ceny: ubytování (Salcburk) – v součtu chybí, cesta vyjde dráž.</div>'), out);
  // víc položek: „a“ před poslední
  t.car = { mode: 'manual', totalCzk: 0 };
  render(c, t);
  c.__els['#myBudget'].oninput();
  assert.ok(sp(c.__els['#budgetOut'].innerHTML).includes('Zatím bez ceny: ubytování (Salcburk) a auto – v součtu chybí'));
  // vše s cenou → bez poznámky; ubytování „neřeším“ v tabulce není „bez ceny“
  t.car = { mode: 'skip', totalCzk: 0 };
  t.route.bases[1].stay = { mode: 'skip', totalCzk: 0 };
  assert.ok(!render(c, t).includes('zatím bez ceny'));
  c.__els['#myBudget'].oninput();
  assert.ok(!c.__els['#budgetOut'].innerHTML.includes('bud-miss'));
});
