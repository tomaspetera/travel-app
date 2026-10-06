// Vlak nebo bus místo letadla přes HTTP (DEMO režim): /api/ground (kontrola vstupu, odhad, odkazy, ukázkové
// spoje) a odhad po zemi ve výsledcích /api/search (kamkoliv i konkrétní cíl, blízko i daleko).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
process.env.SEARCH_RATE_LIMIT = '0';
const { createServer } = await import('../server/index.js');

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async (qs) => {
  const r = await fetch(`${base}/api/ground?${qs}`);
  return { status: r.status, j: await r.json() };
};
async function search(body) {
  const r = await fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const last = (await r.text()).trim().split('\n').map((l) => JSON.parse(l)).at(-1);
  assert.equal(last.type, 'result', JSON.stringify(last).slice(0, 200));
  return last.result;
}

test('GET /api/ground: neplatný vstup → 400 s českou chybou', async () => {
  for (const qs of ['', 'from=ap:PRG', 'from=cc:CZ&to=ap:VIE', 'from=ap:PRG&to=ap:ZZZ', `from=ap:PRG&to=ap:VIE&date=${ymdPlus(-9)}`, 'from=ap:PRG&to=ap:VIE&date=31.12.2026',
    'from=ap:PRG&to=ap:VIE&adults=12', 'from=ap:PRG&toLat=x&toLon=1']) {
    const { status, j } = await get(qs);
    assert.equal(status, 400, qs);
    assert.ok(j.error && /[a-zá-ž]/i.test(j.error), qs);
  }
});

test('GET /api/ground: Praha → Vídeň = odhad, srovnání, odkazy a (DEMO) spoje; Lisabon mimo dosah', async () => {
  const date = ymdPlus(12);
  const { status, j } = await get(`from=geo:50.0755,14.4378|Praha&to=ap:VIE&date=${date}&adults=2&flightCzk=1800&trips=1`);
  assert.equal(status, 200);
  assert.deepEqual([j.from.label, j.to.label, j.to.tz], ['Praha', 'Vídeň', 'Europe/Vienna']);
  assert.equal(j.est.basis, 'measured');
  assert.equal(j.worth.worth, true);
  assert.deepEqual(j.links.map((l) => l.id), ['regiojet', 'flixbus', 'idos', 'google']);
  assert.equal(new URL(j.links[0].url).searchParams.getAll('tariffs').length, 2);
  assert.equal(j.live.ok, true);
  assert.equal(j.live.demo, true, 'DEMO spoje jsou označené');
  assert.ok(j.live.items.length > 3 && j.live.items.every((x) => x.dep.startsWith(date)));
  const far = await get(`from=ap:PRG&to=ap:LIS&date=${date}`);
  assert.equal(far.status, 200);
  assert.equal(far.j.est, null);
  assert.equal(far.j.worth.worth, false);
  assert.deepEqual(far.j.links, []);
  assert.equal(far.j.live, undefined);
  // Mallorca (ostrov) a Londýn (přes moře)
  assert.match((await get('from=ap:PRG&to=ap:PMI')).j.why, /ostrov/);
  assert.match((await get('from=ap:PRG&to=metro:LON')).j.why, /moře/);
  // bez data žádné spoje (jen na vyžádání s datem), vypínač REGIOJET_LIVE=0
  assert.equal((await get('from=ap:PRG&to=ap:VIE')).j.live, undefined);
  process.env.REGIOJET_LIVE = '0';
  const off = await get(`from=ap:PRG&to=ap:VIE&date=${date}`);
  delete process.env.REGIOJET_LIVE;
  assert.equal(off.j.live.ok, false);
  assert.equal(off.j.live.off, true);
  assert.ok(off.j.est, 'odhad a odkazy platí dál');
});

test('POST /api/search: skupiny v dosahu nesou odhad po zemi, daleké ne; konkrétní cíl má srovnání i bez letů', async () => {
  const r = await search({ from: ['ap:PRG'], radiusKm: 0, dateFrom: ymdPlus(10), dateTo: ymdPlus(40), trip: 'return', nightsMin: 2, nightsMax: 6, adults: 1 });
  assert.ok(r.groups.length > 10);
  const near = r.groups.filter((g) => g.ground);
  assert.ok(near.length >= 5, `${near.length} skupin v dosahu`);
  for (const g of near) {
    assert.ok(g.ground.km <= 1100 && g.ground.min > 0 && g.ground.czk > 0, g.dest.label);
    assert.ok(['measured', 'distance'].includes(g.ground.basis));
    assert.match(g.ground.q.from, /^(ap|geo):/);
    assert.match(g.ground.q.to, /^(ap|metro|geo):/);
    assert.ok(typeof g.ground.reason === 'string' && g.ground.reason.length > 10);
  }
  for (const g of r.groups.filter((x) => ['GB', 'IE', 'PT', 'MT', 'CY', 'IS', 'TR', 'EG', 'US'].includes(x.dest.cc))) assert.equal(g.ground, undefined, g.dest.label);
  assert.equal(r.ground, null, 'kamkoliv nemá jeden cíl');
  // Konkrétní cíl (přesná data) – srovnání v celém výsledku
  const v = await search({ from: ['geo:50.0755,14.4378|Praha'], to: ['ap:VIE'], radiusKm: 50, exactOut: ymdPlus(14), exactBack: ymdPlus(18), trip: 'return', adults: 2 });
  assert.ok(v.ground);
  assert.equal(v.ground.to, 'Vídeň');
  assert.equal(v.ground.basis, 'measured');
  assert.equal(v.ground.worth, true);
  if (v.groups.length) assert.equal(v.ground.flightCzk, Math.min(...v.groups.map((g) => g.best.perPersonCzk)));
  const l = await search({ from: ['ap:PRG'], to: ['ap:LIS'], radiusKm: 0, dateFrom: ymdPlus(10), dateTo: ymdPlus(30), trip: 'oneway' });
  assert.equal(l.ground, null);
  assert.ok(l.groups.every((g) => !g.ground));
  const b = await search({ from: ['ap:BRQ'], to: ['ap:BUD'], radiusKm: 0, dateFrom: ymdPlus(10), dateTo: ymdPlus(30), trip: 'oneway' });
  assert.ok(b.ground, 'Brno → Budapešť');
  assert.equal(b.ground.from, 'Brno');
  assert.equal(b.ground.basis, 'distance');
});
