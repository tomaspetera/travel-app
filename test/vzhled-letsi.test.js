// Vzhled značky Letsi, kroky 1 a 2 (public/css/letsi.css): přepínač ?vzhled=letsi v úvodním skriptu index.html, barva
// lišty prohlížeče a pravidla stylu – bez přepínače se aplikace nesmí změnit (každé pravidlo pod :root[data-brand="letsi"]),
// paleta bez Rajčete, bez přechodů, modré a fialové, písma z vlastního serveru s licencí. Úvodní skript běží v node:vm
// s napodobeným prohlížečem.
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
  const metas = [0, 1].map(() => ({ content: '#080c1a', setAttribute(k, v) { this[k] = v; } }));
  let url = href;
  const win = {
    URL,
    location: { get href() { return url; }, get search() { return new URL(url).search; } },
    history: { state: null, replaceState: (s, t, u) => { url = new URL(u, url).href; } },
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelectorAll: (q) => (q === 'meta[name="theme-color"]' ? metas : []) },
    matchMedia: () => ({ matches: true }),
    performance: { now: () => 0 },
  };
  win.window = win;
  vm.runInNewContext(BOOT, win, { filename: 'index-boot.js' });
  return { brand: attrs['data-brand'], theme: attrs['data-theme'], look: ls.atlas_look ?? null, url, bar: [...new Set(metas.map((m) => m.content))] };
}

test('přepínač: ?vzhled=letsi uloží volbu a nastaví data-brand, parametr z adresy zmizí', () => {
  assert.deepEqual(boot('https://x.cz/?vzhled=letsi#flights'), { brand: 'letsi', theme: 'light', look: 'letsi', url: 'https://x.cz/#flights', bar: ['#F3F4F0'] });
  // ostatní parametry adresy zůstanou
  assert.equal(boot('https://x.cz/?a=1&vzhled=letsi&b=2#trip').url, 'https://x.cz/?a=1&b=2#trip');
  // uložená volba platí i bez parametru
  assert.deepEqual(boot('https://x.cz/', { atlas_look: 'letsi' }), { brand: 'letsi', theme: 'light', look: 'letsi', url: 'https://x.cz/', bar: ['#F3F4F0'] });
});

test('přepínač: ?vzhled=atlas volbu smaže, bez volby žádný atribut (vzhled ATLASu beze změny)', () => {
  assert.deepEqual(boot('https://x.cz/?vzhled=atlas', { atlas_look: 'letsi' }), { brand: undefined, theme: 'light', look: null, url: 'https://x.cz/', bar: ['#eef2fb'] });
  assert.deepEqual(boot('https://x.cz/#dashboard'), { brand: undefined, theme: 'light', look: null, url: 'https://x.cz/#dashboard', bar: ['#eef2fb'] });
  // neznámá hodnota nic neuloží (jen zmizí z adresy)
  assert.deepEqual(boot('https://x.cz/?vzhled=neon'), { brand: undefined, theme: 'light', look: null, url: 'https://x.cz/', bar: ['#eef2fb'] });
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
  // pseudoprvek uvnitř :is(…) prohlížeč nevybere (pravidlo by tiše neplatilo)
  assert.doesNotMatch(src, /:is\([^{]*::/);
  // čísla kroků uvítání mají pozadí --accent (v tmavém Vápno) – bílé písmo z atlas.css by na něm zmizelo
  assert.match(src, /:is\([^)]*\.wc-steps \.wc-n\)\{color:var\(--letsi-na-grad\)/);
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

/** Je hex barva modrá nebo fialová? Odstín 190–300°, sytost nad 25 % a barevnost (max − min) aspoň 40 – Noc #14161F
 *  a tmavé šedé Letsi mají modrý nádech (odstín ~230°), ale barevnost jen 11–20, takže jako modrá nepůsobí. */
function cool(hex) {
  const h = hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d < 40) return false;
  const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const deg = (x * 60 + 360) % 360;
  return deg >= 190 && deg <= 300 && d / mx > 0.25;
}

test('cool: modrá a fialová ATLASu se pozná, Noc, Vápno, Pistácie a šedé ne', () => {
  for (const c of ['#5b8cff', '#2563eb', '#7c3aed', '#a855f7', '#1e40af']) assert.ok(cool(c), c);
  for (const c of ['#14161F', '#F3F4F0', '#D6DE82', '#EDEFD6', '#2A2E3A', '#A6ACB6', '#343A48', '#fff', '#c22a45']) assert.ok(!cool(c), c);
});

test('letsi.css krok 2: žádná modrá ani fialová, ceny barvou textu, stupnice a kalendář bez barev ATLASu', () => {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual([...src.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]).filter(cool), []);
  assert.doesNotMatch(src, /rgba?\(\s*(91|168|37|124),/, 'modrá a fialová ATLASu v rgba');
  // zelené částky (hlavička výsledků, cenový kalendář) a hotové kroky průvodce → barvou textu / Pistácie s Nocí
  assert.match(src, /\] b\.good\{color:var\(--text\)\}/);
  assert.match(src, /\] \.cd b\{color:var\(--text\)/);
  assert.match(src, /\] \.cd\.sel\{background:var\(--surface-2\);box-shadow:inset 0 0 0 2px var\(--text\)/, 'vybraný den: pěna + lem 2 px');
  // „Je to dobrá cena?“: plné úseky (pseudoprvky), ne přechod z flights.css
  assert.match(src, /\] \.pc-bar\{[^}]*background:var\(--letsi-roleta\)/);
  assert.match(src, /\] \.pc-bar::before\{[^}]*background:#D6DE82/);
  // Sdílet cestu: tlačítko jako hlavní (dřív přechod modrá–fialová)
  assert.match(src, /\] \.jed-go2\{background:var\(--letsi-tlacitko\)/);
  // spodní lišta: aktivní položka bez plochy, tučně barvou textu; ostatní text-3
  assert.match(src, /\.mobile-nav \.mi\.active\{background:none;color:var\(--text\)/);
  assert.match(src, /\] \.mobile-nav \.mi\{color:var\(--faint\)\}/);
  // tmavý režim: třetí text na čipu o stupeň světlejší (#8E949E na #2A2E3A je 4,44 : 1)
  assert.match(src, /\[data-theme="dark"\] :is\(\.chip,[^)]*\)\{--faint:#A6ACB6\}/);
});

test('barva lišty prohlížeče: se vzhledem Letsi Vápno / Noc (úvodní skript i pwa.js), jinak beze změny', () => {
  const bg = (t) => CSS.match(new RegExp(`\\[data-theme="${t}"\\]\\{[^}]*--bg:(#[0-9A-Fa-f]{6})`))[1];
  assert.deepEqual([bg('light'), bg('dark')], ['#F3F4F0', '#14161F']);
  assert.deepEqual(boot('https://x.cz/', { atlas_look: 'letsi' }).bar, [bg('light')]);
  assert.deepEqual(boot('https://x.cz/', { atlas_look: 'letsi', atlas_v1: JSON.stringify({ theme: 'dark' }) }).bar, [bg('dark')]);
  assert.deepEqual(boot('https://x.cz/', { atlas_v1: JSON.stringify({ theme: 'dark' }) }).bar, ['#080c1a']);
  const PWA = read('js/pwa.js');
  assert.match(PWA, new RegExp(`const THEME_LETSI = \\{ dark: '${bg('dark')}', light: '${bg('light')}' \\}`));
  assert.match(PWA, /dataset\.brand === 'letsi' \? THEME_LETSI : THEME/);
});
