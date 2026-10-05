// Výlety na kole a pěšky: souhrn trasy z BRouteru (povrch, cyklostezky, turistické trasy), odkazy do
// Mapy.com a Google Map, profil podle kola a krajiny, okruh dané délky (s korekcí), okruh městem přes
// památky, čas chůze, vlakem tam a na kole zpět (nádraží z Wikidat).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';

process.env.BROUTER_GAP_MS = '0';
const { parseRoute, profileVars, hikeVars, hikeMinutes, mapyUrl, googleUrl, pickSights, pickStations, bikeLoop, hikeLoop, bikeFromStation, mockBikeLoop, mockHikeLoop, mockBikeFromStation } = await import('../server/lib/bike.js');

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

test('čas chůze: DIN 33466 – 4 km/h, 300 m nahoru a 500 m dolů za hodinu, kratší složka polovinou', () => {
  assert.equal(hikeMinutes(8, 0), 120, 'rovina: jen vzdálenost');
  assert.equal(hikeMinutes(12, 600, 600), 282, 'h 3 h, v 2 + 1,2 = 3,2 h → 3,2 + 1,5 = 4,7 h');
  assert.equal(hikeMinutes(4, 900, 900), 318, 'strmě: rozhoduje převýšení (4,8 h) + polovina 1 h');
  assert.equal(hikeMinutes(10, 300), hikeMinutes(10, 300, 300), 'klesání ≈ stoupání (okruh)');
  assert.ok(hikeMinutes(10, 300, 0) < hikeMinutes(10, 300, 600), 'víc klesání = déle');
});

test('parseRoute: turistické značky, silnice bez chodníku a klesání z výškového profilu', () => {
  const coords = [[14.4, 50.0, 300], [14.41, 50.01, 350], [14.42, 50.02, 250]];
  const r = parseRoute(brouter({ km: 10, ascend: 120, coords, messages: [HEAD,
    row(4000, 'highway=path surface=ground route_hiking_rwn=yes'),
    row(1000, 'highway=residential surface=asphalt route_foot_lwn=yes'),
    row(2000, 'highway=tertiary surface=asphalt'),
    row(1000, 'highway=secondary surface=asphalt sidewalk=both'),
    row(2000, 'highway=track surface=gravel')] }));
  assert.equal(r.trailPct, 50, 'route_hiking_* i route_foot_*');
  assert.equal(r.roadPct, 20, 'silnice s chodníkem se nepočítá');
  assert.equal(r.busyPct, 10, 'rušnější silnice i s chodníkem');
  assert.equal(r.descent, 170, 'klesání = stoupání + start − cíl (120 + 300 − 250)');
});

test('pěší profil: přírodou = lesy, voda a značené trasy; rovina = consider_elevation; do kopců = pěšiny a horské stezky', () => {
  assert.deepEqual(hikeVars('nature', 'flat'), { consider_forest: 1, consider_river: 1, consider_town: 1, consider_noise: 1, hiking_routes_preference: 0.6, consider_elevation: 1 });
  assert.deepEqual(hikeVars('mixed', 'hilly'), { path_preference: 5, SAC_scale_preferred: 2 });
  assert.deepEqual(hikeVars('city', 'normal'), {});
});

test('odkazy pěšky a z nádraží: Mapy.com foot_hiking, Google pěšky, cíl jinde než start', () => {
  const geom = ring(14.42, 50.08, 10);
  const m = new URL(mapyUrl([14.42, 50.08], geom, 'hike'));
  assert.equal(m.searchParams.get('routeType'), 'foot_hiking');
  assert.equal(m.searchParams.get('mapset'), 'outdoor');
  assert.equal(m.searchParams.get('end'), m.searchParams.get('start'));
  assert.equal(new URL(googleUrl([14.42, 50.08], geom, 'walking')).searchParams.get('travelmode'), 'walking');
  const one = new URL(mapyUrl([14.0, 49.9], geom, 'road', [14.42, 50.08]));
  assert.equal(one.searchParams.get('start'), '14.00000,49.90000');
  assert.equal(one.searchParams.get('end'), '14.42000,50.08000', 'z nádraží domů, ne okruh');
  assert.equal(new URL(googleUrl([14.0, 49.9], geom, 'bicycling', [14.42, 50.08])).searchParams.get('destination'), '50.08000,14.42000');
});

