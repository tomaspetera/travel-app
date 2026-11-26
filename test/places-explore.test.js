// Hledání místa v Objevuj (geocodeExplore, server/lib/places.js) – nálezy z předstartovní kontroly: ostrov místo
// města, anglické názvy krajů, totéž přírodní místo dvakrát a cizí místa u názvu země. Bez sítě (vlastní seznam míst).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { geocodeExplore, loadPlaces } = await import('../server/lib/places.js');
const { ADMIN1_CS, NATURE } = await import('../server/lib/names.js');
const { haversineKm } = await import('../server/lib/geo.js');

const explore = (q) => geocodeExplore(q, { mapy: false, regions: true });

test('Objevuj: ostrov jako oblast se otevře ve městě letiště, ne ve vnitrozemí ostrova', async () => {
  for (const [q, lat, lon, km] of [['Mallorka', 39.57, 2.65, 15], ['Rhodos', 36.43, 28.22, 10], ['Kréta', 35.34, 25.13, 10]]) {
    const s = (await explore(q))[0];
    assert.ok(s.region, `${q}: oblast`);
    assert.ok(!/^ISLS?$/.test(s.fc || ''), `${q}: ne střed ostrova (${s.label}, ${s.fc})`);
    assert.ok(haversineKm(s.lat, s.lon, lat, lon) <= km, `${q}: ${s.label} ${s.lat},${s.lon} daleko od města`);
  }
});

test('Návrhy míst: české názvy krajů v podtitulku (Kréta, Jižní Egeis, Baleáry), ne anglické', async () => {
  // slovník jen pro kraje, které seznam míst opravdu má anglicky
  const a1 = new Set(loadPlaces().admin1.map((x) => x[1]));
  assert.deepEqual(Object.keys(ADMIN1_CS).filter((k) => !a1.has(k)), []);
  const subs = [];
  for (const q of ['Kréta', 'Rhodos', 'Mallorka', 'Korsika', 'Sardinie', 'Madeira']) subs.push(...(await explore(q)).map((x) => x.sub || ''));
  assert.ok(subs.some((s) => s.includes('Kréta, Řecko')), subs.join(' | '));
  assert.ok(subs.some((s) => s.includes('Jižní Egeis')), subs.join(' | '));
  assert.ok(subs.some((s) => s.includes('Baleáry')), subs.join(' | '));
  for (const en of Object.keys(ADMIN1_CS).filter((k) => k !== ADMIN1_CS[k])) {
    assert.ok(!subs.some((s) => s.includes(en)), `${en} v ${subs.join(' | ')}`);
  }
});

test('Objevuj: přírodní místo jednou – ne ještě jako park, jezero nebo pohoří z GeoNames', async () => {
  for (const [q, cs] of [['Plitvice', 'Plitvická jezera'], ['Plitvická jezera', 'Plitvická jezera'], ['Šumava', 'Šumava'], ['Lago di Garda', 'Gardské jezero'], ['Gardské jezero', 'Gardské jezero']]) {
    const n = NATURE.find((x) => x.cs === cs);
    const list = await explore(q);
    assert.equal(list[0].nature, n.kind, q);
    const twins = list.slice(1).filter((x) => /^(LKS?|PRK|MTS|ISLS?)$/.test(x.fc || '') && haversineKm(n.lat, n.lon, x.lat, x.lon) < 60);
    assert.deepEqual(twins.map((x) => `${x.label} (${x.cc})`), [], q);
  }
  // obec u jezera je jiný cíl a zůstane
  assert.ok((await explore('Garda')).some((x) => x.label === 'Garda' && x.cc === 'IT'));
});

test('Objevuj: celý název země („Island“) – jen místa té země, ne Negros Island nebo Montréal', async () => {
  for (const q of ['Island', 'Iceland']) {
    const list = await explore(q);
    assert.ok(list.length, q);
    assert.deepEqual(list.filter((x) => x.cc !== 'IS').map((x) => x.label), [], q);
  }
});
