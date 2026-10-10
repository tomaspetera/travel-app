// Ryanair – veřejné Fare Finder API, které pohání ryanair.com (bez klíče).
//   farfnd/v4/oneWayFares        nejlevnější let do každé destinace z letiště v intervalu dat
//   farfnd/v4/roundTripFares     totéž pro zpáteční cesty
//   farfnd/v4/oneWayFares/A/B/cheapestPerDay  nejlevnější cena po dnech (kalendář)
//   views/locate/5/airports/en/active         letiště, která Ryanair obsluhuje
//   views/locate/searchWidget/routes/en/airport/X  trasy z letiště
//   timtbl/3/schedules/A/B/years/Y/months/M       letový řád trasy (všechny lety dne, bez cen)
import { CookieJar, request, limiter } from '../lib/http.js';
import { cache } from '../lib/cache.js';
import { makeLeg, makeTrip } from '../lib/fares.js';
import { addDays, chunkRange, monthsInRange } from '../lib/dates.js';

const FARFND = ['https://services-api.ryanair.com/farfnd/v4', 'https://www.ryanair.com/api/farfnd/v4'];
const VIEWS = 'https://www.ryanair.com/api/views/locate';
const TIMTBL = 'https://www.ryanair.com/api/timtbl/3/schedules';
const HEADERS = { Origin: 'https://www.ryanair.com', Referer: 'https://www.ryanair.com/' };
const FARE_TTL = 20 * 60e3;
const limit = limiter(6);

// Session cookies z webu ryanair.com: API občas odmítne „studený“ dotaz bez nich (403).
// Stejně to dělají knihovny ryanair-py a ryanair-mcp. Obnovuje se po 30 min nebo po 403.
const HOME = 'https://www.ryanair.com/ie/en';
const session = { jar: new CookieJar(), at: 0, pending: null };

export async function warmSession(force = false) {
  if (!force && session.at && Date.now() - session.at < 30 * 60e3) return;
  if (session.pending) return session.pending;
  session.pending = (async () => {
    const jar = new CookieJar();
    try {
      await request(HOME, { as: 'text', jar, headers: { Accept: 'text/html,application/xhtml+xml' }, timeoutMs: 10000, retries: 0 });
      session.jar = jar;
    } catch {
      // Bez cookies to většinou jde taky – nezdržuj hledání.
    } finally {
      session.at = Date.now();
      session.pending = null;
    }
  })();
  return session.pending;
}

async function get(url) {
  await warmSession();
  return limit(() => request(url, { headers: HEADERS, jar: session.jar, timeoutMs: 15000, retries: 1 }));
}

async function farfnd(path, params) {
  const qs = new URLSearchParams(params).toString();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const base of FARFND) {
      try {
        return await get(`${base}/${path}?${qs}`);
      } catch (e) {
        lastErr = e;
        // 4xx kromě 404/403 = chyba dotazu, druhá doména nepomůže.
        if (e.status && e.status < 500 && ![403, 404].includes(e.status)) throw e;
      }
    }
    if (lastErr?.status !== 403 || attempt) break;
    await warmSession(true); // studený 403 → obnov cookies a zkus to ještě jednou
  }
  throw lastErr;
}

export function bookingUrl({ from, to, dateOut, dateIn = null, adults = 1 }) {
  const p = new URLSearchParams({
    adults: String(adults), teens: '0', children: '0', infants: '0',
    dateOut, dateIn: dateIn || '', isConnectedFlight: 'false', discount: '0', promoCode: '',
    isReturn: dateIn ? 'true' : 'false', originIata: from, destinationIata: to,
    tpAdults: String(adults), tpTeens: '0', tpChildren: '0', tpInfants: '0',
    tpStartDate: dateOut, tpEndDate: dateIn || '', tpDiscount: '0', tpPromoCode: '',
    tpOriginIata: from, tpDestinationIata: to,
  });
  return `https://www.ryanair.com/cz/cs/trip/flights/select?${p}`;
}

