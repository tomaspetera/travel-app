// Wizz Air – neveřejné API webu wizzair.com (bez klíče).
//   GET  /Api/asset/map             síť tras (letiště + spojení)
//   POST /Api/search/timetableV2    nejlevnější cena po dnech na trase (± zpáteční směr)
// Endpointy pro rezervaci jsou za ochranou Kasada (HTTP 429), tyto dva ne.
// Wizz nemá „kamkoliv“ hledání → 1 dotaz na trasu, proto rozpočet volání na hledání.
import { CookieJar, limiter, request } from '../lib/http.js';
import { cache } from '../lib/cache.js';
import { makeLeg } from '../lib/fares.js';
import { chunkRange } from '../lib/dates.js';

const HOME = 'https://www.wizzair.com/en-gb';
const API = 'https://be.wizzair.com';
const DEFAULT_VERSION = '29.14.0';
const FARE_TTL = 30 * 60e3;
const WINDOW_DAYS = 30;
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
  return `https://wizzair.com/cs-cz/booking/select-flight/${from}/${to}/${dateOut}/${dateIn || 'null'}/${adults}/0/0/null`;
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

async function timetable(from, to, dateFrom, dateTo, adults) {
  const legs = [];
  for (const [a, b] of chunkRange(dateFrom, dateTo, WINDOW_DAYS)) {
    const body = {
      flightList: [{ departureStation: from, arrivalStation: to, from: a, to: b }],
      priceType: 'regular', adultCount: adults, childCount: 0, infantCount: 0,
    };
    const json = await cache.wrap(`w6:tt:${from}:${to}:${a}:${b}:${adults}`, FARE_TTL, () => api('POST', 'search/timetableV2', body));
    legs.push(...parseTimetable(json?.outboundFlights, adults));
  }
  return legs;
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
  async daily({ from, to, dateFrom, dateTo, adults = 1, near = null }) {
    const a = near && near.from < dateFrom ? near.from : dateFrom;
    const b = near && near.to > dateTo ? near.to : dateTo;
    const wide = chunkRange(a, b, WINDOW_DAYS).length <= chunkRange(dateFrom, dateTo, WINDOW_DAYS).length;
    return timetable(from, to, wide ? a : dateFrom, wide ? b : dateTo, adults);
  },

  isBlocked: () => Date.now() < state.blockedUntil,
  retryAfter: () => Math.max(0, Math.ceil((state.blockedUntil - Date.now()) / 1000)), // s do konce blokace (pro „Zkusit znovu“)
};
