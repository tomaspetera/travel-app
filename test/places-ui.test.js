// Objevuj v prohlížeči (public/js/places.js – klasický skript, tady načtený přes node:vm): okruh nad načtenými místy,
// značky zastávek programu, Enter v hledání, čekání a chyby ve výsledku, zapamatovaný stav, „Naposledy“, odkazy a GPX.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load(extra = {}) {
  const ctx = { window: {}, URLSearchParams, console, ...extra };
  vm.createContext(ctx);
  const helpers = src('app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm);
  assert.equal(helpers.length, 7);
  vm.runInContext(helpers.join('\n'), ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('places.js'), ctx, { filename: 'places.js' });
  return ctx;
}
const T = load().window.Places._t;
const plain = (x) => JSON.parse(JSON.stringify(x));
const XSS = '<img src=x onerror=alert(1)>"\'';
// Skutečná místa z Wikidat (Barcelona, okruh 10 km, uloženo 10. 10. 2026, přes groupBindings + scorePlace) + 8 cílů výletů.
const BCN = JSON.parse(readFileSync(new URL('./fixtures/places-bcn.json', import.meta.url), 'utf8'));

test('počty česky: místo / místa / míst, „vybráno N míst“', () => {
  assert.deepEqual([0, 1, 2, 4, 5, 52].map(T.placesTxt), ['0 míst', '1 místo', '2 místa', '4 místa', '5 míst', '52 míst']);
  assert.deepEqual([1, 3, 7].map(T.mustTxt), ['vybráno 1 místo', 'vybrána 3 místa', 'vybráno 7 míst']);
  assert.equal(T.plural(3, 'výlet', 'výlety', 'výletů'), '3 výlety');
});

test('okruh: zmenšení filtruje načtená místa (výlety zůstanou), nový dotaz jen nad načtený okruh', () => {
  const all = BCN.items;
  const city = all.filter((x) => x.category !== 'daytrip');
  assert.equal(city.length, 60);
  const r3 = T.inRadius(all, 3);
  assert.ok(r3.filter((x) => x.category !== 'daytrip').every((x) => x.distanceKm <= 3));
  assert.equal(r3.filter((x) => x.category === 'daytrip').length, 8, 'výlety mimo město leží za okruhem vždy');
  // nejvýznamnější místa jsou u středu: z 60 nejlepších do 10 km je 53 do 3 km – filtr dá skoro totéž co nový dotaz
  assert.equal(r3.length - 8, 53);
  assert.ok(r3.some((x) => x.name === 'Sagrada Família'));
  assert.ok(!r3.some((x) => x.distanceKm > 3 && x.category !== 'daytrip'));
  assert.equal(T.inRadius(all, 10).length, all.length);
  assert.equal(T.inRadius([{ id: 'a', category: 'sight' }], 3).length, 1, 'bez vzdálenosti se nevyřadí');
  assert.deepEqual([[10, 3], [10, 10], [20, 5], [10, 20], [undefined, 10], [null, 3]].map(([a, b]) => T.needsFetch(a, b)), [false, false, false, true, true, true]);
});

test('program po zmenšení okruhu: místa za ním vyřadí, vybraná a výlety nechá', () => {
  const far = BCN.items.filter((x) => x.category !== 'daytrip' && x.distanceKm > 3);
  assert.ok(far.length >= 5);
  const keep = new Set([far[0].id]);
  const out = T.outsideIds(BCN.items, 3, keep);
  assert.deepEqual(out, far.slice(1).map((x) => x.id));
  assert.equal(T.outsideIds(BCN.items, 10).length, 0);
});

test('značky: zastávky programu mimo načtený seznam se přidají (jednou), „✓ v plánu“ podle programu', () => {
  const items = T.inRadius(BCN.items, 3);
  const far = BCN.items.find((x) => x.category !== 'daytrip' && x.distanceKm > 3);
  const plan = { days: [{ items: [items[0], far] }, { items: [items[1], far] }, { items: [] }] };
  const pts = T.withPlanStops(items, plan);
  assert.equal(pts.length, items.length + 1);
  assert.equal(pts.at(-1).id, far.id);
  assert.equal(T.withPlanStops(items, null), items, 'bez programu beze změny');
  assert.equal(T.withPlanStops(items, { days: [{ items: [items[2]] }] }), items);
  assert.deepEqual([...T.planIds(plan)].sort(), [items[0].id, items[1].id, far.id].sort());
  assert.equal(T.planIds(null).size, 0);
});

test('karta: „✓ v plánu“, „+ / ★ chci vidět“, odkaz do Google Map (data-gm), escapování', () => {
  const p = { id: 'Q1"x', name: XSS, category: 'church', distanceKm: 1.2, description: XSS };
  const center = { label: 'Barcelona', city: 'Barcelona', country: 'Španělsko', lat: 41.39, lon: 2.17 };
  const off = T.poiCard(p, { toggle: true, must: new Set(), inPlan: new Set(), center });
  assert.match(off, /data-must="Q1&quot;x"[^>]*aria-pressed="false">\+ chci vidět</);
  assert.match(off, /data-gm/);
  assert.ok(!off.includes('<img src=x'));
  const on = T.poiCard(p, { toggle: true, must: new Set([p.id]), inPlan: new Set(), center });
  assert.match(on, /class="linkbtn on"[^>]*aria-pressed="true">★ chci vidět</);
  const inPlan = T.poiCard(p, { toggle: true, must: new Set([p.id]), inPlan: new Set([p.id]), center });
  assert.match(inPlan, /<span class="poi-in">✓ v plánu<\/span>/);
  assert.ok(!inPlan.includes('data-must'), 'v plánu už není co přidávat (vyřadit jde ✕ v programu)');
  assert.ok(!T.poiCard(p, { center }).includes('chci vidět'), 'kolo / pěšky bez přepínače');
});

test('popis jen anglicky: první věta se štítkem; sloučené části „Zahrnuje“ (když je server pošle)', () => {
  const picasso = 'The Museu Picasso, located in Barcelona, Catalonia, Spain, houses one of the most extensive collections of artworks by the 20th-century Spanish artist Pablo Picasso. With 4,251 works exhibited by the painter, the museum has the most complete collection.';
  assert.match(T.firstSentence(picasso), /Pablo Picasso\.$/);
  assert.equal(T.firstSentence('St. Vitus Cathedral is a Roman Catholic metropolitan cathedral in Prague. It is the seat.'), 'St. Vitus Cathedral is a Roman Catholic metropolitan cathedral in Prague.');
  assert.equal(T.firstSentence('Krátký popis'), 'Krátký popis');
  assert.equal(T.firstSentence('Gotická katedrála ze 14. století s věží. Čtyři kaple.'), 'Gotická katedrála ze 14. století s věží.', 'české řadové číslovky větu neukončí');
  assert.equal(T.firstSentence('Kostel byl vysvěcen roku 1348. Později přestavěn.'), 'Kostel byl vysvěcen roku 1348.');
  assert.ok(T.firstSentence('x '.repeat(200)).endsWith('…'));
  // česká zkratka před jménem větu neukončí (🔎 Co tam je krátí i český popis), slovo končící jako zkratka ano
  const cz = (s) => T.firstSentence(s);
  assert.equal(cz('Barokní římskokatolický kostel sv. Mikuláše stojí na hlavním náměstí. Postaven v 18. století.'), 'Barokní římskokatolický kostel sv. Mikuláše stojí na hlavním náměstí.');
  assert.equal(cz('Rozlehlé náměstí v historickém centru, tzv. Rynek, je obklopeno domy. Konají se zde trhy.'), 'Rozlehlé náměstí v historickém centru, tzv. Rynek, je obklopeno domy.');
  assert.equal(cz('Muzeum moderního umění, které vystavuje např. Picassa a Miróa, sídlí v klášteře. Otevřeno denně.'), 'Muzeum moderního umění, které vystavuje např. Picassa a Miróa, sídlí v klášteře.');
  assert.equal(cz('Katedrála svatého Petra (něm. Dom St. Peter) je chrám v Řezně. Stavba začala roku 1275.'), 'Katedrála svatého Petra (něm. Dom St. Peter) je chrám v Řezně.');
  assert.equal(cz('Vilu, kterou navrhl arch. Ludwig Mies van der Rohe, najdeš v Brně. Je v UNESCO.'), 'Vilu, kterou navrhl arch. Ludwig Mies van der Rohe, najdeš v Brně.');
  assert.equal(cz('Hlavní třída vede přes nám. Svobody až k nádraží. Je pěší zónou.'), 'Hlavní třída vede přes nám. Svobody až k nádraží.');
  assert.equal(cz('Diokleciánův palác stojí v centru města Split. Patří do UNESCO.'), 'Diokleciánův palác stojí v centru města Split.', '„it.“ jen jako celé slovo');
  assert.equal(cz('Hlavní chrám pravoslavné církve, Kyjev. Postaven roku 1037.'), 'Hlavní chrám pravoslavné církve, Kyjev.');
  assert.equal(cz('Galerie vystavuje obrazy, sochy, grafiku atd. Vstup je zdarma.'), 'Galerie vystavuje obrazy, sochy, grafiku atd.', '„atd.“ větu končí');
  assert.equal(T.firstSentence('The gate is a triumphal arch. It was built in 1800.', 'en'), 'The gate is a triumphal arch.', 'anglicky se zkratky nehlídají');
  assert.match(T.descHtml(picasso, 'en'), /^<span class="poi-lang"[^>]*>anglicky<\/span> The Museu Picasso[\s\S]*Picasso\.$/);
  assert.equal(T.descHtml('Gotická katedrála na Pražském hradě.', undefined), 'Gotická katedrála na Pražském hradě.');
  assert.equal(T.descHtml('', 'en'), '');
  assert.ok(!T.descHtml(XSS, 'en').includes('<img src=x'));
  const castle = { id: 'Q1', name: 'Pražský hrad', category: 'castle', includes: ['Katedrála sv. Víta', 'Zlatá ulička', 'Starý královský palác', 'Bazilika sv. Jiří', 'Daliborka', 'Prašná věž', XSS] };
  const inc = T.inclHtml(castle, 'poi-inc');
  assert.match(inc, /^<div class="poi-inc">Zahrnuje: Katedrála sv\. Víta, Zlatá ulička, Starý královský palác, Bazilika sv\. Jiří, Daliborka a 2 další<\/div>$/);
  // „a 5 dalších“, ne „a 5 další“
  assert.match(T.inclHtml({ includes: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] }, 'x'), /E a 5 dalších<\/div>$/);
  assert.match(T.inclHtml({ includes: ['A', 'B', 'C', 'D', 'E', 'F'] }, 'x'), /E a 1 další<\/div>$/);
  assert.equal(T.inclHtml({ includes: [] }, 'x'), '');
  assert.equal(T.inclHtml({ includes: 'x' }, 'x'), '', 'neznámý tvar se ignoruje');
  assert.match(T.poiCard(castle, {}), /Zahrnuje: Katedrála sv\. Víta/);
  assert.ok(!T.poiCard({ id: 'Q2', name: 'Bez částí', category: 'church' }, {}).includes('Zahrnuje'));
});

test('výlet: cesta tam vlakem / lodí; neznámý druh z cizího odkazu (#trip=) jako bus, vykreslení nespadne', () => {
  const center = { lat: 38.72, lon: -9.14, label: 'Lisabon' };
  const trip = (mode) => T.poiCard({ id: 'Q1', name: 'Sintra', category: 'daytrip', lat: 38.8, lon: -9.39, reach: { transitMin: 40, carMin: 30, mode } }, { center });
  assert.match(trip('rail'), /🚆 ~40 min vlakem · 🚗 ~30 min autem/);
  assert.match(trip('boat'), /⛴️ ~40 min lodí/);
  for (const mode of ['constructor', 'toString', '__proto__', 'nesmysl']) assert.match(trip(mode), /🚌 ~40 min busem/, mode);
});

test('Enter v hledání: staré návrhy ani čekání nevyberou cizí místo', () => {
  const a = (o) => T.enterAction({ err: false, count: 0, sugFor: '', ...o });
  assert.equal(a({ text: 'Bari', sugFor: 'Bar', count: 5 }), 'fetch', 'návrhy patří k „Bar“ → hledej „Bari“');
  assert.equal(a({ text: 'Bari', sugFor: 'Bari', count: 3 }), 'pick');
  assert.equal(a({ text: 'Barcelona', sugFor: '' }), 'fetch', 'našeptávání ještě neodpovědělo');
  assert.equal(a({ text: 'Xyzzy', sugFor: 'Xyzzy', count: 0 }), 'none', 'nic nenalezeno – znovu se neptá');
  assert.equal(a({ text: 'Praha', sugFor: 'Praha', count: 0, err: true }), 'fetch', 'po výpadku zkusí znovu');
  assert.equal(a({ text: 'P' }), 'none');
});

test('nabídka hledání: výpadek ≠ „Nic nenalezeno“, návrhy escapované', () => {
  assert.match(T.sugHtml([], 0, true), /Hledání míst teď nefunguje – zkus to za chvíli/);
  assert.match(T.sugHtml([], 0, false), /Nic nenalezeno/);
  const h = T.sugHtml([{ label: XSS, sub: 'Itálie', flag: '🇮🇹' }, { label: 'Bario' }], 1, false);
  assert.ok(!h.includes('<img src=x'));
  assert.match(h, /class="pi-opt on" data-i="1"/);
});

test('čekání: rovnou odhad, po 8 s výslovnější vysvětlení', () => {
  assert.equal(T.SLOW_MS, 8000);
  const l0 = T.waitHtml('list', false, XSS);
  assert.match(l0, /Hledám zajímavá místa kolem: &lt;img/);
  assert.match(l0, /První načtení místa trvá obvykle 20–40 s, příště je hned\./);
  assert.match(T.waitHtml('list', true, 'Praha'), /Pořád načítám/);
  assert.match(T.waitHtml('trips', false), /Hledám cíle výletů…[\s\S]*20–40 s/);
  assert.match(T.waitHtml('trips', true), /Pořád hledám/);
  assert.ok(!T.waitHtml('city', false).includes('ex-wait'), 'program bývá hned – bez strašení');
  assert.match(T.waitHtml('city', true), /Trvá to déle než obvykle/);
  assert.match(T.waitHtml('route', false, '', 'Odpověď trvá déle – zkouším znovu…'), /zkouším znovu/);
  for (const k of ['list', 'city', 'trips', 'train', 'route']) assert.match(T.waitHtml(k, false, 'X'), /class="spin dark"/);
});

test('chyby: ve výsledku se „Zkusit znovu“, „Jiná trasa“ neskončí tiše starou trasou', () => {
  assert.equal(T.errLead('route', true), 'Jinou trasu se nepodařilo naplánovat');
  assert.equal(T.errLead('train', true), 'Jiné nádraží se nepodařilo najít');
  assert.equal(T.errLead('trips'), 'Výlety se nepodařilo naplánovat');
  assert.equal(T.errLead('city'), 'Program se nepodařilo sestavit');
  const h = T.errHtml(T.errLead('route', true), 'Příliš mnoho požadavků – zkus to za pár minut.', 'exRetry', 'Níže zůstává předchozí trasa.');
  assert.match(h, /Jinou trasu se nepodařilo naplánovat: Příliš mnoho požadavků – zkus to za pár minut\. <span class="faint">Níže zůstává předchozí trasa\.<\/span>/);
  assert.match(h, /<button type="button" class="btn sm" id="exRetry">↻ Zkusit znovu<\/button>/);
  assert.ok(!T.errHtml('X', XSS, 'r').includes('<img src=x'));
  // chyba bez textu serveru (Render při probouzení vrací HTML) česky
  assert.match(T.httpErr(502, {}), /probouzí/);
  // bez kódu („HTTP 500“) – lidsky, co dělat
  assert.equal(T.httpErr(500, {}), 'Na serveru se něco pokazilo – zkus to prosím za chvíli znovu.');
  assert.match(T.httpErr(429, {}), /za pár minut/);
  assert.equal(T.httpErr(400, null), 'Server požadavek nepřijal – zkus to prosím znovu.');
  for (const s of [400, 404, 429, 500, 502, 503, 504]) assert.doesNotMatch(T.httpErr(s, {}), /HTTP|\d{3}/, String(s));
  assert.equal(T.httpErr(429, { error: 'Příliš mnoho požadavků' }), 'Příliš mnoho požadavků');
});

test('getJson: výpadek sítě česky (ne „Failed to fetch“), přerušení zůstane AbortError, status u chyby', async () => {
  const mk = (fetch) => load({ fetch }).window.Places._t.getJson;
  await assert.rejects(mk(async () => { throw new TypeError('Failed to fetch'); })('api/poi'), /Server teď neodpovídá/);
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  await assert.rejects(mk(async () => { throw abort; })('api/geocode'), (e) => e.name === 'AbortError');
  // hláška z pwa.js („Jsi offline“, nic přes 2 min) zůstane i s příznakem offline – Objevuj se po návratu online načte samo
  const off = Object.assign(new Error('Jsi offline – připoj se k internetu a zkus to znovu.'), { name: 'NetworkError', offline: true });
  await assert.rejects(mk(async () => { throw off; })('api/poi'), (e) => e === off);
  await assert.rejects(mk(async () => ({ ok: false, status: 503, json: async () => ({ error: 'Wikidata neodpovídá' }) }))('api/roadtrip'),
    (e) => e.status === 503 && e.message === 'Wikidata neodpovídá');
  await assert.rejects(mk(async () => ({ ok: false, status: 504, json: async () => { throw new SyntaxError('html'); } }))('api/poi'), /probouzí/);
  assert.deepEqual(plain(await mk(async () => ({ ok: true, json: async () => ({ items: [1] }) }))('api/poi')), { items: [1] });
});

