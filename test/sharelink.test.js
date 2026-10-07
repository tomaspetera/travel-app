// Kratší sdílené odkazy (public/js/sharelink.js): JSON zkomprimovaný v prohlížeči (deflate-raw) v base64url se značkou
// „z“, dřívější odkazy (base64url JSON) fungují dál, ochrana proti kompresní bombě a kopírování do schránky tak, aby
// prošlo i v Safari (hotový odkaz se zapíše ještě v obsluze kliknutí). Klasický skript prohlížeče přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const SRC = readFileSync(new URL('../public/js/sharelink.js', import.meta.url), 'utf8');
/** Kontext jako v prohlížeči; zip: false = prohlížeč bez CompressionStream, clipboard a ClipboardItem podle potřeby. */
function load({ zip = true, clipboard, ClipboardItem } = {}) {
  const ctx = { window: {}, TextEncoder, TextDecoder, btoa, atob, Blob, location: { origin: 'https://atlas.example', pathname: '/' }, navigator: clipboard ? { clipboard } : {} };
  if (zip) Object.assign(ctx, { CompressionStream, DecompressionStream });
  if (ClipboardItem) ctx.ClipboardItem = ClipboardItem;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'sharelink.js' });
  return ctx.window.ShareLink;
}
const L = load();
const b64 = (s) => Buffer.from(s).toString('base64url');
const z = (s) => 'z' + deflateRawSync(Buffer.from(s)).toString('base64url');

