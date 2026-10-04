// LiteAPI (Nuitée) – hotely s živou cenou pro zadané dny a hodnocením hostů.
// Klíč zdarma na liteapi.travel (sandbox = testovací ceny; ostrý klíč = skutečné ceny).
//   GET  /v3.0/data/hotels   hotely ve městě (název, poloha, fotka, hvězdy, hodnocení)
//   POST /v3.0/hotels/rates  ceny pro konkrétní hotely, data a obsazenost
import { request, limiter } from '../../lib/http.js';
import { cache } from '../../lib/cache.js';
import { config } from '../../config.js';
import { toCzk } from '../../lib/fx.js';
import { haversineKm } from '../../lib/geo.js';
import { affiliate } from '../../lib/links.js';

const API = 'https://api.liteapi.travel/v3.0';
const limit = limiter(2);

const headers = () => ({ 'X-API-Key': config.liteapiKey, accept: 'application/json' });

async function hotelsInCity(cc, city) {
  return cache.wrap(`lite:hotels:${cc}:${city}`, 24 * 3600e3, async () => {
    const qs = new URLSearchParams({ countryCode: cc, cityName: city, limit: '200', minReviewsCount: '10' });
    let j;
    try {
      j = await limit(() => request(`${API}/data/hotels?${qs}`, { headers: headers(), timeoutMs: 20000, retries: 1 }));
    } catch (e) {
      if (e.status !== 400) throw e;
      qs.delete('minReviewsCount'); // starší API filtr nezná
      j = await limit(() => request(`${API}/data/hotels?${qs}`, { headers: headers(), timeoutMs: 20000, retries: 1 }));
    }
    return Array.isArray(j?.data) ? j.data : [];
  });
}

/** Nejlevnější cena hotelu z odpovědi /hotels/rates (různé verze API). */
export function cheapestRate(entry) {
  let best = null;
  for (const rt of entry?.roomTypes || []) {
    const cands = [];
    if (rt.offerRetailRate?.amount) cands.push({ amount: rt.offerRetailRate.amount, currency: rt.offerRetailRate.currency, rate: rt.rates?.[0] });
    for (const r of rt.rates || []) {
      const tot = Array.isArray(r.retailRate?.total) ? r.retailRate.total[0] : r.retailRate?.total;
      if (tot?.amount) cands.push({ amount: tot.amount, currency: tot.currency, rate: r });
    }
    for (const c of cands) if (!best || c.amount < best.amount) best = c;
  }
  return best;
}

export function bookingSearchUrl(name, city, q) {
  const p = new URLSearchParams({ ss: `${name}, ${city}`, checkin: q.checkin, checkout: q.checkout, group_adults: String(q.adults), no_rooms: String(q.rooms), lang: 'cs', selected_currency: 'CZK' });
  return `https://www.booking.com/searchresults.cs.html?${p}`;
}

function whiteLabelUrl(hotelId, q) {
  const occ = Buffer.from(JSON.stringify([{ adults: q.adults, children: [] }])).toString('base64');
  const p = new URLSearchParams({ checkin: q.checkin, checkout: q.checkout, occupancies: occ });
  return `https://${config.liteapiWhitelabel.replace(/^https?:\/\//, '').replace(/\/$/, '')}/hotels/${encodeURIComponent(hotelId)}?${p}`;
}

/**
 * hotels: statická data z /data/hotels; extra: blok hotels[] z odpovědi /hotels/rates (bývá v něm
 * hodnocení a počet recenzí) – sloučí se podle id, novější údaje mají přednost.
 */
export function mapHotels(hotels, ratesData, q, center, extra = []) {
  const byId = new Map(hotels.map((h) => [h.id, h]));
  for (const x of extra || []) {
    if (!x?.id) continue;
    const fresh = Object.fromEntries(Object.entries(x).filter(([, v]) => v != null && v !== ''));
    if (fresh.review_count != null && fresh.reviewCount == null) fresh.reviewCount = fresh.review_count;
    byId.set(x.id, { ...byId.get(x.id), ...fresh });
  }
  const out = [];
  for (const entry of ratesData || []) {
    const h = byId.get(entry.hotelId);
    if (!h) continue;
    const best = cheapestRate(entry);
    if (!best) continue;
    const total = toCzk(best.amount, best.currency || 'EUR');
    if (!(total > 0)) continue;
    const rating = Number(h.rating);
    const lat = Number(h.latitude);
    const lon = Number(h.longitude);
    out.push({
      id: `lite:${h.id}`,
      provider: 'liteapi',
      name: h.name,
      type: 'hotel',
      typeLabel: Number(h.stars) ? `${Math.round(Number(h.stars))}★ hotel` : 'ubytování',
      stars: Number(h.stars) || null,
      rating: Number.isFinite(rating) && rating > 0 ? Math.round((rating > 10 ? rating / 10 : rating) * 10) / 10 : null,
      reviews: Number(h.reviewCount ?? h.review_count ?? h.reviewsCount) || 0,
      address: h.address || '',
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      distanceKm: center && Number.isFinite(lat) ? Math.round(haversineKm(center.lat, center.lon, lat, lon) * 10) / 10 : null,
      photo: h.thumbnail || h.main_photo || null,
      priceTotalCzk: total,
      pricePerNightCzk: Math.round(total / q.nights),
      freeCancellation: /RFN|refundable/i.test(best.rate?.cancellationPolicies?.refundableTag || '') && !/NRFN|non/i.test(best.rate?.cancellationPolicies?.refundableTag || ''),
      breakfast: /breakfast|snídan/i.test(best.rate?.boardName || ''),
      bookUrl: config.liteapiWhitelabel ? whiteLabelUrl(h.id, q) : affiliate(bookingSearchUrl(h.name, q.city, q), 'booking'),
    });
  }
  return out;
}

export const liteapi = {
  id: 'liteapi',
  name: 'LiteAPI',
  // Sandbox klíč (sand_…) vrací testovací hotely a ceny.
  testData: () => /^sand_/i.test(config.liteapiKey),
  async search(q) {
    if (!q.cityEn || !q.cc) throw new Error('chybí město nebo země');
    const hotels = await hotelsInCity(q.cc, q.cityEn);
    if (!hotels.length) return [];
    // Nejlépe hodnocené napřed – ceny se zjišťují pro max. 100 hotelů.
    const rev = (h) => Number(h.reviewCount ?? h.review_count) || 0;
    const ids = [...hotels]
      .sort((a, b) => (Number(b.rating) || 0) * Math.log10(rev(b) + 10) - (Number(a.rating) || 0) * Math.log10(rev(a) + 10))
      .slice(0, 100)
      .map((h) => h.id);
    const body = {
      hotelIds: ids,
      checkin: q.checkin,
      checkout: q.checkout,
      occupancies: Array.from({ length: q.rooms }, (_, i) => ({ adults: Math.ceil((q.adults - i) / q.rooms) || 1, children: [] })),
      currency: 'EUR',
      guestNationality: 'CZ',
      maxRatesPerHotel: 1,
      timeout: 6,
    };
    const j = await limit(() => request(`${API}/hotels/rates`, { method: 'POST', body, headers: headers(), timeoutMs: 25000, retries: 0 }));
    const center = q.lat != null ? { lat: q.lat, lon: q.lon } : null;
    return mapHotels(hotels, j?.data, q, center, j?.hotels);
  },
};
