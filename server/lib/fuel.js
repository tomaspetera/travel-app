// Aktuální ceny pohonných hmot (Kč/l) pro cenu cesty autem: nafta (výchozí) a benzín Natural 95.
// ČR: ČSÚ – týdenní průměrné spotřebitelské ceny PHM (DataStat API, sada CENPHMT, otevřená data CC0; nový týden
// vychází v pátek ráno). Sousední země (DE, AT, SK, PL, HU) a záloha pro ČR: Evropská komise – Weekly Oil Bulletin,
// ceny s daněmi (XLSX, EUR za 1000 l k pondělí; na Kč přes fx.js). Každý zdroj nejvýš 1× za 24 h (po chybě znovu
// za 2 h), timeout 8 s; mezitím platí poslední známé ceny (stale-while-revalidate – hledání na síť nikdy nečeká),
// bez dat vestavěné ceny s datem. DEMO (ATLAS_MOCK=1) a FUEL_LIVE=0 = pevné ceny bez sítě.
import { inflateRawSync } from 'node:zlib';
import { config } from '../config.js';
import { request, HttpError } from './http.js';
import { loadRates, convert, fxInfo } from './fx.js';
import { addDays } from './dates.js';

const UA = 'ATLAS-travel/2.0 (+https://atlas-letenky.onrender.com; hobby travel planner)';
// Poslední 2 týdny, nafta (0722101) a Natural 95 (0722201), jen cena v Kč/l (ukazatel 6621T) → JSON-stat, ~2 kB.
export const CZSO_URL = 'https://data.csu.gov.cz/api/dotaz/v1/data/sady/CENPHMT/vlastni?CASTPHM.poslednich=2&CENPHM=0722101,0722201&IndicatorType=6621T';
const CZSO_INFO = 'https://data.csu.gov.cz/datastat/info/SADA/CENPHMT';
// „Weekly prices with taxes“ – dokument má stálé ID, soubor se v něm každý týden vymění (~17 kB).
export const WOB_URL = 'https://energy.ec.europa.eu/document/download/264c2d0f-f161-4ea3-a777-78faae59bea0_en';
const WOB_PAGE = 'https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en';
const TTL_MS = 24 * 3600e3;
const RETRY_MS = 2 * 3600e3;
const timeoutMs = () => Number(process.env.FUEL_TIMEOUT_MS) || 8000;
const offline = () => config.mock || process.env.FUEL_LIVE === '0';

export const FUELS = ['diesel', 'petrol'];
export const DEFAULT_FUEL = 'diesel';
export const COUNTRIES = ['CZ', 'DE', 'AT', 'SK', 'PL', 'HU'];
// Běžná spotřeba osobního auta (l/100 km), když ji uživatel nezadá.
export const DEFAULT_L_PER_100 = { diesel: 6, petrol: 7 };
const FUEL_CS = { diesel: 'nafta', petrol: 'benzín N95' };

// Elektroauto: nabíjení bez předplatného (ad hoc, Kč/kWh) podle ceníků provozovatelů k 6. 10. 2026 (průzkum webů;
// Tesla, Shell a MOL ze sekundárních zdrojů). ac / dc = cena na AC / DC nabíječce, price = cena bez rozlišení.
// Cesta na letiště po dálnici = rychlonabíjení DC: odhad 16 Kč/kWh (běžně 13–22; liší se podle provozovatele, výkonu
// nabíječky a členství či předplatného – s ním bývá levněji). Spotřeba 19 kWh/100 km (dálnice, celoročně).
export const DEFAULT_KWH_PER_100 = 19;
export const EV_DC = {
  default: 16,
  range: [13, 22],
  date: '2026-10-06',
  operators: [
    { name: 'ČEZ', ac: 16.9, dc: 22.9 },
    { name: 'PRE', ac: 13, dc: 15 },
    { name: 'E.ON', price: [10.5, 20] },
    { name: 'IONITY', dc: 21 },
    { name: 'Shell Recharge', price: 15, secondary: true },
    { name: 'MOL Plugee', ac: 14.5, dc: 15.5, secondary: true },
    { name: 'Tesla Supercharger', dc: [8, 14], note: 'pro auta jiných značek', secondary: true },
  ],
};
export const EV_LABEL = 'nabíjení DC ~16 Kč/kWh (ceníky ČEZ, PRE, E.ON, IONITY, Tesla – stav 6. 10. 2026)';

