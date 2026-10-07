// Aplikace na ploše (PWA) a offline: manifest a ikony, hlavičky serveru (sw.js, manifest, HTML), service worker
// (public/sw.js – směrování jako čistá funkce a instalace / aktivace / fetch ve falešném prostředí service workeru
// přes node:vm), verze a seznam souborů ze serveru (server/lib/pwa.js) a srozumitelné chyby sítě (public/js/pwa.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, renameSync, utimesSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { serviceWorker, shellAssets, manifestIcons, RUNTIME_ASSETS } = await import('../server/lib/pwa.js');
const { ICONS, renderIcon, crc32 } = await import('../scripts/build-icons.mjs');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUB = path.join(ROOT, 'public');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const INDEX = read('public/index.html');
const CSS = read('public/css/atlas.css');
const themeBg = (t) => CSS.match(new RegExp(`\\[data-theme="${t}"\\]\\{[^}]*--bg:(#[0-9a-f]{6})`))[1];

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/* ---------- PNG: podpis, CRC bloků, rozměry a pixely (RGBA) ---------- */
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
function readPng(buf, name) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${name}: podpis PNG`);
  let off = 8, ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    assert.equal(buf.readUInt32BE(off + 8 + len), crc32(buf.subarray(off + 4, off + 8 + len)), `${name}: CRC bloku ${type}`);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  assert.ok(ihdr && ihdr.depth === 8 && [2, 6].includes(ihdr.color) && ihdr.interlace === 0, `${name}: 8bitové RGB/RGBA`);
  const bpp = ihdr.color === 6 ? 4 : 3, stride = ihdr.width * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(ihdr.width * ihdr.height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < ihdr.height; y++) {
    const f = raw[y * (stride + 1)], line = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      line[i] = (raw[y * (stride + 1) + 1 + i] + [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 0xff;
    }
    for (let x = 0; x < ihdr.width; x++) for (let j = 0; j < 4; j++) px[(y * ihdr.width + x) * 4 + j] = j < bpp ? line[x * bpp + j] : 255;
    prev = line;
  }
  return { ...ihdr, px };
}
const alphaAt = (img, x, y) => img.px[(y * img.width + x) * 4 + 3];

test('manifest: česky, standalone, barvy z atlas.css, ikony 192/512 i maskovatelná – existují a mají uvedené rozměry', async () => {
  const r = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/manifest+json');
  const m = JSON.parse(await r.text());
  // Chrome na Androidu píše name dole na úvodní obrazovku aplikace – krátce, popis je v description
  assert.equal(m.short_name, 'ATLAS');
  assert.equal(m.name, 'ATLAS');
  assert.ok(m.description.length > 40);
  assert.deepEqual([m.id, m.start_url, m.scope, m.display, m.lang], ['/', '/', '/', 'standalone', 'cs']);
  assert.equal(m.theme_color, themeBg('dark'), 'výchozí motiv ATLASu je tmavý');
  assert.equal(m.background_color, themeBg('dark'));
  const any = m.icons.filter((i) => (i.purpose || 'any').split(' ').includes('any')).map((i) => i.sizes);
  assert.ok(any.includes('192x192') && any.includes('512x512'), 'instalovatelnost: ikony 192 a 512');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'), 'Android: maskovatelná ikona');
  const all = [...m.icons, ...(m.shortcuts || []).flatMap((s) => s.icons || [])];
  for (const s of m.shortcuts || []) assert.match(s.url, /^\/#(flights|trip|planner|explore|dashboard)$/, 'zkratka vede na sekci aplikace');
  for (const icon of all) {
    const res = await fetch(new URL(icon.src, `${base}/manifest.webmanifest`));
    assert.equal(res.status, 200, icon.src);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(icon.type, 'image/png');
    const img = readPng(Buffer.from(await res.arrayBuffer()), icon.src);
    assert.equal(`${img.width}x${img.height}`, icon.sizes, `${icon.src}: skutečné rozměry`);
    const opaque = img.px.every((v, i) => i % 4 !== 3 || v === 255);
    if (icon.purpose === 'maskable') {
      assert.ok(opaque, `${icon.src}: maskovatelná ikona bez průhlednosti (Android ji ořízne)`);
      // úvodní obrazovka Chromu ji ukáže celou: rohy v barvě pozadí (splynou s background_color), jinak přechod
      const rgbAt = (x, y) => { const o = (y * img.width + x) * 4; return '#' + [0, 1, 2].map((j) => img.px[o + j].toString(16).padStart(2, '0')).join(''); };
      assert.equal(rgbAt(0, 0), m.background_color, `${icon.src}: roh = pozadí úvodní obrazovky`);
      assert.equal(rgbAt(img.width - 1, img.height - 1), m.background_color);
      // na ploše je vidět střed ikony (podle Androidu a Chromu 67–87 %): kruh 87 % i čtverec 80 % jen přechod
      const k = Math.round(img.width * (0.5 - 0.87 / 2 / Math.SQRT2)), q = Math.round(img.width * 0.1);
      assert.notEqual(rgbAt(k, k), m.background_color, `${icon.src}: na ploše žádný tmavý okraj (kruh)`);
      assert.notEqual(rgbAt(q, q), m.background_color, `${icon.src}: na ploše žádný tmavý okraj (čtverec)`);
    }
    else {
      assert.equal(alphaAt(img, 0, 0), 0, `${icon.src}: průhledný zaoblený roh`);
      assert.equal(alphaAt(img, img.width >> 1, img.height >> 1), 255);
    }
  }
});

test('ikony v public/icons/ odpovídají scripts/build-icons.mjs (po změně vzhledu stačí skript spustit znovu)', () => {
  for (const icon of ICONS) {
    const img = readPng(readFileSync(path.join(PUB, 'icons', icon.file)), icon.file);
    assert.deepEqual([img.width, img.height], [icon.size, icon.size], icon.file);
    assert.ok(Buffer.from(renderIcon(icon)).equals(Buffer.from(img.px)), `${icon.file}: pixely jako ze skriptu`);
  }
  // iOS: bez průhlednosti (průhledné místo by na ploše bylo černé), 180 × 180
  const apple = readPng(readFileSync(path.join(PUB, 'icons', 'apple-touch-icon.png')), 'apple-touch-icon.png');
  assert.equal(apple.width, 180);
  assert.equal(apple.color, 2, 'RGB bez průhlednosti');
});

test('index.html: manifest, barva lišty pro tmavý i světlý motiv, ikona pro iOS a pwa.js', () => {
  assert.match(INDEX, /<link rel="manifest" href="manifest\.webmanifest">/);
  const metas = [...INDEX.matchAll(/<meta name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: (dark|light)\)">/g)];
  assert.deepEqual(metas.map((x) => [x[2], x[1]]), [['dark', themeBg('dark')], ['light', themeBg('light')]]);
  assert.match(INDEX, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(INDEX, /<meta name="apple-mobile-web-app-title" content="ATLAS">/);
  assert.match(INDEX, /<meta name="mobile-web-app-capable" content="yes">/);
  assert.match(INDEX, /<script src="js\/pwa\.js" defer><\/script>/, 'pwa.js odloženě – oprava hlášek fetch je hotová před startem aplikace');
  // barvy, které pwa.js nastaví podle přepínače motivu, = --bg z atlas.css
  const W = loadPwa();
  assert.deepEqual({ ...W.Pwa.THEME }, { dark: themeBg('dark'), light: themeBg('light') });
});

test('server: /sw.js bez mezipaměti s verzí a 304, HEAD; kód aplikace (HTML, JS, CSS) vždy ověřit, obrázky a data s mezipamětí', async () => {
  const r = await fetch(`${base}/sw.js`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(r.headers.get('cache-control'), 'no-cache', 'nová verze service workeru hned po nasazení');
  const build = r.headers.get('x-atlas-build');
  assert.match(build, /^[0-9a-f]{12}$/);
  assert.equal(r.headers.get('etag'), `"sw-${build}"`);
  const body = await r.text();
  assert.ok(body.includes(`const BUILD = '${build}';`));
  assert.doesNotThrow(() => new vm.Script(body, { filename: 'sw.js' }), 'platný JavaScript');
  const again = await fetch(`${base}/sw.js`, { headers: { 'if-none-match': r.headers.get('etag') } });
  assert.equal(again.status, 304);
  const head = await fetch(`${base}/sw.js`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('x-atlas-build'), build, 'pwa.js zjišťuje verzi na serveru přes HEAD');
  assert.equal(await head.text(), '');

  for (const p of ['/', '/index.html', '/neexistujici-stranka']) {
    const h = await fetch(`${base}${p}`);
    assert.equal(h.status, 200, p);
    assert.match(h.headers.get('content-type'), /^text\/html/, p);
    assert.equal(h.headers.get('cache-control'), 'no-cache', `${p}: HTML se vždy ověří u serveru`);
    // verze aplikace přímo ve stránce (i v uložené kopii) – pwa.js podle ní pozná novou verzi i v aplikaci na ploše
    const html = await h.text();
    assert.ok(html.includes(`<meta name="atlas-build" content="${build}">`), `${p}: stránka nese verzi ${build}`);
    assert.ok(!html.includes('content="dev"'), p);
    const same = await fetch(`${base}${p}`, { headers: { 'if-none-match': h.headers.get('etag') } });
    assert.equal(same.status, 304, `${p}: nezměněná stránka = 304`);
  }
  const headPage = await fetch(`${base}/`, { method: 'HEAD' });
  assert.equal(headPage.status, 200);
  assert.equal(await headPage.text(), '');
  // Kód aplikace vždy ověřit: s max-age by ho otevřený panel po obnovení vzal z paměti bez ptaní (ani service worker
  // by se o požadavku nedozvěděl) a po nasazení by běžel starý kód. Obrázky, písma a data mapy mezipaměť mají dál.
  const cc = async (p) => (await fetch(`${base}${p}`)).headers.get('cache-control');
  for (const p of ['/js/app.js', '/js/pwa.js', '/css/atlas.css', '/css/pwa.css', '/vendor/d3.min.js', '/vendor/maplibre/maplibre-gl.css', '/manifest.webmanifest']) {
    assert.equal(await cc(p), 'no-cache', p);
  }
  assert.equal(await cc('/vendor/countries-110m.json'), 'public, max-age=2592000');
  assert.equal(await cc('/vendor/flags/TwemojiCountryFlags.woff2'), 'public, max-age=2592000');
  assert.equal(await cc('/icons/icon-192.png'), 'public, max-age=60');
  assert.equal(await cc('/data/entry.json'), 'public, max-age=3600');
  // ověření je levné: nezměněný soubor = 304 bez těla
  const app = await fetch(`${base}/js/app.js`);
  const re = await fetch(`${base}/js/app.js`, { headers: { 'if-modified-since': app.headers.get('last-modified') } });
  assert.equal(re.status, 304);
});

test('seznam pro offline: stránka, vše z index.html a data – každý soubor na serveru existuje, žádné API ani cizí weby', async () => {
  const body = await (await fetch(`${base}/sw.js`)).text();
  const list = JSON.parse(body.match(/^const PRECACHE = (\[.*\]);/m)[1]);
  assert.equal(list[0], './');
  const local = [...INDEX.matchAll(/<script src="([^"]+)"/g), ...INDEX.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((x) => x[1]).filter((u) => !/^https?:/.test(u));
  assert.ok(local.length >= 18);
  // + ikony z manifestu (Chrome je čte i offline) a data, která aplikace stahuje za běhu
  const icons = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon-96.png'];
  for (const u of [...local, 'manifest.webmanifest', 'icons/apple-touch-icon.png', ...icons, ...RUNTIME_ASSETS]) assert.ok(list.includes(u), `v seznamu chybí ${u}`);
  assert.ok(list.every((u) => !/^(?:https?:|\/\/|api\/|data:)/.test(u)), 'jen vlastní soubory, nikdy API');
  assert.equal(new Set(list).size, list.length);
  const type = { css: /text\/css/, js: /javascript/, json: /application\/json/, png: /image\/png/, webmanifest: /manifest\+json/ };
  for (const u of list.slice(1)) {
    const res = await fetch(`${base}/${u}`);
    assert.equal(res.status, 200, u);
    assert.match(res.headers.get('content-type'), type[u.split('.').pop()], `${u}: skutečný soubor, ne náhradní index.html`);
  }
});

test('server/lib/pwa.js: seznam z index.html, verze podle obsahu (ne času změny), přejmenovaný i smazaný soubor', () => {
  assert.deepEqual(shellAssets(`<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?x" rel="stylesheet">
    <link rel="icon" href="data:image/svg+xml,x"><link rel="stylesheet" href="./css/a.css"><link rel='manifest' href='m.webmanifest'>
    <link rel="apple-touch-icon" href="/icons/t.png"><script src="js/a.js" defer></script><script>inline()</script><script src="//cdn.example/x.js"></script>
    <script src=js/b.js></script><script src="js/a.js"></script><a href="js/c.js">`),
  ['css/a.css', 'm.webmanifest', 'icons/t.png', 'js/a.js', 'js/b.js']);

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'atlas-pwa-'));
  try {
    const pub = path.join(tmp, 'public'), data = path.join(tmp, 'data');
    mkdirSync(path.join(pub, 'js'), { recursive: true });
    mkdirSync(data);
    copyFileSync(path.join(PUB, 'sw.js'), path.join(pub, 'sw.js'));
    writeFileSync(path.join(pub, 'index.html'), '<link rel="stylesheet" href="css/chybi.css"><script src="js/a.js"></script><link rel="manifest" href="app.webmanifest">');
    writeFileSync(path.join(pub, 'js/a.js'), 'console.log(1)');
    mkdirSync(path.join(pub, 'i'));
    writeFileSync(path.join(pub, 'i/a.png'), 'png');
    writeFileSync(path.join(pub, 'app.webmanifest'), JSON.stringify({ icons: [{ src: 'i/a.png' }, { src: 'https://cdn.example/x.png' }, { src: 'i/chybi.png' }], shortcuts: [{ icons: [{ src: '/i/a.png' }] }] }));
    writeFileSync(path.join(data, 'countries.json'), '[]');
    const dirs = { publicDir: pub, dataDir: data };
    const v1 = serviceWorker(dirs);
    assert.deepEqual(v1.precache, ['./', 'js/a.js', 'app.webmanifest', 'i/a.png', 'data/countries.json'],
      'ikony z manifestu ano (cizí a chybějící ne); chybějící soubory (css, entry.json, mapa) se neukládají – instalace nespadne na 404');
    assert.ok(v1.body.toString().includes(`const BUILD = '${v1.build}';`));
    // stejný obsah, jiný čas změny (nové nasazení) → stejná verze
    utimesSync(path.join(pub, 'js/a.js'), new Date(), new Date(Date.now() + 5000));
    assert.equal(serviceWorker(dirs).build, v1.build);
    // změna obsahu → nová verze
    writeFileSync(path.join(pub, 'js/a.js'), 'console.log(2)');
    const v2 = serviceWorker(dirs);
    assert.notEqual(v2.build, v1.build);
    assert.ok(!v2.body.equals(v1.body), 'jiný sw.js → prohlížeč nainstaluje nový service worker');
    // přejmenovaný skript: seznam se řídí index.html
    renameSync(path.join(pub, 'js/a.js'), path.join(pub, 'js/app-2.js'));
    writeFileSync(path.join(pub, 'index.html'), '<script src="js/app-2.js"></script>');
    assert.deepEqual(serviceWorker(dirs).precache, ['./', 'js/app-2.js', 'data/countries.json']);
    assert.deepEqual(manifestIcons('{"icons":[{"src":"../x.png"},{"src":"a.png"}]}', 'm/app.webmanifest'), ['x.png', 'm/a.png'], 'vůči adrese manifestu');
    assert.deepEqual(manifestIcons('nesmysl'), []);
    // data mimo public/ jsou ve verzi taky
    const v3 = serviceWorker(dirs).build;
    writeFileSync(path.join(data, 'countries.json'), '[{}]');
    assert.notEqual(serviceWorker(dirs).build, v3);
    // data/… jako server: countries.json ze složky data/ (i když je kopie v public/data/), pretrip.json z public/data/
    mkdirSync(path.join(pub, 'data'));
    writeFileSync(path.join(pub, 'data/pretrip.json'), '{}');
    writeFileSync(path.join(pub, 'data/countries.json'), 'stara kopie');
    const v4 = serviceWorker(dirs);
    assert.deepEqual(v4.precache, ['./', 'js/app-2.js', 'data/countries.json', 'data/pretrip.json']);
    writeFileSync(path.join(data, 'countries.json'), '[{},{}]');
    assert.notEqual(serviceWorker(dirs).build, v4.build, 'verze se řídí tím, co server opravdu posílá');
    // sw.js bez řádků pro dosazení = chyba (test na serveru by ji odhalil dřív než prohlížeč)
    writeFileSync(path.join(pub, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    assert.throws(() => serviceWorker(dirs), /const BUILD/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/* ---------- service worker ve falešném prostředí (node:vm) ---------- */
const SCOPE = 'https://atlas.test/';
class BasicResponse extends Response {
  get type() { return 'basic'; } // odpověď ze stejného původu jako v prohlížeči
}
function loadSw(src = read('public/sw.js')) {
  const handlers = {}, calls = { skip: 0, claim: 0 }, store = new Map();
  const net = { offline: false, delay: 0, files: {}, log: [] };
  const keyOf = (r) => (typeof r === 'string' ? new URL(r, SCOPE).href : r.url).split('#')[0];
  const caches = {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return {
        put: async (r, res) => { m.set(keyOf(r), await res.text()); },
        match: async (r) => (m.has(keyOf(r)) ? new BasicResponse(m.get(keyOf(r)), { status: 200 }) : undefined),
      };
    },
    keys: async () => [...store.keys()],
    delete: async (n) => store.delete(n),
  };
  class Request {
    constructor(input, init = {}) {
      const src = typeof input === 'string' ? { url: new URL(input, SCOPE).href, method: 'GET', mode: 'cors' } : input;
      Object.assign(this, { url: src.url, method: init.method || src.method || 'GET', mode: init.mode || src.mode, cache: init.cache || src.cache || 'default', redirect: init.redirect || src.redirect || 'follow' });
    }
  }
  const ctx = {
    caches, Request, Response, Headers, URL, console, setTimeout, clearTimeout,
    async fetch(req) {
      net.log.push(req);
      if (net.delay) await new Promise((r) => setTimeout(r, net.delay));
      if (net.offline) throw new TypeError('Failed to fetch');
      const f = net.files[req.url];
      return f ? new BasicResponse(f.body, { status: f.status || 200, headers: { 'content-type': f.type || 'text/javascript' } }) : new BasicResponse('', { status: 404 });
    },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    registration: { scope: SCOPE },
    skipWaiting: async () => { calls.skip++; },
    clients: { claim: async () => { calls.claim++; } },
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'sw.js' });
  const event = (type, extra = {}) => {
    const ev = { ...extra, waits: [], responded: null, waitUntil(p) { this.waits.push(p); }, respondWith(p) { this.responded = Promise.resolve(p); } };
    handlers[type](ev);
    return ev;
  };
  return { ctx, handlers, calls, store, net, event, CACHE: vm.runInContext('CACHE', ctx) };
}
const req = (url, { method = 'GET', mode = 'no-cors', headers = new Headers() } = {}) => ({ url: new URL(url, SCOPE).href, method, mode, headers, cache: 'default' });

test('service worker – směrování (čistá funkce): API, POST, cizí weby a sw.js nechá být; stránka a soubory aplikace síť → offline kopie', () => {
  const { ctx } = loadSw();
  const route = (url, opts, scope = SCOPE) => ctx.route(req(url, opts), scope);
  for (const u of ['/api/search', '/api/places?q=brno', '/api/health', '/api/climate?cc=TH', '/api', '/healthz', '/sw.js']) {
    assert.equal(route(u), null, `${u}: do API se service worker neplete (nikdy ho neuloží)`);
    assert.equal(route(u, { mode: 'navigate' }), null, `${u}: ani při otevření v panelu`);
  }
  assert.equal(route('/api/search', { method: 'POST', mode: 'cors' }), null);
  assert.equal(route('/api/itinerary', { method: 'POST', mode: 'cors' }), null);
  assert.equal(route('/', { method: 'POST', mode: 'navigate' }), null, 'jen GET');
  assert.equal(route('/js/app.js', { method: 'HEAD' }), null);
  for (const u of ['https://tiles.openfreemap.org/planet/1/2/3.pbf', 'https://fonts.googleapis.com/css2?family=Inter', 'https://fonts.gstatic.com/s/inter.woff2',
    'https://api.open-meteo.com/v1/forecast?x=1', 'https://www.booking.com/x', 'http://atlas.test/js/app.js', 'https://atlas.test:8443/js/app.js']) {
    assert.equal(route(u), null, `${u}: cizí web beze změny`);
  }
  assert.equal(route('/vendor/maplibre/maplibre-gl.js', { headers: new Headers({ range: 'bytes=0-99' }) }), null, 'Range se neukládá');
  for (const u of ['/', '/?zdroj=plocha', '/index.html', '/neznama-adresa']) assert.equal(route(u, { mode: 'navigate' }), 'page', u);
  for (const u of ['/js/app.js', '/js/pwa.js', '/css/atlas.css', '/vendor/d3.min.js', '/data/countries.json', '/data/entry.json', '/manifest.webmanifest', '/icons/icon-192.png', '/apis.js', '/js/api/x.js']) {
    assert.equal(route(u), 'asset', u);
  }
  assert.equal(route('/data/countries.json', { mode: 'cors' }), 'asset', 'fetch() aplikace');
  // aplikace pod podadresou: API i rozsah se počítají od ní
  const sub = 'https://atlas.test/atlas/';
  assert.equal(route('/atlas/api/search', {}, sub), null);
  assert.equal(route('/atlas/js/app.js', {}, sub), 'asset');
  assert.equal(route('/jina/js/app.js', {}, sub), null, 'mimo rozsah');
  assert.equal(ctx.route({ method: 'GET', url: 'nesmysl' }, SCOPE), null);
});

test('service worker: pomalá síť nebo uspaný server → uložená stránka a k ní soubory z uložené sady; jiné stránky dál ze sítě', async () => {
  const src = read('public/sw.js').replace(/^const BUILD = .*$/m, "const BUILD = 'v1';")
    .replace(/^const PRECACHE = .*$/m, `const PRECACHE = ${JSON.stringify(['./', 'js/app.js'])};`)
    .replace(/^const PAGE_TIMEOUT = .*$/m, 'const PAGE_TIMEOUT = 30;');
  const sw = loadSw(src);
  const { net, event, handlers } = sw;
  const file = (p, body, type = 'text/javascript') => { net.files[SCOPE + p] = { body, type }; };
  const text = async (ev) => (await ev.responded).text();
  const ask = (id) => new Promise((resolve) => handlers.message({ data: 'atlas-served', ports: [{ postMessage: resolve }], source: { id } }));
  file('', '<html>v1</html>', 'text/html; charset=utf-8');
  file('js/app.js', 'app v1');
  await Promise.all(event('install').waits);

  // na serveru je nová verze, ale odpovídá pomalu (probouzí se)
  file('', '<html>v2</html>', 'text/html; charset=utf-8');
  file('js/app.js', 'app v2');
  net.delay = 150;
  assert.equal(await text(event('fetch', { request: req('/', { mode: 'navigate' }), resultingClientId: 'c1' })), '<html>v1</html>', 'po PAGE_TIMEOUT uložená stránka');
  assert.equal(await text(event('fetch', { request: req('/js/app.js'), clientId: 'c1' })), 'app v1', 'její soubory z uložené sady – stejná verze, žádná směs');
  assert.equal(await ask('c1'), 'cache', 'pwa.js se dozví, že stránka je z uložené kopie (verzi ověří, až server odpoví)');
  assert.equal(await text(event('fetch', { request: req('/js/app.js'), clientId: 'c2' })), 'app v2', 'stránka ze sítě: soubory dál ze sítě');
  assert.equal(await ask('c2'), 'network');
  assert.equal(await text(event('fetch', { request: req('/js/novy.js'), clientId: 'c1' })), '', 'co v uložené sadě není, jde ze sítě (tady 404)');

  // server vrací chybu (5xx při probouzení): uložená stránka místo chybové
  net.delay = 0;
  net.files[SCOPE] = { body: 'Service Unavailable', type: 'text/html', status: 503 };
  assert.equal(await text(event('fetch', { request: req('/', { mode: 'navigate' }), resultingClientId: 'c4' })), '<html>v1</html>');
  assert.equal(await ask('c4'), 'cache');
  file('', '<html>v2</html>', 'text/html; charset=utf-8');

  // rychlá síť: jako dřív vždy ze sítě
  assert.equal(await text(event('fetch', { request: req('/', { mode: 'navigate' }), resultingClientId: 'c3' })), '<html>v2</html>');
  assert.equal(await ask('c3'), 'network');

  // první návštěva (nic uloženého) a pomalá síť: počká na síť
  const fresh = loadSw(src);
  fresh.net.files = net.files;
  fresh.net.delay = 80;
  assert.equal(await text(fresh.event('fetch', { request: req('/', { mode: 'navigate' }), resultingClientId: 'x' })), '<html>v2</html>');
});

test('service worker v akci: instalace ze sítě s ověřením, aktivace smaže staré verze, síť má vždy přednost, offline kopie, API nikdy', async () => {
  const precache = ['./', 'js/app.js', 'css/atlas.css', 'data/countries.json', 'js/smazany.js'];
  const sw = loadSw(read('public/sw.js').replace(/^const BUILD = .*$/m, "const BUILD = 'v2';").replace(/^const PRECACHE = .*$/m, `const PRECACHE = ${JSON.stringify(precache)};`));
  const { net, store, calls, event } = sw;
  assert.equal(sw.CACHE, 'atlas-v2');
  const file = (p, body, type = 'text/javascript', status = 200) => { net.files[SCOPE + p] = { body, type, status }; };
  file('', '<html>v2</html>', 'text/html; charset=utf-8');
  file('js/app.js', 'app v2');
  file('css/atlas.css', 'css v2', 'text/css');
  file('data/countries.json', '[2]', 'application/json');
  // js/smazany.js na serveru není (404) → přeskočit, instalace nespadne

  // instalace
  store.set('atlas-v1', new Map([[SCOPE + 'js/app.js', 'app v1']]));
  store.set('cizi-mezipamet', new Map([['x', 'y']]));
  const inst = event('install');
  await Promise.all(inst.waits);
  const v2 = store.get('atlas-v2');
  assert.deepEqual([...v2.keys()].sort(), [SCOPE, `${SCOPE}css/atlas.css`, `${SCOPE}data/countries.json`, `${SCOPE}js/app.js`]);
  assert.equal(v2.get(`${SCOPE}js/app.js`), 'app v2');
  assert.ok(net.log.every((r) => r.cache === 'no-cache'), 'instalace bere soubory ze sítě s ověřením, ne z mezipaměti prohlížeče');
  assert.equal(calls.skip, 1);
  // aktivace: staré verze ATLASu pryč, cizí mezipaměť zůstane, převzetí otevřených stránek
  const act = event('activate');
  await Promise.all(act.waits);
  assert.deepEqual([...store.keys()].sort(), ['atlas-v2', 'cizi-mezipamet']);
  assert.equal(calls.claim, 1);

  const run = async (r) => {
    const ev = event('fetch', { request: r });
    const res = ev.responded && (await ev.responded);
    await Promise.all(ev.waits);
    return { ev, res, text: res ? await res.text() : null };
  };
  // API: service worker se nepřihlásí (respondWith ne) – nic se neuloží, offline selže v aplikaci
  for (const r of [req('/api/search', { method: 'POST', mode: 'cors' }), req('/api/places?q=x', { mode: 'cors' }), req('https://tiles.openfreemap.org/1/2/3.pbf', { mode: 'cors' })]) {
    const { ev } = await run(r);
    assert.equal(ev.responded, null, r.url);
  }
  assert.ok([...store.get('atlas-v2').keys()].every((k) => !k.includes('/api/')));

  // online: vždy síť (i když je kopie uložená), s ověřením u serveru; nová verze souboru přepíše uloženou
  net.log.length = 0;
  file('js/app.js', 'app v3');
  let x = await run(req('/js/app.js'));
  assert.equal(x.text, 'app v3', 'síť má přednost před uloženou kopií');
  assert.equal(net.log[0].cache, 'no-cache');
  assert.equal(store.get('atlas-v2').get(`${SCOPE}js/app.js`), 'app v3', 'uložená kopie aktualizovaná');
  // navigace: nový požadavek s ověřením; HTML se ukládá jen jednou, pod adresou aplikace
  file('?zdroj=plocha', '<html>v3</html>', 'text/html; charset=utf-8');
  x = await run(req('/?zdroj=plocha', { mode: 'navigate' }));
  assert.equal(x.text, '<html>v3</html>');
  assert.deepEqual([net.log.at(-1).cache, net.log.at(-1).redirect], ['no-cache', 'manual']);
  assert.equal(store.get('atlas-v2').get(SCOPE), '<html>v3</html>');
  assert.ok(!store.get('atlas-v2').has(`${SCOPE}?zdroj=plocha`));
  // chybová odpověď se neukládá a uložená kopie zůstane
  file('css/atlas.css', 'chyba', 'text/plain', 500);
  x = await run(req('/css/atlas.css'));
  assert.equal(x.res.status, 500, 'online se chyba serveru ukáže, kopie z mezipaměti ne');
  assert.equal(store.get('atlas-v2').get(`${SCOPE}css/atlas.css`), 'css v2');
  // za chybějící soubor pošle server stránku aplikace (SPA) – ta se pod adresu souboru neukládá
  file('apple-touch-icon-precomposed.png', '<html>v3</html>', 'text/html; charset=utf-8');
  x = await run(req('/apple-touch-icon-precomposed.png'));
  assert.equal(x.res.status, 200);
  assert.ok(!store.get('atlas-v2').has(`${SCOPE}apple-touch-icon-precomposed.png`));

  // offline: uložené kopie, stránka pod libovolnou adresou = poslední uložená stránka aplikace
  net.offline = true;
  assert.equal((await run(req('/js/app.js'))).text, 'app v3');
  assert.equal((await run(req('/data/countries.json', { mode: 'cors' }))).text, '[2]');
  assert.equal((await run(req('/#planner', { mode: 'navigate' }))).text, '<html>v3</html>');
  assert.equal((await run(req('/?zdroj=plocha', { mode: 'navigate' }))).text, '<html>v3</html>');
  await assert.rejects(run(req('/vendor/maplibre/maplibre-gl.js')), /Failed to fetch/, 'neuložený soubor offline selže jako bez service workeru');
  const api = await run(req('/api/search', { method: 'POST', mode: 'cors' }));
  assert.equal(api.ev.responded, null, 'API offline: prohlížeč request odmítne a aplikace ukáže svou hlášku');

  // stránka otevřená offline se ptá na verzi uložené kopie
  let answer = null;
  sw.handlers.message({ data: 'atlas-build', ports: [{ postMessage: (m) => { answer = m; } }] });
  assert.equal(answer, 'v2');
});

/* ---------- pwa.js ---------- */
function loadPwa() {
  const ctx = { window: {}, URL, console };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/pwa.js'), ctx, { filename: 'pwa.js' });
  return ctx.window;
}

test('pwa.js: místo „Failed to fetch“ česká hláška u API (offline / server nedostupný), ostatní chyby beze změny; kdy nabídnout instalaci', () => {
  const { Pwa } = loadPwa();
  const B = 'https://atlas.test/#planner';
  const fail = new TypeError('Failed to fetch');
  const off = Pwa.netError(fail, 'api/search', { online: false, base: B });
  assert.equal(off.message, Pwa.OFFLINE_MSG);
  assert.match(off.message, /^Jsi offline/);
  assert.equal(off.name, 'NetworkError');
  assert.equal(off.cause, fail);
  assert.equal(Pwa.netError(fail, 'api/places?q=x', { online: true, base: B }).message, Pwa.DOWN_MSG);
  assert.equal(Pwa.netError(fail, { url: 'https://atlas.test/api/stays?x=1' }, { online: false, base: B }).message, Pwa.OFFLINE_MSG, 'i Request');
  assert.equal(Pwa.netError(fail, new URL('https://atlas.test/api/health'), { online: false, base: B }).message, Pwa.OFFLINE_MSG);
  const abort = Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
  assert.equal(Pwa.netError(abort, 'api/search', { online: false, base: B }), abort, 'zrušené hledání zůstane AbortError');
  for (const u of ['https://api.open-meteo.com/v1/forecast', 'data/countries.json', 'vendor/countries-110m.json', 'https://jiny.web/api/x']) {
    assert.equal(Pwa.netError(fail, u, { online: false, base: B }), fail, `${u}: jen API ATLASu`);
  }
  const http = new Error('HTTP 500');
  assert.equal(Pwa.netError(http, 'api/search', { online: false, base: B }), http, 'odpověď serveru (i chybová) beze změny');

  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const mode = (o) => Pwa.installMode({ standalone: false, prompt: false, ua: '', platform: '', touch: 0, ...o });
  assert.equal(mode({ prompt: true }), 'prompt', 'Chrome / Edge / Android: dialog prohlížeče');
  assert.equal(mode({ prompt: true, standalone: true }), null, 'z plochy se nenabízí');
  assert.equal(mode({ ua: iphone }), 'ios');
  assert.equal(mode({ ua: iphone, standalone: true }), null);
  assert.equal(mode({ ua: mac, platform: 'MacIntel', touch: 5 }), 'ios', 'iPad se hlásí jako Mac s dotykem');
  assert.equal(mode({ ua: mac, platform: 'MacIntel', touch: 0 }), null, 'Safari na Macu: nic');
  assert.equal(mode({ ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0' }), null, 'Firefox na počítači: nic');
  assert.equal(mode({ ua: `${iphone} Instagram 300.0` }), null, 'vestavěný prohlížeč aplikace na plochu neumí');
});
