// 📌 Odložené nabídky (public/js/pins.js): záznam z řádku i z radaru, přepnutí, úklid, pročištění cizího vstupu,
// sloučení, obnova z pozdějšího hledání a text pro sdílení. Klasické skripty prohlížeče přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('public/js/searchhelp.js'), ctx, { filename: 'searchhelp.js' });
vm.runInContext(read('public/js/pins.js'), ctx, { filename: 'pins.js' });
const P = ctx.Pins;
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu

const TODAY = '2026-11-01';
const NOW = new Date(2026, 10, 1, 12, 0).getTime();
const H = 36e5;
const leg = (from, to, date, dep, arr, extra = {}) => ({ provider: 'ryanair', carrier: 'FR', carrierName: 'Ryanair', flightNo: 'FR 1', from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, czk: 900, stops: 0, durationMin: 115, live: true, bookUrl: null, otherDeps: ['12:00'], ...extra });
const OUT = leg('BRQ', 'NAP', '2026-11-13', '06:10', '08:05'), BACK = leg('NAP', 'BRQ', '2026-11-15', '21:30', '23:20');
const trip = (extra = {}) => ({ id: 'ryanair|BRQ|NAP|2026-11-13T06:10', out: OUT, back: BACK, flightCzk: 1800, perPersonCzk: 1890, tripCzk: 1980, totalCzk: 3780, bagCzk: 0, groundCzk: 60, arrCzk: 30, nights: 2, provider: 'ryanair', combined: false, bookUrl: null, deal: { score: 2, level: 'good', drop: 0 }, priceLevel: { level: 'low', basis: 'search', reason: 'nejlevnější nabídka', ref: 2300, vsRef: -18, pos: 0, n: 5 }, tempHi: 19, distanceKm: 1100, destKey: 'NAP', fromBest: { x: 1 }, ...extra });
const STATS = { n: 5, min: 1800, p25: 1900, median: 2000, p75: 2100, max: 2500, dateFrom: '2026-11-13', dateTo: '2026-11-20', mins: [['BRQ', '2026-11', 1800]] };
const DEST = { key: 'NAP', id: 'metro:NAP', label: 'Neapol', cc: 'IT', country: 'Itálie', lat: 40.85, lon: 14.27, airports: ['NAP'] };
const Q = { adults: 2, bags: 'none', groundMode: 'transit', carFuel: 'diesel', kmRate: 1, arrival: true, trip: 'return', exact: null };
const ORIGINS = [{ iata: 'BRQ', name: 'Brno', cc: 'CZ', distKm: 0, ground: { mode: 'transit', czk: 30 } }, { iata: 'VIE', name: 'Vídeň', cc: 'AT', distKm: 130, ground: { mode: 'transit', czk: 400 } }];
const ARR = { NAP: { iata: 'NAP', city: 'Neapol', czk: 15, min: 20, basis: 'table' }, BCN: { iata: 'BCN', city: 'Barcelona', czk: 120, min: 30 } };
const res = (t = trip(), extra = {}) => ({ mode: 'explore', query: { ...Q }, home: { label: 'Brno', iata: 'BRQ' }, origins: ORIGINS, arrivals: ARR, priceStats: null, groups: [{ dest: DEST, priceStats: STATS, ground: { min: 600, czk: 900 }, options: [t] }], ...extra });
const radarX = (extra = {}) => ({ label: 'Neapol', cc: 'IT', id: 'metro:NAP', czk: 2100, from: 'BRQ', to: 'NAP', d1: '2026-11-13', d2: '2026-11-15', t1: '06:10', a2: '2026-11-15T23:20', deal: 'super', score: 3, prov: 'ryanair', lat: 40.85, lon: 14.27, buy: [['https://www.ryanair.com/cz/cs?x=1', 'ryanair', 'all']], ...extra });
const row = (t = trip(), r = res(t), at = NOW - 3 * H) => P.fromRow(t, r.groups[0], r, at, NOW);
const BASIS = '2|none|transit|1';

