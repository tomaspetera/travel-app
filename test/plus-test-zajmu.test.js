// ⭐ Test zájmu o Letsi Plus přes falešné dveře (public/js/plus.js přes node:vm): tabulka Zdarma × Plus s chystanými
// věcmi, anketa „Co by ti ušetřilo nejvíc času?“ po Chci Plus, malá tlačítka „· Plus“ u věci (Naplánuj podobnou
// v Moje cesty, Uložit jako šablonu v Co sbalit) a jejich počítadla – v EVENTS serveru i ve statistikách.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EVENTS, MAX_EVENTS } from '../server/lib/counts.js';
import { TRACE_EVENTS } from '../server/lib/traces.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SRC = read('public/js/plus.js');
const plain = (v) => JSON.parse(JSON.stringify(v));
const T = '2026-11-27';

/**
 * Prvek okna bez prohlížeče: drží HTML jako text, tlačítka [data-price] / [data-time] hledá v něm a #plusPrice /
 * #plusTime nahradí poděkováním – stačí na průběh otázek v plus.js after().
 */
function fakeEl() {
  const btns = {};
  const el = {
    innerHTML: '',
    insertAdjacentHTML(_, v) { el.innerHTML += v; },
    querySelectorAll(sel) {
      const attr = /^\[data-(\w+)\]$/.exec(sel)[1];
      return [...el.innerHTML.matchAll(new RegExp(`data-${attr}="([^"]+)"`, 'g'))].map((m) => (btns[attr + m[1]] ||= { dataset: { [attr]: m[1] } }));
    },
    querySelector(sel) {
      const id = sel.slice(1), re = new RegExp(`<div class="[^"]*" id="${id}">[\\s\\S]*?</div></div>`);
      if (!re.test(el.innerHTML)) return null;
      return { set innerHTML(v) { el.innerHTML = el.innerHTML.replace(re, `<div id="${id}">${v}</div>`); } };
    },
  };
  return el;
}

/** plus.js s náhradou okna, počítadla a localStorage; log = odeslané události, modals = otevřená okna. */
function load(o = {}) {
  const log = [], modals = [], els = {}, ls = new Map(Object.entries(o.ls || {}));
  const ctx = {
    window: { Count: { hit: (e) => log.push(e) } },
    modalOpen: (html) => { modals.push(html); for (const k of Object.keys(els)) delete els[k]; },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
    document: { querySelector: (s) => (s === '#themeToggle' ? null : (els[s] ||= fakeEl())) },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [`${T}T10:00:00`])); } static now() { return Date.parse(`${T}T10:00:00`); } },
    ...(o.IntersectionObserver ? { IntersectionObserver: o.IntersectionObserver } : {}),
  };
  vm.runInNewContext(SRC, ctx);
  return { P: ctx.window.Plus, log, modals, els, ls };
}

const cells = (html, what) => {
  const m = html.match(new RegExp(`<tr><th scope="row">${what.replace(/[()]/g, '\\$&')}</th><td>(.*?)</td><td>(.*?)</td></tr>`));
  return m && [m[1], m[2]].map((c) => (/>✓</.test(c) ? '✓' : />–</.test(c) ? '–' : c));
};

test('tabulka Zdarma × Plus: chystané věci Plus, ujištění „✓ / ✓“ a bez Dokladů, na telefonu nejvýš 10 řádků', () => {
  const html = load().P.pageHtml();
  assert.deepEqual(cells(html, 'Archiv a Naplánuj podobnou'), ['–', '✓']);
  assert.deepEqual(cells(html, 'Sešit cesty s průvodcem zemí (PDF bez signálu)'), ['–', '✓']);
  assert.deepEqual(cells(html, 'Vlastní šablony balení, seznam pro každého'), ['–', '✓']);
  assert.deepEqual(cells(html, 'Celá cesta do navigace jedním souborem'), ['–', '✓']);
  assert.deepEqual(cells(html, 'Balicí seznam podle počasí'), ['✓', '✓'], 'chytrý seznam zůstává zdarma');
  assert.deepEqual(cells(html, 'Kódy rezervací'), ['✓', '✓'], 'kódy rezervací zůstávají zdarma');
  assert.deepEqual(cells(html, 'Informace o zemích a Objevuj'), ['✓', '✓']);
  // staré řádky přepsané nebo sloučené, Doklady v kapse majitel vyřadil (palubenky jsou ve Wallet)
  assert.doesNotMatch(html, /Archiv minulých cest|Sešit cesty k tisku|Průvodce zemí do Sešitu|Doklad|Varianty|Útraty/);
  assert.ok((html.match(/<tr><th scope="row">/g) || []).length <= 10, 'krátká tabulka – ✓ / ✓ řádky po dvou');
  assert.doesNotMatch(html, /Kč/, 'cena Plus až po odpovědi na cenu');
});

