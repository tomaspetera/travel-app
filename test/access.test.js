// Doprava na letiště (server/lib/access.js): veřejnou dopravou (kalibrace na cílové rozsahy z Prahy a Brna, příplatek
// za mezinárodní spoj, vypnutí, násobek jízdného), autem (palivo podle pohonu, spotřeby a aktuální ceny, parkování podle
// délky cesty, známky, odvoz u cesty jen tam), dřívější kmRate a carKmCzk v Kč/km, optimalizátor s parkováním na cestu,
// hledání tam i zpět a přes víc měst autem (zástupné zdroje, žádná síť) a stejné výpočty v prohlížeči
// (public/js/searchhelp.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
process.env.FUEL_LIVE = '0'; // ceny paliva vestavěné (ČR nafta 50,65, benzín 45,87 Kč/l), bez sítě
const A = await import('../server/lib/access.js');
const fuel = await import('../server/lib/fuel.js');
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
  // Mnichov z Prahy: přímý bus až na letiště (RegioJet, FlixBus, změřeno) – ne bus do města (299 Kč) + S-Bahn ~350 Kč
  const muc = transit(PRAHA, 'MUC');
  assert.deepEqual(muc.breakdown.map((x) => [x.k, x.czk]), [['intercity', 400], ['border', 80]]);
  assert.match(muc.breakdown[0].label, /^Praha → letiště Mnichov přímým busem/);
  // bez přímého busu (Plzeň) přes město a S-Bahn; Memmingen přes Mnichov a letištní bus
  const plzen = { lat: 49.7384, lon: 13.3736, label: 'Plzeň' };
  assert.deepEqual(transit(plzen, 'MUC').breakdown.map((x) => x.k), ['intercity', 'access', 'border']);
  // Allgäu Airport Express z Mnichova online od 15 € (ověřeno 10/2026, stejně jako v data/arrival.json)
  assert.deepEqual(transit(PRAHA, 'FMM').breakdown.map((x) => [x.k, x.czk]), [['intercity', 300], ['access', 370], ['border', 60]]);
  // přímý bus jen když vyjde levněji: Praha → Vídeň a Berlín, Brno → Vídeň
  for (const [h, iata, czk] of [[PRAHA, 'VIE', 440], [PRAHA, 'BER', 500], [BRNO, 'VIE', 300]]) {
    const g = transit(h, iata);
    assert.deepEqual([g.czk, g.breakdown.map((x) => x.k)], [czk, ['intercity', 'border']], `${h.label} → ${iata}`);
  }
  // letiště za humny (blíž než jeho město): regionální spoj rovnou na letiště (Kladno → Ruzyně, Bratislava → Schwechat)
  assert.deepEqual(transit({ lat: 50.1473, lon: 14.1029, label: 'Kladno' }, 'PRG').breakdown.map((x) => x.k), ['regional']);
  const bv = transit(BRATISLAVA, 'VIE');
  assert.deepEqual(bv.breakdown.map((x) => x.k), ['regional', 'border']);
  assert.ok(bv.czk >= 100 && bv.czk <= 250, `Bratislava → VIE ${bv.czk}`);
});

test('příplatek za mezinárodní spoj: jen přes hranici, mezi Českem, Slovenskem, Polskem a Maďarskem menší', () => {
  const border = (h, iata) => transit(h, iata).breakdown.find((x) => x.k === 'border')?.czk || 0;
  for (const iata of ['PRG', 'KLV', 'PED', 'JCL', 'BRQ', 'OSR']) assert.equal(border(PRAHA, iata), 0, iata);
  assert.ok(border(PRAHA, 'LEJ') >= 50 && border(PRAHA, 'VIE') >= 50 && border(PRAHA, 'BER') >= 50);
  // Praha → Drážďany: změřená cena konkrétních spojů (FlixBus 319–339 Kč) – příplatek už v ní je
  assert.equal(border(PRAHA, 'DRS'), 0);
  assert.equal(border(BRNO, 'BTS'), 30);
  assert.equal(border(PRAHA, 'KTW'), 30);
  assert.equal(A.borderCzk('CZ', 'AT', 500), 100);
  assert.equal(A.borderCzk('CZ', 'DE', 100), 50);
  assert.equal(A.borderCzk('CZ', 'CZ', 500), 0);
  // poloha bez země u hranice: sever Čech má nejblíž letiště Drážďany, pořád je to ale Česko (do Prahy bez příplatku
  // a bez české známky, do Drážďan s příplatkem)
  for (const [label, lat, lon] of [['Ústí nad Labem', 50.6607, 14.0323], ['Děčín', 50.7736, 14.1964], ['Varnsdorf', 50.9116, 14.6183]]) {
    const h = { lat, lon, label };
    assert.equal(border(h, 'PRG'), 0, label);
    assert.ok(border(h, 'DRS') >= 50, label);
    assert.deepEqual(plain(car(h, 'PRG').tolls), [], label);
  }
  assert.equal(border(BRATISLAVA, 'BTS'), 0, 'Bratislava = Slovensko');
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
  // výchozí nafta 6 l/100 km × 50,65 Kč/l = 3,039 Kč/km
  assert.deepEqual([g.carFuel, g.carKmCzk], ['diesel', 3.039]);
  assert.equal(g.fuelCzk, Math.round(g.roadKm * 3.039));
  assert.ok(g.roadKm > 280 && g.roadKm < 380, `silnice ${g.roadKm} km`);
  assert.deepEqual(plain(g.tolls).map((t) => t.cc), ['AT']);
  // parkování online předem: základ + za den (Vídeň 850 + 150 Kč)
  assert.deepEqual([g.parkBaseCzk, g.parkDayCzk], [850, 150]);
  // na let: palivo jedním směrem + půl známky, děleno 2 cestujícími
  assert.equal(g.czk, Math.round((g.fuelCzk + 320 / 2) / 2));
  // 7 nocí = 8 dní parkování; 12 nocí = 13 dní → známka na 10 dní nevystačí, druhá
  assert.equal(A.parkDays(7), 8);
  assert.equal(A.parkStay(g, 8), 850 + 150 * 8);
  assert.equal(A.parkCzk(g, 7), Math.round((850 + 150 * 8) / 2));
  assert.equal(A.parkCzk(g, 12), Math.round((850 + 150 * 13 + 320) / 2));
  const t7 = A.carTrip(g, 7);
  assert.deepEqual([t7.days, t7.fuel, t7.park, t7.tolls], [8, 2 * g.fuelCzk, 2050, 320]);
  assert.equal(t7.total, 2 * g.fuelCzk + 2050 + 320);
  assert.equal(t7.perPerson, 2 * g.czk + A.parkCzk(g, 7));
  assert.ok(Math.abs(t7.perPerson - t7.total / 2) <= 1);
  // víc lidí v autě = levněji na osobu; delší cesta = dražší parkování
  const g4 = car(PRAHA_GEO, 'VIE', { adults: 4 });
  assert.ok(A.carTrip(g4, 7).perPerson < t7.perPerson / 1.9);
  assert.ok(A.carTrip(g, 14).perPerson > t7.perPerson + 500);
  // dřívější Kč/km (dotaz jen s carKmCzk)
  assert.equal(car(PRAHA_GEO, 'VIE', { carKmCzk: 4 }).fuelCzk, g.roadKm * 4);
  // Praha → Ruzyně autem: palivo zanedbatelné, parkování ne
  const prg = A.carTrip(car(PRAHA, 'PRG', { adults: 1 }), 7);
  assert.ok(prg.park === 590 + 120 * 8 && prg.fuel < 100 && prg.perPerson > 1550);
});

