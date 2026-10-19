import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewbox, mapOsm, rankOsm, osmLodging, MAX_KM, OSM_MAX, PHRASES } from '../server/providers/stays/osm.js';
import { searchStays } from '../server/lib/stays.js';
import { config } from '../server/config.js';
import { stubFetch, ymdPlus } from './helpers.js';

// Palazzolo Acreide (Sicílie): TripAdvisor tu nic nemá (Wikidata bez ID místa do 50 km) – ubytování z OpenStreetMap
const PAL = { lat: 37.0617, lon: 14.9019 };
const Q = { city: 'Palazzolo Acreide', cityEn: 'Palazzolo Acreide', cc: 'IT', checkin: '2026-11-04', checkout: '2026-11-07', nights: 3, adults: 1, rooms: 1, ...PAL };
const row = (type, name, dLat, dLon, extratags = {}, id = Math.floor(Math.random() * 1e9), osmType = 'node') => ({
  category: 'tourism', type, name, osm_type: osmType, osm_id: id, lat: String(PAL.lat + dLat), lon: String(PAL.lon + dLon), extratags,
});
// živě 10/2026 (Nominatim, viewbox ±5 km): 3 hotely s hvězdičkami a agroturistiky bez nich
const LIVE = [
  row('hotel', 'Hotel Feudo Bauly', 0.02, -0.03, { stars: '4', website: 'https://www.feudobauly.it' }, 11),
  row('hotel', 'Hotel Colle Acre', 0.001, 0.004, { stars: '4', website: 'https://collacre.it' }, 12),
  row('guest_house', 'Agriturismo Il Casale degli Angeli', -0.01, 0.02, {}, 13),
  row('guest_house', 'Agriturismo Giannavì', 0.003, -0.002, { website: 'javascript:alert(1)' }, 14, 'way'),
  row('hotel', 'Domus Hyblaea Resort', -0.004, 0.006, { stars: '5' }, 15),
];

test('OSM: viewbox ±5 km kolem místa (lon1,lat1,lon2,lat2), fráze hotel / guest house / hostel', () => {
  const [lon1, lat1, lon2, lat2] = viewbox(PAL.lat, PAL.lon).split(',').map(Number);
  assert.ok(lon1 < PAL.lon && lon2 > PAL.lon && lat1 > PAL.lat && lat2 < PAL.lat);
  assert.ok(Math.abs((lat1 - lat2) * 111.32 - 10) < 0.05, 'výška 10 km');
  assert.ok(Math.abs((lon2 - lon1) * 111.32 * Math.cos((PAL.lat * Math.PI) / 180) - 10) < 0.05, 'šířka 10 km');
  assert.deepEqual(PHRASES, ['hotel', 'guest house', 'hostel']);
});

test('OSM: řádek Nominatimu → ubytování bez ceny (typ, hvězdičky, web jen http/https, Booking s termínem, mapa); jiné řádky ne', () => {
  const h = mapOsm(LIVE[0], Q, PAL);
  assert.equal(h.id, 'osm:node/11');
  assert.deepEqual([h.provider, h.osm, h.name, h.type, h.typeLabel, h.stars, h.rating, h.priceTotalCzk], ['osm', true, 'Hotel Feudo Bauly', 'hotel', '4★ hotel', 4, null, null]);
  assert.equal(h.website, 'https://www.feudobauly.it');
  const bk = new URL(h.bookUrl);
  assert.equal(bk.hostname, 'www.booking.com');
  assert.deepEqual([bk.searchParams.get('ss'), bk.searchParams.get('checkin'), bk.searchParams.get('checkout'), bk.searchParams.get('group_adults')], ['Hotel Feudo Bauly, Palazzolo Acreide', '2026-11-04', '2026-11-07', '1']);
  assert.match(h.mapUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Hotel%20Feudo%20Bauly%2C%20Palazzolo%20Acreide$/);
  assert.ok(h.distanceKm > 3 && h.distanceKm < 4, `${h.distanceKm} km`);
  const g = mapOsm(LIVE[3], Q, PAL);
  assert.deepEqual([g.id, g.type, g.typeLabel, g.stars, g.website], ['osm:way/14', 'penzion', 'penzion · agroturistika', null, null], 'javascript: web ne');
  assert.equal(mapOsm({ ...LIVE[0], category: 'amenity', type: 'restaurant' }, Q, PAL), null);
  assert.equal(mapOsm({ ...LIVE[0], name: '  ' }, Q, PAL), null);
  assert.equal(mapOsm({ ...LIVE[0], lat: 'x' }, Q, PAL), null);
  assert.equal(mapOsm({ ...LIVE[0], osm_type: 'x' }, Q, PAL), null);
  assert.equal(mapOsm({ ...LIVE[0], extratags: { stars: '7' } }, Q, PAL).stars, null, 'nesmyslné hvězdičky');
});

