// „Je to dobrá cena?“: statistika a úroveň ceny na serveru (server/lib/pricelevel.js), stejné pravidlo v prohlížeči
// a paměť cen (public/js/pricecheck.js – klasický skript pro prohlížeč, načtený přes node:vm), napojení na hledání.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { levelOf, positionIn, priceLevelOf, priceStats, quantile, refOf } from '../server/lib/pricelevel.js';
import { ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { search } = await import('../server/lib/search.js');

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/pricecheck.js', import.meta.url), 'utf8'), ctx);
const P = ctx.window.PriceCheck;
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu

const NOW = Date.parse('2026-10-05T12:00:00Z');
const H = 3600e3;
const DAY = 24 * H;
const trip = (flightCzk, extra = {}) => ({ flightCzk, distanceKm: 1100, back: { date: '2026-11-16' }, out: { from: 'PRG', date: '2026-11-12', live: true }, destKey: 'BCN', ...extra });
// 10 nabídek 2 000–4 700 Kč (zpáteční, 1 100 km → průměrná cena ~3 960 Kč)
const PRICES = [2000, 2300, 2600, 2900, 3200, 3500, 3800, 4100, 4400, 4700];
const entries = (list) => list.map((czk, i) => ({ czk, date: `2026-11-${String(10 + i).padStart(2, '0')}`, from: i % 2 ? 'VIE' : 'PRG' }));
const ST = priceStats(entries(PRICES));
const SORTED = [...PRICES];

test('priceStats: kvantily, rozpětí dat a nejlevnější letenka podle letiště a měsíce', () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
  assert.equal(quantile([100, 200], 0.5), 150);
  assert.deepEqual({ ...ST, mins: undefined }, { n: 10, min: 2000, p25: 2675, median: 3350, p75: 4025, max: 4700, dateFrom: '2026-11-10', dateTo: '2026-11-19', mins: undefined });
  assert.deepEqual(ST.mins.sort(), [['PRG', '2026-11', 2000], ['VIE', '2026-11', 2300]]);
  assert.equal(priceStats([]), null);
  assert.equal(priceStats([{ czk: 0, date: '2026-11-01', from: 'PRG' }]), null);
});

test('positionIn: 0 jen nejlevnější, 100 jen nejdražší, shodné ceny napůl', () => {
  assert.equal(positionIn(SORTED, 2000), 0);
  assert.equal(positionIn(SORTED, 4700), 100);
  assert.equal(positionIn(SORTED, 3200), 44);
  const many = Array.from({ length: 300 }, (_, i) => 1000 + i);
  assert.equal(positionIn(many, 1001), 1, 'druhá nejlevnější z 300 není „nejlevnější“');
  assert.equal(positionIn(many, 1298), 99);
  assert.equal(positionIn([500, 500, 900], 500), 25);
  assert.equal(positionIn([500], 500), null);
});

