import { test } from 'node:test';
import { dayTimeline } from '../server/lib/itinerary.js';

const C = { lat: 41.9, lon: 12.5 };
test('no lunch on full morning day', () => {
  const items = [
    { lat: 41.9, lon: 12.5001, visitMin: 118, category: 'museum' },
    { lat: 41.9, lon: 12.5002, visitMin: 240, category: 'theme' },
    { lat: 41.9, lon: 12.5003, visitMin: 30, category: 'square' },
    { lat: 41.9, lon: 12.5004, visitMin: 60, category: 'park' },
  ];
  console.log('NOLUNCH', JSON.stringify(dayTimeline(items, { start: C, from: 9 * 60 })));
});
