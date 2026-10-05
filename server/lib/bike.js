// Výlety na kole: okruh zadané délky z místa, přes BRouter (https://brouter.de – plánovač pro kola
// nad OpenStreetMap, zdarma a bez klíče). Typ kola → profil (silniční, trek, gravel, horské),
// krajina → přednost lesům a řekám / památkám ve městě, kopce → cena stoupání.
// Výsledek: délka, stoupání, odhad času, povrch, trasa (pro mapu a GPX) a odkazy do Mapy.com a Google Map.
import { request, limiter } from './http.js';
import { cache } from './cache.js';
import { haversineKm } from './geo.js';

const BROUTER = (process.env.BROUTER_URL || 'https://brouter.de/brouter').replace(/\/$/, '');
const UA = 'ATLAS-travel/2.0 (https://github.com/tomaspetera/travel-app; hobby travel planner)';
// Veřejný server: jeden dotaz naráz a aspoň 1 s mezi dotazy (ohleduplné použití).
const GAP_MS = Number(process.env.BROUTER_GAP_MS ?? 1000);
const limit = limiter(1);
let lastCall = 0;
async function politely(fn) {
  return limit(async () => {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastCall = Date.now();
    }
  });
}

// mapy = routeType v Mapy.com (silniční / horské kolo), pace = násobek času BRouteru (počítá ~100 W).
export const BIKES = {
  road: { profile: 'fastbike', mapy: 'bike_road', pace: 0.8, label: 'silniční kolo' },
  trekking: { profile: 'trekking', mapy: 'bike_mountain', pace: 1, label: 'trekové / městské kolo' },
  gravel: { profile: 'gravel', mapy: 'bike_mountain', pace: 1.05, label: 'gravel' },
  mtb: { profile: 'mtb', mapy: 'bike_mountain', pace: 1.2, label: 'horské kolo' },
};

/** Parametry profilu podle krajiny a kopců (proměnné profilů BRouteru). */
export function profileVars(bike, scenery, hills) {
  const v = {};
  if (scenery === 'nature') {
    if (bike === 'gravel') Object.assign(v, { prefer_forests: 1, prefer_rivers: 1, avoid_towns: 1, avoid_noise: 1 });
    else if (bike !== 'mtb') Object.assign(v, { consider_forest: 1, consider_river: 1, consider_noise: 1, consider_town: 1 });
  }
  if (hills === 'flat') v.uphillcost = 80;
  if (hills === 'hilly') v.consider_elevation = 0;
  return v;
}

function brouterUrl({ profile, vars, lonlats, round }) {
  const parts = [`profile=${profile}`, 'alternativeidx=0', 'format=geojson', `lonlats=${lonlats}`];
  if (round) parts.push('engineMode=4', `roundTripDistance=${Math.round(round.radiusM)}`, 'roundTripPoints=5', `direction=${round.direction}`);
  for (const [k, val] of Object.entries(vars)) parts.push(`profile:${k}=${val}`);
  return `${BROUTER}?${parts.join('&')}`;
}

const PAVED = /surface=(asphalt|concrete|paved|paving_stones|sett|chipseal|metal|wood)\b/;
const UNPAVED = /surface=(unpaved|gravel|fine_gravel|dirt|ground|grass|compacted|earth|mud|sand|pebblestone|rock|woodchips)\b/;

