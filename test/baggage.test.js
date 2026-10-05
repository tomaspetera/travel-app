// Zavazadla: odhad příplatků podle dopravce, víc dopravců na jednom letu, dálkové lety,
// volba `bags` v dotazu a započtení do ceny a pořadí výsledků (cena letenky ani výhodnost se nemění).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
process.env.RYANAIR_ENABLED = '0';
process.env.WIZZ_ENABLED = '0';
process.env.KIWI_ENABLED = '1';
process.env.TRAVELPAYOUTS_TOKEN = '';
const { search, normalizeQuery, legBagCzk } = await import('../server/lib/search.js');
const { bagFeeEur, legBagEur } = await import('../server/lib/baggage.js');
const { bestRoundTrips, bestOneWays, oneWayCalendar } = await import('../server/lib/optimizer.js');
const { makeLeg } = await import('../server/lib/fares.js');
const { resetKiwi } = await import('../server/providers/kiwi.js');
const { setRates, FALLBACK_EUR } = await import('../server/lib/fx.js');

setRates({ base: 'EUR', rates: { ...FALLBACK_EUR, CZK: 25 }, source: 'test' });

const fee = (code, kind, longHaul = false) => bagFeeEur(code, kind, { longHaul }).eur;

test('bagFeeEur: nízkonákladovka platí za kabinový i odbavený kufr, Emirates má obojí v ceně', () => {
  for (const code of ['FR', 'W6', 'U2']) {
    assert.ok(fee(code, 'cabin') > 0, `${code}: kabinový kufr za příplatek`);
    assert.ok(fee(code, 'checked') > 0, `${code}: kufr k odbavení za příplatek`);
    assert.equal(bagFeeEur(code, 'cabin').estimated, false);
  }
  assert.deepEqual(bagFeeEur('EK', 'cabin'), { eur: 0, estimated: false });
  assert.deepEqual(bagFeeEur('EK', 'checked', { longHaul: true }), { eur: 0, estimated: false });
  assert.equal(fee('fr', 'cabin'), fee('FR', 'cabin'), 'kód nezávisí na velikosti písmen');
  assert.equal(fee('RK', 'checked'), fee('FR', 'checked'), 'Ryanair UK = Ryanair');
});

test('bagFeeEur: jen malé zavazadlo = 0, neznámý dopravce = výchozí odhad s příznakem', () => {
  assert.deepEqual(bagFeeEur('FR', 'none'), { eur: 0, estimated: false });
  assert.deepEqual(bagFeeEur('FR', undefined), { eur: 0, estimated: false });
  const u = bagFeeEur('ZZ', 'checked');
  assert.equal(u.estimated, true);
  assert.ok(u.eur > 0 && u.eur < 100, 'po Evropě se kufr u neznámého dopravce platí');
  assert.ok(fee('ZZ', 'cabin') > 0, 'po Evropě se u neznámého dopravce platí i kabinový kufr');
  assert.equal(bagFeeEur(null, 'cabin').estimated, true);
  // dálkový let neznámého dopravce: nejspíš síťový dopravce s kufrem v ceně – pořád jen odhad
  assert.deepEqual(bagFeeEur('', 'checked', { longHaul: true }), { eur: 0, estimated: true });
  assert.deepEqual(bagFeeEur('ZZ', 'cabin', { longHaul: true }), { eur: 0, estimated: true });
  // dopravce v tabulce, ale neověřený řádek → také odhad
  assert.equal(bagFeeEur('E4', 'checked').estimated, true);
  assert.equal(bagFeeEur('TG', 'checked', { longHaul: true }).estimated, false);
});

test('bagFeeEur: dálkový let má vlastní cenu kufru (nebo ho má v ceně), kabinového kufru se netýká', () => {
  assert.equal(fee('TK', 'checked', true), 0, 'Turkish: na dálkovém letu kufr v ceně');
  assert.ok(fee('TK', 'checked') > 0, 'Turkish: po Evropě se platí');
  assert.ok(fee('LH', 'checked', true) > fee('LH', 'checked'), 'Lufthansa Light: dálkový kufr je dražší');
  assert.equal(fee('LH', 'cabin', true), fee('LH', 'cabin', false));
  // dopravce bez zvláštní dálkové ceny: stejně jako po Evropě
  assert.equal(fee('FR', 'checked', true), fee('FR', 'checked', false));
});

