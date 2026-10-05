// Podnebí (NASA POWER, data/climate.json) a hledání „za teplem“: buňky, filtr podle teploty,
// Kiwi prohledává jen teplé země (stejný nebo menší počet dotazů).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';

process.env.ATLAS_MOCK = '0';
process.env.RYANAIR_ENABLED = '0';
process.env.WIZZ_ENABLED = '0';
process.env.KIWI_ENABLED = '1';
process.env.TRAVELPAYOUTS_TOKEN = '';
const { cellKey, climateAt, airportClimate, monthClimate, warmAirports, countryClimate } = await import('../server/lib/climate.js');
const { search, normalizeQuery } = await import('../server/lib/search.js');
const { LONG_HAUL_SWEEP } = await import('../server/lib/longhaul.js');
const { resetKiwi } = await import('../server/providers/kiwi.js');
const { setRates, FALLBACK_EUR } = await import('../server/lib/fx.js');

setRates({ base: 'EUR', rates: { ...FALLBACK_EUR, CZK: 25 }, source: 'test' });

// Nejbližší budoucí měsíc m (1–12) aspoň týden od dneška: [od, do] = dny 5–25.
function nextMonth(m) {
  const t = new Date();
  let y = t.getFullYear();
  if (new Date(Date.UTC(y, m - 1, 5)) < new Date(Date.now() + 7 * 864e5)) y++;
  const p = (d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return [p(5), p(25)];
}

test('buňky po 0,5°: zaokrouhlení i u záporných souřadnic', () => {
  assert.equal(cellKey(49.76, 14.26), '50,14.5');
  assert.equal(cellKey(-8.76, -14.24), '-9,-14');
  assert.equal(cellKey(-0.2, -0.2), '0,0');
  assert.equal(cellKey(28.04, -16.57), '28,-16.5');
});

test('podnebí u letiště, v měsíci a náhradní sousední buňka do 1°', () => {
  const prg = airportClimate('prg');
  assert.equal(prg.hi.length, 12);
  assert.equal(prg.lo.length, 12);
  assert.equal(prg.p.length, 12);
  assert.ok(prg.hi[6] > prg.hi[0] + 15, 'v Praze je v červenci výrazně tepleji než v lednu');
  assert.ok(prg.hi.every((h, i) => h >= prg.lo[i]));
  assert.deepEqual(monthClimate('PRG', '2027-07-14'), { m: 7, hi: prg.hi[6], lo: prg.lo[6], p: prg.p[6] });
  assert.ok(monthClimate('BKK', '2027-01-10').hi >= 28, 'Bangkok v lednu');
  assert.equal(monthClimate('PRG', 'nesmysl'), null);
  assert.equal(monthClimate('ZZZ', '2027-01-10'), null);
  // stejná buňka jako letiště
  assert.deepEqual(climateAt(50.1, 14.26), airportClimate('PRG'));
  // oceán u Ascensionu: vlastní buňka chybí → nejbližší sousední (letiště ASI)
  assert.deepEqual(climateAt(-8.8, -15.2), airportClimate('ASI'));
  assert.equal(climateAt(0, -30), null, 'uprostřed Atlantiku nic do 1°');
  assert.equal(climateAt(95, 0), null);
  assert.equal(climateAt('x', 14), null);
});

test('teplá letiště země a podnebí hlavního letiště země', () => {
  assert.equal(warmAirports('ES', [1], 25), null, 'Španělsko v lednu ≥ 25 °C ne');
  const es = warmAirports('ES', [11], 20);
  assert.ok(es.airports.includes('TFS') && es.airports.includes('LPA'), 'v listopadu Kanáry');
  assert.ok(!es.airports.includes('BCN') && !es.airports.includes('MAD'));
  assert.equal(es.most, false, 'teplá je jen menší část Španělska');
  assert.equal(warmAirports('TH', [1], 25).most, true);
  assert.deepEqual(warmAirports('EG', [1], 20).airports.includes('CAI'), false, 'Káhira v lednu pod 20 °C');
  const th = countryClimate('th');
  assert.equal(th.iata, 'BKK');
  assert.equal(th.city, 'Bangkok');
  assert.equal(th.hi.length, 12);
  assert.equal(countryClimate('XX'), null);
});

test('normalizeQuery: minTemp je null nebo celé číslo 15–35', () => {
  const q = (minTemp) => normalizeQuery({ from: ['ap:PRG'], minTemp }).minTemp;
  assert.equal(q(undefined), null);
  assert.equal(q(null), null);
  assert.equal(q(''), null);
  assert.equal(q(0), null);
  assert.equal(q('abc'), null);
  assert.equal(q(25), 25);
  assert.equal(q('20'), 20);
  assert.equal(q(22.4), 22);
  assert.equal(q(5), 15);
  assert.equal(q(99), 35);
});

// Kiwi MCP: každý dotaz vrátí let do prvního cíle z flyTo (země → typické letiště) a navíc do Barcelony.
const DEST = { anywhere: 'BCN', ES: 'BCN', TH: 'BKK', MX: 'CUN', DO: 'PUJ', LK: 'CMB', MV: 'MLE', ID: 'DPS', VN: 'SGN', KE: 'MBA', TZ: 'ZNZ', EG: 'HRG', MA: 'RAK', AE: 'DXB', OM: 'MCT', CV: 'SID', QA: 'DOH', US: 'JFK', JP: 'NRT' };
function kiwiHandler(calls) {
  return (url, init) => {
    if (url !== 'https://mcp.kiwi.com') return { status: 404, body: '{}' };
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return { body: { jsonrpc: '2.0', id: body.id, result: {} }, headers: { 'content-type': 'application/json', 'mcp-session-id': 's1' } };
    if (body.method === 'notifications/initialized') return { status: 202, body: '' };
    const a = body.params.arguments;
    calls.push(a);
    const d = `${a.departureDate.slice(6)}-${a.departureDate.slice(3, 5)}-${a.departureDate.slice(0, 2)}`;
    const first = String(a.flyTo).split(',')[0];
    const leg = (to, h) => ({ from: 'PRG', to, departureTime: `${d}T${h}:00:00`, arrivalTime: `${d}T${h + 4}:00:00`, durationSeconds: 14400, stops: 1, segments: [] });
    const its = [...new Set([DEST[first] || first, 'BCN'])].map((to, i) => ({ price: 300 + i * 10, bookingUrl: `https://www.kiwi.com/booking?${to}`, outbound: leg(to, 10 + i) }));
    const text = JSON.stringify({ currency: 'EUR', passengers: { adults: a.adults }, resultsCount: its.length, itineraries: its });
    return { body: { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text }] } } };
  };
}
async function kiwiSearch(body) {
  resetKiwi();
  const calls = [];
  const stub = stubFetch(kiwiHandler(calls));
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, trip: 'oneway', kmRate: 0, ...body });
    return { r, calls };
  } finally {
    stub.restore();
  }
}

