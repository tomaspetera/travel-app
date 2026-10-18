// Kamkoliv: kombinace aerolinek a letišť z už stažených letů (mixTrips v search.js) – Ryanair „kamkoliv“ (fetch
// nahrazen tvarem reálných odpovědí) a zkušební zdroje bez „kamkoliv“ / z mezipaměti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
process.env.RYANAIR_ENABLED = '1';
process.env.WIZZ_ENABLED = '0';
process.env.KIWI_ENABLED = '0';
process.env.TRAVELPAYOUTS_TOKEN = '';
const { search } = await import('../server/lib/search.js');
const { ryanair } = await import('../server/providers/ryanair.js');
const { makeLeg, makeTrip } = await import('../server/lib/fares.js');
const { priceStats } = await import('../server/lib/pricelevel.js');
const { weekday } = await import('../server/lib/dates.js');

const plain = (v) => JSON.parse(JSON.stringify(v));
const ap = (iataCode) => ({ countryName: '', iataCode, name: iataCode, seoName: iataCode, city: { name: iataCode, code: iataCode, countryCode: '' } });
const leg = (from, to, date, value, time) => ({ departureAirport: ap(from), arrivalAirport: ap(to), departureDate: `${date}T${time}:00`, arrivalDate: `${date}T${time.replace(/^\d\d/, (h) => String(+h + 2).padStart(2, '0'))}:00`, price: { value, currencyCode: 'EUR' }, flightNumber: 'FR100', previousPrice: null });
const d1 = ymdPlus(12);
const d2 = ymdPlus(16);
// Nejlevnější termín Ryanairu z každého letiště (jako roundTripFares): nejlevnější let tam je VIE → STN, nejlevnější
// zpět LTN → BTS – každý v jiné zpáteční letence. LTN → VIE je dražší než LTN → BTS (autem se ale vracíš do Vídně).
const FARES = {
  VIE: [[d1, 'VIE', 'STN', 10, d2, 40], [d1, 'VIE', 'LTN', 40, d2, 25], [d1, 'VIE', 'BGY', 15, d2, 15]],
  BTS: [[d1, 'BTS', 'LTN', 40, d2, 10]],
  BRQ: [[d1, 'BRQ', 'STN', 30, d2, 30]],
};
// zdrojové zpáteční letenky (bez kombinací): cíl → [[odkud, Kč letenky tam i zpět]]
const SOURCE = { LON: [['VIE', 50], ['VIE', 65], ['BTS', 50], ['BRQ', 60]], MIL: [['VIE', 30]] };
const handler = (url) => {
  if (url.includes('/views/locate/5/airports/en/active')) return { body: ['VIE', 'BTS', 'BRQ', 'STN', 'LTN', 'BGY'].map((code) => ({ code })) };
  if (url.includes('open.er-api.com')) return { body: { result: 'success', rates: { EUR: 1, CZK: 25 }, time_last_update_utc: 'test' } };
  if (url.includes('roundTripFares')) {
    const o = new URL(url).searchParams.get('departureAirportIataCode');
    return { body: { fares: (FARES[o] || []).map(([a, from, to, v, b, w]) => ({ outbound: leg(from, to, a, v, '07:00'), inbound: leg(to, from, b, w, '19:00') })) } };
  }
  return { status: 404, body: '{}' };
};
const Q = { from: ['ap:BRQ'], radiusKm: 150, dateFrom: ymdPlus(5), dateTo: ymdPlus(30), trip: 'return', nightsMin: 2, nightsMax: 7, adults: 1, kmRate: 1, noPartial: true };
async function run(raw, providers = null) {
  const stub = stubFetch(handler);
  try {
    return plain(await search({ ...Q, ...raw }, () => {}, providers ? { providers } : {}));
  } finally {
    stub.restore();
  }
}
const grp = (r, key) => r.groups.find((g) => g.dest.key === key);
const ground = (r, iata) => r.origins.find((o) => o.iata === iata)?.ground?.czk || 0;
const tripsOf = (r) => r.groups.flatMap((g) => g.options);
const sameAirports = (t) => t.back.from === t.out.to && t.back.to === t.out.from;
const wl = (from, to, date, eur, extra = {}) => Object.assign(makeLeg({ provider: 'wizzair', carrier: 'W6', carrierName: 'Wizz Air', from, to, dep: `${date}T09:00:00`, price: eur, currency: 'EUR', bookUrl: `https://wizzair.com/#/booking/select-flight/${from}/${to}/${date}` }), extra);
// Wizz Air bez „kamkoliv“: trasa VIE ↔ STN po dnech, zpět levně – ale z paměti tras (před 90 min)
const wizz = {
  id: 'wizzair', name: 'Wizz Air', live: true, callsPerRoute: () => 1,
  stations: async () => null,
  destinations: async (o) => (o === 'VIE' ? ['STN'] : []),
  daily: async ({ from }) => (from === 'VIE' ? [wl('VIE', 'STN', d1, 60)] : [wl('STN', 'VIE', d2, 6, { memAgeMin: 90 })]),
};

