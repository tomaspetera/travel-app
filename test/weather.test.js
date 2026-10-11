// Předpověď počasí na den výletu (public/js/weather.js – skript pro prohlížeč, tady načtený přes node:vm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const window = { wIco: (c) => ({ 0: ['☀️', 'Jasno'], 61: ['🌧️', 'Déšť'] }[c] || ['🌡️', '—']) };
  vm.runInNewContext(readFileSync(new URL('../public/js/weather.js', import.meta.url), 'utf8'), { window, URLSearchParams, Date, Map, Math, Number, String, Array, Promise });
  return window.Weather;
}
const NOW = new Date('2026-10-05T10:00:00');
const daily = (dates, over = {}) => ({ time: dates, weather_code: dates.map(() => 0), temperature_2m_max: dates.map(() => 21.6), temperature_2m_min: dates.map(() => 9.4), precipitation_probability_max: dates.map(() => 10), precipitation_sum: dates.map(() => 0), ...over });
const okJson = (body) => ({ ok: true, json: async () => body });

test('předpověď: jeden dotaz na všechna místa, mimo dosah (> 15 dní, minulost) null', async () => {
  const W = load();
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(new URL(url));
    return okJson([{ daily: daily(['2026-10-06', '2026-10-07']) }, { daily: daily(['2026-10-06', '2026-10-07'], { weather_code: [61, 61], precipitation_probability_max: [80, 70] }) }]);
  };
  const r = await W.forecast([
    { lat: 50.0875, lon: 14.4213, date: '2026-10-06' },
    { lat: 49.1951, lon: 16.6068, date: '2026-10-07' },
    { lat: 50.0875, lon: 14.4213, date: '2026-10-30' },
    { lat: 50.0875, lon: 14.4213, date: '2026-10-01' },
  ], { now: NOW, fetchFn });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('latitude'), '50.09,49.20');
  assert.equal(calls[0].searchParams.get('start_date'), '2026-10-06');
  assert.equal(calls[0].searchParams.get('end_date'), '2026-10-07');
  assert.deepEqual({ ...r[0] }, { date: '2026-10-06', code: 0, hi: 22, lo: 9, pop: 10, rain: 0, sunset: null });
  assert.equal(r[1].code, 61);
  assert.equal(W.rainy(r[1]), true);
  assert.equal(W.rainy(r[0]), false);
  assert.equal(r[2], null, 'za 25 dní předpověď není');
  assert.equal(r[3], null, 'minulost');
  // druhý dotaz na totéž z mezipaměti
  await W.forecast([{ lat: 50.0875, lon: 14.4213, date: '2026-10-06' }, { lat: 49.1951, lon: 16.6068, date: '2026-10-07' }], { now: NOW, fetchFn });
  assert.equal(calls.length, 1);
});

test('předpověď: chyba služby = bez předpovědi (žádná výjimka), lepší den bez deště', async () => {
  const W = load();
  const r = await W.forecast([{ lat: 50, lon: 14, date: '2026-10-06' }], { now: NOW, fetchFn: async () => ({ ok: false, status: 500 }) });
  assert.deepEqual([...r], [null]);
  const best = W.bestDay([{ date: 'a', pop: 80, rain: 6, hi: 18 }, { date: 'b', pop: 10, rain: 0, hi: 23 }, { date: 'c', pop: 0, rain: 0, hi: 35 }]);
  assert.equal(best.date, 'b');
  assert.match(W.badge({ code: 0, hi: 22, lo: 9, pop: 10, rain: 0 }), /☀️ 22°<small> \/ 9°<\/small> · 💧 10 %/);
  assert.match(W.badge({ code: 61, hi: 12, lo: 7, pop: 80, rain: 6.5 }), /class="wx wet"/);
});

test('dlouhodobý průměr pro termín mimo předpověď', async () => {
  const W = load();
  const fetchFn = async (url) => {
    assert.match(url, /^api\/climate\?lat=50\.088&lon=14\.421$/);
    return okJson({ hi: [1, 3, 8, 14, 19, 23, 26, 25, 20, 14, 7, 2], lo: [-4, -3, 0, 4, 8, 12, 14, 14, 10, 6, 2, -2], p: [42, 32, 39, 36, 69, 78, 79, 81, 53, 46, 43, 41] });
  };
  const n = await W.normal(50.0876, 14.4213, '2026-11-20', { fetchFn });
  assert.equal(n.hi, 7);
  assert.equal(n.text, 'Obvykle v listopadu: 7° / 2°, srážky ~43 mm za měsíc');
  assert.equal(W.daysAhead('2026-10-20', NOW), 15);
  assert.equal(W.inForecast('2026-10-21', NOW), false);
});

