// Volitelné napojení na REST API Mapy.com (developer.mapy.com, Seznam.cz) – jen s klíčem MAPY_API_KEY. Bez klíče se
// nic nevolá a vše jede jako dřív (BRouter, OpenFreeMap, Open-Meteo). S klíčem:
// - turistická mapa (outdoor) pod trasou pěšky a na kole – dlaždice přes server (/api/tiles/mapy/…),
// - hledání míst v Objevuj doplní Mapy.com (vesnice, části obcí, adresy, hrady, rozhledny…),
// - když BRouter neodpovídá, trasu pěšky / na kole naplánuje Mapy.com (výšky z jejich výškového profilu).
// Klíč zůstává na serveru (hlavička X-Mapy-Api-Key): klíč v prohlížeči by šel opsat a omezení na doménu (Referer)
// obejde každý skript – cizí by pak vyčerpal volné kredity. Přes server navíc platí strop kreditů a mezipaměť dlaždic.
// Kredity (základní tarif 250 000 zdarma měsíčně, po vyčerpání služba do konce měsíce stojí – placená spotřeba se bez
// souhlasu nezapne): dlaždice 1, hledání / trasa / výškový profil 4. Strop config.mapyMaxPerHour (MAPY_MAX_PER_HOUR).
import { config } from '../config.js';
import { request } from './http.js';
import { haversineKm } from './geo.js';
import { UA } from './brouter.js';

export const MAPY_API = (process.env.MAPY_API_URL || 'https://api.mapy.com').replace(/\/$/, '');
export const COST = { route: 4, geocode: 4, elevation: 4, tile: 1 };
export const MAPSETS = ['basic', 'outdoor', 'winter', 'aerial'];
const RETINA = new Set(['basic', 'outdoor']); // @2x (512 px) jen u základní a turistické mapy

/** Je klíč (a není DEMO)? Jen pak se Mapy.com vůbec volá. */
export const mapyOn = () => Boolean(config.mapyKey) && !config.mock;

// Strop kreditů na hodinu (pevné okno od prvního dotazu).
const budget = { start: 0, used: 0 };
function charge(n) {
  const now = Date.now();
  if (now - budget.start >= 3600e3) Object.assign(budget, { start: now, used: 0 });
  if (budget.used + n > config.mapyMaxPerHour) return false;
  budget.used += n;
  return true;
}

// Pojistka: odmítnutý klíč nebo došlé kredity (401/402/403) → hodinu bez Mapy.com, 429 → podle Retry-After (aspoň minuta),
// výpadek 3× po sobě → 5 minut. Nenalezená trasa (404) a neplatné parametry (422) pojistku nespustí.
const breaker = { until: 0, why: '', fails: 0 };
function trip(ms, why) {
  breaker.until = Math.max(breaker.until, Date.now() + ms);
  breaker.why = why;
  breaker.fails = 0;
}
function onError(e) {
  const s = e?.status;
  if (s === 401 || s === 402 || s === 403) trip(3600e3, `odmítá klíč (HTTP ${s}) – neplatný klíč, nebo došly volné kredity`);
  else if (s === 429) trip(Math.max(60, Number(e.retryAfter) || 0) * 1000, 'omezuje počet dotazů (HTTP 429)');
  else if (!s || s >= 500) {
    if (++breaker.fails >= 3) trip(5 * 60e3, s ? `má výpadek (HTTP ${s})` : 'neodpovídá');
  }
}
export const mapyBlocked = () => Date.now() < breaker.until;
/** Mapy.com teď jde použít (klíč, žádná pojistka, zbývá aspoň n kreditů z hodinového stropu). */
export function mapyReady(n = COST.route) {
  if (!mapyOn() || mapyBlocked()) return false;
  return Date.now() - budget.start >= 3600e3 || budget.used + n <= config.mapyMaxPerHour;
}

