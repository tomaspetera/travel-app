// Pobyt na víc místech (server/lib/stayplan.js): odhad přejezdů, rozdělení nocí, návrh trasy
// (i open-jaw – přílet a odlet z jiného letiště) a endpoint bez sítě (podstrčená města).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestRoute, splitNights, transferEstimate, evaluateRoute, planStay, defaultCount, StayPlanError, TRANSFER_MAX } from '../server/lib/stayplan.js';
import { findTowns } from '../server/lib/poi.js';
import { haversineKm } from '../server/lib/geo.js';
import { stubFetch } from './helpers.js';

const T = (id, name, lat, lon, score, extra = {}) => ({ id, name, lat, lon, score, tripKind: 'town', category: 'daytrip', ...extra });
// Severní a střední Itálie (skóre zhruba jako z Wikidat).
const ITALY = [
  T('Q1', 'Bergamo', 45.6983, 9.6773, 88), T('Q2', 'Como', 45.8081, 9.0852, 86), T('Q3', 'Verona', 45.4384, 10.9916, 96, { unesco: true, sights: 4 }),
  T('Q4', 'Bologna', 44.4949, 11.3426, 95, { sights: 4 }), T('Q5', 'Florencie', 43.7696, 11.2558, 118, { unesco: true, sights: 6, highlights: ['Dóm', 'Uffizi', 'Ponte Vecchio', 'Palazzo Pitti'], nameEn: 'Florence' }),
  T('Q6', 'Siena', 43.3188, 11.3308, 100, { unesco: true }), T('Q7', 'Pisa', 43.7228, 10.4017, 97), T('Q8', 'Orvieto', 42.7185, 12.1107, 84),
  T('Q9', 'Assisi', 43.0707, 12.6196, 92, { unesco: true }), T('Q10', 'Parma', 44.8015, 10.3279, 85), T('Q11', 'Monza', 45.5845, 9.2744, 80),
];
const MILAN = { id: 'city:MIL', name: 'Milán', lat: 45.4642, lon: 9.19, cc: 'IT', country: 'Itálie' };
const ROME = { id: 'city:ROM', name: 'Řím', lat: 41.8933, lon: 12.4829, cc: 'IT', country: 'Itálie' };
const FCO = { iata: 'FCO', lat: 41.8045, lon: 12.252 };
const MXP = { iata: 'MXP', lat: 45.6306, lon: 8.7231 };
const km = (a, b) => haversineKm(a.lat, a.lon, b.lat, b.lon);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

test('stayplan: odhad přejezdu bez trasy z plánovače (vzdušná vzdálenost + pravidla regionu)', () => {
  const praha = { lat: 50.0875, lon: 14.4213, cc: 'CZ' };
  const brno = { lat: 49.1951, lon: 16.6068, cc: 'CZ' };
  const e = transferEstimate(praha, brno);
  assert.ok(e.km > 205 && e.km < 240, `Praha–Brno ${e.km} km`);
  assert.ok(e.carMin >= 135 && e.carMin <= 170, `autem ${e.carMin} min (skutečně ~2 h 15 min, s provozem víc)`);
  assert.ok(e.transitMin >= 160 && e.transitMin <= 200, `vlakem ${e.transitMin} min (skutečně ~2 h 40 min + cesta na nádraží)`);
  assert.equal(e.transitKind, 'rail');
  assert.equal(e.basis, 'estimate');
  assert.equal(e.border, null);
  const mf = transferEstimate(MILAN, ITALY[4]);
  assert.ok(mf.carMin >= 185 && mf.carMin <= 220, `Milán–Florencie autem ${mf.carMin} min (skutečně ~3 h 10 min)`);
  assert.ok(mf.transitMin <= 130, `Milán–Florencie rychlovlakem ${mf.transitMin} min`);
  assert.deepEqual({ ...transferEstimate(praha, praha) }, { km: 0, carMin: 0, transitMin: 0, transitKind: 'rail', border: null, basis: 'estimate' });
  // delší úsek nikdy netrvá kratší dobu
  let prev = 0;
  for (let d = 0.2; d < 4; d += 0.2) {
    const x = transferEstimate(praha, { lat: praha.lat, lon: praha.lon + d });
    assert.ok(x.carMin >= prev);
    prev = x.carMin;
  }
});

