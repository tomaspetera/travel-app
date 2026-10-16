// Fotky měst na karty radaru – z Wikimedie, zdarma a bez klíče, s popisným User-Agentem (bez něj Wikimedia API
// odpovídá 429). Snaha o opravdu hezkou fotku celého města, ne koláž, mapu nebo detail:
//   1) česká Wikipedie: článek o městě (cíl pojmenovaný po letišti „Pécs-Pogány“ → město před pomlčkou),
//      jeho úvodní obrázek (záloha) a název anglického článku,
//   2) anglická Wikipedie: obrázky v článku (vybrali je redaktoři – patří k městu),
//   3) Wikimedia Commons: které z nich komunita ocenila (Featured pictures, Quality images) a jejich rozměry;
//   vítězí oceněná fotka na šířku s celkovým pohledem (panorama, staré město, výhled), bez map, znaků a koláží.
// Bez oceněné fotky zůstane úvodní obrázek článku (není-li to koláž nebo SVG), jinak karta bez fotky.
import { request } from './http.js';
import { cache } from './cache.js';
import { UA } from './poi.js';

const TTL = 7 * 864e5; // fotka i „fotka není“ – články se mění zřídka
const MAX = 30;
const FP = 'Category:Featured pictures on Wikimedia Commons';
const QI = 'Category:Quality images';
// co na kartu nepatří: mapy, znaky, vlajky, koláže, schémata, portréty, detaily a interiéry
const BAD = /\.(svg|png|gif|tiff?|webm|ogv|ogg|pdf|djvu)$|map|karte|mapa|flag|vlajka|coat[ _]of[ _]arms|herb|znak|wappen|blason|logo|seal|emblem|locator|location|\bplan\b|diagram|chart|\bgraph\b|montage|collage|kol[aá]ž|mosaic|composite|\bicon|signature|portrait|stamp|\bcoin|banknote|\bbust\b|statue|\bgrave|tomb|plaque|interior|inside|altar|fresco|painting|sculpture|museum|stadium|airport|\bstation|\bmetro\b|\btram|\bbus\b|\btrain/i;
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

/** Body fotky pro kartu: ocenění, celkový pohled, poměr stran (karta je skoro čtverec), rozlišení. */
export function photoScore({ title, cats = [], width = 0, height = 0 }) {
  if (!width || !height || BAD.test(title)) return -Infinity;
  const r = width / height;
  let s = cats.includes(FP) ? 30 : cats.includes(QI) ? 20 : 0;
  if (NICE.test(title)) s += 8;
  if (r >= 1.2 && r <= 2.1) s += 6; // na šířku – oříznutí do karty nevadí
  else if (r > 2.8) s -= 12; // dlouhé panorama by z karty zbyl úzký proužek
  else if (r < 0.9) s -= 6; // na výšku
  if (width >= 1600) s += 2;
  return s;
}

/**
 * Fotky pro názvy měst (bez mezipaměti) – { photos: { název: adresa | '' }, partial }. Výpadek české Wikipedie vyhodí
 * chybu; výpadek anglické nebo Commons vrátí úvodní obrázky s partial: true.
 */
export async function pickPhotos(titles, api = wikiApi) {
  // 1) česká Wikipedie: článek, úvodní obrázek, anglický název; cíl po letišti → město před pomlčkou
  const alt = new Map(titles.map((t) => [t, t.split(/\s*[-–]\s*/)[0]]).filter(([t, a]) => a && a !== t));
  const ask = [...new Set([...titles, ...alt.values()])];
  const cs = (await api('cs.wikipedia.org', { titles: ask.join('|'), redirects: '1', prop: 'pageimages|langlinks', piprop: 'thumbnail', pithumbsize: '500', lllang: 'en', lllimit: 'max' })).query || {};
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
  // 2–3) výpadek anglické Wikipedie nebo Commons: zatím úvodní obrázky (bez koláží), jen na krátko (partial)
  try {
    return { photos: await bestPhotos(titles, api, lead, enOf), partial: false };
  } catch {
    const photos = {};
    for (const t of titles) photos[t] = leadOk(lead[t]) ? lead[t] : '';
    return { photos, partial: true };
  }
}

