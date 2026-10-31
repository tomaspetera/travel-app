// Plánovač programu: rozdělí místa do dnů podle polohy a v každém dni je seřadí do trasy.
// Bez AI – deterministický algoritmus: nejznámější místa napřed, pak podle skóre a zájmů s limity kategorií za den →
// k-means shluky po dnech z několika začátků (s vyvážením kapacity) → pořadí nejbližší soused + 2-opt (a obráceně,
// když tak muzea a zoo stihnou zavírací dobu) → časy zastávek s chůzí, MHD a obědem v okně dne → tipy (oběd, cestou,
// na večer, na déšť) z míst, která v programu nejsou. Známé památky ne v jejich zavírací den (data/sight-hours.json).
import { haversineKm, normalize } from './geo.js';
import { addDays, daysBetween, isYmd } from './dates.js';
import { sightHours, closedOn, closedWhy, hoursNote } from './hours.js';

// Typická délka návštěvy podle kategorie (min).
export const VISIT_MIN = {
  museum: 120, gallery: 90, castle: 100, palace: 90, church: 30, monument: 20, square: 30, oldtown: 90,
  viewpoint: 30, park: 60, garden: 60, nature: 150, beach: 180, zoo: 180, theme: 240, market: 45,
  bridge: 15, tower: 45, ruins: 60, theatre: 30, sight: 45, daytrip: 360,
};
// Významný kostel nebo pomník (UNESCO, nebo článek v 60+ jazycích) – Bazilika sv. Petra ani Jerónimos nejsou zastávka
// na půl hodiny jako kostelík za rohem; Gaudího Casa Batlló a Casa Milà (UNESCO, „zajímavost“) ne na 45 min.
// Koloseum a Forum Romanum (60+ jazyků) nejsou hodinová zastávka jako zbytek chrámu na náměstí.
const MAJOR_MIN = { church: 60, monument: 40, sight: 75, ruins: 90 };
// Málo známá pevnost nebo palác (bašty dubrovnických hradeb, palác s úřadem – do 15 jazykových verzí, bez UNESCO) je
// zastávka na prohlídku zvenku nebo krátký vstup, ne 1 h 40 min jako Pražský hrad.
const MINOR_MIN = { castle: 45, palace: 45 };
// Malé stavby: sloučené části (kaple, vyhlídka…) přidají nejvýš půl hodiny – věž ani pomník nejsou na 2 h.
const SMALL = new Set(['church', 'monument', 'tower', 'bridge', 'viewpoint']);
const PACE = { relaxed: 240, normal: 360, intense: 480 }; // minut programu na celý den

/**
 * Délka návštěvy (min): podle kategorie a významu; celek se sloučenými částmi (Pražský hrad s katedrálou, Zlatou
 * uličkou…) = delší návštěva: +20 min za část, nejvýš +2 h (u malých staveb nejvýš +30 min).
 */
export function visitMinutes(p) {
  const major = Boolean(p.unesco) || p.sitelinks >= 60;
  const minor = !p.unesco && Number.isFinite(p.sitelinks) && p.sitelinks < 15 && !p.includes?.length;
  const base = p.visitMin || (major && MAJOR_MIN[p.category]) || (minor && MINOR_MIN[p.category]) || VISIT_MIN[p.category] || 45;
  return base + Math.min(SMALL.has(p.category) ? 30 : 120, 20 * (p.includes?.length || 0));
}

const toXY = (p, lat0) => [p.lon * 111.32 * Math.cos((lat0 * Math.PI) / 180), p.lat * 110.57];

export function walkKm(a, b) {
  return haversineKm(a.lat, a.lon, b.lat, b.lon) * 1.3;
}

/** Kapacita dnů v minutách podle příletu/odletu. */
export function dayCapacities({ start, end, arrivalTime = '12:00', departureTime = null, endBy = null, pace = 'normal' }) {
  const n = Math.max(1, daysBetween(start, end) + 1);
  const full = PACE[pace] || PACE.normal;
  const hour = (t) => {
    const [h, m] = String(t || '12:00').split(':').map(Number);
    return (h || 0) + (m || 0) / 60;
  };
  const caps = [];
  for (let i = 0; i < n; i++) {
    // Okno dne: od 9:00 (den příletu 1,5 h po příletu, ale ne dřív než v 9:00 – přílet v 0:40 neznamená prohlídku
    // Andělského hradu ve 2:37) do 20:00 (den odletu 3 h před odletem); u jednodenní cesty platí obojí naráz.
    const from = i === 0 ? Math.max(9, hour(arrivalTime) + 1.5) : 9;
    // endBy: poslední den nejpozději do (průvodce: kdy vyrazit z ubytování na letiště, mimo Schengen dřív než 3 h)
    const to = i === n - 1 ? Math.min(departureTime ? Math.min(20, hour(departureTime) - 3) : 20, endBy ? hour(endBy) : 24) : 20;
    const cap = Math.max(0, Math.min(full, (to - from) * 60 * (full / 600)));
    // from/to = okno dne v minutách od půlnoci (časy zastávek a oběd v dayTimeline)
    caps.push({ date: addDays(start, i), cap: Math.round(cap), from: Math.round(from * 60), to: Math.round(to * 60) });
  }
  return caps;
}

function kmeans(xy, init, iters = 25) {
  const k = init.length;
  const centers = init.map((c) => [...c]);
  let assign = new Array(xy.length).fill(0);
  for (let it = 0; it < iters; it++) {
    assign = xy.map((q) => {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      });
      return bi;
    });
    for (let c = 0; c < k; c++) {
      const mem = xy.filter((_, i) => assign[i] === c);
      if (mem.length) centers[c] = [mem.reduce((s, q) => s + q[0], 0) / mem.length, mem.reduce((s, q) => s + q[1], 0) / mem.length];
    }
  }
  return { assign, centers };
}

/**
 * Rozdělení míst do `caps.length` dnů (caps = minuty programu dnů): k-means z několika začátků a vybere se rozdělení
 * s nejmenším součtem vzdáleností ke středům dnů + přetečením kapacity dnů (15 min navíc ≈ 1 km). Jen „nejvzdálenější
 * body“ jako začátek dělaly z odlehlých míst (Via Appia, sv. Pavel za hradbami) samostatné dny a zbytek Říma nacpaly
 * do jednoho – pak se přesouvalo křížem krážem přes město. Další začátky: výseče kolem středu a pásy od západu
 * k východu / od jihu k severu, každý se zhruba stejným časem prohlídek.
 */
