// Našeptávač míst a převod výběru uživatele na seznam letišť.
//
// ID návrhu:
//   ap:VIE            konkrétní letiště
//   metro:LON         metropolitní oblast (všechna letiště)
//   cc:CZ             země
//   rg:kanary         turistický region / souostroví
//   ct:asia           světadíl / oblast (Asie, Afrika, Blízký východ…) – cíl jako seznam zemí
//   geo:LAT,LON|Název libovolné místo (geokódované z vlastního seznamu míst GeoNames, data/places.json)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AIRPORTS, COUNTRIES, COUNTRY_BY_ISO, METRO_BY_CODE, airportsInCountry, airportsNear, getAirport, sizePenaltyKm,
} from './airports.js';
import { CITIES, COUNTRY_ALIASES, EXONYMS, NATURE, REGIONS } from './names.js';
import { CONTINENTS, CONTINENT_BY_KEY, continentCountries } from './longhaul.js';
import { haversineKm, normalize } from './geo.js';
import { airportAccess } from './access.js';
import { cache } from './cache.js';
import { config } from '../config.js';
import { mapyOn, mapySuggest } from './mapy.js';

const flag = (cc) =>
  cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';

function matchScore(q, text) {
  const t = normalize(text);
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  // slovo uvnitř názvu až od 4 znaků („Ost“ ≠ Kanárské ostrovy, „Pra“ ≠ Luang Prabang)
  if (q.length >= 4 && t.split(' ').some((w) => w.startsWith(q))) return 60;
  if (q.length >= 4 && t.includes(q)) return 30;
  return 0;
}

/** Počet překlepů mezi řetězci (záměna, vložení, vynechání, přehozená sousední písmena); nad max vrací max + 1. */
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let pp = null, p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (pp && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1);
      c[j] = v;
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    pp = p; p = c;
  }
  return p[b.length];
}

/** Liší se řetězce nejvýš jedním písmenem (záměna, vložení, vynechání)? */
function lev1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

// ---- pořadí v našeptávači: shoda názvu + velikost místa − vzdálenost od domova ----
// velikost 0–20 bodů: letiště podle cestujících za rok (tisíce), město podle obyvatel; vzdálenost 0–15 bodů
const paxBonus = (k) => (k > 0 ? Math.min(20, Math.max(0, 5 * Math.log10(k / 30))) : 0);
const apBonus = (a) => (a.pax != null ? paxBonus(a.pax) : a.type === 'L' ? 6 : a.type === 'M' ? 3 : 0);
const popBonus = (pop) => (pop > 0 ? Math.min(16, Math.max(0, 5 * Math.log10(pop / 10000))) : 0);
const metroBonus = (m) => paxBonus(m.airports.reduce((s, c) => s + (getAirport(c)?.pax || 0), 0)) + 2;
const distPenalty = (home, lat, lon) =>
  (home && Number.isFinite(lat) && Number.isFinite(lon) ? Math.min(15, 5 * Math.log2(1 + haversineKm(home.lat, home.lon, lat, lon) / 400)) : 0);
const CZ_CENTER = { lat: 49.8, lon: 15.5 }; // bez domova: ATLAS je česká aplikace
const COUNTRY_POINT = new Map(); // poloha země pro pořadí = její největší letiště
for (const a of AIRPORTS.values()) { const p = COUNTRY_POINT.get(a.cc); if (!p || (a.pax || 0) > (p.pax || 0)) COUNTRY_POINT.set(a.cc, a); }

/** Domov pro pořadí návrhů podle ID místa (ap:/metro:/geo:/cc:); jinak střed Česka. */
export function homePoint(id) {
  const s = String(id || '');
  if (s.startsWith('cc:')) { const p = COUNTRY_POINT.get(s.slice(3).toUpperCase()); return p ? { lat: p.lat, lon: p.lon } : CZ_CENTER; }
  const d = /^(ap|metro|geo):/.test(s) ? describe(s) : null;
  return d && Number.isFinite(d.lat) ? { lat: d.lat, lon: d.lon } : CZ_CENTER;
}

/** Letiště, která zastupují město jako cíl: vlastní (do 30 km) první, pak blízká s víc cestujícími; bez malých. */
export function cityAirports(lat, lon, km = 130, n = 4) {
  const eff = (a) => (a.distKm < 30 ? a.distKm - 1000 : a.distKm + sizePenaltyKm(a));
  return airportsNear(lat, lon, km).sort((x, y) => eff(x) - eff(y)).slice(0, n);
}

function countrySuggestion(c) {
  const n = airportsInCountry(c.iso2).length;
  return {
    id: `cc:${c.iso2}`, type: 'country', label: c.cs, ...(c.en && c.en !== c.cs ? { en: c.en } : {}), flag: flag(c.iso2),
    sub: `celá země · ${n} ${n === 1 ? 'letiště' : n < 5 ? 'letiště' : 'letišť'}`, cc: c.iso2,
  };
}

function airportSuggestion(a) {
  return {
    id: `ap:${a.iata}`, type: 'airport', label: a.cityCs, ...(a.city && a.city !== a.cityCs ? { en: a.city } : {}), flag: flag(a.cc), iata: a.iata,
    sub: `${a.name} · ${a.iata} · ${a.country}`, cc: a.cc, lat: a.lat, lon: a.lon,
    // velké letiště (≥ 2 mil. cestujících za rok, bez údaje podle typu) – plánovač podle něj pozná hlavní město jména
    big: a.pax != null ? a.pax >= 2000 : a.type === 'L',
    // cestujících za rok v tisících (null = údaj chybí) – když jedno letiště jména jasně převyšuje ostatní
    size: a.pax ?? null,
  };
}

function metroSuggestion(m) {
  return {
    id: `metro:${m.code}`, type: 'metro', label: m.cs, ...(m.en && m.en !== m.cs ? { en: m.en } : {}), flag: flag(m.cc),
    sub: `všechna letiště: ${m.airports.join(', ')}`, cc: m.cc, lat: m.lat, lon: m.lon,
  };
}

/** Město jako celek: geo: ID ze středu města → hledání z okruhu (Odkud) / z blízkých letišť (Kam). */
function citySuggestion(c, region = '') {
  const aps = cityAirports(c.lat, c.lon).map((a) => a.iata);
  return {
    id: `geo:${c.lat.toFixed(4)},${c.lon.toFixed(4)}|${c.cs}`, type: 'city', label: c.cs, ...(c.en && c.en !== c.cs ? { en: c.en } : {}), flag: flag(c.cc), cc: c.cc,
    lat: c.lat, lon: c.lon, pop: c.pop || 0,
    sub: `${region ? `${region} · ` : ''}${aps.length ? `letiště v okolí: ${aps.join(', ')}` : 'město'}`,
  };
}

