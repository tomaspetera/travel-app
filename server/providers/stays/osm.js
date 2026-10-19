// Ubytování v místě z OpenStreetMap (Nominatim) – záloha pro malá místa, kde TripAdvisor (Xotelo) nic nemá: obec bez
// ID místa TripAdvisoru ve Wikidatech ani v okolí (Palazzolo Acreide na Sicílii – nejbližší ID až Ortygia 35 km,
// Alcobaça v Portugalsku). Jen názvy, typ, hvězdičky a poloha – bez ceny a hodnocení; cenu uživatel ověří u partnera
// (odkaz na hledání hotelu na Booking.com s termínem) a zadá ji sám. Zdarma, bez klíče.
//   GET nominatim.openstreetmap.org/search?q=hotel&viewbox=…&bounded=1   zvláštní fráze = tourism=hotel v okolí
// Pravidla Nominatimu: nejvýš 1 dotaz za sekundu, vlastní User-Agent, výsledky v mezipaměti (týden; výpadek 10 min).
import { request, limiter } from '../../lib/http.js';
import { cache } from '../../lib/cache.js';
import { haversineKm } from '../../lib/geo.js';
import { affiliate, affiliateOn, bookingSearchUrl } from '../../lib/links.js';
import { UA } from '../../lib/poi.js';
import { config } from '../../config.js';

const API = 'https://nominatim.openstreetmap.org/search';
// fráze → tourism=… (živě 10/2026: „hotel“ a „guest house“ najdou hotely a agroturistiky, „hostel“ hostely;
// „apartment“ ani „bed and breakfast“ v okolí malých míst nic)
export const PHRASES = ['hotel', 'guest house', 'hostel'];
export const BOX_KM = 5; // čtverec ±5 km kolem místa pobytu
export const MAX_KM = 6; // dál se zahodí (rohy čtverce)
export const OSM_MAX = 12;
const TIMEOUT = 10000;
const GAP_MS = 1100; // Nominatim: nejvýš 1 dotaz za sekundu (pro celý server)
const TTL = 7 * 864e5;
const FAIL_TTL = 10 * 60e3;
const queue = limiter(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// tourism=… → [skupina pro filtr typu (jako u ostatních zdrojů), štítek]
const TYPES = {
  hotel: ['hotel', 'hotel'], motel: ['hotel', 'motel'], guest_house: ['penzion', 'penzion · agroturistika'],
  hostel: ['hostel', 'hostel'], apartment: ['apartmán', 'apartmány'], chalet: ['apartmán', 'chata · vila'],
};

/** viewbox Nominatimu (lon1,lat1,lon2,lat2) – čtverec ±km kolem bodu. */
export function viewbox(lat, lon, km = BOX_KM) {
  const dy = km / 111.32;
  const dx = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lon - dx, lat + dy, lon + dx, lat - dy].map((x) => x.toFixed(4)).join(',');
}

const httpUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : null);
const starsOf = (s) => {
  const n = Number.parseInt(String(s ?? ''), 10);
  return n >= 1 && n <= 5 ? n : null;
};

/**
 * Řádek Nominatimu → Stay bez ceny (jako hotely bez ceny z Xotela, viz stays/index.js): odkaz na hledání hotelu na
 * Booking.com s termínem a hosty, web ubytování (jen http/https), poloha a vzdálenost od místa pobytu; jiný typ
 * než ubytování, bez názvu nebo bez polohy → null.
 */
