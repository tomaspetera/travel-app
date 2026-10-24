#!/usr/bin/env node
// Zátěžový test serveru v DEMO režimu (vymyšlená data, bez sítě) – jen na vlastním počítači, nikdy proti produkci.
// Spustí vlastní DEMO server na volném portu a pošle na něj naráz stovky požadavků (fetch + Promise.all), každý
// „uživatel“ s vlastní adresou (X-Forwarded-For). Výsledky a postup: docs/skalovani.md.
//
//   node scripts/load-test.mjs                                  všechny fáze kromě „users“
//   ONLY=users USERS=50,200 node scripts/load-test.mjs           návštěvníci aplikace (stránka, radar, fotky, plánovač)
//   RAMP_MS=60000 …                                             návštěvníci přicházejí během minuty (výchozí 2 s)
//   ONLY=search-same NS=50 node scripts/load-test.mjs            jen vybrané fáze, NS = počet hledání ve fázi
//   SERVER_CPUS=0 …                                             server jen na 1. jádře (taskset) – jako 1 CPU
//   CPU_QUOTA=0.1 …                                             server s desetinou jádra (cgroup, Linux a root) – jako Render zdarma
//   EDGE=1 …                                                    „users“ s Cloudflare před serverem: soubor s otiskem v adrese
//                                                               (immutable) jde na server jen poprvé, další ho mají z Cloudflare
//   AFTER_TTL=1 SEARCH_RESULT_TTL=10 …                          „users“ po vypršení hotových výsledků: radary všech návštěvníků
//                                                               se napřed jednou spočítají (rozehřátí, s CPU_QUOTA ještě na
//                                                               plném procesoru), pak se počká SEARCH_RESULT_TTL + 1 s a teprve
//                                                               přijdou návštěvníci. SEARCH_STALE_TTL=0 = bez staršího výsledku
//                                                               radaru (jako před 24. 10.). Kategorie „cards“ = od příchodu
//                                                               návštěvníka po karty radaru.
//
// DEMO zdroje dostanou prodlevu 75–225 ms na dotaz (DELAY_MS=150) jako skutečné aerolinky – bez ní by celé hledání
// proběhlo v jednom kuse a požadavky by se vůbec neprolínaly – a mezipaměť odpovědí jako skutečné zdroje (stejná trasa
// a termín podruhé bez prodlevy; PROVIDER_CACHE=0 bez ní). Server nemá síť (fetch hned selže) a fotky oblíbených
// měst má v mezipaměti jako ostrý server po pár hodinách provozu. Na řádek fáze: p50/p95 v ms (u „users“ po druzích
// požadavků), chyby podle stavu, healthzMax = nejdelší čekání obyčejného /healthz během fáze, smyčka událostí serveru
// (eld: p50/p99/max v ms z perf_hooks.monitorEventLoopDelay – jak dlouho čeká každý další požadavek, než na něj přijde
// řada), paměť (RSS v MB) a procesor serveru (ms).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const ROOT = new URL('..', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// fotky karet radaru: oblíbená města má ostrý server v mezipaměti (Wikipedie se ptá jen poprvé)
const CITIES = ['Řím', 'Barcelona', 'Londýn', 'Paříž', 'Milán', 'Neapol', 'Atény', 'Lisabon', 'Porto', 'Madrid', 'Malaga', 'Valencie',
  'Benátky', 'Bologna', 'Bari', 'Palermo', 'Catania', 'Split', 'Dubrovník', 'Tirana', 'Sofie', 'Bukurešť', 'Oslo', 'Stockholm'];

