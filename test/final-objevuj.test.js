// Závěrečná kontrola Objevuj a Světa (přístupnost): značky mapy se jménem místa a české ovládání mapy, fokus po zavření
// okna, jehož tlačítko zmizelo, a po ✕ v poli Objevuj, Zpět z Prozkoumat na původní posun, „navštíveno“ na kartě země,
// stav vybrané kategorie, Doporučení bez sítě a věta o Prozkoumat s ikonou tlačítka.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const APP = src('app.js'), PLACES = src('places.js');
/** Funkce nebo konstanta z app.js podle jména (víceřádková do „}“ na začátku řádku). */
const pick = (name) => {
  const m = APP.match(new RegExp(`^(function ${name}\\([\\s\\S]*?^\\}|const ${name} = .*)$`, 'm'));
  assert.ok(m, `app.js: ${name}`);
  return m[0];
};

test('mapa Objevuj: značka se čtečce ohlásí názvem místa, ovládání mapy česky', () => {
  // MapLibre v addTo() aria-label nepřepíše, jen když chybí – musí být nastavený před new maplibregl.Marker
  assert.match(PLACES, /el\.setAttribute\('aria-label', pt\.label\);[^\n]*\n(?:[^\n]*\n){0,4}\s*const mk = new maplibregl\.Marker\(\{ element: el \}\)/);
  const loc = PLACES.match(/locale: \{([^}]*)\}/);
  assert.ok(loc, 'locale v new maplibregl.Map');
  for (const k of ['NavigationControl.ZoomIn', 'NavigationControl.ZoomOut', 'Marker.Title', 'Popup.Close']) assert.match(loc[1], new RegExp(`'${k.replace('.', '\\.')}': '[^']+'`));
  // klíče musí MapLibre znát (neznámý by se tiše nepoužil)
  const lib = readFileSync(new URL('../public/vendor/maplibre/maplibre-gl.js', import.meta.url), 'utf8');
  for (const k of loc[1].match(/'[A-Za-z]+\.[A-Za-z]+'(?=:)/g)) assert.ok(lib.includes(`"${k.slice(1, -1)}":`), k);
});

/** MutationObserver okna (obnova fokusu po zavření) a kbNear v node:vm; els = prvky stránky podle selektoru. */
function closeModal({ ret, sel = '', box = '', els = {} }) {
  const focused = [];
  const cb = APP.match(/new MutationObserver\((\(\) => \{[\s\S]*?\n\})\)\.observe\(\$\('#modalBg'\)/)[1];
  const m = { contains: () => false }, bg = { classList: { contains: () => false }, contains: () => false };
  const body = { tagName: 'BODY' };
  const ctx = vm.createContext({
    $: (s) => (s === '#modal' ? m : s === '#modalBg' ? bg : els[s] || null),
    $$: (s, root) => (root ? root.kids : els[s] ? [els[s]] : []),
    document: { activeElement: body, body },
    modalKb: { on: true, fresh: false, ret, sel, box, touch: { matches: false } },
  });
  vm.runInContext(`${pick('kbNear')}; this.cb = ${cb};`, ctx);
  ctx.cb();
  for (const el of Object.values(els)) [el, ...(el.kids || [])].forEach((x) => x.f && focused.push(x.name));
  return { focused, kb: ctx.modalKb };
}
const node = (name, o = {}) => {
  const el = { name, tagName: 'BUTTON', isConnected: true, closest: () => null, getClientRects: () => [1], f: false, ...o };
  el.focus = (opt) => { assert.deepEqual({ ...opt }, { preventScroll: true }); el.f = true; };
  return el;
};

test('okno zavřené a jeho tlačítko zmizelo (odebraná navštívená země): fokus do kontejneru, ne na <body>', () => {
  const gone = node('Itálie', { isConnected: false });
  const hidden = node('skrytá', { getClientRects: () => [] }), pill = node('Francie');
  const vl = node('visitedList', { tagName: 'DIV', kids: [hidden, pill] });
  const r = closeModal({ ret: gone, sel: 'button[data-vi="IT"]', box: '#visitedList', els: { '#visitedList': vl } });
  assert.deepEqual(r.focused, ['Francie'], 'první viditelné tlačítko v Navštívených');
  assert.equal(r.kb.box, '', 'kontejner se po zavření zapomene');
  // poslední země odebraná – v kontejneru nic k fokusu: kontejner sám (tabIndex -1)
  const empty = node('visitedList', { tagName: 'DIV', kids: [] });
  assert.deepEqual(closeModal({ ret: gone, box: '#visitedList', els: { '#visitedList': empty } }).focused, ['visitedList']);
  assert.equal(empty.tabIndex, -1);
  // kontejner schovaný (akce okna přepnula sekci) – nic, jako dřív
  const off = node('countryGrid', { tagName: 'DIV', kids: [node('karta')], getClientRects: () => [] });
  assert.deepEqual(closeModal({ ret: gone, box: '#countryGrid', els: { '#countryGrid': off } }).focused, []);
  // tlačítko na stránce zůstalo – na něj, kontejner se nepoužije
  const keep = node('Itálie');
  pill.f = false;
  closeModal({ ret: keep, box: '#visitedList', els: { '#visitedList': vl } });
  assert.deepEqual([keep.f, pill.f], [true, false]);
  // kontejner si modalOpen zapamatuje od rodiče (tlačítko s id by jinak bylo samo sobě kontejnerem)
  assert.match(pick('modalOpen'), /modalKb\.box = kbSel\(modalKb\.ret && modalKb\.ret\.parentElement && modalKb\.ret\.parentElement\.closest\('\[id\]'\)\);/);
});

test('✕ v poli Objevuj: fokus zpátky do pole jen z klávesnice (klepnutím na telefonu by vyskočila klávesnice)', () => {
  assert.match(PLACES, /if \(cl\) cl\.onclick = e => resetExplore\(e\.detail === 0\);/);
  assert.match(PLACES, /function resetExplore\(kb\) \{[\s\S]*?renderExplore\(root\);[\s\S]*?const q = kb && \$\('#exQ'\); if \(q\) q\.focus\(\{ preventScroll: true \}\);\n\s*\}/);
});

/** places.js v node:vm (jako test/objevuj-poradi.test.js). */
function loadPlaces(extra = {}) {
  const countries = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url), 'utf8'));
  const byIso = Object.fromEntries(countries.map((c) => [c.iso2, c]));
  const ctx = vm.createContext({ window: {}, URLSearchParams, console, byIso, ...extra });
  vm.runInContext(APP.match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('smart.js'), ctx, { filename: 'smart.js' });
  vm.runInContext(PLACES, ctx, { filename: 'places.js' });
  return { T: ctx.window.Places._t, ctx };
}

