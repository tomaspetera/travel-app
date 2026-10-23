/* ATLAS – QR kód pro 📲 Přenést do jiného zařízení (transfer.js): vlastní kodér podle ISO/IEC 18004 bez knihovny.
   Jen to, co přenos potřebuje: bajtový režim (odkaz v UTF-8), oprava chyb M (snese ~15 % poškozených modulů – odlesk
   displeje, rozmazání), a když se odkaz do M nevejde, L (~7 %), verze 1–40 podle délky (nejmenší, do které se data vejdou).
   Výsledek je matice modulů; svg() z ní udělá jednu cestu <path> (pruhy po řádcích) s tichou zónou 4 modulů.
   Kodér je čistý (žádný DOM) – test/qr.test.js ho porovnává s publikovanými příklady (Reed–Solomon, formát, verze,
   kapacity) a s maticemi z referenčního kodéru a celý kód zpětně dekóduje. */
(function () {
  /* ---------- Galoisovo těleso GF(256), primitivní polynom x⁸+x⁴+x³+x²+1 (0x11D) ---------- */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; // násobení bez modulo 255
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  /** Generátor Reed–Solomona stupně n: (x − α⁰)(x − α¹)…(x − αⁿ⁻¹), koeficienty od nejvyšší mocniny (bez vedoucí 1). */
  const gens = new Map();
  function generator(n) {
    if (gens.has(n)) return gens.get(n);
    const g = new Uint8Array(n);
    g[n - 1] = 1;
    for (let i = 0, root = 1; i < n; i++) {
      for (let j = 0; j < n; j++) {
        g[j] = mul(g[j], root);
        if (j + 1 < n) g[j] ^= g[j + 1];
      }
      root = mul(root, 2);
    }
    gens.set(n, g);
    return g;
  }
  /** Opravné kódové slovo: zbytek dělení dat (·xⁿ) generátorem → n bajtů. */
  function rs(data, n) {
    const g = generator(n), r = new Uint8Array(n);
    for (const b of data) {
      const f = b ^ r[0];
      r.copyWithin(0, 1); r[n - 1] = 0;
      for (let i = 0; i < n; i++) r[i] ^= mul(g[i], f);
    }
    return r;
  }

  /* ---------- tabulky normy (verze 1–40; index 0 nevyužitý) ---------- */
  // opravných bajtů v jednom bloku a počet bloků – úroveň L a M
  const ECC = {
    L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  };
  const BLOCKS = {
    L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  };
  const ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  const sizeOf = v => v * 4 + 17;
  /** Moduly pro data a opravu (bez vyhledávacích, časovacích a zarovnávacích vzorů, formátu a verze) – v bitech. */
  function rawModules(v) {
    let n = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const a = Math.floor(v / 7) + 2;
      n -= (25 * a - 10) * a - 55;
      if (v >= 7) n -= 36;
    }
    return n;
  }
  const totalCodewords = v => Math.floor(rawModules(v) / 8);
  const dataCodewords = (v, ecl) => totalCodewords(v) - ECC[ecl][v] * BLOCKS[ecl][v];
  /** Kolik bajtů se vejde v bajtovém režimu (hlavička: 4 bity režimu + délka 8 bitů do verze 9, jinak 16). */
  const capacity = (v, ecl) => Math.floor((dataCodewords(v, ecl) * 8 - 4 - (v < 10 ? 8 : 16)) / 8);

  /** Středy zarovnávacích vzorů (stejné pro řádky i sloupce). */
  function alignment(v) {
    if (v === 1) return [];
    const a = Math.floor(v / 7) + 2, size = sizeOf(v);
    const step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (a * 2 - 2)) * 2;
    const out = [6];
    for (let pos = size - 7; out.length < a; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  /** 15 bitů formátu: úroveň opravy + maska, BCH(15,5) a XOR 101010000010010. */
  function formatBits(ecl, mask) {
    const d = (ECL_BITS[ecl] << 3) | mask;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    return ((d << 10) | r) ^ 0x5412;
  }
  /** 18 bitů verze (od verze 7): Golayův kód (18,6). */
  function versionBits(v) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    return (v << 12) | r;
  }

  /** Datová kódová slova: režim 0100, délka, bajty, ukončení, doplnění na bajt a výplň 0xEC 0x11. */
  function dataStream(bytes, v, ecl) {
    const cap = dataCodewords(v, ecl) * 8, bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4);
    put(bytes.length, v < 10 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    if (bits.length > cap) return null;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    const out = new Uint8Array(cap / 8);
    let i = 0;
    for (; i * 8 < bits.length; i++) for (let j = 0; j < 8; j++) out[i] = (out[i] << 1) | bits[i * 8 + j];
    for (let pad = 0xec; i < out.length; i++, pad ^= 0xec ^ 0x11) out[i] = pad;
    return out;
  }
  /** Data rozdělená do bloků, ke každému oprava, pak prokládání (data po sloupcích, za nimi oprava). */
  function codewords(bytes, v, ecl) {
    const data = dataStream(bytes, v, ecl);
    if (!data) return null;
    const nb = BLOCKS[ecl][v], ecLen = ECC[ecl][v], total = totalCodewords(v);
    const shortLen = Math.floor(total / nb) - ecLen, longCount = total % nb; // posledních longCount bloků má o bajt víc
    const blocks = [];
    for (let b = 0, at = 0; b < nb; b++) {
      const len = shortLen + (b >= nb - longCount ? 1 : 0);
      const d = data.subarray(at, at + len);
      at += len;
      blocks.push({ d, e: rs(d, ecLen) });
    }
    const out = [];
    for (let i = 0; i <= shortLen; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
    return Uint8Array.from(out);
  }

  /* ---------- matice ---------- */
  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  /** Vzory, které nejsou data (s místem pro formát a verzi) → { m: moduly, fn: 1 = vzor }; m[y * size + x]. */
  function template(v) {
    const size = sizeOf(v), m = new Uint8Array(size * size), fn = new Uint8Array(size * size);
    const set = (x, y, on) => { m[y * size + x] = on ? 1 : 0; fn[y * size + x] = 1; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); } // časovací
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) { // vyhledávací s oddělovačem
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
    const al = alignment(v), last = al.length - 1;
    for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue; // pod vyhledávacími
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    drawFormat(m, fn, size, 0); // jen rezervace – skutečný formát až po výběru masky
    if (v >= 7) {
      const vb = versionBits(v);
      for (let i = 0; i < 18; i++) {
        const on = (vb >>> i) & 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, on); set(b, a, on);
      }
    }
    return { m, fn, size };
  }
  /** Formát dvakrát (u levého horního vzoru a rozdělený k ostatním dvěma) + tmavý modul nad levým dolním. */
  function drawFormat(m, fn, size, bits) {
    const set = (x, y, on) => { m[y * size + x] = on ? 1 : 0; fn[y * size + x] = 1; };
    const bit = i => (bits >>> i) & 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, 1);
  }
  /** Bity kódových slov do volných modulů: dvojsloupce zprava, střídavě nahoru a dolů, sloupec 6 (časovací) vynechán. */
  function place(m, fn, size, cw) {
    let i = 0;
    const n = cw.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const up = ((right + 1) & 2) === 0;
      for (let k = 0; k < size; k++) {
        const y = up ? size - 1 - k : k;
        for (let j = 0; j < 2; j++) {
          const x = right - j, at = y * size + x;
          if (fn[at]) continue;
          m[at] = i < n ? (cw[i >>> 3] >>> (7 - (i & 7))) & 1 : 0; // zbylé bity (0–7) zůstanou světlé
          i++;
        }
      }
    }
  }
  const applyMask = (m, fn, size, k) => { const f = MASKS[k]; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y * size + x] && f(x, y)) m[y * size + x] ^= 1; };

  /** Trestné body masky podle normy: řady ≥ 5 stejných, bloky 2×2, vzor 1:1:3:1:1 se 4 světlými, poměr tmavých. */
  function penalty(m, size) {
    let p = 0, dark = 0;
    const at = (x, y) => m[y * size + x];
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          const same = b < size && (pass ? at(a, b) === at(a, b - 1) : at(b, a) === at(b - 1, a));
          if (same) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) p += 3;
    }
    // 1011101 a před ním nebo za ním 4 světlé moduly (mimo matici = tichá zóna, tedy světlé)
    const light = (get, from, to) => { for (let i = Math.max(0, from); i < Math.min(size, to); i++) if (get(i)) return false; return true; };
    for (let a = 0; a < size; a++) {
      const row = i => at(i, a), col = i => at(a, i);
      for (const get of [row, col]) {
        for (let i = 0; i + 6 < size; i++) {
          if (get(i) && !get(i + 1) && get(i + 2) && get(i + 3) && get(i + 4) && !get(i + 5) && get(i + 6)
            && (light(get, i - 4, i) || light(get, i + 7, i + 11))) p += 40;
        }
      }
    }
    for (let i = 0; i < m.length; i++) dark += m[i];
    p += Math.floor(Math.abs(dark * 20 - m.length * 10) / m.length) * 10;
    return p;
  }

  /**
   * Bajty (nebo text – UTF-8) → { version, ecl, mask, size, modules: Uint8Array (1 = tmavý, [y * size + x]) }, nebo null,
   * když se data nevejdou ani do maxVersion s L. ecl 'auto' = M, a když se nevejde, L (menší oprava, víc dat).
   * mask = pevná maska (testy); jinak ta s nejmenším trestem.
   */
  function encode(input, { ecl = 'auto', maxVersion = 40, minVersion = 1, mask = null } = {}) {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const levels = ecl === 'auto' ? ['M', 'L'] : [ecl];
    for (const e of levels) {
      if (!ECC[e]) throw new Error('nepodporovaná úroveň opravy ' + e);
      for (let v = Math.max(1, minVersion); v <= Math.min(40, maxVersion); v++) {
        if (bytes.length > capacity(v, e)) continue;
        const cw = codewords(bytes, v, e), t = template(v), size = t.size;
        place(t.m, t.fn, size, cw);
        let best = null;
        for (let k = 0; k < 8; k++) {
          if (mask != null && k !== mask) continue;
          const m = t.m.slice(), fn = t.fn;
          applyMask(m, fn, size, k);
          drawFormat(m, fn.slice(), size, formatBits(e, k));
          const p = mask != null ? 0 : penalty(m, size);
          if (!best || p < best.p) best = { p, m, k };
        }
        return { version: v, ecl: e, mask: best.k, size, modules: best.m };
      }
    }
    return null;
  }

  /**
   * Matice → SVG: bílé pozadí s tichou zónou (quiet modulů) a tmavé moduly jako pruhy po řádcích v jedné <path>
   * (verze 40 má ~15 000 tmavých modulů – po pruzích je cesta zhruba třetinová). Velikost určí CSS (viewBox).
   */
  function svg(q, { quiet = 4, label = 'QR kód' } = {}) {
    const n = q.size + quiet * 2;
    let d = '';
    for (let y = 0; y < q.size; y++) {
      for (let x = 0; x < q.size;) {
        if (!q.modules[y * q.size + x]) { x++; continue; }
        let w = 1;
        while (x + w < q.size && q.modules[y * q.size + x + w]) w++;
        d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`;
        x += w;
      }
    }
    const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;
  }

  window.QR = { encode, svg, capacity, rs, formatBits, versionBits, alignment, totalCodewords, penalty };
})();
