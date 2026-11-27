#!/usr/bin/env node
// Ikony aplikace na ploše (PWA) do public/icons/ – ikona Letsi: kukátko na dlaždici Pistácie (balík identity Letsi 2.1,
// složka ikona/). Znak bere z ikony balíku (scripts/balik/icon-1024.png) a každou velikost z manifestu přepočítá jako
// plný čtverec Pistácie se znakem na 60 % šířky; nakreslí i úvodní obrazovky iOS. Bez závislostí: PNG čte i zapisuje
// přes node:zlib.
//
//   node scripts/build-icons.mjs        (= npm run build:icons)
//
//  icon-1024/512/192.png          „any“ – plný čtverec bez průhledných rohů: launchery (MIUI ap.) ikonu s průhledností
//                                 zvětší, ořežou a zaoblí po svém, a pak znak naráží na okraje; plný čtverec jen zaoblí
//  icon-maskable-512.png          „maskable“ – totéž; znak 60 % je celý i v kruhu 80 % (bezpečná zóna masky)
//  icon-96.png                    zkratky v manifestu a ikona u výsledku vyhledávání – totéž v 96 px
//  apple-touch-icon.png           180 × 180 pro iPhone a iPad – z balíku (apple-touch-icon-180.png), beze změny
//  splash/<š>x<v>.png             úvodní obrazovky aplikace na ploše iPhonu a iPadu (apple-touch-startup-image, viz SPLASH)
//  splash/<š>x<v>-tmava.png       totéž v tmavém režimu (Noc)
//                                 + jejich odkazy v public/index.html mezi značkami <!-- ios-splash --> a <!-- /ios-splash -->
//
// Výpočet je deterministický – test/pwa.test.js ověřuje, že uložené PNG odpovídají tomuto skriptu. Nová ikona z balíku:
// icon-1024.png do scripts/balik/ (apple-touch-icon-180.png do public/icons/apple-touch-icon.png) a skript spustit znovu.
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
export const MASTERS = { 'apple-touch-icon-180.png': 'apple-touch-icon.png' };
/** Ikona z balíku (s průhlednými rohy, znak ~70 % šířky) – zdroj znaku pro ICONS. */
export const SOURCE = path.join(root, 'scripts', 'balik', 'icon-1024.png');
// Pistácie #D6DE82 = dlaždice ikony
export const TILE = [0xd6, 0xde, 0x82];
/** Šířka znaku v ikoně: 60 % jako úvodní obrazovka (#launch .l-tile v index.html) – v kruhu i squircle s rezervou. */
export const MARK = 0.6;
/** Ikony z manifestu (any, maskable a zkratky): soubor a strana v pixelech. */
export const ICONS = [
  { file: 'icon-1024.png', size: 1024 }, { file: 'icon-512.png', size: 512 }, { file: 'icon-192.png', size: 192 },
  { file: 'icon-maskable-512.png', size: 512 }, { file: 'icon-96.png', size: 96 },
];

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

/** Je pixel (RGBA) znak, ne dlaždice? Průhledné rohy ikony z balíku patří k dlaždici. */
const isMark = (px, o) => px[o + 3] > 127 && Math.abs(px[o] - TILE[0]) + Math.abs(px[o + 1] - TILE[1]) + Math.abs(px[o + 2] - TILE[2]) > 24;

/** Ohraničení znaku { x0, y0, x1, y1 } (x1, y1 za posledním pixelem). */
export function markBox({ width, height, px }) {
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (isMark(px, (y * width + x) * 4)) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  return { x0, y0, x1, y1 };
}

/**
 * Ikona size × size: dlaždice zdroje zmenšená kolem středu tak, aby znak měl MARK šířky (svislé optické posazení znaku
 * z balíku se zmenší s ním), všude kolem plná Pistácie. Zmenšení = průměr plochy, kterou pixel pokryje ve zdroji
 * (váhy podle překryvu, zvlášť ve vodorovném a svislém směru); průhledné pixely zdroje počítá jako Pistácii.
 */
export function iconPng(size, src = decodePng(readFileSync(SOURCE))) {
  const { width, height, px } = src, box = markBox(src), k = (box.x1 - box.x0) / (MARK * size);
  // pro každý pixel výstupu seznam [index ve zdroji, váha]; mimo zdroj nic (doplní se Pistácie)
  const weights = (n, len) => Array.from({ length: size }, (_, i) => {
    const a = n / 2 + (i - size / 2) * k, b = a + k, out = [];
    for (let j = Math.max(0, Math.floor(a)); j < Math.min(len, Math.ceil(b)); j++) out.push([j, (Math.min(b, j + 1) - Math.max(a, j)) / k]);
    return out;
  });
  const wx = weights(width, width), wy = weights(height, height), rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = [0, 0, 0];
    let w = 0;
    for (const [sy, vy] of wy[y]) for (const [sx, vx] of wx[x]) {
      const o = (sy * width + sx) * 4, v = vy * vx, t = px[o + 3] / 255;
      for (let j = 0; j < 3; j++) c[j] += v * (px[o + j] * t + TILE[j] * (1 - t));
      w += v;
    }
    const o = (y * size + x) * 4;
    for (let j = 0; j < 3; j++) rgba[o + j] = Math.round(c[j] + TILE[j] * (1 - w));
    rgba[o + 3] = 255;
  }
  return encodePng(rgba, size);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT_DIR, { recursive: true });
  const src = decodePng(readFileSync(SOURCE));
  for (const { file, size } of ICONS) {
    const png = iconPng(size, src);
    writeFileSync(path.join(OUT_DIR, file), png);
    console.log(`${file}: ${size} px, ${(png.length / 1024).toFixed(1)} kB`);
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
