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
    rollNear: 7, // 📅 Posouvat termín s časem zapnuté předem, když rozsah začíná nejpozději za 7 dní
  };
  const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
  // verze ceny hlídání: 2 = cena letenky (+ zavazadla) bez dopravy na letiště – dřív i s ní (jiný základ, neporovnávat)
  const PV = 2;

  /* ---------- 📅 klouzavý termín hlídání (form.roll): { off, span } = odlet za off až off + span dní, { lw: 'next' } = nejbližší
     prodloužený víkend (eve: false = bez pravidla „v předvečer jen odlety od 16:00“) ---------- */
  // rozsah aspoň týden: každý den v týdnu v něm je vždy (kratší by se den ode dne posouval mimo dny odletu – pá–so by ve
  // středu hledal po–út a hlásil „zlevnilo“ proti víkendové ceně)
  // next = nejvýš jaký odstup je na kartě „příštích …“ (radar hledá od dneška + 3)
  const ROLL = { off: 60, span: 180, min: 7, next: 3 };
  const ymdMs = d => Date.parse(d + 'T12:00:00Z');
  const isYmd = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(ymdMs(d));
  const plusDays = (d, n) => new Date(ymdMs(d) + n * 864e5).toISOString().slice(0, 10);
  const daysTo = (a, b) => Math.round((ymdMs(b) - ymdMs(a)) / 864e5);
  /** Platný klouzavý termín: celá čísla off 0–60 a span 7–180, nebo lw jen 'next' (s eve nanejvýš false). */
  function rollOk(r) {
    if (!r || typeof r !== 'object') return false;
    if (r.lw != null) return r.lw === 'next' && (r.eve === undefined || r.eve === false);
    return Number.isInteger(r.off) && r.off >= 0 && r.off <= ROLL.off && Number.isInteger(r.span) && r.span >= ROLL.min && r.span <= ROLL.span;
  }
  // klouzavý termín platí jen pro flexibilní hledání tam a zpět / jen tam – přesná data a víc měst zůstanou pevné
  const rolls = f => Boolean(f) && f.trip !== 'multi' && f.dateMode !== 'exact' && rollOk(f.roll);
  /**
   * Formulář hlídání ke dni today: s klouzavým termínem rozsah odletu od dneška ({ off, span } → today + off až + span,
   * pravidlo „v předvečer od 16:00“ pryč; { lw: 'next' } → nejbližší prodloužený víkend jako 🎉 Svátky –
   * SearchHelp.holidayList / holidayDates, s eve: false bez „od 16:00“). Bez roll (i přesná data a víc měst) vrací form
   * beze změny, původní nemění.
   */
  function rollForm(form, today, SH = window.SearchHelp) {
    if (!rolls(form) || !isYmd(today)) return form;
    const r = form.roll;
    if (r.lw) {
      const lw = SH && SH.holidayList(today)[0];
      if (!lw) return form; // v příštích měsících žádný prodloužený víkend – zůstane poslední termín
      const h = SH.holidayDates(lw, today);
      return { ...form, len: 'holiday', trip: 'return', dFrom: h.dFrom, dTo: h.dTo, nMin: h.nMin, nMax: h.nMax, outDays: [...h.outDays], backDays: [...h.backDays], depAfter: h.depAfter && r.eve !== false ? { ...h.depAfter } : null };
    }
    const dFrom = plusDays(today, r.off);
    return { ...form, dFrom, dTo: plusDays(dFrom, r.span), depAfter: null };
  }
  /**
   * Klouzavý termín z formuláře f ke dni today (♡ Hlídat s 📅 Posouvat termín s časem, „převést na klouzavé“ na kartě):
   * 🎉 Svátky → { lw: 'next' } (s vypnutým „v předvečer jen odlety od 16:00“ { lw: 'next', eve: false }; konkrétní pozdější
   * víkend ze seznamu ne – ten zůstane pevný), jinak { off, span } podle rozsahu odletu. Rozsah, který už začal nebo
   * proběhl, se posune jako v den uložení (saved = 'YYYY-MM-DD', jinak od začátku) a meze se ořežou; budoucí rozsah mimo
   * meze (začátek za víc než 60 dní, delší než 180 dní) → null, stejně jako rozsah kratší než týden (i proběhlý), přesná
   * data, víc měst a termín z karty svátku s „odlet od 16:00“.
   */
  function rollSpec(f, today, { saved = null, SH = window.SearchHelp } = {}) {
    if (!f || f.trip === 'multi' || f.dateMode === 'exact' || !isYmd(f.dFrom) || !isYmd(f.dTo) || f.dTo < f.dFrom || !isYmd(today)) return null;
    if (f.len === 'holiday' && f.trip === 'return') {
      const lw = SH && SH.holidayOf(f, today), first = SH && SH.holidayList(today)[0];
      // termín předvolby má odlet i v předvečer (dFrom < dTo) – bez „odlet od 16:00“ ho uživatel vypnul
      return lw && first && lw.start !== first.start ? null : { lw: 'next', ...(f.dFrom < f.dTo && !f.depAfter ? { eve: false } : {}) };
    }
    if (f.depAfter) return null;
    if (f.dFrom >= today) { const r = { off: daysTo(today, f.dFrom), span: daysTo(f.dFrom, f.dTo) }; return rollOk(r) ? r : null; }
    const base = isYmd(saved) && saved <= f.dFrom ? saved : f.dFrom;
    const r = { off: Math.min(ROLL.off, daysTo(base, f.dFrom)), span: Math.min(ROLL.span, daysTo(f.dFrom, f.dTo)) };
    return rollOk(r) ? r : null;
  }
  /**
   * Hledání f (formulář s daty) je klouzavé hlídání s termínem roll = { off, span }, i když z jeho dat dnes vyjde jiný
   * odstup (♥ Hlídáš, ♡ ho nezdvojí) – jen termín, ostatní pole hledání porovná klíč (searchKey). Formulář obnovený
   * z minula (poslední hledání, Nedávno, uložené výsledky) má data ze dne hledání: z { off: 3 } uloženého včera dnes
   * vyjde { off: 2 }. Stejný termín = rozsah, jaký hlídání mělo některý den od uložení (saved, 'YYYY-MM-DD') do dneška,
   * i se začátkem, který už byl, posunutým na dnešek (Nedávno), nebo dnešní rozsah stejné délky se stejným odstupem –
   * u „příštích …“ (odstup nejvýš 3 dny, karta je nerozliší) s kterýmkoli z nich.
   */
  function rollSame(roll, f, today, { saved = null } = {}) {
    if (!rollOk(roll) || roll.lw || !f || f.trip === 'multi' || f.dateMode === 'exact' || f.depAfter || !isYmd(f.dFrom) || !isYmd(f.dTo) || f.dTo < f.dFrom || !isYmd(today)) return false;
    const off = daysTo(today, f.dFrom);
    if (off >= 0 && daysTo(f.dFrom, f.dTo) === roll.span && (off === roll.off || (off <= ROLL.next && roll.off <= ROLL.next))) return true;
    if (!isYmd(saved)) return false;
    // den, kdy rozsah hlídání končil f.dTo, a začátek rozsahu toho dne
    const day = plusDays(f.dTo, -(roll.off + roll.span)), start = plusDays(day, roll.off);
    return day >= saved && day <= today && (f.dFrom === start || (start < today && f.dFrom === today));
  }
  /**
   * Kdy bylo hlídání w uložené (ms, „převést na klouzavé“ – odstup jako v den uložení): id = Date.now().toString(36)
   * (věrohodný čas od roku 2020 do now + den – hodiny jiného zařízení), jinak první bod historie – ta drží jen
   * posledních 60 kontrol, takže u starších hlídání už den uložení není; z obou dřívější. Bez nich null.
   */
  function savedAt(w, now) {
    const id = w && typeof w.id === 'string' && /^[0-9a-z]{6,10}$/.test(w.id) ? parseInt(w.id, 36) : 0;
    const t = [id >= Date.UTC(2020, 0, 1) && id <= now + 864e5 ? id : null, num(w && Array.isArray(w.history) && w.history[0] && w.history[0].at)].filter(Boolean);
    return t.length ? Math.min(...t) : null;
  }
  /**
   * Popis klouzavého termínu na kartu: „vždy příštích 8 týdnů (teď 14. 10.–9. 12.)“, „vždy nejbližší prodloužený víkend
   * (teď Vánoce 24.–27. 12.)“; now = false bez dnešního termínu v závorce.
   */
  function rollTxt(form, today, { now = true, SH = window.SearchHelp } = {}) {
    if (!rolls(form) || !isYmd(today)) return '';
    const r = form.roll, f = rollForm(form, today, SH), dm = d => `${+d.slice(8, 10)}. ${+d.slice(5, 7)}.`;
    if (r.lw) {
      const lw = SH && SH.holidayList(today)[0];
      return `vždy nejbližší prodloužený víkend${lw && now ? ` (teď ${lw.name} ${SH.dmRange(lw.start, lw.end)})` : ''}`;
    }
    const n = r.span, w = n % 7 || n === 7 ? 0 : n / 7;
    // „příštích …“ jen se začátkem nejvýš za 3 dny (radar hledá od dneška + 3), jinak rozsah ve dnech od dneška („odlet za 5–61 dní“)
    return `vždy ${r.off > ROLL.next ? `odlet za ${r.off}–${r.off + n} dní` : w ? (w <= 4 ? `příští ${w} týdny` : `příštích ${w} týdnů`) : `příštích ${n} dní`}${now ? ` (teď ${dm(f.dFrom)}–${dm(f.dTo)})` : ''}`;
  }

  /** Dlouho nekontrolované hledání (nebo ještě nikdy). */
  function isStale(w, now, maxAge = CFG.staleMs) {
    const at = num(w && w.checked);
    return !at || now - at >= maxAge;
  }

  /**
   * Termín celý v minulosti: přesná data → odlet už byl (server minulý odlet nehledá); flexibilně → konec rozsahu;
   * cesta přes víc měst → první let už byl. Klouzavý termín (form.roll) neproběhne nikdy.
   */
  function isPast(form, today) {
    const f = form || {};
    if (f.trip === 'multi') return (f.legs || []).some(l => l && l.date && l.date < today);
    if (f.dateMode === 'exact') return !!f.xOut && f.xOut < today;
    if (rolls(f)) return false;
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
   * Body historie od posledního nového základu (bod s own: 1 – změna 🏠 vlastní ceny na letiště nebo 🙈 u nejlevnějšího
   * města) – starší body jsou cena spočítaná jinak a s novými se nesrovnávají (nejnižší cena, rozdíl proti minulé
   * kontrole, graf).
   */
  function epoch(history) {
    const h = Array.isArray(history) ? history : [];
    for (let i = h.length - 1; i > 0; i--) if (h[i] && h[i].own) return h.slice(i);
    return h;
  }

  /**
   * Posunula cenu změna nastavení, ne letenky? own = otisk 🏠 vlastních cen, které hledání použilo (SearchHelp.ownPrint;
   * undefined = nehlídá se), uložený w.own (dřívější hlídání bez něj = žádné). best.key = město nejlevnější nabídky,
   * best.hid = 🙈 města levnější než ona, která kontrola vynechala („OMR,BUH“): nejlevnější je teď město, které minulá
   * kontrola vynechala (vrácené z 🙈 – 'unmute'), nebo minule nejlevnější město je teď v 🙈 ('mute').
   * → 'own' | 'unmute' | 'mute' | null.
   */
  function rebaseWhy(w, best, own) {
    if (own != null && String(w.own || '') !== String(own)) return 'own';
    const hid = b => (b && typeof b.hid === 'string' ? b.hid.split(',') : []), was = w.best && w.best.key;
    if (best && best.key && hid(w.best).includes(best.key)) return 'unmute';
    return was && best && best.key !== was && hid(best).includes(was) ? 'mute' : null;
  }

  /**
   * Výsledek kontroly → nový stav hledání + důvod upozornění. Původní objekt nemění.
   * partial = některý zdroj neodpověděl: vyšší nebo žádná cena může být jen výpadkem – nezapíše se (skipped, hledání
   * zůstane k nové kontrole), nejvýš 2× po sobě, pak se vezme i neúplná. Nižší cena platí i při výpadku.
   * own = otisk 🏠 vlastních cen na letiště, které hledání použilo (SearchHelp.ownPrint). Cena posunutá změnou nastavení
   * (rebaseWhy: jiné vlastní ceny, 🙈 u nejlevnějšího města) se nehlásí jako zlevnění, zdražení ani cíl – je to nový
   * základ: výchozí, nejnižší i „viděná“ cena začnou od ní (rebased = 'own' | 'unmute' | 'mute' | 'price', bod historie
   * s own: 1, w.rebAt = kdy, w.rebWhy = proč). 'price' = hlídání ze starší verze (cena i s dopravou na letiště): cílová
   * cena se přepočítá ve stejném poměru k nové ceně. Bez own (undefined) se otisk nehlídá.
   */
  function applyCheck(w, best, now, cfg = CFG, { partial = false, own } = {}) {
    const h = Array.isArray(w.history) ? w.history : [];
    // minulá cena; když minulá kontrola nic nenašla, poslední známá z historie
    const prev = num(w.best && w.best.czk) || num(h.length && h[h.length - 1].czk);
    const cur = num(best && best.czk);
    // hlídání ze starší verze: cena byla i s dopravou na letiště, teď je to jen letenka – nový základ, ne „zlevnilo“
    const reb = prev && cur ? (w.pv !== PV ? 'price' : rebaseWhy(w, best, own)) : null;
    // výpadek zdroje: s novým základem i nižší cenu raději ještě nebrat (příští úplná by z ní hlásila zdražení)
    if (partial && prev && (reb || !(cur && cur < prev)) && (num(w.partials) || 0) < 2) {
      return { w: { ...w, tried: now, partials: (num(w.partials) || 0) + 1 }, why: null, prev, skipped: true };
    }
    const { partials, ...rest } = w;
    const out = { ...rest, best: best || null, checked: now, tried: now };
    if (cur || !prev) out.pv = PV;
    // otisk se zapíše jen s cenou (nebo bez minulé) – kontrola bez výsledku by jinak příští cenu srovnala se starou
    if (own != null && (cur || !prev)) out.own = String(own);
    const he = epoch(h);
    if (out.base == null && he.length) out.base = he[0].czk; // starší uložená data bez výchozí ceny
    if (out.seen == null && prev) out.seen = prev;
    let why = null;
    if (reb) {
      out.history = pushHistory(h, { at: now, czk: cur, own: 1 }, cfg.histCap);
      out.base = out.low = out.seen = cur;
      out.rebAt = now;
      out.rebWhy = reb;
      // cíl nastavený k ceně i s dopravou na letiště: ve stejném poměru k nové ceně jen za letenku (na 10 Kč)
      if (reb === 'price' && num(w.target)) out.target = Math.max(10, Math.round(w.target * cur / prev / 10) * 10);
      // pod cílovou cenou už teď → tuhle cenu nehlásit (jako nastavení cíle), jinak dřív ohlášená cena neplatí
      if (num(out.target) && cur <= out.target) { out.notified = cur; out.notifiedAt = now; } else { delete out.notified; delete out.notifiedAt; }
    } else if (cur) {
      out.history = pushHistory(h, { at: now, czk: cur }, cfg.histCap);
      out.low = lowest([w.low, ...he.map(x => x.czk), cur]);
      if (out.base == null) out.base = cur;
      why = shouldNotify({ prev, cur, target: w.target, notified: w.notified }, cfg.dropPct);
      if (why) { out.notified = cur; out.notifiedAt = now; }
    }
    return { w: out, why, prev, ...(reb ? { rebased: reb } : {}) };
  }

  /**
   * Klíč hledání pro hlídané ceny: dotaz na server (payload) bez pořadí klíčů a seznamů (Praha + Brno = Brno + Praha,
   * lety cesty přes víc měst ale v pořadí), bez prázdných hodnot a bez polí, která hledání nemění (u přesných dat
   * rozsah a noci flexibilního termínu, u cesty jen tam noci a návrat). Stejný klíč = stejné hledání. payload.roll =
   * klouzavý termín hlídání (rollForm) – data, která se s ním každý den mění, klíč nemají.
   */
  function searchKey(payload) {
    const p = { ...(payload || {}) };
    // klouzavý termín (roll): místo dnešních dat jeho popis – klíč se den ode dne nemění (u svátku ani noci a dny)
    if (rollOk(p.roll)) ['dateFrom', 'dateTo', 'depAfter', ...(p.roll.lw ? ['nightsMin', 'nightsMax', 'outDays', 'backDays'] : [])].forEach(k => delete p[k]);
    else delete p.roll;
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
  // partial = hledání s výpadkem zdroje: vyšší cena se jako u kontroly nezapíše (falešné „zlevnilo“ příště)
  function upsertWatch(list, w, keyOf, { now = Date.now(), cap = 12, partial = false } = {}) {
    const key = keyOf(w);
    const old = (list || []).find(x => x && keyOf(x) === key);
    if (!old) return { list: [w, ...(list || [])].slice(0, cap), w, dup: false };
    const upd = { ...applyCheck(old, w.best, now, CFG, { partial, own: w.own }).w, label: w.label, sub: w.sub, form: w.form };
    return { list: [upd, ...list.filter(x => x !== old)].slice(0, cap), w: upd, dup: true };
  }

  /** Zlevnilo (aspoň o pct %) od chvíle, kdy se uživatel naposledy díval na seznam. */
  function isDropped(w, pct = CFG.seenPct) {
    const cur = num(w && w.best && w.best.czk), seen = num(w && w.seen);
    return !!(cur && seen && cur <= seen * (1 - pct / 100));
  }
  // hledání s proběhlým termínem (today = 'YYYY-MM-DD') se nepočítá – jako v „Od minula“ (odznak by hlásil zlevnění, které nikde není)
  function droppedCount(list, today = null) { return (list || []).filter(w => isDropped(w) && !(today && isPast(w && w.form, today))).length; }

  /**
   * Řádek „Od minula“ nahoře na Přehledu: hlídání pod cílovou cenou (hits), zlevněná od posledního pohledu na seznam
   * (watch, o kolik, nejvíc první; bez těch pod cílem) a změny radaru (down = levněji než minule, fresh = nové cíle).
   */
  function news(list, radar, today = null) {
    // hledání s proběhlým termínem se už nehlídá – ani do „Od minula“
    const ws = (list || []).filter(w => w && w.best && num(w.best.czk) && !(today && isPast(w.form, today)));
    const hits = ws.filter(w => num(w.target) && w.best.czk <= w.target).map(w => ({ id: w.id, label: w.label, czk: w.best.czk }));
    const hit = new Set(hits.map(x => x.id));
    const watch = ws.filter(w => !hit.has(w.id) && isDropped(w)).map(w => ({ id: w.id, label: w.label, d: num(w.seen) - w.best.czk })).sort((a, b) => b.d - a.d);
    const items = radar && Array.isArray(radar.items) ? radar.items.filter(Boolean) : [];
    return { hits, watch, down: items.filter(x => x.was && x.czk < x.was.czk).length, fresh: items.filter(x => x.newAt).length };
  }

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
   * sync() před kontrolou převezme výsledky z jiného panelu. firstMax = kolik hledání smí zkontrolovat první cyklus po
   * otevření nebo po dlouhé pauze (staleMs – aplikace z pozadí na telefonu) – aplikace bývá otevřená jen chvíli a
   * s limitem 4 by se 12 hlídaných dostalo na řadu až za pár návštěv. costOf(w) = kolik hledání kontrola stojí na
   * serveru (cesta přes víc měst 2) – limit cyklu se počítá v nich, ať kontroly nevyčerpají limit hledání uživatele.
   */
  function scheduler({ list, check, today, now = () => Date.now(), sleep, canRun = () => true, sync = () => { }, cfg = CFG, firstMax = 0, costOf = () => 1 }) {
    let lock = Promise.resolve(), cycling = false, lastCycle = 0, cycles = 0;
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
        const prev = lastCycle;
        lastCycle = now();
        const big = (cycles++ === 0 || now() - prev >= cfg.staleMs) && firstMax > cfg.maxPerCycle;
        const max = big ? firstMax : cfg.maxPerCycle;
        let spent = 0;
        while (spent < max) {
          const w = dueWatches(list(), { now: now(), today: today(), max: 1, skip: tried, staleMs: cfg.staleMs })[0];
          if (!w) break;
          // cena předem: cesta přes víc měst (2 hledání) se do zbytku rozpočtu nevejde → až příště (jako první, nehladoví)
          const cost = Math.max(1, Number(costOf(w)) || 1);
          if (spent && spent + cost > max) break;
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
          if (ran) { n++; spent += cost; }
        }
      } finally { cycling = false; }
      return n;
    }
    return { cycle, exclusive, get cycling() { return cycling; }, get lastCycle() { return lastCycle; } };
  }

  window.Alerts = { CFG, PV, rollOk, rolls, rollForm, rollSpec, rollSame, savedAt, rollTxt, isStale, isPast, dueWatches, shouldNotify, pushHistory, lowest, pctChange, fmtPct, agoTxt, epoch, applyCheck, rebaseWhy, incomplete, searchKey, upsertWatch, isDropped, droppedCount, news, mergeWatches, sparkPath, notifState, scheduler };
})();
