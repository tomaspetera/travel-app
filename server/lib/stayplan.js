// Pobyt na víc místech: ATLAS navrhne trasu 2–4 míst (každé s vlastním ubytováním) v zemi cíle.
// Trasa začíná ve městě příletu a končí v dosahu letiště odletu – i jiného než příletu (open-jaw).
// Bez AI: města podle významu (stejné skóre z Wikidat jako cíle výletů), přejezd nejvýš ~3 h autem
// (3,5 h vlakem), z možných pořadí to s nejvyšším součtem skóre po odečtení času na cestě;
// noci podle významu místa (D'Hondtova metoda, každé místo aspoň 1 noc).
import { haversineKm, normalize } from './geo.js';
import { getAirport, destInfo, airportLabel, COUNTRY_BY_ISO } from './airports.js';
import { findTowns, mockTowns } from './poi.js';
import { geocode } from './places.js';

export const MAX_BASES = 6; // ručně sestavená trasa; návrh dává nejvýš 4 místa
export const TRANSFER_MAX = { car: 180, transit: 210 }; // nejdelší běžný přejezd (min)
const GAP_KM = 50; // blíž než tohle = jednodenní výlet z předchozího místa, ne další ubytování

export class StayPlanError extends Error {
  constructor(msg) {
    super(msg);
    this.status = 400;
  }
}

/**
 * Odhad přejezdu (delší úseky po dálnici a rychlíkem než u výletů – proto jiné tempo než v roadtrip.js):
 * autem silnice ≈ 1,2 × vzdušná, průměr 55 km/h (krátký úsek) až 100 km/h (od 200 km) + 10 min;
 * vlakem/busem 25 min na nádraží a čekání + ~90 km/h vzdušnou čarou, nad 100 km přestup (+15 min).
 * Praha–Brno: autem ~2 h 20 min, vlakem ~2 h 40 min; Milán–Florencie autem ~3 h 10 min.
 */
export function transferEstimate(a, b) {
  const air = haversineKm(a.lat, a.lon, b.lat, b.lon);
  if (air < 1) return { km: Math.round(air), carMin: 0, transitMin: 0 };
  const km = Math.round(air * 1.2);
  const speed = 55 + 45 * Math.min(1, km / 200);
  return { km, carMin: Math.round((km / speed) * 60 + 10), transitMin: Math.round(25 + air * 0.65 + (air > 100 ? 15 : 0)) };
}

// Odkazy do Google Map podle názvu (letiště podle kódu, město se zemí, je-li známá).
const placeQ = (p) => (p.iata ? `${p.iata} airport` : [p.name, p.country].filter(Boolean).join(', '));
const gmDir = (a, b, mode) => `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: placeQ(a), destination: placeQ(b), travelmode: mode })}`;
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const minOf = (e, tr) => (tr === 'transit' ? e.transitMin : e.carMin);

/** Přejezd a → b: km, čas autem i vlakem, odkazy na trasu; long = delší než běžný přejezd zvolenou dopravou. */
export function transfer(a, b, transport = 'car') {
  const e = transferEstimate(a, b);
  return { ...e, long: minOf(e, transport) > TRANSFER_MAX[transport], carUrl: gmDir(a, b, 'driving'), transitUrl: gmDir(a, b, 'transit') };
}

/** Kolik míst navrhnout podle délky pobytu (každé místo aspoň 1 noc, delší pobyt víc míst). */
export const defaultCount = (nights) => (nights < 2 ? 1 : nights <= 4 ? 2 : nights <= 8 ? 3 : 4);

/**
 * Rozdělení nocí podle váhy (D'Hondt): každé místo 1 noc, další noci postupně tomu s nejvyšší
 * váhou / počtem nocí. Součet vždy sedí, důležitější místo nemá méně nocí než méně důležité.
 */
export function splitNights(total, weights) {
  const n = Math.min(weights.length, Math.max(0, Math.round(total)));
  const w = weights.slice(0, n).map((x) => (Number.isFinite(x) && x > 0 ? x : 1));
  const out = w.map(() => 1);
  for (let left = Math.round(total) - n; left > 0; left--) {
    let best = 0;
    for (let i = 1; i < n; i++) if (w[i] / out[i] > w[best] / out[best]) best = i;
    out[best]++;
  }
  return out;
}
// Váha místa pro noci: skóre nad 40 na druhou (město s dvojnásobným náskokem má ~4× větší váhu).
const nightWeight = (score) => Math.max(5, (Number(score) || 0) - 40) ** 2;

