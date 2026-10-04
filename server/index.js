#!/usr/bin/env node
// ATLAS server – API pro vyhledávání letenek + statický frontend z public/.
// Spuštění: node server/index.js   (Node 20+, žádné závislosti)
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
import { suggest, describe, resolveOrigins, geocode } from './lib/places.js';
import { search, UserError } from './lib/search.js';
import { activeProviders, providerStatus } from './providers/index.js';
import { fxInfo, loadRates } from './lib/fx.js';
import { cache } from './lib/cache.js';
import { airportsNear, getAirport } from './lib/airports.js';
import { groundEstimate } from './lib/geo.js';
import { addDays, todayYmd } from './lib/dates.js';
import { searchStays } from './lib/stays.js';
import { searchCars } from './lib/cars.js';
import { findPlaces, mockPlaces } from './lib/poi.js';
import { planItinerary } from './lib/itinerary.js';
import { isYmd, daysBetween } from './lib/dates.js';

const PUBLIC = path.join(config.root, 'public');
const DATA = path.join(config.root, 'data');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

function wantsGzip(req) {
  return /\bgzip\b/.test(req.headers['accept-encoding'] || '');
}

function sendJson(req, res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (wantsGzip(req) && body.length > 1024) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(status, headers);
    res.end(zlib.gzipSync(body));
  } else {
    res.writeHead(status, headers);
    res.end(body);
  }
}

