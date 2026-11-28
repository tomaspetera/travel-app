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
  const ctx = vm.createContext({ $: (s) => (s === '.view.active h1' ? h1 : s === '#pageTitle' ? title : null) });
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
