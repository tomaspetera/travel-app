import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLeg } from '../server/lib/fares.js';
import { bestRoundTrips, bestOneWays, cheapestPerDay, dateOk, oneWayCalendar } from '../server/lib/optimizer.js';
import { localSuggestions, resolveOrigins, resolveDestinations, describe } from '../server/lib/places.js';
import { groundEstimate, haversineKm } from '../server/lib/geo.js';
import { convert, setRates, FALLBACK_EUR } from '../server/lib/fx.js';
import { chunkRange, monthsInRange, weekday } from '../server/lib/dates.js';
import { normalizeQuery, referencePrice, routesNote } from '../server/lib/search.js';
import { ymdPlus } from './helpers.js';

const leg = (provider, from, to, date, czk) => makeLeg({ provider, from, to, dep: `${date}T10:00:00`, czk, price: czk, currency: 'CZK' });

test('cheapestPerDay ponechá jen nejlevnější let pro (odkud, kam, den)', () => {
  const r = cheapestPerDay([leg('a', 'VIE', 'BGY', '2026-11-03', 900), leg('b', 'VIE', 'BGY', '2026-11-03', 700), leg('a', 'VIE', 'BGY', '2026-11-04', 800)]);
  assert.equal(r.length, 2);
  assert.equal(r.find((l) => l.date === '2026-11-03').provider, 'b');
});

test('dateOk: počet nocí a dny v týdnu', () => {
  // 2026-11-06 je pátek, 2026-11-08 neděle
  assert.equal(weekday('2026-11-06'), 5);
  const c = { nightsMin: 1, nightsMax: 3, outDays: [4, 5], backDays: [0, 1] };
  assert.equal(dateOk('2026-11-06', '2026-11-08', c), true);
  assert.equal(dateOk('2026-11-07', '2026-11-08', c), false); // sobota není povolený odlet
  assert.equal(dateOk('2026-11-06', '2026-11-10', c), false); // 4 noci
});

test('bestRoundTrips: kombinuje aerolinky, open-jaw domov i cíl a započítá dopravu', () => {
  const ground = { VIE: 300, BTS: 50 };
  const groundOf = (i) => ground[i] ?? 0;
  const out = [leg('ryanair', 'VIE', 'BGY', '2026-11-03', 500), leg('wizzair', 'BTS', 'BGY', '2026-11-03', 650)];
  const back = [
    leg('wizzair', 'MXP', 'BTS', '2026-11-06', 400), // Milán MXP → BTS (open-jaw v cíli i doma)
    leg('ryanair', 'BGY', 'VIE', '2026-11-06', 700),
    leg('ryanair', 'BGY', 'VIE', '2026-11-20', 100), // mimo rozsah nocí
  ];
  const trips = bestRoundTrips(out, back, groundOf, { nightsMin: 2, nightsMax: 5, openJawHome: true, openJawDest: true, limit: 10, perDestLimit: 10 });
  assert.ok(trips.length >= 2);
  const best = trips[0];
  // Nejlevnější celkem: BTS→BGY 650 + doprava 50, zpět MXP→BTS 400 + 50 = 1150
  // (VIE→BGY je levnější letenka, ale doprava do Vídně 300 Kč ji prodraží).
  const totals = trips.map((t) => t.flightCzk + groundOf(t.out.from) + groundOf(t.back.to));
  assert.deepEqual(totals, [...totals].sort((a, b) => a - b));
  assert.equal(totals[0], 1150);
  assert.equal(best.out.from, 'BTS');
  assert.equal(best.back.from, 'MXP');
  assert.equal(best.provider, 'wizzair');
  assert.ok(trips.some((t) => t.provider === 'mix'), 'umí kombinovat dvě aerolinky');
  assert.ok(trips.every((t) => t.nights >= 2 && t.nights <= 5));

  const strict = bestRoundTrips(out, back, groundOf, { nightsMin: 2, nightsMax: 5, openJawHome: false, openJawDest: false, limit: 10, perDestLimit: 10 });
  assert.ok(strict.every((t) => t.back.from === t.out.to && t.back.to === t.out.from));
});

