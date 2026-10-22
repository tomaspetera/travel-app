// Ochrana při návalu uživatelů: stejné hledání běží jednou pro všechny a souběžných hledání je nejvýš pár.
//
// Jedno hledání stojí server 1–2 s procesoru a desítky MB paměti (spojování letů, kombinace). Dotazy na aerolinky už
// sdílí mezipaměť (cache.wrap), ale stovka stejných hledání by výpočet udělala stokrát a stovka různých naráz by
// přetekla 512 MB na Renderu. Proto: stejné hledání, které ještě běží, se připojí k běžícímu (sharedRuns), nová
// hledání nad strop čekají ve frontě (gate) a nad frontu se slušně odmítnou – lepší než pád serveru pro všechny.

/**
 * Sdílené běhy podle klíče: run(key, work, emit) – běží-li už práce se stejným klíčem, emit dostane poslední událost
 * každého typu z `replay` (stav průběhu, náhled výsledků) a pak další živě; jinak se spustí work(fan), kde fan(ev)
 * rozešle událost všem připojeným. Vrací výsledek práce (stejný pro všechny).
 */
export function sharedRuns({ replay = ['progress', 'partial'] } = {}) {
  const runs = new Map();
  function run(key, work, emit) {
    let r = runs.get(key);
    if (r) {
      for (const t of replay) if (r.last[t]) safe(emit, r.last[t]);
      r.subs.add(emit);
      r.joined++;
      return r.promise;
    }
    r = { subs: new Set([emit]), last: {}, joined: 0 };
    const fan = (ev) => {
      if (ev && replay.includes(ev.type)) r.last[ev.type] = ev;
      for (const s of r.subs) safe(s, ev);
    };
    runs.set(key, r);
    r.promise = (async () => {
      try {
        return await work(fan, r);
      } finally {
        runs.delete(key);
      }
    })();
    return r.promise;
  }
  // chyba při zápisu jednomu (zavřené spojení) nesmí shodit hledání ostatním
  const safe = (fn, ev) => {
    try {
      fn(ev);
    } catch { /* jen tenhle odběratel */ }
  };
  run.has = (key) => runs.has(key);
  run.running = () => runs.size;
  return run;
}

/**
 * Strop souběžných úloh s frontou: gate.full() = fronta je plná (nový požadavek odmítnout), gate(fn, gone) = spustí
 * fn hned, nebo až se uvolní místo. gone() = klient už odešel → úloha se vůbec nespustí (výsledek null).
 */
export function gate(concurrency, maxQueue) {
  let active = 0;
  const queue = [];
  const next = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      if (job.gone && job.gone()) {
        job.resolve(null);
        continue;
      }
      active++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => {
        active--;
        next();
      });
    }
  };
  const run = (fn, gone = null) => new Promise((resolve, reject) => {
    queue.push({ fn, gone, resolve, reject });
    next();
  });
  run.full = () => active >= concurrency && queue.length >= maxQueue;
  run.stats = () => ({ active, queued: queue.length, concurrency, maxQueue });
  return run;
}
