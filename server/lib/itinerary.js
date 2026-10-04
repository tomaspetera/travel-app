// Plánovač programu: rozdělí místa do dnů podle polohy a v každém dni je seřadí do trasy.
// Bez AI – deterministický algoritmus: výběr podle skóre a zájmů → k-means shluky po dnech
// (s vyvážením kapacity) → pořadí nejbližší soused + 2-opt → časy chůze.
import { haversineKm } from './geo.js';
import { addDays, daysBetween } from './dates.js';

// Typická délka návštěvy podle kategorie (min).
export const VISIT_MIN = {
  museum: 120, gallery: 90, castle: 100, palace: 90, church: 30, monument: 20, square: 30, oldtown: 90,
  viewpoint: 30, park: 60, garden: 60, nature: 150, beach: 180, zoo: 180, theme: 240, market: 45,
  bridge: 15, tower: 45, ruins: 60, theatre: 30, sight: 45, daytrip: 360,
};
const PACE = { relaxed: 240, normal: 360, intense: 480 }; // minut programu na celý den

const toXY = (p, lat0) => [p.lon * 111.32 * Math.cos((lat0 * Math.PI) / 180), p.lat * 110.57];

export function walkKm(a, b) {
  return haversineKm(a.lat, a.lon, b.lat, b.lon) * 1.3;
}

/** Kapacita dnů v minutách podle příletu/odletu. */
export function dayCapacities({ start, end, arrivalTime = '12:00', departureTime = null, pace = 'normal' }) {
  const n = Math.max(1, daysBetween(start, end) + 1);
  const full = PACE[pace] || PACE.normal;
  const hour = (t) => {
    const [h, m] = String(t || '12:00').split(':').map(Number);
    return (h || 0) + (m || 0) / 60;
  };
  const caps = [];
  for (let i = 0; i < n; i++) {
    // Okno dne: od 9:00 (den příletu 1,5 h po příletu) do 20:00 (den odletu 3 h před odletem);
    // u jednodenní cesty platí obojí naráz.
    const from = i === 0 ? hour(arrivalTime) + 1.5 : 9;
    const to = i === n - 1 && departureTime ? Math.min(20, hour(departureTime) - 3) : 20;
    const cap = Math.max(0, Math.min(full, (to - from) * 60 * (full / 600)));
    caps.push({ date: addDays(start, i), cap: Math.round(cap) });
  }
  return caps;
}

function kmeans(points, k, lat0, iters = 25) {
  const xy = points.map((p) => toXY(p, lat0));
  // Inicializace: nejvzdálenější body (deterministicky, začni nejvýznamnějším).
  const centers = [xy[0]];
  while (centers.length < k) {
    let best = -1;
    let bestD = -1;
    xy.forEach((q, i) => {
      const d = Math.min(...centers.map((c) => (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2));
      if (d > bestD) { bestD = d; best = i; }
    });
    centers.push(xy[best]);
  }
  let assign = new Array(xy.length).fill(0);
  for (let it = 0; it < iters; it++) {
    assign = xy.map((q) => {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      });
      return bi;
    });
    for (let c = 0; c < k; c++) {
      const mem = xy.filter((_, i) => assign[i] === c);
      if (mem.length) centers[c] = [mem.reduce((s, q) => s + q[0], 0) / mem.length, mem.reduce((s, q) => s + q[1], 0) / mem.length];
    }
  }
  return { assign, centers };
}

/** Pořadí návštěv: nejbližší soused od startu + 2-opt. */
export function orderRoute(start, items) {
  if (items.length < 2) return items.slice();
  const rest = items.slice();
  const route = [];
  let cur = start;
  while (rest.length) {
    let bi = 0;
    let bd = Infinity;
    rest.forEach((p, i) => {
      const d = haversineKm(cur.lat, cur.lon, p.lat, p.lon);
      if (d < bd) { bd = d; bi = i; }
    });
    cur = rest.splice(bi, 1)[0];
    route.push(cur);
  }
  const len = (r) => r.reduce((s, p, i) => s + haversineKm((i ? r[i - 1] : start).lat, (i ? r[i - 1] : start).lon, p.lat, p.lon), 0);
  let improved = true;
  let best = route;
  let bestLen = len(route);
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const l = len(cand);
        if (l + 1e-9 < bestLen) { best = cand; bestLen = l; improved = true; }
      }
    }
  }
  return best;
}

