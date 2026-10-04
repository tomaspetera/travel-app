// Zajímavá místa v okolí bodu – zdarma a bez klíče:
//   1) Wikidata Query Service (SPARQL, wikibase:around) – místa se souřadnicemi, typem, fotkou,
//      památkovou ochranou; významnost = počet jazykových verzí článku (sitelinks)
//   2) Wikipedia API – krátký popis (česky, jinak anglicky) a náhledový obrázek
// Wikimedia vyžaduje popisný User-Agent: https://meta.wikimedia.org/wiki/User-Agent_policy
import { request, limiter } from './http.js';
import { cache } from './cache.js';
import { haversineKm } from './geo.js';

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
  oldtown: ['Q676050', 'Q15243209', 'Q1497375'],
  viewpoint: ['Q6017969'],
  park: ['Q22698', 'Q1107656', 'Q167346', 'Q22652'],
  nature: ['Q23397', 'Q8502', 'Q34038', 'Q35509', 'Q46169', 'Q179049', 'Q23442', 'Q39594', 'Q150784', 'Q54050', 'Q47521'],
  beach: ['Q40080'],
  zoo: ['Q43501', 'Q2281788'],
  theme: ['Q194195', 'Q2416723', 'Q1144661'],
  market: ['Q37654', 'Q330284', 'Q1053651'],
  bridge: ['Q12280'],
  tower: ['Q12518', 'Q11303', 'Q39715'],
  ruins: ['Q839954', 'Q109607'],
  theatre: ['Q24354', 'Q153562', 'Q1060829'],
  sight: ['Q570116', 'Q2319498', 'Q483110'],
};
const SETTLEMENT = ['Q515', 'Q3957', 'Q532', 'Q747074', 'Q484170', 'Q2074737', 'Q5119', 'Q1549591', 'Q486972', 'Q1637706', 'Q262166', 'Q15284'];
const EXCLUDE = ['Q55488', 'Q928830', 'Q1248784', 'Q3914', 'Q3918', 'Q16917', 'Q4830453', 'Q79007', 'Q123705', 'Q149621', 'Q1048835', 'Q13226383', 'Q1802801', 'Q34442', 'Q1371849', 'Q18917976'];
const CAT_OF = new Map(Object.entries(TYPES).flatMap(([cat, ids]) => ids.map((id) => [id, cat])));
const UNESCO = 'Q9259';

export const CATEGORY_CS = {
  museum: 'Muzeum', gallery: 'Galerie', church: 'Kostel / chrám', castle: 'Hrad / pevnost', palace: 'Palác / zámek',
  monument: 'Památník', square: 'Náměstí', oldtown: 'Historické centrum', viewpoint: 'Vyhlídka', park: 'Park / zahrada',
  nature: 'Příroda', beach: 'Pláž', zoo: 'Zoo / akvárium', theme: 'Zábavní park', market: 'Trh', bridge: 'Most',
  tower: 'Věž / mrakodrap', ruins: 'Archeologie / zřícenina', theatre: 'Divadlo / opera', sight: 'Zajímavost', daytrip: 'Výlet',
};
const CAT_BONUS = { museum: 4, castle: 5, palace: 4, oldtown: 6, viewpoint: 3, church: 2, nature: 4, beach: 3, square: 2, ruins: 4 };

function sparqlNear(lat, lon, radiusKm, minLinks, limit) {
  return `SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?sl ?type ?img ?her ?cs ?en WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${minLinks})
  ?item wdt:P31/wdt:P279? ?type .
  BIND(geof:latitude(?coord) AS ?lat) BIND(geof:longitude(?coord) AS ?lon)
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P1435 ?her }
  OPTIONAL { ?cs schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en,[AUTO_LANGUAGE]". }
} LIMIT ${limit}`;
}

