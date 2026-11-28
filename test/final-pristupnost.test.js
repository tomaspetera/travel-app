// Závěrečná kontrola před spuštěním – přístupnost a pravdivé texty: neviditelná hláška mimo pořadí Tab, fokus po přepnutí
// sekce z Přehledu, nadpis 1. úrovně u výsledků Letů, pořadí nadpisů uvítání, souhrn cesty se zpátečním letem z jiného
// letiště a úvod průvodce, který platí i na počítači. Skutečné funkce z app.js a trip.js v node:vm se zástupným DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const appJs = read('js/app.js'), tripJs = read('js/trip.js'), flightsJs = read('js/flights.js'), tripCss = read('css/trip.css');
/** Funkce z app.js podle jména (víceřádková do „}“ na začátku řádku). */
const pick = (name) => {
  const m = appJs.match(new RegExp(`^function ${name}\\([\\s\\S]*?^\\}$`, 'm'));
  assert.ok(m, `app.js: ${name}`);
  return m[0];
};

test('hláška po zmizení: obsah visibility hidden – neviditelné „↩ Vrátit“ není v pořadí Tab ani pro čtečku', () => {
  assert.match(tripCss, /\n\.toast:not\(\.show\)>\*\{visibility:hidden\}\n\.toast>\*\{transition:visibility \.3s\}/);
  // samotná hláška (role status) zůstane vidět – schovaná oblast s obsahem vloženým při ukázání se čtečce nemusí ohlásit
  assert.doesNotMatch(tripCss, /\.toast:not\(\.show\)\{[^}]*visibility/);
  // obsah schová až po doběhnutí přechodu, stejně dlouhého jako zmizení hlášky (atlas.css)
  assert.match(read('css/atlas.css'), /\.toast\{[^}]*transition:\.3s var\(--ease\)/);
});

test('výsledky Letů: h1 schovaný sbaleným formulářem se nepočítá – nadpisem 1. úrovně je název v liště', () => {
  const a = {};
  const t = { getAttribute: (k) => a[k] ?? null, setAttribute: (k, v) => { a[k] = v; }, removeAttribute: (k) => { delete a[k]; } };
  let rects = 1;
  let h1 = { closest: (s) => (s === '.fl-hero' ? {} : null), getClientRects: () => Array(rects).fill({}) };
  const ctx = vm.createContext({ $: (s) => (s === '#pageTitle' ? t : s === '.view.active h1' ? h1 : null) });
  vm.runInContext(pick('pageHeading'), ctx);
  ctx.pageHeading();
  assert.deepEqual({ ...a }, {}, 'před hledáním: h1 „Najdi levné letenky“ ve fotce');
  rects = 0; ctx.pageHeading();
  assert.deepEqual({ ...a }, { role: 'heading', 'aria-level': '1' }, 'po hledání: fotka s h1 je display:none');
  // Přehled (h1 mimo .fl-hero): rozvržení se nečte – při startu běží při každé změně stránky
  h1 = { closest: () => null, getClientRects: () => { throw new Error('čtení rozvržení na Přehledu'); } };
  ctx.pageHeading();
  assert.deepEqual({ ...a }, {});
});

