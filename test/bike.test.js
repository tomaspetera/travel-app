// Výlety na kole: souhrn trasy z BRouteru (povrch, cyklostezky), odkazy do Mapy.com a Google Map,
// profil podle kola a krajiny, okruh dané délky (s korekcí), okruh městem přes památky.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';

process.env.BROUTER_GAP_MS = '0';
const { parseRoute, profileVars, mapyUrl, googleUrl, pickSights, bikeLoop, mockBikeLoop } = await import('../server/lib/bike.js');

const HEAD = ['Longitude', 'Latitude', 'Elevation', 'Distance', 'CostPerKm', 'ElevCost', 'TurnCost', 'NodeCost', 'InitialCost', 'WayTags', 'NodeTags', 'Time', 'Energy'];
const row = (dist, tags) => ['14420000', '50087000', '200', String(dist), '1000', '0', '0', '0', '0', tags, '', '0', '0'];
// Kruh kolem bodu (lon, lat, výška) – n bodů, uzavřený.
function ring(lon, lat, km, n = 200) {
  const r = km / (2 * Math.PI);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return [lon + (r / 71.5) * Math.sin(a), lat + (r / 111.2) * (1 - Math.cos(a)), 200 + Math.round(50 * Math.sin(a))];
  });
}
function brouter({ km, ascend = 300, timeS = 7200, coords, messages = [HEAD, row(km * 1000, 'highway=cycleway surface=asphalt')] }) {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { 'track-length': String(Math.round(km * 1000)), 'filtered ascend': String(ascend), 'total-time': String(timeS), messages }, geometry: { type: 'LineString', coordinates: coords } }] };
}

test('parseRoute: délka, stoupání, čas podle kola, povrch a cyklostezky, zjednodušená geometrie', () => {
  const coords = ring(14.42, 50.08, 40, 5000);
  const r = parseRoute(brouter({ km: 40, ascend: 312.6, timeS: 7200, coords, messages: [HEAD,
    row(1000, 'highway=cycleway surface=asphalt'),
    row(2000, 'highway=track tracktype=grade2 surface=gravel'),
    row(1000, 'highway=primary surface=asphalt route_bicycle_rcn=yes')] }), { pace: 0.8 });
  assert.equal(r.km, 40);
  assert.equal(r.ascent, 313);
  assert.equal(r.minutes, 96, '2 h × 0,8 (silniční kolo je rychlejší)');
  assert.equal(r.unpavedPct, 50);
  assert.equal(r.cyclePct, 50, 'cyklostezka + silnice na cyklotrase');
  assert.equal(r.busyPct, 25);
  assert.ok(r.geometry.length <= 2501, 'zjednodušená geometrie');
  assert.deepEqual(r.geometry.at(-1).slice(0, 2), coords.at(-1).slice(0, 2).map((x) => Math.round(x * 1e5) / 1e5), 'konec trasy zůstane');
  assert.throws(() => parseRoute({ features: [] }), /žádnou trasu/);
});

test('profil: přírodou = lesy a řeky, mimo města; rovina = drahé stoupání; do kopců = bez penalizace', () => {
  assert.deepEqual(profileVars('gravel', 'nature', 'flat'), { prefer_forests: 1, prefer_rivers: 1, avoid_towns: 1, avoid_noise: 1, uphillcost: 80 });
  assert.deepEqual(profileVars('trekking', 'nature', 'hilly'), { consider_forest: 1, consider_river: 1, consider_noise: 1, consider_town: 1, consider_elevation: 0 });
  assert.deepEqual(profileVars('mtb', 'mixed', 'normal'), {});
});

test('odkazy: Mapy.com (turistická mapa, typ kola, ≤ 15 bodů) a Google Maps na kole', () => {
  const geom = ring(14.42, 50.08, 30);
  const m = new URL(mapyUrl([14.42, 50.08], geom, 'road'));
  assert.equal(m.origin + m.pathname, 'https://mapy.com/fnc/v1/route');
  assert.equal(m.searchParams.get('mapset'), 'outdoor');
  assert.equal(m.searchParams.get('routeType'), 'bike_road');
  assert.equal(m.searchParams.get('start'), '14.42000,50.08000');
  assert.equal(m.searchParams.get('end'), m.searchParams.get('start'), 'okruh: cíl = start');
  const wp = m.searchParams.get('waypoints').split(';');
  assert.ok(wp.length >= 10 && wp.length <= 15);
  assert.match(wp[0], /^\d+\.\d{5},\d+\.\d{5}$/);
  assert.equal(new URL(mapyUrl([14.42, 50.08], geom, 'mtb')).searchParams.get('routeType'), 'bike_mountain');
  const g = new URL(googleUrl([14.42, 50.08], geom));
  assert.equal(g.searchParams.get('travelmode'), 'bicycling');
  assert.equal(g.searchParams.get('origin'), '50.08000,14.42000');
  assert.equal(g.searchParams.get('waypoints').split('|').length, 8);
});