// 16,9 → „16,90“, 13 → „13“, [8, 14] → „8–14“
const kwh = (v) => (Array.isArray(v) ? v.map(kwh).join('–') : Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','));
/** Řádek ceníku: „ČEZ 16,90 (AC) / 22,90 (DC)“, „Tesla Supercharger 8–14 (DC, pro auta jiných značek)“. */
export function evOperatorText(o) {
  const parts = [o.ac != null ? `${kwh(o.ac)} (AC)` : '', o.dc != null ? `${kwh(o.dc)} (DC${o.note && o.ac == null ? `, ${o.note}` : ''})` : '', o.price != null ? kwh(o.price) : ''];
  return `${o.name} ${parts.filter(Boolean).join(' / ')}${o.note && o.dc == null ? ` (${o.note})` : ''}${o.secondary ? ' *' : ''}`;
}

// Vestavěné ceny (Kč/l): ČR = ČSÚ 40. týden 2026 (28. 9.–4. 10.), ostatní = Weekly Oil Bulletin k 28. 9. 2026
// přepočtený kurzem ECB 24,397 Kč/EUR ze stejného dne.
export const FALLBACK = {
  date: '2026-09-28',
  prices: {
    CZ: { diesel: 50.65, petrol: 45.87 },
    DE: { diesel: 59.46, petrol: 57.21 },
    AT: { diesel: 55.11, petrol: 47.72 },
    SK: { diesel: 48.26, petrol: 45.21 },
    PL: { diesel: 50.27, petrol: 45.2 },
    HU: { diesel: 47.14, petrol: 42.19 },
  },
};

const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const czDate = (ymd, year = true) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return year ? `${d}. ${m}. ${y}` : `${d}. ${m}.`;
};

/** Pondělí ISO týdne: '2026-W40' → '2026-09-28'. */
export function isoWeekStart(code) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(code));
  if (!m) return null;
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7;
  return new Date(jan4 + ((Number(m[2]) - 1) * 7 - dow) * 864e5).toISOString().slice(0, 10);
}

// ---------- ČSÚ (JSON-stat 2.0) ----------

const CZSO_FUEL = { diesel: '0722101', petrol: '0722201' };
const okCzk = (v) => Number.isFinite(v) && v >= 10 && v <= 150;

/** Odpověď DataStat API → { diesel, petrol, week, date (pondělí), period, updated } za poslední úplný týden. */
export function parseCzso(js) {
  const ids = js?.id;
  const size = js?.size;
  const dims = js?.dimension;
  if (!Array.isArray(ids) || !Array.isArray(size) || !dims) throw new Error('ČSÚ: neplatná odpověď (JSON-stat)');
  const index = (d) => dims[d]?.category?.index;
  const pos = (d, code) => {
    const ix = index(d);
    const i = Array.isArray(ix) ? ix.indexOf(code) : ix?.[code];
    return i == null || i < 0 ? undefined : i;
  };
  const stride = [];
  for (let i = ids.length - 1, s = 1; i >= 0; s *= size[i], i--) stride[i] = s;
  const timeDim = js.role?.time?.[0] || 'CASTPHM';
  const fixed = {};
  for (const d of ids) {
    if (pos(d, '6621T') !== undefined) fixed[d] = '6621T';
    else if (pos(d, 'CZ') !== undefined) fixed[d] = 'CZ';
  }
  const value = (sel) => {
    let k = 0;
    for (let i = 0; i < ids.length; i++) {
      const p = ids[i] in sel ? pos(ids[i], sel[ids[i]]) : size[i] === 1 ? 0 : undefined;
      if (p === undefined) return null;
      k += p * stride[i];
    }
    const v = Array.isArray(js.value) ? js.value[k] : js.value?.[k];
    return v == null ? null : Number(v);
  };
  const ix = index(timeDim) || {};
  const weeks = (Array.isArray(ix) ? ix : Object.keys(ix)).filter((w) => /^\d{4}-W\d{2}$/.test(w)).sort().reverse();
  for (const week of weeks) {
    const diesel = value({ ...fixed, CENPHM: CZSO_FUEL.diesel, [timeDim]: week });
    const petrol = value({ ...fixed, CENPHM: CZSO_FUEL.petrol, [timeDim]: week });
    if (okCzk(diesel) && okCzk(petrol)) {
      return { diesel: r2(diesel), petrol: r2(petrol), week, date: isoWeekStart(week), period: `${Number(week.slice(6))}. týden ${week.slice(0, 4)}`, updated: js.updated || null };
    }
  }
  throw new Error('ČSÚ: v odpovědi chybí ceny nafty a benzínu');
}