test('parkování u letiště online předem: základ + za den, proložené ceníky ověřenými 10/2026', () => {
  // Ceny online předem na 1, 3, 7 a 14 dní v Kč (24,4 Kč/€, 5,8 Kč/zł, 0,064 Kč/Ft) zjištěné 6. 10. 2026 pro auto
  // přijíždějící 27. 10. (Praha, Vídeň) a 28. 10. 2026; zdroje u tabulky ACCESS v access.js a v README: Praha
  // booking.prg.aero / aeroparking.cz, Vídeň Mazur, Brno ceník letiště 300 / 650 / 1 300 / 2 350 Kč, Ostrava P3–P6
  // 130 Kč/den, Bratislava parkingairport.sk 35 / 41 / 50 / 90 €, Mnichov Economy 33,99 / 45,99 / 63,99 / 87,99 €,
  // Drážďany P2 Flex Plus 27 / 37 / 57 / 92 €, Lipsko 30 / 50 / 90 / 115 €, Katovice P4 / P5 37 / 66 / 132 / 189 zł,
  // Krakov KRK Parking 80 / 120 / 200 / 280 zł, Budapešť Relax Parking 5 831 / 9 150 / 13 200 / 16 725 Ft
  const measured = {
    PRG: [780, 850, 1450, 2280], VIE: [791, 1420, 2096, 2828], BRQ: [300, 650, 1300, 2350], OSR: [130, 390, 910, 1820],
    BTS: [854, 1000, 1220, 2196], MUC: [829, 1122, 1561, 2147], DRS: [659, 903, 1391, 2245], LEJ: [732, 1220, 2196, 2806],
    KTW: [215, 383, 766, 1096], KRK: [464, 696, 1160, 1624], BUD: [373, 586, 845, 1070],
  };
  for (const [iata, prices] of Object.entries(measured)) {
    const g = car(PRAHA, iata, { adults: 1 });
    [1, 3, 7, 14].forEach((d, i) => {
      const model = A.parkStay(g, d), real = prices[i];
      // víkend až dva týdny do ±15 %, jeden den (krátké stání) do ±30 %
      assert.ok(Math.abs(model - real) <= real * (d === 1 ? 0.3 : 0.15), `${iata} ${d} dní: ${model} Kč, změřeno ${real} Kč`);
    });
    // krátké stání není na den levnější než dlouhé (Ostrava stejně, jinde dráž)
    assert.ok(A.parkStay(g, 1) >= A.parkStay(g, 14) / 14, iata);
  }
  for (const x of ['PRG', 'VIE']) assert.ok(A.parkStay(car(PRAHA, x), 1) > A.parkStay(car(PRAHA, x), 14) / 14 * 3, x);
  // Ceník po týdnech, jedna přímka přes 1–14 dní sedí špatně → proloženo 3–14 dní (typická cesta, do ±10 %), jeden den
  // vyjde dráž: Linec C1 16,70 / 40 / 63 / 86 € (linz-airport.com, ceník od 1. 1. 2026), Salcburk P3 / P7 v sezóně
  // 24. 10.–1. 11. 27 / 59 / 65 / 90 €, Norimberk P31 / P4 online 38 / 91 / 131 / 192 €, Berlín Economy online
  // 34 / 64 / 80 / 109 €; Vratislav (degresivní, 7–9 dní za stejnou cenu) Parking D online 79 / 139 / 199 / 269 zł
  const weekly = {
    LNZ: [407, 976, 1537, 2098], SZG: [659, 1440, 1586, 2196], NUE: [927, 2220, 3196, 4685], BER: [830, 1562, 1952, 2660],
    WRO: [458, 806, 1154, 1560],
  };
  for (const [iata, prices] of Object.entries(weekly)) {
    const g = car(PRAHA, iata, { adults: 1 });
    [3, 7, 14].forEach((d, i) => assert.ok(Math.abs(A.parkStay(g, d) - prices[i + 1]) <= prices[i + 1] * 0.1, `${iata} ${d} dní: ${A.parkStay(g, d)} Kč`));
    assert.ok(A.parkStay(g, 1) > prices[0], `${iata} 1 den vyjde dráž`);
  }
  // Vratislav: celý online ceník Parking D (rezerwacja.airport.wroclaw.pl, příjezd st 28. 10. 2026) – přímka 630 + 70 Kč/den
  // sedí na 3–16 dní do ±11 % (jeden den 700 Kč místo 458 Kč, dva dny 770 Kč místo 632 Kč)
  const wroZl = { 2: 109, 3: 139, 4: 159, 5: 179, 6: 189, 7: 199, 8: 199, 9: 199, 10: 209, 11: 219, 12: 239, 13: 249, 14: 269, 15: 269, 16: 289 };
  const wro = car(PRAHA, 'WRO', { adults: 1 });
  for (const [d, zl] of Object.entries(wroZl)) {
    const model = A.parkStay(wro, +d), real = zl * 5.8;
    if (+d >= 3) assert.ok(Math.abs(model - real) <= real * 0.11, `WRO ${d} dní: ${model} Kč, ceník ${Math.round(real)} Kč`);
  }
  assert.deepEqual([A.parkStay(wro, 1), A.parkStay(wro, 2), A.parkStay(wro, 8)], [700, 770, 1190]);
  assert.equal(wro.breakdown.find((x) => x.k === 'park').label, 'parkování u letiště online předem (630 Kč + 70 Kč za den)');
  // Karlovy Vary: P4 / P5 online 500 Kč za každý započatý týden (8 dní, airport-k-vary.cz) → přímka 280 + 50 Kč/den
  // přes 3–14 dní: týden 680 Kč (skutečně 500), 9 dní 730 Kč (skutečně 1 000), 14 dní 980 Kč
  const klv = car(PRAHA, 'KLV');
  assert.deepEqual([A.parkStay(klv, 8), A.parkStay(klv, 9), A.parkStay(klv, 14)], [680, 730, 980]);
  // Pardubice: P1 + P2 zdarma bez rezervace (airport-pardubice.cz) – parkování 0 a popis „zdarma“
  const ped = car(PRAHA, 'PED', { adults: 2 });
  assert.deepEqual([ped.parkBaseCzk, ped.parkDayCzk, A.parkCzk(ped, 7), A.carTrip(ped, 7).park], [0, 0, 0, 0]);
  assert.equal(ped.breakdown.find((x) => x.k === 'park').label, 'parkování u letiště zdarma');
  // Ostrava bez základu (130 Kč za každý den, online i na místě): popis jen se sazbou za den
  assert.equal(car(PRAHA, 'OSR').breakdown.find((x) => x.k === 'park').label, 'parkování u letiště online předem (130 Kč za den)');
  // proložení základ + Kč/den u ověřených letišť (ceníky výše a u tabulky ACCESS)
  const verified = ['PRG', 'VIE', 'BRQ', 'OSR', 'PED', 'KLV', 'BTS', 'LNZ', 'SZG', 'MUC', 'NUE', 'BER', 'DRS', 'LEJ', 'KTW', 'KRK', 'WRO', 'BUD'];
  assert.deepEqual(Object.fromEntries(verified.map((x) => { const g = car(PRAHA, x); return [x, [g.parkBaseCzk, g.parkDayCzk]]; })), {
    PRG: [590, 120], VIE: [850, 150], BRQ: [170, 160], OSR: [0, 130], PED: [0, 0], KLV: [280, 50], BTS: [670, 100],
    LNZ: [740, 100], SZG: [1170, 70], MUC: [790, 100], NUE: [1580, 220], BER: [1260, 100], DRS: [540, 120],
    LEJ: [750, 160], KTW: [190, 70], KRK: [430, 90], WRO: [630, 70], BUD: [400, 50],
  });
  // neověřená regionální letiště zůstávají odhadem z dřívější denní sazby (Budějovice, Poznaň)
  for (const x of ['JCL', 'POZ']) {
    const g = car(PRAHA, x);
    assert.ok(g.parkBaseCzk > 0 && g.parkBaseCzk < 590 && g.parkDayCzk > 0, `${x}: ${g.parkBaseCzk} + ${g.parkDayCzk}`);
  }
  // letiště mimo tabulku: odhad podle velikosti, taky základ + za den
  const far = car(PRAHA, 'BCN');
  assert.ok(far.parkBaseCzk > 0 && far.parkDayCzk > 0);
  // rozpis: položka parkování za den se základem a popisem „online předem“
  const pk = car(PRAHA, 'PRG').breakdown.find((x) => x.k === 'park');
  assert.deepEqual([pk.czk, pk.base], [120, 590]);
  assert.match(pk.label, /online předem/);
  // autem jen tam (odvoz) se neparkuje
  assert.equal(A.parkCzk(car(PRAHA, 'PRG', { oneWay: true }), 7), 0);
});