test('pěší okruh: profil hiking-mountain, poloměr ~km / 4,9 s korekcí, čas podle DIN (ne BRouter)', async () => {
  const stub = stubFetch((url) => {
    const R = Number(new URL(url).searchParams.get('roundTripDistance'));
    // první pokus vyjde o 25 % kratší; BRouter tvrdí 9 h chůze – to se nepoužije
    return { body: brouter({ km: (R * 3.7) / 1000, ascend: 300, timeS: 9 * 3600, coords: ring(15.5, 49.4, 12),
      messages: [HEAD, row(6000, 'highway=path route_hiking_nwn=yes'), row(4000, 'highway=unclassified surface=asphalt')] }) };
  });
  try {
    const r = await hikeLoop({ lat: 49.4, lon: 15.5, km: 12, scenery: 'nature', hills: 'flat' });
    assert.equal(stub.calls.length, 2, 'korekce délky');
    const [a, b] = stub.calls.map((c) => new URL(c.url));
    assert.equal(a.searchParams.get('profile'), 'hiking-mountain');
    assert.equal(a.searchParams.get('engineMode'), '4');
    assert.equal(Number(a.searchParams.get('roundTripDistance')), Math.round(12000 / 4.9));
    assert.equal(a.searchParams.get('profile:consider_forest'), '1');
    assert.equal(a.searchParams.get('profile:hiking_routes_preference'), '0.6');
    assert.equal(a.searchParams.get('profile:consider_elevation'), '1');
    assert.ok(Number(b.searchParams.get('roundTripDistance')) > Number(a.searchParams.get('roundTripDistance')));
    assert.ok(Math.abs(r.km - 12) < 1, `délka ${r.km}`);
    assert.equal(r.activity, 'hike');
    assert.equal(r.minutes, hikeMinutes(r.km, 300, r.descent));
    assert.ok(r.minutes < 9 * 60);
    assert.equal(r.trailPct, 60);
    assert.equal(r.roadPct, 40);
    assert.equal(new URL(r.mapyUrl).searchParams.get('routeType'), 'foot_hiking');
    assert.equal(new URL(r.googleUrl).searchParams.get('travelmode'), 'walking');
    assert.equal(r.bike, undefined);
  } finally {
    stub.restore();
  }
});

test('okruh: když korekce délky selže (BRouter 400 „target island“), zůstane první trasa', async () => {
  const stub = stubFetch((url) => (stub.calls.length === 1
    ? { body: brouter({ km: 13, ascend: 150, coords: ring(14.42, 50.09, 13) }) }
    : { status: 400, body: 'target island detected for section 2' }));
  try {
    const r = await hikeLoop({ lat: 50.09, lon: 14.42, km: 10 });
    assert.equal(stub.calls.length, 2, 'korekce se zkusila');
    assert.equal(r.km, 13);
    assert.equal(r.minutes, hikeMinutes(13, 150, r.descent));
    // nesmyslná varianta (1e400 v JSON = Infinity) → první směr, ne direction=NaN
    const inf = await hikeLoop({ lat: 50.09, lon: 14.42, km: 10, variant: Infinity });
    assert.equal(inf.variant, 0);
    assert.equal(new URL(stub.calls[0].url).searchParams.get('direction'), '30');
  } finally {
    stub.restore();
  }
});

test('pěší okruh městem: památky v pěším dosahu (~km / 5), délka 2–40 km', async () => {
  const sights = [
    { name: 'Kostel', lat: 49.208, lon: 16.6 }, { name: 'Hrad', lat: 49.195, lon: 16.612 }, { name: 'Muzeum', lat: 49.193, lon: 16.594 },
    { name: 'Daleko', lat: 49.25, lon: 16.6 },
  ];
  const stub = stubFetch(() => ({ body: brouter({ km: 6.2, coords: ring(16.6, 49.2, 6) }) }));
  try {
    const r = await hikeLoop({ lat: 49.2, lon: 16.6, km: 6, scenery: 'city', sights });
    assert.equal(stub.calls.length, 1);
    const lonlats = new URL(stub.calls[0].url).searchParams.get('lonlats').split('|');
    assert.equal(lonlats.length, 5, 'start, 3 památky, start');
    assert.ok(!r.via.some((v) => v.name === 'Daleko'), '5,6 km je na 6km procházku moc daleko');
    assert.equal(r.via.length, 3);
    const tiny = mockHikeLoop({ lat: 49.2, lon: 16.6, km: 0.5 });
    assert.equal(tiny.km, 2, 'nejméně 2 km');
    assert.equal(mockHikeLoop({ lat: 49.2, lon: 16.6, km: 99 }).km, 40, 'nejvýš 40 km');
  } finally {
    stub.restore();
  }
});

