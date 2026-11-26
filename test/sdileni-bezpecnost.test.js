// Sdílená cesta je cizí vstup (#trip=, krátký odkaz /c/ → #trip=, záloha a „Otevřít v průvodci“ – vše přes
// Trip.sanitizeTrip): odkazy „Koupit letenky“, ubytování, auto, přejezdy a jízdenky smí vést jen na weby, kam vedou
// odkazy aplikace (OfferShare.safeLink v public/js/offershare.js), jinak by cizí člověk mohl poslat na podvodnou stránku.
// Klasické skripty prohlížeče přes node:vm; pomocné funkce jsou skutečné řádky z app.js (jako test/trip-route.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load({ offer = true } = {}) {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}`, ctx, { filename: 'app-helpers.js' });
  if (offer) vm.runInContext(src('offershare.js'), ctx, { filename: 'offershare.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx.window;
}
const { Trip, OfferShare } = load();
const plain = (x) => JSON.parse(JSON.stringify(x));

const RYANAIR = 'https://www.ryanair.com/cz/cs/trip/flights/select?adults=1&dateOut=2027-03-01&originIata=PRG&destinationIata=STN';
const EVIL = [
  'https://evil.example/booking/pay',
  'https://ryanair-com.evil.example/booking/pay',
  'https://ryanair.com.evil.example/',
  'https://www.ryanair.com@evil.example/x',
  'https://www.ryanair.com\\@evil.example/x',
  'https://evil.example/www.ryanair.com/',
  'http://www.ryanair.com/cz/cs',
  'http://evil.example/ryanair.com',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(document.cookie)',
  'data:text/html,<script>alert(1)</script>',
  '//evil.example/x',
  'https:/evil.example',
  'https://www.google.com/url?q=https://evil.example',
  // prohlížeč z /maps/../url udělá /url (i s %2e a \) – omezení cesty u Googlu se tím nesmí obejít
  'https://www.google.com/maps/../url?q=https://evil.example',
  'https://www.google.com/maps/%2e%2e/url?q=https://evil.example',
  'https://www.google.com/maps\\..\\url?q=https://evil.example',
  'https://www.google.com/travel/./../url?q=https://evil.example',
  // tp.media přesměruje na u= – cíl musí být povolený, jen jeden a ne další tp.media
  'https://tp.media/r?campaign_id=100&marker=1&p=4114&u=https%3A%2F%2Fevil.example%2F',
  'https://tp.media/r?u=https%3A%2F%2Fwww.aviasales.com%2F&u=https%3A%2F%2Fevil.example%2F',
  'https://tp.media/r?campaign_id=100&marker=1&p=4114',
  'https://tp.media/r?campaign_id=100&url=https%3A%2F%2Fevil.example&u=https%3A%2F%2Fwww.aviasales.com%2F',
  'https://tp.media/r?u=https%3A%2F%2Ftp.media%2Fr%3Fu%3Dhttps%253A%252F%252Fevil.example',
  'https://tp.media/r?u=%E0%A4%A',
  'https://c111.travelpayouts.com/click?shmarker=1&custom_url=https%3A%2F%2Fevil.example',
  'https://www.ryanair.com /x',
  ' https://www.ryanair.com/',
  'ftp://www.ryanair.com/',
  'https://www.ryanair.com:99999999/',
];
const OK = [
  RYANAIR,
  'https://www.kiwi.com/deep?affilid=x&from=PRG&to=STN',
  'https://be.wizzair.com/#/booking/select-flight/PRG/LTN/2027-03-01/null/1/0/0/null',
  'https://www.aviasales.com/search/PRG0103STN1',
  'https://tp.media/r?campaign_id=100&marker=1&p=4114&u=https%3A%2F%2Fwww.aviasales.com',
  'https://tp.media/r?campaign_id=84&marker=1&p=2076&trs=1&sub_id=atlas&u=https%3A%2F%2Fwww.booking.com%2Fsearchresults.cs.html%3Fss%3DHotel%2BD%2527Angleterre',
  'https://www.booking.com/searchresults.cs.html?ss=Hotel%2C%20Londyn',
  'https://cars.booking.com/search-results?locationIata=STN',
  'https://www.google.com/maps/dir/?api=1&origin=A&destination=B&travelmode=transit',
  'https://www.google.com/travel/search?q=hotel&hl=cs',
  'https://mapy.com/fnc/v1/route?start=1,2&end=3,4',
  'https://regiojet.cz/?fromLocationId=1',
  'https://shop.flixbus.cz/search?departureCity=1',
  'https://idos.cz/vlakyautobusy/spojeni/?f=Praha',
  'https://cs.wikipedia.org/wiki/Londýn',
];

test('OfferShare.safeLink: podvržené odkazy pryč, odkazy aplikace (Aviasales, aerolinky, ubytování, mapy) zůstanou', () => {
  for (const u of EVIL) assert.equal(OfferShare.safeLink(u), null, u);
  for (const u of OK) assert.equal(OfferShare.safeLink(u), u, u);
  for (const u of [null, undefined, 5, {}, ['https://www.ryanair.com/'], 'https://www.ryanair.com/' + 'x'.repeat(4000)]) assert.equal(OfferShare.safeLink(u), null);
});

const leg = (from, to, date, bookUrl) => ({ from, to, date, dep: `${date}T07:00:00`, arr: `${date}T08:30:00`, hasTime: true, carrier: 'FR', carrierName: 'Ryanair', provider: 'ryanair', bookUrl });
const base = (i, stayUrl, searchUrl) => ({
  id: `b${i}`, name: ['Londýn', 'Oxford'][i], lat: 51.5 + i / 10, lon: -0.1 - i, nights: 2, cc: 'GB', country: 'Spojené království', searchUrl,
  stay: { mode: 'pick', id: 'h' + i, name: 'Hotel', totalCzk: 5000, url: stayUrl, checkin: '2027-03-01', checkout: '2027-03-03' },
  plan: { center: { lat: 51.5, lon: -0.1 }, days: [{ date: '2027-03-01', items: [{ name: 'Muzeum', lat: 51.5, lon: -0.1, url: stayUrl }] }] },
});
const tr = (url) => ({ km: 90, carMin: 80, transitMin: 70, long: false, carUrl: url, transitUrl: url });
// Cesta, jak ji pošle útočník: všude stejný odkaz u (podvržený nebo pravý)
function trip(u) {
  return {
    v: 1, adults: 1, bags: 'none', nightsOneWay: 3,
    flight: { out: leg('PRG', 'STN', '2027-03-01', u), back: leg('STN', 'PRG', '2027-03-05', u), mid: [leg('STN', 'EDI', '2027-03-03', u)], bookUrl: u, flightCzk: 2000 },
    dest: { label: 'Londýn', cc: 'GB' }, ground: {},
    stay: { mode: 'pick', name: 'Hotel', totalCzk: 5000, url: u }, car: { mode: 'manual', name: 'Auto', totalCzk: 3000, url: u },
    route: { mode: 'multi', transport: 'car', bases: [base(0, u, u), base(1, u, u)], transfers: [tr(u)], legs: { arrival: tr(u), departure: tr(u) } },
    overland: {
      on: false, from: { label: 'Praha', cc: 'CZ', lat: 50.08, lon: 14.43 }, to: { label: 'Londýn', cc: 'GB', lat: 51.5, lon: -0.1 },
      out: { source: 'estimate', date: '2027-03-01' }, links: { out: [{ id: 'regiojet', name: 'RegioJet', url: u }, { id: 'flixbus', name: 'FlixBus', url: u }], back: [] },
    },
  };
}
// všechny odkazy v pročištěné cestě (klíče …url / …Url), ať žádný nezůstane mimo kontrolu
const links = (t, out = []) => {
  for (const [k, v] of Object.entries(t || {})) if (typeof v === 'string' && /url$/i.test(k)) out.push(`${k}=${v}`); else if (v && typeof v === 'object') links(v, out);
  return out;
};

test('sanitizeTrip: podvržený odkaz ve sdílené cestě se nepoužije – let, ubytování, auto, trasa, program i jízdenky', () => {
  for (const u of EVIL) {
    const t = Trip.sanitizeTrip(plain(trip(u)));
    assert.deepEqual(links(plain(t)), [], u);
    assert.equal(t.flight.bookUrl, null, `Koupit letenky: ${u}`);
    assert.equal(t.flight.out.bookUrl, null);
    assert.equal(t.car.url, null, 'auto pak použije vlastní hledání (carLinkFor)');
    assert.equal(t.route.bases[0].stay.url, null, 'ubytování pak vlastní hledání (baseSearchUrl)');
    assert.equal(t.route.transfers[0].carUrl, null);
    assert.equal(plain(t.overland.links.out).length, 0, 'odkazy na jízdenky jen na povolené weby');
  }
  // i s volbou quotes (karta „Dnes na cestě“, app.js tripWiz)
  assert.deepEqual(links(plain(Trip.sanitizeTrip(plain(trip(EVIL[0])), { quotes: true }))), []);
});

test('sanitizeTrip: běžné odkazy na Aviasales, aerolinky, ubytování a mapy zůstanou beze změny', () => {
  const t = Trip.sanitizeTrip(plain(trip(RYANAIR)));
  assert.equal(t.flight.bookUrl, RYANAIR);
  assert.equal(t.flight.out.bookUrl, RYANAIR);
  assert.equal(t.flight.mid[0].bookUrl, RYANAIR);
  assert.equal(t.car.url, RYANAIR);
  assert.equal(t.route.bases[1].stay.url, RYANAIR);
  const gm = 'https://www.google.com/maps/dir/?api=1&origin=A&destination=B&travelmode=driving';
  assert.equal(Trip.sanitizeTrip(plain(trip(gm))).route.legs.arrival.carUrl, gm);
  const tp = 'https://tp.media/r?campaign_id=100&marker=1&p=4114&u=https%3A%2F%2Fwww.aviasales.com%2Fsearch%2FPRG0103STN1';
  assert.equal(Trip.sanitizeTrip(plain(trip(tp))).flight.bookUrl, tp);
  const bk = 'https://www.booking.com/searchresults.cs.html?ss=Hotel%2C%20Oxford&checkin=2027-03-03';
  const s = Trip.sanitizeTrip(plain(trip(bk)), { quotes: true });
  assert.equal(s.stay.url, bk);
  assert.equal(s.route.bases[0].searchUrl, bk);
});

test('sanitizeTrip bez OfferShare (nenačtený skript): odkazy pryč, ne puštěné bez kontroly', () => {
  const W = load({ offer: false });
  assert.deepEqual(links(plain(W.Trip.sanitizeTrip(plain(trip(RYANAIR))))), []);
});
