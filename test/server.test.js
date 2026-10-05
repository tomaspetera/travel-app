// Integrační test: server v DEMO režimu (ATLAS_MOCK=1) – API, streamované hledání, statické soubory.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function rawGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function searchStream(body) {
  const r = await fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /ndjson/);
  const lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
  return { progress: lines.filter((l) => l.type === 'progress'), last: lines.at(-1) };
}

test('GET /api/health', async () => {
  const j = await (await fetch(`${base}/api/health`)).json();
  assert.equal(j.ok, true);
  assert.equal(j.demo, true);
  assert.ok(j.providers.length >= 1);
});

test('GET /healthz a /api/diag (ostrý test zdrojů)', async () => {
  const h = await fetch(`${base}/healthz`);
  assert.equal(h.status, 200);
  assert.equal(await h.text(), 'ok');
  const d = await (await fetch(`${base}/api/diag`)).json();
  assert.equal(d.demo, true);
  assert.ok(d.providers.length >= 1);
  assert.ok(d.providers.every((p) => p.ok && p.detail));
  const bad = await rawGet('/%E0%A4%A');
  assert.equal(bad.status, 400);
});

test('GET /api/places a /api/origins', async () => {
  const p = await (await fetch(`${base}/api/places?q=brno&remote=0`)).json();
  assert.equal(p.items[0].id, 'ap:BRQ');
  const o = await (await fetch(`${base}/api/origins?from=ap:BRQ&radius=150`)).json();
  assert.ok(o.airports.some((a) => a.iata === 'VIE'));
  assert.ok(o.airports.every((a) => a.city && a.lat));
});

test('POST /api/search – kamkoliv, zpáteční, průběh se streamuje', async () => {
  const { progress, last } = await searchStream({ from: ['ap:BRQ'], radiusKm: 150, dateFrom: ymdPlus(10), dateTo: ymdPlus(40), trip: 'return', nightsMin: 2, nightsMax: 6, adults: 2 });
  assert.ok(progress.length >= 1);
  assert.equal(last.type, 'result');
  const r = last.result;
  assert.equal(r.mode, 'explore');
  assert.equal(r.demo, true);
  assert.ok(r.groups.length > 10);
  const prices = r.groups.map((g) => g.best.perPersonCzk);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'seřazeno od nejlevnějšího');
  for (const g of r.groups.slice(0, 20)) {
    const t = g.best;
    assert.ok(t.nights >= 2 && t.nights <= 6);
    assert.equal(t.totalCzk, t.perPersonCzk * 2);
    assert.equal(t.perPersonCzk, t.flightCzk + t.groundCzk);
    assert.ok(r.origins.some((o) => o.iata === t.out.from));
  }
});

test('POST /api/search – konkrétní cíl, víkend, kalendář', async () => {
  const { last } = await searchStream({ from: ['ap:VIE'], to: ['metro:LON'], radiusKm: 200, dateFrom: ymdPlus(7), dateTo: ymdPlus(60), trip: 'return', nightsMin: 1, nightsMax: 3, outDays: [4, 5, 6], backDays: [0, 1] });
  const r = last.result;
  assert.equal(r.mode, 'route');
  assert.ok(r.top.length > 0);
  for (const t of r.top) {
    assert.ok(['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN'].includes(t.out.to));
    assert.ok([4, 5, 6].includes(new Date(t.out.date + 'T12:00:00Z').getUTCDay()));
    assert.ok([0, 1].includes(new Date(t.back.date + 'T12:00:00Z').getUTCDay()));
  }
  assert.ok(r.calendar.out.length > 0);
  assert.ok(r.calendar.out.every((d) => [4, 5, 6].includes(new Date(d.date + 'T12:00:00Z').getUTCDay())));
});

test('POST /api/search – chybějící odkud → srozumitelná chyba', async () => {
  const { last } = await searchStream({ to: ['cc:ES'] });
  assert.equal(last.type, 'error');
  assert.match(last.error, /odkud/i);
});

