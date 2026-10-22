// Změna času (zimní čas 25. 10. 2026, letní 28. 3. 2027) a časové pásmo počítače. Server: místní časy letišť → skutečné
// okamžiky (délka letu, odhad příletu, přestupy) a „dnes“ v UTC bez ohledu na TZ. Prohlížeč: skripty se spouštějí
// v podprocesech s TZ Praha / New York / Tokio / UTC – štítky dnů, noci a kalendáře musí vyjít všude stejně.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { flightMinutes, localToUtcMs, utcToLocalIso } from '../server/lib/dates.js';
import { makeLeg } from '../server/lib/fares.js';
import { legFits } from '../server/lib/multi.js';
import { layoversOf } from '../server/providers/kiwi.js';

const ZONES = ['Europe/Prague', 'America/New_York', 'Asia/Tokyo', 'UTC'];
/** Skript (ES modul) v novém procesu s časovým pásmem tz → jeho výstup jako JSON. */
const runIn = (tz, code) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }));
const utc = (local, tz) => new Date(localToUtcMs(local, tz)).toISOString().slice(0, 16);
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

test('localToUtcMs: místní čas v noci změny času – posun z té strany změny, kam čas patří', () => {
  // Praha: 25. 10. 2026 ve 3:00 SELČ zpět na 2:00 SEČ (= 1:00 UTC); dřív vyšel čas 1:00–2:59 o hodinu vedle
  assert.equal(utc('2026-10-25T00:30', 'Europe/Prague'), '2026-10-24T22:30');
  assert.equal(utc('2026-10-25T01:30', 'Europe/Prague'), '2026-10-24T23:30');
  assert.equal(utc('2026-10-25T02:30', 'Europe/Prague'), '2026-10-25T00:30', 'dvakrát → první (SELČ), jako Ics.localToUtc');
  assert.equal(utc('2026-10-25T03:30', 'Europe/Prague'), '2026-10-25T02:30');
  // 28. 3. 2027 ve 2:00 SEČ na 3:00 SELČ
  assert.equal(utc('2027-03-28T01:30', 'Europe/Prague'), '2027-03-28T00:30');
  assert.equal(utc('2027-03-28T02:30', 'Europe/Prague'), '2027-03-28T01:30', 'neexistující čas s posunem před změnou');
  assert.equal(utc('2027-03-28T03:30', 'Europe/Prague'), '2027-03-28T01:30');
  // Helsinky (změna ve 4:00 místního), New York 1. 11. 2026 (zóna za UTC – chyba byla po změně)
  assert.equal(utc('2026-10-25T02:30', 'Europe/Helsinki'), '2026-10-24T23:30');
  assert.equal(utc('2026-11-01T03:00', 'America/New_York'), '2026-11-01T08:00');
  assert.equal(utc('2026-11-01T00:30', 'America/New_York'), '2026-11-01T04:30');
  // tam a zpět po čtvrthodinách přes obě noci (a jižní polokouli): stejný místní čas, jen neexistující o hodinu dál
  const days = ['2026-10-24', '2026-10-25', '2026-11-01', '2027-03-27', '2027-03-28', '2027-03-14', '2026-10-04', '2027-04-04'];
  for (const tz of ['Europe/Prague', 'Europe/London', 'Europe/Helsinki', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney']) {
    for (const d of days) {
      for (let m = 0; m < 1440; m += 15) {
        const l = `${d}T${hm(m)}`, back = utcToLocalIso(localToUtcMs(l, tz), tz).slice(0, 16);
        if (back !== l) assert.equal(back, `${d}T${hm(m + 60)}`, `${tz} ${l}`);
      }
    }
  }
  assert.equal(utc('2026-10-25T01:30', null), '2026-10-25T01:30', 'bez zóny ručičky jako dřív');
});

test('flightMinutes a odhad příletu: noční let přes změnu času má skutečnou délku', () => {
  // Londýn Luton 22:40 → Praha 1:30 (= 1 h 50 min); dřív 2 h 50 min na podzim a 50 min na jaře
  assert.equal(flightMinutes('2026-10-24T22:40:00', 'Europe/London', '2026-10-25T01:30:00', 'Europe/Prague'), 110);
  assert.equal(flightMinutes('2027-03-27T22:40:00', 'Europe/London', '2027-03-28T01:30:00', 'Europe/Prague'), 110);
  // Praha 22:00 → Helsinky 1:40 (= 2 h 40 min), dřív 3 h 40 min
  assert.equal(flightMinutes('2026-10-24T22:00:00', 'Europe/Prague', '2026-10-25T01:40:00', 'Europe/Helsinki'), 160);
  // přílet dopočtený z délky letu (Wizz Air, Travelpayouts) v místním čase cíle: odlet 1:30 SELČ = 23:30 UTC, +2 h = 1:30 GMT
  const l = makeLeg({ provider: 'travelpayouts', from: 'PRG', to: 'STN', dep: '2026-10-25T01:30:00', durationMin: 120, czk: 900 });
  assert.deepEqual([l.arr, l.durationMin, l.arrEst], ['2026-10-25T01:30:00', 120, false]);
});

test('přestupy v noci změny času: cesta přes víc měst (legFits) i přestup Kiwi.com podle skutečného času', () => {
  const leg = (from, to, dep, arr, extra = {}) => ({ from, to, dep, arr, date: dep.slice(0, 10), hasTime: true, stops: 0, ...extra });
  const rome = { fromTz: 'Europe/Rome', toTz: 'Europe/Rome' };
  // přílet do Říma 25. 10. v 1:30 SELČ, odlet ve 4:00 SEČ = 3 h 30 min (ručičky 2 h 30 min → „krátký přestup“)
  const a = leg('PRG', 'FCO', '2026-10-24T23:40', '2026-10-25T01:30', { fromTz: 'Europe/Prague', toTz: 'Europe/Rome' });
  assert.equal(legFits(a, leg('FCO', 'NAP', '2026-10-25T04:00', '2026-10-25T05:00', rome)), null);
  // na jaře naopak: přílet 0:30 SEČ, odlet 3:40 SELČ = jen 2 h 10 min
  const b = leg('PRG', 'FCO', '2027-03-27T22:40', '2027-03-28T00:30', { fromTz: 'Europe/Prague', toTz: 'Europe/Rome' });
  assert.deepEqual(legFits(b, leg('FCO', 'NAP', '2027-03-28T03:40', '2027-03-28T04:40', rome)), { why: 'short', gapMin: 130, needMin: 180 });
  // Kiwi: přílet do Frankfurtu 0:30, odlet 6:30 = 7 h čekání (ručičky 6 h); čas s posunem zůstane okamžikem
  const s = (from, to, dep, arr) => ({ from, to, departureTime: dep, arrivalTime: arr });
  assert.deepEqual(layoversOf([s('PRG', 'FRA', '2026-10-24T23:20:00', '2026-10-25T00:30:00'), s('FRA', 'JFK', '2026-10-25T06:30:00', '2026-10-25T09:00:00')]), [{ at: 'FRA', min: 420 }]);
  assert.deepEqual(layoversOf([s('PRG', 'FRA', '2027-03-27T23:20:00', '2027-03-28T00:30:00+01:00'), s('FRA', 'JFK', '2027-03-28T06:30:00', '2027-03-28T09:00:00')]), [{ at: 'FRA', min: 300 }]);
});

test('server: „dnes“ je den v UTC v kterémkoli časovém pásmu počítače (jako na Renderu)', () => {
  const code = `import { todayYmd } from ${JSON.stringify(new URL('../server/lib/dates.js', import.meta.url).href)};
    console.log(JSON.stringify([todayYmd(), new Date().toISOString().slice(0, 10)]));`;
  for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', ...ZONES]) {
    const [today, utcDay] = runIn(tz, code);
    assert.equal(today, utcDay, tz);
  }
});

