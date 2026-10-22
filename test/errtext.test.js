// Text chyby zdroje v aplikaci: lidsky a bez adresy API (dřív „HTTP 503 https://be.wizzair.com/29.22.0/Api/…“).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errText } from '../server/lib/search.js';
import { HttpError } from '../server/lib/http.js';

test('errText: výpadek, odmítnutí a jiné kódy bez adresy', () => {
  assert.equal(errText(new HttpError(503, 'https://be.wizzair.com/29.22.0/Api/search/timetableV2')), 'výpadek na straně aerolinky (HTTP 503)');
  assert.equal(errText(new HttpError(403, 'https://x.example/api?a=1')), 'aerolinka dotaz odmítla (HTTP 403)');
  assert.equal(errText(new HttpError(400, 'https://x.example/api')), 'chyba HTTP 400');
});

test('errText: vlastní hlášky beze změny, adresa z textu pryč', () => {
  assert.equal(errText(new Error('vypršel čas (15 s)')), 'vypršel čas (15 s)');
  assert.equal(errText(new Error('fetch failed https://be.wizzair.com/x')), 'fetch failed');
  assert.equal(errText(null), 'neznámá chyba');
});
