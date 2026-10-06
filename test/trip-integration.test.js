// Průvodce cestou tam, kde se potkávají funkce: vlak/bus místo letu × trasa přes víc míst × ubytování,
// a sdílený odkaz s „Je to dobrá cena?“. Kroky průvodce se vykreslí do zástupného DOM ($ vrací stálé objekty
// podle selektoru, kliknutí = zavolání onclick); public/js/trip.js a pomocné řádky z app.js přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transferEstimate, evaluateRoute } from '../server/lib/stayplan.js';
import { routeKey } from '../server/lib/transfers.js';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load() {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = {}, __els = {}, __toasts = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = () => [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var toast = (msg) => { __toasts.push(msg); };`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`);

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

test('průvodce: let s přestupem – krok Let i průběh cesty ukážou kde (k zemi „jen přestup“ v 🛂 Před cestou)', () => {
  const c = load();
  const t = trip({ route: null, overland: null, step: 'flight', dest: { label: 'Cancún', country: 'Mexiko', cc: 'MX' } });
  t.flight.out = { ...t.flight.out, to: 'CUN', stops: 1, layovers: [{ at: 'JFK', min: 150, cc: 'US' }] };
  t.flight.back = { ...t.flight.back, from: 'CUN', stops: 2, layovers: [{ at: 'YYZ', min: 65, cc: 'CA' }, { at: 'FRA<b>', min: 'x' }] };
  const h = render(c, t);
  assert.match(h, /Demo Air · DA 1 · 1× přestup \(JFK 2 h 30 min\)<\/span>/);
  assert.match(h, /Demo Air · DA 1 · 2× přestup \(YYZ 1 h 5 min, FRA&lt;b&gt;\)<\/span>/, 'texty z dat escapované');
  const s = render(c, { ...t, step: 'summary' });
  assert.match(s, /🛫<\/span><span>PRG 07:00 → CUN 08:00 · Demo Air · 1× přestup \(JFK 2 h 30 min\)<\/span>/);
  assert.match(s, /🛬<\/span><span>CUN 19:00 → PRG 20:00 · Demo Air · 2× přestup/, 'i přílet zpět');
  // přímý let beze změny
  assert.match(render(c, trip({ route: null, overland: null })), /🛫<\/span><span>PRG 07:00 → VIE 08:00 · Demo Air<\/span>/);
});

test('průvodce: přílet / příjezd další den má „+1“ jako ve výsledcích (noční let, noční bus)', () => {
  const c = load();
  const t = trip({ route: null, overland: null, step: 'flight' });
  t.flight.out = { ...t.flight.out, dep: '2026-11-10T21:25:00', arr: '2026-11-11T00:51:00' };
  assert.match(render(c, t), /PRG 21:25 → VIE 00:51 \+1 <span class="faint">/);
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
  assert.ok(h.includes('<b>123 km · ~3 h 25 min autem</b> <span class="faint">(podle trasy; 🚌 autobusem / minibusem ~6 h 10 min)</span>'), h.slice(h.indexOf('rt-tr'), h.indexOf('rt-tr') + 400));
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
  assert.ok(h.includes('<b>~6 h 10 min autobusem / minibusem</b> <span class="faint">(odhad; autem ~3 h 25 min)</span>'));
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
  assert.ok(notes.includes(`Přejezd Lagos → Cotonou: ${x0.km} km · ~${hm(x0.carMin)} autem (odhad) · 🛂 hranice Nigérie → Benin`), notes.join('\n'));
  assert.ok(notes.includes(`Přejezd Porto Novo → letiště LOS: ${dep.km} km · ~3 h 10 min autem (odhad) · 🛂 hranice Benin → Nigérie`));
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
  raw.route.groundLegs = { key: '1,2|3,4|5,6', arrival: raw.route.transfers[0], departure: null, extra: 1 };
  Object.assign(raw.route.bases[1], { gid: 2392087 });
  Object.assign(raw.route.bases[2], { gid: '1;drop' });
  const r = plain(c.window.Trip.sanitizeTrip(raw).route);
  assert.deepEqual(r.bases.map((b) => b.gid), [undefined, 2392087, undefined], 'ID GeoNames jen jako celé číslo');
  assert.deepEqual([r.transfers[0].transitKind, r.transfers[0].basis, r.transfers[0].border], ['bus', 'route', { from: 'NG', to: 'BJ' }]);
  assert.deepEqual([r.transfers[1].transitKind, r.transfers[1].basis, r.transfers[1].border, r.transfers[1].hsr], [undefined, 'estimate', null, undefined], 'neznámý druh dopravy → přepočítá se');
  assert.deepEqual(Object.keys(r.groundLegs), ['key', 'arrival', 'departure']);
  assert.equal(r.groundLegs.arrival.carMin, t.route.transfers[0].carMin);
  raw.route.groundLegs.key = '<script>';
  assert.equal(c.window.Trip.sanitizeTrip(raw).route.groundLegs, null);
});
