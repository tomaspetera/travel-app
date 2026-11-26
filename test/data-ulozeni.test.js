// Data uživatele: návod „Letsi na plochu“ na iPhonu (pwa.js iosSteps), otevření sdílené cesty s vlastní rozpracovanou
// (trip.js importFromHash), plné úložiště (app.js save) a poškozený uložený stav (app.js fixState).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const APP = read('public/js/app.js');
const grab = (start, end) => { const a = APP.indexOf(start); assert.ok(a >= 0, start); return APP.slice(a, APP.indexOf(end, a)); };
const plain = (x) => JSON.parse(JSON.stringify(x));

test('iPhone „Letsi na plochu“: neslibuje uložené cesty (aplikace na ploše má vlastní úložiště), s daty nabídne přenos', () => {
  const ctx = { window: {}, URL, console, setTimeout, clearTimeout, AbortController, AbortSignal };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/pwa.js'), ctx, { filename: 'pwa.js' });
  const { iosSteps } = ctx.window.Pwa;
  const empty = iosSteps('[ikona]', false), full = iosSteps('[ikona]', true);
  assert.doesNotMatch(read('public/js/pwa.js'), /uložené cesty a plány uvidíš/);
  assert.match(empty, /Sdílet<\/b> \[ikona\]/);
  assert.match(empty, /cesty, které si v ní uložíš, uvidíš i bez internetu/);
  assert.equal((empty.match(/<li>/g) || []).length, 3, 'prázdné zařízení: není co přenášet');
  assert.doesNotMatch(empty, /pwaXfer/);
  assert.equal((full.match(/<li>/g) || []).length, 4);
  assert.match(full, /nepřenesou samy – má vlastní úložiště/);
  assert.match(full, /Mám odkaz z jiného zařízení/);
  assert.match(full, /id="pwaXfer"/);
  // tlačítko otevře přenos (transfer.js), krok s přenosem jen s modulem přenosu
  assert.match(read('public/js/pwa.js'), /x\.onclick = \(\) => \{ modalClose\(\); Transfer\.open\(\); \}/);
  assert.match(read('public/js/pwa.js'), /const data = Boolean\(window\.Transfer\) && \(!window\.Backup \|\| !Backup\.isEmpty\(Backup\.countsNow\(\)\)\)/);
});

test('poškozený uložený stav: pole, která nejsou seznamem, jsou prázdný seznam, v Mých cestách jen objekty; ostatní data zůstanou', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`${grab('function fixState(s)', '// Ceny letů jsou od pv 2')}\nthis.fixState = fixState;`, ctx);
  const fix = (s) => plain(ctx.fixState(s));
  assert.deepEqual(fix({ trips: null, home: 'PRG' }), { trips: [], visited: [], watch: [], recent: [], fav: [], mute: [], pins: [], viewed: [], home: 'PRG' });
  assert.deepEqual(fix({ trips: {} }).trips, []);
  assert.deepEqual(fix({ trips: [], watch: null }).watch, []);
  assert.deepEqual(fix({ trips: [null, { name: 'Řím' }, 5, 'x', [1]] }).trips, [{ name: 'Řím' }]);
  const ok = { visited: ['PT'], trips: [{ name: 'Lisabon' }], watch: [{ id: 1 }], recent: [], fav: [], mute: [], pins: [], viewed: [] };
  assert.deepEqual(fix(plain(ok)), ok, 'zdravý stav beze změny');
  // load() opraví stav, ještě než se z něj cokoli čte
  assert.match(APP, /return migratePrices\(fixState\(Object\.assign\(defState\(\), d\)\), d\.pv\)/);
});

test('plné nebo zablokované úložiště: save() vrátí false a řekne to jednou za návštěvu (ne při každém uložení), s nabídkou zálohy', () => {
  const toasts = [];
  let opened = 0;
  const ctx = vm.createContext({
    S: { visited: ['PT'] }, LS: 'atlas_v1', JSON,
    localStorage: { setItem() { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); }, removeItem() {} },
    toast: (...a) => toasts.push(a), window: { Backup: { open: () => opened++ } },
  });
  ctx.Backup = ctx.window.Backup;
  vm.runInContext(`${grab('let saveWarned = false;', 'let curIso = null;')}\nthis.save = save;`, ctx);
  assert.equal(ctx.save(), false);
  assert.equal(ctx.save(), false);
  assert.equal(toasts.length, 1, 'jen jednou');
  const [msg, kind, ms, act] = toasts[0];
  assert.match(msg, /^Prohlížeč teď nic neukládá – změny po zavření zmizí/);
  assert.match(msg, /zálohu/);
  assert.deepEqual([kind, ms >= 6000, act.label], ['err', true, 'Záloha']);
  act.run();
  assert.equal(opened, 1);
  // uložení se povede → true, bez hlášky
  ctx.localStorage.setItem = () => {};
  assert.equal(ctx.save(), true);
  assert.equal(toasts.length, 1);
});

