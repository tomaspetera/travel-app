// Nezávislý dekodér QR kódu pro testy (test/qr.test.js, test/transfer.test.js): matice modulů → bajty. Napsaný podle
// normy jinou cestou než kodér public/js/qr.js (čtení formátu a verze po vzoru zxing, masky v jiném tvaru, mapa
// funkčních vzorů po oblastech, zarovnávací vzory jiným vzorcem) – chyba v kodéru se tu neschová za stejnou chybu.
// Ověří formát (BCH) i verzi (Golay) proti platným kódovým slovům, Reed–Solomon (syndromy všech bloků = 0)
// a strukturu dat (bajtový režim, ukončení, výplň 0xEC 0x11).

// GF(256) s polynomem 0x11D
const EXP = [], LOG = [];
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = (x << 1) ^ (x & 0x80 ? 0x11d : 0); x &= 0xff; }
const gmul = (a, b) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);

// opravných bajtů v bloku a počet bloků (ISO/IEC 18004 tab. 9) – L a M; ověřeno proti kapacitám a referenčním maticím
const ECC = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
};
const BLOCKS = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
};
const ECL_OF = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };
// masky jako v zxing DataMask (i = řádek, j = sloupec)
const MASK = [
  (i, j) => ((i + j) & 1) === 0,
  (i) => (i & 1) === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => ((Math.floor(i / 2) + Math.floor(j / 3)) & 1) === 0,
  (i, j) => (i * j) % 6 === 0,
  (i, j) => (i * j) % 6 < 3,
  (i, j) => ((i + j + ((i * j) % 3)) & 1) === 0,
];

/** Platná slova formátu (32) a verze (7–40) spočítaná dělením polynomů zvlášť od kodéru. */
const bchRem = (val, gen, genDeg) => { let v = val << genDeg; for (let b = 31; b >= genDeg; b--) if ((v >>> b) & 1) v ^= gen << (b - genDeg); return v; };
const FORMATS = [];
for (let d = 0; d < 32; d++) FORMATS.push({ d, bits: ((d << 10) | bchRem(d, 0b10100110111, 10)) ^ 0b101010000010010 });
const VERSIONS = [];
for (let v = 7; v <= 40; v++) VERSIONS.push({ v, bits: (v << 12) | bchRem(v, 0b1111100100101, 12) });
const hamming = (a, b) => { let x = a ^ b, n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };
const nearest = (list, bits) => list.reduce((m, f) => (hamming(f.bits, bits) < m.dist ? { f, dist: hamming(f.bits, bits) } : m), { f: null, dist: 99 });

