// Travelpayouts / Aviasales Data API – ceny všech aerolinek (i s přestupy) z cache
// vyhledávání uživatelů Aviasales za poslední dny. Zdarma s tokenem z travelpayouts.com.
//   /aviasales/v3/prices_for_dates   bez destinace = nejlevnější lety „kamkoliv“
import { HttpError, limiter, pacer, request } from '../lib/http.js';
import { cache } from '../lib/cache.js';
import { config } from '../config.js';
import { affiliate, affiliateOn } from '../lib/links.js';
import { makeLeg, makeTrip } from '../lib/fares.js';
import { airlineName } from '../lib/airlines.js';
import { getAirport } from '../lib/airports.js';
import { daysBetween, monthsInRange } from '../lib/dates.js';
import { haversineKm } from '../lib/geo.js';

const URL_PFD = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const TTL = 60 * 60e3;
const limit = limiter(4);
// Oficiální limit prices_for_dates je 600 dotazů za minutu na celý token (pak 429 do konce minuty). Souběh 4 to
// nehlídá – při rychlé odpovědi API (~0,15 s) by server poslal ~1 600 za minutu. Tempo 8 dotazů/s (125 ms) a po klidu
// 20 hned = za minutu nejvýš 500, s rezervou pod limitem. Platí pro všechna hledání dohromady (jedno hledání má navíc
// vlastní podíl ve frontě, viz pfd).
export const TP_PACE = { gapMs: 125, burst: 20 };
const pace = pacer(TP_PACE.gapMs, TP_PACE.burst);

const ddmm = (s) => `${s.slice(8, 10)}${s.slice(5, 7)}`;

export function bookingUrl(link, { from, to, dateOut, dateIn = null, adults = 1 } = {}) {
  // odkaz z API (/search/PRG0511LON1?t=…) má na konci kódu trasy vždy 1 cestujícího – nahradit skutečným počtem
  // dospělých (zápis dětí a miminek v adrese Aviasales ověřený nemáme – doplní se na webu, výsledky to říkají)
  const pax = Math.min(9, Math.max(1, Math.round(Number(adults)) || 1));
  const path = link ? `${link.startsWith('/') ? '' : '/'}${link}`.replace(/^(\/search\/[A-Z]{3}\d{4}[A-Z]{3}(?:\d{4})?)\d/, `$1${pax}`) : null;
  const raw = path
    ? `https://www.aviasales.com${path}`
    : `https://www.aviasales.com/search/${from}${ddmm(dateOut)}${to}${dateIn ? ddmm(dateIn) : ''}${pax}`;
  // korunovou verzi Aviasales nemá (currency=czk ignoruje) a bez měny ukáže dolary – eura jsou Čechovi bližší
  const base = `${raw}${raw.includes('?') ? '&' : '?'}currency=eur`;
  if (affiliateOn('aviasales')) return affiliate(base, 'aviasales');
  if (!config.travelpayoutsMarker) return base;
  // Bez čísla projektu (trs) aspoň přímý odkaz s markerem – Aviasales ho při otevření přečte.
  return `${base}${base.includes('?') ? '&' : '?'}marker=${encodeURIComponent(config.travelpayoutsMarker)}`;
}

/**
 * Délka letu z cache Aviasales (duration_to / duration_back), nebo null, když jí nejde věřit. U letů s přestupem
 * bývá kratší, než je možné – nejspíš čistý čas ve vzduchu bez čekání na přestup (QA: U2 PRG→BCN 20:30 → 23:35
 * „3 h 05, 1× přestup“, přímý let trvá 2 h 30; FR LIS→PRG 4 h 15 s přestupem, přímý TAP 3 h 35). S ní by přílet
 * vyšel dřív, než je možné (a „Víc měst“ by na něj navázalo další let). Věří se jí jen, když stačí na přímý let
 * (odhad ze vzdálenosti, +10 % na objížďku přes přestupní letiště) a na každý přestup 80 min (přistání a vzlet navíc
 * a aspoň ~45 min na přestup). Jinak null – přílet a délka jsou pak neznámé (arrUnknown), filtry je neskrývají.
 */
export function cachedDuration(from, to, min, stops) {
  const m = Number(min) > 0 ? Math.round(Number(min)) : null;
  if (!m || !(stops > 0)) return m;
  const a = getAirport(from);
  const b = getAirport(to);
  if (!a || !b) return null;
  const direct = (haversineKm(a.lat, a.lon, b.lat, b.lon) / 780) * 60 + 35;
  return m >= direct * 1.1 + stops * 80 ? m : null;
}

