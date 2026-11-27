// ⭐ Plus – průvodce zemí do Sešitu (falešné dveře): řádek v tabulce Zdarma × Plus, odkaz v okně země (app.js
// openCountry) a počítadla zobrazení a klepnutí – v seznamu EVENTS serveru i ve statistikách falešných dveří.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EVENTS } from '../server/lib/counts.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** plus.js v node:vm s náhradou okna a počítadla – log = odeslané události, modals = otevřená okna. */
function load() {
  const log = [], modals = [];
  const ctx = {
    window: { Count: { hit: (e) => log.push(e) } },
    modalOpen: (html) => modals.push(html),
    // #themeToggle chybí → postranní odkaz se nepřidává; ostatní prvky okna jsou prázdné objekty pro .onclick
    document: { querySelector: (s) => (s === '#themeToggle' ? null : {}) },
  };
  vm.runInNewContext(read('public/js/plus.js'), ctx);
  return { P: ctx.window.Plus, log, modals };
}

test('tabulka Zdarma × Plus: Sešit cesty s průvodcem zemí (PDF bez signálu) – Zdarma –, Plus ✓; informace o zemích zdarma', () => {
  const { P } = load();
  const html = P.pageHtml();
  // průvodce zemí je od testu zájmu (test/plus-test-zajmu.test.js) součástí řádku Sešitu, ne samostatný řádek
  const row = html.match(/<tr><th scope="row">Sešit cesty s průvodcem zemí \(PDF bez signálu\)<\/th>(.*?)<\/tr>/);
  assert.ok(row, 'řádek v tabulce');
  assert.equal(row[1], '<td><span aria-hidden="true">–</span><span class="sr-only">ne</span></td><td><span aria-hidden="true">✓</span><span class="sr-only">ano</span></td>');
  assert.match(html, /<th scope="row">Informace o zemích a Objevuj<\/th><td><span aria-hidden="true">✓/, 'informace o zemi zůstávají zdarma');
  assert.doesNotMatch(html, /Kč/, 'cena Plus až po otázce (priceNote)');
});

test('odkaz z okna země: zobrazení jednou za zemi, klepnutí započítá zájem a otevře stránku Plus bez ceny', () => {
  const { P, log, modals } = load();
  P.countryShown('PT'); P.countryShown('PT'); P.countryShown('IS');
  assert.deepEqual([...log], ['sesit_country_shown', 'sesit_country_shown'], 'táž země podruhé ne');
  log.length = 0;
  P.fromCountry();
  assert.deepEqual([...log], ['sesit_country_click', 'plus_page', 'plus_offer_shown']);
  assert.equal(modals.length, 1);
  assert.match(modals[0], /Sešit cesty s průvodcem zemí/);
  assert.doesNotMatch(modals[0], /Kč/);
});

test('počítadla: server je přijme, statistiky je ukážou jako falešné dveře, odkaz v okně země s ikonou Letsi', () => {
  for (const e of ['sesit_country_shown', 'sesit_country_click']) assert.ok(EVENTS.includes(e), e);
  assert.match(read('public/js/statistiky.js'), /\{ shown: 'sesit_country_shown', label: '[^']+', clicks: \[\['sesit_country_click', 'klepnutí'\]\] \}/);
  const app = read('public/js/app.js');
  // nenápadný odkaz s ikonou Letsi (ne emoji) jen s načteným plus.js
  assert.match(app, /\$\{window\.Plus \? `<p class="cm-sesit"><button type="button" class="linkbtn" id="cmSesit">\$\{ikona\('stahnout'\)\} Uložit do Sešitu · Plus<\/button><\/p>` : ''\}/);
  assert.match(app, /if \(cs\) \{ Plus\.countryShown\(iso, cs\); cs\.onclick = \(\) => Plus\.fromCountry\(iso\); \}/);
});

test('zobrazení odkazu v okně země se počítá, až když je odkaz na obrazovce (na telefonu je daleko pod okrajem)', () => {
  const log = [], ios = [];
  class IntersectionObserver {
    constructor(cb) { this.cb = cb; this.off = false; ios.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.off = true; }
  }
  const ctx = { window: { Count: { hit: (e) => log.push(e) } }, IntersectionObserver, document: { querySelector: () => null } };
  vm.runInNewContext(read('public/js/plus.js'), ctx);
  const P = ctx.window.Plus;
  P.countryShown('PT', { id: 'a' });
  P.countryShown('PT', { id: 'b' }); // okno země zavřené bez posunu a otevřené znovu
  ios[0].cb([{ isIntersecting: false }]);
  assert.deepEqual(log, [], 'odkaz pod okrajem – nepočítá se');
  ios[1].cb([{ isIntersecting: true }]);
  ios[0].cb([{ isIntersecting: true }]);
  assert.deepEqual(log, ['sesit_country_shown'], 'po dojetí k odkazu jednou, i když se okno otevřelo dvakrát');
  assert.ok(ios[1].off, 'pozorovatel se po zobrazení odpojí');
});