test('západ slunce: vzorec NOAA souhlasí se známými časy, polární den a noc = null', () => {
  const W = load();
  const at = (lat, lon, ymd, tz) => {
    const u = W.sunsetUtc(lat, lon, ymd);
    if (u == null) return null;
    const ms = Date.parse(`${ymd}T00:00:00Z`) + u * 6e4;
    const m = ((Math.round(u + W.tzOffset(tz, ms)) % 1440) + 1440) % 1440;
    return m;
  };
  const near = (m, hhmm, tol = 3) => { const [h, mi] = hhmm.split(':').map(Number); return Math.abs(m - (h * 60 + mi)) <= tol; };
  // tabulkové časy (timeanddate / NOAA Solar Calculator)
  assert.ok(near(at(50.0875, 14.4213, '2026-06-21', 'Europe/Prague'), '21:15'), 'Praha, slunovrat (letní čas)');
  assert.ok(near(at(50.0875, 14.4213, '2026-12-21', 'Europe/Prague'), '16:02'), 'Praha, zima');
  assert.ok(near(at(40.71, -74.01, '2026-07-04', 'America/New_York'), '20:31'), 'New York');
  assert.ok(near(at(-33.87, 151.21, '2026-12-25', 'Australia/Sydney'), '20:06'), 'Sydney (jižní polokoule)');
  assert.ok(near(at(41.3874, 2.1686, '2026-10-10', 'Europe/Madrid'), '19:19'), 'Barcelona 10. 10.');
  assert.equal(W.sunsetUtc(69.65, 18.96, '2026-12-21'), null, 'Tromsø v prosinci – polární noc');
  assert.equal(W.sunsetUtc(69.65, 18.96, '2026-06-21'), null, 'Tromsø v červnu – slunce nezapadá');
  assert.equal(W.sunsetUtc('x', 14, '2026-06-21'), null);
  assert.equal(W.tzOffset('Europe/Prague', Date.parse('2026-01-15T12:00:00Z')), 60);
  assert.equal(W.tzOffset('Europe/Prague', Date.parse('2026-07-15T12:00:00Z')), 120);
  assert.equal(W.tzOffset('Nikde/Nic', Date.now()), null);
});

test('západ slunce: v dosahu předpovědi z téhož dotazu jako počasí, dál výpočet v zóně místa', async () => {
  const W = load();
  const calls = [];
  const fetchFn = async (url) => {
    const u = new URL(url);
    calls.push(u);
    if (u.searchParams.get('forecast_days')) return okJson({ timezone: 'Europe/Madrid', daily: { time: ['2026-10-05'], sunset: ['2026-10-05T19:27'] } });
    return okJson({ timezone: 'Europe/Madrid', daily: { ...daily(['2026-10-06', '2026-10-07']), sunset: ['2026-10-06T19:26', '2026-10-07T19:24'] } });
  };
  const pts = [{ lat: 41.3874, lon: 2.1686, date: '2026-10-06' }, { lat: 41.3874, lon: 2.1686, date: '2026-10-07' }];
  const wx = await W.forecast(pts, { now: NOW, fetchFn });
  assert.equal(wx[0].sunset, '19:26');
  assert.match(calls[0].searchParams.get('daily'), /,sunset$/);
  assert.deepEqual([...await W.sunsets(pts, { now: NOW, fetchFn })], ['19:26', '19:24']);
  assert.equal(calls.length, 1, 'západ slunce z odpovědi předpovědi – bez dalšího dotazu');
  // za hranou předpovědi: zóna z té samé odpovědi, čas výpočtem (Barcelona 1. 11. – už zimní čas)
  const far = await W.sunsets([{ lat: 41.3874, lon: 2.1686, date: '2026-11-01' }, { lat: 69.65, lon: 18.96, date: '2026-12-21' }], { now: NOW, fetchFn });
  assert.equal(calls.length, 1, 'zónu Barcelony už zná; polární noc se na zónu ani neptá');
  assert.match(far[0], /^17:(4[5-9]|5[01])$/, 'Barcelona 1. 11. kolem 17:48 SEČ');
  assert.equal(far[1], null);
  // jiné místo za hranou: jeden malý dotaz na zónu, podruhé z paměti
  const lis = { lat: 38.7223, lon: -9.1393, date: '2026-11-20' };
  const fetch2 = async (url) => { calls.push(new URL(url)); return okJson({ timezone: 'Europe/Lisbon' }); };
  const [l1] = await W.sunsets([lis], { now: NOW, fetchFn: fetch2 });
  const [l2] = await W.sunsets([lis], { now: NOW, fetchFn: fetch2 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get('timezone'), 'auto');
  assert.match(l1, /^17:(1\d|2\d)$/, 'Lisabon v listopadu kolem 17:20');
  assert.equal(l2, l1);
  // bez sítě: nevím (žádné varování raději než špatné)
  const [none] = await W.sunsets([{ lat: 35, lon: 139, date: '2026-12-01' }], { now: NOW, fetchFn: async () => { throw new Error('offline'); } });
  assert.equal(none, null);
});

test('předpověď pro výsledky hledání: jeden dotaz na celý dosah, místa v libovolném pořadí z paměti', async () => {
  const W = load();
  const calls = [];
  const dates = Array.from({ length: 16 }, (_, k) => `2026-10-${String(5 + k).padStart(2, '0')}`);
  const fetchFn = async (url) => {
    const u = new URL(url);
    calls.push(u);
    // každé místo vlastní teplotu (podle zeměpisné šířky) – ověří, že se odpovědi přiřadí ke správným místům
    return okJson(u.searchParams.get('latitude').split(',').map(la => ({ daily: daily(dates, { temperature_2m_max: dates.map(() => +la) }) })));
  };
  const pts = [{ lat: 41.3874, lon: 2.1686 }, { lat: 38.7223, lon: -9.1393 }, { lat: 45.4408, lon: 12.3155 }];
  const m = await W.span([...pts, { lat: null, lon: 14 }, { lat: 'x', lon: 14 }, { lat: 120, lon: 14 }, null], { now: NOW, fetchFn });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('start_date'), '2026-10-05');
  assert.equal(calls[0].searchParams.get('end_date'), '2026-10-20', 'dnes + 15 dní');
  assert.equal(calls[0].searchParams.get('latitude').split(',').length, 3, 'neplatné souřadnice vynechané');
  assert.equal(m.size, 3);
  const bcn = m.get(W.key(41.3874, 2.1686));
  assert.equal(bcn.length, 16);
  assert.deepEqual({ ...bcn[0] }, { date: '2026-10-05', code: 0, hi: 41, lo: 9, pop: 10, rain: 0 });
  assert.equal(m.get(W.key(38.7223, -9.1393))[3].hi, 39);
  // jiné řazení výpisu = stejná místa v jiném pořadí → z paměti, žádný další dotaz
  const m2 = await W.span([pts[2], pts[0], pts[1], pts[0]], { now: NOW, fetchFn });
  assert.equal(calls.length, 1);
  assert.equal(m2.get(W.key(45.4408, 12.3155))[0].hi, 45);
  // nejvýš 40 míst v jednom dotazu
  await W.span(Array.from({ length: 45 }, (_, k) => ({ lat: 40 + k / 10, lon: 10 })), { now: NOW, fetchFn });
  assert.equal(calls[1].searchParams.get('latitude').split(',').length, 40);
  // chyba služby nebo sítě: prázdná Map, žádná výjimka
  assert.equal((await W.span([{ lat: 50, lon: 14 }], { now: NOW, fetchFn: async () => ({ ok: false, status: 400 }) })).size, 0);
  assert.equal((await W.span([{ lat: 50, lon: 15 }], { now: NOW, fetchFn: async () => { throw new Error('offline'); } })).size, 0);
  assert.equal((await W.span([], { now: NOW, fetchFn })).size, 0);
  assert.equal(calls.length, 2);
});

