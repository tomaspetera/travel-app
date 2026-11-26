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

  window.Count = { hit, view, viewEvent };
})();
