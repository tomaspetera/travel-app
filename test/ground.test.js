// Vlak nebo bus místo letadla (server/lib/ground.js): odhad, pravidlo „stojí za to“, odkazy, živé spoje
// RegioJetu (stubFetch – parsování, mezipaměť, omezovač, vypínač, chyby) a dotaz /api/ground.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';
import { RJ_PRAHA_VIDEN } from './fixtures/regiojet.js';
import * as G from '../server/lib/ground.js';

const P = (label, cc, lat, lon, rj = null, extra = {}) => ({ label, cc, lat, lon, rj, fb: null, loc: label, ...extra });
const PRAHA = P('Praha', 'CZ', 50.0833, 14.4353, G.PRAHA_RJ, { fb: '40de1ad1-8646-11e6-9066-549f350fcb0c' });
const VIDEN = P('Vídeň', 'AT', 48.1855, 16.3768, 10202052, { loc: 'Wien', fb: '40de1f31-8646-11e6-9066-549f350fcb0c' });
const BRNO = P('Brno', 'CZ', 49.1903, 16.6128, 10202002);
const BUDAPEST = P('Budapešť', 'HU', 47.5003, 19.0839, 10202091, { loc: 'Budapest' });

test('estimate: Praha ↔ změřené město = změřeno 13. 10. (oběma směry), jinak model podle vzdálenosti', () => {
  const e = G.estimate(PRAHA, VIDEN);
  assert.equal(e.ok, true);
  assert.equal(e.basis, 'measured');
  assert.equal(e.minutes, 234);
  assert.equal(e.czk, 299);
  assert.equal(e.measuredAt, '2026-10-13');
  assert.ok(e.km > 240 && e.km < 260, `Praha–Vídeň ${e.km} km`);
  assert.deepEqual(G.estimate(VIDEN, PRAHA), e, 'zpět stejně');
  const d = G.estimate(BRNO, BUDAPEST);
  assert.equal(d.basis, 'distance');
  assert.ok(d.minutes >= 200 && d.minutes <= 320, `Brno–Budapešť ${d.minutes} min`);
  assert.ok(d.czk >= 200 && d.czk <= 400, `Brno–Budapešť ${d.czk} Kč`);
  assert.equal(d.minutes % 5, 0, 'čas zaokrouhlený na 5 min');
  assert.equal(d.czk % 10, 0, 'cena zaokrouhlená');
});

test('distanceModel: kalibrace na tabulce z Prahy (rychlost a cena v rozumných mezích, roste se vzdáleností)', () => {
  // [km, změřeno min, změřeno Kč] – model se smí lišit, ale ne o víc než ~30 % (Benátky přes Alpy víc)
  const rows = [[251, 234, 299], [280, 250, 329], [300, 270, 299], [445, 371, 399], [395, 350, 279], [525, 575, 849], [710, 740, 1098], [885, 765, 1158]];
  for (const [km, min, czk] of rows) {
    const m = G.distanceModel(km);
    assert.ok(Math.abs(m.minutes - min) / min < 0.3, `${km} km: ${m.minutes} min (změřeno ${min})`);
    assert.ok(Math.abs(m.czk - czk) / czk < 0.3, `${km} km: ${m.czk} Kč (změřeno ${czk})`);
    const speed = km / (m.minutes / 60);
    assert.ok(km <= 450 ? speed >= 58 && speed <= 72 : speed >= 45 && speed <= 70, `${km} km: ${speed.toFixed(0)} km/h`);
  }
  let prev = { minutes: 0, czk: 0 };
  for (let km = 50; km <= 1100; km += 25) {
    const m = G.distanceModel(km);
    assert.ok(m.minutes >= prev.minutes && m.czk >= prev.czk, `${km} km neklesá`);
    prev = m;
  }
  assert.equal(G.distanceModel(1080).czk % 50, 0, 'nad 1000 Kč po padesátikorunách');
});

