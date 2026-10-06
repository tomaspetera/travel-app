// Travelpayouts / Aviasales Data API – ceny všech aerolinek (i s přestupy) z cache
// vyhledávání uživatelů Aviasales za poslední dny. Zdarma s tokenem z travelpayouts.com.
//   /aviasales/v3/prices_for_dates   bez destinace = nejlevnější lety „kamkoliv“
import { limiter, request } from '../lib/http.js';
import { cache } from '../lib/cache.js';
import { config } from '../config.js';
import { affiliate, affiliateOn } from '../lib/links.js';
import { makeLeg, makeTrip } from '../lib/fares.js';
import { airlineName } from '../lib/airlines.js';
import { getAirport } from '../lib/airports.js';
import { daysBetween, monthsInRange } from '../lib/dates.js';
import { haversineKm } from '../lib/geo.js';

const URL_PFD = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const TTL = 60 * 60e3;
const limit = limiter(4);

const ddmm = (s) => `${s.slice(8, 10)}${s.slice(5, 7)}`;

export function bookingUrl(link, { from, to, dateOut, dateIn = null, adults = 1 } = {}) {
  const base = link
    ? `https://www.aviasales.com${link.startsWith('/') ? '' : '/'}${link}`
    : `https://www.aviasales.com/search/${from}${ddmm(dateOut)}${to}${dateIn ? ddmm(dateIn) : ''}${adults}`;
  if (affiliateOn('aviasales')) return affiliate(base, 'aviasales');
  if (!config.travelpayoutsMarker) return base;
  // Bez čísla projektu (trs) aspoň přímý odkaz s markerem – Aviasales ho při otevření přečte.
  return `${base}${base.includes('?') ? '&' : '?'}marker=${encodeURIComponent(config.travelpayoutsMarker)}`;
}

/**
 * Délka letu z cache Aviasales (duration_to / duration_back), nebo null, když jí nejde věřit. U letů s přestupem
 * bývá kratší, než je možné – nejspíš čistý čas ve vzduchu bez čekání na přestup (QA: U2 PRG→BCN 20:30 → 23:35
 * „3 h 05, 1× přestup“, přímý let trvá 2 h 30; FR LIS→PRG 4 h 15 s přestupem, přímý TAP 3 h 35). S ní by přílet
 * vyšel dřív, než je možné (a „Víc měst“ by na něj navázalo další let). Věří se jí jen, když stačí na přímý let
 * (odhad ze vzdálenosti, +10 % na objížďku přes přestupní letiště) a na každý přestup 80 min (přistání a vzlet navíc
 * a aspoň ~45 min na přestup). Jinak null – přílet a délka jsou pak neznámé (arrUnknown), filtry je neskrývají.
 */
export function cachedDuration(from, to, min, stops) {
  const m = Number(min) > 0 ? Math.round(Number(min)) : null;
  if (!m || !(stops > 0)) return m;
  const a = getAirport(from);
  const b = getAirport(to);
  if (!a || !b) return null;
  const direct = (haversineKm(a.lat, a.lon, b.lat, b.lon) / 780) * 60 + 35;
  return m >= direct * 1.1 + stops * 80 ? m : null;
}

export function parsePricesForDates(json, { adults = 1 } = {}) {
  const out = [];
  for (const d of json?.data || []) {
    if (!(d.price > 0) || !d.departure_at) continue;
    const from = d.origin_airport || d.origin;
    const to = d.destination_airport || d.destination;
    const flightNo = d.airline && d.flight_number ? `${d.airline} ${d.flight_number}` : null;
    const roundTrip = Boolean(d.return_at);
    const url = bookingUrl(d.link, { from, to, dateOut: d.departure_at.slice(0, 10), dateIn: roundTrip ? d.return_at.slice(0, 10) : null, adults });
    const common = { provider: 'travelpayouts', carrier: d.airline || null, carrierName: airlineName(d.airline), live: false, bookUrl: url };
    // let s přestupem bez věrohodné délky: přílet neznámý (arrUnknown), ne dopočtený z nesmyslné délky
    const timed = (a, b, min, stops) => { const m = cachedDuration(a, b, min, stops); return { stops, durationMin: m, ...(stops > 0 && !m ? { arrUnknown: true } : {}) }; };
    const outLeg = makeLeg({
      ...common, flightNo, from, to, dep: d.departure_at,
      czk: roundTrip ? null : d.price, price: roundTrip ? null : d.price, currency: 'CZK',
      ...timed(from, to, d.duration_to || (roundTrip ? null : d.duration), d.transfers ?? 0),
    });
    if (!roundTrip) {
      out.push(makeTrip(outLeg, null, { bookUrl: url }));
      continue;
    }
    const backLeg = makeLeg({
      ...common, flightNo: null, from: to, to: from, dep: d.return_at, czk: null, price: null, currency: 'CZK',
      ...timed(to, from, d.duration_back, d.return_transfers ?? 0),
    });
    out.push(makeTrip(outLeg, backLeg, { combinedCzk: d.price, bookUrl: url }));
  }
  return out;
}

