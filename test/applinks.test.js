// Odkazy do aplikací v mobilu: 🚗 Waze (navigace autem) a 🎫 PID Lítačka (jízdenka MHD v Praze) – tvar adres
// (public/js/searchhelp.js) a kde se ukážou: průvodce cestou (trip.js) a výlety autem v Objevuj (places.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
process.env.FUEL_LIVE = '0'; // cesta autem počítá palivo – ceny vestavěné, bez sítě
const A = await import('../server/lib/access.js');
const { getAirport } = await import('../server/lib/airports.js');

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const sh = { window: {} };
vm.runInNewContext(src('searchhelp.js'), sh);
const H = sh.window.SearchHelp;
// Odkazy z HTML (href) jako URL
const hrefs = (html) => [...String(html).matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, '&')));
const wazes = (html) => hrefs(html).filter((u) => u.hostname === 'waze.com');

test('Waze: navigace na souřadnice (5 desetinných míst), bez nich hledání podle názvu, jinak nic', () => {
  // oficiální formát developers.google.com/waze/deeplinks: https://waze.com/ul?ll=LAT,LON&navigate=yes
  assert.equal(H.wazeUrl({ lat: 50.1008369, lon: 14.2632401 }), 'https://waze.com/ul?ll=50.10084,14.26324&navigate=yes');
  assert.equal(H.wazeUrl({ lat: -33.8688, lon: -70.123456789 }), 'https://waze.com/ul?ll=-33.8688,-70.12346&navigate=yes', 'jižní a západní polokoule');
  assert.equal(H.wazeUrl({ lat: 45, lon: 7 }), 'https://waze.com/ul?ll=45,7&navigate=yes');
  const u = new URL(H.wazeUrl({ lat: 41.59330001, lon: 1.83749999 }));
  assert.deepEqual([u.hostname, u.pathname, u.searchParams.get('ll'), u.searchParams.get('navigate')], ['waze.com', '/ul', '41.5933,1.8375', 'yes']);
  // neplatná poloha (text, mimo rozsah, 0/0 = chybějící, NaN) → hledání podle názvu, bez názvu null
  for (const p of [{ lat: '50.1', lon: '14.2' }, { lat: 91, lon: 14 }, { lat: 50, lon: 181 }, { lat: 0, lon: 0 }, { lat: NaN, lon: 1 }, {}, null, undefined]) assert.equal(H.wazeUrl(p), null, JSON.stringify(p));
  assert.equal(H.wazeUrl({ lat: 0, lon: 0, q: 'Hotel Roma, Řím' }), 'https://waze.com/ul?q=Hotel%20Roma%2C%20%C5%98%C3%ADm');
  // název se zakóduje celý – & ani uvozovky z názvu hotelu adresu nerozbijí
  const q = new URL(H.wazeUrl({ q: ' Hotel "A&B" <x> ' }));
  assert.equal(q.searchParams.get('q'), 'Hotel "A&B" <x>');
  assert.deepEqual([...q.searchParams.keys()], ['q']);
  assert.equal(new URL(H.wazeUrl({ q: 'x'.repeat(500) })).searchParams.get('q').length, 200, 'dlouhý název zkrácený');
  assert.equal(H.wazeUrl({ q: '   ' }), null);
  assert.equal(H.WAZE_HOME, 'https://waze.com/ul?favorite=home&navigate=yes');
  assert.equal(H.PID_APP, 'https://app.pidlitacka.cz/');
});

test('PID Lítačka: jen cesta na letiště veřejnou dopravou přes pražskou MHD (rozpis ze serveru)', () => {
  const PRG = getAirport('PRG');
  const praha = { lat: 50.0755, lon: 14.4378, label: 'Praha', cc: 'CZ' };
  // z Prahy na Ruzyni: autobus 59 + metro A (PID)
  assert.equal(H.pidLeg(A.transitAccess(praha, PRG)), true);
  // z Prahy do Vídně: MHD na nádraží (PID) + vlak/bus – jízdenku PID potřebuješ taky
  assert.equal(H.pidLeg(A.transitAccess(praha, getAirport('VIE'))), true);
  // z Brna na brněnské letiště ani z Brna do Vídně ne; autem nikdy
  const brno = { lat: 49.1951, lon: 16.6068, label: 'Brno', cc: 'CZ' };
  assert.equal(H.pidLeg(A.transitAccess(brno, getAirport('BRQ'))), false);
  assert.equal(H.pidLeg(A.transitAccess(brno, getAirport('VIE'))), false);
  assert.equal(H.pidLeg(A.carAccess(praha, PRG)), false);
  assert.equal(H.pidLeg({ mode: 'car', breakdown: [{ label: 'MHD (PID)' }] }), false);
  // vlastní cena (rozpis jen „vlastní cena“), prázdné a nesmyslné hodnoty ze sdíleného odkazu
  assert.equal(H.pidLeg(A.transitAccess(praha, PRG, { own: 30 })), false);
  for (const g of [null, undefined, {}, { breakdown: null }, { breakdown: [null, 5, { label: 7 }] }, { breakdown: [{ label: 'RAPID bus' }] }]) assert.equal(H.pidLeg(g), false, JSON.stringify(g));
});

