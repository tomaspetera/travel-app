// Pozvánka „Jede někdo se mnou?“ odkazem /j/<data> (server/lib/shortlinks.js inviteMeta, invitePage; aplikace
// sharecard.js pathUrl): data karty jsou v adrese stejná jako dřív za #jed=, jen je vidí server – WhatsApp a Messenger
// ukážou náhled s otázkou, cílem, měsícem a fotkou cíle, prohlížeč server hned pošle do aplikace na /#jed=<data>.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { inviteMeta, invitePage, INVITE_RE } = await import('../server/lib/shortlinks.js');

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const ctx = { window: {}, TextEncoder, TextDecoder, btoa, atob, CompressionStream, DecompressionStream, location: { origin: 'https://atlas.example', pathname: '/' }, navigator: {} };
vm.createContext(ctx);
for (const f of ['sharelink.js', 'sharecard.js']) vm.runInContext(src(f), ctx, { filename: f });
ctx.ShareLink = ctx.window.ShareLink;
const { ShareCard: C, ShareLink: L } = ctx.window;

const CARD = { d: 'Madeira', cc: 'PT', id: 'ap:FNC', a: 'FNC', o: '2026-11-12', b: '2026-11-19', f: 'Praha' };
const pack = (o) => 'z' + zlib.deflateRawSync(JSON.stringify(o)).toString('base64url');

test('aplikace: odkaz pro kamaráda /j/<data> – stejná data jako #jed=, server je přečte', async () => {
  const e = L.prepare('jed', C.json(CARD)), url = await e.done;
  assert.match(url, /^https:\/\/atlas\.example\/#jed=z[\w-]+$/);
  const j = C.pathUrl(url);
  assert.equal(j, url.replace('/#jed=', '/j/'));
  const data = j.split('/j/')[1];
  assert.match(data, INVITE_RE);
  assert.deepEqual({ ...inviteMeta(data) }, { title: 'Jede někdo se mnou? Madeira v listopadu ✈️', desc: 'Odlet: Praha. Klepni na termín a najdi si lety ze svého letiště – v ATLASu, zdarma a bez registrace.', place: 'Madeira' });
  // aplikace na /#jed=<data> načte totéž
  assert.equal((await C.fromHash('#jed=' + data)).dest, 'Madeira');
  assert.equal(C.pathUrl('https://atlas.example/index.html#jed=zAbc'), 'https://atlas.example/j/zAbc');
  assert.equal(C.pathUrl(null), null);
});

test('server: náhled bez přesného data, starší base64 JSON, poškozená a cizí data → null', () => {
  assert.equal(inviteMeta(pack({ v: 1, d: 'Řím', o: '2026-03-04' })).title, 'Jede někdo se mnou? Řím v březnu ✈️');
  assert.doesNotMatch(inviteMeta(pack(CARD)).title + inviteMeta(pack(CARD)).desc, /12|19/, 'přesné datum až po klepnutí');
  assert.equal(inviteMeta(Buffer.from(JSON.stringify({ d: 'Řím', o: '2026-03-04' })).toString('base64url')).place, 'Řím');
  assert.equal(inviteMeta(pack({ d: '<b>Řím</b>"', o: '2026-03-04' })).place, 'b Řím /b', 'bez HTML');
  for (const bad of ['', 'abc', 'zzzzzzzzzz', pack({ d: 'Řím' }), pack({ d: 'Řím', o: '2026-13-01' }), pack({ d: 'Řím', o: '2026-00-10' }), pack({ o: '2026-03-04' }), pack({ v: 2, d: 'Řím', o: '2026-03-04' }), 'z' + zlib.deflateRawSync('x'.repeat(10000)).toString('base64url')]) {
    assert.equal(inviteMeta(bad), null, bad.slice(0, 20));
  }
  const html = invitePage('zAbcdefgh', { title: 'Jede někdo se mnou? Řím v březnu ✈️', desc: 'x', img: null }, 'https://atlas.example', 'https://atlas.example/og.png');
  assert.match(html, /<meta http-equiv="refresh" content="0;url=\/#jed=zAbcdefgh">/);
  assert.match(html, /og:url" content="https:\/\/atlas\.example\/j\/zAbcdefgh"/);
  assert.match(html, /og:image" content="https:\/\/atlas\.example\/og\.png"/);
  assert.doesNotMatch(html, /<script/);
});

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('stránka /j/: prohlížeč přesměruje do aplikace, robot náhledu (WhatsApp) dostane náhled bez přesměrování', async () => {
  const data = pack({ v: 1, ...CARD });
  const page = await fetch(`${base}/j/${data}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile' } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0;url=/#jed=${data}">`));
  assert.match(html, /og:title" content="Jede někdo se mnou\? Madeira v listopadu ✈️"/);
  assert.equal(page.headers.get('vary'), 'User-Agent');
  // verze, kterou žádný service worker nemá – starší by stránku jinak uložil místo stránky aplikace
  assert.equal(page.headers.get('x-atlas-build'), 'preview');
  const bot = await (await fetch(`${base}/j/${data}`, { headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A' } })).text();
  assert.match(bot, /og:title" content="Jede někdo se mnou\? Madeira/);
  assert.doesNotMatch(bot, /http-equiv="refresh"/);
  assert.equal((await fetch(`${base}/j/nesmysl!`)).status, 404);
  assert.equal((await fetch(`${base}/j/${pack({ d: 'Řím' })}`)).status, 404);
});
