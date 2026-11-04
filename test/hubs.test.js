// Přestupní letiště v okolí (odlety na dálkové lety) jako cíl cesty: cesta z letiště do města se počítá u cíle,
// nikdy u letiště, odkud se letí – i když je Mnichov zároveň přestupním letištěm v okolí a cílem hledání.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { search } = await import('../server/lib/search.js');
const { makeLeg, makeTrip } = await import('../server/lib/fares.js');
const { arrivalCzk } = await import('../server/lib/arrival.js');

// zdroj jako Kiwi: celé zpáteční letenky jedním dotazem (search), po dnech nic
function fakeKiwi(pairs) {
  return {
    id: 'kiwi', name: 'Fake', live: true, maxPairs: 3,
    stations: async () => null, routes: async () => null, daily: async () => [],
    search: async ({ origins }) => pairs.filter(([f]) => origins.includes(f)).map(([f, t, b], i) => {
      const d = ymdPlus(20), r = ymdPlus(27);
      return makeTrip(makeLeg({ provider: 'kiwi', from: f, to: t, dep: `${d}T10:0${i}:00`, czk: 2000, price: 2000, currency: 'CZK' }),
        makeLeg({ provider: 'kiwi', from: t, to: b, dep: `${r}T12:0${i}:00`, czk: 2000, price: 2000, currency: 'CZK' }), { combinedCzk: 4000 });
    }),
  };
}

test('cíl = přestupní letiště v okolí (Mnichov): cesta do města tam i zpět u cíle, z jiného přestupního letiště taky', async () => {
  const pairs = [['PRG', 'MUC', 'PRG'], ['VIE', 'MUC', 'VIE'], ['BER', 'MUC', 'PRG'], ['PRG', 'BKK', 'PRG'], ['MUC', 'BKK', 'MUC'], ['VIE', 'BKK', 'VIE']];
  const q = { from: ['ap:PRG'], radiusKm: 100, dateFrom: ymdPlus(15), dateTo: ymdPlus(30), trip: 'return', nightsMin: 5, nightsMax: 9, arrival: true, kmRate: 1, groundMode: 'transit' };
  const r = await search({ ...q, to: ['ap:MUC', 'ap:BKK'] }, () => {}, { providers: [fakeKiwi(pairs)] });
  assert.ok(r.hubs.length && !r.hubs.includes('MUC'), 'zadaný cíl není zároveň místem odletu: ' + r.hubs.join(','));
  const all = r.groups.flatMap((g) => [g.best, ...g.options]);
  const muc = arrivalCzk('MUC'), bkk = arrivalCzk('BKK');
  const of = (f, t, b) => all.find((x) => x.out.from === f && x.out.to === t && x.back.to === b);
  for (const [f, t, b] of pairs) {
    const x = of(f, t, b);
    if (!x) continue;
    assert.equal(x.arrCzk, 2 * (t === 'MUC' ? muc : bkk), `${f}→${t}→${b}: cesta do města jen u cíle (tam i zpět)`);
  }
  assert.ok(of('VIE', 'MUC', 'VIE') && of('BER', 'MUC', 'PRG') && of('VIE', 'BKK', 'VIE'), 'nabídky z přestupních letišť ve výsledku');
  assert.ok(!of('MUC', 'BKK', 'MUC'), 'z Mnichova (cíl hledání) se neodlétá');
  assert.ok(r.arrivals.MUC && r.arrivals.BKK, 'štítky cesty do města');
  // dva cíle, oba přestupní letiště v okolí: žádné lety mezi nimi s cestou do města na špatném konci
  const r2 = await search({ ...q, to: ['ap:MUC', 'ap:VIE', 'ap:BKK'] }, () => {}, { providers: [fakeKiwi([...pairs, ['PRG', 'VIE', 'PRG'], ['MUC', 'VIE', 'MUC']])] });
  assert.ok(!r2.hubs.includes('MUC') && !r2.hubs.includes('VIE'), r2.hubs.join(','));
  const all2 = r2.groups.flatMap((g) => [g.best, ...g.options]);
  for (const x of all2) assert.equal(x.arrCzk, 2 * arrivalCzk(x.out.to), `${x.out.from}→${x.out.to}→${x.back.to}`);
  assert.ok(all2.some((x) => x.out.from === 'PRG' && x.out.to === 'VIE'));
});

test('bez „návrat i na jiné letiště“: celá zpáteční letenka s návratem jinam (Kiwi) ve výpisu ani v kalendáři není', async () => {
  // návrat do Prahy z Vídně je levnější – s open-jaw nejlevnější, bez něj vůbec
  const pairs = [['PRG', 'BKK', 'PRG'], ['VIE', 'BKK', 'PRG']];
  const kiwi = fakeKiwi(pairs);
  const search0 = kiwi.search;
  kiwi.search = async (a) => (await search0(a)).map((t) => (t.out.from === 'VIE' ? { ...t, flightCzk: 3000 } : t));
  const q = { from: ['ap:PRG'], radiusKm: 100, to: ['ap:BKK'], dateFrom: ymdPlus(15), dateTo: ymdPlus(30), trip: 'return', nightsMin: 5, nightsMax: 9, kmRate: 0 };
  const all = (r) => [...r.groups.flatMap((g) => g.options), ...r.top];
  const on = await search(q, () => {}, { providers: [kiwi] });
  assert.ok(all(on).some((t) => t.out.from === 'VIE' && t.back.to === 'PRG'), 's open-jaw nabídka z Vídně zpět do Prahy je');
  assert.equal(on.calendar.out[0].cost, 3000);
  const off = await search({ ...q, openJaw: false }, () => {}, { providers: [kiwi] });
  assert.ok(all(off).length, 'nabídka tam i zpět z Prahy zůstává');
  for (const t of all(off)) assert.ok(t.back.to === t.out.from && t.back.from === t.out.to, `${t.out.from}→${t.out.to}, zpět ${t.back.from}→${t.back.to}`);
  assert.deepEqual(off.calendar.out.map((e) => [e.from, e.backTo, e.cost]), [['PRG', 'PRG', 4000]]);
});

test('kamkoliv: let mezi letišti v okruhu domova (Vídeň → Bratislava z cache) mezi cíli není', async () => {
  const d = ymdPlus(20), r = ymdPlus(25);
  const trip = (f, t) => makeTrip(makeLeg({ provider: 'travelpayouts', from: f, to: t, dep: `${d}T09:00:00`, czk: 900, price: 900, currency: 'CZK' }),
    makeLeg({ provider: 'travelpayouts', from: t, to: f, dep: `${r}T18:00:00`, czk: 900, price: 900, currency: 'CZK' }), { combinedCzk: 1800 });
  const tp = { id: 'travelpayouts', name: 'Fake TP', live: false, stations: async () => null, explore: async ({ origin }) => (origin === 'VIE' ? [trip('VIE', 'BTS'), trip('VIE', 'BCN')] : []) };
  const res = await search({ from: ['ap:BRQ'], radiusKm: 200, to: [], dateFrom: ymdPlus(15), dateTo: ymdPlus(30), trip: 'return', nightsMin: 3, nightsMax: 7, arrival: true, kmRate: 1, groundMode: 'transit' },
    () => {}, { providers: [tp] });
  const dests = res.groups.map((g) => g.best.out.to);
  assert.ok(dests.includes('BCN'), dests.join(','));
  assert.ok(!dests.includes('BTS'), 'Bratislava je v okruhu domova: ' + dests.join(','));
});
