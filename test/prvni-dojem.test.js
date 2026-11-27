// První dojem (předstartovní kontrola): „Začít hledat“ v uvítání nováčka bez Odkud nedovede do chyby, v textech
// pro uživatele není interní „radar“ (sekce se jmenuje Kam letět levně), záloha do souboru se neplete s přenosem
// do jiného zařízení, jiskry ✨ (typický symbol AI) u chytrého hledání nejsou a nad kartami se tyká.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const APP = read('app.js');
/** Kód bez komentářů po celých řádcích (// … a vnitřek /* … *\/) – názvy v komentářích smí zůstat. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/ .*$/, '')).join('\n');

test('Začít hledat: bez domova a bez Odkud kurzor do „Odkud letíš?“, jinak do Kam', () => {
  const src = APP.match(/^const wcGoTo = .*$/m);
  assert.ok(src, 'app.js: wcGoTo');
  const wcGoTo = new Function(`${src[0]}; return wcGoTo;`)();
  assert.equal(wcGoTo(true, 0), 'from', 'nováček bez domova – hledání by skončilo „Zadej, odkud letíš“');
  assert.equal(wcGoTo(true, 1), 'to', 'Odkud už vyplněné na Přehledu');
  assert.equal(wcGoTo(false, 0), 'to', 'domov nastavený (řádek Odkud letíš? zmizel)');
  // obsluha tlačítka se podle ní řídí a uvítání v tom případě neschová
  const go = APP.match(/\$\('#wcGo'\)\.onclick = \(\) => \{[\s\S]*?\n {2}\};/)[0];
  assert.match(go, /wcGoTo\(Boolean\(\$\('#heroHomeAsk:not\(\[hidden\]\)'\)\), \$\$\('#heroFrom \.pi-chip'\)\.length\) === 'from'/);
  assert.ok(go.indexOf("$('#heroFrom input')") < go.indexOf('hide()'), 'fokus do Odkud dřív, než se uvítání schová');
  assert.match(APP, /<b>Napiš, odkud a kam<\/b>/);
});

test('texty pro uživatele bez „radaru“ – sekce se jmenuje Kam letět levně', () => {
  for (const f of ['app.js', 'flights.js', 'trip.js', 'backup.js']) {
    // jen viditelné texty: identifikátory (renderRadar, radarMode, #radarFrom, 'radar' v počítadlech, { radar: x },
    // const radar =) nevadí
    const src = code(read(f)).replace(/(const |[{,(]\s*)radar\b(?=\s*[:,=)])/g, '');
    const hits = src.match(/[^\w#.-]radar(u|em|ti)?\b(?![\w-])(?!['"])/gi) || [];
    assert.deepEqual(hits, [], f);
  }
  assert.match(APP, /\['dashboard', 'Přehled', 'Levné lety a tvoje cesty'/);
});

test('Záloha do souboru (Další, nadpis okna, odkazy) se nejmenuje skoro stejně jako Přenést do jiného zařízení', () => {
  const bk = read('backup.js');
  assert.match(APP, /id="moreBk">\$\{ikona\('stahnout'\)\} Záloha do souboru <span class="faint">stáhnout, obnovit<\/span>/);
  assert.match(bk, /<h3 style="margin-bottom:8px">💾 Záloha do souboru<\/h3>/);
  for (const [f, s] of [['app.js', APP], ['backup.js', bk], ['about.js', read('about.js')]]) assert.doesNotMatch(code(s), /Přenos a záloha/, f);
});

test('chytré hledání a tipy bez jisker ✨ (typický symbol AI)', () => {
  const fl = read('flights.js'), pl = read('places.js');
  assert.match(fl, /<span class="st-lab">Zkus napsat:<\/span>/);
  assert.match(fl, /<div class="pi-head">Tipy – nebo napiš celou větu/);
  assert.match(fl, /pi-smart'\)\}><span class="pi-flag">\$\{ikona\('let'\)\}<\/span>/);
  assert.match(pl, /data-smart="1"><span class="pi-flag">\$\{ikona\('kompas'\)\}<\/span>/);
  // ✨ zůstává jen v historii Co je nového a u kategorie Zajímavá místa (ne „chytré“ hledání)
  for (const f of ['flights.js', 'places.js', 'trip.js', 'pwa.js', 'app.js']) {
    const s = code(read(f)).replace(/const WHATS_NEW = \[[\s\S]*?\n\];/, '').replace(/'✨ Zajímavá místa'|'sight', '✨'/g, '');
    assert.doesNotMatch(s, /✨/, f);
  }
});

test('nad kartami Kam letět levně tykání a číslovky ve správném tvaru (2 osoby, 5 osob)', () => {
  const fl = read('flights.js');
  const plural = new Function(`${fl.match(/^ {2}const plural = .*$/m)[0]}; return plural;`)();
  assert.equal(plural(2, 'osobu', 'osoby', 'osob'), '2 osoby');
  assert.equal(plural(5, 'osobu', 'osoby', 'osob'), '5 osob');
  assert.match(fl, /Cena za osobu\$\{q\.payload\?\.adults > 1 \? ` při \$\{q\.payload\.adults\} cestujících` : ''\}, zpáteční letenka/);
  for (const f of ['app.js', 'flights.js', 'trip.js', 'places.js']) assert.doesNotMatch(read(f), /cestujete/, f);
});
