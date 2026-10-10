// Přesná data: víc letů na den (všechny přímé), Kiwi se seznamy letišť a zvlášť jen přímé lety,
// dálkové země z domova i z přestupních letišť zvlášť, nejbližší dny, další odlety dne, aktivní filtry
// a hlášení výpadku Kiwi v průběhu hledání. Všechny zdroje nahrazené (fetch stub).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
process.env.RYANAIR_ENABLED = '1';
process.env.WIZZ_ENABLED = '1';
process.env.KIWI_ENABLED = '1';
process.env.TRAVELPAYOUTS_TOKEN = '';
const { search, nearbyDays, nearbyOf } = await import('../server/lib/search.js');
const { resetKiwi, kiwiBlocked } = await import('../server/providers/kiwi.js');
const { setRates, FALLBACK_EUR } = await import('../server/lib/fx.js');

setRates({ base: 'EUR', rates: { ...FALLBACK_EUR, CZK: 25 }, source: 'test' });

const plus = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const dmyToYmd = (s) => `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;

// ---- „svět“ zdrojů: každý test si nastaví, co který zdroj vrací ----
// Trasy Ryanairu jsou v mezipaměti 24 h → pro celý soubor stejné.
const FR_ROUTES = { PRG: ['BCN', 'STN'], BCN: ['PRG'] };
const world = {
  frDays: {}, // { 'PRG|BCN': [[date, '10:05', eur]] }
  frSchedule: {}, // { 'PRG|BCN|date': ['10:05', '18:45'] }
  frExplore: () => [], // (params) → fares
  w6: {}, // { 'VIE|CRL': [{ times: ['08:00', '20:00'], eur: 20 }] } (každý den v okně)
  kiwi: () => [], // (args) → itineraries | { status }
};
const kiwiCalls = [];

const seg = (from, to, date, hhmm, carrier) => ({ from, to, departureTime: `${date}T${hhmm}:00`, arrivalTime: `${date}T${String(Math.min(23, Number(hhmm.slice(0, 2)) + 2)).padStart(2, '0')}:${hhmm.slice(3)}:00`, carrier, flightNumber: `${carrier}100` });
/** Kiwi itinerář jedním směrem (stops > 0 → přes MUC). */
function itin(from, to, date, hhmm, carrier, eur, stops = 0, back = null) {
  const legOf = (a, b, d, h) => {
    const segs = stops ? [seg(a, 'MUC', d, h, carrier), seg('MUC', b, d, h, carrier)] : [seg(a, b, d, h, carrier)];
    return { from: a, to: b, departureTime: segs[0].departureTime, arrivalTime: segs.at(-1).arrivalTime, durationSeconds: 7200, stops, segments: segs };
  };
  return { price: eur, bookingUrl: `https://www.kiwi.com/booking?${from}${to}${hhmm}`, outbound: legOf(from, to, date, hhmm), ...(back ? { inbound: legOf(to, from, back.date, back.hhmm) } : {}) };
}

const ap = (code) => ({ iataCode: code, name: code, seoName: code, city: { name: code, code, countryCode: '' } });
const frFare = (from, to, date, hhmm, eur) => ({ outbound: { departureAirport: ap(from), arrivalAirport: ap(to), departureDate: `${date}T${hhmm}:00`, arrivalDate: `${date}T23:00:00`, price: { value: eur, currencyCode: 'EUR' }, flightNumber: 'FR3040', previousPrice: null } });

