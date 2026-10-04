// Jednotný tvar letu (leg) a cesty (trip) napříč poskytovateli.
import { toCzk } from './fx.js';
import { getAirport } from './airports.js';
import { daysBetween, flightMinutes } from './dates.js';

/**
 * Leg = jeden let A → B.
 * dep/arr jsou místní časy 'YYYY-MM-DDTHH:MM:SS' (bez časové zóny), arr může chybět.
 */
export function makeLeg(o) {
  const fa = getAirport(o.from);
  const ta = getAirport(o.to);
  const dep = String(o.dep || '').slice(0, 19);
  const arr = o.arr ? String(o.arr).slice(0, 19) : null;
  const czk = o.czk != null ? Math.round(o.czk) : toCzk(o.price, o.currency);
  return {
    provider: o.provider,
    carrier: o.carrier || null,
    carrierName: o.carrierName || null,
    flightNo: o.flightNo || null,
    from: o.from,
    to: o.to,
    dep,
    arr,
    date: dep.slice(0, 10),
    hasTime: dep.length >= 16 && !/T00:00(:00)?$/.test(dep),
    price: o.price != null ? Math.round(Number(o.price) * 100) / 100 : null,
    currency: o.currency || null,
    czk,
    prevCzk: o.prevPrice != null ? toCzk(o.prevPrice, o.currency) : null,
    stops: o.stops ?? 0,
    durationMin: o.durationMin ?? flightMinutes(dep, fa?.tz, arr, ta?.tz),
    live: o.live !== false,
    bookUrl: o.bookUrl || null,
    foundAt: o.foundAt || null,
  };
}

/**
 * Trip = cesta tam (a případně zpět) za cenu na osobu.
 * combinedCzk: cena zpáteční letenky, kterou nelze rozdělit na jednotlivé lety (Travelpayouts).
 */
export function makeTrip(out, back = null, { combinedCzk = null, bookUrl = null } = {}) {
  const flightCzk = combinedCzk != null ? Math.round(combinedCzk) : (out?.czk ?? NaN) + (back ? back.czk ?? NaN : 0);
  const providers = new Set([out.provider, back?.provider].filter(Boolean));
  return {
    id: [out.provider, out.from, out.to, out.dep, back?.provider, back?.from, back?.to, back?.dep].filter(Boolean).join('|'),
    out,
    back,
    flightCzk,
    nights: back ? daysBetween(out.date, back.date) : null,
    provider: providers.size === 1 ? [...providers][0] : 'mix',
    combined: combinedCzk != null,
    bookUrl,
  };
}

export const validTrip = (t) => Number.isFinite(t.flightCzk) && t.flightCzk > 0;
