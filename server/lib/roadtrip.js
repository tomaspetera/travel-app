// Výlety z jednoho místa: jednodenní (ráno ven, večer zpět) a vícedenní okružní cesta
// s přespáním po cestě. Bez AI – výběr podle významu míst a času jízdy:
//   • jednodenní: nejlepší kombinace 1–3 cílů (smyčka start → cíle → start) do kapacity dne,
//     při více dnech každý den jiné cíle;
//   • okružní: vkládání cílů do trasy podle poměru význam / přidaný čas, 2-opt, rozdělení do dnů.
// Doprava autem, nebo vlakem a autobusem – čas cesty je odhad (bez jízdních řádů), skutečný spoj
// ukáže odkaz do Google Map u každého úseku.
import { haversineKm } from './geo.js';
import { addDays } from './dates.js';
import { affiliate } from './links.js';

const DAY_MIN = { relaxed: 540, normal: 630, intense: 720 }; // čas dne vč. jízdy (min)
const VISIT = { town: 150, castle: 120, nature: 180, oldtown: 150, palace: 120, ruins: 90 };

// Autem: silnice ≈ 1,3 × vzdušná vzdálenost, průměr 70 km/h + 10 min na parkování.
export const roadKm = (a, b) => Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon) * 1.3);
export const driveMin = (a, b) => (a === b ? 0 : Math.round((roadKm(a, b) / 70) * 60 + 10));
// Vlakem / autobusem: 20 min na nádraží a čekání + ~55 km/h vzdušnou čarou; hrad nebo příroda
// bývají mimo trať (+30 min busem či pěšky na každém konci úseku), nad 80 km obvykle přestup
// (+20 min). Sedí na skutečné spoje: Praha–Kutná Hora ~1,5 h, Praha–Drážďany ~2,5 h,
// Praha–Karlštejn (hrad) ~1 h 15 min, Praha–Český Krumlov ~3 h.
const offRail = (p) => Boolean(p.tripKind) && p.tripKind !== 'town';
export const transitMin = (a, b) => {
  if (a === b) return 0;
  const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
  return Math.round(20 + km * 1.1 + (km > 80 ? 20 : 0) + (offRail(a) ? 30 : 0) + (offRail(b) ? 30 : 0));
};
const railKm = (a, b) => Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon) * 1.2);

// maxDay = nejvýš na cestě za jednodenní výlet, maxLoop = za den okruhu; veřejnou dopravou se
// za den stihne méně zastávek (přestupy, čekání) a víc se vyplatí jeden cíl než dva na opačných
// stranách (penalty: čím menší, tím víc hodnota dne klesá s časem na cestě).
export const TRANSPORT = {
  car: { id: 'car', min: driveMin, km: roadKm, maxDay: 300, maxLoop: 330, penalty: 900, maxStops: { relaxed: 2, normal: 3, intense: 4 } },
  // ve vlaku se dá odpočívat – na cestě až 6 h (Praha–Drážďany a zpět vlakem je běžný výlet)
  transit: { id: 'transit', min: transitMin, km: railKm, maxDay: 360, maxLoop: 360, penalty: 600, maxStops: { relaxed: 1, normal: 2, intense: 3 } },
};
const CAR = TRANSPORT.car;
// Město s víc památkami = delší prohlídka (2 h + půl hodiny za každou další, max. 3,5 h).
export const visitMin = (p) => p.visitMin
  || (p.tripKind === 'town' && p.sights ? 120 + 30 * Math.min(3, p.sights - 1) : VISIT[p.tripKind] || (p.unesco ? 150 : 120));
// Hodnota cíle roste se skóre exponenciálně: jeden opravdu významný cíl (Drážďany, Kutná Hora)
// má přednost před několika průměrnými po cestě.
const value = (p) => Math.exp((p.score - 50) / 10);

