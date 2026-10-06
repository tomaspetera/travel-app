#!/usr/bin/env node
// Sestaví data/ground.json pro „Vlak nebo bus místo letadla“:
//  - města RegioJetu (ID, český název, země, poloha) z veřejného seznamu /restapi/consts/locations
//    (1 dotaz; poloha = hlavní zastávka města podle „significance“, RegioJet ji u zastávek uvádí),
//  - UUID měst FlixBusu jen pro odkazy do jeho e-shopu (podmínky FlixBusu automatické využití dat bez
//    smlouvy nepovolují – ceny ani spoje odtud ATLAS nebere) pro města RegioJetu a větší evropská města
//    do ~1300 km od Česka, která ATLAS zná z data/airports.json (velká letiště na pevnině).
//
//   node scripts/build-ground.mjs [--cache <adresář>] [--max 400] [--fresh]
//
// Slušně: FlixBus nejvýš 1 dotaz za sekundu, při chybě 2 opakování s prodlevou, nejvýš --max dotazů;
// odpovědi se ukládají do --cache (výchozí ${TMPDIR}/atlas-ground), takže přerušené sestavení pokračuje
// tam, kde skončilo. Poloha města: RegioJet (zastávka) → FlixBus (střed města) → naše letiště/metropole.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { AIRPORTS, destInfo } from '../server/lib/airports.js';
import { haversineKm, normalize } from '../server/lib/geo.js';
import { LAND_CC, islandOf } from '../server/lib/ground.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'data/ground.json');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const CACHE = arg('--cache', path.join(os.tmpdir(), 'atlas-ground'));
const MAX = Number(arg('--max', 400));
const FRESH = process.argv.includes('--fresh');
const CZ = { lat: 49.8, lon: 15.5 }; // střed Česka
const RANGE_KM = 1300;
const UA = 'ATLAS travel planner build script (https://atlas-letenky.onrender.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (x) => Math.round(x * 1e4) / 1e4;

// Jazyk místních názvů pro FlixBus (IDOS najde „Napoli“, ne „Naples“); cyrilice a řečtina → angličtina.
const LANG = {
  AT: 'de', DE: 'de', CH: 'de', LI: 'de', CZ: 'cs', SK: 'sk', PL: 'pl', HU: 'hu', IT: 'it', SM: 'it', VA: 'it', FR: 'fr', MC: 'fr',
  BE: 'fr', LU: 'fr', NL: 'nl', ES: 'es', AD: 'es', PT: 'pt', HR: 'hr', SI: 'sl', RS: 'sr', BA: 'en', ME: 'sr', AL: 'sq', XK: 'sq',
  RO: 'ro', MD: 'ro', DK: 'da', SE: 'sv', NO: 'no', FI: 'fi', EE: 'et', LV: 'lv', LT: 'lt', MK: 'en', BG: 'en', GR: 'en', UA: 'en',
};
// RegioJet má pro Velkou Británii kód „UK“.
const ccOf = (code) => (code === 'UK' ? 'GB' : String(code || '').toUpperCase());
// RegioJet vede Kolín nad Rýnem jen jako zastávku letiště Kolín/Bonn: v datech je to město Kolín nad Rýnem
// (název ve výpisu, IDOS, Google Mapy a FlixBus Köln); ID i zastávka zůstávají – spoje ukážou „… letiště Terminál 2“.
const RJ_RENAME = { 241620000: { name: 'Kolín nad Rýnem', aliases: ['Köln'] } };

async function fresh(file, days) {
  try {
    return Date.now() - (await stat(file)).mtimeMs < days * 864e5;
  } catch {
    return false;
  }
}

async function getJson(url, headers = {}) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15000) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) return { error: r.status };
      return await r.json();
    } catch (e) {
      last = e;
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw last;
}

