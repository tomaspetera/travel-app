// GET /api/fuel přes HTTP v DEMO režimu: ceny nafty a benzínu po zemích + zdroje a ceník nabíjení elektroauta, bez sítě.
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

test('GET /api/fuel: elektroauto – odhad nabíjení DC s datem a ceníky provozovatelů (stav 6. 10. 2026)', async () => {
  const { ev } = await (await fetch(`${base}/api/fuel`)).json();
  assert.equal(ev.default, 16);
  assert.deepEqual(ev.range, [13, 22]);
  assert.equal(ev.date, '2026-10-06');
  assert.equal(ev.kwhPer100, 19);
  assert.equal(ev.label, 'nabíjení DC ~16 Kč/kWh (ceníky ČEZ, PRE, E.ON, IONITY, Tesla – stav 6. 10. 2026)');
  assert.deepEqual(ev.operators.map((o) => o.text), [
    'ČEZ 16,90 (AC) / 22,90 (DC)', 'PRE 13 (AC) / 15 (DC)', 'E.ON 10,50–20', 'IONITY 21 (DC)', 'Shell Recharge 15 *',
    'MOL Plugee 14,50 (AC) / 15,50 (DC) *', 'Tesla Supercharger 8–14 (DC, pro auta jiných značek) *',
  ]);
  const by = Object.fromEntries(ev.operators.map((o) => [o.name, o]));
  assert.deepEqual([by['ČEZ'].ac, by['ČEZ'].dc, by.PRE.dc, by['E.ON'].price, by.IONITY.dc, by['Tesla Supercharger'].dc], [16.9, 22.9, 15, [10.5, 20], 21, [8, 14]]);
  assert.deepEqual(ev.operators.filter((o) => o.secondary).map((o) => o.name), ['Shell Recharge', 'MOL Plugee', 'Tesla Supercharger'], 'ze sekundárních zdrojů');
  // odhad v rozpětí DC cen provozovatelů
  const dc = ev.operators.flatMap((o) => [o.dc, o.price].flat()).filter((x) => x != null);
  assert.ok(ev.default >= ev.range[0] && ev.default <= ev.range[1] && Math.min(...dc) <= ev.range[0] && Math.max(...dc) >= ev.range[1]);
});
