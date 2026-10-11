// Xotelo (data.xotelo.com) – neoficiální bezplatné API nad daty TripAdvisoru, bez klíče: hotely v místě s hodnocením
// a orientační ceny u Booking.com, Agody, Trip.com… na zadaný termín. Provize z něj nejsou (LiteAPI je umožní, viz README);
// kdyby přestalo fungovat, zůstanou odkazy na partnery.
//   GET /api/list?location_key=g…&sort=best_value   hotely místa TripAdvisoru (název, poloha, hodnocení 0–5, fotka)
//   GET /api/rates?hotel_key=g…-d…&chk_in&chk_out   cena za pokoj a noc u jednotlivých webů ([] = bez nabídky)
// Místo TripAdvisoru (g…) z Wikidat (P3134 TripAdvisor ID): podle ID GeoNames místa, jinak velká města z tabulky, jinak
// obce v okolí bodu. Na místo a termín 1 seznam + nejvýš 12 dotazů na ceny, vše v mezipaměti.
import { request, limiter } from '../../lib/http.js';
import { cache } from '../../lib/cache.js';
import { toCzk } from '../../lib/fx.js';
import { haversineKm } from '../../lib/geo.js';
import { affiliate, bookingSearchUrl } from '../../lib/links.js';
import { wdqs, UA } from '../../lib/poi.js';

const API = 'https://data.xotelo.com/api';
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' };
const limit = limiter(3); // seznam i ceny: nejvýš 3 dotazy na Xotelo naráz (všechna hledání dohromady)
const DAY = 864e5;
export const RADIUS_KM = 15; // hotely dál od místa pobytu se zahodí
export const MAX_RATES = 12; // ceny jen pro tolik hotelů
const LIST_LIMIT = 40;
const RATE_TIMEOUT = 10000;
const BUDGET_MS = 20000; // na ceny celkem – co nestihne, chybí (částečný výsledek)

// Velká města, jejichž položka ve Wikidatech TripAdvisor ID nemá (10/2026): [název, lat, lon, ID místa TripAdvisoru].
// Platí do 12 km od středu. Praha, Madrid, Barcelona a Amsterdam ověřené přes Xotelo, Milán a Florencie přes Wikidata;
// kdyby ID nesedělo, hotely ze seznamu budou daleko od místa a zahodí se (žádné ceny, jen odkazy).
export const TA_CITIES = [
  ['Praha', 50.0875, 14.4214, 274707], ['Brno', 49.1951, 16.6068, 274714], ['Madrid', 40.4168, -3.7038, 187514],
  ['Barcelona', 41.3874, 2.1686, 187497], ['Amsterdam', 52.3676, 4.9041, 188590], ['Varšava', 52.2297, 21.0122, 274856],
  ['Krakov', 50.0647, 19.945, 274772], ['Kodaň', 55.6761, 12.5683, 189541], ['Stockholm', 59.3293, 18.0686, 189852],
  ['Oslo', 59.9139, 10.7522, 190479], ['Riga', 56.9496, 24.1052, 274967], ['Bratislava', 48.1486, 17.1077, 274924],
  ['Lublaň', 46.0569, 14.5058, 274873], ['Bukurešť', 44.4268, 26.1025, 294458], ['Valletta', 35.8989, 14.5146, 190328],
  ['Reykjavík', 64.1466, -21.9426, 189970], ['Milán', 45.4642, 9.19, 187849], ['Florencie', 43.7696, 11.2558, 187895],
  ['Neapol', 40.8518, 14.2681, 187785], ['Hamburk', 53.5511, 9.9937, 187331], ['Istanbul', 41.0082, 28.9784, 293974],
  ['Sevilla', 37.3891, -5.9845, 187443], ['Valencie', 39.4699, -0.3763, 187529], ['Palma', 39.5696, 2.6502, 187463],
  ['Dubrovník', 42.6507, 18.0944, 295371], ['Dubaj', 25.2048, 55.2708, 295424],
];

