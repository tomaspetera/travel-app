// Regresní kontrola na počítači (navigace a okna): ↻ Aktualizovat bez falešného „Aktualizuji…“, fokus v okně Letsi Plus
// po „Chci Plus“ a po odpovědi, návrat z okna Plus do okna země, Tab v řadě ikon panelu v pořadí ikon, tečka
// „navštíveno“ v legendě v tmavém režimu a „+“ v nadpisu Objevuj, který nezůstane sám na konci řádku.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const APP = read('public/js/app.js');

test('↻ Aktualizovat: „Aktualizuji…“ jen tam, kde se hned překreslí (Přehled, Země, Doporučení), jinde pravdivě', () => {
  const m = APP.match(/^ {2}const refreshMsg = [\s\S]*?\);$/m);
  assert.ok(m, 'app.js: refreshMsg');
  const msg = new Function(`${m[0]}; return refreshMsg;`)();
  for (const v of ['dashboard', 'countries', 'recommend']) assert.equal(msg(v), 'Aktualizuji…', v);
  assert.equal(msg('flights'), 'Počasí a kurzy načtu znovu – ceny letů obnoví nové hledání');
  for (const v of ['trip', 'explore', 'map']) assert.equal(msg(v), 'Počasí a kurzy načtu znovu při dalším otevření', v);
  // obsluha opravdu překreslí sekce, kterým hláška slibuje „Aktualizuji…“
  const h = APP.match(/\$\('#refreshBtn'\)\.onclick = \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(h, 'obsluha #refreshBtn');
  assert.match(h[0], /toast\(refreshMsg\(activeView\)\)/);
  assert.match(h[0], /activeView === 'dashboard'\) \{ renderDash\(\);/);
  assert.match(h[0], /activeView === 'countries'\) renderCountries\(\)/);
  assert.match(h[0], /activeView === 'recommend'\) renderRecs\(\)/);
});

/**
 * plus.js v node:vm s napodobeným oknem: box(html) zná jen to, co testy potřebují (id, třídy, tlačítka data-price /
 * data-time); přepsání obsahu zahodí fokus z tlačítek uvnitř jako prohlížeč (activeElement → body).
 */
function load({ active } = {}) {
  const doc = { body: { tagName: 'BODY' }, activeElement: null };
  doc.activeElement = active || doc.body;
  const focused = [], scrolled = [], log = [], opened = [], observers = [];
  const node = (owner, extra = {}) => ({
    owner, tabIndex: 0, ...extra,
    focus(o) { assert.deepEqual({ ...o }, { preventScroll: true }); doc.activeElement = this; focused.push(this); },
    scrollIntoView(o) { assert.deepEqual({ ...o }, { block: 'nearest' }); scrolled.push(this); },
  });
  const box = (html = '', owner = null) => {
    const b = node(owner, { html, kids: {} });
    Object.defineProperty(b, 'innerHTML', {
      get() { return this.html; },
      set(v) { if (doc.activeElement && doc.activeElement.owner === this) doc.activeElement = doc.body; this.html = v; this.kids = {}; },
    });
    Object.defineProperty(b, 'firstChild', { get() { return this.html ? (this.kids[':first'] ||= box(this.html, this)) : null; } });
    b.insertAdjacentHTML = function (_, v) { this.html += v; };
    const has = (s) => b.html.includes(s[0] === '#' ? `id="${s.slice(1)}"` : s.slice(1));
    b.querySelector = (sel) => { const s = sel.split(', ').find(has); return s ? (b.kids[s] ||= box(b.html.slice(b.html.indexOf(s[0] === '#' ? `id="${s.slice(1)}"` : s.slice(1))), b)) : null; };
    b.querySelectorAll = (sel) => {
      const a = sel.slice(1, -1);
      return [...b.html.matchAll(new RegExp(`${a}="([^"]*)"`, 'g'))].map(([, v]) => {
        const k = `${a}=${v}`;
        const owner = b.querySelector(a === 'data-price' ? '#plusPrice' : '#plusTime');
        return (b.kids[k] ||= node(owner, { dataset: { [a === 'data-price' ? 'price' : 'time']: v } }));
      });
    };
    return b;
  };
  const after = box('<button id="plusWant">Chci Plus</button>');
  const want = node(after), modal = { scrollTop: 0 }, body = { scrollTop: 0 }, page = { isConnected: true };
  const bg = { classList: { on: true, contains: (k) => k === 'show' && bg.classList.on } };
  const els = { '#plusAfter': after, '#plusWant': want, '#modal': modal, '#modal>.modal-body': body, '#modalBg': bg, '#modal .plus-page': page };
  const ctx = {
    window: { Count: { hit: (e) => log.push(e) } },
    document: Object.assign(doc, { querySelector: (s) => (s === '#themeToggle' ? null : els[s] || null) }),
    modalOpen: (html) => opened.push(html),
    openCountry: (iso) => opened.push(`země ${iso}`),
    MutationObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe(el, o) { this.el = el; this.o = o; } disconnect() { this.off = true; } },
  };
  vm.runInNewContext(read('public/js/plus.js'), ctx);
  return { P: ctx.window.Plus, doc, after, want, modal, body, page, bg, focused, scrolled, log, opened, observers };
}

