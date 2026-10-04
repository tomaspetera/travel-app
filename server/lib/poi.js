// Zajímavá místa v okolí bodu – zdarma a bez klíče:
//   1) Wikidata Query Service (SPARQL, wikibase:around) – místa se souřadnicemi, typem, fotkou,
//      památkovou ochranou; významnost = počet jazykových verzí článku (sitelinks)
//   2) Wikipedia API – krátký popis (česky, jinak anglicky) a náhledový obrázek
// Wikimedia vyžaduje popisný User-Agent: https://meta.wikimedia.org/wiki/User-Agent_policy
import { request, limiter } from './http.js';
import { cache } from './cache.js';
import { haversineKm, normalize } from './geo.js';

const UA = 'ATLAS-travel/2.0 (https://github.com/tomaspetera/travel-app; hobby travel planner)';
const WDQS = 'https://query.wikidata.org/sparql';
const limitWdqs = limiter(2);
const limitWiki = limiter(4);

// Typ (Wikidata P31 nebo jeho nadtřída) → kategorie.
const TYPES = {
  museum: ['Q33506', 'Q207694', 'Q17431399', 'Q1595639', 'Q588140', 'Q2772772', 'Q856584'],
  gallery: ['Q1007870'],
  church: ['Q16970', 'Q2977', 'Q163687', 'Q1088552', 'Q44613', 'Q32815', 'Q34627', 'Q44539', 'Q842402', 'Q5393308', 'Q160742', 'Q120560', 'Q317557', 'Q56242215', 'Q1129743'],
  castle: ['Q23413', 'Q751876', 'Q57821', 'Q1785071', 'Q17715832', 'Q81917'],
  palace: ['Q16560', 'Q53536964', 'Q1802963'],
  monument: ['Q4989906', 'Q179700', 'Q575759', 'Q5003624', 'Q483453', 'Q1081138'],
  square: ['Q174782', 'Q1062422'],
  oldtown: ['Q676050', 'Q15243209'],
  viewpoint: ['Q6017969', 'Q1440300'],
  park: ['Q22698', 'Q1107656', 'Q167346', 'Q22652'],
  nature: ['Q23397', 'Q8502', 'Q34038', 'Q35509', 'Q46169', 'Q179049', 'Q39594', 'Q150784'],
  beach: ['Q40080'],
  zoo: ['Q43501', 'Q2281788'],
  theme: ['Q194195', 'Q2416723', 'Q1144661'],
  market: ['Q37654', 'Q330284', 'Q1053651'],
  bridge: ['Q12280'],
  tower: ['Q12518', 'Q11303', 'Q39715'],
  ruins: ['Q839954', 'Q109607'],
  theatre: ['Q24354', 'Q153562', 'Q1060829'],
  sight: ['Q570116', 'Q2319498', 'Q1497375', 'Q12511'],
};
// Když má místo víc typů, rozhoduje tohle pořadí (ne náhodné pořadí řádků SPARQL).
const CAT_PRIORITY = ['castle', 'palace', 'zoo', 'theme', 'museum', 'gallery', 'church', 'oldtown', 'square', 'bridge', 'tower',
  'viewpoint', 'ruins', 'monument', 'market', 'theatre', 'park', 'garden', 'beach', 'nature', 'sight'];
const SETTLEMENT = ['Q515', 'Q3957', 'Q532', 'Q747074', 'Q484170', 'Q2074737', 'Q5119', 'Q1549591', 'Q486972', 'Q1637706', 'Q262166', 'Q15284',
  // obce podle zemí (bez nich by třeba Sintra nebo Évora nebyly „výletem“)
  'Q13217644', 'Q41791733', 'Q5153359', 'Q15978299', 'Q667509', 'Q2039348', 'Q493522', 'Q70208', 'Q3558970', 'Q2616791', 'Q1906268', 'Q1059478'];
const EXCLUDE = ['Q55488', 'Q928830', 'Q1248784', 'Q3914', 'Q3918', 'Q16917', 'Q4830453', 'Q79007', 'Q123705', 'Q149621', 'Q1048835', 'Q13226383', 'Q1802801', 'Q34442', 'Q1371849', 'Q18917976',
  'Q483110', 'Q641226', 'Q1076486', 'Q57305']; // stadiony, arény, sportoviště, veletrhy
