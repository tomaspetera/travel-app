/* ATLAS – předpověď počasí na den výletu z MET Norway (data CC BY 4.0) přes náš server (api/weather): MET chce
   User-Agent s kontaktem a mezipaměť a IP adresa uživatele se k nim nedostane. Předpověď sahá 9 dní dopředu; pro
   pozdější termíny zbývá dlouhodobý průměr (api/climate). */
(function (root) {
  const API = 'api/weather';
  const AHEAD = 9;
  const MAX = 40; // míst v jednom dotazu (víc server odmítne)
  const MNS_LOC = ['v lednu', 'v únoru', 'v březnu', 'v dubnu', 'v květnu', 'v červnu', 'v červenci', 'v srpnu', 'v září', 'v říjnu', 'v listopadu', 'v prosinci'];
  const cache = new Map();
  const ymdOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysAhead = (ymd, now = new Date()) => Math.round((Date.parse(`${ymd}T12:00:00Z`) - Date.parse(`${ymdOf(now)}T12:00:00Z`)) / 864e5);
  // Poslední den předpovědi: dnes + 9 (MET Locationforecast dál nesahá; den, který řada pokryje jen zčásti, server vynechá)
  const last = (now = new Date()) => ymdOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + AHEAD, 12));
  const inForecast = (ymd, now = new Date()) => daysAhead(ymd, now) >= 0 && ymd <= last(now);
  const key = (lat, lon) => `${(+lat).toFixed(2)},${(+lon).toFixed(2)}`;
  const valid = p => p && p.lat != null && p.lat !== '' && p.lon != null && p.lon !== '' && Math.abs(+p.lat) <= 90 && Math.abs(+p.lon) <= 180;
  // IANA zóna místa (Promise) – z odpovědí předpovědi, pro západ slunce
  const zones = new Map();

  // Denní předpověď míst locs (klíče key(), seřazené): jeden dotaz, v paměti 1 h → Promise<Map(místo → [den] | null)>.
  function daily(locs, fetchFn) {
    const ck = locs.join('|');
    let hit = cache.get(ck);
    if (!hit || hit.at < Date.now() - 36e5) {
      const data = (async () => {
        const r = await fetchFn(`${API}?pts=${locs.join(';')}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const list = Array.isArray(j?.places) ? j.places : [];
        list.forEach((x, i) => { if (typeof x?.tz === 'string' && !zones.has(locs[i])) zones.set(locs[i], Promise.resolve(x.tz)); });
        return new Map(locs.map((l, i) => [l, Array.isArray(list[i]?.days) ? list[i].days : null]));
      })();
      hit = { at: Date.now(), data };
      cache.set(ck, hit);
      data.catch(() => cache.delete(ck));
    }
    return hit.data;
  }
  // Den bez kódu počasí nebo teploty jako by nebyl (žádné „null°“ ve štítku).
  const full = w => w && w.code != null && w.hi != null;
  const dayOut = w => ({ date: w.date, code: w.code, hi: w.hi, lo: w.lo ?? null, pop: w.pop ?? null, rain: w.rain ?? null });

  /**
   * points: [{ lat, lon, date }] → stejně dlouhé pole { date, code, hi, lo, pop, rain } nebo null
   * (mimo dosah předpovědi / chyba). Jeden dotaz na všechna místa najednou, výsledky v paměti 1 h.
   */
  async function forecast(points, { now = new Date(), fetchFn = root.fetch?.bind(root) } = {}) {
    const ok = points.filter(p => valid(p) && inForecast(p.date, now));
    if (!ok.length || !fetchFn) return points.map(() => null);
    const locs = [...new Set(ok.map(p => key(p.lat, p.lon)))].slice(0, MAX).sort();
    let byLoc;
    try { byLoc = await daily(locs, fetchFn); } catch { return points.map(() => null); }
    return points.map(p => {
      if (!ok.includes(p)) return null;
      const w = (byLoc.get(key(p.lat, p.lon)) || []).find(d => d && d.date === p.date);
      return full(w) ? dayOut(w) : null;
    });
  }

  /**
   * Západ slunce podle zjednodušených vzorců NOAA (GML, „General Solar Position Calculations“; přesnost ~1–2 min):
   * minuty od půlnoci UTC daného dne, null = polární den / noc. Pro všechny dny – předpověď MET západ slunce nedává.
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
  // Zóny míst: z odpovědí předpovědi, jinak jeden malý dotaz na všechna neznámá místa (api/weather?tz=1 – bez MET);
  // chyba → příště znovu.
  function zonesOf(keys, fetchFn) {
    const miss = [...new Set(keys.filter(k => !zones.has(k)))].slice(0, MAX);
    if (miss.length) {
      const list = fetchFn(`${API}?tz=1&pts=${miss.join(';')}`).then(r => (r.ok ? r.json() : null)).then(j => (Array.isArray(j?.places) ? j.places : [])).catch(() => []);
      miss.forEach((k, i) => {
        const z = list.then(l => (typeof l[i]?.tz === 'string' ? l[i].tz : null));
        zones.set(k, z);
        z.then(v => { if (!v && zones.get(k) === z) zones.delete(k); });
      });
    }
    return Promise.all(keys.map(k => zones.get(k) || null));
  }
  const hm = m => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  /**
   * Západ slunce (místní čas 'HH:MM') pro [{ lat, lon, date }]: výpočet NOAA v zóně místa (zóna z odpovědi předpovědi,
   * ta už bývá v paměti, jinak jeden dotaz na všechna místa). null = nevím (polární den / noc, bez sítě).
   */
  async function sunsets(points, { fetchFn = root.fetch?.bind(root) } = {}) {
    const need = points.map(p => (valid(p) && sunsetUtc(p.lat, p.lon, p.date) != null ? p : null));
    const keys = need.filter(Boolean).map(p => key(p.lat, p.lon));
    const tzs = keys.length && fetchFn ? await zonesOf(keys, fetchFn) : [];
    let i = 0;
    return need.map(p => {
      if (!p) return null;
      const tz = tzs[i++], utc = sunsetUtc(p.lat, p.lon, p.date);
      const off = tz ? tzOffset(tz, Date.parse(`${p.date}T00:00:00Z`) + utc * 6e4) : null;
      return off == null ? null : hm(utc + off);
    });
  }

  /** Předpověď na víc dní pro jedno místo (výběr lepšího dne pro kolo / pěší trasu). */
  async function days(lat, lon, from, n, opts) {
    const list = Array.from({ length: n }, (_, k) => { const d = new Date(`${from}T12:00:00`); d.setDate(d.getDate() + k); return { lat, lon, date: ymdOf(d) }; });
    return (await forecast(list, opts)).filter(Boolean);
  }

  /**
   * Předpověď na celý dosah (dnes … dnes + AHEAD) pro víc míst najednou – štítky ve výsledcích hledání a v radaru:
   * points [{ lat, lon }] → Map(key → [{ date, code, hi, lo, pop, rain }]), jen dny s počasím i teplotou. Seřazená místa
   * = stejný klíč mezipaměti, ať je výpis seřazený jakkoliv; nejvýš 40 míst (další se vynechají), chyba → prázdná Map.
   */
  async function span(points, { fetchFn = root.fetch?.bind(root) } = {}) {
    const locs = [...new Set((points || []).filter(valid).map(p => key(p.lat, p.lon)))].slice(0, MAX).sort();
    if (!locs.length || !fetchFn) return new Map();
    try {
      const byLoc = await daily(locs, fetchFn);
      return new Map(locs.filter(l => Array.isArray(byLoc.get(l))).map(l => [l, byLoc.get(l).filter(full).map(dayOut)]));
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
    const t = `${label(w.code)}${w.pop != null ? `, pravděpodobnost srážek ${w.pop} %` : ''}${w.rain ? `, ${String(Math.round(w.rain * 10) / 10).replace('.', ',')} mm` : ''} – předpověď MET Norway`;
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
      title: `${lines.join('\n')}\n${n < total ? `Předpověď jen na ${n === 1 ? 'první den' : `první ${n}`} ${ze(total)} ${total} dnů cesty. ` : ''}Předpověď MET Norway – před odletem ji ověř.`,
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
      // chyba (bez sítě, server se probouzí) → příště znovu, jinak by průměr chyběl až do obnovení stránky
      p.then(c => { if (!c && cache.get(ck)?.data === p) cache.delete(ck); });
    }
    const c = await cache.get(ck).data;
    const m = +String(ymd).slice(5, 7) - 1;
    if (!c || !Array.isArray(c.hi) || !(m >= 0)) return null;
    return { month: m, hi: c.hi[m], lo: c.lo?.[m], p: c.p?.[m], text: `Obvykle ${MNS_LOC[m]}: ${c.hi[m]}° / ${c.lo?.[m]}°, srážky ~${c.p?.[m]} mm za měsíc` };
  }

  root.Weather = { forecast, days, span, summary, trip, key, rainy, bestDay, badge, normal, daysAhead, inForecast, dayName, AHEAD, sunsets, sunsetUtc, tzOffset };
})(typeof window !== 'undefined' ? window : globalThis);
