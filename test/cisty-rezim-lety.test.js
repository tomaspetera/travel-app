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
const F = new Function('health', 'esc', 'SearchHelp', `${src}; return { liveOn, liveFoot, srcOkHtml, cacheMark, priceSrc, radarOrient, cacheTag, CACHE_NOTE };`);
const mod = (health = null) => F(health, esc, SearchHelp);
// ikona Letsi (stejná kopie jako ve flights.js) – štítek super ceny ji má místo 🔥
const ikona = n => `<span class="ico i-${n}" aria-hidden="true"></span>`;
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
  assert.match(fl, /\$\{SearchHelp\.isCached\(t\) && liveOn\(\) \? ` · <button type="button" class="linkbtn" data-live="\$\{idx\}">\$\{ikona\('znovu'\)\} Ověřit cenu živě<\/button>`/, 'řádek Ověřit:');
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
  // řádek původu ceny nad výsledky (priceSrc – podrobně test/ux-lety-nakup.test.js): 48 h až pod ⓘ
  assert.match(m.priceSrc({ orient: true, trip: 'return' }), /<summary>Orientační ceny z Aviasales · za 1 osobu, zpáteční [\s\S]*<div class="cn-more">Našli je jiní cestující na Aviasales v posledních 48 hodinách – cena se mohla změnit\. Před nákupem ji ověř\.<\/div><\/details>$/);
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
  assert.match(fl, /<div class="pbox">\$\{priceRows\(\{ per: t\.perPersonCzk, [^\n]*mark: cacheMark\(SearchHelp\.isCached\(t\)\) \}\)\}/, 'blok ceny karty nabídky (priceBox): označení za částkou');
  assert.match(fl, /<small>\/os\.<\/small>\$\{tkt\}\$\{liveHtml\(t\)\}<\/div>/, 'řádek Přehledu: „orientační“ pod cenou (liveHtml)');
  assert.match(fl, /let cls = 'faint', txt = 'orientační', title = CACHE_TIP;/);
  assert.match(fl, /<div class="rc-price">\$\{czk\(x\.czk\)\}<small>\/os\.<\/small>\$\{cacheMark\(radarOrient\(x\)\)\}<\/div>/, 'karta radaru');
  assert.match(fl, /prov: t\.out\.provider, \.\.\.\(SearchHelp\.isCached\(t\) \? \{ oc: 1 \} : \{\}\)/, 'radar si příznak uloží');
  assert.match(fl, /\$\{priceSrc\(\{ orient: shown\.some\(\(\{ x \}\) => radarOrient\(x\)\), trip: 'return', more: radarMore \}\)\}\$\{stale\}<div class="radar-grid/, 'řádek nad radarem');
  // nad výpisem i kalendářem (u konkrétního cíle i ceny dnů kalendáře)
  const m = fl.match(/host\.innerHTML = summary \+ \((\(isRoute \? [^\n]+?\))\.some\(t => SearchHelp\.isCached\(t\)\) \? priceSrc\(\{ orient: true, trip: res\.query\.trip \}\) : ''\) \+ body/);
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

test('orientační cena: místo „Super cena“ „nejlevnější v tomto hledání“, rada začíná výhradou', () => {
  const st = fl.match(/ {2}const superTxt = [^\n]+\n {2}const tagOf = [^\n]+\n/);
  assert.ok(st, 'superTxt a tagOf');
  const tagOf = new Function('SearchHelp', 'PL_BADGE', 'ikona', `${st[0]}; return tagOf;`)(SearchHelp, { low: ['good', 'Dobrá cena'], normal: ['', 'Běžná cena'] }, ikona);
  assert.deepEqual(tagOf(cached, { level: 'low' }), ['hot', 'nejlevnější v tomto hledání']);
  assert.deepEqual(tagOf(live, { level: 'low' }), ['hot', `${ikona('super-cena')} Super cena`], 'živá cena: Super cena s ikonou Letsi');
  assert.deepEqual(tagOf({ ...cached, deal: { level: 'good' } }, { level: 'low' }), ['good', 'Dobrá cena']);
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

// zdrojové funkce úseku čistého režimu, které výš nejsou (radarHot, srcBoxHtml)
const mod2 = (health = null) => new Function('health', 'esc', 'SearchHelp', 'ikona', `${src}; return { radarHot, srcBoxHtml };`)(health, esc, SearchHelp, ikona);

test('radar: nejvýhodnější orientační cena není „super cena“ (jako superTxt ve výpisu), živá beze změny', () => {
  const { radarHot } = mod2();
  assert.equal(radarHot({ oc: 1, prov: 'travelpayouts' })[0], 'nejlevnější v hledání');
  assert.match(radarHot({ prov: 'travelpayouts' })[1], /^Orientační cena/, 'starší karta bez oc podle zdroje');
  assert.deepEqual(radarHot({ prov: 'ryanair' }), [`${ikona('super-cena')} super cena`, 'Jedna z nejvýhodnějších cen vůči běžné ceně na tu vzdálenost']);
  // karta radaru bere štítek z radarHot, ne pevný text
  assert.match(fl, /if \(hot\) return `<span class="b hot" title="\$\{esc\(radarHot\(x\)\[1\]\)\}">\$\{radarHot\(x\)\[0\]\}<\/span>`;/);
  assert.doesNotMatch(fl, />🔥 super cena<\/span>/);
});

test('detail karty radaru: orientační cena se štítkem a „Otevřít … na Aviasales“ místo „Koupit let“', () => {
  const dp = cut('  function dpBuy(d) {', '  function dpHtml(d) {');
  const dpBuy = new Function('esc', 'safeUrl', 'shopName', `${fl.match(/^ *const affBuy = [^\n]+\n *const buyRel = [^\n]+\n *const adTag = [^\n]+\n/m)[0]}${dp}; return dpBuy;`)(esc, u => u, () => 'Ryanair');
  assert.match(dpBuy({ buy: [['https://www.aviasales.com/x', 'travelpayouts']], oc: true }), />Otevřít na Aviasales ↗<\/a>$/);
  assert.match(dpBuy({ buy: [['https://www.ryanair.com/x', 'ryanair']], oc: false }), />Koupit let u Ryanair ↗<\/a>$/, 'živá cena beze změny');
  assert.match(dpBuy({ buy: [['https://a.example/x', 'ryanair', 'out']], oc: true }), />Let tam u Ryanair ↗/);
  // náhled z karty radaru i z výsledků předá příznak, detail ho u ceny ukáže
  assert.match(cut('  function openRadarPreview(', '  const dpFact ='), /\n\s+oc: radarOrient\(x\),/);
  assert.match(cut('  function openDestPreview(', '  function openRadarPreview('), /czk: t\.perPersonCzk, oc: SearchHelp\.isCached\(t\),/);
  assert.match(fl, /<b>\$\{czk\(d\.czk\)\}<\/b>\/os\.\$\{d\.oc \? ` <span class="dp-est" title="\$\{esc\(CACHE_TIP\)\}">orientační<\/span>` : ''\}/);
});

test('Zdroje cen (počítač): jen zapnuté zdroje, bez „vypnuto“ a tlačítka „Zapnout“ pro správce serveru', () => {
  // jako /api/health v čistém režimu
  const health = { demo: false, providers: [
    { id: 'ryanair', name: 'Ryanair', color: '#073590', kind: 'live', enabled: false },
    { id: 'wizzair', name: 'Wizz Air', color: '#c6007e', kind: 'live', enabled: false },
    { id: 'kiwi', name: 'Kiwi.com (všechny aerolinky)', color: '#008471', kind: 'live', enabled: false },
    { id: 'liteapi', name: 'Hotely (LiteAPI)', color: '#7c3aed', kind: 'stays', enabled: false, hint: 'Volitelné: ostrý klíč' },
    { id: 'xotelo', name: 'Hotely (TripAdvisor)', color: '#00aa6c', kind: 'stays', tag: 'orientačně', enabled: true },
    { id: 'osm', name: 'Ubytování (OpenStreetMap)', color: '#7ebc6f', kind: 'stays', tag: 'bez ceny', enabled: true },
    { id: 'travelpayouts', name: 'Letenky (Aviasales)', color: '#c25100', kind: 'cached', enabled: true },
  ] };
  const html = mod2(health).srcBoxHtml();
  for (const no of ['vypnuto', 'nepoužito', 'Zapnout', 'Ryanair', 'Kiwi', 'LiteAPI', 'tpHelp']) assert.ok(!html.includes(no), no);
  assert.match(html, /Letenky \(Aviasales\)<span>orientačně<\/span>/);
  assert.match(html, /Hotely \(TripAdvisor\)<span>orientačně<\/span>/);
  assert.match(mod2({ providers: [{ ...health.providers[0], enabled: true }] }).srcBoxHtml(), /Ryanair<span>živě<\/span>/, 'zapnutý zdroj vidět');
  assert.match(mod2({ demo: true, providers: [{ id: 'demo-air', name: 'Demo Air', kind: 'demo', enabled: true }] }).srcBoxHtml(), /Demo Air<span>demo<\/span>/);
  assert.equal(mod2(null).srcBoxHtml(), '<div class="src-t">Zdroje cen</div>');
  assert.doesNotMatch(fl, /id="tpHelp"/);
});

test('jméno zdroje Aviasales: „Letenky (Aviasales)“ v panelu a filtrech, „Aviasales“ v tlačítkách a průběhu hledání', async () => {
  const { PROVIDER_INFO } = await import('../server/providers/index.js');
  assert.equal(PROVIDER_INFO.travelpayouts.name, 'Letenky (Aviasales)');
  assert.match(fl, /PROV\.travelpayouts = PROV\.travelpayouts \|\| \{ name: 'Letenky \(Aviasales\)'/, 'záloha, než dorazí /api/health');
  const sn = fl.match(/ {2}const shopName = [^\n]+\n/);
  assert.ok(sn, 'shopName');
  const shopName = new Function('provName', `${sn[0]}; return shopName;`)(id => ({ travelpayouts: 'Letenky (Aviasales)', kiwi: 'Kiwi.com (všechny aerolinky)' })[id] || id);
  assert.equal(shopName('travelpayouts'), 'Aviasales', '„Tam: Aviasales“, ne „Tam: Letenky“');
  assert.equal(shopName('kiwi'), 'Kiwi.com');
});