const ISLAND = 'Q23442';
// Ulice/silnice a čtvrti jsou „měkké“ vyloučení: památkově chráněné a známé zůstanou (Zlatá ulička,
// Alfama). Ostatní (letiště, stadiony, nádraží, metro, školy, firmy…) nikdy, ani jako památka.
const SOFT_EXCLUDE = ['Q79007', 'Q34442', 'Q123705', 'Q149621'];
const HARD_EXCLUDE = [...EXCLUDE.filter((t) => !SOFT_EXCLUDE.includes(t)), 'Q5503', 'Q3491904', 'Q1154710', 'Q137884967', 'Q2516121'];
// Bez známého typu projde jen stavba (budova / stavební konstrukce), ne stát, událost nebo instituce.
const STRUCTURE = ['Q41176', 'Q811979'];
const CAT_OF = new Map(Object.entries(TYPES).flatMap(([cat, ids]) => ids.map((id) => [id, cat])));
const UNESCO = 'Q9259';

export const CATEGORY_CS = {
  museum: 'Muzeum', gallery: 'Galerie', church: 'Kostel / chrám', castle: 'Hrad / pevnost', palace: 'Palác / zámek',
  monument: 'Památník', square: 'Náměstí', oldtown: 'Historické centrum', viewpoint: 'Vyhlídka', park: 'Park / zahrada',
  nature: 'Příroda', beach: 'Pláž', zoo: 'Zoo / akvárium', theme: 'Zábavní park', market: 'Trh', bridge: 'Most',
  tower: 'Věž / mrakodrap', ruins: 'Archeologie / zřícenina', theatre: 'Divadlo / opera', sight: 'Zajímavost', daytrip: 'Výlet',
};
const CAT_BONUS = { museum: 4, castle: 5, palace: 4, oldtown: 6, viewpoint: 3, church: 2, nature: 4, beach: 3, square: 2, ruins: 4 };

/**
 * Místa v okruhu: poddotaz nejdřív vybere `items` nejvýznamnějších položek (podle počtu jazykových
 * verzí), teprve k nim se dotahují typy, fotka a památková ochrana. LIMIT na vnějším dotazu by
 * počítal řádky (jedna položka = mnoho řádků) a ve velkých městech by usekl náhodná místa.
 */
function sparqlNear(lat, lon, radiusKm, minLinks, items) {
  return `SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?sl ?type ?img ?her ?cs ?en ?part WHERE {
  {
    SELECT ?item ?coord ?sl WHERE {
      SERVICE wikibase:around {
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" .
      }
      hint:Query hint:optimizer "None" .
      ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${minLinks})
    } ORDER BY DESC(?sl) LIMIT ${items}
  }
  ?item wdt:P31/wdt:P279? ?type .
  OPTIONAL { ?item wdt:P361 ?part }
  BIND(geof:latitude(?coord) AS ?lat) BIND(geof:longitude(?coord) AS ?lon)
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P1435 ?her }
  OPTIONAL { ?cs schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en,[AUTO_LANGUAGE]". }
} LIMIT 30000`;
}