function continentSuggestion(c) {
  return { id: `ct:${c.key}`, type: 'continent', label: c.cs, flag: c.flag, sub: `celý světadíl · ${continentCountries(c.key).length} zemí` };
}

function regionSuggestion(r) {
  return { id: `rg:${r.key}`, type: 'region', label: r.cs, flag: r.flag || '🏝️', sub: `region · ${r.airports.join(', ')}`, aliases: r.aliases };
}

const NATURE_FLAG = { range: '⛰️', peak: '🏔️', park: '🏞️', cave: '🕳️', rocks: '🪨', lake: '🌊' };
/** Místo v přírodě jako geokódované místo (geo: ID) – nature = druh (Objevuj podle něj volí pěšky a okruh km). */
function natureSuggestion(n) {
  return {
    id: `geo:${n.lat.toFixed(4)},${n.lon.toFixed(4)}|${n.cs}`, type: 'place', label: n.cs, flag: NATURE_FLAG[n.kind] || '📍', cc: n.cc,
    sub: [n.sub, COUNTRY_BY_ISO.get(n.cc)?.cs].filter(Boolean).join(' · '), lat: n.lat, lon: n.lon, pop: 0, nature: n.kind, km: n.km,
    aliases: n.aliases || [],
  };
}

/**
 * Hory, národní parky, jeskyně a jezera (NATURE) pro Objevuj: { s: návrh, exact } – přesný název nebo jiný název / tvar
 * z věty (exact: true), od 4 znaků i začátek názvu (rozepsané „Krkon“). Přesné shody první. Pole letů ji nevolají.
 */
export function natureMatches(query) {
  const q = normalize(query);
  if (q.length < 3) return [];
  const out = [];
  for (const n of NATURE) {
    const names = [n.cs, ...(n.aliases || [])].map(normalize);
    const exact = names.includes(q);
    if (exact || (q.length >= 4 && names.some((x) => x.startsWith(q)))) out.push({ s: natureSuggestion(n), exact });
  }
  return [...out.filter((x) => x.exact), ...out.filter((x) => !x.exact)];
}

