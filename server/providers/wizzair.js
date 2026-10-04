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
const limit = limiter(3);
// Malá náhodná pauza mezi dotazy – dávky bez prodlev z cloudu Wizz Air omezuje.
const pause = () => new Promise((r) => setTimeout(r, 150 + Math.random() * 450));

const BASE_HEADERS = {
  Origin: 'https://www.wizzair.com',
  Referer: 'https://www.wizzair.com/en-gb',
  'Accept-Language': 'en-GB,en;q=0.9',
};

const state = { version: null, jar: new CookieJar(), ready: null, at: 0, blockedUntil: 0 };

export function scrapeVersion(html) {
  return (String(html).match(/be\.wizzair\.com\/(\d+\.\d+\.\d+)\/Api/) || [])[1] || null;
}

async function ensureSession(force = false) {
  if (!force && state.ready && Date.now() - state.at < 30 * 60e3) return state.ready;
  state.at = Date.now();
  state.jar = new CookieJar();
  state.ready = (async () => {
    let version = null;
    try {
      const html = await request(HOME, { as: 'text', jar: state.jar, headers: { Accept: 'text/html' }, timeoutMs: 12000, retries: 0 });
      version = scrapeVersion(html);
    } catch { /* zkusíme buildnumber */ }
    if (!version) {
      try {
        const t = await request('https://wizzair.com/buildnumber', { as: 'text', timeoutMs: 8000, retries: 0 });
        version = (t.match(/(\d+\.\d+\.\d+)/) || [])[1] || null;
      } catch { /* výchozí verze */ }
    }
    state.version = version || DEFAULT_VERSION;
    try {
      await request(`${API}/${state.version}/Api/userSession/new`, { as: 'text', jar: state.jar, headers: BASE_HEADERS, timeoutMs: 10000, retries: 0 });
    } catch { /* token nemusí být potřeba */ }
    return state;
  })();
  return state.ready;
}

class WizzBlocked extends Error {}

async function api(method, path, body, retried = false) {
  if (Date.now() < state.blockedUntil) throw new WizzBlocked('Wizz Air dočasně blokuje dotazy (429)');
  const s = await ensureSession();
  const headers = { ...BASE_HEADERS };
  const tok = s.jar.get('RequestVerificationToken');
  if (tok) headers['X-RequestVerificationToken'] = tok;
  try {
    return await limit(async () => {
      await pause();
      return request(`${API}/${s.version}/Api/${path}`, { method, body, headers, jar: s.jar, timeoutMs: 15000, retries: 1 });
    });
  } catch (e) {
    if (e.status === 429) {
      state.blockedUntil = Date.now() + 10 * 60e3;
      throw new WizzBlocked('Wizz Air dočasně blokuje dotazy (429)');
    }
    // Nová verze API → stará cesta vrací 404/410; obnov session jednou.
    if (!retried && (e.status === 404 || e.status === 410 || /InvalidProtocol/.test(e.body || ''))) {
      await ensureSession(true);
      return api(method, path, body, true);
    }
    throw e;
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

function pickDeparture(f) {
  const list = (f.departureDates || []).map((d) => (typeof d === 'string' ? { date: d } : d)).filter((d) => d && d.date);
  const cheapest = list.find((d) => d.isCheapestOfTheDay) || list[0];
  return cheapest ? cheapest.date : f.departureDate;
}

export function parseTimetable(list, adults = 1) {
  const out = [];
  for (const f of list || []) {
    const amount = f.price?.amount;
    if (!(amount > 0) || f.priceType === 'soldOut' || f.priceType === 'checkPrice') continue;
    const dep = pickDeparture(f);
    out.push(makeLeg({
      provider: 'wizzair', carrier: 'W6', carrierName: 'Wizz Air',
      from: f.departureStation, to: f.arrivalStation, dep,
      price: amount, currency: f.price.currencyCode,
      bookUrl: bookingUrl({ from: f.departureStation, to: f.arrivalStation, dateOut: String(dep).slice(0, 10), adults }),
    }));
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

  async daily({ from, to, dateFrom, dateTo, adults = 1 }) {
    return timetable(from, to, dateFrom, dateTo, adults);
  },

  isBlocked: () => Date.now() < state.blockedUntil,
};
