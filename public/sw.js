/* ATLAS – service worker: aplikace se otevře i bez internetu (uložené cesty a plány), ale nikdy neukáže starý kód.
   - Stránka a soubory aplikace (HTML, JS, CSS, vendor/, data/*.json): vždy nejdřív ze sítě, a to s ověřením u serveru
     (cache: 'no-cache' – ne neověřená kopie z mezipaměti prohlížeče). Každou úspěšnou odpověď uloží; uloženou kopii
     použije, jen když síť selže (offline). Výjimka: skripty a styly s otiskem obsahu v adrese (js/app.js?v=…, doplní
     server do stránky) – obsah pod takovou adresou se nikdy nezmění, server je posílá s immutable, takže je stačí vzít
     z mezipaměti prohlížeče (Cloudflare) bez ptaní serveru; nová verze souboru = nová adresa, stará se tak nikdy
     nepodstrčí.
   - Stránku prohlížeč žádá ze sítě hned při otevření, souběžně se spouštěním service workeru (navigation preload –
     na telefonu se uspaný service worker probouzí i stovky ms). Ověření u serveru zajistí jeho Cache-Control: no-cache
     u stránky (server/lib/pwa.js serveIndex) – stejně jako u běžné navigace bez service workeru.
   - /api/*, jiné metody než GET a cizí weby (dlaždice map, písma, partneři): do těch se service worker neplete –
     jdou rovnou na server, nic se neukládá; offline selžou a aplikace ukáže svou hlášku. Stejně krátký odkaz na cestu
     /c/<id> (a pozvánka /j/<data>): je to stránka serveru s náhledem a přesměrováním do aplikace, ne stránka aplikace – uložená místo ní by
     offline (i při pomalé síti) otevřela jen „Otevírám cestu…“ a přesměrovávala by pořád dokola.
   - Verzi (BUILD = otisk obsahu souborů aplikace) a seznam souborů k uložení při instalaci dosadí server
     (server/lib/pwa.js). Nová verze na serveru = jiný sw.js → prohlížeč nainstaluje nový service worker, ten si uloží
     novou sadu souborů, převezme otevřené stránky a staré mezipaměti smaže. Skripty pak z uložené sady jednou uloží
     znovu (rewriteScripts) – bez předkompilace z instalace, která na telefonu brzdila každý start. */
'use strict';

const BUILD = 'dev'; // server dosadí otisk obsahu aplikace
const PRECACHE = ['./']; // server dosadí stránku, soubory z index.html a data, která aplikace stahuje za běhu
const PREFIX = 'atlas-';
const CACHE = PREFIX + BUILD;
// Pomalá síť nebo uspaný server (Render zdarma se probouzí až minutu): stránka, která do PAGE_TIMEOUT ms nepřijde
// ze sítě, se otevře z uložené kopie a její soubory taky (stejná verze). Že je na serveru novější verze, pak řekne
// pwa.js („Je k dispozici nová verze – Obnovit“), stejně jako když se verze změní za běhu.
const PAGE_TIMEOUT = 1500;
// Klienti (otevřené stránky), jejichž soubory se berou z uložené sady bez ptaní serveru: dostali uloženou stránku, nebo
// stránku ze sítě se stejnou verzí (X-Atlas-Build = BUILD – otisk obsahu všech souborů, uložená sada je tedy totožná).
// Ušetří ověřování ~30 souborů u serveru při každém otevření; jiná verze = soubory dál ze sítě, nikdy starý kód.
const fromCache = new Set();

/**
 * Kam s požadavkem (čistá funkce – test/pwa.test.js):
 *   null     nechat být: vyřídí ho prohlížeč sám a nic se neukládá (API, POST, cizí weby, sw.js, /healthz, Range,
 *            krátký odkaz /c/<id>)
 *   'page'   navigace na stránku aplikace: síť, offline poslední uložená stránka
 *   'asset'  soubor aplikace: síť, offline uložená kopie
 * req = { method, url, mode, headers }, scope = adresa rozsahu service workeru (registration.scope).
 */