test('zapamatovaný stav: tam a zpět, cizí a staré hodnoty se zahodí', () => {
  const ex = {
    place: { lat: 41.3874, lon: 2.1686, label: 'Barcelona', cc: 'ES', geo: false, country: 'Španělsko', extra: 'pryč' }, radius: 5, mode: 'bike', start: '2026-10-20', days: 4,
    tripDays: { day: 3, loop: 5 }, transport: 'transit', interests: new Set(['art', 'nature']), tripInterests: new Set(['spa']), pace: 'relaxed',
    bike: { km: 60, bike: 'gravel', scenery: 'nature', hills: 'hilly', kind: 'train', variant: 4 }, hike: { km: 12, scenery: 'city', hills: 'flat', variant: 2 },
    recent: [{ lat: 41.14, lon: 16.76, label: 'Bari', cc: 'IT', geo: false, country: 'Itálie' }],
  };
  const snap = JSON.parse(JSON.stringify(T.uiSnapshot(ex)));
  assert.equal(snap.bike.variant, undefined, 'varianta trasy se neukládá');
  assert.deepEqual(snap.interests, ['art', 'nature']);
  const r = plain(T.uiRestore(snap, '2026-10-10'));
  assert.deepEqual(r.place, { lat: 41.3874, lon: 2.1686, label: 'Barcelona', cc: 'ES', geo: false, country: 'Španělsko' });
  assert.deepEqual([r.radius, r.mode, r.start, r.days, r.transport, r.pace], [5, 'bike', '2026-10-20', 4, 'transit', 'relaxed']);
  assert.deepEqual(r.tripDays, { day: 3, loop: 5 });
  assert.deepEqual(r.bike, { km: 60, bike: 'gravel', scenery: 'nature', hills: 'hilly', kind: 'train' });
  assert.deepEqual(r.hike, { km: 12, scenery: 'city', hills: 'flat' });
  assert.deepEqual(r.tripInterests, ['spa']);
  assert.equal(r.recent.length, 1);
  // termín v minulosti, neznámé hodnoty, rozbitá místa
  const bad = plain(T.uiRestore({
    place: { lat: 'x', lon: 2, label: 'X' }, radius: 7, mode: 'fly', start: '2026-10-01', days: 99, transport: 'boat', pace: 'turbo',
    tripDays: { day: 0, loop: 4 }, interests: ['art', 'hack', 'art'], bike: { km: 41, kind: 'loop' }, hike: 'x',
    recent: [{ lat: 1, lon: 2, label: 'Moje okolí', geo: true }, { lat: 95, lon: 0, label: 'Pól' }, { lat: 50.08, lon: 14.42, label: XSS, cc: 'cz' }],
  }, '2026-10-10'));
  assert.deepEqual(bad, { tripDays: { loop: 4 }, interests: ['art'], bike: { kind: 'loop' }, hike: {}, recent: [{ lat: 50.08, lon: 14.42, label: XSS, cc: '', geo: false, country: '' }] });
  for (const junk of [null, 'x', 42, [], { place: null }]) assert.doesNotThrow(() => T.uiRestore(junk, '2026-10-10'));
  assert.deepEqual(plain(T.uiRestore(null, '2026-10-10')), { tripDays: {}, bike: {}, hike: {}, recent: [] });
});

test('zapamatovaný stav: vybraný termín platí i po obnovení, „Moje okolí“ se neobnoví (poloha se mění)', () => {
  const base = { place: null, radius: 10, mode: 'city', start: '2026-11-10', days: 3, tripDays: { day: 2, loop: 4 }, transport: 'car', interests: new Set(), tripInterests: new Set(), pace: 'normal',
    bike: { km: 40, bike: 'trekking', scenery: 'mixed', hills: 'normal', kind: 'loop' }, hike: { km: 10, scenery: 'mixed', hills: 'normal' }, recent: [] };
  // „Najít lety sem“ hledá přesně jen ve vybraném termínu – dřív po obnovení výchozí volné termíny
  const picked = plain(T.uiRestore(plain(T.uiSnapshot({ ...base, datePicked: true })), '2026-10-10'));
  assert.equal(picked.start, '2026-11-10');
  assert.equal(picked.datePicked, true);
  assert.equal(plain(T.uiRestore(plain(T.uiSnapshot(base)), '2026-10-10')).datePicked, undefined, 'výchozí (zítřek) není vybraný');
  assert.equal(plain(T.uiRestore(plain(T.uiSnapshot({ ...base, datePicked: true })), '2026-11-11')).datePicked, undefined, 'termín v minulosti se zahodí i s výběrem');
  assert.equal(T.uiRestore({ datePicked: 'yes', start: '2026-11-10' }, '2026-10-10').datePicked, undefined);
  // místo z „📍 Tady“: ne staré souřadnice pod názvem „Moje okolí“ – prázdné hledání
  const geo = { lat: 49.1951, lon: 16.6068, label: 'Moje okolí', cc: '', geo: true, country: '' };
  const snap = plain(T.uiSnapshot({ ...base, place: geo }));
  assert.equal(snap.place.geo, true);
  const r = plain(T.uiRestore(snap, '2026-10-10'));
  assert.equal(r.place, undefined);
  assert.equal(r.start, '2026-11-10', 'ostatní volby zůstanou');
});

test('termín „Od“: platí jen celé datum od dneška (Chrome při psaní hlásí i prázdné pole a rok 0002)', () => {
  // mm/dd/rrrr: „11“ do měsíce, pak den a rok po číslicích – každá změna je hodnota pole
  const typed = ['2026-01-12', '2026-11-12', '2026-11-02', '2026-11-20', '0002-11-20', '0020-11-20', '0202-11-20', '2027-11-20', ''];
  assert.deepEqual(typed.filter((v) => T.okStart(v, '2026-10-11')), ['2026-11-12', '2026-11-02', '2026-11-20', '2027-11-20']);
  assert.equal(T.okStart('2026-10-11', '2026-10-11'), true, 'dnešek ano');
  assert.equal(T.okStart('2026-10-10', '2026-10-11'), false, 'včerejšek ne');
  for (const junk of [undefined, null, 20261112, '2026-1-12', '275760-01-01', '2026-11-12T00:00']) assert.equal(T.okStart(junk, '2026-10-11'), false, String(junk));
  // obnovený stav používá stejné pravidlo
  assert.equal(T.uiRestore({ start: '0002-11-20' }, '2026-10-11').start, undefined);
});

test('program v průvodci: zájmy, tempo, vyřazená a vybraná místa jdou s programem (po návratu do kroku platí dál)', async () => {
  const bodies = [];
  const fetch = async (url, o) => { bodies.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ days: [{ date: '2026-10-12', items: [] }], spare: [], places: [] }) }; };
  const TP = load({ fetch }).window.Places._t;
  const st = { ...TP.prefsOf(null, {}), items: [] };
  assert.deepEqual([[...st.interests], st.pace, st.exclude.size, st.must.size], [[], 'normal', 0, 0]);
  st.interests.add('art'); st.pace = 'intense'; st.exclude.add('Q1'); st.must.add('Q2');
  const plan = await TP.makePlan(st, BCN_C, { start: '2026-10-12', end: '2026-10-14', arrivalTime: '10:00' });
  assert.deepEqual(plain(plan.prefs), { interests: ['art'], pace: 'intense', exclude: ['Q1'], must: ['Q2'] });
  assert.deepEqual([bodies[0].pace, bodies[0].exclude, bodies[0].include], ['intense', ['Q1'], ['Q2']]);
  // uložený program (přes JSON, i ze sdíleného odkazu) → stejné volby pro další úpravu; dřív výchozí a vyřazené místo se vrátilo
  const back = TP.prefsOf(plain(plan).prefs, {});
  assert.deepEqual([[...back.interests], back.pace, [...back.exclude], [...back.must]], [['art'], 'intense', ['Q1'], ['Q2']]);
  // cizí hodnoty se zahodí; bez uložených voleb výchozí z průvodce
  const bad = TP.prefsOf({ interests: ['art', 'hack', 5], pace: 'turbo', exclude: [1, '', 'Q3', {}], must: 'Q4' }, { pace: 'relaxed' });
  assert.deepEqual([[...bad.interests], bad.pace, [...bad.exclude], [...bad.must]], [['art'], 'relaxed', ['Q3'], []]);
  const def = TP.prefsOf(undefined, { interests: ['nature'], pace: 'relaxed' });
  assert.deepEqual([[...def.interests], def.pace], [['nature'], 'relaxed']);
});

test('✕ v programu: přeplánování pošle dny ostatních míst (keep, jen dny ve městě) jednou – další a ↩ Vrátit bez nich', async () => {
  const bodies = [];
  const toasts = [];
  const fetch = async (url, o) => { bodies.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ days: [], spare: [], places: [] }) }; };
  const TP = load({ fetch, toast: (...a) => toasts.push(a) }).window.Places._t;
  const st = { ...TP.prefsOf(null, {}), items: [] };
  st.must.add('Q2');
  const plan = { days: [
    { date: '2026-10-12', kind: 'city', items: [{ id: 'Q1', name: 'Sagrada Família' }, { id: 'Q2', name: 'Park Güell' }] },
    { date: '2026-10-13', kind: 'daytrip', items: [{ id: 'T1', name: 'Montserrat' }] },
    { date: '2026-10-14', kind: 'city', items: [{ id: 'Q3', name: 'Casa Milà' }] },
  ] };
  const replan = () => TP.makePlan(st, BCN_C, { start: '2026-10-12', end: '2026-10-14' });
  TP.dropUndo(st, 'Q2', plan, replan);
  assert.deepEqual(plain(bodies[0].keep), { Q1: '2026-10-12', Q3: '2026-10-14' }, 'bez vyřazeného a bez výletu');
  assert.deepEqual([bodies[0].exclude, bodies[0].include], [['Q2'], []]);
  assert.equal(st.keep, null, 'jen pro toto přeplánování');
  await replan(); // jiné přeplánování (zájmy, tempo) – program se skládá celý
  assert.equal(bodies[1].keep, undefined);
  // ↩ Vrátit: místo zpátky (i vybrané) a bez keep – stejný dotaz jako před ✕, tedy stejný program
  assert.match(toasts[0][0], /^Vyřazeno: Park Güell – program jsem upravil$/);
  toasts[0][3].run();
  assert.deepEqual([bodies[2].keep, bodies[2].exclude, bodies[2].include], [undefined, [], ['Q2']]);
  // program uložený pro jiné časy (změna spoje v průvodci): krok Program přeplánuje s místy ve svých dnech (keep celého
  // programu, jen dny ve městě) a se stejnými volbami – dřív se program smazal i s ✕
  const js = readFileSync(new URL('../public/js/places.js', import.meta.url), 'utf8');
  assert.match(js, /\} else \{\s*\/\/ uložený program pro jiný termín[\s\S]{0,400}?st\.keep = keptDays\(opts\.plan, null\);\s*run\(\);\s*\}/);
});

test('„Naposledy“: nejnovější první, bez opakování, nejvýš 5, bez „Moje okolí“', () => {
  const P = (label, lat = 50, lon = 14) => ({ lat, lon, label, cc: 'CZ', geo: false, country: 'Česko' });
  let l = [];
  for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) l = T.pushRecent(l, P(n, 50 + n.charCodeAt(0) / 100));
  assert.deepEqual(plain(l.map((x) => x.label)), ['F', 'E', 'D', 'C', 'B']);
  l = T.pushRecent(l, P('C', 50 + 'C'.charCodeAt(0) / 100));
  assert.deepEqual(plain(l.map((x) => x.label)), ['C', 'F', 'E', 'D', 'B']);
  assert.equal(T.pushRecent(l, { lat: 1, lon: 2, label: 'Moje okolí', geo: true }), l);
  assert.ok(T.samePlace(P('Praha', 50.0875, 14.4213), P('Praha', 50.0879, 14.4211)));
  assert.ok(!T.samePlace(P('Praha'), P('Brno')));
  assert.ok(!T.samePlace(null, P('Praha')));
});

test('odkazy do Google Map, den a název souboru, GPX', () => {
  const center = { label: 'Barcelona', city: 'Barcelona', country: 'Španělsko', lat: 41.3874, lon: 2.1686 };
  assert.equal(T.gq('Sagrada Família', 'Barcelona, Španělsko'), 'Sagrada Família, Barcelona, Španělsko');
  assert.equal(T.gq('Barcelona', 'Barcelona'), 'Barcelona');
  assert.equal(T.poiQ({ name: 'Casa Milà', category: 'sight' }, center), 'Casa Milà, Barcelona, Španělsko');
  assert.equal(T.centerQ({ geo: true, lat: 50.08754, lon: 14.4213 }), '50.08754,14.42130');
  const u = new URL(T.gmDir(T.centerQ(center), ['A, Barcelona', 'B, Barcelona', 'C, Barcelona'], 'walking'));
  assert.equal(u.searchParams.get('destination'), 'C, Barcelona');
  assert.equal(u.searchParams.get('waypoints'), 'A, Barcelona|B, Barcelona');
  assert.equal(u.searchParams.get('travelmode'), 'walking');
  assert.equal(T.gmDir('x', [], 'walking'), null);
  assert.equal(T.dayLbl('2026-10-11'), 'ne\u00a011.\u00a010.', 'nezlomitelné mezery – na telefonu se nerozdělí');
  assert.equal(T.slug('Český Krumlov'), 'cesky-krumlov');
  assert.equal(T.slug(''), 'trasa');
  const gpx = T.gpxOf({ geometry: [[14.42, 50.08, 200], [14.43, 50.09], [14.44, 50.1, 210]] }, 'Pěšky z: <Praha>');
  assert.equal((gpx.match(/<trkpt /g) || []).length, 3);
  assert.equal((gpx.match(/<ele>/g) || []).length, 2);
  assert.match(gpx, /<name>Pěšky z: &lt;Praha&gt;<\/name>/);
  assert.match(gpx, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<gpx version="1.1"/);
});

// Odkazy z HTML (href) jako URL
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, '&')));
const BCN_C = { label: 'Barcelona', city: 'Barcelona', country: 'Španělsko', cc: 'ES', lat: 41.3874, lon: 2.1686 };
// Výlet ve tvaru odpovědi /api/roadtrip (zkráceně): Montserrat a Vic, zpět do Barcelony.
const STOP = (id, name, lat, lon, o = {}) => ({ id, name, cc: 'ES', lat, lon, travelKm: 50, travelMin: 55, visitMin: 120, arrive: '10:00', depart: '09:00', categoryLabel: 'Klášter', ...o });
const tripOf = (mode, transport, days) => ({ mode, transport, spare: [], days });
const DAY = (date, from, stops, back = { arrive: '19:25', depart: '18:10', km: 70, min: 75 }) => ({ date, from, stops, back, overnight: back ? null : { name: stops.at(-1).name, bookUrl: 'https://www.booking.com/x' }, travelMin: 200, travelKm: 180, minutes: 600 });

test('odkazy u cílů výletů: název se zemí (Montserrat, Španělsko), ne jen název', () => {
  const TB = load({ byIso: { ES: { cs: 'Španělsko' }, FR: { cs: 'Francie' } } }).window.Places._t;
  assert.equal(TB.stopQ({ name: 'Montserrat', cc: 'ES' }, BCN_C), 'Montserrat, Španělsko');
  assert.equal(TB.stopQ({ name: 'Collioure', cc: 'FR' }, BCN_C), 'Collioure, Francie', 'cíl za hranicí – jeho země');
  assert.equal(TB.stopQ({ name: 'Vic' }, BCN_C), 'Vic, Španělsko', 'bez kódu – země výchozího místa');
  assert.equal(TB.stopQ({ name: 'Karlštejn', cc: 'XX' }, { geo: true, country: '' }), 'Karlštejn', 'neznámá země a „Moje okolí“: jen název');
  assert.equal(TB.poiQ({ name: 'Girona', category: 'daytrip', cc: 'ES' }, BCN_C), 'Girona, Španělsko');
  assert.equal(TB.poiQ({ name: 'Casa Milà', category: 'sight' }, BCN_C), 'Casa Milà, Barcelona, Španělsko');
  assert.equal(T.countryCs('ES'), '', 'bez data.js (byIso) prázdné');

  // jednodenní výlet autem: Google i Mapy.com, hledání zastávky se zemí
  const trip = tripOf('day', 'car', [DAY('2026-10-12', { name: 'Barcelona', lat: 41.3874, lon: 2.1686 },
    [STOP('Q190', 'Montserrat', 41.5933, 1.8375), STOP('Q13985', 'Vic', 41.9301, 2.2549, { arrive: '14:20' })])]);
  const links = hrefs(TB.tripHtml(trip, BCN_C));
  const g = links.find((u) => u.pathname === '/maps/dir/');
  assert.equal(g.searchParams.get('origin'), 'Barcelona, Španělsko');
  assert.equal(g.searchParams.get('waypoints'), 'Montserrat, Španělsko|Vic, Španělsko');
  assert.equal(g.searchParams.get('destination'), 'Barcelona, Španělsko');
  const m = links.find((u) => u.hostname === 'mapy.com');
  assert.equal(m.pathname, '/fnc/v1/route');
  assert.deepEqual(['start', 'end', 'routeType', 'waypoints'].map((k) => m.searchParams.get(k)), ['2.16860,41.38740', '2.16860,41.38740', 'car_fast', '1.83750,41.59330;2.25490,41.93010']);
  const search = links.filter((u) => u.pathname === '/maps/search/').map((u) => u.searchParams.get('query'));
  assert.deepEqual(search, ['Montserrat, Španělsko', 'Vic, Španělsko']);

  // okruh: druhý den začíná u přespání (se zemí), končí v posledním cíli (bez návratu)
  const loop = tripOf('loop', 'car', [
    DAY('2026-10-12', { name: 'Barcelona', lat: 41.3874, lon: 2.1686 }, [STOP('Q13985', 'Vic', 41.9301, 2.2549)], null),
    DAY('2026-10-13', { name: 'Vic', lat: 41.9301, lon: 2.2549 }, [STOP('Q7038', 'Girona', 41.9833, 2.8167)]),
  ]);
  const l2 = hrefs(TB.tripHtml(loop, BCN_C)).filter((u) => u.pathname === '/maps/dir/');
  assert.equal(l2[1].searchParams.get('origin'), 'Vic, Španělsko');
  const lm = hrefs(TB.tripHtml(loop, BCN_C)).filter((u) => u.hostname === 'mapy.com');
  assert.equal(lm.length, 2);
  assert.deepEqual([lm[0].searchParams.get('end'), lm[0].searchParams.get('waypoints')], ['2.25490,41.93010', null], 'den s přespáním: cíl = přespání');

  // vlakem a busem: bez trasy autem (Google ani Mapy.com), spoje se zemí
  const tr = hrefs(TB.tripHtml({ ...trip, transport: 'transit' }, BCN_C));
  assert.ok(!tr.some((u) => u.hostname === 'mapy.com'));
  const spoje = tr.filter((u) => u.searchParams.get('travelmode') === 'transit').map((u) => u.searchParams.get('destination'));
  assert.deepEqual(spoje, ['Montserrat, Španělsko', 'Vic, Španělsko', 'Barcelona, Španělsko']);
});

