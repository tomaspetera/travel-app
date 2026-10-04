// Ukázková nabídka ubytování pro demo režim (--demo / ATLAS_MOCK=1) – aby šel projít celý
// průvodce cestou i bez klíčů. Data jsou vymyšlená, deterministická podle města a termínu.
import { haversineKm } from '../../lib/geo.js';
import { bookingSearchUrl } from './liteapi.js';

const NAMES = [
  ['Grand Hotel {c}', 'hotel', 5], ['Hotel Centrale', 'hotel', 4], ['{c} Old Town Apartments', 'apartment', 0], ['Boutique Hotel Aurora', 'hotel', 4],
  ['Hostel Backpackers {c}', 'hostel', 0], ['Hotel Panorama', 'hotel', 3], ['Residence Garden', 'apartment', 0], ['Ibis Budget {c} Centre', 'hotel', 2],
  ['Hotel Bellevue', 'hotel', 4], ['Guesthouse Casa Verde', 'guesthouse', 0], ['Design Hotel Loft', 'hotel', 4], ['Hotel Plaza {c}', 'hotel', 3],
  ['City Studios', 'apartment', 0], ['Hotel Royal Palace', 'hotel', 5], ['Pension Familia', 'guesthouse', 0], ['Hotel Station', 'hotel', 3],
];
const TYPE_CS = { hotel: 'hotel', apartment: 'apartmán', hostel: 'hostel', guesthouse: 'penzion' };

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const demoStays = {
  id: 'demo',
  name: 'Ukázková data',
  testData: () => true,
  async search(q) {
    if (q.lat == null) return [];
    const r = rng(`${q.cityEn}|${q.checkin}|${q.adults}`);
    const city = q.cityEn || q.city;
    return NAMES.map(([tpl, type, stars], i) => {
      const name = tpl.replace('{c}', city);
      const dist = 0.2 + r() * (type === 'hostel' ? 2.5 : 4.5);
      const ang = r() * Math.PI * 2;
      const lat = q.lat + (dist / 111) * Math.sin(ang);
      const lon = q.lon + (dist / (111 * Math.cos((q.lat * Math.PI) / 180))) * Math.cos(ang);
      const base = { hotel: 900 + stars * 650, apartment: 1500, hostel: 450, guesthouse: 1100 }[type];
      const perNight = Math.round((base * (0.7 + r() * 0.8) * (q.adults > 2 ? 1.4 : 1)) / 10) * 10;
      const rating = Math.round(Math.min(9.7, 6.4 + r() * 3.2 + stars * 0.1) * 10) / 10;
      return {
        id: `demo:${i}`,
        provider: 'demo',
        name,
        type: TYPE_CS[type],
        typeLabel: stars ? `${stars}★ ${TYPE_CS[type]}` : TYPE_CS[type],
        stars: stars || null,
        rating,
        reviews: Math.round(20 + r() * 2400),
        address: city,
        lat,
        lon,
        distanceKm: Math.round(haversineKm(q.lat, q.lon, lat, lon) * 10) / 10,
        photo: null,
        priceTotalCzk: perNight * q.nights,
        pricePerNightCzk: perNight,
        freeCancellation: r() > 0.45,
        breakfast: type !== 'apartment' && r() > 0.5,
        bookUrl: bookingSearchUrl(name, city, q),
      };
    });
  },
};
