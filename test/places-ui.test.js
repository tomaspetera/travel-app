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
  assert.equal(T.dayLbl('2026-10-11'), 'ne 11. 10.');
  assert.equal(T.slug('Český Krumlov'), 'cesky-krumlov');
  assert.equal(T.slug(''), 'trasa');
  const gpx = T.gpxOf({ geometry: [[14.42, 50.08, 200], [14.43, 50.09], [14.44, 50.1, 210]] }, 'Pěšky z: <Praha>');
  assert.equal((gpx.match(/<trkpt /g) || []).length, 3);
  assert.equal((gpx.match(/<ele>/g) || []).length, 2);
  assert.match(gpx, /<name>Pěšky z: &lt;Praha&gt;<\/name>/);
  assert.match(gpx, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<gpx version="1.1"/);
});
