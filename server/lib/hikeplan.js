// Túry na víc dní v horách a přírodě (Krkonoše, Šumava, Tatry, Dolomity…): na každý den pobytu jedna túra tam a zpět –
// z ubytování, nebo ze startu u cíle, kam se dojede autem nebo busem (parkoviště, nádraží, obec z Wikidat – jako
// 🥾 Pěšky v Objevuj). Každý den jiný cíl v jiné části hor: hlavní vrchol, pak voda / skály / vyhlídka / chata / jiný
// hřbet, pak lehčí den; den příjezdu a odjezdu kratší túra podle času, který zbývá.
// Zdroje (zdarma, bez klíče): cíle = nejznámější místa v okolí z Wikidat (findPlaces – stejná data a mezipaměť jako
// Objevuj a program ve městě), start túry = Wikidata (trailheadsNear), trasa = BRouter (profil pěší turistiky, jedna
// trasa na den, nejvýš MAX_ROUTES na plán), občerstvení po cestě = OpenStreetMap přes Overpass (jeden dotaz na plán).
// Čas chůze podle turistického vzorce DIN 33466 (hikeMinutes v bike.js): 4 km/h, 300 m stoupání a 500 m klesání za
// hodinu, kratší z obou časů se přičte polovinou – bez přestávek. Co nejde (BRouter neodpoví, limit tras, Overpass
// neodpoví), zůstane jako cíl s odhadem vzdušnou čarou a odkazem do Mapy.com – API Mapy.com se tu nevolá (strop kreditů).
import { createHash } from 'node:crypto';
import { cache } from './cache.js';
import { haversineKm, normalize } from './geo.js';
import { addDays, daysBetween } from './dates.js';
import { request, limiter } from './http.js';
import { UA } from './brouter.js';
import { NATURE } from './names.js';
import { findPlaces } from './poi.js';
import { hikeMinutes, hikeThereBack, trailheadsNear, mapyUrl, googleUrl } from './bike.js';

export const WALK_KM = 5.5; // cíl do 5,5 km vzdušnou čarou od ubytování: pěšky rovnou z ubytování (tam a zpět ~15 km)
export const FAR_WALK_KM = 8; // bez startu u cíle (Wikidata nic nemá) ještě pěšky z ubytování, dál jen odhad
const REACH_KM = 18; // dál od ubytování se na túru nejezdí (den by byl hlavně v autě)
const SHORT_KM = 3.5; // kratší túra (den příjezdu / odjezdu) z ubytování do 3,5 km vzdušnou čarou
export const SPACING_KM = 2.5; // cíle různých dnů aspoň 2,5 km od sebe – jiná část hor (Růžová hora není den „po Sněžce“)
const TH_KM = 6; // start túry nejvýš 6 km od cíle
const TH_WAIT_MS = 12000; // na start z Wikidat déle nečekat (dotaz doběhne do mezipaměti, příště je hned)
export const MAX_ROUTES = 6; // nejvýš 6 tras z BRouteru na plán (veřejný server, dotaz za sekundu); další dny odhadem
const ROUTE_BUDGET_MS = 40000; // a jen prvních 40 s plánování – ať odpověď nečeká na pomalý BRouter
const MAX_DAYS = 31;
export const WIND = 1.35; // odhad bez trasy: cesta je ~1,35× delší než vzdušná čára
export const BREAKS = 1.2; // přestávky, svačina a focení: ~20 % k času chůze
const DAY_FROM = 8 * 60 + 30; // túra od 8:30…
const DAY_TO = 18 * 60; // …do 18:00 (za tmy se v horách nechodí); den příjezdu 1,5 h po příjezdu, den odjezdu do 3 h před odjezdem
const FULL_MIN = 300; // aspoň 5 h chůze = celodenní túra
const SHORT_MIN = 90; // 1,5–5 h = kratší túra; méně = jen procházka
const MAX_WALK = 480; // víc než 8 h chůze na den se neplánuje
const KIDS_WALK = 240; // s dětmi nejvýš 4 h chůze
export const FOOD_M = 150; // chata nebo restaurace nejvýš 150 m od trasy
const GEOM_MAX = 160; // trasa dne pro mapu a výškový profil (BRouter jich vrací tisíce)

/* ---------- oblast ---------- */
/**
 * Oblast hor a přírody ze seznamu NATURE (names.js), ve které bod leží (do okruhu oblasti: pohoří a park 20 km, hora,
 * jezero… 10 km): pohoří a parky přednostně (Pec pod Sněžkou = Krkonoše, ne Sněžka), jinak nejbližší. → { cs, kind, sub } | null
 */
export function natureAreaAt(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const hits = NATURE.map((n) => ({ n, d: haversineKm(lat, lon, n.lat, n.lon) })).filter((x) => x.d <= x.n.km);
  if (!hits.length) return null;
  const wide = (x) => (x.n.kind === 'range' || x.n.kind === 'park' ? 0 : 1);
  const { n } = hits.sort((a, b) => wide(a) - wide(b) || a.d - b.d)[0];
  return { cs: n.cs, kind: n.kind, sub: n.sub };
}

