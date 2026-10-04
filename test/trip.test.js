import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planItinerary, dayCapacities, orderRoute } from '../server/lib/itinerary.js';
import { rankStays, adjustedRating, normalizeStayQuery, searchStays } from '../server/lib/stays.js';
import { normalizeCarQuery, searchCars } from '../server/lib/cars.js';
import { stayLinks } from '../server/lib/links.js';
import { haversineKm } from '../server/lib/geo.js';
import { ymdPlus } from './helpers.js';

// Milán: centrum + místa ve třech čtvrtích a jeden celodenní výlet (Como).
const C = { lat: 45.4642, lon: 9.19 };
const P = (id, lat, lon, score, category = 'sight') => ({ id, name: id, lat, lon, score, category });
const POIS = [
  P('duomo', 45.4641, 9.1919, 100, 'church'), P('galleria', 45.4659, 9.19, 90, 'sight'), P('scala', 45.4674, 9.1895, 80, 'theatre'),
  P('castello', 45.4705, 9.1793, 95, 'castle'), P('sempione', 45.4728, 9.1765, 70, 'park'), P('arco', 45.4757, 9.1724, 50, 'monument'),
  P('navigli', 45.4505, 9.1745, 75, 'sight'), P('lorenzo', 45.4581, 9.1813, 55, 'church'), P('eustorgio', 45.4542, 9.1817, 45, 'church'),
  P('brera', 45.4719, 9.1879, 85, 'gallery'), P('cenacolo', 45.466, 9.1709, 98, 'museum'), P('ambrogio', 45.4623, 9.1757, 60, 'church'),
  P('como', 45.8081, 9.0852, 90, 'daytrip'),
];

test('dayCapacities: kratší den příletu a odletu', () => {
  const caps = dayCapacities({ start: '2026-11-10', end: '2026-11-13', arrivalTime: '16:00', departureTime: '11:00', pace: 'normal' });
  assert.equal(caps.length, 4);
  assert.ok(caps[0].cap < caps[1].cap, 'den příletu odpoledne je kratší');
  assert.equal(caps[3].cap, 0, 'odlet v 11:00 → poslední den bez programu');
  assert.equal(caps[1].cap, 360);
});

test('planItinerary: rozdělí místa do dnů podle polohy, nic se neopakuje, kapacita sedí', () => {
  const plan = planItinerary(POIS, { center: C, start: '2026-11-10', end: '2026-11-13', arrivalTime: '10:00', departureTime: '20:00', pace: 'normal' });
  assert.equal(plan.days.length, 4);
  const ids = plan.days.flatMap((d) => d.items.map((p) => p.id));
  assert.equal(new Set(ids).size, ids.length, 'žádné místo dvakrát');
  assert.ok(ids.includes('duomo') && ids.includes('cenacolo'), 'nejvýznamnější místa jsou v plánu');
  for (const d of plan.days) {
    assert.ok(d.minutes <= d.cap * 1.1 + 1, `${d.date}: ${d.minutes} min > kapacita ${d.cap}`);
    for (const p of d.items) assert.ok(Number.isFinite(p.fromPrevKm));
  }
  // Místa jednoho dne leží u sebe (max. vzdálenost v rámci dne < 4 km).
  for (const d of plan.days.filter((x) => x.items.length > 1)) {
    const maxD = Math.max(...d.items.flatMap((a) => d.items.map((b) => haversineKm(a.lat, a.lon, b.lat, b.lon))));
    assert.ok(maxD < 4, `${d.date}: rozptyl ${maxD.toFixed(1)} km`);
  }
});

test('planItinerary: celodenní výlet až při delším pobytu', () => {
  const short = planItinerary(POIS, { center: C, start: '2026-11-10', end: '2026-11-11' });
  assert.ok(!short.days.some((d) => d.kind === 'daytrip'));
  const long = planItinerary(POIS, { center: C, start: '2026-11-10', end: '2026-11-16', arrivalTime: '09:00', departureTime: '21:00' });
  const trip = long.days.find((d) => d.kind === 'daytrip');
  assert.ok(trip, 'týdenní pobyt obsahuje výlet');
  assert.equal(trip.items[0].id, 'como');
});

