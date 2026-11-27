// UX kontrola U22 (texty-sliby): texty nesmí slibovat víc, než aplikace v „čistém režimu“ (jen orientační ceny
// z mezipaměti Aviasales, žádná upozornění na telefon) umí – hlídání ceny, úprava cesty, 📌 Odložit, Letsi Plus,
// řádek po hledání a tipy. Kde se pravda liší podle režimu, vybírá text malá čistá funkce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fl = read('public/js/flights.js'), app = read('public/js/app.js'), data = read('public/js/data.js'), html = read('public/index.html');
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

/** Úsek zdroje mezi dvěma značkami (včetně první). */
function cut(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `úsek „${from}“`);
  return src.slice(a, b);
}
const flSrc = cut(fl, '  // Uživatel čte „orientační“', '  /* ---------- živé ověření cen z mezipaměti');
const F = (health) => new Function('health', 'esc', 'SearchHelp', 'plural', `${flSrc}; return { cacheOnly, doneHead };`)(health, String, {}, plural);
const hp = (on) => ({ providers: [['ryanair', 'live'], ['wizzair', 'live'], ['kiwi', 'live'], ['travelpayouts', 'cached'], ['xotelo', 'stays'], ['demo-air', 'demo']].map(([id, kind]) => ({ id, kind, enabled: on.includes(id) })) });
const CLEAN = hp(['travelpayouts', 'xotelo']), ALL = hp(['ryanair', 'wizzair', 'kiwi', 'travelpayouts']), DEMO = hp(['demo-air']);

test('řádek po hledání: v čistém režimu stáří dat místo „Prohledáno … – hned“, se živými zdroji jako dřív', () => {
  const clean = F(CLEAN), all = F(ALL);
  assert.equal(clean.cacheOnly(), true);
  assert.equal(all.cacheOnly(), false);
  assert.equal(F(DEMO).cacheOnly(), false, 'ukázková data nejsou „z posledních 48 h“');
  assert.equal(F(null).cacheOnly(), false, 'bez /api/health jako dřív');
  assert.equal(F(hp([])).cacheOnly(), false, 'nic zapnuté – nic netvrdit');
  assert.equal(clean.doneHead(5, false, 0), 'Ceny z posledních 48 h · 5 letišť');
  assert.equal(clean.doneHead(3, true, 4200), 'Ceny z posledních 48 h · 3 lety');
  assert.equal(all.doneHead(5, false, 0), 'Prohledáno 5 letišť – hned');
  assert.equal(all.doneHead(1, false, 5700), 'Prohledáno 1 letiště za 5,7 s');
  assert.equal(F(null).doneHead(2, true, 1234), 'Prohledáno 2 lety za 1,2 s');
  assert.match(fl, /const head = res \? doneHead\(multi \? res\.legs\.length : res\.origins\.length, multi, res\.stats\.ms\)/);
});

test('hlídání ceny: cílová cena „Upozornit pod“ jen s povolenými upozorněními v prohlížeči, jinak „Zvýraznit pod“', () => {
  const ctx = { window: {} };
  vm.runInNewContext(read('public/js/alerts.js'), ctx);
  const A = ctx.window.Alerts;
  assert.equal(A.targetLbl('granted'), 'Upozornit pod');
  for (const st of ['phone', 'default', 'denied', 'unsupported', undefined]) assert.equal(A.targetLbl(st), 'Zvýraznit pod', String(st));
  assert.match(fl, /<label class="w-target">🎯 \$\{Alerts\.targetLbl\(notifOk\(\)\)\} <input/);
  assert.doesNotMatch(fl, /Upozornit pod/);
});

