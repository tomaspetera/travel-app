// Dlouhodobé podnebí z data/climate.json (NASA POWER, průměr 2001–2020; sestavuje scripts/build-climate.mjs):
// průměrná denní maxima a minima (°C) a srážky (mm) po měsících v buňkách 0,5° u každého letiště.
// Pro hledání „za teplem“ a detail země – je to dlouhodobý průměr, ne předpověď.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AIRPORTS, airportsInCountry, getAirport } from './airports.js';
import { hubsOf } from './longhaul.js';
import { haversineKm } from './geo.js';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'climate.json');
let DATA = null;
const byIata = new Map();

// Načte se až při prvním dotazu (~0,5 MB).
function data() {
  if (!DATA) DATA = JSON.parse(readFileSync(FILE, 'utf8'));
  return DATA;
}

export const climateSource = () => data().source;

/** Klíč buňky 0,5° – stejně jako ve scripts/build-climate.mjs. */
export const cellKey = (lat, lon) => `${Math.round(lat * 2) / 2},${Math.round(lon * 2) / 2}`;

const unpack = (v) => (v ? { hi: v.slice(0, 12), lo: v.slice(12, 24), p: v.slice(24, 36) } : null);

/** Podnebí místa: jeho buňka, a když chybí, nejbližší buňka do 1° → { hi, lo, p } (po 12 měsících) | null. */
export function climateAt(lat, lon) {
  lat = Number(lat);
  lon = Number(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const { cells } = data();
  const hit = cells[cellKey(lat, lon)];
  if (hit) return unpack(hit);
  const la0 = Math.round(lat * 2) / 2;
  const lo0 = Math.round(lon * 2) / 2;
  let best = null;
  let bestKm = Infinity;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const la = la0 + i / 2;
      let lo = lo0 + j / 2;
      if (lo > 180) lo -= 360;
      if (lo < -180) lo += 360;
      // 180° a −180° je tentýž poledník
      const v = cells[`${la},${lo}`] || (Math.abs(lo) === 180 ? cells[`${la},${-lo}`] : null);
      if (!v) continue;
      const km = haversineKm(lat, lon, la, lo);
      if (km < bestKm) {
        bestKm = km;
        best = v;
      }
    }
  }
  return unpack(best);
}

/** Podnebí u letiště → { hi, lo, p } | null. */
export function airportClimate(iata) {
  const code = String(iata || '').toUpperCase();
  if (byIata.has(code)) return byIata.get(code);
  const key = data().airports[code];
  const a = getAirport(code);
  if (!key && !a) return null;
  const c = (key && unpack(data().cells[key])) || (a ? climateAt(a.lat, a.lon) : null);
  byIata.set(code, c);
  return c;
}

/** Podnebí u letiště v měsíci data ymd → { m, hi, lo, p } | null. */
export function monthClimate(iata, ymd) {
  const c = airportClimate(iata);
  const m = Number(String(ymd || '').slice(5, 7));
  if (!c || !(m >= 1 && m <= 12)) return null;
  return { m, hi: c.hi[m - 1], lo: c.lo[m - 1], p: c.p[m - 1] };
}

/** Nejvyšší průměrné denní maximum u letiště v některém z měsíců (1–12) | null. */
export function warmestHi(iata, months) {
  const c = airportClimate(iata);
  return c && months.length ? Math.max(...months.map((m) => c.hi[m - 1])) : null;
}

/**
 * „Za teplem“: velká letiště země (typ L), kde je v některém z měsíců průměrné denní maximum aspoň
 * minTemp – nejteplejší první. most = teplé jsou aspoň 2/3 velkých letišť země. Žádné → null.
 */
export function warmAirports(cc, months, minTemp) {
  const big = airportsInCountry(cc).filter((a) => a.type === 'L');
  const warm = big.map((a) => ({ iata: a.iata, hi: warmestHi(a.iata, months) }))
    .filter((x) => x.hi != null && x.hi >= minTemp)
    .sort((x, y) => y.hi - x.hi);
  return warm.length ? { cc, airports: warm.map((x) => x.iata), most: warm.length * 3 >= big.length * 2 } : null;
}

/** Podíl velkých letišť do km od bodu, kde je v některém z měsíců aspoň minTemp (0–1). */
export function warmShare(point, months, minTemp, km) {
  let all = 0;
  let warm = 0;
  for (const a of AIRPORTS.values()) {
    if (a.type !== 'L' || haversineKm(point.lat, point.lon, a.lat, a.lon) > km) continue;
    all++;
    if ((warmestHi(a.iata, months) ?? -99) >= minTemp) warm++;
  }
  return all ? warm / all : 0;
}

/** Podnebí hlavního letiště země (detail země) → { iata, city, hi, lo, p } | null. */
export function countryClimate(cc) {
  const code = String(cc || '').toUpperCase();
  const iata = hubsOf(code, 1)[0] || airportsInCountry(code)[0]?.iata;
  const c = iata ? airportClimate(iata) : null;
  return c ? { iata, city: getAirport(iata).cityCs, ...c } : null;
}
