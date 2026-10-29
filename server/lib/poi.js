// Zajímavá místa v okolí bodu – zdarma a bez klíče:
//   1) Wikidata Query Service (SPARQL, wikibase:around) – místa se souřadnicemi, typem, fotkou,
//      památkovou ochranou; významnost = počet jazykových verzí článku (sitelinks)
//   2) Wikipedia API – krátký popis (česky, jinak anglicky) a náhledový obrázek
// Wikimedia vyžaduje popisný User-Agent: https://meta.wikimedia.org/wiki/User-Agent_policy
import { request, limiter } from './http.js';
import { cache } from './cache.js';
import { haversineKm, normalize } from './geo.js';
import { countryAt, COUNTRY_BY_ISO, airportsInCountry } from './airports.js';
import { CLASSIC_IDS, CLASSIC_KM, GONEXT_PTS, CLASSIC_PTS, parseGoNext, rankTrips, reachOf, whyOf } from './daytrips.js';

export const UA = 'ATLAS-travel/2.0 (https://github.com/tomaspetera/travel-app; hobby travel planner)';
const WDQS = 'https://query.wikidata.org/sparql';
const limitWdqs = limiter(2);
const limitWiki = limiter(4);
// zoo a parky (familyQuery) vlastní frontou – běží hned s dotazem na město, ne až za ním a za výlety
// (Wikidata snesou 5 dotazů naráz z jedné IP: 2 Objevuj + 1 tady + 2 ubytování)
const limitFamily = limiter(1);

