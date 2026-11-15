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
// odpověď /api/weather: místa ve stejném pořadí jako v dotazu, dny už souhrnem ze serveru (server/lib/weather.js)
const day = (date, over = {}) => ({ date, code: 0, hi: 22, lo: 9, pop: 10, rain: 0, ...over });
const okJson = (body) => ({ ok: true, json: async () => body });
const U = (url) => new URL(url, 'http://atlas.test/');

test('předpověď: jeden dotaz na naše api/weather pro všechna místa, mimo dosah (> 9 dní, minulost) null', async () => {
  const W = load();
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(U(url));
    return okJson({ places: [{ tz: 'Europe/Prague', days: [day('2026-10-06', { code: 61, pop: 80 }), day('2026-10-07', { code: 61, pop: 70 })] }, { tz: 'Europe/Prague', days: [day('2026-10-06'), day('2026-10-07')] }] });
  };
  const r = await W.forecast([
    { lat: 50.0875, lon: 14.4213, date: '2026-10-06' },
    { lat: 49.1951, lon: 16.6068, date: '2026-10-07' },
    { lat: 50.0875, lon: 14.4213, date: '2026-10-30' },
    { lat: 50.0875, lon: 14.4213, date: '2026-10-01' },
  ], { now: NOW, fetchFn });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, '/api/weather');
  assert.equal(calls[0].searchParams.get('pts'), '49.20,16.61;50.09,14.42', 'místa seřazená (stejný klíč mezipaměti), 2 desetinná místa');
  assert.deepEqual({ ...r[0] }, { date: '2026-10-06', code: 0, hi: 22, lo: 9, pop: 10, rain: 0 });
  assert.equal(r[1].code, 61);
  assert.equal(W.rainy(r[1]), true);
  assert.equal(W.rainy(r[0]), false);
  assert.equal(r[2], null, 'za 25 dní předpověď není');
  assert.equal(r[3], null, 'minulost');
  // druhý dotaz na totéž z mezipaměti
  await W.forecast([{ lat: 50.0875, lon: 14.4213, date: '2026-10-06' }, { lat: 49.1951, lon: 16.6068, date: '2026-10-07' }], { now: NOW, fetchFn });
  assert.equal(calls.length, 1);
  // mimo Skandinávii MET pravděpodobnost srážek nedává: štítek bez 💧, déšť podle kódu a úhrnu
  const W2 = load();
  const [w] = await W2.forecast([{ lat: 41.9, lon: 12.5, date: '2026-10-06' }], { now: NOW, fetchFn: async () => okJson({ places: [{ tz: 'Europe/Rome', days: [day('2026-10-06', { code: 3, pop: null, rain: 0.4 })] }] }) });
  assert.deepEqual({ ...w }, { date: '2026-10-06', code: 3, hi: 22, lo: 9, pop: null, rain: 0.4 });
  assert.match(W2.badge(w), /^<span class="wx" title="—, 0,4 mm – předpověď MET Norway">🌡️ 22°<small> \/ 9°<\/small><\/span>$/);
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
  // chyba se nepamatuje: další otevření se zeptá znovu (úspěch už ano)
  let calls = 0;
  const flaky = async () => (++calls === 1 ? { ok: false, status: 503 } : okJson({ hi: Array(12).fill(20), lo: Array(12).fill(10), p: Array(12).fill(50) }));
  assert.equal(await W.normal(48.2, 16.37, '2026-12-01', { fetchFn: flaky }), null);
  assert.equal((await W.normal(48.2, 16.37, '2026-12-01', { fetchFn: flaky })).hi, 20);
  await W.normal(48.2, 16.37, '2026-12-01', { fetchFn: flaky });
  assert.equal(calls, 2);
  assert.equal(W.daysAhead('2026-10-20', NOW), 15);
  assert.equal(W.inForecast('2026-10-14', NOW), true, 'dnes + 9');
  assert.equal(W.inForecast('2026-10-15', NOW), false);
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

