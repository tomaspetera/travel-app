// Vlak nebo bus místo letadla (Evropa, když to dává smysl): odhad času a ceny po zemi, srovnání
// s letadlem „od dveří ke dveřím“, odkazy (RegioJet, FlixBus, IDOS, Google Mapy) a živé spoje
// RegioJetu – jen ze serveru a jen na vyžádání. Města a ID: data/ground.json (scripts/build-ground.mjs).
// Zdroje a podmínky viz README → „Vlak nebo bus místo letadla“.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.js';
import { haversineKm, normalize, groundEstimate } from './geo.js';
import { COUNTRY_BY_ISO, airportsNear, getAirport } from './airports.js';
import { describe } from './places.js';
import { isYmd, addDays, todayYmd } from './dates.js';
import { request, limiter } from './http.js';
import { TTLCache } from './cache.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ---------- kde má cesta po zemi smysl ---------- */

// Země spojené po souši s pevninskou Evropou (bez Velké Británie, Irska, Islandu, Malty a Kypru;
// Turecko, Rusko a Bělorusko ne).
export const LAND_CC = new Set(['AT', 'BE', 'BG', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IT', 'LI', 'LT', 'LU',
  'LV', 'MC', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'BA', 'ME', 'MK', 'AL', 'XK', 'AD', 'SM', 'VA', 'MD', 'UA']);
const SEA_CC = new Set(['GB', 'IE', 'IS', 'MT', 'CY', 'FO', 'IM', 'JE', 'GG']);
// Ostrovy bez pevného spojení s pevninou (obdélníky [název, lat od, lat do, lon od, lon do]).
const ISLANDS = [
  ['Baleáry', 38.5, 40.2, 1.1, 4.4], ['Kanárské ostrovy', 27.5, 29.5, -18.3, -13.3], ['Madeira', 32.3, 33.2, -17.4, -16.2],
  ['Azory', 36.8, 39.8, -31.4, -24.9], ['Korsika', 41.3, 43.1, 8.5, 9.6], ['Sardinie', 38.8, 41.3, 8.1, 9.9],
  ['Sicílie', 36.6, 38.3, 12.3, 15.35], ['Sicílie', 37.8, 38.3, 15.35, 15.6], ['Malta', 35.7, 36.1, 14.1, 14.6],
  ['Kréta', 34.8, 35.7, 23.4, 26.4], ['Rhodos a Dodekanésy', 35.3, 37.5, 26.5, 28.3], ['Kyklady', 36.3, 37.95, 24.2, 26.1],
  ['Korfu', 39.35, 39.85, 19.6, 19.97], ['Kefalonie', 38.0, 38.5, 20.3, 20.8], ['Zakynthos', 37.6, 37.95, 20.6, 21.0],
  ['Lesbos, Chios a Samos', 37.6, 39.4, 25.8, 27.1], ['Lemnos', 39.75, 40.05, 25.0, 25.45], ['Thasos', 40.55, 40.82, 24.5, 24.8],
  ['Skiathos', 39.05, 39.25, 23.35, 23.9], ['Brač', 43.25, 43.42, 16.38, 16.92], ['Hvar', 43.1, 43.22, 16.4, 16.9],
  ['Korčula', 42.9, 43.0, 16.6, 17.14], ['Vis', 43.0, 43.1, 16.0, 16.3], ['Cres a Lošinj', 44.5, 44.98, 14.25, 14.55],
  ['Bornholm', 54.98, 55.3, 14.68, 15.2], ['Gotland', 56.9, 58.0, 18.05, 19.4], ['Alandy', 59.9, 60.5, 19.3, 21.1],
  ['Saaremaa a Hiiumaa', 57.9, 59.1, 21.8, 23.4], ['Helgoland', 54.15, 54.2, 7.85, 7.92],
];
export const MAX_KM = 1100; // dál je vlakem i busem celý den a víc

