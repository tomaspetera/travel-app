#!/usr/bin/env node
// ATLAS server – API pro vyhledávání letenek + statický frontend z public/.
// Spuštění: node server/index.js   (Node 20+, žádné závislosti)
import http from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
import { suggest, describe, resolveOrigins, geocodeExplore, mapySugCached } from './lib/places.js';
import { NATURE_KINDS } from './lib/names.js';
import { search, UserError, legBagCzk } from './lib/search.js';
import { stayProviders } from './providers/stays/index.js';
import { activeProviders, providerStatus } from './providers/index.js';
import { fxInfo, loadRates } from './lib/fx.js';
import { cache } from './lib/cache.js';
import { airportsNear, getAirport, countryAt, COUNTRY_BY_ISO } from './lib/airports.js';
import { accessOpts, airportAccess, carTrip, fuelCountry, normalizeAccess } from './lib/access.js';
import { addDays, todayYmd } from './lib/dates.js';
import { searchStays, checkStay } from './lib/stays.js';
import { partnerLookups } from './lib/partnerids.js';
import { searchCars } from './lib/cars.js';
import { findPlaces, findTrips, mockPlaces, mockTrips, placesCached, tripsCached, countryHighlights, countryCached, countryWithDistance, mockCountry, countryCategory, countryCatCached, mockCountryCat, withDistance, COUNTRY_CATS } from './lib/poi.js';
import { planTrips } from './lib/roadtrip.js';
import { keepInRegion } from './lib/regions.js';
import { bikeLoop, mockBikeLoop, hikeLoop, mockHikeLoop, bikeFromStation, mockBikeFromStation } from './lib/bike.js';
import { planItinerary } from './lib/itinerary.js';
import { planHikes, mockHikePlan, natureAreaAt } from './lib/hikeplan.js';
import { planStay, StayPlanError } from './lib/stayplan.js';
import { kiwi } from './providers/kiwi.js';
import { isYmd, daysBetween } from './lib/dates.js';
import { affiliateOn } from './lib/links.js';
import { HttpError, publicMessage } from './lib/http.js';
import { makeTrip } from './lib/fares.js';
import { airportClimate, climateAt, countryClimate, seasonMonth, sourceText } from './lib/climate.js';
import { cityPhotos, photosCached } from './lib/photos.js';
import { groundQuery, groundInfo, GroundError } from './lib/ground.js';
import { fuelInfo, fuelText, refreshFuel } from './lib/fuel.js';
import { serveIndex, serveServiceWorker } from './lib/pwa.js';
import { headTags, robotsTxt, sitemapXml, sendGenerated, serveManifest, serveNotFound } from './lib/seo.js';
import { BRAND } from './brand.js';
import { mapyOn, mapyReady, mapyStatus, parseTile, mapyTile, tileCached } from './lib/mapy.js';
import { cleanReport, recordClientError, clientErrorCount, MAX_BODY as CLIENT_ERR_MAX } from './lib/clienterr.js';
import { RateLimiter } from './lib/ratelimit.js';
import { upstashStore, memoryStore, createShare, loadShare, sharePage, ogPhoto, MAX_JSON as SHARE_MAX, ID_RE as SHARE_ID } from './lib/shortlinks.js';
import { sharedRuns, gate, perClient } from './lib/crowd.js';
import { SECURITY_HEADERS, API_CSP, clientIp, crossSite } from './lib/security.js';

const PUBLIC = path.join(config.root, 'public');
const DATA = path.join(config.root, 'data');
// Soubory aplikace pro service worker a stránku (pwa.js); salt = název, popis a adresa webu, které server dosazuje do
// stránky a manifestu – i jejich změna je nová verze aplikace
const appDirs = () => ({ publicDir: PUBLIC, dataDir: DATA, salt: JSON.stringify([BRAND, config.publicUrl]) });
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8',
};

function wantsGzip(req) {
  return /\bgzip\b/.test(req.headers['accept-encoding'] || '');
}
function wantsBr(req) {
  return /\bbr\b/.test(req.headers['accept-encoding'] || '');
}
// Zkomprimované soubory aplikace v paměti (brotli / gzip jednou na verzi souboru): menší přenos na mobilu a rychlejší
// odpověď – soubor se nekomprimuje znovu při každém otevření.
const packed = new Map();
function packedFile(file, st) {
  let p = packed.get(file);
  if (!p || p.mtime !== st.mtimeMs || p.size !== st.size) { p = { mtime: st.mtimeMs, size: st.size, raw: readFileSync(file) }; packed.set(file, p); }
  return p;
}
// ETag podle obsahu: nasazení posune čas změny u všech souborů (Last-Modified), nezměněné ale dál odpoví 304 –
// po nasazení se stáhne jen to, co se opravdu změnilo (bez ETagu celá aplikace znovu, ~600 kB)
const etagOf = (file, st) => { const p = packedFile(file, st); return p.etag || (p.etag = `"${createHash('sha1').update(p.raw).digest('base64url').slice(0, 22)}"`); };
function packedBody(file, st, enc) {
  const p = packedFile(file, st);
  if (enc === 'br') return p.br || (p.br = zlib.brotliCompressSync(p.raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: p.raw.length } }));
  return p.gz || (p.gz = zlib.gzipSync(p.raw, { level: 9 }));
}

