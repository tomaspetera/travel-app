// Ceny pohonných hmot: ČSÚ (JSON-stat) a Weekly Oil Bulletin EU (XLSX) – parsování skutečných vzorků, převod
// na Kč, mezipaměť 24 h se stale-while-revalidate, záloha při výpadku a timeoutu, DEMO a cena paliva za cestu.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { stubFetch } from './helpers.js';
import { CZSO_FUEL, CZSO_ALL } from './fixtures/czso.js';

process.env.ATLAS_MOCK = '0';
process.env.FUEL_TIMEOUT_MS = '200';
const { config } = await import('../server/config.js');
const { setRates, FALLBACK_EUR } = await import('../server/lib/fx.js');
const fuel = await import('../server/lib/fuel.js');

// Skutečný soubor „Weekly prices with taxes“ stažený 6. 10. 2026 (ceny k 28. 9. 2026).
const XLSX = readFileSync(new URL('./fixtures/wob-prices-with-taxes-2026-09-28.xlsx', import.meta.url));
const XLSX_TYPE = { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const ER_API = { result: 'success', rates: { EUR: 1, CZK: 24.4 }, time_last_update_utc: 'Tue, 06 Oct 2026 00:02:31 +0000' };
setRates({ base: 'EUR', rates: { ...FALLBACK_EUR, CZK: 24.4 }, source: 'test' });

let t = Date.parse('2026-10-06T12:00:00Z');
const H = 3600e3;
const clock = () => t;

/** Podvržené zdroje: ČSÚ, dokument bulletinu, stránka bulletinu a kurzy; cokoliv jiného 404. */
function sources({ czso = () => ({ body: CZSO_FUEL }), wob = () => ({ body: XLSX, headers: XLSX_TYPE }), page = () => ({ status: 404, body: '' }) } = {}) {
  return stubFetch((url, init) => {
    if (url.startsWith('https://data.csu.gov.cz/')) return czso(url, init);
    if (url.startsWith('https://energy.ec.europa.eu/document/')) return wob(url, init);
    if (url.startsWith('https://energy.ec.europa.eu/data-and-analysis/')) return page(url, init);
    if (url.startsWith('https://open.er-api.com/')) return { body: ER_API };
    return { status: 404, body: 'not found' };
  });
}
const count = (s, host) => s.calls.filter((c) => c.url.includes(host)).length;
// Visí, dokud požadavek nezruší timeout.
const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));

afterEach(() => {
  delete process.env.FUEL_LIVE;
  config.mock = false;
  fuel.resetFuel({ clock });
});