test('bestRoundTrips: kalendář nejlevnějších celých cest podle dne', () => {
  const out = [leg('a', 'VIE', 'BCN', '2026-11-03', 500), leg('a', 'VIE', 'BCN', '2026-11-04', 300)];
  const back = [leg('a', 'BCN', 'VIE', '2026-11-07', 400), leg('a', 'BCN', 'VIE', '2026-11-08', 200)];
  const maps = { out: new Map(), back: new Map() };
  bestRoundTrips(out, back, () => 0, { nightsMin: 3, nightsMax: 4, limit: 10, perDestLimit: 10, perDay: 2, calendar: maps });
  assert.equal(maps.out.get('2026-11-03').cost, 900); // 3.→7. (4 noci); 8. by bylo 5 nocí
  assert.equal(maps.out.get('2026-11-04').cost, 500); // 4.→8.
  assert.equal(maps.back.get('2026-11-08').cost, 500);
});

test('bestOneWays + oneWayCalendar respektují dny odletu', () => {
  const out = [leg('a', 'PRG', 'STN', '2026-11-06', 500), leg('a', 'PRG', 'STN', '2026-11-07', 300)];
  const trips = bestOneWays(out, () => 0, { outDays: [5], limit: 10, perDestLimit: 10 });
  assert.deepEqual(trips.map((t) => t.out.date), ['2026-11-06']);
  assert.deepEqual(oneWayCalendar(out, () => 100, { outDays: [5] }).map((d) => d.cost), [600]);
});

test('našeptávač: české názvy, země, metropole, regiony a IATA kódy', () => {
  assert.equal(localSuggestions('Vídeň')[0].id, 'ap:VIE');
  assert.equal(localSuggestions('cesko')[0].id, 'cc:CZ');
  assert.equal(localSuggestions('Německo')[0].id, 'cc:DE');
  assert.equal(localSuggestions('lond')[0].id, 'metro:LON');
  assert.equal(localSuggestions('kanáry')[0].id, 'rg:kanary');
  assert.equal(localSuggestions('STN')[0].id, 'ap:STN');
  assert.equal(localSuggestions('mnichov')[0].id, 'ap:MUC');
  assert.ok(!localSuggestions('Vídeň').some((s) => s.id === 'ap:PLS'), 'žádný šum typu proVIDENciales');
  assert.equal(describe('geo:49.3961,15.5912|Jihlava').label, 'Jihlava');
});

test('resolveOrigins: libovolné místo → letiště v okruhu se vzdáleností a odhadem dopravy', () => {
  const r = resolveOrigins(['geo:49.3961,15.5912|Jihlava'], { radiusKm: 200 });
  const codes = r.airports.map((a) => a.iata);
  for (const c of ['PRG', 'BRQ', 'VIE']) assert.ok(codes.includes(c), `${c} je do 200 km od Jihlavy`);
  assert.ok(r.airports.every((a) => a.distKm <= 200));
  const prg = r.airports.find((a) => a.iata === 'PRG');
  assert.ok(prg.ground.czk > 100 && prg.ground.minutes > 60);
  // Země → všechna (větší) letiště země, bez dopravy
  const cz = resolveOrigins(['cc:CZ'], { radiusKm: 0 });
  assert.ok(['PRG', 'BRQ', 'OSR'].every((c) => cz.airports.some((a) => a.iata === c)));
  assert.equal(cz.home, null);
  // Konkrétní letiště + okruh
  const vie = resolveOrigins(['ap:VIE'], { radiusKm: 80 });
  assert.deepEqual(vie.airports.map((a) => a.iata), ['VIE', 'BTS']);
  assert.equal(resolveOrigins(['ap:VIE'], { radiusKm: 0 }).airports.length, 1);
});

test('resolveDestinations', () => {
  assert.equal(resolveDestinations([]).kind, 'anywhere');
  assert.deepEqual(resolveDestinations(['cc:ES', 'cc:PT']).countries, ['ES', 'PT']);
  const lon = resolveDestinations(['metro:LON']);
  assert.equal(lon.kind, 'airports');
  assert.ok(lon.airports.includes('STN') && lon.airports.includes('LTN'));
  assert.deepEqual(resolveDestinations(['rg:kreta']).airports, ['HER', 'CHQ']);
});

