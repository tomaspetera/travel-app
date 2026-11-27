// ⋯ Další a okna na počítači: Letsi Plus jde otevřít z postranního panelu, okna bez záhlaví mají ✕, texty neradí
// cestu „Další → …“, která na počítači není, prázdný Přenést na počítači neradí skenovat QR kód a řádky nabídky mají
// ikony Letsi místo barevných emoji. Klasické skripty přes node:vm, funkce z app.js podle jména (jako a11y.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const appJs = read('public/js/app.js');
/** Funkce nebo konstanta z app.js podle jména (na jednom řádku, nebo víceřádková do „}“ na začátku řádku). */
const pick = (name) => {
  const m = appJs.match(new RegExp(`^(function ${name}\\([^\\n]*\\}|function ${name}\\([\\s\\S]*?^\\}|const ${name} = .*)$`, 'm'));
  assert.ok(m, `app.js: ${name}`);
  return m[0];
};

test('Letsi Plus v postranním panelu počítače: tlačítko za přepínačem motivu otevře stránku Zdarma × Plus, jen jednou', () => {
  const els = {};
  const toggle = { insertAdjacentHTML: (where, html) => { assert.equal(where, 'afterend'); els.html = html; els['#sidePlus'] = { onclick: null }; } };
  const document = { querySelector: (s) => (s === '#themeToggle' ? toggle : els[s] || null) };
  const ctx = { window: {}, document };
  vm.runInNewContext(read('public/js/plus.js'), ctx);
  assert.equal(els.html, '<button type="button" class="theme-toggle side-about" id="sidePlus"><span class="ico i-oblibene" aria-hidden="true"></span> Letsi Plus</button>');
  assert.equal(els['#sidePlus'].onclick, ctx.window.Plus.open);
  // druhé načtení (už vložené tlačítko) nic nepřidá
  els.html = null;
  vm.runInNewContext(read('public/js/plus.js'), { window: {}, document });
  assert.equal(els.html, null);
});

test('✕ Zavřít: modalOpen přidá křížek jen oknům, která o něj požádají (o.x); Plus, O aplikaci, Přenést a Další ho mají', () => {
  // jen jako křížky v záhlaví ostatních oken (stejná ikona i jméno) a se společnou obsluhou [data-close]
  assert.match(pick('modalOpen'), /\$\('#modal'\)\.innerHTML = \(o\.x \? `<button type="button" class="modal-close mc-plain" data-close aria-label="Zavřít">\$\{ico\('M18 6L6 18M6 6l12 12'\)\}<\/button>` : ''\) \+ html;/);
  assert.match(appJs, /\$\('#modal'\)\.addEventListener\('click', e => \{ if \(e\.target\.closest && e\.target\.closest\('\[data-close\]'\)\) modalClose\(\); \}\);/);
  assert.match(pick('openMore'), /<\/div>`, \{ x: true \}\);/);
  assert.match(read('public/js/about.js'), /modalOpen\(html\(\{[^\n]*\}\), \{ x: true \}\);/);
  assert.equal(read('public/js/transfer.js').match(/\$\{PASTE\}<\/div>`, \{ x: true \}\);/g).length, 2, 'Přenést prázdný i s daty');
  const plus = read('public/js/plus.js');
  assert.match(plus, /modalOpen\(pageHtml\(\), \{ x: true \}\);/);
  assert.match(plus, /modalOpen\(sesitHtml\([^\n]*\), \{ x: true \}\);/);
  // křížek v okně bez fotky má barvy okna (průsvitný tmavý byl pro fotku) a nadpis pod něj neteče
  const css = read('public/css/atlas.css');
  assert.match(css, /^\.modal-close\.mc-plain\{background:var\(--surface-2\);border-color:var\(--border-2\);color:var\(--text\)\}$/m);
  assert.match(css, /^\.mc-plain\+\.modal-body>h3:first-child\{padding-right:44px\}$/m);
});