/** Kandidáti z vlastních dat: { s: návrh, m: shoda názvu (100/80/60/30), score: m + velikost − vzdálenost }. */
function localScored(query, home) {
  const q = normalize(query);
  if (!q) return [];
  const out = [];
  const push = (s, m, score, extra = {}) => m > 0 && out.push({ s, m, score, ...extra });
  // země bez letiště (Andorra, Monako) nikdy nepředběhne skutečný cíl – přesná shoda názvu ji ale ukáže
  const near = (cc) => { const p = COUNTRY_POINT.get(cc); return p ? distPenalty(home, p.lat, p.lon) : 15; };
  for (const c of COUNTRIES) {
    const sc = Math.max(matchScore(q, c.cs), matchScore(q, c.en));
    if (sc >= 60) push(countrySuggestion(c), sc, sc + (sc === 100 ? 15 : 5) - near(c.iso2));
  }
  for (const [alias, iso] of Object.entries(COUNTRY_ALIASES)) {
    const sc = matchScore(q, alias);
    const c = COUNTRY_BY_ISO.get(iso);
    if (c && sc >= 80) push(countrySuggestion(c), sc, sc + (sc === 100 ? 20 : 10) - near(iso));
  }
  for (const c of CONTINENTS) {
    const sc = Math.max(matchScore(q, c.cs), ...c.aliases.map((al) => matchScore(q, al)));
    if (sc >= 60) push(continentSuggestion(c), sc, sc + 14);
  }
  for (const r of REGIONS) {
    const sc = Math.max(matchScore(q, r.cs), ...r.aliases.map((al) => matchScore(q, al)));
    // přesně jméno jednoho z letišť oblasti („Hurghada“ v Rudém moři): napřed to letiště, celá oblast hned za ním
    const own = sc === 100 && r.airports.length > 1 && r.airports.some((c) => { const a = getAirport(c); return a && normalize(a.cityCs) === q; });
    if (sc >= 60) push(regionSuggestion(r), sc, sc + (own ? -20 : 12));
  }
  // Velká města (metropole a města domova): jejich jmenovci jinde (London v Kanadě u „Londýn“) z návrhů vypadnou.
  const bigNames = new Set();
  const metroAirports = new Set();
  for (const m of METRO_BY_CODE.values()) {
    const sc = Math.max(matchScore(q, m.cs), matchScore(q, m.en));
    if (sc < 60) continue;
    push(metroSuggestion(m), sc, sc + metroBonus(m) - distPenalty(home, m.lat, m.lon));
    bigNames.add(normalize(m.cs)).add(normalize(m.en));
    m.airports.forEach((x) => metroAirports.add(x));
  }
  // místní názvy (Roma, Wien, Lisboa…): metropole nebo letiště jako by se hledal český název; aliases = který název
  // to byl (chytré hledání pozná shodu)
  for (const [alias, id] of Object.entries(EXONYMS)) {
    const sc = matchScore(q, alias);
    if (sc < 80 || (sc < 100 && q.length < 4)) continue; // „Br“ je spíš Brno než Brussel
    if (sc < 100 && alias.includes(' ') && !q.includes(' ')) continue; // „Nový“ ještě není Nový York (Nový Zéland)
    const [kind, code] = id.split(':');
    const m = kind === 'metro' ? METRO_BY_CODE.get(code) : null, a = kind === 'ap' ? AIRPORTS.get(code) : null;
    if (m) { push({ ...metroSuggestion(m), aliases: [alias] }, sc, sc + 15 + metroBonus(m) - distPenalty(home, m.lat, m.lon)); bigNames.add(alias); m.airports.forEach((x) => metroAirports.add(x)); }
    if (a) { push({ ...airportSuggestion(a), aliases: [alias] }, sc, sc + 15 + apBonus(a) - distPenalty(home, a.lat, a.lon)); bigNames.add(alias); }
  }
  for (const c of CITIES) {
    const sc = Math.max(matchScore(q, c.cs), matchScore(q, c.en));
    if (sc < 60) continue;
    push(citySuggestion(c), sc, sc + popBonus(c.pop) + 3 - distPenalty(home, c.lat, c.lon)); // +3 = město domova
    bigNames.add(normalize(c.cs)).add(normalize(c.en));
  }
  for (const a of AIRPORTS.values()) {
    if (a.type === 'S' && q.length < 4) continue;
    const sc = Math.max(matchScore(q, a.cityCs), matchScore(q, a.city), matchScore(q, a.name) - 20);
    if (sc <= 0) continue;
    const d = distPenalty(home, a.lat, a.lon);
    const homonym = !metroAirports.has(a.iata) && (bigNames.has(normalize(a.cityCs)) || bigNames.has(normalize(a.city)))
      && !CITIES.some((c) => haversineKm(c.lat, c.lon, a.lat, a.lon) < 60);
    if (homonym && d >= 4) continue; // jmenovec daleko od domova (London v Kanadě, Bruno v USA)
    push(airportSuggestion(a), sc, sc + apBonus(a) - d - (homonym ? 30 : 0));
  }
  // Tvar víceslovného názvu („Velké Británie“, „Nového Zélandu“, „Spojených států“): slova podle kmene (společný
  // začátek délky kratšího slova bez 2 písmen, aspoň 3) – země, oblasti, metropole, města; napsaný tvar jde do aliases
  // (chytré hledání podle něj pozná shodu). Není to překlep – před opravou překlepů.
  const qw = q.split(' ');
  if (qw.length >= 2 && !out.some((c) => c.m >= 60)) {
    const wm = (a, b) => { const k = Math.max(3, Math.min(a.length, b.length) - 2); return a.length >= 3 && b.length >= 3 && a.slice(0, k) === b.slice(0, k); };
    const decl = (...names) => names.some((n) => { const tw = normalize(n).split(' '); return tw.length >= qw.length && tw.length <= qw.length + 1 && qw.every((w, i) => wm(w, tw[i])); });
    const add = (s, bonus, lat, lon) => push({ ...s, aliases: [...(s.aliases || []), q] }, 70, 70 + bonus - (lat != null ? distPenalty(home, lat, lon) : 0));
    for (const c of COUNTRIES) if (decl(c.cs, c.en)) add(countrySuggestion(c), 10);
    for (const [alias, iso] of Object.entries(COUNTRY_ALIASES)) if (COUNTRY_BY_ISO.has(iso) && decl(alias)) add(countrySuggestion(COUNTRY_BY_ISO.get(iso)), 10);
    for (const r of REGIONS) if (decl(r.cs, ...r.aliases)) add(regionSuggestion(r), 8);
    for (const c of CONTINENTS) if (decl(c.cs, ...c.aliases)) add(continentSuggestion(c), 6);
    for (const m of METRO_BY_CODE.values()) if (decl(m.cs, m.en)) add(metroSuggestion(m), Math.min(10, metroBonus(m)), m.lat, m.lon);
    for (const c of CITIES) if (decl(c.cs, c.en)) add(citySuggestion(c), Math.min(10, popBonus(c.pop) + 3), c.lat, c.lon);
    // víceslovné místní a české názvy („do Nového Yorku“, „z Frankfurtu nad Mohanem“)
    for (const [alias, id] of Object.entries(EXONYMS)) {
      if (!alias.includes(' ') || !decl(alias)) continue;
      const [kind, code] = id.split(':');
      const m = kind === 'metro' ? METRO_BY_CODE.get(code) : null, a = kind === 'ap' ? AIRPORTS.get(code) : null;
      if (m) add(metroSuggestion(m), Math.min(10, metroBonus(m)), m.lat, m.lon);
      if (a) add(airportSuggestion(a), Math.min(10, apBonus(a)), a.lat, a.lon);
    }
  }
  // Překlep („Barcleona“, „Lodnýn“, „Amstrdam“): bez jiné shody slovo od 5 znaků podobné názvu země, oblasti, velkého
  // města nebo letiště (1 překlep, od 9 znaků 2; od 6 znaků i rozepsaný začátek názvu). První písmeno musí sedět a skóre je nízké –
  // skutečné místo z geokódování (vesnice přesně toho jména) má přednost.
  if (q.length >= 5 && !out.some((c) => c.m >= 60)) {
    const k = q.length >= 9 ? 2 : 1;
    const typo = (...names) => names.some((n) => {
      const t = normalize(n);
      if (!t || t[0] !== q[0]) return false;
      return editDist(q, t, k) <= k || (q.length >= 6 && [q.length - 1, q.length, q.length + 1].some((l) => l < t.length && editDist(q, t.slice(0, l), k) <= k));
    });
    const fz = (s, bonus, lat, lon) => push({ ...s, fuzzy: true }, 62, 62 + Math.min(10, bonus) - (lat != null ? distPenalty(home, lat, lon) : 0));
    // země před svými oblastmi („Egpyt“ = Egypt, ne Rudé moře (Egypt))
    for (const c of COUNTRIES) if (typo(c.cs, c.en)) fz(countrySuggestion(c), 10);
    for (const [alias, iso] of Object.entries(COUNTRY_ALIASES)) if (COUNTRY_BY_ISO.has(iso) && typo(alias)) fz(countrySuggestion(COUNTRY_BY_ISO.get(iso)), 10);
    for (const c of CONTINENTS) if (typo(c.cs, ...c.aliases)) fz(continentSuggestion(c), 6);
    for (const r of REGIONS) if (typo(r.cs, ...r.aliases)) fz(regionSuggestion(r), 6);
    const fm = new Set();
    for (const m of METRO_BY_CODE.values()) if (typo(m.cs, m.en)) { fz(metroSuggestion(m), metroBonus(m), m.lat, m.lon); m.airports.forEach((x) => fm.add(x)); }
    for (const [alias, id] of Object.entries(EXONYMS)) {
      if (!typo(alias)) continue;
      const [kind, code] = id.split(':');
      const m = kind === 'metro' ? METRO_BY_CODE.get(code) : null, a = kind === 'ap' ? AIRPORTS.get(code) : null;
      if (m) { fz(metroSuggestion(m), metroBonus(m), m.lat, m.lon); m.airports.forEach((x) => fm.add(x)); }
      if (a) fz(airportSuggestion(a), apBonus(a), a.lat, a.lon);
    }
    for (const c of CITIES) if (typo(c.cs, c.en)) fz(citySuggestion(c), popBonus(c.pop) + 3, c.lat, c.lon);
    for (const a of AIRPORTS.values()) {
      if (fm.has(a.iata) || !(a.pax != null ? a.pax >= 300 : a.type !== 'S') || !typo(a.cityCs, a.city)) continue;
      fz(airportSuggestion(a), apBonus(a), a.lat, a.lon);
    }
  }
  if (q.length === 3) {
    // Kód letiště: „STN“ (velkými) první, pokud to není i přesný název (USA = země, ne letiště Concord);
    // „Pra“, „Bra“, „Ost“ psané normálně je spíš začátek názvu města než kód (PRA = Paraná, OST = Ostende).
    const a = getAirport(q);
    const raw = String(query).trim();
    const upper = raw === raw.toUpperCase();
    const m = upper ? (out.some((c) => c.m === 100) ? 95 : 120) : 78;
    const as = a ? m + apBonus(a) - distPenalty(home, a.lat, a.lon) : null;
    if (a) push(airportSuggestion(a), m, as, { code: true });
    // kód metropole (NYC, LON, TYO): hned za letištěm se stejným kódem (BCN = letiště, pak celá Barcelona)
    const mc = METRO_BY_CODE.get(q.toUpperCase());
    if (mc) push(metroSuggestion(mc), m, a ? as - 0.5 : m + metroBonus(mc) - distPenalty(home, mc.lat, mc.lon), { code: true });
  }
  return out;
}

