// Ikona na ploše a navázání úvodní obrazovky (#launch) na systémovou úvodní obrazovku Androidu: launchery (MIUI ap.)
// ikonu s průhlednými rohy zvětší a oříznou, znak pak naráží na okraje – ikony z manifestu jsou proto plný čtverec
// Pistácie se znakem do 66 % šířky. Android při startu ukáže background_color a tuhle ikonu ~128 dp na středu; #launch
// začíná přesně tím (dlaždice 128 px na středu okna, znak ve stejné velikosti a poloze), teprve pak se rozehraje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const { decodePng, MARK } = await import('../scripts/build-icons.mjs');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const INDEX = read('public/index.html');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const PISTACIE = [0xd6, 0xde, 0x82];

/** Ohraničení znaku v ikoně (pixely zřetelně jiné než Pistácie) jako podíl strany: šířka, střed x a y. */
function mark({ width, px }) {
  let x0 = width, x1 = 0, y0 = width, y1 = 0;
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4;
    if (Math.abs(px[o] - PISTACIE[0]) + Math.abs(px[o + 1] - PISTACIE[1]) + Math.abs(px[o + 2] - PISTACIE[2]) > 24) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
    }
  }
  return { w: (x1 - x0) / width, cx: (x0 + x1) / 2 / width, cy: (y0 + y1) / 2 / width };
}
const icons = [...manifest.icons, ...manifest.shortcuts.flatMap((s) => s.icons)].map((i) => i.src).filter((s, i, a) => a.indexOf(s) === i);

test('ikony z manifestu (any, maskable, zkratky): plný čtverec Pistácie bez průhledných rohů, znak do 66 % šířky na středu', () => {
  assert.ok(icons.length >= 5, icons.join());
  for (const src of icons) {
    const img = decodePng(readFileSync(path.join(ROOT, 'public', src)));
    const n = img.width;
    assert.equal(img.height, n, src);
    // rohy i okraje neprůhledná Pistácie – launcher nemá co ořezat a zvětšit
    for (const [x, y] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1], [n >> 1, 0], [0, n >> 1]]) {
      const o = (y * n + x) * 4;
      assert.deepEqual([...img.px.subarray(o, o + 4)], [...PISTACIE, 255], `${src}: pixel ${x},${y}`);
    }
    assert.ok(img.px.every((v, i) => i % 4 !== 3 || v === 255), `${src}: bez průhlednosti`);
    const m = mark(img);
    assert.ok(m.w >= 0.55 && m.w <= 0.66, `${src}: znak ${(m.w * 100).toFixed(1)} % šířky`);
    assert.ok(Math.abs(m.cx - 0.5) < 1.5 / n, `${src}: znak vodorovně na středu`);
    assert.ok(m.cy > 0.48 && m.cy <= 0.5, `${src}: znak svisle na optickém středu (kousek nad středem)`);
  }
  // iPhone a favicon zůstávají
  assert.ok(!icons.includes('icons/apple-touch-icon.png'));
});

test('úvodní obrazovka Letsi začíná ikonou: dlaždice Pistácie 128 px na středu okna, znak ve velikosti a poloze z ikony', () => {
  const css = INDEX.match(/<style>\n\/\* Úvodní obrazovka ve vzhledu Letsi[\s\S]*?<\/style>/)[0];
  const tile = INDEX.match(/<svg class="l-tile" viewBox="-200 -200 400 400" aria-hidden="true">([\s\S]*?)<\/svg>/);
  assert.ok(tile, 'dlaždice .l-tile v #launch');
  assert.ok(INDEX.indexOf('<svg class="l-tile"') > INDEX.indexOf('<svg class="l-logo"'), 'dlaždice nad znakem (zakryje ho, dokud nezmizí)');
  assert.match(tile[1], /^<rect x="-200" y="-200" width="400" height="400" rx="\d+" fill="#D6DE82"\/>/, 'plná Pistácie přes celou dlaždici');
  // znak v dlaždici: rám 240 jednotek ze 400 = MARK (60 %) jako ikony, posunutý o optický střed
  assert.equal(240 / 400, MARK);
  // 128 px na středu okna (ne 45 %), logo se znakem taky na středu
  assert.match(css, /\[data-brand=letsi\] #launch \.l-tile\{display:block;position:absolute;left:50%;top:50%;width:128px;height:128px;margin:-64px 0 0 -64px;opacity:0;animation:lo-tile 1\.2s both\}/);
  assert.match(css, /\[data-brand=letsi\] #launch \.l-logo\{display:block;position:absolute;left:50%;top:50%;width:288px;height:64px;margin:-32px 0 0 -144px;/);
  assert.match(css, /#launch \.l-tile\{display:none\}/, 'mimo vzhled Letsi není');
  // na začátku plně vidět, rozplyne se dřív, než se znak pod ní pohne
  const kf = (name) => css.match(new RegExp(`@keyframes ${name}\\{((?:[^{}]*\\{[^{}]*\\})*)\\s*\\}`))[1];
  assert.match(kf('lo-tile'), /^0%,4%\{opacity:1\}14%\{opacity:0\}$/);
  // znak pod dlaždicí: stejná šířka (60 % ze 128 px) a stejná poloha jako v dlaždici a v ikoně
  const [, ty, s] = kf('lo-oo').match(/^0%,14%\{transform:translate\(1417\.4px,(-?[\d.]+)px\) scale\(([\d.]+)\)/).map(Number);
  const pxPerUnit = 288 / 4087.9, markUnits = 240 * 5.2217; // šířka .l-logo / viewBox, rám znaku × měřítko v logu
  assert.ok(Math.abs(markUnits * pxPerUnit * s - MARK * 128) < 1, `šířka znaku ${(markUnits * pxPerUnit * s).toFixed(1)} px`);
  const lift = Number(tile[1].match(/<g transform="translate\(0 (-[\d.]+)\)"/)[1]) * 128 / 400; // posun znaku v dlaždici v px
  assert.ok(Math.abs(ty * pxPerUnit - lift) < 0.2, 'znak pod dlaždicí ve stejné výšce');
  const icon = mark(decodePng(readFileSync(path.join(ROOT, 'public/icons/icon-192.png'))));
  assert.ok(Math.abs(lift / 128 - (icon.cy - 0.5)) < 0.004, `optický střed jako v ikoně (${lift.toFixed(2)} px)`);
  // pohled v klidu jako v ikoně, celé do 1,2 s (app.js launchWait čeká 1,25 s – test/navigace.test.js)
  assert.match(kf('lo-zor'), /^0%,14%\{transform:translate\(7\.01px,-13\.48px\)\}/);
  assert.match(kf('lo-hl'), /^0%,14%\{transform:translate\(4\.73px,-1\.29px\)\}/);
  assert.ok([...css.matchAll(/animation:lo-[\w-]+ ([\d.]+)s/g)].every((m) => +m[1] <= 1.2));
  // omezený pohyb: dlaždice hned pryč (výchozí opacity 0), statické logo
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\[data-brand=letsi\] #launch :is\(\.l-logo \*,\.l-tile\)\{animation:none!important\}\}/);
});
