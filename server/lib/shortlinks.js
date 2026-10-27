// Krátké odkazy na sdílenou cestu nebo plán: /c/Ab3kQ9xZ místo #trip=… s tisíci znaky. Dlouhý odkaz nese celou cestu
// za # (na server nejde nic), jenže ve WhatsAppu je to stěna písmen a náhled je obecný. Krátký odkaz potřebuje cestu
// uložit: jen když ji uživatel sám sdílí (okno Sdílet, klepnutí na Sdílet), bez jména a kódů rezervací (ty odkaz
// nenese), na 400 dní. Úložiště je Upstash Redis přes REST (zdarma 500 000 příkazů a 256 MB měsíčně, bez závislostí –
// jen fetch); Render zdarma po restartu soubory maže. Bez klíčů (UPSTASH_REDIS_REST_URL a _TOKEN) jsou krátké odkazy
// vypnuté a aplikace pošle dlouhý odkaz jako dřív; v demu (ATLAS_MOCK) úložiště v paměti.
// Stránka /c/<id> má vlastní náhled odkazu (cíl a termín, fotka cíle) a hned přesměruje do aplikace na /#s=<id>;
// aplikace si cestu stáhne (/api/share/<id>) a otevře ji jako dřív odkaz #trip= / #plan=.
import { randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import { request } from './http.js';

export const ID_RE = /^[A-Za-z0-9]{8}$/;
export const KINDS = ['trip', 'plan'];
export const MAX_JSON = 200_000; // znaků JSON – cesta přes tři místa má ~18 000, plán z plánovače nejvýš ~110 000
export const TTL_DAYS = 400;
// bez 0/O a 1/l/I – odkaz jde přečíst a opsat
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export const newId = (rnd = randomBytes) => [...rnd(8)].map((b) => ALPHA[b % ALPHA.length]).join('');

/** Upstash Redis přes REST: příkaz jako pole v těle POST (https://upstash.com/docs/redis/features/restapi). */
export function upstashStore(url, token, req = request) {
  const cmd = (args, retries = 1) => req(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: args, timeoutMs: 6000, retries })
    .then((j) => (j && j.result !== undefined ? j.result : null));
  return {
    kind: 'upstash',
    get: (k) => cmd(['GET', k]),
    // NX: existující klíč nepřepíše (shoda náhodného id) → false; bez opakování – druhý pokus by po ztracené odpovědi
    // na první skončil jako „klíč už je“
    add: (k, v, ttlSec) => cmd(['SET', k, v, 'EX', String(ttlSec), 'NX'], 0).then((r) => r === 'OK'),
  };
}

/** Úložiště v paměti (demo, testy): po restartu serveru prázdné – proto jen bez ostrého úložiště. */
export function memoryStore(now = Date.now) {
  const m = new Map();
  return {
    kind: 'memory',
    get: async (k) => { const e = m.get(k); if (!e || e.until < now()) { m.delete(k); return null; } return e.v; },
    add: async (k, v, ttlSec) => { if (m.has(k)) return false; m.set(k, { v, until: now() + ttlSec * 1000 }); if (m.size > 2000) m.delete(m.keys().next().value); return true; },
  };
}

/**
 * Mezipaměť serveru před Upstash: uložená cesta se nemění, takže stačí ji načíst jednou – každé otevření odkazu jsou
 * jinak dva příkazy (/c/ a /api/share/) a náhledy sítí (WhatsApp, Facebook, Telegram) stránku stahují znovu; strop
 * zdarma je 500 000 příkazů měsíčně. Neexistující id si pamatuje 10 minut (zkoušení náhodných id). Nejvýš max
 * záznamů (~7 kB jeden). has(k) = odpověď bude bez dotazu do úložiště (do limitu adresy se nepočítá).
 */
export function cachedStore(store, { max = 300, missMs = 10 * 60e3, now = Date.now } = {}) {
  const hits = new Map(); // nejdéle nepoužitý na začátku
  const misses = new Map(); // id → do kdy platí „neexistuje“
  const keep = (k, v) => { hits.delete(k); hits.set(k, v); if (hits.size > max) hits.delete(hits.keys().next().value); };
  const missing = (k) => (misses.get(k) || 0) > now();
  return {
    kind: store.kind,
    has: (k) => hits.has(k) || missing(k),
    async get(k) {
      if (hits.has(k)) { const v = hits.get(k); keep(k, v); return v; }
      if (missing(k)) return null;
      const v = await store.get(k);
      if (typeof v === 'string') keep(k, v);
      else { misses.set(k, now() + missMs); if (misses.size > 10 * max) misses.delete(misses.keys().next().value); }
      return v;
    },
    async add(k, v, ttlSec) {
      const ok = await store.add(k, v, ttlSec);
      if (ok) { misses.delete(k); keep(k, v); }
      return ok;
    },
  };
}

