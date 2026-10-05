// Hlídané ceny: čistá logika z public/js/alerts.js (klasický skript pro prohlížeč, načtený přes node:vm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/alerts.js', import.meta.url), 'utf8'), ctx);
const A = ctx.window.Alerts;
const H = 3600e3;
const NOW = Date.parse('2026-10-05T12:00:00Z');
const TODAY = '2026-10-05';
const flex = (dFrom, dTo) => ({ dateMode: 'flex', dFrom, dTo });
const exact = (xOut, xBack) => ({ dateMode: 'exact', xOut, xBack });
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu

test('isStale: nikdy nekontrolované nebo starší než 6 h', () => {
  assert.equal(A.isStale({}, NOW), true);
  assert.equal(A.isStale({ checked: NOW - 7 * H }, NOW), true);
  assert.equal(A.isStale({ checked: NOW - 6 * H }, NOW), true);
  assert.equal(A.isStale({ checked: NOW - 5 * H }, NOW), false);
  assert.equal(A.isStale({ checked: 'x' }, NOW), true, 'poškozená data = zkontrolovat');
});

test('isPast: přesná data podle odletu, flexibilní podle konce rozsahu', () => {
  assert.equal(A.isPast(exact('2026-10-04', '2026-10-10'), TODAY), true);
  assert.equal(A.isPast(exact('2026-10-05', '2026-10-10'), TODAY), false, 'odlet dnes ještě jde');
  assert.equal(A.isPast(flex('2026-09-01', '2026-10-04'), TODAY), true);
  assert.equal(A.isPast(flex('2026-09-01', '2026-10-05'), TODAY), false, 'začátek v minulosti, konec ne');
  assert.equal(A.isPast(undefined, TODAY), false);
});

test('dueWatches: jen zastaralé a neproběhlé, nejdéle nezkoušené napřed, max. 4', () => {
  const f = flex('2026-10-10', '2026-12-01');
  const list = [
    { id: 'fresh', form: f, checked: NOW - H },
    { id: 'old', form: f, checked: NOW - 30 * H },
    { id: 'older', form: f, checked: NOW - 40 * H },
    { id: 'past', form: exact('2026-10-01', '2026-10-03'), checked: NOW - 99 * H },
    { id: 'failed', form: f, checked: NOW - 50 * H, tried: NOW - 0.5 * H }, // neúspěch před chvílí → na konec
    { id: 'never', form: f },
    { id: 'a', form: f, checked: NOW - 10 * H },
    { id: 'b', form: f, checked: NOW - 9 * H },
  ];
  const due = A.dueWatches(list, { now: NOW, today: TODAY });
  assert.deepEqual(plain(due.map((w) => w.id)), ['never', 'older', 'old', 'a']);
  const rest = A.dueWatches(list, { now: NOW, today: TODAY, max: 10, skip: new Set(['never']) });
  assert.deepEqual(plain(rest.map((w) => w.id)), ['older', 'old', 'a', 'b', 'failed']);
});

test('shouldNotify: pokles o ≥ 3 %, cílová cena, bez opakování stejné ceny', () => {
  assert.equal(A.shouldNotify({ prev: 2000, cur: 1940 }), 'drop', 'přesně −3 %');
  assert.equal(A.shouldNotify({ prev: 2000, cur: 1950 }), null, '−2,5 % nestačí');
  assert.equal(A.shouldNotify({ prev: 2000, cur: 2100 }), null);
  assert.equal(A.shouldNotify({ prev: null, cur: 1500 }), null, 'první cena není pokles');
  assert.equal(A.shouldNotify({ prev: 2000, cur: 1990, target: 2000 }), 'target', 'na cíli nebo pod ním');
  assert.equal(A.shouldNotify({ prev: 2100, cur: 2050, target: 2000 }), null);
  // stejná (± 3 %) cena, jakou už jsme hlásili → ticho
  assert.equal(A.shouldNotify({ prev: 2500, cur: 2000, notified: 2000 }), null);
  assert.equal(A.shouldNotify({ prev: 2100, cur: 1990, target: 2100, notified: 2000 }), null);
  // pod cílem znovu jen při dalším výrazném zlevnění; zdražení pod cílem nehlásit
  assert.equal(A.shouldNotify({ prev: 2000, cur: 2080, target: 2100, notified: 2000 }), null);
  assert.equal(A.shouldNotify({ prev: 2000, cur: 1900, target: 2100, notified: 2000 }), 'target');
  // dříve hlášený pokles nad cílem → první překročení cíle se hlásí
  assert.equal(A.shouldNotify({ prev: 2600, cur: 2050, target: 2100, notified: 2500 }), 'target');
  // cena vyskočila a pak zase výrazně klesla (jinde než minule)
  assert.equal(A.shouldNotify({ prev: 3000, cur: 2800, notified: 2000 }), 'drop');
  assert.equal(A.shouldNotify({ prev: 2000, cur: 0 }), null);
  assert.equal(A.shouldNotify({ prev: 2000, cur: 1000 }, 60), null, 'vlastní práh');
});

