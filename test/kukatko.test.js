// Vzhled Letsi, krok 4: kukátko, živý průvodce (public/js/kukatko.js + public/css/kukatko.css). Bez přepínače
// (<html data-brand="letsi">) nic nedělá a nic se nestáhne; stavy pozná z DOM stránky (čisté funkce popis/faze/stav/
// dalsi), slunce je na stránce nejvýš jedno, s omezeným pohybem a ve skryté stránce se nic neplánuje. Skript běží
// v node:vm s malým napodobeným DOM (jen to, co kukátko volá).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inlineScriptHashes } from '../server/lib/security.js';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const JS = read('js/kukatko.js');
const CSS = read('css/kukatko.css');
const INDEX = read('index.html');
const CENA = '#results .res-head b.good';

/** Napodobený prvek: strom, třídy, atributy, styl; querySelector(All) jen pro jednoduchý výběr třídou (.trida). */
class El {
  constructor(tag, doc) {
    Object.assign(this, { tagName: tag, doc, children: [], attrs: {}, parentNode: null, listeners: {}, _cls: new Set() });
    const st = {};
    st.setProperty = (k, v) => { st[k] = v; };
    this.style = st;
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self._cls.add(x)),
      remove: (...c) => c.forEach((x) => self._cls.delete(x)),
      toggle: (c, on) => { if (on === undefined ? !self._cls.has(c) : on) self._cls.add(c); else self._cls.delete(c); },
      contains: (c) => self._cls.has(c),
    };
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { if (k === 'class') this.className = v; else this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    if (c.parentNode) c.remove();
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  remove() { if (this.parentNode) { const p = this.parentNode.children; p.splice(p.indexOf(this), 1); this.parentNode = null; } }
  get nextSibling() { const p = this.parentNode && this.parentNode.children; return p ? p[p.indexOf(this) + 1] || null : null; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get isConnected() { let e = this; while (e.parentNode) e = e.parentNode; return e === this.doc.documentElement; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 64, height: 47 }; }
  getClientRects() { return [1]; }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  querySelectorAll(sel) { const c = sel.replace(/^\./, ''); return this.all((e) => e._cls.has(c)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

/** Prohlížeč pro kukatko.js: brand = data-brand, reduce = prefers-reduced-motion, hidden = document.hidden,
 *  q = odpovědi na složité selektory stránky ({ '.view.active': prvek, … }). */
function browser({ brand = 'letsi', reduce = false, hidden = false, q = {} } = {}) {
  const timers = [], frames = [], docListeners = [], created = [];
  const doc = { hidden, readyState: 'complete' };
  doc.documentElement = new El('html', doc);
  if (brand) doc.documentElement.setAttribute('data-brand', brand);
  doc.head = doc.documentElement.appendChild(new El('head', doc));
  doc.body = doc.documentElement.appendChild(new El('body', doc));
  doc.createElement = (t) => { created.push(t); return new El(t, doc); };
  doc.createElementNS = (ns, t) => new El(t, doc);
  doc.addEventListener = (t) => docListeners.push(t);
  doc.getElementById = (id) => q[`#${id}`] || null;
  doc.querySelector = (s) => (s in q ? q[s] : doc.documentElement.querySelector(s));
  doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);
  const win = {
    document: doc, Date, Math, Promise, JSON, String, console,
    setTimeout: (fn, ms) => { timers.push(ms); return timers.length; }, clearTimeout: () => {},
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    matchMedia: (m) => ({ matches: /reduce/.test(m) ? reduce : false, addEventListener() {} }),
    MutationObserver: class { observe() {} },
    getComputedStyle: () => ({}), scrollX: 0, scrollY: 0,
  };
  win.window = win;
  vm.runInNewContext(JS, win, { filename: 'kukatko.js' });
  return { win, doc, timers, frames, docListeners, created, K: win.Kukatko };
}

test('bez data-brand="letsi" nic: žádné Kukatko, posluchače, prvky ani stažené styly', () => {
  for (const brand of [null, 'atlas']) {
    const b = browser({ brand });
    assert.equal(b.K, undefined);
    assert.deepEqual(b.docListeners, []);
    assert.deepEqual(b.created, []);
    assert.equal(b.doc.head.children.length + b.doc.body.children.length, 0);
    assert.deepEqual(b.timers, []);
  }
});

test('se vzhledem Letsi přidá jen <link> na css/kukatko.css; kukátko se ukáže až po načtení stylů', () => {
  const b = browser();
  assert.equal(typeof b.K.mount, 'function');
  assert.equal(b.doc.head.children.length, 1);
  const l = b.doc.head.firstChild;
  assert.equal(l.tagName, 'link');
  assert.equal(l.rel, 'stylesheet');
  assert.equal(l.href, 'css/kukatko.css');
  assert.equal(typeof l.onload, 'function');
  assert.equal(b.doc.body.children.length, 0, 'do stránky zatím nic');
});

test('index.html: kukatko.js načítá jen vložený skript a jen s data-brand="letsi" (CSP otisk sedí)', () => {
  assert.doesNotMatch(INDEX, /<script[^>]+src="js\/kukatko\.js/);
  assert.doesNotMatch(INDEX, /href="css\/kukatko\.css"/);
  const loader = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('js/kukatko.js'));
  assert.ok(loader, 'vložený skript s js/kukatko.js');
  assert.match(loader, /^if \(document\.documentElement\.getAttribute\('data-brand'\) === 'letsi'\)/);
  // poznámka se „<script“ by rozhodila výpočet otisku pro CSP a prohlížeč by skript zablokoval
  const h = `'sha256-${createHash('sha256').update(loader).digest('base64')}'`;
  assert.ok(inlineScriptHashes(INDEX).includes(h), 'otisk vloženého skriptu je v CSP stránky');
  // a v napodobeném prohlížeči: bez přepínače nepřidá nic, s ním jeden <script src="js/kukatko.js">
  for (const brand of [null, 'letsi']) {
    const added = [];
    const doc = { documentElement: { getAttribute: (k) => (k === 'data-brand' ? brand : null) }, createElement: (t) => ({ t }), body: { appendChild: (e) => added.push(e) } };
    vm.runInNewContext(loader, { document: doc, Object });
    assert.deepEqual(added, brand ? [{ t: 'script', src: 'js/kukatko.js' }] : []);
  }
});

/** Stránka s prvky podle popisu → odpovědi querySelector pro popis(). */
function page({ sekce = 'flights', hleda = false, hotovo = false, chyba = false, prazdno = false, cena = false } = {}) {
  const b = browser();
  const el = (id) => Object.assign(new El('section', b.doc), { id });
  return {
    '.view.active': sekce ? el(`view-${sekce}`) : null,
    '#progress .progress-card:not(.done)': hleda && !hotovo ? el('p') : null,
    '#progress .note.bad': chyba ? el('n') : null,
    '#results .empty-res': prazdno ? el('e') : null,
    [CENA]: cena ? el('c') : null,
  };
}

test('popis + faze: stavy z DOM (hledání, chyba, prázdný výsledek, nejlevnější cena, sekce)', () => {
  const { K } = browser();
  const p = (o) => K.popis({ querySelector: (s) => page(o)[s] ?? null });
  assert.deepEqual({ ...p({ sekce: 'dashboard' }) }, { sekce: 'dashboard', hleda: false, chyba: false, prazdno: false, cena: false });
  assert.equal(K.faze(p({ hleda: true })), 'hleda');
  assert.equal(K.faze(p({ hleda: true, hotovo: true, cena: true })), 'cena', 'progress-card.done = dohledáno');
  assert.equal(K.faze(p({ chyba: true, cena: true })), 'chyba', 'chyba má přednost: slunce zhasne i s průběžnými výsledky');
  assert.equal(K.faze(p({ prazdno: true })), 'nic');
  assert.equal(K.faze(p({ cena: true })), 'cena');
  assert.equal(K.faze(p({})), '');
  assert.equal(K.faze(p({ hleda: true, cena: true })), 'hleda', 'během hledání (i s průběžnými výsledky) se hledá');
});

test('stav: Přehled v klidu, Lety podle fáze; Hledám až od 300 ms; jinde kukátko není', () => {
  const { K } = browser();
  const s = (p, ms = 0) => ({ ...K.stav({ sekce: 'flights', hleda: false, chyba: false, prazdno: false, cena: false, ...p }, ms) });
  assert.deepEqual(s({ sekce: 'dashboard' }), { kde: 'prehled', vyraz: 'koukam' });
  assert.deepEqual(s({ hleda: true }, 120), { kde: null, vyraz: null }, 'krátké hledání Hledám neukáže');
  assert.deepEqual(s({ hleda: true }, 300), { kde: 'lety', vyraz: 'hledam' });
  assert.deepEqual(s({ chyba: true }), { kde: 'lety', vyraz: 'offline' });
  assert.deepEqual(s({ prazdno: true }), { kde: 'lety', vyraz: 'nic' });
  assert.deepEqual(s({ cena: true }), { kde: 'lety', vyraz: 'koukam' });
  assert.deepEqual(s({}), { kde: null, vyraz: null }, 'Lety před hledáním: bez kukátka');
  assert.deepEqual(s({ sekce: 'trip', cena: true }), { kde: null, vyraz: null });
});

test('dalsi: Mám to jednou na hledání; překreslení a návrat na výsledky ho nespustí, prázdný výsledek ani chyba taky ne', () => {
  const { K } = browser();
  let t = { nove: false, mam: false, hrat: false };
  const go = (f) => { t = { ...K.dalsi(t, f) }; return t; };
  assert.deepEqual(go('cena'), { nove: false, mam: false, hrat: false }, 'výsledek z minula (bez hledání): bez slunce a mrknutí');
  go('hleda');
  assert.deepEqual(go('cena'), { nove: false, mam: true, hrat: true });
  assert.equal(go('cena').hrat, true, 'drží, dokud ho kreslení nespotřebuje (fáze se mění rychleji než snímky)');
  t.hrat = false; // sync přehrál
  assert.deepEqual(go('cena'), { nove: false, mam: true, hrat: false }, 'řazení, filtr: slunce zůstane, Mrk ne');
  go('hleda');
  assert.deepEqual(go('nic'), { nove: false, mam: false, hrat: false });
  go('hleda');
  assert.deepEqual(go('chyba'), { nove: false, mam: false, hrat: false });
  assert.deepEqual(go('cena'), { nove: false, mam: false, hrat: false }, 'po chybě bez nového hledání nic');
});

test('slunce: nejvýš jedna tečka na stránce, těsně před nejlevnější cenou; s chybou nebo prázdným výsledkem žádná', () => {
  const b = browser();
  const { K, doc } = b;
  const head = doc.body.appendChild(new El('div', doc));
  let cena = head.appendChild(new El('b', doc));
  const q = { querySelector: (s) => (s === CENA ? cena : null), querySelectorAll: (s) => doc.querySelectorAll(s), createElement: doc.createElement };
  const dots = () => doc.querySelectorAll('.k-slunce-cil');
  const t1 = K.slunce(q, true, false);
  assert.equal(dots().length, 1);
  assert.equal(t1.nextSibling, cena);
  assert.equal(t1.getAttribute('data-slunce'), '', 'označené data-slunce (kontrola jednoho slunce)');
  assert.equal(t1.getAttribute('aria-hidden'), 'true');
  assert.equal(t1.classList.contains('k-sviti'), false, 'před letem z oka ještě nesvítí');
  assert.equal(K.slunce(q, true, true), t1, 'podruhé stejná tečka');
  assert.equal(t1.classList.contains('k-sviti'), true);
  // překreslení výsledků: cena je jinde, stará tečka zůstala viset → pořád jen jedna, u nové ceny
  const head2 = doc.body.appendChild(new El('div', doc));
  cena = head2.appendChild(new El('b', doc));
  const t2 = K.slunce(q, true, true);
  assert.equal(dots().length, 1);
  assert.equal(t2.nextSibling, cena);
  assert.equal(K.slunce(q, false), null);
  assert.equal(dots().length, 0, 'slunce zhasne');
});

/** Živé kukátko v napodobeném prohlížeči. */
function mountIn(opts) {
  const b = browser(opts);
  const host = b.doc.body.appendChild(new El('span', b.doc));
  b.timers.length = 0;
  const k = b.K.mount(host, { size: 48 });
  return { ...b, k };
}

test('omezený pohyb: statický výraz – mrkání se neplánuje, blink nic, Mám to rovnou konec', async () => {
  const { k, timers, doc } = mountIn({ reduce: true });
  assert.deepEqual(timers, [], 'žádný časovač');
  assert.equal(k.svg.classList.contains('k-ticho'), true, 'bez přechodů');
  const clona = k.cl[0].style.transform;
  k.blink();
  assert.equal(k.cl[0].style.transform, clona);
  assert.deepEqual(timers, []);
  const tecka = doc.body.appendChild(new El('i', doc));
  await k.mam(tecka);
  assert.equal(tecka.classList.contains('k-sviti'), true);
  assert.deepEqual(timers, [], 'žádná animace ani mrkání po ní');
  assert.equal(doc.body.querySelectorAll('.k-letici-slunce').length, 0, 'slunce neletí');
});

test('skrytá stránka nic neplánuje; viditelná naplánuje jedno mrknutí za 3–8 s', () => {
  assert.deepEqual(mountIn({ hidden: true }).timers, []);
  const { timers, k } = mountIn();
  assert.equal(timers.length, 1);
  assert.ok(timers[0] >= 3000 && timers[0] <= 8000, `${timers[0]} ms`);
  // kukátko mimo stránku (sekce se přepnula) taky nic
  k.svg.remove();
  timers.length = 0;
  k._planuj();
  assert.deepEqual(timers, []);
});

test('kukatko.css: každé pravidlo jen pod :root[data-brand="letsi"], bez přechodů barev, skla a cizích písem', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const heads = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((h) => !h.startsWith('@'));
  assert.ok(heads.length > 15);
  for (const h of heads) for (const sel of h.split(',')) assert.match(sel.trim(), /^:root\[data-brand="letsi"\]/, sel);
  assert.doesNotMatch(css, /gradient|backdrop-filter|blur\(|@import|fonts\.googleapis|url\(/i);
  // ozdoba: nebere klepnutí; omezený pohyb vypne přechody
  assert.match(css, /\.kukatko \{[^}]*pointer-events: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*:root\[data-brand="letsi"\] \.kukatko \* \{ transition: none !important; \}/);
});

test('kukatko.js: řádek a hostitel jsou aria-hidden; žádná nekonečná animace ani smyčka snímků', () => {
  assert.match(JS, /e\.setAttribute\('aria-hidden', 'true'\)/);
  assert.doesNotMatch(JS, /iterations:\s*Infinity|setInterval\(/);
  // requestAnimationFrame jen na jednu událost (pohyb prstu, dávka změn DOM), ne smyčka
  for (const m of JS.matchAll(/function (\w+)\([^)]*\) \{[^}]*requestAnimationFrame\((\w+)\)/g)) assert.notEqual(m[1], m[2]);
});