function handler(url, init) {
  if (url.includes('open.er-api.com')) return { body: { result: 'success', rates: { EUR: 1, CZK: 25 }, time_last_update_utc: 'test' } };
  // Ryanair
  if (url === 'https://www.ryanair.com/ie/en') return { body: '<html></html>', headers: { 'content-type': 'text/html' } };
  if (url.includes('/views/locate/5/airports/en/active')) {
    return { body: ['PRG', 'BCN', 'STN', 'BRQ', 'VIE', 'BTS', 'KTW', 'BGY', 'VCE', 'BLQ', 'NAP', 'CRL', 'OPO'].map((code) => ({ code })) };
  }
  const routes = url.match(/searchWidget\/routes\/en\/airport\/([A-Z]{3})/);
  if (routes) return { body: (FR_ROUTES[routes[1]] || []).map((code) => ({ arrivalAirport: { code } })) };
  const cpd = url.match(/oneWayFares\/([A-Z]{3})\/([A-Z]{3})\/cheapestPerDay/);
  if (cpd) {
    const m = new URL(url).searchParams.get('outboundMonthOfDate').slice(0, 7);
    const fares = (world.frDays[`${cpd[1]}|${cpd[2]}`] || []).filter(([d]) => d.startsWith(m))
      .map(([d, hhmm, eur]) => ({ day: d, departureDate: `${d}T${hhmm}:00`, arrivalDate: `${d}T23:00:00`, price: { value: eur, currencyCode: 'EUR' }, soldOut: false, unavailable: false }));
    return { body: { outbound: { fares } } };
  }
  if (url.includes('/farfnd/v4/oneWayFares') || url.includes('/farfnd/v4/roundTripFares')) {
    return { body: { fares: world.frExplore(Object.fromEntries(new URL(url).searchParams)) } };
  }
  const tt = url.match(/timtbl\/3\/schedules\/([A-Z]{3})\/([A-Z]{3})\/years\/(\d{4})\/months\/(\d+)/);
  if (tt) {
    const ym = `${tt[3]}-${tt[4].padStart(2, '0')}`;
    const days = Object.entries(world.frSchedule).filter(([k]) => k.startsWith(`${tt[1]}|${tt[2]}|${ym}`))
      .map(([k, times]) => ({ day: Number(k.slice(-2)), flights: times.map((t) => ({ carrierCode: 'FR', number: '1', departureTime: t })) }));
    return { body: { month: Number(tt[4]), days } };
  }
  // Wizz Air
  if (url.startsWith('https://www.wizzair.com/')) return { body: '<script>apiUrl:"https://be.wizzair.com/30.1.0/Api"</script>', headers: { 'content-type': 'text/html' } };
  if (url.endsWith('/userSession/new')) return { body: '{}' };
  if (url.includes('/Api/asset/map')) {
    const net = {};
    for (const k of Object.keys(world.w6)) {
      const [a, b] = k.split('|');
      (net[a] ||= []).push(b);
      net[b] ||= [];
    }
    return { body: { cities: Object.entries(net).map(([iata, c]) => ({ iata, countryCode: 'XX', currencyCode: 'EUR', connections: c.map((x) => ({ iata: x, isDirectFlight: true })) })) } };
  }
  if (url.includes('/search/timetableV2')) {
    const f = JSON.parse(init.body).flightList[0];
    const out = [];
    for (let d = f.from; d <= f.to; d = plus(d, 1)) {
      for (const x of world.w6[`${f.departureStation}|${f.arrivalStation}`] || []) {
        out.push({ departureStation: f.departureStation, arrivalStation: f.arrivalStation, departureDate: `${d}T00:00:00`, price: { amount: x.eur, currencyCode: 'EUR' }, priceType: 'price', departureDates: x.times.map((t, i) => ({ date: `${d}T${t}:00`, isCheapestOfTheDay: i === 0 })) });
      }
    }
    return { body: { outboundFlights: out } };
  }
  // Kiwi
  if (url === 'https://mcp.kiwi.com') {
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return { body: { jsonrpc: '2.0', id: body.id, result: {} }, headers: { 'content-type': 'application/json', 'mcp-session-id': 's1' } };
    if (body.method === 'notifications/initialized') return { status: 202, body: '' };
    const a = body.params.arguments;
    kiwiCalls.push(a);
    const r = world.kiwi(a, dmyToYmd(a.departureDate));
    if (r && r.status) return { status: r.status, body: 'error' };
    const text = JSON.stringify({ currency: 'EUR', passengers: { adults: a.adults }, itineraries: r });
    return { body: { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text }] } } };
  }
  return { status: 404, body: '{}' };
}

function reset() {
  Object.assign(world, { frDays: {}, frSchedule: {}, frExplore: () => [], w6: {}, kiwi: () => [] });
  kiwiCalls.length = 0;
  resetKiwi({ retryMs: 1 });
}
const legSig = (l) => `${l.carrier} ${l.dep.slice(11, 16)}${l.stops ? `+${l.stops}` : ''}`;

