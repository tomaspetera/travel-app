// Cesta přes víc měst (multi-city, návrat z jiného místa): stihne se další let, výběr letů na úsek
// a skládání celých cest. Čistá logika bez dotazů na zdroje – hledání úseků řídí search.js (searchMulti).
import { destKey } from './airports.js';
import { localToUtcMs } from './dates.js';

export const MULTI = {
  maxLegs: 4,
  // Kolik letů na úsek nabídnout (nejlevnější, přímý, každý den a část dne, zbytek podle ceny).
  options: 16,
  // Kolik nejlevnějších celých cest vrátit.
  combos: 30,
  // Rezerva mezi příletem a dalším odletem: stejné letiště 3 h, jiné letiště téhož města 5 h, jiné město
  // (přejezd po zemi) další den a aspoň 8 h – ne přílet ve 23:50 a odlet z jiného města v 0:30.
  sameAirportMin: 180,
  sameCityMin: 300,
  otherCityMin: 480,
  // Let s přestupem bez známého příletu (cache Aviasales, arrUnknown): další let nejdřív 24 h po jeho odletu
  // (i s nočním přestupem bývá na místě do druhého dne; „další den“ nestačí – odlet 20:30, další let v 7:00).
  unknownArrMin: 1440,
  // Úseky se hledají nejvýš po dvou najednou; dvojice letišť pro Ryanair / Wizz Air na celé hledání
  // (rozdělené mezi úseky) a dotazy na letový řád Ryanairu na úsek.
  concurrency: 2,
  pairBudget: 24,
  departures: 2,
};

const localMs = (s) => Date.parse(`${String(s).slice(0, 16)}:00Z`);
const arrDate = (l) => (l.arr ? String(l.arr).slice(0, 10) : l.date);
const legSig = (l) => `${l.from}|${l.to}|${l.dep}|${l.carrier}|${l.stops}`;

/**
 * Stihne se let `next` po letu `prev`? null = ano, jinak důvod:
 *  { why: 'early' }                     – odlétá dřív, než předchozí let přistane (nebo v dřívější den),
 *  { why: 'short', gapMin, needMin }    – stejné letiště / město, ale rezerva kratší než 3 h (jiné letiště 5 h),
 *  { why: 'nextday' }                   – jiné město (přejezd po zemi) nebo neznámý čas: nejdřív další den,
 *  { why: 'short', …, move: true }      – jiné město další den, ale dřív než 8 h po příletu,
 *  { why: 'unknown', gapMin, needMin }  – předchozí let s přestupem nemá známý přílet: nejdřív 24 h po jeho odletu.
 * Časy jsou místní; na stejném letišti i v témže městě se dají porovnat přímo, mezi dvěma městy přes časové zóny.
 */
export function legFits(prev, next) {
  const aDate = arrDate(prev);
  if (next.date < aDate) return { why: 'early' };
  if (!prev.arr && prev.hasTime && prev.stops > 0) {
    const gapMin = Math.round(((localToUtcMs(next.dep, next.fromTz) ?? NaN) - (localToUtcMs(prev.dep, prev.fromTz) ?? NaN)) / 60000);
    // další let bez času se bere od půlnoci (nejdřívější možný odlet)
    return gapMin >= MULTI.unknownArrMin ? null : { why: 'unknown', gapMin: Number.isFinite(gapMin) ? gapMin : null, needMin: MULTI.unknownArrMin };
  }
  const sameAp = prev.to === next.from;
  const sameCity = sameAp || destKey(prev.to) === destKey(next.from);
  const timed = Boolean(prev.arr && prev.hasTime && next.hasTime);
  if (sameCity && timed) {
    const gapMin = Math.round((localMs(next.dep) - localMs(prev.arr)) / 60000);
    const needMin = sameAp ? MULTI.sameAirportMin : MULTI.sameCityMin;
    if (Number.isFinite(gapMin)) {
      if (gapMin < 0) return { why: 'early' };
      return gapMin < needMin ? { why: 'short', gapMin, needMin } : null;
    }
  }
  if (next.date <= aDate) return { why: 'nextday' };
  if (!sameCity && timed) {
    const gapMin = Math.round(((localToUtcMs(next.dep, next.fromTz) ?? NaN) - (localToUtcMs(prev.arr, prev.toTz) ?? NaN)) / 60000);
    if (Number.isFinite(gapMin) && gapMin < MULTI.otherCityMin) return { why: 'short', gapMin, needMin: MULTI.otherCityMin, move: true };
  }
  return null;
}

