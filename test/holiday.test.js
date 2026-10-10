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