test('fromRow: rozpis ceny a lety beze změny, jen letiště a cesta do města nabídky, statistika bez mins, klíč z id a nastavení', () => {
  const p = row();
  assert.equal(p.k, `f|${trip().id}|${BASIS}`);
  assert.equal(P.basis(Q), BASIS);
  assert.deepEqual([p.kind, p.at, p.pinnedAt], ['f', NOW - 3 * H, NOW]);
  assert.deepEqual(plain(p.q), { adults: 2, bags: 'none', groundMode: 'transit', carFuel: null, kmRate: 1, arrival: true, trip: 'return' });
  assert.deepEqual(plain(p.t.out), OUT, 'let tam celý (průvodce porovnává JSON letů)');
  assert.deepEqual(plain(p.t.back), BACK);
  for (const k of ['flightCzk', 'perPersonCzk', 'totalCzk', 'groundCzk', 'arrCzk', 'nights', 'deal', 'priceLevel', 'destKey']) assert.deepEqual(plain(p.t[k]), trip()[k], k);
  assert.equal(p.t.fromBest, undefined, 'jen známá pole nabídky');
  assert.deepEqual(plain(p.origins), [ORIGINS[0]], 'jen letiště odletu a návratu');
  assert.deepEqual(plain(p.arrivals), { NAP: ARR.NAP });
  assert.deepEqual(plain(p.stats), (({ mins, ...s }) => s)(STATS));
  assert.deepEqual(plain(p.dest), { id: 'metro:NAP', key: 'NAP', label: 'Neapol', cc: 'IT', country: 'Itálie', lat: 40.85, lon: 14.27 });
  assert.deepEqual([p.home, plain(p.ground)], ['Brno', { min: 600, czk: 900 }]);
  assert.equal(p.part, undefined);
  // jiný návrat (VIE) a autem: obě letiště, základ s autem a palivem
  const t2 = trip({ back: { ...BACK, to: 'VIE' } }), r2 = res(t2, { query: { ...Q, groundMode: 'car', carFuel: 'petrol', bags: 'cabin' } });
  const p2 = row(t2, r2);
  assert.deepEqual(plain(p2.origins.map((o) => o.iata)), ['BRQ', 'VIE']);
  assert.equal(p2.k, `f|${t2.id}|2|cabin|car|1`);
  assert.equal(p2.q.carFuel, 'petrol');
  // průběžné výsledky: bez úrovně ceny a statistiky, s příznakem
  const pp = row(trip(), res(trip(), { partial: true, at: NOW - H }));
  assert.equal(pp.part, 1);
  assert.equal(pp.t.priceLevel, undefined);
  assert.equal(pp.stats, null);
  // cesta přes víc měst, nabídka bez id
  assert.equal(P.fromRow(trip(), null, { mode: 'multi', query: Q }, NOW, NOW), null);
  assert.equal(P.fromRow(trip({ id: undefined }), null, res(), NOW, NOW), null);
  // vstup se nemění, záznam je kopie
  const t3 = trip(), p3 = row(t3);
  p3.t.out.dep = 'x';
  assert.equal(t3.out.dep, OUT.dep);
});

test('fromRadar: jen co karta zná, základ ceny radaru, klíč z trasy a dnů', () => {
  const r = P.fromRadar(radarX(), { at: NOW - H, adults: 2 }, NOW);
  assert.equal(r.k, `r|BRQ|NAP|2026-11-13|NAP|BRQ|2026-11-15|${BASIS}`);
  assert.deepEqual(plain(r.q), { adults: 2, bags: 'none', groundMode: 'transit', carFuel: null, kmRate: 1, arrival: true, trip: 'return' });
  assert.deepEqual(plain(r.r), { from: 'BRQ', to: 'NAP', d1: '2026-11-13', d2: '2026-11-15', t1: '06:10', a2: '2026-11-15T23:20', czk: 2100, prov: 'ryanair', deal: 'super', buy: [['https://www.ryanair.com/cz/cs?x=1', 'ryanair', 'all']] });
  assert.deepEqual(plain(r.dest), { id: 'metro:NAP', key: 'NAP', label: 'Neapol', cc: 'IT', lat: 40.85, lon: 14.27 });
  assert.equal(r.at, NOW - H);
  assert.equal(r.pv, 2, 'cena jen za letenku');
  // zpět z jiného letiště (bf/bt), jen tam
  assert.equal(P.fromRadar(radarX({ bf: 'CTA', bt: 'VIE' }), { adults: 1 }, NOW).k, 'r|BRQ|NAP|2026-11-13|CTA|VIE|2026-11-15|1|none|transit|1');
  assert.equal(P.fromRadar(radarX({ d2: undefined }), { adults: 1 }, NOW).k, 'r|BRQ|NAP|2026-11-13|-|-|-|1|none|transit|1');
  assert.equal(P.sigTrip(trip()), P.sigRadar(radarX()), 'stejná trasa a dny z řádku i z karty');
  assert.equal(P.fromRadar({ from: 'BRQ' }, {}, NOW), null);
});

