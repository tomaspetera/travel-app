// Ubytování: dotaz na poskytovatele (jsou-li nastavení) + odkazy s předvyplněným hledáním.
// Řazení „nejlepší poměr“ = hodnocení očištěné o malý počet recenzí vůči ceně za noc.
import { cache } from './cache.js';
import { daysBetween, isYmd, todayYmd, addDays } from './dates.js';
import { stayLinks } from './links.js';
import { partnerIds } from './partnerids.js';
import { stayProviders } from '../providers/stays/index.js';
import { getAirport, METRO_BY_CODE, COUNTRY_BY_ISO, countryAt } from './airports.js';
import { geocode, englishName } from './places.js';
import { haversineKm } from './geo.js';
import { config } from '../config.js';

export class StayQueryError extends Error {
  constructor(msg) {
    super(msg);
    this.status = 400;
  }
}

export function normalizeStayQuery(raw = {}) {
  const checkin = String(raw.checkin || '');
  const checkout = String(raw.checkout || '');
  if (!isYmd(checkin) || !isYmd(checkout)) throw new StayQueryError('Chybí datum příjezdu nebo odjezdu.');
  if (checkin < addDays(todayYmd(), -1)) throw new StayQueryError('Datum příjezdu je v minulosti.');
  const nights = daysBetween(checkin, checkout);
  if (nights < 1 || nights > 45) throw new StayQueryError('Pobyt musí mít 1 až 45 nocí.');
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const city = String(raw.city || '').slice(0, 80).trim();
  if (!city && !(Number.isFinite(lat) && Number.isFinite(lon))) throw new StayQueryError('Chybí cílové město.');
  const ap = getAirport(raw.iata);
  const metro = ap?.metro ? METRO_BY_CODE.get(ap.metro) : null;
  // Poloha = souřadnice samotného letiště (cíl mimo metropoli) → nepoužít, vzdálenost hotelů se
  // má měřit od centra města (dopočte se geokódováním v searchStays).
  const atAirport = ap && Number.isFinite(lat) && Number.isFinite(lon) && haversineKm(lat, lon, ap.lat, ap.lon) < 1.5;
  const hasPos = Number.isFinite(lat) && Number.isFinite(lon) && raw.lat !== '' && raw.lat != null && raw.lon !== '' && raw.lon != null && !atAirport;
  const adults = Math.min(9, Math.max(1, Math.round(Number(raw.adults) || 2)));
  // Pokoje: zadané (nejvýš tolik, kolik je dospělých), jinak po dvou na pokoj.
  const rooms = Math.min(adults, 5, Math.max(1, Math.round(Number(raw.rooms) || Math.ceil(adults / 2))));
  // Země: zadaná, letiště, jinak podle polohy (místo trasy z Wikidat nebo přidané ručně) – bez ní LiteAPI
  // nehledá a odkazy na partnery neznají zemi.
  const ccIn = String(raw.cc || '').toUpperCase();
  const pos = raw.lat !== '' && raw.lat != null && raw.lon !== '' && raw.lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  const cc = /^[A-Z]{2}$/.test(ccIn) ? ccIn : ap?.cc || (pos ? countryAt(lat, lon) : '');
  return {
    city,
    cityEn: String(raw.cityEn || metro?.en || ap?.city || city).slice(0, 80),
    country: String(raw.country || COUNTRY_BY_ISO.get(cc)?.cs || '').slice(0, 60),
    cc,
    iata: ap?.iata || null,
    lat: hasPos ? lat : metro?.lat ?? null,
    lon: hasPos ? lon : metro?.lon ?? null,
    checkin,
    checkout,
    nights,
    adults,
    rooms,
  };
}

/** Hodnocení 0–10 očištěné o počet recenzí (Bayesovský průměr k 7,5 s vahou 30 recenzí). */
export function adjustedRating(rating, reviews) {
  if (rating == null || !Number.isFinite(rating)) return null;
  const n = Math.max(0, reviews || 0);
  return (rating * n + 7.5 * 30) / (n + 30);
}

/**
 * Doplní value (0–100), štítky a seřadí podle nejlepšího poměru.
 * Poměr = (očištěné hodnocení − 5) − ln(cena / medián ceny): každý bod hodnocení vyváží
 * zhruba 2,7× vyšší cenu, takže levné-ale-slabé ani drahé-ale-skvělé nevyhrávají samy od sebe.
 */
