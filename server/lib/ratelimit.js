// Limit požadavků z jedné adresy (klouzavé okno, výchozí 10 min) s omezenou pamětí.
// Dřív se při 5 000 adresách smazalo všechno – při návalu (nebo podvržených adresách) tak limit na chvíli zmizel všem.
// Teď se nejdřív smažou adresy bez požadavku v okně, a kdyby jich bylo pořád moc, ty nejdéle neaktivní.

export class RateLimiter {
  constructor({ windowMs = 10 * 60e3, maxKeys = 5000 } = {}) {
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.map = new Map(); // klíč → časy požadavků v okně (od nejstaršího); poslední aktivní na konci
  }

  /**
   * Započte požadavek klíče `key` s limitem `max` za okno → 0 = projde, jinak za kolik sekund to jde znovu
   * (požadavek nad limitem se nezapočítá). max 0 = bez limitu.
   */
  hit(key, max, now = Date.now()) {
    if (!max) return 0;
    const from = now - this.windowMs;
    const list = (this.map.get(key) || []).filter((t) => t > from);
    if (list.length >= max) {
      // nejstarší z posledních `max` požadavků vypadne z okna → pak projde další
      return Math.max(1, Math.ceil((list[list.length - max] + this.windowMs - now) / 1000));
    }
    list.push(now);
    this.map.delete(key); // naposledy aktivní na konec (pořadí pro vyřazení nejdéle neaktivních)
    this.map.set(key, list);
    if (this.map.size > this.maxKeys) this.prune(now);
    return 0;
  }

  /** Smaže adresy bez požadavku v okně; zbývá-li jich přes strop, i nejdéle neaktivní (na začátku Map). */
  prune(now = Date.now()) {
    const from = now - this.windowMs;
    for (const [k, list] of this.map) if (!(list[list.length - 1] > from)) this.map.delete(k);
    for (const k of this.map.keys()) {
      if (this.map.size <= this.maxKeys * 0.9) break;
      this.map.delete(k);
    }
  }

  get size() {
    return this.map.size;
  }
}
