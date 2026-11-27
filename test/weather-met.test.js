// Předpověď MET Norway přes server (server/lib/weather.js, /api/weather): převod symbolů na kódy WMO, denní souhrny
// po místních dnech bez dvojího počítání překrývajících se úseků, mezipaměť podle podmínek MET (User-Agent, Expires,
// If-Modified-Since), limit z jedné adresy a výpadek zdroje. Bez sítě – fetch je podvržený.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { config } = await import('../server/config.js');
const { wmoOf, daysFrom, nowFrom, parsePts, tzAt, weatherAt, _resetWeather } = await import('../server/lib/weather.js');

const realFetch = globalThis.fetch;
const realNow = Date.now;
let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// úsek řady MET: okamžitá teplota + hodinový / šestihodinový souhrn
const entry = (time, temp, { h1, h6, now = {} } = {}) => ({
  time,
  data: {
    instant: { details: { air_temperature: temp, ...now } },
    ...(h1 && { next_1_hours: { summary: { symbol_code: h1[0] }, details: { precipitation_amount: h1[1], ...h1[2] } } }),
    ...(h6 && { next_6_hours: { summary: { symbol_code: h6[0] }, details: { precipitation_amount: h6[1], air_temperature_max: h6[2], air_temperature_min: h6[3] } } }),
  },
});
// Praha v listopadu (UTC+1): od 15. 11. 12:00 UTC po hodinách, od 16. 11. po 6 h, konec 18. 11.
function series() {
  const ts = [];
  for (let h = 12; h <= 22; h++) {
    // hodinové úseky mají i šestihodinový souhrn (9 mm) – ten se nesmí započítat podruhé
    const sym = h === 15 ? ['lightrain', 0.5, { probability_of_precipitation: 40 }] : ['partlycloudy_day', 0];
    ts.push(entry(`2026-11-15T${h}:00:00Z`, 10 + (h % 6), { h1: sym, h6: ['rain', 9, 20, 0] }));
  }
  ts.push(entry('2026-11-15T23:00:00Z', 8, { h1: ['clearsky_night', 0], h6: ['cloudy', 9, 20, 0] })); // 16. 11. 0:00 místního času
  ts.push(entry('2026-11-16T00:00:00Z', 8, { h6: ['cloudy', 0.2, 9, 7] }));
  ts.push(entry('2026-11-16T06:00:00Z', 9, { h6: ['heavyrainshowers_day', 4, 14, 9] }));
  ts.push(entry('2026-11-16T12:00:00Z', 14, { h6: ['rain', 2.5, 15, 11] }));
  ts.push(entry('2026-11-16T18:00:00Z', 10, { h6: ['fog', 0, 11, 6] }));
  ts.push(entry('2026-11-17T00:00:00Z', 4, { h6: ['clearsky_night', 0, 5, 2] }));
  ts.push(entry('2026-11-17T06:00:00Z', 3, { h6: ['lightsnowshowers_day', 1.2, 6, 1] }));
  ts.push(entry('2026-11-17T12:00:00Z', 6, { h6: ['fair_day', 0, 7, 4] }));
  ts.push(entry('2026-11-17T18:00:00Z', 4, { h6: ['partlycloudy_night', 0, 5, 3] }));
  ts.push(entry('2026-11-18T00:00:00Z', 3, { h6: ['lightssleetshowersandthunder', 3, 4, 2] })); // jen 6 h dne → vynechat
  ts.push(entry('2026-11-18T06:00:00Z', 2));
  return { properties: { timeseries: ts } };
}

test('symboly MET → kódy WMO aplikace (ikony a „prší“)', () => {
  const cases = {
    clearsky_day: 0, clearsky_polartwilight: 0, fair_night: 1, partlycloudy_day: 2, cloudy: 3, fog: 45,
    lightrain: 61, rain: 63, heavyrain: 65, lightsleet: 61, heavysleet: 65,
    lightrainshowers_day: 80, rainshowers_night: 81, heavyrainshowers_day: 82, sleetshowers_day: 81,
    lightsnow: 71, snow: 73, heavysnow: 75, lightsnowshowers_day: 85, snowshowers_night: 85, heavysnowshowers_day: 86,
    rainandthunder: 95, heavyrainshowersandthunder_day: 95, lightssleetshowersandthunder_day: 95, lightssnowshowersandthunder_night: 95,
  };
  for (const [sym, code] of Object.entries(cases)) assert.equal(wmoOf(sym), code, sym);
  assert.equal(wmoOf(''), null);
  assert.equal(wmoOf(undefined), null);
  assert.equal(wmoOf('neznamy_day'), null);
});