function route(req, scope) {
  if (req.method !== 'GET') return null;
  let url, base;
  try {
    url = new URL(req.url);
    base = new URL(scope);
  } catch (e) {
    return null;
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  const rel = url.pathname.slice(base.pathname.length);
  if (/^(?:api(?:\/|$)|[cj]\/|healthz$|sw\.js$)/.test(rel)) return null;
  if (req.headers && typeof req.headers.get === 'function' && req.headers.get('range')) return null;
  return req.mode === 'navigate' ? 'page' : 'asset';
}

const shellKey = () => self.registration.scope;

/** Otisk obsahu z adresy (js/app.js?v=…, server/lib/pwa.js versionAssets) – pod ní je vždy tentýž obsah –, nebo null. */
const hashOf = (url) => (String(url).match(/[?&]v=([0-9a-f]{8,})(?:&|#|$)/) || [])[1] || null;
const versioned = (url) => Boolean(hashOf(url));
// Pod adresu s otiskem se uloží jen obsah, který server potvrdil (X-Atlas-Hash = otisk z adresy). Jiný (během
// nasazení odpoví ještě starý server – bez potvrzení, s no-cache) by v uložené sadě zůstal do další verze; příště
// přijde správný.
const confirmed = (url, res) => !versioned(url) || res.headers.get('x-atlas-hash') === hashOf(url);

/**
 * Požadavek na síť s ověřením u serveru (cache: 'no-cache' – nikdy neověřená kopie z mezipaměti prohlížeče). Soubor
 * s otiskem v adrese beze změny: mezipaměť prohlížeče ho vrátí bez ptaní serveru a ověřit není co (server posílá
 * immutable jen pro obsah s tímto otiskem, jiný s no-cache – ten prohlížeč ověří sám).
 */
function fresh(req, kind) {
  if (kind === 'asset' && versioned(req.url)) return req;
  try {
    // Navigace: nový požadavek se stejnou adresou (navigační nejde přepsat); redirect: 'manual' = přesměrování
    // dostane prohlížeč jako u běžné navigace.
    return kind === 'page'
      ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' })
      : new Request(req, { cache: 'no-cache' });
  } catch (e) {
    return req; // neobvyklý požadavek: aspoň beze změny ze sítě – nikdy kvůli tomu kopie z mezipaměti
  }
}

/** Uložená kopie (u stránky poslední uložená stránka aplikace), nebo undefined. */
async function cached(req, kind) {
  const cache = await caches.open(CACHE);
  return (await cache.match(req)) || (kind === 'page' ? await cache.match(shellKey()) : undefined);
}

/**
 * Síť; offline uložená kopie. Stránka, která ze sítě nepřijde do PAGE_TIMEOUT, se vezme z uložené kopie (je-li) a
 * soubory takto otevřené stránky taky – pozdní odpověď ze sítě se zahodí (aspoň probudí server).
 */
async function networkFirst(event, kind) {
  const req = event.request;
  if (kind === 'asset' && event.clientId && fromCache.has(event.clientId)) {
    const hit = await cached(req, kind);
    if (hit) return hit;
  }
  // stránka: požadavek, který prohlížeč poslal už při spouštění service workeru (navigation preload); bez něj (starší
  // prohlížeč, nepovedený) nový požadavek jako dřív
  const net = kind === 'page'
    ? Promise.resolve(event.preloadResponse).then((r) => r || fetch(fresh(req, kind)), () => fetch(fresh(req, kind)))
    : fetch(fresh(req, kind));
  let res;
  try {
    if (kind === 'page') {
      let timer;
      const slow = new Promise((resolve) => { timer = setTimeout(resolve, PAGE_TIMEOUT, 'slow'); });
      const first = await Promise.race([net, slow]).finally(() => clearTimeout(timer));
      if (first === 'slow') {
        const hit = await cached(req, kind);
        if (hit) {
          if (event.resultingClientId) fromCache.add(event.resultingClientId);
          net.catch(() => { });
          return hit;
        }
      }
    }
    res = await net;
    if (kind === 'page' && res.status === 200 && event.resultingClientId && res.headers.get('x-atlas-build') === BUILD) fromCache.add(event.resultingClientId);
    // chyba serveru (5xx – třeba při probouzení) místo stránky aplikace: uložená stránka, je-li
    if (kind === 'page' && res.status >= 500) {
      const hit = await cached(req, kind);
      if (hit) {
        if (event.resultingClientId) fromCache.add(event.resultingClientId);
        return hit;
      }
    }
  } catch (err) {
    const hit = await cached(req, kind);
    if (hit) return hit;
    throw err;
  }
  // stránka jiné (novější) verze se pod tuto verzi neukládá: po nepovedené instalaci nového service workeru by se
  // offline otevřela s uloženými soubory starší verze
  const build = kind === 'page' ? res.headers.get('x-atlas-build') : null;
  if ((!build || build === BUILD) && res.status === 200 && res.type === 'basic') event.waitUntil(remember(req, kind, res.clone()));
  return res;
}

async function remember(req, kind, res) {
  const html = /^text\/html\b/i.test(res.headers.get('content-type') || '');
  // Místo souboru přišla stránka (wifi s přihlášením ji vrátí se stavem 200; chybějící soubor má od serveru stránku
  // 404, ta se neuloží už podle stavu) – pod adresu souboru se neukládá. Ani obsah, který server pro adresu s otiskem
  // nepotvrdil (confirmed).
  if (kind === 'asset' && (html || !confirmed(req.url, res))) return;
  const cache = await caches.open(CACHE);
  // Stránka aplikace (i pod jinou adresou, např. s ?parametrem) se ukládá jen jednou, pod adresou rozsahu: offline se
  // pak otevře vždy ta poslední, ne starší kopie z jiné adresy s jinými skripty.
  await cache.put(kind === 'page' && html ? shellKey() : req, res);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Vše ze sítě s ověřením – do nové verze nesmí přijít stará kopie z mezipaměti prohlížeče. Soubory s otiskem
    // v adrese ne: stránka je právě stáhla a pod jejich adresou starší obsah být nemůže (fresh) – instalace je vezme
    // z mezipaměti prohlížeče bez dalšího dotazu. Soubor, který server nemá (404), se přeskočí; výpadek sítě instalaci
    // zastaví a prohlížeč ji zkusí znovu při další návštěvě.
    await Promise.all(PRECACHE.map(async (u) => {
      const res = await fetch(new Request(u, { cache: versioned(u) ? 'default' : 'no-cache' }));
      if (res.ok && confirmed(u, res)) await cache.put(u, res);
    }));
    // Nový service worker hned převezme otevřené stránky: soubory bere vždy ze sítě stejně jako ten starý, takže jim
    // nepodstrčí jiný kód – mění se jen mezipaměť pro offline. Na novou verzi upozorní pwa.js („Obnovit“).
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    // stránka ze sítě souběžně se spouštěním service workeru (networkFirst – event.preloadResponse)
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => { });
    await self.clients.claim();
    await rewriteScripts().catch(() => { });
  })());
});

