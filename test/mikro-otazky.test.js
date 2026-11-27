// Krátké otázky na jedno klepnutí (mereni-spec oddíl 4): pomocník Count.ask v public/js/count.js přes node:vm se
// zástupným DOM (nejvýš 1 za stránku, rate, ✕, odpověď = pevný název, nic se neukládá a při zobrazení nic neposílá),
// názvy mq_* v EVENTS serveru i na stránce Statistiky (dist()), místa v aplikaci a Shrnutí v trip.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { EVENTS } from '../server/lib/counts.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

// Zástupný DOM: jen to, co Count.ask používá (strom kvůli isConnected a vložení za prvek)
function makeDoc() {
  const doc = {};
  const el = (tag) => ({
    tagName: tag, children: [], parent: null, attrs: {}, dataset: {}, style: {}, className: '', textContent: '', onclick: null,
    get isConnected() { let e = this; while (e.parent) e = e.parent; return e === doc.body; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...xs) { for (const x of xs) { if (typeof x === 'object') x.parent = this; this.children.push(x); } },
    replaceChildren(...xs) { for (const x of this.children) if (typeof x === 'object') x.parent = null; this.children = []; this.append(...xs); },
    remove() { if (!this.parent) return; this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
    insertAdjacentElement(pos, x) {
      assert.equal(pos, 'afterend');
      x.remove();
      x.parent = this.parent;
      this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, x);
      return x;
    },
  });
  doc.body = el('body');
  doc.createElement = el;
  doc.baseURI = 'https://letsi.example/app/';
  return doc;
}
const text = (e) => (typeof e === 'string' ? e : e.children.length ? e.children.map(text).join(' ') : e.textContent);
const buttons = (row) => row.children.filter((c) => c.tagName === 'button');

function loadCount(random = 0) {
  const log = { beacons: [], storage: [] };
  const document = makeDoc();
  const touch = (what) => () => { log.storage.push(what); throw new Error(`${what} nesmí být potřeba`); };
  Object.defineProperty(document, 'cookie', { get: touch('cookie'), set: touch('cookie') });
  const ctx = {
    URL, JSON, String, Array, document,
    navigator: { onLine: true, sendBeacon: (url, body) => { log.beacons.push({ url, body }); return true; } },
    Math: Object.assign(Object.create(Math), { random: () => ctx.__rnd }), __rnd: random,
  };
  for (const s of ['localStorage', 'sessionStorage', 'indexedDB']) Object.defineProperty(ctx, s, { get: touch(s) });
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/js/count.js'), ctx, { filename: 'count.js' });
  // při načtení count.js jednou zjistí volbu Pomáhat se zlepšováním (atlas_help, test/traces.test.js); bez úložiště
  // = bez souhlasu. Otázky samy na úložiště ani cookies sahat nesmí – od teď se hlídá každý přístup.
  assert.deepEqual(log.storage, ['localStorage']);
  log.storage.length = 0;
  // obsah stránky: odstavec, za který se otázka vkládá
  const host = document.createElement('div');
  document.body.append(host);
  const p = document.createElement('p');
  host.append(p);
  return { C: ctx.Count, log, ctx, document, host, p };
}
const Q = { id: 'empty', q: 'Co by ti teď pomohlo nejvíc?', rate: 0.25, opts: [['mq_empty_place', 'Jiné letiště poblíž'], ['mq_empty_dates', 'Volnější termíny'], ['mq_empty_lost', 'Nevím, co zkusit'], ['mq_empty_try', 'Jen zkouším']] };

test('Count.ask: řádek s otázkou hned za prvkem, přístupný; při zobrazení se nic neposílá', () => {
  const { C, log, host, p } = loadCount(0.1);
  const row = C.ask(p, Q);
  assert.ok(row);
  assert.equal(host.children[1], row, 'hned za odstavcem, ne okno ani toast');
  assert.deepEqual(plain([row.attrs.role, row.attrs['aria-label'], row.dataset.mq]), ['group', Q.q, 'empty']);
  assert.match(row.className, /\brow\b/);
  assert.equal(row.children[0].textContent, Q.q);
  const bs = buttons(row);
  assert.deepEqual(bs.map((b) => [b.type, b.className, b.textContent]), [...Q.opts.map(([, l]) => ['button', 'fchip', l]), ['button', 'linkbtn', '✕']]);
  assert.equal(bs.at(-1).attrs['aria-label'], 'Zavřít otázku');
  assert.deepEqual(log.beacons, [], 'zobrazení otázky se nepočítá');
  assert.deepEqual(log.storage, [], 'žádné úložiště ani cookies');
});