/** Minimální ZIP (deflate nebo bez komprese) pro syntetické XLSX. */
function zip(files, { store = false } = {}) {
  const parts = [];
  const central = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const body = store ? data : deflateRawSync(data);
    const n = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(store ? 0 : 8, 8);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(store ? 0 : 8, 10);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(off, 42);
    parts.push(lh, n, body);
    central.push(Buffer.concat([ch, n]));
    off += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

test('isoWeekStart: pondělí ISO týdne', () => {
  assert.equal(fuel.isoWeekStart('2026-W40'), '2026-09-28');
  assert.equal(fuel.isoWeekStart('2026-W01'), '2025-12-29', '1. týden 2026 začíná v pondělí 29. 12. 2025');
  assert.equal(fuel.isoWeekStart('2021-W01'), '2021-01-04');
  assert.equal(fuel.isoWeekStart('2020-W53'), '2020-12-28');
  assert.equal(fuel.isoWeekStart('40. týden 2026'), null);
});

test('parseCzso: skutečná odpověď ČSÚ → nafta a Natural 95 za poslední týden, pořadí dimenzí nehraje roli', () => {
  const c = fuel.parseCzso(CZSO_FUEL);
  assert.deepEqual(c, { diesel: 50.65, petrol: 45.87, week: '2026-W40', date: '2026-09-28', period: '40. týden 2026', updated: '2026-10-02T07:00Z' });
  assert.deepEqual(fuel.parseCzso(CZSO_ALL), c, 'jiné pořadí dimenzí, navíc LPG a index cen');
  // neúplný poslední týden → předchozí úplný
  const partial = structuredClone(CZSO_FUEL);
  partial.value[1] = null; // Natural 95, 40. týden
  assert.deepEqual(fuel.parseCzso(partial), { diesel: 50.43, petrol: 45.88, week: '2026-W39', date: '2026-09-21', period: '39. týden 2026', updated: '2026-10-02T07:00Z' });
  // jen index cen (%) bez ceny v Kč/l, nesmysl a prázdná odpověď → chyba
  const indexOnly = structuredClone(CZSO_ALL);
  indexOnly.dimension.IndicatorType.category.index = { '6621TI': 0, X: 1 };
  assert.throws(() => fuel.parseCzso(indexOnly), /chybí ceny/);
  assert.throws(() => fuel.parseCzso({ error: 'Nenalezeno' }), /ČSÚ: neplatná odpověď/);
  assert.throws(() => fuel.parseCzso({ ...CZSO_FUEL, value: [] }), /chybí ceny/);
});

test('parseWob: skutečný XLSX bulletinu → EUR/l pro všech 27 zemí, datum z buňky (ne z názvu souboru)', () => {
  const w = fuel.parseWob(XLSX);
  assert.equal(w.date, '2026-09-28', 'soubor se jmenuje „… 2026-09-21.xlsx“, ale data jsou k 28. 9.');
  assert.equal(Object.keys(w.eur).length, 27);
  assert.deepEqual(w.eur.CZ, { diesel: 2.076, petrol: 1.88 });
  assert.deepEqual(w.eur.DE, { diesel: 2.437, petrol: 2.345 });
  assert.deepEqual(w.eur.AT, { diesel: 2.259, petrol: 1.956 });
  assert.deepEqual(w.eur.SK, { diesel: 1.978, petrol: 1.853 });
  assert.deepEqual(w.eur.PL, { diesel: 2.0603, petrol: 1.8527 });
  assert.deepEqual(w.eur.HU, { diesel: 1.9323, petrol: 1.7293 });
  // ČR v bulletinu × kurz ECB z 28. 9. (24,397) = cena ČSÚ za 40. týden → zdroje sedí
  assert.equal(Math.round(w.eur.CZ.diesel * 24.397 * 100) / 100, 50.65);
  assert.equal(Math.round(w.eur.CZ.petrol * 24.397 * 100) / 100, 45.87);
  // vestavěné ceny sousedů = tentýž bulletin × 24,397
  for (const cc of ['DE', 'AT', 'SK', 'PL', 'HU']) {
    for (const f of fuel.FUELS) assert.ok(Math.abs(fuel.FALLBACK.prices[cc][f] - w.eur[cc][f] * 24.397) < 0.011, `${cc} ${f}`);
  }
});

test('xlsxRows / parseWob: vložené řetězce, entity, datum jako text, ZIP bez komprese; chybné vstupy', () => {
  const sheet = (head) => `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>${head}</t></is></c><c r="B1" t="inlineStr"><is><r><t>Euro-super 95 </t></r><r><t>(I)</t></r></is></c><c r="C1" t="s"><v>0</v></c></row>
<row r="2"><c r="A2" t="str"><v>05/10/2026</v></c><c r="B2" t="inlineStr"><is><t>1000 l</t></is></c><c r="C2" t="inlineStr"><is><t>1000 l</t></is></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Czech Republic</t></is></c><c r="B3"><v>1900.5</v></c><c r="C3"><v>2100</v></c></row>
<row r="4"><c r="A4" t="s"><v>1</v></c><c r="B4"/><c r="C4"><v>2000</v></c></row>
<row r="5"><c r="A5" t="s"><v>2</v></c><c r="B5"><v>1800</v></c><c r="C5"><v>1700</v></c></row>
</sheetData></worksheet>`;
  const sst = '<sst><si><t>Gas oil automobile Automotive gas oil Dieselkraftstoff (I)</t></si><si><t>Germany</t></si><si><r><t>Pol</t></r><r><t>and</t></r></si></sst>';
  for (const store of [false, true]) {
    const buf = zip({ 'xl/worksheets/sheet1.xml': sheet('Prices &amp; taxes in EUR'), 'xl/sharedStrings.xml': sst }, { store });
    const rows = fuel.xlsxRows(buf);
    assert.equal(rows[0][0], 'Prices & taxes in EUR');
    assert.equal(rows[0][1], 'Euro-super 95 (I)');
    assert.equal(rows[3][1], null);
    assert.deepEqual(fuel.parseWob(buf), { date: '2026-10-05', eur: { CZ: { diesel: 2.1, petrol: 1.9005 }, PL: { diesel: 1.7, petrol: 1.8 } } }, 'Německo bez ceny benzínu vynecháno');
  }
  assert.throws(() => fuel.parseWob(zip({ 'xl/worksheets/sheet1.xml': sheet('in PLN'), 'xl/sharedStrings.xml': sst })), /nejsou v EUR/);
  assert.throws(() => fuel.parseWob(Buffer.from('<!DOCTYPE html><html><body>European Commission</body></html>')), /není ZIP/);
  assert.throws(() => fuel.parseWob(zip({ 'docProps/app.xml': '<x/>' })), /chybí list/);
});

test('fuelPrices: ČR z ČSÚ, sousedé z bulletinu přepočtení kurzem, slušné dotazy s vlastním User-Agent', async () => {
  fuel.resetFuel({ clock });
  const s = sources();
  try {
    const p = await fuel.fuelPrices();
    assert.deepEqual(Object.keys(p), fuel.COUNTRIES);
    assert.deepEqual(p.CZ, { diesel: 50.65, petrol: 45.87, date: '2026-09-28', source: 'czso', label: 'ČSÚ, 40. týden 2026 (28. 9.–4. 10.)' });
    assert.deepEqual(p.DE, { diesel: 59.46, petrol: 57.22, date: '2026-09-28', source: 'wob', label: 'Oil Bulletin EU, k 28. 9. 2026', eur: { diesel: 2.437, petrol: 2.345 } });
    assert.equal(p.AT.diesel, 55.12); // 2,259 € × 24,4
    assert.equal(p.HU.petrol, 42.19); // 1,7293 € × 24,4
    assert.equal(count(s, 'data.csu.gov.cz'), 1);
    assert.equal(count(s, 'energy.ec.europa.eu'), 1);
    const czso = s.calls.find((c) => c.url.includes('data.csu.gov.cz'));
    assert.equal(czso.url, fuel.CZSO_URL);
    assert.match(czso.init.headers['User-Agent'], /^ATLAS-travel\//);
    assert.match(s.calls.find((c) => c.url === fuel.WOB_URL).init.headers['User-Agent'], /^ATLAS-travel\//);
    assert.equal(fuel.fuelText(), 'nafta 50,65 Kč/l · ČSÚ, 40. týden 2026 (28. 9.–4. 10.)');
    assert.equal(fuel.fuelText('CZ', 'petrol'), 'benzín N95 45,87 Kč/l · ČSÚ, 40. týden 2026 (28. 9.–4. 10.)');
    const info = await fuel.fuelInfo();
    assert.equal(info.updated, new Date(t).toISOString());
    assert.equal(info.defaultFuel, 'diesel');
    assert.deepEqual(info.lPer100, { diesel: 6, petrol: 7 });
    assert.deepEqual(info.sources.map((x) => [x.id, x.ok, x.date]), [['czso', true, '2026-09-28'], ['wob', true, '2026-09-28']]);
    assert.equal(info.sources[0].period, '40. týden 2026');
    assert.equal(info.sources[1].fx.eurCzk, 24.4);
    assert.equal(info.CZ.diesel, 50.65);
    assert.equal(info.demo, undefined);
    assert.equal(count(s, 'data.csu.gov.cz'), 1, 'druhý dotaz z mezipaměti');
  } finally {
    s.restore();
  }
});

test('mezipaměť 24 h: do té doby bez dotazů, pak hned staré ceny a obnovení na pozadí (stale-while-revalidate)', async () => {
  fuel.resetFuel({ clock });
  let diesel = 50.65;
  const s = sources({ czso: () => {
    const j = structuredClone(CZSO_FUEL);
    j.value[3] = diesel;
    return { body: j };
  } });
  try {
    await fuel.fuelPrices();
    t += 23 * H;
    assert.equal(fuel.fuelSnapshot().prices.CZ.diesel, 50.65);
    assert.equal((await fuel.fuelPrices()).CZ.diesel, 50.65);
    assert.equal(count(s, 'data.csu.gov.cz'), 1, 'za 23 h žádný nový dotaz');
    t += 2 * H;
    diesel = 51.2;
    assert.equal(fuel.fuelSnapshot().prices.CZ.diesel, 50.65, 'zastaralé ceny hned, bez čekání na síť');
    assert.equal((await fuel.fuelPrices()).CZ.diesel, 50.65, 'i fuelPrices nečeká, když už něco má');
    await fuel.refreshFuel(); // doběhne obnovení spuštěné na pozadí
    assert.equal(fuel.fuelSnapshot().prices.CZ.diesel, 51.2);
    assert.equal(count(s, 'data.csu.gov.cz'), 2);
    assert.equal(count(s, 'energy.ec.europa.eu'), 2, 'jeden dotaz na zdroj za den');
  } finally {
    t = Date.parse('2026-10-06T12:00:00Z');
    s.restore();
  }
});

test('výpadek obou zdrojů → vestavěné ceny s datem, nový pokus nejdřív za 2 h', async () => {
  fuel.resetFuel({ clock });
  let fail = true;
  const s = sources({
    czso: () => (fail ? { status: 500, body: 'Internal Server Error' } : { body: CZSO_FUEL }),
    wob: () => (fail ? { status: 503, body: 'Service Unavailable' } : { body: XLSX, headers: XLSX_TYPE }),
  });
  try {
    const info = await fuel.fuelInfo();
    for (const cc of fuel.COUNTRIES) {
      assert.equal(info[cc].source, 'builtin', cc);
      assert.equal(info[cc].date, '2026-09-28');
      assert.equal(info[cc].label, 'orientačně, k 28. 9. 2026');
    }
    assert.equal(info.CZ.diesel, 50.65);
    assert.equal(info.updated, null);
    assert.deepEqual(info.sources.map((x) => [x.id, x.ok]), [['czso', false], ['wob', false], ['builtin', true]]);
    assert.match(info.sources[0].error, /HTTP 500/);
    assert.match(info.sources[1].error, /HTTP 503/);
    assert.equal(count(s, 'data.csu.gov.cz'), 1, 'bez opakování');
    t += 1 * H;
    fail = false;
    assert.equal((await fuel.fuelPrices()).CZ.source, 'builtin');
    fuel.carFuelCzk({ roadKm: 100 });
    assert.equal(count(s, 'data.csu.gov.cz'), 1, 'hodinu po chybě se nezkouší znovu');
    t += 1 * H;
    assert.equal(fuel.fuelSnapshot().prices.CZ.source, 'builtin');
    await fuel.refreshFuel();
    assert.equal(count(s, 'data.csu.gov.cz'), 2, 'po 2 h nový pokus');
    const p = await fuel.fuelPrices();
    assert.equal(p.CZ.source, 'czso');
    assert.equal(p.DE.source, 'wob');
  } finally {
    t = Date.parse('2026-10-06T12:00:00Z');
    s.restore();
  }
});

test('ČSÚ neodpoví do timeoutu → ČR z bulletinu; ČSÚ o víc než týden starší než bulletin → také bulletin', async () => {
  fuel.resetFuel({ clock });
  let s = sources({ czso: hang });
  try {
    const t0 = Date.now();
    const info = await fuel.fuelInfo();
    assert.ok(Date.now() - t0 < 3000, 'timeout (zde 200 ms) – na pomalý zdroj se nečeká');
    assert.deepEqual(info.CZ, { diesel: 50.65, petrol: 45.87, date: '2026-09-28', source: 'wob', label: 'Oil Bulletin EU, k 28. 9. 2026', eur: { diesel: 2.076, petrol: 1.88 } });
    assert.match(info.sources[0].error, /Timeout 200 ms/);
    assert.equal(info.sources.find((x) => x.id === 'builtin'), undefined);
  } finally {
    s.restore();
  }
  fuel.resetFuel({ clock });
  const old = structuredClone(CZSO_FUEL);
  old.dimension.CASTPHM.category.index = { '2026-W30': 0, '2026-W31': 1 };
  s = sources({ czso: () => ({ body: old }) });
  try {
    const p = await fuel.fuelPrices();
    assert.equal(p.CZ.source, 'wob', 'ČSÚ k 27. 7. vs. bulletin k 28. 9.');
  } finally {
    s.restore();
  }
});

test('Oil Bulletin: dokument dostal nové ID → odkaz ze stránky bulletinu', async () => {
  fuel.resetFuel({ clock });
  const moved = '/document/download/0000aaaa-1111-2222-3333-444455556666_en?filename=Weekly%20Oil%20Bulletin%20Weekly%20prices%20with%20Taxes%20-%202026-10-05.xlsx';
  const s = sources({
    wob: (url) => (url === fuel.WOB_URL ? { status: 404, body: 'Not found' } : { body: XLSX, headers: XLSX_TYPE }),
    page: () => ({ body: `<a href="/document/download/78311f92_en?filename=Weekly%20Oil%20Bulletin%20Weekly%20prices%20without%20taxes.xlsx">bez daní</a><a href="${moved.replace(/&/g, '&amp;')}">s daněmi</a>`, headers: { 'content-type': 'text/html' } }),
  });
  try {
    const p = await fuel.fuelPrices();
    assert.equal(p.DE.source, 'wob');
    assert.ok(s.calls.some((c) => c.url === `https://energy.ec.europa.eu${moved}`), 'stáhne nový odkaz s daněmi');
  } finally {
    s.restore();
  }
});

test('carFuelCzk / fuelPrice: cena paliva za cestu, výchozí nafta 6 l/100 km, země tankování; nikdy nečeká na síť', async () => {
  process.env.FUEL_LIVE = '0'; // vestavěné ceny, bez sítě
  assert.equal(fuel.carFuelCzk({ roadKm: 100 }), 304, '100 km × 6 l × 50,65 Kč');
  assert.equal(fuel.carFuelCzk({ roadKm: 100, fuel: 'petrol' }), 321, '100 km × 7 l × 45,87 Kč');
  assert.equal(fuel.carFuelCzk({ roadKm: 330, lPer100: 5 }), 836);
  assert.equal(fuel.carFuelCzk({ roadKm: 100, country: 'de' }), 357, 'Německo 59,46 Kč/l');
  assert.equal(fuel.carFuelCzk({ roadKm: 100, country: 'XX' }), 304, 'neznámá země → ČR');
  assert.equal(fuel.carFuelCzk({ roadKm: 100, fuel: 'lpg' }), 304, 'neznámé palivo → nafta');
  assert.equal(fuel.carFuelCzk({ roadKm: 100, lPer100: 80 }), fuel.carFuelCzk({ roadKm: 100, lPer100: 30 }), 'spotřeba nejvýš 30 l');
  for (const roadKm of [0, -5, 'abc', undefined]) assert.equal(fuel.carFuelCzk({ roadKm }), 0);
  assert.equal(fuel.carFuelCzk(), 0);
  assert.deepEqual(fuel.fuelPrice('PL', 'petrol'), { country: 'PL', fuel: 'petrol', perLitre: 45.2, date: '2026-09-28', source: 'builtin', label: 'orientačně, k 28. 9. 2026' });
  delete process.env.FUEL_LIVE;

  // živý režim, studený start, zdroje visí: výsledek hned (vestavěná cena) a stahování běží na pozadí
  fuel.resetFuel({ clock });
  const s = sources({ czso: hang, wob: hang });
  try {
    const t0 = Date.now();
    assert.equal(fuel.carFuelCzk({ roadKm: 100 }), 304);
    assert.ok(Date.now() - t0 < 50);
    assert.equal(count(s, 'data.csu.gov.cz'), 1, 'obnovení spuštěné na pozadí');
    await fuel.refreshFuel();
  } finally {
    s.restore();
  }
});

test('DEMO (ATLAS_MOCK=1): pevné ceny bez sítě', async () => {
  config.mock = true;
  fuel.resetFuel({ clock });
  const s = stubFetch(() => {
    throw new Error('DEMO nesmí volat síť');
  });
  try {
    const info = await fuel.fuelInfo();
    assert.equal(info.demo, true);
    assert.deepEqual(info.CZ, { diesel: 50.65, petrol: 45.87, date: '2026-09-28', source: 'demo', label: 'DEMO – pevná cena' });
    assert.equal(info.DE.diesel, 59.46);
    assert.deepEqual(info.sources.map((x) => x.id), ['demo']);
    assert.equal(fuel.carFuelCzk({ roadKm: 200 }), 608);
    await fuel.refreshFuel();
    assert.equal(s.calls.length, 0);
  } finally {
    s.restore();
  }
});
