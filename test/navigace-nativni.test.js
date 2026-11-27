// Navigace jako v nativní aplikaci: plovoucí spodní lišta v pevném pořadí, ⋯ Další jako Nastavení telefonu (domov,
// skupiny Sekce · Moje data · Vzhled · O Letsi) a postranní panel na počítači s jedním řádkem stavu cen a řadou malých
// tlačítek s popiskem při najetí.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
const app = read('js/app.js'), fl = read('js/flights.js'), html = read('index.html');
const atlas = read('css/atlas.css'), letsi = read('css/letsi.css');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('spodní lišta: pevné pořadí Přehled · Lety · Cesty · Objevuj · Další, bez samořazení podle používání', () => {
  assert.match(app, /^const navBar = \['flights', 'trip', 'explore'\];$/m);
  assert.doesNotMatch(app, /navSlots|NAV_PRIOR|samy seřadí/);
  assert.match(app, /\$\('#mobileNav'\)\.innerHTML = \['dashboard', \.\.\.navBar\]\.map\(mi\)\.join\(''\)/);
});

test('spodní lišta Letsi: plovoucí pilulka s odsazením, plná plocha bez skla, aktivní sekce na kapsli Pistácie', () => {
  const m = letsi.match(/@media\(max-width:1023px\)\{\s*:root\[data-brand="letsi"\] \.mobile-nav\{([^}]*)\}/);
  assert.ok(m, 'pravidlo lišty');
  assert.match(m[1], /left:max\(12px,env\(safe-area-inset-left\)\);right:max\(12px,env\(safe-area-inset-right\)\);bottom:max\(10px,env\(safe-area-inset-bottom\)\)/);
  assert.match(m[1], /height:64px;[^}]*border-radius:32px/);
  assert.match(letsi, /\] \.mobile-nav\{-webkit-backdrop-filter:none;backdrop-filter:none\}/);
  assert.match(letsi, /\] \.mobile-nav \.mi\.active::before\{background:#D6DE82\}/);
  assert.match(letsi, /\] \.mobile-nav \.mi\.active>svg\{color:#14161F\}/, 'na Pistácii vždy Noc');
  // světlá pilulka bílá na Vápně, tmavá o stupeň světlejší než Noc
  assert.match(letsi, /--nav-bg:#FFFFFF;/);
  assert.match(letsi, /--nav-bg:#1D2029;/);
  // konec stránky nad lištou (64 + 10 px) a otevřená klávesnice lištu schová
  assert.match(atlas, /\.content\{padding:6px [^}]*calc\(100px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(atlas, /html:has\(:is\(input:not\([^)]*\),textarea\):focus\) \.mobile-nav\{display:none\}/);
});

test('⋯ Další: domovské letiště nahoře, skupiny Sekce · Moje data · Vzhled · O Letsi, motiv jako přepínač', () => {
  const om = app.match(/^function openMore\(\) \{[\s\S]*?^\}/m)[0];
  const at = s => { const i = om.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('id="moreHome"') < at("grp('Sekce'") && at("grp('Sekce'") < at("grp('Moje data'") && at("grp('Moje data'") < at("grp('Vzhled'") && at("grp('Vzhled'") < at("grp('O Letsi'"));
  // každá funkce na svém místě (logika modulů beze změny, jen jiná skupina)
  for (const [f, g] of [['Transfer.addToMenu', 'data'], ['Pwa.addToMenu', 'look'], ['Plus.addToMenu', 'about'], ['About.addToMenu', 'about']]) assert.ok(om.includes(`${f}(${g})`), f);
  assert.match(om, /helpSwitch\(\$\('#moreHelp'\)\)/);
  assert.match(om, /\$\('#moreHome', m\)\.onclick = \(\) => \{ modalClose\(\); \$\('#homeChip'\)\.click\(\); \};/, 'domov stejnou cestou jako čip nahoře');
  assert.match(om, /\$\('#themeToggle'\)\.click\(\); e\.currentTarget\.setAttribute\('aria-checked'/);
  assert.doesNotMatch(om, /more-tip|mn-grid/);
  // řádek aspoň 52 px (dotyk), přepínač místo šipky
  assert.match(atlas, /\.more-sheet \.mg>\.btn\{[^}]*min-height:58px/);
  assert.match(atlas, /\.more-sheet \.mg>\[role="switch"\]::after\{display:none\}/);
  assert.match(atlas, /\.more-sheet \.mg>\[hidden\]\{display:none\}/, 'skrytá položka Přidat na plochu zůstane skrytá');
});

test('Další: popis domova z nastavení domova (S.home), bez domova výzva', () => {
  const homeLine = new Function(`${app.match(/^const homeLine = .*$/m)[0]}; return homeLine;`)();
  assert.equal(homeLine({ from: [{ label: 'Praha (PRG)' }], radius: 150 }), 'Praha (PRG) · +150 km');
  assert.equal(homeLine({ from: [{ label: 'Praha (PRG)' }, { label: 'Brno (BRQ)' }] }), 'Praha (PRG), Brno (BRQ) · +200 km');
  assert.equal(homeLine(null), 'Odkud obvykle létáš – nastavit');
  assert.equal(homeLine({ from: [] }), 'Odkud obvykle létáš – nastavit');
});

test('postranní panel: zdroje cen jako jeden řádek stavu (rozbalitelný seznam), nic se neztratilo', () => {
  assert.match(html, /<details class="src-box" id="srcBox"><\/details>/);
  assert.match(fl, /box\.innerHTML = `<summary>\$\{srcLine\(\)\}<\/summary>` \+ srcBoxHtml\(\);/);
  const a = fl.indexOf('  const srcOn = '), b = fl.indexOf('  /* ---------- živé ověření cen z mezipaměti');
  const srcLine = new Function('esc', 'health', `${fl.slice(a, b)}; return srcLine;`)(esc, null);
  const p = (id, o = {}) => ({ id, name: id, enabled: true, ...o });
  assert.equal(srcLine({ providers: [p('ryanair'), p('tp', { kind: 'cached' }), p('kiwi', { enabled: false })] }), 'Ceny živě · 2 zdroje');
  assert.equal(srcLine({ providers: [p('tp', { kind: 'cached' })] }), 'Ceny orientačně · 1 zdroj');
  assert.equal(srcLine({ demo: true, providers: [1, 2, 3, 4, 5].map(i => p('d' + i, { kind: 'demo' })) }), 'Ceny demo · 5 zdrojů');
  assert.equal(srcLine(null), 'Zdroje cen se načítají');
});

test('postranní panel Letsi: aktivní řádek Noc s Vápnem, dole řada malých tlačítek s popiskem při najetí', () => {
  assert.match(letsi, /\] \.nav-item\.active\{background:var\(--text\);color:var\(--bg\)/);
  assert.match(letsi, /\] \.sidebar\{background:var\(--bg\);[^}]*backdrop-filter:none/);
  // motiv v řadě tlačítek, moduly se přidávají za něj (afterend) – stejný kontejner
  assert.match(html, /<div class="side-tools">\s*<div class="theme-toggle" id="themeToggle"/);
  assert.match(app, /\['mouseover', 'focusin'\]\.forEach\(t => \$\('\.side-tools'\)\.addEventListener\(t, e => \{ const b = e\.target\.closest\('\.side-tools>\*'\); if \(b && !b\.dataset\.tip\) b\.dataset\.tip = b\.textContent\.trim\(\); \}\)\);/);
  assert.match(letsi, /\.side-tools>\[data-tip\]:hover::after,[^{]*\.side-tools>\[data-tip\]:focus-visible::after\{content:attr\(data-tip\)/);
  // text tlačítek zůstává pro čtečku: font-size 0, ne display:none
  assert.match(letsi, /\.side-tools>:is\(\.theme-toggle,\.side-about\)\{[^}]*font-size:0\}/);
});
