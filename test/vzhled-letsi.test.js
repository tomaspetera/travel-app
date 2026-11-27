// Vzhled značky Letsi (public/css/letsi.css) je výchozí: úvodní skript index.html nastaví data-brand="letsi" všem kromě
// nouzové volby ?vzhled=atlas (atlas_look = 'atlas'), barva lišty prohlížeče a pravidla stylu – ve vzhledu ATLASu se
// aplikace nesmí změnit (každé pravidlo pod :root[data-brand="letsi"]),
// paleta bez Rajčete, bez přechodů, modré a fialové, písma z vlastního serveru s licencí; krok 3 ikony, logo a favicon
// z public/vendor/letsi/. Úvodní skript běží v node:vm s napodobeným prohlížečem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

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

test('výchozí vzhled: bez volby data-brand="letsi" a lišta Vápno; ?vzhled=letsi smaže nouzovou volbu, parametr zmizí', () => {
  assert.deepEqual(boot('https://x.cz/#dashboard'), { brand: 'letsi', theme: 'light', look: null, url: 'https://x.cz/#dashboard', bar: ['#F3F4F0'] });
  assert.deepEqual(boot('https://x.cz/?vzhled=letsi#flights', { atlas_look: 'atlas' }), { brand: 'letsi', theme: 'light', look: null, url: 'https://x.cz/#flights', bar: ['#F3F4F0'] });
  // ostatní parametry adresy zůstanou
  assert.equal(boot('https://x.cz/?a=1&vzhled=letsi&b=2#trip').url, 'https://x.cz/?a=1&b=2#trip');
  // dřívější volba z doby přepínače (atlas_look = 'letsi') i neznámá hodnota = Letsi; neznámý parametr jen zmizí z adresy
  assert.deepEqual(boot('https://x.cz/', { atlas_look: 'letsi' }), { brand: 'letsi', theme: 'light', look: 'letsi', url: 'https://x.cz/', bar: ['#F3F4F0'] });
  assert.deepEqual(boot('https://x.cz/?vzhled=neon'), { brand: 'letsi', theme: 'light', look: null, url: 'https://x.cz/', bar: ['#F3F4F0'] });
  // bez localStorage (soukromé okno, zakázané úložiště) start nespadne a vzhled je Letsi
  const attrs = {};
  const w = { document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelectorAll: () => [] }, performance: { now: () => 0 } };
  w.window = w; Object.defineProperty(w, 'localStorage', { get() { throw new Error('SecurityError'); } });
  vm.runInNewContext(BOOT, w);
  assert.equal(attrs['data-brand'], 'letsi');
});