export function mapOsm(row, q, center) {
  if (!row || row.category !== 'tourism' || !TYPES[row.type]) return null;
  const name = String(row.name || '').trim().slice(0, 120);
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  const osmType = String(row.osm_type || '');
  const osmId = String(row.osm_id ?? '');
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || !/^(node|way|relation)$/.test(osmType) || !/^\d{1,15}$/.test(osmId)) return null;
  const [type, typeLabel] = TYPES[row.type];
  const x = row.extratags || {};
  const city = q.cityEn || q.city || '';
  const stars = starsOf(x.stars);
  return {
    id: `osm:${osmType}/${osmId}`,
    provider: 'osm',
    osm: true,
    name,
    type,
    typeLabel: stars && type === 'hotel' ? `${stars}★ hotel` : typeLabel,
    stars,
    rating: null,
    reviews: 0,
    address: '',
    lat,
    lon,
    distanceKm: center ? Math.round(haversineKm(center.lat, center.lon, lat, lon) * 10) / 10 : null,
    photo: null,
    priceTotalCzk: null,
    pricePerNightCzk: null,
    rates: [],
    ratesAt: null,
    freeCancellation: null,
    breakfast: null,
    website: httpUrl(x.website || x['contact:website']),
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city ? `${name}, ${city}` : `${lat},${lon}`)}`,
    bookUrl: affiliate(bookingSearchUrl(name, city, q), 'booking'),
    bookSponsored: affiliateOn('booking'),
  };
}

/** Hotely s hvězdičkami napřed (víc hvězd výš), pak ostatní podle vzdálenosti; bez opakování, nejvýš max. */
export function rankOsm(items, max = OSM_MAX) {
  const seen = new Set();
  return items
    .filter((h) => h && (h.distanceKm == null || h.distanceKm <= MAX_KM))
    .filter((h) => {
      const k = `${h.name.toLowerCase()}|${h.lat.toFixed(3)}|${h.lon.toFixed(3)}`;
      if (seen.has(h.id) || seen.has(k)) return false;
      seen.add(h.id); seen.add(k);
      return true;
    })
    .sort((a, b) => Number(Boolean(b.stars)) - Number(Boolean(a.stars)) || (b.stars || 0) - (a.stars || 0) || (a.distanceKm ?? 99) - (b.distanceKm ?? 99))
    // téměř stejné záznamy OSM („Quinta do Pinheiro“ a „Quinta do Pinheiro – Hotel Rural“ 100 m od sebe) jednou –
    // zůstane ten výš (s hvězdičkami, blíž)
    .filter((h, i, arr) => !arr.slice(0, i).some((g) => sameLodging(g, h)))
    .slice(0, max);
}

const nameKey = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Stejné ubytování dvakrát: jeden název začíná druhým (aspoň 6 znaků) a leží do 300 m od sebe. */
export function sameLodging(a, b) {
  const x = nameKey(a.name), y = nameKey(b.name);
  if (!x || !y || Math.min(x.length, y.length) < 6 || !(x.startsWith(y) || y.startsWith(x))) return false;
  return haversineKm(a.lat, a.lon, b.lat, b.lon) <= 0.3;
}

// Ukázková ubytování pro DEMO (vymyšlená, kolem bodu) – ať jde záloha projít i bez sítě.
function mockRows(lat, lon) {
  const at = (dLat, dLon) => ({ lat: String(lat + dLat), lon: String(lon + dLon) });
  return [
    { category: 'tourism', type: 'guest_house', name: 'Agriturismo Ukázkový statek', osm_type: 'node', osm_id: 1001, ...at(0.012, -0.02), extratags: {} },
    { category: 'tourism', type: 'hotel', name: 'Hotel Ukázka', osm_type: 'way', osm_id: 1002, ...at(0.002, 0.001), extratags: { stars: '3', website: 'https://example.com/hotel-ukazka' } },
    { category: 'tourism', type: 'hotel', name: 'Grand Hotel Demo', osm_type: 'node', osm_id: 1003, ...at(-0.01, 0.015), extratags: { stars: '4' } },
  ];
}

async function nominatim(q, box) {
  const qs = new URLSearchParams({ format: 'jsonv2', limit: '40', extratags: '1', bounded: '1', viewbox: box, q });
  return queue(async () => {
    try {
      return await request(`${API}?${qs}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, timeoutMs: TIMEOUT, retries: 0 });
    } finally {
      await sleep(GAP_MS); // další dotaz (i z jiného hledání) nejdřív za 1,1 s
    }
  });
}

/**
 * Ubytování do ~5 km od místa pobytu (q.lat/q.lon) z OpenStreetMap, seřazené (rankOsm). Mezipaměť týden podle polohy
 * (na 3 desetinná místa); výpadek Nominatimu 10 min → chyba (searchStays ji ukáže u zdroje). deps.fetchRows = test.
 */
export async function osmLodging(q, { fetchRows = null } = {}) {
  if (q.lat == null || q.lon == null) return [];
  const center = { lat: q.lat, lon: q.lon };
  const key = `osm:lodging:${q.lat.toFixed(3)}:${q.lon.toFixed(3)}`;
  const failed = cache.get(`${key}:fail`);
  if (failed) throw new Error(failed);
  let rows;
  try {
    rows = await cache.wrap(key, TTL, async () => {
      if (fetchRows) return fetchRows(q);
      if (config.mock) return mockRows(q.lat, q.lon);
      const box = viewbox(q.lat, q.lon);
      const out = [];
      for (const p of PHRASES) out.push(...((await nominatim(p, box)) || []));
      return out;
    });
  } catch (e) {
    const msg = `ubytování z OpenStreetMap se nepodařilo načíst – ${/^Timeout/.test(e?.message) ? 'Nominatim neodpověděl včas' : 'Nominatim teď není dostupný'}`;
    cache.set(`${key}:fail`, msg, FAIL_TTL);
    throw new Error(msg);
  }
  return rankOsm((Array.isArray(rows) ? rows : []).map((r) => mapOsm(r, q, center)));
}

export const osm = { id: 'osm', name: 'OpenStreetMap' };
