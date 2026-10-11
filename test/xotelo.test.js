// Ceny hotelů zdarma přes Xotelo (TripAdvisor): místo z Wikidat, seznam, ceny, výběr poskytovatele, /api/health.
// Bez sítě – odpovědi z test/fixtures/xotelo.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';
import { config } from '../server/config.js';
import { setRates } from '../server/lib/fx.js';
import { cache } from '../server/lib/cache.js';
import {
  xotelo, locationKeys, nearbyKeys, pickSettlements, pickByName, placeNames, sparqlNames, seedCity, sparqlAround, hotelList,
  hotelRates, ratesKey, offers, mapHotel, candidates, chooseForRates, searchXotelo, locationCacheKey, RADIUS_KM, MAX_RATES,
  resetXoteloBreaker, xoteloBlocked, xoteloRetryAfter,
} from '../server/providers/stays/xotelo.js';
import { stayProviders } from '../server/providers/stays/index.js';
import { providerStatus } from '../server/providers/index.js';
import { normalizeStayQuery, searchStays } from '../server/lib/stays.js';
import { LIST_PRAGUE, RATES_HERMITAGE, WD_GID_LISBON, WD_AROUND_MADRID, WD_AROUND_KRUMLOV, WD_NAMES } from './fixtures/xotelo.js';

setRates({ base: 'EUR', rates: { EUR: 1, CZK: 25, USD: 1.1 }, source: 'test', date: null });
beforeEach(() => { cache.map.clear(); resetXoteloBreaker(); });

const PRAGUE = { lat: 50.0875, lon: 14.4214 };
const PER_SEARCH_MAX = 3; // jedno hledání nejvýš 3 dotazy na Xotelo naráz
const lit = (v) => ({ type: 'literal', value: String(v) });
// řádek sparqlAround (ručně – vesnice a město v okolí)
const row = (id, { ta, pop, dist }) => ({ item: { type: 'uri', value: `http://www.wikidata.org/entity/${id}` }, ...(ta ? { ta: lit(ta) } : {}), ...(pop ? { pop: lit(pop) } : {}), dist: lit(dist) });
const query = (extra = {}) => normalizeStayQuery({ city: 'Praha', cityEn: 'Prague', cc: 'CZ', ...PRAGUE, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2, ...extra });
/** Nastaví config na dobu testu (mock, klíč LiteAPI, Xotelo). */
async function withConfig(over, fn) {
  const prev = { mock: config.mock, liteapiKey: config.liteapiKey, xotelo: config.xotelo };
  Object.assign(config, over);
  try {
    return await fn();
  } finally {
    Object.assign(config, prev);
  }
}
/** Ceny pro hotel (deterministicky podle klíče): Booking dražší, Agoda levnější, Trip.com mezi. */
function ratesFor(key) {
  const n = Number(key.split('-d')[1]) % 97;
  return { error: null, result: { currency: 'EUR', rates: [
    { code: 'BookingCom', name: 'Booking.com', rate: 120 + n, tax: null },
    { code: 'Agoda', name: 'Agoda.com', rate: 100 + n, tax: null },
    { code: 'CtripTA', name: 'Trip.com', rate: 110 + n, tax: null },
  ] } };
}

test('místo TripAdvisoru podle ID GeoNames: Wikidata P1566 → P3134 (Lisabon „189158“ → g189158), v mezipaměti', async () => {
  const calls = [];
  const sparql = async (q) => { calls.push(q); return q.includes('P1566') ? WD_GID_LISBON : []; };
  const q = { gid: '2267057', lat: 38.7223, lon: -9.1393 };
  assert.deepEqual(await locationKeys(q, { sparql }), ['g189158']);
  assert.match(calls[0], /wdt:P1566 "2267057" ; wdt:P3134 \?ta/);
  assert.equal(calls.length, 1, 'ID GeoNames místo našlo – pomalý dotaz na okolí se neposílá');
  assert.deepEqual(await locationKeys(q, { sparql }), ['g189158']);
  assert.equal(calls.length, 1, 'podruhé z mezipaměti');
  const e = cache.map.get(locationCacheKey(q));
  assert.ok(e.exp - Date.now() > 29 * 864e5, 'nalezené místo 30 dní');
  // nesmyslné ID GeoNames se nepoužije – jen poloha
  assert.equal(locationCacheKey({ gid: '1;drop', lat: 38.7223, lon: -9.1393 }), 'xo:loc:38.72:-9.14');
  assert.equal(locationCacheKey({ gid: null, lat: null, lon: null }), null);
});

test('místo podle polohy: Madrid bez ID – čtvrť s ID atrakce ani menší předměstí ne; velké město z tabulky bez dotazu', async () => {
  assert.deepEqual(pickSettlements(WD_AROUND_MADRID), [], 'čtvrť Q5786018 (0,6 km, bez obyvatel) vedle 3,3mil. Madridu');
  // předměstí s ID (ručně doplněné, 180 tis. ob., 13 km) – menší než Madrid → ne
  assert.deepEqual(pickSettlements([...WD_AROUND_MADRID, row('Qx1', { ta: '900001', pop: 180000, dist: 12.9 })]), []);
  const sparql = async () => { throw new Error('na Wikidata se nemá ptát'); };
  assert.deepEqual(await locationKeys({ lat: 40.4168, lon: -3.7038 }, { sparql }), ['g187514'], 'Madrid z tabulky');
  assert.equal(seedCity(PRAGUE.lat, PRAGUE.lon), 'g274707');
  assert.equal(seedCity(50.03, 14.5), 'g274707', 'Praha-Záběhlice (6 km od středu)');
  assert.equal(seedCity(48.2082, 16.3738), null, 'Vídeň má ID ve Wikidatech');
  assert.match(sparqlAround(50.1, 14.4), /wikibase:radius "20"[\s\S]*wdt:P3134[\s\S]*UNION[\s\S]*wikibase:radius "3"[\s\S]*wdt:P1082/);
});

