// Emoji nikdy v nadpisu ani v tlačítku – ikony Letsi (public/vendor/letsi/ikony, ikona() → <span class="ico i-…">);
// vlajky zemí smí (CLAUDE.md, nález U5). Hlídá zdroj nadpisů a tlačítek a popisky, ze kterých se tlačítka skládají
// (krokovník průvodce, filtry a přepínače Objevuj, aktivity v seznamu věcí, v Letech čipy hledání, přepínač výsledků,
// nadpisy karet a štítky nabídky – nález U21).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

/** Barevná emoji v textu: znaky s obrázkovou podobou (nebo s přepínačem U+FE0F); vlajky (regionální písmena) a textové
 *  znaky jako ↩ ✓ ▾ ne – ty se kreslí písmem jako text. */
export function emoji(s) {
  return String(s).match(/(?![\u{1F1E6}-\u{1F1FF}])(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)/gu) || [];
}

/** Nadpisy a tlačítka ve zdroji (HTML i šablony v JS), které obsahují emoji: ['soubor:řádek: <tag>…']; tlačítko je i odkaz
 *  vzhledu tlačítka (class btn, app-chip – Podpořit Letsi, Spojení ↗, Navigovat ve Waze) */
export function emojiVNadpisech(src, f = '') {
  const out = [];
  for (const m of src.matchAll(/<(h[1-6]|button|summary)\b[^>]*>([\s\S]*?)<\/\1>|<a\b[^>]*class="[^"]*\b(?:btn|app-chip)\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
    if (emoji(m[2] ?? m[3]).length) out.push(`${f}:${src.slice(0, m.index).split('\n').length}: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  return out;
}

/** Pole popisků `const JMÉNO = [ … ];` ze zdroje (i přes víc řádků). */
const pole = (src, name) => {
  const i = src.indexOf(`const ${name} = [`);
  assert.ok(i >= 0, name);
  return src.slice(i, src.indexOf('];', i) + 2);
};

test('emoji(): pozná emoji, vlajku a textové znaky nechá', () => {
  assert.deepEqual(emoji('✈️ Let 🏨'), ['✈️', '🏨']);
  assert.deepEqual(emoji('🇮🇹 Řím ↩ Jiný let ✓ ▾ ↔ ✔'), []);
  assert.deepEqual(emoji('⭐ vše'), ['⭐']);
  assert.deepEqual(emoji('<span class="ico i-let" aria-hidden="true"></span> Najít lety'), []);
});

test('emojiVNadpisech(): najde emoji v nadpisu, tlačítku a summary, vlajku ani ikonu ne', () => {
  const src = '<h3>🧾 Cena</h3>\n<button>${flag(cc)} Řím</button><button type="button">${ikona(\'let\')} Let</button>\n<summary>📍 Místa</summary><h2>🇵🇹 Lisabon</h2>\n<a class="btn sm ghost" href="x">🚆 Spojení ↗</a><a href="y">💛 v textu</a>';
  assert.deepEqual(emojiVNadpisech(src, 'x').map((x) => x.split(': ')[0]), ['x:1', 'x:3', 'x:4']);
});

test('nadpisy a tlačítka bez emoji: průvodce, Shrnutí, Objevuj, Lety, okna a formulář', () => {
  const files = ['index.html', ...readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)];
  assert.ok(files.includes('js/trip.js') && files.includes('js/places.js') && files.includes('js/pretrip.js') && files.includes('js/flights.js'));
  assert.deepEqual(files.flatMap((f) => emojiVNadpisech(read(f), f)), []);
});

test('tlačítka skládaná z popisků: krokovník, filtry a přepínače Objevuj, aktivity seznamu věcí bez emoji', () => {
  const trip = read('js/trip.js'), places = read('js/places.js'), pretrip = read('js/pretrip.js');
  // krokovník: druhá položka je název ikony Letsi, vykreslí ji ikona(); hotový krok ✓
  const steps = pole(trip, 'STEPS');
  assert.deepEqual([...steps.matchAll(/\['(\w+)', '([a-z-]+)', '[^']+'\]/g)].map((m) => [m[1], m[2]]),
    [['flight', 'let'], ['route', 'mapa'], ['stay', 'ubytovani'], ['car', 'auto'], ['program', 'program'], ['summary', 'hotovo']]);
  assert.match(trip, /<span>\$\{done\(i\) \? '✓' : ikona\(s\[1\]\)\}<\/span>\$\{s\[2\]\}<\/button>/);
  // přehled cesty vpravo (počítač): řádky jsou tlačítka kroků, ikona přes ikona()
  assert.match(trip, /<span class="ta-ico">\$\{ikona\(ico\)\}<\/span>/);
  for (const n of ['INTERESTS', 'TRIP_INTERESTS', 'MODES', 'BIKE_KINDS', 'HIKE_KINDS', 'BIKE_TYPES', 'BIKE_SCENERY', 'BIKE_HILLS', 'TRANSPORTS']) {
    assert.deepEqual(emoji(pole(places, n)), [], n);
  }
  assert.deepEqual(emoji(pole(pretrip, 'ACTS')), [], 'ACTS');
  // popisky dosazené do tlačítka až proměnnou: druh programu v průvodci (túry / po místech), čipy aplikací (Waze, PID),
  // odeslání odkazu v Přenosu
  assert.deepEqual(emoji(places.split('\n').find((l) => l.includes('tp-kinds'))), [], 'tp-kinds');
  assert.deepEqual([...trip.matchAll(/appChip\([^,]+, ([^,]+),/g)].flatMap((m) => emoji(m[1])), [], 'appChip');
  assert.deepEqual(emoji(read('js/transfer.js').split('\n').find((l) => l.includes('send = native()'))), [], 'tfSend');
  // filtr kategorií míst jen názvem (emoji kategorie zůstává na mapě a v kartě místa)
  assert.match(places, /data-cat="\$\{c\}" class="\$\{ex\.cat === c \? 'on' : ''\}">\$\{\(CAT\[c\] \|\| CAT\.sight\)\[1\]\}<\/button>/);
  // přepínač režimů na telefonu: krátký název bez emoji nad ním
  assert.match(places, /<span class="m-short">\$\{MODE_SHORT\[id\]\}<\/span>/);
});

test('aktivní krok krokovníku: ikona 20 px jako ve spodní liště, Nocí na Pistácii a s obrysem barvou textu', () => {
  assert.match(read('css/trip.css'), /^\.stepbar \.st \.ico\{width:20px;height:20px\}$/m);
  assert.match(read('css/letsi.css'), /^:root\[data-brand="letsi"\] \.stepbar \.st\.on>span\{background:#D6DE82;color:#14161F;outline:2px solid var\(--text\);outline-offset:2px\}$/m);
});

/* ---------- Lety (flights.js): popisky dosazené do tlačítek a nadpisů proměnnou, štítky nabídky ---------- */
const FL = read('js/flights.js');
/** Řádek zdroje flights.js podle začátku (bez odsazení). */
const radek = (start) => {
  const l = FL.split('\n').find((x) => x.trimStart().startsWith(start));
  assert.ok(l, start);
  return l;
};
/** Tělo funkce `function jméno(` ve flights.js. */
const funkce = (name) => {
  const m = FL.match(new RegExp(`^ {2}function ${name}\\([^\\n]*\\) \\{\\n[\\s\\S]*?^ {2}\\}$`, 'm'));
  assert.ok(m, name);
  return m[0];
};

test('Lety: čipy Kam, přepínač výsledků, nadpis karet podle řazení a cenové štítky bez emoji', () => {
  // čipy Kamkoliv / Evropa / Exotika pod Kam a Moje poloha bez domova (ikona Letsi poloha)
  const a = FL.indexOf("$('#quickDest').innerHTML = [");
  assert.ok(a > 0);
  const qd = FL.slice(a, FL.indexOf('].map(q =>', a));
  assert.deepEqual([...qd.matchAll(/\['([^']+)', '(\w+)'\]/g)].map((m) => m[1]), ['Kamkoliv', 'Evropa', 'Exotika']);
  assert.match(FL, /\$\{c === 'geo' \? ikona\('poloha'\) \+ ' Moje poloha' : esc\(c\)\}/);
  // Seznam / Mapa / Kalendář, nadpis tří velkých karet nad přehledem cílů, cenové štítky, štítky u cíle, zavazadla
  for (const start of ['const modes = [', 'const lbl = { best:', 'const PL_BADGE =', 'const superTxt =', 'const GOOD_MARK =', 'const prefBadge =', 'const newBadge =', 'const PIN_BAGS =']) {
    assert.deepEqual(emoji(radek(start)), [], start);
  }
  // super a dobrá cena s ikonou Letsi super-cena (dřív 🔥 a 💚), Dráž než obvykle jen textem
  assert.match(radek('const PL_BADGE ='), /low: \['good', `\$\{ikona\('super-cena'\)\} Dobrá cena`\]/);
  assert.match(radek('const superTxt ='), /`\$\{ikona\('super-cena'\)\} Super cena`/);
  assert.match(radek('const GOOD_MARK ='), /\$\{ikona\('super-cena'\)\}<span class="sr-only"> dobrá cena<\/span>/);
  assert.match(radek(": [`${ikona('super-cena')} super cena`"), /Jedna z nejvýhodnějších cen/, 'karta Kam letět levně (radarHot)');
});

test('Lety: štítky karty nabídky a řádků bez emoji; Odložit a Sdílet s ikonami Letsi', () => {
  // karta nabídky: noci, kufr, 2 aerolinky, sezóna, teplota, vzdálenost – textem (vlajky a ✓ ↩ ✈ jsou text)
  assert.deepEqual(emoji(funkce('badges')), [], 'badges()');
  assert.match(funkce('badges'), />\$\{nightsTxt\(t\.nights\)\}\$\{lt \? ` · \$\{esc\(lt\.text\)\}` : ''\}<\/span>/, 'noci bez 🌙');
  assert.match(FL, /data-pin="\$\{idx\}">\$\{ikona\('odlozeno'\)\} \$\{pinOn\(t\) \? 'Odloženo ✓' : 'Odložit'\}<\/button>/);
  assert.match(FL, /title="Poslat odkaz na tuhle nabídku">\$\{ikona\('sdilet'\)\} Sdílet<\/button>/);
  assert.match(FL, /id="pinOpen">\$\{ikona\('odlozeno'\)\} Odložené \(\$\{pinNow\.n\}\)<\/button>/);
  // Odložené: doprava na letiště a do města ikonou vlak / auto / autobus
  assert.deepEqual(emoji(funkce('pinDoor')), [], 'pinDoor()');
  assert.match(funkce('pinDoor'), /\$\{ikona\(car \? 'auto' : 'vlak'\)\} na letiště/);
  // dny dovolené a kdy z domu / domů (SearchHelp, jen pro štítky Letů) textem
  const ctx = { window: {} };
  vm.runInNewContext(read('js/searchhelp.js'), ctx);
  const H = ctx.window.SearchHelp;
  assert.equal(H.leaveTxt({ n: 0, days: [], holidays: [] }).text, 'bez dovolené');
  assert.equal(H.leaveTxt({ n: 2, days: [], holidays: [] }).text, '2 dny dovolené');
});

test('arrLead(): emoji druhu dopravy ze SearchHelp na štítku nabídky → ikona Letsi vlak / autobus / auto, text bez zalomení', () => {
  const ikona = new Function(`${radek('const ikona = n =>')} return ikona;`)();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const arrLead = new Function('ikona', 'esc', `${radek('const nbsp = x =>')}\n${radek('const ARR_ICO =')}\n${radek('const arrLead = s =>')} return arrLead;`)(ikona, esc);
  assert.equal(arrLead('🚆 z letiště STN do Londýna 21 £ (~600 Kč) · 1 h 15'), '<span class="ico i-vlak" aria-hidden="true"></span> z letiště STN do Londýna 21\u00a0£ (~600\u00a0Kč) · 1\u00a0h\u00a015');
  assert.equal(arrLead('🚌 zpět na letiště BVA <x>'), '<span class="ico i-autobus" aria-hidden="true"></span> zpět na letiště BVA &lt;x&gt;');
  assert.equal(arrLead('🚕 z letiště do centra'), '<span class="ico i-auto" aria-hidden="true"></span> z letiště do centra');
  assert.equal(arrLead('z letiště do centra 7 €'), 'z letiště do centra 7\u00a0€', 'bez emoji jen nedělitelná mezera');
  assert.deepEqual(emoji(arrLead('🚇 z letiště do centra')), []);
  // štítek nabídky bere text přes arrLead (okno cíle si emoji ze SearchHelp dál bere jako ikonu řádku – dpArr)
  assert.match(FL, /const arrChipHtml = c => `[^`]*\$\{arrLead\(c\.text\)\}<\/span>`/);
});

test('přepínač výsledků: Mapa a Kalendář bez značky zůstanou na telefonu vidět (vs-ic se na úzkém telefonu skrývá)', () => {
  const m = FL.match(/id="viewSeg">\$\{modes\.map\((v => \{[^\n]*?\})\)\.join\(''\)\}<\/div>/);
  assert.ok(m, 'viewSeg');
  const btn = new Function('view', `return ${m[1]};`)({ mode: 'map' });
  // co uvidí telefon: tlačítko bez skrytého <span class="vs-ic">
  const phone = (v) => btn(v).replace(/<span class="vs-ic">[^<]*<\/span>/, '').replace(/<[^>]+>/g, '');
  assert.deepEqual([['map', 'Mapa'], ['cal', 'Kalendář'], ['list', '☰ Seznam']].map(phone), ['Mapa', 'Kalendář', 'Seznam']);
  assert.match(btn(['list', '☰ Seznam']), /<span class="vs-ic">☰ <\/span>Seznam<\/button>$/);
});
