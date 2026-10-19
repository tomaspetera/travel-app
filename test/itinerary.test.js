// Program ve městě nad živými daty (Lisabon, Praha – místa tak, jak je findPlaces předá plánovači):
// odlehlá místa mimo program, delší návštěva celku se sloučenými částmi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planItinerary, visitMinutes } from '../server/lib/itinerary.js';
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
  // vlastní délka (kavárna) a neznámá kategorie
  assert.equal(visitMinutes({ category: 'sight', visitMin: 30, sitelinks: 99 }), 30);
  assert.equal(visitMinutes({ category: 'whatever' }), 45);
});