test('Kamkoliv: nejlevnější let tam a zpět z různých zpátečních letenek – open-jaw (VIE → STN, LTN → BTS) je nejlepší nabídka Londýna', async () => {
  const r = await run({});
  const lon = grp(r, 'LON');
  assert.deepEqual([lon.best.out.from, lon.best.out.to, lon.best.back.from, lon.best.back.to], ['VIE', 'STN', 'LTN', 'BTS']);
  assert.equal(lon.best.flightCzk, 20 * 25);
  assert.equal(lon.best.groundCzk, ground(r, 'VIE') + ground(r, 'BTS'));
  // dvě samostatné letenky: bez společného odkazu, každý let svou rezervací Ryanairu na svůj den
  assert.equal(lon.best.bookUrl, null);
  assert.match(lon.best.out.bookUrl, new RegExp(`originIata=VIE&destinationIata=STN`));
  assert.match(lon.best.out.bookUrl, new RegExp(`dateOut=${d1}`));
  assert.match(lon.best.back.bookUrl, new RegExp(`dateOut=${d2}.*originIata=LTN&destinationIata=BTS`));
  // žádná nejlepší nabídka cíle není dražší než nejlevnější zpáteční letenka zdroje
  for (const [key, list] of Object.entries(SOURCE)) {
    const src = Math.min(...list.map(([o, eur]) => eur * 25 + 2 * ground(r, o)));
    assert.ok(grp(r, key).best.perPersonCzk <= src, `${key}: ${grp(r, key).best.perPersonCzk} ≤ ${src}`);
  }
  // Milán má jen jednu zpáteční letenku (VIE ↔ BGY) – není s čím kombinovat, nabídka beze změny
  assert.equal(grp(r, 'MIL').count, 1);
  assert.equal(grp(r, 'MIL').best.flightCzk, 30 * 25);
});

test('Kamkoliv: „Je to dobrá cena?“ jen z nabídek zdrojů – kombinace ve výpisu jsou, statistiku nemění, úroveň dostanou', async () => {
  const r = await run({});
  const lon = grp(r, 'LON');
  const sortMins = (ps) => ({ ...ps, mins: [...ps.mins].sort((a, b) => a.join().localeCompare(b.join())) });
  const expected = priceStats(SOURCE.LON.map(([from, eur]) => ({ czk: eur * 25, date: d1, from })));
  assert.deepEqual(sortMins(lon.priceStats), sortMins(plain(expected)));
  assert.equal(lon.priceStats.n, 4);
  assert.ok(lon.count > 4, `${lon.count} nabídek do Londýna i s kombinacemi`);
  assert.ok(lon.options.some((t) => !sameAirports(t)));
  assert.equal(lon.best.priceLevel.n, 4);
  assert.equal(lon.best.priceLevel.pos, 0, 'nejlevnější z nabídek do Londýna');
  assert.ok(lon.best.deal && lon.best.deal.score > 0);
});

test('Kamkoliv: paměť cen (⭐ Moje cíle) zná i kombinaci – stejná letenka jako na kartě radaru, ne dražší nabídka zdroje', async () => {
  const r = await run({});
  const lon = grp(r, 'LON');
  assert.ok(lon.best.flightCzk < lon.priceStats.min, `kombinace ${lon.best.flightCzk} < ${lon.priceStats.min}`);
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../public/js/pricecheck.js', import.meta.url), 'utf8'), ctx);
  const P = ctx.window.PriceCheck;
  const now = Date.now();
  const store = P.record(null, P.entriesOf(r), { now });
  const seen = P.seenMin(store, 'LON', now);
  assert.deepEqual([seen.czk, seen.from, seen.month], [lon.best.flightCzk, lon.best.out.from, lon.best.out.date.slice(0, 7)]);
  // každá cesta, kterou skupina ukazuje (radar bere best / options), má v paměti cenu nejvýš svou
  for (const t of tripsOf(r)) assert.ok(store.r[P.tripKey(t)].min <= t.flightCzk, P.tripKey(t));
});

test('Kamkoliv autem: návrat vždy na letiště, kde parkuje auto (v cíli i z jiného letiště téhož města)', async () => {
  const r = await run({ groundMode: 'car' });
  const all = tripsOf(r);
  assert.ok(all.length);
  for (const t of all) assert.equal(t.back.to, t.out.from, `${t.out.from} → ${t.out.to}, zpět ${t.back.from} → ${t.back.to}`);
  // VIE → STN (10 €) + LTN → VIE (25 €): jiné letiště v Londýně, domů do Vídně za autem
  const lon = grp(r, 'LON');
  assert.ok(lon.options.some((t) => t.out.from === 'VIE' && t.out.to === 'STN' && t.back.from === 'LTN' && t.back.to === 'VIE' && t.flightCzk === 35 * 25));
  assert.ok(!lon.options.some((t) => t.back.to === 'BTS' && t.out.from !== 'BTS'));
});