test('OSM: pořadí – hotely s hvězdičkami napřed (víc výš), pak podle vzdálenosti; daleko a opakované pryč; nejvýš 12', () => {
  const items = LIVE.map((r) => mapOsm(r, Q, PAL));
  const far = mapOsm(row('hotel', 'Hotel Daleko', 0.08, 0, { stars: '5' }, 21), Q, PAL);
  const dup = mapOsm(row('hotel', 'Hotel Colle Acre', 0.001, 0.004, { stars: '4' }, 22, 'way'), Q, PAL);
  const r = rankOsm([...items, far, dup]);
  assert.ok(far.distanceKm > MAX_KM);
  assert.deepEqual(r.map((h) => h.name), ['Domus Hyblaea Resort', 'Hotel Colle Acre', 'Hotel Feudo Bauly', 'Agriturismo Giannavì', 'Agriturismo Il Casale degli Angeli']);
  const many = Array.from({ length: 20 }, (_, k) => mapOsm(row('guest_house', `Casa ${k}`, 0.001 * k, 0, {}, 100 + k), Q, PAL));
  assert.equal(rankOsm(many).length, OSM_MAX);
});

test('OSM: osmLodging – výsledek týden v mezipaměti, výpadek 10 min (česká chyba, bez dalšího dotazu); bez polohy nic', async () => {
  let n = 0;
  // vlastní klíč mezipaměti (poloha na 3 desetinná místa), ubytování pořád do 6 km
  const q = { ...Q, lat: 37.0628, lon: 14.9019 };
  const fetchRows = async () => { n++; return LIVE; };
  const a = await osmLodging(q, { fetchRows });
  const b = await osmLodging(q, { fetchRows });
  assert.equal(n, 1);
  assert.equal(a.length, 5);
  assert.deepEqual(b.map((h) => h.id), a.map((h) => h.id));
  const bad = { ...Q, lat: 37.0638, lon: 14.9019 };
  let m = 0;
  const failing = async () => { m++; throw new Error('Timeout 10000 ms: https://nominatim.openstreetmap.org/search'); };
  await assert.rejects(osmLodging(bad, { fetchRows: failing }), /^Error: ubytování z OpenStreetMap se nepodařilo načíst – Nominatim neodpověděl včas$/);
  await assert.rejects(osmLodging(bad, { fetchRows: failing }), /Nominatim neodpověděl včas/);
  assert.equal(m, 1, 'výpadek se 10 min znovu nezkouší');
  assert.deepEqual(await osmLodging({ ...Q, lat: null, lon: null }, { fetchRows }), []);
});

