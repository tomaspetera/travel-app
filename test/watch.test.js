// Upozornění do mobilu (scripts/watch.mjs, .github/workflows/watch.yml): kód z aplikace, hlídané ceny se stejnými
// pravidly jako v aplikaci, týdenní tip, kontrola, že ATLAS hledá – proti falešnému serveru a ntfy (bez sítě).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import {
  decodeWatch, isPastQuery, bestOf, wake, notify, runAlerts, runTips, runHealth, tipsQuery, healthQuery, DEFAULT_HOME,
} from '../scripts/watch.mjs';

const BASE = 'https://atlas.example';
const TODAY = '2026-10-07';
const zcode = (o) => 'z' + deflateRawSync(Buffer.from(JSON.stringify(o))).toString('base64url');
const q = (over = {}) => ({ from: ['ap:PRG'], to: ['ap:BCN'], radiusKm: 0, dateFrom: '2026-11-01', dateTo: '2026-11-30', trip: 'return', nightsMin: 3, nightsMax: 5, adults: 1, kmRate: 1, groundMode: 'transit', arrival: true, ...over });
const PROVIDERS = [{ id: 'ryanair', name: 'Ryanair', enabled: true }, { id: 'wizzair', name: 'Wizz Air', enabled: true }, { id: 'kiwi', name: 'Kiwi', enabled: false }];
const group = (label, czk, out = '2026-11-03', back = '2026-11-07', from = 'PRG') => ({ dest: { label }, best: { perPersonCzk: czk, out: { date: out, from }, back: { date: back } } });

/** Falešná síť: server ATLASu (/api/health, /api/search jako NDJSON) a ntfy; zaznamená dotazy. */
function net({ health = () => ({ ok: true, providers: PROVIDERS }), result = () => ({ groups: [group('Barcelona', 2605)], providers: [] }), searchError = null } = {}) {
  const calls = { health: 0, search: [], ntfy: [] };
  const fetch = async (url, init = {}) => {
    url = String(url);
    if (url === `${BASE}/api/health`) {
      const h = health(++calls.health);
      if (h instanceof Error) throw h;
      return h.status ? new Response('nedostupné', { status: h.status }) : new Response(JSON.stringify(h), { status: 200 });
    }
    if (url === `${BASE}/api/search`) {
      const body = JSON.parse(init.body);
      calls.search.push(body);
      const err = searchError && searchError(body);
      const lines = [{ type: 'progress', done: 1 }, err ? { type: 'error', error: err } : { type: 'result', result: result(body, calls.search.length) }];
      return new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { status: 200 });
    }
    if (url === 'https://ntfy.sh/') {
      calls.ntfy.push(JSON.parse(init.body));
      return new Response('{}', { status: 200 });
    }
    throw new Error(`nečekaná adresa ${url}`);
  };
  return { fetch, calls };
}
const sleeps = [];
const sleep = async (ms) => { sleeps.push(ms); };
const quiet = () => {};

test('decodeWatch: kód z aplikace (zkomprimovaný, krátký base64url i JSON), jen známá pole, nejvýš 12 hledání', () => {
  const doc = { v: 1, home: { from: ['ap:PRG', 5, 'ap:BRQ'], radiusKm: 999, label: 'Praha, Brno' }, w: [{ id: 'a', label: 'Praha → Barcelona\u0007', p: q(), target: 3000, czk: '3400', notified: -5 }, { id: 'x', label: 'bez dotazu' }, ...Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, label: `#${i}`, p: q() }))] };
  for (const code of [zcode(doc), Buffer.from(JSON.stringify(doc)).toString('base64url'), JSON.stringify(doc)]) {
    const d = decodeWatch(code);
    assert.equal(d.watches.length, 12, 'jako v aplikaci nejvýš 12');
    assert.deepEqual(d.watches[0], { id: 'a', label: 'Praha → Barcelona', p: q(), target: 3000, czk: null, notified: null });
    assert.ok(!d.watches.some((w) => w.id === 'x'), 'bez dotazu se nedá hledat');
    assert.deepEqual(d.home, { from: ['ap:PRG', 'ap:BRQ'], radiusKm: 600, label: 'Praha, Brno' });
  }
  assert.deepEqual(decodeWatch(''), { watches: [], home: null });
  assert.deepEqual(decodeWatch(undefined), { watches: [], home: null });
  for (const bad of ['z!!!', 'zAAAA', '<script>', 'eyJ2IjoyfQ', JSON.stringify({ v: 2 }), 'z' + 'A'.repeat(50000)]) assert.throws(() => decodeWatch(bad), undefined, bad.slice(0, 20));
});

