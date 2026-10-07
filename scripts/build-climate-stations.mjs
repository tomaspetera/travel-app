#!/usr/bin/env node
// Doplní data/climate.json o dlouhodobé průměry z meteostanic u letišť. Buňky NASA POWER (0,5° ≈ 50 km,
// scripts/build-climate.mjs) u pobřeží zahrnují i moře a v horách průměrují vrcholy s údolími – u letovisek
// tak denní maxima vycházejí o 1–5 °C níž, než jaká naměří stanice na letišti (Tenerife Jih, Málaga,
// Antalya, Phuket). Pořadí zdrojů pro každé letiště:
//   1. WMO Climatological Standard Normals 1991–2020 (NOAA NCEI, accession 0253808) – oficiální normály,
//      stanice do 10 km od letiště;
//   2. NOAA GHCN-Daily – průměr 1991–2020 spočítaný z denních měření (každý kalendářní měsíc aspoň ze 100 dní
//      z 5 různých let); hlavně země, které normály WMO neposlaly (Řecko, Chorvatsko, Portugalsko, Malta,
//      Mexiko…), jen letiště typu L a M;
//   3. normály WMO ze stanice 10–25 km od letiště nebo spárované podle názvu (Egypt má zaokrouhlené souřadnice);
//   4. jinak zůstává buňka NASA POWER.
// Stanice do 10 km smí mít výšku jinou nejvýš o 150 m (je-li známá), 10–25 km jen ve stejné zemi a nejvýš
// o 100 m. Rozdíl proti buňce NASA přes 10 °C v kterémkoli měsíci = chyba dat nebo jiná krajina → stanice
// se nepoužije. Srážky: normály WMO, u GHCN a chybějících z buňky NASA.
//
//   node scripts/build-climate-stations.mjs               # stáhne zdroje (~560 MB, podruhé už z mezipaměti)
//   node scripts/build-climate-stations.mjs --cache DIR   # jiná mezipaměť (výchozí: dočasná složka systému)
//
// Zapisuje do data/climate.json (buňky NASA nemění, předchozí stanice nahradí):
//   cells["wmo:<id>"] / cells["ghcn:<id>"] = [hi×12, lo×12, srážky×12], airports[IATA] = klíč stanice,
//   stations[klíč] = "název (lat, lon, výška m)", near = [[lat, lon, klíč], …] letiště se stanicí nejvýš 600 m
//   n. m. – místa do 10 km od nich berou data stanice (server/lib/climate.js).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCSV } from './build-airports.mjs';
import { cellOf } from './build-climate.mjs';
import { haversineKm } from '../server/lib/geo.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'data/climate.json');
const WMO = 'https://www.ncei.noaa.gov/data/oceans/archive/arc0216/0253808/1.1/data/0-data';
const GHCN = 'https://www.ncei.noaa.gov/pub/data/ghcn/daily';
const OURAIRPORTS = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const Y0 = 1991;
const Y1 = 2020;
const MAX_DIFF = 10; // °C proti buňce NASA v kterémkoli měsíci
const NEAR_MAX_ELEV = 600; // m – výš už se okolí letiště od něj často liší (Tenerife Sever, El Alto)

const argCache = process.argv.indexOf('--cache');
const CACHE = argCache > 0 ? process.argv[argCache + 1] : path.join(tmpdir(), 'atlas-climate-cache');

async function get(url, name, { gz = false, optional = false } = {}) {
  const file = path.join(CACHE, name);
  if (!existsSync(file)) {
    let err;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
        if (r.status === 404 && optional) return null;
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, Buffer.from(await r.arrayBuffer()));
        err = null;
        break;
      } catch (e) {
        err = e;
        await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
      }
    }
    if (err) {
      if (optional) return null;
      throw err;
    }
  }
  const buf = await readFile(file);
  return (gz ? gunzipSync(buf) : buf).toString('latin1');
}

