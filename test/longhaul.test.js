// Dálkové lety: světadíly jako cíl, Kiwi do zemí z víc letišť (i přestupních v okolí),
// Travelpayouts na hlavní letiště země, dálková trasa zpátečními letenkami přes celé období.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
process.env.RYANAIR_ENABLED = '0';
process.env.WIZZ_ENABLED = '0';
process.env.KIWI_ENABLED = '1';
process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
const { search } = await import('../server/lib/search.js');
const { localSuggestions, resolveDestinations } = await import('../server/lib/places.js');
const { hubsNear, continentCountries } = await import('../server/lib/longhaul.js');
const { resetKiwi } = await import('../server/providers/kiwi.js');
const { setRates, FALLBACK_EUR } = await import('../server/lib/fx.js');

setRates({ base: 'EUR', rates: { ...FALLBACK_EUR, CZK: 25 }, source: 'test' });
const PRAHA = { lat: 50.0875, lon: 14.4213 };

const leg = (from, to, d, h = 10) => ({
  from, to, departureTime: `${d}T${String(h).padStart(2, '0')}:00:00`, arrivalTime: `${d}T${String(h + 9).padStart(2, '0')}:00:00`, durationSeconds: 32400, stops: 1,
  segments: [{ from, to, departureTime: `${d}T10:00:00`, arrivalTime: `${d}T19:00:00`, carrier: 'EK', flightNumber: 'EK140' }],
});
// Kiwi MCP: initialize → session, tools/call → itineráře podle flyTo (země / letiště).
const DEST_BY_TO = { EG: 'HRG', MA: 'RAK', KE: 'NBO', TZ: 'ZNZ', ZA: 'CPT', TH: 'BKK', BKK: 'BKK', anywhere: 'BCN', AE: 'DXB', US: 'JFK' };
function kiwiHandler(calls, { nights = 9 } = {}) {
  return (url, init) => {
    if (url.startsWith('https://api.travelpayouts.com/')) return { body: { success: true, data: [] } };
    if (url !== 'https://mcp.kiwi.com') return { status: 404, body: '{}' };
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return { body: { jsonrpc: '2.0', id: body.id, result: {} }, headers: { 'content-type': 'application/json', 'mcp-session-id': 's1' } };
    if (body.method === 'notifications/initialized') return { status: 202, body: '' };
    const a = body.params.arguments;
    calls.push(a);
    const d = `${a.departureDate.slice(6)}-${a.departureDate.slice(3, 5)}-${a.departureDate.slice(0, 2)}`;
    const to = DEST_BY_TO[String(a.flyTo).split(',')[0]] || 'XXX';
    const from = String(a.flyFrom).split(',').includes('VIE') && to === 'NBO' ? 'VIE' : 'PRG';
    const back = ymdFrom(d, nights);
    const it = { price: 500, bookingUrl: `https://www.kiwi.com/booking?${to}`, outbound: leg(from, to, d), ...(a.nights_in_dst_from != null || a.returnDate ? { inbound: leg(to, from, back, 12) } : {}) };
    const text = JSON.stringify({ currency: 'EUR', passengers: { adults: a.adults }, resultsCount: 1, itineraries: [it] });
    return { body: { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text }] } } };
  };
}
function ymdFrom(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test('světadíly: v našeptávači, jako cíl = seznam zemí (oblíbené napřed)', () => {
  assert.equal(localSuggestions('afrika', 3)[0].id, 'ct:africa');
  assert.equal(localSuggestions('asie', 3)[0].id, 'ct:asia');
  assert.equal(localSuggestions('blizky vychod', 3)[0].id, 'ct:mideast');
  const d = resolveDestinations(['ct:africa']);
  assert.equal(d.kind, 'countries');
  assert.deepEqual(d.continents, ['africa']);
  assert.ok(d.countries.includes('KE') && d.countries.includes('ZA') && !d.countries.includes('ES'));
  assert.deepEqual(continentCountries('asia').slice(0, 3), ['TH', 'AE', 'VN']);
  // světadíl + konkrétní letiště: jen velká letiště světadílu, ne stovky malých
  const mix = resolveDestinations(['ct:oceania', 'ap:DXB']);
  assert.equal(mix.kind, 'airports');
  assert.ok(mix.airports.includes('SYD') && mix.airports.length < 40);
});

test('přestupní letiště pro dálkové lety: velká letiště do 450 km, ne ta, ze kterých se už letí', () => {
  const h = hubsNear(PRAHA, new Set(['PRG', 'DRS']), { access: { mode: 'transit', scale: 1 } });
  assert.deepEqual(h.map((x) => x.iata).sort(), ['BER', 'MUC', 'VIE']);
  assert.ok(h.every((x) => x.hub && x.ground.czk > 0 && x.distKm < 450));
  assert.deepEqual(hubsNear(PRAHA, new Set(['VIE']), { exclude: ['MUC'] }).map((x) => x.iata), ['BER', 'FRA']);
});

test('Kiwi do světadílu: dotaz na každou oblíbenou zemi, z domova i přestupních letišť, zpáteční s rozmezím nocí', async () => {
  resetKiwi();
  const calls = [];
  const stub = stubFetch(kiwiHandler(calls));
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ct:africa'], dateFrom: ymdPlus(20), dateTo: ymdPlus(40), trip: 'return', nightsMin: 7, nightsMax: 14, kmRate: 1.1 });
    assert.deepEqual(calls.slice(0, 5).map((a) => a.flyTo), ['EG', 'MA', 'TN', 'KE', 'TZ'], 'oblíbené africké země napřed, každá zvlášť');
    assert.ok(calls.every((a) => a.one_for_city === true && a.nights_in_dst_from === 7 && a.nights_in_dst_to === 14));
    const by = Object.fromEntries(calls.map((a) => [a.flyTo, a.flyFrom]));
    assert.match(by.KE, /^PRG,.*VIE/, 'do Keni i z Vídně, Mnichova, Berlína');
    assert.equal(by.TN, 'PRG', 'do Tuniska (blízko) jen z domova');
    assert.ok(calls.length <= 12);
    const kiwi = r.providers.find((p) => p.id === 'kiwi');
    assert.equal(kiwi.state, 'done');
    assert.match(kiwi.note, /zemí/);
    const nbo = r.groups.find((g) => g.dest.airports.includes('NBO'));
    assert.ok(nbo, 'Keňa ve výsledcích');
    assert.equal(nbo.best.out.from, 'VIE');
    assert.ok(nbo.best.groundCzk > 0, 'cesta do Vídně započtená v ceně');
    const vie = r.origins.find((o) => o.iata === 'VIE');
    assert.equal(vie?.hub, true, 'použité přestupní letiště je mezi odletovými');
    assert.ok(!r.origins.some((o) => o.iata === 'BER'), 'nepoužité přestupní letiště se neukazuje');
    assert.deepEqual(r.hubs, ['BER', 'MUC', 'VIE'], 'prohledaná přestupní letiště i ta bez výsledku (UI je znovu nenabízí)');
  } finally {
    stub.restore();
  }
});

