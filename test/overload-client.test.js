// Aplikace u přetíženého serveru (503 „ATLAS teď hledá pro hodně lidí najednou“, 429 s Retry-After, 502–504 z Renderu):
// sama nic nepřidává – kontrola hlídaných cen skončí po prvním odmítnutí (dřív až 12 hledání za sebou, všechna
// odmítnutá), radar po návratu do aplikace do Retry-After nehledá a nechá starší ceny, „Zkusit znovu“ odpočítává,
// fotky stejné karty se neptají dvakrát a po odmítnutí chvíli vůbec. Hlášky česky, nikdy „HTTP 503“.
// Skutečné funkce z public/js v node:vm (flights.js a app.js potřebují DOM – jen vybrané kusy podle jména).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const FLIGHTS = src('flights.js'), APP = src('app.js');
/** Kus zdrojáku od začátku do konce (regulární výraz s ^ a $ po řádcích). */
const cut = (s, re, what) => { const m = s.match(re); assert.ok(m, what); return m[0]; };

function loadPwa() {
  const ctx = { window: {}, URL, console, setTimeout, clearTimeout, AbortController, AbortSignal };
  vm.createContext(ctx);
  vm.runInContext(src('pwa.js'), ctx, { filename: 'pwa.js' });
  return ctx.window.Pwa;
}
const res = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': typeof body === 'string' ? 'text/html' : 'application/json', ...headers } });
const BUSY = 'ATLAS teď hledá pro hodně lidí najednou – zkus to prosím za minutu.';

test('Pwa.retryAfterS: sekundy i datum HTTP, nesmysl a minulost → null, nejvýš hodina', () => {
  const P = loadPwa(), now = Date.parse('2026-10-24T10:00:00Z');
  assert.equal(P.retryAfterS('60', now), 60);
  assert.equal(P.retryAfterS(' 30 ', now), 30);
  assert.equal(P.retryAfterS('Sat, 24 Oct 2026 10:01:30 GMT', now), 90);
  assert.equal(P.retryAfterS('Sat, 24 Oct 2026 09:59:00 GMT', now), null, 'datum v minulosti');
  for (const v of [null, undefined, '', '0', '-5', 'zítra', '1.5']) assert.equal(P.retryAfterS(v, now), null, String(v));
  assert.equal(P.retryAfterS('86400', now), 3600);
});

test('Pwa.httpError: hláška serveru, jinak česky podle kódu (nikdy „HTTP 503“); přetížení s časem dalšího pokusu', async () => {
  const P = loadPwa(), now = 1e12;
  const busy = await P.httpError(res(503, { error: BUSY }, { 'retry-after': '60' }), now);
  assert.equal(busy.message, BUSY);
  assert.deepEqual([busy.status, busy.busy, busy.until], [503, true, now + 60e3]);
  const many = await P.httpError(res(429, { error: 'Z tvého připojení teď běží moc hledání naráz…' }, { 'retry-after': '30' }), now);
  assert.deepEqual([many.busy, many.until], [true, now + 30e3]);
  // Render při probouzení / přetížení: HTML bez Retry-After → česky a aspoň 30 s pauza pro automatická hledání
  const proxy = await P.httpError(res(502, '<html><body>Bad Gateway</body></html>'), now);
  assert.match(proxy.message, /probouzí nebo je přetížený/);
  assert.deepEqual([proxy.busy, proxy.until], [true, now + 30e3]);
  const bug = await P.httpError(res(500, '<h1>Internal Server Error</h1>'), now);
  assert.equal(bug.message, 'Na serveru se něco pokazilo – zkus to prosím za chvíli znovu.');
  assert.deepEqual([bug.busy, bug.until], [false, undefined], 'chyba v kódu není přetížení – bez odkladu');
  const bad = await P.httpError(res(400, { error: 'Neplatný JSON' }), now);
  assert.deepEqual([bad.message, bad.busy], ['Neplatný JSON', false]);
  for (const s of [400, 404, 429, 500, 502, 503, 504]) assert.doesNotMatch(P.statusMsg(s), /HTTP|\d{3}|[A-Z]{2,}/, String(s));
  assert.equal(P.waitTxt(58_200), 'za 59 s');
  assert.equal(P.waitTxt(400), 'za 1 s');
  assert.equal(P.waitTxt(600e3), 'za 10 min');
});

/* ---------- flights.js: hledání a odklad po odmítnutí ---------- */
function loadSearch(fetchImpl) {
  const code = [
    cut(FLIGHTS, /^ {2}async function httpErr\(r\) \{[\s\S]*?^ {2}function retryTick\(b\) \{[\s\S]*?^ {2}\}$/m, 'flights.js: httpErr … retryTick'),
    cut(FLIGHTS, /^ {2}async function runSearch\([\s\S]*?^ {2}\}$/m, 'flights.js: runSearch'),
    'globalThis.T = { runSearch, overloadNow, retryBtn, retryTick };',
  ].join('\n');
  const timers = [];
  const ctx = { window: {}, fetch: fetchImpl, TextDecoder, JSON, Date, Math, setInterval: (f) => { timers.push(f); return timers.length; }, clearInterval: (id) => { timers[id - 1] = null; } };
  ctx.window.Pwa = loadPwa();
  ctx.Pwa = ctx.window.Pwa;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'flights-search.js' });
  return { T: ctx.T, timers, ctx };
}
const ndjson = (lines) => new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { status: 200 });