test('hlídání ceny: texty podle toho, jak kontrola opravdu běží (po otevření aplikace, nejvýš jednou za 6 h)', () => {
  for (const [name, s] of [['flights.js', fl], ['data.js', data], ['index.html', html]]) {
    assert.doesNotMatch(s, /dokud máš (aplikaci|stránku) otevřenou/, name);
    assert.doesNotMatch(s, /každých 6 h/, name);
  }
  assert.match(fl, /'Hlídám\. Cenu zkontroluju, když Letsi otevřeš, a zlevnění uvidíš na Přehledu\.'/);
  assert.match(fl, /`Hlídám\. Cenu zkontroluju, když Letsi otevřeš – termín se posouvá s časem/);
  assert.match(data, /'Hlídej cenu','Tlačítkem Hlídat cenu ulož hledání[^']*zkontroluje, když aplikaci otevřeš \(nejvýš jednou za 6 h\)/);
  // ♡ ve sbaleném formuláři vypadalo jako „oblíbené“ – ikona hlídání s textem
  assert.match(fl, /id="ssWatch" aria-label="Hlídat cenu">\$\{ikona\('hlidam'\)\} Hlídat<\/button>/);
  assert.match(fl, /w\.innerHTML = `\$\{ikona\('hlidam'\)\} \$\{on \? 'Hlídáš' : 'Hlídat'\}`;/);
  // tip neslibuje skládání kombinací Ryanair/Wizz (v čistém režimu je jen Aviasales)
  assert.doesNotMatch(data, /Letsi skládá i takové kombinace/);
});

test('úprava cesty: cesta z průvodce jen „Upravit název“, vlastní cesta „Upravit název a termín“', () => {
  const m = app.match(/^const tripEditLbl = .*$/m);
  assert.ok(m, 'tripEditLbl v app.js');
  const tripEditLbl = new Function(`${m[0]}; return tripEditLbl;`)();
  assert.equal(tripEditLbl({ wizard: true }), 'Upravit název');
  assert.equal(tripEditLbl({ name: 'Řím' }), 'Upravit název a termín');
  assert.match(app, /id="tripEdit">✏️ \$\{tripEditLbl\(t\)\}<\/button>/);
  // editTrip pole termínu u cesty z průvodce opravdu nemá (stejná podmínka)
  assert.match(app, /const fixed = Boolean\(t\.wizard\);/);
});

test('📌 Odložit: hláška pojmenuje skutečné místo a tlačítkem Zobrazit otevře Porovnat', () => {
  assert.match(fl, /– najdeš i na Přehledu v Odložených nabídkách` : `Odebráno z odložených: \$\{rec\.dest\.label\}`, '', x\.on \? 4000 : 2600, x\.on \? \{ label: 'Zobrazit', run: \(\) => openPins\(\) \} : null\);/);
  assert.doesNotMatch(fl, /porovnáš v „📌 Odložené/);
});

test('Letsi Plus: „žije z příspěvků“ jen s tlačítkem 💛 Podpořit Letsi, jinak neutrální věta', () => {
  const ctx = { window: {} };
  ctx.window.window = ctx.window;
  vm.runInNewContext(read('public/js/about.js'), ctx);
  ctx.About = ctx.window.About;
  vm.runInNewContext(read('public/js/plus.js'), ctx);
  const P = ctx.window.Plus, pay = { url: 'https://buy.stripe.com/test_abcd1234' };
  assert.equal(P.livesTxt(null), 'Letsi je zatím zdarma a pořadí výsledků si nikdo nekoupí.');
  assert.equal(P.livesTxt({ support: { url: 'https://example.com/pay' } }), 'Letsi je zatím zdarma a pořadí výsledků si nikdo nekoupí.', 'jen platební odkaz Stripe (About.okPay)');
  assert.equal(P.livesTxt({ support: pay }), 'Z čeho Letsi žije: z dobrovolných příspěvků (💛 Podpořit Letsi v O aplikaci), později i z předplatného Plus. Pořadí výsledků si nikdo nekoupí.');
  assert.equal(P.livesTxt({ affiliate: true, support: pay }), 'Z čeho Letsi žije: z provizí partnerů (takové odkazy jsou označené reklama) a z dobrovolných příspěvků (💛 Podpořit Letsi v O aplikaci), později i z předplatného Plus. Pořadí výsledků si nikdo nekoupí.');
  // cena Plus a otázka na ni zůstávají
  assert.match(P.pageHtml(), /<p class="plus-small">Plus: /);
});
