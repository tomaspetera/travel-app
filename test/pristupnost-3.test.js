// Přístupnost před spuštěním (kontrola pristupnost-4, -5, -8, pruvodce-3): lišta Novinky od minula nezakrývá prvek
// s fokusem a Esc ji zavře odkudkoli; karta v Mých cestách s vnitřním tlačítkem není sama tlačítkem; „Díky!“ po krátké
// otázce čtečka přečte a fokus nezmizí, „Ne, díky“ u karty souhlasu se ohlásí; karta cesty z průvodce odliší cenu
// od „Můj rozpočet“ (app.js tripMoney; uložení totalCzk hlídá test/trip-changes.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
const APP = read('js/app.js');
/** Konstanty a funkce z app.js podle jména (jako test/history.test.js). */
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = (?:.*\\{\\n[\\s\\S]*?^\\};|.*)|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
const sp = (s) => String(s).replace(/[  ]/g, ' ');

test('pruvodce-3: karta cesty z průvodce – cena a „rozpočet“ s popiskem, ruční cesta beze změny', () => {
  const tripMoney = new Function(`${pick('czk', 'tripMoney')}; return tripMoney;`)();
  const m = (t) => sp(tripMoney(t));
  // z průvodce s vlastním rozpočtem: obě čísla, rozpočet s popiskem
  assert.equal(m({ tripId: 1, budget: '30000', totalCzk: 16250 }), '16 250 Kč · rozpočet 30 000 Kč');
  // bez vlastního rozpočtu (budget = cena): jedno číslo jako dřív
  assert.equal(m({ tripId: 1, budget: '16250', totalCzk: 16250 }), '16 250 Kč');
  // cena zatím neznámá (0): jen rozpočet, ale s popiskem
  assert.equal(m({ tripId: 1, budget: '30000', totalCzk: 0 }), 'rozpočet 30 000 Kč');
  // ruční cesta a starší uložená cesta z průvodce bez totalCzk: jediné číslo beze změny
  assert.equal(m({ budget: '30000' }), '30 000 Kč');
  assert.equal(m({ budget: '30000', totalCzk: 16250 }), '30 000 Kč', 'bez tripId není z průvodce');
  assert.equal(m({ tripId: 1, budget: '30000' }), '30 000 Kč');
  assert.equal(m({}), '');
  assert.equal(m({ tripId: 1, budget: '', totalCzk: 16250 }), '');
  assert.match(APP, /\$\{tripMoney\(t\) \? `<span>\$\{tripMoney\(t\)\}<\/span>` : ''\}/, 'tripCard částku bere z tripMoney');
});

