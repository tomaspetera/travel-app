// Klient veřejného plánovače tras BRouter (https://brouter.de – nad OpenStreetMap, zdarma a bez klíče).
// Sdílí ho trasy na kole a pěšky (bike.js) i přejezdy autem mezi místy trasy (transfers.js):
// jeden dotaz naráz a aspoň 1 s mezi dotazy (ohleduplné použití veřejného serveru).
import { request, limiter } from './http.js';

export const BROUTER = (process.env.BROUTER_URL || 'https://brouter.de/brouter').replace(/\/$/, '');
export const UA = 'Letsi/2.0 (+https://letsi.cz; travel planner)';
const limit = limiter(1);
const MAX_QUEUE = 20; // víc čekajících dotazů = přetížení (nebo zneužití) – raději hned odmítnout
let lastCall = 0;
let queued = 0;
// Po výpadku (síť, timeout, 5xx, 429) se 1 min neptat vůbec: fronta je jedna (1 dotaz naráz, až 2× 45 s) a čekající
// trasy by jinak visely za dalšími timeouty i desítky minut. Chyba výpočtu (400 – trasa nenalezena) výpadek není.
const DOWN_MS = 60e3;
let downUntil = 0;
const outage = (e) => !e?.status || e.status >= 500 || e.status === 429;
/** Vynulování pojistky (testy). */
export const resetBrouter = () => { downUntil = 0; };

/**
 * GET na BRouter ve frontě (mezera mezi dotazy BROUTER_GAP_MS, výchozí 1000 ms); plná fronta → chyba code BUSY,
 * minutu po výpadku → hned chyba skipped.
 */
export function brouterGet(url, { timeoutMs = 45000, retries = 1 } = {}) {
  if (queued >= MAX_QUEUE) return Promise.reject(Object.assign(new Error('Plánovač tras je přetížený.'), { code: 'BUSY' }));
  queued++;
  return limit(async () => {
    queued--;
    // čekal ve frontě, když BRouter selhal – hned pryč, bez dotazu (bez status = volající to bere jako výpadek)
    if (Date.now() < downUntil) throw Object.assign(new Error('Plánovač tras po chybě chvíli vynechán.'), { skipped: true });
    const gap = Number(process.env.BROUTER_GAP_MS ?? 1000);
    const wait = lastCall + gap - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await request(url, { headers: { 'User-Agent': UA }, timeoutMs, retries });
    } catch (e) {
      if (outage(e)) downUntil = Date.now() + DOWN_MS;
      throw e;
    } finally {
      lastCall = Date.now();
    }
  });
}
