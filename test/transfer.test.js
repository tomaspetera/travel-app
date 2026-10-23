// 📲 Přenést do jiného zařízení (public/js/transfer.js + backup.js): odkaz #sync= se zkomprimovanou zálohou, QR kód,
// který jde přečíst zpátky, čtení cizího odkazu, Sloučit / Nahradit a uklizení adresy. Klasické skripty přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { decode, fromSvg } from './qrdecode.js';
import { lisbon, italy, plannerOnly, saved } from './fixtures/trips-now.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ORIGIN = 'https://atlas-letenky.onrender.com';
const replaced = [], toasts = [], shown = [];
const ctx = {
  console, TextEncoder, TextDecoder, btoa, atob, Blob, CompressionStream, DecompressionStream,
  location: { origin: ORIGIN, pathname: '/', hash: '' },
  history: { replaceState: (s, t, url) => replaced.push(url) },
  toast: (m, k) => toasts.push([m, k]),
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['planshare.js', 'searchhelp.js', 'pins.js', 'sharelink.js', 'backup.js', 'qr.js', 'transfer.js']) vm.runInContext(read(`public/js/${f}`), ctx, { filename: f });
const { Backup: B, Transfer: T, ShareLink, QR, Pins: P } = ctx;
const plain = (v) => JSON.parse(JSON.stringify(v));
ctx.Backup.incoming = (inc) => shown.push(inc);

// průvodce: jen kontrola tvaru (jako backup.test.js); 📌 odložené nabídky: dnešek pevně
const sanitizeWizard = (w) => { if (!w || !w.flight || !w.flight.out || typeof w.flight.out.from !== 'string') throw new Error('neplatný let'); return JSON.parse(JSON.stringify(w)); };
const deps = { sanitizePlan: ctx.PlanShare.sanitize, sanitizeWizard, txt: ctx.PlanShare.txt, pins: P, today: '2026-11-01' };
const wk = (w) => JSON.stringify(w.form.from.map((p) => p.id)) + (w.form.dFrom || '');
const NOW = new Date(2026, 10, 1, 12, 0).getTime(), H = 36e5;

