// Zpět na telefonu (app.js: kroky historie sekcí, oken a průvodce Cestou) a další drobnosti cesty uživatele: uvítání
// nového uživatele místo 50 novinek (wnMode), cesta z průvodce neuložená do plánovače na kartě „Dnes na cestě“
// (Trip.unsavedNow) a sdílení odkazu nabídkou telefonu (ShareLink.send). Funkce z app.js jsou skutečné řádky vybrané
// podle jména (celý app.js potřebuje DOM), historie prohlížeče je napodobená i s asynchronním návratem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { lisbon } from './fixtures/trips-now.js';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const APP = src('app.js');
/** Konstanty a funkce z app.js podle jména (jednořádkové i víceřádkové). */
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = (?:.*\\{\\n[\\s\\S]*?^\\};|.*)|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
const plain = (x) => JSON.parse(JSON.stringify(x));

/**
 * Aplikace v node:vm s napodobenou historií: pushState / replaceState hned, go(-n) až při tick() (jako v prohlížeči
 * asynchronně) – pak popstate a při změně # hashchange (hashView). Návrat z prvního kroku = odchod z aplikace (exits).
 */
function app() {
  const H = { list: [{ url: '', state: null }], i: 0, pending: [], exits: 0 };
  const el = () => { const c = new Set(); return { innerHTML: '', scrollTop: 0, contains: () => false, setAttribute() {}, removeAttribute() {}, classList: { add: (k) => c.add(k), remove: (k) => c.delete(k), contains: (k) => c.has(k), toggle: (k, on) => (on ? c.add(k) : c.delete(k)) } }; };
  const els = { '#modalBg': el(), '#modal': el(), '#toast': el() };
  const copy = (s) => (s == null ? null : structuredClone(s));
  const ctx = {
    console, structuredClone, setTimeout: () => 0, clearTimeout: () => {}, Number, Math, Boolean,
    $: (s) => els[s], scrolls: [],
    document: { activeElement: null }, // modalOpen si pamatuje tlačítko, které okno otevřelo (modalKb – fokus na počítači)
    location: { get hash() { return H.list[H.i].url; } },
    history: {
      get state() { return H.list[H.i].state; },
      pushState(st, t, url) { H.list = H.list.slice(0, H.i + 1); H.list.push({ url: url ?? H.list[H.i].url, state: copy(st) }); H.i++; },
      replaceState(st, t, url) { H.list[H.i] = { url: url ?? H.list[H.i].url, state: copy(st) }; },
      go(n) { H.pending.push(n); },
      back() { H.pending.push(-1); },
    },
    window: { addEventListener() {}, scrollY: 0, scrollTo(x, y) { ctx.scrolls.push(y); } },
    showNow() {},
  };
  ctx.Trip = ctx.window.Trip = {
    step: 'flight',
    stepTo(s) { if (s === ctx.Trip.step) return false; ctx.Trip.step = s; return true; },
  };
  vm.createContext(ctx);
  vm.runInContext(`var activeView = 'dashboard'; var NAV = ['dashboard', 'flights', 'trip', 'explore', 'planner'].map(k => [k]);
    // go() jako v app.js – jen pohled a jeho zápis do historie (stejný řádek jako v go)
    function go(v, opts = {}) {
      const from = activeView, y0 = opts.noHash ? 0 : Math.round(window.scrollY || 0);
      activeView = v;
      if (!opts.noHash) histDo(() => viewStep(v, opts.drill, from === 'dashboard' || opts.drill ? y0 : null));
    }`, ctx);
  vm.runInContext(pick('hist', 'histFlush', 'histBack', 'histDo', 'histDepth', 'viewHist', 'viewStep', 'trailNext', 'histTrip', 'tripEntry', 'histPop', 'hashView', 'modalKb', 'kbSel', 'modalShow', 'modalName', 'modalOpen', 'modalClose'), ctx, { filename: 'app-hist.js' });
  // go() v app.js volá viewStep přes histDo – ověřit, že řádek ve stubu je opravdu ten z app.js
  assert.ok(APP.includes("if (!opts.noHash) histDo(() => viewStep(v, opts.drill, from === 'dashboard' || opts.drill ? y0 : null));"), 'go(): zápis do historie');
  // posun stránky se čte jen pro nový krok (čtení scrollY vynutí rozvržení – při startu zbytečně)
  assert.ok(APP.includes('const from = activeView, y0 = opts.noHash ? 0 : Math.round(window.scrollY || 0);'), 'go(): posun jako ve stubu');
  /** Prohlížeč dokončí naplánované návraty (každý svým popstate, pak hashchange). */
  const tick = () => {
    for (let k = 0; k < 20 && H.pending.length; k++) {
      const n = H.pending.shift(), before = H.list[H.i].url;
      if (H.i + n < 0) { H.exits++; continue; }
      H.i += n;
      ctx.histPop();
      if (H.list[H.i].url !== before) ctx.hashView();
    }
  };
  const back = () => { ctx.history.back(); tick(); };
  const tap = (v, o) => { ctx.go(v, o); tick(); };
  const view = () => vm.runInContext('activeView', ctx);
  const modal = () => els['#modalBg'].classList.contains('show');
  return { ctx, H, tick, back, tap, view, modal, trip: ctx.window.Trip };
}