test('předpověď na dny cesty jedním štítkem', () => {
  const W = load();
  const day = (date, over = {}) => ({ date, code: 0, hi: 21.6, lo: 9, pop: 10, rain: 0, ...over });
  const wet = { code: 61, pop: 80, rain: 6 };
  const dry = W.summary([day('2026-10-17'), day('2026-10-18'), day('2026-10-19')], 3);
  assert.equal(dry.text, '☀️ 22° · 💧 10 %');
  assert.equal(dry.short, '☀️ 22°');
  assert.equal(dry.wet, 0);
  assert.equal(dry.title, 'so 17. 10.: ☀️ 22° / 9°, 💧 10 %\nne 18. 10.: ☀️ 22° / 9°, 💧 10 %\npo 19. 10.: ☀️ 22° / 9°, 💧 10 %\nPředpověď Open-Meteo – před odletem ji ověř.');
  const two = W.summary([day('2026-10-17', wet), day('2026-10-18'), day('2026-10-19', wet)], 3);
  assert.equal(two.text, '🌧️ prší 2 dny ze 3');
  assert.equal(two.short, '🌧️ 22°');
  assert.equal(two.wet, 2);
  const five = W.summary(['17', '18', '19', '20', '21'].map((d, i) => day(`2026-10-${d}`, i % 2 ? wet : {})), 5);
  assert.equal(five.text, '🌧️ prší 2 dny z 5');
  // jeden deštivý den ze čtyř: ikona deště, ale ne „prší“
  const one = W.summary([day('2026-10-17'), day('2026-10-18', { pop: 30 }), day('2026-10-19', wet), day('2026-10-20')], 4);
  assert.equal(one.text, '🌧️ 22° · 💧 80 %');
  assert.equal(one.wet, 1);
  // cesta dál, než sahá předpověď
  const part = W.summary([day('2026-10-19'), day('2026-10-20')], 5);
  assert.match(part.title, /Předpověď jen na první 2 z 5 dnů cesty\. Předpověď Open-Meteo/);
  assert.match(W.summary([day('2026-10-20')], 3).title, /jen na první den ze 3 dnů/);
  assert.equal(W.summary([], 3), null);
  assert.equal(W.summary(null, 3), null);
  // dlouhá cesta: v title nejvýš 7 dní
  const long = W.summary(Array.from({ length: 10 }, (_, k) => day(`2026-10-${10 + k}`)), 12);
  assert.equal(long.title.split('\n').length, 9);
  assert.match(long.title, /… \(\+3 dny\)\nPředpověď jen na první 10 ze 12 dnů/);
});
