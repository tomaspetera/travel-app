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
    ['Ajaccio (Korsika)', 'FR', 41.93, 8.74], ['Heraklion (Kréta)', 'GR', 35.34, 25.13], ['Olbia (Sardinie)', 'IT', 40.92, 9.5], ['Istanbul', 'TR', 41.01, 28.98], ['Marina di Campo (Elba)', 'IT', 42.76, 10.24],
  ];
  for (const [label, cc, lat, lon] of no) {
    const e = G.estimate(PRAHA, P(label, cc, lat, lon));
    assert.equal(e.ok, false, label);
    assert.ok(e.why, `${label}: proč`);
  }
  assert.match(G.estimate(PRAHA, P('Malta', 'MT', 35.9, 14.5)).why, /přes moře/);
  assert.match(G.estimate(PRAHA, P('Palma', 'ES', 39.57, 2.65)).why, /Baleáry – ostrov/);
  assert.match(G.estimate(PRAHA, P('Lisabon', 'PT', 38.72, -9.14)).why, /km vzdušnou čarou/);
  assert.match(G.estimate(PRAHA, P('Marina di Campo', 'IT', 42.76, 10.24)).why, /Elba – ostrov/);
  assert.match(G.estimate(PRAHA, P('Londýn', 'GB', 51.5, -0.13)).why, /Eurotunel/, 'do Británie vede tunel – ne „bez trajektu nejede“');
  // Pevnina: Split (Chorvatsko), Kodaň (mosty), Řím (~920 km)
  for (const [label, cc, lat, lon] of [['Split', 'HR', 43.51, 16.44], ['Kodaň', 'DK', 55.68, 12.57], ['Řím', 'IT', 41.9, 12.5]]) {
    assert.equal(G.estimate(PRAHA, P(label, cc, lat, lon)).ok, true, label);
  }
  assert.equal(G.estimate(PRAHA, P('Praha-Letňany', 'CZ', 50.13, 14.52)).ok, false, 'stejné místo');
});

test('estimate: přes Alpy a Dinárské hory o čtvrtinu déle (Klagenfurt není 5 h 50), rovina a švýcarská plošina ne', () => {
  // skutečnost 10/2026 (RegioJet, FlixBus, ÖBB): Praha–Klagenfurt ~7 h 30–8 h 30, Praha–Štýrský Hradec ~6 h 30
  const klu = G.estimate(PRAHA, P('Klagenfurt', 'AT', 46.62, 14.31));
  assert.equal(klu.hills, 'Alpy');
  assert.ok(klu.minutes >= 420 && klu.minutes <= 480, `Praha–Klagenfurt ${klu.minutes} min`);
  assert.notEqual(G.worth(klu).rule, 'short', 'už to není „cesta do 6,5 h“');
  assert.ok(G.estimate(PRAHA, P('Štýrský Hradec', 'AT', 47.07, 15.44)).minutes >= 360);
  assert.equal(G.estimate(PRAHA, P('Split', 'HR', 43.51, 16.44)).hills, 'Alpy', 'přímka vede nejdřív přes Alpy');
  assert.equal(G.estimate(BUDAPEST, P('Sarajevo', 'BA', 43.86, 18.41)).hills, 'Dinárské hory');
  assert.equal(G.estimate(VIDEN, P('Štýrský Hradec', 'AT', 47.07, 15.44)).hills, 'Alpy');
  // z Prahy vedou přímky do Curychu a Ženevy severně od Alp (přes plošinu), do Bělehradu přes Panonskou nížinu
  for (const [label, cc, lat, lon] of [['Mnichov', 'DE', 48.14, 11.58], ['Curych', 'CH', 47.38, 8.54], ['Ženeva', 'CH', 46.2, 6.15], ['Bělehrad', 'RS', 44.82, 20.46], ['Lyon', 'FR', 45.73, 4.83], ['Osijek', 'HR', 45.55, 18.69]]) {
    const e = G.estimate(PRAHA, P(label, cc, lat, lon));
    assert.equal(e.hills, undefined, label);
    assert.deepEqual([e.minutes, e.czk], [G.distanceModel(e.km).minutes, G.distanceModel(e.km).czk], `${label}: čistý model`);
  }
  // změřená cesta z Prahy zůstává změřená (Benátky 11 h 50)
  const vce = G.estimate(PRAHA, P('Benátky', 'IT', 45.48, 12.24, 10202080));
  assert.deepEqual([vce.basis, vce.minutes, vce.hills], ['measured', 710, undefined]);
  // model přes Alpy je blíž změřeným Benátkám než bez nich
  const plain = G.distanceModel(vce.km).minutes;
  const hilly = G.distanceModel(vce.km, G.MOUNTAIN_SLOW).minutes;
  assert.ok(Math.abs(hilly - 710) < Math.abs(plain - 710), `${hilly} vs ${plain}`);
});

