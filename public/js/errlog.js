/* ATLAS – hlášení chyb z prohlížeče bez placené služby: nezachycená chyba (window error) a neošetřené odmítnutí
   (unhandledrejection) se pošle POST na api/client-error (server/lib/clienterr.js → řádek v logu Renderu). Načítá se
   v <head> před ostatními skripty, aby zachytil i chybu při jejich startu. Nejvýš 1 hlášení za 10 s a 20 za relaci,
   max 2 KB: zpráva, soubor:řádek, verze buildu a zkrácený prohlížeč – adresy bez ?query a #hash (nesou hledání či
   sdílený plán), bez e-mailů a dlouhých čísel. Chyby z rozšíření prohlížeče se ignorují. Uživateli se nic neukazuje. */
(function () {
  const MAX_BYTES = 2048;
  const GAP_MS = 10e3;
  const PER_SESSION = 20;
  const EXT_RE = /(?:chrome|moz|safari(?:-web)?|ms-browser|edge)-extension:\/\/|webkit-masked-url:|^resource:\/\//i;

  /** Adresa bez ?query a #hash; skript ATLASu jen jako cesta (js/app.js), ne celá adresa. */
  function cleanUrl(s, origin) {
    let out = String(s || '').replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#]*|\/[^\s?#]*)[?#][^\s:]*/gi, '$1');
    if (origin) out = out.split(origin + '/').join('');
    return out;
  }

  /** Text bez osobních údajů: e-maily a dlouhá čísla (telefon, číslo rezervace či karty) pryč, adresy bez query. */
  function scrub(s, origin) {
    return cleanUrl(s, origin)
      .replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '[e-mail]')
      .replace(/\+?\d[\d ]{6,}\d/g, '[číslo]')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Zkrácený user-agent: prohlížeč s hlavní verzí a systém (např. „Chrome 130 · Android 14“). */
  function shortUa(ua) {
    ua = String(ua || '');
    const b = ua.match(/\b(Edg|EdgA|EdgiOS|OPR|SamsungBrowser|CriOS|FxiOS|Firefox|Chrome)\/(\d+)/) || ua.match(/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/);
    const browser = b ? (b.length > 2 ? `${b[1]} ${b[2]}` : `Safari ${b[1]}`) : '';
    // v pořadí podle přednosti (Android uvádí i „Linux“, iPhone i „Mac OS X“)
    const o = [/Android \d+/, /(?:iPhone|CPU) OS \d+(?:_\d+)?/, /iPad/, /Windows NT [\d.]+/, /Mac OS X [\d_]+/, /CrOS/, /Linux/].map((re) => ua.match(re)).find(Boolean);
    const os = o ? o[0].replace(/(?:iPhone|CPU) OS/, 'iOS').replace(/_/g, '.') : '';
    return [browser, os].filter(Boolean).join(' · ') || ua.slice(0, 60);
  }

  /** První řádek zásobníku se souborem (soubor:řádek:sloupec) – u odmítnutého Promise jiný údaj o místě není. */
  function stackSrc(stack) {
    const m = String(stack || '').match(/((?:[a-z][a-z0-9+.-]*:\/\/)?[^\s()@]+\.js[^\s()]*?:\d+(?::\d+)?)/i);
    return m ? m[1] : '';
  }

  /**
   * Hlášení z události: { kind, msg, src, build, ua } (JSON do 2 KB), nebo null, když hlásit nemá smysl
   * (rozšíření prohlížeče, cizí skript bez podrobností „Script error.“, prázdná zpráva).
   */
  function makeReport(ev, { origin = '', build = '', ua = '' } = {}) {
    if (!ev) return null;
    const rejection = ev.type === 'unhandledrejection';
    const err = rejection ? ev.reason : ev.error;
    const stack = err && typeof err === 'object' && typeof err.stack === 'string' ? err.stack : '';
    let msg = rejection
      ? (err && typeof err === 'object' ? `${err.name || 'Error'}: ${err.message || ''}` : String(err))
      : String(ev.message || (err && err.message) || '');
    let src = !rejection && ev.filename ? `${ev.filename}:${ev.lineno || 0}:${ev.colno || 0}` : stackSrc(stack);
    if (EXT_RE.test(src) || EXT_RE.test(stack) || EXT_RE.test(msg)) return null;
    if (/^Script error\.?$/i.test(msg.trim()) && !src) return null;
    msg = scrub(msg, origin);
    if (!msg) return null;
    const r = { kind: rejection ? 'rejection' : 'error', msg: msg.slice(0, 500), src: cleanUrl(src, origin).slice(0, 200), build: String(build || '').slice(0, 40), ua: shortUa(ua).slice(0, 80) };
    // pojistka na 2 KB (vícebajtové znaky): zkracuje se zpráva
    while (new TextEncoder().encode(JSON.stringify(r)).length > MAX_BYTES && r.msg.length > 20) r.msg = r.msg.slice(0, Math.floor(r.msg.length * 0.8));
    return r;
  }

  /** Brzda: nejvýš 1 hlášení za 10 s a 20 za relaci (stejná chyba v nekonečné smyčce nezahltí server ani data). */
  function limiter({ gap = GAP_MS, max = PER_SESSION } = {}) {
    let last = -Infinity, sent = 0;
    return (now) => {
      if (sent >= max || now - last < gap) return false;
      last = now;
      sent++;
      return true;
    };
  }

  const api = { makeReport, limiter, shortUa, cleanUrl, scrub, stackSrc, MAX_BYTES };
  window.ErrLog = api;
  if (typeof document === 'undefined' || !document.documentElement || typeof window.addEventListener !== 'function') return; // testy v node:vm

  // vlastní kopie fetch: pwa.js ji později obalí (hlášky sítě) a chyba při odeslání se nesmí hlásit znovu
  const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  const allow = limiter();
  const build = () => {
    const m = document.querySelector('meta[name="atlas-build"]');
    return (m && m.getAttribute('content')) || '';
  };
  function report(ev) {
    try {
      if (!nativeFetch) return;
      const r = makeReport(ev, { origin: location.origin, build: build(), ua: navigator.userAgent });
      if (!r || !allow(Date.now())) return;
      nativeFetch(new URL('api/client-error', document.baseURI).href, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r), keepalive: true, credentials: 'omit',
      }).catch(() => {});
    } catch (e) { /* hlášení chyby nesmí samo způsobit další chybu */ }
  }
  window.addEventListener('error', (ev) => { if (!ev.target || ev.target === window) report(ev); }, true);
  window.addEventListener('unhandledrejection', report);
})();