test('místo podle polohy: Krumlov bez ID nedostane menší Kaplici; vesnice dostane větší město v okolí; malé místo samo sebe', () => {
  assert.deepEqual(pickSettlements(WD_AROUND_KRUMLOV), [], 'Kaplice (7,5 tis., 15 km) je menší než Krumlov (12,8 tis.)');
  const village = [row('Qv', { pop: 800, dist: 0.2 }), row('Qt', { ta: '900002', pop: 15000, dist: 9 }), row('Qs', { ta: '900003', pop: 400, dist: 14 })];
  assert.deepEqual(pickSettlements(village), ['g900002']);
  assert.deepEqual(pickSettlements([row('Qp', { ta: '900004', dist: 0.3 })]), ['g900004'], 'bez počtu obyvatel, ale přímo v místě');
  // dvě obce s ID v místě: větší napřed, nejvýš 2
  const two = [row('Qa', { ta: '900005', pop: 5000, dist: 1 }), row('Qb', { ta: '900006', pop: 90000, dist: 2 }), row('Qc', { ta: '900007', pop: 200000, dist: 18 })];
  assert.deepEqual(pickSettlements(two), ['g900006', 'g900007']);
});

test('místo nenalezeno → [] na 1 den (bez dalších dotazů); výpadek Wikidat jen na 10 min, česky', async () => {
  let n = 0;
  const empty = async () => { n++; return []; };
  const q = { lat: 46.5, lon: 13.1 };
  assert.deepEqual(await locationKeys(q, { sparql: empty }), []);
  assert.deepEqual(await locationKeys(q, { sparql: empty }), []);
  assert.equal(n, 1);
  const e = cache.map.get(locationCacheKey(q));
  assert.ok(e.exp - Date.now() <= 864e5 && e.exp - Date.now() > 864e5 - 60e3, 'záporný výsledek 1 den');
  const q2 = { lat: 46.7, lon: 13.3 };
  let m = 0;
  const down = async (s, ms) => { m++; throw new Error(`Timeout ${ms} ms: https://query.wikidata.org/sparql`); };
  await assert.rejects(locationKeys(q2, { sparql: down }), /^Error: místo na TripAdvisoru se nepodařilo dohledat – Wikidata neodpověděla včas$/);
  assert.equal(m, 1);
  await assert.rejects(locationKeys(q2, { sparql: down }), /Wikidata neodpověděla včas/);
  assert.equal(m, 1, 'další hledání 10 min nečeká na timeout znovu');
  const f = cache.map.get(`${locationCacheKey(q2)}:fail`);
  assert.ok(f.exp - Date.now() <= 10 * 60e3 && f.exp - Date.now() > 9 * 60e3);
  assert.equal(cache.get(locationCacheKey(q2)), undefined, 'chyba není „nic“ na den');
  f.exp = Date.now() - 1; // po 10 min znovu
  cache.map.delete(`xo:near:${q2.lat.toFixed(2)}:${q2.lon.toFixed(2)}:fail`);
  assert.deepEqual(await locationKeys(q2, { sparql: async () => [row('Qp', { ta: '900009', pop: 2000, dist: 0.5 })] }), ['g900009']);
  // chyba jen u ID GeoNames, okolí najde → vezme se
  const half = async (s) => { if (s.includes('P1566')) throw new Error('timeout'); return [row('Qp', { ta: '900008', pop: 2000, dist: 0.5 })]; };
  assert.deepEqual(await locationKeys({ gid: '123', lat: 46.9, lon: 13.5 }, { sparql: half }), ['g900008']);
});

test('cena: sazba za pokoj a noc × pokoje × noci, daň se přičte, EUR → Kč; nejlevnější web první, web jen jednou', () => {
  const q = { checkin: '2026-11-12', checkout: '2026-11-15', nights: 3, adults: 3, rooms: 2 };
  const of = offers({ currency: 'EUR', rates: [
    { code: 'BookingCom', name: 'Booking.com', rate: 140, tax: 0 },
    { code: 'Agoda', name: 'Agoda.com', rate: 124, tax: 6 },
    { code: 'BookingCom2', name: 'Booking.com', rate: 150, tax: 0 },
    { code: 'TravelClickCPA', name: 'Official Hotel', rate: 136 },
    { code: 'FastbookingDL', name: 'Hotel Website', rate: 137 },
  ] }, q);
  // Agoda (124 + 6) € × 2 pokoje × 3 noci = 780 € × 25 = 19 500 Kč
  assert.deepEqual(of.map((o) => [o.name, o.totalCzk, o.perNightCzk]), [['Agoda', 19500, 6500], ['web hotelu', 20400, 6800], ['Booking.com', 21000, 7000]]);
  assert.deepEqual(offers({ currency: 'XYZ', rates: [{ name: 'A', rate: 10 }] }, q), [], 'neznámá měna → bez ceny');
});

