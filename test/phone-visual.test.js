// Drobnosti vzhledu na telefonu (412 a 360 px, světlý režim), které by se snadno vrátily:
// fotka v hlavičce okna s rohem jako vnitřek okna, ceny „733 Kč“ bez zalomení před „Kč“, čitelné zelené a modré ceny
// a štítky ve světlém režimu, ✕ náhledu cíle bez oranžového rámečku po klepnutí, dny dovolené na kartě radaru celé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** Obsah všech bloků @media se zadanou hlavičkou (bez komentářů), spojený. */
function mediaBody(src, head) {
  const s = noComments(src);
  let out = '', from = 0;
  for (;;) {
    const at = s.indexOf(head, from);
    if (at < 0) return out;
    let i = s.indexOf('{', at) + 1, depth = 1;
    const start = i;
    while (depth && i < s.length) { if (s[i] === '{') depth++; else if (s[i] === '}') depth--; i++; }
    out += s.slice(start, i - 1) + '\n';
    from = i;
  }
}
/** Kontrast barvy #rrggbb proti bílé (WCAG). */
function contrastOnWhite(hex) {
  const lum = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 1.05 / (0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b) + 0.05);
}

test('telefon: fotka v hlavičce okna má roh jako vnitřek okna (roh okna − 1px rámeček) – bez bílého srpku v rozích', () => {
  const atlas = read('css/atlas.css'), flights = read('css/flights.css');
  assert.match(noComments(atlas), /\.modal\{[^}]*border:1px solid/);
  const phone = mediaBody(atlas, '@media(max-width:560px)');
  const modalR = +/\.modal\{width:100%;[^}]*border-radius:(\d+)px \1px 0 0/.exec(phone)[1];
  const heroR = +/\.modal-hero\{border-radius:(\d+)px \1px 0 0\}/.exec(phone)[1];
  assert.equal(heroR, modalR - 1, 'detail země, Je to dobrá cena?, cesta v plánovači');
  const fPhone = mediaBody(flights, '@media(max-width:560px)');
  const dpR = +/\.modal:has\(\.dp\)\{[^}]*border-radius:(\d+)px \1px 0 0/.exec(fPhone)[1];
  const dpHeroR = +/\.dp-hero\{[^}]*border-radius:(\d+)px \1px 0 0/.exec(fPhone)[1];
  assert.equal(dpHeroR, dpR - 1, 'náhled cíle');
});

test('czk(): „733 Kč“ s pevnou mezerou – na telefonu se „Kč“ neodtrhne od částky', () => {
  const line = read('js/app.js').match(/^const czk = .*$/m)[0];
  const ctx = vm.createContext({});
  vm.runInContext(line.replace(/^const czk/, 'globalThis.czk'), ctx);
  assert.equal(ctx.czk(733), '733\u00a0Kč');
  assert.doesNotMatch(ctx.czk(1945), / /, 'žádná obyčejná mezera (ani v tisících)');
  assert.equal(ctx.czk(null), '—');
});

