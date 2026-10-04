// Směnné kurzy pro převod cen do Kč.
// Zdroj 1: open.er-api.com (160+ měn vč. MAD, AED, RSD – aerolinky účtují v měně odletového letiště)
// Zdroj 2: ECB denní kurzy (EUR báze)
// Záloha: pevné orientační kurzy (označené jako approx).
import { cache } from './cache.js';
import { request } from './http.js';

// Orientační kurzy za 1 EUR (záloha při výpadku obou zdrojů).
export const FALLBACK_EUR = {
  EUR: 1, CZK: 24.6, USD: 1.1, GBP: 0.85, PLN: 4.25, HUF: 395, RON: 5.0, SEK: 11.2, NOK: 11.6,
  DKK: 7.46, CHF: 0.94, BGN: 1.956, TRY: 45, MAD: 10.8, AED: 4.0, RSD: 117, ALL: 98, MKD: 61.5,
  BAM: 1.956, GEL: 3.0, ILS: 4.1, JOD: 0.78, ISK: 145, SAR: 4.1, QAR: 4.0, EGP: 53, TND: 3.4,
  AMD: 425, AZN: 1.87, KZT: 560, UZS: 14000, MDL: 19.5, UAH: 46, THB: 37, JPY: 165, CNY: 7.9,
  INR: 93, AUD: 1.65, CAD: 1.5, KRW: 1500, SGD: 1.45, MYR: 4.9, IDR: 18000, VND: 28000, ZAR: 20,
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

export async function loadRates() {
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