// Klientské skripty v podprocesu: výsledky, které nesmí záviset na časovém pásmu telefonu.
const CLIENT = `
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const src = (f) => readFileSync(new URL('../public/js/' + f, ${JSON.stringify(import.meta.url)}), 'utf8');
const ctx = { window: {}, console, URLSearchParams };
vm.createContext(ctx);
for (const f of ['searchhelp.js', 'smart.js', 'pricecheck.js', 'ics.js']) vm.runInContext(src(f), ctx);
const W = {}; vm.runInNewContext(src('weather.js'), { window: W, URLSearchParams, Date, Map, Math, Number, String, Array, Promise });
const { SearchHelp: H, Smart, PriceCheck: P, Ics } = ctx.window;
const J = (v) => JSON.parse(JSON.stringify(v));
// 7denní předpověď v okně země (app.js paintWeather) – dny Open-Meteo 'YYYY-MM-DD'
const app = readFileSync(new URL('../public/js/app.js', ${JSON.stringify(import.meta.url)}), 'utf8');
const els = {}, wctx = { $: (s) => (els[s] ||= { innerHTML: '' }), wIco: () => ['☀️', 'Jasno'] };
vm.runInNewContext(app.match(/^function paintWeather\\(j\\) \\{[\\s\\S]*?^\\}/m)[0] + '\\npaintWeather(j);', { ...wctx, j: { current: { weather_code: 0, temperature_2m: 10, wind_speed_10m: 5, relative_humidity_2m: 70 },
  daily: { time: ['2026-10-24', '2026-10-25', '2026-10-26', '2027-03-27', '2027-03-28', '2027-03-29'], weather_code: [0, 0, 0, 0, 0, 0], temperature_2m_max: [1, 1, 1, 1, 1, 1], temperature_2m_min: [0, 0, 0, 0, 0, 0] } } });
const sc = H.spanCal({ date: '2026-10-21', hasTime: true, dep: '2026-10-21T18:30:00', arr: '2026-10-21T20:00:00' }, { date: '2026-10-28', hasTime: true, dep: '2026-10-28T21:00:00', arr: '2026-10-29T00:45:00' }, { today: '2026-10-22' });
const sp = H.spanCal({ date: '2027-03-26', hasTime: false }, { date: '2027-03-29', hasTime: false });
const cell = (c, d) => c.months.flatMap((m) => m.cells).find((x) => x.date === d);
const store = { v: 1, r: Object.fromEntries(['PRG>LIS|2026-10|rt', 'PRG>LIS|2026-11|rt'].map((k) => [k, { min: 1000, at: Date.parse('2026-10-20T10:00:00Z'), obs: [] }])) };
console.log(JSON.stringify({
  wx: [...els['#fcBox'].innerHTML.matchAll(/<div class="d">([^<]*)<\\/div>/g)].map((m) => m[1]),
  diff: [H.diffDays('2026-10-24', '2026-10-31'), H.diffDays('2027-03-27', '2027-04-03'), H.addDays('2026-10-24', 1), H.addDays('2027-03-28', -1)],
  span: [sc.nights, sc.days, sc.months[0].lead, cell(sc, '2026-10-25').wknd, cell(sc, '2026-10-28').hol, cell(sc, '2026-10-29').arr, J(sc.leave), sp.nights, sp.months[0].lead, cell(sp, '2027-03-28').wknd],
  stay: [J(H.stayPlan('2026-10-23', '2026-10-25')), J(H.stayPlan('2027-03-26', '2027-03-28'))],
  lw: J(H.longWeekend('2026-10-20')), leave: J(H.leaveWindows('2026-10-20', { horizon: 60 }).map((w) => [w.start, w.end, w.days, w.leave])),
  smart: [Smart.parseExplore('Porto na víkend', { today: '2026-10-23' }).start, Smart.parseExplore('Porto na víkend', { today: '2027-03-25' }).start],
  weather: [W.Weather.daysAhead('2026-10-26', new Date(2026, 9, 24, 12)), W.Weather.daysAhead('2027-03-29', new Date(2027, 2, 27, 23, 30)), W.Weather.dayName('2026-10-25'), W.Weather.dayName('2027-03-28')],
  ics: [Ics.localToUtc('2026-10-25T02:30', 'Europe/Prague'), Ics.localToUtc('2027-03-28T03:30', 'Europe/Prague')].map((ms) => new Date(ms).toISOString()),
  prune: Object.keys(P.prune(store, Date.parse('2026-11-01T02:00:00Z')).r),
}));`;

