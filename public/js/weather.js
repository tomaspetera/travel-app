/* ATLAS – předpověď počasí na den výletu (Open-Meteo: zdarma, bez klíče, CC BY 4.0).
   Předpověď jde nejvýš ~15 dní dopředu; pro pozdější termíny zbývá dlouhodobý průměr (api/climate). */
(function (root) {
  const API = 'https://api.open-meteo.com/v1/forecast';
  const AHEAD = 15;
  const MNS_LOC = ['v lednu', 'v únoru', 'v březnu', 'v dubnu', 'v květnu', 'v červnu', 'v červenci', 'v srpnu', 'v září', 'v říjnu', 'v listopadu', 'v prosinci'];
  const cache = new Map();
  const ymdOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysAhead = (ymd, now = new Date()) => Math.round((Date.parse(`${ymd}T12:00:00Z`) - Date.parse(`${ymdOf(now)}T12:00:00Z`)) / 864e5);
  const inForecast = (ymd, now) => { const d = daysAhead(ymd, now); return d >= 0 && d <= AHEAD; };
  const key = (lat, lon) => `${(+lat).toFixed(2)},${(+lon).toFixed(2)}`;
  // Západ slunce 'HH:MM' (místní čas) z odpovědí předpovědi: místo@den → čas; IANA zóna místa (Promise).
  const suns = new Map();
  const zones = new Map();
  const sunKey = p => `${key(p.lat, p.lon)}@${p.date}`;

  /**
   * points: [{ lat, lon, date }] → stejně dlouhé pole { date, code, hi, lo, pop, rain, sunset } nebo null
   * (mimo dosah předpovědi / chyba). Jeden dotaz na všechna místa najednou, výsledky v paměti 1 h.
   */
  async function forecast(points, { now = new Date(), fetchFn = root.fetch?.bind(root) } = {}) {
    const ok = points.filter(p => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && inForecast(p.date, now));
    if (!ok.length || !fetchFn) return points.map(() => null);
    const locs = [...new Map(ok.map(p => [key(p.lat, p.lon), p])).keys()];
    const dates = ok.map(p => p.date).sort();
    const ck = `${locs.join('|')}@${dates[0]}..${dates.at(-1)}`;
    let hit = cache.get(ck);
    if (!hit || hit.at < Date.now() - 36e5) {
      const qs = new URLSearchParams({
        latitude: locs.map(l => l.split(',')[0]).join(','), longitude: locs.map(l => l.split(',')[1]).join(','),
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunset',
        timezone: 'auto', start_date: dates[0], end_date: dates.at(-1),
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
    let byLoc;
    try { byLoc = await hit.data; } catch { return points.map(() => null); }
    return points.map(p => {
      if (!ok.includes(p)) return null;
      const d = byLoc.get(key(p.lat, p.lon));
      const i = d?.time?.indexOf(p.date) ?? -1;
      if (i < 0) return null;
      const n = (a) => (a && a[i] != null ? Math.round(a[i]) : null);
      return { date: p.date, code: d.weather_code?.[i] ?? null, hi: n(d.temperature_2m_max), lo: n(d.temperature_2m_min), pop: n(d.precipitation_probability_max), rain: d.precipitation_sum?.[i] ?? null,
        sunset: suns.get(sunKey(p)) || null };
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

  root.Weather = { forecast, days, rainy, bestDay, badge, normal, daysAhead, inForecast, dayName, AHEAD, sunsets, sunsetUtc, tzOffset };
})(typeof window !== 'undefined' ? window : globalThis);
