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
  assert.equal(T.inclHtml({ includes: [] }, 'x'), '');
  assert.equal(T.inclHtml({ includes: 'x' }, 'x'), '', 'neznámý tvar se ignoruje');
  assert.match(T.poiCard(castle, {}), /Zahrnuje: Katedrála sv\. Víta/);
  assert.ok(!T.poiCard({ id: 'Q2', name: 'Bez částí', category: 'church' }, {}).includes('Zahrnuje'));
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
  assert.equal(T.httpErr(500, {}), 'Chyba serveru (HTTP 500).');
  assert.equal(T.httpErr(429, { error: 'Příliš mnoho požadavků' }), 'Příliš mnoho požadavků');
});

test('getJson: výpadek sítě česky (ne „Failed to fetch“), přerušení zůstane AbortError, status u chyby', async () => {
  const mk = (fetch) => load({ fetch }).window.Places._t.getJson;
  await assert.rejects(mk(async () => { throw new TypeError('Failed to fetch'); })('api/poi'), /Server teď neodpovídá/);
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  await assert.rejects(mk(async () => { throw abort; })('api/geocode'), (e) => e.name === 'AbortError');
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
  assert.ok(!T.emptyHtml(20, 'city').includes('data-rad'), 'větší okruh už není');
  assert.ok(!T.emptyHtml(5, 'bike').includes('data-mode'), 'v jiném režimu bez tipu na režimy');

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
  assert.equal(TB.findTripFor(trips, { ...day, start: '2026-10-13' }), -1, 'jiný začátek = jiná cesta');
  assert.equal(TB.findTripFor([{ dest: 'Barcelona' }, null], day), -1, 'cesta bez data nic');
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

  // tlačítko: „Přidat k cestě …“ + „uložit jako novou“, jinak „Uložit do plánovače“
  assert.match(TB.saveHtml(1, trips), /💾 Přidat k cestě Výlet: Barcelona<\/button><button type="button" class="linkbtn ex-savenew" id="exSaveNew">uložit jako novou</);
  assert.equal(TB.saveHtml(-1, trips), '<button class="btn" id="exSave">💾 Uložit do plánovače</button>');
  const long = TB.saveHtml(0, [{ name: `Dlouhá cesta ${XSS} po celém Španělsku a Portugalsku` }]);
  assert.ok(!long.includes('<img src=x'));
  assert.match(long, /…<\/button>/);
});

test('„Najít lety sem“: místo jako cíl letů, termín jen vybraný v Objevuj', () => {
  const TF = T;
  assert.deepEqual(plain(TF.flyTarget({ ...BCN_C, label: 'Barcelona' })), { id: 'geo:41.3874,2.1686|Barcelona', label: 'Barcelona', flag: '🇪🇸', type: 'place' });
  assert.equal(TF.flyTarget({ lat: 50, lon: 14, label: 'Moje okolí', geo: true }), null, 'z vlastní polohy se neletí');
  assert.equal(TF.flyTarget({ lat: 'x', lon: 14, label: 'X' }), null);
  assert.equal(TF.flyTarget({ lat: 1, lon: 2, label: 'A|B<"x">' }).id, 'geo:1.0000,2.0000|ABx', 'oddělovač a značky z názvu pryč');
  const s = { mode: 'city', start: '2026-10-20', days: 4, tripDays: { day: 2, loop: 5 } };
  assert.deepEqual(plain(TF.flyDates(s)), { xOut: '2026-10-20', xBack: '2026-10-23' });
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'loop' })), { xOut: '2026-10-20', xBack: '2026-10-24' });
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'day', tripDays: { day: 1 } })), { xOut: '2026-10-20', xBack: '2026-10-20' });
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'bike' })), { xOut: '2026-10-20' }, 'kolo: jen let tam');
  assert.deepEqual(plain(TF.flyDates({ ...s, mode: 'hike' })), { xOut: '2026-10-20' });
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
  assert.ok(card.includes("background-image:url('https://upload.wikimedia.org/a%20b%27%28c%29.jpg')"));
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
  // trasa přes víc míst: všechna místa (bez opakování, nejvýš 4)
  const bases = ['Řím', 'Florencie', 'Řím', 'Pisa', 'Lucca', 'Siena'].map((name, i) => ({ name, lat: 43 + i / 10, lon: 11, cc: 'IT', country: 'Itálie' }));
  assert.deepEqual(T.tripPlaces(trip({ route: { mode: 'multi', bases } })).map((p) => p.label), ['Řím', 'Florencie', 'Pisa', 'Lucca']);
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