test('askPlan: cena první, anketa po ní nebo sama; obě nejvýš jednou za 30 dní; bez time jen cena', () => {
  const { P } = load();
  assert.deepEqual(plain(P.askPlan(null, null, T, true)), ['price', 'time']);
  assert.deepEqual(plain(P.askPlan('2026-11-20', null, T, true)), ['time'], 'na cenu se ptal nedávno');
  assert.deepEqual(plain(P.askPlan('2026-11-20', '2026-11-20', T, true)), []);
  assert.deepEqual(plain(P.askPlan('2026-10-01', '2026-11-20', T, true)), ['price'], 'po 30 dnech zase cena');
  assert.deepEqual(plain(P.askPlan(null, null, T, false)), ['price'], 'Sešit a tlačítka · Plus: anketa jen po Chci Plus');
});

test('Chci Plus: otázka na cenu, po odpovědi anketa o čase (jen klepnutá volba se počítá), další den ani jedna', () => {
  const { P, log, els, ls } = load();
  P.open();
  els['#plusWant'].onclick();
  const box = els['#plusAfter'];
  assert.match(box.innerHTML, /Kolik by ti Plus stálo za rok\?/);
  assert.doesNotMatch(box.innerHTML, /plusTime/, 'dvě otázky naráz ne – anketa až po ceně');
  box.querySelectorAll('[data-price]').find((b) => b.dataset.price === '399').onclick();
  assert.match(box.innerHTML, /Plánujeme kolem 399 Kč/, 'cena až po odpovědi');
  assert.match(box.innerHTML, /<b>Co by ti ušetřilo nejvíc času\?<\/b>/);
  const opts = box.querySelectorAll('[data-time]');
  assert.deepEqual(opts.map((b) => b.dataset.time), ['plus_q_similar', 'plus_q_sesit', 'plus_q_pack', 'plus_q_nav', 'plus_q_variants', 'plus_q_split']);
  for (const l of ['Naplánuj podobnou', 'Sešit s průvodcem zemí', 'Balicí šablony', 'Celá cesta do navigace', 'Varianty vedle sebe', 'Útraty party']) assert.match(box.innerHTML, new RegExp(`>${l}</button>`));
  assert.doesNotMatch(box.innerHTML, /Doklad/);
  opts[2].onclick();
  assert.deepEqual([...log], ['plus_page', 'plus_offer_shown', 'plus_offer_click', 'price_399', 'plus_q_pack']);
  assert.match(box.innerHTML, /Díky, podle toho vybereme/);
  assert.deepEqual([...ls.keys()].sort(), ['atlas_price_q', 'atlas_time_q'], 'do prohlížeče jen den otázek');
  assert.ok([...ls.values()].every((v) => v === T), 'žádný identifikátor');
  P.open(); els['#plusWant'].onclick();
  assert.doesNotMatch(els['#plusAfter'].innerHTML, /plusPrice|plusTime/, 'týž den podruhé bez otázek');
});

test('anketa sama, když se na cenu tentokrát neptáme; Sešit cesty anketu nemá', () => {
  const a = load({ ls: { atlas_price_q: '2026-11-20' } });
  a.P.open(); a.els['#plusWant'].onclick();
  assert.doesNotMatch(a.els['#plusAfter'].innerHTML, /plusPrice/);
  assert.match(a.els['#plusAfter'].innerHTML, /id="plusTime"/);
  const b = load();
  b.P.sesit({ name: 'Řím', dest: 'Řím', start: '2027-03-10', end: '2027-03-14', days: {} });
  b.els['#sesitWant'].onclick();
  assert.match(b.els['#plusAfter'].innerHTML, /id="plusPrice"/);
  b.els['#plusAfter'].querySelectorAll('[data-price]')[0].onclick();
  assert.doesNotMatch(b.els['#plusAfter'].innerHTML, /plusTime/);
});

