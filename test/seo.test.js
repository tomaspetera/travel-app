// Vyhledávače a náhledy sdílených odkazů (server/lib/seo.js): titulek, popis, kanonická adresa, Open Graph, Twitter
// Card a JSON-LD ve stránce podle server/brand.js a PUBLIC_URL, manifest s názvem, robots.txt, sitemap.xml, stránka 404
// pro neznámé adresy a náhledový obrázek (scripts/build-og-image.mjs) – rozměry, velikost a otisk šablony.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { config, cleanSiteUrl } = await import('../server/config.js');
const { BRAND } = await import('../server/brand.js');
const { headTags, manifestFor, notFoundHtml } = await import('../server/lib/seo.js');
const { inlineScriptHashes, SECURITY_HEADERS } = await import('../server/lib/security.js');
const { serviceWorker } = await import('../server/lib/pwa.js');
const { ogSource, pngChunks, TEXT_KEY } = await import('../scripts/build-og-image.mjs');
const { crc32 } = await import('../scripts/build-icons.mjs');

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url));
let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Obsah <meta property|name="key" content="…"> – musí být právě jednou. */
function meta(html, key) {
  const all = [...html.matchAll(new RegExp(`<meta (?:property|name)="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)">`, 'g'))];
  assert.equal(all.length, 1, `${key}: právě jednou (${all.length}×)`);
  return all[0][1];
}
const page = async (url = config.publicUrl) => {
  const was = config.publicUrl;
  config.publicUrl = url;
  try {
    const r = await fetch(`${base}/`);
    return { r, html: await r.text() };
  } finally {
    config.publicUrl = was;
  }
};