test('legBagEur: víc dopravců platí každý zvlášť, tentýž a skupina jednou, Ryanair a spol. za každý úsek', () => {
  const sum = (codes, kind) => legBagEur({ carrier: codes[0], carriers: codes }, kind).eur;
  assert.equal(sum(['FR', 'W6'], 'cabin'), fee('FR', 'cabin') + fee('W6', 'cabin'));
  assert.equal(sum(['FR', 'W6'], 'checked'), fee('FR', 'checked') + fee('W6', 'checked'));
  assert.equal(sum(['EK', 'EK'], 'checked'), fee('EK', 'checked'));
  assert.equal(sum(['LO', 'LO'], 'checked'), fee('LO', 'checked'), 'síťový dopravce s přestupem = jedna letenka');
  assert.equal(sum(['FR', 'FR'], 'checked'), 2 * fee('FR', 'checked'), 'Ryanair s přestupem = dvě letenky, dva poplatky');
  assert.equal(sum(['TR', 'TR'], 'checked'), fee('TR', 'checked'), 'Scoot prodává přestup na jedné letence');
  assert.equal(sum(['FR', 'RK'], 'cabin'), 2 * fee('FR', 'cabin'), 'Ryanair + Ryanair UK také');
  assert.equal(sum(['W6', 'LH', 'W6'], 'checked'), 2 * fee('W6', 'checked') + fee('LH', 'checked'));
  assert.equal(sum(['LH', 'OS'], 'checked'), fee('LH', 'checked'), 'skupina Lufthansa na jedné letence');
  assert.equal(sum(['KL', 'AF'], 'checked'), fee('KL', 'checked'));
  // bez seznamu dopravců rozhoduje hlavní dopravce letu
  assert.deepEqual(legBagEur({ carrier: 'W6' }, 'cabin'), { eur: fee('W6', 'cabin'), estimated: false });
  // neznámý dopravce mezi známými → součet a příznak odhadu
  const mix = legBagEur({ carrier: 'FR', carriers: ['FR', 'ZZ'] }, 'checked');
  assert.equal(mix.eur, fee('FR', 'checked') + fee('ZZ', 'checked'));
  assert.equal(mix.estimated, true);
  assert.deepEqual(legBagEur({ carrier: 'FR' }, 'none'), { eur: 0, estimated: false });
});

test('legBagCzk: přepočet do Kč kurzem hledání, dálkový let podle vzdálenosti letišť', () => {
  assert.deepEqual(legBagCzk({ from: 'PRG', to: 'BCN', carrier: 'FR' }, 'none'), { czk: 0, estimated: false });
  assert.deepEqual(legBagCzk(null, 'checked'), { czk: 0, estimated: false });
  assert.equal(legBagCzk({ from: 'PRG', to: 'BCN', carrier: 'FR' }, 'cabin').czk, fee('FR', 'cabin') * 25);
  // Turkish: do Istanbulu se kufr platí, do Bangkoku (> 2 500 km) je v ceně
  assert.equal(legBagCzk({ from: 'PRG', to: 'IST', carrier: 'TK' }, 'checked').czk, fee('TK', 'checked') * 25);
  assert.equal(legBagCzk({ from: 'IST', to: 'BKK', carrier: 'TK' }, 'checked').czk, 0);
  assert.equal(legBagCzk({ from: 'PRG', to: 'BCN', carrier: 'ZZ' }, 'checked').estimated, true);
});

test('normalizeQuery: bags – výchozí „none“, neznámá hodnota se ignoruje', () => {
  assert.equal(normalizeQuery({ from: ['ap:PRG'] }).bags, 'none');
  assert.equal(normalizeQuery({ from: ['ap:PRG'], bags: 'cabin' }).bags, 'cabin');
  assert.equal(normalizeQuery({ from: ['ap:PRG'], bags: 'checked' }).bags, 'checked');
  for (const bad of ['both', '', null, 1, ['cabin'], 'CABIN']) assert.equal(normalizeQuery({ from: ['ap:PRG'], bags: bad }).bags, 'none');
});