/* ---------- cíle ---------- */
// Druh cíle podle Wikidat (kategorie a druh přírodního místa z poi.js), jinak podle názvu a popisu (vícejazyčně –
// hory leží na hranicích). Konec slova přes \p{L}: \b zná jen ASCII („útulna“, „Łysa“).
const W = (s) => new RegExp(`(?<!\\p{L})(?:${s})`, 'iu');
const HUT = W('bouda|boudy|chata|chaty|chalupa|hütte|schronisko|schutzhaus|refuge|refugio|rifugio|koliba|útulňa|útulna|chalet|bothy');
const GONE = W('zaniklá|zaniklý|zbořen|vyhořel|defunct|former|bývalá|bývalý');
const SETTLED = W('osada|vesnice|obec|místní část|část obce|středisko|village|hamlet|settlement|resort|wieś|osiedle|dorf');
const WATER = W('vodopád|vodopády|waterfall|wodospad|wasserfall|cascata|cascade|jezer|jezír|pleso|plesa|lake|lago|jezioro|staw|tarn|seen?(?!\\p{L})|[\\p{L}]+see(?!\\p{L})');
const CAVE = W('jeskyn|propast|cave|höhle|jaskini|jaskyň|grotta|grotte|cueva');
const ROCKS = W('kameny|kámen|skal|skál|felsen|steine|rocks?(?!\\p{L})|skał|turni|brána|soutěsk|gorge|klamm|kaňon|canyon|rokl');
const VIEW = W('vyhlídk|rozhledn|widok|aussicht|viewpoint|belvedere|mirador');
const RIDGE = W('hřbet|hřeben|ridge|grat(?!\\p{L})|kamm(?!\\p{L})|grzbiet');
const PROTECTED = W('národní park|national park|nationalpark|park narodowy|parco nazionale|parque nacional|chráněná krajinná|chko|přírodní rezervace|nature reserve|naturschutz');
export const GOAL_KINDS = ['summit', 'ridge', 'water', 'rocks', 'view', 'cave', 'castle', 'hut'];

/** Místo z findPlaces → druh cíle túry, nebo null (kostel, muzeum, národní park jako celek, obec, zaniklá bouda…). */
export function goalKind(p) {
  const name = String(p?.name || '');
  const text = `${name} ${p?.description || ''}`;
  if (!name || PROTECTED.test(name)) return null;
  const byName = () => (WATER.test(name) ? 'water' : CAVE.test(name) ? 'cave' : ROCKS.test(name) ? 'rocks' : VIEW.test(name) ? 'view' : RIDGE.test(name) ? 'ridge' : null);
  switch (p.category) {
    case 'nature': {
      const t = p.natureType;
      if (t === 'park' || t === 'river') return null;
      if (t === 'waterfall' || t === 'lake') return 'water';
      if (t === 'cave') return 'cave';
      if (t === 'gorge') return 'rocks';
      // hora bez typu ve Wikidatech, nebo s typem „hora“ a názvem skal / vyhlídky / hřbetu (Dívčí kameny, Kozí hřbety)
      return byName() || (t === 'mountain' || !t ? 'summit' : null);
    }
    case 'viewpoint': case 'tower': return 'view';
    // hrad a zřícenina na kopci (Chojnik, Břecštejn); zaniklá bouda (Rennerova bouda) cílem není
    case 'castle': case 'ruins': return HUT.test(name) ? null : 'castle';
    case 'sight': case 'park': {
      if (HUT.test(text) && !SETTLED.test(text) && !GONE.test(text)) return 'hut';
      return SETTLED.test(text) ? null : byName();
    }
    default: return null;
  }
}

const dist = (a, b) => haversineKm(a.lat, a.lon, b.lat, b.lon);
const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Místa v okolí → kandidáti na cíl túry { id, name, kind, lat, lon, score, d (km od ubytování) }: jen druh túry, do
 * REACH_KM, bez vyřazených (exclude), stejné místo dvakrát (dvě položky Wikidat, vrchol a kaple na něm) jednou – známější.
 */
export function goalCandidates(places, base, { exclude = new Set(), reachKm = REACH_KM } = {}) {
  const out = [];
  for (const p of places || []) {
    if (!p || p.category === 'daytrip' || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || exclude.has(p.id)) continue;
    const kind = goalKind(p);
    const d = dist(base, p);
    if (!kind || d > reachKm) continue;
    out.push({ id: String(p.id), name: String(p.name), kind, lat: p.lat, lon: p.lon, score: Number(p.score) || 0, d: r1(d), ...(p.url ? { url: p.url } : {}) });
  }
  out.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const c of out) if (!keep.some((k) => dist(k, c) < 0.4 || normalize(k.name) === normalize(c.name))) keep.push(c);
  return keep;
}

/* ---------- dny ---------- */
const toMin = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : null; };
export const toHm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

/**
 * Okna dnů pobytu: od 8:30 (den příjezdu 1,5 h po příjezdu) do 18:00 (den odjezdu 3 h před odjezdem). budget = minut chůze
 * (okno bez ~20 % na přestávky, nejvýš 8 h, s dětmi 4 h); type: full (aspoň 5 h), short (1,5–5 h), rest (méně).
 */
