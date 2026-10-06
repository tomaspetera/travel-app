// Doprava na letiště (server/lib/access.js): veřejnou dopravou (kalibrace na cílové rozsahy z Prahy a Brna, příplatek
// za mezinárodní spoj, vypnutí, násobek jízdného), autem (palivo, parkování podle délky cesty, známky, odvoz u cesty
// jen tam), dřívější kmRate v Kč/km, optimalizátor s parkováním na cestu, hledání tam i zpět a přes víc měst autem
// (zástupné zdroje, žádná síť) a stejné výpočty v prohlížeči (public/js/searchhelp.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
const A = await import('../server/lib/access.js');
const { resolveOrigins } = await import('../server/lib/places.js');
const { hubsNear } = await import('../server/lib/longhaul.js');
const { bestRoundTrips } = await import('../server/lib/optimizer.js');
const { search, normalizeQuery } = await import('../server/lib/search.js');
const { makeLeg } = await import('../server/lib/fares.js');

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const H = ctx.window.SearchHelp;
const plain = (v) => JSON.parse(JSON.stringify(v));

// Výchozí místa tak, jak je vrací resolveOrigins: zadané letiště (ap:PRG = „Praha“), poloha (geo:) bez země.
const PRAHA = { lat: 50.1008, lon: 14.26, label: 'Praha', cc: 'CZ', iata: 'PRG' };
const PRAHA_GEO = { lat: 50.0755, lon: 14.4378, label: 'Praha' };
const BRNO = { lat: 49.1513, lon: 16.6944, label: 'Brno', cc: 'CZ', iata: 'BRQ' };
const BRATISLAVA = { lat: 48.1486, lon: 17.1077, label: 'Bratislava' };
const transit = (home, iata, opts) => A.airportAccess(home, iata, opts);
const car = (home, iata, opts = {}) => A.airportAccess(home, iata, { mode: 'car', ...opts });

test('veřejnou dopravou: cílové rozsahy na osobu jedním směrem z Prahy a z Brna', () => {
  const targets = [
    [PRAHA, 'PRG', 46, 100], [PRAHA, 'KLV', 180, 300], [PRAHA, 'PED', 170, 280], [PRAHA, 'DRS', 280, 450], [PRAHA, 'JCL', 200, 320],
    [PRAHA, 'MUC', 450, 800], [PRAHA, 'BER', 450, 800], [PRAHA, 'VIE', 350, 600],
    [BRNO, 'BRQ', 30, 60], [BRNO, 'VIE', 250, 450], [BRNO, 'BTS', 200, 400],
  ];
  for (const [home, iata, lo, hi] of targets) {
    for (const h of home === PRAHA ? [PRAHA, PRAHA_GEO] : [home]) {
      const g = transit(h, iata);
      assert.equal(g.mode, 'transit');
      assert.ok(g.czk >= lo && g.czk <= hi, `${h.label}${h.iata ? '' : ' (poloha)'} → ${iata}: ${g.czk} Kč mimo ${lo}–${hi}`);
      assert.equal(g.czk, g.breakdown.reduce((s, x) => s + x.czk, 0), 'součet rozpisu');
    }
  }
  // letiště ve městě: jen jízdenka MHD; jinde vlak/bus do města letiště + cesta z města na letiště
  const prg = transit(PRAHA, 'PRG');
  assert.deepEqual(prg.breakdown.map((x) => x.k), ['access']);
  assert.ok(prg.local && prg.minutes >= 40 && prg.minutes <= 70, `PRG ${prg.minutes} min`);
  assert.match(prg.breakdown[0].label, /PID/);
  const klv = transit(PRAHA, 'KLV');
  assert.deepEqual(klv.breakdown.map((x) => x.k), ['intercity', 'access']);
  assert.match(klv.breakdown[0].label, /^Praha → Karlovy Vary vlakem \/ busem$/);
  assert.ok(klv.minutes > 100 && klv.minutes < 200, `KLV ${klv.minutes} min`);
  // Mnichov: změřená cena Praha–Mnichov (299 Kč) + S-Bahn na letiště + mezinárodní spoj
  const muc = transit(PRAHA, 'MUC');
  assert.deepEqual(muc.breakdown.map((x) => [x.k, x.czk]), [['intercity', 300], ['access', 350], ['border', 60]]);
  // letiště za humny (blíž než jeho město): regionální spoj rovnou na letiště (Kladno → Ruzyně, Bratislava → Schwechat)
  assert.deepEqual(transit({ lat: 50.1473, lon: 14.1029, label: 'Kladno' }, 'PRG').breakdown.map((x) => x.k), ['regional']);
  const bv = transit(BRATISLAVA, 'VIE');
  assert.deepEqual(bv.breakdown.map((x) => x.k), ['regional', 'border']);
  assert.ok(bv.czk >= 100 && bv.czk <= 250, `Bratislava → VIE ${bv.czk}`);
});

