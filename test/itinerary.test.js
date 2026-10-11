// Program ve městě nad živými daty (Lisabon, Praha – místa tak, jak je findPlaces předá plánovači):
// odlehlá místa mimo program, delší návštěva celku se sloučenými částmi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planItinerary } from '../server/lib/itinerary.js';
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
