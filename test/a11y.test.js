// Přístupnost na telefonu (TalkBack / VoiceOver, klávesnice, velké písmo, slunce): okna jako dialog s fokusem uvnitř
// a stránkou pod nimi inertní, jména tlačítek bez textu a polí formulářů, spodní lišta z tlačítek, hlášky a konec hledání
// pro čtečku, stav přepínačů, kontrast modrého textu ve světlém režimu a textu na fotkách, plocha malých tlačítek,
// omezení pohybu a přiblížení. Statické kontroly zdrojáků + skutečné funkce z app.js v node:vm (celý app.js potřebuje DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const html = read('index.html'), appJs = read('js/app.js'), flightsJs = read('js/flights.js');
const atlasCss = noComments(read('css/atlas.css')), flightsCss = noComments(read('css/flights.css'));
const jsFiles = readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js'));
const templates = [['index.html', html], ...jsFiles.map((f) => [`js/${f}`, read(`js/${f}`)])];
/** Funkce nebo konstanta z app.js podle jména (na jednom řádku, nebo víceřádková do „}“ na začátku řádku). */
const pick = (name) => {
  const m = appJs.match(new RegExp(`^(function ${name}\\([^\\n]*\\}|function ${name}\\([\\s\\S]*?^\\}|const ${name} = .*)$`, 'm'));
  assert.ok(m, `app.js: ${name}`);
  return m[0];
};