test('program ve městě: pěší den i v Mapy.com (start u ubytování), výlet mimo město jen spoje Google', () => {
  const TB = load({ byIso: { ES: { cs: 'Španělsko' } } }).window.Places._t;
  const items = BCN.items.filter((x) => x.category !== 'daytrip').slice(0, 3).map((p) => ({ ...p, visitMin: 60, fromPrevKm: 1, fromPrevMin: 15 }));
  const gir = { ...BCN.items.find((x) => x.name === 'Girona'), cc: 'ES', visitMin: 300, fromPrevKm: 85, transit: true };
  const plan = { days: [{ date: '2026-10-12', items, cap: 480, minutes: 180, walkKm: 3 }, { date: '2026-10-13', kind: 'daytrip', items: [gir], cap: 480 }] };
  const html = TB.planHtml(plan, BCN_C);
  const links = hrefs(html);
  const m = links.filter((u) => u.hostname === 'mapy.com');
  assert.equal(m.length, 1, 'výlet mimo město bez Mapy.com');
  assert.equal(m[0].searchParams.get('routeType'), 'foot_fast');
  assert.equal(m[0].searchParams.get('start'), '2.16860,41.38740');
  assert.equal(m[0].searchParams.get('end'), `${items[2].lon.toFixed(5)},${items[2].lat.toFixed(5)}`);
  assert.equal(m[0].searchParams.get('waypoints').split(';').length, 2);
  const g = links.filter((u) => u.pathname === '/maps/dir/');
  assert.equal(g[0].searchParams.get('travelmode'), 'walking');
  assert.equal(g[1].searchParams.get('destination'), 'Girona, Španělsko');
  assert.match(html, /<span class="dp-links">trasa: <a class="linkbtn"[^>]*>Google Maps ↗<\/a> · <a class="linkbtn"[^>]*>Mapy\.com ↗<\/a><\/span>/);
});

test('program ve městě: zastávka hned vedle předchozí – „hned vedle“, ne „0 km pěšky (~0 min)“', () => {
  const TB = load({ byIso: { ES: { cs: 'Španělsko' } } }).window.Places._t;
  const [a, b, c] = BCN.items.filter((x) => x.category !== 'daytrip').slice(0, 3);
  const items = [{ ...a, visitMin: 75, fromPrevKm: 0.04, fromPrevMin: 0 }, { ...b, visitMin: 45, fromPrevKm: 0, fromPrevMin: 0 }, { ...c, visitMin: 45, fromPrevKm: 1.2, fromPrevMin: 15 }];
  const walks = [...TB.planHtml({ days: [{ date: '2026-10-12', items, cap: 480, minutes: 165, walkKm: 1.2 }] }, BCN_C).matchAll(/<div class="dp-walk">([^<]*)<\/div>/g)].map((m) => m[1]);
  assert.deepEqual(walks, ['hned u ubytování', 'hned vedle', 'dál 1,2 km pěšky (~15 min)']);
  // program v místě, kde se nespí (hotel z okolí – Cesta): první zastávka dne od centra
  const walk = (it) => [...TB.planHtml({ days: [{ date: '2026-10-12', items: it, cap: 480, minutes: 165, walkKm: 1.2 }] }, { ...BCN_C, startAt: 'center' }).matchAll(/<div class="dp-walk">([^<]*)<\/div>/g)].map((m) => m[1]);
  assert.deepEqual(walk(items), ['hned v centru', 'hned vedle', 'dál 1,2 km pěšky (~15 min)']);
  assert.deepEqual(walk([items[2]]), ['od centra 1,2 km pěšky (~15 min)']);
});

test('Mapy.com: nejvýš 15 mezizastávek, bez platných bodů žádný odkaz', () => {
  const pts = Array.from({ length: 20 }, (_, i) => ({ lat: 50 + i / 100, lon: 14 + i / 100 }));
  const u = new URL(T.mapyDir({ lat: 50, lon: 14 }, pts, 'foot_fast'));
  assert.equal(u.searchParams.get('waypoints').split(';').length, T.MAPY_WP);
  assert.equal(u.searchParams.get('end'), '14.19000,50.19000', 'cíl je poslední zastávka');
  const back = new URL(T.mapyDir({ lat: 50, lon: 14 }, pts.slice(0, 3), 'car_fast', { lat: 50, lon: 14 }));
  assert.equal(back.searchParams.get('waypoints').split(';').length, 3, 's návratem jsou mezizastávkami všechny cíle');
  assert.equal(T.mapyDir({ lat: 50, lon: 14 }, [], 'foot_fast'), null);
  assert.equal(T.mapyDir({ lat: 50, lon: 14 }, [{ lat: null, lon: 14 }, { name: 'x' }], 'foot_fast'), null);
  assert.equal(T.mapyDir({}, pts, 'foot_fast'), null, 'bez startu nic');
  assert.equal(T.dayLinks(null, null), '');
});

// Trasa ve tvaru odpovědi /api/bike (zkráceně).
const ROUTE = (o = {}) => ({ km: 40, target: 40, ascent: 320, minutes: 150, unpavedPct: 35, cyclePct: 81, trailPct: 0, roadPct: 0, busyPct: 0, via: [],
  geometry: [[2.1686, 41.3874, 10], [2.2, 41.42, 60], [2.1686, 41.3874, 10]], activity: 'bike', kind: 'loop', bike: 'trekking', variant: 0,
  mapyUrl: 'https://mapy.com/fnc/v1/route?x=1', googleUrl: 'https://www.google.com/maps/dir/?api=1', ...o });

test('poznámka pod trasou kola a pěšky: vidět čas bez přestávek a zdroj, výpočet a GPX pod „Jak počítám“ (dřív 5–8 řádků)', () => {
  const foot = (r) => T.routeHtml(r, BCN_C, '2026-10-12').replace(/\s+/g, ' ')
    .match(/<div class="faint" style="font-size:11\.5px;margin-top:6px">(.*?) <details class="foot-more"><summary>Jak počítám<\/summary>(.*?)<\/details><\/div>/);
  const bike = foot(ROUTE());
  assert.equal(bike[1], 'Čas v sedle je bez zastávek. Trasa: BRouter (brouter.de) nad mapou © OpenStreetMap.');
  assert.match(bike[2], /^Čas je odhad podle kola a převýšení\. GPX nahraješ do Mapy\.com, Garminu, Komootu či Stravy/);
  const hike = foot(ROUTE({ activity: 'hike' }));
  assert.equal(hike[1], 'Čas chůze je bez přestávek. Trasa: BRouter (profil pěší turistiky) nad mapou © OpenStreetMap.');
  assert.match(hike[2], /^Čas chůze podle turistického vzorce DIN 33466 \(4 km\/h, 300 m stoupání a 500 m klesání za hodinu\)\. „Spíš rovina“/);
  const th = foot(ROUTE({ activity: 'hike', trailhead: { kind: 'town', name: 'Karpacz' } }));
  assert.match(th[1], /^Čas chůze je bez přestávek\. Start túry: Wikidata\. Trasa: BRouter/);
  const train = foot(ROUTE({ kind: 'train', station: { name: 'Vic', lat: 41.93, lon: 2.25, cc: 'ES' }, train: { googleUrl: 'https://www.google.com/maps/dir/?api=1' } }));
  assert.match(train[1], /^Čas v sedle je bez zastávek\. Nádraží: Wikidata\. Trasa: BRouter \(brouter\.de\)/);
  // záloha Mapy.com: logo a proč bez povrchu zůstávají vidět (podmínky Mapy.com API)
  const mapy = foot(ROUTE({ source: 'mapy', activity: 'hike' }));
  assert.match(mapy[1], /^Čas chůze je bez přestávek\. Trasa: <a class="mapy-by"[^>]*>Plánují <img[^>]*><\/a> – plánovač BRouter teď neodpovídá, proto bez rozboru povrchu a cest\.$/);
  assert.match(mapy[2], /^Výšky jsou z výškového profilu Mapy\.com\. Čas chůze podle turistického vzorce DIN 33466\. GPX/);
});