// Typ (Wikidata P31 nebo jeho nadtřída) → kategorie.
const TYPES = {
  museum: ['Q33506', 'Q207694', 'Q17431399', 'Q1595639', 'Q588140', 'Q2772772', 'Q856584'],
  gallery: ['Q1007870'],
  church: ['Q16970', 'Q2977', 'Q163687', 'Q1088552', 'Q44613', 'Q32815', 'Q34627', 'Q44539', 'Q842402', 'Q5393308', 'Q160742', 'Q120560', 'Q317557', 'Q56242215', 'Q1129743'],
  castle: ['Q23413', 'Q57821', 'Q1785071', 'Q17715832', 'Q81917'],
  palace: ['Q16560', 'Q53536964', 'Q1802963', 'Q751876'], // zámek (château) je „Palác / zámek“, ne hrad (Troja)
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
// Skutečný hrad, pevnost nebo zřícenina hradu – samotné „opevnění“ s typem věž (Prašná brána) je věž.
const CASTLE_PROPER = ['Q23413', 'Q1785071', 'Q17715832'];
const GATE = /\b(brána|gate|tor|porta|puerta|porte|vrata|kapija|barbakan|barbican|bastion|bašta)\b/i;
// Městské hradby nejsou hrad na 1 h 40 min, ale ani brána na 20 min: procházka po hradbách (Dubrovník) trvá přes hodinu.
const WALLS = /\b(hradby|hradba|city walls?|town walls?|stadtmauer|mura|murallas?|muralhas?|zidine|remparts?)\b/i;
const WALLS_MIN = 75;
// Antický amfiteátr nebo cirkus (Koloseum, Circus Maximus, aréna ve Veroně) má ve Wikidatech i typ stadion / sportoviště –
// je to ale archeologické naleziště, ne sportoviště k vyřazení (živě 10/2026: Koloseum v Římě úplně chybělo).
const SPORT = ['Q483110', 'Q641226', 'Q1076486', 'Q137884967'];
// Vítězný oblouk, pamětní sloup, obelisk (Konstantinův oblouk, Trajánův sloup) – památník na pár minut, ne naleziště na hodinu.
const MEMORIAL = ['Q143912', 'Q97466153', 'Q51845395', 'Q1930585', 'Q170980'];
const MEMORIAL_NAME = /\b(oblouk|arch|arco|arc|sloup|column|colonna|columna|obelisk|obelisco|obélisque)\b/i;
const MUSEUM_NAME = /^(museo|museum|musée|muzeum|múzeum|museu|muzej|pinacoteca|galleria|gallery|galerie|galería)\b/i;
const HOUSE_MUSEUM = 'Q2087181'; // historic house museum
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
// Instituce v historické budově (nemocnice Sant Pau, škola, univerzita, „zařízení“): známá památka zůstane.
const INSTITUTION = ['Q16917', 'Q3914', 'Q3918', 'Q13226383'];
const NEIGHBOURHOOD = ['Q123705', 'Q149621'];
const TOURIST_DEST = 'Q1200957'; // turistický cíl (Barri Gòtic je i „sídlo“ a čtvrť)
// Kavárna, restaurace, pivnice: zastávka na kávu nebo jídlo (půl hodiny), ne prohlídka
const EATERY = ['Q30022', 'Q11707', 'Q112654507', 'Q27077054'];
// Stadion, hotel, univerzita jako „zajímavost“ nebo věž: zůstane, ale níž (sportoviště bývá ve Wikidatech o úroveň
// hlouběji, než dotaz sahá – Estadi Olímpic je „olympijský stadion“, ne „stadion“).
const MINOR_TYPES = ['Q1049757', 'Q589481', 'Q107640409', 'Q27686', 'Q63099748', 'Q48835818', 'Q38723', 'Q875538'];
const MINOR_TEXT = /stadion|stadium|univerzit|university|\bhotel\b/i;
const CAT_OF = new Map(Object.entries(TYPES).flatMap(([cat, ids]) => ids.map((id) => [id, cat])));
// Přírodní místo podle typu (pořadí rozhoduje: vodopád na řece je vodopád, horské jezero jezero, ne hora).
const NATURE_TYPE = [['waterfall', ['Q34038']], ['lake', ['Q23397']], ['cave', ['Q35509']], ['gorge', ['Q150784']], ['river', ['Q39594']],
  ['mountain', ['Q8502']], ['park', ['Q46169', 'Q179049']]];
const UNESCO = 'Q9259';
const ARCH_SITE = 'Q839954'; // archeologické naleziště

// Mešita a synagoga nejsou „kostel“: přesnější popis kategorie church podle názvu místa
const RELIG = [[/mešit|džamij|dzamij|mosque|moschee|mosquée|camii|\bcami\b|mezquita|meczet|masjid|dzsámi/i, 'Mešita'], [/synagog|zsinagóga|sinagoga/i, 'Synagoga']];
export const catLabel = (p) => (p.category === 'church' && (RELIG.find(([re]) => re.test(p.name || '')) || [])[1]) || CATEGORY_CS[p.category];
export const CATEGORY_CS = {
  museum: 'Muzeum', gallery: 'Galerie', church: 'Kostel / chrám', castle: 'Hrad / pevnost', palace: 'Palác / zámek',
  monument: 'Památník', square: 'Náměstí', oldtown: 'Historické centrum', viewpoint: 'Vyhlídka', park: 'Park / zahrada',
  nature: 'Příroda', beach: 'Pláž', zoo: 'Zoo / akvárium', theme: 'Zábavní park', market: 'Trh', bridge: 'Most',
  tower: 'Věž / mrakodrap', ruins: 'Archeologie / zřícenina', theatre: 'Divadlo / opera', sight: 'Zajímavost', daytrip: 'Výlet',
};
const CAT_BONUS = { museum: 4, castle: 5, palace: 4, oldtown: 6, viewpoint: 3, church: 2, nature: 4, beach: 3, square: 2, ruins: 4 };

// Jazyk místních názvů (cedule, jízdní řády) podle země – jen latinkou; jinde (řečtina, cyrilice, arabština…)
// a ve vícejazyčných zemích (Belgie, Švýcarsko) zůstane anglický název. Tabulka se nemění.
const LOCAL_LANG = {
  ES: 'es', PT: 'pt', IT: 'it', FR: 'fr', MC: 'fr', DE: 'de', AT: 'de', LI: 'de', NL: 'nl', PL: 'pl', SK: 'sk', HU: 'hu', HR: 'hr', SI: 'sl',
  RO: 'ro', DK: 'da', SE: 'sv', NO: 'nb', FI: 'fi', EE: 'et', LV: 'lv', LT: 'lt', IS: 'is', TR: 'tr', AL: 'sq', BA: 'bs', SM: 'it', VA: 'it',
  MX: 'es', AR: 'es', CL: 'es', CO: 'es', PE: 'es', CU: 'es', DO: 'es', CR: 'es', UY: 'es', EC: 'es', BO: 'es', PA: 'es', GT: 'es',
  BR: 'pt', CV: 'pt', ID: 'id', VN: 'vi', MY: 'ms', MA: 'fr', TN: 'fr', SN: 'fr',
};
/** Jazyk místních názvů kolem bodu ('' = žádný, stačí čeština / angličtina). Katalánsko a Baleáry katalánsky. */
export function localLang(lat, lon) {
  const cc = countryAt(lat, lon);
  if (cc === 'ES' && ((lat > 40.5 && lat < 42.9 && lon > 0.15 && lon < 3.35) || (lat > 38.6 && lat < 40.1 && lon > 1.1 && lon < 4.4))) return 'ca';
  return LOCAL_LANG[cc] || '';
}

/**
 * Místa v okruhu: poddotaz nejdřív vybere `items` nejvýznamnějších položek (podle počtu jazykových
 * verzí), teprve k nim se dotahují typy, fotka a památková ochrana. LIMIT na vnějším dotazu by
 * počítal řádky (jedna položka = mnoho řádků) a ve velkých městech by usekl náhodná místa.
 * Název: český, jinak místní (`lang` – Font Màgica, Plaça Reial), teprve pak anglický; popis: český, jinak anglický.
 * Doplňky až na konci (hned za poddotazem rozbily plán dotazu – odpověď se po 24 s utrhla; takhle trvá jako dřív).
 */
export function sparqlNear(lat, lon, radiusKm, minLinks, items, { wv = false, lang = '', types = null } = {}) {
  return `${sparqlSelect({ wv, lang })} WHERE {
  {
    SELECT ?item ?coord ?sl WHERE {
      SERVICE wikibase:around {
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" .
      }
      hint:Query hint:optimizer "None" .
      ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${minLinks})${types ? `
      FILTER EXISTS { VALUES ?ft { ${types.map((t) => `wd:${t}`).join(' ')} } ?item wdt:P31/wdt:P279? ?ft . }` : ''}
    } ORDER BY DESC(?sl) LIMIT ${items}
  }
${sparqlTail({ wv, lang })}
} LIMIT 30000`;
}
const sparqlSelect = ({ wv, lang }) => `SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?sl ?type ?img ?her ?cs ?en ?part ?cc ?whs ?csl ?csd${lang ? ' ?loc' : ''}${wv ? ' ?wv' : ''}`;
// Doplňky k vybraným položkám (?item, ?coord, ?sl) – stejné pro dotaz podle okolí i podle seznamu položek.
const sparqlTail = ({ wv, lang }) => `  ?item wdt:P31/wdt:P279? ?type .
  OPTIONAL { ?item wdt:P361 ?part }
  OPTIONAL { ?item wdt:P17 ?ctry . ?ctry wdt:P297 ?cc }
  BIND(geof:latitude(?coord) AS ?lat) BIND(geof:longitude(?coord) AS ?lon)
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P1435 ?her }
  OPTIONAL { ?cs schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }${wv ? `
  OPTIONAL { ?wv schema:about ?item ; schema:isPartOf <https://en.wikivoyage.org/> }` : ''}
  OPTIONAL { ?item wdt:P757 ?whs }
  OPTIONAL { ?item rdfs:label ?csl FILTER(lang(?csl) = "cs") }
  OPTIONAL { ?item schema:description ?csd FILTER(lang(?csd) = "cs") }${lang ? `
  OPTIONAL { ?item rdfs:label ?loc FILTER(lang(?loc) = "${lang}") }` : ''}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en,[AUTO_LANGUAGE]". }`;

/**
 * Konkrétní položky ve stejném tvaru jako sparqlNear: podle QID (klasické výlety), nebo podle názvu článku na
 * anglické Wikivoyage (doporučení z oddílu „Go next“ článku o městě – ?gn = název článku).
 */
export function sparqlItems({ ids = [], wvTitles = [] }, { lang = '' } = {}) {
  const head = wvTitles.length
    ? `VALUES ?gn { ${wvTitles.map((t) => `${JSON.stringify(t)}@en`).join(' ')} }
  ?gnl schema:name ?gn ; schema:isPartOf <https://en.wikivoyage.org/> ; schema:about ?item .`
    : `VALUES ?item { ${ids.map((q) => `wd:${q}`).join(' ')} }`;
  return `${sparqlSelect({ wv: true, lang })}${wvTitles.length ? ' ?gn' : ''} WHERE {
  ${head}
  ?item wdt:P625 ?coord ; wikibase:sitelinks ?sl .
${sparqlTail({ wv: true, lang })}
} LIMIT 20000`;
}

/** Dotaz SPARQL na Wikidata. queue = vlastní fronta volajícího (krátké dotazy nečekají za dlouhými dotazy Objevuj). */
export async function wdqs(query, timeoutMs = 45000, { queue = limitWdqs } = {}) {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(query)}`;
  const get = (ms) => queue(() => request(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, timeoutMs: ms, retries: 0 }));
  const t0 = Date.now();
  let j;
  try {
    j = await get(timeoutMs);
  } catch (e) {
    // Brána Wikidat občas vrátí 502/503/504 (živě 10/2026 návrh trasy: 502, o chvíli později v pořádku) – přišla-li
    // chyba rychle, jednou znovu po krátké pauze; pomalá chyba nebo časový limit ne (dotaz by trval dvakrát tak dlouho).
    const left = timeoutMs - (Date.now() - t0);
    if (!(e.status >= 502 && e.status <= 504) || left < timeoutMs / 2) throw e;
    await new Promise((r) => setTimeout(r, WDQS_RETRY_MS));
    j = await get(left);
  }
  return j.results?.bindings || [];
}
const WDQS_RETRY_MS = 1500;

const qid = (uri) => String(uri || '').split('/').pop();
const val = (b, k) => b[k]?.value;
// Fotka místa jen jako náhled na kartě (Objevuj, přehled země, náhled cíle: nejvýš 96 × 80 px, telefon 72 × 64):
// 330 px – standardní šířka náhledů Wikimedie – stačí i na displeji s hustotou 3× a má asi polovinu dat proti 500 px
// (Alfama 13 kB místo 25 kB), na mobilních datech znát u každé stránky míst.
const THUMB = 330;
const commonsThumb = (img) => `${img.replace(/^http:/, 'https:')}?width=${THUMB}`;
const title = (uri) => (uri ? decodeURIComponent(uri.split('/wiki/')[1] || '').replace(/_/g, ' ') : null);

/**
 * Řádky SPARQL (víc řádků na položku kvůli typům) → místa. islands = ID ostrovů, které jsou cílem samy o sobě
 * (Capri, Burano – doporučený nebo klasický výlet): bez jiného typu jsou „obec“, ne vyřazené místo.
 */
export function groupBindings(rows, center, { islands = null } = {}) {
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
        image: null, wiki: { cs: title(val(b, 'cs')), en: title(val(b, 'en')) }, coords: new Set(), partOf: new Set(), cc: '',
      };
      by.set(id, p);
    }
    // země (P17 → ISO kód) – pro ubytování, hranice na trase a vstupní podmínky
    const cc = String(val(b, 'cc') || '').toUpperCase();
    if (!p.cc && /^[A-Z]{2}$/.test(cc)) p.cc = cc;
    if (Number.isFinite(lat)) p.coords.add(`${lat.toFixed(2)},${lon.toFixed(2)}`);
    const t = qid(val(b, 'type'));
    if (t) p.types.add(t);
    const part = qid(val(b, 'part'));
    if (part) p.partOf.add(part);
    const her = qid(val(b, 'her'));
    if (her) { p.heritage = true; if (her === UNESCO) p.unesco = true; }
    // číslo památky UNESCO (P757) mívají i památky bez P1435 = UNESCO (nemocnice Sant Pau)
    if (val(b, 'whs')) p.heritage = p.unesco = true;
    p.csName ||= val(b, 'csl') || null;
    p.locName ||= val(b, 'loc') || null;
    p.csDesc ||= val(b, 'csd') || null;
    // má článek v cestovním průvodci Wikivoyage (jen dotaz na výlety); název článku pro doporučení „Go next“
    if (val(b, 'wv')) { p.wv = true; p.wvTitle ||= title(val(b, 'wv')); }
    const img = val(b, 'img');
    if (img && !p.image) p.image = commonsThumb(img);
  }
  const out = [];
  for (const p of by.values()) {
    // Bez českého názvu místní (na cedulích: Font Màgica, Castell de Montjuïc), teprve pak anglický. Jako nadpis
    // s velkým písmenem (Wikidata píší „plaça del Rei“, „parc de la Ciutadella“, „kostel svatého Martina“).
    if (!p.csName && p.locName) p.name = p.locName;
    p.name = p.name.charAt(0).toLocaleUpperCase('cs') + p.name.slice(1);
    // Popis česky, jinak (anglický) se značkou jazyka – aplikace ho zkrátí a označí „anglicky“.
    if (p.csDesc) p.description = p.csDesc;
    p.descLang = p.csDesc ? 'cs' : p.description ? 'en' : undefined;
    delete p.csName; delete p.locName; delete p.csDesc;
    if (/^Q\d+$/.test(p.name)) continue; // bez názvu
    const types = [...p.types];
    const has = (list) => types.some((t) => list.includes(t));
    const structure = has(STRUCTURE);
    const ancient = has(TYPES.ruins);
    // stadion nebo aréna, která je zároveň antickým nalezištěm (Koloseum), se nevyřazuje
    const hardTypes = types.filter((t) => HARD_EXCLUDE.includes(t) && !(ancient && SPORT.includes(t)));
    const hard = hardTypes.length > 0;
    const soft = types.filter((t) => SOFT_EXCLUDE.includes(t));
    const cats = new Set(types.map((t) => CAT_OF.get(t)).filter(Boolean));
    // brána nebo věž v hradbách s výstavou (Prašná brána) je věž, ne hrad ani dvouhodinové muzeum
    if (cats.has('castle') && cats.has('tower') && !has(CASTLE_PROPER)) cats.delete('castle');
    if (cats.has('tower') && cats.has('museum')) cats.delete('museum');
    // městská brána, barbakan, bašta (jen „opevnění“, ne hrad ani pevnost) – krátká zastávka, ne prohlídka hradu na
    // 1 h 40 min (živě: Floriánská brána a Barbakan v Krakově, Vrata od Pila v Dubrovníku); hradby = procházka po nich
    const text = `${p.name} ${p.description}`;
    if (cats.has('castle') && !has(CASTLE_PROPER) && (GATE.test(text) || WALLS.test(text))) {
      cats.delete('castle'); cats.add('monument');
      if (!GATE.test(p.name) && WALLS.test(text)) p.visitMin = WALLS_MIN;
    }
    // naleziště, které je státním muzeem (Koloseum, Palatin, Caracallovy lázně – v Itálii „národní muzeum“), se
    // prochází jako naleziště, ne jako dvouhodinová sbírka; muzeum se jménem muzea zůstane muzeem
    if (cats.has('ruins') && cats.has('museum') && !MUSEUM_NAME.test(p.name)) cats.delete('museum');
    if (cats.has('ruins') && (has(MEMORIAL) || MEMORIAL_NAME.test(p.name))) { cats.delete('ruins'); cats.add('monument'); }
    // muzeum nebo galerie v paláci, které nese jejich jméno (Museo Poldi Pezzoli, Pinacoteca di Brera) – jde se do
    // sbírek, ne na prohlídku paláce (ikona 🏛️ a čas na muzeum, ne 👑)
    if (cats.has('palace') && (cats.has('museum') || cats.has('gallery')) && MUSEUM_NAME.test(p.name)) cats.delete('palace');
    // kostel, který je i muzeem (Pantheon, Sainte-Chapelle), je kostel – ne dvouhodinové muzeum (čas podle významu
    // v itinerary.js); muzeum v kostele, které nese jeho jméno (Museo di San Marco), zůstane muzeem
    if (cats.has('church') && cats.has('museum') && !MUSEUM_NAME.test(p.name)) cats.delete('museum');
    // antické fórum (Forum Romanum: „forum“ = náměstí + archeologické naleziště) je naleziště na hodinu, ne náměstí
    // na půl hodiny
    if (cats.has('square') && cats.has('ruins')) cats.delete('square');
    // Konkrétní typ (most, kostel, hrad…) vyhrává nad obecným „silnice/ulice“ (Karlův most je i silnice).
    const specific = CAT_PRIORITY.find((c) => c !== 'sight' && cats.has(c));
    const known = (p.heritage || types.includes(TOURIST_DEST)) && p.sitelinks >= 25;
    // Sídlo je obec, ne klášter s typem „sídlo“ (Strahovský klášter, Jerónimos – stavba s konkrétním typem)
    // a ne známá historická čtvrť (Barri Gòtic – čtvrť a turistický cíl). Antické město, které je dnes archeologickým
    // nalezištěm (Ostia Antica, Pompeje, Herculaneum), je naleziště, ne obec.
    const settlement = has(SETTLEMENT) && !(specific && structure) && !(soft.some((t) => NEIGHBOURHOOD.includes(t)) && types.includes(TOURIST_DEST) && known)
      && !types.includes(ARCH_SITE);
    let category = null;
    if (settlement) category = 'town';
    // památka, kterou vyřazuje jen instituce nebo „zařízení“ (park Güell): konkrétní typ vyhrává (stadion,
    // aréna nebo nádraží ne – býčí aréna La Monumental není náměstí)
    else if (specific && (!hard || ((p.heritage || p.unesco) && hardTypes.every((t) => INSTITUTION.includes(t))))) category = specific;
    else if (p.unesco) category = 'sight';
    // známá památka, kterou vyřazuje jen to, co je v ní za instituci (nemocnice Sant Pau)
    else if (hard) category = known && hardTypes.every((t) => INSTITUTION.includes(t)) ? 'sight' : null;
    // Památková čtvrť (Alfama) = historické centrum; památková ulice (Zlatá ulička) = zajímavost.
    else if (soft.length) category = known ? (soft.some((t) => NEIGHBOURHOOD.includes(t)) ? 'oldtown' : 'sight') : null;
    else if (cats.has('sight') || p.heritage || (p.sitelinks >= 25 && structure)) category = 'sight';
    if (!category && islands?.has(p.id) && types.includes(ISLAND)) category = 'town';
    if (!category) continue;
    // Obecná „zajímavost“ podle začátku popisu (Námořní muzeum: „muzeum“, Estufa Fria: „Gardens in Lisbon“) – jen
    // první slova bez vlastních jmen, dál bývá poloha („moderní bankovní budova na nároží Jiráskova náměstí“
    // není náměstí, „někdejší radnice Hradčan“ není hrad).
    if (category === 'sight') {
      const head = String(p.description).replace(/(cultural )?heritage monument|cultural property|kulturní památka/gi, '').trim().split(/\s+/)
        .slice(0, 3).filter((w, i) => i === 0 || !/^\p{Lu}/u.test(w)).join(' ');
      category = classifyText(head) || 'sight';
      if (category === 'sight' && has(EATERY)) { p.eatery = true; p.visitMin = 30; } // Café A Brasileira, Els Quatre Gats
    }
    // dům-muzeum (Casa Vicens, Rubensův dům) je prohlídka bytu na hodinu a čtvrt, ne dvouhodinové muzeum se sbírkami
    if (category === 'museum' && types.includes(HOUSE_MUSEUM)) p.visitMin = 75;
    if ((category === 'sight' || category === 'tower') && !p.eatery && !p.unesco && (has(MINOR_TYPES) || MINOR_TEXT.test(`${p.name} ${p.description}`))) p.minor = true;
    p.category = category;
    // druh přírodního místa (hora, vodopád, jezero…) – túry na víc dní (hikeplan.js) podle něj střídají cíle
    if (category === 'nature') { const nt = NATURE_TYPE.find(([, ids]) => has(ids)); if (nt) p.natureType = nt[0]; }
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
  if (p.minor) s -= 15; // stadion, hotel, univerzita – jen když není nic lepšího
  // Výlet: bližší má přednost (Tivoli 27 km před L'Aquilou 90 km); ve městě penalizace od 2 km.
  s -= p.category === 'daytrip' ? (p.distanceKm || 0) * 0.15 : Math.max(0, p.distanceKm - 2) * 1.5;
  return Math.round(s * 10) / 10;
}

/**
 * Popisy a náhledy z Wikipedie (po 20 článcích). Vrací true, když se něco nepovedlo (třeba 429
 * „příliš mnoho dotazů“) – pak se další dávky už neposílají a výsledek se uloží jen krátce.
 * Místo bez článku na Wikipedii (jen na Wikidatech) chybou není.
 * preferCs: karta místa ukazuje úvod článku, jinak popis – anglický úvod ustoupí českému popisu z Wikidat,
 * když nějaký říká víc než jedno slovo („hora ve Španělsku“; anglický úvod zůstane v extractEn).
 * descLang = jazyk textu karty (úvod, jinak popis): anglický aplikace zkrátí a označí „anglicky“.
 */
async function enrich(places, { preferCs = false } = {}) {
  let failed = false;
  for (const lang of ['cs', 'en']) {
    const need = places.filter((p) => p.wiki[lang] && !p.extract);
    for (let i = 0; i < need.length && !failed; i += 20) {
      const batch = need.slice(i, i + 20);
      const qs = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'extracts|pageimages',
        exintro: '1', explaintext: '1', exsentences: '3', exlimit: '20', piprop: 'thumbnail|name', pithumbsize: String(THUMB), pilimit: '20',
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
              : `https://${lang}.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(pg.pageimage)}?width=${THUMB}`;
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
    if (preferCs && p.extract && p.extractLang !== 'cs' && p.descLang === 'cs' && p.description.split(/\s+/).length >= 3) {
      p.extractEn = p.extract;
      p.extract = undefined;
      p.extractLang = undefined;
    }
    if (p.extract) p.descLang = p.extractLang;
  }
  return failed;
}

