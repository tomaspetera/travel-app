// Bezpečnost veřejného serveru (DEMO): hlavičky a CSP stránky, adresa klienta pro limity (podvržená X-Forwarded-For),
// API z cizích webů, limity fotek a geokódování, tělo požadavku, texty chyb bez detailů, skryté soubory.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { config } = await import('../server/config.js');
const { cache } = await import('../server/lib/cache.js');
const { ipKey, clientIp, pageCsp, inlineScriptHashes, SECURITY_HEADERS } = await import('../server/lib/security.js');
const { publicMessage, HttpError } = await import('../server/lib/http.js');

const PUBLIC = new URL('../public/', import.meta.url);
const realFetch = globalThis.fetch;
let server, base, port;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});
after(() => server.close());

const get = (path, headers = {}) => realFetch(`${base}${path}`, { headers });
/** Surový požadavek (fetch by „..“ normalizoval a velké tělo neposlal celé) → { status, headers, body }. */
function raw(path, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('ipKey: IPv4 celá, IPv6 po /64 (stejná síť = stejný klíč), IPv4 v IPv6 jako IPv4, nesmysl a dlouhý text nic', () => {
  assert.equal(ipKey('203.0.113.7'), '203.0.113.7');
  assert.equal(ipKey(' 203.0.113.7 '), '203.0.113.7');
  assert.equal(ipKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(ipKey('[2001:db8:1:2::5]'), '2001:db8:1:2::/64');
  assert.equal(ipKey('2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64', 'jiná adresa ze stejné /64');
  assert.equal(ipKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(ipKey('::1'), '0:0:0:0::/64');
  assert.notEqual(ipKey('2001:db8:1:3::5'), ipKey('2001:db8:1:2::5'), 'sousední /64 je jiný klíč');
  for (const bad of ['', 'x', 'unknown', '999.1.1.1', '1.2.3', '1:2:3', '1::2::3', 'g::1', '1.2.3.4::1', 'a'.repeat(65), '1.2.3.4 , 5.6.7.8', null, undefined]) {
    assert.equal(ipKey(bad), '', String(bad).slice(0, 20));
  }
});

test('clientIp: CF-Connecting-IP (Cloudflare před Renderem) má přednost před podvrhnutelnou X-Forwarded-For', () => {
  const req = (headers, remote = '10.0.0.1') => ({ headers, socket: { remoteAddress: remote } });
  assert.equal(clientIp(req({ 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': '1.1.1.1, 198.51.100.9' })), '198.51.100.9');
  assert.equal(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 10.0.0.2' })), '1.1.1.1', 'bez Cloudflare první z X-Forwarded-For (místně, testy)');
  assert.equal(clientIp(req({ 'cf-connecting-ip': 'nesmysl', 'x-forwarded-for': '1.1.1.1' })), '1.1.1.1');
  assert.equal(clientIp(req({ 'x-forwarded-for': 'x'.repeat(8000) })), '10.0.0.1', 'dlouhý podvržený klíč ne – adresa spojení');
  assert.equal(clientIp(req({}, '::ffff:127.0.0.1')), '127.0.0.1');
});

test('podvržená X-Forwarded-For limit neobejde: stejná adresa od Cloudflare = stejný limit, IPv6 po /64', async () => {
  const q = '/api/verify?from=PRG&to=BCN&out=2030-01-10';
  const n = config.verifiesPer10Min;
  for (let i = 0; i < n; i++) {
    const r = await get(q, { 'cf-connecting-ip': '198.51.100.20', 'x-forwarded-for': `9.9.${i % 250}.${i >> 8}, 198.51.100.20` });
    assert.equal(r.status, 200, `požadavek ${i + 1}`);
  }
  const over = await get(q, { 'cf-connecting-ip': '198.51.100.20', 'x-forwarded-for': '7.7.7.7' });
  assert.equal(over.status, 429, 'jiná „adresa“ v X-Forwarded-For limit neobejde');
  assert.ok(+over.headers.get('retry-after') > 0);
  assert.equal((await get(q, { 'cf-connecting-ip': '198.51.100.21' })).status, 200, 'jiný klient má vlastní limit');
  for (let i = 0; i < n; i++) await get(q, { 'cf-connecting-ip': `2001:db8:77:1::${(i + 1).toString(16)}` });
  assert.equal((await get(q, { 'cf-connecting-ip': '2001:db8:77:1:ffff::1' })).status, 429, 'další adresa ze stejné /64');
});

test('hlavičky: nosniff, rám, Referrer-Policy, HSTS a Permissions-Policy všude; CSP stránky s otisky vložených skriptů', async () => {
  for (const p of ['/', '/js/app.js', '/css/atlas.css', '/api/health', '/sw.js', '/neznama-stranka']) {
    const r = await get(p);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers.get(k), v, `${p}: ${k}`);
    assert.equal(r.headers.get('access-control-allow-origin'), null, `${p}: žádné CORS`);
  }
  const page = await get('/');
  const csp = page.headers.get('content-security-policy');
  const html = await page.text();
  const dir = Object.fromEntries(csp.split(/;\s*/).map((d) => { const [k, ...v] = d.split(' '); return [k, v]; }));
  // otisky přesně z obsahu vložených skriptů stránky (nezávisle na security.js)
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  assert.ok(scripts.length >= 3, 'polyfilly, motiv, písmo');
  assert.deepEqual(dir['script-src'], ["'self'", ...scripts]);
  assert.ok(!dir['script-src'].includes("'unsafe-inline'") && !dir['script-src'].includes("'unsafe-eval'"), 'žádné vložené obsluhy ani eval');
  assert.deepEqual(dir['frame-ancestors'], ["'none'"]);
  assert.deepEqual(dir['object-src'], ["'none'"]);
  assert.deepEqual(dir['base-uri'], ["'self'"]);
  assert.ok(dir['worker-src'].includes('blob:'), 'MapLibre worker z blob:');
  for (const host of ['https://tiles.openfreemap.org', 'https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com', 'https://open.er-api.com']) assert.ok(dir['connect-src'].includes(host), host);
  assert.ok(dir['style-src'].includes('https://fonts.googleapis.com') && dir['font-src'].includes('https://fonts.gstatic.com'));
  assert.match((await get('/api/health')).headers.get('content-security-policy'), /^default-src 'none'; frame-ancestors 'none'$/);
  assert.equal(pageCsp('<script src="a.js"></script><script>x()</script>'), pageCsp('<script>x()</script>'), 'skript se src se nehashuje');
  assert.deepEqual(inlineScriptHashes('<script>a\r\nb</script>'), inlineScriptHashes('<script>a\nb</script>'), 'konce řádků jako po parseru HTML');
});

test('aplikace nemá obsluhy událostí v HTML (onclick="…" atd.) ani javascript: odkazy – CSP by je zablokovala', () => {
  const files = ['index.html', ...readdirSync(new URL('js/', PUBLIC)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)];
  for (const f of files) {
    const src = readFileSync(new URL(f, PUBLIC), 'utf8');
    const m = src.match(/\son[a-z]+\s*=\s*["'`]/i);
    assert.equal(m, null, `${f}: ${m && src.slice(m.index - 40, m.index + 40)}`);
    assert.doesNotMatch(src, /href="javascript:/i, f);
  }
});

test('API z cizího webu (Sec-Fetch-Site: cross-site) 403, z ATLASu a otevření odkazem ano', async () => {
  // surové požadavky: fetch v Node si Sec-Fetch-Mode nastaví sám
  const cross = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' };
  const r = await raw('/api/client-error', { method: 'POST', headers: { ...cross, 'content-type': 'text/plain' }, body: JSON.stringify({ msg: 'cizí' }) });
  assert.equal(r.status, 403);
  assert.match(JSON.parse(r.body).error, /jen z aplikace ATLAS/);
  assert.equal((await raw('/api/poi?lat=50&lon=14', { headers: { ...cross, 'x-forwarded-for': '10.88.0.1' } })).status, 403);
  assert.equal((await raw('/api/health', { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' } })).status, 200, 'odkaz z jiného webu');
  assert.equal((await raw('/api/health', { headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' } })).status, 200);
  assert.equal((await raw('/api/health')).status, 200, 'bez hlaviček (curl, starší prohlížeč)');
  assert.equal((await raw('/', { headers: cross })).status, 200, 'stránka a soubory se neomezují');
});

test('fotky měst: dotazy mimo mezipaměť jen do limitu z adresy, odpověď z mezipaměti vždy', async () => {
  // Wikipedie „neodpovídá“ (404) → nic se neuloží a každý další dotaz jde znovu ven
  let calls = 0;
  globalThis.fetch = async (url, init) => (String(url).startsWith(base) ? realFetch(url, init) : (calls++, new Response('{}', { status: 404 })));
  const max = config.photosPer10Min;
  config.photosPer10Min = 3;
  try {
    const h = { 'cf-connecting-ip': '198.51.100.40' };
    for (let i = 0; i < 3; i++) assert.equal((await get(`/api/photos?t=Mesto${i}x|Jine${i}y`, h)).status, 200);
    const over = await get('/api/photos?t=Mesto9x', h);
    assert.equal(over.status, 429);
    assert.ok((await over.json()).error);
    assert.equal(calls, 3, 'nad limitem žádný dotaz na Wikipedii');
    cache.set('ph6:wiki:Praha', { u: 'https://upload.wikimedia.org/praha.jpg', by: '' }, 60e3);
    const hit = await get('/api/photos?t=Praha', h);
    assert.equal(hit.status, 200, 'z mezipaměti i nad limitem');
    assert.equal((await hit.json()).photos.Praha, 'https://upload.wikimedia.org/praha.jpg');
    assert.equal((await get('/api/photos?t=Mesto9x', { 'cf-connecting-ip': '198.51.100.41' })).status, 200, 'jiná adresa');
  } finally {
    config.photosPer10Min = max;
    globalThis.fetch = realFetch;
  }
});

test('geokódování (Open-Meteo) mimo mezipaměť jen do limitu: našeptávač pak z vlastních dat, hledání míst 429', async () => {
  const mock = config.mock, max = config.geocodePer10Min;
  config.mock = false;
  config.geocodePer10Min = 2;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(base)) return realFetch(url, init);
    calls++;
    const name = new URL(url).searchParams.get('name');
    return new Response(JSON.stringify({ results: [{ id: 1, name, latitude: 45.1, longitude: 9.2, country_code: 'IT', country: 'Itálie', population: 20000, feature_code: 'PPL' }] }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const h = { 'cf-connecting-ip': '198.51.100.50' };
    const a = await (await get('/api/geocode?q=Qzvbtown', h)).json();
    assert.equal(a.items[0].label, 'Qzvbtown');
    assert.equal((await get('/api/places?q=Qzvbvilla', h)).status, 200);
    assert.equal(calls, 2);
    const lim = await get('/api/geocode?q=Qzvbcity', h);
    assert.equal(lim.status, 429, 'nad limitem a nic z vlastních dat');
    const sug = await (await get('/api/places?q=Qzvbplace', h)).json();
    assert.equal(sug.partial, true, 'našeptávač: jen vlastní data, jako při výpadku');
    assert.equal(calls, 2, 'nad limitem žádný dotaz na Open-Meteo');
    assert.equal((await (await get('/api/geocode?q=Qzvbtown', h)).json()).items[0].label, 'Qzvbtown', 'z mezipaměti i nad limitem');
    assert.equal((await get('/api/geocode?q=Qzvbcity', { 'cf-connecting-ip': '198.51.100.51' })).status, 200, 'jiná adresa');
    // výpadek Open-Meteo: česky a bez adresy API
    globalThis.fetch = async (url, init) => (String(url).startsWith(base) ? realFetch(url, init) : new Response('x', { status: 500 }));
    const down = await get('/api/geocode?q=Qzvbdown', { 'cf-connecting-ip': '198.51.100.52' });
    assert.equal(down.status, 502);
    assert.doesNotMatch(await down.text(), /https?:|open-meteo/i);
  } finally {
    Object.assign(config, { mock, geocodePer10Min: max });
    globalThis.fetch = realFetch;
  }
});

test('tělo požadavku: null / pole → 400 (ne „Cannot read properties“), nad 64 kB → 413 s odpovědí, neplatný JSON 400', async () => {
  for (const body of ['null', '[]', '7']) {
    const r = await realFetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.88.1.1' }, body });
    assert.equal(r.status, 400, body);
    assert.deepEqual(await r.json(), { error: 'Neplatný JSON' });
  }
  const big = await raw('/api/itinerary', { method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"x":"${'a'.repeat(70 * 1024)}"}` });
  assert.equal(big.status, 413);
  assert.equal(JSON.parse(big.body).error, 'Příliš velký požadavek');
  const bad = await raw('/api/roadtrip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400);
});

test('texty chyb pro aplikaci bez adres zdrojů dat; skryté soubory v public/ se neposílají', async () => {
  assert.equal(publicMessage(new HttpError(503, 'https://api.example.com/v1/search?key=tajne', '')), 'HTTP 503 (zdroj dat)');
  assert.equal(publicMessage(new Error('Timeout 8000 ms: https://data.xotelo.com/api/rates')), 'Timeout 8000 ms: (zdroj dat)');
  assert.equal(publicMessage('x'.repeat(500)).length, 200);
  const name = `.atlas-test-skryty-${process.pid}.txt`;
  const file = new URL(name, PUBLIC);
  writeFileSync(file, 'TAJNE');
  try {
    for (const p of [`/${name}`, `/%2e${name.slice(1)}`]) {
      const r = await raw(p);
      assert.doesNotMatch(r.body, /TAJNE/, p);
      assert.equal(r.status, 404, `${p}: jako neznámá adresa`);
      assert.match(r.headers['content-type'], /text\/html/, `${p}: stránka 404 jako u neznámé adresy`);
    }
  } finally {
    unlinkSync(file);
  }
  for (const p of ['/../server/config.js', '/..%2fserver%2fconfig.js', '/%2e%2e/%2e%2e/package.json', '/js/..%5c..%5cserver%5cconfig.js', '/js%00.js']) {
    const r = await raw(p);
    assert.doesNotMatch(r.body, /export const config|"name": "atlas-travel"/, p);
  }
});
