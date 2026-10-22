#!/usr/bin/env node
// Zátěžový test serveru v DEMO režimu (vymyšlená data, bez sítě) – jen na vlastním počítači, nikdy proti produkci.
// Spustí vlastní DEMO server na volném portu a pošle na něj naráz stovky požadavků (fetch + Promise.all), každý
// „uživatel“ s vlastní adresou (X-Forwarded-For). Výsledky a postup: docs/skalovani.md.
//
//   node scripts/load-test.mjs                         všechny fáze
//   ONLY=search-same NS=50 node scripts/load-test.mjs   jen vybrané fáze, NS = počet hledání ve fázi
//
// DEMO zdroje dostanou prodlevu 75–225 ms na dotaz (DELAY_MS=150) jako skutečné aerolinky – bez ní by celé hledání
// proběhlo v jednom kuse a požadavky by se vůbec neprolínaly. Na řádek fáze: p50/p95 v ms, chyby podle stavu,
// healthzMax = nejdelší čekání obyčejného /healthz během fáze, paměť (RSS v MB) a procesor serveru (Linux, /proc).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv[2] === '--serve') {
  // Podřízený proces: DEMO server s prodlevou zdrojů na portu 0 (volný), port pošle rodiči na stdout.
  process.env.ATLAS_MOCK = '1';
  const { createServer } = await import(new URL('server/index.js', ROOT));
  const { mockProviders } = await import(new URL('server/providers/mock.js', ROOT));
  const delay = Number(process.env.DELAY_MS ?? 150);
  for (const p of mockProviders) {
    const daily = p.daily;
    p.daily = async function (q) {
      await sleep(delay * (0.5 + Math.random()));
      return daily.call(this, q);
    };
  }
  const server = createServer().listen(0, '127.0.0.1', () => console.log(`PORT ${server.address().port}`));
} else {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { const m = /PORT (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); });
    child.on('exit', () => reject(new Error('DEMO server nenaběhl')));
  });
  try {
    await run(`http://127.0.0.1:${port}`, child.pid);
  } finally {
    child.kill();
  }
}

async function run(base, pid) {
  const proc = (f) => { try { return readFileSync(`/proc/${pid}/${f}`, 'utf8'); } catch { return ''; } };
  const rssMb = () => { const m = /VmRSS:\s+(\d+)/.exec(proc('status')); return m ? Math.round(m[1] / 1024) : null; };
  const cpuMs = () => { const f = proc('stat').split(') ')[1]?.split(' '); return f ? (Number(f[11]) + Number(f[12])) * 10 : null; };
  const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
  const ymd = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

  async function timed(send) {
    const t0 = performance.now();
    try {
      const r = await send();
      const text = await r.text();
      // hledání: chyba může přijít až uvnitř streamu (poslední řádek není výsledek)
      const ok = r.ok && (!/ndjson/.test(r.headers.get('content-type') || '') || JSON.parse(text.trim().split('\n').at(-1)).type === 'result');
      return { ms: performance.now() - t0, ok, status: ok ? r.status : r.ok ? 'stream' : r.status };
    } catch (e) {
      return { ms: performance.now() - t0, ok: false, status: e.cause?.code || e.name };
    }
  }

  async function phase(name, n, send) {
    let peak = rssMb();
    const sampler = setInterval(() => { peak = Math.max(peak, rssMb() || 0); }, 50);
    const cpu0 = cpuMs();
    const t0 = performance.now();
    let running = true;
    const hz = [];
    const poller = (async () => {
      while (running) {
        const t = performance.now();
        await fetch(`${base}/healthz`).then((r) => r.text(), () => null);
        hz.push(performance.now() - t);
        await sleep(100);
      }
    })();
    const res = await Promise.all(Array.from({ length: n }, (_, i) => timed(() => send(i))));
    running = false;
    await poller;
    clearInterval(sampler);
    const ms = res.map((r) => r.ms);
    const errors = {};
    for (const r of res) if (!r.ok) errors[r.status] = (errors[r.status] || 0) + 1;
    console.log(JSON.stringify({
      phase: name, n, wallMs: Math.round(performance.now() - t0), p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), errors,
      healthzMax: Math.round(Math.max(...hz)), serverCpuMs: cpuMs() - cpu0, rssPeakMb: peak, rssAfterMb: rssMb(),
    }));
  }

  const NS = Number(process.env.NS || 100);
  const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
  const want = (x) => !ONLY.length || ONLY.includes(x);
  const ip = (i, net) => `10.${net}.${(i >> 8) & 255}.${i & 255}`;
  const post = (body, addr) => fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'br, gzip', 'x-forwarded-for': addr }, body: JSON.stringify(body) });
  const STATIC = ['/', '/js/app.js', '/js/flights.js', '/css/flights.css', '/vendor/d3.min.js', '/js/trip.js'];
  const HOMES = ['ap:BRQ', 'ap:PRG', 'ap:VIE', 'ap:BUD', 'ap:WAW', 'ap:KRK', 'ap:BTS', 'ap:MUC', 'ap:BER', 'ap:FRA'];
  const same = { from: ['ap:PRG'], radiusKm: 200, dateFrom: ymd(10), dateTo: ymd(40), trip: 'return', nightsMin: 2, nightsMax: 6, adults: 1 };

  if (want('health')) await phase('health', 1000, (i) => fetch(`${base}/api/health`, { headers: { 'accept-encoding': 'br, gzip', 'x-forwarded-for': ip(i, 1) } }));
  if (want('static')) await phase('static', 1000, (i) => fetch(`${base}${STATIC[i % STATIC.length]}`, { headers: { 'accept-encoding': i % 2 ? 'br, gzip' : 'gzip' } }));
  // polovina stejných hledání (sdílí jeden běh), polovina různých (jiný domov a termín)
  if (want('search-mix')) await phase('search-mix', NS, (i) => post(i % 2 ? same : { ...same, from: [HOMES[i % HOMES.length]], dateTo: ymd(30 + (i % 25)) }, ip(i, 2)));
  if (want('search-same')) await phase('search-same', NS, (i) => post({ ...same, dateTo: ymd(41) }, ip(i, 3)));
  // 60 různých hledání z jedné adresy: nad stropem rozběhnutých hledání na adresu (SEARCH_PER_CLIENT) hned 429
  if (want('search-1ip')) await phase('search-1ip', 60, (i) => post({ ...same, dateTo: ymd(20 + i) }, '10.99.99.99'));
}
