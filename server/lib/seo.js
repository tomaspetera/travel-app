// Vyhledávače a náhledy sdílených odkazů: hlavička stránky aplikace (titulek, popis, kanonická adresa, Open Graph,
// Twitter Card, JSON-LD), manifest aplikace na ploše s názvem a popisem, robots.txt, sitemap.xml a česká stránka 404.
// Název a popis z server/brand.js, adresa webu z PUBLIC_URL (config.publicUrl) – při přejmenování se nic nemění tady.
// Sdílené odkazy do aplikace nesou cestu v části za # (#trip=, #plan=, #offer=…), kterou roboti nevidí: náhled je proto
// u všech odkazů stejný – obecný obrázek a popis ATLASu.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { BRAND } from '../brand.js';
import { inlineScriptHashes } from './security.js';
import { etagMatches } from './pwa.js';

/** Text do atributu i obsahu HTML a XML (& < > " escapované). */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Adresa na webu: base (bez lomítka na konci) + cesta vůči kořeni. */
const urlAt = (base, rel = '') => `${base}/${rel}`;

/**
 * Značky do <head> stránky aplikace (pwa.js serveIndex je dosadí mezi <!-- brand … --> a <!-- /brand --> v index.html).
 * Kanonická adresa a obrázek musí být absolutní – roboti Facebooku, WhatsAppu, X a Slacku relativní adresu neberou.
 * JSON-LD jen se stálými fakty (webová aplikace, česky, zdarma) – žádná hodnocení ani čísla, která by se musela udržovat.
 */
export function headTags(base, brand = BRAND) {
  const home = urlAt(base), img = urlAt(base, brand.image.path);
  const prop = (k, v) => `<meta property="${k}" content="${esc(v)}">`;
  const name = (k, v) => `<meta name="${k}" content="${esc(v)}">`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: brand.name,
    url: home,
    description: brand.description,
    image: img,
    inLanguage: 'cs',
    applicationCategory: 'TravelApplication',
    operatingSystem: 'Web',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CZK' },
  };
  return [
    `<title>${esc(brand.title)}</title>`,
    name('description', brand.description),
    `<link rel="canonical" href="${esc(home)}">`,
    prop('og:type', 'website'),
    prop('og:site_name', brand.name),
    prop('og:locale', 'cs_CZ'),
    prop('og:url', home),
    prop('og:title', brand.title),
    prop('og:description', brand.description),
    prop('og:image', img),
    prop('og:image:type', 'image/png'),
    prop('og:image:width', brand.image.width),
    prop('og:image:height', brand.image.height),
    prop('og:image:alt', brand.image.alt),
    name('twitter:card', 'summary_large_image'),
    name('twitter:image:alt', brand.image.alt),
    name('application-name', brand.name),
    name('apple-mobile-web-app-title', brand.name),
    // „<“ jako \u003c: text z konfigurace nikdy neukončí <script> předčasně
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ].join('\n');
}

/** robots.txt: roboti smí všude, mapa webu na veřejné adrese. */
/**
 * Stará adresa Renderu (…onrender.com) po přechodu na vlastní doménu (PUBLIC_URL): kam stránku trvale přesměrovat, nebo
 * null. Jen stránky – navigace, sdílené odkazy /c/…, roboti bez Sec-Fetch-Dest. API, /healthz, sw.js a soubory stránek
 * ne: otevřená záložka nebo aplikace na ploše ze staré adresy dál funguje (CSP 'self' by soubory z jiné domény
 * zablokovala) a na novou adresu se dostane při dalším otevření. Bez vlastní domény, v náhledu PR a na jiném hostu nic.
 */
export function movedTo({ host, method, path, search = '', dest }, publicUrl, { preview = false } = {}) {
  let target;
  try { target = new URL(publicUrl); } catch { return null; }
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  if (preview || !h.endsWith('.onrender.com') || target.hostname.endsWith('.onrender.com') || h === target.hostname) return null;
  if ((method !== 'GET' && method !== 'HEAD') || path.startsWith('/api/') || path === '/healthz' || path === '/sw.js') return null;
  if (dest && dest !== 'document') return null; // soubor stránky (skript, styl, písmo, obrázek, manifest, worker…)
  // Bez Sec-Fetch-Dest (Safari pod 16.4, roboti) pozná soubor jen podle přípony: přesměrovaný by se stáhl z jiné domény
  // bez CORS a aktualizace service workeru (fetch v instalaci) by na staré adrese napořád selhávala.
  if (!dest && /\.[^/]+$/.test(path) && !path.endsWith('.html')) return null;
  return `${target.origin}${path}${search}`;
}

export const robotsTxt = (base) => `User-agent: *\nAllow: /\n\nSitemap: ${urlAt(base, 'sitemap.xml')}\n`;

/** sitemap.xml: stránka aplikace (sekce jsou za # – roboti je neuvidí jako samostatné stránky) a právní texty
    (server/lib/pravni.js LEGAL – tady vypsané, aby se moduly navzájem nenačítaly). */
