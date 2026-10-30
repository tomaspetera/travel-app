// Program ve městě nad živými daty (Lisabon, Praha – místa tak, jak je findPlaces předá plánovači):
// odlehlá místa mimo program, delší návštěva celku se sloučenými částmi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planItinerary, visitMinutes, keepOf, dayCapacities } from '../server/lib/itinerary.js';
import { haversineKm } from '../server/lib/geo.js';
import { LIS_PLACES, PRA_PLACES } from './fixtures/wikidata.js';

const LIS = { lat: 38.7223, lon: -9.1393 };
const PRA = { lat: 50.0875, lon: 14.4214 };
const places = (list) => list.map(([id, name, lat, lon, category, score, includes]) => ({ id, name, lat, lon, category, score, ...(includes ? { includes } : {}) }));
const end = (n) => `2026-10-${String(10 + n).padStart(2, '0')}`;
const plan = (list, center, n, extra = {}) => planItinerary(list, { center, start: '2026-10-11', end: end(n), pace: 'normal', arrivalTime: '09:00', interests: {}, ...extra });
const BRIDGE = 'Q233737'; // most Vasca da Gamy, 9,4 km od centra Lisabonu

test('program (živá data, Lisabon): most Vasca da Gamy za městem do pěšího programu nepatří', () => {
  const pool = places(LIS_PLACES);
  assert.ok(pool.some((p) => p.id === BRIDGE), 'most je mezi místy v okolí');
  for (const n of [3, 4, 5]) {
    const r = plan(pool, LIS, n);
    const items = r.days.flatMap((d) => d.items);
    assert.ok(!items.some((p) => p.id === BRIDGE), `${n} dní: ${r.days.map((d) => d.items.map((p) => p.name).join(' → ')).join(' | ')}`);
    assert.ok(items.length >= n * 4, `${n} dní: dny zůstanou plné (${items.length} míst)`);
    // nic z programu (mimo deset nejvýznamnějších) není přes 2,5 km od všeho ostatního
    const top = new Set([...pool].sort((a, b) => b.score - a.score).slice(0, 10).map((p) => p.id));
    for (const p of items) {
      if (top.has(p.id)) continue;
      assert.ok(items.some((q) => q !== p && haversineKm(p.lat, p.lon, q.lat, q.lon) <= 2.5), `${p.name} je odlehlé`);
    }
  }
  // připnuté místo zůstane, i když je daleko
  const pinned = pool.map((p) => (p.id === BRIDGE ? { ...p, score: p.score + 1000, pinned: true } : p));
  assert.ok(plan(pinned, LIS, 4).days.flatMap((d) => d.items).some((p) => p.id === BRIDGE), 'připnutý most v programu je');
});

test('program (živá data, Praha): celek se sloučenými částmi má delší návštěvu, „zahrnuje“ zůstane', () => {
  const r = plan(places(PRA_PLACES), PRA, 3);
  const items = r.days.flatMap((d) => d.items);
  const hrad = items.find((p) => p.name === 'Pražský hrad');
  assert.ok(hrad, 'Pražský hrad v programu');
  assert.equal(hrad.includes.length, 6, 'katedrála, Zlatá ulička, Starý královský palác…');
  assert.equal(hrad.visitMin, 100 + 120, 'hrad 100 min + 20 min za část, nejvýš +2 h');
  const radnice = items.find((p) => p.name === 'Staroměstská radnice');
  if (radnice) assert.equal(radnice.visitMin, 120 + 20, 'muzeum + orloj');
  const most = items.find((p) => p.name === 'Karlův most');
  if (most) assert.equal(most.visitMin, 15, 'bez částí beze změny');
  for (const d of r.days) assert.ok(d.minutes <= d.cap * 1.1, `den ${d.date}: ${d.minutes} / ${d.cap} min`);
});

