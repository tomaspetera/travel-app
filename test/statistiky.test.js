// Stránka Statistiky pro majitele (public/statistiky.html + public/js/statistiky.js): výpočty z GET /api/stats jako
// čisté funkce přes node:vm (bez prohlížeče), servírování se stejnou CSP jako stránka aplikace a mimo offline sadu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { EVENTS } = await import('../server/lib/counts.js');
const { serviceWorker } = await import('../server/lib/pwa.js');
const { pageCsp } = await import('../server/lib/security.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// bez document: skript jen vystaví window.Stats a nic nevykresluje
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(read('public/js/statistiky.js'), ctx, { filename: 'statistiky.js' });
const S = ctx.window.Stats;
const plain = (x) => JSON.parse(JSON.stringify(x)); // objekty z vm mají jiný Object.prototype – deepEqual je jinak odmítne

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('všechny události stránky jsou v EVENTS serveru – překlep by se tiše ukazoval jako 0', () => {
  const used = [...S.MAIN.map(([e]) => e), ...S.PRICES.map(([e]) => e), ...S.DOORS.flatMap((d) => [d.shown, ...d.clicks.map(([e]) => e)]),
    ...S.VIEWS.map(([e]) => e), ...S.TABLE.map(([e]) => e), 'plus_page', 'look_letsi', 'trip_summary', 'trip_saved'];
  assert.deepEqual(used.filter((e) => !EVENTS.includes(e)), []);
  // každá událost ze seznamu serveru se na stránce někde ukáže
  const src = read('public/js/statistiky.js');
  assert.deepEqual(EVENTS.filter((e) => !src.includes(`'${e}'`)), []);
});

test('prázdná data: nuly, žádné procento ani medián, žádná chyba', () => {
  for (const stats of [{ days: [], total: {} }, {}, null, { days: [{ day: '2027-01-12', counts: {} }] }]) {
    const total = S.totals(stats);
    assert.deepEqual(plain(total), {});
    assert.deepEqual(plain(S.funnel(total)).map((s) => [s.n, s.pct]), [[0, null], [0, null], [0, null], [0, null], [0, null], [0, null]]);
    const sv = S.survey(total);
    assert.equal(sv.answers, 0);
    assert.equal(sv.median, null);
    assert.equal(sv.atLeast399, null);
    assert.equal(sv.few, true);
    assert.ok(sv.options.every((o) => o.n === 0 && o.pct === null));
    assert.ok(S.doors(total).every((d) => d.shown === 0 && d.clicks.every((c) => c.n === 0 && c.pct === null)));
  }
  assert.deepEqual(plain(S.dayRows(undefined)), []);
  assert.equal(S.num(undefined, 'app_open'), 0);
  assert.equal(S.num({ app_open: '7' }, 'app_open'), 7, 'číslo jako text');
  for (const bad of [null, 'x', -3, NaN, Infinity]) assert.equal(S.num({ app_open: bad }, 'app_open'), 0, String(bad));
  assert.equal(S.num({}, 'toString'), 0, 'jen vlastní klíče, ne z prototypu');
});

test('procenta: dělení nulou null, zaokrouhlení, trychtýř proti předchozímu kroku (i přes 100 %)', () => {
  assert.equal(S.pct(5, 0), null);
  assert.equal(S.pct(0, 0), null);
  assert.equal(S.pct(0, 10), 0);
  assert.equal(S.pct(1, 3), 33);
  assert.equal(S.pct(2, 3), 67);
  assert.equal(S.pct(30, 10), 300);
  const f = plain(S.funnel({ app_open: 200, search_done: 300, verify_click: 30, buy_click: 15, trip_started: 9, trip_summary: 0, trip_saved: 2 }));
  assert.deepEqual(f.map((s) => s.label), ['Otevření aplikace', 'Hledání', 'Ověření nebo proklik', 'Průvodce cestou', 'Shrnutí', 'Uložená cesta']);
  assert.deepEqual(f.map((s) => s.n), [200, 300, 45, 9, 0, 2]);
  assert.deepEqual(f.map((s) => s.pct), [null, 150, 15, 20, 0, null], 'po kroku s nulou se nedělí');
  const d = plain(S.doors({ limit_shown: 40, limit_plus: 10, limit_download: 3, plus_offer_click: 2 }));
  assert.deepEqual(d.map((x) => x.shown), [40, 0, 0, 0]);
  assert.deepEqual(d[0].clicks.map((c) => [c.label, c.n, c.pct]), [['chci Plus', 10, 25], ['stáhnout', 3, 8], ['nahradit', 0, 0]]);
  assert.deepEqual(d[1].clicks.map((c) => c.pct), [null], 'klepnutí bez zobrazení – procento nedává smysl');
  assert.equal(S.fmtPct(null), '–');
  assert.equal(S.fmtPct(25), '25 %');
  assert.equal(S.fmtNum(1234567), '1 234 567');
  assert.equal(S.fmtNum(999), '999');
});

test('průzkum ceny Plus: medián z rozložení, podíl aspoň 399 Kč, málo odpovědí', () => {
  assert.equal(S.median([]), null);
  assert.equal(S.median([[0, 0], [199, 0]]), null);
  assert.equal(S.median([[399, 1]]), 399);
  assert.equal(S.median([[0, 1], [199, 1], [399, 1]]), 199, 'lichý počet: prostřední');
  assert.equal(S.median([[0, 1], [399, 1]]), 199.5, 'sudý počet: průměr dvou prostředních');
  assert.equal(S.median([[799, 1], [0, 5]]), 0, 'pořadí vstupu nehraje roli');
  assert.equal(S.median([[0, 2], [199, 2], [399, 1]]), 199);
  const sv = plain(S.survey({ price_0: 10, price_199: 5, price_399: 10, price_599: 3, price_799: 2 }));
  assert.equal(sv.answers, 30);
  assert.deepEqual(sv.options.map((o) => [o.label, o.n, o.pct]), [['Nic', 10, 33], ['199 Kč', 5, 17], ['399 Kč', 10, 33], ['599 Kč', 3, 10], ['799 Kč', 2, 7]]);
  assert.equal(sv.median, 299, '15. odpověď 199, 16. 399');
  assert.equal(sv.atLeast399, 50);
  assert.equal(sv.few, false, '30 odpovědí už stačí');
  assert.equal(S.survey({ price_799: 29 }).few, true);
  assert.equal(S.survey({ price_799: 29 }).atLeast399, 100);
  assert.equal(S.fmtKc(299), '299 Kč');
  assert.equal(S.fmtKc(199.5), '200 Kč');
  assert.equal(S.fmtKc(null), '–');
});

test('součty a dny: nejnovější nahoře, chybějící událost 0, total ze serveru, jinak ze dnů', () => {
  const stats = {
    days: [
      { day: '2027-01-10', counts: {} },
      { day: '2027-01-12', counts: { app_open: 3, trip_saved: 1 } },
      { day: '2027-01-11', counts: { app_open: 1, search_done: 4 } },
      { day: 'nesmysl', counts: { app_open: 99 } },
    ],
    total: { app_open: 4, search_done: 4, trip_saved: 1 },
  };
  const rows = plain(S.dayRows(stats.days));
  assert.deepEqual(rows.map((r) => r.day), ['2027-01-12', '2027-01-11', '2027-01-10']);
  assert.deepEqual(rows[0].values, [3, 0, 0, 0, 0, 1], 'sloupce: otevření, hledání, ověření, proklik, průvodce, uložené');
  assert.deepEqual(rows[2].values, [0, 0, 0, 0, 0, 0], 'den bez dat jako nuly');
  assert.deepEqual(plain(S.dayRows([{ day: '2027-01-12' }], ['app_open'])), [{ day: '2027-01-12', values: [0] }]);
  assert.deepEqual(plain(S.totals(stats)), stats.total);
  assert.deepEqual(plain(S.totals({ days: stats.days.slice(0, 3) })), { app_open: 4, trip_saved: 1, search_done: 4 });
  assert.equal(S.fmtDay('2027-01-12'), 'út 12. 1.');
  assert.equal(S.fmtDay('2026-11-01'), 'ne 1. 11.');
  assert.deepEqual([undefined, '7', '30', 90, '14', 'x', '0'].map(S.period), [30, 7, 30, 90, 30, 30, 30]);
});

test('stránka: česky, noindex, bez vložených skriptů a bez odkazu z aplikace', () => {
  const html = read('public/statistiky.html');
  assert.match(html, /<html lang="cs">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<script src="js\/statistiky\.js"><\/script>/);
  assert.equal([...html.matchAll(/<script\b(?![^>]*\ssrc=)[^>]*>/gi)].length, 0, 'vložený skript by CSP zablokovala');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'obsluhy v atributech CSP nespustí');
  assert.doesNotMatch(html, /fonts\.googleapis|https?:\/\//, 'nic z cizích serverů');
  assert.doesNotMatch(html, /gradient/i);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  for (const f of ['public/index.html', 'public/js/app.js', 'public/js/trip.js', 'public/js/flights.js', 'public/js/about.js']) {
    assert.doesNotMatch(read(f), /statistiky\.(?:html|js)/, `${f} na stránku neodkazuje`);
  }
  assert.match(read('public/js/statistiky.js'), /Počty teď nejsou dostupné\./);
});

test('server: stránka se stejnou CSP jako aplikace (bez vložených skriptů), skript jako JS, obojí mimo offline sadu', async () => {
  const r = await fetch(`${base}/statistiky.html`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/html/);
  assert.equal(r.headers.get('content-security-policy'), pageCsp(''));
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'; /);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.match(await r.text(), /<title>Statistiky/);
  const js = await fetch(`${base}/js/statistiky.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /^text\/javascript/);
  // 304 na shodný obsah dostane stejnou CSP – podle ní prohlížeč stránku z mezipaměti spustí
  const again = await fetch(`${base}/statistiky.html`, { headers: { 'If-None-Match': r.headers.get('etag') } });
  assert.equal(again.status, 304);
  assert.equal(again.headers.get('content-security-policy'), pageCsp(''));
  const { precache } = serviceWorker({ publicDir: path.join(ROOT, 'public'), dataDir: path.join(ROOT, 'data') });
  assert.ok(precache.length > 10);
  assert.deepEqual(precache.filter((u) => /statistiky/.test(u)), []);
});

/** Stránka ve falešném prohlížeči: #stats, tlačítka období a fetch, který vrátí reply (nebo vyhodí). */
async function renderWith(reply, search = '') {
  const root = { innerHTML: '', setAttribute() {}, removeAttribute() {} };
  const asked = [];
  const c = {
    window: {}, URLSearchParams, location: { search }, history: { replaceState() {} },
    document: { getElementById: (id) => (id === 'stats' ? root : null), querySelectorAll: () => [] },
    fetch: async (u) => { asked.push(u); if (reply instanceof Error) throw reply; return reply; },
  };
  vm.createContext(c);
  vm.runInContext(read('public/js/statistiky.js'), c, { filename: 'statistiky.js' });
  await new Promise((r) => setTimeout(r, 10));
  return { html: root.innerHTML, asked };
}

test('vykreslení: období z adresy, čísla i nuly; 503 a výpadek sítě jednou větou', async () => {
  const stats = { days: [{ day: '2027-01-11', counts: { app_open: 3 } }, { day: '2027-01-12', counts: {} }], total: { app_open: 3, price_399: 2 } };
  const { html, asked } = await renderWith({ ok: true, json: async () => stats }, '?dni=7');
  assert.deepEqual(asked, ['api/stats?days=7']);
  assert.match(html, /Hlavní čísla za 7 dní/);
  assert.match(html, /Otevření aplikace<\/th><td>3</);
  assert.match(html, /Uložené cesty<\/th><td>0</, 'událost, kterou ještě nikdo nevyvolal');
  assert.match(html, /Odpovědí je zatím málo/);
  assert.ok(html.indexOf('po 11.') > html.indexOf('út 12.'), 'nejnovější den nahoře');
  assert.doesNotMatch(html, /undefined|NaN|null/);
  assert.deepEqual((await renderWith({ ok: true, json: async () => stats }, '?dni=abc')).asked, ['api/stats?days=30']);
  for (const reply of [{ ok: false, status: 503, json: async () => ({ error: 'x' }) }, new Error('offline')]) {
    assert.equal((await renderWith(reply)).html, '<p class="warn">Počty teď nejsou dostupné.</p>');
  }
});

test('stats z API se dají přímo vykreslit: tvar odpovědi /api/stats', async () => {
  const r = await fetch(`${base}/api/stats?days=7`);
  assert.equal(r.status, 200);
  const stats = await r.json();
  assert.equal(S.dayRows(stats.days).length, 7);
  assert.equal(S.funnel(S.totals(stats)).length, 6);
});