const BRQ = { id: 'ap:BRQ', label: 'Brno', flag: '🇨🇿', type: 'airport', iata: 'BRQ' };
const watch = (id, dFrom, n = 5) => ({ id, label: `Brno → kamkoliv ${id}`, sub: 'listopad', form: { from: [BRQ], to: [], radius: 200, trip: 'return', dFrom, dTo: '2026-11-30', nMin: 2, nMax: 4, adults: 2, outDays: [5], backDays: [0], exclude: [], depAfter: null, ground: true, kmRate: 1, legs: [] }, best: { czk: 1890, desc: 'Neapol · 13.11.–15.11. · z BRQ', key: 'NAP' }, history: Array.from({ length: n }, (_, i) => ({ at: NOW - (n - i) * 6 * H, czk: 2400 - i * 50 })), checked: NOW - H, base: 2400, low: 1890, seen: 2000, target: null, pv: 2 });
const leg = (from, to, date, dep, arr) => ({ provider: 'ryanair', carrier: 'FR', carrierName: 'Ryanair', flightNo: 'FR 1', from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, czk: 900, stops: 0, durationMin: 115, live: true, bookUrl: null });
const DEST = { key: 'NAP', id: 'metro:NAP', label: 'Neapol', cc: 'IT', country: 'Itálie', lat: 40.85, lon: 14.27, airports: ['NAP'] };
const Q = { adults: 2, bags: 'none', groundMode: 'transit', carFuel: 'diesel', kmRate: 1, arrival: true, trip: 'return', exact: null };
const pin = (d) => {
  const t = { id: `ryanair|BRQ|NAP|2026-11-1${d}T06:10`, out: leg('BRQ', 'NAP', `2026-11-1${d}`, '06:10', '08:05'), back: leg('NAP', 'BRQ', `2026-11-1${d + 2}`, '21:30', '23:20'), flightCzk: 1800, perPersonCzk: 1890, tripCzk: 1980, totalCzk: 3780, bagCzk: 0, groundCzk: 60, arrCzk: 30, nights: 2, provider: 'ryanair', combined: false, bookUrl: null };
  const res = { mode: 'explore', query: { ...Q }, home: { label: 'Brno', iata: 'BRQ' }, origins: [{ iata: 'BRQ', name: 'Brno', cc: 'CZ', distKm: 0, ground: { mode: 'transit', czk: 30 } }], arrivals: {}, priceStats: null, groups: [{ dest: DEST, priceStats: null, ground: { min: 600, czk: 900 }, options: [t] }] };
  return P.fromRow(t, res.groups[0], res, Date.now() - d * H, Date.now()); // čas ceny ne z budoucnosti (Pins.clean)
};
const dest = (k, cc) => ({ id: `metro:${k}`, key: k, label: k, cc });
const home = { from: [BRQ], radius: 200, adults: 2 };
// stav zařízení i s mezipaměťmi, které se nepřenášejí
const device = (o = {}) => ({ trips: [], watch: [], home: null, visited: [], fav: [], mute: [], pins: [], accessOwn: {}, radar: { items: [{ to: 'NAP', czk: 1 }] }, weather: { x: 1 }, geo: { y: 2 }, viewed: [{ czk: 1 }], recent: [{ form: {} }], form: { from: [BRQ] }, theme: 'dark', ...o });
const light = () => device({ trips: [plannerOnly()], watch: [watch('w1', '2026-11-01'), watch('w2', '2026-11-08', 3)], home, visited: ['CZ', 'AT', 'IT', 'PT', 'ES'], fav: [dest('LIS', 'PT'), dest('NAP', 'IT')], pins: [pin(3)] });
const heavy = () => device({ trips: [saved(lisbon()), saved(italy()), plannerOnly(), plannerOnly({ name: 'Krakov', dest: 'Krakov', iso: 'PL' })], watch: Array.from({ length: 8 }, (_, i) => watch(`h${i}`, `2026-11-0${i + 1}`, 40)), home, visited: ['CZ', 'AT'], pins: [pin(3), pin(4), pin(5), pin(6)], fav: ['LIS', 'OPO', 'NAP', 'BCN'].map((k) => dest(k, 'ES')) });
/** Odkaz přenosu jako v aplikaci: záloha → komprese (ShareLink.pack) → adresa s #sync=. */
const linkOf = async (S) => { const json = B.pack(S, {}, NOW); return { json, url: `${ORIGIN}/#${T.KIND}=${await ShareLink.pack(json)}` }; };