/** Kontrast dvou barev [r, g, b] (WCAG). */
function contrast(a, b) {
  const lum = ([r, g, bb]) => [r, g, bb].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Poloprůhledná barva rgba(r,g,b,a) přes podklad [r, g, b]. */
const over = (rgba, under) => { const [r, g, b, a] = rgba.match(/[\d.]+/g).map(Number); return [r, g, b].map((c, i) => c * a + under[i] * (1 - a)); };
const WHITE = [255, 255, 255];

test('okno (#modal): dialog s aria-modal, jméno z prvního nadpisu, stránka pod ním inertní – čtečka ani Tab se pod okno nedostanou', () => {
  assert.match(html, /<div class="modal" id="modal" role="dialog" aria-modal="true" tabindex="-1"><\/div>/);
  // otevření i zavření (✕, Escape, klepnutí vedle, Zpět telefonu) jednou cestou – i inert hned, ne až v MutationObserveru
  assert.match(pick('modalOpen'), /\$\('#modal'\)\.innerHTML = html; modalShow\(true\);\n\s*modalName\(\);/);
  assert.match(pick('modalClose'), /^function modalClose\(\) \{\n\s*modalShow\(false\);/);
  assert.match(appJs, /if \(hist\.modal\) \{ hist\.modal = false; modalShow\(false\); \}/, 'Zpět telefonu (histPop)');
  assert.doesNotMatch(appJs.replace(pick('modalShow'), ''), /\$\('#modalBg'\)\.classList\.(add|remove|toggle)\('show'/, 'okno jen přes modalShow');
  const els = { '#modalBg': { classList: { on: false, toggle(k, on) { this.on = on; } } }, '.app': { inert: false }, '#mobileNav': { inert: false } };
  const ctx = vm.createContext({ $: (s) => els[s] });
  vm.runInContext(pick('modalShow'), ctx);
  ctx.modalShow(true);
  assert.deepEqual([els['#modalBg'].classList.on, els['.app'].inert, els['#mobileNav'].inert], [true, true, true]);
  ctx.modalShow(false);
  assert.deepEqual([els['#modalBg'].classList.on, els['.app'].inert, els['#mobileNav'].inert], [false, false, false]);
  // jméno okna: nadpis (země, Další, Sdílet cestu) → aria-labelledby, bez nadpisu obecné „Okno“
  const modal = (h) => {
    const attrs = {};
    const m = { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, attrs };
    const c = vm.createContext({ $: (s, root) => (s === '#modal' ? m : root === m ? h : null) });
    vm.runInContext(pick('modalName'), c);
    c.modalName();
    return attrs;
  };
  const h = { id: '' };
  assert.deepEqual(modal(h), { 'aria-labelledby': 'modalH' }); assert.equal(h.id, 'modalH');
  assert.deepEqual(modal({ id: 'dpTitle' }), { 'aria-labelledby': 'dpTitle' });
  assert.deepEqual(modal(null), { 'aria-label': 'Okno' });
  // náhled cíle uvnitř okna už sám dialogem není (okno v okně)
  assert.doesNotMatch(flightsJs, /class="dp" role="dialog"/);
});

test('okno dostane fokus i na telefonu (dřív jen počítač s myší) a po zavření ho vrátí – na telefonu ne do textového pole (klávesnice)', () => {
  assert.doesNotMatch(appJs, /modalKb\.mq/);
  assert.match(appJs, /const modalKb = \{ ret: null, sel: '', touch: window\.matchMedia \? matchMedia\('\(pointer:coarse\)'\) : null \};/);
  assert.match(appJs, /if \(on\) \{ if \(!m\.contains\(a\)\) \{ m\.tabIndex = -1; m\.focus\(\{ preventScroll: true \}\); \} return; \}/);
  assert.match(appJs, /if \(r && modalKb\.touch && modalKb\.touch\.matches && \/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(r\.tagName\)\) return;/);
  assert.match(atlasCss, /#modal:focus\{outline:none\}/, 'bez rámečku kolem celého okna (i na telefonu)');
  // náhled z karty radaru (<div>, fokus nebere): fokus zpět na její ⓘ, ne na začátek stránky
  assert.match(flightsJs, /: ri != null \? \$\(`#radar \[data-rinfo="\$\{CSS\.escape\(ri\)\}"\]`\) : null\);/);
});

test('tlačítka bez textu (ikona, ✕, ♡, +, symbol) mají aria-label – jinak je čtečka přečte jako „tlačítko“ nebo název emoji', () => {
  const filled = /id="(homeChip|apSum|exBack)"/; // text doplní skript (📍 Praha, letiště, ← Zpět)
  const bad = [];
  for (const [f, src] of templates) {
    for (const m of src.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const [, attrs, body] = m;
      if (/aria-label(ledby)?=/.test(attrs) || filled.test(attrs) || body.length > 400) continue;
      const plain = body.replace(/<[^>]+>/g, '');
      const iconOnly = /^\s*(\$\{(ico|SVG|svg|icon)\([^}]*\)\}\s*)+$/.test(body);
      const symOnly = !/\$\{/.test(plain) && !/[\p{L}\p{N}]/u.test(plain);
      if (iconOnly || symOnly) bad.push(`${f}: <button${attrs}>${body.slice(0, 40)}`);
    }
  }
  assert.deepEqual(bad, []);
  // ✕ u místa ve výběru Odkud/Kam řekne, které místo odebere
  assert.match(flightsJs, /<button type="button" data-x="\$\{i\}" aria-label="\$\{esc\(`Odebrat \$\{x\.label\}`\)\}">×<\/button>/);
});

test('pole formulářů mají jméno: <label for>, obalující <label> nebo aria-label (placeholder po vyplnění zmizí)', () => {
  const all = templates.map(([, s]) => s).join('\n');
  const bad = [];
  for (const [f, src] of templates) {
    for (const m of src.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      const a = m[2];
      if (/type="(hidden|checkbox|radio|submit|button|file)"/.test(a) || /aria-label(ledby)?=/.test(a)) continue;
      const id = (a.match(/\sid="([^"]+)"/) || [])[1];
      if (id && all.includes(`for="${id}"`)) continue;
      const before = src.slice(Math.max(0, m.index - 300), m.index);
      if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) continue; // uvnitř <label>
      bad.push(`${f}: <${m[1]}${a.slice(0, 80)}`);
    }
  }
  assert.deepEqual(bad, []);
  // našeptávač Odkud/Kam: jméno pole a combobox s nabídkou (listbox, vybraný návrh přes aria-activedescendant)
  assert.match(flightsJs, /<input class="pi-input" placeholder="\$\{esc\(placeholder \|\| ''\)\}" aria-label="\$\{esc\(name\)\}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="\$\{id\}"/);
  assert.match(flightsJs, /<div class="pi-dd" id="\$\{id\}" role="listbox"/);
  assert.match(flightsJs, /role="option" aria-selected="\$\{i === this\.active\}"/);
  assert.match(flightsJs, /this\.input\.setAttribute\('aria-activedescendant', `\$\{this\.id\}-\$\{this\.active\}`\)/);
});

test('spodní lišta: sekce jako <button> (Tab, čtečka) a aktivní sekce s aria-current', () => {
  assert.match(html, /<nav class="mobile-nav" id="mobileNav" aria-label="Sekce"><\/nav>/);
  const nav = appJs.match(/^function buildNav\(\) \{[\s\S]*?^\}/m)[0];
  assert.doesNotMatch(nav, /<div class="mi"/);
  assert.equal(nav.match(/<button type="button" class="mi"/g).length, 3, 'sekce, Svět, Další');
  assert.match(appJs, /const cur = \(el, on\) => \{ el\.classList\.toggle\('active', on\); if \(on\) el\.setAttribute\('aria-current', 'page'\); else el\.removeAttribute\('aria-current'\); \};/);
  // <button> bez vzhledu tlačítka prohlížeče – lišta vypadá stejně jako s <div>
  assert.match(atlasCss, /\.mobile-nav \.mi\{[^}]*border:0;padding:0;background:none;font:inherit/);
});

test('hlášky pro čtečku: toast (role status), začátek a konec hledání v #srSay – stejné hlášení dvakrát po sobě se přečte znovu', () => {
  assert.match(html, /<div class="toast" id="toast" role="status"><\/div>/);
  assert.match(html, /<div class="sr-only" id="srSay" role="status"><\/div>/);
  assert.match(atlasCss, /\.sr-only\{position:absolute!important;width:1px;height:1px;[^}]*clip-path:inset\(50%\)/);
  const timers = [];
  const el = { textContent: 'staré' };
  const ctx = vm.createContext({ $: () => el, setTimeout: (f) => timers.push(f), clearTimeout: () => {} });
  vm.runInContext(pick('say'), ctx);
  ctx.say('Hledám nejlevnější lety…');
  assert.equal(el.textContent, '', 'nejdřív prázdné…');
  timers.shift()();
  assert.equal(el.textContent, 'Hledám nejlevnější lety…', '…pak hlášení');
  // hledání: start, konec (cíl a nejnižší cena z hlavičky výsledků) i chyba – průběh (až 4× za s) ne
  assert.match(flightsJs, /btn\.innerHTML = '<span class="spin"><\/span> Hledám…';\n\s*say\('Hledám nejlevnější lety…'\);/);
  assert.match(flightsJs, /else renderResults\(\); sayDone\(\); \};/);
  assert.match(flightsJs, /\$\('#searchRetry'\)\.onclick = \(\) => startSearch\(\);\n\s*say\(msg\);/);
  assert.doesNotMatch(flightsJs.match(/function renderProgress\([\s\S]*?\n {2}\}/)[0], /say\(/);
});

test('přepínače (.seg, dny v týdnu, ± dny): vybraná možnost i pro čtečku – aria-pressed podle třídy on', () => {
  const ctx = vm.createContext({});
  vm.runInContext(pick('segPressed'), ctx);
  const btn = (on, pressed) => { const a = { 'aria-pressed': pressed }; return { a, classList: { contains: () => on }, getAttribute: (k) => a[k] ?? null, setAttribute: (k, v) => { a[k] = v; } }; };
  const b1 = btn(true, null), b2 = btn(false, 'true');
  ctx.segPressed(b1); ctx.segPressed(b2);
  assert.equal(b1.a['aria-pressed'], 'true'); assert.equal(b2.a['aria-pressed'], 'false');
  assert.match(appJs, /const SEG_BTN = '\.seg>button,\.dow>button,#xFlex>button';/);
  assert.match(appJs, /\}\)\.observe\(document\.body, \{ subtree: true, childList: true, attributes: true, attributeFilter: \['class'\] \}\);\n\$\$\(SEG_BTN\)\.forEach\(segPressed\);/);
  // skupiny přepínačů ve formuláři mají jméno
  for (const id of ['minTemp', 'tripType', 'dateMode', 'xFlex', 'lenPreset', 'bags', 'cVisited', 'outDays', 'backDays']) assert.match(html, new RegExp(`id="${id}" role="group" aria-label="[^"]+"`), id);
});

test('kontrast: modrý text (odkazy „Obnovit →“, „změnit“, Podrobnosti…) ve světlém režimu aspoň 4,5 : 1, v tmavém beze změny', () => {
  const light = atlasCss.match(/\[data-theme="light"\]\{[^}]*\}/)[0], root = atlasCss.match(/:root\{[^}]*\}/)[0];
  const ink = light.match(/--accent-ink:(#[0-9a-f]{6})/)[1];
  assert.equal(root.match(/--accent-ink:(#[0-9a-f]{6})/)[1], root.match(/--accent:(#[0-9a-f]{6})/)[1], 'tmavý režim: stejná modrá jako dřív');
  for (const bg of ['#eef2fb', '#ffffff', '#eeeff1']) assert.ok(contrast(hex(ink), hex(bg)) >= 4.5, `${ink} na ${bg}: ${contrast(hex(ink), hex(bg)).toFixed(2)}`);
  assert.ok(contrast(hex('#5b8cff'), hex('#eef2fb')) < 3, 'dřívější modrá na světlém pozadí jen ~2,8 : 1');
  // text v barvě --accent nikde (jen rámečky, zaškrtávátka, ikony přes --accent-ink)
  for (const f of ['atlas', 'flights', 'trip', 'pretrip', 'pwa']) assert.doesNotMatch(noComments(read(`css/${f}.css`)), /[{;]color:var\(--accent\)[;}]/, f);
});

test('text na fotkách: i na bílé fotce (obloha, sníh) bílý text na skle aspoň 4,5 : 1, nadpisy aspoň 3 : 1', () => {
  const bg = (sel, css = flightsCss) => css.match(new RegExp(`${sel.replace(/[.()[\]]/g, '\\$&')}\\{[^}]*?background:(rgba\\([^)]*\\))`))[1];
  // skleněné panely pod názvem, termínem a cenou (radar, Rychlé hledání, Tipy, Země) a pod hledáním na fotce dne
  for (const [sel, css] of [['.rc-panel', flightsCss], ['.dest-panel', atlasCss], ['.hero.ph .hero-search2', atlasCss], ['.radar-card .rc-badges .b', flightsCss]]) {
    const c = contrast(WHITE, over(bg(sel, css), WHITE));
    assert.ok(c >= 4.5, `${sel}: ${c.toFixed(2)}`);
  }
  // barevné štítky radaru (🔥, ✓, nové, 🌧️, 📌, ⭐) na bílé fotce
  for (const m of flightsCss.matchAll(/\.radar-card \.rc-badges \.b\.[^{]*\{background:(rgba\([^)]*\))\}/g)) {
    const c = contrast(WHITE, over(m[1], WHITE));
    assert.ok(c >= 4.5, `${m[0]}: ${c.toFixed(2)}`);
  }
  // ztmavení fotky pod nadpisem Lety (nahoře nadpis 24 px ≥ 3 : 1, uprostřed podtitulek 13 px ≥ 4,5 : 1)
  const fl = flightsCss.match(/\.fl-hero::before\{[^}]*linear-gradient\(180deg,(rgba\([^)]*\)) 0%,(rgba\([^)]*\)) 50%/);
  assert.ok(contrast(WHITE, over(fl[1], WHITE)) >= 3, 'Lety: nadpis');
  assert.ok(contrast(WHITE, over(fl[2], WHITE)) >= 4.5, 'Lety: podtitulek');
  // štítky na tmavém skle mají bílý text i ve světlém režimu (🌧️ měl tmavě modrý přes silnější selektor)
  assert.match(flightsCss, /\[data-theme\] \.radar-card \.rc-badges \.b,\[data-theme\] \.radar-card \.rc-badges \.b\.wxb\.wet\{color:#fff\}/);
  // vedlejší text na panelu radaru dost bílý (měřeno snímkem s bílou fotkou: ≥ 4,5 : 1)
  assert.match(flightsCss, /\.rc-sub\{font-size:11\.5px;color:rgba\(255,255,255,\.8\)/);
});

test('malá tlačítka: větší plocha pro prst bez změny vzhledu (✕ u místa, ✕ tipu, ⓘ radaru, „Obnovit →“)', () => {
  assert.match(flightsCss, /\.pi-chip button::after\{content:"";position:absolute;inset:-10px -8px -10px -3px\}/);
  assert.match(flightsCss, /\.pi-chip button\{[^}]*position:relative\}/);
  assert.match(atlasCss, /\.dt-x::after\{content:"";position:absolute;inset:-8px\}/);
  assert.match(flightsCss, /\.radar-card \.rc-info::after\{content:"";position:absolute;inset:-8px\}/);
  assert.match(atlasCss, /\.section-head \.link::after\{content:"";position:absolute;inset:-12px -6px\}/);
  // fokus z klávesnice neskončí pod plovoucí lištou
  assert.match(atlasCss, /html\{scroll-padding-bottom:calc\(90px \+ env\(safe-area-inset-bottom\)\)\}/);
});

test('omezit pohyb, přiblížení a jazyk: bez plujících barev a vyjetí sekcí, přiblížení prsty povolené, lang="cs"', () => {
  const rm = [...atlasCss.matchAll(/@media\(prefers-reduced-motion:reduce\)\{([\s\S]*?\})\s*\}/g)].map((m) => m[1]).join('\n');
  for (const s of ['.hero-aurora', '.view', '.skel']) assert.ok(rm.includes(s), s);
  assert.match(html, /<html lang="cs"/);
  const vp = html.match(/<meta name="viewport" content="([^"]+)">/)[1];
  assert.doesNotMatch(vp, /user-scalable=no|maximum-scale/, 'Android: přiblížení prsty musí jít');
  // velké písmo systému: hlavní tlačítko hledání a nabídka Další se zalomí, ne vytečou z okna
  assert.match(flightsCss, /\.sf-actions #doSearch\{[^}]*white-space:normal/);
  assert.match(atlasCss, /\.mn-grid\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
});
