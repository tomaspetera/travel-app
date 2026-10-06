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
const { resetTravelpayouts } = await import('../server/providers/travelpayouts.js');

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
  resetTravelpayouts(); // výchozí stav jako v provozu: dotazy s trhem cz
  const stub = stubFetch((url) => {
    const u = new URL(url);
    if (u.searchParams.get('destination') === 'LTN') return { status: 400, body: { error: 'destination: invalid value' } };
    return { body: { success: true, data: [{ origin: 'PRG', destination: 'LON', origin_airport: 'PRG', destination_airport: 'STN', price: 1111, airline: 'FR', flight_number: '1', departure_at: `${ymdPlus(105)}T07:00:00+01:00`, transfers: 0, link: '/search/y' }] } };
  });
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:STN', 'ap:LTN'], dateFrom: ymdPlus(100), dateTo: ymdPlus(110), trip: 'oneway', kmRate: 0 });
    assert.ok(stub.calls.some((c) => new URL(c.url).searchParams.get('destination') === 'LTN'), 'na LTN se ptal');
    assert.equal(r.top[0].flightCzk, 1111);
    const st = r.providers.find((p) => p.id === 'travelpayouts');
    assert.equal(st.error, null, 'odmítnutá trasa se nehlásí jako chyba');
    assert.equal(st.state, 'done');
    const ltn = stub.calls.filter((c) => new URL(c.url).searchParams.get('destination') === 'LTN').map((c) => new URL(c.url).searchParams.get('market'));
    assert.ok(ltn.includes('cz') && ltn.includes(null), 'zkusil s trhem i bez něj');
    // trh za odmítnutí nemohl → zůstává zapnutý pro další hledání
    stub.calls.length = 0;
    await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:STN'], dateFrom: ymdPlus(160), dateTo: ymdPlus(165), trip: 'oneway', kmRate: 0 });
    assert.ok(stub.calls.some((c) => new URL(c.url).searchParams.get('market') === 'cz'));
  } finally {
    stub.restore();
  }
});

test('Travelpayouts ve „Víc měst“: let s přestupem s nemožnou délkou má neznámý přílet a další let nejdřív 24 h po odletu', async () => {
  resetTravelpayouts();
  const d1 = ymdPlus(40);
  const d2 = ymdPlus(41);
  const row = (o, d, day, hm, airline, transfers, min, price) => ({ origin: o, destination: d, origin_airport: o, destination_airport: d, price, airline, flight_number: '1', departure_at: `${day}T${hm}:00+01:00`, transfers, duration_to: min, link: `/search/${o}${d}${hm}` });
  const stub = stubFetch((url) => {
    const u = new URL(url);
    const day = u.searchParams.get('departure_at');
    if (u.searchParams.get('origin') === 'PRG') return { body: { success: true, data: [row('PRG', 'BCN', day, '20:30', 'U2', 1, 185, 1173), row('PRG', 'BCN', day, '10:40', 'VY', 0, 150, 1990)] } };
    return { body: { success: true, data: [row('BCN', 'PRG', day, '07:00', 'FR', 0, 150, 1500), row('BCN', 'PRG', day, '21:30', 'VY', 0, 150, 1700)] } };
  });
  try {
    const r = await search({ trip: 'multi', from: ['ap:PRG'], radiusKm: 0, kmRate: 0, legs: [{ from: ['ap:PRG'], to: ['ap:BCN'], date: d1 }, { from: ['ap:BCN'], to: ['ap:PRG'], date: d2 }] });
    assert.equal(r.mode, 'multi');
    const o1 = r.legs[0].options, o2 = r.legs[1].options;
    const u2 = o1.findIndex((o) => o.out.carrier === 'U2'), vy = o1.findIndex((o) => o.out.carrier === 'VY');
    const early = o2.findIndex((o) => o.out.carrier === 'FR'), late = o2.findIndex((o) => o.out.carrier === 'VY');
    assert.ok(u2 >= 0 && vy >= 0 && early >= 0 && late >= 0, JSON.stringify([u2, vy, early, late]));
    assert.deepEqual([o1[u2].out.arr, o1[u2].out.durationMin, o1[u2].out.arrUnknown], [null, null, true], 'žádný vymyšlený přílet 23:35');
    assert.equal(r.links[0][u2][early].why, 'unknown', 'ráno po večerním odletu s přestupem nenavazuje');
    assert.equal(r.links[0][u2][late], null, 'večer dalšího dne (25 h po odletu) ano');
    assert.equal(r.links[0][vy][early], null, 'přímý let se známým příletem jako dřív');
    assert.ok(r.combos.length && r.combos.every((c) => !(c.picks[0] === u2 && c.picks[1] === early)), 'celá cesta nespojí U2 s ranním letem');
  } finally {
    stub.restore();
  }
});
