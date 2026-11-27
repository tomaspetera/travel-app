// Co je nového jen od minula: okno ani lišta nevedou archiv starých novinek, každá novinka má id (WN_ID, se kterým
// přibyla) a v atlas_wn_top je jen id poslední viděné. Starší zápisy (WN_ID\nnázev, jen název) fungují dál.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = (?:.*\\{\\n[\\s\\S]*?^\\};|.*)|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
const fnBody = (n) => APP.slice(APP.indexOf(`function ${n}(`), APP.indexOf('\n}\n', APP.indexOf(`function ${n}(`)));

const load = (S) => new Function('S', `${pick('WN_NEW', 'firstVisit', 'wnMode', 'WN_DAYS', 'wnSeenId', 'wnNew')}; return { wnSeenId, wnNew };`)(S);
const L = [['✨', 'E', 't', '2026-12-10a'], ['✨', 'D', 't', '2026-12-03b'], ['✨', 'C', 't', '2026-12-03a'], ['✨', 'B', 't', '2026-11-20a'], ['✨', 'A', 't', '2026-11-01c']];
const ID = '2026-12-10a';
const titles = (xs) => xs.map((x) => x[1]);

test('co je nové od minula: nový uživatel, nic nového, 2 nové, starý WN_ID', () => {
  const S = { home: null, trip: null, trips: [], recent: [], watch: [] };
  const { wnSeenId, wnNew } = load(S);
  const NOW = Date.parse('2026-12-10T12:00:00Z'); // novinky starší než 14 dní (před 26. 11.) už nikomu
  const fresh = (top, seen, now = NOW) => titles(wnNew(wnSeenId(top, seen, L, ID), L, now));
  // nový uživatel (nic uloženého, uvítání) nedostane nic – dostane uvítání
  assert.deepEqual(fresh(null, null), [], 'úplně nový');
  S.home = { from: [{ id: 'city:PRG' }] }; S.recent = [{}];
  assert.deepEqual(fresh(null, ID + '+vitej'), [], 'během první návštěvy');
  // nic nového: viděl poslední sadu
  assert.deepEqual(fresh(ID, ID), []);
  // 2 nové od minula
  assert.deepEqual(fresh('2026-12-03a', ID), ['E', 'D']);
  // starý zápis „WN_ID\nnázev“ – rozhoduje WN_ID, i když novinka s tím názvem už je z pole smazaná
  assert.deepEqual(fresh('2026-12-03a\nC', ID), ['E', 'D']);
  assert.deepEqual(fresh('2026-11-01c\nDávno smazaná', ID), ['E', 'D', 'C'], 'jen čerstvé (B je starší než 14 dní), ne celý archiv');
  // dávný starý WN_ID: jen novinky z posledních 14 dní, nikdy víc
  assert.equal(wnNew(wnSeenId('2025-01-01a\nX', ID, L, ID), L, NOW).length, 3);
  // po 14 dnech zmizí novinka všem – i tomu, kdo ji neviděl
  assert.deepEqual(fresh('2026-12-03a', ID, Date.parse('2027-01-15T12:00:00Z')), []);
  // nejstarší zápis jen s názvem
  assert.deepEqual(fresh('C', ID), ['E', 'D']);
  assert.deepEqual(fresh('neznámá', ID), [], 'neznámý název → nic místo všech');
  // bez atlas_wn_top: kartu s aktuální sadou skryl → nic, jinak jen nejnovější
  assert.deepEqual(fresh(null, ID), []);
  assert.deepEqual(fresh(null, '2026-11-01c'), ['E']);
  // uvítání se starou sadou už neplatí – novinky od té doby ano
  assert.deepEqual(fresh('2026-12-03b', '2026-12-03b+vitej'), ['E']);
});

test('pole novinek: nejnovější nahoře s id = WN_ID, id neklesají, staré se mažou', () => {
  const WN_ID = APP.match(/^const WN_ID = '([^']+)';/m)[1];
  const wn = vm.runInNewContext(APP.match(/^const WHATS_NEW = (\[[\s\S]*?^\]);/m)[1]);
  assert.equal(wn[0][3], WN_ID, 'nová novinka nahoře nese aktuální WN_ID');
  for (const [i, x] of wn.entries()) {
    assert.equal(x.length, 4, x[1]);
    assert.match(x[3], /^\d{4}-\d\d-\d\d[a-z]$/, x[1]);
    if (i) assert.ok(x[3] <= wn[i - 1][3], `${x[1]}: id nesmí být větší než u novinky nad ní`);
  }
  assert.ok(wn.length >= 1);
  assert.match(APP, /^const WN_DAYS = 14;/m);
  // archiv se nevede – novinky starší než 14 dní se nikomu neukážou, z pole je mažeme (s rezervou: rozpětí nejvýš 30 dní)
  const days = (id) => Date.parse(id.slice(0, 10)) / 864e5;
  assert.ok(days(wn[0][3]) - days(wn[wn.length - 1][3]) <= 30, 'staré novinky z pole smazat');
});