/** Převod jednoho „outbound/inbound“ objektu z farfnd na Leg. */
export function parseFareLeg(f, adults = 1) {
  if (!f || !f.price || !(f.price.value > 0)) return null;
  const from = f.departureAirport.iataCode;
  const to = f.arrivalAirport.iataCode;
  const fn = f.flightNumber || '';
  return makeLeg({
    provider: 'ryanair',
    carrier: fn.slice(0, 2) || 'FR',
    carrierName: 'Ryanair',
    flightNo: fn ? `${fn.slice(0, 2)} ${fn.slice(2)}` : null,
    from,
    to,
    dep: f.departureDate,
    arr: f.arrivalDate,
    price: f.price.value,
    currency: f.price.currencyCode,
    prevPrice: f.previousPrice?.value ?? null,
    foundAt: f.priceUpdated || null,
    bookUrl: bookingUrl({ from, to, dateOut: f.departureDate.slice(0, 10), adults }),
  });
}

export function parseOneWay(json, adults = 1) {
  return (json?.fares || []).map((x) => parseFareLeg(x.outbound, adults)).filter(Boolean).map((leg) => makeTrip(leg));
}

export function parseRoundTrip(json, adults = 1) {
  const out = [];
  for (const x of json?.fares || []) {
    const o = parseFareLeg(x.outbound, adults);
    const b = parseFareLeg(x.inbound, adults);
    if (!o || !b) continue;
    const trip = makeTrip(o, b);
    trip.bookUrl = bookingUrl({ from: o.from, to: o.to, dateOut: o.date, dateIn: b.date, adults });
    out.push(trip);
  }
  return out;
}

export function parseCheapestPerDay(json, from, to, adults = 1) {
  const out = [];
  for (const f of json?.outbound?.fares || []) {
    if (!f.price || !(f.price.value > 0) || f.soldOut || f.unavailable) continue;
    out.push(makeLeg({
      provider: 'ryanair', carrier: 'FR', carrierName: 'Ryanair', from, to,
      dep: f.departureDate || `${f.day}T00:00:00`, arr: f.arrivalDate,
      price: f.price.value, currency: f.price.currencyCode,
      bookUrl: bookingUrl({ from, to, dateOut: f.day, adults }),
    }));
  }
  return out;
}