const val = (b, k) => b?.[k]?.value;
const isTa = (v) => /^\d{2,12}$/.test(String(v ?? ''));

/** Místo TripAdvisoru velkého města z tabulky (do 12 km od středu), jinak null. */
export function seedCity(lat, lon) {
  let best = null;
  for (const [, clat, clon, id] of TA_CITIES) {
    const d = haversineKm(lat, lon, clat, clon);
    if (d <= 12 && (!best || d < best.d)) best = { d, key: `g${id}` };
  }
  return best ? best.key : null;
}

export const sparqlGeonames = (gid) => `SELECT ?ta WHERE { ?item wdt:P1566 "${gid}" ; wdt:P3134 ?ta . }`;

/**
 * Obce (P31/P279* lidské sídlo) do 20 km s číselným TripAdvisor ID + obce do 3 km s počtem obyvatel (kvůli tomu, v jak
 * velkém městě bod leží). Napřed P3134, pak typ – jinak by se typ zjišťoval u tisíců položek kolem velkoměsta.
 */
export function sparqlAround(lat, lon) {
  const c = `bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .`;
  return `SELECT ?item ?ta ?pop ?dist WHERE {
  {
    SERVICE wikibase:around { ?item wdt:P625 ?c . ${c} bd:serviceParam wikibase:radius "20" . bd:serviceParam wikibase:distance ?dist . }
    ?item wdt:P3134 ?ta . FILTER(REGEX(STR(?ta), "^[0-9]+$"))
    ?item wdt:P31/wdt:P279* wd:Q486972 .
    OPTIONAL { ?item wdt:P1082 ?pop }
  } UNION {
    SERVICE wikibase:around { ?item wdt:P625 ?c . ${c} bd:serviceParam wikibase:radius "3" . bd:serviceParam wikibase:distance ?dist . }
    ?item wdt:P1082 ?pop .
    ?item wdt:P31/wdt:P279* wd:Q486972 .
  }
} LIMIT 400`;
}

/**
 * Z řádků sparqlAround nejvýš 2 místa TripAdvisoru (g…), nejlepší napřed. Bod leží v obci = největší do 3 km; do 5 km
 * platí obec s aspoň třetinou jejích obyvatel (město samo, ne čtvrť – ta mívá v P3134 ID atrakce), dál jen větší
 * (vesnice → město v okolí; Madrid bez ID nedostane hotely Getafe).
 */
export function pickSettlements(rows) {
  const by = new Map();
  for (const b of rows || []) {
    const id = val(b, 'item');
    if (!id) continue;
    const e = by.get(id) || { ta: null, pop: 0, dist: Infinity };
    const ta = val(b, 'ta');
    if (!e.ta && isTa(ta)) e.ta = ta;
    const pop = Number(val(b, 'pop'));
    if (pop > e.pop) e.pop = pop;
    const d = Number(val(b, 'dist'));
    if (d < e.dist) e.dist = d;
    by.set(id, e);
  }
  const all = [...by.values()];
  const host = Math.max(0, ...all.filter((e) => e.dist <= 3).map((e) => e.pop));
  return all
    .filter((e) => e.ta && (e.dist <= 5 ? e.pop >= host / 3 : e.pop > 0 && e.pop >= host))
    .sort((a, b) => Number(b.dist <= 5) - Number(a.dist <= 5) || b.pop - a.pop || a.dist - b.dist)
    .map((e) => `g${e.ta}`)
    .filter((k, i, a) => a.indexOf(k) === i)
    .slice(0, 2);
}

export const locationCacheKey = (q) => {
  const gid = /^\d{1,10}$/.test(String(q.gid ?? '')) ? String(q.gid) : null;
  if (gid) return `xo:loc:gid:${gid}`;
  return q.lat != null && q.lon != null ? `xo:loc:${q.lat.toFixed(2)}:${q.lon.toFixed(2)}` : null;
};