// Část dne odletu: 0 ráno (do 12 h), 1 odpoledne (do 18 h), 2 večer; bez času -1.
const partOf = (l) => {
  const h = Number(String(l.dep).slice(11, 13));
  return !l.hasTime || !Number.isFinite(h) ? -1 : h < 12 ? 0 : h < 18 ? 1 : 2;
};

/**
 * Rozmanité lety jednoho úseku z jednosměrných cest (trip.out, perPersonCzk vč. dopravy a zavazadel):
 * každý let jednou, nejlevnější, nejlevnější přímý, nejlevnější v každý den okna, pak ráno / odpoledne /
 * večer každého dne (ať se dá navázat i na pozdní přílet), zbytek podle ceny. Seřazené od nejlevnějšího.
 */
export function pickOptions(trips, max = MULTI.options) {
  const seen = new Set();
  const uniq = [];
  for (const t of [...(trips || [])].filter((x) => x && x.out && x.perPersonCzk > 0).sort((a, b) => a.perPersonCzk - b.perPersonCzk)) {
    const k = legSig(t.out);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(t);
  }
  const pick = new Set();
  const add = (t) => { if (t && pick.size < max) pick.add(t); };
  add(uniq[0]);
  add(uniq.find((t) => !t.out.stops));
  const days = [...new Set(uniq.map((t) => t.out.date))].sort();
  for (const d of days) add(uniq.find((t) => t.out.date === d));
  for (const d of days) for (const p of [0, 1, 2]) add(uniq.find((t) => t.out.date === d && partOf(t.out) === p));
  for (const t of uniq) add(t);
  return [...pick].sort((a, b) => a.perPersonCzk - b.perPersonCzk);
}

/** Návaznost letů sousedních úseků: links[i][a][b] = legFits(úsek i, let a → úsek i+1, let b). */
export function linkMatrix(legs) {
  const links = [];
  for (let i = 0; i + 1 < legs.length; i++) {
    links.push(legs[i].options.map((a) => legs[i + 1].options.map((b) => legFits(a.out, b.out))));
  }
  return links;
}

/**
 * Nejlevnější celé cesty: z každého úseku jeden let, sousední lety se musí stihnout (links).
 * Cena letu = option.perPersonCzk (letenka + doprava na/z domácího letiště + zavazadla, na osobu).
 * Návaznost závisí jen na posledním letu, takže stačí držet `limit` nejlevnějších začátků cesty pro každý
 * poslední let – výsledek je přesně `limit` nejlevnějších cest. maxPrice (Kč/os.) skryje dražší cesty.
 * Vrací { combos: [{ picks, perPersonCzk, flightCzk, groundCzk, bagCzk }], feasible = počet všech navazujících
 * cest, hidden = kolik z nich je dražších než maxPrice }.
 */
