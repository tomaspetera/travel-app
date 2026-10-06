// Orchestrace hledání: místa → letiště → dotazy na poskytovatele → skládání cest → řazení.
import { config } from '../config.js';
import { activeProviders } from '../providers/index.js';
import { resolveDestinations, resolveOrigins, describe } from './places.js';
import { airportsInCountry, destInfo, destKey, getAirport } from './airports.js';
import { addDays, chunkRange, clampRange, daysBetween, isYmd, monthsInRange, todayYmd } from './dates.js';
import { CONTINENT_BY_KEY, FAR_KM, LONG_HAUL_SWEEP, WARM_SWEEP, farAirport, farCountry, hubsNear, hubsOf } from './longhaul.js';
import { mainAirport, monthClimate, warmAirports, warmShare, warmestHi } from './climate.js';
import { bestOneWays, bestRoundTrips, calendarArray, dateOk, oneWayCalendar } from './optimizer.js';
import { fxInfo, loadRates, toCzk } from './fx.js';
import { haversineKm } from './geo.js';
import { validTrip } from './fares.js';
import { legBagEur } from './baggage.js';
import { priceLevelOf, priceStats, refOf, referencePrice } from './pricelevel.js';
import { MULTI, buildCombos, linkMatrix, mergeStatus, pairsPerLeg, pickOptions, runLimited } from './multi.js';

export { referencePrice, refOf };
import { attachGround } from './ground.js';

export class UserError extends Error {
  constructor(msg) {
    super(msg);
    this.status = 400;
  }
}

const int = (v, d, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const days = (arr) => (Array.isArray(arr) ? [...new Set(arr.map(Number).filter((n) => n >= 0 && n <= 6))] : []);
const ids = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean).slice(0, 8);

export function normalizeQuery(raw = {}) {
  if (raw.trip === 'multi') return normalizeMulti(raw);
  const from = ids(raw.from);
  if (!from.length) throw new UserError('Zadej, odkud chceš letět (město, letiště nebo zemi).');
  let [dateFrom, dateTo] = clampRange(raw.dateFrom, raw.dateTo);
  const trip = raw.trip === 'oneway' ? 'oneway' : 'return';
  let nightsMin = int(raw.nightsMin, 2, 0, 45);
  let nightsMax = int(raw.nightsMax, 7, 0, 45);
  if (nightsMax < nightsMin) [nightsMin, nightsMax] = [nightsMax, nightsMin];
  // Přesná data: odlet tam = exactOut, návrat = exactBack (± flexDays) – nic jiného se nenabídne.
  let exact = null;
  if (raw.exactOut != null && raw.exactOut !== '') {
    const out = String(raw.exactOut);
    const back = trip === 'return' ? String(raw.exactBack || '') : null;
    const flex = int(raw.flexDays, 0, 0, 3);
    const today = todayYmd();
    if (!isYmd(out)) throw new UserError('Zadej datum odletu.');
    if (out < today) throw new UserError('Datum odletu je v minulosti.');
    if (out > addDays(today, 360)) throw new UserError('Datum odletu je příliš daleko (nejvýš rok dopředu).');
    if (trip === 'return' && !isYmd(back)) throw new UserError('Zadej datum návratu.');
    if (back && back < out) throw new UserError('Návrat musí být stejný den nebo po odletu.');
    if (back && daysBetween(out, back) > 45) throw new UserError('Pobyt může mít nejvýš 45 nocí.');
    dateFrom = addDays(out, -flex) < today ? today : addDays(out, -flex);
    dateTo = addDays(out, flex);
    exact = { out, back, flex };
    if (back) {
      const backFrom = addDays(back, -flex) < dateFrom ? dateFrom : addDays(back, -flex);
      exact.backFrom = backFrom;
      exact.backTo = addDays(back, flex);
      nightsMin = Math.max(0, daysBetween(dateTo, backFrom));
      nightsMax = daysBetween(dateFrom, exact.backTo);
    }
  }
  return {
    exact,
    from,
    to: ids(raw.to).filter((x) => x !== 'anywhere'),
    dateFrom,
    dateTo,
    trip,
    nightsMin,
    nightsMax,
    outDays: exact ? [] : days(raw.outDays),
    backDays: trip === 'return' && !exact ? days(raw.backDays) : [],
    ...sharedQuery(raw),
    // „Za teplem“: jen cíle, kde je v měsíci odletu průměrné denní maximum aspoň tolik °C.
    minTemp: Number(raw.minTemp) > 0 ? int(raw.minTemp, null, 15, 35) : null,
  };
}

// Pole společná pro všechna hledání (i cestu přes víc měst).
const sharedQuery = (raw) => ({
  radiusKm: int(raw.radiusKm, 200, 0, 600),
  adults: int(raw.adults, 1, 1, 9),
  maxPrice: raw.maxPrice ? int(raw.maxPrice, null, 0, 1e7) : null,
  directOnly: Boolean(raw.directOnly),
  kmRate: Math.min(5, Math.max(0, Number(raw.kmRate ?? 1.1) || 0)),
  openJaw: raw.openJaw !== false,
  // Letiště, která uživatel z okruhu ručně vyřadil.
  exclude: (Array.isArray(raw.exclude) ? raw.exclude : []).map((x) => String(x).toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x)),
  // Zavazadla započítaná do ceny: jen malé pod sedadlo (v ceně) / + kabinový kufr / + kufr k odbavení.
  bags: raw.bags === 'cabin' || raw.bags === 'checked' ? raw.bags : 'none',
});

/**
 * Cesta přes víc měst: trip 'multi', legs [{ from, to, date, flexDays }] – 2 až 4 lety jedním směrem,
 * data po sobě (týž den smí), ne v minulosti, každé ± 0–3 dny. Okruh letišť a doprava na letiště platí
 * pro začátek cesty (from 1. letu) a návrat domů; ostatní úseky z / do zadaného města.
 */
function normalizeMulti(raw) {
  const list = Array.isArray(raw.legs) ? raw.legs : [];
  if (list.length < 2) throw new UserError('Cesta přes víc měst potřebuje aspoň 2 lety.');
  if (list.length > MULTI.maxLegs) throw new UserError(`V jedné cestě můžou být nejvýš ${MULTI.maxLegs} lety.`);
  const today = todayYmd();
  const legs = list.map((l, i) => {
    const n = `${i + 1}.`;
    const x = l && typeof l === 'object' ? l : {};
    const from = ids(x.from);
    const to = ids(x.to).filter((id) => id !== 'anywhere');
    if (!from.length) throw new UserError(`Zadej, odkud je ${n} let.`);
    if (!to.length) throw new UserError(`Zadej, kam je ${n} let (město nebo letiště).`);
    if ([...from].sort().join() === [...to].sort().join()) throw new UserError(`${n} let má stejné místo odletu i cíl.`);
    const date = String(x.date || '');
    if (!isYmd(date)) throw new UserError(`Zadej datum ${n} letu.`);
    if (date < today) throw new UserError(`Datum ${n} letu je v minulosti.`);
    if (date > addDays(today, 360)) throw new UserError(`Datum ${n} letu je příliš daleko (nejvýš rok dopředu).`);
    const flex = int(x.flexDays, 0, 0, 3);
    return { from, to, date, flex, dateFrom: addDays(date, -flex) < today ? today : addDays(date, -flex), dateTo: addDays(date, flex) };
  });
  for (let i = 1; i < legs.length; i++) {
    if (legs[i].date < legs[i - 1].date) throw new UserError(`${i + 1}. let nesmí být dřív než ${i}. – seřaď lety podle data.`);
  }
  if (daysBetween(legs[0].date, legs.at(-1).date) > 90) throw new UserError('Cesta přes víc měst může trvat nejvýš 90 dní.');
  return {
    trip: 'multi',
    legs,
    exact: null,
    from: legs[0].from,
    to: legs.at(-1).to,
    dateFrom: legs[0].dateFrom,
    dateTo: legs.at(-1).dateTo,
    nightsMin: 0,
    nightsMax: 0,
    outDays: [],
    backDays: [],
    ...sharedQuery(raw),
    minTemp: null,
  };
}