test('priceLevelOf: hledání rozhoduje kvantily, málo nabídek → průměrná cena na vzdálenost', () => {
  const low = priceLevelOf(trip(2000), ST, SORTED);
  assert.deepEqual([low.level, low.basis, low.reason, low.pos, low.n], ['low', 'search', 'nejlevnější nabídka do tohoto cíle v tomto hledání', 0, 10]);
  assert.equal(low.ref, refOf(trip(2000)));
  assert.equal(low.vsRef, Math.round((2000 / low.ref - 1) * 100));
  const mid = priceLevelOf(trip(3500), ST, SORTED);
  assert.deepEqual([mid.level, mid.reason], ['normal', `kolem obvyklé ceny do tohoto cíle (polovina nabídek stojí nejvýš ${(3350).toLocaleString('cs-CZ')} Kč)`]);
  const high = priceLevelOf(trip(4700), ST, SORTED);
  assert.deepEqual([high.level, high.basis, high.reason], ['high', 'search', 'nejdražší nabídka do tohoto cíle v tomto hledání']);
  assert.equal(priceLevelOf(trip(4400), ST, SORTED).reason, 'dráž než 89 % nabídek do tohoto cíle');
  // statistika je za jeden cíl – u „kamkoliv“ nesmí víc cílů tvrdit „nejlevnější v hledání“
  for (const t of [low, mid, high]) assert.doesNotMatch(t.reason, /nabídk\w* v tomto hledání|obvyklé ceny v tomto hledání/);
  // málo nabídek: jen podle vzdálenosti, a reason to přizná
  const few = priceStats(entries([1500, 1600, 9000]));
  const f = priceLevelOf(trip(1500), few, [1500, 1600, 9000]);
  assert.deepEqual([f.level, f.basis], ['low', 'distance']);
  assert.match(f.reason, /^o 62 % pod průměrnou cenou na tuto vzdálenost \(k porovnání jen 3 nabídky\)$/);
  // „běžná“ podle vzdálenosti: text řekne, že pod průměrem ještě neznamená výhodná
  assert.equal(priceLevelOf(trip(3000), null).reason, 'o 24 % pod průměrnou cenou na tuto vzdálenost – výhodná bývá až od ~40 % (jiné nabídky k porovnání nejsou)');
  assert.equal(priceLevelOf(trip(4600), null).reason, 'o 16 % nad průměrnou cenou na tuto vzdálenost – ještě v normě (jiné nabídky k porovnání nejsou)');
  assert.equal(priceLevelOf(trip(4000), null).reason, 'kolem průměrné ceny na tuto vzdálenost (jiné nabídky k porovnání nejsou)');
  assert.deepEqual([priceLevelOf(trip(5000), null).level, priceLevelOf(trip(5000), null).reason], ['high', 'o 26 % nad průměrnou cenou na tuto vzdálenost (jiné nabídky k porovnání nejsou)']);
  assert.match(priceLevelOf(trip(4000), null).reason, /jiné nabídky k porovnání nejsou/);
});

test('priceLevelOf: levná na vzdálenost platí jen pod mediánem; když si měřítka odporují, je to „běžná“', () => {
  // všechny nabídky levné vůči vzdálenosti (průměr ~3 960 Kč): pod mediánem dobrá, nad ním běžná
  const cheap = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 2300];
  const st = priceStats(entries(cheap));
  assert.deepEqual(plain(levelOf(trip(1300), st)), ['low', 'distance']);
  assert.deepEqual(plain(levelOf(trip(1600), st)), ['normal', 'search']);
  // nejdražší z levných: v hledání drahá, na vzdálenost levná → běžná (mixed)
  const mixed = priceLevelOf(trip(2300), st, cheap);
  assert.deepEqual([mixed.level, mixed.basis, mixed.reason], ['normal', 'mixed', 'hluboko pod průměrem na tuto vzdálenost, do tohoto cíle jsou ale levnější nabídky']);
  // drahé období: nad mediánem a dražší než průměr → dráž než obvykle; nejlevnější z drahých → běžná
  const dear = [5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900];
  const sd = priceStats(entries(dear));
  assert.deepEqual(plain(levelOf(trip(5600), sd)), ['high', 'distance']);
  assert.equal(priceLevelOf(trip(5000), sd, dear).reason, 'levná mezi nabídkami do tohoto cíle, ale nad průměrnou cenou na tuto vzdálenost');
});

test('prohlížeč počítá úroveň stejně jako server (cesty složené ze dvou letenek)', () => {
  const stats = [null, priceStats(entries([1500, 1600, 9000])), ST, priceStats(entries([1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 2300])),
    priceStats(entries([5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900]))];
  let n = 0;
  for (const st of stats) {
    for (const km of [250, 900, 1100, 2800, 4200, 9500]) {
      for (const back of [null, { date: '2026-11-16' }]) {
        for (const czk of [400, 900, 1500, 2000, 2600, 3350, 4100, 5000, 5600, 7000, 12000, 30000]) {
          const t = trip(czk, { distanceKm: km, back });
          const s = priceLevelOf(t, st);
          const c = P.assess(t, st);
          assert.deepEqual([c.level, c.basis, c.ref, c.vsRef, c.n], [s.level, s.basis, s.ref, s.vsRef, s.n], JSON.stringify({ km, back: !!back, czk, n: st?.n }));
          if (s.basis !== 'search' || s.level === 'normal') assert.equal(c.reason, s.reason);
          n++;
        }
      }
    }
  }
  assert.equal(n, 5 * 6 * 2 * 12);
  // ze serveru se úroveň přebírá beze změny
  const srv = { level: 'high', reason: 'x' };
  assert.equal(P.assess({ ...trip(1000), priceLevel: srv }, ST), srv);
  // odhad pozice z kvantilů
  assert.equal(P.estPos(2000, ST), 0);
  assert.equal(P.estPos(3350, ST), 50);
  assert.equal(P.estPos(4700, ST), 100);
  assert.equal(P.assess(trip(3350), ST).est, true);
});

