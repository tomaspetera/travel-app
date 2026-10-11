// 💾 Přenos a záloha (public/js/backup.js): balení, pročištění cizího souboru a sloučení se stavem zařízení.
// Klasické skripty prohlížeče přes node:vm (plány čistí pravý PlanShare.sanitize, cesty z průvodce stub nebo pravý Trip).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('public/js/planshare.js'), ctx, { filename: 'planshare.js' });
vm.runInContext(read('public/js/backup.js'), ctx, { filename: 'backup.js' });
const B = ctx.Backup;
const plain = (v) => JSON.parse(JSON.stringify(v));
// průvodce: jen kontrola tvaru (pravý Trip.sanitizeTrip v testu níž)
const sanitizeWizard = (w) => { if (!w || !w.flight || !w.flight.out || typeof w.flight.out.from !== 'string') throw new Error('neplatný let'); return { flight: w.flight, dest: w.dest || null }; };
const deps = { sanitizePlan: ctx.PlanShare.sanitize, sanitizeWizard, txt: ctx.PlanShare.txt };
const wk = (w) => JSON.stringify(w.form.from.map((p) => p.id)) + (w.form.dFrom || '');

const BRQ = { id: 'ap:BRQ', label: 'Brno', flag: '🇨🇿', type: 'airport', iata: 'BRQ' };
const plan = (name, start, extra = {}) => ({ name, dest: 'Lisabon', iso: 'PT', start, end: start.replace(/-\d\d$/, '-20'), pax: '2', budget: '', flight: null, days: { [start]: ['Alfama'] }, checklist: [{ t: 'Pas / OP', done: true }], notes: '', ...extra });
const watch = (id, dFrom, extra = {}) => ({ id, label: `Brno → kamkoliv ${id}`, sub: 'říjen', form: { from: [BRQ], to: [], radius: 200, trip: 'return', dFrom, dTo: '2026-12-01', nMin: 3, nMax: 5, adults: 2, outDays: [5], backDays: [0], exclude: ['VIE'], depAfter: null, ground: true, kmRate: 1, legs: [] }, best: { czk: 1890, desc: 'Lisabon 12.11.' }, history: [{ at: 1, czk: 2100 }, { at: 2, czk: 1890 }], checked: 2, base: 2100, low: 1890, seen: 2100, target: null, ...extra });
const state = (o = {}) => ({ trips: [], watch: [], home: null, visited: [], ...o });

test('záloha → obnova do prázdného zařízení vrátí cesty, hlídání, domov, země i odškrtnutí', () => {
  const S = state({
    trips: [plan('Lisabon', '2026-11-12', { tripId: 1760000000000, wizard: { flight: { out: { from: 'BRQ', to: 'LIS', date: '2026-11-12' } }, dest: { label: 'Lisabon', cc: 'PT' }, booked: { 'stay:1': true, bad: 'x' } }, genName: 'Lisabon 12. 11.', genDays: { '2026-11-12': ['Alfama'] }, genChecklist: ['Pas / OP'], explore: { city: { '2026-11-13': ['Belém'] } } })],
    watch: [watch('w1', '2026-11-01')], home: { from: [BRQ], radius: 200, adults: 2 }, visited: ['CZ', 'AT'],
  });
  const text = B.pack(S, { '1760000000000:2026-11-12:PT': { d: { 'pack:doc-pass': 1 }, at: 5 } }, Date.UTC(2026, 9, 11, 18, 20));
  const j = JSON.parse(text);
  assert.equal(j.app, 'atlas');
  assert.equal(j.v, 1);
  assert.equal(j.at, '2026-10-11T18:20:00.000Z');
  const inc = B.parse(text, deps);
  assert.equal(inc.at, Date.UTC(2026, 9, 11, 18, 20));
  assert.equal(inc.trips.length, 1);
  const t = inc.trips[0];
  assert.equal(t.tripId, 1760000000000);
  assert.deepEqual(plain(t.wizard.booked), { 'stay:1': true });
  assert.equal(t.wizard.flight.out.to, 'LIS');
  assert.deepEqual(plain(t.days), { '2026-11-12': ['Alfama'] });
  assert.deepEqual(plain(t.checklist), [{ t: 'Pas / OP', done: true }]);
  assert.deepEqual(plain(t.explore), { city: { '2026-11-13': ['Belém'] } });
  assert.deepEqual(plain(t.genChecklist), ['Pas / OP']);
  assert.equal(inc.watch[0].form.from[0].id, 'ap:BRQ');
  assert.deepEqual(plain(inc.watch[0].form.outDays), [5]);
  assert.deepEqual(plain(inc.watch[0].history), [{ at: 1, czk: 2100 }, { at: 2, czk: 1890 }]);
  assert.deepEqual(plain(inc.home), { from: [BRQ], radius: 200, adults: 2 });
  assert.deepEqual(plain(inc.pretrip), { '1760000000000:2026-11-12:PT': { d: { 'pack:doc-pass': 1 }, at: 5 } });
  const df = B.diff(state(), inc, { watchKey: wk, deps });
  assert.deepEqual(plain(df), { trips: { add: 1, same: 0, changed: 0 }, watch: { add: 1, same: 0, over: 0 }, visited: { add: 2 }, home: { take: true, differs: false }, pretrip: 1 });
  const m = B.merge(state(), inc, { watchKey: wk, deps });
  assert.equal(m.trips.length, 1);
  assert.equal(m.watch.length, 1);
  assert.deepEqual(plain(m.home), plain(inc.home));
  assert.deepEqual(plain(m.visited), ['CZ', 'AT']);
});