// ---------- XLSX (ZIP + XML) bez knihoven ----------

/** Minimální čtečka ZIP: { names, read(name) → Buffer | null }. Podporuje uložené (0) a deflate (8) soubory. */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('XLSX: soubor není ZIP');
  const entries = new Map();
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('XLSX: poškozený ZIP');
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const entry = { method: buf.readUInt16LE(p + 10), size: buf.readUInt32LE(p + 20), local };
    entries.set(buf.toString('utf8', p + 46, p + 46 + nameLen), entry);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.local + 30 > buf.length || buf.readUInt32LE(e.local) !== 0x04034b50) throw new Error('XLSX: poškozený ZIP');
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const raw = buf.subarray(start, start + e.size);
      if (e.method === 0) return raw;
      if (e.method === 8) return inflateRawSync(raw, { maxOutputLength: 32 << 20 });
      throw new Error(`XLSX: nepodporovaná komprese ${e.method}`);
    },
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] !== '#') return ENT[e] ?? m;
  return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
});
const texts = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join('');

/** První list sešitu XLSX → řádky jako pole hodnot (řetězec / číslo / bool / null), indexy od 0. */
export function xlsxRows(buf) {
  const zip = readZip(buf);
  const str = (name) => zip.read(name)?.toString('utf8') ?? '';
  const shared = [...str('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  let sheet = 'xl/worksheets/sheet1.xml';
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(str('xl/workbook.xml'))?.[1];
  const rel = rid && str('xl/_rels/workbook.xml.rels').match(/<Relationship\b[^>]*>/g)?.find((r) => r.includes(`Id="${rid}"`));
  const target = rel && /\bTarget="([^"]+)"/.exec(rel)?.[1];
  if (target) sheet = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const xml = str(sheet);
  if (!xml) throw new Error('XLSX: chybí list s daty');
  const rows = [];
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = /\br="([A-Z]+)(\d+)"/.exec(m[1]);
    if (!ref) continue;
    const t = /\bt="([^"]+)"/.exec(m[1])?.[1] || 'n';
    const body = m[2] || '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    let val = null;
    if (t === 's') val = v == null ? null : shared[Number(v)] ?? null;
    else if (t === 'inlineStr') val = texts(body);
    else if (t === 'str' || t === 'e') val = v == null ? null : unxml(v);
    else if (t === 'b') val = v === '1';
    else if (v != null && v !== '') val = Number(v);
    const col = [...ref[1]].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    (rows[Number(ref[2]) - 1] ||= [])[col] = val;
  }
  return rows;
}

// ---------- Weekly Oil Bulletin ----------

const WOB_COUNTRY = {
  austria: 'AT', belgium: 'BE', bulgaria: 'BG', croatia: 'HR', cyprus: 'CY', czechia: 'CZ', 'czech republic': 'CZ',
  denmark: 'DK', estonia: 'EE', finland: 'FI', france: 'FR', germany: 'DE', greece: 'GR', hungary: 'HU', ireland: 'IE',
  italy: 'IT', latvia: 'LV', lithuania: 'LT', luxembourg: 'LU', malta: 'MT', netherlands: 'NL', poland: 'PL',
  portugal: 'PT', romania: 'RO', slovakia: 'SK', slovenia: 'SI', spain: 'ES', sweden: 'SE',
};

