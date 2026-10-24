// Aplikace na ploše (PWA): public/sw.js s verzí podle obsahu souborů aplikace a se seznamem souborů, které si
// service worker při instalaci uloží pro offline. Obojí se odvozuje ze souborů na disku: skript přejmenovaný
// v index.html se do seznamu dostane sám a smazaný z něj vypadne (instalace tak nikdy nespadne na 404) a každá
// změna v public/ (nebo v datech, která se ukládají) změní verzi → prohlížeč nainstaluje nový service worker.
// Kód aplikace (JS, CSS) má ve stránce adresu s otiskem obsahu (js/app.js?v=…, versionAssets) – Cloudflare a prohlížeč
// ho pak drží bez ptaní serveru (server/index.js serveFile) a změněný soubor má novou adresu.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pageCsp } from './security.js';

// Data, která aplikace stahuje až za běhu (ne přes <script>/<link> v index.html) a bez kterých by offline chyběly
// země (přehled, plánovač), vstupní podmínky, karta „Co zařídit a co sbalit“ a mapa navštívených zemí. data/…
// jako server: ze složky data/ (countries.json, entry.json), a když tam soubor není, z public/data/ (pretrip.json).
export const RUNTIME_ASSETS = ['data/countries.json', 'data/entry.json', 'data/pretrip.json', 'vendor/countries-110m.json'];
const LINK_RELS = /^(?:stylesheet|manifest|icon|shortcut icon|apple-touch-icon)$/i;

/** Hodnota atributu ze značky (v uvozovkách, apostrofech i bez nich), nebo undefined. */
const attrOf = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x !== undefined);
const FOREIGN = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * Místní soubory, na které odkazuje index.html: skripty, styly, manifest a ikony (ne cizí weby, data: ani preconnect).
 * Skripty i z data-later (moduly, které js/lazy.js načte až po startu) – offline musí být všechny. Knihovny map
 * z data-files (lazy.js Lazy.url – načtou se, až je uživatel otevře, ~1,3 MB) ne: offline se neukládaly ani dřív.
 */
