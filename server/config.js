// Konfigurace z proměnných prostředí (volitelně ze souboru .env v kořeni projektu).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const env = process.env;
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

export const config = {
  root,
  port: num(env.PORT, 8080),
  host: env.HOST || '0.0.0.0',
  // ATLAS_MOCK=1 → generovaná ukázková data (offline demo, testy). V UI je jasně označeno.
  mock: env.ATLAS_MOCK === '1' || process.argv.includes('--demo'),
  ryanair: env.RYANAIR_ENABLED !== '0',
  wizz: env.WIZZ_ENABLED !== '0',
  travelpayoutsToken: env.TRAVELPAYOUTS_TOKEN || '',
  travelpayoutsMarker: env.TRAVELPAYOUTS_MARKER || '',
  // Kolik odletových letišť nejvýše prohledat v jednom dotazu.
  maxOrigins: num(env.MAX_ORIGINS, 8),
  // Wizz Air nemá „kamkoliv“ endpoint → 1 dotaz na trasu; strop na jedno hledání.
  wizzMaxCalls: num(env.WIZZ_MAX_CALLS, 90),
  // Ochrana veřejně nasazeného serveru: max. počet hledání z jedné IP za 10 minut (0 = bez limitu).
  searchesPer10Min: num(env.SEARCH_RATE_LIMIT, 40),
};
