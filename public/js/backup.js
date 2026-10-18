/* ATLAS – 💾 Přenos a záloha: cesty z plánovače, hlídané ceny, 📌 odložené nabídky, domov radaru, navštívené země,
   ⭐ moje cíle a 🙈 skrytá města, odškrtnutí „Před cestou“ a 🏠 vlastní ceny na letiště jsou jen v localStorage jednoho
   prohlížeče. Záloha je jeden soubor JSON (v telefonu se posílá jako .txt – Chrome sdílí jen některé typy souborů),
   obnova ho sloučí s tím, co v zařízení už je. Nic se neukládá na server.
   Soubor je cizí vstup (mohl ho poslat kdokoli): parse() z něj postaví nové objekty jen se známými poli – plány přes
   PlanShare.sanitize, cesty z průvodce přes Trip.sanitizeTrip, odložené nabídky přes Pins.clean, zbytek podle pravidel tady. */
(function () {
  const V = 1;
  const MAX_FILE = 5e6;
  const WATCH_CAP = 12; // jako ♡ Hlídat (flights.js)
  const DEST_MAX = 30; // ⭐ Moje cíle a 🙈 Nezajímá mě – v každém seznamu (SearchHelp.DEST_MAX)
  const PINS_MAX = 12; // 📌 odložené nabídky (Pins.MAX)
  const obj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const fin = v => typeof v === 'number' && Number.isFinite(v);
  const numOr = (v, lo, hi) => (fin(v) && v >= lo && v <= hi ? v : null);
  const intIn = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const isYmd = s => typeof s === 'string' && /^(19|20|21)\d\d-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
  const BAD_KEY = k => k === '__proto__' || k === 'constructor' || k === 'prototype';
  const defTxt = (v, max, multi = false, raw = false) => (typeof v === 'string' || typeof v === 'number'
    ? (raw ? String(v).replace(/[\u202a-\u202e\u2066-\u2069]/g, '') : String(v).replace(/'/g, '’').replace(/[<>"`\u202a-\u202e\u2066-\u2069]/g, '')).replace(/\r\n?/g, '\n').replace(multi ? /[\x00-\x09\x0b-\x1f\x7f]/g : /[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max)
    : '');
  const DEPS = () => ({
    sanitizePlan: window.PlanShare && PlanShare.sanitize,
    sanitizeWizard: window.Trip && Trip.sanitizeTrip,
    txt: (window.PlanShare && PlanShare.txt) || defTxt,
    pins: window.Pins || null,
  });

  /** Záloha → text JSON. pretrip = odškrtnutí „Před cestou“ (PreTrip.exportDone()), own = 🏠 vlastní ceny na letiště. */
  function pack(S, pretrip = {}, now = Date.now()) {
    return JSON.stringify({
      app: 'atlas', v: V, at: new Date(now).toISOString(),
      data: { trips: S.trips || [], watch: S.watch || [], home: S.home || null, visited: S.visited || [], fav: S.fav || [], mute: S.mute || [], pretrip: pretrip || {}, own: cleanOwn(S.accessOwn), pins: S.pins || [] },
    });
  }
  // 🏠 Moje cena na letiště: { IATA: celé Kč 0–5 000 na osobu jedním směrem }, nejvýš 12 letišť (stejně jako
  // SearchHelp.ownClean a server – access.js normalizeOwn); neplatné položky pryč.
  const OWN_MAX = 12, OWN_MAX_CZK = 5000;
  function cleanOwn(v) {
    const o = {};
    if (!obj(v)) return o;
    for (const [k, c] of Object.entries(v).slice(0, 60)) {
      if (Object.keys(o).length >= OWN_MAX) break;
      if (/^[A-Z]{3}$/.test(k) && Number.isInteger(c) && c >= 0 && c <= OWN_MAX_CZK) o[k] = c;
    }
    return o;
  }

  /* ---------- pročištění cizího vstupu ---------- */
  const PLACE_ID = /^(ap|metro|geo|cc|ct|rg):[^<>"'`\n]{1,110}$/;
  function place(p, txt) {
    if (!obj(p) || typeof p.id !== 'string' || !PLACE_ID.test(p.id)) return null;
    const o = { id: p.id, label: txt(p.label, 80) || p.id.slice(p.id.indexOf(':') + 1, 60), flag: txt(p.flag, 8) };
    if (p.type) o.type = txt(p.type, 20);
    if (typeof p.iata === 'string' && /^[A-Z0-9]{3}$/.test(p.iata)) o.iata = p.iata;
    if (typeof p.cc === 'string' && /^[A-Z]{2}$/.test(p.cc)) o.cc = p.cc;
    if (p.en) o.en = txt(p.en, 80);
    if (p.sub) o.sub = txt(p.sub, 160);
    if (numOr(p.lat, -90, 90) != null && numOr(p.lon, -180, 180) != null) { o.lat = p.lat; o.lon = p.lon; }
    return o;
  }
  const places = (v, max, txt) => (Array.isArray(v) ? v.slice(0, max).map(p => place(p, txt)).filter(Boolean) : []);
  // ⭐ / 🙈 město jako skupina výsledků (metro:LON, ap:OPO) – klíč z id, každé jen jednou (ani v druhém seznamu: skip)
  function dests(v, txt, skip = new Set()) {
    const out = [], seen = new Set(skip);
    for (const d of Array.isArray(v) ? v.slice(0, 100) : []) {
      const m = obj(d) && typeof d.id === 'string' ? /^(?:metro|ap):([A-Z0-9]{3})$/.exec(d.id) : null;
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ id: d.id, key: m[1], label: txt(d.label, 80) || m[1], cc: typeof d.cc === 'string' && /^[A-Z]{2}$/.test(d.cc) ? d.cc : '' });
      if (out.length >= DEST_MAX) break;
    }
    return out;
  }

  // Volby formuláře jen ze známých hodnot – neznámá by formulář rozbila (žádné tlačítko .on), nechá se výchozí.
  const ENUM = { trip: ['return', 'oneway', 'multi'], dateMode: ['flex', 'exact'], len: ['weekend', 'long', 'week', '2weeks', 'custom', 'holiday'], groundMode: ['transit', 'car'], carFuel: ['diesel', 'petrol', 'ev'], bags: ['none', 'cabin', 'checked'] };
  const NUM = { radius: [0, 500], nMin: [0, 60], nMax: [0, 60], adults: [1, 9], xFlex: [0, 3], minTemp: [0, 40], kmRate: [0, 5] };
  const DATE = ['dFrom', 'dTo', 'xOut', 'xBack'];
  const FUELS = ['diesel', 'petrol', 'ev'];
  // 📅 klouzavý termín hlídání (Alerts.rollForm): celá čísla off 0–60 a span 7–180, nebo lw jen 'next' (eve: false = bez
  // „v předvečer od 16:00“) – jinak pryč (pevný termín)
  const cleanRoll = v => (!obj(v) ? null : v.lw === 'next' ? { lw: 'next', ...(v.eve === false ? { eve: false } : {}) }
    : v.lw == null && Number.isInteger(v.off) && v.off >= 0 && v.off <= 60 && Number.isInteger(v.span) && v.span >= 7 && v.span <= 180 ? { off: v.off, span: v.span } : null);
  /** Formulář hledání u hlídané ceny: místa, lety, dny, časy, volby a čísla ověřené, ostatní klíče jen jako jednoduché hodnoty. */
  function cleanForm(f, txt) {
    if (!obj(f)) return null;
    const o = {};
    for (const [k, v] of Object.entries(f).slice(0, 80)) {
      if (BAD_KEY(k) || !/^[a-zA-Z][a-zA-Z0-9]{0,24}$/.test(k)) continue;
      if (Object.hasOwn(ENUM, k)) { if (ENUM[k].includes(v)) o[k] = v; }
      else if (Object.hasOwn(NUM, k)) { if (fin(v)) o[k] = Math.min(NUM[k][1], Math.max(NUM[k][0], v)); }
      else if (DATE.includes(k)) { if (isYmd(v)) o[k] = v; }
      else if (k === 'carCons' || k === 'carPrice') { if (obj(v)) o[k] = Object.fromEntries(FUELS.map(x => [x, fin(v[x]) && v[x] > 0 && v[x] < 1000 ? v[x] : null])); }
      else if (k === 'from' || k === 'to') o[k] = places(v, 10, txt);
      else if (k === 'legs') o.legs = Array.isArray(v) ? v.slice(0, 4).map(l => (obj(l) && isYmd(l.date) ? { from: places(l.from, 5, txt), to: places(l.to, 5, txt), date: l.date, flex: intIn(l.flex, 0, 3, 0) } : null)).filter(Boolean) : [];
      else if (k === 'outDays' || k === 'backDays') o[k] = Array.isArray(v) ? [...new Set(v.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
      else if (k === 'exclude') o.exclude = Array.isArray(v) ? v.filter(x => typeof x === 'string' && /^[A-Z0-9]{3}$/.test(x)).slice(0, 40) : [];
      else if (k === 'depAfter') o.depAfter = obj(v) && isYmd(v.date) && typeof v.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) ? { date: v.date, time: v.time } : null;
      else if (k === 'roll') { const r = cleanRoll(v); if (r) o.roll = r; }
      else if (typeof v === 'string') o[k] = txt(v, 40);
      else if (fin(v) || typeof v === 'boolean' || v === null) o[k] = v;
    }
    return o.from && o.from.length ? o : null;
  }
  function cleanWatch(w, txt) {
    if (!obj(w) || typeof w.id !== 'string' || !/^[\w-]{1,40}$/.test(w.id)) return null;
    const form = cleanForm(w.form, txt);
    if (!form) return null;
    let best = null;
    if (obj(w.best) && fin(w.best.czk) && w.best.czk > 0) {
      best = { czk: w.best.czk, desc: txt(w.best.desc, 300) };
      for (const [k, v] of Object.entries(w.best).slice(0, 30)) {
        if (k in best || BAD_KEY(k) || !/^[a-zA-Z][a-zA-Z0-9]{0,24}$/.test(k)) continue;
        if (typeof v === 'string') best[k] = txt(v, 300); else if (fin(v) || typeof v === 'boolean' || v === null) best[k] = v;
      }
    }
    const o = {
      id: w.id, label: txt(w.label, 200), sub: txt(w.sub, 200), form, best,
      // own: 1 = od tohoto bodu cena s jinou 🏠 vlastní cenou na letiště (Alerts.epoch)
      history: Array.isArray(w.history) ? w.history.slice(-60).filter(h => obj(h) && fin(h.at) && fin(h.czk) && h.czk > 0).map(h => ({ at: h.at, czk: h.czk, ...(h.own === 1 ? { own: 1 } : {}) })) : [],
    };
    for (const k of ['checked', 'tried', 'base', 'low', 'seen', 'target', 'notified']) o[k] = fin(w[k]) ? w[k] : null;
    // otisk 🏠 vlastních cen v ceně hlídání („BRQ:0,VIE:350“, SearchHelp.ownPrint; Alerts.rebaseWhy)
    if (typeof w.own === 'string' && /^([A-Z]{3}:\d{1,4}(,[A-Z]{3}:\d{1,4}){0,39})?$/.test(w.own)) o.own = w.own;
    if (fin(w.rebAt)) o.rebAt = w.rebAt;
    if (['own', 'unmute', 'mute', 'price'].includes(w.rebWhy)) o.rebWhy = w.rebWhy;
    // pv 2 = cena jen za letenku (Alerts.PV); bez něj se hlídání při příští kontrole přepočítá jako ze starší verze
    if (w.pv === 2) o.pv = 2;
    return o;
  }
  // druh výsledku z Objevuj (city, bike, hike, train, day-car, loop-transit…) → řádky dnů, které tam uložil
  function cleanExplore(e, plan, d) {
    if (!obj(e)) return null;
    const o = {};
    for (const [k, v] of Object.entries(e).slice(0, 12)) {
      if (!/^[a-z]{2,10}(-[a-z]{2,10})?$/.test(k)) continue;
      o[k] = d.sanitizePlan({ start: plan.start, end: plan.end, days: v }, LIM).days;
    }
    return Object.keys(o).length ? o : null;
  }
  // Vlastní záloha nese plán celý – delší limity než sdílený odkaz (poznámky, aktivity, „Sbaleno“).
  // raw: texty beze změn (uvozovky, < >) – plánovač vše vypisuje přes esc()
  const LIM = { act: 1000, acts: 100, ck: 300, ckLen: 300, notes: 20000, raw: true };
  const PID = /^[a-z0-9]{6,24}$/;
  // 🔖 Rezervace u cesty (okno cesty v app.js): kódy letenek, potvrzení hotelu… – jen v zařízení a v záloze, do odkazů
  // nikdy (PlanShare.json zná jen pole plánu). Nejvýš REFS_MAX řádků { co, kod, pozn }, texty jednořádkové a zkrácené.
  const REFS_MAX = 6, REF_LEN = { co: 40, kod: 40, pozn: 120 };
  function cleanRefs(v, txt = defTxt) {
    return (Array.isArray(v) ? v.slice(0, 30) : []).filter(obj)
      .map(r => ({ co: txt(r.co, REF_LEN.co, false, true), kod: txt(r.kod, REF_LEN.kod, false, true), pozn: txt(r.pozn, REF_LEN.pozn, false, true) }))
      .filter(r => r.co || r.kod).slice(0, REFS_MAX);
  }
  // Sloučení rezervací: k těm v zařízení přibudou chybějící ze zálohy (stejné co + kód = tatáž), nic se nesmaže.
  const refKey = r => `${r.co}\n${r.kod}`.toLowerCase();
  const addRefs = (mine, inc) => { const a = mine || [], have = new Set(a.map(refKey)); return [...a, ...(inc || []).filter(r => !have.has(refKey(r)))].slice(0, REFS_MAX); };
  /** Cesta z průvodce: pročištěná Trip.sanitizeTrip + odškrtnuté rezervace (jen klíče ve známém tvaru, hodnota true). */
  function cleanWiz(w, d) {
    if (!obj(w) || !obj(w.flight) || !obj(w.flight.out) || !d.sanitizeWizard) return null;
    try {
      const t = d.sanitizeWizard(JSON.parse(JSON.stringify(w)));
      if (!t) return null;
      const booked = {};
      if (obj(w.booked)) for (const [k, v] of Object.entries(w.booked).slice(0, 300)) if (v === true && /^[\w:.,-]{1,140}$/.test(k) && !BAD_KEY(k)) booked[k] = true;
      return { ...t, booked };
    } catch (e) { return null; } // cesta zůstane v plánovači, jen bez „Otevřít v průvodci“
  }
  function cleanTrip(raw, d) {
    let plan;
    try { plan = d.sanitizePlan(raw, LIM); } catch (e) { return null; }
    const t = { ...plan };
    if (fin(raw.tripId) && raw.tripId > 0 && raw.tripId < 1e13) t.tripId = raw.tripId;
    if (typeof raw.pid === 'string' && PID.test(raw.pid)) t.pid = raw.pid;
    const w = cleanWiz(raw.wizard, d);
    if (w) t.wizard = w;
    // co vygeneroval průvodce: stejně jako plán (beze změn textu), ať se pozná, co uživatel v plánovači upravil
    if (raw.genName != null) t.genName = d.txt(raw.genName, 120, false, true);
    if (raw.genBudget != null) t.genBudget = d.txt(raw.genBudget, 20);
    if (raw.genNotes != null) t.genNotes = d.txt(raw.genNotes, LIM.notes, true, true);
    if (obj(raw.genDays)) t.genDays = d.sanitizePlan({ start: plan.start, end: plan.end, days: raw.genDays }, LIM).days;
    if (Array.isArray(raw.genChecklist)) t.genChecklist = raw.genChecklist.slice(0, LIM.ck).map(x => d.txt(x, LIM.ckLen, false, true)).filter(Boolean);
    const ex = cleanExplore(raw.explore, plan, d);
    if (ex) t.explore = ex;
    const refs = cleanRefs(raw.refs, d.txt);
    if (refs.length) t.refs = refs;
    return t;
  }
  function cleanHome(h, txt) {
    if (!obj(h)) return null;
    const from = places(h.from, 5, txt);
    return from.length ? { from, radius: intIn(h.radius, 0, 500, 200), adults: intIn(h.adults, 1, 9, 2) } : null;
  }
  function cleanPretrip(p) {
    const o = {};
    if (!obj(p)) return o;
    for (const [k, v] of Object.entries(p).slice(0, 30)) {
      if (BAD_KEY(k) || !/^[\w:.-]{1,80}$/.test(k) || !obj(v) || !obj(v.d)) continue;
      const ids = {};
      for (const id of Object.keys(v.d).slice(0, 200)) if (!BAD_KEY(id) && /^[\w:.-]{1,40}$/.test(id)) ids[id] = 1;
      o[k] = { d: ids, at: fin(v.at) ? v.at : 0 };
    }
    return o;
  }

  /** Text souboru → pročištěná data zálohy; jinak chyba s českou hláškou. */
  function parse(text, deps = DEPS()) {
    const d = { txt: defTxt, ...deps };
    let raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error('Tohle není záloha ATLAS (soubor není čitelný)'); }
    if (!obj(raw) || raw.app !== 'atlas' || !obj(raw.data)) throw new Error('Tohle není záloha ATLAS');
    if (raw.v !== V) throw new Error(fin(raw.v) && raw.v > V ? 'Záloha je z novější verze ATLAS – aktualizuj aplikaci' : 'Tohle není záloha ATLAS');
    const x = raw.data;
    const at = typeof raw.at === 'string' && !isNaN(Date.parse(raw.at)) ? Date.parse(raw.at) : null;
    const fav = dests(x.fav, d.txt); // město v obou seznamech zůstane ⭐
    return {
      at,
      trips: Array.isArray(x.trips) ? x.trips.slice(0, 300).filter(obj).map(t => cleanTrip(t, d)).filter(Boolean) : [],
      watch: Array.isArray(x.watch) ? x.watch.slice(0, 30).map(w => cleanWatch(w, d.txt)).filter(Boolean) : [],
      home: cleanHome(x.home, d.txt),
      visited: Array.isArray(x.visited) ? [...new Set(x.visited.filter(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c)))].slice(0, 260) : [],
      fav, mute: dests(x.mute, d.txt, new Set(fav.map(f => f.key))),
      pretrip: cleanPretrip(x.pretrip),
      own: cleanOwn(x.own),
      // 📌 odložené nabídky: s odletem v minulosti ne (starší záloha pole nemá)
      pins: d.pins ? d.pins.clean(x.pins, { today: d.today || ymd(), now: Date.now() }) : [],
    };
  }
  // Vlastní ceny ze zálohy: přibudou letiště, která v zařízení nemají cenu (do 12); cena v zařízení se nepřepíše.
  const ownAdd = (mine, inc) => { const o = { ...(mine || {}) }; for (const [k, c] of Object.entries(inc || {})) if (!Object.hasOwn(o, k) && Object.keys(o).length < OWN_MAX) o[k] = c; return o; };

  /* ---------- sloučení ---------- */
  // JSON s klíči objektů v abecedním pořadí – porovnání nezávisí na pořadí polí
  const stable = v => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : obj(v) ? `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',')}}` : JSON.stringify(v === undefined ? null : v));
  const planOf = (t, d) => { try { return d.sanitizePlan(t, LIM); } catch (e) { return null; } };
  // Stejný plán (bez „Sbaleno“) – jako import sdíleného plánu; cesty bez tripId i pid se poznají jen takhle.
  const planKey = (t, d) => { const p = planOf(t, d); if (!p) return '?'; const { checklist, ...rest } = p; return stable(rest); };
  // Podpis pro „změněná“: plán i se „Sbaleno“ a cesta z průvodce – obojí po stejném pročištění na obou stranách.
  const tripSig = (t, d) => stable([planOf(t, d), t.wizard ? cleanWiz(t.wizard, d) : null]);

  /**
   * Která cesta ze zálohy je která v zařízení: stejné tripId (z průvodce), stejné pid (planner id ze zálohy), jinak stejný
   * plán – každá cesta v zařízení se takhle spáruje nejvýš jednou. Stejná cesta v záloze podruhé = 'dup' (přeskočí se).
   * → [{ t, st: 'add' | 'same' | 'changed' | 'dup', i (index v zařízení u same/changed) }]
   */
  function match(cur, inc, d) {
    const ids = new Map(), pids = new Map(), byPlan = new Map(), used = new Set();
    const n = (cur.trips || []).length;
    const reg = (t, i) => {
      if (t.tripId) ids.set(t.tripId, i);
      if (t.pid) pids.set(t.pid, i);
      const k = planKey(t, d);
      byPlan.set(k, [...(byPlan.get(k) || []), i]);
    };
    (cur.trips || []).forEach(reg);
    let next = n;
    return inc.trips.map(t => {
      let i = t.tripId && ids.has(t.tripId) ? ids.get(t.tripId) : t.pid && pids.has(t.pid) ? pids.get(t.pid) : null;
      if (i == null) { i = (byPlan.get(planKey(t, d)) || []).find(j => !used.has(j)); if (i != null) used.add(i); }
      if (i == null) { reg(t, next++); return { t, st: 'add' }; }
      if (i >= n) return { t, st: 'dup' };
      return { t, st: tripSig(cur.trips[i], d) === tripSig(t, d) ? 'same' : 'changed', i };
    });
  }

  /**
   * ⭐ / 🙈 ze zálohy: přibudou města, která tu nejsou v žádném seznamu (volba v zařízení má přednost), nejvýš DEST_MAX
   * v každém → { fav, mute, add: { fav, mute }, over (nevešlo se) }.
   */
  function mergeDests(cur, inc) {
    const fav = (cur.fav || []).filter(obj), mute = (cur.mute || []).filter(obj), have = new Set([...fav, ...mute].map(x => x.key));
    const add = { fav: 0, mute: 0 };
    let over = 0;
    for (const [k, list] of [['fav', fav], ['mute', mute]]) {
      for (const x of inc[k] || []) {
        if (have.has(x.key)) continue;
        if (list.length >= DEST_MAX) { over++; continue; }
        have.add(x.key); list.push(x); add[k]++;
      }
    }
    return { fav, mute, add, over };
  }

  /** Co by obnova přidala: nové / změněné / stejné cesty, nové hlídání, nové země, domov, ⭐ / 🙈 města, nová odškrtnutí. */
  function diff(cur, inc, { watchKey = w => w.id, deps = DEPS() } = {}) {
    const d = { txt: defTxt, ...deps };
    const trips = { add: 0, same: 0, changed: 0 };
    let refs = 0; // cesty, kterým přibudou 🔖 kódy rezervací
    for (const m of match(cur, inc, d)) {
      trips[m.st === 'dup' ? 'same' : m.st]++;
      if (m.i != null && addRefs(cur.trips[m.i].refs, m.t.refs).length > (cur.trips[m.i].refs || []).length) refs++;
    }
    const wk = new Set((cur.watch || []).map(watchKey)), wid = new Set((cur.watch || []).map(w => w.id));
    const fresh = [];
    for (const w of inc.watch) { const k = watchKey(w); if (wk.has(k) || wid.has(w.id)) continue; wk.add(k); wid.add(w.id); fresh.push(w); }
    const room = Math.max(0, WATCH_CAP - (cur.watch || []).length);
    const vis = new Set(cur.visited || []);
    const homeSame = !inc.home || JSON.stringify(cur.home && cur.home.from && cur.home.from.map(p => p.id)) === JSON.stringify(inc.home.from.map(p => p.id)) && cur.home.radius === inc.home.radius;
    // „Před cestou“: jen cesty, kde by přibylo aspoň jedno odškrtnutí
    const pt = cur.pretrip || {};
    const pretrip = Object.entries(inc.pretrip || {}).filter(([k, v]) => Object.keys(v.d).some(id => !(obj(pt[k]) && obj(pt[k].d) && pt[k].d[id]))).length;
    const mineOwn = cleanOwn(cur.own), withOwn = ownAdd(mineOwn, inc.own);
    const ds = mergeDests(cur, inc), pm = pinsMerge(cur, inc, d);
    return {
      trips,
      watch: { add: Math.min(fresh.length, room), same: inc.watch.length - fresh.length, over: Math.max(0, fresh.length - room) },
      visited: { add: inc.visited.filter(c => !vis.has(c)).length },
      home: { take: Boolean(inc.home) && !cur.home, differs: Boolean(inc.home && cur.home) && !homeSame },
      dests: { ...ds.add, over: ds.over },
      // 📌 nové, s novější cenou (nahradí tu v zařízení), už máš, nevešly se (nejvýš 12)
      pins: { add: pm.add, newer: pm.newer, same: pm.same, over: pm.over },
      pretrip, refs,
      // 🏠 vlastní ceny: nová letiště, ta, kde má zařízení jinou cenu (zůstane ta ze zařízení), stejná a nová, která se
      // nevešla (nejvýš 12 letišť)
      own: (() => {
        const ks = Object.keys(inc.own || {}), add = Object.keys(withOwn).length - Object.keys(mineOwn).length, have = ks.filter(k => Object.hasOwn(mineOwn, k));
        return { add, differs: have.filter(k => mineOwn[k] !== inc.own[k]).length, same: have.filter(k => mineOwn[k] === inc.own[k]).length, over: ks.length - have.length - add };
      })(),
    };
  }

  // Přepsaná cesta: odškrtnutí „Sbaleno“ z obou zařízení zůstanou a vlastní položky ze zařízení se neztratí.
  function keepChecks(inc, old) {
    const was = new Map((old.checklist || []).map(x => [x.t, x.done]));
    const have = new Set((inc.checklist || []).map(x => x.t));
    return [...(inc.checklist || []).map(x => ({ ...x, done: x.done || was.get(x.t) === true })), ...(old.checklist || []).filter(x => !have.has(x.t))];
  }

  /** Nové seznamy po sloučení (vstupní pole nemění). Změněné cesty nahradí jen s overwrite, domov jen s takeHome. */
  function merge(cur, inc, { watchKey = w => w.id, overwrite = false, takeHome = false, deps = DEPS() } = {}) {
    const d = { txt: defTxt, ...deps };
    const trips = (cur.trips || []).slice();
    for (const m of match(cur, inc, d)) {
      if (m.st === 'add') trips.push(m.t);
      else if (m.st === 'dup') continue;
      else {
        const old = trips[m.i];
        // 🔖 kódy rezervací z obou stran (i u stejné cesty – na rezervacích plán nezávisí)
        const refs = m.st === 'changed' && overwrite ? addRefs(m.t.refs, old.refs) : addRefs(old.refs, m.t.refs);
        if (m.st === 'changed' && overwrite) trips[m.i] = { ...m.t, ...(old.tripId ? { tripId: old.tripId } : {}), ...(old.pid ? { pid: old.pid } : {}), checklist: keepChecks(m.t, old), ...(refs.length ? { refs } : {}) };
        else {
          // stejná cesta poznaná podle plánu: převzít pid ze zálohy, ať se příště pozná i po úpravě
          if (!old.pid && !old.tripId && m.t.pid) trips[m.i] = { ...old, pid: m.t.pid };
          if (refs.length > (old.refs || []).length) trips[m.i] = { ...trips[m.i], refs };
        }
      }
    }
    const watch = (cur.watch || []).slice();
    const wk = new Set(watch.map(watchKey)), wid = new Set(watch.map(w => w.id));
    for (const w of inc.watch) {
      if (watch.length >= WATCH_CAP) break;
      const k = watchKey(w);
      if (wk.has(k) || wid.has(w.id)) continue;
      wk.add(k); wid.add(w.id); watch.push(w);
    }
    const visited = [...new Set([...(cur.visited || []), ...inc.visited])];
    const home = cur.home ? (takeHome && inc.home ? inc.home : cur.home) : inc.home || null;
    const { fav, mute } = mergeDests(cur, inc);
    return { trips, watch, home, visited, fav, mute, own: ownAdd(cleanOwn(cur.own), inc.own), pins: pinsMerge(cur, inc, d).list };
  }
  // 📌 odložené nabídky ze zálohy (Pins.merge) – bez Pins zůstanou ty v zařízení
  const pinsMerge = (cur, inc, d) => (d.pins ? d.pins.merge(cur.pins, inc.pins, { today: d.today || ymd() }) : { list: cur.pins || [], add: 0, newer: 0, same: 0, over: 0 });

  /** Cestám bez tripId (nová cesta, víc měst, Objevuj, sdílený plán) dá stálé pid – po úpravě se v záloze pozná. */
  function ensurePids(trips, seed = Date.now()) {
    let n = 0;
    for (const t of trips || []) if (obj(t) && !t.tripId && !(typeof t.pid === 'string' && PID.test(t.pid))) { t.pid = (seed + n).toString(36) + Math.random().toString(36).slice(2, 7).padEnd(5, '0'); n++; }
    return n;
  }

  /* ---------- okno ---------- */
  const ymd = (ms = Date.now()) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fileName = (ext = 'json') => `atlas-zaloha-${ymd()}.${ext}`;
  const dateTxt = ms => new Date(ms).toLocaleDateString('cs-CZ');
  const daysAgo = ms => Math.floor((Date.now() - ms) / 864e5);
  const agoTxt = ms => { const n = daysAgo(ms); return n <= 0 ? 'dnes' : n === 1 ? 'včera' : `před ${n} dny`; };
  const pl = (n, a, b, c) => `${n} ${n === 1 ? a : n >= 2 && n <= 4 ? b : c}`;
  const homeTxt = h => (h && h.from && h.from.length ? `${h.from.map(p => p.label).join(', ')} +${h.radius} km` : '');
  const doneNow = () => (window.PreTrip && PreTrip.exportDone ? PreTrip.exportDone() : {});
  const current = () => ({ trips: S.trips || [], watch: S.watch || [], home: S.home || null, visited: S.visited || [], fav: S.fav || [], mute: S.mute || [], pretrip: doneNow(), own: S.accessOwn || {}, pins: S.pins || [] });
  const watchKey = w => (window.Flights && Flights.watchKey ? Flights.watchKey(w) : w.id);
  // před zabalením dostanou cesty bez tripId stálé pid (uloží se i tady, ať se příští záloha s touhle spáruje)
  const text = () => { if (ensurePids(S.trips)) save(); return pack(S, doneNow()); };
  const statusTxt = () => { const has = (S.trips || []).length || (S.watch || []).length || (S.visited || []).length || (S.fav || []).length || (S.mute || []).length || (S.pins || []).length; return S.backupAt ? `Poslední záloha: ${dateTxt(S.backupAt)} (${agoTxt(S.backupAt)})` : has ? 'Zatím žádná záloha.' : 'Zatím tu nic uloženého není – obnovou ze zálohy si sem data přeneseš.'; };
  const stamp = () => {
    S.backupAt = Date.now(); save();
    const st = $('#bkStatus'); if (st) st.textContent = statusTxt();
    const row = $('.plan-tools'); if (row) { row.outerHTML = plannerTools(); const b = $('#bkOpen'); if (b) b.onclick = () => open(); }
  };

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text()], { type: 'application/json' }));
    a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    stamp();
  }
  // Chrome sdílí soubory jen některých typů (text/plain ano, JSON ne) – do jiného zařízení jako .txt
  async function share() {
    const file = new File([text()], fileName('txt'), { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'ATLAS – záloha' }); stamp(); toast('Záloha odeslána'); }
      catch (e) { if (e && e.name !== 'AbortError') { download(); toast('Záloha stažena – pošli si soubor do druhého zařízení (e-mail, Disk, Nearby Share)'); } }
      return;
    }
    download();
    toast('Záloha stažena – pošli si soubor do druhého zařízení (e-mail, Disk, Nearby Share)');
  }

  function summaryHtml(inc, df) {
    const parts = [];
    if (inc.trips.length) parts.push(`${pl(inc.trips.length, 'cesta', 'cesty', 'cest')} (${[df.trips.add ? `${df.trips.add} ${df.trips.add === 1 ? 'nová' : df.trips.add <= 4 ? 'nové' : 'nových'}` : '', df.trips.changed ? `${df.trips.changed} ${df.trips.changed === 1 ? 'změněná' : df.trips.changed <= 4 ? 'změněné' : 'změněných'}` : '', df.trips.same ? `${df.trips.same} už máš` : ''].filter(Boolean).join(', ')})`);
    if (inc.watch.length) {
      const w = df.watch, one = inc.watch.length === 1;
      const bits = [w.add ? `${w.add} ${w.add === 1 ? 'nová' : w.add <= 4 ? 'nové' : 'nových'}` : '', w.same ? (one ? 'už ji máš' : `${w.same} už máš`) : '', w.over ? (one ? 'nevešla se' : `${w.over} se nevešl${w.over === 1 ? 'a' : w.over <= 4 ? 'y' : 'o'}`) : ''].filter(Boolean);
      parts.push(`${pl(inc.watch.length, 'hlídaná cena', 'hlídané ceny', 'hlídaných cen')}${bits.length ? ` (${bits.join(', ')})` : ''}`);
    }
    if (inc.visited.length) parts.push(`${pl(inc.visited.length, 'země', 'země', 'zemí')} na mapě${df.visited.add ? ` (${df.visited.add} ${df.visited.add === 1 ? 'nová' : df.visited.add <= 4 ? 'nové' : 'nových'})` : ''}`);
    if (inc.home) parts.push(`domov radaru ${homeTxt(inc.home)}`);
    const nov = (n, a, b, c) => (n ? ` (${n} ${n === 1 ? a : n <= 4 ? b : c})` : '');
    if (inc.fav.length) parts.push(`⭐ ${pl(inc.fav.length, 'můj cíl', 'moje cíle', 'mých cílů')}${nov(df.dests.fav, 'nový', 'nové', 'nových')}`);
    if (inc.mute.length) parts.push(`🙈 ${pl(inc.mute.length, 'skryté město', 'skrytá města', 'skrytých měst')}${nov(df.dests.mute, 'nové', 'nová', 'nových')}`);
    if (df.pretrip) parts.push(`odškrtnutí „Před cestou“ u ${pl(df.pretrip, 'cesty', 'cest', 'cest')}`);
    if (df.refs) parts.push(`🔖 kódy rezervací u ${pl(df.refs, 'cesty', 'cest', 'cest')}`);
    const np = (inc.pins || []).length, ps = df.pins;
    if (np) {
      const bits = [ps.add ? `${ps.add} ${ps.add === 1 ? 'nová' : ps.add <= 4 ? 'nové' : 'nových'}` : '', ps.newer ? `${ps.newer} s novější cenou` : '', ps.same ? (np === 1 ? 'už ji máš' : `${ps.same} už máš`) : '', ps.over ? (np === 1 ? 'nevešla se' : `${ps.over} se nevešl${ps.over === 1 ? 'a' : ps.over <= 4 ? 'y' : 'o'}`) : ''].filter(Boolean);
      parts.push(`📌 ${pl(np, 'odložená nabídka', 'odložené nabídky', 'odložených nabídek')}${bits.length ? ` (${bits.join(', ')})` : ''}`);
    }
    const no = Object.keys(inc.own || {}).length, o = df.own;
    if (no) {
      // „(už máš)“ jen když jsou v zařízení všechna se stejnou cenou
      const bits = [o.add ? `${o.add} ${o.add === 1 ? 'nové' : o.add <= 4 ? 'nová' : 'nových'}` : '', o.same ? (o.same === no ? 'už máš' : `${o.same} už máš`) : '', o.over ? `${o.over} se nevešl${o.over === 1 ? 'o' : o.over <= 4 ? 'a' : 'o'}` : ''].filter(Boolean);
      parts.push(`🏠 vlastní cena na ${pl(no, 'letiště', 'letiště', 'letišť')}${bits.length ? ` (${bits.join(', ')})` : ''}${o.differs ? ` – u ${pl(o.differs, 'letiště', 'letišť', 'letišť')} máš jinou cenu, ta zůstane` : ''}`);
    }
    return parts.length ? esc(parts.join(' · ')) : 'Záloha je prázdná.';
  }

  function preview(inc) {
    const df = diff(current(), inc, { watchKey });
    const body = $('#bkBody');
    if (!body) return;
    const nothing = !df.trips.add && !df.trips.changed && !df.watch.add && !df.visited.add && !df.home.take && !df.home.differs && !df.pretrip && !df.refs && !df.own.add && !df.dests.fav && !df.dests.mute && !df.pins.add && !df.pins.newer;
    const empty = !inc.trips.length && !inc.watch.length && !inc.visited.length && !inc.home && !inc.fav.length && !inc.mute.length && !Object.keys(inc.pretrip).length && !Object.keys(inc.own || {}).length && !(inc.pins || []).length;
    body.innerHTML = `<p style="font-size:14px;margin-bottom:10px"><b>Záloha${inc.at ? ' z ' + esc(new Date(inc.at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })) : ''}:</b> ${summaryHtml(inc, df)}</p>
      ${df.trips.changed ? `<label class="bk-opt"><input type="checkbox" id="bkOver"> Přepsat změněné cesty verzí ze zálohy (${df.trips.changed})</label>` : ''}
      ${df.home.differs ? `<label class="bk-opt"><input type="checkbox" id="bkHome"> Převzít domov radaru ze zálohy (${esc(homeTxt(inc.home))})</label>` : ''}
      ${df.watch.over ? `<div class="note warn" style="margin:8px 0">⚠️ <div>Hlídat jde nejvýš ${WATCH_CAP} hledání – ${pl(df.watch.over, 'se nevešlo', 'se nevešla', 'se nevešlo')}.</div></div>` : ''}
      ${df.dests.over ? `<div class="note warn" style="margin:8px 0">⚠️ <div>⭐ Moje cíle i 🙈 Nezajímá mě pojmou nejvýš ${DEST_MAX} měst – ${pl(df.dests.over, 'město se nevešlo', 'města se nevešla', 'měst se nevešlo')}.</div></div>` : ''}
      ${df.own.over ? `<div class="note warn" style="margin:8px 0">⚠️ <div>🏠 Vlastní cenu jde mít nejvýš u ${OWN_MAX} letišť – ${pl(df.own.over, 'letiště se nevešlo', 'letiště se nevešla', 'letišť se nevešlo')}.</div></div>` : ''}
      ${df.pins.over ? `<div class="note warn" style="margin:8px 0">⚠️ <div>📌 Odložit jde nejvýš ${PINS_MAX} nabídek – ${pl(df.pins.over, 'se nevešla', 'se nevešly', 'se nevešlo')}.</div></div>` : ''}
      ${nothing && !empty && !df.watch.over && !df.dests.over && !df.own.over && !df.pins.over ? '<div class="note info" style="margin:8px 0">ℹ️ <div>Všechno ze zálohy už v tomhle zařízení je.</div></div>' : ''}
      <div class="bk-actions" style="margin-top:14px">${nothing ? '' : '<button type="button" class="btn primary" id="bkApply">Sloučit do tohoto zařízení</button>'}<button type="button" class="btn ghost" id="bkCancel">${nothing ? 'Zavřít' : 'Zrušit'}</button></div>`;
    $('#bkCancel').onclick = () => modalClose();
    const ap = $('#bkApply');
    if (ap) ap.onclick = () => apply(inc, { overwrite: Boolean($('#bkOver') && $('#bkOver').checked), takeHome: Boolean($('#bkHome') && $('#bkHome').checked) }, df);
  }

  function apply(inc, opts, df) {
    const before = { trips: S.trips, watch: S.watch, home: S.home, visited: S.visited, fav: S.fav, mute: S.mute, trip: S.trip, accessOwn: S.accessOwn, pins: S.pins };
    // přepsaná cesta, která je zrovna v průvodci: průvodce by ji otevřel v původní verzi (a uložením zálohu přepsal)
    const cur = current(), overIds = opts.overwrite ? match(cur, inc, { txt: defTxt, ...DEPS() }).filter(x => x.st === 'changed' && cur.trips[x.i].tripId).map(x => cur.trips[x.i].tripId) : [];
    const m = merge(cur, inc, { watchKey, ...opts });
    // přidaná cesta bez seznamu „Sbaleno“ dostane výchozí (jako import sdíleného plánu)
    const added = new Set(inc.trips);
    for (const t of m.trips) if (added.has(t) && !(t.checklist || []).length && typeof PACK !== 'undefined') t.checklist = PACK.map(x => ({ t: x, done: false }));
    const homeChanged = JSON.stringify(m.home) !== JSON.stringify(S.home || null);
    // jen země, které aplikace zná (jinak by šly z mapy odškrtnout jen těžko a zkreslily počty)
    const known = typeof byIso === 'object' && byIso && Object.keys(byIso).length ? cc => Boolean(byIso[cc]) || (S.visited || []).includes(cc) : () => true;
    Object.assign(S, { trips: m.trips, watch: m.watch, home: m.home, visited: m.visited.filter(known), fav: m.fav, mute: m.mute, accessOwn: m.own, pins: m.pins });
    if (S.trip && overIds.includes(S.trip.created)) S.trip = null; // „Otevřít v průvodci“ pak vezme verzi ze zálohy
    // plné úložiště: nic nesloučit (jinak by aplikace ukazovala data, která po obnovení stránky zmizí)
    if (save() === false) {
      Object.assign(S, before);
      toast('V prohlížeči není pro zálohu místo – nic se nesloučilo. Uvolni místo (třeba smaž staré cesty) a zkus to znovu.', 'err');
      return;
    }
    visited.clear(); S.visited.forEach(cc => visited.add(cc));
    if (window.PreTrip && PreTrip.mergeDone) PreTrip.mergeDone(inc.pretrip);
    modalClose();
    if (typeof refreshStats === 'function') refreshStats();
    if (typeof paintMap === 'function') paintMap();
    if (activeView === 'planner') renderPlanner();
    if (activeView === 'dashboard' && typeof renderDash === 'function') renderDash();
    if (activeView === 'countries' && typeof renderCountries === 'function') renderCountries(); // filtr „Navštívené“
    if (window.Flights) {
      Flights.renderWatch();
      if (Flights.updateHomeChip) Flights.updateHomeChip();
      if (homeChanged && Flights.homeChanged) Flights.homeChanged(); // i Odkud v hledání na Přehledu
      else if (df.own.add && activeView === 'dashboard') Flights.renderRadar();
      if (df.own.add && Flights.refreshOrigins) Flights.refreshOrigins(); // 🏠 vlastní ceny ve formuláři
      if (Flights.refreshVisited) Flights.refreshVisited();
      if ((df.dests.fav || df.dests.mute) && Flights.refreshPrefs) Flights.refreshPrefs(); // radar, pruh ⭐ Moje cíle, Kamkoliv
      if ((df.pins.add || df.pins.newer) && Flights.refreshPins) Flights.refreshPins(); // 📌 Přehled, radar, výpis
    }
    const over = opts.overwrite ? df.trips.changed : 0;
    const bits = [df.trips.add ? `+${pl(df.trips.add, 'cesta', 'cesty', 'cest')}` : '', over ? pl(over, 'cesta přepsána', 'cesty přepsány', 'cest přepsáno') : '', df.watch.add ? `+${pl(df.watch.add, 'hlídaná cena', 'hlídané ceny', 'hlídaných cen')}` : '', df.visited.add ? `+${pl(df.visited.add, 'země', 'země', 'zemí')}` : '', df.dests.fav ? `+${pl(df.dests.fav, 'můj cíl', 'moje cíle', 'mých cílů')}` : '', df.dests.mute ? `+${pl(df.dests.mute, 'skryté město', 'skrytá města', 'skrytých měst')}` : '', df.pins.add ? `+${pl(df.pins.add, 'odložená nabídka', 'odložené nabídky', 'odložených nabídek')}` : '', df.pins.newer ? `📌 novější cena u ${pl(df.pins.newer, 'odložené nabídky', 'odložených nabídek', 'odložených nabídek')}` : '', homeChanged ? 'domov radaru převzat' : '', df.pretrip ? `odškrtnutí „Před cestou“ u ${pl(df.pretrip, 'cesty', 'cest', 'cest')}` : '', df.refs ? `🔖 kódy rezervací u ${pl(df.refs, 'cesty', 'cest', 'cest')}` : '', df.own.add ? `🏠 vlastní cena na +${pl(df.own.add, 'letiště', 'letiště', 'letišť')}` : ''].filter(Boolean);
    toast(bits.length ? 'Sloučeno: ' + bits.join(', ') : 'Nic nového se nesloučilo');
  }

  function restore(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { toast('Soubor je moc velký – tohle není záloha ATLAS', 'err'); return; }
    const r = new FileReader();
    r.onload = () => { try { preview(parse(String(r.result))); } catch (e) { toast(e.message || 'Zálohu se nepodařilo načíst', 'err'); } };
    r.onerror = () => toast('Soubor se nepodařilo přečíst', 'err');
    r.readAsText(file);
  }

  async function storageTxt() {
    try {
      if (!navigator.storage || !navigator.storage.persisted) return '';
      let on = await navigator.storage.persisted();
      // jen po kliknutí uživatele (otevření okna) – žádný dotaz při startu aplikace
      if (!on && navigator.storage.persist) on = await navigator.storage.persist();
      return on ? 'Úložiště: trvalé ✓ – prohlížeč ho sám nesmaže.' : 'Úložiště: prohlížeč ho může při nedostatku místa smazat – záloha se hodí.';
    } catch (e) { return ''; }
  }

  function open() {
    const canShare = typeof navigator.share === 'function' && typeof File === 'function';
    modalOpen(`<div class="modal-body bk-modal">
      <h3 style="margin-bottom:8px">💾 Přenos a záloha</h3>
      <p class="muted" style="font-size:14px;margin-bottom:12px">Cesty z plánovače, hlídané ceny, 📌 odložené nabídky, domov radaru, navštívené země, ⭐ moje cíle a 🙈 skrytá města, odškrtnuté položky „Před cestou“ a 🏠 vlastní ceny na letiště jsou jen v tomhle prohlížeči. Přenes je do telefonu nebo počítače souborem – nic se neukládá na server.</p>
      <div id="bkBody">
        <div class="bk-actions">
          ${canShare ? '<button type="button" class="btn primary" id="bkShare">📲 Poslat do jiného zařízení</button>' : ''}
          <button type="button" class="btn${canShare ? '' : ' primary'}" id="bkDown">⬇️ Stáhnout zálohu</button>
          <button type="button" class="btn ghost" id="bkPick">📂 Obnovit ze zálohy…</button>
          <input type="file" id="bkFile" accept=".json,.txt,application/json,text/plain" hidden>
        </div>
        <div class="faint" style="font-size:12.5px;margin-top:12px"><span id="bkStatus">${statusTxt()}</span><span id="bkStore"></span></div>
        <div class="faint" style="font-size:12px;margin-top:8px">Na druhém zařízení otevři ATLAS → ${canShare ? 'Plánovač' : 'Plánovač nebo menu Více'} → 💾 Přenos a záloha → 📂 Obnovit ze zálohy. Obnova nic nesmaže: přidá, co chybí. Nepřenáší se rozpracovaná cesta v průvodci (uložené cesty v plánovači ji mají), uložené výsledky hledání a radaru, nedávná hledání, paměť cen, Objevuj a motiv.</div>
      </div></div>`);
    if (canShare) $('#bkShare').onclick = () => share();
    $('#bkDown').onclick = () => { download(); toast('Záloha stažena'); };
    $('#bkPick').onclick = () => $('#bkFile').click();
    $('#bkFile').onchange = e => restore(e.target.files && e.target.files[0]);
    storageTxt().then(t => { const s = $('#bkStore'); if (s && t) s.textContent = ' · ' + t; });
  }

  /** Řádek nad plánovačem: tlačítko a připomínka, když záloha chybí nebo je stará (30 dní). */
  function plannerTools() {
    const has = (S.trips || []).length || (S.watch || []).length;
    const n = S.backupAt ? daysAgo(S.backupAt) : null;
    const nudge = !has ? '' : n == null ? '<span class="faint">zatím bez zálohy – vše je jen v tomhle prohlížeči</span>' : n >= 30 ? `<span class="faint">poslední záloha před ${n} dny</span>` : '';
    return `<div class="row wrap plan-tools"><button type="button" class="btn sm ghost" id="bkOpen">💾 Přenos a záloha</button>${nudge}</div>`;
  }

  window.Backup = { V, pack, parse, diff, merge, mergeDests, match, ensurePids, cleanForm, cleanRefs, summaryHtml, open, plannerTools, WATCH_CAP, REFS_MAX, REF_LEN };
})();
