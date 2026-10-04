/* ATLAS – objevování míst a plánovač programu (Wikidata + Wikipedie, mapa Leaflet). */
(function () {
  const CAT = {
    museum: ['🏛️', 'Muzea', '#5b8cff'], gallery: ['🖼️', 'Galerie', '#7c6cff'], church: ['⛪', 'Kostely', '#a855f7'],
    castle: ['🏰', 'Hrady', '#f59e0b'], palace: ['👑', 'Paláce', '#f59e0b'], monument: ['🗿', 'Památníky', '#94a3b8'],
    square: ['🏙️', 'Náměstí', '#22d3ee'], oldtown: ['🏘️', 'Historická centra', '#fb923c'], viewpoint: ['🌄', 'Vyhlídky', '#34d399'],
    park: ['🌳', 'Parky', '#22c55e'], nature: ['⛰️', 'Příroda', '#16a34a'], beach: ['🏖️', 'Pláže', '#38bdf8'],
    zoo: ['🦁', 'Zoo', '#eab308'], theme: ['🎢', 'Zábava', '#ec4899'], market: ['🧺', 'Trhy', '#f97316'],
    bridge: ['🌉', 'Mosty', '#64748b'], tower: ['🗼', 'Věže', '#0ea5e9'], ruins: ['🏺', 'Archeologie', '#b45309'],
    theatre: ['🎭', 'Divadla', '#d946ef'], sight: ['📍', 'Zajímavosti', '#fb7185'], daytrip: ['🚆', 'Výlety', '#14b8a6'],
  };
  const INTERESTS = [
    ['history', '🏰 Historie a památky', { church: 1.5, castle: 1.6, palace: 1.5, monument: 1.3, oldtown: 1.6, ruins: 1.6, square: 1.3 }],
    ['art', '🖼️ Muzea a umění', { museum: 1.7, gallery: 1.8, theatre: 1.4 }],
    ['nature', '🌳 Příroda a výhledy', { park: 1.6, nature: 1.8, viewpoint: 1.8, beach: 1.6 }],
    ['kids', '🧒 S dětmi', { zoo: 2, theme: 2, park: 1.4, museum: 1.1 }],
    ['trips', '🚆 Výlety mimo město', { daytrip: 1.8 }],
  ];
  const DAY_COLORS = ['#5b8cff', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#a855f7', '#ef4444', '#0ea5e9'];
  const ex = { place: null, items: [], cat: '', radius: 10, plan: null, interests: new Set(), pace: 'normal', days: 3, start: '', map: null, layers: null };

  const icon = c => (CAT[c] || CAT.sight)[0];
  const color = c => (CAT[c] || CAT.sight)[2];
  const plusDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtYMD(d); };
  const dayLbl = ymd => { const d = new Date(ymd + 'T12:00:00'); return `${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`; };
  const minTxt = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;
  const gmapsDay = (start, items) => {
    if (!items.length) return null;
    const pts = items.map(p => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`);
    const dest = pts.pop();
    const qs = new URLSearchParams({ api: '1', origin: `${start.lat.toFixed(5)},${start.lon.toFixed(5)}`, destination: dest, travelmode: 'walking' });
    if (pts.length) qs.set('waypoints', pts.join('|'));
    return `https://www.google.com/maps/dir/?${qs}`;
  };
  const interestWeights = set => {
    const w = {};
    for (const [id, , m] of INTERESTS) if (set.has(id)) for (const [k, v] of Object.entries(m)) w[k] = Math.max(w[k] || 1, v);
    return w;
  };

  async function getJson(url, opts) {
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  /* ---------- mapa (Leaflet) ---------- */
  function makeMap(el, center) {
    if (typeof L === 'undefined') { el.innerHTML = '<div class="faint" style="padding:16px">Mapa není k dispozici.</div>'; return null; }
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lon], 13);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    const dark = document.documentElement.dataset.theme === 'dark';
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    return map;
  }
  function drawOnMap(state, center, items, plan, onClick) {
    if (!state.map) return;
    if (state.layers) state.layers.remove();
    const g = L.layerGroup().addTo(state.map);
    state.layers = g;
    L.circleMarker([center.lat, center.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#a855f7', fillOpacity: 1 }).addTo(g).bindTooltip(esc(center.label || 'Start'));
    const dayOf = new Map();
    (plan?.days || []).forEach((d, i) => d.items.forEach((p, j) => dayOf.set(p.id, { i, j })));
    const bounds = [[center.lat, center.lon]];
    for (const p of items) {
      const d = dayOf.get(p.id);
      const col = d ? DAY_COLORS[d.i % DAY_COLORS.length] : color(p.category);
      const m = L.circleMarker([p.lat, p.lon], { radius: d ? 9 : 6, color: '#0b1226', weight: 1.5, fillColor: col, fillOpacity: .95 }).addTo(g);
      m.bindTooltip(`${icon(p.category)} ${esc(p.name)}${d ? ` · den ${d.i + 1}` : ''}`);
      m.on('click', () => onClick && onClick(p));
      if (p.category !== 'daytrip' || items.length < 5) bounds.push([p.lat, p.lon]);
    }
    (plan?.days || []).forEach((d, i) => {
      if (!d.items.length || d.kind === 'daytrip') return;
      L.polyline([[center.lat, center.lon], ...d.items.map(p => [p.lat, p.lon])], { color: DAY_COLORS[i % DAY_COLORS.length], weight: 3, opacity: .75, dashArray: '6 6' }).addTo(g);
    });
    if (bounds.length > 1) state.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }

  /* ---------- karty ---------- */
  function poiCard(p, opts = {}) {
    return `<div class="poi" data-poi="${esc(p.id)}">
      <div class="poi-img" ${p.image ? `style="background-image:url('${esc(p.image)}')"` : ''}>${p.image ? '' : icon(p.category)}</div>
      <div><div class="poi-name">${icon(p.category)} ${esc(p.name)}</div>
        <div class="poi-meta">${esc(p.categoryLabel || '')}${p.distanceKm != null ? ` · ${p.distanceKm} km` : ''}${p.unesco ? ' · <b style="color:var(--warn)">UNESCO</b>' : p.heritage ? ' · památka' : ''}</div>
        <div class="poi-desc">${esc(p.extract || p.description || '')}</div>
        <div class="poi-acts">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Wikipedie ↗</a>` : ''}
          <a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Mapa ↗</a>
          ${opts.toggle ? `<button type="button" class="linkbtn" data-must="${esc(p.id)}">${opts.must?.has(p.id) ? '★ v plánu' : '+ chci vidět'}</button>` : ''}</div></div>
    </div>`;
  }

  function planHtml(plan, center) {
    if (!plan) return '';
    return plan.days.map((d, i) => {
      const url = d.kind !== 'daytrip' ? gmapsDay(center, d.items) : (d.items[0] ? `https://www.google.com/maps/dir/?api=1&origin=${center.lat},${center.lon}&destination=${d.items[0].lat},${d.items[0].lon}&travelmode=transit` : null);
      return `<div class="day-plan"><h4><span><span style="color:${DAY_COLORS[i % DAY_COLORS.length]}">●</span> Den ${i + 1} · ${dayLbl(d.date)}${d.kind === 'daytrip' ? ' · celodenní výlet' : ''}</span>
        ${url ? `<a class="linkbtn" href="${esc(url)}" target="_blank" rel="noopener">trasa v Google Maps ↗</a>` : ''}</h4>
        ${d.items.length ? d.items.map((p, j) => `<div class="dp-item"><span class="dp-n">${j + 1}</span><div><b>${icon(p.category)} ${esc(p.name)}</b> <span class="faint">· ${minTxt(p.visitMin)}</span>
          <div class="dp-walk">${j === 0 ? 'od ubytování' : 'dál'} ${p.transit ? `${p.fromPrevKm} km – MHD/taxi` : `${p.fromPrevKm} km pěšky (~${minTxt(p.fromPrevMin)})`}</div></div>
          <button type="button" title="Vyřadit z plánu" data-drop="${esc(p.id)}">✕</button></div>`).join('')
          : `<div class="faint" style="font-size:13px;padding:6px 0">${d.cap ? 'Volno – odpočinek, jídlo, procházka.' : 'Den cesty – bez programu.'}</div>`}
        ${d.items.length && d.kind !== 'daytrip' ? `<div class="faint" style="font-size:11.5px;margin-top:4px">celkem ~${minTxt(d.minutes)} prohlídek · ${d.walkKm} km pěšky</div>` : ''}
      </div>`;
    }).join('');
  }

  /* ---------- plánovač (sdílený pro Objevuj i Cestu) ---------- */
  function plannerControls(st) {
    return `<div class="row wrap" style="gap:8px;margin:10px 0">
      ${INTERESTS.map(([id, label]) => `<button type="button" class="fchip ${st.interests.has(id) ? 'on' : ''}" data-int="${id}">${label}</button>`).join('')}
      <select data-pace style="width:auto;padding:7px 30px 7px 10px;font-size:12.5px">${[['relaxed', '🐢 V klidu'], ['normal', '🚶 Normálně'], ['intense', '🏃 Nabitě']].map(o => `<option value="${o[0]}" ${st.pace === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
    </div>`;
  }

  async function makePlan(st, center, dates) {
    const body = {
      lat: center.lat, lon: center.lon, start: dates.start, end: dates.end, arrivalTime: dates.arrivalTime, departureTime: dates.departureTime,
      pace: st.pace, interests: interestWeights(st.interests), exclude: [...st.exclude], include: [...st.must],
    };
    const j = await getJson('api/itinerary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    st.items = j.places;
    st.demo = j.demo;
    return { days: j.days, spare: j.spare, center, created: Date.now() };
  }

  /**
   * Program v rámci cesty: opts { lat, lon, label, cc, start, end, arrivalTime, departureTime, plan, onPlan }
   */
  async function renderPlanner(host, opts) {
    const st = { interests: new Set(opts.interests || []), pace: opts.pace || 'normal', exclude: new Set(), must: new Set(), items: [], map: null, layers: null };
    const center = { lat: opts.lat, lon: opts.lon, label: opts.label };
    host.innerHTML = `${plannerControls(st)}<div class="ex-layout"><div><div id="tpPlan"><div class="loading-row"><span class="spin dark"></span> Hledám, co stojí za vidění, a skládám program…</div></div></div><div class="ex-map" id="tpMap"></div></div>`;
    st.map = makeMap($('#tpMap', host), center);
    const run = async () => {
      try {
        const plan = await makePlan(st, center, opts);
        opts.onPlan && opts.onPlan(plan);
        paint(plan);
      } catch (e) {
        $('#tpPlan', host).innerHTML = `<div class="note warn">⚠️ <div>Program se nepodařilo sestavit: ${esc(e.message)}</div></div>`;
      }
    };
    const paint = plan => {
      $('#tpPlan', host).innerHTML = (st.demo ? '<div class="faint" style="font-size:12px;margin-bottom:8px">⚠️ demo data</div>' : '') + planHtml(plan, center)
        + (plan.spare?.length ? `<details class="more"><summary>Další místa v okolí (${plan.spare.length})</summary><div class="poi-list" style="margin-top:10px">${plan.spare.slice(0, 15).map(p => poiCard(p, { toggle: true, must: st.must })).join('')}</div></details>` : '');
      drawOnMap(st, center, st.items.filter(p => plan.days.some(d => d.items.some(q => q.id === p.id)) || p.category !== 'daytrip'), plan, p => { const el = $(`[data-poi="${CSS.escape(p.id)}"]`, host); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      $$('[data-drop]', host).forEach(b => b.onclick = () => { st.exclude.add(b.dataset.drop); st.must.delete(b.dataset.drop); run(); });
      $$('[data-must]', host).forEach(b => b.onclick = e => { e.stopPropagation(); st.must.add(b.dataset.must); st.exclude.delete(b.dataset.must); run(); });
    };
    $$('[data-int]', host).forEach(b => b.onclick = () => { st.interests.has(b.dataset.int) ? st.interests.delete(b.dataset.int) : st.interests.add(b.dataset.int); b.classList.toggle('on'); run(); });
    $('[data-pace]', host).onchange = e => { st.pace = e.target.value; run(); };
    if (opts.plan && opts.plan.days && opts.plan.center && Math.abs(opts.plan.center.lat - center.lat) < 1e-4) {
      try { const j = await getJson(`api/poi?lat=${center.lat}&lon=${center.lon}`); st.items = j.items; st.demo = j.demo; } catch { st.items = []; }
      paint(opts.plan);
    } else run();
  }

  /* ---------- samostatné objevování ---------- */
  function renderExplore(root) {
    if (!root) return;
    if (!ex.start) ex.start = plusDays(fmtYMD(new Date()), 1);
    root.innerHTML = `<div class="card search-card">
      <div class="ex-search">
        <div class="field" style="margin:0"><label>Kam se chceš podívat? <span class="lab-hint">město, obec, ostrov, místo…</span></label>
          <div style="position:relative"><input class="input" id="exQ" placeholder="Např. Lisabon, Český Krumlov, Kréta…" autocomplete="off" value="${esc(ex.place?.label || '')}"><div class="pi-dd" id="exDd" hidden></div></div></div>
        <button class="btn ghost" id="exGeo" title="Moje poloha" style="align-self:end">📍 Tady</button>
        <div class="field" style="margin:0"><label>Okruh</label><select id="exRad">${[3, 5, 10, 20].map(r => `<option value="${r}" ${ex.radius === r ? 'selected' : ''}>${r} km</option>`).join('')}</select></div>
      </div></div>
      <div id="exBody">${ex.place ? '' : `<div class="empty"><div class="ei">🗺️</div><h2 style="font-size:20px;margin-bottom:6px">Objev, co stojí za vidění</h2><p style="max-width:460px;margin:0 auto">Zadej libovolné místo na světě. Ukážu nejzajímavější památky, muzea, vyhlídky a výlety v okolí – s popisem, fotkou a mapou – a na přání z nich složím program na pár dní.</p></div>`}</div>`;
    wireExploreSearch(root);
    if (ex.place) loadExplore();
  }

  function wireExploreSearch(root) {
    const q = $('#exQ', root), dd = $('#exDd', root);
    let ctl = null, sugs = [], act = 0;
    const show = () => {
      dd.innerHTML = sugs.length ? sugs.map((s, i) => `<div class="pi-opt ${i === act ? 'on' : ''}" data-i="${i}"><span class="pi-flag">${s.flag || '📍'}</span><span class="pi-t"><b>${esc(s.label)}</b><small>${esc(s.sub || '')}</small></span></div>`).join('') : '<div class="pi-empty">Nic nenalezeno</div>';
      dd.hidden = false;
      $$('.pi-opt', dd).forEach(o => o.onmousedown = e => { e.preventDefault(); pick(sugs[+o.dataset.i]); });
    };
    const pick = s => { ex.place = { lat: s.lat, lon: s.lon, label: s.label, cc: s.cc }; ex.plan = null; q.value = s.label; dd.hidden = true; loadExplore(); };
    let t;
    q.oninput = () => {
      clearTimeout(t);
      if (q.value.trim().length < 2) { dd.hidden = true; return; }
      t = setTimeout(async () => {
        if (ctl) ctl.abort(); ctl = new AbortController();
        try { const j = await getJson('api/geocode?q=' + enc(q.value.trim()), { signal: ctl.signal }); sugs = j.items || []; act = 0; show(); } catch (e) { if (e.name !== 'AbortError') { sugs = []; show(); } }
      }, 220);
    };
    q.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!sugs.length) return; e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + sugs.length) % sugs.length; show(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (sugs[act]) pick(sugs[act]); }
      else if (e.key === 'Escape') dd.hidden = true;
    };
    q.onblur = () => setTimeout(() => { dd.hidden = true; }, 150);
    $('#exRad', root).onchange = e => { ex.radius = +e.target.value; if (ex.place) loadExplore(); };
    $('#exGeo', root).onclick = () => {
      if (!navigator.geolocation) return toast('Prohlížeč nepodporuje polohu', 'err');
      navigator.geolocation.getCurrentPosition(p => pick({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'Moje okolí' }), () => toast('Polohu se nepodařilo zjistit', 'err'), { timeout: 10000 });
    };
  }

  async function loadExplore() {
    const body = $('#exBody'); if (!body) return;
    const p = ex.place;
    body.innerHTML = `<div class="loading-row"><span class="spin dark"></span> Hledám zajímavá místa kolem: ${esc(p.label)}…</div>`;
    try {
      const j = await getJson(`api/poi?lat=${p.lat}&lon=${p.lon}&radius=${ex.radius}`);
      ex.items = j.items; ex.demo = j.demo;
    } catch (e) {
      body.innerHTML = `<div class="note warn">⚠️ <div>Místa se nepodařilo načíst: ${esc(e.message)}</div></div>`;
      return;
    }
    paintExplore();
  }

  function paintExplore() {
    const body = $('#exBody'); if (!body) return;
    const p = ex.place;
    const cats = [...new Set(ex.items.map(x => x.category))];
    const list = ex.items.filter(x => !ex.cat || x.category === ex.cat);
    const st = ex.planState || (ex.planState = { interests: ex.interests, pace: ex.pace, exclude: new Set(), must: new Set(), items: [], map: null, layers: null });
    body.innerHTML = `${ex.demo ? '<div class="note warn" style="margin-bottom:12px">⚠️ <div><b>DEMO data</b> – místa jsou vymyšlená.</div></div>' : ''}
      <div class="section-head" style="margin-top:6px"><h2>${flag(p.cc || '')} ${esc(p.label)} · ${ex.items.length} míst</h2></div>
      <div class="ex-cats"><button type="button" data-cat="" class="${!ex.cat ? 'on' : ''}">Vše</button>${cats.map(c => `<button type="button" data-cat="${c}" class="${ex.cat === c ? 'on' : ''}">${icon(c)} ${(CAT[c] || CAT.sight)[1]}</button>`).join('')}</div>
      <div class="card step-card"><h3>🗓️ Naplánovat program</h3>
        <div class="row wrap" style="gap:10px;align-items:end">
          <div class="field" style="margin:0"><label>Od</label><input class="input" type="date" id="exStart" value="${ex.start}"></div>
          <div class="field" style="margin:0"><label>Počet dní</label><select id="exDays">${[1, 2, 3, 4, 5, 6, 7, 10].map(n => `<option ${ex.days === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <button class="btn primary" id="exPlan">Sestavit program</button>
          ${ex.plan ? '<button class="btn" id="exSave">💾 Uložit do plánovače</button>' : ''}
        </div>${plannerControls(st)}
        <div id="exPlanOut">${ex.plan ? planHtml(ex.plan, p) : ''}</div></div>
      <div class="ex-layout"><div class="poi-list" id="exList">${list.map(x => poiCard(x, { toggle: true, must: st.must })).join('') || '<div class="empty">Nic v této kategorii.</div>'}</div><div class="ex-map" id="exMap"></div></div>
      <div class="faint" style="font-size:11.5px;margin-top:10px">Zdroj: Wikidata a Wikipedie (CC BY-SA), mapa © OpenStreetMap, CARTO. Otevírací doby ověř na webu místa.</div>`;
    st.map = makeMap($('#exMap', body), p);
    drawOnMap(st, p, ex.plan ? ex.items : list, ex.plan, x => { const el = $(`#exList [data-poi="${CSS.escape(x.id)}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 1500); } });
    $$('[data-cat]', body).forEach(b => b.onclick = () => { ex.cat = b.dataset.cat; paintExplore(); });
    $$('#exList [data-poi]', body).forEach(c => c.onclick = () => { const x = ex.items.find(i => i.id === c.dataset.poi); if (x && st.map) st.map.setView([x.lat, x.lon], 16); });
    $$('[data-must]', body).forEach(b => b.onclick = e => { e.stopPropagation(); st.must.has(b.dataset.must) ? st.must.delete(b.dataset.must) : st.must.add(b.dataset.must); b.textContent = st.must.has(b.dataset.must) ? '★ v plánu' : '+ chci vidět'; });
    $$('[data-int]', body).forEach(b => b.onclick = () => { st.interests.has(b.dataset.int) ? st.interests.delete(b.dataset.int) : st.interests.add(b.dataset.int); b.classList.toggle('on'); });
    $('[data-pace]', body).onchange = e => { st.pace = e.target.value; };
    $('#exStart', body).onchange = e => { ex.start = e.target.value; };
    $('#exDays', body).onchange = e => { ex.days = +e.target.value; };
    $('#exPlan', body).onclick = async () => {
      const btn = $('#exPlan'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Skládám…';
      try {
        ex.plan = await makePlan(st, p, { start: ex.start, end: plusDays(ex.start, ex.days - 1), arrivalTime: '09:00', departureTime: null });
        paintExplore();
        $('#exPlanOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Sestavit program'; }
    };
    $$('[data-drop]', body).forEach(b => b.onclick = async () => { st.exclude.add(b.dataset.drop); ex.plan = await makePlan(st, p, { start: ex.start, end: plusDays(ex.start, ex.days - 1), arrivalTime: '09:00' }); paintExplore(); });
    const sv = $('#exSave', body);
    if (sv) sv.onclick = () => {
      const days = {};
      ex.plan.days.forEach(d => { days[d.date] = d.items.map(x => x.name); });
      S.trips.push({ name: `Výlet: ${p.label}`, dest: p.label, iso: byIso[p.cc] ? p.cc : null, start: ex.plan.days[0].date, end: ex.plan.days.at(-1).date, pax: '2', budget: '', days, checklist: PACK.map(t => ({ t, done: false })), notes: '' });
      save(); toast('Program uložen do plánovače'); go('planner');
    };
  }

  window.Places = { renderExplore, renderPlanner };
})();
