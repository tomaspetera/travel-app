import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';
import { config } from '../server/config.js';
import { liteapi, cheapestRate, mapHotels } from '../server/providers/stays/liteapi.js';
import { normalizeStayQuery, searchStays } from '../server/lib/stays.js';

const HOTELS = [
  { id: 'lp1', name: 'Hotel Duomo', latitude: 45.465, longitude: 9.19, address: 'Piazza 1', main_photo: 'https://x/1.jpg', stars: 4, rating: 8.9, reviewCount: 2100 },
  { id: 'lp2', name: 'Ostello Navigli', latitude: 45.45, longitude: 9.17, address: 'Via 2', thumbnail: 'https://x/2t.jpg', stars: 2, rating: 7.8, reviewCount: 640 },
  { id: 'lp3', name: 'Bez ceny', latitude: 45.47, longitude: 9.2, stars: 3, rating: 9.1, reviewCount: 50 },
];
const RATES = {
  data: [
    { hotelId: 'lp1', roomTypes: [{ offerRetailRate: { amount: 420, currency: 'EUR' }, rates: [{ boardName: 'Breakfast Included', cancellationPolicies: { refundableTag: 'RFN' }, retailRate: { total: [{ amount: 420, currency: 'EUR' }] } }] }] },
    { hotelId: 'lp2', roomTypes: [{ rates: [{ boardName: 'Room Only', cancellationPolicies: { refundableTag: 'NRFN' }, retailRate: { total: [{ amount: 150, currency: 'EUR' }] } }] }, { rates: [{ retailRate: { total: [{ amount: 135, currency: 'EUR' }] } }] }] },
    { hotelId: 'lp3', roomTypes: [] },
  ],
  hotels: [{ id: 'lp2', review_count: 700 }],
};

test('LiteAPI: nejlevnější tarif z různých tvarů odpovědi', () => {
  assert.equal(cheapestRate(RATES.data[0]).amount, 420);
  assert.equal(cheapestRate(RATES.data[1]).amount, 135);
  assert.equal(cheapestRate(RATES.data[2]), null);
});

test('LiteAPI: hotely v cílovém městě s cenou za noc, hodnocením a odkazem', async () => {
  const prev = { key: config.liteapiKey, wl: config.liteapiWhitelabel };
  config.liteapiKey = 'sand_test';
  config.liteapiWhitelabel = '';
  const stub = stubFetch((url, init) => {
    if (url.startsWith('https://api.liteapi.travel/v3.0/data/hotels')) return { body: { data: HOTELS } };
    if (url === 'https://api.liteapi.travel/v3.0/hotels/rates') return { body: RATES };
    return { status: 404, body: '{}' };
  });
  try {
    const q = normalizeStayQuery({ city: 'Milán', iata: 'BGY', checkin: ymdPlus(20), checkout: ymdPlus(23), adults: 2 });
    assert.equal(q.cityEn, 'Milan');
    assert.equal(q.cc, 'IT');
    const items = await liteapi.search(q);
    const list = stub.calls.find((c) => c.url.includes('/data/hotels'));
    const lu = new URL(list.url);
    assert.equal(lu.searchParams.get('cityName'), 'Milan');
    assert.equal(lu.searchParams.get('countryCode'), 'IT');
    assert.equal(list.init.headers['X-API-Key'], 'sand_test');
    const rates = stub.calls.find((c) => c.url.endsWith('/hotels/rates'));
    const body = JSON.parse(rates.init.body);
    assert.deepEqual(body.hotelIds, ['lp1', 'lp2', 'lp3'], 'hodnocení × váha počtu recenzí');
    assert.equal(body.checkin, q.checkin);
    assert.deepEqual(body.occupancies, [{ adults: 2, children: [] }]);

    assert.equal(items.length, 2, 'hotel bez ceny vypadne');
    const duomo = items.find((h) => h.name === 'Hotel Duomo');
    assert.equal(duomo.rating, 8.9);
    assert.equal(duomo.reviews, 2100);
    assert.equal(duomo.breakfast, true);
    assert.equal(duomo.freeCancellation, true);
    assert.equal(duomo.pricePerNightCzk, Math.round(duomo.priceTotalCzk / 3));
    assert.ok(duomo.distanceKm < 1);
    assert.match(duomo.bookUrl, /^https:\/\/www\.booking\.com\/searchresults/);
    const ost = items.find((h) => h.name === 'Ostello Navigli');
    assert.equal(ost.reviews, 700, 'hodnocení z bloku hotels[] v odpovědi rates má přednost');
    assert.equal(ost.freeCancellation, false);
    assert.equal(ost.photo, 'https://x/2t.jpg');
  } finally {
    stub.restore();
    config.liteapiKey = prev.key;
    config.liteapiWhitelabel = prev.wl;
  }
});

test('LiteAPI: white-label odkaz na rezervaci a hodnocení 0–100 převedené na 0–10', () => {
  const prev = config.liteapiWhitelabel;
  config.liteapiWhitelabel = 'https://atlas.nuitee.link/';
  try {
    const q = { city: 'Milán', checkin: '2026-11-10', checkout: '2026-11-12', nights: 2, adults: 2, rooms: 1 };
    const [h] = mapHotels([{ id: 'x 1', name: 'A', rating: 86 }], [{ hotelId: 'x 1', roomTypes: [{ offerRetailRate: { amount: 100, currency: 'EUR' } }] }], q, null);
    assert.equal(h.rating, 8.6);
    const u = new URL(h.bookUrl);
    assert.equal(u.host, 'atlas.nuitee.link');
    assert.equal(u.pathname, '/hotels/x%201');
    assert.deepEqual(JSON.parse(Buffer.from(u.searchParams.get('occupancies'), 'base64').toString()), [{ adults: 2, children: [] }]);
  } finally {
    config.liteapiWhitelabel = prev;
  }
});

test('searchStays: chyba poskytovatele → hlášení + odkazy na partnery (nic nespadne)', async () => {
  const prev = config.liteapiKey;
  config.liteapiKey = 'sand_test';
  const stub = stubFetch(() => ({ status: 401, body: '{"error":"bad key"}' }));
  try {
    const r = await searchStays({ city: 'Milán', iata: 'MXP', checkin: ymdPlus(30), checkout: ymdPlus(32) });
    assert.equal(r.items.length, 0);
    assert.equal(r.providers[0].id, 'liteapi');
    assert.equal(r.providers[0].ok, false);
    assert.ok(r.links.some((l) => l.url.includes('booking.com')));
  } finally {
    stub.restore();
    config.liteapiKey = prev;
  }
});
