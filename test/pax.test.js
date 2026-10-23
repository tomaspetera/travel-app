// Cestující s dětmi: dospělí, děti 2–11 let (platí sedadlo) a miminka do 2 let (na klíně) – dotaz, ceny za sedadla,
// odkazy na rezervaci letů a ubytování. Bez dětí se nic nemění.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';
import { normalizeQuery, paxQuery, search } from '../server/lib/search.js';
import { accessOpts } from '../server/lib/access.js';
import { mockProviders } from '../server/providers/mock.js';
import { bookingUrl as frUrl, parseOneWay } from '../server/providers/ryanair.js';
import { wizzair, parseTimetable, bookingUrl as w6Url } from '../server/providers/wizzair.js';
import { bookingUrl as tpUrl } from '../server/providers/travelpayouts.js';
import { ONE_WAY } from './fixtures/ryanair.js';
import { normalizeStayQuery } from '../server/lib/stays.js';
import { stayLinks, bookingSearchUrl, tripSearchUrl, expediaSearchUrl } from '../server/lib/links.js';

test('paxQuery: děti a miminka volitelně, sedadla = dospělí + děti, miminek nejvýš tolik co dospělých, celkem 9 sedadel', () => {
  assert.deepEqual(paxQuery({ adults: 2 }), { adults: 2, children: 0, infants: 0, seats: 2 }, 'bez dětí jako dřív');
  assert.deepEqual(paxQuery({}), { adults: 1, children: 0, infants: 0, seats: 1 });
  assert.deepEqual(paxQuery({ adults: 2, children: 2, infants: 1 }), { adults: 2, children: 2, infants: 1, seats: 4 });
  assert.deepEqual(paxQuery({ adults: 1, infants: 3 }), { adults: 1, children: 0, infants: 1, seats: 1 }, 'miminko na klíně každého dospělého');
  assert.deepEqual(paxQuery({ adults: 7, children: 5 }), { adults: 7, children: 2, infants: 0, seats: 9 }, 'nejvýš 9 sedadel');
  assert.deepEqual(paxQuery({ adults: 'x', children: -2, infants: 'abc' }), { adults: 1, children: 0, infants: 0, seats: 1 });
  const q = normalizeQuery({ from: ['ap:PRG'], adults: 2, children: 1, infants: 1 });
  assert.deepEqual([q.adults, q.children, q.infants, q.seats], [2, 1, 1, 3]);
  const m = normalizeQuery({ trip: 'multi', from: ['ap:PRG'], adults: 2, children: 2, legs: [{ from: ['ap:PRG'], to: ['ap:BCN'], date: ymdPlus(20) }, { from: ['ap:BCN'], to: ['ap:PRG'], date: ymdPlus(25) }] });
  assert.deepEqual([m.adults, m.children, m.seats], [2, 2, 4], 'i cesta přes víc měst');
});

test('doprava na letiště: auto a jízdné na všechna sedadla (dospělí i děti), bez dětí dospělí', () => {
  assert.equal(accessOpts(normalizeQuery({ from: ['ap:PRG'], adults: 2, children: 2, infants: 1 })).adults, 4);
  assert.equal(accessOpts(normalizeQuery({ from: ['ap:PRG'], adults: 3 })).adults, 3);
  assert.equal(accessOpts({ groundMode: 'car', kmRate: 1, carFuel: 'diesel', carCons: 6, adults: 2 }).adults, 2, 'dotaz bez sedadel (/api/origins)');
});

test('Wizz Air: odkaz na rezervaci s dětmi a miminky (…/dospělí/děti/miminka/null), bez dětí beze změny', () => {
  assert.equal(w6Url({ from: 'VIE', to: 'BCN', dateOut: '2026-11-03', adults: 2, children: 2, infants: 1 }), 'https://www.wizzair.com/cs-cz/booking/select-flight/VIE/BCN/2026-11-03/null/2/2/1/null');
  assert.equal(w6Url({ from: 'VIE', to: 'BCN', dateOut: '2026-11-03', dateIn: '2026-11-07', adults: 2 }), 'https://www.wizzair.com/cs-cz/booking/select-flight/VIE/BCN/2026-11-03/2026-11-07/2/0/0/null');
  const f = { departureStation: 'VIE', arrivalStation: 'BCN', departureDate: '2026-11-03T00:00:00', price: { amount: 19.99, currencyCode: 'EUR' }, priceType: 'price', departureDates: ['2026-11-03T09:00:00'] };
  assert.equal(parseTimetable([f], { adults: 1, children: 1, infants: 1 })[0].bookUrl, 'https://www.wizzair.com/cs-cz/booking/select-flight/VIE/BCN/2026-11-03/null/1/1/1/null');
  assert.equal(parseTimetable([f], 2)[0].bookUrl, 'https://www.wizzair.com/cs-cz/booking/select-flight/VIE/BCN/2026-11-03/null/2/0/0/null', 'starší volání s počtem dospělých');
});