/** Ostrov bez pevného spojení, na kterém bod leží (název), nebo null. */
export function islandOf(lat, lon) {
  const x = ISLANDS.find(([, a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d);
  return x ? x[0] : null;
}

/** Leží místo na pevnině Evropy, kam se dá dojet vlakem nebo busem? → { ok, why } */
export function landOk(p) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return { ok: false, why: 'neznámá poloha' };
  const cc = String(p.cc || '').toUpperCase();
  if (cc && !LAND_CC.has(cc)) {
    const country = COUNTRY_BY_ISO.get(cc)?.cs || cc;
    return { ok: false, why: SEA_CC.has(cc) ? `${country} – přes moře, vlak ani bus tam bez trajektu nejede` : `${country} – mimo pevninskou Evropu` };
  }
  if (!cc && (p.lat < 34 || p.lat > 72 || p.lon < -11 || p.lon > 41)) return { ok: false, why: 'mimo Evropu' };
  const isl = islandOf(p.lat, p.lon);
  if (isl) return { ok: false, why: `${isl} – ostrov, vlak ani bus tam nejede` };
  return { ok: true, why: null };
}

/* ---------- data měst (RegioJet a FlixBus ID) ---------- */

const NO_DATA = { built: null, sources: {}, cols: [], cities: [], stations: {} };
function loadData() {
  try {
    return JSON.parse(readFileSync(path.join(root, 'data', 'ground.json'), 'utf8'));
  } catch {
    return NO_DATA; // před prvním sestavením dat: odhad funguje, odkazy jen IDOS a Google
  }
}
const DATA = loadData();
export const GROUND_INFO = { built: DATA.built, sources: DATA.sources };
const col = (name) => DATA.cols.indexOf(name);
// name = český název, loc = místní název (pro IDOS a Google Mapy), rj = ID města RegioJetu, fb = UUID města FlixBusu
export const CITIES = DATA.cities.map((r) => {
  const c = {
    name: r[col('name')], loc: r[col('loc')] || r[col('name')], cc: r[col('cc')], lat: r[col('lat')], lon: r[col('lon')],
    rj: r[col('rj')] || null, fb: r[col('fb')] || null, src: r[col('src')] || '',
  };
  c._n = normalize(c.name);
  c._l = normalize(c.loc);
  return c;
});
const STATIONS = DATA.stations || {};

// Jedno časové pásmo na zemi (ostrovy s jiným pásmem – Kanáry, Azory – sem nepatří).
const TZ = {
  AT: 'Europe/Vienna', BE: 'Europe/Brussels', BG: 'Europe/Sofia', CH: 'Europe/Zurich', CZ: 'Europe/Prague', DE: 'Europe/Berlin',
  DK: 'Europe/Copenhagen', EE: 'Europe/Tallinn', ES: 'Europe/Madrid', FI: 'Europe/Helsinki', FR: 'Europe/Paris', GR: 'Europe/Athens',
  HR: 'Europe/Zagreb', HU: 'Europe/Budapest', IT: 'Europe/Rome', LI: 'Europe/Vaduz', LT: 'Europe/Vilnius', LU: 'Europe/Luxembourg',
  LV: 'Europe/Riga', MC: 'Europe/Monaco', NL: 'Europe/Amsterdam', NO: 'Europe/Oslo', PL: 'Europe/Warsaw', PT: 'Europe/Lisbon',
  RO: 'Europe/Bucharest', RS: 'Europe/Belgrade', SE: 'Europe/Stockholm', SI: 'Europe/Ljubljana', SK: 'Europe/Bratislava',
  BA: 'Europe/Sarajevo', ME: 'Europe/Podgorica', MK: 'Europe/Skopje', AL: 'Europe/Tirane', XK: 'Europe/Belgrade', AD: 'Europe/Andorra',
  SM: 'Europe/San_Marino', VA: 'Europe/Vatican', MD: 'Europe/Chisinau', UA: 'Europe/Kyiv',
};
export const tzOf = (cc) => TZ[String(cc || '').toUpperCase()] || null;

// „Memmingen (Mnichov)“, „Paříž-Beauvais“ → „memmingen“, „pariz“ (i celý název)
const namesOf = (s) => {
  const full = normalize(s);
  const base = normalize(String(s || '').replace(/\s*\(.*$/, '').replace(/-[^-]*$/, ''));
  return [...new Set([full, base].filter(Boolean))];
};

/**
 * Město z dat ke zvolenému místu: stejný název (český nebo místní) a země do 60 km (letiště „Vídeň“
 * → město Vídeň), jinak nejbližší město do 30 km. Bez shody null.
 */
export function cityNear(p) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !CITIES.length) return null;
  const names = namesOf(p.label || p.name);
  const cc = String(p.cc || '').toUpperCase();
  let best = null;
  let bestD = Infinity;
  for (const c of CITIES) {
    if (Math.abs(c.lat - p.lat) > 1 || Math.abs(c.lon - p.lon) > 1.6) continue;
    const d = haversineKm(p.lat, p.lon, c.lat, c.lon);
    const same = (!cc || c.cc === cc) && names.some((n) => n === c._n || n === c._l);
    const score = same && d <= 60 ? d - 1000 : d <= 30 ? d : Infinity;
    if (score < bestD) {
      bestD = score;
      best = c;
    }
  }
  return best;
}

/** Bod (letiště, město, poloha) → { label, loc, cc, lat, lon, rj, fb, tz } – s ID z dat, je-li město známé. */
export function groundPlace(p) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  let cc = String(p.cc || '').toUpperCase();
  // poloha bez země (lat/lon) → země nejbližšího letiště
  if (!cc) cc = airportsNear(p.lat, p.lon, 120, { includeSmall: true, limit: 1 })[0]?.cc || '';
  const c = cityNear({ ...p, cc });
  const label = String(p.label || p.name || '').replace(/ \((?:[A-Z]{3}|letiště)\)$/, '').trim();
  return c
    ? { label: c.name, loc: c.loc, cc: c.cc, lat: c.lat, lon: c.lon, rj: c.rj, fb: c.fb, tz: tzOf(c.cc) }
    : { label: label || `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`, loc: label, cc, lat: p.lat, lon: p.lon, rj: null, fb: null, tz: tzOf(cc) };
}

