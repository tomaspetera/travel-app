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
  assert.deepEqual({ ...r[0] }, { date: '2026-10-06', code: 0, hi: 22, lo: 9, pop: 10, rain: 0 });
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