test('přepnutí sekce s fokusem ve schované sekci (Najít lety na Přehledu): fokus na nadpis nové sekce, ne na začátek stránky', () => {
  const focused = [];
  const el = (name, rects) => ({ name, tabIndex: 0, getClientRects: () => Array(rects).fill({}), focus(o) { focused.push([name, this.tabIndex, o.preventScroll]); } });
  let h1 = el('h1', 1);
  const title = el('pageTitle', 1);
  const ctx = vm.createContext({ $: (s) => (s === '.view.active h1' ? h1 : s === '#pageTitle' ? title : null), kbSel: () => '' });
  vm.runInContext(pick('viewFocus'), ctx);
  const inView = (hidden) => ({ closest: (s) => (s === '.view:not(.active)' && hidden ? {} : null) });
  ctx.viewFocus(inView(false)); ctx.viewFocus(null); ctx.viewFocus({});
  assert.deepEqual(focused, [], 'fokus v nové sekci, v liště nebo v okně zůstane, kde je');
  ctx.viewFocus(inView(true));
  assert.deepEqual(focused, [['h1', -1, true]], 'h1 ve fotce Letů');
  h1 = el('h1', 0); ctx.viewFocus(inView(true));
  assert.deepEqual(focused[1], ['pageTitle', -1, true], 'h1 schovaný (výsledky z dřívějška) → název v liště');
  h1 = null; ctx.viewFocus(inView(true));
  assert.equal(focused[2][0], 'pageTitle', 'sekce bez h1');
  // go() si fokus přečte před přepnutím sekce a předá ho až po novém názvu v liště
  const go = pick('go');
  assert.ok(go.indexOf('const a0 = document.activeElement;') < go.indexOf("$$('.view').forEach"));
  assert.ok(go.indexOf("$('#pageSub').textContent = nv[2];") < go.indexOf('viewFocus(a0);'));
  // hledání hned po přepnutí (Najít lety) fokus z nadpisu posune na průběh – h1 ve fotce sbalený formulář schová
  assert.match(flightsJs, /if \(document\.activeElement === document\.body \|\| document\.activeElement\.matches\('h1, #pageTitle'\)\) \{ const pg = \$\('#progress'\); pg\.tabIndex = -1; pg\.focus\(\{ preventScroll: true \}\); \}/);
});

test('uvítání na Přehledu: nadpis 2. úrovně hned pod h1 (ne h3)', () => {
  assert.match(appJs, /<h2 class="wc-h">Vítej!/);
  assert.doesNotMatch(appJs, /<h3 class="wc-h">/);
  assert.doesNotMatch(read('css/atlas.css') + read('css/letsi.css'), /h3\.wc-h|\.welcome h3/, 'vzhled drží třída wc-h');
});

test('souhrn cesty: zpáteční let z jiného letiště napíše trasu zpět, „a zpět“ jen při návratu stejnou trasou', () => {
  const src = tripJs.match(/^ {2}const flightLine = .*$/m);
  assert.ok(src, 'trip.js: flightLine');
  const ctx = vm.createContext({});
  vm.runInContext(`${src[0]}; this.flightLine = flightLine;`, ctx);
  const L = (o, b) => ctx.flightLine({ out: { from: o[0], to: o[1] }, back: b && { from: b[0], to: b[1] } });
  assert.equal(L(['PRG', 'CIA'], ['FCO', 'PRG']), 'PRG → CIA, zpět FCO → PRG');
  assert.equal(L(['PRG', 'FCO'], ['FCO', 'PRG']), 'PRG → FCO a zpět');
  assert.equal(L(['PRG', 'FCO'], ['FCO', 'VIE']), 'PRG → FCO, zpět FCO → VIE', 'návrat do jiného města');
  assert.equal(L(['PRG', 'FCO'], null), 'PRG → FCO');
  assert.match(tripJs, /: isFly\(t\) \? `\$\{f\.out\.from\} → \$\{f\.out\.to\} · \$\{allLegs\(t\)\.length\} lety` : flightLine\(f\)/);
});

test('úvod průvodce: krok Let odkazuje na pole jménem (na počítači je vedle, ne výš)', () => {
  assert.match(tripJs, /<b>Let<\/b><small>Do pole <b>Kam chceš jet\?<\/b> napiš, kam chceš/);
  assert.match(tripJs, /const askHtml = \(lead = 'Kam chceš jet\?'\)/);
  assert.doesNotMatch(tripJs, /Napiš výš/);
});

/* ---------- 6. regresní kontrola: fokus v okně cesty, ↩ Vrátit z klávesnice, přepínač Svět, Objevuj podruhé ---------- */
const CSSx = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
/** Zástupný prvek s atributy (kbSel je čte přes .attributes). */
const node = (tag, attrs = {}, extra = {}) => ({ tagName: tag, id: attrs.id || '', attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })), ...extra });

