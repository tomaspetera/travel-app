// Souhrnné počty bez sledování lidí: kolikrát se za den otevřela aplikace, proběhlo hledání, vznikla cesta… Jen
// denní součet na událost z pevného seznamu (EVENTS) – žádné cookies, identifikátor, IP adresa ani údaj o zařízení,
// z počtů nejde poznat, kdo co dělal (public/js/count.js → POST /api/count; čtení GET /api/stats). Část počtů („kde to
// drhne“: hledání bez výsledku, limit, chyba…) si server dělá sám ze svých odpovědí – prohlížeč k tomu nic neposílá.
// Úložiště jako krátké odkazy (shortlinks.js): Upstash Redis přes REST, klíč cnt:<den UTC>:<událost>, 400 dní; bez klíčů
// paměť procesu (demo, testy – po restartu prázdné). Do Upstash se nepíše při každé události: počty se sčítají
// v paměti a jednou za 30 minut odejdou najednou (INCRBY). Strop zdarma je 500 000 příkazů měsíčně a dělí se o něj
// krátké odkazy – zápis při každém klepnutí by ho při návalu (nebo schválně z jedné adresy) vyčerpal a odkazy by do
// konce měsíce nešly otevřít. Takhle je to nejvýš EVENTS.length příkazů INCRBY za 30 minut, ať přijde událostí kolik
// chce (rozpočet hlídá test/pocitadla.test.js). Pád serveru bez SIGTERM ztratí nejvýš posledních 30 minut počtů.
import { timingSafeEqual } from 'node:crypto';
import { request } from './http.js';

// Počty „kde to drhne“, které si server dělá sám ze svých odpovědí (server/index.js): chyba v prohlížeči, hledání bez
// nabídek / nad limitem / při plném serveru / s chybou, ubytování bez nabídek, otevřený a nefunkční sdílený odkaz.
// Z prohlížeče (/api/count) se nepřijmou – kdokoli by je jinak mohl nafouknout.
export const SERVER_EVENTS = ['js_error', 'search_empty', 'search_limit', 'search_busy', 'search_error', 'stay_empty', 'shared_open', 'shared_broken'];
export const EVENTS = [
  'app_open', 'view_dashboard', 'view_flights', 'view_trip', 'view_trips', 'view_explore', 'view_world',
  'search_done', 'search_anywhere', 'verify_click', 'buy_click',
  'trip_started', 'trip_auto', 'trip_summary', 'trip_saved', 'share', 'calendar_export', 'have_ticket_start',
  'limit_shown', 'limit_plus', 'limit_download', 'limit_replace',
  'plus_page', 'plus_offer_shown', 'plus_offer_click', 'sesit_shown', 'sesit_click', 'sesit_country_shown', 'sesit_country_click',
  'price_0', 'price_199', 'price_399', 'price_599', 'price_799', 'look_letsi',
  ...SERVER_EVENTS,
  // odpovědi na krátké otázky (public/js/count.js Count.ask) – jen klepnutá volba, zobrazení otázky se nepočítá
  'mq_empty_place', 'mq_empty_dates', 'mq_empty_lost', 'mq_empty_try',
  'mq_price_same', 'mq_price_higher', 'mq_price_gone',
  'mq_restart_date', 'mq_restart_price', 'mq_restart_lost', 'mq_restart_try',
  'mq_trip_good', 'mq_trip_missing', 'mq_trip_lost',
  'mq_ex_city', 'mq_ex_nature', 'mq_ex_region', 'mq_ex_other',
  // opakované klepnutí (3× do 1 s na totéž místo – něco nereaguje) podle sekce; jen se souhlasem „Pomáhat se
  // zlepšováním“ (public/js/count.js), jako i záznam návštěvy (server/lib/traces.js)
  'rage_dashboard', 'rage_flights', 'rage_trip', 'rage_explore', 'rage_world',
  // podrobné počty v Letech – jen od lidí se zapnutou pomocí „Pomáhat se zlepšováním“ (Count.deep v count.js)
  'fix_date', 'fix_place', 'fix_filter', 'fix_warm', 'fix_ground', 'buy_age_warn', 'place_none_from', 'place_none_to',
  'sentence_ok', 'sentence_miss', 'sentence_nofrom', 'form_err_from', 'form_err_range', 'form_err_date', 'form_err_multi',
  'search_redo', 'search_slow', 'api_fail_down', 'res_all_hidden', 'res_filters', 'res_sort', 'res_view_map', 'res_view_cal',
  'res_best_jump', 'buy_rank_1', 'buy_rank_2_5', 'buy_rank_6p',
  // podrobné počty průvodce, Objevuj a načítání (Count.deep v trip.js, places.js, lazy.js) – posílají se jen se
  // souhlasem „Pomáhat se zlepšováním“
  'trip_step_route', 'trip_step_stay', 'trip_step_car', 'trip_step_program', 'trip_back',
  'trip_restart_route', 'trip_restart_stay', 'trip_restart_car', 'trip_restart_program', 'trip_restart_summary',
  'trip_auto_done', 'trip_auto_nights', 'trip_auto_stay',
  'stay_pick_offer', 'stay_pick_auto', 'stay_pick_manual', 'stay_pick_links', 'stay_pick_skip', 'stay_empty_filter', 'trip_gap',
  'ex_open_sug', 'ex_open_smart', 'ex_open_enter', 'ex_open_other', 'place_none_explore', 'ex_smart_ok', 'ex_smart_miss',
  'ex_empty_list', 'ex_empty_plan', 'ex_empty_trips', 'ex_empty_country', 'ex_fix', 'ex_save', 'ex_fly',
  'lazy_fail',
];
// Strop seznamu: s každým názvem roste nejhorší počet zápisů do Upstash (rozpočet v test/pocitadla.test.js)
export const MAX_EVENTS = 150;
export const FLUSH_MS = 30 * 60e3;
export const TTL_DAYS = 400;
export const MAX_BODY = 256; // {"e":"plus_offer_shown"} má 24 bajtů – víc je něco jiného než count.js
export const MAX_DAYS = 90;
const KEY = 'cnt:';
const DAY_MS = 86400e3;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10); // den UTC

/**
 * Hlavička Authorization: Bearer <klíč> k /api/stats → true, sedí-li klíč. Porovnání v konstantním čase
 * (timingSafeEqual), ať se klíč nedá uhodnout po znacích podle doby odpovědi; jiná délka = nerovnost.
 */
export function statsKeyOk(header, key) {
  const m = /^Bearer (.+)$/.exec(String(header || ''));
  if (!m || !key) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(String(key));
  return a.length === b.length && timingSafeEqual(a, b);
}

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

/** Úložiště v paměti (demo, testy, server bez Upstash): po restartu prázdné; EVENTS.length čísel za den běhu, nemaže se. */
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
 * neshodí; když zápis selže, dávka se zahodí (viz flush). stats(dní) → { days: [{ day, counts }], total }.
 */
export function makeCounter(store, { now = Date.now, flushMs = FLUSH_MS, cacheMs = 5 * 60e3 } = {}) {
  let pend = new Map(); // '<den>:<událost>' → počet od posledního zápisu
  let timer = null;
  let cached = null; // { at, m } – uložené součty za 90 dní: /api/stats (bez STATS_KEY veřejné) nesmí jít každým dotazem do Upstash
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
      // Dávku zahodit, ne vracet do pend: chyba může přijít až po tom, co Upstash INCRBY provedl (ztracená odpověď,
      // časový limit) – vrácená dávka by se pak přičetla podruhé. Chybějící počty jsou menší zlo než zdvojené.
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