test('malé místo bez ničeho v dosahu pěšky (živě Nizza Monferrato): den příjezdu s časem = výlet do okolí do 30 km, ne „volno“', () => {
  const NIZZA = { lat: 44.7747, lon: 8.3553 };
  const pool = [
    { id: 'Q1', name: 'Canelli', lat: 44.7213, lon: 8.2932, category: 'oldtown', score: 69.6 },
    { id: 'Q2', name: 'Borgo Impero', lat: 44.8150, lon: 8.3700, category: 'sight', score: 18.3 },
    { id: 'Q3', name: 'Asti', lat: 44.9003, lon: 8.2064, category: 'daytrip', score: 61.6 },
    { id: 'Q4', name: 'Janov', lat: 44.4072, lon: 8.9339, category: 'daytrip', score: 63.7 },
  ];
  const r = planItinerary(pool, { center: NIZZA, start: '2026-11-19', end: '2026-11-20', arrivalTime: '12:45', departureTime: '11:00', pace: 'normal', interests: {} });
  const [d1, d2] = r.days;
  assert.deepEqual([d1.kind, d1.half, d1.items.map((p) => p.name)], ['daytrip', true, ['Canelli']], 'nejzajímavější místo do 30 km (Janov 61 km ne)');
  assert.ok(d1.items[0].visitMin <= d1.cap);
  assert.deepEqual([d2.kind, d2.items.length], ['travel', 0], 'den odjezdu bez času zůstane bez programu');
  assert.ok(r.spare.some((p) => p.id === 'Q3'), 'Asti zůstane mezi dalšími místy');
  // místo s programem ve městě se nemění
  const city = planItinerary([...pool, { id: 'Q9', name: 'Piazza Garibaldi', lat: 44.7750, lon: 8.3560, category: 'square', score: 30 }], { center: NIZZA, start: '2026-11-19', end: '2026-11-20', arrivalTime: '12:45', departureTime: '11:00', pace: 'normal', interests: {} });
  assert.deepEqual([city.days[0].kind, city.days[0].items.map((p) => p.name)], ['city', ['Piazza Garibaldi']]);
});

test('visitMinutes: významný kostel déle, malá stavba s částmi ne na 2 h, hrad s částmi ano (round-6)', () => {
  // Bazilika sv. Petra (131 jazykových verzí) a Pantheon (kostel, 81) nejsou na 30 min; Jerónimos (UNESCO) taky ne
  assert.equal(visitMinutes({ category: 'church', sitelinks: 131 }), 60);
  assert.equal(visitMinutes({ category: 'church', sitelinks: 20, unesco: true }), 60);
  assert.equal(visitMinutes({ category: 'church', sitelinks: 25 }), 30, 'kostelík za rohem');
  // Torre de Belém: pomník (UNESCO) se 4 sloučenými částmi – dřív 20 + 80 = 1 h 40
  assert.equal(visitMinutes({ category: 'monument', sitelinks: 70, unesco: true, includes: ['a', 'b', 'c', 'd'] }), 70);
  assert.equal(visitMinutes({ category: 'tower', sitelinks: 30, includes: ['a', 'b', 'c'] }), 75);
  // Pražský hrad s katedrálou, Zlatou uličkou…: +20 min za část, nejvýš +2 h
  assert.equal(visitMinutes({ category: 'castle', sitelinks: 90, includes: ['a', 'b', 'c'] }), 160);
  assert.equal(visitMinutes({ category: 'castle', includes: Array(8).fill('x') }), 220);
  // Casa Batlló / Casa Milà: zajímavost UNESCO 75 min, ne 45; Casa Amatller (bez UNESCO, 21 jazyků) zůstane 45
  assert.equal(visitMinutes({ category: 'sight', sitelinks: 51, unesco: true }), 75);
  assert.equal(visitMinutes({ category: 'sight', sitelinks: 21 }), 45);
  // vlastní délka (kavárna, dům-muzeum) a neznámá kategorie
  assert.equal(visitMinutes({ category: 'sight', visitMin: 30, sitelinks: 99 }), 30);
  assert.equal(visitMinutes({ category: 'museum', visitMin: 75, unesco: true }), 75, 'Casa Vicens: dům-muzeum, ne 2 h');
  assert.equal(visitMinutes({ category: 'whatever' }), 45);
});