test('Zpět: sekce z lišty vrátí na Přehled a teprve z něj aplikace skončí; přepínání sekcí historii nehromadí', () => {
  const a = app();
  a.tap('flights'); a.tap('trip'); a.tap('explore');
  assert.equal(a.H.list.length, 2, 'Přehled + jeden krok sekce');
  assert.equal(a.ctx.location.hash, '#explore');
  a.back();
  assert.equal(a.view(), 'dashboard');
  assert.equal(a.H.exits, 0);
  a.back();
  assert.equal(a.H.exits, 1, 'z Přehledu Zpět aplikaci zavře');
  // Přehled z lišty = krok sekce zpět (ne nový krok nad ní)
  const b = app();
  b.tap('flights'); b.tap('dashboard');
  assert.equal(b.H.i, 0);
  assert.equal(b.ctx.location.hash, '#dashboard');
  b.back();
  assert.equal(b.H.exits, 1);
});

test('Zpět: otevřené okno zavře a sekce zůstane; ✕ a hned jiná sekce nebo další okno historii nerozbijí', () => {
  const a = app();
  a.tap('flights');
  a.ctx.modalOpen('<p>Info o zemi</p>');
  assert.equal(a.H.list.length, 3);
  a.back();
  assert.equal(a.modal(), false);
  assert.equal(a.view(), 'flights', 'Zpět zavřelo jen okno');
  a.back();
  assert.equal(a.view(), 'dashboard');
  // ⋯ Další → dlaždice: modalClose(); go(…) – zápis sekce počká na návrat z kroku okna
  const b = app();
  b.ctx.modalOpen('<p>Další</p>');
  b.ctx.modalClose(); b.ctx.go('planner'); b.tick();
  assert.equal(b.ctx.location.hash, '#planner');
  assert.deepEqual(plain(b.H.list.map((x) => x.url)), ['#dashboard', '#planner'], 'krok okna je pryč, sekce nad Přehledem');
  b.back();
  assert.equal(b.view(), 'dashboard');
  assert.equal(b.H.exits, 0);
  // ✕ a hned další okno (Přenos a záloha): Zpět zavře to nové
  const c = app();
  c.tap('flights');
  c.ctx.modalOpen('<p>Další</p>');
  c.ctx.modalClose(); c.ctx.modalOpen('<p>Záloha</p>'); c.tick();
  assert.equal(c.modal(), true);
  assert.equal(c.H.list.length, 3);
  c.back();
  assert.equal(c.modal(), false);
  assert.equal(c.view(), 'flights');
  // okno otevřené a zavřené dřív, než se stihl zapsat jeho krok: žádný návrat navíc (nevyjde z aplikace)
  const d = app();
  d.ctx.modalOpen('<p>1</p>');
  d.ctx.modalClose(); d.ctx.modalOpen('<p>2</p>'); d.ctx.modalClose(); d.tick();
  assert.equal(d.H.exits, 0);
  assert.equal(d.H.i, 0);
  // okno otevřené z okna (Info o zemi z náhledu) krok nepřidá
  const e = app();
  e.ctx.modalOpen('<p>A</p>'); e.ctx.modalOpen('<p>B</p>');
  assert.equal(e.H.list.length, 2);
});

