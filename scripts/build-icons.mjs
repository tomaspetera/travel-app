#!/usr/bin/env node
// Ikony aplikace na ploše (PWA) do public/icons/ – stejná značka jako favicon v index.html: čtverec s přechodem
// barev ATLAS (--grad v public/css/atlas.css) a bílé papírové letadlo (odstín na spodním křídle = přehyb).
// Bez závislostí: tvary se vykreslí po pixelech s vyhlazením (8 × 8 vzorků na pixel) a PNG se zakóduje přes node:zlib.
//
//   node scripts/build-icons.mjs        (= npm run build:icons)
//
//  icon-192.png, icon-512.png  „any“ – zaoblený čtverec s průhlednými rohy (Chrome a Edge na počítači, Android bez masky)
//  icon-maskable-512.png       „maskable“ – bez průhlednosti: přechod přes celou plochu, jen rohy zaoblené (0,17 strany)
//                              v barvě pozadí aplikace (#080c1a), letadlo v bezpečné zóně. Na ploše a v přehledu aplikací
//                              ho Android ořízne do kruhu či zaobleného čtverce (Xiaomi ukáže skoro celou plochu – rohy
//                              ořízne zaoblením aspoň 0,17, takže je vidět jen přechod); na úvodní obrazovce ho Chrome
//                              ukáže celý – tmavé rohy splynou s pozadím a zbude zaoblená ikona.
//  apple-touch-icon.png        180 × 180 pro iPhone a iPad – bez průhlednosti (rohy zaoblí iOS sám)
//  icon-96.png                 zkratky v manifestu (dlouhé podržení ikony na Androidu)
//  splash/<š>x<v>.png          úvodní obrazovky aplikace na ploše iPhonu a iPadu (apple-touch-startup-image, viz SPLASH)
//                              + jejich odkazy v public/index.html mezi značkami <!-- ios-splash --> a <!-- /ios-splash -->
//
// Výpočet je deterministický (jen sčítání, násobení a porovnání) – test/pwa.test.js ověřuje, že uložené PNG
// odpovídají tomuto skriptu, takže po změně vzhledu stačí skript znovu spustit.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const OUT_DIR = path.join(root, 'public', 'icons');

// --grad z atlas.css: linear-gradient(135deg, #22d3ee 0%, #5b8cff 45%, #a855f7 100%) – u čtverce z levého horního rohu do pravého dolního
const STOPS = [[0, [0x22, 0xd3, 0xee]], [0.45, [0x5b, 0x8c, 0xff]], [1, [0xa8, 0x55, 0xf7]]];
// Letadlo z faviconu (viewBox 24 × 24): M20 6 l-7 13 -3 -6 -6 -3 z → špička A, spodní křídlo B, přehyb C, horní křídlo D
const A = [20, 6], B = [13, 19], C = [10, 13], D = [4, 10];
const TOP_WING = [A, C, D]; // bílé
const LOW_WING = [A, B, C]; // bílá s 80 % krytím – přehyb papíru
const LOW_ALPHA = 0.8;
// Kotva letadla: střed mezi středem obrysu (12; 12,5) a těžištěm plochy (12,9; 11,25) – opticky uprostřed.
export const ANCHOR = [12.45, 11.9];

/**
 * Ikony: soubor, rozměr, zaoblení rohů (podíl strany, 0 = celá plocha), velikost letadla (1 = jako ve faviconu),
 * volitelně okraj kolem čtverce s přechodem (podíl strany) a barva pozadí v něm (jinak průhledné).
 */
export const BG = [0x08, 0x0c, 0x1a]; // --bg tmavého motivu = background_color v manifestu
export const ICONS = [
  { file: 'icon-192.png', size: 192, radius: 0.22, plane: 0.94 },
  { file: 'icon-512.png', size: 512, radius: 0.22, plane: 0.94 },
  { file: 'icon-96.png', size: 96, radius: 0.22, plane: 0.94 },
  { file: 'icon-maskable-512.png', size: 512, radius: 0.17, plane: 0.72, bg: BG },
  { file: 'apple-touch-icon.png', size: 180, radius: 0, plane: 0.86 },
];

