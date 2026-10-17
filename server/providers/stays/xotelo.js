// Xotelo (data.xotelo.com) – neoficiální bezplatné API nad daty TripAdvisoru, bez klíče: hotely v místě s hodnocením
// a orientační ceny u Booking.com, Agody, Trip.com… na zadaný termín. Provize z něj nejsou (LiteAPI je umožní, viz README);
// kdyby přestalo fungovat, zůstanou odkazy na partnery.
//   GET /api/list?location_key=g…&sort=best_value   hotely místa TripAdvisoru (název, poloha, hodnocení 0–5, fotka)
//   GET /api/rates?hotel_key=g…-d…&chk_in&chk_out   cena za pokoj a noc u jednotlivých webů ([] = bez nabídky)
// Místo TripAdvisoru (g…) z Wikidat (P3134 TripAdvisor ID): podle ID GeoNames místa, velká města z tabulky, podle názvu
// místa v okolí bodu (rychlé), teprve pak obce v okolí bodu (pomalý dotaz). Na místo a termín 1 seznam + nejvýš 12 dotazů
// na ceny, vše v mezipaměti; při výpadku Xotela se na chvíli vynechá (pojistka), ať hledání nečeká na timeouty.
// Odkaz hotelu vede na web nejlevnější nabídky (Booking.com, Trip.com, Hotels.com, Expedia); u webů bez spolehlivého
// odkazu na hotel (Agoda, Vio, web hotelu…) na Google Hotels s živými cenami hotelu u všech webů.
import { request, limiter } from '../../lib/http.js';
import { cache } from '../../lib/cache.js';
import { toCzk } from '../../lib/fx.js';
import { haversineKm } from '../../lib/geo.js';
import { affiliate, affiliateOn, bookingSearchUrl, tripSearchUrl, expediaSearchUrl, googleHotelsUrl } from '../../lib/links.js';
import { wdqs, UA } from '../../lib/poi.js';

const API = 'https://data.xotelo.com/api';
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' };
const limit = limiter(16); // všechna hledání dohromady nejvýš 16 dotazů na Xotelo naráz
// jedno hledání všech 12 hotelů naráz – ceny hotelu trvají 3,5–13 s (živě 10/2026: 12 naráz za 13 s, stejně rychle jako
// jeden), se 3 naráz stihlo hledání do rozpočtu jen pár hotelů; souběžná hledání se ve frontě střídají
const PER_SEARCH = 12;
const limitWd = limiter(2); // vlastní fronta na Wikidata: krátké dotazy nečekají za dlouhými dotazy Objevuj (poi.js)
const wd = (query, ms) => wdqs(query, ms, { queue: limitWd });
const DAY = 864e5;
export const RADIUS_KM = 15; // hotely dál od místa pobytu se zahodí
export const MAX_RATES = 12; // ceny jen pro tolik hotelů
export const GUESS_MAX = 12; // hotelů bez ceny na tvoje dny (orientačně, za hotely s cenou) nejvýš tolik
const LIST_LIMIT = 40;
const LIST_TIMEOUT = 10000;
const RATE_TIMEOUT = 15000; // časté odpovědi za 11,5 a 13 s – s 10 s by se ztratily
// na ceny celkem (od prvního volného místa ve frontě) – co nestihne, chybí (částečný výsledek); průvodce si zbytek
// dotáhne sám dalším dotazem (hotové ceny jsou v mezipaměti), první hotely tak uvidí dřív
const BUDGET_MS = 15000;
export const RATES_TTL = 2 * 3600e3; // ceny hotelu 2 h – TripAdvisor sám zaostává a hotel se mezitím může vyprodat
// Prázdné ceny po dlouhém čekání = Xotelo nestihl TripAdvisor, ne vyprodáno: u hotelu a termínu, na který se zatím nikdo
// neptal, běžné (živě 10/2026: po 9–13 s [], úspěšný první dotaz 3–5 s, uložený do 1 s) – co se jednou podaří, má Xotelo
// uložené. Takové [] (slow) se skoro nepamatuje a hledání je neúplné (partial), další dotaz to zkusí znovu; rychlé [] =
// opravdu bez nabídky (RATES_TTL).
export const EMPTY_SLOW_MS = 8000;
export const EMPTY_TTL = 1000;
const AROUND_TIMEOUT = 35000; // obce v okolí bodu: těžký dotaz (živě 3–21 s)
const FAIL_TTL = 10 * 60e3; // výpadek Wikidat: místo se 10 min znovu nedohledává

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