test('Wizz Air: ceny po dnech pro všechna sedadla (adultCount = dospělí + děti), paměť tras podle sedadel', async () => {
  wizzair._resetMemory();
  const day = ymdPlus(45);
  const stub = stubFetch((url, init) => {
    if (url.startsWith('https://www.wizzair.com/')) return { body: '<script>apiUrl:"https://be.wizzair.com/30.1.0/Api"</script>', headers: { 'content-type': 'text/html' } };
    if (url.endsWith('/userSession/new')) return { body: '{}' };
    if (url.includes('/search/timetableV2')) {
      const f = JSON.parse(init.body).flightList[0];
      return { body: { outboundFlights: [{ departureStation: f.departureStation, arrivalStation: f.arrivalStation, departureDate: `${f.from}T00:00:00`, price: { amount: 29.99, currencyCode: 'EUR' }, priceType: 'price', departureDates: [`${f.from}T07:15:00`] }] } };
    }
    return { status: 404, body: '{}' };
  });
  try {
    const legs = await wizzair.daily({ from: 'BUD', to: 'NAP', dateFrom: day, dateTo: day, adults: 2, children: 2, infants: 1 });
    const posts = stub.calls.filter((c) => c.url.includes('timetableV2')).map((c) => JSON.parse(c.init.body));
    assert.deepEqual(posts.map((b) => [b.adultCount, b.childCount, b.infantCount]), [[4, 0, 0]], '4 sedadla, miminko na klíně se do ceny nepočítá');
    assert.equal(legs[0].bookUrl, `https://www.wizzair.com/cs-cz/booking/select-flight/BUD/NAP/${day}/null/2/2/1/null`);
    // 4 dospělí = stejná sedadla → z paměti, jen odkaz bez dětí
    const four = await wizzair.daily({ from: 'BUD', to: 'NAP', dateFrom: day, dateTo: day, adults: 4 });
    assert.equal(stub.calls.filter((c) => c.url.includes('timetableV2')).length, 1, 'stejný počet sedadel bez dotazu navíc');
    assert.equal(four[0].bookUrl, `https://www.wizzair.com/cs-cz/booking/select-flight/BUD/NAP/${day}/null/4/0/0/null`);
    assert.equal(wizzair.routeState({ from: 'BUD', to: 'NAP', dateFrom: day, dateTo: day, adults: 2, children: 2 }).calls, 0);
    assert.equal(wizzair.routeState({ from: 'BUD', to: 'NAP', dateFrom: day, dateTo: day, adults: 2 }).calls, 1, '2 sedadla = jiná trasa v paměti');
  } finally {
    stub.restore();
    wizzair._resetMemory();
  }
});

test('Ryanair: odkaz na rezervaci s dětmi (children) a miminky (infants), i tp…; bez dětí nuly', () => {
  const u = new URL(frUrl({ from: 'VIE', to: 'BGY', dateOut: '2026-11-10', dateIn: '2026-11-14', adults: 2, children: 3, infants: 1 }));
  const p = Object.fromEntries(['adults', 'teens', 'children', 'infants', 'tpAdults', 'tpTeens', 'tpChildren', 'tpInfants'].map((k) => [k, u.searchParams.get(k)]));
  assert.deepEqual(p, { adults: '2', teens: '0', children: '3', infants: '1', tpAdults: '2', tpTeens: '0', tpChildren: '3', tpInfants: '1' });
  const a = new URL(frUrl({ from: 'VIE', to: 'BGY', dateOut: '2026-11-10', adults: 2 }));
  assert.deepEqual([a.searchParams.get('children'), a.searchParams.get('infants'), a.searchParams.get('tpChildren')], ['0', '0', '0']);
  const legs = parseOneWay(ONE_WAY, { adults: 2, children: 1, infants: 1 });
  assert.ok(legs.length && legs.every((t) => /[?&]children=1&infants=1&/.test(t.out.bookUrl)), 'odkaz z Fare Finderu s dětmi');
});