test('PRG→BCN přesně: Kiwi zvlášť i jen přímé lety, všechny přímé lety ve výsledku, další odlety Ryanairu, nejbližší dny', async () => {
  reset();
  const OUT = ymdPlus(40);
  const BACK = plus(OUT, 4);
  world.frDays = {
    'PRG|BCN': [[plus(OUT, -2), '09:00', 20], [OUT, '10:05', 40], [plus(OUT, 1), '10:05', 25]],
    'BCN|PRG': [[BACK, '19:00', 30], [plus(BACK, 2), '13:00', 18]],
  };
  world.frSchedule = { [`PRG|BCN|${OUT}`]: ['10:05', '18:45'] };
  world.kiwi = (a, d) => {
    if (a.flyFrom === 'PRG' && d === OUT) {
      return a.max_sector_stopovers === 0
        ? [itin('PRG', 'BCN', d, '10:05', 'FR', 39), itin('PRG', 'BCN', d, '11:35', 'QS', 150), itin('PRG', 'BCN', d, '10:40', 'VY', 170), itin('PRG', 'BCN', d, '16:20', 'VY', 190)]
        : [itin('PRG', 'BCN', d, '21:55', 'FR', 60, 2), itin('PRG', 'BCN', d, '06:30', 'FR', 62, 1), itin('PRG', 'BCN', d, '12:10', 'DE', 90, 2), itin('PRG', 'BCN', d, '11:35', 'QS', 150)];
    }
    if (a.flyFrom === 'BCN' && d === BACK) {
      return a.max_sector_stopovers === 0 ? [itin('BCN', 'PRG', d, '07:30', 'VY', 80), itin('BCN', 'PRG', d, '19:00', 'FR', 29)] : [itin('BCN', 'PRG', d, '19:10', 'U2', 50, 1)];
    }
    return [];
  };
  const stub = stubFetch(handler);
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:BCN'], trip: 'return', exactOut: OUT, exactBack: BACK, kmRate: 0 });
    // Kiwi: na každý směr dotaz bez omezení + jen přímé lety (max_sector_stopovers: 0)
    assert.equal(kiwiCalls.length, 4);
    assert.deepEqual(kiwiCalls.map((a) => `${a.flyFrom}>${a.flyTo}${a.max_sector_stopovers === 0 ? ' přímé' : ''}`).sort(), ['BCN>PRG', 'BCN>PRG přímé', 'PRG>BCN', 'PRG>BCN přímé']);
    const outs = new Map(r.top.map((t) => [legSig(t.out), t.out]));
    for (const s of ['FR 10:05', 'QS 11:35', 'VY 10:40', 'VY 16:20']) assert.ok(outs.has(s), `přímý let ${s} ve výpisu`);
    assert.ok(outs.has('FR 21:55+2'), 'i levnější let s přestupy');
    const fr = outs.get('FR 10:05');
    assert.equal(fr.provider, 'ryanair', 'týž let: přímo od Ryanairu (rezervace na ryanair.com)');
    assert.deepEqual(fr.otherDeps, ['18:45'], 'další odlet Ryanairu téhož dne z letového řádu');
    const backs = new Set(r.top.map((t) => legSig(t.back)));
    assert.ok(backs.has('VY 07:30') && backs.has('FR 19:00') && backs.has('U2 19:10+1'));
    assert.ok(r.top.some((t) => !t.out.stops && !t.back.stops), 'přímo tam i zpět');
    // doprava a zavazadla po letech → UI spočítá i dvojici letů, která mezi kombinacemi není
    assert.ok(r.top.every((t) => [t.out, t.back].every((l) => l.groundCzk === 0 && l.bagCzk === 0)));
    // nejbližší dny: z měsíčních dat Ryanairu (u data na konci měsíce i ze sousedního) + Kiwi v zadaný den
    assert.equal(r.nearby.out.around, OUT);
    assert.deepEqual(r.nearby.out.days.map((d) => d.date), [plus(OUT, -2), OUT, plus(OUT, 1)]);
    assert.equal(r.nearby.out.days[0].czk, 500);
    assert.equal(r.nearby.out.lowcostOnDay, true);
    assert.deepEqual(r.nearby.back.days.map((d) => d.date), [BACK, plus(BACK, 2)]);
    assert.equal(r.nearby.hint, null);
    assert.deepEqual(r.filters, { maxPrice: null, directOnly: false, active: false, hidden: { maxPrice: 0, directOnly: 0 } });
    const kiwi = r.providers.find((p) => p.id === 'kiwi');
    assert.deepEqual([kiwi.state, kiwi.outage, kiwi.retryable, kiwi.failed], ['done', null, false, 0]);
    // Ryanair: nejvýš 1 dotaz na trasu a měsíc (sousední měsíc jen u nejbližších dnů přes přelom měsíce)
    const cpd = stub.calls.filter((c) => c.url.includes('cheapestPerDay')).map((c) => { const u = new URL(c.url); return `${u.pathname}|${u.searchParams.get('outboundMonthOfDate')}`; });
    assert.equal(new Set(cpd).size, cpd.length, 'Ryanair: 1 dotaz na trasu a měsíc');
    const months = (d) => new Set([plus(d, -3), d, plus(d, 3)].map((x) => x.slice(0, 7))).size;
    assert.ok(cpd.length <= months(OUT) + months(BACK), `Ryanair: jen měsíce kolem dat (${cpd.join(', ')})`);
  } finally {
    stub.restore();
  }
});

