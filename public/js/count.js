/* ATLAS – souhrnné počítání bez sledování lidí: Count.hit('search_done') pošle serveru jen název události
   (POST api/count, server/lib/counts.js) a ten si přičte 1 k dennímu součtu. Bez souhlasu se nic neukládá do
   prohlížeče – žádné cookies, úložiště ani identifikátor – a s požadavkem nejde nic o tobě ani o zařízení; z počtů
   nejde poznat, kdo co dělal. Offline se nepočítá a nic se neodkládá na později. Chyba počítání se nikdy neprojeví
   v aplikaci.
   Kdo sám zapne „Pomáhat se zlepšováním“ (Count.consent(true) – karta na Přehledu nebo přepínač v Další), tomu se
   navíc počítají podrobnější počty (Count.deep, opakované klepnutí rage_*) a zaznamená se průchod návštěvou: pořadí
   obrazovek a hlavních akcí se sekundami od začátku a náhodným číslem návštěvy, které je jen v paměti stránky
   (POST api/trace, server/lib/traces.js). V zařízení se ukládá jen volba localStorage.atlas_help ('1' / '0'), a to
   až po klepnutí. Bez souhlasu se nic z toho neposílá a ani se neposlouchá žádné klepnutí. */
(function () {
  // sekce (go() v app.js) → událost: Mapa a Země jsou jedna sekce Svět, 🧳 Moje cesty zvlášť od průvodce cestou;
  // sekce bez události (Doporučení) se nepočítají
  const VIEWS = { dashboard: 'view_dashboard', flights: 'view_flights', trip: 'view_trip', explore: 'view_explore', map: 'view_world', countries: 'view_world' };
  const viewEvent = (v, mine) => (v === 'trip' && mine ? 'view_trips' : VIEWS[v] || null);

  // vlastní kopie fetch: pwa.js ji později obalí (hlášky sítě) a nepovedené počítání se uživateli hlásit nemá
  const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  function hit(e) {
    try {
      if (!e || navigator.onLine === false) return;
      // sendBeacon doručí i událost těsně před odchodem ze stránky (klepnutí na odkaz k partnerovi)
      post('api/count', JSON.stringify({ e: String(e) }));
      step(String(e)); // se souhlasem i krok záznamu návštěvy (jinak step nic nedělá)
    } catch (err) { /* počítání nesmí nic rozbít */ }
  }

  const post = (path, body) => {
    try {
      const url = new URL(path, document.baseURI).href;
      if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
      if (nativeFetch) nativeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => {});
    } catch (err) { /* nesmí nic rozbít */ }
  };

  /* ---------- Pomáhat se zlepšováním (jen se souhlasem) ---------- */
  let helpOn = false;
  try { helpOn = localStorage.getItem('atlas_help') === '1'; } catch (err) { /* soukromé okno: bez souhlasu */ }
  const helping = () => helpOn;

  // Záznam návštěvy jen v paměti stránky: { id, t0, at (poslední krok), steps: [[sekund, název]], sent (kolik kroků
  // už odešlo) }. Nová návštěva po 30 minutách nečinnosti – PWA žije na telefonu i dny a jinak by z „návštěvy“ byl
  // vícedenní záznam.
  const IDLE = 30 * 60e3, MAX_STEPS = 120;
  // ochota platit a odpovědi na otázky do záznamu nesmí (zásady 3.7), stejně jako server/lib/traces.js traceExcluded
  const skipStep = (e) => /^(price_|plus_|limit_|mq_)/.test(e) || e === 'look_letsi';
  let tr = null;
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('');
  function send() {
    if (!tr || tr.steps.length <= tr.sent) return; // jen když přibyly kroky
    post('api/trace', JSON.stringify({ id: tr.id, s: tr.steps }));
    tr.sent = tr.steps.length;
  }
  function step(e) {
    if (!helpOn || !e || skipStep(e)) return;
    const t = Date.now();
    if (tr && t - tr.at > IDLE) { send(); tr = null; }
    if (!tr) tr = { id: newId(), t0: t, at: t, steps: [], sent: 0 };
    tr.at = t;
    if (tr.steps.length < MAX_STEPS) tr.steps.push([Math.max(0, Math.round((t - tr.t0) / 1000)), e]);
  }
  const onHide = () => { if (document.visibilityState === 'hidden') send(); };

  // Opakované klepnutí: 3 a víc do 1 s na tentýž prvek = něco nereaguje. Jednou za shluk, nejvýš 5× za načtení.
  // Sekce z posledního view(); text, třída ani id prvku se nikdy neposílají. Pole, stepper (+/− se klepe opakovaně
  // schválně) a mapa se nepočítají. pointercancel (posun stránky) pointerup nespustí.
  const RAGE = { view_dashboard: 'rage_dashboard', view_flights: 'rage_flights', view_trip: 'rage_trip', view_trips: 'rage_trip', view_explore: 'rage_explore', view_world: 'rage_world' };
  const RAGE_SKIP = 'input, select, textarea, label, .pax-step, [data-px], .maplibregl-map, .leaflet-container, canvas, [data-repeat]';
  const rage = { el: null, times: [], fired: false, n: 0 };
  /** Klepnutí na prvek el v čase t (ms) → název rage_* k odeslání, nebo null. Čistá logika kvůli testu. */
  function rageTap(el, t) {
    if (!el || (el.closest && el.closest(RAGE_SKIP))) return null;
    if (el !== rage.el) Object.assign(rage, { el, times: [], fired: false });
    rage.times = rage.times.filter((x) => t - x < 1000).concat(t);
    if (rage.times.length === 1) rage.fired = false; // pauza delší než 1 s = nový shluk
    if (rage.times.length < 3 || rage.fired || rage.n >= 5) return null;
    rage.fired = true;
    rage.n++;
    return RAGE[last] || null;
  }
  function onTap(ev) {
    try {
      const e = rageTap(ev.target, Date.now());
      if (e) deep(e);
    } catch (err) { /* nesmí nic rozbít */ }
  }
  function listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    document[f]('pointerup', onTap, { passive: true, capture: true });
    document[f]('visibilitychange', onHide);
    window[f]('pagehide', send);
  }

  const onceSeen = new Set();
  /**
   * Podrobnější počet jen se souhlasem: bez něj nic (vrací false). S onceKey nejvýš jednou za načtení stránky pro
   * dvojici (name, onceKey) – třeba jednou na hledání. Se souhlasem zároveň krok záznamu návštěvy (přes hit).
   */
  function deep(name, onceKey) {
    if (!helpOn || !name) return false;
    if (onceKey !== undefined) {
      const k = name + '\n' + onceKey;
      if (onceSeen.has(k)) return false;
      onceSeen.add(k);
    }
    hit(name);
    return true;
  }

  /**
   * Volba uživatele (klepnutí na kartě nebo přepínači): true zapne, false vypne. Teprve tady se zapisuje atlas_help.
   * Vypnutí platí hned: přestane se poslouchat a server dostane pokyn smazat záznam téhle návštěvy (del).
   */
  function consent(on) {
    on = Boolean(on);
    try { localStorage.setItem('atlas_help', on ? '1' : '0'); } catch (err) { /* soukromé okno: platí do zavření */ }
    if (on === helpOn) return;
    helpOn = on;
    listen(on);
    if (on) step(last); // záznam začíná až teď – obrazovkou, na které člověk právě je, nic zpětně
    else {
      if (tr) post('api/trace', JSON.stringify({ id: tr.id, del: 1 }));
      tr = null;
    }
  }

  // go() se volá i pro sekci, která už je otevřená (návrat z okna, překreslení) – počítá se jen přepnutí
  let last = null;
  function view(v, mine) {
    const e = viewEvent(v, mine);
    if (e === last) return;
    last = e;
    if (e) hit(e);
  }
  if (helpOn) listen(true);

  /*
   * Krátká otázka na jedno klepnutí: řádek s volbami hned za prvkem el (ne okno ani toast). o = { id, q (otázka),
   * opts: [[název události, popisek], …], rate (podíl případů, kdy se zeptá: 0.25 = 1 ze 4), done(název, řádek),
   * at (místo vůči el pro insertAdjacentElement, jinak hned za ním) }.
   * Nejvýš jedna otázka za načtení stránky – víc by obtěžovalo. Neposílá se nic, dokud člověk sám neklepne na volbu:
   * zobrazení otázky se nepočítá (automaticky posílaný počet čeká na posouzení advokátem). Volný text se neposílá.
   * Nic se neukládá do zařízení, takže po obnovení stránky se může zeptat znovu.
   */
  let asked = null; // otázka ukázaná na téhle stránce: { id, row, open }
  function ask(el, o) {
    try {
      if (!el || !el.insertAdjacentElement || !o || !Array.isArray(o.opts)) return null;
      if (asked) {
        // překreslení obsahu řádek zahodí – nezodpovězená otázka se stejným id se vrátí na nové místo (znovu se nelosuje)
        if (asked.open && asked.id === o.id && !asked.row.isConnected) { el.insertAdjacentElement(o.at || 'afterend', asked.row); return asked.row; }
        return null;
      }
      if (!(Math.random() < o.rate)) return null;
      const row = document.createElement('div');
      row.className = 'row wrap mq';
      row.dataset.mq = o.id;
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', o.q);
      row.style.cssText = `gap:6px;margin:${o.at ? '0 0 12px' : '10px 0 0'}`; // na začátku bloku mezera pod, jinak nad
      const q = document.createElement('b');
      q.textContent = o.q;
      row.append(q);
      const btn = (cls, text) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; row.append(b); return b; };
      const me = asked = { id: o.id, row, open: true };
      for (const [e, label] of o.opts) {
        btn('fchip', label).onclick = () => {
          me.open = false;
          hit(e);
          row.replaceChildren('Díky!');
          row.setAttribute('role', 'status');
          if (o.done) o.done(e, row);
        };
      }
      const x = btn('linkbtn', '✕');
      x.setAttribute('aria-label', 'Zavřít otázku');
      x.style.padding = '4px 8px'; // ✕ je malé – větší plocha pro prst
      x.onclick = () => { me.open = false; row.remove(); };
      el.insertAdjacentElement(o.at || 'afterend', row);
      return row;
    } catch (err) { return null; } // otázka nesmí nic rozbít
  }

  window.Count = { hit, view, viewEvent, ask, helping, deep, consent, rageTap };
})();
