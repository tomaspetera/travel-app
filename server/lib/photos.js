// Fotky měst na karty radaru – z Wikimedie, zdarma a bez klíče, s popisným User-Agentem (bez něj Wikimedia API
// odpovídá 429). Snaha o opravdu hezkou fotku celého města, ne koláž, mapu nebo detail:
//   1) česká Wikipedie: článek o městě (cíl pojmenovaný po letišti „Pécs-Pogány“ → město před pomlčkou),
//      jeho úvodní obrázek (záloha) a název anglického článku,
//   2) anglická Wikipedie: obrázky v článku (vybrali je redaktoři – patří k městu),
//   3) Wikimedia Commons: které z nich komunita ocenila (Featured pictures, Quality images) a jejich rozměry;
//   náhled 960 px (velká karta na telefonu) – prohlížeč si podle velikosti karty vezme menší 500 nebo 330 px;
//   vítězí oceněná fotka na šířku s celkovým pohledem (panorama, staré město, výhled), bez map, znaků a koláží.
// Bez oceněné fotky zůstane úvodní obrázek článku (není-li to koláž nebo SVG), jinak karta bez fotky.
// S klíčem PEXELS_API_KEY (zdarma) mají přednost profesionální fotky z Pexels na výšku – jen ty, v jejichž popisu
// nebo adrese je jméno města (náhodná fotka „Rumunska“ místo Oradey ne); s klíčem UNSPLASH_ACCESS_KEY totéž
// z Unsplash (co Pexels nemá nebo bez klíče Pexels); jinak Wikimedia jako dřív. U fotky z Pexels a Unsplash autor
// s odkazem na jeho profil (Unsplash to v podmínkách API vyžaduje, fotky se vkládají přímo z jeho serveru).
import { request, limiter } from './http.js';
import { config } from '../config.js';
import { cache } from './cache.js';
import { UA } from './poi.js';

const TTL = 7 * 864e5; // fotka i „fotka není“ – články se mění zřídka
const MAX = 30;
const FP = 'Category:Featured pictures on Wikimedia Commons';
const QI = 'Category:Quality images';
// co na kartu nepatří: mapy, znaky, vlajky, koláže, schémata, portréty, detaily a interiéry
const BAD = /\.(svg|png|gif|tiff?|webm|ogv|ogg|pdf|djvu)$|map|karte|mapa|flag|vlajka|coat[ _]of[ _]arms|herb|znak|wappen|blason|logo|seal|emblem|locator|location|\bplan\b|diagram|chart|\bgraph\b|montage|collage|kol[aá]ž|mosaic|composite|\bicon|signature|portrait|stamp|\bcoin|banknote|\bbust\b|statue|\bgrave|tomb|plaque|interior|inside|altar|fresco|painting|sculpture|museum|stadium|airport|\bstation|\bmetro\b|\btram|\bbus\b|\btrain|school|universit|campus|college|institut|\bhec\b|hospital|headquarters|\boffice|factory|company|hotel|church interior/i;
// celkový pohled na město
const NICE = /panoram|skyline|cityscape|aerial|overview|view|vista|old[ _]town|altstadt|stare[ _]miasto|staré[ _]město|centro[ _]storico|from[ _]|sunset|dusk|night|harbou?r|bay|riverside|waterfront/i;
const noSvg = (s) => (s && !/\.svg/i.test(s) ? s : '');
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

async function wikiApi(host, params) {
  const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params });
  return request(`https://${host}/w/api.php?${qs}`, { headers: { 'User-Agent': UA }, retry429: true, timeoutMs: 12000, retries: 1 });
}

/** Název z dotazu → konečný článek (normalizace: velké písmeno, podtržítka; pak přesměrování). */
function finalTitles(q, titles) {
  const fin = new Map(titles.map((t) => [t, t]));
  for (const step of [q.normalized || [], q.redirects || []]) {
    for (const { from, to } of step) for (const [k, v] of fin) if (v === from) fin.set(k, to);
  }
  return fin;
}

