// Integrační test: server v DEMO režimu (ATLAS_MOCK=1) – API, streamované hledání, statické soubory.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function rawGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function searchStream(body) {
  const r = await fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /ndjson/);
  const lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
  return { progress: lines.filter((l) => l.type === 'progress'), last: lines.at(-1) };
}

test('GET /api/health', async () => {
  const j = await (await fetch(`${base}/api/health`)).json();
  assert.equal(j.ok, true);
  assert.equal(j.demo, true);
  assert.ok(j.providers.length >= 1);
});

test('GET /healthz a /api/diag (ostrý test zdrojů)', async () => {
  const h = await fetch(`${base}/healthz`);
  assert.equal(h.status, 200);
  assert.equal(await h.text(), 'ok');
  const d = await (await fetch(`${base}/api/diag`)).json();
  assert.equal(d.demo, true);
  assert.ok(d.providers.length >= 1);
  assert.ok(d.providers.every((p) => p.ok && p.detail));
  const bad = await rawGet('/%E0%A4%A');
  assert.equal(bad.status, 400);
});

test('GET /api/places a /api/origins', async () => {
  const p = await (await fetch(`${base}/api/places?q=brno&remote=0`)).json();
  assert.equal(p.items[0].id, 'ap:BRQ');
  const o = await (await fetch(`${base}/api/origins?from=ap:BRQ&radius=150`)).json();
  assert.ok(o.airports.some((a) => a.iata === 'VIE'));
  assert.ok(o.airports.every((a) => a.city && a.lat));
});

test('GET /api/origins – doprava na letiště: veřejnou dopravou, autem s parkováním, dřívější kmRate, vypnuto', async () => {
  const get = async (qs) => (await fetch(`${base}/api/origins?from=ap:PRG&radius=200&${qs}`)).json();
  const t = await get('groundMode=transit&kmRate=1');
  assert.deepEqual(t.access, { groundMode: 'transit', kmRate: 1, carFuel: 'diesel', carCons: 6, carPrice: null, carKmCzk: null, accessOverride: null, adults: 1, nights: 7, trip: 'return', fuelCc: 'CZ' });
  const prg = t.airports.find((a) => a.iata === 'PRG');
  assert.deepEqual([prg.ground.mode, prg.ground.czk, prg.ground.local], ['transit', 50, true]);
  for (const a of t.airports) {
    assert.ok(a.ground.czk > 0 && a.ground.minutes > 0 && a.ground.km >= 0, a.iata);
    assert.ok(Array.isArray(a.ground.breakdown) && a.ground.breakdown.every((x) => typeof x.label === 'string' && x.czk > 0));
  }
  // dřívější odkaz s kmRate 1,1 (Kč/km) bez groundMode = výchozí odhad
  const legacy = await get('kmRate=1.1');
  assert.equal(legacy.access.kmRate, 1);
  assert.deepEqual(legacy.airports.map((a) => a.ground.czk), t.airports.map((a) => a.ground.czk));
  // autem (dřívější odkaz jen s Kč/km), 2 lidé, 5 nocí: rozpis za auto i celá cesta na osobu
  const c = await get('groundMode=car&carKmCzk=3&adults=2&nights=5');
  assert.deepEqual([c.access.groundMode, c.access.carFuel, c.access.carKmCzk, c.access.adults, c.access.nights], ['car', null, 3, 2, 5]);
  for (const a of c.airports) {
    const g = a.ground;
    assert.equal(g.mode, 'car');
    // Pardubice: parkování zdarma (P1 + P2 bez rezervace, airport-pardubice.cz, ověřeno 10/2026), jinde základ + za den
    const freePark = a.iata === 'PED';
    assert.ok(g.roadKm > 0 && g.fuelCzk === Math.round(g.roadKm * 3) && Array.isArray(g.tolls) && g.adults === 2);
    // Karlovy Vary: 500 Kč za každých započatých 8 dní (parkBlockDays), ne za den
    assert.ok(freePark ? g.parkBaseCzk === 0 && g.parkDayCzk === 0 : g.parkBaseCzk > 0 && (g.parkDayCzk > 0 || g.parkBlockDays === 8), a.iata);
    assert.deepEqual(g.breakdown.map((x) => x.k), ['fuel', 'park', ...g.tolls.map(() => 'toll')]);
    assert.equal(g.trip.days, 6);
    assert.equal(g.trip.park, g.parkBaseCzk + g.parkDayCzk * 6);
    assert.equal(g.trip.perPerson, 2 * g.czk + Math.round((g.parkBaseCzk + g.parkDayCzk * 6 + g.tolls.filter((x) => x.days && x.days < 6).reduce((s, x) => s + x.czk, 0)) / 2));
  }
  // jen tam autem = odvoz
  const ow = await get('groundMode=car&trip=oneway');
  assert.ok(ow.airports.every((a) => a.ground.dropOff && a.ground.trip.days === 0));
  assert.equal(ow.access.nights, null);
  // vypnuto
  const off = await get('groundMode=transit&kmRate=0');
  assert.ok(off.airports.every((a) => a.ground.czk === 0 && a.ground.off));
});

test('🏠 vlastní cena na letiště: /api/origins (own=VIE:350) i hledání (accessOverride) – místo odhadu, oba směry, bez násobku', async () => {
  const get = async (qs) => (await fetch(`${base}/api/origins?from=ap:PRG&radius=300&${qs}`)).json();
  const est = await get('groundMode=transit&kmRate=0.5');
  // kontrola jako u hledání: kód letiště (i malými), celé Kč 0–5 000; neplatné položky pryč
  const own = await get('groundMode=transit&kmRate=0.5&own=VIE:350,prg:0,BRQ:5001,XX:1,DRS:12.5,KTW:-5');
  assert.deepEqual(own.access.accessOverride, { PRG: 0, VIE: 350 });
  const g = (r, iata) => r.airports.find((a) => a.iata === iata).ground;
  // vlastní cena bez násobku jízdného (0,5), čas zůstává z odhadu, rozpis „vlastní cena“, odhad pro srovnání
  assert.deepEqual([g(own, 'VIE').czk, g(own, 'VIE').own, g(own, 'VIE').estCzk, g(own, 'VIE').minutes], [350, true, g(est, 'VIE').czk, g(est, 'VIE').minutes]);
  assert.deepEqual(g(own, 'VIE').breakdown, [{ k: 'own', label: 'vlastní cena', czk: 350 }]);
  assert.deepEqual([g(own, 'PRG').czk, g(own, 'PRG').own], [0, true], '0 Kč = někdo tě odveze');
  assert.deepEqual(g(own, 'BRQ'), g(est, 'BRQ'), 'neplatná cena → odhad');
  // autem a s vypnutou dopravou se vlastní cena nepoužije
  const car = await get('groundMode=car&own=VIE:350');
  assert.equal(car.access.accessOverride, null);
  assert.ok(!g(car, 'VIE').own && g(car, 'VIE').mode === 'car');
  assert.ok(!g(await get('groundMode=transit&kmRate=0&own=VIE:350'), 'VIE').own);
  // hledání: cena cesty s vlastní cenou tam i zpět (na osobu), letiště v náhledu s ní; starší dotaz bez pole = odhad
  const body = { from: ['ap:PRG', 'ap:VIE'], to: [], radiusKm: 0, dateFrom: ymdPlus(10), dateTo: ymdPlus(40), trip: 'return', nightsMin: 2, nightsMax: 5, adults: 1, groundMode: 'transit', kmRate: 1 };
  const r = (await searchStream({ ...body, accessOverride: { VIE: 350, PRG: 0 } })).last.result;
  assert.deepEqual(r.query.accessOverride, { PRG: 0, VIE: 350 });
  assert.equal(r.origins.find((o) => o.iata === 'VIE').ground.czk, 350);
  const trips = [...(r.top || []), ...r.groups.flatMap((x) => [x.best, ...(x.options || [])])].filter(Boolean);
  const viaVie = trips.filter((t) => t.out.from === 'VIE' && t.back && t.back.to === 'VIE');
  const viaPrg = trips.filter((t) => t.out.from === 'PRG' && t.back && t.back.to === 'PRG');
  assert.ok(viaVie.length && viaPrg.length, 'DEMO má lety z Vídně i z Prahy');
  assert.ok(viaVie.every((t) => t.groundCzk === 700), 'VIE tam i zpět 2 × 350 Kč');
  assert.ok(viaPrg.every((t) => t.groundCzk === 0), 'PRG 0 Kč');
  const plainR = (await searchStream(body)).last.result;
  assert.equal(plainR.query.accessOverride, null);
  assert.ok(!plainR.origins.some((o) => o.ground.own));
});

