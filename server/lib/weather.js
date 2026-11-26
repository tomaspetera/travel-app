// Předpověď počasí z MET Norway (Locationforecast 2.0 „complete“, data CC BY 4.0) pro /api/weather. Prohlížeč se ptá
// našeho serveru, ne MET: jejich podmínky chtějí User-Agent s kontaktem, mezipaměť podle hlavičky Expires a nejvýš
// 20 dotazů za sekundu za celou aplikaci – a IP adresa uživatele se k MET nedostane. Open-Meteo, odkud předpověď šla
// dřív, je zdarma jen pro nekomerční weby (plán 1.2, kap. 14 – čistý režim).
// Podmínky: https://api.met.no/doc/TermsOfService (revize 5. 11. 2026), dokumentace Locationforecast 2.0.
import { config } from '../config.js';
import { BRAND } from '../brand.js';
import { airportsNear } from './airports.js';
import { limiter } from './http.js';
import { utcToLocalIso } from './dates.js';

const API = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
export const MAX_PLACES = 40;
// MET: stejný dotaz mimo Skandinávii nejdřív za 3 h (data se tam mění jednou za 6 h), ve Skandinávii za 30 min –
// 3 h stačí všude a šetří dotazy.
const MIN_MS = 3 * 36e5;
const STALE_MS = 12 * 36e5; // výpadek MET: radši předpověď do 12 h starou než žádnou
const MAX_KEYS = 3000; // ~10 dní × 6 čísel na místo – i plná mezipaměť je pár MB
const GAP_MS = 60; // rozestup dotazů → nejvýš ~16 za sekundu (podmínky: celkem pod 20/s)
// Po chybě MET (5xx, 429, timeout) se 2 min neptat vůbec: podmínky chtějí při chybách ustoupit a fronta (2 naráz,
// timeout 10 s) by se jinak plnila místy všech lidí – předpověď by visela minuty i po zotavení MET.
const DOWN_MS = 2 * 60e3;

/** MET symbol_code („lightrainshowers_day“) → kód WMO, se kterým počítá aplikace (ikony wIco, Weather.rainy). */
export function wmoOf(symbol) {
  const s = String(symbol || '').replace(/_(?:day|night|polartwilight)$/, '');
  if (!s) return null;
  const lvl = s.startsWith('light') ? 0 : s.startsWith('heavy') ? 2 : 1;
  if (s.includes('thunder')) return 95;
  if (s.endsWith('snowshowers')) return lvl === 2 ? 86 : 85;
  // déšť se sněhem (sleet) jako déšť: pro výlet je stejně mokro
  if (/(?:rain|sleet)showers$/.test(s)) return [80, 81, 82][lvl];
  if (s.endsWith('snow')) return [71, 73, 75][lvl];
  if (/(?:rain|sleet)$/.test(s)) return [61, 63, 65][lvl];
  return { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45 }[s] ?? null;
}

const max = (a, b) => (a == null || b > a ? b : a);
const min = (a, b) => (a == null || b < a ? b : a);
const num = (v) => (Number.isFinite(v) ? v : null);

/**
 * Časová řada MET → denní souhrny po místních dnech: [{ date, code, hi, lo, pop, rain }]. Kód dne je nejhorší počasí
 * dne (jako dřív u Open-Meteo), srážky součet za den, pop nejvyšší pravděpodobnost srážek (MET ji dává jen
 * ve Skandinávii, jinde null). Hodinové a šestihodinové úseky se v řadě překrývají – každá hodina se počítá jednou.
 * Den, který řada pokryje míň než z poloviny (konec dosahu), vynechá – dnešek stačí od 6 h (zbytek dne od teď).
 */