export function clusterDays(points, caps, lat0) {
  const k = Math.min(caps.length, points.length);
  const xy = points.map((p) => toXY(p, lat0));
  const w = points.map((p) => p.visitMin || 45);
  const inits = [];
  // nejvzdálenější body (deterministicky, začni nejvýznamnějším)
  const far = [xy[0]];
  while (far.length < k) {
    let best = -1;
    let bestD = -1;
    xy.forEach((q, i) => {
      const d = Math.min(...far.map((c) => (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2));
      if (d > bestD) { bestD = d; best = i; }
    });
    far.push(xy[best]);
  }
  inits.push(far);
  // skupiny po sobě jdoucích bodů (podle úhlu nebo souřadnice) s vyváženým časem → jejich těžiště
  const total = w.reduce((a, b) => a + b, 0);
  const groups = (order) => {
    const out = Array.from({ length: k }, () => []);
    let acc = 0;
    for (const i of order) { out[Math.min(k - 1, Math.floor((acc / total) * k))].push(i); acc += w[i]; }
    return out.filter((g) => g.length).map((g) => [g.reduce((s, i) => s + xy[i][0], 0) / g.length, g.reduce((s, i) => s + xy[i][1], 0) / g.length]);
  };
  const cx = xy.reduce((s, q) => s + q[0], 0) / xy.length;
  const cy = xy.reduce((s, q) => s + q[1], 0) / xy.length;
  const idx = xy.map((_, i) => i);
  const ang = xy.map(([x, y]) => Math.atan2(y - cy, x - cx));
  for (let r = 0; r < 8; r++) {
    const off = (r * Math.PI) / 4;
    inits.push(groups([...idx].sort((a, b) => ((ang[a] - off + 4 * Math.PI) % (2 * Math.PI)) - ((ang[b] - off + 4 * Math.PI) % (2 * Math.PI)))));
  }
  inits.push(groups([...idx].sort((a, b) => xy[a][0] - xy[b][0])), groups([...idx].sort((a, b) => xy[a][1] - xy[b][1])));
  const capsDesc = [...caps].sort((a, b) => b - a);
  let best = null;
  for (const init of inits.filter((c) => c.length === k)) {
    const r = kmeans(xy, init);
    const spread = xy.reduce((s, q, i) => s + Math.hypot(q[0] - r.centers[r.assign[i]][0], q[1] - r.centers[r.assign[i]][1]), 0);
    const mins = Array.from({ length: k }, (_, c) => w.reduce((s, m, i) => s + (r.assign[i] === c ? m : 0), 0)).sort((a, b) => b - a);
    const over = mins.reduce((s, m, i) => s + Math.max(0, m - capsDesc[i] * 1.1), 0);
    const cost = spread + over / 15;
    if (!best || cost < best.cost - 1e-9) best = { ...r, cost };
  }
  return best;
}

/** Pořadí návštěv: nejbližší soused od startu + 2-opt. */
export function orderRoute(start, items) {
  if (items.length < 2) return items.slice();
  const rest = items.slice();
  const route = [];
  let cur = start;
  while (rest.length) {
    let bi = 0;
    let bd = Infinity;
    rest.forEach((p, i) => {
      const d = haversineKm(cur.lat, cur.lon, p.lat, p.lon);
      if (d < bd) { bd = d; bi = i; }
    });
    cur = rest.splice(bi, 1)[0];
    route.push(cur);
  }
  const len = (r) => r.reduce((s, p, i) => s + haversineKm((i ? r[i - 1] : start).lat, (i ? r[i - 1] : start).lon, p.lat, p.lon), 0);
  let improved = true;
  let best = route;
  let bestLen = len(route);
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const l = len(cand);
        if (l + 1e-9 < bestLen) { best = cand; bestLen = l; improved = true; }
      }
    }
  }
  return best;
}

/**
 * Nejznámější místa (Koloseum, Fontána di Trevi, Belémská věž): `n` míst s nejvíc jazykovými verzemi článku na Wikipedii
 * – popularita, kterou už máme z Wikidat; bez ní (starší data) podle skóre. Jen v dosahu města (do `maxKm` od středu)
 * a jen památky, ne čtvrti (Vatikán má 343 jazyků, ale navštěvuje se bazilika a muzea).
 */
export function mustSeeIds(pois, n, center, maxKm = 8, aloneKm = 2.5) {
  const pop = (p) => (Number.isFinite(p.sitelinks) ? p.sitelinks : -1);
  const list = pois.filter((p) => p.category !== 'daytrip' && p.category !== 'oldtown' && haversineKm(center.lat, center.lon, p.lat, p.lon) <= maxKm)
    .sort((a, b) => pop(b) - pop(a) || b.score - a.score);
  // Osamělé místo (nic dalšího známého do 2,5 km) jen z horní poloviny: Belémská věž (1. v Lisabonu) ano, Via Appia
  // (9. v Římě) ne – jinak by byla výjimkou z odlehlých míst a den by končil po setmění na kraji města
  const known = list.slice(0, 2 * n);
  const alone = (p) => !known.some((q) => q !== p && haversineKm(p.lat, p.lon, q.lat, q.lon) <= aloneKm);
  const out = [];
  for (const p of list) {
    if (out.length >= n) break;
    if (out.length >= Math.ceil(n / 2) && alone(p)) continue;
    out.push(p.id);
  }
  return new Set(out);
}

const WALK_KMH = 4.8;
const KIDS_WALK_KMH = 3.5; // s dětmi (6–9 let) pomaleji a s přestávkami
const TRANSIT_KM = 3; // delší úsek se jede MHD nebo taxi (s dětmi už od 2 km)
const transitKm = (kids) => (kids ? 2 : TRANSIT_KM);
// MHD/taxi: čekání a cesta na zastávku ~12 min + ~3 min/km (metro, tramvaj ~20 km/h)
const transitMin = (km) => Math.round(12 + km * 3);
// Na ostrov a z něj (Lokrum u Dubrovníku) lodí: cesta do přístavu, čekání a plavba ~30 min – ne 2 km „pěšky“ po moři
const BOAT_MIN = 30;
const boat = (a, b) => Boolean(a.island || b.island) && !(a.island && b.island && haversineKm(a.lat, a.lon, b.lat, b.lon) < 1);
const LUNCH_MIN = 60;
const LUNCH_FROM = 11 * 60 + 45; // oběd před první zastávkou, která začíná po 11:45…
const LUNCH_LATE = 14 * 60 + 30; // …nebo dřív (od 11:00), když by další prohlídka skončila až po 14:30…
const LUNCH_LAST = 14 * 60 + 45; // …nejpozději ve 14:45 (po zoo od 11:30) – den, který začíná později (přílet odpoledne), oběd nemá
const hm = (m) => { const r = Math.round(m); return `${String(Math.floor(r / 60) % 24).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`; };

/**
 * Časy dne: start okna (from, minut od půlnoci), přesuny pěšky (km × 1,3 ulicemi / rychlost chůze) nebo MHD nad 3 km,
 * prohlídky a hodinová pauza na oběd mezi 11:45 a 14:45 (u Lokrumu loď). → { at: [začátek zastávky v min], lunch: index
 * zastávky, po které je oběd (−1 = bez obědu), lunchAt, end: konec programu v min }
 */