test('GET /api/origins a /api/nearby – autem podle pohonu: nafta, benzín, elektro, vlastní cena a spotřeba, meze (DEMO ceny)', async () => {
  const get = async (qs) => (await fetch(`${base}/api/origins?from=ap:PRG&radius=200&groundMode=car&adults=2&${qs}`)).json();
  const fuelOf = (a) => a.ground.breakdown.find((x) => x.k === 'fuel');
  // výchozí nafta (i bez carFuel) za cenu z fuel.js (DEMO pevná 50,65 Kč/l)
  for (const qs of ['carFuel=diesel', '']) {
    const d = await get(qs);
    assert.deepEqual([d.access.carFuel, d.access.carCons, d.access.carPrice, d.access.carKmCzk], ['diesel', 6, null, null]);
    for (const a of d.airports) {
      const f = fuelOf(a);
      assert.deepEqual([f.fuel, f.cons, f.unit, f.price, f.priceLabel, f.kmCzk, f.custom, f.country, f.source],
        ['diesel', 6, 'l', 50.65, 'nafta 50,65 Kč/l · DEMO – pevná cena', 3.039, false, 'CZ', 'demo'], a.iata);
      assert.equal(f.fuelCzk, Math.round(a.ground.roadKm * 3.039));
      assert.deepEqual([a.ground.fuelCzk, f.czk, a.ground.carFuel, a.ground.carKmCzk], [f.fuelCzk, f.fuelCzk, 'diesel', 3.039]);
      assert.equal(f.label, `palivo jedním směrem (${a.ground.roadKm} km × 6 l/100 km × 50,65 Kč/l)`);
      assert.equal(a.ground.trip.fuel, 2 * f.fuelCzk);
    }
  }
  // benzín se spotřebou 8 l a elektro s 17 kWh/100 km (16 Kč/kWh, ceníky k 6. 10. 2026)
  const p = await get('carFuel=petrol&carCons=8');
  assert.deepEqual([fuelOf(p.airports[0]).price, fuelOf(p.airports[0]).kmCzk, fuelOf(p.airports[0]).priceLabel], [45.87, 3.6696, 'benzín N95 45,87 Kč/l · DEMO – pevná cena']);
  const e = await get('carFuel=ev&carCons=17');
  for (const a of e.airports) {
    const f = fuelOf(a);
    assert.deepEqual([f.fuel, f.cons, f.unit, f.price, f.kmCzk, f.date, f.source], ['ev', 17, 'kWh', 16, 2.72, '2026-10-06', 'ev']);
    assert.equal(f.priceLabel, 'nabíjení DC ~16 Kč/kWh (ceníky ČEZ, PRE, E.ON, IONITY, Tesla – stav 6. 10. 2026)');
    assert.equal(a.ground.fuelCzk, Math.round(a.ground.roadKm * 2.72));
    // parkování platí i elektroauto (Pardubice zdarma pro všechny – airport-pardubice.cz, ověřeno 10/2026)
    assert.ok(a.iata === 'PED' ? a.ground.parkDayCzk === 0 : a.ground.parkDayCzk > 0 || a.ground.parkBlockDays > 0, a.iata);
  }
  // vlastní cena a meze (spotřeba 0 = výchozí, cena 999 → 40 Kč/kWh)
  const own = await get('carFuel=ev&carCons=0&carPrice=999');
  assert.deepEqual([own.access.carCons, own.access.carPrice], [19, 40]);
  assert.deepEqual([fuelOf(own.airports[0]).price, fuelOf(own.airports[0]).custom, fuelOf(own.airports[0]).priceLabel], [40, true, 'nabíjení 40 Kč/kWh · vlastní cena']);
  const bad = await get('carFuel=lpg&carCons=abc&carPrice=-1');
  assert.deepEqual([bad.access.carFuel, bad.access.carCons, bad.access.carPrice], ['diesel', 6, null]);
  // s carFuel se dřívější carKmCzk nepoužije
  const both = await get('carFuel=petrol&carKmCzk=9');
  assert.deepEqual([both.access.carFuel, both.access.carKmCzk, fuelOf(both.airports[0]).fuel], ['petrol', null, 'petrol']);
  // země domova: poloha bez kódu země ve Vídni → rakouská nafta; access.fuelCc = stejná země pro řádek ceny ve formuláři
  const vie = await (await fetch(`${base}/api/origins?from=${encodeURIComponent('geo:48.2082,16.3738|Vídeň')}&radius=80&groundMode=car&carFuel=diesel`)).json();
  assert.equal(vie.access.fuelCc, 'AT');
  assert.ok(vie.airports.length && vie.airports.every((a) => fuelOf(a).country === 'AT' && fuelOf(a).price === 55.11));
  assert.equal(fuelOf(vie.airports[0]).priceLabel, 'nafta 55,11 Kč/l v Rakousku · DEMO – pevná cena');
  // vlastní cena nebo elektroauto: položka bez země, fuelCc zůstává (aktuální cena ve formuláři pro srovnání)
  const vieEv = await (await fetch(`${base}/api/origins?from=${encodeURIComponent('geo:48.2082,16.3738|Vídeň')}&radius=80&groundMode=car&carFuel=ev`)).json();
  assert.deepEqual([vieEv.access.fuelCc, fuelOf(vieEv.airports[0]).country, fuelOf(vieEv.airports[0]).price], ['AT', null, 16]);
  assert.equal((await (await fetch(`${base}/api/origins?from=${encodeURIComponent('geo:45.46,9.19|Milán')}&radius=60&groundMode=car`)).json()).access.fuelCc, 'IT', 'země EU z bulletinu');
  assert.equal((await (await fetch(`${base}/api/origins?from=${encodeURIComponent('geo:44.79,20.45|Bělehrad')}&radius=60&groundMode=car`)).json()).access.fuelCc, 'CZ', 'země bez ceny (mimo EU) → Česko');
  // /api/nearby: stejné volby (výchozí veřejnou dopravou)
  const near = await (await fetch(`${base}/api/nearby?lat=50.0755&lon=14.4378&radius=150`)).json();
  assert.ok(near.items.length && near.items.every((x) => x.ground.mode === 'transit'));
  assert.deepEqual([near.access.groundMode, near.access.fuelCc], ['transit', 'CZ']);
  const nc = await (await fetch(`${base}/api/nearby?lat=50.0755&lon=14.4378&radius=150&groundMode=car&carFuel=ev&carPrice=9.5&adults=3&nights=4`)).json();
  assert.deepEqual([nc.access.carFuel, nc.access.carPrice, nc.access.adults, nc.access.nights], ['ev', 9.5, 3, 4]);
  for (const x of nc.items) {
    const f = x.ground.breakdown[0];
    assert.deepEqual([x.ground.mode, f.fuel, f.price, f.kmCzk, x.ground.adults, x.ground.trip.days], ['car', 'ev', 9.5, 1.805, 3, 5]);
  }
  const nl = await (await fetch(`${base}/api/nearby?lat=50.0755&lon=14.4378&radius=150&groundMode=car&carKmCzk=2`)).json();
  assert.ok(nl.items.every((x) => x.ground.carFuel === null && x.ground.fuelCzk === x.ground.roadKm * 2));
});

test('POST /api/search – kamkoliv, zpáteční, průběh se streamuje', async () => {
  const { progress, last } = await searchStream({ from: ['ap:BRQ'], radiusKm: 150, dateFrom: ymdPlus(10), dateTo: ymdPlus(40), trip: 'return', nightsMin: 2, nightsMax: 6, adults: 2 });
  assert.ok(progress.length >= 1);
  assert.equal(last.type, 'result');
  const r = last.result;
  assert.equal(r.mode, 'explore');
  assert.equal(r.demo, true);
  assert.ok(r.groups.length > 10);
  const prices = r.groups.map((g) => g.best.perPersonCzk);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'seřazeno od nejlevnějšího');
  for (const g of r.groups.slice(0, 20)) {
    const t = g.best;
    assert.ok(t.nights >= 2 && t.nights <= 6);
    assert.equal(t.totalCzk, t.perPersonCzk * 2);
    assert.equal(t.perPersonCzk, t.flightCzk, 'cena nabídky = letenka');
    assert.equal(t.tripCzk, t.flightCzk + t.groundCzk + (t.arrCzk || 0), 's dopravou na letiště zvlášť');
    assert.ok(r.origins.some((o) => o.iata === t.out.from));
  }
  // „Odkud se vyplatí letět“: minimum za letiště ze všech nabídek (server), skupiny s minimem z každého letiště
  for (const o of r.origins) assert.ok(o.best === null || (o.best.czk > 0 && o.best.n > 0), JSON.stringify(o.best));
  for (const o of r.origins.filter((x) => x.best)) {
    const mins = r.groups.map((g) => g.fromBest[o.iata]).filter((x) => x != null);
    assert.equal(o.best.czk, Math.min(...mins), o.iata);
  }
  for (const g of r.groups) {
    // nejlepší s návratem na jiné letiště (kombinace z už stažených letů) k žádnému letišti nepatří – z letiště je dražší
    const min = Math.min(...Object.values(g.fromBest));
    if (g.best.back.to === g.best.out.from) assert.equal(min, g.best.perPersonCzk, g.dest.key);
    else assert.ok(min >= g.best.perPersonCzk, g.dest.key);
    assert.ok(Object.keys(g.fromBest).every((k) => r.origins.some((o) => o.iata === k)));
  }
  // Kamkoliv: nejlevnější nabídka některých cílů je kombinace dvou aerolinek nebo s návratem na jiné letiště
  assert.ok(r.groups.some((g) => g.best.provider === 'mix' || g.best.back.to !== g.best.out.from));
  assert.ok(r.origins.filter((o) => o.best).length >= 2);
});

test('POST /api/search – kamkoliv přes 150 cílů: cena letiště jen z cílů, které odpověď nese', async () => {
  const { last } = await searchStream({ from: ['ap:PRG'], radiusKm: 300, dateFrom: ymdPlus(5), dateTo: ymdPlus(60), trip: 'return', nightsMin: 3, nightsMax: 8, adults: 2, kmRate: 1, groundMode: 'car', carFuel: 'diesel', arrival: true, openJaw: true });
  const r = last.result;
  assert.equal(r.groups.length, 150, 'odpověď je oříznutá na 150 cílů');
  for (const o of r.origins.filter((x) => x.best)) {
    const mins = r.groups.map((g) => g.fromBest[o.iata]).filter((x) => x != null);
    assert.equal(o.best.czk, Math.min(...mins), o.iata);
  }
});

