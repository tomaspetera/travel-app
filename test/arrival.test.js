// Cesta z letiště příletu do města (server/lib/arrival.js, data/arrival.json): platnost ověřené tabulky (zdroj, datum,
// rozumné ceny a časy), odhad mimo tabulku, shoda s tabulkou cesty na letiště (access.js) a cesta do města v ceně
// výsledků hledání – pořadí, filtr ceny, kalendář, nejbližší dny, lety po jednom i cesta přes víc měst (zdroje nahrazené,
// žádná síť).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
const A = await import('../server/lib/arrival.js');
const { ACCESS } = await import('../server/lib/access.js');
const { getAirport, COUNTRY_BY_ISO } = await import('../server/lib/airports.js');
const { haversineKm } = await import('../server/lib/geo.js');
const { search, normalizeQuery } = await import('../server/lib/search.js');
const { makeLeg } = await import('../server/lib/fares.js');

const RAW = JSON.parse(readFileSync(new URL('../data/arrival.json', import.meta.url), 'utf8'));
const plus = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Letiště ze zadání (vzdálená „levná“ i hlavní letiště oblíbených cílů); HRG a SSH veřejnou dopravu z letiště nemají → odhad.
const WANTED = ['BVA', 'CDG', 'ORY', 'CRL', 'BRU', 'STN', 'LTN', 'LGW', 'LHR', 'SEN', 'BGY', 'MXP', 'LIN', 'TSF', 'VCE', 'CIA', 'FCO', 'NAP',
  'BLQ', 'PSA', 'FLR', 'NYO', 'ARN', 'TRF', 'OSL', 'GOT', 'HHN', 'FRA', 'NRN', 'DUS', 'CGN', 'GRO', 'REU', 'BCN', 'MAD', 'AGP', 'ALC', 'PMI',
  'VLC', 'SVQ', 'OPO', 'LIS', 'FAO', 'ATH', 'SKG', 'LCA', 'PFO', 'MLA', 'DBV', 'SPU', 'ZAG', 'BUD', 'OTP', 'SOF', 'KRK', 'WAW', 'WMI', 'GDN',
  'AMS', 'EIN', 'RTM', 'DUB', 'EDI', 'MAN', 'KEF', 'IST', 'SAW', 'AYT', 'TLV', 'RAK', 'CMN', 'HRG', 'SSH', 'DXB', 'BKK',
  // 2. kolo (10/2026): nejčastější cíle z Prahy a okolí bez ověření (živé hledání „kamkoli“ ve třech obdobích)
  'TFS', 'LPA', 'FUE', 'OVD', 'FNC', 'CFU', 'CHQ', 'JSI', 'TIA', 'BEG', 'RMO', 'CTA', 'BRI', 'PMO', 'CAG', 'GOA', 'BDS', 'RMI', 'MRS',
  'NCE', 'TLS', 'LYS', 'BJV', 'KUT', 'TBS', 'BUS', 'EVN', 'AGA', 'RBA', 'FEZ', 'TNG', 'AUH', 'SHJ', 'DOH', 'CAI', 'HKT', 'KBV', 'CNX',
  'MLE', 'CUN', 'JFK', 'EWR', 'NRT', 'HND', 'BRS', 'LPL', 'EMA', 'LBA', 'GLA', 'CPH', 'VNO', 'HEL', 'HAM', 'GVA', 'TOS', 'RVN',
  'SBZ', 'VAR'];
const ESTIMATED = ['HRG', 'SSH'];

