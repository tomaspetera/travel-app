// Přejezdy mezi místy trasy (a z/na letiště): silniční vzdálenost a čas autem z plánovače tras BRouter
// (profil car-fast, volný provoz), k tomu provoz podle regionu, zácpy ve velkých metropolích, hraniční
// kontrola a veřejná doprava podle země – vlakem jen tam, kde se mezi městy jezdí vlakem, jinde autobusem
// či minibusem. Když trasa není (bez sítě, mimo rozpočet dotazů, chyba), stejná pravidla nad odhadem ze
// vzdušné vzdálenosti. Pravidla a zdroje: data/transfers.json, kalibrace v README (Přejezdy mezi místy).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { haversineKm } from './geo.js';
import { cache } from './cache.js';
import { HttpError } from './http.js';
import { BROUTER, brouterGet } from './brouter.js';
import { countryAt } from './airports.js';
import { stationNearCached } from './bike.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RULES = JSON.parse(readFileSync(path.join(root, 'data', 'transfers.json'), 'utf8'));

const REGION_OF = new Map();
for (const [key, r] of Object.entries(RULES.regions)) for (const cc of r.cc) REGION_OF.set(cc, key);
const OTHER = { f: 1.2, v: 90, detour: 1.25, bus: 1.25 }; // země mimo tabulku
const AFRICA = new Set(['waf', 'caf', 'eaf', 'saf']);
const EUROPE = new Set(['weu', 'seu']);
const RAIL = new Set(RULES.rail.cc);
const OPEN = RULES.openBorders.groups.map((g) => new Set(g));
const JAMS = RULES.congestion.cities.map(([name, lat, lon, km, min]) => ({ name, lat, lon, km, min }));
const HSR = RULES.hsr.cities.map(([cc, name, lat, lon]) => ({ cc, name, lat, lon }));

const ccOf = (p) => (/^[A-Z]{2}$/.test(p?.cc || '') ? p.cc : countryAt(p.lat, p.lon));
export const regionKey = (cc) => REGION_OF.get(cc) || null;
const regionOf = (cc) => RULES.regions[regionKey(cc)] || OTHER;
const round5 = (m) => (m <= 0 ? 0 : Math.max(5, Math.round(m / 5) * 5));

/** Bez hraniční kontroly: stejná země, Schengen, nebo Británie s Irskem. */
export function openBorder(a, b) {
  return !a || !b || a === b || OPEN.some((g) => g.has(a) && g.has(b));
}

/** Minuty za přechod hranice (car | rail | bus). */
export function borderMin(a, b, mode) {
  if (openBorder(a, b)) return 0;
  const ra = regionKey(a);
  const rb = regionKey(b);
  const t = RULES.border[mode];
  if (EUROPE.has(ra) && EUROPE.has(rb)) return t.europe;
  if (mode === 'bus' && (AFRICA.has(ra) || AFRICA.has(rb))) return t.africa;
  return t.other;
}

/** Zácpy: metropole, ve které přejezd začíná nebo končí (začátek i konec v téže = jednou). */
export function congestionMin(a, b) {
  const near = (p) => JAMS.find((j) => haversineKm(p.lat, p.lon, j.lat, j.lon) <= j.km) || null;
  const ja = near(a);
  const jb = near(b);
  return (ja?.min || 0) + (jb && jb !== ja ? jb.min : 0);
}

/**
 * Veřejná doprava: 'rail' jen v zemích, kde se mezi městy jezdí vlakem (obě místa), a ne tam, kde
 * mezipaměť nádraží (stationsNear z výletů na kole) ví, že u místa žádné není; jinak 'bus'.
 */
export function transitKind(a, b, ccA = ccOf(a), ccB = ccOf(b)) {
  if (!RAIL.has(ccA || ccB) || !RAIL.has(ccB || ccA)) return 'bus';
  if (stationNearCached(a.lat, a.lon) === false || stationNearCached(b.lat, b.lon) === false) return 'bus';
  return 'rail';
}

