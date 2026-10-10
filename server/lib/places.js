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
  AIRPORTS, COUNTRIES, COUNTRY_BY_ISO, METRO_BY_CODE, airportsInCountry, airportsNear, getAirport,
} from './airports.js';
import { COUNTRY_ALIASES, REGIONS } from './names.js';
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
  if (t.split(' ').some((w) => w.startsWith(q))) return 60;
  if (q.length >= 4 && t.includes(q)) return 30;
  return 0;
}

function countrySuggestion(c) {
  const n = airportsInCountry(c.iso2).length;
  return {
    id: `cc:${c.iso2}`, type: 'country', label: c.cs, flag: flag(c.iso2),
    sub: `celá země · ${n} ${n === 1 ? 'letiště' : n < 5 ? 'letiště' : 'letišť'}`, cc: c.iso2,
  };
}

function airportSuggestion(a) {
  return {
    id: `ap:${a.iata}`, type: 'airport', label: a.cityCs, flag: flag(a.cc), iata: a.iata,
    sub: `${a.name} · ${a.iata} · ${a.country}`, cc: a.cc, lat: a.lat, lon: a.lon,
  };
}

function metroSuggestion(m) {
  return {
    id: `metro:${m.code}`, type: 'metro', label: m.cs, flag: flag(m.cc),
    sub: `všechna letiště: ${m.airports.join(', ')}`, cc: m.cc, lat: m.lat, lon: m.lon,
  };
}

function continentSuggestion(c) {
  return { id: `ct:${c.key}`, type: 'continent', label: c.cs, flag: c.flag, sub: `celý světadíl · ${continentCountries(c.key).length} zemí` };
}

function regionSuggestion(r) {
  return { id: `rg:${r.key}`, type: 'region', label: r.cs, flag: '🏝️', sub: `region · ${r.airports.join(', ')}` };
}

