/* ATLAS – souhrnné počítání bez sledování lidí: Count.hit('search_done') pošle serveru jen název události
   (POST api/count, server/lib/counts.js) a ten si přičte 1 k dennímu součtu. Nic se neukládá do prohlížeče – žádné
   cookies, úložiště ani identifikátor – a s požadavkem nejde nic o tobě ani o zařízení; z počtů nejde poznat, kdo co
   dělal. Offline se nepočítá a nic se neodkládá na později. Chyba počítání se nikdy neprojeví v aplikaci. */
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
      const url = new URL('api/count', document.baseURI).href, body = JSON.stringify({ e: String(e) });
      // sendBeacon doručí i událost těsně před odchodem ze stránky (klepnutí na odkaz k partnerovi)
      if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
      if (nativeFetch) nativeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => {});
    } catch (err) { /* počítání nesmí nic rozbít */ }
  }

  // go() se volá i pro sekci, která už je otevřená (návrat z okna, překreslení) – počítá se jen přepnutí
  let last = null;
  function view(v, mine) {
    const e = viewEvent(v, mine);
    if (e === last) return;
    last = e;
    if (e) hit(e);
  }

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

  window.Count = { hit, view, viewEvent, ask };
})();
