// 📝 Rozepsané hledání: koncept formuláře Letů, který se ještě nehledal, přežije obnovení stránky a zavření aplikace
// Androidem (čistá logika SearchHelp.formSig / formKey / draftPack / draftLoad z public/js/searchhelp.js přes node:vm)
// a jeho napojení ve flights.js (start, hledání, ↺ Začít znovu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(read('searchhelp.js'), ctx);
const H = ctx.window.SearchHelp;
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu

const TODAY = '2026-10-22';
const NOW = Date.parse('2026-10-22T10:00:00Z');
const DAY = 864e5;
const LAST = { from: [{ id: 'geo:49.1952,16.6080|Brno', label: 'Brno' }], to: [], trip: 'return', dFrom: '2026-10-29', dTo: '2026-12-21', adults: 2, exclude: ['BRQ', 'VIE'] };
const EDIT = { ...LAST, to: [{ id: 'cc:IT', label: 'Itálie' }], adults: 3, bags: 'cabin', dFrom: '2026-11-05', dTo: '2026-11-30', nMin: 3, nMax: 4 };
const load = (s, o = {}) => plain(H.draftLoad(s, { base: H.formSig(LAST), now: NOW, today: TODAY, ...o }));

test('draftLoad: koncept nad posledním hledáním se vrátí celý (Kam, cestující, zavazadla, termín, noci)', () => {
  const s = H.draftPack(EDIT, H.formSig(LAST), NOW - 2 * 3600e3);
  assert.deepEqual(load(s), plain(EDIT));
  // nový uživatel bez hledání (S.form null): otisk null platí stejně
  assert.deepEqual(load(H.draftPack(EDIT, H.formSig(null), NOW - 60e3), { base: H.formSig(undefined) }), plain(EDIT));
});

test('draftLoad: pozdější hledání, starý nebo poškozený koncept → null (platí uložené hledání)', () => {
  const base = H.formSig(LAST);
  // mezitím se hledalo (i v jiném okně) nebo ↺ Začít znovu / obnova zálohy změnily S.form
  assert.equal(H.draftLoad(H.draftPack(EDIT, H.formSig({ ...LAST, adults: 1 }), NOW - 60e3), { base, now: NOW, today: TODAY }), null);
  // nejvýš 3 dny od poslední úpravy
  assert.equal(H.DRAFT_MAX_AGE, 3 * DAY);
  assert.ok(H.draftLoad(H.draftPack(EDIT, base, NOW - 3 * DAY + 60e3), { base, now: NOW, today: TODAY }));
  assert.equal(H.draftLoad(H.draftPack(EDIT, base, NOW - 3 * DAY - 1), { base, now: NOW, today: TODAY }), null);
  // čas z budoucnosti (posunuté hodiny), poškozený text, jiná verze, formulář jako pole
  assert.equal(H.draftLoad(H.draftPack(EDIT, base, NOW + 3600e3), { base, now: NOW, today: TODAY }), null);
  for (const s of ['', '{', 'null', '[]', JSON.stringify({ v: 2, at: NOW, base, form: EDIT }), JSON.stringify({ v: 1, at: NOW, base, form: [1] }), JSON.stringify({ v: 1, at: NOW, base })]) {
    assert.equal(H.draftLoad(s, { base, now: NOW, today: TODAY }), null, s);
  }
});