test('drobnosti: „varianta n/10“ u Jiné trasy, prázdný okruh, mapa bez podkladu, anglický popis bez údaje o jazyku', () => {
  assert.equal(T.ROUTE_VARIANTS, 10);
  assert.deepEqual([0, 4, 9, 10, 13].map((v) => T.variantTxt({ kind: 'loop', variant: v })), ['varianta 1/10', 'varianta 5/10', 'varianta 10/10', 'varianta 1/10', 'varianta 4/10']);
  assert.equal(T.variantTxt({ kind: 'train', variant: 2 }), '', 'u nádraží počet variant neznáme');
  assert.equal(T.variantTxt({ kind: 'loop' }), '');
  assert.match(T.routeHtml(ROUTE({ variant: 6 }), BCN_C, '2026-10-12'), /🔄 Jiná trasa<\/button><span class="faint route-var">varianta 7\/10<\/span>/);
  assert.ok(!T.routeHtml(ROUTE({ kind: 'train', variant: 1, station: { name: 'Vic', lat: 41.93, lon: 2.25, cc: 'ES' }, train: { googleUrl: 'https://www.google.com/maps/dir/?api=1' } }), BCN_C, '2026-10-12').includes('route-var'));

  const e3 = T.emptyHtml(3, 'city');
  assert.match(e3, /V okruhu 3 km jsem nic zajímavého nenašel\./);
  assert.match(e3, /data-rad="20">Zvětšit okruh na 20 km</, 'rovnou největší okruh – menší pak filtruje prohlížeč');
  assert.deepEqual([...e3.matchAll(/data-mode="(\w+)"/g)].map((m) => m[1]), ['day', 'bike', 'hike']);
  assert.match(T.emptyHtml(20, 'city'), /data-rad="100">Zvětšit okruh na 100 km</, 'z největšího okruhu ve městě místa v okolí do 100 km');
  assert.match(T.emptyHtml(50, 'city'), /data-rad="100"/);
  assert.ok(!T.emptyHtml(100, 'city').includes('data-rad'), 'větší okruh už není');
  assert.ok(!T.emptyHtml(5, 'bike').includes('data-mode'), 'v jiném režimu bez tipu na režimy');
  // prázdný program ve městě: větší okruh jen do 20 km (program dál nebere), vždy tip na jiný režim
  const p3 = T.planEmptyHtml(3);
  assert.match(p3, /Program není z čeho sestavit – v okruhu 3 km nejsou žádná místa\./);
  assert.match(p3, /data-rad="20">Zvětšit okruh na 20 km</);
  assert.deepEqual([...p3.matchAll(/data-mode="(\w+)"/g)].map((m) => m[1]), ['day', 'bike', 'hike']);
  assert.ok(!T.planEmptyHtml(50).includes('data-rad'), 'z 50 km má program stejně jen místa do 20 km');
  assert.match(T.planEmptyHtml(50), /v okruhu 20 km/);

  const blank = T.blankHtml(BCN_C);
  assert.match(blank, /🗺️ Mapa se nenačetla/);
  assert.match(blank, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Barcelona%2C%20%C5%A0pan%C4%9Blsko"[^>]*>Otevřít v Google Maps ↗/);
  assert.ok(!T.blankHtml({}).includes('<a'), 'bez názvu místa bez odkazu');

  const en = 'La Boqueria is a large public market in the Ciutat Vella district of Barcelona, Catalonia, Spain. It is one of the city\'s foremost tourist landmarks.';
  assert.ok(T.looksEnglish(en));
  assert.ok(!T.looksEnglish('Barokní kostel na Malé Straně, který je jednou z nejvýznamnějších staveb v Praze.'));
  assert.ok(!T.looksEnglish('El Mercat de Sant Josep de la Boqueria és un mercat municipal de Barcelona.'), 'katalánsky ne');
  assert.match(T.descHtml(en, undefined), /^<span class="poi-lang"[^>]*>anglicky<\/span> La Boqueria is a large public market in the Ciutat Vella district of Barcelona, Catalonia, Spain\.$/);
  assert.ok(!T.descHtml(en, 'cs').includes('poi-lang'), 'server řekl česky – věříme mu');
});

test('povrch trasy: dva pruhy, každý přesně do 100 % (údaje serveru se překrývají)', () => {
  const sum = (row) => row.parts.reduce((a, x) => a + x.pct, 0);
  const view = (r) => plain(T.surfaceRows(r)).map((row) => [row.label, row.parts.map((x) => `${x.name} ${x.pct}`)]);
  // Barcelona (živě 10. 10.): „35 % nezpevněné · 81 % cyklostezky“ – dohromady 116 %
  assert.deepEqual(view(ROUTE({ unpavedPct: 35, cyclePct: 81, busyPct: 0 })), [
    ['Povrch', ['zpevněný 65', 'nezpevněný 35']],
    ['Cesta', ['cyklostezky a cyklotrasy 81', 'ostatní silnice a cesty 19']],
  ]);
  for (const row of T.surfaceRows(ROUTE({ unpavedPct: 35, cyclePct: 81, busyPct: 0 }))) assert.equal(sum(row), 100);
  // Praha: „4 % nezpevněné · 68 % cyklostezky · 24 % rušnější silnice“
  assert.deepEqual(view(ROUTE({ unpavedPct: 4, cyclePct: 68, busyPct: 24 }))[1][1], ['cyklostezky a cyklotrasy 68', 'ostatní silnice a cesty 8', 'rušnější silnice 24']);
  // cyklopruh po rušné silnici: přednost má varování, součet zůstane 100
  assert.deepEqual(plain(T.surfaceRows(ROUTE({ cyclePct: 81, busyPct: 30 }))[1].parts.map((x) => [x.k, x.pct])), [['cycle', 70], ['busy', 30]]);
  // pěšky: značené trasy / ostatní / silnice bez chodníku (s vysvětlivkou); rušnější silnice zvlášť větou
  const hike = ROUTE({ activity: 'hike', trailPct: 60, unpavedPct: 45, roadPct: 10, busyPct: 12 });
  assert.deepEqual(view(hike)[1][1], ['značené turistické trasy 60', 'ostatní cesty a ulice 30', 'silnice bez chodníku 10']);
  const h = T.surfaceHtml(hike);
  assert.match(h, /<span title="Silnice s provozem aut[^"]*"><i[^>]*><\/i>silnice bez chodníku 10 %<\/span>/);
  assert.match(h, /Podél rušnější silnice \(i s chodníkem\) vede 12 % trasy\./);
  assert.ok(!T.surfaceHtml(ROUTE({ busyPct: 12 })).includes('surf-note'), 'na kole je rušnější silnice v pruhu');
  // nesmysly a chybějící údaje nic nerozbijí
  for (const row of T.surfaceRows({ activity: 'bike', unpavedPct: 140, cyclePct: -5, busyPct: 'x' })) assert.equal(sum(row), 100);
  assert.deepEqual(view({})[0][1], ['zpevněný 100']);
  assert.match(T.surfaceHtml(ROUTE()), /<span class="surf-bar"><i style="width:65%;background:#94a3b8"><\/i><i style="width:35%;background:#b45309"><\/i><\/span>/);
  assert.match(T.routeHtml(ROUTE(), BCN_C, '2026-10-12'), /class="surf"/);
});

test('Mapy.com: logo u návrhů z Mapy.com; trasa ze zálohy Mapy.com bez rozboru povrchu, s logem, bez stoupání, když chybí výšky', () => {
  const sug = T.sugHtml([{ label: 'Karlštejn', sub: 'Hrad · Středočeský kraj', flag: '🇨🇿', src: 'mapy' }, { label: 'Praha' }], 0, false);
  assert.match(sug, /<div class="pi-by"><a class="mapy-by" href="https:\/\/mapy\.com\/" target="_blank" rel="noopener">Hledají i <img src="https:\/\/api\.mapy\.com\/img\/api\/logo\.svg" alt="Mapy\.com" height="14"><\/a><\/div>$/);
  assert.equal(sug.match(/data-i=/g).length, 2, 'řádek s logem není návrh');
  assert.ok(!T.sugHtml([{ label: 'Praha' }], 0, false).includes('mapy'), 'bez Mapy.com bez loga');
  const NIL = { unpavedPct: null, cyclePct: null, trailPct: null, roadPct: null, busyPct: null, source: 'mapy' };
  const h = T.routeHtml(ROUTE(NIL), BCN_C, '2026-10-12');
  assert.ok(!h.includes('class="surf"'), 'povrch Mapy.com nevrací – žádné pruhy „zpevněný 100 %“');
  assert.match(h, /Trasa: <a class="mapy-by" href="https:\/\/mapy\.com\/"[^>]*>Plánují <img[^>]*alt="Mapy\.com"/);
  assert.match(h, /BRouter teď neodpovídá/);
  assert.match(h, /↗ 320 m stoupání/);
  assert.match(h, /<summary>Jak počítám<\/summary>Výšky jsou z výškového profilu Mapy\.com\./);
  const noEle = T.routeHtml(ROUTE({ ...NIL, ascent: null, descent: null, kind: 'train', station: { name: 'Vic', lat: 41.93, lon: 2.25, cc: 'ES' }, train: { googleUrl: 'https://www.google.com/maps/dir/?api=1' } }), BCN_C, '2026-10-12');
  assert.ok(!/stoupání|klesání|null/.test(noEle.replace(/výškového profilu/g, '')), 'bez výšek žádné „↗ null m“');
  assert.match(noEle, /Nádraží: Wikidata\. Trasa: <a class="mapy-by"/);
  // stará uložená trasa bez údajů o povrchu vypadá jako dřív
  assert.match(T.routeHtml(ROUTE({ unpavedPct: undefined }), BCN_C, '2026-10-12'), /class="surf"/);
});

test('návrat po setmění: výlet s návratem po západu slunce, kolo a pěšky podle délky (start 9:00)', async () => {
  // 15 min před západem už varuje (za šera); čas bez údaje nic nehlásí
  assert.deepEqual([['19:25', '19:19'], ['19:05', '19:19'], ['19:04', '19:19'], ['17:00', '19:19'], ['19:25', null], ['', '19:19']].map(([a, b]) => T.afterDark(a, b)),
    [true, true, false, false, false, false]);
  const bike = T.routeBack(ROUTE({ minutes: 150 }), BCN_C);
  assert.deepEqual(plain(bike), { train: 0, back: 9 * 60 + 150 + 23 });
  assert.equal(T.toHm(bike.back), '11:53');
  // vlakem tam: Vic je ~60 km vzdušnou čarou → vlakem ~1 h 33 min (60 km/h po trati 1,3× delší, + 15 min)
  const tr = T.routeBack(ROUTE({ kind: 'train', minutes: 240, station: { name: 'Vic', lat: 41.9301, lon: 2.2549 } }), BCN_C);
  assert.ok(tr.train >= 85 && tr.train <= 100, String(tr.train));
  assert.equal(tr.back, 540 + tr.train + 240 + 36);
  assert.equal(T.sunSlot(BCN_C, '2026-10-12', '19:25'), '', 'bez weather.js nic');

  // s weather.js: místo pro varování u trasy (týž bod jako počasí) a u jednodenního výletu s návratem
  const sunsets = [];
  const W = { sunsets: async (pts) => { sunsets.push(pts.map((p) => `${p.lat},${p.lon}@${p.date}`)); return pts.map(() => '19:19'); } };
  const els = [];
  const TW = load({ window: { Weather: W }, byIso: { ES: { cs: 'Španělsko' } }, $$: () => els }).window.Places._t;
  const rh = TW.routeHtml(ROUTE({ minutes: 600 }), BCN_C, '2026-10-12');
  const slot = rh.match(/<div class="sun-slot" data-sun="([^"]+)" data-note="([^"]+)"><\/div>/);
  assert.ok(slot, 'trasa má místo pro varování');
  assert.equal(slot[1], '41.3874,2.1686,2026-10-12,20:30', '10 h v sedle + 1,5 h přestávek');
  assert.equal(slot[2], 'Počítám se startem v 9:00 a s přestávkami – zpět kolem 20:30.');
  // návrat po půlnoci (dlouhá jízda na horském kole): dřív „00:20“ → před západem slunce → bez varování
  const late = TW.routeHtml(ROUTE({ minutes: 800 }), BCN_C, '2026-10-12').match(/data-sun="([^"]+)" data-note="([^"]+)"/);
  assert.equal(late[1], '41.3874,2.1686,2026-10-12,23:59');
  assert.equal(late[2], 'Počítám se startem v 9:00 a s přestávkami – zpět kolem 00:20 (po půlnoci).');
  assert.ok(TW.afterDark('23:59', '19:19'));
  const trip = tripOf('day', 'car', [DAY('2026-10-12', { name: 'Barcelona', lat: 41.3874, lon: 2.1686 }, [STOP('Q190', 'Montserrat', 41.5933, 1.8375, { score: 70 })])]);
  assert.match(TW.tripHtml(trip, BCN_C), /data-sun="41\.5933,1\.8375,2026-10-12,19:25"/);
  const loop = tripOf('loop', 'car', [DAY('2026-10-12', { name: 'Barcelona', lat: 41.3874, lon: 2.1686 }, [STOP('Q13985', 'Vic', 41.9301, 2.2549)], null)]);
  assert.ok(!TW.tripHtml(loop, BCN_C).includes('data-sun'), 'den s přespáním se nevrací');

  // doplnění: varuje jen pozdní návrat; překreslené (odpojené) místo nechá být
  const el = (sun, note = '', isConnected = true) => ({ dataset: { sun, note }, isConnected, innerHTML: 'x' });
  els.push(el('41.39,2.17,2026-10-12,19:25'), el('41.39,2.17,2026-10-12,17:40'), el('41.39,2.17,2026-10-12,20:10', '', false), el('41.39,2.17,2026-10-12,19:30', 'Počítám se startem v 9:00.'));
  await TW.fillSun({});
  assert.equal(sunsets.length, 1, 'jeden dotaz na všechna místa');
  assert.equal(els[0].innerHTML, '<div class="note warn">🌇 <div>Návrat po setmění (západ slunce 19:19) – vyraz dřív nebo zkrať trasu.</div></div>');
  assert.equal(els[1].innerHTML, '');
  assert.equal(els[2].innerHTML, 'x');
  assert.match(els[3].innerHTML, /zkrať trasu\. <span class="faint">Počítám se startem v 9:00\.<\/span>/);
});

test('uložení do plánovače: stejné místo a začátek → přidat k cestě (bez opakování), jinak nová', () => {
  const TB = load({ byIso: { ES: { cs: 'Španělsko' } } }).window.Places._t;
  const place = { ...BCN_C };
  const items = BCN.items.filter((x) => x.category !== 'daytrip').slice(0, 2);
  const plan = { days: [{ date: '2026-10-12', items }, { date: '2026-10-13', items: [] }, { date: '2026-10-14', items: [items[0]] }] };
  const city = TB.plannerEntry({ plan, place, start: '2026-10-12' });
  assert.deepEqual(plain(city), {
    name: 'Výlet: Barcelona', dest: 'Barcelona', iso: 'ES', start: '2026-10-12', end: '2026-10-14',
    days: { '2026-10-12': items.map((x) => x.name), '2026-10-14': [items[0].name] }, notes: '', src: 'city',
  });
  const trip = tripOf('day', 'car', [DAY('2026-10-12', { name: 'Barcelona', lat: 41.3874, lon: 2.1686 }, [STOP('Q190', 'Montserrat', 41.5933, 1.8375, { tripKind: 'monastery' })])]);
  const day = TB.plannerEntry({ trip, place, start: '2026-10-12' });
  assert.equal(day.name, 'Výlety z: Barcelona');
  assert.deepEqual(plain(day.days['2026-10-12']), ['⛪ Montserrat (příjezd ~10:00)', '🏁 Zpět na start (Barcelona) ~19:25']);
  const bike = TB.plannerEntry({ rr: ROUTE({ km: 30.7 }), place, start: '2026-10-12' });
  assert.equal(bike.name, 'Na kole z: Barcelona – 30,7 km');
  assert.match(bike.notes, /^Trasa v Mapy\.com: https:\/\/mapy\.com\/.*\nGoogle Maps: https:\/\/www\.google\.com\/maps\/dir\//);

  // v plánovači už je program z Barcelony od 12. 10. → výlety, kolo i druhé uložení jdou k němu
  const trips = [{ name: 'Léto', dest: 'Lisabon', start: '2026-10-12', end: '2026-10-14', days: {} }, { ...plain(city), pax: '2' }];
  assert.equal(TB.findTripFor(trips, day), 1);
  assert.equal(TB.findTripFor(trips, { ...day, dest: ' barcelona ' }), 1, 'velikost písmen a mezery nevadí');
  // jiný začátek v termínu cesty (12.–14. 10.) = k té cestě (dřív druhá překrývající se cesta); mimo termín nová
  assert.equal(TB.findTripFor(trips, { ...day, start: '2026-10-13' }), 1, 'den v termínu cesty do stejného místa');
  assert.equal(TB.findTripFor(trips, { ...day, start: '2026-10-20' }), -1, 'mimo termín = jiná cesta');
  assert.equal(TB.findTripFor([{ dest: 'Barcelona' }, null], day), -1, 'cesta bez data nic');
  // cesta přes víc míst (z průvodce): den programu Girony v jejím termínu patří k ní, i když cíl cesty je Barcelona
  const bases = ['Barcelona', 'Girona'].map((name, i) => ({ name, lat: 41.39 + i / 2, lon: 2.17, cc: 'ES', country: 'Španělsko' }));
  const route = { name: 'Katalánsko', dest: 'Barcelona', start: '2026-10-12', end: '2026-10-16', days: {},
    wizard: { flight: { out: { date: '2026-10-12' } }, dest: { label: 'Barcelona', lat: 41.39, lon: 2.17, cc: 'ES' }, route: { mode: 'multi', bases } } };
  assert.equal(TB.findTripFor([trips[0], route], { ...day, dest: 'Girona', start: '2026-10-14' }), 1, 'místo trasy v termínu cesty');
  assert.equal(TB.findTripFor([trips[0], route], { ...day, dest: 'Sevilla', start: '2026-10-14' }), -1, 'jiné místo ne');
  const t = trips[1];
  assert.equal(TB.mergeInto(t, day), 2);
  assert.equal(TB.mergeInto(t, bike), 1);
  assert.equal(TB.mergeInto(t, day), 0, 'podruhé totéž nic nepřidá');
  assert.deepEqual(plain(t.days['2026-10-12']), [...items.map((x) => x.name), '⛪ Montserrat (příjezd ~10:00)', '🏁 Zpět na start (Barcelona) ~19:25', bike.days['2026-10-12'][0]]);
  assert.equal(t.notes, bike.notes);
  TB.mergeInto(t, bike);
  assert.equal(t.notes, bike.notes, 'poznámky se neopakují');
  // okruh na víc dní prodlouží konec cesty
  TB.mergeInto(t, { days: { '2026-10-16': ['🛏️ Přespání: Girona'] }, end: '2026-10-16', notes: '' });
  assert.equal(t.end, '2026-10-16');
  // přeplánovaný program uložený znovu nahradí ten starý: vyřazené místo zmizí, nic není dvakrát; ruční řádek zůstane
  const y = { name: 'Y', dest: 'Barcelona', start: '2026-10-12', end: '2026-10-14', days: {} };
  TB.mergeInto(y, city);
  y.days['2026-10-12'].push('Večeře u Pepy');
  const city2 = { ...city, days: { '2026-10-12': [items[1].name], '2026-10-13': [items[0].name] } };
  assert.equal(TB.mergeInto(y, city2), 1, 'nové jen místo na nový den');
  assert.deepEqual(plain(y.days), { '2026-10-12': [items[1].name, 'Večeře u Pepy'], '2026-10-13': [items[0].name] }, 'zůstávající místo na svém místě');
  // cesta z průvodce už má program: místa z Objevuj, která tam jsou (i jiný den, s poznámkou nebo s místem trasy), se neopakují
  const wz = { name: 'Řím', dest: 'Barcelona', start: '2026-10-12', end: '2026-10-14', wizard: {}, days: { '2026-10-12': [`${items[0].name} – otevřeno 9–19`], '2026-10-13': [`Barcelona: ${items[1].name}`] } };
  const city3 = { ...city, days: { '2026-10-12': [items[1].name, 'Nové místo'], '2026-10-13': [items[0].name] } };
  assert.equal(TB.mergeInto(wz, city3), 1);
  assert.deepEqual(plain(wz.days), { '2026-10-12': [`${items[0].name} – otevřeno 9–19`, 'Nové místo'], '2026-10-13': [`Barcelona: ${items[1].name}`] });
  // za své (t.explore) Objevuj bere jen řádky, které přidalo: program z průvodce další uložení nesmaže ani nepřesune
  assert.deepEqual(plain(wz.explore.city), { '2026-10-12': ['Nové místo'] });
  const pre = { name: 'P', dest: 'Barcelona', start: '2026-10-12', end: '2026-10-14', wizard: {}, days: { '2026-10-12': [items[0].name] } };
  TB.mergeInto(pre, city);
  TB.mergeInto(pre, { ...city, days: { '2026-10-13': [items[1].name] } });
  assert.deepEqual(plain(pre.days), { '2026-10-12': [items[0].name], '2026-10-13': [items[1].name] }, 'řádek z průvodce zůstal na svém dni');
  // cesta uložená starší verzí (t.explore = celý výsledek i s řádky z průvodce): řádek z průvodce (genDays) dál na svém dni
  const old = { name: 'O2', dest: 'Barcelona', start: '2026-10-12', end: '2026-10-14', wizard: {}, days: { '2026-10-12': [items[0].name, items[1].name] },
    genDays: { '2026-10-12': [items[0].name] }, explore: { city: { '2026-10-12': [items[0].name, items[1].name] } } };
  TB.mergeInto(old, { ...city, days: { '2026-10-14': [items[0].name, items[1].name] } });
  assert.deepEqual(plain(old.days), { '2026-10-12': [items[0].name], '2026-10-14': [items[1].name] });
  assert.deepEqual(plain(old.explore.city), { '2026-10-14': [items[1].name] });
  // stejný název u jiného místa trasy („Porto: …“ u programu Barcelony) není duplicita
  const other = { name: 'O', dest: 'Barcelona', start: '2026-10-12', end: '2026-10-14', wizard: {}, days: { '2026-10-13': [`Porto: ${items[0].name}`] } };
  assert.equal(TB.mergeInto(other, { ...city, days: { '2026-10-12': [items[0].name] } }), 1);
  const x = { name: 'X', start: '2026-10-12', end: '2026-10-20', days: null };
  TB.mergeInto(x, city);
  assert.equal(x.end, '2026-10-20', 'kratší výsledek konec nezkrátí');
  assert.deepEqual(Object.keys(x.days), ['2026-10-12', '2026-10-14']);

  // „Jiná trasa“ uložená znovu: odkazy na nahrazenou trasu z poznámek pryč (ruční text zůstane), název podle nové délky
  const r0 = TB.plannerEntry({ rr: ROUTE({ km: 40, mapyUrl: 'https://mapy.com/fnc/v1/route?v=0', googleUrl: 'https://www.google.com/maps/dir/?api=1&v=0' }), place, start: '2026-10-12' });
  const z = { ...r0, explore: { [r0.src]: r0.days }, exploreNotes: { [r0.src]: r0.notes }, genName: r0.name }; // jako store() u nové cesty
  z.notes += '\n\nVzít duši navíc';
  for (const v of [1, 2]) {
    const rv = TB.plannerEntry({ rr: ROUTE({ km: 40 + 3 * v, mapyUrl: `https://mapy.com/fnc/v1/route?v=${v}`, googleUrl: `https://www.google.com/maps/dir/?api=1&v=${v}` }), place, start: '2026-10-12' });
    TB.mergeInto(z, rv);
  }
  assert.equal((z.notes.match(/Trasa v Mapy\.com/g) || []).length, 1, z.notes);
  assert.ok(z.notes.includes('route?v=2') && !z.notes.includes('route?v=0') && !z.notes.includes('route?v=1'));
  assert.ok(z.notes.includes('Vzít duši navíc'));
  assert.equal(z.name, 'Na kole z: Barcelona – 46 km');
  assert.deepEqual(plain(Object.values(z.days).flat()), [z.days['2026-10-12'][0]]);
  assert.match(z.days['2026-10-12'][0], /46 km/);
  // přejmenovaná cesta zůstane, jiný druh výsledku název nemění
  z.name = 'Kolo s Petrem';
  TB.mergeInto(z, TB.plannerEntry({ rr: ROUTE({ km: 30 }), place, start: '2026-10-12' }));
  assert.equal(z.name, 'Kolo s Petrem');
  const w = { ...plain(city), genName: city.name };
  TB.mergeInto(w, bike);
  assert.equal(w.name, 'Výlet: Barcelona');

  // tlačítko: „Přidat k cestě …“ + „uložit jako novou“, jinak „Uložit do Mých cest“
  assert.match(TB.saveHtml(1, trips), /💾 Přidat k cestě Výlet: Barcelona<\/button><button type="button" class="linkbtn ex-savenew" id="exSaveNew">uložit jako novou</);
  assert.equal(TB.saveHtml(-1, trips), '<button class="btn" id="exSave">💾 Uložit do Mých cest</button>');
  const long = TB.saveHtml(0, [{ name: `Dlouhá cesta ${XSS} po celém Španělsku a Portugalsku` }]);
  assert.ok(!long.includes('<img src=x'));
  assert.match(long, /…<\/button>/);
});

test('výlety do dnů, které už mají program: upozornění (busyDays) – vlastní řádky stejného druhu se nepočítají', () => {
  const TB = load({ byIso: {} }).window.Places._t;
  const t = { days: { '2026-11-21': ['Koloseum', 'Forum'], '2026-11-22': ['⛪ Tivoli (příjezd ~10:00)'] }, explore: { 'day-car': { '2026-11-22': ['⛪ Tivoli (příjezd ~10:00)'] } } };
  const e = { src: 'day-car', days: { '2026-11-21': ['🏰 Ostia'], '2026-11-22': ['⛪ Tivoli (příjezd ~10:00)'], '2026-11-23': ['🏖️ Sperlonga'] } };
  assert.deepEqual(plain(TB.busyDays(t, e)), ['2026-11-21'], 'den s programem města; přeplánovaný výlet ne');
  assert.deepEqual(plain(TB.busyDays(t, { ...e, src: 'city' })), [], 'program města sám sebe nehlásí');
  assert.deepEqual(plain(TB.busyDays({ days: null }, e)), []);
  assert.match(src('places.js'), /pozor, \$\{busy\.map\(dayLbl\)\.join\(', '\)\} už \$\{busy\.length > 1 \? 'mají' : 'má'\} program/);
});

test('„Najít lety sem“: místo jako cíl letů, termín jen vybraný v Objevuj', () => {
  const TF = T;
  assert.deepEqual(plain(TF.flyTarget({ ...BCN_C, label: 'Barcelona' })), { id: 'geo:41.3874,2.1686|Barcelona', label: 'Barcelona', flag: '🇪🇸', type: 'place' });
  assert.equal(TF.flyTarget({ lat: 50, lon: 14, label: 'Moje okolí', geo: true }), null, 'z vlastní polohy se neletí');
  assert.equal(TF.flyTarget({ lat: 'x', lon: 14, label: 'X' }), null);
  assert.equal(TF.flyTarget({ lat: 48.81, lon: 14.32, label: 'Český Krumlov', cc: 'CZ' }), null, 'do Česka se neletí – bez ✈️ Najít lety sem');
  assert.equal(TF.flyTarget({ lat: 1, lon: 2, label: 'A|B<"x">' }).id, 'geo:1.0000,2.0000|ABx', 'oddělovač a značky z názvu pryč');
  // místo v Česku: místo letů 🚆 Spojení v IDOS z domova (termín jen vybraný)
  const CK = { lat: 48.81, lon: 14.32, label: 'Český Krumlov', cc: 'CZ' };
  assert.equal(TF.idosUrl(CK, 'Praha'), 'https://idos.cz/vlakyautobusy/spojeni/?f=Praha&t=%C4%8Cesk%C3%BD+Krumlov&submit=true');
  assert.equal(TF.idosUrl(CK, 'Praha', '2026-11-07'), 'https://idos.cz/vlakyautobusy/spojeni/?f=Praha&t=%C4%8Cesk%C3%BD+Krumlov&date=7.11.2026&time=7%3A00&submit=true');
  assert.equal(TF.idosUrl(CK, ''), 'https://idos.cz/vlakyautobusy/spojeni/?t=%C4%8Cesk%C3%BD+Krumlov', 'bez domova jen cíl, odkud doplní uživatel');
  assert.equal(TF.idosUrl({ ...CK, label: 'Praha' }, 'praha'), null, 'z Prahy do Prahy ne');
  assert.equal(TF.idosUrl({ ...CK, label: 'Krkonoše', nature: 'range' }, 'Praha'), null, 'pohoří není zastávka');
  assert.equal(TF.idosUrl({ ...BCN_C, label: 'Barcelona' }, 'Praha'), null, 'do zahraničí ✈️, ne IDOS');
  assert.equal(TF.idosUrl({ lat: 50, lon: 14, label: 'Moje okolí', cc: 'CZ', geo: true }, 'Praha'), null);
  // park, UNESCO nebo oblast z přehledu Česka (🔎 Prozkoumat) – IDOS je nezná („Takové místo neznáme“); značka přežije obnovení
  assert.equal(TF.idosUrl({ ...CK, label: 'Krkonošský národní park', poi: true }, 'Praha'), null);
  assert.equal(TF.cleanPlace({ ...CK, poi: true }).poi, true);
  assert.equal(TF.cleanPlace({ ...CK, poi: 'x' }).poi, undefined);
  // odkud: domov jako město, obec i letiště (návrh letiště má název města), ne země ani oblast
  const home = (h) => load({ S: { home: { from: [h] } } }).window.Places._t.homeCity();
  assert.equal(home({ id: 'geo:50.0880,14.4208|Praha', type: 'city', label: 'Praha' }), 'Praha');
  assert.equal(home({ id: 'ap:BRQ', type: 'airport', label: 'Brno' }), 'Brno');
  assert.equal(home({ id: 'BRQ', type: 'airport', label: 'Brno (BRQ)' }), 'Brno', 'starší tvar s kódem v závorce');
  assert.equal(home({ id: 'cc:CZ', type: 'country', label: 'Česko' }), '');
  assert.equal(home({ id: 'rg:kreta', type: 'region', label: 'Kréta' }), '');
  assert.equal(load().window.Places._t.homeCity(), '', 'bez nastavení domova');
  const s = { mode: 'city', start: '2026-10-20', days: 4, tripDays: { day: 2, loop: 5 } };
  assert.deepEqual(plain(TF.flyDates(s)), { xOut: '2026-10-20', xBack: '2026-10-23' });
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'loop' })), { xOut: '2026-10-20', xBack: '2026-10-24' });
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'day', tripDays: { day: 1 } })), { xOut: '2026-10-20', xBack: '2026-10-20' });
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'bike' })), { xOut: '2026-10-20' }, 'kolo: jen let tam');
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'hike' })), { xOut: '2026-10-20' });
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'hike', hike: { kind: 'loop' } })), { xOut: '2026-10-20' }, 'jedna túra: jen let tam');
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'hike', hike: { kind: 'days' }, days: 5 })), { xOut: '2026-10-20', xBack: '2026-10-24' }, 'túry na každý den: tam i zpět');
  // vlakem tam, na kole zpět: odkaz do IDOS ze serveru na zvolený den v 7:00 (server datum nezná)
  const I = 'https://idos.cz/vlakyautobusy/spojeni/?f=Praha&t=Beroun';
  assert.equal(TF.idosOn(I, '2026-11-07'), `${I}&date=7.11.2026&time=7%3A00`);
  assert.equal(TF.idosOn(`${I}&date=1.1.2027`, '2026-11-07'), `${I}&date=1.1.2027`, 'datum už má – beze změny');
  assert.equal(TF.idosOn(I, ''), I);
  assert.equal(TF.idosOn('https://www.google.com/maps/dir/?api=1', '2026-11-07'), 'https://www.google.com/maps/dir/?api=1', 'jen IDOS');
  assert.equal(TF.idosOn(undefined, '2026-11-07'), undefined);
});