export function hikeWindows({ start, end, arrivalTime = null, departureTime = null, kids = false }) {
  const n = Math.max(1, Math.min(MAX_DAYS, daysBetween(start, end) + 1));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? toMin(arrivalTime) : null;
    const dep = i === n - 1 ? toMin(departureTime) : null;
    const from = a != null ? Math.max(DAY_FROM, a + 90) : DAY_FROM;
    const to = dep != null ? Math.min(DAY_TO, dep - 180) : DAY_TO;
    const cap = Math.round((to - from) / BREAKS);
    const budget = Math.max(0, Math.min(kids ? KIDS_WALK : MAX_WALK, cap));
    const type = cap >= FULL_MIN ? 'full' : cap >= SHORT_MIN ? 'short' : 'rest';
    out.push({ date: addDays(start, i), from, to, budget, type, ...(a != null ? { arrival: true } : {}), ...(dep != null ? { departure: true } : {}) });
  }
  return out;
}

// Témata dnů v pořadí od nejdelšího dne: hlavní vrchol, něco jiného (voda, skály, vyhlídka, chata, hřbet), lehčí den.
const THEMES = ['summit', 'other', 'easy'];
const KIDS_THEMES = ['easy', 'other', 'easy'];
const EASY = new Set(['water', 'view', 'castle', 'hut', 'cave']);

/**
 * Hodnota kandidáta pro téma dne: význam (skóre z Wikidat) − vzdálenost (z ubytování pěšky do WALK_KM, dál se jede) +
 * bonus tématu. Lehčí den: voda, vyhlídka, hrad, chata, jeskyně, z ubytování blíž; vrchol až když nic jiného.
 */
function value(c, theme, used, { fromBase, kids }) {
  let v = c.score - (fromBase ? 3 * Math.max(0, c.d - WALK_KM) : 0.3 * Math.max(0, c.d - 10));
  if (theme === 'summit') v += c.kind === 'summit' ? 15 : 0;
  else if (theme === 'other') v += c.kind === 'summit' ? 0 : used.some((u) => u.kind === c.kind) ? 3 : 8;
  else v += (EASY.has(c.kind) ? 12 : c.kind === 'summit' ? (kids ? -10 : -4) : 0) - (fromBase ? (kids ? 5 : 2.5) * c.d : 0);
  return v;
}
const KIDS_KM = 3.7; // s dětmi napřed cíle do 3,7 km od ubytování (tam a zpět ~10 km), pak do WALK_KM

/**
 * Cíl na každý den (pole jako okna dnů, null = bez túry): od nejdelšího dne témata THEMES, kratší dny lehčí cíl do
 * SHORT_KM; cíle různých dnů aspoň SPACING_KM od sebe (když nestačí, 1,2 km), nic dvakrát. S dětmi lehčí témata a napřed
 * bližší cíle (KIDS_KM, pak WALK_KM od ubytování).
 */
export function pickGoals(cands, wins, { kids = false, fromBase = true } = {}) {
  const goals = wins.map(() => null);
  const order = wins.map((_, i) => i).filter((i) => wins[i].type !== 'rest').sort((a, b) => wins[b].budget - wins[a].budget || a - b);
  const themes = kids ? KIDS_THEMES : THEMES;
  const used = [];
  let t = 0;
  for (const i of order) {
    const short = wins[i].type === 'short';
    const theme = short ? 'easy' : themes[t++ % themes.length];
    // stupně: [nejvýš km od ubytování, rozestup cílů] – od nejpřísnějšího
    const reach = !fromBase ? [Infinity] : short ? [SHORT_KM] : kids ? [KIDS_KM, WALK_KM] : [Infinity];
    const tiers = [...reach.map((r) => [r, SPACING_KM]), [reach.at(-1), 1.2]];
    let pick = null;
    for (const [maxD, gap] of tiers) {
      const ok = cands.filter((c) => c.d <= maxD && !used.includes(c) && used.every((u) => dist(u, c) >= gap));
      if (ok.length) { pick = ok.reduce((a, b) => (value(b, theme, used, { fromBase, kids }) > value(a, theme, used, { fromBase, kids }) ? b : a)); break; }
    }
    if (pick) { goals[i] = { ...pick, theme }; used.push(pick); }
  }
  return goals;
}

/* ---------- start túry ---------- */
const TH_BONUS = { parking: 1, station: 0.5, town: 0 };
/**
 * Odkud se jde: z ubytování (cíl do WALK_KM), jinak start u cíle z kandidátů trailheadRows (bike.js) – parkoviště >
 * nádraží > obec (aspoň 2 jazykové verze článku), do TH_KM od cíle, raději na straně ubytování; je-li něco přímo u cíle
 * (do 0,5 km), dojede se až k němu. Start dál od cíle než ubytování → z ubytování (do FAR_WALK_KM). Nic → null (jen odhad).
 * → { kind: 'base' | 'parking' | 'station' | 'town', name, lat, lon, km (od ubytování), toGoal (km od cíle) }
 */
