// Ryanair – veřejné Fare Finder API, které pohání ryanair.com (bez klíče).
//   farfnd/v4/oneWayFares        nejlevnější let do každé destinace z letiště v intervalu dat
//   farfnd/v4/roundTripFares     totéž pro zpáteční cesty
//   farfnd/v4/oneWayFares/A/B/cheapestPerDay  nejlevnější cena po dnech (kalendář)
//   views/locate/5/airports/en/active         letiště, která Ryanair obsluhuje
//   views/locate/searchWidget/routes/en/airport/X  trasy z letiště
import { request, limiter } from '../lib/http.js';
import { cache } from '../lib/cache.js';
import { makeLeg, makeTrip } from '../lib/fares.js';
import { addDays, chunkRange, monthsInRange } from '../lib/dates.js';

const FARFND = ['https://services-api.ryanair.com/farfnd/v4', 'https://www.ryanair.com/api/farfnd/v4'];
const VIEWS = 'https://www.ryanair.com/api/views/locate';
const HEADERS = { Origin: 'https://www.ryanair.com', Referer: 'https://www.ryanair.com/' };
const FARE_TTL = 20 * 60e3;
const limit = limiter(6);

async function farfnd(path, params) {
  const qs = new URLSearchParams(params).toString();
  let lastErr;
  for (const base of FARFND) {
    try {
      return await limit(() => request(`${base}/${path}?${qs}`, { headers: HEADERS, timeoutMs: 15000, retries: 1 }));
    } catch (e) {
      lastErr = e;
      // 4xx kromě 404/403 = chyba dotazu, druhá doména nepomůže.
      if (e.status && e.status < 500 && ![403, 404].includes(e.status)) throw e;
    }
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

  /** Množina IATA kódů letišť, kam Ryanair létá (null = neznámo). */
  async stations() {
    try {
      return await cache.wrap('fr:stations', 24 * 3600e3, async () => {
        const list = await request(`${VIEWS}/5/airports/en/active`, { headers: HEADERS, timeoutMs: 12000 });
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
        const list = await request(`${VIEWS}/searchWidget/routes/en/airport/${origin}`, { headers: HEADERS, timeoutMs: 12000 });
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
    if (q.country) base.arrivalCountryCode = q.country;
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
          inboundDepartureDateFrom: from,
          inboundDepartureDateTo: addDays(to, q.ret.nightsMax),
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

  /** Nejlevnější cena po dnech na trase from → to v intervalu (pro kalendář a optimalizaci). */
  async daily({ from, to, dateFrom, dateTo, adults = 1 }) {
    const months = monthsInRange(dateFrom, dateTo);
    const parts = await Promise.all(months.map((m) =>
      cache.wrap(`fr:cpd:${from}:${to}:${m}`, FARE_TTL, () =>
        farfnd(`oneWayFares/${from}/${to}/cheapestPerDay`, { outboundMonthOfDate: m, currency: 'EUR' }),
      ).then((json) => parseCheapestPerDay(json, from, to, adults))
        .catch((e) => {
          // 404 = trasa v daném měsíci neexistuje
          if (e.status === 404 || e.status === 400) return [];
          throw e;
        }),
    ));
    return parts.flat().filter((l) => l.date >= dateFrom && l.date <= dateTo);
  },
};