test('Naplánovat: volby během skládání prvního plánu se nezahodí, S dětmi přeplánuje i túry, Vrátit nezašedí jiný režim', () => {
  const pl = src('places.js');
  // zájmy, „chci vidět“ a jeho zrušení: i program, který se teprve skládá (busy.city); výlety i ten, který se skládá
  assert.equal((pl.match(/if \(ex\.plan \|\| busy\.city\) replanSoon\('city'\);/g) || []).length, 3);
  assert.doesNotMatch(pl, /if \(ex\.plan\) replanSoon\('city'\)/);
  assert.match(pl, /if \(trip \|\| busy\[seqKey\]\) replanSoon\(seqKey\);/);
  // 🧒 S dětmi v programu ve městě: túry zešednou a po návratu do Pěšky se přeplánují (redo jako po změně termínu)
  assert.match(pl, /if \(b\.dataset\.int === 'kids' && \(ex\.hikePlan \|\| busy\.hikes\)\) \{ if \(busy\.hikes\) \{ replanSeq\.hikes\+\+; delete busy\.hikes; \} redo\.add\('hikes'\); \}\s*if \(ex\.plan \|\| busy\.city\) replanSoon\('city'\);/);
  // replan jiného režimu (↩ Vrátit po přepnutí) tlačítka zobrazeného režimu nezašedí
  assert.match(pl, /if \(curKey\(\) === key\) \{\s*\$\$\('#exPlan, #routeOther', body\)\.forEach\(x => \{ x\.disabled = true; \}\);/);
  // IDOS u vlaku s datem i v kartě i v poznámkách uložené cesty
  assert.match(pl, /link\(idosOn\(r\.train\.idosUrl, date\), 'spojení na IDOS ↗'\)/);
  assert.match(pl, /Spojení vlakem: \$\{idosOn\(rr\.train\.idosUrl, day\) \|\| rr\.train\.googleUrl\}/);
});

// 🔎 Co tam je (flights.js): „Co vidět“ z míst Objevuj, stejný dotaz jako Objevuj, předání do Objevuj (Places.openAt).
const PV = (name, score, image = null, extra = {}) => ({ id: name, name, score, image, category: 'museum', categoryLabel: 'Muzeum', distanceKm: 1.2, ...extra });
const IMG = 'https://commons.wikimedia.org/wiki/Special:FilePath/X.jpg?width=500';
const ymdIn = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('náhled cíle: 6 nejlepších míst ve městě, napřed s fotkou, bez fotky jen doplní, výlety ne', () => {
  const items = [PV('A', 50), PV('B', 40, IMG), PV('Výlet', 99, IMG, { category: 'daytrip' }), PV('C', 30, IMG), PV('D', 20, IMG), PV('F', 45),
    PV('E', 10, IMG), PV('G', 5), PV('H', 1), null, { id: 'bez jména', score: 70, image: IMG }];
  assert.deepEqual(plain(T.previewPick(items).map((x) => x.name)), ['B', 'C', 'D', 'E', 'A', 'F']);
  // s fotkou aspoň 6 → jen ta, podle skóre (i když server pošle jiné pořadí)
  const many = [PV('bez fotky', 100), ...Array.from({ length: 8 }, (_, i) => PV(`P${i}`, i, IMG))];
  assert.deepEqual(plain(T.previewPick(many).map((x) => x.name)), ['P7', 'P6', 'P5', 'P4', 'P3', 'P2']);
  assert.deepEqual(plain(T.previewPick(items, 2).map((x) => x.name)), ['B', 'C']);
  assert.deepEqual(plain(T.previewPick(undefined)), []);
  assert.deepEqual(plain(T.previewPick([PV('Výlet', 9, IMG, { category: 'daytrip' })])), []);
  // skutečná místa Barcelony (bez fotek a skóre v uloženém vzorku): ve městě, v pořadí ze serveru
  const bcn = T.previewPick(BCN.items);
  assert.deepEqual(plain(bcn.map((x) => x.name)), BCN.items.filter((x) => x.category !== 'daytrip').slice(0, 6).map((x) => x.name));
  assert.equal(bcn[0].name, 'Sagrada Família');
});

test('náhled cíle: karta (fotka, druh, jedna věta, anglicky se štítkem), počty česky, nic k vidění', () => {
  const P = load().window.Places;
  const img = "https://upload.wikimedia.org/a b'(c).jpg";
  const card = T.previewCard(PV(XSS, 5, img, { extract: 'Gotická katedrála ze 14. století s věží. Druhá věta už se nevypíše.', unesco: true, distanceKm: 0.8 }));
  assert.ok(!card.includes('<img src=x'), 'název escapovaný');
  // fotka jako vrstva nad ikonou druhu – nenačtená nechá vidět 🏛️, ne prázdný čtverec
  assert.ok(card.includes(`<div class="dp-img has-ph" style="--ph:url('https://upload.wikimedia.org/a%20b%27%28c%29.jpg')" aria-hidden="true">🏛️</div>`), card);
  assert.ok(card.includes('🏛️ Muzeum · UNESCO · 0,8\u00a0km'));
  assert.ok(card.includes('Gotická katedrála ze 14. století s věží.') && !card.includes('Druhá věta'));
  const sv = T.previewCard(PV('Kostel sv. Mikuláše', 5, IMG, { extract: 'Barokní římskokatolický kostel sv. Mikuláše stojí na hlavním náměstí a patří k nejcennějším stavbám města. Postaven v 18. století.', descLang: 'cs' }));
  assert.ok(sv.includes('<span class="dp-pd">Barokní římskokatolický kostel sv. Mikuláše stojí na hlavním náměstí a patří k nejcennějším stavbám města.</span>'), 'česká věta celá, ne „kostel sv.“');
  const arch = T.previewCard(PV('Arc', 5, null, { extract: 'The Arc de Triomphe is a triumphal arch. It was built by the order of Napoleon and is known from its sculptures.' }));
  assert.ok(arch.includes('anglicky</span> The Arc de Triomphe is a triumphal arch.</span>'), 'bez údaje o jazyku: anglický text podle celého úryvku, krácený anglicky');
  const en = T.previewCard(PV('Old Bridge', 5, null, { category: 'bridge', categoryLabel: 'Most', extract: 'The bridge was built in 1566 and is one of the best known sights of the city. It was destroyed in 1993.', descLang: 'en' }));
  assert.ok(en.includes('poi-lang') && en.includes('anglicky') && !en.includes('destroyed'));
  assert.ok(en.includes('<div class="dp-img" aria-hidden="true">🌉</div>'), 'bez fotky ikona druhu');
  assert.ok(!T.previewCard(PV('Bez popisu', 1)).includes('dp-pd'));
  assert.ok(T.previewCard(PV('Bez druhu', 1, null, { category: 'xyz', categoryLabel: '' })).includes('📍 Zajímavosti'));
  assert.deepEqual([[1, 0], [3, 0], [4, 0], [5, 0], [0, 1], [0, 8], [2, 3], [1, 1], [0, 0]].map(([c, t]) => T.moreTxt(c, t)), [
    'Ještě jedno místo najdeš v Objevuj.', 'Další 3 místa najdeš v Objevuj.', 'Další 4 místa najdeš v Objevuj.', 'Dalších 5 míst najdeš v Objevuj.',
    '1 výlet do okolí najdeš v Objevuj.', '8 výletů do okolí najdeš v Objevuj.', 'Další 2 místa a 3 výlety do okolí najdeš v Objevuj.',
    'Ještě jedno místo a 1 výlet do okolí najdeš v Objevuj.', '']);
  const items = Array.from({ length: 9 }, (_, i) => PV(`M${i}`, 9 - i)).concat([PV('Výlet', 1, null, { category: 'daytrip' })]);
  const html = P.previewHtml(items);
  assert.equal((html.match(/class="dp-poi"/g) || []).length, 6);
  assert.ok(html.includes('Další 3 místa a 1 výlet do okolí najdeš v Objevuj.'));
  assert.ok(!P.previewHtml(items.slice(0, 6)).includes('dp-more'), 'všechno vidět – žádné „další“');
  assert.ok(P.previewHtml([]).includes('Do 10 km od centra jsem nenašel nic'));
  P._t.ex.radius = 20;
  assert.ok(P.previewHtml([], 20).includes('Do 20 km od centra'), 'okruh dotazu = zvolený okruh Objevuj');
  P._t.ex.radius = 10;
  assert.ok(P.previewHtml([PV('Výlet', 1, null, { category: 'daytrip' })]).includes('nenašel nic'));
});

test('náhled cíle: stejný dotaz na místa jako výchozí seznam Objevuj (sdílená mezipaměť serveru), znovu bez dotazu, bez sítě v testu', async () => {
  const urls = [];
  const ok = (items) => async (url) => { urls.push(String(url)); return { ok: true, status: 200, json: async () => ({ demo: false, items }) }; };
  const P = load({ fetch: ok([PV('A', 1)]) }).window.Places;
  const BC = { lat: 41.3874, lon: 2.1686 };
  const j = await P.preview(BC);
  assert.deepEqual(plain(j), { items: [PV('A', 1)], demo: false, km: 10 });
  assert.deepEqual(urls, ['api/poi?lat=41.3874&lon=2.1686&radius=10']);
  assert.equal(P._t.ex.radius, P._t.PREVIEW_KM, 'výchozí okruh Objevuj = okruh náhledu');
  assert.equal(P._t.poiUrl(BC, P._t.ex.radius), urls[0], 'Objevuj by se ptalo stejně');
  // znovu otevřený cíl (i s polohou zaokrouhlenou jako na serveru): bez dotazu
  await P.preview({ lat: 41.38741, lon: 2.16862 });
  assert.equal(urls.length, 1);
  // Objevuj (loadExplore) převezme dotaz náhledu pro okruh do 10 km, větší okruh se ptá samo
  assert.ok(P._t.pvFor(BC, 10) && P._t.pvFor(BC, 5) && P._t.pvFor(BC, 3));
  assert.equal(P._t.pvFor(BC, 20), null);
  assert.equal(P._t.pvFor({ lat: 41.4, lon: 2.1686 }, 10), null, 'jiné místo');
  assert.equal(P._t.pvFor(BC, 10, Date.now() + 31 * 60e3), null, 'po 30 min znovu');
  // zvolený větší okruh Objevuj: náhled se ptá stejně jako Objevuj
  const store = { [T.UI_LS]: JSON.stringify({ radius: 20 }) }, u2 = [];
  const P2 = load({ fetch: async (u) => { u2.push(u); return { ok: true, status: 200, json: async () => ({ items: [] }) }; }, localStorage: { getItem: (k) => store[k] ?? null, setItem: () => {} } }).window.Places;
  assert.equal((await P2.preview(BC)).km, 20);
  assert.deepEqual(u2, ['api/poi?lat=41.3874&lon=2.1686&radius=20']);
  // chyba se nepamatuje: další otevření se zeptá znovu
  let n = 0;
  const P3 = load({ fetch: async () => { n++; return n === 1 ? { ok: false, status: 429, json: async () => ({ error: 'Moc dotazů' }) } : { ok: true, status: 200, json: async () => ({ items: [PV('B', 1)] }) }; } }).window.Places;
  await assert.rejects(P3.preview(BC), /Moc dotazů/);
  assert.equal(P3._t.pvFor(BC, 10), null);
  assert.deepEqual(plain((await P3.preview(BC)).items.map((x) => x.name)), ['B']);
  assert.equal(n, 2);
});

test('Places.openAt: Objevuj na městě z náhledu – program ve městě na dny cesty, volby zůstanou, místa z náhledu', async () => {
  const make = (saved, { hold = false } = {}) => {
    const views = [], urls = [], store = saved ? { [T.UI_LS]: JSON.stringify(saved) } : {}, wait = [];
    const res = { ok: true, status: 200, json: async () => ({ items: [PV('A', 3)] }) };
    // Objevuj bez DOM: loadExplore čeká v #exBody, načtený seznam (paintExplore) už #exBody nenajde a nevykresluje se
    const body = { isConnected: true, innerHTML: '' };
    let P = null;
    const ctx = load({ go: (v) => views.push(v), setTimeout, clearTimeout, $: (s) => (s === '#exBody' && !P._t.ex.loaded ? body : null),
      fetch: async (u) => { urls.push(u); if (hold) await new Promise((r) => wait.push(r)); return res; },
      localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } });
    P = ctx.window.Places;
    return { P, views, urls, store, body, go: () => wait.splice(0).forEach((r) => r()) };
  };
  const TPS = { label: 'Trapani', lat: 38.0176, lon: 12.5365, cc: 'IT', country: 'Itálie' };
  const a = make({ mode: 'bike', radius: 5, pace: 'relaxed', interests: ['art'], place: { label: 'Lisabon', lat: 38.72, lon: -9.14, cc: 'PT' } });
  await a.P.preview(TPS); // náhled místa načetl
  assert.equal(a.P.openAt(TPS, { start: ymdIn(10), days: 3 }), true);
  const X = a.P._t.ex;
  assert.deepEqual(plain(X.place), { lat: 38.0176, lon: 12.5365, label: 'Trapani', cc: 'IT', geo: false, country: 'Itálie' });
  assert.deepEqual(plain([X.mode, X.start, X.datePicked, X.days, X.radius, X.pace, [...X.interests]]), ['city', ymdIn(10), true, 3, 5, 'relaxed', ['art']], 'program ve městě na termín cesty, ostatní volby zapamatované');
  assert.deepEqual(a.views, ['explore']);
  assert.equal(X.loaded, null, 'místa načte Objevuj při vykreslení…');
  assert.ok(a.P._t.pvFor(X.place, X.radius), '…z dotazu náhledu (okruh 10 km pokryje zvolených 5 km)');
  await a.P._t.loadExplore(); // renderExplore po go('explore')
  assert.equal(a.urls.length, 1, 'žádný další dotaz');
  assert.deepEqual(plain([X.loaded.radius, X.radius, X.all.map((x) => x.name)]), [10, 5, ['A']], 'načteno 10 km – zvolených 5 km jen vyfiltruje, zvětšení na 10 km se neptá');
  assert.equal(X.loaded.place, X.place);
  const saved = JSON.parse(a.store[T.UI_LS]);
  assert.equal(saved.place.label, 'Trapani');
  assert.equal(saved.mode, 'city');
  assert.deepEqual(saved.recent.map((r) => r.label), ['Trapani'], 'v „Naposledy“');
  // dní pobytu → nejbližší nižší nabízený počet; jen tam = zvolený počet; termín v minulosti se nepřevezme
  const b = make({ days: 2 });
  b.P.openAt(TPS, { start: ymdIn(5), days: 9 });
  assert.deepEqual([b.P._t.ex.days, b.P._t.ex.start], [7, ymdIn(5)]);
  const c = make({ days: 2 });
  c.P.openAt({ ...TPS, country: '' }, { start: ymdIn(-1), days: 0 });
  assert.deepEqual([c.P._t.ex.days, c.P._t.ex.datePicked], [2, undefined]);
  assert.notEqual(c.P._t.ex.start, ymdIn(-1));
  assert.equal(c.P.openAt({ label: '', lat: 1, lon: 2 }), false);
  assert.equal(c.P.openAt({ label: 'X', lat: 'a', lon: 2 }), false);
  assert.deepEqual(c.views, ['explore'], 'neplatné místo Objevuj neotevře');
  // náhled se ještě načítá: Objevuj počká na jeho dotaz, druhý nepošle
  const d = make({ radius: 10 }, { hold: true });
  const pre = d.P.preview(TPS);
  d.P.openAt(TPS, { start: ymdIn(3), days: 2 });
  const ld = d.P._t.loadExplore();
  await new Promise((r) => setImmediate(r));
  assert.equal(d.urls.length, 1);
  assert.ok(d.body.innerHTML.includes('Trapani'), 'mezitím čekání na místa');
  d.go(); await Promise.all([pre, ld]);
  assert.deepEqual(plain([d.urls.length, d.P._t.ex.loaded.radius, d.P._t.ex.all.map((x) => x.name)]), [1, 10, ['A']]);
  // bez náhledu (nebo jiné místo) se Objevuj ptá samo, na zvolený okruh
  const e = make({ radius: 5 });
  await e.P.preview({ ...TPS, lat: 38.2 });
  e.P.openAt(TPS, { start: ymdIn(3), days: 2 });
  await e.P._t.loadExplore();
  assert.deepEqual(e.urls, ['api/poi?lat=38.2&lon=12.5365&radius=10', 'api/poi?lat=38.0176&lon=12.5365&radius=5']);
  assert.equal(e.P._t.ex.loaded.radius, 5);
});

