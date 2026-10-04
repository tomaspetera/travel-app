// Výlety z jednoho místa: jednodenní (ráno ven, večer zpět) a vícedenní okružní cesta
// s přespáním po cestě. Bez AI – výběr podle významu míst a času jízdy:
//   • jednodenní: nejlepší kombinace 1–3 cílů (smyčka start → cíle → start) do kapacity dne,
//     při více dnech každý den jiné cíle;
//   • okružní: vkládání cílů do trasy podle poměru význam / přidaný čas, 2-opt, rozdělení do dnů.
// Čas jízdy je odhad autem (silnice ≈ 1,3 × vzdušná vzdálenost, průměr 70 km/h).
import { haversineKm } from './geo.js';
import { addDays } from './dates.js';
import { affiliate } from './links.js';

const DAY_MIN = { relaxed: 540, normal: 630, intense: 720 }; // čas dne vč. jízdy (min)
const VISIT = { town: 150, castle: 120, nature: 180, oldtown: 150, palace: 120, ruins: 90 };
const MAX_DRIVE_DAY = 330; // víc než ~5,5 h za volant za den nedává smysl

export const roadKm = (a, b) => Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon) * 1.3);
export const driveMin = (a, b) => (a === b ? 0 : Math.round((roadKm(a, b) / 70) * 60 + 10));
export const visitMin = (p) => p.visitMin || VISIT[p.tripKind] || (p.unesco ? 150 : 120);

/** Délka smyčky start → stops… → (konec) v minutách jízdy. */
function legsMin(start, stops, end) {
  let t = 0;
  let prev = start;
  for (const s of stops) { t += driveMin(prev, s); prev = s; }
  if (end) t += driveMin(prev, end);
  return t;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

function combos(arr, k, start = 0, acc = [], out = []) {
  if (acc.length === k) { out.push(acc); return out; }
  for (let i = start; i < arr.length; i++) combos(arr, k, i + 1, [...acc, arr[i]], out);
  return out;
}

/** Nejlepší smyčka pro jeden den: max. součet skóre (s malou penalizací za jízdu) do kapacity. */
export function bestDayLoop(base, pool, cap) {
  let best = null;
  const top = pool.slice(0, 12);
  for (let k = 1; k <= 3; k++) {
    for (const c of combos(top, k)) {
      let order = null;
      let drive = Infinity;
      for (const perm of permutations(c)) {
        const d = legsMin(base, perm, base);
        if (d < drive) { drive = d; order = perm; }
      }
      const total = drive + order.reduce((s, p) => s + visitMin(p), 0);
      if (total > cap || drive > MAX_DRIVE_DAY) continue;
      const value = order.reduce((s, p) => s + p.score, 0) - drive * 0.08;
      if (!best || value > best.value) best = { stops: order, drive, total, value };
    }
  }
  return best;
}

function routeTime(base, stops) {
  return legsMin(base, stops, base) + stops.reduce((s, p) => s + visitMin(p), 0);
}

function twoOpt(base, stops) {
  let best = stops.slice();
  let bestLen = legsMin(base, best, base);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const len = legsMin(base, cand, base);
        if (len + 1e-9 < bestLen) { best = cand; bestLen = len; improved = true; }
      }
    }
  }
  return best;
}

/** Rozdělí trasu do dnů podle kapacity; přespání u posledního cíle dne. */
export function splitDays(base, stops, cap) {
  const days = [];
  let cur = { stops: [], min: 0, from: base };
  let prev = base;
  stops.forEach((s, i) => {
    // u posledního cíle se počítá i cesta zpět
    const add = driveMin(prev, s) + visitMin(s) + (i === stops.length - 1 ? driveMin(s, base) : 0);
    if (cur.stops.length && cur.min + add > cap) {
      days.push(cur);
      cur = { stops: [], min: 0, from: prev };
    }
    cur.stops.push(s);
    cur.min += add;
    prev = s;
  });
  cur.back = driveMin(prev, base);
  days.push(cur);
  return days;
}

/** Okružní cesta na `days` dní: vkládání cílů podle poměru skóre / přidaný čas, pak 2-opt. */
export function planLoop(base, pool, days, cap) {
  const budget = days * cap * 0.92;
  let tour = [];
  const left = pool.slice(0, 25);
  for (;;) {
    let best = null;
    for (const c of left) {
      for (let pos = 0; pos <= tour.length; pos++) {
        const cand = [...tour.slice(0, pos), c, ...tour.slice(pos)];
        const t = routeTime(base, cand);
        if (t > budget) continue;
        const added = t - routeTime(base, tour);
        const ratio = c.score / Math.max(30, added);
        if (!best || ratio > best.ratio) best = { cand, c, ratio };
      }
    }
    if (!best) break;
    tour = twoOpt(base, best.cand);
    left.splice(left.indexOf(best.c), 1);
  }
  if (!tour.length) return [];
  // Nevejde-li se rozdělení do počtu dní, ubírej nejméně významné cíle.
  let split = splitDays(base, tour, cap);
  while (split.length > days && tour.length > 1) {
    const worst = [...tour].sort((a, b) => a.score - b.score)[0];
    tour = twoOpt(base, tour.filter((p) => p !== worst));
    split = splitDays(base, tour, cap);
  }
  return split;
}