export function pickStart(goal, base, cands, { fromBase = true } = {}) {
  const dGoal = dist(base, goal);
  const home = { kind: 'base', name: base.label || 'ubytování', lat: base.lat, lon: base.lon, km: 0, toGoal: r1(dGoal) };
  if (fromBase && dGoal <= WALK_KM) return home;
  const all = (cands || []).filter((c) => c && c.name && Number.isFinite(c.lat) && Number.isFinite(c.lon) && TH_BONUS[c.kind] !== undefined)
    .map((c) => ({ ...c, toGoal: dist(goal, c) }));
  const at = all.filter((c) => c.toGoal < 0.5).sort((a, b) => a.toGoal - b.toGoal)[0];
  const score = (c) => c.toGoal - TH_BONUS[c.kind] - (c.sitelinks >= 10 ? 0.3 : 0) + 0.15 * Math.max(0, dist(base, c) - dGoal);
  const best = at || all.filter((c) => c.toGoal <= TH_KM && (c.kind !== 'town' || c.sitelinks >= 2)).sort((a, b) => score(a) - score(b) || b.sitelinks - a.sitelinks)[0];
  if (best && !(fromBase && dGoal <= best.toGoal + 1)) {
    return { kind: best.kind, name: best.name, lat: best.lat, lon: best.lon, km: r1(dist(base, best)), toGoal: r1(best.toGoal) };
  }
  return fromBase && dGoal <= FAR_WALK_KM ? home : null;
}

/* ---------- trasa, obtížnost, odhad ---------- */
/** Bez trasy z BRouteru: tam a zpět vzdušnou čarou × WIND (na půl km); převýšení a čas neznám. */
export function estimateLeg(start, goal) {
  return { km: Math.max(1, Math.round(2 * dist(start, goal) * WIND * 2) / 2), ascent: null, descent: null, minutes: null, estimate: true };
}

/**
 * Obtížnost podle času chůze (DIN 33466) a stoupání: lehká do 3 h a 400 m, náročná nad 6 h, 1 000 m nebo 20 km,
 * jinak střední. Bez času (odhad) null.
 */
export function difficulty({ km, ascent, minutes }) {
  if (!Number.isFinite(minutes)) return null;
  const up = Number(ascent) || 0;
  if (minutes > 360 || up > 1000 || km > 20) return { level: 3, label: 'náročná' };
  if (minutes <= 180 && up <= 400) return { level: 1, label: 'lehká' };
  return { level: 2, label: 'střední' };
}

/** Geometrie [lon, lat, výška] na nejvýš max bodů (poslední zůstane). */
export function thinGeometry(g, max = GEOM_MAX) {
  if (!Array.isArray(g) || g.length <= max) return g || [];
  const step = Math.ceil(g.length / max);
  return g.filter((_, i) => i % step === 0 || i === g.length - 1);
}

const cumKm = (g) => {
  const cum = [0];
  for (let i = 1; i < g.length; i++) cum.push(cum[i - 1] + haversineKm(g[i - 1][1], g[i - 1][0], g[i][1], g[i][0]));
  return cum;
};
/** Body po stepKm podél trasy (pro dotaz Overpass „kolem čáry“), nejvýš max. */
export function linePoints(g, stepKm = 0.3, max = 40) {
  if (!g || g.length < 2) return g || [];
  const cum = cumKm(g);
  const step = Math.max(stepKm, cum.at(-1) / (max - 1));
  const out = [g[0]];
  let next = step;
  for (let i = 1; i < g.length; i++) if (cum[i] >= next) { out.push(g[i]); next = cum[i] + step; }
  if (out.at(-1) !== g.at(-1) && out.length < max) out.push(g.at(-1));
  return out.slice(0, max).map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
}