// Odpovědi API brotli kvality 4: o ~12 % menší než gzip za stejný čas procesoru (vyšší kvalita by na Renderu zdarma
// zdržovala) – stejné nastavení i pro průběžné výsledky hledání (streamSearch).
const BR_API = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } };
function sendJson(req, res, status, obj, extra = {}) {
  const body = Buffer.from(JSON.stringify(obj));
  // 429: za kolik sekund to z této adresy půjde znovu (rateLimited) – standardní hlavička pro prohlížeč i proxy
  const retry = status === 429 && req.retryAfter ? { 'Retry-After': String(req.retryAfter) } : {};
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...retry, ...extra };
  const enc = body.length > 1024 ? (wantsBr(req) ? 'br' : wantsGzip(req) ? 'gzip' : '') : '';
  if (enc) {
    headers['Content-Encoding'] = enc;
    res.writeHead(status, headers);
    res.end(enc === 'br' ? zlib.brotliCompressSync(body, BR_API) : zlib.gzipSync(body));
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
  // maxAge 0 = no-cache: prohlížeč (i service worker) se u každého použití zeptá serveru (304 je levné)
  const headers = { 'Content-Type': type, 'Cache-Control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-cache', 'Last-Modified': st.mtime.toUTCString() };
  const compressible = /text|json|javascript|svg/.test(type) && st.size > 1024;
  if (compressible) headers.Vary = 'Accept-Encoding';
  const enc = compressible ? (wantsBr(req) ? 'br' : wantsGzip(req) ? 'gzip' : '') : '';
  // ETag podle obsahu a komprese (br / gzip / bez – každá podoba souboru má vlastní)
  if (st.size < 3e6) headers.ETag = etagOf(file, st).replace(/"$/, enc ? `-${enc}"` : '"');
  // If-None-Match má přednost před If-Modified-Since (RFC 9110) – shodný obsah = 304, i když se soubor nasadil znovu
  const inm = req.headers['if-none-match'];
  if (inm && headers.ETag ? inm.split(/\s*,\s*/).some((t) => t.replace(/^W\//, '') === headers.ETag || t === '*')
    : req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']) >= new Date(st.mtime.toUTCString())) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  if (enc && st.size < 3e6) {
    const body = packedBody(file, st, enc);
    headers['Content-Encoding'] = enc;
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(body);
  } else if (enc === 'gzip') {
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

// Tělo nad limit: dál se nečte a odpověď 413 spojení zavře (badBody) – dřív se spojení utrhlo hned a klient
// nedostal žádnou odpověď.
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      if (size > limit) return;
      size += c.length;
      if (size > limit) {
        chunks.length = 0;
        req.pause();
        reject(Object.assign(new UserError('Příliš velký požadavek'), { status: 413 }));
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Chyba čtení těla: nad limit 413 (spojení se pak zavře, zbytek těla se nečte), jinak neplatný JSON 400. */
const badBody = (req, res, e) => (e && e.status === 413
  ? sendJson(req, res, 413, { error: e.message }, { Connection: 'close' })
  : sendJson(req, res, 400, { error: 'Neplatný JSON' }));

// Limity z jedné adresy za 10 minut (RateLimiter: omezená paměť, při návalu se nemaže všem najednou)
const hits = new RateLimiter();
const rechecks = new RateLimiter(); // přepočty trasy přes víc míst (stayplan s bases): vlastní limit, do hledání se nepočítají
const verifies = new RateLimiter(); // živé ověření ceny (/api/verify): vlastní limit, do hledání se nepočítá
const stayChecks = new RateLimiter(); // ověření volna hotelu při výběru (/api/stays/check)
const explores = new RateLimiter(); // Objevuj (místa, program, výlety, kolo, pěšky): vlastní limit, do hledání se nepočítá
const mapySugs = new RateLimiter(); // návrhy Mapy.com v hledání Objevuj (jen dotazy mimo mezipaměť serveru)
const tileHits = new RateLimiter(); // dlaždice Mapy.com přes server (jen mimo mezipaměť serveru)
const clientErrs = new RateLimiter({ windowMs: 60 * 60e3 }); // hlášení chyb z prohlížeče (/api/client-error): 30 za hodinu z jedné adresy
const photoHits = new RateLimiter(); // fotky měst mimo mezipaměť serveru (Wikimedia, Pexels, Unsplash)
const shareHits = new RateLimiter({ windowMs: 60 * 60e3 }); // nové krátké odkazy (/api/share): 30 za hodinu z jedné adresy
// Krátké odkazy na sdílenou cestu: Upstash, v demu paměť; bez klíčů vypnuté (aplikace pošle dlouhý odkaz)
const shareStore = config.upstashUrl && config.upstashToken ? upstashStore(config.upstashUrl, config.upstashToken) : config.mock ? memoryStore() : null;
const geoHits = new RateLimiter(); // geokódování mimo mezipaměť serveru (Open-Meteo) – našeptávač a hledání míst
// clientIp (server/lib/security.js): na Renderu adresa od Cloudflare, ne podvrhnutelná první z X-Forwarded-For
/** Nad limitem → true a req.retryAfter = za kolik sekund to půjde znovu (hlavička Retry-After u 429). */
function rateLimited(req, max = config.searchesPer10Min, bucket = hits) {
  const wait = bucket.hit(clientIp(req), max);
  if (wait) req.retryAfter = wait;
  return wait > 0;
}

// Objevuj: do limitu se počítá jen požadavek, který opravdu půjde na Wikidata, Wikipedii nebo BRouter – odpověď celá
// z mezipaměti serveru (stejné místo podruhé, návrat do Objevuj, už jednou spočítaná trasa) je zdarma. V DEMO se počítá vše.
const TOO_MANY_EXPLORE = { error: 'Příliš mnoho požadavků – zkus to za pár minut.' };
// Odpovědi z mezipaměti mají vlastní, štědrý limit (5× víc) – výpočet okruhů výletů zabere CPU i z mezipaměti a nesmí
// jít opakovat donekonečna; běžný uživatel se k němu nepřiblíží.
const exploresCached = new RateLimiter();
const exploreLimited = (req, cached = false) => (cached && !config.mock
  ? rateLimited(req, 5 * config.explorePer10Min, exploresCached)
  : rateLimited(req, config.explorePer10Min, explores));
/** Kolo a pěšky: mezipaměť se pozná až během plánování (trasy z BRouteru) – započte nejvýš jednou, nad limitem výjimka code 'LIMIT'. */
function exploreCharge(req) {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (rateLimited(req, config.explorePer10Min, explores)) throw Object.assign(new Error(TOO_MANY_EXPLORE.error), { code: 'LIMIT' });
  };
}

// Stejné hledání z téže adresy, které ještě běží: `${ip}|${tělo}` → počet běžících kopií
const runningSearches = new Map();
const TOO_MANY = { error: 'Příliš mnoho hledání za krátkou dobu – zkus to za pár minut.' };
// Nával (server/lib/crowd.js): stejné hledání od kohokoli, které ještě běží, se jen připojí; různých nejvýš
// config.searchConcurrency naráz, dalších config.searchQueue čeká, nad tím 503 česky (aplikace hlášku ukáže).
const searchRuns = sharedRuns();
const searchGate = gate(config.searchConcurrency, config.searchQueue);
const BUSY = { error: 'ATLAS teď hledá pro hodně lidí najednou – zkus to prosím za minutu.' };
// Fronta je společná – jedna adresa v ní smí mít naráz nejvýš config.searchPerClient hledání (běží i čekají), jinak by ji
// v rámci svého limitu zaplnila sama a ostatní by dostávali 503. Místo se vrátí, jakmile hledání skončí (i chybou) nebo
// klient odejde (zavřená stránka, zrušené hledání) – i když jeho hledání, pokud už běží, ještě doběhne.
// Export jen pro testy (počty se po skončení vrátí na prázdno).
export const _searchClients = perClient();
const MANY_AT_ONCE = { error: 'Z tvého připojení teď běží moc hledání naráz – počkej prosím, až některé doběhne, a zkus to znovu.' };

// Hledání streamuje průběh jako NDJSON (1 JSON objekt na řádek), na konci { type: 'result' }.
async function handleSearch(req, res) {
  let text;
  let body;
  try {
    text = await readBody(req);
    body = JSON.parse(text || '{}');
  } catch (e) {
    return badBody(req, res, e);
  }
  // null, pole, číslo: hledání by spadlo uvnitř („Cannot read properties of null“) – hned srozumitelně 400
  if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(req, res, 400, { error: 'Neplatný JSON' });
  // Přetížený server: nové hledání (stejné neběží) nad frontou se odmítne hned – do limitu adresy se nepočítá.
  const shareKey = JSON.stringify(body);
  const fresh = !searchRuns.has(shareKey);
  if (fresh && searchGate.full()) return sendJson(req, res, 503, BUSY, { 'Retry-After': '60' });
  // Strop na adresu: nové hledání nad ním hned 429 (do limitu adresy se nepočítá). Připojení ke stejnému běžícímu
  // hledání frontu nezabere – projde vždy, ale počítá se (drží běh naživu, i když ten, kdo ho spustil, odešel).
  const ip = clientIp(req);
  if (fresh && _searchClients.full(ip, config.searchPerClient)) return sendJson(req, res, 429, MANY_AT_ONCE, { 'Retry-After': '30' });
  // Stejné hledání z téže adresy ještě běží (obnovená stránka, druhý panel, dvojí spuštění): do limitu se podruhé
  // nepočítá – připojí se k běžícímu (searchRuns). Zdarma jen jedna kopie navíc, víc ne.
  const key = `${ip}|${text}`;
  const free = runningSearches.get(key) === 1;
  if (!free && rateLimited(req)) return sendJson(req, res, 429, TOO_MANY);
  // Cesta přes víc měst = hledání několika úseků → do limitu se počítá dvakrát.
  if (!free && body && body.trip === 'multi' && rateLimited(req)) return sendJson(req, res, 429, TOO_MANY);
  runningSearches.set(key, (runningSearches.get(key) || 0) + 1);
  const release = _searchClients.take(ip);
  res.once('close', release); // klient odešel (nebo odpověď skončila) – místo hned, nečeká se na konec hledání
  try {
    await streamSearch(req, res, body, shareKey);
  } finally {
    release();
    const n = (runningSearches.get(key) || 1) - 1;
    if (n > 0) runningSearches.set(key, n);
    else runningSearches.delete(key);
  }
}

async function streamSearch(req, res, body, shareKey = JSON.stringify(body)) {
  const enc = wantsBr(req) ? 'br' : wantsGzip(req) ? 'gzip' : '';
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
    ...(enc ? { 'Content-Encoding': enc } : {}),
  });
  // hlavičky hned, i když hledání čeká ve frontě (searchGate) – prohlížeč i proxy vidí, že server odpověděl
  res.flushHeaders();
  const out = enc === 'br' ? zlib.createBrotliCompress(BR_API) : enc ? zlib.createGzip() : null;
  if (out) out.pipe(res);
  let closed = false;
  let lastAt = Date.now(); // kdy odešel poslední řádek (znamení { type: 'wait' } níž)
  res.on('close', () => { closed = true; });
  const write = (obj) => {
    if (closed) return;
    lastAt = Date.now();
    const line = JSON.stringify(obj) + '\n';
    if (out) {
      out.write(line);
      out.flush(enc === 'br' ? zlib.constants.BROTLI_OPERATION_FLUSH : zlib.constants.Z_SYNC_FLUSH); // řádek hned
    } else res.write(line);
  };
  write.gone = () => closed;
  // Hledání čekající ve frontě (searchGate) nepošle nic, dokud na něj nepřijde řada – při návalu i minuty. Aplikace by ho
  // po 2 minutách bez jediného bajtu (pwa.js readOrStall) vzdala jako zaseklé spojení a čekající by se nikdy nedočkal
  // (nové hledání = zase na konec fronty). Proto po config.searchPingMs bez řádku znamení { type: 'wait' } – aplikace
  // ho přeskočí, jen ví, že server žije.
  const ping = setInterval(() => { if (Date.now() - lastAt >= config.searchPingMs) write({ type: 'wait' }); }, config.searchPingMs);
  try {
    // Stejné běžící hledání: připojit se (poslední průběh a náhled hned, další živě). Jinak nové – hned, nebo až
    // na něj přijde řada; odešli-li do té doby všichni, kdo na něj čekají, vůbec se nespustí (null).
    const result = await searchRuns(shareKey, (fan, run) => searchGate(() => search(body, fan), () => [...run.subs].every((w) => w.gone())), write);
    if (result) write({ type: 'result', result });
  } catch (e) {
    if (!(e instanceof UserError)) console.error('[search]', e);
    // text neočekávané chyby (názvy proměnných, adresy zdrojů) jen do logu, uživateli česky obecně
    write({ type: 'error', error: e instanceof UserError ? e.message : 'Chyba serveru – hledání se nepovedlo, zkus to prosím za chvíli znovu.' });
  } finally {
    clearInterval(ping);
  }
  if (out) out.end();
  else res.end();
}

/**
 * Volby cesty na letiště z parametrů adresy (/api/origins, /api/nearby) – stejná kontrola jako u hledání (normalizeAccess):
 * groundMode, kmRate, carFuel, carCons, carPrice (dřívější carKmCzk), adults, trip (oneway = odvoz), nights (výchozí 7),
 * own = vlastní ceny na letiště „VIE:350,BTS:270“ (accessOverride, normalizeOwn).
 * → { opts (pro airportAccess), nights, echo (použité volby do odpovědi) }
 */
function accessParams(sp) {
  const own = Object.fromEntries(String(sp.get('own') || '').split(',').slice(0, 24).map((x) => x.split(':')).filter((x) => x.length === 2));
  const acc = normalizeAccess({ ...Object.fromEntries(['kmRate', 'groundMode', 'carFuel', 'carCons', 'carPrice', 'carKmCzk'].map((k) => [k, sp.get(k)])), accessOverride: own });
  const adults = Math.min(9, Math.max(1, Math.round(Number(sp.get('adults'))) || 1));
  const nights = Math.min(90, Math.max(0, Math.round(Number(sp.get('nights') ?? 7)) || 0));
  const oneWay = sp.get('trip') === 'oneway';
  return { opts: accessOpts({ ...acc, adults }, oneWay), nights, echo: { ...acc, adults, nights: oneWay ? null : nights, trip: oneWay ? 'oneway' : 'return' } };
}
// Autem navíc celá cesta tam i zpět s parkováním na `nights` nocí (ground.trip).
const withTrip = (g, nights) => (g && g.mode === 'car' ? { ...g, trip: carTrip(g, nights) } : g);

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
        return { id: p.id, ok: false, ms: Date.now() - t0, error: publicMessage(e) };
      }
    });
    const probe = async (id, fn) => {
      const t0 = Date.now();
      try {
        const detail = await fn();
        return { id, ok: true, ms: Date.now() - t0, detail };
      } catch (e) {
        return { id, ok: false, ms: Date.now() - t0, error: publicMessage(e) };
      }
    };
    const extra = [];
    // Zdroj cen hotelů, který se právě používá (LiteAPI s ostrým klíčem, jinak Xotelo): vlastní malý test (probe),
    // jinak hledání ve Vídni.
    const sp = config.mock ? null : stayProviders()[0];
    if (sp) {
      extra.push(probe(sp.id, sp.probe ? () => sp.probe() : async () => {
        const r = await searchStays({ city: 'Vídeň', iata: 'VIE', checkin: from, checkout: addDays(from, 2), adults: 2 });
        const st = r.providers.find((x) => x.id === sp.id);
        if (st && !st.ok) throw new Error(st.error);
        return `${r.items.length} hotelů ve Vídni${st?.test ? ' (testovací klíč)' : ''}`;
      }));
    }
    if (!config.mock) extra.push(probe('wikidata', async () => `${(await findPlaces({ lat: 48.2082, lon: 16.3738, radiusKm: 3, dayTrips: false })).length} míst ve Vídni`));
    const rates = await loadRates();
    return { at: new Date().toISOString(), demo: config.mock, providers: await Promise.all(probes), services: await Promise.all(extra), fx: { source: rates.source, eurCzk: rates.rates.CZK } };
  });
}

async function route(req, res) {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    // „//“ (roboti, překlep v odkazu) URL nepřečte – 400 jako u poškozené adresy, ne 500 s výpisem chyby do logu
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }
  const p = url.pathname;

  if (p.startsWith('/api/')) {
    // API je jen pro ATLAS: z cizího webu (skript, obrázek, formulář) 403 – viz crossSite; odpověď API se nikdy
    // nevykreslí jako stránka (CSP bez ničeho)
    res.setHeader('Content-Security-Policy', API_CSP);
    if (crossSite(req)) return sendJson(req, res, 403, { error: 'API ATLASu jde používat jen z aplikace ATLAS.' });
  }
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
    // maps: mapové služby (Mapy.com) – mimo providers, ty jsou zdroje cen (Zdroje cen, průběh hledání);
    // feedback: adresa pro 💬 Napsat nám – jen když je FEEDBACK_EMAIL nastavená, jinak tlačítko v aplikaci chybí
    const feedback = config.feedbackEmail ? { feedback: { email: config.feedbackEmail } } : {};
    return sendJson(req, res, 200, { ok: true, demo: config.mock, maxOrigins: config.maxOrigins, affiliate: affiliateOn('aviasales'), providers: providerStatus(), maps: [mapyStatus()], fx: fxInfo(), cache: cache.stats(), clientErrors: clientErrorCount(), shortLinks: shareStore ? shareStore.kind : false, ...feedback });
  }
  if (p === '/api/client-error') {
    // Chyba z prohlížeče (public/js/errlog.js): jeden řádek do logu Renderu, v paměti posledních 50 – v /api/health
    // jen jejich počet. Odpověď bez obsahu; klient na ni nečeká a nic neukazuje.
    if (req.method !== 'POST') return sendJson(req, res, 405, { error: 'Jen POST' }, { Allow: 'POST' });
    if (rateLimited(req, 30, clientErrs)) return sendJson(req, res, 429, { error: 'Příliš mnoho hlášení' });
    let b;
    try {
      b = JSON.parse((await readBody(req, CLIENT_ERR_MAX)) || 'null');
    } catch (e) {
      return badBody(req, res, e);
    }
    const r = cleanReport(b);
    const line = r && recordClientError(r);
    if (line) console.warn(line);
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (p === '/api/share') {
    // Krátký odkaz na sdílenou cestu nebo plán (server/lib/shortlinks.js): { k: 'trip' | 'plan', j: JSON } → { id }
    if (req.method !== 'POST') return sendJson(req, res, 405, { error: 'Jen POST' }, { Allow: 'POST' });
    if (!shareStore) return sendJson(req, res, 503, { error: 'Krátké odkazy nejsou zapnuté.' });
    if (rateLimited(req, 30, shareHits)) return sendJson(req, res, 429, { error: 'Příliš mnoho odkazů – zkus to za chvíli.' });
    let b;
    try {
      b = JSON.parse((await readBody(req, SHARE_MAX + 2048)) || 'null');
    } catch (e) {
      return badBody(req, res, e);
    }
    // fotka cíle do náhledu: z mezipaměti fotek, nová nejvýš 3 s (odkaz bez fotky má obecný náhled ATLASu)
    const photo = async (place) => ogPhoto(String(((await Promise.race([cityPhotos([place]), new Promise((r) => setTimeout(() => r(null), 3000))])) || {}).photos?.[place] || ''));
    try {
      const id = await createShare(shareStore, b && b.k, b && b.j, { photo });
      return sendJson(req, res, 200, { id }, { 'Cache-Control': 'no-store' });
    } catch (e) {
      if (e.status === 400) return sendJson(req, res, 400, { error: e.message });
      throw e;
    }
  }
  if (p.startsWith('/api/share/')) {
    const id = p.slice(11);
    if (!SHARE_ID.test(id) || !shareStore) return sendJson(req, res, 404, { error: 'Odkaz neexistuje nebo vypršel.' });
    const r = await loadShare(shareStore, id);
    if (!r) return sendJson(req, res, 404, { error: 'Odkaz neexistuje nebo vypršel.' });
    return sendJson(req, res, 200, { k: r.k, j: r.j }, { 'Cache-Control': 'public, max-age=86400' });
  }
  if (p === '/api/places') {
    const q = (url.searchParams.get('q') || '').slice(0, 80);
    const remote = url.searchParams.get('remote') !== '0';
    // near = ID domova (pořadí podle vzdálenosti), role=from = pole Odkud (město před svým letištěm)
    const near = (url.searchParams.get('near') || '').slice(0, 120);
    const role = url.searchParams.get('role') === 'from' ? 'from' : 'to';
    // partial: geokódování teď nejde (návrhy jen z vlastních dat) – našeptávač to zkusí znovu
    const meta = {};
    // nature=1: i hory a příroda přesným názvem (jen Objevuj – místo z věty), pole letů je nechtějí
    // geokódování mimo mezipaměť jen do limitu z adresy (geoHits) – nad ním návrhy z vlastních dat (partial)
    const allow = () => !rateLimited(req, config.geocodePer10Min, geoHits);
    const items = await suggest(q, { remote, near, role, meta, nature: url.searchParams.get('nature') === '1', allow });
    return sendJson(req, res, 200, { items, ...(meta.geoErr ? { partial: true } : {}) });
  }
  if (p === '/api/geocode') {
    // Města a místa (střed města, ne letiště) – pro objevování a program. mapy=1 (hledání v Objevuj): s klíčem Mapy.com
    // i jejich návrhy (vesnice, adresy, hrady, rozhledny…); dotazy mimo mezipaměť mají vlastní limit na IP – nad ním bez nich.
    const q = (url.searchParams.get('q') || '').slice(0, 80);
    const mapy = url.searchParams.get('mapy') === '1' && mapyOn() && (mapySugCached(q) || !rateLimited(req, config.explorePer10Min, mapySugs));
    let items = [];
    try {
      // regions: oblast přesným názvem (Toskánsko, Kanáry) jako její hlavní město a hory a příroda z vlastního seznamu
      // (Sněžka, Šumava) – jen hledání v Objevuj (mapy=1)
      items = await geocodeExplore(q, { mapy, regions: url.searchParams.get('mapy') === '1', allow: () => !rateLimited(req, config.geocodePer10Min, geoHits) });
    } catch (e) {
      if (e.code === 'LIMIT') return sendJson(req, res, 429, { error: e.message });
      console.warn(`geocode: ${e.message}`);
      return sendJson(req, res, 502, { error: 'Hledání míst teď nefunguje (geokódování neodpovídá) – zkus to prosím za chvíli.' });
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
    // Letiště v okolí bodu s cestou na letiště; volby jako u /api/origins (výchozí veřejnou dopravou).
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    const radius = Math.min(600, Number(url.searchParams.get('radius')) || 250);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(req, res, 400, { error: 'Chybí lat/lon' });
    const ap = accessParams(url.searchParams);
    const items = airportsNear(lat, lon, radius).slice(0, 15).map((a) => ({
      iata: a.iata, name: a.name, city: a.cityCs, cc: a.cc, lat: a.lat, lon: a.lon,
      distKm: Math.round(a.distKm), ground: withTrip(airportAccess({ lat, lon }, a.iata, ap.opts), ap.nights),
    }));
    return sendJson(req, res, 200, { access: { ...ap.echo, fuelCc: fuelCountry({ lat, lon }) }, items });
  }
  if (p === '/api/origins') {
    // Náhled letišť, která se prohledají (pro výběr v UI), s cestou na letiště jako v hledání: groundMode, kmRate,
    // carFuel, carCons, carPrice (dřívější carKmCzk), adults, trip (oneway = autem odvoz) a nights (autem: parkování
    // na typickou délku cesty → ground.trip). access.fuelCc = země, jejíž cena paliva platí (cena ve formuláři).
    const sp = url.searchParams;
    const ids = sp.getAll('from').slice(0, 8);
    const radiusKm = Math.min(600, Math.max(0, Number(sp.get('radius')) || 0));
    const ap = accessParams(sp);
    const r = resolveOrigins(ids, { radiusKm, access: ap.opts, maxAirports: 20 });
    return sendJson(req, res, 200, {
      home: r.home,
      access: { ...ap.echo, fuelCc: fuelCountry(r.home) },
      airports: r.airports.map((a) => {
        const x = getAirport(a.iata);
        return { ...a, ground: withTrip(a.ground, ap.nights), name: x.name, city: x.cityCs, cc: x.cc, type: x.type, lat: x.lat, lon: x.lon };
      }),
    });
  }
  if (p === '/api/stays/check') {
    // Volno vybraného hotelu teď (ceny znovu, ne z mezipaměti) – vlastní limit jako ověření ceny letu
    if (rateLimited(req, config.verifiesPer10Min, stayChecks)) return sendJson(req, res, 429, { error: 'Příliš mnoho ověření – zkus to za pár minut.' });
    return sendJson(req, res, 200, await checkStay(Object.fromEntries(url.searchParams)));
  }
  if (p === '/api/stays') {
    if (rateLimited(req)) return sendJson(req, res, 429, { error: 'Příliš mnoho požadavků – zkus to za pár minut.' });
    // ID místa u Trip.com, Agody a Hostelworldu pro odkazy s termínem (v DEMO a s PARTNER_LOOKUP=0 bez sítě)
    return sendJson(req, res, 200, await searchStays(Object.fromEntries(url.searchParams), { partners: partnerLookups() }));
  }
  if (p === '/api/verify') {
    // Živé ověření konkrétních dat napříč aerolinkami (Kiwi.com) – průvodce cestou a ceny z mezipaměti ve výpisu.
    if (rateLimited(req, config.verifiesPer10Min, verifies)) return sendJson(req, res, 429, { error: 'Příliš mnoho ověření ceny – zkus to za pár minut.' });
    const from = (url.searchParams.get('from') || '').toUpperCase();
    const to = (url.searchParams.get('to') || '').toUpperCase();
    const out = url.searchParams.get('out') || '';
    const back = url.searchParams.get('back') || '';
    const adults = Math.min(9, Math.max(1, Number(url.searchParams.get('adults')) || 1));
    // Zavazadla z hledání (kabinový kufr / kufr k odbavení): odhad příplatku u každé nabídky jako ve výsledcích hledání.
    const bags = ['cabin', 'checked'].includes(url.searchParams.get('bags')) ? url.searchParams.get('bags') : 'none';
    // Návrat z/do jiného letiště (open-jaw): backFrom/backTo, výchozí = obráceně než tam.
    const backFrom = (url.searchParams.get('backFrom') || to).toUpperCase();
    const backTo = (url.searchParams.get('backTo') || from).toUpperCase();
    if (!getAirport(from) || !getAirport(to) || !isYmd(out) || (back && !isYmd(back)) || (back && (!getAirport(backFrom) || !getAirport(backTo)))) {
      return sendJson(req, res, 400, { error: 'Neplatné letiště nebo datum.' });
    }
    if (config.mock || !config.kiwi) return sendJson(req, res, 200, { available: false, items: [] });
    await loadRates();
    try {
      let trips;
      if (back && (backFrom !== to || backTo !== from)) {
        // Open-jaw = dvě jednosměrné letenky: nejlevnější kombinace tam × zpět.
        const [outs, backs] = await Promise.all([
          kiwi.exact({ from, to, dateOut: out, adults }),
          kiwi.exact({ from: backFrom, to: backTo, dateOut: back, adults }),
        ]);
        const top = (xs) => xs.filter((t) => t.flightCzk > 0).sort((a, b) => a.flightCzk - b.flightCzk).slice(0, 5);
        trips = top(outs).flatMap((o) => top(backs).map((b) => makeTrip(o.out, b.out)));
      } else {
        trips = await kiwi.exact({ from, to, dateOut: out, dateBack: back || null, adults });
      }
      const items = trips.filter((t) => t.flightCzk > 0).sort((a, b) => a.flightCzk - b.flightCzk).slice(0, 12);
      for (const t of items) {
        const parts = [t.out, t.back].filter(Boolean).map((l) => legBagCzk(l, bags));
        t.bagCzk = parts.reduce((s, x) => s + x.czk, 0);
        if (parts.some((x) => x.estimated)) t.bagEst = true;
      }
      return sendJson(req, res, 200, { available: true, items });
    } catch (e) {
      return sendJson(req, res, 200, { available: true, items: [], error: publicMessage(e) });
    }
  }
  if (p === '/api/photos') {
    // fotky měst na karty radaru (Wikipedia) – ?t=Řím|Tirana|…
    const t = (url.searchParams.get('t') || '').split('|').filter(Boolean);
    if (!t.length) return sendJson(req, res, 400, { error: 'Zadej názvy měst (t=Řím|Tirana).' });
    // Názvy, ke kterým server fotky ještě nemá, stojí dotazy na Wikipedii a s klíčem i na Pexels / Unsplash (strop pro celý
    // server) – jen do limitu z adresy; odpověď celá z mezipaměti zdarma. Aplikace 429 snese (karty bez fotky, příště znovu).
    if (!photosCached(t) && rateLimited(req, config.photosPer10Min, photoHits)) return sendJson(req, res, 429, { error: 'Příliš mnoho fotek najednou – zkus to za pár minut.' });
    const r = await cityPhotos(t);
    // fotky z Wikimedie jen na 6 h – po přidání klíče (Unsplash, Pexels) se brzy vymění za hezčí
    return sendJson(req, res, 200, r, { 'Cache-Control': `public, max-age=${r.partial ? 3600 : r.prov === 'wiki' ? 21600 : 86400}` });
  }
  if (p === '/api/climate') {
    // Dlouhodobé podnebí (meteostanice u letiště, jinak NASA POWER) u letiště, místa nebo hlavního letiště země – data se nemění.
    const sp = url.searchParams;
    const iata = (sp.get('iata') || '').toUpperCase();
    const cc = (sp.get('cc') || '').toUpperCase();
    let c;
    if (sp.has('month')) {
      // Doporučení: měsíc ve všech zemích najednou (u moře, u hlavního letiště, vzdálenost z Prahy) – jeden dotaz místo 190
      const s = seasonMonth(sp.get('month'));
      if (!s) return sendJson(req, res, 400, { error: 'Měsíc musí být 1–12.' });
      return sendJson(req, res, 200, { ...s, source: 'meteostanice u letišť (normály 1991–2020), jinde NASA POWER – dlouhodobý průměr, ne předpověď' }, { 'Cache-Control': 'public, max-age=604800' });
    }
    if (cc) {
      if (!/^[A-Z]{2}$/.test(cc)) return sendJson(req, res, 400, { error: 'Neplatný kód země.' });
      c = countryClimate(cc);
    } else if (iata) {
      if (!/^[A-Z]{3}$/.test(iata) || !getAirport(iata)) return sendJson(req, res, 400, { error: 'Neznámé letiště.' });
      const ac = airportClimate(iata);
      c = ac && { iata, city: getAirport(iata).cityCs, ...ac };
    } else if (sp.get('lat') && sp.get('lon')) {
      const lat = Number(sp.get('lat'));
      const lon = Number(sp.get('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return sendJson(req, res, 400, { error: 'Neplatná poloha (lat/lon).' });
      c = climateAt(lat, lon);
    } else {
      return sendJson(req, res, 400, { error: 'Zadej letiště (iata), polohu (lat, lon) nebo zemi (cc).' });
    }
    // země bez údajů (Andorra, Monako…) není chyba – detail země se ptá u každé a 404 by plnila konzoli
    if (!c && cc) return sendJson(req, res, 200, { none: true });
    if (!c) return sendJson(req, res, 404, { error: 'Pro toto místo nemám údaje o podnebí.' });
    return sendJson(req, res, 200, { ...c, source: sourceText(c.src) }, { 'Cache-Control': 'public, max-age=604800' });
  }
  if (p === '/api/ground') {
    // Vlak nebo bus místo letadla: odhad, srovnání s letadlem, odkazy; s datem i živé spoje RegioJetu (na vyžádání).
    let q;
    try {
      q = groundQuery(url.searchParams);
    } catch (e) {
      if (e instanceof GroundError) return sendJson(req, res, 400, { error: e.message });
      throw e;
    }
    // Dotaz na RegioJet počítá stejný limit jako hledání (odpověď z mezipaměti ne); po vyčerpání jen odhad a odkazy.
    return sendJson(req, res, 200, await groundInfo(q, { allowLive: () => !rateLimited(req) }));
  }
  if (p === '/api/cars') return sendJson(req, res, 200, searchCars(Object.fromEntries(url.searchParams)));
  if (p === '/api/fuel') {
    // Aktuální ceny nafty a benzínu (Kč/l) v ČR a okolních zemích pro cenu cesty autem (ČSÚ, Oil Bulletin EU)
    // a ceník nabíjení elektroauta (ev: odhad DC Kč/kWh, ceníky provozovatelů s datem).
    return sendJson(req, res, 200, await fuelInfo(), { 'Cache-Control': 'public, max-age=3600' });
  }
  if (p === '/api/poi') {
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return sendJson(req, res, 400, { error: 'Chybí poloha (lat/lon).' });
    const radiusKm = Math.min(25, Math.max(1, Number(url.searchParams.get('radius')) || 10));
    const dayTrips = url.searchParams.get('dayTrips') !== '0';
    if (exploreLimited(req, placesCached({ lat, lon, radiusKm, dayTrips }))) return sendJson(req, res, 429, TOO_MANY_EXPLORE);
    const items = config.mock ? mockPlaces({ lat, lon }) : await findPlaces({ lat, lon, radiusKm, dayTrips });
    return sendJson(req, res, 200, { demo: config.mock, items });
  }
  if (p === '/api/poi/trips') {
    // Objevuj s okruhem 50/100 km: nejzajímavější místa v okolí do ~120 km – stejné cíle (a mezipaměť) jako plánovač
    // výletů, takže „🎒 Výlet sem“ pak nečeká na další dotaz.
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return sendJson(req, res, 400, { error: 'Chybí poloha (lat/lon).' });
    if (exploreLimited(req, tripsCached({ lat, lon }))) return sendJson(req, res, 429, TOO_MANY_EXPLORE);
    try {
      const items = config.mock ? mockTrips({ lat, lon }) : await findTrips({ lat, lon });
      return sendJson(req, res, 200, { demo: config.mock, items });
    } catch (e) {
      console.warn(`poi/trips: ${e.message}`);
      return sendJson(req, res, 503, { error: 'Místa v okolí se teď nepodařilo načíst (Wikidata neodpovídá) – zkus to prosím za chvíli.' });
    }
  }
  if (p === '/api/poi/country') {
    // 🌍 Celá země v Objevuj: města a cíle z Wikivoyage, UNESCO a národní parky; vzdálenost od místa (lat/lon), země podle
    // kódu (cc), jinak podle polohy.
    const lat = url.searchParams.get('lat') == null ? NaN : Number(url.searchParams.get('lat'));
    const lon = url.searchParams.get('lon') == null ? NaN : Number(url.searchParams.get('lon'));
    const at = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const raw = (url.searchParams.get('cc') || '').toUpperCase();
    const cc = /^[A-Z]{2}$/.test(raw) ? raw : at ? countryAt(lat, lon) : '';
    if (!cc || !COUNTRY_BY_ISO.has(cc)) return sendJson(req, res, 400, { error: 'Neznámá země.' });
    // „Co hledáš?“: hory, pláže, ostrovy, jezera, hrady, zajímavá místa – až po výběru kategorie (?cat=mountain)
    const cat = url.searchParams.get('cat');
    if (cat != null) {
      if (!Object.hasOwn(COUNTRY_CATS, cat)) return sendJson(req, res, 400, { error: 'Neznámá kategorie.' });
      if (exploreLimited(req, countryCatCached(cc, cat))) return sendJson(req, res, 429, TOO_MANY_EXPLORE);
      try {
        const r = config.mock ? mockCountryCat(at ? { lat, lon } : { lat: 50, lon: 15 }, cat) : await countryCategory(cc, cat);
        return sendJson(req, res, 200, { demo: config.mock, cc, country: COUNTRY_BY_ISO.get(cc).cs, cat, degraded: Boolean(r.degraded), items: withDistance(r.items || [], at ? lat : NaN, at ? lon : NaN) });
      } catch (e) {
        console.warn(`poi/country ${cc} ${cat}: ${e.message}`);
        return sendJson(req, res, 503, { error: 'Wikidata teď neodpovídá – zkus to prosím za chvíli.' });
      }
    }
    if (exploreLimited(req, countryCached(cc))) return sendJson(req, res, 429, TOO_MANY_EXPLORE);
    try {
      const g = config.mock ? mockCountry(at ? { lat, lon } : { lat: 50, lon: 15 }) : await countryHighlights(cc);
      return sendJson(req, res, 200, { demo: config.mock, cc, country: COUNTRY_BY_ISO.get(cc).cs, degraded: Boolean(g.degraded), ...countryWithDistance(g, at ? lat : NaN, at ? lon : NaN) });
    } catch (e) {
      console.warn(`poi/country ${cc}: ${e.message}`);
      return sendJson(req, res, 503, { error: 'Přehled země se teď nepodařilo načíst (Wikidata neodpovídá) – zkus to prosím za chvíli.' });
    }
  }
  if (p === '/api/itinerary' && req.method === 'POST') {
    let b;
    try {
      b = JSON.parse((await readBody(req)) || '{}');
    } catch (e) {
      return badBody(req, res, e);
    }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return sendJson(req, res, 400, { error: 'Neplatný JSON' });
    const lat = Number(b.lat);
    const lon = Number(b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(req, res, 400, { error: 'Chybí poloha (lat/lon).' });
    if (!isYmd(b.start) || !isYmd(b.end) || daysBetween(b.start, b.end) < 0 || daysBetween(b.start, b.end) > 30) return sendJson(req, res, 400, { error: 'Neplatné datum (max. 31 dní).' });
    // Okruh jako u seznamu míst (/api/poi) – program pak použije už načtená místa z mezipaměti; starší klient bez něj 10 km.
    const near = { lat, lon, radiusKm: Math.min(25, Math.max(1, Number(b.radius) || 10)), dayTrips: true };
    if (exploreLimited(req, placesCached(near))) return sendJson(req, res, 429, TOO_MANY_EXPLORE);
    const places = config.mock ? mockPlaces({ lat, lon }) : await findPlaces(near);
    const exclude = new Set(Array.isArray(b.exclude) ? b.exclude.map(String) : []);
    const must = new Set(Array.isArray(b.include) ? b.include.map(String) : []);
    const pool = places.filter((x) => !exclude.has(x.id)).map((x) => (must.has(x.id) ? { ...x, score: x.score + 1000, pinned: true } : x));
    const interests = b.interests && typeof b.interests === 'object' ? Object.fromEntries(Object.entries(b.interests).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Math.min(3, Math.max(0, Number(v)))])) : {};
    const plan = planItinerary(pool, {
      center: { lat, lon }, start: b.start, end: b.end, pace: ['relaxed', 'normal', 'intense'].includes(b.pace) ? b.pace : 'normal',
      arrivalTime: /^\d{2}:\d{2}$/.test(b.arrivalTime || '') ? b.arrivalTime : '09:00',
      departureTime: /^\d{2}:\d{2}$/.test(b.departureTime || '') ? b.departureTime : null, interests,
      // s dětmi (zájem „S dětmi“, cesta s dětmi): zoo a park výš, nejvýš 1 muzeum za den, pomalejší chůze
      kids: b.kids === true,
    });
    return sendJson(req, res, 200, { demo: config.mock, ...plan, places });
  }
  if (p === '/api/nature') {
    // Leží místo v horách nebo v přírodě ze seznamu (Pec pod Sněžkou = Krkonoše, Poprad = Vysoké Tatry)? Program pobytu
    // pak nabídne túry na každý den. Jen výpočet nad vlastním seznamem – bez dotazu ven.
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return sendJson(req, res, 400, { error: 'Chybí poloha (lat/lon).' });
    return sendJson(req, res, 200, { area: natureAreaAt(lat, lon) }, { 'Cache-Control': 'public, max-age=86400' });
  }
  if (p === '/api/hikeplan' && req.method === 'POST') {
    // Túry na víc dní (server/lib/hikeplan.js): na každý den pobytu jedna túra z ubytování nebo ze startu u cíle.
    let b;
    try {
      b = JSON.parse((await readBody(req)) || '{}');
    } catch (e) {
      return badBody(req, res, e);
    }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return sendJson(req, res, 400, { error: 'Neplatný JSON' });
    const lat = Number(b.lat);
    const lon = Number(b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return sendJson(req, res, 400, { error: 'Chybí poloha (lat/lon).' });
    if (!isYmd(b.start) || !isYmd(b.end) || daysBetween(b.start, b.end) < 0 || daysBetween(b.start, b.end) > 30) return sendJson(req, res, 400, { error: 'Neplatné datum (max. 31 dní).' });
    const hm = (v) => (/^\d{2}:\d{2}$/.test(v || '') ? v : null);
    // radius = okruh míst načtených v Objevuj (stejná mezipaměť), fromBase false = střed oblasti z Objevuj, ne ubytování
    const radius = Number(b.radius) > 0 ? Math.min(25, Math.max(5, Number(b.radius))) : 0;
    const q = {
      lat, lon, label: String(b.label || '').slice(0, 120), start: b.start, end: b.end, arrivalTime: hm(b.arrivalTime), departureTime: hm(b.departureTime),
      kids: b.kids === true, fromBase: b.fromBase !== false, radius, exclude: Array.isArray(b.exclude) ? b.exclude.map(String).slice(0, 60) : [],
    };
    if (config.mock) {
      if (exploreLimited(req)) return sendJson(req, res, 429, TOO_MANY_EXPLORE);
      return sendJson(req, res, 200, { demo: true, ...(await mockHikePlan(q)) });
    }
    if (exploreLimited(req, placesCached({ lat, lon, radiusKm: radius || 15, dayTrips: Boolean(radius) }))) return sendJson(req, res, 429, TOO_MANY_EXPLORE);
    // starty u cílů (Wikidata), trasy (BRouter) a občerstvení (Overpass) mimo mezipaměť jdou do limitu Objevuj (jednou)
    q.onMiss = exploreCharge(req);
    try {
      return sendJson(req, res, 200, { demo: false, ...(await planHikes(q)), ...(mapyReady(1) ? { tiles: 'mapy' } : {}) });
    } catch (e) {
      if (e.code === 'LIMIT') return sendJson(req, res, 429, TOO_MANY_EXPLORE);
      console.warn(`hikeplan: ${e.message}`);
      return sendJson(req, res, 503, { error: 'Túry se teď nepodařilo naplánovat (Wikidata neodpovídá) – zkus to prosím za chvíli.' });
    }
  }
  if (p === '/api/roadtrip' && req.method === 'POST') {
    let b;
    try {
      b = JSON.parse((await readBody(req)) || '{}');
    } catch (e) {
      return badBody(req, res, e);
    }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return sendJson(req, res, 400, { error: 'Neplatný JSON' });
    const lat = Number(b.lat);
    const lon = Number(b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return sendJson(req, res, 400, { error: 'Chybí poloha (lat/lon).' });
    if (!isYmd(b.start)) return sendJson(req, res, 400, { error: 'Neplatné datum.' });
    if (exploreLimited(req, tripsCached({ lat, lon }))) return sendJson(req, res, 429, TOO_MANY_EXPLORE);
    let candidates;
    try {
      candidates = config.mock ? mockTrips({ lat, lon }) : await findTrips({ lat, lon });
    } catch (e) {
      console.warn(`roadtrip: ${e.message}`);
      return sendJson(req, res, 503, { error: 'Cíle výletů se teď nepodařilo načíst (Wikidata neodpovídá) – zkus to prosím za chvíli.' });
    }
    const exclude = new Set(Array.isArray(b.exclude) ? b.exclude.map(String) : []);
    const must = new Set(Array.isArray(b.include) ? b.include.map(String) : []);
    const days = Number(b.days) || 1;
    // Okruh „po Toskánsku“: kandidáti jsou z kruhu 120 km kolem města oblasti (i Ravenna, Perugia) – nech jen ty
    // uvnitř oblasti (připnuté vždy); kdyby jich bylo málo na plán, zůstane kruh.
    const area = keepInRegion(candidates, b.region, { min: Math.min(10, days) + 3, keep: (x) => must.has(x.id) });
    const pool = area.filter((x) => !exclude.has(x.id)).map((x) => (must.has(x.id) ? { ...x, baseScore: x.score, score: x.score + 1000, pinned: true } : x));
    const plan = planTrips(pool, {
      base: { lat, lon, label: String(b.label || 'Start').slice(0, 120) },
      start: b.start,
      days,
      mode: b.mode === 'loop' ? 'loop' : 'day',
      transport: b.transport === 'transit' ? 'transit' : 'car',
      interests: Array.isArray(b.interests) ? b.interests.map(String).slice(0, 6) : [],
      pace: ['relaxed', 'normal', 'intense'].includes(b.pace) ? b.pace : 'normal',
      adults: Math.min(9, Math.max(1, Number(b.adults) || 2)),
    });
    // připnuté (+1000) vrať se skutečným skóre
    const unpin = ({ baseScore, ...x }) => (x.pinned ? { ...x, score: baseScore } : x);
    for (const d of plan.days) d.stops = d.stops.map(unpin);
    plan.spare = plan.spare.map(unpin);
    // Přírodní cíle se pro nové místo načítají déle – zvolil-li uživatel přírodu, ať to ví.
    if (candidates.natureLoading && plan.note !== undefined && Array.isArray(b.interests) && b.interests.includes('nature')) {
      plan.note = ['Přírodní cíle se pro toto místo ještě načítají – za minutu naplánuj znovu, bude jich víc.', plan.note].filter(Boolean).join(' ');
    }
    // degraded = nenačetly se popisy z Wikipedie (aplikace to hlásí); neúplné cíle (příroda se ještě načítá) ne
    // inRegion = cíle jen z oblasti (Toskánsko), ne z celého kruhu 120 km – aplikace to napíše pod plán
    return sendJson(req, res, 200, { demo: config.mock, degraded: Boolean(candidates.descFailed), candidates: candidates.length, inRegion: area !== candidates, ...plan });
  }
  if (p === '/api/stayplan' && req.method === 'POST') {
    // Pobyt na víc místech: návrh trasy (města z Wikidat), nebo jen přepočet přejezdů upravené trasy.
    let b;
    try {
      b = JSON.parse((await readBody(req)) || '{}');
    } catch (e) {
      return badBody(req, res, e);
    }
    if (b && typeof b === 'object' && b.bases === undefined && rateLimited(req)) return sendJson(req, res, 429, { error: 'Příliš mnoho požadavků – zkus to za pár minut.' });
    // Přepočet nad svým limitem se neodmítá: odpoví bez nových dotazů na BRouter (trasy z mezipaměti, jinak odhad).
    const allowRoutes = () => !rateLimited(req, config.rechecksPer10Min, rechecks);
    try {
      return sendJson(req, res, 200, { demo: config.mock, ...(await planStay(b, { mock: config.mock, allowRoutes })) });
    } catch (e) {
      if (e instanceof StayPlanError) return sendJson(req, res, 400, { error: e.message });
      console.warn(`stayplan: ${e.message}`);
      return sendJson(req, res, 503, { error: 'Návrh trasy se teď nepodařilo připravit (Wikidata neodpovídá) – zkus to prosím za chvíli, nebo přidej místa ručně.' });
    }
  }
  if ((p === '/api/bike' || p === '/api/hike') && req.method === 'POST') {
    const hike = p === '/api/hike';
    let b;
    try {
      b = JSON.parse((await readBody(req)) || '{}');
    } catch (e) {
      return badBody(req, res, e);
    }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return sendJson(req, res, 400, { error: 'Neplatný JSON' });
    const lat = Number(b.lat);
    const lon = Number(b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return sendJson(req, res, 400, { error: 'Chybí poloha (lat/lon).' });
    const q = {
      lat, lon, km: Number(b.km) || (hike ? 10 : 30), variant: Number(b.variant) || 0,
      scenery: ['city', 'mixed', 'nature'].includes(b.scenery) ? b.scenery : 'mixed',
      hills: ['flat', 'normal', 'hilly'].includes(b.hills) ? b.hills : 'normal',
    };
    // Pěšky u hor a přírody (Objevuj): start okruhu na parkovišti, nádraží nebo v obci u cíle; area = okruh oblasti (10/20 km).
    if (hike && NATURE_KINDS.includes(b.nature)) q.area = Number(b.area) === 20 ? 20 : 10;
    // Kolo: typ kola; „vlakem tam, na kole zpět“ potřebuje i název a zemi domova (odkaz do IDOS).
    if (!hike) {
      Object.assign(q, { bike: String(b.bike || 'trekking'), kind: b.kind === 'train' ? 'train' : 'loop' });
      if (q.kind === 'train') Object.assign(q, { label: String(b.label || '').slice(0, 120), cc: /^[A-Z]{2}$/.test(b.cc) ? b.cc : '' });
    }
    const plan = hike ? hikeLoop : q.kind === 'train' ? bikeFromStation : bikeLoop;
    if (config.mock) {
      if (exploreLimited(req)) return sendJson(req, res, 429, TOO_MANY_EXPLORE);
      return sendJson(req, res, 200, { demo: true, ...(hike ? mockHikeLoop : q.kind === 'train' ? mockBikeFromStation : mockBikeLoop)(q) });
    }
    // Do limitu Objevuj až první dotaz mimo mezipaměť (nová trasa, nádraží); už spočítaná trasa („Jiná trasa“ znovu) je zdarma.
    q.onMiss = exploreCharge(req);
    try {
      if (q.scenery === 'city' && q.kind !== 'train') {
        // Památky po cestě: ty, které už má načtené stránka Objevuj (nejlepší první), jinak stejná data ze serveru.
        const sent = Array.isArray(b.sights) ? b.sights.slice(0, 40)
          .map((x) => ({ name: String(x?.name || '').slice(0, 120), lat: Number(x?.lat), lon: Number(x?.lon), score: Number(x?.score) || 0 }))
          .filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lon)) : [];
        const near = { lat, lon, radiusKm: Math.min(25, Math.max(3, q.km / 5)), dayTrips: false };
        if (sent.length < 3 && !placesCached(near)) q.onMiss();
        const places = sent.length >= 3 ? sent : await findPlaces(near).catch(() => []);
        q.sights = places.filter((x) => x.category !== 'daytrip').sort((x, y) => (y.score || 0) - (x.score || 0)).map((x) => ({ name: x.name, lat: x.lat, lon: x.lon }));
      }
      // tiles: 'mapy' = server nabízí turistickou mapu Mapy.com (/api/tiles/mapy/outdoor/…) – mapa ji dá pod trasu
      return sendJson(req, res, 200, { demo: false, ...(await plan(q)), ...(mapyReady(1) ? { tiles: 'mapy' } : {}) });
    } catch (e) {
      if (e.code === 'LIMIT') return sendJson(req, res, 429, TOO_MANY_EXPLORE);
      console.warn(`${hike ? 'hike' : 'bike'}: ${e.message}`);
      if (e.code === 'NO_STATION') return sendJson(req, res, 404, { error: e.message });
      const error = e.code === 'WDQS' ? 'Nádraží v okolí se teď nepodařilo načíst (Wikidata neodpovídá) – zkus to prosím za chvíli.'
        : `${hike ? 'Pěší trasu' : 'Trasu na kolo'} se teď nepodařilo naplánovat (plánovač tras neodpovídá) – zkus to prosím za chvíli.`;
      return sendJson(req, res, 503, { error });
    }
  }
  if (p === '/api/search' && req.method === 'POST') return handleSearch(req, res);
  if (p.startsWith('/api/tiles/mapy/')) {
    // Dlaždice Mapy.com přes server: klíč zůstane tady, platí strop kreditů a mezipaměť; prohlížeč si dlaždici drží týden.
    const t = parseTile(p);
    if (!t) return sendJson(req, res, 400, { error: 'Neplatná dlaždice (sada basic / outdoor / winter / aerial, zoom 0–20).' });
    if (!mapyOn()) return sendJson(req, res, 404, { error: 'Mapy.com není zapnuté (chybí MAPY_API_KEY).' });
    if (!tileCached(t) && rateLimited(req, config.tilesPer10Min, tileHits)) return sendJson(req, res, 429, { error: 'Příliš mnoho dlaždic – zkus to za pár minut.' });
    try {
      const { body, type } = await mapyTile(t);
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'public, max-age=604800' });
      return res.end(body);
    } catch (e) {
      // strop kreditů, pojistka, chyba Mapy.com: mapa v prohlížeči po pár chybách vrstvu Mapy.com sundá (zůstane OpenFreeMap)
      return sendJson(req, res, 503, { error: 'Dlaždice Mapy.com teď není k dispozici.' }, { 'Retry-After': '300' });
    }
  }
  if (p.startsWith('/api/')) return sendJson(req, res, 404, { error: 'Neznámý endpoint' });

  // Service worker (aplikace na ploše, offline): verze a seznam souborů z obsahu public/ – server/lib/pwa.js
  if (p === '/sw.js') return serveServiceWorker(req, res, appDirs());

  // Vyhledávače a náhledy odkazů (server/lib/seo.js): adresa webu z PUBLIC_URL, název a popis z server/brand.js
  if (p === '/robots.txt') return sendGenerated(req, res, 200, robotsTxt(config.publicUrl), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  if (p === '/sitemap.xml') return sendGenerated(req, res, 200, sitemapXml(config.publicUrl), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  if (p === '/manifest.webmanifest' && serveManifest(req, res, path.join(PUBLIC, 'manifest.webmanifest'))) return;
  // Krátký odkaz na sdílenou cestu: náhled odkazu (cíl, termín, fotka) a přesměrování do aplikace na /#s=<id>
  if (/^\/c\/[A-Za-z0-9]{8}$/.test(p) && shareStore) {
    const id = p.slice(3), r = await loadShare(shareStore, id);
    if (r) return sendGenerated(req, res, 200, sharePage(id, r, config.publicUrl, `${config.publicUrl}/${BRAND.image.path}`), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  }

  // Statické soubory
  if (p === '/data/countries.json' || p === '/data/entry.json') {
    // entry.json = vstupní podmínky pro občany ČR; prohlížeč ho načítá až po startu (nezdržuje první vykreslení)
    if (serveFile(req, res, path.join(DATA, p.slice(6)), { maxAge: 3600 })) return;
  }
  // Stránka aplikace s dosazenou verzí (pwa.js podle ní pozná novou verzi i v aplikaci na ploše) a titulkem, popisem
  // a náhledem odkazu (seo.js). Sdílené odkazy do aplikace (#trip=, #plan=, #offer=, zkratky #flights…) vedou sem.
  if (p === '/' || p === '/index.html') return serveIndex(req, res, appDirs(), headTags(config.publicUrl));
  let rel;
  try {
    rel = decodeURIComponent(p);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  // Skryté soubory a složky (.env, .git, .DS_Store) se nikdy neposílají – kdyby se do public/ dostaly; service worker
  // je taky nebere (pwa.js walk)
  if (/(^|[\\/])\./.test(path.relative(PUBLIC, file))) return serveNotFound(req, res);
  // Kód aplikace (HTML, JS, CSS, manifest) se vždy ověří u serveru (no-cache → levné 304): po nasazení nikdy stará
  // verze – ani z paměti otevřeného panelu, která by soubor s max-age použila bez ptaní. Obrázky, písma a data mapy
  // ve vendor/ mají mezipaměť jako dřív.
  const maxAge = /\.(?:html|js|css|webmanifest)$/.test(rel) ? 0 : rel.startsWith('/vendor/') ? 86400 * 30 : 60;
  if (serveFile(req, res, file, { maxAge })) return;
  // Neznámá adresa: česká stránka 404 s odkazem do aplikace. Dřív stránka aplikace se stavem 200 – vyhledávačům se pak
  // každá adresa jevila jako kopie úvodní stránky. Aplikace má sekce i sdílené odkazy za # na „/“, takže je to nemění;
  // offline dá service worker na každou adresu dál uloženou stránku aplikace (sw.js), online ukáže tuhle 404.
  serveNotFound(req, res);
}

export function createServer() {
  // Pomalý klient (hlavičky / tělo po kapkách) nesmí držet spojení minuty: hlavičky do 20 s, celý požadavek do 30 s.
  // Platí jen pro příjem požadavku – dlouhé streamované hledání (odpověď) se tím nezkracuje.
  return http.createServer({ headersTimeout: 20e3, requestTimeout: 30e3 }, (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v); // server/lib/security.js
    route(req, res).catch((e) => {
      // Chyba cizí služby (HttpError z request()) není chyba uživatele: 503 a česky, bez adresy API.
      if (e instanceof HttpError) {
        console.warn(`upstream ${e.status}: ${String(e.message).slice(0, 200)}`);
        const busy = e.status === 429;
        if (!res.headersSent) {
          return sendJson(req, res, 503, { error: busy ? 'Zdroj dat je teď přetížený – zkus to prosím za minutu.' : 'Zdroj dat teď neodpovídá – zkus to prosím za chvíli.' });
        }
        return res.end();
      }
      if (/^Timeout \d+ ms/.test(e.message || '') && !res.headersSent) return sendJson(req, res, 503, { error: 'Zdroj dat odpovídá příliš pomalu – zkus to prosím za chvíli.' });
      const status = e.status >= 400 && e.status < 600 ? e.status : 500;
      if (status >= 500) console.error(e);
      // chyba uživatele (400 – UserError, StayQueryError) má český text pro aplikaci; jiná (chyba v kódu) jen do logu
      if (!res.headersSent) sendJson(req, res, status, { error: status < 500 ? e.message : 'Chyba serveru – zkus to prosím za chvíli znovu.' });
      else res.end();
    });
  });
}

// Po startu předehřej kurzy a seznamy letišť a vypiš, jestli jsou zdroje dostupné (vidět v logu hostingu).
async function warmUp() {
  await loadRates();
  console.log(`Kurzy: ${fxInfo().source}, 1 EUR = ${fxInfo().eurCzk} Kč`);
  if (config.mock) return;
  refreshFuel().then(() => console.log(`Ceny PHM: ${fuelText('CZ', 'diesel')}`)).catch(() => {});
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