test('paměť cen: klíč trasy, záznam z výsledku, nejnižší cena a kdy', () => {
  assert.equal(P.tripKey(trip(1000)), 'PRG>BCN|2026-11|rt');
  assert.equal(P.tripKey(trip(1000, { back: null })), 'PRG>BCN|2026-11|ow');
  assert.equal(P.tripKey({ out: { from: 'PRG', date: '2026-11-12' } }), null, 'bez cílového města nic');
  const res = { query: { trip: 'return', dateFrom: '2026-11-01', dateTo: '2026-11-30', nightsMin: 3, nightsMax: 5 }, groups: [
    { dest: { key: 'BCN' }, priceStats: { mins: [['PRG', '2026-11', 2100], ['VIE', '2026-11', 1900], ['PRG', '2026-12', 2500]] } },
    { dest: { key: 'LON' }, priceStats: null },
  ] };
  assert.deepEqual(plain(P.entriesOf(res)).map((e) => e.key), ['VIE>BCN|2026-11|rt', 'PRG>BCN|2026-11|rt', 'PRG>BCN|2026-12|rt']);
  let s = P.record(null, P.entriesOf(res), { now: NOW, scope: 'a' });
  assert.deepEqual(plain(P.memoryOf(s, 'PRG>BCN|2026-11|rt', NOW)), { min: 2100, ago: 0, sinceDays: 0, n: 1, trend: null });
  // za 5 dní dražší → nejnižší zůstává z doby před 5 dny
  s = P.record(s, [{ key: 'PRG>BCN|2026-11|rt', czk: 2600 }], { now: NOW + 5 * DAY, scope: 'a' });
  const m = P.memoryOf(s, 'PRG>BCN|2026-11|rt', NOW + 5 * DAY);
  assert.deepEqual([m.min, m.ago, m.sinceDays, m.n], [2100, 5, 5, 2]);
  assert.equal(P.agoTxt(m.ago), 'před 5 dny');
  assert.deepEqual([P.agoTxt(0), P.agoTxt(1)], ['dnes', 'včera']);
});

test('paměť cen: trend jen mezi stejnými hledáními, opakované hledání do 6 h je jedno pozorování', () => {
  const k = 'PRG>BCN|2026-11|rt';
  let s = P.record(null, [{ key: k, czk: 2000 }], { now: NOW, scope: 'a' });
  s = P.record(s, [{ key: k, czk: 1900 }], { now: NOW + 2 * H, scope: 'a' });
  assert.equal(P.memoryOf(s, k, NOW + 2 * H).n, 1, 'do 6 h se jen přepíše');
  assert.equal(P.memoryOf(s, k, NOW + 2 * H).trend, null);
  assert.equal(P.memoryOf(s, k, NOW).min, 1900);
  s = P.record(s, [{ key: k, czk: 1700 }], { now: NOW + 3 * DAY, scope: 'b' });
  assert.equal(P.memoryOf(s, k, NOW + 3 * DAY).trend, null, 'jiné hledání (jiné termíny) trend nedělá');
  s = P.record(s, [{ key: k, czk: 1750 }], { now: NOW + 4 * DAY, scope: 'a' });
  assert.deepEqual(plain(P.memoryOf(s, k, NOW + 4 * DAY).trend), { dir: 'down', pct: -8, prev: 1900, cur: 1750, days: 4 });
  s = P.record(s, [{ key: k, czk: 1780 }], { now: NOW + 5 * DAY, scope: 'a' });
  assert.equal(P.memoryOf(s, k, NOW + 5 * DAY).trend.dir, 'flat', '+2 % je beze změny');
  s = P.record(s, [{ key: k, czk: 2100 }], { now: NOW + 6 * DAY, scope: 'a' });
  assert.deepEqual([P.memoryOf(s, k, NOW + 6 * DAY).trend.dir, P.memoryOf(s, k, NOW + 6 * DAY).trend.pct], ['up', 18]);
  for (let i = 7; i < 20; i++) s = P.record(s, [{ key: k, czk: 2000 + i }], { now: NOW + i * DAY, scope: 'a' });
  assert.equal(s.r[k].obs.length, P.CFG.maxObs);
  assert.equal(P.memoryOf(s, k, NOW + 20 * DAY).min, 1700, 'nejnižší cena se pamatuje i po vypadnutí z pozorování');
  // otisk hledání: stejné termíny = stejný otisk
  const q = { trip: 'return', dateFrom: '2026-11-01', dateTo: '2026-11-30', nightsMin: 3, nightsMax: 5, outDays: [], backDays: [] };
  assert.equal(P.scopeOf(q), P.scopeOf({ ...q }));
  assert.notEqual(P.scopeOf(q), P.scopeOf({ ...q, dateTo: '2026-12-15' }));
  assert.notEqual(P.scopeOf(q), P.scopeOf({ ...q, exact: { out: '2026-11-12', back: '2026-11-16', flex: 0 } }));
});