test('orderRoute: trasa není delší než pořadí podle významu', () => {
  const pts = POIS.slice(0, 8);
  const len = (r) => r.reduce((s, p, i) => s + haversineKm((i ? r[i - 1] : C).lat, (i ? r[i - 1] : C).lon, p.lat, p.lon), 0);
  assert.ok(len(orderRoute(C, pts)) <= len(pts));
});

test('rankStays: nejlepší poměr cena/hodnocení, málo recenzí se nepřeceňuje', () => {
  const items = rankStays([
    { id: 'a', name: 'Drahý skvělý', rating: 9.4, reviews: 2000, pricePerNightCzk: 6000, priceTotalCzk: 24000 },
    { id: 'b', name: 'Levný dobrý', rating: 8.6, reviews: 1500, pricePerNightCzk: 1800, priceTotalCzk: 7200 },
    { id: 'c', name: 'Levný špatný', rating: 6.1, reviews: 900, pricePerNightCzk: 1200, priceTotalCzk: 4800 },
    { id: 'd', name: 'Nový 10/10', rating: 10, reviews: 2, pricePerNightCzk: 1700, priceTotalCzk: 6800 },
  ]);
  assert.equal(items[0].id, 'b');
  assert.ok(items[0].badges.includes('best-value'));
  assert.ok(items.find((h) => h.id === 'c').badges.includes('cheapest'));
  assert.ok(adjustedRating(10, 2) < 8, 'hodnocení ze 2 recenzí se stáhne k průměru');
  assert.ok(items.find((h) => h.id === 'a').badges.includes('top-rated'));
});

test('stays/cars: validace dotazu a odkazy s předvyplněnými daty', () => {
  assert.throws(() => normalizeStayQuery({ city: 'Milán' }), /datum/);
  const q = normalizeStayQuery({ city: 'Milán', country: 'Itálie', checkin: ymdPlus(10), checkout: ymdPlus(14), adults: 2 });
  assert.equal(q.nights, 4);
  const booking = new URL(stayLinks(q)[0].url);
  assert.equal(booking.hostname, 'www.booking.com');
  assert.equal(booking.searchParams.get('checkin'), ymdPlus(10));
  assert.equal(booking.searchParams.get('group_adults'), '2');
  assert.equal(booking.searchParams.get('order'), 'price', 'nejlevnější…');
  assert.equal(booking.searchParams.get('nflt'), 'review_score=80', '…s hodnocením 8+');
  assert.equal(new URL(stayLinks(q)[1].url).searchParams.get('order'), 'review_score_and_price');

  const [d1, d3, d5] = [ymdPlus(40), ymdPlus(42), ymdPlus(44)];
  assert.throws(() => normalizeCarQuery({ pickup: 'XXX', from: `${d1}T09:00`, to: `${d3}T09:00` }), /letiště/);
  assert.throws(() => normalizeCarQuery({ pickup: 'BGY', from: `${d3}T09:00`, to: `${d1}T09:00` }), /po vyzvednutí/);
  const r = searchCars({ pickup: 'BGY', dropoff: 'MXP', from: `${d1}T08:30`, to: `${d5}T19:00` });
  assert.equal(r.query.days, 5);
  assert.match(r.query.pickupName, /Bergamo/);
  const kayak = r.links.find((l) => l.id === 'kayak').url;
  assert.ok(kayak.includes(`/cars/BGY/MXP/${d1}-8h/${d5}-19h`), kayak);
});

test('planItinerary: nejvýš 3 kostely za den', () => {
  const churches = Array.from({ length: 8 }, (_, i) => P(`ch${i}`, 45.464 + i * 0.0008, 9.19 + i * 0.0008, 90 - i, 'church'));
  const plan = planItinerary(churches, { center: C, start: '2026-11-10', end: '2026-11-12', arrivalTime: '08:00', departureTime: '21:00', pace: 'intense' });
  for (const d of plan.days) assert.ok(d.items.filter((p) => p.category === 'church').length <= 3, `${d.date}: příliš mnoho kostelů`);
});

