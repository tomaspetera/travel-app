// Ochrana veřejně nasazeného serveru: bezpečnostní hlavičky, Content-Security-Policy stránky aplikace, adresa klienta
// pro limity a požadavky na API z cizích webů.
import { createHash } from 'node:crypto';

/**
 * Hlavičky u každé odpovědi (stránka, soubory, API):
 * - nosniff: prohlížeč nehádá typ souboru (JSON nebo obrázek se nespustí jako stránka či skript),
 * - X-Frame-Options (a frame-ancestors v CSP): ATLAS nejde vložit do rámu cizí stránky (podstrčené klikání),
 * - Referrer-Policy: cizí weby (aerolinky, hotely, mapy) dostanou jen adresu webu, ne cestu,
 * - HSTS: prohlížeč chodí jen přes HTTPS (Render HTTPS má; přes http – místní běh – hlavičku prohlížeč nebere),
 * - Permissions-Policy: kamera, mikrofon, platby ani USB nikdy; poloha jen pro ATLAS sám (📍 Moje poloha).
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
};

/** CSP u odpovědí API (JSON, dlaždice): nic z nich se nemá vykreslit jako stránka. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

// Kam stránka smí sahat mimo vlastní server – co aplikace opravdu používá (public/js): počasí a hledání míst v okně země
// (Open-Meteo), kurzy (open.er-api.com), podklad mapy (OpenFreeMap, OpenStreetMap – MapLibre je stahuje fetch() i ve
// svém workeru) a písmo z Google Fonts. Obrázky (fotky měst z Wikimedie, Unsplash, Pexels, hotelů, logo Mapy.com)
// z jakéhokoli https – zdrojů je mnoho a obrázek kód nespustí.
const CONNECT = ['https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com', 'https://open.er-api.com', 'https://tiles.openfreemap.org', 'https://tile.openstreetmap.org'];

/** Otisky (sha256) vložených <script> bez src v HTML – přesně to, co prohlížeč spustí (konce řádků jako po parseru HTML). */
export function inlineScriptHashes(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\ssrc\s*=/i.test(m[1])) continue;
    const h = `'sha256-${createHash('sha256').update(m[2].replace(/\r\n?/g, '\n')).digest('base64')}'`;
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

/**
 * Content-Security-Policy stránky aplikace: skripty jen z vlastního serveru a vložené skripty z index.html podle otisku
 * (spočítaného z obsahu – úprava skriptu v index.html CSP nerozbije). Obsluhy událostí v atributech HTML (onclick) ani
 * javascript: odkazy se nespustí – text z cizích zdrojů (Wikidata, hotely, sdílené odkazy) vložený do stránky tak kód
 * nespustí, ani kdyby se někde zapomnělo na esc(). Styly i vložené (style="…" používá celá aplikace), workery i z blob:
 * (MapLibre), formuláře jen sem, <base> jen vlastní, žádné pluginy (object) a žádné vložení do cizího rámu.
 */
export function pageCsp(html) {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(html).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${CONNECT.join(' ')}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/* ---------- adresa klienta pro limity ---------- */

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * Adresa jako klíč limitu: IPv4 celá, IPv6 jen síť /64 (jedna přípojka jich má miliardy – po jedné by limit obešel
 * kdokoli), IPv4 zapsaná jako IPv6 (::ffff:1.2.3.4) jako IPv4. Cokoli jiného (nesmysl, dlouhý text) → '' – dlouhé
 * podvržené klíče by v paměti limitů zabraly stovky MB.
 */
export function ipKey(raw) {
  let s = String(raw ?? '').trim();
  if (!s || s.length > 64) return '';
  s = s.replace(/^\[(.*)\]$/, '$1').replace(/%[\w.-]+$/, ''); // [2001:db8::1], fe80::1%eth0
  if (IPV4.test(s)) return s;
  if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(':')) return '';
  const mapped = /^(?:0{0,4}:){0,5}:?ffff:((?:\d{1,3}\.){3}\d{1,3})$/i.exec(s) || /^::((?:\d{1,3}\.){3}\d{1,3})$/.exec(s);
  if (mapped) return IPV4.test(mapped[1]) ? mapped[1] : '';
  const halves = s.split('::');
  if (halves.length > 2) return '';
  const part = (h) => (h ? h.split(':') : []);
  const head = part(halves[0]);
  const tail = halves.length === 2 ? part(halves[1]) : [];
  // vložená IPv4 na konci (64:ff9b::1.2.3.4) = dvě skupiny
  const all = [...head, ...tail];
  const last = all.at(-1) || '';
  const v4 = last.includes('.');
  if ((v4 && !IPV4.test(last)) || all.slice(0, -1).some((g) => g.includes('.'))) return '';
  const groups = head.length + tail.length + (v4 ? 1 : 0);
  if ((halves.length === 1 && groups !== 8) || groups > 8) return '';
  const hex = [...head, ...(halves.length === 2 ? Array(8 - groups).fill('0') : []), ...tail].filter((g) => !g.includes('.'));
  if (hex.length < 4 || !hex.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return '';
  return `${hex.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

let toldSource = false;
/**
 * Adresa klienta pro limity. Na Renderu je před serverem Cloudflare (odpovědi mají server: cloudflare, cf-ray) a ten
 * do požadavku dá CF-Connecting-IP se skutečnou adresou (podvrženou hlavičku od klienta přepíše). První adresu
 * v X-Forwarded-For ale posílá klient, jakou chce: limit podle ní obešel kdokoli, kdo ji v každém požadavku změnil.
 * X-Forwarded-For (první) zůstává jen pro běh bez Cloudflare (místně, testy, jiný hosting), pak adresa spojení.
 */
export function clientIp(req) {
  const h = req.headers || {};
  const cf = ipKey(h['cf-connecting-ip']);
  if (process.env.RENDER && !toldSource) {
    toldSource = true; // jednou do logu Renderu: z čeho limity berou adresu (ověření bez dalších dotazů)
    console.log(cf ? 'Limity: adresa klienta z CF-Connecting-IP (Cloudflare)' : 'Limity: CF-Connecting-IP chybí – adresa z X-Forwarded-For, klient ji může podvrhnout');
  }
  if (cf) return cf;
  return ipKey(String(h['x-forwarded-for'] || '').split(',')[0]) || ipKey(req.socket?.remoteAddress) || 'neznámá';
}

/**
 * Požadavek z cizího webu: skript, obrázek nebo formulář na jiné stránce (Sec-Fetch-Site: cross-site – posílají ho
 * všechny dnešní prohlížeče; curl a jiné programy ne). Cizí stránka by jinak mohla své návštěvníky nechat hledat lety,
 * místa a fotky za jejich adresy – limit na adresu by neplatil a vyčerpané zdroje (Wikidata, Pexels, Open-Meteo) by
 * chyběly všem. Otevření adresy API odkazem (navigace, např. /api/health z jiného webu) projde.
 */
export const crossSite = (req) => req.headers['sec-fetch-site'] === 'cross-site' && req.headers['sec-fetch-mode'] !== 'navigate';
