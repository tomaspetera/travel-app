// Desktopové rozvržení (public/css/desktop.css): jen pro široké obrazovky – telefon a tablet beze změny – a načtené
// jako poslední styl, ať přebije základní pravidla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const css = readFileSync(new URL('../public/css/desktop.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

/** Pravidla mimo @media bloky (komentáře pryč) – nejvyšší úroveň má být prázdná. */
function topLevel(src) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0, out = '';
  const media = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') {
      if (depth === 0) { const head = out.slice(out.lastIndexOf('}') + 1).trim(); media.push(head); out += '{'; }
      depth++;
    } else if (c === '}') { depth--; if (depth === 0) out += '}'; } else if (depth === 0) out += c;
  }
  return { rest: out.replace(/[^{}]*\{\}/g, (m) => m.trim()).replace(/[{}]/g, '').trim(), media };
}

test('desktop.css: všechna pravidla jen v @media od 1024 px (telefon a tablet beze změny)', () => {
  const { media } = topLevel(css);
  assert.ok(media.length >= 3, media.join(' | '));
  for (const m of media) assert.match(m, /^@media \(min-width:(1024|1600)px\)/, m);
});

test('desktop.css se načítá za základními styly, desktopové doplňky obrazovek (desktop-*.css) až za ním', () => {
  const links = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"(?: media="[^"]*")?>/g)].map((m) => m[1]);
  const at = links.indexOf('css/desktop.css');
  assert.ok(at > 0, links.join(', '));
  assert.ok(links.slice(at + 1).every((l) => /^css\/desktop-[a-z]+\.css$/.test(l)), links.join(', '));
  assert.ok(links.slice(0, at).every((l) => !/desktop/.test(l)), links.join(', '));
  assert.ok(links.includes('css/atlas.css') && links.includes('css/trip.css'));
});

test('desktopové styly mají v index.html media od 1024 px (na telefonu neblokují první vykreslení), základní styly bez media', () => {
  const links = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"(?: media="([^"]*)")?>/g)].map((m) => [m[1], m[2]]);
  const desk = links.filter(([h]) => /^css\/desktop/.test(h));
  assert.ok(desk.length >= 4, desk.join(' | '));
  // každý desktop*.css ze složky je v index.html (nový soubor se tak nevyhne kontrole níž)
  const files = readdirSync(new URL('../public/css/', import.meta.url)).filter((f) => /^desktop.*\.css$/.test(f)).map((f) => `css/${f}`);
  assert.deepEqual(desk.map(([h]) => h).sort(), files.sort());
  for (const [h, media] of links) assert.equal(media, /^css\/desktop/.test(h) ? '(min-width:1024px)' : undefined, h);
  // media u odkazu je bezpečné, jen když je celý soubor v @media od 1024 px (užší okno ho nesmí potřebovat)
  for (const [h] of desk) {
    const { rest, media } = topLevel(readFileSync(new URL(`../public/${h}`, import.meta.url), 'utf8'));
    assert.equal(media.reduce((r, m) => r.replace(m, ''), rest).trim(), '', `${h}: pravidla mimo @media`);
    for (const m of media) assert.ok(Number((/^@media \(min-width:(\d+)px\)/.exec(m) || [])[1]) >= 1024, `${h}: ${m}`);
  }
});

test('desktop-flights.css: jen v @media od 1024 px, načtený za desktop.css', () => {
  const src = readFileSync(new URL('../public/css/desktop-flights.css', import.meta.url), 'utf8');
  const { media } = topLevel(src);
  assert.ok(media.length >= 2, media.join(' | '));
  for (const m of media) assert.match(m, /^@media \(min-width:(1024|1200|1600|1800)px\)/, m);
  const links = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"(?: media="[^"]*")?>/g)].map((m) => m[1]);
  assert.ok(links.indexOf('css/desktop-flights.css') > links.indexOf('css/desktop.css'), links.join(', '));
});

