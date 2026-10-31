// Sdílení jedné nabídky letu odkazem #offer=… (public/js/offershare.js): nabídka z řádku výsledků (Pins.fromRow) →
// zkomprimovaný odkaz (sharelink.js) → tatáž nabídka u příjemce; cizí odkaz se pročistí a poškozený se odmítne.
// Klasické skripty prohlížeče přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const ctx = { window: {}, TextEncoder, TextDecoder, btoa, atob, CompressionStream, DecompressionStream, location: { origin: 'https://atlas.example', pathname: '/' }, navigator: {} };
vm.createContext(ctx);
for (const f of ['sharelink.js', 'pins.js', 'offershare.js']) vm.runInContext(src(f), ctx, { filename: f });
ctx.ShareLink = ctx.window.ShareLink;
const { OfferShare: O, Pins } = ctx.window;
const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (o) => O.text(o).replace(/ | /g, ' '); // tisíce odděluje Intl nedělitelnou mezerou

const AT = Date.UTC(2026, 9, 22, 12, 30);
const leg = (from, to, date, dep, arr, x = {}) => ({ from, to, date, dep, arr, hasTime: true, provider: 'ryanair', carrier: 'FR', carrierName: 'Ryanair', stops: 0, live: true, ...x });
const T = {
  id: 'PRG-NAP-1', destKey: 'NAP', provider: 'ryanair', flightCzk: 1290, perPersonCzk: 1290, totalCzk: 2580, nights: 2,
  out: leg('PRG', 'NAP', '2026-11-13', '2026-11-13T06:10:00', '2026-11-13T08:05:00', { bookUrl: 'https://www.ryanair.com/cz/cs/trip/flights/select?adults=2&dateOut=2026-11-13' }),
  back: leg('NAP', 'PRG', '2026-11-15', '2026-11-15T21:40:00', '2026-11-15T23:30:00', { bookUrl: 'https://www.ryanair.com/cz/cs/trip/flights/select?adults=2&dateOut=2026-11-15' }),
  deal: { level: 'good', score: 3 },
};
const G = { dest: { id: 'metro:NAP', key: 'NAP', label: 'Neapol', cc: 'IT', country: 'Itálie', airports: ['NAP'] } };
const RES = { mode: 'route', query: { adults: 2, bags: 'cabin', groundMode: 'transit', kmRate: 1, arrival: true }, origins: [], groups: [G] };
const rec = () => Pins.fromRow(T, G, RES, AT, AT);

test('nabídka z řádku výsledků: trasa, data, časy, cena, aerolinka a odkazy na koupi', () => {
  const o = JSON.parse(O.json(rec()));
  assert.deepEqual(o, {
    v: 1, dest: { id: 'metro:NAP', label: 'Neapol', cc: 'IT' },
    out: { from: 'PRG', to: 'NAP', date: '2026-11-13', dep: '2026-11-13T06:10', arr: '2026-11-13T08:05', stops: 0, air: 'Ryanair' },
    back: { from: 'NAP', to: 'PRG', date: '2026-11-15', dep: '2026-11-15T21:40', arr: '2026-11-15T23:30', stops: 0, air: 'Ryanair' },
    czk: 1290, pax: 2, at: AT, bags: 'cabin',
    buy: [[T.out.bookUrl, 'ryanair', 'out'], [T.back.bookUrl, 'ryanair', 'back']],
    total: 2580, nights: 2,
  });
});