test('hledání odmítnuté přetíženým serverem: česká hláška, odklad do Retry-After; úspěšné hledání ho zruší', async () => {
  const answers = [res(503, { error: BUSY }, { 'retry-after': '60' }), ndjson([{ type: 'result', result: { groups: [] } }])];
  const { T } = loadSearch(async () => answers.shift());
  const t0 = Date.now();
  await assert.rejects(T.runSearch({ from: ['ap:PRG'] }), (e) => e.message === BUSY && e.busy && e.until >= t0 + 60e3);
  const ov = T.overloadNow();
  assert.ok(ov && ov.message === BUSY && ov.until >= t0 + 60e3, 'radar a kontrola hlídaných cen teď samy nehledají');
  assert.deepEqual(await T.runSearch({ from: ['ap:PRG'] }), { groups: [] });
  assert.equal(T.overloadNow(), null, 'server hledání přijal → zase normálně');
});

test('hledání: chyba v kódu serveru (500) ani výpadek spojení odklad nespustí; 4xx bez textu bez „HTTP 400“', async () => {
  const { T } = loadSearch(async () => res(500, '<h1>Internal Server Error</h1>'));
  await assert.rejects(T.runSearch({}), /Na serveru se něco pokazilo/);
  assert.equal(T.overloadNow(), null);
  const { T: T2 } = loadSearch(async () => res(400, ''));
  await assert.rejects(T2.runSearch({}), (e) => !/HTTP/.test(e.message));
});

test('↻ Zkusit znovu: do Retry-After neaktivní s odpočtem, pak klepnutím znovu; bez času hned', () => {
  const { T, timers } = loadSearch(async () => null);
  assert.equal(T.retryBtn('searchRetry', undefined), '<button type="button" class="btn sm" id="searchRetry">↻ Zkusit znovu</button>');
  assert.equal(T.retryBtn('x', Date.now() - 5), '<button type="button" class="btn sm" id="x">↻ Zkusit znovu</button>', 'čas už minul');
  const until = Date.now() + 45_500;
  const h = T.retryBtn('radarRetry', until);
  assert.match(h, new RegExp(`^<button type="button" class="btn sm" id="radarRetry" disabled data-until="${until}">↻ Zkusit znovu za 4[56] s</button>$`));
  const b = { isConnected: true, disabled: true, dataset: { until: String(Date.now() + 2000) }, textContent: '' };
  T.retryTick(b);
  timers[0]();
  assert.match(b.textContent, /^↻ Zkusit znovu za [12] s$/);
  assert.equal(b.disabled, true);
  b.dataset.until = String(Date.now() - 1);
  timers[0]();
  assert.deepEqual([b.disabled, b.textContent, b.dataset.until], [false, '↻ Zkusit znovu', undefined]);
  assert.equal(timers[0], null, 'odpočet skončil');
  const gone = { isConnected: false, dataset: { until: String(Date.now() + 9e3) } };
  T.retryTick(gone);
  timers[1]();
  assert.equal(timers[1], null, 'tlačítko pryč (překreslení) → odpočet skončí');
});