/** Stav pro /api/health (bez klíče). */
export function mapyStatus() {
  const fresh = Date.now() - budget.start >= 3600e3;
  return {
    id: 'mapy', name: 'Mapy.com', kind: 'maps', enabled: mapyOn(),
    note: 'turistická mapa u tras pěšky a na kole, hledání míst v Objevuj, záloha plánovače tras',
    blocked: mapyBlocked(), retryAfter: Math.max(0, Math.ceil((breaker.until - Date.now()) / 1000)), reason: mapyBlocked() ? breaker.why : null,
    credits: { usedThisHour: fresh ? 0 : budget.used, maxPerHour: config.mapyMaxPerHour },
    hint: config.mock ? 'V DEMO režimu se Mapy.com nevolá'
      : !config.mapyKey ? 'Volitelné: zdarma API klíč z developer.mapy.com → MAPY_API_KEY (turistická mapa, hledání vesnic a míst, záloha tras)'
        : mapyBlocked() ? `Mapy.com ${breaker.why} – teď se vynechává, znovu za ${Math.max(1, Math.round((breaker.until - Date.now()) / 60e3))} min` : null,
  };
}

const err = (msg, code) => Object.assign(new Error(msg), { code });
function gate(cost) {
  if (!mapyOn()) throw err('Mapy.com není zapnuté (chybí MAPY_API_KEY).', 'MAPY_OFF');
  if (mapyBlocked()) throw err(`Mapy.com ${breaker.why}`, 'MAPY_BLOCKED');
  if (!charge(cost)) throw err('Mapy.com: hodinový strop kreditů je vyčerpaný.', 'MAPY_BUDGET');
}
const headers = () => ({ 'X-Mapy-Api-Key': config.mapyKey, 'User-Agent': UA });

/** GET na REST API (params = pole dvojic, opakovaný parametr víckrát). Chyba → pojistka a výjimka dál. */
async function api(path, params, cost, timeoutMs = 10000) {
  gate(cost);
  try {
    const j = await request(`${MAPY_API}${path}?${new URLSearchParams(params)}`, { headers: headers(), timeoutMs, retries: 0 });
    breaker.fails = 0;
    return j;
  } catch (e) {
    onError(e);
    throw e;
  }
}

const ll = (p) => `${Number(p[0]).toFixed(5)},${Number(p[1]).toFixed(5)}`; // lon,lat

/** Trasa start → (až 15 průjezdních bodů) → cíl. routeType: foot_hiking, bike_road, bike_mountain… → { m, s, coords [[lon, lat]] }. */
export async function mapyRoute({ start, end, waypoints = [], routeType }) {
  const params = [['start', ll(start)], ['end', ll(end)], ['routeType', routeType], ['format', 'geojson'], ['lang', 'cs']];
  if (waypoints.length) params.push(['waypoints', waypoints.slice(0, 15).map(ll).join(';')]);
  const j = await api('/v1/routing/route', params, COST.route, 20000);
  const coords = j?.geometry?.geometry?.coordinates || j?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2 || !(Number(j.length) > 0)) throw new Error('Mapy.com nevrátilo žádnou trasu.');
  return { m: Number(j.length), s: Number(j.duration) || 0, coords };
}

/** Nadmořské výšky bodů [[lon, lat]] (nejvýš 256 v jednom dotazu) → [m | null]. */
export async function mapyElevation(points) {
  const pts = points.slice(0, 256);
  const j = await api('/v1/elevation', [['positions', pts.map(ll).join(';')]], COST.elevation);
  return pts.map((_, i) => {
    const e = Number(j?.items?.[i]?.elevation);
    return Number.isFinite(e) && e > -1000 ? e : null; // -100000 = výška neznámá
  });
}

// Druhy míst pro Objevuj: obce, části obcí (menší vesnice), adresy a body zájmu (hrady, rozhledny, chaty…);
// státy a kraje ne (země má Objevuj vlastní, kraj není místo, odkud se vyráží).
const SUGGEST_TYPES = ['regional.municipality', 'regional.municipality_part', 'regional.address', 'poi'];
const posOf = (p) => (Array.isArray(p) ? { lon: Number(p[0]), lat: Number(p[1]) } : { lon: Number(p?.lon), lat: Number(p?.lat) });