test('hotel → nabídka: hodnocení 0–5 i 0–10, vzdálenost, ceny u webů, snídaně, odkaz na Booking.com, zmenšená fotka', () => {
  const q = { city: 'Praha', cityEn: 'Prague', checkin: '2026-11-12', checkout: '2026-11-14', nights: 2, adults: 2, rooms: 1 };
  const h = mapHotel(LIST_PRAGUE[1], RATES_HERMITAGE, q, PRAGUE);
  assert.equal(h.id, 'xo:g274707-d1235795');
  assert.equal(h.provider, 'xotelo');
  assert.deepEqual([h.rating, h.rating5, h.reviews, h.stars], [9.2, 4.6, 4045, null]);
  assert.ok(Math.abs(h.distanceKm - 2.2) < 0.15, `${h.distanceKm} km`);
  // nejlevněji Vio.com 95 € × 2 noci = 190 € = 4 750 Kč
  assert.deepEqual([h.priceTotalCzk, h.pricePerNightCzk], [4750, 2375]);
  assert.deepEqual(h.rates.map((r) => r.name), ['Vio.com', 'Trip.com', 'Agoda', 'web hotelu', 'Booking.com']);
  assert.equal(h.rates.at(-1).totalCzk, 7000);
  assert.deepEqual([h.type, h.typeLabel, h.freeCancellation, h.breakfast], ['hotel', 'hotel', null, null]);
  const u = new URL(h.bookUrl);
  assert.equal(u.hostname, 'www.booking.com');
  assert.deepEqual(['ss', 'checkin', 'checkout', 'group_adults', 'no_rooms'].map((k) => u.searchParams.get(k)), ['Hermitage Hotel Prague, Prague', '2026-11-12', '2026-11-14', '2', '1']);
  assert.match(h.photo, /^https:\/\/dynamic-media-cdn\.tripadvisor\.com\/media\/photo-o\/.+\.jpg\?w=400&h=-1&s=1$/);
  assert.match(h.reviewsUrl, /^https:\/\/www\.tripadvisor\.com\/Hotel_Review-g274707-d1235795-/);
  const bb = mapHotel(LIST_PRAGUE[7], RATES_HERMITAGE, q, PRAGUE);
  assert.deepEqual([bb.type, bb.typeLabel, bb.breakfast], ['penzion', 'B&B', true], 'Bed and Breakfast se snídaní');
  assert.equal(mapHotel(LIST_PRAGUE[0], { currency: 'EUR', rates: [] }, q, PRAGUE), null, 'bez nabídky (obsazeno / neznámé) → nic');
  // partnerský odkaz (Travelpayouts) má příznak – karta ho označí „reklama“
  assert.equal(h.bookSponsored, false);
  const prev = { m: config.travelpayoutsMarker, t: config.travelpayoutsTrs };
  Object.assign(config, { travelpayoutsMarker: '123456', travelpayoutsTrs: '7890' });
  try {
    const a = mapHotel(LIST_PRAGUE[1], RATES_HERMITAGE, q, PRAGUE);
    assert.equal(a.bookSponsored, true);
    assert.match(a.bookUrl, /^https:\/\/tp\.media\/r\?/);
  } finally {
    Object.assign(config, { travelpayoutsMarker: prev.m, travelpayoutsTrs: prev.t });
  }
  assert.equal(mapHotel({ ...LIST_PRAGUE[0], image: 'javascript:alert(1)', url: 'https://evil.example/x' }, RATES_HERMITAGE, q, PRAGUE).photo, null);
});

test('seznam: hotely dál než 15 km, bez recenzí a s neplatným klíčem pryč; ceny pro 8 nejlepších + 4 nejlevnější', () => {
  const far = { ...LIST_PRAGUE[0], key: 'g274707-d1', name: 'Hotel Kladno', geo: { latitude: 50.147, longitude: 14.103 } };
  const noRev = { ...LIST_PRAGUE[0], key: 'g274707-d2', name: 'Nový hotel', review_summary: { rating: 0, count: 0 } };
  const bad = { ...LIST_PRAGUE[0], key: 'd3', name: 'Bez místa' };
  const list = [...LIST_PRAGUE, far, noRev, bad, LIST_PRAGUE[0]];
  assert.equal(RADIUS_KM, 15);
  const pool = candidates(list, PRAGUE);
  assert.equal(pool.length, 16);
  assert.ok(!pool.includes(far) && !pool.includes(noRev) && !pool.includes(bad));
  assert.equal(candidates(list, null).length, 17, 'bez polohy místa se vzdálenost nehlídá');
  const pick = chooseForRates(pool);
  assert.equal(pick.length, MAX_RATES);
  assert.deepEqual(pick.slice(0, 8), pool.slice(0, 8), 'pořadí TripAdvisoru (nejlepší poměr)');
  const mins = pick.slice(8).map((h) => h.price_ranges.minimum);
  assert.deepEqual(mins, [...mins].sort((a, b) => a - b));
  assert.ok(pick.slice(8).every((h) => h.price_ranges.minimum <= 106), `nejlevnější ze zbytku: ${mins}`);
});

