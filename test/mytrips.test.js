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
  // cesta naposledy otevřená v průvodci, která proběhla: mezi Proběhlé, nahoře žádná karta „v průvodci“
  assert.match(fn, /curPast = Boolean\(cur0 && end\(cur0\) && end\(cur0\) < now\);\s*const cur = curPast \? null : cur0;/);
  assert.match(fn, /: a && !curPast \? `<div class="card trip" data-mcur="1">/);
  assert.match(fn, /📝 Vlastní cesta bez letu/);
  // „Z posledního hledání“ ne, když z toho hledání už je cesta v průvodci (i s jinou nabídkou / termínem)
  assert.match(fn, /if \(pick && S\.trips\.some\(t => t\.dest === pick\.dest && \(t\.start === pick\.start \|\| \(t\.wizard && \(t\.end \|\| t\.start \|\| ''\) >= todayLocal\(\)\)\)\)\) pick = null;/);
  assert.match(fn, /bkWire\(host\);/);
  // karta Plánovače beze změny (data-ti), Moje cesty vlastní atribut – každý seznam své klepnutí
  assert.match(app, /function tripCard\(t, i, attr = 'data-ti', extra = ''\) \{/);
  assert.match(app, /const bkWire = \(host = document\) => \{ const b = \$\('#bkOpen', host\);/);
});

test('Co je nového: Moje cesty, cesta se ukládá sama, Plánovač je v Mých cestách', () => {
  const app = read('js/app.js');
  assert.match(app, /const WHATS_NEW = \[[\s\S]*?\['🧳', 'Plánovač je teď v Mých cestách',[^\n]*\],\s*\['💾', 'Cesta se ukládá sama',[^\n]*\],\s*\['🧳', 'Moje cesty v záložce Cesty',/);
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

test('karta cesty otevřené v průvodci: ve Shrnutí „Sestavená“, jinak „Rozpracovaná“ s krokem', () => {
  const app = read('js/app.js');
  assert.match(app, /const curTxt = inf\.done \? '✅ Sestavená v průvodci – otevřít shrnutí ›' : `🧳 Rozpracovaná v průvodci\$\{inf\.step \? ` \(krok \$\{esc\(inf\.step\)\}\)` : ''\} – pokračovat ›`;/);
  assert.match(read('js/trip.js'), /step: \(STEPS\.find\(x => x\[0\] === t\.step\) \|\| STEPS\[0\]\)\[2\], done: t\.step === 'summary' \};/);
  // tlačítka pod seznamem jako v úvodu Cesty
  assert.match(read('css/trip.css'), /\.mt-more \.btn\{flex:1 1 220px;justify-content:center\}/);
});

test('záložka Cesty; menší karty v Mých cestách jen na telefonu a tabletu (počítač beze změny)', () => {
  const app = read('js/app.js');
  assert.match(app, /\['trip', 'Cesty', /);
  assert.match(app, /<div class="faint tb-fl" style="font-size:12px">/);
  const css = read('css/trip.css');
  const m = css.match(/@media\(max-width:1023px\)\{\n  \.trip-mine \.trip-grid\{gap:10px\}[\s\S]*?\n\}/);
  assert.ok(m, 'blok menších karet');
  assert.match(m[0], /\.trip-mine \.trip-top\[data-photo\]\{min-height:0;padding:36px 14px 11px\}/, 'místo nahoře pro štítek „za X dní“');
  assert.match(m[0], /\.trip-mine \.tb-fl\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/, 'let na jeden řádek');
  assert.match(read('css/desktop-explore.css'), /\.trip-top\[data-photo\]\{min-height:168px\}/, 'počítač: velké fotky');
});

test('karta cesty: lidé, aktivity a balení v jednom řádku s rozpočtem (na úzké kartě rozpočet vpravo pod nimi)', () => {
  const app = read('js/app.js');
  assert.match(app, /<div class="bar"><span>👤 \$\{t\.pax \|\| 1\} os\. · \$\{na\} \$\{na === 1 \? 'aktivita'[^`]*sbaleno<\/span>\$\{t\.budget \? `<span>\$\{\(\+t\.budget\)\.toLocaleString\('cs'\)\} Kč<\/span>` : ''\}<\/div>/);
  assert.ok(!app.includes('rozpočet —'), 'bez rozpočtu nic (zadává se v detailu cesty), ne pomlčka');
  assert.ok(!app.includes('class="muted tb-n"'), 'samostatný řádek aktivit pryč');
  const css = read('css/atlas.css');
  assert.match(css, /\.trip-body \.bar\{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 10px;/);
  assert.match(css, /\.trip-body \.bar>span:last-child:not\(:first-child\)\{margin-left:auto\}/, 'jen rozpočet vpravo – sám řádek s lidmi vlevo');
  assert.match(read('css/desktop-explore.css'), /\.mt-more \.btn\{flex:0 1 auto;padding-inline:20px\}/, 'počítač: tlačítko podle popisku');
});
