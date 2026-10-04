#!/usr/bin/env node
// Sestaví data/airports.json z OurAirports (aktuální seznam letišť s pravidelnými lety,
// souřadnice, typ) a OpenFlights (čitelné názvy měst + časová pásma).
//
//   node scripts/build-airports.mjs            # stáhne zdroje z GitHubu
//   node scripts/build-airports.mjs a.csv b.dat  # použije lokální soubory
//
// Výstup: pole [iata, název, město, země(ISO2), lat, lon, typ(L/M/S), tz]
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OURAIRPORTS = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const OPENFLIGHTS = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function load(src) {
  if (/^https?:/.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`${src}: HTTP ${r.status}`);
    return r.text();
  }
  return readFile(src, 'utf8');
}

// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, commas inside quotes).
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function cleanMunicipality(m) {
  return (m || '').replace(/\s*\(.*?\)\s*/g, ' ').split(',')[0].trim();
}

async function main() {
  const [oaSrc = OURAIRPORTS, ofSrc = OPENFLIGHTS] = process.argv.slice(2);
  const [oaText, ofText] = await Promise.all([load(oaSrc), load(ofSrc)]);

  const of = new Map();
  for (const r of parseCSV(ofText)) {
    const iata = r[4];
    if (iata && iata !== '\\N' && iata.length === 3) {
      of.set(iata, { city: r[2], tz: r[11] && r[11] !== '\\N' ? r[11] : '' });
    }
  }

  const [head, ...rows] = parseCSV(oaText);
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const TYPES = { large_airport: 'L', medium_airport: 'M', small_airport: 'S' };
  const out = new Map();
  for (const r of rows) {
    const iata = r[col.iata_code];
    const type = TYPES[r[col.type]];
    if (!iata || iata.length !== 3 || !type || r[col.scheduled_service] !== 'yes') continue;
    const prev = out.get(iata);
    // Duplicitní IATA kódy: ponech větší letiště.
    if (prev && 'LMS'.indexOf(prev[6]) <= 'LMS'.indexOf(type)) continue;
    const ofRow = of.get(iata);
    const city = (ofRow && ofRow.city) || cleanMunicipality(r[col.municipality]) || r[col.name];
    out.set(iata, [
      iata,
      r[col.name],
      city,
      r[col.iso_country],
      Math.round(parseFloat(r[col.latitude_deg]) * 1e4) / 1e4,
      Math.round(parseFloat(r[col.longitude_deg]) * 1e4) / 1e4,
      type,
      (ofRow && ofRow.tz) || '',
    ]);
  }
  const list = [...out.values()].sort((a, b) => a[0].localeCompare(b[0]));
  // Nová letiště (např. BER) v OpenFlights chybí: časové pásmo převezmi z nejbližšího
  // letiště ve stejné zemi.
  const withTz = list.filter((a) => a[7]);
  for (const a of list) {
    if (a[7]) continue;
    let best = null, bestD = Infinity;
    for (const b of withTz) {
      if (b[3] !== a[3]) continue;
      const d = (a[4] - b[4]) ** 2 + ((a[5] - b[5]) * Math.cos((a[4] * Math.PI) / 180)) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) a[7] = best[7];
  }
  const file = path.join(root, 'data', 'airports.json');
  await writeFile(file, '[\n' + list.map((a) => JSON.stringify(a)).join(',\n') + '\n]\n');
  console.log(`airports.json: ${list.length} letišť → ${file}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