test('délky, teploty a vzdálenosti: „~32 min“, „8 °C“, „1,5 h“, „530 km“ s pevnou mezerou – na 360 px se jednotka neodtrhne', () => {
  // skutečné řádky pomocných funkcí ze zdrojáků (soubory celé potřebují DOM)
  const line = (f, name) => {
    const m = read(`js/${f}`).match(new RegExp(`^\\s*const ${name} = .*$`, 'm'));
    assert.ok(m, `${f}: ${name}`);
    return m[0].trim().replace(/^const /, 'var ');
  };
  const ctx = vm.createContext({ pad: (n) => String(n).padStart(2, '0') });
  vm.runInContext([line('trip.js', 'minutesToHm'), line('trip.js', 'kmTxt'), line('app.js', 'hmTxt'), line('flights.js', 'dur'),
    line('pretrip.js', 'deg'), line('pretrip.js', 'span'), line('pretrip.js', 'degC')].join('\n'), ctx);
  const sh = vm.createContext({ pad: ctx.pad });
  vm.runInContext([line('searchhelp.js', 'hm'), line('searchhelp.js', 'hhmmTxt')].join('\n'), sh);
  const out = {
    'průběh cesty': [ctx.minutesToHm(32), ctx.minutesToHm(48), ctx.minutesToHm(60), ctx.minutesToHm(65), ctx.kmTxt(530)],
    'Dnes na cestě': [ctx.hmTxt(48), ctx.hmTxt(125)],
    'let ve výsledcích': [ctx.dur(125)],
    'seznam věcí': [ctx.degC(8), ctx.degC(-5), ctx.spanC(12, 19), ctx.spanC(-11, -5)],
    'filtry a cesta na letiště': [sh.hm(45), sh.hm(390), sh.hhmmTxt(260), sh.hhmmTxt(50)],
  };
  assert.deepEqual(out['průběh cesty'], ['32\u00a0min', '48\u00a0min', '1\u00a0h', '1\u00a0h 5\u00a0min', '530\u00a0km']);
  assert.deepEqual(out['Dnes na cestě'], ['48\u00a0min', '2\u00a0h 5\u00a0min']);
  assert.deepEqual(out['let ve výsledcích'], ['2\u00a0h 05\u00a0min']);
  assert.deepEqual(out['seznam věcí'], ['8\u00a0°C', '−5\u00a0°C', '12–19\u00a0°C', '−11 až −5\u00a0°C']);
  assert.deepEqual(out['filtry a cesta na letiště'], ['45\u00a0min', '6\u00a0h 30\u00a0min', '4\u00a0h\u00a020', '50\u00a0min']);
  for (const [k, xs] of Object.entries(out)) for (const x of xs) assert.doesNotMatch(x, /\d (min|h|km|°C)\b/, `${k}: ${x}`); // mezi „1 h“ a „5 min“ zalomit smí
  // Dnes na cestě: posun času „o 1,5 h méně než v Praze“; náhled cíle: „Přes den ~22 °C“
  assert.match(read('js/app.js'), /shift = `o \$\{String\(h\)\.replace\('\.', ','\)\}\\u00a0h \$\{/);
  const fl = read('js/flights.js');
  assert.match(fl, /b: `Přes den ~\$\{Math\.round\(d\.tempHi\)\}\\u00a0°C`/);
  assert.match(fl, /'přes den ~\$1\\u00a0°C'/);
});

test('výsledky: vzdálenost „1 352 km“ a štítek cesty z letiště bez zalomení před jednotkou', () => {
  const js = read('js/flights.js');
  assert.match(js, /distanceKm\.toLocaleString\('cs'\)\}\\u00a0km` : ''\}\$\{c && c\.cost/, 'hlavička karty cíle');
  assert.match(js, /const arrChipHtml = c => `[^`]*\$\{nbsp\(esc\(c\.text\)\)\}<\/span>`/, 'štítek „z letiště … (~460 Kč) · 1 h 15“');
  // Kombinace na telefonu: trasa se smí zalomit jen před ↩ (tam a zpět každé celé), jinak by konec uřízly tři tečky
  assert.match(js, /\$\{t\.back \? ` ↩\\u00a0\$\{t\.back\.from/);
});

