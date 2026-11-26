// Drobnosti z funkční kontroly Letů a Cesty: noci „9–3“, rozsah přes rok, zavazadlo z minula u ✨ věty, opravené hledání
// během běžícího, „2 týdny“ v Upřesnit, „letenka“ u jen tam, čas auta v poznámkách, „N místa“ v trase, README o odkazech.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
const trip = readFileSync(new URL('../public/js/trip.js', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const BAG_LBL = { cabin: 'kabinový kufr', checked: 'kufr k odbavení' };

test('noci „od“ větší než „do“ se prohodí už ve formuláři – před getForm(), ať je uložené hledání i Nedávno „3–9“', () => {
  const m = fl.match(/async function startSearch\(opts = \{\}\) \{\n(?: *\/\/[^\n]*\n)?( *const nMin = [^\n]+\n *if \(nMin\.value[^\n]+\n) *const f = getForm\(\);/);
  assert.ok(m, 'prohození na začátku startSearch');
  const run = (a, b) => {
    const el = { nMin: { value: a }, nMax: { value: b } };
    new Function('$', m[1])(s => el[s.slice(1)]);
    return [el.nMin.value, el.nMax.value];
  };
  assert.deepEqual(run('9', '3'), ['3', '9']);
  assert.deepEqual(run('3', '9'), ['3', '9']);
  assert.deepEqual(run('12', '9'), ['9', '12'], 'čísla, ne text („12“ < „9“)');
  assert.deepEqual(run('5', ''), ['5', ''], 'prázdné pole nechá být (ohlásí ho prohlížeč)');
});

test('rozsah odletu delší než rok: hláška jako u přesných dat, ne potichu zkrácené „26.11.–11.11.“', () => {
  const m = fl.match(/else if \((f\.dateMode !== 'exact' && f\.dTo > addDays\(today\(\), 359\))\) \{ toast\('Konec rozsahu je příliš daleko \(nejvýš rok dopředu\)', 'err'\); \$\('#dTo'\)\.focus\(\); return; \}/);
  assert.ok(m, 'kontrola v startSearch');
  const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
  const bad = new Function('f', 'addDays', 'today', `return ${m[1]};`);
  const today = () => '2026-11-16';
  assert.equal(bad({ dateMode: 'flex', dTo: '2027-11-26' }, addDays, today), true);
  assert.equal(bad({ dateMode: 'flex', dTo: addDays('2026-11-16', 359) }, addDays, today), false, '359 dní ještě projde');
  assert.equal(bad({ dateMode: 'flex', dTo: '2027-01-15' }, addDays, today), false);
  assert.equal(bad({ dateMode: 'exact', dTo: '2027-12-31' }, addDays, today), false, 'přesná data hlídá server');
});

test('✨ věta: zavazadlo z minulého hledání (prefsOf ho převezme) řádek řekne stejně jako cestující', () => {
  const m = fl.match(/( *const pf = S\.form \|\| \{\}, inh = [\s\S]*?const what = [^\n]+\n)/);
  assert.ok(m, 'řádek ✨ věty');
  const what = (form, patch = {}, chips = []) => new Function('S', 'h', 'places', 'SearchHelp', 'BAG_LBL', `${m[1]} return what;`)(
    { form }, { sm: { patch, chips } }, ['📍 Řím'], { paxShort: f => `${f.adults} os.` }, BAG_LBL);
  assert.equal(what({ adults: 3, bags: 'checked' }), '📍 Řím · 👥 3 os. (jako minule) · 🧳 kufr k odbavení (jako minule)');
  assert.equal(what({ adults: 2, bags: 'cabin' }), '📍 Řím · 🧳 kabinový kufr (jako minule)');
  assert.equal(what({ adults: 2, bags: 'none' }), '📍 Řím', 'bez kufru nic navíc');
  assert.equal(what({ adults: 2, bags: 'checked' }, { bags: 'none' }, [{ icon: '🧳', text: 'bez kufru' }]), '📍 Řím · 🧳 bez kufru', 'věta zavazadlo říká sama');
  // hledání z věty opravdu bere zavazadlo z minula (prefsOf ho nevyřazuje)
  assert.doesNotMatch(fl.match(/function prefsOf\(f\) \{\n([^\n]+)/)[1], /\bbags\b/);
});

test('během hledání: změněný formulář povolí tlačítko (nové hledání zruší staré), stejný ho nechá „Hledám…“', () => {
  const m = fl.match(/function searchBtnPaint\(\) \{[\s\S]*?\n {2}\}/);
  assert.ok(m, 'searchBtnPaint');
  assert.match(fl, /function formEdited\(\) \{[\s\S]*?searchBtnPaint\(\);[\s\S]*?\n {2}\}/, 'volá se při úpravě formuláře');
  const run = (running, form) => {
    const btn = { disabled: true, innerHTML: 'Hledám…' };
    new Function('running', '$', 'payloadOf', 'getForm', 'ikona', `${m[0]}; searchBtnPaint();`)(running, () => btn, f => ({ to: f.to }), () => form, n => `[${n}]`);
    return btn;
  };
  const key = JSON.stringify({ to: ['Řím'] });
  assert.deepEqual(run({ key }, { to: ['Londýn'] }), { disabled: false, innerHTML: '[lupa] Najít lety' });
  // vrácený formulář = běžící hledání: opakované klepnutí by nic nového nespustilo (limit hledání z jedné adresy)
  assert.equal(run({ key }, { to: ['Řím'] }).disabled, true);
  assert.deepEqual(run(null, { to: ['Londýn'] }), { disabled: true, innerHTML: 'Hledám…' }, 'bez běžícího hledání nesahá');
  // stejné hledání startSearch znovu nespustí – jen počká na běžící
  assert.match(fl, /if \(running && running\.key === pkey\) \{\n[^\n]*\n\s*return running\.job;/);
});

test('Upřesnit: „2 týdny 11–16 nocí“ – číslice zůstane, emoji na začátku pryč', () => {
  const m = fl.match(/const word = (el => [^\n]+);\n/);
  assert.ok(m);
  const word = new Function(`return ${m[1]};`)();
  assert.equal(word({ textContent: '2 týdny' }), '2 týdny');
  assert.equal(word({ textContent: '🎉 Svátky' }), 'svátky');
  assert.equal(word({ textContent: '🗺️ Víc měst' }), 'víc měst');
  assert.equal(word(null), '');
});

test('jen tam: „letenka 320 Kč + zavazadla“, ne „letenky“', () => {
  assert.match(fl, /t\.bagCzk \? `<div class="pd">\$\{t\.back \? 'letenky' : 'letenka'\} \$\{czk\(t\.flightCzk\)\} \+ /);
});

test('poznámky uložené cesty (i .ics): auto „LIS 13. 1. 16:08 → LIS 21. 1. 5:50“, ne surový čas ISO', () => {
  const m = trip.match(/const carWhen = (s => \{[^\n]+\});\n/);
  assert.ok(m, 'carWhen');
  const carWhen = new Function(`return ${m[1]};`)();
  assert.equal(carWhen('2027-01-13T16:08'), '13. 1. 16:08');
  assert.equal(carWhen('2027-01-21T05:50'), '21. 1. 5:50');
  assert.equal(carWhen('2027-01-21'), '21. 1.');
  assert.equal(carWhen(undefined), '');
  assert.match(trip, /`Auto: \$\{carPlace\(t\.car, 'pu'\)\} \$\{carWhen\(t\.car\.from\)\} → \$\{carPlace\(t\.car, 'do'\)\} \$\{carWhen\(t\.car\.to\)\}/);
});

test('trasa: „N místa“ svítí jen podle skutečného počtu míst (po přidání 4. místa nesvítí „3 místa“)', () => {
  const m = trip.match(/\$\{(\[2, 3, 4\]\.filter\(k => k <= total\)\.map\(k => `<button type="button" data-cnt="\$\{k\}" class="\$\{[^}]+\}">\$\{k\} místa<\/button>`\)\.join\(''\))\}/);
  assert.ok(m);
  const on = (want, n) => [...new Function('r', 'n', 'total', `return ${m[1]};`)({ want }, n, 9).matchAll(/data-cnt="(\d)" class="on"/g)].map(x => +x[1]);
  assert.deepEqual(on(3, 3), [3]);
  assert.deepEqual(on(3, 4), [], 'trasa se od volby liší');
  assert.deepEqual(on(null, 3), []);
});

test('README: sdílení odkazem popisuje krátký odkaz /c/ uložený na serveru na 400 dní', () => {
  const sec = readme.slice(readme.indexOf('## Sdílení odkazem'), readme.indexOf('## Jak to funguje'));
  assert.doesNotMatch(sec, /Na server se nic neukládá/);
  assert.doesNotMatch(sec, /by potřeboval úložiště/);
  assert.match(sec, /`\/c\/<id>`: cesta se uloží na serveru na 400 dní/);
});