test('Aviasales (Travelpayouts): v adrese jen dospělí – zápis dětí ověřený nemáme', () => {
  assert.equal(tpUrl('/search/PRG0511LON1?t=W6', { adults: 2, children: 2, infants: 1 }), 'https://www.aviasales.com/search/PRG0511LON2?t=W6&currency=eur');
});

test('hledání s dětmi: cena za osobu stejná jako bez nich, celkem za všechna sedadla', async () => {
  const stub = stubFetch(() => ({ status: 404, body: {} })); // kurzy: orientační
  try {
    const base = { from: ['ap:VIE'], to: ['ap:BCN'], radiusKm: 0, dateFrom: ymdPlus(30), dateTo: ymdPlus(36), trip: 'return', nightsMin: 3, nightsMax: 5, kmRate: 0, noPartial: true };
    const run = (x) => search({ ...base, ...x }, () => {}, { providers: mockProviders });
    const solo = await run({ adults: 2 });
    const fam = await run({ adults: 2, children: 2, infants: 1 });
    const t0 = solo.groups[0].best, t1 = fam.groups[0].best;
    assert.equal(t1.perPersonCzk, t0.perPersonCzk, 'cena sedadla dítěte jako dospělého');
    assert.equal(t0.totalCzk, t0.perPersonCzk * 2);
    assert.equal(t1.totalCzk, t1.perPersonCzk * 4, 'miminko bez poplatku aerolinky (neznáme ho)');
    assert.deepEqual([fam.query.adults, fam.query.children, fam.query.infants, fam.query.seats], [2, 2, 1, 4]);
  } finally { stub.restore(); }
});

test('ubytování s dětmi: Booking, Trip.com a Agoda děti zvlášť, ostatním děti k hostům; pokoje podle dospělých', () => {
  const base = { city: 'Barcelona', cityEn: 'Barcelona', cc: 'ES', checkin: ymdPlus(30), checkout: ymdPlus(33) };
  const q = normalizeStayQuery({ ...base, adults: 2, children: 2, infants: 1 });
  assert.deepEqual([q.adults, q.children, q.infants, q.rooms], [2, 2, 1, 1], 'rodina v jednom pokoji');
  assert.equal(normalizeStayQuery({ ...base, adults: 1, infants: 4 }).infants, 1);
  const by = Object.fromEntries(stayLinks(q, { trip: 38742, agoda: 20636, hostelworld: 64 }).map((l) => [l.id, new URL(l.url)]));
  assert.deepEqual([by.booking.searchParams.get('group_adults'), by.booking.searchParams.get('group_children')], ['2', '3'], 'Booking: děti i miminko (věk si vyžádá)');
  assert.deepEqual([by.trip.searchParams.get('adult'), by.trip.searchParams.get('children')], ['2', '3']);
  assert.deepEqual([by.agoda.searchParams.get('adults'), by.agoda.searchParams.get('children')], ['2', '3']);
  assert.equal(by.airbnb.searchParams.get('adults'), '4', 'Airbnb jen dospělí v adrese → děti k hostům kvůli kapacitě');
  assert.match(by.kayak.pathname, /\/4adults$/);
  assert.equal(by.hostelworld.searchParams.get('guests'), '4');
  assert.equal(by.hotelscom.searchParams.get('adults'), '4');
  assert.equal(new URL(bookingSearchUrl('Hotel X', 'Barcelona', q)).searchParams.get('group_children'), '3');
  assert.equal(new URL(tripSearchUrl('Barcelona', q)).searchParams.get('children'), '3');
  // bez dětí odkazy beze změny
  const a = normalizeStayQuery({ ...base, adults: 2 });
  assert.equal(new URL(bookingSearchUrl('Hotel X', 'Barcelona', a)).searchParams.has('group_children'), false);
  assert.equal(new URL(tripSearchUrl('Barcelona', a)).searchParams.has('children'), false);
  assert.equal(new URL(expediaSearchUrl('www.hotels.com', 'Barcelona', a)).searchParams.get('adults'), '2');
  assert.equal(new URL(stayLinks(a)[0].url).searchParams.get('group_children'), '0');
});