// text z cizí cesty do náhledu: bez řídicích znaků a HTML (do stránky jde ještě přes esc)
const txt = (v, n) => (typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f<>"`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
// i platný měsíc a den – podvržený odkaz s „2026-13-01“ by jinak dal náhled „Řím undefined“
const ymd = (v) => (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) ? v : null);
/** „3.–8. 11.“, přes měsíc „28. 10.–3. 11.“, jen odlet „od 3. 11.“ */
export function datesTxt(a, b) {
  if (!a) return '';
  const d = (s) => +s.slice(8, 10), m = (s) => +s.slice(5, 7);
  if (!b || b < a) return `od ${d(a)}. ${m(a)}.`;
  return m(a) === m(b) && a.slice(0, 4) === b.slice(0, 4) ? `${d(a)}.–${d(b)}. ${m(a)}.` : `${d(a)}. ${m(a)}.–${d(b)}. ${m(b)}.`;
}

/** Náhled odkazu z obsahu: { title, desc, place } – place = název místa pro fotku. */
export function metaOf(kind, o) {
  if (kind === 'trip') {
    const f = o && o.flight ? o.flight : {}, ov = o && o.overland ? o.overland : null;
    const bases = o && o.route && o.route.fixed === 'flights' && Array.isArray(o.route.bases) ? o.route.bases.map((b) => txt(b && b.name, 40)).filter(Boolean) : [];
    const place = txt(o && o.dest && o.dest.label, 60) || bases[0] || '';
    const name = bases.length > 1 ? bases.join(' → ') : place;
    const out = ymd((ov && ov.out && ov.out.date) || (f.out && f.out.date)), back = ymd((ov && ov.back && ov.back.date) || (f.back && f.back.date));
    return { title: txt(`${name || 'Cesta'} ${datesTxt(out, back)}`, 90), desc: 'Let, ubytování a program po dnech – otevři cestu v ATLASu a ulož si ji.', place };
  }
  const place = txt(o && o.dest, 60), name = txt(o && o.name, 70) || place || 'Plán cesty';
  const dates = datesTxt(ymd(o && o.start), ymd(o && o.end));
  return { title: txt(name.includes(dates) || !dates ? name : `${name} · ${dates}`, 90), desc: 'Plán cesty z ATLASu – program po dnech, otevři ho a ulož si ho.', place };
}

/**
 * Uloží sdílenou cestu (kind 'trip') nebo plán ('plan') → id. json = text JSON, jak ho nese dlouhý odkaz; neplatný
 * nebo příliš velký → výjimka s .status 400. photo(place) → adresa fotky do náhledu (nebo null).
 */