test('paměť cen: otisk hledání po měsících – rozjetý rozsah dat má celé měsíce stejné, jiný cíl je jiné hledání', () => {
  const q = (dateFrom, dateTo, extra = {}) => ({ trip: 'return', to: ['metro:LON'], dateFrom, dateTo, nightsMin: 3, nightsMax: 5, outDays: [], backDays: [], ...extra });
  // „příští 3 měsíce“ hledané 6. a 9. 10.: listopad je celý v obou → stejný otisk, říjen začíná jindy → jiný
  const a = q('2026-10-06', '2027-01-04');
  const b = q('2026-10-09', '2027-01-07');
  assert.equal(P.scopeOf(a, '2026-11'), P.scopeOf(b, '2026-11'));
  assert.equal(P.scopeOf(a, '2026-12'), P.scopeOf(b, '2026-12'));
  assert.notEqual(P.scopeOf(a, '2026-10'), P.scopeOf(b, '2026-10'));
  assert.notEqual(P.scopeOf(a, '2027-01'), P.scopeOf(b, '2027-01'));
  assert.notEqual(P.scopeOf(a, '2026-11'), P.scopeOf({ ...a, to: [] }, '2026-11'), 'kamkoliv vrací na trasu méně nabídek než konkrétní cíl');
  assert.equal(P.scopeOf(a, '2026-11'), P.scopeOf({ ...a, to: ['metro:LON'] }, '2026-11'));
  assert.notEqual(P.scopeOf(a, '2026-11'), P.scopeOf({ ...a, nightsMax: 7 }, '2026-11'));
  // přesná data se neořezávají
  const x = { ...a, exact: { out: '2026-11-12', back: '2026-11-16', flex: 1 } };
  assert.equal(P.scopeOf(x, '2026-11'), P.scopeOf({ ...x, dateFrom: '2026-11-11' }, '2026-11'));
  // z výsledku: každá trasa nese otisk svého měsíce → trend mezi hledáními různých dnů
  const res = (query, czk) => ({ query, groups: [{ dest: { key: 'LON' }, priceStats: { mins: [['PRG', '2026-11', czk], ['PRG', '2026-10', czk]] } }] });
  const mem = new Map();
  const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  P.remember(res(a, 1500), { now: NOW, ls });
  P.remember(res(b, 1400), { now: NOW + 3 * DAY, ls });
  const s = P.load(ls);
  assert.deepEqual(plain(P.memoryOf(s, 'PRG>LON|2026-11|rt', NOW + 3 * DAY).trend), { dir: 'down', pct: -7, prev: 1500, cur: 1400, days: 3 });
  assert.equal(P.memoryOf(s, 'PRG>LON|2026-10|rt', NOW + 3 * DAY).trend, null, 'kratší zbytek října není totéž hledání');
});

