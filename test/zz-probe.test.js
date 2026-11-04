// Návrh trasy s odletem z jiného města (open-jaw Řím → Neapol): začíná městem příletu, končí městem odletu a noci sedí.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestRoute } from '../server/lib/stayplan.js';

test('suggestRoute: open-jaw Řím → Neapol – město příletu první, město odletu poslední, součet nocí sedí', () => {
  const A = { id: 'rome', name: 'Řím', lat: 41.9, lon: 12.5, cc: 'IT' };
  const D = { id: 'nap', name: 'Neapol', lat: 40.85, lon: 14.27, cc: 'IT' };
  const cands = [
    { id: 'c1', name: 'Salerno', lat: 40.68, lon: 14.77, score: 90, cc: 'IT' },
    { id: 'c2', name: 'Caserta', lat: 41.07, lon: 14.33, score: 40, cc: 'IT' },
    { id: 'c3', name: 'Orvieto', lat: 42.72, lon: 12.11, score: 50, cc: 'IT' },
    { id: 'c5', name: 'Gaeta', lat: 41.21, lon: 13.57, score: 60, cc: 'IT' },
  ];
  for (const nights of [3, 5, 7, 9]) {
    const r = suggestRoute(cands, { arrival: A, departureCity: D, depAirport: { iata: 'NAP', lat: 40.88, lon: 14.29 }, nights, transport: 'car', times: (a, b) => ({ carMin: 60, transitMin: 60 }) });
    assert.equal(r.bases[0].anchor, 'arrival');
    assert.equal(r.bases.at(-1).anchor, 'departure', `${nights} nocí`);
    assert.equal(r.bases.reduce((s, b) => s + b.nights, 0), nights);
    assert.ok(r.bases.every((b) => b.nights >= 1));
  }
});