/**
 * Výběr a pořadí: bez vzdálených shod uvnitř názvu, každé ID jednou; město hned u stejnojmenného letiště –
 * v poli Odkud (role 'from') před ním (okruh letišť z centra města), v poli Kam za ním (letiště je přesnější cíl).
 */
function rank(cands, { role = 'to', limit = 10 } = {}) {
  const best = Math.max(0, ...cands.map((c) => c.m));
  let list = best >= 60 ? cands.filter((c) => c.m >= 60) : cands; // „obsahuje“ jen když nic lepšího
  // Slovo uvnitř názvu (Kisangani – BANGoka, Long Banga) jen u velkých nebo blízkých míst, když je i lepší shoda.
  // Kód letiště psaný malými („boj“ = Burgas), země a velká letiště zůstanou vždy (Srí Lanka u „Lanka“, Punta Cana),
  // stejně jako opravy překlepu (vesnice „Lodnyn“ z geokódování a za ní Londýn).
  if (best >= 80) list = list.filter((c) => c.m >= 80 || c.code || c.s.type === 'country' || c.s.big || c.s.fuzzy || c.score - c.m >= 4);
  list.sort((x, y) => y.score - x.score);
  const seen = new Set();
  const res = [];
  for (const { s } of list) if (!seen.has(s.id)) { seen.add(s.id); res.push(s); }
  const twin = (city) => (s) => s.type === 'airport' && normalize(s.label) === normalize(city.label) && haversineKm(s.lat, s.lon, city.lat, city.lon) < 60;
  for (const city of res.filter((s) => s.type === 'city')) {
    const ap = res.find(twin(city));
    if (!ap) continue;
    // dvojice zůstane na vyšším z obou míst (vlastní město v poli Odkud nespadne pod cizí výsledky)
    const at = Math.min(res.indexOf(city), res.indexOf(ap));
    res.splice(res.indexOf(city), 1);
    res.splice(res.indexOf(ap), 1);
    res.splice(at, 0, ...(role === 'from' ? [city, ap] : [ap, city]));
  }
  return res.slice(0, limit);
}

/** Návrhy z vlastních dat. home = { lat, lon } domova (výchozí střed Česka), role 'from' | 'to'. */
export function localSuggestions(query, limit = 10, { home = CZ_CENTER, role = 'to' } = {}) {
  return rank(localScored(query, home), { role, limit });
}

// ---- Vlastní seznam míst (data/places.json z výpisu GeoNames, scripts/build-places.mjs) ----
// Načte se při prvním hledání – testy, které místa nehledají, nezaplatí ~0,2 s a ~25 MB haldy; server ho předehřeje
// po startu (index.js warmUp). Index: přihrádky podle prvních 3 znaků klíče (kratší klíč celý) – při načtení se nemusí
// řadit 200 tisíc klíčů a hledání projde jen jednu přihrádku (největší „san“ ~3 200 klíčů, ~0,02 ms).
let PLACES = null;
let PLACES_ERR = null;
export function loadPlaces() {
  if (PLACES) return PLACES;
  // chybějící nebo poškozený soubor: chyba jednou do logu a pak hned – ne číst a parsovat 8 MB při každém dotazu
  if (PLACES_ERR) throw PLACES_ERR;
  let d;
  try {
    d = JSON.parse(readFileSync(path.join(config.root, 'data', 'places.json'), 'utf8'));
  } catch (e) {
    console.error(`Hledání míst: data/places.json se nepodařilo načíst (${e.message}) – návrhy jen z vlastních dat`);
    throw (PLACES_ERR = e);
  }
  const rows = d.places;
  const gid = new Int32Array(rows.length), imp = new Int32Array(rows.length), buckets = new Map();
  for (let i = 0, id = 0; i < rows.length; i++) {
    const f = rows[i].split('|'); // gid (rozdíl od předchozího), name, lat, lon, admin1, pop, fc, n, en, keys
    gid[i] = id += Number(f[0]);
    // významnost: počet obyvatel, u neobydlených objektů počet jazyků se jménem × 1000 (Triglav, Mljet nad vesnicemi),
    // u nich nejvýš jako milionové město – velký ostrov nepřebije město, které se tak jmenuje nebo píše (Pula, ne Jáva
    // přes indonéské „Pulau Jawa“; Santo Domingo, ne ostrov Hispaniola se stejným španělským jménem)
    const v = Math.max(Number(f[5]) || 0, (Number(f[7]) || 0) * 1000);
    imp[i] = d.fc[f[6] || 0].startsWith('PPL') ? v : Math.min(v, 1e6);
    for (const k of f[9] ? f[9].split(',') : [f[1].toLowerCase()]) {
      const p = k[0] === '=' ? k.slice(1, 4) : k.slice(0, 3); // „=“ = historické nebo hovorové jméno, jen celé (placeMatches)
      const b = buckets.get(p) || buckets.set(p, { k: [], r: [] }).get(p);
      b.k.push(k);
      b.r.push(i);
    }
  }
  return (PLACES = { rows, gid, imp, buckets, admin1: d.admin1, fc: d.fc, countries: d.countries });
}

/**
 * Místa, jejichž klíč (český, místní, anglický… název) je napsaný text (2), nebo jím od 3 znaků začíná (1); historické
 * a hovorové jméno („=bombaj“) jen celé.
 */
