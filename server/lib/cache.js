// Jednoduchá TTL cache v paměti se sdílením rozpracovaných požadavků
// (dva souběžné dotazy na stejný klíč = jedno volání API).

export class TTLCache {
  constructor(maxEntries = 5000) {
    this.max = maxEntries;
    this.map = new Map();
    this.inflight = new Map();
    this.hits = 0;
    this.misses = 0;
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
    if (this.map.size >= this.max) {
      // Map drží pořadí vložení → smaž nejstarší desetinu.
      const drop = Math.ceil(this.max / 10);
      let i = 0;
      for (const k of this.map.keys()) {
        if (i++ >= drop) break;
        this.map.delete(k);
      }
    }
    this.map.set(key, { val, exp: Date.now() + ttlMs });
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
        this.set(key, val, ttlMs);
        return val;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  stats() {
    return { entries: this.map.size, hits: this.hits, misses: this.misses };
  }
}

export const cache = new TTLCache();