export function buildCombos(legs, links, { limit = MULTI.combos, maxPrice = null } = {}) {
  if (!legs.length || legs.some((l) => !l.options.length)) return { combos: [], hidden: 0, feasible: 0 };
  const n = legs.length;
  const cost = (i, a) => legs[i].options[a].perPersonCzk;
  const fits = (i, a, b) => !links[i][a][b];
  let partial = legs[0].options.map((_, a) => ({ picks: [a], cost: cost(0, a) })).filter((p) => !maxPrice || p.cost <= maxPrice);
  for (let i = 1; i < n; i++) {
    const byLast = legs[i].options.map(() => []);
    for (const p of partial) {
      const last = p.picks[p.picks.length - 1];
      legs[i].options.forEach((_, b) => {
        const c = p.cost + cost(i, b);
        if (fits(i - 1, last, b) && (!maxPrice || c <= maxPrice)) byLast[b].push({ picks: [...p.picks, b], cost: c });
      });
    }
    partial = byLast.flatMap((x) => x.sort((m, k) => m.cost - k.cost).slice(0, limit));
  }
  partial.sort((m, k) => m.cost - k.cost);
  // počet všech navazujících cest (po úsecích: kolika cestami se dá dojít k letu) a kolik z nich je do limitu ceny
  let ways = legs[0].options.map(() => 1);
  for (let i = 1; i < n; i++) ways = legs[i].options.map((_, b) => ways.reduce((s, w, a) => s + (fits(i - 1, a, b) ? w : 0), 0));
  const feasible = ways.reduce((s, w) => s + w, 0);
  let within = feasible;
  if (maxPrice) {
    within = 0;
    const walk = (i, a, c) => {
      if (c > maxPrice) return;
      if (i === n - 1) { within++; return; }
      legs[i + 1].options.forEach((_, b) => { if (fits(i, a, b)) walk(i + 1, b, c + cost(i + 1, b)); });
    };
    legs[0].options.forEach((_, a) => walk(0, a, cost(0, a)));
  }
  const sum = (picks, key) => picks.reduce((s, a, i) => s + (legs[i].options[a][key] || 0), 0);
  const combos = partial.slice(0, limit).map((p) => ({
    picks: p.picks,
    perPersonCzk: Math.round(p.cost),
    flightCzk: Math.round(sum(p.picks, 'flightCzk')),
    groundCzk: Math.round(sum(p.picks, 'groundCzk')),
    bagCzk: Math.round(sum(p.picks, 'bagCzk')),
  }));
  return { combos, hidden: feasible - within, feasible };
}

/** Rozpočet dvojic letišť na úsek (Ryanair, Wizz Air): celkem MULTI.pairBudget, nejméně 4 na úsek. */
export const pairsPerLeg = (n) => Math.max(4, Math.floor(MULTI.pairBudget / Math.max(1, n)));

/** Spustí async úlohy nejvýš po `n` najednou (pořadí výsledků = pořadí úloh). */
export async function runLimited(tasks, n = MULTI.concurrency) {
  const out = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  return out;
}

/**
 * Průběh hledání úseků jako jeden seznam zdrojů (součty dotazů a nálezů, nejhorší stav):
 * per = pro každý úsek pole stavů zdrojů ze search() (nebo null, dokud úsek nezačal).
 */
export function mergeStatus(per) {
  const ids = [];
  for (const list of per) for (const s of list || []) if (!ids.includes(s.id)) ids.push(s.id);
  const rank = { blocked: 3, down: 2, partial: 1 };
  const sum = (xs, k) => xs.reduce((n, x) => n + (x.s[k] || 0), 0);
  return ids.map((id) => {
    const xs = [];
    per.forEach((list, i) => {
      const s = (list || []).find((x) => x.id === id);
      if (s) xs.push({ s, i });
    });
    const states = xs.map((x) => x.s.state);
    const waiting = per.length - xs.length + states.filter((s) => s === 'pending').length;
    const state = waiting === per.length ? 'pending'
      : states.includes('running') || waiting ? 'running'
        : states.every((s) => s === 'error') ? 'error'
          : states.some((s) => s === 'error' || s === 'partial') ? 'partial' : 'done';
    // výpadek jen v části úseků = částečný; ve všech = nejhorší z nich
    const outs = xs.map((x) => x.s.outage).filter(Boolean).sort((a, b) => rank[b] - rank[a]);
    const outage = !outs.length ? null : outs.length < per.length ? 'partial' : outs[0];
    const tagged = (k) => xs.filter((x) => x.s[k]).map((x) => `${x.i + 1}. let: ${x.s[k]}`);
    return {
      id,
      state,
      calls: sum(xs, 'calls'),
      done: sum(xs, 'done'),
      found: sum(xs, 'found'),
      ms: Math.max(0, ...xs.map((x) => x.s.ms || 0)),
      error: tagged('error').join(' · ') || null,
      note: tagged('note').join(' · ') || null,
      failed: sum(xs, 'failed'),
      retried: sum(xs, 'retried'),
      outage,
      retryable: Boolean(outage),
      retryAfter: Math.max(0, ...xs.map((x) => x.s.retryAfter || 0)),
    };
  });
}