test('Count.ask: odpověď pošle jen pevný název volby a na místě otázky ukáže „Díky!“', () => {
  const { C, log, host, p } = loadCount(0);
  const done = [];
  const row = C.ask(p, { ...Q, done: (e, r) => done.push([e, r === row]) });
  buttons(row)[2].onclick();
  assert.deepEqual(log.beacons, [{ url: 'https://letsi.example/app/api/count', body: '{"e":"mq_empty_lost"}' }]);
  assert.equal(text(row), 'Díky!');
  assert.equal(row.children[0].attrs.role, 'status', 'čtečka oznámí poděkování (oblast z doby otázky, test/pristupnost-3)');
  assert.equal(host.children[1], row);
  assert.deepEqual(done, [['mq_empty_lost', true]]);
  assert.deepEqual(log.storage, []);
});

test('Count.ask: ✕ otázku zavře bez odeslání; nejvýš jedna otázka za načtení stránky', () => {
  const { C, log, host, p, ctx } = loadCount(0);
  const row = C.ask(p, Q);
  buttons(row).at(-1).onclick();
  assert.equal(host.children.length, 1, 'řádek je pryč');
  assert.deepEqual(log.beacons, []);
  // po ✕ ani po odpovědi se na stejné stránce už nic neptá – ani jiná otázka, ani se 100% rate
  assert.equal(C.ask(p, { ...Q, id: 'ex', rate: 1 }), null);
  assert.equal(C.ask(p, Q), null);
  const b = loadCount(0);
  buttons(b.C.ask(b.p, Q))[0].onclick();
  assert.equal(b.C.ask(b.p, { ...Q, id: 'trip', rate: 1 }), null);
  assert.equal(ctx.Count, C);
});

test('Count.ask: výběr podle rate (Math.random < rate), rate 0 se nikdy nezeptá; neukázaná otázka místo nezabere', () => {
  const { C, p, ctx } = loadCount(0.25);
  assert.equal(C.ask(p, Q), null, '0.25 není < 0.25');
  ctx.__rnd = 0;
  assert.equal(C.ask(p, { ...Q, rate: 0 }), null);
  assert.equal(C.ask(p, { ...Q, rate: undefined }), null, 'bez rate nic');
  ctx.__rnd = 0.24;
  assert.ok(C.ask(p, Q), 'losování, které nevyšlo, další otázce nebrání');
  const r = loadCount(0.999);
  assert.ok(r.C.ask(r.p, { ...Q, rate: 1 }), 'rate 1 = vždy');
});

test('Count.ask: překreslení obsahu – nezodpovězená otázka se se stejným id vrátí na nové místo, zodpovězená ne', () => {
  const { C, document, host, p } = loadCount(0);
  const row = C.ask(p, Q);
  host.replaceChildren(); // obsah se překreslil
  const p2 = document.createElement('p');
  host.append(p2);
  assert.equal(C.ask(p2, { ...Q, rate: 0 }), row, 'tatáž otázka, nelosuje se znovu');
  assert.equal(host.children[1], row);
  assert.equal(C.ask(p2, { ...Q, rate: 0 }), null, 'už je na stránce – podruhé ne');
  assert.equal(C.ask(p2, { ...Q, id: 'ex', rate: 0 }), null);
  buttons(row)[0].onclick();
  host.replaceChildren(p2);
  assert.equal(C.ask(p2, { ...Q, rate: 1 }), null, 'po odpovědi se „Díky!“ ani otázka nevrací');
  assert.equal(host.children.length, 1);
});

test('Count.ask: at – řádek jinde než hned za prvkem (na začátku bloku), i při návratu po překreslení', () => {
  const { C, host, p } = loadCount(0);
  const seen = [];
  const block = { insertAdjacentElement: (pos, x) => { seen.push(pos); host.replaceChildren(x, p); return x; } };
  const row = C.ask(block, { ...Q, at: 'afterbegin' });
  assert.deepEqual(seen, ['afterbegin']);
  assert.equal(host.children[0], row);
  assert.match(row.style.cssText, /margin:0 0 12px/, 'mezera pod řádkem, ne nad ním');
  host.replaceChildren(p);
  assert.equal(C.ask(block, { ...Q, rate: 0, at: 'afterbegin' }), row);
  assert.deepEqual(seen, ['afterbegin', 'afterbegin']);
});

