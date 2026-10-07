/* ATLAS – aplikace na ploše (PWA): service worker pro offline (public/sw.js), „📲 Přidat ATLAS na plochu“, upozornění
   na novou verzi a na výpadek připojení, barva lišty prohlížeče podle motivu a srozumitelná hláška místo „Failed to
   fetch“. Bez service workeru (http mimo localhost, starý prohlížeč) funguje vše jako dřív, jen bez offline režimu. */
(function () {
  const OFFLINE_MSG = 'Jsi offline – připoj se k internetu a zkus to znovu.';
  const DOWN_MSG = 'Server ATLAS je teď nedostupný – zkontroluj připojení k internetu a zkus to znovu.';
  const THEME = { dark: '#080c1a', light: '#eef2fb' }; // --bg motivů z atlas.css = barva lišty a okna aplikace

  /** Požadavek na API ATLASu (adresa pod api/ vůči stránce). */
  function isApi(input, base) {
    try {
      const u = new URL(input && typeof input === 'object' && 'url' in input ? input.url : String(input), base);
      const api = new URL('api/', base);
      return u.origin === api.origin && u.pathname.startsWith(api.pathname);
    } catch (e) {
      return false;
    }
  }

  /** Chyba sítě u API (fetch odmítnutý s TypeError) → česká hláška; ostatní chyby (i zrušené hledání AbortError) beze změny. */
  function netError(err, input, { online = true, base } = {}) {
    if (!err || err.name !== 'TypeError' || !isApi(input, base)) return err;
    const e = new Error(online ? DOWN_MSG : OFFLINE_MSG);
    e.name = 'NetworkError';
    e.offline = !online;
    e.cause = err;
    return e;
  }

  /** Jak nabídnout instalaci: 'prompt' (Chrome, Edge, Android – dialog prohlížeče), 'ios' (návod Sdílet → Přidat
      na plochu), null = nic (už běží z plochy, nebo to prohlížeč neumí – Firefox na počítači, vestavěný prohlížeč). */
  function installMode({ standalone, prompt, ua = '', platform = '', touch = 0 }) {
    if (standalone) return null;
    if (prompt) return 'prompt';
    const ios = /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touch > 1); // iPadOS se hlásí jako Mac
    return ios && !/FBAN|FBAV|Instagram/.test(ua) ? 'ios' : null;
  }

  const api = { netError, installMode, isApi, OFFLINE_MSG, DOWN_MSG, THEME, addToMenu() {} };
  window.Pwa = api;
  if (typeof document === 'undefined' || !document.documentElement) return; // testy v node:vm – jen funkce výše

  const $ = (s) => document.querySelector(s);
  const nativeFetch = typeof window.fetch === 'function' ? window.fetch : null;

  /* 1) Srozumitelná chyba místo „Failed to fetch“ ve všech hláškách aplikace (hledání, radar, cesta, ubytování,
        program…): jen u API ATLASu a jen při chybě sítě – odpovědi serveru i zrušená hledání beze změny. */
  if (nativeFetch) {
    window.fetch = function (input) {
      return nativeFetch.apply(window, arguments).catch((e) => {
        throw netError(e, input, { online: navigator.onLine !== false, base: document.baseURI });
      });
    };
  }

  /* 2) Pruh „Jsi offline“ nahoře – aplikace i uložené cesty fungují dál, hledání a ceny počkají na připojení. */
  const offBar = document.createElement('div');
  offBar.className = 'pwa-bar';
  offBar.setAttribute('role', 'status');
  offBar.innerHTML = '📴 <b>Jsi offline.</b> Uložené cesty a plány fungují, hledání letů a ceny počkají na internet.';
  const demo = $('#demoBanner'), main = $('.main');
  if (demo) demo.after(offBar); else if (main) main.prepend(offBar);
  const paintOnline = () => { offBar.hidden = navigator.onLine !== false; };
  window.addEventListener('offline', paintOnline);
  window.addEventListener('online', () => { paintOnline(); checkVersion(true); });
  paintOnline();

  /* 3) Barva lišty prohlížeče a okna aplikace podle motivu ATLASu (přepínač v aplikaci, ne nastavení systému –
        meta theme-color s media v index.html platí jen do spuštění skriptů). */
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const syncTheme = () => {
    const c = THEME[document.documentElement.dataset.theme] || THEME.dark;
    metas.forEach((m) => m.setAttribute('content', c));
  };
  if (window.MutationObserver) new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  syncTheme();

  /* 4) 📲 Přidat ATLAS na plochu – v postranním panelu (počítač, tablet) a v nabídce „Více“ (mobil). Chrome, Edge
        a Android: dialog prohlížeče (beforeinstallprompt); iPhone a iPad: krátký návod. Z plochy se nenabízí. */
  const LABEL = '📲 Přidat ATLAS na plochu';
  let promptEvent = null;
  const standaloneMq = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
  const mode = () => installMode({
    standalone: Boolean(standaloneMq && standaloneMq.matches) || navigator.standalone === true,
    prompt: Boolean(promptEvent), ua: navigator.userAgent, platform: navigator.platform, touch: navigator.maxTouchPoints || 0,
  });
  const side = document.createElement('button');
  side.type = 'button';
  side.id = 'pwaInstall';
  side.className = 'theme-toggle pwa-install';
  side.textContent = LABEL;
  side.onclick = () => install();
  const toggle = $('#themeToggle');
  if (toggle) toggle.before(side);
  function paintInstall() {
    const m = mode();
    side.hidden = !m;
    document.querySelectorAll('.pwa-menu-item').forEach((b) => { b.hidden = !m; });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // bez automatické lišty prohlížeče – nabídka je v aplikaci
    promptEvent = e;
    paintInstall();
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    paintInstall();
    if (typeof toast === 'function') toast('ATLAS je na ploše – otevřeš ho jako aplikaci');
  });
  if (standaloneMq && standaloneMq.addEventListener) standaloneMq.addEventListener('change', paintInstall);
  paintInstall();

  async function install() {
    if (typeof modalClose === 'function') modalClose();
    if (promptEvent) {
      const ev = promptEvent;
      promptEvent = null; // dialog prohlížeče jde z jedné události ukázat jen jednou
      try { await ev.prompt(); } catch (e) { /* prohlížeč dialog teď ukázat nechce */ }
      paintInstall();
    } else if (mode() === 'ios') iosHint();
  }

  const SHARE_ICO = '<svg class="pwa-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Sdílet"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/></svg>';
  function iosHint() {
    if (typeof modalOpen !== 'function') return;
    const close = typeof ico === 'function' ? ico('M18 6L6 18M6 6l12 12') : '×';
    modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" onclick="modalClose()" aria-label="Zavřít">${close}</button>
      <div class="modal-hero-inner"><h2 class="pwa-h">📲 ATLAS na plochu</h2><div class="pwa-sub">iPhone a iPad · pár vteřin</div></div></div>
      <div class="modal-body"><ol class="pwa-steps">
        <li>Klepni na <b>Sdílet</b> ${SHARE_ICO} – v Safari dole uprostřed, na iPadu nahoře vedle adresy.</li>
        <li>Sjeď níž a vyber <b>Přidat na plochu</b>.</li>
        <li>Potvrď <b>Přidat</b>. ATLAS se pak otevře jako aplikace přes celou obrazovku a uložené cesty a plány uvidíš i bez internetu.</li>
      </ol></div>`);
  }

  /** Položka v nabídce „Více“ na mobilu (app.js ji přidá při otevření nabídky). */
  api.addToMenu = (list) => {
    if (!list) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ghost pwa-menu-item';
    b.innerHTML = `${LABEL} <span class="faint">i offline</span>`;
    b.onclick = () => install();
    b.hidden = !mode();
    list.append(b);
  };

  /* 5) Service worker (jen https a localhost) a upozornění „Je k dispozici nová verze“: verze stránky = verze na
        serveru v době načtení (soubory jsou vždy ze sítě), u stránky otevřené offline verze uložené kopie (řekne
        service worker). Když server později hlásí jinou verzi (nasazení), nabídne se „Obnovit“ – nic se neobnovuje
        samo, aby se neztratil rozepsaný formulář nebo výsledky hledání. */
  const sw = navigator.serviceWorker;
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  let reg = null, mine = null, lastCheck = 0, dismissed = null, updBar = null;
  const serverBuild = () => nativeFetch('sw.js', { method: 'HEAD', cache: 'no-store' }).then((r) => (r.ok && r.headers.get('x-atlas-build')) || null);
  // dotaz na service worker, který stránku obsluhuje: 'atlas-build' (verze uložené sady), 'atlas-served' ('cache' =
  // stránka otevřená z uložené kopie, protože síť nebo server nestihly odpovědět) → odpověď, nebo null
  const askSw = (msg) => new Promise((resolve) => {
    if (!sw || !sw.controller || typeof MessageChannel !== 'function') return resolve(null);
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), 2000);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(typeof e.data === 'string' ? e.data : null); };
    sw.controller.postMessage(msg, [ch.port2]);
  });
  const cachedBuild = () => askSw('atlas-build');

  async function checkVersion(force) {
    if (!mine || !nativeFetch || navigator.onLine === false || (!force && Date.now() - lastCheck < 5 * 60e3)) return;
    lastCheck = Date.now();
    if (reg) reg.update().catch(() => { });
    const b = await serverBuild().catch(() => null);
    if (b && b !== mine && b !== dismissed) showUpdate(b);
  }
  function showUpdate(b) {
    if (!updBar) {
      updBar = document.createElement('div');
      updBar.className = 'pwa-update';
      updBar.setAttribute('role', 'status');
      updBar.innerHTML = '<span>✨ Je k dispozici nová verze ATLASu</span><button type="button" class="btn sm primary">Obnovit</button><button type="button" class="pwa-x" aria-label="Zavřít" title="Později">×</button>';
      updBar.querySelector('.btn').onclick = () => location.reload();
      updBar.querySelector('.pwa-x').onclick = () => { updBar.hidden = true; dismissed = updBar.dataset.build; };
      document.body.append(updBar);
    }
    updBar.dataset.build = b;
    updBar.hidden = false;
  }

  window.addEventListener('load', async () => {
    if (sw && secure) {
      sw.register('sw.js', { updateViaCache: 'none' })
        .then((r) => { reg = r; })
        .catch((e) => console.warn('ATLAS: service worker se nepodařilo zaregistrovat –', e && e.message));
    }
    if (!nativeFetch) return;
    // verze stránky: ze sítě = verze na serveru; z uložené kopie (offline, pomalá síť, uspaný server) = uložená sada –
    // po probuzení serveru se hned ověří, jestli není novější (checkVersion)
    const fromCache = (await askSw('atlas-served')) === 'cache';
    mine = fromCache ? null : await serverBuild().catch(() => null);
    if (!mine) mine = await cachedBuild();
    lastCheck = Date.now();
    if (fromCache) { lastCheck = 0; checkVersion(true); }
    setInterval(() => checkVersion(), 30 * 60e3);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
  });
})();
