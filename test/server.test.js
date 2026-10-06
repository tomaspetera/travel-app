// Integrační test: server v DEMO režimu (ATLAS_MOCK=1) – API, streamované hledání, statické soubory.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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
  assert.deepEqual(t.access, { groundMode: 'transit', kmRate: 1, carFuel: 'diesel', carCons: 6, carPrice: null, carKmCzk: null, adults: 1, nights: 7, trip: 'return', fuelCc: 'CZ' });
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
    assert.ok(g.roadKm > 0 && g.fuelCzk === Math.round(g.roadKm * 3) && g.parkBaseCzk > 0 && g.parkDayCzk > 0 && Array.isArray(g.tolls) && g.adults === 2);
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
    assert.ok(a.ground.parkDayCzk > 0, 'parkování platí i elektroauto');
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
  assert.equal((await (await fetch(`${base}/api/origins?from=${encodeURIComponent('geo:45.46,9.19|Milán')}&radius=60&groundMode=car`)).json()).access.fuelCc, 'CZ', 'země bez ceny → Česko');
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
    assert.equal(t.perPersonCzk, t.flightCzk + t.groundCzk);
    assert.ok(r.origins.some((o) => o.iata === t.out.from));
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
    assert.equal(t.groundCzk, 2 * g.czk + t.parkCzk, 'nabíjení tam i zpět + parkování');
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
  assert.match(j.source, /NASA POWER/);
  const cc = await (await fetch(`${base}/api/climate?cc=TH`)).json();
  assert.deepEqual(cc.hi, j.hi, 'země = její hlavní letiště');
  assert.equal(cc.city, 'Bangkok');
  const pt = await (await fetch(`${base}/api/climate?lat=50.08&lon=14.42`)).json();
  assert.ok(pt.hi[6] > pt.hi[0]);
  for (const [q, status] of [['', 400], ['?iata=XXX', 400], ['?iata=12', 400], ['?cc=XYZ', 400], ['?cc=XX', 404], ['?lat=95&lon=0', 400], ['?lat=abc&lon=1', 400], ['?lat=50', 400], ['?lat=0&lon=-30', 404]]) {
    const x = await fetch(`${base}/api/climate${q}`);
    assert.equal(x.status, status, q);
    assert.match((await x.json()).error, /\S/);
    assert.equal(x.headers.get('cache-control'), 'no-store', 'chyby se necachují');
  }
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
  assert.match(page, /id="smartGuide"/, 'průvodce „Jak hledat chytře“ na stránce letů');
  const c =await (await fetch(`${base}/data/countries.json`)).json();
  assert.ok(c.length > 150);
  // vstupní podmínky: zvlášť, komprimované a s hodinovou cache; entry.js po app.js a před trip.js
  const e = await fetch(`${base}/data/entry.json`, { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(e.status, 200);
  assert.equal(e.headers.get('content-encoding'), 'gzip');
  assert.match(e.headers.get('cache-control'), /max-age=3600/);
  const ej = await e.json();
  assert.equal(ej.countries.length, c.length);
  assert.ok(page.indexOf('js/entry.js') > page.indexOf('js/app.js') && page.indexOf('js/entry.js') < page.indexOf('js/trip.js'), 'entry.js po app.js, před trip.js');
  assert.equal((await fetch(`${base}/js/entry.js`)).status, 200);
  assert.match(page, /id="sgEntry"/, 'vstupní podmínky v průvodci „Jak hledat chytře“');
  // fetch() by „..“ normalizoval, proto surový HTTP požadavek.
  for (const p of ['/../server/config.js', '/%2e%2e%2fserver%2fconfig.js', '/..%2f..%2f.env']) {
    const { status, body } = await rawGet(p);
    assert.ok(!body.includes('export const config'), `${p} nesmí vrátit zdrojový kód serveru`);
    assert.ok(status === 403 || status === 200, `${p}: ${status}`);
  }
  const js = await fetch(`${base}/js/flights.js`, { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(js.status, 200);
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
  assert.equal((await post({ lat: 'x', lon: 14 })).status, 400);
  assert.equal((await post('[]')).status, 400);
  assert.equal((await post('{nope')).status, 400);
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
