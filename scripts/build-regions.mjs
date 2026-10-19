#!/usr/bin/env node
// Hranice pevninských oblastí (Toskánsko, Apulie…) pro vícedenní okruh v Objevuj: zastávky okruhu „po Toskánsku“
// zůstanou v Toskánsku (dřív kruh 120 km kolem Florencie – Ravenna, Rimini, San Marino, Perugia). Jen oblasti,
// které jsou správním celkem (region, kraj, župa); pobřeží a pohoří (Amalfi, Dolomity, Dalmácie) hranici nemají.
// Zdroj: OpenStreetMap přes Nominatim (© přispěvatelé OpenStreetMap, ODbL), zjednodušené na ~2 km.
//   node scripts/build-regions.mjs   → data/regions.json { regions: { key: { name, osm, polys: [[[lon, lat], …], …] } } }
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'data/regions.json');
// klíč oblasti ze server/lib/names.js REGIONS → dotaz na Nominatim (správní celek)
const ADMIN = {
  toskansko: 'Toscana, Italia',
  apulie: 'Puglia, Italia',
  kalabrie: 'Calabria, Italia',
  istrie: 'Istarska županija, Hrvatska',
  algarve: 'Distrito de Faro, Portugal', // Algarve = distrikt Faro
  skotsko: 'Scotland, United Kingdom',
  laponsko: 'Lappi, Suomi',
};
const UA = 'ATLAS-travel/2.0 (hobby travel planner)';
const r4 = (x) => Math.round(x * 1e4) / 1e4;

async function main() {
  const out = {};
  for (const [key, q] of Object.entries(ADMIN)) {
    const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'json', polygon_geojson: '1', polygon_threshold: '0.02', limit: '1' })}`;
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${q}: HTTP ${r.status}`);
    const [hit] = await r.json();
    const g = hit?.geojson;
    if (!g || !/Polygon/.test(g.type)) { console.warn(`${key}: ${q} – bez hranice, vynecháno`); continue; }
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
      .map((p) => p[0].map(([lon, lat]) => [r4(lon), r4(lat)]))
      .filter((ring) => ring.length >= 4);
    out[key] = { name: hit.name, osm: `${hit.osm_type}/${hit.osm_id}`, polys };
    console.log(`${key}: ${hit.display_name} – ${polys.length} částí, ${polys.reduce((s, p) => s + p.length, 0)} bodů`);
    await new Promise((res) => setTimeout(res, 1100)); // Nominatim: nejvýš 1 dotaz za sekundu
  }
  await writeFile(OUT, JSON.stringify({ source: 'OpenStreetMap (Nominatim), © přispěvatelé OpenStreetMap, ODbL; zjednodušeno na ~2 km', regions: out }) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