// Název místa pro dotaz podle popisku: bez upřesnění za čárkou, bez uvozovek a zpětných lomítek (řetězec SPARQL).
const labelOf = (x) => String(x || '').split(',')[0].replace(/["\\\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Názvy místa pro sparqlNames: anglický (cityEn) a český (city), bez opakování. */
export function placeNames(q) {
  const out = [];
  for (const [n, lang] of [[labelOf(q.cityEn), 'en'], [labelOf(q.city), 'cs']]) {
    if (n && !out.some((x) => x[0] === n && x[1] === lang)) out.push([n, lang]);
  }
  return out;
}

/**
 * Položky s TripAdvisor ID a polohou podle přesného názvu (anglicky „Lisbon“, česky „Lisabon“) – index popisků,
 * živě kolem 1 s i pro velkoměsta (dotaz na okolí bodu tam trvá 3–21 s).
 */
export function sparqlNames(names) {
  const vals = names.map(([n, lang]) => `"${n}"@${lang}`).join(' ');
  return `SELECT ?item ?ta ?c ?pop WHERE { VALUES ?l { ${vals} } ?item rdfs:label ?l ; wdt:P3134 ?ta ; wdt:P625 ?c . OPTIONAL { ?item wdt:P1082 ?pop } } LIMIT 200`;
}

/**
 * Z řádků sparqlNames nejvýš 2 místa TripAdvisoru do 25 km od bodu: obec (s počtem obyvatel) napřed, pak nejbližší –
 * Lisabon (Q597, 1,6 km) před stejnojmenným okresem (4 km), Paříž ve Francii, ne v Texasu.
 */
export function pickByName(rows, lat, lon) {
  const by = new Map();
  for (const b of rows || []) {
    const ta = val(b, 'ta');
    const m = /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/.exec(String(val(b, 'c') || ''));
    if (!isTa(ta) || !m) continue;
    const d = haversineKm(lat, lon, Number(m[2]), Number(m[1]));
    if (!(d <= 25)) continue;
    const e = { ta, d, pop: Number(val(b, 'pop')) > 0 };
    const prev = by.get(ta);
    if (!prev || e.pop > prev.pop || (e.pop === prev.pop && d < prev.d)) by.set(ta, e);
  }
  return [...by.values()].sort((a, b) => Number(b.pop) - Number(a.pop) || a.d - b.d).slice(0, 2).map((e) => `g${e.ta}`);
}

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

/** Mezipaměť dohledání místa: nalezené 30 dní, „nic“ 1 den, výpadek Wikidat 10 min (ať další hledání nečeká znovu). */
async function cachedLookup(ck, fn) {
  const failed = cache.get(`${ck}:fail`);
  if (failed) throw new Error(failed);
  try {
    return await cache.wrap(ck, (v) => (v.length ? 30 * DAY : DAY), fn);
  } catch (e) {
    cache.set(`${ck}:fail`, e.message, FAIL_TTL);
    throw e;
  }
}

// Chyba Wikidat česky (ukazuje se pod odkazy jako chyba zdroje).
const wdError = (e) => new Error(`místo na TripAdvisoru se nepodařilo dohledat – Wikidata ${/^Timeout/.test(e?.message) ? 'neodpověděla včas' : 'teď nejsou dostupná'}`);

/** Obce v okolí bodu s TripAdvisor ID (sparqlAround, pomalý dotaz) – nejvýš 2 místa, vlastní mezipaměť. */
export async function nearbyKeys(q, { sparql = wd } = {}) {
  if (q.lat == null || q.lon == null) return [];
  return cachedLookup(`xo:near:${q.lat.toFixed(2)}:${q.lon.toFixed(2)}`, () => sparql(sparqlAround(q.lat, q.lon), AROUND_TIMEOUT).then(pickSettlements, (e) => { throw wdError(e); }));
}

/**
 * Kandidáti na místo TripAdvisoru (nejvýš 2), od nejlevnějšího dotazu: podle ID GeoNames (P1566 → P3134), město
 * z tabulky, podle názvu místa do 25 km (index popisků, ~1 s); teprve když nic z toho, obce v okolí bodu (nearbyKeys).
 * Mezipaměť viz cachedLookup. deps.sparql = dotaz na Wikidata.
 */
export async function locationKeys(q, { sparql = wd } = {}) {
  const ck = locationCacheKey(q);
  if (!ck) return [];
  return cachedLookup(ck, async () => {
    const gid = ck.startsWith('xo:loc:gid:') ? ck.slice(11) : null;
    const pos = q.lat != null && q.lon != null;
    let err = null;
    const fail = (e) => { err = err || e; return null; };
    const byId = gid ? await sparql(sparqlGeonames(gid), 10000).then((rows) => (rows || []).map((b) => val(b, 'ta')).find(isTa) || null, fail) : null;
    const seed = pos ? seedCity(q.lat, q.lon) : null;
    let out = [...new Set([byId && `g${byId}`, seed].filter(Boolean))];
    if (out.length) return out;
    const names = pos ? placeNames(q) : [];
    if (names.length) out = (await sparql(sparqlNames(names), 10000).then((rows) => pickByName(rows, q.lat, q.lon), fail)) || [];
    if (out.length || !pos) {
      if (!out.length && err) throw wdError(err);
      return out;
    }
    const near = await nearbyKeys(q, { sparql }).catch((e) => { throw err ? wdError(err) : e; });
    if (!near.length && err) throw wdError(err); // „nic“ jen kvůli chybě dřívějšího dotazu se na den neukládá
    return near;
  });
}

// Pojistka proti výpadku Xotela (jako u Kiwi): po 429 (na dobu z Retry-After), 401/403 (API odmítá dotazy), po chybě
// seznamu hotelů nebo po 3 chybách cen za sebou (timeout, 5xx, síť) se Xotelo na chvíli vynechá – hledání pak hned vrátí
// odkazy na partnery (a co je v mezipaměti) místo čekání na timeouty a dalších dotazů na API, které už omezuje.
const breaker = { until: 0, fails: 0, trips: 0, why: '' };
export const xoteloBlocked = () => Date.now() < breaker.until;
/** Za kolik sekund se Xotelo zase zkusí (0 = hned). */
export const xoteloRetryAfter = () => Math.max(0, Math.ceil((breaker.until - Date.now()) / 1000));
export const xoteloBlockReason = () => (xoteloBlocked() ? breaker.why : '');
/** Vynulování pojistky (testy). */
export function resetXoteloBreaker() {
  Object.assign(breaker, { until: 0, fails: 0, trips: 0, why: '' });
}
function trip(ms, why) {
  breaker.until = Math.max(breaker.until, Date.now() + ms);
  breaker.why = why;
  breaker.fails = 0;
}

/** Chyba Xotela česky a bez adresy (ukazuje se pod odkazy jako chyba zdroje). */
export function xoMessage(e) {
  const s = e?.status;
  if (s === 429) return 'omezuje počet dotazů (HTTP 429)';
  if (s === 401 || s === 403) return `odmítá dotazy (HTTP ${s})`;
  if (s >= 500) return `má výpadek (HTTP ${s})`;
  if (s) return `chyba HTTP ${s}`;
  if (/^Timeout/.test(e?.message || '')) return 'neodpověděl včas';
  return 'není dostupný (chyba sítě)';
}
const late = () => Object.assign(new Error('ceny nestihly přijít'), { late: true });

/**
 * Dotaz na Xotelo přes pojistku. 400/404 → null (neznámé místo / hotel; neznámé ID ale Xotelo vrací 200 s prázdným
 * seznamem). list = seznam hotelů (jediný dotaz hledání – chyba hned vynechá Xotelo); short = timeout zkrácený
 * rozpočtem hledání (jeho vypršení není výpadek).
 */
async function xoGet(url, timeoutMs, { list = false, short = false } = {}) {
  if (xoteloBlocked()) {
    throw Object.assign(new Error(`${breaker.why} – teď se vynechává, další pokus za ${Math.max(1, Math.round(xoteloRetryAfter() / 60))} min`), { blocked: true });
  }
  let j;
  try {
    j = await request(url, { headers: HEADERS, timeoutMs, retries: 0 });
  } catch (e) {
    const s = e.status;
    if (s === 400 || s === 404) return null;
    if (short && !s && /^Timeout/.test(e.message)) throw late();
    if (s === 429) trip(Math.min(15 * 60e3, Math.max(30e3, (e.retryAfter || 300) * 1000)), xoMessage(e));
    else if (s === 401 || s === 403) trip(30 * 60e3, xoMessage(e));
    else if (!s || s >= 500) {
      if (list || ++breaker.fails >= 3) trip(Math.min(10, 2 * 2 ** breaker.trips++) * 60e3, xoMessage(e));
    }
    throw Object.assign(new Error(xoMessage(e)), { status: s });
  }
  // 200 s chybou serveru v těle ({ error: { status_code: 500 } } – živě 10/2026 při výpadku Xotela, po ~11 s) = výpadek
  // jako HTTP 5xx: pojistka, ať další hledání hned nabídne partnery místo čekání na další timeouty
  const bad = Number(j?.error?.status_code);
  if (bad >= 500) {
    if (list || ++breaker.fails >= 3) trip(Math.min(10, 2 * 2 ** breaker.trips++) * 60e3, xoMessage({ status: bad }));
    throw Object.assign(new Error(xoMessage({ status: bad })), { status: bad });
  }
  breaker.fails = 0;
  breaker.trips = 0;
  // 200 s jinou chybou (změněné nebo omezené API) – chyba se neukládá, na pojistku nemá vliv
  if (j?.error) throw new Error(`vrátil chybu: ${String(j.error.message || JSON.stringify(j.error)).slice(0, 80)}`);
  return j;
}

/** Hotely místa TripAdvisoru podle nejlepšího poměru (mezipaměť 24 h, prázdný seznam 6 h; chyba se neukládá). */
export async function hotelList(key) {
  return cache.wrap(`xo:list:${key}`, (v) => (v.length ? DAY : 6 * 3600e3), async () => {
    const qs = new URLSearchParams({ location_key: key, limit: String(LIST_LIMIT), sort: 'best_value' });
    const j = await limit(() => xoGet(`${API}/list?${qs}`, LIST_TIMEOUT, { list: true }));
    return Array.isArray(j?.result?.list) ? j.result.list : [];
  });
}

export const ratesKey = (hotelKey, q) => `xo:rates:${hotelKey}:${q.checkin}:${q.checkout}:${q.adults}:${q.rooms}`;

/**
 * Ceny hotelu u webů: { currency, rates: [{ code, name, rate, tax }], at } – rate (+ tax) za pokoj a noc, at = kdy se
 * zjistily (ms). Mezipaměť RATES_TTL podle hotelu, termínu, dospělých a pokojů. opts.queue = fronta hledání (PER_SEARCH);
 * opts.deadline = konec rozpočtu (číslo, nebo funkce volaná až po získání místa ve frontě) – dotaz, který by začal po
 * něm, se nepošle (chyba late, neukládá se). opts.fresh („Aktualizovat ceny“) = dotaz i s cenou v mezipaměti (fronta
 * i pojistka platí); nepovede-li se, zůstane cena z mezipaměti s příznakem stale, bez ní chyba. slow = prázdné ceny
 * až po opts.slowMs (Xotelo nestihl TripAdvisor) – v mezipaměti jen EMPTY_TTL, u fresh zůstane dřívější cena (stale).
 */
export async function hotelRates(hotelKey, q, { deadline = Infinity, queue = (fn) => fn(), fresh = false, slowMs = EMPTY_SLOW_MS } = {}) {
  const key = ratesKey(hotelKey, q);
  const ttl = (v) => (v.slow ? EMPTY_TTL : RATES_TTL);
  const get = () => queue(() => limit(async () => {
    const t0 = Date.now();
    const left = (typeof deadline === 'function' ? deadline() : deadline) - t0;
    if (left < 500) throw late();
    const qs = new URLSearchParams({ hotel_key: hotelKey, chk_in: q.checkin, chk_out: q.checkout, currency: 'EUR', adults: String(q.adults), rooms: String(q.rooms) });
    const j = await xoGet(`${API}/rates?${qs}`, Math.min(RATE_TIMEOUT, left), { short: left < RATE_TIMEOUT });
    const r = j?.result || {};
    const rates = (Array.isArray(r.rates) ? r.rates : [])
      .filter((x) => Number(x?.rate) > 0)
      .map((x) => ({ code: String(x.code || ''), name: String(x.name || x.code || ''), rate: Number(x.rate), tax: Number(x.tax) > 0 ? Number(x.tax) : 0 }));
    return { currency: String(r.currency || 'EUR').toUpperCase(), rates, at: Date.now(), ...(!rates.length && Date.now() - t0 >= slowMs ? { slow: true } : {}) };
  }));
  if (!fresh) return cache.wrap(key, ttl, get);
  const old = cache.get(key);
  try {
    const v = await get();
    // Xotelo nestihl TripAdvisor: dřívější ceny zůstanou (stale), hotel se nevyprodal
    if (v.slow && old?.rates?.length) return { ...old, stale: true };
    cache.set(key, v, ttl(v));
    return v;
  } catch (e) {
    if (old) return { ...old, stale: true };
    throw e;
  }
}

// Názvy webů pro chipy s cenou (ostatní jak je posílá TripAdvisor): web hotelu česky, „Agoda.com“ → „Agoda“.
const otaName = (n) => (/^(official (hotel )?(hotel|site|website)|hotel website)$/i.test(n.trim()) ? 'web hotelu' : n === 'Agoda.com' ? 'Agoda' : n);

/**
 * Nabídky webů v Kč za celý pobyt (sazba za pokoj a noc × pokoje × noci), nejlevnější první; web dvakrát → levnější.
 * tax = TripAdvisor uvedl daně a poplatky (jsou v ceně); bez nich je web má v sazbě, nebo je neuvádí.
 */
export function offers(rr, q) {
  const best = new Map();
  for (const r of rr?.rates || []) {
    const total = toCzk((r.rate + (r.tax || 0)) * q.rooms * q.nights, rr.currency || 'EUR');
    if (!(total > 0)) continue;
    const name = otaName(r.name);
    if (!best.has(name) || total < best.get(name).totalCzk) best.set(name, { code: r.code, name, totalCzk: total, perNightCzk: Math.round(total / q.nights), tax: r.tax > 0 });
  }
  return [...best.values()].sort((a, b) => a.totalCzk - b.totalCzk);
}

// Weby se spolehlivým odkazem na konkrétní hotel (název nebo kód u TripAdvisoru → hledání „hotel, místo“ na termín):
// Booking.com (partnerský – „reklama“), Trip.com (searchWord vyplní formulář, potvrdí se Hledat), Hotels.com a Expedia
// (Hotel-Search Expedia Group). Ostatní (Agoda bez ID hotelu, Vio, web hotelu…) → Google Hotels s živými cenami hotelu.
const SITES = [
  ['booking', /^booking/i, (w, q) => affiliate(bookingSearchUrl(w[0], w[1], q), 'booking')],
  ['trip', /^(trip\.com|ctrip)/i, (w, q) => tripSearchUrl(w.join(', '), q)],
  ['hotelscom', /^hotels\.?com/i, (w, q) => expediaSearchUrl('www.hotels.com', w.join(', '), q)],
  ['expedia', /^expedia/i, (w, q) => expediaSearchUrl('www.expedia.com', w.join(', '), q)],
];
const siteOf = (o) => SITES.find(([, re]) => re.test(o.name) || re.test(o.code || ''));
/** Web nabídky se spolehlivým odkazem na hotel ('booking', 'trip', 'hotelscom', 'expedia'), jinak null. */
export const offerSite = (o) => siteOf(o)?.[0] || null;

/** Nabídka + odkaz na hotel u jejího webu: site (offerSite), url (bez spolehlivého odkazu Google Hotels), sponsored. */
export function offerLink(o, hotel, q) {
  const s = siteOf(o);
  const w = [hotel, q.cityEn || q.city];
  return { ...o, site: s ? s[0] : null, url: s ? s[2](w, q) : googleHotelsUrl(w.join(' '), q), sponsored: s?.[0] === 'booking' && affiliateOn('booking') };
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

/**
 * Hotel ze seznamu → Stay (viz stays/index.js); bez nabídky (vyprodáno) null. Ceny u 6 nejlevnějších webů s odkazy
 * (offerLink) a Booking.com vždy, má-li nabídku (karta jinak napíše, že na tvoje dny nic nenabízí); hlavní odkaz
 * (bookUrl) vede na web nejlevnější nabídky; ratesAt = kdy se ceny zjistily.
 */
export function mapHotel(h, rr, q, center) {
  const of = offers(rr, q);
  if (!of.length) return null;
  const shown = of.slice(0, 6);
  const bk = of.find((o) => offerSite(o) === 'booking');
  if (bk && !shown.includes(bk)) shown.push(bk);
  const rates = shown.map((o) => offerLink(o, String(h.name), q));
  return {
    ...hotelBase(h, center),
    priceTotalCzk: of[0].totalCzk,
    pricePerNightCzk: of[0].perNightCzk,
    rates,
    ratesAt: Number(rr.at) || null,
    bookUrl: rates[0].url,
    bookSponsored: rates[0].sponsored, // partnerský odkaz – karta ho označí „reklama“
  };
}

/**
 * Hotel bez ceny na zadané dny (TripAdvisor ji pro řadu hotelů zjišťuje až při dalších dotazech, nebo je vyprodaný):
 * guess = orientačně běžné rozpětí za noc ze seznamu (price_ranges v USD), odkaz na Google Hotels s tvými daty.
 */
export function mapHotelGuess(h, q, center) {
  const lo = Number(h.price_ranges?.minimum);
  const hi = Number(h.price_ranges?.maximum);
  const city = q.cityEn || q.city || '';
  return {
    ...hotelBase(h, center),
    guess: true,
    priceTotalCzk: null,
    pricePerNightCzk: null,
    nightFromCzk: lo > 0 ? toCzk(lo * q.rooms, 'USD') : null,
    nightToCzk: hi >= lo && hi > 0 ? toCzk(hi * q.rooms, 'USD') : null,
    rates: [],
    ratesAt: null,
    bookUrl: googleHotelsUrl(`${h.name}${city ? ' ' + city : ''}`, q),
    bookSponsored: false,
  };
}

function hotelBase(h, center) {
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
    freeCancellation: null,
    breakfast: labels.some((x) => /breakfast included/i.test(x)) ? true : null,
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
 * Hotely s cenou pro dotaz q (normalizeStayQuery). deps: sparql (Wikidata), budgetMs (rozpočet na ceny), fresh (ceny
 * znovu, ne z mezipaměti – místo a seznam hotelů z ní). Výsledek seřazený od nejlevnějšího; nestihly-li všechny ceny,
 * má příznak partial (kratší mezipaměť v searchStays) – i prázdný, když na ceny nezbyl čas (souběžná hledání), ne chyba
 * zdroje; stale = u fresh část cen aktualizovat nešlo (zůstaly dřívější).
 */
export async function searchXotelo(q, { sparql = wd, budgetMs = BUDGET_MS, fresh = false, slowMs = EMPTY_SLOW_MS } = {}) {
  const center = q.lat != null && q.lon != null ? { lat: q.lat, lon: q.lon } : null;
  let pool = [];
  const tried = new Set();
  const tryKeys = async (keys) => {
    for (const key of keys) {
      if (tried.has(key)) continue;
      tried.add(key);
      pool = candidates(await hotelList(key), center);
      if (pool.length) return true;
    }
    return false;
  };
  // místo bez hotelů v okolí (ID atrakce, ID z tabulky nesedí) → teprve teď obce v okolí bodu (pomalejší dotaz)
  if (!(await tryKeys(await locationKeys(q, { sparql }))) && center) await tryKeys(await nearbyKeys(q, { sparql }).catch(() => []));
  if (!pool.length) return [];
  const pick = chooseForRates(pool);
  // Rozpočet běží od chvíle, kdy první dotaz hledání dostane místo ve frontě (souběžná hledání se střídají).
  const t0 = Date.now();
  let end = 0;
  const deadline = () => end || (end = Date.now() + budgetMs);
  const queue = limiter(PER_SEARCH);
  const got = new Map();
  const errors = [];
  const jobs = pick.map((h) => hotelRates(h.key, q, { deadline, queue, fresh, slowMs }).then((rr) => { got.set(h.key, rr); }, (e) => { errors.push(e); }));
  let timer;
  const stop = new Promise((r) => {
    const tick = () => {
      const left = (end || t0 + 2 * budgetMs) + 500 - Date.now();
      if (left <= 0) r();
      else timer = setTimeout(tick, Math.min(left, 500));
    };
    tick();
  });
  await Promise.race([Promise.all(jobs), stop]);
  clearTimeout(timer);
  const hard = errors.find((e) => !e.late);
  if (!got.size && hard) throw hard;
  const out = pick.map((h) => (got.has(h.key) ? mapHotel(h, got.get(h.key), q, center) : null)).filter(Boolean);
  out.sort((a, b) => a.priceTotalCzk - b.priceTotalCzk);
  // Hotely bez ceny na tvoje dny (prázdné nabídky, nestihly přijít) a další z místa – orientačně, ať seznam není prázdný
  // jen proto, že TripAdvisor ceny teprve zjišťuje (pořadí TripAdvisoru = nejlepší poměr); zvlášť v guesses,
  // searchStays je přidá za nabídky s cenou.
  const priced = new Set(out.map((h) => h.id));
  out.guesses = [...pick, ...pool.filter((h) => !pick.includes(h))].filter((h) => !priced.has(`xo:${h.key}`)).slice(0, GUESS_MAX).map((h) => mapHotelGuess(h, q, center));
  // nestihly přijít, nebo Xotelo nestihl TripAdvisor (slow) – průvodce se doptá znovu
  if (got.size < pick.length || [...got.values()].some((rr) => rr.slow)) out.partial = true;
  const st = [...got.values()].filter((rr) => rr.stale).length;
  if (st) out.stale = true;
  if (st && st === got.size) out.staleAll = true; // aktualizovat nešlo nic – „Aktualizovat ceny“ jde zkusit hned znovu
  return out;
}

export const xotelo = {
  id: 'xotelo',
  name: 'TripAdvisor (Xotelo)',
  refresh: true, // umí „Aktualizovat ceny“ (search s fresh)
  search: (q, { fresh = false } = {}) => searchXotelo(q, { fresh }),
  // ostrý test (/api/diag): jeden malý seznam hotelů ve Vídni, bez mezipaměti
  async probe() {
    const j = await limit(() => request(`${API}/list?location_key=g190454&limit=3&sort=popularity`, { headers: HEADERS, timeoutMs: 12000, retries: 0 }));
    const n = j?.result?.list?.length || 0;
    if (!n) throw new Error(j?.error ? `Xotelo: ${JSON.stringify(j.error).slice(0, 120)}` : 'Xotelo: prázdný seznam hotelů');
    return `${n} hotely ve Vídni (TripAdvisor, ${j.result.total_count ?? '?'} celkem)`;
  },
};
