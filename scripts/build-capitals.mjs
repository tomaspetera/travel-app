#!/usr/bin/env node
// Poloha hlavních měst do data/countries.json (capLL: [lat, lon]) pro počasí v okně země: jeden dotaz na předpověď
// místo dvou (geokódování + předpověď) a opravdu hlavní město dané země – hledání jen podle názvu vracelo pro Kostariku
// San José v Kalifornii a pro Seychely Vitórii v Brazílii.
// Zdroj: výpis GeoNames cities15000 (CC BY 4.0; města od 15 000 obyvatel a všechna hlavní města) – hlavní město
// země (druh PPLC) s názvem cap, jinak největší místo s tím názvem v dané zemi, jinak jediné PPLC země.
//   node scripts/build-capitals.mjs [--cache <adresář>]   → doplní / přepíše capLL u všech zemí
// Mezipaměť stažených souborů je stejná jako u scripts/build-places.mjs. Formát souboru zůstává: jedna země na řádek.
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { download, zipLines } from './build-places.mjs';
import { normalize } from '../server/lib/geo.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(root, 'data/countries.json');
const i = process.argv.indexOf('--cache');
const CACHE = i > 0 ? process.argv[i + 1] : path.join(tmpdir(), 'atlas-geonames');
const r2 = (x) => Math.round(x * 100) / 100;

const zip = await download('https://download.geonames.org/export/dump/cities15000.zip', path.join(CACHE, 'cities15000.zip'));
const byCc = new Map();
for await (const l of zipLines(zip, 'cities15000.txt')) {
  const f = l.split('\t');
  if (!byCc.has(f[8])) byCc.set(f[8], []);
  byCc.get(f[8]).push({ name: f[1], names: [f[1], f[2], ...f[3].split(',')].map(normalize), lat: Number(f[4]), lon: Number(f[5]), fc: f[7], pop: Number(f[14]) });
}

const rows = JSON.parse(await readFile(FILE, 'utf8'));
const odd = [];
for (const c of rows) {
  const list = byCc.get(c.iso2) || [];
  const named = (x) => x.names.includes(normalize(c.cap));
  const pplc = list.filter((x) => x.fc === 'PPLC');
  // název z cap má přednost před jediným PPLC: La Paz (PPLC je Sucre), Kapské Město (Pretorie), Malabo (Ciudad de la Paz)
  const g = pplc.find(named) || list.filter(named).sort((a, b) => b.pop - a.pop)[0] || (pplc.length === 1 ? pplc[0] : null);
  if (!g) { odd.push(`${c.iso2} ${c.cap}: nenalezeno`); continue; }
  if (g.fc !== 'PPLC' || !named(g)) odd.push(`${c.iso2} ${c.cap}: ${g.name} (${g.fc})`);
  c.capLL = [r2(g.lat), r2(g.lon)];
}
await writeFile(FILE, `[\n${rows.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`);
console.log(`capLL: ${rows.filter((x) => x.capLL).length}/${rows.length}`);
if (odd.length) console.log('Zkontrolovat:\n  ' + odd.join('\n  '));