test('geo + čas cesty mezi letištěm a městem', () => {
  const d = haversineKm(50.0755, 14.4378, 48.2082, 16.3738); // Praha–Vídeň
  assert.ok(d > 245 && d < 260);
  const g = groundEstimate(d);
  assert.ok(g.minutes > 200 && g.minutes < 300);
  assert.equal(g.czk, undefined, 'cena cesty na letiště je v access.js');
  assert.deepEqual(groundEstimate(10), { km: 10, minutes: 42, local: true });
});

test('fx: převod měn přes EUR', () => {
  setRates({ base: 'EUR', rates: { ...FALLBACK_EUR, CZK: 25, PLN: 4 }, source: 'test' });
  assert.equal(convert(100, 'EUR', 'CZK'), 2500);
  assert.equal(convert(40, 'PLN', 'CZK'), 250);
  assert.equal(convert(10, 'XYZ', 'CZK'), null);
});

test('data: rozdělení intervalů', () => {
  assert.deepEqual(chunkRange('2026-11-01', '2026-11-10', 4), [['2026-11-01', '2026-11-04'], ['2026-11-05', '2026-11-08'], ['2026-11-09', '2026-11-10']]);
  assert.deepEqual(monthsInRange('2026-11-20', '2027-01-03'), ['2026-11-01', '2026-12-01', '2027-01-01']);
});

test('normalizeQuery: validace a výchozí hodnoty', () => {
  assert.throws(() => normalizeQuery({}), /odkud/);
  const q = normalizeQuery({ from: ['ap:VIE'], dateFrom: '2000-01-01', dateTo: '2000-01-05', nightsMin: 9, nightsMax: 2, adults: 50, outDays: [5, 9, 'x'] });
  assert.ok(q.dateFrom >= ymdPlus(-1), 'minulost se posune na dnešek');
  assert.equal(q.nightsMin, 2);
  assert.equal(q.nightsMax, 9);
  assert.equal(q.adults, 9);
  assert.deepEqual(q.outDays, [5]);
  assert.equal(q.trip, 'return');
  assert.ok(referencePrice(1000) < referencePrice(5000));
});

test('makeLeg: chybějící přílet se dopočte v místním čase cíle (z délky letu, jinak odhad)', async () => {
  const { makeLeg } = await import('../server/lib/fares.js');
  // Travelpayouts: odlet + délka letu, Praha (UTC+1 v listopadu) → Dubaj (UTC+4)
  const tp = makeLeg({ provider: 'travelpayouts', from: 'PRG', to: 'DXB', dep: '2026-11-10T22:00:00', durationMin: 345, czk: 5000 });
  assert.equal(tp.arr.slice(0, 16), '2026-11-11T06:45');
  assert.equal(tp.arrEst, false);
  // Zóny letišť pro export do kalendáře; neznámé letiště → null
  assert.deepEqual([tp.fromTz, tp.toTz], ['Europe/Prague', 'Asia/Dubai']);
  assert.equal(makeLeg({ provider: 'x', from: 'PRG', to: 'ZZZ', dep: '2026-11-10T10:00:00', czk: 1 }).toTz, null);
  // Wizz: jen čas odletu → odhad ze vzdálenosti, označený
  const wz = makeLeg({ provider: 'wizzair', from: 'VIE', to: 'BCN', dep: '2026-11-10T20:15:00', czk: 1200 });
  assert.equal(wz.arrEst, true);
  assert.ok(wz.arr > '2026-11-10T22:00' && wz.arr < '2026-11-10T23:15', wz.arr);
  // Bez času odletu nic nevymýšlí
  assert.equal(makeLeg({ provider: 'x', from: 'VIE', to: 'BCN', dep: '2026-11-10', czk: 1 }).arr, null);
  // Let s přestupem bez věrohodné délky (cache): přílet neznámý – ani odhad ze vzdálenosti (byl by jako přímý let)
  const unk = makeLeg({ provider: 'travelpayouts', from: 'PRG', to: 'BCN', dep: '2026-10-30T20:30:00', stops: 1, durationMin: null, arrUnknown: true, czk: 1173 });
  assert.deepEqual([unk.arr, unk.arrEst, unk.arrUnknown, unk.durationMin, unk.estMin, unk.hasTime], [null, false, true, null, undefined, true]);
});

