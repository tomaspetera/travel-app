// Živý radar na přehledu: dotaz z aplikace (SearchHelp.radarQuery v public/js/searchhelp.js) proti serveru v DEMO
// režimu. Vlastní server – v test/server.test.js je limit hledání za 10 minut už skoro vyčerpaný.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const { radarQuery } = ctx.window.SearchHelp;

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function search(body) {
  const r = await fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 200);
  const last = JSON.parse((await r.text()).trim().split('\n').at(-1));
  assert.equal(last.type, 'result');
  return last.result;
}

const home = { from: [{ id: 'ap:BRQ', label: 'Brno' }], radius: 200 };
const wd = (d) => new Date(d + 'T12:00:00Z').getUTCDay();

test('radar Víkendy: jen odlet v pátek nebo sobotu a návrat v neděli nebo pondělí, 1–3 noci, příštích 6 týdnů', async () => {
  const q = radarQuery('weekend', home, ymdPlus(0));
  const r = await search(q.payload);
  assert.equal(r.mode, 'explore');
  assert.ok(r.groups.length >= 12, 'radar má čím zaplnit 12 karet');
  for (const g of r.groups) {
    const t = g.best;
    assert.ok([5, 6].includes(wd(t.out.date)), `odlet ${t.out.date}`);
    assert.ok([0, 1].includes(wd(t.back.date)), `návrat ${t.back.date}`);
    assert.ok(t.nights >= 1 && t.nights <= 3, `${t.nights} nocí`);
    assert.ok(t.out.date >= q.payload.dateFrom && t.out.date <= q.payload.dateTo, t.out.date);
  }
});

test('radar Kdykoliv: zpáteční 2–7 nocí', async () => {
  const q = radarQuery('all', home, ymdPlus(0));
  const r = await search(q.payload);
  assert.ok(r.groups.length >= 12);
  for (const g of r.groups) assert.ok(g.best.nights >= 2 && g.best.nights <= 7, `${g.best.nights} nocí`);
});
