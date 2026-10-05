// Kiwi.com – oficiální MCP server (https://mcp.kiwi.com), zdarma a bez klíče.
// Živé ceny prakticky všech aerolinek (nízkonákladové i klasické, včetně kombinací
// s přestupem na samostatné letenky – „virtual interlining“) + odkaz na rezervaci.
// Protokol: JSON-RPC 2.0 přes MCP Streamable HTTP (odpověď může být JSON i SSE),
// nástroj `search-flight`. Cílem může být letiště, víc letišť („BKK,HKT“), země („TH“) i „anywhere“;
// odkud také víc letišť najednou („PRG,VIE,MUC“). Jeden dotaz vrací nejvýš 15 itinerářů.
import { limiter } from '../lib/http.js';
import { cache } from '../lib/cache.js';
import { makeLeg, makeTrip } from '../lib/fares.js';
import { airlineName } from '../lib/airlines.js';
import { chunkRange } from '../lib/dates.js';
import { toCzk } from '../lib/fx.js';

const ENDPOINT = 'https://mcp.kiwi.com';
const PROTOCOL = '2025-06-18';
const TTL = 30 * 60e3;
const limit = limiter(3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(400);
const session = { id: null, at: 0, pending: null };
let rpcId = 10;
// Opakování: Kiwi občas vrátí 503/502 nebo spojení spadne (z domácí sítě ~13 % dotazů) – initialize
// i search-flight se proto zkusí ještě 2× (429 jen 1×) s krátkou pauzou, pokud to stihne termín hledání.
const RETRY = { baseMs: 500 };
// Pojistka proti skutečnému výpadku: Kiwi se na chvíli vynechá, až když po opakování selhávají dotazy
// aspoň ze 2 různých hledání (a nejméně 3 dotazy) bez jediného úspěchu mezi nimi. Série chyb v jednom
// hledání vypne Kiwi jen pro to hledání (ctx.down). Vynechání trvá 1 min, při opakovaném výpadku déle (max. 3 min).
const breaker = { until: 0, trips: 0, failed: 0, searches: new Set() };
export const kiwiBlocked = () => Date.now() < breaker.until;
/** Za kolik sekund se Kiwi zase zkusí (0 = hned). */
export const kiwiRetryAfter = () => Math.max(0, Math.ceil((breaker.until - Date.now()) / 1000));

/** Stav Kiwi v rámci jednoho hledání (počty úspěchů, chyb, opakování) – předává se jako ctx. */
export function kiwiContext() {
  return { id: Symbol('kiwi-search'), ok: 0, failed: 0, retried: 0, skipped: 0, streak: 0, down: false, blocked: false };
}

function noteSuccess(ctx) {
  if (ctx) {
    ctx.ok++;
    ctx.streak = 0;
  }
  breaker.failed = 0;
  breaker.trips = 0;
  breaker.searches.clear();
}

function noteFailure(ctx) {
  if (ctx) {
    ctx.failed++;
    // 3 neúspěšné dotazy za sebou (každý už po opakování) → zbytek tohoto hledání bez Kiwi
    if (++ctx.streak >= 3) ctx.down = true;
  }
  breaker.failed++;
  breaker.searches.add(ctx?.id ?? Symbol('kiwi-call'));
  if (breaker.searches.size >= 2 && breaker.failed >= 3) {
    breaker.until = Date.now() + Math.min(3, ++breaker.trips) * 60e3;
    breaker.failed = 0;
    breaker.searches.clear();
  }
}

export function resetKiwi({ retryMs = 500 } = {}) {
  breaker.until = 0;
  breaker.trips = 0;
  breaker.failed = 0;
  breaker.searches.clear();
  RETRY.baseMs = retryMs;
  session.id = null;
  session.at = 0;
}

// Přechodná chyba, kterou má smysl zopakovat: 429, 5xx, spadlé spojení, timeout.
const transient = (e) => e.status === 429 || e.status >= 500 || /timeout|fetch failed|ECONN|socket|terminated|network/i.test(e.message);
// Chyba platnosti session (server ji zapomněl) → nová session a pokus znovu.
const sessionError = (e) => e.status === 400 || e.status === 404 || /session/i.test(e.message);

/**
 * fn(msLeft) s opakováním přechodných chyb: 5xx/síť až 2× (pauza ~0,5 s, pak ~1,5 s), 429 jen 1× (~1,5 s).
 * Opakuje se jen, když do konce (end) zbývá na pauzu i na další dotaz aspoň 3 s.
 */
async function withRetry(fn, { end, ctx }) {
  for (let i = 0; ; i++) {
    try {
      const out = await fn(end - Date.now());
      if (ctx) ctx.attemptStreak = 0;
      return out;
    } catch (e) {
      const max = e.status === 429 ? 1 : 2;
      const wait = (e.status === 429 ? 3 : 3 ** i) * RETRY.baseMs + Math.random() * RETRY.baseMs * 0.2;
      // 3 neúspěšné pokusy za sebou v tomto hledání (i souběžných dotazů) bez úspěchu mezi nimi = Kiwi teď
      // nejede → už neopakovat. Kontrola i po pauze: souběžné dotazy mezitím mohly selhat taky.
      if (ctx && transient(e)) ctx.attemptStreak = (ctx.attemptStreak || 0) + 1;
      const down = () => ctx && ctx.attemptStreak >= 3;
      // e.retried: chyba, kterou už opakoval vnořený withRetry (initialize) – znovu ne, jinak by se pokusy násobily.
      if (i >= max || !transient(e) || e.retried || down() || Date.now() + wait + 3000 > end) {
        e.retried = true;
        throw e;
      }
      await sleep(wait);
      if (down()) {
        e.retried = true;
        throw e;
      }
      if (ctx) ctx.retried++;
    }
  }
}

/** Tělo odpovědi MCP: buď JSON-RPC objekt, nebo SSE („data: {…}“ řádky). */
export function parseRpcBody(text) {
  try {
    const j = JSON.parse(text);
    if (j && (j.result || j.error)) return j;
  } catch { /* SSE */ }
  let last = null;
  let data = [];
  const flush = () => {
    if (!data.length) return;
    const joined = data.join('\n');
    data = [];
    try {
      const j = JSON.parse(joined);
      if (j && (j.result || j.error)) last = j;
    } catch { /* ignoruj neúplný rámec */ }
  };
  for (const line of String(text).split(/\r?\n/)) {
    if (line === '') flush();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  flush();
  if (!last) throw new Error('Kiwi: odpověď neobsahuje JSON-RPC výsledek');
  return last;
}

async function post(body, sessionId, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId, 'mcp-protocol-version': PROTOCOL } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (body.id == null && res.ok) return { rpc: null, sessionId }; // notifikace: 202 bez těla
    if (!res.ok) {
      const err = new Error(`Kiwi: HTTP ${res.status}${res.status === 429 ? ' (příliš mnoho dotazů)' : ''}`);
      err.status = res.status;
      throw err;
    }
    const rpc = parseRpcBody(text);
    if (rpc.error) throw new Error(`Kiwi: ${rpc.error.message || 'chyba'} (${rpc.error.code})`);
    return { rpc, sessionId: res.headers.get('mcp-session-id') };
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('Kiwi: timeout');
      // Zkrácený čas podle termínu hledání není chyba služby (nepočítá se do pojistky).
      err.short = timeoutMs < 25000;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureSession({ end = Date.now() + 40000, ctx = null } = {}) {
  if (session.at && Date.now() - session.at < 10 * 60e3) return session.id;
  if (session.pending) return session.pending;
  session.pending = (async () => {
    try {
      const { sessionId } = await withRetry((left) => post({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'atlas-travel', version: '2.0.0' } },
      }, null, Math.min(20000, left)), { end, ctx });
      // Bezstavový server hlavičku vynechá – pak se pokračuje bez ní.
      session.id = (sessionId || '').trim() || null;
      // MCP: po initialize klient oznámí dokončení (notifications/initialized); chyba nevadí.
      await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session.id).catch(() => {});
      session.at = Date.now();
      return session.id;
    } finally {
      session.pending = null;
    }
  })();
  return session.pending;
}