/** Středy zarovnávacích vzorů jiným vzorcem než v kodéru (stejný výsledek jako tabulka normy). */
function alignment(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, size = v * 4 + 17;
  const step = Math.floor((v * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
  const out = [6];
  for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p);
  return out;
}

/** Matice (pole řádků '0'/'1', nebo { size, modules }) → { version, ecl, mask, bytes, text }; jinak výjimka. */
export function decode(input) {
  const size = Array.isArray(input) ? input.length : input.size;
  const at = Array.isArray(input) ? (x, y) => input[y][x] === '1' || input[y][x] === 1 : (x, y) => input.modules[y * size + x] === 1;
  const version = (size - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 40) throw new Error(`velikost ${size} není QR kód`);
  // formát: obě kopie, nejbližší platné slovo (oprava až 3 chyb)
  let f1 = 0, f2 = 0;
  const bit = (x, y, v) => (v << 1) | (at(x, y) ? 1 : 0);
  for (let x = 0; x < 6; x++) f1 = bit(x, 8, f1);
  f1 = bit(7, 8, f1); f1 = bit(8, 8, f1); f1 = bit(8, 7, f1);
  for (let y = 5; y >= 0; y--) f1 = bit(8, y, f1);
  for (let y = size - 1; y >= size - 7; y--) f2 = bit(8, y, f2);
  for (let x = size - 8; x < size; x++) f2 = bit(x, 8, f2);
  const n1 = nearest(FORMATS, f1), n2 = nearest(FORMATS, f2);
  const best = n1.dist <= n2.dist ? n1 : n2;
  if (best.dist > 3) throw new Error('nečitelný formát');
  const ecl = ECL_OF[best.f.d >> 3], mask = best.f.d & 7;
  if (!ECC[ecl]) throw new Error(`úroveň ${ecl} dekodér nezná`);
  if (version >= 7) {
    let vb = 0;
    for (let y = 5; y >= 0; y--) for (let x = size - 9; x >= size - 11; x--) vb = bit(x, y, vb);
    const nv = nearest(VERSIONS, vb);
    if (nv.dist > 3 || nv.f.v !== version) throw new Error(`verze ${nv.f && nv.f.v} neodpovídá velikosti`);
  }
  // funkční vzory po oblastech (jako zxing buildFunctionPattern)
  const fn = new Uint8Array(size * size);
  const region = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) fn[y * size + x] = 1; };
  region(0, 0, 9, 9); region(size - 8, 0, 8, 9); region(0, size - 8, 9, 8);
  const al = alignment(version), last = al.length - 1;
  al.forEach((x, i) => al.forEach((y, j) => { if (!((i === 0 && (j === 0 || j === last)) || (i === last && j === 0))) region(x - 2, y - 2, 5, 5); }));
  region(6, 9, 1, size - 17); region(9, 6, size - 17, 1);
  if (version >= 7) { region(size - 11, 0, 3, 6); region(0, size - 11, 6, 3); }
  // kódová slova: dvojsloupce zprava, nahoru a dolů, bez sloupce 6; odmaskovaná
  const raw = [];
  let cur = 0, nb = 0, up = true;
  for (let j = size - 1; j > 0; j -= 2) {
    if (j === 6) j--;
    for (let c = 0; c < size; c++) {
      const i = up ? size - 1 - c : c;
      for (let k = 0; k < 2; k++) {
        const x = j - k;
        if (fn[i * size + x]) continue;
        cur = (cur << 1) | ((at(x, i) ? 1 : 0) ^ (MASK[mask](i, x) ? 1 : 0));
        if (++nb === 8) { raw.push(cur); cur = 0; nb = 0; }
      }
    }
    up = !up;
  }
  // bloky: krátké napřed, dlouhé (o bajt dat víc) na konci; data prokládaná po sloupcích, pak oprava
  const total = raw.length, ecLen = ECC[ecl][version - 1], nBlocks = BLOCKS[ecl][version - 1];
  const shortData = Math.floor(total / nBlocks) - ecLen, nLong = total % nBlocks;
  const blocks = Array.from({ length: nBlocks }, (_, b) => ({ data: [], ec: [], len: shortData + (b >= nBlocks - nLong ? 1 : 0) }));
  let p = 0;
  for (let i = 0; i <= shortData; i++) for (const b of blocks) if (i < b.len) b.data.push(raw[p++]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) b.ec.push(raw[p++]);
  if (p !== total) throw new Error('nesedí počet kódových slov');
  for (const b of blocks) {
    const cw = [...b.data, ...b.ec];
    for (let r = 0; r < ecLen; r++) { // syndrom S_r = c(α^r), Hornerovo schéma
      let s = 0;
      for (const c of cw) s = gmul(s, EXP[r]) ^ c;
      if (s) throw new Error('Reed–Solomon: nenulový syndrom');
    }
  }
  const data = blocks.flatMap((b) => b.data);
  // bitový proud: režim 0100, délka, bajty, ukončení 0000 (může být zkrácené), nuly do bajtu, výplň 0xEC 0x11
  let bp = 0;
  const read = (n) => { let v = 0; for (let i = 0; i < n; i++, bp++) v = (v << 1) | ((data[bp >> 3] >> (7 - (bp & 7))) & 1); return v; };
  if (read(4) !== 4) throw new Error('jen bajtový režim');
  const len = read(version < 10 ? 8 : 16), bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = read(8);
  const left = data.length * 8 - bp;
  if (read(Math.min(4, left)) !== 0) throw new Error('chybí ukončení');
  if (bp % 8 && read(8 - (bp % 8)) !== 0) throw new Error('doplnění do bajtu není nulové');
  for (let i = bp / 8, pad = 0xec; i < data.length; i++, pad ^= 0xec ^ 0x11) if (data[i] !== pad) throw new Error('špatná výplň');
  return { version, ecl, mask, bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
}

/** SVG z QR.svg (cesta z pruhů „M x y h w v1 h-w z“, tichá zóna quiet) → { size, modules } – co prohlížeč vykreslí. */
export function fromSvg(svg, quiet = 4) {
  const n = +/viewBox="0 0 (\d+) \1"/.exec(svg)[1], size = n - quiet * 2;
  const modules = new Uint8Array(size * size);
  const d = /<path[^>]* d="([^"]*)"/.exec(svg)[1];
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    const x = +m[1] - quiet, y = +m[2] - quiet, w = +m[3];
    for (let i = 0; i < w; i++) modules[y * size + x + i] = 1;
  }
  return { size, modules };
}
