// Odkazy na partnery ubytování s jejich vlastním ID místa (Trip.com, Agoda, Hostelworld): dotazy jen přes
// stubFetch, testy nikdy nejdou na síť. Tvary odpovědí jsou zkrácené skutečné odpovědi z 10/2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';
import { config } from '../server/config.js';
import { cache } from '../server/lib/cache.js';
import { searchStays } from '../server/lib/stays.js';
import { stayPartnerKeys } from '../server/lib/links.js';
import { tripCityId, agodaCityId, hostelworldCity, partnerLookups } from '../server/lib/partnerids.js';

const TRIP_API = 'https://www.trip.com/restapi/soa2/34951/getHotelKeywords';
// Položka našeptávače Trip.com: město „CT“, čtvrť „N“, hotel „H“, nádraží „T“; poloha v NORMAL (ostatní bývají -1).
const kw = (id, name, tripType, lat, lon, sub) => ({
  keyword: {
    keywordContentInfo: {
      keywordId: id, keywordCode: String(id), keyword: name, tripType, displayTexts: [{ key: 'SUB_TITLE', value: sub }],
      coordinateItemList: [{ coordinateType: 'GOOGLE', latitude: '-1', longitude: '-1' }, { coordinateType: 'NORMAL', latitude: String(lat), longitude: String(lon) }],
    },
  },
});
const tripBody = (...items) => ({ data: { mainKeywordList: { keywords: items } }, ResponseStatus: { Ack: 'Success' } });
const tripKeyword = (init) => JSON.parse(init.body).queryInfo.keyword;
const page = (s) => ({ body: `<!doctype html><html><head><title>x</title></head><body>${s}</body></html>`, headers: { 'content-type': 'text/html; charset=utf-8' } });
// Agoda: nastavení vyhledávacího pole stránky města (v HTML je „&“ zapsané jako \u0026, „cityId“ je 0).
const agodaPage = (id) => page(`<script>window.__x={"searchbox":{"maxRooms":9,"defaultSearchURL":"/search?city=${id}\\u0026checkIn=2026-10-16\\u0026los=1\\u0026rooms=1\\u0026adults=2\\u0026children=0","failSafeUrl":"/api/cronos/search/redirect","cityId":0}}</script>`);
// Hostelworld: odkaz „zobrazit na mapě“ na stránce města vede na hledání webu s ID města.
const hwPage = (id, city, country) => page(`<a class="map" href="https://www.hostelworld.com/pwa/s?q=${city}%2C+${country}&amp;country=${country}&amp;city=${city}&amp;type=city&amp;id=${id}&amp;page=1&amp;display=map">Mapa</a>`);
// Kolik zbývá do vypršení položky v mezipaměti (30 dní u nalezeného i nenalezeného, hodina u chyby).
const ttlLeft = (key) => cache.map.get(key).exp - Date.now();
const DAY = 864e5;
const HOUR = 3600e3;
const link = (r, id) => r.links.find((l) => l.id === id);
// Čeká, až request() spojení přeruší (timeout) – jako partner, který neodpovídá.
const hang = (init) => new Promise((resolve, reject) => {
  init.signal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })));
});

/** Hledání ubytování jen s odkazy (bez LiteAPI), partners = dohledání ID u partnerů. */
async function stays(raw, partners) {
  const prev = config.liteapiKey;
  config.liteapiKey = '';
  try {
    return await searchStays({ checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2, ...raw }, { partners });
  } finally {
    config.liteapiKey = prev;
  }
}

test('stayPartnerKeys: pod čím partneři místo znají (název bez diakritiky, pomlčka jako mezera, Agoda název-země)', () => {
  assert.deepEqual(stayPartnerKeys({ city: 'Kutná Hora', cityEn: 'Kutná Hora', cc: 'CZ' }), {
    trip: 'Kutna Hora', agoda: 'kutna-hora-cz', hostelworld: 'https://www.hostelworld.com/hostels/europe/czechia/kutna-hora/',
  });
  assert.deepEqual(stayPartnerKeys({ city: 'Porto Novo', cityEn: 'Porto-Novo', cc: 'BJ' }), {
    trip: 'Porto Novo', agoda: 'porto-novo-bj', hostelworld: 'https://www.hostelworld.com/hostels/africa/benin/porto-novo/',
  });
  assert.equal(stayPartnerKeys({ city: 'Praha', cityEn: 'Prague', cc: 'CZ' }).agoda, 'prague-cz', 'anglický název (praha-cz Agoda nemá)');
  assert.equal(stayPartnerKeys({ city: 'Springfield', cityEn: 'Springfield, Illinois', cc: 'US' }).trip, 'Springfield');
  assert.deepEqual(stayPartnerKeys({ city: 'Nikde', cc: '' }), { trip: 'Nikde', agoda: null, hostelworld: null });
});

