/* ATLAS – moduly mimo Přehled až po startu. Průvodce cestou (trip.js), Objevuj (places.js) a „Co zařídit a co sbalit“
   (pretrip.js) jsou třetina skriptů aplikace (~160 kB po kompresi) a Přehled je nepotřebuje. Při první návštěvě na
   pomalém telefonu (1,6 Mb/s) zdržely start o ~0,8 s, proto nejsou v index.html jako <script>, ale v data-later tohoto
   skriptu (pořadí = závislosti: trip.js používá places.js a pretrip.js):
   - Lazy.soon(): stáhnou se, až je Přehled vykreslený a prohlížeč nemá co dělat (app.js boot) – než uživatel klepne,
     bývají dávno tu;
   - Lazy.need('trip'): hned, když je něco potřebuje dřív (sdílená cesta z odkazu, Přehled s rozpracovanou cestou,
     klepnutí před dostažením) – s moduly před ním v seznamu;
   - Lazy.run('trip', fn): načtený modul → fn hned (jako dřív, beze změny chování), jinak fn po načtení.
   Seznam z data-later ukládá i service worker (server/lib/pwa.js shellAssets) – offline jsou i odložené moduly.
   Server do seznamu doplní otisk obsahu (js/trip.js?v=…, pwa.js versionAssets) – Cloudflare i prohlížeč pak soubor
   drží bez ptaní serveru. Stejně knihovny map z data-files (d3, MapLibre): Lazy.url('vendor/d3.min.js') = adresa
   s otiskem, kterou aplikace načte, až mapu otevře.
   Skripty z vlastního serveru CSP stránky pouští (script-src 'self'). */
(function () {
  const me = document.currentScript;
  const list = name => String((me && me.getAttribute(name)) || '').split(/\s+/).filter(Boolean);
  const LIST = list('data-later');
  const FILES = list('data-files');
  const bare = src => src.replace(/[?#].*$/, '');
  const nameOf = src => bare(src).replace(/^.*\//, '').replace(/\.js$/, '');
  const loads = new Map(); // src → Promise rozběhnutého nebo hotového načtení
  const done = new Set(); // názvy načtených modulů
  let allDone = null;
  // všechny moduly načtené (nebo se načíst nepovedly): pwa.js pak zaregistruje service worker – jeho instalace je
  // u serveru jen ověří (304) a nestahuje je podruhé souběžně se stránkou
  const settled = new Promise(r => { allDone = r; });

  function inject(src) {
    if (loads.has(src)) return loads.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // stahují se souběžně, spustí se v pořadí seznamu
      s.onload = () => { done.add(nameOf(src)); resolve(); };
      // výpadek sítě: příští Lazy.need to zkusí znovu
      s.onerror = () => { loads.delete(src); s.remove(); reject(new Error(`Nepodařilo se načíst ${src}`)); };
      document.head.appendChild(s);
    });
    loads.set(src, p);
    return p;
  }

  /** Modul name ('trip', 'places', 'pretrip') i moduly před ním v seznamu; bez name všechny → Promise. Modul, který
   *  v seznamu není, se načítá se stránkou – hned hotovo. */
  function need(name) {
    const i = name == null ? LIST.length - 1 : LIST.findIndex(s => nameOf(s) === name);
    if (i < 0 && name != null) return Promise.resolve();
    const all = Promise.all(LIST.slice(0, i + 1).map(inject)).then(() => { });
    if (i === LIST.length - 1) all.then(allDone, allDone);
    return all;
  }

  const has = name => done.has(name) || !LIST.some(s => nameOf(s) === name);

  /** fn s načteným modulem: hned (vrátí výsledek fn), jinak po načtení (Promise); nenačte-li se, hláška místo fn. */
  function run(name, fn) {
    if (has(name)) return fn();
    return need(name).then(fn, () => { if (typeof window.toast === 'function') window.toast('Tahle část aplikace se nenačetla – zkontroluj připojení a zkus to znovu', 'err'); });
  }

  let queued = false;
  /** Všechny moduly, až prohlížeč nemá co dělat (po vykreslení Přehledu); bez requestIdleCallback (Safari) za chvíli. */
  function soon() {
    if (queued) return;
    queued = true;
    const go = () => { need().catch(() => { }); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 300);
  }

  /** Adresa souboru z data-files s otiskem obsahu od serveru; bez něj (soubor v seznamu není) beze změny. */
  const url = path => FILES.find(u => bare(u) === path) || path;

  window.Lazy = { LIST, need, has, run, soon, settled, url };
})();
