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

test('cíl = přestupní letiště v okolí (Mnichov): cesta do města tam i zpět u všech letů, i z/do jiného přestupního letiště', async () => {
  const pairs = [['PRG', 'MUC', 'PRG'], ['VIE', 'MUC', 'VIE'], ['BER', 'MUC', 'PRG'], ['PRG', 'BKK', 'PRG'], ['MUC', 'BKK', 'MUC']];
  const r = await search({ from: ['ap:PRG'], radiusKm: 100, to: ['ap:MUC', 'ap:BKK'], dateFrom: ymdPlus(15), dateTo: ymdPlus(30), trip: 'return', nightsMin: 5, nightsMax: 9, arrival: true, kmRate: 1, groundMode: 'transit' },
    () => {}, { providers: [fakeKiwi(pairs)] });
  assert.ok(r.hubs.includes('MUC'), 'Mnichov je přestupní letiště v okolí: ' + r.hubs.join(','));
  const all = r.groups.flatMap((g) => [g.best, ...g.options]);
  const muc = arrivalCzk('MUC'), bkk = arrivalCzk('BKK');
  const of = (f, t, b) => all.find((x) => x.out.from === f && x.out.to === t && x.back.to === b);
  for (const [f, t, b] of pairs) {
    const x = of(f, t, b);
    if (!x) continue;
    assert.equal(x.arrCzk, 2 * (t === 'MUC' ? muc : bkk), `${f}→${t}→${b}: cesta do města jen u cíle (tam i zpět)`);
  }
  assert.ok(of('VIE', 'MUC', 'VIE') && of('MUC', 'BKK', 'MUC'), 'nabídky z přestupních letišť ve výsledku');
  assert.ok(r.arrivals.MUC && r.arrivals.BKK, 'štítky cesty do města');
});
