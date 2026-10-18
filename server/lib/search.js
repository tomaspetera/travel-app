// Orchestrace hledání: místa → letiště → dotazy na poskytovatele → skládání cest → řazení.
import { config } from '../config.js';
import { activeProviders } from '../providers/index.js';
import { resolveDestinations, resolveOrigins, describe } from './places.js';
import { airportsInCountry, destInfo, destKey, getAirport, sizePenaltyKm } from './airports.js';
import { addDays, chunkRange, clampRange, daysBetween, isYmd, monthsInRange, todayYmd, weekday } from './dates.js';
import { CONTINENT_BY_KEY, FAR_KM, LONG_HAUL_SWEEP, WARM_SWEEP, farAirport, farCountry, hubsNear, hubsOf } from './longhaul.js';
import { mainAirport, monthClimate, warmAirports, warmShare, warmestHi } from './climate.js';
import { bestOneWays, bestRoundTrips, calendarArray, dateOk, gridArray, oneWayCalendar } from './optimizer.js';
import { fxInfo, loadRates, toCzk } from './fx.js';
import { haversineKm } from './geo.js';
import { accessOpts, carQuery, normalizeAccess, parkCzk, parkDays } from './access.js';
import { makeTrip, validTrip } from './fares.js';
import { legBagEur } from './baggage.js';
import { priceLevelOf, priceStats, refOf, referencePrice } from './pricelevel.js';
import { MULTI, buildCombos, linkMatrix, mergeStatus, pairsPerLeg, pickOptions, runLimited } from './multi.js';
import { arrivalCzk, arrivalOn, arrivalsFor, legArrivalCzk } from './arrival.js';

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
// { date: 'YYYY-MM-DD' v rozsahu odletu, time: 'HH:MM' } nebo null
const depAfterOf = (x, a, b) => (x && isYmd(x.date) && x.date >= a && x.date <= b && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(x.time))
  ? { date: x.date, time: String(x.time) } : null);
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
    // Prodloužený víkend (radar „Svátky“): v předvečer volna jen odlety od daného času (16:00) – ráno je ještě práce.
    depAfter: exact ? null : depAfterOf(raw.depAfter, dateFrom, dateTo),
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
  // Doprava na letiště: groundMode 'transit' (veřejnou dopravou) | 'car' (autem), kmRate = násobek odhadu jízdného
  // (0 = nepočítat; bez groundMode dřívější Kč/km, 1,1 → 1), auto: carFuel (nafta / benzín / elektro), carCons
  // (spotřeba na 100 km), carPrice (vlastní cena), dřívější carKmCzk (Kč/km bez carFuel), accessOverride = 🏠 vlastní
  // ceny veřejnou dopravou na letiště ({ VIE: 350 }, jen platné; starší dotaz bez pole = odhad). Viz access.js.
  ...normalizeAccess(raw),
  openJaw: raw.openJaw !== false,
  // Letiště, která uživatel z okruhu ručně vyřadil.
  exclude: (Array.isArray(raw.exclude) ? raw.exclude : []).map((x) => String(x).toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x)),
  // Zavazadla započítaná do ceny: jen malé pod sedadlo (v ceně) / + kabinový kufr / + kufr k odbavení.
  bags: raw.bags === 'cabin' || raw.bags === 'checked' ? raw.bags : 'none',
  // Cesta z letiště příletu do města a zpět na letiště (arrival.js) v ceně: formulář posílá vždy (výchozí zapnuto),
  // dřívější dotazy a hlídané ceny pole nemají → bez ní (ceny se nezmění).
  arrival: arrivalOn(raw.arrival),
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
  // vynecháno po výpadku: Kiwi podle ctx, ostatní (Wizz Air po 429) podle vlastního stavu
  if ((ctx?.blocked && !ctx.ok) || (!ctx && st.state === 'error' && p?.isBlocked?.())) outage = 'blocked';
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

/** Poznámka v průběhu hledání, když zdroj bez „kamkoliv“ a bez paměti tras prošel jen část tras (od nejbližších). */
export const routesNoteNearest = (take, total) => `prohledáno ${take} nejbližších z ${total} tras – zbytek kvůli limitu dotazů`;

const agoMin = (min) => (min < 60 ? `${Math.max(1, min)} min` : `${Math.round(min / 60)} h`);
/**
 * Poznámka k pokrytí tras zdroje bez „kamkoliv“ (Wizz Air) – pro uživatele, bez názvu proměnné WIZZ_MAX_CALLS.
 * { total, live, memory, skipped, oldestMin, blocked } → text nebo null (všechny trasy teď / do 30 min).
 * live = ceny teď nebo do 30 min, memory = z dřívějšího hledání (oldestMin = stáří nejstarší), skipped = na řadě příště.
 */
export function routesNote({ total, live, memory, skipped, oldestMin, blocked = false }) {
  if (!memory && !skipped) return null;
  const mem = memory ? `${memory} z nich s cenami z hledání před ${agoMin(oldestMin)}` : '';
  if (blocked) return `Wizz Air teď blokuje dotazy – ${memory ? `${memory} z ${total} tras jen z paměti (ceny před ${agoMin(oldestMin)})` : 'žádná trasa v paměti'}`;
  if (!skipped) return `všech ${total} tras, ${mem} (ověř v rezervaci)`;
  const rest = skipped === 1 ? 'zbylá 1 přijde' : skipped < 5 ? `zbylé ${skipped} přijdou` : `zbylých ${skipped} přijde`;
  return `prohledáno ${live + memory} z ${total} tras${mem ? `, ${mem}` : ''} – ${rest} na řadu při dalším hledání`;
}

/**
 * Výběr tras pro hledání bez „kamkoliv“ s pamětí (p.routeState): 1) čerstvé (0 dotazů) vždy, 2) zbytek od tras bez dat,
 * pak od nejdéle nehledaných (shoda: pořadí od nejbližších), dokud stačí rozpočet dotazů (tam i zpět), 3) co se nevejde
 * a má celé období v paměti ≤ 6 h, z paměti. → { list: [{ o, d, mode }], summary }
 */
export function planRoutes(p, routes, { q, backFrom, backTo, ret, budget, now = Date.now() }) {
  const rs = routes.map((r, i) => {
    const out = p.routeState({ from: r.o, to: r.d, dateFrom: q.dateFrom, dateTo: q.dateTo, adults: q.adults }, now);
    // trasa bez jediného letu tam (v paměti) zpáteční směr nepotřebuje – jinak by ho rezervovala navždy a nikdy nevyčerpala
    const back = ret && !out.empty ? p.routeState({ from: r.d, to: r.o, dateFrom: backFrom, dateTo: backTo, adults: q.adults }, now) : { calls: 0, usable: true, at: out.at ?? now };
    return { ...r, i, calls: out.calls + back.calls, usable: out.usable && back.usable, at: Math.min(out.at ?? now, back.at ?? now) };
  });
  let left = budget;
  const order = rs.filter((r) => r.calls).sort((a, b) => (a.usable ? a.at : -1) - (b.usable ? b.at : -1) || a.i - b.i);
  for (const r of rs) if (!r.calls) r.mode = 'live';
  for (const r of order) {
    if (r.calls <= left) {
      left -= r.calls;
      r.mode = 'live';
    } else r.mode = r.usable ? 'memory' : 'skip';
  }
  const mem = rs.filter((r) => r.mode === 'memory');
  const list = rs.filter((r) => r.mode !== 'skip');
  return {
    list,
    summary: {
      total: rs.length, live: rs.filter((r) => r.mode === 'live').length, memory: mem.length, skipped: rs.length - list.length,
      oldestMin: mem.length ? Math.round((now - Math.min(...mem.map((r) => r.at))) / 60e3) : 0, calls: budget - left,
    },
  };
}

/**
 * Průběžné výsledky hledání: první nejdřív firstMs od začátku, další nejdřív po gapMs, nejvýš max za hledání; v náhledu
 * nejvýš groups cílů a top nabídek ve výpisu (+ nejlevnější z každého letiště a dne).
 */
export const PARTIAL = { firstMs: 1200, gapMs: 3000, max: 3, groups: 30, top: 60 };

/**
 * Hlavní hledání. emit(event) dostává průběh: { type: 'progress', providers } a průběžné výsledky { type: 'partial',
 * result } (result.partial = true; jen náhled – po doběhnutí zdroje, dokud jiný ještě hledá, viz PARTIAL). Bez nich
 * (raw.noPartial z prohlížeče – kontrola hlídaných cen, radar; opts.noPartial) je výsledek tentýž, jen bez náhledů.
 * opts (pro hledání úseků cesty přes víc měst a testy): providers = zdroje místo activeProviders(),
 * limits = { maxPairs (dvojic letišť na zdroj), departures (dotazů na letový řád Ryanairu) }, hubs: false = bez
 * přestupních letišť v okolí, homeNights = autem na 1. let cesty přes víc měst s návratem domů: auto parkuje
 * u letiště odletu tolik nocí (parkování se přičte k letu, palivo jen jedním směrem – zpět ho přičte návrat domů).
 */
