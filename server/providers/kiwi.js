// Kiwi.com – oficiální MCP server (https://mcp.kiwi.com), zdarma a bez klíče.
// Živé ceny prakticky všech aerolinek (nízkonákladové i klasické, včetně kombinací
// s přestupem na samostatné letenky – „virtual interlining“) + odkaz na rezervaci.
// Protokol: JSON-RPC 2.0 přes MCP Streamable HTTP (odpověď může být JSON i SSE),
// nástroj `search-flight`. Vyžaduje cílové letiště → jen pro konkrétní cíl, ne „kamkoliv“.
import { limiter } from '../lib/http.js';
import { cache } from '../lib/cache.js';
import { makeLeg, makeTrip } from '../lib/fares.js';
import { airlineName } from '../lib/airlines.js';
import { addDays, chunkRange, daysBetween } from '../lib/dates.js';
import { toCzk } from '../lib/fx.js';

const ENDPOINT = 'https://mcp.kiwi.com';
const PROTOCOL = '2025-06-18';
const TTL = 30 * 60e3;
const limit = limiter(2);
const pause = () => new Promise((r) => setTimeout(r, 400));
const session = { id: null, at: 0, pending: null };
let rpcId = 10;

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

async function post(body, sessionId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Kiwi: HTTP ${res.status}${res.status === 429 ? ' (příliš mnoho dotazů)' : ''}`);
      err.status = res.status;
      throw err;
    }
    const rpc = parseRpcBody(text);
    if (rpc.error) throw new Error(`Kiwi: ${rpc.error.message || 'chyba'} (${rpc.error.code})`);
    return { rpc, sessionId: res.headers.get('mcp-session-id') };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Kiwi: timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureSession() {
  if (session.at && Date.now() - session.at < 10 * 60e3) return session.id;
  if (session.pending) return session.pending;
  session.pending = (async () => {
    try {
      const { sessionId } = await post({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'atlas-travel', version: '2.0.0' } },
      });
      // Bezstavový server hlavičku vynechá – pak se pokračuje bez ní.
      session.id = (sessionId || '').trim() || null;
      session.at = Date.now();
      return session.id;
    } finally {
      session.pending = null;
    }
  })();
  return session.pending;
}

async function searchFlight(args) {
  const key = `kiwi:${JSON.stringify(args)}`;
  return cache.wrap(key, TTL, () => limit(async () => {
    await pause();
    const sid = await ensureSession();
    let out;
    try {
      out = await post({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: 'search-flight', arguments: args } }, sid);
    } catch (e) {
      // Vypršelá session → nová a jeden pokus navíc.
      if (e.status !== 400 && e.status !== 404) throw e;
      session.at = 0;
      out = await post({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: 'search-flight', arguments: args } }, await ensureSession());
    }
    const res = out.rpc.result || {};
    if (res.isError) throw new Error('Kiwi: nástroj vrátil chybu');
    const text = (res.content || []).find((c) => c.type === 'text' && c.text)?.text;
    if (!text) throw new Error('Kiwi: prázdná odpověď');
    return JSON.parse(text);
  }));
}

const dmy = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

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
    carrierName: carriers.map(airlineName).join(' + ') || 'Kiwi.com',
    flightNo: segs.map((s) => [s.carrier, s.flightNumber].filter(Boolean).join(' ')).filter(Boolean).join(', ') || null,
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

  /** Nejlevnější let po dnech: okna po 7 dnech (datum ± 3 dny). */
  async daily({ from, to, dateFrom, dateTo, adults = 1 }) {
    const legs = [];
    for (const [a, b] of chunkRange(dateFrom, dateTo, 7)) {
      const center = addDays(a, Math.min(3, daysBetween(a, b)));
      const json = await searchFlight({
        flyFrom: from, flyTo: to, departureDate: dmy(center), departureDateFlexRange: 3,
        passengers: { adults }, sort: 'price', curr: 'EUR', locale: 'en', cabinClass: 'M',
      });
      for (const t of parseKiwiSearch(json, { adults })) {
        if (t.out.date >= a && t.out.date <= b && t.out.from === from) legs.push(t.out);
      }
    }
    return legs.filter((l) => l.date >= dateFrom && l.date <= dateTo);
  },

  /** Živé ověření konkrétních dat (průvodce cestou): zpáteční i jednosměrné. */
  async exact({ from, to, dateOut, dateBack = null, adults = 1 }) {
    const json = await searchFlight({
      flyFrom: from, flyTo: to, departureDate: dmy(dateOut), ...(dateBack ? { returnDate: dmy(dateBack) } : {}),
      passengers: { adults }, sort: 'price', curr: 'EUR', locale: 'en', cabinClass: 'M',
    });
    return parseKiwiSearch(json, { adults });
  },
};
