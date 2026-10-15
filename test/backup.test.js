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
  assert.deepEqual(plain(df), { trips: { add: 1, same: 0, changed: 0 }, watch: { add: 1, same: 0, over: 0 }, visited: { add: 2 }, home: { take: true, differs: false }, dests: { fav: 0, mute: 0, over: 0 }, pretrip: 1, refs: 0 });
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
  assert.equal(inc.trips[0].name, '<img src=x onerror=alert(1)>Lisabon', 'vlastní text beze změn – plánovač ho vypisuje přes esc()');
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
  assert.deepEqual(plain(empty), { at: null, trips: [], watch: [], home: null, visited: [], fav: [], mute: [], pretrip: {} });
});

test('formulář hlídání: neznámé klíče jen jako jednoduché hodnoty, lety přes víc měst ověřené', () => {
  const f = B.cleanForm({ from: [BRQ], to: [{ id: 'cc:PT', label: 'Portugalsko', flag: '🇵🇹', type: 'country' }], weird: { a: 1 }, list: [1], constructor: 'x', trip: 'multi', legs: [{ from: [BRQ], to: [{ id: 'ap:LIS', label: 'Lisabon' }], date: '2026-11-12', flex: 9 }, { date: 'zítra' }], depAfter: { date: '2026-11-12', time: '25:00' }, dateMode: 'flex<script>' }, ctx.PlanShare.txt);
  assert.equal(f.weird, undefined);
  assert.equal(f.list, undefined);
  assert.equal(Object.hasOwn(f, 'constructor'), false);
  assert.equal(f.legs.length, 1);
  assert.equal(f.legs[0].flex, 3);
  assert.equal(f.depAfter, null);
  assert.equal(f.dateMode, undefined, 'neznámá volba → výchozí formuláře');
  assert.equal(B.cleanForm({ from: [] }, ctx.PlanShare.txt), null, 'bez odletu nic hlídat nejde');
});

test('cesta bez tripId: pid ze zálohy – upravená na druhém zařízení je „změněná“, ne nová kopie', () => {
  const A = state({ trips: [plan('Porto', '2026-12-05')] });
  assert.equal(B.ensurePids(A.trips, 1e12), 1);
  const pid = A.trips[0].pid;
  assert.match(pid, /^[a-z0-9]{6,24}$/);
  assert.equal(B.ensurePids(A.trips), 0, 'pid se nemění');
  // B: obnova ze zálohy A, pak úprava poznámek a programu
  const onB = B.merge(state(), B.parse(B.pack(A), deps), { deps });
  assert.equal(onB.trips[0].pid, pid);
  onB.trips[0] = { ...onB.trips[0], notes: 'hotel u řeky', days: { '2026-12-05': ['Alfama', 'Tram 28'] } };
  const back = B.parse(B.pack(onB), deps);
  assert.deepEqual(plain(B.diff(A, back, { deps }).trips), { add: 0, same: 0, changed: 1 });
  assert.equal(B.merge(A, back, { deps }).trips.length, 1);
  const over = B.merge(A, back, { overwrite: true, deps });
  assert.equal(over.trips.length, 1);
  assert.equal(over.trips[0].notes, 'hotel u řeky');
  assert.equal(over.trips[0].pid, pid);
  // první přenos: stejný plán v zařízení bez pid se pozná podle obsahu a pid převezme
  const legacy = state({ trips: [plan('Porto', '2026-12-05')] });
  const first = B.merge(legacy, B.parse(B.pack(A), deps), { deps });
  assert.equal(first.trips.length, 1);
  assert.equal(first.trips[0].pid, pid);
  assert.equal(legacy.trips[0].pid, undefined, 'vstup se nemění');
});

test('„Sbaleno“: odškrtnutí jinde = změněná cesta; přepsání odškrtnutí ani vlastní položky nezahodí', () => {
  const mine = state({ trips: [plan('Lisabon', '2026-11-12', { tripId: 7, checklist: [{ t: 'Pas / OP', done: true }, { t: 'Nabíječka', done: false }, { t: 'Deštník', done: true }] })] });
  const other = B.parse(B.pack(state({ trips: [plan('Lisabon', '2026-11-12', { tripId: 7, checklist: [{ t: 'Pas / OP', done: false }, { t: 'Nabíječka', done: true }] })] })), deps);
  assert.deepEqual(plain(B.diff(mine, other, { deps }).trips), { add: 0, same: 0, changed: 1 });
  const m = B.merge(mine, other, { overwrite: true, deps });
  assert.deepEqual(plain(m.trips[0].checklist), [{ t: 'Pas / OP', done: true }, { t: 'Nabíječka', done: true }, { t: 'Deštník', done: true }]);
});