/**
 * Kandidáti na místo TripAdvisoru (nejvýš 2): podle ID GeoNames (P1566 → P3134), město z tabulky, obce v okolí bodu.
 * Mezipaměť 30 dní, „nic“ 1 den; výpadek Wikidat se neukládá (příště znovu). deps.sparql = dotaz na Wikidata.
 */
export async function locationKeys(q, { sparql = wdqs } = {}) {
  const ck = locationCacheKey(q);
  if (!ck) return [];
  return cache.wrap(ck, (v) => (v.length ? 30 * DAY : DAY), async () => {
    const gid = ck.startsWith('xo:loc:gid:') ? ck.slice(11) : null;
    const pos = q.lat != null && q.lon != null;
    const seed = pos ? seedCity(q.lat, q.lon) : null;
    let err = null;
    const fail = (e) => { err = err || e; return null; };
    const [byId, near] = await Promise.all([
      gid ? sparql(sparqlGeonames(gid), 10000).then((rows) => (rows || []).map((b) => val(b, 'ta')).find(isTa) || null, fail) : null,
      pos && !seed ? sparql(sparqlAround(q.lat, q.lon), 15000).then(pickSettlements, fail) : [],
    ]);
    const out = [...new Set([byId && `g${byId}`, seed, ...(near || [])].filter(Boolean))].slice(0, 2);
    if (!out.length && err) throw err;
    return out;
  });
}

/** Hotely místa TripAdvisoru podle nejlepšího poměru (mezipaměť 24 h, prázdný seznam 6 h). */
export async function hotelList(key) {
  return cache.wrap(`xo:list:${key}`, (v) => (v.length ? DAY : 6 * 3600e3), async () => {
    const qs = new URLSearchParams({ location_key: key, limit: String(LIST_LIMIT), sort: 'best_value' });
    let j;
    try {
      j = await limit(() => request(`${API}/list?${qs}`, { headers: HEADERS, timeoutMs: 12000, retries: 1 }));
    } catch (e) {
      if (e.status >= 400 && e.status < 500 && e.status !== 429) return []; // neznámé místo
      throw e;
    }
    return Array.isArray(j?.result?.list) ? j.result.list : [];
  });
}

export const ratesKey = (hotelKey, q) => `xo:rates:${hotelKey}:${q.checkin}:${q.checkout}:${q.adults}:${q.rooms}`;

/**
 * Ceny hotelu u webů: { currency, rates: [{ code, name, rate, tax }] } – rate (+ tax) za pokoj a noc. Mezipaměť 6 h
 * podle hotelu, termínu, dospělých a pokojů. Dotaz, který by začal po termínu deadline, se nepošle (chyba, neukládá se).
 */
export async function hotelRates(hotelKey, q, deadline = Infinity) {
  return cache.wrap(ratesKey(hotelKey, q), 6 * 3600e3, () => limit(async () => {
    const left = deadline - Date.now();
    if (left < 500) throw new Error('ceny nestihly přijít');
    const qs = new URLSearchParams({ hotel_key: hotelKey, chk_in: q.checkin, chk_out: q.checkout, currency: 'EUR', adults: String(q.adults), rooms: String(q.rooms) });
    let j;
    try {
      j = await request(`${API}/rates?${qs}`, { headers: HEADERS, timeoutMs: Math.min(RATE_TIMEOUT, left), retries: 0 });
    } catch (e) {
      if (e.status >= 400 && e.status < 500 && e.status !== 429) return { currency: 'EUR', rates: [] };
      throw e;
    }
    const r = j?.result || {};
    const rates = (Array.isArray(r.rates) ? r.rates : [])
      .filter((x) => Number(x?.rate) > 0)
      .map((x) => ({ code: String(x.code || ''), name: String(x.name || x.code || ''), rate: Number(x.rate), tax: Number(x.tax) > 0 ? Number(x.tax) : 0 }));
    return { currency: String(r.currency || 'EUR').toUpperCase(), rates };
  }));
}