test('toggle: odložit, odebrat, 13. ne, plná nabídka nahradí kartu radaru, karta radaru „má“ plnou nabídku', () => {
  const a = row();
  const on = P.toggle([], a);
  assert.deepEqual([on.on, on.full, on.list.length], [true, false, 1]);
  assert.ok(P.has(on.list, a));
  const off = P.toggle(on.list, row());
  assert.deepEqual([off.on, off.list.length], [false, 0]);
  // nejvýš 12
  const many = Array.from({ length: 12 }, (_, i) => row(trip({ id: `id${i}`, out: { ...OUT, date: `2026-12-${String(i + 1).padStart(2, '0')}` } })));
  const full = P.toggle(many, row(trip({ id: 'id12' })));
  assert.deepEqual([full.full, full.on, full.list.length], [true, false, 12]);
  assert.deepEqual(plain(full.list.map((p) => p.k)), plain(many.map((p) => p.k)), 'plný seznam beze změny');
  // karta radaru, pak tatáž nabídka z hledání se stejným nastavením → nahradí ji (i v plném seznamu)
  const rad = P.fromRadar(radarX(), { at: NOW - H, adults: 2 }, NOW);
  const withR = P.toggle(many.slice(0, 11), rad).list;
  assert.equal(withR.length, 12);
  const repl = P.toggle(withR, a);
  assert.deepEqual([repl.on, repl.full, repl.list.length], [true, false, 12]);
  assert.ok(!repl.list.some((p) => p.kind === 'r'));
  // karta radaru už je odložená jako plná nabídka → „má“, klepnutí ji odebere
  assert.ok(P.has([a], rad));
  assert.equal(P.toggle([a], rad).list.length, 0);
  // jiné nastavení (1 os.) = jiná nabídka
  assert.ok(!P.has([a], P.fromRadar(radarX(), { adults: 1 }, NOW)));
  assert.ok(!P.has([a], row(trip(), res(trip(), { query: { ...Q, bags: 'cabin' } }))));
});

test('alive: včerejší odlet pryč, dnešní zůstane, nesmysly pryč', () => {
  const today = row(trip({ out: { ...OUT, date: TODAY } })), yest = row(trip({ id: 'y', out: { ...OUT, date: '2026-10-31' } }));
  const rOld = P.fromRadar(radarX({ d1: '2026-10-31' }), { adults: 2 }, NOW), rOk = P.fromRadar(radarX(), { adults: 2 }, NOW);
  assert.deepEqual(plain(P.alive([today, yest, rOld, rOk, null, 'x', { kind: 'f' }], TODAY).map((p) => p.k)), [today.k, rOk.k]);
  assert.deepEqual(plain(P.alive('x', TODAY)), []);
});