test('Count.ask: bez prvku nebo s nesmyslem nic nerozbije', () => {
  const { C, p } = loadCount(0);
  for (const [el, o] of [[null, Q], [{}, Q], [p, null], [p, { ...Q, opts: null }]]) assert.doesNotThrow(() => assert.equal(C.ask(el, o), null));
});

// všechny odpovědi doslova – test a statistiky hledají přesné názvy (žádné skládání 'mq_' + id za běhu)
const ANSWERS = {
  'public/js/flights.js': ['mq_empty_place', 'mq_empty_dates', 'mq_empty_lost', 'mq_empty_try', 'mq_price_same', 'mq_price_higher', 'mq_price_gone'],
  'public/js/trip.js': ['mq_restart_date', 'mq_restart_price', 'mq_restart_lost', 'mq_restart_try', 'mq_trip_good', 'mq_trip_missing', 'mq_trip_lost'],
  'public/js/places.js': ['mq_ex_city', 'mq_ex_nature', 'mq_ex_region', 'mq_ex_other'],
  'public/js/otazky.js': ['mq_found_yes', 'mq_found_almost', 'mq_found_no', 'mq_found_price', 'mq_found_other',
    'mq_miss_stay', 'mq_miss_prog', 'mq_miss_ground', 'mq_miss_none', 'mq_miss_other',
    'mq_back_cheap', 'mq_back_plan', 'mq_back_idea', 'mq_back_try', 'mq_back_other'],
};
const ALL = Object.values(ANSWERS).flat();

