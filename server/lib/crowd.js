// Ochrana při návalu uživatelů: stejné hledání běží jednou pro všechny a souběžných hledání je nejvýš pár.
//
// Jedno hledání stojí server 1–2 s procesoru a desítky MB paměti (spojování letů, kombinace). Dotazy na aerolinky už
// sdílí mezipaměť (cache.wrap), ale stovka stejných hledání by výpočet udělala stokrát a stovka různých naráz by
// přetekla 512 MB na Renderu. Proto: stejné hledání, které ještě běží, se připojí k běžícímu (sharedRuns), nová
// hledání nad strop čekají ve frontě (gate) a nad frontu se slušně odmítnou – lepší než pád serveru pro všechny.
// Fronta je ale společná: aby ji jedna adresa nezaplnila sama (a ostatní nedostávali 503), má každá adresa strop
// rozběhnutých hledání (perClient).

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
  run.full = () => {
    // úlohy klientů, kteří už odešli, místo ve frontě nedrží (jinak by po zavřených stránkách odmítala i nové)
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].gone && queue[i].gone()) queue.splice(i, 1)[0].resolve(null);
    }
    return active >= concurrency && queue.length >= maxQueue;
  };
  run.stats = () => ({ active, queued: queue.length, concurrency, maxQueue });
  return run;
}

/**
 * Počet rozběhnutých úloh na klienta (adresu) se stropem: full(key, max) = klient už má `max` úloh (novou odmítnout;
 * max 0 = bez stropu), take(key) = započte jednu a vrátí release(). Ta vrací místo jen poprvé – volá se bez obav při
 * konci, chybě i odchodu klienta, podle toho, co přijde dřív. Záznam zmizí, jakmile klient nemá nic rozběhnutého,
 * takže paměť roste jen s počtem právě otevřených požadavků, ne s časem ani s počtem adres, které kdy přišly.
 */
export function perClient() {
  const counts = new Map();
  const count = (key) => counts.get(key) || 0;
  return {
    full: (key, max) => max > 0 && count(key) >= max,
    take(key) {
      counts.set(key, count(key) + 1);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const n = count(key) - 1;
        if (n > 0) counts.set(key, n);
        else counts.delete(key);
      };
    },
    count,
    get size() {
      return counts.size;
    },
  };
}