async function wdqs(query, timeoutMs = 45000) {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(query)}`;
  const j = await limitWdqs(() => request(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, timeoutMs, retries: 0 }));
  return j.results?.bindings || [];
}

const qid = (uri) => String(uri || '').split('/').pop();
const val = (b, k) => b[k]?.value;
const title = (uri) => (uri ? decodeURIComponent(uri.split('/wiki/')[1] || '').replace(/_/g, ' ') : null);

/** Řádky SPARQL (víc řádků na položku kvůli typům) → místa. */
export function groupBindings(rows, center) {
  const by = new Map();
  for (const b of rows) {
    const id = qid(val(b, 'item'));
    if (!id) continue;
    let p = by.get(id);
    const lat = Number(val(b, 'lat'));
    const lon = Number(val(b, 'lon'));
    if (!p) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      p = {
        id, name: val(b, 'itemLabel') || id, description: val(b, 'itemDescription') || '', lat, lon,
        sitelinks: Number(val(b, 'sl')) || 0, types: new Set(), heritage: false, unesco: false,
        image: null, wiki: { cs: title(val(b, 'cs')), en: title(val(b, 'en')) }, coords: new Set(), partOf: new Set(),
      };
      by.set(id, p);
    }
    if (Number.isFinite(lat)) p.coords.add(`${lat.toFixed(2)},${lon.toFixed(2)}`);
    const t = qid(val(b, 'type'));
    if (t) p.types.add(t);
    const part = qid(val(b, 'part'));
    if (part) p.partOf.add(part);
    const her = qid(val(b, 'her'));
    if (her) { p.heritage = true; if (her === UNESCO) p.unesco = true; }
    const img = val(b, 'img');
    if (img && !p.image) p.image = `${img.replace(/^http:/, 'https:')}?width=500`;
  }
  const out = [];
  for (const p of by.values()) {
    if (/^Q\d+$/.test(p.name)) continue; // bez názvu
    const types = [...p.types];
    const settlement = types.some((t) => SETTLEMENT.includes(t));
    const hard = types.some((t) => HARD_EXCLUDE.includes(t));
    const soft = types.filter((t) => SOFT_EXCLUDE.includes(t));
    const cats = new Set(types.map((t) => CAT_OF.get(t)).filter(Boolean));
    // Konkrétní typ (most, kostel, hrad…) vyhrává nad obecným „silnice/ulice“ (Karlův most je i silnice).
    const specific = CAT_PRIORITY.find((c) => c !== 'sight' && cats.has(c));
    const known = p.heritage && p.sitelinks >= 25;
    let category = null;
    if (settlement) category = 'town';
    else if (specific && !hard) category = specific;
    else if (hard) category = null;
    // Památková čtvrť (Alfama) = historické centrum; památková ulice (Zlatá ulička) = zajímavost.
    else if (soft.length) category = known ? (soft.some((t) => t === 'Q123705' || t === 'Q149621') ? 'oldtown' : 'sight') : null;
    else if (cats.has('sight') || p.heritage || (p.sitelinks >= 25 && types.some((t) => STRUCTURE.includes(t)))) category = 'sight';
    if (!category) continue;
    p.category = category;
    p.island = types.includes(ISLAND);
    p.serial = p.coords.size > 3; // místo rozeseté po mnoha lokalitách (sériová památka)
    p.partOf = [...p.partOf];
    p.types = undefined;
    p.coords = undefined;
    p.distanceKm = Math.round(haversineKm(center.lat, center.lon, p.lat, p.lon) * 10) / 10;
    out.push(p);
  }
  return out;
}

export function scorePlace(p) {
  let s = Math.log2(p.sitelinks + 1) * 10;
  if (p.unesco) s += 15;
  else if (p.heritage) s += 4;
  s += CAT_BONUS[p.category] || 0;
  // Výlet: bližší má přednost (Tivoli 27 km před L'Aquilou 90 km); ve městě penalizace od 2 km.
  s -= p.category === 'daytrip' ? (p.distanceKm || 0) * 0.15 : Math.max(0, p.distanceKm - 2) * 1.5;
  return Math.round(s * 10) / 10;
}

/**
 * Popisy a náhledy z Wikipedie (po 20 článcích). Vrací true, když se něco nepovedlo (třeba 429
 * „příliš mnoho dotazů“) – pak se další dávky už neposílají a výsledek se uloží jen krátce.
 */
async function enrich(places) {
  let failed = false;
  for (const lang of ['cs', 'en']) {
    const need = places.filter((p) => p.wiki[lang] && !p.extract);
    for (let i = 0; i < need.length && !failed; i += 20) {
      const batch = need.slice(i, i + 20);
      const qs = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'extracts|pageimages',
        exintro: '1', explaintext: '1', exsentences: '3', exlimit: '20', piprop: 'thumbnail|name', pithumbsize: '500', pilimit: '20',
        titles: batch.map((p) => p.wiki[lang]).join('|'),
      });
      try {
        const j = await limitWiki(() => request(`https://${lang}.wikipedia.org/w/api.php?${qs}`, { headers: { 'User-Agent': UA }, retry429: true, timeoutMs: 15000, retries: 1 }));
        const norm = new Map((j.query?.normalized || []).map((n) => [n.from, n.to]));
        const redir = new Map((j.query?.redirects || []).map((n) => [n.from, n.to]));
        const pages = new Map((j.query?.pages || []).map((pg) => [pg.title, pg]));
        for (const p of batch) {
          let t = p.wiki[lang];
          t = norm.get(t) || t;
          t = redir.get(t) || t;
          const pg = pages.get(t);
          if (!pg) continue;
          if (pg.extract) {
            p.extract = pg.extract.replace(/\s+/g, ' ').trim().slice(0, 420);
            p.extractLang = lang;
            p.url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
          }
          if (pg.thumbnail?.source) {
            // Menší obrázky API vrací jako originál (bez /thumb/) – ty Wikimedia při vkládání na web
            // omezuje (429). Pak raději náhled přes Special:FilePath ve standardní šířce.
            p.image = /\/thumb\//.test(pg.thumbnail.source) || !pg.pageimage
              ? pg.thumbnail.source
              : `https://${lang}.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(pg.pageimage)}?width=330`;
          }
        }
      } catch {
        failed = true; // popisy jsou jen doplněk – ale další dávky neposílej
      }
    }
  }
  for (const p of places) {
    if (!p.url) p.url = p.wiki.cs ? `https://cs.wikipedia.org/wiki/${encodeURIComponent(p.wiki.cs.replace(/ /g, '_'))}` : p.wiki.en ? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.wiki.en.replace(/ /g, '_'))}` : `https://www.wikidata.org/wiki/${p.id}`;
    p.wiki = undefined;
  }
  return failed;
}