test('applyCheck: historie max. 60 bodů, staré záznamy se 30 body fungují, nejnižší cena, upozornění jen jednou', () => {
  const old = { id: 'w', history: Array.from({ length: 30 }, (_, i) => ({ at: NOW - (30 - i) * H, czk: 3000 - i })), best: { czk: 2971 }, checked: NOW - 7 * H };
  const r1 = A.applyCheck(old, { czk: 2500, desc: 'Řím' }, NOW);
  assert.equal(r1.why, 'drop');
  assert.equal(r1.prev, 2971);
  assert.equal(r1.w.history.length, 31);
  assert.equal(r1.w.base, 3000, 'výchozí cena dopočtená ze starší historie');
  assert.equal(r1.w.low, 2500);
  assert.equal(r1.w.seen, 2971, 'co uživatel viděl před kontrolou');
  assert.equal(r1.w.notified, 2500);
  assert.equal(r1.w.checked, NOW);
  assert.equal(old.history.length, 30, 'vstup se nemění');
  const r2 = A.applyCheck(r1.w, { czk: 2500 }, NOW + H);
  assert.equal(r2.why, null, 'stejnou cenu podruhé nehlásí');
  let w = r2.w;
  for (let i = 0; i < 80; i++) w = A.applyCheck(w, { czk: 2600 + i }, NOW + (i + 2) * H).w;
  assert.equal(w.history.length, 60);
  assert.equal(w.low, 2500, 'nejnižší cena přežije i oříznutou historii');
  assert.equal(w.base, 3000);
  const none = A.applyCheck(w, null, NOW + 99 * H);
  assert.equal(none.why, null);
  assert.equal(none.w.history.length, 60, 'bez výsledku se bod nepřidá');
  assert.equal(none.w.best, null);
  const back = A.applyCheck(none.w, { czk: 2000 }, NOW + 100 * H);
  assert.equal(back.prev, 2679, 'po prázdné kontrole se srovnává s poslední známou cenou');
  assert.equal(back.why, 'drop');
});

test('isDropped / droppedCount: zlevnění od poslední návštěvy přehledu', () => {
  const list = [{ best: { czk: 1800 }, seen: 2000 }, { best: { czk: 2000 }, seen: 2000 }, { best: { czk: 2200 }, seen: 2000 }, { best: { czk: 900 } }, {}, { best: { czk: 1990 }, seen: 2000 }];
  assert.equal(A.isDropped(list[0]), true);
  assert.equal(A.isDropped(list[5]), false, '−0,5 % je jen výkyv kurzu');
  assert.equal(A.isDropped({ best: { czk: 1980 }, seen: 2000 }), true, '−1 % už ano');
  assert.equal(A.droppedCount(list), 1);
  assert.equal(A.droppedCount(undefined), 0);
});

test('sparkPath: x podle času, levnější = níž, rovná čára uprostřed, < 2 body nic', () => {
  assert.equal(A.sparkPath([{ at: 1, czk: 100 }]), null);
  assert.equal(A.sparkPath([]), null);
  const sp = A.sparkPath([{ at: 0, czk: 2000 }, { at: 10, czk: 1000 }, { at: 40, czk: 1500 }], 100, 30, 0);
  assert.equal(sp.d, 'M0 0L25 30L100 15');
  assert.equal(sp.min, 1000);
  assert.equal(sp.max, 2000);
  assert.deepEqual(plain(sp.last), [100, 15]);
  assert.equal(sp.y(1500), 15);
  const flat = A.sparkPath([1200, 1200, 1200], 120, 34, 4);
  assert.equal(flat.d, 'M4 17L60 17L116 17', 'bez časů rovnoměrně, stejné ceny uprostřed');
  const pts = A.sparkPath(Array.from({ length: 60 }, (_, i) => ({ at: i * H, czk: 1000 + i })), 120, 34, 4);
  assert.equal(pts.d.split('L').length, 60);
  assert.ok(/^M[\d. L]+$/.test(pts.d), 'jen čísla – bezpečné do atributu');
});

test('texty: procenta, „před 2 h“, stav upozornění', () => {
  assert.equal(A.pctChange(2000, 1760), -12);
  assert.equal(A.pctChange(2000, 2100), 5);
  assert.equal(A.pctChange(2000, 2001), 0);
  assert.equal(A.pctChange(null, 2000), null);
  assert.equal(A.fmtPct(-12), '−12 %');
  assert.equal(A.fmtPct(5), '+5 %');
  assert.equal(A.fmtPct(0), '±0 %');
  assert.equal(A.agoTxt(20e3), 'právě teď');
  assert.equal(A.agoTxt(5 * 60e3), 'před 5 min');
  assert.equal(A.agoTxt(2 * H + 5 * 60e3), 'před 2 h');
  assert.equal(A.agoTxt(30 * H), 'před 1 dnem');
  assert.equal(A.agoTxt(80 * H), 'před 3 dny');
  assert.equal(A.agoTxt(NaN), '—');
  const N = (permission) => ({ permission, requestPermission() { } });
  assert.equal(A.notifState(undefined), 'unsupported');
  assert.equal(A.notifState(N('default'), false), 'unsupported', 'bez HTTPS nejde');
  assert.equal(A.notifState(N('granted')), 'granted');
  assert.equal(A.notifState(N('denied')), 'denied');
  assert.equal(A.notifState(N('default')), 'default');
});