test('Kamkoliv bez „návrat i na jiné letiště v okolí“: kombinace aerolinek jen na stejná letiště tam i zpět', async () => {
  const r = await run({ openJaw: false }, [ryanair, wizz]);
  for (const t of tripsOf(r)) assert.ok(sameAirports(t), `${t.out.from} → ${t.out.to}, zpět ${t.back.from} → ${t.back.to}`);
  // Ryanair VIE → STN (10 €) + Wizz Air STN → VIE (6 €): dvě aerolinky, stejná letiště
  const best = grp(r, 'LON').best;
  assert.deepEqual([best.provider, best.out.provider, best.back.provider, best.flightCzk], ['mix', 'ryanair', 'wizzair', 16 * 25]);
});

test('Kamkoliv: tam s Ryanairem, zpět s Wizz Air (cena z paměti tras zůstane i se svým stářím); nabídky Travelpayouts z mezipaměti („kamkoliv“) se nekombinují', async () => {
  // Travelpayouts (ceny z mezipaměti): levný let tam i celá zpáteční letenka – rozkládat ani kombinovat se nesmí
  const cl = (from, to, date, czk) => makeLeg({ provider: 'travelpayouts', from, to, dep: `${date}T06:00:00`, czk, live: false });
  const tp = {
    id: 'travelpayouts', name: 'Travelpayouts', live: false,
    stations: async () => null,
    explore: async ({ origin }) => (origin === 'VIE' ? [makeTrip(cl('VIE', 'STN', d1, 25), cl('STN', 'VIE', d2, 2400)), makeTrip(cl('VIE', 'LTN', d1, 30), cl('LTN', 'VIE', d2, 30), { combinedCzk: 2300 })] : []),
  };
  const r = await run({}, [ryanair, wizz, tp]);
  const lon = grp(r, 'LON');
  const mix = lon.options.find((t) => t.provider === 'mix');
  assert.ok(mix, 'kombinace Ryanair + Wizz Air');
  assert.deepEqual([mix.out.provider, mix.out.from, mix.out.to, mix.back.provider, mix.back.from, mix.back.to], ['ryanair', 'VIE', 'STN', 'wizzair', 'STN', 'VIE']);
  assert.equal(mix.flightCzk, 16 * 25);
  assert.equal(mix.back.memAgeMin, 90, 'stáří ceny z paměti tras u letu zůstane');
  assert.equal(mix.bookUrl, null);
  assert.match(mix.out.bookUrl, /ryanair\.com/);
  assert.match(mix.back.bookUrl, /wizzair\.com/);
  // let z mezipaměti Travelpayouts jen ve své vlastní nabídce
  for (const t of tripsOf(r)) {
    const provs = new Set([t.out.provider, t.back.provider]);
    if (provs.has('travelpayouts')) assert.equal(t.provider, 'travelpayouts', `${t.id}`);
  }
  // „Je to dobrá cena?“: 4 zpáteční letenky Ryanairu, 1 Wizz Air, 2 Travelpayouts – kombinace ne
  assert.equal(lon.priceStats.n, 7);
});

test('Kamkoliv o víkendu: ani ceny Travelpayouts dohledané po dnech (termín mimo dny odletu) se nekombinují', async () => {
  // Travelpayouts (mezipaměť) umí i ceny po dnech: jeho termín do Lutonu nesedí na den odletu → dohledání po dnech
  // (routeTrips). Levný let tam z mezipaměti (VIE → LTN 100 Kč) by s Ryanairem LTN → BTS dal nejlevnější Londýn.
  const cl = (from, to, date, czk) => makeLeg({ provider: 'travelpayouts', from, to, dep: `${date}T06:00:00`, czk, live: false });
  const days = [];
  const tp = {
    id: 'travelpayouts', name: 'Travelpayouts', live: false,
    stations: async () => null,
    explore: async ({ origin }) => (origin === 'VIE' ? [makeTrip(cl('VIE', 'LTN', ymdPlus(13), 2000), cl('LTN', 'VIE', d2, 2000))] : []),
    daily: async ({ from, to }) => { days.push(`${from}>${to}`); return from === 'VIE' ? [cl('VIE', 'LTN', d1, 100)] : [cl('LTN', 'VIE', d2, 3000)]; },
  };
  const r = await run({ outDays: [weekday(d1)] }, [ryanair, tp]);
  assert.deepEqual(days, ['VIE>LTN', 'LTN>VIE'], 'Travelpayouts dohledal trasu po dnech');
  for (const t of tripsOf(r)) {
    const provs = new Set([t.out.provider, t.back.provider]);
    if (provs.has('travelpayouts')) assert.equal(t.provider, 'travelpayouts', `${t.out.provider} ${t.out.from} → ${t.out.to} + ${t.back.provider} ${t.back.from} → ${t.back.to}`);
  }
  // nejlepší Londýn zůstane kombinace jen z Ryanairu (VIE → STN + LTN → BTS)
  const lon = grp(r, 'LON');
  assert.deepEqual([lon.best.out.provider, lon.best.back.provider, lon.best.out.from, lon.best.back.to, lon.best.flightCzk], ['ryanair', 'ryanair', 'VIE', 'BTS', 20 * 25]);
});