// Odhad příplatku za zavazadlo k jednomu letu (Kč/os., kurz jako u letenek); dálkový let podle vzdálenosti letišť.
export function legBagCzk(leg, bags) {
  if (!leg || bags === 'none') return { czk: 0, estimated: false };
  const f = legBagEur(leg, bags, { longHaul: distKm(leg.from, leg.to) > FAR_KM });
  return { czk: toCzk(f.eur, 'EUR') ?? 0, estimated: f.estimated };
}

// Skóre výhodnosti vůči běžné ceně na vzdálenost (referencePrice v pricelevel.js).
export function dealOf(trip) {
  const ref = refOf(trip);
  const score = ref / trip.flightCzk;
  const legs = [trip.out, trip.back].filter(Boolean);
  const prev = legs.every((l) => l.prevCzk || l.czk) ? legs.reduce((s, l) => s + (l.prevCzk || l.czk || 0), 0) : null;
  const drop = prev && !trip.combined && prev > trip.flightCzk * 1.05 ? Math.round((1 - trip.flightCzk / prev) * 100) : null;
  return {
    score: Math.round(score * 100) / 100,
    level: score >= 2.6 ? 'super' : score >= 1.7 ? 'good' : score < 0.8 ? 'pricey' : 'normal',
    drop,
  };
}

async function settle(fn, st, p, ctx) {
  const t0 = Date.now();
  st.state = 'running';
  try {
    await fn();
    st.state = st.error ? 'partial' : 'done';
  } catch (e) {
    st.state = 'error';
    st.error = e.message || String(e);
  } finally {
    st.ms = Date.now() - t0;
    Object.assign(st, outageOf(st, p, ctx));
  }
}

/**
 * Výpadek zdroje v tomto hledání (pro hlášku „Kiwi.com neodpovědělo“ a tlačítko Zkusit znovu):
 * outage = null | 'partial' (část dotazů selhala) | 'down' (nic neprošlo) | 'blocked' (vynecháno po
 * výpadku v jiných hledáních, znovu za retryAfter s). Kiwi počítá dotazy i opakování (ctx).
 */
export function outageOf(st, p, ctx) {
  const failed = ctx ? ctx.failed : st.failed || 0;
  let outage = null;
  if (ctx?.blocked && !ctx.ok) outage = 'blocked';
  else if (st.state === 'error' || (ctx && (ctx.failed || ctx.skipped) && !ctx.ok)) outage = 'down';
  else if (st.state === 'partial' || (ctx && (ctx.failed || ctx.skipped))) outage = 'partial';
  return {
    failed,
    retried: ctx ? ctx.retried : 0,
    outage,
    retryable: Boolean(outage),
    retryAfter: outage === 'blocked' && p?.retryAfter ? p.retryAfter() : 0,
  };
}

/**
 * Hlavní hledání. emit(event) dostává průběh: { type: 'progress', providers }.
 * opts (pro hledání úseků cesty přes víc měst a testy): providers = zdroje místo activeProviders(),
 * limits = { maxPairs (dvojic letišť na zdroj), departures (dotazů na letový řád Ryanairu) }, hubs: false = bez
 * přestupních letišť v okolí.
 */
/** Poznámka v průběhu hledání, když zdroj bez „kamkoliv“ (Wizz Air) prošel jen část tras – pro uživatele, bez názvu proměnné WIZZ_MAX_CALLS. */
export const routesNote = (take, total) => `prohledáno ${take} z ${total} tras (nejbližší) – zbytek kvůli limitu dotazů`;

