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
const { serviceWorker, serveIndex, shellAssets, manifestIcons, RUNTIME_ASSETS, versionAssets, contentVersion } = await import('../server/lib/pwa.js');
const { inlineScriptHashes } = await import('../server/lib/security.js');
const { ICONS, renderIcon, crc32, ANCHOR, BG, splashImages, splashLinks, solidPng } = await import('../scripts/build-icons.mjs');
const { BRAND } = await import('../server/brand.js');

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
  // Chrome na Androidu píše name dole na úvodní obrazovku aplikace – krátce, popis je v description; obojí dosadí
  // server z server/brand.js (test/seo.test.js)
  assert.equal(m.short_name, BRAND.name);
  assert.equal(m.name, BRAND.name);
  assert.ok(BRAND.name.length <= 12, 'pod ikonou na ploše se vejde celý');
  assert.ok(m.description.length > 40);
  assert.deepEqual([m.id, m.start_url, m.scope, m.display, m.lang], ['/', '/', '/', 'standalone', 'cs']);
  assert.equal(m.theme_color, themeBg('dark'), 'výchozí motiv ATLASu je tmavý');
  assert.equal(m.background_color, themeBg('dark'));
  const any = m.icons.filter((i) => (i.purpose || 'any').split(' ').includes('any')).map((i) => i.sizes);
  assert.ok(any.includes('192x192') && any.includes('512x512'), 'instalovatelnost: ikony 192 a 512');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'), 'Android: maskovatelná ikona');
  const all = [...m.icons, ...(m.shortcuts || []).flatMap((s) => s.icons || [])];
  for (const s of m.shortcuts || []) assert.match(s.url, /^\/#(flights|trip|planner|explore|dashboard|now)$/, 'zkratka vede na sekci aplikace (now = karta „Dnes na cestě“ na Přehledu)');
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

test('iOS: úvodní obrazovky aplikace na ploše – jednobarevné v barvě #launch, rozlišení podle media, odkazy ze skriptu', async () => {
  const imgs = splashImages();
  assert.equal(imgs.length, 31, '13 iPhonů na výšku + 9 iPadů na výšku i na šířku');
  assert.equal(new Set(imgs.map((s) => s.file)).size, imgs.length);
  assert.ok(INDEX.includes(splashLinks() + '\n'), 'odkazy v index.html = scripts/build-icons.mjs (npm run build:icons)');
  assert.equal((INDEX.match(/rel="apple-touch-startup-image"/g) || []).length, imgs.length);
  // barva = pozadí úvodní obrazovky aplikace (#launch) = background_color v manifestu
  const hex = '#' + BG.map((v) => v.toString(16).padStart(2, '0')).join('');
  assert.equal(INDEX.match(/#launch\{position:fixed;[^}]*background:(#[0-9a-f]{6})/)[1], hex);
  assert.equal(JSON.parse(read('public/manifest.webmanifest')).background_color, hex);
  for (const s of imgs) {
    // media: CSS rozměry displeje na výšku × poměr pixelů = rozměry obrázku v dané orientaci
    const [, w, h, r, o] = s.media.match(/^\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: ([23])\) and \(orientation: (portrait|landscape)\)$/).map((x, i) => (i && i < 4 ? +x : x));
    assert.deepEqual([s.width, s.height], o === 'portrait' ? [w * r, h * r] : [h * r, w * r], s.media);
    assert.ok(w < h, `${s.media}: device-width je kratší strana`);
    const buf = readFileSync(path.join(PUB, 'icons', s.file));
    assert.ok(buf.equals(solidPng(s.width, s.height, BG)), `${s.file}: jako ze skriptu`);
    // PNG: podpis, CRC, 1bitová paleta s jedinou barvou a samé nuly (= ta barva) v každém řádku
    assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = {};
    for (let off = 8; off < buf.length;) {
      const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
      assert.equal(buf.readUInt32BE(off + 8 + len), crc32(buf.subarray(off + 4, off + 8 + len)), `${s.file}: CRC ${type}`);
      chunks[type] = buf.subarray(off + 8, off + 8 + len);
      off += 12 + len;
    }
    assert.deepEqual([chunks.IHDR.readUInt32BE(0), chunks.IHDR.readUInt32BE(4), chunks.IHDR[8], chunks.IHDR[9], chunks.IHDR[12]], [s.width, s.height, 1, 3, 0]);
    assert.deepEqual([...chunks.PLTE], BG);
    const raw = zlib.inflateSync(chunks.IDAT);
    assert.equal(raw.length, (1 + Math.ceil(s.width / 8)) * s.height);
    assert.ok(raw.every((v) => v === 0));
    assert.ok(buf.length < 1024, `${s.file}: ${buf.length} B`);
  }
  // server je pošle jako obrázek; service worker si je nestahuje dopředu (iOS je načte jednou při přidání na plochu)
  const r = await fetch(`${base}/icons/splash/1170x2532.png`);
  assert.deepEqual([r.status, r.headers.get('content-type')], [200, 'image/png']);
  assert.ok(!serviceWorker({ publicDir: PUB, dataDir: path.join(ROOT, 'data') }).precache.some((u) => /splash/.test(u)));
});

test('boční panel: ikona ATLASu je stejná vlaštovka jako ikona aplikace a favicon', () => {
  const logo = INDEX.match(/<div class="brand-logo">([\s\S]*?)<\/div>/)[1];
  // trojúhelníky horního a spodního (80 %) křídla = favicon „M20 6l-7 13-3-6-6-3z“ rozdělený přehybem
  assert.match(logo, /<path d="M20 6 10 13 4 10z" fill="#fff"\/><path d="M20 6 13 19 10 13z" fill="#fff" fill-opacity="\.8"\/>/);
  assert.match(INDEX, /<link rel="icon" href="data:image\/svg\+xml,[^"]*M20 6l-7 13-3-6-6-3z/);
  // velikost a kotva jako ikona „any“ (build-icons.mjs) – v celém čtverci loga
  const [x, y, w, h] = logo.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const plane = ICONS.find((i) => i.file === 'icon-192.png').plane;
  assert.equal(w, h);
  assert.ok(Math.abs(w - 24 / plane) < 0.001 && Math.abs(x + w / 2 - ANCHOR[0]) < 0.001 && Math.abs(y + h / 2 - ANCHOR[1]) < 0.001, `${x} ${y} ${w}`);
  assert.match(CSS, /\.brand-logo svg\{width:100%;height:100%\}/);
});

test('index.html: manifest, barva lišty pro tmavý i světlý motiv, ikona pro iOS a pwa.js', () => {
  assert.match(INDEX, /<link rel="manifest" href="manifest\.webmanifest">/);
  const metas = [...INDEX.matchAll(/<meta name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: (dark|light)\)">/g)];
  assert.deepEqual(metas.map((x) => [x[2], x[1]]), [['dark', themeBg('dark')], ['light', themeBg('light')]]);
  assert.match(INDEX, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  // název pod ikonou na iPhonu (apple-mobile-web-app-title) dosadí server z server/brand.js – test/seo.test.js
  assert.match(INDEX, /<!-- brand\b[\s\S]*?<!-- \/brand -->/);
  assert.doesNotMatch(INDEX, /apple-mobile-web-app-title/, 'název jen v brand.js');
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

  // neznámá adresa (/neexistujici-stranka) už stránku aplikace nedostane – 404, test/seo.test.js
  for (const p of ['/', '/index.html', '/?zdroj=plocha']) {
    const h = await fetch(`${base}${p}`);
    // service worker se stejnou verzí vezme soubory stránky z uložené sady (sw.js fromCache)
    assert.equal(h.headers.get('x-atlas-build'), build, `${p}: verze stránky`);
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
  // skripty a styly pod adresou s otiskem obsahu – stejnou, jakou má stránka od serveru (jinak by je offline nenašla)
  for (const u of local) assert.ok(list.includes(`${u}?v=${contentVersion(readFileSync(path.join(PUB, u)))}`), `v seznamu chybí ${u}?v=…`);
  // + ikony z manifestu (Chrome je čte i offline) a data, která aplikace stahuje za běhu – adresy beze změny
  const icons = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon-96.png'];
  for (const u of ['manifest.webmanifest', 'icons/apple-touch-icon.png', ...icons, ...RUNTIME_ASSETS]) assert.ok(list.includes(u), `v seznamu chybí ${u}`);
  assert.ok(list.every((u) => !/^(?:https?:|\/\/|api\/|data:)/.test(u)), 'jen vlastní soubory, nikdy API');
  assert.ok(list.filter((u) => /\?/.test(u)).every((u) => /^[\w/.-]+\.(?:js|css)\?v=[0-9a-f]{10}$/.test(u)), 'otisk jen u skriptů a stylů');
  assert.equal(new Set(list).size, list.length);
  const page = await (await fetch(`${base}/`)).text();
  const type = { css: /text\/css/, js: /javascript/, json: /application\/json/, png: /image\/png/, webmanifest: /manifest\+json/ };
  for (const u of list.slice(1)) {
    const res = await fetch(`${base}/${u}`);
    assert.equal(res.status, 200, u);
    assert.match(res.headers.get('content-type'), type[u.split('?')[0].split('.').pop()], `${u}: skutečný soubor, ne náhradní index.html`);
    if (u.includes('?v=')) {
      assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable', `${u}: otisk sedí s obsahem`);
      assert.ok(page.includes(u), `${u}: stejná adresa jako ve stránce`);
    }
    await res.arrayBuffer();
  }
});

test('verze v adrese: stránka má skripty a styly s otiskem obsahu → Cloudflare i prohlížeč je drží napořád; jiný otisk a holá adresa jako dřív', async () => {
  const res = await fetch(`${base}/`);
  const page = await res.text();
  const urls = [...page.matchAll(/<script src="([^"]+)"/g), ...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((x) => x[1]).filter((u) => !/^https?:/.test(u));
  const later = page.match(/<script src="js\/lazy\.js\?v=\w+" data-later="([^"]+)" data-files="([^"]+)">/);
  assert.ok(later, 'lazy.js: seznamy s otiskem');
  const all = [...urls, ...later[1].split(' '), ...later[2].split(' ')];
  assert.ok(all.length >= 40, String(all.length));
  for (const u of all) {
    const [file, v] = u.split('?v=');
    assert.equal(v, contentVersion(readFileSync(path.join(PUB, file))), `${u}: otisk = obsah souboru`);
  }
  // vložené skripty (CSP s jejich otisky) se nemění: stránka = index.html jen s ?v= navíc
  assert.deepEqual(inlineScriptHashes(page), inlineScriptHashes(INDEX));
  for (const h of inlineScriptHashes(page)) assert.ok(res.headers.get('content-security-policy').includes(h), h);

  const get = (u, headers = {}) => fetch(`${base}/${u}`, { headers: { 'accept-encoding': 'br', ...headers } });
  const app = all.find((u) => u.startsWith('js/app.js?v='));
  const a = await get(app);
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(a.headers.get('x-atlas-hash'), app.split('?v=')[1], 'potvrzení obsahu pro service worker');
  assert.equal(a.headers.get('content-encoding'), 'br', 'komprese jako dřív');
  assert.equal(a.headers.get('vary'), 'Accept-Encoding');
  const body = Buffer.from(await a.arrayBuffer());
  assert.deepEqual(body, readFileSync(path.join(PUB, 'js/app.js')), 'fetch brotli rozbalí sám');
  // ověření (304) i s otiskem: obnovená doba v mezipaměti
  const same = await get(app, { 'if-none-match': a.headers.get('etag') });
  assert.equal(same.status, 304);
  assert.equal(same.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  // stará stránka (service worker, mezipaměť) chce soubor bez otisku nebo s jiným: dnešní obsah, ale no-cache –
  // do mezipaměti napořád se nesmí dostat jiný obsah, než jaký otisk slibuje
  for (const u of ['js/app.js', 'js/app.js?v=0123456789', 'js/app.js?v=', 'js/app.js?x=1', `js/app.js?v=${app.split('?v=')[1].toUpperCase()}`]) {
    const r = await get(u);
    assert.equal(r.status, 200, u);
    assert.equal(r.headers.get('cache-control'), 'no-cache', u);
    assert.equal(r.headers.get('x-atlas-hash'), null, u);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), readFileSync(path.join(PUB, 'js/app.js')), u);
  }
  // knihovny map (data-files) a styly stejně
  for (const u of [...later[2].split(' '), urls.find((x) => x.startsWith('css/atlas.css?v='))]) {
    const r = await get(u);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable', u);
    await r.arrayBuffer();
  }
  // otisk u obrázku nebo neexistujícího souboru nic nemění
  assert.equal((await get('icons/icon-192.png?v=0123456789')).headers.get('cache-control'), 'public, max-age=60');
  assert.equal((await get('js/neexistuje.js?v=0123456789')).status, 404);
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
    const a1 = `js/a.js?v=${contentVersion('console.log(1)')}`;
    assert.deepEqual(v1.precache, ['./', a1, 'app.webmanifest', 'i/a.png', 'data/countries.json'],
      'skript s otiskem obsahu; ikony z manifestu ano (cizí a chybějící ne); chybějící soubory (css, entry.json, mapa) se neukládají – instalace nespadne na 404');
    assert.equal(v1.html, `<link rel="stylesheet" href="css/chybi.css"><script src="${a1}"></script><link rel="manifest" href="app.webmanifest">`,
      'stránka se stejnými adresami jako seznam; chybějící soubor a manifest beze změny');
    assert.ok(v1.body.toString().includes(`const BUILD = '${v1.build}';`));
    // stejný obsah, jiný čas změny (nové nasazení) → stejná verze i adresa
    utimesSync(path.join(pub, 'js/a.js'), new Date(), new Date(Date.now() + 5000));
    assert.equal(serviceWorker(dirs).build, v1.build);
    assert.equal(serviceWorker(dirs).precache[1], a1);
    // změna obsahu → nová verze a nová adresa souboru (stará kopie z mezipaměti se pod ni nedostane)
    writeFileSync(path.join(pub, 'js/a.js'), 'console.log(2)');
    const v2 = serviceWorker(dirs);
    assert.notEqual(v2.build, v1.build);
    assert.ok(!v2.body.equals(v1.body), 'jiný sw.js → prohlížeč nainstaluje nový service worker');
    assert.equal(v2.precache[1], `js/a.js?v=${contentVersion('console.log(2)')}`);
    assert.ok(v2.html.includes(`src="${v2.precache[1]}"`));
    // přejmenovaný skript: seznam se řídí index.html
    renameSync(path.join(pub, 'js/a.js'), path.join(pub, 'js/app-2.js'));
    writeFileSync(path.join(pub, 'index.html'), '<script src="js/app-2.js"></script>');
    assert.deepEqual(serviceWorker(dirs).precache, ['./', `js/app-2.js?v=${contentVersion('console.log(2)')}`, 'data/countries.json']);
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
    assert.deepEqual(v4.precache, ['./', `js/app-2.js?v=${contentVersion('console.log(2)')}`, 'data/countries.json', 'data/pretrip.json']);
    writeFileSync(path.join(data, 'countries.json'), '[{},{}]');
    assert.notEqual(serviceWorker(dirs).build, v4.build, 'verze se řídí tím, co server opravdu posílá');
    // sw.js bez řádků pro dosazení = chyba (test na serveru by ji odhalil dřív než prohlížeč)
    writeFileSync(path.join(pub, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    assert.throws(() => serviceWorker(dirs), /const BUILD/);
    // stránka se pak pošle bez verze i bez otisků v adresách – soubory server dá i tak (s no-cache), aplikace funguje
    const res = { writeHead(status, headers) { Object.assign(this, { status, headers }); }, end(b) { this.body = String(b); } };
    const err = console.error;
    console.error = () => {};
    try {
      serveIndex({ method: 'GET', headers: {} }, res, dirs);
    } finally {
      console.error = err;
    }
    assert.equal(res.status, 200);
    assert.equal(res.body, '<script src="js/app-2.js"></script>');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('versionAssets: otisk jen u místních skriptů a stylů (i v data-later / data-files), vše ostatní beze změny', () => {
  const v = (rel) => ({ 'js/a.js': '1111111111', 'js/b.js': '2222222222', 'css/a.css': '3333333333', 'vendor/m.js': '4444444444', 'vendor/m.css': '5555555555' })[rel] || null;
  const html = `<link rel="stylesheet" href="css/a.css" media="(min-width:1024px)"><link rel='stylesheet' href='./css/a.css'><link rel=stylesheet href=css/a.css>
<link rel="icon" href="js/a.js"><link rel="manifest" href="m.webmanifest"><link rel="preload" href="css/a.css" as="style"><link href="https://fonts.googleapis.com/css2?x" rel="stylesheet">
<script src="js/a.js" defer></script><script src="/js/b.js"></script><script src="js/chybi.js"></script><script src="js/a.js?x=1"></script><script src="//cdn.example/x.js"></script>
<script src="js/a.js" data-later="js/b.js  js/chybi.js https://cdn.example/y.js" data-files="vendor/m.js vendor/m.css"></script>
<script>var s = '<script src="js/a.js"><\\/script>'; // href="css/a.css"</script><a href="css/a.css">css/a.css</a><img src="js/a.js">
<!-- <script src="js/a.js"></script> -->`;
  const out = versionAssets(html, v);
  assert.equal(out, `<link rel="stylesheet" href="css/a.css?v=3333333333" media="(min-width:1024px)"><link rel='stylesheet' href='./css/a.css?v=3333333333'><link rel=stylesheet href=css/a.css?v=3333333333>
<link rel="icon" href="js/a.js"><link rel="manifest" href="m.webmanifest"><link rel="preload" href="css/a.css" as="style"><link href="https://fonts.googleapis.com/css2?x" rel="stylesheet">
<script src="js/a.js?v=1111111111" defer></script><script src="/js/b.js?v=2222222222"></script><script src="js/chybi.js"></script><script src="js/a.js?x=1"></script><script src="//cdn.example/x.js"></script>
<script src="js/a.js?v=1111111111" data-later="js/b.js?v=2222222222 js/chybi.js https://cdn.example/y.js" data-files="vendor/m.js?v=4444444444 vendor/m.css?v=5555555555"></script>
<script>var s = '<script src="js/a.js"><\\/script>'; // href="css/a.css"</script><a href="css/a.css">css/a.css</a><img src="js/a.js">
<!-- <script src="js/a.js"></script> -->`);
  // vložený skript beze změny → CSP stránky (otisky vložených skriptů) platí dál
  assert.deepEqual(inlineScriptHashes(out), inlineScriptHashes(html));
  // bez otisků (soubory nejsou) stránka beze změny
  assert.equal(versionAssets(INDEX, () => null), INDEX);
});

/* ---------- service worker ve falešném prostředí (node:vm) ---------- */
const SCOPE = 'https://atlas.test/';
class BasicResponse extends Response {
  get type() { return 'basic'; } // odpověď ze stejného původu jako v prohlížeči
}
function loadSw(src = read('public/sw.js')) {
  const handlers = {}, calls = { skip: 0, claim: 0 }, store = new Map(), puts = [];
  const net = { offline: false, delay: 0, files: {}, log: [], putFails: false };
  const keyOf = (r) => (typeof r === 'string' ? new URL(r, SCOPE).href : r.url).split('#')[0];
  const caches = {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return {
        put: async (r, res) => {
          if (net.putFails) throw new Error('QuotaExceededError');
          puts.push(keyOf(r));
          m.set(keyOf(r), await res.text());
        },
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
      return f ? new BasicResponse(f.body, { status: f.status || 200, headers: { 'content-type': f.type || 'text/javascript', ...f.headers } }) : new BasicResponse('', { status: 404 });
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
  return { ctx, handlers, calls, store, puts, net, event, CACHE: vm.runInContext('CACHE', ctx) };
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
  // krátký odkaz na cestu je stránka serveru (náhled a přesměrování na /#s=…), ne aplikace: pod adresu aplikace by se
  // uložil a offline by se otevíral místo ní (a přesměrovával dokola)
  for (const u of ['/c/Ab3kQ9xZ', '/c/Ab3kQ9xZ?fbclid=1']) assert.equal(route(u, { mode: 'navigate' }), null, u);
  assert.equal(route('/css/c/x.css'), 'asset', 'jen /c/ na začátku rozsahu');
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
  // místo souboru přijde stránka se stavem 200 (wifi s přihlášením) – pod adresu souboru se neukládá
  file('apple-touch-icon-precomposed.png', '<html>v3</html>', 'text/html; charset=utf-8');
  x = await run(req('/apple-touch-icon-precomposed.png'));
  assert.equal(x.res.status, 200);
  assert.ok(!store.get('atlas-v2').has(`${SCOPE}apple-touch-icon-precomposed.png`));
  // neznámá adresa: server pošle stránku 404 (seo.js) – online ji service worker ukáže beze změny a neuloží (uložená
  // stránka aplikace zůstane), offline na ni dá uloženou stránku aplikace jako na každou jinou adresu
  file('neznama-stranka', '<html>404</html>', 'text/html; charset=utf-8', 404);
  x = await run(req('/neznama-stranka', { mode: 'navigate' }));
  assert.deepEqual([x.res.status, x.text], [404, '<html>404</html>']);
  assert.equal(store.get('atlas-v2').get(SCOPE), '<html>v3</html>', 'stránka 404 nepřepíše uloženou stránku aplikace');
  assert.ok(!store.get('atlas-v2').has(`${SCOPE}neznama-stranka`));

  // offline: uložené kopie, stránka pod libovolnou adresou = poslední uložená stránka aplikace
  net.offline = true;
  assert.equal((await run(req('/js/app.js'))).text, 'app v3');
  assert.equal((await run(req('/data/countries.json', { mode: 'cors' }))).text, '[2]');
  assert.equal((await run(req('/#planner', { mode: 'navigate' }))).text, '<html>v3</html>');
  assert.equal((await run(req('/?zdroj=plocha', { mode: 'navigate' }))).text, '<html>v3</html>');
  assert.equal((await run(req('/neznama-stranka', { mode: 'navigate' }))).text, '<html>v3</html>');
  await assert.rejects(run(req('/vendor/maplibre/maplibre-gl.js')), /Failed to fetch/, 'neuložený soubor offline selže jako bez service workeru');
  const api = await run(req('/api/search', { method: 'POST', mode: 'cors' }));
  assert.equal(api.ev.responded, null, 'API offline: prohlížeč request odmítne a aplikace ukáže svou hlášku');

  // stránka otevřená offline se ptá na verzi uložené kopie
  let answer = null;
  sw.handlers.message({ data: 'atlas-build', ports: [{ postMessage: (m) => { answer = m; } }] });
  assert.equal(answer, 'v2');
});

test('service worker: soubory s otiskem v adrese (js/app.js?v=…) bez ověření u serveru; uloží jen obsah, který server potvrdil (X-Atlas-Hash)', async () => {
  const A = 'js/app.js?v=aaaaaaaaaa', C = 'css/atlas.css?v=cccccccccc', OLD = 'js/stary.js?v=0000000000', CF = 'js/cf.js?v=dddddddddd';
  const precache = ['./', A, C, 'js/pwa.js', OLD, CF];
  const sw = loadSw(read('public/sw.js').replace(/^const BUILD = .*$/m, "const BUILD = 'v5';").replace(/^const PRECACHE = .*$/m, `const PRECACHE = ${JSON.stringify(precache)};`));
  const { net, store, event } = sw;
  // odpověď serveru na adresu, jejíž otisk sedí s obsahem (server/index.js serveFile)
  const ok = (p) => ({ 'cache-control': 'public, max-age=31536000, immutable', 'x-atlas-hash': p.split('?v=')[1] });
  const file = (p, body, type = 'text/javascript', headers = {}) => { net.files[SCOPE + p] = { body, type, headers }; };
  file('', '<html>v5</html>', 'text/html; charset=utf-8', { 'cache-control': 'no-cache' });
  file(A, 'app v5', 'text/javascript', ok(A));
  file(C, 'css v5', 'text/css', ok(C));
  file('js/pwa.js', 'pwa v5', 'text/javascript', { 'cache-control': 'no-cache' });
  // během nasazení odpověděl ještě starý server: jiný obsah s no-cache, bez potvrzení – pod adresu s otiskem se neuloží
  file(OLD, 'jiný obsah', 'text/javascript', { 'cache-control': 'no-cache' });
  // Cloudflare přepsal Cache-Control (Browser Cache TTL) – potvrzení otisku zůstane, uloží se
  file(CF, 'cf v5', 'text/javascript', { 'cache-control': 'public, max-age=14400', 'x-atlas-hash': 'dddddddddd' });
  await Promise.all(event('install').waits);
  const cache = store.get('atlas-v5');
  const modes = Object.fromEntries(net.log.map((r) => [r.url.slice(SCOPE.length), r.cache]));
  assert.deepEqual(modes, { '': 'no-cache', [A]: 'default', [C]: 'default', 'js/pwa.js': 'no-cache', [OLD]: 'default', [CF]: 'default' },
    's otiskem z mezipaměti prohlížeče (stránka je právě stáhla), bez otisku s ověřením');
  assert.deepEqual([...cache.keys()].sort(), [SCOPE, SCOPE + C, SCOPE + A, `${SCOPE}js/pwa.js`, SCOPE + CF].sort());
  sw.puts.length = 0;
  await Promise.all(event('activate').waits);
  assert.deepEqual(sw.puts.sort(), [SCOPE + A, `${SCOPE}js/pwa.js`, SCOPE + CF].sort(), 'skripty s otiskem taky jednou znovu uložit (rewriteScripts)');
  delete net.files[SCOPE + CF];

  const run = async (r) => {
    const ev = event('fetch', { request: r });
    const res = ev.responded && (await ev.responded);
    await Promise.all(ev.waits);
    return { ev, text: res ? await res.text() : null };
  };
  net.log.length = 0;
  const ra = req(`/${A}`);
  assert.equal((await run(ra)).text, 'app v5');
  assert.equal(net.log[0], ra, 'požadavek beze změny – odpoví mezipaměť prohlížeče nebo Cloudflare, ne server');
  await run(req('/js/pwa.js'));
  assert.equal(net.log[1].cache, 'no-cache', 'bez otisku dál s ověřením u serveru');
  // nepotvrzený obsah se ukáže (stránka běží), ale neuloží; potvrzený se uloží
  const B = 'js/novy.js?v=bbbbbbbbbb';
  file(B, 'starý obsah', 'text/javascript', { 'cache-control': 'no-cache' });
  assert.equal((await run(req(`/${B}`))).text, 'starý obsah');
  assert.ok(!cache.has(SCOPE + B));
  file(B, 'cizí obsah', 'text/javascript', { ...ok(B), 'x-atlas-hash': 'eeeeeeeeee' });
  await run(req(`/${B}`));
  assert.ok(!cache.has(SCOPE + B), 'potvrzení jiného otisku nestačí');
  file(B, 'nový obsah', 'text/javascript', ok(B));
  await run(req(`/${B}`));
  assert.equal(cache.get(SCOPE + B), 'nový obsah');
  // offline: uložená kopie podle celé adresy i s otiskem – jiný otisk offline není (nikdy jiný obsah)
  net.offline = true;
  assert.equal((await run(req(`/${A}`))).text, 'app v5');
  assert.equal((await run(req(`/${C}`))).text, 'css v5');
  await assert.rejects(run(req('/js/app.js?v=ffffffffff')), /Failed to fetch/);
  const versioned = vm.runInContext('versioned', sw.ctx);
  assert.equal(versioned('https://atlas.test/js/app.js?v=0123456789'), true);
  for (const u of ['https://atlas.test/js/app.js', 'https://atlas.test/js/app.js?v=', 'https://atlas.test/js/app.js?v=xyz', 'https://atlas.test/js/app.js?vv=0123456789']) {
    assert.equal(versioned(u), false, u);
  }
});

test('service worker: po aktivaci skripty z uložené sady jednou znovu uloží (bez předkompilace z instalace) – bez sítě, obsah stejný', async () => {
  const precache = ['./', 'js/app.js', 'js/flights.js', 'css/atlas.css', 'data/countries.json', 'js/smazany.js'];
  const src = read('public/sw.js').replace(/^const BUILD = .*$/m, "const BUILD = 'v3';").replace(/^const PRECACHE = .*$/m, `const PRECACHE = ${JSON.stringify(precache)};`);
  const files = {
    '': ['<html>v3</html>', 'text/html; charset=utf-8'], 'js/app.js': ['app v3'], 'js/flights.js': ['lety v3'],
    'css/atlas.css': ['css v3', 'text/css'], 'data/countries.json': ['[3]', 'application/json'],
  };
  const installed = async () => {
    const sw = loadSw(src);
    for (const [p, [body, type = 'text/javascript']] of Object.entries(files)) sw.net.files[SCOPE + p] = { body, type };
    await Promise.all(sw.event('install').waits);
    sw.puts.length = 0; sw.net.log.length = 0;
    return sw;
  };
  const sw = await installed();
  const before = new Map(sw.store.get('atlas-v3'));
  sw.net.files[`${SCOPE}js/app.js`] = { body: 'app v4', type: 'text/javascript' }; // server už má novější – aktivace síť nebere
  await Promise.all(sw.event('activate').waits);
  assert.deepEqual(sw.puts.sort(), [`${SCOPE}js/app.js`, `${SCOPE}js/flights.js`], 'jen skripty, které instalace uložila (smazany.js – 404 – ne)');
  assert.equal(sw.net.log.length, 0, 'bez sítě');
  assert.deepEqual(new Map(sw.store.get('atlas-v3')), before, 'uložená sada beze změny (offline stejné soubory)');
  assert.equal(sw.calls.claim, 1);
  // uložit nejde (plné úložiště): aktivace stejně doběhne, kopie z instalace zůstanou
  const full = await installed();
  const kept = new Map(full.store.get('atlas-v3'));
  full.net.putFails = true;
  await Promise.all(full.event('activate').waits);
  assert.equal(full.calls.claim, 1);
  assert.deepEqual(new Map(full.store.get('atlas-v3')), kept);
});

test('service worker: stránka přes navigation preload (požadavek odeslaný už při probouzení service workeru), jinak jako dřív', async () => {
  const src = read('public/sw.js').replace(/^const BUILD = .*$/m, "const BUILD = 'v1';").replace(/^const PRECACHE = .*$/m, `const PRECACHE = ${JSON.stringify(['./', 'js/app.js'])};`);
  const sw = loadSw(src);
  const { net, store, event, ctx } = sw;
  const file = (p, body, type = 'text/javascript') => { net.files[SCOPE + p] = { body, type }; };
  file('', '<html>v1</html>', 'text/html; charset=utf-8');
  file('js/app.js', 'app v1');
  await Promise.all(event('install').waits);
  // aktivace zapne navigation preload, umí-li to prohlížeč (bez navigationPreload – testy výš – nic)
  let enabled = 0;
  ctx.registration.navigationPreload = { enable: async () => { enabled++; } };
  await Promise.all(event('activate').waits);
  assert.equal(enabled, 1);

  const page = (body, build = 'v1') => new BasicResponse(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-atlas-build': build } });
  const run = async (extra) => {
    const ev = event('fetch', extra);
    const res = ev.responded && (await ev.responded);
    await Promise.all(ev.waits);
    return { ev, text: res ? await res.text() : null };
  };
  // odpověď z preload: žádný další požadavek na stránku, uloží se pod adresu aplikace, soubory pak z uložené sady
  net.log.length = 0;
  file('js/app.js', 'app v1 – ze sítě by přišlo tohle');
  let x = await run({ request: req('/', { mode: 'navigate' }), preloadResponse: Promise.resolve(page('<html>v1 nová</html>')), resultingClientId: 'p1' });
  assert.equal(x.text, '<html>v1 nová</html>');
  assert.equal(net.log.length, 0, 'stránka jen jedním požadavkem – tím z preload');
  assert.equal(store.get('atlas-v1').get(SCOPE), '<html>v1 nová</html>');
  assert.equal((await run({ request: req('/js/app.js'), clientId: 'p1' })).text, 'app v1', 'stejná verze → soubory z uložené sady');
  // jiná verze na serveru: stránka ze sítě se pod starou verzi neuloží (jako bez preload)
  x = await run({ request: req('/', { mode: 'navigate' }), preloadResponse: Promise.resolve(page('<html>v2</html>', 'v2')), resultingClientId: 'p2' });
  assert.equal(x.text, '<html>v2</html>');
  assert.equal(store.get('atlas-v1').get(SCOPE), '<html>v1 nová</html>');
  // prohlížeč preload neposlal (undefined) nebo selhal: nový požadavek s ověřením jako dřív
  for (const preloadResponse of [Promise.resolve(undefined), Promise.reject(new TypeError('preload zrušen'))]) {
    net.log.length = 0;
    x = await run({ request: req('/', { mode: 'navigate' }), preloadResponse, resultingClientId: 'p3' });
    assert.equal(x.text, '<html>v1</html>');
    assert.deepEqual(net.log.map((r) => [r.url, r.cache, r.redirect]), [[SCOPE, 'no-cache', 'manual']]);
  }
  // offline: preload i nový požadavek selžou → poslední uložená stránka (ta z požadavku výš)
  net.offline = true;
  x = await run({ request: req('/?zdroj=plocha', { mode: 'navigate' }), preloadResponse: Promise.reject(new TypeError('Failed to fetch')) });
  assert.equal(x.text, '<html>v1</html>');
  net.offline = false;
  // navigace, do které se service worker neplete (api/…): preload nechá prohlížeči, jen ho nezruší (i když selže)
  x = await run({ request: req('/api/health', { mode: 'navigate' }), preloadResponse: Promise.reject(new TypeError('Failed to fetch')) });
  assert.equal(x.ev.responded, null);
  assert.equal(x.ev.waits.length, 1);
});

/* ---------- pwa.js ---------- */
function loadPwaCtx() {
  const ctx = { window: {}, URL, console, setTimeout, clearTimeout, AbortController, AbortSignal };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/pwa.js'), ctx, { filename: 'pwa.js' });
  return ctx;
}
const loadPwa = () => loadPwaCtx().window;

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

test('pwa.js: slabý signál – API bez hlavičky odpovědi do limitu skončí českou chybou, zaseklý stream hledání taky; zrušení volajícím zůstane AbortError', async () => {
  const ctx = loadPwaCtx(), { Pwa } = ctx.window;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // „síť“: odpoví za `after` ms (nikdy = null); zrušení signálem odmítne AbortError jako fetch v prohlížeči
  const net = (after) => (input, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    if (after != null) setTimeout(resolve, after, { ok: true, signal: init.signal });
  });
  assert.equal(Pwa.API_WAIT, 120e3, 'pokryje probouzení serveru na Renderu (~1 min) i pomalá místa v okolí');
  assert.match(Pwa.SLOW_MSG, /2 minuty/);

  // odpověď včas: projde a limit končí s hlavičkou – pozdější stream (tělo) se nezruší
  const r = await Pwa.withDeadline(net(5), 'api/health', undefined, 30);
  assert.equal(r.ok, true);
  await wait(50);
  assert.equal(r.signal.aborted, false, 'tělo odpovědi limit nemá');

  // zaseklé spojení: po limitu NetworkError s českou hláškou (aplikace ji ukáže se „Zkusit znovu“), ne AbortError
  await assert.rejects(Pwa.withDeadline(net(null), 'api/stays?x=1', { method: 'GET' }, 20),
    (e) => e.name === 'NetworkError' && e.timeout === true && e.message === Pwa.SLOW_MSG && e.cause.name === 'AbortError');

  // vlastní signál volajícího (jiné hledání, našeptávač) platí dál: zrušení = AbortError jako dřív
  const own = new AbortController();
  const p = Pwa.withDeadline(net(null), 'api/search', { method: 'POST', signal: own.signal }, 1000);
  setTimeout(() => own.abort(), 5);
  await assert.rejects(p, (e) => e.name === 'AbortError');
  // … a limit platí i u něj
  await assert.rejects(Pwa.withDeadline(net(null), 'api/search', { signal: new AbortController().signal }, 20), (e) => e.timeout === true);

  // stream hledání: data jdou dál, po limitu bez jediného bajtu chyba a zrušený stream
  // jako ReadableStream v prohlížeči (sliby téhož prostředí – pořadí jako v Chromu): cancel() ukončí čekající read()
  // jako konec streamu ({ done: true }) – kdyby vyhrál, hledání by skončilo „Server neposlal výsledek“
  const rd = vm.runInContext(`(() => {
    const chunks = [{ value: 'a', done: false }];
    let pending = null;
    return { cancelled: 0, read: () => (chunks.length ? Promise.resolve(chunks.shift()) : new Promise((r) => { pending = r; })),
      cancel() { this.cancelled++; if (pending) pending({ value: undefined, done: true }); return Promise.resolve(); } };
  })()`, ctx);
  assert.deepEqual({ ...(await Pwa.readOrStall(rd, 20)) }, { value: 'a', done: false });
  await assert.rejects(Pwa.readOrStall(rd, 20), (e) => e.name === 'NetworkError' && e.message === Pwa.SLOW_MSG);
  assert.equal(rd.cancelled, 1, 'zaseklý stream se zruší (spojení se uzavře)');
});

test('pwa.js: po návratu online se jednou znovu načte, co se offline nenačetlo (radar, Objevuj) – pod jedním klíčem jen poslední', () => {
  const { Pwa } = loadPwa();
  const calls = [];
  Pwa.whenOnline('radar', () => calls.push('radar 1'));
  Pwa.whenOnline('radar', () => calls.push('radar 2')); // opakovaný výpadek: nic se nehromadí
  Pwa.whenOnline('explore', () => { calls.push('explore'); throw new Error('chyba jednoho nezastaví ostatní'); });
  Pwa.whenOnline('x', () => calls.push('x'));
  const err = console.error;
  console.error = () => { };
  try { Pwa.flushOnline(); } finally { console.error = err; }
  assert.deepEqual(calls, ['radar 2', 'explore', 'x']);
  Pwa.flushOnline(); // další návrat online: jen jednou, žádné opakování
  assert.equal(calls.length, 3);
});

test('ETag podle obsahu: znovu nasazený nezměněný soubor (nový čas změny) odpoví 304, změněný 200', async () => {
  const a = await fetch(`${base}/js/app.js`, { headers: { 'accept-encoding': 'br' } });
  const tag = a.headers.get('etag');
  assert.match(tag, /^"[\w-]{22}-br"$/);
  // nasazení posune Last-Modified – starší If-Modified-Since by dal 200, shodný ETag má přednost → 304
  const old = new Date(Date.parse(a.headers.get('last-modified')) - 864e5).toUTCString();
  const same = await fetch(`${base}/js/app.js`, { headers: { 'accept-encoding': 'br', 'if-none-match': tag, 'if-modified-since': old } });
  assert.equal(same.status, 304);
  assert.equal(same.headers.get('etag'), tag);
  // jiná komprese = jiná podoba souboru
  const gz = await fetch(`${base}/js/app.js`, { headers: { 'accept-encoding': 'gzip', 'if-none-match': tag } });
  assert.equal(gz.status, 200);
  assert.match(gz.headers.get('etag'), /-gzip"$/);
  await gz.arrayBuffer();
  const other = await fetch(`${base}/js/app.js`, { headers: { 'accept-encoding': 'br', 'if-none-match': '"jiny-obsah-br"' } });
  assert.equal(other.status, 200);
  await other.arrayBuffer();
});
