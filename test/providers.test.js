import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { ONE_WAY, ROUND_TRIP, CHEAPEST_PER_DAY } from './fixtures/ryanair.js';
import { stubFetch, ymdPlus } from './helpers.js';
import { ryanair, parseOneWay, parseRoundTrip, parseCheapestPerDay, bookingUrl as frUrl, warmSession } from '../server/providers/ryanair.js';
import { wizzair, parseNetwork, parseTimetable, scrapeVersion, bookingUrl as w6Url } from '../server/providers/wizzair.js';
import { parsePricesForDates, bookingUrl as tpUrl } from '../server/providers/travelpayouts.js';
import { setRates, FALLBACK_EUR } from '../server/lib/fx.js';
import { flightMinutes } from '../server/lib/dates.js';

setRates({ base: 'EUR', rates: { ...FALLBACK_EUR, CZK: 25, MAD: 10 }, source: 'test', date: null });

test('Ryanair: oneWayFares → jednosměrné cesty v Kč, vyprodané se zahodí', () => {
  const trips = parseOneWay(ONE_WAY, 2);
  assert.equal(trips.length, 2);
  const [bgy, rak] = trips;
  assert.equal(bgy.out.from, 'VIE');
  assert.equal(bgy.out.to, 'BGY');
  assert.equal(bgy.out.flightNo, 'FR 1234');
  assert.equal(bgy.out.czk, Math.round(14.99 * 25));
  assert.equal(bgy.out.prevCzk, Math.round(24.99 * 25));
  assert.equal(bgy.out.hasTime, true);
  assert.equal(bgy.flightCzk, bgy.out.czk);
  // Itálie a Rakousko mají stejné časové pásmo → 1 h 25 min
  assert.equal(bgy.out.durationMin, 85);
  assert.match(bgy.out.bookUrl, /originIata=VIE&destinationIata=BGY/);
  assert.match(bgy.out.bookUrl, /adults=2/);
  // Cena v marockých dirhamech se přepočte přes kurz
  assert.equal(rak.out.currency, 'MAD');
  assert.equal(rak.out.czk, Math.round((399 / 10) * 25));
  // 10:15 Vídeň → 13:40 Marrákeš místního času. Posun Maroka se v datech časových pásem mění
  // (ramadán, nová pravidla v aktualizacích tzdata), proto se očekávání počítá z dat tohoto Node:
  // 3 h 25 min + rozdíl posunů Vídně a Casablanky.
  const off = (tz, utc) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(utc)).find((x) => x.type === 'timeZoneName').value;
    const m = name.match(/GMT(?:([+-])(\d{2}):(\d{2}))?/);
    return m[1] ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  };
  assert.equal(rak.out.durationMin, 205 + off('Europe/Vienna', '2026-11-12T09:15:00Z') - off('Africa/Casablanca', '2026-11-12T12:40:00Z'));
});

test('Délka letu počítá s časovými pásmy (Vídeň UTC+1 → Lisabon UTC+0)', () => {
  assert.equal(flightMinutes('2026-11-12T10:15:00', 'Europe/Vienna', '2026-11-12T12:50:00', 'Europe/Lisbon'), 215);
  assert.equal(flightMinutes('2026-07-12T10:15:00', 'Europe/Prague', '2026-07-12T16:05:00', 'Asia/Dubai'), 230); // CEST UTC+2 → Dubaj UTC+4
  assert.equal(flightMinutes('2026-07-12T10:15:00', 'Europe/Prague', null, 'Asia/Dubai'), null);
});

test('Ryanair: roundTripFares → cesta tam i zpět s rezervačním odkazem', () => {
  const [t] = parseRoundTrip(ROUND_TRIP, 1);
  assert.equal(t.out.to, 'BGY');
  assert.equal(t.back.to, 'VIE');
  assert.equal(t.nights, 4);
  assert.equal(t.flightCzk, Math.round(14.99 * 25) + Math.round(19.99 * 25));
  assert.match(t.bookUrl, /dateOut=2026-11-10&dateIn=2026-11-14/);
  assert.match(t.bookUrl, /isReturn=true/);
});

