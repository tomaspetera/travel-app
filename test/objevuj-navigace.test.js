// Navigace po UX kontrole (U20, U36, U37, U45): odznak u Mapy až od první navštívené země a se slovem, podnadpisy
// Mapa / Země, bez zdvojeného „Jen objevovat místa“; průvodce zemí ze záhlaví Objevuj; záložka Cesty se dvěma a více
// cestami otevře Moje cesty a Zpět z průvodce otevřeného ze seznamu vrátí na seznam; zkratka „/“ s přístupným jménem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
const APP = read('js/app.js'), TRIP = read('js/trip.js'), PLACES = read('js/places.js'), HTML = read('index.html');
/** Funkce nebo konstanta z app.js podle jména (jako objevuj-poradi.test.js). */
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = (?:.*\\{\\n[\\s\\S]*?^\\};|.*)|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');

// --- U20 ---
test('U20: odznak u Mapy jen s navštívenými zeměmi a se slovem („3 země“, „5 zemí“), bez nich skrytý', () => {
  const c = {};
  vm.runInNewContext(`${pick('visBadge')}\nthis.visBadge = visBadge;`, c);
  assert.deepEqual([0, 1, 3, 4, 5, 12].map(c.visBadge), ['', '1 země', '3 země', '4 země', '5 zemí', '12 zemí']);
  // panel začíná bez „0“ a refreshStats odznak schová, dokud není nic navštíveno
  assert.match(pick('buildNav'), /'<span class="nav-badge" id="navBadge" hidden><\/span>'/);
  assert.match(pick('refreshStats'), /badge\.textContent = visBadge\(st\.count\); badge\.hidden = !st\.count;/);
});

