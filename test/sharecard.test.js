// Karta „Jede někdo se mnou?“ (public/js/sharecard.js): data karty z cesty → zkomprimovaný odkaz #jed= → stejná data
// u kamaráda; cizí odkaz se pročistí, poškozený se odmítne. Texty pod příspěvek bez přesného data (to je až v odkazu).
// Klasické skripty prohlížeče přes node:vm (kreslení na canvas se tu nezkouší – jen data a texty).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const ctx = { window: {}, TextEncoder, TextDecoder, btoa, atob, CompressionStream, DecompressionStream, location: { origin: 'https://atlas.example', pathname: '/' }, navigator: {} };
vm.createContext(ctx);
for (const f of ['sharelink.js', 'sharecard.js']) vm.runInContext(src(f), ctx, { filename: f });
ctx.ShareLink = ctx.window.ShareLink;
const { ShareCard: C } = ctx.window;
const plain = (v) => JSON.parse(JSON.stringify(v));

const TRIP = { d: 'Madeira', cc: 'PT', id: 'ap:FNC', a: 'FNC', o: '2026-11-12', b: '2026-11-19', f: 'Praha' };

test('data karty z cesty: cíl, letiště, termín a odkud – nic dalšího', () => {
  assert.deepEqual(plain(C.sanitize({ ...TRIP, czk: 4290, stay: 'Hotel Funchal' })), { dest: 'Madeira', cc: 'PT', id: 'ap:FNC', a: 'FNC', o: '2026-11-12', b: '2026-11-19', f: 'Praha' });
  // cesta bez letiště v id (vlak, místo) → hledá se podle letiště cíle; bez letiště vůbec nic
  assert.equal(C.sanitize({ ...TRIP, id: 'city:123' }).id, 'ap:FNC');
  assert.equal(C.sanitize({ ...TRIP, id: undefined, a: null }).id, null);
});

test('odkaz #jed= vrátí u kamaráda stejná data', async () => {
  const payload = await ctx.ShareLink.pack(C.json(TRIP));
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  assert.ok(payload.length < 200, `odkaz je krátký (${payload.length} znaků)`);
  assert.deepEqual(plain(await C.fromHash('#jed=' + payload)), plain(C.sanitize(TRIP)));
  assert.equal(await C.fromHash('#offer=abc'), null);
  await assert.rejects(C.fromHash('#jed=<script>'));
  await assert.rejects(C.fromHash('#jed=' + 'A'.repeat(3000)));
});

test('cizí odkaz: texty bez HTML, nesmyslná data a návrat před odletem pryč, neznámý formát odmítnut', () => {
  const x = C.sanitize({ d: 'Ma<img src=x onerror=alert(1)>deira', cc: 'pt', id: 'javascript:x', a: 'fnc', o: '2026-11-12', b: '2026-11-01', f: '"Praha"' });
  assert.equal(x.dest, 'Maimg src=x onerror=alert(1)deira');
  assert.equal(x.cc, '');
  assert.equal(x.id, null);
  assert.equal(x.a, null);
  assert.equal(x.b, null);
  assert.equal(x.f, 'Praha');
  assert.equal(C.sanitize({ ...TRIP, b: '2027-03-01' }).b, null, 'pobyt přes 60 dní není zpáteční termín');
  assert.throws(() => C.sanitize({ ...TRIP, o: '2026-02-30' }));
  assert.throws(() => C.sanitize({ ...TRIP, d: '   ' }));
  assert.throws(() => C.sanitize({ ...TRIP, v: 2 }));
  assert.throws(() => C.sanitize(null));
});

test('text ke sdílení: ke Story jen odkaz, k příspěvku cíl a měsíc bez skloňování a odkaz; přesné datum ne', () => {
  const d = C.sanitize(TRIP), url = 'https://atlas.example/#jed=zABC';
  const post = C.caption(d, 'post', url);
  assert.match(post, /^Madeira v listopadu – jede někdo se mnou\?/);
  assert.match(post, /Napiš do komentářů/, 'na Instagramu odkaz v popisku klikací není – zve do komentářů');
  assert.ok(post.endsWith(url), 'na Facebooku je odkaz klikací');
  assert.ok(!/\b12\.|\b19\.|2026-11/.test(post.replace(url, '')), `bez přesného data: ${post}`);
  assert.equal(C.caption(d, 'story', url), url);
  assert.deepEqual(plain(C.monthsIn.slice(0, 3)), ['v lednu', 'v únoru', 'v březnu']);
});

test('dlouhý cíl na letence menším písmem', () => {
  assert.equal(C.kamSize('Madeira', 96), 96);
  assert.equal(C.kamSize('Kanárské ostr', 96), 77);
  assert.equal(C.kamSize('Santiago de Compostela', 96), 58);
});