/** Našeptávač Mapy.com → [{ name, label (druh místa), location, lat, lon, cc, type }]. */
export async function mapySuggest(query, { limit = 6, lang = 'cs' } = {}) {
  const q = String(query || '').trim().slice(0, 150);
  if (q.length < 2) return [];
  const params = [['query', q], ['lang', lang], ['limit', String(Math.min(15, limit))], ...SUGGEST_TYPES.map((t) => ['type', t])];
  const j = await api('/v1/suggest', params, COST.geocode, 6000);
  return (j?.items || []).map((it) => {
    const { lon, lat } = posOf(it.position);
    const cc = String((it.regionalStructure || []).find((r) => r.type === 'regional.country')?.isoCode || '').toUpperCase();
    return { name: String(it.name || '').trim(), label: String(it.label || ''), location: String(it.location || ''), lat, lon, cc, type: String(it.type || '') };
  }).filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180);
}

/* ---------- trasa z Mapy.com ve tvaru parseRoute (bike.js) ---------- */

/** Kumulativní vzdálenost bodů trasy v km. */
function cumKm(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]));
  return cum;
}

/**
 * Trasa z Mapy.com → { km, ascent, descent, minutes, …Pct: null (povrch a druh cesty Mapy.com nevrací), geometry
 * [[lon, lat, výška]], source: 'mapy' }. Výšky: jeden dotaz na výškový profil (≤ 120 bodů rovnoměrně po trase),
 * mezi nimi dopočítané; když nevyjde, stoupání null (UI ho neukáže).
 */
export async function mapyRouteFull(args, { maxPoints = 2500, samples = 120 } = {}) {
  const { m, s, coords } = await mapyRoute(args);
  const step = Math.max(1, Math.ceil(coords.length / maxPoints));
  const pts = coords.filter((_, i) => i % step === 0 || i === coords.length - 1).map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  const cum = cumKm(pts);
  const total = cum.at(-1) || 0;
  // vzorky rovnoměrně po délce (index bodu trasy pro každý)
  const idx = [];
  for (let k = 0, i = 0; k < samples; k++) {
    const target = (total * k) / (samples - 1);
    while (i < pts.length - 1 && cum[i] < target) i++;
    if (idx.at(-1) !== i) idx.push(i);
  }
  let eles = null;
  try {
    eles = await mapyElevation(idx.map((i) => pts[i]));
  } catch {
    eles = null; // výšky nejsou podmínkou – trasa platí i bez nich
  }
  const known = eles ? idx.map((i, k) => [cum[i], eles[k]]).filter((x) => x[1] != null) : [];
  let ascent = null;
  let descent = null;
  const geometry = pts.map((p) => [p[0], p[1], null]);
  if (known.length >= 2) {
    // výška každého bodu lineárně mezi vzorky
    for (let i = 0, k = 0; i < pts.length; i++) {
      while (k < known.length - 2 && known[k + 1][0] < cum[i]) k++;
      const [d0, e0] = known[k];
      const [d1, e1] = known[k + 1];
      const t = d1 > d0 ? Math.min(1, Math.max(0, (cum[i] - d0) / (d1 - d0))) : 0;
      geometry[i][2] = Math.round(e0 + (e1 - e0) * t);
    }
    // stoupání a klesání s necitlivostí 5 m (jako „filtered ascend“ BRouteru – drobné zuby terénu se nesčítají)
    ascent = 0;
    descent = 0;
    let ref = known[0][1];
    for (const [, e] of known) {
      if (e - ref >= 5) { ascent += e - ref; ref = e; } else if (ref - e >= 5) { descent += ref - e; ref = e; }
    }
    ascent = Math.round(ascent);
    descent = Math.round(descent);
  }
  return {
    km: Math.round(m / 100) / 10, ascent, descent, minutes: Math.round(s / 60),
    unpavedPct: null, cyclePct: null, trailPct: null, roadPct: null, busyPct: null,
    geometry, source: 'mapy',
  };
}

/**
 * Okruh bez BRouteru: body na kružnici o poloměru radiusM, která prochází startem a leží ve směru direction (°),
 * jako round-trip BRouteru (roundTripPoints=5) – start → 4 body po obvodu → start.
 */
export function roundWaypoints(start, radiusM, direction, n = 4) {
  const [lon0, lat0] = start;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180); // km na stupeň délky
  const R = radiusM / 1000;
  const a = (direction * Math.PI) / 180;
  const cx = R * Math.sin(a);
  const cy = R * Math.cos(a);
  const out = [];
  for (let k = 1; k <= n; k++) {
    // úhel od středu ke startu je a + 180°; body po obvodu dál po směru hodinových ručiček
    const t = a + Math.PI + (2 * Math.PI * k) / (n + 1);
    out.push([Math.round((lon0 + (cx + R * Math.sin(t)) / kx) * 1e5) / 1e5, Math.round((lat0 + (cy + R * Math.cos(t)) / 111.2) * 1e5) / 1e5]);
  }
  return out;
}

