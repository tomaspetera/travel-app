// Start pěší túry u hor a přírody (server/lib/bike.js): kandidáti z Wikidat (parkoviště, nádraží, obce), výběr startu
// nejblíž cíli v dosahu okruhu, směr okruhu přes cíl a pěší okruh z nalezeného startu. Bez sítě: Wikidata a BRouter jako
// náhrada fetch, kandidáti ze skutečných odpovědí Wikidat (dotaz trailheadsNear, 10/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';

process.env.BROUTER_GAP_MS = '0';
const { pickTrailhead, trailheadRows, loopDirection, bearingDeg, hikeLoop, mockHikeLoop, TRAILHEAD_KM } = await import('../server/lib/bike.js');
const { haversineKm } = await import('../server/lib/geo.js');

const T = (name, kind, sitelinks, lat, lon) => ({ name, kind, sitelinks, lat, lon });
// Okruh délky km dojde nejdál o průměr kružnice (2 × km / 4,9); start dál od cíle by cíl minul (jako hikeLoop).
const reach = (km, area = 10) => Math.min(area, TRAILHEAD_KM, (0.95 * 2 * km) / 4.9);

// Skuteční kandidáti z Wikidat (zkrácené na nejbližší)
const SNEZKA = { lat: 50.7360, lon: 15.7396 };
const SNEZKA_C = [
  T('Růžohorky', 'town', 1, 50.7110, 15.7500), T('Karpacz', 'town', 45, 50.7667, 15.7500), T('Wilcza Poręba', 'town', 1, 50.7655, 15.7639),
  T('Sagesserovy boudy', 'town', 1, 50.7046, 15.7716), T('Šímovy Chalupy', 'town', 3, 50.7108, 15.7875), T('Pec pod Sněžkou', 'town', 27, 50.6935, 15.7332),
  T('Karpacz', 'station', 4, 50.7824, 15.7618),
];
const BRANA = { lat: 50.8839, lon: 14.2816 };
const BRANA_C = [T('Mezná', 'town', 7, 50.8686, 14.2971), T('Janov', 'town', 27, 50.8603, 14.2654), T('Hřensko', 'town', 29, 50.8745, 14.2426), T('Schöna', 'station', 3, 50.8747, 14.2342)];
const MACOCHA = { lat: 49.3732, lon: 16.7298 };
const MACOCHA_C = [T('Punkevní žleb', 'town', 2, 49.3714, 16.7253), T('Vilémovice', 'town', 24, 49.3638, 16.7468), T('Skalní mlýn', 'town', 3, 49.3637, 16.7082)];
const HALLSTATT = { lat: 47.5622, lon: 13.6487 };
const HALLSTATT_C = [T('Hallstatt', 'town', 1, 47.5625, 13.6485), T('Hallstatt', 'town', 83, 47.5558, 13.6467), T('Bahnhof Hallstatt', 'station', 2, 47.5677, 13.6621)];
const BASTEI = { lat: 50.9618, lon: 14.0720 };
const BASTEI_C = [T('Kurort Rathen (Kr Pirna)', 'station', 0, 50.9567, 14.0753), T('Kurort Rathen', 'station', 2, 50.9567, 14.0756), T('Rathen', 'town', 39, 50.9582, 14.0824)];
const KRKONOSE = { lat: 50.7672, lon: 15.6222 };
const KRKONOSE_C = [T('Bedřichov', 'town', 3, 50.7297, 15.5947), T('Špindlerův Mlýn', 'town', 39, 50.7262, 15.6095)];
const LYSA = { lat: 49.5460, lon: 18.4473 };
const LYSA_C = [T('Zlatník', 'town', 2, 49.5353, 18.4998), T('Ostravice', 'station', 3, 49.5378, 18.3936)];
// vymyšlené: parkoviště o kus dál než vesnice (parkoviště je start túry skoro vždycky)
const LAKE = { lat: 49, lon: 14 };
const LAKE_C = [T('Vesnice', 'town', 5, 49.018, 14), T('Parkoviště u jezera', 'parking', 0, 49, 14.034)];