test('estimate: na východě levné vlaky i dál než 450 km, na západě dražší; do Skandinávie po souši přes Øresund', () => {
  // RegioJet 13. 10. 2026: Praha–Košice 499 Kč, Praha–Varšava 499 Kč, Praha–Lvov 389 Kč, Praha–Düsseldorf 869 Kč
  for (const [label, cc, lat, lon, real] of [['Košice', 'SK', 48.72, 21.27, 499], ['Varšava', 'PL', 52.23, 21.0, 499], ['Lvov', 'UA', 49.84, 24.03, 389]]) {
    const e = G.estimate(PRAHA, P(label, cc, lat, lon));
    assert.ok(e.km > 450 && e.czk <= real * 1.45 && e.czk >= real * 0.8, `${label}: ${e.czk} Kč (RegioJet od ${real})`);
  }
  const dus = G.estimate(PRAHA, P('Düsseldorf', 'DE', 51.22, 6.79));
  assert.ok(Math.abs(dus.czk - 869) / 869 < 0.15, `Düsseldorf ${dus.czk} Kč`);
  assert.ok(G.estimate(VIDEN, P('Varšava', 'PL', 52.23, 21.0)).czk > 600, 'z Rakouska už ne levný východ');
  // Švédsko a Norsko: přes Øresundský most (a Göteborg, Oslo) – přímka přes moře by cestu zkrátila
  const mal = G.estimate(PRAHA, P('Malmö', 'SE', 55.6, 13.0));
  assert.equal(mal.ok, true);
  assert.ok(mal.minutes - G.distanceModel(mal.km).minutes <= 20, `Malmö leží u mostu: ${mal.minutes} min`);
  const klr = G.estimate(PRAHA, P('Kalmar', 'SE', 56.66, 16.36));
  assert.ok(klr.ok && klr.km < 760 && klr.minutes > G.distanceModel(klr.km).minutes + 60, `Kalmar ${klr.km} km, ${klr.minutes} min`);
  assert.equal(G.landKm(PRAHA, P('Kalmar', 'SE', 56.66, 16.36)), G.landKm(P('Kalmar', 'SE', 56.66, 16.36), PRAHA), 'oběma směry');
  for (const [label, lat, lon] of [['Kristiansand', 58.15, 8.0], ['Oslo-Torp', 59.19, 10.26]]) {
    const e = G.estimate(PRAHA, P(label, 'NO', lat, lon));
    assert.equal(e.ok, false, label);
    assert.match(e.why, /po souši přes Øresundský most/, label);
  }
  assert.equal(G.estimate(PRAHA, P('Stockholm', 'SE', 59.33, 18.07)).ok, false, 'Stockholm po souši přes 1100 km');
  const got = P('Göteborg', 'SE', 57.7, 11.97);
  const osl = P('Oslo', 'NO', 59.91, 10.75);
  assert.equal(G.landKm(got, osl), G.estimate(got, osl).km, 'uvnitř Skandinávie vzdušnou čarou');
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
  // letiště Basilej leží ve Francii, město ve Švýcarsku: Basilej (ne Mulhouse) – i v odkazech
  const bsl = G.groundPlace(G.pointOf('ap:BSL'));
  assert.deepEqual([bsl.label, bsl.cc, bsl.loc, bsl.tz], ['Basilej', 'CH', 'Basel', 'Europe/Zurich']);
  assert.equal(bsl.fb, '40de3026-8646-11e6-9066-549f350fcb0c', 'FlixBus Basel, ne Mulhouse');
  assert.equal(new URL(G.links(prg, bsl, '2026-11-20').find((l) => l.id === 'idos').url).searchParams.get('t'), 'Basel');
  // Lutych nemá ve městech záznam: nesmí dostat Maastricht v sousední zemi (do 30 km jen stejná země)
  const lgg = G.groundPlace(G.pointOf('ap:LGG'));
  assert.deepEqual([lgg.label, lgg.cc, lgg.fb, lgg.rj], ['Lutych', 'BE', null, null]);
  // RegioJet vede Kolín nad Rýnem jen jako zastávku letiště: v datech město Kolín (Köln) s ID RegioJetu i FlixBusu
  const cgn = G.groundPlace(G.pointOf('ap:CGN'));
  assert.deepEqual([cgn.label, cgn.loc, cgn.rj, Boolean(cgn.fb)], ['Kolín nad Rýnem', 'Köln', 241620000, true]);
  assert.deepEqual(G.links(prg, cgn, '2026-11-20').map((l) => l.id), ['regiojet', 'flixbus', 'idos', 'google']);
  assert.equal(new URL(G.links(prg, cgn, '2026-11-20').find((l) => l.id === 'idos').url).searchParams.get('t'), 'Köln');
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
  delete process.env.REGIOJET_MAX_PER_HOUR;
  process.env.REGIOJET_GAP_MS = '120';
  const at = [];
  stub = stubFetch(() => {
    at.push(Date.now());
    return { status: 503, body: 'nope' };
  });
  const err = await G.regiojet(1, 2, '2026-10-13');
  assert.equal(err.ok, false);
  assert.match(err.error, /neodpovídá/);
  assert.equal(stub.calls.length, 2, 'jedno opakování');
  assert.ok(at[1] - at[0] >= 110, `i opakování čeká na odstup: ${at[1] - at[0]} ms`);
  await G.regiojet(1, 2, '2026-10-13');
  assert.equal(stub.calls.length, 2, 'chyba se na chvíli pamatuje (RegioJet se nebombarduje)');
  stub.restore();

  // 4xx (např. 429 ochrana) se neopakuje
  G.resetRegiojet();
  process.env.REGIOJET_GAP_MS = '0';
  stub = stubFetch(() => ({ status: 429, body: 'slow down' }));
  assert.equal((await G.regiojet(1, 2, '2026-10-13')).ok, false);
  assert.equal(stub.calls.length, 1, '429 bez opakování');
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
  stub = stubFetch(() => ({ body: RJ_PRAHA_VIDEN })); // hledání se RegioJetu nikdy neptá (jen odhad bez sítě)
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
  // Místo ~55 km od města letiště (Hallstatt, let do Salcburku): vlakem/busem až do Hallstattu, letadlem přes Salcburk
  const szg = { dest: dest('SZG', 'Salcburk', 'AT', 47.7933, 13.0043), best: trip('SZG', 55, 2400), options: [] };
  const hal = [{ id: 'geo:47.5622,13.6493|Hallstatt', type: 'place', label: 'Hallstatt', lat: 47.5622, lon: 13.6493 }];
  const h = G.attachGround({ home, origins, groups: [szg], flat: [szg.best], dests: hal });
  assert.deepEqual([h.to, h.dest, h.q.to, h.flightCzk], ['Hallstatt', 'Hallstatt', 'geo:47.5622,13.6493|Hallstatt', 2400]);
  assert.equal(szg.ground.to, 'Salcburk', 'čip u skupiny zůstává k městu letiště');
  assert.ok(h.min > szg.ground.min && h.doorMin > szg.ground.doorMin, `do Hallstattu déle i letadlem (z letiště ještě ~55 km): ${h.min}/${h.doorMin} vs ${szg.ground.min}/${szg.ground.doorMin}`);
  // letiště u města (Vídeň-Schwechat ~18 km): odhad skupiny
  const v2 = G.attachGround({ home, origins, groups: [vie], flat, dests: [{ ...point[0], id: 'metro:VIE', type: 'metro', lat: 48.2082, lon: 16.3738 }] });
  assert.equal(v2.doorMin, vie.ground.doorMin);
  assert.equal(stub.calls.length, 0, 'žádný dotaz na RegioJet');
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

test('groundInfo: limit dotazů z jedné IP se ptá jen před skutečným dotazem na RegioJet (ne z mezipaměti, ne vypnuto)', async () => {
  if (!G.CITIES.length) return;
  stub = stubFetch(() => ({ body: RJ_PRAHA_VIDEN }));
  let asked = 0;
  const allow = (ok) => () => { asked++; return ok; };
  const q = (days) => G.groundQuery(new URLSearchParams(`from=ap:PRG&to=ap:VIE&date=${ymdPlus(days)}`));
  assert.equal((await G.groundInfo(q(7), { allowLive: allow(true) })).live.ok, true);
  assert.deepEqual([asked, stub.calls.length], [1, 1]);
  // totéž znovu (překreslení výsledků, znovu otevřené okno) – z mezipaměti, limit se nečerpá
  assert.equal((await G.groundInfo(q(7), { allowLive: allow(false) })).live.ok, true);
  assert.deepEqual([asked, stub.calls.length], [1, 1]);
  // jiný den po vyčerpání limitu: jen odhad a odkazy, RegioJet se neptá
  const lim = await G.groundInfo(q(8), { allowLive: allow(false) });
  assert.deepEqual([lim.live.ok, lim.live.busy, stub.calls.length], [false, true, 1]);
  assert.ok(lim.est && lim.links.length);
  // vypnuto: limit se vůbec neřeší
  process.env.REGIOJET_LIVE = '0';
  const off = await G.groundInfo(q(9), { allowLive: allow(false) });
  assert.deepEqual([off.live.off, asked, stub.calls.length], [true, 2, 1]);
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