test('příplatek za mezinárodní spoj: jen přes hranici, mezi Českem, Slovenskem, Polskem a Maďarskem menší', () => {
  const border = (h, iata) => transit(h, iata).breakdown.find((x) => x.k === 'border')?.czk || 0;
  for (const iata of ['PRG', 'KLV', 'PED', 'JCL', 'BRQ', 'OSR']) assert.equal(border(PRAHA, iata), 0, iata);
  assert.ok(border(PRAHA, 'DRS') >= 50 && border(PRAHA, 'VIE') >= 50 && border(PRAHA, 'BER') >= 50);
  assert.equal(border(BRNO, 'BTS'), 30);
  assert.equal(border(PRAHA, 'KTW'), 30);
  assert.equal(A.borderCzk('CZ', 'AT', 500), 100);
  assert.equal(A.borderCzk('CZ', 'DE', 100), 50);
  assert.equal(A.borderCzk('CZ', 'CZ', 500), 0);
});

test('násobek jízdného (kmRate) a vypnutá doprava', () => {
  const full = transit(PRAHA, 'DRS');
  const half = transit(PRAHA, 'DRS', { scale: 0.5 });
  assert.ok(Math.abs(half.czk - full.czk / 2) <= 20, `${half.czk} vs ${full.czk}`);
  const off = transit(PRAHA, 'DRS', { scale: 0 });
  assert.deepEqual([off.czk, off.off, off.breakdown.length], [0, true, 0]);
  assert.equal(off.minutes, full.minutes, 'čas zůstává (srovnání od dveří ke dveřím)');
  const carOff = car(PRAHA, 'VIE', { scale: 0, adults: 2 });
  assert.deepEqual([carOff.czk, carOff.off, A.parkCzk(carOff, 7)], [0, true, 0]);
  assert.equal(A.carTrip(carOff, 7).perPerson, 0);
});

test('autem: palivo tam i zpět, parkování podle nocí, známka – na osobu podle počtu cestujících', () => {
  const g = car(PRAHA_GEO, 'VIE', { adults: 2 });
  assert.equal(g.mode, 'car');
  assert.equal(g.carKmCzk, A.CAR_KM_CZK);
  assert.equal(g.fuelCzk, Math.round(g.roadKm * 2.6));
  assert.ok(g.roadKm > 280 && g.roadKm < 380, `silnice ${g.roadKm} km`);
  assert.deepEqual(plain(g.tolls).map((t) => t.cc), ['AT']);
  assert.equal(g.parkDayCzk, 300);
  // na let: palivo jedním směrem + půl známky, děleno 2 cestujícími
  assert.equal(g.czk, Math.round((g.fuelCzk + 320 / 2) / 2));
  // 7 nocí = 8 dní parkování; 12 nocí = 13 dní → známka na 10 dní nevystačí, druhá
  assert.equal(A.parkDays(7), 8);
  assert.equal(A.parkCzk(g, 7), Math.round((300 * 8) / 2));
  assert.equal(A.parkCzk(g, 12), Math.round((300 * 13 + 320) / 2));
  const t7 = A.carTrip(g, 7);
  assert.deepEqual([t7.days, t7.fuel, t7.park, t7.tolls], [8, 2 * g.fuelCzk, 2400, 320]);
  assert.equal(t7.total, 2 * g.fuelCzk + 2400 + 320);
  assert.equal(t7.perPerson, 2 * g.czk + A.parkCzk(g, 7));
  assert.ok(Math.abs(t7.perPerson - t7.total / 2) <= 1);
  // víc lidí v autě = levněji na osobu; delší cesta = dražší parkování
  const g4 = car(PRAHA_GEO, 'VIE', { adults: 4 });
  assert.ok(A.carTrip(g4, 7).perPerson < t7.perPerson / 1.9);
  assert.ok(A.carTrip(g, 14).perPerson > t7.perPerson + 1000);
  // Kč/km z formuláře
  assert.equal(car(PRAHA_GEO, 'VIE', { carKmCzk: 4 }).fuelCzk, g.roadKm * 4);
  // Praha → Ruzyně autem: palivo zanedbatelné, parkování ne
  const prg = A.carTrip(car(PRAHA, 'PRG', { adults: 1 }), 7);
  assert.ok(prg.park === 1600 && prg.fuel < 100 && prg.perPerson > 1600);
});

