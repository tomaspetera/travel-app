// Navazující drobnosti po kontrole přenosu a zálohy: vlastní let bez Odkud přežije zálohu i přenos (PlanShare.leg),
// cena cesty z průvodce (totalCzk) se přenáší, odkaz vložený do otevřené stránky průvodce nevrátí o krok (app.js
// histPop – ani Zpět, které pak zavře náhled odkazu) a filtr zdrojů ve výsledcích letů se jmenuje Prodejce. Klasické skripty přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('public/js/planshare.js'), ctx, { filename: 'planshare.js' });
vm.runInContext(read('public/js/backup.js'), ctx, { filename: 'backup.js' });
const P = ctx.PlanShare, B = ctx.Backup;
const deps = { sanitizePlan: P.sanitize, sanitizeWizard: null, txt: P.txt, pins: null, today: '2026-11-01' };

// cesta z „Letenku už mám“ bez Odkud, jak ji uloží trip.js saveToPlanner (legBrief): tam '' → LIS, zpět LIS → ''
const leg = (from, to, date) => ({ from, to, date, dep: null, arr: null, arrEst: false, fromTz: null, toTz: null, carrier: 'vlastní let', flightNo: '', durationMin: null });
const ownTrip = () => ({ name: 'Lisabon 21. 1.', dest: 'Lisabon', iso: 'PT', start: '2027-01-21', end: '2027-01-27', pax: '2', budget: '42000', flight: 'do LIS 21. 1., zpět z LIS 27. 1.',
  totalCzk: 8814, legs: [leg('', 'LIS', '2027-01-21'), leg('LIS', '', '2027-01-27')], days: {}, checklist: [], notes: '', tripId: 1760000000000 });

test('vlastní let bez Odkud: úseky s prázdným letištěm domova přežijí sanitize, zálohu i přenos', () => {
  const legs = plain(P.sanitize(ownTrip()).legs);
  assert.deepEqual(legs.map((l) => [l.from, l.to, l.date]), [['', 'LIS', '2027-01-21'], ['LIS', '', '2027-01-27']]);
  // obě letiště prázdná nebo neplatný kód = poškozený úsek
  assert.equal(P.sanitize({ ...ownTrip(), legs: [leg('', '', '2027-01-21'), leg('xx', 'LIS', '2027-01-21')] }).legs, undefined);
  for (const pack of [B.pack, B.packSlim]) {
    const t = B.parse(pack({ trips: [ownTrip()] }), deps).trips[0];
    assert.deepEqual(plain(t.legs).map((l) => [l.from, l.to]), [['', 'LIS'], ['LIS', '']]);
  }
});

test('cena cesty z průvodce (totalCzk) projde zálohou i přenosem, nesmysl ne', () => {
  assert.equal(B.parse(B.pack({ trips: [ownTrip()] }), deps).trips[0].totalCzk, 8814);
  assert.equal(B.parse(B.packSlim({ trips: [{ ...ownTrip(), totalCzk: 0 }] }), deps).trips[0].totalCzk, 0, 'nula = cena zatím neznámá, karta ji tak čte');
  for (const bad of [-5, 1e9, '8814', NaN, null]) assert.equal('totalCzk' in B.parse(B.pack({ trips: [{ ...ownTrip(), totalCzk: bad }] }), deps).trips[0], false, String(bad));
  assert.equal(B.parse(B.pack({ trips: [{ ...ownTrip(), totalCzk: 8814.6 }] }), deps).trips[0].totalCzk, 8815);
  // stejná cesta s cenou i bez ní je pořád tatáž (přenos zpět nehlásí změněnou)
  const cur = { trips: [ownTrip()] }, inc = B.parse(B.pack(cur), deps);
  assert.equal(B.match(cur, inc, deps)[0].st, 'same');
});

