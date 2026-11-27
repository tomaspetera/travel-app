// Regresní kontrola před spuštěním (vlna 8, okna a texty): ✕ v oknech Záloha, Přenos z jiného zařízení a Co je nového,
// texty bez slibu QR kódu napevno (QR jen když se data vejdou – transfer.js), Letsi Plus o provizích podle /api/health
// (jako about.js earnings), ikony Letsi místo 🤝 a ➕, srozumitelný text nad Kam letět levně a název vlastní cesty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const APP = read('public/js/app.js');
// tělo funkce po zavírací závorku na úrovni odsazení ind (moduly v IIFE mají funkce odsazené o 2 mezery)
const fnBody = (src, name, ind = '') => { const i = src.indexOf(`function ${name}(`); return src.slice(i, src.indexOf(`\n${ind}}`, i)); };

test('okna Záloha do souboru a Přenos z jiného zařízení mají ✕ (modalOpen s { x: true })', () => {
  const bk = read('public/js/backup.js');
  const calls = bk.match(/modalOpen\(`[\s\S]*?`(?:, \{[^}]*\})?\);/g);
  assert.equal(calls.length, 2);
  for (const c of calls) assert.match(c, /`, \{ x: true \}\);$/, c.slice(0, 80));
});

test('Co je nového má ✕ nahoře jako ostatní okna z postranního panelu', () => {
  assert.match(fnBody(APP, 'whatsNewOpen'), /data-close>Zavřít<\/button><\/div>`, \{ x: true \}\);/);
});

test('menu a záloha neslibují QR kód napevno – nabídne se, jen když se data vejdou', () => {
  const tr = noComments(read('public/js/transfer.js')), bk = noComments(read('public/js/backup.js')), ab = read('public/js/about.js');
  const menu = tr.match(/function addToMenu[\s\S]*?\n {2}\}/)[0];
  assert.doesNotMatch(menu, /QR kód/);
  assert.match(menu, /Přenést do jiného zařízení <span class="faint">odkaz nebo soubor<\/span>/);
  const open = fnBody(bk, 'open', '  ');
  assert.doesNotMatch(open, /QR kód/);
  assert.match(open, /📲 Přenést odkazem<\/button>/);
  assert.doesNotMatch(ab, /odkazem s QR kódem/);
  assert.match(ab, /odkazem \(📲 Přenést do jiného zařízení\)/);
});

test('Letsi Plus: provize jen při zapnutých partnerských odkazech, bez znalosti stavu neutrálně', () => {
  const ctx = { window: {} };
  vm.runInNewContext(read('public/js/plus.js'), ctx);
  const P = ctx.window.Plus;
  for (const hl of [undefined, null, {}, { affiliate: false }, { affiliate: 'ano' }]) {
    const t = P.livesTxt(hl);
    assert.doesNotMatch(t, /provizí/, JSON.stringify(hl));
    assert.equal(t, 'Z čeho Letsi žije: z dobrovolných příspěvků, později i z předplatného Plus. Pořadí výsledků si nikdo nekoupí.');
  }
  assert.match(P.livesTxt({ affiliate: true }), /^Z čeho Letsi žije: z provizí partnerů \(takové odkazy jsou označené reklama\) a z dobrovolných příspěvků/);
  assert.doesNotMatch(P.pageHtml(), /provizí/, 'okno se otevře dřív, než server odpoví');
  assert.match(P.pageHtml({ affiliate: true }), /<p class="faint plus-small" id="plusLives">Z čeho Letsi žije: z provizí partnerů/);
  // po odpovědi /api/health se překreslí jen věta (odpověď na „Chci Plus“ pod ní zůstane)
  assert.match(read('public/js/plus.js'), /Flights\.warm\(\)\.then\(hl => \{ const p = q\('#plusLives'\); if \(p\) p\.textContent = livesTxt\(hl\); \}/);
});

test('Pomáhat se zlepšováním a návod pro iPhone: ikony Letsi místo barevných emoji', () => {
  const helpBtn = APP.match(/^const helpBtn = .*$/m)[0];
  assert.doesNotMatch(helpBtn, /🤝/);
  assert.match(helpBtn, /\$\{ikona\('cestujici'\)\} Pomáhat se zlepšováním/);
  const ab = read('public/js/about.js');
  assert.doesNotMatch(ab, /🤝/);
  assert.match(ab, /id="abHelp"[^>]*><span class="ico i-cestujici" aria-hidden="true"><\/span> Pomáhat se zlepšováním/);
  const pwa = read('public/js/pwa.js');
  assert.doesNotMatch(pwa, /➕ Letsi na plochu/);
  assert.match(fnBody(pwa, 'iosHint', '  '), /<h2 class="pwa-h">\$\{ICON\}Letsi na plochu<\/h2>/);
  assert.match(pwa, /const ICON = '<span class="ico i-plus"/);
});

test('nad Kam letět levně: cena za osobu, ne „ceny pro 2 osoby“', () => {
  const fl = read('public/js/flights.js');
  const what = fl.match(/<div class="faint radar-what">(\$\{q\.payload[^\n]*?'Cena za osobu'\})/)[1];
  assert.doesNotMatch(fl, /ceny pro \$\{plural\(q\.payload\.adults/);
  const txt = (adults) => new Function('q', `return \`${what}\`;`)({ payload: { adults } });
  assert.equal(txt(1), 'Cena za osobu');
  assert.equal(txt(2), 'Cena za osobu při 2 cestujících');
  assert.equal(txt(5), 'Cena za osobu při 5 cestujících');
  assert.equal(txt(undefined), 'Cena za osobu');
});

test('vlastní cesta bez názvu se jmenuje podle cíle, ne „Moje cesta“', () => {
  assert.match(fnBody(APP, 'saveTrip'), /name: \$\('#ntName'\)\.value\.trim\(\) \|\| \$\('#ntDest'\)\.value\.trim\(\) \|\| 'Moje cesta',/);
});