test('POST /api/search – „Odkud se vyplatí letět“ u konkrétního cíle s návratem na jiné letiště: cena letiště = výpis po klepnutí', async () => {
  // veřejnou dopravou je open-jaw doma zapnutý – většina nabídek letí z jednoho letiště a vrací se na jiné
  const { last } = await searchStream({ from: ['ap:BRQ'], to: ['metro:LON'], radiusKm: 200, dateFrom: ymdPlus(7), dateTo: ymdPlus(60), trip: 'return', nightsMin: 5, nightsMax: 9, adults: 2, kmRate: 1, groundMode: 'transit', arrival: true });
  const r = last.result;
  assert.equal(r.mode, 'route');
  assert.ok(r.top.some((t) => t.back.to !== t.out.from), 've výpisu jsou i nabídky s návratem na jiné letiště');
  assert.ok(r.origins.filter((o) => o.best).length >= 2);
  // výpis jako v prohlížeči: top + nejlevnější cesty buněk mřížky termínů (SearchHelp.gridTrips)
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
  const top = ctx.window.SearchHelp.gridTrips(JSON.parse(JSON.stringify(r))).top;
  assert.ok(top.length > r.top.length, 's cestami buněk');
  for (const o of r.origins) {
    // klepnutí na letiště = filtr letišť bez všech ostatních (UI baseOk): odlet i návrat na tomto letišti
    const vis = top.filter((t) => t.out.from === o.iata && t.back.to === o.iata);
    if (!o.best) { assert.equal(vis.length, 0, o.iata); continue; }
    assert.ok(vis.length > 0 && o.best.n >= vis.length, o.iata);
    assert.equal(o.best.czk, Math.round(Math.min(...vis.map((t) => t.perPersonCzk))), o.iata);
  }
});

