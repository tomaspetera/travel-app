// Tmavý režim na telefonu (večer): čitelné popisky a prvky prohlížeče. Kontrast se počítá z tokenů v atlas.css
// (plochy skládané z poloprůhledných vrstev jako v prohlížeči), ne z hodnot opsaných do testu – změna barvy, která by
// popisky zase ztmavila pod 4,5 : 1, test shodí.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const ATLAS = noComments(read('css/atlas.css'));
const FLIGHTS = noComments(read('css/flights.css'));

/** Blok proměnných motivu [data-theme="…"]{…}. */
const themeBlock = (t) => ATLAS.match(new RegExp(`\\[data-theme="${t}"\\]\\{([^}]*)\\}`))[1];
const token = (t, name) => {
  const m = themeBlock(t).match(new RegExp(`--${name}:([^;]+);`));
  assert.ok(m, `chybí --${name} v motivu ${t}`);
  return m[1].trim();
};
/** #rrggbb nebo rgba(r,g,b,a) → { r, g, b, a } */
function color(s) {
  if (s.startsWith('#')) return { r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16), a: 1 };
  const [r, g, b, a = 1] = s.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
  return { r, g, b, a };
}
/** Barva top (s průhledností) přes neprůhledný podklad. */
const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
function hsl(h, s, l, a = 1) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, q = s * Math.min(l, 1 - l);
  const f = (n) => 255 * (l - q * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4), a };
}
function contrast(x, y) {
  const lum = ({ r, g, b }) => [r, g, b].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
}

// plochy tmavého režimu: pozadí, karta, dlaždice v kartě (surface-2), okno (surface-solid) a dlaždice v okně
const BG = color(token('dark', 'bg'));
const CARD = over(color(token('dark', 'card')), BG);
const SURFACES = {
  pozadí: BG,
  karta: CARD,
  'dlaždice v kartě': over(color(token('dark', 'surface-2')), CARD),
  okno: color(token('dark', 'surface-solid')),
  'dlaždice v okně': over(color(token('dark', 'surface-2')), color(token('dark', 'surface-solid'))),
};

test('tmavý režim: text, --muted i --faint mají na všech plochách kontrast aspoň 4,5 : 1', () => {
  for (const name of ['text', 'muted', 'faint']) {
    const fg = color(token('dark', name));
    for (const [where, bg] of Object.entries(SURFACES)) {
      const c = contrast(fg, bg);
      assert.ok(c >= 4.5, `--${name} na ploše „${where}“: ${c.toFixed(2)} : 1`);
    }
  }
  // popisky zůstanou slabší než --muted (hierarchie textu)
  assert.ok(contrast(color(token('dark', 'faint')), BG) < contrast(color(token('dark', 'muted')), BG));
});

test('tmavý režim: prvky prohlížeče tmavě (color-scheme), placeholder čitelný – světlý režim beze změny', () => {
  assert.match(themeBlock('dark'), /color-scheme:dark/, 'bílá zaškrtávátka a černá ikona v poli data na tmavém pozadí');
  assert.doesNotMatch(themeBlock('light'), /color-scheme/);
  assert.doesNotMatch(ATLAS, /:root\{[^}]*color-scheme/);
  // výchozí #757575 prohlížeče má na tmavém poli ~3,4 : 1
  assert.match(ATLAS, /\[data-theme="dark"\] ::placeholder\{color:var\(--faint\)\}/);
});

test('tmavý režim: ceny v kalendáři (od zelené po červenou) čitelné na své barevné buňce', () => {
  const rule = (sel) => {
    const m = FLIGHTS.match(new RegExp(`(?:^|\\})${sel.replace(/\./g, '\\.')}\\{([^}]*)\\}`, 'm'));
    assert.ok(m, `chybí ${sel}`);
    return m[1];
  };
  // [text ceny, buňka s barevným pozadím]: 📅 Kalendář (den) a mřížka termínů (den × noci)
  for (const [sel, cell] of [['.cd b', '.cd'], ['.dg-c', '.dg-c']]) {
    const [, s, l] = rule(sel).match(/color:hsl\(var\(--h\),(\d+)%,(\d+)%\)/).map(Number);
    const [, bs, bl, ba] = rule(cell).match(/background:hsla\(var\(--h\),(\d+)%,(\d+)%,([\d.]+)\)/).map(Number);
    let worst = Infinity;
    for (let h = 0; h <= 140; h += 5) worst = Math.min(worst, contrast(hsl(h, s, l), over(hsl(h, bs, bl, ba), CARD)));
    assert.ok(worst >= 4.5, `${sel}: nejhorší odstín ${worst.toFixed(2)} : 1`);
  }
});

