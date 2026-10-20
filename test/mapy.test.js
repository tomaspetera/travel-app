// Volitelné Mapy.com (MAPY_API_KEY): bez klíče se nic nevolá a vše jede jako dřív; s klíčem záloha plánovače tras
// (pěšky / na kole), turistická mapa přes server (/api/tiles/mapy/…) se stropem kreditů a hledání míst v Objevuj.
// Živě bez klíče testovat nejde – Mapy.com tu odpovídá náhradní fetch.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';

delete process.env.ATLAS_MOCK;
process.env.BROUTER_GAP_MS = '0';
const { config } = await import('../server/config.js');
config.mock = false;
const mapy = await import('../server/lib/mapy.js');
const { hikeLoop, bikeLoop, hikeMinutes, _resetBrouterDown } = await import('../server/lib/bike.js');
const { geocodeExplore, geocodePlaces } = await import('../server/lib/places.js');
const { cache } = await import('../server/lib/cache.js');
const { createServer } = await import('../server/index.js');

const KEY = 'test-klic-123';
const realFetch = globalThis.fetch;
let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
let ip = 0;
// dotazy na vlastní server jdou přes původní fetch (náhrada platí jen pro dotazy serveru ven); každý test z jiné IP
const get = (path, headers = {}) => realFetch(`${base}${path}`, { headers: { 'x-forwarded-for': `10.9.8.${++ip}`, ...headers } });
const post = (path, body) => realFetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.7.${++ip}` }, body: JSON.stringify(body) });

beforeEach(() => {
  mapy._resetMapy();
  _resetBrouterDown();
  cache.map.clear();
  config.mapyKey = '';
  config.mapyMaxPerHour = 340;
});

const isMapy = (u) => u.startsWith('https://api.mapy.com/');
const isBrouter = (u) => u.startsWith('https://brouter.de/');
// kruh (lon, lat) o obvodu ~km kolem bodu
function ring(lon, lat, km, n = 300) {
  const r = km / (2 * Math.PI);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return [lon + (r / 71.5) * Math.sin(a), lat + (r / 111.2) * (1 - Math.cos(a))];
  });
}
const routeJson = (coords, m, s) => ({ length: m, duration: s, geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }, parts: [], routePoints: [] });
// kopec: 200 m → 300 m → 200 m po délce trasy
const hill = (url) => {
  const n = new URL(url).searchParams.get('positions').split(';').length;
  return { items: Array.from({ length: n }, (_, k) => ({ elevation: 200 + 100 * Math.sin((Math.PI * k) / (n - 1)), position: { lon: 0, lat: 0 } })) };
};
const brouterOk = (km) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { 'track-length': String(km * 1000), 'filtered ascend': '150', 'total-time': '9000', messages: [] }, geometry: { type: 'LineString', coordinates: ring(14.42, 50.08, km).map((c) => [...c, 250]) } }] });

test('bez klíče: Mapy.com se nevolá – trasa, hledání i dlaždice jako dřív, zdravotní stav „vypnuto“ s návodem', async () => {
  const stub = stubFetch((url) => {
    if (isBrouter(url)) return { status: 503, body: 'down' };
    if (url.startsWith('https://geocoding-api.open-meteo.com/')) return { body: { results: [{ id: 1, name: 'Karlštejn', latitude: 49.934, longitude: 14.18, country_code: 'CZ', country: 'Česko', admin1: 'Středočeský kraj', population: 840, feature_code: 'PPL' }] } };
    return { status: 404, body: {} };
  });
  try {
    await assert.rejects(hikeLoop({ lat: 50.08, lon: 14.42, km: 10 }), (e) => e.status === 503, 'chyba BRouteru jako dřív');
    const om = await geocodePlaces('Karlštejn');
    assert.deepEqual(await geocodeExplore('Karlštejn'), om, 'hledání v Objevuj = geokódování beze změny');
    const g = await (await get('/api/geocode?mapy=1&q=Karl%C5%A1tejn')).json();
    assert.deepEqual(g.items.map((x) => x.label), ['Karlštejn']);
    const t = await get('/api/tiles/mapy/outdoor/10/553/346');
    assert.equal(t.status, 404);
    assert.match((await t.json()).error, /MAPY_API_KEY/);
    const h = await (await get('/api/health')).json();
    const m = h.maps.find((x) => x.id === 'mapy');
    assert.equal(m.name, 'Mapy.com');
    assert.equal(m.enabled, false);
    assert.match(m.hint, /developer\.mapy\.com → MAPY_API_KEY/);
    assert.ok(!h.providers.some((p) => p.id === 'mapy'), 'mezi zdroji cen Mapy.com není');
    assert.ok(!stub.calls.some((c) => isMapy(c.url)), 'žádný dotaz na Mapy.com');
  } finally {
    stub.restore();
  }
});

test('dlaždice: kontrola sady, zoomu a souřadnic (z 0–20, x/y v mřížce, @2x jen basic a outdoor)', () => {
  assert.deepEqual(mapy.parseTile('/api/tiles/mapy/outdoor/14/8956/5513'), { set: 'outdoor', z: 14, x: 8956, y: 5513, hd: false });
  assert.deepEqual(mapy.parseTile('/api/tiles/mapy/basic/0/0/0@2x'), { set: 'basic', z: 0, x: 0, y: 0, hd: true });
  assert.deepEqual(mapy.parseTile('/api/tiles/mapy/aerial/20/1048575/1048575.png'), { set: 'aerial', z: 20, x: 1048575, y: 1048575, hd: false });
  assert.equal(mapy.parseTile('/api/tiles/mapy/winter/3/1/1').set, 'winter');
  for (const bad of ['/api/tiles/mapy/hybrid/1/0/0', '/api/tiles/mapy/names-overlay/1/0/0', '/api/tiles/mapy/outdoor/21/0/0',
    '/api/tiles/mapy/outdoor/2/4/0', '/api/tiles/mapy/outdoor/2/0/4', '/api/tiles/mapy/outdoor/-1/0/0', '/api/tiles/mapy/outdoor/3/1/x',
    '/api/tiles/mapy/winter/3/1/1@2x', '/api/tiles/mapy/aerial/3/1/1@2x', '/api/tiles/mapy/outdoor/3/1', '/api/tiles/mapy/outdoor/3/1/1/2',
    '/api/tiles/mapy/../outdoor/3/1/1', '/api/tiles/mapy/OUTDOOR/3/1/1']) assert.equal(mapy.parseTile(bad), null, bad);
});

test('pěší okruh: BRouter neodpovídá → Mapy.com foot_hiking (klíč v hlavičce), výšky z profilu, tvar jako z BRouteru', async () => {
  config.mapyKey = KEY;
  const stub = stubFetch((url) => {
    if (isBrouter(url)) return { status: 503, body: 'Service Unavailable' };
    if (url.startsWith('https://api.mapy.com/v1/routing/route')) return { body: routeJson(ring(14.42, 50.08, 10), 10000, 9000) };
    if (url.startsWith('https://api.mapy.com/v1/elevation')) return { body: hill(url) };
    return { status: 404, body: {} };
  });
  try {
    const r = await hikeLoop({ lat: 50.08, lon: 14.42, km: 10 });
    const rc = stub.calls.find((c) => c.url.startsWith('https://api.mapy.com/v1/routing/route'));
    const u = new URL(rc.url);
    assert.equal(u.searchParams.get('routeType'), 'foot_hiking');
    assert.equal(u.searchParams.get('start'), '14.42000,50.08000');
    assert.equal(u.searchParams.get('end'), '14.42000,50.08000', 'okruh: cíl = start');
    assert.equal(u.searchParams.get('waypoints').split(';').length, 4, 'body po kružnici jako round-trip BRouteru');
    assert.equal(u.searchParams.get('format'), 'geojson');
    assert.equal(rc.init.headers['X-Mapy-Api-Key'], KEY, 'klíč v hlavičce');
    assert.ok(stub.calls.filter((c) => isMapy(c.url)).every((c) => !c.url.includes(KEY) && !/apikey=/i.test(c.url)), 'klíč nikdy v adrese');
    const ec = stub.calls.find((c) => c.url.startsWith('https://api.mapy.com/v1/elevation'));
    const n = new URL(ec.url).searchParams.get('positions').split(';').length;
    assert.ok(n >= 100 && n <= 120, `výškový profil: ${n} bodů v jednom dotazu`);

    assert.equal(r.source, 'mapy');
    assert.equal(r.km, 10);
    assert.ok(Math.abs(r.ascent - 100) <= 6 && Math.abs(r.descent - 100) <= 6, `stoupání ${r.ascent}, klesání ${r.descent}`);
    assert.equal(r.minutes, hikeMinutes(r.km, r.ascent, r.descent), 'čas chůze podle DIN jako u BRouteru');
    for (const k of ['unpavedPct', 'cyclePct', 'trailPct', 'roadPct', 'busyPct']) assert.equal(r[k], null, `${k}: povrch Mapy.com nevrací`);
    assert.ok(r.geometry.length > 100 && r.geometry.every((c) => c.length === 3 && Number.isFinite(c[2])), 'geometrie [lon, lat, výška]');
    assert.equal(Math.max(...r.geometry.map((c) => c[2])), 300);
    assert.equal(r.activity, 'hike');
    assert.match(r.mapyUrl, /^https:\/\/mapy\.com\/fnc\/v1\/route\?/);

    // výpadek si server pamatuje: další trasa rovnou z Mapy.com, bez čekání na BRouter
    const nb = stub.calls.filter((c) => isBrouter(c.url)).length;
    const r2 = await hikeLoop({ lat: 50.08, lon: 14.42, km: 10, variant: 1 });
    assert.equal(r2.source, 'mapy');
    assert.equal(stub.calls.filter((c) => isBrouter(c.url)).length, nb, 'BRouter se 5 minut nezkouší');
    assert.equal(mapy.mapyStatus().credits.usedThisHour, 16, 'dvě trasy + dva výškové profily po 4 kreditech');
  } finally {
    stub.restore();
  }
});

test('kolo: s klíčem a funkčním BRouterem se Mapy.com nevolá (povrch zůstává), okruh přes památky má routeType kola', async () => {
  config.mapyKey = KEY;
  let brouterDown = false;
  const stub = stubFetch((url) => {
    if (isBrouter(url)) return brouterDown ? { status: 500, body: 'x' } : { body: brouterOk(30) };
    if (url.startsWith('https://api.mapy.com/v1/routing/route')) return { body: routeJson(ring(14.42, 50.08, 30), 30000, 6000) };
    if (url.startsWith('https://api.mapy.com/v1/elevation')) return { body: hill(url) };
    return { status: 404, body: {} };
  });
  try {
    const r = await bikeLoop({ lat: 50.08, lon: 14.42, km: 30, bike: 'road' });
    assert.equal(r.source, undefined);
    assert.equal(r.unpavedPct, 0);
    assert.ok(!stub.calls.some((c) => isMapy(c.url)));
    brouterDown = true;
    const sights = [[50.09, 14.43], [50.1, 14.45], [50.07, 14.47], [50.06, 14.4]].map(([lat, lon], i) => ({ name: `Památka ${i}`, lat, lon }));
    const c = await bikeLoop({ lat: 50.08, lon: 14.42, km: 30, bike: 'road', scenery: 'city', sights });
    assert.equal(c.source, 'mapy');
    const u = new URL(stub.calls.find((x) => x.url.startsWith('https://api.mapy.com/v1/routing/route')).url);
    assert.equal(u.searchParams.get('routeType'), 'bike_road');
    assert.equal(u.searchParams.get('waypoints').split(';').length, c.via.length, 'průjezdní body = památky po cestě');
    assert.equal(c.minutes, 100, 'čas z Mapy.com');
  } finally {
    stub.restore();
  }
});

test('Mapy.com 403 / 429 / došlé kredity: pojistka, chyba BRouteru jako bez klíče, stav v /api/health', async () => {
  config.mapyKey = KEY;
  let mapyStatus = 403;
  const stub = stubFetch((url) => {
    if (isBrouter(url)) return { status: 502, body: 'Bad gateway' };
    if (isMapy(url)) return { status: mapyStatus, body: { detail: [{ msg: 'x' }] }, headers: { 'content-type': 'application/json', 'retry-after': '120' } };
    return { status: 404, body: {} };
  });
  try {
    await assert.rejects(hikeLoop({ lat: 50.08, lon: 14.42, km: 10 }), (e) => e.status === 502, '403 Mapy.com → původní chyba BRouteru (503 v API)');
    let st = mapy.mapyStatus();
    assert.equal(st.blocked, true);
    assert.match(st.reason, /HTTP 403/);
    assert.ok(st.retryAfter > 3500, 'hodinu bez Mapy.com');
    const nm = stub.calls.filter((c) => isMapy(c.url)).length;
    await assert.rejects(hikeLoop({ lat: 50.08, lon: 14.42, km: 10, variant: 2 }), (e) => e.status === 502);
    assert.equal(stub.calls.filter((c) => isMapy(c.url)).length, nm, 'zablokované Mapy.com se nevolá');
    const h = await (await get('/api/health')).json();
    assert.equal(h.maps[0].enabled, true);
    assert.equal(h.maps[0].blocked, true);
    assert.match(h.maps[0].hint, /odmítá klíč/);
    assert.ok(!JSON.stringify(h).includes(KEY), 'klíč se nikde neukáže');

    mapy._resetMapy(); _resetBrouterDown(); cache.map.clear();
    mapyStatus = 429;
    await assert.rejects(hikeLoop({ lat: 50.08, lon: 14.42, km: 10 }), (e) => e.status === 502);
    st = mapy.mapyStatus();
    assert.equal(st.blocked, true);
    assert.match(st.reason, /HTTP 429/);
    assert.ok(st.retryAfter > 100 && st.retryAfter <= 120, `Retry-After: ${st.retryAfter}`);

    // hodinový strop kreditů: trasa (4) projde, výškový profil (4) už ne → trasa bez stoupání; další trasa zase BRouter
    mapy._resetMapy(); _resetBrouterDown(); cache.map.clear();
    config.mapyMaxPerHour = 4;
    mapyStatus = 200;
    stub.restore();
    const s2 = stubFetch((url) => {
      if (isBrouter(url)) return { status: 502, body: 'Bad gateway' };
      if (url.startsWith('https://api.mapy.com/v1/routing/route')) return { body: routeJson(ring(14.42, 50.08, 10), 10000, 9000) };
      return { status: 404, body: {} };
    });
    try {
      const r = await hikeLoop({ lat: 50.08, lon: 14.42, km: 10 });
      assert.equal(r.source, 'mapy');
      assert.equal(r.ascent, null, 'bez výšek – UI stoupání neukáže');
      assert.ok(r.geometry.every((c) => c[2] === null));
      assert.ok(!s2.calls.some((c) => c.url.startsWith('https://api.mapy.com/v1/elevation')), 'výškový profil nad strop se nevolal');
      await assert.rejects(hikeLoop({ lat: 50.08, lon: 14.42, km: 10, variant: 3 }), (e) => e.status === 502, 'strop vyčerpaný → jako bez klíče');
      assert.equal(s2.calls.filter((c) => isMapy(c.url)).length, 1);
    } finally {
      s2.restore();
    }
  } finally {
    stub.restore();
  }
});

test('turistická mapa přes server: dlaždice s klíčem v hlavičce, týdenní cache, mezipaměť, @2x, neplatné → 400, chyba → 503', async () => {
  config.mapyKey = KEY;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  let tileStatus = 200;
  const stub = stubFetch((url) => {
    if (url.startsWith('https://api.mapy.com/v1/maptiles/')) return tileStatus === 200 ? { body: new Uint8Array(png), headers: { 'content-type': 'image/png' } } : { status: tileStatus, body: new Uint8Array(png), headers: { 'content-type': 'image/png' } };
    return { status: 404, body: {} };
  });
  try {
    const r = await get('/api/tiles/mapy/outdoor/14/8956/5513');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal(r.headers.get('cache-control'), 'public, max-age=604800');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
    const up = stub.calls.filter((c) => c.url.includes('/v1/maptiles/'));
    assert.equal(up.length, 1);
    assert.equal(up[0].url, 'https://api.mapy.com/v1/maptiles/outdoor/256/14/8956/5513?lang=cs');
    assert.equal(up[0].init.headers['X-Mapy-Api-Key'], KEY);
    // stejná dlaždice podruhé: z mezipaměti serveru, bez kreditu
    assert.equal((await get('/api/tiles/mapy/outdoor/14/8956/5513')).status, 200);
    assert.equal(stub.calls.filter((c) => c.url.includes('/v1/maptiles/')).length, 1);
    assert.equal(mapy.mapyStatus().credits.usedThisHour, 1);
    // retina
    assert.equal((await get('/api/tiles/mapy/outdoor/14/8956/5513@2x')).status, 200);
    assert.equal(stub.calls.at(-1).url, 'https://api.mapy.com/v1/maptiles/outdoor/256@2x/14/8956/5513?lang=cs');
    // neplatné dlaždice se k Mapy.com vůbec nedostanou
    const n = stub.calls.length;
    for (const bad of ['/api/tiles/mapy/hybrid/1/0/0', '/api/tiles/mapy/outdoor/21/0/0', '/api/tiles/mapy/outdoor/2/4/0', '/api/tiles/mapy/winter/3/1/1@2x', '/api/tiles/mapy/outdoor/3/1/abc']) {
      assert.equal((await get(bad)).status, 400, bad);
    }
    assert.equal(stub.calls.length, n);
    // strop kreditů: nad ním 503 bez dotazu na Mapy.com (mapa pak vrstvu sundá a zůstane OpenFreeMap)
    config.mapyMaxPerHour = 3;
    assert.equal((await get('/api/tiles/mapy/outdoor/14/8957/5513')).status, 200);
    const over = await get('/api/tiles/mapy/outdoor/14/8958/5513');
    assert.equal(over.status, 503);
    assert.equal(stub.calls.length, n + 1);
    // chyba Mapy.com (403 vrací obrázek s textem chyby) se prohlížeči jako dlaždice nepošle; pojistka
    config.mapyMaxPerHour = 340;
    mapy._resetMapy();
    tileStatus = 403;
    const e = await get('/api/tiles/mapy/outdoor/14/8959/5513');
    assert.equal(e.status, 503);
    assert.match(e.headers.get('content-type'), /json/);
    assert.equal(mapy.mapyStatus().blocked, true);
    const m = stub.calls.length;
    assert.equal((await get('/api/tiles/mapy/outdoor/14/8960/5513')).status, 503);
    assert.equal(stub.calls.length, m, 'zablokované Mapy.com se nevolá');
  } finally {
    stub.restore();
  }
});

test('dlaždice: limit z jedné IP jen na dotazy mimo mezipaměť serveru', async () => {
  config.mapyKey = KEY;
  const prev = config.tilesPer10Min;
  config.tilesPer10Min = 2;
  const stub = stubFetch(() => ({ body: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'image/png' } }));
  const h = { 'x-forwarded-for': '10.1.1.1' };
  try {
    assert.equal((await get('/api/tiles/mapy/outdoor/5/1/1', h)).status, 200);
    assert.equal((await get('/api/tiles/mapy/outdoor/5/1/2', h)).status, 200);
    assert.equal((await get('/api/tiles/mapy/outdoor/5/1/3', h)).status, 429);
    assert.equal((await get('/api/tiles/mapy/outdoor/5/1/1', h)).status, 200, 'z mezipaměti i nad limitem');
    assert.equal((await get('/api/tiles/mapy/outdoor/5/1/3', { 'x-forwarded-for': '10.1.1.2' })).status, 200, 'jiná IP');
  } finally {
    config.tilesPer10Min = prev;
    stub.restore();
  }
});

test('hledání v Objevuj: Mapy.com doplní vesnice a místa, stejné místo jen jednou, logo u výsledků; bez mapy=1 jen geokódování', async () => {
  config.mapyKey = KEY;
  const om = { results: [
    { id: 3067696, name: 'Praha', latitude: 50.088, longitude: 14.4208, country_code: 'CZ', country: 'Česko', admin1: 'Praha', population: 1165581, feature_code: 'PPLC' },
    { id: 2, name: 'Karlštejn', latitude: 49.934, longitude: 14.18, country_code: 'CZ', country: 'Česko', admin1: 'Středočeský kraj', population: 840, feature_code: 'PPL' },
  ] };
  const cz = [{ name: 'Česko', type: 'regional.country', isoCode: 'CZ' }];
  const sug = { items: [
    { name: 'Praha', label: 'Hlavní město', position: { lon: 14.43, lat: 50.08 }, type: 'regional.municipality', location: 'Česko', regionalStructure: cz },
    { name: 'Karlštejn', label: 'Hrad', position: { lon: 14.1881, lat: 49.9391 }, type: 'poi', location: 'Karlštejn, Středočeský kraj', regionalStructure: cz },
    { name: 'Karlštejn', label: 'Obec', position: { lon: 14.18, lat: 49.934 }, type: 'regional.municipality', location: 'Středočeský kraj, Česko', regionalStructure: cz },
    { name: 'Rozhledna Bobová', label: 'Rozhledna', position: [14.2, 49.95], type: 'poi', location: 'Česko', regionalStructure: cz },
  ] };
  const stub = stubFetch((url) => {
    if (url.startsWith('https://geocoding-api.open-meteo.com/')) return { body: om };
    if (url.startsWith('https://api.mapy.com/v1/suggest')) return { body: sug };
    return { status: 404, body: {} };
  });
  try {
    const items = await geocodeExplore('Kar');
    assert.deepEqual(items.map((x) => [x.label, x.src || 'om']), [['Praha', 'om'], ['Karlštejn', 'mapy'], ['Karlštejn', 'mapy'], ['Rozhledna Bobová', 'mapy']],
      'velké město z Open-Meteo první, Praha z Mapy.com a obec Karlštejn z Open-Meteo jen jednou, hrad i obec zvlášť');
    const hrad = items[1];
    assert.equal(hrad.sub, 'Hrad · Karlštejn, Středočeský kraj');
    assert.equal(hrad.cc, 'CZ');
    assert.equal(hrad.flag, '🇨🇿');
    assert.equal(hrad.id, 'geo:49.9391,14.1881|Karlštejn');
    assert.equal(items[3].lon, 14.2, 'poloha i jako pole [lon, lat]');
    const sc = stub.calls.find((c) => c.url.startsWith('https://api.mapy.com/v1/suggest'));
    const u = new URL(sc.url);
    assert.equal(u.searchParams.get('query'), 'Kar');
    assert.equal(u.searchParams.get('lang'), 'cs');
    assert.deepEqual(u.searchParams.getAll('type'), ['regional.municipality', 'regional.municipality_part', 'regional.address', 'poi']);
    assert.equal(sc.init.headers['X-Mapy-Api-Key'], KEY);

    // přes server: mapy=1 (hledání v Objevuj) s Mapy.com, jinak (průvodce cestou, plánovač) beze změny; podruhé z mezipaměti
    const n = stub.calls.filter((c) => isMapy(c.url)).length;
    const a = await (await get('/api/geocode?mapy=1&q=Kar')).json();
    assert.ok(a.items.some((x) => x.src === 'mapy'));
    const b = await (await get('/api/geocode?q=Kar')).json();
    assert.ok(!b.items.some((x) => x.src === 'mapy'));
    assert.equal(stub.calls.filter((c) => isMapy(c.url)).length, n, 'stejný text podruhé z mezipaměti');
    // Mapy.com nejde (pojistka) → jen geokódování, bez chyby
    cache.map.clear();
    const s403 = stubFetch((url) => (isMapy(url) ? { status: 403, body: {} } : url.startsWith('https://geocoding-api.open-meteo.com/') ? { body: om } : { status: 404, body: {} }));
    try {
      const c = await (await get('/api/geocode?mapy=1&q=Kar')).json();
      assert.deepEqual(c.items.map((x) => x.label), ['Praha', 'Karlštejn']);
    } finally {
      s403.restore();
    }
  } finally {
    stub.restore();
  }
});

test('/api/hike: s klíčem odpověď nabídne turistickou mapu (tiles: mapy), bez klíče ne', async () => {
  const stub = stubFetch((url) => (isBrouter(url) ? { body: brouterOk(10) } : { status: 404, body: {} }));
  try {
    const off = await (await post('/api/hike', { lat: 50.08, lon: 14.42, km: 10 })).json();
    assert.equal(off.km, 10);
    assert.equal(off.tiles, undefined);
    config.mapyKey = KEY;
    const on = await (await post('/api/hike', { lat: 50.08, lon: 14.42, km: 10 })).json();
    assert.equal(on.tiles, 'mapy');
    assert.equal(on.source, undefined, 'trasa dál z BRouteru');
    assert.ok(!stub.calls.some((c) => isMapy(c.url)), 'samotná odpověď kredity nestojí');
  } finally {
    stub.restore();
  }
});