/* ---------- dlaždice (proxy /api/tiles/mapy/{set}/{z}/{x}/{y}[@2x]) ---------- */

/** Cesta dlaždice → { set, z, x, y, hd } nebo null (neznámá sada, zoom mimo 0–20, x/y mimo mřížku, @2x u sady bez retiny). */
export function parseTile(path) {
  const m = /^\/api\/tiles\/mapy\/([a-z]+)\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})(@2x)?(?:\.png)?$/.exec(String(path));
  if (!m) return null;
  const [, set, zs, xs, ys, hd] = m;
  const z = Number(zs);
  const x = Number(xs);
  const y = Number(ys);
  if (!MAPSETS.includes(set) || z > 20 || x >= 2 ** z || y >= 2 ** z) return null;
  if (hd && !RETINA.has(set)) return null;
  return { set, z, x, y, hd: Boolean(hd) };
}

// Malá LRU mezipaměť dlaždic v paměti serveru (nejvýš ~24 MB, den): stejná dlaždice podruhé = bez kreditu.
const TILE_MAX_BYTES = 24e6;
const TILE_TTL = 864e5;
const tiles = new Map();
const tileWait = new Map();
let tileBytes = 0;
const tileKey = (t) => `${t.set}/${t.z}/${t.x}/${t.y}${t.hd ? '@2x' : ''}`;
function tileGet(key) {
  const e = tiles.get(key);
  if (!e) return null;
  tiles.delete(key);
  if (Date.now() - e.at > TILE_TTL) { tileBytes -= e.body.length; return null; }
  tiles.set(key, e); // naposledy použitá na konec
  return e;
}
function tilePut(key, e) {
  tiles.set(key, e);
  tileBytes += e.body.length;
  for (const [k, old] of tiles) {
    if (tileBytes <= TILE_MAX_BYTES) break;
    tiles.delete(k);
    tileBytes -= old.body.length;
  }
}
export const tileCached = (t) => tiles.has(tileKey(t));
export const tileStats = () => ({ tiles: tiles.size, bytes: tileBytes });

/** Dlaždice z mezipaměti, jinak z Mapy.com (1 kredit) → { body: Buffer, type }. Chybová dlaždice (obrázek s textem chyby) se nevrací. */
export async function mapyTile(t) {
  const key = tileKey(t);
  const hit = tileGet(key);
  if (hit) return hit;
  if (tileWait.has(key)) return tileWait.get(key);
  const p = (async () => {
    gate(COST.tile);
    let res;
    try {
      res = await fetch(`${MAPY_API}/v1/maptiles/${t.set}/256${t.hd ? '@2x' : ''}/${t.z}/${t.x}/${t.y}?lang=cs`, { headers: headers(), signal: AbortSignal.timeout(10000) });
    } catch (e) {
      onError(e);
      throw e;
    }
    if (!res.ok) {
      const e = Object.assign(new Error(`Mapy.com: dlaždice HTTP ${res.status}`), { status: res.status, retryAfter: Number(res.headers.get('retry-after')) || 0 });
      onError(e);
      throw e;
    }
    const type = res.headers.get('content-type') || '';
    if (!/^image\//.test(type)) throw new Error('Mapy.com: dlaždice není obrázek');
    const e = { body: Buffer.from(await res.arrayBuffer()), type, at: Date.now() };
    breaker.fails = 0;
    tilePut(key, e);
    return e;
  })();
  tileWait.set(key, p);
  try {
    return await p;
  } finally {
    tileWait.delete(key);
  }
}

/** Jen pro testy: vynulovat strop, pojistku a mezipaměť dlaždic. */
export function _resetMapy() {
  Object.assign(budget, { start: 0, used: 0 });
  Object.assign(breaker, { until: 0, why: '', fails: 0 });
  tiles.clear();
  tileWait.clear();
  tileBytes = 0;
}