test('OSM: dotaz na Nominatim – vlastní User-Agent, viewbox, bounded, extratags; fráze po sobě', async () => {
  const stub = stubFetch((url) => ({ body: url.includes('q=hotel') ? [LIVE[1]] : url.includes('q=guest+house') ? [LIVE[2]] : [] }));
  const prev = config.mock;
  config.mock = false;
  try {
    const r = await osmLodging({ ...Q, lat: 37.0648, lon: 14.9019 });
    assert.deepEqual(r.map((h) => h.name), ['Hotel Colle Acre', 'Agriturismo Il Casale degli Angeli']);
    assert.equal(stub.calls.length, 3);
    const u = new URL(stub.calls[0].url);
    assert.equal(u.origin + u.pathname, 'https://nominatim.openstreetmap.org/search');
    assert.deepEqual([u.searchParams.get('q'), u.searchParams.get('bounded'), u.searchParams.get('extratags'), u.searchParams.get('format'), u.searchParams.get('viewbox')], ['hotel', '1', '1', 'jsonv2', viewbox(37.0648, 14.9019)]);
    assert.deepEqual(stub.calls.map((c) => new URL(c.url).searchParams.get('q')), PHRASES);
    assert.match(stub.calls[0].init.headers['User-Agent'], /^ATLAS-travel\//);
  } finally {
    config.mock = prev;
    stub.restore();
  }
});

test('searchStays: malé místo bez hotelů z TripAdvisoru → ubytování v místě z OpenStreetMap (osmFallback); jinde ne', async () => {
  const prev = config.mock;
  config.mock = true;
  try {
    const raw = { city: 'Palazzolo Acreide', cc: 'IT', ...PAL, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 1 };
    const r = await searchStays(raw);
    assert.equal(r.osmFallback, true);
    assert.ok(r.items.length >= 3 && r.items.every((h) => h.provider === 'osm' && h.priceTotalCzk == null));
    assert.deepEqual(r.providers.map((p) => [p.id, p.ok, p.count]), [['demo', true, 0], ['osm', true, r.items.length]]);
    assert.equal(r.providers[1].test, true, 'v DEMO vymyšlená ubytování');
    assert.ok(r.links.length > 0, 'odkazy na partnery zůstávají');
    // místo s hotely: bez zálohy
    const praha = await searchStays({ city: 'Praha', cc: 'CZ', lat: 50.0875, lon: 14.4214, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2 });
    assert.equal(praha.osmFallback, undefined);
    assert.ok(praha.items.every((h) => h.provider === 'demo'));
    // záloha selže → zdroj s chybou (Zkusit znovu), nic nespadne; prázdná záloha → nic navíc
    const fail = await searchStays({ ...raw, checkout: ymdPlus(34) }, { lodging: async () => { throw new Error('ubytování z OpenStreetMap se nepodařilo načíst – Nominatim teď není dostupný'); } });
    assert.deepEqual([fail.items.length, fail.providers.at(-1).id, fail.providers.at(-1).ok], [0, 'osm', false]);
    const none = await searchStays({ ...raw, checkout: ymdPlus(35) }, { lodging: async () => [] });
    assert.deepEqual([none.items.length, none.providers.map((p) => p.id), none.osmFallback], [0, ['demo'], undefined]);
  } finally {
    config.mock = prev;
  }
});

test('searchStays: záloha z OpenStreetMap ne u LiteAPI a ne bez poskytovatele cen', async () => {
  const prev = { mock: config.mock, liteapiKey: config.liteapiKey, xotelo: config.xotelo };
  const calls = [];
  const lodging = async (q) => { calls.push(q.city); return [mapOsm(LIVE[0], q, PAL)]; };
  const stub = stubFetch(() => ({ status: 401, body: '{"error":"bad key"}' }));
  try {
    Object.assign(config, { mock: false, liteapiKey: 'prod_test' });
    const r = await searchStays({ city: 'Palazzolo Acreide', cc: 'IT', ...PAL, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 1, cityEn: 'Palazzolo Acreide' }, { lodging });
    assert.deepEqual([r.providers[0].id, r.items.length, calls.length], ['liteapi', 0, 0]);
    Object.assign(config, { liteapiKey: '', xotelo: false });
    const links = await searchStays({ city: 'Palazzolo Acreide', cc: 'IT', ...PAL, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 1, cityEn: 'Palazzolo Acreide' }, { lodging });
    assert.deepEqual([links.providers.length, calls.length], [0, 0], 'bez poskytovatele cen jen odkazy');
  } finally {
    Object.assign(config, prev);
    stub.restore();
  }
});