/** Délka smyčky start → stops… → (konec) v minutách cesty. */
function legsMin(start, stops, end, tr = CAR) {
  let t = 0;
  let prev = start;
  for (const s of stops) { t += tr.min(prev, s); prev = s; }
  if (end) t += tr.min(prev, end);
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
export function bestDayLoop(base, pool, cap, maxStops = 3, tr = CAR) {
  let best = null;
  const top = pool.slice(0, 12);
  for (let k = 1; k <= Math.min(3, maxStops); k++) {
    for (const c of combos(top, k)) {
      let order = null;
      let drive = Infinity;
      for (const perm of permutations(c)) {
        const d = legsMin(base, perm, base, tr);
        if (d < drive) { drive = d; order = perm; }
      }
      const total = drive + order.reduce((s, p) => s + visitMin(p), 0);
      if (total > cap || drive > tr.maxDay) continue;
      const v = order.reduce((s, p) => s + value(p), 0) * (1 - drive / tr.penalty);
      if (!best || v > best.value) best = { stops: order, drive, total, value: v };
    }
  }
  return best;
}

function routeTime(base, stops, tr = CAR) {
  return legsMin(base, stops, base, tr) + stops.reduce((s, p) => s + visitMin(p), 0);
}

function twoOpt(base, stops, tr = CAR) {
  let best = stops.slice();
  let bestLen = legsMin(base, best, base, tr);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const len = legsMin(base, cand, base, tr);
        if (len + 1e-9 < bestLen) { best = cand; bestLen = len; improved = true; }
      }
    }
  }
  return best;
}

/** Rozdělí trasu do dnů podle kapacity; přespání u posledního cíle dne. min/drive = čas dne celkem/na cestě. */
export function splitDays(base, stops, cap, maxStops = 3, tr = CAR) {
  const days = [];
  let cur = { stops: [], min: 0, drive: 0, from: base };
  let prev = base;
  stops.forEach((s, i) => {
    // u posledního cíle se počítá i cesta zpět
    const drive = tr.min(prev, s) + (i === stops.length - 1 ? tr.min(s, base) : 0);
    const add = drive + visitMin(s);
    if (cur.stops.length && (cur.min + add > cap || cur.drive + drive > tr.maxLoop || cur.stops.length >= maxStops)) {
      days.push(cur);
      cur = { stops: [], min: 0, drive: 0, from: prev };
    }
    cur.stops.push(s);
    cur.min += add;
    cur.drive += drive;
    prev = s;
  });
  cur.back = tr.min(prev, base);
  days.push(cur);
  return days;
}

/**
 * Okružní cesta na `days` dní: vkládání cílů podle poměru hodnota / přidaný čas (jen tak, aby se
 * trasa po rozdělení do dnů vešla do `days`), po každém vložení 2-opt.
 */
export function planLoop(base, pool, days, cap, maxStops = 3, tr = CAR) {
  // Vejde se do počtu dní a žádný den (ani s jedinou zastávkou) nepřekročí čas dne a cesty.
  const ok = (sp) => sp.length <= days && sp.every((d) => d.min <= cap && d.drive <= tr.maxLoop);
  const fits = (t) => ok(splitDays(base, t, cap, maxStops, tr));
  let tour = [];
  const left = pool.slice(0, 40);
  for (;;) {
    let best = null;
    const now = routeTime(base, tour, tr);
    for (const c of left) {
      for (let pos = 0; pos <= tour.length; pos++) {
        const cand = [...tour.slice(0, pos), c, ...tour.slice(pos)];
        const added = routeTime(base, cand, tr) - now;
        const ratio = value(c) / Math.max(30, added);
        if (best && ratio <= best.ratio) continue;
        if (fits(cand)) best = { cand, c, ratio };
      }
    }
    if (!best) break;
    const opt = twoOpt(base, best.cand, tr);
    tour = fits(opt) ? opt : best.cand;
    left.splice(left.indexOf(best.c), 1);
  }
  if (!tour.length) return [];
  // Nevejde-li se rozdělení do počtu dní, ubírej nejméně významné cíle.
  let split = splitDays(base, tour, cap, maxStops, tr);
  while (!ok(split) && tour.length > 1) {
    const worst = [...tour].sort((a, b) => a.score - b.score)[0];
    tour = twoOpt(base, tour.filter((p) => p !== worst), tr);
    split = splitDays(base, tour, cap, maxStops, tr);
  }
  return split;
}