// [místo, cíl, kandidáti, délka okruhu km, oblast km, očekávaný start (null = střed), proč]
const CASES = [
  ['Sněžka 10 km', SNEZKA, SNEZKA_C, 10, 10, 'Karpacz', 'horské osady s jedním článkem (Růžohorky 2,9 km) ne – nejbližší dostupná obec'],
  ['Sněžka 5 km', SNEZKA, SNEZKA_C, 5, 10, null, 'okruh 5 km by ze 3,5 km Sněžku minul – start na vrcholu jako dřív'],
  ['Sněžka bez polské strany 15 km', SNEZKA, SNEZKA_C.filter((c) => !/Karpacz|Wilcza/.test(c.name)), 15, 10, 'Šímovy Chalupy', 'nejbližší na české straně'],
  ['Pravčická brána', BRANA, BRANA_C, 10, 10, 'Mezná', 'nejbližší obec před většími (Hřensko o 0,9 km dál)'],
  ['Macocha', MACOCHA, MACOCHA_C, 10, 10, null, 'Punkevní žleb 0,4 km – k cíli se dá dojít / dojet, start ve středu'],
  ['Hallstatt', HALLSTATT, HALLSTATT_C, 10, 10, null, 'obec přímo u cíle (i s jedním článkem) – ne nádraží za jezerem'],
  ['Bastei', BASTEI, BASTEI_C, 10, 10, 'Kurort Rathen', 'nádraží před obcí, zdvojená položka bez článku ne'],
  ['Krkonoše 20 km', KRKONOSE, KRKONOSE_C, 20, 20, 'Špindlerův Mlýn', 'známější o 50 m dál před částí obce'],
  ['Krkonoše 10 km', KRKONOSE, KRKONOSE_C, 10, 20, null, '4,6 km je na okruh 10 km daleko'],
  ['Lysá hora 20 km', LYSA, LYSA_C, 20, 10, 'Ostravice', 'nádraží (start túr na Lysou horu) před vesnicí stejně daleko'],
  ['Lysá hora 10 km', LYSA, LYSA_C, 10, 10, null, 'oboje ~4 km – mimo dosah okruhu 10 km'],
  ['parkoviště', LAKE, LAKE_C, 10, 10, 'Parkoviště u jezera', 'parkoviště 2,5 km před vesnicí 2 km'],
  ['nic', LAKE, [], 10, 10, null, 'bez kandidátů start ve středu'],
  ['oblast 10 km', LAKE, [T('Daleko', 'town', 30, 49.08, 14)], 40, 10, null, 'start do 8 km (dotaz), i když by okruh 40 km došel dál'],
];

test('start túry: nejbližší parkoviště, nádraží nebo obec v dosahu okruhu; u cíle samotného a mimo dosah střed (Wikidata 10/2026)', () => {
  const bad = [];
  for (const [label, target, cands, km, area, want, why] of CASES) {
    const th = pickTrailhead(cands, target, { maxKm: reach(km, area) });
    if ((th ? th.name : null) !== want) bad.push(`${label}: ${th ? th.name : '—'} ≠ ${want ?? '—'} (${why})`);
  }
  assert.deepEqual(bad, []);
  const k = pickTrailhead(SNEZKA_C, SNEZKA, { maxKm: reach(10) });
  assert.deepEqual(k, { name: 'Karpacz', kind: 'town', lat: 50.7667, lon: 15.75, km: 3.5 });
  // nesmyslné položky nic nerozbijí
  assert.equal(pickTrailhead([{ name: 'X', kind: 'hut', sitelinks: 9, lat: 49.01, lon: 14 }, { name: '', kind: 'town', sitelinks: 9, lat: 49.01, lon: 14 },
    { name: 'Y', kind: 'town', sitelinks: 9, lat: NaN, lon: 14 }, null], LAKE, { maxKm: 5 }), null);
  assert.equal(pickTrailhead(null, LAKE, { maxKm: 5 }), null);
});

test('kandidáti z odpovědi Wikidat: jedna položka jednou (druh parkoviště > nádraží > obec), bez názvu „Q123“ a bez polohy ne', () => {
  const b = (id, label, lon, lat, sl, t) => ({ item: { value: `http://www.wikidata.org/entity/${id}` }, itemLabel: { value: label },
    coord: { value: `Point(${lon} ${lat})` }, sl: { value: String(sl) }, t: { value: `http://www.wikidata.org/entity/${t}` } });
  const rows = [
    b('Q606126', 'Karpacz', 15.75, 50.766666666, 45, 'Q3957'), b('Q606126', 'Karpacz', 15.75, 50.766666666, 45, 'Q15284'),
    b('Q659618', 'Karpacz', 15.761839, 50.782428, 4, 'Q55488'),
    b('Q1', 'Obec s nádražím', 15.7, 50.7, 3, 'Q532'), b('Q1', 'Obec s nádražím', 15.7, 50.7, 3, 'Q55678'),
    b('Q2', 'Parkoviště', 15.71, 50.71, 0, 'Q6501349'), b('Q2', 'Parkoviště', 15.71, 50.71, 0, 'Q486972'),
    b('Q3', 'Q3', 15.72, 50.72, 1, 'Q532'), { ...b('Q4', 'Bez polohy', 0, 0, 1, 'Q532'), coord: { value: 'nic' } },
  ];
  assert.deepEqual(trailheadRows(rows), [
    { id: 'Q606126', name: 'Karpacz', kind: 'town', lat: 50.766666666, lon: 15.75, sitelinks: 45 },
    { id: 'Q659618', name: 'Karpacz', kind: 'station', lat: 50.782428, lon: 15.761839, sitelinks: 4 },
    { id: 'Q1', name: 'Obec s nádražím', kind: 'station', lat: 50.7, lon: 15.7, sitelinks: 3 },
    { id: 'Q2', name: 'Parkoviště', kind: 'parking', lat: 50.71, lon: 15.71, sitelinks: 0 },
  ]);
  assert.deepEqual(trailheadRows([]), []);
});