/** Datum z buňky: sériové číslo Excelu, 2026-09-28 nebo 28/09/2026 → 'YYYY-MM-DD' | null. */
function cellDate(v) {
  if (typeof v === 'number' && v > 30000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  const s = String(v ?? '');
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** „Weekly prices with taxes“ (XLSX) → { date, eur: { CZ: { diesel, petrol }, DE: … } } v EUR za litr. */
export function parseWob(buf) {
  const rows = xlsxRows(buf);
  const isPetrol = (c) => /euro-?super\s*95/i.test(String(c ?? ''));
  const hi = rows.findIndex((r) => r?.some(isPetrol));
  if (hi < 0) throw new Error('Oil Bulletin: v tabulce chybí Euro-super 95');
  const head = Array.from(rows[hi], (c) => String(c ?? ''));
  if (!head.some((c) => /\bEUR\b/.test(c))) throw new Error('Oil Bulletin: ceny nejsou v EUR');
  const colP = head.findIndex(isPetrol);
  const colD = head.findIndex((c) => /automotive gas oil|gas oil automobile|dieselkraftstoff/i.test(c));
  if (colD < 0) throw new Error('Oil Bulletin: v tabulce chybí nafta');
  const units = rows[hi + 1] || [];
  // ceny bývají v EUR za 1000 l (řádek jednotek „1000 l“); bez něj podle velikosti čísla
  const perL = (col, x) => (/1\s*000\s*l/i.test(String(units[col] ?? '')) || x > 50 ? x / 1000 : x);
  const eur = {};
  for (const r of rows.slice(hi + 1)) {
    const cc = WOB_COUNTRY[String(r?.[0] ?? '').trim().toLowerCase()];
    if (!cc || r[colP] == null || r[colD] == null) continue;
    const petrol = perL(colP, Number(r[colP]));
    const diesel = perL(colD, Number(r[colD]));
    if (petrol >= 0.3 && petrol <= 6 && diesel >= 0.3 && diesel <= 6) eur[cc] = { diesel: r4(diesel), petrol: r4(petrol) };
  }
  if (!Object.keys(eur).length) throw new Error('Oil Bulletin: v tabulce nejsou ceny');
  return { date: cellDate(units[0]), eur };
}

// ---------- stahování ----------

async function fetchBuffer(url) {
  const ms = timeoutMs();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal, redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) throw new HttpError(res.status, url, buf.toString('utf8', 0, 300));
    return buf;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Timeout ${ms} ms: ${url.split('?')[0]}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function loadCzso() {
  return parseCzso(await request(CZSO_URL, { timeoutMs: timeoutMs(), retries: 0, headers: { 'User-Agent': UA } }));
}

async function loadWob() {
  let buf;
  try {
    buf = await fetchBuffer(WOB_URL);
  } catch (e) {
    if (e.status !== 404 && e.status !== 410) throw e;
    // Dokument dostal nové ID → odkaz „prices with taxes“ ze stránky bulletinu.
    const html = await request(WOB_PAGE, { as: 'text', timeoutMs: timeoutMs(), retries: 0, headers: { 'User-Agent': UA } });
    const href = /href="([^"]*\/document\/download\/[^"]*prices(?:%20|\s|_|-)+with(?:%20|\s|_|-)+taxes[^"]*)"/i.exec(html)?.[1];
    if (!href) throw e;
    buf = await fetchBuffer(new URL(href.replace(/&amp;/g, '&'), WOB_PAGE).href);
  }
  return parseWob(buf);
}

// ---------- mezipaměť (stale-while-revalidate) ----------

const LOADERS = { czso: loadCzso, wob: loadWob };
const blank = () => ({ data: null, okAt: 0, triedAt: 0, error: null });
let state = { czso: blank(), wob: blank() };
let snap = null;
let inflight = null;
let now = () => Date.now();

/** Jen pro testy: zapomene stažené ceny; clock = náhrada Date.now. */
export function resetFuel({ clock } = {}) {
  state = { czso: blank(), wob: blank() };
  snap = null;
  inflight = null;
  now = clock || (() => Date.now());
}