/* ---------- otevření sdílené cesty (trip.js importFromHash) ---------- */
const leg = (from, to, date) => ({ from, to, date, dep: `${date}T10:00:00`, arr: `${date}T14:00:00`, hasTime: true });
const tripOf = (label, to, created, over = {}) => ({ v: 1, created, adults: 2, bags: 'none', booked: {}, step: 'summary', ground: {}, flight: { out: leg('PRG', to, '2099-03-12'), back: leg(to, 'PRG', '2099-03-19'), flightCzk: 5000 }, dest: { label, cc: 'IT', lat: 41.9, lon: 12.5 }, stay: { mode: 'manual', name: `Hotel ${label}`, totalCzk: 8000 }, car: null, plan: null, ...over });
const hashOf = (t) => '#trip=' + Buffer.from(JSON.stringify(t)).toString('base64url');

/** Průvodce cestou v node:vm s odkazem v adrese: zachycené hlášky, otázky a přechody. */
function wizard(mine, link) {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, URL, Intl, setTimeout, clearTimeout, CompressionStream, DecompressionStream };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/sharelink.js'), ctx, { filename: 'sharelink.js' });
  const helpers = APP.match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`var ShareLink = window.ShareLink;\n${helpers.join('\n')}\nvar byIso = { IT: { iso2: 'IT', cs: 'Itálie' }, ES: { iso2: 'ES', cs: 'Španělsko' } }; var S = {}; var flag = (iso) => iso; var PACK = ['Pas / OP'];
    var $ = () => ({ innerHTML: '', value: '' }); var $$ = () => []; var save = () => true; var toasts = []; var gone = [];
    var toast = (...a) => toasts.push(a); var go = (...a) => gone.push(a);`, ctx);
  vm.runInContext(read('public/js/trip.js'), ctx, { filename: 'trip.js' });
  ctx.location = { origin: 'https://letsi.example', pathname: '/', hash: hashOf(link) };
  ctx.history = { replaceState: (s, title, h) => { ctx.location.hash = h; } };
  ctx.asked = [];
  ctx.answer = false;
  ctx.confirm = (m) => { ctx.asked.push(m); return ctx.answer; };
  ctx.S.trips = [];
  ctx.S.trip = plain(mine);
  return ctx;
}
const friend = tripOf('Řím', 'FCO', 11, { dest: { label: 'Řím', cc: 'IT', lat: 41.9, lon: 12.5 } });

test('sdílená cesta s vlastní rozpracovanou: vlastní se uloží do Mých cest a zůstane tam – bez strašení otázkou', async () => {
  const c = wizard(tripOf('Madrid', 'MAD', 77, { dest: { label: 'Madrid', cc: 'ES', lat: 40.4, lon: -3.7 } }), friend);
  assert.equal(await c.window.Trip.importFromHash(), true);
  assert.deepEqual(c.asked, [], 'bez otázky');
  assert.equal(c.S.trip.dest.label, 'Řím');
  assert.ok(c.S.trip.shared, 'cesta z odkazu je sdílená');
  assert.deepEqual(c.S.trips.map((x) => [x.tripId, Boolean(x.auto)]), [[77, false]], 'Madrid v Mých cestách (natrvalo, ne jen sám uložený)');
  assert.equal(c.toasts.at(-1)[0], 'Načetl jsem sdílenou cestu – Madrid zůstává v Mých cestách');
});

test('sdílená cesta přes jinou neuloženou sdílenou: srozumitelná otázka, po Zrušit hláška s nabídkou „Uložit svou a otevřít“', async () => {
  const mine = tripOf('Lisabon', 'LIS', 55, { dest: { label: 'Lisabon', cc: 'ES', lat: 38.7, lon: -9.1 }, shared: { on: null } }); // sdílená = sama se neukládá
  const c = wizard(mine, friend);
  assert.equal(await c.window.Trip.importFromHash(), false);
  assert.equal(c.asked.length, 1);
  assert.equal(c.asked[0], 'Otevíráš sdílenou cestu (Řím). Tvoje rozpracovaná cesta (Lisabon) není uložená v Mých cestách – nahradit ji?');
  assert.deepEqual([c.S.trip.dest.label, c.location.hash, c.S.trips.length], ['Lisabon', '#trip', 0], 'nic se nezměnilo');
  const [msg, kind, , act] = c.toasts.at(-1);
  assert.deepEqual([msg, kind, act.label], ['Sdílenou cestu jsem neotevřel – tvoje zůstala, jak byla', 'info', 'Uložit svou a otevřít']);
  // později: uloží Lisabon do Mých cest a otevře Řím (už bez otázky)
  act.run();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(c.asked.length, 1, 'podruhé se neptá');
  assert.equal(c.S.trip.dest.label, 'Řím');
  assert.deepEqual(c.S.trips.map((x) => x.tripId), [55]);
  assert.deepEqual(plain(c.gone.at(-1)), ['trip', { noHash: true }]);
  assert.equal(c.toasts.at(-1)[0], 'Načetl jsem sdílenou cestu – Lisabon zůstává v Mých cestách');
});
