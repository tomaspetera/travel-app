// Bez sítě: mapa světa, která se nenačetla, se zkusí znovu (po připojení / dalším otevření) a cesta do hlavního
// města založená offline dostane zemi z místních dat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const app = read('public/js/app.js');
const pick = (re) => { const m = app.match(re); assert.ok(m, `v app.js chybí ${re}`); return m[0]; };
const COUNTRIES = JSON.parse(read('data/countries.json'));

test('cesta bez sítě do hlavního města: země podle hlavního města, jen přesná shoda', () => {
  const ctx = { COUNTRIES };
  vm.createContext(ctx);
  vm.runInContext([/^const norm = .*$/m, /^function capitalCountry\(.*$/m, /^function resolveCountry\(.*$/m].map(pick).join('\n')
    + '\nthis.capitalCountry = capitalCountry; this.resolveCountry = resolveCountry;', ctx);
  const iso = (t) => (ctx.capitalCountry(t) || {}).iso2 || null;
  assert.equal(iso('Lisabon'), 'PT');
  assert.equal(iso('Řím'), 'IT');
  assert.equal(iso('rim'), 'IT', 'bez diakritiky a malým písmenem');
  assert.equal(iso('Lisbon'), 'PT', 'i anglicky');
  assert.equal(iso('Kos'), null, 'žádný začátek názvu (Kosovo má Prištinu)');
  assert.equal(iso('Porto'), null, 'jiné město bez sítě nehádat');
  assert.equal(iso(''), null);
  // ubytování u cesty „Lisabon“ hledá ve městě (oneCity = !resolveCountry) – resolveCountry hlavní města nezná
  assert.equal(ctx.resolveCountry('Lisabon'), null);
  // saveTrip: když api/places neodpoví, rozhodne hlavní město dřív než začátek názvu země
  assert.match(pick(/async function saveTrip\([\s\S]*?\n\}/), /if \(!fiso && !place\) \{ const c = capitalCountry\(f\.dest\) \|\| resolveCountry\(f\.dest\);/);
});

test('mapa světa, která se nenačetla, se zkusí znovu po připojení a při dalším otevření – nic dokola', async () => {
  const st = { d3: [], fb: [], queue: new Map(), active: true, d3ok: false, restored: 0 };
  const ctx = {
    refreshStats() {}, mapAddWire() {},
    loadD3: () => { st.d3.push(1); return st.d3ok ? Promise.resolve() : Promise.reject(new Error('offline')); },
    loadWorld: () => Promise.reject(new Error('offline')),
    mapRestore: () => { st.restored++; },
    mapFallback: (msg) => st.fb.push(msg),
    $: (q) => (q === '#view-map.active' ? st.active : null),
    Pwa: { whenOnline: (k, fn) => st.queue.set(k, fn) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext('let mapInited = false;\n' + pick(/async function initMap\(\) \{[\s\S]*?\n\}/) + '\n'
    + pick(/function mapFailed\(msg\) \{[\s\S]*?\n\}/) + '\nthis.initMap = initMap;', ctx);

  await Promise.all([ctx.initMap(), ctx.initMap()]); // dvojí otevření během načítání: jeden pokus
  assert.equal(st.d3.length, 1);
  assert.equal(st.fb.length, 1);
  assert.match(st.fb[0], /^Mapové knihovny se nenačetly\. Zkusím mapu načíst znovu, až budeš online nebo ji otevřeš znovu\.$/);
  assert.ok(st.queue.has('map'), 'čeká na návrat připojení');

  await ctx.initMap(); // další otevření Mapy: nový pokus
  assert.equal(st.d3.length, 2);

  // návrat připojení na jiné záložce: nic nenačítat (Mapa to zkusí, až se otevře)
  st.active = false; st.queue.get('map')(); await new Promise((r) => setImmediate(r));
  assert.equal(st.d3.length, 2);

  // návrat připojení na Mapě: knihovny už jdou, svět (countries-110m.json) zatím ne → seznam, žádná smyčka
  st.active = true; st.d3ok = true; st.queue.get('map')(); await new Promise((r) => setImmediate(r));
  assert.equal(st.d3.length, 3);
  assert.equal(st.restored, 0, 'mapa se vrací až s načteným světem');
  assert.match(st.fb.at(-1), /^Mapu se teď nepodařilo načíst\. Zkusím/);
  assert.equal(st.d3.length, 3, 'neúspěch sám další pokus nespustí');
});

test('seznam místo mapy obsah #mapWrap jen odloží (chip a přepínač mapy si nechají obsluhy) a mapRestore ho vrátí', () => {
  const fb = pick(/function mapFallback\(msg\) \{[\s\S]*?\n\}/);
  assert.match(fb, /if \(!mapKept\) mapKept = \[\.\.\.wrap\.childNodes\];/);
  assert.match(pick(/function mapRestore\(\) \{[\s\S]*?\n\}/), /wrap\.replaceChildren\(\.\.\.mapKept\); mapKept = null;/);
});