test('přesné datum, kdy Ryanair nelétá (ale den vedle ano) → nápověda s nejbližšími dny', async () => {
  reset();
  const D = ymdPlus(45);
  world.frDays = { 'PRG|STN': [[plus(D, -1), '06:00', 15], [plus(D, 2), '17:25', 19]] };
  world.kiwi = (a, d) => (d === D && a.flyFrom === 'PRG' && a.max_sector_stopovers !== 0 ? [itin('PRG', 'STN', d, '09:00', 'LX', 120, 1)] : []);
  const stub = stubFetch(handler);
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:STN'], trip: 'oneway', exactOut: D, kmRate: 0 });
    assert.equal(r.top.length, 1, 'v zadaný den jen let s přestupem');
    assert.equal(r.nearby.back, null);
    assert.equal(r.nearby.out.lowcostOnDay, false);
    assert.deepEqual(r.nearby.out.lowcostNear, [plus(D, -1), plus(D, 2)]);
    const dm = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.`;
    assert.equal(r.nearby.hint, `V den odletu nemá Ryanair volný let – nejbližší lety: ${dm(plus(D, -1))}, ${dm(plus(D, 2))}`);
  } finally {
    stub.restore();
  }
});

test('metropole z okruhu: Kiwi se seznamy letišť (ne 3 dvojice), zvlášť jen přímé a zvlášť z domovského letiště', async () => {
  reset();
  const D = ymdPlus(50);
  world.kiwi = (a, d) => {
    const from = a.flyFrom.split(',');
    if (a.max_sector_stopovers === 0) return [itin('PRG', 'LGW', d, '17:35', 'W9', 220), itin('PRG', 'STN', d, '16:40', 'FR', 240), itin('PED', 'STN', d, '12:00', 'FR', 90)];
    return from.length > 1 ? [itin('DRS', 'STN', d, '05:40', 'SR', 80, 1)] : [itin('PRG', 'LHR', d, '19:40', 'LO', 150, 1)];
  };
  const stub = stubFetch(handler);
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 200, to: ['metro:LON'], trip: 'oneway', exactOut: D, kmRate: 0 });
    assert.equal(kiwiCalls.length, 3, 'všechna → všechna, totéž jen přímé, z domova');
    const all = kiwiCalls.filter((a) => a.flyFrom.includes(','));
    assert.equal(all.length, 2);
    assert.ok(all.every((a) => a.flyFrom.startsWith('PRG,') && a.flyFrom.split(',').length >= 3), a0(all));
    assert.ok(kiwiCalls.every((a) => ['STN', 'LTN', 'LGW', 'LHR'].every((x) => a.flyTo.split(',').includes(x))), 'všechna londýnská letiště jedním dotazem');
    assert.ok(all.some((a) => a.max_sector_stopovers === 0));
    assert.equal(kiwiCalls.filter((a) => a.flyFrom === 'PRG').length, 1, 'zvlášť z Prahy');
    const outs = new Set(r.top.map((t) => `${t.out.from}>${t.out.to} ${legSig(t.out)}`));
    for (const s of ['PRG>LGW W9 17:35', 'PRG>STN FR 16:40', 'PED>STN FR 12:00', 'DRS>STN SR 05:40+1', 'PRG>LHR LO 19:40+1']) assert.ok(outs.has(s), s);
    assert.match(r.providers.find((p) => p.id === 'kiwi').note, /letišť najednou/);
  } finally {
    stub.restore();
  }
});
const a0 = (x) => JSON.stringify(x.map((a) => a.flyFrom));

test('USA přesně z Prahy + okolí: Kiwi zvlášť z domova a z přestupních letišť + z domova na hlavní města (New York i z Prahy)', async () => {
  reset();
  const OUT = ymdPlus(60);
  const BACK = plus(OUT, 10);
  const back = { date: BACK, hhmm: '17:00' };
  world.kiwi = (a, d) => {
    if (d !== OUT) return [];
    const from = a.flyFrom.split(',');
    if (a.flyTo === 'US' && from.includes('BER')) return [itin('BER', 'EWR', d, '10:15', 'EI', 420, 1, back), itin('MUC', 'MIA', d, '06:05', 'TP', 650, 1, back)];
    if (a.flyTo === 'US') return [itin('PRG', 'JFK', d, '12:55', 'LO', 610, 1, back), itin('PRG', 'BOS', d, '20:55', 'VY', 640, 2, back)];
    if (a.flyTo === 'JFK,MIA,LAX') return [itin('PRG', 'JFK', d, '12:55', 'LO', 610, 1, back), itin('PRG', 'JFK', d, '06:50', 'LH', 680, 1, back), itin('PRG', 'JFK', d, '10:40', 'KL', 720, 1, back), itin('PRG', 'MIA', d, '07:00', 'AF', 800, 1, back)];
    return [];
  };
  const stub = stubFetch(handler);
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 200, to: ['cc:US'], trip: 'return', exactOut: OUT, exactBack: BACK, kmRate: 1.1 });
    assert.equal(kiwiCalls.length, 3, 'z domova, z přestupních letišť, z domova na hlavní města');
    const home = kiwiCalls.find((a) => a.flyTo === 'US' && !a.flyFrom.includes('BER'));
    const hubs = kiwiCalls.find((a) => a.flyTo === 'US' && a.flyFrom.includes('BER'));
    const cities = kiwiCalls.find((a) => a.flyTo === 'JFK,MIA,LAX');
    assert.ok(home.flyFrom.startsWith('PRG') && home.one_for_city === true);
    assert.deepEqual(hubs.flyFrom.split(',').sort(), ['BER', 'MUC', 'VIE']);
    assert.ok(cities.flyFrom.startsWith('PRG') && cities.one_for_city === undefined, 'víc spojení na město');
    assert.ok([home, hubs, cities].every((a) => a.returnDate && a.departureDateTo === undefined));
    const nyc = r.groups.find((g) => g.dest.key === 'NYC');
    assert.ok(nyc, 'New York');
    const froms = new Set(nyc.options.map((t) => t.out.from));
    assert.ok(froms.has('PRG') && froms.has('BER'), `New York z Prahy i z Berlína (${[...froms]})`);
    assert.ok(nyc.count >= 4, 'víc spojení do New Yorku');
    assert.match(r.providers.find((p) => p.id === 'kiwi').note, /zvlášť/);
  } finally {
    stub.restore();
  }
});

test('Brno + 200 km → Itálie přesně: Ryanair dostane kód země malými písmeny a výsledky najde', async () => {
  reset();
  const D = ymdPlus(55);
  world.frExplore = (p) => (p.arrivalCountryCode === 'it' && p.outboundDepartureDateFrom === D
    ? [frFare(p.departureAirportIataCode, 'BGY', D, '06:30', 15), frFare(p.departureAirportIataCode, 'NAP', D, '13:05', 25)] : []);
  const stub = stubFetch(handler);
  try {
    const r = await search({ from: ['ap:BRQ'], radiusKm: 200, to: ['cc:IT'], trip: 'oneway', exactOut: D, kmRate: 0 });
    const cc = stub.calls.filter((c) => c.url.includes('/farfnd/v4/oneWayFares?')).map((c) => new URL(c.url).searchParams.get('arrivalCountryCode'));
    assert.ok(cc.length >= 2 && cc.every((x) => x === 'it'));
    const fr = r.groups.flatMap((g) => g.options).filter((t) => t.provider === 'ryanair');
    assert.ok(fr.length >= 2, 'Ryanair do Itálie něco najde');
    assert.equal(r.nearby, null, 'nejbližší dny jen u konkrétního cíle');
  } finally {
    stub.restore();
  }
});

test('Wizz Air: okno ±3 dny jedním dotazem, další odlety dne i u téhož letu W6 z Kiwi', async () => {
  reset();
  const D = ymdPlus(65);
  world.w6 = { 'VIE|CRL': [{ times: ['08:00', '20:00'], eur: 20 }] };
  world.kiwi = (a, d) => (a.max_sector_stopovers === 0 && d === D ? [itin('VIE', 'CRL', d, '20:00', 'W6', 45)] : []);
  const stub = stubFetch(handler);
  try {
    const r = await search({ from: ['ap:VIE'], radiusKm: 0, to: ['ap:CRL'], trip: 'oneway', exactOut: D, kmRate: 0 });
    const posts = stub.calls.filter((c) => c.url.includes('timetableV2')).map((c) => JSON.parse(c.init.body).flightList[0]);
    assert.equal(posts.length, 1);
    assert.deepEqual([posts[0].from, posts[0].to], [plus(D, -3), plus(D, 3)]);
    assert.equal(r.top.length, 2, 'jen zadaný den: Wizz 08:00 a Kiwi W6 20:00');
    const w = r.top.find((t) => t.provider === 'wizzair').out;
    const k = r.top.find((t) => t.provider === 'kiwi').out;
    assert.deepEqual(w.otherDeps, ['20:00']);
    assert.deepEqual(k.otherDeps, ['08:00'], 'z dat Wizz Air i u letu nalezeného přes Kiwi');
    assert.equal(r.nearby.out.days.length, 7, '±3 dny z Wizz Air');
    assert.equal(r.calendar.out.length, 1, 'kalendář jen v okně hledání');
  } finally {
    stub.restore();
  }
});

test('aktivní filtry: max. cena a jen přímé – vrátí se i počet skrytých nabídek; jen přímé = jediný dotaz Kiwi na směr', async () => {
  reset();
  const D = ymdPlus(70);
  world.frDays = { 'PRG|BCN': [[D, '10:05', 40]] };
  world.kiwi = (a, d) => [itin('PRG', 'BCN', d, '11:35', 'QS', 150), ...(a.max_sector_stopovers === 0 ? [] : [itin('PRG', 'BCN', d, '06:30', 'LH', 60, 1)])];
  const stub = stubFetch(handler);
  try {
    const r = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:BCN'], trip: 'oneway', exactOut: D, kmRate: 0, maxPrice: 2000 });
    assert.deepEqual(r.filters, { maxPrice: 2000, directOnly: false, active: true, hidden: { maxPrice: 1, directOnly: 0 } });
    assert.ok(r.top.every((t) => t.perPersonCzk <= 2000));
    kiwiCalls.length = 0;
    const d = await search({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:BCN'], trip: 'oneway', exactOut: plus(D, 1), kmRate: 0, directOnly: true });
    assert.equal(kiwiCalls.length, 1);
    assert.equal(kiwiCalls[0].max_sector_stopovers, 0);
    assert.equal(d.filters.directOnly, true);
    assert.equal(d.filters.active, true);
    assert.ok(d.top.every((t) => !t.out.stops));
  } finally {
    stub.restore();
  }
});

test('výpadek Kiwi (503): opakuje se, v průběhu hledání outage + retryable; pojistka až po výpadku ve 2 hledáních', async () => {
  reset();
  world.kiwi = () => ({ status: 503 });
  const stub = stubFetch(handler);
  try {
    const q = (n) => ({ from: ['ap:PRG'], radiusKm: 0, to: ['ap:OPO'], trip: 'oneway', exactOut: ymdPlus(80 + n), kmRate: 0 });
    const events = [];
    const r1 = await search(q(0), (e) => events.push(JSON.parse(JSON.stringify(e))));
    const k1 = r1.providers.find((p) => p.id === 'kiwi');
    assert.equal(k1.state, 'error');
    assert.equal(k1.outage, 'down');
    assert.equal(k1.retryable, true);
    assert.equal(k1.failed, 2);
    // opakuje se, ale po 3 neúspěšných pokusech za sebou v hledání už ne (dřív 2 dotazy × 3 pokusy = 6)
    assert.ok(k1.retried >= 1 && k1.retried <= 2, `opakování ${k1.retried}`);
    assert.ok(kiwiCalls.length <= 4, `${kiwiCalls.length} dotazů na Kiwi`);
    assert.equal(events.at(-1).providers.find((p) => p.id === 'kiwi').outage, 'down', 'i v posledním průběhu (pro UI)');
    assert.equal(kiwiBlocked(), false, 'série 503 v jednom hledání nevypne Kiwi ostatním');
    await search(q(1));
    assert.equal(kiwiBlocked(), true, 'výpadek i v dalším hledání → pojistka');
    const before = kiwiCalls.length;
    const r3 = await search(q(2));
    const k3 = r3.providers.find((p) => p.id === 'kiwi');
    assert.equal(k3.outage, 'blocked');
    assert.ok(k3.retryAfter > 0 && k3.retryAfter <= 60);
    assert.equal(kiwiCalls.length, before, 'během pojistky se na Kiwi neptá');
  } finally {
    stub.restore();
  }
});

test('nejbližší dny: cena vč. dopravy na domácí letiště i u návratu (příletové letiště)', () => {
  const ground = { PRG: 60, VIE: 300 };
  const groundOf = (iata) => ground[iata] ?? 0;
  const l = (from, to, date, czk, stops = 0) => ({ from, to, date, czk, stops, provider: 'kiwi', carrier: 'FR', carrierName: 'Ryanair' });
  const range = { from: '2026-11-13', to: '2026-11-19' };
  const legs = [l('BCN', 'PRG', '2026-11-16', 1000), l('BCN', 'VIE', '2026-11-16', 800), l('BCN', 'PRG', '2026-11-17', 900, 1)];
  const back = nearbyDays(legs, range, range, { groundOf, directOnly: true });
  assert.deepEqual(back.days.map((d) => [d.date, d.to, d.czk, d.cost]), [['2026-11-16', 'PRG', 1000, 1060]],
    'návrat do Vídně (800 + 300) vyjde dráž; let s přestupem při „jen přímé“ ne');
  assert.equal(nearbyDays([l('PRG', 'BCN', '2026-11-16', 1000)], range, range, { groundOf }).days[0].cost, 1060);
});

test('nejbližší dny autem tam i zpět: parkování na celou cestu u Tam, u Zpět jen jeho změna – Tam + Zpět = cena cesty', () => {
  const l = (from, to, date, czk) => ({ from, to, date, czk, stops: 0, provider: 'kiwi', carrier: 'FR', carrierName: 'Ryanair' });
  // odlet 12. 11., návrat 14. 11. (2 noci); parkování za auto online předem základ + za den, 1 cestující
  const q = { exact: { out: '2026-11-12', back: '2026-11-14', backFrom: '2026-11-14', backTo: '2026-11-14' }, dateFrom: '2026-11-12', dateTo: '2026-11-12', directOnly: false };
  const rate = { PRG: [590, 120], VIE: [850, 150] };
  const park = (iata, nights) => rate[iata][0] + rate[iata][1] * (nights + 1);
  const groundOf = (iata) => ({ PRG: 25, VIE: 500 })[iata] ?? 0;
  const near = { q, nearOut: { from: '2026-11-09', to: '2026-11-15' }, nearBack: { from: '2026-11-11', to: '2026-11-17' }, groundOf };
  const out = [l('PRG', 'BCN', '2026-11-11', 1000), l('PRG', 'BCN', '2026-11-12', 1000), l('VIE', 'BCN', '2026-11-12', 700), l('PRG', 'BCN', '2026-11-15', 900)];
  const back = [l('BCN', 'PRG', '2026-11-14', 1000), l('BCN', 'PRG', '2026-11-16', 950)];
  const r = nearbyOf({ ...near, out, back, park });
  const day = (side, d) => side.days.find((x) => x.date === d);
  const cost = (side, d) => day(side, d)?.cost;
  // cesta autem přes PRG: lety + palivo (25) každým směrem + parkování na celou cestu jen jednou
  const trip = (o, b) => 1000 + 25 + ({ '2026-11-14': 1000, '2026-11-16': 950 })[b] + 25 + park('PRG', (Date.parse(b) - Date.parse(o)) / 864e5);
  // zadané dny: Tam = let + palivo + parkování na celou cestu (2 noci = 3 dny), Zpět = let + palivo – parkování jen jednou
  assert.deepEqual([cost(r.out, '2026-11-12'), day(r.out, '2026-11-12').parkCzk, day(r.out, '2026-11-12').parkDays], [1000 + 25 + 950, 950, 3]);
  assert.deepEqual([cost(r.back, '2026-11-14'), day(r.back, '2026-11-14').parkCzk], [1000 + 25, undefined]);
  assert.equal(cost(r.out, '2026-11-12') + cost(r.back, '2026-11-14'), trip('2026-11-12', '2026-11-14'));
  // o den dřív tam = o den parkování víc; zpět o dva dny později = jen změna parkování (+2 dny) u Zpět
  assert.deepEqual([cost(r.out, '2026-11-11'), day(r.out, '2026-11-11').parkDays], [1025 + 590 + 120 * 4, 4]);
  assert.deepEqual([cost(r.back, '2026-11-16'), day(r.back, '2026-11-16').parkCzk, day(r.back, '2026-11-16').parkDays], [950 + 25 + 240, 240, 5]);
  // Tam + Zpět = cena celé cesty pro každou dvojici dnů (parkování je přímka základ + Kč/den)
  for (const o of ['2026-11-11', '2026-11-12']) {
    for (const b of ['2026-11-14', '2026-11-16']) assert.equal(cost(r.out, o) + cost(r.back, b), trip(o, b), `${o} → ${b}`);
  }
  // levnější let z Vídně: auto by stálo ve Vídni, kam se v den návratu nevrací žádný let → s ním cesta autem nejde
  assert.equal(day(r.out, '2026-11-12').from, 'PRG');
  // den tam po zadaném návratu: návrat se posune se stejným počtem nocí (jako po kliknutí na den)
  assert.equal(day(r.out, '2026-11-15').parkDays, 3);
  // jiné letiště: návrat do Vídně 14. 11. a levný odlet z Vídně 13. 11. → den tam 13. 11. přes Vídeň i s rozdílem
  // návratu k autu (do Vídně místo do Prahy), den zpět přes Vídeň s rozdílem odletu (z Vídně místo z Prahy)
  const out2 = [...out, l('VIE', 'BCN', '2026-11-13', 100)];
  const back2 = [...back, l('BCN', 'VIE', '2026-11-14', 600)];
  const r2 = nearbyOf({ ...near, out: out2, back: back2, park });
  const v = day(r2.out, '2026-11-13');
  assert.deepEqual([v.from, v.cost, v.parkCzk, v.tripAdj], ['VIE', 100 + 500 + park('VIE', 1) + (600 + 500 - 1025), park('VIE', 1), 600 + 500 - 1025]);
  assert.equal(v.cost + cost(r2.back, '2026-11-14'), 600 + 1100 + park('VIE', 1), 'cesta 13. → 14. 11. přes Vídeň');
  assert.equal(cost(r2.back, '2026-11-14'), 1025, 'návrat do Prahy (tam stojí auto nejlevnější cesty) zůstává');
  // veřejnou dopravou (bez parkování) beze změny: jen let a doprava na letiště
  const t = nearbyOf({ ...near, out, back });
  assert.deepEqual([day(t.out, '2026-11-12').from, day(t.out, '2026-11-12').cost, day(t.out, '2026-11-12').parkCzk], ['PRG', 1025, undefined]);
  assert.equal(cost(t.out, '2026-11-15'), 925);
  assert.equal(cost(t.back, '2026-11-16'), 975);
  // jen tam (bez návratu) se neparkuje
  const ow = nearbyOf({ ...near, q: { ...q, exact: { out: '2026-11-12', back: null } }, nearBack: null, out, back: [], park });
  assert.equal(day(ow.out, '2026-11-12').parkCzk, undefined);
});

test('nápověda nejbližších dnů: aerolinky zvlášť pro odlet a návrat, „nemá volný let“ (i vyprodáno)', () => {
  const l = (provider, carrierName, from, to, date) => ({ provider, carrierName, from, to, date, czk: 1000, stops: 0 });
  const q = { exact: { out: '2026-11-12', back: '2026-11-16', backFrom: '2026-11-16', backTo: '2026-11-16' }, dateFrom: '2026-11-12', dateTo: '2026-11-12', directOnly: false };
  const near = { nearOut: { from: '2026-11-09', to: '2026-11-15' }, nearBack: { from: '2026-11-13', to: '2026-11-19' }, groundOf: () => 0, q };
  const r = nearbyOf({ ...near, out: [l('ryanair', 'Ryanair', 'PRG', 'BCN', '2026-11-11')],
    back: [l('wizzair', 'Wizz Air', 'BCN', 'PRG', '2026-11-17'), l('ryanair', 'Ryanair', 'BCN', 'PRG', '2026-11-16')] });
  assert.equal(r.hint, 'V den odletu nemá Ryanair volný let – nejbližší lety: 11. 11.', 'Wizz Air (jen návrat) se k odletu nepíše');
  const both = nearbyOf({ ...near, out: [l('ryanair', 'Ryanair', 'PRG', 'BCN', '2026-11-11')], back: [l('wizzair', 'Wizz Air', 'BCN', 'PRG', '2026-11-17')] });
  assert.equal(both.hint, 'V den odletu nemá Ryanair volný let – nejbližší lety: 11. 11. · V den návratu nemá Wizz Air volný let – nejbližší lety: 17. 11.');
});

test('flexibilní termín ke konkrétnímu cíli: Kiwi seznamem všech letišť z okolí (ne jen BRQ → LHR), bez Ryanairu a Wizz Air', async () => {
  reset();
  const D = ymdPlus(20);
  world.kiwi = (a, d) => (a.flyFrom.includes('VIE') && a.flyTo.includes('LGW') && d <= D && plus(d, 6) >= D ? [itin('VIE', 'LGW', D, '07:10', 'U2', 45)] : []);
  const stub = stubFetch(handler);
  try {
    const r = await search({ from: ['ap:BRQ'], radiusKm: 200, to: ['metro:LON'], trip: 'oneway', dateFrom: ymdPlus(14), dateTo: ymdPlus(34), kmRate: 0 });
    assert.ok(kiwiCalls.length >= 3 && kiwiCalls.length <= 4, `týdenní okna jedním seznamem (${kiwiCalls.length})`);
    for (const a of kiwiCalls) {
      const froms = a.flyFrom.split(','), tos = a.flyTo.split(',');
      assert.ok(froms.includes('BRQ') && froms.includes('VIE') && froms.length > 3, `odkud: ${a.flyFrom}`);
      assert.deepEqual(tos.slice().sort(), ['LCY', 'LGW', 'LHR', 'LTN', 'SEN', 'STN'], `kam: ${a.flyTo}`);
      assert.equal(a.exclude_airlines, 'FR,RK,AL,W6,W4,W9,5W', 'Ryanair a Wizz Air z vlastních zdrojů');
    }
    const kiwi = r.providers.find((p) => p.id === 'kiwi');
    assert.match(kiwi.note, /letišť najednou \(bez Ryanairu a Wizz Air/);
    assert.ok(r.top.some((t) => t.out.from === 'VIE' && t.out.to === 'LGW' && t.out.carrier === 'U2'), 'easyJet z Vídně ve výsledcích');
  } finally {
    stub.restore();
  }
});