test('splitNights: součet vždy sedí, každé místo aspoň noc, důležitější místo nemá méně nocí', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 400; k++) {
    const total = 2 + Math.floor(rnd() * 20);
    const n = 1 + Math.floor(rnd() * Math.min(6, total));
    const w = Array.from({ length: n }, () => Math.round(rnd() * 5000));
    const out = splitNights(total, w);
    assert.equal(out.length, n);
    assert.equal(sum(out), total, `${total} nocí → ${out}`);
    assert.ok(out.every((x) => Number.isInteger(x) && x >= 1));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (w[i] > w[j]) assert.ok(out[i] >= out[j], `váhy ${w} → ${out}`);
  }
  assert.deepEqual(splitNights(6, [3600, 2500, 1600]), [3, 2, 1], 'podle významu, např. 3 + 2 + 1');
  assert.deepEqual(splitNights(6, [5, 5, 5]), [2, 2, 2], 'stejně významná místa stejně');
  assert.deepEqual(splitNights(3, [1, 9, 4, 4, 4]), [1, 1, 1], 'víc míst než nocí → jen tolik míst, kolik je nocí');
  assert.deepEqual(splitNights(4, [NaN, -1]), [2, 2], 'neplatná váha = 1');
  assert.deepEqual([1, 2, 4, 5, 8, 9, 14].map(defaultCount), [1, 2, 2, 3, 3, 4, 4]);
});

test('suggestRoute: open-jaw Milán → Řím – začíná městem příletu, končí u letiště odletu, rozumné přejezdy', () => {
  for (const transport of ['car', 'transit']) {
    const r = suggestRoute(ITALY, { arrival: MILAN, departureCity: ROME, depAirport: FCO, nights: 9, transport, count: 4 });
    const names = r.bases.map((b) => b.name);
    assert.equal(r.bases.length, 4, `${transport}: ${names}`);
    assert.equal(names[0], 'Milán');
    assert.equal(r.bases[0].anchor, 'arrival');
    assert.equal(r.bases[0].reason, 'město příletu');
    assert.equal(sum(r.bases.map((b) => b.nights)), 9);
    assert.ok(r.bases.every((b) => b.nights >= 1));
    const ev = evaluateRoute(r.bases, { departure: FCO, transport });
    const min = (x) => (transport === 'car' ? x.carMin : x.transitMin);
    assert.ok(ev.transfers.every((x) => min(x) <= TRANSFER_MAX[transport]), `${transport}: ${ev.transfers.map(min)}`);
    assert.ok(min(ev.legs.departure) <= 60, 'poslední místo u letiště odletu');
    assert.equal(r.bases.at(-1).name, 'Řím', 'u vzdáleného odletu skončí trasa ve městě odletu');
    assert.equal(r.bases.at(-1).anchor, 'departure');
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(km(r.bases[i], r.bases[j]) >= 50, `${names[i]}–${names[j]} jsou moc blízko`);
    assert.ok(names.includes('Florencie'), 'nejvýznamnější město po cestě');
    assert.equal(r.bases.find((b) => b.name === 'Florencie').nameEn, 'Florence', 'anglický název pro odkazy na ubytování');
    assert.equal(r.bases[0].nameEn, '');
    assert.deepEqual(r.notes, []);
  }
  // Na 2 místa se Milán–Řím za 3 h nedá: delší přejezd, evaluateRoute ho označí.
  const two = suggestRoute(ITALY, { arrival: MILAN, departureCity: ROME, depAirport: FCO, nights: 5, transport: 'car', count: 2 });
  assert.equal(two.bases.length, 2);
  const ev = evaluateRoute(two.bases, { departure: FCO, transport: 'car' });
  assert.ok(ev.transfers[0].long || ev.legs.departure.long);
  assert.ok(ev.notes.length >= 1);
});

test('suggestRoute: zpáteční let – okruh v dosahu letiště, žádné místo dvakrát ani na skok od jiného, noci podle významu', () => {
  const r = suggestRoute(ITALY, { arrival: MILAN, departureCity: null, depAirport: MXP, nights: 6, transport: 'car' });
  assert.equal(r.bases.length, 3, 'na 6 nocí 3 místa');
  assert.equal(r.bases[0].name, 'Milán');
  assert.equal(new Set(r.bases.map((b) => b.id)).size, 3);
  assert.ok(!r.bases.some((b) => ['Monza', 'Como', 'Bergamo'].includes(b.name)), 'blíž než 50 km od Milána = výlet, ne další hotel');
  assert.ok(transferEstimate(r.bases.at(-1), MXP).carMin <= TRANSFER_MAX.car);
  assert.equal(sum(r.bases.map((b) => b.nights)), 6);
  assert.ok(r.bases[0].nights >= Math.max(...r.bases.slice(1).map((b) => b.nights)), 'město příletu je hlavní cíl');
  assert.ok(r.spare.length > 0 && r.spare.every((c) => !r.bases.some((b) => b.id === c.id)), 'tipy na další místa');
  assert.ok(r.spare.every((c) => c.nights === undefined));
  // vyřazené místo se znovu nenavrhne
  const again = suggestRoute(ITALY, { arrival: MILAN, depAirport: MXP, nights: 6, transport: 'car', exclude: r.bases.slice(1).map((b) => b.id) });
  assert.ok(!again.bases.slice(1).some((b) => r.bases.some((x) => x.id === b.id)));
});

