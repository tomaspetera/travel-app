// Ubytování: dotaz na poskytovatele (jsou-li nastavení) + odkazy s předvyplněným hledáním.
// Řazení „nejlepší poměr“ = hodnocení očištěné o malý počet recenzí vůči ceně za noc.
import { cache } from './cache.js';
import { daysBetween, isYmd, todayYmd, addDays } from './dates.js';
import { stayLinks } from './links.js';
import { partnerIds } from './partnerids.js';
import { stayProviders } from '../providers/stays/index.js';
import { checkHotel } from '../providers/stays/xotelo.js';
import { osmLodging, osm } from '../providers/stays/osm.js';
import { getAirport, METRO_BY_CODE, COUNTRY_BY_ISO, countryAt } from './airports.js';
import { geocode, englishName } from './places.js';
import { haversineKm, normalize } from './geo.js';
import { arrivalTransfer } from './arrival.js';
import { config } from '../config.js';
import { publicMessage } from './http.js';

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
  // Letiště na ostrově („Tenerife“ → geokódování skončí uprostřed ostrova u Teide, kde TripAdvisor nemá žádné místo s hotely
  // – Tenerife Jih, Lanzarote, Gran Canaria, Rhodos vracely 0 hotelů): střed místa, kam z letiště jezdí doprava do města
  // (ověřená tabulka data/arrival.json – Los Cristianos, Arrecife, Las Palmas, město Rhodos).
  // Jen místo u letiště (do 40 km) nebo stejného jména – Memmingen (FMM → Mnichov 100 km) a Weeze (NRN → Düsseldorf)
  // hledají hotely v cíli, ne ve městě, kam jezdí autobus.
  const arr = atAirport && !metro ? arrivalTransfer(ap.iata) : null;
  const near = arr && Number.isFinite(arr.lat) && (haversineKm(ap.lat, ap.lon, arr.lat, arr.lon) <= 40 || normalize(arr.city) === normalize(city));
  const center = arr && arr.basis === 'table' && near ? arr : null;
  const adults = Math.min(9, Math.max(1, Math.round(Number(raw.adults) || 2)));
  // Děti 2–11 let a miminka do 2 let (rodina z hledání letů): spí s rodiči, pokoje se počítají jen z dospělých. Ceny
  // hotelů ze zdrojů (TripAdvisor, LiteAPI) jsou za pokoj pro dospělé – věk dětí neznáme; děti jdou do odkazů na weby.
  const children = Math.min(8, Math.max(0, Math.round(Number(raw.children)) || 0));
  const infants = Math.min(adults, Math.max(0, Math.round(Number(raw.infants)) || 0));
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
    // ID GeoNames místa vybraného v hledání (anglický název, místo na TripAdvisoru)
    gid: /^\d{1,10}$/.test(String(raw.gid ?? '')) ? String(raw.gid) : null,
    lat: hasPos ? lat : metro?.lat ?? center?.lat ?? null,
    lon: hasPos ? lon : metro?.lon ?? center?.lon ?? null,
    checkin,
    checkout,
    nights,
    adults,
    children,
    infants,
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
 * Ověření volna vybraného hotelu (Xotelo, při „Vybrat“): raw = stejný dotaz jako na nabídky + hotel (klíč TripAdvisoru
 * g…-d…), name a u hotelu z okolí near (jeho místo, nearby.city). → { available: true | false | null, … } (viz
 * checkHotel); jiný zdroj nebo DEMO → { available: null }.
 */
export async function checkStay(raw, { check = checkHotel } = {}) {
  const q = normalizeStayQuery(raw);
  const hotel = String(raw.hotel || '');
  if (!/^g\d{1,12}-d\d{1,12}$/.test(hotel)) throw new StayQueryError('Neplatný hotel.');
  const name = String(raw.name || '').slice(0, 120).trim();
  if (!name) throw new StayQueryError('Chybí název hotelu.');
  // hotel z okolí (malé místo bez hotelů na TripAdvisoru): odkazy na weby hledají hotel v jeho místě („Hotel X, Noto“)
  const near = String(raw.near || '').replace(/[\r\n\t]/g, ' ').slice(0, 80).trim();
  if (near) q.cityEn = near;
  if (!stayProviders().some((p) => p.id === 'xotelo')) return { available: null };
  return { hotel, ...(await check(hotel, name, q)), at: Date.now() };
}