export function dayTimeline(items, { start, from = 9 * 60, kids = false }) {
  const speed = kids ? KIDS_WALK_KMH : WALK_KMH;
  const at = [];
  let t = from;
  let lunch = -1;
  let lunchAt = null;
  items.forEach((p, i) => {
    const prev = i ? items[i - 1] : start;
    const km = walkKm(prev, p);
    const leg = boat(prev, p) ? BOAT_MIN : km > transitKm(kids) ? transitMin(km) : (km / speed) * 60;
    // po 11:45, nebo už od 11:00, když by cesta a další prohlídka (zoo, dvouhodinové muzeum) skončila až po 14:30
    const hungry = t >= LUNCH_FROM || (t >= 11 * 60 && t + leg + p.visitMin > LUNCH_LATE);
    if (i && lunch < 0 && hungry && t <= LUNCH_LAST) { lunch = i - 1; lunchAt = Math.round(t); t += LUNCH_MIN; }
    t += leg;
    at.push(Math.round(t));
    t += p.visitMin;
  });
  // ráno začatý den, který skončí po poledni bez pauzy: oběd po poslední zastávce
  if (items.length && lunch < 0 && from < 12 * 60 && t >= 12 * 60 && t <= LUNCH_LAST + 30) { lunch = items.length - 1; lunchAt = Math.round(t); }
  return { at, lunch, lunchAt, end: Math.round(t) };
}

// Kam na konec dne (západ slunce, večer venku) a co spíš dřív: muzea, paláce, hrady, zoo, zábavní parky a naleziště
// zavírají (otevírací doby z Wikidat skoro nejsou – počítá se s 17:30; v zimě bývá zoo i Forum Romanum zavřené dřív).
const EVENING = new Set(['viewpoint', 'square', 'oldtown', 'beach', 'bridge', 'park', 'market']);
const INDOOR = new Set(['museum', 'gallery', 'palace', 'castle']);
const CLOSES = new Set([...INDOOR, 'zoo', 'theme', 'ruins']);
const CLOSE_AT = 17 * 60 + 30;
const routeLen = (start, r) => r.reduce((s, p, i) => s + haversineKm((i ? r[i - 1] : start).lat, (i ? r[i - 1] : start).lon, p.lat, p.lon), 0);
/**
 * Stejná trasa, nebo obráceně (jiný je jen první úsek od ubytování): rozhodne kilometr navíc (~12 min chůze) proti
 * minutám prohlídek po zavírací době (zoo od 15:30 do 18:30) a konci dne u vyhlídky nebo na náměstí místo v muzeu.
 */
export function eveningOrder(start, route, { from = 9 * 60, kids = false } = {}) {
  if (route.length < 2) return route;
  const cost = (r) => {
    const { at } = dayTimeline(r, { start, from, kids });
    const late = r.reduce((s, p, i) => s + (CLOSES.has(p.category) ? Math.max(0, at[i] + p.visitMin - CLOSE_AT) : 0), 0);
    const last = r.at(-1).category;
    return routeLen(start, r) * 12 + late + (EVENING.has(last) ? -10 : 0) + (INDOOR.has(last) ? 10 : 0);
  };
  const rev = [...route].reverse();
  return cost(rev) < cost(route) ? rev : route;
}

// Na déšť: místa pod střechou (velký kostel jen významný – Pantheon ano, kostelík za rohem ne)
const indoor = (p) => INDOOR.has(p.category) || p.category === 'market' || p.eatery || (p.category === 'church' && (p.unesco || p.sitelinks >= 30));
const OUTDOOR = new Set(['park', 'garden', 'viewpoint', 'nature', 'beach', 'zoo', 'theme', 'square', 'monument', 'bridge', 'oldtown', 'ruins']);
// Na večer: náměstí, vyhlídka, čtvrť, most, opera/divadlo (představení) nebo pláž (koupání, západ slunce) kousek od konce dne
const EVENING_IDEA = new Set(['square', 'viewpoint', 'oldtown', 'bridge', 'theatre', 'beach']);
const NATURE_CATS = new Set(['nature', 'park', 'viewpoint', 'beach']);
const slim = (p, from) => ({ id: p.id, name: p.name, category: p.category, lat: p.lat, lon: p.lon, ...(from ? { km: Math.round(walkKm(from, p) * 10) / 10 } : {}) });
// S dětmi ne (muzeum marihuany v Barceloně, mučírny, erotická muzea)
const ADULT = /marihuan|marijuan|cannabis|hash\b|hemp|erotic|erotik|\bsex|tortur|mučír/i;
// S dětmi: místo „S dětmi“ v zájmech platí i bez něj (cesta s dětmi z plánovače), umění a kostely míň
const KIDS_W = { zoo: 2, theme: 2, park: 1.4, beach: 1.5, viewpoint: 1.2, castle: 1.2, gallery: 0.6, church: 0.8 };
const CAP_ALL = { church: 3, square: 2, monument: 3, museum: 2, gallery: 1, ruins: 3, oldtown: 1, palace: 2, castle: 2, nature: 1, beach: 1 };
const CAP_KIDS = { ...CAP_ALL, museum: 1, church: 2 };
// Národní park, ve kterém program je (Krkonoše), není zastávka – jsou jí vrcholy a vodopády v něm.
const NATIONAL_PARK = /národní park|national park|nationalpark|parque nacional|parc national|parco nazionale|park narodowy/i;

const KEEP_MAX = 300;
/**
 * Po ✕ v programu: dny míst, která v programu zůstala ({ id: 'RRRR-MM-DD' }). Jen prostý objekt do 300 položek (víc
 * z aplikace nepřijde – pak bez něj, program se složí znovu celý), id do 120 znaků a datum v termínu start–end;
 * neplatné položky se zahodí. → objekt, nebo undefined.
 */
export function keepOf(raw, start, end) {
  if (!raw || typeof raw !== 'object' || Object.getPrototypeOf(raw) !== Object.prototype) return undefined;
  const all = Object.entries(raw);
  if (all.length > KEEP_MAX) return undefined;
  const ok = all.filter(([id, date]) => id && id.length <= 120 && typeof date === 'string' && isYmd(date)
    && daysBetween(start, date) >= 0 && daysBetween(date, end) >= 0);
  return ok.length ? Object.fromEntries(ok) : undefined;
}

/**
 * pois: [{ id, name, lat, lon, score, category, ... }] (vyšší score = zajímavější)
 * opts: { center:{lat,lon}, start, end, arrivalTime, departureTime, pace, interests:{category:weight}, kids, maxDayTripKm,
 *   keep:{id:datum} – po ✕ v programu: místa zůstanou ve svých dnech (viz níž) }
 */
