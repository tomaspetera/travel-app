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
// „united-kingdom“ → „england“); data hledání z adresy nebere. Města s hostely na ní mají odkaz na hledání webu s ID
// města – searchStays ho dohledá (partnerids.js): s ID vede odkaz na hledání /pwa/s s termínem a hosty; místo bez
// hostelů (stránka 404 nebo „0 Hostels“) na stránku země s poznámkou a až na konec seznamu.
const HW_CONT = { Evropa: 'europe', Afrika: 'africa', Asie: 'asia', 'Severní Amerika': 'north-america', 'Jižní Amerika': 'south-america', 'Oceánie': 'oceania' };
const slug = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// ID místa u partnera (z partnerids.js): kladné celé číslo, jinak nic.
const partnerId = (x) => (Number.isInteger(x) && x > 0 ? x : null);

/** Anglický název místa bez upřesnění za čárkou („Springfield, Illinois“ → „Springfield“). */
const cityPart = (q) => String(q.cityEn || q.city || '').split(',')[0].trim();

/** Stránka města na Hostelworldu, nebo null (neznámá země či kontinent). */
function hostelworldCityPage(q) {
  const c = COUNTRY_BY_ISO.get(q.cc);
  const city = slug(cityPart(q));
  return HW_CONT[c?.cont] && c?.en && city ? `https://www.hostelworld.com/hostels/${HW_CONT[c.cont]}/${slug(c.en)}/${city}/` : null;
}

/**
 * Pod čím partneři místo znají – pro dohledání jejich ID (partnerids.js). Trip.com: anglický název bez diakritiky,
 * pomlčka jako mezera („Porto-Novo“ najde jen Porto Novo na Kapverdách, „Porto Novo“ i město v Beninu; u „Aix en
 * Provence“ nebo „Baden Baden“ na tvaru nezáleží – ověřeno 10/2026). Agoda: stránka města /city/<název>-<kód země>.html
 * (anglicky: „prague-cz“ ano, „praha-cz“ ne). Hostelworld: stránka města (tatáž adresa jako odkaz bez ID).
 */
export function stayPartnerKeys(q) {
  const name = cityPart(q);
  const trip = plainName(name);
  const cc = /^[A-Z]{2}$/.test(q.cc || '') ? q.cc.toLowerCase() : '';
  return { trip: trip || null, agoda: slug(name) && cc ? `${slug(name)}-${cc}` : null, hostelworld: hostelworldCityPage(q) };
}