test('suggestRoute: málo kandidátů, jedna noc, let jen tam', () => {
  const few = suggestRoute([{ ...ITALY[2], name: 'Verona (Itálie)' }], { arrival: MILAN, depAirport: MXP, nights: 9, transport: 'car', count: 4 });
  assert.deepEqual(few.bases.map((b) => b.name), ['Milán', 'Verona'], 'bez rozlišení z Wikidat v závorce');
  assert.match(few.notes[0], /navrhuji 2/);
  assert.equal(sum(few.bases.map((b) => b.nights)), 9);
  const none = suggestRoute([], { arrival: MILAN, depAirport: MXP, nights: 5, transport: 'car' });
  assert.equal(none.bases.length, 1);
  assert.equal(none.bases[0].nights, 5);
  assert.match(none.notes[0], /nenašel/);
  const one = suggestRoute(ITALY, { arrival: MILAN, depAirport: MXP, nights: 1, transport: 'car' });
  assert.equal(one.bases.length, 1);
  assert.match(one.notes[0], /jednu noc/);
  // jen tam: konec trasy kdekoli
  const oneway = suggestRoute(ITALY, { arrival: MILAN, depAirport: null, nights: 10, transport: 'car' });
  assert.equal(oneway.bases.length, 4);
  assert.equal(sum(oneway.bases.map((b) => b.nights)), 10);
  // neplatní kandidáti se ignorují
  const bad = suggestRoute([{ id: 'x', name: 'Nikde', lat: NaN, lon: 1, score: 99 }, null, { id: 'y', name: 'Bez skóre', lat: 45, lon: 11 }], { arrival: MILAN, nights: 4 });
  assert.equal(bad.bases.length, 1);
});

test('evaluateRoute: přejezdy mezi místy a z/na letiště, odkazy do Google Map autem i vlakem', () => {
  const bases = [MILAN, { name: 'Florencie', lat: 43.7696, lon: 11.2558, country: 'Itálie' }, ROME];
  const ev = evaluateRoute(bases, { arrival: { iata: 'BGY', lat: 45.6694, lon: 9.7089 }, departure: FCO, transport: 'transit' });
  assert.equal(ev.transport, 'transit');
  assert.equal(ev.transfers.length, 2);
  const u = new URL(ev.transfers[0].transitUrl);
  assert.equal(u.origin + u.pathname, 'https://www.google.com/maps/dir/');
  assert.deepEqual([u.searchParams.get('origin'), u.searchParams.get('destination'), u.searchParams.get('travelmode')], ['Milán, Itálie', 'Florencie, Itálie', 'transit']);
  assert.equal(new URL(ev.transfers[1].carUrl).searchParams.get('travelmode'), 'driving');
  assert.equal(new URL(ev.legs.arrival.carUrl).searchParams.get('origin'), 'BGY airport');
  assert.equal(new URL(ev.legs.departure.carUrl).searchParams.get('destination'), 'FCO airport');
  assert.ok(ev.legs.departure.carMin < 60);
  assert.deepEqual(evaluateRoute([MILAN], {}).legs, { arrival: null, departure: null });
  const far = evaluateRoute([MILAN, ROME], { departure: FCO, transport: 'car' });
  assert.equal(far.transfers[0].long, true);
  assert.match(far.notes[0], /Milán → Řím trvá ~\d h( \d+ min)? – na jeden přesun je to hodně, zvaž místo mezi nimi nebo vlak\./, 'rychlovlak je rychlejší než auto');
  // Rychlovlakem je Milán → Řím běžný přejezd (~3 h 30 min i s cestou na nádraží).
  const fast = evaluateRoute([MILAN, ROME], { transport: 'transit' }).transfers[0];
  assert.deepEqual([fast.transitKind, fast.hsr, fast.long], ['rail', true, false]);
  assert.ok(fast.transitMin >= 190 && fast.transitMin <= 225, `${fast.transitMin} min`);
});