export function rankStays(items) {
  for (const h of items) h.adjRating = adjustedRating(h.rating, h.reviews);
  const prices = items.map((h) => h.pricePerNightCzk).filter((p) => p > 0).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const raw = (h) => (h.adjRating == null || !(h.pricePerNightCzk > 0) ? null : (h.adjRating - 5) - Math.log(h.pricePerNightCzk / median));
  const vals = items.map(raw).filter((v) => v != null);
  const max = vals.length ? Math.max(...vals) : 0;
  const min = vals.length ? Math.min(...vals) : 0;
  for (const h of items) {
    const v = raw(h);
    h.value = v == null ? null : Math.round(((v - min) / (max - min || 1)) * 100);
    h.badges = [];
  }
  const priced = items.filter((h) => h.pricePerNightCzk > 0);
  const byValue = [...items].filter((h) => h.value != null).sort((a, b) => b.value - a.value);
  if (byValue[0]) byValue[0].badges.push('best-value');
  const goodCheap = priced.filter((h) => (h.rating ?? 0) >= 8).sort((a, b) => a.pricePerNightCzk - b.pricePerNightCzk)[0];
  if (goodCheap) goodCheap.badges.push('cheapest-good');
  const cheapest = [...priced].sort((a, b) => a.pricePerNightCzk - b.pricePerNightCzk)[0];
  if (cheapest) cheapest.badges.push('cheapest');
  const top = [...items].filter((h) => h.adjRating != null && (h.reviews || 0) >= 20).sort((a, b) => b.adjRating - a.adjRating)[0];
  if (top) top.badges.push('top-rated');
  return items.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || (a.pricePerNightCzk ?? Infinity) - (b.pricePerNightCzk ?? Infinity));
}

/**
 * deps: english (anglický název místa), partners (dohledání ID místa u partnerů ubytování – partnerLookups()
 * z partnerids.js; null = odkazy bez ID, bez sítě: DEMO, testy, PARTNER_LOOKUP=0)
 */
export async function searchStays(raw, { english = englishName, partners = null } = {}) {
  const q = normalizeStayQuery(raw);
  // Místo bez anglického názvu (přidané ručně, z Wikidat bez článku): partneři i LiteAPI hledají anglicky
  // („Boloňa“ → „Bologna“) – název z geokódování v okolí místa (v mezipaměti).
  if (!raw.cityEn && !q.iata && q.city && q.lat != null && !config.mock) {
    const gid = /^\d{1,10}$/.test(String(raw.gid ?? '')) ? String(raw.gid) : null;
    q.cityEn = (await english(q.city, q.lat, q.lon, q.cc, gid).catch(() => null)) || q.cityEn;
  }
  // ID místa u partnerů (Trip.com, Agoda, Hostelworld) se dohledá souběžně s hledáním hotelů – každý dotaz nejvýš
  // 4 s, chyba nic neshodí (odkaz pak zůstane bez ID).
  const ids = partnerIds(q, partners).catch(() => ({}));
  // Ceny hotelů API vrací nejvýš pro 30 nocí; delší pobyt → jen odkazy na partnery.
  const providers = q.nights <= 30 ? stayProviders() : [];
  // Střed města kvůli vzdálenosti hotelů (u metropolí známe z databáze, jinak geokódování).
  if (q.lat == null && providers.length && q.city) {
    try {
      const g = (await geocode(q.city)).find((x) => !q.cc || String(x.cc || '').toUpperCase() === q.cc);
      if (g) { q.lat = g.lat; q.lon = g.lon; }
    } catch { /* bez vzdálenosti */ }
  }
  if (q.lat == null && q.iata) {
    const ap = getAirport(q.iata);
    q.lat = ap.lat; q.lon = ap.lon;
  }
  const status = [];
  const items = [];
  await Promise.all(providers.map(async (p) => {
    const t0 = Date.now();
    try {
      const key = `stay:${p.id}:${q.city}:${q.lat?.toFixed(3)}:${q.lon?.toFixed(3)}:${q.checkin}:${q.checkout}:${q.adults}:${q.rooms}`;
      const res = await cache.wrap(key, 45 * 60e3, () => p.search(q));
      items.push(...res);
      status.push({ id: p.id, name: p.name, ok: true, count: res.length, ms: Date.now() - t0, test: Boolean(p.testData?.()) });
    } catch (e) {
      status.push({ id: p.id, name: p.name, ok: false, error: e.message || String(e), ms: Date.now() - t0 });
    }
  }));
  // Stejný hotel od více poskytovatelů → nech nejlevnější nabídku.
  const best = new Map();
  for (const h of items) {
    const k = `${h.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}|${h.lat?.toFixed(3) ?? ''}`;
    const prev = best.get(k);
    if (!prev || (h.priceTotalCzk || Infinity) < (prev.priceTotalCzk || Infinity)) best.set(k, h);
  }
  return {
    query: q,
    providers: status,
    items: rankStays([...best.values()]).slice(0, 60),
    links: stayLinks(q, await ids),
  };
}
