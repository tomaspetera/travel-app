import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';
import { config } from '../server/config.js';
import { liteapi, cheapestRate, mapHotels } from '../server/providers/stays/liteapi.js';
import { normalizeStayQuery, searchStays, hostelworldHas } from '../server/lib/stays.js';

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

test('ubytování na dalších místech trasy: země podle polohy, anglický název, hotely kolem bodu, když název města nesedí', async () => {
  // Místo trasy z Wikidat / přidané ručně: bez kódu země a anglického názvu (dřív „LiteAPI: chybí město nebo země“).
  const base = { city: 'Porto Novo', lat: 6.4969, lon: 2.6289, checkin: ymdPlus(40), checkout: ymdPlus(43), adults: 2 };
  const q = normalizeStayQuery(base);
  assert.deepEqual([q.cc, q.country, q.cityEn], ['BJ', 'Benin', 'Porto Novo']);
  assert.equal(normalizeStayQuery({ ...base, cc: 'ng' }).cc, 'NG', 'zadaný kód má přednost');
  assert.equal(normalizeStayQuery({ ...base, lat: '', lon: '' }).cc, '', 'bez polohy a letiště se nehádá');
  const prev = config.liteapiKey;
  config.liteapiKey = 'sand_test';
  const english = [];
  const stub = stubFetch((url) => {
    if (url.includes('/data/hotels') && url.includes('cityName=')) return { body: { data: [] } }; // „Porto-Novo“ podle názvu nenajde
    if (url.includes('/data/hotels') && url.includes('latitude=')) return { body: { data: HOTELS } };
    if (url.endsWith('/hotels/rates')) return { body: RATES };
    return { status: 404, body: '{}' };
  });
  try {
    const r = await searchStays(base, { english: async (...a) => { english.push(a); return 'Porto-Novo'; } });
    assert.deepEqual(english, [['Porto Novo', 6.4969, 2.6289, 'BJ', null]]);
    assert.equal(r.query.cityEn, 'Porto-Novo');
    const byName = new URL(stub.calls.find((c) => c.url.includes('cityName=')).url);
    assert.deepEqual([byName.searchParams.get('countryCode'), byName.searchParams.get('cityName')], ['BJ', 'Porto-Novo']);
    const near = new URL(stub.calls.find((c) => c.url.includes('latitude=')).url);
    assert.deepEqual(['countryCode', 'latitude', 'longitude', 'radius'].map((k) => near.searchParams.get(k)), ['BJ', '6.49690', '2.62890', '15000']);
    assert.equal(r.providers[0].ok, true, r.providers[0].error);
    assert.equal(r.items.length, 2);
    const hw = r.links.find((l) => l.id === 'hostelworld');
    assert.equal(hw.url, 'https://www.hostelworld.com/hostels/africa/benin/porto-novo/');
    assert.match(r.links[0].url, /ss=Porto-Novo%2C\+Benin/);
    // zadaný anglický název (z Wikidat) se nepřekládá
    english.length = 0;
    await searchStays({ ...base, cityEn: 'Porto-Novo', checkout: ymdPlus(44) }, { english: async () => { english.push(1); return 'x'; } });
    assert.equal(english.length, 0);
    // místo vybrané v hledání: ID GeoNames jde dál (anglický název podle něj), nesmyslné ID ne
    await searchStays({ ...base, gid: '2392087', checkout: ymdPlus(45) }, { english: async (...a) => { english.push(a); return null; } });
    await searchStays({ ...base, gid: '1;drop', checkout: ymdPlus(46) }, { english: async (...a) => { english.push(a); return null; } });
    assert.deepEqual(english.map((a) => a[4]), ['2392087', null]);
  } finally {
    stub.restore();
    config.liteapiKey = prev;
  }
});