// ---------- záloha bez SPARQL: Wikipedia geosearch + počet jazykových verzí z Wikidat ----------

// Klasifikace podle krátkého popisu (Wikidata description) a názvu – cs i en.
// Pořadí rozhoduje: zoo, zábavní a národní park před obecným „park / zahrada“ (jinak by je nikdy nenašlo).
const TEXT_CATS = [
  ['museum', /muzeum|museum|museo|musée/],
  ['gallery', /galerie|gallery|pinacoteca|galleria/],
  ['church', /kostel|katedrál|bazilik|chrám|klášter|kaple|mešit|synagog|church|cathedral|basilica|monastery|abbey|chapel|mosque|synagogue|temple|duomo/],
  // „hrad“ jen na začátku slova – „zahrada“ (botanická, zoologická) hrad není
  ['castle', /\bhrad|pevnost|tvrz|castle|fortress|citadel|fort\b/],
  ['palace', /palác|zámek|palace|palazzo|château|schloss/],
  ['oldtown', /historické centrum|staré město|old town|historic (centre|center|district)/],
  ['square', /náměstí|square|piazza|plaza|platz/],
  ['zoo', /zoo|akvárium|aquarium/],
  ['theme', /zábavní park|amusement park|theme park/],
  ['nature', /národní park|national park/],
  ['park', /park|zahrad|garden|giardino/],
  ['viewpoint', /vyhlídk|viewpoint|lookout|belvedere/],
  ['nature', /jezero|hora|vodopád|jeskyn|národní park|lake|mountain|waterfall|cave|national park|island|ostrov/],
  ['beach', /pláž|beach|playa|spiaggia/],
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
    piprop: 'thumbnail', pithumbsize: String(THUMB), pilimit: '50', colimit: '50',
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
  const trip = { id: 'demoTrip', name: 'Ukázkový výlet', description: 'demo data', lat: lat + 0.35, lon: lon + 0.2, sitelinks: 80, category: 'daytrip', tripKind: 'town', unesco: true, classic: true, highlights: ['Ukázková katedrála', 'Ukázkový hrad'], extract: 'Vymyšlený celodenní výlet (DEMO).', distanceKm: Math.round(haversineKm(lat, lon, lat + 0.35, lon + 0.2)) };
  out.push(Object.assign(tripOut(trip), { reach: reachOf({ lat, lon }, trip), why: whyOf(trip) }));
  for (const p of out) { p.score = scorePlace(p); p.categoryLabel = catLabel(p); }
  return out.sort((a, b) => b.score - a.score);
}

/** DEMO režim: vymyšlené cíle výletů 30–110 km od bodu. */
export function mockTrips({ lat, lon }) {
  const kinds = ['town', 'castle', 'nature', 'town', 'castle', 'nature', 'town', 'town', 'nature', 'castle', 'palace', 'zoo'];
  return kinds.map((tripKind, i) => {
    const a = (i * 97 * Math.PI) / 180;
    const d = 0.3 + (i % 5) * 0.17;
    const p = { id: `demoTrip${i}`, name: `Ukázkový výlet ${i + 1}`, description: 'demo data', lat: lat + Math.sin(a) * d, lon: lon + Math.cos(a) * d * 1.4, sitelinks: 90 - i * 4, unesco: i === 0, category: 'daytrip', tripKind, extract: 'Vymyšlený cíl výletu (DEMO režim).', url: null };
    p.distanceKm = Math.round(haversineKm(lat, lon, p.lat, p.lon));
    p.score = scorePlace(p);
    if (tripKind === 'nature') p.natureKind = ['park', 'waterfall', 'mountain'][i % 3];
    if (i === 7) p.spa = true;
    if (tripKind === 'town') p.highlights = ['Ukázková katedrála', 'Staré náměstí', 'Ukázkové muzeum'].slice(0, 1 + (i % 3));
    p.categoryLabel = p.natureKind ? NATURE_LABEL[p.natureKind] : tripKind === 'town' ? (p.spa ? 'Lázně' : 'Město / obec') : CATEGORY_CS[tripKind];
    return Object.assign(p, { reach: reachOf({ lat, lon }, p), why: whyOf({ ...p, goNext: i === 3 }) });
  });
}

// Cíle výletů: města, příroda, hrady (a cokoli s UNESCO) dál než `minKm` od středu.
// U měst rozhoduje, co v nich je k vidění: významné památky do 3 km (z téhož dotazu) přidají body,
// UNESCO (Wikidata ho dává památce, ne městu – Kutná Hora) a výčet „uvidíš“; město bez jediné
// významné památky (průmyslové město, předměstí) cílem výletu není.
// Skóre je jen význam místa: dosah (čas cesty) přidá daytrips.js rankTrips, plánovač výletů autem počítá s časem jízdy sám.
// road = true: i zámky, zříceniny, zoo a zábavní parky (podle zájmů výletu); jinak města, hrady a příroda.
// goNext / classic = ID doporučených výletů (Wikivoyage „Go next“ článku o městě) a klasik (daytrips.js CLASSICS):
// body navíc a projdou i bez obvyklého druhu (Ostia Antica, Zaanse Schans), ostrovy (Capri) a blíž než minKm (nearKm).
// cover = ID míst programu ve městě: výlet, jehož hlavní památka už v programu je, se nenabízí.
// Kraj, okres, provincie… mívají ve Wikidatech typ obce a souřadnice hlavního města (Alentejo = Évora).
// Konec slova přes \p{L}, ne \b: to zná jen ASCII, takže za „země“, „autonomní“ nebo „vojvodství“ by nikdy neplatilo.
const REGION_DESC = /^(kraj|region|regione|región|okres|district|distrikt|distretto|provincie|province|provincia|county|departement|département|spolková země|federal state|state of|autonomní|autonomous community|comarca|voivodeship|vojvodství)(?![\p{L}\p{N}])/iu;

const DAYTRIP_KINDS = new Set(['town', 'nature', 'castle']);
const ROAD_KINDS = new Set(['town', 'nature', 'castle', 'palace', 'ruins', 'zoo', 'theme']);
// Lázně: „lázeňské město“, „spa town“, německé „Bad …“, „Kurort“.
const SPA = /lázn|lázeň|spa town|kurort|\bbad [a-zäöü]|thermal|termál|banja|uzdrowisk/i;

export function tripsFromRows(rows, center, minKm, { road = false, unesco = [], goNext = [], classic = [], nearKm = minKm, cover = null } = {}) {
  const gn = new Set(goNext);
  const cl = new Set(classic);
  const all = groupBindings(rows, center, { islands: new Set([...gn, ...cl]) });
  const sights = all.filter((p) => p.category !== 'town' && !p.island && !p.serial);
  const airports = airportsIn(rows);
  const towns = [];
  const trips = [];
  const ownIds = new Map(); // výlet → ID jeho památek (UNESCO, pak podle významu) – obec za humny lepšího cíle

  for (const p of all) {
    const pick = gn.has(p.id) || cl.has(p.id);
    // ne ostrovy (Tenerife na Tenerife, jiné ostrovy přes moře – doporučené ano: Capri, Burano) a ne památky rozeseté
    // po mnoha místech
    if (!(p.distanceKm > (pick ? nearKm : minKm)) || p.distanceKm > CLASSIC_KM || (p.island && !pick) || p.serial) continue;
    // Výlety autem/vlakem (road) berou i zámky, zříceniny, zoo a zábavní parky (podle zájmů výletu).
    const kinds = road ? ROAD_KINDS : DAYTRIP_KINDS;
    if (!(kinds.has(p.category) || p.unesco || pick)) continue;
    if (p.category === 'town' && REGION_DESC.test(p.description)) continue;
    const t = { ...p, category: 'daytrip', tripKind: p.category, goNext: gn.has(p.id), classic: cl.has(p.id) };
    // město pojmenované po letišti hned vedle (Fiumicino, Luton) – bez památek se tam jezdí jen na letadlo
    if (p.category === 'town') {
      const n = ` ${normalize(p.name)} `;
      if (n.trim().length >= 3 && airports.some((a) => haversineKm(a.lat, a.lon, p.lat, p.lon) <= 8 && a.names.includes(n))) t.airport = true;
    }
    if (p.category === 'town' && SPA.test(`${p.name} ${p.description}`)) t.spa = true;
    if (p.category === 'town') {
      // Památka, která není u města výletu o hodně blíž než u středu výchozího místa, patří tomu místu (bazilika sv. Marka
      // není „k vidění“ na Muranu 3,5 km od středu Benátek, Belém s UNESCO není v Almadě za řekou; solný důl ve Wieliczce ano).
      const own = (x, km) => {
        const d = haversineKm(p.lat, p.lon, x.lat, x.lon);
        return d <= km && d < haversineKm(center.lat, center.lon, x.lat, x.lon) / 2;
      };
      const near = sights.filter((x) => own(x, 3)).sort((a, b) => b.sitelinks - a.sitelinks);
      // památka UNESCO bývá kousek za středem (Kulturní krajina Sintry ~4 km od náměstí)
      const whs = unesco.filter((u) => own(u, 5));
      t.sights = near.length;
      // bez jména samotného města a bez delších variant téhož („Historické centrum Kutné Hory s kostelem
      // sv. Barbory a s chrámem…“ vedle „Historické centrum Kutné Hory s kostelem sv. Barbory“)
      const seen = new Set([normalize(p.name)]);
      const names = [...whs.map((u) => u.name), ...near.map((x) => x.name)].filter((n) => {
        const k = normalize(n);
        if (!k || seen.has(k)) return false; // stejné jméno jen jinak napsané (velikost písmen, pomlčka)
        seen.add(k);
        return true;
      });
      t.highlights = names.filter((n) => !names.some((o) => o !== n && normalize(n).startsWith(`${normalize(o)} `))).slice(0, 3);
      t.highlightIds = near.map((x) => x.id);
      ownIds.set(t, [...whs.map((u) => u.id), ...t.highlightIds]);
      if (whs.some((u) => !u.serial) || near.some((x) => x.unesco)) t.unesco = true;
      else if (whs.length) t.unescoPart = true; // jen část rozsáhlé sériové památky
      // Obec pojmenovaná po hoře nebo hradu hned vedle (Monistrol de Montserrat → Montserrat, Karlštejn → hrad)
      // jezdí se tam kvůli té památce – cílem výletu je památka, obec zůstane v „uvidíš“. Stejně klasika nebo
      // doporučení průvodce hned u obce, která sama tak vysoko není (Pompeje u Pompei, Ostia Antica u Ostie,
      // Neuschwanstein u Schwangau) – obec pak v „uvidíš“ není, jen v gateway (přespání, mapy).
      const rank = (x) => (cl.has(x.id) ? 2 : gn.has(x.id) ? 1 : 0);
      const named = near.find((x) => x.category !== 'town' && ROAD_KINDS.has(x.category) && normalize(x.name).length >= 4
        && ` ${normalize(p.name)} `.includes(` ${normalize(x.name)} `) && p.sitelinks <= 2 * x.sitelinks);
      const gate = named || near.find((x) => x.category !== 'town' && rank(x) > rank(p));
      if (gate) {
        Object.assign(t, {
          id: gate.id, name: gate.name, description: gate.description, lat: gate.lat, lon: gate.lon, image: gate.image || p.image, wiki: gate.wiki,
          tripKind: gate.category, heritage: gate.heritage, wv: gate.wv || p.wv, sights: near.length - 1, spa: undefined, gateway: p.name,
          goNext: t.goNext || gn.has(gate.id), classic: t.classic || cl.has(gate.id), airport: undefined,
          highlights: [...(named ? [p.name] : []), ...t.highlights.filter((n) => normalize(n) !== normalize(gate.name))].slice(0, 3),
        });
      } else towns.push(t);
    }
    trips.push(t);
  }
  // Hrad nebo památka, která je už „k vidění“ v některém městě výletu, není samostatný cíl (doporučená také ne – je
  // v „uvidíš“ toho města). Výlet, jehož hlavní památka už je v programu ve městě (cover), také ne.
  const inTown = new Set(towns.flatMap((t) => t.highlightIds));
  const out = trips.filter((t) => (t.tripKind === 'town' || t.gateway || !inTown.has(t.id))
    && !(cover && (cover.has(t.id) || cover.has(t.highlightIds?.[0]))));
  for (const t of out) {
    // Památková ochrana obce o ní jako o cíli nic neříká (v Katalánsku je „kulturním statkem“ i celá vesnice
    // La Granada) – město boduje podle toho, co v něm je, a podle článku v průvodci Wikivoyage.
    const town = t.tripKind === 'town';
    const base = town ? { ...t, heritage: false } : t;
    // Část rozsáhlé sériové památky UNESCO (jedno z hornických městeček Krušnohoří) je jen malé plus –
    // celá památka (+15 ve scorePlace) je o hodně víc.
    t.score = scorePlace({ ...base, category: t.tripKind, distanceKm: 0 }) + Math.min(4, t.sights || 0) * 6 + (t.unescoPart ? 3 : 0) + (town && t.wv ? 6 : 0)
      + (t.goNext ? GONEXT_PTS : 0) + (t.classic ? CLASSIC_PTS : 0);
    // město bez jediné známé památky (průmyslové, předměstí) je slabší cíl než menší památkové
    if (town && !t.sights && !t.unesco) t.score -= t.unescoPart ? 4 : 8;
    t.score = Math.round(t.score * 10) / 10;
    t.highlightIds = undefined;
  }
  // Jedno místo pod víc položkami (město a stejnojmenná obec/okres) → jen to nejlepší v okruhu 4 km.
  const kept = [];
  // Obec za humny lepšího cíle se stejnou hlavní památkou (Armilla a Maracena u Granady s Alhambrou) také ne.
  const satellite = (t, k) => t.tripKind === 'town' && k.tripKind === 'town' && ownIds.get(t)?.length && ownIds.get(k)?.includes(ownIds.get(t)[0])
    && haversineKm(k.lat, k.lon, t.lat, t.lon) < 10;
  for (const t of out.sort((a, b) => b.score - a.score)) {
    if (!kept.some((k) => haversineKm(k.lat, k.lon, t.lat, t.lon) < 4 || satellite(t, k))) kept.push(t);
  }
  return kept;
}

