// „Je to dobrá cena?“ – statistika cen z jednoho hledání a odhad, zda je cena nízká / běžná / vysoká.
// Porovnává se cena letenek na osobu (flightCzk, tam i zpět dohromady), bez dopravy na letiště a zavazadel –
// ty závisí na nastavení hledání, ne na trhu. Stejná pravidla má prohlížeč (public/js/pricecheck.js levelOf)
// pro cesty složené ze dvou samostatných letenek – při změně uprav obě místa (test/pricecheck.test.js je hlídá).

/** Orientační „běžná“ cena jednosměrné letenky podle vzdálenosti (Kč/os.) pro skóre výhodnosti. */
export function referencePrice(km) {
  return km < 3000 ? 600 + 1.35 * km : 4650 + 1.6 * (km - 3000);
}

/** Běžná cena letenky na vzdálenost cesty (Kč/os., zpáteční ≈ 1,9× jednosměrná). */
export const refOf = (trip) => Math.round(referencePrice(trip.distanceKm || 0) * (trip.back ? 1.9 : 1));

// Pod tolika nabídkami k porovnání se odhad řídí jen průměrnou cenou na vzdálenost.
export const SMALL_N = 5;

/** Kvantil seřazeného pole (lineární interpolace), zaokrouhlený na Kč. */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

/**
 * Statistika cen letenek z nabídek jednoho cíle (nebo celé trasy): entries = [{ czk, date, from }].
 * → { n, min, p25, median, p75, max, dateFrom, dateTo, mins } nebo null; mins = [[letiště odletu, 'YYYY-MM',
 * nejlevnější letenka]] pro paměť cen v prohlížeči.
 */
export function priceStats(entries) {
  const list = (entries || []).filter((e) => e.czk > 0);
  if (!list.length) return null;
  const sorted = list.map((e) => e.czk).sort((a, b) => a - b);
  const dates = list.map((e) => e.date).sort();
  const mins = new Map();
  for (const e of list) {
    const k = `${e.from}|${e.date.slice(0, 7)}`;
    if (!mins.has(k) || e.czk < mins.get(k)) mins.set(k, e.czk);
  }
  return {
    n: sorted.length,
    min: sorted[0],
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    max: sorted.at(-1),
    dateFrom: dates[0],
    dateTo: dates.at(-1),
    mins: [...mins].map(([k, czk]) => [...k.split('|'), Math.round(czk)]),
  };
}

/** Pozice ceny mezi ostatními nabídkami: 0 = nejlevnější, 100 = nejdražší (shodné ceny napůl). */
export function positionIn(sorted, czk) {
  const n = sorted.length;
  if (n < 2) return null;
  let less = 0;
  let same = 0;
  for (const x of sorted) {
    if (x < czk) less++;
    else if (x === czk) same++;
  }
  // sama nabídka je v seznamu jednou – mezi „ostatní“ nepatří; 0 a 100 jen bez levnější / dražší nabídky
  const others = n - 1;
  const more = others - less - Math.max(0, same - 1);
  const pos = Math.round(((less + Math.max(0, same - 1) / 2) / others) * 100);
  return Math.min(more > 0 ? 99 : 100, Math.max(less > 0 ? 1 : 0, pos));
}

/** Úroveň v rámci hledání podle kvantilů: dolní čtvrtina a zřetelně pod mediánem / horní čtvrtina a zřetelně nad ním. */
export function searchLevel(czk, st) {
  if (czk <= st.p25 && czk <= st.median * 0.92) return 'low';
  if (czk >= st.p75 && czk >= st.median * 1.15) return 'high';
  return 'normal';
}

/** Úroveň podle průměrné ceny na vzdálenost – stejné prahy jako 👍 Výhodné (skóre ≥ 1,7) a „drahé“ (< 0,8) v dealOf. */
export function distanceLevel(trip) {
  const score = Math.round((refOf(trip) / trip.flightCzk) * 100) / 100;
  return score >= 1.7 ? 'low' : score < 0.8 ? 'high' : 'normal';
}

const offersTxt = (n) => `${n} ${n >= 2 && n <= 4 ? 'nabídky' : 'nabídek'}`;
const kc = (n) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;