async function wdqs(query) {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(query)}`;
  const j = await limitWdqs(() => request(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, timeoutMs: 30000, retries: 1 }));
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
    if (!p) {
      const lat = Number(val(b, 'lat'));
      const lon = Number(val(b, 'lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      p = {
        id, name: val(b, 'itemLabel') || id, description: val(b, 'itemDescription') || '', lat, lon,
        sitelinks: Number(val(b, 'sl')) || 0, types: new Set(), heritage: false, unesco: false,
        image: null, wiki: { cs: title(val(b, 'cs')), en: title(val(b, 'en')) },
      };
      by.set(id, p);
    }
    const t = qid(val(b, 'type'));
    if (t) p.types.add(t);
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
    const cats = types.map((t) => CAT_OF.get(t)).filter(Boolean);
    let category = cats[0] || null;
    // Nejkonkrétnější kategorie: preferuj cokoliv před obecnou „zajímavostí“.
    if (cats.length > 1) category = cats.find((c) => c !== 'sight') || category;
    if (!category && p.heritage && !settlement) category = 'sight';
    if (settlement) category = 'town';
    if (!category || (types.some((t) => EXCLUDE.includes(t)) && category !== 'oldtown')) continue;
    p.category = category;
    p.types = undefined;
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
  if (p.category !== 'daytrip') s -= Math.max(0, p.distanceKm - 2) * 1.5;
  return Math.round(s * 10) / 10;
}

/** Popisy a náhledy z Wikipedie (po 20 článcích). */
async function enrich(places) {
  for (const lang of ['cs', 'en']) {
    const need = places.filter((p) => p.wiki[lang] && !p.extract);
    for (let i = 0; i < need.length; i += 20) {
      const batch = need.slice(i, i + 20);
      const qs = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'extracts|pageimages',
        exintro: '1', explaintext: '1', exsentences: '3', exlimit: '20', piprop: 'thumbnail', pithumbsize: '500', pilimit: '20',
        titles: batch.map((p) => p.wiki[lang]).join('|'),
      });
      try {
        const j = await limitWiki(() => request(`https://${lang}.wikipedia.org/w/api.php?${qs}`, { headers: { 'User-Agent': UA }, timeoutMs: 15000, retries: 1 }));
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
          if (pg.thumbnail?.source) p.image = pg.thumbnail.source;
        }
      } catch {
        // Popisy jsou jen doplněk.
      }
    }
  }
  for (const p of places) {
    if (!p.url) p.url = p.wiki.cs ? `https://cs.wikipedia.org/wiki/${encodeURIComponent(p.wiki.cs.replace(/ /g, '_'))}` : p.wiki.en ? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.wiki.en.replace(/ /g, '_'))}` : `https://www.wikidata.org/wiki/${p.id}`;
    p.wiki = undefined;
  }
  return places;
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
  const j = await limitWiki(() => request(`https://${lang}.wikipedia.org/w/api.php?${qs}`, { headers: { 'User-Agent': UA }, timeoutMs: 15000, retries: 1 }));
  return (j.query?.pages || []).map((pg) => ({ lang, ...pg }));
}

async function sitelinkCounts(qids) {
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'pageprops', ppprop: 'wb-sitelinks', titles: qids.slice(i, i + 50).join('|') });
    try {
      const j = await limitWiki(() => request(`https://www.wikidata.org/w/api.php?${qs}`, { headers: { 'User-Agent': UA }, timeoutMs: 15000, retries: 1 }));
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
  return cache.wrap(key, 7 * 864e5, async () => {
    const center = { lat, lon };
    let cityRows;
    let tripRows = [];
    try {
      [cityRows, tripRows] = await Promise.all([
        wdqs(sparqlNear(lat, lon, r, 4, 4000)),
        dayTrips ? wdqs(sparqlNear(lat, lon, 120, 45, 3000)).catch(() => []) : [],
      ]);
    } catch {
      // Wikidata SPARQL nedostupné (výpadek, limit, přechod na QLever) → záloha přes Wikipedii.
      const fb = await findPlacesViaWikipedia({ lat, lon });
      const picked = fb.slice(0, limit);
      await enrich(picked);
      return picked.map((p) => ({ ...p, categoryLabel: CATEGORY_CS[p.category] || p.category }));
    }
    const city = groupBindings(cityRows, center).filter((p) => p.category !== 'town' || p.distanceKm > 2);
    for (const p of city) if (p.category === 'town') p.category = 'oldtown';
    const trips = groupBindings(tripRows, center)
      .filter((p) => p.distanceKm > Math.max(r, 15) && (p.category === 'town' || p.category === 'nature' || p.category === 'castle' || p.unesco))
      .map((p) => ({ ...p, category: 'daytrip', tripKind: p.category }));
    for (const p of [...city, ...trips]) p.score = scorePlace(p);
    const picked = [...city.sort((a, b) => b.score - a.score).slice(0, limit), ...trips.sort((a, b) => b.score - a.score).slice(0, 8)];
    await enrich(picked);
    return picked.map((p) => ({ ...p, categoryLabel: CATEGORY_CS[p.category] || p.category }));
  });
}