test('náhled cíle se zapamatovaným okruhem 3 km: ukáže a spočítá jen místa, která pak ukáže Objevuj (načte 10 km, jeden dotaz)', async () => {
  // dál od středu vyšší skóre: bez okruhu by náhled vybral jen místa za 3 km
  const items = Array.from({ length: 14 }, (_, i) => PV(`Místo ${i + 1}`, i, IMG, { distanceKm: Math.round((0.3 + i * 0.4) * 10) / 10 }))
    .concat([PV('Výlet do okolí', 99, IMG, { category: 'daytrip', distanceKm: 40 })]);
  const urls = [], store = { [T.UI_LS]: JSON.stringify({ radius: 3, mode: 'city' }) };
  const body = { isConnected: true, innerHTML: '' };
  let P = null;
  P = load({ go: () => {}, setTimeout, clearTimeout, $: (s) => (s === '#exBody' && !P._t.ex.loaded ? body : null),
    fetch: async (u) => { urls.push(u); return { ok: true, status: 200, json: async () => ({ items }) }; },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } }).window.Places;
  const WAW = { label: 'Varšava', lat: 52.2297, lon: 21.0122, cc: 'PL', country: 'Polsko' };
  const j = await P.preview(WAW);
  assert.equal(j.km, 10, 'dotaz jako výchozí Objevuj (sdílená mezipaměť)');
  const html = P.previewHtml(j.items, j.km);
  const names = [...html.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(names, ['Místo 7', 'Místo 6', 'Místo 5', 'Místo 4', 'Místo 3', 'Místo 2'], 'jen do 3 km');
  assert.ok(html.includes('Ještě jedno místo a 1 výlet do okolí najdeš v Objevuj.'));
  // 🗺️ Naplánovat: Objevuj nechá zvolené 3 km a ukáže přesně to, co náhled slíbil
  P.openAt(WAW, { start: ymdIn(4), days: 3 });
  await P._t.loadExplore();
  const X = P._t.ex, shown = T.inRadius(X.all, X.radius), city = shown.filter((x) => x.category !== 'daytrip');
  assert.deepEqual([urls.length, X.radius, X.loaded.radius], [1, 3, 10]);
  assert.equal(city.length, names.length + 1, 'v Objevuj 6 míst z náhledu + „ještě jedno“');
  assert.ok(names.every((n) => city.some((x) => x.name === n)), 'každé místo z náhledu je v Objevuj');
  assert.equal(shown.length - city.length, 1);
  // nic do 3 km: hláška řekne zvolený okruh, ne načtených 10 km
  assert.ok(P.previewHtml(items.slice(8), 10).includes('Do 3 km od centra jsem nenašel nic'));
  // zvolený okruh nad načteným (zvětšený mezitím v Objevuj): náhled slíbí jen to, co načetl
  X.radius = 20;
  assert.ok(P.previewHtml([], 10).includes('Do 10 km od centra'));
});

test('Inspirace: místa rozpracované cesty první („Tvoje cesta“) – jen budoucí let, místa se známou polohou', () => {
  const future = '2099-05-10';
  const trip = (o) => ({ flight: { out: { date: future } }, dest: { label: 'Řím (Itálie)', lat: 41.9, lon: 12.5, cc: 'IT', country: 'Itálie' }, ...o });
  assert.deepEqual(plain(T.tripPlaces(trip())), [{ label: 'Řím', lat: 41.9, lon: 12.5, cc: 'IT', country: 'Itálie', from: future, trip: true }]);
  // let už proběhl / žádná cesta / cíl bez polohy
  assert.deepEqual(plain(T.tripPlaces(trip({ flight: { out: { date: '2001-01-01' } } }))), []);
  assert.deepEqual(plain(T.tripPlaces(null)), []);
  assert.deepEqual(plain(T.tripPlaces(trip({ dest: { label: 'Někde', cc: 'IT' } }))), []);
  // poloha: střed města (cityCenter, jinak město z cesty z letiště), ne letiště cíle (Vídeň 18 km od centra)
  const vie = { label: 'Vídeň', lat: 48.11, lon: 16.57, cc: 'AT', country: 'Rakousko' };
  const at = (o) => plain(T.tripPlaces(trip({ dest: vie, ...o })))[0];
  assert.deepEqual([at({}).lat, at({}).lon], [48.11, 16.57], 'bez středu letiště');
  assert.deepEqual([at({ arrival: { out: { lat: '48.2', lon: 16.37 } } }).lat, at({ arrival: { out: { lat: '48.2', lon: 16.37 } } }).lon], [48.2, 16.37]);
  assert.deepEqual([at({ cityCenter: { lat: 48.21, lon: 16.37 }, arrival: { out: { lat: 1, lon: 1 } } }).lat], [48.21], 'střed z průvodce první');
  assert.deepEqual([at({ cityCenter: { lat: null, lon: 1 } }).lat], [48.11], 'neplatný střed: letiště');
  // trasa přes víc míst: všechna místa (bez opakování, nejvýš 4)
  const bases = ['Řím', 'Florencie', 'Řím', 'Pisa', 'Lucca', 'Siena'].map((name, i) => ({ name, lat: 43 + i / 10, lon: 11, cc: 'IT', country: 'Itálie' }));
  assert.deepEqual(T.tripPlaces(trip({ route: { mode: 'multi', bases } })).map((p) => p.label), ['Řím', 'Florencie', 'Pisa', 'Lucca']);
});

test('Inspirace: cesta kamaráda z odkazu (#trip=), kterou si příjemce neuložil, není „Tvoje cesta“, ale „🔗 Sdílená cesta“', () => {
  const trip = (o) => ({ flight: { out: { date: '2099-05-10' } }, dest: { label: 'Řím (Itálie)', lat: 41.9, lon: 12.5, cc: 'IT', country: 'Itálie' }, ...o });
  const shared = plain(T.tripPlaces(trip({ shared: { on: '2099-04-01' } })));
  assert.deepEqual(shared.map((p) => [p.label, p.trip, p.shared]), [['Řím', true, true]]);
  assert.equal(T.inspSub({ ...shared[0], from: '' }), '🔗 Sdílená cesta');
  // vlastní cesta (i sdílená, kterou si uložil – shared pak zmizí) dál „Tvoje cesta“
  const own = plain(T.tripPlaces(trip()));
  assert.equal(own[0].shared, undefined);
  assert.equal(T.inspSub({ ...own[0], from: '' }), '🧳 Tvoje cesta');
});

test('Inspirace: i nadcházející cesty z plánovače – nejbližší první, proběhlé ne, cesta z průvodce jednou, nejvýš 6 míst', () => {
  const C = load({ byIso: { PT: { cs: 'Portugalsko' }, ES: { cs: 'Španělsko' }, AT: { cs: 'Rakousko' }, IT: { cs: 'Itálie' }, DK: { cs: 'Dánsko' }, FR: { cs: 'Francie' } } }).window.Places._t;
  const wiz = (label, cc, lat, lon, out, o = {}) => ({ created: o.created || 1, flight: { out: { date: out } }, dest: { label, cc, lat, lon, country: '' }, ...o });
  const lis = wiz('Lisabon', 'PT', 38.78, -9.13, '2099-01-03', { created: 11 });
  const bases = ['Barcelona', 'Girona', 'Tarragona'].map((name, i) => ({ name, lat: 41.4 + i / 10, lon: 2.1, cc: 'ES', country: 'Španělsko' }));
  const bcn = wiz('Barcelona', 'ES', 41.39, 2.17, '2099-03-01', { created: 22, route: { mode: 'multi', bases } });
  const rome = wiz('Řím', 'IT', 41.9, 12.5, '2001-10-12', { created: 33 });
  const saved = (w, start, end) => ({ name: w.dest.label, dest: w.dest.label, iso: w.dest.cc, start, end, tripId: w.created, wizard: plain({ ...w, created: undefined }), checklist: [] });
  const trips = [
    saved(bcn, '2099-03-01', '2099-03-06'), saved(rome, '2001-10-12', '2001-10-14'), saved(lis, '2099-01-03', '2099-01-07'),
    { name: 'Vídeň s Janou', dest: 'Vídeň', iso: 'AT', start: '2099-01-20', end: '2099-01-22', checklist: [] }, // jen z plánovače
    { name: 'Léto v Itálii', dest: 'Itálie', iso: 'IT', start: '2099-05-01', end: '2099-05-14', checklist: [] }, // celá země
    { name: 'Kodaň', dest: 'Kodaň', iso: 'DK', start: '2099-08-01', end: '2099-08-03', checklist: [] }, // za limitem
    { name: 'Bez data', dest: 'Paříž', iso: 'FR', start: '', checklist: [] }, { name: 'Bez cíle', dest: '—', start: '2099-01-10', checklist: [] }, null,
  ];
  // v průvodci proběhlý Řím: z plánovače jen nadcházející, nejbližší první
  const own = plain(C.ownPlaces(rome, trips));
  assert.deepEqual(own.map((p) => [p.label, p.from || '', p.trip]), [['Lisabon', '2099-01-03', true], ['Vídeň', '2099-01-20', true],
    ['Barcelona', '', true], ['Girona', '', true], ['Tarragona', '', true], ['Itálie', '2099-05-01', true]]);
  assert.deepEqual([own[0].lat, own[0].shared], [38.78, undefined], 'uložená z průvodce s polohou z kopie cesty');
  assert.equal(C.inspSub({ ...own[0], from: '' }), '🧳 Tvoje cesta');
  assert.deepEqual([own[1].lat, own[1].cc, own[1].country, own[1].whole], [undefined, 'AT', 'Rakousko', undefined], 'jen z plánovače: poloha až po klepnutí');
  assert.equal(own[5].whole, 'IT', 'cíl = země: celá země');
  // známé město z Inspirace s polohou, „Řím, Barcelona“ (víc letů) a „(…)“ v názvu jen první místo
  assert.equal(C.savedPlaces({ dest: 'Kodaň', iso: 'DK', start: '2099-08-01' })[0].lat, 55.6761);
  assert.deepEqual(plain(C.savedPlaces({ dest: 'Řím (Itálie), Barcelona', start: '2099-08-01' })).map((p) => p.label), ['Řím']);
  // rozpracovaná cesta v průvodci (novější než uložená kopie, jiné datum): jen jednou, z průvodce, zařazená podle data
  const lis2 = { ...lis, flight: { out: { date: '2099-04-02' } } };
  const own2 = plain(C.ownPlaces(lis2, trips));
  assert.deepEqual(own2.map((p) => p.label), ['Vídeň', 'Barcelona', 'Girona', 'Tarragona', 'Lisabon', 'Itálie']);
  assert.equal(own2[4].from, '2099-04-02');
  // druhá cesta do stejného města se neopakuje; probíhající cesta (odjezd proběhl, návrat ne) ano
  const more = [...trips, { ...saved(lis, '2099-02-01', '2099-02-03'), tripId: 44 }, { name: 'Kjóto', dest: 'Kjóto', iso: 'JP', start: '2001-01-01', end: '2099-01-01', checklist: [] }];
  assert.deepEqual(plain(C.ownPlaces(null, more)).map((p) => p.label), ['Kjóto', 'Lisabon', 'Vídeň', 'Barcelona', 'Girona', 'Tarragona']);
  // sdílená cesta kamaráda v průvodci zůstane „🔗 Sdílená cesta“, cesty z plánovače jsou vlastní
  const sh = plain(C.ownPlaces(wiz('Paříž', 'FR', 48.86, 2.35, '2099-01-01', { created: 55, shared: { on: '2098-12-01' } }), trips));
  assert.deepEqual(sh.slice(0, 2).map((p) => [p.label, Boolean(p.shared)]), [['Paříž', true], ['Lisabon', false]]);
  assert.equal(C.inspSub({ ...sh[0], from: '' }), '🔗 Sdílená cesta');
  assert.deepEqual(plain(C.ownPlaces(null, null)), []);
});

