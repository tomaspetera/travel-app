// Předstartovní kontrola Letů: dvojklik na „Najít lety“ nespustí dlaždici pod ním, chyba hledání nezahodí dřívější
// výsledky, rozlišitelné čipy Nedávno a řádky sbaleného výpisu. Čistá logika z searchhelp.js + zapojení ve flights.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const H = ctx.window.SearchHelp;
const flightsJs = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');

test('ideaClickOk: dlaždice v Letech nespustí hledání, když hledání běží nebo začalo před méně než sekundou', () => {
  const t0 = 1_700_000_000_000;
  assert.equal(H.ideaClickOk(null, t0, t0 + 300), false, 'druhé klepnutí na Najít lety padlo na dlaždici');
  assert.equal(H.ideaClickOk({ key: 'x' }, t0, t0 + 60_000), false, 'hledání běží');
  assert.equal(H.ideaClickOk(null, t0, t0 + 1000), true);
  assert.equal(H.ideaClickOk(null, 0, t0), true, 'ještě se nehledalo');
  // zapojení: obě obsluhy dlaždic se ptají jako první, jen v Letech (#flIdeas)
  assert.match(flightsJs, /const ideaOk = el => !el\.closest\('#flIdeas'\) \|\| SearchHelp\.ideaClickOk\(running, searchAt, Date\.now\(\)\);/);
  assert.match(flightsJs, /\$\$\('\[data-qfav\]'\)\.forEach\(qv => \{ qv\.onclick = \(\) => \{ if \(!ideaOk\(qv\)\) return;/);
  assert.match(flightsJs, /\$\$\('\[data-qf\]'\)\.forEach\(el => el\.onclick = \(\) => \{\n\s*if \(!ideaOk\(el\)\) return;/);
  // čas startu až za kontrolami formuláře (odmítnuté hledání formulář nesbalí) a před sbalením
  assert.match(flightsJs, /searchAt = Date\.now\(\);[^\n]*\n\s*collapseForm\(f\);/);
});

test('keptNote: hláška chyby řekne, z kdy jsou výsledky, které pod ní zůstaly', () => {
  const at = new Date(2026, 10, 26, 9, 5).getTime();
  assert.equal(H.keptNote(at, at + 20 * 60000), 'Níže zůstávají výsledky z 9:05.');
  assert.equal(H.keptNote(at, new Date(2026, 10, 27, 8, 0).getTime()), 'Níže zůstávají výsledky ze včera 9:05.');
  assert.equal(H.keptNote(0, at), 'Níže zůstávají dřívější výsledky.');
  // zapojení v catch startSearch: jen bez průběžných výsledků a s prázdným #results; zašedlé (.aged)
  const c = flightsJs.slice(flightsJs.indexOf("if (e.name === 'AbortError') return;", flightsJs.indexOf('async function startSearch(')));
  assert.match(c, /const kept = !s\.shown && lastResult && !\$\('#results'\)\.children\.length;\n\s*if \(kept\) \{ renderResults\(\); \$\('#results'\)\.classList\.add\('aged'\); \}/);
  assert.match(c, /SearchHelp\.keptNote\(/);
  assert.ok(c.indexOf('const kept') < c.indexOf("$('#progress').innerHTML"), 'věta je v hlášce');
});

test('recentNotes: čipy Nedávno se stejným textem dostanou termín a cenový strop, čím se liší', () => {
  const f = (dFrom, dTo, maxPrice = '') => ({ trip: 'return', dateMode: 'flex', dFrom, dTo, maxPrice });
  const a = { text: 'Praha → Řím|týden', f: f('2026-12-01', '2026-12-15') };
  const b = { text: 'Praha → Řím|týden', f: f('2027-01-05', '2027-02-10') };
  const c = { text: 'Praha → Paříž|týden', f: f('2026-12-01', '2026-12-15') };
  assert.deepEqual([...H.recentNotes([a, b, c])], [' · 1.–15. 12.', ' · 5. 1.–10. 2.', '']);
  // stejný termín, jiný strop → jen cena
  const d = { text: a.text, f: f('2026-12-01', '2026-12-15', '3000') };
  assert.deepEqual([...H.recentNotes([a, d])], ['', ` · do ${(3000).toLocaleString('cs-CZ')} Kč`]);
  assert.deepEqual([...H.recentNotes([a])], ['']);
  assert.deepEqual([...H.recentNotes(null)], []);
  assert.match(flightsJs, /SearchHelp\.recentNotes\(items\.map\(x => \(\{ text: watchLabel\(x\.f\) \+ '\|' \+ x\.sub, f: x\.f \}\)\)\)/);
  assert.match(flightsJs, /<small>\$\{esc\(x\.sub\)\}<\/small>/);
});

test('miniTwins + miniTimes: stejně vypadající řádky sbaleného výpisu dostanou časy odletu', () => {
  const leg = (from, to, dep) => ({ from, to, dep, date: dep.slice(0, 10), hasTime: true });
  const t = (id, o, b) => ({ id, out: leg('PRG', 'FCO', `2026-12-01T${o}:00`), back: leg('FCO', 'PRG', `2026-12-08T${b}:00`), nights: 7 });
  const x = t('a', '06:00', '21:50'), y = t('b', '06:00', '09:15'), z = { ...t('c', '06:00', '21:50'), back: leg('FCO', 'PRG', '2026-12-09T10:00:00'), nights: 8 };
  assert.deepEqual([...H.miniTwins([x, y, z])].sort(), ['a', 'b']);
  assert.equal(H.miniTwins([]).size, 0);
  assert.equal(H.miniTimes(x), '6:00 / 21:50');
  assert.equal(H.miniTimes({ out: leg('PRG', 'FCO', '2026-12-01T14:05:00') }), '14:05');
  assert.equal(H.miniTimes({ out: { ...x.out, hasTime: false }, back: x.back }), '', 'bez času nic');
  assert.match(flightsJs, /const twins = mini \? SearchHelp\.miniTwins\(list\.slice\(0, n\)\) : new Set\(\);/);
  assert.match(flightsJs, /return tripMini\(t, dg, twins\.has\(t\.id\)\);/);
  assert.match(flightsJs, /\$\{esc\(r\)\}\$\{esc\(times\)\}\$\{stops\}/);
});
