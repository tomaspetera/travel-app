// Výlety z města (Objevuj, Program, jednodenní výlety): co stojí za celý den venku a jak dlouho se tam jede.
// Kandidáty skládá poi.js (tripsFromRows: města, hrady, příroda a UNESCO z Wikidat); tady se řadí a popisují.
//   • Význam: jazykové verze (sitelinks), UNESCO, známé památky v místě, článek v průvodci Wikivoyage a hlavně to, že
//     výlet doporučuje článek o městě (oddíl „Go next“ anglické Wikivoyage: Řím → Tivoli, Cerveteri, Ostia…).
//     K tomu krátký ručně vybraný seznam klasik (CLASSICS) pro nejčastější města českých turistů – jen QID položek
//     Wikidat (poloha i popis jsou z Wikidat, nic se nevymýšlí).
//   • Dosah: odhad cesty z města vlakem/busem a autem (transfers.js – jízdní řády přímých vlaků, rychlotratě, jinak
//     podle silnice); ideál do ~2 h, nad 2,5 h jednou cestou výrazně níž.
//   • Ven: předměstí a obce v dosahu MHD bez jediné známé památky, města pojmenovaná po letišti (Fiumicino, Luton)
//     a cíle, které už pokrývá program ve městě.
import { transferTimes } from './transfers.js';

// Klasické jednodenní výlety z ~20 měst, kam Češi létají nejčastěji (QID → název pro čtenáře kódu). Jen doplněk
// k datům: přidá body (CLASSIC_PTS) a dotáhne cíl, který dotaz na nejznámější místa v okolí nenajde (Ostia Antica
// má 50 jazykových verzí a v okolí Říma se mezi 300 nejznámějších nevejde; ostrovy Burano a Capri nemají typ obce).
// Ověřeno dotazem na Wikidata 10/2026 (test/daytrips.test.js hlídá tvar). Přidávat jen opravdové klasiky.
export const CLASSICS = new Map([
  ['Q190187', 'Sintra'], ['Q273059', 'Cascais'], ['Q275862', 'Óbidos'], // Lisabon
  ['Q159605', 'Tivoli'], ['Q1012797', 'Ostia Antica'], ['Q541', 'Orvieto'], // Řím
  ['Q13375', 'Pisa'], ['Q2751', 'Siena'], ['Q91413', 'San Gimignano'], // Florencie
  ['Q43332', 'Pompeje'], ['Q80563', 'Amalfi'], ['Q173292', 'Capri'], // Neapol
  ['Q52437', 'Murano'], ['Q52439', 'Burano'], ['Q2028', 'Verona'], ['Q617', 'Padova'], // Benátky
  ['Q732115', 'Montserrat'], ['Q7038', 'Girona'], ['Q15551', 'Sitges'], // Barcelona
  ['Q5836', 'Toledo'], ['Q15684', 'Segovia'], // Madrid
  ['Q2946', 'Versailles (zámek)'], ['Q621', 'Versailles'], // Paříž
  ['Q42646', 'Windsor (hrad)'], ['Q34217', 'Oxford'], ['Q350', 'Cambridge'], // Londýn
  ['Q136661', 'Zaanse Schans'], ['Q9920', 'Haarlem'], ['Q803', 'Utrecht'], // Amsterdam
  ['Q4152', 'Neuschwanstein'], ['Q34713', 'Salcburk'], // Mnichov
  ['Q192201', 'Wachau'], ['Q1780', 'Bratislava'], // Vídeň
  ['Q390798', 'Szentendre'], // Budapešť
  ['Q472621', 'Wieliczka'], ['Q7341', 'Osvětim'], // Krakov
  ['Q75459', 'Delfy'], ['Q1136637', 'Sounion'], // Atény
  ['Q171080', 'Kotor'], ['Q93347', 'Mostar'], // Dubrovník
  ['Q189161', 'Trogir'], ['Q828155', 'NP Krka'], // Split
  ['Q170903', 'Guimarães'], ['Q83247', 'Braga'], // Porto
  ['Q13153', 'Ronda'], ['Q8810', 'Granada'], ['Q13149', 'Nerja'], // Malaga
  ['Q207448', 'Monreale'], ['Q235163', 'Cefalù'], // Palermo
]);
export const CLASSIC_IDS = [...CLASSICS.keys()];
// Body navíc (k ~60–90 za význam): doporučení průvodce je silný signál; klasika ještě silnější, ať se dostane mezi
// prvních 8 i s málo jazykovými verzemi (Burano 47, Montserrat 46) vedle velkých měst s UNESCO.
export const GONEXT_PTS = 10;
export const CLASSIC_PTS = 25;
export const CLASSIC_KM = 140; // klasiky a doporučení průvodce i kousek za okruhem dotazu (Delfy od Atén ~120 km)