test('similarOk: vlastní uložená cesta s termínem mimo cestu – ne od jiného, ne rozpracovaná, ne během cesty', () => {
  const { P } = load();
  const past = { name: 'Řím', dest: 'Řím', start: '2026-05-01', end: '2026-05-05' };
  assert.equal(P.similarOk(past, T), true, 'minulá cesta');
  assert.equal(P.similarOk({ ...past, start: '2027-03-01', end: '2027-03-05' }, T), true, 'uložená budoucí cesta');
  assert.equal(P.similarOk({ ...past, start: '2026-11-25', end: '2026-11-30' }, T), false, 'Dnes na cestě – bez Plus');
  assert.equal(P.similarOk({ ...past, start: T, end: '' }, T), false, 'jednodenní cesta dnes');
  assert.equal(P.similarOk({ ...past, sid: 'a', gotVer: 'x' }, T), false, 'cesta, kterou někdo poslal');
  assert.equal(P.similarOk({ ...past, sid: 'a', sharedSnap: {}, sentSnaps: { v: {} } }, T), true, 'moje cesta, kterou jsem sdílel');
  assert.equal(P.similarOk({ ...past, tripId: 1, auto: true }, T), false, 'sama uložená rozpracovaná z průvodce');
  assert.equal(P.similarOk({ ...past, start: '', end: '' }, T), false, 'bez termínu není co posunout');
  assert.equal(P.similarOk(null, T), false);
});

test('tlačítka · Plus: zobrazení až na obrazovce a jednou za věc, klepnutí neotevře kartu a ukáže „Chystáme na jaro“ bez ceny', () => {
  const ios = [];
  class IntersectionObserver {
    constructor(cb) { this.cb = cb; ios.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.off = true; }
  }
  const { P, log, modals, els } = load({ IntersectionObserver });
  assert.equal(P.soonBtn('similar', 'Řím|2026-05-01'), '<button type="button" class="linkbtn plus-soon" data-plus-soon="similar" data-plus-key="Řím|2026-05-01">Naplánuj podobnou · Plus</button>');
  assert.match(P.soonBtn('pack', 'k'), />Uložit jako šablonu · Plus<\/button>$/);
  const btn = (kind, key) => ({ dataset: { plusSoon: kind, plusKey: key } });
  const a = btn('similar', 'r1'), b = btn('similar', 'r1'), c = btn('pack', 'r1');
  const root = (list) => ({ querySelectorAll: (s) => (s === '[data-plus-soon]' ? list : []) });
  P.watchSoon(root([a, c]));
  P.watchSoon(root([a])); // překreslení bez nového tlačítka – už zapojené se nepozoruje znovu
  assert.equal(ios.length, 2);
  ios[0].cb([{ isIntersecting: false }]);
  assert.deepEqual([...log], [], 've sbalených Proběhlých cestách nebo pod okrajem se nepočítá');
  ios[0].cb([{ isIntersecting: true }]); ios[1].cb([{ isIntersecting: true }]);
  P.watchSoon(root([b])); // táž cesta po překreslení Mých cest
  assert.deepEqual([...log], ['plus_similar_shown', 'plus_pack_shown'], 'jednou za načtení pro věc');
  assert.equal(ios.length, 2, 'už započítaná věc se nepozoruje');
  let stopped = false;
  b.onclick({ stopPropagation: () => { stopped = true; } });
  assert.ok(stopped, 'karta cesty se klepnutím na tlačítko neotevře');
  assert.equal(log.at(-1), 'plus_similar_click');
  assert.match(modals.at(-1), /<h3>Naplánuj podobnou<\/h3>/);
  assert.match(els['#plusAfter'].innerHTML, /Chystáme na jaro do Letsi Plus/);
  assert.match(els['#plusAfter'].innerHTML, /Kolik by ti Plus stálo za rok/, 'otázka na cenu jako u Sešitu');
  assert.doesNotMatch(modals.at(-1) + els['#plusAfter'].innerHTML, /Plánujeme kolem/, 'plánovaná cena až po odpovědi (priceNote)');
  c.onclick({ stopPropagation() {} });
  assert.equal(log.at(-1), 'plus_pack_click');
  assert.match(modals.at(-1), /Moje balicí seznamy/);
});