test('opakovaná obnova nic nepřidá; změněná cesta jen s „přepsat“; země se sjednotí; domov jen na přání', () => {
  const mine = state({ trips: [plan('Lisabon', '2026-11-12', { tripId: 7 }), plan('Řím', '2026-12-01')], watch: [watch('w1', '2026-11-01')], home: { from: [BRQ], radius: 150, adults: 2 }, visited: ['CZ', 'AT', 'DE'] });
  const same = B.parse(B.pack(mine), deps);
  const d0 = B.diff(mine, same, { watchKey: wk, deps });
  assert.deepEqual(plain(d0.trips), { add: 0, same: 2, changed: 0 });
  assert.deepEqual(plain(d0.watch), { add: 0, same: 1, over: 0 });
  assert.equal(d0.visited.add, 0);
  assert.deepEqual(plain(d0.home), { take: false, differs: false });
  const m0 = B.merge(mine, same, { watchKey: wk, deps });
  assert.equal(m0.trips.length, 2);
  assert.equal(m0.watch.length, 1);
  // na druhém zařízení: jiný název cesty se stejným tripId, nová země, jiný okruh domova
  const other = state({ trips: [plan('Lisabon s Petrou', '2026-11-12', { tripId: 7 })], visited: ['CZ', 'PT'], home: { from: [BRQ], radius: 300, adults: 2 } });
  const inc = B.parse(B.pack(other), deps);
  const df = B.diff(mine, inc, { watchKey: wk, deps });
  assert.deepEqual(plain(df.trips), { add: 0, same: 0, changed: 1 });
  assert.equal(df.visited.add, 1);
  assert.deepEqual(plain(df.home), { take: false, differs: true });
  const keep = B.merge(mine, inc, { watchKey: wk, deps });
  assert.equal(keep.trips[0].name, 'Lisabon');
  assert.equal(keep.home.radius, 150);
  assert.deepEqual(plain(keep.visited), ['CZ', 'AT', 'DE', 'PT']);
  const over = B.merge(mine, inc, { watchKey: wk, overwrite: true, takeHome: true, deps });
  assert.equal(over.trips[0].name, 'Lisabon s Petrou');
  assert.equal(over.trips.length, 2);
  assert.equal(over.home.radius, 300);
  assert.equal(mine.trips[0].name, 'Lisabon', 'vstup se nemění');
});

test('hlídání: nejvýš 12, stejné hledání ani stejné id se nezdvojí', () => {
  const inc = B.parse(B.pack(state({ watch: Array.from({ length: 14 }, (_, i) => watch(`w${i}`, `2026-11-${String(i + 1).padStart(2, '0')}`)) })), deps);
  assert.equal(inc.watch.length, 14);
  const df = B.diff(state(), inc, { watchKey: wk, deps });
  assert.deepEqual(plain(df.watch), { add: 12, same: 0, over: 2 });
  assert.equal(B.merge(state(), inc, { watchKey: wk, deps }).watch.length, 12);
  const mine = state({ watch: [watch('x', '2026-11-01'), watch('w5', '2027-01-01')] }); // stejné hledání jako w0, stejné id jako w5
  const m = B.merge(mine, inc, { watchKey: wk, deps });
  assert.equal(m.watch.length, 12);
  assert.equal(m.watch.filter((w) => w.id === 'w5').length, 1);
  assert.ok(!m.watch.some((w) => w.id === 'w0'));
});