test('denní souhrny po místních dnech: každá hodina jednou, nejhorší počasí dne, neúplný den na konci vynechaný', () => {
  const days = daysFrom(series(), 'Europe/Prague', 14.42);
  assert.deepEqual(days, [
    // dnešek od 13 h místního času: hodinové úseky (šestihodinový souhrn 9 mm se nepočítá), déšť v 16 h
    { date: '2026-11-15', code: 61, hi: 15, lo: 10, pop: 40, rain: 0.5 },
    // půlnoc po hodinách, pak šestihodinové úseky: max/min úseků, srážky 0,2 + 4 + 2,5, nejhorší = silné přeháňky
    { date: '2026-11-16', code: 82, hi: 15, lo: 6, pop: null, rain: 6.7 },
    { date: '2026-11-17', code: 85, hi: 7, lo: 1, pop: null, rain: 1.2 },
  ]);
  // bez pásma sluneční čas podle délky (14° v. d. → UTC+1) – stejné dny
  assert.deepEqual(daysFrom(series(), null, 14.42).map((d) => d.date), ['2026-11-15', '2026-11-16', '2026-11-17']);
  // v New Yorku (UTC−5) se tytéž úseky rozdělí do jiných dnů
  assert.deepEqual(daysFrom(series(), 'America/New_York', -74).map((d) => d.date), ['2026-11-15', '2026-11-16', '2026-11-17']);
  assert.equal(daysFrom(series(), 'America/New_York', -74)[0].hi, 15);
  // dnešek s méně než 6 h (pozdě večer) se vynechá
  const late = { properties: { timeseries: series().properties.timeseries.slice(8) } };
  assert.equal(daysFrom(late, 'Europe/Prague', 14.42)[0].date, '2026-11-16');
  assert.deepEqual(daysFrom({}, 'Europe/Prague'), []);
  assert.deepEqual(daysFrom({ properties: { timeseries: [{ time: 'x' }, null] } }, 'Europe/Prague'), []);
});

test('počasí teď pro okno země a časové pásmo místa', () => {
  const j = { properties: { timeseries: [entry('2026-11-15T12:00:00Z', 10.4, { h1: ['rain', 1], now: { wind_speed: 3.5, relative_humidity: 81.2 } })] } };
  assert.deepEqual(nowFrom(j), { t: 10, code: 63, wind: 13, rh: 81 });
  assert.equal(nowFrom({}), null);
  assert.equal(tzAt(50.09, 14.42), 'Europe/Prague');
  assert.equal(tzAt(41.9, 12.5), 'Europe/Rome');
  assert.equal(tzAt(40.71, -74.01), 'America/New_York');
});

test('místa v dotazu: nejvýš 40, zaokrouhlená na 2 desetinná místa, jinak chyba', () => {
  assert.deepEqual(parsePts('50.0875,14.4213;41.9,12.5'), [[50.09, 14.42], [41.9, 12.5]]);
  assert.deepEqual(parsePts('-33.868,151.209'), [[-33.87, 151.21]]);
  for (const bad of ['', ';', '91,1', '1,181', '1,2,3', ',1', '1,', 'a,b', '1']) assert.equal(parsePts(bad), null, bad);
  assert.equal(parsePts(Array(41).fill('1,1').join(';')), null);
  assert.equal(parsePts(Array(40).fill('1,1').join(';')).length, 40);
});

// podvržené MET: odpověď s hlavičkami, i 304 (Response s ním tělo mít nesmí)
function stubMet(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith(base)) return realFetch(url, init);
    calls.push({ url: new URL(url), headers: init.headers || {} });
    const r = await handler(new URL(url), init.headers || {});
    return { status: r.status ?? 200, headers: new Headers(r.headers || {}), json: async () => r.body };
  };
  return calls;
}

