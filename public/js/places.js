/* ATLAS – objevování míst, plánovač programu a výletů (Wikidata + Wikipedie, mapa MapLibre + OpenFreeMap). */
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
  const ex = { place: null, items: [], cat: '', radius: 10, plan: null, interests: new Set(), pace: 'normal', days: 3, start: '', mode: 'city', trips: { day: null, loop: null }, tripDays: { day: 2, loop: 4 }, tripEx: new Set(), tripMust: new Set(), ms: null };
  const MODES = [['city', '🏙️ Program ve městě'], ['day', '🚗 Jednodenní výlety'], ['loop', '🧭 Vícedenní okruh']];

  const icon = c => (CAT[c] || CAT.sight)[0];
  const color = c => (CAT[c] || CAT.sight)[2];
  const plusDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtYMD(d); };
  const dayLbl = ymd => { const d = new Date(ymd + 'T12:00:00'); return `${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`; };
  const minTxt = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;
  const TRIP_ICON = { town: '🏘️', castle: '🏰', nature: '⛰️' };
  const tripIcon = p => TRIP_ICON[p.tripKind] || icon(p.tripKind || p.category);
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

  /* ---------- mapa (MapLibre + OpenFreeMap: zdarma, bez klíče; záloha rastr OpenStreetMap) ---------- */
  const OFM = 'https://tiles.openfreemap.org/styles/';
  const OSM_STYLE = {
    version: 8,
    sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' } },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
  const liveMaps = new Set();
  // Odkazy do Google Map podle názvu místa (ne souřadnic) – Google pak ukáže přímo to místo.
  const gq = (name, ctx) => (ctx && !String(name).includes(ctx) ? (name ? `${name}, ${ctx}` : ctx) : String(name || ''));
  const gmSearch = q => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
  const gmDir = (origin, stops, mode) => {
    if (!stops.length) return null;
    const qs = new URLSearchParams({ api: '1' });
    if (origin) qs.set('origin', origin); // bez výchozího bodu vezme Google polohu uživatele
    qs.set('destination', stops.at(-1));
    if (stops.length > 1) qs.set('waypoints', stops.slice(0, -1).join('|'));
    qs.set('travelmode', mode);
    return `https://www.google.com/maps/dir/?${qs}`;
  };
  // Kontext pro hledání: město a země („Córdoba, Argentina“), aby Google nevybral stejnojmenné místo jinde.
  const cityOf = center => (center.geo ? '' : gq(center.city || center.label || '', center.country || ''));
  // Výchozí bod: ubytování („Hotel X, Milán“), střed města („Milán, Itálie“); „Moje okolí“ nemá
  // název, tam zůstanou souřadnice.
  const centerQ = center => (center.geo ? `${(+center.lat).toFixed(5)},${(+center.lon).toFixed(5)}`
    : center.city && center.label && center.label !== center.city ? gq(center.label, cityOf(center)) : cityOf(center));
  const poiQ = (p, center) => (p.category === 'daytrip' || p.tripKind ? p.name : gq(p.name, cityOf(center)));

  function mapFallback(el, center, msg) {
    el.innerHTML = `<div class="map-fallback"><div>🗺️ ${esc(msg)}</div>${center?.label ? `<a class="btn" href="${esc(gmSearch(centerQ(center) || `${center.lat},${center.lon}`))}" target="_blank" rel="noopener">Otevřít v Google Maps ↗</a>` : ''}</div>`;
  }

  // Knihovna mapy (~1 MB) se načte až při prvním zobrazení mapy, ne s celou aplikací.
  let mapLibP = null;
  const loadMapLib = () => mapLibP || (mapLibP = new Promise((res, rej) => {
    if (typeof maplibregl !== 'undefined') return res();
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/maplibre/maplibre-gl.css';
    // před styly aplikace, aby jejich úpravy (vyskakovací okna, sticky mapa) měly přednost
    document.head.insertBefore(css, document.head.querySelector('link[rel="stylesheet"]'));
    const sc = document.createElement('script');
    sc.src = 'vendor/maplibre/maplibre-gl.js';
    sc.onload = () => res();
    sc.onerror = () => { mapLibP = null; sc.remove(); rej(new Error('Mapu se nepodařilo načíst.')); };
    document.head.appendChild(sc);
  }));

  /** Vrátí stav mapy hned; samotná mapa vznikne po načtení knihovny (ms.ready). */
  function makeMap(el, center) {
    const ms = { map: null, markers: [], lines: null, raster: false, errors: 0 };
    el.innerHTML = '<div class="map-fallback"><span class="spin dark"></span></div>';
    ms.ready = loadMapLib().then(() => initMap(ms, el, center), e => { ms.dead = true; mapFallback(el, center, e.message); });
    return ms;
  }

  function initMap(ms, el, center) {
    // Mapy z předchozích vykreslení uvolni (prohlížeč dovolí jen pár WebGL kontextů naráz).
    for (const m of liveMaps) if (!document.body.contains(m.getContainer())) { m.remove(); liveMaps.delete(m); }
    if (!document.body.contains(el)) { ms.dead = true; return; } // mezitím překresleno
    el.innerHTML = '';
    const dark = document.documentElement.dataset.theme === 'dark';
    let map;
    try {
      map = new maplibregl.Map({
        container: el, style: OFM + (dark ? 'dark' : 'liberty'), center: [center.lon, center.lat], zoom: 12,
        attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
      });
    } catch {
      mapFallback(el, center, 'Prohlížeč neumí zobrazit mapu (WebGL je vypnuté).');
      return;
    }
    ms.map = map;
    map.atlasState = ms;
    liveMaps.add(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.touchZoomRotate.disableRotation();
    // Když vektorová mapa nenaběhne (výpadek OpenFreeMap), přepni na rastrové dlaždice OpenStreetMap.
    const toRaster = () => { if (ms.raster || !liveMaps.has(map)) return; ms.raster = true; ms.styleReady = false; map.setStyle(OSM_STYLE, { diff: false }); };
    const timer = setTimeout(() => { if (!ms.styleReady) toRaster(); }, 8000);
    map.once('remove', () => clearTimeout(timer));
    // Nenačtený styl nebo popis zdroje dlaždic (TileJSON) = mapa by zůstala prázdná → hned záloha;
    // jednotlivé dlaždice až po několika chybách (chybějící ikonky/písma nevadí).
    map.on('error', e => {
      if (!ms.styleReady || (e.sourceId && !e.tile) || (e.tile && ++ms.errors >= 3)) toRaster();
    });
    map.on('style.load', () => { ms.styleReady = true; clearTimeout(timer); addLines(ms); });
  }

  function addLines(ms) {
    const map = ms.map;
    if (!ms.lines || !ms.styleReady) return;
    const src = map.getSource('atlas-lines');
    if (src) { src.setData(ms.lines); return; }
    map.addSource('atlas-lines', { type: 'geojson', data: ms.lines });
    map.addLayer({ id: 'atlas-lines', type: 'line', source: 'atlas-lines', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.8, 'line-dasharray': [2, 2] } });
  }

  /**
   * pts: [{ id, lat, lon, color, num?, big?, label, place }], lines: [{ color, coords:[[lon,lat],…] }]
   */
  function paintMap(ms, center, pts, lines, onClick, fitIds) {
    if (!ms) return;
    if (!ms.map) { ms.ready.then(() => ms.map && paintMap(ms, center, pts, lines, onClick, fitIds)); return; }
    const map = ms.map;
    ms.markers.forEach(m => m.remove());
    ms.markers = [];
    ms.byId = new Map();
    const add = (pt, cls) => {
      const el = document.createElement('div');
      el.className = `mk ${cls}${pt.num ? ' num' : ''}`;
      el.style.background = pt.color;
      if (pt.num) el.textContent = pt.num;
      el.title = pt.label;
      const pop = new maplibregl.Popup({ offset: 12, closeButton: false, maxWidth: '240px' })
        .setHTML(`<b>${esc(pt.label)}</b>${pt.q ? `<br><a href="${esc(gmSearch(pt.q))}" target="_blank" rel="noopener">Google Maps ↗</a>` : ''}`);
      const mk = new maplibregl.Marker({ element: el }).setLngLat([pt.lon, pt.lat]).setPopup(pop).addTo(map);
      el.addEventListener('click', () => onClick && pt.place && onClick(pt.place));
      ms.markers.push(mk);
      ms.byId.set(pt.id, mk);
    };
    add({ id: '__center', lat: center.lat, lon: center.lon, color: '#a855f7', label: center.label || 'Start', q: centerQ(center) }, 'ctr');
    // body s číslem (v plánu) navrch
    [...pts].sort((a, b) => (a.num ? 1 : 0) - (b.num ? 1 : 0)).forEach(pt => add(pt, pt.big ? 'big' : ''));
    ms.lines = { type: 'FeatureCollection', features: lines.filter(l => l.coords.length > 1).map(l => ({ type: 'Feature', properties: { color: l.color }, geometry: { type: 'LineString', coordinates: l.coords } })) };
    addLines(ms);
    const fit = pts.filter(pt => !fitIds || fitIds.has(pt.id));
    if (fit.length) {
      const b = new maplibregl.LngLatBounds([center.lon, center.lat], [center.lon, center.lat]);
      fit.forEach(pt => b.extend([pt.lon, pt.lat]));
      map.fitBounds(b, { padding: 40, maxZoom: 15, duration: 0 });
    }
  }

  function focusOnMap(ms, p) {
    if (!ms?.map) return;
    ms.map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(ms.map.getZoom(), 15) });
    const mk = ms.byId?.get(p.id);
    if (mk && !mk.getPopup().isOpen()) mk.togglePopup();
  }

  // Program ve městě: body podle dne (barva + pořadí) nebo kategorie, pěší trasy dnů čárkovaně.
  function drawOnMap(state, center, items, plan, onClick) {
    if (!state.map) return;
    const dayOf = new Map();
    (plan?.days || []).forEach((d, i) => d.items.forEach((p, j) => dayOf.set(p.id, { i, j })));
    const pts = items.map(p => {
      const d = dayOf.get(p.id);
      return { id: p.id, lat: p.lat, lon: p.lon, color: d ? DAY_COLORS[d.i % DAY_COLORS.length] : color(p.category), num: d ? d.j + 1 : null,
        label: `${icon(p.category)} ${p.name}${d ? ` · den ${d.i + 1}` : ''}`, q: poiQ(p, center), place: p };
    });
    const lines = (plan?.days || []).filter(d => d.items.length && d.kind !== 'daytrip')
      .map(d => ({ color: DAY_COLORS[plan.days.indexOf(d) % DAY_COLORS.length], coords: [[center.lon, center.lat], ...d.items.map(p => [p.lon, p.lat])] }));
    // výlety mimo město nepřibližují mapu, pokud jich je víc (jinak by město bylo malinké)
    const fitIds = new Set(items.filter(p => p.category !== 'daytrip' || items.length < 5 || dayOf.has(p.id)).map(p => p.id));
    paintMap(state.map, center, pts, lines, onClick, fitIds);
  }

  // Výlety autem: cíle očíslované po dnech, trasa dne (start → cíle → přespání / návrat).
  function drawTrips(state, center, trip, onClick) {
    if (!state.map || !trip) return;
    const pts = [];
    const lines = [];
    trip.days.forEach((d, i) => {
      const col = DAY_COLORS[i % DAY_COLORS.length];
      d.stops.forEach((s, j) => pts.push({ id: s.id, lat: s.lat, lon: s.lon, color: col, num: j + 1, big: true,
        label: `${tripIcon(s)} ${s.name} · den ${i + 1}${d.overnight && j === d.stops.length - 1 ? ' · přespání' : ''}`, q: s.name, place: s }));
      const coords = [[d.from.lon, d.from.lat], ...d.stops.map(s => [s.lon, s.lat])];
      if (d.back) coords.push([center.lon, center.lat]);
      lines.push({ color: col, coords });
    });
    paintMap(state.map, center, pts, lines, onClick);
  }

  /* ---------- karty ---------- */
  function poiCard(p, opts = {}) {
    return `<div class="poi" data-poi="${esc(p.id)}">
      <div class="poi-img" ${p.image ? `style="background-image:url('${esc(cssUrl(p.image))}')"` : ''}>${p.image ? '' : icon(p.category)}</div>
      <div><div class="poi-name">${icon(p.category)} ${esc(p.name)}</div>
        <div class="poi-meta">${esc(p.categoryLabel || '')}${p.distanceKm != null ? ` · ${p.distanceKm} km` : ''}${p.unesco ? ' · <b style="color:var(--warn)">UNESCO</b>' : p.heritage ? ' · památka' : ''}${p.wikivoyage ? ' · <b style="color:var(--good)" title="Místo doporučuje cestovní průvodce Wikivoyage">👍 doporučuje Wikivoyage</b>' : ''}</div>
        <div class="poi-desc">${esc(p.extract || p.description || '')}</div>
        <div class="poi-acts">${p.url ? `<a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Wikipedie ↗</a>` : ''}
          <a href="${esc(gmSearch(opts.center ? poiQ(p, opts.center) : p.name))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps ↗</a>
          ${opts.toggle ? `<button type="button" class="linkbtn" data-must="${esc(p.id)}">${opts.must?.has(p.id) ? '★ v plánu' : '+ chci vidět'}</button>` : ''}
          ${opts.tripToggle ? `<button type="button" class="linkbtn" data-tmust="${esc(p.id)}">+ přidat do výletu</button>` : ''}</div></div>
    </div>`;
  }

  function planHtml(plan, center) {
    if (!plan) return '';
    const warn = (plan.warnings || []).map(w => `<div class="note warn" style="margin-bottom:10px">⚠️ <div>${esc(w)}</div></div>`).join('');
    return warn + plan.days.map((d, i) => {
      const url = d.kind !== 'daytrip' ? gmDir(centerQ(center), d.items.map(p => poiQ(p, center)), 'walking') : gmDir(centerQ(center), d.items.slice(0, 1).map(p => p.name), 'transit');
      return `<div class="day-plan"><h4><span><span style="color:${DAY_COLORS[i % DAY_COLORS.length]}">●</span> Den ${i + 1} · ${dayLbl(d.date)}${d.kind === 'daytrip' ? ' · celodenní výlet' : ''}</span>
        ${url ? `<a class="linkbtn" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">trasa v Google Maps ↗</a>` : ''}</h4>
        ${d.items.length ? d.items.map((p, j) => `<div class="dp-item" data-poi="${esc(p.id)}"><span class="dp-n">${j + 1}</span><div><b>${icon(p.category)} ${esc(p.name)}</b> <span class="faint">· ${minTxt(p.visitMin)}</span>
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
    // Termín, pro který program platí – při změně dat se uložený program znovu nepoužije.
    const span = { start: dates.start, end: dates.end, arrivalTime: dates.arrivalTime || null, departureTime: dates.departureTime || null };
    return { days: j.days, spare: j.spare, warnings: j.warnings || [], center, span, created: Date.now() };
  }
  const sameSpan = (plan, o) => plan.span && plan.span.start === o.start && plan.span.end === o.end
    && plan.span.arrivalTime === (o.arrivalTime || null) && plan.span.departureTime === (o.departureTime || null);

  /**
   * Program v rámci cesty: opts { lat, lon, label, cc, start, end, arrivalTime, departureTime, plan, onPlan }
   */
  async function renderPlanner(host, opts) {
    const st = { interests: new Set(opts.interests || []), pace: opts.pace || 'normal', exclude: new Set(), must: new Set(), items: [], map: null, layers: null };
    const center = { lat: opts.lat, lon: opts.lon, label: opts.label, city: opts.city, country: opts.country };
    host.innerHTML = `${plannerControls(st)}<div class="ex-layout"><div><div id="tpPlan"><div class="loading-row"><span class="spin dark"></span> Hledám, co stojí za vidění, a skládám program…</div></div></div><div class="ex-map" id="tpMap"></div></div>`;
    st.map = makeMap($('#tpMap', host), center);
    let seq = 0;
    const run = async () => {
      const my = ++seq; // jen poslední dotaz smí vykreslit (rychlé klikání na zájmy)
      try {
        const plan = await makePlan(st, center, opts);
        if (my !== seq) return;
        opts.onPlan && opts.onPlan(plan);
        paint(plan);
      } catch (e) {
        if (my !== seq) return;
        $('#tpPlan', host).innerHTML = `<div class="note warn">⚠️ <div>Program se nepodařilo sestavit: ${esc(e.message)}</div></div>`;
      }
    };
    const paint = plan => {
      $('#tpPlan', host).innerHTML = (st.demo ? '<div class="faint" style="font-size:12px;margin-bottom:8px">⚠️ demo data</div>' : '') + planHtml(plan, center)
        + (plan.spare?.length ? `<details class="more"><summary>Další místa v okolí (${plan.spare.length})</summary><div class="poi-list" style="margin-top:10px">${plan.spare.slice(0, 15).map(p => poiCard(p, { toggle: true, must: st.must, center })).join('')}</div></details>` : '');
      drawOnMap(st, center, st.items.filter(p => plan.days.some(d => d.items.some(q => q.id === p.id)) || p.category !== 'daytrip'), plan, p => { const el = $(`[data-poi="${CSS.escape(p.id)}"]`, host); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      $$('[data-drop]', host).forEach(b => b.onclick = () => { st.exclude.add(b.dataset.drop); st.must.delete(b.dataset.drop); run(); });
      $$('[data-must]', host).forEach(b => b.onclick = e => { e.stopPropagation(); st.must.add(b.dataset.must); st.exclude.delete(b.dataset.must); run(); });
    };
    $$('[data-int]', host).forEach(b => b.onclick = () => { st.interests.has(b.dataset.int) ? st.interests.delete(b.dataset.int) : st.interests.add(b.dataset.int); b.classList.toggle('on'); run(); });
    $('[data-pace]', host).onchange = e => { st.pace = e.target.value; run(); };
    if (opts.plan && opts.plan.days && opts.plan.center && Math.abs(opts.plan.center.lat - center.lat) < 1e-4 && Math.abs(opts.plan.center.lon - center.lon) < 1e-4 && sameSpan(opts.plan, opts)) {
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
    const pick = s => {
      // země podle kódu (česky, „Španělsko“) – kontext pro odkazy do Google Map
      const country = s.geo ? '' : (typeof byIso !== 'undefined' && byIso[s.cc]?.cs) || '';
      ex.place = { lat: s.lat, lon: s.lon, label: s.label, cc: s.cc, geo: Boolean(s.geo), country };
      ex.plan = null; ex.trips = { day: null, loop: null }; ex.tripEx.clear(); ex.tripMust.clear(); q.value = s.label; dd.hidden = true; loadExplore();
    };
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
      navigator.geolocation.getCurrentPosition(p => pick({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'Moje okolí', geo: true }), () => toast('Polohu se nepodařilo zjistit', 'err'), { timeout: 10000 });
    };
  }

  let exSeq = 0;
  async function loadExplore() {
    const body = $('#exBody'); if (!body) return;
    const p = ex.place;
    const my = ++exSeq; // pomalá starší odpověď nesmí přepsat novější místo/okruh
    body.innerHTML = `<div class="loading-row"><span class="spin dark"></span> Hledám zajímavá místa kolem: ${esc(p.label)}…</div>`;
    try {
      const j = await getJson(`api/poi?lat=${p.lat}&lon=${p.lon}&radius=${ex.radius}`);
      if (my !== exSeq) return;
      ex.items = j.items; ex.demo = j.demo;
    } catch (e) {
      if (my !== exSeq) return;
      body.innerHTML = `<div class="note warn">⚠️ <div>Místa se nepodařilo načíst: ${esc(e.message)}</div></div>`;
      return;
    }
    paintExplore();
  }

  /* ---------- výlety autem (jednodenní / vícedenní okruh) ---------- */
  async function makeTrip(p, mode) {
    const body = { lat: p.lat, lon: p.lon, label: p.geo ? 'Start' : p.label, start: ex.start, days: ex.tripDays[mode], mode, pace: ex.pace,
      exclude: [...ex.tripEx], include: [...ex.tripMust] };
    return getJson('api/roadtrip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  function tripStopHtml(s, j) {
    return `<div class="dp-item" data-poi="${esc(s.id)}"><span class="dp-n">${j + 1}</span><div>
      <b>${tripIcon(s)} ${esc(s.name)}</b> <span class="faint">· ${esc(s.categoryLabel || '')}${s.unesco ? ' · <b style="color:var(--warn)">UNESCO</b>' : s.unescoPart ? ' · <span style="color:var(--warn)">část památky UNESCO</span>' : ''}</span>
      <div class="dp-walk">🚗 ${s.driveKm} km (~${minTxt(s.driveMin)}) · příjezd ~${esc(s.arrive)} · na místě ~${minTxt(s.visitMin)}</div>
      ${s.highlights?.length ? `<div class="dp-walk">👀 Uvidíš: ${esc(s.highlights.join(', '))}</div>` : ''}
      ${s.extract ? `<div class="poi-desc" style="-webkit-line-clamp:2">${esc(s.extract)}</div>` : ''}
      <div class="poi-acts">${s.url ? `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Wikipedie ↗</a>` : ''}<a href="${esc(gmSearch(s.name))}" target="_blank" rel="noopener">Google Maps ↗</a></div></div>
      <button type="button" title="Vyřadit z výletu" data-tdrop="${esc(s.id)}">✕</button></div>`;
  }

  function tripHtml(trip, center) {
    if (!trip) return '';
    const head = [
      trip.demo ? '<div class="note warn" style="margin-bottom:10px">⚠️ <div><b>DEMO data</b> – cíle jsou vymyšlené.</div></div>' : '',
      trip.note ? `<div class="note info" style="margin-bottom:10px">ℹ️ <div>${esc(trip.note)}</div></div>` : '',
      trip.degraded ? '<div class="faint" style="font-size:12px;margin-bottom:8px">Část popisů se nenačetla – zkus to za chvíli znovu.</div>' : '',
    ].join('');
    if (!trip.days.length) return head + '<div class="empty" style="padding:18px">V okolí jsem nenašel vhodné cíle výletů.</div>';
    const origin = centerQ(center);
    const days = trip.days.map((d, i) => {
      const from = i === 0 || trip.mode === 'day' ? origin : d.from.name;
      const route = [...d.stops.map(s => s.name), ...(d.back ? [origin || center.label] : [])].filter(Boolean);
      const url = gmDir(from, route, 'driving');
      const title = trip.mode === 'day' ? `Výlet ${i + 1}` : `Den ${i + 1}`;
      const way = trip.mode === 'loop' ? ` · ${esc(d.from.name)} → ${esc(d.overnight ? d.overnight.name : center.label)}` : '';
      return `<div class="day-plan"><h4><span><span style="color:${DAY_COLORS[i % DAY_COLORS.length]}">●</span> ${title} · ${dayLbl(d.date)}${way}</span>
        ${url ? `<a class="linkbtn" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">trasa autem v Google Maps ↗</a>` : ''}</h4>
        <div class="dp-walk" style="margin:2px 0 4px">odjezd ~09:00 z: ${esc(d.from.name)}</div>
        ${d.stops.map(tripStopHtml).join('')}
        ${d.back ? `<div class="dp-end">🏁 zpět na start (${esc(center.label)}) ~${esc(d.back.arrive)} · ${d.back.km} km (~${minTxt(d.back.min)})</div>`
          : `<div class="dp-end">🛏️ přespání: <b>${esc(d.overnight.name)}</b> · <a href="${esc(safeUrl(d.overnight.bookUrl))}" target="_blank" rel="noopener">najít ubytování ↗</a></div>`}
        <div class="faint" style="font-size:11.5px;margin-top:4px">za volantem ~${minTxt(d.driveMin)} (${d.driveKm} km) · celkem ~${minTxt(d.minutes)}</div>
      </div>`;
    }).join('');
    const spare = trip.spare?.length ? `<details class="more"><summary>Další tipy na výlet (${trip.spare.length})</summary><div class="poi-list" style="margin-top:10px">${trip.spare.map(x => poiCard({ ...x, category: 'daytrip' }, { tripToggle: true })).join('')}</div></details>` : '';
    return head + days + spare
      + '<div class="faint" style="font-size:11.5px;margin-top:6px">Časy jízdy jsou orientační odhad autem; přesnou trasu ukáže Google Maps. Vzdálenost ~120 km od místa.</div>';
  }

  // Mapa Objevuj přežije překreslení stránky (kategorie, režim, úpravy plánu) – nová jen pro nové místo.
  function exploreMap(p) {
    const ms = ex.ms;
    if (ms && ms.place === p && !ms.dead && (!ms.map || liveMaps.has(ms.map))) return ms;
    if (ms?.map) { ms.map.remove(); liveMaps.delete(ms.map); }
    const el = document.createElement('div');
    el.className = 'ex-map';
    el.id = 'exMap';
    ex.ms = makeMap(el, p);
    ex.ms.place = p;
    ex.ms.el = el;
    return ex.ms;
  }

  let replanSeq = 0;
  function paintExplore() {
    const body = $('#exBody'); if (!body) return;
    const p = ex.place;
    const cats = [...new Set(ex.items.map(x => x.category))];
    const list = ex.items.filter(x => !ex.cat || x.category === ex.cat);
    const st = ex.planState || (ex.planState = { interests: ex.interests, pace: ex.pace, exclude: new Set(), must: new Set(), items: [], map: null });
    const road = ex.mode !== 'city';
    const trip = road ? ex.trips[ex.mode] : null;
    const dayOpts = ex.mode === 'loop' ? [2, 3, 4, 5, 6, 7, 10] : ex.mode === 'day' ? [1, 2, 3, 4, 5, 7] : [1, 2, 3, 4, 5, 6, 7, 10];
    const curDays = road ? ex.tripDays[ex.mode] : ex.days;
    const hasPlan = road ? trip && trip.days.length : ex.plan;
    const out = road ? tripHtml(trip, p) : ex.plan ? planHtml(ex.plan, p) : '';
    // V režimu výletů jde z výpisu přidat jen výlet mimo město (do programu ve městě patří ostatní).
    const card = x => (road
      ? poiCard(x, x.category === 'daytrip' ? { tripToggle: true, center: p } : { center: p })
      : poiCard(x, { toggle: true, must: st.must, center: p }));
    body.innerHTML = `${ex.demo ? '<div class="note warn" style="margin-bottom:12px">⚠️ <div><b>DEMO data</b> – místa jsou vymyšlená.</div></div>' : ''}
      <div class="section-head" style="margin-top:6px"><h2>${flag(p.cc || '')} ${esc(p.label)} · ${ex.items.length} míst</h2></div>
      <div class="ex-cats"><button type="button" data-cat="" class="${!ex.cat ? 'on' : ''}">Vše</button>${cats.map(c => `<button type="button" data-cat="${c}" class="${ex.cat === c ? 'on' : ''}">${icon(c)} ${(CAT[c] || CAT.sight)[1]}</button>`).join('')}</div>
      <div class="card step-card"><h3>🗓️ Naplánovat</h3>
        <div class="seg wrap" id="exMode" style="margin:4px 0 12px">${MODES.map(([id, l]) => `<button type="button" data-mode="${id}" class="${ex.mode === id ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="muted" style="font-size:13px;margin:-4px 0 10px">${ex.mode === 'city' ? 'Pěší program po památkách – každý den jiná část města.'
          : ex.mode === 'day' ? 'Ráno autem ven, večer zpátky: města, hrady a příroda do ~2 h jízdy. Každý výlet jiný.'
          : 'Okruh autem s přespáním po cestě – každý den pár zastávek, poslední den zpět na start.'}</div>
        <div class="row wrap" style="gap:10px;align-items:end">
          <div class="field" style="margin:0"><label>Od</label><input class="input" type="date" id="exStart" value="${ex.start}"></div>
          <div class="field" style="margin:0"><label>${ex.mode === 'day' ? 'Počet výletů' : 'Počet dní'}</label><select id="exDays">${dayOpts.map(n => `<option ${curDays === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <button class="btn primary" id="exPlan">${road ? 'Naplánovat výlet' : 'Sestavit program'}</button>
          ${hasPlan ? '<button class="btn" id="exSave">💾 Uložit do plánovače</button>' : ''}
        </div>${road ? `<div class="row wrap" style="gap:8px;margin:10px 0"><select data-pace style="width:auto;padding:7px 30px 7px 10px;font-size:12.5px">${[['relaxed', '🐢 V klidu'], ['normal', '🚶 Normálně'], ['intense', '🏃 Nabitě']].map(o => `<option value="${o[0]}" ${ex.pace === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>` : plannerControls(st)}
        <div id="exPlanOut">${out}</div></div>
      <div class="ex-layout"><div class="poi-list" id="exList">${list.map(card).join('') || '<div class="empty">Nic v této kategorii.</div>'}</div><div id="exMapSlot"></div></div>
      <div class="faint" style="font-size:11.5px;margin-top:10px">Zdroj: Wikidata a Wikipedie (CC BY-SA), mapa © OpenFreeMap, OpenMapTiles, OpenStreetMap. Otevírací doby ověř na webu místa.</div>`;
    const ms = exploreMap(p);
    $('#exMapSlot', body).replaceWith(ms.el);
    if (ms.map) ms.map.resize();
    st.map = ms;
    const hl = x => {
      const el = $(`#exPlanOut [data-poi="${CSS.escape(x.id)}"]`) || $(`#exList [data-poi="${CSS.escape(x.id)}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 1500); }
    };
    if (trip) drawTrips(st, p, trip, hl);
    else drawOnMap(st, p, ex.plan ? ex.items : list, ex.plan, hl);
    // Na mapě je jen to, co je na ní nakreslené – bez značky se nikam neletí.
    const focus = x => { if (x && ms.byId?.has(x.id)) focusOnMap(ms, x); };
    $$('[data-cat]', body).forEach(b => b.onclick = () => { ex.cat = b.dataset.cat; paintExplore(); });
    $$('[data-mode]', body).forEach(b => b.onclick = () => { if (ex.mode !== b.dataset.mode) { ex.mode = b.dataset.mode; paintExplore(); } });
    $$('#exList [data-poi]', body).forEach(c => c.onclick = () => focus(ex.items.find(i => i.id === c.dataset.poi)));
    $$('#exPlanOut [data-poi]', body).forEach(c => c.onclick = e => {
      if (e.target.closest('a,button')) return;
      const pool = trip ? [...trip.days.flatMap(d => d.stops), ...trip.spare] : [...(ex.plan?.days || []).flatMap(d => d.items), ...st.items, ...ex.items];
      focus(pool.find(i => i.id === c.dataset.poi));
    });
    $$('[data-must]', body).forEach(b => b.onclick = e => { e.stopPropagation(); st.must.has(b.dataset.must) ? st.must.delete(b.dataset.must) : st.must.add(b.dataset.must); b.textContent = st.must.has(b.dataset.must) ? '★ v plánu' : '+ chci vidět'; });
    $$('[data-int]', body).forEach(b => b.onclick = () => { st.interests.has(b.dataset.int) ? st.interests.delete(b.dataset.int) : st.interests.add(b.dataset.int); b.classList.toggle('on'); });
    $('[data-pace]', body).onchange = e => { st.pace = e.target.value; ex.pace = e.target.value; };
    $('#exStart', body).onchange = e => { ex.start = e.target.value; };
    $('#exDays', body).onchange = e => { if (road) ex.tripDays[ex.mode] = +e.target.value; else ex.days = +e.target.value; };
    const mode = ex.mode;
    const replan = async btn => {
      const my = ++replanSeq; // jen poslední dotaz smí vykreslit (rychlé klikání na ✕ / +)
      if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${road ? 'Hledám cíle výletů…' : 'Skládám…'}`; }
      try {
        if (road) {
          const t = await makeTrip(p, mode);
          if (my !== replanSeq || ex.place !== p) return; // mezitím jiné místo nebo novější dotaz
          ex.trips[mode] = t;
        } else {
          const plan = await makePlan(st, p, { start: ex.start, end: plusDays(ex.start, ex.days - 1), arrivalTime: '09:00', departureTime: null });
          if (my !== replanSeq || ex.place !== p) return;
          ex.plan = plan;
        }
        if (ex.mode !== mode) return; // výsledek je uložený, ale uživatel už je v jiném režimu
        paintExplore();
        if (btn) $('#exPlanOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        if (my !== replanSeq) return;
        toast(e.message, 'err');
        if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = road ? 'Naplánovat výlet' : 'Sestavit program'; }
      }
    };
    $('#exPlan', body).onclick = () => replan($('#exPlan'));
    $$('[data-drop]', body).forEach(b => b.onclick = () => { st.exclude.add(b.dataset.drop); replan(); });
    $$('[data-tdrop]', body).forEach(b => b.onclick = () => { ex.tripEx.add(b.dataset.tdrop); ex.tripMust.delete(b.dataset.tdrop); replan(); });
    $$('[data-tmust]', body).forEach(b => b.onclick = e => { e.stopPropagation(); ex.tripMust.add(b.dataset.tmust); ex.tripEx.delete(b.dataset.tmust); replan(); });
    const sv = $('#exSave', body);
    if (sv) sv.onclick = () => {
      const days = {};
      let name, dates;
      if (trip) {
        trip.days.forEach(d => {
          days[d.date] = [...d.stops.map(x => `${tripIcon(x)} ${x.name} (příjezd ~${x.arrive})`), d.overnight ? `🛏️ Přespání: ${d.overnight.name}` : `🏁 Zpět na start (${p.label}) ~${d.back.arrive}`];
        });
        name = `${trip.mode === 'day' ? 'Výlety z' : 'Okruh z'}: ${p.label}`;
        dates = [trip.days[0].date, trip.days.at(-1).date];
      } else {
        ex.plan.days.forEach(d => { days[d.date] = d.items.map(x => x.name); });
        name = `Výlet: ${p.label}`;
        dates = [ex.plan.days[0].date, ex.plan.days.at(-1).date];
      }
      S.trips.push({ name, dest: p.label, iso: byIso[p.cc] ? p.cc : null, start: dates[0], end: dates[1], pax: '2', budget: '', days, checklist: PACK.map(t => ({ t, done: false })), notes: '' });
      save(); toast('Uloženo do plánovače'); go('planner');
    };
  }

  // Přepnutí světlý/tmavý režim: otevřené mapy dostanou odpovídající styl (rastrová záloha zůstane).
  function retheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    for (const m of liveMaps) {
      const ms = m.atlasState;
      if (!ms || ms.raster || !document.body.contains(m.getContainer())) continue;
      ms.styleReady = false;
      m.setStyle(OFM + (dark ? 'dark' : 'liberty'), { diff: false });
    }
  }

  window.Places = { renderExplore, renderPlanner, retheme };
})();