export function parsePricesForDates(json, { adults = 1 } = {}) {
  const out = [];
  for (const d of json?.data || []) {
    if (!(d.price > 0) || !d.departure_at) continue;
    const from = d.origin_airport || d.origin;
    const to = d.destination_airport || d.destination;
    const flightNo = d.airline && d.flight_number ? `${d.airline} ${d.flight_number}` : null;
    const roundTrip = Boolean(d.return_at);
    const url = bookingUrl(d.link, { from, to, dateOut: d.departure_at.slice(0, 10), dateIn: roundTrip ? d.return_at.slice(0, 10) : null, adults });
    const common = { provider: 'travelpayouts', carrier: d.airline || null, carrierName: airlineName(d.airline), live: false, bookUrl: url };
    // let s přestupem bez věrohodné délky: přílet neznámý (arrUnknown), ne dopočtený z nesmyslné délky
    const timed = (a, b, min, stops) => { const m = cachedDuration(a, b, min, stops); return { stops, durationMin: m, ...(stops > 0 && !m ? { arrUnknown: true } : {}) }; };
    const outLeg = makeLeg({
      ...common, flightNo, from, to, dep: d.departure_at,
      czk: roundTrip ? null : d.price, price: roundTrip ? null : d.price, currency: 'CZK',
      ...timed(from, to, d.duration_to || (roundTrip ? null : d.duration), d.transfers ?? 0),
    });
    if (!roundTrip) {
      out.push(makeTrip(outLeg, null, { bookUrl: url }));
      continue;
    }
    const backLeg = makeLeg({
      ...common, flightNo: null, from: to, to: from, dep: d.return_at, czk: null, price: null, currency: 'CZK',
      ...timed(to, from, d.duration_back, d.return_transfers ?? 0),
    });
    out.push(makeTrip(outLeg, backLeg, { combinedCzk: d.price, bookUrl: url }));
  }
  return out;
}

// Trh (market) určuje, z čí mezipaměti hledání se čte – bez něj API bere ruský trh.
// Kdyby API zvolený trh nepřijalo, zkusí se dotaz bez něj (a trh se pro běh serveru vypne).
let marketOk = true;

// Pojistka při výpadku: po 429, 5xx nebo timeoutu / chybě sítě (request už jednou zopakoval) se Travelpayouts na chvíli
// vynechá. Jinak by každý z desítek dotazů hledání (kamkoliv = letiště × měsíce) čekal až 2 × 15 s ve sdílené frontě
// limit(4) – hledání by trvalo minuty a čekali by i ostatní uživatelé (v čistém režimu jediný zdroj letů). Dotazy ve
// frontě pak skončí hned, ceny už uložené v mezipaměti (cache.wrap) se ukazují dál. 429 na dobu z Retry-After, jinak
// z X-Rate-Limit-Reset (Travelpayouts blokuje jen do konce minutového okna; nejvýš 15 min), bez hlaviček 2 min;
// výpadek 1 min. Hledání to hlásí jako výpadek s odpočtem (isBlocked/retryAfter níž).
const block = { until: 0, why: '' };
const blocked = () => Date.now() < block.until;
const blockedError = () => Object.assign(new Error(`Aviasales ${block.why} – na chvíli vynecháno, zkus to za chvíli`), { blocked: true });

/** Pro testy: znovu zapne trh (po pokusu, kdy ho API nepřijalo) a zruší pojistku po výpadku. */
export function resetTravelpayouts() {
  marketOk = true;
  block.until = 0;
}

async function fetchPfd(qs) {
  if (blocked()) throw blockedError();
  const j = await limit(async () => {
    await pace();
    if (blocked()) throw blockedError();
    try {
      return await request(`${URL_PFD}?${qs}`, {
        headers: { 'X-Access-Token': config.travelpayoutsToken },
        timeoutMs: 15000,
        retries: 1,
      });
    } catch (e) {
      const s = Number(e.status) || 0;
      // 400/422 (odmítnutá trasa), 401/403 (token) a neplatné JSON pojistku nespouští – to nejsou výpadky
      if (s !== 429 && s < 500 && e instanceof HttpError) throw e;
      const wait = e.retryAfter || e.rateReset;
      const ms = s === 429 ? (wait > 0 ? Math.min(15 * 60e3, wait * 1000) : 2 * 60e3) : 60e3;
      block.until = Math.max(block.until, Date.now() + ms);
      block.why = s === 429 ? 'teď omezuje dotazy (HTTP 429)' : s ? `má výpadek (HTTP ${s})` : 'neodpovídá';
      console.warn(`Travelpayouts ${block.why} (${e.message}) → vynechán na ${Math.round(ms / 1000)} s`);
      throw blockedError();
    }
  });
  if (j && j.success === false) {
    const err = new Error(`Travelpayouts: ${j.error || 'chyba'}`);
    err.status = 400;
    throw err;
  }
  return j;
}

