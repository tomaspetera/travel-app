#!/usr/bin/env node
// Sestaví data/airport-pax.json: počet cestujících za rok u letišť z data/airports.json (Wikidata, vlastnost P3872
// „patronage“, licence CC0). Podle něj se z okolí vybírají letiště, odkud se opravdu létá – OurAirports označuje
// jako „large_airport“ i Pardubice nebo Karlovy Vary, stejně jako Vídeň.
//
//   node scripts/build-airport-pax.mjs            # dotaz na query.wikidata.org
//   node scripts/build-airport-pax.mjs pax.csv    # lokální CSV se sloupci iata,pax,time,prec
//
// Výstup: { IATA: [tisíce cestujících, rok] }. Rok: poslední od 2022 (po covidu), jinak poslední z let 2015–2019,
// jinak poslední od 2010. Roční údaj, nebo součet všech 12 měsíců.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCSV } from './build-airports.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const QUERY = `SELECT ?iata ?pax ?time ?prec WHERE { ?a wdt:P238 ?iata; p:P3872 ?st. ?st ps:P3872 ?pax.
  OPTIONAL { ?st pqv:P585 ?tv. ?tv wikibase:timeValue ?time; wikibase:timePrecision ?prec } }`;

async function load(src) {
  if (src) return readFile(src, 'utf8');
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`;
  const r = await fetch(url, { headers: { Accept: 'text/csv', 'User-Agent': 'atlas-letenky/1.0 (scripts/build-airport-pax.mjs)' } });
  if (!r.ok) throw new Error(`Wikidata: HTTP ${r.status}`);
  return r.text();
}

/** Řádky [iata, pax, time, prec] → { IATA: [tisíce, rok] } jen pro známá letiště. */
export function paxTable(rows, known) {
  const by = new Map();
  for (const [iata, paxS, time, prec] of rows) {
    const pax = Number(paxS), year = Number(String(time || '').slice(0, 4));
    if (!known.has(iata) || !(pax > 0) || !year) continue;
    const e = by.get(iata) || { annual: new Map(), months: new Map() };
    if (prec === '9') e.annual.set(year, Math.max(e.annual.get(year) || 0, pax));
    else if (prec === '10') {
      const m = e.months.get(year) || new Map();
      const k = String(time).slice(5, 7);
      m.set(k, Math.max(m.get(k) || 0, pax));
      e.months.set(year, m);
    }
    by.set(iata, e);
  }
  const out = {};
  for (const [iata, e] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) {
    const years = new Map(e.annual);
    for (const [y, m] of e.months) if (!years.has(y) && m.size === 12) years.set(y, [...m.values()].reduce((a, b) => a + b, 0));
    const ys = [...years.keys()].sort((a, b) => b - a);
    const y = ys.find((x) => x >= 2022) || ys.find((x) => x >= 2015 && x <= 2019) || ys.find((x) => x >= 2010);
    if (y) out[iata] = [Math.max(1, Math.round(years.get(y) / 1000)), y];
  }
  return out;
}

async function main() {
  const known = new Set(JSON.parse(await readFile(path.join(root, 'data', 'airports.json'), 'utf8')).map((a) => a[0]));
  const [, ...rows] = parseCSV(await load(process.argv[2]));
  const table = paxTable(rows, known);
  const file = path.join(root, 'data', 'airport-pax.json');
  await writeFile(file, '{\n' + Object.entries(table).map(([k, v]) => `"${k}":${JSON.stringify(v)}`).join(',\n') + '\n}\n');
  console.log(`${Object.keys(table).length} letišť s počtem cestujících → ${path.relative(root, file)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
