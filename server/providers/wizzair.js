// Wizz Air – neveřejné API webu wizzair.com (bez klíče).
//   GET  /Api/asset/map             síť tras (letiště + spojení)
//   POST /Api/search/timetableV2    nejlevnější cena po dnech na trase (± zpáteční směr)
// Endpointy pro rezervaci jsou za ochranou Kasada (HTTP 429), tyto dva ne.
// Wizz nemá „kamkoliv“ hledání → 1 dotaz na trasu, proto rozpočet volání na hledání.
import { CookieJar, limiter, request } from '../lib/http.js';
import { cache } from '../lib/cache.js';
import { makeLeg } from '../lib/fares.js';
import { addDays, chunkRange, daysBetween, todayYmd } from '../lib/dates.js';

const HOME = 'https://www.wizzair.com/en-gb';
const API = 'https://be.wizzair.com';
const DEFAULT_VERSION = '29.14.0';
const FARE_TTL = 30 * 60e3;
const WINDOW_DAYS = 30;
// Paměť tras: ceny po dnech z dřívějších dotazů. Do FARE_TTL čerstvé (i přesné hledání), do MEMORY_TTL je smí
// „kamkoliv“ ukázat se stářím – tak se rozpočet dotazů na hledání může posunout na trasy, které ještě nikdo nehledal.
export const MEMORY_TTL = 6 * 3600e3;
// Směr trasy × počet cestujících; nejdéle nepoužité pryč. Musí se vejít celé „kamkoliv“ z velké základny (BUD, WAW:
// 150+ tras × 2 směry), jinak si hledání samo vytlačuje paměť a dotazuje se znovu nad rozpočet. Dny se ukládají
// zhuštěně (jen pole pro parseTimetable), ~150 B na den → 2 000 směrů × 60 dní ≈ 18 MB nejvýš.
const MEMORY_ROUTES = 2000;
const memory = new Map(); // `${from}|${to}|${adults}` → { spans: [{ a, b, at }], days: Map<ymd, { at, f }> }
// Wizz po každé odpovědi mění ověřovací token (cookie RequestVerificationToken) a souběžné dotazy
// se starým tokenem odmítá (HTTP 400 InvalidProtocol). Proto 3 nezávislé relace, v každé dotazy
// za sebou – token se čte až těsně před odesláním.
const POOL = 3;
// Malá náhodná pauza mezi dotazy – dávky bez prodlev z cloudu Wizz Air omezuje.
const pause = () => new Promise((r) => setTimeout(r, 150 + Math.random() * 450));

const BASE_HEADERS = {
  Origin: 'https://www.wizzair.com',
  Referer: 'https://www.wizzair.com/en-gb',
  'Accept-Language': 'en-GB,en;q=0.9',
};

const state = { blockedUntil: 0 };
const sessions = Array.from({ length: POOL }, () => ({ version: null, jar: new CookieJar(), ready: null, refreshing: null, at: 0, busy: 0, run: limiter(1) }));

export function scrapeVersion(html) {
  return (String(html).match(/be\.wizzair\.com\/(\d+\.\d+\.\d+)\/Api/) || [])[1] || null;
}

async function ensureSession(s, force = false) {
  if (!force && s.ready && Date.now() - s.at < 30 * 60e3) return s.ready;
  if (force && s.refreshing) return s.refreshing; // obnova už běží – nečekej na další
  s.at = Date.now();
  s.jar = new CookieJar();
  s.ready = s.refreshing = (async () => {
    let version = null;
    try {
      const html = await request(HOME, { as: 'text', jar: s.jar, headers: { Accept: 'text/html' }, timeoutMs: 12000, retries: 0 });
      version = scrapeVersion(html);
    } catch { /* zkusíme buildnumber */ }
    if (!version) {
      try {
        const t = await request('https://wizzair.com/buildnumber', { as: 'text', timeoutMs: 8000, retries: 0 });
        version = (t.match(/(\d+\.\d+\.\d+)/) || [])[1] || null;
      } catch { /* výchozí verze */ }
    }
    s.version = version || DEFAULT_VERSION;
    try {
      await request(`${API}/${s.version}/Api/userSession/new`, { as: 'text', jar: s.jar, headers: BASE_HEADERS, timeoutMs: 10000, retries: 0 });
    } catch { /* token nemusí být potřeba */ }
    return s;
  })().finally(() => { s.refreshing = null; });
  return s.ready;
}

class WizzBlocked extends Error {}

