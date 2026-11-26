// Objevuj: okruh po výběru místa z přehledu země, pořadí návrhů (země celým názvem nahoře, začátkem názvu pod místy;
// městečko Amalfi před oblastí Amalfi) a Zpět z 🔎 Prozkoumat zpátky na přehled země (krok historie histSub v app.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { config } from '../server/config.js';

const { geocodeExplore, townBeforeRegion } = await import('../server/lib/places.js');
const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const APP = src('app.js');
const plain = (x) => JSON.parse(JSON.stringify(x));
const demo = async (fn) => {
  const mock = config.mock;
  config.mock = true;
  try { return await fn(); } finally { config.mock = mock; }
};

/** places.js v node:vm se zeměmi (byIso) a větami (smart.js); extra = náhrady prohlížeče ($, localStorage…). */
function load(extra = {}) {
  const countries = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url), 'utf8'));
  const byIso = Object.fromEntries(countries.map((c) => [c.iso2, c]));
  const ctx = { window: {}, URLSearchParams, console, byIso, ...extra };
  vm.createContext(ctx);
  vm.runInContext(APP.match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('smart.js'), ctx, { filename: 'smart.js' });
  vm.runInContext(src('places.js'), ctx, { filename: 'places.js' });
  return ctx.window.Places._t;
}
const store = () => { const m = {}; return { m, getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

test('výběr města z přehledu země: okruh v km (zapamatovaný před zemí), ne natrvalo „🌍 Celá země“', () => {
  const ls = store();
  const T = load({ $: () => null, localStorage: ls, setTimeout, clearTimeout });
  const X = T.ex;
  X.restored = true;
  X.place = { label: 'Paříž', lat: 48.8566, lon: 2.3522, cc: 'FR', geo: false, country: 'Francie', capital: true };
  X.radius = 25;
  T.setRadius(T.COUNTRY); // 🇫🇷 Francie – celá země
  assert.equal(X.radius, T.COUNTRY);
  assert.equal(X.lastKm, 25);
  // „Lisabon“ v hledání → vybrat (pick → openPlace)
  T.openPlace({ label: 'Lisabon', lat: 38.7223, lon: -9.1393, cc: 'PT' });
  assert.equal(X.place.label, 'Lisabon');
  assert.equal(X.radius, 25, 'okruh v km, ne přehled Portugalska');
  assert.equal(JSON.parse(ls.m[T.UI_LS]).radius, 25, 'po obnovení stránky taky okruh v km');
  // bez zapamatovaného okruhu 10 km
  X.radius = T.COUNTRY; X.lastKm = 0;
  T.openPlace({ label: 'Brno', lat: 49.1951, lon: 16.6068, cc: 'CZ' });
  assert.equal(X.radius, 10);
  // výslovná volba v Okruhu zůstává
  T.setRadius(T.COUNTRY);
  assert.equal(X.radius, T.COUNTRY);
  assert.equal(X.lastKm, 10);
});

test('návrhy zemí: celý název nahoře, začátek názvu až pod místy; s diakritikou musí souhlasit', () => {
  const T = load();
  const order = (text, items) => plain(T.sugOrder(T.countrySugs(text), items)).map((x) => x.ccPick || x.label);
  // „Kos“ + Enter = ostrov Kos (první návrh), Kosovo a Kostarika až za místy
  const kos = order('Kos', [{ label: 'Kos', cc: 'GR' }, { label: 'Nisí Kos', cc: 'GR' }]);
  assert.deepEqual(kos.slice(0, 2), ['Kos', 'Nisí Kos']);
  assert.ok(kos.slice(2).length && kos.slice(2).every((x) => /^[A-Z]{2}$/.test(x)), `země za místy: ${kos}`);
  assert.equal(order('Bar', [{ label: 'Bar', cc: 'ME' }])[0], 'Bar', 'Bar v Černé Hoře, ne Barbados');
  assert.ok(order('Bar', [{ label: 'Bar', cc: 'ME' }]).includes('BB'), 'Barbados dál v nabídce');
  // celý název nebo přezdívka země nahoře; geokódovaný střed té země jednou (jako země)
  assert.deepEqual(order('Francie', [{ label: 'Francie', cc: 'FR' }, { label: 'Francie (Le Havre)', cc: 'FR' }, { label: 'Paříž', cc: 'FR' }]), ['FR', 'Paříž']);
  assert.equal(order('Itálie', [{ label: 'Řím', cc: 'IT' }])[0], 'IT');
  assert.equal(order('Česká republika', [{ label: 'Praha', cc: 'CZ' }])[0], 'CZ');
  assert.equal(T.countrySugs('Francie')[0].full, true);
  assert.ok(!T.countrySugs('Fran')[0].full, 'začátek názvu');
  assert.deepEqual(order('Fran', [{ label: 'Frankfurt', cc: 'DE' }]), ['Frankfurt', 'FR']);
  // diakritika: „Pař“ není Paraguay (foldName ř zahodí), „Par“ ano; „Itál“ a „Řec“ dál najdou zemi
  assert.ok(!T.countrySugs('Pař').some((x) => x.ccPick === 'PY'));
  assert.ok(T.countrySugs('Par').some((x) => x.ccPick === 'PY'));
  assert.equal(T.countrySugs('Itál')[0].ccPick, 'IT');
  assert.equal(T.countrySugs('Řec')[0].ccPick, 'GR');
  assert.equal(T.countrySugs('Česk')[0].ccPick, 'CZ');
  // bez serveru (výpadek) zůstanou jen země
  assert.deepEqual(order('Kos', undefined).length, T.countrySugs('Kos').length);
});

test('oblast vs. obec stejného jména: Amalfi je městečko, Kréta a Sardinie dál oblast, Kos a Zanzibar s klíčem oblasti', () => demo(async () => {
  const geo = (q) => geocodeExplore(q, { mapy: false, regions: true });
  const am = await geo('Amalfi');
  assert.equal(am[0].label, 'Amalfi');
  assert.equal(am[0].cc, 'IT');
  assert.ok(!am[0].region);
  assert.equal(am[1].region, 'amalfi', 'Neapol s oblastí hned za ním');
  // ostrov stejného jména (ISL) není obec – oblast zůstane první
  for (const [q, key] of [['Kréta', 'kreta'], ['Sardinie', 'sardinie'], ['Toskánsko', 'toskansko']]) assert.equal((await geo(q))[0].region, key, q);
  // oblast vrátila totéž místo (stejné id): jednou a s klíčem oblasti
  for (const [q, key] of [['Kos', 'kos'], ['Zanzibar', 'zanzibar']]) {
    const r = await geo(q);
    assert.equal(r[0].region, key, q);
    assert.equal(r.filter((x) => x.id === r[0].id).length, 1, q);
  }
}));

test('townBeforeRegion: jen obec přesného jména ze stejné země do 100 km', () => {
  const rg = { id: 'geo:43.9,4.8|Avignon', label: 'Avignon', cc: 'FR', lat: 43.95, lon: 4.81, region: 'provence' };
  const town = (label, cc, lat, lon, fc = 'PPL') => ({ id: `geo:${lat},${lon}|${label}`, label, cc, lat, lon, fc });
  const isTown = (x) => /^PPL/.test(x.fc || '');
  const ids = (l) => l.map((x) => x.id);
  // vesnice Provence ve Švýcarsku oblast Provence (Francie) nepřebije
  const ch = [rg, town('Provence', 'CH', 46.89, 6.73)];
  assert.deepEqual(ids(townBeforeRegion(ch, 'Provence', isTown)), ids(ch));
  // stejná země, ale daleko (přes 100 km) – taky ne
  const far = [rg, town('Provence', 'FR', 48.5, 2.0)];
  assert.deepEqual(ids(townBeforeRegion(far, 'Provence', isTown)), ids(far));
  // kraj nebo ostrov stejného jména obec není
  const area = [rg, town('Provence', 'FR', 43.9, 6.0, 'ADM1')];
  assert.deepEqual(ids(townBeforeRegion(area, 'Provence', isTown)), ids(area));
  // obec stejné země blízko, přesný název (bez ohledu na diakritiku a velikost) → před oblast, zbytek v pořadí
  const near = [{ id: 'x', label: 'Arles', cc: 'FR', lat: 43.67, lon: 4.63, fc: 'PPL' }, rg, town('Lourmarin', 'FR', 43.76, 5.36), town('Provence', 'FR', 43.6, 5.2)];
  assert.deepEqual(ids(townBeforeRegion(near, 'provence', isTown)), ['x', near[3].id, rg.id, near[2].id]);
  // bez oblasti beze změny
  const none = [town('Amalfi', 'IT', 40.63, 14.6)];
  assert.equal(townBeforeRegion(none, 'Amalfi', isTown), none);
});

// --- Zpět z 🔎 Prozkoumat: historie z app.js (skutečné řádky podle jména) s napodobeným prohlížečem ---
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = (?:.*\\{\\n[\\s\\S]*?^\\};|.*)|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
function app() {
  const H = { list: [{ url: '', state: null }], i: 0, pending: [], exits: 0 };
  const el = () => { const c = new Set(); return { innerHTML: '', scrollTop: 0, contains: () => false, setAttribute() {}, removeAttribute() {}, classList: { add: (k) => c.add(k), remove: (k) => c.delete(k), contains: (k) => c.has(k), toggle: (k, on) => (on ? c.add(k) : c.delete(k)) } }; };
  const els = { '#modalBg': el(), '#modal': el(), '#toast': el() };
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
  vm.createContext(ctx);
  vm.runInContext(`var activeView = 'dashboard'; var NAV = ['dashboard', 'flights', 'trip', 'explore', 'planner'].map(k => [k]);
    function go(v, opts = {}) {
      const from = activeView, y0 = opts.noHash ? 0 : Math.round(window.scrollY || 0);
      activeView = v;
      if (!opts.noHash) histDo(() => viewStep(v, opts.drill, from === 'dashboard' || opts.drill ? y0 : null));
    }`, ctx);
  vm.runInContext(pick('hist', 'histFlush', 'histBack', 'histDo', 'histDepth', 'viewHist', 'viewStep', 'trailNext', 'histTrip', 'tripEntry', 'histSub', 'histPop', 'isView', 'hashView', 'modalKb', 'kbSel', 'modalShow', 'modalName', 'modalOpen', 'modalClose'), ctx, { filename: 'app-hist.js' });
  const tick = () => {
    for (let k = 0; k < 20 && H.pending.length; k++) {
      const n = H.pending.shift(), before = H.list[H.i].url;
      if (H.i + n < 0) { H.exits++; continue; }
      H.i += n;
      ctx.histPop();
      if (H.list[H.i].url !== before) ctx.hashView();
    }
  };
  return { ctx, H, tick, back: () => { ctx.history.back(); tick(); }, tap: (v, o) => { ctx.go(v, o); tick(); }, view: () => vm.runInContext('activeView', ctx) };
}

test('Zpět z 🔎 Prozkoumat: krok uvnitř Objevuj vrátí přehled země, další Zpět Přehled aplikace', () => {
  const a = app();
  a.tap('explore');
  let backs = 0;
  a.ctx.histSub(() => { backs++; return true; }); // 🔎 Prozkoumat
  a.tick();
  assert.deepEqual(plain(a.H.list.map((x) => x.url)), ['#dashboard', '#explore', '#explore']);
  a.ctx.histSub(() => { backs += 10; return true; }); // další Prozkoumat jen nahradí návrat, krok nepřidá
  assert.equal(a.H.list.length, 3);
  a.back();
  assert.equal(backs, 10, 'přehled země zpátky');
  assert.equal(a.view(), 'explore');
  a.back();
  assert.equal(a.view(), 'dashboard');
  assert.equal(a.H.exits, 0);
  // okno nad prozkoumaným místem: Zpět zavře okno, další vrátí přehled země
  const m = app();
  m.tap('explore');
  let mb = 0;
  m.ctx.histSub(() => { mb++; return true; }); m.tick();
  m.ctx.modalOpen('<p>Info</p>');
  m.back();
  assert.equal(mb, 0);
  m.back();
  assert.equal(mb, 1);
  assert.equal(m.view(), 'explore');
  // návrat už nemá smysl (mezitím jiné místo) → Zpět pokračuje o krok dál
  const b = app();
  b.tap('explore');
  b.ctx.histSub(() => false); b.tick();
  b.back();
  assert.equal(b.view(), 'dashboard');
  assert.equal(b.H.exits, 0);
  // přepnutí sekce v liště krok zahodí: Zpět z Letů rovnou na Přehled, nic se nevolá
  const c = app();
  c.tap('explore');
  let cb = 0;
  c.ctx.histSub(() => { cb++; return true; }); c.tick();
  c.tap('flights');
  assert.equal(c.H.i, 1, 'Lety přepsaly krok sekce nad Přehledem');
  assert.equal(c.ctx.location.hash, '#flights');
  c.back();
  assert.equal(c.view(), 'dashboard');
  assert.equal(cb, 0);
  assert.equal(c.H.exits, 0);
});

test('countryBack: přehled země zpátky bez nového dotazu, jen dokud je otevřené místo z přehledu', () => {
  let n = 0;
  const ls = store();
  const body = { isConnected: true, innerHTML: '' };
  // #exBody jen pro kontrolu v countryBack (vykreslení přehledu – mapa, karty – se v testu přeskočí)
  const T = load({ $: (s) => (s === '#exBody' && n++ === 0 ? body : null), localStorage: ls, setTimeout, clearTimeout, fetch: () => assert.fail('bez dotazu') });
  const X = T.ex;
  X.restored = true;
  const p = { label: 'Paříž', lat: 48.8566, lon: 2.3522, cc: 'FR', geo: false, country: 'Francie', capital: true };
  const c = { place: p, data: { cc: 'FR', country: 'Francie', city: [{ id: 'Q90', name: 'Paříž', lat: 48.85, lon: 2.35 }] } };
  X.place = { label: 'Lyon', lat: 45.76, lon: 4.83, cc: 'FR', geo: false, country: 'Francie' };
  X.radius = 10;
  assert.equal(T.countryBack({ label: 'jiné' }, p, c), false, 'mezitím jiné místo');
  assert.equal(X.place.label, 'Lyon');
  assert.equal(T.countryBack(X.place, p, c), true);
  assert.equal(X.place, p);
  assert.equal(X.country, c);
  assert.equal(X.radius, T.COUNTRY);
  assert.equal(JSON.parse(ls.m[T.UI_LS]).radius, T.COUNTRY);
  // 🔎 Prozkoumat v přehledu země krok přidá
  assert.match(src('places.js'), /histSub\(\(\) => countryBack\(opened, p, c\)\)/);
});

// --- Předstartovní kontrola Objevuj: země z věty, „Emiráty“, „Chorvatsko u moře“, fokus po ✕ a karty z klávesnice ---
test('„Itálie na týden“: hlavní město s hláškou a na víc dní okruh, ne týden pěšky po Římě', () => {
  const T = load({ localStorage: store(), setTimeout, clearTimeout });
  const X = T.ex;
  X.restored = true;
  const rim = { label: 'Řím', lat: 41.9, lon: 12.5, cc: 'IT', capitalOf: 'IT' };
  assert.equal(T.capitalNote(rim), 'Itálie: začínám v hlavním městě Řím – celou zemi najdeš pod Celá země');
  assert.equal(T.capitalNote({ label: 'Řím', cc: 'IT' }), '', 'napsané město hlášku nemá');
  const px = (days) => ({ place: 'Itálie', mode: null, days, km: null, start: null, interests: [], chips: [] });
  X.mode = 'city';
  T.exploreApply(px(7), rim);
  assert.equal(X.mode, 'loop', 'týden po zemi = okruh');
  T.exploreApply(px(3), rim);
  assert.equal(X.mode, 'city', 'na 3 dny program v hlavním městě');
  T.exploreApply(px(7), { label: 'Řím', lat: 41.9, lon: 12.5, cc: 'IT' });
  assert.equal(X.mode, 'city', '„Řím na týden“ zůstane programem ve městě');
  // smartPlace u země místo označí (capitalOf – test/czech-names.test.js), věta v hledání ukáže hlášku
  assert.match(src('places.js'), /const note = capitalNote\(s\); if \(note\) toast\(note/);
});

test('hlavní pole Objevuj najde „Emiráty“ (začátek slova uvnitř názvu i přezdívka), shody od začátku názvu napřed', () => {
  const T = load();
  assert.equal(T.countryOfText('Emiráty'), 'AE');
  assert.equal(T.countryOfText('emiraty'), 'AE');
  assert.equal(T.countrySugs('Emiráty')[0].ccPick, 'AE');
  assert.equal(T.countrySugs('Emir')[0].ccPick, 'AE', 'začátek slova uvnitř „Spojené arabské emiráty“');
  assert.equal(T.countrySugs('arabsk')[0].ccPick, 'AE');
  assert.ok(T.countrySugs('Korea').some((x) => x.ccPick === 'KR'), 'Jižní Korea');
  // začátek celého názvu má přednost před slovem uvnitř; diakritika dál musí souhlasit
  assert.equal(T.countrySugs('Itál')[0].ccPick, 'IT');
  assert.ok(!T.countrySugs('Pař').some((x) => x.ccPick === 'PY'));
});

test('„Chorvatsko u moře“, „Itálie hrady a zámky“: přehled země rovnou s kategorií; s dny dál plán', () => {
  const T = load();
  const cw = (t, px = null) => { const r = T.wholeCountryCat(t, px); return r && plain(r); };
  assert.deepEqual(cw('Chorvatsko u moře'), { cc: 'HR', cat: 'beach' });
  assert.deepEqual(cw('Chorvatsko pláže'), { cc: 'HR', cat: 'beach' });
  assert.deepEqual(cw('Rakousko hory'), { cc: 'AT', cat: 'mountain' });
  assert.deepEqual(cw('Švýcarsko jezera'), { cc: 'CH', cat: 'lake' });
  assert.deepEqual(cw('Itálie hrady a zámky'), { cc: 'IT', cat: 'castle' });
  assert.equal(cw('Chorvatsko'), null, 'bez zájmu přehled bez kategorie (wholeCountryOf)');
  assert.equal(cw('Split u moře'), null, 'město není země');
  assert.equal(cw('Chorvatsko u moře', { days: 7 }), null, 'na týden = plán, ne přehled');
  assert.equal(cw('Rakousko hory', { mode: 'hike' }), null);
  // věta v hledání kategorii nastaví před otevřením země (paintCountry ji pak načte přes loadCountryCat)
  const P = src('places.js');
  assert.match(P, /if \(px\.cw\) \{ dd\.hidden = true; q\.blur\(\); ex\.cCat = px\.cw\.cat; remember\(\); return openWholeCountry\(px\.cw\.cc\); \}/);
  assert.match(P, /if \(lazyCat\(cat\) && !st\) loadCountryCat\(cat\);/);
});

test('✕ v plánu: po překreslení fokus na ✕ na stejném místě (poslední / nadpis dne); karty míst z klávesnice', () => {
  const doc = { body: { isConnected: true }, activeElement: null };
  const btn = () => { const b = { isConnected: true, tabIndex: 0, focus() { doc.activeElement = b; } }; return b; };
  let bs = [btn(), btn(), btn()];
  const h4 = btn();
  const host = { querySelectorAll: (s) => (s === '[data-drop]' ? bs : []), querySelector: (s) => (s === '.day-plan h4' ? h4 : null) };
  const T = load({ document: doc, $: (s, r) => r.querySelector(s), $$: (s, r) => [...r.querySelectorAll(s)] });
  // překreslení: stará tlačítka zmizí, fokus spadne na body
  const redraw = (n) => { bs.forEach((b) => { b.isConnected = false; }); doc.activeElement = doc.body; bs = Array.from({ length: n }, btn); };
  T.dropMark(host, bs[1]); redraw(2); T.dropRefocus(host);
  assert.equal(doc.activeElement, bs[1], '✕ u druhé zastávky → nové druhé ✕');
  T.dropMark(host, bs[1]); redraw(1); T.dropRefocus(host);
  assert.equal(doc.activeElement, bs[0], 'poslední ✕ → poslední, které zbylo');
  T.dropMark(host, bs[0]); redraw(0); T.dropRefocus(host);
  assert.equal(doc.activeElement, h4, 'bez ✕ nadpis dne');
  assert.equal(h4.tabIndex, -1);
  // překreslení bez ✕ (jiný důvod) fokus nebere
  bs = [btn()]; doc.activeElement = doc.body; T.dropRefocus(host);
  assert.equal(doc.activeElement, doc.body);
  // fokus mezitím jinde (psaní do pole) – nechat
  const field = btn();
  T.dropMark(host, bs[0]); redraw(1); doc.activeElement = field; T.dropRefocus(host);
  assert.equal(doc.activeElement, field);
  // oba plány (Plánovač i Objevuj) si pořadí ✕ zapamatují a po vykreslení fokus vrátí
  const P = src('places.js');
  assert.match(P, /dropMark\(host, b\); dropUndo\(st, b\.dataset\.drop, plan, run\); \}\);\n\s+dropRefocus\(host\);/);
  assert.match(P, /dropMark\(body, b\); dropUndo\(st, b\.dataset\.drop, ex\.plan, \(\) => replan\(\)\); \}\);\n\s+dropRefocus\(body\);/);
  // karty [data-poi] v seznamu i v plánu přes kbClick z app.js
  assert.match(P, /const kb = c => \{ if \(typeof kbClick === 'function'\) kbClick\(c\); \};/);
  assert.match(P, /\$\$\('#exList \[data-poi\]', body\)\.forEach\(c => \{[^\n]*kb\(c\); \}\);/);
  assert.match(P, /\$\$\('#exPlanOut \[data-poi\]', body\)\.forEach\(c => \{[\s\S]{0,400}?kb\(c\);\n\s+\}\);/);
});