test('kamkoliv za teplem v lednu: místo „kamkoliv“ a Evropy jen teplé země, dotazů ne víc', async () => {
  const [dateFrom, dateTo] = nextMonth(1);
  // jiný počet cestujících, ať se dotazy neberou z mezipaměti Kiwi
  const plain = await kiwiSearch({ dateFrom, dateTo, adults: 2 });
  assert.deepEqual(plain.calls.map((a) => a.flyTo), ['anywhere', ...LONG_HAUL_SWEEP], 'bez filtru beze změny');

  const { r, calls } = await kiwiSearch({ dateFrom, dateTo, minTemp: 25 });
  const to = calls.map((a) => a.flyTo);
  assert.ok(calls.length <= plain.calls.length, 'stejně nebo méně dotazů');
  assert.ok(!to.includes('anywhere') && !to.includes('ES') && !to.includes('EG'), `v lednu ≥ 25 °C není Evropa ani Egypt: ${to}`);
  assert.ok(to.includes('TH'), 'Thajsko je teplé celé → dotaz na zemi');
  const mx = to.find((x) => x.includes('CUN'));
  assert.ok(mx && !mx.includes('MEX'), 'z Mexika jen teplá letiště (Cancún ano, Ciudad de México ne)');
  assert.match(r.providers.find((p) => p.id === 'kiwi').note, /za teplem ≥ 25 °C: .*TH/);
  // výsledky: jen teplé cíle, Barcelona (v lednu ~12 °C) vyřazena
  assert.ok(r.groups.length > 3);
  assert.ok(r.groups.every((g) => g.best.tempHi >= 25 && g.options.every((t) => t.tempHi >= 25)));
  assert.ok(!r.groups.some((g) => g.dest.airports.includes('BCN')));
  const bkk = r.groups.find((g) => g.dest.airports.includes('BKK'));
  assert.equal(bkk.dest.climate.m, 1);
  assert.equal(bkk.dest.climate.hi, bkk.best.tempHi);
  assert.equal(r.warm.minTemp, 25);
  assert.ok(r.warm.dropped >= 1 && r.warm.dests === 1);
  assert.ok(r.warm.maxHi < 25);
});