/* ---------- odhad času a ceny ---------- */

// Změřeno 13. 10. 2026 (research/ground.md, skutečné odpovědi RegioJetu a FlixBusu): Praha ↔ město –
// nejrychlejší spoj (min) a nejnižší cena (Kč) z obou dopravců, klíčem je ID města RegioJetu.
export const PRAHA_RJ = 10202003;
export const MEASURED = {
  10202052: { name: 'Vídeň', min: 234, czk: 299 },
  10202072: { name: 'Berlín', min: 250, czk: 329 },
  10202006: { name: 'Mnichov', min: 270, czk: 299 },
  10202091: { name: 'Budapešť', min: 371, czk: 399 },
  1225791000: { name: 'Krakov', min: 350, czk: 279 },
  10202080: { name: 'Benátky', min: 710, czk: 979 },
  10202096: { name: 'Paříž', min: 765, czk: 1158 },
  10202030: { name: 'Amsterdam', min: 740, czk: 1098 },
  10202067: { name: 'Curych', min: 575, czk: 849 },
};
export const MEASURED_DATE = '2026-10-13';

const round5 = (m) => Math.max(5, Math.round(m / 5) * 5);
const roundCzk = (x) => (x < 1000 ? Math.round(x / 10) * 10 : Math.round(x / 50) * 50);

/**
 * Model podle vzdálenosti vzdušnou čarou, kalibrovaný na tabulce z Prahy:
 *  - čas: do 450 km ~66 km/h (Vídeň 64, Berlín 67, Mnichov 67, Krakov 68, Budapešť 72), dál ~55 km/h
 *    a k tomu až hodina na přestupy a noční spoje (Curych 55, Amsterdam 58, Benátky 45, Paříž 69);
 *  - nejnižší cena: do 450 km ~120 Kč + 0,62 Kč/km (280–400 Kč), dál rychle stoupá (méně dopravců,
 *    noční spoje) až k ~400 Kč + 0,86 Kč/km (Curych 849, Benátky 979, Amsterdam 1 098, Paříž 1 158 Kč).
 */
export function distanceModel(km) {
  const far = Math.max(0, km - 450);
  const minutes = (Math.min(km, 450) / 66) * 60 + (far / 55) * 60 + 60 * Math.min(1, far / 150);
  const czk = km <= 450 ? 120 + 0.62 * km : Math.min(399 + 5 * far, 398 + 0.86 * km);
  return { minutes: round5(Math.max(45, minutes)), czk: roundCzk(Math.max(150, czk)) };
}

/**
 * Odhad cesty po zemi mezi dvěma místy ({ lat, lon, cc, rj? }): { ok, km, minutes, czk, basis, why }.
 * basis 'measured' = změřená cesta z/do Prahy, 'distance' = model podle vzdálenosti. Vždy jen odhad.
 */
export function estimate(a, b) {
  if (!a || !b || ![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return null;
  const km = Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon));
  for (const p of [a, b]) {
    const l = landOk(p);
    if (!l.ok) return { ok: false, km, why: l.why };
  }
  if (km > MAX_KM) return { ok: false, km, why: `${km.toLocaleString('cs-CZ')} km vzdušnou čarou – vlakem nebo busem celý den a víc` };
  if (km < 20) return { ok: false, km, why: 'Stejné místo – letadlo ani dálkový spoj tu nedává smysl' };
  const other = a.rj === PRAHA_RJ ? b.rj : b.rj === PRAHA_RJ ? a.rj : null;
  const m = other && MEASURED[other];
  if (m) return { ok: true, km, minutes: m.min, czk: m.czk, basis: 'measured', measuredAt: MEASURED_DATE };
  return { ok: true, km, ...distanceModel(km), basis: 'distance' };
}

