// Jednotný tvar letu (leg) a cesty (trip) napříč poskytovateli.
import { toCzk } from './fx.js';
import { getAirport } from './airports.js';
import { daysBetween, flightMinutes, localToUtcMs, utcToLocalIso } from './dates.js';
import { haversineKm } from './geo.js';

/**
 * Leg = jeden let A → B.
 * dep/arr jsou místní časy 'YYYY-MM-DDTHH:MM:SS' (bez časové zóny), arr může chybět.
 */
export function makeLeg(o) {
  const fa = getAirport(o.from);
  const ta = getAirport(o.to);
  const dep = String(o.dep || '').slice(0, 19);
  let arr = o.arr ? String(o.arr).slice(0, 19) : null;
  const czk = o.czk != null ? Math.round(o.czk) : toCzk(o.price, o.currency);
  const hasTime = dep.length >= 16 && !/T00:00(:00)?$/.test(dep);
  const durationMin = o.durationMin ?? flightMinutes(dep, fa?.tz, arr, ta?.tz);
  // Bez času příletu (Wizz Air, Travelpayouts): dopočti ho v místním čase cíle – z délky letu,
  // jinak odhadem ze vzdálenosti (~780 km/h + 35 min na vzlet a přistání), označený arrEst.
  // arrUnknown (let s přestupem z cache bez věrohodné délky): přílet ani délku nedopočítávat – neznámé, ne vymyšlené.
  let arrEst = false;
  let estMin = null;
  if (!arr && hasTime && fa && ta && !o.arrUnknown) {
    const depMs = localToUtcMs(dep, fa.tz);
    const mins = durationMin || Math.round((haversineKm(fa.lat, fa.lon, ta.lat, ta.lon) / 780) * 60 + 35);
    if (depMs != null) {
      arr = utcToLocalIso(depMs + mins * 60000, ta.tz);
      arrEst = !durationMin;
      if (arrEst) estMin = mins;
    }
  }
  return {
    provider: o.provider,
    carrier: o.carrier || null,
    carrierName: o.carrierName || null,
    // Let s přestupem: dopravci jednotlivých úseků (Kiwi) – kvůli poplatkům za zavazadla.
    ...(o.carriers && o.carriers.length > 1 ? { carriers: o.carriers } : {}),
    flightNo: o.flightNo || null,
    from: o.from,
    to: o.to,
    // IANA zóny letišť – místní časy dep/arr pak jdou převést (export do kalendáře).
    fromTz: fa?.tz || null,
    toTz: ta?.tz || null,
    dep,
    arr,
    arrEst,
    ...(o.arrUnknown && !arr ? { arrUnknown: true } : {}),
    date: dep.slice(0, 10),
    hasTime,
    price: o.price != null ? Math.round(Number(o.price) * 100) / 100 : null,
    currency: o.currency || null,
    czk,
    prevCzk: o.prevPrice != null ? toCzk(o.prevPrice, o.currency) : null,
    stops: o.stops ?? 0,
    durationMin,
    // Odhad délky letu bez známého příletu (jako arrEst) – jen pro filtr délky cesty, v UI se neukazuje.
    ...(estMin ? { estMin } : {}),
    // Přestupy z časů úseků (Kiwi): [{ at: letiště, min: čekání }].
    // cc = země letiště přestupu (z databáze letišť) – kvůli vstupním podmínkám i pro tranzit (ESTA v USA).
    ...(Array.isArray(o.layovers) && o.layovers.length ? { layovers: o.layovers.map((x) => ({ ...x, cc: getAirport(x.at)?.cc || null })) } : {}),
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