test('planStay: kontrola vstupu, body hledání u open-jaw, přepočet bez Wikidat, výpadek → 503', async () => {
  const calls = [];
  const towns = async (p) => { calls.push(p); return ITALY; };
  const geo = async () => [];
  const deps = { towns, geo, route: null };
  await assert.rejects(planStay(null, deps), StayPlanError);
  await assert.rejects(planStay({ arrival: 'XXX', nights: 4 }, deps), /letiště příletu/);
  await assert.rejects(planStay({ arrival: 'BGY', departure: 'ZZZ', nights: 4 }, deps), /letiště odletu/);
  for (const nights of [0, 31, 'x', 2.5, null]) await assert.rejects(planStay({ arrival: 'BGY', nights }, deps), (e) => e instanceof StayPlanError && e.status === 400);
  for (const bases of [[], 'x', [{ name: 'A', lat: 95, lon: 1 }], [{ name: '', lat: 45, lon: 9 }], Array(7).fill({ name: 'A', lat: 45, lon: 9 })]) {
    await assert.rejects(planStay({ arrival: 'BGY', bases }, deps), /místa trasy/);
  }
  assert.equal(calls.length, 0);

  const r = await planStay({ arrival: 'BGY', departure: 'FCO', nights: 9, count: 4 }, deps);
  assert.equal(r.mode, 'suggest');
  assert.equal(r.openJaw, true);
  assert.equal(r.arrival.iata, 'BGY');
  assert.equal(r.departure.iata, 'FCO');
  assert.equal(r.bases[0].name, 'Milán', 'Bergamo patří k Miláně (metropole)');
  assert.equal(r.bases.length, 4);
  assert.equal(sum(r.bases.map((b) => b.nights)), 9);
  assert.equal(r.transfers.length, 3);
  assert.ok(r.legs.arrival && r.legs.departure);
  // okolí Milána, Říma a dva body mezi nimi (dotaz má okruh ~120 km)
  assert.equal(calls.length, 4);
  assert.ok(calls.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)));
  assert.ok(calls.some((p) => km(p, MILAN) < 20) && calls.some((p) => km(p, ROME) < 20));

  calls.length = 0;
  const loop = await planStay({ arrival: 'MXP', departure: 'MXP', nights: 6 }, deps);
  assert.equal(calls.length, 1, 'zpáteční let → jen okolí města příletu');
  assert.equal(loop.openJaw, false);
  assert.equal(loop.want, 3);

  // Přepočet upravené trasy: žádný dotaz na města.
  calls.length = 0;
  const ev = await planStay({ arrival: 'BGY', departure: 'FCO', transport: 'car', bases: [{ name: 'Milán', lat: 45.46, lon: 9.19, cc: 'IT' }, { name: 'Řím', lat: '41.89', lon: '12.48', cc: 'xx' }] }, deps);
  assert.equal(calls.length, 0);
  assert.equal(ev.mode, 'evaluate');
  assert.equal(ev.transfers.length, 1);
  assert.equal(ev.transfers[0].long, true);
  assert.equal(ev.pending, 0);
  assert.equal(new URL(ev.transfers[0].transitUrl).searchParams.get('origin'), 'Milán, Itálie');
  assert.equal(new URL(ev.transfers[0].transitUrl).searchParams.get('destination'), 'Řím, Itálie', 'neplatný kód země → země podle polohy');
  assert.deepEqual(ev.bases.map((b) => [b.name, b.cc, b.country]), [['Milán', 'IT', 'Itálie'], ['Řím', 'IT', 'Itálie']]);

  // Město u letiště mimo metropole: střed z geokódování (jen v okolí letiště a ve správné zemi).
  const geoCalls = [];
  const faro = await planStay({ arrival: 'FAO', nights: 4 }, { route: null, towns: async () => [], geo: async (q) => { geoCalls.push(q); return [{ cc: 'ES', lat: 37, lon: -8 }, { cc: 'PT', lat: 37.0194, lon: -7.9304 }]; } });
  assert.equal(geoCalls.length, 1);
  assert.deepEqual([faro.bases[0].lat, faro.bases[0].lon], [37.0194, -7.9304]);
  // Střed města, který zná prohlížeč, má přednost – ale jen u letiště.
  const hinted = await planStay({ arrival: 'FAO', nights: 4, city: { lat: 37.02, lon: -7.93 } }, { route: null, towns: async () => [], geo: async () => { throw new Error('nevolat'); } });
  assert.deepEqual([hinted.bases[0].lat, hinted.bases[0].lon], [37.02, -7.93]);
  const farHint = await planStay({ arrival: 'FAO', nights: 4, city: { lat: 50, lon: 14 } }, { route: null, towns: async () => [], geo: async () => [] });
  assert.ok(km(farHint.bases[0], { lat: 37.0194, lon: -7.9304 }) < 30, 'vzdálená poloha od klienta se ignoruje');

  // Wikidata nedostupná u všech bodů → chyba se status 503; u části → návrh s poznámkou.
  await assert.rejects(planStay({ arrival: 'MXP', nights: 4 }, { route: null, towns: async () => { throw new Error('WDQS 500'); }, geo }), (e) => e.status === 503);
  let n = 0;
  const part = await planStay({ arrival: 'BGY', departure: 'FCO', nights: 6 }, { route: null, towns: async () => { if (n++ === 0) throw new Error('timeout'); return ITALY; }, geo });
  assert.equal(part.degraded, true);
  assert.match(part.notes.at(-1), /Wikidat/);
});