test('paměť cen: strop tras, zapomenutí minulých měsíců, limit nových tras z jednoho hledání', () => {
  const key = (i, m = '2026-11') => `PRG>D${i}|${m}|rt`;
  let s = P.record(null, [{ key: key(0, '2026-09'), czk: 900 }, { key: key(1, '2026-10'), czk: 900 }], { now: Date.parse('2026-09-20T12:00:00Z') });
  assert.equal(Object.keys(s.r).length, 2);
  s = P.prune(s, NOW);
  assert.deepEqual(Object.keys(s.r), [key(1, '2026-10')], 'odlet v září už je minulost');
  // jedno hledání „kamkoliv“ zapíše nejvýš maxNew nových tras, známé trasy aktualizuje vždy
  const many = Array.from({ length: 200 }, (_, i) => ({ key: key(i), czk: 1000 + i }));
  s = P.record(s, many, { now: NOW });
  assert.equal(Object.keys(s.r).length, 1 + P.CFG.maxNew);
  s = P.record(s, [...many.slice(0, 120), { key: key(1, '2026-10'), czk: 800 }], { now: NOW + DAY });
  assert.equal(s.r[key(1, '2026-10')].min, 800);
  // strop: zapomenout nejdéle neaktualizované
  for (let b = 0; b < 4; b++) s = P.record(s, Array.from({ length: 100 }, (_, i) => ({ key: `X${b}>Y${i}|2026-12|ow`, czk: 500 })), { now: NOW + (2 + b) * DAY });
  assert.equal(Object.keys(s.r).length, P.CFG.maxRoutes);
  assert.ok(!s.r[key(5)] && s.r['X3>Y99|2026-12|ow'], 'staré trasy pryč, poslední hledání zůstává');
  // trasa, kterou přes maxAgeDays žádné hledání neukázalo, se zapomene (i s odletem v budoucnu)
  let t = P.record(null, [{ key: 'PRG>BCN|2027-06|rt', czk: 900 }, { key: 'PRG>OPO|2027-06|rt', czk: 1900 }], { now: NOW });
  t = P.record(t, [{ key: 'PRG>OPO|2027-06|rt', czk: 1800 }], { now: NOW + 100 * DAY });
  assert.ok(P.prune(plain(t), NOW + (P.CFG.maxAgeDays - 1) * DAY).r['PRG>BCN|2027-06|rt']);
  assert.deepEqual(Object.keys(P.prune(t, NOW + (P.CFG.maxAgeDays + 1) * DAY).r), ['PRG>OPO|2027-06|rt']);
});

test('paměť cen: localStorage – uložit, načíst, poškozená data, panel doplní jen chybějící trasu', () => {
  const mem = new Map();
  const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const res = { query: { trip: 'oneway', dateFrom: '2026-11-01', dateTo: '2026-11-30' }, groups: [{ dest: { key: 'BCN' }, priceStats: { mins: [['PRG', '2026-11', 1200]] } }] };
  P.remember(res, { now: NOW, ls });
  assert.equal(P.load(ls).r['PRG>BCN|2026-11|ow'].min, 1200);
  // panel otevřený za den nad týmž výsledkem: trasa už v paměti je → žádné nové pozorování (falešný trend)
  P.remember(res, { now: NOW + DAY, ls, only: 'PRG>BCN|2026-11|ow' });
  assert.equal(P.load(ls).r['PRG>BCN|2026-11|ow'].obs.length, 1);
  mem.set(P.STORE_KEY, '{nonsense');
  assert.deepEqual(plain(P.load(ls)), { v: 1, r: {} });
  mem.set(P.STORE_KEY, JSON.stringify({ r: { a: { min: -1, at: 5 }, b: { min: 100, at: NOW, obs: [[NOW, 100, 's'], 'x', [0, 5]] } } }));
  assert.deepEqual(plain(P.load(ls).r), { b: { min: 100, at: NOW, since: NOW, u: NOW, obs: [[NOW, 100, 's']] } });
  // bez localStorage (node, zakázané úložiště) nic nespadne
  assert.doesNotThrow(() => P.remember(res, { now: NOW }));
  assert.deepEqual(plain(P.load()), { v: 1, r: {} });
});

