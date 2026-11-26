// Poctivé texty pro čistý režim (předstartovní kontrola): „bez reklam“ vedle odkazů označených reklama, příjem
// z Plus, který ještě neběží, novinka o přejmenování bez slibu přenesených cest, starší novinky bez cen hotelů
// a ověřování volna (XOTELO=off) a tip, který odkazuje na tlačítko, jež u orientačních cen opravdu je.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('public/js/app.js');
const whatsNew = app.match(/const WHATS_NEW = \[[\s\S]*?\n\];/)[0];

test('O aplikaci s provizí: „reklama“ u odkazů, ale žádné „bez reklam.“', () => {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/js/about.js'), ctx, { filename: 'about.js' });
  const html = ctx.About.html({ version: 'v', health: { ok: true, affiliate: true, providers: [], maps: [] } });
  assert.match(html, /označené <span class="ad-tag">reklama<\/span>/);
  assert.doesNotMatch(html, /bez reklam\./);
  assert.match(html, /zdarma a bez reklamních bannerů\./);
});

test('uvítání a Letsi Plus: bez „bez reklam.“ a bez příjmu z předplatného, které ještě neběží', () => {
  assert.doesNotMatch(app, /Zdarma a bez reklam\./);
  const plus = read('public/js/plus.js');
  assert.doesNotMatch(plus, /z předplatného Plus a|Reklamu neprodáváme/);
  assert.match(plus, /Z čeho Letsi žije: z provizí partnerů \(takové odkazy jsou označené reklama\) a z dobrovolných příspěvků, později i z předplatného Plus\./);
  assert.match(plus, /\['Naplánované cesty \(i\\u00a0z\\u00a0⚡\\u00a0Poskládej\)', 'jedna', 'neomezeně'\]/);
});

test('Co je nového: přejmenování neslibuje přenesené cesty, starší novinky nechválí ceny hotelů ani ověřování volna', () => {
  assert.doesNotMatch(whatsNew, /tvoje cesty i nastavení taky/);
  assert.match(whatsNew, /\['✨', 'ATLAS je teď Letsi', '[^']*Cesty a nastavení z dřívější adresy se sem samy nepřenesou[^']*Záloha do souboru<\/b>[^']*\.'\]/);
  assert.doesNotMatch(whatsNew, /TripAdvisor|ověř\S* volno|ověřením volna|ověřeným volnem|Hotely s cenami|Aktualizovat ceny/);
});

test('Jak hledat chytře: tip odkazuje na tlačítko u orientačních cen', () => {
  const html = read('public/index.html');
  assert.doesNotMatch(html, /Ověřit: Google Flights · Skyscanner/);
  assert.match(html, /U výsledku klepni na „Ověřit cenu v Google Letech“ \(nebo Skyscanner\)/);
  // tlačítko, na které tip odkazuje, opravdu existuje
  assert.match(read('public/js/flights.js'), /Ověřit cenu v Google Letech ↗/);
});
