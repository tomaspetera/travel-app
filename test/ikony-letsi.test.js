// Ikony rozhraní Letsi místo emoji v ovládacích prvcích (manuál Letsi 2.1: „ikony rozhraní místo emoji“).
// Ikona = <span class="ico i-<název>" aria-hidden="true"> (ikona() v app.js, stejná kopie v trip/flights/places.js),
// maska a velikost v public/css/atlas.css (.ico, .i-<název>), soubory z balíku beze změny v public/vendor/letsi/ikony/.
// Bajtová shoda s balíkem jen s proměnnou LETSI_BALIK (cesta ke složce Letsi-brand) – v CI balík není.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const SRC = ['index.html', 'js/app.js', 'js/trip.js', 'js/flights.js', 'js/places.js', 'js/transfer.js', 'js/about.js'];
const ALL = SRC.map((f) => [f, read(f)]);
const ATLAS = read('css/atlas.css');
// ikony, které balík nemá – nakreslené podle stylu sady (vendor/letsi/README.md), s balíkem se nesrovnávají
const MIMO_BALIK = ['slunce', 'asie', 'afrika', 'amerika'];
const HELPER = /const ikona = n => `<span class="ico i-\$\{n\}" aria-hidden="true"><\/span>`;/;

/** Názvy ikon použité ve zdroji: ikona('…') v JS a class="ico i-…" v hotovém HTML. */
function used(src) {
  return [...src.matchAll(/ikona\('([a-z-]+)'\)|class="ico i-([a-z-]+)"/g)].map((m) => m[1] || m[2]);
}

test('used(): najde ikonu v JS (ikona) i v hotovém HTML, nic jiného', () => {
  assert.deepEqual(used(`a \${ikona('let')} b <span class="ico i-poloha" aria-hidden="true"></span> ikona(x) class="ico"`), ['let', 'poloha']);
});

test('ikona(): jedna pomocná funkce, v modulech stejná kopie (běží i v node:vm bez app.js), výstup aria-hidden', () => {
  for (const f of ['js/app.js', 'js/trip.js', 'js/flights.js', 'js/places.js']) assert.match(read(f), HELPER, f);
  const ikona = new Function(`${read('js/app.js').match(HELPER)[0]} return ikona;`)();
  assert.equal(ikona('kalendar'), '<span class="ico i-kalendar" aria-hidden="true"></span>');
});

