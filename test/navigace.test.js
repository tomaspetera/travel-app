// Navigace jako v nativní aplikaci (majitel vybral „A s úpravami“): spodní lišta v plné Noci v pevném pořadí, ⋯ Další
// jako Nastavení telefonu (domovské letiště s kódem, skupiny Sekce · Moje data · Vzhled · O Letsi, přepínače), postranní
// panel Letsi na počítači v Noci se skupinami, řádkem stavu cen a ikonami s popiskem; úvodní obrazovka s očima dohraje
// jen v aplikaci na ploše. Funkce z app.js podle jména (jako dalsi-pocitac.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
const app = read('js/app.js'), fl = read('js/flights.js'), html = read('index.html');
const atlas = read('css/atlas.css'), letsi = read('css/letsi.css'), desk = read('css/desktop.css');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
/** Funkce nebo konstanta z app.js podle jména (víceřádková do „}“ na začátku řádku). */
const pick = (name) => {
  const m = app.match(new RegExp(`^(function ${name}\\([\\s\\S]*?^\\}|const ${name} = .*)$`, 'm'));
  assert.ok(m, `app.js: ${name}`);
  return m[0];
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ikona = (n) => `<span class="ico i-${n}" aria-hidden="true"></span>`;

test('spodní lišta: pevně Přehled · Lety · Cesty · Objevuj · Další, bez řazení podle používání', () => {
  assert.match(app, /^const navBar = \['flights', 'trip', 'explore'\];$/m);
  assert.match(pick('buildNav'), /\$\('#mobileNav'\)\.innerHTML = \['dashboard', \.\.\.navBar\]\.map\(mi\)\.join\(''\)/);
  assert.doesNotMatch(app, /navSlots|NAV_PRIOR|samy seřadí|otevíráš nejčastěji/);
});

test('spodní lišta Letsi: plná Noc i ve světlém režimu, v tmavém #1D2029 s linkou #343A48, bez skla', () => {
  assert.match(letsi, /--nav-bg:#14161F; --nav-line:#14161F; --nav-ico:#A6ACB6;/);
  assert.doesNotMatch(letsi, /--nav-bg:#FFFFFF/);
  assert.match(letsi, /--nav-bg:#1D2029; --nav-line:#343A48; --nav-ico:#A6ACB6;/);
  const m = letsi.match(/@media\(max-width:1023px\)\{\s*:root\[data-brand="letsi"\] \.mobile-nav\{([^}]*)\}/);
  assert.match(m[1], /left:max\(12px,env\(safe-area-inset-left\)\);right:max\(12px,env\(safe-area-inset-right\)\);bottom:max\(10px,env\(safe-area-inset-bottom\)\)/);
  assert.match(m[1], /height:64px;[^}]*border-radius:32px/);
  assert.match(letsi, /\] \.mobile-nav\{-webkit-backdrop-filter:none;backdrop-filter:none\}/);
  // pozadí a okraj z tokenů (atlas.css), sklo ATLASu přebité
  assert.match(atlas, /\.mobile-nav\{[^}]*background:var\(--nav-bg\);border:1px solid var\(--nav-line\)/);
});

test('spodní lišta Letsi: aktivní sekce = Pistáciová kapsle s ikonou Noc, popisky Onest 11 px, kontrast ≥ 4,5 : 1', () => {
  assert.match(letsi, /\] \.mobile-nav \.mi\.active::before\{background:#D6DE82\}/);
  assert.match(letsi, /\] \.mobile-nav \.mi\.active>svg\{color:#14161F\}/);
  assert.match(letsi, /\] \.mobile-nav \.mi\{[^}]*color:var\(--nav-ico\)\}/);
  assert.match(letsi, /\] \.mobile-nav \.mi\.active,[^{]*\.mobile-nav \.mi\.active\{background:none;color:#F3F4F0;/);
  assert.match(letsi, /\] \.mobile-nav \.mi span\{font:500 11px\/1\.15 var\(--letsi-pismo-text\);/);
  // ani na 360 px se popisky nezmenší pod 11 px (atlas.css je tam zmenšuje na 10 px)
  assert.match(letsi, /@media\(max-width:360px\)\{:root\[data-brand="letsi"\] \.mobile-nav \.mi span\{font-size:11px;/);
  assert.doesNotMatch(noComments(letsi).match(/SPODNÍ LIŠTA[\s\S]*?ÚVODNÍ OBRAZOVKA/)?.[0] || '', /letsi-pismo-titulky|uppercase/);
  const L = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  for (const bg of ['#14161F', '#1D2029']) for (const fg of ['#A6ACB6', '#F3F4F0']) assert.ok(contrast(fg, bg) >= 4.5, `${fg} na ${bg}`);
  assert.ok(contrast('#14161F', '#D6DE82') >= 4.5, 'Noc na Pistácii');
});

test('otevřená klávesnice: lišta zmizí jen na dotykovém telefonu a jen u textových polí', () => {
  const rule = atlas.match(/@media \(hover:none\) and \(max-width:860px\)\{\s*([^}]*\})\s*\}/);
  assert.ok(rule, 'pravidlo jen pro dotyk a ≤ 860 px');
  assert.equal(rule[1], 'html:has(input:not([type=checkbox]):not([type=radio]):not([type=range]):focus, textarea:focus, [contenteditable]:focus) .mobile-nav{display:none}');
  // jinde (podle šířky) ne – úzké okno na počítači lištu při psaní neschová
  assert.equal((atlas.match(/:focus[^{]*\.mobile-nav\{display:none\}/g) || []).length, 1);
});

test('kód domovského letiště: z id „ap:PRG“, jinak z popisku „… (PRG)“, jinak nic', () => {
  const homeCode = new Function(`${pick('homeCode')}; return homeCode;`)();
  assert.equal(homeCode({ id: 'ap:PRG', label: 'Praha' }), 'PRG');
  assert.equal(homeCode({ id: 'x', label: 'Brno (BRQ)' }), 'BRQ');
  assert.equal(homeCode({ id: 'cc:CZ', label: 'Česko' }), '');
  assert.equal(homeCode(null), '');
});

test('Další: řádek Domovské letiště – kód PRG, „Praha · okruh 200 km“ a Změnit; bez kódu ikona, bez domova Nastavit', () => {
  const homeRow = new Function('esc', 'ikona', `${pick('homeCode')}\n${pick('homeRow')}\nreturn homeRow;`)(esc, ikona);
  const one = homeRow({ from: [{ id: 'ap:PRG', label: 'Praha (PRG)' }] });
  assert.match(one, /^<button type="button" class="btn ghost more-home has-code" id="moreHome"><b class="mh-code" aria-hidden="true">PRG<\/b> Domovské letiště <span class="faint">Praha · okruh 200 km<\/span><span class="mh-go" aria-hidden="true">Změnit<\/span><\/button>$/);
  assert.match(homeRow({ from: [{ id: 'ap:PRG', label: 'Praha (PRG)' }, { id: 'ap:VIE', label: 'Vídeň (VIE)' }], radius: 150 }), /<span class="faint">Praha, Vídeň · okruh 150 km<\/span>/);
  assert.match(homeRow({ from: [{ id: 'ap:PRG', label: 'Praha (PRG)' }], radius: 0 }), /Praha · jen toto letiště/);
  // místo bez kódu (země): ikona domova, žádný prázdný kód; jméno escapované
  const cz = homeRow({ from: [{ id: 'cc:CZ', label: '<Česko>' }] });
  assert.doesNotMatch(cz, /mh-code|has-code/);
  assert.match(cz, /i-domov[\s\S]*&lt;Česko&gt; · okruh 200 km/);
  // bez domova obyčejný řádek se šipkou (výzva je v názvu, druhé „Nastavit“ vpravo by se na 360 px nevešlo)
  for (const h of [null, { from: [] }]) assert.equal(homeRow(h), '<button type="button" class="btn ghost" id="moreHome"><span class="ico i-domov" aria-hidden="true"></span> Nastavit domovské letiště <span class="faint">odkud obvykle létáš</span></button>');
  // vzhled: kód písmem značky ve čtverečku #EDEFD6 (--surface-2), ne celá Pistácie
  assert.match(letsi, /\] \.more-home \.mh-code\{font-family:var\(--letsi-pismo-titulky\)/);
  assert.match(atlas, /\.more-sheet \.mg>\.more-home::after\{display:none\}/);
  assert.doesNotMatch(noComments(letsi + atlas), /more-home[^{]*\{[^}]*#D6DE82/i);
});

test('⋯ Další: domov nahoře, skupiny Sekce · Moje data · Vzhled · O Letsi, každá funkce ve své skupině', () => {
  const om = pick('openMore');
  const at = (s) => { const i = om.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('homeRow(S.home)') < at("grp('Sekce'") && at("grp('Sekce'") < at("grp('Moje data'") && at("grp('Moje data'") < at("grp('Vzhled'") && at("grp('Vzhled'") < at("grp('O Letsi'"));
  for (const [f, g] of [['Transfer.addToMenu', 'data'], ['Pwa.addToMenu', 'look'], ['Plus.addToMenu', 'about'], ['About.addToMenu', 'about']]) assert.ok(om.includes(`${f}(${g})`), f);
  assert.match(om, /data\.insertAdjacentHTML\('beforeend', `<button type="button" class="btn ghost" id="moreBk">/, 'Záloha v Moje data');
  assert.match(om, /data\.insertAdjacentHTML\('beforeend', helpBtn\('moreHelp'\)\);/);
  assert.match(om, /about\.insertAdjacentHTML\('beforeend', `<button type="button" class="btn ghost" id="moreWn">/);
  assert.match(om, /\$\('#moreHome', m\)\.onclick = \(\) => \{ modalClose\(\); \$\('#homeChip'\)\.click\(\); \};/, 'domov stejnou cestou jako čip nahoře');
  assert.match(om, /\['world', 'recommend'\]\.map/, 'Svět a Doporučení (sekce mimo lištu)');
  assert.doesNotMatch(om, /more-tip|mn-grid|more-tile/);
});

test('Další: Tmavý režim a Pomáhat se zlepšováním jako skutečné přepínače (role=switch, aria-checked)', () => {
  const om = pick('openMore');
  assert.match(om, /role="switch" aria-checked="\$\{themeNow\(\) === 'dark'\}" id="moreTheme"/);
  assert.match(om, /\$\('#themeToggle'\)\.click\(\); e\.currentTarget\.setAttribute\('aria-checked', String\(themeNow\(\) === 'dark'\)\);/);
  assert.match(pick('helpBtn'), /role="switch" aria-checked="\$\{Count\.helping\(\)\}"/);
  assert.match(om, /\$\$\('\[role="switch"\]', m\)\.forEach\(b => b\.insertAdjacentHTML\('beforeend', '<i class="sw" aria-hidden="true"><\/i>'\)\)/);
  assert.match(atlas, /\.more-sheet \.mg>\[role="switch"\]::after\{display:none\}/);
  assert.match(atlas, /\.more-sheet \[aria-checked="true"\] \.sw::after\{transform:translateX\(20px\)\}/);
});

test('Další: Přidat Letsi na plochu ve skupině Vzhled s ikonou plus; skrytý řádek nenechá dvojitou linku', () => {
  assert.match(read('js/pwa.js'), /const ICON = '<span class="ico i-plus" aria-hidden="true"><\/span> ';/);
  assert.match(read('js/pwa.js'), /b\.className = 'btn ghost pwa-menu-item';[\s\S]*?b\.hidden = !mode\(\);/);
  assert.match(atlas, /\.more-sheet \.mg>\[hidden\]\{display:none\}/);
  // linka jen za viditelným řádkem (ne .btn+.btn: za skrytým prvním řádkem by vznikla linka navíc u okraje skupiny)
  assert.match(atlas, /\.more-sheet \.mg>\.btn:not\(\[hidden\]\)~\.btn\{border-top:1px solid var\(--border\)\}/);
  assert.doesNotMatch(atlas, /\.mg>\.btn\+\.btn/);
  // řádek aspoň 52 px (dotyk)
  assert.match(atlas, /\.more-sheet \.mg>\.btn\{[^}]*min-height:58px/);
});

test('postranní panel: skupiny Cestování a Svět (jen vzhled Letsi na počítači), zdroje cen jedním řádkem', () => {
  assert.match(app, /^const NAV_GROUP = \{ dashboard: 'Cestování', map: 'Svět' \};$/m);
  assert.match(pick('buildNav'), /\(NAV_GROUP\[n\[0\]\] \? `<div class="nav-h" aria-hidden="true">\$\{NAV_GROUP\[n\[0\]\]\}<\/div>` : ''\)/);
  assert.match(atlas, /^\.nav-h\{display:none\}/m, 'ATLAS a tablet bez nadpisů');
  assert.match(html, /<details class="src-box" id="srcBox"><\/details>/);
  assert.match(fl, /box\.innerHTML = `<summary>\$\{srcLine\(\)\}<\/summary>` \+ srcBoxHtml\(\);/);
  const a = fl.indexOf('  const srcOn = '), b = fl.indexOf('  /* ---------- živé ověření cen z mezipaměti');
  const srcLine = new Function('esc', 'health', `${fl.slice(a, b)}; return srcLine;`)(esc, null);
  const p = (id, o = {}) => ({ id, name: id, enabled: true, ...o });
  assert.equal(srcLine({ providers: [p('ryanair'), p('tp', { kind: 'cached' }), p('kiwi', { enabled: false })] }), 'Ceny živě · 2 zdroje');
  assert.equal(srcLine({ providers: [p('tp', { kind: 'cached' })] }), 'Ceny orientačně · 1 zdroj');
  assert.equal(srcLine({ demo: true, providers: [1, 2, 3, 4, 5].map((i) => p('d' + i, { kind: 'demo' })) }), 'Ceny demo · 5 zdrojů');
  assert.equal(srcLine(null), 'Zdroje cen se načítají');
});

test('postranní panel Letsi: jen v desktop.css od 1024 px – Noc, Pistáciová kapsle, Onest, popisek pod ikonami', () => {
  // letsi.css platí od 861 px (tablet) – panel tam nepatří (CLAUDE.md: počítač jen v desktop*.css)
  assert.doesNotMatch(noComments(letsi), /\.sidebar\{|\.side-tools|\.src-box|\.nav-item\{|\.nav-item\.active\{|\.nav-h/);
  const at = desk.indexOf('/* ---------- postranní panel Letsi');
  assert.ok(at > 0);
  const panel = desk.slice(at);
  assert.match(panel, /^[^\n]*\n(?:[^\n]*\n)*?@media \(min-width:1024px\)\{/);
  assert.match(panel, /:root\[data-brand="letsi"\] \.sidebar\{[^}]*background:#14161F;color:#F3F4F0;[^}]*backdrop-filter:none/);
  assert.match(panel, /\[data-theme="dark"\] \.sidebar\{border-right-color:#343A48\}/);
  assert.match(panel, /:root\[data-brand="letsi"\] \.nav-item\.active\{background:#D6DE82;color:#14161F;/);
  assert.match(panel, /:root\[data-brand="letsi"\] \.nav-h\{display:block;[^}]*var\(--letsi-pismo-text\)/);
  assert.match(panel, /\.src-box>summary\{color:#C3C8CF;font:600 13px\/1\.35 var\(--letsi-pismo-text\)\}/, 'stav cen čitelně Onestem');
  // popisek při najetí i z klávesnice, POD řadou ikon (nad ní by zakryl rozbalené zdroje a Přidat na plochu)
  const tip = panel.match(/\.side-tools>\[data-tip\]:hover::after,[^{]*\.side-tools>\[data-tip\]:focus-visible::after\{([^}]*)\}/);
  assert.ok(tip, 'popisek pro myš i klávesnici');
  assert.match(tip[1], /content:attr\(data-tip\);\s*position:absolute;left:0;right:0;top:calc\(100% \+ 6px\)/);
  assert.doesNotMatch(tip[1], /bottom:/);
  assert.match(panel, /\] \.sidebar\{padding:22px 14px 40px;/, 'rezerva pro popisek pod ikonami');
  // ikony mají jméno pro čtečku: text tlačítka zůstává (font-size 0), popisek se plní z něj
  assert.match(panel, /\.side-tools>:is\(\.theme-toggle,\.side-about\):not\(\.pwa-install\)\{[^}]*font-size:0\}/);
  assert.match(app, /\['mouseover', 'focusin'\]\.forEach\(t => \$\('\.side-tools'\)\.addEventListener\(t, e => \{ const b = e\.target\.closest\('\.side-tools>\*'\); if \(b && !b\.dataset\.tip\) b\.dataset\.tip = b\.textContent\.trim\(\); \}\)\);/);
  assert.match(html, /<div class="side-tools">\s*<div class="theme-toggle" id="themeToggle"/);
  // Přidat na plochu jako celý čitelný řádek (ne ikona s font-size 0)
  assert.match(panel, /\.side-tools>\.pwa-install\{order:0;flex-basis:100%;[^}]*font-size:13px;/);
});

test('úvodní obrazovka: oči dohrají hlavní pohyb jen v aplikaci na ploše, s omezeným pohybem a v prohlížeči se nečeká', () => {
  const launchWait = new Function(`${pick('launchWait')}; return launchWait;`)();
  const w = (o) => launchWait({ brand: 'letsi', calm: false, app: true, at: 100, now: 400, ...o });
  assert.equal(w(), 950, 'do 1,25 s od začátku');
  assert.equal(w({ now: 2000 }), 0, 'pomalý start: animace dávno dohrála');
  assert.equal(w({ app: false }), 0, 'v prohlížeči úvodní obrazovka není');
  assert.equal(w({ calm: true }), 0, 'omezený pohyb: statické logo, hned pryč');
  assert.equal(w({ brand: undefined, app: false }), 650, 'vlaštovka ATLASu ~0,95 s jako dřív');
  assert.equal(w({ brand: undefined, calm: true }), 0);
  assert.match(pick('launchDone'), /launchWait\(\{\s*brand: document\.documentElement\.dataset\.brand, calm: mq\('\(prefers-reduced-motion: reduce\)'\),\s*app: mq\('\(display-mode: standalone\), \(display-mode: fullscreen\), \(display-mode: minimal-ui\)'\) \|\| navigator\.standalone === true,/);
  // pojistka 6 s v CSS zůstává
  assert.match(html, /animation:launch-off 0s linear 6s forwards/);
});

test('úvodní obrazovka: víčka zavřou oči jen do 90 % (bez plného tmavého tvaru), bez přechodu ATLASu ve vzhledu Letsi', () => {
  const css = html.match(/<style>\n\/\* Úvodní obrazovka ve vzhledu Letsi[\s\S]*?<\/style>/)[0];
  const lid = css.match(/@keyframes lo-lid\{((?:[^{}]*\{[^{}]*\})*)\s*\}/)[1];
  const scales = [...lid.matchAll(/scaleY\(([\d.]+)\)/g)].map((m) => +m[1]);
  assert.equal(Math.max(...scales), 0.9);
  // starý modrofialový přechod (#launchG) má jen dlaždice ATLASu, kterou vzhled Letsi skryje
  assert.match(letsi, /\] #launch :is\(\.l-ico,\.l-jet,b\)\{display:none\}/);
  assert.doesNotMatch(css, /launchG|gradient/);
  assert.doesNotMatch(letsi, /nikdy nemrká/);
});
