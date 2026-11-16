import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRegion, inRegion, keepInRegion } from '../server/lib/regions.js';

// kandidáti okruhu „po Toskánsku“ z kruhu 120 km kolem Florencie (round-6: Ravenna, Rimini, San Marino, Urbino, Perugia, Trasimeno)
const P = (id, lat, lon) => ({ id, name: id, lat, lon, score: 70 });
const IN = [P('siena', 43.3188, 11.3308), P('pisa', 43.7228, 10.4017), P('lucca', 43.8429, 10.5027), P('sangimignano', 43.4677, 11.0432),
  P('volterra', 43.4011, 10.8605), P('arezzo', 43.4633, 11.8796), P('cortona', 43.2756, 11.9853), P('montepulciano', 43.0925, 11.7808)];
const OUT = [P('ravenna', 44.4184, 12.2035), P('rimini', 44.0678, 12.5695), P('sanmarino', 43.9424, 12.4578), P('urbino', 43.7262, 12.6365),
  P('perugia', 43.1107, 12.3908), P('trasimeno', 43.1333, 12.1), P('bologna', 44.4949, 11.3426)];

test('inRegion: Toskánsko podle hranice, ne podle obdélníku (Ravenna a Trasimeno v něm leží)', () => {
  assert.ok(hasRegion('toskansko'));
  for (const c of IN) assert.equal(inRegion('toskansko', c.lat, c.lon), true, c.id);
  for (const c of OUT) assert.equal(inRegion('toskansko', c.lat, c.lon), false, c.id);
  assert.equal(inRegion('kreta', 35.3, 25.1), null); // ostrov bez hranice v datech
  assert.equal(inRegion('istrie', 45.0812, 13.6387), true); // Rovinj
  assert.equal(inRegion('istrie', 45.6495, 13.7768), false); // Terst
  assert.equal(inRegion('istrie', 45.528, 13.568), true); // Piran – slovinská Istrie patří k okruhu
  assert.equal(inRegion('istrie', 45.327, 14.442), false); // Rijeka
});

test('inRegion: místa na pobřeží těsně za zjednodušenou hranicí patří k oblasti, sousední města ne', () => {
  for (const [key, id, lat, lon] of [['apulie', 'polignano', 40.9958, 17.2186], ['apulie', 'leuca', 39.7959, 18.3594], ['algarve', 'benagil', 37.0874, -8.4258],
    ['toskansko', 'portoferraio', 42.8131, 10.3133], ['normandie', 'mont-saint-michel', 48.636, -1.511], ['normandie', 'honfleur', 49.4194, 0.2333],
    ['normandie', 'giverny', 49.0758, 1.5339], ['provence', 'gordes', 43.9116, 5.2001], ['provence', 'saintes-maries', 43.4519, 4.4286],
    ['provence', 'cassis', 43.2147, 5.5378], ['goa', 'palolem', 15.01, 74.0232], ['goa', 'fort-aguada', 15.4925, 73.7736]]) assert.equal(inRegion(key, lat, lon), true, id);
  for (const [key, id, lat, lon] of [['normandie', 'rennes', 48.1173, -1.6778], ['normandie', 'saint-malo', 48.6493, -2.0257], ['normandie', 'pariz', 48.8566, 2.3522],
    ['provence', 'nice', 43.7102, 7.262], ['provence', 'nimes', 43.8367, 4.3601], ['goa', 'belgaum', 15.8497, 74.4977]]) assert.equal(inRegion(key, lat, lon), false, id);
});

test('keepInRegion: jen cíle v oblasti, připnuté vždy, příznaky pole zůstanou; málo cílů → kruh', () => {
  const all = Object.assign([...IN, ...OUT], { natureLoading: true, descFailed: true });
  const kept = keepInRegion(all, 'toskansko', { min: 6, keep: (c) => c.id === 'perugia' });
  assert.deepEqual(kept.map((c) => c.id), [...IN.map((c) => c.id), 'perugia']);
  assert.equal(kept.natureLoading, true);
  assert.equal(kept.descFailed, true);
  // jen 2 cíle uvnitř – okruh by se zkrátil, zůstane původní kruh
  const few = [...IN.slice(0, 2), ...OUT];
  assert.equal(keepInRegion(few, 'toskansko', { min: 6 }), few);
  // neznámá oblast nebo žádná → beze změny
  assert.equal(keepInRegion(all, 'kreta'), all);
  assert.equal(keepInRegion(all, undefined), all);
});