test('clean: cizí vstup – tvary, odkazy jen http(s), čas ne z budoucnosti, bez HTML, klíč znovu, bez duplicit, nejvýš 12', () => {
  const ok = plain(row());
  const opts = { today: TODAY, now: NOW };
  assert.deepEqual(plain(P.clean('x', opts)), []);
  assert.deepEqual(plain(P.clean({ 0: ok }, opts)), []);
  const back = plain(P.clean([ok, 5, null, 'x', [ok]], opts));
  assert.equal(back.length, 1);
  assert.deepEqual(back[0], ok, 'vlastní záznam projde beze změny');
  // špatné tvary
  const bad = (f) => { const x = plain(ok); f(x); return P.clean([x], opts).length; };
  assert.equal(bad((x) => { x.t.out.from = 'brq'; }), 0, 'kód letiště');
  assert.equal(bad((x) => { x.t.back.to = '<b>'; }), 0);
  assert.equal(bad((x) => { x.t.out.date = '13. 11. 2026'; }), 0, 'datum');
  assert.equal(bad((x) => { x.t.out.dep = 5; }), 0);
  assert.equal(bad((x) => { x.at = NOW + 2 * 864e5; }), 0, 'čas z budoucnosti');
  assert.equal(bad((x) => { x.at = 'včera'; }), 0);
  assert.equal(bad((x) => { x.kind = 'x'; }), 0);
  assert.equal(bad((x) => { x.q.adults = 12; }), 0, 'počet lidí');
  assert.equal(bad((x) => { x.t.flightCzk = 0; }), 0);
  assert.equal(bad((x) => { x.t.perPersonCzk = 'levně'; }), 0);
  assert.equal(bad((x) => { x.t.id = 'x'.repeat(301); }), 0);
  assert.equal(bad((x) => { x.t.out.date = '2026-10-31'; }), 0, 'odlet v minulosti');
  // odkazy a texty
  const evil = plain(ok);
  Object.assign(evil, { k: 'f|forged|1|none|none|0', pinnedAt: NOW + 9 * 864e5, home: '<img src=x onerror=alert(1)>Brno', was: { czk: 'x', at: 1 } });
  Object.assign(evil.t, { bookUrl: 'javascript:alert(1)', priceLevel: { level: 'skvělá', reason: 'x' }, deal: { level: '<b>', score: 'x' }, bagCzk: -5 });
  evil.t.out.bookUrl = 'data:text/html,x'; evil.t.back.bookUrl = 'https://www.ryanair.com/"><script>';
  evil.t.out.carrierName = 'Ryan<script>air"';
  Object.assign(evil.dest, { id: 'metro:NAP"><b>', label: '<b>Neapol</b>', cc: 'it', lat: 400 });
  evil.q = { ...evil.q, bags: 'tři', groundMode: 'raketa', carFuel: 'uhlí', kmRate: 9, arrival: 'ano' };
  evil.stats = { ...evil.stats, n: 'x' };
  evil.origins = [...evil.origins, { iata: 'VIE' }, { iata: 'MUC' }, { iata: 'x' }];
  evil.arrivals = { NAP: evil.arrivals.NAP, nap: {}, BCN: { iata: 'BCN' }, PMI: { iata: 'PMI' } };
  const c = plain(P.clean([evil], opts))[0];
  assert.equal(c.k, `f|${ok.t.id}|2|none|transit|0`, 'klíč spočítaný znovu z pročištěného nastavení (podvržený se nepoužije)');
  assert.equal(c.pinnedAt, c.at, 'čas odložení z budoucnosti → čas ceny');
  assert.deepEqual([c.t.bookUrl, c.t.out.bookUrl], [null, null]);
  assert.equal(c.t.back.bookUrl, 'https://www.ryanair.com/script', 'jen http(s), bez znaků pro HTML');
  assert.equal(c.t.out.carrierName, 'Ryanscriptair');
  assert.equal(c.t.priceLevel, undefined);
  assert.deepEqual(c.t.deal, { level: 'normal', score: 0 });
  assert.equal(c.t.bagCzk, undefined);
  assert.equal(c.home, 'img src=x onerror=alert(1)Brno');
  assert.equal(c.was, undefined);
  assert.deepEqual(c.dest, { id: null, key: 'NAP', label: 'bNeapol/b', cc: '', country: 'Itálie' });
  assert.deepEqual(c.q, { adults: 2, bags: 'none', groundMode: 'transit', carFuel: null, kmRate: 1, arrival: false, trip: 'return' });
  assert.equal(c.stats, null);
  assert.deepEqual(c.origins.map((o) => o.iata), ['BRQ', 'VIE']);
  assert.deepEqual(Object.keys(c.arrivals), ['NAP', 'BCN']);
  // __proto__ a constructor v datech neprojdou, nezmění prototyp nabídky ani Object.prototype – ten z vm, ve kterém
  // pins.js běží (test má svůj, na tom by se nic neukázalo)
  const proto = JSON.parse(JSON.stringify(ok).replace('"t":{', '"t":{"__proto__":{"polluted":1},"constructor":{"x":1},'));
  const cp = P.clean([proto], opts)[0];
  assert.equal(Object.hasOwn(cp.t, '__proto__'), false);
  assert.equal(Object.hasOwn(cp.t, 'constructor'), false);
  assert.equal(cp.t.polluted, undefined);
  assert.equal(vm.runInContext('({}).polluted', ctx), undefined);
  // radar: kódy, dny, čas, cena, prodejce a odkazy
  const rad = plain(P.fromRadar(radarX(), { at: NOW - H, adults: 2 }, NOW));
  assert.deepEqual(plain(P.clean([rad], opts)), [rad]);
  const r2 = plain(rad);
  Object.assign(r2.r, { d2: '2026-11-10', t1: '25:00', a2: 'zítra', prov: 'Ryan Air', deal: 'skvělá', bf: 'x', buy: [['javascript:alert(1)', 'kiwi', 'all'], ['https://kiwi.com/a', 'kiwi', 'tam'], ['https://kiwi.com/b', 'kiwi', 'out'], 'x'] });
  const cr = plain(P.clean([r2], opts))[0];
  assert.deepEqual(cr.r, { from: 'BRQ', to: 'NAP', d1: '2026-11-13', czk: 2100, t1: '', a2: '', prov: '', buy: [['https://kiwi.com/b', 'kiwi', 'out']] });
  assert.equal(cr.k, `r|BRQ|NAP|2026-11-13|-|-|-|${BASIS}`, 'návrat před odletem → jen tam');
  assert.equal(P.clean([{ ...rad, r: { ...rad.r, czk: 0 } }], opts).length, 0);
  // karta radaru ze starší verze (bez pv – cena i s dopravou, bez rozpisu) se zahodí
  assert.equal(P.clean([{ ...rad, pv: undefined }], opts).length, 0);
  // duplicity: novější cena vyhrává; nejvýš 12; nejvýš 40 položek na vstupu
  const older = { ...ok, at: NOW - 5 * H, t: { ...ok.t, perPersonCzk: 2500 } };
  const d = plain(P.clean([older, ok], opts));
  assert.equal(d.length, 1);
  assert.equal(d[0].t.perPersonCzk, 1890);
  const many = Array.from({ length: 20 }, (_, i) => ({ ...ok, t: { ...ok.t, id: `id${i}` } }));
  assert.equal(P.clean(many, opts).length, 12);
  assert.equal(P.clean([...Array.from({ length: 40 }, () => 'x'), ok], opts).length, 0, 'jen prvních 40');
});