test('isPastQuery a bestOf: jako hlídané ceny v aplikaci (termín pryč; nejlevnější na osobu, cesta přes víc měst)', () => {
  assert.equal(isPastQuery(q({ dateTo: '2026-10-06' }), TODAY), true);
  assert.equal(isPastQuery(q({ dateTo: '2026-10-07' }), TODAY), false);
  assert.equal(isPastQuery(q({ exactOut: '2026-10-06', dateTo: '2027-01-01' }), TODAY), true);
  assert.equal(isPastQuery({ trip: 'multi', legs: [{ date: '2026-10-20' }, { date: '2026-10-05' }] }, TODAY), true);
  assert.equal(isPastQuery({ trip: 'multi', legs: [{ date: '2026-10-20' }] }, TODAY), false);
  assert.deepEqual(bestOf({ groups: [group('Řím', 1900, '2026-11-02', '2026-11-05'), group('Barcelona', 1500), { dest: {}, best: { perPersonCzk: 0 } }] }), { czk: 1500, desc: 'Barcelona · út 3. 11. – so 7. 11. · z PRG' });
  assert.deepEqual(bestOf({ groups: [{ dest: { label: 'Oslo' }, best: { perPersonCzk: 900, out: { date: '2026-11-02', from: 'BER' } } }] }), { czk: 900, desc: 'Oslo · po 2. 11. · z BER' }, 'jednosměrný');
  const multi = { mode: 'multi', combos: [{ perPersonCzk: 4200, picks: [0, 1] }], legs: [{ options: [{ out: { date: '2026-11-02', from: 'PRG', to: 'LIS' } }] }, { options: [null, { out: { date: '2026-11-09', from: 'OPO', to: 'PRG' } }] }] };
  assert.deepEqual(bestOf(multi), { czk: 4200, desc: 'po 2. 11. PRG→LIS · po 9. 11. OPO→PRG' });
  assert.equal(bestOf({ groups: [] }), null);
  assert.equal(bestOf(null), null);
});

test('wake: uspaný server probudí (zkouší dál po chybě i 503), pak to vzdá', async () => {
  const seq = [new Error('ECONNRESET'), { status: 503 }, { ok: true, providers: PROVIDERS }];
  const n = net({ health: (i) => seq[i - 1] });
  sleeps.length = 0;
  assert.equal((await wake(BASE, { fetch: n.fetch, sleep })).ok, true);
  assert.deepEqual(sleeps, [30000, 30000]);
  const down = net({ health: () => new Error('timeout') });
  await assert.rejects(wake(BASE, { fetch: down.fetch, sleep, tries: 3 }), /server neodpovídá \(timeout\)/);
  assert.equal(down.calls.health, 3);
});

test('notify: JSON na ntfy.sh (čeština v titulku), bez tématu jen do logu', async () => {
  const n = net();
  const log = [];
  assert.equal(await notify({ title: '📉 Zlevnilo: Praha → Řím', message: 'a\nb', click: BASE }, { topic: 'atlas-tajne', fetch: n.fetch, log: (m) => log.push(m) }), true);
  assert.deepEqual(n.calls.ntfy, [{ topic: 'atlas-tajne', title: '📉 Zlevnilo: Praha → Řím', message: 'a\nb', priority: 3, click: BASE }]);
  assert.equal(await notify({ title: 't', message: 'm' }, { topic: '', fetch: n.fetch, log: (m) => log.push(m) }), false);
  assert.equal(n.calls.ntfy.length, 1);
  assert.match(log.join('\n'), /📨 t\nm/);
});

