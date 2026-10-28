// Nováček na telefonu (procházka Objevuj, průvodce Cestou, Plánovač a Doporučení): kde se zasekl a jak to teď vypadá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

test('✕ u místa v programu: ostatní místa zůstanou ve svých dnech – hláška s ↩ Vrátit (Objevuj i krok Program v Cestě)', () => {
  const js = read('js/places.js');
  const fn = js.slice(js.indexOf('function dropUndo('), js.indexOf('function plannerControls('));
  // dny ostatních míst (keep) jen s tímto přeplánováním; ↩ Vrátit plánuje bez nich (= původní program)
  assert.match(fn, /st\.exclude\.add\(id\); st\.must\.delete\(id\);\s*st\.keep = keptDays\(plan, id\);\s*replan\(\);/);
  assert.match(fn, /toast\(`Vyřazeno\$\{name \? `: \$\{name\}` : ''\} – program jsem upravil`, '', 6000, \{ label: '↩ Vrátit', run: \(\) => \{ st\.exclude\.delete\(id\); if \(was\) st\.must\.add\(id\); replan\(\); \} \}\);/);
  assert.match(js, /async function makePlan\(st, center, dates, extra\) \{\s*const keep = st\.keep;\s*st\.keep = null;/);
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

test('Plánovač je Moje cesty v Cestě (bez zvláštní sekce); cesta z průvodce otevře hlavním tlačítkem průvodce', () => {
  const app = read('js/app.js');
  assert.ok(!/\['planner', /.test(app), 'v menu ani postranním panelu už Plánovač není');
  assert.match(app, /\['trip', 'Cesty', 'Moje cesty a průvodce: let, ubytování, auto, program',/);
  // staré odkazy (#planner, zástupce na ploše, „Moje cesty →“) vedou na seznam cest
  assert.match(app, /if \(v === 'planner'\) \{ v = 'trip'; opts = \{ \.\.\.opts, mine: true \}; \}/);
  assert.match(app, /const isView = v => v === 'planner' \|\| NAV\.some\(n => n\[0\] === v\);/);
  assert.ok(!read('index.html').includes('view-planner'));
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

test('drobnosti: filtr hodnocení hotelů s ⭐ a popiskem, hotový program „↻ …“ vedlejší, sekce Svět s nadpisem Svět', () => {
  assert.match(read('js/trip.js'), /<div class="seg" id="stayMin" role="group" aria-label="Nejnižší hodnocení hostů">\$\{\[\[0, '⭐ vše'\],/);
  const pl = read('js/places.js');
  assert.match(pl, /const planBtn = `<button class="btn\$\{hasPlan \? '' : ' primary'\}" id="exPlan"/);
  assert.match(pl, /: hasPlan \? `↻ \$\{planLbl\}` : planLbl\}<\/button>`;/);
  const app = read('js/app.js');
  assert.match(app, /const \[ttl, sub\] = WORLD_VIEWS\.includes\(v\) \? NAV_INFO\.world : NAV\.find\(x => x\[0\] === v\)\.slice\(1\); \$\('#pageTitle'\)\.textContent = ttl; \$\('#pageSub'\)\.textContent = sub;/);
  assert.match(app, /const NAV_INFO = \{ world: \['Svět', /);
});

test('vracející se uživatel: ⭐ Moje cíle s jednou větou o ceně (dřív 5 řádků při každém otevření Přehledu), podrobnosti v title', () => {
  const js = read('js/flights.js');
  assert.match(js, /<div class="faint fav-note" title="Jen letenka – bez cesty na letiště, do města a zavazadel; s odletem od tohoto měsíce\. Telefon a počítač mají každý svou paměť cen\.">Cena = nejlevnější zpáteční letenka na osobu, jakou ATLAS viděl v tomhle zařízení\.<\/div>/);
});

test('Lety u vracejícího se (už hledal): na telefonu bez úvodní fotky – tlačítko hledání nad spodní lištou', () => {
  const fl = read('js/flights.js');
  assert.match(fl, /const v = \$\('#view-flights'\); if \(v\) v\.classList\.toggle\('fl-back', \(S\.recent \|\| \[\]\)\.length > 0\);/);
  const css = read('css/flights.css');
  const m = css.match(/@media\(max-width:560px\)\{\n  \.fl-hero\{height:178px;[\s\S]*?#view-flights\.fl-back \.fl-hero\{display:none\}/);
  assert.ok(m, 'jen na telefonu (do 560 px)');
});

test('Lety na telefonu: cena nabídky nad lety a časy (dřív pod nimi, mimo první obrazovku výsledků); počítač beze změny', () => {
  const css = read('css/flights.css');
  const m = css.match(/@media\(max-width:560px\)\{\n  \.trip-row\{grid-template-columns:1fr\}[\s\S]*?\n\}/);
  assert.ok(m, 'blok telefonu');
  assert.match(m[0], /\.trip-row>\.pbox\{order:-1\}/);
  assert.ok(!/(^|\n)\.trip-row>\.pbox\{order/.test(css.replace(m[0], '')), 'jen na telefonu');
});

test('Přehled: ⭐ Moje cíle jen jednou (vlastní sekce s „Hledat moje cíle“) – v Rychlém hledání ne, v Letech (Nápady) ano', () => {
  const fl = read('js/flights.js');
  assert.match(fl, /\[\['#quickFlights', qfHtml\], \['#flIdeas', favCard \+ qfHtml\]\]\.forEach/);
  assert.match(fl, /🔎 Hledat moje cíle/);
});