test('Trip.com: ID města z našeptávače webu → odkaz rovnou s nabídkami na termín (bez „potvrď Hledat“); název jen jednou (mezipaměť)', async () => {
  const stub = stubFetch((url, init) => {
    assert.equal(url, TRIP_API);
    return {
      body: tripBody(
        kw(38742, 'Kutna Hora', 'CT', 49.9524314, 15.2686536, 'Central Bohemia, Czech Republic'),
        kw(11047070, 'Palace Kutná Hora', 'H', 49.949358, 15.26673, 'Kutna Hora, Central Bohemia, Czech Republic'),
        kw(9545748, 'Kutná Hora Město Railway Station', 'T', 49.949951, 15.277091, 'Kutna Hora, Central Bohemia, Czech Republic'),
      ),
    };
  });
  try {
    const q = { city: 'Kutná Hora', cityEn: 'Kutná Hora', cc: 'CZ', lat: 49.948, lon: 15.268, adults: 3, rooms: 2 };
    const r = await stays(q, { trip: tripCityId });
    assert.equal(stub.calls.length, 1);
    const { init } = stub.calls[0];
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), {
      queryInfo: { keyword: 'Kutna Hora', actionType: 'destination' },
      head: { platform: 'PC', bu: 'IBU', group: 'trip', locale: 'en-XX', currency: 'USD' },
    }, 'anglický název bez diakritiky, hlavička se všemi poli (jen s locale HTTP 500)');
    const t = link(r, 'trip');
    assert.equal(t.url, `https://www.trip.com/hotels/list?cityId=38742&checkin=${ymdPlus(30)}&checkout=${ymdPlus(33)}&crn=2&adult=3&children=0&curr=CZK&locale=cs-CZ`);
    assert.deepEqual([t.prefill, t.note], ['full', 'silný v Asii']);
    // bez dotazu na Agodu a Hostelworld zůstanou jejich odkazy jako dosud
    assert.deepEqual([link(r, 'agoda').url, link(r, 'hostelworld').url], ['https://www.agoda.com/cs-cz/', 'https://www.hostelworld.com/hostels/europe/czechia/kutna-hora/']);
    assert.ok(ttlLeft('trip-city:kutna hora') > 29 * DAY, 'nalezené ID platí 30 dní');
    const again = await stays({ ...q, checkout: ymdPlus(34) }, { trip: tripCityId });
    assert.equal(stub.calls.length, 1, 'druhé hledání z mezipaměti');
    assert.match(link(again, 'trip').url, /cityId=38742&checkin=[\d-]+&checkout=[\d-]+&crn=2/);
  } finally {
    stub.restore();
  }
});

