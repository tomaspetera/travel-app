// Texty nesmí slibovat, co aplikace nedělá: věta o cenách v uvítání a O aplikaci podle zdrojů v /api/health (čistý
// režim = jen orientační ceny z Aviasales, ne porovnání u aerolinek), řádek pod „Kam poletíme?“ na telefonu a hláška
// po „Přidat k cestě“ v Objevuj podle toho, co se opravdu přidalo (public/js/about.js a places.js přes node:vm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const actx = { console };
actx.window = actx;
vm.createContext(actx);
vm.runInContext(read('public/js/about.js'), actx, { filename: 'about.js' });
const A = actx.About;

const pctx = { window: {}, URLSearchParams, console };
vm.createContext(pctx);
vm.runInContext(read('public/js/app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), pctx);
vm.runInContext(read('public/js/places.js'), pctx, { filename: 'places.js' });
const P = pctx.window.Places._t;

const prov = (on) => ['ryanair', 'wizzair', 'kiwi', 'xotelo', 'osm', 'travelpayouts'].map((id) => ({ id, enabled: on.includes(id) }));
const CLEAN = { demo: false, providers: prov(['travelpayouts']) };
const LIVE = { demo: false, providers: prov(['kiwi', 'travelpayouts']) };

test('věta o cenách: čistý režim neslibuje porovnávání, živé zdroje ano, bez health obecná', () => {
  const clean = A.buyLine(CLEAN);
  assert.equal(clean, 'Ceny letenek jsou orientační – co za posledních 48 h našli jiní na Aviasales. K nákupu tě pošlu tam.');
  assert.doesNotMatch(clean + A.buyLine(CLEAN, true), /porovnávám|u aerolinky/);
  assert.equal(A.buyLine(LIVE), 'Ceny porovnávám, letenku koupíš u aerolinky nebo prodejce.');
  assert.equal(A.buyLine({ providers: prov(['ryanair']) }), A.buyLine(LIVE));
  assert.equal(A.buyLine({ demo: true, providers: [] }), A.buyLine(LIVE), 'DEMO ukazuje „živé“ ceny ukázkových aerolinek');
  for (const h of [null, undefined, {}, { providers: 'x' }, { providers: [] }]) assert.equal(A.buyLine(h), 'Ceny jsou orientační – před nákupem je ověř u prodejce.');
});

test('O aplikaci → Jak to funguje: věta podle režimu, i o ubytování', () => {
  const clean = A.html({ version: 'v', health: { ...CLEAN, affiliate: true } });
  assert.match(clean, /Ceny letenek jsou orientační – co za posledních 48 h našli jiní na Aviasales\. K nákupu tě pošlu tam\. Ubytování rezervuješ přímo u prodejce\. Hledání a plánování je zdarma/);
  assert.doesNotMatch(clean, /Ceny porovnávám/);
  assert.match(A.html({ version: 'v', health: LIVE }), /Ceny porovnávám, letenku i ubytování koupíš vždy přímo u aerolinky nebo prodejce\. Hledání/);
  assert.match(A.html({ version: 'v' }), /Ceny jsou orientační – před nákupem je ověř u prodejce\. Hledání/);
});

test('uvítání: věta z About.buyLine, po /api/health přepsaná podle režimu', () => {
  const app = read('public/js/app.js');
  assert.doesNotMatch(app, /Ceny porovnávám, letenku koupíš u aerolinky nebo prodejce\. Zdarma/, 'pevná věta pryč');
  assert.match(app, /const wcHow = h => `\$\{window\.About && About\.buyLine \? About\.buyLine\(h\) : ''\} Zdarma, bez placených pozic\.`/);
  assert.match(app, /Flights\.warm\(\)\)\.then\(h => \{ const p = \$\('\.wc-how', el\); if \(p\) p\.textContent = wcHow\(h\); \}/);
});

test('telefon: pod „Kam poletíme?“ jeden řádek, co Letsi dělá (pravdivý v obou režimech)', () => {
  assert.match(read('public/index.html'), /<p class="hero-short">Levné letenky ze všech letišť v okolí\. Zdarma\.<\/p>/);
  const css = read('public/css/atlas.css');
  assert.match(css, /\.hero \.hero-short\{display:none\}/, 'mimo telefon skrytý (počítač má celý odstavec)');
  assert.match(css, /@media\(max-width:520px\)\{[^]*?\.hero p\{display:none\}\s*\.hero \.hero-short\{display:block;margin-top:6px;font-size:13px;/);
});

test('Přidat k cestě: hláška podle toho, co přibylo a kam', () => {
  const t = { days: { '2027-03-13': ['Belém'], '2027-03-14': ['Alfama'] } };
  const was = JSON.parse(JSON.stringify(t.days));
  const e = { src: 'city', dest: 'Lisabon', days: { '2027-03-13': ['Belém'], '2027-03-14': ['Alfama', 'Oceanárium', 'LX Factory'], '2027-03-15': ['Sintra'] }, end: '2027-03-15' };
  const added = P.mergeInto(t, e), days = P.newDays(was, t.days);
  assert.equal(added, 3);
  assert.deepEqual([...days], ['2027-03-14', '2027-03-15']);
  assert.equal(P.addMsg('Lisabon 13.3.', added, days), 'K cestě Lisabon 13.3. přidáno: 3 místa (ne 14. 3., po 15. 3.)');
  // podruhé totéž: nic nepřibylo – dřív stejně „Přidáno k cestě“
  const was2 = JSON.parse(JSON.stringify(t.days));
  const again = P.mergeInto(t, e);
  assert.equal(again, 0);
  assert.equal(P.newDays(was2, t.days).length, 0);
  assert.equal(P.addMsg('Lisabon 13.3.', again, []), 'Všechna tahle místa už v programu cesty Lisabon 13.3. máš');
  assert.equal(P.addMsg('X', 1, ['2027-03-13']), 'K cestě X přidáno: 1 místo (so 13. 3.)');
  // víc než 3 dny: rozsah od–do, ať hláška nepřeteče
  assert.equal(P.addMsg('X', 6, ['2027-03-13', '2027-03-14', '2027-03-15', '2027-03-16']), 'K cestě X přidáno: 6 míst (so 13. 3. – út 16. 3.)');
  assert.deepEqual([...P.newDays(null, { a: ['x'] })], ['a']);
  // místo smazané v itineráři (delAct) se dalším uložením vrátí: mergeInto ho nezapočte, hláška nesmí tvrdit „už máš“
  t.days['2027-03-14'] = t.days['2027-03-14'].filter((x) => x !== 'Oceanárium');
  const was3 = JSON.parse(JSON.stringify(t.days));
  assert.equal(P.mergeInto(t, e), 0);
  assert.equal(P.newLines(was3, t.days).length, 1);
  assert.deepEqual([...P.newDays(was3, t.days)], ['2027-03-14']);
});

test('Přidat k cestě: hláška z addMsg, upozornění na obsazené dny zůstává, Otevřít jde na první dotčený den', () => {
  const src = read('public/js/places.js');
  assert.match(src, /const added = t \? newLines\(was, t\.days\)\.length : 0/, 'počet z rozdílu programu, ne z mergeInto');
  assert.match(src, /actToast\(i >= 0 \? `\$\{addMsg\(t\.name, added, days\)\}\$\{warn\}` : 'Uloženo do Mých cest'/);
  assert.match(src, /day-block\[data-day="\$\{days\[0\]\}"\]`\)\?\.scrollIntoView/);
  assert.doesNotMatch(src, /`Přidáno k cestě \$\{t\.name\}/);
});