/**
 * Skripty uložené při instalaci jednou znovu uložit – z uložené sady, bez sítě a beze změny obsahu. Ke skriptům, které
 * service worker uloží během instalace, si Chrome přidá úplnou předkompilaci (V8 code cache se všemi funkcemi) a tu
 * pak při každém otevření načítá na hlavním vlákně: nejpomalejší část opakovaného startu na telefonu (Playwright,
 * 412 px, procesor 4× pomalejší: ~0,9 s na hlavním vlákně, DOMContentLoaded ~1,6 s → ~0,8 s; celý prohlížeč na
 * jednom jádře bez zpomalení ~0,85 → ~0,5 s).
 * Skripty uložené mimo instalaci se kompilují na pozadí jako bez service workeru a předkompilaci si prohlížeč uloží jen
 * pro to, co se při startu opravdu spustilo. Selže-li to, zůstane kopie z instalace jako dřív – offline se nic nemění.
 */
async function rewriteScripts() {
  const cache = await caches.open(CACHE);
  await Promise.all(PRECACHE.filter((u) => /\.js(?:\?|$)/.test(u)).map(async (u) => {
    const res = await cache.match(u);
    if (res) await cache.put(u, res);
  }));
}

self.addEventListener('fetch', (event) => {
  const kind = route(event.request, self.registration.scope);
  if (kind) event.respondWith(networkFirst(event, kind));
  // navigace, do které se nepleteme (api/…, sw.js): prohlížeč použije už odeslaný požadavek – jen ho nezrušit
  else if (event.preloadResponse) event.waitUntil(Promise.resolve(event.preloadResponse).catch(() => { }));
});

// Stránka načtená offline se ptá, z jaké verze je její uložená kopie (pwa.js – upozornění na novou verzi).
// pwa.js: 'atlas-build' → verze uložené sady; 'atlas-served' → 'cache', když se tazateli dala uložená stránka.
self.addEventListener('message', (event) => {
  const port = event.ports && event.ports[0];
  if (!port) return;
  if (event.data === 'atlas-build') port.postMessage(BUILD);
  else if (event.data === 'atlas-served') port.postMessage(event.source && fromCache.has(event.source.id) ? 'cache' : 'network');
});