export function localSuggestions(query, limit = 10) {
  const q = normalize(query);
  if (!q) return [];
  const scored = [];
  const push = (s, score) => score > 0 && scored.push({ s, score });

  if (q.length === 3) {
    const a = getAirport(q);
    if (a) push(airportSuggestion(a), 120);
  }
  for (const c of COUNTRIES) {
    const sc = Math.max(matchScore(q, c.cs), matchScore(q, c.en));
    if (sc >= 60) push(countrySuggestion(c), sc + (sc === 100 ? 15 : 5));
  }
  for (const [alias, iso] of Object.entries(COUNTRY_ALIASES)) {
    const sc = matchScore(q, alias);
    const c = COUNTRY_BY_ISO.get(iso);
    if (c && sc >= 80) push(countrySuggestion(c), sc + 10);
  }
  for (const c of CONTINENTS) {
    const sc = Math.max(matchScore(q, c.cs), ...c.aliases.map((al) => matchScore(q, al)));
    if (sc >= 60) push(continentSuggestion(c), sc + 14);
  }
  for (const r of REGIONS) {
    const sc = Math.max(matchScore(q, r.cs), ...r.aliases.map((al) => matchScore(q, al)));
    if (sc >= 60) push(regionSuggestion(r), sc + 12);
  }
  // Nalezené metropole: jmenovec jinde (London v Kanadě u „Londýn“) až za letišti metropole.
  const metroNames = new Set();
  const metroAirports = new Set();
  for (const m of METRO_BY_CODE.values()) {
    const sc = Math.max(matchScore(q, m.cs), matchScore(q, m.en));
    if (sc >= 60) {
      push(metroSuggestion(m), sc + 10);
      metroNames.add(normalize(m.cs)).add(normalize(m.en));
      m.airports.forEach((x) => metroAirports.add(x));
    }
  }
  for (const a of AIRPORTS.values()) {
    if (a.type === 'S' && q.length < 4) continue;
    const sc = Math.max(matchScore(q, a.cityCs), matchScore(q, a.city), matchScore(q, a.name) - 20);
    const homonym = !metroAirports.has(a.iata) && (metroNames.has(normalize(a.cityCs)) || metroNames.has(normalize(a.city)));
    if (sc > 0) push(airportSuggestion(a), sc + (a.type === 'L' ? 8 : a.type === 'M' ? 4 : 0) - (homonym ? 30 : 0));
  }
  scored.sort((x, y) => y.score - x.score);
  // Když existuje dobrá shoda, zahoď šum z „obsahuje“ (např. viden → provIDENciales).
  const floor = scored.length && scored[0].score >= 80 ? 50 : 0;
  const seen = new Set();
  const out = [];
  for (const { s, score } of scored) {
    if (score < floor || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

export async function geocode(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  if (config.mock) return localCityCenters(q);
  return cache.wrap(`geo:${normalize(q)}`, 7 * 864e5, async () => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=cs&format=json`;
    const j = await request(url, { timeoutMs: 6000, retries: 0 });
    return (j.results || []).map((r) => ({
      id: `geo:${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}|${r.name}`,
      type: 'place', label: r.name, flag: flag(r.country_code),
      sub: [r.admin1, r.country].filter(Boolean).join(', '), cc: r.country_code,
      lat: r.latitude, lon: r.longitude, gid: r.id, // gid = ID GeoNames (anglický název místa pro partnery ubytování)
      pop: r.population || 0,
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

/** Střed města z vlastních dat (metropole; jinak poloha letiště) – záloha bez sítě. */
export function localCityCenters(query) {
  return localSuggestions(query, 6)
    .filter((s) => s.lat != null && (s.type === 'metro' || s.type === 'airport'))
    .map((s) => ({ ...s, id: `geo:${s.lat.toFixed(4)},${s.lon.toFixed(4)}|${s.label}`, type: 'place' }));
}

export async function suggest(query, { limit = 10, remote = true } = {}) {
  const local = localSuggestions(query, limit);
  const strong = local.filter((s) => s.type !== 'airport' || normalize(s.label).startsWith(normalize(query)));
  const exact = local.some((s) => normalize(s.label) === normalize(query));
  if (!remote || normalize(query).length < 3 || strong.length >= 5) return local;
  let geo = [];
  try {
    geo = await geocode(query);
  } catch {
    // Geokódování je jen doplněk – při výpadku vrať lokální výsledky.
  }
  // Vynech místa, která jsou jen duplikátem nalezeného letiště/metra (do 25 km).
  let filtered = geo.filter((g) => !local.some((l) => l.lat != null && haversineKm(l.lat, l.lon, g.lat, g.lon) < 25 && normalize(l.label) === normalize(g.label)));
  // Přesná shoda s místem z databáze (Brno, Toledo): z geokódování jen stejnojmenná větší města (Toledo ve Španělsku
  // vedle letišť Toledo v USA a Brazílii) – ne jmenovci a vesnice z celého světa (Bruno v Nebrasce, Brno v Plzeňském kraji).
  if (exact) filtered = filtered.filter((g) => normalize(g.label) === normalize(query) && g.pop >= 50000);
  return [...local, ...filtered.slice(0, 4)].slice(0, limit + 2);
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
export function resolveOrigins(ids, { radiusKm = 250, maxAirports = config.maxOrigins, access = {} } = {}) {
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
      // Ani v malém okruhu nezůstaň bez letiště – vezmi aspoň 2 nejbližší velká.
      const list = near.length ? near : airportsNear(p.lat, p.lon, 600).slice(0, 2);
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
  let list = [...picked.values()];
  if (home) {
    for (const x of list) {
      const a = getAirport(x.iata);
      x.distKm = haversineKm(home.lat, home.lon, a.lat, a.lon);
    }
  }
  // Při omezení počtu letišť preferuj velká: menší letiště „penalizuj“ fiktivními km.
  const penalty = { L: 0, M: 35, S: 90 };
  const eff = (x) => x.distKm + penalty[getAirport(x.iata).type];
  list.sort((x, y) => Number(y.explicit) - Number(x.explicit) || eff(x) - eff(y));
  list = list.slice(0, maxAirports).sort((x, y) => x.distKm - y.distKm);
  return {
    home,
    airports: list.map((x) => ({
      iata: x.iata,
      distKm: Math.round(x.distKm),
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
      if (p) airportsNear(p.lat, p.lon, 130).slice(0, 4).forEach((a) => airports.add(a.iata));
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