test('merge: nové, novější cena (s časem odložení zařízení), už máš, nevešla se', () => {
  const a = row(trip({ id: 'a' })), b = row(trip({ id: 'b' })), rad = P.fromRadar(radarX(), { at: NOW - H, adults: 2 }, NOW);
  const cur = [{ ...a, pinnedAt: 111 }, b];
  const newerA = { ...a, at: a.at + H, pinnedAt: 999, t: { ...a.t, perPersonCzk: 1700 } };
  const olderB = { ...b, at: b.at - H };
  const c = row(trip({ id: 'c' }));
  const m = P.merge(cur, [newerA, olderB, c], { today: TODAY });
  assert.deepEqual([m.add, m.newer, m.same, m.over], [1, 1, 1, 0]);
  assert.deepEqual(plain(m.list.map((p) => p.k)), [a.k, b.k, c.k], 'napřed zařízení, pak nové');
  assert.equal(m.list[0].t.perPersonCzk, 1700);
  assert.equal(m.list[0].pinnedAt, 111, 'čas odložení zůstane ze zařízení');
  assert.equal(m.list[1].at, b.at, 'starší cena ze zálohy nepřepíše');
  // karta radaru, kterou zařízení má jako plnou nabídku = už máš; plná ze zálohy nahradí kartu radaru v zařízení
  const full = row();
  assert.deepEqual(plain((({ add, same }) => [add, same])(P.merge([full], [rad], { today: TODAY }))), [0, 1]);
  const m2 = P.merge([rad, b], [full], { today: TODAY });
  assert.deepEqual([m2.add, plain(m2.list.map((p) => p.kind))], [1, ['f', 'f']]);
  // plno: nevešla se; minulý odlet ze zálohy se nepočítá
  const twelve = Array.from({ length: 12 }, (_, i) => row(trip({ id: `x${i}` })));
  const m3 = P.merge(twelve, [c, row(trip({ id: 'd' })), row(trip({ id: 'old', out: { ...OUT, date: '2026-10-01' } }))], { today: TODAY });
  assert.deepEqual([m3.add, m3.over, m3.list.length], [0, 2, 12]);
  // vstupy se nemění
  assert.equal(cur[0].t.perPersonCzk, 1890);
});