// ---------- záloha bez SPARQL: Wikipedia geosearch + počet jazykových verzí z Wikidat ----------

// Klasifikace podle krátkého popisu (Wikidata description) a názvu – cs i en.
const TEXT_CATS = [
  ['museum', /muzeum|museum|museo|musée/],
  ['gallery', /galerie|gallery|pinacoteca|galleria/],
  ['church', /kostel|katedrál|bazilik|chrám|klášter|kaple|mešit|synagog|church|cathedral|basilica|monastery|abbey|chapel|mosque|synagogue|temple|duomo/],
  ['castle', /hrad|pevnost|tvrz|castle|fortress|citadel|fort\b/],
  ['palace', /palác|zámek|palace|palazzo|château|schloss/],
  ['oldtown', /historické centrum|staré město|old town|historic (centre|center|district)/],
  ['square', /náměstí|square|piazza|plaza|platz/],
  ['park', /park|zahrad|garden|giardino/],
  ['viewpoint', /vyhlídk|viewpoint|lookout|belvedere/],
  ['nature', /jezero|hora|vodopád|jeskyn|národní park|lake|mountain|waterfall|cave|national park|island|ostrov/],
  ['beach', /pláž|beach|playa|spiaggia/],
  ['zoo', /zoo|akvárium|aquarium/],
  ['theme', /zábavní park|amusement park|theme park/],
  ['bridge', /\bmost\b|bridge|ponte|puente/],
  ['tower', /věž|mrakodrap|maják|tower|skyscraper|lighthouse|torre/],
  ['ruins', /zřícenin|archeolog|ruins|archaeological|roman (theatre|amphitheatre)|amfiteátr/],
  ['theatre', /divadlo|opera|theatre|theater|concert hall|teatro/],
  ['monument', /pomník|památník|socha|kašna|fontána|monument|memorial|statue|fountain/],
  ['market', /tržnice|trh\b|market|mercado|mercato/],
];
const TEXT_EXCLUDE = /nádraží|stanice|zastávk|ulice|třída|škola|univerzit|nemocnic|firma|společnost|čtvrť|městská část|obec|okres|station|street|avenue|school|university|hospital|company|district|neighbourhood|neighborhood|municipality|metro|hotel|airport|letiště|football club|fotbalový klub|human settlement|commune|comune|village|town in|city in/;

