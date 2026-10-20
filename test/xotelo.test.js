// Ceny hotelů zdarma přes Xotelo (TripAdvisor): místo z Wikidat, seznam, ceny, odkazy na hotel u webů, „Aktualizovat
// ceny“, výběr poskytovatele, /api/health, karta hotelu v průvodci (public/js/trip.js přes node:vm).
// Bez sítě – odpovědi z test/fixtures/xotelo.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stubFetch, ymdPlus } from './helpers.js';
import { config } from '../server/config.js';
import { setRates } from '../server/lib/fx.js';
import { cache } from '../server/lib/cache.js';
import {
  xotelo, locationKeys, nearbyKeys, pickSettlements, pickByName, placeNames, sparqlNames, seedCity, sparqlAround, hotelList,
  hotelRates, ratesKey, offers, mapHotel, mapHotelGuess, candidates, PLACE_KM, chooseForRates, searchXotelo, locationCacheKey, RADIUS_KM, MAX_RATES,
  resetXoteloBreaker, xoteloBlocked, xoteloRetryAfter, offerLink, offerSite, RATES_TTL, EMPTY_SLOW_MS, EMPTY_TTL, checkHotel, otaName,
  nearbyPlaces, nearbyPool, placeLabel, NEARBY_KM, NEARBY_RADIUS_KM, NEARBY_MAX, SPEC_MS, KEYS_CAP_MS, SAME_NAME_KM,
} from '../server/providers/stays/xotelo.js';
import { TA_PLACES } from '../server/providers/stays/ta-places.js';
import { haversineKm } from '../server/lib/geo.js';
import { stayProviders } from '../server/providers/stays/index.js';
import { mapOsm, rankOsm } from '../server/providers/stays/osm.js';
import { providerStatus } from '../server/providers/index.js';
import { normalizeStayQuery, searchStays, rankStays, FRESH_MS, checkStay } from '../server/lib/stays.js';
import { googleHotelsTs, stayLinks } from '../server/lib/links.js';
import { LIST_PRAGUE, RATES_HERMITAGE, WD_GID_LISBON, WD_AROUND_MADRID, WD_AROUND_KRUMLOV, WD_NAMES } from './fixtures/xotelo.js';

setRates({ base: 'EUR', rates: { EUR: 1, CZK: 25, USD: 1.1 }, source: 'test', date: null });
beforeEach(() => { cache.map.clear(); resetXoteloBreaker(); });

const PRAGUE = { lat: 50.0875, lon: 14.4214 };
const priced = (r) => r.items.filter((h) => !h.guess); // nabídky s cenou (bez orientačních hotelů)
const PER_SEARCH_MAX = 12; // jedno hledání nejvýš 12 dotazů na Xotelo naráz
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
  assert.equal(seedCity(48.2082, 16.3738), 'g190454', 'Vídeň z tabulky míst s oblíbenými hotely (TA_PLACES)');
  // místa, jejichž položka ve Wikidatech ID TripAdvisoru nemá (živě 10/2026) – z tabulky do 8 km od středu hotelů
  assert.equal(PLACE_KM, 8);
  assert.equal(seedCity(44.4072, 8.9339), 'g187823', 'Janov');
  assert.equal(seedCity(45.0703, 7.6869), 'g187855', 'Turín');
  assert.equal(seedCity(53.5511, 9.9937), 'g187331', 'Hamburk (velké město z TA_CITIES)');
  assert.equal(seedCity(61.5, 25.1), null, 'Finsko v tabulkách není');
  assert.match(sparqlAround(50.1, 14.4), /wikibase:radius "20"[\s\S]*wdt:P3134[\s\S]*UNION[\s\S]*wikibase:radius "3"[\s\S]*wdt:P1082/);
});

test('místo TripAdvisoru stejného jména jako místo pobytu platí do 15 km (Montalcino 11 km), před bližším místem jiného jména', async () => {
  assert.equal(SAME_NAME_KM, 15);
  const MON = { lat: 43.0566, lon: 11.4892 };
  assert.equal(seedCity(MON.lat, MON.lon), null, 'bez názvu: místo z tabulky je 11 km daleko (víc než PLACE_KM)');
  assert.equal(seedCity(MON.lat, MON.lon, ['Montalcino']), 'g635634');
  assert.equal(seedCity(MON.lat, MON.lon, ['MONTALCINO', 'x']), 'g635634', 'bez ohledu na velikost písmen');
  assert.equal(seedCity(MON.lat, MON.lon, ['Siena']), null, 'jiný název nepomůže');
  assert.equal(seedCity(MON.lat + 0.1, MON.lon, ['Montalcino']), null, 'dál než 15 km ne');
  // Modica: střed hotelů 12 km od obce, Ragusa 8 km – stejný název má přednost
  assert.equal(seedCity(36.8586, 14.7608), 'g194872');
  assert.equal(seedCity(36.8586, 14.7608, ['Modica']), 'g616190');
  // bez diakritiky (Cefalù = „Cefalu“ z adresy hotelu), velké město z TA_CITIES česky
  assert.equal(seedCity(38.0334, 14.13, ['Cefalù']), 'g194726');
  assert.equal(seedCity(49.97, 14.4), null);
  assert.equal(seedCity(49.97, 14.4, ['Praha']), 'g274707', 'Praha 13 km od středu');
  // locationKeys: z tabulky podle názvu, bez dotazu na Wikidata
  const sparql = async () => { throw new Error('na Wikidata se nemá ptát'); };
  assert.deepEqual(await locationKeys(normalizeStayQuery({ city: 'Montalcino', cityEn: 'Montalcino', cc: 'IT', ...MON, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 1 }), { sparql }), ['g635634']);
});

test('tabulka míst TripAdvisoru: doplněná turistická místa (10/2026) – vlastní místo, název z adresy; ID jednou', () => {
  const towns = [['Agrigento', 37.3125, 13.575, 'g194662'], ['Ragusa', 36.925, 14.7306, 'g194872'], ['Piazza Armerina', 37.3833, 14.3667, 'g580232'],
    ['Palazzolo Acreide', 37.0617, 14.9019, 'g1204633'], ['Cefalù', 38.0383, 14.0264, 'g194726'], ['Úbeda', 38.0117, -3.3717, 'g580278'],
    ['Alcobaça', 39.55, -8.975, 'g230083'], ['Paestum', 40.4226, 15.0056, 'g194845'], ['Vers-Pont-du-Gard', 43.9686, 4.5244, 'g651718']];
  for (const [name, lat, lon, key] of towns) {
    assert.equal(seedCity(lat, lon), key, name);
    assert.equal(seedCity(lat, lon, [name]), key, `${name} podle názvu`);
  }
  const label = (id) => placeLabel(TA_PLACES.find((p) => p[0] === id)[3]);
  assert.deepEqual([194662, 580232, 1204633, 668217, 194845, 651718, 230083].map(label), ['Agrigento', 'Piazza Armerina', 'Palazzolo Acreide', 'San Quirico d Orcia', 'Paestum', 'Vers-Pont-du-Gard', 'Alcobaca']);
  const ids = TA_PLACES.map((p) => p[0]);
  assert.equal(new Set(ids).size, ids.length, 'každé ID jednou');
  assert.ok(TA_PLACES.every(([id, lat, lon, n]) => Number.isInteger(id) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && typeof n === 'string' && n.length <= 33 && n === n.trim()));
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
  const q2 = { lat: 46.9, lon: 13.6 };
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
  assert.deepEqual(of.map((o) => [o.code, o.tax]), [['Agoda', true], ['TravelClickCPA', false], ['BookingCom', false]], 'kód webu zůstává; daně uvedené jen u Agody');
  assert.deepEqual(offers({ currency: 'XYZ', rates: [{ name: 'A', rate: 10 }] }, q), [], 'neznámá měna → bez ceny');
  assert.deepEqual(['Official Hotel Site', 'Official Site', 'Hotel Website'].map((name) => offers({ currency: 'EUR', rates: [{ name, rate: 10 }] }, q)[0].name), ['web hotelu', 'web hotelu', 'web hotelu']);
});

test('hotel → nabídka: hodnocení 0–5 i 0–10, vzdálenost, ceny u webů s odkazy, snídaně, hlavní odkaz na web nejlevnější nabídky, zmenšená fotka', () => {
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
  assert.deepEqual(h.rates.map((r) => [r.code, r.site]), [['Vio', null], ['CtripTA', 'trip'], ['Agoda', null], ['TravelClickCPA', null], ['BookingCom', 'booking']]);
  // nejlevnější Vio.com spolehlivý odkaz na hotel nemá → hlavní odkaz Google Hotels s živými cenami hotelu u všech webů
  assert.equal(h.bookUrl, h.rates[0].url);
  assert.equal(h.bookUrl, `https://www.google.com/travel/search?q=Hermitage%20Hotel%20Prague%20Prague&hl=cs&curr=CZK&ts=${googleHotelsTs('2026-11-12', '2026-11-14', 2)}`);
  assert.equal(h.ratesAt, null, 'ceny bez času (fixture) → null');
  const u = new URL(h.rates.at(-1).url);
  assert.equal(u.hostname, 'www.booking.com');
  assert.deepEqual(['ss', 'checkin', 'checkout', 'group_adults', 'no_rooms'].map((k) => u.searchParams.get(k)), ['Hermitage Hotel Prague, Prague', '2026-11-12', '2026-11-14', '2', '1']);
  assert.match(h.photo, /^https:\/\/dynamic-media-cdn\.tripadvisor\.com\/media\/photo-o\/.+\.jpg\?w=400&h=-1&s=1$/);
  assert.match(h.reviewsUrl, /^https:\/\/www\.tripadvisor\.com\/Hotel_Review-g274707-d1235795-/);
  const bb = mapHotel(LIST_PRAGUE[7], RATES_HERMITAGE, q, PRAGUE);
  assert.deepEqual([bb.type, bb.typeLabel, bb.breakfast], ['penzion', 'B&B', true], 'Bed and Breakfast se snídaní');
  assert.equal(mapHotel(LIST_PRAGUE[0], { currency: 'EUR', rates: [] }, q, PRAGUE), null, 'bez nabídky (obsazeno / neznámé) → nic');
  // partnerský odkaz (Travelpayouts) má příznak – karta ho označí „reklama“ (jen Booking.com)
  assert.equal(h.bookSponsored, false);
  assert.ok(h.rates.every((r) => r.sponsored === false));
  const prev = { m: config.travelpayoutsMarker, t: config.travelpayoutsTrs };
  Object.assign(config, { travelpayoutsMarker: '123456', travelpayoutsTrs: '7890' });
  try {
    const a = mapHotel(LIST_PRAGUE[1], RATES_HERMITAGE, q, PRAGUE);
    assert.equal(a.bookSponsored, false, 'hlavní odkaz vede na Google Hotels – bez provize');
    assert.deepEqual(a.rates.map((r) => r.sponsored), [false, false, false, false, true]);
    assert.match(a.rates.at(-1).url, /^https:\/\/tp\.media\/r\?/);
    const b = mapHotel(LIST_PRAGUE[1], { currency: 'EUR', rates: [{ code: 'BookingCom', name: 'Booking.com', rate: 90 }, ...RATES_HERMITAGE.rates.filter((r) => r.code !== 'BookingCom')] }, q, PRAGUE);
    assert.deepEqual([b.rates[0].site, b.bookSponsored], ['booking', true], 'Booking.com nejlevnější → hlavní odkaz partnerský');
    assert.match(b.bookUrl, /^https:\/\/tp\.media\/r\?/);
  } finally {
    Object.assign(config, { travelpayoutsMarker: prev.m, travelpayoutsTrs: prev.t });
  }
  assert.equal(mapHotel({ ...LIST_PRAGUE[0], image: 'javascript:alert(1)', url: 'https://evil.example/x' }, RATES_HERMITAGE, q, PRAGUE).photo, null);
});

