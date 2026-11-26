#!/usr/bin/env node
// Ikony aplikace na ploše (PWA) do public/icons/ – ikona Letsi: kukátko na dlaždici Pistácie (balík identity Letsi 2.1,
// složka ikona/). Hotová PNG z balíku se do public/icons/ kopírují beze změny (MASTERS); chybějící velikosti tenhle
// skript dopočítá zmenšením na polovinu a nakreslí úvodní obrazovky iOS. Bez závislostí: PNG čte i zapisuje přes node:zlib.
//
//   node scripts/build-icons.mjs        (= npm run build:icons)
//
//  icon-1024.png, icon-192.png    „any“ – z balíku (ikona s průhlednými rohy)
//  icon-maskable-512.png          „maskable“ – z balíku (icon-512-maskable.png): Pistácie do krajů, znak v bezpečné zóně
//  apple-touch-icon.png           180 × 180 pro iPhone a iPad – z balíku (apple-touch-icon-180.png), bez průhlednosti
//  icon-512.png                   „any“ – icon-1024.png zmenšená na polovinu (průměr 2 × 2 pixelů)
//  icon-96.png                    zkratky v manifestu a ikona u výsledku vyhledávání – icon-192.png zmenšená na polovinu
//  splash/<š>x<v>.png             úvodní obrazovky aplikace na ploše iPhonu a iPadu (apple-touch-startup-image, viz SPLASH)
//  splash/<š>x<v>-tmava.png       totéž v tmavém režimu (Noc)
//                                 + jejich odkazy v public/index.html mezi značkami <!-- ios-splash --> a <!-- /ios-splash -->
//
// Výpočet je deterministický – test/pwa.test.js ověřuje, že uložené PNG odpovídají tomuto skriptu. Nová ikona z balíku:
// zkopírovat MASTERS do public/icons/ pod jejich názvy a skript spustit znovu.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const OUT_DIR = path.join(root, 'public', 'icons');

// Vápno #F3F4F0 = pozadí aplikace ve světlém režimu = background_color v manifestu (úvodní obrazovka Androidu)
export const BG = [0xf3, 0xf4, 0xf0];
// Noc #14161F = pozadí aplikace v tmavém režimu (#launch v tmavém motivu) – tmavá úvodní obrazovka iOS
export const BG_DARK = [0x14, 0x16, 0x1f];
/** Hotové ikony z balíku Letsi (ikona/) → název v public/icons/. */
export const MASTERS = { 'icon-1024.png': 'icon-1024.png', 'icon-192.png': 'icon-192.png', 'icon-512-maskable.png': 'icon-maskable-512.png', 'apple-touch-icon-180.png': 'apple-touch-icon.png' };
/** Dopočítané ikony: soubor ← zdroj v public/icons/ zmenšený na polovinu. */
export const DERIVED = [{ file: 'icon-512.png', from: 'icon-1024.png' }, { file: 'icon-96.png', from: 'icon-192.png' }];

/*
 * Úvodní obrazovka aplikace na ploše iPhonu a iPadu: iOS ji ukáže od klepnutí na ikonu do prvního vykreslení stránky –
 * bez ní tam svítí bílá. Jen pozadí Vápno (BG, jako #launch ve vzhledu Letsi ve světlém režimu), v tmavém režimu
 * systému Noc (BG_DARK) – jinak by před tmavým #launch problikla světlá plocha; logo dokreslí #launch
 * hned po načtení. Poloha ikony na displeji záleží na výšce stavového řádku (styl „black“ posouvá stránku pod něj) –
 * obrázek s ikonou o kousek vedle by při prvním vykreslení poskočil. iOS vezme jen obrázek přesně v rozlišení displeje
 * (media v index.html), proto jeden na každý displej: [šířka, výška v CSS px na výšku, poměr pixelů, i na šířku?].
 */
export const SPLASH = [
  // iPhone (jen na výšku): SE 1, 6s–8 a SE 2/3, Plus, X–13 mini, XR a 11, XS Max a 11 Pro Max, 12–14 a 16e,
  // 12–14 Pro Max a 14 Plus, 14 Pro–16, 14 Pro Max–16 Plus, 16 Pro a 17, 16 Pro Max a 17 Pro Max, Air
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3], [390, 844, 3],
  [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3], [420, 912, 3],
  // iPad (na výšku i na šířku): 9,7", mini 6/7, 10,2", Air 4/5 a 10./11. generace, 10,5", Pro 11", Pro 11" M4,
  // 12,9" a Air 13", Pro 13" M4
  [768, 1024, 2, true], [744, 1133, 2, true], [810, 1080, 2, true], [820, 1180, 2, true], [834, 1112, 2, true],
  [834, 1194, 2, true], [834, 1210, 2, true], [1024, 1366, 2, true], [1032, 1376, 2, true],
];

/**
 * Úvodní obrazovky: soubor, rozměry v pixelech, barva a media dotaz pro <link rel="apple-touch-startup-image">. Ke každé
 * světlé hned tmavá; prefers-color-scheme light / dark se vylučují, takže Safari (bere první odpovídající) vybere podle
 * režimu systému bez ohledu na pořadí.
 */