/*
 * Úvodní obrazovka aplikace na ploše iPhonu a iPadu: iOS ji ukáže od klepnutí na ikonu do prvního vykreslení stránky –
 * bez ní tam svítí bílá. Jen pozadí úvodní obrazovky aplikace (#launch v index.html, BG); ikonu a název dokreslí #launch
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

/** Úvodní obrazovky: soubor, rozměry v pixelech a media dotaz pro <link rel="apple-touch-startup-image">. */
export const splashImages = () => SPLASH.flatMap(([w, h, ratio, both]) => ['portrait', ...(both ? ['landscape'] : [])].map((o) => {
  const [pw, ph] = o === 'portrait' ? [w * ratio, h * ratio] : [h * ratio, w * ratio];
  return { file: `splash/${pw}x${ph}.png`, width: pw, height: ph, media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${o})` };
}));

/** Odkazy na úvodní obrazovky do index.html (mezi značkami). */
export const splashLinks = () => ['<!-- ios-splash: úvodní obrazovky aplikace na ploše iPhonu a iPadu – scripts/build-icons.mjs -->',
  ...splashImages().map((s) => `<link rel="apple-touch-startup-image" media="${s.media}" href="icons/${s.file}">`), '<!-- /ios-splash -->'].join('\n');

const SS = 8; // vzorků na pixel v každém směru

function gradient(t) {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (t <= t1 || i === STOPS.length - 1) {
      const [t0, c0] = STOPS[i - 1];
      const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      return [0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k);
    }
  }
  return STOPS[0][1];
}

// Bod uvnitř trojúhelníku (stejné znaménko vektorových součinů; hrana se počítá dovnitř).
function inTri(x, y, [a, b, c]) {
  const d1 = (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
  const d2 = (x - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1]);
  const d3 = (x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function inRoundRect(x, y, w, r) {
  if (r <= 0) return x >= 0 && y >= 0 && x <= w && y <= w;
  if (x < 0 || y < 0 || x > w || y > w) return false;
  const cx = x < r ? r : x > w - r ? w - r : x;
  const cy = y < r ? r : y > w - r ? w - r : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Vzdálenost od hranice zaobleného čtverce (kladná venku, záporná uvnitř) a od úsečky – jen pro rozhodnutí,
// který pixel leží u hrany a potřebuje vzorkování (výsledek to nemění, jen zrychlí).
function roundRectDist(x, y, w, r) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r), qy = Math.abs(y - w / 2) - (w / 2 - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}
function segDist(x, y, [u, v]) {
  const dx = v[0] - u[0], dy = v[1] - u[1];
  const t = Math.min(1, Math.max(0, ((x - u[0]) * dx + (y - u[1]) * dy) / (dx * dx + dy * dy)));
  const ex = x - (u[0] + t * dx), ey = y - (u[1] + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}
const EDGES = [[A, C], [C, D], [D, A], [A, B], [B, C]];
const NEAR = 0.75; // px – víc než půl úhlopříčky pixelu: dál od všech hran mají všechny vzorky pixelu stejný výsledek

/** Vykreslí ikonu → RGBA (Uint8Array, size × size × 4, nepremultiplikované). */
export function renderIcon({ size, radius, plane, inset = 0, bg = null }) {
  const px = new Uint8Array(size * size * 4);
  const unit = (size / 24) * plane; // pixelů na jednotku faviconu
  // souřadnice pixelu → souřadnice letadla (viewBox faviconu)
  const toPlane = (v, i) => (v - size / 2) / unit + ANCHOR[i];
  const r = radius * size;
  const off = inset * size, w = size - 2 * off; // čtverec s přechodem: [off, off + w]
  const inRect = (x, y) => inRoundRect(x - off, y - off, w, r);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = gradient((x + 0.5 + y + 0.5) / (2 * size));
      let inside = 0, top = 0, low = 0;
      const cu = toPlane(x + 0.5, 0), cv = toPlane(y + 0.5, 1);
      const edge = ((r > 0 || off > 0) && Math.abs(roundRectDist(x + 0.5 - off, y + 0.5 - off, w, r)) < NEAR) || EDGES.some((e) => segDist(cu, cv, e) * unit < NEAR);
      if (!edge) {
        // celý pixel na jedné straně všech hran = stejně jako 8 × 8 vzorků se stejným výsledkem
        if (inRect(x + 0.5, y + 0.5)) {
          inside = n;
          if (inTri(cu, cv, TOP_WING)) top = n;
          else if (inTri(cu, cv, LOW_WING)) low = n;
        }
      } else {
        for (let sy = 0; sy < SS; sy++) {
          const yy = y + (sy + 0.5) / SS;
          for (let sx = 0; sx < SS; sx++) {
            const xx = x + (sx + 0.5) / SS;
            if (!inRect(xx, yy)) continue;
            inside++;
            const u = toPlane(xx, 0), v = toPlane(yy, 1);
            if (inTri(u, v, TOP_WING)) top++;
            else if (inTri(u, v, LOW_WING)) low++;
          }
        }
      }
      const o = (y * size + x) * 4;
      if (bg) {
        // neprůhledná ikona: mimo čtverec barva pozadí, na hraně jejich směs
        for (let j = 0; j < 3; j++) {
          const lowC = g[j] + (255 - g[j]) * LOW_ALPHA;
          px[o + j] = Math.round((g[j] * (inside - top - low) + 255 * top + lowC * low + bg[j] * (n - inside)) / n);
        }
        px[o + 3] = 255;
        continue;
      }
      if (!inside) continue;
      for (let j = 0; j < 3; j++) {
        const lowC = g[j] + (255 - g[j]) * LOW_ALPHA;
        const sum = g[j] * (inside - top - low) + 255 * top + lowC * low;
        px[o + j] = Math.round(sum / inside);
      }
      px[o + 3] = Math.round((inside / n) * 255);
    }
  }
  return px;
}

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const icon of ICONS) {
    const png = encodePng(renderIcon(icon), icon.size);
    writeFileSync(path.join(OUT_DIR, icon.file), png);
    console.log(`${icon.file}: ${icon.size}×${icon.size}, ${(png.length / 1024).toFixed(1)} kB`);
  }
  mkdirSync(path.join(OUT_DIR, 'splash'), { recursive: true });
  for (const s of splashImages()) writeFileSync(path.join(OUT_DIR, s.file), solidPng(s.width, s.height, BG));
  const index = path.join(root, 'public', 'index.html');
  const html = readFileSync(index, 'utf8');
  const block = /<!-- ios-splash[^\n]*-->\n(?:<link rel="apple-touch-startup-image"[^\n]*\n)*<!-- \/ios-splash -->/;
  if (!block.test(html)) throw new Error('public/index.html: chybí značky <!-- ios-splash … --> a <!-- /ios-splash -->');
  writeFileSync(index, html.replace(block, splashLinks()));
  console.log(`splash/: ${splashImages().length} úvodních obrazovek pro iOS, odkazy v public/index.html`);
}
