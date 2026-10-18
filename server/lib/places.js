// Našeptávač míst a převod výběru uživatele na seznam letišť.
//
// ID návrhu:
//   ap:VIE            konkrétní letiště
//   metro:LON         metropolitní oblast (všechna letiště)
//   cc:CZ             země
//   rg:kanary         turistický region / souostroví
//   ct:asia           světadíl / oblast (Asie, Afrika, Blízký východ…) – cíl jako seznam zemí
//   geo:LAT,LON|Název libovolné místo (geokódováno přes Open-Meteo)
import {
  AIRPORTS, COUNTRIES, COUNTRY_BY_ISO, METRO_BY_CODE, airportsInCountry, airportsNear, getAirport, sizePenaltyKm,
} from './airports.js';
import { CITIES, COUNTRY_ALIASES, EXONYMS, REGIONS } from './names.js';
import { CONTINENTS, CONTINENT_BY_KEY, continentCountries } from './longhaul.js';
import { haversineKm, normalize } from './geo.js';
import { airportAccess } from './access.js';
import { cache } from './cache.js';
import { request } from './http.js';
import { config } from '../config.js';

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
    if (sc >= 60) push(regionSuggestion(r), sc, sc + 12);
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

export async function geocode(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  if (config.mock) return localCityCenters(q);
  return cache.wrap(`geo:${normalize(q)}`, 7 * 864e5, async () => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=cs&format=json`;
    // občasná 502 Open-Meteo (živě 10/2026: Objevuj „Krakov“ nic nenašel, o chvíli později v pořádku) – jednou znovu;
    // timeout ne (hledání by trvalo dvakrát tak dlouho)
    const get = () => request(url, { timeoutMs: 6000, retries: 0 });
    const j = await get().catch((e) => (e.status >= 500 ? new Promise((r) => setTimeout(r, 400)).then(get) : Promise.reject(e)));
    return (j.results || []).map((r) => ({
      id: `geo:${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}|${r.name}`,
      type: 'place', label: r.name, flag: flag(r.country_code),
      sub: [r.admin1, r.country].filter(Boolean).join(', '), cc: r.country_code,
      lat: r.latitude, lon: r.longitude, gid: r.id, // gid = ID GeoNames (anglický název místa pro partnery ubytování)
      pop: r.population || 0,
      fc: r.feature_code || '', // druh místa GeoNames (PPLC hlavní město, AIRP letiště, MT hora…)
    }));
  });
}

/**
 * Anglický název místa (Open-Meteo, language=en) pro partnery ubytování, kteří český exonym („Benátky“) nepoznají:
 * podle ID GeoNames (gid – místo vybrané v hledání), jinak výsledek hledání názvu do 25 km od polohy a ve stejné
 * zemi; nic → null. V mezipaměti 30 dní.
 */
export async function englishName(name, lat, lon, cc = '', gid = null) {
  if (/^\d{1,10}$/.test(String(gid ?? ''))) {
    const byId = await cache.wrap(`geo-en-id:${gid}`, 30 * 864e5, async () => {
      const r = await request(`https://geocoding-api.open-meteo.com/v1/get?id=${gid}&language=en`, { timeoutMs: 5000, retries: 0 });
      // jen když ID sedí k místu (cizí ID ze sdíleného odkazu nesmí přejmenovat jiné město)
      return r?.name && Number.isFinite(r.latitude) ? { name: r.name, lat: r.latitude, lon: r.longitude } : null;
    }).catch(() => null);
    if (byId && haversineKm(lat, lon, byId.lat, byId.lon) <= 25) return byId.name;
  }
  const q = String(name || '').trim();
  if (q.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return cache.wrap(`geo-en:${normalize(q)}:${lat.toFixed(2)}:${lon.toFixed(2)}`, 30 * 864e5, async () => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`;
    const j = await request(url, { timeoutMs: 5000, retries: 0 });
    const hit = (j.results || []).filter((r) => (!cc || String(r.country_code || '').toUpperCase() === cc) && haversineKm(lat, lon, r.latitude, r.longitude) <= 25)
      .sort((a, b) => haversineKm(lat, lon, a.latitude, a.longitude) - haversineKm(lat, lon, b.latitude, b.longitude))[0];
    return hit?.name || null;
  });
}

/** Střed města z vlastních dat (města domova, metropole; jinak poloha letiště) – záloha bez sítě. */
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
 * Našeptávač: vlastní data + geokódování (Open-Meteo) jako doplněk.
 * near = ID domova (ap:BRQ, geo:49.2,16.6|…, cc:CZ) pro pořadí podle vzdálenosti; role 'from' = pole Odkud.
 */
export async function suggest(query, { limit = 8, remote = true, near = '', role = 'to' } = {}) {
  const home = homePoint(near);
  const q = normalize(query);
  const cands = localScored(query, home);
  const exact = cands.some((c) => c.m === 100 && c.s.type !== 'country');
  if (remote && q.length >= 3 && cands.filter((c) => c.m >= 80).length < 5) {
    let geo = [];
    try {
      geo = await geocode(query);
    } catch {
      // Geokódování je jen doplněk – při výpadku vrať lokální výsledky.
    }
    const kept = cands.map((c) => c.s);
    // Silná shoda (vlastní místo nebo město z geokódování): pak vzdálené vesnice nepatří do návrhů. Bez ní ano –
    // Portofino, Plitvice nebo Sveti Stefan mají v GeoNames pod 1000 obyvatel a jsou jediná správná odpověď.
    // Cizí název (Munchen, Koln, Beograd, Geneve): geokodér vrátí český („Mnichov“) – jeho první velké město je správně;
    // stejně tak název lišící se jedním písmenem (Agia / Ayia Napa).
    const mOf = (g, gi) => {
      const m = matchScore(q, g.label);
      return m < 60 && gi === 0 && q.length >= 4 && ((g.pop >= 100000 && /^PPL(C|A\d?)?$/.test(g.fc || '')) || (g.pop >= 1000 && lev1(q, normalize(g.label)))) ? 80 : m;
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
  return rank(cands, { role, limit });
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