test('ZOO a zábavní park jednou za pobyt (s dětmi ne zoo každý den); připnutá zoo zůstane vždy', () => {
  const BER = { lat: 52.52, lon: 13.405 };
  const pool = [
    { id: 'Z1', name: 'Zoologischer Garten', lat: 52.5079, lon: 13.3377, category: 'zoo', score: 60 },
    { id: 'Z2', name: 'Tierpark', lat: 52.5041, lon: 13.5303, category: 'zoo', score: 50 },
    { id: 'T1', name: 'Legoland Discovery', lat: 52.5098, lon: 13.3736, category: 'theme', score: 40 },
    { id: 'T2', name: 'Jump House', lat: 52.53, lon: 13.41, category: 'theme', score: 35 },
    ...Array.from({ length: 12 }, (_, k) => ({ id: `M${k}`, name: `Muzeum ${k}`, lat: 52.52 + k * 0.002, lon: 13.40 + k * 0.002, category: 'museum', score: 20 - k })),
  ];
  const cats = (r) => r.days.flatMap((d) => d.items).map((p) => p.id);
  const kids = plan(pool, BER, 4, { interests: { zoo: 2, theme: 2, park: 1.4 } });
  const ids = cats(kids);
  assert.equal(ids.filter((x) => x.startsWith('Z')).length, 1, ids.join(','));
  assert.equal(ids.filter((x) => x.startsWith('T')).length, 1, ids.join(','));
  // připnutá zoo místo té nejznámější; připnuté obě = obě
  const pin = (set) => pool.map((p) => (set.includes(p.id) ? { ...p, pinned: true, score: p.score + 1000 } : p));
  const one = cats(plan(pin(['Z2']), BER, 4, { interests: { zoo: 2 } }));
  assert.ok(one.includes('Z2') && !one.includes('Z1'), one.join(','));
  const both = cats(plan(pin(['Z1', 'Z2']), BER, 4, { interests: { zoo: 2 } }));
  assert.ok(both.includes('Z1') && both.includes('Z2'), both.join(','));
});

test('stejně dlouhé dny: den s nejvýznamnějším místem co nejdřív (Avignon: Papežský palác 1. celý den, ne poslední)', () => {
  const AVI = { lat: 43.9493, lon: 4.8055 };
  // dvě čtvrti ~0,8 km od sebe: hlavní (palác, katedrála, most) a vedlejší (kostely, muzea)
  const main = [['P1', 'Papežský palác', 43.9508, 4.8076, 'castle', 120], ['P2', 'Katedrála Notre-Dame-des-Doms', 43.9514, 4.8078, 'church', 60], ['P3', 'Avignonský most', 43.9539, 4.8048, 'monument', 70], ['P4', 'Musée du Petit Palais', 43.9527, 4.8073, 'museum', 40]];
  const side = [['S1', 'Collégiale Saint-Didier', 43.9437, 4.8064, 'church', 30], ['S2', 'Musée Calvet', 43.9440, 4.8017, 'museum', 35], ['S3', 'Musée Angladon', 43.9446, 4.8045, 'museum', 30], ['S4', 'Chapelle de l’Oratoire', 43.9452, 4.8058, 'church', 20], ['S5', 'Palais du Roure', 43.9476, 4.8050, 'museum', 25], ['S6', 'Synagogue', 43.9479, 4.8098, 'church', 20]];
  // přílet ráno: dny 1 a 2 celé (stejný čas), den 3 odlet
  const r = planItinerary(places([...side, ...main]), { center: AVI, start: '2026-11-10', end: '2026-11-12', arrivalTime: '08:00', departureTime: '12:00', pace: 'normal', interests: {} });
  const days = r.days.map((d) => d.items.map((p) => p.name).join(' → ')).join(' | ');
  const full = r.days.filter((d) => d.cap === r.days[0].cap && d.items.length);
  assert.ok(full.length >= 2, days);
  assert.ok(full[0].items.some((p) => p.id === 'P1'), days);
});

// ✕ v programu: aplikace pošle dny míst, která v programu zůstala (keep = { id: datum }), a vyřazené místo v exclude
const dayOf = (r) => new Map(r.days.filter((d) => d.kind === 'city').flatMap((d) => d.items.map((p) => [p.id, d.date])));
const dropOne = (pool, r0, id, opts) => planItinerary(pool.filter((p) => p.id !== id), { ...opts, keep: Object.fromEntries([...dayOf(r0)].filter(([x]) => x !== id)) });

