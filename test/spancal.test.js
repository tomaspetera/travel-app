// 📅 V kalendáři: termín nabídky letu v kalendáři (čistá logika SearchHelp.spanCal z public/js/searchhelp.js)
// a kde se ukazuje (karta nabídky ve výpisu, náhled cíle) – public/js/flights.js, public/css/flights.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(read('js/searchhelp.js'), ctx);
const H = ctx.window.SearchHelp;
const plain = (v) => JSON.parse(JSON.stringify(v));
const leg = (date, dep, arr) => ({ date, dep: dep ? `${date}T${dep}` : null, arr: arr ? (arr.length > 5 ? arr : `${date}T${arr}`) : null, hasTime: Boolean(dep) });
const cellsOf = (c) => c.months.flatMap((m) => m.cells);
const at = (c, date) => cellsOf(c).find((x) => x.date === date);
const roles = (c) => Object.fromEntries(cellsOf(c).filter((x) => x.role).map((x) => [x.date, x.role]));

test('spanCal: cesta v jednom měsíci – odlet, noci, návrat, svátek 17. 11., dny dovolené a časy', () => {
  const c = H.spanCal(leg('2026-11-17', '15:50', '17:04'), leg('2026-11-24', '14:50', '16:11'), { today: '2026-10-21' });
  assert.deepEqual(plain(c.months.map((m) => [m.key, m.name, m.lead, m.cells.length])), [['2026-11', 'listopad', 6, 30]]); // 1. 11. 2026 je neděle
  assert.equal(c.gap, false);
  assert.deepEqual(plain(roles(c)), {
    '2026-11-17': 'out', '2026-11-18': 'night', '2026-11-19': 'night', '2026-11-20': 'night', '2026-11-21': 'night',
    '2026-11-22': 'night', '2026-11-23': 'night', '2026-11-24': 'back',
  });
  assert.equal(at(c, '2026-11-17').hol, 'Den boje za svobodu');
  assert.deepEqual(plain(c.holidays), [{ date: '2026-11-17', name: 'Den boje za svobodu', inTrip: true }]);
  assert.equal(at(c, '2026-11-21').wknd, true);
  assert.equal(at(c, '2026-11-20').wknd, false);
  assert.equal(c.nights, 7);
  assert.equal(c.days, 8);
  assert.equal(c.leave.n, 5, 'svátek 17. 11. a víkend se do dovolené nepočítají');
  assert.deepEqual(plain(c.times), { outDep: '15:50', outArr: '17:04', backDep: '14:50', backArr: '16:11' });
  assert.ok(cellsOf(c).every((x) => !x.past && !x.today), 'dnešek (21. 10.) je mimo nakreslený měsíc');
});

test('spanCal: přes konec měsíce dva měsíce vedle sebe, svátky v nich i mimo termín', () => {
  const c = H.spanCal(leg('2026-11-28', '06:30', '08:40'), leg('2026-12-03', '20:00', '22:05'));
  assert.deepEqual(plain(c.months.map((m) => [m.key, m.lead])), [['2026-11', 6], ['2026-12', 1]]); // 1. 12. 2026 je úterý
  assert.deepEqual(plain(roles(c)), { '2026-11-28': 'out', '2026-11-29': 'night', '2026-11-30': 'night', '2026-12-01': 'night', '2026-12-02': 'night', '2026-12-03': 'back' });
  assert.deepEqual(plain(c.holidays.map((h) => [h.date, h.inTrip])), [['2026-11-17', false], ['2026-12-24', false], ['2026-12-25', false], ['2026-12-26', false]]);
  assert.equal(c.nights, 5);
});

test('spanCal: noční let – přílet další den (arr), návrat s příletem po půlnoci prodlouží cestu', () => {
  const c = H.spanCal(leg('2026-11-10', '23:30', '2026-11-11T06:10'), leg('2026-11-15', '22:00', '2026-11-16T01:30'));
  assert.equal(at(c, '2026-11-11').arr, 'out');
  assert.equal(at(c, '2026-11-11').role, 'night');
  assert.equal(at(c, '2026-11-16').arr, 'back');
  assert.equal(at(c, '2026-11-16').role, null);
  assert.equal(c.days, 7, 'od 10. do 16. 11. včetně');
  assert.equal(c.nights, 5);
  // bez času (cena z mezipaměti) žádný přílet další den
  const d = H.spanCal({ date: '2026-11-10', dep: '2026-11-10', arr: '2026-11-11T06:10', hasTime: false }, null);
  assert.ok(cellsOf(d).every((x) => !x.arr));
  assert.deepEqual(plain(d.times), { outDep: '', outArr: '', backDep: '', backArr: '' });
});