/** Odpověď BRouteru (GeoJSON) → souhrn trasy + zjednodušená geometrie [lon, lat, výška]. */
export function parseRoute(json, { pace = 1, maxPoints = 2500 } = {}) {
  const f = json?.features?.[0];
  if (!f?.geometry?.coordinates?.length) throw new Error('Plánovač tras nevrátil žádnou trasu.');
  const p = f.properties || {};
  const coords = f.geometry.coordinates;
  let total = 0;
  let unpaved = 0;
  let cycle = 0;
  let busy = 0;
  for (const m of (p.messages || []).slice(1)) {
    const d = Number(m[3]) || 0;
    const tags = String(m[9] || '');
    total += d;
    if (UNPAVED.test(tags) || (/highway=(track|path|bridleway)/.test(tags) && !PAVED.test(tags))) unpaved += d;
    if (/highway=cycleway|route_bicycle_(icn|ncn|rcn|lcn)=yes|cycleway[^=]*=(track|lane)/.test(tags)) cycle += d;
    if (/highway=(trunk|primary|secondary)\b/.test(tags)) busy += d;
  }
  const pct = (x) => (total ? Math.round((x / total) * 100) : 0);
  const step = Math.max(1, Math.ceil(coords.length / maxPoints));
  const geometry = coords.filter((_, i) => i % step === 0 || i === coords.length - 1)
    .map(([lon, lat, ele]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5, Number.isFinite(ele) ? Math.round(ele) : null]);
  return {
    km: Math.round(Number(p['track-length']) / 100) / 10,
    ascent: Math.round(Number(p['filtered ascend']) || 0),
    minutes: Math.round(((Number(p['total-time']) || 0) / 60) * pace),
    unpavedPct: pct(unpaved),
    cyclePct: pct(cycle),
    busyPct: pct(busy),
    geometry,
  };
}

/** Body rovnoměrně podél trasy (pro odkaz do Mapy.com / Google Map, které berou jen pár bodů). */
export function samplePoints(geometry, n) {
  if (geometry.length <= 2) return [];
  const cum = [0];
  for (let i = 1; i < geometry.length; i++) cum.push(cum[i - 1] + haversineKm(geometry[i - 1][1], geometry[i - 1][0], geometry[i][1], geometry[i][0]));
  const total = cum.at(-1);
  const out = [];
  for (let k = 1; k <= n; k++) {
    const target = (total * k) / (n + 1);
    const i = cum.findIndex((c) => c >= target);
    if (i > 0) out.push(geometry[i]);
  }
  return out;
}