test('západ slunce: výpočet v zóně místa, zóna z odpovědi předpovědi nebo jedním dotazem na všechna místa', async () => {
  const W = load();
  const calls = [];
  const fetchFn = async (url) => {
    const u = U(url);
    calls.push(u);
    if (u.searchParams.get('tz') === '1') return okJson({ places: u.searchParams.get('pts').split(';').map((p) => ({ tz: p.startsWith('38.72') ? 'Europe/Lisbon' : null })) });
    return okJson({ places: [{ tz: 'Europe/Madrid', days: [day('2026-10-06'), day('2026-10-07')] }] });
  };
  const pts = [{ lat: 41.3874, lon: 2.1686, date: '2026-10-06' }, { lat: 41.3874, lon: 2.1686, date: '2026-10-07' }];
  await W.forecast(pts, { now: NOW, fetchFn });
  const ss = await W.sunsets([...pts, { lat: 41.3874, lon: 2.1686, date: '2026-11-01' }, { lat: 69.65, lon: 18.96, date: '2026-12-21' }, null], { fetchFn });
  assert.equal(calls.length, 1, 'zónu Barcelony zná z předpovědi; polární noc se na zónu ani neptá');
  assert.match(ss[0], /^19:2[4-9]$/, 'Barcelona 6. 10. kolem 19:26');
  assert.match(ss[1], /^19:2[2-7]$/);
  assert.match(ss[2], /^17:(4[5-9]|5[01])$/, 'Barcelona 1. 11. kolem 17:48 SEČ');
  assert.deepEqual(ss.slice(3), [null, null]);
  // neznámá místa: jeden dotaz na všechna (api/weather?tz=1, bez MET), podruhé z paměti; místo bez zóny = nevím
  const lis = { lat: 38.7223, lon: -9.1393, date: '2026-11-20' }, sea = { lat: 30, lon: -40, date: '2026-11-20' };
  const [l1, s1] = await W.sunsets([lis, sea], { fetchFn });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get('pts'), '38.72,-9.14;30.00,-40.00');
  assert.match(l1, /^17:(1\d|2\d)$/, 'Lisabon v listopadu kolem 17:20');
  assert.equal(s1, null);
  const [l2] = await W.sunsets([lis], { fetchFn });
  assert.equal(l2, l1);
  assert.equal(calls.length, 2);
  // bez sítě: nevím (žádné varování raději než špatné)
  const [none] = await W.sunsets([{ lat: 35, lon: 139, date: '2026-12-01' }], { fetchFn: async () => { throw new Error('offline'); } });
  assert.equal(none, null);
});

test('předpověď pro výsledky hledání: jeden dotaz na celý dosah, místa v libovolném pořadí z paměti', async () => {
  const W = load();
  const calls = [];
  const dates = Array.from({ length: 10 }, (_, k) => `2026-10-${String(5 + k).padStart(2, '0')}`);
  const fetchFn = async (url) => {
    const u = U(url);
    calls.push(u);
    // každé místo vlastní teplotu (podle zeměpisné šířky) – ověří, že se odpovědi přiřadí ke správným místům
    return okJson({ places: u.searchParams.get('pts').split(';').map((p) => ({ tz: null, days: dates.map((d) => day(d, { hi: Math.round(+p.split(',')[0]) })) })) });
  };
  const pts = [{ lat: 41.3874, lon: 2.1686 }, { lat: 38.7223, lon: -9.1393 }, { lat: 45.4408, lon: 12.3155 }];
  const m = await W.span([...pts, { lat: null, lon: 14 }, { lat: 'x', lon: 14 }, { lat: 120, lon: 14 }, null], { now: NOW, fetchFn });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('pts').split(';').length, 3, 'neplatné souřadnice vynechané');
  assert.equal(m.size, 3);
  const bcn = m.get(W.key(41.3874, 2.1686));
  assert.equal(bcn.length, 10);
  assert.deepEqual({ ...bcn[0] }, { date: '2026-10-05', code: 0, hi: 41, lo: 9, pop: 10, rain: 0 });
  assert.equal(m.get(W.key(38.7223, -9.1393))[3].hi, 39);
  // jiné řazení výpisu = stejná místa v jiném pořadí → z paměti, žádný další dotaz
  const m2 = await W.span([pts[2], pts[0], pts[1], pts[0]], { now: NOW, fetchFn });
  assert.equal(calls.length, 1);
  assert.equal(m2.get(W.key(45.4408, 12.3155))[0].hi, 45);
  // nejvýš 40 míst v jednom dotazu (víc server odmítne)
  await W.span(Array.from({ length: 45 }, (_, k) => ({ lat: 40 + k / 10, lon: 10 })), { now: NOW, fetchFn });
  assert.equal(calls[1].searchParams.get('pts').split(';').length, 40);
  // místo bez předpovědi (null) chybí; chyba služby nebo sítě: prázdná Map, žádná výjimka
  const W2 = load();
  assert.equal((await W2.span([{ lat: 50, lon: 13 }], { fetchFn: async () => okJson({ places: [null] }) })).size, 0);
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
  assert.equal(dry.title, 'so 17. 10.: ☀️ 22° / 9°, 💧 10 %\nne 18. 10.: ☀️ 22° / 9°, 💧 10 %\npo 19. 10.: ☀️ 22° / 9°, 💧 10 %\nPředpověď MET Norway – před odletem ji ověř.');
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
  assert.match(part.title, /Předpověď jen na první 2 z 5 dnů cesty\. Předpověď MET Norway/);
  assert.match(W.summary([day('2026-10-20')], 3).title, /jen na první den ze 3 dnů/);
  assert.equal(W.summary([], 3), null);
  assert.equal(W.summary(null, 3), null);
  // dlouhá cesta: v title nejvýš 7 dní
  const long = W.summary(Array.from({ length: 10 }, (_, k) => day(`2026-10-${10 + k}`)), 12);
  assert.equal(long.title.split('\n').length, 9);
  assert.match(long.title, /… \(\+3 dny\)\nPředpověď jen na první 10 ze 12 dnů/);
  // ze/z i u dlouhých cest (ze dvaceti, z padesáti, ze sta)
  const six = Array.from({ length: 6 }, (_, k) => day(`2026-10-${10 + k}`));
  const of = total => W.summary(six, total).title.match(/první 6 (ze?) \d+ dnů/)[1];
  assert.deepEqual([7, 8, 15, 16, 19, 20, 21, 29, 30, 45, 50, 66, 80, 100, 200, 500].map(of), ['ze', 'z', 'z', 'ze', 'z', 'ze', 'ze', 'ze', 'ze', 'ze', 'z', 'ze', 'z', 'ze', 'ze', 'z']);
});