test('Hostelworld: místo bez stránky města (404 – menší města) → stránka země; ověří se jednou (mezipaměť), chyba nechá město', async () => {
  const prev = config.liteapiKey;
  config.liteapiKey = '';
  const stub = stubFetch((url) => ({ status: url.includes('/sabbioneta/') ? 404 : url.includes('/verona/') ? 200 : 503, body: '' }));
  const hw = (r) => r.links.find((l) => l.id === 'hostelworld');
  const hwCalls = () => stub.calls.filter((c) => c.url.includes('hostelworld.com')).length;
  try {
    const base = { city: 'Sabbioneta', cityEn: 'Sabbioneta', cc: 'IT', lat: 44.999, lon: 10.489, checkin: ymdPlus(50), checkout: ymdPlus(52), adults: 2 };
    const r = await searchStays(base, { hostel: hostelworldHas });
    assert.deepEqual([hw(r).url, hw(r).prefill], ['https://www.hostelworld.com/hostels/europe/italy/', 'none']);
    assert.match(hw(r).note, /vyber místo a data/);
    assert.equal(stub.calls[0].init.method, 'HEAD');
    await searchStays({ ...base, checkout: ymdPlus(53) }, { hostel: hostelworldHas });
    assert.equal(hwCalls(), 1, 'druhé hledání z mezipaměti');
    const vr = await searchStays({ ...base, city: 'Verona', cityEn: 'Verona', lat: 45.438, lon: 10.992 }, { hostel: hostelworldHas });
    assert.deepEqual([hw(vr).url, hw(vr).prefill], ['https://www.hostelworld.com/hostels/europe/italy/verona/', 'city']);
    const down = await searchStays({ ...base, city: 'Mantova', cityEn: 'Mantua', lat: 45.156, lon: 10.791 }, { hostel: hostelworldHas });
    assert.equal(hw(down).url, 'https://www.hostelworld.com/hostels/europe/italy/mantua/', 'chyba (ne 404) → stránka města zůstane');
    // bez ověření (výchozí – DEMO, testy) se Hostelworldu nic neptá
    const n = stub.calls.length;
    await searchStays({ ...base, city: 'Pavia', cityEn: 'Pavia', checkout: ymdPlus(54) });
    assert.equal(stub.calls.length, n);
  } finally {
    stub.restore();
    config.liteapiKey = prev;
  }
});

test('englishName: podle ID GeoNames (místo z hledání) – „Benátky“ → „Venice“, jen když ID sedí k poloze', async () => {
  const { englishName } = await import('../server/lib/places.js');
  const stub = stubFetch((url) => {
    if (url.includes('/v1/get?id=3164603&language=en')) return { body: { id: 3164603, name: 'Venice', latitude: 45.43713, longitude: 12.33265, country_code: 'IT' } };
    return { body: { results: [] } };
  });
  try {
    assert.equal(await englishName('Benátky', 45.4408, 12.3155, 'IT', 3164603), 'Venice');
    assert.equal(await englishName('Praha', 50.08, 14.42, 'CZ', 3164603), null, 'ID jiného místa (sdílený odkaz) se nepoužije');
    assert.equal(stub.calls.filter((c) => c.url.includes('/v1/get')).length, 1, 'ID z mezipaměti');
  } finally {
    stub.restore();
  }
});

test('englishName: anglický název z geokódování jen v okolí místa a ve stejné zemi', async () => {
  const { englishName } = await import('../server/lib/places.js');
  const stub = stubFetch((url) => {
    assert.match(url, /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?name=Bolo%C5%88a&count=10&language=en/);
    return { body: { results: [{ name: 'Bologna', latitude: 44.4938, longitude: 11.3387, country_code: 'IT' }, { name: 'Bologna', latitude: -33.1, longitude: 26.3, country_code: 'ZA' }] } };
  });
  try {
    assert.equal(await englishName('Boloňa', 44.4949, 11.3426, 'IT'), 'Bologna');
    assert.equal(await englishName('Boloňa', 45.4642, 9.19, 'IT'), null, 'Milán je od Boloni moc daleko');
    assert.equal(await englishName('Boloňa', 44.4949, 11.3426, 'IT'), 'Bologna');
    assert.equal(stub.calls.length, 2, 'podruhé z mezipaměti');
  } finally {
    stub.restore();
  }
});
