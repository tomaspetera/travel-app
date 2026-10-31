// Túra na každý den v horách a přírodě (server/lib/hikeplan.js): druh cíle, výběr cílů na dny, start u cíle, čas chůze
// a obtížnost, občerstvení po cestě, varianty do deště a s dětmi a celý plán bez sítě (Wikidata, BRouter a Overpass
// jako náhrady – skutečné odpovědi z Krkonoš v test/fixtures/hike-krkonose.js, Overpass ručně sestavený).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import * as F from './fixtures/hike-krkonose.js';
import * as P from './fixtures/program-cities.js';

process.env.BROUTER_GAP_MS = '0';
const H = await import('../server/lib/hikeplan.js');
const { parseRoute, hikeMinutes, hikeThereBack } = await import('../server/lib/bike.js');
const { haversineKm } = await import('../server/lib/geo.js');

const PLACES = F.places(F.PEC_PLACES);
const SNEZKA_LEG = (() => { const r = parseRoute(F.BROUTER_PEC_SNEZKA); return { ...r, minutes: hikeMinutes(r.km, r.ascent, r.descent) }; })();
const dist = (a, b) => haversineKm(a.lat, a.lon, b.lat, b.lon);
const show = (r) => r.days.map((d) => `${d.date} ${d.type}: ${d.hike ? `${d.hike.goal.name} (${d.hike.goal.kind}) z: ${d.hike.start?.name} ${d.hike.km} km` : d.note}`).join('\n');
// náhrady zdrojů: místa kolem Pece, start u Sněžky, trasa na Sněžku skutečná, jinam vymyšlená (tam a zpět × 1,35, 90 m/km)
const fakeRoute = async (s, g) => {
  if (g.name === 'Sněžka' && s.name === 'Pec pod Sněžkou') return SNEZKA_LEG;
  const km = Math.round(2 * dist(s, g) * 1.35 * 10) / 10;
  const up = Math.round(km * 45);
  return { km, ascent: up, descent: up, minutes: hikeMinutes(km, up, up), geometry: [[s.lon, s.lat, 800], [g.lon, g.lat, 800 + up], [s.lon, s.lat, 800]], trailPct: 80 };
};
const deps = (extra = {}) => ({ places: async () => PLACES, trailheads: async () => F.trailheads(F.TH_SNEZKA), route: fakeRoute, food: async () => H.foodRows(F.OVERPASS_FOOD), ...extra });

test('druh cíle z Wikidat: vrchol, hřbet, skály, voda, vyhlídka, chata, hrad; národní park, osada, zaniklá bouda a kostel ne', () => {
  const kind = Object.fromEntries(PLACES.map((p) => [p.name, H.goalKind(p)]));
  assert.equal(kind['Sněžka'], 'summit');
  assert.equal(kind['Luční hora'], 'summit');
  assert.equal(kind['Stříbrný hřbet'], 'ridge');
  assert.equal(kind['Kozí hřbety'], 'ridge');
  assert.equal(kind['Dívčí kameny'], 'rocks', 'typ hora, ale název skal');
  assert.equal(kind['Podgórna Waterfall'], 'water');
  assert.equal(kind['Mechové jezírko'], 'water');
  assert.equal(kind['Złoty Widok'], 'view');
  assert.equal(kind['Samotnia'], 'hut', 'popis „horská chata“');
  assert.equal(kind['Petrovy boudy'], 'hut');
  assert.equal(kind['Břecštejn'], 'castle');
  for (const no of ['Krkonošský národní park', 'Pomezní Boudy', 'Rennerova bouda', 'Horní Mísečky', 'Kostel Wang', 'Stachelberg', 'Hrádeček']) assert.equal(kind[no], null, no);
  // bez druhu ve Wikidatech (starší mezipaměť) podle názvu, i vícejazyčně
  assert.equal(H.goalKind({ name: 'Pančavský vodopád', category: 'nature' }), 'water');
  assert.equal(H.goalKind({ name: 'Szklarka Waterfall', category: 'nature' }), 'water');
  assert.equal(H.goalKind({ name: 'Štrbské pleso', category: 'nature' }), 'water');
  assert.equal(H.goalKind({ name: 'Königssee', category: 'nature' }), 'water');
  assert.equal(H.goalKind({ name: 'Punkevní jeskyně', category: 'nature' }), 'cave');
  assert.equal(H.goalKind({ name: 'Pravčická brána', category: 'nature' }), 'rocks');
  assert.equal(H.goalKind({ name: 'Szrenica', category: 'nature' }), 'summit');
  assert.equal(H.goalKind({ name: 'Rozhledna Javorový vrch', category: 'tower' }), 'view');
  assert.equal(H.goalKind({ name: 'Hrad Chojnik', category: 'castle' }), 'castle');
  assert.equal(H.goalKind({ name: 'Národní park Šumava', category: 'nature' }), null);
});