test('U20: Mapa a Země pod nadpisem Svět, každá s vlastním podnadpisem; „Jen objevovat místa“ (= Objevuj v liště) pryč', () => {
  const nav = vm.runInNewContext(`${APP.match(/^const NAV = \[[\s\S]*?\]\];$/m)[0]}\nNAV`, {});
  const sub = (v) => nav.find((n) => n[0] === v)[2];
  assert.equal(sub('map'), 'Moje mapa – kde jsem byl/a');
  assert.equal(sub('countries'), 'Země – vstup, sezóna, ceny');
  assert.match(pick('go'), /\$\('#pageTitle'\)\.textContent = WORLD_VIEWS\.includes\(v\) \? NAV_INFO\.world\[0\] : nv\[1\]; \$\('#pageSub'\)\.textContent = nv\[2\];/);
  assert.doesNotMatch(TRIP, /tripGoExplore|Jen objevovat místa/);
  assert.match(TRIP, /<div class="trip-intro-act">\$\{window\.newTrip \? '<button type="button" class="btn ghost" id="tripOwn">'/);
});

// --- U36 ---
function places(extra = {}) {
  const ctx = { console, URLSearchParams, setTimeout, clearTimeout, Weather: {}, toast() {}, ...extra };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(APP.match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx);
  vm.runInContext('const fmtDate = (d) => d;', ctx);
  vm.runInContext(PLACES, ctx, { filename: 'places.js' });
  return ctx.Places._t;
}

test('U36: „Vstup, počasí, bezpečnost“ v záhlaví země i města otevře průvodce zemí (openCountry); Česko a neznámá země ne', () => {
  const opened = [];
  const T = places({ openCountry: (iso) => opened.push(iso), byIso: { TH: {}, CZ: {}, FR: {} } });
  assert.equal(T.guideCc('TH'), 'TH');
  assert.equal(T.guideCc('fr'), 'FR');
  assert.equal(T.guideCc('CZ'), '', 'v Česku vstup nikoho nezajímá');
  assert.equal(T.guideCc('XK'), '', 'bez průvodce v countries.json');
  assert.equal(T.guideCc(''), '');
  assert.equal(places().guideCc('TH'), '', 'bez app.js (openCountry) nic');
  // tlačítko před „Jiná země“ / „Začít znovu“, klepnutí otevře okno země
  const btn = {}, html = [];
  const reset = { insertAdjacentHTML: (pos, h) => html.push([pos, h]) };
  const body = { q: { '#exReset': reset, '#exGuide': btn } };
  const T2 = places({ openCountry: (iso) => opened.push(iso), byIso: { TH: {} }, $: (s, root) => root.q[s] });
  T2.guideBtn(body, 'TH');
  assert.equal(html.length, 1);
  assert.equal(html[0][0], 'beforebegin');
  assert.match(html[0][1], /^<button type="button" class="btn sm ghost" id="exGuide"><span class="ico i-info" aria-hidden="true"><\/span> Vstup, počasí, bezpečnost<\/button>$/);
  btn.onclick();
  assert.deepEqual(opened, ['TH']);
  T2.guideBtn(body, 'CZ');
  assert.equal(html.length, 1, 'Česko bez tlačítka');
  // záhlaví celé země i města (země známá z místa)
  assert.match(PLACES, /if \(rs\) rs\.onclick = \(\) => resetExplore\(\);\n\s*guideBtn\(body, d\.cc \|\| p\.cc\);/);
  assert.match(PLACES, /on\('#exReset', 'onclick', \(\) => resetExplore\(\)\);\n\s*guideBtn\(body, p\.cc\);/);
});

// --- U37 ---
test('U37: záložka Cesty se dvěma a více cestami otevře Moje cesty, s jednou průvodce jako dřív', () => {
  const calls = [];
  const c = { S: { trip: null, trips: [] }, go: (v, o) => calls.push([v, o]) };
  vm.runInNewContext(`${pick('tripCount', 'tabGo')}\nthis.tripCount = tripCount; this.tabGo = tabGo;`, c);
  const t = { created: 111 };
  assert.equal(c.tripCount(null, []), 0);
  assert.equal(c.tripCount(t, []), 1, 'jen rozpracovaná');
  assert.equal(c.tripCount(t, [{ tripId: 111 }]), 1, 'rozpracovaná uložená = jedna cesta');
  assert.equal(c.tripCount(t, [{ tripId: 111 }, { name: 'Řím' }]), 2);
  assert.equal(c.tripCount(t, [null, { name: 'Řím' }]), 2, 'rozpracovaná neuložená + jiná');
  assert.equal(c.tripCount(null, 'x'), 0);
  c.S = { trip: t, trips: [{ tripId: 111 }] };
  c.tabGo('trip');
  c.S = { trip: t, trips: [{ name: 'Řím' }] };
  c.tabGo('trip', { drill: true });
  c.tabGo('flights');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['trip', {}], ['trip', { drill: true, mine: true }], ['flights', {}]]);
  // lišta i panel přes tabGo; ‹ Moje cesty dál na seznam (showMine)
  assert.match(pick('buildNav'), /\$\$\('\[data-view\]'\)\.forEach\(el => el\.onclick = \(\) => tabGo\(el\.dataset\.view\)\);/);
  assert.match(TRIP, /mb\.onclick = \(\) => showMine\(t\);/);
  assert.match(TRIP, /resume: \(\) => \{ mineFor = null; render\(\); listBack\(\);/);
});