function placeMatches(query) {
  const q = normalize(query);
  const old = `=${q}`;
  const b = q.length >= 2 && loadPlaces().buckets.get(q.slice(0, 3));
  const best = new Map(); // řádek → nejlepší shoda
  for (let j = 0; b && j < b.k.length; j++) {
    const m = b.k[j] === q || b.k[j] === old ? 2 : q.length >= 3 && b.k[j].startsWith(q) ? 1 : 0;
    if (m > (best.get(b.r[j]) || 0)) best.set(b.r[j], m);
  }
  return best;
}

const placeRow = (i) => {
  const [, label, lat, lon, a1, pop, fc, , en] = PLACES.rows[i].split('|');
  return { label, en: en || label, lat: lat / 1e4, lon: lon / 1e4, cc: PLACES.admin1[a1][0], region: PLACES.admin1[a1][1], pop: Number(pop) || 0, fc: PLACES.fc[fc || 0] };
};

/**
 * Geokódování z vlastního seznamu míst: významnost (počet obyvatel – velká města první), přesná shoda klíče jako 100×
 * větší místo (o 1000 obyvatel víc, ať i osada bez obyvatel) než začátek názvu – přesný název vyhraje (Most před
 * Móstoles, Kolín před Kolínem nad Rýnem, osada Zadov před obcí Žádovice), ale vesnice přesně toho jména nevytlačí město
 * nad ~100 tisíc obyvatel, které se teprve píše (Pař → Paříž před Par v Cornwallu, Dub → Dubaj a Dublin před vesnicemi
 * Dub); nejvýš 6. Data jsou z GeoNames jako dřív u Open-Meteo (stejná česká jména a ID),
 * jen bez sítě, mezipaměti a limitů – i v DEMO. Async kvůli odběratelům (stayplan, stays, regionPlace – geocode(…).catch).
 */
export async function geocode(query) {
  const { imp } = loadPlaces();
  const w = ([i, m]) => (m === 2 ? (imp[i] + 1000) * 100 : imp[i] + 1);
  // nejvýš 3 přesné shody téhož názvu, dokud jsou jiné: šest osad Hradec by jinak vytlačilo Hradec Králové, který se
  // teprve píše (Ústí → Ústí nad Labem, Veselí → Veselí nad Moravou); první výsledek se tím nikdy nemění
  const seen = new Map(), pick = [], spare = [];
  for (const x of [...placeMatches(query)].sort((x, y) => w(y) - w(x) || y[1] - x[1])) {
    const l = PLACES.rows[x[0]].split('|', 2)[1];
    seen.set(l, (seen.get(l) || 0) + 1);
    (x[1] === 2 && seen.get(l) > 3 ? spare : pick).push(x);
    if (pick.length >= 6) break;
  }
  const top = [...pick, ...spare].slice(0, 6).map(([i, m]) => ({ i, m, p: placeRow(i) }));
  // ostrov, hrad nebo jezero za obcí přesně toho jména do 25 km (Ibiza, Korfu, Hvar, Karlštejn) jako dřív u Open-Meteo –
  // první výsledek bere jako střed města program cesty, ubytování i plánovač pobytu, ne střed ostrova
  for (let a = 0; a < top.length; a++) {
    const o = top[a];
    const b = o.m === 2 && !o.p.fc.startsWith('PPL')
      ? top.findIndex((t, j) => j > a && t.m === 2 && t.p.fc.startsWith('PPL') && haversineKm(t.p.lat, t.p.lon, o.p.lat, o.p.lon) <= 25) : -1;
    if (b > a) top.splice(a, 0, ...top.splice(b, 1));
  }
  return top.map(({ i, p }) => ({
    id: `geo:${p.lat.toFixed(4)},${p.lon.toFixed(4)}|${p.label}`,
    type: 'place', label: p.label, flag: flag(p.cc),
    sub: [p.region, COUNTRY_BY_ISO.get(p.cc)?.cs || PLACES.countries[p.cc]].filter(Boolean).join(', '), cc: p.cc,
    lat: p.lat, lon: p.lon, gid: PLACES.gid[i], // gid = ID GeoNames (anglický název místa pro partnery ubytování)
    pop: p.pop,
    fc: p.fc, // druh místa GeoNames (PPLC hlavní město, MT hora, ISL ostrov…)
  }));
}

/**
 * Anglický název místa z vlastního seznamu pro partnery ubytování, kteří český exonym („Benátky“) nepoznají: podle ID
 * GeoNames (gid – místo vybrané v hledání), jinak místo přesně toho jména (i českého nebo slovenského – „Boloňa“)
 * do 25 km od polohy a ve stejné zemi, obec před hradem nebo ostrovem stejného jména, pak nejbližší; nic → null.
 * Jen přesný název: začátek názvu by ve středu Berlína našel zámek Berliner Stadtschloss, v Dublinu Dublin Castle.
 */
export async function englishName(name, lat, lon, cc = '', gid = null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // jen když ID sedí k místu (cizí ID ze sdíleného odkazu nesmí přejmenovat jiné město); indexOf: jeden dotaz na hledání
  const byId = /^\d{1,10}$/.test(String(gid ?? '')) ? loadPlaces().gid.indexOf(Number(gid)) : -1;
  const p = byId >= 0 && placeRow(byId);
  if (p && haversineKm(lat, lon, p.lat, p.lon) <= 25) return p.en;
  const dist = (r) => haversineKm(lat, lon, r.lat, r.lon);
  const obj = (r) => (r.fc.startsWith('PPL') ? 0 : 1);
  const near = [...placeMatches(name)].filter(([, m]) => m === 2).map(([i]) => placeRow(i)).filter((r) => (!cc || r.cc === cc) && dist(r) <= 25);
  return near.sort((a, b) => obj(a) - obj(b) || dist(a) - dist(b))[0]?.en || null;
}

/**
 * Města a místa pro Objevuj a program (/api/geocode): geokódování z vlastního seznamu míst.
 * Překlep („Krakv“ → geokodér najde Krokvåg v Norsku): když žádný název nezačíná napsaným textem, nahoře oprava
 * z vlastních dat (fuzzy: true – nabídka ukáže „Překlep? Asi myslíš:“).
 */