test('světlý režim: zelené a modré ceny a štítky mají kontrast aspoň 4,5 : 1 (mátová #34d399 na bílé ~1,9 : 1)', () => {
  const fl = noComments(read('css/flights.css')), at = noComments(read('css/atlas.css'));
  const colorOf = (css, sel) => {
    const m = [...css.matchAll(/([^{}]+)\{color:(#[0-9a-f]{6})\}/g)].find((x) => x[1].split(',').map((s) => s.trim()).includes(sel));
    assert.ok(m, `chybí pravidlo pro ${sel}`);
    return m[2];
  };
  for (const sel of ['[data-theme=light] .good', '[data-theme=light] .b.good', '[data-theme=light] .cmp-price b:not(.stale)', '[data-theme=light] .nb-d.best b', '[data-theme=light] .b.info']) {
    const c = colorOf(fl, sel);
    assert.ok(contrastOnWhite(c) >= 4.5, `${sel} ${c}: ${contrastOnWhite(c).toFixed(2)}`);
  }
  for (const sel of ['[data-theme="light"] .months .m.best', '[data-theme="light"] .kv .safe-ok', '[data-theme="light"] .kv .safe-mid', '[data-theme="light"] .kv .safe-bad']) {
    const c = colorOf(at, sel);
    assert.ok(contrastOnWhite(c) >= 4.5, `${sel} ${c}: ${contrastOnWhite(c).toFixed(2)}`);
  }
  // bezpečnost v detailu země třídou (inline barva by světlý režim nepřebil)
  assert.match(read('js/app.js'), /<div class="v \$\{c\.safety >= 4 \? 'safe-ok' : c\.safety >= 3 \? 'safe-mid' : 'safe-bad'\}">/);
});

test('telefon: ✕ náhledu cíle bez fokusového rámečku po klepnutí na kartu radaru (jen dotykový displej bez myši)', () => {
  assert.match(noComments(read('css/flights.css')), /@media \(hover:none\) and \(pointer:coarse\)\{\.dp-x:focus-visible\{outline:none\}\}/);
});

test('telefon: hlídaná cena – název a termín se zalomí, ne „Praha → Lis…“ a „vždy odlet za 38–68 dní (t…“ bez dnů a nocí', () => {
  // poslední pravidlo pro selektor (platí – dřívější přebije)
  const css = noComments(read('css/flights.css')), rule = (sel) => ([...css.matchAll(new RegExp(`^${sel.replace(/\./g, '\\.')}\\{([^}]*)\\}`, 'gm'))].at(-1) || [])[1] || '';
  for (const sel of ['.w-t', '.w-sub']) {
    assert.ok(rule(sel), sel);
    assert.doesNotMatch(rule(sel), /white-space:nowrap|text-overflow:ellipsis/, sel);
  }
  assert.match(rule('.w-t'), /-webkit-line-clamp:2/, 'název nejvýš na 2 řádky');
});

test('telefon: dny dovolené na kartě radaru na vlastním řádku (ne „🏖️ 5 dní dov…“), Země: „Kontinent: vše“ se vejde', () => {
  const phone = mediaBody(read('css/flights.css'), '@media(max-width:560px)');
  assert.match(phone, /\.rc-sub \.rc-lv\{display:block/);
  assert.match(phone, /\.rc-sub \.rc-lv::before\{content:none\}/);
  assert.match(read('index.html'), /<select id="cCont"[^>]*><option value="">Kontinent: vše<\/option><\/select>/);
  assert.match(read('js/app.js'), /\$\('#cCont'\)\.innerHTML = '<option value="">Kontinent: vše<\/option>'/);
});

test('světlý režim (ve dne na slunci): --faint na pozadí, kartě i v okně aspoň 4,5 : 1 a pořád slabší než --muted', () => {
  // tokeny z atlas.css, plochy skládané z poloprůhledných vrstev jako v prohlížeči (jako dark-visual.test.js pro večer)
  const block = noComments(read('css/atlas.css')).match(/\[data-theme="light"\]\{([^}]*)\}/)[1];
  const tok = (n) => block.match(new RegExp(`--${n}:([^;]+);`))[1].trim();
  const rgb = (s) => (s.startsWith('#') ? { r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16), a: 1 }
    : (([r, g, b, a = 1]) => ({ r, g, b, a }))(s.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number)));
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const lum = ({ r, g, b }) => [r, g, b].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
  const BG = rgb(tok('bg'));
  const surfaces = { pozadí: BG, karta: over(rgb(tok('card')), BG), okno: rgb(tok('surface-solid')) };
  for (const [where, bg] of Object.entries(surfaces)) {
    const c = contrast(rgb(tok('faint')), bg);
    assert.ok(c >= 4.5, `--faint na ploše „${where}“: ${c.toFixed(2)} : 1`);
    assert.ok(c < contrast(rgb(tok('muted')), bg), `popisky slabší než --muted (${where})`);
  }
});

test('telefon: karta radaru – dlouhá země se zkrátí, termín zůstane celý (ne „Bosna a Hercegovina · 10.11.–1…“)', () => {
  const css = noComments(read('css/flights.css'));
  assert.match(css, /\.rc-meta\{display:flex;[^}]*white-space:nowrap;overflow:hidden\}/);
  assert.match(css, /\.rc-meta \.rc-cn\{min-width:0;overflow:hidden;text-overflow:ellipsis\}/, 'země se zkrátí');
  assert.match(css, /\.rc-meta \.rc-dt\{flex:none\}/, 'termín (u víkendů i s dny „So 28.11.–Ne 29.11.“) nikdy');
  // oddělovač „ · “ patří k termínu (ve flexu by obyčejné mezery kolem tečky zmizely)
  assert.match(read('js/flights.js'), /\$\{cn \? `<span class="rc-cn">\$\{esc\(cn\)\}<\/span>` : ''\}<span class="rc-dt">\$\{cn \? '\\u00a0·\\u00a0' : ''\}\$\{day\(x\.d1\)\}/);
});

test('telefon: štítek radaru „✓ levnější i s cestou na letiště“ se na 360 px zalomí uvnitř – nevjede pod ⋯', () => {
  const css = noComments(read('css/flights.css'));
  const wrap = /\.radar-card \.rc-badges \.b\{max-width:100%;white-space:normal;border-radius:14px\}/;
  assert.match(mediaBody(css, '@media(max-width:560px)'), wrap);
  // ve flights.css jen pro telefon – počítač má vlastní pravidlo v desktop-flights.css (štítky tam jsou v toku karty)
  assert.equal(css.match(new RegExp(wrap.source, 'g')).length, 1);
});

test('Kamkoliv – řádek cíle: štítky (🔥, počasí) se zalomí pod název, název celý (ne „Pl…“ z „Plovdiv 🔥 🌦️ 8°“)', () => {
  const css = noComments(read('css/flights.css'));
  const rule = (sel) => ([...css.matchAll(new RegExp(`^${sel.replace(/\./g, '\\.')}\\{([^}]*)\\}`, 'gm'))].at(-1) || [])[1] || '';
  assert.match(rule('.cmp-name'), /display:flex;flex-wrap:wrap/);
  assert.match(rule('.cmp-city'), /white-space:normal/);
  assert.match(rule('.cmp-city'), /-webkit-line-clamp:2/, 'dlouhý název („Frankfurt nad Mohanem“) nejvýš na 2 řádky');
  assert.doesNotMatch(rule('.cmp-city'), /text-overflow:ellipsis/);
  // jedno slovo širší než sloupec (vedle „✓ živě od …“ ~65 px) se zalomí – line-clamp do strany „…“ nedá („Klagenfu“)
  assert.match(rule('.cmp-city'), /overflow-wrap:anywhere/);
  assert.match(rule('.cmp-bdg'), /flex:none/, 'štítky se nezmačkají – celé přejdou na další řádek');
});

test('telefon: cíle hledání do víc míst („k moři“) v pruhu do strany – první nabídka ne až pod spodní lištou', () => {
  const css = noComments(read('css/flights.css'));
  // 9 cílů „Marsa Alam od 4 157 Kč“ zalomených pod sebe zabralo na 412 px ~280 px, na 360 px ~320 px
  const phone = mediaBody(css, '@media(max-width:560px)');
  assert.match(phone, /\.dest-mini\{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-right:-16px;padding-right:16px\}/);
  assert.match(phone, /\.dest-mini::-webkit-scrollbar\{display:none\}/);
  assert.match(phone, /\.dest-mini \.chip\{flex:none\}/, 'štítky se nezmačkají ani nezalomí');
  // pruh dojede k okraji displeje: stejný okraj jako .content na telefonu (16 px)
  assert.match(mediaBody(read('css/atlas.css'), '@media(max-width:860px)'), /\.content\{padding:6px max\(16px,env\(safe-area-inset-right\)\)/);
  // jinde (počítač, tablet) dál zalomené pod sebou
  assert.match(css, /^\.dest-mini\{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px\}/m);
  assert.match(read('js/flights.js'), /<div class="dest-mini">\$\{groups\.map\(g => `<span class="chip">/);
});