// Zdroj je na řadě, když poslední úspěch je starší než 24 h a poslední pokus než 2 h.
const due = (id) => now() - state[id].okAt >= TTL_MS && now() - state[id].triedAt >= RETRY_MS;

function withTimeout(p, ms) {
  let t;
  return Promise.race([Promise.resolve(p).catch(() => {}), new Promise((r) => { t = setTimeout(r, ms); })]).finally(() => clearTimeout(t));
}

const eurToCzk = (x) => {
  const v = convert(x, 'EUR', 'CZK');
  return okCzk(v) ? r2(v) : null;
};

function compose() {
  const c = state.czso.data;
  const w = state.wob.data;
  const prices = {};
  for (const cc of COUNTRIES) {
    const e = w?.eur?.[cc];
    const fromWob = e && { diesel: eurToCzk(e.diesel), petrol: eurToCzk(e.petrol) };
    const wobOk = fromWob?.diesel && fromWob?.petrol;
    // ČR z ČSÚ; z bulletinu jen když ČSÚ chybí nebo je o víc než týden starší
    if (cc === 'CZ' && c && !(wobOk && w.date && c.date && addDays(c.date, 7) < w.date)) {
      const label = `ČSÚ, ${c.period} (${czDate(c.date, false)}–${czDate(addDays(c.date, 6), false)})`;
      prices.CZ = { diesel: c.diesel, petrol: c.petrol, date: c.date, source: 'czso', label };
    } else if (wobOk) {
      prices[cc] = { ...fromWob, date: w.date, source: 'wob', label: `Oil Bulletin EU${w.date ? `, k ${czDate(w.date)}` : ''}`, eur: { ...e } };
    } else {
      prices[cc] = { ...FALLBACK.prices[cc], date: FALLBACK.date, source: 'builtin', label: `orientačně, k ${czDate(FALLBACK.date)}` };
    }
  }
  const at = (t) => (t ? new Date(t).toISOString() : null);
  const meta = (s) => ({ ok: !!s.data, date: s.data?.date ?? null, fetched: at(s.okAt), ...(s.error ? { error: s.error } : {}) });
  const fx = fxInfo();
  const sources = [
    { id: 'czso', name: 'ČSÚ', title: 'Průměrné spotřebitelské ceny pohonných hmot – týdenní', url: CZSO_INFO, ...meta(state.czso), period: c?.period ?? null },
    { id: 'wob', name: 'Weekly Oil Bulletin (Evropská komise)', title: 'Weekly prices with taxes', url: WOB_PAGE, ...meta(state.wob), fx: w ? { source: fx.source, eurCzk: fx.eurCzk } : null },
  ];
  if (Object.values(prices).some((p) => p.source === 'builtin')) {
    sources.push({ id: 'builtin', name: 'vestavěné orientační ceny', ok: true, date: FALLBACK.date });
  }
  return { prices, updated: at(Math.max(state.czso.okAt, state.wob.okAt)), sources };
}

function fixed(source, label, name) {
  const prices = {};
  for (const cc of COUNTRIES) prices[cc] = { ...FALLBACK.prices[cc], date: FALLBACK.date, source, label };
  return { prices, updated: null, sources: [{ id: source, name, ok: true, date: FALLBACK.date }] };
}

