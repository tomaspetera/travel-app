// Kiwi.com MCP: JSON-RPC přes Streamable HTTP (JSON i SSE), session, převod na Leg/Trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';
import { kiwi, parseKiwiSearch, parseRpcBody, kiwiBlocked, kiwiContext, kiwiRetryAfter, resetKiwi } from '../server/providers/kiwi.js';
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

// krátké pauzy mezi opakováními, ať testy netrvají
test.beforeEach(() => resetKiwi({ retryMs: 5 }));

test('kiwi.daily: initialize + tools/call search-flight, okno od–do, počet cestujících, datum dd/mm/yyyy', async () => {
  const from = ymdPlus(10);
  const to = ymdPlus(16);
  const stub = stubFetch((url, init) => {
    assert.equal(url, 'https://mcp.kiwi.com');
    assert.match(init.headers.Accept, /text\/event-stream/);
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return { body: { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }, headers: { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' } };
    if (body.method === 'notifications/initialized') {
      assert.equal(body.id, undefined, 'notifikace nemá id');
      assert.equal(init.headers['mcp-session-id'], 'sess-1');
      return { status: 202, body: '' };
    }
    assert.equal(body.method, 'tools/call');
    assert.equal(body.params.name, 'search-flight');
    assert.equal(init.headers['mcp-session-id'], 'sess-1');
    const a = body.params.arguments;
    // Aktuální schéma Kiwi MCP: adults/currency nahoře, rozsah departureDate..departureDateTo.
    assert.match(a.departureDate, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.match(a.departureDateTo, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.equal(a.adults, 1);
    assert.equal(a.currency, 'EUR');
    assert.equal(a.passengers, undefined);
    assert.equal(a.departureDateFlexRange, undefined);
    const [dd, mm, yyyy] = a.departureDate.split('/');
    const text = JSON.stringify({ ...SEARCH(`${yyyy}-${mm}-${dd}`), passengers: { adults: a.adults } });
    return { body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text }] } })}\n\n`, headers: { 'content-type': 'text/event-stream' } };
  });
  try {
    const legs = await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: from, dateTo: to, adults: 1 });
    const methods = stub.calls.map((c) => JSON.parse(c.init.body).method);
    assert.deepEqual(methods.slice(0, 2), ['initialize', 'notifications/initialized'], 'MCP handshake podle specifikace');
    assert.equal(methods.filter((m) => m === 'tools/call').length, 1, '7 dní = 1 okno');
    assert.ok(legs.length >= 1 && legs.every((l) => l.provider === 'kiwi' && l.from === 'VIE'));
  } finally {
    stub.restore();
  }
});

// Server, který odpovídá na handshake a na search-flight podle data (fail = data, pro která vrátí chybu).
function kiwiServer({ fail = new Set(), status = 500, wrongPax = false } = {}) {
  return stubFetch((url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return { body: { jsonrpc: '2.0', id: 1, result: {} }, headers: { 'content-type': 'application/json', 'mcp-session-id': 's2' } };
    if (body.method === 'notifications/initialized') return { status: 202, body: '' };
    const [dd, mm, yyyy] = body.params.arguments.departureDate.split('/');
    const d = `${yyyy}-${mm}-${dd}`;
    if (fail.has(d)) return { status, body: 'boom' };
    const adults = body.params.arguments.adults;
    return { body: { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify({ ...SEARCH(d), passengers: { adults: wrongPax ? adults + 1 : adults } }) }] } } };
  });
}

test('kiwi.daily: jen přímé lety, když je zapnuto directOnly', async () => {
  const stub = kiwiServer();
  try {
    const all = await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(30), dateTo: ymdPlus(36) });
    const direct = await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(30), dateTo: ymdPlus(36), directOnly: true });
    assert.ok(all.some((l) => l.stops > 0));
    assert.ok(direct.length > 0 && direct.every((l) => l.stops === 0));
  } finally {
    stub.restore();
  }
});

test('kiwi.daily: chyba jednoho okna nezahodí ostatní; série chyb jednoho hledání nevypne Kiwi ostatním', async () => {
  const from = ymdPlus(50);
  const secondStart = ymdPlus(57); // okna: [50..56], [57..63]
  const failing = new Set([secondStart, ymdPlus(110), ymdPlus(117), ymdPlus(124), ymdPlus(140)]);
  const stub = kiwiServer({ fail: failing });
  try {
    const ctx = kiwiContext();
    const legs = await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: from, dateTo: ymdPlus(63), ctx });
    assert.ok(legs.length > 0, 'první okno zůstalo');
    assert.ok(legs.every((l) => l.date <= ymdPlus(56)));
    assert.equal(kiwiBlocked(), false, 'jedna přechodná chyba Kiwi nevypne');
    assert.deepEqual([ctx.ok, ctx.failed, ctx.retried], [1, 1, 2], 'chybné okno se zkusilo ještě 2×');
    // úspěšný dotaz počítání chyb pro pojistku vynuluje
    await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(200), dateTo: ymdPlus(202), ctx });
    // tři selhání za sebou v jednom hledání → zbytek TOHO hledání bez Kiwi, ostatní hledání dál
    const one = kiwiContext();
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(110), dateTo: ymdPlus(130), ctx: one }));
    assert.equal(one.failed, 3);
    assert.equal(one.down, true);
    assert.equal(kiwiBlocked(), false, 'série 503 z jednoho hledání nespustí pojistku pro všechny');
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(70), dateTo: ymdPlus(76), ctx: one }), /vynechány/);
    assert.equal(one.skipped, 1);
    const other = await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(70), dateTo: ymdPlus(76), ctx: kiwiContext() });
    assert.ok(other.length > 0, 'jiné hledání Kiwi pořád používá');
    // skutečný výpadek: chyby ze 2 různých hledání bez úspěchu mezi nimi → pojistka pro všechny
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(110), dateTo: ymdPlus(116), ctx: kiwiContext() }));
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(117), dateTo: ymdPlus(123), ctx: kiwiContext() }));
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(140), dateTo: ymdPlus(146), ctx: kiwiContext() }));
    assert.equal(kiwiBlocked(), true, 'výpadek napříč hledáními → pojistka');
    assert.ok(kiwiRetryAfter() > 0 && kiwiRetryAfter() <= 60, 'první vynechání jen na minutu');
    const blocked = kiwiContext();
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(80), dateTo: ymdPlus(86), ctx: blocked }), /vynecháno/);
    assert.equal(blocked.blocked, true);
  } finally {
    stub.restore();
  }
});

// Server, který odpovídá podle scénáře: script(n, body) → odpověď n-tého požadavku (null = normální odpověď).
function scripted(script) {
  let n = 0;
  return stubFetch((url, init) => {
    const body = JSON.parse(init.body);
    const r = script(n++, body, init);
    if (r) return r;
    if (body.method === 'initialize') return { body: { jsonrpc: '2.0', id: 1, result: {} }, headers: { 'content-type': 'application/json', 'mcp-session-id': `s${n}` } };
    if (body.method === 'notifications/initialized') return { status: 202, body: '' };
    const [dd, mm, yyyy] = body.params.arguments.departureDate.split('/');
    const text = JSON.stringify({ ...SEARCH(`${yyyy}-${mm}-${dd}`), passengers: { adults: body.params.arguments.adults } });
    return { body: { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text }] } } };
  });
}
const methods = (stub) => stub.calls.map((c) => JSON.parse(c.init.body).method);

test('kiwi: 503 u search-flight i u initialize se zkusí znovu (krátká pauza), hledání pak projde', async () => {
  let toolCalls = 0;
  const stub = scripted((n, body) => {
    if (body.method === 'initialize' && n === 0) return { status: 503, body: 'Service Unavailable' };
    if (body.method === 'tools/call' && ++toolCalls <= 2) return { status: 503, body: 'Service Unavailable' };
    return null;
  });
  try {
    const ctx = kiwiContext();
    const legs = await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(150), dateTo: ymdPlus(152), ctx });
    assert.ok(legs.length > 0);
    assert.deepEqual(methods(stub), ['initialize', 'initialize', 'notifications/initialized', 'tools/call', 'tools/call', 'tools/call']);
    assert.deepEqual([ctx.ok, ctx.failed, ctx.retried], [1, 0, 3]);
    assert.equal(kiwiBlocked(), false);
  } finally {
    stub.restore();
  }
});

test('kiwi: 429 se zkusí jen jednou, chyba nástroje (špatný dotaz) vůbec', async () => {
  const stub = scripted((n, body) => (body.method === 'tools/call' ? { status: 429, body: 'slow down' } : null));
  try {
    const ctx = kiwiContext();
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(160), dateTo: ymdPlus(162), ctx }), /429/);
    assert.equal(methods(stub).filter((m) => m === 'tools/call').length, 2, '429 → jen 1 opakování');
  } finally {
    stub.restore();
  }
  const bad = scripted((n, body) => (body.method === 'tools/call' ? { body: { jsonrpc: '2.0', id: body.id, result: { isError: true, content: [{ type: 'text', text: 'invalid flyFrom' }] } } } : null));
  try {
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(163), dateTo: ymdPlus(165) }), /invalid flyFrom/);
    assert.equal(methods(bad).filter((m) => m === 'tools/call').length, 1);
  } finally {
    bad.restore();
  }
});

test('kiwi: zapomenutá session (404 / „session“ v chybě) → nová session a dotaz znovu', async () => {
  let toolCalls = 0;
  const stub = scripted((n, body, init) => {
    if (body.method !== 'tools/call') return null;
    toolCalls++;
    if (toolCalls === 1) return { status: 404, body: 'Session not found' };
    assert.equal(init.headers['mcp-session-id'], 's4', 'druhý pokus s novou session');
    return null;
  });
  try {
    const legs = await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(170), dateTo: ymdPlus(172) });
    assert.ok(legs.length > 0);
    assert.deepEqual(methods(stub), ['initialize', 'notifications/initialized', 'tools/call', 'initialize', 'notifications/initialized', 'tools/call']);
  } finally {
    stub.restore();
  }
});

test('kiwi: opakování respektuje termín hledání (žádná pauza, když už není čas)', async () => {
  const stub = scripted((n, body) => (body.method === 'tools/call' ? { status: 503, body: 'down' } : null));
  try {
    resetKiwi({ retryMs: 2000 });
    const t0 = Date.now();
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(180), dateTo: ymdPlus(182), deadline: Date.now() + 4000 }), /503/);
    assert.equal(methods(stub).filter((m) => m === 'tools/call').length, 1, '2 s pauza + 3 s na dotaz se do 4 s nevejde');
    assert.ok(Date.now() - t0 < 2500);
  } finally {
    stub.restore();
  }
});

test('kiwi.daily: seznam letišť jedním dotazem (flyFrom/flyTo s čárkami), lety ze všech zadaných letišť', async () => {
  const stub = kiwiServer();
  try {
    const legs = await kiwi.daily({ from: ['VIE', 'BTS'], to: ['LIS', 'OPO'], dateFrom: ymdPlus(190), dateTo: ymdPlus(190), directOnly: true });
    const a = stub.calls.map((c) => JSON.parse(c.init.body)).filter((b) => b.method === 'tools/call').map((b) => b.params.arguments);
    assert.equal(a.length, 1);
    assert.equal(a[0].flyFrom, 'VIE,BTS');
    assert.equal(a[0].flyTo, 'LIS,OPO');
    assert.equal(a[0].max_sector_stopovers, 0);
    assert.ok(legs.length > 0 && legs.every((l) => l.from === 'VIE' && !l.stops));
  } finally {
    stub.restore();
  }
});

test('kiwi.daily: po termínu (deadline) už nedotazuje', async () => {
  const stub = kiwiServer();
  try {
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(80), dateTo: ymdPlus(86), deadline: Date.now() - 1 }), /čas/);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('kiwi: změna rozhraní (jiný počet cestujících v odpovědi) → chyba, ne špatné ceny', async () => {
  const stub = kiwiServer({ wrongPax: true });
  try {
    await assert.rejects(kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(90), dateTo: ymdPlus(96), adults: 2 }), /rozhraní/);
  } finally {
    stub.restore();
  }
});

test('kiwi: číslo letu bez zdvojeného kódu aerolinky', async () => {
  const { flightNoOf } = await import('../server/providers/kiwi.js');
  assert.equal(flightNoOf({ carrier: 'FR', flightNumber: 'FR13' }), 'FR 13');
  assert.equal(flightNoOf({ carrier: 'W6', flightNumber: '2347' }), 'W6 2347');
  assert.equal(flightNoOf({ carrier: 'U2', flightNumber: 'U23902' }), 'U2 3902');
});

test('kiwi.daily: jen přímé lety → max_sector_stopovers: 0 už v dotazu', async () => {
  const stub = kiwiServer();
  try {
    await kiwi.daily({ from: 'VIE', to: 'LIS', dateFrom: ymdPlus(100), dateTo: ymdPlus(102), directOnly: true });
    const args = stub.calls.map((c) => JSON.parse(c.init.body)).filter((b) => b.method === 'tools/call').map((b) => b.params.arguments);
    assert.ok(args.length && args.every((a) => a.max_sector_stopovers === 0));
  } finally {
    stub.restore();
  }
});