// Nádraží kolem Kolína (vzdušné vzdálenosti od středu ~49,9 / 15,5).
const at = (km, deg) => {
  const a = (deg * Math.PI) / 180;
  return { lat: 49.9 + (km * Math.cos(a)) / 111.2, lon: 15.5 + (km * Math.sin(a)) / (111.2 * Math.cos((49.9 * Math.PI) / 180)) };
};
const STATIONS = [
  { name: 'Velké Město hlavní nádraží', sitelinks: 9, ...at(30, 0) },
  { name: 'Velké Město-Předměstí', sitelinks: 3, ...at(31, 5) },
  { name: 'Severka', sitelinks: 5, ...at(29, 20) },
  { name: 'Východov', sitelinks: 4, ...at(28, 90) },
  { name: 'Jihov', sitelinks: 2, ...at(32, 180) },
  { name: 'Blízko', sitelinks: 20, ...at(10, 270) },
  { name: 'Daleko', sitelinks: 20, ...at(60, 270) },
].map((s, i) => ({ id: `Q${i + 1}`, cc: 'CZ', ...s }));

test('nádraží pro vlakem tam: v pásmu vzdálenosti, jedno na město, větší dřív, střídavě do směrů', () => {
  const c = pickStations(STATIONS, { lat: 49.9, lon: 15.5 }, 40); // d = 30,8 km → 21,5–35,4 km
  const names = c.map((s) => s.name);
  assert.ok(!names.includes('Blízko') && !names.includes('Daleko'), 'mimo pásmo');
  assert.ok(!names.includes('Velké Město-Předměstí'), 'jedno nádraží na město');
  assert.equal(names[0], 'Velké Město hlavní nádraží', 'nejvíc jazykových verzí');
  assert.deepEqual(names, ['Velké Město hlavní nádraží', 'Východov', 'Jihov', 'Severka'], 'Severka je ve stejném směru jako Velké Město → až v dalším kole');
});

function wdqsRows(list) {
  return { results: { bindings: list.map((s) => ({
    s: { value: `http://www.wikidata.org/entity/${s.id}` }, sLabel: { value: s.name }, coord: { value: `Point(${s.lon} ${s.lat})` },
    sl: { value: String(s.sitelinks) }, ...(s.cc ? { cc: { value: s.cc } } : {}),
  })) } };
}

test('vlakem tam, na kole zpět: nádraží z Wikidat, trasa nádraží → domov, nesedí-li délka, další nádraží', async () => {
  let wd = 0;
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/')) {
      wd++;
      return { body: wdqsRows(STATIONS) };
    }
    const from = new URL(url).searchParams.get('lonlats').split('|')[0].split(',').map(Number);
    const far = Math.abs(from[1] - at(30, 0).lat) < 1e-6; // z Velkého Města by to bylo 70 km
    return { body: brouter({ km: far ? 70 : 43, ascend: 250, coords: ring(15.5, 49.9, 40) }) };
  });
  try {
    const r = await bikeFromStation({ lat: 49.9, lon: 15.5, km: 40, bike: 'road', scenery: 'city', label: 'Kolín', cc: 'CZ' });
    assert.equal(wd, 1);
    const sq = decodeURIComponent(stub.calls[0].url);
    assert.match(sq, /wd:Q55488/);
    assert.match(sq, /FILTER NOT EXISTS \{ \?s wdt:P5817 \?closed/);
    assert.match(sq, /wd:Q11639308/, 'bez nádraží vyřazených z provozu');
    const routes = stub.calls.slice(1).map((c) => new URL(c.url));
    assert.equal(routes.length, 2, 'první nádraží by dalo 70 km → druhý pokus');
    assert.equal(routes[0].searchParams.get('engineMode'), null, 'z bodu do bodu, ne okruh');
    assert.equal(routes[0].searchParams.get('profile'), 'fastbike');
    assert.equal(routes[1].searchParams.get('lonlats').split('|')[1], '15.5,49.9', 'cíl = domov');
    assert.equal(r.kind, 'train');
    assert.equal(r.activity, 'bike');
    assert.equal(r.station.name, 'Východov');
    assert.equal(r.variant, 1, 'pořadí použitého nádraží – „Jiné nádraží“ pokračuje dalším');
    assert.equal(r.km, 43);
    assert.equal(r.scenery, 'mixed', 'městem jízda z nádraží nevede');
    assert.equal(r.train.idosUrl, 'https://idos.cz/vlakyautobusy/spojeni/?f=Kol%C3%ADn&t=V%C3%BDchodov');
    const g = new URL(r.train.googleUrl);
    assert.equal(g.searchParams.get('travelmode'), 'transit');
    assert.equal(g.searchParams.get('origin'), '49.90000,15.50000');
    const m = new URL(r.mapyUrl);
    assert.equal(m.searchParams.get('end'), '15.50000,49.90000', 'Mapy.com: z nádraží domů');
    assert.notEqual(m.searchParams.get('start'), m.searchParams.get('end'));
    // stejná oblast podruhé: seznam nádraží z mezipaměti, IDOS jen v Česku
    const r2 = await bikeFromStation({ lat: 49.9, lon: 15.5, km: 40, bike: 'road', variant: 1, label: 'Wien', cc: 'AT' });
    assert.equal(wd, 1, 'nádraží z mezipaměti');
    assert.equal(r2.station.name, 'Východov');
    assert.equal(r2.train.idosUrl, null);
    assert.ok(r2.train.googleUrl);
  } finally {
    stub.restore();
  }
});

