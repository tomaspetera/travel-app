// GET /api/fuel přes HTTP v DEMO režimu: ceny nafty a benzínu po zemích + zdroje, bez sítě.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('GET /api/fuel: ceny po zemích (Kč/l), zdroj, datum, výchozí nafta', async () => {
  const r = await fetch(`${base}/api/fuel`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /max-age=3600/);
  const j = await r.json();
  assert.equal(j.demo, true);
  for (const cc of ['CZ', 'DE', 'AT', 'SK', 'PL', 'HU']) {
    assert.ok(j[cc].diesel > 30 && j[cc].diesel < 80, cc);
    assert.ok(j[cc].petrol > 30 && j[cc].petrol < 80, cc);
    assert.match(j[cc].date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(j[cc].source, 'demo');
  }
  assert.equal(j.CZ.diesel, 50.65);
  assert.equal(j.defaultFuel, 'diesel');
  assert.deepEqual(j.lPer100, { diesel: 6, petrol: 7 });
  assert.equal(j.updated, null);
  assert.ok(Array.isArray(j.sources) && j.sources.length >= 1);
});