/** „4 h 20“, „45 min“ */
export function hm(min) {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`;
}

/* ---------- letadlo vs. vlak/bus ---------- */

export const AIRPORT_BEFORE = 120; // na letišti před odletem
export const AIRPORT_AFTER = 45; // po přistání (vystoupení, zavazadla)
export const STATION_MIN = 30; // cesta na nádraží a z nádraží (oba konce dohromady)

/** Letadlo od dveří ke dveřím: cesta na letiště + 2 h před odletem + let + 45 min po přistání + cesta do města. */
export function flightDoor({ accessMin = 0, flightMin = 0, egressMin = 0 } = {}) {
  return Math.round(accessMin + AIRPORT_BEFORE + flightMin + AIRPORT_AFTER + egressMin);
}

/** Odhad délky letu podle vzdálenosti letišť (když ho zdroj neuvádí): ~780 km/h + 35 min. */
export const flightMinOf = (km) => Math.round((km / 780) * 60 + 35);

/**
 * Stojí za to ukázat vlak/bus vedle letadla? Jednoduché pravidlo (po zemi = jízda + 30 min na nádraží):
 *  1. po zemi nejvýš o 1,5 h déle než letadlem od dveří ke dveřím,
 *  2. nebo po zemi do 6,5 h,
 *  3. nebo aspoň o polovinu levněji a do 10 h.
 * flight = { doorMin, czk – cena letu na osobu (může být za cestu tam i zpět), trips – kolik cest po zemi
 * ta cena pokrývá (2 = tam i zpět) }. → { worth, rule, reason, doorMin, groundMin }
 */
export function worth(est, flight = {}) {
  if (!est || !est.ok) return { worth: false, rule: null, reason: est?.why || null, doorMin: null, groundMin: null };
  const groundMin = est.minutes + STATION_MIN;
  const doorMin = Number.isFinite(flight.doorMin) && flight.doorMin > 0 ? Math.round(flight.doorMin) : null;
  const vs = doorMin ? ` (letadlem ~${hm(round5(doorMin))} i s cestou na letiště a odbavením)` : '';
  const ground = `Vlakem/busem ~${hm(est.minutes)}`;
  const out = (rule, reason) => ({ worth: Boolean(rule), rule, reason, doorMin: doorMin && round5(doorMin), groundMin });
  if (doorMin && groundMin <= doorMin + 90) {
    return out('time', groundMin <= doorMin ? `${ground} – rychleji než letadlem${vs}.` : `${ground} – skoro jako letadlem${vs}.`);
  }
  if (groundMin <= 390) return out('short', `${ground} – cesta do 6,5 h${vs}.`);
  const trips = flight.trips === 2 ? 2 : 1;
  const groundCzk = est.czk * trips;
  if (flight.czk > 0 && groundCzk <= flight.czk * 0.5 && groundMin <= 600) {
    return out('cheap', `${ground} a o ~${(Math.round((flight.czk - groundCzk) / 100) * 100).toLocaleString('cs-CZ')} Kč levněji na osobu${vs}.`);
  }
  return out(null, `${ground} – letadlo tu vychází lépe${vs}.`);
}

/* ---------- odkazy ---------- */

const dmy = (d, pad) => {
  const [y, m, day] = d.split('-').map(Number);
  return pad ? `${String(day).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}` : `${day}.${m}.${y}`;
};
// IDOS a Google hledají česká a slovenská místa česky, zahraniční spolehlivě místním názvem
// („Napoli“ najde, „Naples“ ne; „Mnichov“ je i obec v ČR).
const localName = (p) => (['CZ', 'SK'].includes(p.cc) || !p.loc ? p.label : p.loc);
const mapsName = (p) => {
  const country = COUNTRY_BY_ISO.get(p.cc)?.en;
  return country ? `${localName(p)}, ${country}` : localName(p);
};

/**
 * Odkazy s předvyplněným hledáním: RegioJet a FlixBus jen se známými ID měst (z dat), IDOS a Google
 * Mapy vždy. a, b = groundPlace(); date 'YYYY-MM-DD' (nebo null); adults 1–9.
 */
export function links(a, b, date, adults = 1) {
  const d = isYmd(date) ? date : null;
  const n = Math.min(9, Math.max(1, Math.round(Number(adults)) || 1));
  const out = [];
  if (a.rj && b.rj) {
    const qs = new URLSearchParams({ ...(d ? { departureDate: d } : {}), fromLocationId: String(a.rj), toLocationId: String(b.rj), fromLocationType: 'CITY', toLocationType: 'CITY' });
    // RegioJet: jeden tarif na cestujícího (2 dospělí = tariffs=REGULAR&tariffs=REGULAR)
    for (let i = 0; i < n; i++) qs.append('tariffs', 'REGULAR');
    out.push({ id: 'regiojet', name: 'RegioJet', note: 'vlaky i busy · koupíš tam', url: `https://regiojet.cz/?${qs}` });
  }
  if (a.fb && b.fb) {
    const qs = new URLSearchParams({ departureCity: a.fb, arrivalCity: b.fb, ...(d ? { rideDate: dmy(d, true) } : {}), adult: String(n) });
    out.push({ id: 'flixbus', name: 'FlixBus', note: 'jen odkaz – ceny ATLAS nenačítá', url: `https://shop.flixbus.cz/search?${qs}` });
  }
  const iq = new URLSearchParams({ f: localName(a), t: localName(b), ...(d ? { date: dmy(d), time: '7:00' } : {}), submit: 'true' });
  out.push({ id: 'idos', name: 'IDOS', note: 'vlaky ČD i zahraniční, autobusy · jen odkaz', url: `https://idos.cz/vlakyautobusy/spojeni/?${iq}` });
  const gm = new URLSearchParams({ api: '1', origin: mapsName(a), destination: mapsName(b), travelmode: 'transit' });
  out.push({ id: 'google', name: 'Google Mapy', note: 'veřejná doprava · datum a čas zadej v mapě', url: `https://www.google.com/maps/dir/?${gm}` });
  return out;
}