test('Zpět v průvodci Cestou: po krocích, kterými uživatel prošel, pak k výsledkům, ze kterých let je – i s posunem', () => {
  const a = app();
  a.tap('flights');
  a.ctx.window.scrollY = 907; // uživatel sjel na nabídku
  a.tap('trip', { drill: true }); // Vybrat a pokračovat
  a.ctx.window.scrollY = 0;
  const step = (s) => { a.ctx.histTrip(a.trip.step, s); a.trip.step = s; a.tick(); };
  step('route'); step('stay'); step('car');
  assert.equal(a.H.list.length, 4, 'Přehled, Lety, Cesta a jeden krok průvodce – ne krok na každý krok');
  a.back(); assert.equal(a.trip.step, 'stay');
  a.back(); assert.equal(a.trip.step, 'route');
  a.back(); assert.equal(a.trip.step, 'flight');
  assert.equal(a.view(), 'trip');
  a.back();
  assert.equal(a.view(), 'flights', 'zpět k výsledkům');
  assert.equal(a.ctx.scrolls.at(-1), 907, 'na nabídku, ze které let je');
  a.back();
  assert.equal(a.view(), 'dashboard');
  assert.equal(a.H.exits, 0);
});

test('průvodce: návrat lištou kroků cestu zkrátí, odchod z Cesty ji zahodí a sekce z lišty jde rovnou na Přehled', () => {
  assert.deepEqual(new Function(`${pick('trailNext')}; return trailNext;`)()(['flight', 'route', 'stay'], 'car', 'route'), ['flight']);
  assert.deepEqual(new Function(`${pick('trailNext')}; return trailNext;`)()(['flight'], 'route', 'stay'), ['flight', 'route']);
  const a = app();
  a.tap('trip');
  const step = (s) => { a.ctx.histTrip(a.trip.step, s); a.trip.step = s; a.tick(); };
  step('summary'); step('stay'); step('summary'); // ⚡ hotová cesta, pak Ubytování a zpět do Shrnutí
  a.back();
  assert.equal(a.trip.step, 'flight', 'Shrnutí → Let (bez kroužení přes Ubytování)');
  a.back();
  assert.equal(a.view(), 'dashboard');
  // z kroku průvodce do Objevuj (lišta): Zpět → Přehled, ne zpět do průvodce
  const b = app();
  b.tap('trip');
  b.ctx.histTrip('flight', 'route'); b.trip.step = 'route'; b.tick();
  b.tap('explore');
  assert.deepEqual(plain(b.H.list.slice(0, b.H.i + 1).map((x) => x.url)), ['#dashboard', '#explore']);
  assert.deepEqual(plain(vm.runInContext('hist.trail', b.ctx)), []);
  b.back();
  assert.equal(b.view(), 'dashboard');
  // 💾 Uložit do plánovače ze Shrnutí (krok z obsahu): Zpět vrátí do Shrnutí, další Zpět krok průvodce před ním
  const d = app();
  d.tap('trip');
  d.ctx.histTrip('flight', 'summary'); d.trip.step = 'summary'; d.tick();
  d.tap('planner', { drill: true });
  d.back();
  assert.equal(d.view(), 'trip');
  assert.equal(d.trip.step, 'summary');
  d.back();
  assert.equal(d.trip.step, 'flight');
  d.back();
  assert.equal(d.view(), 'dashboard');
  assert.equal(d.H.exits, 0);
  // okno nad krokem průvodce: Zpět zavře okno, další Zpět vrátí krok
  const c = app();
  c.tap('trip');
  c.ctx.histTrip('flight', 'route'); c.trip.step = 'route'; c.tick();
  c.ctx.modalOpen('<p>Další</p>');
  c.back();
  assert.equal(c.modal(), false);
  assert.equal(c.trip.step, 'route');
  c.back();
  assert.equal(c.trip.step, 'flight');
});

