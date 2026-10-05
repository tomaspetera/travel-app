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
    radiusKm: int(raw.radiusKm, 200, 0, 600),
    dateFrom,
    dateTo,
    trip,
    nightsMin,
    nightsMax,
    outDays: exact ? [] : days(raw.outDays),
    backDays: trip === 'return' && !exact ? days(raw.backDays) : [],
    adults: int(raw.adults, 1, 1, 9),
    maxPrice: raw.maxPrice ? int(raw.maxPrice, null, 0, 1e7) : null,
    directOnly: Boolean(raw.directOnly),
    kmRate: Math.min(5, Math.max(0, Number(raw.kmRate ?? 1.1) || 0)),
    openJaw: raw.openJaw !== false,
    // Letiště, která uživatel z okruhu ručně vyřadil.
    exclude: (Array.isArray(raw.exclude) ? raw.exclude : []).map((x) => String(x).toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x)),
    // „Za teplem“: jen cíle, kde je v měsíci odletu průměrné denní maximum aspoň tolik °C.
    minTemp: Number(raw.minTemp) > 0 ? int(raw.minTemp, null, 15, 35) : null,
    // Zavazadla započítaná do ceny: jen malé pod sedadlo (v ceně) / + kabinový kufr / + kufr k odbavení.
    bags: raw.bags === 'cabin' || raw.bags === 'checked' ? raw.bags : 'none',
  };
}

// Odhad příplatku za zavazadlo k jednomu letu (Kč/os., kurz jako u letenek); dálkový let podle vzdálenosti letišť.
export function legBagCzk(leg, bags) {
  if (!leg || bags === 'none') return { czk: 0, estimated: false };
  const f = legBagEur(leg, bags, { longHaul: distKm(leg.from, leg.to) > FAR_KM });
  return { czk: toCzk(f.eur, 'EUR') ?? 0, estimated: f.estimated };
}

// Orientační „běžná“ cena jednosměrné letenky podle vzdálenosti (Kč/os.) pro skóre výhodnosti.
export function referencePrice(km) {
  return km < 3000 ? 600 + 1.35 * km : 4650 + 1.6 * (km - 3000);
}

export function dealOf(trip) {
  const km = trip.distanceKm || 0;
  const ref = referencePrice(km) * (trip.back ? 1.9 : 1);
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

async function settle(fn, st) {
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
  }
}

/**
 * Hlavní hledání. emit(event) dostává průběh: { type: 'progress', providers }.
 */