test('spanCal: jen tam – jen den odletu, bez nocí a dovolené; neplatný návrat = jen tam', () => {
  const c = H.spanCal(leg('2026-12-05', '09:15', '11:00'), null);
  assert.deepEqual(plain(roles(c)), { '2026-12-05': 'out' });
  assert.equal(c.back, null);
  assert.equal(c.nights, null);
  assert.equal(c.leave, null);
  assert.equal(c.days, 1);
  const bad = H.spanCal(leg('2026-12-05', '09:15'), leg('2026-12-01', '10:00'));
  assert.deepEqual(plain(roles(bad)), { '2026-12-05': 'out' });
  assert.equal(H.spanCal({ date: '5. 12.' }), null);
  assert.equal(H.spanCal(null), null);
});

test('spanCal: tam i zpět týž den = both; noci z nabídky mají přednost', () => {
  const c = H.spanCal(leg('2026-11-07', '06:00', '07:10'), leg('2026-11-07', '21:00', '22:10'));
  assert.deepEqual(plain(roles(c)), { '2026-11-07': 'both' });
  assert.equal(c.nights, 0);
  const n = H.spanCal(leg('2026-11-10', '23:30', '2026-11-11T06:10'), leg('2026-11-15', '10:00', '12:00'), { nights: 4 });
  assert.equal(n.nights, 4);
});

test('spanCal: dlouhá cesta přes víc měsíců – jen první a poslední měsíc (gap)', () => {
  const c = H.spanCal(leg('2026-10-25', '10:00', '13:00'), leg('2027-01-10', '12:00', '15:00'));
  assert.equal(c.gap, true);
  assert.deepEqual(plain(c.months.map((m) => m.key)), ['2026-10', '2027-01']);
  assert.equal(at(c, '2026-10-31').role, 'night');
  assert.equal(at(c, '2027-01-01').role, 'night');
  assert.equal(at(c, '2027-01-01').hol, 'Nový rok');
  assert.equal(c.nights, 77);
  assert.equal(c.leave, null, 'přes 60 dní dny dovolené nepočítá');
});

test('spanCal: dnešek a minulé dny', () => {
  const c = H.spanCal(leg('2026-11-21', '07:00', '08:00'), leg('2026-11-23', '18:00', '19:00'), { today: '2026-11-20' });
  assert.equal(at(c, '2026-11-20').today, true);
  assert.equal(at(c, '2026-11-19').past, true);
  assert.equal(at(c, '2026-11-20').past, false);
  assert.equal(at(c, '2026-11-21').past, false);
  assert.deepEqual(plain(H.SPAN_DOW), ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']);
});

test('UI: 📅 V kalendáři u nabídky výpisu i v náhledu cíle, .ics a Google Kalendář, mřížka bez přetečení', () => {
  const js = read('js/flights.js'), css = read('css/flights.css');
  assert.match(js, /<div class="tr-badges">\$\{badges\(t, g, idx\)\}<\/div>\$\{scalSlot\(t, idx\)\}<\/div>/);
  assert.match(js, /scalBtn\(false, 'id="dpScal"'\)/);
  assert.match(js, /legs: \{ out: t\.out, back, t \}/);
  assert.match(js, /Přidat do kalendáře \(\.ics\)/);
  assert.match(js, /Ics\.flightEvent\(brief\(t\.out\)/);
  assert.match(js, /Ics\.checkinEvent\(/);
  assert.match(js, /Ics\.gcalUrl\(\{/);
  assert.match(js, /scalWire\(host\)/);
  assert.match(css, /\.scal-g\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(css, /\.scal-m\{flex:1 1 250px;min-width:0;max-width:400px\}/);
});