test('přesná data: odlet i návrat jen v zadané dny (± tolerance)', async () => {
  const { normalizeQuery } = await import('../server/lib/search.js');
  const { dateOk } = await import('../server/lib/optimizer.js');
  const out = ymdPlus(20);
  const back = ymdPlus(27);
  const q = normalizeQuery({ from: ['ap:VIE'], trip: 'return', exactOut: out, exactBack: back, outDays: [5] });
  assert.equal(q.dateFrom, out);
  assert.equal(q.dateTo, out);
  assert.deepEqual([q.nightsMin, q.nightsMax], [7, 7]);
  assert.deepEqual(q.outDays, [], 'dny v týdnu se při přesných datech ignorují');
  const c = { nightsMin: q.nightsMin, nightsMax: q.nightsMax, outFrom: q.dateFrom, outTo: q.dateTo, backFrom: q.exact.backFrom, backTo: q.exact.backTo };
  assert.ok(dateOk(out, back, c));
  assert.ok(!dateOk(ymdPlus(21), ymdPlus(28), c), 'stejný počet nocí, ale jiné dny → ne');

  const f = normalizeQuery({ from: ['ap:VIE'], trip: 'return', exactOut: out, exactBack: back, flexDays: 1 });
  assert.deepEqual([f.dateFrom, f.dateTo, f.exact.backFrom, f.exact.backTo], [ymdPlus(19), ymdPlus(21), ymdPlus(26), ymdPlus(28)]);
  assert.deepEqual([f.nightsMin, f.nightsMax], [5, 9]);
  const fc = { nightsMin: f.nightsMin, nightsMax: f.nightsMax, outFrom: f.dateFrom, outTo: f.dateTo, backFrom: f.exact.backFrom, backTo: f.exact.backTo };
  assert.ok(dateOk(ymdPlus(21), ymdPlus(26), fc));
  assert.ok(!dateOk(ymdPlus(19), ymdPlus(24), fc), 'návrat mimo ±1 den');

  const ow = normalizeQuery({ from: ['ap:VIE'], trip: 'oneway', exactOut: out });
  assert.deepEqual([ow.dateFrom, ow.dateTo, ow.exact.back], [out, out, null]);
  assert.throws(() => normalizeQuery({ from: ['ap:VIE'], trip: 'return', exactOut: out, exactBack: ymdPlus(10) }), /Návrat/);
  assert.throws(() => normalizeQuery({ from: ['ap:VIE'], trip: 'return', exactOut: out }), /návratu/);
});


test('legsPerDay: na den nejlevnější + nejlevnější přímý + jiné aerolinky (pro přesná data)', async () => {
  const { legsPerDay } = await import('../server/lib/optimizer.js');
  const L = (carrier, dep, czk, stops) => makeLeg({ provider: 'kiwi', carrier, from: 'VIE', to: 'BCN', dep: `2026-11-06T${dep}:00`, czk, price: czk, currency: 'CZK', stops });
  const day = [L('FR', '06:10', 900, 1), L('FR', '07:00', 950, 1), L('OS', '09:55', 2400, 0), L('VY', '12:00', 1500, 1), L('FR', '17:10', 1200, 0)];
  const one = legsPerDay(day, 1);
  assert.equal(one.length, 1);
  assert.equal(one[0].czk, 900);
  const four = legsPerDay(day, 4);
  assert.deepEqual(four.map((l) => l.czk), [900, 1200, 1500, 2400], 'nejlevnější, nejlevnější přímý, VY, OS');
  assert.ok(four.some((l) => !l.stops), 'přímý let se neztratí');
  // Zpáteční: přímé lety se nabídnou i vedle levnějšího s přestupem.
  const back = [makeLeg({ provider: 'kiwi', carrier: 'FR', from: 'BCN', to: 'VIE', dep: '2026-11-10T06:10:00', czk: 800, price: 800, currency: 'CZK', stops: 1 }),
    makeLeg({ provider: 'ryanair', carrier: 'FR', from: 'BCN', to: 'VIE', dep: '2026-11-10T11:15:00', czk: 1300, price: 1300, currency: 'CZK', stops: 0 })];
  const trips = bestRoundTrips(day, back, () => 0, { nightsMin: 4, nightsMax: 4, legsPerDay: 4, limit: 50, perDestLimit: 50 });
  assert.ok(trips.length >= 4);
  assert.ok(trips.some((t) => !t.out.stops && !t.back.stops), 'existuje varianta přímo tam i zpět');
});