test('kandidáti: jen cíle túr do 18 km, stejné místo jednou, vyřazené (✕ jiný cíl) ne', () => {
  const c = H.goalCandidates(PLACES, F.PEC);
  assert.equal(c[0].name, 'Sněžka');
  assert.ok(c.every((x) => H.GOAL_KINDS.includes(x.kind) && x.d <= 18));
  assert.ok(!c.some((x) => /národní park|Kaple/.test(x.name)));
  assert.equal(c.find((x) => x.name === 'Sněžka').d, 5);
  assert.ok(!H.goalCandidates(PLACES, F.PEC, { exclude: new Set(['Q617511']) }).some((x) => x.name === 'Sněžka'));
});

test('čas chůze DIN 33466 a obtížnost: Pec → Sněžka → Pec (BRouter) 13,9 km, 934 m = 6 h 43 min, náročná', () => {
  assert.equal(SNEZKA_LEG.km, 13.9);
  assert.equal(SNEZKA_LEG.ascent, 934);
  assert.equal(SNEZKA_LEG.minutes, 403);
  assert.ok(Math.max(...SNEZKA_LEG.geometry.map((c) => c[2])) >= 1590, 'vrchol Sněžky ~1 600 m');
  // DIN 33466: 4 km/h, 300 m nahoru a 500 m dolů za hodinu, kratší z obou časů se přičte polovinou
  assert.equal(hikeMinutes(8, 0, 0), 120);
  assert.equal(hikeMinutes(8, 600, 600), Math.round((120 / 60 / 2 + 600 / 300 + 600 / 500) * 60));
  assert.deepEqual(H.difficulty(SNEZKA_LEG), { level: 3, label: 'náročná' });
  assert.deepEqual(H.difficulty({ km: 7, ascent: 250, minutes: 150 }), { level: 1, label: 'lehká' });
  assert.deepEqual(H.difficulty({ km: 11, ascent: 640, minutes: 285 }), { level: 2, label: 'střední' });
  assert.equal(H.difficulty({ km: 22, ascent: 300, minutes: 340 }).level, 3, 'přes 20 km');
  assert.equal(H.difficulty({ km: 9, ascent: null, minutes: null }), null, 'odhad bez času');
  // odhad bez trasy: vzdušná čára × 1,35 tam a zpět, na půl km
  assert.deepEqual(H.estimateLeg(F.PEC, F.SNEZKA), { km: 13.5, ascent: null, descent: null, minutes: null, estimate: true });
});