test('názvy mq_*: v EVENTS serveru, každý doslova na právě jednom místě aplikace a na stránce Statistiky; žádné _shown', () => {
  assert.equal(ALL.length, 33);
  assert.deepEqual(ALL.filter((e) => !EVENTS.includes(e)), []);
  assert.deepEqual(EVENTS.filter((e) => e.startsWith('mq_')), ALL, 'v EVENTS jen odpovědi, ve stejném pořadí');
  const stats = read('public/js/statistiky.js');
  for (const [f, names] of Object.entries(ANSWERS)) {
    const src = read(f);
    for (const e of names) {
      assert.equal(src.split(`['${e}', '`).length - 1, 1, `${e} jako volba právě jednou v ${f}`);
      assert.ok(stats.includes(`'${e}'`), `${e} na stránce Statistiky`);
    }
  }
  for (const f of ['public/js/count.js', 'public/js/flights.js', 'public/js/trip.js', 'public/js/places.js', 'public/js/otazky.js', 'public/js/statistiky.js', 'server/lib/counts.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /mq_\w*shown/, `${f}: zobrazení otázky se zatím neposílá (čeká na advokáta)`);
    assert.doesNotMatch(src, /'mq_' *\+/, `${f}: název se neskládá za běhu`);
  }
});

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(read('public/js/statistiky.js'), ctx, { filename: 'statistiky.js' });
const S = ctx.window.Stats;

test('Statistiky: otázky a volby stejně jako v aplikaci', () => {
  const inApp = ALL.map((e) => { const f = Object.keys(ANSWERS).find((k) => ANSWERS[k].includes(e)); return [e, read(f).match(new RegExp(`\\['${e}', '([^']+)'\\]`))[1]]; });
  assert.deepEqual(plain(S.QUESTIONS.flatMap((q) => q.opts)), inApp);
  const asked = ['Co by ti teď pomohlo nejvíc?', 'Seděla cena u prodejce?', 'Proč začínáš znovu?', 'Pomohl ti průvodce naplánovat cestu?', 'Co jsi hledal/a?',
    'Našel jsi, co jsi hledal?', 'Co ti v průvodci nejvíc chybělo?', 'Co tě sem vrací?'];
  S.QUESTIONS.forEach((q, i) => assert.ok(q.q.endsWith(asked[i]), q.q));
});

test('dist(): rozložení odpovědí s procenty ze všech odpovědí, pod 30 „málo odpovědí“', () => {
  const [, price] = S.QUESTIONS;
  assert.deepEqual(plain(S.dist({}, price)), {
    q: price.q, answers: 0, few: true,
    options: [{ e: 'mq_price_same', label: 'Ano', n: 0, pct: null }, { e: 'mq_price_higher', label: 'Byla vyšší', n: 0, pct: null }, { e: 'mq_price_gone', label: 'Let už nebyl', n: 0, pct: null }],
  });
  const d = S.dist({ mq_price_same: 20, mq_price_higher: 9, mq_price_gone: '1', mq_trip_good: 50, x: 3 }, price);
  assert.deepEqual(plain(d.options.map((o) => [o.n, o.pct])), [[20, 67], [9, 30], [1, 3]]);
  assert.deepEqual([d.answers, d.few], [30, false]);
  assert.equal(S.dist({ mq_price_same: 29 }, price).few, true);
  assert.equal(S.dist({ mq_price_same: -5, mq_price_gone: 'x' }, price).answers, 0, 'nesmysl = 0');
  // ze součtů za období (totals) – stejně jako zbytek stránky
  const total = S.totals({ days: [{ day: '2027-01-12', counts: { mq_ex_city: 2 } }, { day: '2027-01-13', counts: { mq_ex_city: 1, mq_ex_other: 1 } }] });
  assert.deepEqual(plain(S.dist(total, S.QUESTIONS[4]).options.map((o) => o.pct)), [75, 0, 0, 25]);
});

test('Objevuj missNext(): druhé nenalezení bez úspěchu mezi nimi; dopsání písmene je tentýž pokus', () => {
  const line = read('public/js/places.js').match(/const missNext = ([^\n]+);\n/)[1];
  const missNext = new Function(`return ${line}`)();
  let m = { n: 0, text: '' };
  m = missNext(m, 'Londm');
  assert.deepEqual(m, { n: 1, text: 'Londm' });
  m = missNext(m, 'Londmn');
  assert.equal(m.n, 1, 'pořád tentýž pokus');
  m = missNext(m, 'Londm');
  assert.equal(m.n, 1, 'smazání písmene (oprava překlepu) je pořád tentýž pokus');
  m = missNext(m, 'Lodnýn');
  assert.equal(m.n, 2, 'jiný text = druhý pokus');
  assert.equal(missNext({ n: 0, text: '' }, '').n, 1);
  assert.equal(missNext({ n: 1, text: '\u0000Praha|5|' }, '\u0000Praha|50|').n, 2, 'jiný okruh = další nenalezení');
  assert.equal(missNext({ n: 1, text: '\u0000Praha|5|' }, '\u0000Praha|5|').n, 1, 'překreslení téhož prázdného okruhu ne');
});

test('místa v aplikaci: kdy a jak často se ptá (tabulka v oddílu 4)', () => {
  const F = read('public/js/flights.js'), T = read('public/js/trip.js'), P = read('public/js/places.js');
  // 1: konečný prázdný výsledek, 20 s bez nového hledání, 1 ze 4; nové hledání a odchod z aplikace časovač ruší
  assert.match(F, /function emptyAsk\(res\) \{\n {4}if \(!\(window\.Count && Count\.ask\) \|\| res\.partial \|\| emptyAskRes === res\) return;/);
  assert.match(F, /Count\.ask\(help, \{ \.\.\.EMPTY_ASK, rate: 0\.25 \}\)/);
  assert.match(F, /\}, 20000\);/);
  assert.match(F, /async function startSearch\(opts = \{\}\) \{[\s\S]{0,600}clearTimeout\(emptyAskT\);/);
  assert.match(F, /if \(document\.hidden\) clearTimeout\(emptyAskT\);/);
  assert.match(F, /host\.innerHTML = emptyState\(res\);\n {6}emptyAsk\(res\);/);
  // 2: u řádku „Koupeno?“ po návratu od prodejce, 1 ze 2 (řádek je nejvýš jednou za nabídku – boughtSeen)
  // (jen po odchodu k prodejci – ověření ceny v Google Letech není „u prodejce“)
  assert.match(F, /\$\('\[data-bought\]', row\)\.onclick = [^\n]+\n(?: {4}\/\/[^\n]*\n)+ {4}if \(b\.k === 'buy' && window\.Count && Count\.ask\) Count\.ask\(\$\('\[data-bought\]', row\), \{ id: 'price', q: 'Seděla cena u prodejce\?', rate: 0\.5,/);
  assert.match(F, /boughtAt = \{ tid: row\.dataset\.tid, r, res: shownRes \|\| lastResult, k \};/);
  // 3: po potvrzeném ↺ Začít znovu s postupem, vždy, nahoře v Letech
  // (na začátku Lety, ne za #searchSum – tam by ho překryla úvodní fotka se záporným okrajem)
  assert.match(T, /go\('flights'\);\n(?: {4}\/\/[^\n]*\n)+ {4}if \(done\.length && window\.Count && Count\.ask\) Count\.ask\(\$\('#view-flights'\), \{ id: 'restart', q: 'Proč začínáš znovu\?', rate: 1, at: 'afterbegin',/);
  // 4: první Shrnutí vlastní cesty, 1 ze 2
  assert.match(T, /if \(window\.Count && Count\.ask && !t\.shared\) Count\.ask\(\$\('#sumSupport'\), \{ \.\.\.TRIP_ASK, rate: first \? 0\.5 : 0 \}\);/);
  // 5: druhé nenalezení v Objevuj, vždy
  assert.match(P, /const EX_ASK = \{ id: 'ex', q: 'Co jsi hledal\/a\?', rate: 1,/);
  assert.match(P, /if \(exMiss\.n >= 2 && window\.Count && Count\.ask\) Count\.ask\(el, EX_ASK\);/);
  // volný text se neposílá: otázka nemá pole, jen tlačítka
  // (jen ask(): count.js jinde pole jmenuje, aby se do opakovaného klepnutí nepočítalo)
  assert.doesNotMatch(read('public/js/count.js').match(/function ask\(el, o\) \{[\s\S]*?\n  \}\n/)[0], /input|textarea|contenteditable/i);
});

// Shrnutí cesty přes zástupný DOM jako test/mam-letenku.test.js
function loadTrip(health) {
  const src = (f) => read(`public/js/${f}`);
  const c = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(c);
  vm.runInContext(src('ics.js'), c);
  vm.runInContext(src('searchhelp.js'), c);
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics, SearchHelp = window.SearchHelp;\n${helpers.join('\n')}
    var S = {}, __els = {}, __all = {}, __asks = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = (s) => __all[s] || [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']'; var toast = () => {};
    var byIso = { PT: { cs: 'Portugalsko' } }; var PACK = ['Pas']; var enc = encodeURIComponent;
    var Count = window.Count = { hit() {}, ask: (el, o) => { __asks.push([el === __els['#sumSupport'], o.id, o.rate, o]); return null; } };
    window.scrollTo = () => {};`, c);
  if (health !== undefined) c.Flights = c.window.Flights = { warm: async () => health };
  c.About = c.window.About = { okPay: () => false, mailto: (email, v, screen) => `mailto:${email}?subject=${encodeURIComponent(screen)}` };
  vm.runInContext(src('trip.js'), c);
  return c;
}
const LIS = { id: 'ap:LIS', type: 'airport', label: 'Lisabon', iata: 'LIS', cc: 'PT', lat: 38.78, lon: -9.14 };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const summary = (c) => { c.S.trip.step = 'summary'; c.window.Trip.render(); };

test('Shrnutí: otázka 4 losovaná jen při prvním Shrnutí vlastní cesty, při překreslení jen návrat (rate 0); sdílená bez otázky', async () => {
  const c = loadTrip(null);
  c.window.Trip.start(c.window.Trip.ownFlightTrip({ dest: LIS, out: day(30), back: day(33) }));
  summary(c); summary(c); summary(c);
  assert.deepEqual(plain(c.__asks.map(([at, id, rate]) => [at, id, rate])), [[true, 'trip', 0.5], [true, 'trip', 0], [true, 'trip', 0]]);
  assert.equal(c.__asks[0][3].q, 'Pomohl ti průvodce naplánovat cestu?');
  c.S.trip.created += 1; // jiná cesta: zase první Shrnutí
  summary(c);
  assert.equal(c.__asks.at(-1)[2], 0.5);
  c.S.trip.created += 1;
  c.S.trip.shared = { on: '2026-10-01' };
  const n = c.__asks.length;
  summary(c);
  assert.equal(c.__asks.length, n, 'sdílená cesta (cizí plán) se neptá');
});

test('Shrnutí: „Něco chybělo“ přidá odkaz „Napiš mi, co“ jen s FEEDBACK_EMAIL z /api/health', async () => {
  for (const [health, want] of [[{ feedback: { email: 'ahoj@letsi.example' } }, 1], [{ ok: true }, 0], [null, 0]]) {
    const c = loadTrip(health);
    c.window.Trip.start(c.window.Trip.ownFlightTrip({ dest: LIS, out: day(30), back: day(33) }));
    summary(c);
    const { done } = c.__asks[0][3];
    const html = [];
    const row = { insertAdjacentHTML: (pos, h) => html.push([pos, h]) };
    done('mq_trip_good', row);
    done('mq_trip_missing', row);
    await new Promise((r) => setImmediate(r));
    assert.equal(html.length, want, JSON.stringify(health));
    if (want) assert.deepEqual(html[0], ['beforeend', ' <a href="mailto:ahoj@letsi.example?subject=Shrnut%C3%AD%20cesty%20%E2%80%93%20co%20chyb%C4%9Blo">Napiš mi, co</a>']);
  }
});
