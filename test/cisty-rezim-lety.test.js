// Lety v „čistém režimu“ (ceny jen z mezipaměti Aviasales; Ryanair, Wizz Air a Kiwi vypnuté na serveru): živé ověření
// jen když jde (liveOn podle /api/health), „orientační“ místo „z cache“ u ceny i ve větě nad výsledky a radarem,
// čas hledání nevydávaný za stáří ceny, patička a návod Zdroje cen podle zapnutých zdrojů, opatrný štítek a rada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const SearchHelp = ctx.window.SearchHelp;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Úsek zdroje mezi dvěma značkami (včetně první). */
function cut(from, to) {
  const a = fl.indexOf(from), b = fl.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `úsek „${from}“ ve flights.js`);
  return fl.slice(a, b);
}
// zdroje podle /api/health a štítky orientační ceny – čisté funkce z flights.js
const src = cut('  // Uživatel čte „orientační“', '  /* ---------- živé ověření cen z mezipaměti');
const F = new Function('health', 'esc', 'SearchHelp', `${src}; return { liveOn, liveFoot, srcOkHtml, cacheMark, cacheNote, radarOrient, cacheTag, CACHE_NOTE };`);
const mod = (health = null) => F(health, esc, SearchHelp);
const hp = on => ({ providers: ['ryanair', 'wizzair', 'kiwi', 'travelpayouts'].map(id => ({ id, enabled: on.includes(id) })) });
const CLEAN = hp(['travelpayouts']), ALL = hp(['ryanair', 'wizzair', 'kiwi', 'travelpayouts']);

const leg = (live, extra = {}) => ({ from: 'PRG', to: 'BCN', date: '2026-12-01', live, provider: live ? 'ryanair' : 'travelpayouts', ...extra });
const cached = { id: 'a', out: leg(false), back: leg(false), perPersonCzk: 1890, flightCzk: 1890, deal: { level: 'super' } };
const live = { id: 'b', out: leg(true), back: leg(true), perPersonCzk: 2100, flightCzk: 2100, deal: { level: 'super' } };

test('liveOn: živé ověření jen se zapnutým Kiwi; dokud /api/health není načtené, jako dřív (ano)', () => {
  assert.equal(mod(null).liveOn(), true, 'bez /api/health');
  assert.equal(mod({}).liveOn(), true, 'odpověď bez seznamu zdrojů');
  assert.equal(mod(ALL).liveOn(), true);
  assert.equal(mod(CLEAN).liveOn(), false, 'KIWI_ENABLED=0');
  assert.equal(mod(hp(['kiwi'])).liveOn(), true);
  assert.equal(mod({ providers: [{ id: 'kiwi', enabled: false, blocked: true }] }).liveOn(), false);
  // parametr přebije uložený health (volání s jiným výsledkem /api/health)
  assert.equal(mod(ALL).liveOn(CLEAN), false);
});