test('dny: den příjezdu 1,5 h po příjezdu a odjezdu 3 h před odjezdem kratší; bez časů (Objevuj) celé dny; s dětmi nejvýš 4 h', () => {
  const w = H.hikeWindows({ start: '2027-07-09', end: '2027-07-11', arrivalTime: '15:30', departureTime: '14:00' });
  assert.deepEqual(w.map((x) => [x.type, x.from, x.to, x.budget]), [['rest', 1020, 1080, 50], ['full', 510, 1080, 475], ['short', 510, 660, 125]]);
  assert.ok(w[0].arrival && w[2].departure);
  assert.ok(H.hikeWindows({ start: '2027-07-09', end: '2027-07-12' }).every((x) => x.type === 'full' && x.budget === 475));
  assert.ok(H.hikeWindows({ start: '2027-07-09', end: '2027-07-10', kids: true }).every((x) => x.type === 'full' && x.budget === 240));
  assert.equal(H.hikeWindows({ start: '2027-07-09', end: '2027-07-09', arrivalTime: '09:00', departureTime: '20:00' })[0].type, 'full', 'jednodenní');
  // endBy (průvodce: z ubytování na letiště) zkrátí den odjezdu i pod 3 h před odletem, nikdy ho neprodlouží
  const by = (endBy) => H.hikeWindows({ start: '2027-07-09', end: '2027-07-11', arrivalTime: '15:30', departureTime: '14:00', endBy }).at(-1).to;
  assert.deepEqual([by('10:00'), by('12:30'), by(null)], [600, 660, 660]);
});

test('cíle na dny: hlavní vrchol v nejdelší den, každý den jiný cíl v jiné části hor, kratší den blízko; s dětmi blíž', () => {
  const c = H.goalCandidates(PLACES, F.PEC);
  const w = H.hikeWindows({ start: '2027-07-09', end: '2027-07-12', arrivalTime: '15:30', departureTime: '14:00' });
  const g = H.pickGoals(c, w);
  assert.equal(g[0], null, 'den příjezdu v 15:30 bez túry');
  assert.equal(g[1].name, 'Sněžka');
  assert.equal(g[1].theme, 'summit');
  const used = g.filter(Boolean);
  assert.equal(new Set(used.map((x) => x.id)).size, used.length, 'nic dvakrát');
  for (const a of used) for (const b of used) if (a !== b) assert.ok(dist(a, b) >= H.SPACING_KM, `${a.name} – ${b.name}`);
  assert.ok(g[3].d <= 3.5, `kratší den odjezdu blízko: ${g[3].name} ${g[3].d} km`);
  // s dětmi: napřed cíle do 3,7 km (tam a zpět ~10 km), Sněžka (5 km) až není nic bližšího
  const kids = H.pickGoals(c, H.hikeWindows({ start: '2027-07-09', end: '2027-07-10', kids: true }), { kids: true });
  assert.ok(kids.every((x) => x && x.d <= 3.7), kids.map((x) => `${x.name} ${x.d}`).join(', '));
  // druh cíle se střídá (ne tři vodopády), když je z čeho: Objevuj se středem Krkonoš (KRK), start u cíle
  const krk = H.goalCandidates(P.places(P.KRK), P.KRK_C);
  const k = H.pickGoals(krk, H.hikeWindows({ start: '2027-07-09', end: '2027-07-11' }), { fromBase: false });
  assert.deepEqual(k.map((x) => x.name), ['Sněžka', 'Hrad Chojnik', 'Pančavský vodopád']);
  assert.deepEqual(k.map((x) => x.kind), ['summit', 'castle', 'water']);
});

test('start túry: do 5,5 km z ubytování pěšky, dál start u cíle (parkoviště > nádraží > obec) na straně ubytování; nic → null', () => {
  const th = F.trailheads(F.TH_SNEZKA);
  assert.equal(H.pickStart({ ...F.SNEZKA }, F.PEC, th).kind, 'base');
  // Objevuj se středem Krkonoš: start u Sněžky v Karpaczi (obec s 45 jazykovými verzemi, 3,5 km)
  const s = H.pickStart(F.SNEZKA, P.KRK_C, th, { fromBase: false });
  assert.deepEqual([s.name, s.kind, s.toGoal], ['Karpacz', 'town', 3.5]);
  // bez polské strany Pec pod Sněžkou: o 0,4 km dál než Šímovy Chalupy, ale známější a na straně středu oblasti
  // (horské osady s jedním článkem jako Růžohorky ne)
  assert.equal(H.pickStart(F.SNEZKA, P.KRK_C, th.filter((x) => !/Karpacz|Wilcza/.test(x.name)), { fromBase: false }).name, 'Pec pod Sněžkou');
  // parkoviště u samotného cíle: dojede se až k němu
  const lake = { lat: 49, lon: 14 };
  assert.equal(H.pickStart(lake, { lat: 49.1, lon: 14, label: 'Hotel' }, [{ name: 'Parkoviště u jezera', kind: 'parking', lat: 49.002, lon: 14, sitelinks: 0 }]).name, 'Parkoviště u jezera');
  // nic u cíle: z ubytování do 8 km, dál null (jen odhad a odkaz do Mapy.com)
  assert.equal(H.pickStart(lake, { lat: 49.06, lon: 14, label: 'Hotel' }, []).kind, 'base');
  assert.equal(H.pickStart(lake, { lat: 49.1, lon: 14, label: 'Hotel' }, []), null);
  assert.equal(H.pickStart(F.SNEZKA, P.KRK_C, [], { fromBase: false }), null);
});