export async function geocodePlaces(query) {
  let items;
  try {
    items = await geocode(query);
  } catch {
    // bez seznamu míst (chybějící nebo poškozený soubor – chyba je v logu jednou) aspoň města z vlastních dat, jinak nic
    items = localCityCenters(query);
  }
  // (vesnice začínající stejně – Krakvitz u „Krakv“ – opravě nebrání)
  const q = normalize(query);
  if (q.length >= 5 && !items.some((x) => normalize(x.label).startsWith(q) && x.pop >= 1000)) {
    const fz = localSuggestions(query, 3).find((s) => s.fuzzy && ['city', 'metro', 'airport'].includes(s.type));
    const name = fz && fz.label.replace(/\s*\(.*\)$/, '');
    // střed města z geokódování (letiště bývá za městem), jinak z vlastních dat
    const fix = name && ((await geocode(name).catch(() => [])).find((x) => normalize(x.label) === normalize(name)) || localCityCenters(name)[0]);
    if (fix) items = [{ ...fix, fuzzy: true }, ...items.filter((x) => x.id !== fix.id)];
  }
  return items;
}

/**
 * Hledání místa v Objevuj: geokódování (vlastní seznam míst) a s klíčem Mapy.com i jejich našeptávač – vesnice a části
 * obcí, adresy, hrady, rozhledny, chaty a další místa, která seznam nemá. Pořadí: větší místa ze seznamu (od 1000
 * obyvatel, oprava překlepu), pak Mapy.com, pak zbytek; stejné místo (stejný název do 10 km) jen jednou, nejvýš 10.
 * mapy: false (nebo bez klíče, výpadek, strop kreditů) = jen geocodePlaces. Návrhy Mapy.com mají src: 'mapy'
 * (u výsledků se pak ukáže logo Mapy.com – podmínka jejich API).
 */
export async function geocodeExplore(query, { mapy = true, regions = false } = {}) {
  const q = String(query || '').trim();
  // regions (hledání v Objevuj) i hory a příroda z vlastního seznamu (Sněžka, Šumava, „Krkon…“)
  const nat = regions ? natureMatches(q) : [];
  const natExact = nat.some((x) => x.exact);
  // návrhy Mapy.com bez mezipaměti – podmínky Mapy.com (bod 4.6.2) zakazují výsledky API ukládat
  const fromMapy = mapy && mapyOn() && q.length >= 2 ? mapySuggest(q, { limit: 6 }) : Promise.resolve([]);
  // oblast stejného jména jako hory (Dolomity): napřed hory – město největšího letiště oblasti (Verona) do hor nevede
  const [om, my, rg] = await Promise.allSettled([geocodePlaces(q), fromMapy, regions && !natExact ? regionPlace(q) : null]);
  const extra = my.status === 'fulfilled' ? my.value : [];
  if (om.status === 'rejected' && !extra.length && !rg.value && !nat.length) throw om.reason;
  let base = om.status === 'fulfilled' ? om.value : [];
  if (rg.value) base = [rg.value, ...base.filter((x) => x.id !== rg.value.id)];
  // stejné místo z obou zdrojů jednou; v rámci Mapy.com ne (hrad Karlštejn a obec Karlštejn jsou dvě místa)
  const dup = (a, b) => normalize(a.label) === normalize(b.label) && haversineKm(a.lat, a.lon, b.lat, b.lon) < 10;
  let list = base; // bez Mapy.com přesně jako geocodePlaces
  if (extra.length) {
    const conv = extra.map((x) => ({
      id: `geo:${x.lat.toFixed(4)},${x.lon.toFixed(4)}|${x.name.replace(/\|/g, ' ')}`, type: 'place', label: x.name, flag: flag(x.cc),
      sub: [x.label, x.location].filter(Boolean).join(' · '), ...(x.cc ? { cc: x.cc } : {}), lat: x.lat, lon: x.lon, pop: 0, src: 'mapy',
    }));
    const strong = base.filter((x) => x.fuzzy || x.region || x.pop >= 1000);
    list = [...strong, ...conv.filter((x) => !strong.some((y) => dup(x, y))),
      ...base.filter((y) => !strong.includes(y) && !conv.some((x) => dup(x, y)))].slice(0, 10);
  }
  return nat.length ? withNature(list, nat) : list;
}

/**
 * Hory a příroda v návrzích Objevuj: přesný název nahoře (Lipno v Polsku, Palavas-les-Flots nebo zastávka „Šumava“ až
 * pod ním), rozepsaný začátek názvu za většími místy (u „Jese“ město Jeseník, pak Jeseníky). Totéž místo z geokodéru
 * („Sněžka (1603 m)“ z Mapy.com) jednou a bez opravy překlepu – začátek skutečného názvu překlep není.
 */
function withNature(list, nat) {
  const ns = nat.map((x) => x.s);
  const same = (n, x) => normalize(String(x.label || '').replace(/\s*\(.*\)$/, '')) === normalize(n.label) && haversineKm(n.lat, n.lon, x.lat, x.lon) < 10;
  const rest = list.filter((x) => !x.fuzzy && !ns.some((n) => same(n, x)));
  const big = rest.findIndex((x) => !(x.region || x.pop >= 1000));
  const at = big < 0 ? rest.length : big;
  return [...nat.filter((x) => x.exact).map((x) => x.s), ...rest.slice(0, at), ...nat.filter((x) => !x.exact).map((x) => x.s), ...rest.slice(at)].slice(0, 10);
}

/**
 * Oblast nebo ostrov z vlastních dat přesným názvem („Toskánsko“, „Kanáry“, „Mallorka“, „Bavorsko“) pro hledání
 * v Objevuj: geokodér je nezná, nebo vrátí jen střed správního celku na venkově. Místo toho město největšího letiště
 * oblasti s jejím klíčem (okruh pak zůstane v oblasti) – stejně jako ✨ věta v Objevuj (public/js/places.js regionCity).
 * Jinak null.
 */
async function regionPlace(query) {
  const hit = localScored(query, CZ_CENTER).find((c) => c.m === 100 && c.s.type === 'region');
  const r = hit && REGIONS.find((x) => `rg:${x.key}` === hit.s.id);
  const a = r && getAirport(r.airports[0]);
  if (!a) return null;
  // „Kréta (Heraklion)“ → Heraklion (anglický název města letiště), „Florencie“ zůstane
  const name = /\(.*\)$/.test(a.cityCs) ? a.city : a.cityCs;
  const g = (await geocode(name).catch(() => [])).find((x) => normalize(x.label) === normalize(name) && haversineKm(a.lat, a.lon, x.lat, x.lon) < 60);
  const p = g || { id: `geo:${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${name}`, type: 'place', label: name, flag: flag(a.cc), cc: a.cc, lat: a.lat, lon: a.lon, pop: 0 };
  return { ...p, region: r.key, sub: [r.cs, p.sub].filter(Boolean).join(' · ') };
}

