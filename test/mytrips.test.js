// 🧳 Moje cesty v záložce Cesta (místo zvláštního Plánovače, který nováček nerozlišil od Cesty): seznam uložených cest
// a rozpracované cesty z průvodce; app.js myTrips + trip.js render / renderMine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

test('záložka Cesta: bez rozpracované cesty seznam Moje cesty (jsou-li cesty), jinak úvod; z průvodce „‹ Moje cesty“', () => {
  const js = read('js/trip.js');
  assert.match(js, /const mine = window\.myTrips && \(\(!t && Array\.isArray\(S\.trips\) && S\.trips\.some\(Boolean\)\) \|\| \(t && mineFor === t\.created\)\);\s*if \(mine\) return renderMine\(root, t\);/);
  assert.match(js, /<div class="mt-back"><button type="button" class="linkbtn" id="tripMine">‹ Moje cesty<\/button><\/div>/);
  // rozpracovaná zůstane: seznam je jen nad ní (mineFor), karta rozpracované vrátí zpět
  assert.match(js, /mb\.onclick = \(\) => showMine\(t\);/);
  assert.match(js, /function showMine\(t\) \{\s*if \(autoT \|\| !entryOf\(t\)\) autoSave\(\);\s*if \(!window\.myTrips\) return;\s*mineFor = t\.created; render\(\);/);
  assert.match(js, /resume: \(\) => \{ mineFor = null; render\(\);/);
  // „Kam chceš jet?“ jednou (úvod i Moje cesty)
  assert.equal((js.match(/<form class="card trip-ask" id="tripAsk">/g) || []).length, 1);
  assert.match(js, /ask: askHtml\('Nová cesta – kam chceš jet\?'\)/);
});

test('myTrips: cesta z průvodce se otevře v průvodci (rozpracovaná zpět do ní), ostatní detail; proběhlé sbalené', () => {
  const app = read('js/app.js');
  const fn = app.slice(app.indexOf('function myTrips('), app.indexOf('function newTrip('));
  assert.match(fn, /if \(t\.wizard && a && t\.tripId === a\.created && o\.resume\) return o\.resume\(\);/);
  assert.match(fn, /if \(t\.wizard && window\.Trip && Trip\.openSaved\) return Trip\.openSaved\(t\.wizard, t\.tripId\);/);
  assert.match(fn, /openTrip\(i\);/);
  assert.match(fn, /data-mdet="\$\{x\.i\}">Program, balení a poznámky ›<\/button>/, 'detail z průvodce dál dostupný');
  assert.match(fn, /<details class="mt-past"><summary>Proběhlé cesty \(\$\{past\.length\}\)<\/summary>/);
  assert.match(fn, /📝 Vlastní cesta bez letu/);
  assert.match(fn, /bkWire\(host\);/);
  // karta Plánovače beze změny (data-ti), Moje cesty vlastní atribut – každý seznam své klepnutí
  assert.match(app, /function tripCard\(t, i, attr = 'data-ti', extra = ''\) \{/);
  assert.match(app, /const bkWire = \(host = document\) => \{ const b = \$\('#bkOpen', host\);/);
});

test('Co je nového: Moje cesty, cesta se ukládá sama, Plánovač je v Mých cestách', () => {
  const app = read('js/app.js');
  assert.match(app, /const WN_ID = '2026-10-27e';\s*const WHATS_NEW = \[\s*\['🧳', 'Plánovač je teď v Mých cestách',[^\n]*\],\s*\['💾', 'Cesta se ukládá sama',[^\n]*\],\s*\['🧳', 'Moje cesty v záložce Cesta',/);
});

test('smazání cesty otevřené v průvodci ji zavře i v průvodci (jinak by se zase sama uložila); ↩ Vrátit vrátí obojí', () => {
  const app = read('js/app.js');
  assert.match(app, /const act = S\.trip && t\.tripId && S\.trip\.created === t\.tripId \? S\.trip : null;/);
  assert.match(app, /S\.trips\.splice\(i, 1\); if \(act\) S\.trip = null; modalClose\(\); redraw\(\);/);
  assert.match(app, /if \(act && !S\.trip\) S\.trip = act; redraw\(\);/);
});

test('změna cest (nová, úprava v okně, smazání, záloha, jiný panel) překreslí seznam, který je vidět – i Moje cesty v Cestě', () => {
  const app = read('js/app.js');
  assert.match(app, /function tripsChanged\(\) \{\s*if \(activeView === 'trip' && window\.Trip && Trip\.render\) Trip\.render\(\);\s*else if \(activeView === 'dashboard'\) renderDashStats\(\);\s*\}/);
  assert.ok(!app.includes('renderPlanner'), 'Plánovač jako zvláštní seznam už není');
  assert.match(app, /const reTrip = i => \{ save\(\); openTrip\(i\); tripsChanged\(\); \};/);
  assert.match(app, /const redraw = \(\) => \{ save\(\); tripsChanged\(\); \};/);
  assert.match(app, /if \(ch\.has\('trips'\) && activeView !== 'dashboard'\) tripsChanged\(\);/);
  // nová vlastní cesta z Moje cest: zůstat v Cestě
  assert.match(app, /modalClose\(\); if \(activeView === 'trip'\) tripsChanged\(\); else go\('planner'\);/);
  assert.match(read('js/backup.js'), /if \(typeof tripsChanged === 'function'\) tripsChanged\(\);/);
});

test('Moje cesty místo Plánovače: Trip.mine ukáže seznam i nad rozpracovanou; úvod bez cest nabídne vlastní cestu bez letu', () => {
  const js = read('js/trip.js');
  assert.match(js, /function mine\(\) \{\s*const t = T\(\);\s*if \(t\) \{ if \(autoT \|\| !entryOf\(t\)\) autoSave\(\); mineFor = t\.created; \}\s*safeRender\(\);\s*\}/);
  assert.match(js, /render: safeRender, mine,/);
  assert.match(js, /\$\{window\.newTrip \? '<button type="button" class="btn ghost" id="tripOwn">📝 Vlastní cesta bez letu<\/button>' : ''\}/);
  const app = read('js/app.js');
  assert.match(app, /if \(v === 'trip'\) lazyView\('trip', '#tripRoot', \(\) => \(opts\.mine \? Trip\.mine\(\) : Trip\.render\(\)\)\);/);
  assert.match(app, /const NAV_PICK = \['flights', 'trip', 'explore', 'world', 'recommend'\];/);
  assert.match(app, /data-gop>Moje cesty →<\/button>/);
});