test('nouzová cesta ?vzhled=atlas: uloží atlas_look = atlas, bez data-brand (vzhled ATLASu beze změny) – i při dalším otevření', () => {
  assert.deepEqual(boot('https://x.cz/?vzhled=atlas'), { brand: undefined, theme: 'light', look: 'atlas', url: 'https://x.cz/', bar: ['#eef2fb'] });
  assert.deepEqual(boot('https://x.cz/#dashboard', { atlas_look: 'atlas' }), { brand: undefined, theme: 'light', look: 'atlas', url: 'https://x.cz/#dashboard', bar: ['#eef2fb'] });
  assert.deepEqual(boot('https://x.cz/', { atlas_look: 'atlas', atlas_v1: JSON.stringify({ theme: 'dark' }) }).bar, ['#080c1a']);
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

test('letsi.css: každé pravidlo je pod :root[data-brand="letsi"] – ve vzhledu ATLASu (?vzhled=atlas) se nic nezmění', () => {
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
  // den bez ceny a ✕ (nic neprošlo filtry) tlumeně – silnější selektor než .cd b / .cd span výše
  assert.match(src, /\] \.cd\.none :is\(span,b\)\{color:var\(--faint\)\}/);
  // tmavý režim: ztmavení za oknem černé, Noc na Noci by nebyla vidět
  assert.match(src, /\[data-theme="dark"\] \.modal-bg\{background:rgba\(0,0,0,\.6\)\}/);
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

test('barva lišty prohlížeče: výchozí Vápno / Noc (hlavička, úvodní skript i pwa.js), ve vzhledu ATLASu jeho barvy', () => {
  const bg = (t) => CSS.match(new RegExp(`\\[data-theme="${t}"\\]\\{[^}]*--bg:(#[0-9A-Fa-f]{6})`))[1];
  assert.deepEqual([bg('light'), bg('dark')], ['#F3F4F0', '#14161F']);
  assert.deepEqual(boot('https://x.cz/', { atlas_look: 'letsi' }).bar, [bg('light')]);
  assert.deepEqual(boot('https://x.cz/', { atlas_look: 'letsi', atlas_v1: JSON.stringify({ theme: 'dark' }) }).bar, [bg('dark')]);
  assert.deepEqual(boot('https://x.cz/', { atlas_v1: JSON.stringify({ theme: 'dark' }) }).bar, [bg('dark')]);
  assert.deepEqual(boot('https://x.cz/', { atlas_look: 'atlas', atlas_v1: JSON.stringify({ theme: 'dark' }) }).bar, ['#080c1a']);
  // hlavička před skriptem (a bez skriptu): Noc / Vápno
  assert.deepEqual([...INDEX.matchAll(/<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: (\w+)\)">/g)].map((m) => [m[2], m[1]]), [['dark', bg('dark')], ['light', bg('light')]]);
  const PWA = read('js/pwa.js');
  assert.match(PWA, new RegExp(`const THEME_LETSI = \\{ dark: '${bg('dark')}', light: '${bg('light')}' \\}`));
  assert.match(PWA, /dataset\.brand === 'letsi' \? THEME_LETSI : THEME/);
});

// ============ Krok 3: ikony rozhraní, logo, znak a favicon (public/vendor/letsi/, maska v css/letsi.css) ============
const SRC = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const pub = (f) => new URL(`../public/${f}`, import.meta.url);

test('favicon: Letsi přímo v hlavičce pro všechny (96 px pro vyhledávače, 32 px pro Safari, SVG), úvodní skript ho nemění', () => {
  const links = [...INDEX.matchAll(/<link rel="icon"([^>]*)>/g)].map((m) => [m[1].match(/href="([^"]+)"/)[1], (m[1].match(/sizes="([^"]+)"/) || [])[1]]);
  assert.deepEqual(links, [['icons/icon-96.png', '96x96'], ['vendor/letsi/favicon-32.png', '32x32'], ['vendor/letsi/favicon.svg', undefined]]);
  for (const [f] of links) assert.ok(existsSync(pub(f)), f);
  assert.doesNotMatch(BOOT, /link\[rel="icon"\]/);
});

test('vendor/letsi: každý soubor, na který letsi.css, atlas.css (ikony místo emoji) a index.html odkazují, existuje a žádný soubor navíc', () => {
  // ikony rozhraní místo emoji jsou v atlas.css (.i-…): ikona je v textu tlačítka, takže platí i bez data-brand
  const css = [...(SRC + read('css/atlas.css')).matchAll(/url\(\.\.\/(vendor\/letsi\/[^)]+)\)/g)].map((m) => m[1]);
  const boot = [...INDEX.matchAll(/href="(vendor\/letsi\/[^"]+)"/g)].map((m) => m[1]);
  // logo jako obrázek: stránky ze serveru (seo.js, pravni.js); úvodní obrazovka ho kreslí v index.html sama (.l-logo)
  const srv = ['seo', 'pravni'].flatMap((f) => [...readFileSync(new URL(`../server/lib/${f}.js`, import.meta.url), 'utf8').matchAll(/src="\/(vendor\/letsi\/[^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...css, ...boot, ...srv]);
  assert.ok(used.size >= 20, `${used.size} souborů`);
  for (const f of used) assert.ok(existsSync(pub(f)), f);
  const ls = (d) => readdirSync(pub(d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? ls(`${d}${e.name}/`) : [`${d}${e.name}`]));
  assert.deepEqual(ls('vendor/letsi/').filter((f) => !used.has(f) && !f.endsWith('README.md')), [], 'jen soubory, které aplikace používá');
  assert.match(read('vendor/letsi/README.md'), /Letsi 2\.1/);
  assert.match(read('vendor/LICENSES.txt'), /^- letsi\//m);
  // ikony z balíku kreslí tahem currentColor – maska z nich vezme tvar, barvu dodá CSS (Noc, v tmavém Vápno)
  for (const f of css.filter((x) => x.includes('/ikony/'))) assert.match(read(f), /stroke="currentColor"/, f);
});

test('obrázky a písma Letsi: v sadě pro instalaci (výchozí vzhled offline), ve vzhledu ATLASu se z letsi.css nic z nich nestáhne', async () => {
  // obrázek z CSS se stáhne, jen když pravidlo platí – každé pravidlo s url() na vendor/letsi je pod data-brand
  // (tělo bez „{“: u pravidla uvnitř @media se kontroluje jeho selektor, ne hlavička @media)
  for (const m of SRC.matchAll(/([^{}]*)\{[^{}]*url\(\.\.\/vendor\/letsi\//g)) assert.match(m[1].trim(), /^:root\[data-brand="letsi"\]/, m[1]);
  // v HTML jen favicon (platí pro oba vzhledy)
  assert.deepEqual([...INDEX.matchAll(/vendor\/letsi\/[^"']+/g)].map((m) => m[0]), ['vendor/letsi/favicon-32.png', 'vendor/letsi/favicon.svg']);
  // sada pro instalaci: všechno z url() v letsi.css (písma Unbounded a Onest, ikony, logo) a kukátko
  const { serviceWorker, cssAssets } = await import('../server/lib/pwa.js');
  const dirs = { publicDir: new URL('../public', import.meta.url).pathname, dataDir: new URL('../data', import.meta.url).pathname };
  const list = serviceWorker(dirs).precache;
  // + ikony místo emoji z atlas.css (stejné adresy vendor/letsi/ikony/…, v sadě jednou)
  const need = [...new Set([...cssAssets(CSS, 'css/letsi.css'), ...cssAssets(read('css/atlas.css'), 'css/atlas.css').filter((u) => u.startsWith('vendor/letsi/'))])];
  assert.ok(need.length >= 25 && need.some((u) => u.startsWith('vendor/fonts/letsi/')) && need.some((u) => u.startsWith('vendor/letsi/ikony/')), need.join());
  for (const u of [...need, 'js/kukatko.js', 'css/kukatko.css']) assert.ok(list.includes(u), `v sadě chybí ${u}`);
  // cssAssets: jen vlastní soubory vůči stylu, bez data:, #id a cizích webů, bez opakování
  assert.deepEqual(cssAssets('a{b:url(../x/y.svg)}/* url(z.png) */c{d:url("e.woff2"),url(data:image/png;base64,AA),url(#g),url(https://f.cz/h.png),url(\'../x/y.svg\')}', 'css/s.css'),
    ['x/y.svg', 'css/e.woff2']);
  // Inter a Sora zůstávají: ve vzhledu ATLASu a na kartách ke sdílení (sharecard.js) je pořád něco používá
  assert.match(read('js/sharecard.js'), /\['Sora', 'Inter'\]/);
});

test('manifest aplikace na ploše: název Letsi, barvy Vápno, ikony existují a mají uvedené rozměry', async () => {
  const { manifestFor } = await import('../server/lib/seo.js');
  const m = JSON.parse(manifestFor(read('manifest.webmanifest')));
  assert.deepEqual([m.name, m.short_name], ['Letsi', 'Letsi']);
  assert.deepEqual([m.theme_color, m.background_color], ['#F3F4F0', '#F3F4F0']);
  const icons = [...m.icons, ...m.shortcuts.flatMap((s) => s.icons)];
  assert.ok(icons.some((i) => i.sizes === '1024x1024') && icons.some((i) => i.purpose === 'maskable'));
  for (const i of icons) {
    const buf = readFileSync(pub(i.src));
    assert.equal(`${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`, i.sizes, i.src);
  }
  assert.ok(existsSync(pub('icons/apple-touch-icon.png')));
});

test('ikony Letsi: ikony lišt a tlačítek z index.html mají náhradu, velikosti podle sady, Lety = znak kukátka', () => {
  const icon = (head) => (SRC.match(new RegExp(`${head.replace(/[[\]().#"*+?|]/g, '\\$&')}\\{--letsi-ikona:url\\(\\.\\./vendor/letsi/([^)]+)\\)`)) || [])[1];
  assert.equal(icon(':is([data-view="flights"],[data-mv="flights"] .mt-ico)>svg'), 'letsi-znak-mono.svg');
  assert.equal(icon(':is([data-view="dashboard"],[data-mv="dashboard"] .mt-ico)>svg'), 'ikony/domov.svg');
  assert.equal(icon(':is([data-view="trip"],[data-mv="trip"] .mt-ico)>svg'), 'ikony/moje-cesty.svg');
  assert.equal(icon(':is([data-view="explore"],[data-mv="explore"] .mt-ico)>svg'), 'ikony/kompas.svg');
  assert.equal(icon(':is(#moreNav,#menuBtn)>svg'), 'ikony/menu.svg');
  assert.equal(icon('#refreshBtn>svg'), 'ikony/znovu.svg');
  for (const h of ['.theme-toggle>svg', '.sf-from .sf-ico>svg', '.sf-to .sf-ico>svg', '.sf-swap>svg', '.search-wide>svg']) assert.ok(icon(h), h);
  // tlačítka, jejichž <svg> maska přebírá, jsou v index.html opravdu tlačítka se <svg> uvnitř
  for (const id of ['refreshBtn', 'menuBtn', 'swapBtn']) assert.match(INDEX, new RegExp(`id="${id}"[^>]*>\\s*<svg`), id);
  assert.match(SRC, /:is\(\.mobile-nav \.mi,\.nav-item\)>svg\{width:24px;height:24px\}/, 'lišty 24 px');
  assert.match(SRC, /\.mobile-nav \.mi\[data-view="flights"\]>svg\{width:27px\}/, 'znak kukátka 27 px');
  assert.match(SRC, /:is\(\.icon-btn,\.theme-toggle,\.sf-ico,\.sf-swap\)>svg\{width:20px;height:20px\}/, 'tlačítka a pole 20 px');
  // logo: lišta aplikace jednobarevná (slunce patří nejlevnější ceně), úvodní obrazovka hlavní / negativ podle režimu
  assert.match(SRC, /\.brand-name\{[^}]*letsi-logo-mala-mono\.svg/);
  assert.match(SRC, /\] #launch :is\(\.l-ico,\.l-jet,b\)\{display:none\}/, 'úvodní obrazovka: logo kreslí index.html (.l-logo), ne obrázek');
});

test('logo v horní liště: jen na Přehledu a jen bez postranního panelu, jednobarevné, bez vlivu na výšku lišty', () => {
  const m = SRC.match(/@media\(max-width:860px\)\{\s*(:root\[data-brand="letsi"\] \.main:has\(#view-dashboard\.active\) #pageTitle)\{([^}]*)\}\s*\}/);
  assert.ok(m, 'pravidlo pro #pageTitle na Přehledu v @media do 860 px');
  // postranní panel s logem se skrývá právě do 860 px – logo nikdy dvakrát
  assert.match(read('css/atlas.css'), /@media\(max-width:860px\)\{\s*\.app\{grid-template-columns:1fr\}\s*\.sidebar\{display:none\}/);
  const body = m[2];
  // malé jednobarevné logo (bez slunce) barvou textu, text zůstává pro čtečku
  assert.match(body, /mask:url\(\.\.\/vendor\/letsi\/letsi-logo-mala-mono\.svg\)/);
  assert.match(body, /background:currentColor/);
  assert.match(body, /font-size:0/);
  const fills = new Set([...read('vendor/letsi/letsi-logo-mala-mono.svg').matchAll(/fill="([^"]+)"/g)].map((f) => f[1]));
  assert.deepEqual([...fills], ['#14161F'], 'logo v liště jednou barvou, bez slunce');
  // výška pod tlačítky lišty (40 px) a šířka v poměru loga – lišta ani tlačítka se neposunou
  const w = Number(body.match(/width:(\d+)px/)[1]), h = Number(body.match(/height:(\d+)px/)[1]);
  assert.ok(h < 40, `výška ${h}`);
  assert.ok(Math.abs(w / h - 4072.5 / 875.5) < 0.05, `poměr ${w}/${h}`);
  // název sekce je v liště prvek #pageTitle (index.html), Přehled je sekce #view-dashboard uvnitř .main
  assert.match(INDEX, /<div class="main">[\s\S]*id="pageTitle"[\s\S]*id="view-dashboard"/);
});

test('maska jen u ikon s náhradou: křížek Zavřít z flights.js má ikonu zavřít, ne plný čtverec barvy textu', () => {
  // maska skryje cesty ATLASu a podloží barvu textu – bez --letsi-ikona zbude čtverec, proto ne obecně .icon-btn
  const mask = SRC.split('\n').find((l) => l.includes('{-webkit-mask:var(--letsi-ikona)')).split('{')[0];
  assert.doesNotMatch(mask, /\.icon-btn(?!\[aria-label="Zavřít"\])/);
  assert.match(SRC, /\.icon-btn\[aria-label="Zavřít"\]>svg\{--letsi-ikona:url\(\.\.\/vendor\/letsi\/ikony\/zavrit\.svg\)\}/);
  const js = readdirSync(pub('js')).filter((f) => f.endsWith('.js')).map((f) => read(`js/${f}`)).join('\n');
  const btns = [...(INDEX + js).matchAll(/<button[^>]*class="icon-btn[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(btns.length >= 5, `${btns.length} tlačítek`);
  for (const b of btns) assert.match(b, /id="(refreshBtn|menuBtn)"|aria-label="Zavřít"/, b);
});

/** <svg> v HTML bez jména pro čtečku: ikona musí mít aria-hidden (sama nebo předek), nebo tlačítko či odkaz aria-label. */
function unlabeledSvgs(html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
  const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr', 'source', 'col', 'wbr']);
  const stack = [], bad = [];
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, close, tag, attrs, self] = m;
    if (close) { const i = stack.map((e) => e.tag).lastIndexOf(tag); if (i >= 0) stack.length = i; continue; }
    const el = { tag, attrs };
    if (tag === 'svg' && !stack.some((e) => e.tag === 'svg')) {
      const hidden = [el, ...stack].some((e) => /aria-hidden="true"/.test(e.attrs));
      const btn = [...stack].reverse().find((e) => e.tag === 'button' || e.tag === 'a');
      if (!hidden && !(btn && /aria-label="[^"]+"/.test(btn.attrs)) && !/\brole="img"|aria-label=/.test(attrs)) bad.push(attrs.trim().slice(0, 60));
    }
    if (!self && !VOID.has(tag)) stack.push(el);
  }
  return bad;
}

test('ikony v index.html: aria-hidden, nebo tlačítko s aria-label (mapa světa se kreslí sama a jméno má z okolí)', () => {
  assert.deepEqual(unlabeledSvgs('<button aria-label="Zpět"><svg viewBox="0 0 24 24"><path d="M1 1"/></svg></button><span aria-hidden="true"><svg></svg></span>'), []);
  assert.deepEqual(unlabeledSvgs('<button><svg viewBox="0 0 24 24"></svg></button>'), ['viewBox="0 0 24 24"']);
  assert.deepEqual(unlabeledSvgs(INDEX).filter((a) => !a.includes('id="worldmap"')), []);
});

// ============ Chyby a varování podle manuálu: text barvou písma, lem Sušené rajče / okr, žádná růžová plocha ============
/** Kontrastní poměr dvou hex barev #RRGGBB podle WCAG 2.x (relativní jas sRGB). */
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('contrast: známé dvojice (černá na bílé 21 : 1, Noc na Vápnu ~16 : 1)', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF')), 21);
  assert.equal(contrast('#FFFFFF', '#FFFFFF'), 1);
  const nv = contrast('#14161F', '#F3F4F0');
  assert.ok(nv > 16 && nv < 17, String(nv));
});

test('chyby a varování: lem barvou chyby / okrem, text barvou písma na kartě, kontrast výpočtem v obou režimech', () => {
  const v = (theme, name) => SRC.match(new RegExp(`\\[data-theme="${theme}"\\]\\{[^}]*--${name}:(#[0-9A-Fa-f]{6})`))[1];
  // Sušené rajče podle manuálu ve světlém; v tmavém světlejší odstín (Sušené rajče samo má na tmavé kartě < 3 : 1)
  assert.equal(v('light', 'letsi-chyba'), '#A92A0C');
  assert.ok(contrast('#A92A0C', v('dark', 'card')) < 3, 'proto světlejší odstín v tmavém');
  for (const t of ['light', 'dark']) {
    const card = v(t, 'card'), text = v(t, 'text'), pena = v(t, 'surface-2');
    // text hlášky: barva písma na kartě aspoň 4,5 : 1
    assert.ok(contrast(text, card) >= 4.5, `${t}: text ${contrast(text, card).toFixed(2)}`);
    for (const k of ['letsi-chyba', 'letsi-varovani']) {
      const c = v(t, k);
      // lem nejméně 3 : 1; barva chyby slouží i jako krátký text (stav zdroje, zdražení), proto na kartě a stránce 4,5 : 1
      for (const bg of [card, v(t, 'bg')]) assert.ok(contrast(c, bg) >= 4.5, `${t} ${k} ${c} na ${bg}: ${contrast(c, bg).toFixed(2)}`);
      assert.ok(contrast(c, pena) >= 3, `${t} ${k} na pěně ${contrast(c, pena).toFixed(2)}`);
    }
    // --bad-ink (text chyb v ATLASu) a --bad (plochy) míří na barvu chyby, ne na karmín ani růžovou
    assert.equal(v(t, 'bad-ink'), v(t, 'letsi-chyba'));
    assert.equal(v(t, 'bad'), v(t, 'letsi-chyba'));
  }
  // hláška o chybě: karta, text barvou písma, lem 2 px a ikona barvou chyby; varování jemněji 1 px
  assert.match(SRC, /\] :is\(\.note\.bad,\.note\.warn,[^)]*\)\{background:var\(--card\);color:var\(--text\)\}/);
  assert.match(SRC, /\] \.note\.bad\{border:2px solid var\(--letsi-chyba\)/);
  assert.match(SRC, /\] \.note\.bad svg\{color:var\(--letsi-chyba\)\}/);
  assert.match(SRC, /\] :is\(\.note\.warn,[^)]*\)\{border:1px solid var\(--letsi-varovani\)\}/);
  assert.match(SRC, /\] :is\(\.ec-hard,[^)]*\.b\.dear\)\{background:var\(--card\);box-shadow:inset 0 0 0 1\.5px var\(--letsi-chyba\);color:var\(--text\)\}/);
  // karmín a růžová ATLASu (ani jako průsvitná plocha) se ve vzhledu Letsi neobjeví; Rajče, přechody a data-brand
  // u nových pravidel hlídají testy výš pro celý soubor
  assert.doesNotMatch(SRC, /#(be123c|9f1239|b91c1c|fb7185|f7a6b3|f87171)\b|rgba\(\s*(251,\s*113|248,\s*113|251,\s*191)/i);
});

test('skóre a puntíky ceny na kartách cílů: vidět ve světlém i tmavém, vysvětlivka Naplánovat písmem textu', () => {
  // skóre na fotce: bílé pozadí z atlas.css + protibarva (ve světlém Vápno) = neviditelné číslo → vlastní plocha i písmo;
  // pravidlo musí stát až za společným :is(…,.score-pill,…), jinak by ho barva písma přebila
  const pill = SRC.indexOf(':root[data-brand="letsi"] .dest[data-photo] .score-pill{background:#D6DE82;color:#14161F}');
  assert.ok(pill > SRC.search(/:is\([^)]*\.score-pill[^)]*\)\{color:var\(--letsi-na-grad\)/), 'pravidlo pro fotku za společným');
  assert.ok(contrast('#14161F', '#D6DE82') >= 4.5);
  // jantarové puntíky: na kartě barvou textu, na tmavém panelu fotky (v obou režimech) Pistácie
  assert.match(SRC, /\] \.dots\.warm i\.f\{background:var\(--text\)\}/);
  assert.match(SRC, /\] \.dest-panel \.dots\.warm i\.f\{background:#D6DE82\}/);
  // .ex-plan-hint v seznamu písma textu (ne v nadpisovém Unbounded z h3)
  assert.match(SRC, /:is\([^)]*\.ex-plan-hint[^)]*\)\{font-family:var\(--letsi-pismo-text\)\}/);
});

test('tisk: tiskové tokeny přebijí tmavý režim Letsi, plovoucí okna (Novinky, nová verze) se netisknou', () => {
  const pt = read('css/pretrip.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const print = pt.slice(pt.indexOf('@media print{'));
  // letsi.css (načtený za pretrip.css) nastaví --text v :root[data-brand][data-theme] – tisk musí mít stejnou váhu a !important
  assert.ok(INDEX.indexOf('rel="stylesheet" href="css/letsi.css"') > INDEX.indexOf('rel="stylesheet" href="css/pretrip.css"'));
  const tok = print.match(/\n\s*([^{}]*:root\[data-brand\]\[data-theme\][^{}]*)\{([^}]*)\}/);
  assert.ok(tok, 'tiskové tokeny pro :root[data-brand][data-theme]');
  for (const [k, v] of [['text', '#000'], ['muted', '#333'], ['card', '#fff'], ['bg-grad', '#fff']]) assert.match(tok[2], new RegExp(`--${k}:${v} !important`), k);
  // ve vzhledu Letsi tokeny v letsi.css nemají !important (jinak by tisk nevyhrál)
  assert.doesNotMatch(SRC, /[{;]\s*--(text|muted|faint|card|border|border-2|surface|surface-2|bg-grad):[^;{}]*!important/);
  const hide = print.match(/\n\s*([^{}]*\.sidebar[^{}]*)\{display:none !important\}/)[1].split(',');
  for (const s of ['.wn-pop', '.pwa-update']) assert.ok(hide.includes(s), s);
});

test('úvodní obrazovka Letsi: logo s očima inline, bez přechodů a skla, pohyb jen transform/opacity, s omezeným pohybem statické', () => {
  const svg = INDEX.match(/<div id="launch" aria-hidden="true">[\s\S]*?(<svg class="l-logo"[\s\S]*?<\/svg>)/)[1];
  // nic se nestahuje (vidět hned) a žádný přechod ani filtr – starý přechod ATLASu (#launchG) má jen jeho .l-ico
  assert.doesNotMatch(svg, /gradient|filter|<image|href=|url\((?!#launchOko\))/i);
  const css = INDEX.match(/<style>\n\/\* Úvodní obrazovka ve vzhledu Letsi[\s\S]*?<\/style>/)[0];
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /gradient|filter|blur|shadow|url\(/i);
  const frames = [...css.matchAll(/@keyframes ([\w-]+)\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
  assert.ok(frames.length >= 5, frames.map((f) => f[1]).join());
  for (const [, name, body] of frames) for (const [, prop] of body.matchAll(/([a-z-]+):/g)) assert.match(prop, /^(transform|opacity|animation-timing-function)$/, name);
  // každá animace je použitá jen pod #launch vzhledu Letsi a omezený pohyb ji vypne celou (výchozí stav pravidel = hotové logo)
  for (const [, name] of frames) assert.match(css, new RegExp(`\\[data-brand=letsi\\] #launch [^{]*\\{[^}]*animation:${name} `), name);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\[data-brand=letsi\] #launch [^{]*\.l-logo \*[^{]*\{animation:none!important[^}]*\}\}/);
  // mimo vzhled Letsi skryté; celá #launch se ukazuje jen v aplikaci na ploše (display-mode)
  assert.match(css, /#launch \.l-logo\{display:none\}/);
  assert.match(INDEX, /#launch\{display:none\}\n@media \(display-mode:standalone\)/);
});
