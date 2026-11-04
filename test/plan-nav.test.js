// Navedení k plánování celé dovolené: tlačítko u letu, druhá cesta z úvodu a karta 🧳 na Přehledu (app.js renderPlanCard,
// flights.js planExamples / trySentence). Dřív do průvodce cestou vedlo jen „Vybrat a pokračovat“ u nabídky.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
const html = read('index.html'), fl = read('js/flights.js'), app = read('js/app.js'), trip = read('js/trip.js');

test('tlačítko u nabídky říká, co uživatel dostane – Naplánovat celou cestu (nabídka, víc měst, odložená)', () => {
  assert.match(fl, /const PLAN_BTN = 'Naplánovat celou cestu →'/);
  assert.match(fl, /data-pick="\$\{idx\}" title="\$\{PLAN_TIP\}">\$\{PLAN_BTN\}<\/button>/);
  assert.match(fl, /\$\{wiz \? PLAN_BTN : 'Vybrat a uložit do Mých cest →'\}/);
  assert.match(fl, /data-pgo="\$\{esc\(p\.k\)\}" title="\$\{PLAN_TIP\}">\$\{PLAN_BTN\}<\/button>/);
  // návody v aplikaci odkazují na nový název
  assert.match(trip, /u nabídky klikni na <b>Naplánovat celou cestu<\/b>/);
  for (const [f, src] of [['flights.js', fl], ['app.js', app], ['trip.js', trip], ['index.html', html]]) {
    assert.doesNotMatch(src.replace(/dřív „Vybrat a pokračovat“[^\n]*/g, ''), /Vybrat a pokračovat/, f);
  }
});

test('úvod: pod hledáním letů druhá cesta – Naplánovat celou dovolenou (záložka Cesty)', () => {
  const hero = html.slice(html.indexOf('id="heroBox"'), html.indexOf('id="resumeRow"'));
  assert.ok(hero.indexOf('id="smartTry"') < hero.indexOf('id="heroPlan"'), 'pod příklady vět');
  assert.match(hero, /<button type="button" class="hero-plan" id="heroPlan">🧳 Naplánovat celou dovolenou <span aria-hidden="true">→<\/span><\/button>/);
  assert.match(app, /const hp = \$\('#heroPlan'\); if \(hp\) hp\.onclick = \(\) => go\('trip'\);/);
});

test('karta 🧳 pod radarem: dokud uživatel průvodce nepoužil a kartu neskryl; tip ⚡ Hotová cesta mezitím ne', () => {
  assert.ok(html.indexOf('id="radar"') < html.indexOf('id="planCard"') && html.indexOf('id="planCard"') < html.indexOf('id="favSec"'));
  const a = app.indexOf('const tipNext = '), b = app.indexOf('function renderDashTip(');
  const ctx = vm.createContext({});
  vm.runInContext(app.slice(a, b) + '\nthis.planCardOn = planCardOn; this.tipPick = tipPick;', ctx);
  const { planCardOn, tipPick } = ctx;
  assert.equal(planCardOn({ trips: [] }, false), true);
  assert.equal(planCardOn({ trips: [] }, true), false, 'skrytá ✕');
  assert.equal(planCardOn({ trips: [], trip: { step: 'stay' } }, false), false, 'rozpracovaná cesta v průvodci');
  assert.equal(planCardOn({ trips: [null, { name: 'Řím', wizard: {} }] }, false), false, 'uložená cesta z průvodce');
  assert.equal(planCardOn({ trips: [{ name: 'Vlastní' }] }, false), true, 'vlastní cesta bez průvodce');
  // uživatel, kterému by dnes vyšel tip ⚡ Hotová cesta: s viditelnou kartou žádný tip navíc
  const s = { home: { from: [{ id: 'ap:PRG' }] }, recent: [{ form: { to: [] } }], watch: [{}], pins: [{}], trips: [], trip: null, navUse: {} };
  assert.equal((tipPick(s, {}, null, '2026-11-04') || {}).id, 'auto');
  assert.notEqual((tipPick(s, { plan: true }, null, '2026-11-04') || {}).id, 'auto');
});

