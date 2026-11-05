// Návrh trasy (server/lib/stayplan.js, DEMO bez sítě): noci míst dají vždy celý pobyt – jedno letiště, open-jaw,
// let jen tam, druhé letiště téhož města; každé místo aspoň 1 noc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStay } from '../server/lib/stayplan.js';
process.env.FUEL_LIVE = '0';

test('stayplan: součet nocí návrhu sedí s délkou pobytu (i open-jaw a let jen tam)', async () => {
  for (const [a, d] of [['FCO', 'FCO'], ['MXP', 'FCO'], ['FCO', null], ['LIS', 'OPO'], ['FCO', 'CIA']]) {
    for (const n of [1, 2, 5, 9, 30]) {
      const r = await planStay({ arrival: a, departure: d, nights: n, transport: n % 2 ? 'car' : 'transit' }, { mock: true });
      assert.equal(r.bases.reduce((s, b) => s + b.nights, 0), n, `${a}→${d} ${n} nocí`);
      assert.ok(r.bases.every((b) => b.nights >= 1), `${a}→${d} ${n} nocí`);
    }
  }
});
