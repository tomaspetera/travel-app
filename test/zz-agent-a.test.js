import { test } from 'node:test';
import { planItinerary, dayCapacities, dayTimeline } from '../server/lib/itinerary.js';

const c = { lat: 41.9, lon: 12.5 };
const city = Array.from({ length: 40 }, (_, i) => ({ id: `Q${i}`, name: `M${i}`, lat: 41.9 + (i % 6) * 0.004, lon: 12.5 + Math.floor(i / 6) * 0.004, score: 100 - i, sitelinks: 50 - i, category: ['museum', 'church', 'square', 'park', 'viewpoint', 'sight'][i % 6] }));
const trip = { id: 'T1', name: 'Tivoli', lat: 41.96, lon: 12.8, category: 'daytrip', score: 1080, pinned: true };

test('kids daytrip', () => {
  for (const kids of [false, true]) {
    const p = planItinerary([...city, trip], { center: c, start: '2026-11-10', end: '2026-11-16', arrivalTime: '08:00', departureTime: '21:00', kids });
    console.log('KIDS', kids, p.days.map((d) => `${d.date}:${d.kind}:${d.cap}`).join(' '), JSON.stringify(p.warnings));
  }
});

test('lunch after window', () => {
  const caps = dayCapacities({ start: '2026-11-10', end: '2026-11-11', arrivalTime: '08:00', departureTime: '16:00' });
  console.log('CAPS', JSON.stringify(caps));
  const tl = dayTimeline([{ lat: 41.9, lon: 12.5, visitMin: 120 }, { lat: 41.9, lon: 12.501, visitMin: 90 }], { start: c, from: 9 * 60 });
  console.log('TL', JSON.stringify(tl));
});