test('Ryanair: cheapestPerDay vynechá nedostupné a vyprodané dny', () => {
  const legs = parseCheapestPerDay(CHEAPEST_PER_DAY, 'VIE', 'BGY');
  assert.deepEqual(legs.map((l) => l.date), ['2026-11-01', '2026-11-03']);
  assert.equal(legs[1].czk, Math.round(9.99 * 25));
});

test('Ryanair: rezervační URL', () => {
  const u = new URL(frUrl({ from: 'VIE', to: 'BGY', dateOut: '2026-11-10', adults: 3 }));
  assert.equal(u.hostname, 'www.ryanair.com');
  assert.equal(u.searchParams.get('isReturn'), 'false');
  assert.equal(u.searchParams.get('adults'), '3');
});

test('Ryanair explore: správné parametry dotazu a rozdělení dlouhého intervalu', async () => {
  const from = ymdPlus(5);
  const to = ymdPlus(100);
  const stub = stubFetch(() => ({ body: ONE_WAY }));
  try {
    const trips = await ryanair.explore({ origin: 'VIE', dateFrom: from, dateTo: to, country: 'IT', adults: 1 });
    const fares = stub.calls.filter((c) => c.url.includes('/farfnd/'));
    assert.ok(fares.length >= 2, 'interval > 62 dní se dělí na víc dotazů');
    const u = new URL(fares[0].url);
    assert.equal(u.pathname, '/farfnd/v4/oneWayFares');
    assert.equal(u.searchParams.get('departureAirportIataCode'), 'VIE');
    assert.equal(u.searchParams.get('outboundDepartureDateFrom'), from);
    assert.equal(u.searchParams.get('arrivalCountryCode'), 'IT');
    assert.equal(u.searchParams.get('currency'), 'EUR');
    assert.ok(trips.length >= 2);
  } finally {
    stub.restore();
  }
});

test('Ryanair explore zpáteční: posílá okno návratu a délku pobytu', async () => {
  const from = ymdPlus(5);
  const to = ymdPlus(20);
  const stub = stubFetch(() => ({ body: ROUND_TRIP }));
  try {
    await ryanair.explore({ origin: 'BTS', dateFrom: from, dateTo: to, ret: { nightsMin: 2, nightsMax: 5 } });
    const u = new URL(stub.calls.find((c) => c.url.includes('/farfnd/')).url);
    assert.equal(u.pathname, '/farfnd/v4/roundTripFares');
    assert.equal(u.searchParams.get('durationFrom'), '2');
    assert.equal(u.searchParams.get('durationTo'), '5');
    assert.equal(u.searchParams.get('inboundDepartureDateFrom'), from);
  } finally {
    stub.restore();
  }
});

test('Ryanair: při chybě services-api zkusí záložní doménu www.ryanair.com', async () => {
  const stub = stubFetch((url) => (url.includes('services-api') ? { status: 503, body: 'down' } : { body: ONE_WAY }));
  try {
    const trips = await ryanair.explore({ origin: 'PRG', dateFrom: ymdPlus(3), dateTo: ymdPlus(10) });
    assert.ok(stub.calls.some((c) => c.url.startsWith('https://www.ryanair.com/api/farfnd/v4/oneWayFares')));
    assert.equal(trips.length, 2);
  } finally {
    stub.restore();
  }
});