test('přesná data (variety): všechny přímé lety, přestupní let nezabere místo přímému téže aerolinky, různé části dne', async () => {
  const { legsPerDay, dayVariety } = await import('../server/lib/optimizer.js');
  const L = (provider, carrier, dep, czk, stops = 0) => makeLeg({ provider, carrier, from: 'PRG', to: 'BCN', dep: `2026-11-06T${dep}:00`, czk, price: czk, currency: 'CZK', stops });
  const day = [
    L('kiwi', 'FR', '21:55', 2400, 2), // levnější FR s přestupy (self-transfer)
    L('kiwi', 'FR', '06:30', 2500, 1),
    L('kiwi', 'FR', '07:10', 2550, 1),
    L('kiwi', 'DE', '12:10', 4100, 2),
    L('kiwi', 'SN', '06:50', 4300, 1),
    L('kiwi', 'W4', '15:10', 4600, 1),
    L('ryanair', 'FR', '10:05', 2700), // přímý FR – dřív ho vytlačil přestupní FR
    L('kiwi', 'FR', '10:05', 2690), // týž let přes Kiwi (o 10 Kč levněji) → přednost má Ryanair
    L('kiwi', 'QS', '11:35', 5300),
    L('kiwi', 'VY', '10:40', 6400),
    L('kiwi', 'VY', '16:20', 7400), // druhý přímý let téže aerolinky
    L('kiwi', 'LH', '18:30', 6900, 1),
  ];
  const old = legsPerDay(day, 4);
  assert.ok(!old.some((l) => l.provider === 'ryanair'), 'flexibilní hledání beze změny (přímý FR od Ryanairu tam chybí)');
  const v = legsPerDay(day, 12, () => 0, { variety: true });
  const direct = v.filter((l) => !l.stops);
  assert.deepEqual(direct.map((l) => `${l.carrier} ${l.dep.slice(11, 16)}`).sort(), ['FR 10:05', 'QS 11:35', 'VY 10:40', 'VY 16:20'], 'všechny přímé lety, i 2× VY');
  assert.equal(direct.find((l) => l.carrier === 'FR').provider, 'ryanair', 'týž let: přímo od aerolinky');
  assert.equal(v.filter((l) => `${l.carrier}|${l.dep}` === 'FR|2026-11-06T10:05:00').length, 1, 'stejný let jen jednou');
  const conns = v.filter((l) => l.stops);
  assert.equal(conns[0].czk, 2400, 'nejlevnější let s přestupem zůstává');
  assert.ok(v.length <= 12);
  // málo místa: z přestupních nejlevnější + jiná část dne (ráno), ne dva nejlevnější za sebou
  const tight = dayVariety([...day].sort((a, b) => a.czk - b.czk), 6);
  const tc = tight.filter((l) => l.stops).map((l) => l.dep.slice(11, 13));
  assert.deepEqual(tc, ['21', '06'], 'večer (nejlevnější) a ráno');
});