test('estimate: jen pevninská Evropa do ~1100 km – ostrovy, moře a daleké cíle ne', () => {
  const no = [
    ['Lisabon', 'PT', 38.7223, -9.1393], ['Londýn', 'GB', 51.5074, -0.1278], ['Dublin', 'IE', 53.35, -6.26], ['Malta', 'MT', 35.9, 14.5],
    ['Larnaka', 'CY', 34.92, 33.62], ['Reykjavík', 'IS', 64.14, -21.94], ['Palma de Mallorca', 'ES', 39.57, 2.65], ['Tenerife', 'ES', 28.29, -16.63],
    ['Ajaccio (Korsika)', 'FR', 41.93, 8.74], ['Heraklion (Kréta)', 'GR', 35.34, 25.13], ['Olbia (Sardinie)', 'IT', 40.92, 9.5], ['Istanbul', 'TR', 41.01, 28.98],
  ];
  for (const [label, cc, lat, lon] of no) {
    const e = G.estimate(PRAHA, P(label, cc, lat, lon));
    assert.equal(e.ok, false, label);
    assert.ok(e.why, `${label}: proč`);
  }
  assert.match(G.estimate(PRAHA, P('Malta', 'MT', 35.9, 14.5)).why, /přes moře/);
  assert.match(G.estimate(PRAHA, P('Palma', 'ES', 39.57, 2.65)).why, /Baleáry – ostrov/);
  assert.match(G.estimate(PRAHA, P('Lisabon', 'PT', 38.72, -9.14)).why, /km vzdušnou čarou/);
  // Pevnina: Split (Chorvatsko), Kodaň (mosty), Řím (~920 km)
  for (const [label, cc, lat, lon] of [['Split', 'HR', 43.51, 16.44], ['Kodaň', 'DK', 55.68, 12.57], ['Řím', 'IT', 41.9, 12.5]]) {
    assert.equal(G.estimate(PRAHA, P(label, cc, lat, lon)).ok, true, label);
  }
  assert.equal(G.estimate(PRAHA, P('Praha-Letňany', 'CZ', 50.13, 14.52)).ok, false, 'stejné místo');
});

test('worth: srovnání s letadlem od dveří ke dveřím – čas, krátká cesta, výrazně levněji', () => {
  const e = (minutes, czk = 300) => ({ ok: true, km: 300, minutes, czk, basis: 'distance' });
  // 1) po zemi nejvýš o 1,5 h déle než letadlem
  const t = G.worth(e(400), { doorMin: 350 });
  assert.equal(t.rule, 'time');
  assert.equal(t.groundMin, 430);
  assert.match(t.reason, /skoro jako letadlem/);
  assert.match(G.worth(e(200), { doorMin: 300 }).reason, /rychleji než letadlem/);
  // 2) do 6,5 h i bez známého letu
  const s = G.worth(e(360));
  assert.equal(s.rule, 'short');
  assert.equal(s.worth, true);
  // 3) aspoň o polovinu levněji (cena letu tam i zpět → dvě cesty po zemi) a do 10 h
  const c = G.worth(e(540, 900), { doorMin: 300, czk: 4000, trips: 2 });
  assert.equal(c.rule, 'cheap');
  assert.match(c.reason, /2[\s ]200 Kč levněji/);
  assert.equal(G.worth(e(540, 900), { doorMin: 300, czk: 3000, trips: 2 }).worth, false, '1 800 Kč není polovina z 3 000');
  assert.equal(G.worth(e(700, 300), { doorMin: 300, czk: 9000 }).worth, false, 'přes 10 h ani levně ne');
  const n = G.worth(e(700), { doorMin: 300 });
  assert.equal(n.worth, false);
  assert.match(n.reason, /letadlo tu vychází lépe/);
  assert.equal(G.worth({ ok: false, why: 'ostrov' }).reason, 'ostrov');
  // od dveří ke dveřím: cesta na letiště + 2 h + let + 45 min + cesta do města
  assert.equal(G.flightDoor({ accessMin: 40, flightMin: 60, egressMin: 30 }), 40 + 120 + 60 + 45 + 30);
});

