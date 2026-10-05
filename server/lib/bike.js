// Výlety na kole a pěšky: okruh zadané délky z místa, přes BRouter (https://brouter.de – plánovač tras
// nad OpenStreetMap, zdarma a bez klíče). Typ kola → profil (silniční, trek, gravel, horské), pěšky →
// profil hiking-mountain; krajina → přednost lesům a řekám / památkám ve městě, kopce → cena stoupání.
// Na kole i „vlakem tam, na kole zpět“: nádraží (Wikidata) v dosahu zvolené délky a trasa z něj domů.
// Výsledek: délka, stoupání, odhad času, povrch, trasa (pro mapu a GPX) a odkazy do Mapy.com a Google Map.
import { request, limiter } from './http.js';
import { cache } from './cache.js';
import { haversineKm, normalize } from './geo.js';
import { wdqs } from './poi.js';

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
// Pěšky: profil hiking-mountain (profil „hiking“ na brouter.de není), v Mapy.com turistická trasa.
export const HIKE = { profile: 'hiking-mountain', mapy: 'foot_hiking' };

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

/**
 * Parametry pěšího profilu (proměnné z hiking-mountain.brf). Výchozí profil převýšení neřeší vůbec
 * a značené turistické trasy zvýhodňuje mírně (hiking_routes_preference 0,2).
 * Přírodou: lesy, voda, mimo města a hluk, silnější přednost značeným trasám (0,6).
 * Spíš rovina: consider_elevation – každý metr stoupání i klesání něco stojí.
 * Do kopců: přednost pěšinám (path_preference) a horským stezkám SAC T2 – kopce BRouter sám nevyhledá.
 */
export function hikeVars(scenery, hills) {
  const v = {};
  if (scenery === 'nature') Object.assign(v, { consider_forest: 1, consider_river: 1, consider_town: 1, consider_noise: 1, hiking_routes_preference: 0.6 });
  if (hills === 'flat') v.consider_elevation = 1;
  if (hills === 'hilly') Object.assign(v, { path_preference: 5, SAC_scale_preferred: 2 });
  return v;
}

/** Čas chůze podle DIN 33466 (turistický vzorec): 4 km/h, 300 m stoupání a 500 m klesání za hodinu; kratší z obou časů se přičte polovinou. */
export function hikeMinutes(km, ascent, descent = ascent) {
  const h = km / 4;
  const v = ascent / 300 + descent / 500;
  return Math.round((Math.max(h, v) + Math.min(h, v) / 2) * 60);
}

function brouterUrl({ profile, vars, lonlats, round }) {
  const parts = [`profile=${profile}`, 'alternativeidx=0', 'format=geojson', `lonlats=${lonlats}`];
  if (round) parts.push('engineMode=4', `roundTripDistance=${Math.round(round.radiusM)}`, 'roundTripPoints=5', `direction=${round.direction}`);
  for (const [k, val] of Object.entries(vars)) parts.push(`profile:${k}=${val}`);
  return `${BROUTER}?${parts.join('&')}`;
}

const PAVED = /surface=(asphalt|concrete|paved|paving_stones|sett|chipseal|metal|wood)\b/;
const UNPAVED = /surface=(unpaved|gravel|fine_gravel|dirt|ground|grass|compacted|earth|mud|sand|pebblestone|rock|woodchips)\b/;
// značená turistická trasa (KČT, Wanderweg…) – jako any_hiking_route v profilu hiking-mountain
const TRAIL = /route_(hiking|foot)_(iwn|nwn|rwn|lwn)?=yes/;
// silnice s provozem aut, u které mapa neuvádí chodník (OpenStreetMap ho ale nemusí mít zakreslený)
const ROAD = /highway=(trunk|primary|secondary|tertiary|unclassified)\b/;
const SIDEWALK = /sidewalk=(both|left|right|yes|separate)\b/;