export const ryanair = {
  id: 'ryanair',
  name: 'Ryanair',
  live: true,
  // Kódy letů skupiny Ryanair v letovém řádu (i u stejných letů nalezených přes Kiwi).
  carriers: ['FR', 'RK'],

  /** Množina IATA kódů letišť, kam Ryanair létá (null = neznámo). */
  async stations() {
    try {
      return await cache.wrap('fr:stations', 24 * 3600e3, async () => {
        const list = await get(`${VIEWS}/5/airports/en/active`);
        const set = new Set(list.map((a) => a.code || a.iataCode).filter(Boolean));
        if (!set.size) throw new Error('prázdný seznam letišť');
        return set;
      });
    } catch {
      return null;
    }
  },

  /** Množina destinací z letiště (null = neznámo). */
  async routes(origin) {
    try {
      return await cache.wrap(`fr:routes:${origin}`, 24 * 3600e3, async () => {
        const list = await get(`${VIEWS}/searchWidget/routes/en/airport/${origin}`);
        return new Set(list.map((r) => r.arrivalAirport?.code).filter(Boolean));
      });
    } catch {
      return null;
    }
  },

  /**
   * Nejlevnější cesta do každé destinace z jednoho letiště.
   * q: { origin, dateFrom, dateTo, ret?: { nightsMin, nightsMax }, country?, destination?, adults }
   */
  async explore(q) {
    const adults = q.adults || 1;
    // Stejná sada parametrů jako web ryanair.com / knihovna ryanair-py.
    const base = {
      departureAirportIataCode: q.origin,
      outboundDepartureTimeFrom: '00:00',
      outboundDepartureTimeTo: '23:59',
      currency: 'EUR',
    };
    // API bere kód země jen malými písmeny („it“ → destinace, „IT“ → nic).
    if (q.country) base.arrivalCountryCode = String(q.country).toLowerCase();
    if (q.destination) base.arrivalAirportIataCode = q.destination;
    // Fare Finder hledá max. ~ několik měsíců dopředu; delší intervaly rozděl.
    const windows = chunkRange(q.dateFrom, q.dateTo, 62);
    const results = [];
    for (const [from, to] of windows) {
      if (!q.ret) {
        const params = { ...base, outboundDepartureDateFrom: from, outboundDepartureDateTo: to };
        const json = await cache.wrap(`fr:ow:${JSON.stringify(params)}`, FARE_TTL, () => farfnd('oneWayFares', params));
        results.push(...parseOneWay(json, adults));
      } else {
        const params = {
          ...base,
          outboundDepartureDateFrom: from,
          outboundDepartureDateTo: to,
          // Přesná data → jen okno návratu; jinak od začátku okna odletu po konec + max. nocí.
          inboundDepartureDateFrom: q.ret.backFrom || from,
          inboundDepartureDateTo: q.ret.backTo || addDays(to, q.ret.nightsMax),
          inboundDepartureTimeFrom: '00:00',
          inboundDepartureTimeTo: '23:59',
          durationFrom: String(q.ret.nightsMin),
          durationTo: String(q.ret.nightsMax),
        };
        const json = await cache.wrap(`fr:rt:${JSON.stringify(params)}`, FARE_TTL, async () => {
          try {
            return await farfnd('roundTripFares', params);
          } catch (e) {
            if (e.status !== 400) throw e;
            // Kdyby API odmítlo délku pobytu, hledej bez ní – noci pak pohlídá orchestrace.
            const { durationFrom, durationTo, ...rest } = params;
            return farfnd('roundTripFares', rest);
          }
        });
        results.push(...parseRoundTrip(json, adults));
      }
    }
    return results;
  },

  /**
   * Nejlevnější cena po dnech na trase from → to v intervalu (pro kalendář a optimalizaci).
   * near = { from, to }: širší okno (dny kolem přesného data) – vrátí i ty dny, i když padnou do sousedního měsíce
   * (u data na konci měsíce jeden dotaz navíc, v mezipaměti), jinak by „Nejbližší dny“ 29. 11. neukázaly 1. 12.
   */
  async daily({ from, to, dateFrom, dateTo, adults = 1, near = null }) {
    const a = near && near.from < dateFrom ? near.from : dateFrom;
    const b = near && near.to > dateTo ? near.to : dateTo;
    const months = monthsInRange(a, b), core = new Set(monthsInRange(dateFrom, dateTo));
    const parts = await Promise.all(months.map((m) =>
      cache.wrap(`fr:cpd:${from}:${to}:${m}`, FARE_TTL, () =>
        farfnd(`oneWayFares/${from}/${to}/cheapestPerDay`, { outboundMonthOfDate: m, currency: 'EUR' }),
      ).then((json) => parseCheapestPerDay(json, from, to, adults))
        .catch((e) => {
          // 404 = trasa v daném měsíci neexistuje; chyba sousedního měsíce (jen pro „Nejbližší dny“) neshodí ceny
          // hledaných dní
          if (e.status === 404 || e.status === 400 || !core.has(m)) return [];
          throw e;
        }),
    ));
    return parts.flat().filter((l) => l.date >= a && l.date <= b);
  },

  /**
   * Odlety Ryanairu na trase v daných dnech podle letového řádu (bez cen): { 'YYYY-MM-DD': ['06:10', …] }.
   * Jeden dotaz na trasu a měsíc (v mezipaměti 12 h); chyba = prázdný výsledek.
   */
  async departures(from, to, days) {
    const out = {};
    const months = [...new Set(days.map((d) => d.slice(0, 7)))];
    await Promise.all(months.map(async (ym) => {
      let json;
      try {
        json = await cache.wrap(`fr:tt:${from}:${to}:${ym}`, 12 * 3600e3, () =>
          limit(() => request(`${TIMTBL}/${from}/${to}/years/${ym.slice(0, 4)}/months/${Number(ym.slice(5, 7))}`, { headers: HEADERS, jar: session.jar, timeoutMs: 8000, retries: 0 })));
      } catch {
        return;
      }
      Object.assign(out, parseSchedule(json, ym, days));
    }));
    return out;
  },
};

/** timtbl schedules → { den: seřazené časy odletů } jen pro požadované dny. */
export function parseSchedule(json, ym, days) {
  const want = new Set(days);
  const out = {};
  for (const d of json?.days || []) {
    const date = `${ym}-${String(d.day).padStart(2, '0')}`;
    if (!want.has(date)) continue;
    const times = (d.flights || []).map((f) => String(f.departureTime || '').slice(0, 5)).filter((t) => /^\d{2}:\d{2}$/.test(t));
    out[date] = [...new Set(times)].sort();
  }
  return out;
}