test('autem: dálniční známky a mýtné jen v cizině, cesta přes sousední země', () => {
  const cc = (home, iata) => plain(car(home, iata).tolls).map((t) => t.cc);
  assert.deepEqual(cc(PRAHA, 'VIE'), ['AT']);
  assert.deepEqual(cc(PRAHA, 'LNZ'), ['AT']);
  assert.deepEqual(cc(PRAHA, 'BTS'), ['SK']);
  assert.deepEqual(cc(PRAHA, 'BUD'), ['SK', 'HU'], 'do Budapešti přes Slovensko');
  assert.deepEqual(cc(PRAHA, 'LJU'), ['AT', 'SI']);
  assert.deepEqual(cc(PRAHA, 'MUC'), [], 'Německo pro auta bez známky');
  assert.deepEqual(cc(PRAHA, 'KTW'), [], 'Polsko (A1) bez poplatku');
  assert.deepEqual(cc(PRAHA, 'PRG'), [], 'domácí známku máš');
  assert.deepEqual(cc(BRATISLAVA, 'PRG'), ['CZ'], 'ze Slovenska do Česka česká známka');
  assert.deepEqual(A.tollsOn('CZ', 'HR').map((t) => [t.cc, t.days]), [['AT', 10], ['SI', 7], ['HR', 0]]);
  // Lublaň na 8 nocí: slovinská známka na 7 dní nevystačí, rakouská na 10 ano
  const lju = car(PRAHA, 'LJU', { adults: 1 });
  assert.equal(A.parkCzk(lju, 8), lju.parkDayCzk * 9 + 400);
});

test('autem jen tam: odvoz – palivo tam i zpět, celá známka, bez parkování', () => {
  const g = car(PRAHA_GEO, 'VIE', { adults: 2, oneWay: true });
  assert.equal(g.dropOff, true);
  assert.equal(g.czk, Math.round((2 * g.fuelCzk + 320) / 2));
  assert.equal(A.parkCzk(g, 7), 0);
  const t = A.carTrip(g, 7);
  assert.deepEqual([t.days, t.park, t.perPerson, t.total], [0, 0, g.czk, 2 * g.fuelCzk + 320]);
});

test('dotaz: groundMode, kmRate jako násobek, carKmCzk; dřívější kmRate v Kč/km (uložená hledání, odkazy)', () => {
  const n = (raw) => plain(A.normalizeAccess(raw));
  assert.deepEqual(n({}), { groundMode: 'transit', kmRate: 1, carKmCzk: 2.6 });
  // bez groundMode = dřívější Kč/km s výchozími 1,1 → násobek 1
  assert.equal(n({ kmRate: 1.1 }).kmRate, 1);
  assert.equal(n({ kmRate: '1.1' }).kmRate, 1);
  assert.equal(n({ kmRate: 2.2 }).kmRate, 2);
  assert.equal(n({ kmRate: 0 }).kmRate, 0);
  // s groundMode je kmRate rovnou násobek
  assert.equal(n({ kmRate: 1.1, groundMode: 'transit' }).kmRate, 1.1);
  assert.equal(n({ kmRate: 0.5, groundMode: 'car' }).kmRate, 0.5);
  assert.equal(n({ kmRate: 9, groundMode: 'transit' }).kmRate, 5);
  assert.equal(n({ kmRate: 'x', groundMode: 'transit' }).kmRate, 1);
  assert.equal(n({ groundMode: 'letadlo' }).groundMode, 'transit');
  assert.equal(n({ groundMode: 'car' }).groundMode, 'car');
  assert.deepEqual([n({ carKmCzk: 3.14 }).carKmCzk, n({ carKmCzk: 50 }).carKmCzk, n({ carKmCzk: 0.1 }).carKmCzk, n({ carKmCzk: 'x' }).carKmCzk, n({ carKmCzk: -1 }).carKmCzk], [3.1, 10, 0.5, 2.6, 2.6]);
  // normalizeQuery: totéž u hledání i u cesty přes víc měst
  const q = normalizeQuery({ from: ['ap:PRG'], kmRate: 1.1 });
  assert.deepEqual([q.groundMode, q.kmRate, q.carKmCzk], ['transit', 1, 2.6]);
  const qc = normalizeQuery({ from: ['ap:PRG'], groundMode: 'car', kmRate: 1, carKmCzk: 3 });
  assert.deepEqual([qc.groundMode, qc.kmRate, qc.carKmCzk], ['car', 1, 3]);
  const D = ymdPlus(20);
  const qm = normalizeQuery({ trip: 'multi', groundMode: 'car', legs: [{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['ap:FCO'], to: ['ap:PRG'], date: D }] });
  assert.equal(qm.groundMode, 'car');
});

