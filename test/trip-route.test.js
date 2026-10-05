// Průvodce cestou s trasou přes víc míst (public/js/trip.js): termíny míst, ceny, události
// kalendáře po místech a kontrola sdíleného odkazu (cizí vstup). Klasické skripty prohlížeče
// načtené přes node:vm; pomocné funkce (esc, czk, fmtYMD…) jsou skutečné řádky z app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load() {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return { Trip: ctx.window.Trip, Ics: ctx.window.Ics };
}
const { Trip, Ics } = load();
// Pole a objekty z vm kontextu mají jiné prototypy – porovnávají se jako JSON.
const plain = (x) => JSON.parse(JSON.stringify(x));

const leg = (from, to, date, dep, arr, fromTz, toTz) => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 100', provider: 'demo-air', bookUrl: 'https://air.example/book',
});
const gm = (a, b, mode) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a)}&destination=${encodeURIComponent(b)}&travelmode=${mode}`;
const tr = (a, b, km, carMin, transitMin) => ({ km, carMin, transitMin, long: false, carUrl: gm(a, b, 'driving'), transitUrl: gm(a, b, 'transit') });
const day = (date, names) => ({ date, items: names.map((name, i) => ({ id: `${name}${i}`, name, lat: 45 + i / 100, lon: 9, category: 'sight', visitMin: 60 })) });

// Přílet do Bergama (Milán), odlet z Říma: 8 nocí = Milán 3 + Florencie 3 + Řím 2.
function multiTrip() {
  return {
    v: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary',
    flight: { out: leg('PRG', 'BGY', '2026-11-10', '07:00', '08:30', 'Europe/Prague', 'Europe/Rome'), back: leg('FCO', 'PRG', '2026-11-18', '19:00', '21:00', 'Europe/Rome', 'Europe/Prague'), flightCzk: 3000, groundCzk: 200, bagCzk: 0 },
    dest: { label: 'Milán', country: 'Itálie', cc: 'IT', lat: 45.4642, lon: 9.19 }, ground: {},
    stay: { mode: 'pick', name: 'Starý hotel z jednoho místa', totalCzk: 99999 }, car: null, plan: null,
    route: {
      mode: 'multi', transport: 'car', want: 3, exclude: [], candidates: [{ id: 'Q7', name: 'Pisa', lat: 43.72, lon: 10.4 }], notes: [],
      arrival: { iata: 'BGY', name: 'Milán-Bergamo (BGY)', lat: 45.6694, lon: 9.7089 }, departure: { iata: 'FCO', name: 'Řím (FCO)', lat: 41.8045, lon: 12.252 },
      bases: [
        { id: 'city:MIL', name: 'Milán', lat: 45.4642, lon: 9.19, nights: 3, cc: 'IT', country: 'Itálie', anchor: 'arrival', reason: 'město příletu', highlights: ['Dóm'],
          stay: { mode: 'pick', id: 'h1', name: 'Hotel Duomo', totalCzk: 9000, url: 'https://hotel.example/duomo', lat: 45.464, lon: 9.19, checkin: '2026-11-10', checkout: '2026-11-13' },
          plan: { center: { lat: 45.464, lon: 9.19 }, days: [day('2026-11-10', ['Dóm', 'Galerie']), day('2026-11-11', ['Brera']), day('2026-11-13', [])] } },
        { id: 'Q5', name: 'Florencie', lat: 43.7696, lon: 11.2558, nights: 3, cc: '', country: '', highlights: ['Uffizi'], stay: { mode: 'manual', name: 'U kamaráda', totalCzk: 4000, checkin: '2026-11-13', checkout: '2026-11-16' }, plan: null },
        { id: 'city:ROM', name: 'Řím', lat: 41.8933, lon: 12.4829, nights: 2, cc: 'IT', country: 'Itálie', anchor: 'departure', stay: { mode: 'links', name: '', totalCzk: 0 }, plan: { center: { lat: 41.89, lon: 12.48 }, days: [day('2026-11-17', ['Koloseum'])] } },
      ],
      transfers: [tr('Milán, Itálie', 'Florencie', 299, 189, 202), tr('Florencie', 'Řím, Itálie', 278, 177, 190)],
      legs: { arrival: tr('BGY airport', 'Milán, Itálie', 56, 60, 55), departure: tr('Řím, Itálie', 'FCO airport', 28, 37, 39) },
    },
  };
}

test('trip: termíny míst trasy navazují a pokryjí celý pobyt; ceny sečtou hotely všech míst', () => {
  const t = multiTrip();
  assert.deepEqual(plain(Trip.baseDates(t)), [
    { checkin: '2026-11-10', checkout: '2026-11-13', nights: 3 },
    { checkin: '2026-11-13', checkout: '2026-11-16', nights: 3 },
    { checkin: '2026-11-16', checkout: '2026-11-18', nights: 2 },
  ]);
  const c = Trip.costs(t);
  assert.equal(c.stay, 13000, 'hotel + ruční cena, „jen odkazy“ = 0, starý hotel jednoho místa se nepočítá');
  assert.equal(c.total, 3000 * 2 + 200 * 2 + 13000);
  assert.equal(c.perPerson, c.total / 2);
  // Jedno místo (i s uloženou trasou) = jako dřív.
  const single = { ...multiTrip(), route: { ...multiTrip().route, mode: 'single' } };
  assert.equal(Trip.costs(single).stay, 99999);
  const old = { ...multiTrip() };
  delete old.route;
  assert.equal(Trip.costs(old).stay, 99999, 'stará cesta bez trasy');
});

test('trip: kalendář – pobyt na každém místě (celodenní), přejezdy s časem a programy po místech', () => {
  const t = multiTrip();
  const ev = plain(Trip.calendarEvents(t));
  const stays = ev.filter((e) => e.title.startsWith('🏨'));
  assert.deepEqual(stays.map((e) => [e.title, e.start, e.end]), [
    ['🏨 Hotel Duomo – Milán', '2026-11-10', '2026-11-13'],
    ['🏨 U kamaráda – Florencie', '2026-11-13', '2026-11-16'],
    ['🏨 Ubytování: Řím', '2026-11-16', '2026-11-18'],
  ]);
  assert.equal(stays[0].url, 'https://hotel.example/duomo');
  assert.match(stays[2].url, /^https:\/\/www\.booking\.com\/searchresults\.cs\.html\?ss=%C5%98%C3%ADm%2C\+It%C3%A1lie&checkin=2026-11-16&checkout=2026-11-18&group_adults=2/, 'místo bez hotelu → hledání na jeho data');
  assert.match(stays[0].description, /Cena celkem 9[\s ]000 Kč/);
  assert.match(stays[2].description, /zatím nevybráno/);
  const moves = ev.filter((e) => e.title.startsWith('🚗 Přejezd'));
  assert.deepEqual(moves.map((e) => [e.title, e.start, e.tz, e.durationMin]), [
    ['🚗 Přejezd Milán → Florencie', '2026-11-13T11:00', 'Europe/Rome', 189],
    ['🚗 Přejezd Florencie → Řím', '2026-11-16T11:00', 'Europe/Rome', 177],
  ]);
  assert.match(moves[0].url, /travelmode=driving/);
  const prog = ev.filter((e) => e.title.startsWith('Den '));
  assert.deepEqual(prog.map((e) => [e.title, e.start]), [['Den 1 – Milán', '2026-11-10'], ['Den 2 – Milán', '2026-11-11'], ['Den 1 – Řím', '2026-11-17']]);
  // Celý soubor .ics: 2 lety + 3 pobyty + 2 přejezdy + 3 dny programu; přejezd v UTC (11:00 v Římě = 10:00Z).
  const ics = Ics.build(Trip.calendarEvents(t), { now: Date.UTC(2026, 9, 5) });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 10);
  assert.ok(ics.includes('DTSTART:20261113T100000Z\r\nDTEND:20261113T130900Z'), 'přejezd 3 h 9 min');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261113\r\nDTEND;VALUE=DATE:20261117'));
  // Vlakem: časy a odkazy na spoje.
  const tt = multiTrip();
  tt.route.transport = 'transit';
  const tm = plain(Trip.calendarEvents(tt)).filter((e) => e.title.includes('Přejezd'));
  assert.deepEqual(tm.map((e) => [e.title, e.durationMin]), [['🚆 Přejezd Milán → Florencie', 202], ['🚆 Přejezd Florencie → Řím', 190]]);
  assert.match(tm[0].url, /travelmode=transit/);
});

test('trip: kalendář staré cesty bez trasy (a jednoho místa) se nemění', () => {
  for (const mutate of [(t) => { delete t.route; }, (t) => { t.route.mode = 'single'; }, (t) => { t.route.bases = t.route.bases.slice(0, 1); }]) {
    const t = multiTrip();
    mutate(t);
    const ev = Trip.calendarEvents(t);
    const stays = ev.filter((e) => e.title.startsWith('🏨'));
    assert.equal(stays.length, 1);
    assert.deepEqual([stays[0].title, stays[0].start, stays[0].end], ['🏨 Starý hotel z jednoho místa', '2026-11-10', '2026-11-18']);
    assert.equal(ev.filter((e) => /Přejezd/.test(e.title)).length, 0);
    assert.equal(Trip.costs(t).stay, 99999);
  }
});

test('sanitizeTrip: trasa ze sdíleného odkazu – škodlivá místa, odkazy, čísla a klíče', () => {
  const xss = '<img src=x onerror=alert(1)>"\'`';
  const raw = multiTrip();
  raw.route.bases = [
    { ...raw.route.bases[0], name: `${xss}Milán`, nameEn: `${xss}Milan`, id: 'x" onclick="alert(1)', anchor: 'evil', cc: 'it', reason: xss, highlights: [xss, 5, { a: 1 }, ...Array(10).fill('h')], onload: 'alert(1)', extra: { deep: true },
      searchUrl: 'javascript:alert(1)', stay: { mode: 'pick', name: xss, totalCzk: 1e12, url: 'javascript:alert(1)', lat: 999, rating: 42, checkin: '2026-11-10"><script>' } },
    { ...raw.route.bases[1], stay: { mode: 'hack', totalCzk: 5 }, plan: { center: { lat: 'x', lon: 1 }, days: [] } },
    { ...raw.route.bases[2], plan: { center: { lat: 41.9, lon: 12.5 }, days: [day('2026-11-17', ['Koloseum']), { date: 'zítra', items: [] }, { date: '2026-11-18', items: [{ name: 'bez polohy' }, 'x'] }] } },
    { name: 'Mimo mapu', lat: 999, lon: 9, nights: 1 },
    { name: 'Nula nocí', lat: 45, lon: 9, nights: 0 },
    { name: 'Půl noci', lat: 45, lon: 9, nights: 1.5 },
    { name: 'Moc nocí', lat: 45, lon: 9, nights: 31 },
    { name: '', lat: 45, lon: 9, nights: 1 },
    { name: 'Text místo čísla', lat: '45', lon: 9, nights: 1 },
    'Řím', null, [1, 2],
  ];
  raw.route.transfers = [{ km: 'daleko', carMin: 1, transitMin: 1 }, { km: 1, carMin: NaN, transitMin: 1 }];
  raw.route.legs = 'x';
  raw.route.arrival = { iata: 'BG<', lat: 45, lon: 9 };
  raw.route.want = 99;
  raw.route.transport = 'teleport';
  raw.route.exclude = ['Q1', 7, 'x'.repeat(500)];
  raw.route.notes = [xss, 1];
  // „__proto__“ jako vlastní klíč (tak ho vytvoří JSON.parse) nesmí podvrhnout prototyp.
  const json = JSON.stringify(raw).replace('"route":{', '"route":{"__proto__":{"polluted":true},');
  const t = Trip.sanitizeTrip(JSON.parse(json));
  assert.equal(t.route.polluted, undefined);
  assert.equal(Object.getPrototypeOf(t.route), Object.getPrototypeOf(Trip.sanitizeTrip(JSON.parse(JSON.stringify(multiTrip()))).route), 'prototyp trasy nepodvržen');
  const r = plain(t.route);
  assert.equal(r.mode, 'multi');
  assert.equal(r.transport, 'car');
  assert.equal(r.want, null);
  assert.deepEqual(r.bases.map((b) => b.name), ['img src=x onerror=alert(1)Milán', 'Florencie', 'Řím'], 'neplatná místa vyřazená, texty bez HTML');
  const [m, f, rome] = r.bases;
  assert.deepEqual(Object.keys(m).sort(), ['anchor', 'cc', 'country', 'highlights', 'id', 'lat', 'lon', 'name', 'nameEn', 'nights', 'plan', 'reason', 'searchUrl', 'stay'].sort(), 'jen známá pole');
  assert.equal(m.nameEn, 'img src=x onerror=alert(1)Milan');
  assert.equal(f.nameEn, '', 'chybějící anglický název = prázdný');
  assert.equal(m.id, 'b0', 'podezřelé id nahrazené');
  assert.equal(m.anchor, null);
  assert.equal(m.cc, '');
  assert.equal(m.searchUrl, null);
  assert.equal(m.highlights.length, 5);
  assert.ok(m.highlights.every((h) => typeof h === 'string' && !/[<>"'`]/.test(h)));
  assert.deepEqual([m.stay.mode, m.stay.totalCzk, m.stay.url, m.stay.lat, m.stay.rating, m.stay.checkin], ['pick', 0, null, null, null, null]);
  assert.ok(!/[<>"'`]/.test(m.stay.name));
  assert.equal(f.stay, null, 'neznámý druh ubytování');
  assert.equal(f.plan, null, 'program bez platného středu');
  assert.deepEqual(rome.plan.days.map((d) => [d.date, d.items.length]), [['2026-11-17', 1], ['2026-11-18', 0]]);
  assert.deepEqual(r.transfers, [], 'poškozené přejezdy se dopočítají znovu');
  assert.deepEqual(JSON.parse(JSON.stringify(r.legs)), { arrival: null, departure: null });
  assert.equal(r.arrival, null);
  assert.equal(r.departure.iata, 'FCO');
  assert.deepEqual(r.candidates, []);
  assert.deepEqual(r.exclude, ['Q1']);
  assert.ok(r.notes.every((x) => typeof x === 'string' && !/[<>"'`]/.test(x)));
  assert.equal({}.polluted, undefined);
  // Přejezdy v pořádku → zůstanou, odkazy jen http(s).
  const ok = multiTrip();
  ok.route.transfers[1].carUrl = 'javascript:alert(1)';
  const s2 = Trip.sanitizeTrip(JSON.parse(JSON.stringify(ok))).route;
  assert.equal(s2.transfers.length, 2);
  assert.equal(s2.transfers[1].carUrl, null);
  assert.match(s2.transfers[0].carUrl, /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.equal(s2.legs.departure.carMin, 37);
  // Méně než 2 platná místa → jedno místo celý pobyt; nesmyslná trasa → bez trasy.
  const one = multiTrip();
  one.route.bases = [one.route.bases[0], { name: 'x', lat: 1, lon: 1, nights: -1 }];
  assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify(one))).route.mode, 'single');
  for (const route of ['multi', 5, [1], null]) {
    const x = multiTrip();
    x.route = route;
    assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify(x))).route, null);
  }
  // Víc než 6 míst se ořízne.
  const many = multiTrip();
  many.route.bases = Array.from({ length: 9 }, (_, i) => ({ name: `M${i}`, lat: 45 + i, lon: 9, nights: 1 }));
  assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify(many))).route.bases.length, 6);
  // Stará sdílená cesta bez trasy projde jako dřív.
  const old = multiTrip();
  delete old.route;
  const so = Trip.sanitizeTrip(JSON.parse(JSON.stringify(old)));
  assert.equal(so.route, null);
  assert.equal(Trip.costs(so).stay, 99999);
});

