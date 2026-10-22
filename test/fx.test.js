import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import { loadRates, FALLBACK_EUR } from '../server/lib/fx.js';

test('výpadek obou zdrojů kurzů: orientační kurzy a 15 min žádné další čekání na timeouty', async () => {
  const s = stubFetch(() => ({ status: 503, body: 'down' }));
  try {
    const r1 = await loadRates();
    assert.equal(r1.source, 'approx');
    assert.equal(r1.rates.CZK, FALLBACK_EUR.CZK);
    const n = s.calls.length;
    assert.ok(n >= 2, 'zkusí oba zdroje');
    const r2 = await loadRates();
    assert.equal(r2.source, 'approx');
    assert.equal(s.calls.length, n, 'druhé hledání už zdroje kurzů nevolá');
  } finally {
    s.restore();
  }
});