test('stejná cesta v záloze dvakrát: náhled i sloučení se shodnou (žádné „+2“, když přibude jedna)', () => {
  const inc = B.parse(B.pack(state({ trips: [plan('Řím', '2026-12-01'), plan('Řím', '2026-12-01')] })), deps);
  const df = B.diff(state(), inc, { deps });
  assert.deepEqual(plain(df.trips), { add: 1, same: 1, changed: 0 });
  assert.equal(B.merge(state(), inc, { deps }).trips.length, 1);
  // dvě cesty se stejným plánem v zařízení i v záloze: každá se spáruje jen jednou
  const two = state({ trips: [plan('Víkend', '2026-11-14', { checklist: [{ t: 'Pas', done: true }] }), plan('Víkend', '2026-11-14', { checklist: [{ t: 'Pas', done: false }, { t: 'Deštník', done: false }] })] });
  const d2 = B.diff(two, B.parse(B.pack(two), deps), { deps });
  assert.deepEqual(plain(d2.trips), { add: 0, same: 2, changed: 0 });
});

test('hlídání autem: vlastní spotřeba a cena paliva projdou, neznámé volby formuláře ne', () => {
  const w = watch('car', '2026-11-01', {});
  w.form = { ...w.form, groundMode: 'car', carFuel: 'petrol', carCons: { diesel: 5.5, petrol: 8.5, ev: 18 }, carPrice: { diesel: null, petrol: 38.9, ev: null }, trip: 'return', dateMode: 'flex', len: 'custom', bags: 'cabin', xFlex: 2, radius: 150 };
  const f = B.parse(B.pack(state({ watch: [w] })), deps).watch[0].form;
  assert.deepEqual(plain(f.carCons), { diesel: 5.5, petrol: 8.5, ev: 18 });
  assert.deepEqual(plain(f.carPrice), { diesel: null, petrol: 38.9, ev: null });
  for (const k of ['groundMode', 'carFuel', 'trip', 'dateMode', 'len', 'bags', 'xFlex', 'radius']) assert.equal(f[k], w.form[k], k);
  const bad = B.cleanForm({ from: [BRQ], trip: 'bogus', dateMode: 'x', len: 'nekonečno', groundMode: 'raketa', carFuel: 'uhlí', bags: 'tři', radius: 99999, adults: 0, nMax: 'deset', dFrom: '2026-13-40', xOut: '2026-11-12', carCons: { petrol: -1, diesel: 'x', ev: 18, uhlí: 9 }, carPrice: 'levně' }, ctx.PlanShare.txt);
  assert.deepEqual(Object.keys(bad).sort(), ['adults', 'carCons', 'from', 'radius', 'xOut']);
  assert.equal(bad.radius, 500);
  assert.equal(bad.adults, 1);
  assert.deepEqual(plain(bad.carCons), { diesel: null, petrol: null, ev: 18 });
});

test('vlastní záloha nese plán celý – delší poznámky, aktivity a „Sbaleno“ než sdílený odkaz', () => {
  const long = plan('Dlouhá', '2026-11-12', { notes: 'x'.repeat(3200) + '\nKONEC', days: { '2026-11-12': ['a'.repeat(400)] }, checklist: Array.from({ length: 90 }, (_, i) => ({ t: `věc ${i}`, done: false })) });
  const t = B.parse(B.pack(state({ trips: [long] })), deps).trips[0];
  assert.ok(t.notes.endsWith('KONEC'));
  assert.equal(t.days['2026-11-12'][0].length, 400);
  assert.equal(t.checklist.length, 90);
  assert.equal(ctx.PlanShare.sanitize(long).notes.length, 3000, 'sdílený odkaz má limity dál');
});

test('vlastní záloha nemění texty plánu: uvozovky, < >, apostrofy zůstanou, řídicí a obracecí znaky ne', () => {
  const p = plan('Test „uvozovky“ a <b>tag</b>', '2026-11-12', { notes: 'Hotel "Roma" <i>\u202eobráceně', days: { '2026-11-12': ["Fontána di Trevi – hoď minci 'pro štěstí'"] }, genName: 'Řím "A"' });
  const t = B.parse(B.pack(state({ trips: [p] })), deps).trips[0];
  assert.equal(t.name, 'Test „uvozovky“ a <b>tag</b>');
  assert.equal(t.notes, 'Hotel "Roma" <i>obráceně');
  assert.deepEqual(plain(t.days['2026-11-12']), ["Fontána di Trevi – hoď minci 'pro štěstí'"]);
  assert.equal(t.genName, 'Řím "A"');
  assert.deepEqual(plain(B.diff(state({ trips: [p] }), B.parse(B.pack(state({ trips: [p] })), deps), { deps }).trips), { add: 0, same: 1, changed: 0 });
  // sdílený odkaz čistí dál
  assert.equal(ctx.PlanShare.sanitize(p).name, 'Test „uvozovky“ a btag/b');
});

