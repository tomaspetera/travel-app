// Krátké odkazy na sdílenou cestu (server/lib/shortlinks.js): uložení a načtení (zkomprimované), náhled odkazu
// z obsahu, příkazy pro Upstash, neplatné vstupy; API /api/share a stránka /c/<id> v demu (úložiště v paměti).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ATLAS_MOCK = '1';
const S = await import('../server/lib/shortlinks.js');
const { createServer } = await import('../server/index.js');

const TRIP = { v: 1, dest: { label: 'Tirana', cc: 'AL' }, flight: { out: { from: 'PRG', to: 'TIA', date: '2026-11-03' }, back: { from: 'TIA', to: 'PRG', date: '2026-11-08' } }, route: { bases: [] } };

test('id: 8 znaků bez snadno zaměnitelných (0, O, 1, l, I)', () => {
  for (let i = 0; i < 200; i++) { const id = S.newId(); assert.match(id, S.ID_RE); assert.doesNotMatch(id, /[0O1lI]/); }
});

test('uložení a načtení cesty; náhled z cíle a termínu; neplatná cesta odmítnuta', async () => {
  const st = S.memoryStore(), json = JSON.stringify(TRIP);
  const id = await S.createShare(st, 'trip', json, { photo: async (p) => (p === 'Tirana' ? 'https://images.pexels.com/x.jpg?w=1200&h=630' : null) });
  const r = await S.loadShare(st, id);
  assert.equal(r.k, 'trip');
  assert.equal(r.j, json);
  assert.deepEqual(r.m, { title: 'Tirana 3.–8. 11.', desc: 'Let, ubytování a program po dnech – otevři cestu v ATLASu a ulož si ji.', img: 'https://images.pexels.com/x.jpg?w=1200&h=630' });
  assert.equal(await S.loadShare(st, 'neniTady'), null);
  assert.equal(await S.loadShare(st, '../../x'), null);
  for (const [k, j] of [['trip', '{"flight":{}}'], ['trip', 'nejson'], ['trip', '[1]'], ['offer', json], ['trip', 'x'.repeat(S.MAX_JSON + 1)]]) {
    await assert.rejects(S.createShare(st, k, j), (e) => e.status === 400, `${k} ${j.slice(0, 20)}`);
  }
});

test('náhled: termín přes měsíc, jen odlet, cesta přes víc měst, plán z plánovače, text bez HTML', () => {
  assert.equal(S.datesTxt('2026-10-28', '2026-11-03'), '28. 10.–3. 11.');
  assert.equal(S.datesTxt('2026-11-03', null), 'od 3. 11.');
  assert.equal(S.metaOf('trip', { ...TRIP, route: { fixed: 'flights', bases: [{ name: 'Lisabon' }, { name: 'Porto' }] } }).title, 'Lisabon → Porto 3.–8. 11.');
  assert.equal(S.metaOf('plan', { name: 'Řím s dětmi', dest: 'Řím', start: '2027-04-01', end: '2027-04-05' }).title, 'Řím s dětmi · 1.–5. 4.');
  assert.equal(S.metaOf('plan', { name: 'Lisabon 12.11.', dest: 'Lisabon', start: '2026-11-12', end: '2026-11-17' }).title, 'Lisabon 12.11.', 'datum v názvu plánu se nezdvojí');
  assert.equal(S.metaOf('trip', { ...TRIP, dest: { label: 'Ti<script>rana' } }).title, 'Ti script rana 3.–8. 11.');
});

test('Upstash: SET s expirací a NX, GET; obsazené id → další pokus', async () => {
  const calls = [];
  let taken = 1;
  const req = async (url, o) => { calls.push({ url, auth: o.headers.Authorization, body: o.body }); return o.body[0] === 'SET' ? { result: taken-- > 0 ? null : 'OK' } : { result: null }; };
  const st = S.upstashStore('https://eu1.upstash.io', 'TOK', req);
  const id = await S.createShare(st, 'trip', JSON.stringify(TRIP));
  assert.match(id, S.ID_RE);
  assert.equal(calls.length, 2, 'první id obsazené (NX) → druhé');
  assert.equal(calls[1].auth, 'Bearer TOK');
  assert.deepEqual(calls[1].body.slice(0, 1).concat(calls[1].body.slice(3)), ['SET', 'EX', String(400 * 86400), 'NX']);
  assert.equal(calls[1].body[1], 's:' + id);
  assert.equal(await S.loadShare(st, id), null);
  assert.deepEqual(calls.at(-1).body, ['GET', 's:' + id]);
});

test('fotka do náhledu ve výřezu 1200 × 630, jen https', () => {
  assert.equal(S.ogPhoto('https://images.pexels.com/p.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=960&h=1200'), 'https://images.pexels.com/p.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1200&h=630');
  assert.equal(S.ogPhoto('https://upload.wikimedia.org/a/960px-X.jpg'), 'https://upload.wikimedia.org/a/1200px-X.jpg');
  assert.equal(S.ogPhoto('javascript:alert(1)'), null);
  assert.equal(S.ogPhoto('https://x.cz/"><script>'), null);
});