export function shellAssets(html) {
  const out = [];
  for (const m of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (name) => attrOf(tag, name);
    const isScript = m[1].toLowerCase() === 'script';
    if (!isScript && !LINK_RELS.test((attr('rel') || '').trim())) continue;
    const later = isScript ? (attr('data-later') || '').split(/\s+/) : [];
    for (const url of [attr(isScript ? 'src' : 'href'), ...later]) {
      if (!url || FOREIGN.test(url)) continue;
      const rel = url.replace(/^\.?\//, '').split('#')[0];
      if (rel && !out.includes(rel)) out.push(rel);
    }
  }
  return out;
}

/** Krátký otisk obsahu souboru do adresy (?v=…) – podle něj server pozná, že požadavek chce právě tento obsah. */
export const contentVersion = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

// Verzi v adrese má kód aplikace (JS, CSS): bez ní ho server posílá s no-cache. Obrázky a data mají max-age jako dřív,
// manifest zůstává na své adrese (podle ní Chrome pozná nainstalovanou aplikaci).
const VERSIONED = /\.(?:js|css)$/i;

/**
 * index.html s otiskem obsahu v adresách kódu aplikace: <script src>, <link rel="stylesheet" href> a seznamy data-later
 * (moduly po startu) a data-files (knihovny map – lazy.js Lazy.url). versionOf(rel) → otisk, nebo null (soubor není –
 * adresa zůstane jak je). Cizí weby, adresy s ?parametrem, ostatní značky, poznámky a obsah vložených skriptů (jejich
 * otisky jsou v CSP stránky) se nemění. Bez verze (starší stránka v mezipaměti) server soubory posílá dál – s no-cache.
 */
export function versionAssets(html, versionOf) {
  const one = (url) => {
    if (!url || FOREIGN.test(url) || /[?#]/.test(url) || !VERSIONED.test(url)) return url;
    const v = versionOf(url.replace(/^\.?\//, ''));
    return v ? `${url}?v=${v}` : url;
  };
  const tag = (start, isScript) => {
    if (!isScript && !/^stylesheet$/i.test((attrOf(start, 'rel') || '').trim())) return start;
    const names = isScript ? /^(?:src|data-later|data-files)$/i : /^href$/i;
    return start.replace(/(\s([\w-]+)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g, (m, pre, attr, dq, sq, bare) => {
      if (!names.test(attr)) return m;
      const value = dq ?? sq ?? bare;
      const out = /^data-/i.test(attr) ? value.split(/\s+/).filter(Boolean).map(one).join(' ') : one(value);
      const q = dq !== undefined ? '"' : sq !== undefined ? "'" : '';
      return `${pre}${q}${out}${q}`;
    });
  };
  // u <script> jen začátek značky – text vloženého skriptu (i s „<script src=…>“ v řetězci) zůstane, jak je
  return html.replace(/<!--[\s\S]*?-->|(<script\b[^>]*>)([\s\S]*?<\/script\s*>)|<link\b[^>]*>/gi, (m, start, rest) => (
    m.startsWith('<!--') ? m : start ? tag(start, true) + rest : tag(m, false)));
}

/** Ikony z manifestu (i u zkratek) jako adresy vůči kořeni – Chrome je čte i offline (okno a ikona aplikace). */
export function manifestIcons(json, manifestRel = 'manifest.webmanifest') {
  let m;
  try {
    m = JSON.parse(json);
  } catch {
    return [];
  }
  const base = new URL(manifestRel, 'http://atlas.invalid/');
  const icons = [...(Array.isArray(m.icons) ? m.icons : []), ...(Array.isArray(m.shortcuts) ? m.shortcuts : []).flatMap((s) => (s && Array.isArray(s.icons) ? s.icons : []))];
  const out = [];
  for (const icon of icons) {
    if (!icon || typeof icon.src !== 'string') continue;
    const u = new URL(icon.src, base);
    if (u.origin !== base.origin) continue;
    const rel = u.pathname.slice(1);
    if (rel && !out.includes(rel)) out.push(rel);
  }
  return out;
}

/** Soubor na disku pro adresu ze seznamu (data/… nejdřív ze složky data/ jako server, jinak z public/); mimo ně nebo neexistující → null. */
function fileFor(rel, { publicDir, dataDir }) {
  let p;
  try {
    p = decodeURIComponent(rel.split('?')[0]);
  } catch {
    return null;
  }
  const at = (dir, sub) => {
    const abs = path.normalize(path.join(dir, sub));
    if (!abs.startsWith(dir + path.sep)) return null;
    try {
      const st = statSync(abs);
      return st.isFile() ? { abs, size: st.size, mtime: st.mtimeMs } : null;
    } catch {
      return null;
    }
  };
  return (p.startsWith('data/') && at(dataDir, p.slice(5))) || at(publicDir, p);
}

function walk(dir, prefix) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs, `${prefix}${name}/`));
    else if (st.isFile()) out.push({ rel: prefix + name, abs, size: st.size, mtime: st.mtimeMs });
  }
  return out;
}

const BUILD_RE = /^const BUILD = '[^']*';/m;
const PRECACHE_RE = /^const PRECACHE = \[[^\]\n]*\];/m;
let memo = null;

/**
 * public/sw.js s dosazenou verzí a seznamem souborů → { body, build, etag, precache, html }; html = index.html
 * s otiskem obsahu v adresách kódu aplikace (versionAssets) – stejné adresy jako v seznamu, který si service worker uloží.
 * Verze = otisk obsahu všech souborů v public/ a dat z RUNTIME_ASSETS – ne časů změny, takže nové nasazení se stejnými
 * soubory má stejnou verzi a prohlížeč nic znovu nestahuje. Přepočítá se, jen když se u některého souboru změní
 * velikost nebo čas změny (úprava během vývoje se tak projeví i bez restartu serveru). salt = co server do stránky
 * a manifestu dosazuje mimo public/ (název, popis a adresa webu – server/brand.js, PUBLIC_URL): i jeho změna je nová
 * verze, jinak by aplikace na ploše dál brala starý název z uložené sady.
 */
