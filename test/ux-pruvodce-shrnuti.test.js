// UX kontrola před spuštěním – průvodce cestou a Shrnutí (public/js/trip.js, public/js/app.js openTrip):
// U16 „Hotovo – zpět na Moje cesty“ místo „Uložit“ a „Uloženo ✓“ u ‹ Moje cesty (cesta se ukládá sama);
// U17 jedno „Do kalendáře ▾“ (Google / .ics), Sdílet jako hlavní akce, „Začít novou cestu“ odkazem dole;
// U18 hlavička jako pruh na krocích mezi Letem a Shrnutím; U31 prázdné dny v okně cesty jedním řádkem s „+ přidat“.
// Klasické skripty přes node:vm jako v pruvodce-kontrola.test.js (zástupný DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

function loadTrip() {
  const ctx = { window: { scrollTo() {}, myTrips() {} }, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/ics.js'), ctx, { filename: 'ics.js' });
  const helpers = read('public/js/app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = { trips: [] }, __els = {};
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {}, scrollIntoView() {} });
    var $$ = () => [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']'; var toast = () => {};
    var confirm = () => false; var say = () => {};
    var byIso = { PT: { cs: 'Portugalsko' } }; var PACK = ['Pas'];`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(read('public/js/trip.js'), ctx, { filename: 'trip.js' });
  return ctx;
}
const leg = (from, to, date) => ({ from, to, date, dep: `${date}T10:00:00`, arr: `${date}T12:00:00`, hasTime: true, carrierName: 'Demo Air', provider: 'demo-air' });
const lisbon = (o = {}) => ({
  v: 1, created: 1767225600000, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', ground: {}, verifiedAt: 1,
  flight: { out: leg('PRG', 'LIS', day(60)), back: leg('LIS', 'PRG', day(65)), flightCzk: 5000, groundCzk: 0, bagCzk: 0 },
  dest: { label: 'Lisabon', country: 'Portugalsko', cc: 'PT', lat: 38.72, lon: -9.14 }, stay: null, car: null, plan: null, ...o,
});

test('U18: hlavička jako pruh jen na krocích mezi Letem a Shrnutím', () => {
  const { miniHead } = loadTrip().window.Trip;
  for (const step of ['route', 'stay', 'car', 'program']) assert.equal(miniHead({ step }), true, step);
  for (const step of ['flight', 'summary']) assert.equal(miniHead({ step }), false, step);
});

test('U18: v pruhu se schová země i noci – zbude „termín · os.“, cena (jen známá) vpravo', () => {
  const c = loadTrip();
  c.S.trip = lisbon({ step: 'stay' });
  c.window.Trip.render();
  const h = c.__els['#tripRoot'].innerHTML;
  assert.match(h, /<div class="trip-head card th-mini"/);
  assert.match(h, /id="thSub"><span class="th-cc">Portugalsko · <\/span>\d+\.\d+\.–\d+\.\d+\. · <span class="th-nn">5 nocí · <\/span>2 os\./);
  // ↺ Začít znovu zůstává v hlavičce (v pruhu jen ikona – CSS)
  assert.match(h, /id="tripRestart"/);
  c.S.trip.step = 'summary'; c.window.Trip.render();
  assert.match(c.__els['#tripRoot'].innerHTML, /<div class="trip-head card" /);
  const css = read('public/css/trip.css');
  // jen telefon a tablet; „Cenu doplníš“ (jen .faint) se v pruhu schová, rámeček ceny bez pozadí
  assert.match(css, /@media\(max-width:1023px\)\{\s*#tripRoot \.trip-head\.th-mini\{flex-direction:row;/);
  assert.match(css, /#tripRoot \.th-mini \.th-total \.faint\{display:none\}/);
  assert.match(css, /#tripRoot \.th-mini :is\(\.th-cc,\.th-nn,\.th-route\)\{display:none\}/);
});

test('U16: „Uloženo ✓“ od kroku za výběrem letu (cesta se ukládá sama), ne u sdílené ani u jen prohlédnutého letu', () => {
  const c = loadTrip(), { savedTxt } = c.window.Trip;
  assert.equal(savedTxt(lisbon({ step: 'flight' })), '', 'jen prohlédnutý let se neukládá');
  assert.equal(savedTxt(lisbon({ step: 'stay' })), 'Uloženo');
  assert.equal(savedTxt(lisbon({ step: 'stay', shared: { on: '2026-10-01' } })), '', 'cizí cesta až po „Uložit si ji“');
  // už v Mých cestách (i na kroku Let, kam se člověk vrátil)
  c.S.trips = [{ tripId: 1767225600000, auto: true }];
  assert.equal(savedTxt(lisbon({ step: 'flight' })), 'Uloženo');
  c.S.trip = lisbon({ step: 'car' }); c.window.Trip.render();
  assert.match(c.__els['#tripRoot'].innerHTML, /‹ Moje cesty<\/button><span class="mt-saved"[^>]*>Uloženo <span class="ico i-hotovo" aria-hidden="true"><\/span><\/span>/);
});

test('U16: Shrnutí „Hotovo – zpět na Moje cesty“, sdílená „💾 Uložit do Mých cest“', () => {
  const { sumSaveLbl } = loadTrip().window.Trip;
  assert.equal(sumSaveLbl(lisbon()), 'Hotovo – zpět na Moje cesty');
  assert.equal(sumSaveLbl(lisbon({ shared: { on: '2026-10-01' } })), '💾 Uložit do Mých cest');
});

test('U17: jedno „Do kalendáře ▾“ (Google i .ics), Sdílet hlavní, „Začít novou cestu“ odkazem pod vším', () => {
  const c = loadTrip();
  c.S.trip = lisbon(); c.window.Trip.render();
  const h = c.__els['#tripStep'].innerHTML;
  assert.equal((h.match(/Do kalendáře/g) || []).length, 1);
  assert.match(h, /<details class="sum-cal"><summary class="btn" id="sumCal">[\s\S]*?id="sumGcal" href="https:\/\/calendar\.google\.com[\s\S]*?id="sumIcs">Soubor \.ics/);
  assert.match(h, /class="row wrap sum-acts"[^>]*>\s*<button class="btn primary" id="sumShare">/);
  assert.equal((h.match(/class="btn primary"/g) || []).length, 1, 'jediná hlavní akce');
  assert.match(h, /<p class="sum-new"><button type="button" class="linkbtn" id="sumNew">Začít novou cestu<\/button><\/p>\s*$/);
  // volba v nabídce ji zavře
  const det = { open: true }; c.__els['#sumCal'] = { parentNode: det };
  c.__els['#sumGcal'].onclick();
  assert.equal(det.open, false);
});

test('U31: den bez aktivit v okně cesty jedním řádkem „zatím nic“ a „+ přidat“, pole až po klepnutí', () => {
  const app = read('public/js/app.js');
  const src = app.match(/^ {2}const dayHtml = \(d, di\) => \{.*\};$/m)[0];
  const ctx = { t: { days: { '2027-03-13': ['Belém'] } }, live: null, i: 0, rides: [], rideEd: () => '', esc: (s) => s, ico: () => '', fmtDate: (d) => d };
  vm.createContext(ctx);
  const dayHtml = vm.runInContext(`${src}; dayHtml`, ctx);
  const empty = dayHtml('2027-03-15', 2);
  assert.match(empty, /class="day-block bare"/);
  assert.match(empty, /Den 3 <span[^>]*>· 2027-03-15 · zatím nic<\/span><button type="button" class="linkbtn day-add" data-addopen/);
  assert.match(empty, /<div class="row day-new" style="[^"]*" hidden><input class="input" id="act-0-2027-03-15" data-addact/);
  const full = dayHtml('2027-03-13', 0);
  assert.doesNotMatch(full, /bare|zatím nic|data-addopen| hidden>/);
  assert.match(full, /Belém/);
  // den jen se spojem (vlak) není prázdný
  ctx.rides = [{ date: '2027-03-15' }];
  assert.doesNotMatch(dayHtml('2027-03-15', 2), /zatím nic/);
  // „+ přidat“ odkryje pole a dá do něj kurzor; skryté pole opravdu schované (.row je flex)
  assert.match(app, /const ao = \$\('\[data-addopen\]', b\); if \(ao\) ao\.onclick = \(\) => \{ const r = \$\('\.day-new', b\); r\.hidden = false; ao\.remove\(\); \$\('input', r\)\.focus\(\); \};/);
  assert.match(read('public/css/trip.css'), /\.day-block \.day-new\[hidden\]\{display:none\}/);
});
