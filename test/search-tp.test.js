// Travelpayouts v orchestraci: konkrétní cíl, zpáteční letenky se společnou cenou.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
process.env.RYANAIR_ENABLED = '0';
process.env.WIZZ_ENABLED = '0';
process.env.KIWI_ENABLED = '0';
process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
const { search } = await import('../server/lib/search.js');

test('Travelpayouts: dotaz na každou dvojici letišť a měsíc, token v hlavičce, výsledek se společnou cenou', async () => {
  const d1 = ymdPlus(10);
  const d2 = ymdPlus(14);
  const stub = stubFetch((url) => {
    if (!url.startsWith('https://api.travelpayouts.com/')) return { status: 404, body: '{}' };
    const u = new URL(url);
    const o = u.searchParams.get('origin');
    const d = u.searchParams.get('destination');
    return {
      body: {
        success: true,
        data: [{ origin: o, destination: d, origin_airport: o, destination_airport: d, price: o === 'VIE' ? 3200 : 2900, airline: 'OS', flight_number: '451', departure_at: `${d1}T07:00:00+01:00`, return_at: `${d2}T18:00:00+00:00`, transfers: 0, return_transfers: 0, link: `/search/${o}x${d}` }],
      },
    };
  });
  try {
    const r = await search({ from: ['ap:VIE'], radiusKm: 60, to: ['ap:LHR'], dateFrom: ymdPlus(5), dateTo: ymdPlus(20), trip: 'return', nightsMin: 2, nightsMax: 6, kmRate: 0 });
    const tp = stub.calls.filter((c) => c.url.startsWith('https://api.travelpayouts.com/'));
    const months = new Set(tp.map((c) => new URL(c.url).searchParams.get('departure_at')));
    assert.equal(tp.length, 2 * months.size, 'VIE→LHR a BTS→LHR, jednou za měsíc');
    assert.ok(tp.every((c) => c.init.headers['X-Access-Token'] === 'test-token'));
    assert.ok(tp.every((c) => !c.url.includes('test-token')), 'token se neposílá v URL');
    assert.ok(tp.every((c) => new URL(c.url).searchParams.get('market') === 'cz'), 'čte český trh, ne výchozí ruský');
    assert.equal(r.mode, 'route');
    const best = r.top[0];
    assert.equal(best.out.from, 'BTS');
    assert.equal(best.combined, true);
    assert.equal(best.flightCzk, 2900);
    assert.match(best.bookUrl, /^https:\/\/www\.aviasales\.com\/search\/BTSxLHR/);
    assert.equal(r.providers[0].id, 'travelpayouts');
  } finally {
    stub.restore();
  }
});

test('Travelpayouts: když API trh nepřijme, zopakuje dotaz bez něj', async () => {
  const stub = stubFetch((url) => {
    const u = new URL(url);
    if (u.searchParams.get('market')) return { status: 400, body: { success: false, error: 'unknown market' } };
    return { body: { success: true, data: [{ origin: 'PRG', destination: 'LON', origin_airport: 'PRG', destination_airport: 'STN', price: 999, airline: 'FR', flight_number: '1', departure_at: `${ymdPlus(9)}T07:00:00+01:00`, transfers: 0, link: '/search/x' }] } };
  });
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:STN'], dateFrom: ymdPlus(5), dateTo: ymdPlus(15), trip: 'oneway', kmRate: 0 });
    assert.equal(r.top[0].flightCzk, 999);
    assert.ok(stub.calls.some((c) => !new URL(c.url).searchParams.get('market')));
  } finally {
    stub.restore();
  }
});

test('Travelpayouts: odmítnutá trasa (HTTP 400) = žádné ceny, ne „dotaz selhal“', async () => {
  const stub = stubFetch((url) => {
    const u = new URL(url);
    if (u.searchParams.get('destination') === 'LTN') return { status: 400, body: { error: 'destination: invalid value' } };
    return { body: { success: true, data: [{ origin: 'PRG', destination: 'LON', origin_airport: 'PRG', destination_airport: 'STN', price: 1111, airline: 'FR', flight_number: '1', departure_at: `${ymdPlus(9)}T07:00:00+01:00`, transfers: 0, link: '/search/y' }] } };
  });
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:STN', 'ap:LTN'], dateFrom: ymdPlus(5), dateTo: ymdPlus(15), trip: 'oneway', kmRate: 0 });
    assert.ok(stub.calls.some((c) => new URL(c.url).searchParams.get('destination') === 'LTN'), 'na LTN se ptal');
    assert.equal(r.top[0].flightCzk, 1111);
    const st = r.providers.find((p) => p.id === 'travelpayouts');
    assert.equal(st.error, null, 'odmítnutá trasa se nehlásí jako chyba');
    assert.equal(st.state, 'done');
  } finally {
    stub.restore();
  }
});