test('Trip.com: víc měst stejného jména → nejbližší k místu, nejvýš 50 km (jinak odkaz jako dosud); „Porto-Novo“ se hledá jako „Porto Novo“', async () => {
  const stub = stubFetch((url, init) => {
    const k = tripKeyword(init);
    if (k === 'Valencia') {
      return {
        body: tripBody(
          kw(1351, 'Valencia', 'CT', 39.4699075, -0.3762881, 'Horta of Valencia, Valencian Community, Spain'),
          kw(1351, 'Stays in Valencia', 'N', 39.4699075, -0.3762881, 'Valencia, Spain'),
          kw(531701, 'Valencia Province', 'CT', 39.4840108, -0.7532809, 'Valencian Community, Spain'),
          kw(6249, 'Valencia', 'CT', 10.1579312, -67.9972104, 'Municipio Autonomo Valencia, Carabobo, Venezuela'),
        ),
      };
    }
    // s pomlčkou Trip.com najde jen Porto Novo na Kapverdách, s mezerou i město v Beninu
    if (k === 'Porto Novo') return { body: tripBody(kw(395479, 'Porto Novo', 'CT', 17.0215176, -25.0673575, 'Cape Verde'), kw(648595, 'Porto Novo', 'CT', 6.4968574, 2.6288523, 'Oueme, Benin')) };
    if (k === 'Ouidah') return { body: tripBody(kw(777001, 'Ouidah', 'CT', 17.02, -25.06, 'Cape Verde')) };
    return { status: 404, body: '{}' };
  });
  try {
    assert.equal(await tripCityId('Valencia', { lat: 39.47, lon: -0.377 }), 1351, 'město, ne provincie 32 km daleko');
    assert.equal(await tripCityId('Valencia', { lat: 10.162, lon: -68.0 }), 6249, 'Valencia ve Venezuele');
    assert.equal(await tripCityId('Valencia', { lat: 40.4168, lon: -3.7038 }), false, 'z Madridu je každá Valencia dál než 50 km');
    assert.equal(stub.calls.length, 1, 'kandidáti podle názvu z mezipaměti, výběr podle polohy pokaždé');

    const pn = await stays({ city: 'Porto Novo', cityEn: 'Porto-Novo', cc: 'BJ', lat: 6.4969, lon: 2.6289 }, { trip: tripCityId });
    assert.equal(tripKeyword(stub.calls.at(-1).init), 'Porto Novo');
    assert.match(link(pn, 'trip').url, /^https:\/\/www\.trip\.com\/hotels\/list\?cityId=648595&/, 'Benin, ne Kapverdy');

    // jediné město toho jména je jinde → odkaz s názvem a „potvrď Hledat“ jako dosud
    const ou = await stays({ city: 'Ouidah', cityEn: 'Ouidah', cc: 'BJ', lat: 6.3631, lon: 2.0851 }, { trip: tripCityId });
    const t = link(ou, 'trip');
    assert.equal(new URL(t.url).searchParams.get('searchWord'), 'Ouidah, Benin');
    assert.ok(!t.url.includes('cityId'));
    assert.deepEqual([t.prefill, t.note], ['full', 'silný v Asii – potvrď Hledat']);
  } finally {
    stub.restore();
  }
});

test('Trip.com: nic nenalezeno, chyba, timeout nebo nečekaná odpověď → odkaz jako dosud; prázdný výsledek v mezipaměti 30 dní, chyba jen hodinu', async () => {
  const ref = { lat: 50, lon: 15 };
  const stub = stubFetch((url, init) => {
    const k = tripKeyword(init);
    if (k === 'Nowhere') return { body: tripBody() };
    if (k === 'Brokenville') return { status: 500, body: '{"ResponseStatus":{"Ack":"Failure"}}' };
    if (k === 'Slowtown') return hang(init);
    return { body: { data: {} } }; // Oddtown: jiný tvar odpovědi (web se změnil)
  });
  try {
    assert.equal(await tripCityId('Nowhere', ref), false);
    assert.ok(ttlLeft('trip-city:nowhere') > 29 * DAY);
    assert.equal(await tripCityId('Brokenville', ref), null);
    assert.ok(ttlLeft('trip-city:brokenville') <= HOUR && ttlLeft('trip-city:brokenville') > HOUR - 60e3, 'chyba jen na hodinu');
    const t0 = Date.now();
    assert.equal(await tripCityId('Slowtown', ref, { timeoutMs: 40 }), null, 'timeout');
    assert.ok(Date.now() - t0 < 2000);
    assert.ok(ttlLeft('trip-city:slowtown') <= HOUR);
    assert.equal(await tripCityId('Oddtown', ref), null);
    assert.ok(ttlLeft('trip-city:oddtown') <= HOUR);
    assert.equal(stub.calls.length, 4);
    assert.ok(stub.calls.every((c) => c.init.method === 'POST'), 'bez opakování: na každý název jeden dotaz');
    for (const k of ['Nowhere', 'Brokenville', 'Slowtown', 'Oddtown']) await tripCityId(k, ref);
    assert.equal(stub.calls.length, 4, 'podruhé z mezipaměti');
    // bez polohy místa se nehádá (nedá se ověřit, že je to totéž místo)
    assert.equal(await tripCityId('Brno', null), null);
    assert.equal(stub.calls.length, 4);
    // hledání ubytování: chyba i výjimka dotazu nic neshodí, odkaz zůstane s názvem
    const r = await stays({ city: 'Brokenville', cityEn: 'Brokenville', cc: 'CZ', lat: 50, lon: 15 }, { trip: tripCityId });
    assert.deepEqual([link(r, 'trip').note, link(r, 'trip').prefill], ['silný v Asii – potvrď Hledat', 'full']);
    const boom = await stays({ city: 'Brno', cityEn: 'Brno', cc: 'CZ', lat: 49.195, lon: 16.607 }, { trip: () => { throw new Error('nečekaná chyba'); }, agoda: async () => { throw new Error('x'); } });
    assert.match(link(boom, 'trip').url, /searchWord=Brno/);
    assert.equal(link(boom, 'agoda').url, 'https://www.agoda.com/cs-cz/');
  } finally {
    stub.restore();
  }
});

