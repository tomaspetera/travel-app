// Krok Auto průvodce cestou: auto jen na pár dní uprostřed pobytu (cesta z letiště do města zůstane v ceně), důvod
// nepůjčovat auto ve městě s metrem / vlakem z letiště, upozornění k zemi (zóny ZTL v Itálii, elektronické mýtné
// v Portugalsku), přejezdy trasy rychlejší vlakem, co je v ceně auta a co zvlášť, neúplný formulář, vrácení v jiné zemi
// a pořadí odpovědí srovnávačů. Kroky se vykreslí do zástupného DOM ($ vrací stálé objekty podle selektoru);
// public/js/trip.js přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load() {
  const ctx = { window: { scrollTo() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = { trips: [] }, __els = {}, __all = {}, __toasts = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {}, scrollIntoView() {} });
    var $$ = (s) => __all[s] || [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var confirm = () => false; var toast = (msg) => { __toasts.push(msg); };
    var byIso = { AT: { cs: 'Rakousko' }, IT: { cs: 'Itálie' } }; var PACK = ['Pas'];`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const sp = (s) => String(s).replace(/\u00a0/g, ' ');
const tick = () => new Promise((r) => setImmediate(r));
function render(c, t) {
  c.S.trip = t;
  c.window.Trip.render();
  return sp(c.__els['#tripStep'].innerHTML);
}

const leg = (from, to, date, dep, arr, fromTz, toTz) => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: 'https://air.example/book',
});
// cesta z letiště do města z tabulky (server/lib/arrival.js): Lisabon metrem, Palma autobusem
const arr = (iata, city, lat, lon, mode, czk) => ({ iata, city, gen: city, lat, lon, mode, how: mode, fare: 2, cur: 'EUR', czk, min: 20, km: 7, src: 'https://x.example', date: '2026-10-01', basis: 'table' });
const LIS_ARR = arr('LIS', 'Lisabon', 38.7223, -9.1393, 'metro', 50);
const PMI_ARR = arr('PMI', 'Palma', 39.5696, 2.6502, 'bus', 120);
// Lisabon 5 nocí: přílet 13:10, odlet zpět 15:00
function lisbon(over = {}) {
  return {
    v: 1, created: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'car', verifiedAt: 1, ground: {}, groundMode: 'transit', overland: null, groundRef: null,
    flight: { out: leg('PRG', 'LIS', '2026-11-10', '10:00', '13:10', 'Europe/Prague', 'Europe/Lisbon'), back: leg('LIS', 'PRG', '2026-11-15', '15:00', '19:40', 'Europe/Lisbon', 'Europe/Prague'), flightCzk: 3200, groundCzk: 0, bagCzk: 0, arrCzk: 100 },
    dest: { label: 'Lisabon', country: 'Portugalsko', cc: 'PT', lat: 38.7742, lon: -9.1342 },
    arrival: { out: LIS_ARR, back: LIS_ARR },
    stay: { mode: 'skip', name: 'bez ubytování', totalCzk: 0 }, car: null, plan: null, ...over,
  };
}
const car = (from, to, over = {}) => ({ mode: 'manual', totalCzk: 2400, pickup: 'LIS', dropoff: 'LIS', from, to, age: 30, ...over });
// Mallorca s dětmi: z letiště jen autobus
const mallorca = (over = {}) => lisbon({
  children: 2,
  flight: { out: leg('PRG', 'PMI', '2026-11-10', '10:00', '12:30', 'Europe/Prague', 'Europe/Madrid'), back: leg('PMI', 'PRG', '2026-11-17', '13:00', '15:30', 'Europe/Madrid', 'Europe/Prague'), flightCzk: 3200, groundCzk: 0, bagCzk: 0, arrCzk: 240 },
  dest: { label: 'Palma de Mallorca', country: 'Španělsko', cc: 'ES', lat: 39.55, lon: 2.73 },
  arrival: { out: PMI_ARR, back: PMI_ARR },
  ...over,
});
// Trasa autem Řím → Florencie → Benátky (přílet FCO, odlet VCE); přejezdy ze serveru (časy jako v DEMO)
const x = (km, carMin, transitMin, fuelCzk, tollCzk) => ({ km, carMin, transitMin, transitKind: 'rail', basis: 'route', fuelCzk, tollCzk, fareCzk: 600, carUrl: 'https://maps.example/c', transitUrl: 'https://maps.example/t' });
function italy(transfers = [x(277, 195, 115, 800, 540), x(245, 175, 155, 700, 480)], over = {}) {
  return lisbon({
    flight: { out: leg('PRG', 'FCO', '2026-11-10', '10:00', '12:00', 'Europe/Prague', 'Europe/Rome'), back: leg('VCE', 'PRG', '2026-11-16', '15:00', '16:30', 'Europe/Rome', 'Europe/Prague'), flightCzk: 2500, groundCzk: 0, bagCzk: 0, arrCzk: 0 },
    dest: { label: 'Řím', country: 'Itálie', cc: 'IT', lat: 41.9, lon: 12.5 },
    arrival: null,
    route: {
      mode: 'multi', transport: 'car', exclude: [], candidates: [], notes: [], legs: {}, transfers,
      bases: [
        { id: 'rome', name: 'Řím', lat: 41.9028, lon: 12.4964, cc: 'IT', country: 'Itálie', nights: 2 },
        { id: 'fi', name: 'Florencie', lat: 43.7696, lon: 11.2558, cc: 'IT', country: 'Itálie', nights: 2 },
        { id: 've', name: 'Benátky', lat: 45.4408, lon: 12.3155, cc: 'IT', country: 'Itálie', nights: 2 },
      ],
    },
    ...over,
  });
}

test('auto jen na 2 dny uprostřed pobytu (Lisabon 5 nocí): cesta z letiště do města i zpět zůstane v ceně a v průběhu cesty', () => {
  const c = load(), { Trip } = c.window;
  const arrival = (t) => Trip.costs(t).arrival;
  const metro = (t) => Trip.timeline(t).filter((r) => r[1] === '🚇').length;
  assert.deepEqual([arrival(lisbon()), metro(lisbon())], [200, 2], 'bez auta: metro tam i zpět, 2 osoby');
  // auto 12.–14. vyzvednuté i vrácené na letišti LIS: do města a zpět se jede metrem
  const mid = lisbon({ car: car('2026-11-12T09:00', '2026-11-14T09:00') });
  assert.deepEqual([arrival(mid), metro(mid)], [200, 2]);
  // auto hned po příletu a vrácené před odletem (výchozí časy kroku Auto): metro odpadá
  const all = lisbon({ car: car('2026-11-10T13:55', '2026-11-15T13:00') });
  assert.deepEqual([arrival(all), metro(all)], [0, 0]);
  // auto od příletu, vrácené o dva dny dřív: metro jen zpět na letiště
  const first = lisbon({ car: car('2026-11-10T13:55', '2026-11-12T18:00') });
  assert.deepEqual([arrival(first), metro(first)], [100, 1]);
  // auto bez času (starší cesta): jako dřív podle letiště
  assert.equal(arrival(lisbon({ car: { mode: 'manual', totalCzk: 2400, pickup: 'LIS', dropoff: 'LIS' } })), 0);
});

test('krok Auto: ve městě s metrem / vlakem z letiště krátký důvod, proč auto nebrat; Mallorca (autobus), hotel za městem a vybrané auto bez něj', () => {
  const c = load();
  const tip = /Ve městě auto spíš nepotřebuješ<\/b> – Lisabon projdeš pěšky a MHD, z letiště jede metro/;
  const h = render(c, lisbon());
  assert.match(h, tip);
  assert.match(h, /id="carSkipTop"/, 'tlačítko Auto nepotřebuji hned u důvodu');
  assert.match(render(c, lisbon({ stay: { mode: 'pick', name: 'Hotel v centru', totalCzk: 5000, lat: 38.715, lon: -9.14 } })), tip);
  // ubytování v Cascais (~25 km od centra) – auto dává smysl
  assert.doesNotMatch(render(c, lisbon({ stay: { mode: 'pick', name: 'Cascais Bay', totalCzk: 5000, lat: 38.697, lon: -9.421 } })), /Ve městě auto/);
  const pmi = render(c, mallorca());
  assert.doesNotMatch(pmi, /Ve městě auto/);
  assert.match(pmi, /Na místě se obejdeš bez auta\?/);
  assert.match(pmi, /Dětské autosedačky přidej při rezervaci/);
  assert.doesNotMatch(render(c, lisbon({ car: car('2026-11-12T09:00', '2026-11-14T09:00') })), /Ve městě auto/);
});

test('krok Auto: Itálie upozorní na zóny ZTL, Portugalsko na elektronické mýtné, Španělsko nic', () => {
  const c = load();
  const pt = render(c, lisbon());
  assert.match(pt, /Portugalsko – elektronické mýtné:<\/b> část dálnic má jen brány bez budek/);
  assert.match(pt, /mýtnou službu půjčovny \(transpondér, za poplatek\) – jinak mýtné doplatíš na poště CTT do 15 pracovních dnů/);
  assert.doesNotMatch(pt, /ZTL/);
  const it = render(c, italy());
  assert.match(it, /Itálie – zóny ZTL:<\/b> do historických center mnoha měst smí jen auta s povolením/);
  assert.match(it, /dej hotelu předem SPZ/);
  assert.doesNotMatch(it, /elektronické mýtné/);
  const es = render(c, mallorca());
  assert.doesNotMatch(es, /ZTL|elektronické mýtné/);
});

test('krok Auto: trasa autem, kde je vlak rychlejší – důvod u trasy; cena auta proti palivu a mýtnému zvlášť', () => {
  const c = load();
  const both = render(c, italy());
  assert.match(both, /Vlakem rychleji:<\/b> Řím → Florencie ~1 h 55 min \(autem ~3 h 15 min\), Florencie → Benátky ~2 h 35 min \(autem ~2 h 55 min\) – mezi místy auto nepotřebuješ/);
  assert.match(both, /class="btn primary" id="carTransit"/, 'bez auta vlakem jako hlavní volba');
  // jen první přejezd výrazně rychleji vlakem (druhý o 5 min) → auto jen na část trasy
  const one = render(c, italy([x(277, 195, 115, 800, 540), x(245, 175, 170, 700, 480)]));
  assert.match(one, /Vlakem rychleji:<\/b> Řím → Florencie ~1 h 55 min \(autem ~3 h 15 min\) – auto si můžeš půjčit jen na část trasy/);
  assert.match(one, /class="btn ghost" id="carTransit"/);
  assert.doesNotMatch(one, /Florencie → Benátky ~2 h 50 min/);
  // autobusem nebo pomaleji vlakem nic
  assert.doesNotMatch(render(c, italy([{ ...x(277, 195, 115, 800, 540), transitKind: 'bus' }, x(245, 175, 200, 700, 480)])), /Vlakem rychleji/);
  // co je v ceně auta: půjčovna; palivo a mýtné přejezdů odhadem zvlášť (800 + 540 + 700 + 480)
  assert.match(both, /Do ceny zadej, co zaplatíš půjčovně – i pojištění, autosedačky a příplatek za vrácení jinde\. Palivo a mýtné na přejezdech trasy počítám zvlášť \(odhad ~2 520 Kč\)/);
  assert.match(render(c, lisbon()), /Palivo, mýtné a parkování v ceně cesty nejsou – počítej s nimi navíc\./);
});

test('krok Auto: neúplný formulář řekne, co doplnit; vrácení v jiné zemi upozorní; starší odpověď srovnávačů nepřepíše novější', async () => {
  const c = load();
  const calls = [];
  c.fetch = (u) => new Promise((resolve) => {
    const q = new URLSearchParams(u.split('?')[1]);
    const body = { query: { pickup: q.get('pickup'), dropoff: q.get('dropoff'), from: q.get('from'), to: q.get('to'), pickupName: q.get('pickup'), pickupCc: 'PT', dropoffCc: q.get('dropoff') === 'VIE' ? 'AT' : 'PT' }, items: [], links: [{ id: 'kayak', name: 'Kayak', note: '', url: `https://www.cz.kayak.com/cars/${q.get('pickup')}/${q.get('to')}` }] };
    calls.push(() => resolve({ ok: true, json: async () => body }));
  });
  const set = (v) => { for (const [k, val] of Object.entries(v)) c.$(k).value = val; };
  set({ '#carPu': 'LIS', '#carDo': 'LIS', '#carFrom': '2026-11-10T13:55', '#carTo': '2026-11-15T13:00', '#carAge': '30' });
  render(c, lisbon());
  calls.shift()();
  await tick();
  assert.match(sp(c.__els['#carBody'].innerHTML), /cars\/LIS\/2026-11-15T13:00/);
  // kód letiště smazaný na dvě písmena: místo starých odkazů co doplnit (a žádný dotaz)
  set({ '#carPu': 'LI' });
  c.__els['#carPu'].onchange();
  assert.match(c.__els['#carBody'].innerHTML, /Doplň kód letiště vyzvednutí a vrácení \(3 písmena, třeba LIS\)/);
  assert.equal(calls.length, 0);
  // dvě rychlé změny: odpověď na první dorazí až po druhé – platí druhá
  set({ '#carPu': 'LIS', '#carTo': '2026-11-14T10:00' });
  c.__els['#carTo'].onchange();
  set({ '#carTo': '2026-11-13T10:00' });
  c.__els['#carTo'].onchange();
  const [older, newer] = calls.splice(0);
  newer();
  await tick();
  older();
  await tick();
  assert.match(c.__els['#carBody'].innerHTML, /cars\/LIS\/2026-11-13T10:00/);
  assert.doesNotMatch(c.__els['#carBody'].innerHTML, /2026-11-14T10:00/);
  // vrácení v jiné zemi
  set({ '#carDo': 'VIE' });
  c.__els['#carDo'].onchange();
  calls.shift()();
  await tick();
  assert.match(sp(c.__els['#carBody'].innerHTML), /Vrácení v jiné zemi<\/b> \(Rakousko\) – mezinárodní jednosměrný pronájem bývá výrazně dražší/);
  assert.match(sp(c.__els['#carDays'].innerHTML), /vrácení na jiném letišti \(VIE\) může stát příplatek/);
});

