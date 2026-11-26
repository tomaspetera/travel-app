// Souhrnné počty bez sledování lidí: kolikrát se za den otevřela aplikace, proběhlo hledání, vznikla cesta… Jen
// denní součet na událost z pevného seznamu (EVENTS) – žádné cookies, identifikátor, IP adresa ani údaj o zařízení,
// z počtů nejde poznat, kdo co dělal (public/js/count.js → POST /api/count; čtení GET /api/stats).
// Úložiště jako krátké odkazy (shortlinks.js): Upstash Redis přes REST, klíč cnt:<den UTC>:<událost>, 400 dní; bez klíčů
// paměť procesu (demo, testy – po restartu prázdné). Do Upstash se nepíše při každé události: počty se sčítají
// v paměti a jednou za 10 minut odejdou najednou (INCRBY). Strop zdarma je 500 000 příkazů měsíčně a dělí se o něj
// krátké odkazy – zápis při každém klepnutí by ho při návalu (nebo schválně z jedné adresy) vyčerpal a odkazy by do
// konce měsíce nešly otevřít. Takhle je to nejvýš 33 příkazů za 10 minut, ať přijde událostí kolik chce.
import { request } from './http.js';

export const EVENTS = [
  'app_open', 'view_dashboard', 'view_flights', 'view_trip', 'view_trips', 'view_explore', 'view_world',
  'search_done', 'search_anywhere', 'verify_click', 'buy_click',
  'trip_started', 'trip_auto', 'trip_summary', 'trip_saved', 'share', 'calendar_export', 'have_ticket_start',
  'limit_shown', 'limit_plus', 'limit_download', 'limit_replace',
  'plus_page', 'plus_offer_shown', 'plus_offer_click', 'sesit_shown', 'sesit_click',
  'price_0', 'price_199', 'price_399', 'price_599', 'price_799', 'look_letsi',
];
export const TTL_DAYS = 400;
export const MAX_BODY = 256; // {"e":"plus_offer_shown"} má 24 bajtů – víc je něco jiného než count.js
export const MAX_DAYS = 90;
const KEY = 'cnt:';
const DAY_MS = 86400e3;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10); // den UTC

/** ?days= → 1–90, bez hodnoty nebo nesmysl 30. */
export const clampDays = (v) => Math.min(MAX_DAYS, Math.max(1, Math.trunc(Number(v)) || 30));

/** Upstash Redis přes REST (jako shortlinks.js upstashStore): add = přičtení víc součtů jedním dotazem, get = MGET. */
export function upstashCounts(url, token, req = request) {
  // bez opakování: druhý pokus po ztracené odpovědi by přičetl podruhé
  const post = (path, body, retries) => req(url + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, timeoutMs: 6000, retries });
  return {
    kind: 'upstash',
    async add(pairs, ttlSec) {
      const r = await post('/pipeline', pairs.map(([k, n]) => ['INCRBY', k, String(n)]), 0);
      if (!Array.isArray(r)) throw new Error('Upstash: nečekaná odpověď');
      // dobu života dostane jen nový klíč (součet = právě přičtené) – jednou za den a událost, ne při každém zápisu.
      // Když se to nepovede, klíč zůstane bez doby života (pár bajtů); přičtené se kvůli tomu znovu neposílá.
      const fresh = pairs.filter(([, n], i) => r[i] && Number(r[i].result) === n);
      if (fresh.length) await post('/pipeline', fresh.map(([k]) => ['EXPIRE', k, String(ttlSec)]), 1).catch(() => {});
    },
    get: (keys) => post('', ['MGET', ...keys], 1).then((j) => (j && Array.isArray(j.result) ? j.result : [])),
  };
}

/** Úložiště v paměti (demo, testy, server bez Upstash): po restartu prázdné; 33 čísel za den běhu, nemaže se. */
export function memoryCounts() {
  const m = new Map();
  return {
    kind: 'memory',
    add: async (pairs) => { for (const [k, n] of pairs) m.set(k, (m.get(k) || 0) + n); },
    get: async (keys) => keys.map((k) => m.get(k) ?? null),
  };
}

/**
 * Počítadlo nad úložištěm. hit(událost) → true / false (neznámá událost); nic jiného než název události nedostane,
 * takže adresu ani zařízení uložit nemůže. Úložiště se volá až ve flush() – jeho výpadek požadavek nezdrží ani
 * neshodí, nezapsané počty zůstanou v paměti na příště. stats(dní) → { days: [{ day, counts }], total }.
 */
export function makeCounter(store, { now = Date.now, flushMs = 10 * 60e3, cacheMs = 5 * 60e3 } = {}) {
  let pend = new Map(); // '<den>:<událost>' → počet od posledního zápisu
  let timer = null;
  let cached = null; // { at, m } – uložené součty za 90 dní: /api/stats je veřejné a nesmí jít každým dotazem do Upstash
  let writes = 0; // počet zápisů: čtení, které zápis předběhl, se neuloží – 5 minut by v něm chyběla zapsaná dávka
  const arm = () => {
    if (timer || !pend.size) return;
    timer = setTimeout(flush, flushMs);
    timer.unref(); // čekající zápis nedrží proces (testy, ukončení serveru)
  };
  async function flush() {
    clearTimeout(timer);
    timer = null;
    const batch = [...pend];
    pend = new Map();
    if (!batch.length) return;
    try {
      await store.add(batch.map(([k, n]) => [KEY + k, n]), TTL_DAYS * 86400);
      cached = null;
      writes++;
    } catch (e) {
      for (const [k, n] of batch) pend.set(k, (pend.get(k) || 0) + n);
      arm();
    }
  }
  return {
    kind: store.kind,
    hit(e) {
      if (typeof e !== 'string' || !EVENTS.includes(e)) return false;
      const k = `${dayOf(now())}:${e}`;
      pend.set(k, (pend.get(k) || 0) + 1);
      arm();
      return true;
    },
    flush,
    async stats(days = 30) {
      const t = now();
      let m = cached && t - cached.at <= cacheMs ? cached.m : null;
      if (!m) {
        const w = writes;
        // vždy celých 90 dní jedním MGET: jiné ?days= není další dotaz do úložiště
        const keys = Array.from({ length: MAX_DAYS }, (_, i) => dayOf(t - i * DAY_MS)).flatMap((d) => EVENTS.map((e) => `${d}:${e}`));
        const vals = await store.get(keys.map((k) => KEY + k));
        m = new Map();
        keys.forEach((k, i) => { const n = Number(vals[i]); if (n > 0) m.set(k, n); });
        if (w === writes) cached = { at: t, m };
      }
      const out = [], total = {};
      for (let i = clampDays(days) - 1; i >= 0; i--) {
        const day = dayOf(t - i * DAY_MS), counts = {};
        for (const e of EVENTS) {
          const n = (m.get(`${day}:${e}`) || 0) + (pend.get(`${day}:${e}`) || 0);
          if (n) { counts[e] = n; total[e] = (total[e] || 0) + n; }
        }
        out.push({ day, counts });
      }
      return { days: out, total };
    },
  };
}