test('Agoda: ID města ze stránky města → hledání s termínem a hosty; stránka není (404) nebo bez ID → úvodní stránka jako dosud', async () => {
  const stub = stubFetch((url, init) => {
    if (url === 'https://www.agoda.com/city/cotonou-bj.html') return agodaPage(20636);
    // neznámé město: přesměrování na /pagenotfound.html, která vrací 404 (fetch přesměrování projde)
    if (url === 'https://www.agoda.com/city/porto-novo-bj.html') return { status: 404, body: '<html>Page not found</html>', headers: { 'content-type': 'text/html' } };
    if (url === 'https://www.agoda.com/city/ouidah-bj.html') return page('<p>Checking your browser…</p>'); // bez ID
    if (url === 'https://www.agoda.com/city/natitingou-bj.html') return hang(init);
    return { status: 503, body: 'busy', headers: { 'content-type': 'text/plain' } };
  });
  try {
    const r = await stays({ city: 'Cotonou', cityEn: 'Cotonou', cc: 'BJ', lat: 6.3654, lon: 2.4183 }, { agoda: agodaCityId });
    assert.equal(stub.calls.length, 1);
    assert.deepEqual([stub.calls[0].init.method, stub.calls[0].init.redirect], ['GET', 'follow']);
    const a = link(r, 'agoda');
    assert.equal(a.url, `https://www.agoda.com/search?city=20636&checkIn=${ymdPlus(30)}&checkOut=${ymdPlus(33)}&los=3&rooms=1&adults=2&children=0`);
    assert.deepEqual([a.prefill, a.note], ['full', 'silná v Asii']);
    assert.ok(ttlLeft('agoda-city:cotonou-bj') > 29 * DAY);

    const pn = await stays({ city: 'Porto Novo', cityEn: 'Porto-Novo', cc: 'BJ', lat: 6.4969, lon: 2.6289 }, { agoda: agodaCityId });
    assert.deepEqual([link(pn, 'agoda').url, link(pn, 'agoda').prefill, link(pn, 'agoda').note], ['https://www.agoda.com/cs-cz/', 'none', 'silná v Asii – zadej místo a data']);
    assert.ok(ttlLeft('agoda-city:porto-novo-bj') > 29 * DAY, 'stránka města není → 30 dní');

    assert.equal(await agodaCityId('ouidah-bj'), null, 'stránka bez ID (ochrana proti robotům, jiný tvar) → nevíme');
    assert.ok(ttlLeft('agoda-city:ouidah-bj') <= HOUR);
    assert.equal(await agodaCityId('abomey-bj'), null, 'chyba 503');
    assert.ok(ttlLeft('agoda-city:abomey-bj') <= HOUR);
    const t0 = Date.now();
    assert.equal(await agodaCityId('natitingou-bj', { timeoutMs: 40 }), null, 'timeout');
    assert.ok(Date.now() - t0 < 2000);
    assert.ok(ttlLeft('agoda-city:natitingou-bj') <= HOUR);
    assert.equal(stub.calls.length, 5);
    for (const s of ['cotonou-bj', 'porto-novo-bj', 'ouidah-bj', 'abomey-bj', 'natitingou-bj']) await agodaCityId(s);
    assert.equal(stub.calls.length, 5, 'podruhé z mezipaměti');
    assert.equal(await agodaCityId('praha'), null, 'bez kódu země se neptá');
    assert.equal(stub.calls.length, 5);
  } finally {
    stub.restore();
  }
});