test('prohlížeč: stejné parkování a cesta autem jako server, štítky letišť, starší uložený formulář', () => {
  for (const [g, nights] of [[car(PRAHA_GEO, 'VIE', { adults: 2 }), 7], [car(PRAHA_GEO, 'VIE', { adults: 3 }), 12], [car(PRAHA, 'LJU'), 8],
    [car(PRAHA, 'PRG', { adults: 4 }), 0], [car(PRAHA, 'VIE', { oneWay: true, adults: 2 }), 5], [car(PRAHA, 'ZAG', { adults: 2 }), 9]]) {
    const x = plain(g);
    assert.equal(H.parkCzk(x, nights), A.parkCzk(g, nights));
    assert.deepEqual(plain(H.carTrip(x, nights)), plain(A.carTrip(g, nights)));
  }
  assert.equal(H.parkDays(3), A.parkDays(3));
  // štítky: veřejnou dopravou tam, autem i s parkováním na N dní, odvoz
  const t = H.accessLabel(plain(transit(PRAHA, 'KLV')));
  assert.equal(t.text, '~220 Kč/os. tam');
  assert.match(t.title, /^Veřejnou dopravou: Praha → Karlovy Vary vlakem \/ busem ~190 Kč \+ MHD Karlovy Vary ~30 Kč = ~220 Kč na osobu jedním směrem \(zpět totéž\)/);
  const c = H.accessLabel(plain(car(PRAHA_GEO, 'VIE', { adults: 2 })), { nights: 7 });
  assert.match(c.text, /^~[\d\s ]+ Kč\/os\. vč\. parkování na 8 dní$/);
  assert.match(c.title, /palivo tam i zpět \d+ km × 2,6 Kč = ~[\d\s ]+ Kč \+ parkování ~300 Kč\/den × 8 dní = ~2[\s ]400 Kč \+ dálniční známka Rakousko \(10 dní\) ~320 Kč/);
  assert.match(H.accessLabel(plain(car(PRAHA_GEO, 'VIE', { adults: 2 })), { nights: 2 }).text, /na 3 dny$/);
  assert.match(H.accessLabel(plain(car(PRAHA_GEO, 'VIE', { oneWay: true }))).text, /\(odvoz\)$/);
  assert.equal(H.accessLabel(plain(transit(PRAHA, 'KLV', { scale: 0 }))), null, 'vypnuto → bez ceny');
  assert.equal(H.accessLabel(null), null);
  // starší uložené hledání / hlídaná cena: kmRate v Kč/km bez groundMode
  assert.deepEqual(plain(H.groundForm({ ground: true, kmRate: 1.1 })), { ground: true, kmRate: 1, groundMode: 'transit' });
  assert.equal(H.groundForm({ kmRate: 2.2 }).kmRate, 2);
  assert.equal(H.groundForm({ kmRate: 0 }).kmRate, 0);
  const now = { ground: true, kmRate: 1.1, groundMode: 'transit' };
  assert.equal(H.groundForm(now), now, 'nový formulář beze změny');
  assert.equal(H.groundForm(null), null);
});