test('Zpět z Prozkoumat: přehled země na původním posunu stránky, ne nahoře', () => {
  const scrolls = [];
  const store = { getItem: () => null, setItem() {} };
  const run = (y) => {
    let n = 0;
    const body = { isConnected: true, innerHTML: '' };
    const { T, ctx } = loadPlaces({ $: (s) => (s === '#exBody' && n++ === 0 ? body : null), localStorage: store, setTimeout, clearTimeout, requestAnimationFrame: (f) => f() });
    ctx.window.scrollTo = (...a) => scrolls.push(a);
    const p = { label: 'Řím', lat: 41.9, lon: 12.5, cc: 'IT', geo: false, country: 'Itálie', capital: true };
    const c = { place: p, data: { cc: 'IT', country: 'Itálie', city: [] } };
    T.ex.restored = true;
    T.ex.place = { label: 'Florencie', lat: 43.77, lon: 11.25, cc: 'IT' };
    assert.equal(T.countryBack(T.ex.place, p, c, y), true);
  };
  run(2026);
  assert.deepEqual(scrolls, [[0, 2026]]);
  run(undefined); // starší krok historie bez posunu – nic
  assert.deepEqual(scrolls, [[0, 2026]]);
  // go() si posun vezme před openPlace (to stránku posune nahoru) a předá ho do kroku historie
  assert.match(PLACES, /const y = Math\.round\(window\.scrollY \|\| 0\);\n\s*openPlace\(\{ lat: x\.lat/);
});

test('karta navštívené země řekne čtečce „navštíveno“ (fajfka sama nic neříká)', () => {
  assert.match(pick('destCard'), /<div class="vmark"><svg[^`]*<\/svg><span class="sr-only">navštíveno<\/span><\/div>/);
});

test('Objevuj: vybraná kategorie (Vše, Muzea…) má aria-pressed jako ostatní přepínače', () => {
  const SEG_BTN = vm.runInNewContext(`${pick('SEG_BTN')}; SEG_BTN`);
  assert.ok(SEG_BTN.split(',').includes('.ex-cats>button'));
  assert.match(PLACES, /<div class="ex-cats" role="group" aria-label="Kategorie"><button type="button" data-cat="" class="\$\{!ex\.cat \? 'on' : ''\}">/);
});

test('Doporučení bez sítě: překreslí se i po chybě, řekne „jen podle sezóny“ a po připojení teploty doplní', async () => {
  const ctx = vm.createContext({ fetch: () => Promise.reject(new Error('offline')), Date, Object });
  vm.runInContext(`const SEASON = {}; ${pick('seasonOf')}; this.SEASON = SEASON; this.seasonOf = seasonOf;`, ctx);
  let calls = 0;
  assert.equal(ctx.seasonOf(7, 'rec', () => calls++), null);
  await ctx.SEASON[7].p;
  assert.ok(ctx.SEASON[7].fail);
  assert.equal(calls, 1, 'překreslit i po chybě – jinak by poznámka o sezóně nebyla vidět');
  assert.equal(ctx.seasonOf(7, 'rec', () => calls++), null, 'hned znovu se neptá');
  assert.equal(calls, 1);
  const r = pick('renderRecs');
  assert.match(r, /SEASON\[m\] && SEASON\[m\]\.fail \? \(navigator\.onLine === false \? 'Bez připojení – pořadí jen podle sezóny, teploty doplním po připojení\.' : '[^']+'\) : ''/);
  assert.match(r, /Pwa\.whenOnline\('recs', \(\) => \{ SEASON\[m\] = null; if \(activeView === 'recommend'\) renderRecs\(\); \}\)/);
});

test('přehled země: věta o Prozkoumat s ikonou tlačítka (kompas), ne s lupou', () => {
  const note = PLACES.match(/<div class="muted ex-cnote">Města a další cíle[^\n]*/)[0];
  assert.doesNotMatch(note, /🔎/);
  assert.match(note, /\$\{ikona\('kompas'\)\} Prozkoumat ukáže/);
  assert.match(PLACES, /data-cgo="[^\n]*\$\{ikona\('kompas'\)\} Prozkoumat</, 'tlačítko na kartě má kompas');
});