test('tmavý režim: měsíc na barevné dlaždici teploty (detail země) čitelný', () => {
  const m = read('js/app.js').match(/const tempBg = t => `hsl\(\$\{[^`]*\} (\d+)% (\d+)% \/ ([\d.]+)\)`/);
  assert.ok(m, 'app.js: tempBg');
  const [, s, l, a] = m.map(Number);
  const rule = ATLAS.match(/\[data-theme="dark"\] \.months\.clim \.m\{color:var\(--([a-z]+)\)\}/);
  assert.ok(rule, 'barva měsíce v tmavém režimu');
  const fg = color(token('dark', rule[1]));
  let worst = Infinity;
  for (let h = 0; h <= 220; h += 5) worst = Math.min(worst, contrast(fg, over(hsl(h, s, l, a), color(token('dark', 'surface-solid')))));
  assert.ok(worst >= 4.5, `měsíc na dlaždici: ${worst.toFixed(2)} : 1`);
});

test('světlý režim: ceny v kalendáři čitelné na své barevné buňce i u žlutozelené (dřív 2,9 : 1)', () => {
  const light = (sel) => {
    const m = FLIGHTS.match(new RegExp(`\\[data-theme=light\\] ${sel.replace(/\./g, '\\.')}\\{color:hsl\\(var\\(--h\\),(\\d+)%,(\\d+)%\\)\\}`));
    assert.ok(m, `chybí světlá barva ${sel}`);
    return [+m[1], +m[2]];
  };
  const WHITE = { r: 255, g: 255, b: 255, a: 1 };
  for (const [sel, cell] of [['.cd b', '.cd'], ['.dg-c', '.dg-c']]) {
    const [s, l] = light(sel);
    const [, bs, bl, ba] = FLIGHTS.match(new RegExp(`(?:^|\\})${cell.replace(/\./g, '\\.')}\\{[^}]*background:hsla\\(var\\(--h\\),(\\d+)%,(\\d+)%,([\\d.]+)\\)`, 'm')).map(Number);
    let worst = Infinity;
    for (let h = 0; h <= 140; h += 5) worst = Math.min(worst, contrast(hsl(h, s, l), over(hsl(h, bs, bl, ba), WHITE)));
    assert.ok(worst >= 4.5, `${sel}: nejhorší odstín ${worst.toFixed(2)} : 1`);
  }
});

test('tmavý i světlý režim: den odletu a návratu v kalendáři, „HLEDAT“, čísla programu, hlavička okna bez fotky', () => {
  const ATL = ATLAS, TRIP = noComments(read('css/trip.css'));
  // bílé číslo dne na sytém pozadí odletu / návratu
  for (const bg of ['#2f5fd0', '#7c3aed']) assert.ok(contrast(color('#ffffff'), color(bg)) >= 4.5, bg);
  assert.match(FLIGHTS, /\.sc-d\.r-out\{background:#2f5fd0;/);
  assert.match(FLIGHTS, /\.sc-d\.r-back\{background:#7c3aed;/);
  assert.match(FLIGHTS, /\[data-theme="dark"\] \.pi-smart \.pi-type\{color:#a9c1ff\}/);
  assert.match(TRIP, /\.dp-n\{[^}]*box-shadow:inset 0 0 0 11px rgba\(0,0,0,\.2\)\}/);
  assert.match(ATL, /\.modal-hero:not\(\.ph\) \.mh-bg\{filter:brightness\(\.75\)\}/);
  assert.match(ATL, /\.trip-grid\.past \.trip\{opacity:\.88\}/);
});
