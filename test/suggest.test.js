// Našeptávač míst: přesná shoda, velikost místa, vzdálenost od domova, město „a letiště v okolí“, geokódování (Open-Meteo)
// jen jako doplněk bez vzdálených jmenovců a vesnic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import { config } from '../server/config.js';

const { suggest, localSuggestions, resolveOrigins, resolveDestinations, homePoint } = await import('../server/lib/places.js');
const place = (name, latitude, longitude, country_code, population, admin1 = '', feature_code = 'PPL') => ({ id: Math.round(latitude * 1000), name, latitude, longitude, country_code, country: country_code, admin1, population, feature_code });
const ids = (list) => list.map((s) => s.id.split('|')[0]);
const BRNO = 'geo:49.1952,16.6080';

test('suggest: „Toledo“ najde i Toledo ve Španělsku (bližší než Ohio), „Brno“ = město a letiště, bez vesnic a jmenovců', async () => {
  const mock = config.mock;
  config.mock = false;
  const stub = stubFetch((url) => {
    const q = new URL(url).searchParams.get('name');
    if (q === 'Toledo') return { body: { results: [place('Toledo', 39.8628, -4.0273, 'ES', 85000, 'Kastilie-La Mancha', 'PPLA'), place('Toledo', 41.6639, -83.5552, 'US', 270000, 'Ohio'), place('Toledo', 10.37, 123.64, 'PH', 1200)] } };
    // skutečné pořadí Open-Meteo pro „Brno“ (10. 10. 2026)
    if (q === 'Brno') return { body: { results: [place('Brno', 49.1952, 16.608, 'CZ', 379466, 'Jihomoravský', 'PPLA'), place('Bruno', 41.2839, -96.9586, 'US', 96, 'Nebraska'), place('Brno', 49.8233, 13.6654, 'CZ', 0, 'Plzeňský kraj', 'MT'), place('Brňov', 49.4373, 17.9871, 'CZ', 0, 'Zlínský'), place('Brno-střed', 49.1934, 16.6071, 'CZ', 86685, 'Jihomoravský'), place('Brno-jih', 49.1745, 16.6228, 'CZ', 7594, 'Jihomoravský')] } };
    if (q === 'Zli') return { body: { results: [place('Winterthur', 47.5056, 8.7241, 'CH', 111840), place('Zli', 19.5431, -12.7767, 'MR', 0), place('Zlitán', 32.4674, 14.5687, 'LY', 203790), place('Zlín', 49.2264, 17.6706, 'CZ', 72973, 'Zlínský', 'PPLA')] } };
    return { body: { results: [] } };
  });
  try {
    const t = await suggest('Toledo');
    assert.equal(t[0].cc, 'ES', 'Toledo ve Španělsku první (nejblíž domovu)');
    assert.equal(t[0].type, 'city');
    assert.equal(t.filter((s) => s.cc === 'PH').length, 0, 'malé Toledo na Filipínách ne');
    assert.ok(t.some((s) => s.id === 'ap:TOL'), 'letiště Toledo (USA) zůstává');
    assert.deepEqual(ids(await suggest('Brno')), ['ap:BRQ', BRNO], 'Kam: letiště, pak město; Bruno, hora, Brňov a čtvrti pryč');
    assert.deepEqual(ids(await suggest('Brno', { role: 'from' })), [BRNO, 'ap:BRQ'], 'Odkud: město (okruh letišť) první');
    const z = await suggest('Zli', { role: 'from', near: 'ap:BRQ' });
    assert.equal(z[0].label, 'Zlín');
    assert.ok(!z.some((s) => /Winterthur|^Zli$/.test(s.label)), 'fuzzy shoda a vesnice v Mauritánii pryč');
  } finally {
    stub.restore();
    config.mock = mock;
  }
});

test('localSuggestions: začátek názvu před kódem letiště, velké a blízké první, vzdálené drobnosti pryč', () => {
  const L = (q, o) => ids(localSuggestions(q, 8, o));
  assert.deepEqual(L('Pra').slice(0, 2), ['ap:PRG', 'geo:50.0880,14.4208'], '„Pra“ = Praha, ne Paraná (PRA)');
  assert.equal(L('PRA')[0], 'ap:PRA', 'kód velkými písmeny = letiště');
  assert.equal(L('USA')[0], 'cc:US', 'USA = země, ne letiště Concord');
  assert.equal(L('Ost')[0], 'ap:OSR', 'Ostrava před Ostende (OST)');
  assert.ok(!L('Ost').some((x) => x.startsWith('rg:') || x.startsWith('cc:')), '„Ost“ ≠ ostrovy');
  assert.equal(L('Bang')[0], 'metro:BKK');
  assert.ok(!L('Bang').some((x) => x === 'ap:FKI' || x === 'ap:LBP'), 'Kisangani (BANGoka) ani Long Banga');
  assert.ok(!L('Lond').includes('ap:LNV'), 'Londolovit (Papua) ne');
  assert.ok(!L('Londýn').includes('ap:YXU'), 'London v Kanadě ne');
  assert.equal(L('Br', { home: homePoint('ap:BRQ'), role: 'from' }).indexOf(BRNO) < 6, true, 'z Brna je Brno mezi prvními');
});

test('město „a letiště v okolí“: Odkud = okruh ze středu, Kam = vlastní + velká blízká letiště', () => {
  const brno = localSuggestions('Brno', 8, { role: 'from' })[0];
  assert.equal(brno.type, 'city');
  assert.match(brno.sub, /BRQ, VIE, BTS/);
  const o = resolveOrigins([brno.id], { radiusKm: 200 }).airports.map((a) => a.iata);
  for (const c of ['BRQ', 'VIE', 'BTS', 'PRG']) assert.ok(o.includes(c), c);
  assert.deepEqual(resolveDestinations([brno.id]).airports, ['BRQ', 'VIE', 'BTS', 'OSR'], 'ne Pardubice před Vídní');
  assert.equal(resolveDestinations([brno.id]).label, 'Brno');
});
