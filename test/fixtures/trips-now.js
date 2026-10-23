// Cesty pro „📍 Dnes na cestě“ a průběh cesty (Trip.timeline): z průvodce (let tam i zpět, jen tam, víc míst,
// vlak místo letu) a jen z plánovače (lety a aktivity dnů). Časy místní, zóny letišť a měst.

const leg = (from, to, date, dep, arr, fromTz, toTz, o = {}) => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz,
  carrier: 'FR', carrierName: 'Ryanair', flightNo: 'FR 1234', provider: 'ryanair', bookUrl: 'https://air.example/book', ...o,
});
const day = (date, cap, names = [], lat = 38.71, lon = -9.14) => ({ date, cap, kind: cap ? 'city' : 'travel', items: names.map((name, i) => ({ id: `${name}${i}`, name, lat: lat + i / 100, lon, category: 'sight', visitMin: 60 })) });
const LIS_ARR = { iata: 'LIS', city: 'Lisabon', mode: 'metro', how: 'metro (červená linka) do Saldanha', czk: 46, min: 25, basis: 'table', lat: 38.7223, lon: -9.1393, fare: 1.85, cur: 'EUR' };

/** Lisabon z Prahy (Ryanair tam i zpět): cesta na letiště, z letiště do města, hotel a program. */
export function lisbon(over = {}) {
  return {
    v: 1, created: 1791698510368, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', verifiedAt: 1,
    flight: {
      out: leg('PRG', 'LIS', '2026-11-12', '06:25', '09:05', 'Europe/Prague', 'Europe/Lisbon'),
      back: leg('LIS', 'PRG', '2026-11-17', '10:00', '14:35', 'Europe/Lisbon', 'Europe/Prague', { flightNo: 'FR 1235' }),
      flightCzk: 2400, groundCzk: 120, bagCzk: 0, arrCzk: 92,
    },
    dest: { label: 'Lisabon', country: 'Portugalsko', cc: 'PT', lat: 38.7742, lon: -9.1342 },
    ground: { out: { minutes: 45 }, back: { minutes: 45 } }, groundMode: 'transit', arrival: { out: { ...LIS_ARR }, back: { ...LIS_ARR } },
    overland: null, groundRef: null,
    stay: { mode: 'pick', id: 'h1', name: 'Hotel Lisboa Centro', totalCzk: 9000, url: 'https://hotel.example/h1', lat: 38.7139, lon: -9.1394 },
    car: null,
    plan: {
      center: { lat: 38.7139, lon: -9.1394, label: 'Hotel Lisboa Centro', city: 'Lisabon', country: 'Portugalsko' },
      span: { start: '2026-11-12', end: '2026-11-17', arrivalTime: '09:05', departureTime: '10:00' },
      days: [day('2026-11-12', 240, ['Alfama', 'Castelo de São Jorge']), day('2026-11-13', 420, ['Belém', 'Jerónimos']), day('2026-11-14', 420), day('2026-11-15', 420, ['Sintra']), day('2026-11-16', 420, ['LX Factory']), day('2026-11-17', 0)],
    },
    ...over,
  };
}

/** Lisabon jen tam (bez letu zpět): 4 noci. */
export function lisbonOneWay() {
  const t = lisbon({ nightsOneWay: 4 });
  t.flight.back = null;
  t.arrival.back = null;
  t.ground.back = null;
  t.plan.span = { start: '2026-11-12', end: '2026-11-16', arrivalTime: '09:05', departureTime: null };
  t.plan.days = t.plan.days.filter((d) => d.date <= '2026-11-16');
  return t;
}