export function serviceWorker({ publicDir, dataDir, salt = '' }) {
  const dirs = { publicDir, dataDir };
  const data = RUNTIME_ASSETS.filter((u) => u.startsWith('data/')).map((u) => ({ rel: u, ...fileFor(u, dirs) })).filter((f) => f.abs);
  const files = [...walk(publicDir, 'public/'), ...data];
  const key = [publicDir, dataDir, salt, ...files.map((f) => `${f.rel}:${f.size}:${f.mtime}`)].join('|');
  if (memo && memo.key === key) return memo.value;

  const hash = createHash('sha256');
  const versions = new Map(); // soubor na disku → otisk obsahu do adresy (jen kód aplikace)
  for (const f of files) {
    const buf = readFileSync(f.abs);
    hash.update(`${f.rel}\0`).update(buf).update('\0');
    // do 3 MB jako server (serveFile: větší soubor nedrží v paměti, immutable by nedostal)
    if (VERSIONED.test(f.rel) && f.size < 3e6) versions.set(f.abs, contentVersion(buf));
  }
  if (salt) hash.update(`salt\0${salt}`);
  const build = hash.digest('hex').slice(0, 12);
  const html = versionAssets(readFileSync(path.join(publicDir, 'index.html'), 'utf8'), (rel) => versions.get(fileFor(rel, dirs)?.abs) || null);
  const shell = shellAssets(html);
  const icons = shell.filter((u) => u.endsWith('.webmanifest') && fileFor(u, dirs))
    .flatMap((u) => manifestIcons(readFileSync(fileFor(u, dirs).abs, 'utf8'), u));
  const precache = ['./', ...[...shell, ...icons, ...RUNTIME_ASSETS].filter((u, i, all) => all.indexOf(u) === i && fileFor(u, dirs))];
  const tpl = readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
  if (!BUILD_RE.test(tpl) || !PRECACHE_RE.test(tpl)) throw new Error('public/sw.js: chybí řádek „const BUILD = …;“ nebo „const PRECACHE = […];“');
  const body = Buffer.from(tpl
    .replace(BUILD_RE, `const BUILD = '${build}';`)
    .replace(PRECACHE_RE, () => `const PRECACHE = ${JSON.stringify(precache)};`));
  const value = { body, build, etag: `"sw-${build}"`, precache, html };
  memo = { key, value };
  return value;
}

/** GET/HEAD /sw.js: vždy ověřit u serveru (no-cache), ETag pro levné 304, verze i v hlavičce X-Atlas-Build (pwa.js). */
export function serveServiceWorker(req, res, dirs) {
  let sw;
  try {
    sw = serviceWorker(dirs);
  } catch (e) {
    console.error('[sw.js]', e.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('Service worker není k dispozici');
  }
  const headers = { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', ETag: sw.etag, 'X-Atlas-Build': sw.build };
  if ((req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(sw.etag)) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, { ...headers, 'Content-Length': sw.body.length });
  res.end(sw.body);
}

const BUILD_META_RE = /<meta name="atlas-build" content="[^"]*">/;
// titulek, popis, náhled odkazu a JSON-LD (server/lib/seo.js headTags) – v index.html jen značky s poznámkou
const BRAND_RE = /<!-- brand\b[\s\S]*?<!-- \/brand -->/;
let indexMemo = null;

/**
 * GET/HEAD stránky aplikace (/ a /index.html): index.html s dosazenou verzí do <meta name="atlas-build"> – pwa.js tak
 * zná verzi stránky, i když ji service worker dal z uložené kopie, a hned pozná novější na serveru – a se značkami
 * head (titulek, popis, náhled odkazu) místo bloku <!-- brand … --> … <!-- /brand -->. Skripty a styly s otiskem obsahu
 * v adrese (versionAssets) – ty pak Cloudflare i prohlížeč drží napořád; stránka sama no-cache + ETag podle obsahu
 * (levné 304), gzip podle Accept-Encoding. CSP se počítá z hotové stránky (verze v adresách otisky vložených skriptů nemění).
 */
export function serveIndex(req, res, dirs, head = '') {
  const file = path.join(dirs.publicDir, 'index.html');
  let st, build = null;
  try {
    st = statSync(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  let versioned = null;
  try {
    ({ build, html: versioned } = serviceWorker(dirs));
  } catch (e) {
    // bez verze – aplikace ji zjistí jako dřív (HEAD /sw.js) a soubory bez otisku v adrese dostane s no-cache
    console.error('[index.html]', e.message);
  }
  const key = `${build}|${st.size}|${st.mtimeMs}|${head}`;
  if (!indexMemo || indexMemo.key !== key) {
    const html = (versioned ?? readFileSync(file, 'utf8')).replace(BRAND_RE, () => head);
    const body = Buffer.from(build ? html.replace(BUILD_META_RE, `<meta name="atlas-build" content="${build}">`) : html);
    // CSP s otisky vložených skriptů právě této stránky (security.js) – změna skriptu v index.html se projeví sama
    indexMemo = { key, body, gz: zlib.gzipSync(body), etag: `"ix-${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`, csp: pageCsp(body.toString('utf8')) };
  }
  const { body, gz, etag, csp } = indexMemo;
  // X-Atlas-Build: service worker se stejnou verzí pak soubory stránky vezme z uložené sady bez ptaní serveru (sw.js)
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding', 'Content-Security-Policy': csp, ...(build ? { 'X-Atlas-Build': build } : {}) };
  if ((req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(etag)) {
    res.writeHead(304, headers);
    return res.end();
  }
  const zip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const out = zip ? gz : body;
  res.writeHead(200, { ...headers, ...(zip ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': out.length });
  res.end(req.method === 'HEAD' ? undefined : out);
}