/* ---------- živé spoje RegioJetu (jen ze serveru, na vyžádání) ---------- */

const RJ_API = 'https://brn-ybus-pubapi.sa.cz/restapi';
const env = (k, d) => (process.env[k] != null && process.env[k] !== '' && Number.isFinite(Number(process.env[k])) ? Number(process.env[k]) : d);
// Vypínač: REGIOJET_LIVE=0 → jen odhad a odkazy (čte se při každém dotazu).
export const regiojetOn = () => process.env.REGIOJET_LIVE !== '0';
const rjCache = new TTLCache(1000);
const rjLimit = limiter(1);
let rjLast = 0;
let rjCalls = []; // časy dotazů za poslední hodinu
let rjQueued = 0;

/** Jen pro testy: vyprázdní mezipaměť a počítadla. */
export function resetRegiojet() {
  rjCache.map.clear();
  rjCache.inflight.clear();
  rjCalls = [];
  rjLast = 0;
  rjQueued = 0;
}

class BusyError extends Error {}

// Jeden dotaz naráz, aspoň REGIOJET_GAP_MS (1 s) mezi dotazy, nejvýš REGIOJET_MAX_PER_HOUR (60) za hodinu
// a nejvýš 5 čekajících – víc dotazů najednou dostane hned odhad (nikdo nečeká půl minuty ve frontě).
function politely(fn) {
  if (rjQueued >= 5) return Promise.reject(new BusyError('RegioJet se teď ptá moc lidí najednou – zkus to za chvíli, nebo otevři odkaz.'));
  rjQueued++;
  return rjLimit(async () => {
    rjQueued--;
    const now = Date.now();
    rjCalls = rjCalls.filter((t) => now - t < 3600e3);
    if (rjCalls.length >= env('REGIOJET_MAX_PER_HOUR', 60)) throw new BusyError('Hodinový limit dotazů na RegioJet je vyčerpaný – zkus to později, nebo otevři odkaz.');
    const wait = rjLast + env('REGIOJET_GAP_MS', 1000) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    rjCalls.push(Date.now());
    try {
      return await fn();
    } finally {
      rjLast = Date.now();
    }
  });
}

const local16 = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : null);
function travelMin(r) {
  const m = /^(\d+):(\d{2})/.exec(String(r.travelTime || ''));
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const d = (Date.parse(r.arrivalTime) - Date.parse(r.departureTime)) / 60000;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : null;
}
const num = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Odpověď /routes/search/simple → spoje v den `date` (API vrací ~3 dny dopředu), seřazené podle odjezdu. */
export function parseRoutes(j, date) {
  return (Array.isArray(j?.routes) ? j.routes : [])
    .filter((r) => r && local16(r.departureTime) && local16(r.arrivalTime) && (!date || r.departureTime.slice(0, 10) === date))
    .map((r) => {
      const priceFrom = num(r.priceFrom);
      return {
        id: String(r.id ?? '').slice(0, 60),
        dep: local16(r.departureTime), // místní čas odjezdu (časové pásmo stanice)
        arr: local16(r.arrivalTime),
        min: travelMin(r),
        transfers: Math.max(0, Math.round(num(r.transfersCount) || 0)),
        kinds: [...new Set((Array.isArray(r.vehicleTypes) ? r.vehicleTypes : []).filter((x) => x === 'TRAIN' || x === 'BUS'))],
        priceFrom: priceFrom > 0 ? priceFrom : null,
        priceTo: num(r.priceTo) > 0 ? num(r.priceTo) : null,
        seats: num(r.freeSeatsCount),
        bookable: r.bookable === true && priceFrom > 0,
        fromStation: STATIONS[r.departureStationId] || null,
        toStation: STATIONS[r.arrivalStationId] || null,
      };
    })
    .sort((a, b) => a.dep.localeCompare(b.dep));
}

/** Souhrn spojů: počet, nejnižší cena a nejkratší cesta (jen spoje, které jdou koupit). */
export function liveSummary(items) {
  const ok = items.filter((x) => x.bookable);
  return {
    count: ok.length,
    priceFrom: ok.length ? Math.min(...ok.map((x) => x.priceFrom)) : null,
    fastest: ok.length ? Math.min(...ok.map((x) => x.min || Infinity)) : null,
  };
}