test('stránka: titulek, popis, kanonická adresa, Open Graph a Twitter Card z brand.js; obrázek absolutní adresou', async () => {
  const { r, html } = await page();
  assert.equal(r.status, 200);
  const home = `${config.publicUrl}/`;
  assert.match(html, /^<!DOCTYPE html>\n<html lang="cs"/);
  assert.equal(html.match(/<title>([^<]*)<\/title>/g).length, 1, 'jeden <title>');
  assert.ok(html.includes(`<title>${esc(BRAND.title)}</title>`));
  assert.equal(meta(html, 'description'), esc(BRAND.description));
  assert.equal([...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((m) => m[1]).join(), home);
  const og = {
    'og:type': 'website', 'og:site_name': BRAND.name, 'og:locale': 'cs_CZ', 'og:url': home, 'og:title': BRAND.title,
    'og:description': BRAND.description, 'og:image': `${config.publicUrl}/${BRAND.image.path}`, 'og:image:type': 'image/png',
    'og:image:width': String(BRAND.image.width), 'og:image:height': String(BRAND.image.height), 'og:image:alt': BRAND.image.alt,
    'twitter:card': 'summary_large_image', 'twitter:image:alt': BRAND.image.alt,
    'application-name': BRAND.name, 'apple-mobile-web-app-title': BRAND.name,
  };
  for (const [k, v] of Object.entries(og)) assert.equal(meta(html, k), esc(v), k);
  // popis pro Google do ~155 znaků, titulek do ~60
  assert.ok(BRAND.description.length <= 155 && BRAND.title.length <= 60, `${BRAND.title.length} / ${BRAND.description.length}`);
  // roboti (Facebook, WhatsApp) čtou jen začátek stránky: značky hned na začátku <head>, před úvodními obrazovkami iOS
  const at = html.indexOf('property="og:image"');
  assert.ok(at > 0 && at < 4096 && at < html.indexOf('apple-touch-startup-image'), `og:image na ${at}. znaku`);
  assert.ok(!html.includes('<!-- brand') && !html.includes('<!-- /brand'), 'blok z index.html nahrazený celý');
  // ostatní základ pro vyhledávače a instalaci zůstává v index.html
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="icon" href="icons\/icon-96\.png" sizes="96x96" type="image\/png">/);
  assert.match(html, /<meta name="viewport" content="width=device-width/);
});

test('JSON-LD WebApplication: jen stálá fakta (zdarma, česky), žádná hodnocení; CSP ho nehashuje (nespouští se)', async () => {
  const { r, html } = await page();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  const ld = JSON.parse(blocks[0][1]);
  assert.deepEqual(
    { type: ld['@type'], ctx: ld['@context'], name: ld.name, url: ld.url, lang: ld.inLanguage, free: ld.isAccessibleForFree, price: ld.offers.price, desc: ld.description },
    { type: 'WebApplication', ctx: 'https://schema.org', name: BRAND.name, url: `${config.publicUrl}/`, lang: 'cs', free: true, price: '0', desc: BRAND.description },
  );
  assert.equal(ld.applicationCategory, 'TravelApplication');
  for (const k of ['aggregateRating', 'review', 'ratingValue']) assert.ok(!JSON.stringify(ld).includes(k), `${k} – žádná vymyšlená hodnocení`);
  // datový blok se nespouští: otisk do script-src nepatří (ostatní vložené skripty dál ano)
  const ldHash = `'sha256-${createHash('sha256').update(blocks[0][1]).digest('base64')}'`;
  const csp = r.headers.get('content-security-policy');
  assert.ok(!csp.includes(ldHash), 'JSON-LD bez otisku v CSP');
  assert.deepEqual(inlineScriptHashes('<script type="application/ld+json">{"a":1}</script><script type="module">m()</script><script type="text/javascript">j()</script>'),
    inlineScriptHashes('<script>m()</script><script>j()</script>'), 'module a text/javascript se hashují, JSON-LD ne');
  // text z konfigurace <script> nikdy neukončí
  const evil = headTags('https://a.cz', { ...BRAND, description: '</script><img src=x onerror=alert(1)>"&', title: 'A"<b>' });
  assert.ok(!/<\/script><img/.test(evil) && !evil.includes('<b>') && evil.includes('content="&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;&quot;&amp;"'));
  assert.equal((evil.match(/<\/script>/g) || []).length, 1);
});

test('PUBLIC_URL: vlastní doména (.cz) v kanonické adrese, náhledu, robots.txt i sitemap.xml; neplatná → výchozí z brand.js', async () => {
  assert.equal(cleanSiteUrl('https://atlas.cz/'), 'https://atlas.cz');
  assert.equal(cleanSiteUrl(' https://www.atlas.cz/?x=1#y '), 'https://www.atlas.cz');
  assert.equal(cleanSiteUrl('http://localhost:8080'), 'http://localhost:8080');
  for (const bad of ['', 'atlas.cz', 'ftp://atlas.cz', 'javascript:alert(1)', 'https://user:heslo@atlas.cz', null, undefined]) assert.equal(cleanSiteUrl(bad), '', String(bad));
  assert.match(BRAND.url, /^https:\/\/[^/]+$/, 'výchozí adresa bez lomítka na konci');
  const { html } = await page('https://atlas.example.cz');
  assert.equal(html.match(/<link rel="canonical" href="([^"]+)">/)[1], 'https://atlas.example.cz/');
  assert.equal(meta(html, 'og:url'), 'https://atlas.example.cz/');
  assert.equal(meta(html, 'og:image'), `https://atlas.example.cz/${BRAND.image.path}`);
  const was = config.publicUrl;
  config.publicUrl = 'https://atlas.example.cz';
  try {
    assert.match(await (await fetch(`${base}/robots.txt`)).text(), /^Sitemap: https:\/\/atlas\.example\.cz\/sitemap\.xml$/m);
    assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /<loc>https:\/\/atlas\.example\.cz\/<\/loc>/);
  } finally {
    config.publicUrl = was;
  }
});

