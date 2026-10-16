// Fotky měst na karty radaru: úvodní obrázek článku na Wikipedii (česky, chybějící doplní anglická) – jeden dotaz
// na víc měst a s popisným User-Agentem (z prohlížeče bez něj Wikimedia API odpovídá 429). Znak, vlajka nebo mapa
// (SVG) se nebere – karta pak zůstane bez fotky.
import { request } from './http.js';
import { cache } from './cache.js';
import { UA } from './poi.js';

const TTL = 7 * 864e5; // fotka i „fotka není“ – články se mění zřídka
const MAX = 30;

/** Odpověď action=query&prop=pageimages (formatversion=2) → { název z dotazu: adresa náhledu }; jen fotky, ne SVG. */
export function parsePageImages(j, titles) {
  const q = (j && j.query) || {};
  const fin = new Map(titles.map((t) => [t, t]));
  // název z dotazu → konečný článek: nejdřív normalizace (velké písmeno, podtržítka), pak přesměrování
  for (const step of [q.normalized || [], q.redirects || []]) {
    for (const { from, to } of step) for (const [k, v] of fin) if (v === from) fin.set(k, to);
  }
  const img = new Map((q.pages || []).filter((p) => !p.missing).map((p) => [p.title, p.thumbnail && p.thumbnail.source]));
  const out = {};
  for (const [t, f] of fin) {
    const s = img.get(f);
    if (s && !/\.svg/i.test(s)) out[t] = s;
  }
  return out;
}

async function lookup(lang, titles) {
  const qs = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '500', titles: titles.join('|'),
  });
  const j = await request(`https://${lang}.wikipedia.org/w/api.php?${qs}`, { headers: { 'User-Agent': UA }, retry429: true, timeoutMs: 12000, retries: 1 });
  return parsePageImages(j, titles);
}

/**
 * { název: adresa fotky | '' (fotka není) }. Když některý dotaz selže (výpadek, 429), nenalezené názvy v odpovědi
 * chybí a neuloží se – příště znovu; co se našlo, platí.
 */
export async function cityPhotos(titles, { fetchLang = lookup } = {}) {
  const want = [...new Set(titles.map((t) => String(t || '').trim()).filter((t) => t && t.length <= 80 && !t.includes('|')))].slice(0, MAX);
  const out = {};
  let miss = [], failed = false;
  for (const t of want) {
    const c = cache.get('ph:' + t);
    if (c !== undefined) out[t] = c;
    else miss.push(t);
  }
  const keep = (t, u) => { out[t] = u; cache.set('ph:' + t, u, TTL); };
  for (const lang of ['cs', 'en']) {
    if (!miss.length) break;
    try {
      const found = await fetchLang(lang, miss);
      for (const t of miss) if (found[t]) keep(t, found[t]);
      miss = miss.filter((t) => !out[t]);
    } catch { failed = true; }
  }
  // cíl pojmenovaný po letišti („Pécs-Pogány“, „Paříž – Beauvais“): fotka města před pomlčkou
  const alt = new Map(miss.map((t) => [t, t.split(/\s*[-–]\s*/)[0]]).filter(([t, a]) => a && a !== t));
  if (alt.size) {
    try {
      const found = await fetchLang('cs', [...new Set(alt.values())]);
      for (const [t, a] of alt) if (found[a]) keep(t, found[a]);
      miss = miss.filter((t) => !out[t]);
    } catch { failed = true; }
  }
  if (!failed) for (const t of miss) keep(t, '');
  return out;
}
