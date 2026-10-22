// Hlídané ceny: čistá logika z public/js/alerts.js (klasický skript pro prohlížeč, načtený přes node:vm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/alerts.js', import.meta.url), 'utf8'), ctx);
const A = ctx.window.Alerts;
// hlídání v testech je v aktuální verzi ceny (pv) – starší verzi (bez pv) hlídá vlastní test níž
const applyCheckRaw = A.applyCheck;
A.applyCheck = (w, ...rest) => applyCheckRaw(w && !('pv' in w) ? { ...w, pv: A.PV } : w, ...rest);
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

test('isPast: cesta přes víc měst podle 1. letu (i když jsou ve formuláři zbytky flexibilního termínu)', () => {
  const multi = (...dates) => ({ trip: 'multi', dateMode: 'flex', dFrom: '2026-12-01', dTo: '2026-12-31', legs: dates.map((date) => ({ from: [], to: [], date })) });
  assert.equal(A.isPast(multi('2026-10-04', '2026-10-09'), TODAY), true);
  assert.equal(A.isPast(multi('2026-10-05', '2026-10-09'), TODAY), false, 'první let dnes ještě jde');
  assert.equal(A.isPast({ trip: 'multi', legs: [] }, TODAY), false);
  const list = [{ id: 'm', form: multi('2026-10-04', '2026-10-09') }, { id: 'n', form: multi('2026-10-20', '2026-10-25') }];
  assert.deepEqual(plain(A.dueWatches(list, { now: NOW, today: TODAY }).map((w) => w.id)), ['n']);
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
  // první cena pod cílem se hlásí, i když je blízko minule hlášeného poklesu nad cílem
  assert.equal(A.shouldNotify({ prev: 2000, cur: 1985, target: 1990, notified: 2000 }), 'target');
  assert.equal(A.shouldNotify({ prev: 1985, cur: 1980, target: 1990, notified: 1985 }), null, 'pak už ne');
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

test('applyCheck při výpadku zdroje: dražší ani žádná cena se nezapíše (žádné falešné „zlevnilo“), levnější ano', () => {
  assert.equal(A.incomplete([{ id: 'ryanair', outage: null }, { id: 'kiwi', outage: 'partial' }]), true);
  assert.equal(A.incomplete([{ id: 'ryanair', outage: null }, { id: 'wizzair' }]), false);
  assert.equal(A.incomplete(undefined), false);
  const w0 = { id: 'w', best: { czk: 2000 }, history: [{ at: NOW - 7 * H, czk: 2000 }], checked: NOW - 7 * H };
  // Ryanair neodpověděl → jen dražší Wizz: nezapsat, hledání zůstane k nové kontrole
  const p1 = A.applyCheck(w0, { czk: 3500 }, NOW, undefined, { partial: true });
  assert.equal(p1.skipped, true);
  assert.equal(p1.why, null);
  assert.equal(p1.w.best.czk, 2000);
  assert.equal(p1.w.history.length, 1);
  assert.equal(p1.w.checked, NOW - 7 * H, 'kontrola se nepočítá – zůstává zastaralé');
  assert.equal(p1.w.tried, NOW);
  assert.equal(A.isStale(p1.w, NOW + H), true);
  // úplná kontrola pak 2000 → žádné falešné „zlevnilo“
  const full = A.applyCheck(p1.w, { czk: 2000 }, NOW + H);
  assert.equal(full.why, null);
  assert.equal(full.w.partials, undefined, 'počítadlo neúplných kontrol se po úplné smaže');
  // nic nenalezeno při výpadku → taky nezapsat
  assert.equal(A.applyCheck(w0, null, NOW, undefined, { partial: true }).skipped, true);
  // levnější cena platí i při výpadku
  const cheap = A.applyCheck(w0, { czk: 1500 }, NOW, undefined, { partial: true });
  assert.equal(cheap.skipped, undefined);
  assert.equal(cheap.why, 'drop');
  // třetí neúplná kontrola po sobě se vezme (dlouhý výpadek nesmí cenu zmrazit)
  let w = w0;
  for (let i = 0; i < 2; i++) w = A.applyCheck(w, { czk: 3500 }, NOW + i * H, undefined, { partial: true }).w;
  assert.equal(w.partials, 2);
  const third = A.applyCheck(w, { czk: 3500 }, NOW + 2 * H, undefined, { partial: true });
  assert.equal(third.skipped, undefined);
  assert.equal(third.w.best.czk, 3500);
  assert.equal(third.w.partials, undefined);
  // první kontrola (bez minulé ceny) se zapíše vždy
  assert.equal(A.applyCheck({ id: 'n' }, { czk: 4000 }, NOW, undefined, { partial: true }).w.best.czk, 4000);
});

test('applyCheck: změna 🏠 vlastní ceny na letiště (otisk own) není „zlevnilo“ – bez upozornění, ceny od nové', () => {
  // uloženo 956 Kč (BRQ odhad), pak BRQ vlastní cena 0 Kč → stejný let za 696 Kč
  const w0 = { id: 'w', best: { czk: 956 }, history: [{ at: NOW - 7 * H, czk: 956 }], checked: NOW - 7 * H, base: 956, low: 956, seen: 956, own: '' };
  const r = A.applyCheck(w0, { czk: 696 }, NOW, undefined, { own: 'BRQ:0' });
  assert.equal(r.why, null, 'žádné 📉');
  assert.equal(r.rebased, 'own');
  assert.equal(r.w.rebAt, NOW);
  assert.deepEqual([r.w.base, r.w.low, r.w.seen, r.w.own, r.w.notified], [696, 696, 696, 'BRQ:0', undefined]);
  assert.equal(A.isDropped(r.w), false, 'žádné „📉 zlevnilo“ na kartě');
  assert.deepEqual(plain(r.w.history.map((x) => [x.czk, x.own || 0])), [[956, 0], [696, 1]]);
  assert.deepEqual(plain(A.epoch(r.w.history)), [{ at: NOW, czk: 696, own: 1 }], 'rozdíl, nejnižší cena a graf od změny');
  // zdražení vlastní ceny taky ne „↑“ a nejnižší cena se nedrží staré (s jinou cestou na letiště)
  const up = A.applyCheck(w0, { czk: 1216 }, NOW, undefined, { own: 'BRQ:130' });
  assert.deepEqual([up.why, up.rebased, up.w.low, up.w.base], [null, 'own', 1216, 1216]);
  // další kontrola se stejným otiskem: skutečné zlevnění se hlásí proti nové ceně, nejnižší cena jen z nové části
  const next = A.applyCheck(r.w, { czk: 500 }, NOW + H, undefined, { own: 'BRQ:0' });
  assert.deepEqual([next.why, next.prev, next.rebased, next.w.low], ['drop', 696, undefined, 500]);
  const flat = A.applyCheck(up.w, { czk: 1300 }, NOW + H, undefined, { own: 'BRQ:130' });
  assert.equal(flat.w.low, 1216, 'starší 956 Kč (jiná cesta na letiště) se do nejnižší nepočítá');
  // stejný otisk = obvyklá kontrola; bez own (starší volání) se otisk nehlídá
  assert.equal(A.applyCheck(w0, { czk: 696 }, NOW, undefined, { own: '' }).why, 'drop');
  assert.equal(A.applyCheck(w0, { czk: 696 }, NOW).why, 'drop');
  // starší hlídání bez otisku = bez vlastních cen
  const { own, ...legacy } = w0;
  assert.equal(A.applyCheck(legacy, { czk: 696 }, NOW, undefined, { own: '' }).why, 'drop');
  assert.equal(A.applyCheck(legacy, { czk: 696 }, NOW, undefined, { own: 'BRQ:0' }).why, null);
  // pod cílovou cenou už teď → tuhle cenu nehlásit ani příště; nad cílem dřív ohlášená cena neplatí
  const tg = A.applyCheck({ ...w0, target: 800, notified: 900 }, { czk: 696 }, NOW, undefined, { own: 'BRQ:0' });
  assert.deepEqual([tg.why, tg.w.notified], [null, 696]);
  assert.equal(A.applyCheck(tg.w, { czk: 696 }, NOW + H, undefined, { own: 'BRQ:0' }).why, null);
  assert.equal(A.applyCheck({ ...w0, target: 500, notified: 900 }, { czk: 696 }, NOW, undefined, { own: 'BRQ:0' }).w.notified, undefined);
  // kontrola bez výsledku otisk nepřepíše – příští cena se pak srovná s novou, ne se starou
  const none = A.applyCheck(w0, null, NOW, undefined, { own: 'BRQ:0' });
  assert.deepEqual([none.rebased, none.w.own], [undefined, '']);
  assert.equal(A.applyCheck(none.w, { czk: 696 }, NOW + H, undefined, { own: 'BRQ:0' }).why, null);
  // výpadek zdroje s novým základem: raději počkat na úplnou kontrolu (nejvýš 2×)
  const part = A.applyCheck(w0, { czk: 696 }, NOW, undefined, { own: 'BRQ:0', partial: true });
  assert.deepEqual([part.skipped, part.w.own, part.w.best.czk], [true, '', 956]);
  // první kontrola (bez minulé ceny) jen uloží otisk
  const first = A.applyCheck({ id: 'n' }, { czk: 900 }, NOW, undefined, { own: 'BRQ:0' });
  assert.deepEqual([first.rebased, first.w.own, first.w.base], [undefined, 'BRQ:0', 900]);
  // ♡ téhož hledání po změně vlastní ceny (upsertWatch) – taky nová výchozí cena
  const keyOf = (w) => w.id.slice(0, 1);
  const ins = A.upsertWatch([w0], { ...w0, id: 'w2', best: { czk: 696 }, own: 'BRQ:0' }, keyOf, { now: NOW });
  assert.deepEqual([ins.dup, ins.w.base, ins.w.low, ins.w.own], [true, 696, 696, 'BRQ:0']);
});

test('applyCheck: 🙈 změnilo nejlevnější město (vrácené z 🙈 / minule nejlevnější teď v 🙈) = nový základ, ne zlevnění ani zdražení', () => {
  const w0 = { id: 'w', own: '', best: { czk: 795, desc: 'Brașov', key: 'BRV', hid: 'OMR,CLJ' }, history: [{ at: NOW - 7 * H, czk: 795 }], base: 795, low: 795, seen: 795 };
  const back = A.applyCheck(w0, { czk: 770, key: 'OMR' }, NOW, undefined, { own: '' });
  assert.deepEqual([back.rebased, back.why, back.w.base, back.w.history.length], ['unmute', null, 770, 2]);
  assert.deepEqual(plain(A.epoch(back.w.history)), [{ at: NOW, czk: 770, own: 1 }], 'rozdíl, nejnižší cena a graf od nového základu');
  // jiné, opravdu zlevněné město = zlevnění
  assert.deepEqual([A.applyCheck(w0, { czk: 700, key: 'BRV' }, NOW, undefined, { own: '' }).why, A.rebaseWhy(w0, { czk: 700, key: 'WAW' }, '')], ['drop', null]);
  assert.equal(A.rebaseWhy({ best: { czk: 1 } }, { czk: 1, key: 'OMR' }), null, 'bez seznamu skrytých nic');
  // Oradea (770) → 🙈: nejlevnější Brașov 795 a Oradea mezi vynechanými levnějšími – žádné „↑ 25 Kč“ v historii
  const ora = { id: 'w', own: '', best: { czk: 770, key: 'OMR' }, history: [{ at: NOW - 7 * H, czk: 770 }], base: 770, low: 770, seen: 770 };
  const muted = A.applyCheck(ora, { czk: 795, key: 'BRV', hid: 'OMR' }, NOW, undefined, { own: '' });
  assert.deepEqual([muted.rebased, muted.why, muted.w.base, plain(A.epoch(muted.w.history))], ['mute', null, 795, [{ at: NOW, czk: 795, own: 1 }]]);
  // Oradea zdražila nad Brașov (ve vynechaných není) = opravdové zdražení, historie pokračuje
  assert.equal(A.rebaseWhy(ora, { czk: 795, key: 'BRV' }, ''), null);
  assert.equal(A.rebaseWhy(ora, { czk: 700, key: 'OMR', hid: 'XXX' }, ''), null, 'stejné město');
  // upsertWatch (♡ znovu): podpis z nového uložení
  const keyOf = () => 'k';
  const r = A.upsertWatch([{ ...w0, own: '' }], { id: 'x', best: { czk: 600, key: 'BRV' }, own: 'BRQ:0', history: [] }, keyOf, { now: NOW });
  assert.deepEqual([r.dup, r.w.own, r.w.base, r.w.history.length, r.w.id], [true, 'BRQ:0', 600, 2, 'w']);
});

// Dotaz na server tak, jak ho ze formuláře skládá flights.js (payloadOf) – zkrácený tvar pro testy klíče.
const payload = (f) => ({
  from: f.from, to: f.to, radiusKm: f.radius ?? 200, dateFrom: f.dFrom, dateTo: f.dTo, trip: f.trip, nightsMin: f.nMin, nightsMax: f.nMax,
  outDays: f.exact ? [] : f.outDays || [], backDays: f.exact ? [] : f.backDays || [], adults: f.adults ?? 2, maxPrice: f.maxPrice ? +f.maxPrice : null,
  directOnly: Boolean(f.directOnly), kmRate: 1, groundMode: f.groundMode || 'transit', openJaw: true, exclude: f.exclude || [],
  ...(f.exact ? { exactOut: f.exact[0], exactBack: f.trip === 'return' ? f.exact[1] : null, flexDays: 0 } : {}),
});
const FORM = { from: ['geo:50.08,14.43|Praha'], to: ['city:LOS'], dFrom: '2026-10-12', dTo: '2026-11-30', trip: 'return', nMin: 5, nMax: 9, exact: ['2026-10-28', '2026-11-11'] };

test('searchKey: stejné hledání = stejný klíč (pořadí míst a klíčů, prázdné hodnoty, pole mimo hledání nevadí)', () => {
  const k = A.searchKey(payload(FORM));
  assert.equal(A.searchKey(payload({ ...FORM })), k);
  const shuffled = Object.fromEntries(Object.entries(payload(FORM)).reverse());
  assert.equal(A.searchKey(shuffled), k, 'pořadí klíčů');
  assert.equal(A.searchKey({ ...payload(FORM), maxPrice: undefined, exclude: [] }), k, 'prázdné hodnoty');
  assert.equal(A.searchKey(payload({ ...FORM, dFrom: '2026-10-20', nMin: 2 })), k, 'u přesných dat rozsah a noci flexibilního termínu hledání nemění');
  const two = (from) => A.searchKey(payload({ ...FORM, from }));
  assert.equal(two(['ap:PRG', 'ap:BRQ']), two(['ap:BRQ', 'ap:PRG']), 'Praha + Brno = Brno + Praha');
  // jiné hledání = jiný klíč
  for (const f of [{ exact: ['2026-10-29', '2026-11-11'] }, { to: ['city:ACC'] }, { adults: 3 }, { groundMode: 'car' }, { directOnly: true }, { trip: 'oneway' }]) {
    assert.notEqual(A.searchKey(payload({ ...FORM, ...f })), k, JSON.stringify(f));
  }
  // jen tam: návrat ani noci nerozhodují
  const ow = (x) => A.searchKey(payload({ ...FORM, trip: 'oneway', ...x }));
  assert.equal(ow({ nMin: 1 }), ow({ nMin: 7 }));
  // cesta přes víc měst: lety v pořadí (tam a zpět prohozené je jiná cesta)
  const legs = [{ from: ['ap:PRG'], to: ['ap:FCO'], date: '2026-11-01', flexDays: 0 }, { from: ['ap:NAP'], to: ['ap:PRG'], date: '2026-11-08', flexDays: 0 }];
  assert.notEqual(A.searchKey({ trip: 'multi', legs }), A.searchKey({ trip: 'multi', legs: [...legs].reverse() }));
  assert.equal(A.searchKey({ trip: 'multi', legs }), A.searchKey({ legs: plain(legs), trip: 'multi' }));
});

test('upsertWatch: stejné hledání podruhé (♡ z „Je to dobrá cena?“ a pak pod formulářem) se nepřidá, jen se aktualizuje', () => {
  const keyOf = (w) => A.searchKey(payload(w.form));
  const watch = (id, form, czk, at) => ({ id, label: 'Praha → Lagos', sub: 'tam 28.10. · zpět 11.11.', form, best: { czk }, history: [{ at, czk }], checked: at, base: czk, low: czk, seen: czk, target: null, pv: A.PV });
  const other = watch('o', { ...FORM, to: ['city:ACC'] }, 9000, NOW - 9 * H);
  const r1 = A.upsertWatch([other], watch('a', FORM, 12556, NOW - 2 * H), keyOf, { now: NOW - 2 * H });
  assert.equal(r1.dup, false);
  assert.deepEqual(plain(r1.list.map((w) => w.id)), ['a', 'o']);
  const first = { ...r1.list[0], target: 12000 };
  const r2 = A.upsertWatch([first, other], watch('b', { ...FORM }, 12400, NOW), keyOf, { now: NOW });
  assert.equal(r2.dup, true);
  assert.deepEqual(plain(r2.list.map((w) => w.id)), ['a', 'o'], 'jen jednou, s původním id');
  assert.equal(r2.w, r2.list[0]);
  assert.deepEqual([r2.w.best.czk, r2.w.history.length, r2.w.checked, r2.w.target, r2.w.base], [12400, 2, NOW, 12000, 12556], 'nová cena do historie, cíl a výchozí cena zůstanou');
  assert.equal(first.history.length, 1, 'vstup se nemění');
  // starší položka níž v seznamu se posune nahoru; limit 12 položek platí dál
  const many = Array.from({ length: 12 }, (_, i) => watch(`w${i}`, { ...FORM, adults: i + 1 }, 1000 + i, NOW - H));
  const r3 = A.upsertWatch(many, watch('x', { ...FORM, adults: 5 }, 999, NOW), keyOf, { now: NOW });
  assert.deepEqual([r3.dup, r3.list.length, r3.list[0].id, r3.list.filter((w) => w.id === 'w4').length], [true, 12, 'w4', 1]);
  const r4 = A.upsertWatch(many, watch('y', { ...FORM, adults: 13 }, 999, NOW), keyOf, { now: NOW });
  assert.deepEqual([r4.dup, r4.list.length, r4.list[0].id, r4.list.at(-1).id], [false, 12, 'y', 'w10']);
});

test('upsertWatch: ♡ při výpadku zdroje vyšší cenu do hlídání nezapíše (jako kontrola)', () => {
  const keyOf = (w) => A.searchKey(payload(w.form));
  const w0 = { id: 'a', label: 'x', sub: 'y', form: FORM, best: { czk: 5000 }, history: [{ at: NOW - H, czk: 5000 }], checked: NOW - H, base: 5000, low: 5000, seen: 5000, target: null, pv: A.PV };
  const hi = { ...w0, id: 'b', best: { czk: 8000 }, history: [{ at: NOW, czk: 8000 }] };
  const r = A.upsertWatch([w0], hi, keyOf, { now: NOW, partial: true });
  assert.deepEqual([r.dup, r.w.best.czk, r.w.history.length, r.w.partials], [true, 5000, 1, 1]);
  const lo = A.upsertWatch([w0], { ...hi, best: { czk: 4000 } }, keyOf, { now: NOW, partial: true });
  assert.equal(lo.w.best.czk, 4000, 'nižší cena platí i při výpadku');
  assert.equal(A.upsertWatch([w0], hi, keyOf, { now: NOW }).w.best.czk, 8000);
});

test('isDropped / droppedCount: zlevnění od poslední návštěvy přehledu', () => {
  const list = [{ best: { czk: 1800 }, seen: 2000 }, { best: { czk: 2000 }, seen: 2000 }, { best: { czk: 2200 }, seen: 2000 }, { best: { czk: 900 } }, {}, { best: { czk: 1990 }, seen: 2000 }];
  assert.equal(A.isDropped(list[0]), true);
  assert.equal(A.isDropped(list[5]), false, '−0,5 % je jen výkyv kurzu');
  assert.equal(A.isDropped({ best: { czk: 1980 }, seen: 2000 }), true, '−1 % už ano');
  assert.equal(A.droppedCount(list), 1);
  assert.equal(A.droppedCount(undefined), 0);
  // proběhlý termín se do odznaku nepočítá – stejně jako do „Od minula“ (news)
  const past = { best: { czk: 1800 }, seen: 2000, form: { dateMode: 'flex', dFrom: '2026-08-01', dTo: '2026-09-01' } };
  assert.equal(A.droppedCount([...list, past], '2026-10-10'), 1);
  assert.equal(A.droppedCount([...list, past]), 2, 'bez dneška jako dřív');
});

test('mergeWatches: složení a úpravy z jiného panelu platí, vlastní novější kontrola se neztratí', () => {
  const mine = [{ id: 'a', checked: 10, best: { czk: 900 } }, { id: 'b', checked: 5 }, { id: 'c', checked: 7, target: null }];
  // jiný panel: přidal „n“, smazal „b“, u „c“ nastavil cíl, „a“ má starší kontrolu
  const stored = [{ id: 'n', checked: 1 }, { id: 'a', checked: 8, best: { czk: 1000 } }, { id: 'c', checked: 7, target: 1500 }, null];
  const r = A.mergeWatches(mine, stored);
  assert.deepEqual(plain(r.list.map((w) => w.id)), ['n', 'a', 'c']);
  assert.equal(r.list[1], mine[0], 'novější vlastní výsledek zůstává');
  assert.equal(r.list[2].target, 1500);
  assert.equal(r.changed, true);
  const same = A.mergeWatches(mine, plain(mine));
  assert.equal(same.changed, false);
  assert.ok(same.list.every((w, i) => w === mine[i]), 'beze změny stejné objekty');
  assert.equal(A.mergeWatches(mine, undefined).list, mine, 'nic uloženého → beze změny');
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
function harness(list, { failIds = [], visible = () => true, sync, firstMax = 0, costOf } = {}) {
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
    firstMax,
    ...(costOf ? { costOf } : {}),
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

test('news: řádek „Od minula“ – pod cílovou cenou, zlevněná od posledního pohledu (nejvíc první), změny radaru', () => {
  const w = (id, czk, seen, target = null) => ({ id, label: id, best: { czk }, seen, target });
  const n = A.news([w('a', 900, 1000), w('b', 1500, 2000), w('c', 800, 1000, 850), w('d', 1000, 1000), { id: 'e', best: null }], {
    items: [{ czk: 500, was: { czk: 600 } }, { czk: 700, was: { czk: 650 } }, { czk: 400, newAt: 1 }, null],
  });
  assert.deepEqual(plain(n.hits), [{ id: 'c', label: 'c', czk: 800 }]);
  assert.deepEqual(plain(n.watch.map((x) => [x.id, x.d])), [['b', 500], ['a', 100]], 'c je pod cílem, d beze změny');
  assert.deepEqual([n.down, n.fresh], [1, 1]);
  assert.deepEqual(plain(A.news(null, null)), { hits: [], watch: [], down: 0, fresh: 0 });
  // proběhlý termín se nehlásí
  const past = { ...w('p', 500, 600, 1000), form: { dateMode: 'flex', dFrom: '2026-08-01', dTo: '2026-09-01' } };
  assert.deepEqual(plain(A.news([past], null, '2026-10-10').hits), []);
  assert.equal(A.news([past], null).hits.length, 1, 'bez dneška jako dřív');
});

test('scheduler: první cyklus po otevření zkontroluje všechna zastaralá (firstMax), další zase po 4', async () => {
  const f = flex('2026-10-10', '2026-12-01');
  const list = Array.from({ length: 10 }, (_, i) => ({ id: 'w' + i, form: f, checked: NOW - (20 + i) * H }));
  const h = harness(list, { firstMax: 12 });
  assert.equal(await h.sched.cycle(), 10);
  list.forEach((w) => { w.checked = 0; });
  assert.equal(await h.sched.cycle(), 4, 'další cyklus zase s limitem');
});

test('scheduler: velký cyklus i po dlouhé pauze (aplikace z pozadí); cesta přes víc měst stojí 2 hledání', async () => {
  const f = flex('2026-10-10', '2026-12-01');
  const list = Array.from({ length: 10 }, (_, i) => ({ id: 'w' + i, form: i < 4 ? { ...f, trip: 'multi' } : f, checked: NOW - (20 + i) * H }));
  const h = harness(list, { firstMax: 12, costOf: (w) => (w.form.trip === 'multi' ? 2 : 1) });
  const n1 = await h.sched.cycle();
  assert.ok(n1 < 10 && n1 >= 8, 'rozpočet 12 hledání: ' + n1);
  list.forEach((w) => { w.checked = 0; });
  assert.ok(await h.sched.cycle() <= 4, 'hned další cyklus malý');
  list.forEach((w) => { w.checked = 0; });
  h.advance(7 * H); // aplikace byla v pozadí přes 6 h
  assert.ok(await h.sched.cycle() >= 8, 'po pauze zase velký');
});

test('scheduler: rozpočet se nepřečerpá – cesta přes víc měst, která se nevejde, jde příště jako první', async () => {
  const f = flex('2026-10-10', '2026-12-01');
  // od nejstaršího: s0, s1, s2, m (víc měst), s3, s4
  const ids = ['s0', 's1', 's2', 'm', 's3', 's4'];
  const list = ids.map((id, i) => ({ id, form: id === 'm' ? { ...f, trip: 'multi' } : f, checked: NOW - (40 - i) * H }));
  const cost = (w) => (w.form.trip === 'multi' ? 2 : 1);
  const h = harness(list, { costOf: cost });
  h.log.length = 0;
  await h.sched.cycle(); // první cyklus bez firstMax: limit 4
  assert.deepEqual(h.log, ['s0', 's1', 's2'], '3 + 2 > 4 → víc měst až příště');
  h.log.length = 0;
  await h.sched.cycle();
  assert.deepEqual(h.log, ['m', 's3', 's4'], 'víc měst první: 2 + 1 + 1 = 4');
});

/* ---------- 📅 klouzavé hlídání (form.roll) ---------- */
// Alerts + SearchHelp v jednom kontextu jako v prohlížeči (svátky: SearchHelp.holidayList / holidayDates)
const ctx2 = vm.createContext({ window: {} });
for (const f of ['searchhelp.js', 'alerts.js']) vm.runInContext(readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8'), ctx2);
const R = ctx2.window.Alerts, SH = ctx2.window.SearchHelp;
const plusD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const daysD = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5;
// dotaz jako payloadOf ve flights.js (i pravidlo „odlet od 16:00“) a klíč jako watchKey: klouzavé s roll, pevné s daty
const rp = (f) => ({ ...payload(f), ...(f.depAfter ? { depAfter: f.depAfter } : {}) });
const wkey = (form, today) => { const f = R.rollForm(form, today); return R.searchKey(R.rolls(f) ? { ...rp(f), roll: f.roll } : rp(f)); };
const BASE = { from: ['ap:BRQ'], to: ['city:LON'], trip: 'return', nMin: 1, nMax: 3, outDays: [5, 6], backDays: [0, 1], dateMode: 'flex', dFrom: '2026-10-14', dTo: '2026-12-09' };

test('rollForm: { off, span } se posouvá s dneškem – přes konec měsíce, roku, 29. 2. i změnu času', () => {
  const f = { ...BASE, dFrom: '2026-01-05', dTo: '2026-02-01', depAfter: { date: '2026-01-04', time: '16:00' }, roll: { off: 3, span: 56 } };
  assert.deepEqual(plain(R.rollForm(f, '2026-10-11')), { ...f, dFrom: '2026-10-14', dTo: '2026-12-09', depAfter: null }, 'vždy příštích 8 týdnů, bez „odlet od 16:00“ starého dne');
  assert.equal(f.dFrom, '2026-01-05', 'vstup se nemění');
  for (const [today, dFrom, dTo] of [['2026-12-30', '2027-01-02', '2027-02-27'], ['2028-02-26', '2028-02-29', '2028-04-25'], ['2026-03-28', '2026-03-31', '2026-05-26'], ['2026-10-24', '2026-10-27', '2026-12-22']]) {
    const r = R.rollForm(f, today);
    assert.deepEqual([r.dFrom, r.dTo], [dFrom, dTo], today);
  }
  // den po dni přes tři roky (i v pásmu se změnou času): začátek vždy dnes + off, délka vždy span
  const tz = process.env.TZ;
  process.env.TZ = 'Europe/Prague';
  try {
    for (let d = '2026-01-01'; d <= '2028-12-31'; d = plusD(d, 1)) {
      for (const roll of [{ off: 0, span: 7 }, { off: 7, span: 28 }, { off: 60, span: 180 }]) {
        const r = R.rollForm({ ...f, roll }, d);
        assert.ok(daysD(d, r.dFrom) === roll.off && daysD(r.dFrom, r.dTo) === roll.span, `${d} ${JSON.stringify(roll)} → ${r.dFrom}–${r.dTo}`);
      }
    }
  } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
  // bez roll, s neplatným roll, přesná data a víc měst: formulář beze změny (stejný objekt)
  for (const g of [BASE, { ...BASE, roll: { off: 61, span: 7 } }, { ...BASE, roll: { off: 3, span: 0 } }, { ...BASE, roll: { off: 5, span: 1 } }, { ...BASE, roll: { off: 3, span: 6 } }, { ...BASE, roll: { off: 1.5, span: 7 } }, { ...BASE, roll: { lw: 'prev' } }, { ...BASE, roll: { lw: 'next', eve: true } }, { ...BASE, roll: 'next' }, { ...BASE, dateMode: 'exact', roll: { off: 3, span: 7 } }, { ...BASE, trip: 'multi', roll: { off: 3, span: 7 } }]) {
    assert.equal(R.rollForm(g, '2026-10-11'), g, JSON.stringify(g.roll));
  }
  assert.equal(R.rollForm(undefined, '2026-10-11'), undefined);
});

test('rollForm: { lw: "next" } = nejbližší prodloužený víkend jako 🎉 Svátky, den před jeho začátkem (v den odletu) už další', () => {
  const f = { ...BASE, len: 'holiday', dFrom: '2026-01-01', dTo: '2026-01-02', nMin: 9, nMax: 9, outDays: [1], backDays: [1], roll: { lw: 'next' } };
  const at = (t) => { const r = R.rollForm(f, t); return [r.dFrom, r.dTo, r.nMin, r.nMax, r.outDays, r.backDays, r.depAfter && r.depAfter.date, r.len]; };
  assert.deepEqual(plain(at('2026-11-12')), ['2026-11-13', '2026-11-14', 3, 4, [5, 6], [2], '2026-11-13', 'holiday'], 'Den boje za svobodu: odlet pá od 16:00 nebo so, návrat út');
  assert.deepEqual(plain(at('2026-11-13')), ['2026-12-23', '2026-12-24', 3, 4, [3, 4], [0], '2026-12-23', 'holiday'], 'o den později (pá 13. 11., v den odletu) už Vánoce');
  // eve: false = „v předvečer jen odlety od 16:00“ vypnuté – u každého dalšího víkendu bez něj, jinak stejný termín
  const off = (t) => { const r = R.rollForm({ ...f, roll: { lw: 'next', eve: false } }, t); return [r.dFrom, r.dTo, r.nMin, r.nMax, r.outDays, r.backDays, r.depAfter, r.len]; };
  assert.deepEqual(plain(off('2026-11-12')), ['2026-11-13', '2026-11-14', 3, 4, [5, 6], [2], null, 'holiday']);
  assert.deepEqual(plain(off('2026-12-01')), ['2026-12-23', '2026-12-24', 3, 4, [3, 4], [0], null, 'holiday']);
  assert.deepEqual(plain(at('2026-12-23')).slice(0, 2), ['2026-12-31', '2027-01-01'], 'přes konec roku: Nový rok');
  // každý den rok dopředu stejně jako předvolba 🎉 Svátky (holidayDates nejbližšího víkendu) a nikdy neproběhne
  for (let d = '2026-10-01'; d <= '2027-10-01'; d = plusD(d, 1)) {
    const lw = SH.holidayList(d)[0], h = SH.holidayDates(lw, d), r = R.rollForm(f, d);
    assert.deepEqual(plain([r.dFrom, r.dTo, r.nMin, r.nMax, r.outDays, r.backDays]), plain([h.dFrom, h.dTo, h.nMin, h.nMax, h.outDays, h.backDays]), d);
    assert.ok(r.dFrom > d && SH.holidayOf(r, d).start === lw.start, d);
    assert.equal(R.isPast(f, d), false, d);
  }
  assert.equal(R.rollForm(f, '2026-11-12', null), f, 'bez SearchHelp beze změny');
});

test('isPast: klouzavý termín nikdy neproběhne; přesná data a víc měst zůstanou pevné', () => {
  const old = { dateMode: 'flex', trip: 'return', dFrom: '2026-01-01', dTo: '2026-02-01' };
  assert.equal(R.isPast(old, TODAY), true, 'pevný termín jako dřív');
  assert.equal(R.isPast({ ...old, roll: { off: 3, span: 28 } }, TODAY), false);
  assert.equal(R.isPast({ ...old, roll: { lw: 'next' } }, TODAY), false);
  assert.equal(R.isPast({ ...old, roll: { off: 61, span: 28 } }, TODAY), true, 'neplatný roll = pevný termín');
  assert.equal(R.isPast({ ...exact('2026-10-01', '2026-10-08'), roll: { off: 3, span: 28 } }, TODAY), true, 'přesná data');
  assert.equal(R.isPast({ trip: 'multi', legs: [{ date: '2026-10-01' }], roll: { off: 3, span: 28 } }, TODAY), true, 'víc měst');
  // kontroly i „Od minula“ s ním počítají dál
  const list = [{ id: 'r', form: { ...old, roll: { off: 3, span: 28 } } }, { id: 'p', form: old }];
  assert.deepEqual(plain(R.dueWatches(list, { now: NOW, today: TODAY }).map((w) => w.id)), ['r']);
  assert.equal(R.news([{ id: 'r', label: 'r', best: { czk: 900 }, seen: 900, target: 1000, form: list[0].form }], null, TODAY).hits.length, 1);
});

test('searchKey s roll: klíč klouzavého hlídání se den ode dne nemění, pevná hledání mají klíč jako dřív', () => {
  const weekly = { ...BASE, roll: { off: 3, span: 56 } };
  const k = wkey(weekly, '2026-10-11');
  for (let d = '2026-10-11'; d <= '2028-03-31'; d = plusD(d, 1)) assert.equal(wkey(weekly, d), k, d);
  assert.notEqual(wkey({ ...BASE, roll: { off: 3, span: 28 } }, '2026-10-11'), k, 'jiná délka = jiné hledání');
  assert.notEqual(wkey({ ...weekly, adults: 3 }, '2026-10-11'), k);
  assert.notEqual(wkey(BASE, '2026-10-11'), k, 'pevný termín se stejnými daty je jiné hlídání');
  // svátky: ani noci, dny odletu a „odlet od 16:00“ (u každého víkendu jiné) klíč nemění
  const hol = { ...BASE, len: 'holiday', roll: { lw: 'next' } };
  assert.equal(wkey(hol, '2026-11-12'), wkey(hol, '2026-11-13'));
  assert.equal(wkey(hol, '2026-11-12'), wkey(hol, '2027-05-01'));
  const eve = { ...hol, roll: { lw: 'next', eve: false } };
  assert.equal(wkey(eve, '2026-11-12'), wkey(eve, '2027-05-01'));
  assert.notEqual(wkey(eve, '2026-11-12'), wkey(hol, '2026-11-12'), 'bez „odlet od 16:00“ je jiné hledání');
  // ♡ téhož klouzavého hledání o týden později se nepřidá podruhé (Alerts.upsertWatch)
  const w1 = { id: 'a', label: 'x', sub: 'y', form: weekly, best: { czk: 1500 }, history: [{ at: NOW, czk: 1500 }], checked: NOW, base: 1500, low: 1500, seen: 1500, target: 1200, pv: R.PV };
  const r = R.upsertWatch([w1], { ...w1, id: 'b', form: { ...weekly, dFrom: '2026-10-21', dTo: '2026-12-16' }, best: { czk: 1400 }, target: null }, (w) => wkey(w.form, '2026-10-18'), { now: NOW + 168 * H });
  assert.deepEqual([r.dup, r.list.length, r.w.id, r.w.target, r.w.base, r.w.history.length], [true, 1, 'a', 1200, 1500, 2]);
  // pevné hledání (stará hlídání, Nedávno, záloha): klíč přesně jako před klouzavým hlídáním
  const OLD = '{"adults":2,"backDays":[0,1],"dateFrom":"2026-10-14","dateTo":"2026-12-09","directOnly":false,"from":["ap:BRQ"],"groundMode":"transit","kmRate":1,"nightsMax":3,"nightsMin":1,"openJaw":true,"outDays":[5,6],"radiusKm":200,"to":["city:LON"],"trip":"return"}';
  assert.equal(R.searchKey(rp(BASE)), OLD);
  assert.equal(wkey(BASE, '2026-10-11'), OLD);
  assert.equal(R.searchKey({ ...rp(BASE), depAfter: { date: '2026-10-14', time: '16:00' } }), OLD.replace(',"directOnly"', ',"depAfter":{"date":"2026-10-14","time":"16:00"},"directOnly"'));
  for (const roll of [null, { off: 99, span: 1 }, { lw: 'prev' }, 'next']) assert.equal(R.searchKey({ ...rp(BASE), roll }), OLD, `neplatný roll ${JSON.stringify(roll)} se nepočítá`);
});

test('rollSpec: klouzavý termín z formuláře ♡ i pro uložené hlídání („převést na klouzavé“), meze a svátky', () => {
  const t = '2026-10-11', f = (dFrom, dTo, x = {}) => ({ dateMode: 'flex', trip: 'return', len: 'custom', dFrom, dTo, ...x });
  const spec = (form, opts) => plain(R.rollSpec(form, t, opts));
  assert.deepEqual(spec(f('2026-10-14', '2026-12-09')), { off: 3, span: 56 });
  assert.deepEqual(spec(f('2026-10-11', '2026-10-18')), { off: 0, span: 7 });
  assert.deepEqual(spec(f('2026-12-10', '2027-01-11')), { off: 60, span: 32 });
  // rozsah kratší než týden se neposouvá: pá–so by ve středu hledal po–út (s dny odletu pá a so nic, bez nich všední ceny
  // proti víkendové → falešné „zlevnilo“) – zůstane pevný, přepínač ani „převést na klouzavé“ se neukážou
  for (let n = 0; n <= 10; n++) assert.deepEqual(spec(f('2026-10-14', plusD('2026-10-14', n))), n < 7 ? null : { off: 3, span: n }, `${n} dní`);
  assert.equal(spec(f('2026-10-16', '2026-10-17', { outDays: [5, 6], backDays: [0, 1] })), null, 'nejbližší víkend pá–so');
  assert.equal(spec(f('2026-09-04', '2026-09-05'), { saved: '2026-09-01' }), null, 'proběhlý víkend');
  assert.equal(spec(f('2026-12-11', '2027-01-11')), null, 'začátek za víc než 60 dní');
  assert.equal(spec(f('2026-10-14', '2027-04-13')), null, 'delší než 180 dní');
  assert.equal(spec(f('2026-10-14', '2026-10-14')), null, 'jen jeden den');
  assert.equal(spec(f('2026-10-14', '2026-10-13')), null);
  for (const x of [{ dateMode: 'exact' }, { trip: 'multi' }, { depAfter: { date: '2026-10-16', time: '16:00' } }, { dFrom: 'zítra' }]) assert.equal(spec(f('2026-10-16', '2026-10-17', x)), null, JSON.stringify(x));
  // svátky: nejbližší víkend → { lw: 'next' }, později vybraný víkend zůstane pevný, proběhlý se posune na nejbližší
  const [lw1, lw2] = SH.holidayList(t);
  assert.deepEqual(spec({ ...f(), len: 'holiday', ...SH.holidayDates(lw1, t) }), { lw: 'next' });
  assert.equal(spec({ ...f(), len: 'holiday', ...SH.holidayDates(lw2, t) }), null);
  // vypnuté „v předvečer jen odlety od 16:00“ (Další možnosti) se uloží – kontroly ho pak nevrátí
  assert.deepEqual(spec({ ...f(), len: 'holiday', ...SH.holidayDates(lw1, t), depAfter: null }), { lw: 'next', eve: false });
  assert.deepEqual(spec(f('2026-05-07', '2026-05-08', { len: 'holiday', depAfter: { date: '2026-05-07', time: '16:00' } })), { lw: 'next' });
  assert.deepEqual(spec(f('2026-05-07', '2026-05-08', { len: 'holiday' })), { lw: 'next', eve: false }, 'proběhlý svátek hledaný bez pravidla');
  // rozsah, který už začal nebo proběhl: odstup od dne uložení, meze oříznuté
  assert.deepEqual(spec(f('2026-09-04', '2026-10-30'), { saved: '2026-09-01' }), { off: 3, span: 56 }, 'začal');
  assert.deepEqual(spec(f('2026-06-04', '2026-07-30'), { saved: '2026-06-01' }), { off: 3, span: 56 }, 'proběhl');
  assert.deepEqual(spec(f('2026-06-04', '2026-07-30')), { off: 0, span: 56 }, 'bez dne uložení od začátku');
  assert.deepEqual(spec(f('2026-06-04', '2026-07-30'), { saved: '2026-06-10' }), { off: 0, span: 56 }, 'uloženo až po začátku');
  assert.deepEqual(spec(f('2026-06-04', '2027-07-30'), { saved: '2026-01-01' }), { off: 60, span: 180 });
  assert.equal(spec(f('2026-06-04', '2026-06-04')), null);
  // z budoucího rozsahu dnes stejný termín
  const g = f('2026-10-14', '2026-12-09'), rf = R.rollForm({ ...g, roll: R.rollSpec(g, t) }, t);
  assert.deepEqual([rf.dFrom, rf.dTo], [g.dFrom, g.dTo]);
  // výchozí zapnutí přepínače: začátek nejpozději za CFG.rollNear dní
  assert.equal(R.CFG.rollNear, 7);
});

test('rollTxt: popis klouzavého termínu na kartu', () => {
  const t = '2026-10-11', f = (roll) => ({ ...BASE, roll });
  assert.equal(R.rollTxt(f({ off: 3, span: 56 }), t), 'vždy příštích 8 týdnů (teď 14. 10.–9. 12.)');
  assert.equal(R.rollTxt(f({ off: 3, span: 56 }), t, { now: false }), 'vždy příštích 8 týdnů');
  assert.equal(R.rollTxt(f({ off: 0, span: 14 }), t), 'vždy příští 2 týdny (teď 11. 10.–25. 10.)');
  assert.equal(R.rollTxt(f({ off: 0, span: 7 }), t, { now: false }), 'vždy příštích 7 dní');
  assert.equal(R.rollTxt(f({ off: 1, span: 10 }), t, { now: false }), 'vždy příštích 10 dní');
  assert.equal(R.rollTxt(f({ off: 1, span: 60 }), t, { now: false }), 'vždy příštích 60 dní');
  // „příštích …“ jen se začátkem nejvýš za 3 dny, dál rozsah od dneška (ne „vždy příští týden“, když začíná za 5 dní)
  assert.equal(R.rollTxt(f({ off: 5, span: 7 }), t), 'vždy odlet za 5–12 dní (teď 16. 10.–23. 10.)');
  assert.equal(R.rollTxt(f({ off: 4, span: 56 }), t, { now: false }), 'vždy odlet za 4–60 dní');
  assert.equal(R.rollTxt(f({ off: 5, span: 1 }), t), '', 'kratší než týden = pevný termín');
  assert.equal(R.rollTxt(f({ off: 30, span: 28 }), t), 'vždy odlet za 30–58 dní (teď 10. 11.–8. 12.)');
  assert.equal(R.rollTxt(f({ off: 3, span: 56 }), '2026-12-30'), 'vždy příštích 8 týdnů (teď 2. 1.–27. 2.)');
  assert.equal(R.rollTxt(f({ lw: 'next' }), t), 'vždy nejbližší prodloužený víkend (teď Den boje za svobodu 14.–17. 11.)');
  assert.equal(R.rollTxt(f({ lw: 'next' }), '2026-11-13', { now: false }), 'vždy nejbližší prodloužený víkend');
  assert.equal(R.rollTxt(BASE, t), '', 'pevný termín');
  assert.equal(R.rollTxt({ ...BASE, dateMode: 'exact', roll: { off: 3, span: 7 } }, t), '');
  assert.equal(R.rollTxt(f({ lw: 'next', eve: false }), t), 'vždy nejbližší prodloužený víkend (teď Den boje za svobodu 14.–17. 11.)');
});

test('savedAt: den uložení z id (Date.now().toString(36)), i když historie (jen 60 bodů) začíná později', () => {
  const D = 864e5, id = (ms) => ms.toString(36), hist = (from, n) => Array.from({ length: n }, (_, i) => ({ at: from + i * 6 * H, czk: 1500 }));
  assert.equal(R.savedAt({ id: id(NOW - 63 * D), history: hist(NOW - 20 * D, 60) }, NOW), NOW - 63 * D, 'historie oříznutá');
  assert.equal(R.savedAt({ id: id(NOW - 63 * D), history: [] }, NOW), NOW - 63 * D);
  assert.equal(R.savedAt({ id: 'r1', history: hist(NOW - 5 * D, 3) }, NOW), NOW - 5 * D, 'jiné id (záloha): první bod historie');
  assert.equal(R.savedAt({ id: id(NOW - 2 * D), history: hist(NOW - 5 * D, 3) }, NOW), NOW - 5 * D, 'dřívější z obou');
  assert.equal(R.savedAt({ id: id(NOW + 3 * D), history: hist(NOW - 5 * D, 3) }, NOW), NOW - 5 * D, 'id v budoucnu se nepočítá');
  assert.equal(R.savedAt({ id: id(NOW + H) }, NOW), NOW + H, 'hodiny jiného zařízení o chvíli napřed');
  assert.equal(R.savedAt({ id: id(Date.UTC(2019, 5, 1)) }, NOW), null);
  for (const w of [{}, { id: 'abc' }, { id: 7, history: 'x' }, { history: [{ at: 'x' }] }, null]) assert.equal(R.savedAt(w, NOW), null, JSON.stringify(w));
  // „📅 Převést na klouzavé“ u hlídání uloženého před 63 dny na rozsah za 3–53 dní (po 60 kontrolách): odstup 3 dny, ne 0
  const today = new Date(NOW).toISOString().slice(0, 10), ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const w = { id: id(NOW - 63 * D), form: { dateMode: 'flex', trip: 'return', len: 'custom', dFrom: plusD(today, -60), dTo: plusD(today, -10) }, history: hist(NOW - 20 * D, 60) };
  assert.deepEqual(plain(R.rollSpec(w.form, today, { saved: ymd(R.savedAt(w, NOW)) })), { off: 3, span: 50 });
  assert.deepEqual(plain(R.rollSpec(w.form, today, { saved: ymd(w.history[0].at) })), { off: 0, span: 50 }, 'podle historie by začínal dnes');
});

test('rollSame: hledání z minula (data ze dne hledání) je pořád totéž klouzavé hlídání – ♥ Hlídáš, ♡ ho nezdvojí', () => {
  const roll = { off: 3, span: 56 }, r7 = { off: 7, span: 53 }, saved = '2026-10-11';
  const f = (dFrom, dTo, x = {}) => ({ ...BASE, dFrom, dTo, ...x });
  const same = (r, form, t, s = saved) => R.rollSame(r, form, t, { saved: s });
  // ♡ 11. 10. s rozsahem za 3–59 dní; formulář obnovený o 1–3 dny později má ještě data z 11. 10.: z nich vyjde jiný
  // odstup a s ním jiný klíč – stejné hledání to ale je
  const form = f('2026-10-14', '2026-12-09'), key = wkey({ ...BASE, roll }, saved);
  for (let k = 0; k <= 3; k++) {
    const t = plusD(saved, k), spec = R.rollSpec(form, t);
    assert.deepEqual(plain(spec), { off: 3 - k, span: 56 }, t);
    assert.equal(wkey({ ...form, roll: spec }, t) === key, k === 0, t);
    assert.equal(same(roll, form, t), true, t);
    assert.equal(wkey({ ...form, roll }, t), key, 's termínem hlídání stejný klíč');
  }
  // Nedávno: začátek, který už byl, posunutý na dnešek (SearchHelp.recentForm) – zbytek rozsahu toho dne
  for (const t of ['2026-10-15', '2026-10-30', '2026-12-08']) {
    const nf = SH.recentForm(form, t);
    assert.deepEqual([nf.dFrom, nf.dTo], [t, '2026-12-09']);
    assert.equal(same(roll, nf, t), true, t);
  }
  // „odlet za 7–60 dní“ (výchozí formulář): o 5 dní později z dat vyjde odlet za 2–55 dní; rozsah, který už začal nebo
  // proběhl (setForm ho dá na dnešní rozsah hlídání), i rozsah z kteréhokoli dne od uložení (Otevřít na kartě)
  assert.equal(same(r7, f('2026-10-18', '2026-12-10'), '2026-10-16'), true);
  assert.equal(same(r7, f('2026-10-18', '2026-12-10'), '2026-10-20'), true, 'začal');
  assert.equal(same(r7, f('2026-10-18', '2026-12-10'), '2027-01-05'), true, 'proběhl');
  assert.equal(same(r7, f('2026-10-24', '2026-12-16'), '2026-10-19'), true, 'rozsah ze 17. 10.');
  assert.equal(same(r7, f('2026-10-18', '2026-12-10'), '2026-10-16', null), false, 'bez dne uložení jen dnešní rozsah');
  assert.equal(same(r7, f('2026-10-23', '2026-12-15'), '2026-10-16', null), true, 'dnešní rozsah');
  // „příštích 8 týdnů“ od zítřka nebo od dneška stejné délky: na kartě je nerozlišíš → totéž (i bez dne uložení)
  for (const d of ['2026-10-11', '2026-10-12', '2026-10-13']) assert.equal(same(roll, f(d, plusD(d, 56)), '2026-10-11', null), true, d);
  // jiné hledání: jiná délka, odlet za 5 dní, rozsah z doby před uložením, pozdější rozsah, svátky, „odlet od 16:00“…
  assert.equal(same(roll, f('2026-10-14', '2026-12-02'), saved), false, 'kratší');
  assert.equal(same(roll, f('2026-10-16', '2026-12-11'), saved), false, 'odlet za 5–61 dní');
  assert.equal(same(r7, f('2026-10-12', '2026-12-04'), '2026-10-12'), false, 'rozsah z 5. 10., před uložením');
  assert.equal(same(r7, f('2026-10-26', '2026-12-18'), '2026-10-16'), false, 'rozsah až z 19. 10.');
  assert.equal(same({ lw: 'next' }, form, saved), false);
  for (const x of [{ depAfter: { date: '2026-10-14', time: '16:00' } }, { dateMode: 'exact' }, { trip: 'multi' }, { dFrom: 'zítra' }, { dTo: '2026-10-13' }]) assert.equal(same(roll, { ...form, ...x }, '2026-10-12'), false, JSON.stringify(x));
  for (const r of [{ off: 3, span: 6 }, { off: 61, span: 56 }, null, 'next']) assert.equal(same(r, form, '2026-10-12'), false, JSON.stringify(r));
  assert.equal(same(roll, null, saved), false);
});

test('applyCheck: hlídání ze starší verze (cena i s dopravou na letiště) – nový základ bez „zlevnilo“, pak normálně', () => {
  const old = { id: 'w', history: [{ at: NOW - 7 * H, czk: 3400 }], best: { czk: 3400 }, base: 3400, low: 3400, seen: 3400, checked: NOW - 7 * H };
  const r = applyCheckRaw(old, { czk: 3100 }, NOW);
  assert.deepEqual([r.why, r.rebased, r.w.pv, r.w.base, r.w.low, r.w.seen], [null, 'price', A.PV, 3100, 3100, 3100]);
  const r2 = applyCheckRaw(r.w, { czk: 2900 }, NOW + H);
  assert.deepEqual([r2.why, r2.rebased], ['drop', undefined], 'další kontrola už porovnává ceny letenek');
  assert.equal(r.w.rebWhy, 'price');
  // cílová cena nastavená k ceně i s dopravou: ve stejném poměru (2 100 × 3 100 / 3 400 ≈ 1 915 → 1 910), ne „splněno“
  const t = applyCheckRaw({ ...old, target: 2100, notified: 2000 }, { czk: 3100 }, NOW);
  assert.deepEqual([t.w.target, t.w.notified, t.why], [1910, undefined, null]);
  assert.deepEqual(plain(A.news([t.w]).hits), []);
  // pod přepočteným cílem už teď → tahle cena se nehlásí
  const u = applyCheckRaw({ ...old, target: 3500 }, { czk: 3100 }, NOW);
  assert.deepEqual([u.w.target, u.w.notified], [3190, 3100]);
  // jiný nový základ (vlastní cena na letiště) cíl nemění
  assert.equal(applyCheckRaw({ ...old, pv: A.PV, own: 'VIE:300', target: 2100 }, { czk: 3100 }, NOW, A.CFG, { own: 'VIE:350' }).w.target, 2100);
});