test('přesná data: zpáteční kombinace – každý let tam i zpět aspoň jednou, párování omezené, přímo tam i zpět', () => {
  const L = (from, to, date, carrier, dep, czk, stops = 0) => makeLeg({ provider: 'kiwi', carrier, from, to, dep: `${date}T${dep}:00`, czk, price: czk, currency: 'CZK', stops });
  const out = [];
  const back = [];
  for (let i = 0; i < 10; i++) out.push(L('PRG', 'BCN', '2026-11-06', `C${i}`, `${String(6 + i).padStart(2, '0')}:00`, 2000 + i * 300, i % 3 ? 1 : 0));
  for (let i = 0; i < 14; i++) back.push(L('BCN', 'PRG', '2026-11-10', `R${i}`, `${String(6 + i).padStart(2, '0')}:30`, 1500 + i * 200, i < 11 ? 1 : 0));
  const trips = bestRoundTrips(out, back, () => 0, { nightsMin: 4, nightsMax: 4, legsPerDay: 12, variety: true, limit: 20, perDestLimit: 20 });
  assert.equal(new Set(trips.map((t) => t.out.carrier)).size, 10, 'každý let tam ve výsledcích');
  const backs = new Set(trips.map((t) => t.back.carrier));
  assert.ok(['R11', 'R12', 'R13'].every((r) => backs.has(r)), 'dražší přímé návraty se nabídnou');
  assert.ok(trips.some((t) => !t.out.stops && !t.back.stops), 'varianta přímo tam i zpět');
  // počet kombinací: nejvýš (8 + 3) návratů na let tam, ne 10 × 14
  const all = bestRoundTrips(out, back, () => 0, { nightsMin: 4, nightsMax: 4, legsPerDay: 12, variety: true, limit: 1000, perDestLimit: 1000 });
  assert.ok(all.length <= 10 * 11, `${all.length} kombinací`);
  assert.ok(all.length > 10 * 8);
});

test('zpáteční kombinace: návrat nesmí odletět dřív, než let tam přistane (stejný den / přílet po půlnoci)', () => {
  const L = (from, to, dep, arr, czk) => makeLeg({ provider: 'kiwi', carrier: 'FR', from, to, dep, arr, czk, price: czk, currency: 'CZK' });
  const out = [L('PRG', 'BCN', '2026-11-06T18:00:00', '2026-11-06T20:20:00', 1000), L('PRG', 'BCN', '2026-11-06T06:00:00', '2026-11-06T08:20:00', 1500)];
  const back = [L('BCN', 'PRG', '2026-11-06T07:00:00', '2026-11-06T09:20:00', 900), L('BCN', 'PRG', '2026-11-06T21:00:00', '2026-11-06T23:20:00', 1200)];
  const trips = bestRoundTrips(out, back, () => 0, { nightsMin: 0, nightsMax: 0, legsPerDay: 12, variety: true, limit: 50, perDestLimit: 50 });
  const pairs = trips.map((t) => `${t.out.dep.slice(11, 16)}>${t.back.dep.slice(11, 16)}`).sort();
  // 18:00 (přílet 20:20) → 21:00 je moc těsně (< 2 h na místě), 07:00 je před příletem
  assert.deepEqual(pairs, ['06:00>21:00'], 'jen návrat, který stihneš');
  // přílet po půlnoci (dálkový let), návrat ten den ráno → nejde
  const late = [L('PRG', 'JFK', '2026-11-06T22:00:00', '2026-11-07T01:30:00', 9000)];
  const early = [L('JFK', 'PRG', '2026-11-07T00:30:00', '2026-11-07T14:00:00', 8000), { ...L('JFK', 'PRG', '2026-11-07T18:00:00', '2026-11-08T08:00:00', 8500), carrier: 'LO' }];
  const lt = bestRoundTrips(late, early, () => 0, { nightsMin: 0, nightsMax: 2, legsPerDay: 2, limit: 50, perDestLimit: 50 });
  assert.deepEqual(lt.map((t) => t.back.dep.slice(11, 16)), ['18:00']);
});

test('routesNote: průběh hledání u Wizz Air česky, bez názvu proměnné z konfigurace', () => {
  assert.equal(routesNote(15, 22), 'prohledáno 15 nejbližších z 22 tras – zbytek kvůli limitu dotazů');
  assert.doesNotMatch(routesNote(1, 2), /WIZZ|MAX_CALLS/);
});