test('okno cesty po úpravě a zavření: název karty (tt-open) má data-tt s indexem cesty – kbSel najde tutéž cestu i v překresleném seznamu', () => {
  const fn = appJs.slice(appJs.indexOf('function myTrips('), appJs.indexOf('function newTrip('));
  assert.match(fn, /<button type="button" class="tt-open" data-tt="\$\{el\.dataset\.mt\}">/);
  assert.doesNotMatch(fn, /class="tt-open" data-mt=/, 'data-mt vybírá karty – klik by se zdvojil');
  const kbSel = new Function('document', 'CSS', `${pick('kbSel')}; return kbSel;`)({ body: {} }, CSSx);
  assert.equal(kbSel(node('BUTTON', { type: 'button', class: 'tt-open', 'data-tt': '2' })), 'button[data-tt="2"]');
});

test('↩ Vrátit nad otevřeným oknem: Tab z posledního prvku okna na tlačítko hlášky a z něj zpět na začátek (Shift+Tab obráceně)', () => {
  const src = appJs.match(/^document\.addEventListener\('keydown', e => \{\n {2}if \(e\.key !== 'Tab'[\s\S]*?^\}\);$/m);
  assert.ok(src, 'app.js: past na Tab v okně');
  const box = (name, closed = false, tagName = 'BUTTON') => ({ name, tagName, closest: (s) => (s === 'details:not([open])' && closed ? {} : null), getClientRects: () => [{}], focus() { ctx.document.activeElement = this; } });
  const first = box('first'), mid = box('mid'), last = box('last'), ta = box('Vrátit'), m = { ...box('modal'), contains: (x) => [m, first, mid, last].includes(x) };
  let toastOn = true, handler;
  const ctx = vm.createContext({
    document: { activeElement: null, addEventListener: (k, fn) => { handler = fn; } },
    getComputedStyle: () => ({ visibility: 'visible' }),
    $: (s) => (s === '#modalBg' ? { classList: { contains: () => true } } : s === '#modal' ? m : s === '#toast.show .toast-act' ? (toastOn ? ta : null) : null),
    $$: () => [first, mid, last],
  });
  vm.runInContext(src[0], ctx);
  const tab = (from, shiftKey = false) => { ctx.document.activeElement = from; let p = false; handler({ key: 'Tab', shiftKey, defaultPrevented: false, preventDefault: () => { p = true; } }); return p ? ctx.document.activeElement.name : 'prohlížeč'; };
  assert.equal(tab(last), 'Vrátit');
  assert.equal(tab(ta), 'first');
  assert.equal(tab(first, true), 'Vrátit');
  assert.equal(tab(ta, true), 'last');
  assert.equal(tab(mid), 'prohlížeč', 'uvnitř okna dál pořadí prohlížeče');
  toastOn = false;
  assert.equal(tab(last), 'first', 'bez hlášky koluje jen v okně');
  // Přenos: pole a tlačítko v zavřeném <details> nejsou vidět (rozměry ale mají) – summary je poslední prvek okna
  const sum = box('summary', true, 'SUMMARY'), hidIn = box('tfIn', true), hidBtn = box('tfLoad', true);
  ctx.$$ = () => [first, sum, hidIn, hidBtn];
  m.contains = (x) => [m, first, sum, hidIn, hidBtn].includes(x);
  assert.equal(tab(sum), 'first', 'z posledního viditelného prvku zpět na začátek, ne z okna ven');
  assert.equal(tab(first, true), 'summary', 'Shift+Tab ze začátku na summary');
});

test('hláška s ↩ Vrátit se neschová, dokud má tlačítko fokus (Tab) – fokus by spadl na začátek stránky', () => {
  const timers = [];
  const cls = new Set();
  const btn = {};
  const t = { innerHTML: '', classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) }, contains: (x) => x === btn };
  const ctx = vm.createContext({
    $: (s) => (s === '#toast' ? t : s === '.toast-act' ? btn : null), esc: String,
    document: { activeElement: btn }, setTimeout: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimeout() {},
  });
  vm.runInContext(pick('toast'), ctx);
  ctx.toast('Aktivita smazána', '', 6000, { label: '↩ Vrátit', run() {} });
  assert.equal(timers[0][1], 6000);
  timers.shift()[0]();
  assert.ok(cls.has('show'), 'fokus na Vrátit → pořád vidět');
  ctx.document.activeElement = {};
  timers.shift()[0]();
  assert.ok(!cls.has('show'), 'fokus pryč → schová se');
});

