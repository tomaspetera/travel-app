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

test('suggest: kódy letišť malými, cizí názvy měst, malá turistická místa, země bez letiště, okruh 0 u města', async () => {
  // kód psaný malými nebo s velkým prvním písmenem (klávesnice telefonu) letiště nesmí schovat
  for (const [q, id] of [['boj', 'ap:BOJ'], ['Boj', 'ap:BOJ'], ['mah', 'ap:MAH'], ['tia', 'ap:TIA'], ['cia', 'ap:CIA'], ['gro', 'ap:GRO'], ['bod', 'ap:BOD']]) {
    assert.equal(localSuggestions(q, 8)[0].id, id, q);
  }
  assert.ok(localSuggestions('bri', 8).some((s) => s.id === 'ap:BRI'), 'bri = Bari');
  assert.deepEqual(ids(localSuggestions('nyc', 3)), ['metro:NYC']);
  assert.deepEqual(ids(localSuggestions('bcn', 2)), ['ap:BCN', 'metro:BCN'], 'letiště podle kódu před metropolí');
  // země bez letiště jen při přesné shodě
  assert.notEqual(localSuggestions('An', 3)[0].id, 'cc:AD');
  assert.notEqual(localSuggestions('Pal', 3)[0].id, 'cc:PS');
  assert.equal(localSuggestions('Monako', 3)[0].id, 'cc:MC');
  // země a velká letiště shodou slova uvnitř názvu
  assert.ok(localSuggestions('Lanka', 8).some((s) => s.id === 'cc:LK'));
  assert.ok(localSuggestions('Cana', 8).some((s) => s.id === 'ap:LPA'));
  assert.equal(localSuggestions('Wrocław', 3)[0].id, 'ap:WRO');
  // dvojice město + letiště zůstane na vyšším místě: v Odkud z Brna je Brno první
  assert.equal(localSuggestions('Br', 8, { home: homePoint('ap:BRQ'), role: 'from' })[0].id.split('|')[0], BRNO);
  // okruh 0 u města: jeho letiště, ne druhé vzdálené
  const og = (id, r) => resolveOrigins([id], { radiusKm: r }).airports.map((a) => a.iata);
  assert.deepEqual(og('geo:49.1952,16.6080|Brno', 0), ['BRQ']);
  assert.deepEqual(og('geo:48.1374,11.5755|Mnichov', 25), ['MUC']);
  assert.equal(og('geo:49.2265,17.6707|Zlín', 0).length, 2, 'město bez letiště: dvě nejbližší');

  const mock = config.mock;
  config.mock = false;
  // skutečné odpovědi Open-Meteo (language=cs, 10. 10. 2026)
  const R = {
    Munchen: [place('Mnichov', 48.1374, 11.5755, 'DE', 1260391, 'Bavorsko', 'PPLA'), place('München', 51.607, 13.3124, 'DE', 0, 'Braniborsko'), place('München', 48.6967, 13.4631, 'DE', 0, 'Bavorsko'), place('Münchendorf', 48.0333, 16.3833, 'AT', 2992, 'Dolní Rakousy', 'PPLA3')],
    Koln: [place('Kolín nad Rýnem', 50.9333, 6.95, 'DE', 963395, 'Severní Porýní-Vestfálsko', 'PPLA2'), place('Kolno', 53.4115, 21.9291, 'PL', 10659, 'Podleské vojvodství'), place('Kolno', 53.9969, 20.9947, 'PL', 590)],
    Beograd: [place('Bělehrad', 44.804, 20.4651, 'RS', 1273651, 'Central Serbia', 'PPLC')],
    Salzburg: [place('Salzburg', 47.7994, 13.044, 'AT', 157245, 'Salcbursko', 'PPLA'), place('Salzburg', 50.6667, 8.05, 'DE', 238, 'Porýní-Falc', 'PPLA4')],
    Portofino: [place('Portofino', 44.3035, 9.2094, 'IT', 406, 'Ligurie', 'PPLA3'), place('Portofino Vetta', 44.3343, 9.1715, 'IT', 0, 'Ligurie')],
    Plitvice: [place('Plitvica', 46.672, 15.9237, 'SI', 106, 'Občina Apače'), place('Plitvica Selo', 44.8994, 15.5979, 'HR', 48), place('Plitvice Lakes National Park', 44.85, 15.6167, 'HR', 0, 'Lika-Senj County', 'PRK')],
    'Agia Napa': [place('Ayia Napa', 34.9821, 34.0018, 'CY', 4717, 'Famagusta'), place('Agia Napa', 34.6757, 33.046, 'CY', 0, 'Distrikt Lemesos')],
  };
  const stub = stubFetch((url) => ({ body: { results: R[new URL(url).searchParams.get('name')] || [] } }));
  try {
    const first = async (q) => (await suggest(q))[0]?.label;
    assert.equal(await first('Munchen'), 'Mnichov', 'cizí název → české jméno velkého města');
    assert.equal(await first('Koln'), 'Kolín nad Rýnem');
    assert.equal(await first('Beograd'), 'Bělehrad');
    assert.equal(await first('Agia Napa'), 'Ayia Napa', 'liší se jedním písmenem');
    const sz = await suggest('Salzburg');
    assert.equal(sz.filter((s) => s.type === 'city').length, 1, 'Salcburk jen jednou (anglický název = duplikát)');
    assert.ok((await suggest('Portofino')).some((s) => s.label === 'Portofino'), 'malé turistické místo, když nic jiného nesedí');
    const pl = (await suggest('Plitvice')).map((s) => s.label);
    assert.ok(pl.includes('Plitvice Lakes National Park') && !pl.includes('Plitvica'), pl.join(', '));
  } finally {
    stub.restore();
    config.mock = mock;
  }
});