test('optimizer: příplatek za zavazadla mění pořadí kombinací i kalendář', () => {
  const d1 = ymdPlus(30);
  const d2 = ymdPlus(37);
  const mk = (carrier, from, to, date, czk) => makeLeg({ provider: 'kiwi', carrier, from, to, dep: `${date}T10:00:00`, czk });
  const out = [mk('FR', 'PRG', 'BCN', d1, 1000), mk('EK', 'PRG', 'BCN', d1, 1300)];
  const back = [mk('FR', 'BCN', 'PRG', d2, 1000), mk('EK', 'BCN', 'PRG', d2, 1300)];
  const extra = (l) => (l.carrier === 'FR' ? 500 : 0);
  const opts = { nightsMin: 7, nightsMax: 7, legsPerDay: 4, limit: 10, perDestLimit: 10 };
  const plain = bestRoundTrips(out, back, () => 0, opts);
  assert.deepEqual([plain[0].out.carrier, plain[0].back.carrier], ['FR', 'FR']);
  const cal = { out: new Map(), back: new Map() };
  const bag = bestRoundTrips(out, back, () => 0, { ...opts, extra, calendar: cal });
  assert.deepEqual([bag[0].out.carrier, bag[0].back.carrier], ['EK', 'EK'], 'se zavazadly vyjde levněji dražší letenka');
  assert.equal(bag[0].flightCzk, 2600, 'cena letenky zůstává bez zavazadel');
  assert.equal(cal.out.get(d1).cost, 2600, 'kalendář počítá i zavazadla');
  assert.equal(bestOneWays(out, () => 0, { ...opts, extra })[0].out.carrier, 'EK');
  assert.equal(oneWayCalendar(out, () => 0, { extra })[0].cost, 1300);
  assert.equal(oneWayCalendar(out, () => 0)[0].cost, 1000);
});

/* ---------- celé hledání (Kiwi) ---------- */
const seg = (from, to, d, carrier, h) => ({ from, to, departureTime: `${d}T${String(h).padStart(2, '0')}:00:00`, arrivalTime: `${d}T${String(h + 3).padStart(2, '0')}:00:00`, carrier, flightNumber: `${carrier}${100 + h}` });
// Itinerář jedním směrem: carriers = dopravci jednotlivých úseků (víc = přestup).
function itin(from, to, d, carriers, price, h = 6) {
  const via = ['IST', 'VIE', 'MUC'];
  const stops = [from, ...carriers.slice(1).map((_, i) => via[i]), to];
  const segments = carriers.map((c, i) => seg(stops[i], stops[i + 1], d, c, h + i * 4));
  return { price, bookingUrl: `https://www.kiwi.com/booking?${carriers.join('-')}`, outbound: { from, to, departureTime: segments[0].departureTime, arrivalTime: segments.at(-1).arrivalTime, durationSeconds: 21600, stops: carriers.length - 1, segments } };
}
function kiwiStub(make) {
  return (url, init) => {
    if (url !== 'https://mcp.kiwi.com') return { status: 404, body: '{}' };
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return { body: { jsonrpc: '2.0', id: body.id, result: {} }, headers: { 'content-type': 'application/json', 'mcp-session-id': 's1' } };
    if (body.method === 'notifications/initialized') return { status: 202, body: '' };
    const a = body.params.arguments;
    const d = `${a.departureDate.slice(6)}-${a.departureDate.slice(3, 5)}-${a.departureDate.slice(0, 2)}`;
    const text = JSON.stringify({ currency: 'EUR', passengers: { adults: a.adults }, itineraries: make(d, a) });
    return { body: { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text }] } } };
  };
}
const flat = (r) => r.groups.flatMap((g) => g.options);

