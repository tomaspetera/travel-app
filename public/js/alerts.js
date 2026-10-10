/* ATLAS – hlídané ceny: čistá logika (kdy kontrolovat, kdy upozornit, křivka ceny) a fronta kontrol.
   Bez DOM, aby šla testovat v node (test/alerts.test.js). Kontroly běží jen v otevřeném prohlížeči. */
(function () {
  const CFG = {
    cycleMs: 30 * 60e3, // jak často se dívat, jestli je co kontrolovat
    staleMs: 6 * 3600e3, // hledání starší než 6 h se zkontroluje znovu
    maxPerCycle: 4,
    gapMs: 4000, // pauza mezi dvěma kontrolami
    startMs: 6000, // první kontrola chvíli po startu (ať nepřebíjí radar)
    waitMs: 5000, // jak často zkusit znovu, když je stránka skrytá nebo běží hledání
    maxWaitMs: 10 * 60e3,
    timeoutMs: 180e3,
    dropPct: 3,
    seenPct: 1, // „zlevnilo“ na přehledu až od 1 % (drobné výkyvy kurzu nepočítat)
    histCap: 60,
  };
  const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

  /** Dlouho nekontrolované hledání (nebo ještě nikdy). */
  function isStale(w, now, maxAge = CFG.staleMs) {
    const at = num(w && w.checked);
    return !at || now - at >= maxAge;
  }

  /**
   * Termín celý v minulosti: přesná data → odlet už byl (server minulý odlet nehledá); flexibilně → konec rozsahu;
   * cesta přes víc měst → první let už byl.
   */
  function isPast(form, today) {
    const f = form || {};
    if (f.trip === 'multi') return (f.legs || []).some(l => l && l.date && l.date < today);
    if (f.dateMode === 'exact') return !!f.xOut && f.xOut < today;
    return !!f.dTo && f.dTo < today;
  }

  /** Co zkontrolovat teď: neproběhlé a zastaralé, nejdéle nezkoušené napřed (neúspěšné se tak střídají s ostatními). */
  function dueWatches(list, { now, today, max = CFG.maxPerCycle, skip, staleMs = CFG.staleMs } = {}) {
    const last = w => Math.max(num(w.checked) || 0, num(w.tried) || 0);
    return (list || [])
      .filter(w => w && !(skip && skip.has(w.id)) && !isPast(w.form, today) && isStale(w, now, staleMs))
      .sort((a, b) => last(a) - last(b))
      .slice(0, max);
  }

  /**
   * Upozornit? 'target' = cena je na cílové částce nebo pod ní, 'drop' = o ≥ pct % levnější než minulá kontrola.
   * Stejnou (± pct %) cenu, kterou už jsme hlásili, nehlásíme znovu; první cenu pod cílem ale vždy,
   * dál pod cílem až když je o pct % níž než minule.
   */
  function shouldNotify({ prev, cur, target, notified } = {}, pct = CFG.dropPct) {
    cur = num(cur); prev = num(prev); target = num(target); notified = num(notified);
    if (!cur) return null;
    const k = pct / 100, under = !!target && cur <= target;
    if (under && !(notified && notified <= target)) return 'target';
    if (notified && Math.abs(cur - notified) < notified * k) return null;
    if (under && cur < notified) return 'target';
    if (prev && cur <= prev * (1 - k)) return 'drop';
    return null;
  }

  function pushHistory(history, point, cap = CFG.histCap) {
    return [...(Array.isArray(history) ? history : []), point].slice(-cap);
  }
  /** Nejnižší kladná cena z hodnot (null, když žádná není). */
  function lowest(values) {
    const v = (values || []).map(num).filter(Boolean);
    return v.length ? Math.min(...v) : null;
  }
  /** Změna v procentech zaokrouhlená na celé (null, když není s čím srovnat). */
  function pctChange(from, to) {
    from = num(from); to = num(to);
    if (!from || !to) return null;
    return Math.round((to - from) / from * 100) || 0;
  }
  function fmtPct(p) { return p == null ? '' : p < 0 ? `−${-p} %` : p > 0 ? `+${p} %` : '±0 %'; }

  /** „před 2 h“ apod. */
  function agoTxt(ms) {
    if (!(ms >= 0) || !isFinite(ms)) return '—';
    const m = Math.floor(ms / 60e3);
    if (m < 1) return 'právě teď';
    if (m < 60) return `před ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `před ${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'před 1 dnem' : `před ${d} dny`;
  }

  /** Některý zdroj (Ryanair, Wizz Air, Kiwi…) v hledání neodpověděl celý – výsledek může být dražší než skutečnost. */
  const incomplete = providers => (providers || []).some(p => p && p.outage);

  /**
   * Výsledek kontroly → nový stav hledání + důvod upozornění. Původní objekt nemění.
   * partial = některý zdroj neodpověděl: vyšší nebo žádná cena může být jen výpadkem – nezapíše se (skipped, hledání
   * zůstane k nové kontrole), nejvýš 2× po sobě, pak se vezme i neúplná. Nižší cena platí i při výpadku.
   */
  function applyCheck(w, best, now, cfg = CFG, { partial = false } = {}) {
    const h = Array.isArray(w.history) ? w.history : [];
    // minulá cena; když minulá kontrola nic nenašla, poslední známá z historie
    const prev = num(w.best && w.best.czk) || num(h.length && h[h.length - 1].czk);
    const cur = num(best && best.czk);
    if (partial && prev && !(cur && cur < prev) && (num(w.partials) || 0) < 2) {
      return { w: { ...w, tried: now, partials: (num(w.partials) || 0) + 1 }, why: null, prev, skipped: true };
    }
    const { partials, ...rest } = w;
    const out = { ...rest, best: best || null, checked: now, tried: now };
    if (out.base == null && h.length) out.base = h[0].czk; // starší uložená data bez výchozí ceny
    if (out.seen == null && prev) out.seen = prev;
    let why = null;
    if (cur) {
      out.history = pushHistory(h, { at: now, czk: cur }, cfg.histCap);
      out.low = lowest([w.low, ...h.map(x => x.czk), cur]);
      if (out.base == null) out.base = cur;
      why = shouldNotify({ prev, cur, target: w.target, notified: w.notified }, cfg.dropPct);
      if (why) { out.notified = cur; out.notifiedAt = now; }
    }
    return { w: out, why, prev };
  }

  /**
   * Klíč hledání pro hlídané ceny: dotaz na server (payload) bez pořadí klíčů a seznamů (Praha + Brno = Brno + Praha,
   * lety cesty přes víc měst ale v pořadí), bez prázdných hodnot a bez polí, která hledání nemění (u přesných dat
   * rozsah a noci flexibilního termínu, u cesty jen tam noci a návrat). Stejný klíč = stejné hledání.
   */
  function searchKey(payload) {
    const p = { ...(payload || {}) };
    if (p.exactOut) ['dateFrom', 'dateTo', 'nightsMin', 'nightsMax', 'outDays', 'backDays'].forEach(k => delete p[k]);
    if (p.trip === 'oneway') ['nightsMin', 'nightsMax', 'backDays', 'exactBack'].forEach(k => delete p[k]);
    const str = x => JSON.stringify(x === undefined ? null : x);
    const norm = v => {
      if (Array.isArray(v)) {
        const a = v.map(norm);
        return a.every(x => x == null || typeof x !== 'object') ? a.sort((x, y) => (str(x) < str(y) ? -1 : str(x) > str(y) ? 1 : 0)) : a;
      }
      if (!v || typeof v !== 'object') return v;
      const o = {};
      for (const k of Object.keys(v).sort()) {
        const x = norm(v[k]);
        if (x !== undefined && x !== null && x !== '' && !(Array.isArray(x) && !x.length)) o[k] = x;
      }
      return o;
    };
    return JSON.stringify(norm(p));
  }

  /**
   * Uložení hledání do hlídaných: stejné hledání (keyOf(w) → searchKey) se podruhé nepřidá – stávající položka
   * dostane novou cenu (applyCheck, cíl a historie zůstanou), popis a formulář z nového uložení a posune se nahoru.
   * Původní seznam nemění. → { list, w (uložená položka), dup (už se hlídalo) }
   */
  function upsertWatch(list, w, keyOf, { now = Date.now(), cap = 12 } = {}) {
    const key = keyOf(w);
    const old = (list || []).find(x => x && keyOf(x) === key);
    if (!old) return { list: [w, ...(list || [])].slice(0, cap), w, dup: false };
    const upd = { ...applyCheck(old, w.best, now).w, label: w.label, sub: w.sub, form: w.form };
    return { list: [upd, ...list.filter(x => x !== old)].slice(0, cap), w: upd, dup: true };
  }

  /** Zlevnilo (aspoň o pct %) od chvíle, kdy se uživatel naposledy díval na seznam. */
  function isDropped(w, pct = CFG.seenPct) {
    const cur = num(w && w.best && w.best.czk), seen = num(w && w.seen);
    return !!(cur && seen && cur <= seen * (1 - pct / 100));
  }
  function droppedCount(list) { return (list || []).filter(w => isDropped(w)).length; }

  /**
   * Seznam uložený jiným panelem (localStorage) → jeho složení a úpravy platí (přidané, smazané, cíl…),
   * jen vlastní novější výsledek kontroly zůstane. Beze změny vrací stejné objekty.
   */
  function mergeWatches(mine, stored) {
    mine = mine || [];
    if (!Array.isArray(stored)) return { list: mine, changed: false };
    const byId = new Map(mine.map(w => [w && w.id, w]));
    const list = stored.filter(s => s && s.id != null).map(s => {
      const m = byId.get(s.id);
      return m && ((num(m.checked) || 0) > (num(s.checked) || 0) || JSON.stringify(m) === JSON.stringify(s)) ? m : s;
    });
    return { list, changed: list.length !== mine.length || list.some((w, i) => w !== mine[i]) };
  }

  /**
   * Křivka ceny pro <svg viewBox="0 0 width height">: osa x podle času kontroly (když chybí, rovnoměrně),
   * nižší cena = níž v grafu. Vrací null pro méně než 2 body.
   */
  function sparkPath(points, width = 120, height = 32, pad = 3) {
    const pts = (points || []).map(p => (typeof p === 'number' ? { czk: p } : p || {})).filter(p => num(p.czk));
    if (pts.length < 2) return null;
    const v = pts.map(p => p.czk), min = Math.min(...v), max = Math.max(...v);
    const t = pts.map(p => (typeof p.at === 'number' && isFinite(p.at) ? p.at : null));
    const byTime = t.every(x => x !== null) && t.every((x, i) => !i || x >= t[i - 1]) && t[t.length - 1] > t[0];
    const r = n => Math.round(n * 10) / 10;
    // SVG má y dolů: nejdražší nahoře (pad), nejlevnější dole (height − pad).
    const y = c => r(max === min ? height / 2 : pad + (max - c) / (max - min) * (height - 2 * pad));
    const xy = pts.map((p, i) => [r(pad + (byTime ? (t[i] - t[0]) / (t[t.length - 1] - t[0]) : i / (pts.length - 1)) * (width - 2 * pad)), y(p.czk)]);
    return { d: 'M' + xy.map(p => p.join(' ')).join('L'), last: xy[xy.length - 1], min, max, y };
  }

  /** Stav upozornění v prohlížeči: 'unsupported' | 'default' | 'granted' | 'denied'. */
  function notifState(N, secure = true) {
    if (!N || !secure || typeof N.requestPermission !== 'function') return 'unsupported';
    return ['granted', 'denied'].includes(N.permission) ? N.permission : 'default';
  }

  /**
   * Fronta kontrol: v jednu chvíli běží nejvýš jedna kontrola (ruční i automatická),
   * cyklus nikdy dvakrát najednou. check(id) běží uvnitř zámku a smí vyhodit chybu (zkusí se příští cyklus).
   * sync() před kontrolou převezme výsledky z jiného panelu.
   */
  function scheduler({ list, check, today, now = () => Date.now(), sleep, canRun = () => true, sync = () => { }, cfg = CFG }) {
    let lock = Promise.resolve(), cycling = false, lastCycle = 0;
    const exclusive = fn => { const p = lock.then(() => fn()); lock = p.catch(() => { }); return p; };
    async function ready() {
      for (let t = 0; !canRun(); t += cfg.waitMs) {
        if (t >= cfg.maxWaitMs) return false;
        await sleep(cfg.waitMs);
      }
      return true;
    }
    async function cycle() {
      if (cycling) return -1;
      cycling = true;
      const tried = new Set();
      let n = 0;
      try {
        if (!await ready()) return 0;
        lastCycle = now();
        while (n < cfg.maxPerCycle) {
          const w = dueWatches(list(), { now: now(), today: today(), max: 1, skip: tried, staleMs: cfg.staleMs })[0];
          if (!w) break;
          if (n && (await sleep(cfg.gapMs), !await ready())) break;
          tried.add(w.id);
          const ran = await exclusive(async () => {
            // mezitím ho mohla zkontrolovat ruční kontrola (i v jiném panelu) nebo ho uživatel smazal
            try { sync(); } catch (e) { }
            const cur = list().find(x => x.id === w.id);
            if (!cur || !isStale(cur, now(), cfg.staleMs) || isPast(cur.form, today())) return false;
            try { await check(w.id); } catch (e) { }
            return true;
          });
          if (ran) n++;
        }
      } finally { cycling = false; }
      return n;
    }
    return { cycle, exclusive, get cycling() { return cycling; }, get lastCycle() { return lastCycle; } };
  }

  window.Alerts = { CFG, isStale, isPast, dueWatches, shouldNotify, pushHistory, lowest, pctChange, fmtPct, agoTxt, applyCheck, incomplete, searchKey, upsertWatch, isDropped, droppedCount, mergeWatches, sparkPath, notifState, scheduler };
})();
