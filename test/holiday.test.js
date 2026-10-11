// Předvolba 🎉 Svátky ve formuláři Lety a ceny prodloužených víkendů v radaru (čistá logika z public/js/searchhelp.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const H = ctx.window.SearchHelp;
const plain = (v) => JSON.parse(JSON.stringify(v));
const home = { from: [{ id: 'ap:BRQ', label: 'Brno' }], radius: 200, adults: 2 };

test('holidayDates: stejný termín jako karta radaru (dny, noci, předvečer od 16:00) pro všechny tři víkendy', () => {
  const today = '2026-10-10';
  const list = H.holidayList(today);
  assert.deepEqual(plain(list.map((x) => x.start)), ['2026-11-14', '2026-12-24', '2027-01-01']);
  for (const lw of list) {
    const h = H.holidayDates(lw, today), q = H.radarQuery('holiday', home, today, lw.start);
    assert.deepEqual(plain({ dFrom: h.dFrom, dTo: h.dTo, nMin: h.nMin, nMax: h.nMax, outDays: h.outDays, backDays: h.backDays, depAfter: h.depAfter }),
      plain({ dFrom: q.form.dFrom, dTo: q.form.dTo, nMin: q.form.nMin, nMax: q.form.nMax, outDays: q.form.outDays, backDays: q.form.backDays, depAfter: q.form.depAfter || null }));
    assert.equal(q.form.len, 'holiday', 'karta radaru otevře formulář s předvolbou 🎉 Svátky');
  }
  assert.deepEqual(plain(H.holidayDates(list[2], today)), { dFrom: '2026-12-31', dTo: '2027-01-01', nMin: 2, nMax: 3, outDays: [4, 5], backDays: [0], depAfter: { date: '2026-12-31', time: '16:00' } });
});

test('holidayOf: víkend podle termínu formuláře; upravený termín nebo minulý víkend → null', () => {
  const today = '2026-10-10';
  assert.equal(H.holidayOf({ dFrom: '2026-12-23', dTo: '2026-12-24' }, today).name, 'Vánoce');
  assert.equal(H.holidayOf({ dFrom: '2026-11-13', dTo: '2026-11-27' }, today), null, 'rozsah natažený na 2 týdny');
  assert.equal(H.holidayOf({ dFrom: '2026-11-13', dTo: '2026-11-14' }, '2026-11-13'), null, 'v předvečer už se víkend nenabízí');
  assert.equal(H.holidayOf(null, today), null);
});

test('holidayHint a dmRange: čitelný řádek pod čipy', () => {
  const [nov, xmas, ny] = H.holidayList('2026-10-10');
  assert.equal(H.dmRange(nov.start, nov.end), '14.–17. 11.');
  assert.equal(H.dmRange('2026-12-31', '2027-01-03'), '31. 12.–3. 1.');
  assert.equal(H.holidayHint(nov, '2026-10-10'), 'Odlet pá 13. 11. od 16:00 nebo so 14. 11. · návrat út 17. 11. · s volnem po 16. 11.');
  assert.equal(H.holidayHint(xmas, '2026-10-10'), 'Odlet st 23. 12. od 16:00 nebo čt 24. 12. · návrat ne 27. 12.');
  assert.equal(H.holidayHint(ny, '2026-10-10'), 'Odlet čt 31. 12. od 16:00 nebo pá 1. 1. · návrat ne 3. 1.');
});

test('lwPrices / lwKeep: ceny jen z uložených výsledků téhož domova, čerstvé, bez minulých karet; minulé víkendy zmizí', () => {
  const today = '2026-10-10', now = Date.parse('2026-10-10T18:00:00Z');
  const list = H.holidayList(today);
  const keyOf = (lw, h = home) => { const q = H.radarQuery('holiday', h, today, lw.start); return JSON.stringify({ ...q.payload, lw: q.lw.start }); };
  const entry = (lw, czks, at = now - 3600e3, h = home) => ({ key: keyOf(lw, h), at, items: czks.map((czk) => ({ czk, d1: H.holidayDates(lw, today).dFrom })) });
  let map = H.lwKeep(null, list, list[0].start, entry(list[0], [1153, 1400]));
  map = H.lwKeep(map, list, list[1].start, entry(list[1], [1759]));
  map = H.lwKeep({ ...map, '2026-09-26': entry(list[0], [1]), bogus: { x: 1 } }, list, list[2].start, entry(list[2], [2100], now - 13 * 3600e3));
  assert.deepEqual(plain(Object.keys(map).sort()), plain(list.map((x) => x.start).sort()), 'minulý víkend a nesmysl pryč');
  assert.deepEqual(plain(H.lwPrices(map, list, keyOf, now, today)), {
    '2026-11-14': { czk: 1153, at: now - 3600e3, partial: false },
    '2026-12-24': { czk: 1759, at: now - 3600e3, partial: false },
  }, 'Nový rok starší než 12 h → bez ceny');
  // jiný domov / počet lidí → žádné ceny
  const praha = { from: [{ id: 'ap:PRG', label: 'Praha' }], radius: 200, adults: 2 };
  assert.deepEqual(plain(H.lwPrices(map, list, (lw) => keyOf(lw, praha), now, today)), {});
  assert.deepEqual(plain(H.lwPrices(map, list, (lw) => keyOf(lw, { ...home, adults: 1 }), now, today)), {});
  // staré uložené S.radar.holiday (jeden záznam místo mapy) se nepoužije
  assert.deepEqual(plain(H.lwKeep(entry(list[0], [999]), list, list[1].start, entry(list[1], [1]))).length, undefined);
  assert.deepEqual(plain(Object.keys(H.lwKeep(entry(list[0], [999]), list, list[1].start, entry(list[1], [1])))), [list[1].start]);
});