export function daysFrom(json, tz, lon = 0) {
  const ts = json?.properties?.timeseries;
  if (!Array.isArray(ts)) return [];
  // bez pásma (místo daleko od všech letišť) aspoň sluneční čas podle zeměpisné délky
  const dayOf = (ms) => (tz ? utcToLocalIso(ms, tz) : new Date(ms + Math.round(lon / 15) * 36e5).toISOString()).slice(0, 10);
  const days = new Map();
  let covered = -Infinity, first = null;
  for (const e of ts) {
    const t = Date.parse(e?.time);
    if (!Number.isFinite(t)) continue;
    const date = dayOf(t);
    first ??= date;
    if (!days.has(date)) days.set(date, { date, code: null, hi: null, lo: null, pop: null, rain: 0, hours: 0 });
    const d = days.get(date);
    const temp = num(e.data?.instant?.details?.air_temperature);
    if (temp != null) { d.hi = max(d.hi, temp); d.lo = min(d.lo, temp); }
    if (t < covered) continue;
    const p = e.data?.next_1_hours || e.data?.next_6_hours;
    if (!p) continue;
    const hours = e.data.next_1_hours ? 1 : 6;
    covered = t + hours * 36e5;
    d.hours += hours;
    const det = p.details || {};
    // v šestihodinové části jsou okamžité teploty jen 4× denně – maximum a minimum úseku je přesnější
    if (hours === 6 && num(det.air_temperature_max) != null) d.hi = max(d.hi, det.air_temperature_max);
    if (hours === 6 && num(det.air_temperature_min) != null) d.lo = min(d.lo, det.air_temperature_min);
    if (num(det.precipitation_amount) != null) d.rain += det.precipitation_amount;
    if (num(det.probability_of_precipitation) != null) d.pop = max(d.pop, det.probability_of_precipitation);
    const code = wmoOf(p.summary?.symbol_code);
    if (code != null) d.code = max(d.code, code);
  }
  return [...days.values()]
    .filter((d) => d.code != null && d.hi != null && d.hours >= (d.date === first ? 6 : 12))
    .map((d) => ({ date: d.date, code: d.code, hi: Math.round(d.hi), lo: Math.round(d.lo), pop: d.pop == null ? null : Math.round(d.pop), rain: Math.round(d.rain * 10) / 10 }));
}

/** Počasí teď (první hodina řady) pro okno země: { t, code, wind (km/h), rh (%) } nebo null. */
export function nowFrom(json) {
  const e = json?.properties?.timeseries?.[0]?.data;
  const det = e?.instant?.details || {};
  const t = num(det.air_temperature);
  if (t == null) return null;
  const wind = num(det.wind_speed), rh = num(det.relative_humidity);
  return {
    t: Math.round(t),
    code: wmoOf((e.next_1_hours || e.next_6_hours)?.summary?.symbol_code),
    wind: wind == null ? null : Math.round(wind * 3.6),
    rh: rh == null ? null : Math.round(rh),
  };
}

// shortcut: časové pásmo podle nejbližšího letiště (data/airports.json) – u hranice pásem může vyjít sousední (hranice
// dne a západ slunce o hodinu vedle); kdyby to vadilo, přidat do dat hranice pásem.
const zones = new Map();
export function tzAt(lat, lon) {
  const k = `${lat},${lon}`;
  if (!zones.has(k)) {
    if (zones.size >= MAX_KEYS) zones.clear();
    zones.set(k, airportsNear(lat, lon, 1500, { includeSmall: true, limit: 1 })[0]?.tz || null);
  }
  return zones.get(k);
}