test('prohlížeč: dvojice samostatných letenek autem – parkování na celou cestu a návrat na letiště, kde auto stojí', () => {
  const leg = (from, to, date, czk, groundCzk) => ({ from, to, date, dep: `${date}T10:00:00`, arr: `${date}T12:00:00`, hasTime: true, czk, groundCzk, bagCzk: 0, provider: 'kiwi', carrier: 'FR' });
  const D = '2026-11-10', B = '2026-11-14';
  const ot = { out: leg('PRG', 'BCN', D, 1000, 40), destKey: 'BCN' };
  const bt = { back: leg('BCN', 'PRG', B, 1100, 40), destKey: 'BCN' };
  const park = (iata, n) => (iata === 'PRG' ? 100 * (n + 1) : 0);
  const c = H.composeTrip(ot, bt, { adults: 2, openJaw: true, park });
  assert.deepEqual([c.groundCzk, c.parkCzk, c.perPersonCzk], [40 + 40 + 500, 500, 2100 + 580]);
  // jiné letiště návratu: veřejnou dopravou (open-jaw) ano, autem ne
  const other = { back: leg('BCN', 'PED', B, 900, 60), destKey: 'BCN' };
  assert.ok(H.composeTrip(ot, other, { openJaw: true }));
  assert.equal(H.composeTrip(ot, other, { openJaw: true, park }), null);
});

test('resolveOrigins a přestupní letiště: doprava podle zvoleného způsobu', () => {
  const r = resolveOrigins(['ap:PRG'], { radiusKm: 200 });
  assert.deepEqual([r.home.label, r.home.cc, r.home.iata], ['Praha', 'CZ', 'PRG']);
  const prg = r.airports.find((a) => a.iata === 'PRG');
  assert.deepEqual([prg.ground.mode, prg.ground.czk], ['transit', 50]);
  const klv = r.airports.find((a) => a.iata === 'KLV');
  assert.ok(klv.ground.czk >= 180 && klv.ground.czk <= 300, `KLV ${klv.ground.czk}`);
  const rc = resolveOrigins(['ap:PRG'], { radiusKm: 200, access: { mode: 'car', adults: 2, carKmCzk: 3 } });
  assert.ok(rc.airports.every((a) => a.ground.mode === 'car' && a.ground.adults === 2 && a.ground.carKmCzk === 3 && a.ground.parkDayCzk > 0));
  const off = resolveOrigins(['ap:PRG'], { radiusKm: 200, access: { scale: 0 } });
  assert.ok(off.airports.every((a) => a.ground.czk === 0 && a.ground.off));
  // země bez výchozího místa: bez dopravy
  assert.ok(resolveOrigins(['cc:CZ'], { radiusKm: 0 }).airports.every((a) => a.ground === null));
  const hubs = hubsNear(r.home, new Set(['PRG']), { access: { mode: 'car', adults: 2 } });
  assert.ok(hubs.length && hubs.every((h) => h.hub && h.ground.mode === 'car' && h.ground.czk > 0));
});

