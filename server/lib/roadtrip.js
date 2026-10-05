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
const MAX_DRIVE_DAY = 300; // jednodenní výlet: víc než 5 h za volantem nedává smysl
const MAX_DRIVE_LOOP = 330; // den okruhu (přejezd + zastávky) max. 5,5 h za volantem

export const roadKm = (a, b) => Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon) * 1.3);
export const driveMin = (a, b) => (a === b ? 0 : Math.round((roadKm(a, b) / 70) * 60 + 10));
// Město s víc památkami = delší prohlídka (2 h + půl hodiny za každou další, max. 3,5 h).
export const visitMin = (p) => p.visitMin
  || (p.tripKind === 'town' && p.sights ? 120 + 30 * Math.min(3, p.sights - 1) : VISIT[p.tripKind] || (p.unesco ? 150 : 120));
// Hodnota cíle roste se skóre exponenciálně: jeden opravdu významný cíl (Drážďany, Kutná Hora)
// má přednost před několika průměrnými po cestě.
const value = (p) => Math.exp((p.score - 50) / 10);
const MAX_STOPS = { relaxed: 2, normal: 3, intense: 4 };

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
export function bestDayLoop(base, pool, cap, maxStops = 3) {
  let best = null;
  const top = pool.slice(0, 12);
  for (let k = 1; k <= Math.min(3, maxStops); k++) {
    for (const c of combos(top, k)) {
      let order = null;
      let drive = Infinity;
      for (const perm of permutations(c)) {
        const d = legsMin(base, perm, base);
        if (d < drive) { drive = d; order = perm; }
      }
      const total = drive + order.reduce((s, p) => s + visitMin(p), 0);
      if (total > cap || drive > MAX_DRIVE_DAY) continue;
      const v = order.reduce((s, p) => s + value(p), 0) * (1 - drive / 900);
      if (!best || v > best.value) best = { stops: order, drive, total, value: v };
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

/** Rozdělí trasu do dnů podle kapacity; přespání u posledního cíle dne. min/drive = čas dne celkem/za volantem. */
export function splitDays(base, stops, cap, maxStops = 3) {
  const days = [];
  let cur = { stops: [], min: 0, drive: 0, from: base };
  let prev = base;
  stops.forEach((s, i) => {
    // u posledního cíle se počítá i cesta zpět
    const drive = driveMin(prev, s) + (i === stops.length - 1 ? driveMin(s, base) : 0);
    const add = drive + visitMin(s);
    if (cur.stops.length && (cur.min + add > cap || cur.drive + drive > MAX_DRIVE_LOOP || cur.stops.length >= maxStops)) {
      days.push(cur);
      cur = { stops: [], min: 0, drive: 0, from: prev };
    }
    cur.stops.push(s);
    cur.min += add;
    cur.drive += drive;
    prev = s;
  });
  cur.back = driveMin(prev, base);
  days.push(cur);
  return days;
}

/**
 * Okružní cesta na `days` dní: vkládání cílů podle poměru hodnota / přidaný čas (jen tak, aby se
 * trasa po rozdělení do dnů vešla do `days`), po každém vložení 2-opt.
 */
export function planLoop(base, pool, days, cap, maxStops = 3) {
  // Vejde se do počtu dní a žádný den (ani s jedinou zastávkou) nepřekročí čas dne a jízdy.
  const ok = (sp) => sp.length <= days && sp.every((d) => d.min <= cap && d.drive <= MAX_DRIVE_LOOP);
  const fits = (t) => ok(splitDays(base, t, cap, maxStops));
  let tour = [];
  const left = pool.slice(0, 40);
  for (;;) {
    let best = null;
    const now = routeTime(base, tour);
    for (const c of left) {
      for (let pos = 0; pos <= tour.length; pos++) {
        const cand = [...tour.slice(0, pos), c, ...tour.slice(pos)];
        const added = routeTime(base, cand) - now;
        const ratio = value(c) / Math.max(30, added);
        if (best && ratio <= best.ratio) continue;
        if (fits(cand)) best = { cand, c, ratio };
      }
    }
    if (!best) break;
    const opt = twoOpt(base, best.cand);
    tour = fits(opt) ? opt : best.cand;
    left.splice(left.indexOf(best.c), 1);
  }
  if (!tour.length) return [];
  // Nevejde-li se rozdělení do počtu dní, ubírej nejméně významné cíle.
  let split = splitDays(base, tour, cap, maxStops);
  while (!ok(split) && tour.length > 1) {
    const worst = [...tour].sort((a, b) => a.score - b.score)[0];
    tour = twoOpt(base, tour.filter((p) => p !== worst));
    split = splitDays(base, tour, cap, maxStops);
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
  const valid = candidates.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon) && c.score > 0);
  // Slabé cíle (o 25+ bodů horší než nejlepší, nebo pod 55) jen jako „vata“ do trasy nepatří.
  const top = Math.max(0, ...valid.map((c) => c.score));
  const pool = valid
    .filter((c) => c.score >= Math.min(55, top - 25))
    .filter((c) => mode === 'loop' || (driveMin(base, c) * 2 + visitMin(c) <= cap && driveMin(base, c) * 2 <= MAX_DRIVE_DAY))
    .sort((a, b) => b.score - a.score);
  const out = [];
  if (mode === 'day') {
    let rest = pool;
    for (let i = 0; i < days && rest.length; i++) {
      const loop = bestDayLoop(base, rest, cap, MAX_STOPS[pace] || 3);
      if (!loop) break;
      out.push({ stops: loop.stops, from: base, back: driveMin(loop.stops.at(-1), base), min: loop.total });
      const used = new Set(loop.stops.map((s) => s.id));
      rest = rest.filter((c) => !used.has(c.id));
    }
  } else {
    out.push(...planLoop(base, pool, days, cap, MAX_STOPS[pace] || 3));
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
    note: !result.length || result.length >= days ? null
      : mode === 'day' ? `V dosahu jednodenního výletu jsem našel cíle jen na ${dniTxt(result.length)}.`
        : `Trasa se vešla do ${result.length === 1 ? 'jednoho dne' : `${result.length} dní`} – víc cílů v okolí není.`,
  };
}

/** Odkaz na ubytování v místě přespání (Booking, hledání podle názvu). */
export function overnightUrl(name, date, adults = 2) {
  const p = new URLSearchParams({ ss: name, checkin: date, checkout: addDays(date, 1), group_adults: String(adults), no_rooms: '1', lang: 'cs', selected_currency: 'CZK' });
  return affiliate(`https://www.booking.com/searchresults.cs.html?${p}`, 'booking');
}

const dniTxt = (n) => `${n} ${n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'}`;

function hhmm(min) {
  const m = Math.round(min) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