test('findTowns: jen města z dotazu na výlety (stejná mezipaměť), bez hradů a krajů', async () => {
  const lit = (v) => ({ type: 'literal', value: String(v) });
  const uri = (v) => ({ type: 'uri', value: v });
  const row = (q, label, lat, lon, sl, type, extra = {}) => ({ item: uri(`http://www.wikidata.org/entity/${q}`), itemLabel: lit(label), lat: lit(lat), lon: lit(lon), sl: lit(sl), type: uri(`http://www.wikidata.org/entity/${type}`), ...extra });
  const rows = [
    row('Q2044', 'Florencie', 43.7696, 11.2558, 200, 'Q515', { en: uri('https://en.wikipedia.org/wiki/Florence'), cc: lit('IT') }),
    row('Q1891', 'Boloňa', 44.4939, 11.3428, 190, 'Q515', { en: uri('https://en.wikipedia.org/wiki/Bologna'), cc: lit('it') }),
    row('Q9', 'Santa Maria', 44.2, 11.0, 50, 'Q515', { en: uri('https://en.wikipedia.org/wiki/Santa_Maria_(Emilia)') }),
    row('Q1', 'Dóm ve Florencii', 43.7731, 11.256, 120, 'Q2977'),
    row('Q2', 'Uffizi', 43.7678, 11.2553, 110, 'Q33506'),
    row('Q3', 'Hrad Poppi', 43.7213, 11.7633, 60, 'Q23413'),
    row('Q4', 'Toskánsko', 43.35, 11.0167, 180, 'Q515', { itemDescription: lit('region Itálie') }),
  ];
  const stub = stubFetch((url) => {
    if (url.startsWith('https://query.wikidata.org/sparql')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('query'));
      return { body: { results: { bindings: q.includes('"120"') ? rows : [] } } };
    }
    return { body: { query: { pages: [] } } };
  });
  try {
    const towns = await findTowns({ lat: 44.4949, lon: 11.3426 });
    assert.deepEqual(towns.map((t) => t.name), ['Florencie', 'Boloňa', 'Santa Maria'], 'i město hned u bodu hledání (bod mezi letišti)');
    assert.deepEqual(towns.map((t) => t.nameEn), ['Florence', 'Bologna', 'Santa Maria, Emilia'], 'anglický název pro partnery ubytování');
    assert.deepEqual(towns.map((t) => [t.cc, t.country]), [['IT', 'Itálie'], ['IT', 'Itálie'], ['IT', 'Itálie']], 'země z Wikidat (P17), bez ní podle polohy');
    const q = decodeURIComponent(new URL(stub.calls[0].url).searchParams.get('query'));
    assert.match(q, /wdt:P17 \?ctry \. \?ctry wdt:P297 \?cc/);
    assert.equal(towns[0].tripKind, 'town');
    assert.deepEqual(towns[0].highlights, ['Dóm ve Florencii', 'Uffizi']);
    assert.ok(towns[0].score > 0);
    assert.equal(towns[0].url, 'https://en.wikipedia.org/wiki/Florence');
    assert.ok(!stub.calls.some((c) => c.url.includes('wikipedia.org/w/api.php')), 'bez dotazů na popisy z Wikipedie');
    const before = stub.calls.length;
    await findTowns({ lat: 44.4949, lon: 11.3426 });
    assert.equal(stub.calls.length, before, 'podruhé z mezipaměti');
  } finally {
    stub.restore();
  }
});