test('ceny v mezipaměti podle hotelu, termínu, dospělých a pokojů; dotaz v EUR s popisným User-Agentem', async () => {
  const stub = stubFetch((url) => (url.includes('/api/rates?') ? { body: { error: null, result: RATES_HERMITAGE } } : { status: 404, body: '{}' }));
  try {
    const q = { checkin: ymdPlus(10), checkout: ymdPlus(12), adults: 2, rooms: 1 };
    assert.equal(ratesKey('g274707-d1235795', q), `xo:rates:g274707-d1235795:${q.checkin}:${q.checkout}:2:1`);
    const a = await hotelRates('g274707-d1235795', q);
    await hotelRates('g274707-d1235795', q);
    assert.equal(stub.calls.length, 1);
    assert.equal(a.currency, 'EUR');
    assert.equal(a.rates.length, 5);
    const u = new URL(stub.calls[0].url);
    assert.equal(u.origin + u.pathname, 'https://data.xotelo.com/api/rates');
    assert.deepEqual(['hotel_key', 'chk_in', 'chk_out', 'currency', 'adults', 'rooms'].map((k) => u.searchParams.get(k)), ['g274707-d1235795', q.checkin, q.checkout, 'EUR', '2', '1']);
    assert.match(stub.calls[0].init.headers['User-Agent'], /^ATLAS-travel\//);
    await hotelRates('g274707-d1235795', { ...q, rooms: 2, adults: 3 });
    await hotelRates('g274707-d1235795', { ...q, checkout: ymdPlus(13) });
    assert.equal(stub.calls.length, 3, 'jiné pokoje / termín = nový dotaz');
    // po rozpočtu se dotaz nepošle a chyba se nepamatuje
    await assert.rejects(hotelRates('g274707-d9', q, { deadline: Date.now() - 1 }), /nestihly/);
    assert.equal(stub.calls.length, 3);
    assert.equal(cache.get(ratesKey('g274707-d9', q)), undefined);
  } finally {
    stub.restore();
  }
});

test('seznam hotelů: dotaz best_value, 24 h v mezipaměti; neznámé místo (4xx) → prázdný seznam', async () => {
  const stub = stubFetch((url) => (url.includes('location_key=g274707') ? { body: { error: null, result: { total_count: 2866, list: LIST_PRAGUE } } } : { status: 400, body: '{"error":{"message":"bad key"}}' }));
  try {
    assert.equal((await hotelList('g274707')).length, 16);
    await hotelList('g274707');
    assert.equal(stub.calls.length, 1);
    const u = new URL(stub.calls[0].url);
    assert.deepEqual(['location_key', 'limit', 'sort'].map((k) => u.searchParams.get(k)), ['g274707', '40', 'best_value']);
    assert.ok(cache.map.get('xo:list:g274707').exp - Date.now() > 23.9 * 3600e3);
    assert.deepEqual(await hotelList('g1'), []);
  } finally {
    stub.restore();
  }
});

test('celé hledání bez sítě: Wikidata (Praha bez P3134) → tabulka → seznam → ceny 12 hotelů, řazení podle ceny, chybějící ceny vypadnou', async () => {
  const keys = LIST_PRAGUE.map((h) => h.key);
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/')) return { body: { results: { bindings: [] } } }; // Praha (3067696) P3134 nemá
    if (url.includes('/api/list?')) return { body: { error: null, result: { list: LIST_PRAGUE } } };
    if (url.includes('/api/rates?')) {
      const k = new URL(url).searchParams.get('hotel_key');
      if (k === keys[2]) return { body: { error: null, result: { currency: 'EUR', rates: [] } } }; // obsazeno
      if (k === keys[3]) return { status: 500, body: 'down' };
      return { body: ratesFor(k) };
    }
    return { status: 404, body: '{}' };
  });
  try {
    await withConfig({ mock: false, liteapiKey: '', xotelo: true }, async () => {
      const r = await searchStays({ city: 'Praha', cityEn: 'Prague', cc: 'CZ', gid: '3067696', ...PRAGUE, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2 });
      const st = r.providers[0];
      assert.deepEqual([st.id, st.ok, st.count, st.partial], ['xotelo', true, 10, true], st.error);
      const wd = stub.calls.filter((c) => c.url.startsWith('https://query.wikidata.org/'));
      assert.equal(wd.length, 1, 'jen podle ID GeoNames – Praha je v tabulce, okolí se nehledá');
      assert.match(decodeURIComponent(wd[0].url), /wdt:P1566 "3067696"/);
      assert.match(wd[0].init.headers['User-Agent'], /^ATLAS-travel\//);
      const rates = stub.calls.filter((c) => c.url.includes('/api/rates?'));
      assert.equal(rates.length, 12);
      assert.ok(rates.every((c) => /adults=2&rooms=1/.test(c.url)));
      assert.equal(r.items.length, 10);
      assert.ok(r.items.every((h) => h.provider === 'xotelo' && h.rates.length === 3 && h.rates[0].name === 'Agoda'));
      assert.ok(!r.items.some((h) => h.id === `xo:${keys[2]}` || h.id === `xo:${keys[3]}`));
      const mosaic = r.items.find((h) => h.id === `xo:${keys[0]}`);
      // Agoda (100 + 1656616 % 97) € × 3 noci × 25 Kč/€
      assert.equal(mosaic.priceTotalCzk, (100 + (1656616 % 97)) * 3 * 25);
      assert.ok(r.items.some((h) => h.badges.includes('best-value')));
      assert.ok(r.links.length > 0, 'odkazy na partnery zůstávají');
      // podruhé z mezipaměti (neúplný výsledek jen 5 min) – žádné nové dotazy
      const n = stub.calls.length;
      await searchStays({ city: 'Praha', cityEn: 'Prague', cc: 'CZ', gid: '3067696', ...PRAGUE, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2 });
      assert.equal(stub.calls.length, n);
      const k = [...cache.map.keys()].find((x) => x.startsWith('stay:xotelo:'));
      assert.ok(cache.map.get(k).exp - Date.now() <= 5 * 60e3);
    });
  } finally {
    stub.restore();
  }
});