test('refresh: stejné id a nastavení → nová cena, čas a úroveň, bez „průběžné“; změněná cena si drží tu z odložení', () => {
  const pin = { ...row(trip(), res(trip(), { partial: true, at: NOW - 5 * H }), NOW - 5 * H), pinnedAt: 42 };
  assert.equal(pin.part, 1);
  const fresh = trip({ perPersonCzk: 2100, totalCzk: 4200, priceLevel: { level: 'normal', reason: 'běžná', ref: 2300, vsRef: -8, pos: 40 } });
  const x = P.refresh([pin], res(fresh), NOW - H, NOW);
  assert.equal(x.n, 1);
  const p = x.list[0];
  assert.deepEqual([p.at, p.pinnedAt, p.part, p.t.perPersonCzk, p.t.priceLevel.level], [NOW - H, 42, undefined, 2100, 'normal']);
  assert.deepEqual(plain(p.was), { czk: 1890, at: NOW - 5 * H });
  assert.ok(p.stats, 'statistika z konečného výsledku');
  // další hledání: „od odložení“ zůstane cena z odložení; stejná cena jako při odložení → bez značky
  const y = P.refresh(x.list, res(trip({ perPersonCzk: 1990 })), NOW - H / 2, NOW);
  assert.deepEqual(plain(y.list[0].was), { czk: 1890, at: NOW - 5 * H });
  assert.equal(P.refresh(x.list, res(trip()), NOW - H / 2, NOW).list[0].was, undefined);
  // jiné nastavení, průběžný výsledek, jiná nabídka, starší výsledek než cena → beze změny
  const list = [pin];
  for (const [r, why] of [[res(fresh, { query: { ...Q, adults: 1 } }), 'jiný počet lidí'], [res(fresh, { partial: true }), 'průběžný'], [res(trip({ id: 'jiná' })), 'jiné id'], [res(fresh, { mode: 'multi' }), 'víc měst']]) {
    const z = P.refresh(list, r, NOW - H, NOW);
    assert.equal(z.n, 0, why);
    assert.equal(z.list, list, why);
  }
  assert.equal(P.refresh([{ ...pin, at: NOW }], res(fresh), NOW - H, NOW).n, 0, 'novější cena (jiné okno) zůstane');
  // konkrétní cíl: nabídka v res.top
  const route = { ...res(trip({ id: 'g' })), mode: 'route', top: [fresh] };
  assert.equal(P.refresh([pin], route, NOW - H, NOW).n, 1);
  // karta radaru se neobnovuje
  const rad = P.fromRadar(radarX(), { adults: 2 }, NOW);
  assert.equal(P.refresh([rad], res(fresh), NOW, NOW).n, 0);
  // nabídka ze starší verze (bez pv, cena i s dopravou): nová cena bez „od odložení“
  const old = P.refresh([{ ...pin, pv: undefined }], res(fresh), NOW - H, NOW).list[0];
  assert.deepEqual([old.t.perPersonCzk, old.was, old.pv], [2100, undefined, 2]);
});

