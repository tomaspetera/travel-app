// Kiwi.com MCP: JSON-RPC přes Streamable HTTP (JSON i SSE), session, převod na Leg/Trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';
import { kiwi, parseKiwiSearch, parseRpcBody } from '../server/providers/kiwi.js';
import { setRates, FALLBACK_EUR } from '../server/lib/fx.js';

setRates({ base: 'EUR', rates: { ...FALLBACK_EUR, CZK: 25 }, source: 'test' });

const seg = (from, to, dep, arr, carrier, num) => ({ from, to, fromCity: from, toCity: to, departureTime: dep, arrivalTime: arr, durationSeconds: 3600, carrier, flightNumber: num, cabinClass: 'M' });
const SEARCH = (d) => ({
  currency: 'EUR',
  resultsCount: 2,
  itineraries: [
    { id: 'a', price: 120, totalDurationSeconds: 9000, bookingUrl: 'https://www.kiwi.com/booking?token=a',
      outbound: { from: 'VIE', to: 'LIS', departureTime: `${d}T06:10:00`, arrivalTime: `${d}T09:40:00`, durationSeconds: 16200, stops: 1,
        segments: [seg('VIE', 'BCN', `${d}T06:10:00`, `${d}T08:30:00`, 'W6', '2347'), seg('BCN', 'LIS', `${d}T09:10:00`, `${d}T09:40:00`, 'VY', '8460')] } },
    { id: 'b', price: 180, bookingUrl: 'https://www.kiwi.com/booking?token=b',
      outbound: { from: 'VIE', to: 'LIS', departureTime: `${d}T12:00:00`, arrivalTime: `${d}T14:35:00`, durationSeconds: 12900, stops: 0, segments: [seg('VIE', 'LIS', `${d}T12:00:00`, `${d}T14:35:00`, 'TP', '1275')] } },
  ],
});

test('parseRpcBody: čistý JSON i SSE rámce', () => {
  assert.equal(parseRpcBody('{"jsonrpc":"2.0","id":1,"result":{"ok":1}}').result.ok, 1);
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":2,\ndata: "result":{"content":[]}}\n\n';
  assert.deepEqual(parseRpcBody(sse).result, { content: [] });
  assert.throws(() => parseRpcBody('nic'), /JSON-RPC/);
});

test('parseKiwiSearch: přestupy, více aerolinek, cena na osobu, zpáteční = společná cena', () => {
  const d = ymdPlus(20);
  const [a, b] = parseKiwiSearch(SEARCH(d), { adults: 2 });
  assert.equal(a.out.stops, 1);
  assert.equal(a.out.carrierName, 'Wizz Air + Vueling');
  assert.equal(a.out.flightNo, 'W6 2347, VY 8460');
  assert.equal(a.out.czk, Math.round(60 * 25), '120 € za 2 osoby = 60 € na osobu');
  assert.equal(a.out.durationMin, 270);
  assert.equal(a.bookUrl, 'https://www.kiwi.com/booking?token=a');
  assert.equal(b.out.stops, 0);
  const rt = parseKiwiSearch({ currency: 'EUR', itineraries: [{ ...SEARCH(d).itineraries[1], price: 300, inbound: { from: 'LIS', to: 'VIE', departureTime: `${ymdPlus(25)}T15:00:00`, arrivalTime: `${ymdPlus(25)}T19:30:00`, stops: 0, segments: [] } }] }, { adults: 1 });
  assert.equal(rt[0].combined, true);
  assert.equal(rt[0].flightCzk, 7500);
  assert.equal(rt[0].back.from, 'LIS');
});

test('kiwi.daily: initialize + tools/call search-flight, okna ±3 dny, datum ve formátu dd/mm/yyyy', async () => {
  const from = ymdPlus(10);
  const to = ymdPlus(16);
  const stub = stubFetch((url, init) => {
    assert.equal(url, 'https://mcp.kiwi.com');
    assert.match(init.headers.Accept, /text\/event-stream/);
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return { body: { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }, headers: { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' } };
    assert.equal(body.method, 'tools/call');
    assert.equal(body.params.name, 'search-flight');
    assert.equal(init.headers['mcp-session-id'], 'sess-1');
    const a = body.params.arguments;
    assert.match(a.departureDate, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.equal(a.departureDateFlexRange, 3);
    const [dd, mm, yyyy] = a.departureDate.split('/');
    const text = JSON.stringify(SEARCH(`${yyyy}-${mm}-${dd}`));
    return { body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text }] } })}\n\n`, headers: { 'content-type': 'text/event-stream' } };
  });
  try {
    const legs = await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: from, dateTo: to, adults: 1 });
    assert.equal(stub.calls.filter((c) => JSON.parse(c.init.body).method === 'tools/call').length, 1, '7 dní = 1 okno');
    assert.ok(legs.length >= 1 && legs.every((l) => l.provider === 'kiwi' && l.from === 'VIE'));
  } finally {
    stub.restore();
  }
});
