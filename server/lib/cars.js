// Půjčení auta: normalizace dotazu + odkazy na srovnávače s předvyplněným letištěm a časy.
import { getAirport, airportsNear, countryAt } from './airports.js';
import { haversineKm } from './geo.js';
import { carLinks } from './links.js';
import { addDays, todayYmd } from './dates.js';

export class CarQueryError extends Error {
  constructor(msg) {
    super(msg);
    this.status = 400;
  }
}

const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
// Letiště zadané u města (letiště příletu) stačí pro srovnávače, když leží do CITY_AP_KM od města (Lisabon – LIS
// 7 km); jinak nejbližší větší letiště do CITY_NEAR_KM (Florencie – FLR, ne letiště příletu v Pise 70 km daleko).
const CITY_AP_KM = 40;
const CITY_NEAR_KM = 120;

/**
 * Vyzvednutí / vrácení ve městě (auto jen na pár dní uprostřed pobytu, na trase od místa trasy): { name, lat, lon, cc,
 * iata – letiště pro srovnávače, km – jak daleko od města } nebo null. Srovnávače půjčoven hledají podle kódu letiště
 * (jiný tvar odkazu jsme neověřili) – u města tedy na nejbližším letišti, pobočky přímo ve městě ukáže odkaz na mapu.
 */
function cityOf(raw, p, iata) {
  const name = String(raw[`${p}City`] || '').replace(/[<>"'`]/g, '').trim().slice(0, 80);
  const lat = Number(raw[`${p}Lat`]);
  const lon = Number(raw[`${p}Lon`]);
  if (!name || raw[`${p}Lat`] === '' || raw[`${p}Lon`] === '' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const given = getAirport(iata);
  const near = given && haversineKm(lat, lon, given.lat, given.lon) <= CITY_AP_KM ? given : airportsNear(lat, lon, CITY_NEAR_KM, { limit: 1 })[0] || given;
  const cc = /^[A-Z]{2}$/.test(raw[`${p}Cc`] || '') ? raw[`${p}Cc`] : countryAt(lat, lon) || near?.cc || '';
  return { name, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, cc, iata: near.iata, km: Math.round(haversineKm(lat, lon, near.lat, near.lon)) };
}

export function normalizeCarQuery(raw = {}) {
  const pickup = String(raw.pickup || '').toUpperCase();
  const dropoff = String(raw.dropoff || pickup).toUpperCase();
  const from = String(raw.from || '').slice(0, 16);
  const to = String(raw.to || '').slice(0, 16);
  if (!getAirport(pickup)) throw new CarQueryError('Neznámé letiště vyzvednutí.');
  if (!getAirport(dropoff)) throw new CarQueryError('Neznámé letiště vrácení.');
  // Tvar i skutečné datum (2026-13-45 projde regexem, ale ne kontrolou přes Date).
  const real = (dt) => DT.test(dt) && !Number.isNaN(Date.parse(`${dt}:00Z`)) && new Date(`${dt}:00Z`).toISOString().slice(0, 16) === dt;
  if (!real(from) || !real(to)) throw new CarQueryError('Chybí datum a čas vyzvednutí nebo vrácení.');
  if (from.slice(0, 10) < addDays(todayYmd(), -1)) throw new CarQueryError('Vyzvednutí je v minulosti.');
  if (to <= from) throw new CarQueryError('Vrácení musí být po vyzvednutí.');
  const days = Math.ceil((Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 864e5);
  if (days > 60) throw new CarQueryError('Pronájem může mít nejvýše 60 dní.');
  const pickupCity = cityOf(raw, 'pu', pickup);
  const dropoffCity = cityOf(raw, 'do', dropoff);
  // srovnávače: u města nejbližší letiště
  const ap = getAirport(pickupCity ? pickupCity.iata : pickup);
  const dp = getAirport(dropoffCity ? dropoffCity.iata : dropoff);
  const nameOf = (a) => `${a.cityCs} – ${a.name}`.replace(/ \(.*?\)/g, '');
  return {
    pickup,
    dropoff,
    pickupName: nameOf(ap),
    dropoffName: nameOf(dp),
    pickupCity,
    dropoffCity,
    // země vyzvednutí a vrácení: vrácení v jiné zemi průvodce zvlášť upozorní (mezinárodní one-way je výrazně dražší)
    pickupCc: (pickupCity && pickupCity.cc) || ap.cc || '',
    dropoffCc: (dropoffCity && dropoffCity.cc) || dp.cc || '',
    from,
    to,
    days,
    age: Math.min(99, Math.max(18, Math.round(Number(raw.age) || 30))),
  };
}

export function searchCars(raw) {
  const q = normalizeCarQuery(raw);
  return { query: q, items: [], links: carLinks(q) };
}
