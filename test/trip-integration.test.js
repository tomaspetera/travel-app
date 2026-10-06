// Průvodce cestou tam, kde se potkávají funkce: vlak/bus místo letu × trasa přes víc míst × ubytování,
// a sdílený odkaz s „Je to dobrá cena?“. Kroky průvodce se vykreslí do zástupného DOM ($ vrací stálé objekty
// podle selektoru, kliknutí = zavolání onclick); public/js/trip.js a pomocné řádky z app.js přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transferEstimate } from '../server/lib/stayplan.js';

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
  const back = transferEstimate(SALCBURK, VIDEN); // stejný odhad jako přejezdy trasy na serveru
  assert.ok(back.km > 250 && back.carMin > 180, 'Salcburk → Vídeň je dlouhý přejezd');
  const want = `${back.km} km · ~${hm(back.carMin)} autem (odhad)`;
  // krok Trasa
  render(c, { ...trip(), step: 'route' });
  const list = sp(c.__els['#rtList'].innerHTML);
  const odjezd = list.slice(list.indexOf('Odjezd vlakem / busem'));
  assert.match(odjezd, /^Odjezd vlakem \/ busem <b>Vídeň<\/b> · ne 15\. 11\. 17:00/);
  assert.ok(odjezd.includes(want), `pod odjezdem přejezd ze Salcburku: ${odjezd.slice(0, 300)}`);
  assert.ok(odjezd.includes('href="https://www.google.com/maps/dir/?api=1&amp;origin=Salcburk%2C+Rakousko&amp;destination=V%C3%ADde%C5%88&amp;travelmode=driving"'));
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