test('rozpočet na ceny: pomalý web se nečeká, výsledek je částečný; všechny ceny selžou → chyba poskytovatele', async () => {
  const slow = LIST_PRAGUE[1].key;
  const stub = stubFetch((url, init) => {
    if (url.includes('/api/list?')) return { body: { result: { list: LIST_PRAGUE } } };
    const k = new URL(url).searchParams.get('hotel_key');
    if (k === slow) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    return { body: ratesFor(k) };
  });
  try {
    const q = query();
    const t0 = Date.now();
    const items = await searchXotelo(q, { sparql: async () => [], budgetMs: 600 });
    assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
    assert.equal(items.partial, true);
    assert.equal(items.length, 11);
    assert.ok(!items.some((h) => h.id === `xo:${slow}`));
    assert.ok(items.every((h, i) => !i || items[i - 1].priceTotalCzk <= h.priceTotalCzk), 'od nejlevnějšího');
  } finally {
    stub.restore();
  }
  cache.map.clear();
  const down = stubFetch((url) => (url.includes('/api/list?') ? { body: { result: { list: LIST_PRAGUE } } } : { status: 503, body: 'x' }));
  try {
    await assert.rejects(searchXotelo(query(), { sparql: async () => [] }), /^Error: má výpadek \(HTTP 503\)$/);
    const n = down.calls.filter((c) => c.url.includes('/api/rates?')).length;
    assert.ok(n >= 3 && n <= 5, `po 3 chybách za sebou se zbytek cen neposílá (${n} dotazů z 12)`);
    assert.ok(xoteloBlocked());
  } finally {
    down.restore();
  }
});

test('první místo bez hotelů v okolí (ID atrakce, ID z tabulky nesedí) → zkusí se druhý kandidát; žádný → []', async () => {
  const stub = stubFetch((url) => {
    if (url.includes('location_key=g900010')) return { body: { result: { list: [] } } };
    if (url.includes('location_key=g900011')) return { body: { result: { list: LIST_PRAGUE.slice(0, 3) } } };
    if (url.includes('/api/rates?')) return { body: ratesFor(new URL(url).searchParams.get('hotel_key')) };
    return { status: 404, body: '{}' };
  });
  try {
    // bod 13 km jižně od středu Prahy – mimo tabulku (12 km), hotely z fixtury do 15 km
    const sparql = async () => [row('Qa', { ta: '900010', pop: 9000, dist: 0.5 }), row('Qb', { ta: '900011', pop: 3000, dist: 1 })];
    const q = query({ lat: 49.97, lon: 14.4 });
    assert.equal(seedCity(q.lat, q.lon), null);
    const items = await searchXotelo(q, { sparql });
    assert.deepEqual(stub.calls.filter((c) => c.url.includes('/api/list?')).map((c) => new URL(c.url).searchParams.get('location_key')), ['g900010', 'g900011']);
    assert.equal(items.length, 3, 'hotely druhého kandidáta do 15 km');
    assert.deepEqual(await searchXotelo(query({ lat: 49.5, lon: 15.5 }), { sparql: async () => [] }), []);
  } finally {
    stub.restore();
  }
});

test('místo podle názvu (město příletu bez ID GeoNames): rychlý dotaz na popisky – Lisabon město před okresem, Paříž ve Francii; okolí se nehledá', async () => {
  assert.deepEqual(placeNames({ cityEn: 'Lisbon', city: 'Lisabon' }), [['Lisbon', 'en'], ['Lisabon', 'cs']]);
  assert.deepEqual(placeNames({ cityEn: 'Foo "x" \\ y, Ontario', city: '' }), [['Foo x y', 'en']], 'bez uvozovek a lomítek, bez upřesnění');
  assert.match(sparqlNames([['Lisbon', 'en'], ['Lisabon', 'cs']]), /VALUES \?l \{ "Lisbon"@en "Lisabon"@cs \} \?item rdfs:label \?l ; wdt:P3134 \?ta ; wdt:P625 \?c/);
  assert.deepEqual(pickByName(WD_NAMES, 38.7223, -9.1393), ['g189158', 'g3874225'], 'město (1,6 km) před okresem (4 km)');
  assert.deepEqual(pickByName(WD_NAMES, 48.8566, 2.3522), ['g187147'], 'Paříže v USA, Kanadě a Itálii daleko');
  assert.deepEqual(pickByName(WD_NAMES, PRAGUE.lat, PRAGUE.lon), []);
  // město příletu (krok Ubytování u jednoho místa posílá jen název, letiště a polohu – bez ID GeoNames)
  const calls = [];
  const sparql = async (s, ms) => {
    calls.push([s.includes('wikibase:around') ? 'around' : s.includes('rdfs:label') ? 'name' : 'gid', ms]);
    if (s.includes('wikibase:around')) throw new Error(`Timeout ${ms} ms: https://query.wikidata.org/sparql`);
    return s.includes('rdfs:label') ? WD_NAMES : [];
  };
  const q = normalizeStayQuery({ city: 'Lisabon', iata: 'LIS', cc: 'PT', lat: 38.7223, lon: -9.1393, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2 });
  assert.equal(q.cityEn, 'Lisbon');
  assert.deepEqual(await locationKeys(q, { sparql }), ['g189158', 'g3874225']);
  assert.deepEqual(calls, [['name', 10000]], 'jediný krátký dotaz, pomalý dotaz na okolí vůbec ne');
});