test('občerstvení po cestě z Overpass: chaty a restaurace do 150 m od trasy v pořadí po cestě, ne u startu, ne mimo trasu, bez názvu ne', () => {
  const rows = H.foodRows(F.OVERPASS_FOOD);
  assert.equal(rows.length, 4, 'bez názvu pryč');
  assert.deepEqual(rows.find((r) => r.name === 'Luční bouda'), { id: 'way/104', name: 'Luční bouda', kind: 'hut', lat: 50.7344, lon: 15.6971 }, 'cesta (way) se středem');
  const on = H.foodOnRoute(rows, SNEZKA_LEG.geometry);
  assert.deepEqual(on.map((f) => [f.name, f.kind]), [['Bouda Růžohorky', 'hut'], ['Česká poštovna', 'cafe']]);
  assert.ok(on[0].km > 2.5 && on[0].km < 3.5, `Růžohorky ~3 km: ${on[0].km}`);
  assert.ok(on[1].km > 6 && on[1].km < 7, `Česká poštovna na vrcholu (~6,4 km): ${on[1].km}`);
  const q = H.foodQuery([H.linePoints(SNEZKA_LEG.geometry), [[15.7, 50.7], [15.71, 50.71]]]);
  assert.match(q, /^\[out:json\]\[timeout:20\];/);
  assert.equal((q.match(/"tourism"="alpine_hut"/g) || []).length, 2, 'pro každou čáru dne');
  assert.match(q, /\["amenity"~"\^\(restaurant\|cafe\|pub\|biergarten\)\$"\]\["name"\]\(around:150,50\.692/);
  assert.match(q, /out center tags qt;$/);
  assert.ok(H.linePoints(SNEZKA_LEG.geometry).length <= 40);
});

test('varianty: do deště jeskyně, chata po cestě, blízký nižší cíl, nebo otočit v půlce; s dětmi krátká túra v pořádku, jinak chata nebo hodina', () => {
  const food = H.foodOnRoute(H.foodRows(F.OVERPASS_FOOD), SNEZKA_LEG.geometry);
  const s = { ...F.PEC, kind: 'base' };
  const goal = { id: 'Q617511', ...F.SNEZKA };
  assert.deepEqual(H.rainAlt(SNEZKA_LEG, food, [], s, goal), { kind: 'hut', name: 'Bouda Růžohorky', km: 6.2, minutes: 180 });
  const cave = { id: 'c', name: 'Bozkovské dolomitové jeskyně', kind: 'cave', lat: 50.70, lon: 15.75 };
  assert.equal(H.rainAlt(SNEZKA_LEG, food, [cave], s, goal).kind, 'cave', 'pod střechou má přednost');
  assert.deepEqual(H.rainAlt({ ...SNEZKA_LEG }, [], [], s, goal), { kind: 'turn', km: 7, minutes: 202 });
  const fall = { id: 'w', name: 'Vodopád', kind: 'water', lat: 50.70, lon: 15.735 };
  assert.deepEqual(H.rainAlt(SNEZKA_LEG, [], [fall], s, goal), { kind: 'goal', name: 'Vodopád', lat: 50.70, lon: 15.735, km: 2.5, estimate: true });
  assert.deepEqual(H.kidsAlt({ km: 6, ascent: 300, minutes: 140 }, [], [], s, goal), { kind: 'ok' });
  assert.deepEqual(H.kidsAlt(SNEZKA_LEG, food, [], s, goal), { kind: 'turn', minutes: 60 }, 'Růžohorky 3,1 km do kopce – s dětmi daleko');
  assert.deepEqual(H.kidsAlt(SNEZKA_LEG, [{ name: 'Chata', kind: 'hut', km: 2 }], [], s, goal), { kind: 'hut', name: 'Chata', km: 4, minutes: 116 });
  assert.deepEqual(H.kidsAlt(SNEZKA_LEG, [], [], s, goal), { kind: 'turn', minutes: 60 });
});

test('pořadí túr podle času dnů: dlouhá túra ne v den příjezdu, při shodě beze změny', () => {
  const w = [{ budget: 200 }, { budget: 475 }, { budget: 475 }];
  const legs = [{ minutes: 400 }, { minutes: 150 }, null];
  assert.deepEqual(H.fitOrder(legs, w), { idx: [0, 1], perm: [1, 0] });
  const fine = [{ minutes: 150 }, { minutes: 400 }, null];
  const r = H.fitOrder(fine, w);
  assert.equal(r.perm, r.idx, 'vše se vejde – beze změny');
});

test('celý plán Krkonoše 3 dny z Pece pod Sněžkou (přílet 10:00, odjezd 18:00): Sněžka, jiné cíle, trasa, chaty, varianty, položky pro plánovač', async () => {
  const q = { ...F.PEC, start: '2027-07-09', end: '2027-07-11', arrivalTime: '10:00', departureTime: '18:00' };
  const r = await H.planHikes(q, deps());
  assert.deepEqual(r.area, { cs: 'Krkonoše', kind: 'range', sub: 'pohoří a národní park, Sněžka' });
  assert.equal(r.days.length, 3);
  assert.ok(r.days.every((d) => d.hike && d.hike.start.kind === 'base'), show(r));
  const sn = r.days.find((d) => d.hike.goal.name === 'Sněžka');
  assert.equal(sn.date, '2027-07-10', 'hlavní vrchol v celý den');
  assert.deepEqual([sn.hike.km, sn.hike.ascent, sn.hike.minutes, sn.hike.difficulty.label, sn.hike.back], [13.9, 934, 403, 'náročná', '16:34']);
  assert.ok(sn.hike.top >= 1590 && sn.hike.top <= 1603, `vrchol ${sn.hike.top}`);
  assert.deepEqual(sn.hike.food.map((f) => f.name), ['Bouda Růžohorky', 'Česká poštovna']);
  assert.equal(sn.hike.rain.kind, 'hut');
  assert.ok(sn.hike.exposed);
  assert.ok(sn.hike.geometry.length <= 160);
  assert.match(sn.hike.mapyUrl, /^https:\/\/mapy\.com\/fnc\/v1\/route\?mapset=outdoor&start=15\.73330%2C50\.69170&end=15\.73330%2C50\.69170&routeType=foot_hiking&waypoints=/);
  assert.match(sn.hike.googleUrl, /travelmode=walking/);
  // položka pro plánovač cesty (shrnutí, kalendář, Dnes na cestě)
  assert.deepEqual(sn.items, [{ id: 'Q617511', name: '🥾 Sněžka – z: Pec pod Sněžkou', lat: 50.73611, lon: 15.74028, category: 'nature', visitMin: 403, note: '13,9 km, ↗ 934 m, ~6 h 43 min chůze' }]);
  const names = r.days.map((d) => d.hike.goal.name);
  assert.equal(new Set(names).size, 3);
  for (const d of r.days) assert.ok(!d.hike.long || d.type === 'full', `${d.date}: ${d.hike.goal.name} se do dne nevejde`);
  assert.ok(r.spare.length && !r.spare.some((x) => names.includes(x.name)));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.kids, false);
});