test('draftLoad: minulé termíny pryč – formulář doplní výchozí; rozsah, který už začal, od dneška', () => {
  const base = H.formSig(LAST), pack = (f) => H.draftPack({ ...EDIT, ...f }, base, NOW - DAY);
  // rozsah celý v minulosti → bez dFrom/dTo (setForm vezme výchozí 7–60 dní dopředu)
  const gone = load(pack({ dFrom: '2026-10-19', dTo: '2026-10-21' }));
  assert.ok(!('dFrom' in gone) && !('dTo' in gone));
  // začatý rozsah: odlet od dneška, konec zůstane
  assert.deepEqual([load(pack({ dFrom: '2026-10-20', dTo: '2026-11-02' })).dFrom, load(pack({ dFrom: '2026-10-20', dTo: '2026-11-02' })).dTo], [TODAY, '2026-11-02']);
  // přesná data: odlet v minulosti → bez odletu i návratu; dnešní odlet platí
  const ex = load(pack({ dateMode: 'exact', xOut: '2026-10-21', xBack: '2026-10-28' }));
  assert.ok(!('xOut' in ex) && !('xBack' in ex));
  assert.deepEqual([load(pack({ dateMode: 'exact', xOut: TODAY, xBack: '2026-10-25' })).xOut, load(pack({ dateMode: 'exact', xOut: TODAY, xBack: '2026-10-25' })).xBack], [TODAY, '2026-10-25']);
  // cesta přes víc měst: minulé datum letu prázdné (vybere se znovu), budoucí zůstanou
  const legs = load(pack({ trip: 'multi', legs: [{ to: [], date: '2026-10-21', flex: 0 }, { to: [], date: '2026-10-30', flex: 1 }] })).legs;
  assert.deepEqual(legs.map((l) => l.date), ['', '2026-10-30']);
  // odlet v předvečer volna z minulého svátku vypnutý, z budoucího zůstane
  assert.equal(load(pack({ depAfter: { date: '2026-10-21', time: '16:00' } })).depAfter, null);
  assert.deepEqual(load(pack({ depAfter: { date: '2026-10-27', time: '16:00' } })).depAfter, { date: '2026-10-27', time: '16:00' });
});

test('formSig: stejné hledání = stejný otisk i po uložení a načtení (JSON), jiné hledání jiný; formKey bez pořadí vyřazených letišť', () => {
  assert.equal(H.formSig(LAST), H.formSig(JSON.parse(JSON.stringify(LAST))));
  assert.notEqual(H.formSig(LAST), H.formSig({ ...LAST, adults: 3 }));
  assert.equal(H.formSig(null), H.formSig(undefined));
  assert.match(H.formSig(LAST), /^[0-9a-z]+\.[0-9a-z]+$/);
  // náhled letišť je po startu načte v jiném pořadí – úprava to není
  assert.equal(H.formKey({ ...LAST, exclude: ['VIE', 'BRQ'] }), H.formKey(LAST));
  assert.notEqual(H.formKey({ ...LAST, exclude: ['VIE'] }), H.formKey(LAST));
  assert.equal(H.formKey(null), 'null');
});

test('flights.js: koncept se vrací při startu hned po posledním hledání (před obnovou výsledků a odkazy), hledání a ↺ Začít znovu ho mažou', () => {
  const F = read('flights.js');
  // otisk S.form před setForm (posun minulých letů cesty přes víc měst mění i S.form), koncept před restoreLast
  assert.match(F, /const base = SearchHelp\.formSig\(S\.form\);\s*setForm\(S\.form \|\| defaultForm\(\)\);\s*draftStart\(base\);[^\n]*\n\s*updateHomeChip\(\);\s*restoreLast\(\);/);
  // odkazy (#offer=, #trip=, #jed=, #watch=) zpracuje app.js až po Flights.init – co nastaví, platí
  assert.match(read('app.js'), /if \(window\.Flights\) await Flights\.init\(\);[\s\S]*?Trip\.importFromHash\(\)[\s\S]*?openOfferFromHash\(\) \|\| await openJedFromHash\(\) \|\| openWatchFromHash\(\)/);
  // hledání: hned po uložení S.form; ↺ Začít znovu: po uložení prázdného formuláře
  assert.match(F, /S\.form = f; if \(!S\.home[^\n]*save\(\); updateHomeChip\(\);\s*draftClear\(\);/);
  assert.match(F, /function resetSearch\(\) \{[\s\S]*?S\.form = getForm\(\); save\(\); draftClear\(\);/);
  // úložiště jen v try/catch, úpravy se ukládají s odstupem a hned při schování aplikace
  const block = F.match(/const DRAFT_LS = 'atlas_draft';[\s\S]*?\n {2}function renderRestored/)[0];
  for (const m of block.matchAll(/localStorage\.\w+\([^)]*\)/g)) {
    const before = block.slice(0, m.index);
    assert.ok(before.lastIndexOf('try {') > before.lastIndexOf('} catch'), `bez try: ${m[0]}`);
  }
  assert.match(block, /draftT = setTimeout\(draftSave, \d+\)/);
  assert.match(block, /visibilitychange[^\n]*document\.hidden\) draftFlush\(\)/);
  assert.match(block, /'pagehide', draftFlush/);
  // změna míst z našeptávače (mimo <form>) koncept také uloží
  assert.match(F, /function formEdited\(\) \{[\s\S]*?draftSoon\(\);[^\n]*\n {2}\}/);
});