test('příklady vět na kartě: prodloužený víkend, týden a dvě města s přejezdem (bez letu Lisabon → Porto); spouští se jako ✨ Zkus napsat', () => {
  const src = fl.slice(fl.indexOf('const homeWord = '), fl.indexOf('function paintSmartTry()'));
  const ctx = vm.createContext({ S: { home: null }, MNS_IN: [], today: () => '2026-11-04' });
  vm.runInContext(`${src}; this.planExamples = planExamples; this.homeWord = homeWord;`, ctx);
  assert.deepEqual([...ctx.planExamples()], ['Řím na prodloužený víkend', 'Barcelona na týden', 'Lisabon a zpět z Porta na týden']);
  // domov celá země do věty „Česko → Řím → …“ ne (byla by to cesta do Česka); letiště a město ano, 📍 Moje poloha ne
  assert.equal(ctx.homeWord({ id: 'cc:CZ', label: 'Česko' }), '');
  assert.equal(ctx.homeWord({ id: 'ap:PRG', label: 'Praha (PRG)' }), 'Praha');
  assert.equal(ctx.homeWord({ id: 'geo:50.1,14.4|Moje poloha', label: 'Moje poloha' }), '');
  assert.match(fl, /\$\$\('\[data-try\]', host\)\.forEach\(b => b\.onclick = \(\) => trySentence\(TRY\[\+b\.dataset\.try\], b\)\);/);
  assert.match(app, /\$\$\('\[data-pex\]', el\)\.forEach\(b => b\.onclick = \(\) => Flights\.trySentence\(ex\[\+b\.dataset\.pex\], b\)\);/);
  assert.match(fl, /renderFav, planExamples, trySentence,/);
});

test('příklady vět z karty Smart rozumí: prodloužený víkend, týden a tam do Lisabonu, zpět z Porta', () => {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(read('js/searchhelp.js'), ctx);
  vm.runInContext(read('js/smart.js'), ctx);
  const { Smart, SearchHelp } = ctx.window;
  const presets = { weekend: { nMin: 1, nMax: 3, out: [4, 5, 6], back: [0, 1] }, long: { nMin: 3, nMax: 5, out: [3, 4, 5], back: [0, 1, 2] }, week: { nMin: 5, nMax: 9, out: [], back: [] }, '2weeks': { nMin: 11, nMax: 16, out: [], back: [] } };
  const P = q => JSON.parse(JSON.stringify(Smart.parse(q, { today: '2026-11-04', presets, holidays: SearchHelp.holidayList('2026-11-04'), holidayDates: SearchHelp.holidayDates })));
  const w = P('Barcelona na týden');
  assert.deepEqual([w.to, w.patch.len], [['Barcelona'], 'week']);
  const l = P('Řím na prodloužený víkend');
  assert.deepEqual([l.to, l.patch.len], [['Řím'], 'long']);
  // tam do Lisabonu, zpět z Porta (back) – mezi nimi průvodce navrhne přejezd
  const o = P('Lisabon a zpět z Porta na týden');
  assert.deepEqual([o.to, o.back, o.patch.len], [['Lisabon'], 'Porta', 'week']);
});

test('karta se po použití průvodce nevrátí (ani po ↺ Začít znovu nebo smazání cest); dlouhá věta ji nerozšíří', () => {
  assert.match(app, /const planOff = \(\) => \{ if \(planMem\) return true; try \{ return \/\^\(off\|used\)\$\/\.test\(localStorage\.getItem\('atlas_plancard'\) \|\| ''\); \}/);
  assert.match(app, /if \(!planCardOn\(S, false\) && !planOff\(\)\) planMark\('used'\);/);
  assert.match(trip, /function start\(\{ t, g, result, ccs = null, at = 0, stops = null \}\) \{\n {4}\/\/[^\n]*\n {4}try \{ if \(localStorage\.getItem\('atlas_plancard'\) !== 'off'\) localStorage\.setItem\('atlas_plancard', 'used'\); \}/);
  const css = read('css/atlas.css');
  assert.match(css, /\.plan-card\{display:grid;grid-template-columns:minmax\(0,1fr\);/);
  assert.match(css, /\.plc-try \.recent-chip\{white-space:normal;/);
});

test('písmo tlačítek: font zkratkou s „inherit“ prohlížeč zahodí celé – v CSS nikde', () => {
  for (const f of ['atlas.css', 'flights.css', 'trip.css', 'desktop.css', 'desktop-flights.css', 'desktop-trip.css', 'desktop-explore.css', 'pretrip.css', 'pwa.css']) {
    assert.doesNotMatch(read(`css/${f}`), /font:\s*\d[^;}]*\binherit/, f); // „font:700 14px/1.25 inherit“ = neplatné
  }
  assert.match(read('css/flights.css'), /\.hero-plan\{[^}]*font-weight:700;font-size:14px;line-height:1\.25;font-family:inherit;/);
});
