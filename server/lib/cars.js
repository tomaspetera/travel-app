// Půjčení auta: normalizace dotazu + odkazy na srovnávače s předvyplněným letištěm a časy.
import { getAirport } from './airports.js';
import { carLinks } from './links.js';

export class CarQueryError extends Error {
  constructor(msg) {
    super(msg);
    this.status = 400;
  }
}

const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function normalizeCarQuery(raw = {}) {
  const pickup = String(raw.pickup || '').toUpperCase();
  const dropoff = String(raw.dropoff || pickup).toUpperCase();
  const from = String(raw.from || '').slice(0, 16);
  const to = String(raw.to || '').slice(0, 16);
  if (!getAirport(pickup)) throw new CarQueryError('Neznámé letiště vyzvednutí.');
  if (!getAirport(dropoff)) throw new CarQueryError('Neznámé letiště vrácení.');
  if (!DT.test(from) || !DT.test(to)) throw new CarQueryError('Chybí datum a čas vyzvednutí nebo vrácení.');
  if (to <= from) throw new CarQueryError('Vrácení musí být po vyzvednutí.');
  const days = Math.ceil((Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 864e5);
  if (days > 60) throw new CarQueryError('Pronájem může mít nejvýše 60 dní.');
  const ap = getAirport(pickup);
  return {
    pickup,
    dropoff,
    pickupName: `${ap.cityCs} – ${ap.name}`.replace(/ \(.*?\)/g, ''),
    dropoffName: getAirport(dropoff).name,
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
