// Databáze letišť s pravidelnými lety (data/airports.json) a dotazy nad ní.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { haversineKm, normalize } from './geo.js';
import { AIRPORT_CITY_CS, CITY_CS, METROS } from './names.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = JSON.parse(readFileSync(path.join(root, 'data', 'airports.json'), 'utf8'));
export const COUNTRIES = JSON.parse(readFileSync(path.join(root, 'data', 'countries.json'), 'utf8'));
export const COUNTRY_BY_ISO = new Map(COUNTRIES.map((c) => [c.iso2, c]));

const METRO_BY_AIRPORT = new Map();
for (const m of METROS) for (const a of m.airports) METRO_BY_AIRPORT.set(a, m);

export const AIRPORTS = new Map();
for (const [iata, name, city, cc, lat, lon, type, tz] of RAW) {
  const cityCs = AIRPORT_CITY_CS[iata] || CITY_CS[city] || city;
  AIRPORTS.set(iata, {
    iata, name, city, cityCs, cc, lat, lon, type, tz,
    country: COUNTRY_BY_ISO.get(cc)?.cs || cc,
    metro: METRO_BY_AIRPORT.get(iata)?.code || null,
    _n: normalize(`${cityCs} ${city} ${name}`),
  });
}
export const METRO_BY_CODE = new Map(METROS.map((m) => [m.code, { ...m, airports: m.airports.filter((a) => AIRPORTS.has(a)) }]));

const TYPE_RANK = { L: 0, M: 1, S: 2 };

export function getAirport(iata) {
  return AIRPORTS.get(String(iata || '').toUpperCase()) || null;
}

/** Letiště v okruhu radiusKm od bodu, seřazená podle vzdálenosti. */
export function airportsNear(lat, lon, radiusKm, { includeSmall = false, limit = 50 } = {}) {
  const out = [];
  for (const a of AIRPORTS.values()) {
    if (!includeSmall && a.type === 'S') continue;
    // Rychlé předfiltrování obdélníkem (1° šířky ≈ 111 km).
    if (Math.abs(a.lat - lat) > radiusKm / 100 + 0.5) continue;
    const d = haversineKm(lat, lon, a.lat, a.lon);
    if (d <= radiusKm) out.push({ ...a, distKm: d });
  }
  out.sort((x, y) => x.distKm - y.distKm || TYPE_RANK[x.type] - TYPE_RANK[y.type]);
  return out.slice(0, limit);
}

/** Země podle polohy: země nejbližšího letiště do maxKm (i malého), jinak ''. Záloha, když místo nemá kód země. */
export function countryAt(lat, lon, maxKm = 150) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return airportsNear(lat, lon, maxKm, { includeSmall: true, limit: 1 })[0]?.cc || '';
}

export function airportsInCountry(cc, { includeSmall = false } = {}) {
  const out = [];
  for (const a of AIRPORTS.values()) {
    if (a.cc === cc && (includeSmall || a.type !== 'S')) out.push(a);
  }
  return out.sort((x, y) => TYPE_RANK[x.type] - TYPE_RANK[y.type] || x.cityCs.localeCompare(y.cityCs, 'cs'));
}

/** Klíč pro seskupení výsledků podle cílového města (metro kód nebo IATA). */
export function destKey(iata) {
  return METRO_BY_AIRPORT.get(iata)?.code || iata;
}

/** Čitelný popis cíle: { key, label, sub, cc, country, lat, lon }. */
export function destInfo(iata) {
  const a = getAirport(iata);
  const m = METRO_BY_AIRPORT.get(iata);
  if (m) {
    return {
      key: m.code, id: `metro:${m.code}`, label: m.cs, cc: m.cc, country: COUNTRY_BY_ISO.get(m.cc)?.cs || m.cc,
      lat: m.lat, lon: m.lon,
      airportDistKm: a ? Math.round(haversineKm(m.lat, m.lon, a.lat, a.lon)) : null,
    };
  }
  if (!a) return { key: iata, id: `ap:${iata}`, label: iata, cc: '', country: '', lat: null, lon: null, airportDistKm: null };
  return { key: iata, id: `ap:${iata}`, label: a.cityCs, cc: a.cc, country: a.country, lat: a.lat, lon: a.lon, airportDistKm: null };
}

export function airportLabel(iata) {
  const a = getAirport(iata);
  return a ? `${a.cityCs} (${iata})` : iata;
}