export function planItinerary(pois, opts) {
  const { center, pace = 'normal', kids = false } = opts;
  // místo bez polohy (poškozený záznam) by rozbilo shluky dnů (NaN ve středu dne) – do programu nejde
  pois = pois.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  // s dětmi o 15 % méně prohlídek za den – přestávky, hřiště, zmrzlina (Barcelona: jinak zoo a pak ještě do 19:20)
  const caps = dayCapacities(opts).map((c) => (kids ? { ...c, cap: Math.round(c.cap * 0.85) } : c));
  // Zavírací dny památek (data/sight-hours.json): zavřená po celý pobyt (Pergamonmuseum v rekonstrukci, Louvre na
  // jednodenní cestě v úterý) do programu nejde – a když je nejznámější nebo připnutá, řekne to upozornění; ostatní
  // jen ne v den, kdy je zavřená (Vatikánská muzea v neděli).
  const hoursOf = new Map();
  for (const p of pois) { const h = sightHours(p); if (h) hoursOf.set(p.id, h); }
  const shutOn = (p, date) => Boolean(closedOn(hoursOf.get(p.id), date));
  const stay = caps.filter((c) => c.cap > 0).map((c) => c.date);
  const closedAll = pois.filter((p) => hoursOf.has(p.id) && stay.length && stay.every((date) => shutOn(p, date)));
  if (closedAll.length) pois = pois.filter((p) => !closedAll.includes(p));
  const interests = { ...(opts.interests || {}) };
  // s dětmi: zoo, park a pláž výš, galerie a kostely níž – kromě toho, co si uživatel sám vybral (zájem „Muzea a umění“)
  if (kids) for (const [k, v] of Object.entries(KIDS_W)) interests[k] = v < 1 ? (interests[k] > 1 ? interests[k] : v) : Math.max(interests[k] ?? 1, v);
  const weight = (p) => p.score * (interests[p.category] ?? 1);
  // Stejné jméno dvakrát (Krkonošský národní park na české i polské straně) = jedno místo; národní park, ve kterém
  // program je, není zastávka; s dětmi bez muzeí pro dospělé.
  const seenName = new Set();
  const near = pois.filter((p) => p.category !== 'daytrip').sort((a, b) => weight(b) - weight(a)).filter((p) => {
    const n = normalize(p.name);
    const dup = seenName.has(n);
    seenName.add(n);
    return p.pinned || !(dup || (kids && ADULT.test(p.name))
      || (['nature', 'park'].includes(p.category) && NATIONAL_PARK.test(p.name) && haversineKm(center.lat, center.lon, p.lat, p.lon) <= 5));
  });
  // Hory a příroda (Krkonoše: samé vrcholy a vodopády): vzdálenosti jsou větší než ve městě a delší úsek se jede autem
  // nebo busem, ne MHD
  const rural = near.filter((p) => NATURE_CATS.has(p.category)).length >= near.length * 0.5;
  const trips = pois.filter((p) => p.category === 'daytrip').sort((a, b) => weight(b) - weight(a));

  // Celodenní výlety mimo město, když je na ně čas (od 4 plných dnů, max. každý třetí den).
  // Nikdy ne první ani poslední den (přílet / odlet); výlet, který si uživatel připnul, má přednost.
  const full = PACE[pace] || 360;
  const fullDays = caps.filter((c) => c.cap >= full * 0.9);
  const tripEligible = fullDays.filter((c) => c.date !== caps[0].date && c.date !== caps.at(-1).date);
  const pinnedTrips = trips.filter((p) => p.pinned).length;
  const baseTrips = fullDays.length >= 4 ? Math.floor(fullDays.length / 3) : 0;
  const tripDays = Math.min(trips.length, tripEligible.length, Math.max(baseTrips, pinnedTrips));
  const spaced = tripEligible.filter((_, i) => i % 3 === 1);
  const tripDayDates = new Set([...spaced, ...tripEligible.filter((c) => !spaced.includes(c))].slice(0, tripDays).map((c) => c.date));
  const warnings = [];
  if (pinnedTrips > tripDays) warnings.push('Na celodenní výlet mimo město je pobyt krátký – potřebuje celý den mezi příletem a odletem.');

  const cityDays = caps.filter((c) => !tripDayDates.has(c.date) && c.cap > 0);
  const totalCap = cityDays.reduce((s, c) => s + c.cap, 0);
  // Výběr podle významu s limitem kategorií už tady (jinak by např. 20 kostelů vyčerpalo čas
  // a pestrost by je pak jen vyškrtala, takže by dny zůstaly poloprázdné). Za den nejvýš 3 kostely, 2 náměstí,
  // 2 muzea a 1 galerie (ne 6 muzeí za sebou), 3 naleziště (Římská fóra), 1 čtvrť, 2 paláce a 2 hrady, 1 výlet do
  // přírody a 1 pláž (Sněžka a Szrenica na opačných koncích hřebene ne v jeden den); s dětmi 1 muzeum a 2 kostely.
  const CAP = kids ? CAP_KIDS : CAP_ALL;
  // Limit podle skutečného času (krátký den příletu/odletu se nepočítá jako celý den).
  // ZOO a zábavní park (3–4 h) jednou za pobyt – „s dětmi“ jinak dá zoo každý den (Berlín: Zoo i Tierpark);
  // připnuté místo platí vždy (i nad limit kategorie)
  const ONCE = { zoo: 1, theme: 1 };
  // „jednou za den“ (příroda, pláž, čtvrť, galerie) za každý den s aspoň 2,5 h – i krátký den příjezdu
  const longDays = cityDays.filter((c) => c.cap >= 150).length;
  const catLimit = (cat) => ONCE[cat] || (CAP[cat] ? CAP[cat] * Math.max(1, CAP[cat] === 1 ? longDays : Math.round(totalCap / full)) : Infinity);
  // Nejznámější místa (3 na celý den pobytu, celkem 3–10) jdou do výběru hned po připnutých – jinak čas zaplnily delší,
  // méně známé paláce a hradby (Řím: Fontána di Trevi i Vatikánská muzea zůstaly mezi „dalšími místy“).
  const mustN = Math.min(10, Math.max(3, Math.round((totalCap / full) * 3)));
  const must = mustSeeIds(near, mustN, center, rural ? 15 : 8, rural ? 5 : 2.5);
  // nejznámější (nebo připnutá) památka zavřená po celý pobyt: upozornění, ať ji uživatel nehledá
  const mustClosed = closedAll.length ? mustSeeIds([...near, ...closedAll], mustN, center, rural ? 15 : 8, rural ? 5 : 2.5) : new Set();
  for (const p of closedAll) {
    if (p.pinned || mustClosed.has(p.id)) warnings.push(`${p.name}: ${closedWhy(hoursOf.get(p.id), stay[0])} – v programu není.`);
  }
  const byWeight = [...near].sort((a, b) => weight(b) - weight(a)).map((p) => ({ ...p, visitMin: visitMinutes(p) }));
  const ranked = [...byWeight.filter((p) => p.pinned), ...byWeight.filter((p) => !p.pinned && must.has(p.id)), ...byWeight.filter((p) => !p.pinned && !must.has(p.id))];
  const choose = (skip) => {
    const out = [];
    const perCat = {};
    let used = 0;
    for (const p of ranked) {
      if (skip.has(p.id) || used + p.visitMin > totalCap * 0.95 || (!p.pinned && (perCat[p.category] || 0) >= catLimit(p.category))) continue;
      out.push(p);
      perCat[p.category] = (perCat[p.category] || 0) + 1;
      used += p.visitMin;
    }
    return out;
  };
  // Odlehlé místo (most Vasca da Gamy 9 km za centrem Lisabonu, přes 2,5 km od všeho ostatního) by den protáhlo
  // o MHD tam a zpět – do programu po čtvrtích nepatří, kromě připnutých a nejznámějších (dřív deseti nejvýš
  // v pořadí: v Římě tak den příletu skončil po setmění u sv. Pavla za hradbami a na Via Appia). Na jeho místo se
  // vybere další v pořadí.
  const outlier = (p, list) => !p.pinned && !must.has(p.id)
    && !list.some((q) => q !== p && haversineKm(p.lat, p.lon, q.lat, q.lon) <= (rural ? 5 : 2.5));
  // Čtvrť nebo historické centrum (Alfama, Barri Gòtic, Vatikán), jehož památky program prochází (aspoň 2 do 600 m),
  // není další zastávka na hodinu a půl – čas by se počítal dvakrát. Jméno čtvrti pak dostane den, který jí vede.
  const AREA_KM = 0.6;
  const areaOf = (list) => list.filter((p) => p.category === 'oldtown' && !p.pinned
    && list.filter((q) => q.category !== 'oldtown' && haversineKm(p.lat, p.lon, q.lat, q.lon) <= AREA_KM).length >= 2);
  const skip = new Set();
  const areas = [];
  let chosen = choose(skip);
  // Za vyřazené se vybere další v pořadí – a i to může být odlehlé nebo čtvrť, proto znovu, dokud se výběr mění
  // (Řím na 2 dny: místo sv. Pavla za hradbami přišla Via Appia a den skončil v 18:00 po setmění za městem).
  for (let round = 0; round < 4; round++) {
    const out = chosen.filter((p) => outlier(p, chosen));
    const more = areaOf(chosen).filter((p) => !skip.has(p.id));
    if (!out.length && !more.length) break;
    for (const p of out) skip.add(p.id);
    for (const p of more) { skip.add(p.id); areas.push(p); }
    chosen = choose(skip);
  }

  const days = caps.map((c) => ({ date: c.date, cap: c.cap, items: [], kind: tripDayDates.has(c.date) ? 'daytrip' : c.cap ? 'city' : 'travel' }));
  // Po ✕ v programu (opts.keep = { id: datum }): místa, která v programu zůstala, zůstanou ve svých dnech. Nové
  // rozdělení k-means přeskládalo i to, čeho se ✕ netýkalo (Lisabon na 3 dny: po vyřazení jednoho místa zůstala ve
  // svém dni třeba jen 2 z 15). Jen místa, která do programu smějí (bez vyřazených), a dny ve městě; nesedí-li nic,
  // program se složí celý.
  const keepAt = new Map(Object.entries(opts.keep || {}));
  const cityDates = new Set(cityDays.map((c) => c.date));
  const keptList = ranked.filter((p) => cityDates.has(keepAt.get(p.id)));
  const kept = keptList.length ? new Set(keptList.map((p) => p.id)) : null;
  if (chosen.length && cityDays.length) {
    const dayOrder = cityDays.map((c) => days.find((d) => d.date === c.date)).sort((a, b) => b.cap - a.cap);
    const key = (p) => (must.has(p.id) || p.pinned ? 1 : 0);
    if (kept) {
      // Do svého dne, když tam má otevřeno a vejde se (10 % navíc jako u vyvážení níž) – nejznámější a připnuté
      // i přes to, jak je tam nechalo vyvážení (Hrad sv. Jiří v krátkém dni příletu). Uvolněný čas doplní místa
      // z okolí toho dne („Doplnění“ níž), takže den neskáče přes město; pořadí zastávek se složí znovu.
      for (const p of keptList) {
        const d = dayOrder.find((x) => x.date === keepAt.get(p.id));
        if (!shutOn(p, d.date) && (mins(d.items) + p.visitMin <= d.cap * 1.1 || key(p))) d.items.push(p);
      }
    } else {
      const k = Math.min(cityDays.length, chosen.length);
      const { assign, centers } = clusterDays(chosen, cityDays.map((c) => c.cap), center.lat);
      const clusters = Array.from({ length: k }, (_, i) => chosen.filter((_, j) => assign[j] === i));
      // Přiřazení shluků ke dnům: největší program do nejdelších dnů – a čtvrť za městem (Belém 6 km od centra Lisabonu)
      // vždy do celého dne: krátký den příletu bere jen místa do 4 km, takže by Belémská věž i Jerónimos vypadly.
      const farCl = (cl) => cl.length && haversineKm(center.lat, center.lon, centroid(cl).lat, centroid(cl).lon) > 4;
      const order = clusters.map((cl, i) => ({ cl, i, mins: cl.reduce((s, p) => s + p.visitMin, 0), far: farCl(cl) }))
        .sort((a, b) => b.far - a.far || b.mins - a.mins);
      order.forEach((o, idx) => { dayOrder[idx].items = o.cl; dayOrder[idx].center = centers[o.i]; });
    }
    // Pestrost: limity kategorií za den (3 kostely, 2 muzea…) – přebytek přesuň jinam (nebo vynech).
    for (const d of dayOrder) {
      d.items.sort((a, b) => weight(b) - weight(a));
      const seen = {};
      const keep = [];
      for (const p of d.items) {
        seen[p.category] = (seen[p.category] || 0) + 1;
        if (CAP[p.category] && seen[p.category] > CAP[p.category] && !p.pinned) {
          const target = dayOrder.find((x) => x !== d && x.items.filter((q) => q.category === p.category).length < CAP[p.category]
            && x.items.reduce((sum, q) => sum + q.visitMin, 0) + p.visitMin <= x.cap);
          if (target) target.items.push(p);
        } else keep.push(p);
      }
      d.items = keep;
    }
    // Vyvážení: co přeteče kapacitu dne, přesuň do dne s volnou kapacitou (nejbližší místo napřed). Přesouvá se od
    // nejméně významného; nejznámější a připnutá místa až nakonec. Po ✕ ne – kapacitu hlídalo už zařazení do dnů výš.
    for (const d of kept ? [] : dayOrder) {
      d.items.sort((a, b) => key(b) - key(a) || weight(b) - weight(a));
      let load = mins(d.items);
      // I poslední místo, když se do krátkého dne (přílet večer, odlet ráno) vůbec nevejde.
      while (load > d.cap * 1.1 && d.items.length) {
        const p = d.items.pop();
        const catFree = (x) => !(CAP[p.category] && x.items.filter((q) => q.category === p.category).length >= CAP[p.category]);
        const others = dayOrder.filter((x) => x !== d && catFree(x)).sort((a, b) => distToItems(a, p) - distToItems(b, p));
        let target = others.find((x) => mins(x.items) + p.visitMin <= x.cap);
        // nikde volno: významnější místo (zábavní park s dětmi) vytlačí z nejbližšího dne méně významná (sedmé muzeum),
        // místo aby vypadlo samo
        if (!target) {
          target = others.find((x) => {
            const weaker = x.items.filter((q) => !key(q) && weight(q) < weight(p)).sort((m, n) => weight(m) - weight(n));
            let room = x.cap - mins(x.items);
            const out = [];
            for (const q of weaker) { if (room >= p.visitMin) break; out.push(q); room += q.visitMin; }
            if (room < p.visitMin) return false;
            x.items = x.items.filter((q) => !out.includes(q));
            return true;
          });
        }
        if (target) target.items.push(p);
        else if (key(p)) { d.items.push(p); break; } // nejznámější zůstane – den přes kapacitu ořízne časový rozpočet níž
        load -= p.visitMin;
      }
    }
    // Výměny mezi dny: když místo A (den 1) leží blíž středu dne 2 a místo B (den 2) blíž středu
    // dne 1, prohoď je (pokud to sedí s kapacitou a limity kategorií). Odstraní „skoky přes město“.
    // Po ✕ ne – místa zůstanou ve dnech, ve kterých je uživatel viděl.
    if (!kept) improveDays(dayOrder, CAP);
    // Krátké dny (přílet/odlet): jen místa do 4 km od ubytování – vzdálenější přesuň jinam, nebo vynech. Nejznámější
    // místo se nevynechá: nemá-li celý den nic do 3 km, jde do celého dne s volným časem, který mu je nejblíž.
    for (const d of dayOrder.filter((x) => x.cap < full * 0.7)) {
      for (const p of d.items.filter((q) => haversineKm(center.lat, center.lon, q.lat, q.lon) > 4)) {
        d.items = d.items.filter((q) => q !== p);
        const fits = (x) => x !== d && x.cap >= full * 0.7 && mins(x.items) + p.visitMin <= x.cap * 1.1
          && !(CAP[p.category] && x.items.filter((q) => q.category === p.category).length >= CAP[p.category]);
        const near3 = dayOrder.filter((x) => fits(x) && distToItems(x, p) <= 3);
        let target = (near3.length || !key(p) ? near3 : dayOrder.filter(fits)).sort((a, b) => distToItems(a, p) - distToItems(b, p))[0];
        // celý den bez volného času (Krkonoše: Sněžka v den příjezdu): nejbližší celý den a z něj vypadne méně významné místo
        if (!target && key(p)) {
          target = dayOrder.filter((x) => x !== d && x.cap >= full * 0.7).sort((a, b) => distToItems(a, p) - distToItems(b, p))[0];
          const over = (x) => mins(x.items) + p.visitMin > x.cap * 1.1 || (CAP[p.category] && x.items.filter((q) => q.category === p.category).length >= CAP[p.category]);
          while (target && over(target)) {
            // napřed méně významná a ne nejznámější, pak i nejznámější s menším významem (Szrenica ustoupí Sněžce)
            const cand = target.items.filter((q) => !q.pinned && weight(q) < weight(p)).sort((a, b) => must.has(a.id) - must.has(b.id) || weight(a) - weight(b));
            const out = cand.find((q) => mins(target.items) + p.visitMin > target.cap * 1.1 || q.category === p.category);
            if (!out) break;
            target.items = target.items.filter((q) => q !== out);
          }
          if (target && over(target)) target = null; // nic méně významného k uvolnění – místo vypadne
        }
        if (target) target.items.push(p);
      }
    }
    // Doplnění: dny s volným časem doplň dalšími místy z pořadí – ale jen z okolí toho dne
    // (do 1,5 km od jeho středu nebo 0,8 km od některé zastávky), ať den neskáče přes celé město.
    // Krátké dny (přílet/odlet) navíc jen do 3 km od ubytování.
    const inPlan = new Set(dayOrder.flatMap((d) => d.items.map((p) => p.id)));
    // jen z lepších dvou třetin pořadí, krátký den (přílet, odlet) z lepší poloviny – ráno před odletem raději volno
    // než kruhový objezd a mešita navíc (Lisabon)
    const weakOf = (share) => new Set(byWeight.slice(Math.ceil(byWeight.length * share)).filter((p) => !p.pinned).map((p) => p.id));
    const weakAll = weakOf(0.67);
    const weakShort = weakOf(0.5);
    for (const d of dayOrder) {
      let free = d.cap - d.items.reduce((sum, q) => sum + q.visitMin, 0);
      const short = d.cap < full * 0.7;
      while (free >= 20) {
        const cnt = (cat) => d.items.filter((q) => q.category === cat).length;
        const mid = d.items.length ? { lat: d.items.reduce((a, q) => a + q.lat, 0) / d.items.length, lon: d.items.reduce((a, q) => a + q.lon, 0) / d.items.length } : center;
        const local = (p) => (d.items.length ? haversineKm(mid.lat, mid.lon, p.lat, p.lon) <= 1.5 || distToItems(d, p) <= 0.8 : haversineKm(center.lat, center.lon, p.lat, p.lon) <= 3)
          && (!short || haversineKm(center.lat, center.lon, p.lat, p.lon) <= 3);
        const once = (x) => ONCE[x.category] && dayOrder.some((y) => y.items.some((q) => q.category === x.category));
        const weak = short ? weakShort : weakAll;
        const p = ranked.find((x) => !inPlan.has(x.id) && !skip.has(x.id) && !weak.has(x.id) && x.visitMin <= free * 1.1 && !(CAP[x.category] && cnt(x.category) >= CAP[x.category]) && !once(x) && local(x)
          && !shutOn(x, d.date));
        if (!p) break;
        d.items.push(p);
        inPlan.add(p.id);
        free -= p.visitMin;
      }
    }
  }
  // Stejně dlouhé dny: den s nejvýznamnějším místem (Papežský palác v Avignonu) co nejdřív, ne až poslední celý den
  // (kdyby se plán změnil, hlavní věci nepropadnou). Jen výměna programů mezi dny se stejným časem – limity sedí dál.
  // Po ✕ ne: dny zůstanou, jak je uživatel viděl.
  const topW = (items) => items.reduce((m, p) => Math.max(m, weight(p)), -Infinity);
  const byCap = new Map();
  for (const d of days.filter((x) => !kept && x.kind === 'city' && x.items.length)) byCap.set(d.cap, [...(byCap.get(d.cap) || []), d]);
  for (const g of byCap.values()) {
    if (g.length < 2) continue;
    const sets = g.map((d) => d.items).sort((a, b) => topW(b) - topW(a));
    g.forEach((d, i) => { d.items = sets[i]; }); // g je v pořadí dnů (days)
  }
  // Památka v den, kdy je zavřená: jiný den, nebo z programu ven – nejznámější a připnutá s poznámkou u dne
  // („🔒 Louvre: v úterý zavřeno“). Krátký den (přílet, odlet) jen s místy do 4 km jako výš.
  const cityList = days.filter((x) => x.kind === 'city');
  const canGo = (x, p) => x.cap >= full * 0.7 || haversineKm(center.lat, center.lon, p.lat, p.lon) <= 4;
  for (const { day, p } of closedFix(cityList, shutOn, CAP, canGo)) {
    if (p.pinned || must.has(p.id)) day.closed = [...(day.closed || []), { id: p.id, name: p.name, why: closedWhy(hoursOf.get(p.id), day.date) }];
  }
  // výlet na den, kdy je cíl otevřený (Neuschwanstein na Štědrý den ne)
  const tripUsed = new Set();
  for (const date of tripDayDates) {
    const d = days.find((x) => x.date === date);
    const p = trips.find((x) => !tripUsed.has(x.id) && !shutOn(x, date));
    if (p && d) { tripUsed.add(p.id); d.items = [{ ...p, visitMin: VISIT_MIN.daytrip }]; } else if (d) d.kind = 'city';
  }
  // Den bez programu (malé místo: v dosahu pěšky nic, krátký den příjezdu bere jen místa do 4 km) a s aspoň 2,5 h času:
  // výlet do okolí do 30 km (Nizza Monferrato → Asti 18 km), ať den není jen „volno“, když kousek je co vidět. Ne
  // čtvrť, kterou už program prochází (Řím na 12 dní: poslední den „výlet“ do Vatikánu, kde byl den 3).
  const taken = new Set([...days.flatMap((d) => d.items.map((p) => p.id)), ...areas.map((p) => p.id)]);
  for (const d of days.filter((x) => !x.items.length && x.cap >= 150)) {
    const p = pois.filter((x) => !taken.has(x.id) && !shutOn(x, d.date))
      .map((x) => ({ x, km: haversineKm(center.lat, center.lon, x.lat, x.lon) }))
      .filter((c) => c.km > 4 && c.km <= 30)
      .sort((a, b) => weight(b.x) - weight(a.x))[0]?.x;
    if (!p) continue;
    taken.add(p.id);
    Object.assign(d, { kind: 'daytrip', half: d.cap < full * 0.9, items: [{ ...p, visitMin: Math.min(d.cap, VISIT_MIN.daytrip) }] });
  }

  const speed = kids ? KIDS_WALK_KMH : WALK_KMH;
  const legs = (items) => items.map((p, i, arr) => {
    const prev = i ? arr[i - 1] : center;
    const km = walkKm(prev, p);
    const ship = boat(prev, p);
    // zavírací den a otevírací doba známé památky („zavřeno v úterý · otevřeno 9:00–18:00“)
    const note = hoursNote(hoursOf.get(p.id), opts.start, opts.end);
    return { ...p, fromPrevKm: Math.round(km * 10) / 10, fromPrevMin: Math.round((km / speed) * 60), transit: ship || km > transitKm(kids), ...(ship ? { boat: true } : {}), ...(note ? { hoursNote: note } : {}) };
  });
  const capOf = new Map(caps.map((c) => [c.date, c]));
  for (const d of days) {
    const city = d.kind === 'city' && d.items.length > 0;
    const { from, to } = capOf.get(d.date);
    // pořadí trasy; den ve městě raději končí vyhlídkou nebo náměstím a zoo nebo muzeum nezačíná před zavírací dobou
    const route = (items) => (city ? eveningOrder(center, orderRoute(center, items), { from, kids }) : orderRoute(center, items));
    let r = route(d.items);
    if (city) {
      // Časový rozpočet dne: prohlídky + chůze (nad 3 km MHD) + hodina na oběd se musí vejít do okna dne (do 20:00,
      // v den odletu do 3 h před ním; čtvrthodina rezerva). Co přeteče, vypadne – nejméně významné místo, ne připnuté
      // a nejznámější, dokud jde vyhodit jiné.
      let tl = dayTimeline(r, { start: center, from, kids });
      while (tl.end > to + 15 && r.length > 1) {
        const free = r.filter((p) => !p.pinned);
        let pool = free.some((p) => !must.has(p.id)) ? free.filter((p) => !must.has(p.id)) : free;
        // po ✕ napřed místo, které do dne přibylo, ne to, které tam uživatel už viděl
        if (kept && pool.some((p) => !kept.has(p.id))) pool = pool.filter((p) => !kept.has(p.id));
        if (!pool.length) break;
        const out = pool.reduce((m, p) => (weight(p) < weight(m) ? p : m));
        r = route(r.filter((p) => p !== out));
        tl = dayTimeline(r, { start: center, from, kids });
      }
      d.items = legs(r).map((p, i) => ({ ...p, at: hm(tl.at[i]) }));
      if (tl.lunch >= 0) d.lunch = { after: tl.lunch, at: hm(tl.lunchAt) };
      d.end = hm(tl.end);
      if (rural) d.rural = true; // aplikace u delšího úseku napíše „autem / busem“ místo „MHD/taxi“
    } else d.items = legs(r);
    d.walkKm = Math.round(d.items.reduce((s, p) => s + (p.transit ? 0 : p.fromPrevKm), 0) * 10) / 10;
    d.minutes = d.items.reduce((s, p) => s + p.visitMin, 0);
    delete d.center;
  }
  addTips(days, near.map((p) => ({ ...p, visitMin: visitMinutes(p) })), areas, { weight, kids, start: center, closed: shutOn });
  const usedIds = new Set(days.flatMap((d) => d.items.map((p) => p.id)));
  return { days, spare: pois.filter((p) => !usedIds.has(p.id)).slice(0, 30), warnings };
}