test('links: RegioJet a FlixBus jen se známými ID, IDOS a Google vždy; formáty data a kódování', () => {
  const l = G.links(PRAHA, VIDEN, '2026-10-06', 2);
  assert.deepEqual(l.map((x) => x.id), ['regiojet', 'flixbus', 'idos', 'google']);
  const rj = new URL(l[0].url);
  assert.equal(rj.origin + rj.pathname, 'https://regiojet.cz/');
  assert.equal(rj.searchParams.get('departureDate'), '2026-10-06');
  assert.equal(rj.searchParams.get('fromLocationId'), String(G.PRAHA_RJ));
  assert.equal(rj.searchParams.get('toLocationId'), '10202052');
  assert.equal(rj.searchParams.get('fromLocationType'), 'CITY');
  assert.equal(rj.searchParams.get('toLocationType'), 'CITY');
  assert.deepEqual(rj.searchParams.getAll('tariffs'), ['REGULAR', 'REGULAR'], 'tarif na každého cestujícího');
  const fb = new URL(l[1].url);
  assert.equal(fb.origin + fb.pathname, 'https://shop.flixbus.cz/search');
  assert.equal(fb.searchParams.get('departureCity'), PRAHA.fb);
  assert.equal(fb.searchParams.get('arrivalCity'), VIDEN.fb);
  assert.equal(fb.searchParams.get('rideDate'), '06.10.2026', 'FlixBus DD.MM.YYYY');
  assert.equal(fb.searchParams.get('adult'), '2');
  assert.match(l[1].note, /jen odkaz/);
  const idos = new URL(l[2].url);
  assert.equal(idos.origin + idos.pathname, 'https://idos.cz/vlakyautobusy/spojeni/');
  assert.equal(idos.searchParams.get('f'), 'Praha', 'česká místa česky');
  assert.equal(idos.searchParams.get('t'), 'Wien', 'zahraniční místním názvem');
  assert.equal(idos.searchParams.get('date'), '6.10.2026', 'IDOS D.M.YYYY');
  assert.equal(idos.searchParams.get('submit'), 'true');
  const gm = new URL(l[3].url);
  assert.equal(gm.searchParams.get('api'), '1');
  assert.equal(gm.searchParams.get('origin'), 'Praha, Czechia');
  assert.equal(gm.searchParams.get('destination'), 'Wien, Austria');
  assert.equal(gm.searchParams.get('travelmode'), 'transit');
  // diakritika a mezery zakódované (žádné surové znaky v adrese)
  const n = G.links(P('Ústí nad Labem', 'CZ', 50.66, 14.03), P('Košice & okolí', 'SK', 48.72, 21.26), '2026-11-20');
  for (const x of n) assert.match(x.url, /^https:\/\/[\x21-\x7e]+$/, `${x.id}: jen ASCII bez mezer`);
  assert.equal(new URL(n[0].url).searchParams.get('t'), 'Košice & okolí');
  assert.deepEqual(n.map((x) => x.id), ['idos', 'google'], 'bez ID jen IDOS a Google');
  // bez data: žádné datum v odkazech; počet cestujících 1–9
  const nd = G.links(PRAHA, VIDEN, null, 40);
  assert.equal(new URL(nd[0].url).searchParams.has('departureDate'), false);
  assert.equal(new URL(nd[0].url).searchParams.getAll('tariffs').length, 9);
  assert.equal(new URL(nd[1].url).searchParams.has('rideDate'), false);
  assert.equal(new URL(nd[2].url).searchParams.has('date'), false);
  // jen jedno město s ID → RegioJet ani FlixBus ne
  assert.deepEqual(G.links(PRAHA, { ...VIDEN, rj: null, fb: null }, '2026-10-06').map((x) => x.id), ['idos', 'google']);
});

test('groundPlace: letiště a města z výsledků → město z dat (ID RegioJetu/FlixBusu, místní název, pásmo)', () => {
  if (!G.CITIES.length) return; // data/ground.json ještě nesestavené
  const vie = G.groundPlace({ label: 'Vídeň', cc: 'AT', lat: 48.1103, lon: 16.5697 }); // letiště Schwechat
  assert.equal(vie.label, 'Vídeň');
  assert.equal(vie.rj, 10202052);
  assert.equal(vie.tz, 'Europe/Vienna');
  const prg = G.groundPlace({ label: 'Praha', cc: 'CZ', lat: 50.1009, lon: 14.26 });
  assert.equal(prg.rj, G.PRAHA_RJ);
  assert.equal(G.estimate(prg, vie).basis, 'measured');
  const nowhere = G.groundPlace({ label: 'Někde', lat: 48.85, lon: 13.8 }); // Šumava, bez země: země z nejbližšího letiště
  assert.equal(nowhere.cc, 'CZ');
  assert.equal(nowhere.rj, null);
});