test('outageOf: Wizz Air po 429 (vlastní blokace bez ctx) = blocked s odpočtem, jiná chyba = down', async () => {
  const { outageOf } = await import('../server/lib/search.js');
  const wizz = { isBlocked: () => true, retryAfter: () => 540 };
  assert.deepEqual([outageOf({ state: 'error' }, wizz).outage, outageOf({ state: 'error' }, wizz).retryAfter], ['blocked', 540]);
  assert.equal(outageOf({ state: 'error' }, { isBlocked: () => false }).outage, 'down');
  assert.equal(outageOf({ state: 'done' }, wizz).outage, null, 'prošlo – žádný výpadek');
  assert.equal(outageOf({ state: 'error' }, {}).outage, 'down');
});

test('resolveOrigins: z okolí letiště, odkud se opravdu létá (cestující z Wikidat), ne podle typu z OurAirports', async () => {
  const { sizePenaltyKm, getAirport } = await import('../server/lib/airports.js');
  const ids = (o) => o.airports.map((a) => a.iata);
  const brno = ids(resolveOrigins(['ap:BRQ'], { radiusKm: 300, maxAirports: 8 }));
  assert.ok(brno.includes('KRK') && brno.includes('KTW') && brno.includes('VIE'), brno.join());
  assert.ok(!brno.includes('PED'), 'Pardubice (~100 tis. cestujících) ustoupí Krakovu');
  assert.equal(brno[0], 'BRQ', 'zadané letiště zůstane');
  assert.ok(sizePenaltyKm(getAirport('VIE')) < sizePenaltyKm(getAirport('BRQ')) && sizePenaltyKm(getAirport('BRQ')) < sizePenaltyKm(getAirport('PED')));
  assert.ok(sizePenaltyKm(getAirport('KLV')) >= 150, 'Karlovy Vary jsou „large_airport“, ale skoro bez letů');
  assert.equal(sizePenaltyKm(null), 130);
});

test('build-airport-pax: rok po covidu, jinak před covidem, součet 12 měsíců, jen známá letiště', async () => {
  const { paxTable } = await import('../scripts/build-airport-pax.mjs');
  const known = new Set(['AAA', 'BBB', 'CCC', 'DDD']);
  const rows = [
    ['AAA', '9000000', '2021-01-01T00:00:00Z', '9'], ['AAA', '11000000', '2023-01-01T00:00:00Z', '9'], ['AAA', '12000000', '2019-01-01T00:00:00Z', '9'],
    ['BBB', '500000', '2018-01-01T00:00:00Z', '9'], ['BBB', '200000', '2021-01-01T00:00:00Z', '9'],
    ...Array.from({ length: 12 }, (_, i) => ['CCC', '10000', `2024-${String(i + 1).padStart(2, '0')}-01T00:00:00Z`, '10']),
    ['DDD', '5000', '2024-03-01T00:00:00Z', '10'],
    ['ZZZ', '1000000', '2024-01-01T00:00:00Z', '9'],
  ];
  assert.deepEqual(paxTable(rows, known), { AAA: [11000, 2023], BBB: [500, 2018], CCC: [120, 2024] });
});

test('resolveOrigins: vypnutá letiště nezaberou místo a pořadí výběru (rank) pro náhled ve formuláři', () => {
  const all = resolveOrigins(['ap:BRQ'], { radiusKm: 300, maxAirports: 20 });
  const top8 = new Set([...all.airports].sort((x, y) => x.rank - y.rank).slice(0, 8).map((a) => a.iata));
  const used = resolveOrigins(['ap:BRQ'], { radiusKm: 300, maxAirports: 8 }).airports.map((a) => a.iata);
  assert.deepEqual([...top8].sort(), [...used].sort(), 'náhled (rank) = to, co se prohledá');
  const off = resolveOrigins(['ap:BRQ'], { radiusKm: 300, maxAirports: 8, exclude: ['VIE', 'BTS'] }).airports.map((a) => a.iata);
  assert.equal(off.length, 8);
  assert.ok(!off.includes('VIE') && !off.includes('BTS'));
  assert.ok(off.includes('BUD'), 'místo vypnutých další velké: ' + off.join());
});