/**
 * Tipy ke dnům ve městě z míst, která v programu nejsou (bez dalšího dotazu, z už načtených dat):
 *  area    – čtvrť, kterou den prochází (Alfama, Barri Gòtic), místo samostatné zastávky
 *  lunch.tip – tržnice nebo kavárna do 800 m od místa oběda (Mercat de la Boqueria, Café A Brasileira)
 *  rain    – 2 místa pod střechou do 1,5 km (muzeum, galerie, palác, velký kostel), když má den hodinu a víc venku
 *  evening – náměstí, vyhlídka, čtvrť, divadlo nebo pláž do 1,2 km od konce dne (každé jen jednou)
 *  passBy (u zastávky) – známé stavby, kolem kterých vede pěší cesta k ní
 */
export function addTips(days, pool, areas = [], { weight = (p) => p.score, kids = false, start = null, closed = () => false } = {}) {
  const used = new Set(days.flatMap((d) => d.items.map((p) => p.id)));
  const evenings = new Set(); // stejný tip na večer ne každý den (Lisabon: třikrát náměstí Figueira)
  const passed = new Set();
  const best = (list) => list.sort((a, b) => weight(b) - weight(a));
  for (const a of areas) {
    const d = days.filter((x) => x.kind === 'city')
      .map((x) => ({ x, n: x.items.filter((q) => haversineKm(a.lat, a.lon, q.lat, q.lon) <= 0.6).length }))
      .sort((p, q) => q.n - p.n)[0];
    if (!d?.n) continue;
    d.x.area = d.x.area ? `${d.x.area}, ${a.name}` : a.name;
    used.add(a.id); // čtvrť s dnem už jako tip na večer ne
  }
  for (const d of days.filter((x) => x.kind === 'city' && x.items.length)) {
    const other = new Set(days.filter((x) => x !== d).flatMap((x) => x.items.map((p) => p.id)));
    // tipy jen na místa, která jsou ten den otevřená (na déšť ne muzeum se zavíracím dnem)
    const open = (p) => !closed(p, d.date);
    if (d.lunch) {
      const at = d.items[d.lunch.after];
      const tip = best(pool.filter((p) => (p.category === 'market' || p.eatery) && !other.has(p.id) && open(p) && haversineKm(at.lat, at.lon, p.lat, p.lon) <= 0.8))[0];
      if (tip) d.lunch.tip = slim(tip, at);
    }
    const mid = centroid(d.items);
    const outside = d.items.filter((p) => OUTDOOR.has(p.category)).reduce((s, p) => s + p.visitMin, 0);
    const rain = outside >= 60 ? best(pool.filter((p) => !used.has(p.id) && indoor(p) && !(kids && p.category === 'gallery') && open(p)
      && haversineKm(mid.lat, mid.lon, p.lat, p.lon) <= 1.5)).slice(0, 2) : [];
    if (rain.length) d.rain = rain.map((p) => slim(p));
    const last = d.items.at(-1);
    const eve = best(pool.filter((p) => !used.has(p.id) && !evenings.has(p.id) && !passed.has(p.id) && EVENING_IDEA.has(p.category) && !rain.includes(p) && open(p)
      && haversineKm(last.lat, last.lon, p.lat, p.lon) <= 1.2))[0];
    if (eve) { d.evening = slim(eve, last); evenings.add(eve.id); }
    // Cestou kolem: známá stavba do 150 m od pěšího úseku (Hofburg mezi morovým sloupem a operou) – bez zastávky v programu,
    // ale ať o ní člověk ví. Každé místo jen jednou za pobyt.
    // Jen to, co stojí za zmínku: aspoň 80 % mediánu významu zastávek dne (v Dubrovníku je jinak cestou každý kostelík).
    const ws = d.items.map(weight).sort((a, b) => a - b);
    const floor = 0.8 * ws[Math.floor(ws.length / 2)];
    d.items.forEach((p, i) => {
      if (p.transit) return;
      const a = i ? d.items[i - 1] : start;
      if (!a) return;
      const by = best(pool.filter((q) => !used.has(q.id) && !passed.has(q.id) && !evenings.has(q.id) && PASS.has(q.category) && !rain.includes(q)
        && weight(q) >= floor && segKm(a, p, q) <= 0.15)).slice(0, 2);
      if (!by.length) return;
      p.passBy = by.map((q) => q.name);
      for (const q of by) passed.add(q.id);
    });
  }
  return days;
}
// Co jde vidět cestou zvenku (ne zoo, park ani pláž – tam se jde schválně)
const PASS = new Set(['church', 'monument', 'square', 'palace', 'castle', 'theatre', 'bridge', 'tower', 'sight', 'oldtown', 'market', 'museum', 'gallery', 'ruins']);
/** Vzdálenost bodu q od úsečky a–b (km, v rovině – na pár kilometrů města stačí). */
export function segKm(a, b, q) {
  const [ax, ay] = toXY(a, a.lat);
  const [bx, by] = toXY(b, a.lat);
  const [qx, qy] = toXY(q, a.lat);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / len2)) : 0;
  return Math.hypot(qx - (ax + t * dx), qy - (ay + t * dy));
}