export async function search(raw, emit = () => {}, opts = {}) {
  const t0 = Date.now();
  const q = normalizeQuery(raw);
  if (q.trip === 'multi') return searchMulti(q, emit, opts);
  const limits = opts.limits || {};
  await loadRates();

  const origins = resolveOrigins(q.from, { radiusKm: q.radiusKm, kmRate: q.kmRate, maxAirports: config.maxOrigins + q.exclude.length });
  origins.airports = origins.airports.filter((a) => !q.exclude.includes(a.iata)).slice(0, config.maxOrigins);
  if (!origins.airports.length) throw new UserError('V okolí jsem nenašel žádné letiště s pravidelnými lety. Zvětši okruh.');
  const dest = resolveDestinations(q.to);
  const originSet = new Set(origins.airports.map((a) => a.iata));
  const groundMap = new Map(origins.airports.map((a) => [a.iata, a.ground ? a.ground.czk : 0]));
  const groundOf = (iata) => groundMap.get(iata) ?? 0;
  const home = origins.home;

  const ret = q.trip === 'return' ? { nightsMin: q.nightsMin, nightsMax: q.nightsMax, backFrom: q.exact?.backFrom, backTo: q.exact?.backTo } : null;
  const backFrom = q.exact?.backFrom || addDays(q.dateFrom, ret ? ret.nightsMin : 0);
  const backTo = q.exact?.backTo || addDays(q.dateTo, ret ? ret.nightsMax : 0);
  const constraints = {
    nightsMin: q.nightsMin, nightsMax: q.nightsMax, outDays: q.outDays, backDays: q.backDays,
    openJawHome: q.openJaw, openJawDest: q.openJaw,
    // Přesná data: odlet jen v okně dateFrom..dateTo, návrat jen v okně backFrom..backTo.
    ...(q.exact ? { outFrom: q.dateFrom, outTo: q.dateTo, backFrom: q.exact.backFrom, backTo: q.exact.backTo } : {}),
    // Zavazadla patří do ceny už při skládání cest a v kalendáři, ne až ve výpisu.
    ...(q.bags !== 'none' ? { extra: (l) => legBagCzk(l, q.bags).czk } : {}),
  };

  const providers = opts.providers || activeProviders();
  const status = providers.map((p) => ({
    id: p.id, state: 'pending', calls: 0, done: 0, found: 0, ms: 0, error: null, note: null,
    failed: 0, retried: 0, outage: null, retryable: false, retryAfter: 0,
  }));
  const stOf = (p) => status.find((s) => s.id === p.id);
  // Stav zdroje v tomto hledání (Kiwi: úspěchy, chyby, opakování) – předává se do jeho dotazů.
  const ctxs = new Map(providers.map((p) => [p.id, p.context ? p.context() : null]));
  const ctxOf = (p) => ctxs.get(p.id);
  // Přesná data: dny kolem odletu/návratu (±3), které zdroje vrátí bez dotazu navíc → „nejbližší dny“.
  const nearOut = q.exact ? nearRange(q.exact.out) : null;
  const nearBack = q.exact?.back ? nearRange(q.exact.back) : null;
  const nearLegs = { out: [], back: [] };
  let lastEmit = 0;
  const progress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 250) return;
    lastEmit = now;
    emit({ type: 'progress', providers: status });
  };
  progress(true);

  const trips = [];
  const outLegs = [];
  const backLegs = [];
  const routeMode = dest.kind === 'airports';
  const destAirports = routeMode ? dest.airports.filter((a) => !originSet.has(a)) : [];
  const countries = dest.kind === 'countries' ? new Set(dest.countries) : null;
  const singleCountry = countries && countries.size === 1 ? [...countries][0] : null;
  const destOk = (iata) => !countries || countries.has(getAirport(iata)?.cc);

  // Dálkové lety (Asie, Afrika, Amerika…): Kiwi se ptá jedním dotazem i z velkých přestupních
  // letišť v okolí (Vídeň, Mnichov, Berlín…), odkud bývá let i s cestou na letiště levnější.
  const farDest = routeMode ? destAirports.some((d) => farAirport(home, d))
    : countries ? [...countries].some((cc) => farCountry(home, cc)) : true;
  const hubs = farDest && opts.hubs !== false ? hubsNear(home, originSet, { kmRate: q.kmRate, exclude: q.exclude }) : [];
  const allOrigins = new Set([...originSet, ...hubs.map((h) => h.iata)]);
  for (const h of hubs) groundMap.set(h.iata, h.ground.czk);
  // Hlavní odletová letiště pro dotazy z víc letišť najednou: zadaná / nejbližší, pak velká.
  const chosen = new Set(q.from.filter((x) => x.startsWith('ap:')).map((x) => x.slice(3).toUpperCase()));
  const mainOrigins = (n) => {
    const rank = { L: 0, M: 1, S: 2 };
    return [...origins.airports]
      .sort((x, y) => Number(chosen.has(y.iata)) - Number(chosen.has(x.iata)) || rank[getAirport(x.iata).type] - rank[getAirport(y.iata).type] || x.distKm - y.distKm)
      .slice(0, n).map((a) => a.iata);
  };
  // Domovské letiště (0): zadané, nebo do 25 km od výchozího místa; ostatní v okruhu (1).
  const distOf = new Map(origins.airports.map((a) => [a.iata, a.distKm]));
  const homeRank = (iata) => (chosen.has(iata) || (distOf.get(iata) ?? 99) < 25 ? 0 : 1);
  // „Za teplem“: měsíce odletu (1–12) a teplé země – aspoň jedno velké letiště tam má v některém z měsíců
  // průměrné maximum ≥ minTemp; je-li teplá jen menší část země, Kiwi se ptá rovnou na teplá letiště.
  const monthsOf = (a, b) => [...new Set(monthsInRange(a, b).map((d) => Number(d.slice(5, 7))))];
  const allMonths = monthsOf(q.dateFrom, q.dateTo);
  const warmOk = (iata) => !q.minTemp || (warmestHi(iata, allMonths) ?? -99) >= q.minTemp;
  // Let v měsíci, kdy je v cíli dost teplo (stejné pravidlo jako filtr ve výsledcích) – chladné termíny
  // se vyřadí hned, jinak by jako levnější zabraly místa (2 na trasu, limit kalendáře) teplým.
  const warmLeg = (l) => !q.minTemp || (monthClimate(l.to, l.date)?.hi ?? -99) >= q.minTemp;
  const warmTargets = (order, months, max) => {
    const out = [];
    for (const cc of order) {
      const w = warmAirports(cc, months, q.minTemp);
      if (!w) continue;
      out.push(w.most ? { to: cc, cc, airports: w.airports, far: farCountry(home, cc) }
        : { to: w.airports.slice(0, 15).join(','), cc, airports: w.airports, far: w.airports.some((x) => farAirport(home, x)) });
      if (out.length >= max) break;
    }
    return out;
  };
  // Pořadí zemí pro Kiwi: u světadílu nejdřív ty oblíbené (každá země = jeden dotaz). Za teplem jen teplé
  // země (dotazů není víc) a „kamkoliv“ jen tehdy, když je teplo i na většině blízkých letišť (léto).
  const pickTargets = (months) => {
    if (!countries) {
      const sweep = [{ to: 'anywhere', far: false }, ...LONG_HAUL_SWEEP.map((cc) => ({ to: cc, cc, far: true }))];
      if (!q.minTemp) return sweep;
      const any = warmShare(home || getAirport(origins.airports[0].iata), months, q.minTemp, FAR_KM) >= 0.5;
      const slots = sweep.length - (any ? 1 : 0);
      // Blízké teplé země nanejvýš na polovinu dotazů, zbytek dálkové (Egypt, Emiráty…) jako bez filtru –
      // jinak by od jara do podzimu Kiwi hledalo jen v Evropě, kterou pokrývá i Ryanair a Wizz.
      const all = warmTargets(WARM_SWEEP, months, WARM_SWEEP.length);
      const isNear = (t) => !farAirport(home, mainAirport(t.cc));
      const near = all.filter(isNear);
      const far = all.filter((t) => !isNear(t));
      const nNear = Math.min(near.length, Math.max(Math.ceil(slots / 2), slots - far.length));
      const warm = [...near.slice(0, nNear), ...far.slice(0, slots - nNear)];
      return warm.length ? [...(any ? [sweep[0]] : []), ...warm] : sweep;
    }
    const order = [];
    for (const key of dest.continents || []) for (const cc of CONTINENT_BY_KEY.get(key).sweep) if (countries.has(cc)) order.push(cc);
    for (const cc of countries) order.push(cc);
    const list = [...new Set(order)];
    const warm = q.minTemp ? warmTargets(list, months, 12) : [];
    return warm.length ? warm : list.slice(0, 12).map((cc) => ({ to: cc, cc, far: farCountry(home, cc) }));
  };
  // Cíle pro okno dat a..b (za teplem se liší podle měsíců okna).
  const targetMemo = new Map();
  const exploreTargets = (a = q.dateFrom, b = q.dateTo) => {
    const key = q.minTemp ? `${a}|${b}` : '';
    if (!targetMemo.has(key)) targetMemo.set(key, pickTargets(monthsOf(a, b)));
    return targetMemo.get(key);
  };
  // Travelpayouts u zemí: kromě „odkudkoliv“ i dotaz přímo na hlavní (za teplem teplá) letiště země.
  const tpHubTargets = () => {
    if (!countries) return [];
    const list = exploreTargets();
    const per = list.length <= 3 ? 3 : list.length <= 6 ? 2 : 1;
    return list.flatMap((t) => (t.airports || hubsOf(t.cc, per)).slice(0, per)).slice(0, 16);
  };

  // Spustí úlohy s počítáním průběhu; chyba jedné úlohy nezastaví ostatní.
  async function runTasks(st, tasks) {
    st.calls += tasks.length;
    progress();
    let firstErr = null;
    let failed = 0;
    await Promise.all(tasks.map((t) => t().catch((e) => {
      failed++;
      firstErr = firstErr || e;
    }).finally(() => {
      st.done++;
      progress();
    })));
    st.failed += failed;
    if (failed && failed === tasks.length) throw firstErr;
    if (failed) st.error = `${failed}/${tasks.length} dotazů selhalo: ${firstErr.message}`;
  }

  // Kiwi: země / světadíl / „kamkoliv“ – jeden dotaz na zemi a okno dat (≤ 31 dní), z víc letišť
  // najednou; po časovém limitu se zbylé dotazy přeskočí (hledání nečeká).
  async function kiwiExplore(p, st) {
    const targets = exploreTargets();
    const windows = chunkRange(q.dateFrom, q.dateTo, 31);
    const deadline = Date.now() + (p.exploreMs || 25000);
    const home3 = mainOrigins(3);
    const hubCodes = hubs.map((h) => h.iata);
    let skipped = 0;
    let split = false;
    const tasks = [];
    for (const [a, b] of windows) {
      for (const t of exploreTargets(a, b)) {
        // Přesná data, dálková země: zvlášť z domova a zvlášť z přestupních letišť – jinak 15 výsledků
        // (1 na město) zaberou nejlevnější odlety z jednoho letiště (New York jen z Berlína). U 1–2 zemí
        // navíc z domova na hlavní města země bez „1 výsledek na město“ → víc spojení do New Yorku, Miami…
        const calls = [];
        if (q.exact && countries && t.far && hubCodes.length) {
          split = true;
          calls.push({ origins: home3, to: t.to, oneForCity: true }, { origins: hubCodes, to: t.to, oneForCity: true });
        } else {
          calls.push({ origins: t.far ? [...home3, ...hubCodes] : home3, to: t.to, oneForCity: true });
        }
        if (q.exact && t.far && !t.airports && countries && countries.size <= 2) {
          const cities = hubsOf(t.cc, 3);
          if (cities.length) calls.push({ origins: home3, to: cities, oneForCity: false });
        }
        for (const c of calls) tasks.push(async () => {
          if (Date.now() > deadline - 1500) { skipped++; return; }
          let res;
          try {
            res = await p.search({
              origins: c.origins, to: c.to, dateFrom: a, dateTo: b, ret, exact: q.exact,
              adults: q.adults, directOnly: q.directOnly, outDays: q.outDays, backDays: q.backDays, oneForCity: c.oneForCity, deadline, ctx: ctxOf(p),
            });
          } catch (e) {
            if (/vypršel čas/.test(e.message)) { skipped++; return; }
            throw e;
          }
          for (const x of res) {
            if (!allOrigins.has(x.out.from) || (x.back && !allOrigins.has(x.back.to))) continue;
            // cíl, který neznáme (chybí v databázi letišť), by se ukázal jen jako kód
            if (allOrigins.has(x.out.to) || !getAirport(x.out.to) || !destOk(x.out.to)) continue;
            if (!dateOk(x.out.date, x.back?.date, constraints)) continue;
            trips.push(x);
            st.found++;
          }
        });
      }
    }
    await runTasks(st, tasks);
    const used = windows.flatMap(([a, b]) => exploreTargets(a, b));
    const parts = [q.minTemp ? `za teplem ≥ ${q.minTemp} °C: ${[...new Set(used.map((t) => t.cc || 'kamkoliv'))].join(', ')}`
      : `${countries ? `${targets.length} ${targets.length === 1 ? 'země' : targets.length < 5 ? 'země' : 'zemí'}` : 'celý svět + dálkové země'}`];
    if (hubs.length && used.some((t) => t.far)) parts.push(`i z ${hubs.map((h) => h.iata).join(', ')}${split ? ' (zvlášť)' : ''}`);
    if (skipped) parts.push(`po ${Math.round((p.exploreMs || 25000) / 1000)} s ukončeno – ${skipped} z ${tasks.length} dotazů vynecháno`);
    st.note = parts.join(' · ');
  }

  async function exploreProvider(p) {
    const st = stOf(p);
    if (p.search && !p.explore) return kiwiExplore(p, st);
    if (!p.explore && !p.destinations) {
      st.note = 'hledá jen ke konkrétnímu cíli – zadej, kam letíš';
      return;
    }
    const stations = await p.stations();
    const ors = origins.airports.filter((a) => !stations || stations.has(a.iata));
    if (!ors.length) {
      st.note = 'z vybraných letišť nelétá';
      return;
    }
    if (p.explore) {
      const refine = [];
      // Agregátor z cache u zemí: navíc dotaz na hlavní letiště země z domovského letiště.
      const hubDests = !p.live ? tpHubTargets() : [];
      const hubCalls = hubDests.map((d) => ({ origin: mainOrigins(1)[0], destination: d }));
      await runTasks(st, [...ors.map((o) => ({ origin: o.iata })), ...hubCalls].map((c) => async () => {
        const res = await p.explore({
          origin: c.origin, ...(c.destination ? { destination: c.destination } : {}), dateFrom: q.dateFrom, dateTo: q.dateTo, ret, country: singleCountry,
          adults: q.adults, directOnly: q.directOnly,
        });
        for (const t of res) {
          if (!destOk(t.out.to)) continue;
          if (dateOk(t.out.date, t.back?.date, constraints)) {
            trips.push(t);
            st.found++;
            // za teplem: jediný (nejlevnější) termín vyšel na chladný měsíc → teplejší dohledat po dnech
            if (p.daily && !warmLeg(t.out) && warmOk(t.out.to)) refine.push(t);
          } else if (p.daily && warmOk(t.out.to)) {
            // dohledávat po dnech jen cíle, které můžou projít filtrem „za teplem“
            refine.push(t);
          }
        }
      }));
      // Ryanair vrací jen 1 nejlevnější termín na destinaci – když nesedí na zadaný
      // počet nocí / dny v týdnu, dohledej ceny po dnech a slož termín přesně.
      const have = new Set(trips.filter((t) => t.provider === p.id && warmLeg(t.out)).map((t) => `${t.out.from}|${t.out.to}`));
      const todo = [];
      const seen = new Set();
      for (const t of refine.sort((a, b) => a.flightCzk - b.flightCzk)) {
        const k = `${t.out.from}|${t.out.to}`;
        if (have.has(k) || seen.has(k)) continue;
        seen.add(k);
        todo.push(t);
        if (todo.length >= 10) break;
      }
      if (todo.length) {
        await runTasks(st, todo.map((t) => async () => {
          const found = await routeTrips(p, t.out.from, t.out.to, { perPair: 2 });
          trips.push(...found);
          st.found += found.length;
        }));
      }
      return;
    }
    // Poskytovatel bez „kamkoliv“: projdi jednotlivé trasy v rámci rozpočtu volání.
    const lists = await Promise.all(ors.map(async (o) => (await p.destinations(o.iata, singleCountry))
      .filter((d) => destOk(d) && !originSet.has(d) && warmOk(d))
      .map((d) => ({ o: o.iata, d, km: distKm(o.iata, d) }))
      .sort((a, b) => a.km - b.km)));
    const routes = roundRobin(lists);
    const perRoute = (p.callsPerRoute ? p.callsPerRoute(q.dateFrom, q.dateTo) : 1) * (ret ? 2 : 1);
    const budget = p.id === 'wizzair' ? config.wizzMaxCalls : Infinity;
    const take = Math.max(1, Math.min(routes.length, Math.floor(budget / perRoute)));
    if (take < routes.length) st.note = routesNote(take, routes.length);
    await runTasks(st, routes.slice(0, take).map((r) => async () => {
      const found = await routeTrips(p, r.o, r.d, { perPair: 2 });
      trips.push(...found);
      st.found += found.length;
    }));
  }

  // Ceny po dnech pro jednu trasu → nejlepší cesty (bez open-jaw).
  async function routeTrips(p, o, d, { perPair }) {
    const out = (await p.daily({ from: o, to: d, dateFrom: q.dateFrom, dateTo: q.dateTo, adults: q.adults, directOnly: q.directOnly })).filter(warmLeg);
    if (!ret) return bestOneWays(out, groundOf, { ...constraints, perDestLimit: perPair, limit: perPair });
    if (!out.length) return [];
    const back = await p.daily({ from: d, to: o, dateFrom: backFrom, dateTo: backTo, adults: q.adults, directOnly: q.directOnly });
    return bestRoundTrips(out, back, groundOf, { ...constraints, openJawHome: false, openJawDest: false, perDestLimit: perPair, limit: perPair });
  }

  async function routeProvider(p) {
    const st = stOf(p);
    const stations = await p.stations();
    const ors = origins.airports.filter((a) => !stations || stations.has(a.iata));
    const pairs = [];
    for (const o of ors) {
      const routes = await p.routes(o.iata);
      for (const d of destAirports) {
        if (stations && !stations.has(d)) continue;
        if (routes && !routes.has(d)) continue;
        pairs.push({ o: o.iata, d });
      }
    }
    if (!pairs.length) {
      st.note = 'tuto trasu nelétá';
      return;
    }
    // Agregátor z cache (Travelpayouts): stačí jeho vlastní hledání na trase – vrací
    // jednosměrné i zpáteční letenky (společná cena) za celý měsíc jedním dotazem.
    if (!p.live && p.explore) {
      const capped = pairs.slice(0, Math.min(16, limits.maxPairs || 16));
      if (pairs.length > capped.length) st.note = `prohledáno ${capped.length} z ${pairs.length} kombinací letišť`;
      await runTasks(st, capped.map(({ o, d }) => async () => {
        const res = await p.explore({ origin: o, destination: d, dateFrom: q.dateFrom, dateTo: q.dateTo, ret, adults: q.adults, directOnly: q.directOnly });
        for (const t of res) {
          if (dateOk(t.out.date, t.back?.date, constraints)) {
            trips.push(t);
            st.found++;
          }
        }
      }));
      return;
    }
    // Pomalejší zdroje (Kiwi) a úseky cesty přes víc měst (rozpočet dvojic) jen pro pár nejvýznamnějších
    // letišť: domovské (zadané / nejbližší) vždy, pak velká a blízká.
    if (p.maxPairs || limits.maxPairs) {
      const rank = { L: 0, M: 1, S: 2 };
      const dist = new Map(origins.airports.map((a) => [a.iata, a.distKm]));
      pairs.sort((x, y) => homeRank(x.o) - homeRank(y.o) || rank[getAirport(x.o).type] - rank[getAirport(y.o).type] || dist.get(x.o) - dist.get(y.o));
    }
    // Dálková trasa (Kiwi): celé období zpátečními letenkami – jeden dotaz na měsíc ze všech letišť
    // (i přestupních v okolí) na všechna cílová; jednotlivé lety po dnech jen pro první 3 týdny.
    const longHaul = Boolean(p.search && farDest);
    const tasks = [];
    let dayTo = q.dateTo;
    let dayBackTo = backTo;
    if (longHaul) {
      const windows = chunkRange(q.dateFrom, q.dateTo, 31);
      const froms = [...mainOrigins(3), ...hubs.map((h) => h.iata)];
      const tos = destAirports.slice(0, 8);
      dayTo = addDays(q.dateFrom, 20) < q.dateTo ? addDays(q.dateFrom, 20) : q.dateTo;
      dayBackTo = ret ? (addDays(dayTo, ret.nightsMax) < backTo ? addDays(dayTo, ret.nightsMax) : backTo) : backTo;
      for (const [a, b] of windows) {
        tasks.push(async () => {
          let res;
          try {
            res = await p.search({
              origins: froms, to: tos, dateFrom: a, dateTo: b, ret, exact: q.exact, adults: q.adults, directOnly: q.directOnly,
              outDays: q.outDays, backDays: q.backDays, deadline: longDeadline, ctx: ctxOf(p),
            });
          } catch (e) {
            if (/vypršel čas/.test(e.message)) return; // nestihlo se – hlásí se poznámkou níž, ne jako chyba
            throw e;
          }
          for (const x of res) {
            if (!allOrigins.has(x.out.from) || (x.back && !allOrigins.has(x.back.to)) || !destAirports.includes(x.out.to)) continue;
            if (!dateOk(x.out.date, x.back?.date, constraints)) continue;
            trips.push(x);
            st.found++;
          }
        });
      }
    }
    let maxPairs = Math.min(p.maxPairs || 40, limits.maxPairs || Infinity);
    if (p.maxCalls && p.callsPerRoute) {
      // Skutečný počet dotazů na dvojici letišť: okna cesty tam + okna (delší) cesty zpět.
      const perPair = p.callsPerRoute(q.dateFrom, dayTo) + (ret ? p.callsPerRoute(backFrom, dayBackTo) : 0);
      maxPairs = Math.max(1, Math.min(maxPairs, Math.floor((p.maxCalls - tasks.length) / perPair)));
    }
    // Pomalý zdroj má na hledání časový limit; co nestihne, vynechá (hledání nečeká).
    const maxMs = longHaul ? Math.max(p.maxMs || 0, 30000) : p.maxMs;
    const deadline = maxMs ? Date.now() + maxMs : null;
    const longDeadline = deadline;
    const ctx = ctxOf(p);
    // Lety jedním směrem: do výsledků jen v okně hledání; vše (i dny kolem přesného data) do „nejbližších dnů“.
    const collect = (legs, into, near, a, b) => {
      const inWin = legs.filter((l) => l.date >= a && l.date <= b);
      into.push(...inWin);
      near.push(...legs);
      st.found += inWin.length;
    };
    const capped = p.search && q.exact ? [] : pairs.slice(0, maxPairs);
    if (p.search && q.exact) {
      // Přesná data (Kiwi): místo nejvýš 3 dvojic letišť seznamy letišť jedním dotazem (všechna odletová →
      // všechna cílová), totéž jen s přímými lety (dražší přímé lety se jinak do 15 výsledků nevejdou)
      // a zvlášť z domovského letiště (jinak výsledky zaberou nejlevnější letiště v okolí). Na směr ≤ 3 dotazy.
      const froms = [...new Set([...pairs.map((x) => x.o), ...(longHaul ? hubs.map((h) => h.iata) : [])])].slice(0, 25);
      const tos = [...new Set(pairs.map((x) => x.d))].slice(0, 25);
      const homes = froms.filter((x) => homeRank(x) === 0);
      const lists = [{ from: froms, to: tos, directOnly: q.directOnly }];
      if (!q.directOnly) lists.push({ from: froms, to: tos, directOnly: true });
      if (homes.length && homes.length < froms.length) lists.push({ from: homes, to: tos, directOnly: q.directOnly });
      for (const l of lists) {
        tasks.push(async () => collect(await p.daily({ ...l, dateFrom: q.dateFrom, dateTo: dayTo, adults: q.adults, deadline, ctx }), outLegs, nearLegs.out, q.dateFrom, dayTo));
        if (ret) {
          tasks.push(async () => collect(await p.daily({ from: l.to, to: l.from, directOnly: l.directOnly, dateFrom: backFrom, dateTo: dayBackTo, adults: q.adults, deadline, ctx }), backLegs, nearLegs.back, backFrom, dayBackTo));
        }
      }
      st.note = `přesná data: ${froms.length} × ${tos.length} letišť najednou, zvlášť jen přímé lety${lists.length > 2 ? ` a z ${homes.join(', ')}` : ''}`;
    }
    for (const { o, d } of capped) {
      tasks.push(async () => collect(await p.daily({ from: o, to: d, dateFrom: q.dateFrom, dateTo: dayTo, adults: q.adults, directOnly: q.directOnly, deadline, ctx, near: nearOut }),
        outLegs, nearLegs.out, q.dateFrom, dayTo));
      if (ret) {
        tasks.push(async () => collect(await p.daily({ from: d, to: o, dateFrom: backFrom, dateTo: dayBackTo, adults: q.adults, directOnly: q.directOnly, deadline, ctx, near: nearBack }),
          backLegs, nearLegs.back, backFrom, dayBackTo));
      }
    }
    if (pairs.length > capped.length && !(p.search && q.exact)) st.note = `prohledáno ${capped.length} z ${pairs.length} kombinací letišť`;
    if (longHaul) st.note = [st.note, `celé období zpátečními letenkami${hubs.length ? ` (i z ${hubs.map((h) => h.iata).join(', ')})` : ''}`].filter(Boolean).join(' · ');
    await runTasks(st, tasks);
    if (deadline && Date.now() > deadline) st.note = [st.note, `po ${Math.round(maxMs / 1000)} s ukončeno – část termínů vynechána`].filter(Boolean).join(' · ');
  }

  await Promise.all(providers.map((p) => settle(() => (routeMode ? routeProvider(p) : exploreProvider(p)), stOf(p), p, ctxOf(p))));
  progress(true);

  let cal = null;
  const dayOpts = q.exact ? { legsPerDay: EXACT_LEGS_PER_DAY, variety: true } : { legsPerDay: 2 };
  if (routeMode) {
    // Za teplem jen odlety v dost teplých měsících – i v kalendáři (jinak by nabízel dny, které seznam vyřadí).
    const warmOut = outLegs.filter(warmLeg);
    if (ret) {
      const maps = { out: new Map(), back: new Map() };
      // Konkrétní cíl: na každý den víc variant (nejlevnější, přímý, jiné aerolinky); přesná data: všechny
      // přímé lety a ~12 variant na den a trasu (viz dayVariety), každý let aspoň v jedné kombinaci.
      trips.push(...bestRoundTrips(warmOut, backLegs, groundOf, { ...constraints, limit: 300, perDestLimit: 120, perDay: 3, calendar: maps, ...dayOpts }));
      // Celé zpáteční letenky (Travelpayouts, dálkové hledání Kiwi) patří do kalendáře taky.
      for (const t of trips) {
        if (!t.back || !t.combined || !warmLeg(t.out)) continue;
        const cost = t.flightCzk + groundOf(t.out.from) + groundOf(t.back.to) + legBagCzk(t.out, q.bags).czk + legBagCzk(t.back, q.bags).czk;
        const entry = { cost, from: t.out.from, to: t.out.to, backTo: t.back.to, outDate: t.out.date, backDate: t.back.date, provider: t.provider };
        for (const [map, date] of [[maps.out, t.out.date], [maps.back, t.back.date]]) {
          const prev = map.get(date);
          if (!prev || cost < prev.cost) map.set(date, { date, ...entry });
        }
      }
      cal = { kind: 'trip', out: calendarArray(maps.out), back: calendarArray(maps.back) };
    } else {
      trips.push(...bestOneWays(warmOut, groundOf, { ...constraints, limit: 300, perDestLimit: 120, perDay: 3, ...dayOpts }));
      cal = { kind: 'leg', out: oneWayCalendar(warmOut, groundOf, constraints), back: [] };
    }
  }

  const { groups, flat, warm, hidden, priceStats: routeStats } = buildGroups(trips, { q, originSet: allOrigins, groundOf, legCosts: routeMode && Boolean(q.exact) });
  // Další odlety Ryanairu téhož dne z letového řádu (bez cen) – jen u zobrazených tras, pár dotazů.
  const fr = providers.find((p) => p.departures);
  if (fr && (routeMode || q.exact)) await attachDepartures(fr, flat, limits.departures);
  // Wizz Air: odlety dne už jsou v jeho datech – přenést i na tytéž přímé lety W6 nalezené přes Kiwi.
  if (routeMode) shareDepartures([...nearLegs.out, ...nearLegs.back], flat, 'wizzair', 'W6');
  if (warm && !groups.length && dest.kind !== 'anywhere') {
    // Konkrétní cíl, kam se za teplem nic nenašlo: jak teplo tam v těch měsících vůbec bývá (pro vysvětlení).
    const aps = routeMode ? destAirports : [...countries].flatMap((cc) => airportsInCountry(cc).map((a) => a.iata));
    const his = aps.map((a) => warmestHi(a, allMonths)).filter((x) => x != null);
    warm.destHi = his.length ? Math.max(...his) : null;
  }
  const usedHubs = hubs.filter((h) => flat.some((t) => t.out.from === h.iata || t.back?.to === h.iata));
  // Vlak/bus místo letadla: odhad bez sítě ke skupinám v dosahu (Evropa po souši) a u konkrétního cíle i celkově.
  const destinationLabels = q.to.map((id) => describe(id)).filter(Boolean);
  const ground = attachGround({ home: origins.home, origins: [...origins.airports, ...hubs], groups, flat, dests: routeMode ? destinationLabels : [] });
  return {
    query: q,
    mode: routeMode ? 'route' : 'explore',
    home: origins.home,
    origins: [...origins.airports, ...usedHubs].map((a) => ({ ...airportPublic(a.iata), distKm: a.distKm, ground: a.ground, ...(a.hub ? { hub: true } : {}) })),
    // Přestupní letiště, ze kterých se (dálkové lety) hledalo navíc – i když z nich nic nevyšlo (UI je pak znovu nenabízí).
    hubs: hubs.map((h) => h.iata),
    destination: { kind: dest.kind, label: dest.label || 'Kamkoliv', airports: routeMode ? destAirports : null, countries: dest.countries || null },
    destinationLabels,
    // Konkrétní cíl v dosahu: srovnání letadla s vlakem/busem (odhad) – i když se žádný let nenašel.
    ground,
    groups,
    // V režimu konkrétního cíle i plochý žebříček nejlepších kombinací (data × letiště × aerolinky).
    top: routeMode ? topWithDays(flat, { exact: Boolean(q.exact) }) : null,
    // „Je to dobrá cena?“ u konkrétního cíle: ceny letenek všech nalezených nabídek trasy (skupiny mají svou priceStats).
    priceStats: routeMode ? routeStats : null,
    calendar: cal,
    // Přesná data: nejlevnější známá cena po dnech ±3 kolem odletu/návratu (z už stažených dat) + nápověda,
    // když v zadaný den Ryanair/Wizz nelétá, ale vedle ano.
    nearby: routeMode && q.exact ? nearbyOf({ out: nearLegs.out, back: nearLegs.back, q, nearOut, nearBack, groundOf, extra: constraints.extra }) : null,
    // Aktivní uživatelské filtry (UI je ukáže a nabídne zrušit) a kolik nabídek kvůli nim zmizelo.
    filters: { maxPrice: q.maxPrice, directOnly: q.directOnly, active: Boolean(q.maxPrice || q.directOnly), hidden },
    // Za teplem: kolik nabídek filtr vyřadil (a nejvyšší průměrné maximum mezi nimi) – pro prázdný výsledek.
    warm,
    providers: status,
    fx: fxInfo(),
    demo: config.mock,
    stats: { trips: trips.length, groups: groups.length, ms: Date.now() - t0 },
  };
}

