// Regresní kontrola start (PWA): pruh „Probouzím server“ neposouvá Přehled, lišta novinek nezakryje kartu souhlasu,
// novinky a pruh offline bez emoji (ikony Letsi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const APP = read('public/js/app.js');
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = (?:.*\\{\\n[\\s\\S]*?^\\};|.*)|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');

test('pruh Probouzím server: plovoucí karta mimo tok stránky, lišta novinek počká, nová verze má přednost', () => {
  const css = read('public/css/flights.css'), fl = read('public/js/flights.js'), pwa = read('public/css/pwa.css');
  assert.match(css, /^\.wake-bar\{position:fixed;[^}]*z-index:90;/m, 'pod oknem (z-index 100)');
  assert.match(css, /@media\(max-width:860px\)\{\.wake-bar\{left:12px;right:12px;width:auto;bottom:calc\(88px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /^body:has\(\.pwa-update:not\(\[hidden\]\)\) \.wake-bar\{display:none\}$/m);
  const wb = fl.slice(fl.indexOf('function wakeBar('), fl.indexOf('\n  }\n', fl.indexOf('function wakeBar(')));
  assert.match(wb, /document\.body\.append\(bar\);/);
  assert.doesNotMatch(wb, /main\.prepend|demo\.after/, 'v toku stránky posouval celý Přehled');
  assert.match(pwa, /^body:has\(#wakeBar\) \.wn-pop\{display:none\}$/m);
});

test('wnHold: lišta novinek čeká jen na Přehledu s viditelnou kartou v #whatsNew', () => {
  const wnHold = new Function(`${pick('wnHold')}; return wnHold;`)();
  assert.equal(wnHold({ hidden: false }, 'dashboard'), true);
  assert.equal(wnHold({ hidden: true }, 'dashboard'), false);
  assert.equal(wnHold({ hidden: false }, 'flights'), false);
  assert.equal(wnHold(null, 'dashboard'), false);
});

test('whatsNewPop: s kartou souhlasu na Přehledu nic nevloží ani neoznačí za viděné, zkusí to znovu', () => {
  const run = (cardHidden) => {
    const set = [], timers = [];
    let created = 0;
    const ctx = {
      activeView: 'dashboard', WN_ID: '2026-12-01a', WN_POP: 3,
      wnSince: () => '2026-11-01a', wnNew: () => [['let', 'A', 't', '2026-12-01a']],
      wnMark: () => set.push('mark'),
      $: (s) => (s === '#whatsNew' ? { hidden: cardHidden } : null),
      setTimeout: (fn, ms) => timers.push([fn, ms]),
      document: { createElement: () => { created++; throw new Error('stop'); } },
    };
    vm.runInNewContext(`${pick('wnHold', 'whatsNewPop')}; this.pop = whatsNewPop;`, ctx);
    try { ctx.pop(); } catch (e) { assert.equal(e.message, 'stop'); }
    return { set, timers, created, pop: ctx.pop };
  };
  const held = run(false);
  assert.equal(held.created, 0, 'lišta by kartu zakryla');
  assert.deepEqual(held.set, [], 'neoznačit za viděné – jinak by novinky propadly');
  assert.equal(held.timers.length, 1);
  assert.equal(held.timers[0][0], held.pop);
  assert.equal(run(true).created, 1, 'bez karty se lišta ukáže');
});

test('lišta novinek na nízkém telefonu (do 800 px, 360×780) jen 30 % výšky – nesahá přes Najít lety', () => {
  assert.match(read('public/css/pwa.css'), /@media\(max-width:860px\) and \(max-height:800px\)\{\.wn-pop\{max-height:30vh\}\}/);
});

test('novinky: první prvek položky je ikona Letsi (existující soubor a třída .i-…), ve wnLi přes ikona()', () => {
  const list = vm.runInNewContext(APP.match(/^const WHATS_NEW = (\[[\s\S]*?^\]);/m)[1]);
  const css = read('public/css/atlas.css');
  for (const [ic, title] of list) {
    assert.ok(existsSync(new URL(`../public/vendor/letsi/ikony/${ic}.svg`, import.meta.url)), `${title}: ${ic}`);
    assert.ok(css.includes(`.i-${ic}{`), `${title}: .i-${ic}`);
  }
  assert.match(pick('wnLi'), /<span class="wn-ic" aria-hidden="true">\$\{ikona\(ic\)\}<\/span>/);
});

test('pruh Jsi offline bez emoji', () => {
  const line = read('public/js/pwa.js').match(/offBar\.innerHTML = '([^']*)'/)[1];
  assert.match(line, /^<b>Jsi offline\.<\/b>/);
  assert.doesNotMatch(line, /\p{Extended_Pictographic}/u);
});