test('rada: koupit / hlídat / zkusit jiné dny podle úrovně a dní do odletu, vždy opatrně', () => {
  assert.equal(P.advice('low', 10).kind, 'buy');
  assert.match(P.advice('low', 10).text, /obvykle zvedají/);
  assert.equal(P.advice('low', 90).kind, 'buy');
  assert.match(P.advice('low', 90).text, /může, ale nemusí/);
  assert.equal(P.advice('normal', 50).kind, 'watch');
  assert.match(P.advice('high', 70).text, /^Cena je vyšší než obvykle\. Do odletu zbývá 10 týdnů.*♡.*Zaručené to není/);
  assert.equal(P.advice('normal', 49).kind, 'compare');
  assert.equal(P.advice('high', 21).kind, 'compare');
  assert.equal(P.advice('normal', 20).kind, 'late');
  assert.match(P.advice('normal', 3).text, /nízkonákladovek se před odletem obvykle zvedají/);
  // žádné sliby: „ozve se, jestli zlevní“, ne „až zlevní“; „dá se ušetřit spíš“, ne „ušetříš“
  for (const [lv, d] of [['low', 10], ['low', 90], ['normal', 70], ['high', 30], ['normal', 5]]) assert.doesNotMatch(P.advice(lv, d).text, /až zlevní|ušetříš/);
  assert.equal(P.advice('low', -1), null);
  assert.equal(P.advice('low', null), null);
});

test('explain: podklady panelu – úroveň, dny do odletu, paměť a rozdíl proti nejlevnější viděné', () => {
  const t = trip(2300);
  const store = P.record(null, [{ key: P.tripKey(t), czk: 2000 }], { now: NOW - 3 * DAY, scope: 'a' });
  const x = P.explain(t, { stats: ST, store, now: NOW, today: '2026-10-05' });
  assert.deepEqual([x.pl.level, x.days, x.mem.min, x.mem.ago, x.vsMem, x.advice.kind], ['low', 38, 2000, 3, 15, 'buy']);
  const y = P.explain(trip(2000), { stats: ST, store: null, now: NOW, today: '2026-10-05' });
  assert.deepEqual([y.mem, y.vsMem], [null, null]);
  // trend právě toho hledání, ze kterého cesta je – i když trasu mezitím ukázalo jiné hledání
  const q1 = { trip: 'return', to: ['metro:BCN'], dateFrom: '2026-11-01', dateTo: '2026-11-30', nightsMin: 3, nightsMax: 5 };
  const q2 = { ...q1, to: [] };
  const k = P.tripKey(t);
  let s2 = P.record(null, [{ key: k, czk: 2400, scope: P.scopeOf(q1, '2026-11') }], { now: NOW - 4 * DAY });
  s2 = P.record(s2, [{ key: k, czk: 2200, scope: P.scopeOf(q1, '2026-11') }], { now: NOW - DAY });
  s2 = P.record(s2, [{ key: k, czk: 2600, scope: P.scopeOf(q2, '2026-11') }], { now: NOW });
  assert.equal(P.explain(t, { stats: ST, store: s2, now: NOW, today: '2026-10-05' }).mem.trend, null, 'poslední je hledání kamkoliv – samo bez trendu');
  assert.deepEqual(plain(P.explain(t, { stats: ST, store: s2, now: NOW, today: '2026-10-05', query: q1 }).mem.trend), { dir: 'down', pct: -8, prev: 2400, cur: 2200, days: 3 });
  assert.equal(P.explain({ out: { date: '2026-11-01' } }, {}), null, 'bez ceny nic');
  // levnější letenka z jiného hledání (jiná délka pobytu) se nesrovnává napřímo – jen zvlášť jako otherMin
  let s3 = P.record(null, [{ key: k, czk: 1023, scope: P.scopeOf({ ...q1, nightsMin: 1, nightsMax: 2 }, '2026-11') }], { now: NOW - 2 * H });
  s3 = P.record(s3, [{ key: k, czk: 1500, scope: P.scopeOf(q1, '2026-11') }], { now: NOW });
  const z = P.explain(trip(1515), { stats: ST, store: s3, now: NOW, today: '2026-10-05', query: q1 });
  assert.deepEqual([z.scoped, z.vsMem, z.mem.scopeMin, z.otherMin.czk], [true, 1, 1500, 1023]);
  const w = P.explain(trip(1515), { stats: ST, store: s3, now: NOW, today: '2026-10-05' });
  assert.deepEqual([w.scoped, w.vsMem, w.otherMin], [false, 48, null], 'bez dotazu jako dřív');
  // opakované hledání do 6 h: nejnižší cena téhož hledání zůstane (o[3]), nevydává se za „jiné hledání“
  let s4 = P.record(null, [{ key: k, czk: 1023, scope: P.scopeOf(q1, '2026-11') }], { now: NOW - 2 * H });
  s4 = P.record(s4, [{ key: k, czk: 1100, scope: P.scopeOf(q1, '2026-11') }], { now: NOW });
  const r4 = P.explain(trip(1100), { stats: ST, store: s4, now: NOW, today: '2026-10-05', query: q1 });
  assert.deepEqual([r4.scoped, r4.mem.scopeMin, r4.vsMem, r4.otherMin], [true, 1023, 8, null]);
  // hledání, které paměť nemá: nesrovnává se, nejnižší viděná jen jako „dřív“, žádný cizí trend
  const q3 = { ...q1, nightsMin: 7, nightsMax: 9 };
  const r5 = P.explain(trip(1100), { stats: ST, store: s2, now: NOW, today: '2026-10-05', query: q3 });
  assert.deepEqual(plain([r5.scoped, r5.vsMem, r5.otherMin, r5.mem.trend, r5.cheapestSeen]), [false, null, null, null, true], 'levnější než vše viděné – žádné „dřív viděl i“ dražší');
  const r6 = P.explain(trip(r5.mem.min + 500), { stats: ST, store: s2, now: NOW, today: '2026-10-05', query: q3 });
  assert.deepEqual(plain([r6.vsMem, r6.otherMin.kind, r6.otherMin.czk, r6.cheapestSeen]), [null, 'earlier', r5.mem.min, false]);
});