test('cars: Rentalcars/Booking Cars s kódem letiště, celé půlhodiny, řazení podle ceny', () => {
  const [d1, d5] = [ymdPlus(40), ymdPlus(44)];
  const r = searchCars({ pickup: 'BGY', dropoff: 'MXP', from: `${d1}T08:45`, to: `${d5}T19:10` });
  const rc = new URL(r.links.find((l) => l.id === 'rentalcars').url);
  assert.equal(rc.pathname, '/search-results');
  assert.equal(rc.searchParams.get('locationIata'), 'BGY');
  assert.equal(rc.searchParams.get('dropLocationIata'), 'MXP');
  assert.equal(rc.searchParams.get('ftsType'), 'A');
  assert.deepEqual(['puDay', 'puMonth', 'puHour', 'puMinute', 'doHour', 'doMinute'].map((k) => rc.searchParams.get(k)), [String(+d1.slice(8)), String(+d1.slice(5, 7)), '8', '30', '19', '0']);
  assert.equal(rc.searchParams.get('filterCriteria_sortBy'), 'PRICE');
  assert.equal(new URL(r.links.find((l) => l.id === 'bookingcars').url).host, 'cars.booking.com');
  assert.ok(!r.links.some((l) => l.id === 'google'), 'žádný neověřený formát');
});