export async function search(raw, emit = () => {}, opts = {}) {
  const t0 = Date.now();
  const q = normalizeQuery(raw);
  if (q.trip === 'multi') return searchMulti(q, emit, opts);
  const limits = opts.limits || {};
  await loadRates();

  // Doprava na letiště (access.js): veřejnou dopravou za jízdenku tam a zpět, autem palivo za každý let + parkování
  // podle délky cesty (park); autem jen tam = odvoz (palivo tam i zpět, bez parkování).
  const homeNights = q.groundMode === 'car' && opts.homeNights != null ? opts.homeNights : null;
  const access = accessOpts(q, q.trip === 'oneway' && homeNights == null);
  const origins = resolveOrigins(q.from, { radiusKm: q.radiusKm, access, maxAirports: config.maxOrigins, exclude: q.exclude });
  if (!origins.airports.length) throw new UserError('V okolí jsem nenašel žádné letiště s pravidelnými lety. Zvětši okruh.');
  const dest = resolveDestinations(q.to);
  const originSet = new Set(origins.airports.map((a) => a.iata));
  const groundBy = new Map();
  const groundMap = new Map();
  const setGround = (a) => {
    groundBy.set(a.iata, a.ground);
    groundMap.set(a.iata, a.ground ? a.ground.czk + (homeNights != null ? parkCzk(a.ground, homeNights) : 0) : 0);
  };
  origins.airports.forEach(setGround);
  const groundOf = (iata) => groundMap.get(iata) ?? 0;
  // Cena a pořadí výsledků = letenka (+ zavazadla). Doprava na letiště (i parkování) a z letiště do města je jen odhad
  // a ukazuje se u nabídky zvlášť (tripCzk, buildGroups) – do skládání cest, kalendáře ani nejbližších dnů nevstupuje.
  const rankGround = () => 0;
  const home = origins.home;

  const ret = q.trip === 'return' ? { nightsMin: q.nightsMin, nightsMax: q.nightsMax, backFrom: q.exact?.backFrom, backTo: q.exact?.backTo } : null;
  // Autem tam i zpět: parkování u letiště odletu podle počtu nocí (na osobu), návrat na stejné letiště (auto tam stojí).
  const car = q.groundMode === 'car';
  const park = car && ret ? (iata, nights) => parkCzk(groundBy.get(iata), nights) : null;
  const backFrom = q.exact?.backFrom || addDays(q.dateFrom, ret ? ret.nightsMin : 0);
  const backTo = q.exact?.backTo || addDays(q.dateTo, ret ? ret.nightsMax : 0);
  // Cesta z letiště příletu do města a zpět na letiště odletu (arrival.js): k letu jako zavazadla – v pořadí, kalendáři
  // i nejbližších dnech. Letiště domova (odletová a přestupní, u cesty přes víc měst opts.arrivalHome) se nepočítají;
  // nastaví se, až budou známá přestupní letiště (lety se skládají až potom).
  let arrHome = new Set();
  // Přestupní letiště v okolí (Berlín, Mnichov – odlety na dálkové lety) jsou „doma“ jen jako místo odletu: let z letiště
  // v okruhu na ně (Brno → Berlín a zpět) má cíl tam, takže se u nich cesta do města počítá.
  const arrOf = q.arrival ? (l) => {
    if (l && !opts.arrivalHome && arrHome.has(l.from) && arrHome.has(l.to)) {
      const dest = originSet.has(l.from) ? l.to : originSet.has(l.to) ? l.from : null;
      return dest && !originSet.has(dest) ? arrivalCzk(dest) : 0;
    }
    return legArrivalCzk(l, arrHome);
  } : () => 0;
  const bagOf = q.bags !== 'none' ? (l) => legBagCzk(l, q.bags).czk : null;
  const constraints = {
    nightsMin: q.nightsMin, nightsMax: q.nightsMax, outDays: q.outDays, backDays: q.backDays,
    openJawHome: q.openJaw && !car, openJawDest: q.openJaw,
    // Přesná data: odlet jen v okně dateFrom..dateTo, návrat jen v okně backFrom..backTo.
    ...(q.exact ? { outFrom: q.dateFrom, outTo: q.dateTo, backFrom: q.exact.backFrom, backTo: q.exact.backTo } : {}),
    // Zavazadla patří do ceny letenky už při skládání cest a v kalendáři, ne až ve výpisu (cesta do města ne – je zvlášť).
    ...(bagOf ? { extra: bagOf } : {}),
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
  // Hledaná země s jediným cílovým městem (Malta, Lucembursko, Lotyšsko): to město je hledaný cíl – 🙈 Nezajímá mě ho
  // v prohlížeči neschová (destination.sole = klíče skupin; světadíl se nepočítá, ten není hledání sem)
  const sole = countries ? [...new Set(q.to.filter((id) => id.startsWith('cc:')).map((id) => [...new Set(airportsInCountry(id.slice(3)).map((a) => destKey(a.iata)))]).filter((k) => k.length === 1).map((k) => k[0]))] : [];
  const destOk = (iata) => !countries || countries.has(getAirport(iata)?.cc);

  // Dálkové lety (Asie, Afrika, Amerika…): Kiwi se ptá jedním dotazem i z velkých přestupních
  // letišť v okolí (Vídeň, Mnichov, Berlín…), odkud bývá let i s cestou na letiště levnější.
  const farDest = routeMode ? destAirports.some((d) => farAirport(home, d))
    : countries ? [...countries].some((cc) => farCountry(home, cc)) : true;
  // zadaný cíl hledání (Mnichov) není zároveň místem odletu – cesta do města se u něj pak počítá jednoznačně
  const hubs = farDest && opts.hubs !== false ? hubsNear(home, new Set([...originSet, ...destAirports]), { access, exclude: q.exclude }) : [];
  const allOrigins = new Set([...originSet, ...hubs.map((h) => h.iata)]);
  arrHome = opts.arrivalHome ? new Set(opts.arrivalHome) : allOrigins;
  hubs.forEach(setGround);
  // Hlavní odletová letiště pro dotazy z víc letišť najednou: zadaná / nejbližší, pak velká.
  const chosen = new Set(q.from.filter((x) => x.startsWith('ap:')).map((x) => x.slice(3).toUpperCase()));
  // Domovské letiště (0): zadané, nebo do 25 km od výchozího místa; ostatní v okruhu (1).
  const distOf = new Map(origins.airports.map((a) => [a.iata, a.distKm]));
  const homeRank = (iata) => (chosen.has(iata) || (distOf.get(iata) ?? 99) < 25 ? 0 : 1);
  // Významnost letiště v okolí: vzdálenost napůl, velikost (cestující) dvojnásob – Kiwi se ptá jen ze tří.
  const weight = (iata) => (distOf.get(iata) ?? 0) / 2 + sizePenaltyKm(getAirport(iata)) * 2;
  const mainOrigins = (n) => [...origins.airports]
    .sort((x, y) => homeRank(x.iata) - homeRank(y.iata) || weight(x.iata) - weight(y.iata))
    .slice(0, n).map((a) => a.iata);
  // „Za teplem“: měsíce odletu (1–12) a teplé země – aspoň jedno velké letiště tam má v některém z měsíců
  // průměrné maximum ≥ minTemp; je-li teplá jen menší část země, Kiwi se ptá rovnou na teplá letiště.
  const monthsOf = (a, b) => [...new Set(monthsInRange(a, b).map((d) => Number(d.slice(5, 7))))];
  const allMonths = monthsOf(q.dateFrom, q.dateTo);
  const warmOk = (iata) => !q.minTemp || (warmestHi(iata, allMonths) ?? -99) >= q.minTemp;
  // Let v měsíci, kdy je v cíli dost teplo (stejné pravidlo jako filtr ve výsledcích) – chladné termíny
  // se vyřadí hned, jinak by jako levnější zabraly místa (2 na trasu, limit kalendáře) teplým.
  const warmLeg = (l) => !q.minTemp || (monthClimate(l.to, l.date)?.hi ?? -99) >= q.minTemp;
  // Prodloužený víkend: odlet v předvečer až od q.depAfter.time (let bez známého času projde). Vyřadit hned při sběru –
  // jinak by levnější ranní lety zabraly místa (nejlevnější let trasy za den, varianty skupiny) platným večerním.
  const depOk = (l) => !q.depAfter || !l || l.date !== q.depAfter.date || !l.hasTime || String(l.dep).slice(11, 16) >= q.depAfter.time;

  /*
   * Kamkoliv: kombinace aerolinek a letišť z živých letů tam a zpět, které zdroje už stáhly – tam s Ryanairem a zpět
   * s Wizz Air, odlet z Vídně a návrat do Bratislavy, přílet na STN a odlet z LTN – bez dotazů navíc (mixTrips, nejvýš
   * 3 nejlevnější na cíl). Aby lety všech tras, dnů a zdrojů nedržely paměť do konce hledání (široké hledání stovky MB):
   *  • lety se třídí po cílech (destKey) a z každé trasy a dne se drží jen nejlevnější (jako cheapestPerDay; let tam jen
   *    v povolený den a okno odletu, zpět jen v okně návratu – jiné by optimalizátor stejně přeskočil),
   *  • let, který mezi 3 nejlevnější kombinace cíle už nemůže patřit, se průběžně zahodí (mixPrune),
   *  • cíl se složí, jakmile do něj už žádný zdroj nic nepřinese (všechny zdroje ví, kam se budou ptát, a jejich dotazy
   *    na trasy do cíle doběhly), a jeho lety se zahodí.
   * Výsledek je stejný jako ze všech letů najednou (limits.mixWhole: tak – všechny lety až do konce, pro testy);
   * v náhledech kombinace nejsou. res.stats.mix = { legs: lety nabídnuté do kombinací, peak: nejvíc držených najednou,
   * dropped: zahozených prořezáním }.
   */
  const mixOn = !routeMode && Boolean(ret);
  const mix = {
    // destKey → { seq, legs: [tam, zpět], n, pruned }; legs[i]: Map „odkud|kam|den“ → { l, cost, seq, d } (seq = pořadí
    // nalezení jako v jednom seznamu letů, d = den jako číslo), nebo jen seq – zahozený let trasy, na kterou se ještě
    // čeká (let, který přijde na jeho místo, dostane jeho pořadí); n = počet letů, pruned = n po minulém prořezání
    buckets: new Map(),
    wait: new Map(), // destKey → kolik dotazů na trasy do cíle ještě běží
    pairWait: new Map(), // „domov|cíl“ → kolik dotazů na tu trasu ještě běží (lety ostatních tras už jsou konečné)
    unplanned: new Set(mixOn ? providers.filter((p) => p.live).map((p) => p.id) : []), // zdroje, které ještě neví, kam se ptát
    done: [], // [pořadí cíle, kombinace]
    closed: new Set(),
    seq: 0,
    legSeq: 0,
    live: 0, // držených letů ve všech cílech
    seen: 0,
    peak: 0,
    dropped: 0,
  };
  const mixWhole = limits.mixWhole === true;
  const mixExtra = constraints.extra || (() => 0);
  const mixDirect = (l) => !q.directOnly || !l.stops;
  // Návrat stihne let tam, odlétá-li aspoň 2 h po příletu (returnFits; oba časy místní v cíli): late = nejdřívější
  // odlet návratu, který let tam stihne; early = odlet návratu (bez času stihne cokoli).
  const HOUR = 3600e3;
  const localMs = (s) => Date.parse(`${String(s).slice(0, 16)}:00Z`);
  const midMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`);
  const lateOf = (l) => { const t = l.arr ? localMs(l.arr) + 2 * HOUR : -Infinity; return Number.isNaN(t) ? -Infinity : t; };
  const earlyOf = (l) => { const t = l.hasTime ? localMs(l.dep) : Infinity; return Number.isNaN(t) ? Infinity : t; };
  // Let tam, který přiletí (+2 h) později než MIX_LAG po půlnoci dne odletu (po 22:00 druhého dne), se do kombinací
  // nebere – Ryanair, Wizz Air ani demo takové nemají. Díky téhle mezi stihne při FIT_NIGHTS a víc nocích každý let tam
  // každý návrat a při méně nocích jde poznat let tam, který stihne každý návrat dne (a návrat, který stihne každý let tam).
  const MIX_LAG = 48 * HOUR;
  const FIT_NIGHTS = 2;
  const mixOutOk = (l) => mixDirect(l) && l.date >= q.dateFrom && l.date <= q.dateTo && warmLeg(l) && depOk(l)
    && dateOk(l.date, null, constraints) && lateOf(l) <= midMs(l.date) + MIX_LAG;
  const mixBackOk = (l) => mixDirect(l) && l.date >= backFrom && l.date <= backTo && !(q.backDays?.length && !q.backDays.includes(weekday(l.date)));
  // Které lety spolu jdou spárovat (třída): bez návratu jinam (autem, bez open-jaw) jen týmž letištěm domova, bez open-jaw
  // i týmž letištěm v cíli. i = 0 let tam, 1 návrat; home = letiště domova, away = letiště v cíli.
  const mixPair = (home, away) => `${constraints.openJawHome ? '' : home}|${constraints.openJawDest ? '' : away}`;
  const homeOf = (l, i) => (i === 0 ? l.from : l.to);
  const awayOf = (l, i) => (i === 0 ? l.to : l.from);
  const pairFinal = (l, i) => !mix.unplanned.size && !mix.pairWait.get(`${homeOf(l, i)}|${awayOf(l, i)}`);
  const MIX_PRUNE_MIN = 48;
  function mixKeep(l, i, k) {
    // nemůže nastat: lety do cíle přinesou jen dotazy, na které cíl čekal (do uzavřeného by kombinace nesložil celé)
    if (mix.closed.has(k)) return null;
    let b = mix.buckets.get(k);
    if (!b) mix.buckets.set(k, (b = { seq: Infinity, legs: [new Map(), new Map()], n: 0, pruned: 0 }));
    if (i === 0 && b.seq === Infinity) b.seq = mix.seq++; // pořadí cílů jako dřív z jednoho seznamu letů tam
    if (!(l.czk > 0)) return b;
    // týž let z víc zdrojů a dotazů (Ryanair kamkoliv i po dnech) jednou – optimalizátor páruje jen nejlevnější let dne
    const key = `${l.from}|${l.to}|${l.date}`;
    const cost = l.czk + mixExtra(l);
    const prev = b.legs[i].get(key);
    mix.seen++;
    if (prev === undefined || typeof prev === 'number') {
      b.legs[i].set(key, { l, cost, seq: prev ?? mix.legSeq++, d: dayOf(l.date) });
      b.n++;
      mix.live++;
    } else if (cost < prev.cost || (cost === prev.cost && l.live && !prev.l.live)) Object.assign(prev, { l, cost });
    return b;
  }
  /** Lety živého zdroje do kombinací (outs: domov → cíl, backs: cíl → domov). */
  function mixAdd(p, outs, backs) {
    if (!mixOn || !p.live) return;
    const touched = new Set();
    for (const l of outs) if (mixOutOk(l)) touched.add(mixKeep(l, 0, destKey(l.to)));
    for (const l of backs) if (mixBackOk(l)) touched.add(mixKeep(l, 1, destKey(l.from)));
    mix.peak = Math.max(mix.peak, mix.live);
    // prořezat, když cíl od minula aspoň zdvojnásobil počet letů (celkem lineární práce)
    if (!mixWhole) for (const b of touched) if (b && b.n >= Math.max(MIX_PRUNE_MIN, 2 * b.pruned)) mixPrune(b);
  }

  /*
   * Prořezání cíle (přesné – výsledek mixTrips se nezmění, ani pořadí při shodě ceny): let tam X se zahodí, když pro
   * KAŽDÝ den návratu, se kterým jde spárovat, existují 3 jiné lety tam téže třídy (s různým podpisem kombinace), které
   * stihnou každý návrat toho dne a i s parkováním vyjdou levněji (při shodě dřív nalezené – jako stabilní řazení
   * optimalizátoru): s jakýmkoli návratem pak dají 3 levnější kombinace než X. Návraty obdobně (pro každý den odletu).
   * Při FIT_NIGHTS a víc nocích stihne každý let každý protějšek, takže se počítá kterýkoli let (levnější let téhož dne,
   * který ho může nahradit, taky). Při méně nocích jen let, který stihne každý protějšek dne (let tam přiletí aspoň 2 h
   * před půlnocí dne návratu, návrat odlétá aspoň MIX_LAG po půlnoci dne odletu) a jehož trasa už je konečná – jinak by
   * ho mohl nahradit levnější let téhož dne, který protějšek nestihne. Zahozený let překonaly jen levnější, takže
   * prořezávání po částech je stejně přesné jako najednou. Na místo zahozeného letu trasy, na kterou se ještě čeká,
   * přijde i dražší let téhož dne (překonají ho tytéž lety, jako by tam byl zahozený, a při dalším prořezání zmizí) –
   * levnější tak dostane pořadí jako v jednom seznamu letů.
   */
  // Dny jako čísla od q.dateFrom; okTable[d * NN + n - nightsMin] = 1: odlet v den d (okno odletu) a návrat o n nocí
  // později (okno návratu, dny v týdnu, přesná data) jdou spárovat.
  const DAY_MS = 864e5;
  const day0 = midMs(q.dateFrom);
  const dayIdx = new Map();
  const dayOf = (ymd) => {
    let v = dayIdx.get(ymd);
    if (v === undefined) dayIdx.set(ymd, (v = Math.round((midMs(ymd) - day0) / DAY_MS)));
    return v;
  };
  const NN = q.nightsMax - q.nightsMin + 1;
  const outSpan = daysBetween(q.dateFrom, q.dateTo) + 1;
  let okTable = null;
  const okAt = (d, n) => {
    if (d < 0 || d >= outSpan) return false;
    if (!okTable) {
      okTable = new Uint8Array(outSpan * NN);
      for (let a = 0; a < outSpan; a++) {
        const out = addDays(q.dateFrom, a);
        for (let k = 0; k < NN; k++) {
          const back = addDays(out, q.nightsMin + k);
          okTable[a * NN + k] = back >= backFrom && back <= backTo && dateOk(out, back, constraints) ? 1 : 0;
        }
      }
    }
    return okTable[d * NN + n - q.nightsMin] === 1;
  };
  const parkOf = () => 0; // parkování do ceny letenky nepatří (ukazuje se zvlášť)
  function mixPrune(b) {
    for (const i of [0, 1]) {
      // i = 0: lety tam, den protějšku (návratu) o n nocí později; i = 1: návraty, den protějšku (odletu) o n dřív
      const sign = i === 0 ? 1 : -1;
      // při shodě ceny pořadí jako v optimalizátoru: lety tam podle nalezení, návraty podle dne a pak nalezení
      const before = i === 0 ? (x, y) => x.seq < y.seq : (x, y) => (x.d !== y.d ? x.d < y.d : x.seq < y.seq);
      const classes = new Map();
      for (const [key, x] of b.legs[i]) {
        if (typeof x === 'number') {
          // zahozený let trasy, která už doběhla – na jeho místo nic nepřijde
          const [from, to] = key.split('|');
          if (pairFinal({ from, to }, i)) b.legs[i].delete(key);
          continue;
        }
        const l = x.l;
        const c = mixPair(homeOf(l, i), awayOf(l, i));
        let g = classes.get(c);
        if (!g) classes.set(c, (g = { all: [], byDay: new Map() }));
        x.r = x.cost + rankGround(homeOf(l, i));
        x.sig = `${homeOf(l, i)}|${l.date}|${l.carrier}|${l.dep}`;
        g.all.push(key, x);
        if (q.nightsMin < FIT_NIGHTS) {
          x.fin = pairFinal(l, i);
          x.fit = i === 0 ? lateOf(l) : earlyOf(l);
        }
        let list = g.byDay.get(x.d);
        if (!list) g.byDay.set(x.d, (list = []));
        list.push(x);
      }
      for (const g of classes.values()) {
        for (const list of g.byDay.values()) list.sort((x, y) => x.r - y.r || (before(x, y) ? -1 : 1));
        // 3 nejlevnější (různé podpisy kombinace) pro den protějšku o: [[cena i s parkováním, x], …]
        const tops = new Map();
        const top3 = (o) => {
          let best = tops.get(o);
          if (best) return best;
          best = [];
          const oMs = day0 + o * DAY_MS;
          for (let n = q.nightsMin; n <= q.nightsMax; n++) {
            const day = o - sign * n;
            if (!okAt(i === 0 ? day : o, n)) continue;
            const list = g.byDay.get(day);
            if (!list) continue;
            let taken = 0;
            for (const x of list) {
              if (taken >= 3) break;
              if (n < FIT_NIGHTS && !(x.fin && (i === 0 ? x.fit <= oMs : x.fit >= oMs + MIX_LAG))) continue;
              taken++;
              const c = x.r + parkOf(homeOf(x.l, i), n);
              const at = best.findIndex((y) => y[1].sig === x.sig);
              if (at >= 0) {
                if (!(c < best[at][0] || (c === best[at][0] && before(x, best[at][1])))) continue;
                best.splice(at, 1);
              }
              let j = best.length;
              while (j > 0 && (c < best[j - 1][0] || (c === best[j - 1][0] && before(x, best[j - 1][1])))) j--;
              if (j < 3) best.splice(j, 0, [c, x]);
              if (best.length > 3) best.length = 3;
            }
          }
          tops.set(o, best);
          return best;
        };
        const drop = [];
        for (let a = 0; a < g.all.length; a += 2) {
          const x = g.all[a + 1];
          let beaten = true; // i bez jediného spárovatelného dne – takový let se nespáruje vůbec
          for (let n = q.nightsMin; n <= q.nightsMax; n++) {
            const o = x.d + sign * n;
            if (!okAt(i === 0 ? x.d : o, n)) continue;
            const t = top3(o);
            const c = x.r + parkOf(homeOf(x.l, i), n);
            if (t.length < 3 || t[0][1] === x || t[1][1] === x || t[2][1] === x
              || !(t[2][0] < c || (t[2][0] === c && before(t[2][1], x)))) {
              beaten = false;
              break;
            }
          }
          if (beaten) drop.push(g.all[a], x);
        }
        // až po vyhodnocení celé třídy (top3 se počítá i ze zahazovaných – každého překonaly jiné, levnější)
        for (let a = 0; a < drop.length; a += 2) {
          const x = drop[a + 1];
          if (pairFinal(x.l, i)) b.legs[i].delete(drop[a]);
          else b.legs[i].set(drop[a], x.seq);
          b.n--;
          mix.live--;
          mix.dropped++;
        }
      }
    }
    b.pruned = b.n;
  }

  const mixReady = (k) => !mixWhole && !mix.unplanned.size && !mix.wait.get(k);
  function mixFlush(k) {
    const b = mix.buckets.get(k);
    mix.buckets.delete(k);
    mix.closed.add(k);
    mix.live -= b.n;
    const legs = (i) => [...b.legs[i].values()].filter((x) => typeof x !== 'number').map((x) => x.l);
    if (b.seq !== Infinity) mix.done.push([b.seq, mixTrips(legs(0), legs(1))]);
  }
  /** Zdroj ví, kam se bude ptát: routes = [[domov, cíl], …] jeho dotazů po dnech (každý pak mixRouteDone). */
  function mixPlan(p, routes = []) {
    if (!mix.unplanned.has(p.id)) return;
    for (const [o, d] of routes) {
      mix.wait.set(destKey(d), (mix.wait.get(destKey(d)) || 0) + 1);
      mix.pairWait.set(`${o}|${d}`, (mix.pairWait.get(`${o}|${d}`) || 0) + 1);
    }
    mix.unplanned.delete(p.id);
    if (mix.unplanned.size) return;
    for (const [k, b] of [...mix.buckets]) {
      if (mixReady(k)) mixFlush(k);
      else if (!mixWhole && q.nightsMin < FIT_NIGHTS && b.n >= MIX_PRUNE_MIN) mixPrune(b); // trasy bez čekajících dotazů jsou teď konečné
    }
  }
  const dec = (m, k) => {
    const n = (m.get(k) || 1) - 1;
    if (n > 0) m.set(k, n);
    else m.delete(k);
  };
  /** Dotaz po dnech na trasu o → d doběhl (i chybou) – tento zdroj už na ní nic nepřinese. */
  function mixRouteDone(p, o, d) {
    if (!mixOn || !p.live) return;
    const k = destKey(d);
    dec(mix.wait, k);
    dec(mix.pairWait, `${o}|${d}`);
    if (mix.buckets.has(k) && mixReady(k)) mixFlush(k);
  }
  /** Úloha dotazu na trasu o → d: po doběhnutí (i chybou) mixRouteDone. */
  const routeTask = (p, o, d, fn) => async () => {
    try {
      await fn();
    } finally {
      mixRouteDone(p, o, d);
    }
  };
  /** Konečný výsledek: složí i cíle, na které se ještě čekalo, a vrátí kombinace všech cílů. */
  function mixAll() {
    for (const k of [...mix.buckets.keys()]) mixFlush(k);
    return mix.done.sort((a, b) => a[0] - b[0]).flatMap((x) => x[1]);
  }
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
            if (!dateOk(x.out.date, x.back?.date, constraints) || !depOk(x.out)) continue;
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

  // Zdroj „kamkoliv“; ať skončí jakkoli, do kombinací už nic nepřinese (mixPlan bez cílů – ostatní cíle se můžou složit).
  async function exploreProvider(p) {
    try {
      await exploreFrom(p);
    } finally {
      mixPlan(p);
    }
  }

  async function exploreFrom(p) {
    const st = stOf(p);
    if (p.search && !p.explore) {
      mixPlan(p); // Kiwi: celé zpáteční letenky, do kombinací nic – na pomalé Kiwi se nečeká
      return kiwiExplore(p, st);
    }
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
          // cíl v okruhu domova (z cache Travelpayouts třeba Vídeň → Bratislava) není „kamkoliv“ – jako u ostatních zdrojů
          if (!destOk(t.out.to) || originSet.has(t.out.to)) continue;
          if (dateOk(t.out.date, t.back?.date, constraints) && depOk(t.out)) {
            trips.push(t);
            st.found++;
            // celé zpáteční letenky a ceny z mezipaměti (Travelpayouts) se na lety nerozkládají
            if (t.back && !t.combined) mixAdd(p, [t.out], [t.back]);
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
      mixPlan(p, todo.map((t) => [t.out.from, t.out.to]));
      if (todo.length) {
        await runTasks(st, todo.map((t) => routeTask(p, t.out.from, t.out.to, async () => {
          const found = await routeTrips(p, t.out.from, t.out.to, { perPair: 2 });
          trips.push(...found);
          st.found += found.length;
        })));
      }
      return;
    }
    // Poskytovatel bez „kamkoliv“: projdi jednotlivé trasy v rámci rozpočtu volání.
    const lists = await Promise.all(ors.map(async (o) => (await p.destinations(o.iata, singleCountry))
      .filter((d) => destOk(d) && !originSet.has(d) && warmOk(d))
      .map((d) => ({ o: o.iata, d, km: distKm(o.iata, d) }))
      .sort((a, b) => a.km - b.km)));
    const routes = roundRobin(lists);
    const budget = p.id === 'wizzair' ? config.wizzMaxCalls : Infinity;
    if (p.routeState && Number.isFinite(budget)) {
      // Paměť tras (Wizz Air): čerstvé trasy zdarma, rozpočet na trasy bez dat a pak na nejstarší; co se nevejde, z paměti.
      const blocked = Boolean(p.isBlocked?.());
      const plan = planRoutes(p, routes, { q, backFrom, backTo, ret, budget: blocked ? 0 : budget });
      if (blocked && !plan.list.length) throw new Error('Wizz Air dočasně blokuje dotazy (429)'); // bez paměti jako dosud: výpadek s odpočtem
      st.coverage = plan.summary; // UI: tlačítko „Prohledat zbylé trasy“
      st.note = routesNote({ ...plan.summary, blocked });
      if (blocked) st.error = 'Wizz Air dočasně blokuje dotazy (429) – ceny jen z paměti';
      mixPlan(p, plan.list.map((r) => [r.o, r.d]));
      await runTasks(st, plan.list.map((r) => routeTask(p, r.o, r.d, async () => {
        let found;
        try {
          found = await routeTrips(p, r.o, r.d, { perPair: 2, memoryOnly: r.mode === 'memory' });
        } catch (e) {
          // blokace (429) uprostřed hledání: trasa s daty v paměti (≤ 6 h) se ukáže z ní, ne vůbec
          if (r.mode === 'memory' || !r.usable) throw e;
          found = await routeTrips(p, r.o, r.d, { perPair: 2, memoryOnly: true });
        }
        trips.push(...found);
        st.found += found.length;
      })));
      return;
    }
    // dotazů na trasu: okna cesty tam + (delší) cesty zpět – jako u hledání ke konkrétnímu cíli
    const perRoute = p.callsPerRoute ? p.callsPerRoute(q.dateFrom, q.dateTo) + (ret ? p.callsPerRoute(backFrom, backTo) : 0) : (ret ? 2 : 1);
    const take = Math.max(1, Math.min(routes.length, Math.floor(budget / perRoute)));
    if (take < routes.length) st.note = routesNoteNearest(take, routes.length);
    mixPlan(p, routes.slice(0, take).map((r) => [r.o, r.d]));
    await runTasks(st, routes.slice(0, take).map((r) => routeTask(p, r.o, r.d, async () => {
      const found = await routeTrips(p, r.o, r.d, { perPair: 2 });
      trips.push(...found);
      st.found += found.length;
    })));
  }

  // Ceny po dnech pro jednu trasu → nejlepší cesty (bez open-jaw; kombinace s lety jiných tras a zdrojů skládá mixTrips).
  async function routeTrips(p, o, d, { perPair, memoryOnly = false }) {
    const all = await p.daily({ from: o, to: d, dateFrom: q.dateFrom, dateTo: q.dateTo, adults: q.adults, directOnly: q.directOnly, memoryOnly });
    const out = all.filter((l) => warmLeg(l) && depOk(l));
    if (!ret) return bestOneWays(out, rankGround, { ...constraints, perDestLimit: perPair, limit: perPair });
    // Lety tam jsou, jen je filtr vyřadil (za teplem, odlet v předvečer od 16:00): zpáteční směr, se kterým plán trasy
    // počítal, se stejně načte – jinak by trasa zůstala navždy „nehledaná“ a brala rozpočet každému hledání.
    if (!out.length && !(all.length && p.routeState && !memoryOnly)) return [];
    const back = await p.daily({ from: d, to: o, dateFrom: backFrom, dateTo: backTo, adults: q.adults, directOnly: q.directOnly, memoryOnly });
    // ceny z mezipaměti (Travelpayouts dohledává po dnech taky) se nekombinují (mixAdd jen živé zdroje)
    mixAdd(p, out, back);
    return bestRoundTrips(out, back, rankGround, { ...constraints, openJawHome: false, openJawDest: false, perDestLimit: perPair, limit: perPair });
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
          if (dateOk(t.out.date, t.back?.date, constraints) && depOk(t.out)) {
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
      pairs.sort((x, y) => homeRank(x.o) - homeRank(y.o) || weight(x.o) - weight(y.o));
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
            if (!dateOk(x.out.date, x.back?.date, constraints) || !depOk(x.out)) continue;
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
    // Flexibilní termín ke konkrétnímu cíli (Kiwi, ne dálková trasa): taky seznamy letišť – dřív jen 1–3 dvojice
    // z domovského letiště (Brno → Heathrow), takže chyběly přímé lety jiných aerolinek z Prahy, Vídně, Bratislavy.
    const flexLists = Boolean(p.search && !q.exact && !longHaul);
    const capped = p.search && (q.exact || flexLists) ? [] : pairs.slice(0, maxPairs);
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
    } else if (flexLists) {
      // Jeden seznam všech odletových → všech cílových letišť po týdnech (~8 dotazů na směr za 2 měsíce, stejně jako
      // dřív jedna dvojice). Ryanair a Wizz Air má ATLAS z vlastních zdrojů – z Kiwi vynechané (exclude_airlines),
      // aby se do 15 výsledků na dotaz vešly easyJet, Vueling, Smartwings, Austrian…
      const froms = [...new Set(pairs.map((x) => x.o))].slice(0, 25);
      const tos = [...new Set(pairs.map((x) => x.d))].slice(0, 25);
      const own = new Set(providers.map((x) => x.id));
      const exclude = [...(own.has('ryanair') ? ['FR', 'RK', 'AL'] : []), ...(own.has('wizzair') ? ['W6', 'W4', 'W9', '5W'] : [])];
      const l = { from: froms, to: tos, directOnly: q.directOnly, exclude };
      tasks.push(async () => collect(await p.daily({ ...l, dateFrom: q.dateFrom, dateTo: dayTo, adults: q.adults, deadline, ctx }), outLegs, nearLegs.out, q.dateFrom, dayTo));
      if (ret) {
        tasks.push(async () => collect(await p.daily({ from: tos, to: froms, directOnly: q.directOnly, exclude, dateFrom: backFrom, dateTo: dayBackTo, adults: q.adults, deadline, ctx }), backLegs, nearLegs.back, backFrom, dayBackTo));
      }
      st.note = `${froms.length} × ${tos.length} letišť najednou${exclude.length ? ' (bez Ryanairu a Wizz Air – ty z vlastních zdrojů)' : ''}`;
    }
    for (const { o, d } of capped) {
      tasks.push(async () => collect(await p.daily({ from: o, to: d, dateFrom: q.dateFrom, dateTo: dayTo, adults: q.adults, directOnly: q.directOnly, deadline, ctx, near: nearOut }),
        outLegs, nearLegs.out, q.dateFrom, dayTo));
      if (ret) {
        tasks.push(async () => collect(await p.daily({ from: d, to: o, dateFrom: backFrom, dateTo: dayBackTo, adults: q.adults, directOnly: q.directOnly, deadline, ctx, near: nearBack }),
          backLegs, nearLegs.back, backFrom, dayBackTo));
      }
    }
    if (pairs.length > capped.length && !(p.search && (q.exact || flexLists))) st.note = `prohledáno ${capped.length} z ${pairs.length} kombinací letišť`;
    if (longHaul) st.note = [st.note, `celé období zpátečními letenkami${hubs.length ? ` (i z ${hubs.map((h) => h.iata).join(', ')})` : ''}`].filter(Boolean).join(' · ');
    await runTasks(st, tasks);
    if (deadline && Date.now() > deadline) st.note = [st.note, `po ${Math.round(maxMs / 1000)} s ukončeno – část termínů vynechána`].filter(Boolean).join(' · ');
  }

  /**
   * Kombinace jednoho cíle (destKey) z jeho letů (mix, nejlevnější let trasy a dne): optimalizátor indexuje návraty
   * jen podle data, přes všechny cíle najednou by u každého letu tam procházel stovky návratů jinam. Nejvýš 3 nejlevnější
   * na cíl a z nich jen ty, které zdroje samy nenabídly (2 aerolinky nebo jiné letiště); open-jaw podle constraints
   * (autem návrat k autu, bez „návrat i na jiné letiště“ jen stejná letiště).
   */
  function mixTrips(o, b) {
    if (!o.length || !b.length) return [];
    const extra = mixExtra;
    // cena letu jako v optimalizátoru: tam s dopravou z domova, zpět s dopravou domů (+ zavazadla, cesta do města);
    // autem k letu tam i parkování na nejkratší cestu (dolní mez – jinak by prořezávání v autě skoro nic nevyřadilo)
    const pk = () => 0;
    const oc = (l) => l.czk + extra(l);
    const bc = (l) => l.czk + extra(l);
    const top = (r, n) => [...r].sort((x, y) => x[1] - y[1]).slice(0, n).map((x) => x[0]);
    // které lety spolu jdou spárovat: bez návratu jinam (autem, bez open-jaw) jen týmž letištěm domova, bez open-jaw
    // i týmž letištěm v cíli – dolní mez letu je cena nejlevnějšího letu druhým směrem, se kterým se spárovat dá
    const pair = (home, away) => `${constraints.openJawHome ? '' : home}|${constraints.openJawDest ? '' : away}`;
    const ko = (l) => pair(l.from, l.to);
    const kb = (l) => pair(l.to, l.from);
    const lows = (r, k) => { const m = new Map(); for (const [l, c] of r) if (!(m.get(k(l)) <= c)) m.set(k(l), c); return m; };
    const opts = { ...constraints, limit: 3, perDestLimit: 3, legsPerDay: 1 };
    const ro = o.map((l) => [l, oc(l)]);
    const rb = b.map((l) => [l, bc(l)]);
    // Horní mez: 3. nejlevnější kombinace z 8 nejlevnějších letů tam a 40 (málo kombinací: všech) zpět. Let, který
    // i s nejlevnějším letem druhým směrem vyjde dráž, mezi 3 nejlevnější nepatří – páruje se jen zbytek (stejný
    // výsledek, zlomek práce: v demu z 8 letišť ~9 % letů tam).
    let seed = bestRoundTrips(top(ro, 8), top(rb, 40), rankGround, opts);
    if (seed.length < 3 && b.length > 40) seed = bestRoundTrips(top(ro, 8), b, rankGround, opts);
    const max = seed.length < 3 ? Infinity : Math.max(...seed.map((t) => oc(t.out) + bc(t.back)));
    const keep = (r, k, lo) => r.filter(([l, c]) => c + (lo.get(k(l)) ?? Infinity) <= max).map((x) => x[0]);
    return bestRoundTrips(keep(ro, ko, lows(rb, kb)), keep(rb, kb, lows(ro, ko)), rankGround, opts)
      .filter((t) => t.provider === 'mix' || t.back.from !== t.out.to || t.back.to !== t.out.from);
  }

  /**
   * Výsledek z cest a letů nalezených do teď (bez sítě) → { res, flat }. final = false: průběžný náhled – z kopií cest
   * a letů (buildGroups do nich píše ceny a štítky), bez mřížky termínů a nejbližších dnů, nejvýš PARTIAL.groups cílů
   * a ve výpisu PARTIAL.top nejlevnějších nabídek (+ nejlevnější z každého letiště a dne), res.partial = true.
   * Kombinace aerolinek a letišť v Kamkoliv (mixAll) jen v konečném.
   */
  function compose(final) {
    const cp = new Map();
    const dup = (l) => (l ? cp.get(l) || cp.set(l, { ...l }).get(l) : l);
    const tr = final ? trips : trips.map((t) => ({ ...t, out: dup(t.out), back: dup(t.back) }));
    const outs = final ? outLegs : outLegs.map(dup);
    const backs = final ? backLegs : backLegs.map(dup);
    let cal = null;
    let cellTrips = []; // mřížka termínů: nejlevnější cesta každé buňky (ocení se jako ostatní, do statistik cen nepatří)
    const dayOpts = q.exact ? { legsPerDay: EXACT_LEGS_PER_DAY, variety: true } : { legsPerDay: 2 };
    // Max. cena na osobu: kalendář ani mřížka nenabídnou den či buňku, jejíž nejlevnější cesta je dražší – výpis by po
    // klepnutí nic neukázal (takové nabídky skryje).
    const under = (list) => (q.maxPrice ? list.filter((e) => e.cost <= q.maxPrice) : list);
    if (routeMode) {
      // Za teplem jen odlety v dost teplých měsících – i v kalendáři (jinak by nabízel dny, které seznam vyřadí).
      const warmOut = outs.filter((l) => warmLeg(l) && depOk(l));
      if (ret) {
        // Mřížka termínů (den odletu × počet nocí) jen u flexibilního termínu s rozsahem nocí (limits.grid: false = bez ní).
        const grid = final && !q.exact && q.nightsMax > q.nightsMin && limits.grid !== false;
        const maps = { out: new Map(), back: new Map(), ...(grid ? { grid: new Map() } : {}) };
        // Konkrétní cíl: na každý den víc variant (nejlevnější, přímý, jiné aerolinky); přesná data: všechny
        // přímé lety a ~12 variant na den a trasu (viz dayVariety), každý let aspoň v jedné kombinaci.
        tr.push(...bestRoundTrips(warmOut, backs, rankGround, { ...constraints, limit: 300, perDestLimit: 120, perDay: 3, calendar: maps, ...dayOpts }));
        // Celé zpáteční letenky (Travelpayouts, dálkové hledání Kiwi) patří do kalendáře taky.
        for (const t of tr) {
          if (!t.back || !t.combined || !warmLeg(t.out) || !depOk(t.out) || (car && t.back.to !== t.out.from)) continue;
          const n = daysBetween(t.out.date, t.back.date);
          const cost = t.flightCzk + legBagCzk(t.out, q.bags).czk + legBagCzk(t.back, q.bags).czk;
          const entry = { cost, from: t.out.from, to: t.out.to, backTo: t.back.to, outDate: t.out.date, backDate: t.back.date, provider: t.provider };
          for (const [map, date, x] of [[maps.out, t.out.date], [maps.back, t.back.date], ...(grid ? [[maps.grid, `${t.out.date}|${n}`, { trip: t }]] : [])]) {
            const prev = map.get(date);
            if (!prev || cost < prev.cost) map.set(date, { date, ...entry, ...x });
          }
        }
        cal = { kind: 'trip', out: under(calendarArray(maps.out)), back: under(calendarArray(maps.back)) };
        if (grid) {
          // až po zpátečních letenkách: okno nocí i dny mřížky jsou konečné, k buňce patří její nejlevnější cesta
          // (okno nocí i dny jen z buněk do max. ceny)
          if (q.maxPrice) for (const [k, e] of maps.grid) if (e.cost > q.maxPrice) maps.grid.delete(k);
          cal.grid = gridArray(maps.grid, { nightsMin: q.nightsMin, nightsMax: q.nightsMax });
          cellTrips = cal.grid.cells.map(([d, n]) => { const e = maps.grid.get(`${d}|${n}`); return e.trip || makeTrip(e.o, e.b); });
        }
      } else {
        tr.push(...bestOneWays(warmOut, rankGround, { ...constraints, limit: 300, perDestLimit: 120, perDay: 3, ...dayOpts }));
        cal = { kind: 'leg', out: under(oneWayCalendar(warmOut, rankGround, constraints)), back: [] };
      }
    }

    // pojistka pro zdroje, které lety skládají samy (celé zpáteční letenky)
    if (q.depAfter) { const ok = tr.filter((t) => depOk(t.out)); tr.length = 0; tr.push(...ok); }
    const { groups, flat, warm, hidden, priceStats: routeStats, byOrigin, cells } = buildGroups(tr, {
      q, originSet: allOrigins, groundOf, park, arrOf, legCosts: routeMode && Boolean(q.exact), cells: cellTrips, ...(final ? {} : { maxGroups: PARTIAL.groups }),
      mixed: final && mixOn ? mixAll() : [],
    });
    // Wizz Air: odlety dne už jsou v jeho datech – přenést i na tytéž přímé lety W6 nalezené přes Kiwi.
    if (routeMode) shareDepartures([...nearLegs.out, ...nearLegs.back], flat.concat(cells), 'wizzair', 'W6');
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
    const top = routeMode ? topWithDays(flat, final ? { exact: Boolean(q.exact) } : { max: PARTIAL.top, perDay: 1 }) : null;
    if (cal && cal.grid) {
      const { grid, sent: cellSent } = gridTrips(cal.grid.cells, flat.concat(cells), top);
      Object.assign(cal.grid, grid);
      // „Odkud se vyplatí letět“ i s cestami buněk, které prohlížeč přidá do výpisu – jinak by karta u letiště ukázala
      // vyšší cenu (nebo „jen s návratem jinam“), než výpis po klepnutí na to letiště má
      const kept = new Set(groups.map((g) => g.dest.key));
      addBests(byOrigin, originBests(cellSent.filter((t) => kept.has(t.destKey))));
    }
    const res = {
      ...(final ? {} : { partial: true }),
      query: q,
      mode: routeMode ? 'route' : 'explore',
      home: origins.home,
      // best = nejlevnější celá cesta z letiště ze všech nabídek po filtrech { czk, n } (srovnání „Odkud se vyplatí letět“)
      origins: [...origins.airports, ...usedHubs].map((a) => ({ ...airportPublic(a.iata), distKm: a.distKm, ground: a.ground, ...(a.hub ? { hub: true } : {}), best: byOrigin[a.iata] || null })),
      // Přestupní letiště, ze kterých se (dálkové lety) hledalo navíc – i když z nich nic nevyšlo (UI je pak znovu nenabízí).
      hubs: hubs.map((h) => h.iata),
      destination: { kind: dest.kind, label: dest.label || 'Kamkoliv', airports: routeMode ? destAirports : null, countries: dest.countries || null, ...(sole.length ? { sole } : {}) },
      destinationLabels,
      // Konkrétní cíl v dosahu: srovnání letadla s vlakem/busem (odhad) – i když se žádný let nenašel.
      ground,
      // Cesta z letiště příletu do města (a zpět na letiště) u letišť ve výsledcích – pro štítek u nabídek i bez volby
      // „v ceně“ (query.arrival); trip.arrCzk = kolik z ní je v ceně nabídky.
      // štítky „z letiště do města“: přestupní letiště v okolí, které je cílem některé nabídky, má štítek taky
      // (náhled jen k nabídkám, které nese)
      arrivals: arrivalsFor(final ? flat : [...groups.flatMap((g) => g.options), ...(top || [])], opts.arrivalHome ? arrHome : new Set([...arrHome].filter((i) => originSet.has(i) || !flat.some((t) => t.out.to === i || t.back?.from === i)))),
      groups,
      // V režimu konkrétního cíle i plochý žebříček nejlepších kombinací (data × letiště × aerolinky).
      top,
      // „Je to dobrá cena?“ u konkrétního cíle: ceny letenek všech nalezených nabídek trasy (skupiny mají svou priceStats).
      priceStats: routeMode ? routeStats : null,
      calendar: cal,
      // Přesná data: nejlevnější známá cena po dnech ±3 kolem odletu/návratu (z už stažených dat) + nápověda,
      // když v zadaný den Ryanair/Wizz nelétá, ale vedle ano.
      nearby: final && routeMode && q.exact ? nearbyOf({ out: nearLegs.out, back: nearLegs.back, q, nearOut, nearBack, groundOf: rankGround, extra: constraints.extra, park: park ? () => 0 : null }) : null,
      // Aktivní uživatelské filtry (UI je ukáže a nabídne zrušit) a kolik nabídek kvůli nim zmizelo.
      filters: { maxPrice: q.maxPrice, directOnly: q.directOnly, active: Boolean(q.maxPrice || q.directOnly), hidden },
      // Za teplem: kolik nabídek filtr vyřadil (a nejvyšší průměrné maximum mezi nimi) – pro prázdný výsledek.
      warm,
      // náhled: stav zdrojů v okamžiku skládání (hledání běží dál)
      providers: final ? status : status.map((s) => ({ ...s })),
      fx: fxInfo(),
      demo: config.mock,
      stats: { trips: tr.length, groups: groups.length, ms: Date.now() - t0, ...(final && mixOn ? { mix: { legs: mix.seen, peak: mix.peak, dropped: mix.dropped } } : {}) },
    };
    return { res, flat };
  }

  // Průběžné výsledky: zdroj doběhl a jiný ještě hledá → náhled z toho, co je zatím nalezené (jen když už něco je),
  // nejdřív PARTIAL.firstMs od začátku a PARTIAL.gapMs po minulém, nejvýš PARTIAL.max×. Skládá se z kopií cest a letů
  // (compose(false)) – konečný výsledek je stejný jako bez náhledů.
  const partials = !opts.noPartial && !raw.noPartial;
  let sent = 0;
  let sentAt = 0;
  let timer = null;
  const partialNow = () => {
    timer = null;
    if (sent >= PARTIAL.max || !status.some((s) => s.state === 'pending' || s.state === 'running') || !status.some((s) => s.found > 0)) return;
    try {
      const { res } = compose(false);
      if (!res.groups.length) return;
      sent++;
      sentAt = Date.now();
      emit({ type: 'partial', result: res });
    } catch (e) {
      console.error('[search] průběžný výsledek:', e); // náhled je navíc – hledání (ani server) kvůli němu nespadne
    }
  };
  const partialSoon = () => {
    if (!partials || timer || sent >= PARTIAL.max) return;
    timer = setTimeout(partialNow, Math.max(0, Math.max(t0 + PARTIAL.firstMs, sentAt + PARTIAL.gapMs) - Date.now()));
  };

  await Promise.all(providers.map((p) => settle(() => (routeMode ? routeProvider(p) : exploreProvider(p)), stOf(p), p, ctxOf(p)).then(partialSoon)));
  clearTimeout(timer);
  progress(true);
  const { res, flat } = compose(true);
  // Další odlety Ryanairu téhož dne z letového řádu (bez cen) – jen u zobrazených tras, pár dotazů. Jen do konečného
  // výsledku: dopíše otherDeps letům Ryanairu, které už v něm jsou (Wizz Air W6 v compose se s tím nekříží).
  const fr = providers.find((p) => p.departures);
  if (fr && (routeMode || q.exact)) await attachDepartures(fr, flat, limits.departures);
  res.stats.ms = Date.now() - t0;
  return res;
}

/**
 * Cesta přes víc měst: každý úsek jako jednosměrné hledání na přesná data (search s trip 'oneway' – stejné zdroje,
 * Kiwi s opakováním, okruh letišť, doprava na letiště a přestupní letiště jen u začátku cesty), úseky nejvýš po dvou
 * najednou a s rozpočtem dvojic letišť. Pak výběr letů na úsek, návaznosti (links) a nejlevnější celé cesty (combos).
 * Návrat domů (cíl posledního letu = odkud 1. letu) míří na letiště začátku cesty a doprava z letiště domů se přičte.
 * Autem s návratem domů: palivo u 1. letu a u návratu jedním směrem, parkování u letiště odletu na celou plánovanou
 * cestu (od data 1. do data posledního letu) u 1. letu; bez návratu domů odvoz (palivo tam i zpět, bez parkování).
 */
async function searchMulti(q, emit, opts = {}) {
  const t0 = Date.now();
  await loadRates();
  const n = q.legs.length;
  const sameIds = (a, b) => [...a].sort().join() === [...b].sort().join();
  const homeReturn = sameIds(q.legs[n - 1].to, q.legs[0].from);
  const homeNights = q.groundMode === 'car' && homeReturn ? daysBetween(q.legs[0].date, q.legs[n - 1].date) : null;
  const access = accessOpts(q, homeNights == null);
  const origins = resolveOrigins(q.from, { radiusKm: q.radiusKm, access, maxAirports: config.maxOrigins, exclude: q.exclude });
  if (!origins.airports.length) throw new UserError('V okolí začátku cesty jsem nenašel žádné letiště s pravidelnými lety. Zvětši okruh.');
  const homeGround = new Map(origins.airports.map((a) => [a.iata, a.ground ? a.ground.czk : 0]));
  const label = (list) => list.map((id) => describe(id)?.label).filter(Boolean).join(', ') || '?';
  const places = q.legs.map((l, i) => {
    let to;
    if (i === n - 1 && homeReturn) {
      // návrat domů: s open-jaw na kterékoliv letiště začátku cesty, jinak na letiště samotného místa; autem vždy na
      // kterékoliv – auto parkuje u letiště 1. letu (i vzdálenějšího) a kombinace se pak vrací tam, kde stojí
      const near = origins.airports.filter((a) => a.distKm < 25);
      to = (q.openJaw || homeNights != null ? origins.airports : near.length ? near : origins.airports.slice(0, 1)).map((a) => a.iata);
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
        groundMode: q.groundMode, ...carQuery(q), ...(i === 0 && q.accessOverride ? { accessOverride: q.accessOverride } : {}),
        adults: q.adults, directOnly: q.directOnly, bags: q.bags, arrival: q.arrival,
      }, (ev) => {
        if (ev.type !== 'progress') return;
        per[i] = ev.providers;
        progress();
      }, {
        providers: opts.providers, limits, hubs: i === 0, noPartial: true, ...(i === 0 && homeNights != null ? { homeNights } : {}),
        // cesta z letiště do města: další lety začínají ve městě (ne doma) – doma jsou jen letiště začátku cesty
        ...(i > 0 ? { arrivalHome: [...homeGround.keys()] } : {}),
      });
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
        return g ? { ...t, groundCzk: t.groundCzk + g, arrGroundCzk: g, tripCzk: (t.tripCzk ?? t.perPersonCzk) + g } : t;
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
  const built = buildCombos(legs, links, { maxPrice: q.maxPrice, ...(homeNights != null ? { limit: MULTI.combos * 4 } : {}) });
  const { hidden, feasible } = built;
  let { combos } = built;
  if (homeNights != null) {
    // autem: domů na letiště, kde auto parkuje (jinak – když žádná taková cesta mezi nejlevnějšími není – aspoň něco)
    const same = combos.filter((c) => legs[n - 1].options[c.picks[n - 1]].out.to === legs[0].options[c.picks[0]].out.from);
    combos = (same.length ? same : combos).slice(0, MULTI.combos);
  }
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
    arrivals: Object.assign({}, ...results.map((r) => r.arrivals || {})),
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
// let tam s různými návraty a dražší přímé lety by se do výpisu nedostaly). Vždy i nejlevnější nabídka z každého
// letiště („Odkud se vyplatí letět“ – po klepnutí na letiště ve výpisu je ta cena, kterou karta ukazuje).
// Průběžný náhled: max nejlevnějších a perDay na den.
function topWithDays(flat, { exact = false, max = 60, perDay: dayMax = 3 } = {}) {
  const picked = new Set(flat.slice(0, max));
  const homes = new Set();
  for (const t of flat) { const k = homeOf(t); if (k && !homes.has(k)) { homes.add(k); picked.add(t); } }
  const perDay = new Map();
  for (const t of flat) {
    const n = perDay.get(t.out.date) || 0;
    if (n < dayMax) {
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

/**
 * Cesta buňky mřížky v odpovědi: jen hodnoty v pořadí klíčů (calendar.grid.keys), lety jako pořadí v grid.legs.
 * Prohlížeč (SearchHelp.gridTrips) z nich složí celou cestu – id, noci, dopravce, cenu na osobu i celkem dopočítá
 * z letů a cen, „Je to dobrá cena?“ ze statistiky hledání (PriceCheck), proto tu nejsou.
 */
const CELL_ROW = {
  out: (t, ref) => ref(t.out),
  back: (t, ref) => ref(t.back),
  flightCzk: (t) => t.flightCzk,
  groundCzk: (t) => t.groundCzk,
  bagCzk: (t) => t.bagCzk,
  arrCzk: (t) => t.arrCzk,
  parkCzk: (t) => t.parkCzk || 0,
  bagEst: (t) => (t.bagEst ? 1 : 0),
  combined: (t) => (t.combined ? 1 : 0),
  bookUrl: (t) => t.bookUrl || null,
  tempHi: (t) => t.tempHi ?? null,
  distanceKm: (t) => t.distanceKm,
  destKey: (t) => t.destKey,
  deal: (t) => [t.deal.score, t.deal.level, t.deal.drop],
};
export const CELL_KEYS = Object.keys(CELL_ROW);
/** Cesty (ohodnocené v buildGroups) kompaktně → { legs, keys, trips } – každý let jednou, cesta jako řádek hodnot. */
export function cellRows(list) {
  const legs = [];
  const at = new Map();
  const ref = (l) => { if (!at.has(l)) { at.set(l, legs.length); legs.push(l); } return at.get(l); };
  return { legs, keys: CELL_KEYS, trips: list.map((t) => CELL_KEYS.map((k) => CELL_ROW[k](t, ref))) };
}

/**
 * Mřížka termínů: nejlevnější cesta každé buňky (z pool = výpis + ocenění nejlevnějších cest buněk), kterou top
 * nemá aspoň stejně levnou – klepnutí na buňku ji ve výpisu najde. Kompaktně, ať odpověď (a uložené poslední
 * hledání) nenaroste o stovky celých nabídek: každý let jednou v legs, cesta jako řádek hodnot (CELL_ROW).
 * Prohlížeč je přidá do top (SearchHelp.gridTrips). → { grid: { legs, keys, trips }, sent: poslané cesty celé }
 */
function gridTrips(cells, pool, top) {
  const key = (t) => `${t.out.date}|${t.nights}`;
  const best = new Map();
  for (const t of pool) if (t.back && !(best.get(key(t))?.perPersonCzk <= t.perPersonCzk)) best.set(key(t), t);
  const shown = new Map();
  for (const t of top || []) if (t.back) shown.set(key(t), Math.min(shown.get(key(t)) ?? Infinity, t.perPersonCzk));
  const sent = [];
  for (const [d, n] of cells) {
    const t = best.get(`${d}|${n}`);
    if (t && !(shown.get(`${d}|${n}`) <= t.perPersonCzk)) sent.push(t);
  }
  return { grid: cellRows(sent), sent };
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
 * park(leg) → { czk, days, adj? } | null | false: autem tam i zpět parkování (u řádku Zpět jen jeho změna) a úprava
 * adj, aby šly řádky Tam a Zpět sečíst (viz carNear); false = s tímto letem cesta autem nejde (k autu se nevrátíš).
 */
export function nearbyDays(legs, range, win, { groundOf = () => 0, extra = () => 0, directOnly = false, park = null } = {}) {
  const best = new Map();
  const lowcost = new Map();
  const isLowcost = (l) => LOWCOST.has(l.provider) || l.provider?.startsWith('demo-');
  for (const l of legs) {
    if (l.date < range.from || l.date > range.to || !(l.czk > 0) || (directOnly && l.stops)) continue;
    if (isLowcost(l)) {
      if (!lowcost.has(l.date)) lowcost.set(l.date, new Set());
      lowcost.get(l.date).add(l.carrierName || l.provider);
    }
    const pk = park ? park(l) : null;
    if (pk === false) continue;
    // doprava na letiště doma: u cesty tam odletové, u návratu příletové (cílová letiště mají 0)
    const cost = l.czk + groundOf(l.from) + groundOf(l.to) + extra(l) + (pk ? pk.czk + (pk.adj || 0) : 0);
    const prev = best.get(l.date);
    if (!prev || cost < prev.cost) {
      best.set(l.date, {
        date: l.date, czk: l.czk, cost, from: l.from, to: l.to, provider: l.provider, carrier: l.carrier, carrierName: l.carrierName, stops: l.stops,
        ...(pk && pk.czk ? { parkCzk: pk.czk, parkDays: pk.days } : {}),
        ...(pk && pk.adj ? { tripAdj: pk.adj } : {}),
      });
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

/**
 * Autem tam i zpět: ceny „nejbližších dnů“ tak, aby Tam + Zpět dalo cenu celé cesty (dřív měl parkování na celou cestu
 * každý řádek a součet ho počítal dvakrát). Auto parkuje u letiště odletu a vrací se k němu; parkování je přímka
 * základ + Kč/den. Výchozí cesta = nejlevnější v zadané dny o → b (letiště A): Tam(o) = let tam + palivo + parkování na
 * celou cestu, Zpět(b) = let zpět + palivo. Den tam t = cena cesty t → b (kdyby se změnil jen tento den) − Zpět(b): přes
 * A let tam + palivo + parkování t → b, přes jiné letiště X navíc rozdíl návratu k autu do X proti návratu do A (adj).
 * Den zpět z = cena cesty o → z − Tam(o): přes A let zpět + palivo + změna parkování proti zadanému návratu (den dřív =
 * záporná), přes X navíc rozdíl odletu z X proti odletu z A. Když se mění jen jeden den, je součet přesně cena nejlevnější
 * cesty autem v ty dny (z letů, které hledání zná); když oba, jen přibližně (zaokrouhlení, druhá dálniční známka, jiné
 * letiště). Den tam po zadaném návratu: návrat se posune se stejným počtem nocí (jako po kliknutí na den). Bez výchozí
 * cesty (v zadané dny žádná nevychází) každé letiště zvlášť: Tam s parkováním do zadaného návratu, Zpět se změnou
 * parkování. → { out(leg), back(leg) } pro nearbyDays.
 */
function carNear({ out, back, q, nearOut, nearBack, groundOf, extra, directOnly, park }) {
  const { out: o, back: b } = q.exact;
  const n0 = daysBetween(o, b);
  // návrat k autu: na letiště odletu; v cíli s open-jaw z kteréhokoli letiště téhož města (jako optimalizátor)
  const slot = (home, dest) => `${home}|${q.openJaw ? destKey(dest) : dest}`;
  const cheapest = (legs, range, home, dest) => {
    const m = new Map();
    for (const l of legs) {
      if (l.date < range.from || l.date > range.to || !(l.czk > 0) || (directOnly && l.stops)) continue;
      const k = `${slot(l[home], l[dest])}|${l.date}`;
      const c = l.czk + groundOf(l.from) + groundOf(l.to) + extra(l);
      if (!(m.get(k) <= c)) m.set(k, c);
    }
    return (s, d) => m.get(`${s}|${d}`) ?? null;
  };
  const OUT = cheapest(out, nearOut, 'from', 'to');
  const BACK = cheapest(back, nearBack, 'to', 'from');
  let ref = null;
  for (const l of out) {
    if (l.date !== o) continue;
    const s = slot(l.from, l.to);
    const x = OUT(s, o);
    const y = BACK(s, b);
    if (x == null || y == null) continue;
    const pk = park(l.from, n0);
    if (!ref || x + y + pk < ref.cost) ref = { s, home: l.from, cost: x + y + pk, out: x, back: y };
  }
  return {
    out: (l) => {
      const back2 = l.date <= b ? b : addDays(l.date, n0);
      const n = daysBetween(l.date, back2);
      const stay = { czk: park(l.from, n), days: parkDays(n) };
      if (!ref) return stay;
      const y = BACK(slot(l.from, l.to), back2);
      // posunutý návrat (den tam po zadaném návratu) leží mimo stažené dny – počítá se jako návrat v zadaný den
      if (y == null) return l.date > b ? stay : false;
      return { ...stay, adj: y - ref.back };
    },
    back: (l) => {
      if (l.date < o) return false;
      const n = daysBetween(o, l.date);
      if (!ref) return { czk: park(l.to, n) - park(l.to, n0), days: parkDays(n) };
      const x = OUT(slot(l.to, l.from), o);
      return x == null ? false : { czk: park(l.to, n) - park(ref.home, n0), days: parkDays(n), adj: x - ref.out };
    },
  };
}

/**
 * Nejbližší dny tam (a zpět) kolem přesných dat. park(iata, nights) = parkování Kč/os. na celou cestu (autem tam i zpět,
 * jako ve výsledcích) – řádky Tam a Zpět se pak dají sečíst na cenu cesty (carNear); veřejnou dopravou každý směr zvlášť.
 */
export function nearbyOf({ out, back, q, nearOut, nearBack, groundOf, extra = () => 0, park = null }) {
  const opts = { groundOf, extra, directOnly: q.directOnly };
  const { out: o, back: b } = q.exact;
  const car = park && b && nearBack ? carNear({ out, back, q, nearOut, nearBack, ...opts, park }) : null;
  const res = {
    out: { around: o, ...nearbyDays(out, nearOut, { from: q.dateFrom, to: q.dateTo }, { ...opts, park: car && car.out }) },
    back: nearBack ? { around: b, ...nearbyDays(back, nearBack, { from: q.exact.backFrom, to: q.exact.backTo }, { ...opts, park: car && car.back }) } : null,
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

// Letiště domova, ke kterému nabídka patří: odlet a u zpáteční i návrat na totéž letiště; s návratem jinam (open-jaw)
// k žádnému – filtr letišť ve výpisu ji schová u obou a čas cesty na letiště by „tam i zpět“ neplatil.
const homeOf = (t) => (!t.back || t.back.to === t.out.from ? t.out.from : null);

/**
 * „Odkud se vyplatí letět“: nejlevnější celá cesta na osobu (perPersonCzk) a počet nabídek podle letiště odletu
 * (zpáteční jen s návratem na totéž letiště) → { [iata]: { czk, n } }. Ze všech nabídek, ne jen z těch ve výpisu.
 */
export function originBests(trips) {
  const out = {};
  for (const t of trips || []) {
    if (!t || !t.out || !Number.isFinite(t.perPersonCzk) || !homeOf(t)) continue;
    const k = t.out.from, czk = Math.round(t.perPersonCzk), b = out[k];
    if (!b) out[k] = { czk, n: 1 };
    else { b.n++; if (czk < b.czk) b.czk = czk; }
  }
  return out;
}
// Přičíst další originBests do into (nejnižší cena, počty se sečtou) → into
function addBests(into, add) {
  for (const [k, v] of Object.entries(add || {})) {
    const b = into[k];
    if (!b) into[k] = { ...v }; else { b.n += v.n; if (v.czk < b.czk) b.czk = v.czk; }
  }
  return into;
}

// cells (mřížka termínů) = nejlevnější cesty buněk: ocení se a projdou filtry stejně, ale do skupin, výpisu, počtu
// skrytých ani statistiky cen („Je to dobrá cena?“, výhodnost) nepatří – vrátí se zvlášť (cells), nabídky se nezmění.
// maxGroups = kolik nejlevnějších cílů odpověď nese (průběžný náhled méně). mixed = kombinace aerolinek a letišť
// v Kamkoliv (mixTrips): do skupin a výpisu ano, do statistiky cen ne – ta zůstane z nabídek zdrojů jako dřív
// („Je to dobrá cena?“ a výhodnost z ní dostanou i ony).
function buildGroups(trips, { q, originSet, groundOf, park = null, arrOf = () => 0, legCosts = false, cells = [], mixed = [], maxGroups = 150 }) {
  const map = new Map();
  const seen = new Set();
  const flat = [];
  const cellFlat = [];
  const warm = q.minTemp ? { minTemp: q.minTemp, dropped: 0, dests: 0, maxHi: null } : null;
  const coldDests = new Set();
  // Nabídky skryté uživatelskými filtry (jen ty, které došly až sem – Kiwi u „jen přímé“ hledá rovnou přímé).
  const hiddenIds = { maxPrice: new Set(), directOnly: new Set() };
  // „Je to dobrá cena?“: ceny letenek všech nabídek podle cíle (i těch nad limitem ceny, které výpis skryje).
  const pools = new Map();
  for (const [i, t] of [...trips, ...mixed, ...cells].entries()) {
    const cell = i >= trips.length + mixed.length;
    const own = i < trips.length; // nabídka zdroje (ne kombinace z mixTrips, ne buňka mřížky)
    if (!validTrip(t) || seen.has(t.id)) continue;
    if (!originSet.has(t.out.from)) continue;
    if (t.back && !originSet.has(t.back.to)) continue;
    if (t.out.date < q.dateFrom || t.out.date > q.dateTo) continue;
    if (q.directOnly && (t.out.stops > 0 || (t.back && t.back.stops > 0))) {
      if (!cell) hiddenIds.directOnly.add(t.id);
      continue;
    }
    seen.add(t.id);
    const gOut = groundOf(t.out.from);
    const gBack = t.back ? groundOf(t.back.to) : 0;
    // autem: parkování u letiště na celou cestu (podle počtu nocí) – v ceně dopravy, zvlášť i parkCzk
    const pk = park && t.back ? park(t.out.from, daysBetween(t.out.date, t.back.date)) : 0;
    t.groundCzk = gOut + gBack + pk;
    if (pk) t.parkCzk = pk;
    // Zavazadla: odhad příplatku u každého dopravce tam i zpět; do ceny letenky ani do skóre výhodnosti nepatří.
    const bOut = legBagCzk(t.out, q.bags);
    const bBack = legBagCzk(t.back, q.bags);
    t.bagCzk = bOut.czk + bBack.czk;
    t.bagEst = bOut.estimated || bBack.estimated || undefined; // dopravce mimo ceník → obecný odhad
    // Cesta z letiště příletu do města a zpět na letiště (jen když je v ceně – volba arrival)
    const aOut = arrOf(t.out);
    const aBack = t.back ? arrOf(t.back) : 0;
    t.arrCzk = aOut + aBack;
    if (legCosts) {
      // Přesná data (pohled „Lety“): doprava, zavazadla a cesta do města po letech – UI pak spočítá cenu libovolné
      // dvojice samostatných letenek tam a zpět, i když ta kombinace mezi nejlepšími není.
      Object.assign(t.out, { groundCzk: gOut, bagCzk: bOut.czk, arrCzk: aOut }, bOut.estimated ? { bagEst: true } : {});
      if (t.back) Object.assign(t.back, { groundCzk: gBack, bagCzk: bBack.czk, arrCzk: aBack }, bBack.estimated ? { bagEst: true } : {});
    }
    // Cena nabídky = letenka + zavazadla (co se platí aerolince); s odhadem cesty na letiště a do města tripCzk
    t.perPersonCzk = t.flightCzk + t.bagCzk;
    t.tripCzk = t.perPersonCzk + t.groundCzk + t.arrCzk;
    t.totalCzk = t.perPersonCzk * q.adults;
    // Dlouhodobý průměr denních maxim v cíli v měsíci odletu (meteostanice u letiště, jinak NASA POWER); neznámé podnebí za teplem nepustí.
    t.tempHi = monthClimate(t.out.to, t.out.date)?.hi ?? null;
    const cold = warm && (t.tempHi == null || t.tempHi < q.minTemp);
    // do statistiky cen nepatří jen chladné termíny, které hledání za teplem vůbec nechce
    if (!cold && own) {
      const k = destKey(t.out.to);
      if (!pools.has(k)) pools.set(k, []);
      pools.get(k).push({ czk: t.flightCzk, date: t.out.date, from: t.out.from });
    }
    // autem se vracíš tam, kde auto parkuje: zpáteční letenka s návratem na jiné letiště do výpisu nepatří (do statistiky cen ano)
    if (park && t.back && t.back.to !== t.out.from) continue;
    if (q.maxPrice && t.perPersonCzk > q.maxPrice) {
      if (!cell) hiddenIds.maxPrice.add(t.id);
      continue;
    }
    if (cold && cell) continue;
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
    if (cell) {
      cellFlat.push(t);
      continue;
    }
    if (!map.has(info.key)) map.set(info.key, { dest: info, trips: [] });
    map.get(info.key).trips.push(t);
    flat.push(t);
  }
  flat.sort((a, b) => a.perPersonCzk - b.perPersonCzk);
  const stats = new Map([...pools].map(([k, list]) => [k, priceStats(list)]));
  const groups = [];
  const obOf = new Map(); // skupina → nejlevnější cesta z každého letiště { czk, n }
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
    // + nejlevnější cesta z každého dalšího letiště odletu (s návratem tam) – filtr „jen lety z X“ (Odkud se vyplatí
    // letět, čip letiště) by jinak cíl schoval, i když odsud let je (fromBest ho ukazuje)
    const have = new Set(picked.map((t) => t.out.from));
    for (const t of g.trips) if (homeOf(t) && !have.has(t.out.from)) { have.add(t.out.from); picked.push(t); }
    const ob = originBests(g.trips);
    groups.push({
      dest: { ...g.dest, airports: [...new Set(g.trips.map((t) => t.out.to))], climate: monthClimate(picked[0].out.to, picked[0].out.date) },
      best: picked[0],
      options: picked,
      count: g.trips.length,
      minFlightCzk: Math.min(...g.trips.map((t) => t.flightCzk)),
      priceStats: stats.get(key),
      // nejlevnější celá cesta sem z každého letiště odletu (ze všech nabídek cíle, ne jen z vybraných 6)
      fromBest: Object.fromEntries(Object.entries(ob).map(([k, v]) => [k, v.czk])),
    });
    obOf.set(groups[groups.length - 1], ob);
  }
  // při stejné ceně podle klíče cíle – pořadí (i to, který cíl se ještě vejde mezi prvních 150) nezávisí na tom, v jakém
  // pořadí lety dorazily
  groups.sort((a, b) => a.best.perPersonCzk - b.best.perPersonCzk || (a.dest.key < b.dest.key ? -1 : a.dest.key > b.dest.key ? 1 : 0));
  // „Super cena“ jen pro to nejlepší z výsledků: absolutní skóre i relativní pořadí (horních 20 %).
  const p20 = groups.length ? groups[Math.floor((groups.length - 1) * 0.2)].best.perPersonCzk : 0;
  const sorted = new Map([...pools].map(([k, list]) => [k, list.map((e) => e.czk).sort((a, b) => a - b)]));
  for (const t of flat.concat(cellFlat)) {
    if (t.deal.level === 'super' && t.perPersonCzk > p20) t.deal.level = 'good';
    t.priceLevel = priceLevelOf(t, stats.get(t.destKey), sorted.get(t.destKey));
    // 🔥 Super cena / 👍 Výhodné jen u dobré ceny – na jedné nabídce nikdy „výhodné“ a zároveň „běžná / dražší“
    if (t.priceLevel.level !== 'low' && (t.deal.level === 'super' || t.deal.level === 'good')) t.deal.level = 'normal';
  }
  if (warm) warm.dests = [...coldDests].filter((k) => !map.has(k)).length;
  const hidden = { maxPrice: hiddenIds.maxPrice.size, directOnly: hiddenIds.directOnly.size };
  // nejlevnější cesta z letiště jen z cílů, které odpověď nese (prvních 150) – jinak by karta „Odkud se vyplatí letět“
  // ukazovala cenu, kterou výpis po klepnutí na letiště nemá
  const kept = groups.slice(0, maxGroups), byOrigin = {};
  for (const g of kept) addBests(byOrigin, obOf.get(g));
  return { groups: kept, flat, warm, hidden, priceStats: priceStats([...pools.values()].flat()), byOrigin, cells: cellFlat };
}