test('desktop-flights.css (průchod uživatele): nabídky nad ohybem, nižší karty, mozaika Rychlého hledání, srovnání podle karet; „/“ do hledání', () => {
  const src = readFileSync(new URL('../public/css/desktop-flights.css', import.meta.url), 'utf8');
  // radar: výška podle textu (ne 4:5), 3 / 4 / 6 sloupců podle šířky
  assert.match(src, /#radar \.radar-grid>\.radar-card\{aspect-ratio:auto;min-height:200px;padding-top:48px\}/);
  assert.match(src, /@media \(min-width:1024px\) and \(max-width:1279px\)\{\s*#radar \.radar-grid\{grid-template-columns:repeat\(3,/);
  assert.match(src, /@media \(min-width:1800px\)\{\s*#radar \.radar-grid\{grid-template-columns:repeat\(6,/);
  // Rychlé hledání: 7 dlaždic = první přes dvě řady + 6 ve třech sloupcích (bez díry)
  assert.match(src, /#quickFlights>\.dest:first-child:nth-last-child\(7\),#flIdeas>\.dest:first-child:nth-last-child\(7\)\{grid-row:span 2\}/);
  // nízký notebook: úvod bez vysvětlující věty; srovnání 📌 se dvěma kartami 800 px
  assert.match(src, /@media \(min-width:1024px\) and \(max-height:820px\)\{\s*#heroBox p\{display:none\}/);
  assert.match(src, /\.modal:has\(\.pin-modal \.pin-cards>:nth-child\(2\):last-child\)\{width:min\(800px,100%\)\}/);
  const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /const SLASH = \{ dashboard: '#heroTo input', flights: '#toInput input', explore: '#exQ', countries: '#cSearch' \}/);
  assert.match(app, /e\.key !== '\/'.*\|\| !SLASH\[activeView\]/);
});

// Objevuj, Plánovač, Doporučení, Mapa a okna na desktopu (public/css/desktop-explore.css)
const explore = readFileSync(new URL('../public/css/desktop-explore.css', import.meta.url), 'utf8');

test('desktop-explore.css: všechna pravidla jen v @media od 1024 px (telefon a tablet beze změny), načtené po desktop.css', () => {
  const { media } = topLevel(explore);
  assert.ok(media.length >= 4, media.join(' | '));
  for (const m of media) {
    const min = Number((/^@media \(min-width:(\d+)px\)/.exec(m) || [])[1]);
    assert.ok(min >= 1024, m);
  }
  const links = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"(?: media="[^"]*")?>/g)].map((m) => m[1]);
  assert.ok(links.indexOf('css/desktop-explore.css') > links.indexOf('css/desktop.css'), links.join(', '));
});

test('desktop-explore.css: Objevuj – mapa vedle seznamu přes výšku okna, přehled země jako mřížka karet, okno země ve dvou sloupcích', () => {
  assert.match(explore, /\.ex-main>\.ex-map\{position:sticky;top:var\(--sticky-top\);height:calc\(100vh - var\(--sticky-top\) - 24px\)/);
  // celá země jako město: skupiny vlevo, mapa vpravo přilepená (stejné pravidlo .ex-main>.ex-map), karty v mřížce
  assert.match(explore, /\.ex-layout\.ex-main:has\(#exCList\)\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);grid-template-areas:"places map"/);
  assert.doesNotMatch(explore, /\.ex-main:has\(#exCList\)>\.ex-map\{position:relative/);
  assert.match(explore, /#exCList\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(300px,1fr\)\)/);
  // značka místa pod myší (places.js přidá .hot)
  assert.match(explore, /\.maplibregl-marker\.mk\.hot\{/);
  assert.match(explore, /\.modal:has\(>\.modal-hero\.mh-photo\)\{display:grid;grid-template-columns:40% 60%/);
  // zavírací tlačítko vpravo nahoře okna: hlavička 40 % → -150 % její šířky = zbývajících 60 %
  assert.match(explore, /\.modal>\.modal-hero\.mh-photo>\.modal-close\{right:calc\(-150% \+ 18px\)/);
});

test('desktop.css: obsah i horní lišta ve stejném kontejneru uprostřed (stejný výpočet okrajů)', () => {
  const pad = 'max(var(--gutter),calc((100% - var(--content-max)) / 2))';
  assert.ok(css.includes(`.topbar{padding:20px ${pad} 18px}`));
  assert.ok(css.includes(`.content{max-width:none;padding:4px ${pad} 72px}`));
  assert.match(css, /--content-max:1240px/);
  assert.match(css, /@media \(min-width:1600px\)\{:root\{--content-max:1360px\}\}/);
});

test('postranní lišta: obsah, který se nevejde do výšky okna, jde posunout (dřív zůstal pod okrajem)', () => {
  const css = readFileSync(new URL('../public/css/atlas.css', import.meta.url), 'utf8');
  const rule = css.match(/\.sidebar\{[^}]*\}/)[0];
  assert.match(rule, /position:sticky/);
  assert.match(rule, /overflow-y:auto/);
});

// Kontrola na počítači (1366×650 až 2560×1440): přilepené panely průvodce, klávesnice, posun pod lepicí lištu
const tripCss = readFileSync(new URL('../public/css/desktop-trip.css', import.meta.url), 'utf8');
const flightsCss = readFileSync(new URL('../public/css/desktop-flights.css', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const flightsJs = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
/** Deklarace pravidla s přesným selektorem (komentáře pryč). */
const decl = (src, sel) => {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = s.indexOf(sel + '{');
  assert.ok(at >= 0, sel);
  return s.slice(at + sel.length + 1, s.indexOf('}', at));
};

test('průvodce: přilepený přehled cesty a pravý sloupec Shrnutí se posouvají samy, tlačítka zůstanou vidět', () => {
  // Shrnutí: sloupec ~1100 px přilepený na 160 px – 💾 Uložit do plánovače byl i na 1912 × 904 pod okrajem okna
  for (const sel of ['#tripRoot .trip-aside', '#tripRoot[data-step=summary] #tripStep>.sum-side']) {
    const r = decl(tripCss, sel);
    assert.match(r, /position:sticky;top:var\(--trip-stick\)/, sel);
    assert.match(r, /max-height:calc\(100vh - var\(--trip-stick\) - \d+px\)/, sel);
    assert.match(r, /overflow-y:auto/, sel);
  }
  assert.match(decl(tripCss, '#tripRoot[data-step=summary] #tripStep>.sum-side>.sum-acts'), /position:sticky;bottom:0/);
  assert.match(decl(tripCss, '.ta-next'), /position:sticky;bottom:0/);
  assert.match(tripCss, /html:has\(#view-trip\.active\)\{scroll-padding-top:var\(--trip-stick\)\}/);
});

test('posun k prvku (Tab, Shift+Tab, odrolování) končí pod lepicí horní lištou, v Zemích pod přilepenými filtry', () => {
  assert.match(css, /html\{scroll-padding-top:104px\}/);
  // odsazení pro telefon (90–100 px) by se na počítači sečetlo s odsazením stránky
  assert.match(css, /#watchList \.watch,#radarHead,#progress,[^{]*\{scroll-margin-top:0\}/);
  assert.match(flightsCss, /@media \(min-width:1024px\) and \(min-height:821px\)\{[\s\S]*?html:has\(#view-countries\.active\)\{scroll-padding-top:232px\}/);
});

test('klávesnice: karty a odkazy z <div>/<span> jdou Tabem vybrat a Enterem otevřít', () => {
  const kb = appJs.match(/^function kbClick\(el\) \{[\s\S]*?^\}/m);
  assert.ok(kb, 'app.js: kbClick');
  assert.match(kb[0], /el\.tabIndex = 0; el\.setAttribute\('role', 'button'\)/);
  assert.match(kb[0], /e\.target === el && \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  // karta země (Země, Doporučení, Tipy), odkaz v nadpisu sekce, cesta v Plánovači a Nová cesta
  assert.match(appJs, /function bindDest\(sel\) \{[^\n]*kbClick\(el\)/);
  assert.match(appJs, /\$\$\('\.link\[data-go\]'\)\.forEach\(l => \{ l\.onclick = [^\n]*kbClick\(l\)/);
  assert.match(appJs, /\$\$\('\.trip\[data-ti\]'\)\.forEach\(el => \{ el\.onclick = [^\n]*kbClick\(el\)/);
  assert.match(appJs, /kbClick\(\$\('#newTripTile'\)\)/);
  // Rychlé hledání / Nápady, ⭐ Moje cíle, Obnovit → a Zkontrolovat vše →
  assert.match(flightsJs, /\$\$\('\[data-qf\]'\)\.forEach\(kbClick\)/);
  assert.match(flightsJs, /qv\.onclick = [^\n]*kbClick\(qv\)/);
  assert.match(flightsJs, /kbClick\(\$\('#radarReload'\)\)/);
  assert.match(flightsJs, /kbClick\(\$\('#watchCheckAll'\)\)/);
});

test('klávesnice: otevřené okno dostane fokus, Tab v něm koluje a po zavření se fokus vrátí (jen počítač s myší)', () => {
  assert.match(appJs, /const modalKb = \{ ret: null, sel: '', mq: [^\n]*matchMedia\('\(min-width:1024px\) and \(hover:hover\) and \(pointer:fine\)'\)/);
  // okno z okna přes modalClose() + modalOpen() (Info o zemi z okna cesty): fokus je na tlačítku zavřeného okna, které
  // zmizí – zůstane původní tlačítko
  assert.match(appJs, /if \(!was && !\$\('#modal'\)\.contains\(document\.activeElement\)\) \{ modalKb\.ret = document\.activeElement; modalKb\.sel = kbSel\(modalKb\.ret\); \}/);
  assert.match(appJs, /if \(on\) \{ if \(!m\.contains\(a\)\) \{ m\.tabIndex = -1; m\.focus\(\{ preventScroll: true \}\); \} return; \}/);
  // tlačítko překreslené, zatímco bylo okno otevřené (karta cesty v Plánovači po úpravě v okně): stejné id / data-*
  assert.match(appJs, /const r = r0 && r0\.isConnected \? r0 : sel \? \$\$\(sel\)\.find\(x => !m\.contains\(x\) && x\.getClientRects\(\)\.length\) : null;/);
  assert.match(appJs, /r\.focus\(\{ preventScroll: true \}\)/);
  assert.match(appJs, /if \(e\.key !== 'Tab' \|\| e\.defaultPrevented \|\| !\$\('#modalBg'\)\.classList\.contains\('show'\)\) return;/);
  assert.match(css, /#modal:focus\{outline:none\}/);
});

test('myš a dlouhé řádky: odkazy sekcí a čipy reagují na najetí, „Jak hledat chytře“ ve dvou sloupcích, poznámka pod výsledky užší', () => {
  assert.match(css, /\.section-head \.link:hover\{text-decoration:underline/);
  assert.match(css, /\.fchip:hover:not\(:disabled\)\{border-color:var\(--accent\)/);
  assert.match(css, /\.sg-list\{display:block;columns:2/);
  assert.match(css, /\.sg-list>li\{break-inside:avoid/);
  assert.match(css, /#results \.res-foot\{max-width:min\(100%,90ch\)\}/);
  assert.match(flightsCss, /#results>\.res-more~\.res-foot\{[^}]*max-width:min\(calc\(100% - var\(--side\) - var\(--gap\)\),90ch\)\}/);
});

test('klávesnice: fokus po zavření okna najde i překreslené tlačítko – podle id, jinak podle prvního data-* atributu', () => {
  const src = appJs.match(/^function kbSel\(el\) \{[\s\S]*?^\}/m);
  assert.ok(src, 'app.js: kbSel');
  const body = { tagName: 'BODY' };
  const kbSel = new Function('document', 'CSS', `${src[0]}; return kbSel;`)({ body }, { escape: (s) => String(s).replace(/["\\]/g, '\\$&') });
  const el = (tagName, id, attrs) => ({ tagName, id, attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })) });
  assert.equal(kbSel(el('BUTTON', 'tripCountry', { class: 'btn' })), '#tripCountry');
  assert.equal(kbSel(el('DIV', '', { class: 'card trip', 'data-ti': '0', tabindex: '0' })), 'div[data-ti="0"]', 'karta cesty v Plánovači');
  assert.equal(kbSel(el('DIV', '', { class: 'card dest', 'data-iso': 'PT', 'data-photo': 'x' })), 'div[data-iso="PT"]');
  assert.equal(kbSel(el('SPAN', '', { class: 'link' })), '', 'bez id a data-* nic');
  assert.equal(kbSel(body), '');
  assert.equal(kbSel(null), '');
});