test('Zpět po obnovení stránky (Shrnutí → Uložit do plánovače, telefon pak aplikaci na pozadí zavřel): krok průvodce bez cesty kroků se přeskočí', () => {
  const a = app();
  a.tap('flights');
  a.tap('trip', { drill: true }); // Vybrat a pokračovat
  a.ctx.histTrip('flight', 'summary'); a.trip.step = 'summary'; a.tick();
  a.tap('planner', { drill: true }); // 💾 Uložit do plánovače
  assert.deepEqual(plain(a.H.list.map((x) => x.url)), ['#dashboard', '#flights', '#trip', '#trip', '#planner']);
  // obnovená stránka: stejná historie, aplikace začíná znovu na plánovači (cesta kroků průvodce je zapomenutá)
  const b = app();
  b.H.list = a.H.list; b.H.i = a.H.i;
  vm.runInContext("activeView = 'planner'", b.ctx);
  b.back();
  assert.equal(b.view(), 'trip', 'Zpět z plánovače do průvodce');
  b.back();
  assert.equal(b.view(), 'flights', 'další Zpět k výsledkům – ne „nic“ na kroku průvodce z doby před obnovením');
  b.back();
  assert.equal(b.view(), 'dashboard');
  assert.equal(b.H.exits, 0);
  // obnoveno s oknem (⋯ Další) otevřeným nad krokem průvodce: start() krok okna přeskočí – a s ním i krok průvodce
  assert.ok(APP.includes('if (history.state && (history.state.atlasM || history.state.atlasDp || history.state.atlasT)) histBack();'), 'start(): krok okna nebo průvodce po obnovení přeskočit');
  const c = app();
  c.tap('flights');
  c.tap('trip', { drill: true });
  c.ctx.histTrip('flight', 'route'); c.trip.step = 'route'; c.tick();
  c.ctx.modalOpen('<p>Další</p>'); c.tick();
  const d = app();
  d.H.list = c.H.list; d.H.i = c.H.i;
  vm.runInContext("activeView = 'trip'", d.ctx);
  d.ctx.histBack(); d.tick(); // start()
  assert.equal(d.view(), 'trip');
  d.back();
  assert.equal(d.view(), 'flights', 'první Zpět po obnovení k výsledkům');
  assert.equal(d.H.exits, 0);
});