test('📅 klouzavé hlídání: roll projde zálohou beze změny, neplatný se zahodí (pevný termín), sloučení podle klíče bez dat', () => {
  const rolled = (id, dFrom, dTo, roll, extra = {}) => { const w = watch(id, dFrom); return { ...w, form: { ...w.form, dTo, roll, ...extra } }; };
  const S = state({ watch: [rolled('r1', '2026-10-14', '2026-12-09', { off: 3, span: 56 }), rolled('r2', '2026-11-13', '2026-11-14', { lw: 'next' }, { len: 'holiday' }), rolled('r3', '2026-11-13', '2026-11-14', { lw: 'next', eve: false }, { len: 'holiday', adults: 1 })] });
  const inc = B.parse(B.pack(S), deps);
  assert.deepEqual(plain(inc.watch.map((w) => w.form.roll)), [{ off: 3, span: 56 }, { lw: 'next' }, { lw: 'next', eve: false }]);
  assert.deepEqual(plain(B.parse(B.pack(state({ watch: inc.watch })), deps).watch), plain(inc.watch), 'druhé kolo zálohy nic nemění');
  // stará záloha a hlídání bez roll: formulář beze změny
  assert.equal(Object.hasOwn(B.parse(B.pack(state({ watch: [watch('o', '2026-11-01')] })), deps).watch[0].form, 'roll'), false);
  // přísná pravidla: celá čísla off 0–60, span 7–180 (aspoň týden), lw jen 'next' s eve nanejvýš false
  const clean = (roll) => B.cleanForm({ from: [BRQ], dFrom: '2026-10-14', roll }, ctx.PlanShare.txt).roll;
  for (const bad of [{ off: 61, span: 7 }, { off: -1, span: 7 }, { off: 1.5, span: 7 }, { off: 3, span: 0 }, { off: 5, span: 1 }, { off: 3, span: 6 }, { off: 3, span: 181 }, { off: '3', span: '56' }, { off: 3 }, { lw: 'prev' }, { lw: 'prev', off: 3, span: 7 }, 'next', [3, 56], null, 7]) {
    assert.equal(clean(bad), undefined, JSON.stringify(bad));
  }
  assert.deepEqual(plain(clean({ off: 0, span: 7, evil: '<b>' })), { off: 0, span: 7 }, 'jen off a span');
  assert.deepEqual(plain(clean({ off: 60, span: 180 })), { off: 60, span: 180 });
  assert.deepEqual(plain(clean({ lw: 'next', off: 3 })), { lw: 'next' });
  assert.deepEqual(plain(clean({ lw: 'next', eve: false, x: 1 })), { lw: 'next', eve: false });
  for (const eve of [true, 'false', 0, null]) assert.deepEqual(plain(clean({ lw: 'next', eve })), { lw: 'next' }, JSON.stringify(eve));
  // klíč hlídání jako Flights.watchKey: u klouzavého roll místo dat → stejné hlídání uložené jiný den se nezdvojí
  vm.runInContext(read('public/js/alerts.js'), ctx, { filename: 'alerts.js' });
  const rk = (w) => ctx.Alerts.searchKey({ from: w.form.from.map((p) => p.id), dateFrom: w.form.dFrom, dateTo: w.form.dTo, nightsMin: w.form.nMin, nightsMax: w.form.nMax, roll: w.form.roll });
  const mine = state({ watch: [rolled('m1', '2026-10-21', '2026-12-16', { off: 3, span: 56 })] }); // týž klouzavý termín o týden později
  const df = B.diff(mine, inc, { watchKey: rk, deps });
  assert.deepEqual(plain(df.watch), { add: 2, same: 1, over: 0 }, 'svátek bez „odlet od 16:00“ je jiné hlídání');
  assert.deepEqual(plain(B.merge(mine, inc, { watchKey: rk, deps }).watch.map((w) => w.id)), ['m1', 'r2', 'r3']);
});

