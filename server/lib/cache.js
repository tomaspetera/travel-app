// Jednoduchá TTL cache v paměti se sdílením rozpracovaných požadavků
// (dva souběžné dotazy na stejný klíč = jedno volání API).

// Prošlé záznamy se jinak mažou, jen když se na ně někdo zeptá – ceny letů (20–30 min) by do vytlačení stropem počtu
// zůstaly v paměti dál. Proto nejvýš jednou za minutu projít a smazat prošlé (pár tisíc záznamů = zlomek ms).
const SWEEP_MS = 60e3;
// Pojistka paměti: Render zdarma má 512 MB a jedna odpověď Ryanairu „kamkoliv“ zabere i stovky kB – strop počtu
// (5 000) by se do paměti nevešel. Nad měkkým stropem paměti procesu (RSS, CACHE_SOFT_MB, výchozí 320 MB) se zahodí
// starší polovina záznamů (jen pomalejší další hledání; pád procesu by vzal celou mezipaměť i rozběhnutá hledání).
// Kontrola nejvýš jednou za 5 s, zahození nejvýš jednou za 30 s (uvolnění paměti chvíli trvá – GC).
const MEM_CHECK_MS = 5e3;
const MEM_TRIM_MS = 30e3;
const softMb = Number(process.env.CACHE_SOFT_MB);
const DEFAULT_SOFT_BYTES = (Number.isFinite(softMb) && softMb > 0 ? softMb : 320) * 2 ** 20;

export class TTLCache {
  /**
   * maxEntries = strop počtu záznamů; softBytes = měkký strop paměti procesu (0 = bez něj);
   * rss = jak zjistit paměť procesu (testy ji podvrhnou).
   */
  constructor(maxEntries = 5000, { softBytes = DEFAULT_SOFT_BYTES, rss = () => process.memoryUsage.rss() } = {}) {
    this.max = maxEntries;
    this.map = new Map();
    this.inflight = new Map();
    this.hits = 0;
    this.misses = 0;
    this.softBytes = softBytes;
    this.rss = rss;
    this.swept = Date.now();
    this.memChecked = 0;
    this.trimmedAt = 0;
    this.trims = 0;
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e.val;
  }

  set(key, val, ttlMs) {
    const now = Date.now();
    if (now - this.swept >= SWEEP_MS) this.sweep(now);
    if (this.softBytes && now - this.memChecked >= MEM_CHECK_MS) this.checkMemory(now);
    if (this.map.size >= this.max) {
      // Map drží pořadí vložení → smaž nejstarší desetinu.
      this.dropOldest(Math.ceil(this.max / 10));
    }
    this.map.set(key, { val, exp: now + ttlMs });
  }

  /** Smaže prošlé záznamy. */
  sweep(now = Date.now()) {
    this.swept = now;
    for (const [k, e] of this.map) if (e.exp < now) this.map.delete(k);
  }

  /** Nad měkkým stropem paměti procesu zahodí starší polovinu záznamů (→ true). */
  checkMemory(now = Date.now()) {
    this.memChecked = now;
    if (now - this.trimmedAt < MEM_TRIM_MS || this.rss() < this.softBytes) return false;
    this.trimmedAt = now;
    this.trims++;
    this.sweep(now);
    this.dropOldest(Math.ceil(this.map.size / 2));
    return true;
  }

  dropOldest(n) {
    let i = 0;
    for (const k of this.map.keys()) {
      if (i++ >= n) break;
      this.map.delete(k);
    }
  }

  async wrap(key, ttlMs, fn) {
    const hit = this.get(key);
    if (hit !== undefined) {
      this.hits++;
      return hit;
    }
    if (this.inflight.has(key)) return this.inflight.get(key);
    this.misses++;
    const p = (async () => {
      try {
        const val = await fn();
        // ttlMs může být funkce výsledku (např. kratší platnost pro náhradní/neúplná data).
        this.set(key, val, typeof ttlMs === 'function' ? ttlMs(val) : ttlMs);
        return val;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  stats() {
    return { entries: this.map.size, hits: this.hits, misses: this.misses, ...(this.trims ? { trims: this.trims } : {}) };
  }
}

export const cache = new TTLCache();