test('prohlížeč: dny v týdnu, noci, kalendáře a svátky kolem změny času vyjdou v každém pásmu telefonu stejně', () => {
  const all = Object.fromEntries(ZONES.map((tz) => [tz, runIn(tz, CLIENT)]));
  for (const tz of ZONES) {
    const r = all[tz];
    // předpověď v okně země: 25. 10. je neděle i v New Yorku (dřív new Date('2026-10-25') = sobota 20:00 místního)
    assert.deepEqual(r.wx, ['Dnes', 'Ne', 'Po', 'So', 'Ne', 'Po'], tz);
    assert.deepEqual(r.diff, [7, 7, '2026-10-25', '2027-03-27'], tz);
    // 21. 10. → 28. 10.: 7 nocí přes neděli 25. 10., říjen 2026 začíná čtvrtkem (3 prázdná pole), svátek 28. 10.,
    // přílet zpět po půlnoci; dovolená st–pá a po–út (28. 10. svátek, odlet v 18:30 po práci) = 4 dny
    assert.deepEqual(r.span.slice(0, 6), [7, 9, 3, true, 'Vznik Československa', 'back'], tz);
    assert.equal(r.span[6].n, 4, tz);
    assert.deepEqual(r.span.slice(7), [3, 0, true], tz);
    assert.deepEqual(r.stay, [{ days: 3, weekend: true }, { days: 3, weekend: true }], tz);
    assert.deepEqual(r.smart, ['2026-10-24', '2027-03-27'], tz);
    assert.deepEqual(r.weather, [2, 2, 'neděle', 'neděle'], tz);
    assert.deepEqual(r.ics, ['2026-10-25T00:30:00.000Z', '2027-03-28T01:30:00.000Z'], tz);
    // kalendáře svátků a „Kdy si vzít dovolenou“ – stejné jako v Praze
    assert.deepEqual([r.lw, r.leave], [all['Europe/Prague'].lw, all['Europe/Prague'].leave], tz);
  }
  assert.equal(all.UTC.lw.start, '2026-11-14');
  // paměť cen zapomíná odlety v minulých měsících podle místního kalendáře: v New Yorku je 1. 11. ve 2:00 UTC
  // ještě 31. 10. večer – říjnové odlety (i ten dnešní) zůstanou; v Praze, Tokiu i UTC už je listopad
  assert.deepEqual(all['America/New_York'].prune, ['PRG>LIS|2026-10|rt', 'PRG>LIS|2026-11|rt']);
  for (const tz of ['Europe/Prague', 'Asia/Tokyo', 'UTC']) assert.deepEqual(all[tz].prune, ['PRG>LIS|2026-11|rt'], tz);
});
