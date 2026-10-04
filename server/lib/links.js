// Odkazy s předvyplněným hledáním (fungují bez klíčů). Uživatel na webu partnera vybere a zaplatí.
import { config } from '../config.js';
import { COUNTRY_BY_ISO } from './airports.js';

const enc = encodeURIComponent;
const pad = (n) => String(n).padStart(2, '0');

// Partnerské programy Travelpayouts: p = ID odkazového nástroje, c = campaign_id (z generátoru odkazů).
// Odkaz bez p/trs/campaign_id tp.media odmítne chybou, proto se obalují jen tyto ověřené značky a jen
// když je nastavený marker i číslo projektu (trs); jinak zůstane přímý odkaz. Projekt musí být
// v daném programu přihlášený (jinak tp.media vrátí 403).
const TP_BRANDS = { aviasales: { p: 4114, c: 100 }, booking: { p: 2076, c: 84 }, discovercars: { p: 3555, c: 117 } };

export function affiliateOn(brand) {
  return Boolean(TP_BRANDS[brand] && /^\d+$/.test(config.travelpayoutsMarker) && /^\d+$/.test(config.travelpayoutsTrs));
}

/** Partnerský (affiliate) odkaz přes tp.media, je-li pro značku vše nastavené; jinak přímý odkaz. */
export function affiliate(url, brand) {
  if (!affiliateOn(brand)) return url;
  const b = TP_BRANDS[brand];
  const qs = new URLSearchParams({ campaign_id: String(b.c), marker: config.travelpayoutsMarker, p: String(b.p), trs: config.travelpayoutsTrs, sub_id: 'atlas', u: url });
  return `https://tp.media/r?${qs}`;
}

/** q: { city, cityEn, cc, country, checkin, checkout, adults, rooms } */
export function stayLinks(q) {
  // Partnerské weby spolehlivěji poznají anglický název („Milan, Italy“) než český.
  const countryEn = COUNTRY_BY_ISO.get(q.cc)?.en || '';
  const cityEn = q.cityEn || q.city;
  const place = [cityEn, countryEn || q.country].filter(Boolean).join(', ');
  const booking = (extra) => new URLSearchParams({
    ss: place,
    checkin: q.checkin,
    checkout: q.checkout,
    group_adults: String(q.adults),
    no_rooms: String(q.rooms),
    group_children: '0',
    lang: 'cs',
    selected_currency: 'CZK',
    ...extra,
  });
  const airbnb = new URLSearchParams({ checkin: q.checkin, checkout: q.checkout, adults: String(q.adults) });
  const slug = [cityEn, countryEn].filter(Boolean).join('--');
  const google = `https://www.google.com/travel/search?q=${enc(`hotels ${place}`)}&hl=cs&curr=CZK`;
  return [
    // nflt=review_score=80 → jen hodnocení 8+, order=price → od nejlevnějšího.
    { id: 'booking', name: 'Booking.com', note: 'hodnocení 8+, od nejlevnějšího', url: affiliate(`https://www.booking.com/searchresults.cs.html?${booking({ order: 'price', nflt: 'review_score=80' })}`, 'booking'), sponsored: affiliateOn('booking') },
    { id: 'booking-best', name: 'Booking.com', note: 'nejlepší poměr hodnocení a ceny', url: affiliate(`https://www.booking.com/searchresults.cs.html?${booking({ order: 'review_score_and_price' })}`, 'booking'), sponsored: affiliateOn('booking') },
    { id: 'airbnb', name: 'Airbnb', note: 'apartmány a soukromí', url: `https://www.airbnb.cz/s/${enc(slug)}/homes?${airbnb}` },
    { id: 'google', name: 'Google Hotels', note: 'srovnání cen více webů (zadej data)', url: google },
    { id: 'hostelworld', name: 'Hostelworld', note: 'hostely a levná lůžka (zadej data)', url: `https://www.hostelworld.com/hostels/${enc(cityEn)}` },
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
  // Kayak: /cars/{PU}[/{DO}]/{datum}-{hodina}h/… – hodina celá (16:30 → 16h), řazení od nejlevnějšího.
  const kayak = `https://www.kayak.com/cars/${q.pickup}${drop ? `/${drop}` : ''}/${a.d}-${a.hh}h/${b.d}-${b.hh}h?sort=price_a`;
  // Rentalcars.com a Booking.com Cars mají stejné vyhledávání; letiště se zadává kódem IATA (ftsType=A),
  // minuty jen 0 nebo 30, čísla bez úvodních nul, řazení podle ceny.
  const half = (m) => (m >= 30 ? 30 : 0);
  const label = q.pickupName || q.pickup;
  const dropLabel = drop ? q.dropoffName || drop : label;
  const rc = new URLSearchParams({
    location: '', dropLocation: '',
    locationIata: q.pickup, dropLocationIata: drop || q.pickup,
    locationName: label, dropLocationName: dropLabel,
    ftsType: 'A', dropFtsType: 'A',
    puDay: String(a.day), puMonth: String(a.m), puYear: String(a.y), puHour: String(a.hh), puMinute: String(half(a.mm)),
    doDay: String(b.day), doMonth: String(b.m), doYear: String(b.y), doHour: String(b.hh), doMinute: String(half(b.mm)),
    driversAge: String(q.age || 30),
    filterCriteria_sortBy: 'PRICE', filterCriteria_sortAscending: 'true',
  });
  return [
    { id: 'kayak', name: 'Kayak', note: 'srovnání půjčoven, seřazeno od nejlevnějšího', url: kayak },
    { id: 'rentalcars', name: 'Rentalcars.com', note: 'velký výběr na letištích, od nejlevnějšího', url: `https://www.rentalcars.com/search-results?${rc}&preflang=cs&prefcurrency=CZK` },
    { id: 'bookingcars', name: 'Booking.com Cars', note: 'stejná nabídka v rozhraní Booking.com', url: `https://cars.booking.com/search-results?${rc}` },
    // DiscoverCars neumí předvyplněné hledání (odkazy na výsledky jsou vázané na relaci) → jen úvodní stránka.
    { id: 'discovercars', name: 'DiscoverCars', note: 'často nejlevnější – letiště a data zadej na webu', url: affiliate('https://www.discovercars.com/', 'discovercars'), sponsored: affiliateOn('discovercars') },
  ];
}