test('plán bez sítě: BRouter neodpoví → odhad a varování, Overpass neodpoví → občerstvení „nevím“, limit dotazů projde, nejvýš 6 tras', async () => {
  const down = async () => { throw Object.assign(new Error('BRouter 503'), { status: 503 }); };
  const q = { ...F.PEC, start: '2027-07-09', end: '2027-07-11' };
  const r = await H.planHikes(q, deps({ route: down, food: async () => { throw new Error('Overpass timeout'); } }));
  assert.ok(r.days.every((d) => d.hike.estimate && d.hike.minutes === null && d.hike.difficulty === null && d.hike.food === null), show(r));
  assert.match(r.warnings[0], /Plánovač tras teď neodpovídá – u túr je odhad vzdušnou čarou/);
  assert.match(r.days[0].hike.mapyUrl, /routeType=foot_hiking/, 'odkaz do Mapy.com i bez trasy');
  // jen dvě chyby za sebou – pak už BRouter nezkouší (výpadek)
  let calls = 0;
  await H.planHikes({ ...q, end: '2027-07-14' }, deps({ route: async (...a) => { calls++; return down(...a); } }));
  assert.equal(calls, 2);
  // nejvýš 6 tras na plán, další dny odhadem
  let n = 0;
  const week = await H.planHikes({ ...q, end: '2027-07-16' }, deps({ route: async (s, g) => { n++; return fakeRoute(s, g); } }));
  assert.equal(n, H.MAX_ROUTES);
  assert.equal(week.days.filter((d) => d.hike && !d.hike.estimate).length, 6);
  assert.match(week.warnings[0], /Trasu jsem spočítal jen u 6 túr/);
  // limit dotazů Objevuj (onMiss) se neschová za odhad
  const limit = Object.assign(new Error('limit'), { code: 'LIMIT' });
  await assert.rejects(H.planHikes(q, deps({ route: async () => { throw limit; } })), (e) => e.code === 'LIMIT');
  await assert.rejects(H.planHikes(q, deps({ food: async () => { throw limit; } })), (e) => e.code === 'LIMIT');
  // nic k túře (město bez hor): prázdné dny s vysvětlením
  const city = await H.planHikes({ lat: 50.0875, lon: 14.4213, label: 'Praha', start: '2027-07-09', end: '2027-07-10' }, deps({ places: async () => P.places(P.ROM) }));
  assert.ok(city.days.every((d) => !d.hike && d.note === 'nogoal'));
  assert.match(city.warnings[0], /V okolí jsem nenašel cíle túr/);
});