/* ---------- občerstvení po cestě (OpenStreetMap, Overpass) ---------- */
export const OVERPASS = (process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter').replace(/\/$/, '');
const limitOverpass = limiter(1);
let overpassDownUntil = 0; // po chybě 10 minut bez Overpassu – další plány na timeout nečekají
export const _resetOverpass = () => { overpassDownUntil = 0; };

/** Dotaz Overpass: horské chaty (tourism=alpine_hut) a restaurace, kavárny, hospody se jménem do FOOD_M od čar dnů. */
export function foodQuery(lines, radiusM = FOOD_M) {
  const around = lines.filter((l) => l && l.length).map((l) => `(around:${radiusM},${l.map(([lon, lat]) => `${lat},${lon}`).join(',')})`);
  const sel = around.flatMap((a) => [`nwr["tourism"="alpine_hut"]["name"]${a};`, `nwr["amenity"~"^(restaurant|cafe|pub|biergarten)$"]["name"]${a};`]);
  return `[out:json][timeout:20];\n(\n${sel.join('\n')}\n);\nout center tags qt;`;
}

/** Odpověď Overpass → [{ id, name, kind: 'hut' | 'restaurant' | 'cafe', lat, lon }] (bez názvu a polohy pryč). */
export function foodRows(json) {
  const out = [];
  for (const e of json?.elements || []) {
    const t = e.tags || {};
    const lat = Number(e.lat ?? e.center?.lat);
    const lon = Number(e.lon ?? e.center?.lon);
    if (!t.name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({ id: `${e.type}/${e.id}`, name: String(t.name).slice(0, 80), kind: t.tourism === 'alpine_hut' ? 'hut' : t.amenity === 'cafe' ? 'cafe' : 'restaurant', lat, lon });
  }
  return out;
}

// vzdálenost bodu od úsečky (km) a poloha na ní 0–1 – na pár set metrů stačí rovina
function segDist(p, a, b) {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ax = (a[0] - p.lon) * kx; const ay = (a[1] - p.lat) * 110.57;
  const dx = (b[0] - a[0]) * kx; const dy = (b[1] - a[1]) * 110.57;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  return { d: Math.hypot(ax + t * dx, ay + t * dy), t };
}

/**
 * Chaty a restaurace u trasy dne (do FOOD_M): km od startu při prvním průchodu, bez těch u startu (do 0,4 km – to je
 * obec, odkud se jde), jedno jméno jednou, nejvýš 4 podle pořadí na trase.
 */
export function foodOnRoute(rows, geometry, { maxKm = FOOD_M / 1000, skipKm = 0.4 } = {}) {
  if (!Array.isArray(rows) || !Array.isArray(geometry) || geometry.length < 2) return [];
  const cum = cumKm(geometry);
  const start = { lat: geometry[0][1], lon: geometry[0][0] };
  const hits = [];
  for (const r of rows) {
    if (dist(start, r) <= skipKm) continue;
    for (let i = 1; i < geometry.length; i++) {
      const s = segDist(r, geometry[i - 1], geometry[i]);
      if (s.d <= maxKm) { hits.push({ name: r.name, kind: r.kind, km: r1(cum[i - 1] + s.t * (cum[i] - cum[i - 1])), lat: r.lat, lon: r.lon }); break; }
    }
  }
  const seen = new Set();
  return hits.sort((a, b) => a.km - b.km).filter((h) => !seen.has(normalize(h.name)) && seen.add(normalize(h.name))).slice(0, 4);
}

/**
 * Občerstvení kolem čar dnů – jeden dotaz Overpass na plán (lines = [[[lon, lat]…]…]), v mezipaměti 30 dní (prázdné
 * 1 den). Výpadek nebo pomalá odpověď → výjimka (plán pak napíše „neznám“) a 10 minut se Overpass nezkouší.
 */
export async function foodAlong(lines, { onMiss } = {}) {
  const query = foodQuery(lines);
  const key = `overpass-food:${createHash('sha1').update(query).digest('base64url').slice(0, 22)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (Date.now() < overpassDownUntil) throw new Error('Overpass je chvíli mimo provoz.');
  if (onMiss) onMiss();
  try {
    return await cache.wrap(key, (v) => (v.length ? 30 * 864e5 : 864e5), async () => foodRows(await limitOverpass(() => request(OVERPASS, {
      method: 'POST', body: `data=${encodeURIComponent(query)}`, timeoutMs: 15000, retries: 0,
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    }))));
  } catch (e) {
    if (e?.code !== 'LIMIT') overpassDownUntil = Date.now() + 10 * 60e3;
    throw e;
  }
}

/* ---------- varianty: do deště a s dětmi ---------- */
const EXPOSED = new Set(['summit', 'ridge', 'rocks', 'view']);
const near = (c, pt, maxKm) => c && pt && dist(c, pt) <= maxKm;
/**
 * Kratší varianta do deště a mlhy: jeskyně v dosahu (pod střechou), jinak jen k chatě po cestě a zpět (do 60 % cesty
 * k cíli), jinak blízký nižší cíl (voda, hrad, chata do 3 km od startu, odhad), jinak otočit v půlce.
 * → { kind: 'cave' | 'hut' | 'goal' | 'turn', name?, km, minutes?, estimate? }
 */
export function rainAlt(leg, food, cands, start, goal) {
  const cave = cands.find((c) => c.kind === 'cave' && c.id !== goal.id && near(c, start, 12));
  if (cave) return { kind: 'cave', name: cave.name, lat: cave.lat, lon: cave.lon, km: r1(dist(start, cave)) };
  const half = leg && leg.km ? leg.km / 2 : 0;
  const hut = (food || []).find((f) => f.km >= 1 && f.km <= 0.6 * half);
  if (hut) return { kind: 'hut', name: hut.name, km: r1(2 * hut.km), ...(leg.minutes ? { minutes: Math.round((leg.minutes * 2 * hut.km) / leg.km) } : {}) };
  const low = cands.find((c) => c.id !== goal.id && ['water', 'castle', 'hut'].includes(c.kind) && near(c, start, 3));
  if (low) return { kind: 'goal', name: low.name, lat: low.lat, lon: low.lon, km: estimateLeg(start, low).km, estimate: true };
  return { kind: 'turn', km: r1(half), ...(leg && leg.minutes ? { minutes: Math.round(leg.minutes / 2) } : {}) };
}

/**
 * S dětmi: túra do 8 km a 400 m stoupání je v pořádku; jinak jen k chatě po cestě (do 3 km), blízký lehký cíl (do 2,5 km
 * od startu, odhad), nebo otočit po hodině.
 */
export function kidsAlt(leg, food, cands, start, goal) {
  if (leg && !leg.estimate && leg.km <= 8 && (leg.ascent || 0) <= 400) return { kind: 'ok' };
  const hut = (food || []).find((f) => f.km >= 0.8 && f.km <= 3);
  if (hut) return { kind: 'hut', name: hut.name, km: r1(2 * hut.km), ...(leg && leg.minutes && !leg.estimate ? { minutes: Math.round((leg.minutes * 2 * hut.km) / leg.km) } : {}) };
  const easy = cands.find((c) => c.id !== goal.id && EASY.has(c.kind) && near(c, start, 2.5));
  if (easy) return { kind: 'goal', name: easy.name, lat: easy.lat, lon: easy.lon, km: estimateLeg(start, easy).km, estimate: true };
  return { kind: 'turn', minutes: 60 };
}

/* ---------- den a plán ---------- */
/** Den plánu: okno, cíl, start, trasa (nebo odhad), obtížnost, občerstvení, varianty a položka pro plánovač cesty. */
export function assembleDay(win, goal, { start, leg, food, cands, kids, base }) {
  const day = { date: win.date, type: win.type, from: toHm(win.from), to: toHm(win.to), budget: win.budget, ...(win.arrival ? { arrival: true } : {}), ...(win.departure ? { departure: true } : {}) };
  if (!goal) {
    day.note = win.type === 'rest' ? (win.arrival ? 'arrival' : win.departure ? 'departure' : 'rest') : 'nogoal';
    day.items = [];
    return day;
  }
  const g = { id: goal.id, name: goal.name, kind: goal.kind, theme: goal.theme, lat: goal.lat, lon: goal.lon, ...(goal.url ? { url: goal.url } : {}) };
  if (!start) {
    // start neznám (Wikidata u cíle nic, daleko od ubytování): cíl a odkaz do Mapy.com
    day.hike = { goal: g, start: null, km: null, ascent: null, descent: null, minutes: null, estimate: true, difficulty: null, food: null,
      mapyUrl: `https://mapy.com/fnc/v1/showmap?${new URLSearchParams({ mapset: 'outdoor', center: `${goal.lon.toFixed(5)},${goal.lat.toFixed(5)}`, zoom: '14', marker: 'true' })}`,
      googleUrl: `https://www.google.com/maps/search/?api=1&query=${goal.lat.toFixed(5)},${goal.lon.toFixed(5)}` };
    day.items = [{ id: goal.id, name: `🥾 ${goal.name}`, lat: goal.lat, lon: goal.lon, category: 'nature', visitMin: 0 }];
    return day;
  }
  const s = [start.lon, start.lat];
  const geometry = leg.geometry ? thinGeometry(leg.geometry) : null;
  const ele = geometry ? geometry.map((c) => c[2]).filter(Number.isFinite) : [];
  const minutes = leg.minutes ?? null;
  day.hike = {
    goal: g, start,
    km: leg.km, ascent: leg.ascent ?? null, descent: leg.descent ?? null, minutes, estimate: Boolean(leg.estimate),
    ...(ele.length ? { top: Math.max(...ele) } : {}),
    difficulty: difficulty({ km: leg.km, ascent: leg.ascent, minutes }),
    // zpět kolem: start okna + chůze + přestávky (sunSlot v aplikaci porovná se západem slunce)
    ...(minutes ? { back: toHm(Math.min(23 * 60 + 59, win.from + Math.round(minutes * BREAKS))) } : {}),
    // na celou túru dnes není čas (u odhadu aspoň samotná chůze po rovině 4 km/h) – aplikace poradí otočit včas
    ...((minutes || hikeMinutes(leg.km, 0, 0)) > win.budget ? { long: true } : {}),
    food: food === null ? null : food || [],
    rain: rainAlt(leg, food, cands, start, goal),
    ...(kids ? { kids: kidsAlt(leg, food, cands, start, goal) } : {}),
    exposed: EXPOSED.has(goal.kind),
    ...(geometry ? { geometry, trailPct: leg.trailPct ?? null } : {}),
    mapyUrl: geometry ? mapyUrl(s, geometry, 'hike') : mapyUrl(s, [], 'hike', [goal.lon, goal.lat]),
    googleUrl: geometry ? googleUrl(s, geometry, 'walking') : googleUrl(s, [], 'walking', [goal.lon, goal.lat]),
  };
  const stats = [`${String(leg.km).replace('.', ',')} km`, leg.ascent != null ? `↗ ${leg.ascent} m` : '', minutes ? `~${Math.floor(minutes / 60)} h ${minutes % 60} min chůze` : 'odhad'].filter(Boolean).join(', ');
  day.items = [{ id: goal.id, name: `🥾 ${goal.name} – z: ${start.kind === 'base' ? base.label || 'ubytování' : start.name}`, lat: goal.lat, lon: goal.lon, category: 'nature', visitMin: minutes || 0, note: stats }];
  return day;
}

