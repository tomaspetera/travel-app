// Karta „Jede někdo se mnou?“ (public/js/sharecard.js): data karty z cesty → zkomprimovaný odkaz #jed= → stejná data
// u kamaráda; cizí odkaz se pročistí, poškozený se odmítne. Texty pod příspěvek bez přesného data (to je až v odkazu).
// Klasické skripty prohlížeče přes node:vm (kreslení na canvas se tu nezkouší – jen data a texty).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';

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

test('okno Sdílet: „bez ubytování“ jen u karty na sítě – Poslat kamarádům posílá celou cestu i s ubytováním', () => {
  /** HTML okna Sdílet cestu (ShareCard.open) pro cestu s odletem o → text bez značek. */
  const sheet = (o) => {
    let html = '';
    const el = () => ({ onclick: null, disabled: false, isConnected: true, innerHTML: '', textContent: '', querySelector: () => ({ textContent: '' }), replaceWith: () => { } });
    const c = {
      window: {}, TextEncoder, TextDecoder, btoa, atob, navigator: {}, location: ctx.location, CompressionStream, DecompressionStream,
      fmtYMD: (d) => d.toISOString().slice(0, 10), esc: (s) => String(s), modalOpen: (h) => { html = h; }, modalClose: () => { },
      $: () => el(), $$: () => [], fetch: () => new Promise(() => { }), setTimeout: () => 0, document: { getElementById: () => null, querySelector: () => ({}) },
    };
    vm.createContext(c);
    for (const f of ['sharelink.js', 'sharecard.js']) vm.runInContext(src(f), c, { filename: f });
    c.ShareLink = c.window.ShareLink;
    c.window.ShareCard.open({ ...TRIP, o, b: null }, { send: () => { } });
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  };
  const future = sheet('2099-11-12'), past = sheet('2020-11-12');
  assert.match(future, /Poslat kamarádům soukromě Celá cesta – lety, ubytování a program po dnech/);
  assert.match(future, /Karta pro sítě nikdy neukáže ubytování ani adresu/);
  assert.match(past, /Celá cesta – lety, ubytování/);
  for (const s of [future, past]) assert.doesNotMatch(s, /Ubytování ani adresa se nikdy nesdílí/, 'okno by si odporovalo');
  assert.doesNotMatch(past, /ubytování ani adresu|Jede někdo se mnou/, 'proběhlá cesta: karta na sítě není, zámek také ne');
});

test('písma z vlastního serveru: nic z Google Fonts, @font-face míří na přibalené soubory, karta Sdílet čeká jen na fonts.load', async () => {
  const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
  for (const p of ['index.html', 'js/sharecard.js', 'css/atlas.css']) assert.doesNotMatch(read(p), /fonts\.(googleapis|gstatic)\.com/, p);
  const files = [...read('css/atlas.css').matchAll(/url\(\.\.\/vendor\/fonts\/([^)]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(new Set(files.map((f) => f.split('-v')[0])), new Set(['inter', 'sora', 'caveat']));
  for (const f of files) assert.ok(existsSync(new URL(`../public/vendor/fonts/${f}`, import.meta.url)), f);
  /** render(): po písmech (fonts) se stahuje fotka cíle – fetch api/photos = písma vyřízená, bez čekání na styl Googlu. */
  const asked = [];
  const c = {
    window: {}, TextEncoder, TextDecoder, btoa, atob, navigator: {}, location: ctx.location, setTimeout: () => 0,
    document: { getElementById: () => null, querySelector: () => ({}), fonts: { load: async () => [] } },
    fetch: (u) => { asked.push(u); return new Promise(() => { }); },
  };
  vm.createContext(c);
  for (const f of ['sharelink.js', 'sharecard.js']) vm.runInContext(src(f), c, { filename: f });
  c.window.ShareCard.render(c.window.ShareCard.sanitize(TRIP));
  await new Promise((r) => setImmediate(r));
  assert.ok(asked.length > 0, 'písma vyřízená → karta pokračuje (fotka cíle)');
});

test('#jed= okno: proběhlé až po návratu, probíhající cesta „Cesta už začala“ (přidat se od zítřka), nad 45 nocí jen tam', () => {
  const sc = readFileSync(new URL('../public/js/sharecard.js', import.meta.url), 'utf8');
  const fn = sc.slice(sc.indexOf('  function landing(d)'), sc.indexOf('// počasí v měsíci cesty'));
  assert.match(fn, /past = \(d\.b \|\| d\.o\) < now/);
  assert.match(fn, /join = on && d\.b && tmw < d\.b/);
  assert.match(fn, /<b>Cesta už začala\.<\/b>/);
  assert.match(fn, /long \? 'Najít lety tam \(pobyt přes 45 nocí – zpět hledej zvlášť\)'/);
  assert.match(fn, /Flights\.searchTo\(\[item\], when\)/);
});