test('mezipaměť podle podmínek MET: User-Agent s odkazem, nejdřív za 3 h, pak If-Modified-Since; výpadek = starší předpověď', async () => {
  const mock = config.mock;
  config.mock = false;
  _resetWeather();
  let t = realNow();
  Date.now = () => t;
  const calls = stubMet((u, h) => (h['If-Modified-Since'] ? { status: 304, headers: { expires: new Date(t + 18e5).toUTCString() } }
    : { body: series(), headers: { expires: new Date(t + 18e5).toUTCString(), 'last-modified': 'Sun, 15 Nov 2026 12:00:24 GMT' } }));
  try {
    const pts = [[50.09, 14.42], [41.9, 12.5]];
    const [prg, rome] = await weatherAt(pts);
    assert.equal(calls.length, 2);
    assert.match(calls[0].headers['User-Agent'], /^Letsi\/2\.0 https:\/\/\S+$/, 'název aplikace a odkaz, kde je kontakt');
    assert.equal(calls[0].url.origin + calls[0].url.pathname, 'https://api.met.no/weatherapi/locationforecast/2.0/complete');
    assert.equal(calls[0].url.search, '?lat=50.09&lon=14.42');
    assert.equal(prg.tz, 'Europe/Prague');
    assert.equal(rome.tz, 'Europe/Rome');
    assert.equal(prg.days.length, 3);
    assert.equal(prg.now.t, 10);
    // stejná místa za hodinu (Expires už prošel, 3 h ne): z mezipaměti, MET se znovu neptá
    t += 36e5;
    await weatherAt(pts);
    assert.equal(calls.length, 2);
    // za 4 h podmíněný dotaz s Last-Modified → 304, data zůstanou
    t += 3 * 36e5;
    const [again] = await weatherAt([pts[0]]);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].headers['If-Modified-Since'], 'Sun, 15 Nov 2026 12:00:24 GMT');
    assert.deepEqual(again.days, prg.days);
    // souběžné dotazy na totéž místo = jeden dotaz na MET
    t += 4 * 36e5;
    await Promise.all([weatherAt([pts[1]]), weatherAt([pts[1]])]);
    assert.equal(calls.length, 4);
    // výpadek MET: předpověď do 12 h stará, pak žádná
    stubMet(() => { throw new Error('ECONNRESET'); });
    const warn = console.warn;
    console.warn = () => {};
    try {
      t += 4 * 36e5;
      assert.equal((await weatherAt([pts[0]]))[0].days.length, 3, '8 h stará předpověď');
      t += 6 * 36e5;
      assert.deepEqual(await weatherAt([pts[0]]), [null], '14 h stará už ne');
    } finally {
      console.warn = warn;
    }
  } finally {
    Date.now = realNow;
    globalThis.fetch = realFetch;
    config.mock = mock;
    _resetWeather();
  }
});

test('/api/weather: chybná místa 400, jen pásma bez MET, nad limitem z adresy místo bez předpovědi, DEMO bez sítě', async () => {
  const mock = config.mock, max = config.weatherPer10Min;
  _resetWeather();
  const calls = stubMet(() => ({ body: series(), headers: { expires: new Date(realNow() + 18e5).toUTCString() } }));
  try {
    const bad = await realFetch(`${base}/api/weather?pts=91,1`);
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /pts=lat,lon/);
    const tz = await (await realFetch(`${base}/api/weather?tz=1&pts=50.0875,14.4213;41.9,12.5`)).json();
    assert.deepEqual(tz, { places: [{ tz: 'Europe/Prague' }, { tz: 'Europe/Rome' }] });
    // DEMO: žádný dotaz ven, aplikace ukáže dlouhodobý průměr
    config.mock = true;
    assert.deepEqual((await (await realFetch(`${base}/api/weather?pts=50.09,14.42`)).json()).places, [null]);
    assert.equal(calls.length, 0);
    config.mock = false;
    config.weatherPer10Min = 1;
    const h = { 'cf-connecting-ip': '198.51.100.77' };
    const r = await realFetch(`${base}/api/weather?pts=50.09,14.42;48.21,16.37`, { headers: h });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(calls.length, 1, 'druhé místo už nad limitem – na MET nejde');
    assert.equal(j.places[0].days[0].date, '2026-11-15');
    assert.equal(j.places[1], null);
    assert.match(j.source, /MET Norway/);
    // z mezipaměti serveru i nad limitem
    const j2 = await (await realFetch(`${base}/api/weather?pts=50.09,14.42`, { headers: h })).json();
    assert.equal(j2.places[0].tz, 'Europe/Prague');
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    config.mock = mock;
    config.weatherPer10Min = max;
    _resetWeather();
  }
});

test('výpadek MET (5xx, 429, timeout): 2 min se MET neptá ani u zbylých míst ve frontě – jen starší předpověď nebo nic', async () => {
  const mock = config.mock;
  config.mock = false;
  _resetWeather();
  let t = realNow();
  Date.now = () => t;
  const calls = stubMet(() => ({ status: 503 }));
  const warn = console.warn;
  console.warn = () => {};
  try {
    const pts = Array.from({ length: 10 }, (_, i) => [10 + i, 20]);
    assert.deepEqual(await weatherAt(pts), pts.map(() => null));
    assert.ok(calls.length <= 2, `po chybě se zbylá místa na MET neptají (dotazů ${calls.length})`);
    const n = calls.length;
    t += 60e3;
    await weatherAt(pts);
    assert.equal(calls.length, n, 'do 2 min žádný další dotaz');
    t += 2 * 60e3;
    await weatherAt([pts[0]]);
    assert.equal(calls.length, n + 1, 'pak zase');
  } finally {
    console.warn = warn;
    Date.now = realNow;
    globalThis.fetch = realFetch;
    config.mock = mock;
    _resetWeather();
  }
});