/* ---------- živé spoje RegioJetu ---------- */
let stub = null;
const ENV = ['REGIOJET_LIVE', 'REGIOJET_GAP_MS', 'REGIOJET_MAX_PER_HOUR'];
beforeEach(() => {
  G.resetRegiojet();
  for (const k of ENV) delete process.env[k];
  process.env.REGIOJET_GAP_MS = '0';
});
afterEach(() => {
  if (stub) stub.restore();
  stub = null;
});

test('regiojet: parsování spojů vybraného dne – časy, délka, přestupy, vlak/bus, ceny, místa', async () => {
  stub = stubFetch(() => ({ body: RJ_PRAHA_VIDEN }));
  const r = await G.regiojet(G.PRAHA_RJ, 10202052, '2026-10-13');
  assert.equal(r.ok, true);
  assert.equal(r.source, 'regiojet');
  assert.equal(r.items.length, 7, 'spoj 14. 10. vynechán');
  const first = r.items[0];
  assert.deepEqual({ dep: first.dep, arr: first.arr, min: first.min, transfers: first.transfers, kinds: first.kinds, priceFrom: first.priceFrom, priceTo: first.priceTo, seats: first.seats, bookable: first.bookable },
    { dep: '2026-10-13T06:01', arr: '2026-10-13T10:21', min: 260, transfers: 0, kinds: ['TRAIN'], priceFrom: 299, priceTo: 649, seats: 339, bookable: true });
  const mixed = r.items.find((x) => x.transfers === 1 && x.kinds.length === 2);
  assert.deepEqual(mixed.kinds, ['TRAIN', 'BUS']);
  assert.equal(mixed.min, 349);
  const soldOut = r.items.find((x) => x.priceFrom == null);
  assert.equal(soldOut.bookable, false, 'cena 0 = vyprodáno');
  assert.equal(r.items.at(-1).arr, '2026-10-14T06:10', 'noční spoj přijede další den');
  assert.deepEqual([r.count, r.priceFrom, r.fastest], [6, 299, 260]);
  // dotaz: správná adresa a hlavičky, bez Origin (z prohlížeče cizího webu API vrací 403)
  const u = new URL(stub.calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://brn-ybus-pubapi.sa.cz/restapi/routes/search/simple');
  assert.deepEqual(Object.fromEntries(['fromLocationId', 'toLocationId', 'fromLocationType', 'toLocationType', 'departureDate', 'tariffs'].map((k) => [k, u.searchParams.get(k)])),
    { fromLocationId: String(G.PRAHA_RJ), toLocationId: '10202052', fromLocationType: 'CITY', toLocationType: 'CITY', departureDate: '2026-10-13', tariffs: 'REGULAR' });
  const h = stub.calls[0].init.headers;
  assert.equal(h['X-Lang'], 'cs');
  assert.equal(h['X-Currency'], 'CZK');
  assert.equal(Object.keys(h).some((k) => k.toLowerCase() === 'origin'), false);
});

test('regiojet: mezipaměť (stejný dotaz = jeden dotaz), souběžné dotazy jeden po druhém s odstupem', async () => {
  process.env.REGIOJET_GAP_MS = '120';
  const times = [];
  stub = stubFetch(() => {
    times.push(Date.now());
    return { body: RJ_PRAHA_VIDEN };
  });
  const [a, b, c] = await Promise.all([
    G.regiojet(G.PRAHA_RJ, 10202052, '2026-10-13'),
    G.regiojet(G.PRAHA_RJ, 10202052, '2026-10-13'), // rozpracovaný dotaz se sdílí
    G.regiojet(G.PRAHA_RJ, 10202052, '2026-10-14'),
  ]);
  assert.ok(a.ok && b.ok && c.ok);
  assert.equal(stub.calls.length, 2);
  assert.ok(times[1] - times[0] >= 110, `odstup ${times[1] - times[0]} ms`);
  assert.equal(c.items.length, 1, '14. 10. jen jeden spoj ve vzorku');
  await G.regiojet(G.PRAHA_RJ, 10202052, '2026-10-13');
  assert.equal(stub.calls.length, 2, 'z mezipaměti');
});

test('regiojet: hodinový strop, vypínač REGIOJET_LIVE=0 a chyba → žádná živá data (bez výjimky)', async () => {
  process.env.REGIOJET_MAX_PER_HOUR = '1';
  stub = stubFetch(() => ({ body: RJ_PRAHA_VIDEN }));
  assert.equal((await G.regiojet(1, 2, '2026-10-13')).ok, true);
  const busy = await G.regiojet(1, 3, '2026-10-13');
  assert.equal(busy.ok, false);
  assert.equal(busy.busy, true);
  assert.match(busy.error, /limit/);
  assert.equal(stub.calls.length, 1);
  stub.restore();

  G.resetRegiojet();
  process.env.REGIOJET_LIVE = '0';
  stub = stubFetch(() => ({ body: RJ_PRAHA_VIDEN }));
  const off = await G.regiojet(1, 2, '2026-10-13');
  assert.equal(off.ok, false);
  assert.equal(off.off, true);
  assert.equal(stub.calls.length, 0, 'vypnuto = žádný dotaz');
  stub.restore();

  G.resetRegiojet();
  delete process.env.REGIOJET_LIVE;
  stub = stubFetch(() => ({ status: 503, body: 'nope' }));
  const err = await G.regiojet(1, 2, '2026-10-13');
  assert.equal(err.ok, false);
  assert.match(err.error, /neodpovídá/);
  assert.equal(stub.calls.length, 2, 'jedno opakování');
  await G.regiojet(1, 2, '2026-10-13');
  assert.equal(stub.calls.length, 2, 'chyba se na chvíli pamatuje (RegioJet se nebombarduje)');
  stub.restore();

  G.resetRegiojet();
  stub = stubFetch(() => ({ body: '<html>' }));
  assert.equal((await G.regiojet(1, 2, '2026-10-13')).ok, false, 'neplatné JSON');
  assert.equal((await G.regiojet('1;DROP', 2, '2026-10-13')).ok, false, 'neplatné ID');
  assert.equal((await G.regiojet(1, 2, '13.10.2026')).ok, false, 'neplatné datum');
});

test('regiojet: víc než 5 čekajících dotazů dostane hned odhad', async () => {
  process.env.REGIOJET_GAP_MS = '30';
  stub = stubFetch(() => ({ body: RJ_PRAHA_VIDEN }));
  const rs = await Promise.all([10, 11, 12, 13, 14, 15, 16, 17].map((id) => G.regiojet(1, id, '2026-10-13')));
  assert.ok(rs.filter((r) => r.busy).length >= 1);
  assert.ok(rs.filter((r) => r.ok).length >= 5);
});

/* ---------- výsledky hledání (bez sítě) ---------- */
test('attachGround: odhad ke skupinám v dosahu, od dveří ke dveřím s nejkratším nalezeným letem, i bez letů', () => {
  const dest = (k, label, cc, lat, lon) => ({ key: k, id: `ap:${k}`, label, cc, lat, lon });
  const trip = (to, min, czk) => ({ out: { from: 'PRG', to, durationMin: min }, back: { from: to, to: 'PRG' }, perPersonCzk: czk, destKey: to });
  const home = { lat: 50.0755, lon: 14.4378, label: 'Praha' };
  const origins = [{ iata: 'PRG', ground: { minutes: 40 } }];
  const vie = { dest: dest('VIE', 'Vídeň', 'AT', 48.1103, 16.5697), best: trip('VIE', 640, 5843), options: [trip('VIE', 640, 5843)] };
  const lis = { dest: dest('LIS', 'Lisabon', 'PT', 38.7742, -9.1342), best: trip('LIS', 180, 3000), options: [] };
  const flat = [vie.best, trip('VIE', 50, 10172), lis.best];
  const point = [{ id: 'ap:VIE', type: 'airport', label: 'Vídeň', cc: 'AT', lat: 48.1103, lon: 16.5697 }];
  const r = G.attachGround({ home, origins, groups: [vie, lis], flat, dests: point });
  assert.equal(lis.ground, undefined, 'Lisabon mimo dosah');
  assert.ok(vie.ground.doorMin >= 40 + 120 + 50 + 45 && vie.ground.doorMin < 360, `přímý let 50 min, ne nejlevnější s přestupem: ${vie.ground.doorMin}`);
  assert.equal(vie.ground.rule, 'time');
  assert.equal(vie.ground.q.to, 'ap:VIE');
  assert.match(vie.ground.q.from, /^geo:50\.0755,14\.4378\|Praha$/);
  assert.deepEqual([r.to, r.flightCzk, r.trips], ['Vídeň', 5843, 2]);
  // bez letů: srovnání pro cíl i tak (chytrá nápověda pak nabídne vlak/bus)
  const none = G.attachGround({ home, origins, groups: [], dests: point });
  assert.equal(none.flightCzk, null);
  assert.equal(none.worth, true);
  // odlet ze země (bez domova): z hlavního letiště odletu; kamkoliv (bez cíle) a země nic
  assert.equal(G.attachGround({ home: null, origins: [{ iata: 'PRG' }], groups: [], dests: point }).q.from, 'ap:PRG');
  assert.equal(G.attachGround({ home, origins, groups: [], dests: [] }), null);
  assert.equal(G.attachGround({ home, origins, groups: [], dests: [{ id: 'cc:AT', type: 'country', label: 'Rakousko' }] }), null);
});

/* ---------- dotaz /api/ground ---------- */
test('groundQuery: místa z ID aplikace i z polohy, kontrola data a počtu cestujících', () => {
  const q = G.groundQuery(new URLSearchParams(`from=ap:PRG&to=metro:PAR&date=${ymdPlus(5)}&adults=2&flightCzk=3500&trips=2`));
  assert.equal(q.from.label, 'Praha');
  assert.equal(q.to.cc, 'FR');
  assert.equal(q.adults, 2);
  assert.equal(q.flightCzk, 3500);
  assert.equal(q.trips, 2);
  assert.equal(q.live, true);
  const g = G.groundQuery(new URLSearchParams('from=geo:49.1951,16.6068|Brno&toLat=48.2&toLon=16.37&toName=<b>Vídeň</b>&toCc=at&live=0'));
  assert.equal(g.from.label, 'Brno');
  assert.equal(g.to.label, 'bVídeň/b', 'název bez znaků pro HTML');
  assert.equal(g.to.cc, 'AT');
  assert.equal(g.live, false);
  assert.equal(G.groundQuery(new URLSearchParams('from=VIE&to=BUD')).to.label, 'Budapešť');
  const bad = [
    'to=ap:VIE', 'from=ap:PRG', 'from=cc:CZ&to=ap:VIE', 'from=rg:kanary&to=ap:VIE', 'from=ap:XXX&to=ap:VIE', 'from=ap:PRG&toLat=99&toLon=10',
    'from=ap:PRG&toLat=abc&toLon=10', `from=ap:PRG&to=ap:VIE&date=${ymdPlus(-5)}`, `from=ap:PRG&to=ap:VIE&date=${ymdPlus(400)}`, 'from=ap:PRG&to=ap:VIE&date=2026-13-40',
    'from=ap:PRG&to=ap:VIE&adults=0', 'from=ap:PRG&to=ap:VIE&adults=10', 'from=ap:PRG&to=ap:VIE&adults=2x',
  ];
  for (const qs of bad) assert.throws(() => G.groundQuery(new URLSearchParams(qs)), G.GroundError, qs);
});

test('groundInfo: Praha → Vídeň s datem = odhad, srovnání, odkazy a živé spoje; Lisabon = mimo dosah', async () => {
  stub = stubFetch(() => ({ body: RJ_PRAHA_VIDEN }));
  const r = await G.groundInfo(G.groundQuery(new URLSearchParams('from=geo:50.0755,14.4378|Praha&to=ap:VIE&date=' + ymdPlus(7))));
  assert.ok(r.km > 200 && r.km < 300);
  assert.ok(r.est && r.est.minutes > 0 && r.est.czk > 0);
  assert.equal(r.worth.worth, true);
  assert.ok(r.links.some((x) => x.id === 'idos') && r.links.some((x) => x.id === 'google'));
  if (G.CITIES.length) {
    assert.equal(r.est.basis, 'measured');
    assert.equal(r.links[0].id, 'regiojet');
    assert.equal(r.live.ok, true);
  }
  const far = await G.groundInfo(G.groundQuery(new URLSearchParams('from=ap:PRG&to=ap:LIS&date=' + ymdPlus(7))));
  assert.equal(far.est, null);
  assert.equal(far.worth.worth, false);
  assert.match(far.why, /km vzdušnou čarou/);
  assert.deepEqual(far.links, []);
  assert.equal(far.live, undefined, 'mimo dosah se RegioJet neptá');
});
