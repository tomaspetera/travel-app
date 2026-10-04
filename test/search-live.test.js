// Orchestrace hledání nad adaptérem Ryanair (fetch nahrazen tvarem reálných odpovědí).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
process.env.RYANAIR_ENABLED = '1';
process.env.WIZZ_ENABLED = '0';
process.env.KIWI_ENABLED = '0';
process.env.TRAVELPAYOUTS_TOKEN = '';
const { search } = await import('../server/lib/search.js');

const ap = (iataCode, name) => ({ countryName: '', iataCode, name, seoName: name, city: { name, code: name, countryCode: '' } });
const fare = (from, to, date, value, back) => ({
  outbound: { departureAirport: ap(from, from), arrivalAirport: ap(to, to), departureDate: `${date}T07:00:00`, arrivalDate: `${date}T09:00:00`, price: { value, currencyCode: 'EUR' }, flightNumber: 'FR100', previousPrice: null },
  ...(back ? { inbound: { departureAirport: ap(to, to), arrivalAirport: ap(from, from), departureDate: `${back.date}T19:00:00`, arrivalDate: `${back.date}T21:00:00`, price: { value: back.value, currencyCode: 'EUR' }, flightNumber: 'FR101', previousPrice: null } } : {}),
});

test('kamkoliv z Brna + okolí: Ryanair dotazy na každé obsluhované letiště, výsledky seskupené podle města', async () => {
  const d1 = ymdPlus(12);
  const d2 = ymdPlus(16);
  const stub = stubFetch((url) => {
    if (url.includes('/views/locate/5/airports/en/active')) return { body: [{ code: 'VIE' }, { code: 'BTS' }, { code: 'BRQ' }, { code: 'STN' }, { code: 'BGY' }, { code: 'LTN' }] };
    if (url.includes('open.er-api.com')) return { body: { result: 'success', rates: { EUR: 1, CZK: 25 }, time_last_update_utc: 'test' } };
    if (url.includes('roundTripFares')) {
      const o = new URL(url).searchParams.get('departureAirportIataCode');
      if (o === 'VIE') return { body: { fares: [fare('VIE', 'STN', d1, 20, { date: d2, value: 20 }), fare('VIE', 'BGY', d1, 15, { date: d2, value: 15 })] } };
      if (o === 'BTS') return { body: { fares: [fare('BTS', 'LTN', d1, 10, { date: d2, value: 12 })] } };
      if (o === 'BRQ') return { body: { fares: [fare('BRQ', 'STN', d1, 30, { date: d2, value: 30 })] } };
    }
    return { status: 404, body: '{}' };
  });
  try {
    const r = await search({ from: ['ap:BRQ'], radiusKm: 150, dateFrom: ymdPlus(5), dateTo: ymdPlus(30), trip: 'return', nightsMin: 2, nightsMax: 7, adults: 1, kmRate: 1 });
    const queried = stub.calls.filter((c) => c.url.includes('roundTripFares')).map((c) => new URL(c.url).searchParams.get('departureAirportIataCode'));
    assert.deepEqual(queried.sort(), ['BRQ', 'BTS', 'VIE'], 'jen letiště, kam Ryanair létá');
    const lon = r.groups.find((g) => g.dest.key === 'LON');
    assert.ok(lon, 'STN i LTN jsou „Londýn“');
    assert.deepEqual(lon.dest.airports.sort(), ['LTN', 'STN']);
    // Levnější letenka z BTS (22 €) i se započtenou dopravou z Brna vyhraje nad BRQ (60 €)
    assert.equal(lon.best.out.from, 'BTS');
    assert.equal(lon.best.flightCzk, 22 * 25);
    assert.ok(lon.best.groundCzk > 0);
    assert.equal(r.groups.find((g) => g.dest.key === 'MIL').best.out.to, 'BGY');
    assert.equal(r.providers[0].state, 'done');
  } finally {
    stub.restore();
  }
});

test('chyba poskytovatele se propíše do stavu, hledání nespadne', async () => {
  const stub = stubFetch((url) => (url.includes('farfnd') ? { status: 500, body: 'boom' } : { status: 404, body: '{}' }));
  try {
    // VIE je v seznamu letišť Ryanair z předchozího testu (cache 24 h).
    const r = await search({ from: ['ap:VIE'], radiusKm: 0, dateFrom: ymdPlus(5), dateTo: ymdPlus(20), trip: 'oneway' });
    assert.equal(r.groups.length, 0);
    assert.equal(r.providers[0].state, 'error');
    assert.match(r.providers[0].error, /HTTP 500/);
  } finally {
    stub.restore();
  }
});