async function api(method, path, body, retried = false) {
  if (Date.now() < state.blockedUntil) throw new WizzBlocked('Wizz Air dočasně blokuje dotazy (429)');
  const s = sessions.reduce((a, b) => (b.busy < a.busy ? b : a)); // nejméně vytížená relace
  s.busy++;
  try {
    return await s.run(async () => {
      // 429 přišla, zatímco dotaz čekal ve frontě relace: už ho neposílat (další dotazy by blokaci jen prodloužily)
      if (Date.now() < state.blockedUntil) throw new WizzBlocked('Wizz Air dočasně blokuje dotazy (429)');
      await ensureSession(s);
      await pause();
      const headers = { ...BASE_HEADERS };
      const tok = s.jar.get('RequestVerificationToken'); // aktuální token až po čekání ve frontě
      if (tok) headers['X-RequestVerificationToken'] = tok;
      return request(`${API}/${s.version}/Api/${path}`, { method, body, headers, jar: s.jar, timeoutMs: 15000, retries: 1 });
    });
  } catch (e) {
    if (e.status === 429) {
      state.blockedUntil = Date.now() + 10 * 60e3;
      throw new WizzBlocked('Wizz Air dočasně blokuje dotazy (429)');
    }
    // Nová verze API (404/410) nebo neplatný token → obnov tuhle relaci a zkus jednou znovu.
    if (!retried && (e.status === 404 || e.status === 410 || /InvalidProtocol/.test(e.body || ''))) {
      await ensureSession(s, true);
      return api(method, path, body, true);
    }
    throw e;
  } finally {
    s.busy--;
  }
}

export function bookingUrl({ from, to, dateOut, dateIn = null, adults = 1 }) {
  return `https://www.wizzair.com/cs-cz/booking/select-flight/${from}/${to}/${dateOut}/${dateIn || 'null'}/${adults}/0/0/null`;
}

export function parseNetwork(json) {
  const net = new Map();
  for (const c of json?.cities || []) {
    if (!c.iata || c.isFakeStation) continue;
    const conns = (c.connections || [])
      .filter((x) => x.iata && (x.isDirectFlight ?? !x.isConnected))
      .map((x) => x.iata);
    net.set(c.iata, { iata: c.iata, cc: c.countryCode, currency: c.currencyCode, connections: new Set(conns) });
  }
  return net;
}

function departureList(f) {
  return (f.departureDates || []).map((d) => (typeof d === 'string' ? { date: d } : d)).filter((d) => d && d.date);
}

function pickDeparture(list, f) {
  const cheapest = list.find((d) => d.isCheapestOfTheDay) || list[0];
  return cheapest ? cheapest.date : f.departureDate;
}

export function parseTimetable(list, adults = 1) {
  const out = [];
  for (const f of list || []) {
    const amount = f.price?.amount;
    if (!(amount > 0) || f.priceType === 'soldOut' || f.priceType === 'checkPrice') continue;
    const deps = departureList(f);
    const dep = pickDeparture(deps, f);
    const leg = makeLeg({
      provider: 'wizzair', carrier: 'W6', carrierName: 'Wizz Air',
      from: f.departureStation, to: f.arrivalStation, dep,
      price: amount, currency: f.price.currencyCode,
      bookUrl: bookingUrl({ from: f.departureStation, to: f.arrivalStation, dateOut: String(dep).slice(0, 10), adults }),
    });
    // Další odlety téhož dne (cena jen u nejlevnějšího) – zobrazí se jako „další lety tento den“.
    const own = String(dep).slice(11, 16);
    const other = [...new Set(deps.map((d) => String(d.date).slice(11, 16)))].filter((t) => /^\d{2}:\d{2}$/.test(t) && t !== own && t !== '00:00').sort();
    if (other.length) leg.otherDeps = other;
    out.push(leg);
  }
  return out;
}

function memOf(key, create) {
  let m = memory.get(key);
  if (m) {
    memory.delete(key);
    memory.set(key, m); // nejnověji použité na konec
  } else if (create) {
    m = { spans: [], days: new Map() };
    memory.set(key, m);
    if (memory.size > MEMORY_ROUTES) memory.delete(memory.keys().next().value);
  }
  return m;
}

function prune(m, now) {
  const min = now - MEMORY_TTL;
  const today = todayYmd();
  m.spans = m.spans.filter((x) => x.at >= min && x.b >= today);
  for (const [d, x] of m.days) if (x.at < min || d < today) m.days.delete(d);
}

/** Dny a..b bez dat z doby po minAt → co nejméně oken dotazů (≤ 30 dní; mezi chybějícími dny i už známé). */
export function missingWindows(spans, a, b, minAt) {
  const out = [];
  let cur = null;
  for (let d = a; d <= b; d = addDays(d, 1)) {
    if (spans.some((x) => x.at >= minAt && x.a <= d && d <= x.b)) continue;
    if (cur && daysBetween(cur[0], d) < WINDOW_DAYS) cur[1] = d;
    else out.push((cur = [d, d]));
  }
  return out;
}

/** Den z odpovědi Wizz Air jen s tím, co čte parseTimetable (odpověď má na den desítky polí navíc). */
const compactDay = (f) => ({
  departureStation: f.departureStation, arrivalStation: f.arrivalStation, departureDate: f.departureDate, priceType: f.priceType,
  price: f.price ? { amount: f.price.amount, currencyCode: f.price.currencyCode } : null,
  departureDates: departureList(f).map((d) => ({ date: d.date, ...(d.isCheapestOfTheDay ? { isCheapestOfTheDay: true } : {}) })),
});

function remember(m, a, b, list, at) {
  for (let d = a; d <= b; d = addDays(d, 1)) m.days.delete(d); // vyprodané / zrušené dny nesmí zůstat se starou cenou
  for (const f of list || []) {
    const d = String(f.departureDate || '').slice(0, 10);
    if (d >= a && d <= b) m.days.set(d, { at, f: compactDay(f) });
  }
  m.spans.push({ a, b, at });
}