test('pristupnost-5: karta s „Program, balení a poznámky“ není role=button – otevře ji název jako tlačítko', () => {
  const fn = APP.slice(APP.indexOf('function myTrips('), APP.indexOf('function newTrip('));
  // i s tlačítkem „Naplánuj podobnou · Plus“ (plus.js, test/plus-test-zajmu.test.js) je karta bez role=button
  assert.match(fn, /const nm = \$\('\[data-mdet\],\[data-plus-soon\]', el\) && \$\('\.tt-name', el\);\s*if \(nm\) nm\.innerHTML = `<button type="button" class="tt-open">\$\{nm\.innerHTML\}<\/button>`; else kbClick\(el\);/);
  assert.doesNotMatch(fn, /open\(\+el\.dataset\.mt\); \}; kbClick\(el\);/, 'kbClick na každou kartu (i s vnitřním tlačítkem) pryč');
  const css = read('css/trip.css');
  const h = /\.mt-det\{[^}]*min-height:(\d+)px/.exec(css);
  assert.ok(h && +h[1] >= 24, '.mt-det aspoň 24 px vysoké (WCAG 2.5.8)');
  assert.match(css, /\.tt-name>\.tt-open\{padding:0;margin:0;border:0;background:none;font:inherit;color:inherit;/);
  assert.match(css, /\.tt-name>\.tt-open:focus-visible\{outline:/);
});

test('pristupnost-4: lišta Novinky – Esc odkudkoli (posluchač na document, při zavření pryč), fokus se odroluje nad ni', () => {
  const fn = APP.slice(APP.indexOf('function whatsNewPop('), APP.indexOf('function whatsNewOpen('));
  assert.match(fn, /const onEsc = e => \{ if \(e\.key === 'Escape' && shown\(\)\) close\(\); \};/);
  assert.match(fn, /const close = \(\) => \{ bar\.remove\(\); document\.removeEventListener\('keydown', onEsc, true\); \};/);
  assert.match(fn, /document\.addEventListener\('keydown', onEsc, true\);/, 'zachytávání: dřív než Esc, který zavře okno');
  assert.doesNotMatch(fn, /bar\.onkeydown/);
  const css = read('css/pwa.css');
  assert.match(css, /\nhtml:has\(\.wn-pop\)\{scroll-padding-bottom:calc\(min\(50vh,440px\) \+ 40px\)\}/);
  const phone = css.slice(css.indexOf('@media(max-width:860px){'));
  assert.match(phone.slice(0, phone.indexOf('\n}')), /html:has\(\.wn-pop\)\{scroll-padding-bottom:calc\(42vh \+ 100px \+ env\(safe-area-inset-bottom\)\)\}/);
});

test('pristupnost-8: karta souhlasu – „Ne, díky“ se čtečce ohlásí (say), „Zapnout“ dál toast', () => {
  const fn = APP.slice(APP.indexOf('function helpCard('), APP.indexOf('const WN_TOP_LS'));
  assert.match(fn, /if \(on\) toast\('Zapnuto\. Díky! Vypnout to jde kdykoli v Další[^']*\.'\);\s*else say\('Dobře, nic nezaznamenávám\. Změnit to jde v Další[^']*\.'\);/);
});

// zástupný DOM jen pro Count.ask (strom, focus)
function loadCount() {
  const doc = {};
  const el = (tag) => ({
    tagName: tag, children: [], parent: null, attrs: {}, dataset: {}, style: {}, className: '', textContent: '', onclick: null, focused: null,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...xs) { for (const x of xs) { x.remove?.(); x.parent = this; this.children.push(x); } },
    remove() { if (!this.parent) return; this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
    focus(o) { doc.activeElement = this; this.focused = o; },
    insertAdjacentElement(pos, x) { x.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, x); return x; },
    get isConnected() { let e = this; while (e.parent) e = e.parent; return e === doc.body; },
  });
  doc.body = el('body');
  doc.createElement = el;
  doc.baseURI = 'https://letsi.example/app/';
  const ctx = { URL, JSON, String, Array, document: doc, navigator: { onLine: true, sendBeacon: () => true }, Math: Object.assign(Object.create(Math), { random: () => 0 }) };
  Object.defineProperty(ctx, 'localStorage', { get: () => { throw new Error('bez úložiště'); } });
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/count.js'), ctx, { filename: 'count.js' });
  const host = el('div'), p = el('p');
  doc.body.append(host);
  host.append(p);
  return { C: ctx.Count, doc, p };
}

test('pristupnost-8: Count.ask – oblast role=status je v řádku už s otázkou, „Díky!“ se zapíše do ní a dostane fokus', () => {
  const { C, doc, p } = loadCount();
  const row = C.ask(p, { id: 'trip', q: 'Pomohl ti průvodce?', rate: 1, opts: [['mq_trip_good', 'Ano, hodně'], ['mq_trip_lost', 'Nevyznal/a jsem se']] });
  const st = row.children.find((c) => c.attrs.role === 'status');
  assert.ok(st, 'hlášení existuje před odpovědí (přidané až s textem čtečka nepřečte)');
  assert.equal(st.textContent, '', 'zatím prázdné – nic se nečte');
  assert.equal(row.attrs.role, 'group', 'otázka dál skupina s popiskem');
  row.children.find((c) => c.tagName === 'button').onclick();
  assert.deepEqual(row.children, [st], 'zůstane jen tatáž oblast (nevložená znovu)');
  assert.equal(st.textContent, 'Díky!');
  assert.equal(doc.activeElement, st, 'fokus na poděkování, ne na začátek stránky');
  assert.equal(st.tabIndex, -1);
  assert.deepEqual({ ...st.focused }, { preventScroll: true });
});