/* ---------- Zpět telefonu (app.js histPop) ---------- */
const APP = read('public/js/app.js');
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = (?:.*\\{\\n[\\s\\S]*?^\\};|.*)|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
function hist() {
  const H = { list: [{ url: '#dashboard', state: null }, { url: '#trip', state: { atlasV: 1 } }], i: 1, pending: [] };
  // els['#tripStep'] = průvodce je vidět (trip.js ho vykreslí jen v průvodci, ne v seznamu Moje cesty)
  const els = { '#tripStep': {}, '#modalBg': { classList: { contains: () => false } } };
  const c = {
    setTimeout: () => 0, clearTimeout: () => {}, Math, Number, modalShow() {}, els, $: (s) => els[s] || null,
    location: { get hash() { return H.list[H.i].url; } },
    history: {
      get state() { return H.list[H.i].state; },
      pushState(st, t, url) { H.list = H.list.slice(0, H.i + 1); H.list.push({ url: url ?? H.list[H.i].url, state: st }); H.i++; },
      replaceState(st, t, url) { H.list[H.i] = { url: url ?? H.list[H.i].url, state: st }; },
      go(n) { H.pending.push(n); },
    },
    Trip: { step: 'flight', stepTo(s) { if (s === c.Trip.step) return false; c.Trip.step = s; return true; } },
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(`var activeView = 'trip';\n${pick('hist', 'histFlush', 'histBack', 'histDo', 'histDepth', 'trailNext', 'histTrip', 'tripEntry', 'histPop')}`, c);
  return { c, H };
}

test('odkaz (#sync=) vložený do otevřené stránky v průvodci průvodce nevrátí o krok – zpětný přenos cestu nezmění', () => {
  const { c, H } = hist();
  c.histTrip('flight', 'summary'); c.Trip.step = 'summary'; // ⚡ prošel průvodce až ke Shrnutí
  // prohlížeč: nový krok s odkazem (bez stavu aplikace), pak popstate
  c.history.pushState(null, '', '#sync=z7VxNj9xGev4');
  c.histPop();
  assert.equal(c.Trip.step, 'summary', 'Shrnutí zůstane – jinak by se uložená kopie průvodce přepsala krokem Let');
  assert.deepEqual(H.pending, [], 'žádný návrat v historii');
  // Zpět z odkazu vrátí na krok průvodce (Shrnutí zůstane), další Zpět dál vrací krok, kterým uživatel prošel
  H.i--; c.histPop();
  assert.equal(c.Trip.step, 'summary');
  H.i--; c.histPop();
  assert.equal(c.Trip.step, 'flight');
});

test('Zpět, které zavře náhled přenosu z odkazu, nevrátí skrytý průvodce o krok – uložená cesta se nezmění', () => {
  const { c, H } = hist();
  c.histTrip('flight', 'summary'); c.Trip.step = 'summary';
  c.history.pushState(null, '', '#sync=z7VxNj9xGev4');
  c.histPop();
  // Transfer.fromHash: adresa → #dashboard, Přehled (go bez kroku historie) a nad ním okno náhledu
  c.history.replaceState(null, '', '#dashboard');
  vm.runInContext("activeView = 'dashboard'; hist.modal = true;", c);
  c.history.pushState({ atlasM: 1 }, '', '#dashboard');
  const n = H.list.length;
  H.i--; c.histPop();
  assert.equal(c.Trip.step, 'summary', 'průvodce na Přehledu není vidět – krok ani uložení');
  assert.equal(H.list.length, n, 'žádný nový krok průvodce v historii');
  assert.deepEqual(H.pending, []);
});

test('odkaz na plán (#plan=) otevřený v Cestě: Zpět, které zavře náhled, ani Zpět v seznamu Moje cesty průvodce nevrátí o krok', () => {
  const { c, H } = hist();
  c.histTrip('flight', 'summary'); c.Trip.step = 'summary';
  c.history.pushState(null, '', '#plan=z7VxNj9xGev4');
  c.histPop();
  // importPlanFromHash: adresa → #planner, okno náhledu plánu; go('planner') = seznam Moje cesty v Cestě (bez kroku historie)
  c.history.replaceState(null, '', '#planner');
  vm.runInContext('hist.modal = true;', c);
  c.history.pushState({ atlasM: 1 }, '', '#planner');
  delete c.els['#tripStep'];
  const n = H.list.length;
  H.i--; c.histPop();
  assert.equal(c.Trip.step, 'summary', 'Zpět jen zavřelo náhled – krok cesty (a s ním uložená cesta) zůstane');
  assert.equal(H.list.length, n, 'žádný nový krok průvodce v historii');
  assert.deepEqual(H.pending, []);
  // Zpět dál přes odkaz a krok průvodce: seznam Moje cesty pořád nahoře – průvodce není vidět, krok se nemění
  H.i--; c.histPop();
  H.i--; c.histPop();
  assert.equal(c.Trip.step, 'summary', 'seznam Moje cesty: skrytý průvodce se neposune');
  assert.deepEqual(H.pending, []);
});

test('obyčejné Zpět v průvodci dál couvá po krocích, kterými uživatel prošel', () => {
  const { c, H } = hist();
  c.histTrip('flight', 'route'); c.Trip.step = 'route';
  c.histTrip('route', 'stay'); c.Trip.step = 'stay';
  assert.equal(H.list.length, 3, 'Přehled, Cesta a jeden krok průvodce');
  H.i--; c.histPop();
  assert.equal(c.Trip.step, 'route');
  assert.equal(H.list.length, 3, 'krok průvodce zase v historii – další Zpět couvá dál');
  H.i--; c.histPop();
  assert.equal(c.Trip.step, 'flight');
  assert.deepEqual(H.pending, []);
});

test('filtr zdrojů ve výsledcích letů: „Prodejce“ se jménem prodejce, ne „Aerolinky: Letenky (Aviasales)“', () => {
  const FL = read('public/js/flights.js');
  assert.ok(!FL.includes('Aerolinky:</span>'));
  const row = FL.split('\n').find((l) => l.includes('<span class="faint">Prodejce:</span>'));
  assert.ok(row && row.includes('esc(shopName(p))'), 'tlačítko filtru: Aviasales, Kiwi.com');
  assert.ok(FL.includes('Object.fromEntries(Object.keys(PROV).map(k => [k, shopName(k)]))'), 'čip filtru „bez Aviasales“ stejně');
});