// Cesta jako z průvodce: let, tři místa s programem (9 dní po 4 místech) a přejezdy s odkazy do Google Map.
const place = (i) => ({ id: `Q${100000 + i * 7919}`, name: `Místo ${i} – náměstí svatého Jakuba`, lat: +(41.38 + i / 1013).toFixed(6), lon: +(2.17 + i / 997).toFixed(6), category: ['square', 'museum', 'church', 'park'][i % 4], visitMin: 30 + (i % 4) * 15, fromPrevKm: (i % 7) / 10, fromPrevMin: i % 9, transit: false });
const maps = (a, b, mode) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a)}&destination=${encodeURIComponent(b)}&travelmode=${mode}`;
const TRIP = JSON.stringify({
  v: 1, adults: 2, step: 'summary',
  flight: { out: { provider: 'kiwi', carrier: 'FR', from: 'PRG', to: 'BCN', dep: '2026-10-31T10:25:00', arr: '2026-10-31T21:30:00', fromTz: 'Europe/Prague', toTz: 'Europe/Madrid', bookUrl: 'https://kiwi.com/u/rhbrf7', czk: 1403 }, flightCzk: 2806 },
  dest: { label: 'Barcelona', country: 'Španělsko', cc: 'ES', lat: 41.3874, lon: 2.1686 },
  route: {
    bases: ['Barcelona', 'Besalú', 'Girona'].map((name, b) => ({
      id: `city:${b}`, name, lat: 41.4 + b / 10, lon: 2.2 + b / 10, cc: 'ES', country: 'Španělsko', nights: 3,
      plan: { days: Array.from({ length: 3 }, (_, d) => ({ date: `2026-11-0${b * 3 + d + 1}`, items: Array.from({ length: 4 }, (_, k) => place(b * 100 + d * 10 + k)), walkKm: 3.4, minutes: 180 })) },
    })),
    transfers: [['Barcelona', 'Besalú'], ['Besalú', 'Girona']].map(([a, b]) => ({ km: 131, carMin: 115, transitMin: 145, carUrl: maps(`${a}, Španělsko`, `${b}, Španělsko`, 'driving'), transitUrl: maps(`${a}, Španělsko`, `${b}, Španělsko`, 'transit') })),
  },
});

test('pack: zkomprimovaný odkaz „z…“ (standardní deflate-raw v base64url), tam a zpět beze ztráty, asi 3× kratší', async () => {
  for (const json of [TRIP, JSON.stringify({ name: 'Léto v Portugalsku 🌞 – „uvozovky“ & <b>', notes: 'ř'.repeat(500) })]) {
    const p = await L.pack(json);
    assert.match(p, /^z[A-Za-z0-9_-]+$/);
    assert.equal(inflateRawSync(Buffer.from(p.slice(1), 'base64url')).toString('utf8'), json);
    assert.equal(await L.unpack(p), json);
  }
  const p = await L.pack(TRIP), legacy = b64(TRIP);
  assert.ok(p.length < legacy.length * 0.4, `${p.length} vs ${legacy.length} znaků`);
});

test('pack: krátký JSON, kde komprese nepomůže, zůstane po staru; dřívější odkazy (base64url JSON) fungují dál', async () => {
  const tiny = '{"a":1}';
  assert.equal(await L.pack(tiny), b64(tiny));
  assert.ok(b64(tiny).startsWith('ey'), 'dřívější tvar začíná vždy „ey“ ({") – značka „z“ je jednoznačná');
  assert.equal(await L.unpack(b64(TRIP)), TRIP);
  assert.equal(await L.unpack(b64('{"name":"Plzeň 🍺"}')), '{"name":"Plzeň 🍺"}');
});

test('bez CompressionStream (Safari do 16.3): odkaz po staru, zkomprimovaný rozbalí vlastní inflate', async () => {
  const old = load({ zip: false });
  assert.equal(await old.pack(TRIP), b64(TRIP));
  assert.equal(await old.unpack(b64(TRIP)), TRIP);
  assert.equal(await old.unpack(await L.pack(TRIP)), TRIP, 'odkaz z nového prohlížeče');
});

test('vlastní inflate = zlib: náhodná data, všechny úrovně a strategie (uložené, pevné i dynamické bloky), víc bloků', async () => {
  const old = load({ zip: false });
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const words = ['Barcelona', 'náměstí', '"lat":41.38', '"name":"', 'Španělsko', '🌞', 'https://www.google.com/maps/dir/?api=1&origin=', '},{', '0', '\n'];
  const { constants: Z } = await import('node:zlib');
  const inputs = [
    '', 'a', TRIP, TRIP.repeat(6), // víc bloků (> 64 kB)
    ...Array.from({ length: 40 }, (_, i) => Array.from({ length: Math.floor(rnd() * 4000) + i }, () => (rnd() < 0.7 ? words[Math.floor(rnd() * words.length)] : String.fromCharCode(32 + Math.floor(rnd() * 400)))).join('')),
  ];
  let n = 0;
  for (const text of inputs) {
    for (const opts of [{ level: 0 }, { level: 1 }, { level: 6 }, { level: 9 }, { level: 9, strategy: Z.Z_FIXED }, { level: 9, strategy: Z.Z_HUFFMAN_ONLY }, { level: 9, strategy: Z.Z_RLE }, { level: 6, memLevel: 1, windowBits: 9 }]) {
      const p = 'z' + deflateRawSync(Buffer.from(text), opts).toString('base64url');
      if (p.length > 200000) continue;
      assert.equal(await old.unpack(p), text, `${text.length} znaků, ${JSON.stringify(opts)}`);
      n++;
    }
  }
  assert.ok(n > 300, `${n} případů`);
  // poškozená data, useknutý odkaz a kompresní bomba i bez DecompressionStream
  for (const p of ['z', 'zA', 'zzzz', z(TRIP).slice(0, 200), z(TRIP).slice(0, -3), 'z' + Buffer.from([0x07]).toString('base64url'), 'z' + deflateRawSync(Buffer.from([0xff, 0xfe, 0x7b])).toString('base64url')]) {
    await assert.rejects(old.unpack(p), undefined, `má selhat: ${p.slice(0, 30)}`);
  }
  await assert.rejects(old.unpack('z' + deflateRawSync(Buffer.alloc(20 << 20, 97)).toString('base64url')), /příliš velký/);
  const big = JSON.stringify({ notes: 'a'.repeat(900000) });
  assert.equal(await old.unpack(z(big)), big);
});

test('unpack: poškozený, podvržený a příliš velký odkaz → zamítnutí (i kompresní bomba)', async () => {
  const bad = [
    '', '!!!', 'ab cd', 'eyJ<script>', 'z', 'zA', 'zzzz', z(TRIP).slice(0, 200), 'z' + 'A'.repeat(200001), 'e'.repeat(200001),
    b64(Buffer.from([0xff, 0xfe, 0x7b])), 'z' + deflateRawSync(Buffer.from([0xff, 0xfe, 0x7b])).toString('base64url'), null, 42,
  ];
  for (const p of bad) await assert.rejects(L.unpack(p), undefined, `má selhat: ${String(p).slice(0, 30)}`);
  // 20 MB jednoho znaku se zkomprimuje na ~27 kB odkazu – rozbalování skončí po 1 MB
  const bomb = 'z' + deflateRawSync(Buffer.alloc(20 << 20, 97)).toString('base64url');
  assert.ok(bomb.length < 200000, `${bomb.length}`);
  await assert.rejects(L.unpack(bomb), /příliš velký/);
  // velký, ale skutečný plán (0,9 MB) projde
  const big = JSON.stringify({ notes: 'a'.repeat(900000) });
  assert.equal(await L.unpack(z(big)), big);
});

test('prepare + copy: hotový odkaz se zapíše ještě v obsluze kliknutí (Safari), změněný obsah až po kompresi', async () => {
  const copied = [];
  const S = load({ clipboard: { writeText: (u) => { copied.push(u); return Promise.resolve(); } } });
  const e = S.prepare('trip', TRIP);
  assert.equal(e.url, null, 'komprese běží');
  const url = await e.done;
  assert.match(url, /^https:\/\/atlas\.example\/#trip=z[A-Za-z0-9_-]+$/);
  assert.equal(e.url, url);
  assert.equal(S.prepare('trip', TRIP), e, 'stejný obsah → týž připravený odkaz');
  const r = S.copy('trip', TRIP);
  assert.deepEqual(copied, [url], 'zapsáno synchronně, bez čekání na Promise');
  assert.deepEqual({ ...(await r) }, { url, copied: true });
  // obsah se mezitím změnil (např. odškrtnutí) a ClipboardItem chybí → writeText po kompresi
  const r2 = S.copy('plan', '{"name":"jiný plán"}');
  assert.equal(copied.length, 1);
  const res2 = await r2;
  assert.deepEqual({ ...res2 }, { url: 'https://atlas.example/#plan=' + b64('{"name":"jiný plán"}'), copied: true });
  assert.equal(copied[1], res2.url);
});

test('copy: ClipboardItem s Promise (Safari), odmítnutý ClipboardItem → writeText, zakázaná nebo chybějící schránka → ručně', async () => {
  const items = [];
  class FakeItem { constructor(data) { this.data = data; } }
  const S = load({ clipboard: { write: (list) => { items.push(list[0]); return Promise.resolve(); }, writeText: () => Promise.reject(new Error('mimo obsluhu kliknutí')) }, ClipboardItem: FakeItem });
  const r = S.copy('trip', TRIP);
  assert.equal(items.length, 1, 'zápis začal ještě v obsluze kliknutí');
  const res = await r;
  assert.equal(await (await items[0].data['text/plain']).text(), res.url);
  assert.equal(res.copied, true);
  assert.match(res.url, /#trip=z/);
  // prohlížeč ClipboardItem s Promise neumí → writeText po kompresi
  const texts = [];
  const S2 = load({ clipboard: { write: () => Promise.reject(new TypeError('bez Promise')), writeText: (u) => { texts.push(u); return Promise.resolve(); } }, ClipboardItem: FakeItem });
  const res2 = await S2.copy('trip', TRIP);
  assert.deepEqual([texts, res2.copied], [[res2.url], true]);
  // zápis zakázaný → copied: false a hotový odkaz k ručnímu zkopírování; stejně bez schránky (http, starý prohlížeč)
  const res3 = await load({ clipboard: { writeText: () => Promise.reject(new Error('zakázáno')) } }).copy('trip', TRIP);
  assert.deepEqual([res3.copied, /#trip=z/.test(res3.url)], [false, true]);
  const res4 = await load().copy('plan', TRIP);
  assert.deepEqual([res4.copied, /#plan=z/.test(res4.url)], [false, true]);
});

test('kind \'\' = jen kód bez adresy (hlídání v mobilu) – stejná komprese, rozbalí ho i scripts/watch.mjs', async () => {
  const copied = [];
  const S = load({ clipboard: { writeText: (u) => { copied.push(u); return Promise.resolve(); } } });
  const r = await S.copy('', TRIP);
  assert.equal(r.copied, true);
  assert.match(r.url, /^z[A-Za-z0-9_-]+$/);
  assert.deepEqual(copied, [r.url]);
  assert.equal(await S.unpack(r.url), TRIP);
  const { decodeWatch } = await import('../scripts/watch.mjs');
  const code = await S.pack(JSON.stringify({ v: 1, w: [{ id: 'a', label: 'x', p: { from: ['ap:PRG'] } }] }));
  assert.deepEqual(decodeWatch(code).watches.map((w) => w.id), ['a']);
});

test('prepare: drží jen pár posledních odkazů', async () => {
  const S = load();
  const first = S.prepare('trip', '{"i":0}');
  for (let i = 1; i <= 4; i++) S.prepare('trip', `{"i":${i}}`);
  assert.notEqual(S.prepare('trip', '{"i":0}'), first, 'nejstarší vypadl');
  assert.notEqual(S.prepare('plan', '{"i":4}'), S.prepare('trip', '{"i":4}'), 'cesta a plán zvlášť');
  await first.done;
});