// 🏖️ Dny dovolené: let tam { date, hasTime, dep }, zpět { date, hasTime, dep, arr }
const out = (dt) => ({ date: dt.slice(0, 10), hasTime: dt.length > 10, dep: dt.length > 10 ? dt + ':00' : dt });
const back = (dt, arr) => ({ ...out(dt), arr: arr ? arr + ':00' : null });

test('leaveDays: víkendy a svátky volno, odlet od 16:00 po práci, noční přílet zpět', () => {
  // středeční svátek 28. 10.: odlet v úterý večer → dovolená jen čt a pá
  const oct = H.leaveDays(out('2026-10-27T18:30'), back('2026-11-01T19:40', '2026-11-01T22:10'));
  assert.deepEqual(plain(oct), { n: 2, days: ['2026-10-29', '2026-10-30'], holidays: [{ date: '2026-10-28', name: 'Vznik Československa' }], freeOut: true, outUnknown: false });
  assert.equal(H.leaveDays(out('2026-10-28T06:00'), back('2026-11-01T19:40', '2026-11-01T22:10')).n, 2, 'odlet ráno ve svátek');
  // pátek ráno – úterý (svátek 17. 11.): pá a po; v pátek od 17:05 jen po
  const nov = H.leaveDays(out('2026-11-13T07:00'), back('2026-11-17T20:00'));
  assert.deepEqual(plain([nov.n, nov.days, nov.holidays]), [2, ['2026-11-13', '2026-11-16'], [{ date: '2026-11-17', name: 'Den boje za svobodu' }]]);
  assert.equal(H.leaveDays(out('2026-11-13T17:05'), back('2026-11-17T20:00')).n, 1);
  // Vánoce čt–ne a Velikonoce pá–po: bez dovolené
  const xmas = H.leaveDays(out('2026-12-24T10:00'), back('2026-12-27T18:00'));
  assert.equal(xmas.n, 0);
  assert.equal(H.leaveTxt(xmas).text, '🎉 bez dovolené');
  assert.equal(H.leaveDays(out('2027-03-26T08:00'), back('2027-03-29T21:00')).n, 0, 'Velký pátek a Velikonoční pondělí');
  // let bez času odletu: den odletu se počítá celý
  const unk = H.leaveDays(out('2026-11-13'), back('2026-11-15T20:00'));
  assert.deepEqual(plain([unk.n, unk.outUnknown, unk.freeOut]), [1, true, false]);
  assert.match(H.leaveTxt(unk).title, /čas odletu neznám/);
  // návrat v neděli večer s příletem po půlnoci → pondělí ráno do práce; přílet odpoledne → pondělí je dovolená
  assert.equal(H.leaveDays(out('2026-11-13T17:00'), back('2026-11-15T22:30', '2026-11-16T00:40')).n, 0);
  assert.deepEqual(plain(H.leaveDays(out('2026-11-13T17:00'), back('2026-11-15T22:30', '2026-11-16T14:00')).days), ['2026-11-16']);
  // jen tam, nesmyslné datum, návrat před odletem → nic
  assert.equal(H.leaveDays(out('2026-11-13T07:00'), null), null);
  assert.equal(H.leaveDays(out('2026-11-13T07:00'), back('2026-11-12T07:00')), null);
  assert.equal(H.leaveDays({ date: 'x' }, back('2026-11-15T20:00')), null);
  assert.equal(H.leaveDays(out('2026-11-13T07:00'), back('2027-01-20T07:00')), null, 'přes 60 dní');
  // štítek
  const t = H.leaveTxt(nov);
  assert.equal(t.text, '🏖️ 2 dny dovolené');
  assert.match(t.title, /^Dny dovolené: pá 13\. 11\., po 16\. 11\. · pomáhá svátek út 17\. 11\. \(Den boje za svobodu\)/);
  assert.match(H.leaveTxt(oct).title, /odlet v pracovní den od 16:00 počítám jako po práci/);
  assert.equal(H.leaveTxt({ n: 1, days: ['2026-11-16'], holidays: [] }).text, '🏖️ 1 den dovolené');
  assert.equal(H.leaveTxt({ n: 5, days: [], holidays: [] }).text, '🏖️ 5 dní dovolené');
});