test('✕ v programu (16 míst na 3 dny): ostatní místa zůstanou ve svých dnech; ↩ Vrátit (bez keep) = původní program', () => {
  // dřív nové rozdělení k-means: po vyřazení jednoho místa zůstala ve svém dni jen 3 z 15
  const C = { lat: 48.2082, lon: 16.3738 };
  const CATS = ['museum', 'church', 'square', 'park', 'viewpoint', 'monument', 'palace', 'market', 'gallery', 'bridge', 'tower', 'sight'];
  const pool = Array.from({ length: 16 }, (_, i) => {
    const a = (i * 137.5 * Math.PI) / 180;
    const d = 0.004 + (i % 6) * 0.005;
    return { id: `P${i + 1}`, name: `Místo ${i + 1}`, lat: C.lat + Math.sin(a) * d, lon: C.lon + Math.cos(a) * d * 1.5, category: CATS[i % CATS.length], score: 100 - i * 4 };
  });
  const opts = { center: C, start: '2026-10-12', end: '2026-10-14', pace: 'normal', arrivalTime: '09:00', interests: {} };
  const r0 = planItinerary(pool, opts);
  const before = dayOf(r0);
  assert.equal(before.size, 16, 'všechna místa v programu');
  for (const id of before.keys()) {
    const after = dayOf(dropOne(pool, r0, id, opts));
    assert.ok(!after.has(id), `${id} vyřazené`);
    const moved = [...before].filter(([x, date]) => x !== id && after.get(x) !== date).map(([x]) => x);
    assert.ok(moved.length <= 0.2 * 15, `✕ ${id}: přesunutá ${moved.join(',')}`);
    assert.deepEqual(moved, [], `✕ ${id}: ideálně žádné`);
  }
  // ↩ Vrátit: místo zpátky a bez keep – plánovač je bez náhody, takže stejný program jako před ✕
  assert.deepEqual(planItinerary(pool, opts), r0);
});

test('✕ v programu (živá data, Lisabon): po každém vyřazení ostatní ve svých dnech, uvolněný čas doplní místo z okolí', () => {
  const pool = places(LIS_PLACES);
  for (const n of [3, 5]) {
    const opts = { center: LIS, start: '2026-10-11', end: end(n), pace: 'normal', arrivalTime: '09:00', interests: {} };
    const r0 = planItinerary(pool, opts);
    const before = dayOf(r0);
    let filled = 0;
    for (const [id, date] of before) {
      const r1 = dropOne(pool, r0, id, opts);
      const after = dayOf(r1);
      assert.deepEqual([...before].filter(([x, d]) => x !== id && after.get(x) !== d).map(([x]) => x), [], `${n} dní, ✕ ${id}`);
      if (r1.days.find((d) => d.date === date).items.some((p) => !before.has(p.id))) filled++;
      // den přes kapacitu jen tam, kde už byl (nejznámější místo v krátkém dni příletu)
      for (const d of r1.days.filter((x) => x.kind === 'city')) {
        const was = r0.days.find((x) => x.date === d.date);
        assert.ok(d.minutes <= d.cap * 1.1 || d.minutes <= was.minutes, `${n} dní, ✕ ${id}, ${d.date}: ${d.minutes} / ${d.cap} min`);
      }
    }
    // jen když je v okolí toho dne ještě něco, co stojí za to a vejde se – jinak tam zůstane volno
    assert.ok(filled > 0, `${n} dní: uvolněný čas ani jednou nedoplněný`);
  }
});

test('✕ v programu: místo ne v den, kdy je zavřené (Louvre v úterý), i když ho keep do toho dne dá', () => {
  const PAR = { lat: 48.8566, lon: 2.3522 };
  const pool = [
    { id: 'Q19675', name: 'Louvre', lat: 48.8606, lon: 2.3376, category: 'museum', score: 90 },
    ...Array.from({ length: 12 }, (_, k) => ({ id: `S${k}`, name: `Památka ${k}`, lat: 48.8566 + (k % 4) * 0.004, lon: 2.3422 + Math.floor(k / 4) * 0.006, category: ['church', 'square', 'monument', 'sight'][k % 4], score: 60 - k })),
  ];
  // po 12. 10. – st 14. 10. 2026; v úterý 13. 10. má Louvre zavřeno
  const opts = { center: PAR, start: '2026-10-12', end: '2026-10-14', pace: 'normal', arrivalTime: '09:00', interests: {} };
  const r0 = planItinerary(pool, opts);
  assert.notEqual(dayOf(r0).get('Q19675'), '2026-10-13');
  const keep = Object.fromEntries([...dayOf(r0)].filter(([x]) => x !== 'S0').map(([x, d]) => [x, x === 'Q19675' ? '2026-10-13' : d]));
  const r1 = planItinerary(pool.filter((p) => p.id !== 'S0'), { ...opts, keep });
  assert.notEqual(dayOf(r1).get('Q19675'), '2026-10-13', r1.days.map((d) => d.items.map((p) => p.name).join(', ')).join(' | '));
});