test('pomalý dotaz na okolí jen když rychlé nic nenajdou (timeout 35 s); místo bez hotelů v okolí → okolí až dodatečně', async () => {
  const kind = (s) => (s.includes('wikibase:around') ? 'around' : s.includes('rdfs:label') ? 'name' : 'gid');
  const calls = [];
  const sparql = async (s, ms) => { calls.push([kind(s), ms]); return kind(s) === 'around' ? [row('Qa', { ta: '900020', pop: 9000, dist: 0.5 })] : []; };
  assert.deepEqual(await locationKeys({ city: 'Kaplice', cityEn: 'Kaplice', gid: '3074199', lat: 48.74, lon: 14.5 }, { sparql }), ['g900020']);
  assert.deepEqual(calls, [['gid', 10000], ['name', 10000], ['around', 35000]]);
  // ID GeoNames najde místo, ale jeho seznam hotelů je prázdný (ID atrakce) → obce v okolí až teď
  const stub = stubFetch((url) => {
    if (url.includes('location_key=g900030')) return { body: { result: { list: [] } } };
    if (url.includes('location_key=g900031')) return { body: { result: { list: LIST_PRAGUE.slice(0, 3) } } };
    if (url.includes('/api/rates?')) return { body: ratesFor(new URL(url).searchParams.get('hotel_key')) };
    return { status: 404, body: '{}' };
  });
  try {
    const seen = [];
    const sp = async (s) => {
      seen.push(kind(s));
      return kind(s) === 'gid' ? [{ ta: lit('900030') }] : kind(s) === 'around' ? [row('Qb', { ta: '900031', pop: 5000, dist: 1 })] : [];
    };
    const items = await searchXotelo(query({ gid: '123', lat: 49.97, lon: 14.4 }), { sparql: sp });
    assert.deepEqual(seen, ['gid', 'around']);
    assert.equal(items.length, 3);
  } finally {
    stub.restore();
  }
});

test('souběžná hledání se ve frontě střídají: každé dostane ceny, nejvýš 5 dotazů naráz; bez času na ceny → částečný prázdný výsledek, ne chyba', async () => {
  let active = 0;
  let peak = 0;
  const stub = stubFetch(async (url) => {
    if (url.includes('/api/list?')) return { body: { result: { list: LIST_PRAGUE } } };
    peak = Math.max(peak, ++active);
    await new Promise((r) => setTimeout(r, 150));
    active--;
    return { body: ratesFor(new URL(url).searchParams.get('hotel_key')) };
  });
  try {
    // tři hledání naráz (jiné termíny: noci ±, záložky míst trasy, víc lidí), každý dotaz 150 ms, rozpočet 700 ms
    const res = await Promise.all([30, 40, 50].map((d) => searchXotelo(query({ checkin: ymdPlus(d), checkout: ymdPlus(d + 3) }), { sparql: async () => [], budgetMs: 700 }).catch((e) => e.message)));
    assert.ok(res.every((r) => Array.isArray(r) && r.length >= 3), JSON.stringify(res.map((r) => (Array.isArray(r) ? r.length : r))));
    assert.ok(peak <= 5, `naráz ${peak}`);
    // na ceny nezbyl čas → [] s příznakem partial (searchStays: ok, „zkusit znovu“), ne chyba zdroje
    const starved = await searchXotelo(query({ checkin: ymdPlus(60), checkout: ymdPlus(62) }), { sparql: async () => [], budgetMs: 0 });
    assert.deepEqual([starved.length, starved.partial], [0, true]);
  } finally {
    stub.restore();
  }
});