test('bez živého ověření: ⚡ u nabídky a v 📌 se nekreslí, samočinné ověřování nezačne, „ověřuji živě…“ se neukáže', () => {
  assert.match(fl, /\$\{SearchHelp\.isCached\(t\) && liveOn\(\) \? ` · <button type="button" class="linkbtn" data-live="\$\{idx\}">⚡ Ověřit cenu živě<\/button>`/, 'řádek Ověřit:');
  assert.match(fl, /async function autoVerify\(res\) \{\n[^\n]+\n[^\n]+!liveOn\(\)[^\n]*return;/, 'autoVerify skončí hned');
  assert.match(fl, /const pinTodo = \(\) => !liveOn\(\) \? \[\] : pinList\(\)/, '📌 ⚡ Ověřit ceny (n) jen s něčím k ověření');
  assert.match(fl, /\$\{pinBusy \|\| todo\.length \? `<button type="button" class="btn sm" id="pinVerify"/, 'tlačítko jen s todo');
  // stav ověření (i „ověřuji živě…“) se bez živého ověření nečte – jen „orientační“
  for (const fn of ['liveHtml', 'liveBadge']) assert.match(fl, new RegExp(`function ${fn}\\(t\\) \\{[\\s\\S]{0,200}?x = liveOn\\(\\) \\? liveGet\\(k\\) : null`), fn);
  assert.match(fl, /function pinLive\(p\) \{\n\s+const x = liveOn\(\) \? liveGet\(/);
});

test('„orientační“ místo „z cache“: štítek, malé označení pod cenou a věta nad výsledky', () => {
  const m = mod(CLEAN);
  assert.match(m.cacheTag(leg(false)), />orientační – ověř<\/span>$/);
  assert.match(m.cacheTag(leg(false)), /title="Cena je orientační: našli ji jiní cestující na Aviasales v posledních 48 hodinách\./);
  assert.equal(m.cacheTag(leg(true)), '', 'živá cena bez štítku');
  assert.match(m.cacheMark(true), /^<div class="cache-mark" title="[^"]+">orientační<\/div>$/);
  assert.equal(m.cacheMark(false), '');
  assert.equal(m.cacheNote(false), '', 'bez ceny z mezipaměti žádná věta');
  assert.equal(m.cacheNote(true), '<div class="faint cache-note">Orientační nejnižší ceny za 1 dospělého. Našli je jiní cestující v posledních 48 hodinách – cena se mohla změnit.</div>');
  // na telefonu (412 px, ~11,5px písmo ≈ 60 znaků na řádek) nejvýš tři řádky
  assert.ok(m.CACHE_NOTE.length <= 3 * 55, `věta má ${m.CACHE_NOTE.length} znaků`);
  // karta radaru: nový příznak oc, starší uložená karta podle zdroje letu tam
  assert.equal(m.radarOrient({ oc: 1, prov: 'kiwi' }), true);
  assert.equal(m.radarOrient({ prov: 'travelpayouts' }), true);
  assert.equal(m.radarOrient({ prov: 'ryanair' }), false);
  assert.equal(m.radarOrient(null), false);
  // stará slova zmizela ze všeho, co uživatel čte
  for (const old of ['⏱ z cache', 'z cache – živě nenalezeno', '⚠ z cache – živě', 'Cena je z cache', 'ceny „z cache“', "'cache' :"]) assert.ok(!fl.includes(old), old);
  assert.ok(fl.includes('<div class="note warn pc-advice">⏱<div>Cena je orientační: našli ji jiní cestující v posledních 48 hodinách. Před nákupem ji ověř.</div></div>'));
});

test('označení pod částkou: karta nabídky, řádek výpisu i karta radaru; věta nad výsledky, kalendářem i radarem', () => {
  assert.match(fl, /<div class="pbox"><div class="pp">\$\{czk\(t\.perPersonCzk\)\}<\/div>\$\{cacheMark\(SearchHelp\.isCached\(t\)\)\}/, 'blok ceny karty nabídky (priceBox)');
  assert.match(fl, /<small>\/os\.<\/small>\$\{tkt\}\$\{liveHtml\(t\)\}<\/div>/, 'řádek Přehledu: „orientační“ pod cenou (liveHtml)');
  assert.match(fl, /let cls = 'faint', txt = 'orientační', title = CACHE_TIP;/);
  assert.match(fl, /<div class="rc-price">\$\{czk\(x\.czk\)\}<small>\/os\.<\/small>\$\{cacheMark\(radarOrient\(x\)\)\}<\/div>/, 'karta radaru');
  assert.match(fl, /prov: t\.out\.provider, \.\.\.\(SearchHelp\.isCached\(t\) \? \{ oc: 1 \} : \{\}\)/, 'radar si příznak uloží');
  assert.match(fl, /\$\{cacheNote\(shown\.some\(\(\{ x \}\) => radarOrient\(x\)\)\)\}\$\{stale\}<div class="radar-grid/, 'věta nad radarem');
  // nad výpisem i kalendářem (u konkrétního cíle i ceny dnů kalendáře)
  const m = fl.match(/host\.innerHTML = summary \+ cacheNote\((\(isRoute \? [^\n]+?\))\.some\(t => SearchHelp\.isCached\(t\)\)\) \+ body/);
  assert.ok(m, 'věta mezi hlavičkou a výpisem');
  const pick = new Function('isRoute', 'view', 'flat', 'base', 'all', `return ${m[1]};`);
  assert.deepEqual(pick(true, { mode: 'list' }, [live], [cached], []).some(SearchHelp.isCached), false, 'výpis bez ceny z mezipaměti');
  assert.deepEqual(pick(true, { mode: 'cal' }, [live], [cached], []).some(SearchHelp.isCached), true, 'kalendář ukazuje i ostatní dny');
  assert.deepEqual(pick(false, { mode: 'list' }, null, [], [live, cached]).some(SearchHelp.isCached), true, 'kamkoliv');
});

test('čas hledání není stáří ceny: „hledáno 15:15“, radar „Načteno 14:02“ a „Ukazuji výsledek z …, hledám znovu…“', () => {
  assert.match(fl, /at = age \? `<span class="ps-at">hledáno \$\{esc\(age\.when\)\}<\/span>` : ''/);
  assert.ok(!fl.includes('<span class="ps-at">ceny '));
  assert.match(fl, /margin-top:8px">Načteno \$\{when\}<span data-rago=/);
  assert.ok(!fl.includes('Aktualizováno ${when}'));
  assert.ok(fl.includes('Ukazuji výsledek z ${when}, hledám znovu…') && !fl.includes('Ukazuji ceny z'));
  assert.ok(fl.includes('Zatím ukazuji výsledek z ${when}.'));
  // poznámka 🕘 o starých výsledcích zůstává
  assert.equal(SearchHelp.ageNote(SearchHelp.resultAge(Date.now() - 3 * 36e5, Date.now()), false).endsWith('– ceny se mezitím mohly změnit.'), true);
});

test('patička a návod Zdroje cen podle toho, co /api/health hlásí jako zapnuté', () => {
  assert.equal(mod(CLEAN).liveFoot(), 'Ceny jsou orientační – před nákupem je ověř u prodejce.');
  assert.equal(mod(ALL).liveFoot(), 'Živé ceny (Ryanair, Wizz Air) se mohou do rezervace změnit; orientační ceny ověř.');
  assert.equal(mod(hp(['wizzair'])).liveFoot(), 'Živé ceny (Wizz Air) se mohou do rezervace změnit.');
  assert.equal(mod(null).liveFoot(), 'Živé ceny (Ryanair, Wizz Air) se mohou do rezervace změnit; orientační ceny ověř.', 'bez /api/health jako dřív');
  assert.equal(fl.match(/\$\{liveFoot\(\)\} Kurz:/g).length, 2, 'patička výpisu i cesty přes víc měst');
  assert.equal(mod(CLEAN).srcOkHtml(), 'Ceny letů jsou z hledání na Aviasales (Travelpayouts) za posledních 48 hodin. U každé nabídky je odkaz na ověření.');
  assert.equal(mod(ALL).srcOkHtml(), '<b>Všechny aerolinky jsou zapnuté</b> – Ryanair a Wizz Air živě, ostatní přes Travelpayouts / Aviasales, živé ceny k vybranému letu přes Kiwi.com. Tady není co nastavovat.', 'vše zapnuté: text jako dřív');
  assert.equal(mod(hp(['ryanair', 'travelpayouts'])).srcOkHtml(), '<b>Všechny aerolinky jsou zapnuté</b> – Ryanair živě, ostatní přes Travelpayouts / Aviasales. Tady není co nastavovat.');
  assert.match(fl, /\$\{tpOn \? `<div class="note good" style="margin-bottom:12px">✓ <div>\$\{srcOkHtml\(\)\}<\/div><\/div>` : `/);
});

test('orientační cena: místo „🔥 Super cena“ „nejlevnější v tomto hledání“, rada začíná výhradou', () => {
  const st = fl.match(/ {2}const superTxt = [^\n]+\n {2}const tagOf = [^\n]+\n/);
  assert.ok(st, 'superTxt a tagOf');
  const tagOf = new Function('SearchHelp', 'PL_BADGE', `${st[0]}; return tagOf;`)(SearchHelp, { low: ['good', '💚 Dobrá cena'], normal: ['', 'Běžná cena'] });
  assert.deepEqual(tagOf(cached, { level: 'low' }), ['hot', 'nejlevnější v tomto hledání']);
  assert.deepEqual(tagOf(live, { level: 'low' }), ['hot', '🔥 Super cena'], 'živá cena beze změny');
  assert.deepEqual(tagOf({ ...cached, deal: { level: 'good' } }, { level: 'low' }), ['good', '💚 Dobrá cena']);
  assert.match(fl, /if \(!pl\) return t\.deal && t\.deal\.level === 'super' \? `<span class="b hot">\$\{superTxt\(t\)\}<\/span>` : '';/);
  const ad = fl.match(/ {2}const advFor = [^\n]+\n/);
  assert.ok(ad, 'advFor');
  const advFor = new Function(`${ad[0]}; return advFor;`)();
  const buy = { kind: 'buy', text: 'Cena vypadá dobře. Pokud ti termín sedí, není moc důvod čekat – levněji to být může, ale nemusí.' };
  assert.deepEqual(advFor(buy, true), { kind: 'buy', text: 'Pokud cena po ověření platí: cena vypadá dobře. Pokud ti termín sedí, není moc důvod čekat – levněji to být může, ale nemusí.' });
  assert.equal(advFor(buy, false), buy, 'živá cena beze změny');
  assert.equal(advFor(null, true), null);
  assert.match(fl, /const cache = !t\.out\.live \|\| \(t\.back && !t\.back\.live\);\n\s+const adv = advFor\(x\.advice, cache\);/);
});