// Odpověď BRouteru (GeoJSON) s délkou v m a časem v s.
const brouterGeo = (m, s) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { 'track-length': String(m), 'total-time': String(s) } }] });

test('planStay přepočet nad limitem přepočtů na IP (allowRoutes): bez nových dotazů na BRouter – trasy z mezipaměti, jinak odhad', async () => {
  process.env.BROUTER_GAP_MS = '0';
  // body jinde než v ostatních testech (mezipaměť tras je společná)
  const A = { name: 'Siena', lat: 43.3189, lon: 11.3309, cc: 'IT' };
  const B = { name: 'Pisa', lat: 43.7229, lon: 10.4018, cc: 'IT' };
  const C = { name: 'Lucca', lat: 43.8431, lon: 10.5028, cc: 'IT' };
  let asked = 0;
  const allow = (v) => () => { asked++; return v; };
  const stub = stubFetch(() => ({ body: brouterGeo(90000, 4200) }));
  try {
    // v limitu: nové trasy z BRouteru (let PSA → Siena a Siena → Pisa), limit se ptá jednou za přepočet
    const ok = await planStay({ arrival: 'PSA', bases: [A, B] }, { allowRoutes: allow(true) });
    assert.deepEqual([stub.calls.length, asked, ok.transfers[0].basis, ok.legs.arrival.basis], [2, 1, 'route', 'route']);
    // nad limitem: spočítané úseky z mezipaměti, nový Pisa → Lucca odhadem a ne pending (prohlížeč se znovu neptá)
    const over = await planStay({ arrival: 'PSA', bases: [A, B, C] }, { allowRoutes: allow(false) });
    assert.equal(stub.calls.length, 2, 'žádný nový dotaz na BRouter');
    assert.deepEqual([over.mode, over.transfers.map((x) => x.basis), over.pending, asked], ['evaluate', ['route', 'estimate'], 0, 2]);
    // všechno v mezipaměti → limit se vůbec neptá (do limitu se počítají jen přepočty s novými trasami)
    await planStay({ arrival: 'PSA', bases: [A, B] }, { allowRoutes: allow(false) });
    assert.equal(asked, 2);
  } finally {
    stub.restore();
  }
});

test('POST /api/stayplan: přepočty mají vlastní limit na IP – nad ním 200 bez nových tras, limit hledání nespotřebují', async () => {
  process.env.BROUTER_GAP_MS = '0';
  const { createServer } = await import('../server/index.js');
  const { config } = await import('../server/config.js');
  const saved = { ...config };
  const local = globalThis.fetch; // na vlastní server bez podstrčení
  const stub = stubFetch(() => ({ body: brouterGeo(70000, 3600) }));
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const post = (body) => local(`http://127.0.0.1:${server.address().port}/api/stayplan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const place = (i) => ({ name: `Místo ${i}`, lat: 42.2 + i * 0.07, lon: 12.6 + i * 0.05, cc: 'IT' });
  Object.assign(config, { mock: false, searchesPer10Min: 1, rechecksPer10Min: 2 });
  try {
    for (const i of [0, 3]) {
      const r = await post({ arrival: 'FCO', bases: [place(i), place(i + 1)] });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).transfers[0].basis, 'route');
    }
    const n = stub.calls.length;
    assert.equal(n, 4, 'dva přepočty × (z letiště + přejezd)');
    const over = await post({ arrival: 'FCO', bases: [place(10), place(11)] });
    assert.equal(over.status, 200, 'nad limitem přepočtů žádné 429');
    const j = await over.json();
    assert.deepEqual([j.transfers[0].basis, j.legs.arrival.basis, j.pending, stub.calls.length], ['estimate', 'estimate', 0, n], 'bez nových dotazů na BRouter');
    const cached = await (await post({ arrival: 'FCO', bases: [place(0), place(1)] })).json();
    assert.equal(cached.transfers[0].basis, 'route', 'spočítané trasy i nad limitem z mezipaměti');
    // přepočty limit hledání nespotřebovaly: návrh (DEMO, bez sítě) projde, další už ne
    config.mock = true;
    assert.equal((await post({ arrival: 'FCO', nights: 3 })).status, 200);
    assert.equal((await post({ arrival: 'FCO', nights: 3 })).status, 429);
  } finally {
    Object.assign(config, saved);
    stub.restore();
    await new Promise((r) => server.close(r));
  }
});