test('texty: Novinky, souhlas a O aplikaci ukazují cestu, která je i na počítači (tam Další není)', () => {
  const wn = vm.runInNewContext(appJs.match(/^const WHATS_NEW = (\[[\s\S]*?^\]);/m)[1]);
  const bad = wn.filter(([, , t]) => /<b>Další<\/b>/.test(t) && !/na (počítači|telefonu)/.test(t)).map(([, n]) => n).join(', ');
  assert.equal(bad, '', 'novinka s „Další“ musí říct, kde to je na počítači');
  const card = pick('helpCard');
  assert.match(card, /Platí, dokud to nevypneš v Další nebo v O aplikaci a soukromí\./);
  assert.match(card, /toast\('Zapnuto\. Díky! Vypnout to jde kdykoli v Další nebo v O aplikaci a soukromí\.'\)/);
  assert.doesNotMatch(card, /v Další\.['<]/);
  assert.doesNotMatch(read('public/js/about.js'), /zapneš v Další/, 'přepínač je v okně O aplikaci, Další na počítači není');
});

test('prázdný Přenést: na počítači odkaz poslaný sem nebo vložený do pole, ne „fotoaparátem tohohle telefonu“', () => {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/js/transfer.js'), ctx);
  const pc = ctx.Transfer.emptyLead(true), phone = ctx.Transfer.emptyLead(false);
  assert.doesNotMatch(pc, /naskenuj|telefonu/);
  assert.match(pc, /pošli si odkaz sem \(e-mailem nebo do chatu sám sobě\) – otevři ho tady, nebo ho vlož do pole níž\. Máš soubor zálohy\? Obnovíš ho tady\.$/);
  assert.match(phone, /pošli si odkaz sem \(AirDropem, Quick Share, e-mailem nebo do chatu sám sobě\) – otevři ho tady, nebo ho vlož do pole níž\. Máš soubor zálohy\? Obnovíš ho tady\.$/);
  assert.doesNotMatch(phone, /QR|naskenuj/);
  // počítač = postranní panel místo lišty s ⋯ Další (atlas.css @media(max-width:860px) .sidebar{display:none})
  assert.match(read('public/js/transfer.js'), /window\.matchMedia\('\(min-width:861px\)'\)\.matches/);
  assert.match(read('public/css/atlas.css'), /@media\(max-width:860px\)\{\n {2}\.app\{grid-template-columns:1fr\}\n {2}\.sidebar\{display:none\}/);
});

test('řádky ⋯ Další: ikony Letsi místo ⭐ a ➕, stejná mezera před šedým popiskem', () => {
  assert.match(read('public/js/plus.js'), /id="morePlus"><span class="ico i-oblibene" aria-hidden="true"><\/span> \$\{h\(NAME\)\} <span class="faint">/);
  const pwa = read('public/js/pwa.js');
  assert.match(pwa, /b\.innerHTML = `\$\{ICON\}\$\{LABEL\} <span class="faint">i offline<\/span>`;/);
  assert.match(pwa, /side\.innerHTML = ICON \+ LABEL;/, 'postranní panel taky s ikonou, ne holý text');
  const css = read('public/css/pwa.css');
  assert.doesNotMatch(css, /\.pwa-menu-item \.faint\{[^}]*margin-left/, 'mezeru dělá gap tlačítka jako u ostatních řádků');
  assert.match(css, /\.side-foot \.pwa-install>\.ico\{margin-right:\.45em\}/);
  // ikony z modulů mimo seznam test/ikony-letsi.test.js musí mít pravidlo v atlas.css
  const atlas = read('public/css/atlas.css');
  for (const n of ['oblibene', 'plus']) assert.match(atlas, new RegExp(`^\\.i-${n}\\{--ico:url\\(\\.\\./vendor/letsi/ikony/${n}\\.svg\\)\\}$`, 'm'));
});
