// Vyhledávače a náhledy sdílených odkazů: hlavička stránky aplikace (titulek, popis, kanonická adresa, Open Graph,
// Twitter Card, JSON-LD), manifest aplikace na ploše s názvem a popisem, robots.txt, sitemap.xml a česká stránka 404.
// Název a popis z server/brand.js, adresa webu z PUBLIC_URL (config.publicUrl) – při přejmenování se nic nemění tady.
// Sdílené odkazy do aplikace nesou cestu v části za # (#trip=, #plan=, #offer=…), kterou roboti nevidí: náhled je proto
// u všech odkazů stejný – obecný obrázek a popis ATLASu.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { BRAND } from '../brand.js';
import { inlineScriptHashes } from './security.js';

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
export const robotsTxt = (base) => `User-agent: *\nAllow: /\n\nSitemap: ${urlAt(base, 'sitemap.xml')}\n`;

/** sitemap.xml: jediná veřejná stránka – sekce aplikace jsou za # (roboti je neuvidí jako samostatné stránky). */
export const sitemapXml = (base) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${esc(urlAt(base))}</loc></url>
</urlset>
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
 * s cestou navíc. Bez souborů z aplikace (styly vložené, logo jako SVG) – ukáže se stejně v každé hloubce adresy.
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
<meta name="theme-color" content="#eef2fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#080c1a" media="(prefers-color-scheme: dark)">
<style>
:root{color-scheme:light;--bg:#eef2fb;--card:#fff;--text:#0f1830;--muted:#56638a;--border:rgba(13,22,48,.1);--btn:#0f1830;--btn-text:#fff}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#080c1a;--card:#111a32;--text:#eaf0ff;--muted:#94a3c8;--border:rgba(255,255,255,.09);--btn:#fff;--btn-text:#0b1226}}
*{box-sizing:border-box;margin:0}
body{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--text);font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:420px;padding:32px 24px;border:1px solid var(--border);border-radius:22px;background:var(--card);text-align:center}
.logo{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:24px;font:800 20px/1 Sora,Inter,system-ui,sans-serif;letter-spacing:.02em}
.logo svg{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#22d3ee 0%,#5b8cff 45%,#a855f7 100%)}
.code{font:800 56px/1 Sora,Inter,system-ui,sans-serif;background:linear-gradient(135deg,#22d3ee 0%,#5b8cff 45%,#a855f7 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
h1{margin:12px 0 8px;font-size:22px;line-height:1.3}
p{margin-bottom:24px;color:var(--muted)}
a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 24px;border-radius:16px;background:var(--btn);color:var(--btn-text);font-weight:700;text-decoration:none}
a:focus-visible{outline:3px solid #5b8cff;outline-offset:3px}
</style>
</head>
<body>
<main>
<div class="logo"><svg viewBox="-0.316 -0.866 25.532 25.532" aria-hidden="true"><path d="M20 6 10 13 4 10z" fill="#fff"/><path d="M20 6 13 19 10 13z" fill="#fff" fill-opacity=".8"/></svg>${name}</div>
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

/** CSP stránky 404: nic cizího, jen vložené styly a její jediný skript podle otisku. */
export const notFoundCsp = (html) => `default-src 'none'; script-src ${inlineScriptHashes(html).join(' ')}; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

/** Vygenerovaná odpověď s ETagem podle obsahu (levné 304) a HEAD bez těla. */
export function sendGenerated(req, res, status, body, headers) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const etag = `"g-${createHash('sha256').update(buf).digest('base64url').slice(0, 22)}"`;
  const h = { ...headers, ETag: etag };
  if (status === 200 && (req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(etag)) {
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