test('tabulka: každé letiště má zdroj, datum ověření, město ve 2. pádě, rozumné jízdné a čas', () => {
  const rows = Object.entries(A.ARRIVAL);
  assert.ok(rows.length >= 70, `${rows.length} letišť`);
  assert.match(A.ARRIVAL_CHECKED, /^2026-10-\d\d$/);
  assert.match(A.ARRIVAL_FX.source, /ČNB/);
  for (const [iata, x] of rows) {
    const a = getAirport(iata);
    assert.ok(a, `${iata} je v databázi letišť`);
    assert.match(x.src, /^https:\/\/[^\s<>"']+$/, `${iata} zdroj`);
    assert.equal(x.date, A.ARRIVAL_CHECKED, `${iata} datum ověření`);
    assert.ok(typeof x.city === 'string' && x.city.length >= 3 && typeof x.gen === 'string' && x.gen.length >= 3, `${iata} město`);
    assert.ok(A.ARRIVAL_MODES.includes(x.mode), `${iata} druh dopravy ${x.mode}`);
    assert.ok(typeof x.how === 'string' && x.how.length >= 8 && x.how.length <= 90, `${iata} čím: ${x.how}`);
    assert.ok(!x.note || (typeof x.note === 'string' && x.note.length <= 140), `${iata} poznámka`);
    assert.ok(x.cur in A.ARRIVAL_FX.czk, `${iata} měna ${x.cur} má kurz`);
    assert.ok(Number.isInteger(x.min) && x.min >= 5 && x.min <= 150, `${iata} čas ${x.min} min`);
    const czk = A.fareCzk(x.fare, x.cur);
    assert.ok(czk >= 10 && czk <= 800, `${iata} jízdné ${czk} Kč`);
    // střed města, kam spoj vede, je u letiště (Hahn → Frankfurt ~100 km, Torp → Oslo ~90 km)
    const km = haversineKm(a.lat, a.lon, x.lat, x.lon);
    assert.ok(km >= 1 && km <= 120, `${iata} ${Math.round(km)} km od ${x.city}`);
    for (const k of Object.keys(x)) assert.ok(['city', 'gen', 'lat', 'lon', 'mode', 'how', 'fare', 'cur', 'from', 'min', 'sec', 'note', 'src', 'date'].includes(k), `${iata}: neznámé pole ${k}`);
  }
  // kurzy ČNB: euro kolem 24–25 Kč, ostatní kladné
  assert.ok(A.ARRIVAL_FX.czk.EUR > 23 && A.ARRIVAL_FX.czk.EUR < 26);
  assert.ok(Object.values(A.ARRIVAL_FX.czk).every((v) => v > 0));
});

test('tabulka pokrývá letiště ze zadání; bez veřejné dopravy z letiště (Hurghada, Šarm aš-Šajch) odhad', () => {
  for (const iata of WANTED) {
    const x = A.arrivalTransfer(iata);
    assert.ok(x, iata);
    assert.equal(x.basis, ESTIMATED.includes(iata) ? 'estimate' : 'table', iata);
  }
  // vzdálená letiště „levných“ aerolinek: drahá nebo dlouhá cesta do města (štítek je zvýrazní)
  const warn = (iata) => { const x = A.arrivalTransfer(iata); return x.czk > A.ARRIVAL_WARN.czk || x.min > A.ARRIVAL_WARN.min; };
  for (const iata of ['BVA', 'CRL', 'HHN', 'NRN', 'GRO', 'REU', 'NYO', 'TRF', 'SEN', 'FMM']) assert.ok(warn(iata), `${iata} je drahé nebo dlouhé`);
  for (const iata of ['LIN', 'NAP', 'BUD', 'KRK', 'WAW', 'LIS', 'OPO', 'AMS', 'DUS', 'BCN']) assert.ok(!warn(iata), `${iata} je blízko a levně`);
  // hlavní letiště s dražším vlakem (Paříž RER B / metro 14 za 14 €, Řím Leonardo Express) nejsou „past“
  for (const iata of ['CDG', 'ORY', 'FCO', 'LGW']) assert.ok(!warn(iata), `${iata} není vzdálené letiště`);
});

test('arrivalTransfer: ověřená tabulka, tabulka cesty na letiště, odhad podle vzdálenosti, neznámé letiště', () => {
  const bva = A.arrivalTransfer('bva');
  assert.deepEqual([bva.iata, bva.city, bva.gen, bva.mode, bva.fare, bva.cur, bva.czk, bva.min, bva.basis], ['BVA', 'Paříž', 'Paříže', 'bus', 17.9, 'EUR', 440, 75, 'table']);
  assert.equal(bva.km, Math.round(haversineKm(getAirport('BVA').lat, getAirport('BVA').lon, 48.8566, 2.3522)));
  assert.match(bva.src, /aeroportparisbeauvais\.com/);
  assert.equal(bva.est, undefined);
  // „od“ (online předem) a sekundární zdroj se přenesou
  assert.equal(A.arrivalTransfer('STN').from, true);
  assert.equal(A.arrivalTransfer('LGW').sec, true);
  assert.equal(A.fareCzk(2500, 'HUF'), 170);
  assert.equal(A.fareCzk(0.8, 'EUR'), 20);
  assert.equal(A.fareCzk(5, 'XXX'), null);
  // letiště z tabulky cesty na letiště (access.js): stejný spoj obráceně
  const vie = A.arrivalTransfer('VIE');
  assert.deepEqual([vie.city, vie.czk, vie.min, vie.basis, vie.est, vie.mode], ['Vídeň', ACCESS.VIE[3], ACCESS.VIE[4], 'access', undefined, 'train']);
  // text tabulky cesty na letiště je psaný směrem na letiště: „z centra“ → „do centra“, jiné místo se vynechá
  assert.equal(vie.how, 'vlak S7 / Railjet do centra (~4,40 €; CAT 14,90 €)');
  assert.equal(A.accessHow('bus E76 z hlavního nádraží (IDS JMK)'), 'bus E76 (IDS JMK)');
  assert.equal(A.accessHow('vlak do Mošnova (ODIS)'), 'vlak (ODIS)');
  assert.equal(A.accessHow('MHD bus 61 (60 min)'), 'MHD bus 61 (60 min)');
  for (const k of Object.keys(ACCESS).filter((x) => !A.ARRIVAL[x])) assert.doesNotMatch(A.arrivalTransfer(k).how, / z (?!centra)| do (?!centra)/, k);
  assert.match(vie.how, /do centra/, 'směr z letiště do města');
  // odhad: metropole se středem (Londýn-City), jinak typická vzdálenost podle velikosti letiště
  const lcy = A.arrivalTransfer('LCY');
  assert.deepEqual([lcy.city, lcy.basis, lcy.est, lcy.gen], ['Londýn', 'estimate', true, null]);
  assert.equal(lcy.km, Math.round(haversineKm(getAirport('LCY').lat, getAirport('LCY').lon, 51.5074, -0.1278)));
  const bod = A.arrivalTransfer('BOD');
  assert.equal(bod.km, A.TYPE_KM[getAirport('BOD').type]);
  // Francie (cenová hladina 4): (30 + 1,5 × 15) × 2,8 = 147 → 150 Kč; 15 + 1,1 × 15 + 10 = 41,5 → 40 min
  assert.deepEqual([bod.czk, bod.min], [150, 40]);
  const hrg = A.arrivalTransfer('HRG'); // Egypt (hladina 1): aspoň jízdenka MHD
  assert.equal(hrg.czk, 60);
  assert.equal(A.arrivalTransfer('XYZ'), null);
  assert.equal(A.arrivalCzk('XYZ'), 0);
  // let tam / zpět: počítá se jen konec mimo domov; let mezi dvěma městy oba konce
  const home = new Set(['PRG']);
  assert.equal(A.legArrivalCzk({ from: 'PRG', to: 'BVA' }, home), 440);
  assert.equal(A.legArrivalCzk({ from: 'BVA', to: 'PRG' }, home), 440);
  assert.equal(A.legArrivalCzk({ from: 'CDG', to: 'BCN' }, home), 340 + 180);
  assert.equal(A.legArrivalCzk(null, home), 0);
  assert.deepEqual([true, 1, '1', 'true'].map(A.arrivalOn), [true, true, true, true]);
  assert.deepEqual([undefined, false, 0, '0', 'yes', null].map(A.arrivalOn), [false, false, false, false, false, false]);
});

test('odhad mimo tabulku odpovídá ověřeným cenám (cenová hladina × regionální jízdné): průměrně ±30 %, většinou do 2×', () => {
  const ratios = [];
  for (const iata of Object.keys(A.ARRIVAL)) {
    const a = getAirport(iata);
    const x = A.ARRIVAL[iata];
    // odhad pro skutečnou vzdálenost do středu města (u letiště mimo metropoli ji odhad jinak nezná)
    const km = haversineKm(a.lat, a.lon, x.lat, x.lon);
    const level = A.PRICE_LEVEL[COUNTRY_BY_ISO.get(a.cc)?.cost] ?? A.PRICE_LEVEL[3];
    const est = Math.max(60, (30 + 1.5 * km) * level);
    ratios.push(est / A.fareCzk(x.fare, x.cur));
  }
  const geo = Math.exp(ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length);
  assert.ok(geo > 0.7 && geo < 1.3, `geometrický průměr odhad / skutečnost ${geo.toFixed(2)}`);
  // rozptyl je velký už z podstaty: městský autobus za pár korun (Tbilisi, Dauhá, Bari) i expres za 10–15 € (Řím,
  // Milán, Marseille) – odhad má sedět v průměru, na jednotlivém letišti jen zhruba
  const within = ratios.filter((r) => r >= 0.5 && r <= 2).length / ratios.length;
  assert.ok(within >= 0.6, `do dvojnásobku ${Math.round(within * 100)} %`);
});

test('tabulka cesty na letiště (access.js) a tabulka příletů se u společných letišť shodují', () => {
  const both = Object.keys(ACCESS).filter((iata) => A.ARRIVAL[iata]);
  assert.deepEqual(both.sort(), ['BUD', 'FMM', 'FRA', 'KRK', 'WAW', 'WMI', 'ZAG']);
  for (const iata of both) {
    const x = A.arrivalTransfer(iata);
    assert.ok(Math.abs(ACCESS[iata][3] - x.czk) <= 10, `${iata}: ${ACCESS[iata][3]} vs ${x.czk} Kč`);
    assert.ok(Math.abs(ACCESS[iata][4] - x.min) <= 10, `${iata}: ${ACCESS[iata][4]} vs ${x.min} min`);
  }
});

/* ---------- cesta do města v ceně výsledků hledání ---------- */

// Zdroj typu „trasa“ (jako Wizz Air): lety po dnech na dvojici letišť (u přesných dat i dny kolem – nejbližší dny).
function stubProvider(id, fares) {
  return {
    id, name: id, live: true,
    async stations() { return null; },
    async routes() { return null; },
    callsPerRoute: () => 1,
    async daily({ from, to, dateFrom, dateTo, near }) {
      const [lo, hi] = near ? [near.from, near.to] : [dateFrom, dateTo];
      return fares.filter((f) => f.from === from && f.to === to && f.date >= lo && f.date <= hi)
        .map((f) => makeLeg({ provider: id, carrier: 'W6', carrierName: id, from: f.from, to: f.to, dep: `${f.date}T${f.dep}:00`, arr: `${f.date}T${f.arr}:00`, czk: f.czk, bookUrl: `https://example.com/${f.from}${f.to}` }));
    },
  };
}
const fx = () => stubFetch((url) => (url.includes('open.er-api.com') ? { body: { result: 'success', rates: { EUR: 1, CZK: 25 } } } : { status: 404, body: '{}' }));
const D = ymdPlus(40);
const f = (from, to, date, czk, dep = '07:00', arr = '09:00') => ({ from, to, date, czk, dep, arr });
// Praha → Paříž: Beauvais o 300 Kč levnější letenka než Orly, ale cesta do města 440 Kč každým směrem (Orly 340 Kč)
const PARIS = [
  f('PRG', 'BVA', D, 1000), f('BVA', 'PRG', plus(D, 4), 1000, '18:00', '20:00'),
  f('PRG', 'ORY', D, 1150, '08:30', '10:30'), f('ORY', 'PRG', plus(D, 4), 1150, '19:30', '21:30'),
  f('PRG', 'BVA', plus(D, 1), 1400), f('BVA', 'PRG', plus(D, 5), 1400, '18:00', '20:00'),
];
// bez open-jaw (přílet BVA, odlet ORY by byla další kombinace) – jde o pořadí stejných tras
const parisQuery = (extra = {}) => ({ from: ['ap:PRG'], to: ['metro:PAR'], trip: 'return', dateFrom: D, dateTo: plus(D, 1), nightsMin: 4, nightsMax: 4, radiusKm: 0, kmRate: 0, adults: 2, openJaw: false, ...extra });

test('normalizeQuery: cesta do města v ceně jen se zapnutou volbou (dřívější dotazy pole nemají)', () => {
  assert.equal(normalizeQuery({ from: ['ap:PRG'] }).arrival, false);
  assert.equal(normalizeQuery({ from: ['ap:PRG'], arrival: true }).arrival, true);
  assert.equal(normalizeQuery({ trip: 'multi', legs: [{ from: ['ap:PRG'], to: ['ap:BCN'], date: D }, { from: ['ap:BCN'], to: ['ap:PRG'], date: plus(D, 3) }], arrival: true }).arrival, true);
});

test('search: cesta z letiště do města tam i zpět v ceně a v pořadí – „levné“ Beauvais je ve skutečnosti dražší než Orly', async () => {
  const stub = fx();
  try {
    const p = stubProvider('stub', PARIS);
    // bez volby: jen letenky (dřívější chování), cesta do města jen jako informace u letišť
    const off = await search(parisQuery(), () => {}, { providers: [p] });
    assert.equal(off.query.arrival, false);
    assert.deepEqual(off.top.map((t) => [t.out.to, t.perPersonCzk, t.arrCzk]), [['BVA', 2000, 0], ['ORY', 2300, 0], ['BVA', 2800, 0]]);
    assert.deepEqual(Object.keys(off.arrivals).sort(), ['BVA', 'ORY']);
    assert.deepEqual([off.arrivals.BVA.czk, off.arrivals.BVA.gen, off.arrivals.ORY.czk], [440, 'Paříže', 340]);
    assert.equal(off.arrivals.PRG, undefined, 'letiště domova ne');

    const on = await search(parisQuery({ arrival: true }), () => {}, { providers: [p] });
    assert.equal(on.query.arrival, true);
    // Orly 2 300 + 2 × 340 = 2 980 Kč, Beauvais 2 000 + 2 × 440 = 2 880 Kč … a dražší termín Beauvais 2 800 + 880
    assert.deepEqual(on.top.map((t) => [t.out.to, t.perPersonCzk, t.arrCzk]), [['BVA', 2880, 880], ['ORY', 2980, 680], ['BVA', 3680, 880]]);
    for (const t of on.top) {
      assert.equal(t.perPersonCzk, t.flightCzk + t.groundCzk + t.bagCzk + t.arrCzk);
      assert.equal(t.totalCzk, t.perPersonCzk * 2);
    }
    // kalendář (nejlevnější cesta podle dne odletu) i se cestou do města
    assert.deepEqual(on.calendar.out.map((c) => [c.date, c.cost]), [[D, 2880], [plus(D, 1), 3680]]);
    // filtr nejvyšší ceny počítá i s ní
    const capped = await search(parisQuery({ arrival: true, maxPrice: 2900 }), () => {}, { providers: [p] });
    assert.deepEqual(capped.top.map((t) => t.out.to), ['BVA']);
    assert.equal(capped.filters.hidden.maxPrice, 2);
    // jen tam: jeden směr
    const one = await search(parisQuery({ arrival: true, trip: 'oneway', dateTo: D }), () => {}, { providers: [p] });
    assert.deepEqual(one.top.map((t) => [t.out.to, t.perPersonCzk, t.arrCzk]), [['BVA', 1440, 440], ['ORY', 1490, 340]]);
  } finally {
    stub.restore();
  }
});

test('search: open-jaw v cíli (přílet BGY, odlet MXP) a přesná data – lety po jednom s cestou do města, nejbližší dny', async () => {
  const stub = fx();
  try {
    const p = stubProvider('stub', [
      f('PRG', 'BGY', D, 900), f('MXP', 'PRG', plus(D, 3), 900, '19:00', '21:00'), f('BGY', 'PRG', plus(D, 3), 1300, '20:15', '22:15'),
      f('PRG', 'BGY', plus(D, 1), 700),
    ]);
    const res = await search({ from: ['ap:PRG'], to: ['metro:MIL'], trip: 'return', exactOut: D, exactBack: plus(D, 3), radiusKm: 0, kmRate: 0, arrival: true }, () => {}, { providers: [p] });
    const jaw = res.top.find((t) => t.back.from === 'MXP');
    // BGY → Milán 5 € (120 Kč), Milán → MXP 15 € (370 Kč)
    assert.deepEqual([jaw.arrCzk, jaw.perPersonCzk], [120 + 370, 1800 + 490]);
    assert.deepEqual([jaw.out.arrCzk, jaw.back.arrCzk], [120, 370], 'přesná data: po letech');
    const same = res.top.find((t) => t.back.from === 'BGY');
    assert.equal(same.arrCzk, 240);
    assert.ok(res.top[0] === jaw, 'pořadí i s cestou do města');
    // nejbližší dny: den vedle s levnější letenkou i s cestou do města
    const next = res.nearby.out.days.find((d) => d.date === plus(D, 1));
    assert.equal(next.cost, 700 + 120);
    assert.deepEqual(Object.keys(res.arrivals).sort(), ['BGY', 'MXP']);
  } finally {
    stub.restore();
  }
});

test('search multi: lety mezi městy mají cestu do města na obou koncích, návrat domů jen u příletu do města', async () => {
  const stub = fx();
  try {
    const D2 = plus(D, 3);
    const D3 = plus(D, 6);
    const p = stubProvider('stub', [
      f('PRG', 'BVA', D, 1000), f('CDG', 'BCN', D2, 1500, '10:00', '12:00'), f('BCN', 'PRG', D3, 1200, '18:00', '20:30'),
    ]);
    const res = await search({
      trip: 'multi', radiusKm: 0, kmRate: 0, arrival: true, legs: [
        { from: ['ap:PRG'], to: ['metro:PAR'], date: D }, { from: ['metro:PAR'], to: ['ap:BCN'], date: D2 }, { from: ['ap:BCN'], to: ['ap:PRG'], date: D3 },
      ],
    }, () => {}, { providers: [p] });
    const [a, b, c] = res.legs.map((l) => l.options[0]);
    assert.deepEqual([a.arrCzk, b.arrCzk, c.arrCzk], [440, 340 + 180, 180]);
    assert.deepEqual([a.perPersonCzk, b.perPersonCzk, c.perPersonCzk], [1440, 2020, 1380]);
    assert.equal(res.combos.length, 1);
    assert.deepEqual([res.combos[0].perPersonCzk, res.combos[0].arrCzk, res.combos[0].flightCzk], [4840, 1140, 3700]);
    assert.deepEqual(Object.keys(res.arrivals).sort(), ['BCN', 'BVA', 'CDG']);
    // bez volby se nic nepřičte, štítky zůstanou
    const off = await search({
      trip: 'multi', radiusKm: 0, kmRate: 0, legs: [
        { from: ['ap:PRG'], to: ['metro:PAR'], date: D }, { from: ['metro:PAR'], to: ['ap:BCN'], date: D2 }, { from: ['ap:BCN'], to: ['ap:PRG'], date: D3 },
      ],
    }, () => {}, { providers: [p] });
    assert.deepEqual([off.combos[0].perPersonCzk, off.combos[0].arrCzk], [3700, 0]);
    assert.ok(off.arrivals.BVA && off.arrivals.CDG);
  } finally {
    stub.restore();
  }
});

/* ---------- prohlížeč: štítky u nabídek, složené cesty, průvodce cestou ---------- */
// Klasické skripty (public/js) načtené přes node:vm jako v test/ground-ui.test.js.
import vm from 'node:vm';

const src = (file) => readFileSync(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
function loadUi() {
  const ctx = { window: {}, URLSearchParams, URL, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  vm.runInContext(src('planshare.js'), ctx, { filename: 'planshare.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('ground.js'), ctx, { filename: 'ground.js' });
  vm.runInContext(src('searchhelp.js'), ctx, { filename: 'searchhelp.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx.window;
}
const W = loadUi();
const H = W.SearchHelp;
const plain = (x) => JSON.parse(JSON.stringify(x));
const ARR = Object.fromEntries(['BVA', 'BGY', 'MXP', 'BOD', 'VIE', 'LGW', 'STN'].map((x) => [x, plain(A.arrivalTransfer(x))]));

test('štítek u nabídky: „🚌 z letiště BVA do Paříže 17,90 € (~440 Kč) · 1 h 15“, drahá / dlouhá cesta varovně, rozpis v title', () => {
  assert.deepEqual(plain(H.ARRIVAL_WARN), plain(A.ARRIVAL_WARN), 'stejné meze jako server');
  const [bva] = H.arrivalChips({ out: { to: 'BVA' }, back: { from: 'BVA' }, arrCzk: 880 }, ARR, { on: true });
  assert.equal(bva.text, '🚌 z letiště BVA do Paříže 17,90 € (~440 Kč) · 1 h 15');
  assert.equal(bva.warn, true);
  assert.match(bva.title, /^Z letiště BVA do Paříže: autobus Aérobus do Paris Porte Maillot – 17,90 € \(~440 Kč\) na osobu, ~1 h 15\. Online; na místě 18 €\. Zpět na letiště totéž\./);
  // za čas se k datu ověření přidá stáří („· před 4 měsíci“) – test nesmí záviset na dnešku
  assert.match(bva.title, /V ceně nabídky tam i zpět ~880 Kč\/os\. Zdroj: aeroportparisbeauvais\.com, ověřeno 7\. 10\. 2026(?: · [^.]+)?\.$/);
  // open-jaw v cíli: přílet BGY (od 5 € online), odlet MXP (vlak 15 € → varovně, přes 350 Kč)
  const jaw = H.arrivalChips({ out: { to: 'BGY' }, back: { from: 'MXP' }, arrCzk: 490 }, ARR, { on: true });
  assert.deepEqual(plain(jaw.map((c) => [c.text, c.warn])), [['🚌 z letiště BGY do Milána od 5 € (~120 Kč) · 50 min', false], ['🚆 zpět na letiště MXP 15 € (~370 Kč) · 37 min', true]]);
  // opačným směrem bez cíle cesty do města („do Milano Cadorna“), přestupy v opačném pořadí
  assert.match(jaw[1].title, /^Z Milána na letiště MXP: vlak Malpensa Express – 15 € \(~370 Kč\) na osobu, ~37 min/);
  // cesta přes víc měst: z města na letiště odletu i z letiště příletu do města, letiště domova bez štítku
  const ML = Object.fromEntries(['REU', 'BCN', 'ARN'].map((x) => [x, plain(A.arrivalTransfer(x))]));
  const last = H.arrivalLegChips({ from: 'REU', to: 'PRG' }, ML, new Set(['PRG']), { on: true });
  assert.deepEqual(plain(last.map((c) => [c.text, c.warn])), [['🚌 z Barcelony na letiště REU 18,50 € (~450 Kč) · 1 h 40', true]]);
  assert.match(last[0].title, /^Z Barcelony na letiště REU: autobus Monbus – 18,50 € \(~450 Kč\) na osobu, ~1 h 40\. .* V ceně nabídky ~450 Kč\/os\./);
  const mid = H.arrivalLegChips({ from: 'ARN', to: 'BCN' }, ML, new Set(['PRG']));
  assert.deepEqual(plain(mid.map((c) => c.text)), ['🚌 ze Stockholmu na letiště ARN od 129 SEK (~280 Kč) · 40 min', '🚌 z letiště BCN do Barcelony 7,45 € (~180 Kč) · 35 min']);
  assert.match(mid[0].title, /^Ze Stockholmu na letiště ARN: autobus Flygbussarna – od 129 SEK/);
  assert.deepEqual(plain(H.arrivalLegChips({ from: 'PRG', to: 'XXX' }, ML, new Set(['PRG']))), []);
  assert.equal(H.arrivalVia('metro 14 do Châtelet'), 'metro 14');
  assert.equal(H.arrivalVia('autobus KM na nádraží Modlin + vlak KM do centra'), 'vlak KM + autobus KM');
  assert.equal(H.arrivalVia('MHD – bus 59 + metro A (PID 90 min)'), 'MHD – bus 59 + metro A (PID 90 min)');
  for (const [k, x] of Object.entries(A.ARRIVAL)) assert.match(H.arrivalVia(x.how), /^\S.{2,}$/, k);
  // odhad mimo tabulku: bez měny a zdroje, „(odhad)“ i s tím, z čeho vychází
  const [bod] = H.arrivalChips({ out: { to: 'BOD' } }, ARR, { on: true });
  assert.equal(bod.text, '🚌 z letiště BOD do centra ~150 Kč · 40 min (odhad)');
  assert.match(bod.title, /odhad ~150 Kč na osobu, ~40 min – podle vzdálenosti letiště od města \(~15 km\)/);
  assert.doesNotMatch(bod.title, /Zdroj/);
  // tabulka cesty na letiště (Vídeň) je taky jen odhad
  assert.match(H.arrivalChips({ out: { to: 'VIE' } }, ARR)[0].text, /^🚆 z letiště VIE do centra ~110 Kč · 40 min \(odhad\)$/);
  // „od“ (online předem) a sekundární zdroj
  assert.equal(H.arrivalChips({ out: { to: 'STN' } }, ARR)[0].text, '🚆 z letiště STN do Londýna od 9,90 £ (~280 Kč) · 48 min');
  assert.match(H.arrivalChips({ out: { to: 'LGW' } }, ARR)[0].title, /Zdroj \(sekundární, oficiální neuvádí\): lasttrip\.uk/);
  // vypnuto: informace zůstane, jen se nepočítá do ceny
  assert.match(H.arrivalChips({ out: { to: 'BVA' } }, ARR, { on: false })[0].title, /Do ceny nabídky se nepočítá \(vypnuto v Další možnosti\)\./);
  assert.deepEqual(plain(H.arrivalChips({ out: { to: 'XXX' } }, ARR)), []);
  assert.deepEqual(plain(H.arrivalChips({ out: { to: 'BVA' } }, null)), []);
  assert.equal(H.arrivalFare({ czk: 2500 * 0.06688, fare: 2500, cur: 'HUF' }), '2 500 Ft (~167 Kč)');
});

test('složená cesta ze dvou letenek (přesná data) počítá cestu do města jako server; starší výsledky bez ní', () => {
  const leg = (from, to, date, czk, arrCzk) => ({ from, to, date, dep: `${date}T08:00:00`, arr: `${date}T10:00:00`, hasTime: true, czk, groundCzk: 50, bagCzk: 0, provider: 'x', carrier: 'X', ...(arrCzk != null ? { arrCzk } : {}) });
  const ot = { out: leg('PRG', 'BGY', D, 900, 120), destKey: 'MIL' };
  const bt = { back: leg('MXP', 'PRG', plus(D, 3), 900, 370), destKey: 'MIL' };
  const t = H.composeTrip(ot, bt, { adults: 2 });
  assert.deepEqual([t.arrCzk, t.perPersonCzk, t.totalCzk], [490, 1800 + 100 + 490, (1800 + 100 + 490) * 2]);
  const old = H.composeTrip({ out: leg('PRG', 'BGY', D, 900), destKey: 'MIL' }, { back: leg('MXP', 'PRG', plus(D, 3), 900), destKey: 'MIL' });
  assert.deepEqual([old.arrCzk, old.perPersonCzk], [0, 1900]);
});

test('průvodce cestou: cesta z letiště do města v ceně (bez úseku, který nahradí půjčené auto), sdílený odkaz ji vyčistí', () => {
  const { Trip } = W;
  const leg = (from, to, date, dep, arr) => ({ from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, carrier: 'W6', carrierName: 'Wizz Air', fromTz: 'Europe/Prague', toTz: 'Europe/Paris' });
  const trip = (over = {}) => ({
    v: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary',
    flight: { out: leg('PRG', 'BVA', D, '07:00', '09:00'), back: leg('BVA', 'PRG', plus(D, 4), '18:00', '20:00'), flightCzk: 2000, groundCzk: 100, bagCzk: 0, arrCzk: 880 },
    arrival: { out: ARR.BVA, back: ARR.BVA },
    dest: { label: 'Paříž', country: 'Francie', cc: 'FR', lat: 48.86, lon: 2.35 }, ground: {}, stay: null, car: null, plan: null, overland: null, ...over,
  });
  const c = Trip.costs(trip());
  assert.deepEqual([c.flights, c.ground, c.arrival, c.total, c.perPerson], [4000, 200, 1760, 5960, 2980]);
  // auto vyzvednuté na letišti příletu (a vrácené na letišti odletu): autobus do města odpadá
  const car = (pickup, dropoff) => ({ mode: 'manual', totalCzk: 3000, pickup, dropoff, from: `${D}T10:00`, to: `${plus(D, 4)}T15:00` });
  assert.equal(Trip.costs(trip({ car: car('BVA', 'CDG') })).arrival, 880);
  assert.equal(Trip.costs(trip({ car: car('BVA', 'BVA') })).arrival, 0);
  assert.equal(Trip.costs(trip({ car: { mode: 'skip', totalCzk: 0 } })).arrival, 1760);
  // hledání bez volby (arrCzk 0): nic, i když je cesta do města známá; starší cesta bez rozpisu po směrech: celá
  assert.equal(Trip.costs(trip({ flight: { ...trip().flight, arrCzk: 0 } })).arrival, 0);
  assert.equal(Trip.costs(trip({ arrival: null, car: car('BVA', 'BVA') })).arrival, 1760);
  // trasa přes víc míst: přejezdy v ceně – autem palivo (i z letiště a na letiště), vlakem jízdenky mezi místy na osobu
  const x = (km, fuelCzk, fareCzk) => ({ km, carMin: 60, transitMin: 90, transitKind: 'rail', basis: 'estimate', fuelCzk, fareCzk });
  const route = (transport) => ({ mode: 'multi', transport, bases: [{ name: 'Paříž', nights: 2, lat: 48.86, lon: 2.35 }, { name: 'Remeš', nights: 2, lat: 49.26, lon: 4.03 }], transfers: [x(140, 420, 210)], legs: { arrival: x(80, 240, 150), departure: x(90, 270, 160) } });
  const base = Trip.costs(trip()).total;
  // autem: konce (letiště ↔ 1./poslední místo) jen s autem z/na letiště – jinak je kryje doprava z letiště
  const carRoute = Trip.costs(trip({ route: route('car') }));
  assert.equal(carRoute.transfers, 420);
  assert.equal(carRoute.total, base + 420);
  assert.equal(Trip.costs(trip({ route: route('car'), car: car('BVA', 'BVA') })).transfers, 420 + 240 + 270);
  // vlakem: mezi místy a z posledního místa (Remeš, 130 km od Paříže) na letiště; z letiště do Paříže pokrývá doprava z letiště
  assert.equal(Trip.costs(trip({ route: route('transit') })).transfers, (210 + 160) * 2);
  assert.equal(Trip.costs(trip({ route: route('transit'), flight: { ...trip().flight, arrCzk: 0 } })).transfers, (150 + 210 + 160) * 2, 'bez dopravy z letiště v ceně i první úsek');
  assert.equal(Trip.costs(trip({ route: { ...route('car'), transfers: [x(140)], legs: {} } })).transfers, 0, 'starší trasa bez odhadu');
  assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify(trip({ route: route('car') })))).route.transfers[0].fuelCzk, 420);
  // sdílený odkaz: jen známá pole, čísla v mezích, zdroj jen https
  const san = Trip.sanitizeTrip(JSON.parse(JSON.stringify(trip({ arrival: { out: { ...ARR.BVA, src: 'javascript:alert(1)', evil: '<b>x</b>', czk: 440 }, back: { iata: 'bad!', czk: 1, min: 5 } } }))));
  assert.equal(san.arrival.out.iata, 'BVA');
  assert.equal(san.arrival.out.src, undefined);
  assert.equal(san.arrival.out.evil, undefined);
  assert.deepEqual([san.arrival.out.czk, san.arrival.out.min, san.arrival.out.gen, san.arrival.out.basis], [440, 75, 'Paříže', 'table']);
  assert.equal(san.arrival.back, null);
  assert.equal(san.flight.arrCzk, 880);
  assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify(trip({ arrival: 'x' })))).arrival, null);
  assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify(trip({ flight: { ...trip().flight, arrCzk: -5 } })))).flight.arrCzk, 0);
});