/**
 * candidates: [{ id, name, lat, lon, score, tripKind, unesco, image, extract, url }] (cíle mimo město)
 * opts: { base:{lat,lon,label}, start:'YYYY-MM-DD', days, mode:'day'|'loop', pace, transport:'car'|'transit' }
 */
export function planTrips(candidates, opts) {
  const { base, start, mode = 'day', pace = 'normal' } = opts;
  const tr = TRANSPORT[opts.transport] || CAR;
  const maxStops = tr.maxStops[pace] || tr.maxStops.normal;
  const days = Math.min(mode === 'loop' ? 10 : 7, Math.max(1, Math.round(opts.days || 1)));
  const cap = DAY_MIN[pace] || DAY_MIN.normal;
  // Jen dosažitelné cíle (tam a zpět v rámci dne pro jednodenní výlety), seřazené podle skóre.
  const valid = candidates.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon) && c.score > 0);
  // Slabé cíle (o 25+ bodů horší než nejlepší, nebo pod 55) jen jako „vata“ do trasy nepatří.
  const top = Math.max(0, ...valid.map((c) => c.score));
  const pool = valid
    .filter((c) => c.score >= Math.min(55, top - 25))
    .filter((c) => mode === 'loop' || (tr.min(base, c) + tr.min(c, base) + visitMin(c) <= cap && tr.min(base, c) + tr.min(c, base) <= tr.maxDay))
    .sort((a, b) => b.score - a.score);
  const out = [];
  if (mode === 'day') {
    let rest = pool;
    for (let i = 0; i < days && rest.length; i++) {
      const loop = bestDayLoop(base, rest, cap, maxStops, tr);
      if (!loop) break;
      out.push({ stops: loop.stops, from: base, back: tr.min(loop.stops.at(-1), base), min: loop.total });
      const used = new Set(loop.stops.map((s) => s.id));
      rest = rest.filter((c) => !used.has(c.id));
    }
  } else {
    out.push(...planLoop(base, pool, days, cap, maxStops, tr));
  }
  const result = out.map((d, i) => {
    let prev = d.from;
    let clock = 9 * 60; // odjezd v 9:00
    const stops = d.stops.map((s) => {
      const km = tr.km(prev, s);
      const dm = tr.min(prev, s);
      const depart = hhmm(clock);
      clock += dm;
      const item = { ...s, travelKm: km, travelMin: dm, depart, arrive: hhmm(clock), visitMin: visitMin(s) };
      clock += item.visitMin;
      prev = s;
      return item;
    });
    const last = i === out.length - 1;
    const backHome = mode === 'day' || last;
    const back = backHome ? { km: tr.km(prev, base), min: tr.min(prev, base), depart: hhmm(clock), arrive: hhmm(clock + tr.min(prev, base)) } : null;
    const travelTotal = stops.reduce((s, x) => s + x.travelMin, 0) + (back ? back.min : 0);
    const kmTotal = stops.reduce((s, x) => s + x.travelKm, 0) + (back ? back.km : 0);
    return {
      date: addDays(start, i),
      from: { name: i === 0 || mode === 'day' ? base.label : out[i - 1].stops.at(-1).name, lat: d.from.lat, lon: d.from.lon },
      stops,
      back,
      overnight: backHome ? null : { id: stops.at(-1).id, name: stops.at(-1).name, lat: stops.at(-1).lat, lon: stops.at(-1).lon, bookUrl: overnightUrl(stops.at(-1).name, addDays(start, i), opts.adults) },
      travelMin: travelTotal,
      travelKm: kmTotal,
      minutes: stops.reduce((s, x) => s + x.visitMin, 0) + travelTotal,
    };
  });
  const usedIds = new Set(result.flatMap((d) => d.stops.map((s) => s.id)));
  return {
    mode,
    transport: tr.id,
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