test('za teplem ≥ 20 °C v lednu: Egypt a Maroko jen přes teplá letiště', async () => {
  const [dateFrom, dateTo] = nextMonth(1);
  const { calls } = await kiwiSearch({ dateFrom, dateTo, minTemp: 20 });
  const to = calls.map((a) => a.flyTo);
  const eg = to.find((x) => x.includes('HRG'));
  assert.ok(eg && !eg.includes('CAI'), `Hurghada ano, Káhira ne: ${eg}`);
  assert.ok(to.some((x) => x.split(',').includes('AGA')), 'Agadir');
  assert.ok(!to.includes('anywhere'));
});

test('za teplem v červenci: teplo je i ve většině Evropy → „kamkoliv“ zůstává, k tomu jižní Evropa', async () => {
  const [dateFrom, dateTo] = nextMonth(7);
  const { calls } = await kiwiSearch({ dateFrom, dateTo, minTemp: 25 });
  const to = calls.map((a) => a.flyTo);
  assert.equal(to[0], 'anywhere');
  const es = to.find((x) => x.split(',').includes('AGP'));
  assert.ok(es && !es.includes('BIO'), `Španělsko bez chladnějšího severu: ${es}`);
  assert.ok(to.includes('GR'), String(to));
  assert.ok(calls.length <= 1 + LONG_HAUL_SWEEP.length);
  assert.ok(calls.every((a) => a.flyFrom === 'PRG'), 'do Evropy bez přestupních letišť');
});

test('země za teplem: Španělsko v listopadu = Kanárské ostrovy, ne celá země', async () => {
  const [dateFrom, dateTo] = nextMonth(11);
  const { r, calls } = await kiwiSearch({ to: ['cc:ES'], dateFrom, dateTo, minTemp: 20 });
  assert.equal(calls.length, 1);
  const list = calls[0].flyTo.split(',');
  assert.ok(list.includes('TFS') && list.includes('LPA') && !list.includes('BCN'), calls[0].flyTo);
  assert.ok(r.groups.length >= 1 && r.groups.every((g) => g.best.tempHi >= 20));
  // bez teplého místa ve výběru: běžné hledání (výsledky vyřadí filtr) a vysvětlení s nejteplejším cílem
  const cold = await kiwiSearch({ to: ['cc:ES'], dateFrom: nextMonth(1)[0], dateTo: nextMonth(1)[1], minTemp: 30 });
  assert.deepEqual(cold.calls.map((a) => a.flyTo), ['ES']);
  assert.equal(cold.r.groups.length, 0);
  assert.ok(cold.r.warm.dropped >= 1 && cold.r.warm.maxHi < 30);
  assert.ok(cold.r.warm.destHi >= cold.r.warm.maxHi && cold.r.warm.destHi < 30, 'nejtepleji, jak ve Španělsku v lednu bývá');
});