// Názvy webů pro chipy s cenou (ostatní jak je posílá TripAdvisor): web hotelu česky, „Agoda.com“ → „Agoda“.
const otaName = (n) => (/^(official (hotel|site|website)|hotel website)$/i.test(n.trim()) ? 'web hotelu' : n === 'Agoda.com' ? 'Agoda' : n);

/** Nabídky webů v Kč za celý pobyt (sazba za pokoj a noc × pokoje × noci), nejlevnější první; web dvakrát → levnější. */
export function offers(rr, q) {
  const best = new Map();
  for (const r of rr?.rates || []) {
    const total = toCzk((r.rate + (r.tax || 0)) * q.rooms * q.nights, rr.currency || 'EUR');
    if (!(total > 0)) continue;
    const name = otaName(r.name);
    if (!best.has(name) || total < best.get(name).totalCzk) best.set(name, { code: r.code, name, totalCzk: total, perNightCzk: Math.round(total / q.nights) });
  }
  return [...best.values()].sort((a, b) => a.totalCzk - b.totalCzk);
}

// Typ ubytování z TripAdvisoru → [skupina pro filtr, štítek] (skupiny jako u ostatních zdrojů).
const TYPES = {
  hotel: ['hotel', 'hotel'], 'small hotel': ['hotel', 'malý hotel'], motel: ['hotel', 'motel'], resort: ['hotel', 'resort'],
  'bed and breakfast': ['penzion', 'B&B'], 'specialty inn': ['penzion', 'penzion'], inn: ['penzion', 'penzion'],
  'guest house': ['penzion', 'penzion'], guesthouse: ['penzion', 'penzion'], hostel: ['hostel', 'hostel'],
  'vacation rental': ['apartmán', 'apartmán'], apartment: ['apartmán', 'apartmán'], condo: ['apartmán', 'apartmán'],
};
const typeOf = (t) => TYPES[String(t || '').trim().toLowerCase()] || ['ubytování', 'ubytování'];