/**
 * Pořadí túr podle času dnů: túry (s trasou nebo odhadem) se mezi dny s túrou přehází tak, aby co nejméně přesahovaly
 * čas chůze dne (den příjezdu a odjezdu bývá kratší) – při shodě zůstane původní pořadí (hlavní vrchol v nejdelší den).
 * Do 6 dnů s túrou všechny permutace (720), víc beze změny. → pole indexů: na den idx[k] patří túra perm[k].
 */
export function fitOrder(legs, wins) {
  const idx = legs.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2 || idx.length > 6) return { idx, perm: idx };
  const need = (l) => l.minutes ?? hikeMinutes(l.km, 0, 0);
  const cost = (perm) => perm.reduce((s, from, k) => s + Math.max(0, need(legs[from]) - wins[idx[k]].budget), 0);
  let best = idx;
  let bestCost = cost(idx);
  const walk = (rest, acc) => {
    if (!rest.length) { const c = cost(acc); if (c < bestCost) { best = acc; bestCost = c; } return; }
    for (let k = 0; k < rest.length; k++) walk([...rest.slice(0, k), ...rest.slice(k + 1)], [...acc, rest[k]]);
  };
  if (bestCost > 0) walk(idx, []);
  return { idx, perm: best };
}

// Výsledek p, nebo null po ms (dotaz dál běží do mezipaměti).
function within(p, ms) {
  let t;
  return Promise.race([p, new Promise((res) => { t = setTimeout(res, ms, null); })]).finally(() => clearTimeout(t));
}
const isLimit = (e) => e?.code === 'LIMIT';