/**
 * Krátké zdůvodnění podle průměrné ceny na vzdálenost (dist = distanceLevel, vsRef v %). „Běžná“ cena bývá
 * i hodně pod průměrem (nízkonákladovky) – text proto řekne, odkud začíná výhodná / dražší než obvykle.
 */
export function distanceText(dist, vsRef) {
  if (dist === 'low') return `o ${-vsRef} % pod průměrnou cenou na tuto vzdálenost`;
  if (dist === 'high') return `o ${vsRef} % nad průměrnou cenou na tuto vzdálenost`;
  if (vsRef <= -5) return `o ${-vsRef} % pod průměrnou cenou na tuto vzdálenost – výhodná bývá až od ~40 %`;
  if (vsRef >= 5) return `o ${vsRef} % nad průměrnou cenou na tuto vzdálenost – ještě v normě`;
  return 'kolem průměrné ceny na tuto vzdálenost';
}

/**
 * Úroveň ceny z obou měřítek (bez textů) – sdílené pravidlo se stejnojmennou funkcí v prohlížeči.
 * → [level, basis]: hledání s aspoň SMALL_N nabídkami rozhoduje kvantily; když si s průměrnou cenou na vzdálenost
 * odporuje, je to „běžná“ (mixed). Obvyklá cena v hledání + levná/drahá na vzdálenost platí jen na správné
 * straně mediánu (dražší než polovina nabídek není „dobrá cena“). Méně nabídek: jen průměrná cena na vzdálenost.
 */
export function levelOf(trip, stats) {
  const dist = distanceLevel(trip);
  if (!stats || stats.n < SMALL_N) return [dist, 'distance'];
  const czk = trip.flightCzk;
  const sl = searchLevel(czk, stats);
  if (sl !== 'normal') return dist !== 'normal' && dist !== sl ? ['normal', 'mixed'] : [sl, 'search'];
  if (dist === 'low' && czk <= stats.median) return ['low', 'distance'];
  if (dist === 'high' && czk >= stats.median) return ['high', 'distance'];
  return ['normal', 'search'];
}

/**
 * Je to dobrá cena? → { level: 'low' | 'normal' | 'high', basis: 'search' | 'distance' | 'mixed', reason, ref, vsRef, pos, n }.
 * ref = průměrná cena na vzdálenost (Kč/os.), vsRef = o kolik % je letenka dražší (+) / levnější (−) než ref,
 * pos = pozice mezi ostatními nabídkami hledání (0 nejlevnější … 100 nejdražší; sorted = seřazené ceny), n = počet nabídek.
 */
export function priceLevelOf(trip, stats, sorted = null) {
  const czk = trip.flightCzk;
  const ref = refOf(trip);
  const vsRef = Math.round((czk / ref - 1) * 100);
  const n = stats ? stats.n : 0;
  const pos = sorted ? positionIn(sorted, czk) : null;
  const [level, basis] = levelOf(trip, stats);
  const distTxt = distanceText(distanceLevel(trip), vsRef);
  let reason;
  if (n < SMALL_N) reason = `${distTxt} (${n <= 1 ? 'jiné nabídky k porovnání nejsou' : `k porovnání jen ${offersTxt(n)}`})`;
  else if (basis === 'mixed') reason = czk <= stats.median ? 'levná v tomto hledání, ale nad průměrnou cenou na tuto vzdálenost' : 'hluboko pod průměrem na tuto vzdálenost, v hledání jsou ale levnější nabídky';
  else if (basis === 'distance') reason = distTxt;
  else if (level === 'low') reason = pos === 0 ? 'nejlevnější nabídka v tomto hledání' : `levnější než ${100 - (pos ?? 25)} % nabídek v tomto hledání`;
  else if (level === 'high') reason = pos === 100 ? 'nejdražší nabídka v tomto hledání' : `dráž než ${pos ?? 75} % nabídek v tomto hledání`;
  else reason = `kolem obvyklé ceny v tomto hledání (polovina nabídek do ${kc(stats.median)})`;
  return { level, basis, reason, ref, vsRef, pos, n };
}