/**
 * Odkazy z oddílu „Go next“ článku anglické Wikivoyage (wikitext) → názvy článků. Bez souborů, kategorií
 * a odkazů do jiných projektů ([[File:…]], [[w:…]]), kotva pryč, první písmeno velké (tak je název článku i v sitelinks).
 */
export function parseGoNext(wikitext) {
  const text = String(wikitext || '');
  const m = text.match(/^==\s*Go next\s*==[^\n]*\n([\s\S]*?)(?=^==[^=]|(?![\s\S]))/im);
  if (!m) return [];
  const out = [];
  for (const [, raw] of m[1].matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const t = raw.split('#')[0].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.includes(':')) continue;
    const name = t.charAt(0).toUpperCase() + t.slice(1);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

// Mimo trať (hrad, příroda, zřícenina): z nádraží nebo zastávky ještě místním busem či pěšky.
const OFF_RAIL_MIN = 20;
const round5 = (m) => Math.max(5, Math.round(m / 5) * 5);
/**
 * Jak se tam dostat z města: { transitMin, carMin, mode: 'rail' | 'bus' | 'boat' } – odhad (bez jízdních řádů, kromě
 * přímých rychlých vlaků z data/transfers.json). Ostrov (Capri, Burano) lodí a bez auta.
 */
export function reachOf(center, p) {
  const x = transferTimes(center, p);
  if (p.island) return { transitMin: round5(x.transitMin), carMin: null, mode: 'boat' };
  const off = p.tripKind && p.tripKind !== 'town' ? OFF_RAIL_MIN : 0;
  return { transitMin: round5(x.transitMin + off), carMin: x.carMin, mode: x.transitKind === 'rail' ? 'rail' : 'bus' };
}
// Jednou cestou rozhoduje to rychlejší: vlak/bus, nebo auto (+ čtvrt hodiny na parkování a cestu z parkoviště).
export const oneWayMin = (r) => Math.min(r.transitMin, r.carMin == null ? Infinity : r.carMin + 15);

/**
 * Body dolů za dlouhou cestu (jednou cestou, min): do 45 min nic, do 2 h mírně (bližší z podobných má přednost –
 * Sintra před Évorou), 2–2,5 h víc, nad 2,5 h strmě (celý den v autobuse).
 */
export function reachPenalty(min) {
  if (!(min > 45)) return 0;
  if (min <= 120) return (min - 45) * 0.08;
  if (min <= 150) return 6 + (min - 120) * 0.2;
  return 12 + (min - 150) * 0.4;
}

// Předměstí: obec v dosahu městské a příměstské dopravy.
const SUBURB_KM = 30;
const SUBURB_MIN = 50;
// Doporučený cíl blíž než 15 km (Almada za řekou, Fiesole nad Florencií) je spíš půldenní kousek města – o kus níž,
// klasika ne (Murano, Wieliczka).
const NEAR_KM = 15;
const NEAR_PTS = 8;
// Stojí za to: památka UNESCO, klasika, doporučení průvodce, známá památka v místě – nebo samo je to hrad, zámek či příroda.
const notable = (t) => Boolean(t.unesco || t.classic || t.goNext || t.sights > 0 || t.tripKind !== 'town');

/** Jedna věta „proč tam jet“ z toho, co o místě víme (UNESCO, klasika, doporučení průvodce, co tam uvidíš). */
export function whyOf(t) {
  const tags = [
    t.unesco ? 'památka UNESCO' : t.unescoPart ? 'část památky UNESCO' : '',
    t.classic ? 'oblíbený výlet z města' : t.goNext ? 'výlet doporučuje průvodce Wikivoyage' : '',
    t.spa ? 'lázně' : '',
  ].filter(Boolean);
  const see = (t.highlights || []).slice(0, 2);
  const parts = [tags.join(', '), see.length ? `k vidění: ${see.join(', ')}` : ''].filter(Boolean);
  if (!parts.length) return null;
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Pořadí výletů: vyřadí předměstí bez památek a „letištní“ města, ke každému přidá dosah (reach) a důvod (why);
 * road = plánovač výletů autem/vlakem (počítá s časem cesty sám) – skóre bez penalizace za dlouhou cestu.
 */
export function rankTrips(trips, { center, road = false } = {}) {
  const out = [];
  for (const t of trips) {
    const reach = reachOf(center, t);
    const town = t.tripKind === 'town';
    if (town && !notable(t) && (t.distanceKm <= SUBURB_KM || reach.transitMin <= SUBURB_MIN)) continue;
    if (t.airport && !(t.unesco || t.classic || t.goNext || t.sights >= 2)) continue;
    const near = t.distanceKm < NEAR_KM && !t.classic ? NEAR_PTS : 0;
    const score = Math.round((t.score - near - (road ? 0 : reachPenalty(oneWayMin(reach)))) * 10) / 10;
    out.push({ ...t, score, reach, why: whyOf(t) });
  }
  return out.sort((a, b) => b.score - a.score);
}
