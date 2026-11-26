// Záznam průchodu návštěvou – jen u lidí, kteří v aplikaci sami zapnou „Pomáhat se zlepšováním“ (public/js/count.js →
// POST /api/trace; čtení GET /api/traces za STATS_KEY, stránka Statistiky → Cesty návštěv). Záznam je pořadí obrazovek
// a hlavních akcí z pevného seznamu (EVENTS bez nabídky Plus, průzkumu ceny a odpovědí na otázky) se sekundami od
// začátku a náhodné ID návštěvy, které existuje jen v paměti otevřené stránky. Žádný text, místo, cena, IP adresa ani
// údaj o prohlížeči – nic z toho sem nedorazí, cleanTrace() pustí jen čísla a názvy ze seznamu.
// Úložiště jako počty (counts.js): Upstash hash tr:<den UTC> (pole = ID návštěvy, hodnota = JSON kroků), doba života
// 30 dní od posledního zápisu dne – smaže se tak nejpozději do 31 dnů. Nejvýš CAP návštěv za den. Do Upstash se píše
// jednou za 30 minut (HLEN + HSET + EXPIRE = 3 příkazy), ať záznam neubírá ze stropu krátkých odkazů. Bez Upstash paměť
// procesu (demo, testy – po restartu prázdné).
import { request } from './http.js';
import { EVENTS, SERVER_EVENTS, FLUSH_MS } from './counts.js';

export const CAP = 300; // návštěv za den – strop přežije restart serveru (HLEN před zápisem)
export const HOUR_CAP = 25; // nových návštěv za hodinu (dvojnásobek průměru dne – špička projde)
export const MAX_STEPS = 120;
export const MAX_BODY = 4096;
export const TTL_SEC = 30 * 86400;
const KEY = 'tr:';
const DAY_MS = 86400e3;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// Do záznamu nesmí ochota platit a odpovědi na otázky (zásady 3.7): spojené s chováním jedné návštěvy by řekly víc,
// než slibuje karta souhlasu. Serverové počty prohlížeč neposílá, tak nemají co dělat ani tady.
// 📒 Sešit cesty je taky nabídka Plus (plus.js), proto i sesit_*.
export const traceExcluded = (e) => /^(price_|plus_|limit_|sesit_|mq_)/.test(e) || e === 'look_letsi' || SERVER_EVENTS.includes(e);
export const TRACE_EVENTS = EVENTS.filter((e) => !traceExcluded(e));

/**
 * Tělo z prohlížeče → { id, steps } (kroky [[sekund, název], …]), { id, del: true } (odvolání souhlasu) nebo null.
 * Cokoli mimo pravidla se zahodí celé: id 8 znaků [a-z0-9], 1–120 kroků, sekundy celé, neklesající, 0–86 400, názvy
 * jen z TRACE_EVENTS – text, místo ani cena se tak do záznamu dostat nemůže.
 */
export function cleanTrace(b) {
  if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !/^[a-z0-9]{8}$/.test(b.id)) return null;
  if (b.del === 1) return { id: b.id, del: true };
  const s = b.s;
  if (!Array.isArray(s) || !s.length || s.length > MAX_STEPS) return null;
  let prev = 0;
  for (const x of s) {
    if (!Array.isArray(x) || x.length !== 2) return null;
    const [t, e] = x;
    if (!Number.isInteger(t) || t < prev || t > 86400 || !TRACE_EVENTS.includes(e)) return null;
    prev = t;
  }
  return { id: b.id, steps: s.map(([t, e]) => [t, e]) };
}

/** Upstash Redis přes REST (jako counts.js upstashCounts): příkazy po pipeline. */
export function upstashTraces(url, token, req = request) {
  const pipe = (cmds, retries = 1) => req(url + '/pipeline', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: cmds, timeoutMs: 6000, retries })
    .then((r) => { if (!Array.isArray(r)) throw new Error('Upstash: nečekaná odpověď'); return r.map((x) => x && x.result); });
  return {
    kind: 'upstash',
    hlen: (key) => pipe([['HLEN', key]]).then(([n]) => Number(n) || 0),
    write: (key, pairs, ttl) => pipe([['HSET', key, ...pairs.flat()], ['EXPIRE', key, String(ttl)]]),
    // HGETALL vrací [pole, hodnota, pole, hodnota, …]
    read: (keys) => pipe(keys.map((k) => ['HGETALL', k])).then((r) => r.map((a) => {
      const m = new Map();
      for (let i = 0; Array.isArray(a) && i + 1 < a.length; i += 2) m.set(a[i], a[i + 1]);
      return m;
    })),
    // [[klíč, [id, …]], …] → jedno HDEL na den se všemi odvolanými návštěvami
    del: (byKey) => pipe(byKey.map(([k, ids]) => ['HDEL', k, ...ids])),
  };
}

/** Úložiště v paměti: doba života se nehlídá (po restartu je stejně prázdné), čtení bere jen dny, na které se ptá. */
export function memoryTraces() {
  const m = new Map(); // klíč → Map(id → JSON)
  const h = (k) => { if (!m.has(k)) m.set(k, new Map()); return m.get(k); };
  return {
    kind: 'memory',
    hlen: async (key) => (m.get(key) || new Map()).size,
    write: async (key, pairs) => { for (const [id, v] of pairs) h(key).set(id, v); },
    read: async (keys) => keys.map((k) => new Map(m.get(k) || [])),
    del: async (byKey) => { for (const [k, ids] of byKey) if (m.has(k)) for (const id of ids) m.get(k).delete(id); },
  };
}