/**
 * Stav trasy v paměti: calls = dotazů k čerstvým cenám, usable = celé období v paměti (≤ 6 h), at = nejstarší použitá
 * data, empty = celé období v paměti a žádný den s cenou (sezónní trasa mimo sezónu) – zpáteční směr pak není potřeba.
 */
function routeState({ from, to, dateFrom, dateTo, adults = 1 }, now = Date.now()) {
  const m = memOf(`${from}|${to}|${adults}`, false);
  const spans = m ? m.spans : [];
  const calls = missingWindows(spans, dateFrom, dateTo, now - FARE_TTL).length;
  const usable = !missingWindows(spans, dateFrom, dateTo, now - MEMORY_TTL).length;
  let at = null;
  if (usable) {
    for (let d = dateFrom; d <= dateTo; d = addDays(d, 1)) {
      const best = Math.max(...spans.filter((x) => x.a <= d && d <= x.b).map((x) => x.at));
      if (at == null || best < at) at = best;
    }
  }
  const empty = usable && ![...m.days].some(([d, x]) => d >= dateFrom && d <= dateTo && parseTimetable([x.f]).length);
  return { calls, usable, at, empty };
}

async function timetable(from, to, dateFrom, dateTo, adults, { maxAgeMs = FARE_TTL, memoryOnly = false } = {}) {
  // jen z paměti: nic nezakládat ani nevytlačovat (hledání by si jinak samo mazalo trasy, které má v plánu)
  const m = memOf(`${from}|${to}|${adults}`, !memoryOnly);
  if (!m) return [];
  const now = Date.now();
  prune(m, now);
  if (!memoryOnly) {
    for (const [a, b] of missingWindows(m.spans, dateFrom, dateTo, now - Math.min(maxAgeMs, MEMORY_TTL))) {
      // cache jen pro souběžné stejné dotazy (dvě hledání najednou = jeden dotaz)
      const json = await cache.wrap(`w6:tt:${from}:${to}:${a}:${b}:${adults}`, 60e3, () => api('POST', 'search/timetableV2', {
        flightList: [{ departureStation: from, arrivalStation: to, from: a, to: b }],
        priceType: 'regular', adultCount: adults, childCount: 0, infantCount: 0,
      }));
      remember(m, a, b, json?.outboundFlights, Date.now());
    }
  }
  const legs = [];
  const t = Date.now();
  for (const [d, x] of m.days) {
    if (d < dateFrom || d > dateTo) continue;
    for (const leg of parseTimetable([x.f], adults)) {
      leg.fetchedAt = x.at;
      if (t - x.at > FARE_TTL) leg.memAgeMin = Math.round((t - x.at) / 60e3);
      legs.push(leg);
    }
  }
  return legs.sort((x, y) => (x.dep < y.dep ? -1 : 1));
}

export const wizzair = {
  id: 'wizzair',
  name: 'Wizz Air',
  live: true,
  callsPerRoute: (dateFrom, dateTo) => chunkRange(dateFrom, dateTo, WINDOW_DAYS).length,

  async network() {
    return cache.wrap('w6:map', 12 * 3600e3, async () => {
      const net = parseNetwork(await api('GET', 'asset/map?languageCode=en-gb'));
      if (!net.size) throw new Error('Wizz Air: prázdná síť tras');
      return net;
    });
  },

  async stations() {
    try {
      return new Set((await this.network()).keys());
    } catch {
      return null;
    }
  },

  async routes(origin) {
    try {
      return (await this.network()).get(origin)?.connections || new Set();
    } catch {
      return null;
    }
  },

  /** Destinace z letiště podle sítě tras (volitelně jen do země). */
  async destinations(origin, country = null) {
    const net = await this.network();
    const st = net.get(origin);
    if (!st) return [];
    return [...st.connections].filter((d) => !country || net.get(d)?.cc === country);
  },

  /**
   * Ceny po dnech. near = { from, to }: dny kolem přesného data – vejde-li se širší okno do jednoho
   * dotazu (≤ 30 dní), zeptá se rovnou na něj (žádný dotaz navíc), jinak jen na dateFrom..dateTo.
   */
  async daily({ from, to, dateFrom, dateTo, adults = 1, near = null, maxAgeMs, memoryOnly }) {
    const a = near && near.from < dateFrom ? near.from : dateFrom;
    const b = near && near.to > dateTo ? near.to : dateTo;
    const wide = chunkRange(a, b, WINDOW_DAYS).length <= chunkRange(dateFrom, dateTo, WINDOW_DAYS).length;
    return timetable(from, to, wide ? a : dateFrom, wide ? b : dateTo, adults, { maxAgeMs, memoryOnly });
  },

  routeState,
  _resetMemory: () => memory.clear(), // testy

  isBlocked: () => Date.now() < state.blockedUntil,
  retryAfter: () => Math.max(0, Math.ceil((state.blockedUntil - Date.now()) / 1000)), // s do konce blokace (pro „Zkusit znovu“)
};
