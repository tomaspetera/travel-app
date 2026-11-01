// ✏️ Upravit cestu v detailu (app.js editTrip): název, termín a cestující; program dnů se s termínem posune.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const okYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const fn = src.match(/function shiftDays\(days, oldStart, start, end\) \{[\s\S]*?\n\}/);
const shiftDays = new Function('okYmd', `${fn[0]}; return shiftDays;`)(okYmd);

test('nový termín: program dnů se posune s odjezdem (den 1 zůstane dnem 1)', () => {
  const days = { '2026-12-10': ['Koloseum'], '2026-12-11': [], '2026-12-12': ['Vatikán'] };
  assert.deepEqual(shiftDays(days, '2026-12-10', '2026-12-17', '2026-12-20'), { '2026-12-17': ['Koloseum'], '2026-12-19': ['Vatikán'] });
  // přes konec měsíce a roku
  assert.deepEqual(shiftDays({ '2026-12-30': ['a'], '2027-01-01': ['b'] }, '2026-12-30', '2027-01-30', '2027-02-05'), { '2027-01-30': ['a'], '2027-02-01': ['b'] });
  // jen jiný návrat: nic se neposune
  assert.deepEqual(shiftDays(days, '2026-12-10', '2026-12-10', '2026-12-14'), { '2026-12-10': ['Koloseum'], '2026-12-12': ['Vatikán'] });
});

test('kratší cesta: dny za návratem se přidají k poslednímu dni, před odjezdem k prvnímu – nic se neztratí', () => {
  const days = { '2026-12-10': ['Koloseum'], '2026-12-12': ['Vatikán'], '2026-12-13': ['odlet'] };
  assert.deepEqual(shiftDays(days, '2026-12-10', '2026-12-17', '2026-12-19'), { '2026-12-17': ['Koloseum'], '2026-12-19': ['Vatikán', 'odlet'] });
  assert.deepEqual(shiftDays(days, '2026-12-10', '2026-12-10', '2026-12-11'), { '2026-12-10': ['Koloseum'], '2026-12-11': ['Vatikán', 'odlet'] });
  // cesta bez původního odjezdu: jen srovnat do termínu
  assert.deepEqual(shiftDays({ '2026-05-01': ['x'] }, '', '2026-06-01', '2026-06-03'), { '2026-06-01': ['x'] });
  // poškozené klíče a prázdné dny pryč
  assert.deepEqual(shiftDays({ 'xx': ['a'], '2026-12-10': null }, '2026-12-10', '2026-12-11', '2026-12-12'), {});
  assert.deepEqual(shiftDays(undefined, '2026-12-10', '2026-12-11', '2026-12-12'), {});
});

test('detail cesty má ✏️ Upravit; cesta z průvodce mění jen název (termín a cestující přepíše průvodce)', () => {
  assert.match(src, /<button type="button" class="trip-edit" id="tripEdit">✏️ Upravit název a termín<\/button>/);
  assert.match(src, /\$\('#tripEdit'\)\.onclick = \(\) => editTrip\(i\);/);
  const ed = src.match(/function editTrip\(i\) \{[\s\S]*?\n\}/)[0];
  assert.match(ed, /const fixed = Boolean\(t\.wizard\);/);
  // pole termínu a cestujících jen u vlastní cesty
  assert.match(ed, /\$\{fixed \? `<div class="note info"[\s\S]*?: `[\s\S]*?id="etStart"[\s\S]*?id="etPax"[\s\S]*?`\}/);
  assert.match(ed, /if \(start && end && end < start\) \{ toast\('Návrat je před odjezdem', 'err'\); return; \}/);
  // mezitím smazaná / jiná cesta se nepřepíše
  assert.match(ed, /const x = S\.trips\[i\]; if \(x !== t\) return modalClose\(\);/);
});

test('smazané datum neslije program do jednoho dne (dřív návrat prázdný = vše na odjezd; nové datum po smazání = vše na den 1)', () => {
  const days = { '2026-12-10': ['Koloseum'], '2026-12-11': ['Trastevere'], '2026-12-12': ['Vatikán'] };
  // jen odjezd, bez návratu: posun bez slučování
  assert.deepEqual(shiftDays(days, '2026-12-10', '2027-03-03', ''), { '2027-03-03': ['Koloseum'], '2027-03-04': ['Trastevere'], '2027-03-05': ['Vatikán'] });
  // cesta bez původního data (smazané) → posun od prvního dne s programem
  assert.deepEqual(shiftDays(days, '', '2027-03-03', '2027-03-06'), { '2027-03-03': ['Koloseum'], '2027-03-04': ['Trastevere'], '2027-03-05': ['Vatikán'] });
  // editTrip bez odjezdu program nechá
  const ed = src.match(/function editTrip\(i\) \{[\s\S]*?\n\}/)[0];
  assert.match(ed, /if \(start !== \(t\.start \|\| ''\) \|\| end !== \(t\.end \|\| ''\)\) \{ if \(start\) t\.days = shiftDays\(t\.days, t\.start, start, end\); t\.start = start; t\.end = end; \}/);
});