test('Inspirace: 🔁 města z nedávných hledání letů (nejvýš 2, bez cesty a oblastí); známá s polohou, jiná až po klepnutí', () => {
  const r = (...to) => ({ form: { to } });
  const recent = [
    r({ id: 'rg:kreta', label: 'Kréta', type: 'region', flag: '🏝️' }),
    r({ id: 'metro:LON', label: 'Londýn', type: 'metro', flag: '🇬🇧' }, { id: 'metro:ROM', label: 'Řím', type: 'metro', flag: '🇮🇹' }),
    r({ id: 'ap:LIS', label: 'Lisabon', type: 'airport', flag: '🇵🇹' }),
  ];
  const sp = plain(T.searchedPlaces(['Řím'], recent));
  assert.deepEqual(sp.map((p) => [p.label, p.cc, p.searched, Number.isFinite(p.lat)]), [['Londýn', 'GB', true, false], ['Lisabon', 'PT', true, true]]);
  assert.deepEqual(plain(T.searchedPlaces([], null)), []);
  assert.deepEqual(plain(T.searchedPlaces([], [null, { form: {} }, r({ label: 'Kanada', type: 'country' })])), []);
});

test('okruh 50/100 km: místa ve městě do 20 km + nejzajímavější místa v okolí jen do zvoleného okruhu, doba jízdy, „🎒 Výlet sem“', () => {
  assert.deepEqual([...T.RADII], [3, 5, 10, 20, 50, 100]);
  assert.deepEqual([3, 20, 50, 100, T.COUNTRY].map(T.cityKm), [3, 20, 20, 20, 10], 'dotaz na město nejvýš 20 km, celá země jako výchozí náhled');
  assert.deepEqual([10, 20, 50, 100, T.COUNTRY].map(T.farOn), [false, false, true, true, false]);
  // do 20 km výlety mimo město leží za okruhem vždy (jako dřív), od 50 km jen ty do okruhu
  const trips = (xs) => xs.filter((x) => x.category === 'daytrip').map((x) => x.name);
  assert.equal(trips(T.inRadius(BCN.items, 20)).length, 8);
  assert.deepEqual(plain(trips(T.inRadius(BCN.items, 50))), ['Terrasa', 'Sabadell', 'Mataró']);
  assert.deepEqual(plain(trips(T.inRadius(BCN.items, 100))).sort(), ['Girona', 'Malgrat de Mar', 'Mataró', 'Reus', 'Sabadell', 'Tarragona', 'Terrasa']);
  assert.equal(T.inRadius(BCN.items, 100).filter((x) => x.category !== 'daytrip').length, 60, 'místa ve městě všechna');
  // místa v okolí z plánovače výletů: nahradí stejné výlety ze seznamu (úplnější), seřazená podle významu
  const girona = BCN.items.find((x) => x.name === 'Girona');
  const far = [{ id: 'mon', name: 'Montserrat', category: 'daytrip', distanceKm: 38, score: 70 }, { ...girona, score: 90, extract: 'úplnější' }, { id: 'tor', name: 'Tortosa', category: 'daytrip', distanceKm: 160, score: 95 }];
  const all = T.withFar(BCN.items, far);
  assert.equal(all.length, BCN.items.length + 2);
  assert.equal(all.filter((x) => x.name === 'Girona').length, 1);
  assert.equal(all.find((x) => x.name === 'Girona').extract, 'úplnější');
  assert.deepEqual(plain(all.slice(-3).map((x) => x.name)), ['Tortosa', 'Girona', 'Montserrat']);
  assert.ok(!T.inRadius(all, 100).some((x) => x.name === 'Tortosa'), 'za okruhem 100 km ne');
  assert.equal(T.withFar(BCN.items, null), BCN.items);
  // doba jízdy autem: odhad na 5 min, nejméně 10 min
  assert.deepEqual([3, 38, 88].map(T.driveMin), [10, 40, 100]);
  const card = T.poiCard({ id: 'mon', name: 'Montserrat', category: 'daytrip', categoryLabel: 'Hora', distanceKm: 38 }, { center: { lat: 41.39, lon: 2.17, label: 'Barcelona', country: 'Španělsko' }, drive: true, tripGo: true });
  assert.match(card, /38 km · ~40 min autem/);
  assert.match(card, /data-tgo="mon"[^>]*>🎒 Výlet sem</);
  assert.ok(!T.poiCard({ id: 'x', name: 'X', category: 'museum', distanceKm: 2 }, {}).includes('autem'), 'místo ve městě bez doby jízdy');
  // prázdný okruh: z 20 km nabídne okolí do 100 km
  assert.match(T.emptyHtml(20, 'city'), /Zvětšit okruh na 100 km/);
});

test('zapamatovaný okruh: 50, 100 km a celá země platí, jiné hodnoty ne', () => {
  for (const r of [50, 100, T.COUNTRY]) assert.equal(T.uiRestore({ radius: r }, '2026-10-10').radius, r);
  for (const r of [37, '50', 'kontinent', null]) assert.equal(T.uiRestore({ radius: r }, '2026-10-10').radius, undefined);
});

test('🌍 celá země: skupiny (města, cíle, UNESCO, parky), karty bez XSS, lety do země', () => {
  const d = {
    cc: 'IT', country: 'Itálie',
    city: [{ id: 'Q220', name: 'Řím', lat: 41.9, lon: 12.5, distanceKm: 2, image: IMG, extract: 'Řím je hlavní město Itálie.', descLang: 'cs', url: 'https://cs.wikipedia.org/wiki/%C5%98%C3%ADm', wv: true },
      { id: 'bez', name: 'Bez polohy' }],
    dest: [{ id: 'Q212214', name: XSS, lat: 40.6, lon: 14.6, distanceKm: 225, blurb: 'stunningly beautiful rocky coastline, so popular that private cars are banned', unesco: true }],
    unesco: [{ id: 'Q1', name: 'Hadriánova vila', lat: 41.94, lon: 12.77, distanceKm: 23, description: 'antický komplex', descLang: 'cs', unesco: true }],
    park: 'nesmysl',
  };
  const items = T.countryItems(d);
  assert.deepEqual(plain(items.map((x) => [x.group, x.name === XSS ? 'XSS' : x.name])), [['city', 'Řím'], ['dest', 'XSS'], ['unesco', 'Hadriánova vila']], 'bez polohy a nesmysly pryč');
  const g = (k) => T.C_GROUPS.find((c) => c[0] === k);
  const rome = T.countryCard(items[0], g('city'), { label: 'Řím', country: 'Itálie' });
  assert.match(rome, /🏙️ Řím/);
  assert.match(rome, /Město · 2 km · <b[^>]*>👍 Wikivoyage<\/b>/);
  assert.match(rome, /data-cgo="Q220">🔎 Prozkoumat</);
  assert.match(rome, /Řím je hlavní město Itálie\./);
  const coast = T.countryCard(items[1], g('dest'), { label: 'Řím', country: 'Itálie' });
  assert.ok(!coast.includes('<img src=x'), 'název escapovaný');
  assert.match(coast, /UNESCO/);
  assert.match(coast, /anglicky<\/span> stunningly beautiful/, 'popis z Wikivoyage označený jako anglický');
  assert.ok(!T.countryCard(items[2], g('unesco'), { label: 'Řím' }).includes('· <b class="poi-unesco">UNESCO'), 've skupině UNESCO se značka neopakuje');
  assert.deepEqual(plain(T.countryTarget('IT', 'Itálie')), { id: 'cc:IT', type: 'country', label: 'Itálie', flag: plain(T.countryTarget('IT', 'Itálie')).flag });
  assert.equal(T.countryTarget('CZ', 'Česko'), null, 'celé Česko: bez ✈️ Najít lety sem');
  assert.equal(T.countryTarget('Itálie', 'Itálie'), null);
  assert.equal(T.countryTarget('IT', ''), null);
});

test('okruh 50/100 km a celá země: dotazy api/poi/trips a api/poi/country jednou na místo', async () => {
  const urls = [];
  const replies = {
    'api/poi/trips': { items: [{ id: 'mon', name: 'Montserrat', category: 'daytrip', distanceKm: 38, score: 70, lat: 41.6, lon: 1.8 }] },
    'api/poi/country': { cc: 'ES', country: 'Španělsko', city: [{ id: 'Q1492', name: 'Barcelona', lat: 41.39, lon: 2.17 }], dest: [], unesco: [], park: [] },
  };
  let P = null;
  // #exBody jen pro načítání přehledu země (vykreslení – mapa, karty – se v testu přeskočí)
  const body = { isConnected: true, innerHTML: '' };
  P = load({ go: () => {}, setTimeout, clearTimeout, $: (s) => (s === '#exBody' && P._t.ex.radius === T.COUNTRY && !P._t.ex.country ? body : null),
    fetch: async (u) => { urls.push(u); return { ok: true, status: 200, json: async () => replies[u.split('?')[0]] || {} }; },
    localStorage: { getItem: () => null, setItem: () => {} } }).window.Places;
  const X = P._t.ex;
  X.place = { label: 'Barcelona', lat: 41.3874, lon: 2.1686, cc: 'ES', geo: false, country: 'Španělsko' };
  X.radius = 100;
  await P._t.loadFar();
  await P._t.loadFar(); // podruhé nic
  assert.deepEqual(urls, ['api/poi/trips?lat=41.3874&lon=2.1686']);
  assert.equal(X.far.items[0].name, 'Montserrat');
  assert.equal(X.far.busy, false);
  // celá země: předchozí okruh v km se zapamatuje (návrat „Zpět na …“), přehled se načte jednou
  X.radius = 50;
  P._t.setRadius(T.COUNTRY);
  assert.equal(X.lastKm, 50);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(urls.slice(1), ['api/poi/country?cc=ES&lat=41.3874&lon=2.1686']);
  assert.equal(X.country.data.city[0].name, 'Barcelona');
  assert.match(body.innerHTML, /Hledám to nejlepší v zemi/, 'čekání s vlastním textem');
});