/**
 * Záznamy nad úložištěm. add(záznam z cleanTrace) → true / false (nad stropem). Kroky se drží v paměti a ve flush()
 * odejdou najednou; když zápis selže, dávka se zahodí (stejně jako počty – nic se nezdvojí, nejvýš se ztratí).
 * traces(dní) → { visits: [[kroky], …] } bez ID a bez dne – stránka z nich počítá jen souhrny.
 * Nových návštěv nejvýš hourCap za hodinu: strop dne (CAP) by jinak kdokoli zaplnil vymyšlenými ID za pár minut
 * a do půlnoci by se nezapsala žádná skutečná.
 */
export function makeTraces(store, { cap = CAP, hourCap = HOUR_CAP, flushMs = FLUSH_MS, now = Date.now, cacheMs = 10 * 60e3 } = {}) {
  let pend = new Map(); // id → { day, steps }
  // Odvolání souhlasu čeká na flush(): dřív šlo každé hned do Upstash (HDEL) a zkoušení náhodných ID s del:1 tak
  // vyčerpalo měsíční strop příkazů zdarma (i krátkým odkazům). Klíč dne → ID; dny podle času odvolání, ne flush() –
  // flush po půlnoci by jinak minul den, kdy návštěva začala.
  let dels = new Map();
  let delIds = new Set(); // všechna odvolaná ID (strop paměti)
  let fresh = []; // časy nových ID za poslední hodinu (hourCap)
  let timer = null;
  let cached = null; // { at, maps } – 30 dní najednou: jiné ?days= není další dotaz do Upstash
  let seen = { day: '', ids: new Set() }; // ID už zapsaná dnes – pozdější kroky téže návštěvy se do stropu nepočítají znovu
  const has = (id) => pend.has(id) || seen.ids.has(id);
  const arm = () => {
    if (timer || (!pend.size && !delIds.size)) return;
    timer = setTimeout(flush, flushMs);
    timer.unref();
  };
  async function flush() {
    clearTimeout(timer);
    timer = null;
    const batch = [...pend];
    pend = new Map();
    const gone = [...dels].map(([k, ids]) => [k, [...ids]]);
    dels = new Map();
    delIds = new Set();
    if (gone.length) {
      try {
        await store.del(gone);
        cached = null;
      } catch (e) { /* jako zápis: nepovedené mazání se zahodí – záznam stejně do 31 dnů zmizí */ }
    }
    const byDay = new Map();
    for (const [id, x] of batch) { if (!byDay.has(x.day)) byDay.set(x.day, []); byDay.get(x.day).push([id, JSON.stringify(x.steps)]); }
    for (const [day, pairs] of byDay) {
      try {
        const known = seen.day === day ? seen.ids : new Set();
        let room = cap - (await store.hlen(KEY + day));
        const ok = pairs.filter(([id]) => known.has(id) || room-- > 0);
        if (!ok.length) continue;
        await store.write(KEY + day, ok, TTL_SEC);
        for (const [id] of ok) known.add(id);
        seen = { day, ids: known }; // stačí poslední den – včerejší ID už nepřijdou
        cached = null;
      } catch (e) { /* dávku zahodit (viz výše) */ }
    }
  }
  return {
    kind: store.kind,
    add(t) {
      if (!t || !t.id) return false;
      if (t.del) {
        // odvolání souhlasu: hned pryč z paměti, z úložiště při flush() (dnes a včera – návštěva mohla začít před
        // půlnocí). Neznámých ID (jiná instance, po restartu) jen do stropu – jinak by zkoušení zabralo paměť.
        const mine = has(t.id);
        pend.delete(t.id);
        seen.ids.delete(t.id);
        if (!mine && delIds.size >= cap) return true;
        delIds.add(t.id);
        const d = now();
        for (const k of [KEY + dayOf(d), KEY + dayOf(d - DAY_MS)]) {
          if (!dels.has(k)) dels.set(k, new Set());
          dels.get(k).add(t.id);
        }
        arm();
        return true;
      }
      if (!pend.has(t.id) && pend.size >= cap) return false; // víc za 30 minut nezapíše ani strop dne
      if (!has(t.id)) {
        const t0 = now() - 3600e3;
        fresh = fresh.filter((x) => x > t0);
        if (fresh.length >= hourCap) return false;
        fresh.push(now());
      }
      pend.set(t.id, { day: (pend.get(t.id) || {}).day || dayOf(now()), steps: t.steps });
      arm();
      return true;
    },
    flush,
    /** ID návštěvy, o které server ví (čeká na zápis nebo zapsaná dnes) – další kroky nejsou nová návštěva. */
    has,
    async traces(days = 30) {
      const t = now();
      if (!cached || t - cached.at > cacheMs) {
        const keys = Array.from({ length: 30 }, (_, i) => KEY + dayOf(t - i * DAY_MS));
        cached = { at: t, maps: await store.read(keys) };
      }
      const n = Math.min(30, Math.max(7, Math.trunc(Number(days)) || 30));
      const visits = [];
      for (const m of cached.maps.slice(0, n)) {
        for (const v of m.values()) {
          try { const s = JSON.parse(v); if (Array.isArray(s)) visits.push(s); } catch (e) { /* poškozené přeskočit */ }
        }
      }
      return { days: n, visits };
    },
  };
}
