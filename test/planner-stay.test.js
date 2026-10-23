// Plánovač → okno cesty → Ubytování: hotel vybraný v průvodci Cestou je nahoře (název a jeho odkaz), obecné hledání
// (Booking, Airbnb, Hostelworld) jen pod ním. Funkce z app.js jsou skutečné řádky vybrané podle jména (celý app.js
// potřebuje DOM), načtené přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = .*|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
const ctx = { URL };
vm.createContext(ctx);
vm.runInContext(pick('esc', 'safeUrl', 'czk', 'ico', 'stayChoice', 'stayChosenHtml'), ctx);
const plain = (x) => JSON.parse(JSON.stringify(x));

const BK = 'https://www.booking.com/searchresults.cs.html?ss=Hostel+Backpackers+Barcelona%2C+Barcelona&checkin=2026-11-19&checkout=2026-11-25';

test('stayChoice: hotel z průvodce (název, cena, web), ručně zadané bez odkazu; „jen odkazy“ a „neřeším“ nic', () => {
  assert.deepEqual(plain(ctx.stayChoice({ mode: 'pick', name: 'Hostel Backpackers Barcelona', totalCzk: 3540, url: BK })),
    { name: 'Hostel Backpackers Barcelona', url: BK, aff: false, sub: 'vybráno v průvodci · 3 540 Kč celkem · booking.com' });
  // odhad ceny s „~“, ručně zadané bez odkazu
  assert.equal(ctx.stayChoice({ mode: 'pick', name: 'Casa', totalCzk: 2000, est: true, url: BK }).sub, 'vybráno v průvodci · ~2 000 Kč celkem · booking.com');
  assert.deepEqual(plain(ctx.stayChoice({ mode: 'manual', name: 'U babičky', totalCzk: 0 })), { name: 'U babičky', url: '', aff: false, sub: 'zadané ručně' });
  // partnerský odkaz: web z cílové adresy, označený jako reklama
  const aff = ctx.stayChoice({ mode: 'pick', name: 'H', url: 'https://tp.media/r?marker=1&u=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fes%2Fx.html' });
  assert.equal(aff.aff, true);
  assert.match(aff.sub, /booking\.com$/);
  for (const s of [null, undefined, {}, { mode: 'links', name: 'jen odkazy' }, { mode: 'skip', name: 'bez ubytování' }, { mode: 'pick', name: '  ' }]) assert.equal(ctx.stayChoice(s), null);
  // jen https odkaz
  assert.equal(ctx.stayChoice({ mode: 'pick', name: 'X', url: 'javascript:alert(1)' }).url, '');
});

test('stayChosenHtml: vybraný hotel jako odkaz nad obecným hledáním, texty escapované, reklama označená', () => {
  const h = ctx.stayChosenHtml(ctx.stayChoice({ mode: 'pick', name: '<b>Hotel "Ráj"</b>', totalCzk: 1000, url: BK }));
  assert.match(h, /🏨 Tvoje ubytování/);
  assert.match(h, /<a class="result-link stay-own" href="https:\/\/www\.booking\.com\/searchresults\.cs\.html\?ss=Hostel\+Backpackers\+Barcelona%2C\+Barcelona&amp;checkin=2026-11-19&amp;checkout=2026-11-25" target="_blank" rel="noopener">/);
  assert.match(h, /&lt;b&gt;Hotel &quot;Ráj&quot;&lt;\/b&gt;/);
  assert.ok(h.indexOf('Tvoje ubytování') < h.indexOf('Nebo hledej jinde'));
  const a = ctx.stayChosenHtml(ctx.stayChoice({ mode: 'pick', name: 'H', url: 'https://tp.media/r?u=https%3A%2F%2Fwww.booking.com%2F' }));
  assert.match(a, /rel="sponsored nofollow noopener"/);
  assert.match(a, /<span class="ad-tag">reklama<\/span>/);
  // ručně zadané ubytování bez odkazu: řádek, ne odkaz
  assert.doesNotMatch(ctx.stayChosenHtml(ctx.stayChoice({ mode: 'manual', name: 'U babičky' })), /<a /);
});

test('okno cesty v plánovači: Ubytování předá vybraný hotel (jedno místo i každé místo trasy) do openStay', () => {
  assert.match(APP, /openStay\(oneCity \? t\.dest : city, t\.start \|\| '', t\.end \|\| '', \+t\.pax \|\| 2, \{ chosen: stayChoice\(\(tripWiz\(t\) \|\| \{\}\)\.stay\) \}\)/);
  assert.match(APP, /openStay\(bs\[i\]\.name, d\.checkin \|\| '', d\.checkout \|\| '', pax, \{ chosen: chosen\(i\) \}\)/);
  assert.match(APP, /\$\{opts\.chosen \? stayChosenHtml\(opts\.chosen\) : ''\}\$\{provLink\('Booking\.com'/);
});
