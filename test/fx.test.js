import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import { loadRates, FALLBACK_EUR } from '../server/lib/fx.js';
import { config } from '../server/config.js';

// první: ještě bez 15min pauzy po výpadku z dalšího testu, jinak by „žádný dotaz“ nic neověřil
test('DEMO: orientační kurzy bez dotazu ven', async () => {
  const prev = config.mock;
  const s = stubFetch(() => ({ status: 200, body: { result: 'success', rates: { CZK: 99 } } }));
  try {
    config.mock = true;
    const r = await loadRates();
    assert.equal(s.calls.length, 0);
    assert.equal(r.source, 'approx');
    assert.equal(r.rates.CZK, FALLBACK_EUR.CZK);
  } finally {
    config.mock = prev;
    s.restore();
  }
});

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