/** Proč místo stojí za přespání (krátce, česky). */
function reasonOf(b) {
  const n = b.sights || 0;
  return [
    b.anchor === 'arrival' ? 'město příletu' : b.anchor === 'departure' ? 'u letiště odletu' : null,
    b.unesco ? 'památka UNESCO' : b.unescoPart ? 'část památky UNESCO' : null,
    b.spa ? 'lázně' : null,
    n >= 2 ? `${n} ${n >= 5 ? 'významných památek' : 'významné památky'}` : null,
  ].filter(Boolean).join(' · ');
}

const round5 = (x) => Math.round(x * 1e5) / 1e5;
const baseOut = (b, nights) => ({
  // „Alcobaça (Portugalsko)“ → „Alcobaça“ (rozlišení z Wikidat do trasy nepatří)
  id: String(b.id), name: String(b.name).replace(/ \([^)]*\)$/, ''), nameEn: b.nameEn ? String(b.nameEn).slice(0, 80) : '', lat: round5(b.lat), lon: round5(b.lon), cc: b.cc || '', country: b.country || '',
  ...(nights != null ? { nights } : {}), score: Math.round(b.score), anchor: b.anchor || null, reason: reasonOf(b),
  highlights: (b.highlights || []).slice(0, 3), extract: b.extract ? String(b.extract).slice(0, 280) : '', image: b.image || null, url: b.url || null,
});

/**
 * Návrh trasy z kandidátů (města se skóre a polohou).
 * opts: { arrival: město příletu { id, name, lat, lon, cc, country }, departureCity: město u letiště odletu
 *         (open-jaw) nebo null, depAirport: { iata, lat, lon } nebo null (let jen tam), nights,
 *         transport: 'car'|'transit', count (2–4, jinak podle nocí), exclude: [id] }
 * → { bases: [{ …, nights }], spare: [kandidáti navíc], notes: [] }
 */
export function suggestRoute(candidates, opts) {
  const tr = opts.transport === 'transit' ? 'transit' : 'car';
  const mins = (a, b) => minOf(transferEstimate(a, b), tr);
  const nights = Math.max(0, Math.round(opts.nights || 0));
  const want = Math.min(4, nights, Math.max(1, Math.round(opts.count || defaultCount(nights))));
  const exclude = new Set((opts.exclude || []).map(String));
  const far = (p, q) => haversineKm(p.lat, p.lon, q.lat, q.lon) >= GAP_KM;
  const valid = candidates.filter((c) => c && Number.isFinite(c.lat) && Number.isFinite(c.lon) && Number.isFinite(c.score) && !exclude.has(String(c.id)));
  // Město příletu a odletu skóre z Wikidat nemají (jsou to výchozí body hledání) – jsou to ale
  // cíle, kam člověk letí, takže patří k nejvýznamnějším.
  const top = Math.max(60, ...valid.map((c) => c.score));
  const A = { ...opts.arrival, score: opts.arrival.score ?? top + 5, anchor: 'arrival' };
  const dc = opts.departureCity;
  const D = dc && far(dc, A) && !exclude.has(String(dc.id)) ? { ...dc, score: dc.score ?? top, anchor: 'departure' } : null;
  // Kandidáti: nejlepší města, bez duplicit do 15 km a bez míst u města příletu/odletu.
  const pool = [];
  for (const c of [...valid].sort((a, b) => b.score - a.score)) {
    if (pool.length >= 14) break;
    if (!far(c, A) || (D && !far(c, D)) || pool.some((p) => haversineKm(p.lat, p.lon, c.lat, c.lon) < 15)) continue;
    pool.push(c);
  }
  if (D) pool.push(D);
  const dep = opts.depAirport || null;
  // Hodnota trasy: součet skóre míst minus čas přejezdů (12 min ≈ 1 bod); v den odletu je
  // cesta na letiště nad hodinu na úkor času před odletem, proto se počítá víc.
  const value = (seq) => seq.reduce((s, b) => s + b.score, 0)
    - 0.08 * seq.slice(1).reduce((s, b, i) => s + mins(seq[i], b), 0)
    - (dep ? 0.12 * Math.max(0, mins(seq.at(-1), dep) - 60) : 0);
  // Všechna pořadí k míst (A první, každý přejezd do limitu, poslední v dosahu letiště odletu).
  const search = (k, limit) => {
    let best = null;
    const seq = [A];
    const rec = () => {
      const last = seq.at(-1);
      if (seq.length === k) {
        if (dep && mins(last, dep) > limit) return;
        const v = value(seq);
        if (!best || v > best.v + 1e-9) best = { v, seq: [...seq] };
        return;
      }
      for (const c of pool) {
        if (seq.includes(c) || seq.some((s) => !far(s, c)) || mins(last, c) > limit) continue;
        seq.push(c);
        rec();
        seq.pop();
      }
    };
    rec();
    return best && best.seq;
  };
  const notes = [];
  let seq = null;
  // Nejdřív běžné přejezdy (i za cenu méně míst), pak delší; když ani tak trasa k vzdálenému
  // letišti odletu nevede, aspoň nejlepší možná (dlouhé úseky označí evaluateRoute).
  for (const limit of [TRANSFER_MAX[tr], Math.round(TRANSFER_MAX[tr] * 1.4), Infinity]) {
    for (let k = want; k >= 2 && !seq; k--) seq = search(k, limit);
    if (seq) break; // u delšího přejezdu upozorní evaluateRoute
  }
  if (want < 2) notes.push('Na jednu noc není co rozdělit – zůstaň na jednom místě.');
  else if (!seq) notes.push('V dosahu jsem nenašel další vhodné místo na přespání – přidej místo ručně, nebo zůstaň na jednom místě.');
  else if (seq.length < want) notes.push(`Na ${want} místa jsem v rozumné vzdálenosti nenašel dost vhodných měst – navrhuji ${seq.length}.`);
  const route = seq || [A];
  const split = splitNights(nights, route.map((b) => nightWeight(b.score)));
  const used = new Set(route);
  return {
    bases: route.map((b, i) => baseOut(b, split[i] ?? 1)),
    spare: pool.filter((c) => !used.has(c)).slice(0, 8).map((c) => baseOut(c)),
    notes,
  };
}