/** Vysokorychlostní vlak mezi dvěma městy na trati v téže zemi (min), jinak null. */
export function hsrMin(a, b, air = haversineKm(a.lat, a.lon, b.lat, b.lon)) {
  if (air < 80) return null;
  const hub = (p) => HSR.find((h) => haversineKm(p.lat, p.lon, h.lat, h.lon) <= 12);
  const ha = hub(a);
  const hb = hub(b);
  // ~170 km/h vzdušnou čarou + cesta na nádraží a čekání (Milán–Boloňa ~1 h 50 min, Milán–Řím ~3 h 30 min)
  return ha && hb && ha !== hb && ha.cc === hb.cc ? Math.round(40 + air * 0.35) : null;
}

/** Čas autem bez kolon jen ze vzdušné vzdálenosti (když trasa z BRouteru není): rychlost podle regionu. */
export function freeEstimate(air, reg) {
  const km = air * reg.detour;
  const v = 45 + (reg.v - 45) * Math.min(1, km / 200);
  return { km: Math.round(km), min: (km / v) * 60 };
}

/**
 * Přejezd a → b ({ lat, lon, cc? }); route = { km, min } z BRouteru (volný provoz), nebo null = odhad.
 * Auto: čas trasy × provoz regionu + 5 min (start a cíl ve městě) + zácpy v metropoli + hranice.
 * Vlak: auto bez hranice + nádraží a čekání (10–30 min) + hranice; mezi městy na VRT nejvýš hsrMin.
 * Autobus / minibus: auto × 1,2–1,3 (zastávky) + čekání (15–45 min) + hranice (v Africe 2 h – přestup na hranici).
 */
export function transferTimes(a, b, route = null) {
  const air = haversineKm(a.lat, a.lon, b.lat, b.lon);
  const ccA = ccOf(a);
  const ccB = ccOf(b);
  const kind = transitKind(a, b, ccA, ccB);
  if (air < 1) return { km: 0, carMin: 0, transitMin: 0, transitKind: kind, border: null, basis: 'estimate' };
  const ra = regionOf(ccA);
  const rb = regionOf(ccB);
  const reg = ra.f >= rb.f ? ra : rb; // přes dva regiony platí pomalejší
  const free = route && route.min > 0 ? route : freeEstimate(air, reg);
  const drive = free.min * reg.f + 5 + congestionMin(a, b);
  const share = Math.min(1, air / 60); // krátký přejezd (letiště → město) = kratší čekání na spoj
  let transit = kind === 'rail'
    ? drive + 10 + 20 * share + borderMin(ccA, ccB, 'rail')
    : drive * reg.bus + 15 + 30 * share + borderMin(ccA, ccB, 'bus');
  const hsr = kind === 'rail' && ccA === ccB ? hsrMin(a, b, air) : null;
  if (hsr && hsr < transit) transit = hsr;
  return {
    km: Math.round(route?.km ?? free.km),
    carMin: round5(drive + borderMin(ccA, ccB, 'car')),
    transitMin: round5(transit),
    transitKind: kind,
    border: openBorder(ccA, ccB) ? null : { from: ccA, to: ccB },
    basis: route && route.min > 0 ? 'route' : 'estimate',
    ...(hsr && transit === hsr ? { hsr: true } : {}),
  };
}

/* ---------- trasa autem z BRouteru ---------- */

const ROUTE_TTL = 30 * 864e5;
const FAIL_TTL = 6 * 3600e3; // trasa nenalezena: chvíli znovu nezkoušet
const DOWN_TTL = 10 * 60e3; // plánovač neodpovídá (výpadek, timeout): zkusit až za chvíli
const MAX_AIR_KM = 500; // delší výpočty veřejný server často utne – odhad
const r2 = (x) => Math.round(x * 100) / 100;
const pt = (p) => ({ lat: r2(p.lat), lon: r2(p.lon) });

/** Klíč mezipaměti: zaokrouhlené body (~1 km), bez ohledu na směr (tam ≈ zpět). */
export function routeKey(a, b) {
  return `drive:${[`${r2(a.lat)},${r2(a.lon)}`, `${r2(b.lat)},${r2(b.lon)}`].sort().join(';')}`;
}
/** Trasa z mezipaměti ({ km, min }), jinak null (i nenalezená). */
export function cachedRoute(a, b) {
  const v = cache.get(routeKey(a, b));
  return v && !v.fail ? v : null;
}

const driveUrl = (a, b, profile) => `${BROUTER}?lonlats=${a.lon},${a.lat}|${b.lon},${b.lat}&profile=${profile}&alternativeidx=0&format=geojson`;

