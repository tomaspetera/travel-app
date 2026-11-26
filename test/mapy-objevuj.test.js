// Mapy v Objevuj a v trase cesty (předstartovní kontrola): celý svět na telefonu, české popisky podkladu, rada při
// zakázané poloze a barvy dnů a míst trasy z palety Letsi (ATLAS beze změny).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const placesJs = src('js/places.js');
const dataset = {};
const ctx = { console, URLSearchParams, setTimeout, clearTimeout, Weather: {}, toast: () => {}, document: { documentElement: { dataset } } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src('js/app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx);
vm.runInContext('const fmtDate = (d) => d;', ctx);
for (const f of ['smart.js', 'places.js']) vm.runInContext(src('js/' + f), ctx, { filename: f });
const { dayCol, dayInk } = ctx.Places;
const brand = (b, map = 'light') => { dataset.brand = b; dataset.map = map; };

// kontrast podle WCAG
const lum = (h) => { const c = [1, 3, 5].map((k) => { const v = parseInt(h.slice(k, k + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const ATLAS_RAINBOW = /#5b8cff|#a855f7|#f59e0b|#22c55e|#ec4899|#14b8a6|#ef4444|#0ea5e9/i;

test('vizual-7: dny ve vzhledu Letsi z palety Letsi, sousední dny odlišné, číslo kontrastně (Noc na Pistácii, Vápno na Noci)', () => {
  brand('letsi');
  const cols = [...Array(6)].map((_, i) => dayCol(i));
  for (const c of cols) assert.doesNotMatch(c, ATLAS_RAINBOW, c);
  assert.equal(new Set(cols).size, 6, 'šest dnů, šest barev');
  assert.equal(dayCol(6), cols[0], 'sedmý den znovu od začátku');
  for (let i = 0; i < 5; i++) assert.ok(contrast(cols[i], cols[i + 1]) >= 1.5, `den ${i + 1} a ${i + 2}: ${cols[i]} × ${cols[i + 1]}`);
  for (const c of cols) assert.ok(contrast(dayInk(c), c) >= 4.5, `${dayInk(c)} na ${c}: ${contrast(dayInk(c), c).toFixed(2)}`);
  assert.equal(dayInk('#D6DE82'), '#14161F', 'Noc na Pistácii');
  assert.equal(dayInk('#14161F'), '#F3F4F0', 'Vápno na Noci');
  // na tmavé mapě by čára Noci zmizela – tam Vápno (s Nocí jako číslem)
  brand('letsi', 'dark');
  assert.equal(dayCol(0), '#F3F4F0');
  assert.equal(dayInk(dayCol(0)), '#14161F');
});

test('vizual-7: vzhled ATLAS beze změny – duha dnů i míst trasy, číslo z CSS', () => {
  brand('atlas');
  const DAY = JSON.parse(placesJs.match(/const DAY_COLORS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.deepEqual([...Array(9)].map((_, i) => dayCol(i)), [...DAY, DAY[0]]);
  assert.equal(dayInk('#5b8cff'), '');
  // místa trasy (trip.js) svou šestibarevnou duhou, přes Places.dayCol
  const tripJs = src('js/trip.js');
  const t = { window: { Places: ctx.Places } };
  t.Places = ctx.Places;
  vm.createContext(t);
  vm.runInContext(tripJs.match(/^ {2}const (BASE_COLORS|baseCol|baseSty) = .*$/gm).join('\n') + '\nthis.baseCol = baseCol; this.baseSty = baseSty;', t);
  assert.equal(t.baseCol(6), '#5b8cff', '7. místo zase první barvou (šest barev)');
  assert.equal(t.baseSty(1), 'background:#f59e0b');
  brand('letsi');
  assert.equal(t.baseSty(0), 'background:var(--text);color:var(--bg)', 'místo 1 v kartě barvou textu motivu (tmavý režim: Vápno s Nocí)');
  assert.equal(t.baseSty(1), 'background:#D6DE82;color:#14161F');
  // kolečka v seznamu, v záložkách i značky na mapě berou barvu odsud; hotové místo nechá zelenou plochu a číslo z CSS
  assert.doesNotMatch(tripJs.replace(/^ {2}const baseCol = .*$/m, ''), /BASE_COLORS\[/);
  assert.equal((tripJs.match(/<span class="rb-n" style="\$\{baseSty\(i\)\}">/g) || []).length, 2);
  assert.match(tripJs, /<span class="bt-n" style="\$\{done\(x, j\) \? `background:\$\{baseCol\(j\)\}` : baseSty\(j\)\}">/);
  // značka s číslem na mapě dostane kontrastní číslo
  assert.match(placesJs, /if \(pt\.num\) \{ el\.textContent = pt\.num; const ink = dayInk\(pt\.color\); if \(ink\) el\.style\.color = ink; \}/);
  assert.doesNotMatch(placesJs, /DAY_COLORS\[/);
});

test('objevuj-10: popisky mapy česky – name:cs, bez něj místní název; čísla silnic beze změny', () => {
  const c = {};
  vm.createContext(c);
  vm.runInContext(placesJs.match(/^ {2}const (CS_LABEL|nameLayers) = .*$/gm).join('\n') + '\nthis.CS_LABEL = CS_LABEL; this.nameLayers = nameLayers;', c);
  assert.deepEqual(JSON.parse(JSON.stringify(c.CS_LABEL)), ['coalesce', ['get', 'name:cs'], ['get', 'name:latin'], ['get', 'name']]);
  // výřez vrstev stylu OpenFreeMap liberty
  const tf = ['case', ['has', 'name:nonlatin'], ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']], ['coalesce', ['get', 'name_en'], ['get', 'name']]];
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'label_country_1', type: 'symbol', layout: { 'text-field': tf } },
    { id: 'label_city', type: 'symbol', layout: { 'text-field': '{name:latin}' } },
    { id: 'highway-shield-non-us', type: 'symbol', layout: { 'text-field': ['to-string', ['get', 'ref']] } },
    { id: 'poi_r1', type: 'symbol', layout: { 'icon-image': 'x' } },
  ];
  assert.deepEqual([...c.nameLayers(layers)], ['label_country_1', 'label_city']);
  assert.deepEqual([...c.nameLayers(undefined)], []);
  // po každém načtení stylu (i po přepnutí světlá/tmavá mapa)
  assert.match(placesJs, /map\.on\('style\.load', \(\) => \{\s*ms\.styleReady = true;\s*for \(const id of nameLayers\(map\.getStyle\(\)\.layers\)\) map\.setLayoutProperty\(id, 'text-field', CS_LABEL\);/);
});

test('objevuj-13: zakázaná poloha poradí povolit ji v prohlížeči nebo napsat místo (Objevuj i Lety)', () => {
  const c = {};
  vm.createContext(c);
  vm.runInContext(placesJs.match(/^ {2}const geoMsg = .*$/m)[0] + '\nthis.geoMsg = geoMsg;', c);
  assert.match(c.geoMsg({ code: 1 }), /zakázaná – povol ji v nastavení prohlížeče, nebo napiš místo/);
  assert.equal(c.geoMsg({ code: 3 }), 'Polohu se nepodařilo zjistit');
  assert.equal(c.geoMsg(undefined), 'Polohu se nepodařilo zjistit');
  assert.match(placesJs, /, e => toast\(geoMsg\(e\), 'err'\), \{ timeout: 10000 \}/);
  const flightsJs = src('js/flights.js');
  assert.match(flightsJs, /e => fail\(e && e\.code === 1 \? 'Poloha je zakázaná – povol ji v nastavení prohlížeče, nebo napiš místo ručně' : 'Polohu se nepodařilo zjistit'\)/);
});

test('objevuj-9: mapa světa celá i na telefonu – meet místo ořezu, ovládání v řádku pod světem', () => {
  assert.match(src('index.html'), /<svg id="worldmap" viewBox="0 0 960 500" preserveAspectRatio="xMidYMid meet"><\/svg>/);
  const phone = src('css/atlas.css').match(/@media\(max-width:520px\)\{[\s\S]*?\n\}/)[0];
  assert.match(phone, /\.map-wrap\{aspect-ratio:auto;height:340px;border-radius:24px\}/);
  assert.match(phone, /\.map-zoom\{flex-direction:row\}/);
});