test('Ryanair: „studený“ 403 → obnoví cookies z ryanair.com a dotaz zopakuje s nimi', async () => {
  let warmed = 0;
  const stub = stubFetch((url, init) => {
    if (url === 'https://www.ryanair.com/ie/en') {
      warmed++;
      return { body: '<html></html>', headers: { 'content-type': 'text/html', 'set-cookie': `rid=session${warmed}; path=/` } };
    }
    if (url.includes('/farfnd/')) {
      return init.headers.Cookie === 'rid=session2' ? { body: ONE_WAY } : { status: 403, body: 'Forbidden' };
    }
    return { status: 404, body: '{}' };
  });
  try {
    await warmSession(true);
    assert.equal(warmed, 1);
    const trips = await ryanair.explore({ origin: 'KTW', dateFrom: ymdPlus(4), dateTo: ymdPlus(9) });
    assert.equal(warmed, 2, 'po 403 se session obnoví právě jednou');
    assert.equal(trips.length, 2);
    const fares = stub.calls.filter((c) => c.url.includes('/farfnd/'));
    assert.equal(fares.at(-1).init.headers.Cookie, 'rid=session2');
  } finally {
    stub.restore();
  }
});

test('Ryanair: trvalý 403 skončí chybou, ne nekonečným opakováním', async () => {
  const stub = stubFetch((url) => (url.includes('/farfnd/') ? { status: 403, body: 'Forbidden' } : { body: '<html></html>', headers: { 'content-type': 'text/html' } }));
  try {
    await assert.rejects(ryanair.explore({ origin: 'GDN', dateFrom: ymdPlus(4), dateTo: ymdPlus(9) }), /HTTP 403/);
    assert.equal(stub.calls.filter((c) => c.url.includes('/farfnd/')).length, 4, '2 domény × 2 pokusy');
  } finally {
    stub.restore();
  }
});

test('Wizz Air: verze API ze stránky a síť tras', () => {
  assert.equal(scrapeVersion('...apiUrl:"https://be.wizzair.com/29.14.0/Api"...'), '29.14.0');
  assert.equal(scrapeVersion('nic'), null);
  const net = parseNetwork({
    cities: [
      { iata: 'VIE', countryCode: 'AT', currencyCode: 'EUR', connections: [{ iata: 'BCN', isDirectFlight: true }, { iata: 'TLV', isDirectFlight: false, isConnected: true }, { iata: 'LTN' }] },
      { iata: 'XXX', isFakeStation: true, connections: [] },
    ],
  });
  assert.deepEqual([...net.get('VIE').connections], ['BCN', 'LTN']);
  assert.ok(!net.has('XXX'));
});

test('Wizz Air: timetable – obě podoby departureDates, vyprodané/neceněné dny pryč', () => {
  const legs = parseTimetable([
    { departureStation: 'VIE', arrivalStation: 'BCN', departureDate: '2026-11-03T00:00:00', price: { amount: 19.99, currencyCode: 'EUR' }, priceType: 'price', departureDates: [{ date: '2026-11-03T06:10:00' }, { date: '2026-11-03T18:40:00', isCheapestOfTheDay: true }] },
    { departureStation: 'VIE', arrivalStation: 'BCN', departureDate: '2026-11-04T00:00:00', price: { amount: 29.99, currencyCode: 'EUR' }, priceType: 'price', departureDates: ['2026-11-04T07:00:00'] },
    { departureStation: 'VIE', arrivalStation: 'BCN', departureDate: '2026-11-05T00:00:00', price: { amount: 0, currencyCode: 'EUR' }, priceType: 'checkPrice' },
    { departureStation: 'VIE', arrivalStation: 'BCN', departureDate: '2026-11-06T00:00:00', price: { amount: 49, currencyCode: 'EUR' }, priceType: 'soldOut' },
  ], 2);
  assert.equal(legs.length, 2);
  assert.equal(legs[0].dep, '2026-11-03T18:40:00');
  assert.equal(legs[1].dep, '2026-11-04T07:00:00');
  assert.equal(legs[0].carrierName, 'Wizz Air');
  assert.equal(legs[0].bookUrl, 'https://wizzair.com/cs-cz/booking/select-flight/VIE/BCN/2026-11-03/null/2/0/0/null');
  assert.equal(w6Url({ from: 'BUD', to: 'LTN', dateOut: '2026-11-03', dateIn: '2026-11-07' }), 'https://wizzair.com/cs-cz/booking/select-flight/BUD/LTN/2026-11-03/2026-11-07/1/0/0/null');
});