export const sitemapXml = (base) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', 'soukromi', 'podminky'].map((rel) => `  <url><loc>${esc(urlAt(base, rel))}</loc></url>\n`).join('')}</urlset>
`;

/**
 * Manifest aplikace na ploše: soubor public/manifest.webmanifest + název a popis z brand.js (name, short_name,
 * description hned za id). Ostatní pole (ikony, barvy, zkratky) zůstávají v souboru.
 */
export function manifestFor(json, brand = BRAND) {
  const { id, name, short_name: shortName, description, ...rest } = JSON.parse(json);
  return JSON.stringify({ ...(id !== undefined ? { id } : {}), name: brand.name, short_name: brand.name, description: brand.appDescription, ...rest }, null, 2) + '\n';
}

/**
 * Stránka 404 pro neznámé adresy mimo API: česky, světlá i tmavá podle systému, s odkazem do aplikace. Část adresy
 * za # (sdílená cesta, plán, nabídka – prohlížeč ji serveru nepošle) si odkaz vezme s sebou, kdyby někdo poslal odkaz
 * s cestou navíc. Vzhled Letsi 2.1 jako public/css/letsi.css: Vápno a Noc, Pistácie jen pod textem Noc, žádné
 * přechody. Styly vložené; logo a písmo Onest z vlastního serveru absolutní cestou – ukáže se stejně v každé hloubce
 * adresy. Logo přes <img> rovnou ze značky (public/vendor/letsi/, beze změny), tmavá varianta podle systému.
 */
export function notFoundHtml(brand = BRAND) {
  const name = esc(brand.name);
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Stránka nenalezena · ${name}</title>
<meta name="theme-color" content="#F3F4F0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14161F" media="(prefers-color-scheme: dark)">
<style>
@font-face{font-family:'Onest';font-style:normal;font-weight:400;font-display:swap;src:url(/vendor/fonts/letsi/onest-400.woff2) format('woff2')}
@font-face{font-family:'Onest';font-style:normal;font-weight:700 900;font-display:swap;src:url(/vendor/fonts/letsi/onest-700.woff2) format('woff2')}
:root{color-scheme:light;--bg:#F3F4F0;--card:#FFFFFF;--text:#14161F;--muted:#585D56;--border:#DFE2DA}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#14161F;--card:#1D2029;--text:#F3F4F0;--muted:#A6ACB6;--border:#2A2E3A}}
*{box-sizing:border-box;margin:0}
body{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--text);font:16px/1.5 Onest,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:420px;padding:32px 24px;border:1px solid var(--border);border-radius:20px;background:var(--card);text-align:center}
.logo{display:block;margin:0 auto 24px}
.logo img{display:block;width:162px;height:36px;margin:0 auto}
/* kód jednobarevně barvou textu – přechod v textu identita nepovoluje */
.code{font:800 56px/1 Onest,system-ui,sans-serif;color:var(--text)}
h1{margin:12px 0 8px;font-size:22px;line-height:1.3}
p{margin-bottom:24px;color:var(--muted)}
/* Pistácie jen jako plná plocha pod textem Noc – v obou režimech stejně */
a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 24px;border-radius:14px;background:#D6DE82;color:#14161F;font-weight:700;text-decoration:none}
a:focus-visible{outline:3px solid var(--text);outline-offset:3px}
</style>
</head>
<body>
<main>
<picture class="logo"><source srcset="/vendor/letsi/letsi-logo-negativ.svg" media="(prefers-color-scheme: dark)"><img src="/vendor/letsi/letsi-logo-hlavni.svg" alt="${name}" width="162" height="36"></picture>
<div class="code" aria-hidden="true">404</div>
<h1>Tahle stránka neexistuje</h1>
<p>Odkaz je asi neúplný nebo zastaralý. Lety, cesty i plánovač najdeš v aplikaci.</p>
<a id="home" href="/">Otevřít ${name}</a>
</main>
<script>
(function () { var a = document.getElementById('home'); if (a && location.hash.length > 1) a.href = '/' + location.hash; })();
</script>
</body>
</html>
`;
}

/** CSP stránky 404: nic cizího, jen vložené styly, její jediný skript podle otisku a logo s písmem z vlastního serveru. */
export const notFoundCsp = (html) => `default-src 'none'; script-src ${inlineScriptHashes(html).join(' ')}; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

/** Vygenerovaná odpověď s ETagem podle obsahu (levné 304) a HEAD bez těla. */
export function sendGenerated(req, res, status, body, headers) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const etag = `"g-${createHash('sha256').update(buf).digest('base64url').slice(0, 22)}"`;
  const h = { ...headers, ETag: etag };
  if (status === 200 && etagMatches(req.headers['if-none-match'], etag)) {
    res.writeHead(304, h);
    return res.end();
  }
  res.writeHead(status, { ...h, 'Content-Length': buf.length });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

let manifestMemo = null;
/** GET/HEAD /manifest.webmanifest: soubor z public/ s názvem a popisem z brand.js; kód aplikace → vždy ověřit (no-cache). */
export function serveManifest(req, res, file) {
  let st;
  try {
    st = statSync(file);
  } catch {
    return false;
  }
  const key = `${file}|${st.size}|${st.mtimeMs}`;
  if (!manifestMemo || manifestMemo.key !== key) manifestMemo = { key, body: manifestFor(readFileSync(file, 'utf8')) };
  sendGenerated(req, res, 200, manifestMemo.body, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' });
  return true;
}

const NOT_FOUND = notFoundHtml();
const NOT_FOUND_CSP = notFoundCsp(NOT_FOUND);
/** Neznámá adresa mimo API: 404 s českou stránkou (ne stránka aplikace s 200 – vyhledávačům by se jevila jako kopie). */
export function serveNotFound(req, res) {
  sendGenerated(req, res, 404, NOT_FOUND, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': NOT_FOUND_CSP });
}