/** Střed města z vlastních dat (města domova, metropole; jinak poloha letiště) – když ho seznam míst nezná. */
export function localCityCenters(query) {
  const list = localSuggestions(query, 6, { role: 'from' }); // město před svým letištěm
  const cities = list.filter((s) => s.type === 'city');
  return list
    .filter((s) => s.lat != null && (s.type === 'city' || s.type === 'metro' || s.type === 'airport'))
    // letiště města, které už v seznamu je, jako střed města nepatří (Brno ≠ Tuřany)
    .filter((s) => !(s.type === 'airport' && cities.some((c) => normalize(c.label) === normalize(s.label) && haversineKm(c.lat, c.lon, s.lat, s.lon) < 60)))
    .map((s) => ({ ...s, id: `geo:${s.lat.toFixed(4)},${s.lon.toFixed(4)}|${s.label}`, type: 'place' }));
}

// Druhy míst z geokódování, které do našeptávače nepatří: letiště máme vlastní, hory, části měst, správní celky.
const SKIP_FC = /^(AIRP|AIRF|AIRH|AIRB|MT|MTS|HLL|HLLS|PK|PPLX|ADM\d*H?)$/;

/**
 * Našeptávač: vlastní data (země, oblasti, metropole, letiště…) + geokódování ze seznamu míst GeoNames jako doplněk.
 * near = ID domova (ap:BRQ, geo:49.2,16.6|…, cc:CZ) pro pořadí podle vzdálenosti; role 'from' = pole Odkud.
 */
// nature = true (jen Objevuj, místo z věty): navrch i hory a příroda přesným názvem nebo tvarem („Krkonoš“) – pole letů ne
export async function suggest(query, { limit = 8, remote = true, near = '', role = 'to', nature = false } = {}) {
  const home = homePoint(near);
  const q = normalize(query);
  const cands = localScored(query, home);
  const exact = cands.some((c) => c.m === 100 && c.s.type !== 'country');
  if (remote && q.length >= 3 && cands.filter((c) => c.m >= 80).length < 5) {
    const geo = await geocode(query).catch(() => []); // jen doplněk – bez seznamu míst aspoň vlastní data
    const kept = cands.map((c) => c.s);
    // Silná shoda (vlastní místo nebo město z geokódování): pak vzdálené vesnice nepatří do návrhů. Bez ní ano –
    // Portofino, Plitvice nebo Sveti Stefan mají v GeoNames pod 1000 obyvatel a jsou jediná správná odpověď.
    // Cizí název (Munchen, Koln, Beograd, Geneve): geokodér vrátí český („Mnichov“) – jeho první velké město je správně;
    // stejně tak název lišící se jedním písmenem (Agia / Ayia Napa). PPLG = sídlo vlády (Den Haag → Haag).
    const mOf = (g, gi) => {
      const m = matchScore(q, g.label);
      return m < 60 && gi === 0 && q.length >= 4 && ((g.pop >= 100000 && /^PPL(C|G|A\d?)?$/.test(g.fc || '')) || (g.pop >= 1000 && lev1(q, normalize(g.label)))) ? 80 : m;
    };
    const strong = cands.some((c) => c.m >= 80) || geo.some((g, gi) => g.pop >= 1000 && !SKIP_FC.test(g.fc || '') && mOf(g, gi) >= 80);
    for (const [gi, g] of geo.entries()) {
      const m = mOf(g, gi);
      if (m < 60) continue; // „fuzzy“ geokodéru: Bruno u „Brno“, Winterthur u „Zli“, Brenggolo u „Bangkok“
      if (SKIP_FC.test(g.fc || '')) continue;
      if (strong && g.pop < 1000 && haversineKm(home.lat, home.lon, g.lat, g.lon) > 400) continue; // vesnice daleko od domova
      // Přesná shoda s místem z databáze (Brno, Toledo): jen stejnojmenná větší města (Toledo ve Španělsku vedle letišť
      // Toledo v USA a Brazílii) – ne jmenovci a vesnice (Brno v Plzeňském kraji, Vídeň na Vysočině).
      if (exact && !(m === 100 && g.pop >= 50000)) continue;
      // Duplikát nebo čtvrť nalezeného místa: do 25 km a název začíná jeho názvem (Brno-střed, Bratislava - Rača).
      // (i podle anglického názvu: Salzburg = Salcburk)
      if (kept.some((l) => l.lat != null && haversineKm(l.lat, l.lon, g.lat, g.lon) < 25 && [l.label, l.en].some((n) => n && normalize(g.label).startsWith(normalize(n))))) continue;
      const city = g.pop >= 15000;
      const s = city ? { ...citySuggestion({ cs: g.label, cc: g.cc, lat: g.lat, lon: g.lon, pop: g.pop }, g.sub), gid: g.gid } : g;
      // malá místa (vesnice, pop neznámý) až za městy a letišti se stejným začátkem
      cands.push({ s, m, score: m + popBonus(g.pop) - distPenalty(home, g.lat, g.lon) - (g.pop < 1000 ? 20 : city ? 0 : 3) });
      kept.push(s);
    }
  }
  const list = rank(cands, { role, limit });
  return nature ? [...natureMatches(query).filter((x) => x.exact).map((x) => x.s), ...list].slice(0, limit) : list;
}

/** Najde popis místa podle ID (pro zobrazení štítku). */
export function describe(id) {
  const [kind, rest] = splitId(id);
  if (kind === 'ap') { const a = getAirport(rest); return a ? airportSuggestion(a) : null; }
  if (kind === 'metro') { const m = METRO_BY_CODE.get(rest); return m ? metroSuggestion(m) : null; }
  if (kind === 'cc') { const c = COUNTRY_BY_ISO.get(rest); return c ? countrySuggestion(c) : null; }
  if (kind === 'rg') { const r = REGIONS.find((x) => x.key === rest); return r ? regionSuggestion(r) : null; }
  if (kind === 'ct') { const c = CONTINENT_BY_KEY.get(rest); return c ? continentSuggestion(c) : null; }
  if (kind === 'geo') {
    const p = parseGeo(rest);
    return p ? { id, type: 'place', label: p.label, lat: p.lat, lon: p.lon, sub: '' } : null;
  }
  return null;
}

function splitId(id) {
  const s = String(id || '');
  const i = s.indexOf(':');
  return i < 0 ? ['', s] : [s.slice(0, i), s.slice(i + 1)];
}

