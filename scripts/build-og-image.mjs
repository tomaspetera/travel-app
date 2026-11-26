#!/usr/bin/env node
// Náhledový obrázek sdíleného odkazu (Open Graph a Twitter Card, 1200 × 630) do public/og-image.png: šablona v HTML
// níž v identitě Letsi 2.1 (plocha Pistácie, text Noc, logo a znak kukátka, písma Unbounded a Onest, texty ze
// server/brand.js) vyfocená v Chromiu přes Playwright. Po přejmenování nebo změně sloganu v brand.js stačí skript
// spustit znovu:
//
//   node scripts/build-og-image.mjs        (= npm run build:og)
//
// Playwright není závislost projektu (žádný npm install): skript ho vezme z globální instalace
// (npm i -g playwright && npx playwright install chromium). Písma bere z public/vendor/fonts/letsi a vloží je do
// šablony jako data: – síť nepotřebuje.
// Do PNG zapíše otisk šablony s texty (blok tEXt „og-source“) – test/seo.test.js podle něj pozná obrázek, který po
// změně brand.js nebo šablony nikdo znovu nevygeneroval. Obrázek kreslí obecný náhled: sdílené odkazy do aplikace
// (#trip=, #offer=…) nesou cestu za #, kterou roboti sociálních sítí nevidí.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BRAND } from '../server/brand.js';
import { crc32 } from './build-icons.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const OUT = path.join(root, 'public', BRAND.image.path);
export const TEXT_KEY = 'og-source';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Logo (Noc, slunce Rajče nad i – jediné slunce v obrázku) jako v aplikaci; znak kukátka v pozitivu na Pistácii
// (rám a zorničky Noc, okénka Vápno) je kopie letsi-znak.svg z balíku identity (znak/). Obojí na křivkách, bez písem.
const svgFile = (f) => readFileSync(path.join(root, f), 'utf8').replace(/<title>[^<]*<\/title>/, '').replace(/\s+role="img"\s+aria-label="[^"]*"/, '').trim();
const LOGO = svgFile('public/vendor/letsi/letsi-logo-hlavni.svg');
const ZNAK = svgFile('scripts/letsi-znak.svg');

/**
 * Šablona náhledu (bez písem – ta dosadí render místo FONTS). Text vlevo s okrajem 72 px (X ořízne na 2 : 1 jen
 * 15 px nahoře a dole), vpravo velký znak kukátka. Jednolitá Pistácie, žádné přechody ani stíny.
 */
export function ogHtml(brand = BRAND) {
  return `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8">
<style>/*FONTS*/</style>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${brand.image.width}px;height:${brand.image.height}px;overflow:hidden}
body{position:relative;background:#D6DE82;color:#14161F;font-family:Onest,"Segoe UI",Roboto,Arial,sans-serif}
.text{position:absolute;left:72px;top:76px;width:700px}
.logo{display:block;height:72px;width:auto}
h1{margin-top:52px;font:700 58px/1.12 Letsi,Onest,sans-serif;letter-spacing:-.03em;text-wrap:balance}
ul{margin-top:40px;list-style:none}
li{display:flex;align-items:center;gap:16px;margin-top:14px;font:500 29px/1.2 Onest,sans-serif}
li svg{flex:none;width:30px;height:30px}
.znak{position:absolute;right:72px;top:50%;width:330px;height:auto;transform:translateY(-50%)}
</style></head>
<body>
<div class="text">
  ${LOGO.replace('<svg ', `<svg class="logo" aria-label="${esc(brand.name)}" `)}
  <h1>${esc(brand.tagline)}</h1>
  <ul>${brand.points.map((p) => `<li><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#14161F" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${esc(p)}</li>`).join('')}</ul>
</div>
${ZNAK.replace('<svg ', '<svg class="znak" aria-hidden="true" ')}
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

/** Playwright z projektu, jinak z globální instalace (npm root -g). */
async function playwright() {
  try {
    return await import('playwright');
  } catch {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
    return import(pathToFileURL(path.join(g, 'playwright', 'index.mjs')).href);
  }
}


/** Unbounded (font-family Letsi, jako css/letsi.css) a Onest z public/vendor/fonts/letsi jako data: – Chromium nic nestahuje. */
function fontsCss() {
  const face = (family, weight, file) => `@font-face{font-family:'${family}';font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${readFileSync(path.join(root, 'public/vendor/fonts/letsi', file)).toString('base64')}) format('woff2')}`;
  return [face('Letsi', 700, 'unbounded-700.woff2'), face('Onest', 500, 'onest-500.woff2')].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { chromium } = await playwright();
  const browser = await chromium.launch();
  try {
    const { width, height } = BRAND.image;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(ogHtml(BRAND).replace('/*FONTS*/', () => fontsCss()), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = finishPng(await page.screenshot({ type: 'png' }), TEXT_KEY, ogSource(BRAND));
    writeFileSync(OUT, png);
    console.log(`${path.relative(root, OUT)}: ${width}×${height}, ${(png.length / 1024).toFixed(0)} kB`);
  } finally {
    await browser.close();
  }
}