test('trip: program místa po změně trasy neplatí – shrnutí, kalendář ani plánovač ho nepoužijí', () => {
  const t = multiTrip();
  // Program sestavený plánovačem nese termín, pro který platí (span).
  t.route.bases[0].plan.span = { start: '2026-11-10', end: '2026-11-13', arrivalTime: '08:30', departureTime: '14:00' };
  t.route.bases[2].plan.span = { start: '2026-11-16', end: '2026-11-18', arrivalTime: '14:00', departureTime: '19:00' };
  const days = (tt) => plain(Trip.calendarEvents(tt)).filter((e) => e.title.startsWith('Den ')).map((e) => [e.title, e.start]);
  assert.deepEqual(days(t), [['Den 1 – Milán', '2026-11-10'], ['Den 2 – Milán', '2026-11-11'], ['Den 1 – Řím', '2026-11-17']]);
  // Milán o noc kratší, Florencie o noc delší: Milán končí 12. 11. → jeho program (do 13. 11.) neplatí; Řím beze změny.
  t.route.bases[0].nights = 2;
  t.route.bases[1].nights = 4;
  assert.deepEqual(days(t), [['Den 1 – Řím', '2026-11-17']]);
  // Program bez termínu (starší sdílený odkaz): platí, jen když všechny dny leží v termínu místa.
  delete t.route.bases[2].plan.span;
  t.route.bases[2].plan.days.push({ date: '2026-11-15', items: [{ id: 'x', name: 'Mimo termín', lat: 41.9, lon: 12.5 }] });
  assert.deepEqual(days(t), []);
});

