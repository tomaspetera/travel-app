// 📅 Kalendář pro „Kamkoliv“ a hledání do země (public/js/searchhelp.js → SearchHelp.dayCal): z načtených nabídek
// nejlevnější cíl a počet cílů pro každý den odletu a návratu; pohled ve výsledcích (public/js/flights.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const sh = { window: {} };
vm.runInNewContext(src('js/searchhelp.js'), sh);
const H = sh.window.SearchHelp;
const J = (x) => JSON.parse(JSON.stringify(x)); // pole z vm mají jiný prototyp – deepEqual podle hodnot

const trip = (destKey, out, back, czk, from = 'PRG', to = 'XXX') => ({ destKey, perPersonCzk: czk, out: { date: out, from, to }, ...(back ? { back: { date: back, from: to, to: from } } : {}) });
const DEST = { BCN: { key: 'BCN', label: 'Barcelona', cc: 'ES' }, MIL: { key: 'MIL', label: 'Milán', cc: 'IT' }, LON: { key: 'LON', label: 'Londýn', cc: 'GB' } };
const destOf = (t) => DEST[t.destKey];

test('dayCal: den odletu → nejlevnější cíl, počet cílů, návrat; dny podle data', () => {
  const r = H.dayCal([
    trip('MIL', '2026-11-17', '2026-11-24', 980.4, 'PRG', 'BGY'),
    trip('BCN', '2026-11-17', '2026-11-21', 1490),
    trip('MIL', '2026-11-17', '2026-11-22', 1100), // týž cíl znovu – počítá se jednou
    trip('LON', '2026-11-03', '2026-11-08', 2100),
  ], { destOf });
  assert.deepEqual(J(r.out.map((d) => d.date)), ['2026-11-03', '2026-11-17']);
  const d17 = r.out[1];
  assert.equal(d17.cost, 980); // zaokrouhleno
  assert.equal(d17.label, 'Milán');
  assert.equal(d17.cc, 'IT');
  assert.equal(d17.key, 'MIL');
  assert.equal(d17.from, 'PRG');
  assert.equal(d17.to, 'BGY');
  assert.equal(d17.backDate, '2026-11-24');
  assert.equal(d17.n, 2); // Milán a Barcelona
  assert.deepEqual(J(r.back.map((d) => [d.date, d.label, d.outDate, d.n])), [
    ['2026-11-08', 'Londýn', '2026-11-03', 1],
    ['2026-11-21', 'Barcelona', '2026-11-17', 1],
    ['2026-11-22', 'Milán', '2026-11-17', 1],
    ['2026-11-24', 'Milán', '2026-11-17', 1],
  ]);
});

test('dayCal: jen tam bez dnů návratu; stejná cena → první (pořadí výpisu); bez destOf podle destKey; vadné nabídky pryč', () => {
  const r = H.dayCal([
    trip('BCN', '2026-12-01', null, 700),
    trip('MIL', '2026-12-01', null, 700),
    null,
    { destKey: 'LON', out: { date: '2026-12-02' } }, // bez ceny
    { destKey: 'LON', perPersonCzk: 500 }, // bez letu
  ]);
  assert.equal(r.back.length, 0);
  assert.equal(r.out.length, 1);
  assert.equal(r.out[0].key, 'BCN');
  assert.equal(r.out[0].label, '');
  assert.equal(r.out[0].backDate, null);
  assert.equal(r.out[0].n, 2);
  assert.deepEqual(J(H.dayCal(null)), { out: [], back: [] });
});

test('výsledky: 📅 Kalendář i u Kamkoliv a země (z načtených nabídek), ne u cesty přes víc měst', () => {
  const js = src('js/flights.js');
  // přepínač pohledů nabízí kalendář vždy (cesta přes víc měst má vlastní výpis a do přepínače nedojde)
  assert.match(js, /\['map', '🗺️ Mapa'\], \['cal', '📅 Kalendář'\]\];/);
  assert.match(js, /if \(view\.mode === 'cal' && res\.mode === 'multi'\) view\.mode = 'list';/);
  // Kamkoliv: kalendář cílů z dayCal a pod ním cíle vybraného dne (bez tří velkých karet) s ✕ zrušit den
  assert.match(js, /function destCalHtml\(res, vis\)/);
  assert.match(js, /SearchHelp\.dayCal\(vis\.flatMap\(g => g\.vis\), opt\)/);
  assert.match(js, /compactList\(groups, \{ strip: false \}\)/);
  assert.match(js, /data-af="outDate">✕ zrušit den</);
  // u jednoho cíle: kalendář ze serveru (calendarHtml) se stejným vykreslením měsíců (calBox) – i bez prázdných týdnů
  assert.match(js, /const render = \(days, title, clickable, all\) => calBox\(days, title, clickable, all, \{ fOn, by, tip, trim: true \}\);/);
});
