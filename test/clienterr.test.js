// Hlášení chyb z prohlížeče: klient public/js/errlog.js (obsah hlášení, ořez, brzda) přes node:vm, server
// server/lib/clienterr.js (validace, ořez, log) a /api/client-error s limitem na adresu a počtem v /api/health.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { cleanReport, recordClientError, recentClientErrors, clientErrorCount, stripUrl, LOG_PER_HOUR } = await import('../server/lib/clienterr.js');

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function loadErrLog() {
  const ctx = { window: {}, URL, console, TextEncoder };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../public/js/errlog.js', import.meta.url), 'utf8'), ctx, { filename: 'errlog.js' });
  return ctx.window.ErrLog;
}
const O = 'https://atlas-letenky.onrender.com';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36';

test('errlog.js: zpráva, soubor:řádek bez query/hash, verze a zkrácený prohlížeč', () => {
  const E = loadErrLog();
  const r = E.makeReport({ type: 'error', message: 'TypeError: x is undefined', filename: `${O}/js/app.js?v=3#planner`, lineno: 120, colno: 7, error: new TypeError('x') }, { origin: O, build: 'abc123', ua: UA });
  assert.deepEqual({ ...r }, { kind: 'error', msg: 'TypeError: x is undefined', src: 'js/app.js:120:7', build: 'abc123', ua: 'Chrome 130 · Android 14' });
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  assert.equal(E.shortUa(iphone), 'Safari 17 · iOS 17.5');
  // odmítnutý Promise: místo ze zásobníku
  const err = new Error('nelze načíst');
  err.stack = `Error: nelze načíst\n    at load (${O}/js/trip.js?x=1:55:12)\n    at ${O}/js/app.js:1:1`;
  const rj = E.makeReport({ type: 'unhandledrejection', reason: err }, { origin: O, build: 'b', ua: UA });
  assert.equal(rj.kind, 'rejection');
  assert.equal(rj.msg, 'Error: nelze načíst');
  assert.equal(rj.src, 'js/trip.js:55:12');
  assert.equal(E.makeReport({ type: 'unhandledrejection', reason: 'jen text' }, {}).msg, 'jen text');
});

test('errlog.js: bez osobních údajů, rozšíření a „Script error.“ se nehlásí, nejvýš 2 KB', () => {
  const E = loadErrLog();
  const r = E.makeReport({ type: 'error', message: `Chyba pro jan.novak@example.cz tel. +420 777 123 456 na ${O}/?from=PRG&to=BCN#trip=abc`, filename: `${O}/js/app.js`, lineno: 1 }, { origin: O });
  assert.doesNotMatch(r.msg, /novak|777|PRG|trip=/);
  assert.match(r.msg, /\[e-mail\].*\[číslo\]/);
  for (const f of ['chrome-extension://abcdef/content.js', 'moz-extension://x/a.js', 'safari-web-extension://x/a.js']) {
    assert.equal(E.makeReport({ type: 'error', message: 'boom', filename: f, lineno: 3 }, { origin: O }), null, f);
  }
  const ext = new Error('boom');
  ext.stack = 'Error: boom\n    at chrome-extension://abc/inject.js:1:2';
  assert.equal(E.makeReport({ type: 'unhandledrejection', reason: ext }, {}), null, 'rozšíření i u odmítnutí');
  assert.equal(E.makeReport({ type: 'error', message: 'Script error.', filename: '', lineno: 0 }, {}), null);
  const big = E.makeReport({ type: 'error', message: 'ž'.repeat(5000), filename: `${O}/js/app.js`, lineno: 1 }, { origin: O, ua: UA });
  assert.ok(Buffer.byteLength(JSON.stringify(big)) <= E.MAX_BYTES);
  assert.ok(big.msg.length > 100);
});

test('errlog.js: nejvýš 1 hlášení za 10 s a 20 za relaci', () => {
  const allow = loadErrLog().limiter();
  assert.equal(allow(0), true);
  assert.equal(allow(5e3), false, 'do 10 s ne');
  assert.equal(allow(10e3), true);
  let ok = 2;
  for (let t = 20e3; t < 1e6; t += 10e3) if (allow(t)) ok++;
  assert.equal(ok, 20);
});