test('Letsi Plus: po „Chci Plus“ fokus na otázku na cenu a okno se k ní posune; zpráva je role="status"', () => {
  const t = load();
  t.P.open();
  t.doc.activeElement = t.want; // Enter na „Chci Plus“
  t.want.onclick();
  assert.match(t.after.innerHTML, /<p class="note info plus-msg" role="status">Plus chystáme na jaro/);
  const q = t.after.querySelector('#plusPrice');
  assert.ok(q, 'otázka na cenu');
  assert.deepEqual(t.focused, [q], 'fokus na otázku, ne na <body>');
  assert.equal(q.tabIndex, -1);
  assert.deepEqual(t.scrolled, [q]);
});

test('Letsi Plus: po odpovědi na cenu fokus na poděkování s cenou, anketa pod ním je vidět; po anketě na poděkování', () => {
  const t = load();
  t.P.open();
  t.doc.activeElement = t.want;
  t.want.onclick();
  const price = t.after.querySelectorAll('[data-price]')[2];
  t.doc.activeElement = price;
  price.onclick();
  const box = t.after.querySelector('#plusPrice'), poll = t.after.querySelector('#plusTime');
  assert.match(box.innerHTML, /plus-thanks.*Plánujeme kolem 399 Kč/);
  assert.ok(poll, 'anketa o čase až po ceně');
  assert.equal(t.focused.at(-1), box.firstChild, 'fokus na poděkování');
  assert.equal(t.scrolled.at(-1), poll, 'okno se posune k anketě');
  const tm = t.after.querySelectorAll('[data-time]')[0];
  t.doc.activeElement = tm;
  tm.onclick();
  assert.match(poll.innerHTML, /plus-thanks/);
  assert.equal(t.focused.at(-1), poll.firstChild);
});

test('Letsi Plus: okno „· Plus“ s otázkou hned od otevření fokus neukradne (řídí ho app.js jako u ostatních oken)', () => {
  const opener = { tagName: 'BUTTON', dataset: { plusSoon: 'pack', plusKey: 'x' } };
  const t = load({ active: opener }); // fokus na „Uložit jako šablonu · Plus“ pod oknem
  t.P.watchSoon({ querySelectorAll: () => [opener] });
  opener.onclick({ stopPropagation() {} });
  assert.match(t.opened.at(-1), /Moje balicí seznamy/);
  assert.ok(t.after.querySelector('#plusPrice'), 'otázka na cenu v okně');
  assert.deepEqual(t.focused, [], 'fokus zůstal, kde byl');
  assert.equal(t.doc.activeElement, opener);
});