test('runAlerts: pod limitem upozorní jednou, stejnou cenu znovu nehlásí, zlevnění ano; proběhlé a chybné přeskočí', async () => {
  let price = 2605;
  const n = net({ result: (body) => ({ groups: [group(body.to[0] === 'ap:FCO' ? 'Řím' : 'Barcelona', body.to[0] === 'ap:FCO' ? 1900 : price)] }), searchError: (body) => (body.to[0] === 'ap:LIS' ? 'Wizz Air: HTTP 503' : null) });
  const code = zcode({ v: 1, w: [
    { id: 'a', label: 'Praha → Barcelona', p: q(), target: 3000, czk: 5000 },
    { id: 'b', label: 'Praha → Řím', p: q({ to: ['ap:FCO'], dateTo: '2026-10-06' }) }, // proběhlé
    { id: 'c', label: 'Praha → Lisabon', p: q({ to: ['ap:LIS'] }) }, // hledání selže
  ] });
  const state = {};
  const run = () => runAlerts({ code, base: BASE, state, today: TODAY, topic: 'atlas-tajne', fetch: n.fetch, sleep, log: quiet });
  assert.deepEqual(await run(), { checked: 1, sent: 1 });
  assert.deepEqual(n.calls.search.map((b) => b.to[0]), ['ap:BCN', 'ap:LIS'], 'proběhlé se nehledá');
  assert.deepEqual(n.calls.search[0], q(), 'dotaz přesně z aplikace');
  assert.equal(n.calls.ntfy[0].title, '🎯 Pod tvým limitem: Praha → Barcelona');
  assert.equal(n.calls.ntfy[0].message, '2 605 Kč na osobu · limit 3 000 Kč\nBarcelona · út 3. 11. – so 7. 11. · z PRG');
  assert.equal(n.calls.ntfy[0].click, `${BASE}/#dashboard`, 'klepnutí otevře Hlídané ceny (Přehled)');
  assert.ok(!/BCN|Barcelona|PRG/.test(JSON.stringify(state)), 've stavu (mezipaměť GitHubu) jen otisk hledání');
  assert.deepEqual(Object.values(state.alerts)[0], { last: 2605, notified: 2605 });
  await run();
  assert.equal(n.calls.ntfy.length, 1, 'stejná cena podruhé ne');
  price = 2400;
  await run();
  assert.equal(n.calls.ntfy.length, 2);
  assert.match(n.calls.ntfy[1].message, /^2 400 Kč na osobu/);
  // smazané hledání ze stavu vypadne; bez kódu se nic nehledá
  await runAlerts({ code: zcode({ v: 1, w: [] }), base: BASE, state, today: TODAY, topic: 'x', fetch: n.fetch, sleep, log: quiet });
  const before = n.calls.search.length;
  assert.deepEqual(await runAlerts({ code: '', base: BASE, state: {}, today: TODAY, topic: 'x', fetch: n.fetch, sleep, log: quiet }), { checked: 0, sent: 0 });
  assert.equal(n.calls.search.length, before);
});

test('runAlerts: zlevnění o 3 % bez limitu – „📉 Zlevnilo“ s procenty, menší výkyv ne', async () => {
  let price = 2000;
  const n = net({ result: () => ({ groups: [group('Barcelona', price)] }) });
  const code = zcode({ v: 1, w: [{ id: 'a', label: 'Praha → Barcelona', p: q(), czk: 2000 }] });
  const state = {};
  const run = () => runAlerts({ code, base: BASE, state, today: TODAY, topic: 't', fetch: n.fetch, sleep, log: quiet });
  price = 1960; await run(); // −2 %
  assert.equal(n.calls.ntfy.length, 0);
  price = 1890; await run(); // −3,6 % od minulé kontroly
  assert.equal(n.calls.ntfy.length, 1);
  assert.equal(n.calls.ntfy[0].title, '📉 Zlevnilo: Praha → Barcelona');
  assert.match(n.calls.ntfy[0].message, /^1 890 Kč na osobu \(−4 %\)/);
});

test('runTips: víkendy z domova (odlet pá/so, návrat ne/po), nejlevnější napřed; bez kódu z Prahy', async () => {
  const n = net({ result: () => ({ groups: [group('Řím', 1900), group('Poznaň', 1040, '2026-10-16', '2026-10-18'), group('Milán', 1487, '2026-11-20', '2026-11-22', 'VIE')] }) });
  const code = zcode({ v: 1, w: [], home: { from: ['ap:BRQ'], radiusKm: 150, label: 'Brno' } });
  assert.deepEqual(await runTips({ code, base: BASE, today: TODAY, topic: 't', fetch: n.fetch, sleep, log: quiet, top: 2 }), { sent: 1, rows: 2 });
  assert.deepEqual(n.calls.search[0], tipsQuery({ from: ['ap:BRQ'], radiusKm: 150 }, TODAY));
  assert.deepEqual([n.calls.search[0].outDays, n.calls.search[0].backDays, n.calls.search[0].dateFrom, n.calls.search[0].dateTo], [[5, 6], [0, 1], '2026-10-10', '2026-12-05']);
  assert.equal(n.calls.ntfy[0].title, '✈️ Levné víkendy · Brno +150 km');
  assert.deepEqual(n.calls.ntfy[0].message.split('\n').slice(1), ['1 040 Kč · Poznaň · pá 16. 10. – ne 18. 10. · z PRG', '1 487 Kč · Milán · pá 20. 11. – ne 22. 11. · z VIE']);
  await runTips({ code: '', base: BASE, today: TODAY, topic: 't', fetch: n.fetch, sleep, log: quiet });
  await runTips({ code: 'poškozený', base: BASE, today: TODAY, topic: 't', fetch: n.fetch, sleep, log: quiet });
  assert.deepEqual([n.calls.search[1].from, n.calls.search[2].from], [DEFAULT_HOME.from, DEFAULT_HOME.from]);
  const empty = net({ result: () => ({ groups: [] }) });
  assert.deepEqual(await runTips({ code: '', base: BASE, today: TODAY, topic: 't', fetch: empty.fetch, sleep, log: quiet }), { sent: 0 });
  assert.equal(empty.calls.ntfy.length, 0, 'bez letů nic neposílá');
});