test('clienterr.js: validace, ořez délky, řídicí znaky a query/hash pryč, rozšíření ignoruje', () => {
  assert.equal(cleanReport(null), null);
  assert.equal(cleanReport([]), null);
  assert.equal(cleanReport({ msg: 5 }), null);
  assert.equal(cleanReport({ msg: '   ' }), null);
  assert.equal(cleanReport({ msg: 'x', src: 'chrome-extension://a/b.js:1:1' }), null);
  const LS = String.fromCharCode(0x2028); // oddělovač řádku z Unicode
  const r = cleanReport({ kind: 'jiné', msg: `a\nFalešný řádek\r${LS}${'x'.repeat(900)}`, src: 'https://a.cz/js/app.js?q=1#h:12:3', build: 'v1<script>', ua: 'Chrome 130', extra: 'pryč' });
  assert.ok(![...'\n\r', LS].some((c) => r.msg.includes(c)), 'bez konců řádku');
  const old = cleanReport({ msg: `a\nFalešný řádek\r ${'x'.repeat(900)}`, src: 'https://a.cz/js/app.js?q=1#h:12:3', build: 'v1<script>', ua: 'Chrome 130', extra: 'pryč' });
  assert.equal(r.kind, 'error');
  assert.ok(!/[\n\r]/.test(old.msg) && !old.msg.includes(` `), 'doslovný oddělovač řádku v textu');
  assert.equal(r.msg.length, 500);
  assert.equal(r.src, 'https://a.cz/js/app.js:12:3');
  assert.equal(r.build, '', 'neplatná verze');
  assert.equal(r.extra, undefined);
  assert.equal(stripUrl('na https://x.cz/a?from=PRG#trip a /b?c=d'), 'na https://x.cz/a a /b');
  const before = recentClientErrors().length;
  for (let i = 0; i < 60; i++) recordClientError({ kind: 'error', msg: `m${i}`, src: '', build: '', ua: '' });
  const list = recentClientErrors();
  assert.equal(list.length, 50, `v paměti nejvýš 50 (před: ${before})`);
  assert.equal(list.at(-1).msg, 'm59');
  assert.match(recordClientError({ kind: 'rejection', msg: 'boom', src: 'js/app.js:1:2', build: 'b1', ua: 'Chrome 130' }), /^Chyba v prohlížeči \(rejection\): boom @ js\/app\.js:1:2 \[b1\] Chrome 130$/);
});

test('POST /api/client-error: 204, log, počet v /api/health, limit 30 za hodinu, jen POST', async () => {
  const count = async () => (await (await fetch(`${base}/api/health`)).json()).clientErrors;
  const post = (body) => fetch(`${base}/api/client-error`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const warn = console.warn;
  const logged = [];
  console.warn = (...a) => logged.push(a.join(' '));
  try {
    const n0 = await count();
    assert.equal(typeof n0, 'number');
    const r = await post(JSON.stringify({ kind: 'error', msg: 'TypeError: boom', src: 'js/app.js:1:2', build: 'b1', ua: 'Chrome 130' }));
    assert.equal(r.status, 204);
    assert.equal(await count(), n0 + 1);
    assert.equal(logged.filter((l) => l.includes('TypeError: boom')).length, 1);
    assert.equal((await post('{nejson')).status, 400);
    assert.equal((await post(JSON.stringify({ msg: 'x', src: 'moz-extension://a/b.js' }))).status, 204);
    assert.equal(await count(), n0 + 1, 'rozšíření ani neplatné se nepočítá');
    await post(JSON.stringify({ msg: 'x'.repeat(5000) })).catch(() => null); // přes 4 KB: odmítnuto (spojení se zavře)
    assert.equal(await count(), n0 + 1, 'velké tělo se nepočítá');
    assert.equal((await fetch(`${base}/api/client-error`)).status, 405);
    let last;
    for (let i = 0; i < 30; i++) last = await post(JSON.stringify({ msg: `chyba ${i}` }));
    assert.equal(last.status, 429, 'víc než 30 za hodinu z jedné adresy');
  } finally {
    console.warn = warn;
  }
});

test('clienterr.js: nejvýš LOG_PER_HOUR řádků v logu za hodinu ze všech adres (podvržená X-Forwarded-For limit na adresu obejde)', () => {
  const r = { kind: 'error', msg: 'záplava', src: '', build: '', ua: '' };
  const h = new Date(Date.now() + 5 * 3600e3); // nová hodina – nezávisle na hlášeních z předchozích testů
  const n0 = clientErrorCount();
  for (let i = 0; i < LOG_PER_HOUR; i++) assert.ok(recordClientError(r, new Date(h.getTime() + i)), `řádek ${i + 1}`);
  assert.equal(recordClientError(r, new Date(h.getTime() + 60e3)), null, 'nad stropem už do logu ne');
  assert.equal(recentClientErrors().at(-1).at, new Date(h.getTime() + LOG_PER_HOUR - 1).toISOString(), 'ani do paměti');
  assert.equal(clientErrorCount(), n0 + LOG_PER_HOUR + 1, 'v /api/health se počítá i to nad stropem');
  assert.ok(recordClientError(r, new Date(h.getTime() + 3600e3)), 'další hodinu zase');
});