test('výpadek Xotela: po chybě seznamu se na 2 min vynechá – další hledání hned a bez dotazu; česká chyba bez adresy; seznam bez opakování', async () => {
  const stub = stubFetch(() => ({ status: 503, body: 'down' }));
  try {
    await assert.rejects(searchXotelo(query(), { sparql: async () => [] }), /^Error: má výpadek \(HTTP 503\)$/);
    assert.equal(stub.calls.length, 1, 'seznam se neopakuje');
    assert.ok(xoteloBlocked() && xoteloRetryAfter() > 110 && xoteloRetryAfter() <= 120, `${xoteloRetryAfter()} s`);
    const t0 = Date.now();
    await assert.rejects(searchXotelo(query({ checkin: ymdPlus(40), checkout: ymdPlus(42) }), { sparql: async () => [] }), /^Error: má výpadek \(HTTP 503\) – teď se vynechává, další pokus za 2 min$/);
    assert.ok(Date.now() - t0 < 200);
    assert.equal(stub.calls.length, 1, 'během pojistky žádný dotaz');
    await withConfig({ mock: false, liteapiKey: '', xotelo: true }, async () => {
      const r = await searchStays({ city: 'Praha', cityEn: 'Prague', cc: 'CZ', ...PRAGUE, checkin: ymdPlus(45), checkout: ymdPlus(47), adults: 2 });
      assert.deepEqual([r.providers[0].ok, r.items.length], [false, 0]);
      assert.doesNotMatch(r.providers[0].error, /https?:/, 'chyba bez adresy');
      assert.ok(r.links.length > 0, 'odkazy na partnery hned');
      const x = providerStatus().find((p) => p.id === 'xotelo');
      assert.equal(x.blocked, true);
      assert.match(x.hint, /má výpadek \(HTTP 503\) – teď se vynechává/);
    });
  } finally {
    stub.restore();
  }
  // Xotelo visí: timeout seznamu (10 s, bez opakování) → česky „neodpověděl včas“, vynechá se
  resetXoteloBreaker();
  const hang = stubFetch(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  try {
    await assert.rejects(hotelList('g274707'), /^Error: neodpověděl včas$/);
    assert.equal(hang.calls.length, 1);
    assert.ok(xoteloBlocked());
  } finally {
    hang.restore();
  }
});

test('Xotelo omezuje (429): vynechá se na dobu z Retry-After, další hledání už nepošle 12 dotazů na ceny', async () => {
  const stub = stubFetch((url) => (url.includes('/api/list?')
    ? { body: { result: { list: LIST_PRAGUE } } }
    : { status: 429, body: '{"message":"Too many requests"}', headers: { 'content-type': 'application/json', 'retry-after': '120' } }));
  try {
    await assert.rejects(searchXotelo(query(), { sparql: async () => [] }), /^Error: omezuje počet dotazů \(HTTP 429\)$/);
    const rates = () => stub.calls.filter((c) => c.url.includes('/api/rates?')).length;
    assert.ok(rates() <= PER_SEARCH_MAX, `${rates()} dotazů na ceny`);
    assert.ok(xoteloRetryAfter() > 110 && xoteloRetryAfter() <= 120);
    const n = stub.calls.length;
    await assert.rejects(searchXotelo(query({ checkin: ymdPlus(41), checkout: ymdPlus(43) }), { sparql: async () => [] }), /teď se vynechává/);
    assert.equal(stub.calls.length, n, 'seznam z mezipaměti, ceny se neposílají');
  } finally {
    stub.restore();
  }
});

test('Xotelo odmítá dotazy (401/403) nebo vrátí 200 s chybou → chyba zdroje (neukládá se jako „místo bez hotelů“); 400/404 → prázdný seznam', async () => {
  let mode = '401';
  const stub = stubFetch(() => (mode === '401' ? { status: 401, body: '{"message":"You are not subscribed to this API."}' }
    : mode === 'err' ? { body: { error: { message: 'Invalid location key' }, result: null } }
      : { status: 404, body: '{}' }));
  try {
    await assert.rejects(hotelList('g274707'), /^Error: odmítá dotazy \(HTTP 401\)$/);
    assert.equal(cache.get('xo:list:g274707'), undefined);
    assert.ok(xoteloRetryAfter() > 29 * 60, 'odmítnutí: 30 min');
    resetXoteloBreaker();
    mode = 'err';
    await assert.rejects(hotelList('g274707'), /^Error: vrátil chybu: Invalid location key$/);
    assert.equal(cache.get('xo:list:g274707'), undefined);
    assert.ok(!xoteloBlocked(), 'chybná odpověď není výpadek');
    mode = '404';
    assert.deepEqual(await hotelList('g274707'), []);
    assert.deepEqual(await hotelRates('g274707-d1', { checkin: ymdPlus(10), checkout: ymdPlus(12), adults: 2, rooms: 1 }), { currency: 'EUR', rates: [] });
  } finally {
    stub.restore();
  }
});

test('„Zkusit znovu“ (retry=1): neúplný výsledek se přepočítá hned a doptá se jen na chybějící ceny; úplný zůstane z mezipaměti', async () => {
  const keys = LIST_PRAGUE.map((h) => h.key);
  let failOnce = true;
  const stub = stubFetch((url) => {
    if (url.includes('/api/list?')) return { body: { result: { list: LIST_PRAGUE } } };
    if (url.includes('/api/rates?')) {
      const k = new URL(url).searchParams.get('hotel_key');
      if (k === keys[1] && failOnce) {
        failOnce = false;
        return { status: 502, body: 'x' };
      }
      return { body: ratesFor(k) };
    }
    return { status: 404, body: '{}' };
  });
  try {
    await withConfig({ mock: false, liteapiKey: '', xotelo: true }, async () => {
      const raw = { city: 'Praha', cityEn: 'Prague', cc: 'CZ', ...PRAGUE, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2 };
      const a = await searchStays(raw);
      assert.deepEqual([a.providers[0].ok, a.providers[0].count, a.providers[0].partial], [true, 11, true]);
      const n = stub.calls.length;
      await searchStays(raw);
      assert.equal(stub.calls.length, n, 'bez retry z mezipaměti (5 min)');
      const b = await searchStays({ ...raw, retry: '1' });
      assert.deepEqual([b.providers[0].count, b.providers[0].partial], [12, undefined]);
      assert.deepEqual(stub.calls.slice(n).map((c) => new URL(c.url).searchParams.get('hotel_key')), [keys[1]], 'jen chybějící cena');
      await searchStays({ ...raw, retry: '1' });
      assert.equal(stub.calls.length, n + 1, 'úplný výsledek se znovu nepočítá');
    });
  } finally {
    stub.restore();
  }
});

test('výběr poskytovatele: DEMO → ukázková data, ostrý klíč LiteAPI má přednost, sandbox nebo bez klíče → Xotelo, XOTELO=off → jen odkazy', async () => {
  const ids = () => stayProviders().map((p) => p.id);
  await withConfig({ mock: true, liteapiKey: 'prod_x', xotelo: true }, () => assert.deepEqual(ids(), ['demo']));
  await withConfig({ mock: false, liteapiKey: 'prod_x', xotelo: true }, () => assert.deepEqual(ids(), ['liteapi']));
  await withConfig({ mock: false, liteapiKey: 'sand_x', xotelo: true }, () => assert.deepEqual(ids(), ['xotelo']));
  await withConfig({ mock: false, liteapiKey: '', xotelo: true }, () => assert.deepEqual(ids(), ['xotelo']));
  await withConfig({ mock: false, liteapiKey: '', xotelo: false }, () => assert.deepEqual(ids(), []));
  await withConfig({ mock: false, liteapiKey: 'prod_x', xotelo: false }, () => assert.deepEqual(ids(), ['liteapi']));
  assert.equal(xotelo.name, 'TripAdvisor (Xotelo)');
  // proměnná XOTELO: výchozí zapnuto, off/0/false vypne
  const prev = process.env.XOTELO;
  try {
    for (const [v, on] of [[undefined, true], ['', true], ['on', true], ['1', true], ['off', false], ['OFF', false], ['0', false], ['false', false]]) {
      if (v === undefined) delete process.env.XOTELO;
      else process.env.XOTELO = v;
      const { config: c } = await import(`../server/config.js?xotelo=${encodeURIComponent(String(v))}`);
      assert.equal(c.xotelo, on, `XOTELO=${v}`);
    }
  } finally {
    if (prev === undefined) delete process.env.XOTELO;
    else process.env.XOTELO = prev;
  }
});

test('/api/health: zdroj ubytování Xotelo (id, název, zapnuto, kind stays, česká poznámka); s ostrým klíčem LiteAPI nepoužitý', async () => {
  const st = (id) => providerStatus().find((p) => p.id === id);
  await withConfig({ mock: false, liteapiKey: '', xotelo: true }, () => {
    const x = st('xotelo');
    assert.deepEqual([x.name, x.enabled, x.kind, x.tag, x.hint], ['Hotely (TripAdvisor)', true, 'stays', 'orientačně', null]);
    assert.match(x.note, /TripAdvisor.*zdarma, bez klíče/);
    assert.equal(st('liteapi').enabled, false);
    assert.match(st('liteapi').hint, /Volitelné.*přednost/);
  });
  await withConfig({ mock: false, liteapiKey: 'prod_x', xotelo: true }, () => {
    assert.deepEqual([st('liteapi').enabled, st('xotelo').enabled], [true, false]);
    assert.match(st('xotelo').hint, /dává LiteAPI/);
  });
  await withConfig({ mock: false, liteapiKey: 'sand_x', xotelo: true }, () => {
    assert.deepEqual([st('liteapi').enabled, st('xotelo').enabled], [false, true]);
    assert.match(st('liteapi').hint, /Testovací klíč.*TripAdvisor/);
  });
  await withConfig({ mock: false, liteapiKey: '', xotelo: false }, () => {
    assert.equal(st('xotelo').enabled, false);
    assert.match(st('xotelo').hint, /XOTELO=off/);
  });
  // přes server: /api/health i ostrý test (/api/diag) s Xotelem (bez sítě)
  process.env.ATLAS_MOCK = '0';
  const { createServer } = await import('../server/index.js');
  const local = globalThis.fetch;
  const stub = stubFetch((url) => (url.includes('data.xotelo.com/api/list') ? { body: { result: { total_count: 1876, list: LIST_PRAGUE.slice(0, 3) } } } : { status: 404, body: '{}' }));
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await withConfig({ mock: false, liteapiKey: '', xotelo: true }, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const h = await (await local(`${base}/api/health`)).json();
      const x = h.providers.find((p) => p.id === 'xotelo');
      assert.deepEqual([x.enabled, x.kind], [true, 'stays']);
      const d = await (await local(`${base}/api/diag`)).json();
      const s = d.services.find((p) => p.id === 'xotelo');
      assert.ok(s && s.ok, JSON.stringify(s));
      assert.match(s.detail, /3 hotely ve Vídni/);
      assert.ok(stub.calls.some((c) => c.url.includes('location_key=g190454')));
    });
  } finally {
    stub.restore();
    server.close();
  }
});