// Letiště z řádků dotazu (groupBindings je vyřadí) – pro poznání „letištního“ města: { names: ' název místní ', lat, lon }.
const AIRPORT = ['Q1248784', 'Q644371'];
function airportsIn(rows) {
  const by = new Map();
  for (const b of rows) {
    const id = qid(val(b, 'item'));
    if (!AIRPORT.includes(qid(val(b, 'type'))) || by.has(id)) continue;
    const lat = Number(val(b, 'lat'));
    const lon = Number(val(b, 'lon'));
    if (Number.isFinite(lat) && Number.isFinite(lon)) by.set(id, { names: ` ${normalize(val(b, 'itemLabel'))} ${normalize(val(b, 'loc'))} `, lat, lon });
  }
  return [...by.values()];
}

// Památky UNESCO (vč. částí sériových) v obdélníku kolem bodu – rychlý dotaz bez wikibase:around.
// Wikidata dávají UNESCO památce, ne městu (Kutná Hora, Telč), proto se k městům přiřazují podle polohy.
// Název jako u míst: český, jinak místní („Paisagem Cultural de Sintra“), teprve pak anglický.
function sparqlUnesco(lat, lon, km, lang = '') {
  const dLat = km / 111 + 0.05;
  const dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))) + 0.05;
  const f = (x) => x.toFixed(3);
  return `SELECT ?item ?itemLabel ?lat ?lon ?whs ?csl${lang ? ' ?loc' : ''} WHERE {
  ?item wdt:P757 ?whs ; wdt:P625 ?coord .
  BIND(geof:latitude(?coord) AS ?lat) BIND(geof:longitude(?coord) AS ?lon)
  FILTER(?lat > ${f(lat - dLat)} && ?lat < ${f(lat + dLat)} && ?lon > ${f(lon - dLon)} && ?lon < ${f(lon + dLon)})
  OPTIONAL { ?item rdfs:label ?csl FILTER(lang(?csl) = "cs") }${lang ? `
  OPTIONAL { ?item rdfs:label ?loc FILTER(lang(?loc) = "${lang}") }` : ''}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en". }
} LIMIT 2000`;
}
// Části sériové památky (Hornický region Krušnohoří: ~20 dolů a městeček) mají stejné číslo před
// pomlčkou (1478-001, 1478-002…); u takových je bonus jen malý, jinak by zaplavily výběr. Počítají se
// různé položky, ne řádky (Žatec a krajina žateckého chmele má jednu položku s šesti body – celá památka).
export function unescoSites(rows) {
  const list = rows
    .map((b) => ({ id: qid(val(b, 'item')), name: val(b, 'csl') || val(b, 'loc') || val(b, 'itemLabel'), lat: Number(val(b, 'lat')), lon: Number(val(b, 'lon')), site: String(val(b, 'whs') || '').split('-')[0] }))
    .filter((u) => u.name && !/^Q\d+$/.test(u.name) && Number.isFinite(u.lat) && Number.isFinite(u.lon));
  const parts = new Map();
  for (const u of list) parts.set(u.site, (parts.get(u.site) || new Set()).add(u.id));
  // Číslo části („1390rev-004“ = 4. část) prozradí sériovou památku, i když v okruhu dotazu leží jen pár jejích částí:
  // vinařská krajina Piemontu, kůlová obydlí v Alpách (111 částí) – jinak by malá obec dostala bonus celé památky
  // (Nizza Monferrato před Parmou v návrhu trasy, živě 10/2026).
  const maxPart = new Map();
  for (const r of rows) {
    const [site, part] = String(val(r, 'whs') || '').split('-');
    const n = /^\d{1,3}$/.test(part || '') ? Number(part) : 0; // „1558-2023“ = rok rozšíření, ne část
    if (site && n > (maxPart.get(site) || 0)) maxPart.set(site, n);
  }
  return list.map((u) => ({ ...u, serial: u.site !== '' && (parts.get(u.site).size > 3 || (maxPart.get(u.site) || 0) >= 4) }));
}
const unescoQuery = (lat, lon) => cache.wrap(`wdqs-unesco:${lat.toFixed(1)}:${lon.toFixed(1)}`, 30 * 864e5, async () => {
  const q = sparqlUnesco(lat, lon, 125, localLang(lat, lon));
  // krátký dotaz – při 429 („příliš mnoho dotazů“) jeden pokus znovu po 3 s; timeout ani jiná
  // chyba se neopakuje (výlety by se jen déle načítaly)
  const rows = await wdqs(q, 40000).catch((e) => (e.status === 429
    ? new Promise((res) => setTimeout(res, 3000)).then(() => wdqs(q, 20000))
    : Promise.reject(e)));
  return unescoSites(rows);
});

// Přírodní cíle: mají málo jazykových verzí, takže je dotaz na nejvýznamnější místa nenajde.
// Dotaz podle typu (národní park, vodopád, jeskyně, soutěska, skály / hory, jezera, rezervace)
// a obdélníku kolem bodu – pomalý (~45 s), proto v mezipaměti 30 dní a na pozadí.
const NATURE_TYPES = [
  // [typ, druh, min. jazykových verzí]
  ['Q46169', 'park', 3], ['Q34038', 'waterfall', 3], ['Q35509', 'cave', 3], ['Q150784', 'gorge', 3], ['Q207326', 'rock', 3],
  ['Q1640011', 'rock', 3], ['Q2245405', 'rock', 3], ['Q1286517', 'park', 3],
  ['Q8502', 'mountain', 8], ['Q23397', 'lake', 8], ['Q179049', 'reserve', 8],
];
function sparqlNature(lat, lon, km, types, minLinks) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const f = (x) => x.toFixed(3);
  return `SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?sl ?t ?cs ?en ?img WHERE {
  VALUES ?t { ${types.map((t) => `wd:${t}`).join(' ')} }
  ?item wdt:P31 ?t ; wdt:P625 ?c ; wikibase:sitelinks ?sl .
  FILTER(?sl >= ${minLinks})
  BIND(geof:latitude(?c) AS ?lat) BIND(geof:longitude(?c) AS ?lon)
  FILTER(?lat > ${f(lat - dLat)} && ?lat < ${f(lat + dLat)} && ?lon > ${f(lon - dLon)} && ?lon < ${f(lon + dLon)})
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?cs schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en". }
} LIMIT 3000`;
}
const natureQuery = (lat, lon) => cache.wrap(`wdqs-nature:${lat.toFixed(1)}:${lon.toFixed(1)}`, 30 * 864e5, async () => {
  const groups = [3, 8].map((min) => NATURE_TYPES.filter((t) => t[2] === min).map((t) => t[0]));
  const parts = await Promise.all(groups.map((types, i) => wdqs(sparqlNature(lat, lon, 125, types, i ? 8 : 3), 58000)));
  const kindOf = new Map(NATURE_TYPES.map(([t, k]) => [t, k]));
  const by = new Map();
  for (const b of parts.flat()) {
    const id = qid(val(b, 'item'));
    const name = val(b, 'itemLabel');
    if (!id || !name || /^Q\d+$/.test(name) || by.has(id)) continue;
    const lat2 = Number(val(b, 'lat'));
    const lon2 = Number(val(b, 'lon'));
    if (!Number.isFinite(lat2) || !Number.isFinite(lon2)) continue;
    const img = val(b, 'img');
    by.set(id, {
      id, name, description: val(b, 'itemDescription') || '', lat: lat2, lon: lon2, sitelinks: Number(val(b, 'sl')) || 0,
      natureKind: kindOf.get(qid(val(b, 't'))) || 'nature', image: img ? commonsThumb(img) : null,
      wiki: { cs: title(val(b, 'cs')), en: title(val(b, 'en')) }, heritage: false, unesco: false,
    });
  }
  return [...by.values()];
});
// Hrady, zámky, kláštery, zříceniny – stejný postup (podle typu + obdélník), rychlý (~15 s).
const HERITAGE_TYPES = [['Q23413', 'castle'], ['Q17715832', 'ruins'], ['Q57821', 'castle'], ['Q751876', 'palace'], ['Q16560', 'palace'], ['Q44613', 'monastery']];
const heritageQuery = (lat, lon) => cache.wrap(`wdqs-heritage:${lat.toFixed(1)}:${lon.toFixed(1)}`, 30 * 864e5, async () => {
  const rows = await wdqs(sparqlNature(lat, lon, 125, HERITAGE_TYPES.map((t) => t[0]), 6), 58000);
  const kindOf = new Map(HERITAGE_TYPES);
  const by = new Map();
  for (const b of rows) {
    const id = qid(val(b, 'item'));
    const name = val(b, 'itemLabel');
    const kind = kindOf.get(qid(val(b, 't')));
    if (!id || !name || /^Q\d+$/.test(name)) continue;
    const prev = by.get(id);
    // hrad i zámek zároveň (Konopiště) → zámek; zřícenina má přednost před hradem
    if (prev) { if (kind === 'ruins' || (kind === 'palace' && prev.tripKind === 'castle')) prev.tripKind = kind; continue; }
    const lat2 = Number(val(b, 'lat'));
    const lon2 = Number(val(b, 'lon'));
    if (!Number.isFinite(lat2) || !Number.isFinite(lon2)) continue;
    const img = val(b, 'img');
    by.set(id, {
      id, name, description: val(b, 'itemDescription') || '', lat: lat2, lon: lon2, sitelinks: Number(val(b, 'sl')) || 0, tripKind: kind,
      image: img ? commonsThumb(img) : null, wiki: { cs: title(val(b, 'cs')), en: title(val(b, 'en')) }, heritage: true, unesco: false,
    });
  }
  return [...by.values()];
});

/** Hrady a zámky → kandidáti (bez těch ve městě výletu – ty jsou v „uvidíš“ – a bez duplicit). */
function heritageTrips(rows, center, minKm, existing) {
  const out = [];
  for (const p of rows) {
    const distanceKm = Math.round(haversineKm(center.lat, center.lon, p.lat, p.lon) * 10) / 10;
    if (distanceKm <= minKm || distanceKm > 125) continue;
    const town = existing.find((x) => x.tripKind === 'town' && haversineKm(x.lat, x.lon, p.lat, p.lon) < 1.2);
    if (town) {
      if (!(town.highlights || []).includes(p.name) && (town.highlights || []).length < 3) town.highlights = [...(town.highlights || []), p.name];
      continue;
    }
    if ([...existing, ...out].some((x) => x.id === p.id || (x.tripKind !== 'town' && x.tripKind !== 'nature' && haversineKm(x.lat, x.lon, p.lat, p.lon) < 1))) continue;
    const score = Math.round((Math.log2(p.sitelinks + 1) * 10 + (CAT_BONUS[p.tripKind] || 3)) * 10) / 10;
    out.push({ ...p, distanceKm, category: 'daytrip', score });
  }
  return out;
}

