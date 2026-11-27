// Přání majitele P1: průběh hledání (#progress, renderProgress ve flights.js) je v základu sbalený – během hledání
// i po něm, i s chybou zdroje (tu vysvětlí karta pod průběhem); rozbalení otevřené uživatelem překreslení nezavře.
// Postup letů cesty přes víc měst (.ml-prog) zůstane v řádku vidět. Ikony Letsi místo ✎ a 📡.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const SearchHelp = ctx.window.SearchHelp;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const src = fl.match(/\n {2}function renderProgress\([\s\S]*?\n {2}\}\n/)[0];
// zástupné #progress: z HTML si pamatuje jen kartu průběhu (třídu a open), aby šlo „rozkliknout“ jako uživatel
function load() {
  const host = { det: null, html: '' };
  Object.defineProperty(host, 'innerHTML', {
    get() { return this.html; },
    set(h) { this.html = h; const m = h.match(/<details class="card progress-card (\w+)"( open)?>/); this.det = m && { cls: m[1], open: Boolean(m[2]) }; },
  });
  const $ = (sel, root) => {
    if (sel === '#progress') return host;
    const m = root === host && sel.match(/^details\.progress-card(?:\.(\w+))?$/);
    if (m) return host.det && (!m[1] || host.det.cls === m[1]) ? host.det : null;
    return null; // summary ani #moreRoutes zástupné DOM nemá → vždy celé překreslení
  };
  const F = new Function('$', 'esc', 'SearchHelp', `
    const health = null, originPreview = [], lastResultAt = Date.now(), rerun = () => {};
    const provColor = () => '#000', provName = id => id, shopName = id => id, plural = (n, a, b, c) => n + ' ' + c;
    const doneHead = n => 'Prohledáno ' + n + ' letišť';
    ${src}; return renderProgress;`);
  return { host, render: F($, esc, SearchHelp) };
}
const prov = (id, state, extra = {}) => ({ id, state, calls: 4, done: state === 'running' ? 2 : 4, ...extra });
const running = { providers: [prov('ryanair', 'running'), prov('wizzair', 'running')] };
const failed = { providers: [prov('ryanair', 'done', { found: 35 }), prov('wizzair', 'error', { error: 'výpadek na straně aerolinky (HTTP 503)' })] };
const res = { mode: 'oneway', origins: [{}, {}], stats: { ms: 8400 }, legs: [] };

test('před prvními výsledky jen řádek se spinnerem a nadpisem, řádky zdrojů ve sbaleném <details>', () => {
  const { host, render } = load();
  render({ providers: [] }, true);
  assert.match(host.innerHTML, /^<details class="card progress-card run"><summary class="ph"><span class="ph-txt"><span class="spin"><\/span> Prohledávám letiště…<\/span><span class="ps-more faint">podrobnosti<\/span><\/summary><\/details>$/);
  render(running, false);
  assert.equal(host.det.open, false);
  assert.match(host.innerHTML, /<\/summary><div class="prow running">[\s\S]*wizzair[\s\S]*<\/details>$/, 'zdroje až za řádkem');
});

test('po dohledání sbalené i s chybou zdroje (dřív se s chybou rozbalilo přes celou obrazovku)', () => {
  const { host, render } = load();
  render({ providers: [] }, true);
  render(failed, false, res);
  assert.deepEqual(host.det, { cls: 'done', open: false });
  assert.match(host.innerHTML, /<div class="pnote err">výpadek na straně aerolinky \(HTTP 503\)<\/div>/, 'chyba v podrobnostech zůstane');
});

test('rozbalení otevřené uživatelem překreslení nezavře (průběh, průběžné výsledky, dohledáno); nové hledání začne sbalené', () => {
  const { host, render } = load();
  render({ providers: [] }, true);
  host.det.open = true; // uživatel klepl na „podrobnosti“
  render(running, false);
  assert.deepEqual(host.det, { cls: 'run', open: true });
  render(running, false, null, true);
  assert.deepEqual(host.det, { cls: 'part', open: true });
  render(failed, false, res);
  assert.deepEqual(host.det, { cls: 'done', open: true });
  render(failed, false, res); // překreslení po načtení /api/health (jména obchodů)
  assert.equal(host.det.open, true);
  render({ providers: [] }, true);
  assert.deepEqual(host.det, { cls: 'run', open: false });
});

test('cesta přes víc měst: postup letů je v řádku (vidět i sbalené), zdroje za ním', () => {
  const { host, render } = load();
  render({ providers: running.providers, legs: [{ label: 'Praha → Řím', state: 'done' }, { label: 'Řím → Praha', state: 'running' }] }, false);
  assert.match(host.innerHTML, /<span class="ps-more faint">podrobnosti<\/span><div class="ml-prog"><span class="done">✓ 1\. Praha → Řím<\/span><span class="running"><span class="spin"><\/span> 2\. Řím → Praha<\/span><\/div><\/summary><div class="prow running">/);
  assert.match(readFileSync(new URL('../public/css/flights.css', import.meta.url), 'utf8'), /\.progress-card summary \.ml-prog\{flex-basis:100%;/);
});

test('ikony Letsi: Upravit na kartě sbaleného hledání a karta výpadku zdroje bez ✎ a 📡', () => {
  assert.ok(fl.includes(`id="ssEdit">\${ikona('upravit')} Upravit</button>`));
  assert.ok(!fl.includes('✎ Upravit'));
  for (const id of ['lcRetry', 'kiwiRetry']) {
    const line = fl.split('\n').find(l => l.includes(`id="${id}"`));
    assert.ok(line.includes(`kiwi-note">\${ikona('info')}<div>`) && !line.includes('📡'), id);
  }
});