test('směr okruhu: varianty po 72° jako dřív; s cílem varianty 0 a 1 přes cíl z obou stran (start i cíl na kružnici)', () => {
  assert.deepEqual([0, 1, 4, 5, 9].map((v) => loopDirection(v)), [30, 102, 318, 66, 354]);
  // cíl 3,5 km na sever, poloměr 2,04 km: úhel od směru k cíli acos(3,5 / 4,08) ≈ 31°
  assert.deepEqual([loopDirection(0, { bearing: 0, km: 3.5 }, 2.04), loopDirection(1, { bearing: 0, km: 3.5 }, 2.04)], [31, 329]);
  assert.equal(loopDirection(0, { bearing: 350, km: 3.5 }, 2.04), 21, 'přes 360°');
  assert.equal(loopDirection(0, { bearing: 120, km: 5 }, 2), 120, 'cíl dál než průměr kružnice – rovnou k němu');
  assert.equal(loopDirection(2, { bearing: 120, km: 3 }, 2), 174, 'další varianty jako bez cíle');
  // kružnice ze směru: střed o R ve směru okruhu, cíl na ní
  for (const v of [0, 1]) {
    const d = (loopDirection(v, { bearing: 0, km: 3.5 }, 2.04) * Math.PI) / 180;
    assert.ok(Math.abs(Math.hypot(2.04 * Math.sin(d), 3.5 - 2.04 * Math.cos(d)) - 2.04) < 0.03, `varianta ${v}`);
  }
  assert.equal(Math.round(bearingDeg({ lat: 50, lon: 15 }, { lat: 50.01, lon: 15 })), 0);
  assert.equal(Math.round(bearingDeg({ lat: 50, lon: 15 }, { lat: 50, lon: 15.01 })), 90);
  assert.equal(Math.round(bearingDeg({ lat: 50, lon: 15 }, { lat: 49.99, lon: 15 })), 180);
});

// Odpověď Wikidat pro trailheadsNear ze seznamu kandidátů
const wdqs = (list) => ({ results: { bindings: list.map((c, i) => ({
  item: { value: `http://www.wikidata.org/entity/Q${900 + i}` }, itemLabel: { value: c.name }, coord: { value: `Point(${c.lon} ${c.lat})` },
  sl: { value: String(c.sitelinks) }, t: { value: `http://www.wikidata.org/entity/${{ town: 'Q532', station: 'Q55488', parking: 'Q6501349' }[c.kind]}` },
})) } });
// BRouter: kruh 10 km ze startu (lonlats) směrem k cíli
function brouterAt(url, km = 10) {
  const [lon, lat] = new URL(url).searchParams.get('lonlats').split(',').map(Number);
  const r = km / (2 * Math.PI);
  const coords = Array.from({ length: 101 }, (_, i) => {
    const a = (i / 100) * 2 * Math.PI;
    return [lon + (r / 71.5) * Math.sin(a), lat + (r / 111.2) * (1 - Math.cos(a)), 500];
  });
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { 'track-length': String(km * 1000), 'filtered ascend': '400', 'total-time': '9000', messages: [] }, geometry: { type: 'LineString', coordinates: coords } }] };
}