const NATURE_BONUS = { park: 14, waterfall: 6, cave: 6, gorge: 6, rock: 6, mountain: 2, lake: 2, reserve: 0 };
const NATURE_LABEL = { park: 'Národní park', waterfall: 'Vodopád', cave: 'Jeskyně', gorge: 'Soutěska / kaňon', rock: 'Skalní útvar', mountain: 'Hora / vyhlídka', lake: 'Jezero', reserve: 'Přírodní rezervace' };

/** Přírodní cíle → kandidáti výletů (bez těch v okruhu města a duplicit s jinými cíli do 3 km). */
function natureTrips(rows, center, minKm, existing) {
  const out = [];
  for (const p of rows) {
    const distanceKm = Math.round(haversineKm(center.lat, center.lon, p.lat, p.lon) * 10) / 10;
    if (distanceKm <= minKm || distanceKm > 125) continue;
    if ([...existing, ...out].some((x) => x.id === p.id || (x.tripKind === 'nature' && haversineKm(x.lat, x.lon, p.lat, p.lon) < 3))) continue;
    const score = Math.round((Math.log2(p.sitelinks + 1) * 10 + (NATURE_BONUS[p.natureKind] || 0)) * 10) / 10;
    out.push({ ...p, distanceKm, category: 'daytrip', tripKind: 'nature', score });
  }
  return out;
}

/** Výsledek p, nebo undefined, když nedoběhne do ms (časovač se pak zruší – nedrží proces naživu). */
function within(p, ms) {
  let t;
  return Promise.race([p, new Promise((res) => { t = setTimeout(res, ms, undefined); })]).finally(() => clearTimeout(t));
}

// S článkem na Wikivoyage: město, o kterém píše cestovní průvodce, je skutečný cíl (ne vesnice nebo předměstí).
const tripsQuery = (lat, lon) => cache.wrap(`wdqs-trips:${lat.toFixed(2)}:${lon.toFixed(2)}`, 7 * 864e5, () => wdqs(sparqlNear(lat, lon, 120, 45, 300, { wv: true, lang: localLang(lat, lon) }), 58000));

// Zoo, zábavní a městské parky zvlášť: v Římě je mezi 500 nejznámějšími místy nevytlačí jen kostely a paláce
// (bioparco: 14 jazykových verzí) – bez nich nemá zájem „s dětmi“ co zvýhodnit. Vlastní mezipaměť jako výlety:
// když nestihne první zobrazení, příští načtení už ho má.
const familyQuery = (lat, lon, r) => cache.wrap(`wdqs-family:${lat.toFixed(3)}:${lon.toFixed(3)}:${r}`, 7 * 864e5, () => wdqs(sparqlNear(lat, lon, r, 4, 40, { lang: localLang(lat, lon), types: FAMILY_TYPES }), 45000, { queue: limitFamily }));

/** Článek o městě na anglické Wikivoyage: obec do `km` od bodu s článkem a nejvíc jazykovými verzemi (z řádků výletů). */
export function cityArticle(rows, center, km = 12) {
  let best = null;
  for (const b of rows || []) {
    const wv = val(b, 'wv');
    if (!wv || !SETTLEMENT.includes(qid(val(b, 'type')))) continue;
    const sl = Number(val(b, 'sl')) || 0;
    if ((best && sl <= best.sl) || haversineKm(center.lat, center.lon, Number(val(b, 'lat')), Number(val(b, 'lon'))) > km) continue;
    best = { sl, title: title(wv) };
  }
  return best?.title || null;
}

// Klasické výlety (daytrips.js CLASSICS): jeden krátký dotaz na všechny najednou, společný všem městům.
// (daytrips.js → transfers.js → bike.js → poi.js je kruh importů: jeho hodnoty se tu smějí číst až za běhu, ne při načtení.)
const classicsQuery = () => cache.wrap('wdqs-classics', 30 * 864e5, async () => {
  const ids = new Set(CLASSIC_IDS);
  return (await wdqs(sparqlItems({ ids: CLASSIC_IDS }), 30000)).filter((b) => ids.has(qid(val(b, 'item'))));
});
// Doporučené výlety: oddíl „Go next“ článku o městě na anglické Wikivoyage → položky Wikidat podle názvu článku
// (Řím → Tivoli, Cerveteri, Frascati…). Wikitext článku (action=raw – jen text, z mezipaměti Wikimedie; název je
// z Wikidat, tedy bez přesměrování) + jeden dotaz na Wikidata, mezipaměť 30 dní.
const goNextQuery = (art, lang) => cache.wrap(`wv-gonext:${art}`, 30 * 864e5, async () => {
  const qs = new URLSearchParams({ title: art, action: 'raw' });
  const text = await limitWiki(() => request(`https://en.wikivoyage.org/w/index.php?${qs}`, { headers: { 'User-Agent': UA }, retry429: true, timeoutMs: 12000, retries: 0, as: 'text' }));
  const titles = parseGoNext(text).filter((t) => t !== art).slice(0, 80);
  if (!titles.length) return { ids: [], rows: [] };
  const ok = new Set(titles);
  const rows = (await wdqs(sparqlItems({ wvTitles: titles }, { lang }), 30000)).filter((b) => ok.has(val(b, 'gn')));
  return { ids: [...new Set(rows.map((b) => qid(val(b, 'item'))))], rows };
});
/**
 * Doplňky výletů k řádkům dotazu na okolí: klasiky (classicsP – dotaz nezávisí na řádcích, volající ho může pustit
 * hned na začátku) a doporučení průvodce → { rows, goNext, failed }. Výpadek jednoho z nich nevadí (failed = výsledek
 * je neúplný, kratší mezipaměť).
 */
async function tripExtras(rows, center, classicsP = classicsQuery().catch(() => null)) {
  const art = cityArticle(rows, center);
  const [cl, gn] = await Promise.all([
    classicsP,
    art ? goNextQuery(art, localLang(center.lat, center.lon)).catch(() => null) : { ids: [], rows: [] },
  ]);
  return { rows: [...(cl || []), ...(gn?.rows || [])], goNext: gn?.ids || [], failed: !cl || !gn };
}
const NO_EXTRAS = { rows: [], goNext: [], failed: false };
// Interní příznaky výletu, které do aplikace nejdou (důvod je ve „why“)
const TRIP_INTERNAL = ['partOf', 'serial', 'wv', 'wvTitle', 'minor', 'goNext', 'classic', 'airport'];
const tripOut = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => !TRIP_INTERNAL.includes(k)));

const tripsKey = ({ lat, lon, limit = 30 }) => `trips:${lat.toFixed(2)}:${lon.toFixed(2)}:${limit}`;
/** Jsou cíle výletů (findTrips se stejnými volbami) celé v mezipaměti – odpověď bez dotazu na Wikidata? */
export const tripsCached = (opts) => cache.get(tripsKey(opts)) !== undefined;

/**
 * Cíle výletů do ~120 km (pro plánovač jednodenních a okružních výletů) – víc než 8 ve findPlaces,
 * s popisem a fotkou. Čeká na pomalý dotaz celý (max. ~1 min, pak je v mezipaměti týden).
 */
export async function findTrips({ lat, lon, limit = 30 }) {
  const key = tripsKey({ lat, lon, limit });
  // Neúplný výsledek se drží krátce: příroda/hrady se ještě načítají 1 min, nenačtené popisy 2 min, jinak (chybí
  // UNESCO, hrady nebo příroda – dotaz nestihl) 15 min.
  return cache.wrap(key, (v) => (v.natureLoading ? 60e3 : v.descFailed ? 2 * 60e3 : v.degraded ? 15 * 60e3 : 7 * 864e5), async () => {
    // Hlavní seznam a UNESCO mají přednost (fronta dotazů); hrady/zámky a příroda běží souběžně –
    // co nestihne zbytek (o 10 s), doběhne na pozadí a příští plán to už má (výsledek se drží jen minutu).
    const tripsP = tripsQuery(lat, lon);
    const unescoP = unescoQuery(lat, lon).catch(() => null);
    const heritageP = heritageQuery(lat, lon).catch(() => null);
    const natureP = natureQuery(lat, lon).catch(() => null);
    const classicsP = classicsQuery().catch(() => null);
    const [rows, unesco] = await Promise.all([tripsP, unescoP]);
    // klasiky a doporučení průvodce (krátké dotazy) souběžně s hrady a přírodou
    const [heritage, nature, extras] = await Promise.all([within(heritageP, 10000), within(natureP, 10000), within(tripExtras(rows, { lat, lon }, classicsP), 10000)]);
    const ex = extras || NO_EXTRAS;
    const center = { lat, lon };
    const main = rankTrips(tripsFromRows([...rows, ...ex.rows], center, 15, { road: true, unesco: unesco || [], goNext: ex.goNext, classic: CLASSIC_IDS }), { center, road: true }).slice(0, limit);
    // doplňkových cílů víc než hlavních by bylo moc – nejvýš 15 hradů/zámků a 15 přírodních
    const her = heritageTrips(heritage || [], center, 15, main).sort((a, b) => b.score - a.score).slice(0, 15);
    const nat = natureTrips(nature || [], center, 15, [...main, ...her]).sort((a, b) => b.score - a.score).slice(0, 15);
    for (const p of [...her, ...nat]) Object.assign(p, { reach: reachOf(center, p), why: whyOf(p) });
    const picked = [...main, ...her, ...nat];
    // Anglický název z článku (bez upřesnění v závorce: „Montserrat (mountain)“) a země – pro odkazy na partnery
    // a hledání v mapách (stejnojmenná místa jinde: Vic, La Granada); zemi bez P17 podle polohy.
    for (const p of picked) {
      p.nameEn = p.wiki?.en ? p.wiki.en.replace(/ \(.+\)$/, '') : null;
      p.cc = p.cc || countryAt(p.lat, p.lon) || '';
    }
    const descFailed = await enrich(picked);
    // lázně i podle první věty článku („… jsou krajské, statutární a lázeňské město“)
    for (const p of picked) if (p.tripKind === 'town' && !p.spa && SPA.test(String(p.extract || '').split(/\.\s/)[0])) p.spa = true;
    const out = picked.map(({ island, ...p }) => ({
      ...tripOut(p), ...(island ? { island: true } : {}),
      categoryLabel: p.natureKind ? NATURE_LABEL[p.natureKind] : p.tripKind === 'town' ? (p.spa ? 'Lázně' : 'Město / obec') : p.tripKind === 'monastery' ? 'Klášter' : CATEGORY_CS[p.tripKind] || CATEGORY_CS.daytrip,
    }));
    // degraded = neúplné cíle (kratší mezipaměť); descFailed = opravdu se nenačetly popisy z Wikipedie – jen to
    // aplikace hlásí („Část popisů se nenačetla“). Dřív hlášku spustila i příroda, která se ještě načítá (dotaz
    // trvá ~45 s, takže skoro u každého prvního plánu a minutu po něm), nebo pomalý dotaz na hrady či UNESCO.
    if (descFailed || !unesco || !nature || !heritage || !extras || extras.failed) out.degraded = true;
    if (descFailed) out.descFailed = true;
    if (nature === undefined || heritage === undefined) out.natureLoading = true;
    return out;
  });
}

/**
 * Města do ~120 km – kandidáti na další místo pobytu (trasa přes víc míst). Stejné dotazy
 * a mezipaměť jako výlety (hlavní seznam + UNESCO), bez pomalých dotazů na hrady a přírodu
 * a bez popisů z Wikipedie (trasa ukazuje jen, co ve městě je) – méně dotazů na Wikimedii.
 */
export async function findTowns({ lat, lon, limit = 25 }) {
  const key = `towns:${lat.toFixed(2)}:${lon.toFixed(2)}:${limit}`;
  return cache.wrap(key, (v) => (v.degraded ? 15 * 60e3 : 7 * 864e5), async () => {
    const [rows, unesco] = await Promise.all([tripsQuery(lat, lon), unescoQuery(lat, lon).catch(() => null)]);
    // I města hned u bodu hledání (bod mezi letišti může ležet u města, které je z okolních bodů
    // dál než okruh dotazu); blízko města příletu/odletu je vyřadí až návrh trasy.
    const out = tripsFromRows(rows, { lat, lon }, 0, { road: true, unesco: unesco || [] })
      .filter((t) => t.tripKind === 'town')
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ partOf, island, serial, wiki, wv, wvTitle, minor, goNext, classic, airport, ...p }) => ({
        // anglický název z článku Wikipedie („Bologna“, „Santa Maria (Rio Grande do Sul)“ → „Santa Maria, Rio Grande do Sul“)
        // pro odkazy na partnery ubytování, které český název („Boloňa“) nepoznají; země z Wikidat (P17),
        // jinak podle polohy (nejbližší letiště)
        ...p, nameEn: wiki.en ? wiki.en.replace(/ \((.+)\)$/, ', $1') : null, ...countryOf(p), categoryLabel: p.spa ? 'Lázně' : 'Město / obec',
        url: wiki.cs ? `https://cs.wikipedia.org/wiki/${encodeURIComponent(wiki.cs.replace(/ /g, '_'))}` : wiki.en ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.en.replace(/ /g, '_'))}` : `https://www.wikidata.org/wiki/${p.id}`,
      }));
    if (!unesco) out.degraded = true; // bez UNESCO jsou skóre měst slabší – zkusit znovu za 15 min
    return out;
  });
}