// Mřížka po 1° pro hledání stanic v okolí.
function grid(items) {
  const g = new Map();
  for (const s of items) {
    const k = `${Math.floor(s.lat)},${Math.floor(s.lon)}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(s);
  }
  return (lat, lon) => {
    const out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(g.get(`${Math.floor(lat) + i},${Math.floor(lon) + j}`) || []));
    return out;
  };
}

// ---------- WMO normály 1991–2020 (souhrnné CSV po veličinách) ----------
function parseWmo(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const f = line.split(',');
    if (f.length < 22) continue;
    const v = f.slice(-13, -1).map((x) => Number(x.trim()));
    const mid = f.slice(7, f.length - 13).join(',').split(',').map((x) => x.trim());
    out.set(f[2].trim(), {
      lat: Number(f[4]), lon: Number(f[5]), el: Number(f[6]), country: mid[0], name: mid.slice(1).join(',').trim(),
      v: v.some((x) => !Number.isFinite(x) || x <= -99) ? null : v,
    });
  }
  return out;
}

async function wmoStations() {
  const load = async (p) => {
    const full = parseWmo(await get(`${WMO}/data-composite-primary-parameters/wmo_normals_9120_${p}.csv`, `wmo_${p}.csv`));
    // normály aspoň z 24 let mají přednost
    const min24 = parseWmo(await get(`${WMO}/data-composite-primary-parameters-min24/wmo_normals_9120_${p}_min24.csv`, `wmo_${p}_min24.csv`));
    for (const [id, s] of min24) if (s.v) full.set(id, s);
    return full;
  };
  const [tx, tn, pr] = [await load('TMAX'), await load('TMIN'), await load('PRCP')];
  const out = [];
  for (const [id, x] of tx) {
    const n = tn.get(id);
    if (!x.v || !n?.v || !valid(x.v, n.v)) continue;
    out.push({
      key: `wmo:${id}`, lat: x.lat, lon: x.lon, el: x.el > -100 && x.el < 6000 ? x.el : null,
      country: x.country, name: x.name, hi: x.v, lo: n.v, p: pr.get(id)?.v || null,
      coarse: Number.isInteger(x.lat) && Number.isInteger(x.lon),
    });
  }
  return out;
}

const valid = (hi, lo) => hi.length === 12 && lo.length === 12 && hi.every((h, i) => h >= lo[i] && h <= 50 && lo[i] >= -70);

// ---------- GHCN-Daily ----------
async function ghcnStations() {
  const inv = new Map();
  for (const l of (await get(`${GHCN}/ghcnd-inventory.txt`, 'ghcnd-inventory.txt')).split('\n')) {
    const el = l.slice(31, 35);
    if (el !== 'TMAX' && el !== 'TMIN') continue;
    const id = l.slice(0, 11);
    const a = Math.max(Number(l.slice(36, 40)), Y0);
    const b = Math.min(Number(l.slice(41, 45)), Y1);
    if (b - a + 1 < 10) continue; // s obdobím 1991–2020 se nepřekrývá aspoň 10 let
    inv.set(id, (inv.get(id) || 0) + 1);
  }
  const out = [];
  for (const l of (await get(`${GHCN}/ghcnd-stations.txt`, 'ghcnd-stations.txt')).split('\n')) {
    const id = l.slice(0, 11);
    if (inv.get(id) !== 2) continue;
    const el = Number(l.slice(31, 37));
    out.push({ key: `ghcn:${id}`, id, fips: id.slice(0, 2), lat: Number(l.slice(12, 20)), lon: Number(l.slice(21, 30)), el: el > -900 ? el : null, name: l.slice(41, 71).trim() });
  }
  return out;
}

/**
 * Průměry 1991–2020 z denních měření stanice → { hi, lo } (°C, po měsících) | null. Každý kalendářní měsíc je
 * průměr všech platných dní (aspoň 100 dní z aspoň 5 různých let): u stanic ze zpráv SYNOP chybí hlavně minima,
 * měsíce s úplnými daty bývají vzácné (Faro, Malta, Soluň), dny ale chybí nahodile.
 */
export function ghcnNormals(csv) {
  const acc = new Map();
  for (const line of csv.split('\n')) {
    const el = line.slice(21, 25);
    if (el !== 'TMAX' && el !== 'TMIN') continue;
    const f = line.split(',');
    if (f[5]) continue; // neprošlo kontrolou kvality
    const y = Number(f[1].slice(0, 4));
    if (y < Y0 || y > Y1) continue;
    const k = `${el}${Number(f[1].slice(4, 6))}`;
    const a = acc.get(k) || { sum: 0, n: 0, years: new Set() };
    a.sum += Number(f[3]) / 10;
    a.n++;
    a.years.add(y);
    acc.set(k, a);
  }
  const month = (el, m) => {
    const a = acc.get(`${el}${m}`);
    return a && a.n >= 100 && a.years.size >= 5 ? a.sum / a.n : null;
  };
  const hi = [];
  const lo = [];
  for (let m = 1; m <= 12; m++) {
    hi.push(month('TMAX', m));
    lo.push(month('TMIN', m));
  }
  if ([...hi, ...lo].some((x) => x == null) || !valid(hi, lo)) return null;
  return { hi, lo };
}

// ---------- letiště ----------
async function airportElevations() {
  const rows = parseCSV(await get(OURAIRPORTS, 'ourairports.csv'));
  const h = rows[0];
  const iI = h.indexOf('iata_code');
  const iE = h.indexOf('elevation_ft');
  const out = new Map();
  for (const r of rows.slice(1)) if (r[iI] && r[iE] !== '' && r[iE] != null) out.set(r[iI], Number(r[iE]) * 0.3048);
  return out;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/(intl|international|airport|aeropuerto|aeroporto|aeroport|havalimani|flughafen|lufthavn|ap|apt|aero)$/g, '')
  .replace(/[^a-z]/g, '');

/** Země stanic podle letišť do 5 km (většina hlasů): název země u WMO / kód FIPS u GHCN → ISO2. */
function countryVotes(stations, near, field) {
  const votes = new Map();
  for (const s of stations) {
    for (const a of near(s.lat, s.lon)) {
      if (haversineKm(s.lat, s.lon, a.lat, a.lon) > 5) continue;
      const k = s[field];
      if (!votes.has(k)) votes.set(k, new Map());
      votes.get(k).set(a.cc, (votes.get(k).get(a.cc) || 0) + 1);
    }
  }
  const out = new Map();
  for (const [k, m] of votes) out.set(k, [...m].sort((x, y) => y[1] - x[1])[0][0]);
  return out;
}

/** Nejbližší vhodná stanice letiště podle pravidel výše | null. */
function pick(a, candidates, ccOf, maxKm = 25) {
  let best = null;
  for (const s of candidates) {
    const km = haversineKm(a.lat, a.lon, s.lat, s.lon);
    if (km > maxKm) continue;
    const de = s.el != null && a.el != null ? Math.abs(s.el - a.el) : null;
    if (km <= 10 ? de != null && de > 150 : ccOf(s) !== a.cc || de == null || de > 100) continue;
    if (!best || km < best.km) best = { s, km };
  }
  return best;
}

function sane(hi, lo, nasa) {
  if (!nasa) return true;
  return hi.every((h, i) => Math.abs(h - nasa[i]) <= MAX_DIFF && Math.abs(lo[i] - nasa[12 + i]) <= MAX_DIFF);
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  console.log(`mezipaměť: ${CACHE}`);
  const clim = JSON.parse(await readFile(OUT, 'utf8'));
  // jen buňky NASA – předchozí běh se nahradí
  const cells = Object.fromEntries(Object.entries(clim.cells).filter(([k]) => !k.includes(':')));
  const elev = await airportElevations();
  const airports = JSON.parse(await readFile(path.join(root, 'data/airports.json'), 'utf8'))
    .map(([iata, name, city, cc, lat, lon, type]) => ({ iata, name, city, cc, lat, lon, type, el: elev.get(iata) ?? null, cell: cellOf(lat, lon) }));
  const nearAirports = grid(airports);
  const nasaOf = (a) => cells[a.cell] || null;

  const wmo = await wmoStations();
  const wmoCc = countryVotes(wmo, nearAirports, 'country');
  const nearWmo = grid(wmo.filter((s) => !s.coarse));
  const coarse = wmo.filter((s) => s.coarse);
  console.log(`WMO: ${wmo.length} stanic s max. i min. teplotami (${coarse.length} se zaokrouhlenými souřadnicemi), ${wmoCc.size} zemí`);

  const ghcn = await ghcnStations();
  const ghcnCc = countryVotes(ghcn, nearAirports, 'fips');
  const nearGhcn = grid(ghcn);
  console.log(`GHCN-Daily: ${ghcn.length} stanic s teplotami v letech ${Y0}–${Y1}, ${ghcnCc.size} zemí`);

  const airportsMap = {};
  const stations = {};
  const stats = { wmo: 0, ghcn: 0, wmoFar: 0, nasa: 0, rejected: 0, ghcnTried: 0 };
  const ghcnUrl = (s) => [`${GHCN}/by_station/${s.id}.csv.gz`, `ghcn/${s.id}.csv.gz`];
  const ghcnCache = new Map();
  const ghcnData = async (s) => {
    if (!ghcnCache.has(s.id)) {
      stats.ghcnTried++;
      const csv = await get(...ghcnUrl(s), { gz: true, optional: true });
      ghcnCache.set(s.id, csv ? ghcnNormals(csv) : null);
    }
    return ghcnCache.get(s.id);
  };
  const use = (a, s, hi, lo, p) => {
    const v = [...hi.map(Math.round), ...lo.map(Math.round), ...p.map(Math.round)];
    cells[s.key] = cells[s.key] || v;
    airportsMap[a.iata] = s.key;
    stations[s.key] = `${s.name} (${s.lat}, ${s.lon}, ${s.el == null ? '?' : Math.round(s.el)} m)`;
  };

  // Kandidáti každého letiště: stanice WMO a (u L a M bez stanice WMO do 10 km) nejbližší stanice GHCN.
  const wmoCcOf = (s) => wmoCc.get(s.country);
  const plans = airports.map((a) => {
    const nasa = nasaOf(a);
    const pNasa = nasa ? nasa.slice(24, 36) : null;
    const w = pick(a, nearWmo(a.lat, a.lon), wmoCcOf);
    const wOk = Boolean(w && sane(w.s.hi, w.s.lo, nasa) && (w.s.p || pNasa));
    const cands = (wOk && w.km <= 10) || !(a.type === 'L' || a.type === 'M') || !pNasa ? [] : nearGhcn(a.lat, a.lon)
      .map((s) => ({ s, km: haversineKm(a.lat, a.lon, s.lat, s.lon) }))
      .filter((x) => x.km <= (wOk ? w.km : 25) && pick(a, [x.s], (s) => ghcnCc.get(s.fips)))
      .sort((x, y) => x.km - y.km)
      .slice(0, 3);
    return { a, nasa, pNasa, w, wOk, cands };
  });
  // denní data nejbližších stanic GHCN stáhne napřed souběžně (náhradní kandidáty až v případě potřeby)
  const first = [...new Map(plans.filter((x) => x.cands.length).map((x) => [x.cands[0].s.id, x.cands[0].s])).values()];
  console.log(`stahuji denní data ${first.length} stanic GHCN…`);
  let fetched = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (first.length) {
      const s = first.shift();
      await get(...ghcnUrl(s), { optional: true });
      if (++fetched % 200 === 0) console.log(`  ${fetched} staženo`);
    }
  }));

  for (const { a, nasa, pNasa, w, wOk, cands } of plans) {
    airportsMap[a.iata] = a.cell;
    if (w && !wOk) stats.rejected++;
    // 1. normály WMO do 10 km
    if (wOk && w.km <= 10) {
      use(a, w.s, w.s.hi, w.s.lo, w.s.p || pNasa);
      stats.wmo++;
      continue;
    }
    // 2. GHCN-Daily (letiště L a M), blíž než stanice WMO 10–25 km
    let done = false;
    if (cands.length) {
      for (const { s } of cands) {
        const g = await ghcnData(s);
        if (!g) continue;
        if (!sane(g.hi, g.lo, nasa)) {
          stats.rejected++;
          continue;
        }
        use(a, s, g.hi, g.lo, pNasa);
        stats.ghcn++;
        done = true;
        break;
      }
    }
    if (done) continue;
    // 3. normály WMO 10–25 km, nebo podle názvu u zaokrouhlených souřadnic
    if (wOk) {
      use(a, w.s, w.s.hi, w.s.lo, w.s.p || pNasa);
      stats.wmoFar++;
      continue;
    }
    const city = norm(a.city);
    const byName = city.length >= 4 && coarse.find((s) => {
      const sn = norm(s.name);
      return wmoCcOf(s) === a.cc && (sn.includes(city) || (sn.length >= 5 && city.includes(sn)))
        && haversineKm(a.lat, a.lon, s.lat, s.lon) <= 150 && (s.el == null || a.el == null || Math.abs(s.el - a.el) <= 150)
        && sane(s.hi, s.lo, nasa) && (s.p || pNasa);
    });
    if (byName) {
      use(a, byName, byName.hi, byName.lo, byName.p || pNasa);
      stats.wmoFar++;
      continue;
    }
    stats.nasa++;
  }

  const near = airports
    .filter((a) => airportsMap[a.iata].includes(':') && a.el != null && a.el <= NEAR_MAX_ELEV)
    .map((a) => [Math.round(a.lat * 1000) / 1000, Math.round(a.lon * 1000) / 1000, airportsMap[a.iata]]);
  await writeFile(OUT, JSON.stringify({
    source: `Meteostanice u letišť: normály WMO ${Y0}–${Y1} (NOAA NCEI) a průměry ${Y0}–${Y1} z denních měření NOAA GHCN-Daily; `
      + 'jinde NASA POWER (MERRA-2, 2001–2020, buňky 0,5°). hi/lo = průměrné denní max./min. °C, p = srážky mm/měsíc',
    cells: Object.fromEntries(Object.entries(cells).sort()),
    airports: airportsMap,
    stations: Object.fromEntries(Object.entries(stations).sort()),
    near,
  }));
  console.log(`hotovo: WMO do 10 km ${stats.wmo}, GHCN ${stats.ghcn}, WMO dál / podle názvu ${stats.wmoFar}, `
    + `NASA ${stats.nasa} (zamítnuto pro rozdíl > ${MAX_DIFF} °C: ${stats.rejected}); stanic GHCN staženo ${stats.ghcnTried}; `
    + `pro místa v okolí ${near.length} letišť`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