function parseGeo(rest) {
  const [coords, label = ''] = rest.split('|');
  const [lat, lon] = coords.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, label: label || `${lat.toFixed(2)}, ${lon.toFixed(2)}` };
}

/**
 * Výchozí místa → letiště odletu.
 * Vrací { home: {lat,lon,label,cc?,iata?}|null, airports: [{iata, distKm, ground}] } seřazená podle vzdálenosti.
 * ground = cesta z domova na letiště (access.js: veřejnou dopravou / autem podle `access`, viz airportAccess).
 */
// Letiště, odkud se létá jen v sezóně (letní charter) – náhled ve formuláři to řekne, ať je nikdo nečeká v listopadu.
// Ověřeno 10/2026: JCL jen Smartwings Palma a Čedok (červen–září), KLV Antalya a Burgas (červen–začátek října).
export const SEASONAL = { JCL: 'jen letní charter (červen–září)', KLV: 'hlavně letní charter (červen–začátek října)' };

export function resolveOrigins(ids, { radiusKm = 250, maxAirports = config.maxOrigins, access = {}, exclude = [] } = {}) {
  let home = null;
  const picked = new Map();
  const add = (a, dist) => {
    const prev = picked.get(a.iata);
    if (!prev || dist < prev.distKm) picked.set(a.iata, { iata: a.iata, distKm: dist, explicit: prev?.explicit || false });
  };
  for (const id of ids) {
    const [kind, rest] = splitId(id);
    let point = null;
    if (kind === 'ap') {
      const a = getAirport(rest);
      if (!a) continue;
      point = { lat: a.lat, lon: a.lon, label: a.cityCs, cc: a.cc, iata: a.iata };
      add(a, 0);
      picked.get(a.iata).explicit = true;
    } else if (kind === 'metro') {
      const m = METRO_BY_CODE.get(rest);
      if (!m) continue;
      point = { lat: m.lat, lon: m.lon, label: m.cs, cc: m.cc };
      for (const code of m.airports) {
        const a = getAirport(code);
        add(a, haversineKm(m.lat, m.lon, a.lat, a.lon));
        picked.get(code).explicit = true;
      }
    } else if (kind === 'geo') {
      const p = parseGeo(rest);
      if (!p) continue;
      point = p;
      const near = airportsNear(p.lat, p.lon, Math.max(radiusKm, 1));
      // Okruh 0 u města: jeho vlastní letiště (centrum → BRQ 8 km, MUC 29 km); jinak aspoň 2 nejbližší velká (Zlín).
      const own = airportsNear(p.lat, p.lon, 40).slice(0, 1);
      const list = near.length ? near : own.length ? own : airportsNear(p.lat, p.lon, 600).slice(0, 2);
      for (const a of list) add(a, a.distKm);
    } else if (kind === 'cc') {
      for (const a of airportsInCountry(rest)) {
        add(a, 0);
        picked.get(a.iata).explicit = true;
      }
    } else if (kind === 'rg') {
      const r = REGIONS.find((x) => x.key === rest);
      for (const code of r?.airports || []) {
        const a = getAirport(code);
        if (a) { add(a, 0); picked.get(code).explicit = true; }
      }
    }
    if (point && !home) home = point;
    // Okruh kolem konkrétního letiště/metra (např. „VIE + 150 km“ přidá BTS).
    if (point && kind !== 'geo' && radiusKm > 0) {
      for (const a of airportsNear(point.lat, point.lon, radiusKm)) add(a, a.distKm);
    }
  }
  const off = new Set(exclude);
  let list = [...picked.values()].filter((x) => !off.has(x.iata)); // vypnutá letiště nezaberou místo
  if (home) {
    for (const x of list) {
      const a = getAirport(x.iata);
      x.distKm = haversineKm(home.lat, home.lon, a.lat, a.lon);
    }
  }
  // Při omezení počtu letišť preferuj ta, odkud se opravdu létá: menší letiště „penalizuj“ fiktivními km.
  const eff = (x) => x.distKm + sizePenaltyKm(getAirport(x.iata));
  list.sort((x, y) => Number(y.explicit) - Number(x.explicit) || eff(x) - eff(y));
  list.forEach((x, i) => { x.rank = i; }); // pořadí výběru (náhled ve formuláři ukáže, která se prohledají)
  list = list.slice(0, maxAirports).sort((x, y) => x.distKm - y.distKm);
  return {
    home,
    airports: list.map((x) => ({
      iata: x.iata,
      distKm: Math.round(x.distKm),
      rank: x.rank,
      ...(SEASONAL[x.iata] ? { seasonal: SEASONAL[x.iata] } : {}),
      ground: home ? airportAccess(home, x.iata, access) : null,
    })),
  };
}

/**
 * Cíl → { kind: 'anywhere' | 'countries' | 'airports', countries?, airports?, label }
 */
export function resolveDestinations(ids) {
  if (!ids || !ids.length || ids.includes('anywhere')) return { kind: 'anywhere', label: 'Kamkoliv' };
  const countries = new Set();
  const airports = new Set();
  const continents = [];
  const labels = [];
  for (const id of ids) {
    const [kind, rest] = splitId(id);
    const d = describe(id);
    if (d) labels.push(d.label);
    if (kind === 'cc') countries.add(rest);
    else if (kind === 'ct' && CONTINENT_BY_KEY.has(rest)) {
      continents.push(rest);
      continentCountries(rest).forEach((cc) => countries.add(cc));
    }
    else if (kind === 'ap' && getAirport(rest)) airports.add(rest);
    else if (kind === 'metro') METRO_BY_CODE.get(rest)?.airports.forEach((a) => airports.add(a));
    else if (kind === 'rg') REGIONS.find((r) => r.key === rest)?.airports.forEach((a) => getAirport(a) && airports.add(a));
    else if (kind === 'geo') {
      const p = parseGeo(rest);
      if (p) cityAirports(p.lat, p.lon).forEach((a) => airports.add(a.iata)); // vlastní, pak velká blízká (ne Pardubice před Vídní)
    }
  }
  const label = labels.join(', ');
  if (countries.size && !airports.size) return { kind: 'countries', countries: [...countries], continents, label };
  if (countries.size) {
    // Světadíl + konkrétní letiště: světadíl jako jeho velká letiště (jinak by to byly stovky letišť).
    for (const cc of countries) airportsInCountry(cc).filter((a) => !continents.length || a.type === 'L').forEach((a) => airports.add(a.iata));
  }
  return { kind: 'airports', airports: [...airports], label };
}