test('plán ze středu oblasti (Objevuj, fromBase false): start každý den u cíle, bez startu jen cíl s odkazem do Mapy.com', async () => {
  const r = await H.planHikes({ ...P.KRK_C, label: 'Krkonoše', start: '2027-07-09', end: '2027-07-11', fromBase: false, radius: 20 },
    deps({ places: async () => P.places(P.KRK), trailheads: async (lat) => (Math.abs(lat - 50.736) < 0.01 ? F.trailheads(F.TH_SNEZKA) : []) }));
  const sn = r.days.find((d) => d.hike.goal.name === 'Sněžka').hike;
  assert.deepEqual([sn.start.name, sn.start.kind], ['Karpacz', 'town']);
  const none = r.days.find((d) => d.hike.goal.name === 'Hrad Chojnik').hike;
  assert.equal(none.start, null);
  assert.match(none.mapyUrl, /^https:\/\/mapy\.com\/fnc\/v1\/showmap\?mapset=outdoor&center=/);
  assert.equal(r.fromBase, false);
});

test('oblast hor podle polohy: Pec pod Sněžkou = Krkonoše (pohoří před Sněžkou), Poprad = Vysoké Tatry, Praha nic', () => {
  assert.equal(H.natureAreaAt(F.PEC.lat, F.PEC.lon).cs, 'Krkonoše');
  assert.equal(H.natureAreaAt(49.0614, 20.298).cs, 'Vysoké Tatry');
  assert.equal(H.natureAreaAt(50.0875, 14.4213), null);
  assert.equal(H.natureAreaAt(NaN, 14), null);
});