test('Uložit do Sešitu · Plus: po zavření okna Plus se vrátí okno země na stejné místo; nahrazené jiným oknem ne', () => {
  const t = load();
  t.modal.scrollTop = 840; // odkaz je v okně země dole (telefon: jede celé okno)
  t.body.scrollTop = 402; // počítač: jede jen tělo vedle fotky
  t.P.fromCountry('PT');
  assert.deepEqual([...t.log], ['sesit_country_click', 'plus_page', 'plus_offer_shown']);
  assert.equal(t.opened.length, 1);
  const [o] = t.observers;
  assert.equal(o.el, t.bg);
  o.cb(); // změna uvnitř otevřeného okna („Chci Plus“) – nic
  assert.equal(t.opened.length, 1);
  t.bg.classList.on = false; // ✕, Escape, klepnutí vedle i Zpět telefonu (histPop → modalShow(false))
  t.modal.scrollTop = 0; t.body.scrollTop = 0;
  o.cb();
  assert.equal(t.opened.at(-1), 'země PT');
  assert.equal(t.modal.scrollTop, 840);
  assert.equal(t.body.scrollTop, 402, 'na počítači tělo okna na stejném místě');
  assert.ok(o.off, 'jen jednou');

  const r = load();
  r.P.fromCountry('PT');
  r.page.isConnected = false; // okno Plus nahradilo jiné okno
  r.observers[0].cb();
  assert.equal(r.opened.length, 1);
  assert.ok(r.observers[0].off);

  const n = load();
  n.P.fromCountry(); // bez země (starší volání) – jen stránka Plus
  assert.equal(n.observers.length, 0);
  // okno země předává svou zemi
  assert.match(APP, /cs\.onclick = \(\) => Plus\.fromCountry\(iso\);/);
});

test('panel na počítači: pořadí ikon dole (order) odpovídá DOM – Tab nepřeskakuje sem a tam', () => {
  const css = read('public/css/desktop.css');
  const block = css.slice(css.indexOf('#themeToggle{order:'));
  assert.ok(css.lastIndexOf('@media (min-width:1024px){', css.indexOf('#themeToggle{order:')) > 0, 'jen v @media pro počítač');
  const order = (id) => +block.match(new RegExp(`#${id}\\{order:(\\d+)\\}`))[1];
  // about.js, transfer.js, plus.js vkládají hned za motiv (afterend) → v DOM obráceně podle pořadí skriptů;
  // Co je nového vloží app.js při startu až po načtení všech skriptů, takže je hned za motivem
  const html = read('public/index.html');
  const scripts = ['about', 'transfer', 'plus'].sort((a, b) => html.indexOf(`js/${a}.js`) - html.indexOf(`js/${b}.js`));
  const ids = { about: 'sideAbout', transfer: 'sideXfer', plus: 'sidePlus' };
  const dom = ['themeToggle', 'sideWn', ...scripts.reverse().map((s) => ids[s])];
  assert.deepEqual([...dom].sort((a, b) => order(a) - order(b)), dom);
  assert.ok(order('sidePlus') < order('sideXfer'));
});

test('tmavý motiv: tečka „navštíveno“ v legendě má obrys (jinak splyne s pozadím), u tmavé mapy Pistácie bez něj', () => {
  const css = read('public/css/letsi.css');
  assert.match(css, /:root\[data-brand="letsi"\]\[data-theme="dark"\]:not\(\[data-map="dark"\]\) \.legend \.vis-dot\{box-shadow:0 0 0 1\.5px #F3F4F0\}/);
});

test('Objevuj: „+“ v nadpisu výsledku drží pevnou mezerou u počtu (na 360 px nevisí sám na konci řádku)', () => {
  const src = read('public/js/places.js');
  const spans = src.match(/<span class="ex-head-more">[^<]*/g);
  assert.equal(spans.length, 2);
  for (const s of spans) assert.match(s, /^<span class="ex-head-more">\+&nbsp;\$\{/, s);
});
