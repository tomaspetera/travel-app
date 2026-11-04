import { test } from 'node:test';
import { classifyText } from '../server/lib/poi.js';
import { planItinerary, dayCapacities, dayTimeline } from '../server/lib/itinerary.js';
import { closedOn, hoursNote, SIGHTS } from '../server/lib/hours.js';

test('probe', () => {
  for (const t of ['secesní budova Obecní dům', 'Metropolitan Cathedral of Liverpool', 'metropolitní katedrála', 'Car park', 'church in Rome Santa Maria in Trastevere', 'hrad Karlštejn', 'Downtown Inn tower']) console.log('CT', t, '=>', classifyText(t));
  const vat = SIGHTS.find((s) => s.except);
  console.log('VAT', vat.name, closedOn(vat, '2026-11-29'), closedOn(vat, '2026-11-22'), closedOn(vat, '2026-11-23'));
  console.log('CAP', JSON.stringify(dayCapacities({ start: '2026-11-10', end: '2026-11-12', arrivalTime: '18:00', departureTime: '13:00' })));
  console.log('CAP1', JSON.stringify(dayCapacities({ start: '2026-11-10', end: '2026-11-10', arrivalTime: '07:00', departureTime: '21:00' })));
  const c = { lat: 41.9, lon: 12.5 };
  const pois = Array.from({ length: 20 }, (_, i) => ({ id: `Q${i}`, name: `M${i}`, lat: 41.9 + (i % 5) * 0.004, lon: 12.5 + Math.floor(i / 5) * 0.004, score: 100 - i, sitelinks: 80 - i, category: ['museum', 'church', 'square', 'park', 'viewpoint'][i % 5] }));
  const plan = planItinerary(pois, { center: c, start: '2026-11-10', end: '2026-11-12', arrivalTime: '18:00', departureTime: '13:00' });
  for (const d of plan.days) console.log('DAY', d.date, d.kind, d.cap, d.end, d.lunch && JSON.stringify(d.lunch), d.items.map((p) => `${p.at} ${p.name}/${p.category}/${p.visitMin}`).join(' | '));
  const plan2 = planItinerary(pois, { center: c, start: '2026-11-10', end: '2026-11-10', arrivalTime: '07:00', departureTime: '23:00' });
  for (const d of plan2.days) console.log('DAY1', d.date, d.kind, d.cap, d.end, d.lunch && JSON.stringify(d.lunch), d.items.map((p) => `${p.at} ${p.name}/${p.category}/${p.visitMin}`).join(' | '));
  const tl = dayTimeline([{ lat: 41.9, lon: 12.5, visitMin: 120 }, { lat: 41.9, lon: 12.501, visitMin: 120 }, { lat: 41.9, lon: 12.502, visitMin: 60 }], { start: c, from: 10 * 60 });
  console.log('TL', JSON.stringify(tl));
  console.log('HN', hoursNote(SIGHTS.find((s) => s.shut && s.shut.startsWith('2027')), '2027-06-01', '2027-06-08'));
});