test('Zpět na počítači: sekce z postranního panelu přidá krok – šipka Zpět vrátí na předchozí sekci i s posunem', () => {
  // postranní panel volá go(v, { drill: true }) (app.js, .nav-item) – lišta dole na telefonu dál bez něj
  assert.match(APP, /\$\$\('\.nav-item'\)\.forEach\(el => \{[\s\S]*?el\.onclick = \(\) => go\(el\.dataset\.view, \{ drill: true \}\);/);
  const side = (a, v) => a.tap(v, { drill: true });
  const a = app();
  side(a, 'flights');
  a.ctx.window.scrollY = 640; // uživatel sjel k výsledkům
  side(a, 'explore');
  a.ctx.window.scrollY = 0;
  side(a, 'planner');
  assert.deepEqual(plain(a.H.list.map((x) => x.url)), ['', '#flights', '#explore', '#planner']);
  a.back();
  assert.equal(a.view(), 'explore');
  a.back();
  assert.equal(a.view(), 'flights');
  assert.equal(a.ctx.scrolls.at(-1), 640, 'zpět na místo ve výsledcích');
  a.back();
  assert.equal(a.view(), 'dashboard');
  assert.equal(a.H.exits, 0);
  // Přehled z panelu vrátí všechny kroky (ne další krok nad sekcemi); táž sekce znovu krok nepřidá
  const b = app();
  side(b, 'flights'); side(b, 'flights'); side(b, 'explore'); side(b, 'dashboard');
  assert.equal(b.H.i, 0);
  assert.equal(b.view(), 'dashboard');
  b.back();
  assert.equal(b.H.exits, 1);
});

test('viewHist: lišta přepisuje krok sekce, obsah přidá krok, Přehled vrátí všechny kroky', () => {
  const vh = new Function(`${pick('histDepth', 'viewHist')}; return viewHist;`)();
  assert.deepEqual(vh('flights', null, ''), { back: 0, how: 'push' });
  assert.deepEqual(vh('trip', { atlasV: 1 }, '#flights'), { back: 0, how: 'replace' });
  assert.deepEqual(vh('trip', { atlasV: 1 }, '#flights', true), { back: 0, how: 'drill' });
  assert.deepEqual(vh('explore', { atlasV: 3, atlasT: 1 }, '#trip'), { back: 2, how: 'replace' });
  assert.deepEqual(vh('planner', { atlasV: 3, atlasT: 1 }, '#trip', true), { back: 0, how: 'drill' }, 'Uložit do plánovače ze Shrnutí');
  assert.deepEqual(vh('dashboard', { atlasV: 2 }, '#trip'), { back: 2, how: 'replace' });
  assert.deepEqual(vh('dashboard', null, '#dashboard'), { back: 0, how: 'replace' });
  assert.deepEqual(vh('trip', { atlasV: 2 }, '#trip'), { back: 0, how: '' });
});

test('uvítání nového uživatele vydrží výběr domova i první hledání; novinky až s další sadou', () => {
  const S = { home: null, trip: null, trips: [], recent: [], watch: [] };
  const wnMode = new Function('S', `${pick('WN_NEW', 'firstVisit', 'wnMode')}; return wnMode;`)(S);
  assert.equal(wnMode(null, 'A'), 'welcome', 'úplně nový');
  S.home = { from: [{ id: 'city:PRG' }] }; S.recent = [{}];
  assert.equal(wnMode('A+vitej', 'A'), 'welcome', 'po výběru domova a hledání pořád uvítání, ne 50 novinek');
  assert.equal(wnMode('A', 'A'), '', 'Rozumím – skryté');
  assert.equal(wnMode('A+vitej', 'B'), 'news', 'nová sada novinek');
  assert.equal(wnMode(null, 'A'), 'news', 'dřívější uživatel bez záznamu');
  assert.equal(wnMode('stará', 'A'), 'news');
});

test('kamarád z odkazu na cestu je nováček: uvítání se zapamatuje při startu, ne až na Přehledu po importu cesty', () => {
  const S = { home: null, trip: null, trips: [], recent: [], watch: [] };
  const [wnMode, wnAtStart] = new Function('S', `${pick('WN_NEW', 'firstVisit', 'wnMode', 'wnAtStart')}; return [wnMode, wnAtStart];`)(S);
  // start: nic uloženého → uvítání hned do atlas_wn (i s odkazem na cestu, plán, krátkým odkazem /c/ → #s=, #jed=)
  for (const h of ['', '#trip=zAbc', '#plan=eyJ', '#s=Ab3kQ9xZ', '#jed=zX', '#offer=zY', '#flights']) assert.equal(wnAtStart(null, h, 'A'), 'A+vitej', h);
  // odkaz pak uloží cestu (S.trip) – Přehled pořád uvítání, ne desítky novinek
  S.trip = { dest: { label: 'Klagenfurt' }, shared: { on: '2026-10-23' } };
  assert.equal(wnMode('A+vitej', 'A'), 'welcome');
  assert.equal(wnMode(null, 'A'), 'news', 'bez zápisu při startu by kamarád dostal novinky');
  // dřívější uživatel, přenos z jiného zařízení a uložená volba se nemění
  assert.equal(wnAtStart(null, '', 'A'), null, 'už má cestu');
  S.trip = null;
  assert.equal(wnAtStart(null, '#sync=zQ', 'A'), null, 'přenos z jiného zařízení');
  assert.equal(wnAtStart('A', '#trip=zAbc', 'A'), null, 'Rozumím – skryté zůstane');
  assert.equal(wnAtStart('stará', '#trip=zAbc', 'A'), null);
});

test('✨ lišta Co je nového: jen novinky od minulého otevření (nejvýš 3), nováček nic, žádné hromadění', () => {
  const S = { home: { from: [{ id: 'city:PRG' }] }, trip: null, trips: [], recent: [{}], watch: [] };
  const wnFresh = new Function('S', `${pick('WN_NEW', 'firstVisit', 'wnMode', 'WN_POP', 'wnFresh')}; return wnFresh;`)(S);
  const L = ['E', 'D', 'C', 'B', 'A'].map((t) => ['✨', t, 'text']);
  const titles = (f) => f.show.map((x) => x[1]);
  // naposledy viděl „C“ → jen D a E (novější), C a starší ne
  assert.deepEqual(titles(wnFresh('C', 'X', L, 'X')), ['E', 'D']);
  assert.deepEqual(titles(wnFresh('E', 'X', L, 'X')), [], 'nic nového');
  // dlouho neotevřel (viděl „A“): nejvýš 3 nejnovější + kolik dalších
  const f = wnFresh('A', 'X', L, 'X');
  assert.deepEqual([titles(f), f.more], [['E', 'D', 'C'], 1]);
  // dřívější uživatel bez záznamu: kartu s aktuální sadou skryl → nic, jinak jen nejnovější
  assert.deepEqual(titles(wnFresh(null, 'X', L, 'X')), []);
  assert.deepEqual(titles(wnFresh(null, 'starší', L, 'X')), ['E']);
  // přejmenovaná novinka (název už v seznamu není) → nic místo všech
  assert.deepEqual(titles(wnFresh('neznámá', 'X', L, 'X')), []);
  // nováček s uvítáním novinky nedostane
  assert.deepEqual(titles(wnFresh(null, 'X+vitej', L, 'X')), []);
  S.home = null; S.recent = [];
  assert.deepEqual(titles(wnFresh(null, null, L, 'X')), [], 'úplně nový');
  // uložená novinka i se sadou (WN_ID); dřívější zápis jen s názvem
  const wnTopParse = new Function(`${pick('wnTopParse')}; return wnTopParse;`)();
  assert.deepEqual({ ...wnTopParse('2026-10-27a\nKrátký odkaz') }, { id: '2026-10-27a', title: 'Krátký odkaz' });
  assert.deepEqual({ ...wnTopParse('Krátký odkaz') }, { id: '', title: 'Krátký odkaz' });
  assert.deepEqual({ ...wnTopParse(null) }, { id: '', title: null });
  const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const pop = app.match(/function whatsNewPop\(\) \{[\s\S]*?\n\}/)[0];
  // starší verze stránky (z mezipaměti) nic nepřepíše – jinak by nová verze ukázala tutéž novinku znovu
  assert.match(pop, /if \(top\.id && top\.id > WN_ID\) return;/);
  // zapamatuje se se sadou, hned bez lišty i když je lišta vidět – ne až po zavření (jinak by se hromadila); schovaná
  // za lištou nové verze ne (po Obnovit by se ztratila)
  assert.match(pop, /localStorage\.setItem\(WN_TOP_LS, `\$\{WN_ID\}\\n\$\{WHATS_NEW\[0\]\[1\]\}`\)/);
  assert.match(pop, /if \(!f\.show\.length\) return mark\(\);/);
  assert.match(pop, /if \(shown\(\)\) return mark\(\);/);
  // z klávesnice: novinka se rozbalí Enterem / mezerníkem (čtečka ví, že jde rozbalit), Esc lištu zavře; ohlásí se
  assert.match(pop, /d\.tabIndex = 0; d\.setAttribute\('role', 'button'\); d\.setAttribute\('aria-expanded', 'false'\);/);
  assert.match(pop, /if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{ e\.preventDefault\(\); tog\(\); \}/);
  assert.match(pop, /bar\.onkeydown = e => \{ if \(e\.key === 'Escape'\) close\(\); \};/);
  assert.match(pop, /bar\.setAttribute\('aria-live', 'polite'\);/);
  // lišta nezakryje otevřený našeptávač ani „↓ zpět na …“ v Objevuj; na nízkém telefonu nesahá přes „Najít lety“
  const pwa = readFileSync(new URL('../public/css/pwa.css', import.meta.url), 'utf8');
  assert.match(pwa, /^body:has\(\.pi-dd:not\(\[hidden\]\)\) \.wn-pop,body:has\(\.ex-back:not\(\[hidden\]\)\) \.wn-pop\{display:none\}$/m);
  assert.match(pwa, /@media\(max-width:860px\) and \(max-height:700px\)\{\.wn-pop\{max-height:30vh\}\}/);
  // karta na Přehledu už jen uvítání
  assert.match(app, /el\.hidden = mode !== 'welcome';/);
});

test('📍 Dnes na cestě: cesta z průvodce bez uložení do plánovače → nabídka uložit (do 2 dnů před odletem až do návratu)', () => {
  const ctx = { console, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, navigator: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(pick('esc', 'enc', 'flag', 'safeUrl', 'cssUrl', 'pad', 'fmtYMD', 'fmtDate', 'czk'), ctx);
  vm.runInContext(`var S = { trips: [] }, __go = [], __toasts = [];
    var $ = () => ({ innerHTML: '', value: '' }); var $$ = () => []; var go = (v) => { __go.push(v); }; var save = () => {};
    var toast = (m) => { __toasts.push(m); }; var confirm = () => true; var byIso = { PT: { cs: 'Portugalsko' } }; var PACK = ['Pas'];`, ctx);
  for (const f of ['ics.js', 'planshare.js', 'backup.js', 'trip.js']) vm.runInContext(src(f), ctx, { filename: f });
  vm.runInContext(pick('daysTo', 'inDays', 'nowUnsaved'), ctx);
  const T = ctx.Trip;
  ctx.S.trip = lisbon(); // 12. 11. – 17. 11.
  assert.equal(T.unsavedNow('2026-11-09'), null, '3 dny před odletem ještě ne');
  assert.deepEqual(plain(T.unsavedNow('2026-11-10')), { label: 'Lisabon', cc: 'PT', start: '2026-11-12', end: '2026-11-17' });
  assert.ok(T.unsavedNow('2026-11-17'));
  assert.equal(T.unsavedNow('2026-11-18'), null, 'po návratu ne');
  const h = ctx.nowUnsaved('2026-11-14');
  assert.match(h, /Cesta 🇵🇹 Lisabon právě probíhá/);
  assert.match(h, /data-nw-save/);
  assert.match(ctx.nowUnsaved('2026-11-11'), /začíná zítra/);
  // uložení z karty: zůstane na Přehledu (bez přepnutí do plánovače), pak už se nenabízí
  T.saveToPlanner({ stay: true });
  assert.deepEqual(plain(ctx.__go), []);
  assert.equal(ctx.S.trips.length, 1);
  assert.equal(T.unsavedNow('2026-11-14'), null);
  assert.equal(ctx.nowUnsaved('2026-11-14'), '');
  // tlačítko ve Shrnutí dál otevře plánovač
  T.saveToPlanner();
  assert.deepEqual(plain(ctx.__go), ['planner']);
  assert.equal(ctx.S.trips.length, 1, 'stejná cesta se aktualizuje');
});

test('ShareLink.send: na telefonu nabídka sdílení (zavřená nabídka nic nekopíruje), s myší a bez ní do schránky', async () => {
  const load = ({ coarse, share }) => {
    const copied = [], shared = [];
    const ctx = { window: {}, TextEncoder, TextDecoder, btoa, atob, Blob, CompressionStream, DecompressionStream, location: { origin: 'https://atlas.example', pathname: '/' },
      navigator: { clipboard: { writeText: async (u) => { copied.push(u); } }, ...(share ? { share: async (d) => { shared.push(d); if (share === 'abort') throw Object.assign(new Error('x'), { name: 'AbortError' }); } } : {}) },
      matchMedia: (q) => ({ matches: q === '(pointer: coarse)' && coarse }) };
    vm.createContext(ctx);
    vm.runInContext(src('sharelink.js'), ctx);
    return { L: ctx.window.ShareLink, copied, shared };
  };
  const json = JSON.stringify({ a: 1 });
  const phone = load({ coarse: true, share: true });
  assert.equal(phone.L.native(), true);
  const r = await phone.L.send('trip', json, { title: 'T', text: 'X' });
  assert.equal(r.shared, true);
  assert.equal(phone.shared.length, 1);
  assert.match(phone.shared[0].url, /^https:\/\/atlas\.example\/#trip=/);
  assert.equal(phone.copied.length, 0);
  const ab = load({ coarse: true, share: 'abort' });
  assert.equal((await ab.L.send('trip', json)).aborted, true);
  assert.equal(ab.copied.length, 0, 'rozmyslel si to – nic nekopírovat');
  const pc = load({ coarse: false, share: true });
  assert.equal(pc.L.native(), false);
  assert.equal((await pc.L.send('plan', json)).copied, true);
  assert.equal(pc.shared.length, 0);
  assert.match(pc.copied[0], /#plan=/);
});