test('veřejnou dopravou: Praha → Drážďany změřeně (bus ~340 Kč + S-Bahn), Praha letiště MHD a Airport Express 200 Kč', () => {
  const drs = transit(PRAHA, 'DRS');
  assert.deepEqual(drs.breakdown.map((x) => [x.k, x.czk]), [['intercity', 340], ['access', 90]]);
  assert.equal(drs.czk, 430);
  assert.match(drs.breakdown[0].label, /^Praha → Drážďany busem \(FlixBus, RegioJet\)$/);
  assert.equal(transit(PRAHA_GEO, 'DRS').czk, 430, 'i z polohy v Praze');
  // jinde do Drážďan dál model (z Plzně s příplatkem za mezinárodní spoj)
  assert.deepEqual(transit({ lat: 49.7384, lon: 13.3736, label: 'Plzeň' }, 'DRS').breakdown.map((x) => x.k), ['intercity', 'access', 'border']);
  // PID: linka 59 + metro A, Airport Express 200 Kč (pid.cz, 6. 10. 2026)
  assert.match(transit(PRAHA, 'PRG').breakdown[0].label, /bus 59 \+ metro A.*Airport Express 200 Kč/);
});

test('autem: dálniční známky a mýtné jen v cizině, cesta přes sousední země', () => {
  const cc = (home, iata) => plain(car(home, iata).tolls).map((t) => t.cc);
  assert.deepEqual(cc(PRAHA, 'VIE'), ['AT']);
  assert.deepEqual(cc(PRAHA, 'LNZ'), ['AT']);
  assert.deepEqual(cc(PRAHA, 'BTS'), ['SK']);
  assert.deepEqual(cc(PRAHA, 'BUD'), ['SK', 'HU'], 'do Budapešti přes Slovensko');
  assert.deepEqual(plain(car(PRAHA, 'BUD').tolls).map((t) => t.czk), [270, 430], 'Slovensko 10,80 €, Maďarsko 6 900 Ft (2026)');
  assert.deepEqual(cc(PRAHA, 'LJU'), ['AT', 'SI']);
  assert.deepEqual(cc(PRAHA, 'MUC'), [], 'Německo pro auta bez známky');
  assert.deepEqual(cc(PRAHA, 'KTW'), [], 'Polsko (A1) bez poplatku');
  assert.deepEqual(cc(PRAHA, 'PRG'), [], 'domácí známku máš');
  assert.deepEqual(cc(BRATISLAVA, 'PRG'), ['CZ'], 'ze Slovenska do Česka česká známka');
  assert.deepEqual(A.tollsOn('CZ', 'HR').map((t) => [t.cc, t.days]), [['AT', 10], ['SI', 7], ['HR', 0]]);
  // Lublaň na 8 nocí: slovinská známka na 7 dní nevystačí, rakouská na 10 ano
  const lju = car(PRAHA, 'LJU', { adults: 1 });
  assert.equal(A.parkCzk(lju, 8), A.parkStay(lju, 9) + 400);
});

test('autem jen tam: odvoz – palivo tam i zpět, celá známka, bez parkování', () => {
  const g = car(PRAHA_GEO, 'VIE', { adults: 2, oneWay: true });
  assert.equal(g.dropOff, true);
  assert.equal(g.czk, Math.round((2 * g.fuelCzk + 320) / 2));
  assert.equal(A.parkCzk(g, 7), 0);
  const t = A.carTrip(g, 7);
  assert.deepEqual([t.days, t.park, t.perPerson, t.total], [0, 0, g.czk, 2 * g.fuelCzk + 320]);
});

test('dotaz: groundMode, kmRate jako násobek, pohon auta; dřívější kmRate a carKmCzk v Kč/km (uložená hledání, odkazy)', () => {
  const n = (raw) => plain(A.normalizeAccess(raw));
  assert.deepEqual(n({}), { groundMode: 'transit', kmRate: 1, carFuel: 'diesel', carCons: 6, carPrice: null, carKmCzk: null });
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
  // dřívější klient: jen carKmCzk (bez carFuel) zůstává v Kč/km, meze 0,5–10
  assert.deepEqual([n({ carKmCzk: 3.14 }).carKmCzk, n({ carKmCzk: 50 }).carKmCzk, n({ carKmCzk: 0.1 }).carKmCzk, n({ carKmCzk: 'x' }).carKmCzk, n({ carKmCzk: -1 }).carKmCzk], [3.1, 10, 0.5, 2.6, 2.6]);
  assert.deepEqual(n({ groundMode: 'car', carKmCzk: 2.6 }), { groundMode: 'car', kmRate: 1, carFuel: null, carCons: null, carPrice: null, carKmCzk: 2.6 });
  // s carFuel se carKmCzk nepoužije
  assert.deepEqual(n({ carFuel: 'ev', carKmCzk: 3 }), { groundMode: 'transit', kmRate: 1, carFuel: 'ev', carCons: 19, carPrice: null, carKmCzk: null });
  // normalizeQuery: totéž u hledání i u cesty přes víc měst
  const q = normalizeQuery({ from: ['ap:PRG'], kmRate: 1.1 });
  assert.deepEqual([q.groundMode, q.kmRate, q.carFuel, q.carCons, q.carPrice, q.carKmCzk], ['transit', 1, 'diesel', 6, null, null]);
  const qc = normalizeQuery({ from: ['ap:PRG'], groundMode: 'car', kmRate: 1, carKmCzk: 3 });
  assert.deepEqual([qc.groundMode, qc.kmRate, qc.carFuel, qc.carKmCzk], ['car', 1, null, 3]);
  const qf = normalizeQuery({ from: ['ap:PRG'], groundMode: 'car', carFuel: 'petrol', carCons: '8.25', carPrice: '41.5' });
  assert.deepEqual([qf.carFuel, qf.carCons, qf.carPrice, qf.carKmCzk], ['petrol', 8.3, 41.5, null]);
  const D = ymdPlus(20);
  const legs = [{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['ap:FCO'], to: ['ap:PRG'], date: D }];
  const qm = normalizeQuery({ trip: 'multi', groundMode: 'car', carFuel: 'ev', carCons: 99, carPrice: 0, legs });
  assert.deepEqual([qm.groundMode, qm.carFuel, qm.carCons, qm.carPrice, qm.carKmCzk], ['car', 'ev', 40, null, null]);
  const qml = normalizeQuery({ trip: 'multi', groundMode: 'car', carKmCzk: 3.3, legs });
  assert.deepEqual([qml.carFuel, qml.carKmCzk], [null, 3.3]);
  // úseky cesty přes víc měst dostanou stejné auto (carQuery → normalizeQuery dá totéž)
  for (const x of [qf, qm, qml, qc, q]) {
    const again = normalizeQuery({ from: ['ap:PRG'], groundMode: 'car', ...A.carQuery(x) });
    assert.deepEqual([again.carFuel, again.carCons, again.carPrice, again.carKmCzk], [x.carFuel, x.carCons, x.carPrice, x.carKmCzk]);
  }
});

