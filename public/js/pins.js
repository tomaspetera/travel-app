/* ATLAS – 📌 Odložené nabídky (S.pins): čistá logika bez DOM, aby šla testovat v node (test/pins.test.js). Záznam
   z řádku výsledků nese vše, co porovnání potřebuje bez nového hledání (rozpis ceny, lety, letiště, statistika cen),
   z karty radaru jen to, co karta zná. Přepnutí, úklid nabídek s odletem v minulosti, pročištění cizího vstupu
   (💾 záloha), sloučení, tichá obnova ceny z pozdějšího hledání se stejným nastavením a text pro sdílení.
   UI je ve flights.js (priceBox, bookButtons, pickTrip…), záloha v backup.js. */
(function () {
  const MAX = 12, OLD_MIN = 1440; // nejvýš nabídek; cena starší než 24 h varovně
  const obj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const fin = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const BAD_KEY = k => k === '__proto__' || k === 'constructor' || k === 'prototype';
  const isIata = v => typeof v === 'string' && /^[A-Z0-9]{3}$/.test(v);
  const isYmd = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z'));
  const ENUM = { bags: ['none', 'cabin', 'checked'], groundMode: ['transit', 'car'], carFuel: ['diesel', 'petrol', 'ev'], deal: ['super', 'good', 'normal', 'pricey'] };
  const keyOf = id => { const m = /^(?:metro|ap):([A-Z0-9]{3})$/.exec(String(id || '')); return m ? m[1] : null; };
  const copy = v => JSON.parse(JSON.stringify(v));

  /** Nastavení, pro které je cena spočítaná: „2|none|transit|1“ (lidé, zavazadla, doprava na letiště, cesta do města). */
  const basis = q => { const x = q || {}; return `${+x.adults || 1}|${x.bags || 'none'}|${(x.kmRate ?? 1) > 0 ? (x.groundMode === 'car' ? 'car' : 'transit') : 'none'}|${x.arrival ? 1 : 0}`; };
  // trasa a dny (tam | zpět, u jen tam „-“) – stejné pro řádek výsledků i kartu radaru
  const sig = (a, b, d1, bf, bt, d2) => [a, b, d1, d2 ? bf : '-', d2 ? bt : '-', d2 || '-'].join('|');
  const sigTrip = t => sig(t.out.from, t.out.to, t.out.date, t.back && t.back.from, t.back && t.back.to, t.back && t.back.date);
  const sigRadar = x => sig(x.from, x.to, x.d1, x.bf || x.to, x.bt || x.from, x.d2);
  const rowKey = (t, b) => `f|${t.id}|${b}`;
  const radarKey = (x, b) => `r|${sigRadar(x)}|${b}`;
  const price = p => (p.kind === 'r' ? p.r.czk : p.t.perPersonCzk);
  const dep = p => (p.kind === 'r' ? obj(p.r) && p.r.d1 : obj(p.t) && obj(p.t.out) && p.t.out.date) || '';
  // jako porovnání: podle ceny na osobu, při shodě dřív odložená
  const sorted = list => (Array.isArray(list) ? list.filter(obj) : []).sort((a, b) => price(a) - price(b) || a.pinnedAt - b.pinnedAt);

  const T_KEYS = ['id', 'out', 'back', 'flightCzk', 'perPersonCzk', 'tripCzk', 'totalCzk', 'bagCzk', 'bagEst', 'groundCzk', 'parkCzk', 'arrCzk', 'nights', 'provider', 'combined', 'composed', 'cell', 'bookUrl', 'deal', 'priceLevel', 'tempHi', 'distanceKm', 'destKey'];
  const qOf = (q, trip) => ({ adults: +q.adults || 1, bags: ENUM.bags.includes(q.bags) ? q.bags : 'none', groundMode: q.groundMode === 'car' ? 'car' : 'transit', carFuel: q.groundMode === 'car' && ENUM.carFuel.includes(q.carFuel) ? q.carFuel : null, kmRate: fin(q.kmRate, 0, 5) ? q.kmRate : 1, arrival: Boolean(q.arrival), trip });
  const geo = d => (fin(d.lat, -90, 90) && fin(d.lon, -180, 180) ? { lat: d.lat, lon: d.lon } : {});
  /**
   * Nabídka t z řádku výsledku res (g = skupina cíle, at = čas cen – SearchHelp.shownAt) → { k, kind: 'f', at, pinnedAt,
   * q, dest, t, origins, arrivals, stats, ground, home, part?, demo? }; cesta přes víc měst, nabídka bez id či letu → null.
   * Lety beze změny (průvodce podle nich pozná tentýž let); z průběžných výsledků bez úrovně ceny a statistiky (part).
   */
  function fromRow(t, g, res, at, now = Date.now()) {
    if (!t || typeof t.id !== 'string' || !obj(t.out) || !res || res.mode === 'multi' || !obj(res.query)) return null;
    const q = qOf(res.query, t.back ? 'return' : 'oneway'), part = Boolean(res.partial), d = (g && g.dest) || {}, A = obj(res.arrivals) ? res.arrivals : {};
    const tt = {}, aps = [t.out.from, t.back && t.back.to], st = !part && ((g && g.priceStats) || res.priceStats);
    for (const k of T_KEYS) if (t[k] !== undefined && !(part && k === 'priceLevel')) tt[k] = t[k];
    return copy({
      k: rowKey(t, basis(q)), kind: 'f', at: at > 0 ? at : now, pinnedAt: now, q, pv: 2,
      dest: { id: d.id || null, key: d.key || t.destKey || t.out.to, label: d.label || t.out.to, cc: d.cc || '', ...(d.country ? { country: d.country } : {}), ...geo(d) },
      t: tt,
      origins: (res.origins || []).filter(o => o && aps.includes(o.iata)).slice(0, 2).map(o => ({ iata: o.iata, name: o.name, cc: o.cc, distKm: o.distKm, ground: o.ground || null })),
      arrivals: Object.fromEntries([t.out.to, t.back && t.back.from].filter(i => i && A[i]).map(i => [i, A[i]])),
      stats: st ? (({ mins, ...s }) => s)(st) : null,
      ground: (g && g.ground) || null,
      home: (res.home && res.home.label) || null,
      ...(part ? { part: 1 } : {}), ...(res.demo ? { demo: 1 } : {}),
    });
  }
  /** Karta radaru x (at = čas výsledku radaru, adults = jeho počet lidí) → { k, kind: 'r', at, pinnedAt, q, dest, r, demo? }. */
  function fromRadar(x, { at = 0, adults = 1, demo = false } = {}, now = Date.now()) {
    if (!x || !isIata(x.from) || !isIata(x.to) || !isYmd(x.d1)) return null;
    // základ ceny radaru: bez zavazadel, veřejnou dopravou na letiště, s cestou do města (SearchHelp.radarQuery)
    const q = { adults: Math.min(9, Math.max(1, Math.round(+adults) || 1)), bags: 'none', groundMode: 'transit', carFuel: null, kmRate: 1, arrival: true, trip: x.d2 ? 'return' : 'oneway' }, r = {};
    for (const k of ['from', 'to', 'd1', 'd2', 'bf', 'bt', 't1', 'a2', 'czk', 'prov', 'deal', 'buy']) if (x[k] !== undefined) r[k] = x[k];
    return copy({ k: radarKey(x, basis(q)), kind: 'r', at: at > 0 ? at : now, pinnedAt: now, q, dest: { id: x.id || null, key: keyOf(x.id) || x.to, label: x.label || x.to, cc: x.cc || '', ...geo(x) }, r, ...(demo ? { demo: 1 } : {}) });
  }

  // tatáž nabídka: stejný klíč; karta radaru i jako plná nabídka se stejnou trasou, dny a nastavením
  const same = (p, rec) => p.k === rec.k || (rec.kind === 'r' && p.kind === 'f' && obj(p.t) && obj(rec.r) && sigTrip(p.t) === sigRadar(rec.r) && basis(p.q) === basis(rec.q));
  const has = (list, rec) => Boolean(rec) && (Array.isArray(list) ? list : []).some(p => obj(p) && same(p, rec));
  /** Odložit / odebrat → { list, on (teď odložená), full (plno – seznam beze změny) }. Plná nabídka nahradí tutéž z radaru. */
  function toggle(list, rec, max = MAX) {
    const cur = Array.isArray(list) ? list.filter(obj) : [];
    if (!rec) return { list: cur, on: false, full: false };
    if (cur.some(p => same(p, rec))) return { list: cur.filter(p => !same(p, rec)), on: false, full: false };
    const rest = rec.kind === 'f' ? cur.filter(p => !(p.kind === 'r' && same(rec, p))) : cur;
    if (rest.length >= max) return { list: cur, on: false, full: true };
    return { list: [...rest, rec], on: true, full: false };
  }
  /** Bez nabídek s odletem před dneškem (today = YYYY-MM-DD; odlet dnes zůstane) a bez nesmyslů. */
  const alive = (list, today) => (Array.isArray(list) ? list : []).filter(p => obj(p) && dep(p) >= today);

  /* ---------- pročištění cizího vstupu (💾 záloha) ---------- */
  const txt = (v, n) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[<>"'`]/g, '').replace(/[\x00-\x1f\x7f‪-‮⁦-⁩]/g, ' ').trim().slice(0, n) : '');
  // obecně jako Trip.sanitizeTrip: texty bez HTML do 300 znaků (odkazy …url/…Url do 4000), jen konečná čísla, klíče \w-
  const gen = (v, key = '') => (typeof v === 'string' ? v.replace(/[<>"'`]/g, '').slice(0, /url$/i.test(key) ? 4000 : 300)
    : typeof v === 'number' ? (Number.isFinite(v) ? v : 0)
    : typeof v === 'boolean' || v == null ? v
    : Array.isArray(v) ? v.slice(0, 200).map(x => gen(x, key))
    : typeof v === 'object' ? Object.fromEntries(Object.entries(v).slice(0, 200).filter(([k]) => /^[\w-]{1,40}$/.test(k) && !BAD_KEY(k)).map(([k, x]) => [k, gen(x, k)])) : null);
  const http = u => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const legOk = l => obj(l) && isIata(l.from) && isIata(l.to) && isYmd(l.date) && (l.dep == null || typeof l.dep === 'string') && (l.arr == null || typeof l.arr === 'string');
  // úroveň ceny jen ve tvaru, který bere průvodce (Trip.sanitizeTrip); statistika jen čísla a data (cleanPriceStats)
  const plOk = pl => obj(pl) && ['low', 'normal', 'high'].includes(pl.level) && typeof pl.reason === 'string' && fin(pl.ref, 0, 1e7) && fin(pl.vsRef, -100, 1e5) && (pl.pos == null || fin(pl.pos, 0, 100));
  const STATS = ['n', 'min', 'p25', 'median', 'p75', 'max'];
  const cleanStats = s => (obj(s) && STATS.every(k => fin(s[k], 0, 1e7)) && isYmd(s.dateFrom) && isYmd(s.dateTo) ? { ...Object.fromEntries(STATS.map(k => [k, s[k]])), dateFrom: s.dateFrom, dateTo: s.dateTo } : null);
  function cleanQ(q, trip) {
    if (!obj(q) || !Number.isInteger(q.adults) || q.adults < 1 || q.adults > 9) return null;
    return { adults: q.adults, bags: ENUM.bags.includes(q.bags) ? q.bags : 'none', groundMode: ENUM.groundMode.includes(q.groundMode) ? q.groundMode : 'transit', carFuel: ENUM.carFuel.includes(q.carFuel) ? q.carFuel : null, kmRate: fin(q.kmRate, 0, 5) ? q.kmRate : 1, arrival: q.arrival === true, trip };
  }
  function cleanDest(d, iata) {
    d = obj(d) ? d : {};
    const id = typeof d.id === 'string' && /^(ap|metro|geo|cc):[^<>"'`\n]{1,110}$/.test(d.id) ? d.id : null, country = txt(d.country, 80);
    return { id, key: keyOf(id) || iata, label: txt(d.label, 80) || iata, cc: typeof d.cc === 'string' && /^[A-Z]{2}$/.test(d.cc) ? d.cc : '', ...(country ? { country } : {}), ...geo(d) };
  }
  function cleanFull(x, base, now) {
    if (!obj(x.t) || typeof x.t.id !== 'string' || !x.t.id || x.t.id.length > 300) return null;
    const t = gen(x.t), q = obj(t) && legOk(t.out) && (t.back == null || legOk(t.back)) && cleanQ(x.q, t.back ? 'return' : 'oneway');
    if (!q || !fin(t.flightCzk, 1, 1e7) || !fin(t.perPersonCzk, 0, 1e7) || !fin(t.totalCzk, 0, 1e7)) return null;
    for (const k of ['bagCzk', 'groundCzk', 'parkCzk', 'arrCzk']) if (k in t && !fin(t[k], 0, 1e6)) delete t[k];
    // odloženo ve starší verzi (cena i s dopravou na letiště a do města): cena = letenky + zavazadla, s dopravou
    // tripCzk; dřívější cena „od odložení“ byla s dopravou – neporovnávat
    const per = t.flightCzk + (t.bagCzk || 0), oldPrice = x.pv !== 2 && Math.abs(t.perPersonCzk - per) > 0.5;
    if (oldPrice) Object.assign(t, { perPersonCzk: per, tripCzk: per + (t.groundCzk || 0) + (t.arrCzk || 0), totalCzk: per * q.adults });
    else if ('tripCzk' in t && !fin(t.tripCzk, 0, 1e7)) delete t.tripCzk;
    t.bookUrl = http(t.bookUrl); t.out.bookUrl = http(t.out.bookUrl);
    if (t.back) t.back.bookUrl = http(t.back.bookUrl);
    if (t.priceLevel != null && !plOk(t.priceLevel)) delete t.priceLevel;
    if (t.deal != null) t.deal = obj(t.deal) ? { level: ENUM.deal.includes(t.deal.level) ? t.deal.level : 'normal', score: fin(t.deal.score, -1e3, 1e3) ? t.deal.score : 0, ...(fin(t.deal.drop, 0, 100) ? { drop: t.deal.drop } : {}) } : { level: 'normal', score: 0 };
    const A = obj(x.arrivals) ? Object.entries(x.arrivals).filter(([k, v]) => isIata(k) && obj(v)).slice(0, 2) : [];
    const was = !oldPrice && obj(x.was) && fin(x.was.czk, 0, 1e7) && fin(x.was.at, 1.5e12, now + 864e5) ? { was: { czk: x.was.czk, at: x.was.at } } : {};
    return {
      k: rowKey(t, basis(q)), ...base, q, pv: 2, dest: cleanDest(x.dest, t.out.to), t,
      origins: (Array.isArray(x.origins) ? x.origins.slice(0, 2) : []).map(o => gen(o)).filter(o => obj(o) && isIata(o.iata)),
      arrivals: Object.fromEntries(A.map(([k, v]) => [k, gen(v)])),
      stats: cleanStats(x.stats), ground: obj(x.ground) ? gen(x.ground) : null, home: txt(x.home, 80) || null,
      ...(x.part ? { part: 1 } : {}), ...(x.demo ? { demo: 1 } : {}), ...was,
    };
  }
  function cleanRadar(r) {
    if (!obj(r) || !isIata(r.from) || !isIata(r.to) || !isYmd(r.d1) || !fin(r.czk, 1, 1e7)) return null;
    const o = { from: r.from, to: r.to, d1: r.d1, ...(isYmd(r.d2) && r.d2 >= r.d1 ? { d2: r.d2 } : {}), czk: r.czk };
    for (const k of ['bf', 'bt']) if (isIata(r[k])) o[k] = r[k];
    o.t1 = typeof r.t1 === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.t1) ? r.t1 : '';
    o.a2 = typeof r.a2 === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(r.a2) ? r.a2 : '';
    o.prov = typeof r.prov === 'string' && /^[a-z0-9-]{1,20}$/.test(r.prov) ? r.prov : '';
    if (ENUM.deal.includes(r.deal)) o.deal = r.deal;
    const buy = (Array.isArray(r.buy) ? r.buy : []).filter(b => Array.isArray(b) && http(b[0]) && b[0].length <= 4000 && /^[a-z0-9-]{1,20}$/.test(String(b[1])) && ['all', 'out', 'back'].includes(b[2])).slice(0, 3);
    if (buy.length) o.buy = buy.map(b => [b[0].replace(/[<>"'`\s]/g, ''), b[1], b[2]]);
    return o;
  }
  /**
   * Odložené nabídky z cizího vstupu (záloha): jen pole a tvary, které zná UI, klíč vždy znovu, čas ceny ne z budoucnosti
   * (hodiny jiného zařízení), bez odletů před today, stejná nabídka jednou (novější cena vyhrává), nejvýš MAX.
   */
  function clean(raw, { today, now = Date.now() } = {}) {
    if (!Array.isArray(raw)) return [];
    const okAt = v => fin(v, 1.5e12, now + 864e5), out = [];
    for (const x of raw.slice(0, 40)) {
      if (!obj(x) || (x.kind !== 'f' && x.kind !== 'r') || !okAt(x.at)) continue;
      const base = { kind: x.kind, at: x.at, pinnedAt: okAt(x.pinnedAt) ? x.pinnedAt : x.at };
      let rec = null;
      if (x.kind === 'f') rec = cleanFull(x, base, now);
      else {
        const r = cleanRadar(x.r), q = r && cleanQ(x.q, r.d2 ? 'return' : 'oneway');
        if (q) rec = { k: radarKey(r, basis(q)), ...base, q, dest: cleanDest(x.dest, r.to), r, ...(x.demo ? { demo: 1 } : {}) };
      }
      if (rec) out.push(rec);
    }
    const by = new Map();
    for (const p of alive(out, today)) { const o = by.get(p.k); if (!o || p.at > o.at) by.set(p.k, p); }
    return [...by.values()].slice(0, MAX);
  }
  /**
   * Sloučení s nabídkami ze zálohy (inc už pročištěné): sjednocení podle klíče, nabídka zařízení zůstane, jen novější cena
   * ze zálohy ji nahradí (s časem odložení zařízení); karta radaru, kterou zařízení má jako plnou nabídku, je „už máš“.
   * Napřed nabídky zařízení, pak nové, nejvýš max → { list, add, newer, same, over }.
   */
  function merge(cur, inc, { today, max = MAX } = {}) {
    const list = alive(cur, today).slice(), n = { add: 0, newer: 0, same: 0, over: 0 };
    for (const x of alive(inc, today)) {
      const i = list.findIndex(p => p.k === x.k);
      if (i >= 0) { if (x.at > list[i].at) { list[i] = { ...x, pinnedAt: list[i].pinnedAt }; n.newer++; } else n.same++; continue; }
      if (list.some(p => same(p, x))) { n.same++; continue; }
      // plná nabídka nahradí tutéž z radaru na jejím místě
      const j = x.kind === 'f' ? list.findIndex(p => p.kind === 'r' && same(x, p)) : -1;
      if (j >= 0) { list[j] = x; n.add++; continue; }
      if (list.length >= max) { n.over++; continue; }
      list.push(x); n.add++;
    }
    return { list, ...n };
  }
  /**
   * Konečný výsledek hledání res (at = čas jeho cen) obnoví odložené nabídky, které v něm jsou (stejné id), se stejným
   * nastavením (basis) – jinak by cenu spočítanou jinak přepsal. Novější cenu (jiné okno) nepřepíše. Čas odložení zůstane,
   * změněná cena si drží tu z odložení (was – „↑ o 210 Kč od odložení“) → { list, n (kolik obnoveno) }.
   * level(t) doplní úroveň ceny nabídce, která ji ze serveru nemá (flights.js levelFor: složená cesta, buňka mřížky).
   */
  function refresh(list, res, at, now = Date.now(), level = null) {
    const cur = Array.isArray(list) ? list : [];
    if (!res || res.partial || res.mode === 'multi' || !obj(res.query)) return { list: cur, n: 0 };
    const b = basis(res.query), by = new Map(), gs = res.groups || [];
    for (const g of gs) for (const t of g.options || []) if (t && t.id) by.set(t.id, { t, g });
    for (const t of res.top || []) if (t && t.id && !by.has(t.id)) by.set(t.id, { t, g: gs.find(g => g.dest && g.dest.key === t.destKey) || null });
    let n = 0;
    const out = cur.map(p => {
      const x = obj(p) && p.kind === 'f' && obj(p.t) && !(p.at > at) && basis(p.q) === b && by.get(p.t.id);
      if (x && level && !x.t.priceLevel) level(x.t);
      const rec = x && fromRow(x.t, x.g, res, at, now);
      if (!rec) return p;
      n++;
      const was = p.was || (rec.t.perPersonCzk !== p.t.perPersonCzk ? { czk: p.t.perPersonCzk, at: p.at } : null);
      return { ...rec, pinnedAt: p.pinnedAt, ...(was && was.czk !== rec.t.perPersonCzk ? { was } : {}) };
    });
    return { list: n ? out : cur, n };
  }
  /** Stáří ceny (SearchHelp.resultAge) + day = starší než 24 h, ago = „před 3 dny“; bez času null. */
  function age(at, now = Date.now()) { const a = window.SearchHelp.resultAge(at, now); return a ? { ...a, day: a.min >= OLD_MIN, ago: a.txt.slice(a.when.length + 2, -1) } : null; }

  /* ---------- 📤 Poslat k výběru: prostý text pro partnera (WhatsApp, e-mail…) ---------- */
  const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
  const kc = n => Math.round(n).toLocaleString('cs-CZ') + ' Kč';
  const day = d => `${DOW[new Date(d + 'T12:00:00Z').getUTCDay()]} ${+d.slice(8, 10)}. ${+d.slice(5, 7)}.`;
  const nightsTxt = n => `${n} ${n === 1 ? 'noc' : n >= 2 && n <= 4 ? 'noci' : 'nocí'}`;
  const nightsOf = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const flagOf = cc => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '');
  const legTxt = l => [l.hasTime && l.dep ? String(l.dep).slice(11, 16) : '', `${l.from} → ${l.to}`, l.stops ? `${l.stops}× přestup` : l.provider === 'travelpayouts' ? '' : 'přímý'].filter(Boolean).join(' ');
  const who = t => [...new Set([t.out, t.back].filter(Boolean).map(l => l.carrierName || l.carrier || ''))].filter(Boolean).join(' + ');
  const gq = (a, b, d1, d2) => `https://www.google.com/travel/flights?hl=cs&curr=CZK&q=${encodeURIComponent(d2 ? `Flights to ${b} from ${a} on ${d1} through ${d2}` : `Flights from ${a} to ${b} on ${d1} one way`)}`;
  // Google Flights jako ve verifyLinks: zpět na jiné letiště dvěma odkazy
  const gLink = (a, b, d1, bf, bt, d2) => (!d2 || (bf === b && bt === a) ? gq(a, b, d1, d2) : `tam: ${gq(a, b, d1)} zpět: ${gq(bf, bt, d2)}`);
  const linkOk = u => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length <= 300;
  // odkaz do obchodu (dlouhé deep linky ne – zpráva by byla nečitelná), jinak hledání na Google Flights
  function shareLink(p) {
    if (p.kind === 'r') { const r = p.r, b = (r.buy || [])[0]; return b && linkOk(b[0]) ? b[0] : gLink(r.from, r.to, r.d1, r.bf || r.to, r.bt || r.from, r.d2); }
    const t = p.t, o = t.out, b = t.back;
    if (linkOk(t.bookUrl)) return t.bookUrl;
    if (!b && linkOk(o.bookUrl)) return o.bookUrl;
    if (b && linkOk(o.bookUrl) && linkOk(b.bookUrl)) return `tam: ${o.bookUrl} zpět: ${b.bookUrl}`;
    return gLink(o.from, o.to, o.date, b && b.from, b && b.to, b && b.date);
  }
  /** Text „Kam pojedeme?“: nabídky očíslované podle ceny na osobu, s termínem, cenou, lety, stářím ceny a odkazem. */
  function shareText(list, { now = Date.now() } = {}) {
    const out = ['✈️ Kam pojedeme? Vyber číslo (ceny za osobu):', ''];
    sorted(list).forEach((p, i) => {
      const r = p.kind === 'r' ? p.r : null, t = p.t, d1 = r ? r.d1 : t.out.date, d2 = r ? r.d2 : t.back && t.back.date;
      const n = d2 ? (!r && t.nights != null ? t.nights : nightsOf(d1, d2)) : null, pax = p.q.adults, a = age(p.at, now), fl = flagOf(p.dest.cc);
      out.push(`${i + 1}) ${p.dest.label}${fl ? ' ' + fl : ''} · ${d2 ? `${day(d1)} – ${day(d2)} · ${nightsTxt(n)}` : `${day(d1)} · jen tam`}`,
        `   ${kc(price(p))}/os.${pax > 1 ? ` (celkem ${kc(r ? r.czk * pax : t.totalCzk)} za ${pax} os.)` : ''}${p.demo ? ' (DEMO – vymyšlená cena)' : ''}`,
        `   ${r ? `${r.from} → ${r.to}${d2 ? ` ↩ ${r.bf && r.bf !== r.to ? r.bf + ' → ' : ''}${r.bt || r.from}` : ''} · letenka + cesta na letiště a do města` : [`tam ${legTxt(t.out)}`, t.back ? `zpět ${legTxt(t.back)}` : '', who(t)].filter(Boolean).join(' · ')}`,
        ...(a ? [`   ${a.day ? `⚠ cena ${a.z} ${a.txt} – může být jiná` : `cena ${a.z} ${a.txt}`}`] : []),
        `   ${shareLink(p)}`, '');
    });
    out.push('(ATLAS – ceny se mohou změnit, ověř je před nákupem)');
    return out.join('\n');
  }

  window.Pins = { MAX, OLD_MIN, basis, sigTrip, sigRadar, rowKey, radarKey, fromRow, fromRadar, has, toggle, alive, clean, merge, refresh, age, price, dep, sorted, shareText };
})();
