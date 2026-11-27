// Regresní kontrola Letů po #489–#499: pravdivý štítek nejvýhodnějších nabídek („pod běžnou cenou“ – štítek mají až tři
// nabídky, ne jen ta nejlevnější), nadpis Hlídaných cen a sbalené hledání pod lepicí lištou, text sbaleného hledání
// na úzkém telefonu zalomený místo useknutého.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const fl = read('js/flights.js'), atlas = read('css/atlas.css');
const ctx = { window: {} };
vm.runInNewContext(read('js/searchhelp.js'), ctx);
const SearchHelp = ctx.window.SearchHelp;
const ikona = (n) => `<span class="ico i-${n}" aria-hidden="true"></span>`;
const line = (re) => { const m = fl.match(re); assert.ok(m, String(re)); return m[0]; };

test('lety-1: orientační cena nejvýhodnějších nabídek „pod běžnou cenou“, ne „nejlevnější“ (štítek mají až 3 nabídky)', () => {
  assert.ok(!fl.includes('nejlevnější v hledání') && !fl.includes('nejlevnější v tomto hledání'));
  const radarHot = new Function('ikona', `const radarOrient = x => Boolean(x && (x.oc || x.prov === 'travelpayouts'));\n${line(/ {2}const radarHot = x => \(radarOrient\(x\)\n[^\n]+\n[^\n]+\n/)} return radarHot;`)(ikona);
  assert.equal(radarHot({ oc: 1 })[0], 'pod běžnou cenou');
  assert.equal(radarHot({ prov: 'ryanair' })[0], `${ikona('super-cena')} super cena`, 'živá cena beze změny');
  const superTxt = new Function('SearchHelp', 'ikona', `${line(/ {2}const superTxt = [^\n]+\n/)} return superTxt;`)(SearchHelp, ikona);
  const leg = (live) => ({ from: 'PRG', to: 'BCN', date: '2026-12-01', live, provider: live ? 'ryanair' : 'travelpayouts' });
  assert.equal(superTxt({ out: leg(false), back: null }), 'pod běžnou cenou');
  assert.equal(superTxt({ out: leg(true), back: null }), `${ikona('super-cena')} Super cena`);
  // výběr nabídek se štítkem zůstává: tři nejlevnější s dobrou cenou
  assert.match(fl, /const GOOD_TOP = 3;/);
});

test('lety-3: nadpis Hlídané ceny po Hlídáš / Od minula pod lepicí lištou telefonu', () => {
  assert.match(atlas, /@media\(max-width:1023px\)\{#watchHead\{scroll-margin-top:90px\}#searchSum\{scroll-margin-top:80px\}\}/);
});

test('lety-6: po Najít lety posun na celé sbalené hledání (Hlídat, Upravit), bez něj na průběh', () => {
  assert.ok(fl.includes("if (!opts.noScroll) ($('#searchSum:not([hidden])') || $('#progress')).scrollIntoView({ behavior: 'smooth', block: 'start' });"));
  assert.ok(!fl.includes("if (!opts.noScroll) $('#progress').scrollIntoView("));
  // sbalení formuláře (collapseForm) běží před posunem, jinak by #searchSum byl ještě skrytý
  assert.ok(fl.indexOf('    collapseForm(f);') < fl.indexOf("($('#searchSum:not([hidden])') || $('#progress')).scrollIntoView"));
});

test('lety-2: sbalené hledání na telefonu text zalomí (flights.css ho jinak usekne „…“), počítač beze změny', () => {
  assert.match(read('css/flights.css'), /\.search-sum \.ss-txt b,\.search-sum \.ss-txt span\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
  // #id přebije třídy z flights.css, které se načítají až po atlas.css
  assert.match(atlas, /@media\(max-width:700px\)\{#searchSum \.ss-txt>\*\{white-space:normal;overflow-wrap:anywhere\}\}/);
});
