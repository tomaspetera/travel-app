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
const placesJs = read('js/places.js'), tripJs = read('js/trip.js');
const tripCss = noComments(read('css/trip.css')), desktopCss = noComments(read('css/desktop.css'));
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
  assert.match(appJs, /const modalKb = \{ ret: null, sel: '', fresh: false, touch: window\.matchMedia \? matchMedia\('\(pointer:coarse\)'\) : null \};/);
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

test('zkrácené placeholdery (360 px): celý popis dostane čtečka – aria-description u Odkud/Kam, aria-label u rezervace', () => {
  // PlaceInput: hint → aria-description (placeholder se kvůli úzkému telefonu zkrátil)
  assert.match(flightsJs, /aria-controls="\$\{id\}"\$\{hint \? ` aria-description="\$\{esc\(hint\)\}"` : ''\}/);
  assert.match(flightsJs, /toInput = new PlaceInput\(\$\('#toInput'\), \{ placeholder: 'Kamkoliv 🌍 nebo „k moři“', hint: KAM_HINT,/);
  assert.match(flightsJs, /heroTo = new PlaceInput\(\$\('#heroTo'\), \{ placeholder: '[^']+', hint: KAM_HINT,/);
  assert.match(flightsJs, /fromInput = new PlaceInput\(\$\('#fromInput'\), \{ origin: true, placeholder: 'Brno, Vídeň, Česko…', hint: ODKUD_HINT,/);
  assert.match(flightsJs, /const KAM_HINT = '[^']*„k moři v květnu“';/);
  assert.match(tripJs, /new F\.PlaceInput\(\$\('#tripAskTo'\), \{ placeholder: 'Lisabon, kamkoliv…', hint: '[^']+'/);
  // vedle místa jen krátké „+ další“ (dřív „přidat další…“ uříznuté na „přidat d“)
  assert.match(flightsJs, /this\.input\.placeholder = this\.items\.length \? '\+ další' : this\.ph;/);
  assert.match(appJs, /placeholder="Co \(let, hotel…\)" aria-label="Co je to za rezervaci \(let tam, hotel…\)"/);
});

test('spodní lišta: sekce jako <button> (Tab, čtečka) a aktivní sekce s aria-current', () => {
  assert.match(html, /<nav class="mobile-nav" id="mobileNav" aria-label="Sekce"><\/nav>/);
  const nav = appJs.match(/^function buildNav\(\) \{[\s\S]*?^\}/m)[0];
  assert.doesNotMatch(nav, /<div class="mi"/);
  assert.equal(nav.match(/<button type="button" class="mi"/g).length, 3, 'sekce, Svět, Další');
  assert.match(appJs, /const cur = \(el, on\) => \{ el\.classList\.toggle\('active', on\); if \(on\) el\.setAttribute\('aria-current', 'page'\); else el\.removeAttribute\('aria-current'\); \};/);
  // <button> bez vzhledu tlačítka prohlížeče – lišta vypadá stejně jako s <div>
  assert.match(atlasCss, /\.mobile-nav \.mi\{[^}]*border:0;padding:0( 2px)?;background:none;font:inherit/);
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

test('kontrast: stavové barvy jako text (nejlevnější, varování, chyby) ve světlém režimu aspoň 4,5 : 1, v tmavém beze změny', () => {
  const light = atlasCss.match(/\[data-theme="light"\]\{[^}]*\}/)[0], root = atlasCss.match(/:root\{[^}]*\}/)[0];
  for (const k of ['good', 'warn', 'bad', 'info']) {
    const base = root.match(new RegExp(`--${k}:(#[0-9a-f]{6})`))[1], ink = light.match(new RegExp(`--${k}-ink:(#[0-9a-f]{6})`))[1];
    assert.equal(root.match(new RegExp(`--${k}-ink:(#[0-9a-f]{6})`))[1], base, `tmavý režim: --${k}-ink = --${k}`);
    assert.ok(contrast(hex(base), hex('#eef2fb')) < 3, `dřívější --${k} na světlém pozadí jen ${contrast(hex(base), hex('#eef2fb')).toFixed(2)} : 1`);
    for (const bg of ['#eef2fb', '#ffffff', '#eeeff1']) assert.ok(contrast(hex(ink), hex(bg)) >= 4.5, `--${k}-ink ${ink} na ${bg}: ${contrast(hex(ink), hex(bg)).toFixed(2)}`);
  }
  // text ve stavové barvě jen přes --…-ink (výplně, rámečky a ikony na barevném podkladu dál --good…)
  for (const f of ['atlas', 'flights', 'trip', 'pretrip', 'pwa', 'desktop', 'desktop-trip', 'desktop-explore', 'desktop-flights']) {
    assert.doesNotMatch(noComments(read(`css/${f}.css`)), /(?:^|[{;\s])color:var\(--(?:good|warn|bad|info)\)/, f);
  }
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
  assert.doesNotMatch(vp, /user-scalable|maximum-scale/, 'Android: přiblížení prsty musí jít');
  // velké písmo systému: hlavní tlačítko hledání a nabídka Další se zalomí, ne vytečou z okna
  assert.match(flightsCss, /\.sf-actions #doSearch\{[^}]*white-space:normal/);
  assert.match(atlasCss, /\.mn-grid\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
});

test('přiblížení prsty i na iPhonu a v aplikaci na ploše: viewport bez omezení (ani skriptem pro iOS), pole na telefonu a tabletu aspoň 16 px – iOS pak při klepnutí do pole stránku nepřibližuje', () => {
  const code = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /maximum-scale|minimum-scale|user-scalable/, 'dřív skript na iPhonu přidal maximum-scale=1');
  for (const [f, src] of templates.slice(1)) assert.doesNotMatch(src, /maximum-scale|user-scalable|meta\[name="viewport"\]/, f);
  // jedno pravidlo pro všechna textová pole (i nově vykreslená, i se stylem v řádku): telefon (vše pod počítačovým
  // rozvržením od 1024 px) a dotykový displej (iPad na šířku)
  const m = atlasCss.match(/@media \(max-width:1023px\),\(pointer:coarse\)\{\s*(input[^{]*)\{font-size:16px!important\}\s*\}/);
  assert.ok(m, 'pravidlo pro pole na telefonu a dotykovém displeji');
  const sel = m[1].split(',').map((s) => s.trim());
  assert.deepEqual(sel.slice(1), ['select', 'textarea']);
  assert.match(sel[0], /^input(:not\(\[type=[a-z]+\]\))+$/);
  const skip = [...sel[0].matchAll(/\[type=([a-z-]+)\]/g)].map((x) => x[1]);
  for (const t of ['text', 'search', 'number', 'date', 'datetime-local', 'url', 'email', 'tel']) assert.ok(!skip.includes(t), `pole ${t} má 16 px`);
  for (const t of ['checkbox', 'radio', 'range']) assert.ok(skip.includes(t), `${t} bez textu`);
  // žádné jiné !important písmo u polí, které by pravidlo přebilo (styl v řádku !important nepřebije)
  const bad = [];
  for (const f of readdirSync(new URL('../public/css/', import.meta.url)).filter((x) => x.endsWith('.css'))) {
    for (const r of noComments(read(`css/${f}`)).matchAll(/([^{};]*)\{[^{}]*font(-size)?:[^;}]*!important/g)) if (/\b(input|select|textarea)\b|\.input\b|\.pi-input\b/.test(r[1]) && !/font-size:16px!important/.test(r[0])) bad.push(`${f}: ${r[0].slice(0, 90)}`);
  }
  for (const [f, src] of templates) for (const r of src.matchAll(/<(input|select|textarea)\b[^>]*style="[^"]*!important/g)) bad.push(`${f}: ${r[0].slice(0, 90)}`);
  assert.deepEqual(bad, []);
});

test('našeptávač v Objevuj a místo do trasy cesty: combobox jako Odkud/Kam – rozbalení, šipkami vybraný návrh, prázdná nabídka nahlas', () => {
  assert.match(placesJs, /const q = \$\('#exQ', root\), dd = \$\('#exDd', root\);\n\s*if \(window\.comboAria\) comboAria\(q, dd, 'Kam se chceš podívat'\);/);
  assert.match(tripJs, /const q = \$\('#rtQ'\), dd = \$\('#rtDd'\);\n\s*if \(!q\) return;\n\s*if \(window\.comboAria\) comboAria\(q, dd, 'Přidat místo do trasy'\);/);
  // klávesy: šipky (návrh, třída on), Enter (vybrat), Escape (zavřít)
  for (const src of [placesJs, tripJs]) assert.match(src, /if \(e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'\) \{ if \(!sugs\.length\) return; e\.preventDefault\(\); act = [^\n]*show\(\); \}\n\s*else if \(e\.key === 'Enter'\)[\s\S]{0,900}?else if \(e\.key === 'Escape'\) dd\.hidden = true;/);
  const el = () => { const a = {}; return { a, hidden: true, id: '', opts: [], empty: null, setAttribute: (k, v) => { a[k] = String(v); }, getAttribute: (k) => a[k] ?? null, removeAttribute: (k) => { delete a[k]; } }; };
  const opt = (on) => ({ ...el(), classList: { contains: (k) => k === 'on' && on } });
  const said = [], obs = [];
  const ctx = vm.createContext({ $: (s, r) => (s === '.pi-empty' ? r.empty : null), $$: (s, r) => (s === '.pi-opt' ? r.opts : []), say: (m) => said.push(m),
    MutationObserver: class { constructor(cb) { obs.push(cb); } observe(n, o) { assert.deepEqual(JSON.parse(JSON.stringify(o)), { childList: true, attributes: true, attributeFilter: ['hidden'] }); } } });
  vm.runInContext(pick('comboAria'), ctx);
  const input = el(), dd = el(); dd.id = 'exDd';
  ctx.comboAria(input, dd, 'Kam se chceš podívat');
  assert.deepEqual(input.a, { role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'exDd', 'aria-expanded': 'false' });
  assert.deepEqual(dd.a, { role: 'listbox', 'aria-label': 'Návrhy – Kam se chceš podívat' });
  // otevřená nabídka, šipkou vybraný druhý návrh
  dd.opts = [opt(false), opt(true), opt(false)]; dd.hidden = false; obs[0]();
  assert.deepEqual([input.a['aria-expanded'], input.a['aria-activedescendant']], ['true', 'exDd-1']);
  assert.deepEqual(dd.opts.map((o) => [o.id, o.a.role, o.a['aria-selected']]), [['exDd-0', 'option', 'false'], ['exDd-1', 'option', 'true'], ['exDd-2', 'option', 'false']]);
  // nic nenalezeno: přečte se jednou (ne při každé změně), vybraný návrh není
  dd.opts = []; dd.empty = { textContent: ' Nic nenalezeno ' }; obs[0](); obs[0]();
  assert.deepEqual(said, ['Nic nenalezeno']);
  assert.equal(input.a['aria-activedescendant'], undefined);
  // zavřeno (Escape, klik jinam, výběr)
  dd.hidden = true; obs[0]();
  assert.deepEqual([input.a['aria-expanded'], input.a['aria-activedescendant']], ['false', undefined]);
  dd.hidden = false; obs[0]();
  assert.deepEqual(said, ['Nic nenalezeno', 'Nic nenalezeno'], 'po zavření a novém otevření znovu');
});

test('kontrast: bílá zkratka aerolinky a partnera na barvě značky aspoň 4,5 : 1, čísla míst v trase a na mapě tmavá na pestré barvě', () => {
  const prov = readFileSync(new URL('../server/providers/index.js', import.meta.url), 'utf8').match(/export const PROVIDER_INFO = \{([\s\S]*?)\n\};/)[1];
  const cols = [...prov.matchAll(/color: '(#[0-9a-f]{6})'/g)].map((x) => x[1]);
  assert.equal(cols.length, 6, 'aerolinky a demo');
  // v prohlížeči: kombinace a záložní Ostatní aerolinky (zkratka ve výsledcích), letenka v průvodci, partneři ubytování
  // a půjčoven aut, okno Ubytování
  cols.push(...[...flightsJs.matchAll(/PROV\.\w+ = [^;\n]*color: '(#[0-9a-f]{6})'/g)].map((x) => x[1]));
  cols.push(tripJs.match(/<span class="cbadge" style="background:(#[0-9a-f]{6})">/)[1]);
  cols.push(...[...tripJs.match(/const BRAND = \{([^}]*)\}/)[1].matchAll(/'(#[0-9a-f]{6})'/g)].map((x) => x[1]));
  cols.push(...[...tripJs.matchAll(/linkGrid\([^\n]*?'(#[0-9a-f]{6})'/g)].map((x) => x[1]));
  cols.push(...[...appJs.matchAll(/provLink\([^\n]*?'(#[0-9a-f]{6})', '[^']*'\)/g)].map((x) => x[1]));
  assert.ok(cols.length >= 21, String(cols.length));
  for (const c of cols) assert.ok(contrast(WHITE, hex(c)) >= 4.5, `${c}: ${contrast(WHITE, hex(c)).toFixed(2)}`);
  assert.equal((flightsJs.match(/<span class="cbadge" style="background:\$\{provColor\(l\.provider\)\}"/g) || []).length, 3, 'zkratka ve výsledcích na barvě zdroje');
  // čísla míst: barvy trasy (průvodce) a dnů programu (Objevuj) jsou i na mapě – tmavé číslo místo bílého
  const navy = hex('#0b1226');
  assert.match(tripCss, /\.rb-n,\.bt-n\{[^}]*color:#0b1226;font:800 13px/);
  assert.match(tripCss, /\.mk\.num\{[^}]*color:#0b1226;font:800 11px/);
  const arr = (src, name) => JSON.parse(src.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1].replace(/'/g, '"'));
  for (const c of [...arr(tripJs, 'BASE_COLORS'), ...arr(placesJs, 'DAY_COLORS'), '#0ea5e9']) assert.ok(contrast(navy, hex(c)) >= 4.5, `${c}: ${contrast(navy, hex(c)).toFixed(2)}`);
});

test('ⓘ autora fotky: plocha pro prst aspoň 24 px bez změny vzhledu', () => {
  assert.match(atlasCss, /\.ph-i\{[^}]*width:17px;height:17px;[^}]*position:relative\}/);
  assert.match(atlasCss, /\.ph-i::after\{content:"";position:absolute;inset:-7px\}/); // 17 + 2 × 7 = 31 px
});

test('Shift+Tab nahoru: fokus pod lepicí horní lištou, ne za ní – bez odskoku stránky u tlačítek v liště; cíle odrolování jako dřív', () => {
  // rezerva jen pro ovládací prvky v sekcích (.view) – s html{scroll-padding-top} fokus na ☰ / ⟳ / 📍 v lepicí liště
  // stránku odskočil o stovky px nahoru (lepicí prvek nikdy nebude níž než rezerva)
  assert.doesNotMatch(atlasCss, /^html\{scroll-padding-top/m);
  const top = atlasCss.match(/@media\(max-width:1023px\)\{\.view :is\(a\[href\],button,input,select,textarea,summary,\[tabindex\]\)\{scroll-margin-top:calc\((\d+)px \+ max\((\d+)px,env\(safe-area-inset-top\)\)\)\}\}/);
  assert.ok(top, 'rezerva lišty (s výřezem iPhonu) u prvků v sekcích');
  const pad = +top[1] + +top[2];
  assert.ok(pad >= 68 && pad <= 80, `lišta na telefonu má 68 px (z toho 14 px průhledných): ${pad}`);
  // cíle odrolování dál 90 / 100 px od horního okraje
  const was = { '#watchList .watch': 90, '#radarHead': 90, '#progress': 100, '.lcol,.legs-pick,.smart-guide': 100, '.dc-head': 90, '#mcol-0,#mcol-1,#mcol-2,#mcol-3,#mcPick': 100, '.cmp-row': 90, '#exPlanOut,.ex-err': 100 };
  const all = [atlasCss, flightsCss, tripCss].join('\n');
  for (const [s, px] of Object.entries(was)) {
    const m = all.match(new RegExp(`^${s.replace(/[.#]/g, '\\$&')}\\{scroll-margin-top:(\\d+)px`, 'm'));
    assert.ok(m, s);
    assert.equal(+m[1], px, s);
  }
  // počítač: vlastní rezerva pod vyšší lištou, odsazení pro telefon tam neplatí
  assert.match(desktopCss, /html\{scroll-padding-top:104px\}/);
  assert.match(desktopCss, /#watchList \.watch,#radarHead,#progress,\.lcol,\.legs-pick,\.smart-guide,\.dc-head,#mcol-0,#mcol-1,#mcol-2,#mcol-3,#mcPick,\.cmp-row,#exPlanOut,\.ex-err\{scroll-margin-top:0\}/);
});

test('zvětšená plocha ⓘ autora fotky nepřekryje „✈️ Najít lety“ na kartách Doporučení', () => {
  // klepnutí na roh tlačítka otevřelo autora fotky (openCredit zachytí klepnutí dřív) a hledání se nespustilo
  const ph = atlasCss.match(/\.ph-cr\{[^}]*z-index:(\d+)/);
  const fly = atlasCss.match(/#recGrid \.rec-fly\{position:relative;z-index:(\d+)\}/);
  assert.ok(ph && fly, 'z-index ⓘ i tlačítka');
  assert.ok(+fly[1] > +ph[1]);
});

test('název sekce v horní liště je pro čtečku nadpis 1. úrovně – jen v sekcích bez vlastního h1 ve fotce', () => {
  assert.match(html, /<div class="page-title" id="pageTitle">/, 'vzhled lišty beze změny (ne <h1> s jiným písmem)');
  const a = {};
  const t = { getAttribute: (k) => a[k] ?? null, setAttribute: (k, v) => { a[k] = v; }, removeAttribute: (k) => { delete a[k]; } };
  let h1 = null;
  const ctx = vm.createContext({ $: (s) => (s === '#pageTitle' ? t : s === '.view.active h1' ? h1 : null) });
  vm.runInContext(pick('pageHeading'), ctx);
  ctx.pageHeading();
  assert.deepEqual({ ...a }, { role: 'heading', 'aria-level': '1' }, 'Cesta, Země, Plánovač…');
  h1 = {}; ctx.pageHeading();
  assert.deepEqual({ ...a }, {}, 'Přehled, Lety, Objevuj bez místa: h1 ve fotce');
  h1 = null; ctx.pageHeading(); ctx.pageHeading();
  assert.deepEqual({ ...a }, { role: 'heading', 'aria-level': '1' });
  // hlídá ho sledování změn stránky (přepnutí sekce, Objevuj s místem a bez)
  assert.match(appJs, /\n {2}pageHeading\(\);\n\}\)\.observe\(document\.body, \{ subtree: true, childList: true, attributes: true, attributeFilter: \['class'\] \}\);/);
  assert.match(html, /<h1 id="heroGreet">/);
  assert.match(html, /<div class="fl-hero-in"><h1>/);
  assert.match(placesJs, /<div class="fl-hero-in"><h1>Objev, co stojí za vidění<\/h1>/);
});

test('omezit pohyb: plynulé rolování z kódu (behavior smooth, ~50 míst) skočí rovnou – jen s nastavením systému', () => {
  assert.match(appJs, /^calmScroll\(window, Element\.prototype\);$/m);
  assert.ok(appJs.indexOf('calmScroll(window') < appJs.indexOf('scrollIntoView('), 'dřív než první rolování');
  for (const reduce of [true, false]) {
    const calls = [];
    const w = { matchMedia: () => ({ matches: reduce }), scrollTo(o, y) { calls.push(['w', o, y]); }, scrollBy() {}, scroll() {} };
    const proto = { scrollIntoView(o) { calls.push(['el', this.id, o]); }, scrollTo() {}, scrollBy() {}, scroll() {} };
    const ctx = vm.createContext({});
    vm.runInContext(pick('calmScroll'), ctx);
    ctx.calmScroll(w, proto);
    const el = Object.create(proto); el.id = 'x';
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.scrollIntoView(true);
    w.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    w.scrollTo(0, 50);
    const b = reduce ? 'auto' : 'smooth';
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['el', 'x', { behavior: b, block: 'start' }], ['el', 'x', true], ['w', { top: 0, left: 0, behavior: b }, null], ['w', 0, 50]]);
  }
});

test('našeptávače: posouvatelný seznam návrhů není zastávkou Tabu (Chrome) – Tab z pole jde na další prvek, ne na body', () => {
  assert.match(flightsJs, /<div class="pi-dd" id="\$\{id\}" role="listbox" aria-label="[^"]*" tabindex="-1" hidden><\/div>/);
  assert.match(placesJs, /<div class="pi-dd" id="exDd" tabindex="-1" hidden><\/div>/);
  assert.match(tripJs, /<div class="pi-dd" id="rtDd" tabindex="-1" hidden><\/div>/);
});

test('okno z okna (⋯ Další → ✨ Co je nového, 💾 Záloha…): zavření a otevření v jednom tasku – nové okno fokus dostane', () => {
  assert.match(pick('modalOpen'), /if \(!was\) modalKb\.fresh = true;\n\s*\$\('#modal'\)\.innerHTML = html;/);
  const cb = appJs.match(/new MutationObserver\((\(\) => \{[\s\S]*?\n\})\)\.observe\(\$\('#modalBg'\)/)[1];
  const focused = [];
  const m = { tabIndex: 0, contains: () => false, focus: () => focused.push('modal') };
  const bg = { classList: { contains: () => true }, contains: () => false };
  const ctx = vm.createContext({ $: (s) => (s === '#modal' ? m : bg), $$: () => [], document: { activeElement: { tagName: 'BODY' } }, modalKb: { on: true, fresh: false } });
  vm.runInContext(`this.cb = ${cb};`, ctx);
  ctx.cb(); // okno pořád otevřené (překreslení) – fokus zůstává
  assert.deepEqual(focused, []);
  ctx.modalKb.fresh = true; ctx.cb(); // Další zavřené a hned otevřené nové okno – observer vidí jen „otevřené“
  assert.deepEqual([focused, m.tabIndex, ctx.modalKb.fresh], [['modal'], -1, false]);
});

test('úvodní Odkud/Kam bez rámečku: obrys při fokusu z klávesnice (ve světlém motivu modrý)', () => {
  assert.match(flightsCss, /\.pi-dark:has\(\.pi-input:focus-visible\)\{outline:2px solid rgba\(255,255,255,\.9\);outline-offset:3px\}/);
  assert.match(flightsCss, /\[data-theme="light"\] \.hero-search2 \.pi-dark:has\(\.pi-input:focus-visible\)\{outline-color:var\(--accent-ink\)\}/);
});

test('index.html: hlavní obsah v <main>, dekorativní SVG skryté před čtečkou (mapa světa ne – ovládá se)', () => {
  assert.equal((html.match(/<main class=/g) || []).length, 1);
  assert.match(html, /<main class="content">[\s\S]*<\/main>\n {2}<\/div>\n<\/div>/);
  // l-ico a l-jet jsou uvnitř #launch s aria-hidden, ikony polí v <span aria-hidden="true">
  const bare = [...html.matchAll(/(aria-hidden="true">)?(<svg\b[^>]*>)/g)].filter((x) => !x[1]).map((x) => x[2])
    .filter((t) => !/aria-hidden="true"|id="worldmap"|class="l-(ico|jet)"/.test(t));
  assert.deepEqual(bare, []);
});

test('přepínač motivu v panelu: stálý název „🌗 Tmavý režim“ (jako akce v ⋯ Další) a stav v aria-pressed', () => {
  assert.match(html, /<div class="theme-toggle" id="themeToggle" role="button" tabindex="0" aria-pressed="false">\n\s*<span>🌗 Tmavý režim<\/span>/);
  assert.match(pick('applyTheme'), /\$\('#themeToggle'\)\.setAttribute\('aria-pressed', String\(t === 'dark'\)\)/);
  assert.doesNotMatch(appJs, /themeLabel/);
  assert.match(appJs, /id="moreTheme">🌗 \$\{themeNow\(\) === 'dark' \? 'Světlý' : 'Tmavý'\} režim/);
});

test('našeptávač Odkud/Kam: šipka po Esc nabídku znovu otevře (prázdné pole → tipy), jinak beze změny', () => {
  const src = flightsJs.match(/\n {4}key\(e\) \{[\s\S]*?\n {4}\}\n/)[0];
  const ctx = vm.createContext({});
  vm.runInContext(`this.K = {${src}};`, ctx);
  const mk = (value, rows) => {
    const calls = [];
    const o = { input: { value }, dd: { hidden: true }, active: 0, rows: () => rows, open() { calls.push('open'); this.dd.hidden = false; }, fetch: () => calls.push('fetch'), showTips() { calls.push('tips'); }, close() { this.dd.hidden = true; } };
    return { o, calls };
  };
  const key = (o, k) => { let pd = false; ctx.K.key.call(o, { key: k, preventDefault: () => { pd = true; } }); return pd; };
  let t = mk('Pra', [{ sug: {} }, { sug: {} }]);
  t.o.dd.hidden = false;
  assert.equal(key(t.o, 'Escape'), false); assert.equal(t.o.dd.hidden, true);
  assert.equal(key(t.o, 'ArrowDown'), true);
  assert.deepEqual([t.calls, t.o.dd.hidden, t.o.active], [['open'], false, 0], 'otevře se stejným výběrem');
  key(t.o, 'ArrowDown'); assert.equal(t.o.active, 1, 'otevřená: šipka posouvá výběr');
  t = mk('Pra', []); key(t.o, 'ArrowDown'); assert.deepEqual(t.calls, ['fetch'], 'bez návrhů je načte');
  t = mk('', []); key(t.o, 'ArrowDown'); assert.deepEqual(t.calls, ['tips']);
  t = mk('P', []); assert.equal(key(t.o, 'ArrowDown'), false); assert.deepEqual(t.calls, [], 'jedno písmeno: nic');
});

test('našeptávač offline: hláška, že je zařízení offline (pwa.js netError e.offline), ne „neodpovídá“', () => {
  assert.match(flightsJs, /this\.open\(e\.offline \? 'offline' : true\)/);
  assert.match(flightsJs, /\$\{err === 'offline' \? 'Jsi offline – návrhy míst se načtou po připojení k internetu' : err \? 'Našeptávač teď neodpovídá/);
  assert.match(flightsJs, /down = e\.busy \? 'busy' : e\.offline \? 'offline' : true;/);
  assert.match(placesJs, /err = !sugs\.length && \(e\.offline \? 'offline' : true\);/);
  assert.match(placesJs, /\{ down: true, offline \}\)/);
  assert.match(placesJs, /down === 'offline' \? 'Jsi offline – místo půjde dohledat po připojení k internetu'/);
});

test('hledání země: štítky jen od začátku slova – „Itál“ nenajde Estonsko („digitál“)', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`${pick('norm')}\n${pick('tagHit')}\nthis.tagHit = tagHit; this.norm = norm;`, ctx);
  const hit = (tag, q) => ctx.tagHit(tag, ctx.norm(q));
  assert.equal(hit('digitální nomádi', 'Itál'), false);
  assert.equal(hit('pláže', 'plaz'), true);
  assert.equal(hit('hory a pláže', 'pláž'), true);
  assert.equal(hit('street-food', 'food'), true);
  assert.equal(hit('pláže', '!'), false, 'jen interpunkce nenajde všechno');
  assert.match(appJs, /\(c\.tags \|\| \[\]\)\.some\(t => tagHit\(t, q\)\)/);
});

test('ikony v ⋯ Další: ➕ Přidat ATLAS na plochu, 📲 Přenést do jiného zařízení – každá jiná', () => {
  const pwa = read('js/pwa.js'), tr = read('js/transfer.js');
  assert.match(pwa, /const LABEL = '➕ Přidat ATLAS na plochu';/);
  assert.match(pwa, /<h2 class="pwa-h">➕ ATLAS na plochu<\/h2>/);
  assert.doesNotMatch(pwa.replace(/\/\*[\s\S]*?\*\//g, ''), /📲/);
  assert.match(tr, /id="moreXfer">📲 Přenést do jiného zařízení/);
});
