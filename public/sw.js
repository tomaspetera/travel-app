/* ATLAS – service worker: aplikace se otevře i bez internetu (uložené cesty a plány), ale nikdy neukáže starý kód.
   - Stránka a soubory aplikace (HTML, JS, CSS, vendor/, data/*.json): vždy nejdřív ze sítě, a to s ověřením u serveru
     (cache: 'no-cache' – ne neověřená kopie z mezipaměti prohlížeče). Každou úspěšnou odpověď uloží; uloženou kopii
     použije, jen když síť selže (offline).
   - /api/*, jiné metody než GET a cizí weby (dlaždice map, písma, partneři): do těch se service worker neplete –
     jdou rovnou na server, nic se neukládá; offline selžou a aplikace ukáže svou hlášku.
   - Verzi (BUILD = otisk obsahu souborů aplikace) a seznam souborů k uložení při instalaci dosadí server
     (server/lib/pwa.js). Nová verze na serveru = jiný sw.js → prohlížeč nainstaluje nový service worker, ten si uloží
     novou sadu souborů, převezme otevřené stránky a staré mezipaměti smaže. */
'use strict';

const BUILD = 'dev'; // server dosadí otisk obsahu aplikace
const PRECACHE = ['./']; // server dosadí stránku, soubory z index.html a data, která aplikace stahuje za běhu
const PREFIX = 'atlas-';
const CACHE = PREFIX + BUILD;
// Pomalá síť nebo uspaný server (Render zdarma se probouzí až minutu): stránka, která do PAGE_TIMEOUT ms nepřijde
// ze sítě, se otevře z uložené kopie a její soubory taky (stejná verze). Že je na serveru novější verze, pak řekne
// pwa.js („Je k dispozici nová verze – Obnovit“), stejně jako když se verze změní za běhu.
const PAGE_TIMEOUT = 1500;
const fromCache = new Set(); // klienti (otevřené stránky), kterým se dala uložená stránka

/**
 * Kam s požadavkem (čistá funkce – test/pwa.test.js):
 *   null     nechat být: vyřídí ho prohlížeč sám a nic se neukládá (API, POST, cizí weby, sw.js, /healthz, Range)
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
  if (/^(?:api(?:\/|$)|healthz$|sw\.js$)/.test(rel)) return null;
  if (req.headers && typeof req.headers.get === 'function' && req.headers.get('range')) return null;
  return req.mode === 'navigate' ? 'page' : 'asset';
}

const shellKey = () => self.registration.scope;

/** Požadavek na síť s ověřením u serveru (cache: 'no-cache' – nikdy neověřená kopie z mezipaměti prohlížeče). */
function fresh(req, kind) {
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
  const net = fetch(fresh(req, kind));
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
  if (res.status === 200 && res.type === 'basic') event.waitUntil(remember(req, kind, res.clone()));
  return res;
}

async function remember(req, kind, res) {
  const html = /^text\/html\b/i.test(res.headers.get('content-type') || '');
  // Za soubor, který na serveru není, pošle server stránku aplikace (index.html) – ta se pod jeho adresu neukládá.
  if (kind === 'asset' && html) return;
  const cache = await caches.open(CACHE);
  // Stránka aplikace (i pod jinou adresou, např. s ?parametrem) se ukládá jen jednou, pod adresou rozsahu: offline se
  // pak otevře vždy ta poslední, ne starší kopie z jiné adresy s jinými skripty.
  await cache.put(kind === 'page' && html ? shellKey() : req, res);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Vše ze sítě s ověřením – do nové verze nesmí přijít stará kopie z mezipaměti prohlížeče. Soubor, který server
    // nemá (404), se přeskočí; výpadek sítě instalaci zastaví a prohlížeč ji zkusí znovu při další návštěvě.
    await Promise.all(PRECACHE.map(async (u) => {
      const res = await fetch(new Request(u, { cache: 'no-cache' }));
      if (res.ok) await cache.put(u, res);
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
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const kind = route(event.request, self.registration.scope);
  if (kind) event.respondWith(networkFirst(event, kind));
});

// Stránka načtená offline se ptá, z jaké verze je její uložená kopie (pwa.js – upozornění na novou verzi).
// pwa.js: 'atlas-build' → verze uložené sady; 'atlas-served' → 'cache', když se tazateli dala uložená stránka.
self.addEventListener('message', (event) => {
  const port = event.ports && event.ports[0];
  if (!port) return;
  if (event.data === 'atlas-build') port.postMessage(BUILD);
  else if (event.data === 'atlas-served') port.postMessage(event.source && fromCache.has(event.source.id) ? 'cache' : 'network');
});
