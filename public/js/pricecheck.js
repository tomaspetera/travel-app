/* ATLAS – „Je to dobrá cena?“: čistá logika bez DOM, aby šla testovat v node (test/pricecheck.test.js).
   Úroveň ceny pro cesty, které server neohodnotil (dvojice samostatných letenek, živá nabídka v průvodci cestou) –
   stejné pravidlo jako server/lib/pricelevel.js; paměť cen v tomto prohlížeči (localStorage) s trendem;
   opatrná rada, jestli koupit, nebo cenu hlídat. Porovnává se cena letenek na osobu (bez dopravy a zavazadel). */
(function () {
  const STORE_KEY = 'atlas_prices_v1';
  const CFG = {
    maxRoutes: 300, // tolik tras si paměť drží (pak zapomene nejdéle neviděné)
    maxAgeDays: 120, // trasu, kterou tak dlouho žádné hledání neukázalo, zapomenout (stará cena už nic neříká)
    maxNew: 120, // nejvýš tolik nových tras z jednoho hledání (kamkoliv by jinak paměť zaplavilo)
    maxObs: 6, // pozorování na trasu (pro trend)
    mergeMs: 6 * 3600e3, // totéž hledání do 6 h = jedno pozorování
    trendPct: 3, // menší změna = beze změny (→)
    smallN: 5, // stejné jako SMALL_N na serveru
  };
  const DAY = 864e5;
  const ms = d => Date.parse(d + 'T12:00:00Z');
  const diffDays = (a, b) => Math.round((ms(b) - ms(a)) / DAY);

  /* ---------- úroveň ceny (zrcadlo server/lib/pricelevel.js) ---------- */
  const refPrice = km => (km < 3000 ? 600 + 1.35 * km : 4650 + 1.6 * (km - 3000));
  const refOf = t => Math.round(refPrice(t.distanceKm || 0) * (t.back ? 1.9 : 1));
  function distanceLevel(t) {
    const score = Math.round((refOf(t) / t.flightCzk) * 100) / 100;
    return score >= 1.7 ? 'low' : score < 0.8 ? 'high' : 'normal';
  }
  function searchLevel(czk, st) {
    if (czk <= st.p25 && czk <= st.median * 0.92) return 'low';
    if (czk >= st.p75 && czk >= st.median * 1.15) return 'high';
    return 'normal';
  }
  /** [level, basis] – stejné pravidlo jako levelOf na serveru. */
  function levelOf(t, st) {
    const dist = distanceLevel(t);
    if (!st || st.n < CFG.smallN) return [dist, 'distance'];
    const czk = t.flightCzk;
    const sl = searchLevel(czk, st);
    if (sl !== 'normal') return dist !== 'normal' && dist !== sl ? ['normal', 'mixed'] : [sl, 'search'];
    if (dist === 'low' && czk <= st.median) return ['low', 'distance'];
    if (dist === 'high' && czk >= st.median) return ['high', 'distance'];
    return ['normal', 'search'];
  }
  /** Odhad pozice ceny mezi nabídkami z kvantilů (0 nejlevnější … 100 nejdražší), bez seznamu všech cen. */
  function estPos(czk, st) {
    const pts = [[st.min, 0], [st.p25, 25], [st.median, 50], [st.p75, 75], [st.max, 100]];
    if (czk <= st.min) return 0;
    if (czk >= st.max) return 100;
    for (let i = 1; i < pts.length; i++) {
      const [a, pa] = pts[i - 1], [b, pb] = pts[i];
      if (czk <= b) return Math.min(99, Math.max(1, Math.round(b > a ? pa + ((czk - a) / (b - a)) * (pb - pa) : pb)));
    }
    return 100;
  }
  const offersTxt = n => `${n} ${n >= 2 && n <= 4 ? 'nabídky' : 'nabídek'}`;
  const kc = n => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
  /** Zdůvodnění podle průměrné ceny na vzdálenost – stejné texty jako distanceText na serveru. */
  function distanceText(dist, vsRef) {
    if (dist === 'low') return `o ${-vsRef} % pod průměrnou cenou na tuto vzdálenost`;
    if (dist === 'high') return `o ${vsRef} % nad průměrnou cenou na tuto vzdálenost`;
    if (vsRef <= -5) return `o ${-vsRef} % pod průměrnou cenou na tuto vzdálenost – výhodná bývá až od ~40 %`;
    if (vsRef >= 5) return `o ${vsRef} % nad průměrnou cenou na tuto vzdálenost – ještě v normě`;
    return 'kolem průměrné ceny na tuto vzdálenost';
  }
  /**
   * Úroveň ceny cesty: ze serveru (priceLevel), jinak dopočítaná ze statistiky hledání (est: true – pozice je odhad
   * z kvantilů). → { level, basis, reason, ref, vsRef, pos, n }.
   */
  function assess(t, st) {
    if (t && t.priceLevel) return t.priceLevel;
    if (!t || !(t.flightCzk > 0)) return null;
    const [level, basis] = levelOf(t, st);
    const czk = t.flightCzk, ref = refOf(t), vsRef = Math.round((czk / ref - 1) * 100), n = st ? st.n : 0;
    const pos = st && n >= 2 ? estPos(czk, st) : null;
    const distTxt = distanceText(distanceLevel(t), vsRef);
    let reason;
    if (n < CFG.smallN) reason = `${distTxt} (${n <= 1 ? 'jiné nabídky k porovnání nejsou' : `k porovnání jen ${offersTxt(n)}`})`;
    else if (basis === 'mixed') reason = czk <= st.median ? 'levná mezi nabídkami do tohoto cíle, ale nad průměrnou cenou na tuto vzdálenost' : 'hluboko pod průměrem na tuto vzdálenost, do tohoto cíle jsou ale levnější nabídky';
    else if (basis === 'distance') reason = distTxt;
    else if (level === 'low') reason = pos === 0 ? 'nejlevnější nabídka do tohoto cíle v tomto hledání' : `levnější než ${100 - pos} % nabídek do tohoto cíle`;
    else if (level === 'high') reason = pos === 100 ? 'nejdražší nabídka do tohoto cíle v tomto hledání' : `dráž než ${pos} % nabídek do tohoto cíle`;
    else reason = `kolem obvyklé ceny do tohoto cíle (polovina nabídek stojí nejvýš ${kc(st.median)})`;
    return { level, basis, reason, ref, vsRef, pos, n, est: true };
  }

  /* ---------- paměť cen v tomto prohlížeči ---------- */
  const ym = d => String(d || '').slice(0, 7);
  /** Trasa v paměti: letiště odletu > cílové město (klíč skupiny), měsíc odletu, zpáteční / jen tam. */
  const routeKey = (from, dest, month, type) => `${from}>${dest}|${month}|${type}`;
  function tripKey(t) {
    const o = t && t.out;
    return o && o.from && o.date && t.destKey ? routeKey(o.from, t.destKey, ym(o.date), t.back ? 'rt' : 'ow') : null;
  }
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
  /**
   * Otisk hledání (kam, termíny, noci, dny v týdnu, jen přímé, za teplem) – trend se počítá jen mezi stejnými
   * hledáními. month = měsíc odletu trasy: z rozsahu dat se počítá jen jeho část v tomto měsíci, takže třeba
   * „příští 3 měsíce“ hledané jiný den mají celé měsíce stejný otisk (rozjetý začátek rozsahu je jiné hledání).
   */
  function scopeOf(q, month = null) {
    if (!q) return '';
    const x = q.exact;
    let a = q.dateFrom, b = q.dateTo;
    if (month && !x) {
      if (a < month + '-01') a = month + '-01';
      if (b > month + '-31') b = month + '-31';
    }
    const to = (q.to || []).slice().sort();
    return hash(JSON.stringify([to, x ? [x.out, x.back, x.flex] : [a, b, q.nightsMin, q.nightsMax, q.outDays, q.backDays], q.trip, Boolean(q.directOnly), q.minTemp || 0]));
  }
  /**
   * Nejlevnější letenky výsledku podle trasy a měsíce (z priceStats.mins skupin, tj. ze všech nabídek hledání)
   * → [{ key, czk, scope }].
   */
  function entriesOf(res) {
    if (!res || !res.query) return [];
    const type = res.query.trip === 'return' ? 'rt' : 'ow';
    const best = new Map();
    for (const g of res.groups || []) {
      const mins = ((g.priceStats && g.priceStats.mins) || []).slice().sort((a, b) => a[2] - b[2]);
      for (const [from, month, czk] of mins) {
        const k = routeKey(from, g.dest && g.dest.key, month, type);
        if (czk > 0 && !(best.has(k) && best.get(k).czk <= czk)) best.set(k, { czk, month });
      }
    }
    return [...best].map(([key, x]) => ({ key, czk: x.czk, scope: scopeOf(res.query, x.month) }));
  }
  function clean(store) {
    const out = { v: 1, r: {} };
    const r = store && typeof store === 'object' && store.r && typeof store.r === 'object' ? store.r : {};
    for (const [k, x] of Object.entries(r)) {
      if (!x || !(x.min > 0) || !(x.at > 0)) continue;
      const obs = Array.isArray(x.obs) ? x.obs.filter(o => Array.isArray(o) && o[0] > 0 && o[1] > 0).slice(-CFG.maxObs) : [];
      out.r[k] = { min: +x.min, at: +x.at, since: +x.since || +x.at, u: +x.u || +x.at, obs };
    }
    return out;
  }
  /**
   * Odlety v minulých měsících a trasy neviděné přes maxAgeDays zapomenout; nad maxRoutes zapomenout nejdéle
   * neaktualizované trasy.
   */
  function prune(store, now, max = CFG.maxRoutes) {
    const month = new Date(now).toISOString().slice(0, 7);
    const old = now - CFG.maxAgeDays * DAY;
    for (const k of Object.keys(store.r)) if ((k.split('|')[1] || '') < month || store.r[k].u < old) delete store.r[k];
    const keys = Object.keys(store.r);
    if (keys.length > max) keys.sort((a, b) => store.r[a].u - store.r[b].u).slice(0, keys.length - max).forEach(k => delete store.r[k]);
    return store;
  }
  /**
   * Zapíše nejlevnější ceny jednoho hledání (entries = [{ key, czk, scope? }]): nejnižší viděná cena (min, at = kdy)
   * a pozorování [čas, cena, otisk hledání] pro trend. Stejné hledání do 6 h se jen přepíše (žádný „trend“
   * z opakovaného kliknutí). → nový stav paměti.
   */
  function record(store, entries, { now = Date.now(), scope: scope0 = '' } = {}) {
    const s = clean(store);
    let fresh = 0;
    for (const { key, czk, scope = scope0 } of entries || []) {
      if (!key || !(czk > 0)) continue;
      let r = s.r[key];
      if (!r) {
        if (fresh >= CFG.maxNew) continue;
        fresh++;
        r = s.r[key] = { min: czk, at: now, since: now, u: now, obs: [] };
      }
      if (czk < r.min) { r.min = czk; r.at = now; }
      // poslední pozorování téhož hledání (mezitím mohlo proběhnout jiné hledání téže trasy, třeba radar)
      const same = r.obs.filter(o => o[2] === scope);
      const prev = same[same.length - 1];
      if (prev && now - prev[0] < CFG.mergeMs) prev[1] = czk;
      else r.obs.push([now, czk, scope]);
      r.obs = r.obs.slice(-CFG.maxObs);
      r.u = now;
    }
    return prune(s, now);
  }
  /**
   * Co paměť ví o trase: nejnižší cena a před kolika dny (ago), od kdy trasu sleduje (sinceDays), počet pozorování
   * a trend hledání `scope` (výchozí: poslední pozorované) vůči jeho dřívějšímu běhu:
   * { dir: 'down' | 'flat' | 'up', pct, prev, cur, days }.
   */
  function memoryOf(store, key, now = Date.now(), scope = null) {
    const r = store && store.r && store.r[key];
    if (!r) return null;
    const obs = r.obs || [];
    const last = obs[obs.length - 1];
    const sc = scope != null && obs.some(o => o[2] === scope) ? scope : last && last[2];
    const same = obs.filter(o => o[2] === sc);
    const cur = same[same.length - 1];
    let trend = null;
    if (same.length >= 2) {
      const prev = same[same.length - 2];
      const pct = Math.round(((cur[1] - prev[1]) / prev[1]) * 100);
      trend = { dir: pct <= -CFG.trendPct ? 'down' : pct >= CFG.trendPct ? 'up' : 'flat', pct, prev: prev[1], cur: cur[1], days: Math.max(0, Math.round((cur[0] - prev[0]) / DAY)) };
    }
    const days = x => Math.max(0, Math.floor((now - x) / DAY));
    return { min: r.min, ago: days(r.at), sinceDays: days(r.since), n: obs.length, trend };
  }
  function load(ls) {
    try { return clean(JSON.parse((ls || window.localStorage).getItem(STORE_KEY))); } catch (e) { return clean(null); }
  }
  function save(store, ls) {
    try { (ls || window.localStorage).setItem(STORE_KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
  }
  /**
   * Zapamatovat ceny z výsledku hledání (now = kdy hledání proběhlo). only = jen tato trasa a jen když v paměti
   * chybí (panel otevřený u trasy, která se do limitu nových tras nevešla – staré hledání se nesmí započítat jako
   * nové pozorování).
   */
  function remember(res, { now = Date.now(), ls, only = null } = {}) {
    const entries = entriesOf(res).filter(e => !only || e.key === only);
    if (!entries.length) return null;
    const cur = load(ls);
    if (only && cur.r[only]) return cur;
    const s = record(cur, entries, { now });
    save(s, ls);
    return s;
  }

  /* ---------- vysvětlení a rada ---------- */
  const agoTxt = d => (d <= 0 ? 'dnes' : d === 1 ? 'včera' : `před ${d} dny`);
  /**
   * Opatrná rada podle úrovně ceny a dní do odletu → { kind: 'buy' | 'watch' | 'compare' | 'late', text } nebo null.
   * Nic neslibuje: jen obvyklé chování cen (u nízkonákladovek se před odletem obvykle zvedají).
   */
  function advice(level, days) {
    if (days == null || days < 0) return null;
    if (level === 'low') {
      return days < 21
        ? { kind: 'buy', text: 'Cena vypadá dobře a do odletu zbývají necelé 3 týdny. Ceny u nízkonákladovek se před odletem obvykle zvedají – pokud ti termín sedí, čekáním se nejspíš nic nezíská.' }
        : { kind: 'buy', text: 'Cena vypadá dobře. Pokud ti termín sedí, není moc důvod čekat – levněji to být může, ale nemusí. Kdo chce riskovat, může hledání uložit ♡ a sledovat.' };
    }
    const dear = level === 'high' ? 'Cena je vyšší než obvykle. ' : '';
    if (days > 49) {
      return { kind: 'watch', text: `${dear}Do odletu zbývá ${Math.floor(days / 7)} týdnů, takže je čas cenu sledovat: ulož hledání ♡ s cílovou cenou a ATLAS se ozve, jestli zlevní (kontroluje, jen dokud máš stránku otevřenou). Zaručené to není – ceny můžou i stoupnout.` };
    }
    if (days >= 21) {
      return { kind: 'compare', text: `${dear}Do odletu zbývá pár týdnů. Čekání se už spíš nevyplatí – ceny u nízkonákladovek se před odletem obvykle zvedají. Ušetřit se dá spíš jiným dnem nebo letištěm (📅 kalendář, okolní letiště).` };
    }
    return { kind: 'late', text: `${dear}Do odletu zbývá málo a levněji už to nejspíš nebude – ceny u nízkonákladovek se před odletem obvykle zvedají. Jestli ti cena nesedí, zkus jiné dny nebo letiště.` };
  }
  /**
   * Podklady pro panel „Je to dobrá cena?“: úroveň (pl), statistika hledání (stats), dny do odletu, paměť
   * (mem: nejnižší viděná cena, trend) a o kolik % je tahle letenka dražší než nejnižší viděná (vsMem), rada.
   * query = dotaz hledání, ze kterého cesta je (pro trend právě tohoto hledání).
   */
  function explain(t, { stats = null, store = null, now = Date.now(), today = null, query = null } = {}) {
    const pl = assess(t, stats);
    if (!pl) return null;
    const days = today && t.out && t.out.date ? diffDays(today, t.out.date) : null;
    const key = tripKey(t);
    // trend hledání, ze kterého cesta je (query), když ho paměť má; jinak naposledy pozorovaného
    const mem = key && store ? memoryOf(store, key, now, query ? scopeOf(query, ym(t.out.date)) : null) : null;
    return {
      pl, stats, days, key, mem,
      vsMem: mem ? Math.round((t.flightCzk / mem.min - 1) * 100) : null,
      advice: advice(pl.level, days),
    };
  }

  window.PriceCheck = {
    CFG, STORE_KEY, refOf, distanceLevel, searchLevel, levelOf, estPos, assess,
    routeKey, tripKey, scopeOf, entriesOf, record, prune, memoryOf, load, save, remember, agoTxt, advice, explain,
  };
})();