export function classifyText(text) {
  const t = String(text || '').toLowerCase();
  if (TEXT_EXCLUDE.test(t)) return null;
  for (const [cat, re] of TEXT_CATS) if (re.test(t)) return cat;
  return null;
}

async function wikiGeosearch(lang, lat, lon) {
  const qs = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', generator: 'geosearch', ggscoord: `${lat}|${lon}`,
    ggsradius: '10000', ggslimit: '50', prop: 'coordinates|pageimages|description|pageprops', ppprop: 'wikibase_item',
    piprop: 'thumbnail', pithumbsize: '500', pilimit: '50', colimit: '50',
  });
  const j = await limitWiki(() => request(`https://${lang}.wikipedia.org/w/api.php?${qs}`, { headers: { 'User-Agent': UA }, retry429: true, timeoutMs: 15000, retries: 1 }));
  return (j.query?.pages || []).map((pg) => ({ lang, ...pg }));
}

async function sitelinkCounts(qids) {
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'pageprops', ppprop: 'wb-sitelinks', titles: qids.slice(i, i + 50).join('|') });
    try {
      const j = await limitWiki(() => request(`https://www.wikidata.org/w/api.php?${qs}`, { headers: { 'User-Agent': UA }, retry429: true, timeoutMs: 15000, retries: 1 }));
      for (const pg of j.query?.pages || []) out.set(pg.title, Number(pg.pageprops?.['wb-sitelinks']) || 0);
    } catch { /* bez významnosti */ }
  }
  return out;
}

export async function findPlacesViaWikipedia({ lat, lon }) {
  const center = { lat, lon };
  const lists = await Promise.allSettled([wikiGeosearch('cs', lat, lon), wikiGeosearch('en', lat, lon)]);
  const by = new Map();
  for (const r of lists) {
    if (r.status !== 'fulfilled') continue;
    for (const pg of r.value) {
      const q = pg.pageprops?.wikibase_item;
      const c = pg.coordinates?.[0];
      if (!q || !c) continue;
      const p = by.get(q) || { id: q, name: pg.title, description: pg.description || '', lat: c.lat, lon: c.lon, sitelinks: 0, heritage: false, unesco: false, image: null, wiki: {} };
      if (pg.lang === 'cs') { p.name = pg.title; p.description = pg.description || p.description; }
      p.wiki[pg.lang] = pg.title;
      if (!p.image && pg.thumbnail?.source) p.image = pg.thumbnail.source;
      by.set(q, p);
    }
  }
  if (!by.size && lists.every((r) => r.status === 'rejected')) throw lists[0].reason;
  const counts = await sitelinkCounts([...by.keys()]);
  const out = [];
  for (const p of by.values()) {
    p.category = classifyText(`${p.description} ${p.name}`);
    if (!p.category) continue;
    p.sitelinks = counts.get(p.id) || 0;
    p.distanceKm = Math.round(haversineKm(center.lat, center.lon, p.lat, p.lon) * 10) / 10;
    p.score = scorePlace(p);
    out.push(p);
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Položky „see“/„do“ z wikitextu Wikivoyage ({{see|name=…|wikidata=Q…}}, {{listing|type=see…}}).
 * Wikivoyage je ručně psaný průvodce – co v něm je, to místní a cestovatelé opravdu doporučují.
 */
export function parseListings(wikitext) {
  const out = [];
  const re = /\{\{\s*(see|do|listing)\s*\n?\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/gi;
  for (const m of String(wikitext || '').matchAll(re)) {
    const body = m[2];
    // Hodnota pole končí svislítkem, které není uvnitř odkazu [[cíl|text]] ani šablony {{…|…}}.
    const field = (k) => (body.match(new RegExp(`(?:^|\\|)\\s*${k}\\s*=\\s*((?:\\[\\[[^\\]]*\\]\\]|\\{\\{[^}]*\\}\\}|[^|])*)`, 'i'))?.[1] || '').trim();
    if (m[1].toLowerCase() === 'listing' && !/^(see|do)$/i.test(field('type'))) continue;
    const name = field('name').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,}/g, '').trim();
    const wd = field('wikidata');
    if (name || /^Q\d+$/.test(wd)) out.push({ name, wikidata: /^Q\d+$/.test(wd) ? wd : null });
  }
  return out;
}

/** Doporučení z nejbližších článků anglické Wikivoyage (město, případně jeho čtvrti). */
async function wikivoyageListings(lat, lon) {
  const geo = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', list: 'geosearch', gscoord: `${lat}|${lon}`,
    gsradius: '15000', gslimit: '3', gsnamespace: '0',
  });
  const g = await limitWiki(() => request(`https://en.wikivoyage.org/w/api.php?${geo}`, { headers: { 'User-Agent': UA }, retry429: true, timeoutMs: 12000, retries: 0 }));
  const titles = (g.query?.geosearch || []).map((x) => x.title);
  if (!titles.length) return [];
  const rev = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: titles.join('|'),
  });
  const j = await limitWiki(() => request(`https://en.wikivoyage.org/w/api.php?${rev}`, { headers: { 'User-Agent': UA }, retry429: true, timeoutMs: 15000, retries: 0 }));
  return (j.query?.pages || []).flatMap((pg) => parseListings(pg.revisions?.[0]?.slots?.main?.content || pg.revisions?.[0]?.content));
}