/**
 * Cesta přes víc měst: každý úsek jako jednosměrné hledání na přesná data (search s trip 'oneway' – stejné zdroje,
 * Kiwi s opakováním, okruh letišť, doprava na letiště a přestupní letiště jen u začátku cesty), úseky nejvýš po dvou
 * najednou a s rozpočtem dvojic letišť. Pak výběr letů na úsek, návaznosti (links) a nejlevnější celé cesty (combos).
 * Návrat domů (cíl posledního letu = odkud 1. letu) míří na letiště začátku cesty a doprava z letiště domů se přičte.
 */
async function searchMulti(q, emit, opts = {}) {
  const t0 = Date.now();
  await loadRates();
  const n = q.legs.length;
  const origins = resolveOrigins(q.from, { radiusKm: q.radiusKm, kmRate: q.kmRate, maxAirports: config.maxOrigins + q.exclude.length });
  origins.airports = origins.airports.filter((a) => !q.exclude.includes(a.iata)).slice(0, config.maxOrigins);
  if (!origins.airports.length) throw new UserError('V okolí začátku cesty jsem nenašel žádné letiště s pravidelnými lety. Zvětši okruh.');
  const homeGround = new Map(origins.airports.map((a) => [a.iata, a.ground ? a.ground.czk : 0]));
  const sameIds = (a, b) => [...a].sort().join() === [...b].sort().join();
  const homeReturn = sameIds(q.legs[n - 1].to, q.legs[0].from);
  const label = (list) => list.map((id) => describe(id)?.label).filter(Boolean).join(', ') || '?';
  const places = q.legs.map((l, i) => {
    let to;
    if (i === n - 1 && homeReturn) {
      // návrat domů: s open-jaw na kterékoliv letiště začátku cesty, jinak na letiště samotného místa
      const near = origins.airports.filter((a) => a.distKm < 25);
      to = (q.openJaw ? origins.airports : near.length ? near : origins.airports.slice(0, 1)).map((a) => a.iata);
    } else {
      const d = resolveDestinations(l.to);
      if (d.kind !== 'airports' || !d.airports.length) throw new UserError(`${i + 1}. let: zadej konkrétní město nebo letiště, ne celou zemi či světadíl.`);
      to = d.airports;
    }
    let from = null;
    if (i > 0) {
      const d = resolveDestinations(l.from);
      if (d.kind !== 'airports' || !d.airports.length) throw new UserError(`${i + 1}. let: zadej, z jakého města nebo letiště letíš.`);
      from = d.airports;
    }
    return { from, to, fromLabel: label(l.from), toLabel: label(l.to) };
  });
  const labels = places.map((p) => `${p.fromLabel} → ${p.toLabel}`);

  const per = q.legs.map(() => null);
  const legState = q.legs.map(() => 'pending');
  let lastEmit = 0;
  const progress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 250) return;
    lastEmit = now;
    emit({ type: 'progress', providers: mergeStatus(per), legs: labels.map((x, i) => ({ label: x, state: legState[i] })) });
  };
  progress(true);
  const limits = { maxPairs: pairsPerLeg(n), departures: MULTI.departures };
  const results = await runLimited(q.legs.map((l, i) => async () => {
    legState[i] = 'running';
    progress(true);
    try {
      const r = await search({
        from: i === 0 ? l.from : places[i].from.map((x) => `ap:${x}`),
        to: places[i].to.map((x) => `ap:${x}`),
        trip: 'oneway', exactOut: l.date, flexDays: l.flex,
        radiusKm: i === 0 ? q.radiusKm : 0, kmRate: i === 0 ? q.kmRate : 0, exclude: i === 0 ? q.exclude : [],
        adults: q.adults, directOnly: q.directOnly, bags: q.bags,
      }, (ev) => {
        if (ev.type !== 'progress') return;
        per[i] = ev.providers;
        progress();
      }, { providers: opts.providers, limits, hubs: i === 0 });
      per[i] = r.providers;
      legState[i] = 'done';
      return r;
    } catch (e) {
      legState[i] = 'error';
      if (e instanceof UserError) throw new UserError(`${i + 1}. let: ${e.message}`);
      throw e;
    } finally {
      progress(true);
    }
  }));

  const legs = results.map((r, i) => {
    const l = q.legs[i];
    let trips = (r.top || []).filter((t) => t.out && !t.back);
    // poslední let domů: doprava z letiště příletu domů patří k ceně (u odletu ji počítá hledání úseku samo)
    if (i === n - 1) {
      trips = trips.map((t) => {
        const g = homeGround.get(t.out.to) || 0;
        return g ? { ...t, groundCzk: t.groundCzk + g, arrGroundCzk: g, perPersonCzk: t.perPersonCzk + g, totalCzk: (t.perPersonCzk + g) * q.adults } : t;
      });
    }
    const g = r.groups[0];
    return {
      label: labels[i],
      from: places[i].fromLabel,
      to: places[i].toLabel,
      date: l.date,
      flex: l.flex,
      dateFrom: l.dateFrom,
      dateTo: l.dateTo,
      dest: g ? { key: g.dest.key, id: g.dest.id, label: g.dest.label, cc: g.dest.cc, country: g.dest.country, lat: g.dest.lat, lon: g.dest.lon } : null,
      // země místa odletu (open-jaw: odlet z jiné země než přílet) – kvůli vstupním podmínkám
      fromCc: i > 0 ? getAirport(places[i].from[0])?.cc || null : null,
      options: pickOptions(trips),
      count: trips.length,
      nearby: r.nearby ? r.nearby.out : null,
      hint: r.nearby ? r.nearby.hint : null,
      providers: r.providers,
    };
  });
  const links = linkMatrix(legs);
  const { combos, hidden, feasible } = buildCombos(legs, links, { maxPrice: q.maxPrice });
  for (const c of combos) c.totalCzk = c.perPersonCzk * q.adults;
  // trasa „Praha → Řím · Neapol → Praha“: navazující úseky jednou šipkou, open-jaw (přejezd) tečkou
  let route = labels[0];
  for (let i = 1; i < n; i++) route += places[i].fromLabel === places[i - 1].toLabel ? ` → ${places[i].toLabel}` : ` · ${labels[i]}`;
  return {
    query: q,
    mode: 'multi',
    home: origins.home,
    origins: results[0].origins,
    hubs: results[0].hubs,
    legs,
    links,
    combos,
    // poslední let končí na letišti začátku cesty → 2 lety jdou do průvodce cestou jako tam + zpět (open-jaw)
    returnsHome: homeReturn || places[n - 1].to.every((x) => homeGround.has(x)),
    destination: { kind: 'multi', label: route, airports: null, countries: null },
    destinationLabels: [],
    groups: [],
    top: null,
    priceStats: null,
    calendar: null,
    nearby: null,
    filters: {
      maxPrice: q.maxPrice, directOnly: q.directOnly, active: Boolean(q.maxPrice || q.directOnly),
      hidden: { maxPrice: hidden, directOnly: results.reduce((s, r) => s + (r.filters?.hidden?.directOnly || 0), 0) },
    },
    warm: null,
    providers: mergeStatus(results.map((r) => r.providers)),
    fx: fxInfo(),
    demo: config.mock,
    stats: { trips: results.reduce((s, r) => s + r.stats.trips, 0), groups: 0, combos: combos.length, feasible, ms: Date.now() - t0 },
  };
}