const centroid = (items) => ({ lat: items.reduce((a, q) => a + q.lat, 0) / items.length, lon: items.reduce((a, q) => a + q.lon, 0) / items.length });
const mins = (items) => items.reduce((a, q) => a + q.visitMin, 0);

/** Lokální zlepšení rozdělení do dnů: přesuny a výměny, které zkrátí vzdálenosti ke středům dnů. */
export function improveDays(days, CAP = {}) {
  const capOk = (d, add, remove) => mins(d.items) - (remove ? remove.visitMin : 0) + add.visitMin <= d.cap * 1.1;
  const catOk = (d, add, remove) => !CAP[add.category] || d.items.filter((q) => q !== remove && q.category === add.category).length < CAP[add.category];
  for (let round = 0; round < 4; round++) {
    let changed = false;
    const cs = days.map((d) => (d.items.length ? centroid(d.items) : null));
    const dist = (p, i) => (cs[i] ? haversineKm(p.lat, p.lon, cs[i].lat, cs[i].lon) : Infinity);
    for (let i = 0; i < days.length; i++) {
      for (const a of [...days[i].items]) {
        if (days[i].items.length < 2) break;
        for (let j = 0; j < days.length; j++) {
          if (j === i || !cs[j]) continue;
          const gain = dist(a, i) - dist(a, j);
          if (gain < 0.8) continue;
          // 1) prostý přesun, když je místo
          if (capOk(days[j], a) && catOk(days[j], a)) {
            days[i].items = days[i].items.filter((q) => q !== a);
            days[j].items.push(a);
            changed = true;
            break;
          }
          // 2) výměna s místem z dne j, které se k dni i hodí víc
          const b = days[j].items
            .filter((q) => capOk(days[j], a, q) && capOk(days[i], q, a) && catOk(days[j], a, q) && catOk(days[i], q, a))
            .map((q) => ({ q, g: gain + dist(q, j) - dist(q, i) }))
            .filter((x) => x.g > 1)
            .sort((x, y) => y.g - x.g)[0];
          if (b) {
            days[i].items = [...days[i].items.filter((q) => q !== a), b.q];
            days[j].items = [...days[j].items.filter((q) => q !== b.q), a];
            changed = true;
            break;
          }
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * Památky v den, kdy jsou zavřené (isClosed(p, datum)): napřed výměna celého programu s jiným dnem, kde je všechno
 * otevřené – Vatikánská muzea a bazilika sv. Petra zůstanou v jednom dni; pak přesun místa do nejbližšího dne s volným
 * časem, nebo výměna s místem, které je otevřené i v původním dni. Co nejde nikam, z programu vypadne → [{ day, p }].
 * canGo(den, místo) = smí místo do dne (krátký den příletu jen kousek od ubytování).
 */
export function closedFix(days, isClosed, CAP = {}, canGo = () => true) {
  const bad = (items, date) => items.filter((p) => isClosed(p, date));
  const fits = (items, d) => !items.length || (mins(items) <= d.cap * 1.1 && items.every((p) => canGo(d, p)));
  for (const d of days) {
    if (!bad(d.items, d.date).length) continue;
    const x = days.filter((y) => y !== d && y.cap > 0 && !bad(d.items, y.date).length && !bad(y.items, d.date).length && fits(d.items, y) && fits(y.items, d))
      .sort((a, b) => Math.abs(a.cap - d.cap) - Math.abs(b.cap - d.cap))[0];
    if (x) [d.items, x.items] = [x.items, d.items];
  }
  const dropped = [];
  const catOk = (x, p, out) => !CAP[p.category] || x.items.filter((q) => q !== out && q.category === p.category).length < CAP[p.category];
  for (const d of days) {
    for (const p of bad(d.items, d.date)) {
      d.items = d.items.filter((q) => q !== p);
      const open = days.filter((x) => x !== d && x.cap > 0 && !isClosed(p, x.date) && canGo(x, p)).sort((a, b) => distToItems(a, p) - distToItems(b, p));
      let target = open.find((x) => catOk(x, p) && mins(x.items) + p.visitMin <= x.cap * 1.1);
      for (const x of target ? [] : open) {
        // výměna: z cílového dne místo, které je otevřené i tady a vejde se sem (nejblíž zbytku tohoto dne)
        const q = x.items.filter((y) => !y.pinned && !isClosed(y, d.date) && canGo(d, y) && catOk(x, p, y) && catOk(d, y)
          && mins(x.items) - y.visitMin + p.visitMin <= x.cap * 1.1 && mins(d.items) + y.visitMin <= d.cap * 1.1)
          .sort((a, b) => distToItems(d, a) - distToItems(d, b))[0];
        if (!q) continue;
        x.items = x.items.filter((y) => y !== q);
        d.items.push(q);
        target = x;
        break;
      }
      if (target) target.items.push(p);
      else dropped.push({ day: d, p });
    }
  }
  return dropped;
}

function distToItems(day, p) {
  if (!day.items.length) return 1e9;
  return Math.min(...day.items.map((q) => haversineKm(q.lat, q.lon, p.lat, p.lon)));
}