/** Označí místa, která doporučuje Wikivoyage, a přidá jim body (podle QID nebo názvu). */
export function applyWikivoyage(places, listings) {
  if (!listings.length) return places;
  const qids = new Set(listings.map((l) => l.wikidata).filter(Boolean));
  const names = new Set(listings.map((l) => normalize(l.name)).filter((n) => n.length > 3));
  for (const p of places) {
    const hit = qids.has(p.id) || [p.name, p.wiki?.en, p.wiki?.cs].some((n) => n && names.has(normalize(n)));
    if (hit && p.category !== 'daytrip') {
      p.wikivoyage = true;
      p.score = Math.round((p.score + 8) * 10) / 10;
    }
  }
  return places;
}

/** DEMO režim (ATLAS_MOCK=1): vymyšlená místa kolem bodu, jasně označená. */
export function mockPlaces({ lat, lon }) {
  const cats = ['museum', 'church', 'castle', 'park', 'viewpoint', 'square', 'gallery', 'oldtown', 'monument', 'market', 'bridge', 'zoo'];
  const out = [];
  for (let i = 0; i < 24; i++) {
    const a = (i * 137.5 * Math.PI) / 180;
    const d = 0.004 + (i % 8) * 0.0045;
    const p = { id: `demo${i}`, name: `Ukázkové místo ${i + 1}`, description: 'demo data', lat: lat + Math.sin(a) * d, lon: lon + Math.cos(a) * d * 1.4, sitelinks: 60 - i * 2, heritage: i % 3 === 0, unesco: i === 0, image: null, category: cats[i % cats.length], extract: 'Vymyšlené místo pro ukázku aplikace (DEMO režim).', url: null };
    p.distanceKm = Math.round(haversineKm(lat, lon, p.lat, p.lon) * 10) / 10;
    out.push(p);
  }
  out.push({ id: 'demoTrip', name: 'Ukázkový výlet', description: 'demo data', lat: lat + 0.35, lon: lon + 0.2, sitelinks: 80, category: 'daytrip', tripKind: 'town', extract: 'Vymyšlený celodenní výlet (DEMO).', distanceKm: Math.round(haversineKm(lat, lon, lat + 0.35, lon + 0.2)) });
  for (const p of out) { p.score = scorePlace(p); p.categoryLabel = CATEGORY_CS[p.category]; }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Místa k návštěvě kolem bodu.
 * opts: { lat, lon, radiusKm (město, max 25), dayTrips (true = i výlety do 120 km), limit }
 */
export async function findPlaces({ lat, lon, radiusKm = 10, dayTrips = true, limit = 60 }) {
  const r = Math.min(25, Math.max(1, radiusKm));
  const key = `poi:${lat.toFixed(3)}:${lon.toFixed(3)}:${r}:${dayTrips}:${limit}`;
  // Úplný výsledek platí týden; neúplný (záloha přes Wikipedii, bez výletů, bez popisů) jen 15 min.
  return cache.wrap(key, (v) => (v.degraded ? 15 * 60e3 : 7 * 864e5), async () => {
    const center = { lat, lon };
    const t0 = Date.now();
    // Doporučení z Wikivoyage běží souběžně a jejich výpadek nic nerozbije.
    let wvFailed = false;
    const wvP = wikivoyageListings(lat, lon).catch(() => { wvFailed = true; return []; });
    // Výlety (okruh 120 km) jsou pomalejší dotaz: běží na pozadí a výsledek se uloží zvlášť, takže
    // když nestihne první zobrazení, příští načtení už ho má.
    const tripsP = dayTrips
      ? cache.wrap(`wdqs-trips:${lat.toFixed(2)}:${lon.toFixed(2)}`, 7 * 864e5, () => wdqs(sparqlNear(lat, lon, 120, 45, 300), 58000)).catch(() => null)
      : Promise.resolve([]);
    let cityRows;
    try {
      cityRows = await wdqs(sparqlNear(lat, lon, r, 4, 500));
    } catch {
      // Wikidata SPARQL nedostupné (výpadek, limit, přechod na QLever) → záloha přes Wikipedii.
      const fb = applyWikivoyage(await findPlacesViaWikipedia({ lat, lon }), await wvP).sort((a, b) => b.score - a.score);
      const picked = fb.slice(0, limit);
      await enrich(picked);
      const out = picked.map((p) => ({ ...p, categoryLabel: CATEGORY_CS[p.category] || p.category }));
      out.degraded = true;
      return out;
    }
    const waitTrips = Math.max(2000, 20000 - (Date.now() - t0));
    let tripRows = await Promise.race([tripsP, new Promise((res) => setTimeout(() => res(undefined), waitTrips))]);
    const tripsMissing = tripRows == null; // nestihlo se nebo selhalo
    if (tripsMissing) tripRows = [];
    // Obce a předměstí (italské comuni, francouzské communes…) nejsou „místa k vidění“ – ve městě
    // zůstanou jen s výrazným znakem (UNESCO); samotné město v centru se vyřadí vždy.
    const city = groupBindings(cityRows, center).filter((p) => p.category !== 'town' || (p.unesco && p.distanceKm > 2));
    for (const p of city) if (p.category === 'town') p.category = 'oldtown';
    const trips = groupBindings(tripRows, center)
      // ne ostrovy (Tenerife na Tenerife, jiné ostrovy přes moře) a ne památky rozeseté po mnoha místech
      .filter((p) => p.distanceKm > Math.max(r, 15) && !p.island && !p.serial
        && (p.category === 'town' || p.category === 'nature' || p.category === 'castle' || p.unesco))
      .map((p) => ({ ...p, category: 'daytrip', tripKind: p.category }));
    for (const p of [...city, ...trips]) p.score = scorePlace(p);
    applyWikivoyage(city, await wvP);
    const top = city.sort((a, b) => b.score - a.score).slice(0, limit);
    // Části jiného vybraného místa (Sixtinská kaple ve Vatikánských muzeích, katedrála na Hradě)
    // nejsou samostatná zastávka – připiš je k celku.
    const byId = new Map(top.map((p) => [p.id, p]));
    const merged = top.filter((p) => {
      const whole = (p.partOf || []).map((id) => byId.get(id)).find((w) => w && w !== p);
      if (!whole) return true;
      (whole.includes = whole.includes || []).push(p.name);
      return false;
    });
    const picked = [...merged, ...trips.sort((a, b) => b.score - a.score).slice(0, 8)];
    const enrichFailed = await enrich(picked);
    const out = picked.map(({ partOf, island, serial, ...p }) => ({ ...p, categoryLabel: CATEGORY_CS[p.category] || p.category }));
    if (tripsMissing || enrichFailed || wvFailed) out.degraded = true;
    return out;
  });
}