/** Odpověď action=query&prop=pageimages (formatversion=2) → { název z dotazu: adresa náhledu }; jen fotky, ne SVG. */
export function parsePageImages(j, titles) {
  const q = (j && j.query) || {};
  const fin = finalTitles(q, titles);
  const img = new Map((q.pages || []).filter((p) => !p.missing).map((p) => [p.title, p.thumbnail && p.thumbnail.source]));
  const out = {};
  for (const [t, f] of fin) {
    const s = noSvg(img.get(f));
    if (s) out[t] = s;
  }
  return out;
}

// bez diakritiky a malými písmeny – „Kraków“ i „Krakow“ v názvu souboru
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/ø/g, 'o').replace(/ß/g, 'ss').toLowerCase();
/** Je v názvu souboru jméno města (anglické nebo české, aspoň 3 znaky)? Fotka z okolí (hrad u Tirany) ho nemívá. */
export function namesCity(file, names) {
  const f = fold(file);
  return names.some((n) => { const k = fold(n).split(/[\s,(]/)[0]; return k.length >= 3 && f.includes(k); });
}

/**
 * Body fotky pro kartu: hlavní fotka anglického článku, jinak jméno města v názvu (fotka města, ne okolí), ocenění,
 * celkový pohled, poměr stran (karta je skoro čtverec), rozlišení.
 */
export function photoScore({ title, cats = [], width = 0, height = 0, lead = false }, names = []) {
  if (!width || !height || BAD.test(title)) return -Infinity;
  const r = width / height;
  let s = cats.includes(FP) ? 30 : cats.includes(QI) ? 20 : 0;
  if (lead) s += 15; // hlavní fotka anglického článku – vybrali ji redaktoři jako tvář města
  else if (names.length && namesCity(title, names)) s += 12;
  if (NICE.test(title)) s += 8;
  if (r >= 1.2 && r <= 2.1) s += 6; // na šířku – oříznutí do karty nevadí
  else if (r > 2.8) s -= 12; // dlouhé panorama by z karty zbyl úzký proužek
  else if (r < 0.9) s -= 6; // na výšku
  if (width >= 1600) s += 2;
  return s;
}

const limitPexels = limiter(4);
async function pexelsApi(key, query) {
  const qs = new URLSearchParams({ query, orientation: 'portrait', per_page: '15' });
  const j = await limitPexels(() => request(`https://api.pexels.com/v1/search?${qs}`, { headers: { Authorization: key }, timeoutMs: 10000, retries: 1 }));
  return (j && j.photos) || [];
}

// odkaz na profil autora: jen https na webu zdroje
const httpsOn = (u, host) => (typeof u === 'string' && u.length <= 300 && new RegExp(`^https://(www\\.)?${host}/[^\\s"'<>]*$`).test(u) ? u : '');

/**
 * První fotka z Pexels, v jejímž popisu (alt) nebo adrese je jméno města; adresa náhledu 960 × 1200 (karta na výšku),
 * by = autor, bu = jeho profil.
 */
export function pexelsPick(photos, names) {
  const p = (photos || []).find((x) => x && x.src && x.src.original && (namesCity(x.alt || '', names) || namesCity(String(x.url || '').replace(/-/g, ' '), names)));
  return p ? { u: `${p.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=960&h=1200`, by: p.photographer || '', bu: httpsOn(p.photographer_url, 'pexels\\.com') } : null;
}

// Unsplash: odkazy zpět na Unsplash s utm (podmínky API)
export const UNSPLASH_UTM = 'utm_source=atlas_letenky&utm_medium=referral';
const UNSPLASH_RATE_MS = 15 * 6e4; // po vyčerpání limitu (ukázkový režim 50 dotazů/h) Unsplash na čtvrt hodiny vynechat
const UNSPLASH_KEY_MS = 6 * 36e5; // neplatný klíč – na 6 h

/**
 * Hledání fotek na Unsplash (search/photos, na výšku, bez citlivého obsahu) → pole výsledků. Vlastní pojistka: po 403/429
 * (vyčerpaný limit dotazů) se Unsplash na 15 min vynechá, po 401 (neplatný klíč) na 6 h; chyba má soon: true, když se
 * vyplatí zkusit to brzy znovu (limit, výpadek), ne u neplatného klíče. deps: req (request), now (hodiny).
 */
export function unsplashClient(key, { req = request, now = Date.now } = {}) {
  const limit = limiter(2);
  let off = 0, offSoon = true;
  return async (query) => {
    if (now() < off) throw Object.assign(new Error('Unsplash vynechán'), { soon: offSoon });
    const qs = new URLSearchParams({ query, orientation: 'portrait', content_filter: 'high', per_page: '15' });
    try {
      const j = await limit(() => req(`https://api.unsplash.com/search/photos?${qs}`, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' }, timeoutMs: 10000, retries: 0 }));
      return (j && Array.isArray(j.results) && j.results) || [];
    } catch (e) {
      if (e.status === 401) { off = now() + UNSPLASH_KEY_MS; offSoon = false; }
      else if (e.status === 403 || e.status === 429) { off = now() + UNSPLASH_RATE_MS; offSoon = true; }
      throw Object.assign(e, { soon: e.status !== 401 });
    }
  };
}
let unsplashDefault = null;
const unsplashApi = () => (unsplashDefault ||= unsplashClient(config.unsplashKey));

/**
 * První fotka z Unsplash, v jejímž popisu, adrese (slug), štítcích nebo místě je jméno města, dost velká (aspoň
 * 1000 px na šířku); adresa z urls.raw (Unsplash chce fotky vkládat přímo ze svého serveru) s výřezem 960 × 1200,
 * by = autor, bu = jeho profil s utm.
 */
export function unsplashPick(results, names) {
  const text = (x) => [x.description, x.alt_description, x.slug, ...Object.values(x.alternative_slugs || {}), ...(Array.isArray(x.tags) ? x.tags.map((t) => t && t.title) : []),
    x.location && x.location.city, x.location && x.location.name].filter((v) => typeof v === 'string').join(' ').replace(/-/g, ' ');
  const p = (results || []).find((x) => x && x.urls && /^https:\/\/images\.unsplash\.com\/[^\s"'<>]+$/.test(x.urls.raw || '') && x.width >= 1000 && namesCity(text(x), names));
  if (!p) return null;
  const prof = httpsOn(p.user && p.user.links && p.user.links.html, 'unsplash\\.com');
  return { u: `${p.urls.raw}${p.urls.raw.includes('?') ? '&' : '?'}w=960&h=1200&fit=crop&crop=entropy&q=75&auto=format`, by: (p.user && p.user.name) || '', bu: prof && `${prof}${prof.includes('?') ? '&' : '?'}${UNSPLASH_UTM}` };
}

/**
 * Fotky pro názvy měst (bez mezipaměti) – { photos: { název: adresa | '' }, by: { název: autor }, bu: { název: profil
 * autora }, partial, retry }. Výpadek české Wikipedie vyhodí chybu; výpadek anglické nebo Commons vrátí úvodní obrázky
 * s partial: true; retry = názvy, u kterých Unsplash narazil na limit dotazů (fotka z Wikimedie jen na chvíli).
 */
export async function pickPhotos(titles, api = wikiApi, pexels = config.pexelsKey ? (q) => pexelsApi(config.pexelsKey, q) : null,
  unsplash = config.unsplashKey ? (q) => unsplashApi()(q) : null) {
  // 1) česká Wikipedie: článek, úvodní obrázek, anglický název; cíl po letišti → město před pomlčkou
  const alt = new Map(titles.map((t) => [t, t.split(/\s*[-–]\s*/)[0]]).filter(([t, a]) => a && a !== t));
  const ask = [...new Set([...titles, ...alt.values()])];
  const cs = (await api('cs.wikipedia.org', { titles: ask.join('|'), redirects: '1', prop: 'pageimages|langlinks', piprop: 'thumbnail', pithumbsize: '960', lllang: 'en', lllimit: 'max' })).query || {};
  const csFin = finalTitles(cs, ask);
  const csPage = new Map((cs.pages || []).filter((p) => !p.missing).map((p) => [p.title, p]));
  const page = (t) => csPage.get(csFin.get(t)) || (alt.has(t) ? csPage.get(csFin.get(alt.get(t))) : null);
  const lead = {}, enOf = {};
  for (const t of titles) {
    const p = page(t);
    lead[t] = noSvg(p && p.thumbnail && p.thumbnail.source);
    const ll = p && (p.langlinks || []).find((l) => l.lang === 'en');
    enOf[t] = ll ? ll.title : p ? '' : t; // bez českého článku zkus anglický pod stejným názvem
  }
  // Pexels, pak Unsplash (s klíčem): profesionální fotka města; co nenajdou, dohledá Wikimedia
  const photos = {}, by = {}, bu = {}, retry = [];
  for (const [src, pickIt] of [[pexels, pexelsPick], [unsplash, unsplashPick]]) {
    if (!src) continue;
    await Promise.all(titles.filter((t) => !photos[t]).map(async (t) => {
      const en = enOf[t] || t, names = [en, t, t.split(/\s*[-–]\s*/)[0]];
      try {
        const hit = pickIt(await src(`${en.split(/[,(]/)[0].trim()} city`), names);
        if (hit) { photos[t] = hit.u; by[t] = hit.by; if (hit.bu) bu[t] = hit.bu; }
      } catch (e) { if (src === unsplash && e.soon) retry.push(t); /* výpadek – Wikimedia */ }
    }));
  }
  const rest = titles.filter((t) => !photos[t]);
  if (!rest.length) return { photos, by, bu, partial: false, retry };
  // 2–3) výpadek anglické Wikipedie nebo Commons: zatím úvodní obrázky (bez koláží), jen na krátko (partial)
  try {
    return { photos: { ...photos, ...(await bestPhotos(rest, api, lead, enOf)) }, by, bu, partial: false, retry };
  } catch {
    for (const t of rest) photos[t] = leadOk(lead[t]) ? lead[t] : '';
    return { photos, by, bu, partial: true, retry };
  }
}

const leadOk = (u) => Boolean(u) && !BAD.test(safeDecode(u.split('?')[0].split('/').pop() || ''));

async function bestPhotos(titles, api, lead, enOf) {
  // 2) anglická Wikipedie: obrázky v článku (až 3 stránky odpovědi)
  const enTitles = [...new Set(Object.values(enOf).filter(Boolean))];
  const imgs = new Map(), enLead = new Map();
  if (enTitles.length) {
    let cont = {}, enFin = null;
    for (let i = 0; i < 3; i++) {
      const j = await api('en.wikipedia.org', { titles: enTitles.join('|'), redirects: '1', prop: 'images|pageimages', piprop: 'name', imlimit: 'max', ...cont });
      const q = j.query || {};
      if (!enFin) enFin = finalTitles(q, enTitles);
      for (const p of q.pages || []) {
        if (p.pageimage) enLead.set(p.title, 'File:' + p.pageimage.replace(/_/g, ' '));
        if (p.images) imgs.set(p.title, [...(imgs.get(p.title) || []), ...p.images.map((x) => x.title)]);
      }
      if (!j.continue || !j.continue.imcontinue) break;
      cont = { imcontinue: j.continue.imcontinue };
    }
    for (const t of titles) if (enOf[t]) enOf[t] = enFin.get(enOf[t]) || enOf[t];
  }
  // kandidáti: bez map, znaků…; napřed se jménem města a celkovým pohledem; nejvýš 20 na město
  const cand = {}, names = {};
  for (const t of titles) {
    names[t] = [enOf[t], t, t.split(/\s*[-–]\s*/)[0]].filter(Boolean);
    const rank = (f) => (namesCity(f, names[t]) ? 2 : 0) + (NICE.test(f) ? 1 : 0);
    const ld = enLead.get(enOf[t]);
    cand[t] = [...new Set([...(ld && !BAD.test(ld) ? [ld] : []), ...(imgs.get(enOf[t]) || []).filter((f) => !BAD.test(f)).map((f, i) => [f, rank(f), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map((x) => x[0])])].slice(0, 20);
  }
  // 3) Commons: ocenění a rozměry (po 50 souborech)
  const files = [...new Set(Object.values(cand).flat())], info = new Map();
  for (let i = 0; i < files.length; i += 50) {
    const q = (await api('commons.wikimedia.org', {
      titles: files.slice(i, i + 50).join('|'), prop: 'categories|imageinfo', clcategories: `${FP}|${QI}`, cllimit: 'max', iiprop: 'url|size', iiurlwidth: '960',
    })).query || {};
    const fin = finalTitles(q, files.slice(i, i + 50));
    const byTitle = new Map((q.pages || []).filter((p) => !p.missing && p.imageinfo).map((p) => [p.title, p]));
    for (const [f, ft] of fin) {
      const p = byTitle.get(ft);
      if (!p) continue;
      const ii = p.imageinfo[0];
      info.set(f, { title: f, cats: (p.categories || []).map((c) => c.title), width: ii.width, height: ii.height, url: ii.thumburl || ii.url });
    }
  }
  const out = {};
  for (const t of titles) {
    const ld = enLead.get(enOf[t]);
    const ranked = cand[t].map((f) => info.get(f)).filter(Boolean).map((x) => ({ ...x, s: photoScore({ ...x, lead: x.title === ld }, names[t]) })).filter((x) => x.s > -Infinity).sort((a, b) => b.s - a.s);
    // hlavní fotka anglického článku (tvář města, kterou vybrali redaktoři), není-li koláž, mapa nebo úzký proužek;
    // jinak nejlepší oceněná; jinak úvodní obrázek českého článku, není-li koláž; jinak aspoň slušná fotka na šířku
    const li = ld && ranked.find((x) => x.title === ld), lr = li && li.width / li.height;
    const top = li && lr >= 0.9 && lr <= 2.8 ? li : ranked.find((x) => x.cats.includes(FP) || x.cats.includes(QI)), best = ranked[0];
    out[t] = top ? top.url : leadOk(lead[t]) ? lead[t] : best && best.s >= 6 ? best.url : lead[t] || '';
  }
  return out;
}

/**
 * { photos: { název: adresa fotky | '' (fotka není) }, by: { název: autor fotky z Pexels/Unsplash }, bu: { název:
 * profil autora }, partial, prov }. Výpadek Wikimedie (chyba, 429): nic se neuloží a nenalezené názvy v odpovědi
 * chybí – příště znovu. Náhradní výběr (partial, u Unsplash po limitu dotazů retry) se uloží jen na hodinu – partial
 * pak má i odpověď, ať se prohlížeč brzy zeptá znovu. prov: 'pexels' / 'unsplash' s klíčem, jinak
 * 'wiki' (prohlížeč wiki fotky drží kratší dobu, aby po přidání klíče brzy přešel na hezčí fotky).
 */
export async function cityPhotos(titles, { pick = pickPhotos, prov = config.pexelsKey ? 'pexels' : config.unsplashKey ? 'unsplash' : 'wiki' } = {}) {
  const want = [...new Set(titles.map((t) => String(t || '').trim()).filter((t) => t && t.length <= 80 && !t.includes('|')))].slice(0, MAX);
  const photos = {}, by = {}, bu = {}, miss = [];
  let partial = false;
  for (const t of want) {
    const c = cache.get(`ph6:${prov}:${t}`);
    if (c !== undefined) { photos[t] = c.u; if (c.by) by[t] = c.by; if (c.bu) bu[t] = c.bu; } else miss.push(t);
  }
  if (miss.length) {
    try {
      const got = await pick(miss);
      const soon = new Set(got.retry || []);
      partial = Boolean(got.partial) || soon.size > 0;
      for (const t of miss) {
        photos[t] = got.photos[t] || '';
        if (got.by && got.by[t]) by[t] = got.by[t];
        if (got.bu && got.bu[t]) bu[t] = got.bu[t];
        cache.set(`ph6:${prov}:${t}`, { u: photos[t], by: by[t] || '', ...(bu[t] ? { bu: bu[t] } : {}) }, got.partial || soon.has(t) ? 36e5 : TTL);
      }
    } catch { /* výpadek – příště znovu */ }
  }
  return { photos, by, bu, partial, prov };
}
