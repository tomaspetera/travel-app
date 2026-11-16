// Drobnosti z funkční kontroly Objevuj: věta bez místa vrátí do pole název místa, překlep u hor a přírody, podtitulek
// oblasti bez zdvojení, stejné řádky návrhů jednou, „Překlep?“ jen nad opravami, ✕ u zastávky výletu s ↩ Vrátit,
// jezero na víc dní bez horských túr a průměr počasí i u blízkých dnů bez předpovědi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const { natureMatches, geocodeExplore, regionSub, sameOnce } = await import('../server/lib/places.js');

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const toasts = [];
const ctx = { console, URLSearchParams, setTimeout, clearTimeout, Weather: {}, toast: (...a) => toasts.push(a) };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src('app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx);
vm.runInContext('const fmtDate = (d) => d;', ctx);
for (const f of ['smart.js', 'places.js']) vm.runInContext(src(f), ctx, { filename: f });
const T = ctx.Places._t;
const { Smart } = ctx;
const sp = (h) => h.replace(/\s+/g, ' ');

test('věta bez místa („na 2 dny“): v poli zase název otevřeného místa, ne text věty', () => {
  const run = src('places.js').match(/const runSmart = async px => \{[\s\S]*?\n {4}\};/)[0];
  assert.match(run, /if \(px\.place\) openPlace\([^;]*;\s*else \{ q\.value = qLabel\(\); paintExplore\(\); \}/);
});

test('překlep u hor a přírody: „Hallsttat“ → Hallstatt, „Sněžla“ → Sněžka s „Překlep?“; přesné a rozepsané názvy beze změny', async () => {
  assert.deepEqual(natureMatches('Hallsttat').map((x) => [x.s.label, x.s.fuzzy, x.exact]), [['Hallstatt', true, false]]);
  assert.equal(natureMatches('Sněžla')[0].s.label, 'Sněžka');
  assert.deepEqual(natureMatches('Krkon').map((x) => [x.s.label, x.exact, Boolean(x.s.fuzzy)]), [['Krkonoše', false, false]]);
  assert.deepEqual(natureMatches('Sněž').filter((x) => x.s.fuzzy), [], 'krátký text překlep není');
  for (const [q, want] of [['Hallsttat', 'Hallstatt'], ['Sněžla', 'Sněžka']]) {
    const s = (await geocodeExplore(q, { mapy: false, regions: true }))[0];
    assert.deepEqual([s.label, s.fuzzy, Boolean(s.nature)], [want, true, true], q);
  }
  // pole letů (bez regions) přírodu dál nenabízí
  assert.ok(!(await geocodeExplore('Sněžla', { mapy: false })).some((x) => x.nature));
});

test('podtitulek města oblasti bez zdvojení; stejný řádek (název, podtitulek, do 10 km) jednou', () => {
  assert.equal(regionSub('Toskánsko', 'Toskánsko, Itálie'), 'Toskánsko, Itálie');
  assert.equal(regionSub('Toskánsko', 'Itálie'), 'Toskánsko · Itálie');
  assert.equal(regionSub('Kanáry', ''), 'Kanáry');
  const town = { label: 'Ibiza', sub: 'Balearic Islands, Španělsko', lat: 38.9088, lon: 1.433, fc: 'PPLA3' };
  const island = { label: 'Ibiza', sub: 'Balearic Islands, Španělsko', lat: 38.9744, lon: 1.4001, fc: 'ISL' };
  const far = { label: 'Ibiza', sub: 'Balearic Islands, Španělsko', lat: 39.5, lon: 2.6, fc: 'PPL' };
  // Mapy.com (bez druhu) s jiným podtitulkem zůstane; hrad u stejnojmenné obce (stejný podtitulek) taky
  const mapyCastle = { label: 'Karlštejn', sub: 'Hrad · Beroun', lat: 49.9393, lon: 14.1883 };
  const village = { label: 'Karlštejn', sub: 'Středočeský kraj, Česko', lat: 49.9346, lon: 14.1797, fc: 'PPL' };
  const castle = { label: 'Karlštejn', sub: 'Středočeský kraj, Česko', lat: 49.9393, lon: 14.1883, fc: 'CSTL' };
  assert.deepEqual(sameOnce([town, village, island, castle, mapyCastle, far]), [town, village, castle, mapyCastle, far]);
});

test('„Ibiza“ v Objevuj: obec a ostrov se stejným podtitulkem jednou', async () => {
  const ib = (await geocodeExplore('Ibiza', { mapy: false, regions: true })).filter((x) => x.label === 'Ibiza');
  const keys = ib.map((x) => `${x.label}|${x.sub}`);
  assert.equal(new Set(keys).size, keys.length, keys.join('; '));
});

test('„Překlep? Asi myslíš:“ jen nad opravami, nesouvisející místa pod „Další místa:“', () => {
  const h = sp(T.sugHtml([{ label: 'Krakov', sub: 'Polsko', fuzzy: true }, { label: 'Kråkvåg', sub: 'Norsko' }], 0, false));
  assert.ok(h.indexOf('Překlep?') < h.indexOf('Krakov') && h.indexOf('Krakov') < h.indexOf('Další místa:') && h.indexOf('Další místa:') < h.indexOf('Kråkvåg'), h);
  assert.equal(h.match(/pi-head/g).length, 2);
  // bez opravy žádná hlavička; oprava jako jediný řádek jen „Překlep?“
  assert.doesNotMatch(T.sugHtml([{ label: 'Brno' }, { label: 'Brnoz' }], 0, false), /pi-head/);
  assert.equal(T.sugHtml([{ label: 'Krakov', fuzzy: true }], 0, false).match(/pi-head/g).length, 1);
});

test('✕ u zastávky výletu: vyřadí, přeplánuje a hláška „Vyřazeno: …“ s ↩ Vrátit vrátí i „chci navštívit“', () => {
  const ex = T.ex;
  ex.tripEx.clear(); ex.tripMust.clear(); ex.tripMust.add('w:1');
  let replans = 0;
  const plan = { days: [{ stops: [{ id: 'w:1', name: 'Lednice' }, { id: 'w:2', name: 'Mikulov' }] }] };
  toasts.length = 0;
  T.tripDropUndo('w:1', plan, () => replans++);
  assert.deepEqual([ex.tripEx.has('w:1'), ex.tripMust.has('w:1'), replans], [true, false, 1]);
  assert.equal(toasts.length, 1);
  const [msg, , , act] = toasts[0];
  assert.equal(msg, 'Vyřazeno: Lednice – výlety jsem upravil');
  assert.equal(act.label, '↩ Vrátit');
  act.run();
  assert.deepEqual([ex.tripEx.has('w:1'), ex.tripMust.has('w:1'), replans], [false, true, 2]);
  // bez plánu hláška bez názvu
  T.tripDropUndo('w:9', null, () => {});
  assert.equal(toasts.at(-1)[0], 'Vyřazeno – výlety jsem upravil');
  ex.tripEx.clear(); ex.tripMust.clear();
});

test('„Hallstatt na 3 dny“ (jezero) = program ve městě, ne horské túry; hory dál túry', () => {
  const ex = T.ex;
  const today = { today: '2026-10-22' };
  const hallstatt = { label: 'Hallstatt', lat: 47.5622, lon: 13.6487, cc: 'AT', nature: 'lake', km: 10 };
  assert.equal(T.hikesAt(hallstatt), false);
  assert.equal(T.hikesAt({ nature: 'range' }), true);
  assert.equal(T.hikesAt({ nature: 'cave' }), true);
  assert.equal(T.hikesAt({ label: 'Brno' }), false);
  Object.assign(ex, { mode: 'city', days: 1, auto: null, radius: 5 });
  T.exploreApply(Smart.parseExplore('Hallstatt na 3 dny', today), hallstatt);
  T.setPlace(hallstatt);
  assert.deepEqual([ex.mode, ex.days, ex.radius], ['city', 3, 10], 'program ve městě, okruh jezera zůstane');
  const krkonose = { label: 'Krkonoše', lat: 50.7672, lon: 15.6222, cc: 'CZ', nature: 'range', km: 20 };
  T.exploreApply(Smart.parseExplore('Krkonoše na 3 dny', today), krkonose);
  T.setPlace(krkonose);
  assert.deepEqual([ex.mode, ex.hike.kind], ['hike', 'days']);
  Object.assign(ex, { mode: 'city', auto: null });
});

test('počasí bez předpovědi: průměr i u dnů do 9 dní (s jiným vysvětlením), u minulých dnů nic', () => {
  assert.match(T.wxAvgWhy(3, 9), /^dlouhodobý průměr .* ne předpověď – ta teď není k dispozici$/);
  assert.match(T.wxAvgWhy(0, 9), /teď není k dispozici/);
  assert.match(T.wxAvgWhy(9, 9), /teď není k dispozici/);
  assert.match(T.wxAvgWhy(12, 9), /ta je nejvýš na 9 dní dopředu$/);
  assert.equal(T.wxAvgWhy(-1, 9), '');
  assert.equal(T.wxAvgWhy(NaN, 9), '');
});