test('runHealth: výpadek serveru hned (jednou), chyba dopravce až podruhé po sobě, vypnutý dopravce nevadí; pak „zase hledá“', async () => {
  let mode = 'ok';
  const providers = () => [
    { id: 'ryanair', name: 'Ryanair', state: 'done', found: 40 },
    { id: 'wizzair', name: 'Wizz Air', state: mode === 'wizz' ? 'error' : 'done', found: 0, error: mode === 'wizz' ? 'HTTP 503' : null },
    { id: 'kiwi', name: 'Kiwi', state: 'error', found: 0, error: 'vypnuto' },
  ];
  const n = net({
    health: () => (mode === 'down' ? new Error('ECONNREFUSED') : { ok: true, providers: PROVIDERS }),
    result: () => ({ groups: mode === 'empty' ? [] : [group('Londýn', 900)], providers: providers() }),
  });
  const state = {};
  const run = () => runHealth({ base: BASE, state, today: TODAY, topic: 't', fetch: n.fetch, sleep, log: quiet });
  assert.deepEqual(await run(), { ok: true, issues: [], sent: 0 });
  assert.deepEqual(n.calls.search[0], healthQuery(TODAY));
  mode = 'wizz';
  assert.equal((await run()).sent, 0, 'jedna chyba Wizz Airu se nehlásí');
  const r = await run();
  assert.deepEqual([r.ok, r.sent], [false, 1]);
  assert.equal(n.calls.ntfy[0].title, '⚠️ ATLAS nehledá, jak má');
  assert.match(n.calls.ntfy[0].message, /^Wizz Air: HTTP 503 \(už 2× po sobě\)/);
  assert.equal((await run()).sent, 0, 'trvající potíž znovu nehlásí');
  mode = 'down';
  const d = await run();
  assert.deepEqual([d.ok, d.sent, d.issues[0]], [false, 1, 'server neodpovídá (ECONNREFUSED)'], 'nový druh potíže ano');
  assert.equal((await run()).sent, 0);
  mode = 'ok';
  assert.deepEqual(await run(), { ok: true, issues: [], sent: 1 });
  assert.equal(n.calls.ntfy.at(-1).title, '✅ ATLAS zase hledá');
  assert.equal((await run()).sent, 0);
  mode = 'empty';
  assert.deepEqual(await run(), { ok: false, issues: ['zkušební hledání nevrátilo žádné lety'], sent: 1 });
});

test('workflow: plán spouští scripts/watch.mjs se stejnými tajnými údaji, čtvrteční tip a stav v mezipaměti', () => {
  const yml = readFileSync(new URL('../.github/workflows/watch.yml', import.meta.url), 'utf8');
  const crons = [...yml.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(crons, ['17 5,15 * * *', '23 6 * * 4']);
  assert.match(yml, new RegExp(`github\\.event\\.schedule == '${crons[1].replace(/\*/g, '\\*')}' && 'tips'`), 'čtvrteční běh = tip');
  assert.match(yml, /run: node scripts\/watch\.mjs \$MODES/);
  for (const s of ['NTFY_TOPIC', 'ATLAS_WATCH']) assert.match(yml, new RegExp(`${s}: \\$\\{\\{ secrets\\.${s} \\}\\}`));
  assert.equal((yml.match(/path: \.watch-state\.json/g) || []).length, 2, 'obnovit i uložit');
  assert.match(readFileSync(new URL('../scripts/watch.mjs', import.meta.url), 'utf8'), /'\.watch-state\.json'/);
  assert.match(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /^\.watch-state\.json$/m);
  assert.match(yml, /permissions:\n {2}contents: read/);
});