// historie z app.js (skutečné řádky podle jména) s napodobeným prohlížečem – jako objevuj-poradi.test.js
function app() {
  const H = { list: [{ url: '', state: null }], i: 0, pending: [], exits: 0 };
  const el = () => { const c = new Set(); return { innerHTML: '', scrollTop: 0, contains: () => false, setAttribute() {}, removeAttribute() {}, classList: { add: (k) => c.add(k), remove: (k) => c.delete(k), contains: (k) => c.has(k), toggle: (k, on) => (on ? c.add(k) : c.delete(k)) } }; };
  const els = { '#modalBg': el(), '#modal': el(), '#toast': el(), '#tripStep': null };
  const copy = (s) => (s == null ? null : structuredClone(s));
  const ctx = {
    console, structuredClone, setTimeout: () => 0, clearTimeout: () => {}, Number, Math, Boolean,
    $: (s) => els[s], document: { activeElement: null },
    location: { get hash() { return H.list[H.i].url; } },
    history: {
      get state() { return H.list[H.i].state; },
      pushState(st, t, url) { H.list = H.list.slice(0, H.i + 1); H.list.push({ url: url ?? H.list[H.i].url, state: copy(st) }); H.i++; },
      replaceState(st, t, url) { H.list[H.i] = { url: url ?? H.list[H.i].url, state: copy(st) }; },
      go(n) { H.pending.push(n); },
      back() { H.pending.push(-1); },
    },
    window: { addEventListener() {}, scrollY: 0, scrollTo() {} },
    showNow() {},
  };
  const steps = [];
  ctx.Trip = ctx.window.Trip = { stepTo: (st) => (steps.push(st), true) };
  vm.createContext(ctx);
  vm.runInContext(`var activeView = 'dashboard'; var NAV = ['dashboard', 'flights', 'trip', 'explore', 'planner'].map(k => [k]);
    function go(v, opts = {}) {
      const from = activeView, y0 = opts.noHash ? 0 : Math.round(window.scrollY || 0);
      activeView = v;
      if (!opts.noHash) histDo(() => viewStep(v, opts.drill, from === 'dashboard' || opts.drill ? y0 : null));
    }`, ctx);
  vm.runInContext(pick('hist', 'histFlush', 'histBack', 'histDo', 'histDepth', 'viewHist', 'viewStep', 'trailNext', 'histTrip', 'tripEntry', 'histSub', 'histTop', 'histPop', 'isView', 'hashView', 'modalKb', 'kbSel', 'modalShow', 'modalName', 'modalOpen', 'modalClose'), ctx, { filename: 'app-hist.js' });
  const tick = () => {
    for (let k = 0; k < 20 && H.pending.length; k++) {
      const n = H.pending.shift(), before = H.list[H.i].url;
      if (H.i + n < 0) { H.exits++; continue; }
      H.i += n;
      ctx.histPop();
      if (H.list[H.i].url !== before) ctx.hashView();
    }
  };
  return { ctx, H, els, steps, tick, back: () => { ctx.history.back(); tick(); }, tap: (v, o) => { ctx.go(v, o); tick(); }, view: () => vm.runInContext('activeView', ctx) };
}

test('U37: průvodce ze seznamu Moje cesty – Zpět projde kroky průvodce, pak seznam, pak Přehled (z aplikace neodejde)', () => {
  const a = app();
  a.tap('trip'); // seznam Moje cesty
  let screen = 'list';
  // Pokračovat › (trip.js listBack): návrat na seznam, dokud je průvodce vidět
  a.ctx.histSub(() => { if (screen !== 'wizard') return false; screen = 'list'; return true; }); a.tick();
  screen = 'wizard';
  a.els['#tripStep'] = {};
  a.ctx.histTrip('flight', 'stay'); a.tick(); // krok Let → Ubytování
  assert.equal(a.H.list.length, 4);
  a.back();
  assert.deepEqual(a.steps, ['flight'], 'nejdřív krok průvodce zpátky');
  assert.equal(screen, 'wizard');
  a.els['#tripStep'] = null;
  a.back();
  assert.equal(screen, 'list', 'Zpět z průvodce = seznam Moje cesty');
  assert.equal(a.view(), 'trip');
  a.back();
  assert.equal(a.view(), 'dashboard');
  assert.equal(a.H.exits, 0);
});