// share = podíl jednoho hledání ve společné frontě (search.js, limiter na hledání): těžké hledání (rok, okruh, víkendy =
// stovky dotazů) tak drží jen pár míst a malé hledání jiného uživatele nečeká na celou jeho dávku. Mezipaměť a
// souběžné stejné dotazy (cache.wrap) jdou mimo frontu.
async function pfd(params, share = (f) => f()) {
  const base = { currency: 'czk', sorting: 'price', limit: '1000', page: '1', unique: 'false', ...params };
  const market = marketOk ? config.travelpayoutsMarket : '';
  const qs = new URLSearchParams(market ? { ...base, market } : base);
  // Odmítnutý dotaz (400/422) pro jednu trasu = Travelpayouts tu kombinaci nezná (malé letiště,
  // neznámý kód) → „žádné ceny“, ne chyba hledání. Uloží se jen na 15 min.
  const rejected = (e, what) => {
    console.warn(`Travelpayouts odmítl dotaz (${what}): HTTP ${e.status} ${String(e.body || e.message).slice(0, 160)}`);
    return { success: true, data: [], rejected: true };
  };
  return cache.wrap(`tp:${qs}`, (v) => (v?.rejected ? 15 * 60e3 : TTL), () => share(async () => {
    try {
      return await fetchPfd(qs);
    } catch (e) {
      // Jen odmítnutí dotazu (400/422) může znamenat nepodporovaný trh; výpadek sítě nebo timeout ne.
      if (e.status !== 400 && e.status !== 422) throw e;
      if (!market) return rejected(e, `${params.origin}→${params.destination || '*'}`);
      let res;
      try {
        res = await fetchPfd(new URLSearchParams(base));
      } catch (e2) {
        // bez trhu taky chyba → trh za to nemůže (nech ho zapnutý), trasa prostě nemá data
        if (e2.status === 400 || e2.status === 422) return rejected(e2, `${params.origin}→${params.destination || '*'}`);
        throw e2;
      }
      marketOk = false; // bez trhu prošlo → API trh nepřijímá
      return res;
    }
  }));
}

export const travelpayouts = {
  id: 'travelpayouts',
  name: 'Travelpayouts (všechny aerolinky)',
  live: false,
  isBlocked: blocked,
  retryAfter: () => Math.max(0, Math.ceil((block.until - Date.now()) / 1000)), // s do konce pojistky (pro „Zkusit znovu“)

  async stations() {
    return null; // pokrývá prakticky všechna letiště
  },
  async routes() {
    return null;
  },

  /**
   * q: { origin, dateFrom, dateTo, ret?: {nightsMin,nightsMax,backFrom?,backTo?}, destination?, country?, directOnly, adults, share? }
   * Přesné datum (dateFrom = dateTo, u zpáteční i backFrom = backTo) → dotaz na konkrétní den
   * (departure_at/return_at = YYYY-MM-DD), jinak po měsících.
   */
  async explore(q) {
    const back = q.ret?.backFrom && q.ret.backFrom === q.ret.backTo ? q.ret.backFrom : null;
    const parts = await Promise.all(periods(q.dateFrom, q.dateTo).map((m) => pfd({
      origin: q.origin,
      ...(q.destination ? { destination: q.destination } : {}),
      departure_at: m,
      ...(back && m.length === 10 ? { return_at: back } : {}),
      one_way: q.ret ? 'false' : 'true',
      direct: q.directOnly ? 'true' : 'false',
    }, q.share).then((j) => parsePricesForDates(j, q))));
    return parts.flat().filter((t) => {
      if (t.out.date < q.dateFrom || t.out.date > q.dateTo) return false;
      if (t.out.from !== q.origin) return false;
      if (q.country && !countryMatch(t.out.to, q.country)) return false;
      if (!q.ret) return !t.back;
      if (!t.back) return false;
      const n = daysBetween(t.out.date, t.back.date);
      return n >= q.ret.nightsMin && n <= q.ret.nightsMax;
    });
  },

  async daily({ from, to, dateFrom, dateTo, adults = 1, directOnly = false, share }) {
    const parts = await Promise.all(periods(dateFrom, dateTo).map((m) => pfd({
      origin: from, destination: to, departure_at: m, one_way: 'true', direct: directOnly ? 'true' : 'false',
    }, share).then((j) => parsePricesForDates(j, { adults }))));
    return parts.flat().filter((t) => !t.back && t.out.date >= dateFrom && t.out.date <= dateTo).map((t) => t.out);
  },
};

// Období pro departure_at: jeden den → 'YYYY-MM-DD' (přesná data), jinak měsíce 'YYYY-MM'.
function periods(dateFrom, dateTo) {
  return dateFrom === dateTo ? [dateFrom] : monthsInRange(dateFrom, dateTo).map((m) => m.slice(0, 7));
}

function countryMatch(iata, cc) {
  const a = getAirport(iata);
  return !a || a.cc === cc;
}
