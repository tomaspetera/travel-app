// Našeptávač míst: přesná shoda s místem z databáze + geokódování (Open-Meteo) jen stejnojmenná větší města.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import { config } from '../server/config.js';

const { suggest } = await import('../server/lib/places.js');
const place = (name, latitude, longitude, country_code, population, admin1 = '') => ({ id: Math.round(latitude * 1000), name, latitude, longitude, country_code, country: country_code, admin1, population });

test('suggest: „Toledo“ najde i Toledo ve Španělsku (letiště jen v USA a Brazílii), „Brno“ bez vesnic a jmenovců', async () => {
  const mock = config.mock;
  config.mock = false;
  const stub = stubFetch((url) => {
    const q = new URL(url).searchParams.get('name');
    if (q === 'Toledo') return { body: { results: [place('Toledo', 39.8628, -4.0273, 'ES', 85000, 'Kastilie-La Mancha'), place('Toledo', 41.6639, -83.5552, 'US', 270000, 'Ohio'), place('Toledo', 10.37, 123.64, 'PH', 1200)] } };
    if (q === 'Brno') return { body: { results: [place('Brno', 49.1952, 16.608, 'CZ', 379000), place('Brno', 49.65, 13.38, 'CZ', 150, 'Plzeňský kraj'), place('Bruno', 41.28, -96.97, 'US', 109000, 'Nebraska')] } };
    return { body: { results: [] } };
  });
  try {
    const t = await suggest('Toledo');
    const es = t.find((s) => s.cc === 'ES');
    assert.ok(es && es.type === 'place', 'Toledo, Španělsko');
    assert.equal(t.filter((s) => s.cc === 'PH').length, 0, 'malé Toledo na Filipínách ne');
    assert.equal(t[0].type, 'airport', 'letiště z databáze první');
    const b = await suggest('Brno');
    assert.deepEqual(b.map((s) => s.id), ['ap:BRQ'], 'Brno = letiště; město Brno je jeho duplikát, vesnice a Bruno pryč');
  } finally {
    stub.restore();
    config.mock = mock;
  }
});
