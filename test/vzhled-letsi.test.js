// Vzhled značky Letsi, krok 1 (public/css/letsi.css): přepínač ?vzhled=letsi v úvodním skriptu index.html a pravidla
// stylu – bez přepínače se aplikace nesmí změnit (každé pravidlo pod :root[data-brand="letsi"]), paleta bez Rajčete
// a bez přechodů, písma z vlastního serveru s licencí. Úvodní skript běží v node:vm s napodobeným prohlížečem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const INDEX = read('index.html');
const CSS = read('css/letsi.css');
const BOOT = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("localStorage.getItem('atlas_v1')"));

/** Start stránky na adrese href s obsahem localStorage store → atribut data-brand, uložená volba a adresa po startu. */
function boot(href, store = {}) {
  const attrs = {}, ls = { ...store };
  let url = href;
  const win = {
    URL,
    location: { get href() { return url; }, get search() { return new URL(url).search; } },
    history: { state: null, replaceState: (s, t, u) => { url = new URL(u, url).href; } },
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelectorAll: () => [] },
    matchMedia: () => ({ matches: true }),
    performance: { now: () => 0 },
  };
  win.window = win;
  vm.runInNewContext(BOOT, win, { filename: 'index-boot.js' });
  return { brand: attrs['data-brand'], theme: attrs['data-theme'], look: ls.atlas_look ?? null, url };
}

test('přepínač: ?vzhled=letsi uloží volbu a nastaví data-brand, parametr z adresy zmizí', () => {
  assert.deepEqual(boot('https://x.cz/?vzhled=letsi#flights'), { brand: 'letsi', theme: 'light', look: 'letsi', url: 'https://x.cz/#flights' });
  // ostatní parametry adresy zůstanou
  assert.equal(boot('https://x.cz/?a=1&vzhled=letsi&b=2#trip').url, 'https://x.cz/?a=1&b=2#trip');
  // uložená volba platí i bez parametru
  assert.deepEqual(boot('https://x.cz/', { atlas_look: 'letsi' }), { brand: 'letsi', theme: 'light', look: 'letsi', url: 'https://x.cz/' });
});

test('přepínač: ?vzhled=atlas volbu smaže, bez volby žádný atribut (vzhled ATLASu beze změny)', () => {
  assert.deepEqual(boot('https://x.cz/?vzhled=atlas', { atlas_look: 'letsi' }), { brand: undefined, theme: 'light', look: null, url: 'https://x.cz/' });
  assert.deepEqual(boot('https://x.cz/#dashboard'), { brand: undefined, theme: 'light', look: null, url: 'https://x.cz/#dashboard' });
  // neznámá hodnota nic neuloží (jen zmizí z adresy)
  assert.deepEqual(boot('https://x.cz/?vzhled=neon'), { brand: undefined, theme: 'light', look: null, url: 'https://x.cz/' });
  // bez localStorage (soukromé okno, zakázané úložiště) start nespadne a motiv se nastaví
  const r = (() => { const w = { document: { documentElement: { setAttribute() {} }, querySelectorAll: () => [] }, performance: { now: () => 0 } };
    w.window = w; Object.defineProperty(w, 'localStorage', { get() { throw new Error('SecurityError'); } });
    vm.runInNewContext(BOOT, w); return true; })();
  assert.ok(r);
});

/** Seznam selektorů rozdělený jen podle čárek mimo závorky (:is(…, …) zůstane celé). */
function splitTop(head) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of head) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  return [...out, cur.trim()];
}

/** Selektory všech pravidel (i uvnitř @media) a seznam @-pravidel nejvyšší úrovně. */
function rules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = [], at = [];
  const walk = (s) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (depth && j < s.length) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
      const body = s.slice(open + 1, j - 1);
      if (head.startsWith('@media')) walk(body);
      else if (head.startsWith('@')) at.push(head);
      else sels.push(...splitTop(head));
      i = j;
    }
  };
  walk(src);
  return { sels, at };
}

test('letsi.css: každé pravidlo je pod :root[data-brand="letsi"] – bez přepínače se nic nezmění', () => {
  const { sels, at } = rules(CSS);
  assert.ok(sels.length > 80, `${sels.length} selektorů`);
  assert.deepEqual(sels.filter((s) => !s.startsWith(':root[data-brand="letsi"]')), []);
  // jediná @-pravidla mimo @media jsou písma (stáhnou se, až je použije pravidlo pod data-brand)
  assert.deepEqual([...new Set(at)], ['@font-face']);
  // desktopové úpravy do kroku 1 nepatří (a na počítači patří jen do desktop*.css)
  assert.doesNotMatch(CSS, /min-width:\s*1024px/);
});

test('letsi.css: paleta – žádné Rajče, žádné přechody ani sklo, Pistácie nikdy jako text nebo linka', () => {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /#df3a14|223,\s*58,\s*20/i, 'Rajče (slunce) přijde až s kukátkem');
  assert.doesNotMatch(src, /(linear|radial|conic)-gradient/);
  assert.doesNotMatch(src, /backdrop-filter:\s*(?!none)/, 'sklo');
  // Pistácie jen jako plocha (background, fill, --proměnná pro plochu), nikdy color, border, outline ani stín
  for (const m of src.matchAll(/([a-z-]+)\s*:[^;{}]*#d6de82/gi)) assert.match(m[1], /^(background|fill|--grad|--grad-warm|--letsi-tlacitko|--letsi-pistacie)$/, m[0]);
});

test('písma Letsi: soubory a licence OFL z vlastního serveru, @font-face se swap, styl načtený za základními', () => {
  const fonts = [...CSS.matchAll(/url\(\.\.\/(vendor\/fonts\/letsi\/[^)]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(fonts.sort(), ['onest-400', 'onest-500', 'onest-600', 'onest-700', 'unbounded-600', 'unbounded-700'].map((f) => `vendor/fonts/letsi/${f}.woff2`));
  for (const f of [...fonts, 'vendor/fonts/letsi/OFL-Onest.txt', 'vendor/fonts/letsi/OFL-Unbounded.txt']) assert.ok(existsSync(new URL(`../public/${f}`, import.meta.url)), f);
  assert.match(read('vendor/fonts/letsi/OFL-Unbounded.txt'), /SIL Open Font License/);
  assert.match(read('vendor/fonts/letsi/OFL-Onest.txt'), /SIL Open Font License/);
  assert.equal((CSS.match(/@font-face\{[^}]*font-display:swap/g) || []).length, 6);
  assert.match(read('vendor/LICENSES.txt'), /fonts\/letsi\/OFL-Onest\.txt/);
  const links = [...INDEX.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.indexOf('css/letsi.css'), links.indexOf('css/pretrip.css') + 1, links.join(', '));
});