/** Odpověď BRouteru (GeoJSON) → souhrn trasy + zjednodušená geometrie [lon, lat, výška]. */
export function parseRoute(json, { pace = 1, maxPoints = 2500 } = {}) {
  const f = json?.features?.[0];
  if (!f?.geometry?.coordinates?.length) throw new Error('Plánovač tras nevrátil žádnou trasu.');
  const p = f.properties || {};
  const coords = f.geometry.coordinates;
  let total = 0;
  let unpaved = 0;
  let cycle = 0;
  let trail = 0;
  let road = 0;
  let busy = 0;
  for (const m of (p.messages || []).slice(1)) {
    const d = Number(m[3]) || 0;
    const tags = String(m[9] || '');
    total += d;
    if (UNPAVED.test(tags) || (/highway=(track|path|bridleway)/.test(tags) && !PAVED.test(tags))) unpaved += d;
    if (/highway=cycleway|route_bicycle_(icn|ncn|rcn|lcn)=yes|cycleway[^=]*=(track|lane)/.test(tags)) cycle += d;
    if (TRAIL.test(tags)) trail += d;
    if (ROAD.test(tags) && !SIDEWALK.test(tags)) road += d;
    if (/highway=(trunk|primary|secondary)\b/.test(tags)) busy += d;
  }
  const pct = (x) => (total ? Math.round((x / total) * 100) : 0);
  const step = Math.max(1, Math.ceil(coords.length / maxPoints));
  const geometry = coords.filter((_, i) => i % step === 0 || i === coords.length - 1)
    .map(([lon, lat, ele]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5, Number.isFinite(ele) ? Math.round(ele) : null]);
  const ascent = Math.round(Number(p['filtered ascend']) || 0);
  // klesání = stoupání + (výška startu − výška cíle); u okruhu ≈ stoupání
  const [e0, e1] = [coords[0][2], coords.at(-1)[2]];
  return {
    km: Math.round(Number(p['track-length']) / 100) / 10,
    ascent,
    descent: Number.isFinite(e0) && Number.isFinite(e1) ? Math.max(0, Math.round(ascent + e0 - e1)) : ascent,
    minutes: Math.round(((Number(p['total-time']) || 0) / 60) * pace),
    unpavedPct: pct(unpaved),
    cyclePct: pct(cycle),
    trailPct: pct(trail),
    roadPct: pct(road),
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
/** Mapy.com: kind = typ kola nebo 'hike'; bez cíle okruh (cíl = start). */
export function mapyUrl(start, geometry, kind, end = start) {
  const routeType = kind === 'hike' ? HIKE.mapy : BIKES[kind]?.mapy || 'bike_mountain';
  const qs = new URLSearchParams({ mapset: 'outdoor', start: ll(start), end: ll(end), routeType });
  const wp = samplePoints(geometry, 13);
  if (wp.length) qs.set('waypoints', wp.map(ll).join(';'));
  return `https://mapy.com/fnc/v1/route?${qs}`;
}
export function googleUrl(start, geometry, travelmode = 'bicycling', end = start) {
  const latlon = (p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`;
  const qs = new URLSearchParams({ api: '1', origin: latlon(start), destination: latlon(end), travelmode });
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
 * Dosah a počet bodů podle aktivity (výchozí pro kolo).
 */
export function pickSights(q, km, variant = 0, { radius = Math.max(1.5, km / 6), n = Math.min(8, Math.max(3, Math.round(km / 5))) } = {}) {
  const dist = (s) => haversineKm(q.lat, q.lon, s.lat, s.lon);
  const near = (q.sights || []).filter((s) => dist(s) <= radius && dist(s) >= 0.2);
  const skip = variant % 3;
  const outer = near.filter((s) => dist(s) >= radius * 0.45).slice(skip);
  const inner = near.filter((s) => dist(s) < radius * 0.45).slice(skip);
  const pick = [...outer.slice(0, Math.ceil(n / 2)), ...inner].slice(0, n);
  for (const s of [...outer, ...inner]) if (pick.length < n && !pick.includes(s)) pick.push(s);
  const bearing = (s) => Math.atan2(s.lon - q.lon, s.lat - q.lat);
  return pick.sort((a, b) => bearing(a) - bearing(b));
}

/**
 * Okruh dané délky ze startu: „městem“ přes památky (když okruh přes ně vyjde rozumně dlouhý), jinak
 * round-trip BRouteru – body na kružnici o poloměru km / factor, při odchylce > 12 % jedna korekce.
 */
async function loopRoute(q, { km, profile, vars, pace = 1, factor, sights }) {
  const start = [Math.round(q.lon * 1e4) / 1e4, Math.round(q.lat * 1e4) / 1e4];
  const variant = Math.max(0, Math.round(Number(q.variant) || 0)) % 10;
  let r;
  let via = [];
  if (q.scenery === 'city') {
    via = pickSights(q, km, variant, sights);
    if (via.length >= 2) {
      const lonlats = [start, ...via.map((s) => [s.lon, s.lat]), start].map((p) => `${p[0]},${p[1]}`).join('|');
      r = await route({ profile, vars, lonlats }, pace);
      // Památky jsou často namačkané v centru – vyjde-li okruh přes ně o hodně kratší / delší, bere se okruh dané délky.
      if (r.km < km * 0.65 || r.km > km * 1.5) r = null;
    }
  }
  if (!r) {
    const direction = (variant * 72 + 30) % 360;
    let radiusM = (km * 1000) / factor;
    const lonlats = `${start[0]},${start[1]}`;
    r = await route({ profile, vars, lonlats, round: { radiusM, direction } }, pace);
    if (Math.abs(r.km - km) / km > 0.12) {
      radiusM *= km / Math.max(1, r.km);
      r = await route({ profile, vars, lonlats, round: { radiusM, direction } }, pace);
    }
    via = [];
  }
  return { r, start, variant, via: via.map((s) => ({ name: s.name, lat: s.lat, lon: s.lon })) };
}

/**
 * Okruh na kole. q: { lat, lon, km, bike, scenery: 'city'|'mixed'|'nature', hills: 'flat'|'normal'|'hilly',
 * variant (jiná trasa), sights: [{name, lat, lon}] (u „městem“ – památky po cestě) }
 */
export async function bikeLoop(q) {
  const bike = BIKES[q.bike] ? q.bike : 'trekking';
  const { profile, pace } = BIKES[bike];
  const km = Math.min(150, Math.max(5, Number(q.km) || 30));
  // Délka okruhu vyjde ~5–6× poloměr (ve městě víc objížděk).
  const { r, start, variant, via } = await loopRoute(q, { km, profile, vars: profileVars(bike, q.scenery, q.hills), pace, factor: q.scenery === 'city' ? 6 : 5.2 });
  return {
    ...r, activity: 'bike', kind: 'loop',
    target: km, bike, scenery: q.scenery || 'mixed', hills: q.hills || 'normal', variant,
    start: { lon: start[0], lat: start[1] }, via,
    mapyUrl: mapyUrl(start, r.geometry, bike),
    googleUrl: googleUrl(start, r.geometry),
  };
}

/** Pěší okruh – stejné volby jako na kole (bez typu kola), délka 2–40 km, čas chůze podle hikeMinutes. */
export async function hikeLoop(q) {
  const km = Math.min(40, Math.max(2, Number(q.km) || 10));
  // Pěšky vyjde okruh ~4,9× poloměr (změřeno: R 2,5 km → 12,2 km); památky v pěším dosahu.
  const { r, start, variant, via } = await loopRoute(q, {
    km, profile: HIKE.profile, vars: hikeVars(q.scenery, q.hills), factor: 4.9,
    sights: { radius: Math.max(1, km / 5), n: Math.min(8, Math.max(3, Math.round(km / 3))) },
  });
  return {
    ...r, minutes: hikeMinutes(r.km, r.ascent, r.descent), activity: 'hike', kind: 'loop',
    target: km, scenery: q.scenery || 'mixed', hills: q.hills || 'normal', variant,
    start: { lon: start[0], lat: start[1] }, via,
    mapyUrl: mapyUrl(start, r.geometry, 'hike'),
    googleUrl: googleUrl(start, r.geometry, 'walking'),
  };
}

// Nádraží v provozu – bez stavu užívání vyřazen z provozu, mimo provoz, zavřeno pro veřejnost, opuštěno, dočasně uzavřeno.
const CLOSED = ['Q11639308', 'Q56651571', 'Q55570340', 'Q63065035', 'Q55653430'];
function sparqlStations(lat, lon, km) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const f = (x) => x.toFixed(3);
  return `SELECT ?s ?sLabel ?coord ?sl ?cc WHERE {
  VALUES ?t { wd:Q55488 }
  ?s wdt:P31 ?t ; wdt:P625 ?coord ; wikibase:sitelinks ?sl .
  OPTIONAL { ?s wdt:P17 ?c . ?c wdt:P297 ?cc }
  FILTER(geof:latitude(?coord) > ${f(lat - dLat)} && geof:latitude(?coord) < ${f(lat + dLat)} && geof:longitude(?coord) > ${f(lon - dLon)} && geof:longitude(?coord) < ${f(lon + dLon)})
  FILTER NOT EXISTS { ?s wdt:P5817 ?closed . VALUES ?closed { ${CLOSED.map((x) => `wd:${x}`).join(' ')} } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en". }
} LIMIT 5000`;
}

/** Železniční stanice do km od bodu (Wikidata; v mezipaměti 30 dní po oblastech 0,1° a pásmech po 40 km). */
export async function stationsNear(lat, lon, km) {
  const R = Math.ceil(km / 40) * 40;
  const la = Math.round(lat * 10) / 10;
  const lo = Math.round(lon * 10) / 10;
  return cache.wrap(`wdqs-stations:${la}:${lo}:${R}`, (v) => (v.length ? 30 * 864e5 : 3600e3), async () => {
    const rows = await wdqs(sparqlStations(la, lo, R + 10), 45000);
    const by = new Map();
    for (const b of rows) {
      const id = String(b.s?.value || '').split('/').pop();
      const name = b.sLabel?.value;
      const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value || '');
      if (!id || !name || /^Q\d+$/.test(name) || !m || by.has(id)) continue;
      by.set(id, { id, name, lat: Number(m[2]), lon: Number(m[1]), sitelinks: Number(b.sl?.value) || 0, cc: b.cc?.value || '' });
    }
    return [...by.values()];
  });
}

// Město z názvu nádraží („Beroun-Závodí“, „Kutná Hora hlavní nádraží“ → beroun, kutna hora).
const townOf = (name) => normalize(String(name).split(/\s*[-–(,]\s*/)[0])
  .replace(/\b(hlavni|horni|dolni|nadrazi|mesto|zastavka|predmesti|hbf|bahnhof|station|gare|stazione)\b/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Nádraží pro „vlakem tam, na kole zpět“: vzdušně 0,7–1,15 × km / 1,3 od domova (cesta kličkuje),
 * jedno na město, větší (víc jazykových verzí článku) dřív a střídavě do různých směrů.
 */
export function pickStations(stations, home, km) {
  const d = km / 1.3;
  const ranked = stations.map((s) => ({ ...s, dist: haversineKm(home.lat, home.lon, s.lat, s.lon) }))
    .filter((s) => s.dist >= 0.7 * d && s.dist <= 1.15 * d)
    .sort((a, b) => b.sitelinks - a.sitelinks || Math.abs(a.dist - d) - Math.abs(b.dist - d));
  const towns = new Set();
  let rest = ranked.filter((s) => {
    const t = townOf(s.name);
    if (towns.has(t)) return false;
    towns.add(t);
    return true;
  });
  // po kolech: v každém kole nejvýš jedno nádraží na osminu obzoru (S, SV, V…)
  const out = [];
  while (rest.length) {
    const used = new Set();
    const next = [];
    for (const s of rest) {
      const deg = (Math.atan2((s.lon - home.lon) * Math.cos((home.lat * Math.PI) / 180), s.lat - home.lat) * 180) / Math.PI;
      const sector = Math.floor(((deg + 360 + 22.5) % 360) / 45);
      if (used.has(sector)) next.push(s);
      else {
        used.add(sector);
        out.push(s);
      }
    }
    rest = next;
  }
  return out;
}

// IDOS zná hlavní nádraží jako „hl.n.“ (Kutná Hora hl.n.).
const idosName = (name) => String(name).replace(/ hlavní nádraží$/, ' hl.n.');
function trainLinks(q, st, home) {
  const label = String(q.label || '').trim();
  const latlon = (p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`;
  return {
    idosUrl: label && q.cc === 'CZ' && st.cc === 'CZ' ? `https://idos.cz/vlakyautobusy/spojeni/?f=${encodeURIComponent(label)}&t=${encodeURIComponent(idosName(st.name))}` : null,
    googleUrl: `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: latlon(home), destination: latlon([st.lon, st.lat]), travelmode: 'transit' })}`,
  };
}

/**
 * Vlakem tam, na kole zpět. q jako u bikeLoop + label a cc domova (pro odkaz do IDOS); variant = pořadí
 * kandidáta. Trasa nádraží → domov; nesedí-li délka (0,75–1,35 × km), zkusí další nádraží (max. 3 pokusy).
 */
export async function bikeFromStation(q) {
  const bike = BIKES[q.bike] ? q.bike : 'trekking';
  const { profile, pace } = BIKES[bike];
  const vars = profileVars(bike, q.scenery, q.hills);
  const km = Math.min(150, Math.max(5, Number(q.km) || 30));
  const home = [Math.round(q.lon * 1e4) / 1e4, Math.round(q.lat * 1e4) / 1e4];
  const variant = Math.max(0, Math.round(Number(q.variant) || 0));
  const stations = await stationsNear(q.lat, q.lon, (1.15 * km) / 1.3).catch((e) => {
    throw Object.assign(new Error(`Nádraží: ${e.message}`), { code: 'WDQS' });
  });
  const cands = pickStations(stations, q, km);
  if (!cands.length) {
    throw Object.assign(new Error(`Ve vzdálenosti ~${Math.round(km / 1.3)} km vzdušnou čarou jsem nenašel vhodné nádraží – zkus jinou délku jízdy.`), { code: 'NO_STATION' });
  }
  let best = null;
  for (let i = 0; i < Math.min(3, cands.length); i++) {
    const idx = (variant + i) % cands.length;
    const st = cands[idx];
    const r = await route({ profile, vars, lonlats: `${st.lon},${st.lat}|${home[0]},${home[1]}` }, pace);
    const ok = r.km >= km * 0.75 && r.km <= km * 1.35;
    if (ok || !best || Math.abs(r.km - km) < Math.abs(best.r.km - km)) best = { r, st, idx };
    if (ok) break;
  }
  const { r, st, idx } = best;
  const from = [st.lon, st.lat];
  return {
    ...r, activity: 'bike', kind: 'train',
    target: km, bike, scenery: q.scenery === 'nature' ? 'nature' : 'mixed', hills: q.hills || 'normal', variant: idx,
    start: { lon: st.lon, lat: st.lat }, end: { lon: home[0], lat: home[1] }, via: [],
    station: { name: st.name, lat: st.lat, lon: st.lon, cc: st.cc },
    train: trainLinks(q, st, home),
    mapyUrl: mapyUrl(from, r.geometry, bike, home),
    googleUrl: googleUrl(from, r.geometry, 'bicycling', home),
  };
}

// DEMO režim (bez sítě): kruh zadané délky kolem bodu.
function mockRing(q, km, amp) {
  const rKm = km / (2 * Math.PI);
  return Array.from({ length: 73 }, (_, i) => {
    const a = (i / 72) * 2 * Math.PI;
    return [q.lon + (rKm / (111 * Math.cos((q.lat * Math.PI) / 180))) * Math.sin(a), q.lat + (rKm / 111) * (1 - Math.cos(a)), 200 + Math.round(amp * Math.sin(a * 2))];
  });
}

export function mockBikeLoop(q) {
  const km = Math.min(150, Math.max(5, Number(q.km) || 30));
  const geometry = mockRing(q, km, 60);
  const start = [q.lon, q.lat];
  const bike = BIKES[q.bike] ? q.bike : 'trekking';
  return {
    km, ascent: Math.round(km * 8), descent: Math.round(km * 8), minutes: Math.round((km / 16) * 60 * BIKES[bike].pace),
    unpavedPct: 20, cyclePct: 35, trailPct: 10, roadPct: 10, busyPct: 5, geometry, activity: 'bike', kind: 'loop',
    target: km, bike, scenery: q.scenery || 'mixed', hills: q.hills || 'normal', variant: Number(q.variant) || 0,
    start: { lon: q.lon, lat: q.lat }, via: [], mapyUrl: mapyUrl(start, geometry, bike), googleUrl: googleUrl(start, geometry),
  };
}

export function mockHikeLoop(q) {
  const km = Math.min(40, Math.max(2, Number(q.km) || 10));
  const geometry = mockRing(q, km, 40);
  const start = [q.lon, q.lat];
  const ascent = Math.round(km * 20);
  return {
    km, ascent, descent: ascent, minutes: hikeMinutes(km, ascent, ascent), unpavedPct: 45, cyclePct: 5, trailPct: 60, roadPct: 5, busyPct: 0, geometry,
    activity: 'hike', kind: 'loop', target: km, scenery: q.scenery || 'mixed', hills: q.hills || 'normal', variant: Number(q.variant) || 0,
    start: { lon: q.lon, lat: q.lat }, via: [], mapyUrl: mapyUrl(start, geometry, 'hike'), googleUrl: googleUrl(start, geometry, 'walking'),
  };
}

/** DEMO: vymyšlené nádraží ~km / 1,3 na sever a oblouk z něj domů. */
export function mockBikeFromStation(q) {
  const km = Math.min(150, Math.max(5, Number(q.km) || 30));
  const bike = BIKES[q.bike] ? q.bike : 'trekking';
  const d = km / 1.3;
  const st = { name: 'Demo nádraží', lat: Math.round((q.lat + d / 111) * 1e4) / 1e4, lon: q.lon, cc: q.cc || 'CZ' };
  const bulge = (0.35 * d) / (111 * Math.cos((q.lat * Math.PI) / 180));
  const r5 = (x) => Math.round(x * 1e5) / 1e5;
  const geometry = Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    return [r5(q.lon + bulge * Math.sin(Math.PI * t)), r5(st.lat * (1 - t) + q.lat * t), 260 - Math.round(60 * t) + Math.round(15 * Math.sin(t * 9))];
  });
  const from = [st.lon, st.lat];
  const home = [q.lon, q.lat];
  return {
    km, ascent: Math.round(km * 6), descent: Math.round(km * 6) + 60, minutes: Math.round((km / 16) * 60 * BIKES[bike].pace),
    unpavedPct: 15, cyclePct: 40, trailPct: 5, roadPct: 15, busyPct: 5, geometry, activity: 'bike', kind: 'train',
    target: km, bike, scenery: q.scenery === 'nature' ? 'nature' : 'mixed', hills: q.hills || 'normal', variant: Number(q.variant) || 0,
    start: { lon: st.lon, lat: st.lat }, end: { lon: q.lon, lat: q.lat }, via: [],
    station: st, train: trainLinks(q, st, home),
    mapyUrl: mapyUrl(from, geometry, bike, home), googleUrl: googleUrl(from, geometry, 'bicycling', home),
  };
}
