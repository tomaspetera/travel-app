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
  // all = místa načtená ze serveru (pro loaded.radius), items = z nich ta v právě zvoleném okruhu
  const ex = { place: null, all: [], items: [], loaded: null, cat: '', radius: 10, plan: null, interests: new Set(), pace: 'normal', days: 3, start: '', mode: 'city', transport: 'car', trips: {}, tripDays: { day: 2, loop: 4 }, tripEx: new Set(), tripMust: new Set(), tripInterests: new Set(), ms: null,
    errs: {}, recent: [], listOpen: false, restored: false,
    bike: { km: 40, bike: 'trekking', scenery: 'mixed', hills: 'normal', variant: 0, kind: 'loop' }, bikeRoute: null, trainRoute: null,
    hike: { km: 10, scenery: 'mixed', hills: 'normal', variant: 0 }, hikeRoute: null };
  const TRIP_INTERESTS = [['towns', '🏘️ Města'], ['sights', '🏰 Památky'], ['culture', '🏛️ Poznávací'], ['nature', '🌲 Příroda'], ['spa', '♨️ Lázně'], ['kids', '🧒 S dětmi']];
  const MODES = [['city', '🏙️ Program ve městě'], ['day', '🎒 Jednodenní výlety'], ['loop', '🧭 Vícedenní okruh'], ['bike', '🚴 Na kole'], ['hike', '🥾 Pěšky']];
  // Na telefonu přepínač režimů v jednom řádku: ikona nad krátkým názvem (celý název přečte čtečka).
  const MODE_SHORT = { city: 'Město', day: 'Výlety', loop: 'Okruh', bike: 'Kolo', hike: 'Pěšky' };
  const modeBtns = cur => MODES.map(([id, l]) => {
    const [ico, ...rest] = l.split(' ');
    return `<button type="button" data-mode="${id}" class="${cur === id ? 'on' : ''}" aria-label="${rest.join(' ')}"><span class="m-long">${l}</span><span class="m-short"><b>${ico}</b>${MODE_SHORT[id]}</span></button>`;
  }).join('');
  const BIKE_KINDS = [['loop', '🔁 Okruh'], ['train', '🚆 Vlakem tam, na kole zpět']];
  const BIKE_TYPES = [['road', '🏎️ Silniční'], ['trekking', '🚲 Trek / město'], ['gravel', '🪨 Gravel'], ['mtb', '🚵 Horské']];
  const BIKE_SCENERY = [['city', '🏙️ Městem'], ['mixed', '🔀 Smíšeně'], ['nature', '🌲 Přírodou']];
  const BIKE_HILLS = [['flat', '〰️ Spíš rovina'], ['normal', '⛰️ Normálně'], ['hilly', '🏔️ Do kopců']];
  const TRANSPORTS = [['car', '🚗 Autem'], ['transit', '🚆 Vlakem a busem']];

  const icon = c => (CAT[c] || CAT.sight)[0];
  const color = c => (CAT[c] || CAT.sight)[2];
  const plusDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtYMD(d); };
  // nezlomitelné mezery: „ne 11. 10.“ se na telefonu nerozdělí na dva řádky
  const dayLbl = ymd => { const d = new Date(ymd + 'T12:00:00'); return `${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][d.getDay()]}\u00a0${d.getDate()}.\u00a0${d.getMonth() + 1}.`; };
  const minTxt = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;
  const TRIP_ICON = { town: '🏘️', castle: '🏰', nature: '⛰️', monastery: '⛪', palace: '🏯', ruins: '🏚️' };
  const NATURE_ICON = { park: '🏞️', waterfall: '💧', cave: '🕳️', gorge: '🏞️', rock: '🪨', mountain: '⛰️', lake: '🌊', reserve: '🌿' };
  const tripIcon = p => (p.spa ? '♨️' : NATURE_ICON[p.natureKind] || TRIP_ICON[p.tripKind] || icon(p.tripKind || p.category));
  const interestWeights = set => {
    const w = {};
    for (const [id, , m] of INTERESTS) if (set.has(id)) for (const [k, v] of Object.entries(m)) w[k] = Math.max(w[k] || 1, v);
    return w;
  };

  // Chyba bez vlastního textu serveru (Render při probouzení vrací 502–504 jako HTML) – česky, ne „HTTP 502“.
  const httpErr = (status, j) => (j && j.error) || (status >= 502 && status <= 504
    ? 'Server se právě probouzí nebo je přetížený – zkus to za chvíli znovu.' : `Chyba serveru (HTTP ${status}).`);
  async function getJson(url, opts) {
    let r;
    try {
      r = await fetch(url, opts);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('Server teď neodpovídá – zkontroluj připojení a zkus to znovu.'); // místo anglického „Failed to fetch“
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(httpErr(r.status, j)), { status: r.status });
    return j;
  }

  /* ---------- drobné čisté pomocníky Objevuj (testy: test/places-ui.test.js přes Places._t) ---------- */
  const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
  const placesTxt = n => plural(n, 'místo', 'místa', 'míst');
  // „vybráno 1 místo“, „vybrána 3 místa“, „vybráno 7 míst“
  const mustTxt = n => `${n >= 2 && n <= 4 ? 'vybrána' : 'vybráno'} ${placesTxt(n)}`;
  const RADII = [3, 5, 10, 20];
  // Okruh se zmenšuje v prohlížeči nad už načtenými místy; výlety mimo město (daytrip) leží za okruhem vždy.
  const inRadius = (items, km) => items.filter(x => x.category === 'daytrip' || x.distanceKm == null || x.distanceKm <= km);
  // Nový dotaz jen při zvětšení nad to, co je načtené.
  const needsFetch = (loadedKm, km) => !(loadedKm >= km);
  // Místa za zvoleným okruhem (načtená pro větší): program je nesmí vybrat – kromě těch, která si uživatel přidal sám.
  const outsideIds = (items, km, keep) => items.filter(x => x.category !== 'daytrip' && x.distanceKm != null && x.distanceKm > km && !keep?.has(x.id)).map(x => x.id);
  const planIds = plan => new Set((plan?.days || []).flatMap(d => d.items.map(p => p.id)));
  // Značky na mapě: načtená místa + zastávky programu, které v nich nejsou (připnuté, za okruhem).
  const withPlanStops = (items, plan) => {
    const have = new Set(items.map(x => x.id));
    const extra = [];
    for (const d of plan?.days || []) for (const p of d.items) if (!have.has(p.id)) { have.add(p.id); extra.push(p); }
    return extra.length ? [...items, ...extra] : items;
  };
  // Enter v hledání: návrhy k právě napsanému textu → vyber; jinak (čeká se, stará odpověď, chyba) hledej hned.
  const enterAction = ({ text, sugFor, count, err }) => (text.length < 2 ? 'none' : sugFor === text && !err ? (count ? 'pick' : 'none') : 'fetch');
  const sugHtml = (sugs, act, err) => (err ? '<div class="pi-empty">Hledání míst teď nefunguje – zkus to za chvíli</div>'
    : sugs.length ? sugs.map((s, i) => `<div class="pi-opt ${i === act ? 'on' : ''}" data-i="${i}"><span class="pi-flag">${s.flag || '📍'}</span><span class="pi-t"><b>${esc(s.label)}</b><small>${esc(s.sub || '')}</small></span></div>`).join('')
      : '<div class="pi-empty">Nic nenalezeno</div>');

  // Čekání: rovnou poctivý odhad, po SLOW_MS výslovnější vysvětlení (spinner zůstává).
  const SLOW_MS = 8000;
  const WAIT = {
    list: ['První načtení místa trvá obvykle 20–40 s, příště je hned.', 'Pořád načítám – u nového místa server stahuje data z Wikidat a popisy z Wikipedie, někdy i přes půl minuty. Příště už to bude hned.'],
    city: ['', 'Trvá to déle než obvykle – server data o místech zřejmě načítá znovu (i 20–40 s). Pak už to bude hned.'],
    trips: ['Poprvé to pro nové místo trvá obvykle 20–40 s, příště je hned.', 'Pořád hledám – cíle výletů v okolí 120 km se z Wikidat načítají pomalu, někdy i přes půl minuty. Příště už to bude hned.'],
    train: ['Nádraží v okolí se poprvé hledají obvykle 20–40 s.', 'Pořád hledám – nádraží se z Wikidat načítají pomalu, někdy i přes půl minuty. Příště už to bude rychlejší.'],
    route: ['', 'Trvá to déle než obvykle – plánovač tras (BRouter) nebo server odpovídá pomalu. Zkouším to dál.'],
  };
  const WAIT_LEAD = { list: 'Hledám zajímavá místa kolem:', city: 'Skládám program…', trips: 'Hledám cíle výletů…', train: 'Hledám nádraží a trasu…', route: 'Plánuju trasu…' };
  const waitHtml = (kind, slow, label, note) => `<div class="loading-row ex-busy" role="status"><span class="spin dark"></span><div><b>${esc(kind === 'list' ? `${WAIT_LEAD.list} ${label}…` : WAIT_LEAD[kind])}</b>${
    (note || WAIT[kind][slow ? 1 : 0]) ? `<div class="ex-wait">${esc(note || WAIT[kind][slow ? 1 : 0])}</div>` : ''}</div></div>`;
  const ERR_LEAD = { city: 'Program se nepodařilo sestavit', trips: 'Výlety se nepodařilo naplánovat', route: 'Trasu se nepodařilo naplánovat', train: 'Nádraží a trasu se nepodařilo najít' };
  const errLead = (kind, other) => (other ? (kind === 'train' ? 'Jiné nádraží se nepodařilo najít' : 'Jinou trasu se nepodařilo naplánovat') : ERR_LEAD[kind] || 'Nepodařilo se to');
  // Chyba přímo ve výsledku s „Zkusit znovu“ (žádná mizející hláška); předchozí výsledek zůstává pod ní.
  const errHtml = (lead, msg, id, kept) => `<div class="note bad ex-err" role="alert">⚠️ <div>${esc(`${lead}: ${String(msg || '').replace(/[.\s]+$/, '')}.`)}${kept ? ` <span class="faint">${esc(kept)}</span>` : ''}</div><button type="button" class="btn sm" id="${id}">↻ Zkusit znovu</button></div>`;

  /* ---------- zapamatovaný stav Objevuj (localStorage; po obnovení stránky stejné místo a volby) ---------- */
  const UI_LS = 'atlas_explore_v1';
  const pick1 = (v, ok) => (ok.includes(v) ? v : undefined);
  const cleanPlace = p => (p && typeof p === 'object' && Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lon) <= 180
    && typeof p.label === 'string' && p.label.trim()
    ? { lat: +p.lat, lon: +p.lon, label: p.label.slice(0, 120), cc: /^[A-Z]{2}$/.test(p.cc) ? p.cc : '', geo: Boolean(p.geo), country: typeof p.country === 'string' ? p.country.slice(0, 60) : '' } : null);
  const samePlace = (a, b) => Boolean(a && b && a.label === b.label && Math.abs(a.lat - b.lat) < 1e-3 && Math.abs(a.lon - b.lon) < 1e-3);
  // „Naposledy“: nejnovější první, bez opakování, bez „Moje okolí“ (poloha se mění).
  const pushRecent = (list, p) => (!p || p.geo ? list : [cleanPlace(p), ...list.filter(x => !samePlace(x, p))].filter(Boolean).slice(0, 5));
  function uiSnapshot(s) {
    return {
      place: cleanPlace(s.place), radius: s.radius, mode: s.mode, start: s.start, days: s.days, tripDays: { ...s.tripDays }, transport: s.transport,
      interests: [...s.interests], tripInterests: [...s.tripInterests], pace: s.pace,
      bike: { km: s.bike.km, bike: s.bike.bike, scenery: s.bike.scenery, hills: s.bike.hills, kind: s.bike.kind },
      hike: { km: s.hike.km, scenery: s.hike.scenery, hills: s.hike.hills }, recent: s.recent || [],
    };
  }
  /** Uložený stav → jen platné hodnoty (cizí nebo starý záznam nic nerozbije); start v minulosti se zahodí. */
  function uiRestore(raw, today) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const ids = list => list.map(x => x[0]);
    const arr = (v, ok) => (Array.isArray(v) ? [...new Set(v.filter(x => ok.includes(x)))] : undefined);
    const ob = v => (v && typeof v === 'object' ? v : {});
    const r = {
      place: cleanPlace(o.place), radius: pick1(o.radius, RADII), mode: pick1(o.mode, ids(MODES)),
      start: typeof o.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.start) && o.start >= today ? o.start : undefined,
      days: pick1(o.days, [1, 2, 3, 4, 5, 6, 7, 10]), transport: pick1(o.transport, ids(TRANSPORTS)), pace: pick1(o.pace, ['relaxed', 'normal', 'intense']),
      tripDays: { day: pick1(ob(o.tripDays).day, [1, 2, 3, 4, 5, 7]), loop: pick1(ob(o.tripDays).loop, [2, 3, 4, 5, 6, 7, 10]) },
      interests: arr(o.interests, ids(INTERESTS)), tripInterests: arr(o.tripInterests, ids(TRIP_INTERESTS)),
      bike: { km: pick1(ob(o.bike).km, [15, 25, 40, 60, 80, 100, 130]), bike: pick1(ob(o.bike).bike, ids(BIKE_TYPES)), scenery: pick1(ob(o.bike).scenery, ids(BIKE_SCENERY)),
        hills: pick1(ob(o.bike).hills, ids(BIKE_HILLS)), kind: pick1(ob(o.bike).kind, ids(BIKE_KINDS)) },
      hike: { km: pick1(ob(o.hike).km, [5, 8, 10, 12, 15, 20, 25, 30]), scenery: pick1(ob(o.hike).scenery, ids(BIKE_SCENERY)), hills: pick1(ob(o.hike).hills, ids(BIKE_HILLS)) },
      recent: (Array.isArray(o.recent) ? o.recent : []).map(cleanPlace).filter(p => p && !p.geo).slice(0, 5),
    };
    const drop = x => { for (const k of Object.keys(x)) if (x[k] === undefined || x[k] === null) delete x[k]; return x; };
    drop(r.tripDays); drop(r.bike); drop(r.hike);
    return drop(r);
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
  // Země česky podle kódu (byIso z data.js).
  const countryCs = cc => (cc && typeof byIso !== 'undefined' && byIso[cc]?.cs) || '';
  // Cíl výletu (Montserrat, Vic, La Granada) se zemí – svou (cc z Wikidat), jinak zemí výchozího místa;
  // jen s názvem by Google vybral stejnojmenné místo jinde (Montserrat v Karibiku).
  const stopQ = (s, center) => gq(s.name, countryCs(s.cc) || center.country || '');
  const poiQ = (p, center) => (p.category === 'daytrip' || p.tripKind ? stopQ(p, center) : gq(p.name, cityOf(center)));
  // Mapy.com: trasa dne přes zastávky (pěšky po městě foot_fast, výlet autem car_fast) – stejný formát odkazu jako
  // u tras na kole (server/lib/bike.js mapyUrl); Google Maps v mobilu bere jen pár mezizastávek, Mapy.com až 15.
  const MAPY_WP = 15;
  const mll = p => `${(+p.lon).toFixed(5)},${(+p.lat).toFixed(5)}`;
  const okPt = p => p && p.lat != null && p.lon != null && Number.isFinite(+p.lat) && Number.isFinite(+p.lon);
  function mapyDir(start, stops, routeType, end) {
    const pts = stops.filter(okPt);
    if (!okPt(start) || !pts.length) return null;
    const qs = new URLSearchParams({ mapset: 'basic', start: mll(start), end: mll(okPt(end) ? end : pts.at(-1)), routeType });
    const via = (okPt(end) ? pts : pts.slice(0, -1)).slice(0, MAPY_WP);
    if (via.length) qs.set('waypoints', via.map(mll).join(';'));
    return `https://mapy.com/fnc/v1/route?${qs}`;
  }
  // „trasa: Google Maps ↗ · Mapy.com ↗“ v nadpisu dne
  const dayLinks = (gUrl, mUrl, what = 'trasa') => (gUrl || mUrl ? `<span class="dp-links">${what}: ${[
    gUrl ? `<a class="linkbtn" href="${esc(safeUrl(gUrl))}" target="_blank" rel="noopener">Google Maps ↗</a>` : '',
    mUrl ? `<a class="linkbtn" href="${esc(safeUrl(mUrl))}" target="_blank" rel="noopener">Mapy.com ↗</a>` : '',
  ].filter(Boolean).join(' · ')}</span>` : '');

  const gmBtn = center => (center?.label ? `<a class="btn" href="${esc(gmSearch(centerQ(center) || `${center.lat},${center.lon}`))}" target="_blank" rel="noopener">Otevřít v Google Maps ↗</a>` : '');
  function mapFallback(el, center, msg) {
    el.innerHTML = `<div class="map-fallback"><div>🗺️ ${esc(msg)}</div>${gmBtn(center)}</div>`;
  }
  // Mapa bez podkladu (nenačetly se dlaždice ani záložní OpenStreetMap): poznámka nad mapou, značky a trasa zůstanou.
  const blankHtml = center => `<div class="map-blank" role="status"><div>🗺️ Mapa se nenačetla</div>${gmBtn(center)}</div>`;

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
    const dark = document.documentElement.dataset.map === 'dark'; // světlá/tmavá mapa (app.js), ne režim aplikace
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
    // Na úzké mapě (mobil) by rozbalená atribuce zakryla spodek mapy: sbal ji do tlačítka ⓘ (klepnutím se rozbalí).
    const foldAttrib = () => {
      const a = el.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show');
      if (!a) return;
      a.classList.remove('maplibregl-compact-show');
      map.off('sourcedata', foldAttrib);
    };
    if (el.offsetWidth <= 640) map.on('sourcedata', foldAttrib);
    // Když vektorová mapa nenaběhne (výpadek OpenFreeMap), přepni na rastrové dlaždice OpenStreetMap.
    const toRaster = () => { if (ms.raster || !liveMaps.has(map)) return; ms.raster = true; ms.styleReady = false; map.setStyle(OSM_STYLE, { diff: false }); };
    const timer = setTimeout(() => { if (!ms.styleReady) toRaster(); }, 8000);
    map.once('remove', () => clearTimeout(timer));
    // Nenačtený styl nebo popis zdroje dlaždic (TileJSON) = mapa by zůstala prázdná → hned záloha;
    // jednotlivé dlaždice až po několika chybách (chybějící ikonky/písma nevadí).
    map.on('error', e => {
      if (!ms.styleReady || (e.sourceId && !e.tile) || (e.tile && ++ms.errors >= 3)) toRaster();
    });
    // Dlaždice, které se „zaseknou“ (požadavek visí bez chyby), by nechaly mapu prázdnou: když po
    // 15 s od načtení stylu dorazila nejvýš jedna, přepni také na OpenStreetMap.
    let tiles = 0;
    let watchdog = null;
    // Počítají se jen dlaždice podkladu – vlastní čáry tras (GeoJSON, atlas-lines) se načtou vždy, i bez sítě.
    // Dorazí-li dlaždice záložní mapy přece jen později, poznámka „Mapa se nenačetla“ zmizí.
    map.on('data', e => { if (e.dataType === 'source' && e.tile && e.sourceId !== 'atlas-lines' && ++tiles >= 2 && ms.raster) el.querySelector('.map-blank')?.remove(); });
    map.once('remove', () => clearTimeout(watchdog));
    map.on('style.load', () => {
      ms.styleReady = true;
      clearTimeout(timer);
      addLines(ms);
      clearTimeout(watchdog);
      tiles = 0;
      // Vektorová mapa: viselé dlaždice → OpenStreetMap. Ani ta za 15 s nenaběhla (bez sítě, blokované dlaždice) →
      // poznámka s odkazem do Google Map místo tmavé prázdné plochy (chybou skončené dlaždice se počítají jako hotové).
      watchdog = !ms.raster ? setTimeout(() => { if (tiles < 2 && !map.areTilesLoaded()) toRaster(); }, 15000)
        : setTimeout(() => { if (tiles < 2 && liveMaps.has(map) && !el.querySelector('.map-blank')) el.insertAdjacentHTML('beforeend', blankHtml(center)); }, 15000);
    });
  }

  function addLines(ms) {
    const map = ms.map;
    if (!ms.lines || !ms.styleReady) return;
    const src = map.getSource('atlas-lines');
    if (src) { src.setData(ms.lines); return; }
    map.addSource('atlas-lines', { type: 'geojson', data: ms.lines });
    // čárkovaně přesuny mezi zastávkami, plnou čarou skutečná trasa (kolo)
    map.addLayer({ id: 'atlas-lines', type: 'line', source: 'atlas-lines', filter: ['!=', ['get', 'solid'], true], layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.8, 'line-dasharray': [2, 2] } });
    map.addLayer({ id: 'atlas-route', type: 'line', source: 'atlas-lines', filter: ['==', ['get', 'solid'], true], layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.9 } });
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
      // focusAfterOpen: false – jinak bublina vezme fokus a prohlížeč odroluje stránku k mapě (na telefonu o tisíce px)
      const pop = new maplibregl.Popup({ offset: 12, closeButton: false, maxWidth: '240px', focusAfterOpen: false })
        .setHTML(`<b>${esc(pt.label)}</b>${pt.q ? `<br><a href="${esc(gmSearch(pt.q))}" target="_blank" rel="noopener">Google Maps ↗</a>` : ''}`);
      const mk = new maplibregl.Marker({ element: el }).setLngLat([pt.lon, pt.lat]).setPopup(pop).addTo(map);
      el.addEventListener('click', () => onClick && pt.place && onClick(pt.place));
      ms.markers.push(mk);
      ms.byId.set(pt.id, mk);
    };
    add({ id: '__center', lat: center.lat, lon: center.lon, color: '#a855f7', label: center.label || 'Start', q: centerQ(center) }, 'ctr');
    // body s číslem (v plánu) navrch
    [...pts].sort((a, b) => (a.num ? 1 : 0) - (b.num ? 1 : 0)).forEach(pt => add(pt, pt.big ? 'big' : ''));
    ms.lines = { type: 'FeatureCollection', features: lines.filter(l => l.coords.length > 1).map(l => ({ type: 'Feature', properties: { color: l.color, solid: Boolean(l.solid) }, geometry: { type: 'LineString', coordinates: l.coords } })) };
    addLines(ms);
    const fit = pts.filter(pt => !fitIds || fitIds.has(pt.id));
    const fitLines = lines.filter(l => l.fit);
    if (fit.length || fitLines.length) {
      const b = new maplibregl.LngLatBounds([center.lon, center.lat], [center.lon, center.lat]);
      fit.forEach(pt => b.extend([pt.lon, pt.lat]));
      fitLines.forEach(l => l.coords.forEach(c => b.extend([c[0], c[1]])));
      // dole víc místa, ať start trasy neskončí pod atribucí
      map.fitBounds(b, { padding: { top: 40, right: 40, bottom: 56, left: 40 }, maxZoom: 15, duration: 0 });
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

  /**
   * Mapa trasy pobytu (průvodce cestou): střed = letiště příletu, body { id, lat, lon, color, num, label, q },
   * přejezdy jednou čárkovanou čarou. Vrací funkci (body, souřadnice [[lon, lat]…]) pro překreslení téže mapy.
   */
  function routeMap(el, center) {
    const ms = makeMap(el, center);
    return (pts, coords) => paintMap(ms, center, pts, [{ color: '#5b8cff', coords }], null);
  }

  // Výlety autem: cíle očíslované po dnech, trasa dne (start → cíle → přespání / návrat).
  function drawTrips(state, center, trip, onClick) {
    if (!state.map || !trip) return;
    const pts = [];
    const lines = [];
    trip.days.forEach((d, i) => {
      const col = DAY_COLORS[i % DAY_COLORS.length];
      d.stops.forEach((s, j) => pts.push({ id: s.id, lat: s.lat, lon: s.lon, color: col, num: j + 1, big: true,
        label: `${tripIcon(s)} ${s.name} · den ${i + 1}${d.overnight && j === d.stops.length - 1 ? ' · přespání' : ''}`, q: stopQ(s, center), place: s }));
      const coords = [[d.from.lon, d.from.lat], ...d.stops.map(s => [s.lon, s.lat])];
      if (d.back) coords.push([center.lon, center.lat]);
      lines.push({ color: col, coords });
    });
    paintMap(state.map, center, pts, lines, onClick);
  }

  // Kolo a pěšky: trasa plnou čarou, památky po cestě očíslované, u „vlakem tam“ nádraží (domov = střed mapy).
  const routeColor = r => (r.activity === 'hike' ? '#f97316' : '#22c55e');
  function drawRoute(state, center, r) {
    if (!state.map || !r) return;
    const col = routeColor(r);
    const pts = r.via.map((v, i) => ({ id: `via${i}`, lat: v.lat, lon: v.lon, color: col, num: i + 1, label: v.name, q: gq(v.name, cityOf(center)) }));
    if (r.station) {
      const st = r.station;
      pts.push({ id: 'station', lat: st.lat, lon: st.lon, color: '#0ea5e9', num: '🚆', big: true, label: `🚆 ${st.name} – start jízdy`, q: /nádr|station|bahnhof|hbf/i.test(st.name) ? st.name : `${st.name} nádraží` });
    }
    paintMap(state.map, center, pts, [{ color: col, coords: r.geometry.map(c => [c[0], c[1]]), solid: true, fit: true }]);
  }

  /* ---------- počasí (weather.js: předpověď Open-Meteo, dál než 15 dní dlouhodobý průměr) ---------- */
  // Plán na počasí nečeká: vykreslí se s prázdným místem [data-wx="lat,lon,datum"] a fillWx ho doplní,
  // až předpověď dorazí. Stejné dotazy (plán se překresluje často) drží hodinu v paměti weather.js.
  const wxKey = (pt, date) => `${pt.lat},${pt.lon},${date || ''}`;
  // route = řádek u trasy na kole / pěšky (se dnem a tipem na lepší den), jinak štítek v nadpisu dne
  const wxSlot = (pt, date, route) => (window.Weather && pt && pt.lat != null && pt.lon != null
    ? (route ? `<div class="wx-day" data-wx="${esc(wxKey(pt, date))}"></div>` : `<span data-wx="${esc(wxKey(pt, date))}"></span>`) : '');
  const WX_SRC = 'Počasí: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)';
  const WX_IN = ['V neděli', 'V pondělí', 'V úterý', 'Ve středu', 'Ve čtvrtek', 'V pátek', 'V sobotu'];
  const WX_BYL = ['byla', 'bylo', 'bylo', 'byla', 'byl', 'byl', 'byla'];
  const dow = ymd => new Date(ymd + 'T12:00:00').getDay();
  // „V sobotu hrozí déšť (70 %) – lepší by byl čtvrtek 8. 10.: ☀️ 21°“; best = nejlepší z nejbližších 7 dní
  function rainTip(w, best) {
    const alt = best && best.date !== w.date && !Weather.rainy(best);
    return `${WX_IN[dow(w.date)]} hrozí déšť${w.pop != null ? ` (${w.pop} %)` : ''}${alt
      ? ` – lepší by ${WX_BYL[dow(best.date)]} <b>${Weather.dayName(best.date)} ${+best.date.slice(8)}. ${+best.date.slice(5, 7)}.</b>: ${wIco(best.code)[0]} ${best.hi}°` : ''}`;
  }
  async function fillWx(host) {
    const W = window.Weather;
    const slots = $$('[data-wx]', host).map(el => { const [lat, lon, date] = el.dataset.wx.split(','); return { el, key: el.dataset.wx, lat: +lat, lon: +lon, date, route: el.classList.contains('wx-day') }; });
    if (!W || !slots.length) { fillSun(host); return; }
    // Odpověď patří jen svému místu: po překreslení (jiné místo, režim) už ve stránce není,
    // po změně data čeká na jiný den – starší předpověď se do něj nezapíše. Bez údajů se řádek u trasy schová.
    const put = (s, html) => { if (s.el.isConnected && s.el.dataset.wx === s.key) { s.el.innerHTML = html; s.el.hidden = !html; } };
    try {
      const ws = await W.forecast(slots); // jeden dotaz na všechny dny a místa plánu; null = mimo dosah / chyba
      fillSun(host); // západ slunce z téže předpovědi (bez dalšího dotazu), dál výpočtem
      await Promise.all(slots.map(async (s, i) => {
        const w = ws[i];
        if (w) {
          const line = s.route ? `<span class="faint">Počasí ${dayLbl(s.date)}:</span>${W.badge(w)}` : W.badge(w);
          put(s, line);
          if (s.route && W.rainy(w)) {
            const best = W.bestDay(await W.days(s.lat, s.lon, fmtYMD(new Date()), 7));
            put(s, `${line}<div class="note info">🌧️ <div>${rainTip(w, best)}</div></div>`);
          }
        } else if (W.daysAhead(s.date) > W.AHEAD) {
          const n = await W.normal(s.lat, s.lon, s.date);
          const why = 'dlouhodobý průměr (meteostanice u blízkého letiště, jinak NASA POWER), ne předpověď – ta je nejvýš na 15 dní dopředu';
          put(s, !n ? '' : s.route ? `📅 ${esc(n.text)} <span class="faint">– ${why}</span>`
            : `<span class="wx avg" title="${esc(`${n.text} – ${why}`)}">obvykle ${esc(n.hi)}°<small> / ${esc(n.lo)}°</small></span>`);
        } else put(s, '');
      }));
    } catch { /* bez počasí se plán obejde */ }
  }

  /* ---------- západ slunce: návrat po setmění (výlety, kolo, pěšky) ---------- */
  const toMin = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? +m[1] * 60 + +m[2] : null; };
  const toHm = m => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  // Varovat, když je návrat později než 15 min před západem slunce (za šera už se špatně jede i jde).
  const SUN_MARGIN = 15;
  const afterDark = (ret, sunset) => { const r = toMin(ret), ss = toMin(sunset); return r != null && ss != null && r > ss - SUN_MARGIN; };
  // Kolo a pěšky nemají čas startu: počítá se 9:00 (u „vlakem tam“ nejdřív vlak – ~60 km/h po trati, ta je ~1,3× delší
  // než vzdušná čára, + 15 min na nádraží), pak čas v sedle / chůze a ~15 % na přestávky.
  const ROUTE_START = 9 * 60;
  function routeBack(r, center) {
    const train = r.kind === 'train' && r.station ? 15 + Math.round(kmBetween([center.lon, center.lat], [r.station.lon, r.station.lat]) * 1.3) : 0;
    const ride = Math.max(0, +r.minutes || 0);
    return { train, back: ROUTE_START + train + ride + Math.round(ride * 0.15) };
  }
  // Místo pro varování (doplní fillSun, až bude znát západ slunce); bod = týž jako u počasí → předpověď z téhož dotazu.
  const sunSlot = (pt, date, ret, note = '') => (window.Weather && pt && pt.lat != null && pt.lon != null && toMin(ret) != null
    ? `<div class="sun-slot" data-sun="${esc(`${pt.lat},${pt.lon},${date},${ret}`)}"${note ? ` data-note="${esc(note)}"` : ''}></div>` : '');
  const sunHtml = (sunset, note) => `<div class="note warn">🌇 <div>Návrat po setmění (západ slunce ${esc(sunset)}) – vyraz dřív nebo zkrať trasu.${note ? ` <span class="faint">${esc(note)}</span>` : ''}</div></div>`;
  async function fillSun(host) {
    const W = window.Weather;
    const slots = $$('[data-sun]', host).map(el => { const [lat, lon, date, ret] = el.dataset.sun.split(','); return { el, key: el.dataset.sun, lat: +lat, lon: +lon, date, ret }; });
    if (!W?.sunsets || !slots.length) return;
    try {
      const ss = await W.sunsets(slots);
      slots.forEach((s, i) => { if (s.el.isConnected && s.el.dataset.sun === s.key) s.el.innerHTML = afterDark(s.ret, ss[i]) ? sunHtml(ss[i], s.el.dataset.note) : ''; });
    } catch { /* bez západu slunce se plán obejde */ }
  }

  /* ---------- karty ---------- */
  // „+ chci vidět“ / „★ chci vidět“ (vybráno – přidá se při sestavení programu, nebo hned, když už program je)
  const mustBtn = (id, on) => `<button type="button" class="linkbtn${on ? ' on' : ''}" data-must="${esc(id)}" aria-pressed="${on ? 'true' : 'false'}">${on ? '★ chci vidět' : '+ chci vidět'}</button>`;
  // Popis jen anglicky (server: descLang 'en'): první věta se štítkem „anglicky“ – celý cizí odstavec nic neřekne.
  const firstSentence = s => {
    const t = String(s || '').trim();
    const m = t.match(/^[\s\S]{20,240}?[a-z0-9)\]"'’\u00e0-\u024f]{2}[.!?](?=\s|$)/); // „St. Vitus“, „U.S.“ větu neukončí
    return m ? m[0] : t.length > 240 ? `${t.slice(0, 220).replace(/\s+\S*$/, '')}…` : t;
  };
  // Bez údaje o jazyku (starší server): text bez české diakritiky s několika běžnými anglickými slovy je anglický.
  const EN_WORDS = /\b(the|of|and|is|was|were|located|built|which|its|with|from|by|known|has)\b/gi;
  const looksEnglish = s => !/[ěščřžůťďň]/i.test(s) && (String(s).match(EN_WORDS) || []).length >= 3;
  const descHtml = (text, lang) => (!text ? '' : lang === 'en' || (!lang && looksEnglish(text))
    ? `<span class="poi-lang" title="Český popis chybí – úryvek z anglické Wikipedie">anglicky</span> ${esc(firstSentence(text))}` : esc(text));
  // Části sloučené do celku (katedrála na Hradě, orloj u radnice) – jinak by v aplikaci nebyly vidět vůbec.
  const inclHtml = (p, cls) => (Array.isArray(p.includes) && p.includes.length
    ? `<div class="${cls}">Zahrnuje: ${esc(p.includes.slice(0, 5).join(', '))}${p.includes.length > 5 ? ` a ${p.includes.length - 5} další` : ''}</div>` : '');
  function poiCard(p, opts = {}) {
    return `<div class="poi" data-poi="${esc(p.id)}">
      <div class="poi-img" ${p.image ? `style="background-image:url('${esc(cssUrl(p.image))}')"` : ''}>${p.image ? '' : icon(p.category)}</div>
      <div><div class="poi-name">${icon(p.category)} ${esc(p.name)}</div>
        <div class="poi-meta">${esc(p.categoryLabel || '')}${p.distanceKm != null ? ` · ${p.distanceKm} km` : ''}${p.unesco ? ' · <b style="color:var(--warn)">UNESCO</b>' : p.heritage ? ' · památka' : ''}${p.wikivoyage ? ' · <b style="color:var(--good)" title="Místo doporučuje cestovní průvodce Wikivoyage">👍 doporučuje Wikivoyage</b>' : ''}</div>
        ${inclHtml(p, 'poi-inc')}<div class="poi-desc">${descHtml(p.extract || p.description || '', p.descLang)}</div>
        <div class="poi-acts">${p.url ? `<a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Wikipedie ↗</a>` : ''}
          <a href="${esc(gmSearch(opts.center ? poiQ(p, opts.center) : p.name))}" target="_blank" rel="noopener" data-gm onclick="event.stopPropagation()">Google Maps ↗</a>
          ${opts.toggle ? (opts.inPlan?.has(p.id) ? '<span class="poi-in">✓ v plánu</span>' : mustBtn(p.id, opts.must?.has(p.id))) : ''}
          ${opts.tripToggle ? `<button type="button" class="linkbtn" data-tmust="${esc(p.id)}">+ přidat do výletu</button>` : ''}</div></div>
    </div>`;
  }

  function planHtml(plan, center) {
    if (!plan) return '';
    const warn = (plan.warnings || []).map(w => `<div class="note warn" style="margin-bottom:10px">⚠️ <div>${esc(w)}</div></div>`).join('');
    return warn + plan.days.map((d, i) => {
      const trip = d.kind === 'daytrip';
      const url = !trip ? gmDir(centerQ(center), d.items.map(p => poiQ(p, center)), 'walking') : gmDir(centerQ(center), d.items.slice(0, 1).map(p => poiQ(p, center)), 'transit');
      // pěší den po městě i v Mapy.com (výlet mimo město veřejnou dopravou jen Google – spoje)
      const mapy = !trip ? mapyDir(center, d.items, 'foot_fast') : null;
      return `<div class="day-plan"><h4><span><span style="color:${DAY_COLORS[i % DAY_COLORS.length]}">●</span> Den ${i + 1} · ${dayLbl(d.date)}${trip ? ' · celodenní výlet' : ''}${wxSlot((trip && d.items[0]) || center, d.date)}</span>
        ${dayLinks(url, mapy)}</h4>
        ${d.items.length ? d.items.map((p, j) => `<div class="dp-item" data-poi="${esc(p.id)}"><span class="dp-n">${j + 1}</span><div><b>${icon(p.category)} ${esc(p.name)}</b> <span class="faint">· ${minTxt(p.visitMin)}</span>
          ${inclHtml(p, 'dp-walk')}<div class="dp-walk">${j === 0 ? 'od ubytování' : 'dál'} ${p.transit ? `${p.fromPrevKm} km – MHD/taxi` : `${p.fromPrevKm} km pěšky (~${minTxt(p.fromPrevMin)})`}</div></div>
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

  // extra: Objevuj posílá okruh načteného seznamu (server vezme stejná místa z mezipaměti) a místa za zvoleným okruhem
  // mezi vyřazenými; Cesta nic (okruh 10 km).
  async function makePlan(st, center, dates, extra) {
    const body = {
      lat: center.lat, lon: center.lon, start: dates.start, end: dates.end, arrivalTime: dates.arrivalTime, departureTime: dates.departureTime,
      pace: st.pace, interests: interestWeights(st.interests), exclude: [...st.exclude], include: [...st.must], ...extra,
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
    // „další místa“ z programu, u sdíleného odkazu (bez nich) z už načtených míst v okolí
    const spare = plan => {
      if (plan.spare?.length) return plan.spare;
      const used = new Set(plan.days.flatMap(d => d.items.map(q => q.id)));
      return (st.items || []).filter(p => !used.has(p.id) && p.category !== 'daytrip').slice(0, 30);
    };
    const paint = plan => {
      $('#tpPlan', host).innerHTML = (st.demo ? '<div class="faint" style="font-size:12px;margin-bottom:8px">⚠️ demo data</div>' : '') + planHtml(plan, center)
        + (spare(plan).length ? `<details class="more"><summary>Další místa v okolí (${spare(plan).length})</summary><div class="poi-list" style="margin-top:10px">${spare(plan).slice(0, 15).map(p => poiCard(p, { toggle: true, must: st.must, center })).join('')}</div></details>` : '')
        + (window.Weather ? `<div class="faint" style="font-size:11.5px;margin-top:8px">${WX_SRC}</div>` : '');
      fillWx($('#tpPlan', host));
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
  // Stav Objevuj (místo, okruh, režim, termín, volby, „Naposledy“) přežije obnovení stránky; bez úložiště se jen nezapamatuje.
  function remember() {
    try { localStorage.setItem(UI_LS, JSON.stringify(uiSnapshot(ex))); } catch { /* plné nebo zakázané úložiště */ }
  }
  function restoreUi() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(UI_LS)); } catch { return; }
    const r = uiRestore(raw, fmtYMD(new Date()));
    for (const k of ['radius', 'mode', 'start', 'days', 'transport', 'pace', 'recent']) if (r[k] !== undefined) ex[k] = r[k];
    if (r.place) ex.place = r.place;
    Object.assign(ex.tripDays, r.tripDays);
    Object.assign(ex.bike, r.bike);
    Object.assign(ex.hike, r.hike);
    if (r.interests) ex.interests = new Set(r.interests);
    if (r.tripInterests) ex.tripInterests = new Set(r.tripInterests);
  }

  function renderExplore(root) {
    if (!root) return;
    if (!ex.restored) { ex.restored = true; if (!ex.place) restoreUi(); }
    if (!ex.start || ex.start < fmtYMD(new Date())) ex.start = plusDays(fmtYMD(new Date()), 1);
    root.innerHTML = `<div class="card search-card">
      <div class="ex-search">
        <div class="field" style="margin:0"><label>Kam se chceš podívat? <span class="lab-hint">město, obec, ostrov, místo…</span></label>
          <div style="position:relative"><input class="input" id="exQ" placeholder="Např. Lisabon, Český Krumlov, Kréta…" autocomplete="off" value="${esc(ex.place?.label || '')}"><div class="pi-dd" id="exDd" hidden></div></div></div>
        <button class="btn ghost" id="exGeo" title="Moje poloha" style="align-self:end">📍 Tady</button>
        <div class="field" style="margin:0"><label>Okruh</label><select id="exRad">${RADII.map(r => `<option value="${r}" ${ex.radius === r ? 'selected' : ''}>${r} km</option>`).join('')}</select></div>
      </div><div class="ex-recent" id="exRecent" hidden></div></div>
      <div id="exBody">${ex.place ? '' : `<div class="empty"><div class="ei">🗺️</div><h2 style="font-size:20px;margin-bottom:6px">Objev, co stojí za vidění</h2><p style="max-width:460px;margin:0 auto">Zadej libovolné místo na světě. Ukážu nejzajímavější památky, muzea, vyhlídky a výlety v okolí – s popisem, fotkou a mapou – a na přání z nich složím program na pár dní.</p></div>`}</div>
      <button type="button" class="ex-back" id="exBack" hidden></button>`;
    wireExploreSearch(root);
    paintRecent();
    wireBack();
    // Návrat do Objevuj: už načtený seznam se jen překreslí (žádný nový dotaz na server).
    if (ex.place && ex.loaded?.place === ex.place && !needsFetch(ex.loaded.radius, ex.radius)) paintExplore();
    else if (ex.place) loadExplore();
  }

  // Nové místo: všechno, co patřilo k předchozímu (plány, vyřazená a vybraná místa, filtr, chyby), se zahodí.
  function openPlace(s) {
    // země podle kódu (česky, „Španělsko“) – kontext pro odkazy do Google Map
    const country = s.geo ? '' : s.country || (typeof byIso !== 'undefined' && byIso[s.cc]?.cs) || '';
    ex.place = { lat: s.lat, lon: s.lon, label: s.label, cc: s.cc || '', geo: Boolean(s.geo), country };
    ex.plan = null; ex.trips = {}; ex.bikeRoute = null; ex.trainRoute = null; ex.hikeRoute = null; ex.tripEx.clear(); ex.tripMust.clear();
    ex.cat = ''; ex.planState = null; ex.errs = {}; ex.loaded = null; ex.all = []; ex.items = [];
    for (const k of Object.keys(busy)) delete busy[k];
    ex.recent = pushRecent(ex.recent, ex.place);
    remember();
    const q = $('#exQ');
    if (q) q.value = s.label;
    paintRecent();
    loadExplore();
  }

  // „Naposledy:“ – štítky s posledními otevřenými místy (druhé otevření je ze serverové mezipaměti hned).
  function paintRecent() {
    const el = $('#exRecent');
    if (!el) return;
    const list = ex.recent.filter(r => !samePlace(r, ex.place)).slice(0, 4);
    el.hidden = !list.length;
    el.innerHTML = list.length ? `<span class="faint">Naposledy:</span>${list.map((r, i) => `<button type="button" class="fchip" data-recent="${i}">${r.cc ? flag(r.cc) : '📍'} ${esc(r.label)}</button>`).join('')}` : '';
    $$('[data-recent]', el).forEach(b => b.onclick = () => openPlace(list[+b.dataset.recent]));
  }

  // Okruh: zmenšení jen vyfiltruje načtená místa (hned), nový dotaz až při zvětšení nad načtené.
  function setRadius(km) {
    ex.radius = km;
    remember();
    const sel = $('#exRad');
    if (sel) sel.value = String(km);
    if (!ex.place) return;
    if (ex.loaded?.place === ex.place && !needsFetch(ex.loaded.radius, km)) paintExplore();
    else loadExplore();
  }

  function wireExploreSearch(root) {
    const q = $('#exQ', root), dd = $('#exDd', root);
    // sugFor = text, ke kterému návrhy patří (starý seznam se po dalším písmenu nesmí vybrat)
    let ctl = null, sugs = [], act = 0, sugFor = '', err = false, t = null;
    const show = () => {
      dd.innerHTML = sugHtml(sugs, act, err);
      dd.hidden = false;
      $$('.pi-opt', dd).forEach(o => o.onmousedown = e => { e.preventDefault(); pick(sugs[+o.dataset.i]); });
    };
    const pick = s => { if (!s) return; dd.hidden = true; openPlace(s); };
    // Návrhy k textu; null = předběhl je novější dotaz (nebo psaní).
    const fetchSugs = async text => {
      if (ctl) ctl.abort();
      const my = ctl = new AbortController();
      try {
        const j = await getJson('api/geocode?q=' + enc(text), { signal: my.signal });
        if (my !== ctl) return null;
        sugs = j.items || []; err = false;
      } catch (e) {
        if (e.name === 'AbortError' || my !== ctl) return null;
        sugs = []; err = true; // výpadek ≠ „Nic nenalezeno“
      }
      ctl = null; sugFor = text; act = 0;
      return sugs;
    };
    q.oninput = () => {
      clearTimeout(t);
      if (ctl) { ctl.abort(); ctl = null; }
      sugs = []; act = 0; sugFor = ''; err = false;
      dd.hidden = true;
      const text = q.value.trim();
      if (text.length < 2) return;
      // pozdní odpověď po odchodu z pole (klik jinam) už nabídku znovu neotevře
      t = setTimeout(async () => { t = null; if (await fetchSugs(text) && q.value.trim() === text && document.activeElement === q) show(); }, 220);
    };
    q.onkeydown = async e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!sugs.length) return; e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + sugs.length) % sugs.length; show(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const text = q.value.trim();
        const a = enterAction({ text, sugFor, count: sugs.length, err });
        if (a === 'pick') pick(sugs[act]);
        else if (a === 'none') { if (text.length >= 2) show(); }
        else {
          // Enter dřív, než doběhlo našeptávání: hledej hned aktuální text a vezmi první výsledek.
          clearTimeout(t); t = null;
          dd.innerHTML = '<div class="pi-empty">Hledám…</div>'; dd.hidden = false;
          const r = await fetchSugs(text);
          if (r == null || q.value.trim() !== text) return;
          if (r.length) pick(r[0]); else show();
        }
      } else if (e.key === 'Escape') dd.hidden = true;
    };
    q.onblur = () => setTimeout(() => { dd.hidden = true; }, 150);
    $('#exRad', root).onchange = e => setRadius(+e.target.value);
    $('#exGeo', root).onclick = () => {
      if (!navigator.geolocation) return toast('Prohlížeč nepodporuje polohu', 'err');
      navigator.geolocation.getCurrentPosition(p => pick({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'Moje okolí', geo: true }), () => toast('Polohu se nepodařilo zjistit', 'err'), { timeout: 10000 });
    };
  }

  let exSeq = 0;
  async function loadExplore() {
    const body = $('#exBody'); if (!body) return;
    const p = ex.place;
    const km = ex.radius;
    const my = ++exSeq; // pomalá starší odpověď nesmí přepsat novější místo/okruh
    hideBack();
    const wait = slow => { if (my === exSeq && body.isConnected) body.innerHTML = waitHtml('list', slow, p.label); };
    wait(false);
    const slowT = setTimeout(() => wait(true), SLOW_MS);
    try {
      const j = await getJson(`api/poi?lat=${p.lat}&lon=${p.lon}&radius=${km}`);
      if (my !== exSeq) return;
      ex.all = j.items || []; ex.demo = j.demo; ex.loaded = { place: p, radius: km };
    } catch (e) {
      if (my !== exSeq) return;
      if (body.isConnected) {
        body.innerHTML = errHtml('Místa se nepodařilo načíst', e.message, 'exRetry');
        $('#exRetry', body).onclick = () => loadExplore();
      }
      return;
    } finally {
      clearTimeout(slowT);
    }
    paintExplore();
  }

  /* ---------- telefon: mapa pod plánem a nad seznamem, klepnutí na kartu k ní odroluje ---------- */
  // Mapa vedle obsahu (počítač) je vidět pořád; pod sebou (do 1080 px) se k ní odroluje jen, když je značka mimo obrazovku,
  // a plovoucí tlačítko vrátí na původní místo v seznamu / plánu.
  const stacked = () => typeof matchMedia === 'function' && matchMedia('(max-width:1080px)').matches;
  const back = { y: 0, armed: false };
  const hideBack = () => { const b = $('#exBack'); if (b) b.hidden = true; };
  function showBack(y, what, up) {
    const b = $('#exBack');
    if (!b) return;
    Object.assign(back, { y, armed: false });
    b.textContent = `${up ? '↑' : '↓'} zpět na ${what}`;
    b.hidden = false;
    b.onclick = () => { b.hidden = true; scrollTo({ top: back.y, behavior: 'smooth' }); };
  }
  let backWired = false;
  function wireBack() {
    if (backWired) return;
    backWired = true;
    // Tlačítko zmizí, když se uživatel na původní místo vrátí sám (nejdřív musí odjet – během rolování k mapě ne).
    addEventListener('scroll', () => {
      const b = $('#exBack');
      if (!b || b.hidden) return;
      const d = Math.abs(scrollY - back.y);
      if (!back.armed) { if (d > 150) back.armed = true; } else if (d < 80) b.hidden = true;
    }, { passive: true });
  }
  // Na telefonu k mapě, jen když je značka (střed mapy po přiblížení) mimo obrazovku.
  function bringMap(ms, what) {
    const el = ms?.el;
    if (!el?.isConnected || !stacked()) return;
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (mid > 70 && mid < innerHeight - 70) return;
    const y = scrollY;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showBack(y, what, r.top > 0);
  }
  const flash = el => { el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 1500); };

  /* ---------- výlety autem (jednodenní / vícedenní okruh) ---------- */
  // Výsledky výletů zvlášť pro každý režim a dopravu (přepnutím se nic neztratí ani nesmíchá).
  const tripKey = (mode, transport) => `${mode}:${transport}`;
  async function makeTrip(p, mode, transport) {
    const body = { lat: p.lat, lon: p.lon, label: p.label, start: ex.start, days: ex.tripDays[mode], mode, transport, pace: ex.pace, interests: [...ex.tripInterests],
      exclude: [...ex.tripEx], include: [...ex.tripMust] };
    return getJson('api/roadtrip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  // Úsek cesty: autem km a čas; vlakem/busem odhad času + odkaz na skutečné spoje v Google Maps.
  // Google Maps z odkazu neumí převzít datum a čas odjezdu – napoví je titulek odkazu.
  const legTxt = (transit, km, min, fromQ, toQ, when) => (transit
    ? `🚆 ~${minTxt(min)} vlakem / busem (odhad) · <a href="${esc(safeUrl(gmDir(fromQ, [toQ], 'transit')))}" target="_blank" rel="noopener" title="${esc(`V Google Maps nastav odjezd: ${when}`)}">spoje ↗</a>`
    : `🚗 ${km} km (~${minTxt(min)})`);

  function tripStopHtml(s, j, transit, fromQ, date, center) {
    const q = stopQ(s, center);
    return `<div class="dp-item" data-poi="${esc(s.id)}"><span class="dp-n">${j + 1}</span><div>
      <b>${tripIcon(s)} ${esc(s.name)}</b> <span class="faint">· ${esc(s.categoryLabel || '')}${s.unesco ? ' · <b style="color:var(--warn)">UNESCO</b>' : s.unescoPart ? ' · <span style="color:var(--warn)">část památky UNESCO</span>' : ''}</span>
      <div class="dp-walk">${legTxt(transit, s.travelKm, s.travelMin, fromQ, q, `${dayLbl(date)} ~${s.depart}`)} · ${transit ? `odjezd ~${esc(s.depart)} · ` : ''}příjezd ~${esc(s.arrive)} · na místě ~${minTxt(s.visitMin)}</div>
      ${s.highlights?.length ? `<div class="dp-walk">👀 Uvidíš: ${esc(s.highlights.join(', '))}</div>` : ''}
      ${s.extract ? `<div class="poi-desc" style="-webkit-line-clamp:2">${descHtml(s.extract, s.descLang)}</div>` : ''}
      <div class="poi-acts">${s.url ? `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Wikipedie ↗</a>` : ''}<a href="${esc(gmSearch(q))}" target="_blank" rel="noopener">Google Maps ↗</a></div></div>
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
    const transit = trip.transport === 'transit';
    const days = trip.days.map((d, i) => {
      // okruh: další den začíná u přespání (poslední zastávka předchozího dne – má zemi), ne u výchozího místa
      const prev = trip.mode === 'loop' && i > 0 ? trip.days[i - 1].stops.at(-1) || d.from : null;
      const from = prev ? stopQ(prev, center) : origin;
      const route = [...d.stops.map(s => stopQ(s, center)), ...(d.back ? [origin || center.label] : [])].filter(Boolean);
      // Celodenní trasa s mezizastávkami jen autem (Google u veřejné dopravy mezizastávky neumí),
      // vlakem/busem má odkaz na spoje každý úsek zvlášť.
      const url = transit ? null : gmDir(from, route, 'driving');
      const mapy = transit ? null : mapyDir(d.from, d.stops, 'car_fast', d.back ? center : null);
      const title = trip.mode === 'day' ? `Výlet ${i + 1}` : `Den ${i + 1}`;
      const way = trip.mode === 'loop' ? ` · ${esc(d.from.name)} → ${esc(d.overnight ? d.overnight.name : center.label)}` : '';
      const lastQ = d.stops.length ? stopQ(d.stops.at(-1), center) : from;
      // Počasí dne: u okruhu v místě přespání (poslední den u poslední zastávky), u výletu v hlavním cíli (nejvyšší skóre).
      const wxAt = trip.mode === 'loop' ? d.overnight || d.stops.at(-1) : d.stops.reduce((b, s) => (b && (b.score || 0) >= (s.score || 0) ? b : s), null);
      return `<div class="day-plan"><h4><span><span style="color:${DAY_COLORS[i % DAY_COLORS.length]}">●</span> ${title} · ${dayLbl(d.date)}${way}${wxSlot(wxAt, d.date)}</span>
        ${dayLinks(url, mapy, 'trasa autem')}</h4>
        <div class="dp-walk" style="margin:2px 0 4px">${transit ? 'vyrazit kolem' : 'odjezd'} ~09:00 z: ${esc(d.from.name)}</div>
        ${d.stops.map((s, j) => tripStopHtml(s, j, transit, j === 0 ? from : stopQ(d.stops[j - 1], center), d.date, center)).join('')}
        ${d.back ? `<div class="dp-end">🏁 zpět na start (${esc(center.label)})${transit ? ` · odjezd ~${esc(d.back.depart)}` : ''} · příjezd ~${esc(d.back.arrive)} · ${legTxt(transit, d.back.km, d.back.min, lastQ, origin || center.label, `${dayLbl(d.date)} ~${d.back.depart}`)}</div>`
          : `<div class="dp-end">🛏️ přespání: <b>${esc(d.overnight.name)}</b> · <a href="${esc(safeUrl(d.overnight.bookUrl))}" target="_blank" rel="noopener">najít ubytování ↗</a></div>`}
        ${d.back ? sunSlot(wxAt, d.date, d.back.arrive) : ''}
        <div class="faint" style="font-size:11.5px;margin-top:4px">${transit ? `na cestě ~${minTxt(d.travelMin)}` : `za volantem ~${minTxt(d.travelMin)} (${d.travelKm} km)`} · celkem ~${minTxt(d.minutes)}</div>
      </div>`;
    }).join('');
    const spare = trip.spare?.length ? `<details class="more"><summary>Další tipy na výlet (${trip.spare.length})</summary><div class="poi-list" style="margin-top:10px">${trip.spare.map(x => poiCard({ ...x, category: 'daytrip' }, { tripToggle: true, center })).join('')}</div></details>` : '';
    return head + days + spare
      + `<div class="faint" style="font-size:11.5px;margin-top:6px">${transit
        ? 'Časy vlakem a autobusem jsou orientační odhad (bez jízdních řádů) – konkrétní spoj a jízdenku najdeš přes odkaz „spoje ↗“ u každého úseku.'
        : 'Časy jízdy jsou orientační odhad autem; přesnou trasu ukáže Google Maps.'} Cíle do ~120 km od místa.</div>`;
  }

  /* ---------- ✈️ Najít lety sem (Lety: cíl = místo, letiště do ~130 km vybere server) ---------- */
  // „geo:lat,lon|Název“ jako místo z našeptávače; „Moje okolí“ ne (tam se neletí).
  const flyTarget = p => (!p || p.geo || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon) ? null : {
    id: `geo:${(+p.lat).toFixed(4)},${(+p.lon).toFixed(4)}|${String(p.label || '').replace(/[|<>"'`]/g, '').slice(0, 60)}`,
    label: p.label, flag: p.cc ? flag(p.cc) : '📍', type: 'place',
  });
  // Termín jen, když ho uživatel v Objevuj vybral: přílet první den, odlet poslední den pobytu.
  const flyDates = s => {
    const n = s.mode === 'loop' ? s.tripDays.loop : s.mode === 'day' ? s.tripDays.day : s.days;
    return { xOut: s.start, xBack: plusDays(s.start, Math.max(1, n || 1) - 1) };
  };

  /* ---------- uložení do plánovače ---------- */
  /** Výsledek Objevuj (trasa / výlety / program) → cesta pro plánovač { name, dest, iso, start, end, days, notes }. */
  function plannerEntry({ rr, trip, plan, place: p, start }) {
    const days = {};
    let name, dates, notes = '';
    if (rr) {
      const day = start || fmtYMD(new Date());
      days[day] = routeLines(rr, p);
      notes = `${rr.train ? `Spojení vlakem: ${rr.train.idosUrl || rr.train.googleUrl}\n` : ''}Trasa v Mapy.com: ${rr.mapyUrl}\nGoogle Maps: ${rr.googleUrl}`;
      name = routeName(rr, p);
      dates = [day, day];
    } else if (trip) {
      trip.days.forEach(d => {
        days[d.date] = [...d.stops.map(x => `${tripIcon(x)} ${x.name} (příjezd ~${x.arrive})`), d.overnight ? `🛏️ Přespání: ${d.overnight.name}` : `🏁 Zpět na start (${p.label}) ~${d.back.arrive}`];
      });
      name = `${trip.mode === 'day' ? 'Výlety z' : 'Okruh z'}: ${p.label}${trip.transport === 'transit' ? ' (vlakem a busem)' : ''}`;
      dates = [trip.days[0].date, trip.days.at(-1).date];
    } else {
      plan.days.forEach(d => { if (d.items.length) days[d.date] = d.items.map(x => x.name); });
      name = `Výlet: ${p.label}`;
      dates = [plan.days[0].date, plan.days.at(-1).date];
    }
    return { name, dest: p.label, iso: typeof byIso !== 'undefined' && byIso[p.cc] ? p.cc : null, start: dates[0], end: dates[1], days, notes };
  }
  const normDest = s => String(s || '').trim().toLowerCase();
  // Cesta do stejného místa se stejným začátkem (program, výlety i kolo z jedné Barcelony = jedna cesta); jinak −1.
  const findTripFor = (trips, e) => (trips || []).findIndex(t => t && t.start && t.start === e.start && normDest(t.dest) === normDest(e.dest));
  /** Přidá řádky dnů (bez opakování), prodlouží konec a připíše poznámky; vrátí počet nových řádků. */
  function mergeInto(t, e) {
    let added = 0;
    t.days = t.days && typeof t.days === 'object' ? t.days : {};
    for (const [d, lines] of Object.entries(e.days)) {
      const have = t.days[d] || [];
      const add = lines.filter(x => !have.includes(x));
      if (add.length) { t.days[d] = [...have, ...add]; added += add.length; }
    }
    if (e.end && (!t.end || e.end > t.end)) t.end = e.end;
    if (e.notes && !String(t.notes || '').includes(e.notes)) t.notes = [t.notes, e.notes].filter(Boolean).join('\n\n');
    if (!t.iso && e.iso) t.iso = e.iso;
    return added;
  }
  const shortName = s => (s.length > 32 ? `${s.slice(0, 30).trim()}…` : s);
  const saveHtml = (i, trips) => (i >= 0
    ? `<button class="btn" id="exSave" title="${esc(`Přidat k cestě ${trips[i].name} (stejné místo a začátek)`)}">💾 Přidat k cestě ${esc(shortName(trips[i].name))}</button><button type="button" class="linkbtn ex-savenew" id="exSaveNew">uložit jako novou</button>`
    : '<button class="btn" id="exSave">💾 Uložit do plánovače</button>');
  // Hláška s tlačítkem (toast z app.js tlačítko neumí); delší, ať se na tlačítko stihne kliknout.
  function actToast(msg, label, fn) {
    const t = $('#toast');
    if (!t) return;
    t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg><span>${esc(msg)}</span><button type="button" class="toast-act">${esc(label)}</button>`;
    $('.toast-act', t).onclick = () => { t.classList.remove('show'); fn(); };
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 6000);
  }

  /* ---------- na kole a pěšky ---------- */
  const BIKE_LBL = Object.fromEntries(BIKE_TYPES);
  // „Jiná trasa“ u okruhu: server má 10 různých směrů (varianty 0–9), pak se kolečko opakuje.
  const ROUTE_VARIANTS = 10;
  const variantTxt = r => (r && r.kind !== 'train' && Number.isFinite(+r.variant) ? `varianta ${(Math.abs(Math.round(+r.variant)) % ROUTE_VARIANTS) + 1}/${ROUTE_VARIANTS}` : '');
  const kmBetween = (a, b) => {
    const r = Math.PI / 180;
    const x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r);
    return Math.hypot(x, (b[1] - a[1]) * r) * 6371;
  };
  // Výškový profil trasy (vzdálenost × nadmořská výška).
  function elevSvg(geom, col = '#22c55e') {
    const pts = geom.filter(c => c[2] != null);
    if (pts.length < 2) return '';
    const xs = [0];
    for (let i = 1; i < pts.length; i++) xs.push(xs[i - 1] + kmBetween(pts[i - 1], pts[i]));
    const total = xs.at(-1) || 1;
    const ele = pts.map(c => c[2]);
    const lo = Math.min(...ele);
    const hi = Math.max(...ele);
    const span = Math.max(40, hi - lo);
    const W = 600, H = 80;
    const line = pts.map((c, i) => `${((xs[i] / total) * W).toFixed(1)},${(H - 4 - ((c[2] - lo) / span) * (H - 12)).toFixed(1)}`).join(' ');
    return `<svg class="elev" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Výškový profil ${lo}–${hi} m n. m.">
      <polygon points="0,${H} ${line} ${W},${H}" fill="${col}" fill-opacity=".18"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
      <div class="faint elev-axis"><span>výška ${lo}–${hi} m n. m.</span><span>${Math.round(total)} km</span></div>`;
  }
  // GPX pro navigaci (Mapy.com, Garmin, Komoot, Strava…).
  function gpxOf(r, name) {
    const pts = r.geometry.map(c => `<trkpt lat="${c[1]}" lon="${c[0]}">${c[2] != null ? `<ele>${c[2]}</ele>` : ''}</trkpt>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ATLAS" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${esc(name)}</name></metadata>\n<trk><name>${esc(name)}</name><trkseg>\n${pts}\n</trkseg></trk>\n</gpx>\n`;
  }
  function downloadText(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const slug = s => String(s || 'trasa').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trasa';
  const routeName = (r, center) => (r.activity === 'hike' ? `Pěšky z: ${center.label} – ${r.km} km`
    : r.kind === 'train' ? `Na kole z: ${r.station.name} do: ${center.label} – ${r.km} km` : `Na kole z: ${center.label} – ${r.km} km`);
  // Řádky do plánovače (den výletu).
  const routeLines = (r, center) => (r.activity === 'hike' ? [`🥾 Pěšky: ${r.km} km, ↗ ${r.ascent} m, ~${minTxt(r.minutes)} chůze`]
    : r.kind === 'train' ? [`🚆 Vlakem: ${center.label} → ${r.station.name}`, `🚴 Na kole zpět: ${r.km} km, ↗ ${r.ascent} m, ~${minTxt(r.minutes)} (${BIKE_LBL[r.bike] || ''})`]
    : [`🚴 Okruh na kole: ${r.km} km, ↗ ${r.ascent} m, ~${minTxt(r.minutes)} (${BIKE_LBL[r.bike] || ''})`]);

  // Povrch a druh cesty jsou dvě různá měřítka (nezpevněná cyklotrasa patří do obou, cyklopruh vede i po rušné
  // silnici) – vedle sebe se nesčítají. Každé zvlášť jako pruh do 100 %; při překryvu má přednost varování
  // (rušnější silnice, silnice bez chodníku), zbytek je „ostatní“.
  const SURF_TIP = 'Silnice s provozem aut, u kterých mapa OpenStreetMap neuvádí chodník (nemusí ho mít zakreslený).';
  function surfaceRows(r) {
    const pc = v => Math.max(0, Math.min(100, Math.round(+v || 0)));
    const un = pc(r.unpavedPct);
    const warn = pc(r.activity === 'hike' ? r.roadPct : r.busyPct);
    const good = Math.min(pc(r.activity === 'hike' ? r.trailPct : r.cyclePct), 100 - warn);
    const way = r.activity === 'hike'
      ? [['trail', 'značené turistické trasy', good], ['other', 'ostatní cesty a ulice', 100 - warn - good], ['road', 'silnice bez chodníku', warn, SURF_TIP]]
      : [['cycle', 'cyklostezky a cyklotrasy', good], ['other', 'ostatní silnice a cesty', 100 - warn - good], ['busy', 'rušnější silnice', warn]];
    const row = (label, parts) => ({ label, parts: parts.filter(x => x[2] > 0).map(([k, name, pct, tip]) => ({ k, name, pct, tip })) });
    return [row('Povrch', [['paved', 'zpevněný', 100 - un], ['unpaved', 'nezpevněný', un]]), row('Cesta', way)];
  }
  const SURF_COL = { paved: '#94a3b8', unpaved: '#b45309', cycle: '#22c55e', trail: '#f97316', other: '#64748b', busy: '#ef4444', road: '#ef4444' };
  function surfaceHtml(r) {
    const rows = surfaceRows(r).map(({ label, parts }) => `<div class="surf-row"><span class="surf-l">${label}</span><span class="surf-bar">${
      parts.map(x => `<i style="width:${x.pct}%;background:${SURF_COL[x.k]}"></i>`).join('')}</span><span class="surf-k">${
      parts.map(x => `<span${x.tip ? ` title="${esc(x.tip)}"` : ''}><i style="background:${SURF_COL[x.k]}"></i>${x.name} ${x.pct} %</span>`).join(' · ')}</span></div>`).join('');
    // pěšky: rušnější silnice i s chodníkem (ve městě běžné) – samostatný údaj, do pruhu nepatří
    const busy = r.activity === 'hike' && r.busyPct >= 5 ? `<div class="surf-note">Podél rušnější silnice (i s chodníkem) vede ${Math.round(r.busyPct)} % trasy.</div>` : '';
    return `<div class="surf">${rows}${busy}</div>`;
  }

  // Výsledek trasy na kole (okruh / vlakem tam, na kole zpět) i pěšky; date = zvolený den (počasí na startu).
  function routeHtml(r, center, date) {
    if (!r) return '';
    const hike = r.activity === 'hike';
    const train = r.kind === 'train';
    const link = (url, txt) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${txt}</a>`;
    // u vlaku je délka jízdy zpět přijatelná v 75–135 % zvolené (nádraží nejsou všude)
    const off = train ? r.km < r.target * 0.75 || r.km > r.target * 1.35 : Math.abs(r.km - r.target) / r.target > 0.15;
    const head = [
      r.demo ? `<div class="note warn" style="margin-bottom:10px">⚠️ <div><b>DEMO data</b> – ${train ? 'nádraží i trasa jsou vymyšlené' : 'trasa je jen ukázkový kruh'}.</div></div>` : '',
      off ? `<div class="note info" style="margin-bottom:10px">ℹ️ <div>${train ? `Jízda z nádraží vyšla na ${r.km} km místo ${r.target} km – z okolních nádraží se zvolené délce přiblížit nepodařilo. Zkus „Jiné nádraží“ nebo jinou délku.`
        : `Trasa vyšla na ${r.km} km místo ${r.target} km${r.via.length ? ' – vede přes památky po cestě' : ' – v okolí se přesněji naplánovat nedala'}. Zkus „Jiná trasa“.`}</div></div>` : '',
    ].join('');
    const title = hike ? `🥾 Pěšky z: ${esc(center.label)}` : train ? `🚆 Vlakem tam, 🚴 na kole zpět · ${esc(BIKE_LBL[r.bike] || '')}` : `🚴 Okruh z: ${esc(center.label)} · ${esc(BIKE_LBL[r.bike] || '')}`;
    const st = r.station;
    const back = routeBack(r, center);
    const trainHtml = train ? `<div class="ride-train">🚆 Vlakem: <b>${esc(center.label)}</b> → <b>${esc(st.name)}</b> <span class="faint">(${Math.round(kmBetween([center.lon, center.lat], [st.lon, st.lat]))} km vzdušnou čarou)</span>
        <div>${r.train.idosUrl ? `${link(r.train.idosUrl, 'spojení na IDOS ↗')} · ` : ''}${link(r.train.googleUrl, 'spoje v Google Maps ↗')}</div></div>` : '';
    return `${head}<div class="day-plan"><h4><span>${title}</span></h4>
      ${wxSlot(train ? st : center, date, true)}
      ${sunSlot(train ? st : center, date, toHm(back.back), `Počítám se startem v 9:00${back.train ? ` (vlakem ~${minTxt(back.train)})` : ''} a s přestávkami – zpět kolem ${toHm(back.back)}.`)}
      ${trainHtml}
      <div class="bike-stats">${train ? '<span>🚴 Na kole zpět:</span>' : ''}<b>${r.km} km</b><span>↗ ${r.ascent} m stoupání</span>${train ? `<span>↘ ${r.descent ?? r.ascent} m klesání</span>` : ''}<span>⏱️ ~${minTxt(r.minutes)} ${hike ? 'chůze' : 'v sedle'}</span></div>
      ${surfaceHtml(r)}
      ${r.via.length ? `<div class="dp-walk">👀 Po cestě: ${r.via.map((v, i) => `${i + 1}. ${esc(v.name)}`).join(' · ')}</div>` : ''}
      ${elevSvg(r.geometry, routeColor(r))}
      ${train ? `<div class="note info" style="margin-top:10px">🚲 <div>Kolo ve vlaku obvykle potřebuje vlastní jízdenku${st.cc === 'CZ' ? ' (v Česku „jízdní kolo“ jako spoluzavazadlo)' : ''} a některé vlaky vyžadují rezervaci místa pro kolo – ověř to u konkrétního spoje.</div></div>` : ''}
      <div class="row wrap" style="gap:8px;margin-top:10px">
        <button class="btn" id="routeOther">🔄 ${train ? 'Jiné nádraží' : 'Jiná trasa'}</button>${variantTxt(r) ? `<span class="faint route-var">${variantTxt(r)}</span>` : ''}
        <button class="btn" id="routeGpx">⬇️ Stáhnout GPX</button>
        <a class="btn" href="${esc(safeUrl(r.mapyUrl))}" target="_blank" rel="noopener">Otevřít v Mapy.com ↗</a>
        <a class="btn" href="${esc(safeUrl(r.googleUrl))}" target="_blank" rel="noopener">Google Maps ↗</a>
      </div></div>
      <div class="faint" style="font-size:11.5px;margin-top:6px">${hike
        ? 'Trasa: BRouter (profil pěší turistiky) nad mapou © OpenStreetMap. Čas chůze podle turistického vzorce DIN 33466 (4 km/h, 300 m stoupání a 500 m klesání za hodinu), bez přestávek. „Spíš rovina“ se vyhýbá stoupání, „Do kopců“ dává přednost pěšinám a horským stezkám (kopce ale plánovač sám nevyhledá).'
        : `${train ? 'Nádraží: Wikidata. ' : ''}Trasa: BRouter (brouter.de) nad mapou © OpenStreetMap. Čas je odhad podle kola a převýšení, bez zastávek.`}
        GPX nahraješ do Mapy.com, Garminu, Komootu či Stravy; odkazy do Mapy.com a Google Map vedou trasu přes několik bodů, takže se může mírně lišit.</div>`;
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

  // Pořadí dotazů zvlášť pro každý plán (město, výlety autem, vlakem…): starší odpověď téhož plánu
  // se zahodí, odpověď jiného plánu se uloží.
  const replanSeq = {};
  // Právě plánované (klíč jako replanSeq): { my, kind, t0, other, note } – čekání ve výsledku vydrží i překreslení.
  const busy = {};
  const curKey = () => (ex.mode === 'bike' ? (ex.bike.kind === 'train' ? 'train' : 'bike') : ex.mode === 'hike' ? 'hike'
    : ex.mode === 'day' || ex.mode === 'loop' ? tripKey(ex.mode, ex.transport) : 'city');
  const keyKind = key => (key === 'city' ? 'city' : key === 'train' ? 'train' : key === 'bike' || key === 'hike' ? 'route' : 'trips');
  const BTN_BUSY = { city: 'Skládám…', trips: 'Hledám cíle výletů…', train: 'Hledám nádraží a trasu…', route: 'Plánuju trasu…' };
  const KEPT = { city: 'Níže je předchozí program.', trips: 'Níže jsou předchozí výlety.', train: 'Níže zůstává předchozí trasa.', route: 'Níže zůstává předchozí trasa.' };
  // Čekání ve výsledku: řádek se spinnerem nahoře (po SLOW_MS s vysvětlením), dosavadní výsledek pod ním zešedne.
  function showBusy() {
    const out = $('#exPlanOut');
    if (!out) return;
    const b = busy[curKey()];
    const row = $(':scope > .ex-busy', out);
    out.classList.toggle('stale', Boolean(b));
    if (!b) { row?.remove(); return; }
    const html = waitHtml(b.kind, Date.now() - b.t0 >= SLOW_MS, '', b.note);
    if (row) row.outerHTML = html; else out.insertAdjacentHTML('afterbegin', html);
  }
  // Změna zájmů, tempa, „chci vidět“ nebo okruhu přeplánuje hotový plán – po krátké pauze (rychlé klikání = jeden dotaz).
  let soonT = null;
  const replanSoon = key => {
    clearTimeout(soonT);
    soonT = setTimeout(() => { if (curKey() === key && ex.replanNow) ex.replanNow(); }, 400);
  };
  const mustHtml = n => (n ? `★ ${mustTxt(n)} <button type="button" class="linkbtn" data-mustclear>zrušit výběr</button>` : '');
  // Prázdný okruh: rovnou největší okruh (jeden dotaz, menší pak filtruje prohlížeč) a u programu ve městě
  // tip na režimy, které fungují i bez památek v okolí.
  const MAX_R = RADII.at(-1);
  const emptyHtml = (radius, mode) => `<div class="empty" style="padding:26px 12px">V okruhu ${radius} km jsem nic zajímavého nenašel.${
    radius < MAX_R ? `<div style="margin-top:12px"><button type="button" class="btn sm" data-rad="${MAX_R}">Zvětšit okruh na ${MAX_R} km</button></div>` : ''}${
    mode === 'city' ? `<div class="ex-alt"><span>I tady naplánuju:</span>${MODES.filter(([id]) => ['day', 'bike', 'hike'].includes(id)).map(([id, l]) => `<button type="button" class="fchip" data-mode="${id}">${l}</button>`).join('')}</div>` : ''}</div>`;

  function paintExplore() {
    const body = $('#exBody'); if (!body) return;
    const p = ex.place;
    hideBack(); // po překreslení původní pozice v seznamu neplatí
    ex.items = inRadius(ex.all, ex.radius);
    const cats = [...new Set(ex.items.map(x => x.category))];
    if (ex.cat && !cats.includes(ex.cat)) ex.cat = ''; // filtr kategorie, která v okruhu už není
    const list = ex.items.filter(x => !ex.cat || x.category === ex.cat);
    const cityN = ex.items.filter(x => x.category !== 'daytrip').length;
    const tripN = ex.items.length - cityN;
    const st = ex.planState || (ex.planState = { interests: ex.interests, pace: ex.pace, exclude: new Set(), must: new Set(), items: [], map: null });
    const bikeMode = ex.mode === 'bike';
    const hikeMode = ex.mode === 'hike';
    const routeMode = bikeMode || hikeMode;
    const road = ex.mode === 'day' || ex.mode === 'loop';
    const trip = road ? ex.trips[tripKey(ex.mode, ex.transport)] : null;
    // Volby a trasa kola / pěšky; okruh a „vlakem tam“ mají každý svou trasu.
    const ro = hikeMode ? ex.hike : ex.bike;
    const train = bikeMode && ex.bike.kind === 'train';
    const rr = hikeMode ? ex.hikeRoute : train ? ex.trainRoute : bikeMode ? ex.bikeRoute : null;
    const seqKey = curKey();
    const kind = keyKind(seqKey);
    const bz = busy[seqKey];
    const er = ex.errs[seqKey];
    const dayOpts = ex.mode === 'loop' ? [2, 3, 4, 5, 6, 7, 10] : ex.mode === 'day' ? [1, 2, 3, 4, 5, 7] : [1, 2, 3, 4, 5, 6, 7, 10];
    const curDays = road ? ex.tripDays[ex.mode] : ex.days;
    // Program bez jediného místa (prázdný okruh) se neukládá a místo dnů „Volno“ řekne proč.
    const cityPlan = Boolean(ex.plan?.days.some(d => d.items.length));
    const hasPlan = routeMode ? rr : road ? trip && trip.days.length : cityPlan;
    const out = routeMode ? routeHtml(rr, p, ex.start) : road ? tripHtml(trip, p) : !ex.plan ? ''
      : cityPlan ? planHtml(ex.plan, p) : `<div class="empty" style="padding:18px 12px">Program není z čeho sestavit – v okruhu ${ex.radius} km nejsou žádná místa.</div>`;
    const inPlan = ex.mode === 'city' ? planIds(ex.plan) : new Set();
    // V režimu výletů jde z výpisu přidat jen výlet mimo město (do programu ve městě patří ostatní).
    const card = x => (road
      ? poiCard(x, x.category === 'daytrip' ? { tripToggle: true, center: p } : { center: p })
      : routeMode ? poiCard(x, { center: p }) : poiCard(x, { toggle: true, must: st.must, inPlan, center: p }));
    const segBtns = (list, attr, cur) => list.map(([id, l]) => `<button type="button" ${attr}="${id}" class="${cur === id ? 'on' : ''}">${l}</button>`).join('');
    const saveBtn = hasPlan ? saveHtml(findTripFor(S.trips, plannerEntry({ rr, trip, plan: ex.plan, place: p, start: ex.start })), S.trips) : '';
    const planLbl = routeMode ? 'Naplánovat trasu' : road ? 'Naplánovat výlet' : 'Sestavit program';
    const planBtn = `<button class="btn primary" id="exPlan"${bz ? ' disabled' : ''}>${bz && !bz.other ? `<span class="spin"></span> ${BTN_BUSY[kind]}` : planLbl}</button>`;
    // Vlakem tam: jízda nevede přes památky, „městem“ = smíšeně.
    const scen = train ? BIKE_SCENERY.filter(([id]) => id !== 'city') : BIKE_SCENERY;
    const routeCtl = `${bikeMode ? `<div class="seg wrap" style="margin:0 0 10px">${segBtns(BIKE_KINDS, 'data-bkind', ex.bike.kind)}</div>` : ''}
        <div class="row wrap" style="gap:10px;align-items:end">
          <div class="field" style="margin:0"><label>Kdy</label><input class="input" type="date" id="exStart" value="${ex.start}"></div>
          <div class="field" style="margin:0"><label>${train ? 'Délka jízdy zpět' : 'Délka okruhu'}</label><select id="routeKm">${(hikeMode ? [5, 8, 10, 12, 15, 20, 25, 30] : [15, 25, 40, 60, 80, 100, 130]).map(n => `<option value="${n}" ${ro.km === n ? 'selected' : ''}>${n} km</option>`).join('')}</select></div>
          ${planBtn}${saveBtn}
        </div>
        ${bikeMode ? `<div class="row wrap" style="gap:8px;margin:10px 0 0"><div class="seg wrap">${segBtns(BIKE_TYPES, 'data-bike', ex.bike.bike)}</div></div>` : ''}
        <div class="row wrap" style="gap:8px;margin:10px 0"><div class="seg wrap">${segBtns(scen, 'data-scen', train && ro.scenery === 'city' ? 'mixed' : ro.scenery)}</div><div class="seg wrap">${segBtns(BIKE_HILLS, 'data-hills', ro.hills)}</div></div>`;
    // Chyba přímo ve výsledku (se „Zkusit znovu“), čekání nahoře nad dosavadním výsledkem.
    const errNote = er ? errHtml(errLead(kind, er.other), er.msg, 'exRetry', out ? KEPT[kind] : '') : '';
    const wait = bz ? waitHtml(bz.kind, Date.now() - bz.t0 >= SLOW_MS, '', bz.note) : '';
    const empty = cityN ? '<div class="empty">Nic v této kategorii.</div>' : emptyHtml(ex.radius, ex.mode);
    const placesIn = `${cats.length ? `<div class="ex-cats"><button type="button" data-cat="" class="${!ex.cat ? 'on' : ''}">Vše</button>${cats.map(c => `<button type="button" data-cat="${c}" class="${ex.cat === c ? 'on' : ''}">${icon(c)} ${(CAT[c] || CAT.sight)[1]}</button>`).join('')}</div>` : ''}
        <div class="poi-list" id="exList">${list.map(card).join('') || empty}</div>`;
    // Na kole, pěšky a u výletů je hlavní výsledek trasa na mapě – seznam míst ve městě je sbalený.
    const places = ex.mode === 'city' ? `<div class="ex-places">${placesIn}</div>`
      : `<details class="more ex-places" id="exPlaces"${ex.listOpen ? ' open' : ''}><summary>📍 Místa v okolí (${ex.items.length})</summary>${placesIn}</details>`;
    body.innerHTML = `${ex.demo ? '<div class="note warn" style="margin-bottom:12px">⚠️ <div><b>DEMO data</b> – místa jsou vymyšlená.</div></div>' : ''}
      <div class="section-head ex-head" style="margin-top:6px"><h2>${p.cc ? flag(p.cc) : '📍'} ${esc(p.label)} · ${placesTxt(cityN)} do ${ex.radius} km${tripN ? ` <span class="ex-head-more">+ ${plural(tripN, 'výlet', 'výlety', 'výletů')}</span>` : ''}</h2>${
        window.Flights && flyTarget(p) ? '<button type="button" class="btn sm ghost" id="exFly">✈️ Najít lety sem</button>' : ''}</div>
      <div class="ex-layout ex-main">
      <div class="card step-card ex-plan"><h3>🗓️ Naplánovat</h3>
        <div class="seg wrap" id="exMode" style="margin:4px 0 12px">${modeBtns(ex.mode)}</div>
        <div class="muted" style="font-size:13px;margin:-4px 0 10px">${ex.mode === 'city' ? 'Pěší program po památkách – každý den jiná část města.'
          : train ? `Vlakem z místa (${esc(p.label)}) na nádraží v dosahu zvolené délky jízdy a na kole zpátky: zvol délku, kolo a krajinu. Najdu nádraží, trasu domů a odkaz na spojení vlakem.`
          : bikeMode ? `Okruh na kole ze startu (${esc(p.label)}) a zpět: zvol délku, kolo a krajinu. Trasa vede hlavně po cyklostezkách a klidných cestách.`
          : hikeMode ? `Pěší okruh ze startu (${esc(p.label)}) a zpět: zvol délku, krajinu a kopce. Plánovač dává přednost pěšinám, turistickým trasám a klidným cestám.`
          : ex.mode === 'day' ? `Ráno ${ex.transport === 'transit' ? 'vlakem nebo busem' : 'autem'} ven, večer zpátky: města, hrady a příroda do ~${ex.transport === 'transit' ? '3' : '2,5'} h cesty. Každý výlet jiný.`
          : `Okruh ${ex.transport === 'transit' ? 'vlakem a autobusem' : 'autem'} s přespáním po cestě – každý den pár zastávek, poslední den zpět na start.`}</div>
        ${routeMode ? routeCtl : `<div class="row wrap" style="gap:10px;align-items:end">
          <div class="field" style="margin:0"><label>Od</label><input class="input" type="date" id="exStart" value="${ex.start}"></div>
          <div class="field" style="margin:0"><label>${ex.mode === 'day' ? 'Počet výletů' : 'Počet dní'}</label><select id="exDays">${dayOpts.map(n => `<option ${curDays === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          ${planBtn}${road ? '' : `<span class="ex-mustn" id="exMustN">${mustHtml(st.must.size)}</span>`}${saveBtn}
        </div>${road ? `<div class="row wrap" style="gap:8px;margin:10px 0"><div class="seg" id="exTransport">${TRANSPORTS.map(([id, l]) => `<button type="button" data-transport="${id}" class="${ex.transport === id ? 'on' : ''}">${l}</button>`).join('')}</div><select data-pace style="width:auto;padding:7px 30px 7px 10px;font-size:12.5px">${[['relaxed', '🐢 V klidu'], ['normal', '🚶 Normálně'], ['intense', '🏃 Nabitě']].map(o => `<option value="${o[0]}" ${ex.pace === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>
        <div class="row wrap" style="gap:8px;margin:0 0 10px"><span class="faint" style="font-size:12.5px;align-self:center">Co tě láká:</span>${TRIP_INTERESTS.map(([id, l]) => `<button type="button" class="fchip ${ex.tripInterests.has(id) ? 'on' : ''}" data-tint="${id}">${l}</button>`).join('')}</div>` : plannerControls(st)}`}
        <div id="exPlanOut" class="${bz ? 'stale' : ''}">${wait}${errNote}${out}</div></div>
      <div id="exMapSlot"></div>
      ${places}
      </div>
      <div class="faint" style="font-size:11.5px;margin-top:10px">Zdroj: Wikidata a Wikipedie (CC BY-SA), mapa © OpenFreeMap, OpenMapTiles, OpenStreetMap. ${WX_SRC}. Otevírací doby ověř na webu místa.</div>`;
    fillWx($('#exPlanOut', body));
    const ms = exploreMap(p);
    $('#exMapSlot', body).replaceWith(ms.el);
    if (ms.map) ms.map.resize();
    st.map = ms;
    if (bz) { const b = $('#routeOther', body); if (b) { b.disabled = true; if (bz.other) b.innerHTML = `<span class="spin"></span> ${BTN_BUSY[kind]}`; } }
    // Klik na značku: kartu zvýrazní; vedle mapy (počítač) k ní i odroluje, na telefonu stačí bublina na mapě.
    const hl = x => {
      const el = $(`#exPlanOut [data-poi="${CSS.escape(x.id)}"]`) || $(`#exList [data-poi="${CSS.escape(x.id)}"]`);
      if (!el) return;
      if (!stacked()) {
        const det = el.closest('details');
        if (det) det.open = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      flash(el);
    };
    if (rr) drawRoute(st, p, rr);
    else if (trip) drawTrips(st, p, trip, hl);
    // u programu i zastávky mimo načtený seznam (připnuté, za okruhem)
    else if (ex.mode === 'city' && ex.plan) drawOnMap(st, p, withPlanStops(ex.items, ex.plan), ex.plan, hl);
    else drawOnMap(st, p, list, null, hl);
    // Na mapě je jen to, co je na ní nakreslené. Bez značky (kolo, pěšky, výlety) se karta aspoň zvýrazní
    // a nabídne odkaz do Google Map.
    const focus = (x, el, what) => {
      if (x && ms.byId?.has(x.id)) { focusOnMap(ms, x); bringMap(ms, what); return; }
      if (!el) return;
      flash(el);
      const a = $('[data-gm]', el);
      if (a) { a.classList.add('go'); setTimeout(() => a.classList.remove('go'), 2500); }
    };
    const on = (sel, ev, fn) => { const el = $(sel, body); if (el) el[ev] = fn; };
    $$('[data-cat]', body).forEach(b => b.onclick = () => { ex.cat = b.dataset.cat; paintExplore(); });
    $$('[data-rad]', body).forEach(b => b.onclick = () => setRadius(+b.dataset.rad));
    on('#exPlaces', 'ontoggle', e => { ex.listOpen = e.target.open; });
    $$('[data-mode]', body).forEach(b => b.onclick = () => { if (ex.mode !== b.dataset.mode) { ex.mode = b.dataset.mode; paintExplore(); } });
    $$('[data-transport]', body).forEach(b => b.onclick = () => { if (ex.transport !== b.dataset.transport) { ex.transport = b.dataset.transport; paintExplore(); } });
    // Vyřazení / přidání cíle nebo jiné zájmy platí pro všechny výlety – ostatní uložené plány (jiný režim, doprava)
    // by je ještě neměly, proto se zahodí a při přepnutí se naplánují znovu.
    const onlyThisTrip = () => { for (const k of Object.keys(ex.trips)) if (k !== seqKey) delete ex.trips[k]; };
    $$('[data-tint]', body).forEach(b => b.onclick = () => {
      const id = b.dataset.tint;
      ex.tripInterests.has(id) ? ex.tripInterests.delete(id) : ex.tripInterests.add(id);
      b.classList.toggle('on', ex.tripInterests.has(id));
      remember();
      onlyThisTrip();
      if (trip) replanSoon(seqKey); // zobrazený plán se přeplánuje (i po víc kliknutích jen jednou)
    });
    $$('#exList [data-poi]', body).forEach(c => c.onclick = () => focus(ex.items.find(i => i.id === c.dataset.poi), c, 'seznam'));
    $$('#exPlanOut [data-poi]', body).forEach(c => c.onclick = e => {
      if (e.target.closest('a,button')) return;
      const pool = trip ? [...trip.days.flatMap(d => d.stops), ...trip.spare] : [...(ex.plan?.days || []).flatMap(d => d.items), ...st.items, ...ex.items];
      focus(pool.find(i => i.id === c.dataset.poi), c, 'plán');
    });
    // „Chci vidět“: počítadlo u „Sestavit program“; hotový program se přeplánuje sám.
    const wireMustClear = () => on('[data-mustclear]', 'onclick', () => { st.must.clear(); paintExplore(); if (ex.plan) replanSoon('city'); });
    wireMustClear();
    $$('[data-must]', body).forEach(b => b.onclick = e => {
      e.stopPropagation();
      const id = b.dataset.must;
      if (st.must.has(id)) st.must.delete(id); else { st.must.add(id); st.exclude.delete(id); }
      const sel = st.must.has(id);
      b.classList.toggle('on', sel);
      b.setAttribute('aria-pressed', String(sel));
      b.textContent = sel ? '★ chci vidět' : '+ chci vidět';
      on('#exMustN', 'innerHTML', mustHtml(st.must.size));
      wireMustClear();
      if (ex.plan) replanSoon('city');
    });
    $$('[data-int]', body).forEach(b => b.onclick = () => {
      st.interests.has(b.dataset.int) ? st.interests.delete(b.dataset.int) : st.interests.add(b.dataset.int);
      b.classList.toggle('on');
      remember();
      if (ex.plan) replanSoon('city');
    });
    on('[data-pace]', 'onchange', e => { st.pace = e.target.value; ex.pace = e.target.value; remember(); if (road ? trip : ex.plan) replanSoon(seqKey); });
    on('#exStart', 'onchange', e => {
      ex.start = e.target.value;
      ex.datePicked = true; // „Najít lety sem“ pak hledá přesně v termínu
      remember();
      // Trasa kola / pěšky na datu nezávisí – stačí k ní doplnit počasí nově zvoleného dne.
      const wx = rr && $('#exPlanOut .wx-day', body);
      if (!wx) return;
      const [lat, lon] = wx.dataset.wx.split(',');
      wx.dataset.wx = wxKey({ lat, lon }, ex.start);
      wx.innerHTML = '';
      wx.hidden = false;
      const sun = $('#exPlanOut [data-sun]', body);
      if (sun) { const [a, b, , ret] = sun.dataset.sun.split(','); sun.dataset.sun = [a, b, ex.start, ret].join(','); sun.innerHTML = ''; }
      fillWx(wx.parentNode);
    });
    on('#exDays', 'onchange', e => { if (road) ex.tripDays[ex.mode] = +e.target.value; else ex.days = +e.target.value; remember(); });
    // Kolo a pěšky: volby platí pro příští „Naplánovat trasu“ (jiná volba = zase první varianta trasy).
    on('#routeKm', 'onchange', e => { ro.km = +e.target.value; ro.variant = 0; remember(); });
    for (const [attr, key] of [['data-bike', 'bike'], ['data-scen', 'scenery'], ['data-hills', 'hills']]) {
      $$(`[${attr}]`, body).forEach(b => b.onclick = () => {
        ro[key] = b.getAttribute(attr);
        ro.variant = 0;
        $$(`[${attr}]`, body).forEach(x => x.classList.toggle('on', x === b));
        remember();
      });
    }
    // Okruh / vlakem tam: jiné popisky i volby, každý režim ukazuje svou trasu.
    $$('[data-bkind]', body).forEach(b => b.onclick = () => {
      if (ex.bike.kind === b.dataset.bkind) return;
      ex.bike.kind = b.dataset.bkind;
      ex.bike.variant = (ex.bike.kind === 'train' ? ex.trainRoute : ex.bikeRoute)?.variant || 0;
      paintExplore();
    });
    const mode = ex.mode;
    const transport = ex.transport;
    // o.other = „Jiná trasa“ / „Jiné nádraží“: další varianta se zapamatuje až po úspěchu (chyba = zkusit znovu tutéž).
    const replan = async (btn, o = {}) => {
      const key = seqKey;
      clearTimeout(soonT); // čekající odložené přeplánování by poslalo totéž znovu
      const my = replanSeq[key] = (replanSeq[key] || 0) + 1; // jen poslední dotaz smí vykreslit (rychlé klikání na ✕ / +)
      delete ex.errs[key];
      const b0 = busy[key] = { my, kind, t0: Date.now(), other: Boolean(o.other) };
      // Spinner v tlačítku i ve výsledku (tlačítko bývá na telefonu po odrolování mimo obrazovku).
      $$('#exPlan, #routeOther', body).forEach(x => { x.disabled = true; });
      if (btn) btn.innerHTML = `<span class="spin"></span> ${BTN_BUSY[kind]}`;
      $('#exPlanOut .ex-err', body)?.remove();
      showBusy();
      const slowT = setTimeout(showBusy, SLOW_MS);
      const note = txt => { b0.note = txt; if (busy[key] === b0) showBusy(); if (btn?.isConnected) btn.innerHTML = `<span class="spin"></span> ${esc(txt)}`; };
      let ok = false;
      try {
        if (routeMode) {
          const variant = o.other ? (ro.variant + 1) % ROUTE_VARIANTS : ro.variant;
          // Městem: památky, které už jsou načtené (server je nemusí hledat znovu).
          const sights = ro.scenery === 'city' && !train ? ex.items.filter(x => x.category !== 'daytrip').slice(0, 40).map(x => ({ name: x.name, lat: x.lat, lon: x.lon, score: x.score })) : undefined;
          // Vlakem tam: název a země domova pro odkaz na spojení (u „Moje okolí“ název není).
          const home = train ? { label: p.geo ? '' : p.label, cc: p.cc || '' } : {};
          const ask = () => getJson(hikeMode ? 'api/hike' : 'api/bike', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: p.lat, lon: p.lon, ...ro, variant, ...home, sights }) });
          // Nádraží z Wikidat napoprvé (prázdná mezipaměť) občas nestihnou – jednou to zkusím znovu jako u výletů.
          const r = await ask().catch(e => {
            if (!train || e.status !== 503) throw e;
            note('Odpověď trvá déle – zkouším znovu…');
            return ask();
          });
          if (my !== replanSeq[key] || ex.place !== p) return;
          // u vlaku server mohl přeskočit nádraží s nevhodnou délkou – „Jiné nádraží“ pokračuje za tím ukázaným
          ro.variant = r.kind === 'train' && ro.kind === 'train' ? r.variant : variant;
          if (hikeMode) ex.hikeRoute = r; else if (r.kind === 'train') ex.trainRoute = r; else ex.bikeRoute = r;
        } else if (road) {
          // Po uspání serveru (prázdná mezipaměť) Wikidata napoprvé často nestihne – dotazy ale běží dál,
          // takže hned druhý pokus už většinou projde.
          const t = await makeTrip(p, mode, transport).catch(e => {
            if (e.status !== 503) throw e;
            note('Wikidata odpovídá pomalu – zkouším znovu…');
            return makeTrip(p, mode, transport);
          });
          if (my !== replanSeq[key] || ex.place !== p) return; // mezitím jiné místo nebo novější dotaz
          ex.trips[key] = t;
        } else {
          // Okruh: server vezme seznam z mezipaměti (načtený okruh) a místa za zvoleným okruhem vynechá.
          const km = ex.radius;
          const plan = await makePlan(st, p, { start: ex.start, end: plusDays(ex.start, ex.days - 1), arrivalTime: '09:00', departureTime: null },
            { radius: ex.loaded?.radius || km, exclude: [...st.exclude, ...outsideIds(ex.all, km, st.must)] });
          if (my !== replanSeq[key] || ex.place !== p) return;
          plan.radius = km;
          ex.plan = plan;
        }
        ok = true;
      } catch (e) {
        if (my !== replanSeq[key] || ex.place !== p) return;
        ex.errs[key] = { msg: e.message, other: Boolean(o.other) };
      } finally {
        clearTimeout(slowT);
        if (busy[key] === b0) delete busy[key];
      }
      if (curKey() !== key) return; // uložené, ale uživatel přepnul režim
      paintExplore();
      if (!ok) $('#exPlanOut .ex-err')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      else if (btn) $('#exPlanOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    ex.replanNow = () => replan();
    $('#exPlan', body).onclick = () => replan($('#exPlan'));
    on('#routeOther', 'onclick', () => replan($('#routeOther'), { other: true }));
    on('#exRetry', 'onclick', () => replan(null, { other: er?.other }));
    on('#routeGpx', 'onclick', () => downloadText(`atlas-${hikeMode ? 'pesky' : rr.kind === 'train' ? 'vlak-kolo' : 'kolo'}-${slug(p.label)}-${rr.km}km.gpx`, gpxOf(rr, routeName(rr, p)), 'application/gpx+xml'));
    $$('[data-drop]', body).forEach(b => b.onclick = () => { st.exclude.add(b.dataset.drop); st.must.delete(b.dataset.drop); replan(); });
    $$('[data-tdrop]', body).forEach(b => b.onclick = () => { ex.tripEx.add(b.dataset.tdrop); ex.tripMust.delete(b.dataset.tdrop); onlyThisTrip(); replan(); });
    $$('[data-tmust]', body).forEach(b => b.onclick = e => { e.stopPropagation(); ex.tripMust.add(b.dataset.tmust); ex.tripEx.delete(b.dataset.tmust); onlyThisTrip(); replan(); });
    // Uložení: zůstává se v Objevuj (toast s „Otevřít v plánovači“); cesta do stejného místa se stejným začátkem
    // v plánovači už je → přidá se k ní (bez opakování řádků), „jako novou“ založí další.
    const store = asNew => {
      const entry = plannerEntry({ rr, trip, plan: ex.plan, place: p, start: ex.start });
      const i = asNew ? -1 : findTripFor(S.trips, entry);
      let t = S.trips[i];
      if (t) mergeInto(t, entry);
      else S.trips.push(t = { ...entry, pax: '2', budget: '', checklist: PACK.map(x => ({ t: x, done: false })) });
      save();
      $$('#exSave, #exSaveNew', body).forEach(b => { b.disabled = true; });
      const sv = $('#exSave', body);
      if (sv) sv.textContent = '✓ Uloženo';
      $('#exSaveNew', body)?.remove();
      actToast(i >= 0 ? `Přidáno k cestě ${t.name}` : 'Uloženo do plánovače', 'Otevřít v plánovači', () => {
        go('planner');
        setTimeout(() => { const j = S.trips.indexOf(t); if (j >= 0 && typeof openTrip === 'function') openTrip(j); }, 250);
      });
    };
    on('#exSave', 'onclick', () => store(false));
    on('#exFly', 'onclick', () => window.Flights && Flights.searchTo([flyTarget(p)], ex.datePicked ? flyDates(ex) : {}));
    on('#exSaveNew', 'onclick', () => store(true));
    remember();
    // Program pro jiný okruh (okruh se mezitím změnil) se přeplánuje sám – jen když zrovna neběží a neselhal.
    if (ex.mode === 'city' && ex.plan && ex.plan.radius != null && ex.plan.radius !== ex.radius && !bz && !er) replanSoon('city');
  }

  // Přepnutí světlý/tmavý režim: otevřené mapy dostanou odpovídající styl (rastrová záloha zůstane).
  function retheme() {
    const dark = document.documentElement.dataset.map === 'dark'; // světlá/tmavá mapa (app.js), ne režim aplikace
    for (const m of liveMaps) {
      const ms = m.atlasState;
      if (!ms || ms.raster || !document.body.contains(m.getContainer())) continue;
      ms.styleReady = false;
      m.setStyle(OFM + (dark ? 'dark' : 'liberty'), { diff: false });
    }
  }

  window.Places = {
    renderExplore, renderPlanner, retheme, routeMap,
    // jen pro testy (test/places-ui.test.js)
    _t: { plural, placesTxt, mustTxt, inRadius, needsFetch, outsideIds, planIds, withPlanStops, enterAction, sugHtml, waitHtml, errLead, errHtml, httpErr, mustBtn, poiCard,
      uiSnapshot, uiRestore, pushRecent, samePlace, cleanPlace, getJson, firstSentence, descHtml, inclHtml, gq, poiQ, centerQ, gmDir, dayLbl, slug, gpxOf, SLOW_MS, UI_LS,
      countryCs, stopQ, mapyDir, dayLinks, planHtml, tripHtml, MAPY_WP, emptyHtml, variantTxt, routeHtml, ROUTE_VARIANTS, blankHtml, looksEnglish, surfaceRows, surfaceHtml,
      afterDark, routeBack, sunSlot, sunHtml, fillSun, toHm, modeBtns,
      plannerEntry, findTripFor, mergeInto, saveHtml, flyTarget, flyDates },
  };
})();