test('památky pro okruh městem: v dosahu, i z vnějšího pásu, seřazené po směru', () => {
  const q = { lat: 50.0875, lon: 14.4213, sights: [
    { name: 'centrum A', lat: 50.0880, lon: 14.4250 }, { name: 'centrum B', lat: 50.0860, lon: 14.4150 }, { name: 'centrum C', lat: 50.0900, lon: 14.4200 },
    { name: 'centrum D', lat: 50.0850, lon: 14.4230 }, { name: 'start', lat: 50.0876, lon: 14.4214 },
    { name: 'sever', lat: 50.1150, lon: 14.4200 }, { name: 'jih', lat: 50.0600, lon: 14.4200 }, { name: 'západ', lat: 50.0875, lon: 14.3700 },
    { name: 'daleko', lat: 50.2500, lon: 14.4200 },
  ] };
  const v = pickSights(q, 30);
  const names = v.map((s) => s.name);
  assert.equal(v.length, 6);
  assert.ok(['sever', 'jih', 'západ'].every((n) => names.includes(n)), 'vnější památky (okruh není jen po centru)');
  assert.ok(!names.includes('daleko') && !names.includes('start'));
  const bear = v.map((s) => Math.atan2(s.lon - q.lon, s.lat - q.lat));
  assert.deepEqual(bear, [...bear].sort((a, b) => a - b), 'po směru – okruh, ne cik-cak');
  assert.notDeepEqual(pickSights(q, 30, 1).map((s) => s.name), names, 'jiná varianta = jiný výběr');
});

test('okruh: BRouter round-trip s profilem kola, korekce poloměru na zadanou délku, směr podle varianty', async () => {
  const stub = stubFetch((url) => {
    const u = new URL(url);
    const R = Number(u.searchParams.get('roundTripDistance'));
    return { body: brouter({ km: (R * 3.64) / 1000, coords: ring(14.0, 49.5, 30) }) }; // první pokus vyjde na 70 %
  });
  try {
    const r = await bikeLoop({ lat: 49.5, lon: 14.0, km: 40, bike: 'gravel', scenery: 'nature', hills: 'flat', variant: 1 });
    assert.equal(stub.calls.length, 2, 'první trasa o 30 % kratší → druhý pokus s větším poloměrem');
    const [a, b] = stub.calls.map((c) => new URL(c.url));
    assert.equal(a.origin + a.pathname, 'https://brouter.de/brouter');
    assert.equal(a.searchParams.get('profile'), 'gravel');
    assert.equal(a.searchParams.get('engineMode'), '4');
    assert.equal(a.searchParams.get('direction'), '102');
    assert.equal(a.searchParams.get('profile:prefer_forests'), '1');
    assert.equal(a.searchParams.get('profile:uphillcost'), '80');
    assert.ok(Number(b.searchParams.get('roundTripDistance')) > Number(a.searchParams.get('roundTripDistance')));
    assert.ok(Math.abs(r.km - 40) < 1, `délka ${r.km}`);
    assert.equal(r.target, 40);
    assert.deepEqual(r.via, []);
    assert.match(r.mapyUrl, /^https:\/\/mapy\.com\/fnc\/v1\/route\?/);
    assert.equal(r.bike, 'gravel');
  } finally {
    stub.restore();
  }
});

test('okruh městem: přes památky; když vyjde moc krátký, okruh dané délky', async () => {
  const sights = [
    { name: 'Hrad', lat: 49.62, lon: 15.0 }, { name: 'Zámek', lat: 49.58, lon: 15.05 }, { name: 'Most', lat: 49.58, lon: 14.95 },
    { name: 'Věž', lat: 49.605, lon: 15.01 },
  ];
  let viaKm = 28;
  const stub = stubFetch((url) => {
    const u = new URL(url);
    const R = Number(u.searchParams.get('roundTripDistance'));
    return { body: brouter({ km: R ? (R * 6) / 1000 : viaKm, coords: ring(15.0, 49.6, 30) }) };
  });
  try {
    const r = await bikeLoop({ lat: 49.6, lon: 15.0, km: 30, bike: 'trekking', scenery: 'city', sights });
    assert.equal(stub.calls.length, 1);
    const lonlats = new URL(stub.calls[0].url).searchParams.get('lonlats').split('|');
    assert.equal(lonlats[0], '15,49.6');
    assert.equal(lonlats.at(-1), lonlats[0], 'zpět na start');
    assert.ok(r.via.length >= 3 && r.via.some((v) => v.name === 'Hrad'));
    viaKm = 9; // památky blízko u sebe → okruh jen 9 km místo 30
    const r2 = await bikeLoop({ lat: 49.6, lon: 15.0, km: 30, bike: 'trekking', scenery: 'city', sights, variant: 1 });
    assert.deepEqual(r2.via, []);
    assert.ok(Math.abs(r2.km - 30) < 1.5);
    assert.ok(stub.calls.slice(1).some((c) => new URL(c.url).searchParams.get('engineMode') === '4'));
  } finally {
    stub.restore();
  }
});

test('DEMO: kruh zadané délky bez sítě, neznámé kolo = trekové', () => {
  const r = mockBikeLoop({ lat: 50, lon: 14, km: 1000, bike: 'nic' });
  assert.equal(r.km, 150, 'nejvýš 150 km');
  assert.equal(r.bike, 'trekking');
  assert.deepEqual(r.geometry[0].slice(0, 2), [14, 50]);
  assert.ok(r.mapyUrl.startsWith('https://mapy.com/'));
});