test('Esc s fokusem na ↩ Vrátit nad oknem: fokus zpět na tutéž cestu (data-tt), ne na hlášce – po ní by spadl na začátek stránky', () => {
  const cb = appJs.match(/new MutationObserver\((\(\) => \{[\s\S]*?\n\})\)\.observe\(\$\('#modalBg'\)/)[1];
  const focused = [];
  const ta = { tagName: 'BUTTON' }, card = { tagName: 'BUTTON', getClientRects: () => [{}], focus: () => focused.push('karta') };
  const m = { contains: () => false }, bg = { classList: { contains: () => false }, contains: () => false }, toast = { contains: (x) => x === ta };
  const ctx = vm.createContext({ $: (s) => (s === '#modal' ? m : s === '#toast' ? toast : bg), $$: (s) => (s === 'button[data-tt="1"]' ? [card] : []),
    kbNear: () => null, document: { activeElement: ta, body: {} }, modalKb: { on: true, fresh: false, ret: null, sel: 'button[data-tt="1"]', box: '' } });
  vm.runInContext(`this.cb = ${cb};`, ctx);
  ctx.cb();
  assert.deepEqual(focused, ['karta']);
  // schovaná hláška s fokusem (klik myší na Vrátit) už nečeká po vteřině – není na co
  assert.match(pick('toast'), /const hide = \(\) => \{ if \(t\.classList\.contains\('show'\) && t\.contains\(document\.activeElement\)\)/);
});

test('přepínač Svět Mapa ↔ Země: fokus na stejné tlačítko v nové sekci, ne na nadpis; Objevuj: fokus až po vykreslení', () => {
  const focused = [];
  const twin = { getClientRects: () => [{}], focus() { focused.push('twin'); } };
  const h1 = { tabIndex: 0, getClientRects: () => [{}], focus() { focused.push('h1'); } };
  let shown = true;
  const ctx = vm.createContext({ document: { body: {} }, CSS: CSSx,
    $: (s) => (s === '.view.active button[data-w="countries"]' || s === '.view.active div[data-qf="0"]' ? (shown ? twin : null) : s === '.view.active h1' ? h1 : null) });
  vm.runInContext(`${pick('kbSel')}\n${pick('viewFocus')}`, ctx);
  const zeme = node('BUTTON', { type: 'button', 'data-w': 'countries' }, { closest: (s) => (s === '.view:not(.active)' ? {} : null), matches: (s) => s === '.world-tabs [data-w]' });
  ctx.viewFocus(zeme);
  assert.deepEqual(focused, ['twin']);
  shown = false; ctx.viewFocus(zeme);
  assert.deepEqual(focused, ['twin', 'h1'], 'bez dvojčete nadpis jako dřív');
  // dlaždice Rychlého hledání z Přehledu má dvojče i v Letech – fokus ale na nadpis (startSearch ho dá na průběh), ne na dlaždici pod výsledky
  shown = true;
  const qf = node('DIV', { 'data-qf': '0' }, { closest: (s) => (s === '.view:not(.active)' ? {} : null), matches: () => false });
  ctx.viewFocus(qf);
  assert.deepEqual(focused, ['twin', 'h1', 'h1']);
  // go(): viewFocus až po lazyView – Objevuj si nadpis překreslí (renderExplore) a fokus na starém by spadl na <body>
  const go = pick('go');
  assert.equal(go.split('viewFocus(a0)').length, 2, 'jen jednou');
  assert.ok(go.indexOf("lazyView('places', '#exploreRoot'") < go.indexOf('viewFocus(a0)'));
  assert.ok(go.indexOf("lazyView('trip', '#tripRoot'") < go.indexOf('viewFocus(a0)'));
});