test('auto: Kč/km podle pohonu, spotřeby a ceny (aktuální v zemi domova, nabíjení DC, vlastní), meze', () => {
  const e = (raw, cc) => plain(A.carEnergy(raw, cc));
  // výchozí nafta 6 l/100 km × 50,65 Kč/l (ČSÚ, 40. týden 2026 – zde vestavěná cena)
  assert.deepEqual(e({}), {
    fuel: 'diesel', cons: 6, unit: 'l', price: 50.65, priceLabel: 'nafta 50,65 Kč/l · orientačně, k 28. 9. 2026', kmCzk: 3.039,
    custom: false, country: 'CZ', date: '2026-09-28', source: 'builtin',
  });
  assert.deepEqual([e({ carFuel: 'petrol' }).kmCzk, e({ carFuel: 'petrol' }).priceLabel], [3.2109, 'benzín N95 45,87 Kč/l · orientačně, k 28. 9. 2026']);
  // elektroauto: 19 kWh/100 km × 16 Kč/kWh (nabíjení DC podle ceníků k 6. 10. 2026)
  assert.deepEqual(e({ carFuel: 'ev' }), {
    fuel: 'ev', cons: 19, unit: 'kWh', price: 16, priceLabel: 'nabíjení DC ~16 Kč/kWh (ceníky ČEZ, PRE, E.ON, IONITY, Tesla – stav 6. 10. 2026)',
    kmCzk: 3.04, custom: false, country: null, date: '2026-10-06', source: 'ev',
  });
  // vlastní spotřeba a cena
  assert.deepEqual([e({ carFuel: 'diesel', carCons: 5.5, carPrice: 55 }).kmCzk, e({ carFuel: 'diesel', carCons: 5.5, carPrice: 55 }).priceLabel], [3.025, 'nafta 55,00 Kč/l · vlastní cena']);
  assert.deepEqual([e({ carFuel: 'ev', carCons: 17, carPrice: 8.5 }).kmCzk, e({ carFuel: 'ev', carCons: 17, carPrice: 8.5 }).priceLabel], [1.445, 'nabíjení 8,50 Kč/kWh · vlastní cena']);
  assert.equal(e({ carFuel: 'ev', carPrice: 12 }).priceLabel, 'nabíjení 12 Kč/kWh · vlastní cena');
  // země domova: sousední země z bulletinu, neznámá → ČR
  assert.deepEqual([e({}, 'AT').price, e({}, 'AT').country, e({}, 'AT').priceLabel], [55.11, 'AT', 'nafta 55,11 Kč/l v Rakousku · orientačně, k 28. 9. 2026']);
  assert.equal(e({ carFuel: 'petrol' }, 'sk').priceLabel, 'benzín N95 45,21 Kč/l na Slovensku · orientačně, k 28. 9. 2026');
  assert.deepEqual([e({}, 'IT').country, e({}, '').country, e({}, undefined).country], ['CZ', 'CZ', 'CZ']);
  // meze: spotřeba nafta / benzín 2–30 l, elektro 8–40 kWh; cena 5–150 Kč/l, 1–40 Kč/kWh; 0, záporné a nesmysl = výchozí
  const c = (raw) => plain(A.normalizeCar(raw));
  assert.deepEqual(c({ carFuel: 'diesel', carCons: 99, carPrice: 999 }), { carFuel: 'diesel', carCons: 30, carPrice: 150, carKmCzk: null });
  assert.deepEqual(c({ carFuel: 'petrol', carCons: 0.5, carPrice: 1 }), { carFuel: 'petrol', carCons: 2, carPrice: 5, carKmCzk: null });
  assert.deepEqual(c({ carFuel: 'ev', carCons: 3, carPrice: 99 }), { carFuel: 'ev', carCons: 8, carPrice: 40, carKmCzk: null });
  assert.deepEqual(c({ carFuel: 'ev', carCons: 55, carPrice: 0.2 }), { carFuel: 'ev', carCons: 40, carPrice: 1, carKmCzk: null });
  for (const bad of [0, -3, 'abc', '', null, undefined, NaN]) {
    assert.deepEqual(c({ carFuel: 'petrol', carCons: bad, carPrice: bad }), { carFuel: 'petrol', carCons: 7, carPrice: null, carKmCzk: null }, String(bad));
  }
  for (const bad of ['lpg', 'EV', '__proto__', 'constructor', 7, {}]) assert.equal(c({ carFuel: bad }).carFuel, 'diesel', String(bad));
  assert.deepEqual(c({ carCons: '6.44', carPrice: '50.655' }), { carFuel: 'diesel', carCons: 6.4, carPrice: 50.66, carKmCzk: null }, 'zaokrouhlení 0,1 l a haléře');
  // cesta autem: palivo jedním směrem = silniční km × Kč/km, rozpis s pohonem a cenou
  for (const raw of [{}, { carFuel: 'petrol' }, { carFuel: 'ev' }, { carFuel: 'ev', carCons: 21, carPrice: 9.9 }, { carFuel: 'diesel', carCons: 4.8 }]) {
    const g = car(PRAHA_GEO, 'VIE', { adults: 2, ...raw });
    const x = e(raw, 'CZ');
    const f = g.breakdown[0];
    assert.equal(g.carFuel, x.fuel);
    assert.equal(g.carKmCzk, x.kmCzk);
    assert.equal(g.fuelCzk, Math.round(g.roadKm * x.kmCzk));
    assert.equal(g.fuelCzk, Math.round((g.roadKm * x.cons * x.price) / 100), 'km × spotřeba / 100 × cena');
    assert.deepEqual(plain(f), { k: 'fuel', label: f.label, czk: g.fuelCzk, ...x, fuelCzk: g.fuelCzk });
    assert.match(f.label, new RegExp(`^${x.fuel === 'ev' ? 'nabíjení' : 'palivo'} jedním směrem \\(${g.roadKm} km × [\\d,]+ (l|kWh)/100 km × [\\d,]+ Kč/(l|kWh)\\)$`));
    assert.equal(g.czk, Math.round((g.fuelCzk + 320 / 2) / 2), 'na osobu: palivo jedním směrem + půl známky');
  }
  assert.equal(car(PRAHA_GEO, 'VIE').breakdown[0].label, `palivo jedním směrem (${car(PRAHA_GEO, 'VIE').roadKm} km × 6 l/100 km × 50,65 Kč/l)`);
  // elektroauto platí parkování i známky stejně
  const d = car(PRAHA_GEO, 'VIE', { adults: 2 });
  const ev = car(PRAHA_GEO, 'VIE', { adults: 2, carFuel: 'ev' });
  assert.deepEqual([ev.parkDayCzk, plain(ev.tolls)], [d.parkDayCzk, plain(d.tolls)]);
  // domov na Slovensku (Bratislava): slovenská nafta 48,26 Kč/l
  const sk = car(BRATISLAVA, 'VIE');
  assert.deepEqual([sk.breakdown[0].country, sk.breakdown[0].price], ['SK', 48.26]);
  // vypnutá doprava: bez ceny a rozpisu, pohon a Kč/km zůstávají
  const off = car(PRAHA_GEO, 'VIE', { scale: 0, carFuel: 'ev' });
  assert.deepEqual([off.off, off.breakdown.length, off.carFuel, off.carKmCzk], [true, 0, 'ev', 3.04]);
});

test('auto: dřívější dotaz jen s carKmCzk (starší klient, uložené hledání) počítá jako dřív', () => {
  for (const km of [2.6, 3, 1.1]) {
    const g = car(PRAHA_GEO, 'VIE', { adults: 2, carKmCzk: km });
    assert.deepEqual([g.carFuel, g.carKmCzk, g.fuelCzk], [null, km, Math.round(g.roadKm * km)]);
    assert.deepEqual(plain(g.breakdown[0]), { k: 'fuel', label: `palivo jedním směrem (${g.roadKm} km × ${String(km).replace('.', ',')} Kč)`, czk: g.fuelCzk, kmCzk: km, fuelCzk: g.fuelCzk });
  }
  // výchozí 2,6 Kč/km jako před aktuálními cenami; s carFuel nová cena
  const old = car(PRAHA_GEO, 'VIE', { carKmCzk: 2.6 });
  const now = car(PRAHA_GEO, 'VIE', { carKmCzk: 2.6, carFuel: 'diesel' });
  assert.equal(old.fuelCzk, Math.round(old.roadKm * 2.6));
  assert.equal(now.fuelCzk, Math.round(now.roadKm * 3.039));
  // dotaz → volby airportAccess: dřívější jen carKmCzk, nový pohon bez carKmCzk
  assert.deepEqual(plain(A.accessOpts(A.normalizeAccess({ groundMode: 'car', carKmCzk: 3 }))), { mode: 'car', scale: 1, carKmCzk: 3, oneWay: false });
  assert.deepEqual(plain(A.accessOpts({ ...A.normalizeAccess({ groundMode: 'car', carFuel: 'ev', carPrice: 9 }), adults: 3 }, true)), { mode: 'car', scale: 1, carFuel: 'ev', carCons: 19, carPrice: 9, adults: 3, oneWay: true });
});