test('⭐ Moje cíle a 🙈 Nezajímá mě: záloha → obnova, pročištění jako místa, sloučení bez přepsání volby zařízení, nejvýš 30', () => {
  const OPO = { id: 'ap:OPO', key: 'OPO', label: 'Porto', cc: 'PT' }, TBS = { id: 'ap:TBS', key: 'TBS', label: 'Tbilisi', cc: 'GE' };
  const EIN = { id: 'ap:EIN', key: 'EIN', label: 'Eindhoven', cc: 'NL' }, LON = { id: 'metro:LON', key: 'LON', label: 'Londýn', cc: 'GB' };
  const A = state({ fav: [OPO, TBS], mute: [EIN, LON] });
  const j = JSON.parse(B.pack(A));
  assert.deepEqual(j.data.fav, [OPO, TBS]);
  const inc = B.parse(B.pack(A), deps);
  assert.deepEqual(plain(inc.fav), [OPO, TBS]);
  assert.deepEqual(plain(inc.mute), [EIN, LON]);
  // do prázdného zařízení
  const df = B.diff(state(), inc, { deps });
  assert.deepEqual(plain(df.dests), { fav: 2, mute: 2, over: 0 });
  const m = B.merge(state(), inc, { deps });
  assert.deepEqual(plain([m.fav, m.mute]), [[OPO, TBS], [EIN, LON]]);
  // podruhé nic nového; zařízení, kde je Porto 🙈, ho tak nechá (volba zařízení má přednost)
  assert.deepEqual(plain(B.diff(A, inc, { deps }).dests), { fav: 0, mute: 0, over: 0 });
  const mine = state({ fav: [], mute: [OPO] });
  const m2 = B.merge(mine, inc, { deps });
  assert.deepEqual(plain(m2.fav.map((x) => x.key)), ['TBS']);
  assert.deepEqual(plain(m2.mute.map((x) => x.key)), ['OPO', 'EIN', 'LON']);
  assert.deepEqual(plain(mine.mute), [OPO], 'vstup se nemění');
  // stará záloha bez seznamů
  const old = B.parse(JSON.stringify({ app: 'atlas', v: 1, data: { trips: [] } }), deps);
  assert.deepEqual(plain([old.fav, old.mute]), [[], []]);
  assert.deepEqual(plain(B.merge(A, old, { deps }).fav), [OPO, TBS]);
  // podvržené položky: jen metro:/ap: s kódem, klíč z id (ne z pole key), text bez HTML, bez duplicit, město v obou → ⭐
  const evil = B.parse(JSON.stringify({ app: 'atlas', v: 1, data: {
    fav: [{ id: 'ap:OPO', key: 'XXX', label: '<img src=x onerror=alert(1)>Porto', cc: 'pt', evil: 1 }, { id: 'ap:OPO', label: 'znovu' }, { id: 'cc:PT', label: 'Portugalsko' }, { id: 'geo:1,2|X', label: 'X' }, { id: 'ap:opo' }, { id: 'metro:LON"><b>' }, 'ap:BCN', null, { id: 'metro:ROM', label: 42, cc: 'IT' }],
    mute: [{ id: 'ap:OPO', label: 'Porto' }, { id: 'ap:EIN' }, { id: 'ap:EIN', label: 'Eindhoven' }, { __proto__: { id: 'ap:CRL' } }],
  } }), deps);
  assert.deepEqual(plain(evil.fav), [{ id: 'ap:OPO', key: 'OPO', label: 'img src=x onerror=alert(1)Porto', cc: '' }, { id: 'metro:ROM', key: 'ROM', label: '42', cc: 'IT' }]);
  assert.deepEqual(plain(evil.mute), [{ id: 'ap:EIN', key: 'EIN', label: 'EIN', cc: '' }]);
  // nejvýš 30 v každém seznamu (v souboru i po sloučení)
  const many = (n, p) => Array.from({ length: n }, (_, i) => ({ id: `ap:${p}${String(i).padStart(2, '0')}`, label: `${p}${i}` }));
  const big = B.parse(JSON.stringify({ app: 'atlas', v: 1, data: { fav: many(40, 'F'), mute: many(5, 'M') } }), deps);
  assert.equal(big.fav.length, 30);
  const near = state({ fav: many(28, 'G').map((x) => ({ ...x, key: x.id.slice(3) })), mute: [] });
  const d3 = B.diff(near, big, { deps });
  assert.deepEqual(plain(d3.dests), { fav: 2, mute: 5, over: 28 });
  const m3 = B.merge(near, big, { deps });
  assert.equal(m3.fav.length, 30);
  assert.equal(m3.mute.length, 5);
});