const gm = (a, b, mode) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a)}&destination=${encodeURIComponent(b)}&travelmode=${mode}`;
const tr = (a, b, km, carMin, transitMin) => ({ km, carMin, transitMin, long: false, carUrl: gm(a, b, 'driving'), transitUrl: gm(a, b, 'transit') });
/** Itálie přes víc míst: přílet do Bergama, Milán 3 noci → Florencie 3 → Řím 2, odlet z Říma; autem, hotely a programy. */
export function italy() {
  const L = (from, to, date, dep, arr, fromTz, toTz) => leg(from, to, date, dep, arr, fromTz, toTz, { carrier: 'W6', carrierName: 'Wizz Air', flightNo: 'W6 2301', provider: 'wizzair' });
  return {
    v: 1, created: 1791698510999, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary',
    flight: { out: L('PRG', 'BGY', '2026-11-10', '07:00', '08:30', 'Europe/Prague', 'Europe/Rome'), back: L('FCO', 'PRG', '2026-11-18', '19:00', '21:00', 'Europe/Rome', 'Europe/Prague'), flightCzk: 3000, groundCzk: 200, bagCzk: 0 },
    dest: { label: 'Milán', country: 'Itálie', cc: 'IT', lat: 45.4642, lon: 9.19 }, ground: { out: { minutes: 40 }, back: { minutes: 40 } }, groundMode: 'car', carFuel: 'diesel',
    stay: null, car: { mode: 'manual', totalCzk: 6000, pickup: 'BGY', dropoff: 'FCO', from: '2026-11-10T09:30', to: '2026-11-18T16:00', age: 30 }, plan: null, overland: null,
    route: {
      mode: 'multi', transport: 'car', want: 3, exclude: [], candidates: [], notes: [],
      arrival: { iata: 'BGY', name: 'Milán-Bergamo (BGY)', lat: 45.6694, lon: 9.7089 }, departure: { iata: 'FCO', name: 'Řím (FCO)', lat: 41.8045, lon: 12.252 },
      bases: [
        { id: 'city:MIL', name: 'Milán', lat: 45.4642, lon: 9.19, nights: 3, cc: 'IT', country: 'Itálie', anchor: 'arrival', highlights: ['Dóm'],
          stay: { mode: 'pick', id: 'h1', name: 'Hotel Duomo', totalCzk: 9000, url: 'https://hotel.example/duomo', lat: 45.464, lon: 9.19 },
          plan: { center: { lat: 45.464, lon: 9.19, label: 'Hotel Duomo', city: 'Milán', country: 'Itálie' }, days: [day('2026-11-10', 300, ['Dóm', 'Galerie'], 45.46, 9.19), day('2026-11-11', 420, ['Brera'], 45.47, 9.19), day('2026-11-13', 0)] } },
        { id: 'Q5', name: 'Florencie', lat: 43.7696, lon: 11.2558, nights: 3, cc: 'IT', country: 'Itálie', highlights: ['Uffizi'], stay: { mode: 'manual', name: 'U kamaráda', totalCzk: 4000 }, plan: null },
        { id: 'city:ROM', name: 'Řím', lat: 41.8933, lon: 12.4829, nights: 2, cc: 'IT', country: 'Itálie', anchor: 'departure', stay: { mode: 'links', name: '', totalCzk: 0 },
          plan: { center: { lat: 41.89, lon: 12.48, label: 'Řím', city: 'Řím', country: 'Itálie' }, days: [day('2026-11-17', 420, ['Koloseum', 'Forum Romanum'], 41.89, 12.49)] } },
      ],
      transfers: [tr('Milán, Itálie', 'Florencie', 299, 189, 202), tr('Florencie', 'Řím, Itálie', 278, 177, 190)],
      legs: { arrival: tr('BGY airport', 'Milán, Itálie', 56, 60, 55), departure: tr('Řím, Itálie', 'FCO airport', 28, 37, 39) },
    },
  };
}

const train = (date, dep, arr, from, to) => ({ source: 'regiojet', id: `rj${date.slice(8)}`, date, dep: `${date}T${dep}`, arr: `${date}T${arr}`, min: 260, czk: 299, kinds: ['TRAIN'], transfers: 0, fromStation: from, toStation: to });
/** Vídeň vlakem (RegioJet tam i zpět) místo letu, jedno místo s hotelem. */
export function vienna() {
  return {
    v: 1, created: 1791698511111, adults: 1, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', ground: {},
    flight: { out: leg('PRG', 'VIE', '2026-11-04', '20:00', '20:56', 'Europe/Prague', 'Europe/Vienna'), back: leg('VIE', 'PRG', '2026-11-08', '10:10', '11:06', 'Europe/Vienna', 'Europe/Prague'), flightCzk: 1181, groundCzk: 0, bagCzk: 0 },
    dest: { label: 'Vídeň', country: 'Rakousko', cc: 'AT', lat: 48.11, lon: 16.57 },
    overland: {
      on: true, q: { from: 'geo:50.0755,14.4378|Praha', to: 'ap:VIE' }, km: 254, est: { minutes: 234, czk: 299, basis: 'measured' },
      from: { label: 'Praha', cc: 'CZ', lat: 50.08, lon: 14.43, tz: 'Europe/Prague' }, to: { label: 'Vídeň', cc: 'AT', lat: 48.185, lon: 16.376, tz: 'Europe/Vienna' },
      out: train('2026-11-04', '06:01', '09:55', 'hl.n.', 'Wien Hbf'), back: train('2026-11-08', '17:00', '21:20', 'Wien Hbf', 'hl.n.'), links: { out: [], back: [] },
    },
    stay: { mode: 'manual', name: 'Hostel Wien', totalCzk: 2400 }, car: null,
    plan: { center: { lat: 48.2, lon: 16.37, label: 'Vídeň', city: 'Vídeň', country: 'Rakousko' }, span: { start: '2026-11-04', end: '2026-11-08', arrivalTime: '09:55', departureTime: '17:00' },
      days: [day('2026-11-04', 360, ['Hofburg'], 48.2, 16.36), day('2026-11-05', 420, ['Schönbrunn'], 48.18, 16.31), day('2026-11-06', 420), day('2026-11-08', 300, ['Prater'], 48.21, 16.4)] },
  };
}

/** Let ve tvaru plánovače (Trip.legBrief). */
const brief = (l) => ({ from: l.from, to: l.to, date: l.date, dep: l.dep.slice(0, 16), arr: l.arr.slice(0, 16), arrEst: false, fromTz: l.fromTz, toTz: l.toTz, carrier: l.carrierName, flightNo: l.flightNo, durationMin: null });
/** Cesta jen z plánovače (bez průvodce): lety, aktivity dnů, „Sbaleno“. */
export function plannerOnly(over = {}) {
  const w = lisbon();
  return {
    name: 'Lisabon s kamarády', dest: 'Lisabon', iso: 'PT', start: '2026-11-12', end: '2026-11-17', pax: '2', budget: '', flight: 'PRG→LIS 12.11. 06:25 (Ryanair), zpět LIS→PRG 17.11. 10:00 (Ryanair)',
    legs: [brief(w.flight.out), brief(w.flight.back)], days: { '2026-11-13': ['Belém', 'Pastéis de Belém'], '2026-11-15': ['Sintra – vlak z Rossio'] },
    checklist: [{ t: 'Zařídit: cestovní pojištění', done: true }, { t: 'Zařídit: zkontrolovat EHIC', done: false }, { t: 'Pas / OP', done: false }, { t: 'Nabíječka', done: true }], notes: '',
    ...over,
  };
}

/** Cesta z průvodce uložená v plánovači (jako saveToPlanner): plán s lety a celou cestou ve wizard. */
export function saved(w, over = {}) {
  const ov = w.overland && w.overland.on;
  const end = w.flight.back ? w.flight.back.date : '2026-11-16';
  return {
    name: `${w.dest.label} ${w.flight.out.date}`, dest: w.dest.label, iso: w.dest.cc, start: ov ? w.overland.out.date : w.flight.out.date, end: ov ? w.overland.back.date : end, pax: String(w.adults), budget: '10000', flight: 'let',
    ...(ov ? { ground: [{ from: 'Praha', to: 'Vídeň', date: w.overland.out.date, dep: w.overland.out.dep, arr: w.overland.out.arr, fromTz: 'Europe/Prague', toTz: 'Europe/Vienna' }, { from: 'Vídeň', to: 'Praha', date: w.overland.back.date, dep: w.overland.back.dep, arr: w.overland.back.arr, fromTz: 'Europe/Vienna', toTz: 'Europe/Prague' }] }
      : { legs: [w.flight.out, w.flight.back].filter(Boolean).map(brief) }),
    days: {}, checklist: [{ t: 'Zařídit: cestovní pojištění', done: false }, { t: 'Pas / OP', done: false }], notes: '', tripId: w.created, wizard: JSON.parse(JSON.stringify(w)),
    genDays: {}, ...over,
  };
}

const LIS_CITY = { name: 'Lisabon', lat: 38.7223, lon: -9.1393, cc: 'PT' };
// přejezd ze serveru (stayplan.js): km, čas autem i vlakem, palivo, mýtné a jízdenka na osobu
const move = (km, carMin, transitMin, fuelCzk, tollCzk, fareCzk) => ({ km, carMin, transitMin, transitKind: 'rail', basis: 'route', fuelCzk, tollCzk, fareCzk, carUrl: gm('A', 'B', 'driving'), transitUrl: gm('A', 'B', 'transit') });
/**
 * Lisabon → Porto (2 dospělí + dítě, so 24. – st 28. 10. 2026 – přes změnu času 25. 10.): let PRG → LIS, Lisabon 2 noci,
 * auto jen 2.–3. den (vyzvednutí v neděli ráno ve městě, vrácení v pondělí dopoledne v Lisabonu), do Porta vlakem,
 * Porto 2 noci, let OPO → PRG. Z letiště do města a na letiště metrem.
 */
export function lisbonPorto(over = {}) {
  const L = (from, to, date, dep, arr, fromTz, toTz, flightNo) => leg(from, to, date, dep, arr, fromTz, toTz, { flightNo });
  return {
    v: 1, created: 1792000000000, adults: 2, children: 1, bags: 'cabin', nightsOneWay: 3, booked: {}, step: 'summary',
    flight: { out: L('PRG', 'LIS', '2026-10-24', '06:25', '09:00', 'Europe/Prague', 'Europe/Lisbon', 'FR 7012'), back: L('OPO', 'PRG', '2026-10-28', '10:30', '14:50', 'Europe/Lisbon', 'Europe/Prague', 'FR 7013'), flightCzk: 2600, groundCzk: 120, bagCzk: 0, arrCzk: 104 },
    dest: { label: 'Lisabon', country: 'Portugalsko', cc: 'PT', lat: 38.7742, lon: -9.1342 },
    ground: { out: { minutes: 40 }, back: { minutes: 40 } }, groundMode: 'transit', overland: null, stay: null, plan: null,
    arrival: { out: { ...LIS_ARR }, back: { ...LIS_ARR, iata: 'OPO', city: 'Porto', how: 'metro (fialová linka E) do Trindade', czk: 58, lat: 41.1496, lon: -8.6109, fare: 2.35 } },
    car: { mode: 'manual', totalCzk: 2400, age: 30, pickup: 'LIS', dropoff: 'LIS', from: '2026-10-25T09:00', to: '2026-10-26T10:00', puCity: { ...LIS_CITY }, doCity: { ...LIS_CITY } },
    route: {
      mode: 'multi', transport: 'transit', legModes: [], exclude: [], candidates: [], notes: [],
      arrival: { iata: 'LIS', name: 'Lisabon (LIS)', lat: 38.7742, lon: -9.1342 }, departure: { iata: 'OPO', name: 'Porto (OPO)', lat: 41.2481, lon: -8.6814 },
      bases: [
        { id: 'city:LIS', name: 'Lisabon', lat: 38.7223, lon: -9.1393, nights: 2, cc: 'PT', country: 'Portugalsko', anchor: 'arrival', highlights: [],
          stay: { mode: 'pick', id: 'h1', name: 'Hotel Lisboa Centro', totalCzk: 7200, url: 'https://hotel.example/h1', lat: 38.7139, lon: -9.1394 },
          plan: { center: { lat: 38.7139, lon: -9.1394, label: 'Hotel Lisboa Centro', city: 'Lisabon', country: 'Portugalsko' }, days: [day('2026-10-24', 300, ['Alfama'], 38.71, -9.13), day('2026-10-25', 420, ['Sintra', 'Cabo da Roca'], 38.79, -9.39), day('2026-10-26', 120, ['Belém'], 38.69, -9.2)] } },
        { id: 'city:OPO', name: 'Porto', lat: 41.1579, lon: -8.6291, nights: 2, cc: 'PT', country: 'Portugalsko', anchor: 'departure', highlights: [],
          stay: { mode: 'pick', id: 'h2', name: 'Porto Ribeira Guesthouse', totalCzk: 6400, url: 'https://hotel.example/h2', lat: 41.1405, lon: -8.6131 },
          plan: { center: { lat: 41.1405, lon: -8.6131, label: 'Porto Ribeira Guesthouse', city: 'Porto', country: 'Portugalsko' }, days: [day('2026-10-26', 180, ['Ribeira'], 41.14, -8.61), day('2026-10-27', 420, ['Livraria Lello'], 41.15, -8.61)] } },
      ],
      transfers: [move(313, 190, 170, 900, 520, 620)],
      legs: { arrival: move(7, 20, 25, 30, 0, 50), departure: move(15, 25, 35, 40, 0, 60) },
    },
    ...over,
  };
}