/** Přejezdy mezi místy a z/na letiště + upozornění na dlouhé úseky. */
export function evaluateRoute(bases, { arrival = null, departure = null, transport = 'car' } = {}) {
  const tr = transport === 'transit' ? 'transit' : 'car';
  const transfers = bases.slice(1).map((b, i) => transfer(bases[i], b, tr));
  const legs = {
    arrival: arrival && bases.length ? transfer(arrival, bases[0], tr) : null,
    departure: departure && bases.length ? transfer(bases.at(-1), departure, tr) : null,
  };
  const notes = [];
  transfers.forEach((x, i) => {
    if (x.long) notes.push(`Přejezd ${bases[i].name} → ${bases[i + 1].name} trvá ~${hm(minOf(x, tr))} – na jeden přesun je to hodně, zvaž místo mezi nimi nebo ${tr === 'car' ? 'vlak' : 'auto'}.`);
  });
  if (legs.departure?.long) notes.push(`Z posledního místa (${bases.at(-1).name}) na letiště ${departure.iata} je to ~${hm(minOf(legs.departure, tr))} – v den odletu vyraz včas, nebo poslední noc stráv blíž letišti.`);
  return { transport: tr, transfers, legs, notes };
}

const num = (v) => (v === '' || v == null ? NaN : Number(v));
const validPos = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
const airportOut = (ap) => ({ iata: ap.iata, name: airportLabel(ap.iata), lat: ap.lat, lon: ap.lon });

/** Město u letiště: střed metropole z databáze, jinak geokódovaný střed města (nebo poloha letiště). */
async function anchorCity(ap, hint, { mock, geo }) {
  const info = destInfo(ap.iata);
  const base = { id: `city:${info.key}`, name: info.label, cc: info.cc, country: info.country, lat: info.lat, lon: info.lon };
  // Střed města, který už zná prohlížeč (geokódovaný v programu cesty) – jen když leží u letiště.
  const lat = num(hint?.lat);
  const lon = num(hint?.lon);
  if (validPos(lat, lon) && haversineKm(lat, lon, ap.lat, ap.lon) < 80) return { ...base, lat, lon };
  if (info.id.startsWith('metro:') || mock) return base;
  try {
    const g = (await geo(info.label)).find((x) => String(x.cc || '').toUpperCase() === info.cc && haversineKm(x.lat, x.lon, ap.lat, ap.lon) < 60);
    if (g) return { ...base, lat: g.lat, lon: g.lon };
  } catch { /* poloha letiště */ }
  return base;
}

/**
 * POST /api/stayplan. Dva režimy:
 *  • návrh: { arrival: IATA, departure: IATA|null, nights, transport, count?, exclude?, city?: { lat, lon } }
 *  • přepočet upravené trasy: { arrival, departure, transport, bases: [{ name, lat, lon, cc }] } – bez Wikidat
 * deps (testy): { mock, towns, demoTowns, geo }
 */