export const splashImages = () => SPLASH.flatMap(([w, h, ratio, both]) => ['portrait', ...(both ? ['landscape'] : [])].flatMap((o) => {
  const [pw, ph] = o === 'portrait' ? [w * ratio, h * ratio] : [h * ratio, w * ratio];
  const media = `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${o})`;
  return [
    { file: `splash/${pw}x${ph}.png`, width: pw, height: ph, bg: BG, media: `${media} and (prefers-color-scheme: light)` },
    { file: `splash/${pw}x${ph}-tmava.png`, width: pw, height: ph, bg: BG_DARK, media: `${media} and (prefers-color-scheme: dark)` },
  ];
}));

/** Odkazy na úvodní obrazovky do index.html (mezi značkami). */
export const splashLinks = () => ['<!-- ios-splash: úvodní obrazovky aplikace na ploše iPhonu a iPadu – scripts/build-icons.mjs -->',
  ...splashImages().map((s) => `<link rel="apple-touch-startup-image" media="${s.media}" href="icons/${s.file}">`), '<!-- /ios-splash -->'].join('\n');

/* ---------- PNG ---------- */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Jednobarevné PNG: paleta s jedinou barvou, 1 bit na pixel (samé nuly) – i 2 752 × 2 064 má jen pár set bajtů. */
export function solidPng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1; // bitová hloubka
  ihdr[9] = 3; // paleta
  const rows = Buffer.alloc((1 + Math.ceil(width / 8)) * height); // filtr 0 a barva 0 z palety v každém řádku
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(rgb)), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** RGBA → PNG (bez průhlednosti jako RGB). Každý řádek s filtrem, který dá nejmenší součet rozdílů (běžná heuristika). */
export function encodePng(rgba, size) {
  let opaque = true;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { opaque = false; break; }
  const bpp = opaque ? 3 : 4;
  const stride = size * bpp;
  const rows = [];
  let prev = new Uint8Array(stride);
  for (let y = 0; y < size; y++) {
    const line = new Uint8Array(stride);
    for (let x = 0; x < size; x++) for (let j = 0; j < bpp; j++) line[x * bpp + j] = rgba[(y * size + x) * 4 + j];
    let best = null, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = new Uint8Array(stride + 1);
      out[0] = f;
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (line[i] - pred) & 0xff;
        out[i + 1] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = out; }
    }
    rows.push(best);
    prev = line;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bitová hloubka
  ihdr[9] = opaque ? 2 : 6; // RGB / RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** PNG (8 bitů, RGB nebo RGBA, bez prokládání) → { width, height, px } s pixely RGBA. */
export function decodePng(buf) {
  let ihdr = null;
  const idat = [];
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (!ihdr || ihdr.depth !== 8 || ![2, 6].includes(ihdr.color) || ihdr.interlace) throw new Error('PNG: jen 8bitové RGB/RGBA bez prokládání');
  const { width, height } = ihdr, bpp = ihdr.color === 6 ? 4 : 3, stride = width * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      line[i] = (raw[y * (stride + 1) + 1 + i] + pred) & 0xff;
    }
    for (let x = 0; x < width; x++) for (let j = 0; j < 4; j++) px[(y * width + x) * 4 + j] = j < bpp ? line[x * bpp + j] : 255;
    prev = line;
  }
  return { width, height, px };
}

/**
 * Zmenšení na polovinu: průměr bloku 2 × 2. Barva vážená krytím (jinak by průhledné pixely rohů, které mají barvu
 * černou, ztmavily okraj dlaždice).
 */
export function halve({ width, height, px }) {
  const w = width >> 1, h = height >> 1, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      const c = [0, 0, 0];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const o = ((2 * y + dy) * width + 2 * x + dx) * 4;
        a += px[o + 3];
        for (let j = 0; j < 3; j++) c[j] += px[o + j] * px[o + 3];
      }
      const o = (y * w + x) * 4;
      for (let j = 0; j < 3; j++) out[o + j] = a ? Math.round(c[j] / a) : 0;
      out[o + 3] = Math.round(a / 4);
    }
  }
  return { width: w, height: h, px: out };
}

/** Dopočítaná ikona z uložených souborů v dir → PNG. */
export const derivedPng = ({ from }, dir = OUT_DIR) => {
  const img = halve(decodePng(readFileSync(path.join(dir, from))));
  return encodePng(img.px, img.width);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const d of DERIVED) {
    const png = derivedPng(d);
    writeFileSync(path.join(OUT_DIR, d.file), png);
    console.log(`${d.file} ← ${d.from}: ${(png.length / 1024).toFixed(1)} kB`);
  }
  mkdirSync(path.join(OUT_DIR, 'splash'), { recursive: true });
  for (const s of splashImages()) writeFileSync(path.join(OUT_DIR, s.file), solidPng(s.width, s.height, s.bg));
  const index = path.join(root, 'public', 'index.html');
  const html = readFileSync(index, 'utf8');
  const block = /<!-- ios-splash[^\n]*-->\n(?:<link rel="apple-touch-startup-image"[^\n]*\n)*<!-- \/ios-splash -->/;
  if (!block.test(html)) throw new Error('public/index.html: chybí značky <!-- ios-splash … --> a <!-- /ios-splash -->');
  writeFileSync(index, html.replace(block, splashLinks()));
  console.log(`splash/: ${splashImages().length} úvodních obrazovek pro iOS (světlé i tmavé), odkazy v public/index.html`);
}
