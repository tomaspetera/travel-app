// ID místa u partnerů ubytování (Trip.com, Agoda, Hostelworld): s ním odkaz z links.js rovnou ukáže nabídky
// na termín a počet hostů – bez něj Trip.com termín jen vyplní do formuláře, Agoda otevře úvodní stránku
// a Hostelworld stránku města bez dat, místo bez hostelů jeho stránku země (ověřeno 6. a 7. 10. 2026 ve skutečném
// Chromu). Na každé místo nejvýš jeden dotaz u každého partnera (bez opakování, timeout 4 s), výsledek v mezipaměti
// 30 dní, chyba nebo nečekaná odpověď 1 h. Když partner web změní, ID se nenajde a odkaz zůstane ve tvaru bez ID.
// DEMO (ATLAS_MOCK=1) a PARTNER_LOOKUP=0 = bez dotazů.
import { cache } from './cache.js';
import { request } from './http.js';
import { haversineKm } from './geo.js';
import { getAirport } from './airports.js';
import { stayPartnerKeys } from './links.js';
import { config } from '../config.js';

const TIMEOUT_MS = 4000;
const KNOWN_TTL = 30 * 864e5; // ID nalezeno i „partner místo nemá“
const UNKNOWN_TTL = 3600e3; // chyba, timeout, ochrana proti robotům, nečekaný tvar odpovědi
const ttl = (v) => (v === null ? UNKNOWN_TTL : KNOWN_TTL);
// Trip.com: stejné jméno dál od místa je jiné místo („Porto Novo“ na Kapverdách místo Beninu).
const MAX_KM = 50;
const HTML = { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

/** Dotazy na partnery – null, když se nemá na nic ptát (DEMO, PARTNER_LOOKUP=0); čte se při každém hledání. */
export function partnerLookups() {
  if (config.mock || process.env.PARTNER_LOOKUP === '0') return null;
  return { trip: tripCityId, agoda: agodaCityId, hostelworld: hostelworldCity };
}

/**
 * Trip.com: kandidáti na město z našeptávače webu (POST bez klíče; hlavička head potřebuje všech pět polí,
 * jen s locale vrací HTTP 500). → [{ id, lat, lon }] jen města (tripType „CT“) s polohou | null (nevíme).
 */
function tripCandidates(keyword, { get, timeoutMs }) {
  return cache.wrap(`trip-city:${keyword.toLowerCase()}`, ttl, async () => {
    try {
      const j = await get('https://www.trip.com/restapi/soa2/34951/getHotelKeywords', {
        method: 'POST', timeoutMs, retries: 0,
        body: { queryInfo: { keyword, actionType: 'destination' }, head: { platform: 'PC', bu: 'IBU', group: 'trip', locale: 'en-XX', currency: 'USD' } },
      });
      const list = j?.data?.mainKeywordList?.keywords;
      if (!Array.isArray(list)) return null;
      return list.map((k) => k?.keyword?.keywordContentInfo)
        .filter((c) => c?.tripType === 'CT' && Number.isInteger(c.keywordId) && c.keywordId > 0)
        .map((c) => {
          const p = (c.coordinateItemList || []).find((x) => x?.coordinateType === 'NORMAL');
          return { id: c.keywordId, lat: Number(p?.latitude), lon: Number(p?.longitude) };
        })
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon) && !(c.lat === -1 && c.lon === -1));
    } catch {
      return null;
    }
  });
}

/**
 * Trip.com: ID města (cityId) – z měst stejného jména to nejbližší k místu (ref = { lat, lon }), nejvýš 50 km.
 * Bez polohy místa se nehádá (nedá se ověřit, že jde o totéž místo). → cityId | false (nenašel) | null (nevíme)
 */
export async function tripCityId(keyword, ref, { get = request, timeoutMs = TIMEOUT_MS } = {}) {
  if (!keyword || !Number.isFinite(ref?.lat) || !Number.isFinite(ref?.lon)) return null;
  const list = await tripCandidates(keyword, { get, timeoutMs });
  if (!list) return null;
  const best = list.map((c) => ({ id: c.id, km: haversineKm(ref.lat, ref.lon, c.lat, c.lon) }))
    .filter((c) => c.km <= MAX_KM).sort((a, b) => a.km - b.km)[0];
  return best ? best.id : false;
}