test('odkaz #offer= tam a zpět (zkomprimovaný i dřívější tvar base64url JSON) dá tutéž nabídku', async () => {
  const json = O.json(rec()), want = O.sanitize(JSON.parse(json), AT);
  const url = await ctx.ShareLink.prepare('offer', json).done;
  assert.match(url, /^https:\/\/atlas\.example\/#offer=[A-Za-z0-9_-]+$/);
  assert.deepEqual(plain(await O.fromHash(url.slice(url.indexOf('#')))), plain(want));
  assert.deepEqual(plain(await O.fromHash('#offer=' + Buffer.from(json).toString('base64url'))), plain(want));
  assert.equal(await O.fromHash('#plan=abc'), null);
  assert.equal(await O.fromHash(''), null);
});

test('jen tam, jedna letenka na obě cesty a Aviasales (přestupy neznámé)', () => {
  const t = { ...T, id: 'x', back: null, nights: null, bookUrl: 'https://www.aviasales.com/search/PRG1311NAP1?currency=eur', provider: 'travelpayouts',
    out: { ...T.out, provider: 'travelpayouts', carrierName: '', carrier: 'W6', stops: 0, hasTime: false, bookUrl: null } };
  const o = JSON.parse(O.json(Pins.fromRow(t, G, RES, AT, AT)));
  assert.equal(o.back, null);
  assert.equal(o.nights, undefined, 'noci jen u zpáteční');
  assert.deepEqual(o.out, { from: 'PRG', to: 'NAP', date: '2026-11-13', stops: null, air: 'W6' }, 'bez časů a bez „přímý“');
  assert.deepEqual(o.buy, [[t.bookUrl, 'travelpayouts', 'all']]);
  assert.match(text(o), /^✈️ Neapol · pá 13\. 11\. · jen tam\n1 290 Kč\/os\. \(celkem 2 580 Kč za 2 os\.\)\ntam PRG → NAP · W6\n\(ATLAS – cena se mohla změnit/);
});

test('text do zprávy: termín, noci, cena, lety s časy a aerolinka', () => {
  const o = JSON.parse(O.json(rec()));
  assert.equal(text(o), [
    '✈️ Neapol · pá 13. 11. – ne 15. 11. · 2 noci',
    '1 290 Kč/os. (celkem 2 580 Kč za 2 os.)',
    'tam 06:10 PRG → NAP přímý · zpět 21:40 NAP → PRG přímý · Ryanair',
    '(ATLAS – cena se mohla změnit, ověř ji před nákupem)',
  ].join('\n'));
});

test('cizí odkaz: jen známá pole, bez HTML a skriptových odkazů, čas ceny ne z budoucnosti', () => {
  const o = O.sanitize({
    v: 1, dest: { id: 'javascript:alert(1)', label: '<img src=x onerror=alert(1)>Řím', cc: 'it', evil: 1 },
    out: { from: 'PRG', to: 'FCO', date: '2026-11-13', dep: '2026-11-13T25:00', stops: 9, air: '"><script>' },
    back: { from: 'FCO', to: 'PRG', date: '2026-11-01' }, // návrat před odletem
    czk: 990.4, pax: 40, total: 5, nights: 3, at: AT + 3 * 864e5, bags: 'kufr', demo: 'ano',
    buy: [['javascript:alert(1)', 'ryanair', 'all'], ['https://ok.example/a b', 'x', 'all'], ['https://ok.example/buy', 'Bad Prov!', 'all'], ['https://ok.example/x', 'kiwi', 'jinam']],
    __proto__: { polluted: 1 },
  }, AT);
  assert.deepEqual(plain(o), {
    dest: { id: null, label: 'img src=x onerror=alert(1)Řím', cc: '' },
    out: { from: 'PRG', to: 'FCO', date: '2026-11-13', stops: null, air: 'script' },
    back: null, czk: 990, pax: 1, at: null, bags: 'none', buy: [],
  });
  // Koupit jen https k prodejcům z výsledků; prodejce podle adresy (ne podle odkazu), nejvýš dva odkazy
  const buy = (list) => plain(O.sanitize({ out: T.out, czk: 100, buy: list }, AT).buy);
  assert.deepEqual(buy([
    ['https://evil.example/ryanair', 'ryanair', 'all'], ['http://www.ryanair.com/cz/cs', 'ryanair', 'all'],
    ['https://www.ryanair.com@evil.example/x', 'ryanair', 'all'], ['https://ryanair.com.evil.example/', 'ryanair', 'all'],
    ['https://evilryanair.com/', 'ryanair', 'all'], ['https://www.ryanair.com\\@evil.example/', 'ryanair', 'all'],
    ['https://www.kiwi.com/cz/booking?token=a', 'ryanair', 'out'], ['https://tp.media/r?p=4114', 'constructor', 'back'], ['https://www.wizzair.com/x', 'wizzair', 'all'],
  ]), [['https://www.kiwi.com/cz/booking?token=a', 'kiwi', 'out'], ['https://tp.media/r?p=4114', 'travelpayouts', 'back']]);
  assert.deepEqual(buy([['HTTPS://WWW.WIZZAIR.COM:443/cs-cz', '', 'all']]), [['HTTPS://WWW.WIZZAIR.COM:443/cs-cz', 'wizzair', 'all']]);
  for (const bad of [null, [], {}, { v: 2, out: T.out, czk: 1 }, { out: { from: 'PRG', to: 'NAP' }, czk: 100 }, { out: { from: 'PRG', to: 'NAP', date: '2026-02-30' }, czk: 100 }, { out: { from: 'PRG', to: 'NAP', date: '2026-11-13' }, czk: 0 }]) {
    assert.throws(() => O.sanitize(bad, AT));
  }
});

test('poškozený odkaz se odmítne', async () => {
  for (const h of ['#offer=', '#offer=<script>', '#offer=a b', '#offer=' + 'A'.repeat(20001), '#offer=' + Buffer.from('nejson').toString('base64url'), '#offer=' + Buffer.from('{"v":1}').toString('base64url')]) {
    await assert.rejects(O.fromHash(h), h.slice(0, 30));
  }
});

test('index.html: offershare.js po sharelink.js; tlačítko 📤 Sdílet v kartě nabídky a otevření #offer= v app.js', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const at = (f) => html.indexOf(`<script src="js/${f}"></script>`);
  assert.ok(at('sharelink.js') > 0 && at('sharelink.js') < at('offershare.js') && at('offershare.js') < at('app.js'));
  assert.match(src('flights.js'), /data-oshare="\$\{idx\}"/);
  assert.match(src('app.js'), /await openOfferFromHash\(\)/);
});

test('karta sdílené nabídky: přílet další den „15:05 +1“ jako ve výsledcích (dřív vypadal jako týž den)', () => {
  const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  const line = fl.match(/^ {2}const offerArr = .*$/m)[0];
  const ctx = { SearchHelp: { diffDays: (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) } };
  vm.createContext(ctx);
  vm.runInContext(`${line.trim()}; this.offerArr = offerArr;`, ctx);
  assert.equal(ctx.offerArr({ date: '2026-11-13', dep: '2026-11-13T21:40', arr: '2026-11-14T15:05' }), ' +1');
  assert.equal(ctx.offerArr({ date: '2026-11-13', dep: '2026-11-13T06:10', arr: '2026-11-13T08:05' }), '');
  assert.equal(ctx.offerArr({ date: '2026-12-31', arr: '2027-01-02T07:00' }), ' +2');
  assert.equal(ctx.offerArr({ date: 'x', arr: '<b>' }), '', 'nesmyslná data ze sdíleného odkazu nic nepřidají');
  assert.match(fl, /esc\(l\.arr\.slice\(11, 16\)\) \+ offerArr\(l\)/);
});