test('refresh: buňka mřížky bez úrovně ze serveru dostane úroveň z level(t); z průběžných rovnou z konečného, který už dorazil', () => {
  const PL = { level: 'low', basis: 'search', reason: 'pod obvyklou cenou', ref: 2300, vsRef: -18, pos: 10, n: 5 };
  // buňka mřížky termínů: server ji posílá bez úrovně (flights.js levelFor ji doplní až výpisu nebo při odložení)
  const cell = (extra = {}) => trip({ id: 'cell|BRQ|NAP|2026-11-13', cell: true, priceLevel: undefined, ...extra });
  const pin = row(cell({ priceLevel: PL }));
  const seen = [];
  const level = (t) => { seen.push(t.id); if (t.cell || t.composed) t.priceLevel = { ...PL, vsRef: -10 }; return t.priceLevel || null; };
  assert.equal(P.refresh([pin], res(cell()), NOW - H, NOW).list[0].t.priceLevel, undefined, 'bez level by štítek ceny zmizel');
  const r = res(cell({ perPersonCzk: 1950 }));
  r.groups[0].options.push(trip({ id: 'jiná', priceLevel: undefined }));
  const x = P.refresh([pin], r, NOW - H, NOW, level);
  assert.equal(x.n, 1);
  assert.deepEqual(plain(x.list[0].t.priceLevel), { ...PL, vsRef: -10 });
  assert.deepEqual(seen, [cell().id], 'jen odložená nabídka z výsledku');
  P.refresh([pin], res(cell({ priceLevel: PL })), NOW - H, NOW, level);
  assert.equal(seen.length, 1, 'úroveň ze serveru: level se nevolá');
  // ⋯ otevřené v průběžných výsledcích, konečný dorazil a čeká na překreslení → 📌 (flights.js pinToggleRow)
  const part = res(cell(), { partial: true, at: NOW - 2 * H });
  const rec = P.fromRow(part.groups[0].options[0], part.groups[0], part, part.at, NOW);
  assert.deepEqual([rec.part, rec.t.priceLevel, rec.stats], [1, undefined, null]);
  const up = P.refresh([rec], res(cell()), NOW - H, NOW, level).list[0];
  assert.deepEqual([up.k, up.part, up.at, up.pinnedAt, up.t.priceLevel.level, Boolean(up.stats)], [rec.k, undefined, NOW - H, NOW, 'low', true]);
  assert.equal(P.toggle([up], rec).list.length, 0, 'tentýž klíč – další klepnutí odebere');
});

test('age: do 24 h bez varování, od 24 h „day“', () => {
  assert.equal(P.age(NOW - 1439 * 6e4, NOW).day, false);
  assert.equal(P.age(NOW - 1440 * 6e4, NOW).day, true);
  assert.match(P.age(NOW - 3 * H, NOW).ago, /^před 3 h$/);
  assert.equal(P.age(0, NOW), null);
});