/** Odpověď BRouteru → { km, min } (délka a čas bez kolon). */
export function parseDrive(json) {
  const p = json?.features?.[0]?.properties;
  const m = Number(p?.['track-length']);
  const s = Number(p?.['total-time']);
  if (!(m > 0) || !(s > 0)) throw new Error('Plánovač tras nevrátil trasu.');
  return { km: Math.round(m / 100) / 10, min: s / 60 };
}

// bod o ~1,5 km blíž k druhému (střed města bývá pěší zóna – BRouter hlásí „target island“)
const nudge = (p, q) => {
  const d = haversineKm(p.lat, p.lon, q.lat, q.lon) || 1;
  const f = Math.min(0.3, 1.5 / d);
  return { lat: p.lat + (q.lat - p.lat) * f, lon: p.lon + (q.lon - p.lon) * f };
};

/**
 * Trasa autem a → b (BRouter, v mezipaměti 30 dní). Nejvýš 2 dotazy: car-fast; když bod leží na
 * „ostrově“ sítě (pěší zóna), znovu s body posunutými k sobě; při jiné chybě výpočtu profil car-eco
 * (jezdí max. ~80 km/h – čas se přepočte na car-fast: nad 70 km/h průměru × 0,72, jinak × 0,92).
 * Nenalezená trasa → { fail: true } (6 h), výpadek plánovače → { fail: true, transient: true } (10 min),
 * plná fronta dotazů → chyba (nic se neukládá).
 */
export function driveRoute(a, b, { get = brouterGet } = {}) {
  const [p, q] = [pt(a), pt(b)].sort((x, y) => `${x.lat},${x.lon}`.localeCompare(`${y.lat},${y.lon}`));
  return cache.wrap(routeKey(a, b), (v) => (v.transient ? DOWN_TTL : v.fail ? FAIL_TTL : ROUTE_TTL), async () => {
    const call = async (u, v, profile) => parseDrive(await get(driveUrl(u, v, profile), { timeoutMs: 15000, retries: 0 }));
    try {
      return await call(p, q, 'car-fast');
    } catch (e) {
      if (e.code === 'BUSY') throw e;
      if (!(e instanceof HttpError) || e.status !== 400) return { fail: true, transient: true };
      try {
        if (/island|no track|not mapped|position/i.test(e.body || '')) return await call(nudge(p, q), nudge(q, p), 'car-fast');
        const eco = await call(p, q, 'car-eco');
        const kmh = eco.km / (eco.min / 60);
        return { km: eco.km, min: eco.min * (kmh >= 70 ? 0.72 : 0.92) };
      } catch {
        return { fail: true };
      }
    }
  });
}

/**
 * Trasy pro přejezdy (pairs [[a, b]…]) s rozpočtem: nejvýš maxNew nových výpočtů a čekání do deadlineMs.
 * Co do termínu nedoběhne, počítá se dál na pozadí (výsledek se uloží do mezipaměti) a vrací se jako
 * pending – další přepočet ho už vezme z mezipaměti. → { routes: Map(klíč → { km, min } | null), pending }
 */
export async function routeTransfers(pairs, { route = driveRoute, deadlineMs = 9000, maxNew = 8 } = {}) {
  const got = new Map(); // klíč → { km, min } | null | undefined (ještě se počítá)
  const jobs = [];
  let started = 0;
  for (const [a, b] of pairs) {
    const key = routeKey(a, b);
    if (got.has(key)) continue;
    const hit = cache.get(key);
    if (hit) { got.set(key, hit.fail ? null : hit); continue; }
    const air = haversineKm(a.lat, a.lon, b.lat, b.lon);
    if (!route || air < 2 || air > MAX_AIR_KM || started >= maxNew) { got.set(key, null); continue; }
    started++;
    got.set(key, undefined);
    jobs.push(Promise.resolve().then(() => route(a, b)).then((v) => { got.set(key, v && !v.fail ? v : null); }, () => { got.set(key, null); }));
  }
  let timer;
  await Promise.race([Promise.all(jobs), new Promise((res) => { timer = setTimeout(res, deadlineMs); })]);
  clearTimeout(timer);
  const routes = new Map([...got].map(([k, v]) => [k, v ?? null]));
  return { routes, pending: [...got.values()].filter((v) => v === undefined).length };
}
