// Nováček na telefonu (procházka Objevuj, průvodce Cestou, Plánovač a Doporučení): kde se zasekl a jak to teď vypadá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

test('✕ u místa v programu: program se přeskládá – hláška s ↩ Vrátit (Objevuj i krok Program v Cestě)', () => {
  const js = read('js/places.js');
  const fn = js.slice(js.indexOf('function dropUndo('), js.indexOf('function plannerControls('));
  assert.match(fn, /st\.exclude\.add\(id\); st\.must\.delete\(id\);\s*replan\(\);/);
  assert.match(fn, /toast\(`Vyřazeno\$\{name \? `: \$\{name\}` : ''\} – program jsem přeskládal`, '', 6000, \{ label: '↩ Vrátit', run: \(\) => \{ st\.exclude\.delete\(id\); if \(was\) st\.must\.add\(id\); replan\(\); \} \}\);/);
  // oba ✕ (Cesta → Program a Objevuj) jdou přes dropUndo
  assert.match(js, /\$\$\('\[data-drop\]', host\)\.forEach\(b => b\.onclick = \(\) => dropUndo\(st, b\.dataset\.drop, plan, run\)\);/);
  assert.match(js, /\$\$\('\[data-drop\]', body\)\.forEach\(b => b\.onclick = \(\) => dropUndo\(st, b\.dataset\.drop, ex\.plan, \(\) => replan\(\)\)\);/);
  assert.doesNotMatch(js, /data-drop[^\n]*st\.exclude\.add\(b\.dataset\.drop\)/, 'žádné ✕ bez Vrátit');
  // vrácení = stejný program: plánovač na serveru je bez náhody
  for (const f of ['../server/lib/itinerary.js', '../server/lib/places.js']) assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /Math\.random/, f);
});

