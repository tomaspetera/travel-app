#!/usr/bin/env node
// Hranice pevninských oblastí (Toskánsko, Apulie…) pro vícedenní okruh v Objevuj: zastávky okruhu „po Toskánsku“
// zůstanou v Toskánsku (dřív kruh 120 km kolem Florencie – Ravenna, Rimini, San Marino, Perugia). Jen oblasti,
// které jsou správním celkem (region, kraj, župa); pobřeží a pohoří (Amalfi, Dolomity, Dalmácie) hranici nemají.
// Zdroj: OpenStreetMap přes Nominatim (© přispěvatelé OpenStreetMap, ODbL), zjednodušené na ~2 km.
//   node scripts/build-regions.mjs   → data/regions.json { regions: { key: { name, osm, polys: [[[lon, lat], …], …] } } }
//   node scripts/build-regions.mjs istrie   → jen vybrané oblasti, ostatní v souboru zůstanou
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'data/regions.json');
// klíč oblasti ze server/lib/names.js REGIONS → dotaz na Nominatim (správní celek)
const ADMIN = {
  toskansko: 'Toscana, Italia',
  apulie: 'Puglia, Italia',
  kalabrie: 'Calabria, Italia',
  // Istrie = chorvatská župa + slovinské pobřeží (Koper, Izola, Piran, Ankaran – okruh „po Istrii“ vede i přes Piran)
  istrie: ['Istarska županija, Hrvatska', 'Mestna občina Koper, Slovenija', 'Izola, Slovenija', 'Občina Piran, Slovenija', 'Občina Ankaran, Slovenija'],
  algarve: 'Distrito de Faro, Portugal', // Algarve = distrikt Faro
  skotsko: 'Scotland, United Kingdom',
  laponsko: 'Lappi, Suomi',
};
const UA = 'ATLAS-travel/2.0 (hobby travel planner)';
const r4 = (x) => Math.round(x * 1e4) / 1e4;

async function admin(q) {
  const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'json', polygon_geojson: '1', polygon_threshold: '0.02', limit: '1' })}`;
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${q}: HTTP ${r.status}`);
  const [hit] = await r.json();
  await new Promise((res) => setTimeout(res, 1100)); // Nominatim: nejvýš 1 dotaz za sekundu
  const g = hit?.geojson;
  if (!g || !/Polygon/.test(g.type)) { console.warn(`${q} – bez hranice, vynecháno`); return null; }
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
    .map((p) => p[0].map(([lon, lat]) => [r4(lon), r4(lat)]))
    .filter((ring) => ring.length >= 4);
  console.log(`${hit.display_name} – ${polys.length} částí, ${polys.reduce((s, p) => s + p.length, 0)} bodů`);
  return { name: hit.name, osm: `${hit.osm_type}/${hit.osm_id}`, polys };
}

async function main(only) {
  const prev = only.length ? JSON.parse(await readFile(OUT, 'utf8')).regions : {};
  const out = { ...prev };
  for (const [key, qs] of Object.entries(ADMIN)) {
    if (only.length && !only.includes(key)) continue;
    const parts = [];
    for (const q of [qs].flat()) { const a = await admin(q); if (a) parts.push(a); }
    if (!parts.length) { delete out[key]; continue; }
    out[key] = { name: parts[0].name, osm: parts.map((a) => a.osm).join(' '), polys: parts.flatMap((a) => a.polys) };
  }
  await writeFile(OUT, JSON.stringify({ source: 'OpenStreetMap (Nominatim), © přispěvatelé OpenStreetMap, ODbL; zjednodušeno na ~2 km', regions: out }) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
