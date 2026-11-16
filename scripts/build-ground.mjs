#!/usr/bin/env node
// Sestaví data/ground.json pro „Vlak nebo bus místo letadla“:
//  - města RegioJetu (ID, český název, země, poloha) z veřejného seznamu /restapi/consts/locations
//    (1 dotaz; poloha = hlavní zastávka města podle „significance“, RegioJet ji u zastávek uvádí),
//  - UUID měst FlixBusu pro odkazy do jeho e-shopu, místní názvy („Wien“, „Napoli“ pro IDOS a Google Mapy)
//    a větší evropská města mimo RegioJet se jen převezmou z dosavadního data/ground.json jako pevné odkazy.
//    Z FlixBusu skript nic nestahuje (CLAUDE.md: FlixBus jen odkazy, nic nenačítat automaticky); nové
//    město RegioJetu tak odkaz na FlixBus nemá, dokud se UUID nedoplní ručně.
//
//   node scripts/build-ground.mjs [--cache <adresář>] [--fresh]
//
// Seznam RegioJetu se ukládá do --cache (výchozí ${TMPDIR}/atlas-ground) na 7 dní; --fresh ho stáhne znovu.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { haversineKm, normalize } from '../server/lib/geo.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'data/ground.json');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const CACHE = arg('--cache', path.join(os.tmpdir(), 'atlas-ground'));
const FRESH = process.argv.includes('--fresh');
const UA = 'ATLAS travel planner build script (https://atlas-letenky.onrender.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (x) => Math.round(x * 1e4) / 1e4;

// RegioJet má pro Velkou Británii kód „UK“.
const ccOf = (code) => (code === 'UK' ? 'GB' : String(code || '').toUpperCase());
// RegioJet vede Kolín nad Rýnem jen jako zastávku letiště Kolín/Bonn: v datech je to město Kolín nad Rýnem
// (název ve výpisu, IDOS, Google Mapy a FlixBus Köln); ID i zastávka zůstávají – spoje ukážou „… letiště Terminál 2“.
const RJ_RENAME = { 241620000: { name: 'Kolín nad Rýnem' } };

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
      cities.push({ name: c.name, cc: ccOf(country.code), lat: round(p.lat), lon: round(p.lon), rj: c.id, src: 'rj', ...RJ_RENAME[c.id] });
    }
  }
  return { cities, stations, count: cities.length };
}

/* ---------- pevné odkazy z dosavadních dat ---------- */
/** Dosavadní data/ground.json jako objekty měst ({ name, loc, cc, lat, lon, rj, fb, src }), nebo []. */
async function previousCities() {
  try {
    const g = JSON.parse(await readFile(OUT, 'utf8'));
    return (g.cities || []).map((row) => Object.fromEntries(g.cols.map((k, i) => [k, row[i]])));
  } catch {
    return [];
  }
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  const prev = await previousCities();
  const rj = await regiojetCities();
  console.log(`RegioJet: ${rj.count} měst`);
  // město RegioJetu podle ID, záložně podle země a názvu (kdyby RegioJet změnil ID)
  const byRj = new Map(prev.filter((p) => p.rj).map((p) => [p.rj, p]));
  const byName = new Map(prev.filter((p) => p.rj).map((p) => [`${p.cc}|${normalize(p.name)}`, p]));
  for (const c of rj.cities) {
    const old = byRj.get(c.rj) || byName.get(`${c.cc}|${normalize(c.name)}`);
    if (old?.fb) c.fb = old.fb;
    if (old?.loc) c.loc = old.loc;
  }
  // větší města mimo RegioJet z dosavadních dat; do 25 km od města RegioJetu = totéž město
  const extra = prev.filter((p) => !p.rj && p.fb && !rj.cities.some((c) => c.cc === p.cc && haversineKm(c.lat, c.lon, p.lat, p.lon) < 25));
  const all = [...rj.cities, ...extra];
  all.sort((a, b) => a.cc.localeCompare(b.cc) || a.name.localeCompare(b.name, 'cs'));
  const used = new Set(Object.keys(rj.stations));
  const cols = ['name', 'loc', 'cc', 'lat', 'lon', 'rj', 'fb', 'src'];
  const out = {
    built: new Date().toISOString().slice(0, 10),
    sources: {
      regiojet: { url: 'https://brn-ybus-pubapi.sa.cz/restapi/consts/locations', cities: rj.count, note: 'ID měst a poloha hlavní zastávky; podmínky rozhraní nejsou veřejné' },
      flixbus: { cities: all.filter((c) => c.fb).length, note: 'jen UUID měst pro odkazy do e-shopu FlixBusu – pevně z dřívějších dat, skript z FlixBusu nic nestahuje' },
      ours: { note: 'větší evropská města mimo RegioJet – pevně z dřívějších dat' },
      src: { rj: 'poloha z RegioJetu (hlavní zastávka)', fb: 'poloha z dřívějších dat (střed města)', ap: 'poloha letiště/metropole z našich dat' },
    },
    cols,
    cities: all.map((c) => cols.map((k) => (k === 'loc' ? (c.loc && c.loc !== c.name ? c.loc : '') : c[k] ?? null))),
    stations: Object.fromEntries([...used].sort().map((k) => [k, rj.stations[k]])),
  };
  await writeFile(OUT, JSON.stringify(out).replace(/\],\[/g, '],\n[') + '\n');
  console.log(`${all.length} měst (RegioJet ${rj.count}, s odkazem na FlixBus ${all.filter((c) => c.fb).length}) → ${path.relative(root, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
