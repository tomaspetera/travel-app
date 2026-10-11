/* ATLAS – 💾 Přenos a záloha: cesty z plánovače, hlídané ceny, domov radaru, navštívené země a odškrtnutí „Před cestou“
   jsou jen v localStorage jednoho prohlížeče. Záloha je jeden soubor JSON (v telefonu se posílá jako .txt – Chrome sdílí
   jen některé typy souborů), obnova ho sloučí s tím, co v zařízení už je. Nic se neukládá na server.
   Soubor je cizí vstup (mohl ho poslat kdokoli): parse() z něj postaví nové objekty jen se známými poli – plány přes
   PlanShare.sanitize, cesty z průvodce přes Trip.sanitizeTrip, zbytek podle pravidel tady. */
(function () {
  const V = 1;
  const MAX_FILE = 5e6;
  const WATCH_CAP = 12; // jako ♡ Hlídat (flights.js)
  const obj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const fin = v => typeof v === 'number' && Number.isFinite(v);
  const numOr = (v, lo, hi) => (fin(v) && v >= lo && v <= hi ? v : null);
  const intIn = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const isYmd = s => typeof s === 'string' && /^(19|20|21)\d\d-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
  const BAD_KEY = k => k === '__proto__' || k === 'constructor' || k === 'prototype';
  const defTxt = (v, max, multi = false) => (typeof v === 'string' || typeof v === 'number'
    ? String(v).replace(/'/g, '’').replace(/[<>"`‪-‮⁦-⁩]/g, '').replace(/\r\n?/g, '\n').replace(multi ? /[\x00-\x09\x0b-\x1f\x7f]/g : /[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max)
    : '');
  const DEPS = () => ({
    sanitizePlan: window.PlanShare && PlanShare.sanitize,
    sanitizeWizard: window.Trip && Trip.sanitizeTrip,
    txt: (window.PlanShare && PlanShare.txt) || defTxt,
  });

  /** Záloha → text JSON. pretrip = odškrtnutí „Před cestou“ (PreTrip.exportDone()). */
  function pack(S, pretrip = {}, now = Date.now()) {
    return JSON.stringify({
      app: 'atlas', v: V, at: new Date(now).toISOString(),
      data: { trips: S.trips || [], watch: S.watch || [], home: S.home || null, visited: S.visited || [], pretrip: pretrip || {} },
    });
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

  /** Formulář hledání u hlídané ceny: místa, lety, dny a časy ověřené, ostatní klíče jen jako jednoduché hodnoty. */
  function cleanForm(f, txt) {
    if (!obj(f)) return null;
    const o = {};
    for (const [k, v] of Object.entries(f).slice(0, 80)) {
      if (BAD_KEY(k) || !/^[a-zA-Z][a-zA-Z0-9]{0,24}$/.test(k)) continue;
      if (k === 'from' || k === 'to') o[k] = places(v, 10, txt);
      else if (k === 'legs') o.legs = Array.isArray(v) ? v.slice(0, 4).map(l => (obj(l) && isYmd(l.date) ? { from: places(l.from, 5, txt), to: places(l.to, 5, txt), date: l.date, flex: intIn(l.flex, 0, 3, 0) } : null)).filter(Boolean) : [];
      else if (k === 'outDays' || k === 'backDays') o[k] = Array.isArray(v) ? [...new Set(v.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
      else if (k === 'exclude') o.exclude = Array.isArray(v) ? v.filter(x => typeof x === 'string' && /^[A-Z0-9]{3}$/.test(x)).slice(0, 40) : [];
      else if (k === 'depAfter') o.depAfter = obj(v) && isYmd(v.date) && typeof v.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) ? { date: v.date, time: v.time } : null;
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
      history: Array.isArray(w.history) ? w.history.slice(-60).filter(h => obj(h) && fin(h.at) && fin(h.czk) && h.czk > 0).map(h => ({ at: h.at, czk: h.czk })) : [],
    };
    for (const k of ['checked', 'tried', 'base', 'low', 'seen', 'target', 'notified']) o[k] = fin(w[k]) ? w[k] : null;
    return o;
  }
  // druh výsledku z Objevuj (city, bike, hike, train, day-car, loop-transit…) → řádky dnů, které tam uložil
  function cleanExplore(e, plan, d) {
    if (!obj(e)) return null;
    const o = {};
    for (const [k, v] of Object.entries(e).slice(0, 12)) {
      if (!/^[a-z]{2,10}(-[a-z]{2,10})?$/.test(k)) continue;
      o[k] = d.sanitizePlan({ start: plan.start, end: plan.end, days: v }).days;
    }
    return Object.keys(o).length ? o : null;
  }
  function cleanTrip(raw, d) {
    let plan;
    try { plan = d.sanitizePlan(raw); } catch (e) { return null; }
    const t = { ...plan };
    if (fin(raw.tripId) && raw.tripId > 0 && raw.tripId < 1e13) t.tripId = raw.tripId;
    if (obj(raw.wizard) && obj(raw.wizard.flight) && obj(raw.wizard.flight.out) && d.sanitizeWizard) {
      try {
        const w = d.sanitizeWizard(JSON.parse(JSON.stringify(raw.wizard)));
        if (w) {
          const booked = {};
          if (obj(raw.wizard.booked)) for (const [k, v] of Object.entries(raw.wizard.booked).slice(0, 300)) if (v === true && /^[\w:.,-]{1,140}$/.test(k) && !BAD_KEY(k)) booked[k] = true;
          t.wizard = { ...w, booked };
        }
      } catch (e) { /* cesta zůstane v plánovači, jen bez „Otevřít v průvodci“ */ }
    }
    if (raw.genName != null) t.genName = d.txt(raw.genName, 120);
    if (raw.genBudget != null) t.genBudget = d.txt(raw.genBudget, 20);
    if (raw.genNotes != null) t.genNotes = d.txt(raw.genNotes, 3000, true);
    if (obj(raw.genDays)) t.genDays = d.sanitizePlan({ start: plan.start, end: plan.end, days: raw.genDays }).days;
    if (Array.isArray(raw.genChecklist)) t.genChecklist = raw.genChecklist.slice(0, 80).map(x => d.txt(x, 120)).filter(Boolean);
    const ex = cleanExplore(raw.explore, plan, d);
    if (ex) t.explore = ex;
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
    return {
      at,
      trips: Array.isArray(x.trips) ? x.trips.slice(0, 300).filter(obj).map(t => cleanTrip(t, d)).filter(Boolean) : [],
      watch: Array.isArray(x.watch) ? x.watch.slice(0, 30).map(w => cleanWatch(w, d.txt)).filter(Boolean) : [],
      home: cleanHome(x.home, d.txt),
      visited: Array.isArray(x.visited) ? [...new Set(x.visited.filter(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c)))].slice(0, 260) : [],
      pretrip: cleanPretrip(x.pretrip),
    };
  }

  /* ---------- sloučení ---------- */
  // Stejná cesta: stejné tripId (z průvodce), jinak stejný plán (bez seznamu „Sbaleno“) – jako import sdíleného plánu.
  const planKey = (t, d) => { try { const { checklist, ...rest } = d.sanitizePlan(t); return JSON.stringify(rest); } catch (e) { return '?'; } };
  const tripKey = (t, d) => (t.tripId ? 'id:' + t.tripId : 'plan:' + planKey(t, d));
  const tripSig = (t, d) => { try { const { checklist, ...rest } = d.sanitizePlan(t); return JSON.stringify([rest, t.wizard || null]); } catch (e) { return '?'; } };

  /** Co by obnova přidala: nové / změněné / stejné cesty, nové hlídání, nové země, domov, odškrtnutí. */
  function diff(cur, inc, { watchKey = w => w.id, deps = DEPS() } = {}) {
    const d = { txt: defTxt, ...deps };
    const have = new Map((cur.trips || []).map(t => [tripKey(t, d), t]));
    const trips = { add: 0, same: 0, changed: 0 };
    for (const t of inc.trips) {
      const o = have.get(tripKey(t, d));
      if (!o) trips.add++; else if (tripSig(o, d) === tripSig(t, d)) trips.same++; else trips.changed++;
    }
    const wk = new Set((cur.watch || []).map(watchKey)), wid = new Set((cur.watch || []).map(w => w.id));
    const fresh = inc.watch.filter(w => !wk.has(watchKey(w)) && !wid.has(w.id));
    const room = Math.max(0, WATCH_CAP - (cur.watch || []).length);
    const vis = new Set(cur.visited || []);
    const homeSame = !inc.home || JSON.stringify(cur.home && cur.home.from && cur.home.from.map(p => p.id)) === JSON.stringify(inc.home.from.map(p => p.id)) && cur.home.radius === inc.home.radius;
    return {
      trips,
      watch: { add: Math.min(fresh.length, room), same: inc.watch.length - fresh.length, over: Math.max(0, fresh.length - room) },
      visited: { add: inc.visited.filter(c => !vis.has(c)).length },
      home: { take: Boolean(inc.home) && !cur.home, differs: Boolean(inc.home && cur.home) && !homeSame },
      pretrip: Object.keys(inc.pretrip || {}).length,
    };
  }

  /** Nové seznamy po sloučení (vstupní pole nemění). Změněné cesty nahradí jen s overwrite, domov jen s takeHome. */
  function merge(cur, inc, { watchKey = w => w.id, overwrite = false, takeHome = false, deps = DEPS() } = {}) {
    const d = { txt: defTxt, ...deps };
    const trips = (cur.trips || []).slice();
    const idx = new Map(trips.map((t, i) => [tripKey(t, d), i]));
    for (const t of inc.trips) {
      const k = tripKey(t, d);
      if (!idx.has(k)) { idx.set(k, trips.length); trips.push(t); } else if (overwrite && tripSig(trips[idx.get(k)], d) !== tripSig(t, d)) trips[idx.get(k)] = t;
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
    return { trips, watch, home, visited };
  }

  /* ---------- okno ---------- */
  const ymd = (ms = Date.now()) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fileName = (ext = 'json') => `atlas-zaloha-${ymd()}.${ext}`;
  const dateTxt = ms => new Date(ms).toLocaleDateString('cs-CZ');
  const daysAgo = ms => Math.floor((Date.now() - ms) / 864e5);
  const agoTxt = ms => { const n = daysAgo(ms); return n <= 0 ? 'dnes' : n === 1 ? 'včera' : `před ${n} dny`; };
  const pl = (n, a, b, c) => `${n} ${n === 1 ? a : n >= 2 && n <= 4 ? b : c}`;
  const homeTxt = h => (h && h.from && h.from.length ? `${h.from.map(p => p.label).join(', ')} +${h.radius} km` : '');
  const current = () => ({ trips: S.trips || [], watch: S.watch || [], home: S.home || null, visited: S.visited || [] });
  const watchKey = w => (window.Flights && Flights.watchKey ? Flights.watchKey(w) : w.id);
  const text = () => pack(S, window.PreTrip && PreTrip.exportDone ? PreTrip.exportDone() : {});
  const stamp = () => { S.backupAt = Date.now(); save(); };

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
    if (inc.watch.length) parts.push(`${pl(inc.watch.length, 'hlídaná cena', 'hlídané ceny', 'hlídaných cen')}${df.watch.add ? ` (${df.watch.add} ${df.watch.add === 1 ? 'nová' : df.watch.add <= 4 ? 'nové' : 'nových'})` : ' (všechny už máš)'}`);
    if (inc.visited.length) parts.push(`${pl(inc.visited.length, 'země', 'země', 'zemí')} na mapě${df.visited.add ? ` (${df.visited.add} ${df.visited.add === 1 ? 'nová' : df.visited.add <= 4 ? 'nové' : 'nových'})` : ''}`);
    if (inc.home) parts.push(`domov radaru ${homeTxt(inc.home)}`);
    if (df.pretrip) parts.push(`odškrtnutí „Před cestou“ u ${pl(df.pretrip, 'cesty', 'cest', 'cest')}`);
    return parts.length ? esc(parts.join(' · ')) : 'Záloha je prázdná.';
  }

  function preview(inc) {
    const df = diff(current(), inc, { watchKey });
    const body = $('#bkBody');
    if (!body) return;
    const nothing = !df.trips.add && !df.trips.changed && !df.watch.add && !df.visited.add && !df.home.take && !df.home.differs && !df.pretrip;
    body.innerHTML = `<p style="font-size:14px;margin-bottom:10px"><b>Záloha${inc.at ? ' z ' + esc(new Date(inc.at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })) : ''}:</b> ${summaryHtml(inc, df)}</p>
      ${df.trips.changed ? `<label class="bk-opt"><input type="checkbox" id="bkOver"> Přepsat změněné cesty verzí ze zálohy (${df.trips.changed})</label>` : ''}
      ${df.home.differs ? `<label class="bk-opt"><input type="checkbox" id="bkHome"> Převzít domov radaru ze zálohy (${esc(homeTxt(inc.home))})</label>` : ''}
      ${df.watch.over ? `<div class="note warn" style="margin:8px 0">⚠️ <div>Hlídat jde nejvýš ${WATCH_CAP} hledání – ${pl(df.watch.over, 'se nevešlo', 'se nevešla', 'se nevešlo')}.</div></div>` : ''}
      ${nothing ? '<div class="note info" style="margin:8px 0">ℹ️ <div>Všechno ze zálohy už v tomhle zařízení je.</div></div>' : ''}
      <div class="bk-actions" style="margin-top:14px">${nothing ? '' : '<button type="button" class="btn primary" id="bkApply">Sloučit do tohoto zařízení</button>'}<button type="button" class="btn ghost" id="bkCancel">${nothing ? 'Zavřít' : 'Zrušit'}</button></div>`;
    $('#bkCancel').onclick = () => modalClose();
    const ap = $('#bkApply');
    if (ap) ap.onclick = () => apply(inc, { overwrite: Boolean($('#bkOver') && $('#bkOver').checked), takeHome: Boolean($('#bkHome') && $('#bkHome').checked) }, df);
  }

  function apply(inc, opts, df) {
    const m = merge(current(), inc, { watchKey, ...opts });
    // přidaná cesta bez seznamu „Sbaleno“ dostane výchozí (jako import sdíleného plánu)
    const added = new Set(inc.trips);
    for (const t of m.trips) if (added.has(t) && !(t.checklist || []).length && typeof PACK !== 'undefined') t.checklist = PACK.map(x => ({ t: x, done: false }));
    const homeChanged = JSON.stringify(m.home) !== JSON.stringify(S.home || null);
    S.trips = m.trips;
    S.watch = m.watch;
    S.home = m.home;
    visited.clear(); m.visited.forEach(cc => visited.add(cc)); S.visited = [...visited];
    if (window.PreTrip && PreTrip.mergeDone) PreTrip.mergeDone(inc.pretrip);
    save();
    modalClose();
    if (typeof refreshStats === 'function') refreshStats();
    if (typeof paintMap === 'function') paintMap();
    if (activeView === 'planner') renderPlanner();
    if (window.Flights) { Flights.renderWatch(); if (homeChanged && activeView === 'dashboard') Flights.renderRadar(); }
    const bits = [df.trips.add ? `+${pl(df.trips.add, 'cesta', 'cesty', 'cest')}` : '', opts.overwrite && df.trips.changed ? `${df.trips.changed} přepsáno` : '', df.watch.add ? `+${pl(df.watch.add, 'hlídaná cena', 'hlídané ceny', 'hlídaných cen')}` : '', df.visited.add ? `+${pl(df.visited.add, 'země', 'země', 'zemí')}` : ''].filter(Boolean);
    toast(bits.length ? 'Sloučeno: ' + bits.join(', ') : 'Sloučeno');
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
    const has = (S.trips || []).length || (S.watch || []).length || (S.visited || []).length;
    modalOpen(`<div class="modal-body bk-modal">
      <h3 style="margin-bottom:8px">💾 Přenos a záloha</h3>
      <p class="muted" style="font-size:14px;margin-bottom:12px">Cesty z plánovače, hlídané ceny, domov radaru, navštívené země a odškrtnuté „Před cestou“ jsou jen v tomhle prohlížeči. Přenes je do telefonu nebo počítače souborem – nic se neukládá na server.</p>
      <div id="bkBody">
        <div class="bk-actions">
          ${canShare ? '<button type="button" class="btn primary" id="bkShare">📲 Poslat do jiného zařízení</button>' : ''}
          <button type="button" class="btn${canShare ? '' : ' primary'}" id="bkDown">⬇️ Stáhnout zálohu</button>
          <button type="button" class="btn ghost" id="bkPick">📂 Obnovit ze zálohy…</button>
          <input type="file" id="bkFile" accept=".json,.txt,application/json,text/plain" hidden>
        </div>
        <div class="faint" style="font-size:12.5px;margin-top:12px">${S.backupAt ? `Poslední záloha: ${dateTxt(S.backupAt)} (${agoTxt(S.backupAt)})` : has ? 'Zatím žádná záloha.' : 'Zatím tu nic uloženého není – obnovou ze zálohy si sem data přeneseš.'}<span id="bkStore"></span></div>
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

  window.Backup = { V, pack, parse, diff, merge, cleanForm, open, plannerTools, WATCH_CAP };
})();