/**
 * pois: [{ id, name, lat, lon, score, category, ... }] (vyšší score = zajímavější)
 * opts: { center:{lat,lon}, start, end, arrivalTime, departureTime, pace, interests:{category:weight}, maxDayTripKm }
 */
export function planItinerary(pois, opts) {
  const { center, interests = {}, pace = 'normal' } = opts;
  const caps = dayCapacities(opts);
  const weight = (p) => p.score * (interests[p.category] ?? 1);
  const near = pois.filter((p) => p.category !== 'daytrip');
  const trips = pois.filter((p) => p.category === 'daytrip').sort((a, b) => weight(b) - weight(a));

  // Celodenní výlety mimo město, když je na ně čas (od 4 plných dnů, max. každý třetí den).
  // Nikdy ne první ani poslední den (přílet / odlet); výlet, který si uživatel připnul, má přednost.
  const full = PACE[pace] || 360;
  const fullDays = caps.filter((c) => c.cap >= full * 0.9);
  const tripEligible = fullDays.filter((c) => c.date !== caps[0].date && c.date !== caps.at(-1).date);
  const pinnedTrips = trips.filter((p) => p.pinned).length;
  const baseTrips = fullDays.length >= 4 ? Math.floor(fullDays.length / 3) : 0;
  const tripDays = Math.min(trips.length, tripEligible.length, Math.max(baseTrips, pinnedTrips));
  const spaced = tripEligible.filter((_, i) => i % 3 === 1);
  const tripDayDates = new Set([...spaced, ...tripEligible.filter((c) => !spaced.includes(c))].slice(0, tripDays).map((c) => c.date));
  const warnings = [];
  if (pinnedTrips > tripDays) warnings.push('Na celodenní výlet mimo město je pobyt krátký – potřebuje celý den mezi příletem a odletem.');

  const cityDays = caps.filter((c) => !tripDayDates.has(c.date) && c.cap > 0);
  const totalCap = cityDays.reduce((s, c) => s + c.cap, 0);
  // Výběr podle významu s limitem kategorií už tady (jinak by např. 20 kostelů vyčerpalo čas
  // a pestrost by je pak jen vyškrtala, takže by dny zůstaly poloprázdné).
  const CAP = { church: 3, square: 2, monument: 3 };
  // Limit podle skutečného času (krátký den příletu/odletu se nepočítá jako celý den).
  const catLimit = (cat) => (CAP[cat] ? CAP[cat] * Math.max(1, Math.round(totalCap / full)) : Infinity);
  const ranked = [...near].sort((a, b) => weight(b) - weight(a)).map((p) => ({ ...p, visitMin: p.visitMin || VISIT_MIN[p.category] || 45 }));
  const chosen = [];
  const perCat = {};
  let used = 0;
  for (const p of ranked) {
    if (used + p.visitMin > totalCap * 0.95 || (perCat[p.category] || 0) >= catLimit(p.category)) continue;
    chosen.push(p);
    perCat[p.category] = (perCat[p.category] || 0) + 1;
    used += p.visitMin;
  }

  const days = caps.map((c) => ({ date: c.date, cap: c.cap, items: [], kind: tripDayDates.has(c.date) ? 'daytrip' : c.cap ? 'city' : 'travel' }));
  if (chosen.length && cityDays.length) {
    const k = Math.min(cityDays.length, chosen.length);
    const { assign, centers } = kmeans(chosen, k, center.lat);
    const clusters = Array.from({ length: k }, (_, i) => chosen.filter((_, j) => assign[j] === i));
    // Přiřazení shluků ke dnům: největší program do nejdelších dnů.
    const order = clusters.map((cl, i) => ({ cl, i, mins: cl.reduce((s, p) => s + p.visitMin, 0) })).sort((a, b) => b.mins - a.mins);
    const dayOrder = cityDays.map((c) => days.find((d) => d.date === c.date)).sort((a, b) => b.cap - a.cap);
    order.forEach((o, idx) => { dayOrder[idx].items = o.cl; dayOrder[idx].center = centers[o.i]; });
    // Pestrost: nejvýš 3 kostely a 2 náměstí za den – přebytek přesuň jinam (nebo vynech).
    for (const d of dayOrder) {
      d.items.sort((a, b) => weight(b) - weight(a));
      const seen = {};
      const keep = [];
      for (const p of d.items) {
        seen[p.category] = (seen[p.category] || 0) + 1;
        if (CAP[p.category] && seen[p.category] > CAP[p.category]) {
          const target = dayOrder.find((x) => x !== d && x.items.filter((q) => q.category === p.category).length < CAP[p.category]
            && x.items.reduce((sum, q) => sum + q.visitMin, 0) + p.visitMin <= x.cap);
          if (target) target.items.push(p);
        } else keep.push(p);
      }
      d.items = keep;
    }
    // Vyvážení: co přeteče kapacitu dne, přesuň do dne s volnou kapacitou (nejbližší místo napřed).
    for (const d of dayOrder) {
      d.items.sort((a, b) => weight(b) - weight(a));
      let mins = d.items.reduce((s, p) => s + p.visitMin, 0);
      // I poslední místo, když se do krátkého dne (přílet večer, odlet ráno) vůbec nevejde.
      while (mins > d.cap * 1.1 && d.items.length) {
        const p = d.items.pop();
        mins -= p.visitMin;
        const target = dayOrder
          .filter((x) => x !== d && x.items.reduce((s, q) => s + q.visitMin, 0) + p.visitMin <= x.cap
            && !(CAP[p.category] && x.items.filter((q) => q.category === p.category).length >= CAP[p.category]))
          .sort((a, b) => distToItems(a, p) - distToItems(b, p))[0];
        if (target) target.items.push(p);
      }
    }
    // Doplnění: dny s volným časem doplň dalšími místy z pořadí (nejdřív blízko už naplánovaných).
    const inPlan = new Set(dayOrder.flatMap((d) => d.items.map((p) => p.id)));
    for (const d of dayOrder) {
      let free = d.cap - d.items.reduce((sum, q) => sum + q.visitMin, 0);
      while (free >= 20) {
        const cnt = (cat) => d.items.filter((q) => q.category === cat).length;
        const fits = ranked.filter((p) => !inPlan.has(p.id) && p.visitMin <= free * 1.1 && !(CAP[p.category] && cnt(p.category) >= CAP[p.category]));
        const near = d.items.length ? fits.filter((p) => distToItems(d, p) <= 3) : fits;
        const p = (near.length ? near : fits)[0];
        if (!p) break;
        d.items.push(p);
        inPlan.add(p.id);
        free -= p.visitMin;
      }
    }
  }
  trips.slice(0, tripDays).forEach((p, i) => {
    const d = days.find((x) => x.date === [...tripDayDates][i]);
    if (d) d.items = [{ ...p, visitMin: VISIT_MIN.daytrip }];
  });

  for (const d of days) {
    d.items = orderRoute(center, d.items).map((p, i, arr) => {
      const prev = i ? arr[i - 1] : center;
      const km = walkKm(prev, p);
      return { ...p, fromPrevKm: Math.round(km * 10) / 10, fromPrevMin: Math.round((km / 4.8) * 60), transit: km > 3 };
    });
    d.walkKm = Math.round(d.items.reduce((s, p) => s + (p.transit ? 0 : p.fromPrevKm), 0) * 10) / 10;
    d.minutes = d.items.reduce((s, p) => s + p.visitMin, 0);
    delete d.center;
  }
  const usedIds = new Set(days.flatMap((d) => d.items.map((p) => p.id)));
  return { days, spare: pois.filter((p) => !usedIds.has(p.id)).slice(0, 30), warnings };
}

function distToItems(day, p) {
  if (!day.items.length) return 1e9;
  return Math.min(...day.items.map((q) => haversineKm(q.lat, q.lon, p.lat, p.lon)));
}
