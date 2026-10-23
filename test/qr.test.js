// QR kód pro 📲 Přenést do jiného zařízení (public/js/qr.js): publikované příklady normy (Reed–Solomon, formát,
// verze, kapacity, zarovnávací vzory), matice ze segno (referenční kodér v Pythonu) pro všech 40 verzí × L/M a zpětné
// dekódování nezávislým dekodérem (test/qrdecode.js) – i z vykresleného SVG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { decode, fromSvg } from './qrdecode.js';

const ctx = { TextEncoder };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../public/js/qr.js', import.meta.url), 'utf8'), ctx, { filename: 'qr.js' });
const QR = ctx.QR;
const rows = (q) => Array.from({ length: q.size }, (_, y) => Array.from(q.modules.subarray(y * q.size, (y + 1) * q.size)).join(''));
const sha = (q) => createHash('sha256').update(rows(q).join('\n')).digest('hex').slice(0, 16);
// znaky base64url jako v odkazu přenosu (stejný generátor jako při výrobě referenčních otisků)
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const sample = (n, seed) => { let s = seed >>> 0, o = ''; for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; o += A[(s >>> 16) & 63]; } return o; };
const PREFIX = 'https://atlas-letenky.onrender.com/#sync=z';

test('Reed–Solomon: publikované příklady (ISO/IEC 18004 příloha I „01234567“ 1-M, „HELLO WORLD“ 1-M) a nulové syndromy', () => {
  assert.deepEqual([...QR.rs([16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17], 10)], [165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
  assert.deepEqual([...QR.rs([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10)], [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  // kódové slovo (data + oprava) má kořeny α⁰…αⁿ⁻¹ – pro všechny délky opravy z tabulek normy
  const exp = [1]; for (let i = 1; i < 255; i++) { const x = exp[i - 1] << 1; exp.push(x & 0x100 ? x ^ 0x11d : x); }
  const log = []; exp.forEach((v, i) => { log[v] = i; });
  const mul = (a, b) => (a && b ? exp[(log[a] + log[b]) % 255] : 0);
  for (const n of [7, 10, 13, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30]) {
    const data = Array.from({ length: 40 }, (_, i) => (i * 37 + n * 11) & 255), cw = [...data, ...QR.rs(data, n)];
    for (let r = 0; r < n; r++) assert.equal(cw.reduce((s, c) => mul(s, exp[r]) ^ c, 0), 0, `n=${n}, syndrom ${r}`);
  }
});

test('formát (BCH 15,5) a verze (Golay 18,6) podle tabulek normy; slova formátu se liší aspoň v 7 bitech', () => {
  const L = ['111011111000100', '111001011110011', '111110110101010', '111100010011101', '110011000101111', '110001100011000', '110110001000001', '110100101110110'];
  const M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
  for (let k = 0; k < 8; k++) {
    assert.equal(QR.formatBits('L', k).toString(2).padStart(15, '0'), L[k], `L maska ${k}`);
    assert.equal(QR.formatBits('M', k).toString(2).padStart(15, '0'), M[k], `M maska ${k}`);
  }
  const all = ['L', 'M', 'Q', 'H'].flatMap((e) => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => QR.formatBits(e, k)));
  const dist = (a, b) => [...(a ^ b).toString(2)].filter((c) => c === '1').length;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(dist(all[i], all[j]) >= 7, `${i}/${j}`);
  const V = [0x07C94, 0x085BC, 0x09A99, 0x0A4D3, 0x0BBF6, 0x0C762, 0x0D847, 0x0E60D, 0x0F928, 0x10B78, 0x1145D, 0x12A17, 0x13532, 0x149A6, 0x15683, 0x168C9, 0x177EC, 0x18EC4, 0x191E1, 0x1AFAB, 0x1B08E, 0x1CC1A, 0x1D33F, 0x1ED75, 0x1F250, 0x209D5, 0x216F0, 0x228BA, 0x2379F, 0x24B0B, 0x2542E, 0x26A64, 0x27541, 0x28C69];
  for (let v = 7; v <= 40; v++) assert.equal(QR.versionBits(v), V[v - 7], `verze ${v}`);
});

test('kapacita bajtového režimu L a M pro verze 1–40 = tabulka normy; zarovnávací vzory', () => {
  const L = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858, 929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431, 2563, 2699, 2809, 2953];
  const M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331];
  for (let v = 1; v <= 40; v++) {
    assert.equal(QR.capacity(v, 'L'), L[v - 1], `L${v}`);
    assert.equal(QR.capacity(v, 'M'), M[v - 1], `M${v}`);
  }
  assert.deepEqual([...QR.alignment(1)], []);
  assert.deepEqual([...QR.alignment(2)], [6, 18]);
  assert.deepEqual([...QR.alignment(7)], [6, 22, 38]);
  assert.deepEqual([...QR.alignment(22)], [6, 26, 50, 74, 98]);
  assert.deepEqual([...QR.alignment(32)], [6, 34, 60, 86, 112, 138]);
  assert.deepEqual([...QR.alignment(36)], [6, 24, 50, 76, 102, 128, 154]);
  assert.deepEqual([...QR.alignment(40)], [6, 30, 58, 86, 114, 142, 170]);
  assert.deepEqual([QR.totalCodewords(1), QR.totalCodewords(7), QR.totalCodewords(40)], [26, 196, 3706]);
});

test('matice = referenční kodér segno (malé celé, verze 1–40 × L/M otiskem; maska z referenčního kodéru)', () => {
  // segno 1.6.1 s opravou: na hranici bajtu nepřidává nulový bajt navíc (norma 7.4.10 – jen doplnění do bajtu)
  const hello = QR.encode('HELLO WORLD', { ecl: 'M', mask: 4 });
  assert.equal(hello.version, 1);
  assert.deepEqual(rows(hello), [
    '111111101100101111111', '100000100001001000001', '101110100101001011101', '101110101001001011101', '101110101110101011101',
    '100000101001001000001', '111111101010101111111', '000000001001100000000', '100010111111011111001', '000100001011100001111',
    '001111110011011010010', '111110001100010000000', '111110101010101100110', '000000001010111101011', '111111101110101011010',
    '100000100101110110011', '101110101101011000110', '101110100100100011011', '101110100111000111000', '100000100001010000000',
    '111111101111111110101',
  ]);
  const url = QR.encode('https://atlas-letenky.onrender.com/', { ecl: 'L', mask: 5 });
  assert.equal(url.version, 3);
  assert.deepEqual(rows(url), [
    '11111110011101110010001111111', '10000010000110010100001000001', '10111010011100101001101011101', '10111010101100111101101011101',
    '10111010101011110111001011101', '10000010011001101100101000001', '11111110101010101010101111111', '00000000010011011010000000000',
    '11000111011010100101100011000', '00011000101000111001010110110', '11111111110110011110110110000', '01001000101100101011011011000',
    '10110010111001101000111100001', '00111000001011111011101110011', '01011110111001111000001011100', '01000100100011110001011100101',
    '10100010001010100101000001100', '10011100011000011111101110111', '11001110001011110001000111001', '10111000110100110010100110000',
    '10010010100100010100111110111', '00000000110011010010100011000', '11111110111001110001101011100', '10000010110011011011100010011',
    '10111010010111001001111111011', '10111010011000010010010101101', '10111010000110010001011111110', '10000010101100011001011111101',
    '11111110100100011101000010100',
  ]);
  // otisk (sha256, 16 znaků) matice segno pro data délky kapacita − (verze mod 3): „maska:otisk“ pro verze 1–40
  const REF = {
    L: '0:51877e4657de10b8 5:5693c16fe4358413 7:a83602256069f38a 2:df27681b3ea74e45 6:2508fd1b245d17ef 2:6fdc78a40ce674cf 2:9ad640ef02605498 2:83f89da39aedcc69 1:05fdb7b5da7892df 6:2ca50b20a7e2f113 2:b1e845fc778cf9f2 7:d85cf0ffe765369e 5:5da998dff07e7c96 2:e20b3cbc06d11c3b 4:a328de08486b8b79 2:c855387bd0e7948c 4:d2578a0ba2e7a190 3:f3d610b7bbe58bb7 2:b1c4c644c3b6f6ea 7:125d908920afdf50 4:72b9cc7ea9224ee8 2:0b66fd2b94aefd2e 4:27e56a3e3db36f90 4:13496fc3aea933bf 4:fe9ce036ccd2f61a 5:ece4711c1ecd85d2 5:4287fb8470ceb34e 2:702e7f1e5883b801 2:572c3c17f92377d5 3:46a8536f2a02649d 2:a2054a5bbf1de755 2:4b48d7cf36afd0ed 3:602e563b9e7f4dcc 4:70b6c45bcf278e83 4:da77e6d70b1a8df2 4:96c0ce6f1190523d 5:7117ce1c153ce7fa 2:122694ec32fe8ee3 6:5c82daf99852fddb 5:81fbce075971e656',
    M: '0:13061b8182662232 6:08f27a333cd12cdd 7:24eef6a658d30aaa 2:5b31cce2de3a24e4 7:578aedd7f6e42b74 7:df329670696f4aef 2:363430727367a70a 2:31f726f21bc7efa5 7:c747fb30d1e3b791 2:fd95bb73442546e9 3:35e8df432e922bf1 5:0b1a4cc5b713bdae 5:5bddd62a664f54b3 4:993cd7d9ca7e4043 7:0fafb1b1b6e9b385 7:842df074fede6dd1 6:d17a7865f3c157cc 7:cdd52c569a23f372 2:ca8d7cb11d765b53 6:99a10de0784e541b 2:e5b9a480782b163d 4:369fd2db77830ca2 5:28646a2150d27b59 4:237d0f1cd014d4e4 5:a454f5e05c3e9070 4:55e6fe924323d43e 4:8f1eb44b341978cf 2:cb8168db18ab0507 3:f3bdd0b56e869ee1 3:63706b272ed1127d 2:67821e262aa9170c 3:5ed2e790d503f745 2:b86b73f2dc04ebc0 2:c427fb8e1d14c293 5:c2ec8660d2cf8110 6:2b2ef034389b24c0 5:846296c857dd2692 2:1e05f0bace5c0fbf 3:f1fe03daa78a99ed 5:e710e543d502cfee',
  };
  for (const ecl of ['L', 'M']) {
    REF[ecl].split(' ').forEach((ref, i) => {
      const v = i + 1, [mask, hash] = ref.split(':'), n = QR.capacity(v, ecl) - (v % 3);
      const data = PREFIX.slice(0, Math.min(PREFIX.length, n)) + sample(Math.max(0, n - PREFIX.length), v * 31 + (ecl === 'L' ? 1 : 2));
      const q = QR.encode(data, { ecl, mask: +mask });
      assert.equal(q.version, v, `${ecl}${v}: nejmenší verze, do které se data vejdou`);
      assert.equal(sha(q), hash, `${ecl}${v}`);
    });
  }
});

test('zpětné dekódování nezávislým dekodérem: M, a když se nevejde, L; verze 1–40; nejvýš 2 953 bajtů', () => {
  for (const n of [1, 14, 15, 100, 213, 214, 500, 997, 1500, 2000, 2331, 2332, 2600, 2953]) {
    const s = PREFIX.slice(0, Math.min(n, PREFIX.length)) + sample(Math.max(0, n - PREFIX.length), n);
    const q = QR.encode(s);
    const r = decode(q);
    assert.equal(r.text, s, `n=${n}`);
    assert.equal(r.ecl, n <= 2331 ? 'M' : 'L', `n=${n}: oprava M, dokud se data vejdou`);
    assert.equal(r.version, q.version);
    assert.equal(r.mask, q.mask);
    const cap = QR.capacity(q.version, q.ecl);
    assert.ok(n <= cap && (q.version === 1 || n > QR.capacity(q.version - 1, q.ecl)), `n=${n}: nejmenší verze`);
  }
  assert.equal(QR.encode('x'.repeat(2954)), null, 'víc než 40-L se nevejde');
  assert.equal(QR.encode('x'.repeat(300), { maxVersion: 5 }), null, 'strop verze');
  // UTF-8 (bajtový režim)
  assert.equal(decode(QR.encode('Příliš žluťoučký kůň 🐎')).text, 'Příliš žluťoučký kůň 🐎');
});

test('maska: vybraná má nejmenší trest ze všech osmi (stejný výpočet jako výběr)', () => {
  for (const s of ['HELLO WORLD', PREFIX + sample(400, 9)]) {
    const q = QR.encode(s);
    const pen = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => QR.penalty(QR.encode(s, { mask: k }).modules, q.size));
    assert.equal(pen[q.mask], Math.min(...pen), s.slice(0, 20));
  }
});

test('SVG: jedna cesta z pruhů, bílá tichá zóna 4 moduly, viewBox na celé moduly; přečtené zpět = tatáž matice', () => {
  const q = QR.encode(PREFIX + sample(700, 3));
  const svg = QR.svg(q, { label: 'QR "x" <y>' });
  assert.match(svg, new RegExp(`viewBox="0 0 ${q.size + 8} ${q.size + 8}"`));
  assert.match(svg, /<rect width="\d+" height="\d+" fill="#fff"\/><path fill="#000" d="M/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /aria-label="QR &#34;x&#34; &#60;y&#62;"/, 'popisek bez HTML');
  assert.equal((svg.match(/<path/g) || []).length, 1);
  const back = fromSvg(svg);
  assert.deepEqual([...back.modules], [...q.modules]);
  assert.equal(decode(back).text, PREFIX + sample(700, 3));
});
