// Moduly mimo Přehled až po startu (public/js/lazy.js): zavaděč ve falešném prohlížeči (node:vm) – pořadí, jedno
// načtení, závislosti, opakování po výpadku sítě, načtení po startu – a že je service worker ukládá pro offline
// (server/lib/pwa.js) a aplikace je volá jen jmény modulů ze seznamu v index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const INDEX = read('public/index.html');
const LAZY_TAG = INDEX.match(/<script src="js\/lazy\.js" data-later="([^"]+)" data-files="([^"]+)"><\/script>/);
const LATER = LAZY_TAG ? LAZY_TAG[1].split(' ') : [];
const FILES = LAZY_TAG ? LAZY_TAG[2].split(' ') : [];
const tick = () => new Promise((r) => setImmediate(r));

/** lazy.js ve falešném prohlížeči: scripts = přidané <script> (onload / onerror volá test), idle = naplánované úlohy. */
function loadLazy({ later = 'js/pretrip.js js/places.js js/trip.js', files = null, idle = true } = {}) {
  const scripts = [], idleQ = [], timers = [], toasts = [];
  const ctx = {
    Promise, Map, Set, String, Error,
    document: {
      currentScript: { getAttribute: (n) => (n === 'data-later' ? later : n === 'data-files' ? files : null) },
      createElement: (tag) => ({ tag, remove() { this.removed = true; } }),
      head: { appendChild: (el) => { scripts.push(el); return el; } },
    },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    toast: (msg, kind) => toasts.push([msg, kind]),
  };
  if (idle) ctx.requestIdleCallback = (fn, opts) => { idleQ.push({ fn, opts }); };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/js/lazy.js'), ctx, { filename: 'lazy.js' });
  return { L: ctx.Lazy, scripts, idleQ, timers, toasts, ctx };
}
const srcs = (list) => list.map((s) => s.src);

test('index.html: lazy.js před ostatními skripty stránky; odložené moduly nemají vlastní <script> (nenačtou se dvakrát)', () => {
  assert.ok(LAZY_TAG, '<script src="js/lazy.js" data-later="…" data-files="…">');
  assert.deepEqual(LATER, ['js/sharecard.js', 'js/pretrip.js', 'js/places.js', 'js/trip.js'], 'pořadí = závislosti: trip.js používá sharecard.js, places.js a pretrip.js');
  const body = [...INDEX.matchAll(/<script src="(js\/[a-z0-9]+\.js)"/g)].map((m) => m[1]).filter((u) => u !== 'js/pwa.js' && u !== 'js/errlog.js' && u !== 'js/flags.js');
  assert.equal(body[0], 'js/lazy.js', 'Lazy existuje dřív než skripty, které ho volají');
  for (const u of LATER) {
    assert.ok(!body.includes(u), `${u} se načítá jen přes lazy.js`);
    assert.ok(readFileSync(path.join(ROOT, 'public', u)).length > 0, `${u} existuje`);
  }
});

test('service worker ukládá pro offline všechny skripty z public/js – i odložené moduly a lazy.js', async () => {
  const { serviceWorker, shellAssets, contentVersion } = await import('../server/lib/pwa.js');
  const { precache, html } = serviceWorker({ publicDir: path.join(ROOT, 'public'), dataDir: path.join(ROOT, 'data') });
  const all = readdirSync(path.join(ROOT, 'public/js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);
  assert.ok(all.length >= 20);
  // pod adresou s otiskem obsahu, jakou má stránka od serveru (i v data-later) – ne pod holou adresou
  for (const u of all) {
    const v = `${u}?v=${contentVersion(readFileSync(path.join(ROOT, 'public', u)))}`;
    assert.ok(precache.includes(v), `v seznamu pro offline chybí ${v}`);
    assert.ok(!precache.includes(u), `${u} bez otisku`);
  }
  for (const u of LATER) assert.ok(shellAssets(INDEX).includes(u), u);
  const served = html.match(/<script src="js\/lazy\.js\?v=\w+" data-later="([^"]+)" data-files="([^"]+)"><\/script>/);
  assert.ok(served, 'stránka od serveru: lazy.js s otiskem');
  assert.deepEqual(served[1].split(' ').map((u) => u.split('?v=')[0]), LATER);
  for (const u of served[1].split(' ')) assert.ok(precache.includes(u), `odložený modul ${u} offline`);
  // knihovny map (data-files) s otiskem, ale offline se neukládají (~1,3 MB – jako dřív)
  assert.deepEqual(served[2].split(' ').map((u) => u.split('?v=')[0]), FILES);
  for (const u of served[2].split(' ')) {
    assert.match(u, /^vendor\/\S+\?v=[0-9a-f]{10}$/);
    assert.ok(!precache.some((x) => x.split('?')[0] === u.split('?')[0]), `${u} se při instalaci nestahuje`);
  }
  // data-later jen u skriptu; cizí adresy ne
  assert.deepEqual(shellAssets('<script src="js/a.js" data-later="js/b.js  ./js/c.js https://cdn.example/x.js //cdn/y.js js/a.js"></script><link rel="stylesheet" href="css/a.css" data-later="js/z.js">'),
    ['js/a.js', 'js/b.js', 'js/c.js', 'css/a.css']);
});

test('Lazy s adresami s otiskem obsahu (od serveru): moduly podle jména, adresy do <script> beze změny; Lazy.url knihovny map', async () => {
  const later = 'js/pretrip.js?v=1111111111 js/places.js?v=2222222222 js/trip.js?v=3333333333';
  const { L, scripts } = loadLazy({ later, files: 'vendor/d3.min.js?v=aaaaaaaaaa vendor/maplibre/maplibre-gl.css?v=bbbbbbbbbb' });
  assert.equal(L.has('trip'), false);
  const p = L.need('places');
  assert.deepEqual(srcs(scripts), ['js/pretrip.js?v=1111111111', 'js/places.js?v=2222222222'], 'adresa s otiskem – tu má Cloudflare i service worker');
  scripts.forEach((s) => s.onload());
  await p;
  assert.deepEqual([L.has('pretrip'), L.has('places'), L.has('trip')], [true, true, false], 'jméno modulu bez ?v=');
  assert.equal(L.url('vendor/d3.min.js'), 'vendor/d3.min.js?v=aaaaaaaaaa');
  assert.equal(L.url('vendor/maplibre/maplibre-gl.css'), 'vendor/maplibre/maplibre-gl.css?v=bbbbbbbbbb');
  assert.equal(L.url('vendor/topojson-client.min.js'), 'vendor/topojson-client.min.js', 'mimo seznam beze změny (server ho pošle s no-cache)');
  assert.equal(loadLazy().L.url('vendor/d3.min.js'), 'vendor/d3.min.js', 'bez data-files (stránka bez otisků) beze změny');
  // aplikace knihovny map načítá přes Lazy.url – všechny z data-files a jen ty
  const app = read('public/js/app.js'), places = read('public/js/places.js');
  assert.match(app, /add\(at\('vendor\/d3\.min\.js'\)\)\.then\(\(\) => add\(at\('vendor\/topojson-client\.min\.js'\)\)\)/);
  assert.match(places, /css\.href = libUrl\('vendor\/maplibre\/maplibre-gl\.css'\)/);
  assert.match(places, /sc\.src = libUrl\('vendor\/maplibre\/maplibre-gl\.js'\)/);
  const used = [...`${app}\n${places}`.matchAll(/\b(?:at|libUrl)\('([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(used, [...FILES].sort());
  for (const u of FILES) assert.ok(readFileSync(path.join(ROOT, 'public', u)).length > 0, `${u} existuje`);
});

test('aplikace žádá jen moduly ze seznamu (Lazy.need / run / has, withMod, lazyView)', () => {
  const names = new Set(LATER.map((u) => u.replace(/^js\/|\.js$/g, '')));
  let n = 0;
  for (const f of readdirSync(path.join(ROOT, 'public/js')).filter((x) => x.endsWith('.js'))) {
    for (const m of read(`public/js/${f}`).matchAll(/\b(?:Lazy\.(?:need|run|has)|withMod|lazyView)\('([^']*)'/g)) {
      n++;
      assert.ok(names.has(m[1]), `${f}: neznámý modul '${m[1]}'`);
    }
  }
  assert.ok(n >= 12, `volání ${n}`);
});

test('Lazy.need: modul i moduly před ním, každý jednou, async=false (spustí se v pořadí); hotovo až po načtení', async () => {
  const { L, scripts } = loadLazy();
  assert.deepEqual([...L.LIST], ['js/pretrip.js', 'js/places.js', 'js/trip.js']);
  assert.equal(L.has('trip'), false);
  let ok = false;
  const p = L.need('places').then(() => { ok = true; });
  assert.deepEqual(srcs(scripts), ['js/pretrip.js', 'js/places.js'], 'trip.js zatím ne');
  assert.ok(scripts.every((s) => s.async === false));
  L.need('places');
  assert.equal(scripts.length, 2, 'podruhé se nepřidá');
  scripts[0].onload();
  await tick();
  assert.equal(ok, false, 'čeká i na places.js');
  scripts[1].onload();
  await p;
  assert.equal(ok, true);
  assert.deepEqual([L.has('pretrip'), L.has('places'), L.has('trip')], [true, true, false]);
  // průvodce: přidá se jen to, co chybí
  const q = L.need('trip');
  assert.deepEqual(srcs(scripts), ['js/pretrip.js', 'js/places.js', 'js/trip.js']);
  scripts[2].onload();
  await q;
  assert.equal(L.has('trip'), true);
  await L.need('trip');
  assert.equal(scripts.length, 3, 'načtený modul se znovu nestahuje');
});

test('Lazy.run: načtený modul → fn hned (synchronně, jako dřív); jinak po načtení; výpadek sítě → hláška a příště znovu', async () => {
  const { L, scripts, toasts } = loadLazy();
  const calls = [];
  const r = L.run('trip', () => { calls.push('trip'); return 1; });
  assert.ok(r && typeof r.then === 'function');
  assert.deepEqual(calls, [], 'před načtením nic');
  scripts.forEach((s) => s.onload());
  await r;
  assert.deepEqual(calls, ['trip']);
  assert.equal(L.run('trip', () => 42), 42, 'načtený: hned s výsledkem');

  // výpadek sítě
  const b = loadLazy();
  const done = [];
  const p = b.L.run('places', () => done.push('places'));
  b.scripts[0].onload();
  b.scripts[1].onerror();
  await p;
  assert.deepEqual(done, []);
  assert.equal(b.toasts.length, 1);
  assert.equal(b.toasts[0][1], 'err');
  assert.equal(b.scripts[1].removed, true);
  assert.equal(b.L.has('places'), false);
  // další pokus přidá jen nenačtený modul znovu
  const p2 = b.L.need('places');
  assert.deepEqual(srcs(b.scripts), ['js/pretrip.js', 'js/places.js', 'js/places.js']);
  b.scripts[2].onload();
  await p2;
  assert.equal(b.L.has('places'), true);
});

test('Lazy.soon: všechny moduly jednou, až prohlížeč nemá co dělat (bez requestIdleCallback za chvíli); settled po načtení i po chybě', async () => {
  const { L, scripts, idleQ } = loadLazy();
  let settled = false;
  L.settled.then(() => { settled = true; });
  L.soon();
  L.soon();
  assert.equal(idleQ.length, 1, 'naplánované jednou');
  assert.ok(idleQ[0].opts.timeout > 0 && idleQ[0].opts.timeout <= 3000, 'nejpozději za chvíli i bez volna');
  assert.equal(scripts.length, 0, 'nic hned při startu');
  idleQ[0].fn();
  assert.deepEqual(srcs(scripts), ['js/pretrip.js', 'js/places.js', 'js/trip.js']);
  scripts[0].onload(); scripts[1].onload();
  await tick();
  assert.equal(settled, false);
  scripts[2].onload();
  await tick(); await tick();
  assert.equal(settled, true);

  const s = loadLazy({ idle: false });
  s.L.soon();
  assert.equal(s.timers.length, 1);
  s.timers[0].fn();
  assert.equal(s.scripts.length, 3);
  let st = false;
  s.L.settled.then(() => { st = true; });
  s.scripts[2].onerror();
  await tick(); await tick();
  assert.equal(st, true, 'service worker se zaregistruje i po výpadku (pwa.js)');
});

test('Lazy: modul mimo seznam se načítá se stránkou – hned hotovo; prázdný seznam nic nepřidává', async () => {
  const { L, scripts } = loadLazy();
  assert.equal(L.has('flights'), true);
  await L.need('flights');
  assert.equal(L.run('flights', () => 7), 7);
  assert.equal(scripts.length, 0);
  const e = loadLazy({ later: '' });
  await e.L.need();
  await e.L.settled;
  assert.equal(e.scripts.length, 0);
});

test('aplikace: soon po startu, sdílená cesta a Přehled s cestou počkají na průvodce, sekce a zálohy po načtení; service worker po modulech', () => {
  const app = read('public/js/app.js');
  assert.match(app, /launchDone\(\);\n\s*if \(window\.Lazy\) Lazy\.soon\(\);/, 'načtení po startu (boot)');
  assert.match(app, /if \(window\.Lazy && \(\/\^#trip=\/\.test\(location\.hash\) \|\| tripSoon\(\)\)\) await Lazy\.need\('trip'\)[^\n]*\n\s*const shared = window\.Trip && await Trip\.importFromHash\(\);/);
  assert.match(app, /if \(window\.Lazy && \/\^#trip=\/\.test\(location\.hash\)\) await Lazy\.need\('trip'\)[^\n]*\n\s*if \(window\.Trip && await Trip\.importFromHash\(\)\)/, 'odkaz vložený do otevřené stránky');
  assert.match(app, /if \(v === 'trip'\) lazyView\('trip', '#tripRoot', \(\) => \(opts\.mine \? Trip\.mine\(\) : Trip\.render\(\)\)\);/);
  assert.match(app, /if \(v === 'explore'\) lazyView\('places', '#exploreRoot', /);
  assert.match(read('public/js/backup.js'), /function open\(\) \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(window\.Lazy && !Lazy\.has\('trip'\)\) return Lazy\.run\('trip', open\);/, 'záloha s cestami z průvodce a odškrtnutím Před cestou');
  assert.match(read('public/js/pwa.js'), /Promise\.race\(\[Lazy\.settled, new Promise\(\(r\) => setTimeout\(r, 15e3\)\)\]\)[\s\S]{0,120}\.then\(\(\) => sw\.register\('sw\.js'/);
});

/* ---------- tripSoon: na co Přehled při startu počká ---------- */
function tripSoonIn(S, today = '2026-10-23') {
  const app = read('public/js/app.js');
  const pick = (re) => { const m = app.match(re); assert.ok(m, String(re)); return m[0]; };
  const src = [
    pick(/const okYmd = [^\n]*\n/), pick(/const ymdPlus = [^\n]*\n/), pick(/const wallAt = [\s\S]*?\n\};\n/),
    pick(/const ridesOf = [^\n]*\n/), pick(/const dtPlus = [^\n]*\n/), pick(/function rideOn\(g, r\) \{[\s\S]*?\n\}\n/), pick(/function tripGround\(t\) \{[\s\S]*?\n\}\n/),
    pick(/function tripLegs\(t\) \{[\s\S]*?\n\}\n/), pick(/function tripZone\(t, now\) \{[\s\S]*?\n\}\n/), pick(/const tripBack = [^\n]*\n/),
    pick(/function tripNow\(trips, now = Date\.now\(\)\) \{[\s\S]*?\n\}\n/), pick(/function tripSoon\(\) \{[\s\S]*?\n\}\n/),
  ].join('');
  const now = Date.parse(today + 'T10:00:00Z');
  const ctx = { S, window: {}, Date, JSON, Math, Number, String, Array, Object, Boolean, isNaN, fmtYMD: (d) => d.toISOString().slice(0, 10), pad: (n) => String(n).padStart(2, '0'), daysTo: (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) };
  vm.createContext(ctx);
  vm.runInContext(src + `;var __r = (() => { const D = Date; Date = class extends D { constructor(...a) { if (!a.length) return new D(${now}); return new D(...a); } static now() { return ${now}; } }; try { return tripSoon(); } finally { Date = D; } })();`, ctx);
  return ctx.__r;
}

test('tripSoon: průvodce hned jen pro rozpracovanou cestu nebo cestu v okně karty „Dnes na cestě“ – nový uživatel bez čekání', () => {
  assert.equal(tripSoonIn({ trip: null, trips: [] }), false, 'první návštěva');
  assert.equal(tripSoonIn({ trip: null, trips: [{ name: 'Řím', start: '2026-12-01', end: '2026-12-05' }] }), false, 'cesta za měsíc');
  assert.equal(tripSoonIn({ trip: null, trips: [{ name: 'Řím', start: '2026-10-24', end: '2026-10-28' }] }), true, 'zítra odjezd – karta Dnes na cestě');
  assert.equal(tripSoonIn({ trip: null, trips: [{ name: 'Řím', start: '2026-10-20', end: '2026-10-25' }] }), true, 'probíhající');
  assert.equal(tripSoonIn({ trip: null, trips: [{ name: 'Řím', start: '2026-10-01', end: '2026-10-05' }] }), false, 'skončená');
  const w = { flight: { out: { date: '2026-11-20' } }, step: 'stay', created: 5 };
  assert.equal(tripSoonIn({ trip: w, trips: [] }), true, 'rozpracovaná v průvodci (↩ Pokračuj)');
  assert.equal(tripSoonIn({ trip: { ...w, step: 'summary' }, trips: [{ tripId: 5, start: '2026-11-20' }] }), false, 'sestavená a uložená v plánovači');
  assert.equal(tripSoonIn({ trip: { ...w, step: 'summary' }, trips: [] }), true, 'sestavená, neuložená');
  assert.equal(tripSoonIn({ trip: {}, trips: 'nesmysl' }), false);
});
