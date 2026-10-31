// Let tam, který už odletěl nebo odlétá do 2 h (místní čas letiště odletu), výpis nenabízí – koupit nejde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { departedSoon } from '../server/lib/search.js';

test('departedSoon: odletěl nebo odlétá do 2 h (čas letiště odletu) → pryč; bez času, neznámé letiště a zítřek ne', () => {
  const now = Date.parse('2026-10-31T17:00:00Z'); // 18:00 v Praze, 17:00 v Lisabonu
  const leg = (from, dep, hasTime = true) => ({ from, dep, hasTime });
  const g = (l) => departedSoon(l, { now });
  assert.equal(g(leg('PRG', '2026-10-31T16:00:00')), true, 'ráno odletěl');
  assert.equal(g(leg('PRG', '2026-10-31T19:30:00')), true, 'za 1,5 h – nestihneš');
  assert.equal(g(leg('PRG', '2026-10-31T20:30:00')), false);
  assert.equal(g(leg('LIS', '2026-10-31T18:30:00')), true, 'Lisabon má o hodinu méně: 18:30 je za 1,5 h');
  assert.equal(g(leg('LIS', '2026-10-31T19:30:00')), false);
  assert.equal(g(leg('PRG', '2026-10-31T00:00:00', false)), false, 'bez času letu nic');
  assert.equal(g(leg('XXX', '2026-10-31T10:00:00')), false, 'neznámé letiště nic');
  assert.equal(g(leg('PRG', '2026-11-01T06:00:00')), false);
  assert.equal(g(null), false);
});