// DEMO (ATLAS_MOCK=1): vymyšlené spoje podle odhadu – v UI jasně označené.
function mockRoutes(fromId, toId, date, est) {
  const base = est && est.ok ? est : distanceModel(250 + ((Number(fromId) + Number(toId)) % 300));
  const items = [6, 7, 9, 11, 13, 15, 16, 18].map((h, i) => {
    const train = i % 2 === 0;
    const min = base.minutes + (train ? 0 : 20) + (i % 3) * 5;
    const dep = `${date}T${String(h).padStart(2, '0')}:${train ? '01' : '00'}`;
    const arr = new Date(Date.parse(`${dep}:00Z`) + min * 60000).toISOString().slice(0, 16);
    const price = base.czk + (i % 4) * 100;
    return {
      id: `demo-${i}`, dep, arr, min, transfers: i === 5 ? 1 : 0, kinds: i === 5 ? ['TRAIN', 'BUS'] : [train ? 'TRAIN' : 'BUS'],
      priceFrom: price, priceTo: price + 300, seats: i === 7 ? 0 : 40 + i * 10, bookable: i !== 7, fromStation: null, toStation: null,
    };
  });
  return { ok: true, demo: true, source: 'regiojet', date, at: new Date().toISOString(), items, ...liveSummary(items) };
}

/**
 * Živé spoje RegioJetu mezi městy (ID z dat) v den `date`: { ok, items, count, priceFrom, fastest, at }
 * nebo { ok: false, error } – chyba nikdy nevyhazuje, UI pak ukáže odhad. V mezipaměti 3 h (chyba 5 min).
 * est = odhad téže cesty (jen pro ukázková data v DEMO režimu).
 */
export async function regiojet(fromId, toId, date, est = null) {
  if (!regiojetOn()) return { ok: false, off: true, error: 'Živé spoje RegioJetu jsou vypnuté – platí odhad a odkazy.' };
  if (!/^\d{1,12}$/.test(String(fromId || '')) || !/^\d{1,12}$/.test(String(toId || '')) || !isYmd(date)) return { ok: false, error: 'Chybí město nebo datum.' };
  if (config.mock) return mockRoutes(fromId, toId, date, est);
  const key = `${fromId}|${toId}|${date}`;
  return rjCache.wrap(key, (v) => (v.ok ? 3 * 3600e3 : v.busy ? 1 : 5 * 60e3), async () => {
    const qs = new URLSearchParams({ tariffs: 'REGULAR', fromLocationType: 'CITY', fromLocationId: String(fromId), toLocationType: 'CITY', toLocationId: String(toId), departureDate: date });
    try {
      // Bez hlavičky Origin (z prohlížeče cizího webu API vrací 403) – proto jen ze serveru.
      const j = await politely(() => request(`${RJ_API}/routes/search/simple?${qs}`, { headers: { 'X-Lang': 'cs', 'X-Currency': 'CZK' }, timeoutMs: 8000, retries: 1 }));
      const items = parseRoutes(j, date);
      return { ok: true, source: 'regiojet', date, at: new Date().toISOString(), items, ...liveSummary(items) };
    } catch (e) {
      if (e instanceof BusyError) return { ok: false, busy: true, error: e.message };
      console.warn(`regiojet: ${e.message}`);
      return { ok: false, error: 'RegioJet teď neodpovídá – platí odhad, spoje ověř přes odkaz.' };
    }
  });
}

/* ---------- dotaz /api/ground ---------- */

export class GroundError extends Error {
  constructor(msg) {
    super(msg);
    this.status = 400;
  }
}

