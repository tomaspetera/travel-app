import { test } from 'node:test';
import { planItinerary } from '../server/lib/itinerary.js';

const c = { lat: 50.0, lon: 14.0 };
test('fill ignores near filters', () => {
  const pois = [
    { id: 'A', name: 'Erotic Museum', lat: 50.06, lon: 14.0, category: 'museum', score: 90 },
    { id: 'B', name: 'Zoo Malá', lat: 50.0, lon: 14.001, category: 'church', score: 10 },
  ];
  const p = planItinerary(pois, { center: c, start: '2026-11-10', end: '2026-11-12', arrivalTime: '08:00', departureTime: '21:00', kids: true });
  for (const d of p.days) console.log('ADULT', d.date, d.kind, d.items.map((x) => x.name).join(','));
  const pois2 = [
    { id: 'N', name: 'Krkonošský národní park', lat: 50.04, lon: 14.0, category: 'nature', score: 90 },
    { id: 'B', name: 'Kostel', lat: 50.0, lon: 14.001, category: 'church', score: 10 },
  ];
  const p2 = planItinerary(pois2, { center: c, start: '2026-11-10', end: '2026-11-12', arrivalTime: '08:00', departureTime: '21:00' });
  for (const d of p2.days) console.log('NP', d.date, d.kind, d.items.map((x) => x.name).join(','));
});