/**
 * Jeden dotaz search-flight. `deadline` (ms) platí i pro čekání ve frontě: po získání místa se
 * zkontroluje znovu a samotný dotaz (i s opakováním) dostane jen zbývající čas (jeden pokus nejvýš 30 s).
 * ctx = kiwiContext() jednoho hledání: počítá úspěchy/chyby/opakování a po sérii chyb zbytek hledání vynechá.
 */
async function searchFlight(args, { deadline = null, ctx = null } = {}) {
  const key = `kiwi:${JSON.stringify(args)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = limit(async () => {
    if (kiwiBlocked()) {
      if (ctx) {
        ctx.skipped++;
        ctx.blocked = true;
      }
      throw new Error('Kiwi: dočasně vynecháno po předchozích chybách');
    }
    if (ctx?.down) {
      ctx.skipped++;
      throw new Error('Kiwi: neodpovídá – další dotazy vynechány');
    }
    if (deadline && Date.now() > deadline - 1500) throw new Error('Kiwi: vypršel čas na hledání');
    await pause();
    try {
      const json = await callSearch(args, { end: deadline || Date.now() + 40000, ctx });
      // Kiwi mění rozhraní bez ohlášení: když nepřevzalo počet cestujících, ceny by nesedily.
      if (json?.passengers && Number(json.passengers.adults) !== Number(args.adults)) {
        throw new Error(`Kiwi: změnilo se rozhraní (cestujících ${json.passengers.adults} místo ${args.adults})`);
      }
      cache.set(key, json, TTL);
      noteSuccess(ctx);
      return json;
    } catch (e) {
      // Pojistka jen při chybě služby; vlastní časový limit hledání (zkrácený timeout podle deadline) ne.
      if (transient(e) && !e.short) noteFailure(ctx);
      throw e;
    }
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
const inflight = new Map();

async function callSearch(args, { end, ctx }) {
  const call = async (left) => {
    const sid = await ensureSession({ end, ctx });
    const body = () => ({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: 'search-flight', arguments: args } });
    try {
      return unwrap(await post(body(), sid, Math.min(30000, left)));
    } catch (e) {
      // Vypršelá / zapomenutá session → nová a jeden pokus navíc.
      if (!sessionError(e) || e.status >= 500) throw e;
      session.at = 0;
      session.id = null;
      return unwrap(await post(body(), await ensureSession({ end, ctx }), Math.min(30000, end - Date.now())));
    }
  };
  return withRetry(call, { end, ctx });
}

function unwrap(out) {
  const res = out.rpc.result || {};
  if (res.isError) {
    const msg = (res.content || []).find((c) => c.type === 'text')?.text || '';
    throw new Error(`Kiwi: nástroj vrátil chybu${msg ? ` – ${msg.slice(0, 160)}` : ''}`);
  }
  const text = (res.content || []).find((c) => c.type === 'text' && c.text)?.text;
  if (!text) throw new Error('Kiwi: prázdná odpověď');
  return JSON.parse(text);
}

const dmy = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** Číslo letu „FR 13“: Kiwi posílá „FR13“ (s kódem), starší tvar jen „13“. */
export function flightNoOf(seg) {
  const c = String(seg?.carrier || '');
  const n = String(seg?.flightNumber || '');
  if (!n) return c || null;
  const num = c && n.toUpperCase().startsWith(c.toUpperCase()) ? n.slice(c.length) : n;
  return c ? `${c} ${num.trim()}` : num;
}

function legOf(l, itinerary, currency, adults, combined) {
  if (!l) return null;
  const segs = l.segments || [];
  const from = l.from || segs[0]?.from;
  const to = l.to || segs.at(-1)?.to;
  if (!from || !to || (!l.departureTime && !segs[0]?.departureTime)) return null;
  const carriers = [...new Set(segs.map((s) => s.carrier).filter(Boolean))];
  return makeLeg({
    provider: 'kiwi',
    carrier: carriers[0] || null,
    carriers: segs.map((s) => s.carrier).filter(Boolean), // po úsecích – kvůli poplatkům za zavazadla
    carrierName: carriers.map(airlineName).join(' + ') || 'Kiwi.com',
    flightNo: segs.map(flightNoOf).filter(Boolean).join(', ') || null,
    from,
    to,
    dep: l.departureTime || segs[0].departureTime,
    arr: l.arrivalTime || segs.at(-1)?.arrivalTime,
    // Cena za cestu je za všechny cestující → přepočti na osobu.
    price: combined ? null : itinerary.price / adults,
    currency,
    stops: Number.isFinite(l.stops) && l.stops > 0 ? l.stops : Math.max(0, segs.length - 1),
    durationMin: l.durationSeconds ? Math.round(l.durationSeconds / 60) : null,
    bookUrl: itinerary.bookingUrl || null,
  });
}

/** search-flight → cesty (jednosměrné, nebo zpáteční se společnou cenou). */
export function parseKiwiSearch(json, { adults = 1 } = {}) {
  const currency = json?.currency || 'EUR';
  const out = [];
  for (const it of json?.itineraries || []) {
    if (!(it.price > 0)) continue;
    const roundTrip = Boolean(it.inbound);
    const o = legOf(it.outbound, it, currency, adults, roundTrip);
    if (!o) continue;
    if (!roundTrip) {
      out.push(makeTrip(o, null, { bookUrl: it.bookingUrl }));
      continue;
    }
    const b = legOf(it.inbound, it, currency, adults, true);
    if (!b) continue;
    const czk = toCzk(it.price / adults, currency);
    if (czk == null) continue;
    out.push(makeTrip(o, b, { combinedCzk: czk, bookUrl: it.bookingUrl }));
  }
  return out;
}

export const kiwi = {
  id: 'kiwi',
  name: 'Kiwi.com',
  live: true,
  async stations() {
    return null;
  },
  async routes() {
    return null;
  },
  callsPerRoute: (dateFrom, dateTo) => chunkRange(dateFrom, dateTo, 7).length,
  // Dotazy jsou pomalejší (~1–2 s) → v režimu konkrétního cíle jen pár hlavních letišť.
  maxPairs: 3,
  // Rozpočet dotazů na jedno hledání (~1–2 s každý, 2 souběžně) – u dlouhého rozsahu dat méně letišť
  // a nejvýš 20 s, pak se hledání vrátí s tím, co Kiwi stihlo.
  maxCalls: 24,
  maxMs: 20000,
  // Hledání do zemí / „kamkoliv“: dotazy po zemích a měsících, nejvýš 25 s.
  exploreMs: 25000,
  // Stav Kiwi v jednom hledání (ctx pro daily/search) a čekání po výpadku – pro průběh hledání v UI.
  context: kiwiContext,
  retryAfter: kiwiRetryAfter,

  /**
   * Nejlevnější lety po dnech: okna po 7 dnech (rozsah departureDate..departureDateTo). Chyba jednoho okna nezahodí ostatní;
   * po termínu `deadline` (ms) se další okna už nedotazují – vrátí se, co je hotové.
   * from/to: letiště, nebo seznam letišť (víc letišť jedním dotazem, nejvýš 25 – limit 100 znaků).
   */
  async daily({ from, to, dateFrom, dateTo, adults = 1, directOnly = false, deadline = null, ctx = null }) {
    const legs = [];
    let failed = 0;
    let lastErr = null;
    const froms = [].concat(from).slice(0, 25);
    const tos = [].concat(to).slice(0, 25);
    // jen lety mezi zadanými letišti (odpověď je cizí data – jiné letiště by se ve výsledcích jen tvářilo jako cíl)
    const fromSet = new Set(froms);
    const toSet = new Set(tos);
    const windows = chunkRange(dateFrom, dateTo, 7);
    for (const [a, b] of windows) {
      if (deadline && Date.now() > deadline) { failed++; lastErr = lastErr || new Error('Kiwi: vypršel čas na hledání'); continue; }
      try {
        // Okno [a..b] jedním dotazem (departureDate + departureDateTo); ceny za všechny cestující.
        const json = await searchFlight({
          flyFrom: froms.join(','), flyTo: tos.join(','), departureDate: dmy(a), ...(b > a ? { departureDateTo: dmy(b) } : {}),
          adults, sort: 'price', currency: 'EUR', locale: 'en', cabinClass: 'M',
          ...(directOnly ? { max_sector_stopovers: 0 } : {}),
        }, { deadline, ctx });
        for (const t of parseKiwiSearch(json, { adults })) {
          if (t.out.date >= a && t.out.date <= b && fromSet.has(t.out.from) && toSet.has(t.out.to)) legs.push(t.out);
        }
      } catch (e) {
        failed++;
        lastErr = e;
      }
    }
    if (failed === windows.length && lastErr) throw lastErr;
    // Jen přímé lety: přestupové vyřadit už tady, jinak by v kalendáři přebily dražší přímý let.
    return legs.filter((l) => l.date >= dateFrom && l.date <= dateTo && (!directOnly || !l.stops));
  },

  /**
   * Hledání do země / světadílu / „kamkoliv“ nebo zpáteční letenky na dálkové trase – jeden dotaz
   * na okno dat (nejvýš ~31 dní). origins/to: seznamy kódů (letiště; u `to` i země nebo 'anywhere').
   * ret: { nightsMin, nightsMax } nebo exact { backFrom, backTo } → zpáteční se společnou cenou.
   * oneForCity: jeden (nejlevnější) výsledek na cílové město – víc různých cílů v 15 výsledcích.
   */
  async search({ origins, to, dateFrom, dateTo, ret = null, exact = null, adults = 1, directOnly = false, outDays = [], backDays = [], oneForCity = false, deadline = null, ctx = null }) {
    const args = {
      flyFrom: origins.slice(0, 25).join(','), flyTo: [].concat(to).slice(0, 25).join(','),
      departureDate: dmy(dateFrom), ...(dateTo > dateFrom ? { departureDateTo: dmy(dateTo) } : {}),
      ...(exact?.backFrom ? { returnDate: dmy(exact.backFrom), returnDateTo: dmy(exact.backTo) }
        : ret ? { nights_in_dst_from: ret.nightsMin, nights_in_dst_to: ret.nightsMax } : {}),
      ...(outDays.length ? { fly_days: outDays.join(',') } : {}),
      ...(ret && backDays.length ? { ret_fly_days: backDays.join(',') } : {}),
      ...(oneForCity ? { one_for_city: true } : {}),
      ...(directOnly ? { max_sector_stopovers: 0 } : {}),
      adults, sort: 'price', currency: 'EUR', locale: 'en', cabinClass: 'M',
    };
    const json = await searchFlight(args, { deadline, ctx });
    return parseKiwiSearch(json, { adults }).filter((t) => (!ret || t.back) && (!directOnly || (!t.out.stops && !t.back?.stops)));
  },

  /** Živé ověření konkrétních dat (průvodce cestou): zpáteční i jednosměrné. */
  async exact({ from, to, dateOut, dateBack = null, adults = 1 }) {
    const json = await searchFlight({
      flyFrom: from, flyTo: to, departureDate: dmy(dateOut), ...(dateBack ? { returnDate: dmy(dateBack) } : {}),
      adults, sort: 'price', currency: 'EUR', locale: 'en', cabinClass: 'M',
    });
    return parseKiwiSearch(json, { adults });
  },
};