test('prohlížeč: stejné parkování a cesta autem jako server, štítky letišť, starší uložený formulář', () => {
  for (const [g, nights] of [[car(PRAHA_GEO, 'VIE', { adults: 2 }), 7], [car(PRAHA_GEO, 'VIE', { adults: 3 }), 12], [car(PRAHA, 'LJU'), 8],
    [car(PRAHA, 'PRG', { adults: 4 }), 0], [car(PRAHA, 'VIE', { oneWay: true, adults: 2 }), 5], [car(PRAHA, 'ZAG', { adults: 2 }), 9],
    [car(PRAHA, 'PED', { adults: 2 }), 7], [car(BRNO, 'OSR'), 3]]) {
    const x = plain(g);
    assert.equal(H.parkCzk(x, nights), A.parkCzk(g, nights));
    assert.deepEqual(plain(H.carTrip(x, nights)), plain(A.carTrip(g, nights)));
  }
  assert.equal(H.parkDays(3), A.parkDays(3));
  // štítky: veřejnou dopravou tam, autem i s parkováním na N dní, odvoz
  const t = H.accessLabel(plain(transit(PRAHA, 'KLV')));
  assert.equal(t.text, '~220 Kč/os. tam');
  assert.match(t.title, /^Veřejnou dopravou: Praha → Karlovy Vary vlakem \/ busem ~190 Kč \+ MHD Karlovy Vary ~30 Kč = ~220 Kč na osobu jedním směrem \(zpět totéž\)/);
  const vie = car(PRAHA_GEO, 'VIE', { adults: 2 });
  const c = H.accessLabel(plain(vie), { nights: 7 });
  assert.match(c.text, /^~[\d\s ]+ Kč\/os\. vč\. parkování na 8 dní$/);
  // palivo jedním směrem: km × spotřeba × aktuální cena = Kč (přesně fuelCzk), pak tam i zpět
  const kc = (n) => n.toLocaleString('cs-CZ');
  assert.ok(c.title.includes(`palivo ${vie.roadKm} km × 6 l/100 km × 50,65 Kč/l = ${kc(vie.fuelCzk)} Kč, tam i zpět ~${kc(2 * vie.fuelCzk)} Kč + parkování online předem ~850 Kč + 150 Kč/den × 8 dní = ~${kc(2050)} Kč + dálniční známka Rakousko (10 dní) ~320 Kč`), c.title);
  assert.match(c.title, /Cena: nafta 50,65 Kč\/l · orientačně, k 28\. 9\. 2026\./);
  const ev = H.accessLabel(plain(car(PRAHA_GEO, 'VIE', { adults: 2, carFuel: 'ev', carCons: 17 })), { nights: 7 });
  assert.match(ev.title, /: nabíjení \d+ km × 17 kWh\/100 km × 16 Kč\/kWh = [\d\s ]+ Kč, tam i zpět ~[\d\s ]+ Kč \+ parkování online předem ~850 Kč \+ 150 Kč\/den/);
  assert.match(ev.title, /Cena: nabíjení DC ~16 Kč\/kWh \(ceníky ČEZ, PRE, E\.ON, IONITY, Tesla – stav 6\. 10\. 2026\)\. Parkování a známky platí elektroauto stejně\./);
  const own = H.accessLabel(plain(car(PRAHA_GEO, 'VIE', { carFuel: 'petrol', carCons: 7.5, carPrice: 44.9 })), { nights: 7 });
  assert.match(own.title, /palivo \d+ km × 7,5 l\/100 km × 44,90 Kč\/l = .* Cena: benzín N95 44,90 Kč\/l · vlastní cena\./);
  // dřívější dotaz v Kč/km: popisek jako dřív
  const legacy = H.accessLabel(plain(car(PRAHA_GEO, 'VIE', { adults: 2, carKmCzk: 2.6 })), { nights: 7 });
  assert.match(legacy.title, /palivo tam i zpět \d+ km × 2,6 Kč = ~[\d\s ]+ Kč \+ parkování online předem ~850 Kč \+ 150 Kč\/den × 8 dní = ~2[\s ]050 Kč \+ dálniční známka Rakousko \(10 dní\) ~320 Kč/);
  // starší odpověď serveru bez základu parkování (jen sazba za den): počítá a popisuje se jako dřív
  const old = { ...plain(vie), parkBaseCzk: undefined, parkDayCzk: 300 };
  assert.equal(H.parkCzk(old, 7), Math.round(300 * 8 / 2));
  assert.match(H.accessLabel(old, { nights: 7 }).title, / \+ parkování ~300 Kč\/den × 8 dní = ~2[\s ]400 Kč/);
  assert.doesNotMatch(legacy.title, /Cena:/);
  assert.match(H.accessLabel(plain(car(PRAHA_GEO, 'VIE', { adults: 2 })), { nights: 2 }).text, /na 3 dny$/);
  // Pardubice: parkování zdarma (P1 + P2 bez rezervace) – štítek i popisek bez „0 Kč/den“
  const ped = H.accessLabel(plain(car(PRAHA, 'PED', { adults: 2 })), { nights: 7 });
  assert.match(ped.text, /^~[\d\s ]+ Kč\/os\. tam i zpět, parkování zdarma$/);
  assert.match(ped.title, / \+ parkování u letiště zdarma = ~[\d\s ]+ Kč za auto, na osobu \(2 os\.\)/);
  assert.doesNotMatch(ped.title, /0 Kč\/den/);
  // Ostrava bez základu: jen sazba za den
  assert.match(H.accessLabel(plain(car(BRNO, 'OSR')), { nights: 7 }).title, / \+ parkování ~130 Kč\/den × 8 dní = ~1[\s ]040 Kč/);
  const drop = H.accessLabel(plain(car(PRAHA_GEO, 'VIE', { oneWay: true, carFuel: 'ev' })));
  assert.match(drop.text, /\(odvoz\)$/);
  assert.match(drop.title, /^Autem jen tam: .* – nabíjení \d+ km × 19 kWh\/100 km × 16 Kč\/kWh = [\d\s ]+ Kč, tam i zpět ~/);
  assert.equal(H.accessLabel(plain(transit(PRAHA, 'KLV', { scale: 0 }))), null, 'vypnuto → bez ceny');
  assert.equal(H.accessLabel(null), null);
  // vzorec paliva jedním směrem (výsledky, tooltipy)
  assert.equal(H.fuelFormula(plain(vie)), `palivo ${vie.roadKm} km × 6 l/100 km × 50,65 Kč/l = ${kc(vie.fuelCzk)} Kč`);
  const lg = car(PRAHA_GEO, 'VIE', { carKmCzk: 3 });
  assert.equal(H.fuelFormula(plain(lg)), `palivo ${lg.roadKm} km × 3 Kč/km = ${kc(lg.fuelCzk)} Kč`);
  assert.equal(H.energyTxt(H.fuelItem(plain(vie))), 'nafta 6 l/100 km ≈ 3,04 Kč/km');
  assert.equal(H.fuelItem(plain(lg)), null, 'dřívější Kč/km: položka bez pohonu');
  // starší uložené hledání / hlídaná cena: kmRate v Kč/km bez groundMode; auto bez pohonu → výchozí pohony
  const cars = { carFuel: 'diesel', carCons: { diesel: 6, petrol: 7, ev: 19 }, carPrice: { diesel: null, petrol: null, ev: null } };
  assert.deepEqual(plain(H.groundForm({ ground: true, kmRate: 1.1 })), { ground: true, kmRate: 1, groundMode: 'transit', ...cars });
  assert.equal(H.groundForm({ kmRate: 2.2 }).kmRate, 2);
  assert.equal(H.groundForm({ kmRate: 0 }).kmRate, 0);
  const now = { ground: true, kmRate: 1.1, groundMode: 'transit', ...cars, carFuel: 'ev' };
  assert.equal(H.groundForm(now), now, 'nový formulář beze změny');
  assert.equal(H.groundForm(null), null);
  // dřívější Kč/km za auto: výchozí 2,6 → aktuální ceny, jiná hodnota → vlastní cena nafty při 6 l/100 km (stejné Kč/km)
  assert.deepEqual(plain(H.groundForm({ ground: true, groundMode: 'car', kmRate: 1, carKm: 2.6 })), { ground: true, groundMode: 'car', kmRate: 1, ...cars });
  const own35 = H.groundForm({ ground: true, groundMode: 'car', kmRate: 1, carKm: 3.5 });
  assert.deepEqual(plain(own35), { ground: true, groundMode: 'car', kmRate: 1, ...cars, carPrice: { diesel: 58.33, petrol: null, ev: null } });
  assert.equal(H.carEnergy(H.carPayload(own35), null).kmCzk, 3.4998, '≈ 3,50 Kč/km jako dřív');
  assert.equal(H.groundForm({ groundMode: 'car', carKm: 3 }).carPrice.diesel, 50);
  assert.equal(H.groundForm({ groundMode: 'car', carKm: 'x' }).carPrice.diesel, null);
  // poškozený uložený formulář: spotřeba a ceny v mezích, neznámý pohon → nafta
  const bad = H.groundForm({ groundMode: 'car', carFuel: 'lpg', carCons: { ev: 99, diesel: 'x' }, carPrice: 5 });
  assert.deepEqual(plain(bad), { groundMode: 'car', ...cars, carCons: { diesel: 6, petrol: 7, ev: 40 } });
  // do dotazu jen zvolený pohon
  assert.deepEqual(plain(H.carPayload({ carFuel: 'ev', carCons: { diesel: 5, petrol: 7, ev: 17.5 }, carPrice: { diesel: 55, petrol: null, ev: null } })), { carFuel: 'ev', carCons: 17.5 });
  assert.deepEqual(plain(H.carPayload({ carFuel: 'diesel', carCons: { diesel: 5 }, carPrice: { diesel: 55 } })), { carFuel: 'diesel', carCons: 5, carPrice: 55 });
  assert.deepEqual(plain(H.carPayload({})), { carFuel: 'diesel', carCons: 6 });
});