test('odkaz na hotel u webu nabídky: Booking.com, Trip.com, Hotels.com a Expedia na termín; Agoda, Vio, web hotelu → Google Hotels', () => {
  const q = { city: 'Praha', cityEn: 'Prague', checkin: '2026-11-12', checkout: '2026-11-15', nights: 3, adults: 3, rooms: 2 };
  // web podle názvu i kódu TripAdvisoru
  const sites = [['Booking.com', 'BookingCom'], ['x', 'BookingCom'], ['Trip.com', 'CtripTA'], ['x', 'CtripTA'], ['Hotels.com', 'HotelsCom2'], ['Expedia', 'Expedia'],
    ['Agoda', 'Agoda'], ['Vio.com', 'Vio'], ['web hotelu', 'TravelClickCPA'], ['web hotelu', 'FastbookingDL'], ['Priceline', 'Priceline'], ['TripAdvisor', 'TA']];
  assert.deepEqual(sites.map(([name, code]) => offerSite({ name, code })), ['booking', 'booking', 'trip', 'trip', 'hotelscom', 'expedia', null, null, null, null, null, null]);
  const link = (name, code, qq = q) => offerLink({ code, name, totalCzk: 9000, perNightCzk: 3000, tax: false }, 'Hotel Josef', qq);
  const params = (u) => [new URL(u).origin + new URL(u).pathname, Object.fromEntries(new URL(u).searchParams)];
  const b = link('Booking.com', 'BookingCom');
  assert.deepEqual([b.site, b.sponsored, b.totalCzk, b.code], ['booking', false, 9000, 'BookingCom'], 'nabídka zůstane celá');
  assert.deepEqual(params(b.url), ['https://www.booking.com/searchresults.cs.html', { ss: 'Hotel Josef, Prague', checkin: '2026-11-12', checkout: '2026-11-15', group_adults: '3', no_rooms: '2', lang: 'cs', selected_currency: 'CZK' }]);
  // Trip.com: hledání podle názvu vyplní formulář (potvrdí se Hledat) – stejný formát jako odkaz na místo ve stayLinks
  assert.deepEqual(params(link('Trip.com', 'CtripTA').url), ['https://www.trip.com/hotels/list', { searchWord: 'Hotel Josef, Prague', checkin: '2026-11-12', checkout: '2026-11-15', adult: '3', crn: '2', curr: 'CZK', locale: 'cs-CZ' }]);
  const exp = { destination: 'Hotel Josef, Prague', startDate: '2026-11-12', endDate: '2026-11-15', adults: '3', rooms: '2' };
  assert.deepEqual(params(link('Hotels.com', 'HotelsCom2').url), ['https://www.hotels.com/Hotel-Search', exp]);
  assert.deepEqual(params(link('Expedia', 'Expedia').url), ['https://www.expedia.com/Hotel-Search', exp]);
  // bez spolehlivého odkazu na hotel: Google Hotels – živé ceny tohoto hotelu u všech webů (i Agody, Via, webu hotelu)
  const g = `https://www.google.com/travel/search?q=Hotel%20Josef%20Prague&hl=cs&curr=CZK&ts=${googleHotelsTs('2026-11-12', '2026-11-15', 3)}`;
  for (const [name, code] of [['Agoda', 'Agoda'], ['Vio.com', 'Vio'], ['web hotelu', 'TravelClickCPA']]) {
    assert.deepEqual([link(name, code).site, link(name, code).url, link(name, code).sponsored], [null, g, false], name);
  }
  // bez anglického názvu místa český
  assert.match(link('Agoda', 'Agoda', { ...q, cityEn: '' }).url, /\?q=Hotel%20Josef%20Praha&/);
  // stayLinks (odkazy na místo) mají pořád stejný tvar
  const sl = stayLinks({ ...q, cc: 'CZ' });
  assert.equal(sl.find((l) => l.id === 'trip').url, 'https://www.trip.com/hotels/list?searchWord=Prague%2C+Czechia&checkin=2026-11-12&checkout=2026-11-15&adult=3&crn=2&curr=CZK&locale=cs-CZ');
  assert.equal(sl.find((l) => l.id === 'hotelscom').url, 'https://www.hotels.com/Hotel-Search?destination=Prague%2C+Czechia&startDate=2026-11-12&endDate=2026-11-15&adults=3&rooms=2');
  assert.equal(sl.find((l) => l.id === 'google').url, `https://www.google.com/travel/search?q=hotels%20Prague%2C%20Czechia&hl=cs&curr=CZK&ts=${googleHotelsTs('2026-11-12', '2026-11-15', 3)}`);
  // partnerský odkaz jen u Booking.com
  const prev = { m: config.travelpayoutsMarker, t: config.travelpayoutsTrs };
  Object.assign(config, { travelpayoutsMarker: '123456', travelpayoutsTrs: '7890' });
  try {
    const a = link('Booking.com', 'BookingCom');
    assert.equal(a.sponsored, true);
    assert.equal(new URL(a.url).searchParams.get('u'), b.url);
    assert.deepEqual([link('Trip.com', 'CtripTA').sponsored, link('Agoda', 'Agoda').sponsored], [false, false]);
  } finally {
    Object.assign(config, { travelpayoutsMarker: prev.m, travelpayoutsTrs: prev.t });
  }
});