export const FRESH_MS = 5 * 60e3; // „Aktualizovat ceny“ (fresh=1) na dotaz nejvýš jednou za 5 min

/**
 * raw: dotaz (normalizeStayQuery) + retry=1 („Zkusit znovu“), fresh=1 („Aktualizovat ceny“).
 * deps: english (anglický název místa), partners (dohledání ID místa u partnerů ubytování – partnerLookups()
 * z partnerids.js; null = odkazy bez ID, bez sítě: DEMO, testy, PARTNER_LOOKUP=0), lodging (ubytování v místě
 * z OpenStreetMap, osmLodging)
 */
export async function searchStays(raw, { english = englishName, partners = null, lodging = osmLodging } = {}) {
  const q = normalizeStayQuery(raw);
  const retry = String(raw.retry ?? '') === '1';
  const fresh = String(raw.fresh ?? '') === '1';
  // Místo bez anglického názvu (přidané ručně, z Wikidat bez článku): partneři i LiteAPI hledají anglicky
  // („Boloňa“ → „Bologna“) – název z geokódování v okolí místa (v mezipaměti).
  if (!raw.cityEn && !q.iata && q.city && q.lat != null && !config.mock) {
    q.cityEn = (await english(q.city, q.lat, q.lon, q.cc, q.gid).catch(() => null)) || q.cityEn;
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
  let nearbyFrom = null; // malé místo: hotely s cenou z míst TripAdvisoru v okolí (Xotelo, DEMO)
  // Ubytování v místě z OpenStreetMap (níž) – jednou na hledání; Xotelo ho rozběhne hned, jak ví, že ceny budou z okolí
  // (onNearby), souběžně se zjišťováním cen (Nominatim ~4 s, 1 dotaz za sekundu), ne až po nich.
  let osmP = null;
  const startOsm = () => {
    if (!osmP) {
      osmP = lodging(q);
      osmP.catch(() => {}); // chybu ukáže až použití níž (rozběhnuté zbytečně se neukáže)
    }
    return osmP;
  };
  await Promise.all(providers.map(async (p) => {
    const t0 = Date.now();
    try {
      // děti jen s nimi (odkazy na hotel u webů je mají v sobě), bez dětí klíč jako dřív
      const kids = q.children || q.infants ? `:${q.children}+${q.infants}` : '';
      const key = `stay:${p.id}:${q.city}:${q.lat?.toFixed(3)}:${q.lon?.toFixed(3)}:${q.checkin}:${q.checkout}:${q.adults}:${q.rooms}${kids}`;
      // neúplný výsledek (část cen nestihla přijít) jen na 5 min – další hledání doplní ceny z mezipaměti poskytovatele
      // (stejně ceny z okolí při výpadku Wikidat – retrySoon, místo se pak zkusí dohledat znovu);
      // „Zkusit znovu“ (retry=1) ho přeskočí hned (doptá se jen na chybějící ceny, ostatní jsou v mezipaměti poskytovatele)
      if (retry && cache.get(key)?.partial) cache.map.delete(key);
      const ttl = (v) => (v?.partial || v?.retrySoon ? 5 * 60e3 : 45 * 60e3);
      // „Aktualizovat ceny“ (fresh=1, jen zdroj, který to umí – Xotelo): ceny hotelů znovu, ne z mezipaměti (místo
      // a seznam hotelů z ní). Na dotaz nejvýš jednou za 5 min, jinak z mezipaměti s refreshIn (za kolik s to půjde);
      // nepovede-li se, zůstane dřívější výsledek – stale (stejně jako ceny, které aktualizovat nešlo).
      const last = fresh && p.refresh ? cache.get(`${key}:fresh`) : undefined;
      const again = fresh && Boolean(p.refresh) && !last;
      let res;
      let stale = false;
      if (again) {
        cache.set(`${key}:fresh`, Date.now(), FRESH_MS);
        const old = cache.get(key);
        try {
          res = await p.search(q, { fresh: true, onNearby: startOsm });
          cache.set(key, res, ttl(res));
          stale = res.staleAll ? 'all' : Boolean(res.stale);
        } catch (e) {
          if (!old) throw e;
          res = old;
          stale = 'all';
        }
        // nepovedlo se nic (výpadek, pojistka) – zábrana 5 min neplatí, další pokus zase hlídá pojistka zdroje
        if (stale === 'all') cache.map.delete(`${key}:fresh`);
      } else res = await cache.wrap(key, ttl, () => p.search(q, { onNearby: startOsm }));
      items.push(...res, ...(res.guesses || [])); // hotely bez ceny na tvoje dny (Xotelo) za nabídkami s cenou
      if (res.nearbyFrom?.length) nearbyFrom = res.nearbyFrom;
      status.push({
        id: p.id, name: p.name, ok: true, count: res.length, ...(res.guesses?.length ? { guesses: res.guesses.length } : {}), ms: Date.now() - t0, test: Boolean(p.testData?.()), ...(res.partial ? { partial: true } : {}),
        ...(stale ? { stale: true } : {}), ...(stale === 'all' ? { staleAll: true } : {}), ...(last ? { refreshIn: Math.max(1, Math.ceil((last + FRESH_MS - Date.now()) / 1000)) } : {}),
      });
    } catch (e) {
      status.push({ id: p.id, name: p.name, ok: false, error: publicMessage(e), ms: Date.now() - t0 }); // text chyby bez adresy API zdroje
    }
  }));
  // Malé místo, kde TripAdvisor nic nemá (Palazzolo Acreide, Alcobaça – Xotelo bez hotelů s cenou i bez nich, nebo
  // výpadek): ubytování v místě z OpenStreetMap – názvy, typ, hvězdičky a odkaz na hledání hotelu u partnera, cenu
  // uživatel ověří a zadá sám. I vedle hotelů s cenou z okolí (nearbyFrom – v místě samém TripAdvisor nic nemá, i když
  // ceny z okolí ještě přicházejí); jinak ne, když ceny ještě přicházejí (partial), a ne u LiteAPI (vlastní pokrytí).
  let osmFallback = false;
  const xoLike = providers.some((p) => p.id === 'xotelo' || p.id === 'demo');
  const inTown = items.some((h) => !h.nearby);
  if (xoLike && !inTown && q.lat != null && (nearbyFrom || !status.some((s) => s.ok && s.partial))) {
    const t0 = Date.now();
    try {
      const list = await startOsm();
      if (list.length) {
        items.push(...list);
        osmFallback = true;
        status.push({ id: osm.id, name: osm.name, ok: true, count: list.length, ms: Date.now() - t0, test: Boolean(config.mock) });
      }
    } catch (e) {
      status.push({ id: osm.id, name: osm.name, ok: false, error: publicMessage(e), ms: Date.now() - t0 });
    }
  }
  // Stejný hotel od více poskytovatelů → nech nejlevnější nabídku. Název bez diakritiky, ale s písmeny všech abeced –
  // ubytování z OpenStreetMap v Řecku nebo Srbsku mívá název jen řecky / azbukou (s [a-z0-9] by z něj nezbylo nic
  // a různá ubytování ve stejném pruhu šířky ~100 m by se sloučila do jednoho); bez názvu podle id.
  const best = new Map();
  for (const h of items) {
    const n = String(h.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
    const k = n ? `${n}|${h.lat?.toFixed(3) ?? ''}` : `id:${h.id}`;
    const prev = best.get(k);
    if (!prev || (h.priceTotalCzk || Infinity) < (prev.priceTotalCzk || Infinity)) best.set(k, h);
  }
  return {
    query: q,
    providers: status,
    items: rankStays([...best.values()]).slice(0, 60),
    ...(osmFallback ? { osmFallback: true } : {}),
    ...(nearbyFrom ? { nearbyFrom } : {}),
    links: stayLinks(q, await ids),
  };
}
