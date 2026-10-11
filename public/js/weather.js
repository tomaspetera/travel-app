/* ATLAS – předpověď počasí na den výletu (Open-Meteo: zdarma, bez klíče, CC BY 4.0).
   Předpověď jde nejvýš ~15 dní dopředu; pro pozdější termíny zbývá dlouhodobý průměr (api/climate). */
(function (root) {
  const API = 'https://api.open-meteo.com/v1/forecast';
  const AHEAD = 15;
  const MNS_LOC = ['v lednu', 'v únoru', 'v březnu', 'v dubnu', 'v květnu', 'v červnu', 'v červenci', 'v srpnu', 'v září', 'v říjnu', 'v listopadu', 'v prosinci'];
  const cache = new Map();
  const ymdOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysAhead = (ymd, now = new Date()) => Math.round((Date.parse(`${ymd}T12:00:00Z`) - Date.parse(`${ymdOf(now)}T12:00:00Z`)) / 864e5);
  // Poslední den předpovědi: Open-Meteo bere end_date nejvýš datum UTC + 15 (u všech míst) – po místní půlnoci, dokud
  // v UTC ještě trvá včerejšek (v Praze do 1–2 h), by „dnes + 15“ celý dotaz shodilo (HTTP 400).
  const last = (now = new Date()) => {
    const l = ymdOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + AHEAD, 12)), u = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + AHEAD)).toISOString().slice(0, 10);
    return l < u ? l : u;
  };
  const inForecast = (ymd, now = new Date()) => daysAhead(ymd, now) >= 0 && ymd <= last(now);
  const key = (lat, lon) => `${(+lat).toFixed(2)},${(+lon).toFixed(2)}`;
  // Západ slunce 'HH:MM' (místní čas) z odpovědí předpovědi: místo@den → čas; IANA zóna místa (Promise).
  const suns = new Map();
  const zones = new Map();
  const sunKey = p => `${key(p.lat, p.lon)}@${p.date}`;

  // Denní předpověď míst locs (klíče key()) na dny start..end: jeden dotaz, v paměti 1 h → Promise<Map(místo → daily)>.
  function daily(locs, start, end, fetchFn) {
    const ck = `${locs.join('|')}@${start}..${end}`;
    let hit = cache.get(ck);
    if (!hit || hit.at < Date.now() - 36e5) {
      const qs = new URLSearchParams({
        latitude: locs.map(l => l.split(',')[0]).join(','), longitude: locs.map(l => l.split(',')[1]).join(','),
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunset',
        timezone: 'auto', start_date: start, end_date: end,
      });
      const data = (async () => {
        const r = await fetchFn(`${API}?${qs}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const list = Array.isArray(j) ? j : [j];
        // západ slunce (timezone=auto → místní čas „2026-10-10T19:19“) a zóna místa pro pozdější dny
        list.forEach((x, i) => {
          if (typeof x?.timezone === 'string' && !zones.has(locs[i])) zones.set(locs[i], Promise.resolve(x.timezone));
          (x?.daily?.time || []).forEach((t, k) => { const ss = x.daily.sunset?.[k]; if (/T\d\d:\d\d/.test(ss)) suns.set(`${locs[i]}@${t}`, ss.slice(11, 16)); });
        });
        return new Map(list.map((x, i) => [locs[i], x?.daily]));
      })();
      hit = { at: Date.now(), data };
      cache.set(ck, hit);
      data.catch(() => cache.delete(ck));
    }
    return hit.data;
  }
  // i-tý den odpovědi (daily) → { date, code, hi, lo, pop, rain }
  const dayAt = (d, i) => {
    const n = (a) => (a && a[i] != null ? Math.round(a[i]) : null);
    return { date: d.time[i], code: d.weather_code?.[i] ?? null, hi: n(d.temperature_2m_max), lo: n(d.temperature_2m_min), pop: n(d.precipitation_probability_max), rain: d.precipitation_sum?.[i] ?? null };
  };
  // Den bez kódu počasí nebo teploty jako by nebyl – poslední den rozsahu Open-Meteo mívá jen pravděpodobnost srážek.
  const full = w => w.code != null && w.hi != null;

  /**
   * points: [{ lat, lon, date }] → stejně dlouhé pole { date, code, hi, lo, pop, rain, sunset } nebo null
   * (mimo dosah předpovědi / chyba). Jeden dotaz na všechna místa najednou, výsledky v paměti 1 h.
   */
  async function forecast(points, { now = new Date(), fetchFn = root.fetch?.bind(root) } = {}) {
    const ok = points.filter(p => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && inForecast(p.date, now));
    if (!ok.length || !fetchFn) return points.map(() => null);
    const locs = [...new Map(ok.map(p => [key(p.lat, p.lon), p])).keys()];
    const dates = ok.map(p => p.date).sort();
    let byLoc;
    try { byLoc = await daily(locs, dates[0], dates.at(-1), fetchFn); } catch { return points.map(() => null); }
    return points.map(p => {
      if (!ok.includes(p)) return null;
      const d = byLoc.get(key(p.lat, p.lon));
      const i = d?.time?.indexOf(p.date) ?? -1;
      const w = i < 0 ? null : dayAt(d, i);
      return w && full(w) ? { ...w, sunset: suns.get(sunKey(p)) || null } : null;
    });
  }

  /**
   * Západ slunce podle zjednodušených vzorců NOAA (GML, „General Solar Position Calculations“; přesnost ~1–2 min):
   * minuty od půlnoci UTC daného dne, null = polární den / noc. Pro dny za hranou předpovědi.
   */
  function sunsetUtc(lat, lon, ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    if (!y || !m || !d || !Number.isFinite(+lat) || !Number.isFinite(+lon)) return null;
    const doy = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5 + 1;
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const g = ((2 * Math.PI) / (leap ? 366 : 365)) * (doy - 1 + 0.25); // zlomek roku kolem 18 h UTC
    const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const r = Math.PI / 180;
    const cosH = Math.cos(90.833 * r) / (Math.cos(lat * r) * Math.cos(decl)) - Math.tan(lat * r) * Math.tan(decl);
    if (!(cosH >= -1 && cosH <= 1)) return null;
    return 720 - 4 * (lon - Math.acos(cosH) / r) - eqTime;
  }
  // Posun zóny proti UTC v minutách v daném okamžiku (letní čas podle data); neznámá zóna → null.
  const tzFmts = new Map();
  function tzOffset(tz, ms) {
    try {
      if (!tzFmts.has(tz)) tzFmts.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));
      const p = Object.fromEntries(tzFmts.get(tz).formatToParts(new Date(ms)).map(x => [x.type, +x.value]));
      const off = (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - Math.floor(ms / 6e4) * 6e4) / 6e4;
      return Number.isFinite(off) ? Math.round(off) : null;
    } catch { return null; }
  }
  // Zóna místa: z odpovědi předpovědi, jinak jeden malý dotaz Open-Meteo (timezone=auto); chyba → příště znovu.
  function zoneOf(lat, lon, fetchFn) {
    const k = key(lat, lon);
    if (!zones.has(k)) {
      const [la, lo] = k.split(',');
      const z = (async () => {
        const r = await fetchFn(`${API}?${new URLSearchParams({ latitude: la, longitude: lo, daily: 'sunset', timezone: 'auto', forecast_days: '1' })}`);
        if (!r.ok) return null;
        const j = await r.json();
        return typeof j?.timezone === 'string' ? j.timezone : null;
      })().catch(() => null);
      zones.set(k, z);
      z.then(v => { if (!v) zones.delete(k); });
    }
    return zones.get(k);
  }
  const hm = m => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  /**
   * Západ slunce (místní čas 'HH:MM') pro [{ lat, lon, date }]: v dosahu předpovědi z Open-Meteo (z téhož dotazu
   * jako počasí, ten už bývá v paměti), dál výpočtem NOAA v zóně místa. null = nevím (polární den / noc, bez sítě).
   */
  async function sunsets(points, { now = new Date(), fetchFn = root.fetch?.bind(root) } = {}) {
    const need = points.filter(p => p && !suns.has(sunKey(p)) && inForecast(p.date, now));
    if (need.length && fetchFn) await forecast(need, { now, fetchFn });
    return Promise.all(points.map(async p => {
      if (!p) return null;
      if (suns.has(sunKey(p))) return suns.get(sunKey(p));
      const utc = sunsetUtc(p.lat, p.lon, p.date);
      if (utc == null || !fetchFn) return null;
      const tz = await zoneOf(p.lat, p.lon, fetchFn);
      const off = tz ? tzOffset(tz, Date.parse(`${p.date}T00:00:00Z`) + utc * 6e4) : null;
      return off == null ? null : hm(utc + off);
    }));
  }

  /** Předpověď na víc dní pro jedno místo (výběr lepšího dne pro kolo / pěší trasu). */
  async function days(lat, lon, from, n, opts) {
    const list = Array.from({ length: n }, (_, k) => { const d = new Date(`${from}T12:00:00`); d.setDate(d.getDate() + k); return { lat, lon, date: ymdOf(d) }; });
    return (await forecast(list, opts)).filter(Boolean);
  }

  /**
   * Předpověď na celý dosah (dnes … dnes + AHEAD, viz last) pro víc míst najednou – štítky ve výsledcích hledání a v radaru:
   * points [{ lat, lon }] → Map(key → [{ date, code, hi, lo, pop, rain }]), jen dny s počasím i teplotou. Pevný rozsah dní
   * a seřazená místa = stejný klíč mezipaměti, ať je výpis seřazený jakkoliv; nejvýš 40 míst (další se vynechají),
   * chyba → prázdná Map.
   */
  async function span(points, { now = new Date(), fetchFn = root.fetch?.bind(root) } = {}) {
    const ok = (v, max) => v != null && v !== '' && Math.abs(+v) <= max;
    const locs = [...new Set((points || []).filter(p => p && ok(p.lat, 90) && ok(p.lon, 180)).map(p => key(p.lat, p.lon)))].slice(0, 40).sort();
    if (!locs.length || !fetchFn) return new Map();
    try {
      const byLoc = await daily(locs, ymdOf(now), last(now), fetchFn);
      return new Map(locs.filter(l => Array.isArray(byLoc.get(l)?.time)).map(l => { const d = byLoc.get(l); return [l, d.time.map((_, i) => dayAt(d, i)).filter(full)]; }));
    } catch { return new Map(); }
  }

  const rainy = w => Boolean(w && ((w.pop ?? 0) >= 60 || (w.rain ?? 0) >= 5 || [61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(w.code)));
  // Den pro výlet ven: hlavně bez deště, pak příjemná teplota (~22 °C).
  const dayScore = w => (w.pop ?? 50) + (w.rain ?? 0) * 5 + Math.abs((w.hi ?? 22) - 22) * 2;
  const bestDay = list => list.filter(Boolean).reduce((b, w) => (!b || dayScore(w) < dayScore(b) ? w : b), null);

  // wIco je v data.js jako „const“ – vlastností window se sám nestane, proto i přímé jméno (v testech ho dodává window.wIco).
  const wi = code => (typeof root.wIco === 'function' ? root.wIco : typeof wIco === 'function' ? wIco : () => ['🌡️', ''])(code);
  const icon = code => wi(code)[0];
  const label = code => wi(code)[1];
  /** Krátký štítek „☀️ 22° / 11° · 💧 10 %“ (HTML; čísla a texty z vlastní tabulky). */
  function badge(w) {
    if (!w) return '';
    const t = `${label(w.code)}${w.pop != null ? `, pravděpodobnost srážek ${w.pop} %` : ''}${w.rain ? `, ${String(Math.round(w.rain * 10) / 10).replace('.', ',')} mm` : ''} – předpověď Open-Meteo`;
    return `<span class="wx${rainy(w) ? ' wet' : ''}" title="${t.replace(/"/g, '&quot;')}">${icon(w.code)} ${w.hi}°<small> / ${w.lo}°</small>${w.pop != null ? ` · 💧 ${w.pop} %` : ''}</span>`;
  }
  const dayName = ymd => ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'][new Date(`${ymd}T12:00:00`).getDay()];

  const dny = n => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní');
  // ze tří, ze 12, ze 20 (dvaceti), ze 60, ze sta, ze 200; z pěti, z 15, z 50, z 80
  const ze = n => (/^(?:[23467]|1[23467]|[23467]\d|1\d\d|[23467]\d\d)$/.test(n) ? 'ze' : 'z');
  /**
   * Předpověď na dny cesty jedním štítkem: days = dny cesty, na které předpověď je, total = dní cesty celkem
   * → { text, short, title, wet } nebo null. Aspoň 2 deštivé dny „🌧️ prší 2 dny ze 3“, jinak „☀️ 22° · 💧 10 %“
   * (ikona nejdeštivějšího dne, průměr denních maxim, nejvyšší pravděpodobnost srážek); short „☀️ 22°“, title den po dni.
   */
  function summary(days, total) {
    const ds = (days || []).filter(Boolean);
    if (!ds.length) return null;
    const n = ds.length, wet = ds.filter(rainy).length;
    const his = ds.map(w => w.hi).filter(Number.isFinite), hi = his.length ? `${Math.round(his.reduce((a, b) => a + b, 0) / his.length)}°` : '';
    const pops = ds.map(w => w.pop).filter(Number.isFinite), pop = pops.length ? Math.max(...pops) : null;
    // ikona dne s nejvyšší pravděpodobností srážek (deštivý den má přednost) – jeden deštivý den tak ukáže déšť
    const ic = icon(ds.reduce((b, w) => ((rainy(w) - rainy(b) || (w.pop ?? -1) - (b.pop ?? -1)) > 0 ? w : b)).code);
    const dm = ymd => { const d = new Date(`${ymd}T12:00:00`); return `${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`; };
    const deg = v => (Number.isFinite(v) ? `${Math.round(v)}°` : '–');
    const lines = ds.slice(0, 7).map(w => `${dm(w.date)}: ${icon(w.code)} ${deg(w.hi)} / ${deg(w.lo)}${w.pop != null ? `, 💧 ${w.pop} %` : ''}`);
    if (n > 7) lines.push(`… (+${n - 7} ${dny(n - 7)})`);
    total = Math.max(n, total || 0);
    return {
      text: wet >= 2 ? `🌧️ prší ${wet} ${dny(wet)} ${ze(n)} ${n}` : `${[ic, hi].filter(Boolean).join(' ')}${pop != null ? ` · 💧 ${pop} %` : ''}`,
      short: [wet >= 2 ? '🌧️' : ic, hi].filter(Boolean).join(' '),
      title: `${lines.join('\n')}\n${n < total ? `Předpověď jen na ${n === 1 ? 'první den' : `první ${n}`} ${ze(total)} ${total} dnů cesty. ` : ''}Předpověď Open-Meteo – před odletem ji ověř.`,
      wet,
    };
  }
  /**
   * Předpověď na dny cesty d1..d2 (jen tam: tři dny od odletu) ze seznamu dní místa ze span() → summary() nebo null.
   * Odlet mimo dosah předpovědi – i už proběhlý (výsledky z minula, stránka otevřená přes půlnoc) → null.
   */
  function trip(list, d1, d2, { now = new Date() } = {}) {
    if (!Array.isArray(list) || !inForecast(d1, now)) return null;
    const from = new Date(`${d1}T12:00:00`), end = d2 || ymdOf(new Date(from.getFullYear(), from.getMonth(), from.getDate() + 2, 12));
    return summary(list.filter(w => w.date >= d1 && w.date <= end), daysAhead(end, from) + 1);
  }

  /** Dlouhodobý průměr pro měsíc (api/climate) – když je termín mimo dosah předpovědi. */
  async function normal(lat, lon, ymd, { fetchFn = root.fetch?.bind(root) } = {}) {
    const ck = `n:${key(lat, lon)}`;
    if (!cache.has(ck)) {
      const p = fetchFn(`api/climate?lat=${(+lat).toFixed(3)}&lon=${(+lon).toFixed(3)}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
      cache.set(ck, { at: Date.now(), data: p });
    }
    const c = await cache.get(ck).data;
    const m = +String(ymd).slice(5, 7) - 1;
    if (!c || !Array.isArray(c.hi) || !(m >= 0)) return null;
    return { month: m, hi: c.hi[m], lo: c.lo?.[m], p: c.p?.[m], text: `Obvykle ${MNS_LOC[m]}: ${c.hi[m]}° / ${c.lo?.[m]}°, srážky ~${c.p?.[m]} mm za měsíc` };
  }

  root.Weather = { forecast, days, span, summary, trip, key, rainy, bestDay, badge, normal, daysAhead, inForecast, dayName, AHEAD, sunsets, sunsetUtc, tzOffset };
})(typeof window !== 'undefined' ? window : globalThis);