test('robots.txt a sitemap.xml: 200, správný typ, vše povolené, mapa webu s veřejnou adresou; HEAD a 304', async () => {
  const r = await fetch(`${base}/robots.txt`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/plain; charset=utf-8');
  const robots = await r.text();
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  assert.doesNotMatch(robots, /^Disallow: \/\s*$/m, 'nic zakázaného celé');
  assert.match(robots, new RegExp(`^Sitemap: ${config.publicUrl.replace(/[.]/g, '\\.')}/sitemap\\.xml$`, 'm'));
  assert.equal((await fetch(`${base}/robots.txt`, { headers: { 'if-none-match': r.headers.get('etag') } })).status, 304);
  const head = await fetch(`${base}/robots.txt`, { method: 'HEAD' });
  assert.deepEqual([head.status, await head.text()], [200, '']);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers.get(k), v, k);

  const s = await fetch(`${base}/sitemap.xml`);
  assert.equal(s.status, 200);
  assert.equal(s.headers.get('content-type'), 'application/xml; charset=utf-8');
  const xml = await s.text();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), [`${config.publicUrl}/`], 'jediná stránka – sekce aplikace jsou za #');
});

test('neznámá adresa mimo API: česká stránka 404 s odkazem do aplikace; stránka aplikace, API a soubory beze změny', async () => {
  for (const p of ['/neexistujici-stranka', '/trip/abc', '/js/neexistuje.js', '/icons/', '/.env', '/index.htm']) {
    const r = await fetch(`${base}${p}`);
    assert.equal(r.status, 404, p);
    assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8', p);
    assert.equal(r.headers.get('x-atlas-build'), null, `${p}: bez verze aplikace (service worker ji neuloží)`);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers.get(k), v, `${p}: ${k}`);
    const html = await r.text();
    assert.match(html, /<html lang="cs">/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /Tahle stránka neexistuje/);
    assert.ok(html.includes(`<title>Stránka nenalezena · ${esc(BRAND.name)}</title>`));
    assert.ok(html.includes(`<a id="home" href="/">Otevřít ${esc(BRAND.name)}</a>`), 'odkaz do aplikace');
    // CSP: nic cizího, jen vložené styly a jediný skript podle otisku
    const csp = r.headers.get('content-security-policy');
    assert.equal(csp, `default-src 'none'; script-src ${inlineScriptHashes(html).join(' ')}; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
    assert.equal(inlineScriptHashes(html).length, 1);
  }
  const head = await fetch(`${base}/neexistujici-stranka`, { method: 'HEAD' });
  assert.deepEqual([head.status, await head.text()], [404, '']);
  // odkaz s cestou navíc a sdílenou cestou za #: tlačítko ji vezme s sebou (část za # server nevidí)
  const script = notFoundHtml().match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [hash, href] of [['#trip=zABC', '/#trip=zABC'], ['', '/'], ['#', '/']]) {
    const a = { href: '/' };
    vm.runInNewContext(script, { document: { getElementById: (id) => (id === 'home' ? a : null) }, location: { hash } });
    assert.equal(a.href, href, hash);
  }
  // stránka aplikace (i s ?parametrem – start z plochy, odkaz z Facebooku s fbclid), API a soubory jako dřív
  for (const p of ['/', '/index.html', '/?zdroj=plocha', '/?fbclid=abc']) {
    const r = await fetch(`${base}${p}`);
    assert.equal(r.status, 200, p);
    assert.match(await r.text(), /<meta name="atlas-build" content="[0-9a-f]{12}">/, p);
  }
  const api = await fetch(`${base}/api/neznamy`);
  assert.deepEqual([api.status, api.headers.get('content-type')], [404, 'application/json; charset=utf-8']);
  assert.equal((await fetch(`${base}/js/app.js`)).status, 200);
});

test('manifest: název a popis z brand.js (v souboru nejsou – jedno místo), instalace: ikony, start, rozsah, jazyk', async () => {
  const file = JSON.parse(read('public/manifest.webmanifest'));
  for (const k of ['name', 'short_name', 'description']) assert.ok(!(k in file), `${k} jen v server/brand.js`);
  const r = await fetch(`${base}/manifest.webmanifest`);
  assert.deepEqual([r.status, r.headers.get('content-type'), r.headers.get('cache-control')], [200, 'application/manifest+json', 'no-cache']);
  const m = JSON.parse(await r.text());
  assert.deepEqual(Object.keys(m).slice(0, 4), ['id', 'name', 'short_name', 'description']);
  assert.deepEqual([m.name, m.short_name, m.description], [BRAND.name, BRAND.name, BRAND.appDescription]);
  assert.deepEqual([m.id, m.start_url, m.scope, m.lang, m.dir, m.display], ['/', '/', '/', 'cs', 'ltr', 'standalone']);
  assert.ok(m.categories.includes('travel'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable') && m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
  assert.deepEqual({ ...m, name: 0, short_name: 0, description: 0 }, { ...file, name: 0, short_name: 0, description: 0 }, 'ostatní pole beze změny ze souboru');
  assert.equal((await fetch(`${base}/manifest.webmanifest`, { headers: { 'if-none-match': r.headers.get('etag') } })).status, 304);
  assert.equal(JSON.parse(manifestFor('{"id":"/","name":"x","icons":[]}', { ...BRAND, name: 'Nový' })).name, 'Nový');
});

test('název, popis a adresa webu patří do verze aplikace: jejich změna = nový service worker (aplikace na ploše nevezme starý název)', () => {
  const dirs = { publicDir: new URL('../public', import.meta.url).pathname, dataDir: new URL('../data', import.meta.url).pathname };
  const a = serviceWorker({ ...dirs, salt: JSON.stringify([BRAND, 'https://a.cz']) }).build;
  assert.equal(serviceWorker({ ...dirs, salt: JSON.stringify([BRAND, 'https://a.cz']) }).build, a);
  assert.notEqual(serviceWorker({ ...dirs, salt: JSON.stringify([{ ...BRAND, name: 'Nový' }, 'https://a.cz']) }).build, a);
  assert.notEqual(serviceWorker({ ...dirs, salt: JSON.stringify([BRAND, 'https://b.cz']) }).build, a);
});

test('náhledový obrázek: PNG 1200 × 630 do 300 kB, vygenerovaný z aktuálního brand.js (jinak npm run build:og)', async () => {
  const buf = read(`public/${BRAND.image.path}`);
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off);
    assert.equal(buf.readUInt32BE(off + 8 + len), crc32(buf.subarray(off + 4, off + 8 + len)), `CRC bloku ${buf.toString('ascii', off + 4, off + 8)}`);
    off += 12 + len;
  }
  const c = pngChunks(buf);
  const [w, h, depth, color] = [c.IHDR.readUInt32BE(0), c.IHDR.readUInt32BE(4), c.IHDR[8], c.IHDR[9]];
  assert.deepEqual([w, h], [BRAND.image.width, BRAND.image.height]);
  assert.deepEqual([w, h], [1200, 630], 'doporučený rozměr Facebooku, X, LinkedInu i WhatsAppu (1,91 : 1)');
  assert.ok(depth === 8 && (color === 2 || color === 6));
  assert.equal(zlib.inflateSync(c.IDAT).length, h * (1 + w * (color === 6 ? 4 : 3)), 'obrazová data celá');
  assert.ok(buf.length < 300 * 1024, `${(buf.length / 1024).toFixed(0)} kB – WhatsApp větší náhled nemusí ukázat`);
  assert.equal(c.text[TEXT_KEY], ogSource(BRAND), 'obrázek je z jiného názvu, sloganu nebo šablony – spusť npm run build:og');
  const r = await fetch(`${base}/${BRAND.image.path}`);
  assert.deepEqual([r.status, r.headers.get('content-type')], [200, 'image/png']);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(buf));
});
