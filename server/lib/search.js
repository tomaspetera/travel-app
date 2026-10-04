// Orchestrace hledání: místa → letiště → dotazy na poskytovatele → skládání cest → řazení.
import { config } from '../config.js';
import { activeProviders } from '../providers/index.js';
import { resolveDestinations, resolveOrigins, describe } from './places.js';
import { destInfo, getAirport } from './airports.js';
import { addDays, clampRange, daysBetween } from './dates.js';
import { bestOneWays, bestRoundTrips, calendarArray, dateOk, oneWayCalendar } from './optimizer.js';
import { fxInfo, loadRates } from './fx.js';
import { haversineKm } from './geo.js';
import { validTrip } from './fares.js';

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
  const [dateFrom, dateTo] = clampRange(raw.dateFrom, raw.dateTo);
  const trip = raw.trip === 'oneway' ? 'oneway' : 'return';
  let nightsMin = int(raw.nightsMin, 2, 0, 45);
  let nightsMax = int(raw.nightsMax, 7, 0, 45);
  if (nightsMax < nightsMin) [nightsMin, nightsMax] = [nightsMax, nightsMin];
  return {
    from,
    to: ids(raw.to).filter((x) => x !== 'anywhere'),
    radiusKm: int(raw.radiusKm, 200, 0, 600),
    dateFrom,
    dateTo,
    trip,
    nightsMin,
    nightsMax,
    outDays: days(raw.outDays),
    backDays: trip === 'return' ? days(raw.backDays) : [],
    adults: int(raw.adults, 1, 1, 9),
    maxPrice: raw.maxPrice ? int(raw.maxPrice, null, 0, 1e7) : null,
    directOnly: Boolean(raw.directOnly),
    kmRate: Math.min(5, Math.max(0, Number(raw.kmRate ?? 1.1) || 0)),
    openJaw: raw.openJaw !== false,
    // Letiště, která uživatel z okruhu ručně vyřadil.
    exclude: (Array.isArray(raw.exclude) ? raw.exclude : []).map((x) => String(x).toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x)),
  };
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

  const ret = q.trip === 'return' ? { nightsMin: q.nightsMin, nightsMax: q.nightsMax } : null;
  const backFrom = addDays(q.dateFrom, ret ? ret.nightsMin : 0);
  const backTo = addDays(q.dateTo, ret ? ret.nightsMax : 0);
  const constraints = {
    nightsMin: q.nightsMin, nightsMax: q.nightsMax, outDays: q.outDays, backDays: q.backDays,
    openJawHome: q.openJaw, openJawDest: q.openJaw,
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

  async function exploreProvider(p) {
    const st = stOf(p);
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
      await runTasks(st, ors.map((o) => async () => {
        const res = await p.explore({
          origin: o.iata, dateFrom: q.dateFrom, dateTo: q.dateTo, ret, country: singleCountry,
          adults: q.adults, directOnly: q.directOnly,
        });
        for (const t of res) {
          if (!destOk(t.out.to)) continue;
          if (dateOk(t.out.date, t.back?.date, constraints)) {
            trips.push(t);
            st.found++;
          } else if (p.daily) {
            refine.push(t);
          }
        }
      }));
      // Ryanair vrací jen 1 nejlevnější termín na destinaci – když nesedí na zadaný
      // počet nocí / dny v týdnu, dohledej ceny po dnech a slož termín přesně.
      const have = new Set(trips.filter((t) => t.provider === p.id).map((t) => `${t.out.from}|${t.out.to}`));
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
      .filter((d) => destOk(d) && !originSet.has(d))
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
    const out = await p.daily({ from: o, to: d, dateFrom: q.dateFrom, dateTo: q.dateTo, adults: q.adults, directOnly: q.directOnly });
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
    // Pomalejší zdroje (Kiwi) jen pro pár nejvýznamnějších letišť: velká a blízká napřed.
    if (p.maxPairs) {
      const rank = { L: 0, M: 1, S: 2 };
      const dist = new Map(origins.airports.map((a) => [a.iata, a.distKm]));
      pairs.sort((x, y) => rank[getAirport(x.o).type] - rank[getAirport(y.o).type] || dist.get(x.o) - dist.get(y.o));
    }
    const capped = pairs.slice(0, p.maxPairs || 40);
    const tasks = [];
    for (const { o, d } of capped) {
      tasks.push(async () => {
        const legs = await p.daily({ from: o, to: d, dateFrom: q.dateFrom, dateTo: q.dateTo, adults: q.adults, directOnly: q.directOnly });
        outLegs.push(...legs);
        st.found += legs.length;
      });
      if (ret) {
        tasks.push(async () => {
          const legs = await p.daily({ from: d, to: o, dateFrom: backFrom, dateTo: backTo, adults: q.adults, directOnly: q.directOnly });
          backLegs.push(...legs);
          st.found += legs.length;
        });
      }
    }
    if (pairs.length > capped.length) st.note = `prohledáno ${capped.length} z ${pairs.length} kombinací letišť`;
    await runTasks(st, tasks);
  }

  await Promise.all(providers.map((p) => settle(() => (routeMode ? routeProvider(p) : exploreProvider(p)), stOf(p))));
  progress(true);

  let cal = null;
  if (routeMode) {
    if (ret) {
      const maps = { out: new Map(), back: new Map() };
      trips.push(...bestRoundTrips(outLegs, backLegs, groundOf, { ...constraints, limit: 300, perDestLimit: 120, perDay: 3, calendar: maps }));
      cal = { kind: 'trip', out: calendarArray(maps.out), back: calendarArray(maps.back) };
    } else {
      trips.push(...bestOneWays(outLegs, groundOf, { ...constraints, limit: 300, perDestLimit: 120, perDay: 3 }));
      cal = { kind: 'leg', out: oneWayCalendar(outLegs, groundOf, constraints), back: [] };
    }
  }

  const { groups, flat } = buildGroups(trips, { q, originSet, groundOf });
  return {
    query: q,
    mode: routeMode ? 'route' : 'explore',
    home: origins.home,
    origins: origins.airports.map((a) => ({ ...airportPublic(a.iata), distKm: a.distKm, ground: a.ground })),
    destination: { kind: dest.kind, label: dest.label || 'Kamkoliv', airports: routeMode ? destAirports : null, countries: dest.countries || null },
    destinationLabels: q.to.map((id) => describe(id)).filter(Boolean),
    groups,
    // V režimu konkrétního cíle i plochý žebříček nejlepších kombinací (data × letiště × aerolinky).
    top: routeMode ? topWithDays(flat) : null,
    calendar: cal,
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
    t.perPersonCzk = t.flightCzk + t.groundCzk;
    t.totalCzk = t.perPersonCzk * q.adults;
    if (q.maxPrice && t.perPersonCzk > q.maxPrice) continue;
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
      dest: { ...g.dest, airports: [...new Set(g.trips.map((t) => t.out.to))] },
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
  return { groups: groups.slice(0, 150), flat };
}
