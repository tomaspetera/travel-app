// Směnné kurzy pro převod cen do Kč.
// Zdroj 1: open.er-api.com (160+ měn vč. MAD, AED, RSD – aerolinky účtují v měně odletového letiště)
// Zdroj 2: ECB denní kurzy (EUR báze)
// Záloha: pevné orientační kurzy (označené jako approx).
import { cache } from './cache.js';
import { request } from './http.js';

// Orientační kurzy za 1 EUR (záloha při výpadku obou zdrojů), aktualizováno 19. 10. 2026 podle ECB a open.er-api.
export const FALLBACK_EUR = {
  EUR: 1, CZK: 24.6, USD: 1.1, GBP: 0.85, PLN: 4.25, HUF: 363, RON: 5.33, SEK: 11.2, NOK: 10.6,
  DKK: 7.46, CHF: 0.94, BGN: 1.956, TRY: 55.7, MAD: 10.8, AED: 4.0, RSD: 117, ALL: 91, MKD: 61.5,
  BAM: 1.956, GEL: 3.0, ILS: 3.48, JOD: 0.78, ISK: 145, SAR: 4.1, QAR: 4.0, EGP: 60, TND: 3.4,
  AMD: 425, AZN: 1.87, KZT: 509, UZS: 14000, MDL: 19.5, UAH: 50.5, THB: 37, JPY: 178, CNY: 7.52,
  INR: 107, AUD: 1.65, CAD: 1.59, KRW: 1500, SGD: 1.45, MYR: 4.59, IDR: 20300, VND: 28000, ZAR: 18.5,
};

let rates = { base: 'EUR', rates: FALLBACK_EUR, source: 'approx', date: null };

async function loadErApi() {
  const j = await request('https://open.er-api.com/v6/latest/EUR', { timeoutMs: 8000, retries: 1 });
  if (j.result !== 'success' || !j.rates || !j.rates.CZK) throw new Error('er-api: neplatná odpověď');
  return { base: 'EUR', rates: { ...FALLBACK_EUR, ...j.rates }, source: 'open.er-api.com', date: j.time_last_update_utc || null };
}

async function loadEcb() {
  const xml = await request('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', { timeoutMs: 8000, retries: 1, as: 'text' });
  const out = { EUR: 1 };
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) out[m[1]] = Number(m[2]);
  if (!out.CZK) throw new Error('ECB: chybí CZK');
  const date = (xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/) || [])[1] || null;
  return { base: 'EUR', rates: { ...FALLBACK_EUR, ...out }, source: 'ECB', date };
}

// Výpadek obou zdrojů se nikam neuloží – bez pojistky by každé hledání i /api/health znovu čekalo na timeouty
// obou zdrojů (8 s × 2 pokusy u každého). Po neúspěchu se proto 15 min zůstává u dosavadních / orientačních kurzů.
const FAIL_MS = 15 * 60e3;
let failedUntil = 0;

export async function loadRates() {
  if (Date.now() < failedUntil) return rates;
  try {
    rates = await cache.wrap('fx:rates', 6 * 3600e3, async () => {
      try {
        return await loadErApi();
      } catch {
        return await loadEcb();
      }
    });
  } catch {
    // Zůstaň u předchozích / orientačních kurzů.
    failedUntil = Date.now() + FAIL_MS;
  }
  return rates;
}

export function setRates(r) {
  rates = r;
}

export function fxInfo() {
  return { source: rates.source, date: rates.date, eurCzk: rates.rates.CZK };
}

/** Převede částku mezi měnami. Neznámá měna → null. */
export function convert(amount, from, to = 'CZK') {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const f = String(from || '').toUpperCase();
  const t = String(to || '').toUpperCase();
  if (f === t) return Number(amount);
  const rf = rates.rates[f];
  const rt = rates.rates[t];
  if (!rf || !rt) return null;
  return (Number(amount) / rf) * rt;
}

export function toCzk(amount, currency) {
  const v = convert(amount, currency, 'CZK');
  return v == null ? null : Math.round(v);
}