// 🌍 Celá země vybraná jménem: země podle názvu (i v jiném pádě), návrhy „Francie – celá země“, výběr země bez místa
function loadCountries() {
  const countries = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url), 'utf8'));
  const byIso = Object.fromEntries(countries.map((c) => [c.iso2, c]));
  const ctx = { window: {}, URLSearchParams, console, byIso };
  vm.createContext(ctx);
  vm.runInContext(src('app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('smart.js'), ctx, { filename: 'smart.js' });
  vm.runInContext(src('places.js'), ctx, { filename: 'places.js' });
  return ctx.window.Places._t;
}

test('celá země jménem: Francie, ve Francii, Česko, Česká republika, Italy, Velké Británii; město zemí není', () => {
  const TC = loadCountries();
  const cases = { Francie: 'FR', Francii: 'FR', Itálii: 'IT', Česko: 'CZ', Česku: 'CZ', 'Česká republika': 'CZ', italy: 'IT', Chorvatsku: 'HR', Španělsko: 'ES', 'Velké Británii': 'GB', 'Spojené království': 'GB', Řecko: 'GR', Rakousku: 'AT' };
  for (const [t, cc] of Object.entries(cases)) assert.equal(TC.countryOfText(t), cc, t);
  for (const t of ['Paříž', 'Řím', 'Toskánsko', 'Kréta', 'Lisabon', '', 'x']) assert.equal(TC.countryOfText(t), '', t);
  // ✨ věta jen se zemí → přehled země; se dny, druhem plánu nebo zájmy zůstává plán (okruh po oblasti apod.)
  assert.equal(TC.wholeCountryOf({ place: 'Francie', interests: [] }), 'FR');
  assert.equal(TC.wholeCountryOf({ place: 'Itálie', days: 7, interests: [] }), '');
  assert.equal(TC.wholeCountryOf({ place: 'Itálie', mode: 'loop', interests: [] }), '');
  assert.equal(TC.wholeCountryOf({ place: 'Lisabon', interests: [] }), '');
});

test('návrhy zemí: celý název i začátek (od 3 písmen), nejvýš 2, „– celá země“ s vlajkou', () => {
  const TC = loadCountries();
  const fr = TC.countrySugs('Francie');
  assert.equal(fr[0].ccPick, 'FR');
  assert.equal(fr[0].label, 'Francie – celá země');
  assert.equal(fr[0].flag, '🇫🇷');
  assert.equal(TC.countrySugs('Fran')[0].ccPick, 'FR');
  assert.equal(TC.countrySugs('ital')[0].ccPick, 'IT');
  assert.equal(TC.countrySugs('Ma').length, 0, 'dvě písmena nestačí (Malta, Maroko, Maďarsko…)');
  assert.ok(TC.countrySugs('Mal').length <= 2);
  assert.equal(TC.countrySugs('Lisabon').length, 0);
});

test('výběr země: nadpis, oblíbené (Itálie první), všechny země A–Ž s vlajkou', () => {
  const TC = loadCountries();
  const h = TC.pickerHtml();
  assert.match(h, /🌍 Vyber zemi/);
  const pop = h.slice(h.indexOf('id="exCcPop"'), h.indexOf('id="exCcAll"'));
  assert.deepEqual([...pop.matchAll(/data-cc="([A-Z]{2})"/g)].map((m) => m[1]).slice(0, 4), ['IT', 'FR', 'ES', 'HR']);
  const all = h.slice(h.indexOf('id="exCcAll"'));
  const ccs = [...all.matchAll(/data-cc="([A-Z]{2})"/g)].map((m) => m[1]);
  assert.equal(ccs.length, 197);
  assert.equal(ccs[0], 'AF', 'Afghánistán první (česky A–Ž)');
  assert.match(all, /data-cc="FR" data-ccn="francie france"/);
});

// 🌍 „Co hledáš?“ v přehledu země: čipy filtrují seznam i mapu, hory/pláže/… se načtou až po výběru
const CD = {
  cc: 'IT', country: 'Itálie',
  city: [{ id: 'Q220', name: 'Řím', lat: 41.9, lon: 12.5, unesco: true, cats: [] }, { id: 'Q490', name: 'Milán', lat: 45.46, lon: 9.19, cats: [] }],
  dest: [{ id: 'Q1', name: 'Dolomity', lat: 46.4, lon: 11.8, cats: ['mountain'], nature: true }, { id: 'Q2', name: 'Amalfinské pobřeží', lat: 40.6, lon: 14.6, cats: ['beach'], nature: true, unesco: true },
    { id: 'Q3', name: 'Cinque Terre', lat: 44.1, lon: 9.7, cats: [], nature: false }],
  unesco: [{ id: 'Q4', name: 'Hadriánova vila', lat: 41.94, lon: 12.77, unesco: true }],
  park: [{ id: 'Q5', name: 'Gran Paradiso', lat: 45.5, lon: 7.3, nature: true }],
};
const names = (r) => r.items.map((x) => x.name);

test('🌍 Co hledáš?: Vše, města, památky (i města a cíle s UNESCO), příroda, hory z Wikivoyage + načtené bez opakování', () => {
  assert.deepEqual(plain(T.CC_CATS.map((c) => c[0])), ['all', 'city', 'unesco', 'nature', 'mountain', 'beach', 'island', 'lake', 'castle', 'sight']);
  const all = T.countryPick(CD, 'all');
  assert.equal(all.items.length, 7);
  assert.deepEqual(plain(all.sections.map(([g, l]) => [g[0], l.length])), [['city', 2], ['dest', 3], ['unesco', 1], ['park', 1]]);
  assert.deepEqual(plain(names(T.countryPick(CD, 'city'))), ['Řím', 'Milán']);
  assert.deepEqual(plain(names(T.countryPick(CD, 'unesco'))), ['Řím', 'Amalfinské pobřeží', 'Hadriánova vila']);
  assert.deepEqual(plain(names(T.countryPick(CD, 'nature'))), ['Dolomity', 'Amalfinské pobřeží', 'Gran Paradiso']);
  // hory: Dolomity z Wikivoyage hned, načtené přibudou (Dolomity podruhé ne, bez polohy pryč)
  assert.deepEqual(plain(names(T.countryPick(CD, 'mountain', null))), ['Dolomity']);
  const loaded = [{ id: 'Q1', name: 'Dolomity', lat: 46.4, lon: 11.8 }, { id: 'Q6', name: 'Etna', lat: 37.75, lon: 14.99, cats: ['mountain'] }, { id: 'Q7', name: 'Bez polohy' }, null];
  const m = T.countryPick(CD, 'mountain', loaded);
  assert.deepEqual(plain(names(m)), ['Dolomity', 'Etna']);
  assert.deepEqual(plain(m.sections.map(([g, l]) => [g[0], g[1], g[2], l.map((x) => x.group)])), [['mountain', '⛰️', 'Hory', ['mountain', 'mountain']]]);
  assert.deepEqual(plain(T.countryPick(CD, 'island', [])), { items: [], sections: [] }, 'prázdná kategorie');
  assert.equal(T.countryPick(CD, 'nesmysl').items.length, 7, 'neznámá = vše');
  // karta místa z kategorie: vlastní ikona a druh
  const card = T.countryCard({ ...m.items[1], group: 'mountain', distanceKm: 540 }, m.sections[0][0], { label: 'Řím' });
  assert.match(card, /⛰️ Etna/);
  assert.match(card, /Hory · 540 km/);
});

test('🌍 Co hledáš?: zapamatovaná kategorie platí, nesmysl ne', () => {
  for (const c of ['all', 'mountain', 'castle', 'nature']) assert.equal(T.uiRestore({ cCat: c }, '2026-10-10').cCat, c);
  for (const c of ['bad', 'constructor', 1, null]) assert.equal(T.uiRestore({ cCat: c }, '2026-10-10').cCat, undefined);
});

test('🌍 Co hledáš?: kategorie se načte jednou na zemi (api/poi/country?cat=), chyba se zapamatuje pro „Zkusit znovu“', async () => {
  const urls = [];
  let fail = false;
  const P = load({ setTimeout, clearTimeout, $: () => null, localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async (u) => { urls.push(u); return fail ? { ok: false, status: 503, json: async () => ({ error: 'Wikidata neodpovídá' }) } : { ok: true, status: 200, json: async () => ({ items: [{ id: 'Q6', name: 'Etna', lat: 37.75, lon: 14.99 }] }) }; } }).window.Places;
  const X = P._t.ex;
  X.place = { label: 'Řím', lat: 41.9, lon: 12.5, cc: 'IT', geo: false };
  X.radius = T.COUNTRY;
  X.country = { place: X.place, data: CD };
  X.cCat = 'mountain';
  await P._t.loadCountryCat('mountain');
  await P._t.loadCountryCat('mountain');
  await P._t.loadCountryCat('city'); // města se nenačítají
  assert.deepEqual(urls, ['api/poi/country?cc=IT&cat=mountain&lat=41.9&lon=12.5']);
  assert.equal(X.country.cats.mountain.items[0].name, 'Etna');
  fail = true;
  await P._t.loadCountryCat('castle');
  assert.match(X.country.cats.castle.err, /Wikidata neodpovídá/);
  await P._t.loadCountryCat('castle');
  assert.equal(urls.length, 3, 'po chybě znovu (Zkusit znovu smaže stav, tady načte znovu i sám)');
});

const js0 = () => readFileSync(new URL('../public/js/places.js', import.meta.url), 'utf8');
test('Objevuj: místo, kam jedeš – termín programu podle cesty (od příjezdu do odjezdu, probíhající od dneška), jinak nic', () => {
  const C = load({ byIso: { PT: { cs: 'Portugalsko' } } }).window.Places._t;
  const own = [{ label: 'Lisabon', from: '2099-01-14', to: '2099-01-18', trip: true }, { label: 'Vídeň', from: '2026-10-20', to: '2026-10-30', trip: true },
    { label: 'Kodaň', from: '2026-01-01', to: '2026-01-05', trip: true }];
  assert.deepEqual(plain(C.tripDatesFor({ label: 'Lisabon' }, own, '2026-10-28')), { from: '2099-01-14', to: '2099-01-18', n: 5 });
  assert.deepEqual(plain(C.tripDatesFor({ label: 'vídeň' }, own, '2026-10-28')), { from: '2026-10-28', to: '2026-10-30', n: 3 }, 'probíhající od dneška, název bez ohledu na velká písmena');
  assert.equal(C.tripDatesFor({ label: 'Kodaň' }, own, '2026-10-28'), null, 'proběhlá cesta ne');
  assert.equal(C.tripDatesFor({ label: 'Porto' }, own, '2026-10-28'), null);
  assert.deepEqual(plain(C.tripDatesFor({ label: 'Lisabon' }, [{ label: 'Lisabon', from: '2099-01-14', trip: true }], '2026-10-28')), { from: '2099-01-14', to: '2099-01-14', n: 1 }, 'bez konce: den příjezdu');
  // časy cesty: přílet jen v den příletu, odlet jen v den odjezdu (probíhající od dneška přílet nemá)
  const timed = [{ label: 'Řím', from: '2099-02-01', to: '2099-02-05', arr: '14:13', dep: '09:35', trip: true }];
  assert.deepEqual(plain(C.tripDatesFor({ label: 'Řím' }, timed, '2026-10-28')), { from: '2099-02-01', to: '2099-02-05', n: 5, arr: '14:13', dep: '09:35' });
  assert.deepEqual(plain(C.tripDatesFor({ label: 'Řím' }, timed, '2099-02-03')), { from: '2099-02-03', to: '2099-02-05', n: 3, dep: '09:35' });
  // z průvodce: časy podle termínu programu (Trip.progSpan) – jen když sedí den příletu / odjezdu
  const W = load({ byIso: { IT: { cs: 'Itálie' } } });
  W.window.Trip = W.Trip = { baseDates: () => [], stayDates: () => ({ checkout: '2099-02-05' }), progSpan: () => ({ start: '2099-02-01', end: '2099-02-05', arrivalTime: '14:13', departureTime: '09:35' }) };
  const wt = { created: 5, flight: { out: { date: '2099-02-01' } }, dest: { label: 'Řím', cc: 'IT', lat: 41.9, lon: 12.5, country: 'Itálie' } };
  assert.deepEqual(plain(W.window.Places._t.ownPlaces(wt, [], '2026-10-28')).map((x) => [x.from, x.to, x.arr, x.dep]), [['2099-02-01', '2099-02-05', '14:13', '09:35']]);
  W.window.Trip.progSpan = W.Trip.progSpan = () => ({ start: '2099-02-02', end: '2099-02-05', arrivalTime: '00:40', departureTime: null });
  assert.deepEqual(plain(W.window.Places._t.ownPlaces(wt, [], '2026-10-28')).map((x) => [x.arr, x.dep]), [[undefined, undefined]], 'přílet po půlnoci = jiný den');
  assert.match(js0(), /arrivalTime: '07:30', departureTime: null, \.\.\.planTimes\(p\) \}/);
  // program od dneška: první den od teď (server +1,5 h → za půl hodiny), ne od 9:00; pozdější přílet cesty má přednost
  const PX = load({ byIso: {} }).window.Places._t, at = (h, m) => new Date(2026, 9, 31, h, m);
  Object.assign(PX.ex, { start: '2026-10-31', days: 2, tripHint: null });
  assert.deepEqual(plain(PX.planTimes({ label: 'Brno' }, at(15, 20))), { arrivalTime: '14:20' });
  assert.deepEqual(plain(PX.planTimes({ label: 'Brno' }, at(0, 30))), { arrivalTime: '00:00' }, 'po půlnoci ne 23:30 včerejška');
  PX.ex.tripHint = { label: 'Brno', from: '2026-10-31', to: '2026-11-01', n: 2, arr: '21:16', dep: '17:35' };
  assert.deepEqual(plain(PX.planTimes({ label: 'Brno' }, at(15, 20))), { arrivalTime: '21:16', departureTime: '17:35' });
  assert.deepEqual(plain(PX.planTimes({ label: 'Brno' }, at(23, 0))), { arrivalTime: '22:00', departureTime: '17:35' });
  PX.ex.start = '2026-11-01'; PX.ex.days = 1; PX.ex.tripHint = null;
  assert.deepEqual(plain(PX.planTimes({ label: 'Brno' }, at(15, 20))), {}, 'zítra: od 9:00 jako dřív');
  // Výlety a okruh v termínu cesty: den příletu po poledni a den odletu před 21:30 přeskočit, s vysvětlením
  const H = { label: 'Lisabon', from: '2026-11-12', to: '2026-11-17', n: 6, arr: '21:16', dep: '17:35' };
  const r1 = plain(PX.roadSpan('2026-11-12', 2, H));
  assert.deepEqual([r1.start, r1.days], ['2026-11-13', 2]);
  assert.match(r1.note, /^Podle tvé cesty: čt\u00a012\.\u00a011\. přilétáš v 21:16 – na výlet ten den nezbude čas\.$/);
  const r2 = plain(PX.roadSpan('2026-11-15', 5, H));
  assert.deepEqual([r2.start, r2.days], ['2026-11-15', 2], 'den odletu 17. 11. (17:35) bez výletu');
  assert.match(r2.note, /odlétáš v 17:35/);
  assert.deepEqual(plain(PX.roadSpan('2026-11-12', 2, { ...H, arr: '08:10' })), { start: '2026-11-12', days: 2 }, 'ranní přílet: výlet ještě stihneš');
  assert.deepEqual(plain(PX.roadSpan('2026-11-14', 2, H)), { start: '2026-11-14', days: 2 }, 'uprostřed cesty beze změny');
  assert.deepEqual(plain(PX.roadSpan('2026-11-17', 1, H)), { start: '2026-11-17', days: 1 }, 'nezbyl by žádný den: beze změny');
  assert.deepEqual(plain(PX.roadSpan('2026-11-12', 2, null)), { start: '2026-11-12', days: 2 });
  // posunuté o den nepřeteče za odlet (pozdní odlet 22:15 i bez času odletu)
  const H2 = { label: 'Lisabon', from: '2026-11-12', to: '2026-11-15', arr: '21:16', dep: '22:15' };
  assert.deepEqual([PX.roadSpan('2026-11-12', 4, H2).start, PX.roadSpan('2026-11-12', 4, H2).days], ['2026-11-13', 3]);
  assert.deepEqual(PX.roadSpan('2026-11-12', 4, { ...H2, dep: undefined }).days, 3);
  assert.deepEqual(PX.roadSpan('2026-11-12', 4, { ...H2, dep: '21:30' }).days, 3, 'odlet ve 21:30: poslední den výlet ještě stihneš');
  assert.match(js0(), /const h = ex\.tripHint && ex\.tripHint\.label === p\.label \? ex\.tripHint : null, sp = roadSpan\(ex\.start, ex\.tripDays\[mode\], h\);/);
  // cesta z plánovače nese i konec (to) – podle něj počet dní programu
  assert.deepEqual(plain(C.savedPlaces({ dest: 'Kodaň', iso: 'DK', start: '2099-08-01', end: '2099-08-03' })).map((p) => [p.from, p.to]), [['2099-08-01', '2099-08-03']]);
  // openPlace: termín z cesty, jen co věta („Lisabon na 3 dny“) sama neurčila; poznámka v Naplánovat
  const js = readFileSync(new URL('../public/js/places.js', import.meta.url), 'utf8');
  assert.match(js, /if \(px\.place\) openPlace\(s, \{ start: !px\.start, days: !px\.days \}\);/);
  assert.match(js, /🧳 Termín tvé cesty: \$\{fmtDate\(th\.from\)\}/);
  // jiné místo bez cesty termín cesty nepřebírá (IDOS do Brna na den odletu do Lisabonu); po restartu PWA termín i časy znovu
  assert.match(js, /else if \(!td && prev && ex\.datePicked && ex\.start === prev\.from\) \{ ex\.start = plusDays\(fmtYMD\(new Date\(\)\), 1\); ex\.datePicked = false; \}/);
  // Inspirace po obnovení na #explore: termíny míst trasy až s trip.js (líně načítaný) – po jeho načtení překreslit
  assert.match(js, /Lazy\.need\('trip'\)\.then\(\(\) => \{\s*const q = \$\('#exQ', root\);\s*if \(window\.Trip && root\.isConnected && !ex\.place && ex\.radius !== COUNTRY && !\(q && \(q\.value \|\| document\.activeElement === q\)\)\) renderExplore\(root\);/);
  assert.match(js, /const hint = \(\) => \{ try \{ const td = tripDatesFor\(r\.place\); if \(td\) ex\.tripHint = \{ label: r\.place\.label, \.\.\.td \}; \}/);
  // cesta jen v Mých cestách: konec a časy až s trip.js – po jeho načtení termín znovu (a překreslit, když se změnil)
  assert.match(js, /Lazy\.need\('trip'\)\.then\(\(\) => \{\s*if \(ex\.place !== r\.place\) return;\s*const was = JSON\.stringify\(ex\.tripHint \|\| null\);\s*hint\(\);/);
});

test('Objevuj: místo cesty s „Auto nepotřebuji“ – výlety vlakem a busem (carSkipFor)', () => {
  const wiz = (car) => ({ flight: { out: { date: '2099-05-10' } }, dest: { label: 'Řím', lat: 41.9, lon: 12.5, cc: 'IT', country: 'Itálie' }, car });
  const C = load({ byIso: { IT: { cs: 'Itálie' } }, S: { trip: wiz({ mode: 'skip' }), trips: [] } });
  assert.equal(C.window.Places._t.carSkipFor({ label: 'Řím' }), true);
  assert.equal(C.window.Places._t.carSkipFor({ label: 'Milán' }), false, 'jiné místo');
  const D = load({ byIso: { IT: { cs: 'Itálie' } }, S: { trip: null, trips: [{ start: '2099-05-10', wizard: wiz({ mode: 'skip' }) }, { start: '2099-06-10', wizard: wiz({ mode: 'manual', totalCzk: 2000 }) }] } });
  assert.equal(D.window.Places._t.carSkipFor({ label: 'řím' }), true, 'uložená cesta v Mých cestách');
  const E = load({ byIso: { IT: { cs: 'Itálie' } }, S: { trip: wiz(null), trips: [] } });
  assert.equal(E.window.Places._t.carSkipFor({ label: 'Řím' }), false, 'auto zatím nevybrané: beze změny');
  // proběhlá uložená cesta bez auta nepřebije nadcházející s autem; uložená kopie rozpracované se nepočítá
  const F = load({ byIso: { IT: { cs: 'Itálie' } }, S: { trip: { ...wiz({ mode: 'manual', totalCzk: 2000 }), created: 9 }, trips: [{ tripId: 9, start: '2099-05-10', end: '2099-05-14', wizard: wiz({ mode: 'skip' }) }, { tripId: 1, start: '2020-05-10', end: '2020-05-14', wizard: wiz({ mode: 'skip' }) }] } });
  assert.equal(F.window.Places._t.carSkipFor({ label: 'Řím' }), false, 'rozpracovaná s autem rozhoduje');
  const G = load({ byIso: { IT: { cs: 'Itálie' } }, S: { trip: null, trips: [{ tripId: 1, start: '2020-05-10', end: '2020-05-14', wizard: wiz({ mode: 'skip' }) }] } });
  assert.equal(G.window.Places._t.carSkipFor({ label: 'Řím' }, '2026-11-01'), false, 'proběhlá cesta ne');
  const js = src('places.js');
  assert.match(js, /if \(td && carSkipFor\(ex\.place\)\) \{ if \(ex\.transport !== 'transit'\) ex\.autoTransit = \{ was: ex\.transport \}; ex\.transport = 'transit'; \}\s*else if \(ex\.autoTransit\) \{ ex\.transport = ex\.autoTransit\.was; ex\.autoTransit = null; \}/);
  assert.match(js, /b\.onclick = \(\) => \{ ex\.autoTransit = null; if \(ex\.transport !== b\.dataset\.transport\)/, 'vlastní volba dopravy se pak nepřepíše');
});

test('Objevuj: fotka místa leží přes ikonu druhu – když se nenačte (slabý signál), je vidět ikona, ne šedý čtverec', () => {
  const img = "https://upload.wikimedia.org/x y'.jpg";
  const card = T.poiCard({ id: 'Q1', name: 'Hrad', category: 'castle', categoryLabel: 'Hrad / pevnost', image: img }, {});
  assert.match(card, /<div class="poi-img has-ph" style="--ph:url\('https:\/\/upload\.wikimedia\.org\/x%20y%27\.jpg'\)">🏰<\/div>/);
  assert.match(T.poiCard({ id: 'Q2', name: 'Bez fotky', category: 'castle' }, {}), /<div class="poi-img">🏰<\/div>/, 'bez fotky jen ikona');
  assert.ok(!card.includes('background-image'), 'fotka už není pozadí přímo čtverce (to by ikonu zakrylo i bez fotky)');
  const g = ['city', '🏙️', 'Města', 'Město'];
  assert.match(T.countryCard({ id: 'c1', name: 'Řím', image: img }, g, { label: 'Řím', country: 'Itálie' }), /<div class="poi-img has-ph" style="--ph:url\([^)]*\)">🏙️<\/div>/);
  const css = readFileSync(new URL('../public/css/trip.css', import.meta.url), 'utf8');
  assert.match(css, /\.poi-img\{[^}]*position:relative;overflow:hidden\}/);
  assert.match(css, /\.poi-img\.has-ph::after\{content:"";position:absolute;inset:0;background:var\(--ph\) center\/cover no-repeat\}/);
  const fcss = readFileSync(new URL('../public/css/flights.css', import.meta.url), 'utf8');
  assert.match(fcss, /\.dp-img\.has-ph::after\{content:"";position:absolute;inset:0;background:var\(--ph\) center\/cover no-repeat\}/);
});