export async function search(raw, emit = () => {}) {
  const t0 = Date.now();
  const q = normalizeQuery(raw);
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

  const providers = activeProviders();
  const status = providers.map((p) => ({ id: p.id, state: 'pending', calls: 0, done: 0, found: 0, ms: 0, error: null, note: null }));
  const stOf = (p) => status.find((s) => s.id === p.id);
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
  const hubs = farDest ? hubsNear(home, originSet, { kmRate: q.kmRate, exclude: q.exclude }) : [];
  const allOrigins = new Set([...originSet, ...hubs.map((h) => h.iata)]);
  for (const h of hubs) groundMap.set(h.iata, h.ground.czk);
  // Hlavní odletová letiště pro dotazy z víc letišť najednou: zadaná / nejbližší, pak velká.
  const mainOrigins = (n) => {
    const rank = { L: 0, M: 1, S: 2 };
    const chosen = new Set(q.from.filter((x) => x.startsWith('ap:')).map((x) => x.slice(3).toUpperCase()));
    return [...origins.airports]
      .sort((x, y) => Number(chosen.has(y.iata)) - Number(chosen.has(x.iata)) || rank[getAirport(x.iata).type] - rank[getAirport(y.iata).type] || x.distKm - y.distKm)
      .slice(0, n).map((a) => a.iata);
  };
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
    let skipped = 0;
    const tasks = [];
    for (const [a, b] of windows) {
      for (const t of exploreTargets(a, b)) {
        tasks.push(async () => {
          if (Date.now() > deadline - 1500) { skipped++; return; }
          let res;
          try {
            res = await p.search({
              origins: t.far ? [...home3, ...hubs.map((h) => h.iata)] : home3, to: t.to, dateFrom: a, dateTo: b, ret, exact: q.exact,
              adults: q.adults, directOnly: q.directOnly, outDays: q.outDays, backDays: q.backDays, oneForCity: true, deadline,
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
    if (hubs.length && used.some((t) => t.far)) parts.push(`i z ${hubs.map((h) => h.iata).join(', ')}`);
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
    if (take < routes.length) st.note = `prohledáno ${take} z ${routes.length} tras (limit WIZZ_MAX_CALLS)`;
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
      const capped = pairs.slice(0, 16);
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
    // Pomalejší zdroje (Kiwi) jen pro pár nejvýznamnějších letišť: domovské (zadané / nejbližší)
    // vždy, pak velká a blízká.
    if (p.maxPairs) {
      const rank = { L: 0, M: 1, S: 2 };
      const dist = new Map(origins.airports.map((a) => [a.iata, a.distKm]));
      const chosen = new Set(q.from.filter((x) => x.startsWith('ap:')).map((x) => x.slice(3).toUpperCase()));
      const home = (iata) => (chosen.has(iata) || (dist.get(iata) ?? 99) < 25 ? 0 : 1);
      pairs.sort((x, y) => home(x.o) - home(y.o) || rank[getAirport(x.o).type] - rank[getAirport(y.o).type] || dist.get(x.o) - dist.get(y.o));
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
              outDays: q.outDays, backDays: q.backDays, deadline: longDeadline,
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
    let maxPairs = p.maxPairs || 40;
    if (p.maxCalls && p.callsPerRoute) {
      // Skutečný počet dotazů na dvojici letišť: okna cesty tam + okna (delší) cesty zpět.
      const perPair = p.callsPerRoute(q.dateFrom, dayTo) + (ret ? p.callsPerRoute(backFrom, dayBackTo) : 0);
      maxPairs = Math.max(1, Math.min(maxPairs, Math.floor((p.maxCalls - tasks.length) / perPair)));
    }
    // Pomalý zdroj má na hledání časový limit; co nestihne, vynechá (hledání nečeká).
    const maxMs = longHaul ? Math.max(p.maxMs || 0, 30000) : p.maxMs;
    const deadline = maxMs ? Date.now() + maxMs : null;
    const longDeadline = deadline;
    const capped = pairs.slice(0, maxPairs);
    for (const { o, d } of capped) {
      tasks.push(async () => {
        const legs = await p.daily({ from: o, to: d, dateFrom: q.dateFrom, dateTo: dayTo, adults: q.adults, directOnly: q.directOnly, deadline });
        outLegs.push(...legs);
        st.found += legs.length;
      });
      if (ret) {
        tasks.push(async () => {
          const legs = await p.daily({ from: d, to: o, dateFrom: backFrom, dateTo: dayBackTo, adults: q.adults, directOnly: q.directOnly, deadline });
          backLegs.push(...legs);
          st.found += legs.length;
        });
      }
    }
    if (pairs.length > capped.length) st.note = `prohledáno ${capped.length} z ${pairs.length} kombinací letišť`;
    if (longHaul) st.note = [st.note, `celé období zpátečními letenkami${hubs.length ? ` (i z ${hubs.map((h) => h.iata).join(', ')})` : ''}`].filter(Boolean).join(' · ');
    await runTasks(st, tasks);
    if (deadline && Date.now() > deadline) st.note = [st.note, `po ${Math.round(maxMs / 1000)} s ukončeno – část termínů vynechána`].filter(Boolean).join(' · ');
  }

  await Promise.all(providers.map((p) => settle(() => (routeMode ? routeProvider(p) : exploreProvider(p)), stOf(p))));
  progress(true);

  let cal = null;
  if (routeMode) {
    // Za teplem jen odlety v dost teplých měsících – i v kalendáři (jinak by nabízel dny, které seznam vyřadí).
    const warmOut = outLegs.filter(warmLeg);
    if (ret) {
      const maps = { out: new Map(), back: new Map() };
      // Konkrétní cíl: na každý den víc variant (nejlevnější, přímý, jiné aerolinky) – hlavně u přesných dat.
      trips.push(...bestRoundTrips(warmOut, backLegs, groundOf, { ...constraints, limit: 300, perDestLimit: 120, perDay: 3, calendar: maps, legsPerDay: q.exact ? 4 : 2 }));
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
      trips.push(...bestOneWays(warmOut, groundOf, { ...constraints, limit: 300, perDestLimit: 120, perDay: 3, legsPerDay: q.exact ? 4 : 2 }));
      cal = { kind: 'leg', out: oneWayCalendar(warmOut, groundOf, constraints), back: [] };
    }
  }

  const { groups, flat, warm } = buildGroups(trips, { q, originSet: allOrigins, groundOf });
  if (warm && !groups.length && dest.kind !== 'anywhere') {
    // Konkrétní cíl, kam se za teplem nic nenašlo: jak teplo tam v těch měsících vůbec bývá (pro vysvětlení).
    const aps = routeMode ? destAirports : [...countries].flatMap((cc) => airportsInCountry(cc).map((a) => a.iata));
    const his = aps.map((a) => warmestHi(a, allMonths)).filter((x) => x != null);
    warm.destHi = his.length ? Math.max(...his) : null;
  }
  const usedHubs = hubs.filter((h) => flat.some((t) => t.out.from === h.iata || t.back?.to === h.iata));
  return {
    query: q,
    mode: routeMode ? 'route' : 'explore',
    home: origins.home,
    origins: [...origins.airports, ...usedHubs].map((a) => ({ ...airportPublic(a.iata), distKm: a.distKm, ground: a.ground, ...(a.hub ? { hub: true } : {}) })),
    destination: { kind: dest.kind, label: dest.label || 'Kamkoliv', airports: routeMode ? destAirports : null, countries: dest.countries || null },
    destinationLabels: q.to.map((id) => describe(id)).filter(Boolean),
    groups,
    // V režimu konkrétního cíle i plochý žebříček nejlepších kombinací (data × letiště × aerolinky).
    top: routeMode ? topWithDays(flat) : null,
    calendar: cal,
    // Za teplem: kolik nabídek filtr vyřadil (a nejvyšší průměrné maximum mezi nimi) – pro prázdný výsledek.
    warm,
    providers: status,
    fx: fxInfo(),
    demo: config.mock,
    stats: { trips: trips.length, groups: groups.length, ms: Date.now() - t0 },
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

// 60 nejlepších kombinací + 3 nejlepší pro každý den odletu (pro filtr v kalendáři).
function topWithDays(flat) {
  const picked = new Set(flat.slice(0, 60));
  const perDay = new Map();
  for (const t of flat) {
    const n = perDay.get(t.out.date) || 0;
    if (n < 3) {
      picked.add(t);
      perDay.set(t.out.date, n + 1);
    }
  }
  return flat.filter((t) => picked.has(t));
}

function buildGroups(trips, { q, originSet, groundOf }) {
  const map = new Map();
  const seen = new Set();
  const flat = [];
  const warm = q.minTemp ? { minTemp: q.minTemp, dropped: 0, dests: 0, maxHi: null } : null;
  const coldDests = new Set();
  for (const t of trips) {
    if (!validTrip(t) || seen.has(t.id)) continue;
    if (!originSet.has(t.out.from)) continue;
    if (t.back && !originSet.has(t.back.to)) continue;
    if (q.directOnly && (t.out.stops > 0 || (t.back && t.back.stops > 0))) continue;
    if (t.out.date < q.dateFrom || t.out.date > q.dateTo) continue;
    seen.add(t.id);
    const gOut = groundOf(t.out.from);
    const gBack = t.back ? groundOf(t.back.to) : 0;
    t.groundCzk = gOut + gBack;
    // Zavazadla: odhad příplatku u každého dopravce tam i zpět; do ceny letenky ani do skóre výhodnosti nepatří.
    const bOut = legBagCzk(t.out, q.bags);
    const bBack = legBagCzk(t.back, q.bags);
    t.bagCzk = bOut.czk + bBack.czk;
    t.bagEst = bOut.estimated || bBack.estimated || undefined; // dopravce mimo ceník → obecný odhad
    t.perPersonCzk = t.flightCzk + t.groundCzk + t.bagCzk;
    t.totalCzk = t.perPersonCzk * q.adults;
    if (q.maxPrice && t.perPersonCzk > q.maxPrice) continue;
    // Dlouhodobý průměr denních maxim v cíli v měsíci odletu (NASA POWER); neznámé podnebí za teplem nepustí.
    t.tempHi = monthClimate(t.out.to, t.out.date)?.hi ?? null;
    if (warm && (t.tempHi == null || t.tempHi < q.minTemp)) {
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
  const groups = [];
  for (const g of map.values()) {
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
    });
  }
  groups.sort((a, b) => a.best.perPersonCzk - b.best.perPersonCzk);
  // „Super cena“ jen pro to nejlepší z výsledků: absolutní skóre i relativní pořadí (horních 20 %).
  const p20 = groups.length ? groups[Math.floor((groups.length - 1) * 0.2)].best.perPersonCzk : 0;
  for (const t of flat) {
    if (t.deal.level === 'super' && t.perPersonCzk > p20) t.deal.level = 'good';
  }
  if (warm) warm.dests = [...coldDests].filter((k) => !map.has(k)).length;
  return { groups: groups.slice(0, 150), flat, warm };
}