const leadOk = (u) => Boolean(u) && !BAD.test(safeDecode(u.split('?')[0].split('/').pop() || ''));

async function bestPhotos(titles, api, lead, enOf) {
  // 2) anglická Wikipedie: obrázky v článku (až 3 stránky odpovědi)
  const enTitles = [...new Set(Object.values(enOf).filter(Boolean))];
  const imgs = new Map();
  if (enTitles.length) {
    let cont = {}, enFin = null;
    for (let i = 0; i < 3; i++) {
      const j = await api('en.wikipedia.org', { titles: enTitles.join('|'), redirects: '1', prop: 'images', imlimit: 'max', ...cont });
      const q = j.query || {};
      if (!enFin) enFin = finalTitles(q, enTitles);
      for (const p of q.pages || []) if (p.images) imgs.set(p.title, [...(imgs.get(p.title) || []), ...p.images.map((x) => x.title)]);
      if (!j.continue || !j.continue.imcontinue) break;
      cont = { imcontinue: j.continue.imcontinue };
    }
    for (const t of titles) if (enOf[t]) enOf[t] = enFin.get(enOf[t]) || enOf[t];
  }
  // kandidáti: bez map, znaků…, celkové pohledy napřed; nejvýš 16 na město
  const cand = {};
  for (const t of titles) {
    const list = (imgs.get(enOf[t]) || []).filter((f) => !BAD.test(f));
    cand[t] = [...list.filter((f) => NICE.test(f)), ...list.filter((f) => !NICE.test(f))].slice(0, 16);
  }
  // 3) Commons: ocenění a rozměry (po 50 souborech)
  const files = [...new Set(Object.values(cand).flat())], info = new Map();
  for (let i = 0; i < files.length; i += 50) {
    const q = (await api('commons.wikimedia.org', {
      titles: files.slice(i, i + 50).join('|'), prop: 'categories|imageinfo', clcategories: `${FP}|${QI}`, cllimit: 'max', iiprop: 'url|size', iiurlwidth: '500',
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
    const best = cand[t].map((f) => info.get(f)).filter(Boolean).map((x) => ({ ...x, s: photoScore(x) })).sort((a, b) => b.s - a.s)[0];
    // oceněná fotka (≥ 20) vede; jinak úvodní obrázek článku, není-li koláž; jinak aspoň slušná fotka na šířku
    out[t] = best && best.s >= 20 ? best.url : leadOk(lead[t]) ? lead[t] : best && best.s >= 6 ? best.url : lead[t] || '';
  }
  return out;
}

/**
 * { photos: { název: adresa fotky | '' (fotka není) }, partial }. Výpadek Wikimedie (chyba, 429): nic se neuloží
 * a nenalezené názvy v odpovědi chybí – příště znovu. Náhradní výběr (partial) se uloží jen na hodinu.
 */
export async function cityPhotos(titles, { pick = pickPhotos } = {}) {
  const want = [...new Set(titles.map((t) => String(t || '').trim()).filter((t) => t && t.length <= 80 && !t.includes('|')))].slice(0, MAX);
  const photos = {}, miss = [];
  let partial = false;
  for (const t of want) {
    const c = cache.get('ph2:' + t);
    if (c !== undefined) photos[t] = c;
    else miss.push(t);
  }
  if (!miss.length) return { photos, partial };
  try {
    const got = await pick(miss);
    partial = got.partial;
    for (const t of miss) { photos[t] = got.photos[t] || ''; cache.set('ph2:' + t, photos[t], partial ? 36e5 : TTL); }
  } catch { /* výpadek – příště znovu */ }
  return { photos, partial };
}