/** pts=„50.09,14.42;48.21,16.37“ → [[lat, lon]] zaokrouhlené na 2 desetinná místa (~1 km), jinak null (nejvýš 40 míst). */
export function parsePts(s) {
  const list = String(s || '').split(';').filter(Boolean);
  if (!list.length || list.length > MAX_PLACES) return null;
  const out = [];
  for (const p of list) {
    const [la, lo, extra] = p.split(',');
    const lat = Number(la), lon = Number(lo);
    if (extra !== undefined || la === '' || lo === '' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    // podmínky MET: nejvýš 4 desetinná místa; 2 stačí a stejná místa se víc potkají v mezipaměti
    out.push([Math.round(lat * 100) / 100, Math.round(lon * 100) / 100]);
  }
  return out;
}

const store = new Map(); // 'lat,lon' → { at, exp, lm, tz, days, now }
const inflight = new Map();
const run = limiter(2);
let nextAt = 0;
let downUntil = 0;
let warned203 = false;
const pace = async () => {
  const now = Date.now(), at = Math.max(now, nextAt);
  nextAt = at + GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
};
// podmínky MET: název aplikace a odkaz, kde najdou kontakt
const userAgent = () => `${BRAND.name}/2.0 ${config.publicUrl}`;
const expOf = (res) => Math.max(Date.now() + MIN_MS, Date.parse(res.headers.get('expires')) || 0);

async function load(lat, lon, old) {
  // místo, které čekalo ve frontě, když MET selhal – hned pryč, bez dotazu
  if (Date.now() < downUntil) throw new Error('MET Norway po chybě chvíli vynechán');
  await pace();
  const headers = { 'User-Agent': userAgent(), Accept: 'application/json' };
  if (old?.lm) headers['If-Modified-Since'] = old.lm; // podmínky: stejná data znovu nestahovat
  const res = await fetch(`${API}?lat=${lat}&lon=${lon}`, { headers, signal: AbortSignal.timeout(10e3) });
  if (res.status === 304 && old) return { ...old, at: Date.now(), exp: expOf(res) };
  if (res.status !== 200 && res.status !== 203) throw new Error(`MET Norway HTTP ${res.status}`);
  if (res.status === 203 && !warned203) {
    warned203 = true;
    console.warn('MET Norway: Locationforecast 2.0 je zastaralá verze (HTTP 203) – do měsíce přejít na novou');
  }
  const json = await res.json();
  const tz = tzAt(lat, lon);
  return { at: Date.now(), exp: expOf(res), lm: res.headers.get('last-modified') || '', tz, days: daysFrom(json, tz, lon), now: nowFrom(json) };
}

/**
 * Předpověď pro místa [[lat, lon]] (z parsePts) → stejně dlouhé pole { tz, days, now } nebo null (bez předpovědi).
 * allow(): smí jít dotaz na MET mimo mezipaměť (limit z jedné adresy – index.js)? Nesmí → místo bez předpovědi.
 * DEMO (bez sítě) předpověď nemá – aplikace pak ukáže dlouhodobý průměr.
 */
export async function weatherAt(pts, { allow = () => true } = {}) {
  if (config.mock) return pts.map(() => null);
  return Promise.all(pts.map(async ([lat, lon]) => {
    const k = `${lat},${lon}`;
    const old = store.get(k);
    if (old && old.exp > Date.now()) return pub(old);
    if (!inflight.has(k)) {
      if (Date.now() < downUntil || !allow()) return old && Date.now() - old.at < STALE_MS ? pub(old) : null;
      const p = run(() => load(lat, lon, old)).catch((e) => {
        if (Date.now() >= downUntil) downUntil = Date.now() + DOWN_MS;
        throw e;
      }).then((v) => {
        store.delete(k); // nejnovější na konec – při plné mezipaměti vypadnou nejdéle neobnovená místa
        store.set(k, v);
        if (store.size > MAX_KEYS) store.delete(store.keys().next().value);
        return v;
      }).finally(() => inflight.delete(k));
      inflight.set(k, p);
    }
    try {
      return pub(await inflight.get(k));
    } catch (e) {
      console.warn(`počasí ${k}: ${e.message}`);
      return old && Date.now() - old.at < STALE_MS ? pub(old) : null;
    }
  }));
}
const pub = (v) => ({ tz: v.tz, days: v.days, now: v.now });

/** Jen pro testy: prázdná mezipaměť a rozestup dotazů. */
export function _resetWeather() {
  store.clear();
  inflight.clear();
  zones.clear();
  nextAt = 0;
  downUntil = 0;
  warned203 = false;
}