const ll = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`; // lon,lat
export function mapyUrl(start, geometry, bike) {
  const qs = new URLSearchParams({ mapset: 'outdoor', start: ll(start), end: ll(start), routeType: BIKES[bike]?.mapy || 'bike_mountain' });
  const wp = samplePoints(geometry, 13);
  if (wp.length) qs.set('waypoints', wp.map(ll).join(';'));
  return `https://mapy.com/fnc/v1/route?${qs}`;
}
export function googleUrl(start, geometry) {
  const latlon = (p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`;
  const qs = new URLSearchParams({ api: '1', origin: latlon(start), destination: latlon(start), travelmode: 'bicycling' });
  const wp = samplePoints(geometry, 8);
  if (wp.length) qs.set('waypoints', wp.map(latlon).join('|'));
  return `https://www.google.com/maps/dir/?${qs}`;
}

async function route(args, pace) {
  const url = brouterUrl(args);
  return cache.wrap(`brouter:${url}`, 7 * 864e5, () => politely(async () => {
    const j = await request(url, { headers: { 'User-Agent': UA }, timeoutMs: 45000, retries: 1 });
    return parseRoute(j, { pace });
  }));
}

/**
 * Památky pro okruh městem: nejvýznamnější v dosahu, polovina z vnějšího pásu (ať okruh není jen
 * kolečko po centru), seřazené po směru od startu (okruh, ne cik-cak). Varianta posune výběr.
 */
export function pickSights(q, km, variant = 0) {
  const radius = Math.max(1.5, km / 6);
  const dist = (s) => haversineKm(q.lat, q.lon, s.lat, s.lon);
  const near = (q.sights || []).filter((s) => dist(s) <= radius && dist(s) >= 0.2);
  const n = Math.min(8, Math.max(3, Math.round(km / 5)));
  const skip = variant % 3;
  const outer = near.filter((s) => dist(s) >= radius * 0.45).slice(skip);
  const inner = near.filter((s) => dist(s) < radius * 0.45).slice(skip);
  const pick = [...outer.slice(0, Math.ceil(n / 2)), ...inner].slice(0, n);
  for (const s of [...outer, ...inner]) if (pick.length < n && !pick.includes(s)) pick.push(s);
  const bearing = (s) => Math.atan2(s.lon - q.lon, s.lat - q.lat);
  return pick.sort((a, b) => bearing(a) - bearing(b));
}

/**
 * Okruh na kole. q: { lat, lon, km, bike, scenery: 'city'|'mixed'|'nature', hills: 'flat'|'normal'|'hilly',
 * variant (jiná trasa), sights: [{name, lat, lon}] (u „městem“ – památky po cestě) }
 */
export async function bikeLoop(q) {
  const bike = BIKES[q.bike] ? q.bike : 'trekking';
  const { profile, pace } = BIKES[bike];
  const vars = profileVars(bike, q.scenery, q.hills);
  const km = Math.min(150, Math.max(5, Number(q.km) || 30));
  const start = [Math.round(q.lon * 1e4) / 1e4, Math.round(q.lat * 1e4) / 1e4];
  const variant = Math.max(0, Math.round(Number(q.variant) || 0)) % 10;
  let r;
  let via = [];
  if (q.scenery === 'city') {
    via = pickSights(q, km, variant);
    if (via.length >= 2) {
      const lonlats = [start, ...via.map((s) => [s.lon, s.lat]), start].map((p) => `${p[0]},${p[1]}`).join('|');
      r = await route({ profile, vars, lonlats }, pace);
      // Památky jsou často namačkané v centru – vyjde-li okruh přes ně o hodně kratší / delší, bere se okruh dané délky.
      if (r.km < km * 0.65 || r.km > km * 1.5) r = null;
    }
  }
  if (!r) {
    // Okruh: BRouter položí body na kružnici o poloměru R; délka vyjde ~5–6× R (ve městě víc objížděk).
    const direction = (variant * 72 + 30) % 360;
    let radiusM = (km * 1000) / (q.scenery === 'city' ? 6 : 5.2);
    const lonlats = `${start[0]},${start[1]}`;
    r = await route({ profile, vars, lonlats, round: { radiusM, direction } }, pace);
    if (Math.abs(r.km - km) / km > 0.12) {
      radiusM *= km / Math.max(1, r.km);
      r = await route({ profile, vars, lonlats, round: { radiusM, direction } }, pace);
    }
    via = [];
  }
  return {
    ...r,
    target: km, bike, scenery: q.scenery || 'mixed', hills: q.hills || 'normal', variant,
    start: { lon: start[0], lat: start[1] },
    via: via.map((s) => ({ name: s.name, lat: s.lat, lon: s.lon })),
    mapyUrl: mapyUrl(start, r.geometry, bike),
    googleUrl: googleUrl(start, r.geometry),
  };
}

/** DEMO režim: kruh kolem bodu (bez sítě). */
export function mockBikeLoop(q) {
  const km = Math.min(150, Math.max(5, Number(q.km) || 30));
  const rKm = km / (2 * Math.PI);
  const geometry = Array.from({ length: 73 }, (_, i) => {
    const a = (i / 72) * 2 * Math.PI;
    return [q.lon + (rKm / (111 * Math.cos((q.lat * Math.PI) / 180))) * Math.sin(a), q.lat + (rKm / 111) * (1 - Math.cos(a)), 200 + Math.round(60 * Math.sin(a * 2))];
  });
  const start = [q.lon, q.lat];
  const bike = BIKES[q.bike] ? q.bike : 'trekking';
  return {
    km, ascent: Math.round(km * 8), minutes: Math.round((km / 16) * 60 * BIKES[bike].pace), unpavedPct: 20, cyclePct: 35, busyPct: 5, geometry,
    target: km, bike, scenery: q.scenery || 'mixed', hills: q.hills || 'normal', variant: Number(q.variant) || 0,
    start: { lon: q.lon, lat: q.lat }, via: [], mapyUrl: mapyUrl(start, geometry, bike), googleUrl: googleUrl(start, geometry),
  };
}