test('optimalizátor: parkování autem patří k cestě podle počtu nocí, ne k letišti', () => {
  const leg = (from, to, date, czk) => ({ from, to, date, dep: `${date}T08:00`, czk, provider: 'x', carrier: 'FR', live: true });
  const D = '2026-11-10';
  const plus = (n) => new Date(Date.parse(`${D}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  // PRG: dražší letenky, levné parkování; VIE: letenky o 400 Kč levnější každým směrem, drahé parkování
  const outs = [leg('PRG', 'BCN', D, 1300), leg('VIE', 'BCN', D, 900)];
  const backs = [2, 10].flatMap((n) => [leg('BCN', 'PRG', plus(n), 1300), leg('BCN', 'VIE', plus(n), 900)]);
  const parkDay = { PRG: 50, VIE: 300 };
  const park = (iata, n) => parkDay[iata] * (n + 1);
  const best = (nights, withPark) => bestRoundTrips(outs, backs, () => 0, { nightsMin: nights, nightsMax: nights, openJawHome: false, ...(withPark ? { park } : {}) })[0];
  // bez parkování vždy Vídeň; s parkováním: na 2 noci ještě Vídeň (800 Kč úspory > 900 − 150), na 10 nocí Praha
  assert.equal(best(2, false).out.from, 'VIE');
  assert.equal(best(10, false).out.from, 'VIE');
  assert.equal(best(2, true).out.from, 'VIE');
  assert.equal(best(10, true).out.from, 'PRG');
  // kalendář: nejlevnější cesta i s parkováním
  const cal = { out: new Map(), back: new Map() };
  bestRoundTrips(outs, backs, () => 0, { nightsMin: 10, nightsMax: 10, openJawHome: false, park, calendar: cal });
  assert.equal(cal.out.get(D).cost, 2600 + 50 * 11);
});

/* ---------- hledání se zástupným zdrojem (bez sítě) ---------- */
function stubProvider(id, fares) {
  return {
    id, name: id, live: true,
    async stations() { return null; },
    async routes() { return null; },
    callsPerRoute: () => 1,
    async daily({ from, to, dateFrom, dateTo }) {
      return fares.filter((f) => f.from === from && f.to === to && f.date >= dateFrom && f.date <= dateTo)
        .map((f) => makeLeg({ provider: id, carrier: 'W6', carrierName: id, from: f.from, to: f.to, dep: `${f.date}T${f.dep}:00`, arr: `${f.date}T${f.arr}:00`, czk: f.czk, bookUrl: 'https://example.com/' }));
    },
  };
}
const fare = (from, to, date, czk, dep = '08:00', arr = '10:30') => ({ from, to, date, dep, arr, czk });
const fxStub = () => stubFetch((url) => (url.includes('open.er-api.com') ? { body: { result: 'success', rates: { EUR: 1, CZK: 25 } } } : { status: 404, body: '{}' }));

test('hledání tam i zpět autem: palivo + parkování podle nocí v ceně, návrat jen na letiště, kde auto stojí', async () => {
  const fx = fxStub();
  const D = ymdPlus(30);
  const B = new Date(Date.parse(`${D}T12:00:00Z`) + 4 * 864e5).toISOString().slice(0, 10);
  const world = [fare('PRG', 'BCN', D, 1500), fare('BCN', 'PRG', B, 1500), fare('PED', 'BCN', D, 1200), fare('BCN', 'PED', B, 1200),
    fare('BCN', 'KLV', B, 400)]; // levný návrat do Karlových Varů – veřejnou dopravou open-jaw, autem ne
  const p = stubProvider('stub', world);
  const base = { from: ['ap:PRG'], to: ['ap:BCN'], radiusKm: 120, trip: 'return', dateFrom: D, dateTo: D, nightsMin: 3, nightsMax: 5, adults: 2 };
  try {
    const rc = await search({ ...base, groundMode: 'car', kmRate: 1 }, () => {}, { providers: [p], hubs: false });
    assert.deepEqual([rc.query.groundMode, rc.query.kmRate, rc.query.carKmCzk], ['car', 1, 2.6]);
    assert.ok(rc.top.length >= 2);
    const g = (iata) => rc.origins.find((o) => o.iata === iata).ground;
    assert.ok(rc.origins.every((o) => o.ground.mode === 'car'));
    for (const t of rc.top) {
      assert.equal(t.back.to, t.out.from, 'autem zpět na letiště odletu');
      const pk = A.parkCzk(g(t.out.from), 4);
      assert.equal(t.parkCzk, pk);
      assert.equal(t.groundCzk, 2 * g(t.out.from).czk + pk);
      assert.equal(t.perPersonCzk, t.flightCzk + t.groundCzk);
    }
    // veřejnou dopravou: open-jaw návrat do KLV je ve hře, bez parkování
    const rt = await search({ ...base, groundMode: 'transit', kmRate: 1 }, () => {}, { providers: [p], hubs: false });
    const oj = rt.top.find((t) => t.back.to === 'KLV');
    assert.ok(oj, 'open-jaw návrat veřejnou dopravou');
    const gt = (iata) => rt.origins.find((o) => o.iata === iata).ground.czk;
    assert.equal(oj.groundCzk, gt(oj.out.from) + gt('KLV'));
    assert.ok(rt.top.every((t) => !t.parkCzk));
    // „Je to dobrá cena?“ i skóre výhodnosti srovnávají jen letenku – stejný let autem i veřejnou dopravou stejně
    const same = (r) => r.top.find((t) => t.out.from === 'PRG' && t.back.to === 'PRG');
    assert.ok(same(rc).groundCzk > same(rt).groundCzk);
    assert.deepEqual([same(rc).priceLevel.ref, same(rc).priceLevel.vsRef], [same(rt).priceLevel.ref, same(rt).priceLevel.vsRef]);
    assert.equal(same(rc).deal.score, same(rt).deal.score);
    // dřívější kmRate 1,1 bez groundMode = výchozí odhad veřejnou dopravou
    const legacy = await search({ ...base, kmRate: 1.1 }, () => {}, { providers: [p], hubs: false });
    assert.deepEqual([legacy.query.groundMode, legacy.query.kmRate], ['transit', 1]);
    assert.deepEqual(legacy.top.map((t) => t.perPersonCzk), rt.top.map((t) => t.perPersonCzk));
    // vypnuto
    const r0 = await search({ ...base, kmRate: 0 }, () => {}, { providers: [p], hubs: false });
    assert.ok(r0.top.every((t) => t.groundCzk === 0 && t.perPersonCzk === t.flightCzk));
    // jen tam autem = odvoz (palivo tam i zpět, bez parkování)
    const ow = await search({ ...base, trip: 'oneway', groundMode: 'car' }, () => {}, { providers: [p], hubs: false });
    const t1 = ow.top[0];
    const go = ow.origins.find((o) => o.iata === t1.out.from).ground;
    assert.ok(go.dropOff && !t1.parkCzk);
    assert.equal(t1.groundCzk, go.czk);
  } finally {
    fx.restore();
  }
});

test('cesta přes víc měst autem s návratem domů: palivo u 1. letu a návratu, parkování na celou cestu u 1. letu', async () => {
  const fx = fxStub();
  const D = ymdPlus(40);
  const D2 = new Date(Date.parse(`${D}T12:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10);
  const p = stubProvider('stub', [fare('PRG', 'FCO', D, 1000), fare('NAP', 'PRG', D2, 1100, '18:00', '20:30')]);
  try {
    const res = await search({
      trip: 'multi', adults: 2, radiusKm: 0, groundMode: 'car', kmRate: 1,
      legs: [{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['ap:NAP'], to: ['ap:PRG'], date: D2 }],
    }, () => {}, { providers: [p] });
    const g = res.origins.find((o) => o.iata === 'PRG').ground;
    assert.equal(g.mode, 'car');
    assert.equal(g.dropOff, false);
    const first = res.legs[0].options[0];
    const last = res.legs[1].options[0];
    assert.equal(first.groundCzk, g.czk + A.parkCzk(g, 6), 'palivo tam + parkování na 6 nocí');
    assert.equal(last.groundCzk, g.czk, 'palivo zpět');
    assert.equal(res.combos[0].groundCzk, 2 * g.czk + A.parkCzk(g, 6));
    assert.equal(res.query.groundMode, 'car');
    // okruh letišť: nejlevnější kombinace se vrací na letiště, kde auto parkuje (ne odlet z KLV a návrat do PRG)
    const world = [fare('PRG', 'FCO', D, 1000), fare('KLV', 'FCO', D, 500), fare('NAP', 'PRG', D2, 1100, '18:00', '20:30'), fare('NAP', 'KLV', D2, 1400, '17:00', '19:30')];
    const wide = { trip: 'multi', adults: 2, radiusKm: 120, legs: [{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['ap:NAP'], to: ['ap:PRG'], date: D2 }] };
    const rc = await search({ ...wide, groundMode: 'car' }, () => {}, { providers: [stubProvider('stub', world)] });
    const ends = (r, c) => [r.legs[0].options[c.picks[0]].out.from, r.legs[1].options[c.picks[1]].out.to];
    assert.ok(rc.combos.length >= 2 && rc.combos.every((c) => { const [a, b] = ends(rc, c); return a === b; }), JSON.stringify(rc.combos.map((c) => ends(rc, c))));
    const rt = await search({ ...wide, groundMode: 'transit' }, () => {}, { providers: [stubProvider('stub', world)] });
    assert.deepEqual(ends(rt, rt.combos[0]), ['KLV', 'PRG'], 'veřejnou dopravou smí návrat jinam');
    // bez návratu domů: odvoz na začátku cesty
    const ow = await search({
      trip: 'multi', adults: 2, radiusKm: 0, groundMode: 'car',
      legs: [{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['ap:NAP'], to: ['ap:BCN'], date: D2 }],
    }, () => {}, { providers: [stubProvider('stub', [fare('PRG', 'FCO', D, 1000), fare('NAP', 'BCN', D2, 900)])] });
    const go = ow.origins.find((o) => o.iata === 'PRG').ground;
    assert.equal(go.dropOff, true);
    assert.equal(ow.legs[0].options[0].groundCzk, go.czk);
  } finally {
    fx.restore();
  }
});