test('okno Co je nového: jen nové od minula, jinak jen „Od minula nic nového“, bez archivu; otevřením viděné', () => {
  const open = fnBody('whatsNewOpen');
  assert.match(open, /const fresh = wnNew\(wnSince\(\) \?\? WN_ID\);\n  wnMark\(\);/);
  assert.match(open, /Od minula nic nového\./);
  assert.doesNotMatch(open, /Naposledy přibylo|WHATS_NEW\.slice/, 'když nic nového, nic dalšího (majitel 27. 11.)');
  assert.doesNotMatch(APP, /Starší novinky|wn-more/);
  assert.doesNotMatch(readFileSync(new URL('../public/css/atlas.css', import.meta.url), 'utf8'), /\.wn-more/);
  // lišta i okno počítají od stejného „minula“ (zapamatovaného při startu); zapisuje se jen id, starší stránka nepřepíše
  const pop = fnBody('whatsNewPop');
  assert.match(pop, /const since = wnSince\(\);\n[^\n]*\n  if \(since == null \|\| since > WN_ID\) return;/);
  assert.match(pop, /const fresh = wnNew\(since\)/);
  assert.match(pick('wnMark'), /wnSince\(\) <= WN_ID\) try \{ localStorage\.setItem\(WN_TOP_LS, WN_ID\); \}/);
});

test('okno v prohlížeči: nové od minula, pak nic nového; lišta i okno stejné „minulo“', () => {
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const run = (wnTop) => {
    let html = '';
    if (wnTop != null) store.atlas_wn_top = wnTop; else delete store.atlas_wn_top;
    store.atlas_wn = 'stará';
    const ctx = {
      S: { home: { from: [{}] }, trip: null, trips: [], recent: [{}], watch: [] }, localStorage: ls,
      ikona: () => '', esc: (s) => s, modalOpen: (h) => { html = h; }, modalClose: () => {}, $$: () => [],
    };
    // „dnes“ = den po nejnovější novince, ať test nestárne s kalendářem (novinky mizí po WN_DAYS)
    const newest = Date.parse(APP.match(/^const WN_ID = '(\d{4}-\d\d-\d\d)/m)[1]) + 864e5;
    ctx.Date = class extends Date { static now() { return newest; } };
    const code = [APP.match(/^const WN_ID = [^\n]*/m)[0], APP.match(/^const WHATS_NEW = \[[\s\S]*?^\];/m)[0],
      pick('WN_NEW', 'firstVisit', 'wnMode', 'WN_DAYS', 'wnUnit', 'wnLi', 'WN_TOP_LS', 'wnSeenId', 'wnNew'),
      APP.match(/^let wnSinceMem;\nfunction wnSince\(\) \{[\s\S]*?^\}/m)[0], pick('wnMark'), pick('whatsNewOpen'),
      'this.open = whatsNewOpen; this.WHATS_NEW = WHATS_NEW; this.WN_ID = WN_ID;'].join('\n');
    vm.runInNewContext(code, ctx);
    ctx.open(); const first = html;
    ctx.open();
    return { first, second: html, ctx };
  };
  // viděl předposlední sadu: v okně jen ty novější, ne celý seznam; podruhé (týž start) totéž
  const { first, second, ctx } = run(null);
  assert.equal((first.match(/<li>/g) || []).length, ctx.WHATS_NEW.filter((x) => x[3] === ctx.WN_ID).length);
  assert.ok(first.includes(ctx.WHATS_NEW[0][1]));
  assert.equal(first, second, 'týž start: okno ukáže totéž');
  assert.equal(store.atlas_wn_top, ctx.WN_ID, 'zapsané jen id');
  assert.doesNotMatch(first, /Od minula nic nového/);
  // další start: nic nového → jen krátká věta
  const again = run(ctx.WN_ID).first;
  assert.match(again, /Od minula nic nového\./);
  assert.equal((again.match(/<li>/g) || []).length, 0);
  // starý zápis „WN_ID\nnázev“ s dávno smazanou novinkou: jen co v poli je a není starší než 14 dní
  const old = run('2026-10-01a\nPřenos do jiného zařízení').first;
  const live = ctx.WHATS_NEW.filter((x) => Date.parse(x[3].slice(0, 10)) >= ctx.Date.now() - 14 * 864e5).length;
  assert.ok(live >= 1);
  assert.equal((old.match(/<li>/g) || []).length, live);
});