/**
 * Plán túr. q: { lat, lon, label (ubytování / místo), start, end (YYYY-MM-DD), arrivalTime, departureTime ('HH:MM'),
 * kids, fromBase (false = střed oblasti z Objevuj, ne ubytování – každý den start u cíle), radius (okruh načtených míst
 * v Objevuj – stejná mezipaměť), exclude (id vyřazených cílů), onMiss (limit dotazů mimo mezipaměť) }.
 * deps = náhrady zdrojů pro testy a DEMO (places, trailheads, route, food).
 */
export async function planHikes(q, deps = {}) {
  const { places = findPlaces, trailheads = trailheadsNear, route = hikeThereBack, food = foodAlong, now = Date.now } = deps;
  const t0 = now();
  const base = { lat: q.lat, lon: q.lon, label: q.label || '' };
  const fromBase = q.fromBase !== false;
  const kids = Boolean(q.kids);
  const wins = hikeWindows({ ...q, kids });
  const radiusKm = Math.min(25, Math.max(5, Number(q.radius) || 15));
  const pool = await places({ lat: q.lat, lon: q.lon, radiusKm, dayTrips: Boolean(q.radius) });
  const cands = goalCandidates(pool, base, { exclude: new Set((q.exclude || []).map(String)) });
  const goals = pickGoals(cands, wins, { kids, fromBase });
  // start: z ubytování, jinak u cíle (Wikidata, dotazy souběžně – fronta Wikidat je stejně omezená)
  const starts = await Promise.all(goals.map(async (g) => {
    if (!g) return null;
    if (fromBase && g.d <= WALK_KM) return pickStart(g, base, [], { fromBase });
    let th = [];
    try { th = (await within(trailheads(g.lat, g.lon, q.onMiss), TH_WAIT_MS)) || []; } catch (e) { if (isLimit(e)) throw e; }
    return pickStart(g, base, th, { fromBase });
  }));
  // trasy po jedné (BRouter má frontu s mezerou), nejvýš MAX_ROUTES a ROUTE_BUDGET_MS; dvě chyby za sebou = výpadek
  const legs = [];
  let routed = 0;
  let failed = 0;
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    const s = starts[i];
    if (!g || !s) { legs.push(null); continue; }
    let leg = null;
    if (routed < MAX_ROUTES && failed < 2 && now() - t0 < ROUTE_BUDGET_MS) {
      try {
        leg = await route(s, g, { onMiss: q.onMiss });
        routed++;
        failed = 0;
      } catch (e) {
        if (isLimit(e)) throw e;
        failed++;
      }
    }
    legs.push(leg || estimateLeg(s, g));
  }
  // túry, které se do svého dne nevejdou, prohodit s jinými dny (dlouhá túra ne v den příjezdu)
  const { idx, perm } = fitOrder(legs, wins);
  if (perm !== idx) {
    const [g0, s0, l0] = [[...goals], [...starts], [...legs]];
    idx.forEach((day, k) => { goals[day] = g0[perm[k]]; starts[day] = s0[perm[k]]; legs[day] = l0[perm[k]]; });
  }
  // občerstvení: jeden dotaz na čáry všech dnů (bez trasy rovná čára start → cíl)
  const lines = legs.map((l, i) => (l ? linePoints(l.geometry || [[starts[i].lon, starts[i].lat], [goals[i].lon, goals[i].lat]]) : null));
  let rows = null;
  if (lines.some(Boolean)) {
    try { rows = await food(lines.filter(Boolean), { onMiss: q.onMiss }); } catch (e) { if (isLimit(e)) throw e; rows = null; }
  }
  // varianty do deště a s dětmi napřed z cílů, které v plánu nejsou (jinak cíl jiného dne)
  const inPlan = new Set(goals.filter(Boolean).map((g) => g.id));
  const altCands = [...cands.filter((c) => !inPlan.has(c.id)), ...cands.filter((c) => inPlan.has(c.id))];
  const days = wins.map((w, i) => {
    const leg = legs[i];
    // bez trasy jen to, co je u cíle (rovná čára k cíli trasou není)
    const f = rows === null || !leg ? null : leg.geometry ? foodOnRoute(rows, leg.geometry)
      : foodOnRoute(rows, [[starts[i].lon, starts[i].lat], [goals[i].lon, goals[i].lat]]).filter((x) => dist(x, goals[i]) <= 0.5);
    return assembleDay(w, goals[i], { start: starts[i], leg, food: f, cands: altCands, kids, base });
  });
  const spare = cands.filter((c) => !inPlan.has(c.id)).slice(0, 8).map(({ id, name, kind, lat, lon, d }) => ({ id, name, kind, lat, lon, d }));
  const warnings = [];
  if (!cands.length) warnings.push('V okolí jsem nenašel cíle túr (vrcholy, vodopády, jezera, skály ani chaty) – zkus jedno místo s okruhem v režimu 🥾 Pěšky, nebo Program po místech.');
  else if (legs.some((l) => l && l.estimate)) warnings.push(routed ? `Trasu jsem spočítal jen u ${routed === 1 ? 'jedné túry' : `${routed} túr`} – u ostatních je odhad vzdušnou čarou; trasu si naplánuj v Mapy.com.` : 'Plánovač tras teď neodpovídá – u túr je odhad vzdušnou čarou; trasu si naplánuj v Mapy.com, nebo to zkus za chvíli.');
  return { kind: 'hike', area: natureAreaAt(q.lat, q.lon), base, fromBase, kids, days, spare, warnings, food: rows !== null, routed };
}