test('každá použitá ikona má pravidlo v atlas.css a soubor z balíku (currentColor, jedna adresa na ikonu)', () => {
  // dlaždice Rychlého hledání berou ikonu z pole QF (ikona(q[0]) v renderQuick, flights.js) – used() je nevidí
  const qf = read('js/flights.js').match(/const QF = \[[\s\S]*?\n {4}\];/)[0];
  const names = new Set([...ALL.flatMap(([, s]) => used(s)), ...[...qf.matchAll(/^ {6}\['([a-z-]+)'/gm)].map((m) => m[1])]);
  assert.ok(names.size >= 25, `${names.size} ikon`);
  const rules = new Map([...ATLAS.matchAll(/^\.i-([a-z-]+)\{--ico:url\(\.\.\/vendor\/letsi\/ikony\/([a-z-]+)\.svg\)\}$/gm)].map((m) => [m[1], m[2]]));
  const balik = process.env.LETSI_BALIK;
  for (const n of names) {
    assert.equal(rules.get(n), n, `pravidlo .i-${n} v atlas.css míří na ikony/${n}.svg`);
    const f = `vendor/letsi/ikony/${n}.svg`;
    assert.ok(existsSync(new URL(`../public/${f}`, import.meta.url)), f);
    assert.match(read(f), /stroke="currentColor"/, f);
    if (balik && !MIMO_BALIK.includes(n)) assert.equal(read(f), readFileSync(`${balik}/ikony-ui/svg/${n}.svg`, 'utf8'), `${f} beze změny z balíku`);
  }
  // v atlas.css žádné pravidlo navíc (soubor bez použití by se zbytečně dostal do sady pro instalaci)
  assert.deepEqual([...rules.keys()].filter((n) => !names.has(n)), []);
  // maska bere jen tvar, barvu dodá currentColor; Program je čitelný nejméně ve 20 px (ikony.json nejmensi_px)
  assert.match(ATLAS, /^\.ico\{[^}]*background:currentColor;-webkit-mask:var\(--ico\)[^}]*mask:var\(--ico\)/m);
  assert.match(ATLAS, /^\.ico\.i-program\{width:max\(1\.15em,20px\);height:max\(1\.15em,20px\)/m);
});

test('ikona je vždy aria-hidden; tlačítko jen s ikonou má aria-label', () => {
  for (const [f, s] of ALL) {
    for (const m of s.matchAll(/<span class="ico i-[a-z-]+"[^>]*>/g)) assert.match(m[0], /^<span class="ico i-[a-z-]+" aria-hidden="true">$/, f);
    for (const m of s.matchAll(/<button([^>]*)>\s*(?:<span class="ico i-[a-z-]+" aria-hidden="true"><\/span>|\$\{ikona\('[a-z-]+'\)\})\s*<\/button>/g)) {
      assert.match(m[1], /aria-label="[^"]+"/, `${f}: ${m[0]}`);
    }
  }
  // poloha v poli Odkud: dřív 📍 schované v letsi.css, teď ikona pro oba vzhledy a jméno z aria-label
  assert.match(read('index.html'), /id="geoBtn" title="Použít moji polohu" aria-label="Použít moji polohu"><span class="ico i-poloha" aria-hidden="true"><\/span><\/button>/);
  assert.doesNotMatch(read('css/letsi.css'), /#geoBtn/);
});

test('ovládací prvky bez emoji: Přehled, Lety, Další a Shrnutí cesty mají ikonu se stejným textem', () => {
  const html = read('index.html'), app = read('js/app.js'), trip = read('js/trip.js');
  const ico = (n) => `<span class="ico i-${n}" aria-hidden="true"></span>`;
  for (const [n, t] of [['program', 'Naplánovat celou dovolenou'], ['let', 'Letenku už mám'], ['hlidam', 'Hlídané ceny'], ['filtr', 'Upřesnit']]) {
    assert.ok(html.includes(`${ico(n)} ${t}`), t);
  }
  for (const [n, id] of [['stahnout', 'moreBk'], ['novinky', 'moreWn'], ['motiv', 'moreTheme']]) assert.ok(app.includes(`id="${id}">\${ikona('${n}')} `), id);
  for (const [n, id] of [['sdilet', 'sumShare'], ['kalendar', 'sumCal']]) assert.ok(trip.includes(`id="${id}">\${ikona('${n}')} `), id);
  // hlídání ceny je srdce, nikdy zvonek (README sady: Nikdy – zvonek); Upozorňovat = Cena klesla
  assert.doesNotMatch(html, /🔔/);
  assert.match(read('js/flights.js'), /' \+ ikona\('cena-klesla'\) \+ ' Upozorňovat/);
  // přepínač motivu v panelu kreslí SVG vedle textu – emoji by bylo podruhé
  assert.match(html, /<span>Tmavý režim<\/span>/);
});

test('ikony jen ve významu z ikony.json: Moje cesty jen ve spodní navigaci, Lupa jen v poli hledání, kalendář cen není Kalendář', () => {
  // ikony.json „kdy použít“: moje-cesty = „jen spodní navigace“, lupa = „uvnitř vyhledávacích polí; záložka Hledat je
  // kukátko“ (v sadě není), „kalendář cen je clona“ – tam, kde ikona v sadě chybí, zůstává emoji
  const names = new Set(ALL.flatMap(([, s]) => used(s)));
  for (const n of ['moje-cesty', 'lupa']) assert.ok(!names.has(n), n);
  assert.match(read('index.html'), /id="doSearch" type="submit">Najít lety<\/button>/);
  assert.doesNotMatch(read('js/flights.js'), /ikona\('kalendar'\)\} Kalendář cen/);
});