test('krok Auto: délka pronájmu po 24 h – vrácení kousek po celých dnech řekne, do kdy auto vrátit', () => {
  const c = load();
  const days = (from, to) => {
    c.$('#carPu').value = 'LIS'; c.$('#carDo').value = 'LIS'; c.$('#carFrom').value = from; c.$('#carTo').value = to;
    c.__els['#carTo'].onchange();
    return sp(c.__els['#carDays'].innerHTML);
  };
  c.fetch = () => new Promise(() => {});
  render(c, lisbon());
  // přílet 11:00 → vyzvednutí 11:45, odlet 15:00 → vrácení 13:00: 5 dní a 1 h 15 min = 6 dní
  assert.equal(days('2026-11-10T11:45', '2026-11-15T13:00'), '6 dní pronájmu · vrátíš-li auto do 11:45, bývá pronájem o den kratší');
  assert.equal(days('2026-11-10T13:55', '2026-11-15T13:00'), '5 dní pronájmu');
  assert.equal(days('2026-11-10T09:00', '2026-11-10T18:00'), '1 den pronájmu', 'jeden den nejde zkrátit');
  assert.equal(days('2026-11-10T09:00', '2026-11-12T15:00'), '3 dny pronájmu', 'přes 3 h po celém dni bez rady');
});
