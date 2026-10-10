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
  assert.ok(T.firstSentence('x '.repeat(200)).endsWith('…'));
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
