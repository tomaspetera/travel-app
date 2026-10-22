// Chyby z prohlížeče (public/js/errlog.js → POST /api/client-error) bez placené služby: jeden řádek do konzole
// (vidět v logu Renderu) a posledních 50 v paměti. Klient už hlášení zkracuje a čistí, server mu ale nevěří –
// ořízne délky, odstraní řídicí znaky (podvržený konec řádku by v logu vyrobil falešný záznam) a query/hash adres.

export const MAX_BODY = 4 * 1024; // klient posílá nejvýš 2 KB; víc = něco jiného než errlog.js
const KEEP = 50;
const LEN = { msg: 500, src: 200, build: 40, ua: 80 };

// Skripty rozšíření prohlížeče (překladače, blokátory reklam…) – jejich chyby nejsou chyby ATLASu
export const EXTENSION_RE = /(?:chrome|moz|safari(?:-web)?|ms-browser|edge)-extension:\/\/|webkit-masked-url:|^resource:\/\//i;

// řídicí znaky (Cc) i oddělovače řádku a odstavce z Unicode (Zl, Zp) → mezera; zbytek na jeden řádek
const oneLine = (s, max) => String(s).replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// adresa bez ?query a #hash (mohou nést údaje z hledání nebo sdíleného plánu)
export const stripUrl = (s) => String(s).replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#]*|\/[^\s?#]*)[?#][^\s:]*/gi, '$1');

/** Hlášení z těla požadavku → { kind, msg, src, build, ua }, nebo null (neplatné, prázdné či z rozšíření prohlížeče). */
export function cleanReport(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.msg !== 'string') return null;
  const str = (k) => (typeof b[k] === 'string' || typeof b[k] === 'number' ? oneLine(stripUrl(b[k]), LEN[k]) : '');
  const msg = str('msg');
  const src = str('src');
  if (!msg || EXTENSION_RE.test(src) || EXTENSION_RE.test(b.msg)) return null;
  const build = str('build');
  return {
    kind: b.kind === 'rejection' ? 'rejection' : 'error', msg, src,
    build: /^[\w.-]+$/.test(build) ? build : '', ua: str('ua'),
  };
}

// Strop řádků v logu za hodinu ze všech adres dohromady: limit 30 za hodinu na adresu (server/index.js) obejde, kdo
// v každém požadavku podvrhne jinou X-Forwarded-For – falešná hlášení by zaplavila log Renderu a skutečné chyby by
// v něm zapadly. I chyba, která potká všechny uživatele, tak má v logu dost příkladů a celkový počet ukáže /api/health.
export const LOG_PER_HOUR = 120;
let hourAt = 0, inHour = 0;

const recent = [];
let total = 0;

/** Uloží hlášení (nejnovější na konci, nejvýš 50) a vrátí řádek pro log; nad hodinový strop null (jen se započte). */
export function recordClientError(r, at = new Date()) {
  const t = at.getTime();
  if (t < hourAt || t - hourAt >= 3600e3) { hourAt = t; inHour = 0; }
  if (inHour >= LOG_PER_HOUR) { total++; return null; }
  inHour++;
  recent.push({ at: at.toISOString(), ...r });
  if (recent.length > KEEP) recent.splice(0, recent.length - KEEP);
  total++;
  return `Chyba v prohlížeči (${r.kind}): ${r.msg}${r.src ? ` @ ${r.src}` : ''} [${r.build || '?'}] ${r.ua || '?'}`;
}

/** Počet hlášení od startu serveru (do /api/health – obsah hlášení se ven neposílá). */
export const clientErrorCount = () => total;
export const recentClientErrors = () => recent.slice();
