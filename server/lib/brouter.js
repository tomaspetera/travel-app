// Klient veřejného plánovače tras BRouter (https://brouter.de – nad OpenStreetMap, zdarma a bez klíče).
// Sdílí ho trasy na kole a pěšky (bike.js) i přejezdy autem mezi místy trasy (transfers.js):
// jeden dotaz naráz a aspoň 1 s mezi dotazy (ohleduplné použití veřejného serveru).
import { request, limiter } from './http.js';

export const BROUTER = (process.env.BROUTER_URL || 'https://brouter.de/brouter').replace(/\/$/, '');
export const UA = 'ATLAS-travel/2.0 (https://github.com/tomaspetera/travel-app; hobby travel planner)';
const limit = limiter(1);
const MAX_QUEUE = 20; // víc čekajících dotazů = přetížení (nebo zneužití) – raději hned odmítnout
let lastCall = 0;
let queued = 0;

/** GET na BRouter ve frontě (mezera mezi dotazy BROUTER_GAP_MS, výchozí 1000 ms); plná fronta → chyba code BUSY. */
export function brouterGet(url, { timeoutMs = 45000, retries = 1 } = {}) {
  if (queued >= MAX_QUEUE) return Promise.reject(Object.assign(new Error('Plánovač tras je přetížený.'), { code: 'BUSY' }));
  queued++;
  return limit(async () => {
    queued--;
    const gap = Number(process.env.BROUTER_GAP_MS ?? 1000);
    const wait = lastCall + gap - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await request(url, { headers: { 'User-Agent': UA }, timeoutMs, retries });
    } finally {
      lastCall = Date.now();
    }
  });
}
