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

test('přesná data: Ryanair dostane přesné okno návratu, výsledky jen v zadané dny', async () => {
  const out = ymdPlus(20);
  const back = ymdPlus(24);
  const stub = stubFetch((url) => {
    if (url.includes('/views/locate/5/airports/en/active')) return { body: [{ code: 'VIE' }, { code: 'STN' }, { code: 'BGY' }] };
    if (url.includes('open.er-api.com')) return { body: { result: 'success', rates: { EUR: 1, CZK: 25 }, time_last_update_utc: 'test' } };
    if (url.includes('roundTripFares')) {
      // STN přesně v zadané dny, BGY levněji, ale s návratem o den později → nesmí projít.
      return { body: { fares: [fare('VIE', 'STN', out, 30, { date: back, value: 30 }), fare('VIE', 'BGY', out, 10, { date: ymdPlus(25), value: 10 })] } };
    }
    if (url.includes('cheapestPerDay')) return { body: { outbound: { fares: [] } } };
    return { status: 404, body: '{}' };
  });
  try {
    const r = await search({ from: ['ap:VIE'], radiusKm: 0, trip: 'return', exactOut: out, exactBack: back, adults: 1, kmRate: 0 });
    const call = new URL(stub.calls.find((c) => c.url.includes('roundTripFares')).url);
    assert.deepEqual(
      ['outboundDepartureDateFrom', 'outboundDepartureDateTo', 'inboundDepartureDateFrom', 'inboundDepartureDateTo'].map((k) => call.searchParams.get(k)),
      [out, out, back, back],
    );
    const trips = r.groups.map((g) => g.best);
    assert.ok(trips.some((t) => t.out.to === 'STN'));
    for (const t of trips) assert.deepEqual([t.out.date, t.back.date], [out, back]);
    assert.ok(!trips.some((t) => t.out.to === 'BGY' && t.back.date !== back));
  } finally {
    stub.restore();
  }
});

test('za teplem: nejlevnější termín Ryanairu v chladném měsíci → dohledá se po dnech termín v teplém', async () => {
  const { monthClimate } = await import('../server/lib/climate.js');
  // dva dny ~ 2 měsíce od sebe a cíl, kde je v jednom z těch měsíců znatelně tepleji
  const days = [ymdPlus(15), ymdPlus(75)];
  const pick = ['HRG', 'AYT', 'LCA', 'AGP', 'DXB'].map((iata) => {
    const hi = days.map((d) => monthClimate(iata, d).hi);
    return { iata, hi, minTemp: Math.min(35, Math.max(...hi)) };
  }).find((x) => x.minTemp >= 15 && Math.min(...x.hi) < x.minTemp);
  const warmDay = days[pick.hi[0] >= pick.minTemp ? 0 : 1];
  const coldDay = days[pick.hi[0] >= pick.minTemp ? 1 : 0];
  const dayFare = (d, value) => ({ day: d, departureDate: `${d}T07:00:00`, arrivalDate: `${d}T11:00:00`, price: { value, currencyCode: 'EUR' }, soldOut: false, unavailable: false });
  const stub = stubFetch((url) => {
    if (url.includes('/views/locate/5/airports/en/active')) return { body: [{ code: 'VIE' }, { code: pick.iata }] };
    if (url.includes('open.er-api.com')) return { body: { result: 'success', rates: { EUR: 1, CZK: 25 }, time_last_update_utc: 'test' } };
    if (url.includes('cheapestPerDay')) {
      const m = new URL(url).searchParams.get('outboundMonthOfDate').slice(0, 7);
      return { body: { outbound: { fares: [dayFare(warmDay, 40), dayFare(coldDay, 10)].filter((f) => f.day.startsWith(m)) } } };
    }
    // Fare Finder vrátí jen nejlevnější termín – v chladném měsíci
    if (url.includes('oneWayFares')) return { body: { fares: [fare('VIE', pick.iata, coldDay, 10)] } };
    return { status: 404, body: '{}' };
  });
  try {
    const r = await search({ from: ['ap:VIE'], radiusKm: 0, dateFrom: ymdPlus(10), dateTo: ymdPlus(80), trip: 'oneway', adults: 1, kmRate: 0, minTemp: pick.minTemp });
    const g = r.groups.find((x) => x.dest.airports.includes(pick.iata));
    assert.ok(g, `${pick.iata} v teplejším měsíci (${pick.hi}, ≥ ${pick.minTemp} °C)`);
    assert.ok(g.options.every((t) => t.out.date === warmDay && t.tempHi >= pick.minTemp));
  } finally {
    stub.restore();
  }
});