test('zájmy v programu: popisek „Víc toho, co tě baví“, zapnutý čip barevně a s aria-pressed', () => {
  const js = read('js/places.js');
  assert.match(js, /<span class="faint" style="font-size:12\.5px;align-self:center">Víc toho, co tě baví:<\/span>\$\{INTERESTS\.map\(\(\[id, label\]\) => `<button type="button" class="fchip \$\{st\.interests\.has\(id\) \? 'on' : ''\}" data-int="\$\{id\}" aria-pressed="\$\{st\.interests\.has\(id\)\}">/);
  assert.equal((js.match(/b\.setAttribute\('aria-pressed', st\.interests\.has\(b\.dataset\.int\)\)/g) || []).length, 2, 'Objevuj i Cesta');
  assert.match(js, /data-tint="\$\{id\}" aria-pressed="\$\{ex\.tripInterests\.has\(id\)\}"/);
  assert.match(read('css/flights.css'), /\.fchip\.tf-toggle\.on,\.fchip\[data-int\]\.on,\.fchip\[data-tint\]\.on\{color:var\(--text\);border-color:rgba\(91,140,255,\.42\);background:rgba\(91,140,255,\.13\)\}/);
});

test('Objevuj: program začíná v centru hledaného místa – „od centra“, ne „od ubytování“, které nováček nemá (📍 Tady beze změny)', () => {
  const js = read('js/places.js');
  assert.match(js, /cityPlan \? ruralTip \+ planHtml\(ex\.plan, p\.geo \? p : \{ \.\.\.p, startAt: 'center' \}\)/);
  assert.match(js, /j === 0 \? \(fromC \? 'hned v centru' : 'hned u ubytování'\)/);
});

test('Ubytování u jednoho cíle: „Vyberu později – jen odkazy →“ – zůstane ve shrnutí bez ceny a v Co zarezervovat s odkazem', () => {
  const js = read('js/trip.js');
  const step = js.slice(js.indexOf('async function stayStep()'), js.indexOf('function stayLoadFail('));
  assert.match(step, /<button class="btn ghost" id="stayLinks">Vyberu později – jen odkazy →<\/button><button class="btn ghost" id="staySkip">Ubytování neřeším →<\/button>/);
  assert.match(step, /\$\('#stayLinks'\)\.onclick = \(\) => \{ pickSeq\+\+; t\.stay = \{ mode: 'links', name: '', totalCzk: 0 \}; persist\(\); setStep\('car'\); \};/);
  assert.match(step, /t\.stay\.mode === 'links' \? 'vyberu později \(jen odkazy\)'/);
  // shrnutí: řádek bez ceny (ne „0 Kč“), v seznamu k rezervaci termín a „vyber přes odkaz“
  assert.match(js, /: \['🏨', `Ubytování · \$\{nightsTxt\(nights\)\} – zatím bez ceny, vyber přes odkaz níž`, null\]\) : null\]\),/);
  assert.match(js, /label: `Ubytování\$\{t\.stay\.mode === 'links' \? ` \(\$\{fmtDate\(checkin\)\}–\$\{fmtDate\(checkout\)\}\) – vyber přes odkaz` : t\.stay\.name \? ': ' \+ t\.stay\.name : ''\}/);
});

test('⚡ Poskládej cestu: říká, že hotel vybírá blízko centra (vybírá do 3 km, ne nejlepší poměr kdekoliv)', () => {
  const js = read('js/trip.js');
  assert.match(js, /<small>Ubytování s nejlepším poměrem ceny a hodnocení blízko centra \(do 3 km\), bez auta a program na místě/);
  assert.match(js, /'Skládám celou cestu – vybírám ubytování s nejlepším poměrem ceny a hodnocení blízko centra…'/);
  assert.match(js, /if \(own\.length\) return \[3, 8\]\.map\(k => own\.filter\(x => !\(x\.distanceKm > k\)\)\)/, 'autoCands opravdu do 3 km');
});

test('Shrnutí: rozpis po položkách sbalený – pod „Cenou cesty“ se stejným součtem vypadal jako druhá tabulka', () => {
  const js = read('js/trip.js');
  assert.match(js, /<div class="bud"><details class="bud-more"><summary>Na osobu po položkách<\/summary><table class="cost bud-t">/);
  assert.match(js, /<td>\$\{czk\(c\.total\)\}<\/td><\/tr><\/table><\/details>/);
});

test('Plánovač vs. Cesta: Plánovač = uložené cesty; cesta z průvodce otevře hlavním tlačítkem průvodce', () => {
  const app = read('js/app.js');
  assert.match(app, /\['planner', 'Plánovač', 'Uložené cesty – program, balení, rozpočet',/);
  assert.match(app, /acts: `<div class="row wrap">\$\{t\.wizard && \(window\.Trip \|\| window\.Lazy\) \? '<button class="btn primary" id="tripWizard">🧳 Otevřít v průvodci<\/button>' : ''\}\$\{local \? '' : `<button class="btn\$\{t\.wizard \? '' : ' primary'\}" id="tripSearch">/);
});

test('Doporučení a Země: tečky = ceny na místě (popisek, viditelná stupnice na tmavém skle), ☀️ u nejlepších měsíců', () => {
  const app = read('js/app.js');
  assert.match(app, /function costDots\(n\) \{ return `<span class="dots warm" role="img" title="Ceny na místě: \$\{n\} z 5 \(1 = levné, 5 = drahé\)" aria-label="Ceny na místě: \$\{n\} z 5">/);
  assert.match(app, /\$\{months \? `<span title="Nejlepší měsíce na cestu">☀️ \$\{months\}<\/span>` : ''\}/);
  assert.match(app, /<div class="meta">\$\{costDots\(c\.cost\)\}<span title="Nejlepší měsíce na cestu">☀️ \$\{monthRanges\(c\.months\)\}<\/span><\/div>/, 'karta Doporučení');
  assert.match(read('index.html'), /<span class="faint" style="font-size:12px">číslo = jak se hodí teď · ● ceny · ☀️ sezóna<\/span>/);
  assert.match(read('css/atlas.css'), /\.dest \.dest-panel \.dots i:not\(\.f\)\{background:rgba\(255,255,255,\.32\)\}/);
});

test('Cesta → Program bez vybraného hotelu (vyberu později, neřeším, vlastní cena): „od centra“, ne „od ubytování“', () => {
  const js = read('js/trip.js');
  assert.match(js, /\.\.\.\(out \|\| !atStay \? \{ startAt: 'center' \} : \{\}\)/, 'místo trasy');
  assert.match(js, /\.\.\.progSpan\(t\), \.\.\.\(nearStay\(t\.stay\) \|\| far \|\| !own \? \{ startAt: 'center' \} : \{\}\)/, 'jeden cíl');
  assert.match(js, /const own = t\.stay && t\.stay\.lat != null && !nearStay\(t\.stay\) \? t\.stay : null;/);
});