/** { cc, country } místa: kód země z Wikidat, jinak podle polohy; český název země. */
function countryOf(p) {
  const cc = p.cc || countryAt(p.lat, p.lon);
  return { cc, country: (cc && COUNTRY_BY_ISO.get(cc)?.cs) || '' };
}

// DEMO: vymyšlené názvy měst (deterministicky podle polohy, ať se okolí různých bodů liší).
const DEMO_TOWNS = ['Ukázkov', 'Vzorovice', 'Příkladov', 'Testín', 'Pokusná Lhota', 'Náhledov', 'Šablonov', 'Modelín', 'Makétov', 'Zkušebná', 'Prototypy', 'Nanečisto'];
const DEMO_SUFFIX = ['nad Řekou', 'u Lesa', 'pod Horou', 'na Pláni', 'v Údolí', 'u Jezera', 'na Kopci', 'u Moře'];

/** DEMO režim: vymyšlená města 30–200 km od bodu (kandidáti na místa pobytu). */
export function mockTowns({ lat, lon }) {
  const off = Math.abs(Math.round(lat * 7 + lon * 13));
  return Array.from({ length: 10 }, (_, i) => {
    const a = ((i * 137.5 + off * 31) * Math.PI) / 180;
    const d = 0.3 + (i % 5) * 0.25;
    const p = {
      id: `demoTown:${lat.toFixed(2)},${lon.toFixed(2)}:${i}`, name: `${DEMO_TOWNS[(i + off) % DEMO_TOWNS.length]} ${DEMO_SUFFIX[off % DEMO_SUFFIX.length]}`, description: 'demo data',
      lat: lat + Math.sin(a) * d, lon: lon + Math.cos(a) * d * 1.4, sitelinks: 160 - i * 11, unesco: i === 1, heritage: i % 2 === 0,
      category: 'daytrip', tripKind: 'town', sights: 4 - (i % 4), highlights: ['Ukázková katedrála', 'Ukázkový hrad', 'Staré náměstí'].slice(0, 3 - (i % 3)),
      extract: 'Vymyšlené město pro ukázku aplikace (DEMO režim).', url: null, image: null, categoryLabel: 'Město / obec',
    };
    p.distanceKm = Math.round(haversineKm(lat, lon, p.lat, p.lon));
    p.score = Math.round(scorePlace({ ...p, category: 'town', distanceKm: 0 }) + p.sights * 6);
    return Object.assign(p, countryOf(p));
  }).sort((a, b) => b.score - a.score);
}

const FAMILY = ['zoo', 'theme', 'park'];
const FAMILY_TYPES = FAMILY.flatMap((c) => TYPES[c]);
/**
 * Nejlepší místa (seřazená podle skóre) do `limit`, ale s místem pro rodiny: z každé kategorie zoo, zábavní park a park
 * aspoň `per` (je-li v okolí), místo nejslabších jiných míst – Řím má jinak 60 kostelů, muzeí a zřícenin a nic pro děti.
 */
export function familySlots(sorted, limit, per = 2) {
  const out = sorted.slice(0, limit);
  const add = FAMILY.flatMap((c) => sorted.slice(limit).filter((p) => p.category === c && !p.minor).slice(0, Math.max(0, per - out.filter((p) => p.category === c).length)));
  for (const p of add) {
    const i = out.findLastIndex((x) => !FAMILY.includes(x.category));
    if (i < 0) break;
    out.splice(i, 1);
    out.push(p);
  }
  return out.sort((a, b) => b.score - a.score);
}
/**
 * Pestrý seznam: z jedné kategorie nejvýš `share` limitu (Řím: 15 kostelů, 10 muzeí a 10 nalezišť vytlačilo Španělské
 * schody i Piazza di Spagna). Přebytek se nevyhodí – jde na konec pořadí, takže doplní seznam, když jiných míst není
 * dost (hory: samé vrcholy). Jinak pořadí podle skóre beze změny.
 */
export function spreadCats(sorted, limit, share = 0.2) {
  const cap = Math.max(6, Math.round(limit * share));
  const seen = {};
  const keep = [];
  const later = [];
  for (const p of sorted) {
    seen[p.category] = (seen[p.category] || 0) + 1;
    (seen[p.category] > cap ? later : keep).push(p);
  }
  return [...keep, ...later];
}
const placesKey = ({ lat, lon, radiusKm = 10, dayTrips = true, limit = 60 }) => `poi:${lat.toFixed(3)}:${lon.toFixed(3)}:${Math.min(25, Math.max(1, radiusKm))}:${dayTrips}:${limit}`;
/** Je výsledek findPlaces se stejnými volbami celý v mezipaměti – odpověď bez dotazu na Wikidata a Wikipedii? */
export const placesCached = (opts) => cache.get(placesKey(opts)) !== undefined;

/**
 * Místa k návštěvě kolem bodu.
 * opts: { lat, lon, radiusKm (město, max 25), dayTrips (true = i výlety do 120 km), limit }
 */
export async function findPlaces({ lat, lon, radiusKm = 10, dayTrips = true, limit = 60 }) {
  const r = Math.min(25, Math.max(1, radiusKm));
  const key = placesKey({ lat, lon, radiusKm: r, dayTrips, limit });
  // Úplný výsledek platí týden; neúplný (záloha přes Wikipedii, bez výletů, bez popisů) jen 15 min.
  return cache.wrap(key, (v) => (v.degraded ? 15 * 60e3 : 7 * 864e5), async () => {
    const center = { lat, lon };
    const t0 = Date.now();
    // Doporučení z Wikivoyage běží souběžně a jejich výpadek nic nerozbije.
    let wvFailed = false;
    const wvP = wikivoyageListings(lat, lon).catch(() => { wvFailed = true; return []; });
    // Výlety (okruh 120 km) jsou pomalejší dotaz: běží na pozadí a výsledek se uloží zvlášť, takže
    // když nestihne první zobrazení, příští načtení už ho má.
    const tripsP = dayTrips ? tripsQuery(lat, lon).catch(() => null) : Promise.resolve([]);
    // památky UNESCO k městům výletů (Sintra, Toledo – Wikidata je dávají památce, ne městu); krátký dotaz, 30 dní
    const unescoP = dayTrips ? unescoQuery(lat, lon).catch(() => null) : Promise.resolve([]);
    // klasické výlety (jeden dotaz pro všechna města, 30 dní) hned, ne až za dotazem na okolí
    const classicsP = dayTrips ? classicsQuery().catch(() => null) : null;
    const cityP = wdqs(sparqlNear(lat, lon, r, 4, 500, { lang: localLang(lat, lon) }));
    // zoo a parky (familyQuery) – vlastní fronta, běží souběžně s městem
    const familyP = familyQuery(lat, lon, r).catch(() => null);
    let cityRows;
    try {
      cityRows = await cityP;
    } catch {
      // Wikidata SPARQL nedostupné (výpadek, limit, přechod na QLever) → záloha přes Wikipedii.
      const fb = applyWikivoyage(await findPlacesViaWikipedia({ lat, lon }), await wvP).sort((a, b) => b.score - a.score);
      const picked = fb.slice(0, limit);
      await enrich(picked, { preferCs: true });
      const out = picked.map((p) => ({ ...p, categoryLabel: catLabel(p) || p.category }));
      out.degraded = true;
      return out;
    }
    const waitTrips = Math.max(2000, 20000 - (Date.now() - t0));
    let tripRows = await within(tripsP, waitTrips);
    const tripsMissing = tripRows == null; // nestihlo se nebo selhalo
    if (tripsMissing) tripRows = [];
    // klasiky a doporučení průvodce pro výlety (článek o městě z řádků výletů) – krátké dotazy, nejvýš do ~22 s od začátku
    const extrasP = tripRows.length ? tripExtras(tripRows, center, classicsP) : Promise.resolve(NO_EXTRAS);
    const left = Math.max(1500, 22000 - (Date.now() - t0));
    const [unesco, extras] = await Promise.all([within(unescoP, left), within(extrasP, left)]);
    const extrasMissing = dayTrips && !tripsMissing && (unesco == null || extras == null || extras.failed);
    // Obce a předměstí (italské comuni, francouzské communes…) nejsou „místa k vidění“ – ve městě
    // zůstanou jen s výrazným znakem (UNESCO); samotné město v centru se vyřadí vždy.
    // zoo a parky (živě 6–10 s, město ~4 s): počkat do 12 s od začátku, nejméně 1,5 s po městě a výletech – co
    // nestihne nebo selže, přijde při dalším načtení (neúplný seznam má mezipaměť jen 15 min)
    const familyRows = await within(familyP, Math.max(1500, 12000 - (Date.now() - t0)));
    const familyMissing = familyRows == null;
    const city = groupBindings([...cityRows, ...(familyRows || [])], center).filter((p) => p.category !== 'town' || (p.unesco && p.distanceKm > 2));
    for (const p of city) if (p.category === 'town') p.category = 'oldtown';
    for (const p of city) p.score = scorePlace(p);
    applyWikivoyage(city, await wvP);
    const top = familySlots(spreadCats(city.sort((a, b) => b.score - a.score), limit), limit);
    // Části jiného vybraného místa (Sixtinská kaple ve Vatikánských muzeích, katedrála na Hradě)
    // nejsou samostatná zastávka – připiš je k celku.
    const byId = new Map(top.map((p) => [p.id, p]));
    const merged = top.filter((p) => {
      const whole = (p.partOf || []).map((id) => byId.get(id)).find((w) => w && w !== p);
      if (!whole) return true;
      (whole.includes = whole.includes || []).push(p.name);
      return false;
    });
    // Výlety: význam a dosah (daytrips.js) – bez toho, co už je v programu ve městě (cover). Doporučené a klasické
    // i blíž než 15 km, když v seznamu míst ve městě nejsou (Wieliczka 12 km od Krakova, Burano v benátské laguně).
    const ex = extras || NO_EXTRAS;
    const trips = rankTrips(tripsFromRows([...tripRows, ...ex.rows], center, Math.max(r, 15), {
      unesco: unesco || [], goNext: ex.goNext, classic: CLASSIC_IDS, nearKm: 3, cover: new Set(merged.map((p) => p.id)),
    }), { center });
    const picked = [...merged, ...trips.slice(0, 8)];
    const enrichFailed = await enrich(picked, { preferCs: true });
    // island zůstane: na ostrov (Lokrum u Dubrovníku) se v programu jede lodí, ne jde pěšky
    const out = picked.map(({ island, ...p }) => ({ ...tripOut(p), ...(island ? { island: true } : {}), categoryLabel: p.eatery ? 'Kavárna / restaurace' : catLabel(p) || p.category }));
    if (tripsMissing || familyMissing || enrichFailed || wvFailed || extrasMissing) out.degraded = true;
    return out;
  });
}