/* ---------- DEMO (bez sítě) ---------- */
// Vymyšlené cíle kolem bodu: [název, kategorie, druh přírody, skóre, km, směr °, převýšení m, popis]
const DEMO_GOALS = [
  ['Ukázkový vrchol', 'nature', 'mountain', 62, 4.2, 20, 760, ''], ['Ukázkový vodopád', 'nature', 'waterfall', 34, 2.6, 130, 180, ''],
  ['Ukázkové skály', 'nature', '', 30, 4.6, 250, 420, ''], ['Ukázková chata', 'sight', '', 24, 1.9, 300, 260, 'horská chata'],
  ['Ukázková rozhledna', 'viewpoint', '', 22, 3.1, 80, 300, ''], ['Ukázkový hřbet', 'nature', 'mountain', 40, 5.2, 190, 640, ''],
];
const demoAt = (q, km, deg) => ({ lat: q.lat + (km / 111) * Math.cos((deg * Math.PI) / 180), lon: q.lon + (km / (111 * Math.cos((q.lat * Math.PI) / 180))) * Math.sin((deg * Math.PI) / 180) });
/** DEMO: stejný plánovač nad vymyšlenými cíli, trasami (oblouk tam a zpět s převýšením) a chatou po cestě. */
export function mockHikePlan(q) {
  const items = DEMO_GOALS.map(([name, category, natureType, score, km, deg, , description], i) => ({ id: `demoHike${i}`, name, category, ...(natureType ? { natureType } : {}), score, description, ...demoAt(q, km, deg) }));
  const rise = new Map(DEMO_GOALS.map(([name, , , , , , up]) => [name, up]));
  const route = async (s, g) => {
    const up = rise.get(g.name) || 300;
    const pts = 40;
    const bulge = 0.004;
    const geometry = Array.from({ length: pts * 2 + 1 }, (_, i) => {
      const t = i <= pts ? i / pts : 2 - i / pts;
      const side = i <= pts ? 1 : -1;
      return [s.lon + (g.lon - s.lon) * t + side * bulge * Math.sin(Math.PI * t), s.lat + (g.lat - s.lat) * t, 700 + Math.round(up * Math.sin((Math.PI / 2) * t))];
    });
    const km = Math.round(2 * dist(s, g) * WIND * 10) / 10;
    return { km, ascent: up, descent: up, minutes: hikeMinutes(km, up, up), geometry, trailPct: 70 };
  };
  const food = async (lines) => {
    const l = lines[0] || [];
    const p = l[Math.floor(l.length / 3)] || l[0];
    return p ? [{ id: 'node/1', name: 'Demo chata', kind: 'hut', lat: p[1], lon: p[0] }] : [];
  };
  return planHikes(q, { places: async () => items, trailheads: async (lat, lon) => [{ name: 'Demo parkoviště', kind: 'parking', lat: lat - 0.02, lon, sitelinks: 0 }], route, food });
}