test('shareText: čísla podle ceny, celkem pro 2 os., lety, jen tam, ⚠ po 24 h, radar, demo, odkazy jen http(s) a krátké', () => {
  const a = row(trip({ bookUrl: 'https://www.ryanair.com/cz/cs/trip?x=1' }));
  const one = row(trip({ id: 'one', back: null, nights: null, perPersonCzk: 990, totalCzk: 1980, out: { ...OUT, stops: 1, carrierName: 'Wizz Air', bookUrl: 'javascript:alert(1)' } }), res(trip(), { query: { ...Q, trip: 'oneway' } }), NOW - 30 * H);
  const rad = P.fromRadar(radarX({ czk: 2400, buy: [['https://www.kiwi.com/' + 'x'.repeat(400), 'kiwi', 'all']] }), { at: NOW - 2 * H, adults: 2, demo: true }, NOW);
  const txt = P.shareText([rad, a, one], { now: NOW });
  const lines = txt.split('\n');
  assert.equal(lines[0], '✈️ Kam pojedeme? Vyber číslo (ceny za osobu):');
  assert.equal(lines[1], '');
  assert.equal(lines.at(-1), '(ATLAS – ceny se mohou změnit, ověř je před nákupem)');
  // 1) jen tam 990 Kč, 2) Neapol 1 890, 3) radar 2 400
  assert.match(txt, /^1\) Neapol 🇮🇹 · pá 13\. 11\. · jen tam$/m);
  assert.match(txt, /^ {3}990 Kč\/os\. \(celkem 1\s980 Kč za 2 os\.\)$/m);
  assert.match(txt, /^ {3}tam 06:10 BRQ → NAP 1× přestup · Wizz Air$/m);
  assert.match(txt, /^ {3}⚠ cena (ze včera|z \d+\. \d+\.) \d+:\d\d \(před \d+ h\) – může být jiná$/m);
  assert.match(txt, /^2\) Neapol 🇮🇹 · pá 13\. 11\. – ne 15\. 11\. · 2 noci$/m);
  assert.match(txt, /^ {3}1\s890 Kč\/os\. \(celkem 3\s780 Kč za 2 os\.\)$/m);
  assert.match(txt, /^ {3}tam 06:10 BRQ → NAP přímý · zpět 21:30 NAP → BRQ přímý · Ryanair$/m);
  assert.match(txt, /^ {3}cena (z|ze včera) \d+:\d\d \(před 3 h\)$/m);
  assert.match(txt, /^ {3}https:\/\/www\.ryanair\.com\/cz\/cs\/trip\?x=1$/m);
  assert.match(txt, /^3\) Neapol 🇮🇹 · pá 13\. 11\. – ne 15\. 11\. · 2 noci$/m);
  assert.match(txt, /^ {3}2\s400 Kč\/os\. \(celkem 4\s800 Kč za 2 os\.\) \(DEMO – vymyšlená cena\)$/m);
  assert.match(txt, /^ {3}BRQ → NAP ↩ BRQ · zpáteční letenka$/m);
  // dlouhý odkaz radaru a javascript: u jen tam → hledání na Google Flights
  assert.ok(!txt.includes('javascript:'));
  assert.ok(!txt.includes('x'.repeat(300)));
  assert.match(txt, /https:\/\/www\.google\.com\/travel\/flights\?hl=cs&curr=CZK&q=Flights%20from%20BRQ%20to%20NAP%20on%202026-11-13%20one%20way/);
  assert.match(txt, /q=Flights%20to%20NAP%20from%20BRQ%20on%202026-11-13%20through%202026-11-15/);
  // jedna osoba: bez „celkem“; dva odkazy tam a zpět
  const solo = row(trip({ out: { ...OUT, bookUrl: 'https://wizzair.com/a' }, back: { ...BACK, bookUrl: 'https://wizzair.com/b' } }), res(trip(), { query: { ...Q, adults: 1 } }));
  const s = P.shareText([solo], { now: NOW });
  assert.match(s, /^ {3}1\s890 Kč\/os\.$/m);
  assert.match(s, /^ {3}tam: https:\/\/wizzair\.com\/a zpět: https:\/\/wizzair\.com\/b$/m);
});

test('jednorázový přepočet starších odložených (flights.js init → clean): letenka + zavazadla, s dopravou tripCzk, karty radaru pryč', () => {
  const opts = { today: TODAY, now: NOW };
  // ve starší verzi byla cena na osobu i s dopravou na letiště a do města (1 800 + 60 + 30)
  const old = { ...plain(row(trip({ perPersonCzk: 1890, totalCzk: 3780, tripCzk: undefined }))), was: { czk: 2100, at: NOW - 9 * H } };
  delete old.pv; delete old.t.tripCzk;
  const rad = plain(P.fromRadar(radarX(), { at: NOW - H, adults: 2 }, NOW));
  delete rad.pv;
  const out = plain(P.clean([old, rad], opts));
  assert.equal(out.length, 1, 'karta radaru bez rozpisu se zahodí');
  assert.deepEqual([out[0].pv, out[0].t.perPersonCzk, out[0].t.tripCzk, out[0].t.totalCzk, out[0].was], [2, 1800, 1890, 3600, undefined]);
  // znovu už nic nemění
  assert.deepEqual(plain(P.clean(out, opts)), out);
});