export async function createShare(store, kind, json, { photo = async () => null, now = Date.now, id = newId } = {}) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  if (!KINDS.includes(kind)) throw bad('Neznámý druh odkazu.');
  if (typeof json !== 'string' || !json.length || json.length > MAX_JSON) throw bad('Cesta chybí nebo je příliš velká.');
  let o;
  try { o = JSON.parse(json); } catch (e) { throw bad('Cesta není platná.'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw bad('Cesta není platná.');
  if (kind === 'trip' && !(o.flight && o.flight.out && typeof o.flight.out.date === 'string')) throw bad('Cesta nemá let.');
  const m = metaOf(kind, o);
  let img = null;
  try { img = m.place ? await photo(m.place) : null; } catch (e) { img = null; }
  const rec = JSON.stringify({ k: kind, z: zlib.deflateRawSync(json).toString('base64'), m: { title: m.title, desc: m.desc, ...(img ? { img } : {}) }, t: now() });
  for (let i = 0; i < 4; i++) {
    const key = id();
    if (await store.add('s:' + key, rec, TTL_DAYS * 86400)) return key;
  }
  throw Object.assign(new Error('Odkaz se nepodařilo uložit.'), { status: 503 });
}

/** Uložený odkaz → { k, j (JSON text), m } | null (neplatné id, vypršelý, poškozený). */
export async function loadShare(store, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  const raw = await store.get('s:' + id);
  if (typeof raw !== 'string') return null;
  try {
    const r = JSON.parse(raw);
    if (!KINDS.includes(r.k)) return null;
    return { k: r.k, j: zlib.inflateRawSync(Buffer.from(r.z, 'base64')).toString('utf8'), m: r.m || {} };
  } catch (e) {
    return null;
  }
}

/** Fotka města z api/photos ve výřezu náhledu odkazu 1200 × 630 (Pexels / Unsplash); Wikimedia širší náhled. */
export function ogPhoto(u) {
  if (typeof u !== 'string' || !/^https:\/\/[^\s"'<>]+$/.test(u)) return null;
  if (/^https:\/\/images\.(pexels|unsplash)\.com\//.test(u)) return u.replace(/w=\d+&h=\d+/, 'w=1200&h=630');
  return u.replace('/960px-', '/1200px-');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/**
 * Stránka /c/<id>: náhled odkazu (WhatsApp, Messenger, Facebook čtou jen meta značky) a hned přesměrování do aplikace
 * (/#s=<id>) – bez skriptu, CSP stránky ho nepotřebuje. base = veřejná adresa webu, fallbackImg = obecný náhled.
 */
// Roboti náhledů odkazů (Facebook, WhatsApp, Messenger, Telegram…): bez přesměrování – některé ho následují a náhled
// by pak byl obecný z úvodní stránky místo cíle a termínu cesty.
export const PREVIEW_BOT = /facebookexternalhit|facebookcatalog|meta-externalagent|WhatsApp|Twitterbot|TelegramBot|Slackbot|Discordbot|LinkedInBot|Pinterest|SkypeUriPreview|Viber|Applebot|Googlebot|bingbot/i;
export function sharePage(id, rec, base, fallbackImg, { bot = false } = {}) {
  const m = rec.m || {};
  return previewPage({ url: `${base}/c/${id}`, to: `/#s=${id}`, title: m.title || 'Cesta z ATLASu', desc: m.desc, img: m.img, wait: 'Otevírám cestu v ATLASu…' }, fallbackImg, { bot });
}

/* ---------- Pozvánka „Jede někdo se mnou?“ /j/<data>: náhled odkazu bez úložiště ---------- */
// Odkaz z karty na sítě (public/js/sharecard.js) nese cíl, termín a odkud přímo v adrese – dřív jen za #jed=, kam
// WhatsApp, Messenger ani Facebook nevidí (náhled byl obecný ATLAS). Pod /j/ je server přečte: náhled s otázkou,
// cílem, měsícem a fotkou cíle a hned přesměrování do aplikace na /#jed=<data>. Nic se neukládá, Upstash netřeba.
// Formát jako za # (sharelink.js pack): „z“ + deflate-raw v base64url, nebo starší base64url JSON.
export const INVITE_RE = /^[A-Za-z0-9_-]{8,2000}$/;
const MONTHS_IN = ['v lednu', 'v únoru', 'v březnu', 'v dubnu', 'v květnu', 'v červnu', 'v červenci', 'v srpnu', 'v září', 'v říjnu', 'v listopadu', 'v prosinci'];
/** Data pozvánky z adresy → { title, desc, place } | null (poškozená nebo cizí data). Přesné datum ne – jako na kartě. */
export function inviteMeta(data) {
  if (!INVITE_RE.test(String(data || ''))) return null;
  try {
    const z = data[0] === 'z', buf = Buffer.from(z ? data.slice(1) : data, 'base64url');
    // karta má pár desítek bajtů – víc rozbalovat nemá smysl (kompresní bomba)
    const o = JSON.parse((z ? zlib.inflateRawSync(buf, { maxOutputLength: 4096 }) : buf).toString('utf8'));
    const dest = txt(o && o.d, 60), out = ymd(o && o.o), from = txt(o && o.f, 40);
    if (!dest || !out || (o.v != null && o.v !== 1)) return null;
    return {
      title: `Jede někdo se mnou? ${dest} ${MONTHS_IN[+out.slice(5, 7) - 1]} ✈️`,
      desc: `${from ? `Odlet: ${from}. ` : ''}Klepni na termín a najdi si lety ze svého letiště – v ATLASu, zdarma a bez registrace.`,
      place: dest,
    };
  } catch (e) {
    return null;
  }
}
/** Stránka /j/<data>: náhled pozvánky a přesměrování do aplikace (jako /c/). */
export function invitePage(data, m, base, fallbackImg, { bot = false } = {}) {
  return previewPage({ url: `${base}/j/${data}`, to: `/#jed=${data}`, title: m.title, desc: m.desc, img: m.img, wait: 'Otevírám pozvánku v ATLASu…' }, fallbackImg, { bot });
}

function previewPage({ url, to, title, desc = '', img = null, wait }, fallbackImg, { bot = false } = {}) {
  const meta = (k, v, a = 'property') => `<meta ${a}="${k}" content="${esc(v)}">`;
  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ATLAS</title>
${meta('description', desc || '', 'name')}
${meta('robots', 'noindex', 'name')}
${meta('og:type', 'website')}
${meta('og:site_name', 'ATLAS')}
${meta('og:locale', 'cs_CZ')}
${meta('og:url', url)}
${meta('og:title', title)}
${meta('og:description', desc || '')}
${meta('og:image', img || fallbackImg)}
${img ? '' : `${meta('og:image:width', '1200')}\n${meta('og:image:height', '630')}\n`}${meta('twitter:card', 'summary_large_image', 'name')}
${bot ? '' : `<meta http-equiv="refresh" content="0;url=${esc(to)}">\n`}<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#eef2fb;color:#0f1830}a{color:#1d4ed8;font-weight:700}</style>
</head><body><p>${esc(wait)} <a href="${esc(to)}">Otevřít</a></p></body></html>`;
}