/**
 * candidates: [{ id, name, lat, lon, score, tripKind, unesco, image, extract, url }] (cíle mimo město)
 * opts: { base:{lat,lon,label}, start:'YYYY-MM-DD', days, mode:'day'|'loop', pace }
 */
export function planTrips(candidates, opts) {
  const { base, start, mode = 'day', pace = 'normal' } = opts;
  const days = Math.min(mode === 'loop' ? 10 : 7, Math.max(1, Math.round(opts.days || 1)));
  const cap = DAY_MIN[pace] || DAY_MIN.normal;
  // Jen dosažitelné cíle (tam a zpět v rámci dne pro jednodenní výlety), seřazené podle skóre.
  const pool = candidates
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon) && c.score > 0)
    .filter((c) => mode === 'loop' || driveMin(base, c) * 2 + visitMin(c) <= cap)
    .sort((a, b) => b.score - a.score);
  const out = [];
  if (mode === 'day') {
    let rest = pool;
    for (let i = 0; i < days && rest.length; i++) {
      const loop = bestDayLoop(base, rest, cap);
      if (!loop) break;
      out.push({ stops: loop.stops, from: base, back: driveMin(loop.stops.at(-1), base), min: loop.total });
      const used = new Set(loop.stops.map((s) => s.id));
      rest = rest.filter((c) => !used.has(c.id));
    }
  } else {
    out.push(...planLoop(base, pool, days, cap));
  }
  const result = out.map((d, i) => {
    let prev = d.from;
    let clock = 9 * 60; // odjezd v 9:00
    const stops = d.stops.map((s) => {
      const km = roadKm(prev, s);
      const dm = driveMin(prev, s);
      clock += dm;
      const item = { ...s, driveKm: km, driveMin: dm, arrive: hhmm(clock), visitMin: visitMin(s) };
      clock += item.visitMin;
      prev = s;
      return item;
    });
    const last = i === out.length - 1;
    const backHome = mode === 'day' || last;
    const back = backHome ? { km: roadKm(prev, base), min: driveMin(prev, base), arrive: hhmm(clock + driveMin(prev, base)) } : null;
    const driveTotal = stops.reduce((s, x) => s + x.driveMin, 0) + (back ? back.min : 0);
    const kmTotal = stops.reduce((s, x) => s + x.driveKm, 0) + (back ? back.km : 0);
    return {
      date: addDays(start, i),
      from: { name: i === 0 || mode === 'day' ? base.label : out[i - 1].stops.at(-1).name, lat: d.from.lat, lon: d.from.lon },
      stops,
      back,
      overnight: backHome ? null : { id: stops.at(-1).id, name: stops.at(-1).name, lat: stops.at(-1).lat, lon: stops.at(-1).lon, bookUrl: overnightUrl(stops.at(-1).name, addDays(start, i), opts.adults) },
      driveMin: driveTotal,
      driveKm: kmTotal,
      minutes: stops.reduce((s, x) => s + x.visitMin, 0) + driveTotal,
    };
  });
  const usedIds = new Set(result.flatMap((d) => d.stops.map((s) => s.id)));
  return {
    mode,
    days: result,
    spare: pool.filter((c) => !usedIds.has(c.id)).slice(0, 12),
    note: result.length < days ? (mode === 'day' ? `V dosahu jednodenního výletu jsem našel cíle jen na ${result.length} ${result.length === 1 ? 'den' : 'dny'}.` : 'Trasa se vešla do méně dní, než jsi zadal.') : null,
  };
}

/** Odkaz na ubytování v místě přespání (Booking, hledání podle názvu). */
export function overnightUrl(name, date, adults = 2) {
  const p = new URLSearchParams({ ss: name, checkin: date, checkout: addDays(date, 1), group_adults: String(adults), no_rooms: '1', lang: 'cs', selected_currency: 'CZK' });
  return affiliate(`https://www.booking.com/searchresults.cs.html?${p}`, 'booking');
}

function hhmm(min) {
  const m = Math.round(min) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