test('Hostelworld: jedno GET na stránku města – s ID hledání s termínem a hosty, bez ID stránka města, 404 stránka země, chyba nechá město', async () => {
  const stub = stubFetch((url, init) => {
    if (url.endsWith('/africa/benin/cotonou/')) return hwPage(5504, 'Cotonou', 'Benin');
    if (url.endsWith('/europe/czechia/mikulov/')) return page('<h1>Hostels in Mikulov</h1>'); // stránka bez odkazu s ID
    if (url.endsWith('/europe/italy/sabbioneta/')) return { status: 404, body: '<h1>404</h1>', headers: { 'content-type': 'text/html' } };
    if (url.endsWith('/europe/italy/cremona/')) return hang(init);
    return { status: 503, body: '', headers: { 'content-type': 'text/html' } };
  });
  const hw = (r) => link(r, 'hostelworld');
  try {
    const co = await stays({ city: 'Cotonou', cityEn: 'Cotonou', cc: 'BJ', lat: 6.3654, lon: 2.4183 }, { hostelworld: hostelworldCity });
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, 'https://www.hostelworld.com/hostels/africa/benin/cotonou/');
    assert.equal(stub.calls[0].init.method, 'GET', 'jedno GET místo dřívějšího HEAD');
    assert.equal(hw(co).url, `https://www.hostelworld.com/pwa/s?type=city&id=5504&from=${ymdPlus(30)}&to=${ymdPlus(33)}&guests=2`);
    assert.deepEqual([hw(co).prefill, hw(co).note], ['full', 'hostely a levná lůžka']);

    const mi = await stays({ city: 'Mikulov', cityEn: 'Mikulov', cc: 'CZ', lat: 48.8056, lon: 16.6378 }, { hostelworld: hostelworldCity });
    assert.deepEqual([hw(mi).url, hw(mi).prefill, hw(mi).note], ['https://www.hostelworld.com/hostels/europe/czechia/mikulov/', 'city', 'hostely a levná lůžka – zadej data']);
    assert.ok(ttlLeft('hw-city:https://www.hostelworld.com/hostels/europe/czechia/mikulov/') > 29 * DAY, 'stránka bez ID je stálý stav → 30 dní');

    const base = { city: 'Sabbioneta', cityEn: 'Sabbioneta', cc: 'IT', lat: 44.999, lon: 10.489 };
    const sa = await stays(base, { hostelworld: hostelworldCity });
    assert.deepEqual([hw(sa).url, hw(sa).prefill], ['https://www.hostelworld.com/hostels/europe/italy/', 'none']);
    assert.match(hw(sa).note, /vyber místo a data/);
    assert.ok(ttlLeft('hw-city:https://www.hostelworld.com/hostels/europe/italy/sabbioneta/') > 29 * DAY, '404 → 30 dní');
    await stays({ ...base, checkout: ymdPlus(35) }, { hostelworld: hostelworldCity });
    assert.equal(stub.calls.filter((c) => c.url.includes('/sabbioneta/')).length, 1, 'druhé hledání z mezipaměti');

    const down = await stays({ ...base, city: 'Mantova', cityEn: 'Mantua', lat: 45.156, lon: 10.791 }, { hostelworld: hostelworldCity });
    assert.deepEqual([hw(down).url, hw(down).prefill], ['https://www.hostelworld.com/hostels/europe/italy/mantua/', 'city'], 'chyba (ne 404) → stránka města zůstane');
    assert.ok(ttlLeft('hw-city:https://www.hostelworld.com/hostels/europe/italy/mantua/') <= HOUR, 'chyba jen na hodinu');
    const t0 = Date.now();
    assert.equal(await hostelworldCity('https://www.hostelworld.com/hostels/europe/italy/cremona/', { timeoutMs: 40 }), null, 'timeout');
    assert.ok(Date.now() - t0 < 2000);
    // bez dotazů (výchozí – DEMO, testy) se Hostelworldu nic neptá
    const n = stub.calls.length;
    const pv = await stays({ ...base, city: 'Pavia', cityEn: 'Pavia', checkout: ymdPlus(36) });
    assert.equal(stub.calls.length, n);
    assert.equal(hw(pv).url, 'https://www.hostelworld.com/hostels/europe/italy/pavia/');
    // neznámá země → úvodní stránka, nic se neověřuje
    assert.equal(await hostelworldCity('https://www.hostelworld.com/'), null);
    assert.equal(stub.calls.length, n);
  } finally {
    stub.restore();
  }
});