/** Název bez diakritiky, pomlčky jako mezery („Kutná Hora“ → „Kutna Hora“, „Porto-Novo“ → „Porto Novo“). */
function plainName(x) {
  return String(x || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[-‐–]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Kayak zná zemi pod svým názvem – kde se liší od našeho anglického (Czechia), jeho jméno. Česká verze webu
// (cz.kayak.com) má stejné adresy jako kayak.com a otevře se česky s cenami v Kč (ověřeno 10/2026: hotely i auta).
const KAYAK_COUNTRY = { CZ: 'Czech Republic', US: 'United States' };
const KAYAK = 'https://www.cz.kayak.com';

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
 * ids: ID místa u partnerů dohledaná na serveru (partnerids.js) – { trip, agoda, hostelworld }: číslo = ID,
 * hostelworld false = Hostelworld v místě hostely nemá (404 nebo „0 Hostels“ → stránka země na konci seznamu); cokoli
 * jiného = odkaz bez ID.
 * prefill: 'full' = místo, termín i hosté předvyplněné; 'city' = jen místo (data zadáš na webu); 'none' = úvodní stránka.
 * Ověřeno 10/2026 ve skutečném Chromu: Booking.com, Airbnb, Kayak (si „Město-Země“ přeloží na své ID místa; česká
 * verze v Kč) a Google Hotels (termín a hosté v ts) předvyplní vše. Trip.com s ID města (cityId) rovnou ukáže nabídky,
 * jen s názvem (searchWord) vyplní místo, termín i hosty do formuláře a hledání se potvrdí tlačítkem (anglicky v USD –
 * česká verze s Kč neexistuje). Agoda s ID města otevře hledání s termínem a hosty, bez něj jen úvodní stránku.
 * Hostelworld s ID města hledání s termínem a hosty, bez něj stránku města (data z adresy nebere), místo bez hostelů
 * (false) stránku země na konci seznamu. Hotels.com: formát hledání Expedia Group (z ověřovacího prostředí ho
 * zablokovala ochrana proti robotům).
 */
export function stayLinks(q, ids = {}) {
  // Partnerské weby spolehlivěji poznají anglický název („Milan, Italy“) než český.
  const c = COUNTRY_BY_ISO.get(q.cc);
  const countryEn = c?.en || '';
  const cityEn = q.cityEn || q.city;
  const place = [cityEn, countryEn || q.country].filter(Boolean).join(', ');
  const nights = q.nights || Math.round((Date.parse(q.checkout) - Date.parse(q.checkin)) / 864e5);
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
  // Trip.com: s ID města (cityId) hned nabídky (Cotonou 132 ubytování), jen s názvem (searchWord) 0 výsledků, dokud
  // uživatel nepotvrdí Hledat.
  const tripId = partnerId(ids.trip);
  const trip = tripId
    ? { note: 'silný v Asii', url: `https://www.trip.com/hotels/list?${new URLSearchParams({ cityId: String(tripId), checkin: q.checkin, checkout: q.checkout, crn: String(q.rooms), adult: String(q.adults), children: '0', curr: 'CZK', locale: 'cs-CZ' })}` }
    : { note: 'silný v Asii – potvrď Hledat', url: `https://www.trip.com/hotels/list?${new URLSearchParams({ searchWord: place, checkin: q.checkin, checkout: q.checkout, adult: String(q.adults), crn: String(q.rooms), curr: 'CZK', locale: 'cs-CZ' })}` };
  const hotels = new URLSearchParams({ destination: place, startDate: q.checkin, endDate: q.checkout, adults: String(q.adults), rooms: String(q.rooms) });
  // Kayak: „Město-Země“ anglicky s pomlčkami (Porto-Novo-Benin) – samotné jméno pošle Lagos do Portugalska a Porto Novo
  // na Kapverdy, tvar „Město, Země“ s čárkou skončí na úvodní stránce bez místa i dat (ověřeno 10/2026 v Chromu).
  const kayakPlace = [String(cityEn).split(',')[0], KAYAK_COUNTRY[q.cc] || countryEn]
    .filter(Boolean).join(' ').replace(/[/;,]/g, ' ').trim().replace(/\s+/g, '-');
  const kayak = `${KAYAK}/hotels/${enc(kayakPlace)}/${q.checkin}/${q.checkout}/${q.adults}adults`;
  const gts = googleHotelsTs(q.checkin, q.checkout, q.adults);
  // Hostelworld: s ID města vlastní hledání webu (místo doplní samo); místo bez hostelů (404 nebo „0 Hostels“, Lagos,
  // Mikulov) stránka země – i stránka města by s daty nic nenašla.
  const hwId = partnerId(ids.hostelworld);
  const hwPage = hostelworldCityPage(q);
  const hwNone = Boolean(hwPage) && ids.hostelworld === false;
  const hostelworld = hwId
    ? { note: 'hostely a levná lůžka', prefill: 'full', url: `https://www.hostelworld.com/pwa/s?${new URLSearchParams({ type: 'city', id: String(hwId), from: q.checkin, to: q.checkout, guests: String(q.adults) })}` }
    : hwNone
      ? { note: 'v místě hostely nemá – zkus jinde v zemi', prefill: 'none', url: hwPage.replace(/[\w-]+\/$/, '') }
      : hwPage
        ? { note: 'hostely a levná lůžka – zadej data', prefill: 'city', url: hwPage }
        : { note: 'hostely a levná lůžka – zadej místo a data', prefill: 'none', url: 'https://www.hostelworld.com/' };
  // Agoda: bez ID města jen úvodní stránka (na stránku města se termín ani hosté přidat nedají).
  const agodaId = partnerId(ids.agoda);
  const agoda = agodaId
    ? { note: 'silná v Asii', prefill: 'full', url: `https://www.agoda.com/search?${new URLSearchParams({ city: String(agodaId), checkIn: q.checkin, checkOut: q.checkout, los: String(nights), rooms: String(q.rooms), adults: String(q.adults), children: '0' })}` }
    : { note: 'silná v Asii – zadej místo a data', prefill: 'none', url: 'https://www.agoda.com/cs-cz/' };
  const links = [
    // nflt=review_score=80 → jen hodnocení 8+, order=price → od nejlevnějšího.
    { id: 'booking', name: 'Booking.com', note: 'hodnocení 8+, od nejlevnějšího', prefill: 'full', url: affiliate(`https://www.booking.com/searchresults.cs.html?${booking({ order: 'price', nflt: 'review_score=80' })}`, 'booking'), sponsored: affiliateOn('booking') },
    { id: 'booking-best', name: 'Booking.com', note: 'nejlepší poměr hodnocení a ceny', prefill: 'full', url: affiliate(`https://www.booking.com/searchresults.cs.html?${booking({ order: 'review_score_and_price' })}`, 'booking'), sponsored: affiliateOn('booking') },
    { id: 'airbnb', name: 'Airbnb', note: 'apartmány a soukromí', prefill: 'full', url: `https://www.airbnb.cz/s/${enc(airbnbSlug)}/homes?${airbnb}` },
    { id: 'trip', name: 'Trip.com', note: trip.note, prefill: 'full', url: trip.url },
    { id: 'hotelscom', name: 'Hotels.com', note: 'hotely (Expedia)', prefill: 'full', url: `https://www.hotels.com/Hotel-Search?${hotels}` },
    { id: 'kayak', name: 'Kayak', note: 'srovnání cen více webů', prefill: 'full', url: kayak },
    { id: 'google', name: 'Google Hotels', note: gts ? 'srovnání cen' : 'srovnání cen – zadej data', prefill: gts ? 'full' : 'city', url: `https://www.google.com/travel/search?q=${enc(`hotels ${place}`)}&hl=cs&curr=CZK${gts ? `&ts=${gts}` : ''}` },
    { id: 'hostelworld', name: 'Hostelworld', ...hostelworld },
    { id: 'agoda', name: 'Agoda', ...agoda },
  ];
  // místo bez hostelů: Hostelworld (jen stránka země) až na konec
  return hwNone ? [...links.filter((l) => l.id !== 'hostelworld'), links.find((l) => l.id === 'hostelworld')] : links;
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
  // Kayak: /cars/{PU}[/{DO}]/{datum}-{hodina}h/… – hodina celá (16:30 → 16h), řazení od nejlevnějšího; česká verze
  // v Kč (cz.kayak.com/cars/BGY/MXP/… ověřeno 10/2026: místa, termín i řazení stejně jako na kayak.com).
  const kayak = `${KAYAK}/cars/${q.pickup}${drop ? `/${drop}` : ''}/${a.d}-${a.hh}h/${b.d}-${b.hh}h?sort=price_a`;
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