test('prohlížeč = server: pohon, spotřeba, cena a Kč/km (SearchHelp.carOpts / carEnergy s cenami z /api/fuel), i DEMO', async () => {
  const { config } = await import('../server/config.js');
  assert.deepEqual(plain(H.CAR_FUELS), plain(A.CAR_FUELS));
  const raws = [{}, { carFuel: 'diesel' }, { carFuel: 'petrol' }, { carFuel: 'ev' }, { carFuel: 'ev', carCons: '17.5' }, { carFuel: 'petrol', carCons: 8.25, carPrice: 39.999 },
    { carFuel: 'diesel', carPrice: 55 }, { carFuel: 'ev', carPrice: 8.5 }, { carFuel: 'ev', carPrice: 12 }, { carFuel: 'diesel', carCons: 99, carPrice: 999 },
    { carFuel: 'ev', carCons: 1, carPrice: 0.1 }, { carFuel: 'lpg', carCons: 'x', carPrice: -5 }, { carCons: '', carPrice: '' }, { carCons: ' ', carPrice: '1e1' },
    { carKmCzk: 3 }, { carKmCzk: 'x' }, { carKmCzk: 2.6, carFuel: 'petrol' }];
  const homes = [PRAHA, PRAHA_GEO, BRNO, BRATISLAVA, { lat: 48.2082, lon: 16.3738, label: 'Vídeň', cc: 'AT' }, { lat: 52.52, lon: 13.405, label: 'Berlín' }];
  for (const demo of [false, true]) {
    config.mock = demo;
    try {
      const info = plain(await fuel.fuelInfo()); // jako odpověď GET /api/fuel
      assert.equal(info.demo, demo || undefined);
      for (const raw of raws) {
        assert.deepEqual(plain(H.carOpts(raw)), plain(A.normalizeCar(raw)), JSON.stringify(raw));
        for (const cc of ['CZ', 'AT', 'DE', 'SK', 'PL', 'HU', 'it', 'XX', '', undefined]) {
          assert.deepEqual(plain(H.carEnergy(raw, info, cc)), plain(A.carEnergy(raw, cc)), `${demo ? 'DEMO ' : ''}${JSON.stringify(raw)} ${cc}`);
        }
        // palivo za cestu: server = prohlížeč (silniční km × Kč/km pro zemi, kterou server použil)
        for (const home of homes) {
          for (const iata of ['PRG', 'BRQ', 'VIE', 'MUC', 'BUD', 'KTW']) {
            const g = car(home, iata, raw);
            const f = g.breakdown[0];
            const e = H.carEnergy(raw, info, f.country || 'CZ');
            assert.equal(e ? H.fuelCzk(g.roadKm, e.kmCzk) : H.fuelCzk(g.roadKm, H.carOpts(raw).carKmCzk), g.fuelCzk, `${home.label} → ${iata} ${JSON.stringify(raw)}`);
          }
        }
      }
    } finally {
      config.mock = false;
    }
  }
  assert.equal(A.carEnergy({}).priceLabel, 'nafta 50,65 Kč/l · orientačně, k 28. 9. 2026');
  // země ceny pro řádek ve formuláři (access.fuelCc) = země, kterou server použil u cesty autem
  for (const home of [...homes, { lat: 52.23, lon: 21.01, label: 'Varšava', cc: 'pl' }, { lat: 45.46, lon: 9.19, label: 'Milán' }]) {
    assert.equal(A.fuelCountry(home), car(home, 'VIE', { carFuel: 'petrol' }).breakdown[0].country, home.label);
  }
  assert.deepEqual([A.fuelCountry(null), A.fuelCountry({ label: 'bez polohy' })], ['CZ', 'CZ']);
  // bez cen z /api/fuel (ještě nedorazily): jen vlastní cena
  assert.equal(H.carEnergy({ carFuel: 'diesel' }, null), null);
  assert.equal(H.carEnergy({ carFuel: 'ev' }, {}), null);
  assert.equal(H.carEnergy({ carFuel: 'ev', carPrice: 9 }, null).kmCzk, 1.71);
});

test('aktuální ceny ze zdrojů: popisek ČSÚ v rozpisu cesty autem a kratší řádek ve formuláři (server = prohlížeč)', async () => {
  const { CZSO_FUEL } = await import('./fixtures/czso.js');
  const { cache } = await import('../server/lib/cache.js');
  const XLSX = readFileSync(new URL('./fixtures/wob-prices-with-taxes-2026-09-28.xlsx', import.meta.url));
  delete process.env.FUEL_LIVE;
  fuel.resetFuel();
  cache.map.delete('fx:rates'); // kurz z podvrženého open.er-api.com (24,4 Kč/€)
  const s = stubFetch((url) => {
    if (url.startsWith('https://data.csu.gov.cz/')) return { body: CZSO_FUEL };
    if (url.startsWith('https://energy.ec.europa.eu/document/')) return { body: XLSX, headers: { 'content-type': 'application/octet-stream' } };
    if (url.includes('open.er-api.com')) return { body: { result: 'success', rates: { EUR: 1, CZK: 24.4 } } };
    return { status: 404, body: '{}' };
  });
  try {
    await fuel.refreshFuel();
    const info = plain(await fuel.fuelInfo());
    const g = car(PRAHA, 'VIE', { adults: 2 });
    const f = g.breakdown[0];
    assert.deepEqual([f.price, f.source, f.date, f.priceLabel], [50.65, 'czso', '2026-09-28', 'nafta 50,65 Kč/l · ČSÚ, 40. týden 2026 (28. 9.–4. 10.)']);
    assert.equal(f.label, `palivo jedním směrem (${g.roadKm} km × 6 l/100 km × 50,65 Kč/l)`);
    assert.deepEqual(plain(H.carEnergy({}, info, 'CZ')), plain(A.carEnergy({}, 'CZ')));
    assert.equal(H.fuelLine(H.carEnergy({}, info, 'CZ')), 'nafta 50,65 Kč/l · ČSÚ, týden 28. 9.–4. 10.');
    assert.equal(H.fuelLine(H.carEnergy({ carFuel: 'petrol' }, info, 'CZ')), 'benzín N95 45,87 Kč/l · ČSÚ, týden 28. 9.–4. 10.');
    // sousedé z bulletinu (2,259 € × 24,4 = 55,12 Kč/l)
    const at = A.carEnergy({}, 'AT');
    assert.deepEqual([at.price, at.priceLabel], [55.12, 'nafta 55,12 Kč/l v Rakousku · Oil Bulletin EU, k 28. 9. 2026']);
    assert.deepEqual(plain(H.carEnergy({}, info, 'AT')), plain(at));
    assert.equal(H.fuelLine(at), at.priceLabel);
    assert.equal(H.fuelLine(H.carEnergy({ carFuel: 'ev' }, info)), 'nabíjení DC ~16 Kč/kWh (ceníky ČEZ, PRE, E.ON, IONITY, Tesla – stav 6. 10. 2026)');
  } finally {
    s.restore();
    process.env.FUEL_LIVE = '0';
    fuel.resetFuel();
    cache.map.delete('fx:rates');
  }
});