// Fotky z CDN TripAdvisoru jsou v plné velikosti – na kartu stačí zmenšená.
function photoUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return null;
    if (url.hostname === 'dynamic-media-cdn.tripadvisor.com' && !url.search) url.search = '?w=400&h=-1&s=1';
    return url.href;
  } catch {
    return null;
  }
}
const taUrl = (u) => (/^https:\/\/www\.tripadvisor\.[a-z.]+\//.test(String(u || '')) ? String(u) : null);

/** Hotel ze seznamu → Stay (viz stays/index.js); bez ceny null. */
export function mapHotel(h, rr, q, center) {
  const of = offers(rr, q);
  if (!of.length) return null;
  const lat = Number(h.geo?.latitude);
  const lon = Number(h.geo?.longitude);
  const pos = Number.isFinite(lat) && Number.isFinite(lon);
  const r5 = Number(h.review_summary?.rating);
  const [type, typeLabel] = typeOf(h.accommodation_type);
  const labels = (h.merchandising_labels || []).map((x) => String(x?.text ?? x));
  return {
    id: `xo:${h.key}`,
    provider: 'xotelo',
    name: String(h.name),
    type,
    typeLabel,
    stars: null,
    rating: r5 > 0 ? Math.round(Math.min(5, r5) * 20) / 10 : null, // 0–10 jako ostatní zdroje
    rating5: r5 > 0 ? Math.min(5, r5) : null, // původní hodnocení TripAdvisoru 0–5
    reviews: Number(h.review_summary?.count) || 0,
    reviewsUrl: taUrl(h.url),
    address: '',
    lat: pos ? lat : null,
    lon: pos ? lon : null,
    distanceKm: center && pos ? Math.round(haversineKm(center.lat, center.lon, lat, lon) * 10) / 10 : null,
    photo: h.image ? photoUrl(h.image) : null,
    priceTotalCzk: of[0].totalCzk,
    pricePerNightCzk: of[0].perNightCzk,
    rates: of.slice(0, 6).map(({ name, totalCzk, perNightCzk }) => ({ name, totalCzk, perNightCzk })),
    freeCancellation: null,
    breakfast: labels.some((x) => /breakfast included/i.test(x)) ? true : null,
    bookUrl: affiliate(bookingSearchUrl(String(h.name), q.cityEn || q.city, q), 'booking'),
  };
}

/** Hotely ze seznamu do RADIUS_KM od místa pobytu (je-li známé), s recenzemi a platným klíčem, bez opakování. */
export function candidates(list, center, radiusKm = RADIUS_KM) {
  const out = [];
  const seen = new Set();
  for (const h of list || []) {
    if (!h?.name || !/^g\d+-d\d+$/.test(String(h.key || '')) || seen.has(h.key)) continue;
    if (!(Number(h.review_summary?.count) > 0)) continue;
    if (center) {
      const lat = Number(h.geo?.latitude);
      const lon = Number(h.geo?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || haversineKm(center.lat, center.lon, lat, lon) > radiusKm) continue;
    }
    seen.add(h.key);
    out.push(h);
  }
  return out;
}

/** Pro které hotely zjistit ceny: první 2/3 podle nejlepšího poměru (pořadí TripAdvisoru), zbytek nejlevnější podle ceníku. */
export function chooseForRates(pool, n = MAX_RATES) {
  const first = pool.slice(0, Math.ceil((n * 2) / 3));
  const min = (h) => Number(h.price_ranges?.minimum) || Infinity;
  const rest = pool.slice(first.length).sort((a, b) => min(a) - min(b));
  return [...first, ...rest].slice(0, n);
}

/**
 * Hotely s cenou pro dotaz q (normalizeStayQuery). deps: sparql (Wikidata), budgetMs (rozpočet na ceny). Výsledek
 * seřazený od nejlevnějšího; nestihly-li všechny ceny, má příznak partial (kratší mezipaměť v searchStays).
 */
export async function searchXotelo(q, { sparql = wdqs, budgetMs = BUDGET_MS } = {}) {
  const center = q.lat != null && q.lon != null ? { lat: q.lat, lon: q.lon } : null;
  let pool = [];
  for (const key of await locationKeys(q, { sparql })) {
    pool = candidates(await hotelList(key), center);
    if (pool.length) break; // jinak další kandidát (ID atrakce místo města, ID z tabulky nesedí)
  }
  if (!pool.length) return [];
  const pick = chooseForRates(pool);
  const deadline = Date.now() + budgetMs;
  const got = new Map();
  const errors = [];
  const jobs = pick.map((h) => hotelRates(h.key, q, deadline).then((rr) => { got.set(h.key, rr); }, (e) => { errors.push(e); }));
  let timer;
  await Promise.race([Promise.all(jobs), new Promise((r) => { timer = setTimeout(r, budgetMs + 500); })]);
  clearTimeout(timer);
  if (!got.size && errors.length) throw errors[0];
  const out = pick.map((h) => (got.has(h.key) ? mapHotel(h, got.get(h.key), q, center) : null)).filter(Boolean);
  out.sort((a, b) => a.priceTotalCzk - b.priceTotalCzk);
  if (got.size < pick.length) out.partial = true;
  return out;
}

export const xotelo = {
  id: 'xotelo',
  name: 'TripAdvisor (Xotelo)',
  search: (q) => searchXotelo(q),
  // ostrý test (/api/diag): jeden malý seznam hotelů ve Vídni, bez mezipaměti
  async probe() {
    const j = await limit(() => request(`${API}/list?location_key=g190454&limit=3&sort=popularity`, { headers: HEADERS, timeoutMs: 12000, retries: 0 }));
    const n = j?.result?.list?.length || 0;
    if (!n) throw new Error(j?.error ? `Xotelo: ${JSON.stringify(j.error).slice(0, 120)}` : 'Xotelo: prázdný seznam hotelů');
    return `${n} hotely ve Vídni (TripAdvisor, ${j.result.total_count ?? '?'} celkem)`;
  },
};