test('POST /api/search – konkrétní cíl, víkend, kalendář', async () => {
  const { last } = await searchStream({ from: ['ap:VIE'], to: ['metro:LON'], radiusKm: 200, dateFrom: ymdPlus(7), dateTo: ymdPlus(60), trip: 'return', nightsMin: 1, nightsMax: 3, outDays: [4, 5, 6], backDays: [0, 1] });
  const r = last.result;
  assert.equal(r.mode, 'route');
  assert.ok(r.top.length > 0);
  for (const t of r.top) {
    assert.ok(['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN'].includes(t.out.to));
    assert.match(t.out.fromTz, /^Europe\//);
    assert.deepEqual([t.out.toTz, t.back.fromTz], ['Europe/London', 'Europe/London'], 'zóny letišť pro export do kalendáře');
    assert.ok([4, 5, 6].includes(new Date(t.out.date + 'T12:00:00Z').getUTCDay()));
    assert.ok([0, 1].includes(new Date(t.back.date + 'T12:00:00Z').getUTCDay()));
  }
  assert.ok(r.calendar.out.length > 0);
  assert.ok(r.calendar.out.every((d) => [4, 5, 6].includes(new Date(d.date + 'T12:00:00Z').getUTCDay())));
  // „Je to dobrá cena?“: statistika ze všech nabídek trasy, úroveň u každé nabídky, žádné protichůdné štítky
  const st = r.priceStats;
  assert.ok(st.n >= r.top.length && st.min <= st.p25 && st.p25 <= st.median && st.median <= st.p75 && st.p75 <= st.max, JSON.stringify(st));
  assert.equal(r.groups[0].priceStats.n, st.n, 'jeden cíl (Londýn): statistika skupiny = statistika trasy');
  assert.ok(st.dateFrom <= st.dateTo && st.mins.every(([from, m, czk]) => r.origins.some((o) => o.iata === from) && /^\d{4}-\d{2}$/.test(m) && czk >= st.min));
  assert.ok(r.top.some((t) => t.flightCzk === st.min));
  for (const t of r.top) {
    assert.ok(['low', 'normal', 'high'].includes(t.priceLevel.level) && t.priceLevel.reason.length > 10, JSON.stringify(t.priceLevel));
    assert.equal(t.priceLevel.n, st.n);
    if (['super', 'good'].includes(t.deal.level)) assert.equal(t.priceLevel.level, 'low', '🔥/👍 jen u dobré ceny');
  }
});

test('POST /api/search – DEMO autem: elektroauto / benzín s vlastní cenou v ceně cesty, dřívější carKmCzk', async () => {
  const q = { from: ['ap:PRG'], to: ['ap:BCN'], radiusKm: 120, dateFrom: ymdPlus(10), dateTo: ymdPlus(30), trip: 'return', nightsMin: 3, nightsMax: 5, adults: 2, groundMode: 'car', kmRate: 1 };
  const ev = (await searchStream({ ...q, carFuel: 'ev', carCons: 18 })).last.result;
  assert.deepEqual([ev.query.carFuel, ev.query.carCons, ev.query.carPrice, ev.query.carKmCzk], ['ev', 18, null, null]);
  assert.ok(ev.top.length > 0);
  for (const o of ev.origins) {
    const f = o.ground.breakdown[0];
    assert.deepEqual([f.fuel, f.unit, f.price, f.kmCzk], ['ev', 'kWh', 16, 2.88], o.iata);
  }
  for (const t of ev.top) {
    const g = ev.origins.find((o) => o.iata === t.out.from).ground;
    // Pardubice parkování zdarma (airport-pardubice.cz, ověřeno 10/2026) → parkCzk chybí
    assert.equal(t.groundCzk, 2 * g.czk + (t.parkCzk ?? 0), 'nabíjení tam i zpět + parkování');
  }
  const pe = (await searchStream({ ...q, carFuel: 'petrol', carCons: 7, carPrice: 40 })).last.result;
  assert.deepEqual([pe.origins[0].ground.breakdown[0].priceLabel, pe.origins[0].ground.carKmCzk], ['benzín N95 40,00 Kč/l · vlastní cena', 2.8]);
  const old = (await searchStream({ ...q, carKmCzk: 2.6 })).last.result;
  assert.deepEqual([old.query.carFuel, old.query.carKmCzk, old.origins[0].ground.fuelCzk], [null, 2.6, Math.round(old.origins[0].ground.roadKm * 2.6)]);
});

test('POST /api/search – kamkoliv: statistika cen u každého cíle, trasa ne', async () => {
  const r = (await searchStream({ from: ['ap:BRQ'], radiusKm: 150, dateFrom: ymdPlus(10), dateTo: ymdPlus(40), trip: 'oneway' })).last.result;
  assert.equal(r.priceStats, null);
  for (const g of r.groups.slice(0, 30)) {
    assert.ok(g.priceStats.n >= g.options.length && g.priceStats.min === g.minFlightCzk, g.dest.label);
    for (const t of g.options) {
      assert.equal(t.priceLevel.n, g.priceStats.n);
      if (t.priceLevel.n < 5) assert.equal(t.priceLevel.basis, 'distance', 'málo nabídek → jen podle vzdálenosti');
    }
  }
});

test('POST /api/search – DEMO: přesná data i s lety s přestupem (časy přestupů pro filtr), nejlevnější let dne zůstává přímý', async () => {
  const body = { from: ['ap:BRQ'], to: ['metro:LON'], radiusKm: 200, trip: 'return' };
  const r = (await searchStream({ ...body, exactOut: ymdPlus(20), exactBack: ymdPlus(27) })).last.result;
  const legs = r.top.flatMap((t) => [t.out, t.back]);
  const conn = legs.filter((l) => l.stops > 0);
  assert.ok(conn.length > 0 && legs.some((l) => !l.stops), 'přímé i s přestupem');
  for (const l of conn) {
    assert.equal(l.layovers.length, l.stops);
    assert.ok(l.layovers.every((x) => /^[A-Z]{3}$/.test(x.at) && x.min >= 45 && x.min < l.durationMin), JSON.stringify(l.layovers));
    assert.ok(l.layovers.every((x) => /^[A-Z]{2}$/.test(x.cc)), 'země přestupu (vstupní podmínky pro tranzit)');
  }
  const flex = (await searchStream({ ...body, dateFrom: ymdPlus(10), dateTo: ymdPlus(40), nightsMin: 3, nightsMax: 7 })).last.result;
  assert.ok(flex.top.length > 0 && flex.top.every((t) => !t.out.stops && !t.back.stops), 'přestupní varianta je v demu vždy dražší');
});

test('GET /api/climate – letiště, poloha, země; kontrola vstupu a dlouhá cache', async () => {
  const r = await fetch(`${base}/api/climate?iata=bkk`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /max-age=\d{6,}/);
  const j = await r.json();
  assert.equal(j.iata, 'BKK');
  assert.ok([j.hi, j.lo, j.p].every((a) => a.length === 12));
  assert.ok(j.hi[0] >= 28);
  assert.ok(['wmo', 'ghcn'].includes(j.src), j.src);
  assert.match(j.source, /meteostanice/);
  const rho = await (await fetch(`${base}/api/climate?iata=RHO`)).json();
  assert.equal(rho.src, 'nasa', 'Rhodos stanici nemá');
  assert.match(rho.source, /NASA POWER/);
  const cc = await (await fetch(`${base}/api/climate?cc=TH`)).json();
  assert.deepEqual(cc.hi, j.hi, 'země = její hlavní letiště');
  assert.equal(cc.city, 'Bangkok');
  const pt = await (await fetch(`${base}/api/climate?lat=50.08&lon=14.42`)).json();
  assert.ok(pt.hi[6] > pt.hi[0]);
  // země bez údajů (Andorra…): žádná chyba – detail země se ptá u každé a 404 by plnila konzoli prohlížeče
  for (const q of ['?cc=AD', '?cc=XX']) {
    const x = await fetch(`${base}/api/climate${q}`);
    assert.equal(x.status, 200, q);
    assert.deepEqual(await x.json(), { none: true }, q);
  }
  for (const [q, status] of [['', 400], ['?iata=XXX', 400], ['?iata=12', 400], ['?cc=XYZ', 400], ['?lat=95&lon=0', 400], ['?lat=abc&lon=1', 400], ['?lat=50', 400], ['?lat=0&lon=-30', 404], ['?month=13', 400], ['?month=', 400], ['?month=x', 400]]) {
    const x = await fetch(`${base}/api/climate${q}`);
    assert.equal(x.status, status, q);
    assert.match((await x.json()).error, /\S/);
    assert.equal(x.headers.get('cache-control'), 'no-store', 'chyby se necachují');
  }
});

test('GET /api/climate?month= – měsíc ve všech zemích pro Doporučení: u moře, hlavní letiště, vzdálenost z Prahy', async () => {
  const r = await fetch(`${base}/api/climate?month=11`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /max-age=\d{6,}/);
  const j = await r.json();
  assert.equal(j.m, 11);
  assert.equal(j.ref, 'PRG');
  assert.ok(Object.keys(j.countries).length > 150);
  const { ES, NO, EG, HR, CZ } = j.countries;
  // Španělsko: hlavní letiště Madrid je v listopadu chladné, Kanáry teplé a suché – podle nich „k moři“
  assert.equal(ES.city, 'Madrid');
  assert.ok(ES.hi < 18, `Madrid ${ES.hi}`);
  assert.equal(ES.sea.rg, 'kanary');
  assert.ok(ES.sea.hi >= 23 && ES.sea.p < 50 && ES.sea.hiPrev >= 25, JSON.stringify(ES.sea));
  // Norsko oblast u moře nemá a v listopadu je tam zima; Chorvatské pobřeží už studené
  assert.equal(NO.sea, undefined);
  assert.ok(NO.hi < 8);
  assert.ok(HR.sea.hi < 20, JSON.stringify(HR.sea));
  assert.equal(EG.sea.rg, 'egypt-more');
  assert.ok(EG.km > 2500 && EG.km < 3500, `Hurghada ${EG.km} km`);
  assert.equal(CZ.km, 0);
});

test('POST /api/search – za teplem: jen teplé cíle, teplota u každé cesty, méně dotazů', async () => {
  const body = { from: ['ap:BRQ'], radiusKm: 150, dateFrom: ymdPlus(10), dateTo: ymdPlus(40), trip: 'return', nightsMin: 3, nightsMax: 8 };
  const all = (await searchStream(body)).last.result;
  const warm = (await searchStream({ ...body, minTemp: 20 })).last.result;
  assert.equal(all.warm, null);
  assert.ok(all.groups.every((g) => g.options.every((t) => t.tempHi == null || Number.isInteger(t.tempHi))));
  assert.ok(all.groups.some((g) => g.best.tempHi < 20), 'bez filtru i chladnější cíle');
  assert.equal(warm.query.minTemp, 20);
  assert.equal(warm.warm.minTemp, 20);
  assert.ok(warm.groups.length > 0 && warm.stats.trips < all.stats.trips);
  for (const g of warm.groups) {
    assert.ok(g.options.every((t) => t.tempHi >= 20), g.dest.label);
    assert.equal(g.dest.climate.hi, g.best.tempHi);
    assert.equal(g.dest.climate.m, Number(g.best.out.date.slice(5, 7)));
  }
  const calls = (r) => r.providers.reduce((s, p) => s + p.calls, 0);
  assert.ok(calls(warm) < calls(all), 'trasy do chladných cílů se neprohledávají');
});

test('POST /api/search – za teplem přes víc měsíců: levnější chladné termíny nevytlačí teplé', async () => {
  // Cíl, kde je teplo jen v prvních týdnech, nesmí v delším hledání zmizet jen proto, že jeho
  // nejlevnější termíny vyšly na chladnější měsíce (a filtr je pak vyřadil).
  const body = { from: ['ap:PRG'], to: ['cc:ES', 'cc:IT', 'cc:GR', 'cc:PT', 'cc:TR', 'cc:EG', 'cc:MA', 'cc:AE'], radiusKm: 0, trip: 'oneway', minTemp: 20, dateFrom: ymdPlus(10) };
  const short = (await searchStream({ ...body, dateTo: ymdPlus(30) })).last.result;
  const long = (await searchStream({ ...body, dateTo: ymdPlus(100) })).last.result;
  assert.ok(short.groups.length > 0 && long.groups.length < 150);
  const found = new Set(long.groups.map((g) => g.dest.key));
  assert.deepEqual(short.groups.filter((g) => !found.has(g.dest.key)).map((g) => g.dest.label), []);
});

test('POST /api/search – konkrétní cíl za teplem: kalendář i nabídky jen v dost teplých měsících', async (t) => {
  const dateFrom = ymdPlus(10);
  const dateTo = ymdPlus(70);
  const clim = await (await fetch(`${base}/api/climate?iata=AYT`)).json();
  const months = new Set();
  for (let i = 10; i <= 70; i++) months.add(Number(ymdPlus(i).slice(5, 7)));
  const his = [...months].map((m) => clim.hi[m - 1]);
  const minTemp = Math.min(35, Math.max(...his));
  if (minTemp < 15 || Math.min(...his) >= minTemp) return t.skip('v těchto měsících je v Antalyi stejně teplo');
  const r = (await searchStream({ from: ['ap:PRG'], to: ['ap:AYT'], radiusKm: 0, dateFrom, dateTo, trip: 'return', nightsMin: 3, nightsMax: 7, minTemp })).last.result;
  assert.equal(r.mode, 'route');
  assert.ok(r.top.length > 0 && r.top.every((x) => x.tempHi >= minTemp));
  const cal = [...r.calendar.out, ...r.calendar.back];
  assert.ok(cal.length > 0);
  for (const d of cal) assert.ok(clim.hi[Number(d.outDate.slice(5, 7)) - 1] >= minTemp, `kalendář: ${d.date} (odlet ${d.outDate})`);
});

test('POST /api/search – chybějící odkud → srozumitelná chyba', async () => {
  const { last } = await searchStream({ to: ['cc:ES'] });
  assert.equal(last.type, 'error');
  assert.match(last.error, /odkud/i);
});

test('POST /api/search – cesta přes víc měst (DEMO): průběh po letech, lety na úsek, návaznosti a nejlevnější cesty', async () => {
  const d1 = ymdPlus(30);
  const d2 = ymdPlus(35);
  const { progress, last } = await searchStream({
    trip: 'multi', adults: 2, radiusKm: 200,
    legs: [{ from: ['ap:PRG'], to: ['ap:BLQ'], date: d1 }, { from: ['ap:FLR'], to: ['ap:PRG'], date: d2, flexDays: 1 }],
  });
  assert.equal(last.type, 'result');
  assert.ok(progress.length >= 2 && progress.every((p) => Array.isArray(p.legs) && p.legs.length === 2));
  assert.deepEqual(progress[0].legs.map((l) => l.label), ['Praha → Boloňa', 'Florencie → Praha']);
  const r = last.result;
  assert.equal(r.mode, 'multi');
  assert.equal(r.destination.label, 'Praha → Boloňa · Florencie → Praha');
  assert.equal(r.returnsHome, true);
  assert.equal(r.legs.length, 2);
  assert.ok(r.legs.every((l) => l.options.length > 0));
  assert.ok(r.legs[0].options.every((o) => o.out.date === d1 && o.out.to === 'BLQ'));
  assert.ok(r.legs[1].options.every((o) => o.out.from === 'FLR' && o.out.date >= ymdPlus(34) && o.out.date <= ymdPlus(36)));
  assert.equal(r.links.length, 1);
  assert.ok(r.combos.length > 0);
  const c = r.combos[0];
  assert.equal(c.perPersonCzk, r.legs[0].options[c.picks[0]].perPersonCzk + r.legs[1].options[c.picks[1]].perPersonCzk);
  assert.equal(c.totalCzk, c.perPersonCzk * 2);
  assert.ok(r.origins.some((o) => o.iata === 'PRG'));
  // země cíle a místa odletu (open-jaw) – vstupní podmínky pro všechny země cesty
  assert.deepEqual([r.legs[0].dest.cc, r.legs[0].fromCc, r.legs[1].fromCc], ['IT', null, 'IT']);
  // chyby: jeden let, země jako cíl
  const one = await searchStream({ trip: 'multi', legs: [{ from: ['ap:PRG'], to: ['ap:BLQ'], date: d1 }] });
  assert.equal(one.last.type, 'error');
  assert.match(one.last.error, /aspoň 2 lety/);
  const cc = await searchStream({ trip: 'multi', legs: [{ from: ['ap:PRG'], to: ['cc:IT'], date: d1 }, { from: ['ap:FLR'], to: ['ap:PRG'], date: d2 }] });
  assert.match(cc.last.error, /1\. let: zadej konkrétní město/);
});

test('statické soubory, data a ochrana proti path traversal', async () => {
  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  const page = await html.text();
  assert.match(page, /<title>ATLAS/);
  assert.ok(page.indexOf('js/alerts.js') > 0 && page.indexOf('js/alerts.js') < page.indexOf('js/flights.js'), 'hlídání cen se načte před flights.js');
  assert.equal((await fetch(`${base}/js/alerts.js`)).status, 200);
  assert.ok(page.indexOf('js/searchhelp.js') > 0 && page.indexOf('js/searchhelp.js') < page.indexOf('js/flights.js'), 'pomoc s výsledky se načte před flights.js');
  assert.equal((await fetch(`${base}/js/searchhelp.js`)).status, 200);
  assert.ok(page.indexOf('js/pricecheck.js') > 0 && page.indexOf('js/pricecheck.js') < page.indexOf('js/flights.js'), '„Je to dobrá cena?“ se načte před flights.js');
  assert.equal((await fetch(`${base}/js/pricecheck.js`)).status, 200);
  // 📌 odložené nabídky: po pomoci s výsledky (stáří cen), před flights.js i zálohou
  assert.ok(page.indexOf('js/pins.js') > page.indexOf('js/searchhelp.js') && page.indexOf('js/pins.js') < page.indexOf('js/flights.js') && page.indexOf('js/pins.js') < page.indexOf('js/backup.js'), 'pins.js po searchhelp.js, před flights.js a backup.js');
  assert.equal((await fetch(`${base}/js/pins.js`)).status, 200);
  assert.match(page, /id="smartGuide"/, 'průvodce „Jak hledat chytře“ na stránce letů');
  const c =await (await fetch(`${base}/data/countries.json`)).json();
  assert.ok(c.length > 150);
  // vstupní podmínky: zvlášť, komprimované a s hodinovou cache; entry.js po app.js a před trip.js (ten načte lazy.js
  // až po všech skriptech stránky)
  const e = await fetch(`${base}/data/entry.json`, { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(e.status, 200);
  assert.equal(e.headers.get('content-encoding'), 'gzip');
  assert.match(e.headers.get('cache-control'), /max-age=3600/);
  const ej = await e.json();
  assert.equal(ej.countries.length, c.length);
  assert.ok(page.indexOf('<script src="js/entry.js">') > page.indexOf('<script src="js/app.js">'), 'entry.js po app.js');
  assert.match(page, /<script src="js\/lazy\.js" data-later="[^"]*\bjs\/trip\.js\b/, 'trip.js odložený (lazy.js) – po entry.js');
  assert.ok(!page.includes('<script src="js/trip.js">'));
  assert.equal((await fetch(`${base}/js/entry.js`)).status, 200);
  assert.match(page, /id="sgEntry"/, 'vstupní podmínky v průvodci „Jak hledat chytře“');
  // fetch() by „..“ normalizoval, proto surový HTTP požadavek.
  for (const p of ['/../server/config.js', '/%2e%2e%2fserver%2fconfig.js', '/..%2f..%2f.env']) {
    const { status, body } = await rawGet(p);
    assert.ok(!body.includes('export const config'), `${p} nesmí vrátit zdrojový kód serveru`);
    assert.ok(status === 403 || status === 404, `${p}: ${status}`);
  }
  const js = await fetch(`${base}/js/flights.js`, { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(js.status, 200);
  assert.equal(js.headers.get('content-encoding'), 'gzip');
  // prohlížeč s brotli dostane menší soubor (zkomprimovaný jednou, z paměti), Vary pro mezipaměti
  const br = await fetch(`${base}/js/flights.js`, { headers: { 'accept-encoding': 'br, gzip' } });
  assert.equal(br.headers.get('content-encoding'), 'br');
  assert.equal(br.headers.get('vary'), 'Accept-Encoding');
  assert.ok(+br.headers.get('content-length') < +js.headers.get('content-length'), 'brotli menší než gzip');
  assert.match(await br.text(), /window\.Flights = \{/);
});

// Klíče objektu „window.X = { … }“ v nejvyšší úrovni (zkratky i „klíč: …“), bez obsahu funkcí v něm.
function exportKeys(src, name) {
  const i = src.indexOf(`window.${name} = {`);
  assert.ok(i >= 0, `window.${name} = {`);
  const keys = [];
  let depth = 0, expect = false;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    const ch = src[j];
    if (ch === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
    if (ch === "'" || ch === '"' || ch === '`') { j = src.indexOf(ch, j + 1); continue; } // řetězce v exportu jsou jednoduché
    if ('{(['.includes(ch)) { depth++; if (depth === 1) expect = true; continue; }
    if ('})]'.includes(ch)) { if (--depth === 0) break; continue; }
    if (depth === 1 && ch === ',') { expect = true; continue; }
    if (depth === 1 && expect && /[A-Za-z_$]/.test(ch)) { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(j)); keys.push(m[0]); j += m[0].length - 1; expect = false; }
  }
  return keys;
}

test('moduly volají jen to, co window.Flights vystavuje (spojení větví: chybějící Flights.ageCheck by shodilo go(\'flights\'))', () => {
  const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
  const keys = exportKeys(src('flights.js'), 'Flights');
  for (const k of ['init', 'ageCheck', 'renderFav', 'refreshPrefs', 'renderPins', 'refreshPins', 'refreshOrigins', 'refreshVisited', 'repaintMap']) assert.ok(keys.includes(k), k);
  const files = readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'flights.js');
  assert.ok(files.includes('app.js') && files.includes('backup.js'));
  for (const f of files) {
    const used = [...new Set([...src(f).matchAll(/\bFlights\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
    assert.deepEqual(used.filter((k) => !keys.includes(k)), [], `${f}: Flights.… bez exportu`);
  }
});

test('moduly volají jen to, co window.Trip vystavuje; „cena z …“ v otevřeném průvodci se obnoví při návratu do aplikace i 5min tikem; hláška bez tlačítka klepnutí propustí', () => {
  const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
  const keys = exportKeys(src('trip.js'), 'Trip');
  for (const k of ['start', 'render', 'ageRefresh', 'finalStats', 'statsGiveUp']) assert.ok(keys.includes(k), k);
  const files = readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'trip.js');
  for (const f of files) {
    const used = [...new Set([...src(f).matchAll(/\bTrip\.(?!com\b)([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))]; // Trip.com = web, ne modul
    assert.deepEqual(used.filter((k) => !keys.includes(k)), [], `${f}: Trip.… bez exportu`);
  }
  // stáří cen na obrazovce (flights.js): výsledky na Letech i cena letu v průvodci, při návratu do aplikace a každých 5 min
  const fl = src('flights.js'), i = fl.indexOf('function ageTick() {'), tick = fl.slice(i, fl.indexOf('\n  }\n', i));
  assert.ok(i > 0 && tick.includes('ageCheck();') && tick.includes('window.Trip.ageRefresh()'), tick);
  assert.match(fl, /document\.addEventListener\('visibilitychange', \(\) => \{\n\s+ageTick\(\);/);
  assert.match(fl, /setInterval\(ageTick, 5 \* 60e3\)/);
  // „Pro nákup klepni znovu“ (Koupit u starých cen): hláška přes tlačítko nad spodní lištou druhé klepnutí nechytí
  const css = readFileSync(new URL('../public/css/trip.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.toast:not(:has(.toast-act)){pointer-events:none}'));
});

test('POST /api/roadtrip – jednodenní výlety i okruh s přespáním (DEMO)', async () => {
  const post = (body) => fetch(`${base}/api/roadtrip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const start = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const day = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 2, mode: 'day' })).json();
  assert.equal(day.demo, true);
  assert.equal(day.mode, 'day');
  assert.ok(day.days.length >= 1);
  assert.ok(day.days.every((d) => d.back && !d.overnight && d.stops.length));
  const loop = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 3, mode: 'loop', exclude: ['demoTrip0'] })).json();
  assert.equal(loop.mode, 'loop');
  assert.ok(loop.days.length >= 2);
  assert.ok(loop.days[0].overnight?.bookUrl.includes('booking.com'));
  assert.ok(!loop.days.flatMap((d) => d.stops).some((s) => s.id === 'demoTrip0'), 'vyřazený cíl v plánu není');
  const bad = await post({ lat: 'x', start });
  assert.equal(bad.status, 400);
  const tr = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 2, mode: 'day', transport: 'transit' })).json();
  assert.equal(tr.transport, 'transit', 'doprava se předá plánovači');
  assert.ok(tr.days.every((d) => d.stops.length <= 2 && d.stops.every((s) => /^\d{2}:\d{2}$/.test(s.depart) && s.travelMin > 0)));
  const bogus = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 1, mode: 'day', transport: 'plane' })).json();
  assert.equal(bogus.transport, 'car', 'neznámá doprava → auto');
  const nul = await fetch(`${base}/api/roadtrip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
  assert.equal(nul.status, 400, 'tělo null → 400, ne pád');
  // připnutý cíl je v plánu a vrací se s původním skóre
  const all = [...day.days.flatMap((d) => d.stops), ...day.spare];
  const pick = day.spare[day.spare.length - 1];
  const pinned = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 2, mode: 'day', include: [pick.id] })).json();
  const got = pinned.days.flatMap((d) => d.stops).find((x) => x.id === pick.id);
  assert.ok(got, 'připnutý cíl je v plánu');
  assert.equal(got.score, all.find((x) => x.id === pick.id).score);
});

test('POST /api/roadtrip – okruh „po Toskánsku“ jen v Toskánsku (připnutý cíl smí ven), bez oblasti kruh (DEMO)', async () => {
  const post = async (body) => (await fetch(`${base}/api/roadtrip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const start = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const FLR = { lat: 43.7696, lon: 11.2558, label: 'Florencie', start, days: 4, mode: 'loop' };
  // ukázkové cíle kolem Florencie: demoTrip1, 4 a 8 leží mimo Toskánsko (data/regions.json)
  const out = ['demoTrip1', 'demoTrip4', 'demoTrip8'];
  const ids = (j) => [...j.days.flatMap((d) => d.stops), ...j.spare].map((s) => s.id);
  const all = await post(FLR);
  assert.ok(ids(all).some((id) => out.includes(id)), 'bez oblasti: kruh kolem města');
  const tus = await post({ ...FLR, region: 'toskansko' });
  assert.ok(tus.days.length >= 2);
  assert.ok(!ids(tus).some((id) => out.includes(id)), 'v oblasti: jen cíle uvnitř hranice');
  const pin = await post({ ...FLR, region: 'toskansko', include: ['demoTrip4'] });
  assert.ok(pin.days.flatMap((d) => d.stops).some((s) => s.id === 'demoTrip4'), 'připnutý cíl mimo oblast zůstane');
  const unknown = await post({ ...FLR, region: 'atlantida' });
  assert.deepEqual(ids(unknown), ids(all), 'neznámá oblast = kruh');
  assert.deepEqual([all.inRegion, tus.inRegion, unknown.inRegion], [false, true, false], 'aplikace pod plán napíše „Cíle jen z oblasti“');
});

test('POST /api/bike – okruh na kole (DEMO), kontrola polohy a voleb', async () => {
  const post = (body) => fetch(`${base}/api/bike`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const r = await post({ lat: 50.0875, lon: 14.4213, km: 60, bike: 'road', scenery: 'nature', hills: 'flat' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.demo, true);
  assert.equal(j.km, 60);
  assert.equal(j.bike, 'road');
  assert.equal(j.scenery, 'nature');
  assert.equal(j.hills, 'flat');
  assert.ok(j.geometry.length > 10 && j.geometry[0].length === 3, 'trasa [lon, lat, výška]');
  assert.match(j.mapyUrl, /routeType=bike_road/);
  const d = await (await post({ lat: 50, lon: 14, scenery: 'mars', hills: 'x' })).json();
  assert.equal(d.scenery, 'mixed');
  assert.equal(d.hills, 'normal');
  assert.equal(d.km, 30);
  assert.equal((await post({ lat: 'x', lon: 14 })).status, 400);
  assert.equal((await post({ lat: 95, lon: 14 })).status, 400);
  assert.equal((await post('null')).status, 400);
  assert.equal((await post('{nope')).status, 400);
});

test('POST /api/hike – pěší okruh (DEMO): délka 2–40 km, odkazy pěšky, stejné kontroly jako kolo', async () => {
  const post = (body) => fetch(`${base}/api/hike`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const j = await (await post({ lat: 50.0875, lon: 14.4213, km: 12, scenery: 'nature', hills: 'hilly', bike: 'road' })).json();
  assert.equal(j.demo, true);
  assert.equal(j.activity, 'hike');
  assert.equal(j.km, 12);
  assert.equal(j.scenery, 'nature');
  assert.equal(j.hills, 'hilly');
  assert.equal(j.bike, undefined, 'pěšky bez kola');
  assert.ok(Number.isFinite(j.trailPct) && j.minutes > 180, 'čas chůze (12 km ≥ 3 h)');
  assert.match(j.mapyUrl, /routeType=foot_hiking/);
  assert.match(j.googleUrl, /travelmode=walking/);
  const d = await (await post({ lat: 50, lon: 14, km: 500, scenery: 'mars' })).json();
  assert.equal(d.km, 40, 'nejvýš 40 km');
  assert.equal(d.scenery, 'mixed');
  assert.equal((await (await post({ lat: 50, lon: 14 })).json()).km, 10, 'výchozí 10 km');
  // hory a příroda z Objevuj (nature + area): start túry mimo cíl; neznámý druh = jako město
  const th = await (await post({ lat: 50.736, lon: 15.7396, km: 10, nature: 'peak', area: 10 })).json();
  assert.equal(th.trailhead.name, 'Demo parkoviště');
  assert.ok(th.start.lat < 50.736);
  assert.equal((await (await post({ lat: 50.736, lon: 15.7396, km: 10, nature: 'volcano', area: 10 })).json()).trailhead, undefined);
  assert.equal(j.trailhead, undefined, 'město bez startu túry');
  assert.equal((await post({ lat: 'x', lon: 14 })).status, 400);
  assert.equal((await post('[]')).status, 400);
  assert.equal((await post('{nope')).status, 400);
});

test('POST /api/hikeplan – túra na každý den (DEMO) a GET /api/nature – oblast hor podle polohy', async () => {
  const post = (body) => fetch(`${base}/api/hikeplan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const start = ymdPlus(30);
  const end = ymdPlus(32);
  const j = await (await post({ lat: 50.6917, lon: 15.7333, label: 'Pec pod Sněžkou', start, end, arrivalTime: '10:00', departureTime: '18:00', kids: true })).json();
  assert.equal(j.demo, true);
  assert.equal(j.kind, 'hike');
  assert.equal(j.area.cs, 'Krkonoše');
  assert.equal(j.days.length, 3);
  const ids = j.days.filter((d) => d.hike).map((d) => d.hike.goal.id);
  assert.ok(ids.length >= 2 && new Set(ids).size === ids.length, 'každý den jiný cíl');
  for (const d of j.days.filter((x) => x.hike)) {
    assert.ok(d.hike.km > 0 && d.hike.minutes > 0 && d.hike.difficulty && d.hike.kids && d.hike.rain);
    assert.match(d.hike.mapyUrl, /routeType=foot_hiking/);
    assert.equal(d.items.length, 1);
  }
  // vyřazený cíl (✕ jiný cíl) se znovu nevybere
  const again = await (await post({ lat: 50.6917, lon: 15.7333, start, end, exclude: [ids[0]] })).json();
  assert.ok(!again.days.some((d) => d.hike && d.hike.goal.id === ids[0]));
  assert.equal((await post({ lat: 'x', lon: 14, start, end })).status, 400);
  assert.equal((await post({ lat: 50, lon: 14, start: end, end: start })).status, 400);
  assert.equal((await post({ lat: 50, lon: 14, start, end: ymdPlus(80) })).status, 400, 'nejvýš 31 dní');
  assert.equal((await post('[]')).status, 400);
  const area = async (q) => (await (await fetch(`${base}/api/nature?${q}`)).json()).area;
  assert.equal((await area('lat=49.0614&lon=20.298')).cs, 'Vysoké Tatry');
  assert.equal(await area('lat=50.0875&lon=14.4213'), null);
  assert.equal((await fetch(`${base}/api/nature?lat=x`)).status, 400);
});

test('POST /api/bike kind=train – vlakem tam, na kole zpět (DEMO)', async () => {
  const post = (body) => fetch(`${base}/api/bike`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await (await post({ lat: 50.0875, lon: 14.4213, km: 40, bike: 'gravel', kind: 'train', label: 'Praha', cc: 'CZ' })).json();
  assert.equal(j.demo, true);
  assert.equal(j.kind, 'train');
  assert.equal(j.bike, 'gravel');
  assert.ok(j.station.name && j.station.lat > 50.0875, 'nádraží na sever');
  assert.match(j.train.idosUrl, /^https:\/\/idos\.cz\/vlakyautobusy\/spojeni\/\?f=Praha&t=/);
  assert.match(j.train.googleUrl, /travelmode=transit/);
  const m = new URL(j.mapyUrl);
  assert.notEqual(m.searchParams.get('start'), m.searchParams.get('end'), 'z nádraží domů');
  const geo = await (await post({ lat: 50.0875, lon: 14.4213, km: 40, kind: 'train', label: '', cc: 'bad' })).json();
  assert.equal(geo.train.idosUrl, null, 'bez názvu domova (Moje okolí) jen Google');
  const loop = await (await post({ lat: 50.0875, lon: 14.4213, km: 40, kind: 'plane' })).json();
  assert.equal(loop.kind, 'loop', 'neznámý druh → okruh');
  assert.equal(loop.station, undefined);
});

test('POST /api/itinerary (DEMO): časy zastávek, oběd a konec dne; s dětmi (kids) nejvýš 1 muzeum za den', async () => {
  const post = async (body) => (await fetch(`${base}/api/itinerary`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const start = ymdPlus(20);
  const end = ymdPlus(22);
  const plan = await post({ lat: 41.39, lon: 2.17, start, end, arrivalTime: '09:00' });
  const full = plan.days[1];
  assert.ok(full.items.length > 1);
  assert.ok(full.items.every((p, i) => /^\d{2}:\d{2}$/.test(p.at) && (!i || p.at > full.items[i - 1].at)), 'časy po sobě');
  assert.match(full.end, /^\d{2}:\d{2}$/);
  assert.ok(full.lunch && full.lunch.after >= 0 && full.lunch.at >= '11:45');
  const kids = await post({ lat: 41.39, lon: 2.17, start, end, arrivalTime: '09:00', kids: true });
  for (const d of kids.days) assert.ok(d.items.filter((p) => p.category === 'museum').length <= 1, d.items.map((p) => p.category).join(','));
  // jen true zapne režim s dětmi
  const str = await post({ lat: 41.39, lon: 2.17, start, end, arrivalTime: '09:00', kids: 'ano' });
  assert.deepEqual(str.days.map((d) => d.cap), plan.days.map((d) => d.cap));
});

test('POST /api/stayplan – trasa přes víc míst (DEMO): návrh open-jaw, přepočet upravené trasy, chyby', async () => {
  const post = (body) => fetch(`${base}/api/stayplan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const r = await post({ arrival: 'BGY', departure: 'FCO', nights: 8, transport: 'car' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.demo, true);
  assert.equal(j.mode, 'suggest');
  assert.equal(j.openJaw, true);
  assert.equal(j.want, 3);
  assert.ok(j.bases.length >= 2 && j.bases.length <= 4);
  assert.equal(j.bases[0].anchor, 'arrival');
  assert.equal(j.bases.reduce((s, b) => s + b.nights, 0), 8, 'noci dohromady = délka pobytu');
  assert.ok(j.bases.every((b) => b.nights >= 1 && b.name && Number.isFinite(b.lat) && Number.isFinite(b.lon)));
  assert.equal(j.transfers.length, j.bases.length - 1);
  assert.ok(j.transfers.every((x) => x.km > 0 && x.carMin > 0 && x.transitMin > 0 && /^https:\/\/www\.google\.com\/maps\/dir\//.test(x.carUrl) && /travelmode=transit/.test(x.transitUrl)));
  assert.equal(j.departure.iata, 'FCO');
  assert.ok(j.legs.departure.carMin > 0);
  assert.ok(Array.isArray(j.candidates) && j.candidates.length > 0);
  // jen tam a vlakem
  const ow = await (await post({ arrival: 'LIS', nights: 5, transport: 'transit', count: 2 })).json();
  assert.equal(ow.transport, 'transit');
  assert.equal(ow.legs.departure, null);
  assert.equal(ow.bases.length, 2);
  // přepočet upravené trasy
  const ev = await (await post({ arrival: 'BGY', departure: 'FCO', bases: j.bases.slice().reverse().map(({ name, lat, lon, cc }) => ({ name, lat, lon, cc })) })).json();
  assert.equal(ev.mode, 'evaluate');
  assert.equal(ev.transfers.length, j.bases.length - 1);
  for (const bad of [{ arrival: 'BGY', nights: 0 }, { arrival: 'XYZ', nights: 3 }, { arrival: 'BGY', bases: [{ name: 'x', lat: 'a', lon: 1 }] }, 'null', '[]', '{nope']) {
    assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  }
});

test('GET /api/stays v DEMO: odkazy na partnery bez dotazů na jejich weby (ID místa u Trip.com, Agody a Hostelworldu se nehledá)', async () => {
  // rawGet jde přes http.request, takže zachycený fetch vidí jen dotazy serveru ven
  const stub = stubFetch(() => ({ status: 500, body: '{}' }));
  try {
    const { status, body } = await rawGet(`/api/stays?city=Cotonou&cityEn=Cotonou&cc=BJ&lat=6.3654&lon=2.4183&checkin=${ymdPlus(40)}&checkout=${ymdPlus(43)}&adults=2`);
    assert.equal(status, 200);
    assert.equal(stub.calls.length, 0, stub.calls.map((c) => c.url).join(' '));
    const j = JSON.parse(body);
    assert.ok(j.items.length > 0, 'DEMO nabídky');
    const by = Object.fromEntries(j.links.map((l) => [l.id, l]));
    assert.match(by.trip.url, /searchWord=Cotonou%2C\+Benin/);
    assert.deepEqual([by.agoda.url, by.agoda.prefill], ['https://www.agoda.com/cs-cz/', 'none']);
    assert.deepEqual([by.hostelworld.url, by.hostelworld.prefill], ['https://www.hostelworld.com/hostels/africa/benin/cotonou/', 'city']);
  } finally {
    stub.restore();
  }
});

test('POST /api/search – totéž hledání z téže adresy, které ještě běží, se do limitu nepočítá podruhé', async () => {
  const { config } = await import('../server/config.js');
  const { mockProviders } = await import('../server/providers/mock.js');
  const prevLimit = config.searchesPer10Min;
  const orig = mockProviders.map((p) => p.daily);
  config.searchesPer10Min = 2;
  // pomalé zdroje, ať první hledání ještě běží
  mockProviders.forEach((p, i) => { p.daily = async (...a) => { await new Promise((r) => setTimeout(r, 40)); return orig[i].apply(p, a); }; });
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': '10.20.30.40' };
  const q = { from: ['ap:VIE'], to: ['ap:BCN'], radiusKm: 0, dateFrom: ymdPlus(20), dateTo: ymdPlus(40), trip: 'return', nightsMin: 3, nightsMax: 5 };
  const post = (body, signal) => fetch(`${base}/api/search`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  try {
    const ctlA = new AbortController();
    const a = await post(q, ctlA.signal); // 1. z limitu 2
    assert.equal(a.status, 200);
    ctlA.abort(); // klient ho zruší (obnovená stránka), na serveru ještě běží
    const b = await post(q); // stejné, ještě běží → zdarma
    assert.equal(b.status, 200);
    assert.equal(JSON.parse((await b.text()).trim().split('\n').at(-1)).type, 'result');
    const c = await post({ ...q, dateTo: ymdPlus(41) }); // jiné → 2. z limitu
    assert.equal(c.status, 200);
    await c.text();
    const d = await post({ ...q, dateTo: ymdPlus(42) }); // 3. → přes limit
    assert.equal(d.status, 429);
    // doběhlé stejné hledání znovu už zdarma není
    await new Promise((r) => setTimeout(r, 300));
    const e = await post(q);
    assert.equal(e.status, 429);
  } finally {
    config.searchesPer10Min = prevLimit;
    mockProviders.forEach((p, i) => { p.daily = orig[i]; });
  }
});

test('POST /api/search – průběžné výsledky přijdou gzip i brotli streamem hned, ne až s výsledkem; noPartial je vypne', async () => {
  const { PARTIAL } = await import('../server/lib/search.js');
  const { mockProviders } = await import('../server/providers/mock.js');
  const keep = { ...PARTIAL };
  const jet = mockProviders[1];
  const orig = jet.daily;
  Object.assign(PARTIAL, { firstMs: 50 });
  // Demo Jet pomalý (jako Kiwi.com): lety až po 900 ms, Demo Air hned
  jet.daily = async (...a) => { await new Promise((r) => setTimeout(r, 900)); return orig.apply(jet, a); };
  const q = { from: ['ap:VIE'], radiusKm: 60, to: ['metro:LON'], dateFrom: ymdPlus(20), dateTo: ymdPlus(40), trip: 'return', nightsMin: 2, nightsMax: 5 };
  const stub = stubFetch(() => ({ status: 404, body: {} })); // kurzy bez sítě
  // řádky NDJSON s časem, kdy je klient dostal (rozbalené z gzipu / brotli po kouscích)
  const read = (body, enc = 'gzip') => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/search', method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-encoding': enc, 'x-forwarded-for': '10.20.30.44' } }, (res) => {
      if (res.headers['content-encoding'] !== enc) return reject(new Error(`bez ${enc}`));
      const gz = res.pipe(enc === 'br' ? zlib.createBrotliDecompress() : zlib.createGunzip());
      gz.setEncoding('utf8');
      const lines = [];
      let buf = '';
      gz.on('data', (c) => {
        buf += c;
        for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) lines.push({ at: Date.now() - t0, ev: JSON.parse(buf.slice(0, i)) });
      });
      gz.on('end', () => resolve(lines));
      gz.on('error', reject);
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
  try {
    const lines = await read(q);
    const part = lines.find((l) => l.ev.type === 'partial');
    const last = lines.at(-1);
    assert.equal(last.ev.type, 'result');
    assert.ok(part, 'průběžný výsledek v proudu');
    assert.equal(part.ev.result.partial, true);
    assert.ok(part.ev.result.groups.length > 0);
    assert.ok(part.at < last.at - 400, `náhled za ${part.at} ms, výsledek za ${last.at} ms`);
    assert.ok(lines.indexOf(part) < lines.length - 1 && last.ev.result.partial === undefined);
    // brotli (prohlížeče ho posílají v Accept-Encoding): náhled taky hned, ne až na konci proudu
    const br = await read(q, 'br');
    const bp = br.find((l) => l.ev.type === 'partial');
    assert.ok(bp && bp.at < br.at(-1).at - 400, `brotli: náhled za ${bp?.at} ms, výsledek za ${br.at(-1).at} ms`);
    const off = await read({ ...q, noPartial: true });
    assert.equal(off.at(-1).ev.type, 'result');
    assert.ok(!off.some((l) => l.ev.type === 'partial'), 'noPartial (kontrola hlídaných cen, radar) bez náhledů');
  } finally {
    jet.daily = orig;
    stub.restore();
    Object.assign(PARTIAL, keep);
  }
});

test('GET /api/verify – živé ověření ceny má vlastní limit, hledání z téže adresy neubírá', async () => {
  const { config } = await import('../server/config.js');
  const prev = config.verifiesPer10Min;
  config.verifiesPer10Min = 2;
  const headers = { 'x-forwarded-for': '10.20.30.41' };
  const verify = () => fetch(`${base}/api/verify?from=VIE&to=BCN&out=${ymdPlus(20)}&back=${ymdPlus(24)}&adults=2`, { headers });
  try {
    for (let i = 0; i < 2; i++) {
      const r = await verify();
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { available: false, items: [] }); // DEMO: Kiwi není
    }
    const r3 = await verify();
    assert.equal(r3.status, 429);
    assert.match((await r3.json()).error, /ověření ceny/);
    // hledání má svůj limit – ověřování ho nevyčerpá
    const s = await fetch(`${base}/api/search`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ from: ['ap:VIE'], to: ['ap:BCN'], radiusKm: 0, dateFrom: ymdPlus(20), dateTo: ymdPlus(30), trip: 'return', nightsMin: 3, nightsMax: 5 }) });
    assert.equal(s.status, 200);
    await s.text();
  } finally {
    config.verifiesPer10Min = prev;
  }
});

test('Objevuj má vlastní limit: vyčerpaný → 429, hledání letů dál funguje; odpověď z mezipaměti se nepočítá', async () => {
  const { config } = await import('../server/config.js');
  const { findPlaces, findTrips } = await import('../server/lib/poi.js');
  const { bikeLoop } = await import('../server/lib/bike.js');
  const prev = { limit: config.explorePer10Min, mock: config.mock, gap: process.env.BROUTER_GAP_MS };
  config.explorePer10Min = 2;
  const headers = { 'x-forwarded-for': '10.20.30.42' };
  const json = { ...headers, 'content-type': 'application/json' };
  const start = ymdPlus(10);
  // server běží ve stejném procesu – dotazy na něj jdou přes původní fetch, náhrada fetch platí jen pro dotazy serveru ven
  const f = globalThis.fetch;
  const poi = (lat, lon) => f(`${base}/api/poi?lat=${lat}&lon=${lon}&radius=10`, { headers });
  const post = (path, body) => f(`${base}${path}`, { method: 'POST', headers: json, body: JSON.stringify(body) });
  try {
    // DEMO: počítá se každý požadavek
    for (let i = 0; i < 2; i++) assert.equal((await poi(41.3874, 2.1686)).status, 200);
    const r3 = await poi(41.3874, 2.1686);
    assert.equal(r3.status, 429);
    assert.match((await r3.json()).error, /Příliš mnoho požadavků/);
    assert.equal((await post('/api/roadtrip', { lat: 41.3874, lon: 2.1686, start, mode: 'day' })).status, 429);
    assert.equal((await post('/api/itinerary', { lat: 41.3874, lon: 2.1686, start, end: start })).status, 429);
    assert.equal((await post('/api/bike', { lat: 41.3874, lon: 2.1686, km: 30 })).status, 429);
    assert.equal((await post('/api/hike', { lat: 41.3874, lon: 2.1686, km: 10 })).status, 429);
    // hledání letů má svůj limit – Objevuj ho nevyčerpá
    const s = await post('/api/search', { from: ['ap:VIE'], to: ['ap:BCN'], radiusKm: 0, dateFrom: ymdPlus(20), dateTo: ymdPlus(30), trip: 'return', nightsMin: 3, nightsMax: 5 });
    assert.equal(s.status, 200);
    await s.text();

    // Mimo DEMO: místa, výlety a trasa už v mezipaměti serveru → odpověď zdarma i po vyčerpání limitu
    const lit = (v) => ({ type: 'literal', value: String(v) });
    const ent = (q) => ({ type: 'uri', value: `http://www.wikidata.org/entity/${q}` });
    const wrow = (q, label, lat, lon, sl, type) => ({ item: ent(q), itemLabel: lit(label), lat: lit(lat), lon: lit(lon), sl: lit(sl), type: ent(type) });
    const rows = [wrow('Q1', 'Katedrála', 41.3839, 2.1763, 80, 'Q2977'), wrow('Q2', 'Hrad', 41.3633, 2.1658, 60, 'Q23413'),
      wrow('Q3', 'Girona', 41.9831, 2.8249, 150, 'Q515'), wrow('Q4', 'Katedrála v Gironě', 41.9875, 2.8262, 60, 'Q2977')];
    const n = 30;
    const coords = Array.from({ length: n + 1 }, (_, i) => [2.1686 + 0.04 * Math.sin((i / n) * 2 * Math.PI), 41.3874 + 0.03 * (1 - Math.cos((i / n) * 2 * Math.PI)), 20]);
    const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { 'track-length': '30000', 'filtered ascend': '200', 'total-time': '6000', messages: [] }, geometry: { type: 'LineString', coordinates: coords } }] };
    process.env.BROUTER_GAP_MS = '0';
    const stub = stubFetch((url) => {
      if (url.startsWith('https://query.wikidata.org/sparql')) {
        const q = decodeURIComponent(new URL(url).searchParams.get('query'));
        // okruh 20 km: navíc klášter za městem
        const more = q.includes('"20"') ? [wrow('Q5', 'Klášter', 41.52, 2.05, 70, 'Q44613')] : [];
        return { body: { results: { bindings: q.includes('wikibase:around') ? [...rows, ...more] : [] } } };
      }
      if (url.includes('brouter')) return { body: geo };
      return { body: { query: { pages: [] } } };
    });
    try {
      await findPlaces({ lat: 41.39, lon: 2.17, radiusKm: 10, dayTrips: true });
      await findPlaces({ lat: 41.39, lon: 2.17, radiusKm: 20, dayTrips: true });
      await findTrips({ lat: 41.39, lon: 2.17 });
      await bikeLoop({ lat: 41.39, lon: 2.17, km: 30, bike: 'trekking', scenery: 'mixed', hills: 'normal', variant: 0 });
    } finally {
      stub.restore();
    }
    config.mock = false;
    for (let i = 0; i < 5; i++) {
      const r = await poi(41.39, 2.17);
      assert.equal(r.status, 200);
      assert.ok((await r.json()).items.some((x) => x.id === 'Q1'));
    }
    // program bere místa ze stejného okruhu jako seznam (stejná položka mezipaměti), bez okruhu 10 km
    const it10 = await post('/api/itinerary', { lat: 41.39, lon: 2.17, start, end: start });
    assert.equal(it10.status, 200);
    assert.ok(!(await it10.json()).places.some((x) => x.id === 'Q5'));
    const it20 = await post('/api/itinerary', { lat: 41.39, lon: 2.17, start, end: start, radius: 20 });
    assert.equal(it20.status, 200);
    assert.ok((await it20.json()).places.some((x) => x.id === 'Q5'), 'okruh 20 km');
    const trip = await post('/api/roadtrip', { lat: 41.39, lon: 2.17, start, mode: 'day' });
    assert.equal(trip.status, 200);
    assert.equal((await trip.json()).days[0].stops[0].id, 'Q3');
    const bike = await post('/api/bike', { lat: 41.39, lon: 2.17, km: 30 });
    assert.equal(bike.status, 200);
    assert.equal((await bike.json()).km, 30);
    // co v mezipaměti není (jiné místo, jiná trasa), by šlo na Wikidata / BRouter → nad limitem 429, bez dotazu ven
    const out = stubFetch(() => { throw new Error('bez sítě'); });
    try {
      assert.equal((await poi(48.2082, 16.3738)).status, 429);
      assert.equal((await post('/api/bike', { lat: 41.39, lon: 2.17, km: 30, variant: 1 })).status, 429);
      assert.equal(out.calls.length, 0);
    } finally {
      out.restore();
    }
  } finally {
    config.explorePer10Min = prev.limit;
    config.mock = prev.mock;
    if (prev.gap === undefined) delete process.env.BROUTER_GAP_MS;
    else process.env.BROUTER_GAP_MS = prev.gap;
  }
});

test('Objevuj okruh 50/100 km a celá země (DEMO): /api/poi/trips a /api/poi/country, neplatné vstupy 400', async () => {
  const headers = { 'x-forwarded-for': '10.20.30.77' };
  const get = async (path) => { const r = await fetch(`${base}${path}`, { headers }); return { status: r.status, j: await r.json() }; };
  const t = await get('/api/poi/trips?lat=41.3874&lon=2.1686');
  assert.equal(t.status, 200);
  assert.equal(t.j.demo, true);
  assert.ok(t.j.items.length >= 5 && t.j.items.every((x) => x.category === 'daytrip' && x.distanceKm > 0));
  assert.equal((await get('/api/poi/trips?lat=x&lon=2')).status, 400);
  // země podle kódu, vzdálenost od místa
  const c = await get('/api/poi/country?cc=it&lat=41.9&lon=12.5');
  assert.equal(c.status, 200);
  assert.deepEqual([c.j.cc, c.j.country, c.j.demo], ['IT', 'Itálie', true]);
  for (const k of ['city', 'dest', 'unesco', 'park']) assert.ok(c.j[k].length && c.j[k].every((x) => Number.isFinite(x.distanceKm)), k);
  // bez kódu podle polohy; bez polohy bez vzdálenosti
  assert.equal((await get('/api/poi/country?lat=48.2082&lon=16.3738')).j.cc, 'AT');
  const nc = await get('/api/poi/country?cc=PT');
  assert.equal(nc.status, 200);
  assert.equal(nc.j.city[0].distanceKm, undefined);
  for (const bad of ['/api/poi/country', '/api/poi/country?cc=XX', '/api/poi/country?cc=ITA', '/api/poi/country?lat=95&lon=0']) assert.equal((await get(bad)).status, 400, bad);
  // „Co hledáš?“: kategorie země (hory, pláže…) se vzdáleností od místa; neznámá kategorie 400
  const m = await get('/api/poi/country?cc=IT&cat=mountain&lat=41.9&lon=12.5');
  assert.equal(m.status, 200);
  assert.deepEqual([m.j.cc, m.j.country, m.j.cat, m.j.demo, m.j.degraded], ['IT', 'Itálie', 'mountain', true, false]);
  assert.ok(m.j.items.length && m.j.items.every((x) => x.cats.includes('mountain') && Number.isFinite(x.distanceKm)));
  assert.equal((await get('/api/poi/country?cc=CZ&cat=castle')).j.items[0].distanceKm, undefined);
  for (const bad of ['?cc=IT&cat=bad', '?cc=IT&cat=', '?cc=IT&cat=constructor', '?cc=XX&cat=mountain']) assert.equal((await get(`/api/poi/country${bad}`)).status, 400, bad);
});