test('U37: „‹ Moje cesty“ nad průvodcem (histTop) – kroky průvodce pryč, Zpět ze seznamu hned na Přehled', () => {
  const a = app();
  a.tap('trip');
  a.ctx.histSub(() => true); a.tick();
  a.els['#tripStep'] = {};
  a.ctx.histTrip('flight', 'stay'); a.tick();
  assert.equal(a.H.list.length, 4);
  a.ctx.histTop(); a.tick(); // showMine
  a.els['#tripStep'] = null;
  assert.equal(a.H.i, 1, 'zpátky na kroku sekce Cesty');
  assert.equal(a.ctx.location.hash, '#trip');
  a.back();
  assert.equal(a.view(), 'dashboard', 'jedno Zpět, ne „naprázdno“');
  assert.equal(a.H.exits, 0);
  // bez kroků průvodce nic nevrací
  const b = app();
  b.tap('trip');
  b.ctx.histTop(); b.tick();
  assert.equal(b.H.i, 1);
  // krok průvodce pod odbočkou do jiné sekce (panel na počítači: Cesty → Objevuj → Cesty se seznamem) se nevrací –
  // jinak by návrat z Cest odešel zpátky do Objevuj
  const c = app();
  c.tap('trip');
  c.els['#tripStep'] = {};
  c.ctx.histTrip('flight', 'stay'); c.tick();
  c.els['#tripStep'] = null;
  c.tap('explore', { drill: true });
  c.tap('trip', { drill: true });
  c.ctx.histTop(); c.tick();
  assert.equal(c.view(), 'trip');
  assert.equal(c.ctx.location.hash, '#trip');
  assert.equal(c.H.i, 4);
  // 🔎 Prozkoumat v Objevuj (krok sekce Objevuj), odkazy do Letů a Cest, krok průvodce, ‹ Moje cesty: jen krok průvodce
  const e = app();
  e.tap('explore');
  e.ctx.histSub(() => true); e.tick();
  e.tap('flights', { drill: true });
  e.tap('trip', { drill: true });
  e.els['#tripStep'] = {};
  e.ctx.histTrip('flight', 'stay'); e.tick();
  e.ctx.histTop(); e.tick();
  assert.equal(e.view(), 'trip');
  assert.equal(e.H.i, 4, 'na kroku Cest pod průvodcem');
  // Pokračovat › ze seznamu bez kroku průvodce: ‹ Moje cesty vrátí jen krok seznamu
  const f = app();
  f.tap('trip');
  f.ctx.histSub(() => true); f.tick();
  f.ctx.histTop(); f.tick();
  assert.equal(f.H.i, 1);
  // showMine a Trip.mine kroky uklidí
  assert.match(TRIP, /mineFor = t\.created; render\(\); if \(typeof histTop === 'function'\) histTop\(\);/);
  assert.match(TRIP, /safeRender\(\);\n\s*if \(typeof histTop === 'function'\) histTop\(\);/);
});

// --- U45 ---
test('U45: štítek „/“ u pole Kam se jménem „Zkratka: /“, jen na počítači; Přeskočit na obsah první v <body>', () => {
  assert.match(HTML, /<span class="hs-lab">Kam<kbd class="hs-key" role="img" aria-label="Zkratka: \/" title="Zkratka: \/">\/<\/kbd><\/span>/);
  assert.match(read('css/flights.css'), /^\.hs-key\{display:none\}/m);
  const desk = read('css/desktop-flights.css');
  assert.match(desk, /^@media \(min-width:1024px\)/m);
  assert.match(desk, /\n {2}\.hero-search2 \.hs-key\{display:inline-grid;/);
  assert.doesNotMatch(desk, /hs-lab::after/, 'dřív ::after – čtečka četla jen lomítko');
  // odkaz už byl (test/klavesnice.test.js) – hlídáme jen, že je pořád první
  assert.match(HTML.slice(HTML.indexOf('<body>') + 6).trimStart().replace(/^<!--[\s\S]*?-->\s*/, ''), /^<a class="skip" href="#main">Přeskočit na obsah<\/a>/);
});