test('vlakem tam: bez vhodného nádraží srozumitelná chyba; výpadek Wikidat označený', async () => {
  let fail = false;
  const stub = stubFetch((url) => (url.startsWith('https://query.wikidata.org/')
    ? (fail ? { status: 500, body: 'down' } : { body: wdqsRows([{ id: 'Q9', name: 'Kousek', sitelinks: 3, cc: 'CZ', lat: 48.81, lon: 17.0 }]) })
    : { body: brouter({ km: 30, coords: ring(17, 48.8, 30) }) }));
  try {
    await assert.rejects(bikeFromStation({ lat: 48.8, lon: 17.0, km: 40 }), (e) => e.code === 'NO_STATION' && /nádraží/.test(e.message));
    fail = true;
    await assert.rejects(bikeFromStation({ lat: 47.3, lon: 12.0, km: 40 }), (e) => e.code === 'WDQS');
  } finally {
    stub.restore();
  }
});

test('vlakem tam: když délku nesplní žádné nádraží, „Jiné nádraží“ přesto ukáže jiné', async () => {
  // dvě nádraží, z obou je to domů moc daleko (bližší je B) – každá varianta musí ukázat jiné
  const two = [
    { id: 'Q1', name: 'Áčkov', sitelinks: 5, cc: 'CZ', ...at(30, 0) },
    { id: 'Q2', name: 'Béčkov', sitelinks: 4, cc: 'CZ', ...at(30, 180) },
  ].map((s) => ({ ...s, lat: s.lat - 1.5 }));
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/')) return { body: wdqsRows(two) };
    const from = new URL(url).searchParams.get('lonlats').split('|')[0].split(',').map(Number);
    return { body: brouter({ km: Math.abs(from[1] - two[0].lat) < 1e-6 ? 75 : 62, coords: ring(15.5, 48.4, 40) }) };
  });
  try {
    const q = { lat: 48.4, lon: 15.5, km: 40, bike: 'trekking' };
    const a = await bikeFromStation({ ...q, variant: 0 });
    const b = await bikeFromStation({ ...q, variant: a.variant + 1 });
    assert.notEqual(b.station.name, a.station.name, `obě varianty: ${a.station.name}`);
    const c = await bikeFromStation({ ...q, variant: b.variant + 1 });
    assert.equal(c.station.name, a.station.name, 'pak zase od začátku');
    // nesmyslná varianta (1e400 v JSON = Infinity) nespadne
    assert.ok((await bikeFromStation({ ...q, variant: Infinity })).station.name);
  } finally {
    stub.restore();
  }
});

test('DEMO: pěšky a vlakem tam bez sítě', () => {
  const h = mockHikeLoop({ lat: 50, lon: 14, km: 12, scenery: 'nature' });
  assert.equal(h.activity, 'hike');
  assert.equal(h.minutes, hikeMinutes(12, h.ascent));
  assert.match(h.mapyUrl, /routeType=foot_hiking/);
  const t = mockBikeFromStation({ lat: 50, lon: 14, km: 39, label: 'Praha', cc: 'CZ' });
  assert.equal(t.kind, 'train');
  assert.ok(Math.abs(t.station.lat - (50 + 30 / 111)) < 1e-3, 'nádraží ~km / 1,3 na sever');
  assert.deepEqual(t.geometry.at(-1).slice(0, 2), [14, 50], 'končí doma');
  assert.ok(t.train.idosUrl.startsWith('https://idos.cz/'));
  assert.equal(mockBikeLoop({ lat: 50, lon: 14 }).activity, 'bike');
});