test('karta hotelu: hlavní odkaz = web nejlevnější nabídky; Booking.com v cenách, kdykoli má nabídku (i jako 8. nejlevnější), jinak v nich není', () => {
  const q = { city: 'Praha', cityEn: 'Prague', checkin: '2026-11-12', checkout: '2026-11-14', nights: 2, adults: 2, rooms: 1 };
  const at = Date.now() - 600e3;
  const rr = (rates) => ({ currency: 'EUR', rates, at });
  const t = mapHotel(LIST_PRAGUE[1], rr([{ code: 'BookingCom', name: 'Booking.com', rate: 100 }, { code: 'CtripTA', name: 'Trip.com', rate: 90 }]), q, PRAGUE);
  assert.deepEqual([new URL(t.bookUrl).hostname, t.rates[0].site, t.bookSponsored, t.ratesAt], ['www.trip.com', 'trip', false, at], 'Trip.com nejlevnější');
  // Agoda nejlevnější, Booking.com na tvoje dny nic (u něj vyprodáno) → Google Hotels; Booking.com v cenách chybí
  const a = mapHotel(LIST_PRAGUE[1], rr([{ code: 'Agoda', name: 'Agoda.com', rate: 80 }, { code: 'Expedia', name: 'Expedia', rate: 85 }]), q, PRAGUE);
  assert.match(a.bookUrl, /^https:\/\/www\.google\.com\/travel\/search\?q=Hermitage%20Hotel%20Prague%20Prague&/);
  assert.deepEqual(a.rates.map((r) => [r.name, r.site]), [['Agoda', null], ['Expedia', 'expedia']]);
  assert.ok(!a.rates.some((r) => r.site === 'booking'));
  // 7 levnějších webů + Booking.com → 6 nejlevnějších a Booking.com (karta ví, že u něj pokoj je)
  const seven = Array.from({ length: 7 }, (_, i) => ({ code: `W${i + 1}`, name: `Web ${i + 1}`, rate: 50 + i }));
  const m = mapHotel(LIST_PRAGUE[1], rr([...seven, { code: 'BookingCom', name: 'Booking.com', rate: 200 }]), q, PRAGUE);
  assert.deepEqual(m.rates.map((r) => r.name), ['Web 1', 'Web 2', 'Web 3', 'Web 4', 'Web 5', 'Web 6', 'Booking.com']);
  assert.equal(mapHotel(LIST_PRAGUE[1], rr(seven), q, PRAGUE).rates.length, 6);
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

test('ceny 1 h v mezipaměti podle hotelu, termínu, dospělých a pokojů, s časem zjištění; dotaz v EUR s popisným User-Agentem', async () => {
  const stub = stubFetch((url) => (url.includes('/api/rates?') ? { body: { error: null, result: RATES_HERMITAGE } } : { status: 404, body: '{}' }));
  try {
    const q = { checkin: ymdPlus(10), checkout: ymdPlus(12), adults: 2, rooms: 1 };
    assert.equal(ratesKey('g274707-d1235795', q), `xo:rates:g274707-d1235795:${q.checkin}:${q.checkout}:2:1`);
    const t0 = Date.now();
    const a = await hotelRates('g274707-d1235795', q);
    await hotelRates('g274707-d1235795', q);
    assert.equal(stub.calls.length, 1);
    assert.equal(a.currency, 'EUR');
    assert.equal(a.rates.length, 5);
    assert.ok(a.at >= t0 && a.at <= Date.now(), 'čas zjištění cen');
    assert.equal(RATES_TTL, 3600e3, 'hodina – při výběru se volno ověří znovu');
    const ttl = cache.map.get(ratesKey('g274707-d1235795', q)).exp - Date.now();
    assert.ok(ttl > RATES_TTL - 60e3 && ttl <= RATES_TTL, `ceny ${Math.round(ttl / 60e3)} min (dřív 2 h)`);
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

test('„Aktualizovat ceny“ u hotelu (fresh): dotaz i s cenou v mezipaměti a nová se uloží; nevyjde-li, zůstane dřívější (stale), bez ní chyba; pojistka platí', async () => {
  let rate = 100;
  let down = false;
  const stub = stubFetch((url) => (!url.includes('/api/rates?') ? { status: 404, body: '{}' }
    : down ? { status: 503, body: 'x' } : { body: { error: null, result: { currency: 'EUR', rates: [{ code: 'Agoda', name: 'Agoda.com', rate }] } } }));
  try {
    const q = { checkin: ymdPlus(10), checkout: ymdPlus(12), adults: 2, rooms: 1 };
    const k = 'g274707-d1235795';
    const a = await hotelRates(k, q);
    rate = 80;
    assert.equal((await hotelRates(k, q)).rates[0].rate, 100, 'bez fresh z mezipaměti');
    const b = await hotelRates(k, q, { fresh: true });
    assert.equal(stub.calls.length, 2);
    assert.deepEqual([b.rates[0].rate, b.stale], [80, undefined]);
    assert.ok(b.at >= a.at);
    assert.equal((await hotelRates(k, q)).rates[0].rate, 80, 'nová cena v mezipaměti');
    assert.ok(cache.map.get(ratesKey(k, q)).exp - Date.now() > RATES_TTL - 60e3, 'zase na 2 h');
    down = true;
    const c = await hotelRates(k, q, { fresh: true });
    assert.deepEqual([c.rates[0].rate, c.stale, c.at], [80, true, b.at], 'výpadek → dřívější cena s jejím časem');
    assert.equal(cache.get(ratesKey(k, q)).stale, undefined, 'příznak se neukládá');
    await assert.rejects(hotelRates('g274707-d2', q, { fresh: true }), /^Error: má výpadek \(HTTP 503\)$/, 'bez dřívější ceny chyba');
    await hotelRates(k, q, { fresh: true });
    assert.ok(xoteloBlocked(), '3 chyby za sebou → pojistka');
    const n = stub.calls.length;
    const d = await hotelRates(k, q, { fresh: true });
    assert.deepEqual([stub.calls.length, d.rates[0].rate, d.stale], [n, 80, true], 'při pojistce se dotaz nepošle');
  } finally {
    stub.restore();
  }
});

test('prázdné ceny až po dlouhém čekání (Xotelo nestihl TripAdvisor) = zkusit znovu: skoro se nepamatují, hledání je neúplné; rychlé [] = bez nabídky na 2 h', async () => {
  assert.deepEqual([EMPTY_SLOW_MS, EMPTY_TTL], [8000, 1000]);
  let empty = true;
  const stub = stubFetch((url) => {
    if (url.includes('/api/list?')) return { body: { result: { list: LIST_PRAGUE } } };
    if (url.includes('/api/rates?')) return { body: empty ? { error: null, result: { currency: 'EUR', rates: [] } } : ratesFor(new URL(url).searchParams.get('hotel_key')) };
    return { status: 404, body: '{}' };
  });
  try {
    const q = { checkin: ymdPlus(10), checkout: ymdPlus(12), adults: 2, rooms: 1 };
    const k = 'g274707-d1235795';
    // rychlé [] (stub odpoví hned) = opravdu bez nabídky
    const a = await hotelRates(k, q);
    assert.deepEqual([a.rates, a.slow], [[], undefined]);
    assert.ok(cache.map.get(ratesKey(k, q)).exp - Date.now() > RATES_TTL - 60e3);
    // [] po slowMs = nestihlo se: v mezipaměti jen EMPTY_TTL
    const k2 = 'g274707-d2';
    const b = await hotelRates(k2, q, { slowMs: 0 });
    assert.deepEqual([b.rates, b.slow], [[], true]);
    assert.ok(cache.map.get(ratesKey(k2, q)).exp - Date.now() <= EMPTY_TTL);
    // „Aktualizovat ceny“: nestihlo se → dřívější ceny zůstanou (hotel se nevyprodal)
    empty = false;
    const k3 = LIST_PRAGUE[0].key;
    const c = await hotelRates(k3, q);
    empty = true;
    const d = await hotelRates(k3, q, { fresh: true, slowMs: 0 });
    assert.deepEqual([d.rates.length > 0, d.stale, d.at], [true, true, c.at]);
    assert.ok(cache.get(ratesKey(k3, q)).rates.length > 0, 'v mezipaměti zůstanou ceny');
    // celé hledání: [] po slowMs → partial (průvodce se doptá), hotely orientačně
    const qs = normalizeStayQuery({ city: 'Praha', cityEn: 'Prague', cc: 'CZ', gid: '3067696', ...PRAGUE, checkin: ymdPlus(40), checkout: ymdPlus(42), adults: 2 });
    const sparql = async () => [];
    const r = await searchXotelo(qs, { sparql, slowMs: 0 });
    assert.deepEqual([r.length, r.partial, r.guesses.length > 0], [0, true, true]);
    const r2 = await searchXotelo({ ...qs, checkout: ymdPlus(43), nights: 3 }, { sparql });
    assert.deepEqual([r2.length, r2.partial], [0, undefined], 'rychlé [] = bez nabídky, ne neúplné');
  } finally {
    stub.restore();
  }
});

test('„Aktualizovat ceny“ (fresh=1): ceny všech hotelů znovu (místo i seznam z mezipaměti), vyprodaný zmizí; na dotaz nejvýš jednou za 5 min, jinak z mezipaměti s refreshIn; výpadek → dřívější ceny (stale)', async () => {
  let soldOut = null;
  let down = false;
  let downKey = null;
  const stub = stubFetch((url) => {
    if (url.includes('/api/list?')) return { body: { result: { list: LIST_PRAGUE } } };
    if (url.includes('/api/rates?')) {
      const k = new URL(url).searchParams.get('hotel_key');
      if (down || k === downKey) return { status: 503, body: 'x' };
      return { body: k === soldOut ? { error: null, result: { currency: 'EUR', rates: [] } } : ratesFor(k) };
    }
    return { status: 404, body: '{}' };
  });
  const count = (re) => stub.calls.filter((c) => re.test(c.url)).length;
  try {
    await withConfig({ mock: false, liteapiKey: '', xotelo: true }, async () => {
      const raw = { city: 'Praha', cityEn: 'Prague', cc: 'CZ', ...PRAGUE, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2 };
      const a = await searchStays(raw);
      assert.deepEqual([a.providers[0].count, a.providers[0].partial, count(/\/api\/rates\?/), count(/\/api\/list\?/)], [12, undefined, 12, 1]);
      const t0 = Math.min(...priced(a).map((h) => h.ratesAt));
      assert.ok(t0 > Date.now() - 60e3, 'u hotelu čas zjištění cen');
      soldOut = a.items[0].id.slice(3); // hotel se mezitím vyprodal
      assert.equal(priced(await searchStays(raw)).length, 12, 'bez fresh z mezipaměti (i vyprodaný)');
      assert.equal(count(/\/api\/rates\?/), 12);
      const b = await searchStays({ ...raw, fresh: '1' });
      assert.deepEqual([count(/\/api\/rates\?/), count(/\/api\/list\?/)], [24, 1], 'ceny všech 12 hotelů znovu, nic dalšího');
      assert.deepEqual([b.providers[0].count, b.providers[0].stale, b.providers[0].refreshIn], [11, undefined, undefined]);
      // vyprodaný hotel už nemá cenu – zůstane jen orientačně (bez ceny na tvoje dny, odkaz na Google Hotels)
      assert.ok(!priced(b).some((h) => h.id === `xo:${soldOut}`), 'vyprodaný hotel zmizel z nabídek s cenou');
      assert.ok(b.items.some((h) => h.id === `xo:${soldOut}` && h.guess));
      assert.ok(priced(b).every((h) => h.ratesAt >= t0));
      // hned znovu: z mezipaměti, s poznámkou, za kolik to půjde
      const c = await searchStays({ ...raw, fresh: '1' });
      assert.deepEqual([count(/\/api\/rates\?/), priced(c).length], [24, 11]);
      assert.ok(c.providers[0].refreshIn > 290 && c.providers[0].refreshIn <= 300, `${c.providers[0].refreshIn} s`);
      const d = await searchStays(raw);
      assert.deepEqual([priced(d).length, d.providers[0].refreshIn], [11, undefined], 'aktualizovaný výsledek v mezipaměti, bez poznámky');
      // jiný termín = jiný dotaz – aktualizovat jde hned
      await searchStays({ ...raw, checkout: ymdPlus(34) });
      const e = await searchStays({ ...raw, checkout: ymdPlus(34), fresh: '1' });
      assert.deepEqual([count(/\/api\/rates\?/), e.providers[0].refreshIn], [48, undefined]);
      // po 5 min znovu, Xotelo teď nefunguje → dřívější ceny (stale), žádná chyba; po 3 chybách pojistka
      assert.equal(FRESH_MS, 5 * 60e3);
      const g = [...cache.map.keys()].find((x) => x.startsWith('stay:xotelo:') && x.endsWith(`:${ymdPlus(30)}:${ymdPlus(33)}:2:1:fresh`));
      assert.ok(g, 'pojistka podle klíče dotazu');
      cache.map.get(g).exp = Date.now() - 1;
      // jeden hotel nejde aktualizovat → jen „část cen“ (stale bez staleAll), zábrana 5 min platí
      downKey = b.items[0].id.slice(3);
      const p = await searchStays({ ...raw, fresh: '1' });
      assert.deepEqual([p.providers[0].count, p.providers[0].stale, p.providers[0].staleAll], [11, true, undefined]);
      assert.ok(cache.map.has(g) && cache.map.get(g).exp > Date.now(), 'zábrana po částečné aktualizaci zůstává');
      cache.map.get(g).exp = Date.now() - 1;
      downKey = null;
      down = true;
      const n0 = count(/\/api\/rates\?/);
      const f = await searchStays({ ...raw, fresh: '1' });
      assert.deepEqual([f.providers[0].ok, f.providers[0].count, f.providers[0].stale, f.providers[0].staleAll], [true, 11, true, true]);
      assert.ok(count(/\/api\/rates\?/) - n0 >= 2 && count(/\/api\/rates\?/) - n0 <= PER_SEARCH_MAX, `${count(/\/api\/rates\?/) - n0} dotazů`);
      // nic se neaktualizovalo → zábrana 5 min neplatí (žádné „aktualizovaly před chvílí“), další pokus hlídá pojistka
      assert.ok(!cache.map.has(g) || cache.map.get(g).exp <= Date.now(), 'zábrana po neúspěchu zrušená');
      const n1 = count(/\/api\/rates\?/);
      const h = await searchStays({ ...raw, fresh: '1' });
      assert.deepEqual([h.providers[0].count, h.providers[0].refreshIn, h.providers[0].staleAll], [11, undefined, true]);
      assert.equal(count(/\/api\/rates\?/), n1, 'pojistka: Xotelo se znovu neptá');
    });
  } finally {
    stub.restore();
  }
});

test('fresh=1 jen u zdroje, který to umí: ukázková data (DEMO) beze změny, bez poznámek', async () => {
  await withConfig({ mock: true, liteapiKey: '', xotelo: true }, async () => {
    const raw = { city: 'Praha', cc: 'CZ', ...PRAGUE, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2 };
    const a = await searchStays(raw);
    const b = await searchStays({ ...raw, fresh: '1' });
    const c = await searchStays({ ...raw, fresh: '1' });
    assert.equal(a.providers[0].id, 'demo');
    assert.deepEqual([b, c].map((r) => [r.providers[0].refreshIn, r.providers[0].stale]), [[undefined, undefined], [undefined, undefined]]);
    assert.deepEqual(b.items.map((h) => h.bookUrl), a.items.map((h) => h.bookUrl));
    assert.ok(![...cache.map.keys()].some((k) => k.endsWith(':fresh')));
  });
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
      assert.equal(priced(r).length, 10);
      assert.ok(priced(r).every((h) => h.provider === 'xotelo' && h.rates.length === 3 && h.rates[0].name === 'Agoda'));
      assert.ok(!priced(r).some((h) => h.id === `xo:${keys[2]}` || h.id === `xo:${keys[3]}`));
      // hotely bez ceny na tvoje dny zůstanou orientačně (běžné rozpětí za noc, Google Hotels s daty) za nabídkami s cenou
      const g = r.items.filter((h) => h.guess);
      assert.ok(g.some((h) => h.id === `xo:${keys[2]}`) && g.some((h) => h.id === `xo:${keys[3]}`));
      assert.ok(r.items.findIndex((h) => h.guess) >= priced(r).length, 'za nabídkami s cenou');
      assert.ok(g.every((h) => h.priceTotalCzk == null && h.rates.length === 0 && /^https:\/\/www\.google\.com\/travel\/search\?/.test(h.bookUrl)));
      assert.ok(g.some((h) => h.nightFromCzk > 0), 'běžná cena za noc ze seznamu');
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
    assert.ok(n >= 3 && n <= PER_SEARCH_MAX, `po 3 chybách za sebou se zbytek cen neposílá (${n} dotazů z 12)`);
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
    // obec 13 km jižně od středu Prahy – mimo tabulku (12 km, jiný název), hotely z fixtury do 15 km
    const sparql = async () => [row('Qa', { ta: '900010', pop: 9000, dist: 0.5 }), row('Qb', { ta: '900011', pop: 3000, dist: 1 })];
    const q = query({ lat: 49.97, lon: 14.4, city: 'Jesenice', cityEn: 'Jesenice' });
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
  // Lisabon zná tabulka míst – bez dotazu na Wikidata; podle názvu jen mimo tabulky (bod 17 km od středu Lisabonu)
  assert.deepEqual(await locationKeys(q, { sparql }), ['g189158']);
  assert.deepEqual(calls, []);
  const q3 = { ...q, lat: 38.58, lon: -9.02 };
  assert.equal(seedCity(q3.lat, q3.lon), null);
  assert.deepEqual(await locationKeys(q3, { sparql }), ['g189158', 'g3874225']);
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

test('souběžná hledání se ve frontě střídají: každé dostane ceny, nejvýš 16 dotazů naráz; bez času na ceny → částečný prázdný výsledek, ne chyba', async () => {
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
    assert.ok(peak <= 16, `naráz ${peak}`);
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
      : mode === 'down' ? { body: { error: { status_code: 500, message: 'Internal Server Error' }, result: null } }
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
    // 200 s chybou serveru v těle (živě při výpadku Xotela) = výpadek: pojistka jako u HTTP 5xx
    mode = 'down';
    await assert.rejects(hotelList('g274707'), /^Error: má výpadek \(HTTP 500\)$/);
    assert.ok(xoteloBlocked() && xoteloRetryAfter() > 60, 'chyba seznamu hotelů → pojistka');
    assert.equal(cache.get('xo:list:g274707'), undefined);
    resetXoteloBreaker();
    mode = '404';
    assert.deepEqual(await hotelList('g274707'), []);
    const none = await hotelRates('g274707-d1', { checkin: ymdPlus(10), checkout: ymdPlus(12), adults: 2, rooms: 1 });
    assert.deepEqual([none.currency, none.rates], ['EUR', []]);
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

// Karta hotelu v průvodci: public/js/trip.js přes node:vm, zástupné DOM ($ vrací stálé objekty podle selektoru, $$ seznam
// z __all, kliknutí = zavolání onclick), odpověď api/stays sestavená serverovými funkcemi (mapHotel, rankStays, stayLinks).
const jsSrc = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));
const sp = (s) => String(s).replace(/ /g, ' '); // pevná mezera v částkách („4 750 Kč“)
function loadTrip(reply) {
  const ctx = { window: { scrollTo() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(jsSrc('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = jsSrc('app.js').match(/^const (esc|safeUrl|cssUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 7);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = { trips: [] }, __els = {}, __all = {}, __urls = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {}, scrollIntoView() {} });
    var $$ = (s) => __all[s] || [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']'; var toast = () => {};`, ctx, { filename: 'app-helpers.js' });
  ctx.fetch = async (u) => {
    ctx.__urls.push(String(u));
    const body = String(u).startsWith('api/stays?') ? reply(String(u)) : { items: [], links: [], providers: [] };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  vm.runInContext(jsSrc('trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const tleg = (from, to, date, dep, arr) => ({ from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz: 'Europe/Vienna', toTz: 'Europe/Prague', carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: 'https://air.example/book' });
const pragueTrip = () => ({
  v: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'stay', ground: {}, overland: null, route: null, stay: null, car: null, plan: null,
  flight: { out: tleg('VIE', 'PRG', '2026-11-12', '07:00', '08:00'), back: tleg('PRG', 'VIE', '2026-11-14', '19:00', '20:00'), flightCzk: 3000, groundCzk: 0, bagCzk: 0 },
  dest: { label: 'Praha', country: 'Česko', cc: 'CZ', lat: 50.0875, lon: 14.4214 },
});
const STAY_Q = { city: 'Praha', cityEn: 'Prague', cc: 'CZ', country: 'Česko', checkin: '2026-11-12', checkout: '2026-11-14', nights: 2, adults: 2, rooms: 1 };
/** Odpověď api/stays se Xotelem: hotels [[hotel ze seznamu, ceny webů, kdy zjištěné]]. */
function xoteloReply(hotels, prov = {}) {
  const items = rankStays(hotels.map(([h, rates, at]) => mapHotel(h, { currency: 'EUR', rates, at }, STAY_Q, PRAGUE)));
  return { query: STAY_Q, providers: [{ id: 'xotelo', name: 'TripAdvisor (Xotelo)', ok: true, count: items.length, ms: 5, test: false, ...prov }], items, links: stayLinks(STAY_Q) };
}
const hmOf = (ms) => { const x = new Date(ms), p = (n) => String(n).padStart(2, '0'), hm = `${p(x.getHours())}:${p(x.getMinutes())}`; return x.toDateString() === new Date().toDateString() ? hm : `${x.getDate()}. ${x.getMonth() + 1}. ${hm}`; };
// karta hotelu podle názvu (jen seznam – bez poznámky o „reklama“ a odkazů na partnery pod ním)
const cardOf = (html, name) => sp(html).split('<div class="stay-list">')[1].split(/<div class="faint" style="font-size:11.5px;margin-top:6px">Odkazy označené|<details/)[0]
  .split('<div class="stay ').find((x) => x.includes(`<div class="st-name">${name} `));

test('karta hotelu z TripAdvisoru: hlavní odkaz na web nejlevnější nabídky, chipy cen jako odkazy, „Booking.com nic nenabízí“, výběr uloží odkaz, „ceny z“, daně a ↻ Aktualizovat ceny', async () => {
  const now = Date.now();
  const AG = [LIST_PRAGUE[1], [{ code: 'Agoda', name: 'Agoda.com', rate: 80 }, { code: 'Vio', name: 'Vio.com', rate: 85 }, { code: 'CtripTA', name: 'Trip.com', rate: 95 }], now - 20 * 60e3];
  const BK = [LIST_PRAGUE[0], [{ code: 'BookingCom', name: 'Booking.com', rate: 70 }, { code: 'Agoda', name: 'Agoda.com', rate: 75 }], now - 5 * 60e3];
  const TR = [LIST_PRAGUE[2], [{ code: 'CtripTA', name: 'Trip.com', rate: 60 }, { code: 'BookingCom', name: 'Booking.com', rate: 65 }, { code: 'Expedia', name: 'Expedia', rate: 66 }], now];
  const prev = { m: config.travelpayoutsMarker, t: config.travelpayoutsTrs };
  Object.assign(config, { travelpayoutsMarker: '123456', travelpayoutsTrs: '7890' }); // Booking.com partnerský → „reklama“
  let first, fresh, wait;
  try {
    first = xoteloReply([AG, BK, TR]);
    // po aktualizaci: Hermitage vyprodaný, u Booking.com uvedené daně
    const after = [[BK[0], [{ ...BK[1][0], tax: 9 }, BK[1][1]], now], [TR[0], TR[1], now]];
    fresh = xoteloReply(after);
    wait = xoteloReply(after, { refreshIn: 240 });
  } finally {
    Object.assign(config, { travelpayoutsMarker: prev.m, travelpayoutsTrs: prev.t });
  }
  let reply = first;
  const c = loadTrip(() => reply);
  const t = pragueTrip();
  const ag = first.items.findIndex((h) => h.name === 'Hermitage Hotel Prague');
  const pick = { dataset: { pick: String(ag) } };
  c.__all['[data-pick]'] = [pick];
  c.S.trip = t;
  c.window.Trip.render();
  await tick();
  const stays = () => c.__urls.filter((u) => u.startsWith('api/stays?'));
  assert.equal(stays().length, 1);
  assert.ok(!/fresh=|retry=/.test(stays()[0]));
  let html = sp(c.__els['#stayBody'].innerHTML);
  // Agoda nejlevnější (přímý odkaz na hotel nemá) → „porovnat ceny“ na Google Hotels; Booking.com nic nenabízí
  const g = first.items[ag].bookUrl;
  assert.match(g, /^https:\/\/www\.google\.com\/travel\/search\?q=Hermitage%20Hotel%20Prague%20Prague&hl=cs&curr=CZK&ts=/);
  const a = cardOf(html, 'Hermitage Hotel Prague');
  assert.ok(a.includes(`<a class="linkbtn" href="${g.replace(/&/g, '&amp;')}" target="_blank" rel="noopener" title="Google Hotels: živé ceny hotelu u všech webů na tvoje data (Agoda nemá přímý odkaz)">porovnat ceny ↗</a>`), a);
  assert.match(a, /<div class="faint st-nobk">Booking.com na tvoje dny nic nenabízí<\/div>/);
  assert.ok(!a.includes('reklama') && !a.includes('Booking.com ↗'));
  // chipy cen = odkazy na hotel u webu (Trip.com přímo, Agoda a Vio přes Google Hotels)
  const chips = [...a.matchAll(/<a class="ota( best)?" href="([^"]+)" target="_blank" rel="noopener" title="([^"]+)">([^<]+) <b>/g)].map((m) => [m[4], new URL(m[2].replace(/&amp;/g, '&')).hostname, Boolean(m[1])]);
  assert.deepEqual(chips, [['Agoda', 'www.google.com', true], ['Vio.com', 'www.google.com', false], ['Trip.com', 'www.trip.com', false]]);
  assert.match(a, /title="Trip\.com: 4 750 Kč celkem, 2 375 Kč\/noc – Hledání hotelu na Trip\.com na tvoje data – potvrď Hledat"/);
  // Booking.com nejlevnější → „Booking.com ↗“ s „reklama“, bez poznámky
  const b = cardOf(html, 'Mosaic House Design Hotel');
  assert.match(b, /rel="sponsored nofollow noopener" title="Hledání hotelu na Booking\.com na tvoje data">Booking\.com ↗<\/a><span class="ad-tag">reklama<\/span><\/span>/);
  assert.ok(!b.includes('nic nenabízí') && !b.includes('porovnat ceny'));
  assert.match(b, /<a class="ota best" href="https:\/\/tp\.media\/r\?[^"]+" target="_blank" rel="sponsored nofollow noopener" title="[^"]+">Booking\.com <b>3 500 Kč<\/b><span class="ad-tag">reklama<\/span><\/a>/);
  // Trip.com nejlevnější, Booking.com o kousek dráž → oba odkazy
  const tr = cardOf(html, 'The Manes Boutique Hotel Prague');
  assert.deepEqual([...tr.matchAll(/class="linkbtn"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]), ['Trip.com ↗', 'Booking.com ↗']);
  assert.ok(!tr.includes('nic nenabízí'));
  // Trip.com hledá podle názvu – výsledky až po Hledat: viditelná nápověda (na telefonu se title neukáže), když na Trip.com vede
  // hlavní tlačítko (u chipu cen stačí title – jinak by řádek byl skoro u každého hotelu)
  const TRIP_HINT = '<div class="faint st-nobk">Trip.com: hledání potvrď tlačítkem Hledat</div>';
  assert.deepEqual([tr, a, b].map((x) => x.includes(TRIP_HINT)), [true, false, false]);
  // zdroj: z kdy jsou ceny (nejstarší hotel), bez daní u všech nabídek poznámka, tlačítko Aktualizovat; „reklama“ vysvětlená
  assert.ok(html.includes(`Ceny z ${hmOf(now - 20 * 60e3)}.`), html.slice(0, 900));
  assert.ok(html.includes('Cena bez místních poplatků (např. městská taxa), pokud je web neuvádí.'));
  assert.match(html, /<button type="button" class="linkbtn" id="stayFresh" title="[^"]+">↻ Aktualizovat ceny<\/button>/);
  assert.ok(html.includes('Odkazy označené „reklama“ jsou partnerské'));
  // výběr hotelu uloží hlavní odkaz – „co zarezervovat“ ve shrnutí vede tam, kde pokoj je
  await pick.onclick();
  assert.deepEqual([t.stay.mode, t.stay.name, t.stay.url, t.stay.provider, t.step], ['pick', 'Hermitage Hotel Prague', g, 'xotelo', 'car']);
  // zpět v kroku: z paměti prohlížeče; ↻ Aktualizovat ceny → fresh=1, vyprodaný hotel zmizí
  t.step = 'stay';
  c.window.Trip.render();
  await tick();
  assert.equal(stays().length, 1, 'návrat do kroku bez nového dotazu');
  reply = fresh;
  c.__els['#stayFresh'].onclick();
  await tick();
  assert.equal(new URLSearchParams(stays().at(-1).slice(10)).get('fresh'), '1');
  html = sp(c.__els['#stayBody'].innerHTML);
  assert.ok(!html.includes('Hermitage') && html.includes('Mosaic House'));
  assert.ok(html.includes(`Ceny z ${hmOf(now)}.`));
  assert.ok(!html.includes('místních poplatků'), 'Booking.com uvádí daně');
  // znovu hned: server nechá ceny z mezipaměti a řekne, za kolik to půjde
  reply = wait;
  c.__els['#stayFresh'].onclick();
  await tick();
  html = sp(c.__els['#stayBody'].innerHTML);
  assert.ok(html.includes('Ceny se aktualizovaly před chvílí – znovu to půjde za 4 min.'));
  assert.ok(!html.includes('id="stayFresh"'));
  // návrat do kroku: aktualizovaná odpověď z paměti prohlížeče, žádný další dotaz
  c.S.trip.step = 'stay';
  c.window.Trip.render();
  await tick();
  assert.equal(stays().length, 3);
  assert.ok(stays().slice(1).every((u) => new URLSearchParams(u.slice(10)).get('fresh') === '1'));
});

test('hotel bez ceny na tvoje dny: „od ~X/noc“ s odkazem na ceny, výběr = odhad (ve Vybráno a Shrnutí); neúplné ceny → průvodce se sám doptá a s cenou odhad zmizí', async () => {
  const now = Date.now();
  const BK = [LIST_PRAGUE[0], [{ code: 'BookingCom', name: 'Booking.com', rate: 70 }], now];
  const first = xoteloReply([BK], { partial: true, guesses: 1 });
  const gh = mapHotelGuess(LIST_PRAGUE[1], STAY_Q, PRAGUE);
  first.items = rankStays([...first.items, gh]);
  const second = xoteloReply([BK, [LIST_PRAGUE[1], [{ code: 'Agoda', name: 'Agoda.com', rate: 90 }], now]]);
  let reply = first;
  const c = loadTrip(() => reply);
  const timers = [];
  c.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  const t = pragueTrip();
  const gi = first.items.findIndex((h) => h.guess);
  const pick = { dataset: { pick: String(gi) } };
  c.__all['[data-pick]'] = [pick];
  c.S.trip = t;
  c.window.Trip.render();
  await tick();
  let html = sp(c.__els['#stayBody'].innerHTML);
  const card = cardOf(html, 'Hermitage Hotel Prague');
  assert.ok(gh.nightFromCzk > 0 && gh.nightToCzk > gh.nightFromCzk);
  const kc = (n) => sp(`${Math.round(n).toLocaleString('cs-CZ')} Kč`);
  assert.ok(card.includes(`<div class="pp-guess" title="běžně ${kc(gh.nightFromCzk)}–${kc(gh.nightToCzk)} za noc">od ~${kc(gh.nightFromCzk)}/noc</div>`), card);
  assert.match(card, /<a class="linkbtn" href="https:\/\/www\.google\.com\/travel\/search\?[^"]+"[^>]*>ceny na tvoje dny ↗<\/a>/);
  assert.ok(html.includes('U hotelů s „od ~…/noc“ TripAdvisor cenu na tvoje dny nemá – bývají obsazené'));
  assert.match(card, /volno na tvoje dny neověřené/);
  assert.ok(html.includes('Doplňuji ceny dalších hotelů'), 'neúplné ceny → doplňuje se');
  assert.equal(timers.length, 1);
  // výběr hotelu bez ceny: odhad = běžná cena za noc × noci, označený
  await pick.onclick();
  assert.deepEqual([t.stay.mode, t.stay.totalCzk, t.stay.est], ['pick', gh.nightFromCzk * 2, true]);
  t.step = 'stay';
  c.window.Trip.render();
  await tick();
  assert.match(sp(c.__els['#tripStep'].innerHTML), /Vybráno: <b>Hermitage Hotel Prague<\/b> · [^<]+ <span class="faint">\(odhad\)<\/span>/);
  // návrat do kroku: neúplná odpověď se z paměti nebere – nový dotaz, doplňování pokračuje (dřívější načasování nic neudělá)
  assert.equal(timers.length, 2);
  // doplnění: dotaz retry=1, cena přišla → vybraný hotel má skutečnou cenu, odhad končí
  reply = second;
  await timers.pop()();
  timers.length = 0;
  await tick();
  const urls = c.__urls.filter((u) => u.startsWith('api/stays?'));
  assert.equal(new URLSearchParams(urls.at(-1).slice(10)).get('retry'), '1');
  const real = second.items.find((h) => h.name === 'Hermitage Hotel Prague').priceTotalCzk;
  assert.deepEqual([t.stay.totalCzk, t.stay.est], [real, undefined]);
  html = sp(c.__els['#stayBody'].innerHTML);
  assert.ok(!html.includes('pp-guess') && !html.includes('Doplňuji'), 'úplné ceny – už se nedoplňuje');
  assert.equal(timers.length, 0);
});

test('karta hotelu z TripAdvisoru: nepovedená aktualizace řekne pravdu (vše / část cen), Shrnutí u Trip.com „potvrď Hledat“', async () => {
  const now = Date.now();
  const TR = [LIST_PRAGUE[2], [{ code: 'CtripTA', name: 'Trip.com', rate: 60 }, { code: 'Agoda', name: 'Agoda.com', rate: 70 }], now - 30 * 60e3];
  const BK = [LIST_PRAGUE[0], [{ code: 'BookingCom', name: 'Booking.com', rate: 70 }], now - 30 * 60e3];
  for (const [prov, txt] of [[{ stale: true, staleAll: true }, 'Ceny se teď aktualizovat nepodařilo, zůstaly dřívější.'], [{ stale: true }, 'Část cen se teď aktualizovat nepodařilo, zůstaly dřívější.']]) {
    const c = loadTrip(() => xoteloReply([TR, BK], prov));
    c.S.trip = pragueTrip();
    c.window.Trip.render();
    await tick();
    const html = sp(c.__els['#stayBody'].innerHTML);
    assert.ok(html.includes(txt), txt);
    assert.ok(!html.includes('aktualizovaly před chvílí'));
    assert.match(html, /id="stayFresh"/, 'zkusit znovu jde hned');
  }
  // vybraný hotel s odkazem na Trip.com → v „co zarezervovat“ nápověda; jiný web bez ní
  const reply = xoteloReply([TR, BK]);
  const c = loadTrip(() => reply);
  const t = pragueTrip();
  c.S.trip = t;
  c.window.Trip.render();
  await tick();
  const i = reply.items.findIndex((h) => h.name === 'The Manes Boutique Hotel Prague');
  const pick = { dataset: { pick: String(i) } };
  c.__all['[data-pick]'] = [pick];
  c.window.Trip.render();
  await tick();
  c.__all['[data-pick]'] = [pick];
  await pick.onclick();
  assert.match(t.stay.url, /^https:\/\/www\.trip\.com\/hotels\/list\?searchWord=/);
  t.step = 'summary';
  c.window.Trip.render();
  await tick();
  const sum = sp(JSON.stringify(Object.values(c.__els).map((e) => e && e.innerHTML)));
  assert.ok(sum.includes('Ubytování: The Manes Boutique Hotel Prague – na Trip.com potvrď Hledat'), sum.slice(0, 400));
});

test('karta hotelu jiného zdroje (LiteAPI, DEMO) beze změny: „detail ↗“, bez poznámek o Booking.com, času cen a aktualizaci', async () => {
  const items = rankStays([{ id: 'la:1', provider: 'liteapi', name: 'Hotel Lite', type: 'hotel', typeLabel: 'hotel', stars: 4, rating: 8.6, reviews: 120, address: 'Main 1', lat: 50.08, lon: 14.42, distanceKm: 1.2, photo: null, priceTotalCzk: 5000, pricePerNightCzk: 2500, bookUrl: 'https://hotel.example/1', bookSponsored: false, freeCancellation: true, breakfast: null }]);
  const c = loadTrip(() => ({ query: STAY_Q, providers: [{ id: 'liteapi', name: 'LiteAPI', ok: true, count: 1, ms: 5, test: false }], items, links: stayLinks(STAY_Q) }));
  c.S.trip = pragueTrip();
  c.window.Trip.render();
  await tick();
  const html = sp(c.__els['#stayBody'].innerHTML);
  assert.match(cardOf(html, 'Hotel Lite'), /<span class="st-bk"><a class="linkbtn" href="https:\/\/hotel\.example\/1" target="_blank" rel="noopener">detail ↗<\/a><\/span>/);
  for (const s of ['nic nenabízí', 'Ceny z', 'stayFresh', 'místních poplatků', 'st-otas']) assert.ok(!html.includes(s), s);
});

test('↻ Aktualizovat ceny: nabídky zůstanou, dokud nepřijdou nové; nepovedená aktualizace (výpadek sítě) je nechá s poznámkou a tlačítkem, příště se fresh=1 neposílá', async () => {
  const now = Date.now();
  const TR = [LIST_PRAGUE[2], [{ code: 'CtripTA', name: 'Trip.com', rate: 60 }, { code: 'Agoda', name: 'Agoda.com', rate: 70 }], now - 40 * 60e3];
  const BK = [LIST_PRAGUE[0], [{ code: 'BookingCom', name: 'Booking.com', rate: 70 }], now - 30 * 60e3];
  const first = xoteloReply([TR, BK]), fresh = xoteloReply([[BK[0], BK[1], now]]);
  const NET = 'Server ATLAS je teď nedostupný – zkontroluj připojení k internetu a zkus to znovu.';
  let reply = () => first;
  const c = loadTrip((u) => reply(u));
  const t = pragueTrip();
  c.S.trip = t;
  c.window.Trip.render();
  await tick();
  const stays = () => c.__urls.filter((u) => u.startsWith('api/stays?'));
  const body = () => sp(c.__els['#stayBody'].innerHTML);
  assert.ok(body().includes(`Ceny z ${hmOf(now - 40 * 60e3)}.`));
  // klepnutí: hotely zůstanou, místo tlačítka „Aktualizuji ceny…“
  reply = () => { throw new Error(NET); };
  c.__els['#stayFresh'].onclick();
  let html = body();
  assert.ok(html.includes('<span class="st-upd"><span class="spin dark"></span> Aktualizuji ceny…</span>'), html.slice(0, 900));
  assert.ok(html.includes('The Manes Boutique Hotel Prague') && html.includes('Mosaic House Design Hotel'));
  assert.ok(!html.includes('id="stayFresh"'));
  await tick();
  // výpadek: dřívější nabídky s poznámkou, z kdy ceny jsou, a tlačítkem znovu – žádné „nepodařilo se načíst“ místo seznamu
  html = body();
  assert.equal(new URLSearchParams(stays().at(-1).slice(10)).get('fresh'), '1');
  assert.ok(html.includes('The Manes Boutique Hotel Prague') && html.includes('Mosaic House Design Hotel'), html.slice(0, 900));
  assert.ok(html.includes(`<b>Aktualizace se nepovedla</b>: ${NET.slice(0, -1)}. Ceny jsou z ${hmOf(now - 40 * 60e3)}.`), html.slice(0, 1200));
  assert.ok(!html.includes(`Ceny z ${hmOf(now - 40 * 60e3)}.`), 'čas cen jen jednou');
  assert.ok(!html.includes('Nabídky se nepodařilo načíst') && !html.includes('Aktualizuji'));
  assert.match(html, /id="stayFresh"/);
  // řazení překreslí seznam – poznámka zůstane
  c.__els['#staySort'].onchange({ target: { value: 'price' } });
  assert.ok(body().includes('Aktualizace se nepovedla'));
  // návrat do kroku: dřívější nabídky z paměti prohlížeče, žádný další dotaz (natož potichu s fresh=1)
  const n = stays().length;
  t.step = 'car'; c.window.Trip.render(); t.step = 'stay'; c.window.Trip.render();
  await tick();
  assert.equal(stays().length, n);
  assert.ok(body().includes('Mosaic House Design Hotel'));
  // znovu ↻ a tentokrát vyjde: nové ceny, poznámka pryč
  reply = () => fresh;
  c.__els['#stayFresh'].onclick();
  await tick();
  html = body();
  assert.equal(new URLSearchParams(stays().at(-1).slice(10)).get('fresh'), '1');
  assert.ok(!html.includes('The Manes') && html.includes('Mosaic House'));
  assert.ok(!html.includes('nepovedla') && html.includes(`Ceny z ${hmOf(now)}.`));
  // mezitím jiný krok: odpověď nic nepřekreslí, po návratu do kroku ale nové ceny (bez dalšího dotazu)
  let release;
  reply = () => xoteloReply([[TR[0], TR[1], now], [BK[0], BK[1], now]]);
  c.fetch = ((f) => async (u) => { await new Promise((r) => { release = r; }); return f(u); })(c.fetch);
  c.__els['#stayFresh'].onclick();
  t.step = 'car';
  c.__els['#stayBody'].innerHTML = 'jiný krok';
  release();
  await tick(); await tick();
  assert.equal(c.__els['#stayBody'].innerHTML, 'jiný krok');
  const m = stays().length;
  t.step = 'stay'; c.window.Trip.render();
  await tick();
  assert.equal(stays().length, m);
  assert.ok(body().includes('The Manes Boutique Hotel Prague') && !body().includes('Aktualizuji'));
});

test('„Ceny z“ a poznámka o poplatcích jen z hotelů, které filtry ukazují (nejstarší z ukázaných)', async () => {
  const now = Date.now();
  const BK = [LIST_PRAGUE[0], [{ code: 'BookingCom', name: 'Booking.com', rate: 70 }], now - 26 * 3600e3]; // Mosaic: ceny ze včerejška
  const TR = [LIST_PRAGUE[2], [{ code: 'CtripTA', name: 'Trip.com', rate: 60 }], now - 5 * 60e3]; // Manes
  const AG = [LIST_PRAGUE[1], [{ code: 'Agoda', name: 'Agoda.com', rate: 200, tax: 20 }], now - 10 * 60e3]; // Hermitage: s daněmi
  const reply = xoteloReply([BK, TR, AG]);
  const c = loadTrip(() => reply);
  c.S.trip = pragueTrip();
  c.window.Trip.render();
  await tick();
  const body = () => sp(c.__els['#stayBody'].innerHTML);
  assert.ok(body().includes(`Ceny z ${hmOf(now - 26 * 3600e3)}.`));
  assert.ok(!body().includes('místních poplatků'), 'Agoda u Hermitage daně uvádí');
  // max Kč/noc: Mosaic (starší ceny) i Hermitage (s daněmi) schované → čas cen z Manes, poznámka o poplatcích
  const by = (n) => reply.items.find((h) => h.name === n);
  const manes = by('The Manes Boutique Hotel Prague'), mosaic = by('Mosaic House Design Hotel'), herm = by('Hermitage Hotel Prague');
  assert.ok(manes.pricePerNightCzk < mosaic.pricePerNightCzk && mosaic.pricePerNightCzk < herm.pricePerNightCzk);
  c.__els['#stayMax'].onchange({ target: { value: String(manes.pricePerNightCzk) } });
  let html = body();
  assert.ok(html.includes('The Manes Boutique Hotel Prague') && !html.includes('Mosaic House') && !html.includes('Hermitage'), html.slice(0, 600));
  assert.ok(html.includes(`Ceny z ${hmOf(now - 5 * 60e3)}.`), html.slice(0, 900));
  assert.ok(html.includes('Cena bez místních poplatků (např. městská taxa), pokud je web neuvádí.'));
  // filtrům nic neodpovídá → bez času i poznámky
  c.__els['#stayMax'].onchange({ target: { value: '1' } });
  html = body();
  assert.ok(html.includes('Filtrům nic neodpovídá.') && !html.includes('Ceny z') && !html.includes('místních poplatků'));
});

test('ověření volna při výběru: ceny znovu (ne z mezipaměti) – vyprodáno, nová cena, nepovedlo se; kontrola vstupu', async () => {
  const q = { ...STAY_Q, checkin: ymdPlus(20), checkout: ymdPlus(22) };
  let body = { error: null, result: RATES_HERMITAGE };
  const stub = stubFetch((url) => (url.includes('/api/rates?') ? { body } : { status: 404, body: '{}' }));
  try {
    const ok = await checkHotel('g274707-d1235795', 'Hermitage Hotel Prague', q);
    assert.equal(ok.available, true);
    assert.ok(ok.priceTotalCzk > 0 && ok.rates.length > 0 && ok.bookUrl, 'nové ceny s odkazy');
    // podruhé znovu dotaz (ne mezipaměť) – hotel se mezitím vyprodal: rychlé prázdné ceny
    body = { error: null, result: { currency: 'EUR', rates: [] } };
    const sold = await checkHotel('g274707-d1235795', 'Hermitage Hotel Prague', q);
    assert.deepEqual(sold, { available: false });
    assert.equal(stub.calls.filter((x) => x.url.includes('/api/rates?')).length, 2);
    // Xotelo nestihl TripAdvisor (prázdné až po dlouhém čekání) / výpadek → nevím, ne „vyprodáno“
    assert.deepEqual(await checkHotel('g274707-d1235795', 'Hermitage Hotel Prague', { ...q, adults: 3 }, { slowMs: 0 }), { available: null });
    body = null;
    stub.calls.length = 0;
  } finally {
    stub.restore();
  }
  // vstup: klíč hotelu TripAdvisoru a název; jiný zdroj než Xotelo (DEMO) → nevím
  const raw = { city: 'Praha', checkin: ymdPlus(20), checkout: ymdPlus(22), adults: 2 };
  await assert.rejects(checkStay({ ...raw, hotel: 'xo:1', name: 'X' }), /Neplatný hotel/);
  await assert.rejects(checkStay({ ...raw, hotel: 'g1-d2', name: '' }), /Chybí název/);
  const prev = config.mock;
  config.mock = true;
  try {
    assert.deepEqual(await checkStay({ ...raw, hotel: 'g1-d2', name: 'X' }), { available: null });
  } finally {
    config.mock = prev;
  }
  config.mock = false;
  const got = await checkStay({ ...raw, hotel: 'g1-d2', name: 'X' }, { check: async (k, n, qq) => ({ available: false, k, n, a: qq.adults }) });
  assert.deepEqual([got.hotel, got.available, got.k, got.n, got.a, got.at > 0], ['g1-d2', false, 'g1-d2', 'X', 2, true]);
  config.mock = prev;
});

test('výběr hotelu z TripAdvisoru ověří volno: vyprodaný se nevybere (karta ❌, „Vybrat i tak“), s volnem nová cena; bez ceny na tvoje dny až na požádání', async () => {
  const now = Date.now();
  const H = LIST_PRAGUE.slice(0, 4).map((h, k) => [h, [{ code: 'BookingCom', name: 'Booking.com', rate: 70 + 10 * k }], now - 50 * 60e3]);
  const first = xoteloReply(H, { guesses: 1 });
  const gh = mapHotelGuess(LIST_PRAGUE[5] || LIST_PRAGUE[4], STAY_Q, PRAGUE);
  first.items = rankStays([...first.items, gh]);
  const c = loadTrip(() => first);
  let check = { available: false };
  const base = c.fetch;
  c.fetch = async (u) => (String(u).startsWith('api/stays/check?')
    ? (c.__urls.push(String(u)), { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(check)) })
    : base(u));
  const t = pragueTrip();
  const i0 = first.items.findIndex((h) => !h.guess);
  const h0 = first.items[i0];
  const pick = { dataset: { pick: String(i0) } };
  c.__all['[data-pick]'] = [pick];
  c.S.trip = t;
  c.window.Trip.render();
  await tick();
  let html = sp(c.__els['#stayBody'].innerHTML);
  // hotel bez ceny na tvoje dny schovaný (4 s cenou), tlačítko ho ukáže
  assert.ok(!html.includes(gh.name.replace(/&/g, '&amp;') + ' '), 'bez ceny schovaný');
  assert.match(html, /id="stayGuess">Ukázat i 1 hotel bez ceny na tvoje dny \(často obsazené\)/);
  // vyprodáno: dotaz na volno (hotel = klíč TripAdvisoru, stejný dotaz jako nabídky), hotel se nevybere
  await pick.onclick();
  const cu = c.__urls.filter((u) => u.startsWith('api/stays/check?'));
  assert.equal(cu.length, 1);
  const p = new URLSearchParams(cu[0].slice(16));
  assert.deepEqual([p.get('hotel'), p.get('name'), p.get('checkin')], [h0.id.slice(3), h0.name, '2026-11-12']);
  assert.equal(t.stay, null, 'vyprodaný se nevybral');
  html = sp(c.__els['#stayBody'].innerHTML);
  const card = cardOf(html, h0.name);
  assert.match(card, /❌ na tvoje dny vyprodáno/);
  assert.match(card, /data-anyway="1"[^>]*>Vybrat i tak</);
  // volno je, cena jiná → vybere se s novou cenou a odkazem
  check = { available: true, priceTotalCzk: 4321, pricePerNightCzk: 2161, rates: [{ name: 'Booking.com', site: 'booking', totalCzk: 4321, perNightCzk: 2161, url: 'https://www.booking.com/x' }], ratesAt: now, bookUrl: 'https://www.booking.com/x', bookSponsored: false, at: now };
  const i1 = first.items.findIndex((h, k) => !h.guess && k !== i0);
  const pick1 = { dataset: { pick: String(i1) } };
  c.__all['[data-pick]'] = [pick1];
  c.window.Trip.render();
  await tick();
  await pick1.onclick();
  assert.deepEqual([t.stay.mode, t.stay.name, t.stay.totalCzk, t.stay.url], ['pick', first.items[i1].name, 4321, 'https://www.booking.com/x']);
  // ověřit nešlo (chyba, limit) → vybere se bez ověření
  t.stay = null; t.step = 'stay';
  check = { available: null };
  c.window.Trip.render();
  await tick();
  await pick1.onclick();
  assert.equal(t.stay.name, first.items[i1].name);
});

test('název webu nabídky: oficiální web hotelu i v cizím jazyce (kód SSC_…) jako „web hotelu“', () => {
  assert.equal(otaName('ไซต์ที่เป็นทางการ', 'SSC_WuBook_1Fvye4H'), 'web hotelu');
  assert.equal(otaName('Официальный сайт', 'X'), 'web hotelu');
  assert.equal(otaName('Official Site'), 'web hotelu');
  assert.equal(otaName('Hotels.com™', 'HotelsCom2'), 'Hotels.com™', 'značka ™ není cizí písmo');
  assert.equal(otaName('Agoda.com', 'Agoda'), 'Agoda');
  assert.equal(otaName('Booking.com', 'BookingCom'), 'Booking.com');
  assert.equal(otaName('Hotels.com', 'HotelsCom2'), 'Hotels.com');
  assert.equal(otaName('Trip.com', 'CtripTA'), 'Trip.com');
});

test('výběr hotelu: pozdě doběhlé ověření volna nepřepíše pozdější volbu (druhý hotel, „jen odkazy“ a odchod z kroku)', async () => {
  const now = Date.now();
  const H = LIST_PRAGUE.slice(0, 4).map((h, k) => [h, [{ code: 'BookingCom', name: 'Booking.com', rate: 70 + 10 * k }], now - 50 * 60e3]);
  const run = async (fn) => {
    const first = xoteloReply(H);
    const c = loadTrip(() => first);
    const pend = [];
    const base = c.fetch;
    c.fetch = (u) => (String(u).startsWith('api/stays/check?')
      ? new Promise((res) => pend.push(() => res({ ok: true, status: 200, json: async () => ({ available: true, priceTotalCzk: 1234, pricePerNightCzk: 617, rates: [], at: now }) })))
      : base(u));
    const t = pragueTrip();
    const A = { dataset: { pick: '0' }, innerHTML: 'Vybrat' }, B = { dataset: { pick: '1' }, innerHTML: 'Vybrat' };
    c.__all['[data-pick]'] = [A, B];
    c.S.trip = t;
    c.window.Trip.render();
    await tick();
    return fn({ t, A, B, pend, items: first.items });
  };
  // A se ověřuje pomalu, mezitím klepnutí na B: B ověřené první se vybere, pozdější odpověď pro A ho nepřepíše
  await run(async ({ t, A, B, pend, items }) => {
    const pa = A.onclick(); await tick();
    const pb = B.onclick(); await tick();
    pend[1](); await pb;
    assert.equal(t.stay.name, items[1].name);
    pend[0](); await pa;
    assert.equal(t.stay.name, items[1].name, 'platí pozdější volba');
  });
  // během ověřování „jen odkazy“ a dál na shrnutí: odpověď krok nevrátí ani volbu nepřepíše
  await run(async ({ t, A, pend }) => {
    const pa = A.onclick(); await tick();
    t.stay = { mode: 'links', name: '', totalCzk: 0 };
    t.step = 'summary';
    pend[0](); await pa;
    assert.deepEqual([t.stay.mode, t.step], ['links', 'summary']);
  });
});

test('letiště na ostrově: hotely kolem místa z tabulky dopravy do města (Tenerife Jih → Los Cristianos), ne uprostřed ostrova', () => {
  const q = normalizeStayQuery({ city: 'Tenerife', iata: 'TFS', lat: 28.0445, lon: -16.5725, checkin: ymdPlus(30), checkout: ymdPlus(37), adults: 2 });
  assert.deepEqual([q.lat, q.lon], [28.0516, -16.7159]);
  const r = normalizeStayQuery({ city: 'Rhodos', iata: 'RHO', lat: 36.4054, lon: 28.0862, checkin: ymdPlus(30), checkout: ymdPlus(33) });
  assert.deepEqual([r.lat, r.lon], [36.4349, 28.2176], 'město Rhodos');
  // metropole má střed z databáze, místo vybrané uživatelem (ne souřadnice letiště) zůstává
  assert.deepEqual([normalizeStayQuery({ city: 'Řím', iata: 'FCO', lat: 41.8045, lon: 12.252, checkin: ymdPlus(30), checkout: ymdPlus(33) }).lat], [41.9028]);
  assert.equal(normalizeStayQuery({ city: 'Adeje', iata: 'TFS', lat: 28.1227, lon: -16.726, checkin: ymdPlus(30), checkout: ymdPlus(33) }).lat, 28.1227);
  // doprava z letiště jezdí do jiného, vzdáleného města (Memmingen → Mnichov 100 km): hotely v cíli – geokódování názvu
  assert.equal(normalizeStayQuery({ city: 'Memmingen', iata: 'FMM', lat: 47.9881, lon: 10.2382, checkin: ymdPlus(30), checkout: ymdPlus(33) }).lat, null);
});

test('malé místo bez cen z TripAdvisoru: ubytování z OpenStreetMap jde vybrat bez ověřování volna, cenu doplníš ručně', async () => {
  const at = (dLat, dLon) => ({ lat: String(PRAGUE.lat + dLat), lon: String(PRAGUE.lon + dLon) });
  const rows = [
    { category: 'tourism', type: 'hotel', name: 'Hotel Colle Acre', osm_type: 'way', osm_id: 77, ...at(0.002, 0.003), extratags: { stars: '4', website: 'https://collacre.it' } },
    { category: 'tourism', type: 'guest_house', name: 'Agriturismo Bosco', osm_type: 'node', osm_id: 78, ...at(-0.01, 0.01), extratags: {} },
  ];
  const items = rankStays(rankOsm(rows.map((r) => mapOsm(r, STAY_Q, PRAGUE))));
  const reply = { query: STAY_Q, providers: [{ id: 'xotelo', name: 'TripAdvisor (Xotelo)', ok: true, count: 0, ms: 5, test: false }, { id: 'osm', name: 'OpenStreetMap', ok: true, count: 2, ms: 3, test: false }], items, osmFallback: true, links: stayLinks(STAY_Q) };
  const c = loadTrip(() => reply);
  const t = pragueTrip();
  const i = items.findIndex((h) => h.name === 'Hotel Colle Acre');
  const pick = { dataset: { pick: String(i) } };
  c.__all['[data-pick]'] = [pick];
  c.S.trip = t;
  c.window.Trip.render();
  await tick();
  const html = sp(c.__els['#stayBody'].innerHTML);
  assert.match(html, /<b>TripAdvisor tu ceny nemá<\/b> – v místě jsou tato ubytování \(OpenStreetMap\)\. Cenu ověř u partnera a zadej ji níže\./);
  assert.doesNotMatch(html, /nemám přímé nabídky/);
  assert.doesNotMatch(html, /id="stayMin"/, 'bez hodnocení – filtr hodnocení není');
  const card = cardOf(html, 'Hotel Colle Acre');
  assert.match(card, /cenu ověř u partnera/);
  assert.match(card, /href="https:\/\/www\.booking\.com\/searchresults\.cs\.html\?ss=Hotel\+Colle\+Acre%2C\+Prague[^"]*"[^>]*>Booking\.com ↗/);
  assert.match(card, /href="https:\/\/collacre\.it"[^>]*>web ubytování ↗/);
  assert.match(card, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Hotel%20Colle%20Acre%2C%20Prague"[^>]*>mapa ↗/);
  // Vybrat: bez dotazu na volno (není to hotel z TripAdvisoru), vybere se bez ceny s odkazem na Booking
  await pick.onclick();
  assert.equal(c.__urls.filter((u) => u.startsWith('api/stays/check?')).length, 0);
  assert.deepEqual([t.stay.mode, t.stay.id, t.stay.provider, t.stay.totalCzk, /^https:\/\/www\.booking\.com\//.test(t.stay.url)], ['pick', 'osm:way/77', 'osm', 0, true]);
  // zpět v kroku: název předvyplněný, uložená cena přibude k vybranému ubytování (odkaz zůstane)
  t.step = 'stay';
  c.window.Trip.render();
  await tick();
  const step = sp(c.__els['#tripStep'].innerHTML);
  assert.match(step, /Cenu za <b>Hotel Colle Acre<\/b> ověř u partnera a zadej ji \(celkem za pobyt\):/);
  assert.match(step, /id="manName" placeholder="Název \(nepovinné\)" value="Hotel Colle Acre"/);
  c.$('#manName').value = 'Hotel Colle Acre';
  c.$('#manPrice').value = '4500';
  c.$('#manSave').onclick();
  assert.deepEqual([t.stay.mode, t.stay.id, t.stay.totalCzk, /^https:\/\/www\.booking\.com\//.test(t.stay.url)], ['pick', 'osm:way/77', 4500, true]);
  // jiný název = vlastní ubytování
  t.stay = { ...t.stay, totalCzk: 0 };
  t.step = 'stay';
  c.window.Trip.render();
  await tick();
  c.$('#manName').value = 'Penzion u kostela';
  c.$('#manPrice').value = '3900';
  c.$('#manSave').onclick();
  assert.deepEqual([t.stay.mode, t.stay.name, t.stay.totalCzk], ['manual', 'Penzion u kostela', 3900]);
});

// Malé místo bez hotelů na TripAdvisoru: ceny z nejbližších míst TripAdvisoru v okolí, ubytování v místě bez ceny
// z OpenStreetMap zvlášť. Pachino (PAC) v tabulkách nemá místo do 15 km – okolí Noto 22 km, Modica 24 km, dál nic do 35 km;
// PAL (Palazzolo Acreide, Noto 21 km, Modica 34 km) pro karty hotelů z okolí v průvodci (data v testu podaná přímo).
const PAL = { lat: 37.0617, lon: 14.9019 };
const PAC = { lat: 36.7167, lon: 15.0907 };
const taHotel = (key, name, lat, lon, place = 'Noto_Province_of_Syracuse_Sicily') => ({
  name, key, accommodation_type: 'Hotel', url: `https://www.tripadvisor.com/Hotel_Review-${key}-Reviews-${name.replace(/ /g, '_')}-${place}.html`,
  review_summary: { rating: 4.5, count: 320 }, price_ranges: { maximum: 220, minimum: 80 }, geo: { latitude: lat, longitude: lon }, image: null, merchandising_labels: [],
});
const LIST_NOTO = [
  taHotel('g652022-d101', 'Gagliardi Boutique Hotel', 36.8925, 15.0697), taHotel('g652022-d102', 'Masseria Della Volpe', 36.85, 15.05),
  taHotel('g652022-d103', 'Hotel Porta Reale', 36.8931, 15.071), taHotel('g652022-d104', 'Ortigia Resort', 37.07, 15.28), // 43 km – dál než 40 km
];
const LIST_MODICA = [taHotel('g616190-d201', 'Hotel Modica Palace', 36.77, 14.83, 'Modica_Province_of_Ragusa_Sicily')];
const pacQuery = (extra = {}) => normalizeStayQuery({ city: 'Pachino', cityEn: 'Pachino', cc: 'IT', ...PAC, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 1, ...extra });
const nearStub = (lists) => stubFetch((url) => {
  if (url.startsWith('https://query.wikidata.org/')) return { body: { results: { bindings: [] } } }; // TripAdvisor ID v okolí nemá
  if (url.includes('/api/list?')) return { body: { error: null, result: { list: lists[new URL(url).searchParams.get('location_key')] || [] } } };
  if (url.includes('/api/rates?')) return { body: ratesFor(new URL(url).searchParams.get('hotel_key')) };
  return { status: 404, body: '{}' };
});
const listKeys = (stub) => stub.calls.filter((c) => c.url.includes('/api/list?')).map((c) => new URL(c.url).searchParams.get('location_key')).sort();

test('místa TripAdvisoru v okolí: nejbližší z tabulek do 35 km, nejvýš 2; název místa z adresy hotelu', () => {
  assert.deepEqual([NEARBY_KM, NEARBY_RADIUS_KM, NEARBY_MAX], [35, 40, 2]);
  const pac = nearbyPlaces(PAC.lat, PAC.lon);
  assert.deepEqual(pac.map((p) => [p.key, p.name, p.en, Math.round(p.km)]), [['g652022', 'Noto', 'Noto', 22], ['g616190', 'Modica', 'Modica', 24]]);
  // dál nic do 35 km (Syrakusy 43 km)
  assert.deepEqual(nearbyPlaces(PAC.lat, PAC.lon, { max: 9 }).map((p) => p.key), ['g652022', 'g616190']);
  assert.deepEqual(nearbyPlaces(39.5527, -8.9779).map((p) => [p.name, Math.round(p.km)]), [['Alcobaca', 1], ['Batalha', 18]], 'Alcobaça (od 10/2026 v tabulce i místo samo)');
  assert.ok(nearbyPlaces(39.5527, -8.9779, { max: 9 }).every((p, i, a) => p.km <= NEARBY_KM && (!i || a[i - 1].km <= p.km)), 'nejbližší první');
  assert.deepEqual(nearbyPlaces(40, -40), [], 'uprostřed Atlantiku nic');
  // velké město z tabulky česky, odkazy na hotel anglicky (z adresy hotelů)
  assert.deepEqual(nearbyPlaces(50.0875, 14.4214, { max: 1 }).map((p) => [p.name, p.en]), [['Praha', 'Prague']]);
  assert.deepEqual(['Noto Province of Syracuse Sicily', 'Santa Cruz de Tenerife Tenerife', 'Grasmere Lake District Cumbria E', 'Khon Kaen Khon Kaen Province', 'Donostia San Sebastian Province', 'Berlin'].map(placeLabel),
    ['Noto', 'Santa Cruz de Tenerife', 'Grasmere', 'Khon Kaen', 'Donostia San Sebastian', 'Berlin']);
});

test('malé místo bez hotelů na TripAdvisoru: hotely s cenou z míst v okolí (Noto, Modica) – vzdálenost od místa pobytu, odkazy hledají hotel v jeho místě', async () => {
  const stub = nearStub({ g652022: LIST_NOTO, g616190: LIST_MODICA });
  try {
    const q = pacQuery();
    assert.equal(seedCity(q.lat, q.lon), null, 'v místě TripAdvisor nic nemá');
    const items = await searchXotelo(q, { sparql: async () => [] });
    assert.deepEqual(listKeys(stub), ['g616190', 'g652022']);
    assert.deepEqual(items.nearbyFrom, [{ name: 'Noto', km: 22 }, { name: 'Modica', km: 24 }]);
    assert.equal(items.length, 4, 'hotel 42 km daleko se zahodí');
    assert.ok(!items.some((h) => /Ortigia/.test(h.name)) && !items.guesses.some((h) => /Ortigia/.test(h.name)));
    const g = items.find((h) => h.name === 'Gagliardi Boutique Hotel');
    assert.deepEqual(g.nearby, { place: 'Noto', km: 22, city: 'Noto' });
    assert.equal(g.distanceKm, Math.round(haversineKm(PAC.lat, PAC.lon, 36.8925, 15.0697) * 10) / 10);
    assert.ok(g.distanceKm > 15 && g.priceTotalCzk > 0 && g.rates.length === 3);
    assert.equal(new URL(g.rates.find((r) => r.site === 'booking').url).searchParams.get('ss'), 'Gagliardi Boutique Hotel, Noto');
    assert.deepEqual(items.find((h) => h.name === 'Hotel Modica Palace').nearby, { place: 'Modica', km: 24, city: 'Modica' });
    // nic v okolí → [] bez dotazu na seznam hotelů
    stub.calls.length = 0;
    assert.deepEqual(await searchXotelo(pacQuery({ city: 'Nikde', cityEn: 'Nowhere', cc: '', lat: 40, lon: -40 }), { sparql: async () => [] }), []);
    assert.equal(listKeys(stub).length, 0);
  } finally {
    stub.restore();
  }
  // místo s vlastními hotely: z okolí nic
  cache.map.clear();
  const own = stubFetch((url) => (url.includes('/api/list?') ? { body: { result: { list: LIST_PRAGUE } } } : { body: ratesFor(new URL(url).searchParams.get('hotel_key')) }));
  try {
    const praha = await searchXotelo(query(), { sparql: async () => [] });
    assert.ok(praha.length > 0 && praha.nearbyFrom === undefined && praha.every((h) => !h.nearby));
  } finally {
    own.restore();
  }
});

test('ceny z okolí i z místa z Wikidat, jehož hotely jsou dál než 15 km (střed = medián hotelů, název z adresy); výpadek seznamu → chyba jen bez hotelů', async () => {
  const cb = [taHotel('g900020-d301', 'Hotel Canicattini', PAC.lat - 0.16, PAC.lon, 'Canicattini_Bagni_Province_of_Syracuse_Sicily'), taHotel('g900020-d302', 'B&B Iblei', PAC.lat - 0.165, PAC.lon + 0.01, 'Canicattini_Bagni_Province_of_Syracuse_Sicily')];
  const stub = nearStub({ g900020: cb, g652022: LIST_NOTO, g616190: LIST_MODICA });
  try {
    const sparql = async (qq) => (qq.includes('wikibase:around') ? [row('Qc', { ta: '900020', pop: 7000, dist: 18 })] : []);
    const items = await searchXotelo(pacQuery(), { sparql });
    const km = Math.round(haversineKm(PAC.lat, PAC.lon, PAC.lat - 0.16, PAC.lon));
    assert.deepEqual(items.nearbyFrom, [{ name: 'Canicattini Bagni', km }, { name: 'Noto', km: 22 }], 'dvě nejbližší místa – Modica už ne');
    assert.deepEqual(listKeys(stub), ['g652022', 'g900020']);
    assert.equal(items.find((h) => h.name === 'Hotel Canicattini').nearby.place, 'Canicattini Bagni');
  } finally {
    stub.restore();
  }
  // výpadek Wikidat: aspoň ceny z okolí, v mezipaměti hledání jen na chvíli (retrySoon); bez nich chyba zdroje jako dřív
  cache.map.clear();
  const s2 = nearStub({ g652022: LIST_NOTO, g616190: LIST_MODICA });
  try {
    const wdDown = async (s, ms) => { throw new Error(`Timeout ${ms} ms: https://query.wikidata.org/sparql`); };
    const items = await searchXotelo(pacQuery(), { sparql: wdDown });
    assert.deepEqual([items.length, items.retrySoon, items.nearbyFrom.length], [4, true, 2]);
    await assert.rejects(searchXotelo(pacQuery({ lat: 40, lon: -40 }), { sparql: wdDown }), /Wikidata neodpověděla včas/);
  } finally {
    s2.restore();
  }
  cache.map.clear();
  const down = stubFetch((url) => (url.includes('/api/list?') ? { status: 503, body: 'x' } : { status: 404, body: '{}' }));
  try {
    await assert.rejects(nearbyPool(PAC, []), /výpadek/);
  } finally {
    down.restore();
  }
  // jedno místo s hotely stačí, chyba druhého nevadí
  assert.equal((await nearbyPool(PAC, [], { list: async (k) => { if (k === 'g616190') throw new Error('x'); return LIST_NOTO; } })).pool.length, 3);
  assert.equal(await nearbyPool({ lat: 40, lon: -40 }, []), null);
});

test('malé místo, které Wikidata dohledávají dlouho: seznamy míst v okolí dopředu, déle než strop se nečeká – ceny z okolí hned (neúplné), pak hotely místa samého', async () => {
  assert.deepEqual([SPEC_MS, KEYS_CAP_MS], [1500, 8000]);
  const own = [taHotel('g900031-d401', 'Hotel Akrai', PAC.lat + 0.004, PAC.lon + 0.002, 'Pachino_Province_of_Syracuse_Sicily')];
  // místo samo TripAdvisor ID má (podle názvu), Wikidata ale odpoví až po 150 ms
  const nameRow = { item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q490' }, ta: lit('900031'), c: lit(`Point(${PAC.lon} ${PAC.lat})`), pop: lit(8700) };
  const slowWd = (qq) => new Promise((r) => setTimeout(() => r(qq.includes('rdfs:label') ? [nameRow] : []), 150));
  const nearKeys = (stub) => listKeys(stub).filter((k) => k !== 'g900031');
  const stub = nearStub({ g652022: LIST_NOTO, g616190: LIST_MODICA, g900031: own });
  try {
    let hinted = 0;
    const first = await searchXotelo(pacQuery(), { sparql: slowWd, specMs: 10, capMs: 60, onNearby: () => { hinted++; } });
    assert.deepEqual(first.nearbyFrom, [{ name: 'Noto', km: 22 }, { name: 'Modica', km: 24 }]);
    assert.equal(first.partial, true, 'místo se ještě dohledává – průvodce se doptá');
    assert.equal(hinted, 1, 'searchStays rozběhne ubytování z OpenStreetMap hned');
    assert.deepEqual(nearKeys(stub), ['g616190', 'g652022'], 'seznam každého místa v okolí jednou (dopředu, pro ceny z mezipaměti)');
    await new Promise((r) => setTimeout(r, 200)); // dohledání místa doběhne do mezipaměti
    const next = await searchXotelo(pacQuery(), { sparql: slowWd, specMs: 10, capMs: 60, onNearby: () => { hinted++; } });
    assert.deepEqual([next.map((h) => h.name), next.nearbyFrom, next.partial, hinted], [['Hotel Akrai'], undefined, undefined, 1]);
  } finally {
    stub.restore();
  }
  // místo dohledané hned: seznamy míst v okolí se nenačítají, strop neplatí, výsledek z hotelů místa jako dřív
  cache.map.clear();
  const s2 = nearStub({ g652022: LIST_NOTO, g616190: LIST_MODICA, g900031: own });
  try {
    let hinted = 0;
    const items = await searchXotelo(pacQuery(), { sparql: async (qq) => (qq.includes('rdfs:label') ? [nameRow] : []), specMs: 20, capMs: 40, onNearby: () => { hinted++; } });
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual([items.map((h) => h.name), items.partial, hinted, listKeys(s2)], [['Hotel Akrai'], undefined, 0, ['g900031']]);
  } finally {
    s2.restore();
  }
  // místa v okolí bez hotelů a místo se ještě dohledává → prázdné neúplné (průvodce se doptá), ne „nic“
  cache.map.clear();
  const s3 = nearStub({});
  try {
    const items = await searchXotelo(pacQuery(), { sparql: slowWd, specMs: 10, capMs: 30 });
    assert.deepEqual([items.length, items.partial], [0, true]);
  } finally {
    await new Promise((r) => setTimeout(r, 350)); // dohledání doběhne (seznam místa ještě ze stubu, ne ze sítě)
    s3.restore();
  }
});

test('searchStays: ceny z okolí → ubytování z OpenStreetMap se hledá hned, souběžně s cenami (ne až po nich); místo s hotely ho nehledá', async () => {
  let done = 0;
  const seen = [];
  const lists = { g652022: LIST_NOTO, g616190: LIST_MODICA, g274707: LIST_PRAGUE };
  const stub = stubFetch(async (url) => {
    if (url.startsWith('https://query.wikidata.org/')) return { body: { results: { bindings: [] } } };
    if (url.includes('/api/list?')) return { body: { error: null, result: { list: lists[new URL(url).searchParams.get('location_key')] || [] } } };
    if (url.includes('/api/rates?')) {
      await new Promise((r) => setTimeout(r, 40));
      done++;
      return { body: ratesFor(new URL(url).searchParams.get('hotel_key')) };
    }
    return { status: 404, body: '{}' };
  });
  const lodging = async (q) => { seen.push([q.city, done]); return [mapOsm({ category: 'tourism', type: 'hotel', name: 'Hotel Colle Acre', osm_type: 'way', osm_id: 77, lat: String(PAC.lat + 0.002), lon: String(PAC.lon + 0.003), extratags: {} }, q, PAC)]; };
  try {
    await withConfig({ mock: false, liteapiKey: '', xotelo: true }, async () => {
      const r = await searchStays({ city: 'Pachino', cityEn: 'Pachino', cc: 'IT', ...PAC, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 1 }, { lodging });
      assert.deepEqual([r.osmFallback, r.nearbyFrom.length, r.items.filter((h) => h.provider === 'osm').length], [true, 2, 1]);
      assert.deepEqual(seen, [['Pachino', 0]], 'OpenStreetMap jednou, ještě než přišla první cena');
      assert.ok(done >= 4);
      seen.length = 0;
      const praha = await searchStays({ city: 'Praha', cityEn: 'Prague', cc: 'CZ', ...PRAGUE, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2 }, { lodging });
      assert.ok(praha.items.length > 0 && !praha.osmFallback);
      assert.deepEqual(seen, [], 'místo s hotely z TripAdvisoru OpenStreetMap nepotřebuje');
    });
  } finally {
    stub.restore();
  }
});

test('searchStays: ceny z okolí a ubytování v místě z OpenStreetMap spolu (nearbyFrom, osmFallback); ověření volna hotelu z okolí hledá v jeho místě', async () => {
  const stub = nearStub({ g652022: LIST_NOTO, g616190: LIST_MODICA });
  const lodging = async (q) => [mapOsm({ category: 'tourism', type: 'hotel', name: 'Hotel Colle Acre', osm_type: 'way', osm_id: 77, lat: String(PAC.lat + 0.002), lon: String(PAC.lon + 0.003), extratags: { stars: '4' } }, q, PAC)];
  try {
    await withConfig({ mock: false, liteapiKey: '', xotelo: true }, async () => {
      const raw = { city: 'Pachino', cityEn: 'Pachino', cc: 'IT', ...PAC, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 1 };
      const r = await searchStays(raw, { lodging });
      assert.equal(r.osmFallback, true);
      assert.deepEqual(r.nearbyFrom, [{ name: 'Noto', km: 22 }, { name: 'Modica', km: 24 }]);
      assert.deepEqual(r.providers.map((p) => [p.id, p.ok]), [['xotelo', true], ['osm', true]]);
      assert.ok(r.items.filter((h) => h.provider === 'xotelo').every((h) => h.nearby));
      assert.deepEqual(r.items.filter((h) => h.provider === 'osm').map((h) => [h.name, h.nearby]), [['Hotel Colle Acre', undefined]]);
      // „Vybrat“: volno se ověří stejně jako u hotelu v místě, odkazy na weby hledají hotel v Notu
      const got = await checkStay({ ...raw, hotel: 'g652022-d101', name: 'Gagliardi Boutique Hotel', near: 'Noto' }, { check: async (k, n, qq) => ({ available: true, city: qq.cityEn }) });
      assert.deepEqual([got.hotel, got.available, got.city], ['g652022-d101', true, 'Noto']);
      const own = await checkStay({ ...raw, hotel: 'g652022-d101', name: 'X' }, { check: async (k, n, qq) => ({ available: true, city: qq.cityEn }) });
      assert.equal(own.city, 'Pachino');
    });
  } finally {
    stub.restore();
  }
});

test('karta hotelu z okolí: „v okolí: Noto · 24 km od Palazzolo Acreide“, poznámka nahoře, ubytování v místě bez ceny zvlášť pod hotely (filtr ceny ho neschová); Vybrat ověří volno v Notu', async () => {
  const Q = { ...STAY_Q, city: 'Palazzolo Acreide', cityEn: 'Palazzolo Acreide', cc: 'IT', country: 'Itálie' };
  const tag = (h, place, km) => Object.assign(mapHotel(h, ratesFor(h.key).result, { ...Q, cityEn: place }, PAL), { nearby: { place, km, city: place } });
  const osmRows = ['Hotel Colle Acre', 'Agriturismo Bosco', 'Domus Hyblaea', 'Casa Akrai'].map((name, k) => ({ category: 'tourism', type: k ? 'guest_house' : 'hotel', name, osm_type: 'node', osm_id: 80 + k, lat: String(PAL.lat + 0.002 * k), lon: String(PAL.lon + 0.003), extratags: {} }));
  const items = rankStays([tag(LIST_NOTO[0], 'Noto', 21), tag(LIST_NOTO[1], 'Noto', 21), tag(LIST_MODICA[0], 'Modica', 34), ...rankOsm(osmRows.map((r) => mapOsm(r, Q, PAL)))]);
  const reply = {
    query: Q, providers: [{ id: 'xotelo', name: 'TripAdvisor (Xotelo)', ok: true, count: 3, ms: 5, test: false }, { id: 'osm', name: 'OpenStreetMap', ok: true, count: 4, ms: 3, test: false }],
    items, osmFallback: true, nearbyFrom: [{ name: 'Noto', km: 21 }, { name: 'Modica', km: 34 }], links: stayLinks(Q),
  };
  const c = loadTrip(() => reply);
  const base = c.fetch;
  c.fetch = async (u) => (String(u).startsWith('api/stays/check?') ? (c.__urls.push(String(u)), { ok: true, status: 200, json: async () => ({ available: null }) }) : base(u));
  const t = { ...pragueTrip(), dest: { label: 'Palazzolo Acreide', country: 'Itálie', cc: 'IT', ...PAL } };
  const gi = items.findIndex((h) => h.name === 'Gagliardi Boutique Hotel');
  const pick = { dataset: { pick: String(gi) } };
  c.__all['[data-pick]'] = [pick];
  c.S.trip = t;
  c.window.Trip.render();
  await tick();
  let html = sp(c.__els['#stayBody'].innerHTML);
  assert.match(html, /<b>Palazzolo Acreide TripAdvisor nemá<\/b> – ceny jsou z okolí \(Noto ~21 km, Modica ~34 km\)\. V místě jsou i ubytování bez ceny \(OpenStreetMap\) níže\./);
  const card = cardOf(html, 'Gagliardi Boutique Hotel');
  assert.match(card, /<div class="st-near">📍 v okolí: <b>Noto<\/b> · 24 km od Palazzolo Acreide<\/div>/);
  assert.doesNotMatch(card, /km od centra/);
  assert.match(card, /class="ota best"/, 'ceny u webů jako u hotelu v místě');
  assert.match(html, /id="stayMin"/, 'filtr hodnocení pro hotely s cenou');
  assert.match(html, /3 z 3 nabídek · 4 v místě bez ceny/);
  // hotely s cenou napřed, pod nimi ubytování v místě (první 3, zbytek na požádání)
  const [top, town] = html.split('<div class="st-town">');
  assert.ok(top.includes('Gagliardi Boutique Hotel') && !top.includes('Hotel Colle Acre'));
  assert.match(town, /<h4>🏡 V místě – Palazzolo Acreide \(bez ceny\)<\/h4>/);
  assert.match(town, /cenu ověř u partnera/);
  assert.match(town, /id="stayTownN">▼ Další v místě \(1\)/);
  // filtr ceny schová hotely s cenou nad limit, ubytování v místě (bez ceny) zůstane
  c.$('#stayMax').onchange({ target: { value: '100' } });
  html = sp(c.__els['#stayBody'].innerHTML);
  assert.match(html, /Filtrům nic neodpovídá/);
  assert.match(html.split('<div class="st-town">')[1], /Hotel Colle Acre/);
  c.$('#stayMax').onchange({ target: { value: '' } });
  // Vybrat: ověření volna s místem hotelu (odkazy hledají v Notu), výběr si místo pamatuje
  await pick.onclick();
  const cu = c.__urls.filter((u) => u.startsWith('api/stays/check?'));
  assert.equal(cu.length, 1);
  const p = new URLSearchParams(cu[0].slice(16));
  assert.deepEqual([p.get('hotel'), p.get('near'), p.get('city')], ['g652022-d101', 'Noto', 'Palazzolo Acreide']);
  assert.deepEqual([t.stay.mode, t.stay.name, t.stay.near, t.stay.totalCzk > 0], ['pick', 'Gagliardi Boutique Hotel', 'Noto', true]);
});
