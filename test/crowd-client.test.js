// Strop rozběhnutých hledání na adresu s výchozím nastavením (4 naráz, fronta 20, 8 na adresu): běžný uživatel ho
// nepozná, jedna adresa ale nezaplní frontu ostatním. Vlastní soubor = vlastní proces, ať platí výchozí strop a fronta
// (test/crowd.test.js má frontu 1 kvůli 503).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
// prázdná hodnota = výchozí z server/config.js (a přednost před případným .env vývojáře)
for (const k of ['SEARCH_CONCURRENCY', 'SEARCH_QUEUE', 'SEARCH_PER_CLIENT', 'SEARCH_RATE_LIMIT']) process.env[k] = '';
const { createServer, _searchClients } = await import('../server/index.js');
const { config } = await import('../server/config.js');
const { mockProviders } = await import('../server/providers/mock.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const q = { from: ['ap:VIE'], to: ['ap:BCN'], radiusKm: 0, trip: 'return', nightsMin: 3, nightsMax: 5 };
// i-té různé hledání (jiný termín)
const nth = (i) => ({ ...q, dateFrom: ymdPlus(20), dateTo: ymdPlus(26 + i) });
const post = (body, ip) => fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
const lastLine = async (r) => JSON.parse((await r.text()).trim().split('\n').at(-1));
/** Zpomalí demo zdroje, ať hledání běží déle a překrývají se. */
function slowMock(ms) {
  const orig = mockProviders.map((p) => p.daily);
  mockProviders.forEach((p, i) => {
    p.daily = async (a) => {
      await sleep(ms);
      return orig[i].call(p, a);
    };
  });
  return () => mockProviders.forEach((p, i) => { p.daily = orig[i]; });
}

test('výchozí strop: 8 hledání naráz z jedné adresy (aplikace sama pustí nejvýš 7)', () => {
  assert.equal(config.searchPerClient, 8);
  assert.equal(config.searchConcurrency, 4);
  assert.equal(config.searchQueue, 20);
});

test('běžný uživatel strop nepozná: 7 různých hledání naráz z jedné adresy (radar ve všech režimech, hledání, kontrola ceny) projde', async () => {
  const restore = slowMock(100);
  try {
    const rs = await Promise.all(Array.from({ length: 7 }, (_, i) => post(nth(i), '10.20.0.1')));
    assert.deepEqual(rs.map((r) => r.status), Array(7).fill(200));
    const lines = await Promise.all(rs.map(lastLine));
    assert.ok(lines.every((l) => l.type === 'result'));
    assert.equal(_searchClients.size, 0);
  } finally {
    restore();
  }
});

test('jedna adresa nezaplní frontu: z 30 různých hledání naráz projde 8, zbytek 429 (ne 503 pro všechny) a jiní dál hledají', async () => {
  const restore = slowMock(300);
  try {
    // jiná hledání než v testu výš: hotový výsledek stejného dotazu (index.js _recentSearches) se nepočítá – níž
    const other = (i) => ({ ...nth(i), nightsMin: 2 });
    const flood = await Promise.all(Array.from({ length: 30 }, (_, i) => post(other(i), '10.21.0.1')));
    const codes = flood.map((r) => r.status);
    assert.equal(codes.filter((c) => c === 200).length, 8, codes.join(','));
    assert.equal(codes.filter((c) => c === 429).length, 22, codes.join(','));
    assert.equal(_searchClients.count('10.21.0.1'), 8);
    // hotový výsledek (stejná hledání jako v testu výš) nic nepočítá – frontu ani strop adresy nezabere, projde i nad ním
    const again = await Promise.all(Array.from({ length: 7 }, (_, i) => post(nth(i), '10.21.0.1')));
    assert.deepEqual(again.map((r) => r.status), Array(7).fill(200));
    assert.ok((await Promise.all(again.map(lastLine))).every((l) => l.type === 'result'));
    // fronta má pro ostatní dál místo: 10 dalších lidí najednou projde
    const others = await Promise.all(Array.from({ length: 10 }, (_, i) => post({ ...nth(i), nightsMax: 6 }, `10.22.0.${i + 1}`)));
    assert.deepEqual(others.map((r) => r.status), Array(10).fill(200));
    const done = await Promise.all([...flood.filter((r) => r.status === 200), ...others].map(lastLine));
    assert.ok(done.every((l) => l.type === 'result'));
    await Promise.all(flood.filter((r) => r.status === 429).map((r) => r.text()));
    assert.equal(_searchClients.size, 0, 'po skončení se počty vrátí na prázdno');
    // odmítnutá hledání se do limitu adresy (40 za 10 min) nepočítala: další hledání projde
    const next = await post(nth(40), '10.21.0.1');
    assert.equal(next.status, 200);
    assert.equal((await lastLine(next)).type, 'result');
  } finally {
    restore();
  }
});