/** Místo z ID aplikace (ap:VIE, metro:PAR, geo:lat,lon|Název, nebo jen kód letiště) – ne země ani region. */
export function pointOf(id) {
  const s = String(id || '').trim().slice(0, 200);
  if (/^[A-Za-z]{3}$/.test(s)) {
    const a = getAirport(s);
    return a ? { label: a.cityCs, cc: a.cc, lat: a.lat, lon: a.lon, iata: a.iata } : null;
  }
  if (!/^(ap|metro|geo):/.test(s)) return null;
  const d = describe(s);
  if (!d || !Number.isFinite(d.lat) || !Number.isFinite(d.lon)) return null;
  return { label: String(d.label || '').replace(/[<>"'`]/g, '').slice(0, 80), cc: d.cc || '', lat: d.lat, lon: d.lon, iata: d.iata || null };
}

/** Parametry /api/ground → { from, to, date, adults, live, flightCzk, flightMin, trips } (from/to = body), jinak GroundError. */
export function groundQuery(sp) {
  const get = (k) => {
    const v = typeof sp.get === 'function' ? sp.get(k) : sp[k];
    return v == null ? null : String(v);
  };
  const side = (k, what) => {
    const id = get(k);
    const lat = get(`${k}Lat`);
    const lon = get(`${k}Lon`);
    if (id) {
      const p = pointOf(id);
      if (!p) throw new GroundError(`Neznámé místo ${what} – zadej město, letiště nebo polohu (ne celou zemi).`);
      return p;
    }
    if (lat != null && lon != null) {
      const la = Number(lat);
      const lo = Number(lon);
      if (lat === '' || lon === '' || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new GroundError(`Neplatná poloha ${what} (lat/lon).`);
      const cc = get(`${k}Cc`) || '';
      return { label: (get(`${k}Name`) || '').replace(/[<>"'`]/g, '').slice(0, 80), cc: /^[A-Za-z]{2}$/.test(cc) ? cc.toUpperCase() : '', lat: la, lon: lo };
    }
    throw new GroundError(`Chybí místo ${what} (${k}=…).`);
  };
  const from = side('from', 'odjezdu');
  const to = side('to', 'cíle');
  const date = get('date') || null;
  if (date && (!isYmd(date) || addDays(date, 0) !== date || date < addDays(todayYmd(), -1) || date > addDays(todayYmd(), 360))) throw new GroundError('Neplatné datum – YYYY-MM-DD, dnes až rok dopředu.');
  const ad = get('adults');
  if (ad != null && ad !== '' && (!/^\d{1,2}$/.test(ad) || Number(ad) < 1 || Number(ad) > 9)) throw new GroundError('Počet cestujících musí být číslo 1–9.');
  const adults = Number(ad) || 1;
  const pos = (k, max) => Math.min(max, Math.max(0, Number(get(k)) || 0));
  return { from, to, date, adults, live: get('live') !== '0', flightCzk: pos('flightCzk', 1e6), flightMin: pos('flightMin', 3000), trips: get('trips') === '2' ? 2 : 1 };
}

/** Letadlo od dveří ke dveřím mezi dvěma body bez znalosti letu: nejbližší velká letiště a let podle vzdálenosti. */
export function doorByAir(a, b, flightMin = 0) {
  const ap = (p) => (p.iata && getAirport(p.iata)) || airportsNear(p.lat, p.lon, 150, { limit: 1 })[0] || null;
  const x = ap(a);
  const y = ap(b);
  if (!x || !y || x.iata === y.iata) return null;
  const km = (p, q) => haversineKm(p.lat, p.lon, q.lat, q.lon);
  return flightDoor({
    accessMin: groundEstimate(km(a, x)).minutes,
    flightMin: flightMin || flightMinOf(km(x, y)),
    egressMin: groundEstimate(km(b, y)).minutes,
  });
}

const pub = (p) => ({ label: p.label, cc: p.cc, lat: Math.round(p.lat * 1e4) / 1e4, lon: Math.round(p.lon * 1e4) / 1e4, tz: p.tz, regiojet: Boolean(p.rj), flixbus: Boolean(p.fb) });

/** Odpověď /api/ground: místa, vzdálenost, odhad, srovnání s letadlem, odkazy a (je-li datum) živé spoje RegioJetu. */
export async function groundInfo(q) {
  const a = groundPlace(q.from);
  const b = groundPlace(q.to);
  const est = estimate(a, b);
  const doorMin = doorByAir(q.from, q.to, q.flightMin);
  const w = worth(est, { doorMin, czk: q.flightCzk, trips: q.trips });
  const ok = Boolean(est && est.ok);
  const res = {
    from: pub(a), to: pub(b), km: est ? est.km : Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon)),
    est: ok ? { minutes: est.minutes, czk: est.czk, basis: est.basis, ...(est.measuredAt ? { measuredAt: est.measuredAt } : {}) } : null,
    why: est && !est.ok ? est.why : null,
    worth: w, date: q.date, adults: q.adults,
    links: ok ? links(a, b, q.date, q.adults) : [],
    demo: config.mock,
  };
  if (ok && q.date && q.live) {
    res.live = a.rj && b.rj ? await regiojet(a.rj, b.rj, q.date, est)
      : { ok: false, none: true, error: 'RegioJet mezi těmito městy nejezdí – spoje najdeš přes odkazy.' };
  }
  return res;
}

/* ---------- výsledky hledání letů (bez sítě, jen odhad) ---------- */

const geoId = (p) => `geo:${p.lat.toFixed(4)},${p.lon.toFixed(4)}|${String(p.label || '').replace(/[|<>"'`]/g, '').slice(0, 60)}`;

/**
 * Odhad po zemi k cíli z výsledků hledání (skupina = jedno cílové město): null mimo dosah.
 * home = groundPlace(domova) nebo null (pak město letiště odletu nejlepší cesty); from = domov, jak ho zadal
 * uživatel (pro ID v dotazu); dest = skupina.dest; trip = nejlepší cesta (lety + cena na osobu);
 * flightMin = nejkratší nalezený let (od dveří ke dveřím se počítá s ním, ne s nejlevnějším letem s dlouhým přestupem);
 * accessOf(iata) = minuty z domova na letiště odletu.
 */
export function groundForDest({ home = null, from = null, dest, trip = null, flightMin = 0, accessOf = () => 0 }) {
  if (!dest || !Number.isFinite(dest.lat) || !Number.isFinite(dest.lon)) return null;
  const outAp = trip ? getAirport(trip.out.from) : null;
  const a = home || (outAp ? groundPlace({ label: outAp.cityCs, cc: outAp.cc, lat: outAp.lat, lon: outAp.lon }) : null);
  if (!a) return null;
  const b = groundPlace({ label: dest.label, cc: dest.cc, lat: dest.lat, lon: dest.lon });
  if (!b) return null;
  const est = estimate(a, b);
  if (!est || !est.ok) return null;
  let doorMin = null;
  if (trip) {
    const toAp = getAirport(trip.out.to);
    const egressKm = dest.airportDistKm ?? (toAp ? haversineKm(toAp.lat, toAp.lon, b.lat, b.lon) : 20);
    const fly = flightMin || trip.out.durationMin || (outAp && toAp ? flightMinOf(haversineKm(outAp.lat, outAp.lon, toAp.lat, toAp.lon)) : 90);
    doorMin = flightDoor({ accessMin: home ? accessOf(trip.out.from) : 0, flightMin: fly, egressMin: groundEstimate(egressKm).minutes });
  } else {
    doorMin = doorByAir(from || a, dest);
  }
  const w = worth(est, { doorMin, czk: trip?.perPersonCzk || 0, trips: trip?.back ? 2 : 1 });
  return {
    km: est.km, min: est.minutes, czk: est.czk, basis: est.basis,
    worth: w.worth, rule: w.rule, reason: w.reason, doorMin: w.doorMin,
    from: a.label, to: b.label, regiojet: Boolean(a.rj && b.rj), flixbus: Boolean(a.fb && b.fb),
    q: { from: from?.id || (from && Number.isFinite(from.lat) ? geoId(from) : `ap:${trip.out.from}`), to: dest.id && /^(ap|metro|geo):/.test(dest.id) ? dest.id : geoId(dest) },
  };
}

/**
 * Odhad po zemi do výsledků hledání (bez sítě): ke každé skupině v dosahu `ground` a u hledání ke konkrétnímu
 * cíli i `ground` celého výsledku (i bez letů – chytrá nápověda pak nabídne vlak/bus).
 * home = origins.home ({ lat, lon, label } | null), origins = letiště odletu s odhadem cesty (ground.minutes),
 * dests = popisy cílů (describe) u hledání ke konkrétnímu cíli, flat = všechny nalezené cesty (nejkratší let k cíli).
 */
export function attachGround({ home, origins = [], groups = [], dests = [], flat = [] }) {
  const access = new Map(origins.map((o) => [o.iata, o.ground?.minutes ?? 0]));
  const accessOf = (iata) => access.get(iata) ?? 0;
  const from = home && Number.isFinite(home.lat) ? home : null;
  const hp = from ? groundPlace(from) : null;
  // Odlet ze země (bez domova): pro cíl bez letů aspoň z hlavního letiště odletu.
  const fallback = !from && origins.length ? pointOfAirport(origins[0].iata) : null;
  // Nejkratší nalezený let tam k cíli (nejlevnější bývá s přestupem na celý den).
  const fastestBy = new Map();
  for (const t of flat) {
    const m = t.out && t.out.durationMin;
    if (m > 0 && t.destKey && !(fastestBy.get(t.destKey) <= m)) fastestBy.set(t.destKey, m);
  }
  const fastest = (g) => fastestBy.get(g.dest.key) || Math.min(...(g.options || [g.best]).map((t) => t.out.durationMin).filter((m) => m > 0));
  for (const g of groups) {
    const fm = fastest(g);
    const x = groundForDest({ home: hp, from, dest: g.dest, trip: g.best, flightMin: Number.isFinite(fm) ? fm : 0, accessOf });
    if (x) g.ground = x;
  }
  // Konkrétní cíl (letiště, město, místo): srovnání pro celý výsledek – s nejlevnějším letem, je-li nějaký.
  for (const d of dests) {
    if (!d || !['airport', 'metro', 'place'].includes(d.type) || !Number.isFinite(d.lat)) continue;
    const dest = { id: d.id, label: d.label, cc: d.cc || '', lat: d.lat, lon: d.lon };
    const near = groups.filter((g) => g.ground && g.dest.lat != null && haversineKm(g.dest.lat, g.dest.lon, d.lat, d.lon) < 80);
    const g = near.sort((x, y) => x.best.perPersonCzk - y.best.perPersonCzk)[0];
    const x = g ? { ...g.ground } : from || fallback ? groundForDest({ home: hp || groundPlace(fallback), from: from || fallback, dest }) : null;
    if (x) return { ...x, flightCzk: g ? g.best.perPersonCzk : null, trips: g ? (g.best.back ? 2 : 1) : null, dest: d.label };
  }
  return null;
}

function pointOfAirport(iata) {
  const a = getAirport(iata);
  return a ? { id: `ap:${a.iata}`, label: a.cityCs, cc: a.cc, lat: a.lat, lon: a.lon } : null;
}
