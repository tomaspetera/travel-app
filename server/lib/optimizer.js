// Skládání letů tam a zpět do nejlevnějších cest.
// Umí:
//  • kombinovat různé aerolinky (Ryanair tam, Wizz zpět),
//  • open-jaw na straně domova (odlet z VIE, návrat do BTS),
//  • open-jaw v cíli (přílet do BGY, odlet z MXP – obě letiště Milána),
//  • započítat cenu dopravy na/z letiště.
import { addDays, daysBetween, weekday } from './dates.js';
import { destKey } from './airports.js';
import { makeTrip } from './fares.js';

/**
 * Pro každou kombinaci (from, to, datum) víc variant: nejlevnější, nejlevnější přímý a nejlevnější
 * od každé další aerolinky – nejvýš `k` (k = 1 → jen nejlevnější, viz cheapestPerDay).
 */
export function legsPerDay(legs, k = 1) {
  if (k <= 1) return cheapestPerDay(legs);
  const groups = new Map();
  for (const l of legs) {
    if (!(l.czk > 0)) continue;
    const key = `${l.from}|${l.to}|${l.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const out = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.czk - b.czk || (b.live ? 1 : 0) - (a.live ? 1 : 0));
    const pick = [list[0]];
    const direct = list.find((l) => !l.stops);
    if (direct && !pick.includes(direct)) pick.push(direct);
    const seen = new Set(pick.map((l) => `${l.carrier}|${l.dep}`));
    for (const l of list) {
      if (pick.length >= k) break;
      const sig = `${l.carrier}|${l.dep}`;
      if (seen.has(sig) || pick.some((p) => p.carrier === l.carrier)) continue;
      seen.add(sig);
      pick.push(l);
    }
    out.push(...pick);
  }
  return out;
}

/** Nejlevnější leg pro každou kombinaci (from, to, datum). */
export function cheapestPerDay(legs) {
  const best = new Map();
  for (const l of legs) {
    if (!(l.czk > 0)) continue;
    const k = `${l.from}|${l.to}|${l.date}`;
    const prev = best.get(k);
    if (!prev || l.czk < prev.czk || (l.czk === prev.czk && l.live && !prev.live)) best.set(k, l);
  }
  return [...best.values()];
}

/**
 * Omezení termínů.
 * c: { nightsMin, nightsMax, outDays?: number[], backDays?: number[], outFrom?, outTo?, backFrom?, backTo? }
 */
export function dateOk(outDate, backDate, c) {
  if (c.outDays && c.outDays.length && !c.outDays.includes(weekday(outDate))) return false;
  if (c.outFrom && (outDate < c.outFrom || outDate > c.outTo)) return false;
  if (!backDate) return true;
  if (c.backFrom && (backDate < c.backFrom || backDate > c.backTo)) return false;
  if (c.backDays && c.backDays.length && !c.backDays.includes(weekday(backDate))) return false;
  const n = daysBetween(outDate, backDate);
  return n >= c.nightsMin && n <= c.nightsMax;
}

/**
 * Výběr rozmanitých výsledků: nejdřív perDay nejlepších pro každý den odletu (aby šlo
 * filtrovat v kalendáři), pak nejlevnější celkově s limitem perDestLimit na cílové město.
 */
function pickDiverse(results, { limit, perDestLimit, perDay = 0 }) {
  const seen = new Set();
  const picked = [];
  const take = (r) => {
    if (seen.has(r.sig)) return false;
    seen.add(r.sig);
    picked.push(r);
    return true;
  };
  if (perDay) {
    const dayCount = new Map();
    for (const r of results) {
      const n = dayCount.get(r.o.date) || 0;
      if (n < perDay && take(r)) dayCount.set(r.o.date, n + 1);
    }
  }
  const perDest = new Map();
  let n = 0;
  for (const r of results) {
    if (n >= limit) break;
    const dk = destKey(r.o.to);
    const c = perDest.get(dk) || 0;
    if (c >= perDestLimit) continue;
    if (take(r)) {
      perDest.set(dk, c + 1);
      n++;
    }
  }
  return picked.sort((x, y) => x.cost - y.cost);
}

/**
 * Najde nejlevnější zpáteční kombinace.
 * outLegs: lety domov → cíl, backLegs: lety cíl → domov.
 * groundOf(iata) → cena dopravy na/z letiště domova (na osobu).
 * opts: { nightsMin, nightsMax, outDays, backDays, openJawHome, openJawDest, limit, perDestLimit, perDay, calendar }
 * opts.calendar = { out: Map, back: Map } → doplní nejlevnější celou cestu podle dne odletu/návratu.
 */
export function bestRoundTrips(outLegs, backLegs, groundOf, opts) {
  const {
    nightsMin = 1, nightsMax = 30, openJawHome = true, openJawDest = true, limit = 300, perDestLimit = 12, perDay = 0,
    calendar: cal = null, legsPerDay: k = 1,
  } = opts;
  const backs = legsPerDay(backLegs, k);
  // Index: datum → seznam návratů seřazený podle (cena + doprava domů).
  const byDate = new Map();
  for (const b of backs) {
    const cost = b.czk + groundOf(b.to);
    if (!byDate.has(b.date)) byDate.set(b.date, []);
    byDate.get(b.date).push({ b, cost });
  }
  for (const list of byDate.values()) list.sort((x, y) => x.cost - y.cost);

  const note = (map, date, cost, o, b) => {
    const prev = map.get(date);
    if (!prev || cost < prev.cost) {
      map.set(date, { date, cost, from: o.from, to: o.to, backTo: b.to, outDate: o.date, backDate: b.date, provider: o.provider === b.provider ? o.provider : 'mix' });
    }
  };

  const results = [];
  for (const o of legsPerDay(outLegs, k)) {
    if (!dateOk(o.date, null, opts)) continue;
    const oDest = destKey(o.to);
    const oCost = o.czk + groundOf(o.from);
    for (let n = nightsMin; n <= nightsMax; n++) {
      const list = byDate.get(addDays(o.date, n));
      if (!list) continue;
      let taken = 0;
      for (const { b, cost } of list) {
        if (b.from !== o.to && !(openJawDest && destKey(b.from) === oDest)) continue;
        if (b.to !== o.from && !openJawHome) continue;
        if (!dateOk(o.date, b.date, opts)) continue;
        const total = oCost + cost;
        results.push({ o, b, cost: total, sig: `${oDest}|${o.from}|${b.to}|${o.date}|${b.date}|${o.carrier}|${o.dep}|${b.carrier}|${b.dep}` });
        if (cal) {
          note(cal.out, o.date, total, o, b);
          note(cal.back, b.date, total, o, b);
        }
        if (++taken >= 3 * k) break; // stačí pár nejlevnějších návratů na den
      }
    }
  }
  results.sort((x, y) => x.cost - y.cost);
  return pickDiverse(results, { limit, perDestLimit, perDay }).map((r) => makeTrip(r.o, r.b));
}

/** Nejlevnější jednosměrné lety (s dopravou na letiště), rozmanité podle cíle. */
export function bestOneWays(outLegs, groundOf, opts) {
  const { limit = 300, perDestLimit = 12, perDay = 0, legsPerDay: k = 1 } = opts;
  const results = legsPerDay(outLegs, k)
    .filter((o) => dateOk(o.date, null, opts))
    .map((o) => ({ o, cost: o.czk + groundOf(o.from), sig: `${o.from}|${o.to}|${o.date}|${o.carrier}|${o.dep}` }))
    .sort((x, y) => x.cost - y.cost);
  return pickDiverse(results, { limit, perDestLimit, perDay }).map((r) => makeTrip(r.o));
}

/** Kalendář jednosměrných letů: nejlevnější odlet pro každý den (vč. dopravy). */
export function oneWayCalendar(outLegs, groundOf, { outDays = [] } = {}) {
  const m = new Map();
  for (const l of cheapestPerDay(outLegs)) {
    if (outDays.length && !outDays.includes(weekday(l.date))) continue;
    const cost = l.czk + groundOf(l.from);
    const prev = m.get(l.date);
    if (!prev || cost < prev.cost) m.set(l.date, { date: l.date, cost, from: l.from, to: l.to, provider: l.provider });
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const calendarArray = (map) => [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