test('hledání: bagCzk se přičte do ceny na osobu i celkem a změní pořadí; letenka a výhodnost zůstávají', async () => {
  resetKiwi();
  const frFee = fee('FR', 'checked', true);
  assert.ok(frFee > 0);
  // Dubaj jedním směrem pro 2 osoby: Ryanair o půl poplatku levnější než Emirates (kufr v ceně).
  const stub = stubFetch(kiwiStub((d) => [itin('PRG', 'DXB', d, ['FR'], 400, 6), itin('PRG', 'DXB', d, ['EK'], 400 + frFee, 14)]));
  const query = { from: ['ap:PRG'], radiusKm: 0, to: ['cc:AE'], dateFrom: ymdPlus(20), dateTo: ymdPlus(30), trip: 'oneway', adults: 2, kmRate: 1.1 };
  try {
    const plain = await search(query);
    assert.equal(plain.query.bags, 'none');
    const p = Object.fromEntries(flat(plain).map((t) => [t.out.carrier, { ...t }]));
    assert.equal(plain.groups[0].best.out.carrier, 'FR', 'bez zavazadel vede levnější letenka');
    assert.equal(p.FR.bagCzk, 0);
    assert.equal(p.FR.perPersonCzk, p.FR.flightCzk + p.FR.groundCzk);

    const r = await search({ ...query, bags: 'checked' });
    assert.equal(r.query.bags, 'checked');
    const b = Object.fromEntries(flat(r).map((t) => [t.out.carrier, t]));
    assert.equal(b.FR.bagCzk, frFee * 25, 'EUR → Kč kurzem hledání');
    assert.equal(b.EK.bagCzk, 0, 'kufr v ceně');
    assert.equal(b.FR.bagEst, undefined);
    for (const t of [b.FR, b.EK]) {
      assert.equal(t.perPersonCzk, t.flightCzk + t.groundCzk + t.bagCzk);
      assert.equal(t.totalCzk, t.perPersonCzk * 2);
    }
    assert.equal(b.FR.flightCzk, p.FR.flightCzk, 'cena letenky se nemění');
    assert.deepEqual(b.FR.deal, p.FR.deal, 'skóre výhodnosti se nemění');
    assert.equal(r.groups[0].best.out.carrier, 'EK', 'se zavazadly je levnější Emirates');
    assert.deepEqual(r.groups[0].options.map((t) => t.out.carrier), ['EK', 'FR']);

    // limit ceny na osobu platí pro cenu se zavazadly
    const cap = await search({ ...query, bags: 'checked', maxPrice: b.FR.perPersonCzk - 1 });
    assert.deepEqual(flat(cap).map((t) => t.out.carrier), ['EK']);
  } finally {
    stub.restore();
  }
});

test('hledání: let s přestupem u dvou dopravců platí zavazadlo u obou, neznámý dopravce je odhad', async () => {
  resetKiwi();
  const stub = stubFetch(kiwiStub((d) => [itin('PRG', 'DXB', d, ['FR', 'W6'], 300, 6), itin('PRG', 'DXB', d, ['LH', 'OS'], 500, 8), itin('PRG', 'AUH', d, ['ZZ'], 700, 10)]));
  try {
    // jiné termíny než předchozí test (odpovědi Kiwi jsou v mezipaměti); ZZ letí jinam – na město a den jsou ve výpisu 2 varianty
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['cc:AE'], dateFrom: ymdPlus(50), dateTo: ymdPlus(60), trip: 'oneway', adults: 1, kmRate: 0, bags: 'cabin' });
    const by = Object.fromEntries(flat(r).map((t) => [t.out.carrier, t]));
    assert.deepEqual(by.FR.out.carriers, ['FR', 'W6']);
    assert.equal(by.FR.bagCzk, (fee('FR', 'cabin') + fee('W6', 'cabin')) * 25);
    assert.equal(by.LH.bagCzk, fee('LH', 'cabin') * 25, 'skupina Lufthansa jen jednou');
    assert.equal(by.ZZ.bagEst, true);
    assert.equal(by.ZZ.bagCzk, fee('ZZ', 'cabin', true) * 25, 'Abú Dhabí je dálkový let');
    assert.equal(by.FR.bagEst, undefined);
    assert.equal(by.ZZ.out.carriers, undefined, 'jeden dopravce seznam nepotřebuje');
  } finally {
    stub.restore();
  }
});