test('podvržený soubor: HTML, cizí klíče, __proto__ a špatné hodnoty se nedostanou dál', () => {
  const evil = {
    app: 'atlas', v: 1, at: 'včera',
    data: {
      trips: [
        { ...plan('<img src=x onerror=alert(1)>Lisabon', '2026-11-12'), evil: 'x', wizard: { flight: {} } },
        { ...plan('Řím', '2026-12-01'), wizard: { flight: { out: { from: 'PRG', to: 'FCO', date: '2026-12-01' } }, booked: { '<b>': true, __proto__: { polluted: true } } }, tripId: -5 },
        'text', null,
      ],
      watch: [watch('<x>', '2026-11-01'), watch('ok', '2026-11-02', { form: { from: [{ id: 'javascript:alert(1)', label: 'x' }] } }), watch('ok2', '2026-11-03', { label: '"><script>', best: { czk: -1 }, history: [{ at: 'x', czk: 5 }], target: 'levně' })],
      home: { from: [{ id: 'ap:BRQ', label: 'Brno"><b>', flag: '🇨🇿' }], radius: 99999, adults: 'dva' },
      visited: ['CZ', 'cz', 'CZE', '<b>', 'AT', 'CZ'],
      pretrip: JSON.parse('{"__proto__":{"d":{"pack:x":1}},"k1":{"d":{"pack:doc-pass":1,"<b>":1},"at":"x"},"k 2":{"d":{"pack:y":1}}}'),
    },
  };
  const inc = B.parse(JSON.stringify(evil), deps);
  assert.equal(inc.at, null);
  assert.equal(inc.trips.length, 2);
  assert.equal(inc.trips[0].name, 'img src=x onerror=alert(1)Lisabon');
  assert.equal(inc.trips[0].evil, undefined);
  assert.equal(inc.trips[0].wizard, undefined, 'průvodce bez letu tam zahozen');
  assert.deepEqual(plain(inc.trips[1].wizard.booked), {});
  assert.equal(inc.trips[1].tripId, undefined);
  assert.deepEqual(plain(inc.watch.map((w) => w.id)), ['ok2']);
  assert.equal(inc.watch[0].label, 'script');
  assert.equal(inc.watch[0].best, null);
  assert.deepEqual(plain(inc.watch[0].history), []);
  assert.equal(inc.watch[0].target, null);
  assert.deepEqual(plain(inc.home), { from: [{ id: 'ap:BRQ', label: 'Brnob', flag: '🇨🇿' }], radius: 500, adults: 2 });
  assert.deepEqual(plain(inc.visited), ['CZ', 'AT']);
  assert.deepEqual(plain(inc.pretrip), { k1: { d: { 'pack:doc-pass': 1 }, at: 0 } });
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test('cizí soubory a novější verze: srozumitelná chyba', () => {
  assert.throws(() => B.parse('{rozbité', deps), /není záloha ATLAS/);
  assert.throws(() => B.parse('{"name":"Lisabon","days":{}}', deps), /^Error: Tohle není záloha ATLAS$/);
  assert.throws(() => B.parse('[1,2]', deps), /není záloha ATLAS/);
  assert.throws(() => B.parse(JSON.stringify({ app: 'atlas', v: 2, data: {} }), deps), /novější verze ATLAS/);
  assert.throws(() => B.parse(JSON.stringify({ app: 'atlas', v: 0, data: {} }), deps), /není záloha ATLAS/);
  const empty = B.parse(JSON.stringify({ app: 'atlas', v: 1, data: {} }), deps);
  assert.deepEqual(plain(empty), { at: null, trips: [], watch: [], home: null, visited: [], pretrip: {} });
});

test('formulář hlídání: neznámé klíče jen jako jednoduché hodnoty, lety přes víc měst ověřené', () => {
  const f = B.cleanForm({ from: [BRQ], to: [{ id: 'cc:PT', label: 'Portugalsko', flag: '🇵🇹', type: 'country' }], weird: { a: 1 }, list: [1], constructor: 'x', trip: 'multi', legs: [{ from: [BRQ], to: [{ id: 'ap:LIS', label: 'Lisabon' }], date: '2026-11-12', flex: 9 }, { date: 'zítra' }], depAfter: { date: '2026-11-12', time: '25:00' }, dateMode: 'flex<script>' }, ctx.PlanShare.txt);
  assert.equal(f.weird, undefined);
  assert.equal(f.list, undefined);
  assert.equal(Object.hasOwn(f, 'constructor'), false);
  assert.equal(f.legs.length, 1);
  assert.equal(f.legs[0].flex, 3);
  assert.equal(f.depAfter, null);
  assert.equal(f.dateMode, 'flexscript');
  assert.equal(B.cleanForm({ from: [] }, ctx.PlanShare.txt), null, 'bez odletu nic hlídat nejde');
});
