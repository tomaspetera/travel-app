#!/usr/bin/env node
// ATLAS server – API pro vyhledávání letenek + statický frontend z public/.
// Spuštění: node server/index.js   (Node 20+, žádné závislosti)
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
import { suggest, describe, resolveOrigins } from './lib/places.js';
import { search, UserError } from './lib/search.js';
import { providerStatus } from './providers/index.js';
import { fxInfo, loadRates } from './lib/fx.js';
import { cache } from './lib/cache.js';
import { airportsNear, getAirport } from './lib/airports.js';
import { groundEstimate } from './lib/geo.js';

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

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p === '/api/health') {
    await loadRates();
    return sendJson(req, res, 200, { ok: true, demo: config.mock, maxOrigins: config.maxOrigins, providers: providerStatus(), fx: fxInfo(), cache: cache.stats() });
  }
  if (p === '/api/places') {
    const q = (url.searchParams.get('q') || '').slice(0, 80);
    const remote = url.searchParams.get('remote') !== '0';
    return sendJson(req, res, 200, { items: await suggest(q, { remote }) });
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
  if (p === '/api/search' && req.method === 'POST') return handleSearch(req, res);
  if (p.startsWith('/api/')) return sendJson(req, res, 404, { error: 'Neznámý endpoint' });

  // Statické soubory
  if (p === '/data/countries.json') {
    if (serveFile(req, res, path.join(DATA, 'countries.json'), { maxAge: 3600 })) return;
  }
  const rel = decodeURIComponent(p === '/' ? '/index.html' : p);
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
      console.error(e);
      if (!res.headersSent) sendJson(req, res, e.status || 500, { error: e.message });
      else res.end();
    });
  });
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
  });
}