test('hledání: statistika ze všech nabídek i nad limitem ceny, 🔥/👍 nikdy u běžné nebo vyšší ceny', async () => {
  const q = { from: ['ap:VIE'], to: ['metro:LON'], radiusKm: 0, dateFrom: ymdPlus(12), dateTo: ymdPlus(45), trip: 'return', nightsMin: 2, nightsMax: 5, kmRate: 0 };
  const all = await search(q);
  const st = all.groups[0].priceStats;
  assert.ok(st.n >= 20, `nabídek ${st.n}`);
  const capped = await search({ ...q, maxPrice: st.median });
  assert.ok(capped.filters.hidden.maxPrice > 0);
  assert.deepEqual(capped.groups[0].priceStats, st, 'limit ceny skryje nabídky ve výpisu, ale ne ze statistiky');
  assert.deepEqual(capped.priceStats, all.priceStats);
  const trips = [...all.top, ...all.groups.flatMap((g) => g.options)];
  const levels = new Set(trips.map((t) => t.priceLevel.level));
  assert.ok(levels.has('low') && levels.has('normal'), [...levels].join(','));
  for (const t of trips) {
    if (t.priceLevel.level !== 'low') assert.ok(!['super', 'good'].includes(t.deal.level), `${t.deal.level} × ${t.priceLevel.level}`);
    assert.deepEqual(plain(P.levelOf(t, st)), [t.priceLevel.level, t.priceLevel.basis], 'prohlížeč by cestu ohodnotil stejně');
  }
  // paměť z reálného výsledku: klíče tras odpovídají cestám ve výsledku
  const keys = new Set(P.entriesOf(all).map((e) => e.key));
  assert.ok(all.top.every((t) => keys.has(P.tripKey(t))));
});

test('scopeOf: pravidlo „v předvečer jen od 16:00“ je jiné hledání; bez něj nebo mimo měsíc otisk beze změny', () => {
  const q = { from: ['ap:BRQ'], to: [], dateFrom: '2026-11-13', dateTo: '2026-11-14', trip: 'return', nightsMin: 3, nightsMax: 4, outDays: [5, 6], backDays: [2] };
  const da = { ...q, depAfter: { date: '2026-11-13', time: '16:00' } };
  assert.notEqual(P.scopeOf(da, '2026-11'), P.scopeOf(q, '2026-11'));
  assert.equal(P.scopeOf({ ...q, depAfter: null }, '2026-11'), P.scopeOf(q, '2026-11'));
  const dec = { ...q, dateFrom: '2026-11-30', dateTo: '2026-12-01', depAfter: { date: '2026-11-30', time: '16:00' } };
  assert.equal(P.scopeOf(dec, '2026-12'), P.scopeOf({ ...dec, depAfter: null }, '2026-12'), 'předvečer v jiném měsíci');
});