test('flights.js: hledání v Letech i radar ukážou ↻ s odpočtem; radar a kontrola hlídaných cen během odkladu samy nehledají', () => {
  assert.match(FLIGHTS, /\$\{retryBtn\('searchRetry', e\.until\)\}<\/div>`;\n\s*retryTick\(\$\('#searchRetry'\)\);[^\n]*\n\s*\$\('#searchRetry'\)\.onclick = \(\) => startSearch\(\);/);
  // radar bez vynucení (návrat do aplikace, Přehled, jiný režim): během odkladu bez hledání – starší ceny s ↻
  assert.match(FLIGHTS, /const ov = !force && !radarJobs\[key\] && overloadNow\(\);\n\s*if \(ov\) return radarFail\(q, old, ov\);\n\s*if \(old\) paintRadar\(old, q, \{ busy: true \}\);/);
  assert.match(FLIGHTS, /if \(old\) return paintRadar\(old, q, \{ error: e\.message, until: e\.until \}\);/);
  assert.match(FLIGHTS, /\$\{retryBtn\('radarRetry', st\.until\)\}/);
  // kontrola hlídaných cen: počká na konec odkladu, po odmítnutí / výpadku cyklus skončí
  assert.match(FLIGHTS, /canRun: \(\) => !document\.hidden && !busySearches && !overloadNow\(\),/);
  assert.match(FLIGHTS, /else if \(e\.busy \|\| e\.status >= 500 \|\| e\.name === 'NetworkError' \|\| e\.name === 'AbortError'\) return 'stop';/);
  // „Zkontrolovat vše“: po prvním odmítnutí se čekající kontroly nepošlou
  assert.match(FLIGHTS, /const ov = overloadNow\(\);\n\s*if \(ov && ov\.at >= asked\) return;\n\s*return checkOne\(id, false\);/);
  // našeptávač: chybová odpověď není „Nic nenalezeno“
  assert.match(FLIGHTS, /\{ signal \}\);\n\s*\/\/[^\n]*\n\s*if \(!r\.ok\) throw await httpErr\(r\);\n\s*const j = await r\.json\(\), items = j\.items \|\| \[\];/);
  // stav serveru po výpadku: znovu s náhodnou odchylkou (ne všichni ve stejnou vteřinu)
  assert.match(FLIGHTS, /setTimeout\(go, Math\.round\(wait \* \(0\.8 \+ Math\.random\(\) \* 0\.4\)\)\)/);
});

test('trip.js, ground.js: chybová odpověď bez textu serveru česky (ne „HTTP 503“, ne „Unexpected token“)', () => {
  for (const f of ['trip.js', 'ground.js', 'places.js', 'flights.js']) {
    assert.doesNotMatch(src(f), /new Error\([^;]*HTTP \$\{/, `${f}: žádné „HTTP 503“ do hlášky`);
  }
  const TRIP = src('trip.js');
  // ověření ceny a auta: HTML místo JSON (Render) nespadne na „Unexpected token“
  assert.equal((TRIP.match(/const j = await r\.json\(\)\.catch\(\(\) => null\);\n\s*if \(!r\.ok \|\| !j\) throw apiErr\(r, j\);/g) || []).length, 2);
  const pwa = loadPwa();
  const apiErr = vm.runInNewContext(`${cut(TRIP, /^ {2}const apiErr = [\s\S]*?\)\);$/m, 'trip.js: apiErr').trim()} apiErr`, { window: { Pwa: pwa }, Pwa: pwa, Error });
  assert.match(apiErr({ ok: false, status: 503 }, null).message, /probouzí nebo je přetížený/);
  assert.equal(apiErr({ ok: false, status: 429 }, { error: 'Příliš mnoho ověření ceny – zkus to za pár minut.' }).message, 'Příliš mnoho ověření ceny – zkus to za pár minut.');
  assert.equal(apiErr({ ok: true, status: 200 }, null).message, 'Server poslal neúplnou odpověď – zkus to znovu.');
  assert.match(vm.runInNewContext(`${cut(TRIP, /^ {2}const apiErr = [\s\S]*?\)\);$/m, 'trip.js: apiErr').trim()} apiErr`, { window: {}, Error })({ ok: false, status: 504 }, {}).message, /zkus to za chvíli/, 'i bez pwa.js');
});

/* ---------- app.js: fotky na kartách ---------- */
function loadPhotos(fetchImpl) {
  const code = `${cut(APP, /^const Photos = \(\(\) => \{[\s\S]*?^\}\)\(\);$/m, 'app.js: Photos')}\nglobalThis.Photos = Photos;`;
  const store = {};
  const ctx = {
    window: { Pwa: loadPwa(), devicePixelRatio: 1 },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { addEventListener() {} },
    fetch: fetchImpl, enc: encodeURIComponent, esc: (s) => String(s), JSON, Date, Object, Promise, setTimeout, clearTimeout,
    Image: class { set src(v) { this._s = v; } },
  };
  ctx.$$ = (sel, root) => root.els;
  ctx.Pwa = ctx.window.Pwa;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'photos.js' });
  return ctx.Photos;
}
const card = (t) => ({ dataset: { photo: t }, isConnected: true, clientWidth: 300, clientHeight: 200, classList: { contains: () => false, add() {} }, style: { setProperty() {} }, querySelector: () => null, append() {} });
const until = async (cond) => { for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 10)); return cond(); };

test('fotky: karty překreslené během dotazu se neptají znovu; po odmítnutí (429) se chvíli neptá vůbec', async () => {
  const asked = [];
  let answer = null;
  const P = loadPhotos(async (u) => { asked.push(decodeURIComponent(u.split('t=')[1])); return new Promise((r) => { answer = r; }); });
  P.paint({ els: [card('Řím'), card('Londýn')] });
  await until(() => asked.length === 1);
  // radar / hlídané ceny se překreslily dřív, než fotky přišly: tytéž názvy znovu → bez dalšího dotazu, jen nový navíc
  P.paint({ els: [card('Řím'), card('Paříž')] });
  await until(() => asked.length === 2);
  assert.deepEqual(asked, ['Řím|Londýn', 'Paříž']);
  answer(res(200, { prov: 'wiki', photos: { 'Řím': 'https://upload.wikimedia.org/x/960px-rim.jpg', 'Londýn': '' } }));

  // limit fotek z adresy (429 s Retry-After): karty bez fotek, další dotazy až po odkladu
  const asked2 = [];
  const P2 = loadPhotos(async (u) => { asked2.push(u); return res(429, { error: 'Příliš mnoho fotek najednou – zkus to za pár minut.' }, { 'retry-after': '300' }); });
  P2.paint({ els: [card('Řím')] });
  await until(() => asked2.length === 1);
  await new Promise((r) => setTimeout(r, 120));
  P2.paint({ els: [card('Řím'), card('Tirana')] });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(asked2.length, 1, 'během odkladu žádný další dotaz');
});