test('odkaz nese jen data uživatele (jako záloha, s verzí): bez radaru, počasí, výsledků, nedávných hledání a motivu', async () => {
  const { json, url } = await linkOf(light());
  const j = JSON.parse(json);
  assert.equal(j.app, 'atlas');
  assert.equal(j.v, B.V, 'verze formátu – novější odkaz starší aplikace odmítne');
  assert.deepEqual(Object.keys(j.data).sort(), ['fav', 'home', 'mute', 'own', 'pins', 'pretrip', 'trips', 'visited', 'watch']);
  assert.doesNotMatch(json, /"radar"|"weather"|"geo"|"viewed"|"recent"|"theme"/);
  assert.match(url, /^https:\/\/atlas-letenky\.onrender\.com\/#sync=z[A-Za-z0-9_-]+$/, 'zkomprimovaný (z), jen znaky base64url – celý za #, na server nejde');
});

test('tam a zpět: odkaz → Transfer.read = táž pročištěná data jako ze souboru zálohy; QR kód jde přečíst zpátky', async () => {
  const { json, url } = await linkOf(light());
  const inc = await T.read(T.payloadOf(url), deps);
  assert.deepEqual(plain(inc), plain(B.parse(json, deps)));
  assert.equal(inc.trips.length, 1);
  assert.equal(inc.watch.length, 2);
  assert.equal(inc.pins.length, 1);
  assert.deepEqual(plain(inc.home), home);
  const f = T.fit(url);
  assert.ok(f.link);
  assert.ok(f.qr, `odkaz ${f.bytes} B se do QR vejde`);
  assert.equal(f.qr.ecl, 'M', 'menší odkaz s opravou M');
  const back = decode(fromSvg(QR.svg(f.qr)));
  assert.equal(back.text, url, 'QR kód (i vykreslené SVG) nese celý odkaz');
  assert.deepEqual(plain(await T.read(T.payloadOf(back.text), deps)), plain(inc));
});

test('velká data: odkaz ano, QR ne (víc než 2 953 bajtů verze 40-L); přes limit odkazu jen soubor', async () => {
  const { json, url } = await linkOf(heavy());
  const f = T.fit(url);
  assert.ok(f.bytes > 2953, `${f.bytes} B`);
  assert.equal(f.qr, null);
  assert.equal(f.link, true);
  const inc = await T.read(T.payloadOf(url), deps);
  assert.equal(inc.trips.length, 4);
  assert.equal(inc.trips[0].wizard.flight.out.to, 'LIS', 'cesta z průvodce celá');
  assert.equal(inc.watch.length, 8);
  assert.equal(inc.watch[0].history.length, 40, 'historie ceny hlídání');
  assert.deepEqual(plain(inc), plain(B.parse(json, deps)));
  assert.equal(T.fit(`${ORIGIN}/#sync=z${'A'.repeat(T.MAX_LINK + 1)}`).link, false);
});

test('payloadOf: z adresy i z vložené zprávy; bez #sync= nic', () => {
  assert.equal(T.payloadOf(`${ORIGIN}/#sync=zAbC-_9`), 'zAbC-_9');
  assert.equal(T.payloadOf(`Moje data z ATLASu: ${ORIGIN}/#sync=zXY12 (otevři v telefonu)`), 'zXY12');
  assert.equal(T.payloadOf('#sync=zQ'), 'zQ');
  assert.equal(T.payloadOf(`${ORIGIN}/#plan=zXY`), null);
  assert.equal(T.payloadOf(''), null);
  assert.equal(T.payloadOf(null), null);
});

test('cizí nebo poškozený odkaz: česká hláška; odkaz z novější verze → obnov stránku', async () => {
  await assert.rejects(T.read('zNENI_TO_DEFLATE', deps), /poškozený/);
  await assert.rejects(T.read(null, deps), /poškozený/);
  await assert.rejects(T.read(await ShareLink.pack('{"x":1}'), deps), /není odkaz na přenos/);
  await assert.rejects(T.read(await ShareLink.pack(JSON.stringify({ app: 'atlas', v: B.V + 1, data: {} })), deps), /novější verze ATLAS – obnov stránku/);
  // cizí vstup se pročistí: HTML a neznámá pole se nedostanou dál
  const evil = JSON.stringify({ app: 'atlas', v: B.V, data: { trips: [{ name: '<img src=x onerror=alert(1)>', dest: 'X', start: '2026-11-12', end: '2026-11-13', days: {}, checklist: [], evil: 1 }], fav: [{ id: 'metro:LIS', label: '<b>Lisabon</b>', __proto__: { polluted: 1 } }] } });
  const inc = await T.read(await ShareLink.pack(evil), deps);
  assert.equal(inc.trips[0].evil, undefined);
  assert.equal(({}).polluted, undefined);
});

test('fromHash: adresa #sync= se uklidí hned (data nezůstanou v historii), pak náhled; jiný # nic nedělá', async () => {
  replaced.length = 0; shown.length = 0; toasts.length = 0;
  assert.equal(T.fromHash('#plan=zAB'), false);
  assert.equal(T.fromHash('#dashboard'), false);
  assert.deepEqual(replaced, []);
  const { url } = await linkOf(light());
  const hash = url.slice(url.indexOf('#'));
  assert.equal(T.fromHash(hash), true);
  assert.deepEqual(replaced, ['#dashboard'], 'synchronně, ještě před čtením odkazu');
  for (let i = 0; i < 50 && !shown.length; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(shown.length, 1, 'náhled se Sloučit / Nahradit (Backup.incoming)');
  assert.equal(shown[0].watch.length, 2);
  // poškozený odkaz: hláška, žádný náhled
  T.fromHash('#sync=zZZZ');
  for (let i = 0; i < 50 && !toasts.length; i++) await new Promise((r) => setTimeout(r, 5));
  assert.match(toasts[0][0], /poškozený/);
  assert.equal(toasts[0][1], 'err');
  assert.equal(shown.length, 1);
});

test('Sloučit: opakovaný přenos nic nezdvojí; Nahradit: jen data z odkazu, domov zůstane, když ho odkaz nemá', async () => {
  const mine = device({
    trips: [{ ...plannerOnly(), pid: 'aaaaaaaa1' }, plannerOnly({ name: 'Řím', dest: 'Řím', iso: 'IT', start: '2026-12-01', end: '2026-12-04', pid: 'bbbbbbbb2' })],
    watch: [watch('w1', '2026-11-01'), watch('w2', '2026-11-08')], home, visited: ['CZ', 'AT', 'DE'],
    fav: [dest('LIS', 'PT'), dest('OPO', 'PT')], mute: [dest('LON', 'GB')], pins: [pin(3)], accessOwn: { VIE: 350 },
  });
  const other = device({
    trips: [{ ...plannerOnly(), name: 'Lisabon (upraveno)', pid: 'aaaaaaaa1' }, plannerOnly({ name: 'Krakov', dest: 'Krakov', iso: 'PL', start: '2027-01-10', end: '2027-01-12', pid: 'cccccccc3' })],
    watch: [watch('w1', '2026-11-01'), watch('w3', '2026-11-15')], visited: ['CZ', 'PT'], fav: [dest('LIS', 'PT')], pins: [pin(4)],
  });
  const { url } = await linkOf(other);
  const inc = await T.read(T.payloadOf(url), deps);
  const cur = { ...mine, own: mine.accessOwn };
  // Sloučit (merge jako u zálohy): přibude Krakov, w3, PT, 📌; nic nezmizí; podruhé už nic
  const m = B.merge(cur, inc, { watchKey: wk, deps });
  assert.deepEqual(plain(m.trips.map((t) => t.name)), ['Lisabon s kamarády', 'Řím', 'Krakov']);
  assert.deepEqual(plain(m.watch.map((w) => w.id)), ['w1', 'w2', 'w3']);
  const again = B.diff({ ...m, pretrip: {} }, inc, { watchKey: wk, deps });
  assert.deepEqual([again.trips.add, again.watch.add, again.visited.add, again.pins.add, again.dests.fav], [0, 0, 0, 0, 0]);
  // Nahradit
  const r = B.replace(cur, inc, { watchKey: wk, deps });
  assert.deepEqual(plain(r.trips.map((t) => t.name)), ['Lisabon (upraveno)', 'Krakov']);
  assert.deepEqual(plain(r.watch.map((w) => w.id)), ['w1', 'w3']);
  assert.deepEqual(plain(r.visited), ['CZ', 'PT']);
  assert.deepEqual(plain(r.fav.map((x) => x.key)), ['LIS']);
  assert.deepEqual(plain(r.mute), []);
  assert.deepEqual(plain(r.own), {});
  assert.equal(r.pins.length, 1);
  assert.notEqual(r.pins[0].k, mine.pins[0].k);
  assert.deepEqual(plain(r.home), home, 'odkaz domov nemá – zůstane ten ze zařízení');
  assert.deepEqual(plain(B.replace(cur, { ...inc, home: { from: [{ ...BRQ, id: 'ap:PRG', iata: 'PRG', label: 'Praha' }], radius: 100, adults: 1 } }, { watchKey: wk, deps }).home.from.map((p) => p.iata)), ['PRG']);
  // co by Nahradit smazalo nebo přepsalo (potvrzovací okno)
  assert.deepEqual(plain(B.lost(cur, inc, { watchKey: wk, deps })), { trips: 1, changed: 1, watch: 1, pins: 1, dests: 2, visited: 2 });
  assert.deepEqual(plain(B.lost(cur, B.parse(B.pack(mine), deps), { watchKey: wk, deps })), { trips: 0, changed: 0, watch: 0, pins: 0, dests: 0, visited: 0 }, 'vlastní odkaz nic nesmaže');
  // vstupní pole beze změny
  assert.equal(mine.trips.length, 2);
  assert.equal(inc.trips.length, 2);
});

test('Nahradit: stejná cesta nebo hledání v odkazu dvakrát jen jednou; limity jako u sloučení', async () => {
  const twice = device({ trips: [plannerOnly(), plannerOnly()], watch: [watch('w1', '2026-11-01'), { ...watch('w1', '2026-11-01'), id: 'w1b' }, ...Array.from({ length: 14 }, (_, i) => watch(`x${i}`, `2026-12-${String(i + 1).padStart(2, '0')}`))] });
  const inc = B.parse(B.pack(twice), deps);
  const r = B.replace({ home }, inc, { watchKey: wk, deps });
  assert.equal(r.trips.length, 1);
  assert.equal(r.watch.length, B.WATCH_CAP);
  assert.equal(new Set(r.watch.map(wk)).size, r.watch.length);
});

test('počty a text „Přenese se“: české tvary, prázdné zařízení', () => {
  const c = B.counts({ trips: [1, 2], watch: [1], pins: [1], fav: [1, 2], mute: [1], visited: ['CZ', 'AT', 'DE'], home, own: { VIE: 350 } });
  assert.deepEqual(plain(c), { trips: 2, watch: 1, pins: 1, fav: 2, mute: 1, visited: 3, home: true, own: 1 });
  assert.equal(B.countsTxt(c), '2 cesty · 1 hlídaná cena · 📌 1 odložená nabídka · ⭐ 2 moje cíle · 🙈 1 skryté město · 3 země na mapě · domov radaru · 🏠 vlastní cena na 1 letiště');
  assert.equal(B.countsTxt(B.counts({ trips: Array(5), watch: Array(12), pins: Array(5), fav: Array(5), mute: Array(5), visited: Array(5) })), '5 cest · 12 hlídaných cen · 📌 5 odložených nabídek · ⭐ 5 mých cílů · 🙈 5 skrytých měst · 5 zemí na mapě');
  const none = B.counts({ trips: [], watch: [], home: null });
  assert.ok(B.isEmpty(none));
  assert.equal(B.countsTxt(none), '');
  assert.ok(!B.isEmpty(B.counts({ visited: ['CZ'] })));
});

test('velikost QR kódu: celé pixely displeje na modul, nejvýš daný prostor', () => {
  assert.equal(T.sizePx(440, 37, 1), 407); // 11 px na modul
  assert.equal(T.sizePx(380, 185, 2.625), (Math.floor((380 * 2.625) / 185) * 185) / 2.625); // verze 40 na telefonu: 5 px displeje
  assert.ok(T.sizePx(380, 185, 2.625) <= 380);
  assert.equal(T.sizePx(200, 185, 1), 200, 'pod 2 px na modul – aspoň celý prostor');
});

test('zapojení: skripty po sharelink.js a backup.js, ⋯ Další, postranní panel, odkaz při startu i ve vložené adrese, novinka', () => {
  const html = read('public/index.html'), app = read('public/js/app.js'), tf = read('public/js/transfer.js');
  const at = (f) => html.indexOf(`<script src="js/${f}"></script>`);
  assert.ok(at('sharelink.js') > 0 && at('backup.js') > at('sharelink.js') && at('qr.js') > at('backup.js') && at('transfer.js') > at('qr.js'));
  assert.match(app, /if \(window\.Transfer\) Transfer\.addToMenu\(list\);/);
  assert.match(app, /if \(!shared && !plan && window\.Transfer && Transfer\.fromHash\(\)\) return go\('dashboard', \{ noHash: true \}\);/, 'start');
  assert.match(app, /if \(window\.Transfer && Transfer\.fromHash\(\)\) return go\('dashboard', \{ noHash: true \}\);/, 'hashchange');
  assert.match(tf, /insertAdjacentHTML\('afterend', '<button type="button" class="theme-toggle side-about" id="sideXfer">/, 'počítač: postranní panel');
  assert.doesNotMatch(tf, /\son[a-z]+="/, 'žádné obsluhy v atributech (CSP)');
  assert.match(app, /\['📲', 'Přenos do jiného zařízení QR kódem'/);
});