if (process.argv[2] === '--serve') {
  // Podřízený proces: DEMO server s prodlevou zdrojů na portu 0 (volný), port a měření pošle rodiči (IPC).
  process.env.ATLAS_MOCK = '1';
  globalThis.fetch = async () => { throw new Error('zátěžový test: bez sítě'); };
  const { createServer } = await import(new URL('server/index.js', ROOT));
  const { mockProviders } = await import(new URL('server/providers/mock.js', ROOT));
  const { cache } = await import(new URL('server/lib/cache.js', ROOT));
  for (const t of CITIES) cache.set(`ph6:wiki:${t}`, { u: `https://upload.wikimedia.org/demo/${encodeURIComponent(t)}.jpg`, by: '' }, 864e5);
  // Prodleva jen u dotazu, který zdroj ještě nemá v mezipaměti serveru (cache.wrap jako Ryanair 20 min, i s pojistkou
  // paměti); z mezipaměti nová kopie letů – skutečné zdroje je pokaždé znovu skládají z uložené odpovědi.
  // PROVIDER_CACHE=0: bez mezipaměti (prodleva u každého dotazu).
  const delay = Number(process.env.DELAY_MS ?? 150);
  const memo = process.env.PROVIDER_CACHE !== '0';
  for (const p of mockProviders) {
    const daily = p.daily;
    p.daily = async function (q) {
      if (!memo) {
        await sleep(delay * (0.5 + Math.random()));
        return daily.call(this, q);
      }
      const key = `load:${JSON.stringify([p.id, q.from, q.to, q.dateFrom, q.dateTo, q.near])}`;
      return structuredClone(await cache.wrap(key, 20 * 60e3, async () => {
        await sleep(delay * (0.5 + Math.random()));
        return daily.call(this, q);
      }));
    };
  }
  const eld = monitorEventLoopDelay({ resolution: 10 });
  eld.enable();
  process.on('message', (m) => {
    if (m !== 'stats') return;
    const ms = (ns) => Math.round(ns / 1e6);
    process.send({ eldP50: ms(eld.percentile(50)), eldP99: ms(eld.percentile(99)), eldMax: ms(eld.max) });
    eld.reset();
  });
  const server = createServer().listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
  process.on('SIGTERM', () => process.exit(0)); // řádný konec – s NODE_OPTIONS=--cpu-prof se uloží profil serveru
} else {
  const script = fileURLToPath(import.meta.url);
  const cpus = process.env.SERVER_CPUS;
  const args = cpus ? ['-c', cpus, process.execPath, script, '--serve'] : [script, '--serve'];
  const child = spawn(cpus ? 'taskset' : process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  // AFTER_TTL: desetina jádra až po rozehřátí (limitCpu v run) – jinak hned
  let group = null;
  const limitCpu = () => { if (process.env.CPU_QUOTA && !group) group = cpuQuota(child.pid, Number(process.env.CPU_QUOTA)); };
  if (process.env.AFTER_TTL !== '1') limitCpu();
  let waiting = null;
  const port = await new Promise((resolve, reject) => {
    child.on('message', (m) => {
      if (m && m.port) resolve(m.port);
      else if (waiting) { waiting(m); waiting = null; }
    });
    child.on('exit', () => reject(new Error('DEMO server nenaběhl')));
  });
  const stats = () => new Promise((r) => { waiting = r; child.send('stats'); });
  try {
    await run(`http://127.0.0.1:${port}`, child.pid, stats, limitCpu);
  } finally {
    child.kill();
    if (group) setTimeout(() => { try { rmdirSync(group); } catch { /* ještě se ukončuje */ } }, 500);
  }
}

/** Omezí procesor serveru na `share` jádra (cgroup v1 nebo v2; jen Linux s právem zápisu) → cesta ke skupině. */
function cpuQuota(pid, share) {
  const v2 = existsSync('/sys/fs/cgroup/cgroup.controllers');
  const dir = v2 ? `/sys/fs/cgroup/atlas-load-${pid}` : `/sys/fs/cgroup/cpu/atlas-load-${pid}`;
  mkdirSync(dir);
  const quota = Math.max(1000, Math.round(share * 100000));
  if (v2) writeFileSync(`${dir}/cpu.max`, `${quota} 100000`);
  else writeFileSync(`${dir}/cpu.cfs_quota_us`, String(quota));
  writeFileSync(`${dir}/cgroup.procs`, String(pid));
  console.log(`server: ${share} jádra (${dir})`);
  return dir;
}

async function run(base, pid, serverStats, limitCpu = () => {}) {
  const proc = (f) => { try { return readFileSync(`/proc/${pid}/${f}`, 'utf8'); } catch { return ''; } };
  // při spuštění přes taskset je server potomkem (taskset se nahradí – exec, takže PID zůstává)
  const rssMb = () => { const m = /VmRSS:\s+(\d+)/.exec(proc('status')); return m ? Math.round(m[1] / 1024) : null; };
  const cpuMs = () => { const f = proc('stat').split(') ')[1]?.split(' '); return f ? (Number(f[11]) + Number(f[12])) * 10 : null; };
  const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
  const ymd = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

  async function timed(send, cat = '') {
    const t0 = performance.now();
    try {
      const r = await send();
      const text = await r.text();
      // hledání: chyba může přijít až uvnitř streamu (poslední řádek není výsledek)
      const ok = (r.ok || r.status === 304) && (!/ndjson/.test(r.headers.get('content-type') || '') || JSON.parse(text.trim().split('\n').at(-1)).type === 'result');
      return { cat, ms: performance.now() - t0, ok, status: ok ? r.status : r.ok ? 'stream' : r.status, text, cc: r.headers.get('cache-control') };
    } catch (e) {
      return { cat, ms: performance.now() - t0, ok: false, status: e.cause?.code || e.name };
    }
  }

  async function phase(name, n, body) {
    await serverStats(); // vynulovat měření smyčky událostí
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
    const res = (await body()).flat();
    running = false;
    await poller;
    clearInterval(sampler);
    const s = await serverStats();
    const summary = (list) => {
      const ms = list.map((r) => r.ms);
      const errors = {};
      for (const r of list) if (!r.ok) errors[r.status] = (errors[r.status] || 0) + 1;
      return { n: list.length, p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), max: Math.round(Math.max(...ms)), ...(Object.keys(errors).length ? { errors } : {}) };
    };
    const cats = [...new Set(res.map((r) => r.cat).filter(Boolean))];
    console.log(JSON.stringify({
      phase: name, n, wallMs: Math.round(performance.now() - t0),
      ...(cats.length ? { byKind: Object.fromEntries(cats.map((c) => [c, summary(res.filter((r) => r.cat === c))])) } : summary(res)),
      healthzMax: Math.round(Math.max(...hz)), eld: { p50: s.eldP50, p99: s.eldP99, max: s.eldMax },
      serverCpuMs: cpuMs() - cpu0, rssPeakMb: peak, rssAfterMb: rssMb(),
    }));
  }
  const all = (n, send) => () => Promise.all(Array.from({ length: n }, (_, i) => timed(() => send(i))));

  const NS = Number(process.env.NS || 100);
  const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
  const want = (x) => (ONLY.length ? ONLY.includes(x) : x !== 'users');
  const ip = (i, net) => `10.${net}.${(i >> 8) & 255}.${i & 255}`;
  const post = (body, addr, path = '/api/search') => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'br, gzip', 'x-forwarded-for': addr }, body: JSON.stringify(body) });
  const STATIC = ['/', '/js/app.js', '/js/flights.js', '/css/flights.css', '/vendor/d3.min.js', '/js/trip.js'];
  const HOMES = ['ap:BRQ', 'ap:PRG', 'ap:VIE', 'ap:BUD', 'ap:WAW', 'ap:KRK', 'ap:BTS', 'ap:MUC', 'ap:BER', 'ap:FRA'];
  const same = { from: ['ap:PRG'], radiusKm: 200, dateFrom: ymd(10), dateTo: ymd(40), trip: 'return', nightsMin: 2, nightsMax: 6, adults: 1 };

  if (want('health')) await phase('health', 1000, all(1000, (i) => fetch(`${base}/api/health`, { headers: { 'accept-encoding': 'br, gzip', 'x-forwarded-for': ip(i, 1) } })));
  if (want('static')) await phase('static', 1000, all(1000, (i) => fetch(`${base}${STATIC[i % STATIC.length]}`, { headers: { 'accept-encoding': i % 2 ? 'br, gzip' : 'gzip' } })));
  // polovina stejných hledání (sdílí jeden běh), polovina různých (jiný domov a termín)
  if (want('search-mix')) await phase('search-mix', NS, all(NS, (i) => post(i % 2 ? same : { ...same, from: [HOMES[i % HOMES.length]], dateTo: ymd(30 + (i % 25)) }, ip(i, 2))));
  if (want('search-same')) await phase('search-same', NS, all(NS, (i) => post({ ...same, dateTo: ymd(41) }, ip(i, 3))));
  // 60 různých hledání z jedné adresy: nad stropem rozběhnutých hledání na adresu (SEARCH_PER_CLIENT) hned 429
  if (want('search-1ip')) await phase('search-1ip', 60, all(60, (i) => post({ ...same, dateTo: ymd(20 + i) }, '10.99.99.99')));

  if (want('users')) {
    const { shellAssets, RUNTIME_ASSETS } = await import(new URL('server/lib/pwa.js', ROOT));
    // adresy jako v prohlížeči: ze stránky od serveru (skripty a styly s otiskem obsahu – server/lib/pwa.js versionAssets)
    const shell = shellAssets(await (await fetch(`${base}/`)).text());
    const assets = ['/sw.js', ...[...shell, ...RUNTIME_ASSETS].map((u) => `/${u}`)];
    // EDGE=1: Cloudflare před serverem – soubor s otiskem v adrese (immutable) jde na server jen poprvé, další návštěvníci
    // ho mají z Cloudflare (kategorie „edge“). Každá fáze začíná s prázdným Cloudflare jako po nasazení nové verze.
    const EDGE = process.env.EDGE === '1';
    let edge = new Set();
    // ETagy jako u vracejícího se návštěvníka (brotli podoba souboru)
    const etags = {};
    for (const a of ['/', ...assets]) etags[a] = (await fetch(`${base}${a}`, { headers: { 'accept-encoding': 'br, gzip' } }).then(async (r) => { await r.arrayBuffer(); return r.headers.get('etag'); }));
    // Domovy návštěvníků: většina z Prahy a Brna – stejný radar sdílí běh, různé domovy ne
    const HOME_W = [['ap:PRG', 45], ['ap:BRQ', 15], ['ap:OSR', 10], ['ap:VIE', 10], ['ap:PED', 5], ['ap:KTW', 5], ['ap:BTS', 5], ['ap:DRS', 5]];
    const homeOf = (i) => { let x = (i * 37) % 100; for (const [h, w] of HOME_W) { if (x < w) return h; x -= w; } return 'ap:PRG'; };
    const DEST = [['FCO', 'Řím', 41.9, 12.5], ['BCN', 'Barcelona', 41.39, 2.17], ['LIS', 'Lisabon', 38.72, -9.14], ['ATH', 'Atény', 37.98, 23.73], ['NAP', 'Neapol', 40.85, 14.27], ['OPO', 'Porto', 41.15, -8.61]];
    const radar = (home, mode) => ({
      from: [home], radiusKm: 200, to: [], dateFrom: ymd(3), dateTo: ymd(45), trip: 'return', ...(mode === 'weekend' ? { nightsMin: 1, nightsMax: 3, outDays: [5, 6], backDays: [0, 1] } : { nightsMin: 2, nightsMax: 7 }),
      adults: 1, kmRate: 1, groundMode: 'transit', arrival: true, noPartial: true, radar: true, // jako aplikace (flights.js radarSearch)
    });
    const think = () => sleep(Math.random() * 300);
    // jeden návštěvník: stránka (nový stáhne všechno, vracející se jen ověří stránku a service worker), stav serveru,
    // našeptávač, radar, fotky karet, podnebí, ubytování a program v plánovači
    const radarOf = (i) => radar(homeOf(i), i % 10 < 7 ? 'all' : 'weekend');
    async function visit(i) {
      await sleep(Math.random() * Number(process.env.RAMP_MS ?? 2000));
      const tv = performance.now();
      const addr = ip(i, 7);
      const h = { 'accept-encoding': 'br, gzip', 'x-forwarded-for': addr };
      const get = (cat, u, extra = {}) => timed(() => fetch(`${base}${u}`, { headers: { ...h, ...extra } }), cat);
      const out = [];
      const fresh = i % 3 === 0;
      out.push(await get('page', '/', fresh ? {} : { 'if-none-match': etags['/'] }));
      const list = fresh ? assets : ['/sw.js'];
      const file = async (a) => {
        if (EDGE && edge.has(a)) return { cat: 'edge', ms: 0, ok: true, status: 200 };
        const x = await get('static', a, fresh ? {} : { 'if-none-match': etags[a] });
        if (EDGE && /\bimmutable\b/.test(x.cc || '')) edge.add(a);
        return x;
      };
      for (let k = 0; k < list.length; k += 6) out.push(...await Promise.all(list.slice(k, k + 6).map(file)));
      out.push(await get('api', '/api/health'));
      const home = homeOf(i);
      const [iata, city, lat, lon] = DEST[i % DEST.length];
      for (const q of [city.slice(0, 2), city]) out.push(await get('api', `/api/places?q=${encodeURIComponent(q)}&role=to&near=${encodeURIComponent(home)}`));
      await think();
      const r = await timed(() => post(radarOf(i), addr), 'search');
      delete r.text;
      out.push(r, { cat: 'cards', ms: performance.now() - tv, ok: r.ok, status: r.status });
      const photos = Array.from({ length: 12 }, (_, k) => CITIES[(i + k) % CITIES.length]).join('|');
      out.push(await get('api', `/api/photos?t=${encodeURIComponent(photos)}`));
      out.push(await get('api', `/api/climate?iata=${iata}`), await get('api', `/api/climate?month=${(i % 12) + 1}`));
      await think();
      const checkin = ymd(30);
      const checkout = ymd(34);
      out.push(await get('trip', `/api/stays?${new URLSearchParams({ city, iata, checkin, checkout, adults: 2, lat, lon })}`));
      out.push(await get('trip', `/api/nature?lat=${lat}&lon=${lon}`));
      out.push(await timed(() => post({ lat, lon, start: checkin, end: checkout, arrivalTime: '10:00', departureTime: '18:00', pace: 'normal', interests: {}, exclude: [], include: [] }, addr, '/api/itinerary'), 'trip'));
      for (const x of out) delete x.text;
      return out;
    }
    const searches = async () => (await (await fetch(`${base}/api/health`)).json()).searches;
    const AFTER_TTL = process.env.AFTER_TTL === '1';
    for (const n of (process.env.USERS || '50,200').split(',').map(Number)) {
      edge = new Set();
      if (AFTER_TTL) {
        // radary, které návštěvníci budou chtít, se napřed spočítají (různé dotazy po jednom, naráz) a pak vyprší
        const qs = [...new Map(Array.from({ length: n }, (_, i) => radarOf(i + n * 1000)).map((b) => [JSON.stringify(b), b])).values()];
        const t0 = performance.now();
        const warm = await Promise.all(qs.map((b, k) => timed(() => post(b, ip(k, 8)))));
        const ttl = Number(process.env.SEARCH_RESULT_TTL ?? 120);
        console.log(JSON.stringify({ warm: qs.length, ok: warm.filter((r) => r.ok).length, wallMs: Math.round(performance.now() - t0), waitS: ttl + 1 }));
        await sleep((ttl + 1) * 1000);
        limitCpu();
      }
      await phase(`users-${n}${EDGE ? '-edge' : ''}${AFTER_TTL ? '-after-ttl' : ''}`, n, () => Promise.all(Array.from({ length: n }, (_, i) => visit(i + n * 1000))));
      console.log(JSON.stringify({ searches: await searches() }));
      if (AFTER_TTL) {
        // přepočty starších výsledků na pozadí (a dobíhající hledání): za jak dlouho po fázi doběhly a kolik procesoru vzaly
        const t0 = performance.now();
        const cpu0 = cpuMs();
        for (let s = await searches(); s.active || s.queued || s.shared; s = await searches()) await sleep(1000);
        console.log(JSON.stringify({ settledMs: Math.round(performance.now() - t0), serverCpuMs: cpuMs() - cpu0, searches: await searches() }));
      }
    }
  }
}