test('statické soubory, data a ochrana proti path traversal', async () => {
  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /<title>ATLAS/);
  const c = await (await fetch(`${base}/data/countries.json`)).json();
  assert.ok(c.length > 150);
  // fetch() by „..“ normalizoval, proto surový HTTP požadavek.
  for (const p of ['/../server/config.js', '/%2e%2e%2fserver%2fconfig.js', '/..%2f..%2f.env']) {
    const { status, body } = await rawGet(p);
    assert.ok(!body.includes('export const config'), `${p} nesmí vrátit zdrojový kód serveru`);
    assert.ok(status === 403 || status === 200, `${p}: ${status}`);
  }
  const js = await fetch(`${base}/js/flights.js`, { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(js.status, 200);
});

test('POST /api/roadtrip – jednodenní výlety i okruh s přespáním (DEMO)', async () => {
  const post = (body) => fetch(`${base}/api/roadtrip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const start = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const day = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 2, mode: 'day' })).json();
  assert.equal(day.demo, true);
  assert.equal(day.mode, 'day');
  assert.ok(day.days.length >= 1);
  assert.ok(day.days.every((d) => d.back && !d.overnight && d.stops.length));
  const loop = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 3, mode: 'loop', exclude: ['demoTrip0'] })).json();
  assert.equal(loop.mode, 'loop');
  assert.ok(loop.days.length >= 2);
  assert.ok(loop.days[0].overnight?.bookUrl.includes('booking.com'));
  assert.ok(!loop.days.flatMap((d) => d.stops).some((s) => s.id === 'demoTrip0'), 'vyřazený cíl v plánu není');
  const bad = await post({ lat: 'x', start });
  assert.equal(bad.status, 400);
  const tr = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 2, mode: 'day', transport: 'transit' })).json();
  assert.equal(tr.transport, 'transit', 'doprava se předá plánovači');
  assert.ok(tr.days.every((d) => d.stops.length <= 2 && d.stops.every((s) => /^\d{2}:\d{2}$/.test(s.depart) && s.travelMin > 0)));
  const bogus = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 1, mode: 'day', transport: 'plane' })).json();
  assert.equal(bogus.transport, 'car', 'neznámá doprava → auto');
  const nul = await fetch(`${base}/api/roadtrip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
  assert.equal(nul.status, 400, 'tělo null → 400, ne pád');
  // připnutý cíl je v plánu a vrací se s původním skóre
  const all = [...day.days.flatMap((d) => d.stops), ...day.spare];
  const pick = day.spare[day.spare.length - 1];
  const pinned = await (await post({ lat: 50.08, lon: 14.42, label: 'Praha', start, days: 2, mode: 'day', include: [pick.id] })).json();
  const got = pinned.days.flatMap((d) => d.stops).find((x) => x.id === pick.id);
  assert.ok(got, 'připnutý cíl je v plánu');
  assert.equal(got.score, all.find((x) => x.id === pick.id).score);
});

test('POST /api/bike – okruh na kole (DEMO), kontrola polohy a voleb', async () => {
  const post = (body) => fetch(`${base}/api/bike`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const r = await post({ lat: 50.0875, lon: 14.4213, km: 60, bike: 'road', scenery: 'nature', hills: 'flat' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.demo, true);
  assert.equal(j.km, 60);
  assert.equal(j.bike, 'road');
  assert.equal(j.scenery, 'nature');
  assert.equal(j.hills, 'flat');
  assert.ok(j.geometry.length > 10 && j.geometry[0].length === 3, 'trasa [lon, lat, výška]');
  assert.match(j.mapyUrl, /routeType=bike_road/);
  const d = await (await post({ lat: 50, lon: 14, scenery: 'mars', hills: 'x' })).json();
  assert.equal(d.scenery, 'mixed');
  assert.equal(d.hills, 'normal');
  assert.equal(d.km, 30);
  assert.equal((await post({ lat: 'x', lon: 14 })).status, 400);
  assert.equal((await post({ lat: 95, lon: 14 })).status, 400);
  assert.equal((await post('null')).status, 400);
  assert.equal((await post('{nope')).status, 400);
});