test('formulář autem: id polí jsou v index.html jedinečná a šablony v JS je nepoužijí znovu (průvodce má #carPrice)', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), [], 'duplicitní id v index.html');
  for (const id of ['gmFuel', 'gmCons', 'gmConsUnit', 'gmKm', 'gmPriceLine', 'gmPrice', 'gmPriceUnit', 'gmWhat', 'gmEvNote']) assert.ok(ids.includes(id), id);
  // $('#…') bere první prvek v dokumentu – stejné id ve vykreslené šabloně (krok Auto průvodce) by četlo pole formuláře
  for (const f of readdirSync(new URL('../public/js/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    const js = readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
    const clash = [...new Set([...js.matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map((m) => m[1]))].filter((x) => ids.includes(x));
    assert.deepEqual(clash, [], `${f}: id už je v index.html`);
  }
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
  // parkování za den všude kromě Pardubic (P1 + P2 zdarma bez rezervace – airport-pardubice.cz, ověřeno 10/2026)
  assert.ok(rc.airports.every((a) => a.ground.mode === 'car' && a.ground.adults === 2 && a.ground.carKmCzk === 3 && (a.iata === 'PED' || a.ground.parkDayCzk > 0)));
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
    assert.deepEqual([rc.query.groundMode, rc.query.kmRate, rc.query.carFuel, rc.query.carCons, rc.query.carPrice, rc.query.carKmCzk], ['car', 1, 'diesel', 6, null, null]);
    assert.ok(rc.top.length >= 2);
    const g = (iata) => rc.origins.find((o) => o.iata === iata).ground;
    assert.ok(rc.origins.every((o) => o.ground.mode === 'car'));
    for (const t of rc.top) {
      assert.equal(t.back.to, t.out.from, 'autem zpět na letiště odletu');
      const pk = A.parkCzk(g(t.out.from), 4);
      assert.equal(t.parkCzk ?? 0, pk, t.out.from); // Pardubice parkování zdarma → parkCzk chybí
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

test('přesná data autem: nejbližší dny – parkování na celou cestu jen u Tam, Tam + Zpět = cena cesty ve výpisu', async () => {
  const fx = fxStub();
  const D = ymdPlus(30);
  const B = new Date(Date.parse(`${D}T12:00:00Z`) + 4 * 864e5).toISOString().slice(0, 10);
  const p = stubProvider('stub', [fare('PRG', 'BCN', D, 1500), fare('BCN', 'PRG', B, 1400), fare('BCN', 'KLV', B, 300)]);
  const base = { from: ['ap:PRG'], to: ['ap:BCN'], radiusKm: 120, trip: 'return', exactOut: D, exactBack: B, adults: 2 };
  try {
    const r = await search({ ...base, groundMode: 'car' }, () => {}, { providers: [p], hubs: false });
    const g = r.origins.find((o) => o.iata === 'PRG').ground;
    const t = r.top.find((x) => x.out.from === 'PRG' && x.back.to === 'PRG');
    assert.ok(t && r.top.every((x) => x.back.to === x.out.from), 'autem zpět na letiště odletu');
    const pk = A.parkCzk(g, 4);
    assert.equal(t.parkCzk, pk);
    const out = r.nearby.out.days.find((d) => d.date === D);
    const back = r.nearby.back.days.find((d) => d.date === B);
    // den tam: let + palivo jedním směrem + parkování na celou cestu (4 noci = 5 dní)
    assert.deepEqual([out.cost, out.parkCzk, out.parkDays], [t.out.czk + g.czk + pk, pk, 5]);
    // den zpět: let + palivo, parkování už je u Tam – součet je cena cesty ve výpisu (dřív parkování dvakrát)
    assert.deepEqual([back.to, back.cost, back.parkCzk], ['PRG', t.back.czk + g.czk, undefined]);
    assert.equal(out.cost + back.cost, t.perPersonCzk);
    // levný návrat do Karlových Varů autem nejde (auto stojí v Praze) – do řádku Zpět se nepočítá
    assert.ok(!r.nearby.back.days.some((d) => d.to === 'KLV'));
    // veřejnou dopravou bez parkování a beze změny: každý směr zvlášť, návrat do KLV je nejlevnější
    const rt = await search({ ...base, groundMode: 'transit' }, () => {}, { providers: [p], hubs: false });
    assert.ok(rt.nearby.out.days.every((d) => d.parkCzk === undefined));
    assert.equal(rt.nearby.back.days.find((d) => d.date === B).to, 'KLV');
  } finally {
    fx.restore();
  }
});

test('přesná data autem: Tam + Zpět v „Nejbližších dnech“ = cena nejlevnější cesty v ty dny (ověřeno novým hledáním)', async () => {
  const fx = fxStub();
  const D = ymdPlus(30);
  const day = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const B = day(D, 5);
  // zdroj vrací i dny kolem přesného data (jako Ryanair celý měsíc) – z nich je pruh „Nejbližší dny“
  const near = (fares) => ({
    ...stubProvider('stub', fares),
    async daily({ from, to, dateFrom, dateTo, near: nr }) {
      const a = nr && nr.from < dateFrom ? nr.from : dateFrom;
      const b = nr && nr.to > dateTo ? nr.to : dateTo;
      return stubProvider('stub', fares).daily({ from, to, dateFrom: a, dateTo: b });
    },
  });
  const prg = [fare('PRG', 'BCN', day(D, -1), 1400), fare('PRG', 'BCN', D, 1500), fare('PRG', 'BCN', day(D, 1), 1300),
    fare('BCN', 'PRG', day(B, -1), 1200), fare('BCN', 'PRG', B, 1400), fare('BCN', 'PRG', day(B, 2), 1100)];
  // Pardubice: parkování zdarma, levný let tam jen den po zadaném odletu a návrat jen v zadaný den
  const ped = [fare('PED', 'BCN', day(D, 1), 600), fare('BCN', 'PED', B, 1000)];
  const best = async (p, radiusKm, o, b) => {
    const r = await search({ from: ['ap:PRG'], to: ['ap:BCN'], radiusKm, trip: 'return', exactOut: o, exactBack: b, adults: 2, groundMode: 'car' }, () => {}, { providers: [p], hubs: false });
    return Math.min(...r.top.map((t) => t.perPersonCzk));
  };
  try {
    for (const [fares, radiusKm, label] of [[prg, 0, 'jen Praha'], [[...prg, ...ped], 120, 'Praha + Pardubice']]) {
      const p = near(fares);
      const r = await search({ from: ['ap:PRG'], to: ['ap:BCN'], radiusKm, trip: 'return', exactOut: D, exactBack: B, adults: 2, groundMode: 'car' }, () => {}, { providers: [p], hubs: false });
      const tam = (d) => r.nearby.out.days.find((x) => x.date === d)?.cost;
      const zpet = (d) => r.nearby.back.days.find((x) => x.date === d)?.cost;
      assert.equal(tam(D) + zpet(B), Math.min(...r.top.map((t) => t.perPersonCzk)), `${label}: zadané dny = nejlevnější cesta ve výpisu`);
      // změní-li se jen jeden den (jako po kliknutí na den v pruhu): přesně cena nejlevnější cesty z nového hledání
      for (const t of [day(D, -1), day(D, 1)]) assert.equal(tam(t) + zpet(B), await best(p, radiusKm, t, B), `${label}: tam ${t}`);
      for (const z of [day(B, -1), day(B, 2)]) assert.equal(tam(D) + zpet(z), await best(p, radiusKm, D, z), `${label}: zpět ${z}`);
      if (radiusKm === 0) {
        // jediné letiště: parkování je přímka základ + Kč/den, takže sedí i každá jiná dvojice dnů
        for (const t of [day(D, -1), day(D, 1)]) for (const z of [day(B, -1), day(B, 2)]) assert.equal(tam(t) + zpet(z), await best(p, 0, t, z), `${t} → ${z}`);
      } else {
        // den po odletu je nejlevnější přes Pardubice: auto stojí tam (zdarma) a vrací se tam – v ceně dne je i rozdíl
        // návratu do Pardubic proti návratu do Prahy v řádku Zpět
        const gc = (iata) => r.origins.find((o) => o.iata === iata).ground.czk;
        const x = r.nearby.out.days.find((d) => d.date === day(D, 1));
        assert.deepEqual([x.from, x.parkCzk, x.tripAdj], ['PED', undefined, 1000 + gc('PED') - (1400 + gc('PRG'))]);
        assert.equal(x.cost, 600 + gc('PED') + x.tripAdj);
      }
    }
  } finally {
    fx.restore();
  }
});

test('studený start, zdroje cen paliva visí: hledání autem na síť nečeká – vestavěná cena s datem, stahování na pozadí', async () => {
  const D = ymdPlus(30);
  const B = new Date(Date.parse(`${D}T12:00:00Z`) + 4 * 864e5).toISOString().slice(0, 10);
  const p = stubProvider('stub', [fare('PRG', 'BCN', D, 1500), fare('BCN', 'PRG', B, 1500)]);
  // ČSÚ i Oil Bulletin visí, dokud požadavek nezruší timeout
  const hang = (url, init) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const s = stubFetch((url, init) => {
    if (url.startsWith('https://data.csu.gov.cz/') || url.startsWith('https://energy.ec.europa.eu/')) return hang(url, init);
    if (url.includes('open.er-api.com')) return { body: { result: 'success', rates: { EUR: 1, CZK: 25 } } };
    return { status: 404, body: '{}' };
  });
  delete process.env.FUEL_LIVE;
  process.env.FUEL_TIMEOUT_MS = '1500';
  fuel.resetFuel();
  try {
    const t0 = Date.now();
    const res = await search({ from: ['ap:PRG'], to: ['ap:BCN'], radiusKm: 0, trip: 'return', dateFrom: D, dateTo: D, nightsMin: 3, nightsMax: 5, adults: 2, groundMode: 'car', kmRate: 1, carFuel: 'petrol' }, () => {}, { providers: [p], hubs: false });
    assert.ok(Date.now() - t0 < 1000, `hledání čekalo ${Date.now() - t0} ms`);
    const g = res.origins.find((o) => o.iata === 'PRG').ground;
    assert.deepEqual([g.breakdown[0].source, g.breakdown[0].price, g.breakdown[0].priceLabel], ['builtin', 45.87, 'benzín N95 45,87 Kč/l · orientačně, k 28. 9. 2026']);
    assert.equal(res.top[0].groundCzk, 2 * g.czk + A.parkCzk(g, 4));
    assert.ok(s.calls.some((c) => c.url.startsWith('https://data.csu.gov.cz/')), 'stahování cen spuštěné na pozadí');
    await fuel.refreshFuel(); // doběhne po timeoutu – zdroje dál nedostupné, platí vestavěné ceny
    assert.equal(A.carEnergy({ carFuel: 'petrol' }).source, 'builtin');
  } finally {
    s.restore();
    process.env.FUEL_LIVE = '0';
    delete process.env.FUEL_TIMEOUT_MS;
    fuel.resetFuel();
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
    // elektroauto s vlastní spotřebou: úseky (samostatná hledání) počítají se stejným autem jako začátek cesty
    const evRes = await search({
      trip: 'multi', adults: 2, radiusKm: 0, groundMode: 'car', kmRate: 1, carFuel: 'ev', carCons: 25,
      legs: [{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['ap:NAP'], to: ['ap:PRG'], date: D2 }],
    }, () => {}, { providers: [p] });
    const ge = evRes.origins.find((o) => o.iata === 'PRG').ground;
    assert.deepEqual([evRes.query.carFuel, evRes.query.carCons, ge.carFuel, ge.breakdown[0].cons, ge.breakdown[0].unit], ['ev', 25, 'ev', 25, 'kWh']);
    assert.equal(evRes.legs[0].options[0].groundCzk, ge.czk + A.parkCzk(ge, 6));
    assert.equal(evRes.legs[1].options[0].groundCzk, ge.czk);
    // dřívější Kč/km projde úseky také
    const lgRes = await search({
      trip: 'multi', adults: 2, radiusKm: 0, groundMode: 'car', kmRate: 1, carKmCzk: 5,
      legs: [{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['ap:NAP'], to: ['ap:PRG'], date: D2 }],
    }, () => {}, { providers: [p] });
    const gl = lgRes.origins.find((o) => o.iata === 'PRG').ground;
    assert.deepEqual([gl.carFuel, gl.carKmCzk, gl.fuelCzk], [null, 5, gl.roadKm * 5]);
    assert.equal(lgRes.legs[1].options[0].groundCzk, gl.czk);
    // okruh letišť: nejlevnější kombinace se vrací na letiště, kde auto parkuje (ne odlet z KLV a návrat do PRG)
    const world = [fare('PRG', 'FCO', D, 1000), fare('KLV', 'FCO', D, 500), fare('NAP', 'PRG', D2, 1100, '18:00', '20:30'), fare('NAP', 'KLV', D2, 1400, '17:00', '19:30')];
    const wide = { trip: 'multi', adults: 2, radiusKm: 120, legs: [{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['ap:NAP'], to: ['ap:PRG'], date: D2 }] };
    const rc = await search({ ...wide, groundMode: 'car' }, () => {}, { providers: [stubProvider('stub', world)] });
    const ends = (r, c) => [r.legs[0].options[c.picks[0]].out.from, r.legs[1].options[c.picks[1]].out.to];
    assert.ok(rc.combos.length >= 2 && rc.combos.every((c) => { const [a, b] = ends(rc, c); return a === b; }), JSON.stringify(rc.combos.map((c) => ends(rc, c))));
    const rt = await search({ ...wide, groundMode: 'transit' }, () => {}, { providers: [stubProvider('stub', world)] });
    assert.deepEqual(ends(rt, rt.combos[0]), ['KLV', 'PRG'], 'veřejnou dopravou smí návrat jinam');
    // i bez open-jaw (zaškrtávátko je autem vypnuté): návrat se hledá na všechna letiště začátku cesty a kombinace se vrací
    // tam, kde auto parkuje – ne jen na pražské letiště
    const rn = await search({ ...wide, groundMode: 'car', openJaw: false }, () => {}, { providers: [stubProvider('stub', world)] });
    assert.ok(rn.combos.some((c) => ends(rn, c)[0] === 'KLV') && rn.combos.every((c) => { const [a, b] = ends(rn, c); return a === b; }), JSON.stringify(rn.combos.map((c) => ends(rn, c))));
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