test('bez keep (i prázdný, neplatný nebo bez místa z programu) program beze změny – jako před ✕', () => {
  const pool = places(LIS_PLACES);
  const r = plan(pool, LIS, 3);
  // stejný program jako před přidáním keep (Lisabon, 3 dny)
  assert.deepEqual(r.days.map((d) => d.items.map((p) => p.id)), [
    ['Q212459', 'Q2657972', 'Q1464499', 'Q1146936', 'Q1470414', 'Q1078864', 'Q99636'],
    ['Q721152', 'Q1478288', 'Q1144592', 'Q272781', 'Q1133712', 'Q215003'],
    ['Q168001', 'Q999002', 'Q432290', 'Q636780', 'Q1776168', 'Q1601019'],
  ]);
  for (const keep of [undefined, null, {}, { Q404: '2026-10-11' }, { Q212459: '2026-10-20' }, { Q212459: 'zítra' }]) {
    assert.deepEqual(plan(pool, LIS, 3, { keep }), r, JSON.stringify(keep));
  }
});

test('keepOf (api/itinerary): jen prostý objekt do 300 položek, id do 120 znaků a datum v termínu – jinak nic', () => {
  const k = (raw) => keepOf(raw, '2026-10-11', '2026-10-13');
  assert.deepEqual(k({ Q1: '2026-10-11', Q2: '2026-10-13' }), { Q1: '2026-10-11', Q2: '2026-10-13' });
  // neplatné položky pryč, platné zůstanou
  const bad = { Q2: '2026-10-14', Q3: '2026-10-10', Q4: 20261012, Q5: ['2026-10-12'], Q6: '12. 10. 2026', Q7: null, Q8: '2026-13-45', '': '2026-10-12', [`Q${'9'.repeat(120)}`]: '2026-10-12' };
  assert.deepEqual(k({ Q1: '2026-10-12', ...bad }), { Q1: '2026-10-12' });
  for (const raw of [undefined, null, 'Q1', 5, true, ['2026-10-11'], [['Q1', '2026-10-11']], {}, bad, new Map([['Q1', '2026-10-11']]), Object.assign(Object.create(null), { Q1: '2026-10-11' })]) {
    assert.equal(k(raw), undefined, JSON.stringify(raw));
  }
  // víc než 300 položek z aplikace nepřijde (31 dní programu) – pak celé pryč
  const many = Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`Q${i}`, '2026-10-12']));
  assert.equal(k(many), undefined);
  assert.equal(Object.keys(k(Object.fromEntries(Object.entries(many).slice(0, 300)))).length, 300);
  // „__proto__“ z JSON zůstane obyčejným klíčem
  const proto = k(JSON.parse('{"__proto__":"2026-10-12","Q1":"2026-10-12"}'));
  assert.deepEqual([Object.keys(proto), Object.getPrototypeOf(proto)], [['__proto__', 'Q1'], Object.prototype]);
});

test('dayCapacities: první den od 9:00 jen s příletem do 7:30 (Objevuj posílá 07:30 – bez příletu), jinak 1,5 h po příletu', () => {
  const from = (arrivalTime) => dayCapacities({ start: '2026-11-07', end: '2026-11-08', arrivalTime })[0].from;
  assert.equal(from('07:30'), 9 * 60, 'Objevuj: jako ostatní dny');
  assert.equal(from('09:00'), 10.5 * 60, 'přílet v 9:00 → od 10:30');
  assert.equal(from('00:40'), 9 * 60, 'noční přílet ne dřív než v 9:00');
  assert.equal(dayCapacities({ start: '2026-11-07', end: '2026-11-08', arrivalTime: '07:30' })[1].from, 9 * 60);
  // Objevuj: program ve městě bez příletu
  const pl = readFileSync(new URL('../public/js/places.js', import.meta.url), 'utf8');
  assert.match(pl, /makePlan\(st, p, \{ start: ex\.start, end: plusDays\(ex\.start, ex\.days - 1\), arrivalTime: '07:30', departureTime: null \}/);
});
