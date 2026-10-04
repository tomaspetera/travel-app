// Travelpayouts v orchestraci: konkrétní cíl, zpáteční letenky se společnou cenou.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
process.env.RYANAIR_ENABLED = '0';
process.env.WIZZ_ENABLED = '0';
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