// Trh (market) určuje, z čí mezipaměti hledání se čte – bez něj API bere ruský trh.
// Kdyby API zvolený trh nepřijalo, zkusí se dotaz bez něj (a trh se pro běh serveru vypne).
let marketOk = true;
/** Pro testy: znovu zapne trh (po pokusu, kdy ho API nepřijalo). */
export function resetTravelpayouts() {
  marketOk = true;
}

async function fetchPfd(qs) {
  const j = await limit(() => request(`${URL_PFD}?${qs}`, {
    headers: { 'X-Access-Token': config.travelpayoutsToken },
    timeoutMs: 15000,
    retries: 1,
  }));
  if (j && j.success === false) {
    const err = new Error(`Travelpayouts: ${j.error || 'chyba'}`);
    err.status = 400;
    throw err;
  }
  return j;
}

async function pfd(params) {
  const base = { currency: 'czk', sorting: 'price', limit: '1000', page: '1', unique: 'false', ...params };
  const market = marketOk ? config.travelpayoutsMarket : '';
  const qs = new URLSearchParams(market ? { ...base, market } : base);
  // Odmítnutý dotaz (400/422) pro jednu trasu = Travelpayouts tu kombinaci nezná (malé letiště,
  // neznámý kód) → „žádné ceny“, ne chyba hledání. Uloží se jen na 15 min.
  const rejected = (e, what) => {
    console.warn(`Travelpayouts odmítl dotaz (${what}): HTTP ${e.status} ${String(e.body || e.message).slice(0, 160)}`);
    return { success: true, data: [], rejected: true };
  };
  return cache.wrap(`tp:${qs}`, (v) => (v?.rejected ? 15 * 60e3 : TTL), async () => {
    try {
      return await fetchPfd(qs);
    } catch (e) {
      // Jen odmítnutí dotazu (400/422) může znamenat nepodporovaný trh; výpadek sítě nebo timeout ne.
      if (e.status !== 400 && e.status !== 422) throw e;
      if (!market) return rejected(e, `${params.origin}→${params.destination || '*'}`);
      let res;
      try {
        res = await fetchPfd(new URLSearchParams(base));
      } catch (e2) {
        // bez trhu taky chyba → trh za to nemůže (nech ho zapnutý), trasa prostě nemá data
        if (e2.status === 400 || e2.status === 422) return rejected(e2, `${params.origin}→${params.destination || '*'}`);
        throw e2;
      }
      marketOk = false; // bez trhu prošlo → API trh nepřijímá
      return res;
    }
  });
}

export const travelpayouts = {
  id: 'travelpayouts',
  name: 'Travelpayouts (všechny aerolinky)',
  live: false,

  async stations() {
    return null; // pokrývá prakticky všechna letiště
  },
  async routes() {
    return null;
  },

  /**
   * q: { origin, dateFrom, dateTo, ret?: {nightsMin,nightsMax,backFrom?,backTo?}, destination?, country?, directOnly, adults }
   * Přesné datum (dateFrom = dateTo, u zpáteční i backFrom = backTo) → dotaz na konkrétní den
   * (departure_at/return_at = YYYY-MM-DD), jinak po měsících.
   */
  async explore(q) {
    const back = q.ret?.backFrom && q.ret.backFrom === q.ret.backTo ? q.ret.backFrom : null;
    const parts = await Promise.all(periods(q.dateFrom, q.dateTo).map((m) => pfd({
      origin: q.origin,
      ...(q.destination ? { destination: q.destination } : {}),
      departure_at: m,
      ...(back && m.length === 10 ? { return_at: back } : {}),
      one_way: q.ret ? 'false' : 'true',
      direct: q.directOnly ? 'true' : 'false',
    }).then((j) => parsePricesForDates(j, q))));
    return parts.flat().filter((t) => {
      if (t.out.date < q.dateFrom || t.out.date > q.dateTo) return false;
      if (t.out.from !== q.origin) return false;
      if (q.country && !countryMatch(t.out.to, q.country)) return false;
      if (!q.ret) return !t.back;
      if (!t.back) return false;
      const n = daysBetween(t.out.date, t.back.date);
      return n >= q.ret.nightsMin && n <= q.ret.nightsMax;
    });
  },

  async daily({ from, to, dateFrom, dateTo, adults = 1, directOnly = false }) {
    const parts = await Promise.all(periods(dateFrom, dateTo).map((m) => pfd({
      origin: from, destination: to, departure_at: m, one_way: 'true', direct: directOnly ? 'true' : 'false',
    }).then((j) => parsePricesForDates(j, { adults }))));
    return parts.flat().filter((t) => !t.back && t.out.date >= dateFrom && t.out.date <= dateTo).map((t) => t.out);
  },
};

// Období pro departure_at: jeden den → 'YYYY-MM-DD' (přesná data), jinak měsíce 'YYYY-MM'.
function periods(dateFrom, dateTo) {
  return dateFrom === dateTo ? [dateFrom] : monthsInRange(dateFrom, dateTo).map((m) => m.slice(0, 7));
}

function countryMatch(iata, cc) {
  const a = getAirport(iata);
  return !a || a.cc === cc;
}
