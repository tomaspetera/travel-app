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

// Hostelworld: stránka města /hostels/<kontinent>/<země>/<město>/ (jiný kontinent nebo název země sám přesměruje,
// „united-kingdom“ → „england“); data hledání z adresy nebere. Stránku mají jen města s hostely (jinak 404) –
// ověří ji searchStays (hostelworldHas) a u menšího místa odkáže na stránku země.
const HW_CONT = { Evropa: 'europe', Afrika: 'africa', Asie: 'asia', 'Severní Amerika': 'north-america', 'Jižní Amerika': 'south-america', 'Oceánie': 'oceania' };
const slug = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Kayak zná zemi pod svým názvem – kde se liší od našeho anglického (Czechia), jeho jméno.
const KAYAK_COUNTRY = { CZ: 'Czech Republic', US: 'United States' };

/**
 * Google Hotels: parametr ts (termín, počet dospělých, měna) – zpráva protobuf v base64url, formát odpozorovaný
 * z adres, které Google sám vytváří (ověřeno 10/2026 v Chromu na 5 termínech vč. přelomu roku). Délky jsou
 * jednobajtové – nad 127 nocí nebo 30 dospělých null (odkaz pak jen s místem). Kdyby ho Google změnil, místo v q platí dál.
 */
export function googleHotelsTs(checkin, checkout, adults, currency = 'CZK') {
  const date = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    return [0x08, (y & 0x7f) | 0x80, y >> 7, 0x10, m, 0x18, d];
  };
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 864e5);
  const n = Number(adults);
  if (!(nights >= 1 && nights <= 127) || !Number.isInteger(n) || n < 1 || n > 30) return null;
  const guests = [...Array.from({ length: n }, () => [0x0a, 0x02, 0x08, 0x03]).flat(), 0x10, 0x00];
  const d1 = date(checkin);
  const d2 = date(checkout);
  const dates = [0x0a, d1.length, ...d1, 0x12, d2.length, ...d2];
  const stay = [0x12, dates.length, ...dates, 0x18, nights, 0x32, 0x02, 0x10, 0x00];
  const f3 = [0x0a, 0x02, 0x1a, 0x00, 0x12, stay.length, ...stay];
  const cur = [...Buffer.from(currency)];
  const f5 = [0x0a, cur.length + 2, 0x3a, cur.length, ...cur, 0x1a, 0x00];
  return Buffer.from([0x08, 0x01, 0x12, guests.length, ...guests, 0x1a, f3.length, ...f3, 0x2a, f5.length, ...f5])
    .toString('base64url');
}

/**
 * Odkazy na partnery ubytování. q: { city, cityEn, cc, country, checkin, checkout, adults, rooms }
 * prefill: 'full' = místo, termín i hosté předvyplněné; 'city' = jen místo (data zadáš na webu); 'none' = úvodní stránka.
 * Ověřeno 10/2026: Booking.com, Airbnb, Kayak (si „Město-Země“ přeloží na své ID místa) a Google Hotels (termín a hosté
 * v ts) předvyplní vše, Trip.com vyplní místo, termín i hosty do formuláře (hledání se potvrdí tlačítkem); Hostelworld jen místo;
 * Agoda bez vlastního ID města neumí ani místo. Hotels.com: formát hledání Expedia Group (z ověřovacího prostředí
 * ho zablokovala ochrana proti robotům).
 */
export function stayLinks(q) {
  // Partnerské weby spolehlivěji poznají anglický název („Milan, Italy“) než český.
  const c = COUNTRY_BY_ISO.get(q.cc);
  const countryEn = c?.en || '';
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
  const airbnbSlug = [cityEn, countryEn].filter(Boolean).join('--');
  const trip = new URLSearchParams({ searchWord: place, checkin: q.checkin, checkout: q.checkout, adult: String(q.adults), crn: String(q.rooms), curr: 'CZK', locale: 'cs-CZ' });
  const hotels = new URLSearchParams({ destination: place, startDate: q.checkin, endDate: q.checkout, adults: String(q.adults), rooms: String(q.rooms) });
  // Kayak: „Město-Země“ anglicky s pomlčkami (Porto-Novo-Benin) – samotné jméno pošle Lagos do Portugalska a Porto Novo
  // na Kapverdy, tvar „Město, Země“ s čárkou skončí na úvodní stránce bez místa i dat (ověřeno 10/2026 v Chromu).
  const kayakPlace = [String(cityEn).split(',')[0], KAYAK_COUNTRY[q.cc] || countryEn]
    .filter(Boolean).join(' ').replace(/[/;,]/g, ' ').trim().replace(/\s+/g, '-');
  const kayak = `https://www.kayak.com/hotels/${enc(kayakPlace)}/${q.checkin}/${q.checkout}/${q.adults}adults`;
  const gts = googleHotelsTs(q.checkin, q.checkout, q.adults);
  const hwCity = slug(String(cityEn).split(',')[0]);
  const hostelworld = HW_CONT[c?.cont] && countryEn && hwCity
    ? `https://www.hostelworld.com/hostels/${HW_CONT[c.cont]}/${slug(countryEn)}/${hwCity}/`
    : 'https://www.hostelworld.com/';
  return [
    // nflt=review_score=80 → jen hodnocení 8+, order=price → od nejlevnějšího.
    { id: 'booking', name: 'Booking.com', note: 'hodnocení 8+, od nejlevnějšího', prefill: 'full', url: affiliate(`https://www.booking.com/searchresults.cs.html?${booking({ order: 'price', nflt: 'review_score=80' })}`, 'booking'), sponsored: affiliateOn('booking') },
    { id: 'booking-best', name: 'Booking.com', note: 'nejlepší poměr hodnocení a ceny', prefill: 'full', url: affiliate(`https://www.booking.com/searchresults.cs.html?${booking({ order: 'review_score_and_price' })}`, 'booking'), sponsored: affiliateOn('booking') },
    { id: 'airbnb', name: 'Airbnb', note: 'apartmány a soukromí', prefill: 'full', url: `https://www.airbnb.cz/s/${enc(airbnbSlug)}/homes?${airbnb}` },
    { id: 'trip', name: 'Trip.com', note: 'silný v Asii – potvrď Hledat', prefill: 'full', url: `https://www.trip.com/hotels/list?${trip}` },
    { id: 'hotelscom', name: 'Hotels.com', note: 'hotely (Expedia)', prefill: 'full', url: `https://www.hotels.com/Hotel-Search?${hotels}` },
    { id: 'kayak', name: 'Kayak', note: 'srovnání cen více webů', prefill: 'full', url: kayak },
    { id: 'google', name: 'Google Hotels', note: gts ? 'srovnání cen' : 'srovnání cen – zadej data', prefill: gts ? 'full' : 'city', url: `https://www.google.com/travel/search?q=${enc(`hotels ${place}`)}&hl=cs&curr=CZK${gts ? `&ts=${gts}` : ''}` },
    { id: 'hostelworld', name: 'Hostelworld', note: 'hostely a levná lůžka – zadej data', prefill: 'city', url: hostelworld },
    { id: 'agoda', name: 'Agoda', note: 'silná v Asii – zadej místo a data', prefill: 'none', url: 'https://www.agoda.com/cs-cz/' },
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
