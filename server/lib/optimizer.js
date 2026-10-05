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
 * extra(leg) = příplatek k letu (zavazadla): „nejlevnější“ se pak myslí i s ním.
 * variety = true (přesná data): všechny přímé lety + lety s přestupem do k, viz dayVariety.
 */
export function legsPerDay(legs, k = 1, extra = () => 0, { variety = false } = {}) {
  if (k <= 1) return cheapestPerDay(legs, extra);
  const groups = new Map();
  for (const l of legs) {
    if (!(l.czk > 0)) continue;
    const key = `${l.from}|${l.to}|${l.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const out = [];
  for (const list of groups.values()) {
    // přesná data, stejná cena: vlastní web aerolinky před agregátorem (Kiwi)
    list.sort((a, b) => a.czk + extra(a) - b.czk - extra(b) || (b.live ? 1 : 0) - (a.live ? 1 : 0)
      || (variety ? (a.provider === 'kiwi') - (b.provider === 'kiwi') : 0));
    if (variety) {
      out.push(...dayVariety(list, k));
      continue;
    }
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

// Část dne odletu: 0 = ráno (do 12 h), 1 = odpoledne (do 18 h), 2 = večer.
const partOfDay = (l) => {
  const h = Number(String(l.dep).slice(11, 13));
  return !l.hasTime || !Number.isFinite(h) ? -1 : h < 12 ? 0 : h < 18 ? 1 : 2;
};

/**
 * Varianty jednoho dne na jedné trase (seznam seřazený od nejlevnějšího): stejný let (dopravce + čas
 * odletu) jen jednou; VŠECHNY přímé lety (nejvýš 2k) – let s přestupem nikdy nezabere místo přímému
 * letu téže aerolinky; z letů s přestupem nejlevnější a pak po jednom ráno / odpoledne / večer,
 * zbytek podle ceny – dohromady nejvýš k (aspoň 2 s přestupem, i když je přímých hodně).
 * Týž let z Kiwi i z webu aerolinky: přednost má aerolinka, je-li dražší nejvýš o ~2 % (přímá rezervace,
 * u Ryanairu / Wizz Air i další odlety dne).
 */
export function dayVariety(sorted, k) {
  const seen = new Set();
  const uniq = (list) => {
    const out = [];
    const at = new Map();
    for (const l of list) {
      const sig = `${l.carrier}|${l.dep}`;
      if (seen.has(sig)) {
        const i = at.get(sig);
        const kept = out[i];
        if (kept && kept.provider === 'kiwi' && l.provider !== 'kiwi' && l.live && l.czk <= kept.czk * 1.02 + 30) out[i] = l;
        continue;
      }
      seen.add(sig);
      at.set(sig, out.length);
      out.push(l);
    }
    return out;
  };
  // přímé napřed: přestupní varianta se stejným dopravcem a časem odletu přímý let nevytlačí
  const direct = uniq(sorted.filter((l) => !l.stops)).slice(0, 2 * k);
  const conns = uniq(sorted.filter((l) => l.stops > 0));
  const room = Math.max(2, k - direct.length);
  const pick = [];
  if (conns.length) pick.push(conns[0]);
  const covered = new Set([...direct, ...pick].map(partOfDay));
  for (const l of conns) {
    if (pick.length >= room) break;
    const part = partOfDay(l);
    if (part < 0 || covered.has(part) || pick.includes(l)) continue;
    covered.add(part);
    pick.push(l);
  }
  for (const l of conns) {
    if (pick.length >= room) break;
    if (!pick.includes(l)) pick.push(l);
  }
  return [...direct, ...pick];
}

/** Nejlevnější leg pro každou kombinaci (from, to, datum). */
export function cheapestPerDay(legs, extra = () => 0) {
  const best = new Map();
  for (const l of legs) {
    if (!(l.czk > 0)) continue;
    const k = `${l.from}|${l.to}|${l.date}`;
    const prev = best.get(k);
    const cost = l.czk + extra(l);
    if (!prev || cost < prev.cost || (cost === prev.cost && l.live && !prev.l.live)) best.set(k, { l, cost });
  }
  return [...best.values()].map((x) => x.l);
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

// Návrat nejdřív 2 h po příletu tam (stejný den, přílet po půlnoci): jinak by vznikly kombinace,
// které nejdou stihnout. Oba časy jsou místní v cílové oblasti; bez času se nekontroluje.
const MIN_STAY_MS = 120 * 60000;
const localMs = (s) => Date.parse(`${String(s).slice(0, 16)}:00Z`);
export function returnFits(o, b) {
  if (!o.arr || !b.hasTime) return true;
  const gap = localMs(b.dep) - localMs(o.arr);
  return !Number.isFinite(gap) || gap >= MIN_STAY_MS;
}

/**
 * Výběr rozmanitých výsledků: nejdřív perDay nejlepších pro každý den odletu (aby šlo
 * filtrovat v kalendáři), pak nejlevnější celkově s limitem perDestLimit na cílové město.
 * perLeg (přesná data): každý nalezený let tam i zpět aspoň v jedné – své nejlevnější – kombinaci,
 * ne jen nejlevnější let tam s desítkou různých návratů.
 */
function pickDiverse(results, { limit, perDestLimit, perDay = 0, perLeg = false }) {
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
  if (perLeg) {
    const legSeen = new Set();
    let m = 0;
    for (const r of results) {
      if (m >= limit) break;
      const fresh = [r.o, r.b].filter((l) => l && !legSeen.has(l));
      if (!fresh.length) continue;
      for (const l of fresh) legSeen.add(l);
      if (take(r)) m++;
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
 * opts: { nightsMin, nightsMax, outDays, backDays, openJawHome, openJawDest, limit, perDestLimit, perDay, calendar, extra, legsPerDay, variety }
 * opts.variety (přesná data) → víc letů na den (legsPerDay/dayVariety) a každý let aspoň v jedné kombinaci.
 * opts.extra(leg) → příplatek k letu na osobu (zavazadla), započítá se do pořadí i kalendáře.
 * opts.calendar = { out: Map, back: Map } → doplní nejlevnější celou cestu podle dne odletu/návratu.
 */
export function bestRoundTrips(outLegs, backLegs, groundOf, opts) {
  const {
    nightsMin = 1, nightsMax = 30, openJawHome = true, openJawDest = true, limit = 300, perDestLimit = 12, perDay = 0,
    calendar: cal = null, legsPerDay: k = 1, extra = () => 0, variety = false,
  } = opts;
  const backs = legsPerDay(backLegs, k, extra, { variety });
  // Index: datum → seznam návratů seřazený podle (cena + doprava domů).
  const byDate = new Map();
  for (const b of backs) {
    const cost = b.czk + groundOf(b.to) + extra(b);
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

  // Párování: na let tam a den návratu stačí pár nejlevnějších návratů (přesná data: 8 + až 3 přímé,
  // aby nechyběla varianta přímo tam i zpět) – počet kombinací tak roste lineárně, ne k².
  const cap = variety ? 8 : 3 * k;
  const results = [];
  for (const o of legsPerDay(outLegs, k, extra, { variety })) {
    if (!dateOk(o.date, null, opts)) continue;
    const oDest = destKey(o.to);
    const oCost = o.czk + groundOf(o.from) + extra(o);
    for (let n = nightsMin; n <= nightsMax; n++) {
      const list = byDate.get(addDays(o.date, n));
      if (!list) continue;
      let taken = 0;
      let direct = 0;
      for (const { b, cost } of list) {
        if (b.from !== o.to && !(openJawDest && destKey(b.from) === oDest)) continue;
        if (b.to !== o.from && !openJawHome) continue;
        if (!dateOk(o.date, b.date, opts) || !returnFits(o, b)) continue;
        if (taken >= cap && !(variety && !b.stops && direct < 3)) {
          if (!variety || direct >= 3) break;
          continue;
        }
        taken++;
        if (!b.stops) direct++;
        const total = oCost + cost;
        results.push({ o, b, cost: total, sig: `${oDest}|${o.from}|${b.to}|${o.date}|${b.date}|${o.carrier}|${o.dep}|${b.carrier}|${b.dep}` });
        if (cal) {
          note(cal.out, o.date, total, o, b);
          note(cal.back, b.date, total, o, b);
        }
      }
    }
  }
  results.sort((x, y) => x.cost - y.cost);
  return pickDiverse(results, { limit, perDestLimit, perDay, perLeg: variety }).map((r) => makeTrip(r.o, r.b));
}

/** Nejlevnější jednosměrné lety (s dopravou na letiště), rozmanité podle cíle. */
export function bestOneWays(outLegs, groundOf, opts) {
  const { limit = 300, perDestLimit = 12, perDay = 0, legsPerDay: k = 1, extra = () => 0, variety = false } = opts;
  const results = legsPerDay(outLegs, k, extra, { variety })
    .filter((o) => dateOk(o.date, null, opts))
    .map((o) => ({ o, cost: o.czk + groundOf(o.from) + extra(o), sig: `${o.from}|${o.to}|${o.date}|${o.carrier}|${o.dep}` }))
    .sort((x, y) => x.cost - y.cost);
  return pickDiverse(results, { limit, perDestLimit, perDay }).map((r) => makeTrip(r.o));
}

/** Kalendář jednosměrných letů: nejlevnější odlet pro každý den (vč. dopravy). */
export function oneWayCalendar(outLegs, groundOf, { outDays = [], extra = () => 0 } = {}) {
  const m = new Map();
  for (const l of cheapestPerDay(outLegs, extra)) {
    if (outDays.length && !outDays.includes(weekday(l.date))) continue;
    const cost = l.czk + groundOf(l.from) + extra(l);
    const prev = m.get(l.date);
    if (!prev || cost < prev.cost) m.set(l.date, { date: l.date, cost, from: l.from, to: l.to, provider: l.provider });
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const calendarArray = (map) => [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