test('trasa túry tam a zpět: BRouter start → cíl → start pěším profilem, bez zálohy Mapy.com (kredity)', async () => {
  const stub = stubFetch((url) => (url.includes('brouter') ? { body: F.BROUTER_PEC_SNEZKA } : { status: 500, body: 'no' }));
  try {
    const r = await hikeThereBack({ lat: 50.69171, lon: 15.73333 }, { lat: 50.73611, lon: 15.74028 });
    const u = new URL(stub.calls[0].url);
    assert.equal(u.searchParams.get('profile'), 'hiking-mountain');
    assert.equal(u.searchParams.get('lonlats'), '15.7333,50.6917|15.7403,50.7361|15.7333,50.6917');
    assert.equal(u.searchParams.get('profile:hiking_routes_preference'), '0.6', 'přednost značeným trasám');
    assert.deepEqual([r.km, r.ascent, r.minutes], [13.9, 934, 403]);
  } finally {
    stub.restore();
  }
  const down = stubFetch(() => ({ status: 503, body: 'down' }));
  try {
    await assert.rejects(hikeThereBack({ lat: 50.1, lon: 15.1 }, { lat: 50.12, lon: 15.12 }));
    assert.ok(!down.calls.some((c) => c.url.includes('mapy')), 'Mapy.com se nevolá');
  } finally {
    down.restore();
  }
});

test('Overpass: jeden POST na plán, v mezipaměti, po výpadku 10 minut nic', async () => {
  H._resetOverpass();
  const lines = [[[15.7, 50.7], [15.72, 50.72]]];
  const stub = stubFetch((url, init) => (url.includes('overpass') ? { body: F.OVERPASS_FOOD } : { status: 404 }));
  try {
    const rows = await H.foodAlong(lines);
    assert.equal(rows.length, 4);
    assert.equal(stub.calls[0].init.method, 'POST');
    assert.match(decodeURIComponent(String(stub.calls[0].init.body)), /^data=\[out:json\]/);
    await H.foodAlong(lines);
    assert.equal(stub.calls.length, 1, 'podruhé z mezipaměti');
  } finally {
    stub.restore();
  }
  const bad = stubFetch(() => ({ status: 504, body: 'busy' }));
  try {
    await assert.rejects(H.foodAlong([[[15.8, 50.8], [15.81, 50.81]]]));
    await assert.rejects(H.foodAlong([[[15.9, 50.9], [15.91, 50.91]]]), /chvíli mimo provoz/);
    assert.equal(bad.calls.length, 1);
  } finally {
    bad.restore();
    H._resetOverpass();
  }
});

test('Overpass: plány túr, které čekají ve frontě, když Overpass vypadne, už ho nezkoušejí (nečekají každý 15 s)', async () => {
  H._resetOverpass();
  const slow = stubFetch(async () => { await new Promise((r) => setTimeout(r, 30)); return { status: 504, body: 'busy' }; });
  try {
    const runs = await Promise.allSettled([1, 2, 3, 4].map((i) => H.foodAlong([[[16 + i / 100, 50.5], [16.01 + i / 100, 50.51]]])));
    assert.ok(runs.every((r) => r.status === 'rejected'), 'občerstvení „nevím“ u všech');
    assert.equal(slow.calls.length, 1, 'jen první dotaz – ostatní po výpadku hned');
    assert.ok(runs.slice(1).every((r) => /chvíli mimo provoz/.test(r.reason.message)));
  } finally {
    slow.restore();
    H._resetOverpass();
  }
});

test('DEMO: stejný plánovač nad vymyšlenými cíli – túry, chata po cestě, s dětmi varianta', async () => {
  const r = await H.mockHikePlan({ lat: 50.6917, lon: 15.7333, label: 'Pec pod Sněžkou', start: '2027-07-09', end: '2027-07-11', kids: true });
  assert.equal(r.days.length, 3);
  assert.ok(r.days.every((d) => d.hike && d.hike.goal.name.startsWith('Ukázkov') && d.hike.kids));
  assert.ok(r.days.some((d) => d.hike.food.some((f) => f.name === 'Demo chata')));
});
