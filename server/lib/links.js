// Odkazy s předvyplněným hledáním (fungují bez klíčů). Uživatel na webu partnera vybere a zaplatí.
import { config } from '../config.js';

const enc = encodeURIComponent;
const pad = (n) => String(n).padStart(2, '0');

/** Přidá Travelpayouts affiliate přesměrování, je-li nastavený marker (jinak vrátí přímý odkaz). */
export function affiliate(url) {
  if (!config.travelpayoutsMarker) return url;
  return `https://tp.media/r?marker=${enc(config.travelpayoutsMarker)}&u=${enc(url)}`;
}

/** q: { city, country, lat, lon, checkin, checkout, adults, rooms } */
export function stayLinks(q) {
  const place = [q.city, q.country].filter(Boolean).join(', ');
  const booking = new URLSearchParams({
    ss: place,
    checkin: q.checkin,
    checkout: q.checkout,
    group_adults: String(q.adults),
    no_rooms: String(q.rooms),
    group_children: '0',
    order: 'review_score_and_price',
    lang: 'cs',
    selected_currency: 'CZK',
  });
  const airbnb = new URLSearchParams({ checkin: q.checkin, checkout: q.checkout, adults: String(q.adults) });
  const hostel = new URLSearchParams({ search_keywords: q.city, from: q.checkin, to: q.checkout, guests: String(q.adults) });
  const google = `https://www.google.com/travel/search?q=${enc(`hotely ${place} ${q.checkin} až ${q.checkout}`)}&hl=cs&curr=CZK`;
  return [
    { id: 'booking', name: 'Booking.com', note: 'seřazeno: nejlepší hodnocení a cena', url: affiliate(`https://www.booking.com/searchresults.cs.html?${booking}`) },
    { id: 'airbnb', name: 'Airbnb', note: 'apartmány a soukromí', url: `https://www.airbnb.cz/s/${enc(place)}/homes?${airbnb}` },
    { id: 'google', name: 'Google Hotels', note: 'srovnání cen více webů', url: google },
    { id: 'hostelworld', name: 'Hostelworld', note: 'hostely a levná lůžka', url: affiliate(`https://www.hostelworld.com/search?${hostel}`) },
  ];
}

/** Datum a čas „YYYY-MM-DDTHH:MM“ → části. */
function parts(dt) {
  const [d, t = '10:00'] = String(dt).split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return { d, y, m, day, hh: hh || 0, mm: mm || 0 };
}

/** q: { pickup (IATA), dropoff (IATA), pickupName, from 'YYYY-MM-DDTHH:MM', to, age } */
export function carLinks(q) {
  const a = parts(q.from);
  const b = parts(q.to);
  const drop = q.dropoff && q.dropoff !== q.pickup ? q.dropoff : null;
  const kayak = `https://www.kayak.com/cars/${q.pickup}${drop ? `/${drop}` : ''}/${a.d}-${a.hh}h/${b.d}-${b.hh}h?sort=price_a`;
  const rc = new URLSearchParams({
    locationName: q.pickupName || q.pickup,
    puDay: String(a.day), puMonth: String(a.m), puYear: String(a.y), puHour: String(a.hh), puMinute: String(a.mm),
    doDay: String(b.day), doMonth: String(b.m), doYear: String(b.y), doHour: String(b.hh), doMinute: String(b.mm),
    driversAge: String(q.age || 30), preflang: 'cs', prefcurrency: 'CZK',
  });
  const dc = `https://www.discovercars.com/?lang=cs&utm_source=atlas#/search?pickup=${enc(q.pickup)}&pickupDate=${a.d}&pickupTime=${pad(a.hh)}:${pad(a.mm)}&dropoffDate=${b.d}&dropoffTime=${pad(b.hh)}:${pad(b.mm)}`;
  const google = `https://www.google.com/search?q=${enc(`půjčovna aut letiště ${q.pickupName || q.pickup} ${a.d} až ${b.d}`)}`;
  return [
    { id: 'kayak', name: 'Kayak', note: 'srovnání půjčoven, seřazeno od nejlevnějšího', url: kayak },
    { id: 'rentalcars', name: 'Rentalcars.com', note: 'velký výběr na letištích', url: affiliate(`https://www.rentalcars.com/search-results?${rc}`) },
    { id: 'discovercars', name: 'DiscoverCars', note: 'často nejlevnější, plné pojištění', url: affiliate(dc) },
    { id: 'google', name: 'Google', note: 'další půjčovny', url: google },
  ];
}
