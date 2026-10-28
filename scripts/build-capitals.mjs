#!/usr/bin/env node
// Poloha hlavních měst do data/countries.json (capLL: [lat, lon]) pro počasí v okně země: aplikace pak volá Open-Meteo
// jedním dotazem (předpověď) místo dvou (geokódování + předpověď) a bere opravdu hlavní město dané země – geokódování
// jen podle názvu vracelo pro Kostariku San José v Kalifornii a pro Seychely Vitórii v Brazílii.
// Zdroj: geokódování Open-Meteo (GeoNames, CC BY 4.0) s filtrem země, přednost má záznam s druhem PPLC (hlavní město).
//   node scripts/build-capitals.mjs        → doplní / přepíše capLL u všech zemí
// Formát souboru zůstává: jedna země na řádek.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(root, 'data/countries.json');
// název pro geokódování, kde se liší od cap (GeoNames zná sídlo pod jiným jménem)
const ALIAS = { YE: 'Sanaa', PW: 'Melekeok' }; // „Sana'a“ najde letiště, Ngerulmud leží v Melekeoku
const r2 = (x) => Math.round(x * 100) / 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(name, cc) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '10', language: 'en', format: 'json', countryCode: cc })}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const res = ((await r.json()).results || []).filter((x) => x.country_code === cc);
      return res.find((x) => x.feature_code === 'PPLC') || res[0] || null;
    } catch (e) { if (i === 2) throw e; await sleep(2000 * (i + 1)); }
  }
  return null;
}

const text = await readFile(FILE, 'utf8');
const rows = JSON.parse(text);
const odd = [];
for (const c of rows) {
  const g = await geocode(ALIAS[c.iso2] || c.cap, c.iso2);
  if (!g) { odd.push(`${c.iso2} ${c.cap}: nenalezeno`); continue; }
  if (g.feature_code !== 'PPLC') odd.push(`${c.iso2} ${c.cap}: ${g.name} (${g.feature_code})`);
  c.capLL = [r2(g.latitude), r2(g.longitude)];
  await sleep(150);
}
await writeFile(FILE, `[\n${rows.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`);
console.log(`capLL: ${rows.filter((x) => x.capLL).length}/${rows.length}`);
if (odd.length) console.log('Zkontrolovat:\n  ' + odd.join('\n  '));