test('leaveWindows: nejvíc volna kolem svátků za nejvýš N dní dovolené (i středeční svátek)', () => {
  const today = '2026-10-11';
  const rows = (m) => plain(H.leaveWindows(today, { maxLeave: m }).map((w) => [w.start, w.end, w.days, w.leave]));
  assert.deepEqual(rows(2), [
    ['2026-10-28', '2026-11-01', 5, ['2026-10-29', '2026-10-30']],
    ['2026-11-13', '2026-11-17', 5, ['2026-11-13', '2026-11-16']],
    ['2026-12-22', '2026-12-27', 6, ['2026-12-22', '2026-12-23']],
    ['2026-12-30', '2027-01-03', 5, ['2026-12-30', '2026-12-31']],
    ['2027-03-24', '2027-03-29', 6, ['2027-03-24', '2027-03-25']],
    ['2027-07-01', '2027-07-06', 6, ['2027-07-01', '2027-07-02']],
    ['2027-09-24', '2027-09-28', 5, ['2027-09-24', '2027-09-27']],
  ]);
  assert.deepEqual(rows(4), [
    ['2026-10-24', '2026-11-01', 9, ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30']],
    ['2026-11-14', '2026-11-22', 9, ['2026-11-16', '2026-11-18', '2026-11-19', '2026-11-20']],
    ['2026-12-24', '2027-01-03', 11, ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']],
    // Velikonoce: 10 dní dvakrát (so 20. 3.–po 29. 3. a pá 26. 3.–ne 4. 4.) – vyhraje návrat v neděli
    ['2027-03-26', '2027-04-04', 10, ['2027-03-30', '2027-03-31', '2027-04-01', '2027-04-02']],
    ['2027-07-02', '2027-07-11', 10, ['2027-07-02', '2027-07-07', '2027-07-08', '2027-07-09']],
    ['2027-09-25', '2027-10-03', 9, ['2027-09-27', '2027-09-29', '2027-09-30', '2027-10-01']],
  ]);
  assert.deepEqual(rows(0), [
    ['2026-12-24', '2026-12-27', 4, []], ['2027-01-01', '2027-01-03', 3, []], ['2027-03-26', '2027-03-29', 4, []], ['2027-07-03', '2027-07-06', 4, []],
  ]);
  for (const m of [0, 1, 2, 3, 4, 5]) {
    const list = H.leaveWindows(today, { maxLeave: m });
    list.forEach((w, i) => {
      assert.ok(w.holidays.length >= 1 && w.holidays.every((h) => ![0, 6].includes(new Date(h.date + 'T12:00:00Z').getUTCDay())), `${w.start}: svátek v pracovní den`);
      assert.ok(w.start >= '2026-10-13' && w.days <= 16 && w.days >= 3 && w.leave.length <= m && w.nights === w.days - 1);
      assert.ok(!list[i + 1] || list[i + 1].start > w.end, `${w.start}: okna se nepřekrývají`);
    });
  }
  const [first] = H.leaveWindows(today);
  assert.deepEqual(plain([first.name, first.bridge]), ['Vznik Československa', null]);
  assert.equal(H.leaveWindows(today, { maxLeave: 2 }).find((w) => w.start === '2027-03-24').name, 'Velký pátek, Velikonoční pondělí');
  // termín do formuláře jako u 🎉 Svátky: odlet v úterý večer od 16:00 nebo ve středu, návrat v neděli
  const h = H.holidayDates(first, today);
  assert.deepEqual(plain({ dFrom: h.dFrom, dTo: h.dTo, depAfter: h.depAfter, backDays: h.backDays }), { dFrom: '2026-10-27', dTo: '2026-10-28', depAfter: { date: '2026-10-27', time: '16:00' }, backDays: [0] });
  // dny dovolené okna = dny dovolené cesty v jeho termínu (odlet večer předem po práci, návrat poslední volný den)
  for (const w of H.leaveWindows(today, { maxLeave: 3 })) {
    const lv = H.leaveDays(out(H.addDays(w.start, -1) + 'T18:00'), back(w.end + 'T20:00'));
    assert.deepEqual(plain(lv.days), plain(w.leave), w.start);
  }
});