/* fronta kontrol s falešným časem */
function harness(list, { failIds = [], visible = () => true, sync } = {}) {
  let now = NOW;
  const log = [];
  let running = 0, maxRunning = 0;
  const tick = () => new Promise((r) => setImmediate(r));
  const sched = A.scheduler({
    list: () => list,
    today: () => TODAY,
    now: () => now,
    sleep: async (ms) => { now += ms; await tick(); },
    canRun: visible,
    sync,
    check: async (id) => {
      running++; maxRunning = Math.max(maxRunning, running);
      log.push(id);
      await tick(); await tick();
      running--;
      if (failIds.includes(id)) throw new Error('network');
      list.find((w) => w.id === id).checked = now;
    },
  });
  return { sched, log, get running() { return running; }, get maxRunning() { return maxRunning; }, advance: (ms) => { now += ms; } };
}

test('scheduler: max. 4 za cyklus, proběhlé přeskočí, nikdy dva cykly ani dvě kontroly najednou', async () => {
  const f = flex('2026-10-10', '2026-12-01');
  const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, form: f, checked: NOW - (20 + i) * H }));
  list.push({ id: 'past', form: exact('2026-10-01', '2026-10-02'), checked: 0 });
  const h = harness(list);
  const [n1, n2] = await Promise.all([h.sched.cycle(), h.sched.cycle()]);
  assert.equal(n1, 4);
  assert.equal(n2, -1, 'druhý cyklus se nespustí, dokud běží první');
  assert.deepEqual(h.log, ['f', 'e', 'd', 'c']);
  assert.ok(!h.log.includes('past'));
  // ruční kontroly během cyklu jdou přes stejný zámek
  const manual = [];
  const cyc = h.sched.cycle();
  const m = h.sched.exclusive(async () => { manual.push(h.running); await new Promise((r) => setImmediate(r)); });
  await Promise.all([cyc, m]);
  assert.deepEqual(manual, [0], 'ruční kontrola proběhla, když žádná automatická neběžela');
  assert.equal(h.maxRunning, 1, 'kontroly nikdy neběží souběžně');
  assert.deepEqual(h.log.slice(4), ['b', 'a']);
  assert.equal(await h.sched.cycle(), 0, 'vše čerstvé → nic');
});

test('scheduler: chyba sítě → ticho, zkusí se až příští cyklus; ruční kontrola mezitím = auto ji přeskočí', async () => {
  const f = flex('2026-10-10', '2026-12-01');
  const list = [{ id: 'x', form: f, checked: NOW - 10 * H }, { id: 'y', form: f, checked: NOW - 9 * H }];
  const h = harness(list, { failIds: ['x'] });
  assert.equal(await h.sched.cycle(), 2);
  assert.deepEqual(h.log, ['x', 'y'], 'chybná se v tomtéž cyklu neopakuje');
  h.advance(30 * 60e3);
  await h.sched.cycle();
  assert.deepEqual(h.log, ['x', 'y', 'x'], 'příští cyklus to zkusí znovu');
  // ruční kontrola doběhne dřív, než se automatika dostane k zámku
  list[1].checked = NOW - 99 * H;
  const order = [];
  const hold = h.sched.exclusive(async () => { order.push('manual'); list[1].checked = NOW + 99 * H; });
  const cyc = h.sched.cycle();
  await Promise.all([hold, cyc]);
  assert.deepEqual(order, ['manual']);
  assert.ok(!h.log.slice(3).includes('y'), 'čerstvě ručně zkontrolované se automaticky znovu nekontroluje');
});

test('scheduler: hledání, které mezitím zkontroloval jiný panel, se nepočítá do limitu 4', async () => {
  const f = flex('2026-10-10', '2026-12-01');
  const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, form: f, checked: NOW - (20 + i) * H }));
  // jiný panel právě zkontroloval „f“ a „e“ (sync převezme jeho výsledky)
  const h = harness(list, { sync: () => { for (const w of list) if (w.id === 'f' || w.id === 'e') w.checked = NOW; } });
  assert.equal(await h.sched.cycle(), 4);
  assert.deepEqual(h.log, ['d', 'c', 'b', 'a']);
});

test('scheduler: skrytá stránka → čeká, po limitu to vzdá', async () => {
  const f = flex('2026-10-10', '2026-12-01');
  const list = [{ id: 'z', form: f }];
  let vis = false;
  const h = harness(list, { visible: () => vis });
  assert.equal(await h.sched.cycle(), 0, 'po 10 min skrytí to vzdá');
  assert.equal(h.sched.lastCycle, 0);
  const p = h.sched.cycle();
  vis = true;
  assert.equal(await p, 1, 'jakmile je stránka vidět, zkontroluje');
  assert.ok(h.sched.lastCycle > 0);
});
