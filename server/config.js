// Konfigurace z proměnných prostředí (volitelně ze souboru .env v kořeni projektu).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const env = process.env;
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
// Jedna obyčejná adresa (bez mezer, čárek a znaků, které by v mailto: odkazu přidaly další adresáty nebo hlavičky).
export const cleanEmail = (v) => { const s = String(v || '').trim(); return /^[\w.+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/i.test(s) ? s : ''; };

export const config = {
  root,
  port: num(env.PORT, 8080),
  host: env.HOST || '0.0.0.0',
  // ATLAS_MOCK=1 → generovaná ukázková data (offline demo, testy). V UI je jasně označeno.
  mock: env.ATLAS_MOCK === '1' || process.argv.includes('--demo'),
  ryanair: env.RYANAIR_ENABLED !== '0',
  wizz: env.WIZZ_ENABLED !== '0',
  // Kiwi.com MCP (zdarma, bez klíče) – živé ceny všech aerolinek pro konkrétní cíl.
  kiwi: env.KIWI_ENABLED !== '0',
  travelpayoutsToken: env.TRAVELPAYOUTS_TOKEN || '',
  travelpayoutsMarker: env.TRAVELPAYOUTS_MARKER || '',
  // Číslo projektu (trs) z app.travelpayouts.com → Profile → Sources; bez něj zůstanou odkazy přímé.
  travelpayoutsTrs: env.TRAVELPAYOUTS_TRS || '',
  // Trh Aviasales, z jehož hledání se berou ceny (cz, de, gb, …); prázdné = výchozí trh API.
  travelpayoutsMarket: (env.TRAVELPAYOUTS_MARKET ?? 'cz').toLowerCase(),
  // Fotky měst na kartách (pexels.com/api – zdarma, 200 dotazů/h): profesionální snímky na výšku. Bez klíče Wikimedia.
  pexelsKey: env.PEXELS_API_KEY || '',
  // Totéž z Unsplash (unsplash.com/developers – zdarma, v ukázkovém režimu 50 dotazů/h): když Pexels klíč nemá nebo
  // fotku nenajde. Fotky se vkládají přímo z Unsplash a u fotky je autor s odkazem (podmínky Unsplash API).
  unsplashKey: env.UNSPLASH_ACCESS_KEY || '',
  // Mapy.com (developer.mapy.com – zdarma 250 000 kreditů měsíčně): turistická mapa u tras pěšky a na kole, hledání míst
  // v Objevuj a záloha plánovače tras (server/lib/mapy.js). Bez klíče vše jako dřív (OpenFreeMap, Open-Meteo, BRouter).
  mapyKey: (env.MAPY_API_KEY || '').trim(),
  // Strop kreditů Mapy.com za hodinu (dlaždice 1, hledání / trasa / výškový profil 4): 340 × 720 h ≈ 245 000 < 250 000
  // zdarma – volné kredity nedojdou ani při zneužití; nad stropem se Mapy.com do konce hodiny vynechá.
  mapyMaxPerHour: num(env.MAPY_MAX_PER_HOUR, 340),
  // Hotely s cenou a hodnocením (liteapi.travel). Bez klíče jen odkazy na Booking/Airbnb/Google.
  liteapiKey: env.LITEAPI_KEY || '',
  // Volitelná white-label rezervační stránka LiteAPI (např. moje.nuitee.link) – jinak odkaz na Booking.com.
  liteapiWhitelabel: env.LITEAPI_WHITELABEL || '',
  // Orientační ceny hotelů z TripAdvisoru přes Xotelo (zdarma, bez klíče, bez provizí) – když není ostrý klíč LiteAPI.
  // XOTELO=off vypne (zůstanou odkazy na partnery).
  xotelo: !/^(off|0|false|no)$/i.test(String(env.XOTELO ?? '').trim()),
  // Kolik odletových letišť nejvýše prohledat v jednom dotazu.
  maxOrigins: num(env.MAX_ORIGINS, 8),
  // Wizz Air nemá „kamkoliv“ endpoint → 1 dotaz na trasu; strop na jedno hledání.
  wizzMaxCalls: num(env.WIZZ_MAX_CALLS, 60),
  // Ochrana veřejně nasazeného serveru: max. počet hledání z jedné IP za 10 minut (0 = bez limitu).
  searchesPer10Min: num(env.SEARCH_RATE_LIMIT, 40),
  // Nával uživatelů (server/lib/crowd.js): kolik různých hledání smí běžet naráz (jedno = 1–2 s procesoru a desítky MB
  // paměti; čekání na aerolinky nic nestojí) a kolik dalších čeká ve frontě – nad ní se nové hledání slušně odmítne
  // (503 „zkus to za chvíli“) místo pádu celého serveru. Stejné hledání, které už běží, se jen připojí (nepočítá se).
  // Výchozí 4 + 20 na Render zdarma (0,1 CPU, 512 MB): víc hledání naráz tam nic nezrychlí, jen zabere paměť;
  // na větším plánu zvýšit (docs/skalovani.md).
  searchConcurrency: Math.max(1, num(env.SEARCH_CONCURRENCY, 4)),
  searchQueue: Math.max(0, num(env.SEARCH_QUEUE, 20)),
  // Kolik hledání smí mít jedna adresa rozběhnutých naráz (běží i čekají ve frontě) – jinak by jedna adresa v rámci
  // limitu (40 za 10 min) zaplnila celou frontu a ostatní by chvíli dostávali 503. Nad stropem 429 „počkej, až doběhnou“.
  // Aplikace v jednom okně pustí sama naráz nejvýš 7 hledání (radar při rychlém přepínání Kdykoliv / Víkendy / 3 víkendy
  // svátků – předchozí se neruší, výsledek se uloží – + hledání v Letech + ruční kontrola hlídané ceny), běžně 1–3.
  // Výchozí 8 = jeden uživatel nic nepozná (ani se dvěma zařízeními za jednou adresou). 0 = bez stropu.
  searchPerClient: Math.max(0, num(env.SEARCH_PER_CLIENT, 8)),
  // Hledání ve frontě (nebo zdroj, který dlouho mlčí): po tolika ms bez řádku pošle server znamení { type: 'wait' } –
  // aplikace hledání bez dat vzdává po 2 minutách (public/js/pwa.js API_WAIT); 20 s je s velkou rezervou.
  searchPingMs: 20e3,
  // Přepočty trasy přes víc míst (každý až 8 nových tras z veřejného BRouteru): z jedné IP za 10 minut 3× tolik
  // co hledání, zvlášť; nad limitem přepočet odpoví bez nových tras (z mezipaměti, jinak odhad), ne chybou.
  rechecksPer10Min: 3 * num(env.SEARCH_RATE_LIMIT, 40),
  // živé ověření ceny (/api/verify – průvodce cestou, ceny z mezipaměti ve výpisu): vlastní limit, ne z hledání
  verifiesPer10Min: num(env.VERIFY_RATE_LIMIT, num(env.SEARCH_RATE_LIMIT, 40)),
  // Objevuj (místa, program, výlety, kolo, pěšky): vlastní limit, do hledání se nepočítá; odpověď celá z mezipaměti
  // serveru (stejné místo podruhé, návrat do Objevuj) se nepočítá vůbec
  explorePer10Min: num(env.EXPLORE_RATE_LIMIT, 3 * num(env.SEARCH_RATE_LIMIT, 40)),
  // Dlaždice Mapy.com přes server (/api/tiles/mapy/…): z jedné IP za 10 minut nejvýš tolik dlaždic mimo mezipaměť serveru.
  tilesPer10Min: num(env.TILES_RATE_LIMIT, 300),
  // Fotky měst (/api/photos) a geokódování (našeptávač, hledání míst – Open-Meteo): z jedné IP za 10 minut nejvýš tolik
  // dotazů, které nejdou celé z mezipaměti serveru. Pexels (200/h), Unsplash (50/h) i Open-Meteo mají strop pro celý
  // server – náhodné názvy by ho jinak vyčerpaly všem. Běžný uživatel se k limitu nepřiblíží (dávka fotek = až 30 karet).
  photosPer10Min: num(env.PHOTOS_RATE_LIMIT, 60),
  geocodePer10Min: num(env.GEOCODE_RATE_LIMIT, 200),
  // 💬 Napsat nám v ℹ️ O aplikaci: kam vede mailto. Bez adresy (nebo s neplatnou) se tlačítko neukáže – adresa
  // jen v proměnné prostředí, v kódu žádná.
  feedbackEmail: cleanEmail(env.FEEDBACK_EMAIL),
};