test('pěší okruh u hor (area): start v obci u cíle, okruh přes cíl, ve výsledku start túry; bez area Wikidata ne', async () => {
  const stub = stubFetch((url) => (url.startsWith('https://query.wikidata.org/') ? { body: wdqs(SNEZKA_C) } : { body: brouterAt(url) }));
  try {
    const r = await hikeLoop({ ...SNEZKA, km: 10, area: 10, scenery: 'nature' });
    const wd = stub.calls.filter((c) => c.url.startsWith('https://query.wikidata.org/'));
    assert.equal(wd.length, 1);
    const sparql = decodeURIComponent(wd[0].url);
    assert.match(sparql, /wikibase:radius "8"/);
    assert.match(sparql, /Point\(15\.740 50\.736\)/);
    assert.match(sparql, /wd:Q6501349/, 'i parkoviště');
    const br = new URL(stub.calls.find((c) => c.url.includes('brouter')).url);
    assert.equal(br.searchParams.get('lonlats'), '15.75,50.7667', 'okruh z Karpacze');
    const aim = { bearing: bearingDeg({ lat: 50.7667, lon: 15.75 }, SNEZKA), km: 3.5 };
    assert.equal(Number(br.searchParams.get('direction')), loopDirection(0, aim, Number(br.searchParams.get('roundTripDistance')) / 1000));
    assert.ok(Math.abs(Number(br.searchParams.get('direction')) - 180) < 60, 'na jih ke Sněžce');
    assert.deepEqual(r.start, { lon: 15.75, lat: 50.7667 });
    assert.deepEqual({ ...r.trailhead, miss: undefined }, { name: 'Karpacz', kind: 'town', lat: 50.7667, lon: 15.75, km: 3.5, miss: undefined });
    assert.ok(r.trailhead.miss >= 0 && Number.isFinite(r.trailhead.miss));
    assert.match(r.mapyUrl, /start=15\.75000%2C50\.76670/);
    // druhá varianta: druhá strana kružnice, kandidáti z mezipaměti (bez dalšího dotazu na Wikidata)
    const r1 = await hikeLoop({ ...SNEZKA, km: 10, area: 10, variant: 1 });
    assert.equal(stub.calls.filter((c) => c.url.startsWith('https://query.wikidata.org/')).length, 1);
    assert.equal(r1.trailhead.name, 'Karpacz');
    // město (bez area): start ve středu, Wikidata se neptá
    const n = stub.calls.length;
    const c = await hikeLoop({ lat: 50.0875, lon: 14.4213, km: 10 });
    assert.equal(c.trailhead, undefined);
    assert.deepEqual(c.start, { lon: 14.4213, lat: 50.0875 });
    assert.ok(!stub.calls.slice(n).some((x) => x.url.startsWith('https://query.wikidata.org/')));
  } finally {
    stub.restore();
  }
});

test('pěší okruh u hor: Wikidata neodpoví nebo nic blízko → start ve středu jako dřív; limit dotazů platí', async () => {
  const stub = stubFetch((url) => (url.startsWith('https://query.wikidata.org/') ? { status: 500, body: 'down' } : { body: brouterAt(url) }));
  try {
    const r = await hikeLoop({ lat: 49.1, lon: 16.1, km: 10, area: 20 });
    assert.equal(r.trailhead, undefined);
    assert.deepEqual(r.start, { lon: 16.1, lat: 49.1 });
    // limit (onMiss) u dotazu mimo mezipaměť se neschová za „start ve středu“
    const limit = () => { throw Object.assign(new Error('limit'), { code: 'LIMIT' }); };
    await assert.rejects(hikeLoop({ lat: 49.2, lon: 16.2, km: 10, area: 10, onMiss: limit }), (e) => e.code === 'LIMIT');
  } finally {
    stub.restore();
  }
  const far = stubFetch((url) => (url.startsWith('https://query.wikidata.org/') ? { body: wdqs([T('Daleko', 'town', 9, 49.37, 16.3)]) } : { body: brouterAt(url) }));
  try {
    const r = await hikeLoop({ lat: 49.3, lon: 16.3, km: 8, area: 10 });
    assert.equal(r.trailhead, undefined, '7,8 km je na okruh 8 km daleko');
    assert.deepEqual(r.start, { lon: 16.3, lat: 49.3 });
  } finally {
    far.restore();
  }
});

test('DEMO: u hor vymyšlené parkoviště, kruh z něj dojde k cíli; město beze změny', () => {
  const h = mockHikeLoop({ ...SNEZKA, km: 10, area: 10 });
  assert.equal(h.trailhead.name, 'Demo parkoviště');
  assert.equal(h.trailhead.kind, 'parking');
  assert.ok(h.start.lat < SNEZKA.lat, 'jižně od cíle');
  assert.ok(Math.abs(haversineKm(h.start.lat, h.start.lon, SNEZKA.lat, SNEZKA.lon) - h.trailhead.km) < 0.1);
  assert.ok(h.trailhead.miss <= 0.2, 'kruh vede přes cíl');
  assert.deepEqual(h.geometry[0].slice(0, 2), [h.start.lon, h.start.lat]);
  assert.equal(mockHikeLoop({ ...SNEZKA, km: 10 }).trailhead, undefined);
});