/** Stáhne zdroje, které jsou na řadě (běží-li už stahování, vrátí ho). Výsledek = aktuální stav, nikdy nevyhodí. */
export function refreshFuel() {
  if (offline()) return Promise.resolve(fuelSnapshot());
  if (inflight) return inflight;
  const ids = Object.keys(LOADERS).filter(due);
  if (!ids.length) return Promise.resolve(snap || (snap = compose()));
  const jobs = ids.map((id) => {
    const s = state[id];
    s.triedAt = now();
    return LOADERS[id]().then(
      (data) => { s.data = data; s.okAt = now(); s.error = null; },
      (e) => { s.error = String(e?.message || e).slice(0, 200); },
    );
  });
  inflight = (async () => {
    // kurz EUR → Kč (fx.js má vlastní 6h mezipaměť) souběžně se zdroji, nejvýš po dobu timeoutu
    await Promise.all([...jobs, withTimeout(loadRates(), timeoutMs())]);
    snap = compose();
    return snap;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Ceny hned (bez čekání na síť): poslední stažené, jinak vestavěné; zastaralé se obnoví na pozadí. */
export function fuelSnapshot() {
  if (config.mock) return { ...fixed('demo', 'DEMO – pevná cena', 'DEMO – pevné ceny bez sítě'), demo: true };
  if (process.env.FUEL_LIVE === '0') return fixed('builtin', `orientačně, k ${czDate(FALLBACK.date)}`, 'vestavěné orientační ceny');
  if (!inflight && (due('czso') || due('wob'))) refreshFuel().catch(() => {});
  return snap || (snap = compose());
}

// Při studeném startu (zatím nic nestaženo) počká na první stažení (~8 s), jinak vrací hned.
async function fuelData() {
  if (!offline() && !state.czso.okAt && !state.wob.okAt) await refreshFuel();
  return fuelSnapshot();
}

/**
 * Ceny po zemích: { CZ: { diesel, petrol, date, source, label }, DE: …, AT, SK, PL, HU } v Kč/l.
 * Při studeném startu může čekat až ~8 s – v hledání proto carFuelCzk / fuelPrice / fuelSnapshot (nečekají).
 */
export async function fuelPrices() {
  return (await fuelData()).prices;
}

/** Pro GET /api/fuel: ceny po zemích + { updated, sources, defaultFuel, lPer100, ev } (ev = nabíjení elektroauta). */
export async function fuelInfo() {
  const d = await fuelData();
  const ev = { ...EV_DC, label: EV_LABEL, kwhPer100: DEFAULT_KWH_PER_100, operators: EV_DC.operators.map((o) => ({ ...o, text: evOperatorText(o) })) };
  return { ...d.prices, updated: d.updated, sources: d.sources, defaultFuel: DEFAULT_FUEL, lPer100: DEFAULT_L_PER_100, ev, ...(d.demo ? { demo: true } : {}) };
}

/** Cena litru v zemi (neznámá země → ČR): { country, fuel, perLitre, date, source, label }. Synchronní. */
export function fuelPrice(country = 'CZ', fuel = DEFAULT_FUEL) {
  const f = FUELS.includes(fuel) ? fuel : DEFAULT_FUEL;
  const { prices } = fuelSnapshot();
  const cc = String(country || '').toUpperCase();
  const code = prices[cc] ? cc : 'CZ';
  const p = prices[code];
  return { country: code, fuel: f, perLitre: p[f], date: p.date, source: p.source, label: p.label };
}

/** „nafta 50,65 Kč/l · ČSÚ, 40. týden 2026 (28. 9.–4. 10.)“ */
export function fuelText(country = 'CZ', fuel = DEFAULT_FUEL) {
  const p = fuelPrice(country, fuel);
  return `${FUEL_CS[p.fuel]} ${p.perLitre.toFixed(2).replace('.', ',')} Kč/l · ${p.label}`;
}

/**
 * Cena paliva (Kč, zaokrouhleno) za roadKm km po silnici – jedna cesta, zpáteční si volající zdvojí.
 * fuel 'diesel' (výchozí) | 'petrol', lPer100 = spotřeba l/100 km (výchozí 6 nafta / 7 benzín, rozsah 2–30),
 * country = země tankování (CZ, DE, AT, SK, PL, HU; jiná → CZ). Synchronní, nikdy nečeká na síť.
 */
export function carFuelCzk({ roadKm, fuel = DEFAULT_FUEL, lPer100, country = 'CZ' } = {}) {
  const km = Number(roadKm);
  if (!(km > 0)) return 0;
  const p = fuelPrice(country, fuel);
  const l = Number(lPer100);
  const cons = l > 0 ? Math.min(30, Math.max(2, l)) : DEFAULT_L_PER_100[p.fuel];
  return Math.round(((km * cons) / 100) * p.perLitre);
}