function serveFile(req, res, file, { maxAge = 300 } = {}) {
  let st;
  try {
    st = statSync(file);
    if (!st.isFile()) throw new Error('not a file');
  } catch {
    return false;
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': `public, max-age=${maxAge}`, 'Last-Modified': st.mtime.toUTCString() };
  if (req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']) >= new Date(st.mtime.toUTCString())) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  const compressible = /text|json|javascript|svg/.test(type) && st.size > 1024;
  if (compressible && wantsGzip(req)) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    createReadStream(file).pipe(zlib.createGzip()).pipe(res);
  } else {
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
  }
  return true;
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new UserError('Příliš velký požadavek'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const hits = new Map();
function rateLimited(req) {
  const max = config.searchesPer10Min;
  if (!max) return false;
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  if (list.length >= max) return true;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

// Hledání streamuje průběh jako NDJSON (1 JSON objekt na řádek), na konci { type: 'result' }.
async function handleSearch(req, res) {
  if (rateLimited(req)) return sendJson(req, res, 429, { error: 'Příliš mnoho hledání za krátkou dobu – zkus to za pár minut.' });
  let body;
  try {
    body = JSON.parse((await readBody(req)) || '{}');
  } catch (e) {
    return sendJson(req, res, 400, { error: e instanceof UserError ? e.message : 'Neplatný JSON' });
  }
  const gzip = wantsGzip(req);
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  const out = gzip ? zlib.createGzip() : null;
  if (out) out.pipe(res);
  let closed = false;
  res.on('close', () => { closed = true; });
  const write = (obj) => {
    if (closed) return;
    const line = JSON.stringify(obj) + '\n';
    if (out) {
      out.write(line);
      out.flush(zlib.constants.Z_SYNC_FLUSH);
    } else res.write(line);
  };
  try {
    const result = await search(body, write);
    write({ type: 'result', result });
  } catch (e) {
    if (!(e instanceof UserError)) console.error('[search]', e);
    write({ type: 'error', error: e instanceof UserError ? e.message : `Chyba serveru: ${e.message}` });
  }
  if (out) out.end();
  else res.end();
}

// Ostrý test zdrojů: malý skutečný dotaz na každého poskytovatele (výsledek cachován 5 min).
// Slouží k ověření po nasazení, že server na hostingu na API aerolinek dosáhne.
async function diagnose() {
  return cache.wrap('diag', 5 * 60e3, async () => {
    const from = addDays(todayYmd(), 14);
    const to = addDays(from, 6);
    const probes = activeProviders().map(async (p) => {
      const t0 = Date.now();
      try {
        let detail;
        if (p.explore) {
          const trips = await p.explore({ origin: 'VIE', dateFrom: from, dateTo: to, adults: 1 });
          detail = `${trips.length} destinací z VIE`;
        } else if (p.network) {
          detail = `${(await p.network()).size} letišť v síti`;
        } else {
          detail = `${(await p.daily({ from: 'VIE', to: 'BCN', dateFrom: from, dateTo: to })).length} dní s cenou`;
        }
        return { id: p.id, ok: true, ms: Date.now() - t0, detail };
      } catch (e) {
        return { id: p.id, ok: false, ms: Date.now() - t0, error: e.message || String(e) };
      }
    });
    const rates = await loadRates();
    return { at: new Date().toISOString(), demo: config.mock, providers: await Promise.all(probes), fx: { source: rates.source, eurCzk: rates.rates.CZK } };
  });
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }
  if (p === '/api/diag') {
    if (rateLimited(req)) return sendJson(req, res, 429, { error: 'Příliš mnoho požadavků' });
    return sendJson(req, res, 200, await diagnose());
  }
  if (p === '/api/health') {
    await loadRates();
    return sendJson(req, res, 200, { ok: true, demo: config.mock, maxOrigins: config.maxOrigins, providers: providerStatus(), fx: fxInfo(), cache: cache.stats() });
  }
  if (p === '/api/places') {
    const q = (url.searchParams.get('q') || '').slice(0, 80);
    const remote = url.searchParams.get('remote') !== '0';
    return sendJson(req, res, 200, { items: await suggest(q, { remote }) });
  }
  if (p === '/api/geocode') {
    // Města a místa (střed města, ne letiště) – pro objevování a program.
    const q = (url.searchParams.get('q') || '').slice(0, 80);
    let items = [];
    try {
      items = await geocode(q);
    } catch (e) {
      return sendJson(req, res, 502, { error: `Geokódování nedostupné: ${e.message}` });
    }
    const cc = (url.searchParams.get('cc') || '').toUpperCase();
    if (cc) items = [...items.filter((x) => x.cc === cc), ...items.filter((x) => x.cc !== cc)];
    return sendJson(req, res, 200, { items });
  }
  if (p === '/api/place') {
    const d = describe(url.searchParams.get('id'));
    return d ? sendJson(req, res, 200, d) : sendJson(req, res, 404, { error: 'Neznámé místo' });
  }
  if (p === '/api/nearby') {
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    const radius = Math.min(600, Number(url.searchParams.get('radius')) || 250);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(req, res, 400, { error: 'Chybí lat/lon' });
    const items = airportsNear(lat, lon, radius).slice(0, 15).map((a) => ({
      iata: a.iata, name: a.name, city: a.cityCs, cc: a.cc, lat: a.lat, lon: a.lon,
      distKm: Math.round(a.distKm), ground: groundEstimate(a.distKm),
    }));
    return sendJson(req, res, 200, { items });
  }
  if (p === '/api/origins') {
    // Náhled letišť, která se prohledají (pro výběr v UI).
    const ids = url.searchParams.getAll('from').slice(0, 8);
    const radiusKm = Math.min(600, Math.max(0, Number(url.searchParams.get('radius')) || 0));
    const kmRate = Math.min(5, Math.max(0, Number(url.searchParams.get('kmRate') ?? 1.1) || 0));
    const r = resolveOrigins(ids, { radiusKm, kmRate, maxAirports: 20 });
    return sendJson(req, res, 200, {
      home: r.home,
      airports: r.airports.map((a) => {
        const ap = getAirport(a.iata);
        return { ...a, name: ap.name, city: ap.cityCs, cc: ap.cc, type: ap.type, lat: ap.lat, lon: ap.lon };
      }),
    });
  }
  if (p === '/api/stays') {
    if (rateLimited(req)) return sendJson(req, res, 429, { error: 'Příliš mnoho požadavků – zkus to za pár minut.' });
    return sendJson(req, res, 200, await searchStays(Object.fromEntries(url.searchParams)));
  }
  if (p === '/api/cars') return sendJson(req, res, 200, searchCars(Object.fromEntries(url.searchParams)));
  if (p === '/api/poi') {
    if (rateLimited(req)) return sendJson(req, res, 429, { error: 'Příliš mnoho požadavků – zkus to za pár minut.' });
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return sendJson(req, res, 400, { error: 'Chybí poloha (lat/lon).' });
    const radiusKm = Math.min(25, Math.max(1, Number(url.searchParams.get('radius')) || 10));
    const dayTrips = url.searchParams.get('dayTrips') !== '0';
    const items = config.mock ? mockPlaces({ lat, lon }) : await findPlaces({ lat, lon, radiusKm, dayTrips });
    return sendJson(req, res, 200, { demo: config.mock, items });
  }
  if (p === '/api/itinerary' && req.method === 'POST') {
    let b;
    try {
      b = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return sendJson(req, res, 400, { error: 'Neplatný JSON' });
    }
    const lat = Number(b.lat);
    const lon = Number(b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(req, res, 400, { error: 'Chybí poloha (lat/lon).' });
    if (!isYmd(b.start) || !isYmd(b.end) || daysBetween(b.start, b.end) < 0 || daysBetween(b.start, b.end) > 30) return sendJson(req, res, 400, { error: 'Neplatné datum (max. 31 dní).' });
    if (rateLimited(req)) return sendJson(req, res, 429, { error: 'Příliš mnoho požadavků – zkus to za pár minut.' });
    const places = config.mock ? mockPlaces({ lat, lon }) : await findPlaces({ lat, lon, radiusKm: 10, dayTrips: true });
    const exclude = new Set(Array.isArray(b.exclude) ? b.exclude.map(String) : []);
    const must = new Set(Array.isArray(b.include) ? b.include.map(String) : []);
    const pool = places.filter((x) => !exclude.has(x.id)).map((x) => (must.has(x.id) ? { ...x, score: x.score + 1000 } : x));
    const interests = b.interests && typeof b.interests === 'object' ? Object.fromEntries(Object.entries(b.interests).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Math.min(3, Math.max(0, Number(v)))])) : {};
    const plan = planItinerary(pool, {
      center: { lat, lon }, start: b.start, end: b.end, pace: ['relaxed', 'normal', 'intense'].includes(b.pace) ? b.pace : 'normal',
      arrivalTime: /^\d{2}:\d{2}$/.test(b.arrivalTime || '') ? b.arrivalTime : '09:00',
      departureTime: /^\d{2}:\d{2}$/.test(b.departureTime || '') ? b.departureTime : null, interests,
    });
    return sendJson(req, res, 200, { demo: config.mock, ...plan, places });
  }
  if (p === '/api/search' && req.method === 'POST') return handleSearch(req, res);
  if (p.startsWith('/api/')) return sendJson(req, res, 404, { error: 'Neznámý endpoint' });

  // Statické soubory
  if (p === '/data/countries.json') {
    if (serveFile(req, res, path.join(DATA, 'countries.json'), { maxAge: 3600 })) return;
  }
  let rel;
  try {
    rel = decodeURIComponent(p === '/' ? '/index.html' : p);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  const maxAge = rel.startsWith('/vendor/') ? 86400 * 30 : 60;
  if (serveFile(req, res, file, { maxAge })) return;
  // SPA fallback
  serveFile(req, res, path.join(PUBLIC, 'index.html'), { maxAge: 0 }) || (res.writeHead(404), res.end('Not found'));
}

export function createServer() {
  return http.createServer((req, res) => {
    route(req, res).catch((e) => {
      if (!e.status || e.status >= 500) console.error(e);
      if (!res.headersSent) sendJson(req, res, e.status || 500, { error: e.message });
      else res.end();
    });
  });
}

// Po startu předehřej kurzy a seznamy letišť a vypiš, jestli jsou zdroje dostupné (vidět v logu hostingu).
async function warmUp() {
  await loadRates();
  console.log(`Kurzy: ${fxInfo().source}, 1 EUR = ${fxInfo().eurCzk} Kč`);
  if (config.mock) return;
  for (const p of activeProviders()) {
    try {
      if (p.network) {
        console.log(`${p.name}: OK (${(await p.network()).size} letišť)`);
      } else if (p.id === 'ryanair') {
        const set = await p.stations();
        if (set) console.log(`${p.name}: OK (${set.size} letišť)`);
        else console.warn(`${p.name}: seznam letišť se nepodařilo načíst – ověř /api/diag`);
      } else {
        console.log(`${p.name}: zapnuto`);
      }
    } catch (e) {
      console.warn(`${p.name}: nedostupný – ${e.message}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(config.root, 'server', 'index.js')) {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    const prov = providerStatus().filter((x) => x.enabled).map((x) => x.name).join(', ');
    console.log(`ATLAS běží na http://localhost:${config.port}`);
    console.log(config.mock ? '⚠️  DEMO režim (ATLAS_MOCK=1): ceny jsou vymyšlené!' : `Zdroje dat: ${prov}`);
    if (!config.mock && !config.travelpayoutsToken) {
      console.log('Tip: zdarma token z travelpayouts.com (TRAVELPAYOUTS_TOKEN v .env) přidá všechny ostatní aerolinky.');
    }
    warmUp().catch((e) => console.warn('Předehřátí selhalo:', e.message));
  });
  // Hosting při nasazení nové verze posílá SIGTERM – dokonči rozběhnuté požadavky a skonči.
  const shutdown = (sig) => {
    console.log(`${sig}: ukončuji server…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
