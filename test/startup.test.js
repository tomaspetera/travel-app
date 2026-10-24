// Rychlý start na telefonu: co stránka stahuje hned (preload), desktopové styly mimo kritickou cestu, úvod Přehledu
// bez poskočení obsahu, výsledky z minula až při otevření Letů, úvodní obrazovka aplikace na ploše a zapamatované
// zjištění vlajek (public/js/flags.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, statSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const INDEX = read('public/index.html');
const { shellAssets, RUNTIME_ASSETS } = await import('../server/lib/pwa.js');

test('index.html: data zemí a stav serveru se stahují hned se stránkou (preload) – týž požadavek jako fetch() v aplikaci', () => {
  const pre = [...INDEX.matchAll(/<link rel="preload"[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(pre.map((t) => t.match(/href="([^"]+)"/)[1]), ['data/countries.json', 'api/health']);
  // as="fetch" + crossorigin (anonymous) = režim cors a přihlašovací údaje same-origin jako fetch(url) bez voleb;
  // jinak by prohlížeč přednačtené nepoužil a stahoval znovu
  for (const t of pre) assert.match(t, /^<link rel="preload" href="[^"]+" as="fetch" crossorigin>$/, t);
  // aplikace je čte právě takhle (fetch bez druhého parametru) – při změně adresy nebo voleb upravit i preload
  assert.match(read('public/js/app.js'), /initCountries\(await \(await fetch\('data\/countries\.json'\)\)\.json\(\)\)/);
  const flights = read('public/js/flights.js');
  assert.match(flights, /healthReq = api\('api\/health'\)/);
  assert.match(flights, /async function api\(path\) \{\s*const r = await fetch\(path\);/);
  // data zemí jsou soubor (server je bere z data/) a jsou i v sadě pro offline; API do ní nikdy nepatří
  assert.ok(statSync(new URL('../data/countries.json', import.meta.url)).isFile());
  assert.ok(RUNTIME_ASSETS.includes('data/countries.json'));
  assert.ok(!shellAssets(INDEX).some((u) => /^api\//.test(u)), 'preload API se do seznamu pro offline nedostane');
});

test('úvod Přehledu bez poskočení: pole Odkud/Kam mají výšku už v HTML, sekce pod úvodem se ukážou až po startu', () => {
  // třídy, které PlaceInput přidá (flights.js: pi, a pi-dark u dark: true), jsou na polích úvodu už v HTML
  for (const id of ['heroFrom', 'heroTo']) assert.match(INDEX, new RegExp(`<div class="place-input pi pi-dark" id="${id}"></div>`), id);
  const flights = read('public/js/flights.js');
  assert.match(flights, /el\.classList\.add\('pi'\); if \(dark\) el\.classList\.add\('pi-dark'\);/);
  assert.match(flights, /heroFrom = new PlaceInput\(\$\('#heroFrom'\), \{[^}]*dark: true/);
  assert.match(flights, /heroTo = new PlaceInput\(\$\('#heroTo'\), \{[^}]*dark: true/);
  // do startu (app.js boot → html.booted) jen úvod; pojistka: bez startu se sekce ukážou samy (jako dřív)
  const css = read('public/css/atlas.css');
  assert.match(css, /html:not\(\.booted\) #view-dashboard>\.hero~\*\{visibility:hidden;animation:boot-show 0s linear 6s forwards\}/);
  assert.match(css, /@keyframes boot-show\{to\{visibility:visible\}\}/);
  // třída se přidá vždy (finally) – i když start skončí chybou nebo odbočí na sdílenou cestu
  assert.match(read('public/js/app.js'), /async function boot\(\) \{\s*try \{ await start\(\); \} finally \{\s*document\.documentElement\.classList\.add\('booted'\);[^\n]*\n\s*launchDone\(\);/);
  assert.ok(!/class="[^"]*\bbooted\b/.test(INDEX), 'v HTML třída booted není');
});

test('service worker ukládá i nové skripty (errlog.js, offershare.js) a desktopové styly s media; verze = otisk obsahu', async () => {
  const { serviceWorker } = await import('../server/lib/pwa.js');
  const dirs = { publicDir: new URL('../public', import.meta.url).pathname, dataDir: new URL('../data', import.meta.url).pathname };
  const { precache, build, body } = serviceWorker(dirs);
  // skripty a styly v seznamu s otiskem obsahu v adrese (js/errlog.js?v=… – test/pwa.test.js)
  for (const f of ['js/errlog.js', 'js/offershare.js', 'js/flags.js', 'css/desktop.css', 'css/desktop-flights.css', 'css/desktop-explore.css', 'css/desktop-trip.css']) {
    assert.ok(precache.some((u) => u.startsWith(`${f}?v=`)), f);
  }
  // nová verze (jiný obsah souborů) = jiný sw.js → prohlížeč po nasazení nainstaluje nový service worker
  assert.match(build, /^[0-9a-f]{12}$/);
  assert.ok(String(body).includes(`const BUILD = '${build}';`));
});

test('výsledky z minula se při startu jen načtou – vykreslí se až při prvním otevření Letů; go() při startu nevynutí rozvržení', () => {
  const flights = read('public/js/flights.js');
  const fn = (name) => {
    const m = flights.match(new RegExp(`\\n  (?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`));
    assert.ok(m, `flights.js: ${name}`);
    return m[0];
  };
  const restore = fn('restoreLast');
  assert.ok(!/renderResults\(\)|renderRestored\(/.test(restore), 'restoreLast do skrytých Letů nekreslí');
  assert.match(restore, /lastDraw = true;/);
  // předpověď počasí cílů až po startu – a jen pro obnovený výsledek, který mezitím nenahradilo hledání
  assert.match(restore, /whenIdle\(\(\) => \{ if \(lastDraw && lastResult === res\) wxLoad\(res\); \}\);/);
  assert.match(fn('lastDrawNow'), /if \(!restored \|\| !lastResult\) return;\s*renderRestored\(\);\s*renderResults\(\);/);
  // přepnutí na Lety (app.js go → Flights.ageCheck) vykreslí v témže kroku; do té doby se skryté překreslení přeskočí
  assert.match(fn('ageCheck'), /function ageCheck\(keep = true\) \{\n\s*if \(lastDraw && \$\('#view-flights\.active'\)\) lastDrawNow\(\);/);
  assert.match(read('public/js/app.js'), /if \(v === 'flights' && window\.Flights && Flights\.ageCheck\) Flights\.ageCheck\(/);
  assert.match(fn('rerender'), /function rerender\(keepScroll\) \{\n\s*if \(lastDraw\) return;/);
  // nové hledání a ↺ Začít znovu nevykreslené výsledky zahodí – Lety pak ukážou průběh hledání, ne staré výsledky
  assert.match(fn('startSearch'), /lastDraw = false;[^\n]*\n\s*\$\('#results'\)\.innerHTML = '';/);
  assert.match(fn('resetSearch'), /restored = false; fromCard = null; lastDraw = false;/);
  // posun na (0, 0) i s left: prohlížeč ho provede bez vynuceného rozvržení stránky (jen top by si ho vyžádal)
  assert.match(read('public/js/app.js'), /if \(!opts\.keepScroll\) window\.scrollTo\(\{ top: 0, left: 0, behavior: 'smooth' \}\);/);
});

test('úvodní obrazovka aplikace na ploše: při mizení už nepřekáží klepnutí na přehled', () => {
  assert.match(INDEX, /#launch\.out\{opacity:0;visibility:hidden;pointer-events:none\}/);
});

/* ---------- flags.js ve falešném prohlížeči (node:vm) ---------- */
// emoji = barevné emoji umí, flags = vlajky umí; pixel barevného znaku je stejný bílou i černou barvou písma
function runFlags({ store = {}, ua = 'UA-1', emoji = true, flags = false, lsThrows = false, canvasThrows = false } = {}) {
  const out = { draws: 0, styles: [], classes: [], store };
  const canvas = () => ({
    getContext() {
      if (canvasThrows) throw new Error('canvas není');
      let fill = '', text = '';
      return {
        scale() {}, clearRect() {},
        set fillStyle(c) { fill = c; },
        fillText(t) { out.draws++; text = t; },
        getImageData() {
          const colored = /\u{1F1E8}/u.test(text) ? flags : emoji;
          return { data: colored ? [255, 200, 0, 255] : fill === '#fff' ? [255, 255, 255, 255] : [0, 0, 0, 255] };
        },
      };
    },
  });
  const localStorage = lsThrows
    ? { getItem() { throw new Error('zakázáno'); }, setItem() { throw new Error('zakázáno'); } }
    : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const ctx = {
    JSON, localStorage, navigator: { userAgent: ua },
    document: {
      createElement: (t) => (t === 'canvas' ? canvas() : { tag: t, textContent: '' }),
      head: { appendChild: (el) => out.styles.push(el.textContent) },
      documentElement: { classList: { add: (c) => out.classes.push(c) } },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/flags.js'), ctx, { filename: 'flags.js' });
  return out;
}

test('flags.js: písmo vlajek jen bez vlastních vlajek; zjištění se pamatuje pro stejný prohlížeč (bez kreslení při dalším startu)', () => {
  // Windows: barevné emoji ano, vlajky ne → písmo vlajek
  const store = {};
  const a = runFlags({ store });
  assert.ok(a.draws > 0);
  assert.equal(a.styles.length, 1);
  assert.match(a.styles[0], /font-family:"Inter";unicode-range:U\+1F1E6-1F1FF/);
  assert.deepEqual(a.classes, ['flag-font']);
  assert.deepEqual(JSON.parse(store.atlas_flags), { ua: 'UA-1', need: true });
  // další start: bez kreslení na plátno, výsledek stejný
  const b = runFlags({ store });
  assert.equal(b.draws, 0);
  assert.deepEqual([b.styles.length, b.classes], [1, ['flag-font']]);
  // nová verze prohlížeče (jiný userAgent): zjistit znovu – tady už vlajky umí
  const c = runFlags({ store, ua: 'UA-2', flags: true });
  assert.ok(c.draws > 0);
  assert.deepEqual([c.styles.length, c.classes.length], [0, 0]);
  assert.deepEqual(JSON.parse(store.atlas_flags), { ua: 'UA-2', need: false });
  const d = runFlags({ store, ua: 'UA-2', flags: true });
  assert.deepEqual([d.draws, d.styles.length], [0, 0], 'zapamatované „není potřeba“ – nic nekreslí ani nepřidává');
});

test('flags.js: bez úložiště, s poškozeným záznamem nebo bez plátna funguje jako dřív', () => {
  // soukromé okno (localStorage hází): zjistí pokaždé, nespadne
  const a = runFlags({ lsThrows: true });
  assert.ok(a.draws > 0);
  assert.equal(a.styles.length, 1);
  // poškozený nebo cizí záznam → zjistit znovu a přepsat
  for (const bad of ['{nesmysl', JSON.stringify({ ua: 'UA-1', need: 'ano' }), JSON.stringify(null)]) {
    const store = { atlas_flags: bad };
    const r = runFlags({ store });
    assert.ok(r.draws > 0, bad);
    assert.deepEqual(JSON.parse(store.atlas_flags), { ua: 'UA-1', need: true }, bad);
  }
  // bez barevných emoji (např. Linux bez písma): písmo vlajek se nepřidává (jako dřív)
  assert.equal(runFlags({ emoji: false }).styles.length, 0);
  // plátno nejde: nic se nepřidá ani nezapamatuje – příště zkusí znovu
  const store = {};
  const e = runFlags({ store, canvasThrows: true });
  assert.deepEqual([e.styles.length, Object.keys(store).length], [0, 0]);
});