test('affiliate: bez čísla projektu (trs) zůstávají odkazy přímé; s ním jen ověřené značky přes tp.media', async () => {
  const { config } = await import('../server/config.js');
  const { affiliate } = await import('../server/lib/links.js');
  const prev = { m: config.travelpayoutsMarker, t: config.travelpayoutsTrs };
  try {
    config.travelpayoutsMarker = '123456';
    config.travelpayoutsTrs = '';
    const q = normalizeStayQuery({ city: 'Milán', iata: 'BGY', checkin: ymdPlus(10), checkout: ymdPlus(12) });
    assert.match(stayLinks(q)[0].url, /^https:\/\/www\.booking\.com\//, 'marker bez trs → přímý odkaz (tp.media by hlásil chybu)');
    assert.ok(!stayLinks(q).some((l) => l.sponsored));

    config.travelpayoutsTrs = '987654';
    const links = stayLinks(q);
    const tp = new URL(links[0].url);
    assert.equal(tp.host, 'tp.media');
    assert.equal(tp.pathname, '/r');
    assert.deepEqual(['marker', 'trs', 'p', 'campaign_id'].map((k) => tp.searchParams.get(k)), ['123456', '987654', '2076', '84']);
    assert.match(tp.searchParams.get('u'), /^https:\/\/www\.booking\.com\/searchresults/);
    assert.equal(links[0].sponsored, true);
    const hw = links.find((l) => l.id === 'hostelworld');
    assert.match(hw.url, /^https:\/\/www\.hostelworld\.com\//, 'značka bez ověřených ID se neobaluje');
    assert.ok(!hw.sponsored);
    assert.equal(affiliate('https://www.kayak.com/cars/BGY', 'kayak'), 'https://www.kayak.com/cars/BGY');
  } finally {
    config.travelpayoutsMarker = prev.m;
    config.travelpayoutsTrs = prev.t;
  }
});

test('stays: pokoje po dvou, poloha letiště se nebere jako centrum, delší pobyt jen s odkazy', async () => {
  const base = { city: 'Vídeň', iata: 'VIE', checkin: ymdPlus(20), checkout: ymdPlus(23) };
  assert.equal(normalizeStayQuery({ ...base, adults: 6 }).rooms, 3);
  assert.equal(normalizeStayQuery({ ...base, adults: 2, rooms: 3 }).rooms, 2, 'víc pokojů než lidí nejde');
  const vie = normalizeStayQuery({ ...base, lat: 48.1103, lon: 16.5697 });
  assert.equal(vie.lat, null, 'souřadnice letiště Schwechat nejsou centrum Vídně');
  assert.equal(normalizeStayQuery({ ...base, lat: 48.2082, lon: 16.3738 }).lat, 48.2082);
  const { occupancies } = await import('../server/providers/stays/liteapi.js');
  assert.deepEqual(occupancies({ adults: 5, rooms: 2 }).map((o) => o.adults), [3, 2]);
  const long = await searchStays({ ...base, checkout: ymdPlus(60) });
  assert.equal(long.query.nights, 40);
  assert.equal(long.providers.length, 0);
  assert.ok(long.links.length > 0);
});

test('cars: nesmyslné nebo minulé datum → 400', () => {
  assert.throws(() => normalizeCarQuery({ pickup: 'BGY', from: '2026-13-45T09:00', to: '2026-14-50T09:00' }), /datum/);
  assert.throws(() => normalizeCarQuery({ pickup: 'BGY', from: '2020-01-10T09:00', to: '2020-01-12T09:00' }), /minulosti/);
});

test('planItinerary: hodně kostelů nevyčerpá čas – dny se doplní muzei', () => {
  const pts = [
    ...Array.from({ length: 20 }, (_, i) => P(`ch${i}`, 45.46 + i * 0.001, 9.19, 200 - i, 'church')),
    ...Array.from({ length: 20 }, (_, i) => P(`mu${i}`, 45.46 + i * 0.001, 9.191, 100 - i, 'museum')),
  ];
  const plan = planItinerary(pts, { center: C, start: '2026-11-10', end: '2026-11-11', arrivalTime: '09:00', departureTime: '21:00' });
  const all = plan.days.flatMap((d) => d.items);
  assert.ok(all.some((p) => p.category === 'museum'), 'muzea v plánu');
  for (const d of plan.days) {
    assert.ok(d.items.filter((p) => p.category === 'church').length <= 3);
    assert.ok(d.minutes >= d.cap * 0.6, `${d.date}: jen ${d.minutes} z ${d.cap} min`);
  }
});

test('planItinerary: jednodenní cesta respektuje odlet; krátký den nedostane dlouhou návštěvu', () => {
  const sameDay = planItinerary(POIS, { center: C, start: '2026-11-10', end: '2026-11-10', arrivalTime: '08:00', departureTime: '13:00' });
  assert.ok(sameDay.days[0].minutes <= 20, `${sameDay.days[0].minutes} min programu, i když se letí ve 13:00`);
  const evening = planItinerary(POIS, { center: C, start: '2026-11-10', end: '2026-11-12', arrivalTime: '18:00', departureTime: '13:00' });
  assert.ok(evening.days[0].minutes <= evening.days[0].cap * 1.1, `večer po příletu ${evening.days[0].minutes} min při kapacitě ${evening.days[0].cap}`);
  assert.ok(evening.days.at(-1).minutes <= evening.days.at(-1).cap * 1.1 + 1);
});

test('planItinerary: výlet mimo město nikdy v den odletu; připnutý výlet se naplánuje i u kratšího pobytu', () => {
  const trips = [P('como', 45.81, 9.08, 90, 'daytrip'), P('bergamo', 45.69, 9.67, 85, 'daytrip')];
  const six = planItinerary([...POIS.slice(0, 12), ...trips], { center: C, start: '2026-11-01', end: '2026-11-06', arrivalTime: '09:00', departureTime: '21:00' });
  assert.notEqual(six.days.at(-1).kind, 'daytrip');
  assert.notEqual(six.days[0].kind, 'daytrip');
  const pinned = planItinerary([...POIS.slice(0, 12), { ...trips[1], pinned: true }], { center: C, start: '2026-11-10', end: '2026-11-12', arrivalTime: '10:00', departureTime: '18:00' });
  assert.equal(pinned.days.filter((d) => d.kind === 'daytrip').length, 1);
  assert.equal(pinned.days.find((d) => d.kind === 'daytrip').date, '2026-11-11');
  const tooShort = planItinerary([...POIS.slice(0, 12), { ...trips[1], pinned: true }], { center: C, start: '2026-11-10', end: '2026-11-11', arrivalTime: '10:00', departureTime: '18:00' });
  assert.ok(tooShort.warnings.length > 0);
});

test('planItinerary: limit kostelů platí i s krátkým dnem příletu a odletu (Řím)', () => {
  const pool = Array.from({ length: 40 }, (_, i) => P(`r${i}`, 41.9 + (i % 8) * 0.002, 12.49 + Math.floor(i / 8) * 0.002, 200 - i, i % 2 ? 'church' : ['museum', 'square', 'monument', 'sight'][i % 4 === 0 ? 0 : 3]));
  for (const [arr, dep, pace, end] of [['18:00', '13:00', 'normal', '2026-11-13'], ['18:00', '13:00', 'intense', '2026-11-13'], ['16:00', '14:00', 'intense', '2026-11-12']]) {
    const plan = planItinerary(pool, { center: { lat: 41.9, lon: 12.49 }, start: '2026-11-10', end, arrivalTime: arr, departureTime: dep, pace });
    for (const d of plan.days) {
      const ch = d.items.filter((p) => p.category === 'church').length;
      assert.ok(ch <= 3, `${pace} ${arr}/${dep} ${d.date}: ${ch} kostelů`);
      assert.ok(d.items.filter((p) => p.category === 'square').length <= 2);
    }
  }
});
