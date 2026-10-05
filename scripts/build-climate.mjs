#!/usr/bin/env node
// Sestaví data/climate.json: průměrné měsíční podnebí u každého letiště (pro „kam za teplem“
// a nejlepší měsíce cesty). Zdroj: NASA POWER Climatology API (MERRA-2, průměr 2001–2020),
// zdarma a bez klíče, data jsou volně použitelná (https://power.larc.nasa.gov/).
//
//   node scripts/build-climate.mjs           # stáhne vše (≈ 3 800 dotazů, ~15 min)
//   node scripts/build-climate.mjs --resume  # doplní jen chybějící buňky
//
// Výstup: { source, cells: { "lat,lon": [hi×12, lo×12, srážky mm×12] }, airports: { IATA: "lat,lon" } }
// Buňky po 0,5° (letiště ve stejné buňce sdílí data – rozlišení zdroje je ~0,5°).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'data/climate.json');
const API = 'https://power.larc.nasa.gov/api/temporal/climatology/point';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const cellOf = (lat, lon) => `${Math.round(lat * 2) / 2},${Math.round(lon * 2) / 2}`;

async function fetchCell(key) {
  const [lat, lon] = key.split(',').map(Number);
  const url = `${API}?parameters=T2M,T2M_RANGE,PRECTOTCORR&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) return null;
      const p = (await r.json()).properties?.parameter;
      if (!p?.T2M) return null;
      const t = MONTHS.map((m) => p.T2M[m]);
      const rg = MONTHS.map((m) => p.T2M_RANGE[m]);
      const pr = MONTHS.map((m) => p.PRECTOTCORR[m]);
      if ([...t, ...rg, ...pr].some((x) => x == null || x < -900)) return null;
      // průměrné denní maximum / minimum ≈ průměr ± polovina průměrného denního rozpětí
      return [
        ...t.map((x, i) => Math.round(x + rg[i] / 2)),
        ...t.map((x, i) => Math.round(x - rg[i] / 2)),
        ...pr.map((x, i) => Math.round(x * DAYS[i])),
      ];
    } catch (e) {
      await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
    }
  }
  return null;
}

async function main() {
  const airports = JSON.parse(await readFile(path.join(root, 'data/airports.json'), 'utf8'));
  const resume = process.argv.includes('--resume');
  const prev = resume ? JSON.parse(await readFile(OUT, 'utf8').catch(() => '{}')) : {};
  const cells = { ...(prev.cells || {}) };
  const byAirport = {};
  for (const a of airports) byAirport[a[0]] = cellOf(a[4], a[5]);
  const todo = [...new Set(Object.values(byAirport))].filter((k) => !cells[k]).sort();
  console.log(`${todo.length} buněk ke stažení`);
  let done = 0;
  let failed = 0;
  const save = () => writeFile(OUT, JSON.stringify({
    source: 'NASA POWER Climatology (MERRA-2, 2001–2020); hi/lo = průměrné denní max./min. °C, p = srážky mm/měsíc',
    cells: Object.fromEntries(Object.entries(cells).sort()),
    airports: byAirport,
  }));
  const queue = [...todo];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const key = queue.shift();
      const v = await fetchCell(key);
      if (v) cells[key] = v; else failed++;
      if (++done % 200 === 0) { console.log(`${done}/${todo.length} (chyb ${failed})`); await save(); }
    }
  }));
  await save();
  console.log(`hotovo: ${Object.keys(cells).length} buněk, chyb ${failed}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