test('háčky: Naplánuj podobnou v Moje cesty mimo cestu otevřenou v průvodci, šablona v Co sbalit ne u poslané cesty, Dnes na cestě bez Plus', () => {
  const app = read('public/js/app.js'), pre = read('public/js/pretrip.js'), trip = read('public/js/trip.js');
  assert.match(app, /const sim = x => \(window\.Plus && x !== cur && Plus\.similarOk\(x\.t, now\) \? Plus\.soonBtn\('similar', Plus\.tripKey\(x\.t\)\) : ''\);/);
  assert.match(app, /if \(window\.Plus\) Plus\.watchSoon\(host\);/);
  assert.match(app, /const nm = \$\('\[data-mdet\],\[data-plus-soon\]', el\)/, 'karta s tlačítkem není sama tlačítkem (čtečka)');
  const now = app.slice(app.indexOf('function renderNow'), app.indexOf('\n}\n', app.indexOf('function renderNow')));
  assert.ok(now.length > 0 && !/Plus\./.test(now), 'karta Dnes na cestě bez Plus');
  assert.match(pre, /const soonHtml = window\.Plus && !t\.shared \? `<p class="pt-soon">\$\{Plus\.soonBtn\('pack', key\)\}<\/p>` : '';/);
  assert.match(pre, /\$\{addHtml\}\$\{soonHtml\}<\/section>/, 'pod seznamem Co sbalit');
  assert.match(pre, /if \(window\.Plus\) Plus\.watchSoon\(document\.getElementById\('preTrip'\)\);/, 'i po překreslení karty');
  assert.match(trip, /if \(window\.Plus && Plus\.watchSoon\) Plus\.watchSoon\(host\);/);
  // Co sbalit je ve Shrnutí jen u cesty, která ještě nezačala (ne během cesty, ne po ní)
  assert.match(trip, /\$\{window\.PreTrip && !past && !onTrip \? PreTrip\.html\(/);
});

test('počítadla: 10 nových událostí v EVENTS pod stropem, statistiky je ukážou, do záznamu návštěvy nejdou', () => {
  const { P } = load();
  const soon = ['plus_similar_shown', 'plus_similar_click', 'plus_pack_shown', 'plus_pack_click'];
  const all = [...P.TIME.map(([e]) => e), ...soon];
  for (const e of all) assert.ok(EVENTS.includes(e), e);
  assert.ok(EVENTS.length <= MAX_EVENTS, `${EVENTS.length} z ${MAX_EVENTS}`);
  assert.ok(all.every((e) => !TRACE_EVENTS.includes(e)), 'ochota platit do záznamu návštěvy nesmí');
  const ctx = { window: {} };
  vm.runInNewContext(read('public/js/statistiky.js'), ctx);
  const S = ctx.window.Stats;
  assert.deepEqual(plain(S.TIME_Q.opts), plain(P.TIME), 'statistiky mají stejné znění voleb jako aplikace');
  assert.equal(S.TIME_Q.q, 'Co by ti ušetřilo nejvíc času?');
  const d = plain(S.doors({ plus_similar_shown: 50, plus_similar_click: 2, plus_pack_shown: 10, plus_pack_click: 1 }));
  assert.deepEqual(d.filter((x) => x.label.includes('podobnou') || x.label.includes('šablonu')).map((x) => [x.shown, x.clicks[0].n, x.clicks[0].pct]), [[50, 2, 4], [10, 1, 10]]);
  const q = plain(S.dist({ plus_q_pack: 3, plus_q_nav: 1 }, S.TIME_Q));
  assert.equal(q.answers, 4);
  assert.equal(q.options.find((o) => o.e === 'plus_q_pack').pct, 75);
});