test('searchStays: dotazy na všechny tři partnery naráz (čeká se jen na nejpomalejší), poloha pro Trip.com i z letiště; selhání jednoho nevadí', async () => {
  const started = [];
  let open;
  const gate = new Promise((r) => { open = r; });
  const look = {
    trip: async (k, ref) => { started.push(['trip', k, ref]); await gate; return 3251; },
    agoda: async (k) => { started.push(['agoda', k]); await gate; throw new Error('Agoda nedostupná'); },
    hostelworld: async (k) => { started.push(['hostelworld', k]); await gate; return 5504; },
  };
  const pending = stays({ city: 'Cotonou', cityEn: 'Cotonou', cc: 'BJ', iata: 'COO' }, look);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started.map((s) => s.slice(0, 2)), [['trip', 'Cotonou'], ['agoda', 'cotonou-bj'], ['hostelworld', 'https://www.hostelworld.com/hostels/africa/benin/cotonou/']]);
  const ref = started[0][2];
  assert.ok(Math.abs(ref.lat - 6.36) < 0.1 && Math.abs(ref.lon - 2.39) < 0.1, `bez polohy místa poloha letiště COO: ${JSON.stringify(ref)}`);
  open();
  const r = await pending;
  assert.match(link(r, 'trip').url, /cityId=3251/);
  assert.equal(link(r, 'agoda').url, 'https://www.agoda.com/cs-cz/');
  assert.match(link(r, 'hostelworld').url, /\/pwa\/s\?type=city&id=5504&/);
  assert.deepEqual(r.links.filter((l) => l.prefill !== 'full').map((l) => l.id), ['agoda']);
});

test('partnerLookups: DEMO a PARTNER_LOOKUP=0 → žádné dotazy na partnery, odkazy jako dosud', async () => {
  const prev = { mock: config.mock, env: process.env.PARTNER_LOOKUP };
  const stub = stubFetch(() => { throw new Error('v DEMO se na síť nesmí'); });
  try {
    config.mock = false;
    delete process.env.PARTNER_LOOKUP;
    assert.deepEqual(partnerLookups(), { trip: tripCityId, agoda: agodaCityId, hostelworld: hostelworldCity });
    process.env.PARTNER_LOOKUP = '0';
    assert.equal(partnerLookups(), null, 'vypínač PARTNER_LOOKUP=0');
    process.env.PARTNER_LOOKUP = '1';
    assert.ok(partnerLookups());
    config.mock = true;
    assert.equal(partnerLookups(), null, 'DEMO');
    const r = await searchStays({ city: 'Cotonou', cityEn: 'Cotonou', cc: 'BJ', lat: 6.3654, lon: 2.4183, checkin: ymdPlus(30), checkout: ymdPlus(33), adults: 2 }, { partners: partnerLookups() });
    assert.equal(stub.calls.length, 0);
    assert.ok(r.items.length > 0, 'DEMO nabídky');
    assert.equal(new URL(link(r, 'trip').url).searchParams.get('searchWord'), 'Cotonou, Benin');
    assert.equal(link(r, 'agoda').url, 'https://www.agoda.com/cs-cz/');
    assert.equal(link(r, 'hostelworld').url, 'https://www.hostelworld.com/hostels/africa/benin/cotonou/');
  } finally {
    stub.restore();
    config.mock = prev.mock;
    if (prev.env === undefined) delete process.env.PARTNER_LOOKUP;
    else process.env.PARTNER_LOOKUP = prev.env;
  }
});