test('mezipaměť před Upstash: uložený odkaz jen jednou z úložiště, neexistující id chvíli bez dotazu', async () => {
  let t = 0, gets = 0;
  const inner = S.memoryStore(() => t);
  const st = S.cachedStore({ kind: 'upstash', get: (k) => { gets++; return inner.get(k); }, add: inner.add }, { max: 2, missMs: 1000, now: () => t });
  const id = await S.createShare(st, 'trip', JSON.stringify(TRIP));
  assert.ok(st.has('s:' + id), 'právě uložený odkaz je v mezipaměti');
  for (let i = 0; i < 5; i++) assert.equal((await S.loadShare(st, id)).k, 'trip');
  assert.equal(gets, 0, 'otevření i náhledy sítí bez příkazu do Upstash');
  assert.equal(await S.loadShare(st, 'Zzzzzzzz'), null);
  assert.equal(await S.loadShare(st, 'Zzzzzzzz'), null);
  assert.equal(gets, 1, 'neexistující id podruhé bez dotazu');
  t = 2000;
  assert.equal(st.has('s:Zzzzzzzz'), false);
  await S.loadShare(st, 'Zzzzzzzz');
  assert.equal(gets, 2, 'po chvíli znovu (odkaz mohl mezitím vzniknout jinde)');
  // nejvýš max záznamů: nejdéle nepoužitý vypadne a načte se znovu z úložiště
  await S.createShare(st, 'trip', JSON.stringify({ ...TRIP, n: 1 }));
  await S.createShare(st, 'trip', JSON.stringify({ ...TRIP, n: 2 }));
  assert.equal(st.has('s:' + id), false);
  assert.equal((await S.loadShare(st, id)).k, 'trip');
  assert.equal(gets, 3);
});

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('API v demu: krátký odkaz → stránka s náhledem a přesměrováním do aplikace → cesta zpět', async () => {
  const json = JSON.stringify(TRIP);
  const r = await fetch(`${base}/api/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: 'trip', j: json }) });
  assert.equal(r.status, 200);
  const { id } = await r.json();
  assert.match(id, S.ID_RE);
  const page = await fetch(`${base}/c/${id}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<meta property="og:title" content="Tirana 3\.–8\. 11\.">/);
  assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0;url=/#s=${id}">`));
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html, /<script/);
  const back = await (await fetch(`${base}/api/share/${id}`)).json();
  assert.deepEqual(back, { k: 'trip', j: json });
  assert.equal((await fetch(`${base}/api/share/Zzzzzzzz`)).status, 404);
  assert.equal((await fetch(`${base}/c/Zzzzzzzz`)).status, 404);
  assert.equal((await fetch(`${base}/api/share`)).status, 405);
  assert.equal((await fetch(`${base}/api/share`, { method: 'POST', body: JSON.stringify({ k: 'trip', j: '{}' }) })).status, 400);
});

test('API: velká cesta pod MAX_JSON projde, i když v těle požadavku zdvojené uvozovky přesáhnou MAX_JSON bajtů', async () => {
  const json = JSON.stringify({ ...TRIP, notes: Array(37000).fill('ab') });
  assert.ok(json.length < S.MAX_JSON && JSON.stringify({ k: 'trip', j: json }).length > S.MAX_JSON + 2048);
  const r = await fetch(`${base}/api/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: 'trip', j: json }) });
  assert.equal(r.status, 200);
});

test('API: zkoušení náhodných id má limit (každé je příkaz do Upstash), uložené odkazy z mezipaměti ho neubírají', async () => {
  const r = await fetch(`${base}/api/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: 'plan', j: JSON.stringify({ name: 'Řím', dest: 'Řím' }) }) });
  const { id } = await r.json();
  const codes = [];
  for (let i = 0; i < 70; i++) codes.push((await fetch(`${base}/api/share/Rnd${String(i).padStart(5, 'x')}`)).status);
  assert.ok(codes.includes(429), 'nad limitem 429');
  assert.ok(codes.slice(0, 50).every((c) => c === 404));
  assert.equal((await fetch(`${base}/api/share/${id}`)).status, 200, 'uložený odkaz jde otevřít dál');
  // stránka odkazu nad limitem: bez náhledu, ale přesměrování do aplikace funguje
  const page = await fetch(`${base}/c/Rndzzzzz`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<meta http-equiv="refresh" content="0;url=\/#s=Rndzzzzz">/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
});

test('robot náhledu (Facebook, WhatsApp) dostane stránku bez přesměrování, prohlížeč s přesměrováním', async () => {
  const r = await fetch(`${base}/api/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: 'trip', j: JSON.stringify(TRIP) }) });
  const { id } = await r.json();
  for (const ua of ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'WhatsApp/2.23.20.0 A']) {
    const html = await (await fetch(`${base}/c/${id}`, { headers: { 'User-Agent': ua } })).text();
    assert.match(html, /og:title" content="Tirana/, ua);
    assert.doesNotMatch(html, /http-equiv="refresh"/, ua);
  }
  const page = await fetch(`${base}/c/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile' } });
  assert.match(await page.text(), /http-equiv="refresh"/);
  assert.equal(page.headers.get('vary'), 'User-Agent');
});

test('aplikace: „vypršel“ jen u 404 (nebo nesmyslné odpovědi), výpadek sítě a 429 nabídnou Zkusit znovu se stejným #s=', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('async function shortFromHash()'), app.indexOf('async function openJedFromHash()'));
  assert.match(fn, /gone = r\.status === 404 \|\| r\.ok;/);
  assert.match(fn, /if \(gone\) toast\('Odkaz na cestu neexistuje nebo vypršel', 'err'\);/);
  assert.match(fn, /else toast\('Cestu z odkazu se teď nepodařilo načíst – zkontroluj připojení', 'err', 6000, \{ label: 'Zkusit znovu', run: \(\) => \{ location\.hash = `#s=\$\{m\[1\]\}`; \} \}\);/);
  // znovu přes hashchange: tam shortFromHash běží první
  assert.match(app, /window\.addEventListener\('hashchange', async \(\) => \{\s*await shortFromHash\(\);/);
});