export async function planStay(raw, { mock = false, towns = findTowns, demoTowns = mockTowns, geo = geocode } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new StayPlanError('Neplatný požadavek.');
  const arrAp = getAirport(raw.arrival);
  if (!arrAp) throw new StayPlanError('Neznámé letiště příletu.');
  const depAp = raw.departure ? getAirport(raw.departure) : null;
  if (raw.departure && !depAp) throw new StayPlanError('Neznámé letiště odletu.');
  const transport = raw.transport === 'transit' ? 'transit' : 'car';
  const arrival = airportOut(arrAp);
  const departure = depAp ? airportOut(depAp) : null;

  if (raw.bases !== undefined) {
    if (!Array.isArray(raw.bases) || raw.bases.length < 1 || raw.bases.length > MAX_BASES) throw new StayPlanError('Neplatná místa trasy.');
    const bases = raw.bases.map((b) => {
      const lat = num(b?.lat);
      const lon = num(b?.lon);
      const name = typeof b?.name === 'string' ? b.name.trim().slice(0, 80) : '';
      if (!name || !validPos(lat, lon)) throw new StayPlanError('Neplatná místa trasy.');
      const cc = /^[A-Z]{2}$/.test(b.cc || '') ? b.cc : '';
      return { name, lat, lon, cc, country: cc ? COUNTRY_BY_ISO.get(cc)?.cs || '' : '' };
    });
    return { mode: 'evaluate', arrival, departure, ...evaluateRoute(bases, { arrival, departure, transport }) };
  }

  const nights = num(raw.nights);
  if (!Number.isInteger(nights) || nights < 1 || nights > 30) throw new StayPlanError('Počet nocí musí být 1 až 30.');
  const count = raw.count == null || raw.count === '' ? null : Math.min(4, Math.max(2, Math.round(num(raw.count) || 2)));
  const exclude = Array.isArray(raw.exclude) ? raw.exclude.filter((x) => typeof x === 'string').slice(0, 50) : [];
  const city = await anchorCity(arrAp, raw.city, { mock, geo });
  const depCity = depAp ? await anchorCity(depAp, null, { mock, geo }) : null;
  const sameCity = !depCity || haversineKm(city.lat, city.lon, depCity.lat, depCity.lon) < GAP_KM;
  // Kde hledat města: okolí města příletu a odletu (dotaz má okruh ~120 km) a u vzdáleného
  // letiště odletu i body mezi nimi – nejvýš 5 dotazů, každý v mezipaměti týden.
  const points = [city];
  if (!sameCity) {
    const d = haversineKm(city.lat, city.lon, depCity.lat, depCity.lon);
    if (d > 60) points.push(depCity);
    const extra = Math.min(3, Math.max(0, Math.ceil(d / 220) - 1));
    for (let i = 1; i <= extra; i++) {
      const f = i / (extra + 1);
      points.push({ lat: Math.round((city.lat + (depCity.lat - city.lat) * f) * 10) / 10, lon: Math.round((city.lon + (depCity.lon - city.lon) * f) * 10) / 10 });
    }
  }
  let failed = 0;
  const lists = await Promise.all(points.map((p) => (mock ? demoTowns({ lat: p.lat, lon: p.lon }) : towns({ lat: p.lat, lon: p.lon }).catch((e) => {
    failed++;
    console.warn(`stayplan: ${e.message}`);
    return null;
  }))));
  if (failed === points.length) throw Object.assign(new Error('Wikidata neodpovídá'), { status: 503 });
  // Sloučení okolí víc bodů: každé místo jednou (i stejný název jen jednou – dvě „Santa Maria“
  // v jedné trase by mátly, i odkazy do Google Map hledají podle názvu).
  const seen = new Set();
  const cands = lists.flat().filter((c) => {
    const k = c && normalize(c.name);
    if (!c || seen.has(c.id) || seen.has(k)) return false;
    seen.add(c.id).add(k);
    return true;
  });
  const plan = suggestRoute(cands, {
    arrival: city, departureCity: sameCity ? null : depCity, depAirport: departure, nights, transport, count, exclude,
  });
  const ev = evaluateRoute(plan.bases, { arrival, departure, transport });
  const degraded = failed > 0 || lists.some((l) => l && l.degraded);
  // Upozornit jen, když okolí některého bodu chybí úplně (bez UNESCO je návrh jen o něco slabší).
  return {
    mode: 'suggest', transport, nights, want: count || defaultCount(nights), count: plan.bases.length, arrival, departure,
    openJaw: Boolean(depAp) && depAp.iata !== arrAp.iata,
    bases: plan.bases, transfers: ev.transfers, legs: ev.legs, candidates: plan.spare,
    notes: [...plan.notes, ...ev.notes, ...(failed ? ['Část dat z Wikidat se nenačetla – návrh může být chudší, zkus ho za chvíli zopakovat.'] : [])],
    degraded,
  };
}