test('Wizz Air: session, verze a POST timetableV2 s tokenem', async () => {
  const from = ymdPlus(5);
  const to = ymdPlus(40);
  const stub = stubFetch((url, init) => {
    if (url.startsWith('https://www.wizzair.com/')) return { body: '<script>apiUrl:"https://be.wizzair.com/30.1.0/Api"</script>', headers: { 'content-type': 'text/html' } };
    if (url.endsWith('/userSession/new')) return { body: '{}', headers: { 'set-cookie': 'RequestVerificationToken=abc123; path=/' } };
    if (url.includes('/search/timetableV2')) {
      const body = JSON.parse(init.body);
      const f = body.flightList[0];
      return { body: { outboundFlights: [{ departureStation: f.departureStation, arrivalStation: f.arrivalStation, departureDate: `${f.from}T00:00:00`, price: { amount: 9.99, currencyCode: 'EUR' }, priceType: 'price', departureDates: [`${f.from}T09:00:00`] }] } };
    }
    return { status: 404, body: '{}' };
  });
  try {
    const legs = await wizzair.daily({ from: 'VIE', to: 'BCN', dateFrom: from, dateTo: to });
    const posts = stub.calls.filter((c) => c.url.includes('timetableV2'));
    assert.equal(posts.length, 2, '36 dní = 2 okna po max. 30 dnech');
    assert.ok(posts[0].url.startsWith('https://be.wizzair.com/30.1.0/Api/search/timetableV2'));
    assert.equal(posts[0].init.headers['X-RequestVerificationToken'], 'abc123');
    const body = JSON.parse(posts[0].init.body);
    assert.equal(body.flightList[0].from, from);
    assert.equal(body.priceType, 'regular');
    assert.equal(legs.length, 2);
  } finally {
    stub.restore();
  }
});

test('Travelpayouts: jednosměrné i zpáteční letenky (zpáteční = jedna společná cena)', () => {
  const trips = parsePricesForDates({
    success: true,
    currency: 'czk',
    data: [
      { origin: 'PRG', destination: 'BKK', origin_airport: 'PRG', destination_airport: 'BKK', price: 14990, airline: 'QR', flight_number: '290', departure_at: '2026-11-03T15:25:00+01:00', return_at: '2026-11-17T08:10:00+07:00', transfers: 1, return_transfers: 1, duration: 1500, duration_to: 760, duration_back: 740, link: '/search/PRG0311BKK17111?t=QR' },
      { origin: 'PRG', destination: 'LON', origin_airport: 'PRG', destination_airport: 'STN', price: 899, airline: 'FR', flight_number: '3005', departure_at: '2026-11-05T06:00:00+01:00', transfers: 0, duration: 115, link: '/search/PRG0511LON1?t=FR' },
    ],
  });
  assert.equal(trips.length, 2);
  const [bkk, stn] = trips;
  assert.equal(bkk.combined, true);
  assert.equal(bkk.flightCzk, 14990);
  assert.equal(bkk.out.czk, null);
  assert.equal(bkk.back.from, 'BKK');
  assert.equal(bkk.back.dep, '2026-11-17T08:10:00');
  assert.equal(bkk.out.stops, 1);
  assert.equal(bkk.out.carrierName, 'Qatar Airways');
  assert.equal(bkk.out.live, false);
  assert.equal(bkk.bookUrl, 'https://www.aviasales.com/search/PRG0311BKK17111?t=QR');
  assert.equal(stn.out.to, 'STN');
  assert.equal(stn.flightCzk, 899);
  assert.equal(stn.out.durationMin, 115);
  assert.equal(tpUrl(null, { from: 'VIE', to: 'BCN', dateOut: '2026-11-03', dateIn: '2026-11-10', adults: 2 }), 'https://www.aviasales.com/search/VIE0311BCN10112');
});

after(() => setRates({ base: 'EUR', rates: FALLBACK_EUR, source: 'approx', date: null }));