test('předpověď pro výsledky: den bez počasí a teploty se nepočítá, odlet jen v dosahu předpovědi', async () => {
  const W = load();
  const dates = Array.from({ length: 10 }, (_, k) => `2026-10-${String(5 + k).padStart(2, '0')}`);
  // den bez kódu počasí nebo teploty (server ho posílat nemá, ale kdyby): vynechat, ne štítek „🌡️ null°“
  const days = dates.map((d, i) => (i === 9 ? day(d, { code: null, hi: null, lo: null, pop: 35, rain: null }) : day(d)));
  const m = await W.span([{ lat: 41.39, lon: 2.17 }], { now: NOW, fetchFn: async () => okJson({ places: [{ tz: 'Europe/Madrid', days }] }) });
  const list = m.get(W.key(41.39, 2.17));
  assert.equal(list.length, 9);
  assert.equal(list.at(-1).date, '2026-10-13');
  // cesta přes konec předpovědi: předpověď jen na první dny, nikde 🌡️
  const s = W.trip(list, '2026-10-12', '2026-10-19', { now: NOW });
  assert.equal(s.text, '☀️ 22° · 💧 10 %');
  assert.match(s.title, /\nPředpověď jen na první 2 z 8 dnů cesty/);
  assert.doesNotMatch(s.title, /🌡️/);
  // odlet poslední den dosahu, na který den chybí: bez předpovědi (zůstane průměr 🌡️)
  assert.equal(W.trip(list, '2026-10-14', '2026-10-21', { now: NOW }), null);
  // bez návratu tři dny od odletu
  assert.match(W.trip(list, '2026-10-06', null, { now: NOW }).title, /^út 6\. 10\.: ☀️ 22° \/ 9°, 💧 10 %\nst 7\. 10\.: .*\nčt 8\. 10\.: .*\nPředpověď MET Norway/);
  assert.match(W.trip(list, '2026-10-12', null, { now: NOW }).title, /jen na první 2 ze 3 dnů/);
  // už proběhlý odlet (výsledky z minula, stránka otevřená přes půlnoc) ani odlet za dosahem předpověď nemá
  assert.equal(W.trip(list, '2026-10-04', '2026-10-09', { now: NOW }), null);
  assert.equal(W.trip(list, '2026-10-15', null, { now: NOW }), null);
  assert.equal(W.trip(undefined, '2026-10-06', null, { now: NOW }), null);
  // forecast() na jeden den: den bez počasí = bez předpovědi (žádné „null°“)
  const W2 = load();
  const fc = await W2.forecast([{ lat: 41.39, lon: 2.17, date: '2026-10-13' }, { lat: 41.39, lon: 2.17, date: '2026-10-12' }], { now: NOW, fetchFn: async () => okJson({ places: [{ days: [day('2026-10-12', { hi: 20 }), day('2026-10-13', { code: null, hi: null })] }] }) });
  assert.equal(fc[0], null);
  assert.equal(fc[1].hi, 20);
});

test('předpověď: konec dosahu dnes + 9 podle data v telefonu (i po půlnoci a v jiném pásmu)', () => {
  const tz0 = process.env.TZ;
  try {
    for (const [tz, now, last, over] of [
      ['Europe/Prague', '2026-10-11T22:30:00Z', '2026-10-21', '2026-10-22'], // 0:30 místního času, v UTC ještě 11. 10.
      ['Europe/Prague', '2026-10-11T20:30:00Z', '2026-10-20', '2026-10-21'],
      ['America/New_York', '2026-10-12T02:30:00Z', '2026-10-20', '2026-10-21'], // večer, v UTC už 12. 10.
      ['UTC', '2026-12-31T23:59:00Z', '2027-01-09', '2027-01-10'],
    ]) {
      process.env.TZ = tz;
      const W = load();
      assert.equal(W.inForecast(last, new Date(now)), true, `${tz} ${now}`);
      assert.equal(W.inForecast(over, new Date(now)), false, `${tz} ${now}: den za koncem rozsahu`);
    }
  } finally {
    if (tz0 === undefined) delete process.env.TZ; else process.env.TZ = tz0;
  }
});