test('Travelpayouts do země: kromě „odkudkoliv“ i dotaz na hlavní letiště země', async () => {
  resetKiwi();
  const stub = stubFetch(kiwiHandler([]));
  try {
    // jiné měsíce než předchozí test (odpovědi Travelpayouts jsou v mezipaměti)
    await search({ from: ['ap:PRG'], radiusKm: 0, to: ['cc:TH'], dateFrom: ymdPlus(130), dateTo: ymdPlus(140), trip: 'return', nightsMin: 7, nightsMax: 14, kmRate: 0 });
    const tp = stub.calls.filter((c) => c.url.startsWith('https://api.travelpayouts.com/')).map((c) => new URL(c.url).searchParams.get('destination'));
    assert.ok(tp.includes(null), 'odkudkoliv (bez cíle)');
    assert.ok(tp.includes('BKK') && tp.includes('HKT'), 'i Bangkok a Phuket přímo');
  } finally {
    stub.restore();
  }
});

test('dálková trasa: Kiwi zpátečními letenkami přes celé období (i z přestupních letišť), doplní kalendář', async () => {
  resetKiwi();
  const calls = [];
  const stub = stubFetch(kiwiHandler(calls, { nights: 12 }));
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:BKK'], dateFrom: ymdPlus(10), dateTo: ymdPlus(80), trip: 'return', nightsMin: 11, nightsMax: 16, kmRate: 1.1 });
    const rt = calls.filter((a) => a.nights_in_dst_from != null);
    assert.equal(rt.length, 3, '71 dní = 3 okna po nejvýš 31 dnech');
    assert.ok(rt.every((a) => a.flyTo === 'BKK' && a.flyFrom.startsWith('PRG,') && a.flyFrom.includes('MUC')));
    const oneWay = calls.filter((a) => a.nights_in_dst_from == null);
    assert.ok(oneWay.length > 0, 'první 3 týdny i jednotlivé lety po dnech');
    // tam jen první 3 týdny (do +30), zpět do +30 + 16 nocí – ne přes celých 70 dní
    const late = oneWay.map((a) => a1(a.departureDateTo || a.departureDate)).filter((x) => x > ymdPlus(46));
    assert.deepEqual(late, [], 'jednotlivé lety jen v prvních týdnech, ne přes celé období');
    assert.match(r.providers.find((p) => p.id === 'kiwi').note, /zpátečními letenkami/);
    // kalendář pokrývá i termíny po 3 týdnech (z celých zpátečních letenek)
    assert.ok(r.calendar.out.some((c) => c.date > ymdPlus(40)), 'kalendář i ke konci období');
  } finally {
    stub.restore();
  }
});
const a1 = (dmy) => `${dmy.slice(6)}-${dmy.slice(3, 5)}-${dmy.slice(0, 2)}`;