/**
 * Agoda: ID města ze stránky /city/<název>-<země>.html (obyčejné GET, v HTML „defaultSearchURL“:
 * „/search?city=<ID>…“; pole „cityId“ tam je 0). Neznámou stránku Agoda přesměruje na /pagenotfound.html (404).
 * → ID | false (stránka není) | null (nevíme – chyba nebo stránka bez ID)
 */
export function agodaCityId(slug, { get = request, timeoutMs = TIMEOUT_MS } = {}) {
  if (!/^[a-z0-9-]+-[a-z]{2}$/.test(slug || '')) return Promise.resolve(null);
  return cache.wrap(`agoda-city:${slug}`, ttl, async () => {
    try {
      const html = await get(`https://www.agoda.com/city/${slug}.html`, { as: 'text', headers: HTML, timeoutMs, retries: 0 });
      const m = String(html).match(/"defaultSearchURL"\s*:\s*"[^"]*?\/search\?city=(\d{1,9})\b/);
      return m ? Number(m[1]) : null;
    } catch (e) {
      return e.status === 404 ? false : null;
    }
  });
}

/** ID města z odkazu na hledání ve stránce města Hostelworldu („/pwa/s?q=…&type=city&id=10508…“). */
function hostelworldId(html) {
  for (const m of String(html).matchAll(/\/pwa\/s\?([^"'<>\s]+)/g)) {
    const p = new URLSearchParams(m[1].replace(/&amp;/g, '&'));
    if (p.get('type') === 'city' && /^\d{1,9}$/.test(p.get('id') || '')) return Number(p.get('id'));
  }
  return null;
}

/**
 * Počet hostelů ze záhlaví stránky města („0 Hostels in Lagos, Nigeria“, „61 Hostels in Prague, Czech Republic“ –
 * vykreslené na serveru, ověřeno 7. 10. 2026 na 12 stránkách); null = záhlaví s počtem na stránce není.
 */
function hostelworldCount(html) {
  const m = String(html).match(/>\s*(\d[\d,]*)\s+Hostels?\s+in\s/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

/**
 * Hostelworld: stránka města (jedno GET místo dřívějšího HEAD; přesměrování na jiný název země projde). Menší místa
 * stránku nemají (404) a některá ji mají prázdnou – „0 Hostels in Lagos“ bez odkazu s ID a bez termínu (Lagos,
 * Porto-Novo, Abeokuta, Mikulov, Telč 10/2026): místo hostely nemá stejně jako u 404. Města s hostely odkaz s ID mají.
 * → ID | true (stránka bez ID, počet neznámý) | false (404 nebo 0 hostelů – místo nemá) | null (nevíme – chyba,
 * ochrana proti robotům)
 */
export function hostelworldCity(url, { get = request, timeoutMs = TIMEOUT_MS } = {}) {
  if (!/^https:\/\/www\.hostelworld\.com\/hostels\/[\w-]+\/[\w-]+\/[\w-]+\/$/.test(url || '')) return Promise.resolve(null);
  return cache.wrap(`hw-city:${url}`, ttl, async () => {
    try {
      const html = await get(url, { as: 'text', headers: HTML, timeoutMs, retries: 0 });
      return hostelworldId(html) ?? (hostelworldCount(html) === 0 ? false : true);
    } catch (e) {
      return e.status === 404 ? false : null;
    }
  });
}

/**
 * ID místa u partnerů pro stayLinks(q, ids): všechny dotazy souběžně, žádný hledání neshodí (chyba = null).
 * look = partnerLookups() (null → bez sítě). Poloha pro výběr města na Trip.com: místo, jinak letiště.
 */
export async function partnerIds(q, look) {
  if (!look) return {};
  const keys = stayPartnerKeys(q);
  const ap = q.iata ? getAirport(q.iata) : null;
  const ref = q.lat != null && q.lon != null ? { lat: q.lat, lon: q.lon } : ap ? { lat: ap.lat, lon: ap.lon } : null;
  const ask = async (fn, key, ...rest) => {
    if (typeof fn !== 'function' || !key) return null;
    try {
      return (await fn(key, ...rest)) ?? null;
    } catch {
      return null;
    }
  };
  const [trip, agoda, hostelworld] = await Promise.all([
    ask(look.trip, keys.trip, ref), ask(look.agoda, keys.agoda), ask(look.hostelworld, keys.hostelworld),
  ]);
  return { trip, agoda, hostelworld };
}
