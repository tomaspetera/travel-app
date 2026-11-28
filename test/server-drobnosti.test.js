// Drobnosti z kontroly serveru: pojistka BRouteru po výpadku, odpověď na síťovou chybu cizí služby, text chyby
// agregátoru (Aviasales není aerolinka) a odpočet „Zkusit znovu“ i u Aviasales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import net from 'node:net';
import { stubFetch } from './helpers.js';

process.env.ATLAS_MOCK = '1';
process.env.BROUTER_GAP_MS = '0';
const { brouterGet, resetBrouter } = await import('../server/lib/brouter.js');
const { errorReply } = await import('../server/index.js');
const { errText } = await import('../server/lib/search.js');
const { HttpError, request } = await import('../server/lib/http.js');

const URL_ = 'https://brouter.de/brouter?lonlats=14.4,50.1|14.5,50.2&profile=trekking&format=geojson';

test('BRouter: po výpadku se minutu neptá – čekající dotazy hned chybou, bez dalšího čekání na server', async () => {
  resetBrouter();
  const stub = stubFetch(() => ({ status: 503, body: 'down' }));
  try {
    await assert.rejects(brouterGet(URL_, { retries: 0 }), (e) => e.status === 503);
    // další dotazy (i ty, co už čekaly ve frontě) server vůbec nevolají; bez status = volající to berou jako výpadek
    const r = await Promise.allSettled([brouterGet(URL_, { retries: 0 }), brouterGet(URL_, { retries: 0 })]);
    assert.ok(r.every((x) => x.status === 'rejected' && x.reason.skipped && !x.reason.status));
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
    resetBrouter();
  }
});

test('BRouter: nenalezená trasa (400) výpadek není – další dotaz jde normálně', async () => {
  resetBrouter();
  let n = 0;
  const stub = stubFetch(() => (n++ ? { body: { type: 'FeatureCollection', features: [] } } : { status: 400, body: 'target island detected' }));
  try {
    await assert.rejects(brouterGet(URL_, { retries: 0 }), (e) => e.status === 400);
    assert.deepEqual(await brouterGet(URL_, { retries: 0 }), { type: 'FeatureCollection', features: [] });
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test('errorReply: nedostupná cizí služba (fetch failed) → 503 s krátkou hláškou a jedním řádkem do logu', async () => {
  // volný port na tomto stroji (server hned zavřený) → spojení odmítnuto
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  await new Promise((r) => srv.close(r));
  const err = await request(`http://127.0.0.1:${port}/x`, { retries: 0, timeoutMs: 3000 }).catch((e) => e);
  assert.equal(err.message, 'fetch failed', 'síťová chyba z request() je TypeError undici');
  const r = errorReply(err);
  assert.equal(r.status, 503);
  assert.equal(r.error, 'Zdroj dat teď neodpovídá – zkus to prosím za chvíli.');
  assert.match(r.warn, /^upstream ECONNREFUSED: fetch failed$/);
  // ostatní beze změny: HttpError 429, timeout, chyba uživatele, chyba v kódu (celý výpis – warn null)
  assert.equal(errorReply(new HttpError(429, 'https://x.example/a?b=1')).error, 'Zdroj dat je teď přetížený – zkus to prosím za minutu.');
  assert.equal(errorReply(new Error('Timeout 15000 ms: https://x.example/a')).status, 503);
  assert.deepEqual(errorReply(Object.assign(new Error('Neplatné datum.'), { status: 400 })), { status: 400, error: 'Neplatné datum.', warn: null });
  assert.deepEqual(errorReply(new TypeError('x is not a function')), { status: 500, error: 'Chyba serveru – zkus to prosím za chvíli znovu.', warn: null });
});

test('errText: u agregátoru (Aviasales, Kiwi.com) ne „aerolinka“, u aerolinky beze změny', () => {
  assert.equal(errText(new HttpError(401, 'https://api.travelpayouts.com/x'), 'travelpayouts'), 'zdroj cen dotaz odmítl (HTTP 401)');
  assert.equal(errText(new HttpError(503, 'https://api.travelpayouts.com/x'), 'travelpayouts'), 'výpadek zdroje cen (HTTP 503)');
  assert.equal(errText(new HttpError(403, 'https://x.example/'), 'kiwi'), 'zdroj cen dotaz odmítl (HTTP 403)');
  assert.equal(errText(new HttpError(403, 'https://x.example/'), 'ryanair'), 'aerolinka dotaz odmítla (HTTP 403)');
  assert.equal(errText(new HttpError(502, 'https://x.example/'), 'wizzair'), 'výpadek na straně aerolinky (HTTP 502)');
});

test('lowcostOutage: Aviasales vynechaný po výpadku má odpočet pro „Zkusit znovu za N s“', () => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
  const out = JSON.parse(JSON.stringify(ctx.window.SearchHelp.lowcostOutage([{ id: 'travelpayouts', outage: 'blocked', retryAfter: 60 }, { id: 'kiwi', outage: 'down' }])));
  assert.deepEqual(out, [{ id: 'travelpayouts', name: 'Aviasales', level: 'blocked', retryAfter: 60 }]);
});

test('lowcostBanner: jeden vynechaný zdroj „ho“ (ne „je“); prázdný výsledek bez „nejnižší cena může být nižší“', () => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
  const fl = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  const a = fl.indexOf('  function lowcostBanner('), b = fl.indexOf('  function kiwiOnly(', a);
  assert.ok(a >= 0 && b > a, 'lowcostBanner ve flights.js');
  const ikona = n => `<span class="ico i-${n}" aria-hidden="true"></span>`; // stejná kopie jako ve flights.js
  const banner = new Function('SearchHelp', 'lastResultAt', 'ikona', `${fl.slice(a, b)}; return lowcostBanner;`)(ctx.window.SearchHelp, Date.now(), ikona);
  const tp = { id: 'travelpayouts', outage: 'blocked', retryAfter: 60 };
  const empty = banner({ providers: [tp], groups: [] });
  assert.match(empty, /<b>Aviasales teď neodpověděl<\/b> – jeho lety se nepodařilo načíst\. Po výpadku ho Letsi na pár minut vynechává\./);
  assert.match(empty, /disabled data-until="\d+">↻ Zkusit znovu za 60 s</);
  assert.match(banner({ providers: [tp], groups: [{}] }), /\(často ty nejlevnější\) ve výsledcích chybí, takže skutečná nejnižší cena může být nižší\. Po výpadku ho Letsi/);
  const two = banner({ providers: [{ id: 'ryanair', outage: 'blocked', retryAfter: 60 }, { id: 'wizzair', outage: 'blocked', retryAfter: 600 }], groups: [{}] });
  assert.match(two, /<b>Ryanair a Wizz Air teď neodpověděly<\/b> – jejich lety .* Po výpadku je Letsi/);
});