// trip.js s pomocnými řádky z app.js (jako test/trip-integration.test.js), SearchHelp volitelně
function loadTrip(withHelp = true) {
  const ctx = { URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  ctx.window = ctx; // jako v prohlížeči: window.SearchHelp je i globální SearchHelp
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  if (withHelp) vm.runInContext(src('searchhelp.js'), ctx, { filename: 'searchhelp.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = {}, $ = () => ({ innerHTML: '', value: '', remove() {} }), $$ = () => [], go = () => {}, save = () => {}, flag = (cc) => cc, toast = () => {};`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx.window.Trip;
}
const leg = (from, to, date, dep, arr) => ({ from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz: 'Europe/Prague', toTz: 'Europe/Rome', carrier: 'FR', carrierName: 'Ryanair', flightNo: 'FR 1', provider: 'ryanair' });
const PRAHA = { lat: 50.0755, lon: 14.4378, label: 'Praha', cc: 'CZ' };
// Cesta z výsledku hledání PRG → Řím: doprava na letiště z hledání (ground ze serveru, ap = poloha letiště)
const tripOf = (mode, over = {}) => {
  const PRG = getAirport('PRG');
  const g = mode === 'car' ? A.carAccess(PRAHA, PRG) : A.transitAccess(PRAHA, PRG);
  return {
    v: 1, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', groundMode: mode, carFuel: mode === 'car' ? 'diesel' : null,
    ground: { out: { ...g, ap: { lat: PRG.lat, lon: PRG.lon } }, back: { ...g, ap: { lat: PRG.lat, lon: PRG.lon } } },
    // ve dne (brzy ráno by z domu na letiště jelo taxi – řádek bez MHD)
    flight: { out: leg('PRG', 'FCO', '2026-11-10', '11:00', '13:00'), back: leg('FCO', 'PRG', '2026-11-14', '15:00', '17:00'), flightCzk: 3000, groundCzk: 2 * g.czk, perPersonCzk: 3000 },
    dest: { label: 'Řím', country: 'Itálie', cc: 'IT', lat: 41.9, lon: 12.5 }, stay: null, car: null, plan: null, ...over,
  };
};

test('průvodce: autem na letiště Waze k letišti odletu a domů, MHD v Praze jízdenka v PID Lítačka', () => {
  const Trip = loadTrip();
  const PRG = getAirport('PRG');
  const car = Trip.groundApps(tripOf('car'));
  assert.deepEqual(wazes(car.out).map((u) => u.href), [`https://waze.com/ul?ll=${Math.round(PRG.lat * 1e5) / 1e5},${Math.round(PRG.lon * 1e5) / 1e5}&navigate=yes`]);
  assert.match(car.out, /🚗 Navigovat ve Waze/);
  assert.match(car.out, /title="Navigace autem ve Waze – letiště PRG/);
  assert.deepEqual(wazes(car.back).map((u) => u.href), ['https://waze.com/ul?favorite=home&navigate=yes']);
  assert.equal(car.fare, '', 'autem jízdenka PID ne');
  // starší cesta bez polohy letiště: k letišti nic (nehádá se), domů ano
  const old = tripOf('car');
  for (const k of ['out', 'back']) delete old.ground[k].ap;
  assert.equal(Trip.groundApps(old).out, '');
  // jen tam (bez letu zpět): domů nic
  assert.equal(Trip.groundApps(tripOf('car', { flight: { ...tripOf('car').flight, back: null } })).back, '');

  const mhd = Trip.groundApps(tripOf('transit'));
  for (const k of ['out', 'back', 'fare']) {
    assert.deepEqual(hrefs(mhd[k]).map((u) => u.href), ['https://app.pidlitacka.cz/'], k);
    assert.match(mhd[k], /🎫 Jízdenka v PID Lítačka/);
    assert.match(mhd[k], /class="app-chip"[^>]*target="_blank" rel="noopener"/);
  }
  assert.equal(wazes(mhd.out).length, 0);
  // z Brna na brněnské letiště: MHD, ale ne pražská
  const BRQ = getAirport('BRQ');
  const brno = A.transitAccess({ lat: 49.1951, lon: 16.6068, label: 'Brno', cc: 'CZ' }, BRQ);
  const tb = Trip.groundApps(tripOf('transit', { ground: { out: brno, back: brno } }));
  assert.deepEqual([tb.out, tb.back, tb.fare], ['', '', '']);

  // průběh cesty: štítek u řádku cesty na letiště i z letiště domů
  const rows = Trip.timeline(Trip.sanitizeTrip(tripOf('car')));
  const toAp = rows.find((r) => /Autem na letiště PRG/.test(r[2])), home = rows.find((r) => /z letiště PRG domů/.test(r[2]));
  assert.equal(wazes(toAp[2]).length, 1);
  assert.equal(wazes(home[2])[0].searchParams.get('favorite'), 'home');
  const rowsT = Trip.timeline(Trip.sanitizeTrip(tripOf('transit')));
  assert.ok(rowsT.filter((r) => /app\.pidlitacka\.cz/.test(r[2])).length === 2, 'tam i zpět');

  // bez SearchHelp (starší pořadí skriptů, testy) žádné štítky, nic nespadne
  const bare = loadTrip(false).groundApps(tripOf('car'));
  assert.deepEqual([bare.out, bare.back, bare.fare], ['', '', '']);
  // text řádků (groundLines) zůstává čistý text bez odkazů
  assert.ok(!/</.test(JSON.stringify(Trip.groundLines(tripOf('transit')))));
});

test('průvodce: trasa přes víc míst autem – Waze do dalšího místa a na letiště odletu, vlakem ne', () => {
  const Trip = loadTrip();
  const base = (id, name, lat, lon, nights) => ({ id, name, lat, lon, cc: 'IT', country: 'Itálie', nights, stay: null, plan: null, reason: '', highlights: [] });
  const x = { km: 180, carMin: 140, transitMin: 170, long: false, transitKind: 'rail', basis: 'estimate', border: null, carUrl: 'https://www.google.com/maps/dir/?api=1&travelmode=driving', transitUrl: 'https://www.google.com/maps/dir/?api=1&travelmode=transit' };
  const route = (transport) => ({
    mode: 'multi', transport, want: 2, exclude: [], candidates: [], notes: [],
    arrival: { iata: 'FCO', name: 'Řím (FCO)', lat: 41.8003, lon: 12.2389 }, departure: { iata: 'FCO', name: 'Řím (FCO)', lat: 41.8003, lon: 12.2389 },
    bases: [base('city:ROM', 'Řím', 41.9028, 12.4964, 2), base('Q2044', 'Florencie', 43.7696, 11.2558, 2)],
    transfers: [x], legs: { arrival: { ...x, km: 30, carMin: 35, transitMin: 50 }, departure: { ...x, km: 280, carMin: 190, transitMin: 200 } },
  });
  const t = tripOf('transit', { route: route('car'), car: { mode: 'pick', pickup: 'FCO', from: '2026-11-10T10:00', to: '2026-11-14T15:00', dropoff: 'FCO', totalCzk: 4000 } });
  const rows = Trip.timeline(Trip.sanitizeTrip(t));
  const ll = (r) => wazes(r[2]).map((u) => u.searchParams.get('ll'));
  assert.deepEqual(ll(rows.find((r) => /Z letiště FCO → Řím/.test(r[2]))), ['41.9028,12.4964'], 'z letiště do 1. místa');
  assert.deepEqual(ll(rows.find((r) => /Přejezd Řím → Florencie/.test(r[2]))), ['43.7696,11.2558'], 'přejezd do dalšího místa');
  assert.deepEqual(ll(rows.find((r) => /Florencie → letiště FCO/.test(r[2]))), ['41.8003,12.2389'], 'z posledního místa na letiště odletu');
  // vlakem a busem mezi místy: žádný Waze
  const rt = Trip.timeline(Trip.sanitizeTrip({ ...t, route: route('transit') }));
  assert.equal(rt.flatMap((r) => wazes(r[2])).length, 0);
});

test('Objevuj: výlet autem má u každé zastávky Waze, výlet vlakem ne', () => {
  const ctx = { window: {}, URLSearchParams, console };
  vm.createContext(ctx);
  vm.runInContext(src('searchhelp.js'), ctx, { filename: 'searchhelp.js' });
  vm.runInContext(src('app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('places.js'), ctx, { filename: 'places.js' });
  const T = ctx.window.Places._t;
  const C = { label: 'Barcelona', city: 'Barcelona', country: 'Španělsko', cc: 'ES', lat: 41.3874, lon: 2.1686 };
  const stop = (id, name, lat, lon) => ({ id, name, cc: 'ES', lat, lon, travelKm: 50, travelMin: 55, visitMin: 120, arrive: '10:00', depart: '09:00', categoryLabel: 'Klášter' });
  const trip = (transport) => ({ mode: 'day', transport, spare: [], days: [{ date: '2026-10-12', from: { name: 'Barcelona', lat: 41.3874, lon: 2.1686 },
    stops: [stop('Q190', 'Montserrat', 41.5933, 1.8375), stop('Q13985', 'Vic <b>', 41.9301, 2.2549)], back: { arrive: '19:25', depart: '18:10', km: 70, min: 75 }, overnight: null, travelMin: 200, travelKm: 180, minutes: 600 }] });
  const html = T.tripHtml(trip('car'), C);
  assert.deepEqual(wazes(html).map((u) => u.searchParams.get('ll')), ['41.5933,1.8375', '41.9301,2.2549']);
  assert.match(html, /title="Navigace autem ve Waze – Vic &lt;b&gt;"/, 'název zastávky escapovaný');
  assert.equal(wazes(T.tripHtml(trip('transit'), C)).length, 0);
});
