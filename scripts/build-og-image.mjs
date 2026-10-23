#!/usr/bin/env node
// Náhledový obrázek sdíleného odkazu (Open Graph a Twitter Card, 1200 × 630) do public/og-image.png: šablona v HTML
// níž (barvy, přechod a vlaštovka jako ikona aplikace, písma Sora a Inter jako aplikace, texty ze server/brand.js)
// vyfocená v Chromiu přes Playwright. Po přejmenování nebo změně sloganu v brand.js stačí skript spustit znovu:
//
//   node scripts/build-og-image.mjs        (= npm run build:og)
//
// Playwright není závislost projektu (žádný npm install): skript ho vezme z globální instalace
// (npm i -g playwright && npx playwright install chromium). Písma stáhne z Google Fonts jen pro znaky z textů (text=)
// a vloží do šablony; bez sítě vyfotí se systémovým písmem a řekne to.
// Do PNG zapíše otisk šablony s texty (blok tEXt „og-source“) – test/seo.test.js podle něj pozná obrázek, který po
// změně brand.js nebo šablony nikdo znovu nevygeneroval. Obrázek kreslí obecný náhled: sdílené odkazy do aplikace
// (#trip=, #offer=…) nesou cestu za #, kterou roboti sociálních sítí nevidí.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BRAND } from '../server/brand.js';
import { crc32 } from './build-icons.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const OUT = path.join(root, 'public', BRAND.image.path);
export const TEXT_KEY = 'og-source';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// vlaštovka z ikony aplikace (scripts/build-icons.mjs, favicon): horní křídlo bílé, spodní s 80 % krytím (přehyb)
const SWALLOW = '<path d="M20 6 10 13 4 10z" fill="#fff"/><path d="M20 6 13 19 10 13z" fill="#fff" fill-opacity=".8"/>';

/**
 * Šablona náhledu (bez písem – ta dosadí render místo FONTS). Text vlevo s okrajem 72 px (X ořízne na 2 : 1 jen
 * 15 px nahoře a dole), vpravo ikona aplikace s trasou letu. Slogan se zalomí za první dvě slova.
 */
export function ogHtml(brand = BRAND) {
  const words = brand.tagline.split(' ');
  const tagline = `${esc(words.slice(0, 2).join(' '))}<br><span class="grad">${esc(words.slice(2).join(' '))}</span>`;
  return `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8">
<style>/*FONTS*/</style>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${brand.image.width}px;height:${brand.image.height}px;overflow:hidden}
body{position:relative;color:#eaf0ff;font-family:Inter,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  background:radial-gradient(760px 520px at 88% 8%,rgba(168,85,247,.42),transparent 62%),
    radial-gradient(700px 520px at 62% 112%,rgba(34,211,238,.26),transparent 60%),
    radial-gradient(560px 420px at -6% -12%,rgba(91,140,255,.22),transparent 60%),#080c1a}
.grad{background:linear-gradient(135deg,#22d3ee 0%,#5b8cff 45%,#a855f7 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.text{position:absolute;left:72px;top:88px;width:780px}
.brand{display:flex;align-items:center;gap:18px;font:800 46px/1 Sora,Inter,sans-serif;letter-spacing:.04em}
.tile{width:64px;height:64px;border-radius:15px;background:linear-gradient(135deg,#22d3ee 0%,#5b8cff 45%,#a855f7 100%)}
h1{margin-top:48px;font:800 68px/1.1 Sora,Inter,sans-serif;letter-spacing:-.015em}
ul{margin-top:44px;list-style:none}
li{display:flex;align-items:center;gap:16px;margin-top:18px;font:500 29px/1.2 Inter,sans-serif;color:#c9d3ee}
li svg{flex:none;width:34px;height:34px}
.art{position:absolute;right:0;top:0;width:470px;height:100%}
.icon{position:absolute;left:150px;top:205px;width:230px;height:230px;border-radius:51px;
  background:linear-gradient(135deg,#22d3ee 0%,#5b8cff 45%,#a855f7 100%);
  box-shadow:0 40px 90px -30px rgba(91,140,255,.75),0 0 0 1px rgba(255,255,255,.12) inset}
</style></head>
<body>
<div class="text">
  <div class="brand"><svg class="tile" viewBox="-0.316 -0.866 25.532 25.532">${SWALLOW}</svg>${esc(brand.name)}</div>
  <h1>${tagline}</h1>
  <ul>${brand.points.map((p) => `<li><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(52,211,153,.16)"/><path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#34d399" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>${esc(p)}</li>`).join('')}</ul>
</div>
<div class="art">
  <svg width="470" height="630" viewBox="0 0 470 630" fill="none">
    <path d="M-30 560C70 520 120 470 180 430" stroke="rgba(234,240,255,.28)" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>
    <path d="M330 220C380 160 420 110 500 70" stroke="rgba(234,240,255,.28)" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>
    <circle cx="70" cy="527" r="7" fill="#22d3ee"/><circle cx="70" cy="527" r="16" stroke="rgba(34,211,238,.35)" stroke-width="2"/>
  </svg>
  <svg class="icon" viewBox="-0.316 -0.866 25.532 25.532">${SWALLOW}</svg>
</div>
</body></html>
`;
}