/* ---------- RegioJet ---------- */
async function regiojetCities() {
  const file = path.join(CACHE, 'rj-locations.json');
  let j;
  if (!FRESH && (await fresh(file, 7))) j = JSON.parse(await readFile(file, 'utf8'));
  else {
    j = await getJson('https://brn-ybus-pubapi.sa.cz/restapi/consts/locations', { 'X-Lang': 'cs' });
    if (!Array.isArray(j)) throw new Error('RegioJet: neočekávaná odpověď seznamu měst');
    await writeFile(file, JSON.stringify(j));
  }
  const cities = [];
  const stations = {};
  for (const country of j) {
    for (const c of country.cities || []) {
      const st = (c.stations || []).filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
      // název zastávky s městem („Praha hl.n.“, „Vídeň Hbf“) pro výpis spojů
      for (const s of c.stations || []) if (s.id && s.name) stations[s.id] = String(s.fullname || `${c.name} ${s.name}`).replace(' - ', ' ').slice(0, 60);
      if (!st.length) continue;
      // hlavní zastávka = nejnižší significance (RegioJet řadí podle významu), jinak průměr
      const main = st.slice().sort((a, b) => (a.significance ?? 99) - (b.significance ?? 99))[0];
      const avg = { lat: st.reduce((s, x) => s + x.latitude, 0) / st.length, lon: st.reduce((s, x) => s + x.longitude, 0) / st.length };
      // letištní zastávka (Vienna Airport) nesmí odtáhnout střed: hlavní, je-li do 15 km od průměru
      const p = haversineKm(main.latitude, main.longitude, avg.lat, avg.lon) < 15 ? { lat: main.latitude, lon: main.longitude } : avg;
      // latinkou psané jiné názvy (Salzburg, Luxemburg…) – záložní dotaz na FlixBus
      const aliases = (c.aliases || []).filter((a) => /^[\p{Script=Latin}\s.'-]+$/u.test(a) && normalize(a) !== normalize(c.name));
      cities.push({ name: c.name, cc: ccOf(country.code), lat: round(p.lat), lon: round(p.lon), rj: c.id, src: 'rj', aliases, ...RJ_RENAME[c.id] });
    }
  }
  return { cities, stations, count: cities.length };
}

/* ---------- naše větší města (velká letiště na pevnině do ~1300 km) ---------- */
// Letiště za hranicí svého města (EuroAirport Basilej leží ve Francii u Mulhouse): země, anglický název a střed města.
const CITY_ACROSS = { BSL: { cc: 'CH', en: 'Basel', lat: 47.5476, lon: 7.5897 } };
function ourCities() {
  const by = new Map();
  for (const a of AIRPORTS.values()) {
    if (a.type !== 'L' || !LAND_CC.has(a.cc) || islandOf(a.lat, a.lon)) continue;
    if (haversineKm(CZ.lat, CZ.lon, a.lat, a.lon) > RANGE_KM) continue;
    const d = destInfo(a.iata);
    if (by.has(d.key)) continue;
    // „Memmingen (Mnichov)“ → Memmingen; metropole má střed města, jinak poloha letiště
    const x = CITY_ACROSS[a.iata] || {};
    by.set(d.key, { name: d.label.replace(/\s*\(.*\)$/, ''), en: x.en || a.city, cc: x.cc || a.cc, lat: x.lat ?? d.lat, lon: x.lon ?? d.lon, src: 'ap' });
  }
  return [...by.values()];
}

/** Anglický název města u nejbližšího většího letiště do 30 km (OpenFlights), nebo null. */
function airportCity(c) {
  let best = null;
  for (const a of AIRPORTS.values()) {
    if (a.type === 'S' || a.cc !== c.cc || Math.abs(a.lat - c.lat) > 0.5) continue;
    const d = haversineKm(c.lat, c.lon, a.lat, a.lon);
    if (d <= 30 && (!best || d < best.d)) best = { d, city: a.city };
  }
  return best ? best.city : null;
}

/* ---------- FlixBus: UUID města (jen pro odkazy) ---------- */
const AIRPORTISH = /flughafen|airport|aeroporto|aéroport|aeropuerto|letiště|letisko|lotnisko|lotniczy|lufthavn|repülőtér|luchthaven|zračna|hbf|bahnhof|station|nádraží/i;
let cacheMap = {};
let calls = 0;
let lastCall = 0;

async function flixLookup(q, lang, cc) {
  const key = `${lang}|${cc}|${q}`;
  if (cacheMap[key]) return cacheMap[key];
  if (calls >= MAX) return null;
  const wait = lastCall + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  calls++;
  lastCall = Date.now();
  const url = `https://global.api.flixbus.com/search/autocomplete/cities?${new URLSearchParams({ q, lang, country: cc.toLowerCase(), flixbus_cities_only: 'false' })}`;
  let j;
  try {
    j = await getJson(url);
  } catch (e) {
    console.warn(`FlixBus „${q}“: ${e.message}`);
    return null;
  } finally {
    lastCall = Date.now();
  }
  cacheMap[key] = Array.isArray(j) ? j.slice(0, 6).map((x) => ({ id: x.id, name: x.name, country: x.country, fb: x.is_flixbus_city, lat: x.location?.lat, lon: x.location?.lon })) : [];
  await writeFile(path.join(CACHE, 'flixbus-autocomplete.json'), JSON.stringify(cacheMap));
  return cacheMap[key];
}

const similar = (a, b) => Boolean(a && b) && normalize(a).slice(0, 4) === normalize(b).slice(0, 4);
/**
 * Nejlepší město FlixBusu: stejná země, do maxKm od naší polohy, ne letiště/nádraží a podobný název (i jiný
 * název z RegioJetu nebo anglický), nebo blízko (zastávka RegioJetu do 5 km, letiště do 15 km) – jinak by Studénka
 * dostala sousední Ostravu a Ostende Bruggy.
 */
function pickFlix(list, c, maxKm) {
  const ok = (list || []).filter((x) => x.fb && x.id && String(x.country).toUpperCase() === c.cc && Number.isFinite(x.lat)
    && haversineKm(c.lat, c.lon, x.lat, x.lon) <= maxKm && !AIRPORTISH.test(x.name)
    && (haversineKm(c.lat, c.lon, x.lat, x.lon) <= (c.rj ? 5 : 15) || [c.name, c.en, ...(c.aliases || [])].some((n) => similar(x.name, n))));
  return ok[0] || null;
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  try {
    cacheMap = JSON.parse(await readFile(path.join(CACHE, 'flixbus-autocomplete.json'), 'utf8'));
  } catch { /* první běh */ }
  const rj = await regiojetCities();
  console.log(`RegioJet: ${rj.count} měst`);
  const cities = rj.cities;
  // Naše města, která RegioJet nemá (do 25 km od jeho města = totéž město)
  const extra = ourCities().filter((o) => !cities.some((c) => c.cc === o.cc && haversineKm(c.lat, c.lon, o.lat, o.lon) < 25));
  console.log(`Další větší města z našich dat: ${extra.length}`);
  for (const c of [...cities, ...extra]) {
    const lang = LANG[c.cc] || 'en';
    const isRj = Boolean(c.rj);
    // RegioJet: český název; naše města: český název, záložně anglický (OpenFlights)
    let hit = pickFlix(await flixLookup(c.name, lang, c.cc), c, isRj ? 40 : 60);
    const alt = isRj ? (c.aliases || [])[0] : c.en && normalize(c.en) !== normalize(c.name) ? c.en : null;
    if (!hit && alt) hit = pickFlix(await flixLookup(alt, lang, c.cc), c, isRj ? 40 : 60);
    // RegioJet bez shody: ještě anglický název města u letiště do 30 km („Salzburg“)
    const near = isRj && !hit ? airportCity(c) : null;
    if (near && normalize(near) !== normalize(c.name) && normalize(near) !== normalize(alt || '')) hit = pickFlix(await flixLookup(near, lang, c.cc), c, 40);
    if (hit) {
      c.fb = hit.id;
      // místní název pro IDOS a Google Mapy (FlixBus vrací název v jazyce země, u cyrilice anglicky)
      c.loc = hit.name;
      if (!isRj) Object.assign(c, { lat: round(hit.lat), lon: round(hit.lon), src: 'fb' }, c.name.includes('/') ? { name: hit.name } : {});
    }
    if (!c.loc && !['CZ', 'SK'].includes(c.cc) && c.en) c.loc = c.en;
    process.stdout.write(hit ? '+' : '.');
  }
  process.stdout.write('\n');
  const all = [...cities, ...extra.filter((c) => c.fb)]; // naše město bez FlixBusu nic nepřidá
  all.sort((a, b) => a.cc.localeCompare(b.cc) || a.name.localeCompare(b.name, 'cs'));
  const used = new Set(Object.keys(rj.stations));
  const cols = ['name', 'loc', 'cc', 'lat', 'lon', 'rj', 'fb', 'src'];
  const out = {
    built: new Date().toISOString().slice(0, 10),
    sources: {
      regiojet: { url: 'https://brn-ybus-pubapi.sa.cz/restapi/consts/locations', cities: rj.count, note: 'ID měst a poloha hlavní zastávky; podmínky rozhraní nejsou veřejné' },
      flixbus: { url: 'https://global.api.flixbus.com/search/autocomplete/cities', cities: all.filter((c) => c.fb).length, note: 'jen UUID měst pro odkazy do e-shopu FlixBusu' },
      ours: { note: 'velká letiště na pevnině do 1300 km od Česka (data/airports.json) – jen města, která FlixBus zná' },
      src: { rj: 'poloha z RegioJetu (hlavní zastávka)', fb: 'poloha z FlixBusu (střed města)', ap: 'poloha letiště/metropole z našich dat' },
    },
    cols,
    cities: all.map((c) => cols.map((k) => (k === 'loc' ? (c.loc && c.loc !== c.name ? c.loc : '') : c[k] ?? null))),
    stations: Object.fromEntries([...used].sort().map((k) => [k, rj.stations[k]])),
  };
  await writeFile(OUT, JSON.stringify(out).replace(/\],\[/g, '],\n[') + '\n');
  console.log(`${all.length} měst (RegioJet ${rj.count}, s FlixBusem ${all.filter((c) => c.fb).length}), ${calls} dotazů na FlixBus → ${path.relative(root, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