/* ---------- 🌍 Celá země (Objevuj): to nejlepší v zemi ---------- */
// Města a „další cíle“ z článku o zemi na anglické Wikivoyage (redaktoři vybírají kolem 9 + 9 nejlepších – Řím, Benátky,
// Cinque Terre, Amalfinské pobřeží), k nim památky UNESCO a národní parky z Wikidat: jeden krátký dotaz (~2–4 s; dotazy
// na všechna města nebo hory země trvají přes minutu), popisy z Wikipedie. Země se nemění – mezipaměť 30 dní.
export const COUNTRY_KINDS = ['city', 'dest', 'unesco', 'park'];
// článek Wikivoyage, kde se anglický název země liší
const WV_COUNTRY = { CZ: 'Czech Republic', US: 'United States of America', GB: 'United Kingdom', KR: 'South Korea', KP: 'North Korea', CD: 'Democratic Republic of the Congo', CG: 'Republic of the Congo', MK: 'North Macedonia', VA: 'Vatican City', TL: 'East Timor', CI: 'Ivory Coast', CV: 'Cape Verde', MM: 'Myanmar', GE: 'Georgia (country)', GM: 'The Gambia', BS: 'Bahamas' };
// pole šablony {{marker|name=…|wikidata=…}}: hodnota končí svislítkem mimo odkaz [[…|…]] a šablonu {{…}}
const tplField = (body, k) => (body.match(new RegExp(`(?:^|\\|)\\s*${k}\\s*=\\s*((?:\\[\\[[^\\]]*\\]\\]|\\{\\{[^}]*\\}\\}|[^|])*)`, 'i'))?.[1] || '').trim();
// wikitext → prostý text (odkazy jejich textem, {{UNESCO}} slovem, ostatní šablony a formátování pryč)
const wvPlain = (s) => String(s || '').replace(/\{\{\s*UNESCO\s*\}\}/gi, 'UNESCO').replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:[^\s\]]+\s*([^\]]*)\]/g, '$1').replace(/'{2,}/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Řádek seznamu „* {{marker|type=city|name=[[Lisbon]]|wikidata=Q597}} – popis“ nebo „* [[Lisbon]] – popis“ → cíl. */
export function destLine(line) {
  const mk = /\{\{\s*marker\s*\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/i.exec(line);
  const src = mk ? tplField(mk[1], 'name') : line;
  const ln = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/.exec(src);
  const raw = ln ? ln[1] : mk ? wvPlain(src) : '';
  const label = wvPlain(ln ? ln[2] || ln[1].split('#')[0] : raw);
  if (!label) return null;
  const wd = mk ? tplField(mk[1], 'wikidata') : '';
  const lat = mk ? Number(tplField(mk[1], 'lat')) : NaN;
  const lon = mk ? Number(tplField(mk[1], 'long')) : NaN;
  // popis za šablonou nebo odkazem: bez místního názvu v závorce na začátku a bez pomlčky
  const after = mk ? line.slice(mk.index + mk[0].length) : ln ? line.slice(line.indexOf(ln[0]) + ln[0].length) : '';
  const blurb = wvPlain(after).replace(/^\([^)]*\)\s*/, '').replace(/^[\s–—:,-]+/, '').slice(0, 220);
  return {
    title: raw.split('#')[0].trim(), label, wikidata: /^Q\d+$/.test(wd) ? wd : null,
    ...(mk && tplField(mk[1], 'lat') && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : {}),
    blurb,
  };
}

/** Wikitext článku o zemi → { city, dest }: položky seznamů v sekcích „Cities“ a „Other destinations“. */
export function parseDestinations(wikitext) {
  const text = String(wikitext || '');
  const sec = (name) => {
    const m = new RegExp(`^==\\s*${name}\\s*==\\s*$`, 'mi').exec(text);
    if (!m) return '';
    const rest = text.slice(m.index + m[0].length);
    const end = /^==[^=]/m.exec(rest);
    return end ? rest.slice(0, end.index) : rest;
  };
  const list = (name) => sec(name).split('\n').filter((l) => /^\*[^*]/.test(l)).map(destLine).filter(Boolean).slice(0, 15);
  return { city: list('Cities'), dest: list('Other destinations') };
}

/** Města a další cíle země z Wikivoyage; položkám bez wikidata= doplní QID z článku Wikivoyage (pageprops). */
async function wikivoyageCountry(cc) {
  const name = WV_COUNTRY[cc] || COUNTRY_BY_ISO.get(cc)?.en;
  if (!name) return { city: [], dest: [] };
  const get = (params) => limitWiki(() => request(`https://en.wikivoyage.org/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', ...params })}`,
    { headers: { 'User-Agent': UA }, retry429: true, timeoutMs: 15000, retries: 1 }));
  const j = await get({ prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: name });
  const pg = j.query?.pages?.[0];
  const d = parseDestinations(pg?.revisions?.[0]?.slots?.main?.content);
  const need = [...new Set([...d.city, ...d.dest].filter((x) => !x.wikidata && x.title).map((x) => x.title))].slice(0, 50);
  if (need.length) {
    const k = await get({ prop: 'pageprops', ppprop: 'wikibase_item', titles: need.join('|') }).catch(() => null);
    const fin = new Map(need.map((t) => [t, t]));
    for (const step of [k?.query?.normalized || [], k?.query?.redirects || []]) for (const { from, to } of step) for (const [a, b] of fin) if (b === from) fin.set(a, to);
    const qidOf = new Map((k?.query?.pages || []).map((p) => [p.title, p.pageprops?.wikibase_item]));
    for (const x of [...d.city, ...d.dest]) if (!x.wikidata && qidOf.get(fin.get(x.title))) x.wikidata = qidOf.get(fin.get(x.title));
  }
  return d;
}

/** QID země podle kódu ISO (Q38 = Itálie) – krátký dotaz; přímé QID je v dalším dotazu mnohem rychlejší než P297. */
export const sparqlCountryId = (cc) => `SELECT ?c ?sl WHERE { ?c wdt:P297 "${String(cc).replace(/[^A-Z]/g, '')}" ; wikibase:sitelinks ?sl . } ORDER BY DESC(?sl) LIMIT 1`;

/**
 * Nejznámější památky UNESCO jen této země (ne společné s jinými – bukové pralesy Evropy) nebo národní parky: jen QID
 * a jazykové verze. Krátké dotazy po sobě (~1–3 s) – spojené do jednoho s polohou a názvy trvaly přes minutu; města
 * jsou jen z Wikivoyage (dotaz na města země podle typu trvá podle vytížení Wikidat 2–35 s).
 */
export function sparqlCountryList(countryQid, kind) {
  const C = `wd:${String(countryQid).replace(/[^Q0-9]/g, '')}`;
  if (kind === 'unesco') return `SELECT DISTINCT ?item ?sl WHERE { ?item wdt:P1435 wd:${UNESCO} ; wdt:P17 ${C} ; wikibase:sitelinks ?sl . FILTER NOT EXISTS { ?item wdt:P17 ?o . FILTER(?o != ${C}) } } ORDER BY DESC(?sl) LIMIT 30`;
  if (kind === 'park') return `SELECT DISTINCT ?item ?sl WHERE { ?item wdt:P31/wdt:P279? wd:Q46169 ; wdt:P17 ${C} ; wikibase:sitelinks ?sl . } ORDER BY DESC(?sl) LIMIT 15`;
  // záloha, když Wikivoyage měst nedá: velkoměsta a hlavní město podle jazykových verzí
  return `SELECT DISTINCT ?item ?sl WHERE { VALUES ?t { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q5119 } ?item wdt:P31 ?t ; wdt:P17 ${C} ; wikibase:sitelinks ?sl . FILTER(?sl >= 40) } ORDER BY DESC(?sl) LIMIT 12`;
}

/** Poloha, fotka, články a česká jména pro QID (cíle Wikivoyage, UNESCO, parky) – jeden krátký dotaz. */
export function sparqlCountry(ids) {
  return `SELECT ?item ?sl ?lat ?lon ?img ?cs ?en ?csd ?csl ?t ?itemLabel ?itemDescription WHERE {
  VALUES ?item { ${ids.map((q) => `wd:${q}`).join(' ')} }
  ?item wikibase:sitelinks ?sl ; wdt:P625 ?c . BIND(geof:latitude(?c) AS ?lat) BIND(geof:longitude(?c) AS ?lon)
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?cs schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?item schema:description ?csd FILTER(lang(?csd) = "cs") }
  OPTIONAL { ?item rdfs:label ?csl FILTER(lang(?csl) = "cs") }
  OPTIONAL { ?item wdt:P31/wdt:P279? ?t }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en". }
}`;
}

/* ---------- 🌍 „Co hledáš?“: kategorie v přehledu země ---------- */
// Třídy Wikidat (P31) pro každou kategorii. Seznam bere vyhledávání Wikidat (CirrusSearch přes mwapi: haswbstatement
// země a typu, podle odkazů) – přímý dotaz „všechny hory Itálie“ (P31 + P17) trvá přes minutu, tohle 1–15 s. Cíle
// Wikivoyage se zařadí podle P31 i o úroveň výš (P279: ledovcové jezero → jezero, „ostrov Španělska“ → ostrov).
export const COUNTRY_CATS = {
  mountain: ['Q8502', 'Q46831', 'Q8072', 'Q1061151'], // hora, pohoří, sopka, masiv
  beach: ['Q40080', 'Q39594', 'Q185113', 'Q93352', 'Q45776'], // pláž, zátoka, mys, pobřeží, fjord
  island: ['Q23442', 'Q33837', 'Q1161185'], // ostrov, souostroví, sopečný ostrov
  lake: ['Q23397', 'Q211302', 'Q34038'], // jezero, ledovcové jezero (Comské), vodopád
  castle: ['Q23413', 'Q751876', 'Q53536964', 'Q1785071'], // hrad, zámek, královský palác, pevnost (ne „palác“ – to jsou i Uffizi a úřady)
  sight: ['Q35509', 'Q150784', 'Q1266922', 'Q23790', 'Q6017969', 'Q570116', 'Q2319498'], // jeskyně, kaňon, průlomové údolí (Verdon), přírodní památka, vyhlídka, turistická atrakce, dominanta
};
// příroda (čip „Příroda a národní parky“): hory, pobřeží, ostrovy, vody + jeskyně, kaňony, přírodní památky, národní
// park, chráněné území, rezervace, údolí, řeka, les, mokřad, laguna, přírodní oblast (Camargue, údolí Loiry)
const NATURE = new Set([...COUNTRY_CATS.mountain, ...COUNTRY_CATS.beach, ...COUNTRY_CATS.island, ...COUNTRY_CATS.lake,
  'Q35509', 'Q150784', 'Q1266922', 'Q23790', 'Q46169', 'Q473972', 'Q179049', 'Q39816', 'Q4022', 'Q4421', 'Q170321', 'Q187223', 'Q1970725', 'Q572995']);
/** Kategorie („mountain“…) a příroda podle tříd P31 položky. */
export function catsOf(types) {
  const t = types instanceof Set ? types : new Set(types || []);
  return { cats: Object.keys(COUNTRY_CATS).filter((c) => COUNTRY_CATS[c].some((q) => t.has(q))), nature: [...t].some((q) => NATURE.has(q)) };
}
/**
 * Nejznámější místa kategorie cat v zemi (QID země): vyhledávání Wikidat, seřazené podle jazykových verzí, nejvýš 24.
 * again = opakovaný dotaz jinak napsaný (WDQS drží odpověď na stejný dotaz chvíli v mezipaměti, i prázdnou).
 */
export function sparqlCountryCat(countryQid, cat, again = false) {
  const C = String(countryQid).replace(/[^Q0-9]/g, '');
  const types = Object.hasOwn(COUNTRY_CATS, cat) ? COUNTRY_CATS[cat] : null;
  if (!types) throw new Error(`Neznámá kategorie ${cat}`);
  const search = `haswbstatement:P17=${C} haswbstatement:${types.map((q) => `P31=${q}`).join('|')}`;
  return `SELECT ?item ?sl WHERE {
  SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "Search"; mwapi:srsearch "${search}"; mwapi:srsort "incoming_links_desc"; mwapi:srlimit "40". ?item wikibase:apiOutputItem mwapi:title. }
  ?item wikibase:sitelinks ?sl .
} ORDER BY DESC(?sl) LIMIT 24${again ? '\n# znovu' : ''}`;
}

// název česky: český štítek Wikidat, jinak název českého článku (bez upřesnění v závorce), jinak štítek (anglicky);
// známé cíle bez českého štítku i článku ručně (údolí Loiry má česky jen zámky a vinařskou oblast)
const CS_NAMES = { Q1050483: 'Údolí Loiry' };
const csName = (label, csl, csTitle) => {
  const n = csl || (csTitle ? csTitle.replace(/\s*\([^)]*\)$/, '') : '') || (label && !/^Q\d+$/.test(label) ? label : '');
  return n.charAt(0).toUpperCase() + n.slice(1); // „zámek Kroměříž“ → „Zámek Kroměříž“
};
/** Řádky sparqlCountry → Map(QID → místo { id, name, description, lat, lon, sitelinks, kinds, types, image, wiki }). */
export function countryById(rows) {
  const by = new Map();
  for (const b of rows) {
    const id = qid(val(b, 'item'));
    const lat = Number(val(b, 'lat'));
    const lon = Number(val(b, 'lon'));
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    let p = by.get(id);
    if (!p) {
      const img = val(b, 'img');
      const wiki = { cs: title(val(b, 'cs')), en: title(val(b, 'en')) };
      p = {
        id, name: CS_NAMES[id] || csName(val(b, 'itemLabel'), val(b, 'csl'), wiki.cs), description: val(b, 'csd') || val(b, 'itemDescription') || '', descLang: val(b, 'csd') ? 'cs' : 'en',
        lat, lon, sitelinks: Number(val(b, 'sl')) || 0, kinds: new Set(), types: new Set(), image: img ? commonsThumb(img) : null, wiki,
      };
      by.set(id, p);
    }
    const t = qid(val(b, 't'));
    if (t) p.types.add(t);
  }
  return by;
}

const COUNTRY_MAX = { city: 12, dest: 12, unesco: 20, park: 12 };
/**
 * Řádky dotazu (sparqlCountry) + cíle Wikivoyage + QID památek UNESCO a parků (lists) → { city, dest, unesco, park }
 * bez opakování (město z Wikivoyage se mezi UNESCO neukáže znovu).
 */
export function countryGroups(rows, wv = { city: [], dest: [] }, lists = {}) {
  const by = countryById(rows);
  for (const k of ['unesco', 'park', 'city']) for (const id of lists[k] || []) by.get(id)?.kinds.add(k);
  const out = { city: [], dest: [], unesco: [], park: [] };
  const used = new Set();
  const take = (group, x, extra = {}) => {
    if (!x || used.has(x.id) || out[group].length >= COUNTRY_MAX[group]) return;
    used.add(x.id);
    out[group].push({ ...x, kinds: new Set(x.kinds), types: new Set(x.types), ...extra });
  };
  // Wikivoyage v pořadí redaktorů; bez QID nebo polohy na Wikidatech poloha ze šablony
  for (const g of ['city', 'dest']) {
    for (const d of wv[g] || []) {
      const p = d.wikidata && by.get(d.wikidata);
      if (p) take(g, p, { name: p.name || d.label, blurb: d.blurb, wv: true });
      else if (Number.isFinite(d.lat)) take(g, { id: d.wikidata || `wv:${d.title || d.label}`, name: d.label, description: '', descLang: 'en', lat: d.lat, lon: d.lon, sitelinks: 0, kinds: new Set(), types: new Set(), image: null, wiki: { cs: null, en: null } }, { blurb: d.blurb, wv: true });
    }
  }
  const rank = (k) => [...by.values()].filter((p) => p.kinds.has(k) && p.name).sort((a, b) => b.sitelinks - a.sitelinks);
  // města z Wikidat jen, když Wikivoyage (nedostupná, článek bez seznamu) dala méně než 3
  if (out.city.length < 3) for (const p of rank('city')) take('city', p);
  // památka UNESCO do 2 km od už vybraného místa se neopakuje – tentýž klášter pod dvěma položkami Wikidat (Jerónimos),
  // historické centrum města ze seznamu nebo jeho část (budova v Portu): město dostane štítek UNESCO (u Portugalska
  // 20 položek, z nich 10 opakování). Do 10 km od cíle, který je sám UNESCO (oblast – údolí Côa), jsou to jeho části
  // (jednotlivá naleziště skalních rytin 3–5 km od něj; nejbližší samostatná památka u takového cíle je 84 km).
  const near = (p) => Number.isFinite(p.lat) && COUNTRY_KINDS.flatMap((g) => out[g]).find((q) => Number.isFinite(q.lat)
    && haversineKm(p.lat, p.lon, q.lat, q.lon) < (q.kinds.has('unesco') && out.dest.includes(q) ? 10 : 2));
  for (const p of rank('unesco')) {
    const q = !used.has(p.id) && near(p);
    if (q) q.kinds.add('unesco'); else take('unesco', p);
  }
  for (const p of rank('park')) take('park', p);
  for (const g of COUNTRY_KINDS) {
    for (const p of out[g]) {
      p.unesco = p.kinds.has('unesco');
      Object.assign(p, catsOf(p.types));
      delete p.kinds;
      delete p.types;
    }
  }
  return out;
}

const countryKey = (cc) => `country:${cc}`;
/** Je přehled země v mezipaměti – odpověď bez dotazů na Wikivoyage, Wikidata a Wikipedii? */
export const countryCached = (cc) => cache.get(countryKey(cc)) !== undefined;

/**
 * To nejlepší v zemi cc (ISO 3166-1 alpha-2): { city, dest, unesco, park } – položky { id, name, description, lat, lon,
 * image, url, extract, unesco, blurb }. Dotaz na Wikidata frontou zoo a parků (Wikidata snesou 5 dotazů naráz
 * z jedné IP – fronty Objevuj, zoo a ubytování je vyčerpají). Neúplné (Wikivoyage, popisy) jen na hodinu.
 */
export async function countryHighlights(cc) {
  return cache.wrap(countryKey(cc), (v) => (v.degraded ? 36e5 : 30 * 864e5), async () => {
    let wvFailed = false;
    const wv = await wikivoyageCountry(cc).catch(() => { wvFailed = true; return { city: [], dest: [] }; });
    const q = (s, ms = 25000) => wdqs(s, ms, { queue: limitFamily });
    const cq = await countryQid(cc);
    const lists = {};
    const list = async (k) => (await q(sparqlCountryList(cq, k))).map((b) => qid(val(b, 'item'))).filter(Boolean);
    for (const k of ['unesco', 'park']) lists[k] = await list(k);
    // Wikivoyage bez měst (výpadek, krátký článek): velkoměsta z Wikidat – ten dotaz bývá pomalejší, jen když je potřeba
    if (wv.city.length < 3) lists.city = await list('city').catch(() => []);
    const ids = [...new Set([...[...wv.city, ...wv.dest].map((d) => d.wikidata).filter(Boolean).slice(0, 40), ...lists.unesco, ...lists.park, ...(lists.city || [])])];
    const rows = ids.length ? await q(sparqlCountry(ids)) : [];
    const groups = countryGroups(rows, wv, lists);
    const here = inCountry(cc);
    for (const g of COUNTRY_KINDS) groups[g] = groups[g].filter(here);
    const all = COUNTRY_KINDS.flatMap((g) => groups[g]);
    const enrichFailed = await enrich(all, { preferCs: true });
    const out = Object.fromEntries(COUNTRY_KINDS.map((g) => [g, groups[g].map(({ wiki, ...p }) => p)]));
    if (wvFailed || enrichFailed) out.degraded = true;
    return out;
  });
}

/** QID země podle kódu ISO (mezipaměť 90 dní – nemění se). */
async function countryQid(cc) {
  return cache.wrap(`country-qid:${cc}`, 90 * 864e5, async () => {
    const cq = qid(val((await wdqs(sparqlCountryId(cc), 15000, { queue: limitFamily }))[0] || {}, 'c'));
    if (!/^Q\d+$/.test(cq)) throw new Error(`Země ${cc} není na Wikidatech`);
    return cq;
  });
}

/**
 * Leží bod v zemi cc? Hrubě: v obdélníku letišť země (i malých) s okrajem – Wikidata mívají u položky chybnou zemi
 * (pláž na švédském Ölandu „v Česku“). Země bez letišť v tabulce (Andorra, Vatikán…) bez kontroly.
 */
export function inCountry(cc) {
  const ap = airportsInCountry(cc, { includeSmall: true }).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
  if (ap.length < 2) return () => true;
  const lat = ap.map((a) => a.lat), lon = ap.map((a) => a.lon);
  const [la0, la1, lo0, lo1] = [Math.min(...lat), Math.max(...lat), Math.min(...lon), Math.max(...lon)];
  const mLa = Math.max(1, (la1 - la0) * 0.25), mLo = Math.max(1.2, (lo1 - lo0) * 0.25);
  return (p) => !(Number.isFinite(p.lat) && Number.isFinite(p.lon)) || (p.lat >= la0 - mLa && p.lat <= la1 + mLa && p.lon >= lo0 - mLo && p.lon <= lo1 + mLo);
}

const countryCatKey = (cc, cat) => `country:${cc}:${cat}`;
/** Je kategorie země v mezipaměti? */
export const countryCatCached = (cc, cat) => cache.get(countryCatKey(cc, cat)) !== undefined;

/**
 * „Co hledáš?“ v přehledu země: nejznámější hory, pláže, ostrovy, jezera, hrady nebo zajímavá místa země cc –
 * { items: [{ id, name, description, lat, lon, image, url, extract, cats, nature }] } podle jazykových verzí, nejvýš 20.
 * Načítá se až po výběru kategorie; stejná fronta Wikidat jako přehled země, mezipaměť 30 dní (bez popisů hodinu).
 * deps.query = dotaz na Wikidata (testy).
 */
export async function countryCategory(cc, cat, { query } = {}) {
  if (!Object.hasOwn(COUNTRY_CATS, cat)) throw new Error(`Neznámá kategorie ${cat}`);
  return cache.wrap(countryCatKey(cc, cat), (v) => (v.degraded ? 36e5 : 30 * 864e5), async () => {
    const q = query || ((s, ms = 30000) => wdqs(s, ms, { queue: limitFamily }));
    const cq = query ? qid(val((await q(sparqlCountryId(cc)))[0] || {}, 'c')) : await countryQid(cc);
    const search = async (again) => (await q(sparqlCountryCat(cq, cat, again))).map((b) => qid(val(b, 'item'))).filter((x) => /^Q\d+$/.test(x));
    // prázdné vyhledávání bývá i výpadek vyhledávání Wikidat (0 výsledků bez chyby) – jednou znovu
    let ids = await search(false);
    if (!ids.length) ids = await search(true);
    const rows = ids.length ? await q(sparqlCountry([...new Set(ids)])) : [];
    const items = [...countryById(rows).values()].filter((p) => p.name).filter(inCountry(cc)).sort((a, b) => b.sitelinks - a.sitelinks).slice(0, 20);
    const failed = query ? false : await enrich(items, { preferCs: true });
    const out = {
      items: items.map(({ wiki, kinds, types, ...p }) => {
        const c = catsOf(types);
        return { ...p, ...c, cats: [...new Set([cat, ...c.cats])] };
      }),
    };
    if (failed || !ids.length) out.degraded = true; // bez popisů nebo pořád prázdné – jen na hodinu
    return out;
  });
}

/** Položky se vzdáleností od místa (lat, lon) – bez polohy beze změny. */
export const withDistance = (items, lat, lon) => (Number.isFinite(lat) && Number.isFinite(lon) ? items.map((p) => ({ ...p, distanceKm: Math.round(haversineKm(lat, lon, p.lat, p.lon)) })) : items.map((p) => ({ ...p })));

/** Přehled země se vzdáleností od místa (lat, lon) – každá položka s distanceKm, pořadí skupin zůstane. */
export function countryWithDistance(groups, lat, lon) {
  const ok = Number.isFinite(lat) && Number.isFinite(lon);
  return Object.fromEntries(COUNTRY_KINDS.map((g) => [g, (groups[g] || []).map((p) => (ok ? { ...p, distanceKm: Math.round(haversineKm(lat, lon, p.lat, p.lon)) } : { ...p }))]));
}

/** DEMO režim: vymyšlená místa kategorie (hory, pláže…) kolem bodu. */
export function mockCountryCat({ lat, lon }, cat) {
  const names = {
    mountain: ['Ukázková hora', 'Vzorové pohoří', 'Příkladná sopka'], beach: ['Ukázková pláž', 'Vzorová zátoka', 'Příkladný mys'], island: ['Ukázkový ostrov', 'Vzorové souostroví'],
    lake: ['Ukázkové jezero', 'Vzorový vodopád', 'Příkladné horské jezero'], castle: ['Ukázkový hrad', 'Vzorový zámek', 'Příkladný palác', 'Testovací pevnost'],
    sight: ['Ukázková jeskyně', 'Vzorový kaňon', 'Příkladná vyhlídka'],
  }[cat] || [];
  return {
    items: names.map((name, i) => {
      const a = ((i * 97 + cat.length * 31) * Math.PI) / 180;
      const d = 0.8 + i * 0.9;
      return {
        id: `demoCat${cat}${i}`, name, description: 'demo data', descLang: 'cs', lat: lat + Math.sin(a) * d, lon: lon + Math.cos(a) * d * 1.4, sitelinks: 50 - i, image: null, url: null,
        extract: 'Vymyšlené místo pro ukázku aplikace (DEMO režim).', cats: [cat], nature: cat !== 'castle',
      };
    }),
  };
}

/** DEMO režim: vymyšlený přehled země kolem bodu (50–450 km). */
export function mockCountry({ lat, lon }) {
  const names = {
    city: ['Ukázkové hlavní město', 'Vzorové přístavní město', 'Příkladné univerzitní město', 'Testovací lázně'], dest: ['Ukázkové pobřeží', 'Vzorové jezero', 'Příkladné hory'],
    unesco: ['Ukázkové historické centrum', 'Vzorová katedrála', 'Příkladná archeologická lokalita'], park: ['Ukázkový národní park', 'Vzorový národní park'],
  };
  const out = {};
  let i = 0;
  for (const g of COUNTRY_KINDS) {
    out[g] = names[g].map((name, j) => {
      const a = (i * 137.5 * Math.PI) / 180;
      const d = 0.5 + (i % 5) * 0.8;
      i++;
      return {
        id: `demoCountry${i}`, name, description: 'demo data', descLang: 'cs', lat: lat + Math.sin(a) * d, lon: lon + Math.cos(a) * d * 1.4, sitelinks: 100 - i * 4,
        image: null, url: null, unesco: g === 'unesco', extract: 'Vymyšlené místo pro ukázku aplikace (DEMO režim).', ...(g === 'city' || g === 'dest' ? { blurb: 'demo data' } : {}),
        cats: g === 'dest' ? [['beach', 'lake', 'mountain'][j]] : [], nature: g === 'park' || g === 'dest',
      };
    });
  }
  return out;
}