/** Otisk šablony s texty – zapíše se do PNG a test ho porovná s brand.js. */
export const ogSource = (brand = BRAND) => createHash('sha256').update(ogHtml(brand)).digest('hex').slice(0, 16);

/** Bloky PNG → { type: data } (pro tEXt { klíč: hodnota }). */
export function pngChunks(buf) {
  const out = { text: {} };
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'tEXt') { const i = data.indexOf(0); out.text[data.toString('latin1', 0, i)] = data.toString('latin1', i + 1); }
    else out[type] = data;
    off += 12 + len;
  }
  return out;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * PNG z Chromia → s blokem tEXt key=value hned za IHDR a obrazovými daty znovu zkomprimovanými naplno (zlib 9, ~15 %
 * méně – WhatsApp a Messenger větší náhled než ~300 kB nemusí ukázat). Pixely ani filtry řádků se nemění.
 */
export function finishPng(png, key, value) {
  const chunks = [], idat = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off), type = png.toString('ascii', off + 4, off + 8), data = png.subarray(off + 8, off + 8 + len);
    if (type === 'IDAT') idat.push(data);
    else if (!(type === 'tEXt' && data.toString('latin1', 0, data.indexOf(0)) === key)) chunks.push([type, data]);
    off += 12 + len;
  }
  const out = [png.subarray(0, 8)];
  for (const [type, data] of chunks) {
    if (type === 'IEND') out.push(chunk('IDAT', zlib.deflateSync(zlib.inflateSync(Buffer.concat(idat)), { level: 9, memLevel: 9 })));
    out.push(chunk(type, data));
    if (type === 'IHDR') out.push(chunk('tEXt', Buffer.from(`${key}\0${value}`, 'latin1')));
  }
  return Buffer.concat(out);
}

/** Sora a Inter z Google Fonts jen se znaky z textů, vložené jako data: (Chromium pak nic nestahuje). */
async function fontsCss(brand) {
  const chars = [...new Set([brand.name, brand.tagline, ...brand.points].join('') + '0123456789')].join('');
  const api = `https://fonts.googleapis.com/css2?family=Inter:wght@500&family=Sora:wght@800&display=block&text=${encodeURIComponent(chars)}`;
  // s User-Agentem prohlížeče dá Google WOFF2 (jinak TTF)
  const ua = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
  let css = await (await fetch(api, { headers: ua, signal: AbortSignal.timeout(15e3) })).text();
  for (const [, url] of [...css.matchAll(/url\((https:[^)]+)\)/g)]) {
    const res = await fetch(url, { headers: ua, signal: AbortSignal.timeout(15e3) });
    if (!res.ok) throw new Error(`písmo ${res.status}`);
    css = css.replace(url, `data:font/woff2;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`);
  }
  if (!/@font-face/.test(css)) throw new Error('Google Fonts nevrátil @font-face');
  return css;
}

/** Playwright z projektu, jinak z globální instalace (npm root -g). */
async function playwright() {
  try {
    return await import('playwright');
  } catch {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
    return import(pathToFileURL(path.join(g, 'playwright', 'index.mjs')).href);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let fonts = '';
  try {
    fonts = await fontsCss(BRAND);
  } catch (e) {
    console.warn(`Písma Sora a Inter se nepodařilo stáhnout (${e.message}) – fotím se systémovým písmem.`);
  }
  const { chromium } = await playwright();
  const browser = await chromium.launch();
  try {
    const { width, height } = BRAND.image;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(ogHtml(BRAND).replace('/*FONTS*/', () => fonts), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = finishPng(await page.screenshot({ type: 'png' }), TEXT_KEY, ogSource(BRAND));
    writeFileSync(OUT, png);
    console.log(`${path.relative(root, OUT)}: ${width}×${height}, ${(png.length / 1024).toFixed(0)} kB`);
  } finally {
    await browser.close();
  }
}