function airportPublic(iata) {
  const a = getAirport(iata);
  return a ? { iata, name: a.name, city: a.cityCs, cc: a.cc, lat: a.lat, lon: a.lon } : { iata };
}

function distKm(a, b) {
  const x = getAirport(a);
  const y = getAirport(b);
  return x && y ? haversineKm(x.lat, x.lon, y.lat, y.lon) : 99999;
}

// Proloží seznamy tras jednotlivých letišť, aby rozpočet volání pokryl všechna letiště.
function roundRobin(lists) {
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

// 60 nejlepších kombinací + 3 nejlepší pro každý den odletu (pro filtr v kalendáři); u přesných dat
// navíc nejlevnější kombinace s každým nalezeným letem tam i zpět (jinak by 60 míst zabral nejlevnější
// let tam s různými návraty a dražší přímé lety by se do výpisu nedostaly).
function topWithDays(flat, { exact = false } = {}) {
  const picked = new Set(flat.slice(0, 60));
  const perDay = new Map();
  for (const t of flat) {
    const n = perDay.get(t.out.date) || 0;
    if (n < 3) {
      picked.add(t);
      perDay.set(t.out.date, n + 1);
    }
  }
  if (exact) {
    const legSeen = new Set();
    const sig = (l) => `${l.from}|${l.to}|${l.dep}|${l.carrier}|${l.stops}`;
    let extra = 0;
    for (const t of flat) {
      if (extra >= 60) break;
      const fresh = [t.out, t.back].filter((l) => l && !legSeen.has(sig(l)));
      if (!fresh.length) continue;
      for (const l of fresh) legSeen.add(sig(l));
      if (!picked.has(t)) {
        picked.add(t);
        extra++;
      }
    }
  }
  return flat.filter((t) => picked.has(t));
}

// Přesná data: kolik variant letu na den a trasu (všechny přímé + lety s přestupem do tohoto počtu).
export const EXACT_LEGS_PER_DAY = 12;
// Kolik dní kolem přesného data ukázat v „nejbližších dnech“.
const NEAR_DAYS = 3;

/** Dny kolem data (±3), ne do minulosti. */
export function nearRange(d) {
  const today = todayYmd();
  const from = addDays(d, -NEAR_DAYS);
  return { from: from < today ? today : from, to: addDays(d, NEAR_DAYS) };
}

const LOWCOST = new Set(['ryanair', 'wizzair']);
const dm = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}.`;

/**
 * Nejlevnější známá cena letu po dnech kolem přesného data – z dat, která už hledání stáhlo (Ryanair
 * celý měsíc, Wizz okno ±3 dny, Kiwi jen zadané dny). lowcostOnDay/lowcostNear: létá v zadaný den
 * Ryanair / Wizz Air (v demu ukázkové aerolinky), nebo jen ve dnech vedle?
 */
export function nearbyDays(legs, range, win, { groundOf = () => 0, extra = () => 0, directOnly = false } = {}) {
  const best = new Map();
  const lowcost = new Map();
  const isLowcost = (l) => LOWCOST.has(l.provider) || l.provider?.startsWith('demo-');
  for (const l of legs) {
    if (l.date < range.from || l.date > range.to || !(l.czk > 0) || (directOnly && l.stops)) continue;
    // doprava na letiště doma: u cesty tam odletové, u návratu příletové (cílová letiště mají 0)
    const cost = l.czk + groundOf(l.from) + groundOf(l.to) + extra(l);
    const prev = best.get(l.date);
    if (!prev || cost < prev.cost) {
      best.set(l.date, { date: l.date, czk: l.czk, cost, from: l.from, to: l.to, provider: l.provider, carrier: l.carrier, carrierName: l.carrierName, stops: l.stops });
    }
    if (isLowcost(l)) {
      if (!lowcost.has(l.date)) lowcost.set(l.date, new Set());
      lowcost.get(l.date).add(l.carrierName || l.provider);
    }
  }
  const inWin = (d) => d >= win.from && d <= win.to;
  const lcDays = [...lowcost.keys()].sort();
  return {
    from: range.from,
    to: range.to,
    days: [...best.values()].sort((a, b) => a.date.localeCompare(b.date)),
    lowcostOnDay: lcDays.some(inWin),
    lowcostNear: lcDays.filter((d) => !inWin(d)),
    lowcostNames: [...new Set(lcDays.flatMap((d) => [...lowcost.get(d)]))],
  };
}

export function nearbyOf({ out, back, q, nearOut, nearBack, groundOf, extra = () => 0 }) {
  const opts = { groundOf, extra, directOnly: q.directOnly };
  const res = {
    out: { around: q.exact.out, ...nearbyDays(out, nearOut, { from: q.dateFrom, to: q.dateTo }, opts) },
    back: nearBack ? { around: q.exact.back, ...nearbyDays(back, nearBack, { from: q.exact.backFrom, to: q.exact.backTo }, opts) } : null,
    hint: null,
  };
  // Nápověda: v zadaný den nízkonákladovky volný let nemají (nelétají, nebo je vyprodáno), ale den či dva vedle ano.
  // Aerolinky zvlášť pro odlet a návrat (každý směr může obsluhovat jiná).
  const miss = [['odletu', res.out], ['návratu', res.back]].filter(([, x]) => x && !x.lowcostOnDay && x.lowcostNear.length);
  if (miss.length) {
    res.hint = miss.map(([what, x]) => {
      const names = x.lowcostNames;
      const who = names.length > 1 ? `nemají ${names.slice(0, -1).join(', ')} ani ${names.at(-1)}` : `nemá ${names[0]}`;
      return `V den ${what} ${who} volný let – nejbližší lety: ${x.lowcostNear.slice(0, 4).map(dm).join(', ')}`;
    }).join(' · ');
  }
  return res;
}

/**
 * Doplní k letům Ryanairu (i týmž přímým letům nalezeným přes Kiwi) `otherDeps` – ostatní odlety téhož
 * dne na trase podle letového řádu. Jen trasy nejlevnějších výsledků: nejvýš `max` dotazů (trasa × měsíc,
 * v mezipaměti) a nejvýš ~5 s čekání.
 */
async function attachDepartures(p, flat, max = 6) {
  const ours = (l) => l.provider === p.id || (!l.stops && (p.carriers || []).includes(l.carrier));
  const want = new Map();
  for (const t of flat) {
    for (const l of [t.out, t.back]) {
      if (!l || !ours(l) || !l.hasTime) continue;
      const key = `${l.from}|${l.to}|${l.date.slice(0, 7)}`;
      if (!want.has(key)) {
        if (want.size >= max) continue;
        want.set(key, { from: l.from, to: l.to, days: new Set(), legs: new Set() });
      }
      want.get(key).days.add(l.date);
      want.get(key).legs.add(l);
    }
  }
  if (!want.size) return;
  const jobs = Promise.all([...want.values()].map(async (w) => {
    const times = await p.departures(w.from, w.to, [...w.days]).catch(() => ({}));
    for (const l of w.legs) {
      const own = l.dep.slice(11, 16);
      const other = (times[l.date] || []).filter((x) => x !== own);
      if (other.length) l.otherDeps = other;
    }
  }));
  let timer;
  await Promise.race([jobs, new Promise((r) => { timer = setTimeout(r, 5000); })]);
  clearTimeout(timer);
}

/** Odlety dne z letů zdroje `provider` (dep + otherDeps) → otherDeps u týchž přímých letů `carrier` z jiných zdrojů. */
function shareDepartures(legs, flat, provider, carrier) {
  const times = new Map();
  for (const l of legs) {
    if (l.provider !== provider || !l.hasTime) continue;
    const key = `${l.from}|${l.to}|${l.date}`;
    if (!times.has(key)) times.set(key, new Set());
    for (const x of [l.dep.slice(11, 16), ...(l.otherDeps || [])]) times.get(key).add(x);
  }
  if (!times.size) return;
  for (const t of flat) {
    for (const l of [t.out, t.back]) {
      if (!l || l.provider === provider || l.carrier !== carrier || l.stops || l.otherDeps) continue;
      const own = l.dep.slice(11, 16);
      const other = [...(times.get(`${l.from}|${l.to}|${l.date}`) || [])].filter((x) => x !== own).sort();
      if (other.length) l.otherDeps = other;
    }
  }
}

function buildGroups(trips, { q, originSet, groundOf, legCosts = false }) {
  const map = new Map();
  const seen = new Set();
  const flat = [];
  const warm = q.minTemp ? { minTemp: q.minTemp, dropped: 0, dests: 0, maxHi: null } : null;
  const coldDests = new Set();
  // Nabídky skryté uživatelskými filtry (jen ty, které došly až sem – Kiwi u „jen přímé“ hledá rovnou přímé).
  const hiddenIds = { maxPrice: new Set(), directOnly: new Set() };
  // „Je to dobrá cena?“: ceny letenek všech nabídek podle cíle (i těch nad limitem ceny, které výpis skryje).
  const pools = new Map();
  for (const t of trips) {
    if (!validTrip(t) || seen.has(t.id)) continue;
    if (!originSet.has(t.out.from)) continue;
    if (t.back && !originSet.has(t.back.to)) continue;
    if (t.out.date < q.dateFrom || t.out.date > q.dateTo) continue;
    if (q.directOnly && (t.out.stops > 0 || (t.back && t.back.stops > 0))) {
      hiddenIds.directOnly.add(t.id);
      continue;
    }
    seen.add(t.id);
    const gOut = groundOf(t.out.from);
    const gBack = t.back ? groundOf(t.back.to) : 0;
    t.groundCzk = gOut + gBack;
    // Zavazadla: odhad příplatku u každého dopravce tam i zpět; do ceny letenky ani do skóre výhodnosti nepatří.
    const bOut = legBagCzk(t.out, q.bags);
    const bBack = legBagCzk(t.back, q.bags);
    t.bagCzk = bOut.czk + bBack.czk;
    t.bagEst = bOut.estimated || bBack.estimated || undefined; // dopravce mimo ceník → obecný odhad
    if (legCosts) {
      // Přesná data (pohled „Lety“): doprava a zavazadla po letech – UI pak spočítá cenu libovolné dvojice
      // samostatných letenek tam a zpět, i když ta kombinace mezi nejlepšími není.
      Object.assign(t.out, { groundCzk: gOut, bagCzk: bOut.czk }, bOut.estimated ? { bagEst: true } : {});
      if (t.back) Object.assign(t.back, { groundCzk: gBack, bagCzk: bBack.czk }, bBack.estimated ? { bagEst: true } : {});
    }
    t.perPersonCzk = t.flightCzk + t.groundCzk + t.bagCzk;
    t.totalCzk = t.perPersonCzk * q.adults;
    // Dlouhodobý průměr denních maxim v cíli v měsíci odletu (NASA POWER); neznámé podnebí za teplem nepustí.
    t.tempHi = monthClimate(t.out.to, t.out.date)?.hi ?? null;
    const cold = warm && (t.tempHi == null || t.tempHi < q.minTemp);
    // do statistiky cen nepatří jen chladné termíny, které hledání za teplem vůbec nechce
    if (!cold) {
      const k = destKey(t.out.to);
      if (!pools.has(k)) pools.set(k, []);
      pools.get(k).push({ czk: t.flightCzk, date: t.out.date, from: t.out.from });
    }
    if (q.maxPrice && t.perPersonCzk > q.maxPrice) {
      hiddenIds.maxPrice.add(t.id);
      continue;
    }
    if (cold) {
      warm.dropped++;
      if (t.tempHi != null) warm.maxHi = Math.max(warm.maxHi ?? -99, t.tempHi);
      coldDests.add(destKey(t.out.to));
      continue;
    }
    t.distanceKm = Math.round(distKm(t.out.from, t.out.to));
    t.nights = t.back ? daysBetween(t.out.date, t.back.date) : null;
    t.deal = dealOf(t);
    const info = destInfo(t.out.to);
    t.destKey = info.key;
    if (!map.has(info.key)) map.set(info.key, { dest: info, trips: [] });
    map.get(info.key).trips.push(t);
    flat.push(t);
  }
  flat.sort((a, b) => a.perPersonCzk - b.perPersonCzk);
  const stats = new Map([...pools].map(([k, list]) => [k, priceStats(list)]));
  const groups = [];
  for (const [key, g] of map) {
    g.trips.sort((a, b) => a.perPersonCzk - b.perPersonCzk);
    // Alternativy: různá letiště/data/aerolinky, ne jen 5× totéž o den vedle.
    const picked = [];
    const sig = new Set();
    for (const t of g.trips) {
      const s = `${t.out.from}|${t.out.to}|${t.back?.to || ''}|${t.provider}|${t.out.date.slice(0, 8)}${Math.floor(Number(t.out.date.slice(8)) / 4)}`;
      if (sig.has(s) && picked.length >= 2) continue;
      sig.add(s);
      picked.push(t);
      if (picked.length >= 6) break;
    }
    groups.push({
      dest: { ...g.dest, airports: [...new Set(g.trips.map((t) => t.out.to))], climate: monthClimate(picked[0].out.to, picked[0].out.date) },
      best: picked[0],
      options: picked,
      count: g.trips.length,
      minFlightCzk: Math.min(...g.trips.map((t) => t.flightCzk)),
      priceStats: stats.get(key),
    });
  }
  groups.sort((a, b) => a.best.perPersonCzk - b.best.perPersonCzk);
  // „Super cena“ jen pro to nejlepší z výsledků: absolutní skóre i relativní pořadí (horních 20 %).
  const p20 = groups.length ? groups[Math.floor((groups.length - 1) * 0.2)].best.perPersonCzk : 0;
  const sorted = new Map([...pools].map(([k, list]) => [k, list.map((e) => e.czk).sort((a, b) => a - b)]));
  for (const t of flat) {
    if (t.deal.level === 'super' && t.perPersonCzk > p20) t.deal.level = 'good';
    t.priceLevel = priceLevelOf(t, stats.get(t.destKey), sorted.get(t.destKey));
    // 🔥 Super cena / 👍 Výhodné jen u dobré ceny – na jedné nabídce nikdy „výhodné“ a zároveň „běžná / dražší“
    if (t.priceLevel.level !== 'low' && (t.deal.level === 'super' || t.deal.level === 'good')) t.deal.level = 'normal';
  }
  if (warm) warm.dests = [...coldDests].filter((k) => !map.has(k)).length;
  const hidden = { maxPrice: hiddenIds.maxPrice.size, directOnly: hiddenIds.directOnly.size };
  return { groups: groups.slice(0, 150), flat, warm, hidden, priceStats: priceStats([...pools.values()].flat()) };
}
