// Navedení k plánování celé dovolené: tlačítko u letu a druhá cesta z úvodu (karta 🧳 na Přehledu ji jen opakovala –
// smazaná, test/ux-prehled.test.js). Dřív do průvodce cestou vedlo jen „Vybrat a pokračovat“ u nabídky.
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
  assert.match(hero, /<button type="button" class="hero-plan" id="heroPlan"><span class="ico i-program" aria-hidden="true"><\/span> Naplánovat celou dovolenou <span aria-hidden="true">→<\/span><\/button>/);
  assert.match(app, /const hp = \$\('#heroPlan'\); if \(hp\) hp\.onclick = \(\) => go\('trip'\);/);
});

test('příklady vět ✨ Zkus napsat: domov do věty přes víc měst jen jako město nebo letiště', () => {
  const src = fl.slice(fl.indexOf('const homeWord = '), fl.indexOf('function paintSmartTry()'));
  const ctx = vm.createContext({ S: { home: null }, MNS_IN: [], today: () => '2026-11-04' });
  vm.runInContext(`${src}; this.homeWord = homeWord;`, ctx);
  // domov celá země do věty „Česko → Řím → …“ ne (byla by to cesta do Česka); letiště a město ano, 📍 Moje poloha ne
  assert.equal(ctx.homeWord({ id: 'cc:CZ', label: 'Česko' }), '');
  assert.equal(ctx.homeWord({ id: 'ap:PRG', label: 'Praha (PRG)' }), 'Praha');
  assert.equal(ctx.homeWord({ id: 'geo:50.1,14.4|Moje poloha', label: 'Moje poloha' }), '');
  assert.match(fl, /\$\$\('\[data-try\]', host\)\.forEach\(b => b\.onclick = \(\) => trySentence\(TRY\[\+b\.dataset\.try\], b\)\);/);
  assert.match(fl, /renderFav, trySentence,/);
});

test('věty o celé cestě Smart rozumí: prodloužený víkend, týden a tam do Lisabonu, zpět z Porta', () => {
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

test('písmo tlačítek: font zkratkou s „inherit“ prohlížeč zahodí celé – v CSS nikde', () => {
  for (const f of ['atlas.css', 'flights.css', 'trip.css', 'desktop.css', 'desktop-flights.css', 'desktop-trip.css', 'desktop-explore.css', 'pretrip.css', 'pwa.css']) {
    assert.doesNotMatch(read(`css/${f}`), /font:\s*\d[^;}]*\binherit/, f); // „font:700 14px/1.25 inherit“ = neplatné
  }
  assert.match(read('css/flights.css'), /\.hero-plan\{[^}]*font-weight:700;font-size:14px;line-height:1\.25;font-family:inherit;/);
});
