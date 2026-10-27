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
  // far = místa v okolí pro okruh 50/100 km ({ place, items, busy, err }), country = přehled země ({ place, data, busy, err }),
  // lastKm = okruh v km před přepnutím na celou zemi
  const ex = { place: null, all: [], items: [], loaded: null, far: null, country: null, lastKm: 10, cat: '', cCat: 'all', radius: 10, plan: null, interests: new Set(), pace: 'normal', days: 3, start: '', mode: 'city', transport: 'car', trips: {}, tripDays: { day: 2, loop: 4 }, tripEx: new Set(), tripMust: new Set(), tripInterests: new Set(), ms: null,
    errs: {}, recent: [], listOpen: false, restored: false,
    bike: { km: 40, bike: 'trekking', scenery: 'mixed', hills: 'normal', variant: 0, kind: 'loop' }, bikeRoute: null, trainRoute: null,
    hike: { km: 10, scenery: 'mixed', hills: 'normal', variant: 0, kind: 'loop' }, hikeRoute: null, hikePlan: null, hikeEx: new Set() };
  const TRIP_INTERESTS = [['towns', '🏘️ Města'], ['sights', '🏰 Památky'], ['culture', '🏛️ Poznávací'], ['nature', '🌲 Příroda'], ['spa', '♨️ Lázně'], ['kids', '🧒 S dětmi']];
  const MODES = [['city', '🏙️ Program ve městě'], ['day', '🎒 Jednodenní výlety'], ['loop', '🧭 Vícedenní okruh'], ['bike', '🚴 Na kole'], ['hike', '🥾 Pěšky']];
  // Na telefonu přepínač režimů v jednom řádku: ikona nad krátkým názvem (celý název přečte čtečka).
  const MODE_SHORT = { city: 'Město', day: 'Výlety', loop: 'Okruh', bike: 'Kolo', hike: 'Pěšky' };
  const modeBtns = cur => MODES.map(([id, l]) => {
    const [ico, ...rest] = l.split(' ');
    return `<button type="button" data-mode="${id}" class="${cur === id ? 'on' : ''}" aria-label="${rest.join(' ')}"><span class="m-long">${l}</span><span class="m-short"><b>${ico}</b>${MODE_SHORT[id]}</span></button>`;
  }).join('');
  const BIKE_KINDS = [['loop', '🔁 Okruh'], ['train', '🚆 Vlakem tam, na kole zpět']];
  // Pěšky: jeden okruh, nebo na každý den pobytu jiná túra (hory a příroda – server/lib/hikeplan.js)
  const HIKE_KINDS = [['loop', '🔁 Jeden okruh'], ['days', '🗓️ Túra na každý den']];
  const BIKE_TYPES = [['road', '🏎️ Silniční'], ['trekking', '🚲 Trek / město'], ['gravel', '🪨 Gravel'], ['mtb', '🚵 Horské']];
  const BIKE_SCENERY = [['city', '🏙️ Městem'], ['mixed', '🔀 Smíšeně'], ['nature', '🌲 Přírodou']];
  const BIKE_HILLS = [['flat', '〰️ Spíš rovina'], ['normal', '⛰️ Normálně'], ['hilly', '🏔️ Do kopců']];
  const TRANSPORTS = [['car', '🚗 Autem'], ['transit', '🚆 Vlakem a busem']];

  const icon = c => (CAT[c] || CAT.sight)[0];
  // ikona místa: mešita a synagoga (serverový popis kategorie church) ne ⛪
  const picon = p => (p.categoryLabel === 'Mešita' ? '🕌' : p.categoryLabel === 'Synagoga' ? '🕍' : icon(p.category));
  const color = c => (CAT[c] || CAT.sight)[2];
  const plusDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtYMD(d); };
  // nezlomitelné mezery: „ne 11. 10.“ se na telefonu nerozdělí na dva řádky
  const dayLbl = ymd => { const d = new Date(ymd + 'T12:00:00'); return `${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][d.getDay()]}\u00a0${d.getDate()}.\u00a0${d.getMonth() + 1}.`; };
  // desetinná čárka („0,6 km“), ne tečka
  const num = x => String(x).replace('.', ',');
  // číslo a jednotka nezlomitelně („30 min“, „1 h“ – na telefonu ne „30“ a „min“ na dalším řádku)
  const minTxt = m => m >= 60 ? `${Math.floor(m / 60)}\u00a0h${m % 60 ? ' ' + (m % 60) + '\u00a0min' : ''}` : `${m}\u00a0min`;
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
    ? 'Server se právě probouzí nebo je přetížený – zkus to za chvíli znovu.' : status >= 500 ? 'Na serveru se něco pokazilo – zkus to prosím za chvíli znovu.'
      : status === 429 ? 'Příliš mnoho požadavků za krátkou dobu – zkus to prosím za pár minut.' : 'Server požadavek nepřijal – zkus to prosím znovu.');
  async function getJson(url, opts) {
    let r;
    try {
      r = await fetch(url, opts);
    } catch (e) {
      // zrušené, a česká hláška z pwa.js („Jsi offline“, server nedostupný, nic přes 2 min) – i s e.offline (Pwa.whenOnline)
      if (e.name === 'AbortError' || e.name === 'NetworkError') throw e;
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
  const RADII = [3, 5, 10, 20, 50, 100];
  // Okruh 50 a 100 km: místa ve městě do CITY_KM (dotaz na město víc nesnese – server ho omezuje na 25 km) a k nim
  // nejzajímavější místa v okolí do zvoleného okruhu (cíle výletů, api/poi/trips). COUNTRY = 🌍 celá země (api/poi/country).
  const CITY_KM = 20;
  const COUNTRY = 'country';
  // „Co hledáš?“: Vše / města / památky / příroda filtrují načtený přehled, ostatní (hory, pláže…) se načtou až po
  // výběru (api/poi/country?cat=) – k nim cíle Wikivoyage stejného druhu
  const CC_CATS = [['all', 'Vše'], ['city', '🏙️ Města'], ['unesco', '🏛️ Památky a UNESCO'], ['nature', '🏞️ Příroda a národní parky'], ['mountain', '⛰️ Hory'],
    ['beach', '🏖️ Pláže a pobřeží'], ['island', '🏝️ Ostrovy'], ['lake', '💧 Jezera a vodopády'], ['castle', '🏰 Hrady a zámky'], ['sight', '✨ Zajímavá místa']];
  const RAD_OK = [...RADII, COUNTRY];
  const cityKm = r => (typeof r === 'number' ? Math.min(r, CITY_KM) : 10);
  const farOn = r => typeof r === 'number' && r > CITY_KM;
  // Okruh se zmenšuje v prohlížeči nad už načtenými místy; výlety mimo město (daytrip) leží za okruhem vždy –
  // u okruhu 50/100 km jen ty do něj.
  const inRadius = (items, km) => items.filter(x => (x.category === 'daytrip' ? !farOn(km) || x.distanceKm == null || x.distanceKm <= km
    : x.distanceKm == null || x.distanceKm <= km));
  // Okruh 50/100 km: k místům ve městě cíle z okolí (místo výletů, které už seznam má – ty z plánovače výletů mají
  // úplnější údaje), seřazené podle významu
  const withFar = (all, far) => {
    if (!far?.length) return all;
    const ids = new Set(far.map(x => x.id));
    return [...all.filter(x => !ids.has(x.id)), ...[...far].sort((a, b) => (b.score || 0) - (a.score || 0))];
  };
  // Doba jízdy autem z místa (vzdušnou čarou × 1,3 silnicí, ~70 km/h), na 5 min – jen orientačně
  const driveMin = km => Math.max(10, Math.round((km * 1.3 / 70 * 60) / 5) * 5);
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
  // Logo Mapy.com (podmínka jejich API): u návrhů z Mapy.com („Hledají i Mapy.com“) a nad turistickou mapou.
  const MAPY_LOGO = 'https://api.mapy.com/img/api/logo.svg';
  const mapyBy = what => `<a class="mapy-by" href="https://mapy.com/" target="_blank" rel="noopener">${what} <img src="${MAPY_LOGO}" alt="Mapy.com" height="14"></a>`;
  // Poznámka pod trasou a túrami: zdroje a výpočet času sbalené pod „Jak počítám ▾“ (na telefonu to bylo 8–12 řádků);
  // vidět zůstane, co je potřeba hned (čas bez přestávek, ověř chaty a počasí) a atribuce dat
  const footMore = html => ` <details class="foot-more"><summary>Jak počítám</summary>${html}</details>`;
  const sugHtml = (sugs, act, err) => (err ? '<div class="pi-empty">Hledání míst teď nefunguje – zkus to za chvíli</div>'
    : sugs.length ? (sugs[0].fuzzy ? '<div class="pi-head">🔤 Překlep? Asi myslíš:</div>' : '') + sugs.map((s, i) => `<div class="pi-opt ${i === act ? 'on' : ''}" data-i="${i}"><span class="pi-flag">${s.flag || '📍'}</span><span class="pi-t"><b>${esc(s.label)}</b><small>${esc(s.sub || '')}</small></span></div>`).join('')
      + (sugs.some(s => s.src === 'mapy') ? `<div class="pi-by">${mapyBy('Hledají i')}</div>` : '')
      : '<div class="pi-empty">Nic nenalezeno</div>');

  // Čekání: rovnou poctivý odhad, po SLOW_MS výslovnější vysvětlení (spinner zůstává).
  const SLOW_MS = 8000;
  const WAIT = {
    list: ['První načtení místa trvá obvykle 20–40 s, příště je hned.', 'Pořád načítám – u nového místa server stahuje data z Wikidat a popisy z Wikipedie, někdy i přes půl minuty. Příště už to bude hned.'],
    city: ['', 'Trvá to déle než obvykle – server data o místech zřejmě načítá znovu (i 20–40 s). Pak už to bude hned.'],
    trips: ['Poprvé to pro nové místo trvá obvykle 20–40 s, příště je hned.', 'Pořád hledám – cíle výletů v okolí 120 km se z Wikidat načítají pomalu, někdy i přes půl minuty. Příště už to bude hned.'],
    far: ['Poprvé to pro nové místo trvá obvykle 20–60 s, příště je hned.', 'Pořád hledám – místa v okolí se z Wikidat načítají pomalu, někdy i přes minutu. Příště už to bude hned.'],
    country: ['Poprvé to trvá obvykle 5–15 s, příště je hned.', 'Pořád načítám – Wikivoyage a Wikidata odpovídají pomalu. Příště už to bude hned.'],
    train: ['Nádraží v okolí se poprvé hledají obvykle 20–40 s.', 'Pořád hledám – nádraží se z Wikidat načítají pomalu, někdy i přes půl minuty. Příště už to bude rychlejší.'],
    route: ['', 'Trvá to déle než obvykle – plánovač tras (BRouter) nebo server odpovídá pomalu. Zkouším to dál.'],
    hikes: ['Hledám cíle, starty túr a trasy na každý den – poprvé to trvá obvykle 10–40 s.', 'Pořád plánuju – trasy z BRouteru jdou po jedné a Wikidata u nového místa odpovídají pomalu. Příště už to bude rychlejší.'],
  };
  const WAIT_LEAD = { list: 'Hledám zajímavá místa kolem:', city: 'Skládám program…', trips: 'Hledám cíle výletů…', train: 'Hledám nádraží a trasu…', route: 'Plánuju trasu…', hikes: 'Plánuju túru na každý den…',
    far: 'Hledám nejzajímavější místa v okolí…', country: 'Hledám to nejlepší v zemi…' };
  const waitHtml = (kind, slow, label, note) => `<div class="loading-row ex-busy" role="status"><span class="spin dark"></span><div><b>${esc(kind === 'list' ? `${WAIT_LEAD.list} ${label}…` : WAIT_LEAD[kind])}</b>${
    (note || WAIT[kind][slow ? 1 : 0]) ? `<div class="ex-wait">${esc(note || WAIT[kind][slow ? 1 : 0])}</div>` : ''}</div></div>`;
  const ERR_LEAD = { city: 'Program se nepodařilo sestavit', trips: 'Výlety se nepodařilo naplánovat', route: 'Trasu se nepodařilo naplánovat', train: 'Nádraží a trasu se nepodařilo najít', hikes: 'Túry se nepodařilo naplánovat' };
  const errLead = (kind, other) => (other ? (kind === 'train' ? 'Jiné nádraží se nepodařilo najít' : 'Jinou trasu se nepodařilo naplánovat') : ERR_LEAD[kind] || 'Nepodařilo se to');
  // Chyba přímo ve výsledku s „Zkusit znovu“ (žádná mizející hláška); předchozí výsledek zůstává pod ní.
  const errHtml = (lead, msg, id, kept) => `<div class="note bad ex-err" role="alert">⚠️ <div>${esc(`${lead}: ${String(msg || '').replace(/[.\s]+$/, '')}.`)}${kept ? ` <span class="faint">${esc(kept)}</span>` : ''}</div><button type="button" class="btn sm" id="${id}">↻ Zkusit znovu</button></div>`;

  /* ---------- zapamatovaný stav Objevuj (localStorage; po obnovení stránky stejné místo a volby) ---------- */
  const UI_LS = 'atlas_explore_v1';
  // druhy míst v přírodě ze serveru (NATURE v server/lib/names.js): pohoří, národní park / CHKO, hora, jeskyně, skály, jezero
  const NATURE_KINDS = ['range', 'park', 'peak', 'cave', 'rocks', 'lake'];
  const pick1 = (v, ok) => (ok.includes(v) ? v : undefined);
  const cleanPlace = p => (p && typeof p === 'object' && Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lon) <= 180
    && typeof p.label === 'string' && p.label.trim()
    ? { lat: +p.lat, lon: +p.lon, label: p.label.slice(0, 120), cc: /^[A-Z]{2}$/.test(p.cc) ? p.cc : '', geo: Boolean(p.geo), country: typeof p.country === 'string' ? p.country.slice(0, 60) : '',
      ...(/^[a-z-]{2,30}$/.test(p.region) ? { region: p.region } : {}),
      ...(NATURE_KINDS.includes(p.nature) ? { nature: p.nature, ...(RADII.includes(+p.km) ? { km: +p.km } : {}) } : {}) } : null);
  const samePlace = (a, b) => Boolean(a && b && a.label === b.label && Math.abs(a.lat - b.lat) < 1e-3 && Math.abs(a.lon - b.lon) < 1e-3);
  // „Naposledy“: nejnovější první, bez opakování, bez „Moje okolí“ (poloha se mění).
  const pushRecent = (list, p) => (!p || p.geo ? list : [cleanPlace(p), ...list.filter(x => !samePlace(x, p))].filter(Boolean).slice(0, 5));
  function uiSnapshot(s) {
    return {
      place: cleanPlace(s.place), radius: s.radius, mode: s.mode, start: s.start, days: s.days, tripDays: { ...s.tripDays }, transport: s.transport,
      interests: [...s.interests], tripInterests: [...s.tripInterests], pace: s.pace, cCat: s.cCat,
      bike: { km: s.bike.km, bike: s.bike.bike, scenery: s.bike.scenery, hills: s.bike.hills, kind: s.bike.kind },
      hike: { km: s.hike.km, scenery: s.hike.scenery, hills: s.hike.hills, kind: s.hike.kind }, recent: s.recent || [], datePicked: Boolean(s.datePicked),
    };
  }
  // Platný termín: celé datum od dneška (rozepsané pole hlásí i '' nebo rok 0002).
  const okStart = (v, today) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= today;
  /** Uložený stav → jen platné hodnoty (cizí nebo starý záznam nic nerozbije); start v minulosti se zahodí. */
  function uiRestore(raw, today) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const ids = list => list.map(x => x[0]);
    const arr = (v, ok) => (Array.isArray(v) ? [...new Set(v.filter(x => ok.includes(x)))] : undefined);
    const ob = v => (v && typeof v === 'object' ? v : {});
    const place = cleanPlace(o.place);
    const start = okStart(o.start, today) ? o.start : undefined;
    const r = {
      // „Moje okolí“ se neobnoví – poloha se mění (jako u „Naposledy“)
      place: place && !place.geo ? place : null, radius: pick1(o.radius, RAD_OK), mode: pick1(o.mode, ids(MODES)),
      start, datePicked: start && o.datePicked === true ? true : undefined, // vybraný termín (ne výchozí zítřek) – „Najít lety sem“ přesně
      days: pick1(o.days, [1, 2, 3, 4, 5, 6, 7, 10]), transport: pick1(o.transport, ids(TRANSPORTS)), pace: pick1(o.pace, ['relaxed', 'normal', 'intense']),
      cCat: pick1(o.cCat, CC_CATS.map(c => c[0])),
      tripDays: { day: pick1(ob(o.tripDays).day, [1, 2, 3, 4, 5, 7]), loop: pick1(ob(o.tripDays).loop, [2, 3, 4, 5, 6, 7, 10]) },
      interests: arr(o.interests, ids(INTERESTS)), tripInterests: arr(o.tripInterests, ids(TRIP_INTERESTS)),
      bike: { km: pick1(ob(o.bike).km, [15, 25, 40, 60, 80, 100, 130]), bike: pick1(ob(o.bike).bike, ids(BIKE_TYPES)), scenery: pick1(ob(o.bike).scenery, ids(BIKE_SCENERY)),
        hills: pick1(ob(o.bike).hills, ids(BIKE_HILLS)), kind: pick1(ob(o.bike).kind, ids(BIKE_KINDS)) },
      hike: { km: pick1(ob(o.hike).km, [5, 8, 10, 12, 15, 20, 25, 30]), scenery: pick1(ob(o.hike).scenery, ids(BIKE_SCENERY)), hills: pick1(ob(o.hike).hills, ids(BIKE_HILLS)),
        kind: pick1(ob(o.hike).kind, ids(HIKE_KINDS)) },
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
  /* ---------- 🌍 země podle názvu („Francie“, „ve Francii“, „Česká republika“, „Italy“) ---------- */
  const foldName = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const CC_ALIAS = { 'ceska republika': 'CZ', cechy: 'CZ', 'czech republic': 'CZ', anglie: 'GB', britanie: 'GB', 'velka britanie': 'GB', uk: 'GB',
    holandsko: 'NL', holland: 'NL', usa: 'US', amerika: 'US', 'spojene staty': 'US' };
  let ccNames = null, ccNamesN = 0;
  // název (česky, anglicky, přezdívka) → kód země; znovu, když přibydou země (načítají se po startu)
  function ccByName() {
    const all = typeof byIso !== 'undefined' ? Object.values(byIso) : [];
    if (ccNames && ccNamesN === all.length) return ccNames;
    ccNames = new Map(Object.entries(CC_ALIAS).filter(([, cc]) => all.some(c => c.iso2 === cc)));
    for (const c of all) for (const n of [c.cs, c.en]) if (n) ccNames.set(foldName(n), c.iso2);
    ccNamesN = all.length;
    return ccNames;
  }
  /** Země, kterou text celý pojmenovává (i v jiném pádě: „Francii“, „Česku“, „Velké Británii“) → kód, jinak ''. */
  function countryOfText(text) {
    const t = String(text || '').trim();
    if (t.length < 2) return '';
    const m = ccByName(), forms = new Set([t, ...(window.Smart ? window.Smart.nominatives(t) : [])]);
    for (const f of [...forms]) { forms.add(f.replace(/ii$/i, 'ie')); forms.add(f.replace(/é (\S+)ii$/i, 'á $1ie')); }
    for (const f of forms) { const cc = m.get(foldName(f)); if (cc) return cc; }
    return '';
  }
  // ✨ věta jen se zemí (bez dnů, druhu plánu a zájmů) → kód země pro přehled celé země
  const wholeCountryOf = px => (px && px.place && !px.days && !px.mode && !(px.interests && px.interests.length) && !px.km ? countryOfText(px.place) : '');
  // v poli hledání: u přehledu země název země („Francie“), jinak místo
  const qLabel = () => (ex.place ? (ex.radius === COUNTRY && countryCs(ex.place.cc)) || ex.place.label : '');
  /** Návrhy zemí k psanému textu: celý název, nebo začátek názvu od 3 písmen (nejvýš 2) – „🇫🇷 Francie – celá země“. */
  function countrySugs(text) {
    const q = foldName(text), exact = countryOfText(text);
    const ccs = exact ? [exact] : [];
    if (q.length >= 3) for (const [n, cc] of ccByName()) if (n.startsWith(q) && !ccs.includes(cc)) ccs.push(cc);
    return ccs.slice(0, 2).map(cc => ({ ccPick: cc, label: `${countryCs(cc)} – celá země`, sub: 'města, další cíle, památky UNESCO a národní parky', flag: flag(cc) }));
  }
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

  // Knihovna mapy (~1 MB) se načte až při prvním zobrazení mapy, ne s celou aplikací – z adresy s otiskem obsahu od
  // serveru (lazy.js Lazy.url), kterou Cloudflare a prohlížeč drží bez ptaní serveru.
  let mapLibP = null;
  const libUrl = u => (window.Lazy && Lazy.url ? Lazy.url(u) : u);
  const loadMapLib = () => mapLibP || (mapLibP = new Promise((res, rej) => {
    if (typeof maplibregl !== 'undefined') return res();
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = libUrl('vendor/maplibre/maplibre-gl.css');
    // před styly aplikace, aby jejich úpravy (vyskakovací okna, sticky mapa) měly přednost
    document.head.insertBefore(css, document.head.querySelector('link[rel="stylesheet"]'));
    const sc = document.createElement('script');
    sc.src = libUrl('vendor/maplibre/maplibre-gl.js');
    sc.onload = () => res();
    sc.onerror = () => { mapLibP = null; sc.remove(); rej(new Error('Mapu se nepodařilo načíst.')); };
    document.head.appendChild(sc);
  }));

  // 🗺️ Turistická mapa Mapy.com (outdoor, značené trasy) pod trasou pěšky a na kole – jen když ji server nabízí
  // (odpověď trasy má tiles: 'mapy', na serveru je klíč MAPY_API_KEY). Dlaždice jdou přes server (/api/tiles/mapy/…),
  // klíč v prohlížeči není. Nad mapou logo Mapy.com a copyright (podmínky API); po 3 chybách dlaždic se vrstva sundá
  // a zůstane OpenFreeMap. Na displejích s vyšší hustotou dlaždice @2x (stejný kredit, ostřejší).
  const MAPY_SRC = 'mapy-outdoor';
  const mapyTiles = () => `${new URL('api/tiles/mapy/outdoor/', document.baseURI).href}{z}/{x}/{y}${(window.devicePixelRatio || 1) > 1.4 ? '@2x' : ''}`;
  const mapyCtl = () => ({
    onAdd() {
      const d = document.createElement('div');
      d.className = 'maplibregl-ctrl mapy-attr';
      d.innerHTML = `<a href="https://mapy.com/" target="_blank" rel="noopener"><img src="${MAPY_LOGO}" alt="Mapy.com" height="30"></a><a class="mapy-c" href="https://api.mapy.com/copyright" target="_blank" rel="noopener">© Seznam.cz a.s. a další</a>`;
      this.el = d;
      return d;
    },
    onRemove() { this.el.remove(); },
  });
  function setOutdoor(ms, on) {
    ms.outdoor = on;
    const map = ms.map;
    if (!map || !ms.styleReady) return; // po načtení stylu (style.load) znovu
    const want = on && !ms.mapyFailed;
    if (want && !map.getLayer(MAPY_SRC)) {
      if (!map.getSource(MAPY_SRC)) map.addSource(MAPY_SRC, { type: 'raster', tiles: [mapyTiles()], tileSize: 256, maxzoom: 18 });
      map.addLayer({ id: MAPY_SRC, type: 'raster', source: MAPY_SRC }, map.getLayer('atlas-lines') ? 'atlas-lines' : undefined);
    } else if (!want && map.getLayer(MAPY_SRC)) {
      map.removeLayer(MAPY_SRC);
      map.removeSource(MAPY_SRC);
    }
    if (want && !ms.mapyCtl) map.addControl(ms.mapyCtl = mapyCtl(), 'bottom-left');
    else if (!want && ms.mapyCtl) { map.removeControl(ms.mapyCtl); ms.mapyCtl = null; }
  }

  /** Vrátí stav mapy hned; samotná mapa vznikne po načtení knihovny (ms.ready). */
  function makeMap(el, center) {
    const ms = { map: null, markers: [], lines: null, raster: false, errors: 0, mapyErrors: 0 };
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
    // Výška mapy přijde z rozvržení někdy až po vykreslení (na počítači mapa vedle seznamu přes výšku okna) – výřez
    // spočítaný pro menší plochu by nechal body v rohu nebo mimo. Dokud mapou nikdo nepohnul, přizpůsobit ho znovu.
    map.on('movestart', e => { if (e.originalEvent) ms.moved = true; });
    if (typeof ResizeObserver === 'function') {
      let size = '';
      const ro = new ResizeObserver(() => {
        const k = `${el.clientWidth}x${el.clientHeight}`;
        if (k === size || !el.clientWidth || !el.clientHeight) return;
        const first = !size;
        size = k;
        if (first) return;
        map.resize();
        if (ms.fit && !ms.moved) map.fitBounds(ms.fit, { ...FIT, duration: 0 });
      });
      ro.observe(el);
      map.once('remove', () => ro.disconnect());
    }
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
      // turistická mapa Mapy.com je jen nadstavba: její chyby podklad nepřepínají, po třech se vrstva sundá
      if (e.sourceId === MAPY_SRC) { if (++ms.mapyErrors >= 3) { ms.mapyFailed = true; setOutdoor(ms, ms.outdoor); } return; }
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
      if (ms.outdoor) setOutdoor(ms, true); // pod čáry tras (i po přepnutí na záložní OpenStreetMap)
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
  function paintMap(ms, center, pts, lines, onClick, fitIds, outdoor = false) {
    if (!ms) return;
    if (!ms.map) { ms.ready.then(() => ms.map && paintMap(ms, center, pts, lines, onClick, fitIds, outdoor)); return; }
    const map = ms.map;
    setOutdoor(ms, outdoor);
    ms.markers.forEach(m => m.remove());
    ms.markers = [];
    ms.byId = new Map();
    const add = (pt, cls) => {
      const el = document.createElement('div');
      el.className = `mk ${cls}${pt.num ? ' num' : ''}`;
      el.style.background = pt.color;
      if (pt.num) el.textContent = pt.num;
      if (pt.day != null) el.dataset.day = pt.day; // den programu (najetí na den v seznamu ztlumí ostatní)
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
      map.fitBounds(b, { ...FIT, duration: 0 });
      ms.fit = b; // při změně velikosti mapy znovu (initMap)
      ms.moved = false;
    }
  }
  // dole víc místa, ať start trasy neskončí pod atribucí
  const FIT = { padding: { top: 40, right: 40, bottom: 56, left: 40 }, maxZoom: 15 };

  // Na počítači: najetí myší na místo v seznamu (nebo zastávku programu) zvýrazní jeho značku na mapě vedle, najetí na
  // den programu ztlumí značky ostatních dnů – klik na značku už naopak odroluje k místu v seznamu.
  if (typeof document !== 'undefined' && document.addEventListener && typeof matchMedia === 'function' && matchMedia('(hover:hover)').matches) {
    let hot = null, dayMap = null, dayOn = null;
    const setHot = el => { if (hot === el) return; if (hot) hot.classList.remove('hot'); hot = el; if (el) el.classList.add('hot'); };
    const setDay = (m, day) => {
      if (dayMap === m && dayOn === day) return;
      if (dayMap && dayMap !== m) dayMap.atlasState?.markers.forEach(x => x.getElement().classList.remove('dim'));
      dayMap = m; dayOn = day;
      if (m) m.atlasState?.markers.forEach(x => { const el = x.getElement(); el.classList.toggle('dim', day != null && el.dataset.day !== day && !el.classList.contains('ctr')); });
    };
    document.addEventListener('mouseover', e => {
      const t = e.target && e.target.closest ? e.target : null;
      const box = t && t.closest('.ex-layout');
      const m = box && [...liveMaps].find(x => box.contains(x.getContainer()));
      const card = m && t.closest('[data-poi],[data-cpoi]');
      const mk = card && m.atlasState && m.atlasState.byId ? m.atlasState.byId.get(card.dataset.poi || card.dataset.cpoi) : null;
      setHot(mk ? mk.getElement() : null);
      const day = m && t.closest('.day-plan[data-day]');
      setDay(m || dayMap, day ? day.dataset.day : null);
    });
  }

  function focusOnMap(ms, p, zoom = 15) {
    if (!ms?.map) return;
    ms.map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(ms.map.getZoom(), zoom) });
    const mk = ms.byId?.get(p.id);
    if (mk && !mk.getPopup().isOpen()) mk.togglePopup();
  }

  // Program ve městě: body podle dne (barva + pořadí) nebo kategorie, pěší trasy dnů čárkovaně.
  // fitAll: mapa obsáhne i výlety mimo město (okruh 50/100 km)
  function drawOnMap(state, center, items, plan, onClick, fitAll = false) {
    if (!state.map) return;
    const dayOf = new Map();
    (plan?.days || []).forEach((d, i) => d.items.forEach((p, j) => dayOf.set(p.id, { i, j })));
    const pts = items.map(p => {
      const d = dayOf.get(p.id);
      return { id: p.id, lat: p.lat, lon: p.lon, color: d ? DAY_COLORS[d.i % DAY_COLORS.length] : color(p.category), num: d ? d.j + 1 : null,
        label: `${icon(p.category)} ${p.name}${d ? ` · den ${d.i + 1}` : ''}`, q: poiQ(p, center), place: p, day: d ? d.i : null };
    });
    const lines = (plan?.days || []).filter(d => d.items.length && d.kind !== 'daytrip')
      .map(d => ({ color: DAY_COLORS[plan.days.indexOf(d) % DAY_COLORS.length], coords: [[center.lon, center.lat], ...d.items.map(p => [p.lon, p.lat])] }));
    // výlety mimo město nepřibližují mapu, pokud jich je víc (jinak by město bylo malinké) – ani celodenní výlet
    // z programu, když jsou v programu i dny ve městě (město by se scvrklo do rohu; výlet je na mapě dál vidět po oddálení)
    const outDay = new Set((plan?.days || []).filter(d => d.kind === 'daytrip').flatMap(d => d.items.map(p => p.id)));
    const inTown = items.some(p => dayOf.has(p.id) && !outDay.has(p.id));
    const fitIds = fitAll ? null : new Set(items.filter(p => (p.category !== 'daytrip' || items.length < 5 || dayOf.has(p.id)) && !(inTown && outDay.has(p.id))).map(p => p.id));
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
    // pěšky u hor a přírody: start túry (parkoviště, nádraží, obec) – cíl je střed mapy
    const th = r.trailhead;
    if (th) pts.push({ id: 'trailhead', lat: th.lat, lon: th.lon, color: '#0ea5e9', num: TH_ICON[th.kind] || '📍', big: true, label: `${TH_ICON[th.kind] || '📍'} ${th.name} – start túry`, q: th.name });
    paintMap(state.map, center, pts, [{ color: col, coords: r.geometry.map(c => [c[0], c[1]]), solid: true, fit: true }], null, null, r.tiles === 'mapy');
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
          // den programu s deštěm: tip na místa pod střechou (planHtml ho připravil schovaný)
          const rain = !s.route && s.el.isConnected && s.el.closest('.day-plan')?.querySelector('.dp-rain');
          if (rain) rain.hidden = !W.rainy(w);
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
  // První věta popisu: anglický úryvek (server: descLang 'en') se štítkem „anglicky“ – celý cizí odstavec nic neřekne;
  // v 🔎 Co tam je jedna věta i z českého popisu.
  // „St. Vitus“, „U.S.“ ani české „ze 14. století“ větu neukončí (za tečkou malé písmeno). V češtině ani zkratka před
  // velkým písmenem („kostel sv. Mikuláše“, „tzv. Rynek“, „např. Picassa“, „(něm. Dom)“, „arch. Gočár“); „atd.“ a „apod.“
  // větu obvykle končí. V angličtině se zkratky nehlídají („a triumphal arch. It…“).
  // zkratky, za kterými obvykle následuje jméno: osoba, ulice, cizí název („(kat. Basílica…)“)
  const CS_ABBR = ('sv tzv tzn např popř resp tj mj zv nám náb nábř ul tř čp hl př arch prof doc kpt gen plk mjr kr kn ev nar zal '
    + 'angl něm fr it šp špan port kat pol maď chorv srb slov slovin rum bulh řec tur niz dán šv švéd nor fin est lot lit rus ukr lat hebr ar arab ir bask gal').split(' ').join('|');
  const SENT_EN = /^[\s\S]{20,240}?[a-z0-9)\]"'’\u00e0-\u024f]{2}[.!?](?=\s+[^\s\p{Ll}]|\s*$)/u;
  // tečka ne hned za zkratkou; starší Safari (iOS < 16.4) lookbehind nezná – tam česky jako anglicky (Objevuj dál funguje)
  const SENT_CS = (() => { try { return new RegExp(SENT_EN.source.replace('[.!?]', `[.!?](?<!(?<!\\p{L})(?:${CS_ABBR})\\.)`), 'u'); } catch (e) { return SENT_EN; } })();
  const firstSentence = (s, lang) => {
    const t = String(s || '').trim();
    const m = t.match(lang === 'en' ? SENT_EN : SENT_CS);
    return m ? m[0] : t.length > 240 ? `${t.slice(0, 220).replace(/\s+\S*$/, '')}…` : t;
  };
  // Bez údaje o jazyku (starší server): text bez české diakritiky s několika běžnými anglickými slovy je anglický.
  const EN_WORDS = /\b(the|of|and|is|was|were|located|built|which|its|with|from|by|known|has)\b/gi;
  const looksEnglish = s => !/[ěščřžůťďň]/i.test(s) && (String(s).match(EN_WORDS) || []).length >= 3;
  const isEnglish = (text, lang) => lang === 'en' || (!lang && looksEnglish(text));
  const descHtml = (text, lang) => (!text ? '' : isEnglish(text, lang)
    ? `<span class="poi-lang" title="Český popis chybí – úryvek z anglické Wikipedie">anglicky</span> ${esc(firstSentence(text, 'en'))}` : esc(text));
  // Části sloučené do celku (katedrála na Hradě, orloj u radnice) – jinak by v aplikaci nebyly vidět vůbec.
  const inclHtml = (p, cls) => (Array.isArray(p.includes) && p.includes.length
    ? `<div class="${cls}">Zahrnuje: ${esc(p.includes.slice(0, 5).join(', '))}${p.includes.length > 5 ? ` a ${p.includes.length - 5} ${p.includes.length - 5 >= 5 ? 'dalších' : 'další'}` : ''}</div>` : '');
  // Výlet: jak se tam dostat (server: reach – odhad vlakem / busem / lodí a autem z města, ne jízdní řád) s odkazem na
  // skutečné spoje v Google Maps, a proč tam jet (why: UNESCO, oblíbený výlet, doporučení průvodce, co je k vidění).
  const REACH = { rail: ['🚆', 'vlakem'], bus: ['🚌', 'busem'], boat: ['⛴️', 'lodí'] };
  const okMin = m => Number.isFinite(+m) && +m > 0;
  function reachHtml(p, center, cls = 'poi-inc') {
    const r = p.reach;
    if (!r || !okMin(r.transitMin)) return '';
    // mode z cizího odkazu (#trip=) jen ze seznamu – „constructor“ by vrátil funkci a program by se nevykreslil
    const [ico, how] = Object.hasOwn(REACH, r.mode) ? REACH[r.mode] : REACH.bus;
    const from = center && center.lat != null ? centerQ(center) : '';
    const link = from ? ` · <a href="${esc(safeUrl(gmDir(from, [poiQ(p, center)], 'transit')))}" target="_blank" rel="noopener">spoje ↗</a>` : '';
    return `<div class="${cls}">${ico} ~${minTxt(Math.round(+r.transitMin))} ${how}${okMin(r.carMin) ? ` · 🚗 ~${minTxt(Math.round(+r.carMin))} autem` : ''} <span class="faint">(odhad)</span>${link}</div>`;
  }
  const whyHtml = (p, cls = 'poi-inc') => (p.why ? `<div class="${cls}">✨ ${esc(p.why)}</div>` : '');
  function poiCard(p, opts = {}) {
    return `<div class="poi" data-poi="${esc(p.id)}">
      <div class="poi-img" ${p.image ? `style="background-image:url('${esc(cssUrl(p.image))}')"` : ''}>${p.image ? '' : picon(p)}</div>
      <div><div class="poi-name">${picon(p)} ${esc(p.name)}</div>
        <div class="poi-meta">${esc(p.categoryLabel || '')}${p.distanceKm != null ? ` · ${num(p.distanceKm)} km` : ''}${opts.drive && p.distanceKm != null && !p.reach ? ` · ~${minTxt(driveMin(p.distanceKm))} autem` : ''}${p.unesco ? ' · <b style="color:var(--warn)">UNESCO</b>' : p.heritage ? ' · památka' : ''}${p.wikivoyage ? ' · <b style="color:var(--good)" title="Místo doporučuje cestovní průvodce Wikivoyage">👍 doporučuje Wikivoyage</b>' : ''}</div>
        ${inclHtml(p, 'poi-inc')}${reachHtml(p, opts.center)}${whyHtml(p)}<div class="poi-desc">${descHtml(p.extract || p.description || '', p.descLang)}</div>
        <div class="poi-acts">${p.url ? `<a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">Wikipedie ↗</a>` : ''}
          <a href="${esc(gmSearch(opts.center ? poiQ(p, opts.center) : p.name))}" target="_blank" rel="noopener" data-gm>Google Maps ↗</a>
          ${opts.toggle ? (opts.inPlan?.has(p.id) ? '<span class="poi-in">✓ v plánu</span>' : mustBtn(p.id, opts.must?.has(p.id))) : ''}
          ${opts.tripToggle ? `<button type="button" class="linkbtn" data-tmust="${esc(p.id)}">+ přidat do výletu</button>` : ''}
          ${opts.tripGo ? `<button type="button" class="linkbtn" data-tgo="${esc(p.id)}" title="Naplánovat jednodenní výlety s tímto místem">🎒 Výlet sem</button>` : ''}</div></div>
    </div>`;
  }

  /** Trasa dne programu od ubytování: po městě pěšky (Google Maps i Mapy.com), celodenní výlet veřejnou dopravou (jen
   *  Google – spoje) → { trip, url, mapy }; i pro kartu „📍 Dnes na cestě“ (app.js). */
  function dayRoute(center, d) {
    // den túry (plán túr na každý den): trasa túry ze startu (Google Maps pěšky, Mapy.com turisticky)
    if (d.hike) return { trip: false, hike: true, url: d.hike.googleUrl || null, mapy: d.hike.mapyUrl || null };
    const trip = d.kind === 'daytrip';
    const url = !trip ? gmDir(centerQ(center), d.items.map(p => poiQ(p, center)), 'walking') : gmDir(centerQ(center), d.items.slice(0, 1).map(p => poiQ(p, center)), 'transit');
    return { trip, url, mapy: !trip ? mapyDir(center, d.items, 'foot_fast') : null };
  }
  function planHtml(plan, center) {
    if (!plan) return '';
    const warn = (plan.warnings || []).map(w => `<div class="note warn" style="margin-bottom:10px">⚠️ <div>${esc(w)}</div></div>`).join('');
    // program v místě, kde se nespí (hotel z okolí – Cesta): první místo dne od centra, ne od ubytování
    const fromC = center.startAt === 'center';
    return warn + plan.days.map((d, i) => {
      const { trip, url, mapy } = dayRoute(center, d);
      // delší úsek v horách a přírodě (Krkonoše) se jede autem nebo busem, ve městě MHD/taxi
      const ride = d.rural ? 'autem / busem' : 'MHD/taxi';
      return `<div class="day-plan" data-day="${i}"><h4><span><span style="color:${DAY_COLORS[i % DAY_COLORS.length]}">●</span> Den ${i + 1} · ${dayLbl(d.date)}${trip ? (d.half ? ' · výlet do okolí' : ' · celodenní výlet') : ''}${wxSlot((trip && d.items[0]) || center, d.date)}</span>
        ${dayLinks(url, mapy)}</h4>
        ${d.area ? `<p class="dp-area">🏘️ Oblast: ${esc(d.area)}</p>` : ''}
        ${d.items.length ? d.items.map((p, j) => `<div class="dp-item" data-poi="${esc(p.id)}"><span class="dp-n">${j + 1}</span><div><b>${icon(p.category)} ${esc(p.name)}</b> <span class="faint">· ${p.at ? `~${esc(p.at)}, ` : ''}${minTxt(p.visitMin)}</span>
          ${inclHtml(p, 'dp-walk')}${trip && p.reach ? reachHtml(p, center, 'dp-walk') + whyHtml(p, 'dp-walk') : `<div class="dp-walk">${!p.transit && !(p.fromPrevKm >= 0.1) ? (j === 0 ? (fromC ? 'hned v centru' : 'hned u ubytování') : 'hned vedle') // Casa Amatller vedle Casa Batlló – ne „0 km pěšky (~0 min)“
            : `${j === 0 ? (fromC ? 'od centra' : 'od ubytování') : 'dál'} ${p.transit ? `${num(p.fromPrevKm)}\u00a0km – ${p.boat ? 'lodí' : ride}` : `${num(p.fromPrevKm)}\u00a0km pěšky (~${minTxt(p.fromPrevMin)})`}`}${passByTxt(p)}</div>${p.hoursNote ? `<div class="dp-walk dp-hours">🕘 ${esc(p.hoursNote)}</div>` : ''}`}</div>
          <button type="button" title="Vyřadit z plánu" aria-label="${esc(`Vyřadit z plánu: ${p.name}`)}" data-drop="${esc(p.id)}">✕</button></div>${lunchHtml(d, j)}`).join('')
          : `<div class="faint" style="font-size:13px;padding:6px 0">${d.cap ? 'Volno – odpočinek, jídlo, procházka.' : 'Den cesty – bez programu.'}</div>`}
        ${d.items.length && d.kind !== 'daytrip' ? `<div class="faint" style="font-size:11.5px;margin-top:4px">celkem ~${minTxt(d.minutes)} prohlídek · ${num(d.walkKm)} km pěšky${d.end ? ` · konec ~${esc(d.end)}` : ''}</div>` : ''}
        ${tipsHtml(d)}
      </div>`;
    }).join('');
  }
  // Tipy ke dni ze serveru (api/itinerary): oběd (s tržnicí nebo kavárnou kousek od místa), cestou kolem, na večer a když
  // prší – ten se ukáže, až předpověď na den hlásí déšť (fillWx); bez předpovědi zůstane schovaný.
  const tipName = x => `${esc(x.name)}${x.km >= 0.1 ? ` <span class="faint">(${num(x.km)}\u00a0km)</span>` : ''}`;
  const lunchHtml = (d, j) => (d.lunch && d.lunch.after === j
    ? `<div class="dp-pause">🍽️ Oběd${d.lunch.at ? ` ~${esc(d.lunch.at)}` : ''}${d.lunch.tip ? ` · tip: ${tipName(d.lunch.tip)}` : ''}</div>` : '');
  const passByTxt = p => (Array.isArray(p.passBy) && p.passBy.length ? ` · cestou kolem: ${esc(p.passBy.join(', '))}` : '');
  const tipsHtml = d => [
    // nejznámější nebo vybrané místo, které ten den zavírá a jiný den se nevešlo (Louvre na jednodenní cestě v úterý)
    Array.isArray(d.closed) && d.closed.length ? `<div class="dp-tip">🔒 ${d.closed.map(x => `${esc(x.name)}: ${esc(x.why)}`).join(' · ')}</div>` : '',
    d.evening ? `<div class="dp-tip">🌙 Na večer: ${tipName(d.evening)}</div>` : '',
    Array.isArray(d.rain) && d.rain.length ? `<div class="dp-tip dp-rain" hidden>🌧️ Když prší: ${d.rain.map(tipName).join(' · ')}</div>` : '',
  ].join('');

  /* ---------- plánovač (sdílený pro Objevuj i Cestu) ---------- */
  /**
   * ✕ u místa v programu: vyřadit a naplánovat znovu – program se po vyřazení přeskládá (místa se přesunou mezi dny),
   * proto hláška s ↩ Vrátit. Plánování je pro stejná místa a volby stejné (server bez náhody), takže vrácení místa
   * a nové naplánování vrátí program, jak byl.
   */
  function dropUndo(st, id, plan, replan) {
    const was = st.must.has(id);
    const name = plan && plan.days ? (plan.days.flatMap(d => d.items).find(x => x.id === id) || {}).name : '';
    st.exclude.add(id); st.must.delete(id);
    replan();
    toast(`Vyřazeno${name ? `: ${name}` : ''} – program jsem přeskládal`, '', 6000, { label: '↩ Vrátit', run: () => { st.exclude.delete(id); if (was) st.must.add(id); replan(); } });
  }
  function plannerControls(st) {
    // zájmy nejsou filtr – vybraná místa dostanou v programu přednost; „on“ s barvou a aria-pressed, ať je vidět, co platí
    return `<div class="row wrap" style="gap:8px;margin:10px 0">
      <span class="faint" style="font-size:12.5px;align-self:center">Víc toho, co tě baví:</span>${INTERESTS.map(([id, label]) => `<button type="button" class="fchip ${st.interests.has(id) ? 'on' : ''}" data-int="${id}" aria-pressed="${st.interests.has(id)}">${label}</button>`).join('')}
      <select data-pace aria-label="Tempo programu" style="width:auto;padding:7px 30px 7px 10px;font-size:12.5px">${[['relaxed', '🐢 V klidu'], ['normal', '🚶 Normálně'], ['intense', '🏃 Nabitě']].map(o => `<option value="${o[0]}" ${st.pace === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
    </div>`;
  }

  // Volby programu (zájmy, tempo, vyřazená a vybraná místa) se ukládají s programem – po návratu do kroku platí dál.
  // Uložené (i z cizího odkazu) jen v platném tvaru; bez nich výchozí.
  function prefsOf(pf, opts = {}) {
    const o = pf && typeof pf === 'object' ? pf : {};
    const ids = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x && x.length <= 120).slice(0, 300) : []);
    return {
      interests: new Set(Array.isArray(o.interests) ? o.interests.filter(x => INTERESTS.some(i => i[0] === x)) : opts.interests || []),
      pace: ['relaxed', 'normal', 'intense'].includes(o.pace) ? o.pace : opts.pace || 'normal',
      exclude: new Set(ids(o.exclude)), must: new Set(ids(o.must)),
    };
  }
  // extra: Objevuj posílá okruh načteného seznamu (server vezme stejná místa z mezipaměti) a místa za zvoleným okruhem
  // mezi vyřazenými; Cesta nic (okruh 10 km).
  async function makePlan(st, center, dates, extra) {
    const body = {
      lat: center.lat, lon: center.lon, start: dates.start, end: dates.end, arrivalTime: dates.arrivalTime, departureTime: dates.departureTime,
      pace: st.pace, interests: interestWeights(st.interests), kids: st.interests.has('kids'), exclude: [...st.exclude], include: [...st.must], ...extra,
    };
    const j = await getJson('api/itinerary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    st.items = j.places;
    st.demo = j.demo;
    // Termín, pro který program platí – při změně dat se uložený program znovu nepoužije.
    const span = { start: dates.start, end: dates.end, arrivalTime: dates.arrivalTime || null, departureTime: dates.departureTime || null };
    const prefs = { interests: [...st.interests], pace: st.pace, exclude: [...st.exclude], must: [...st.must] };
    return { days: j.days, spare: j.spare, warnings: j.warnings || [], center, span, prefs, created: Date.now() };
  }
  const sameSpan = (plan, o) => plan.span && plan.span.start === o.start && plan.span.end === o.end
    && plan.span.arrivalTime === (o.arrivalTime || null) && plan.span.departureTime === (o.departureTime || null);

  // místo stránky (krok Program) → číslo posledního plánovače v něm; dřívější plánovač, jehož dotaz ještě běží, už nekreslí
  const painters = new WeakMap();
  /**
   * Program v rámci cesty: opts { lat, lon, label, cc, start, end, arrivalTime, departureTime, plan, onPlan, interests }.
   * V horách a přírodě (api/nature: Pec pod Sněžkou = Krkonoše, Poprad = Vysoké Tatry) rovnou túra na každý den a program
   * po místech na přepnutí; jinde program – a vyjde-li hlavně příroda (horské středisko mimo seznam), nabídne i túry.
   */
  async function renderPlanner(host, opts) {
    const saved = opts.plan && Array.isArray(opts.plan.days) ? opts.plan : null;
    const plans = { hike: saved && saved.kind === 'hike' ? saved : null, city: saved && saved.kind !== 'hike' ? saved : null };
    host.innerHTML = '<div class="tp-kind" id="tpKind" hidden></div><div id="tpBody"><div class="loading-row"><span class="spin dark"></span> Skládám program…</div></div>';
    let area = null;
    try { area = (await getJson(`api/nature?lat=${+opts.lat}&lon=${+opts.lon}`)).area || null; } catch { area = null; }
    if (host.isConnected === false) return;
    let mode = plans.hike ? 'hike' : plans.city ? 'city' : area ? 'hike' : 'city';
    const kindEl = $('#tpKind', host);
    const body = $('#tpBody', host);
    const showKind = on => {
      kindEl.hidden = !on;
      if (!on) return;
      kindEl.innerHTML = `<div class="seg wrap tp-kinds">${[['hike', '🥾 Túra na každý den'], ['city', '🏙️ Program po místech']].map(([id, l]) => `<button type="button" data-tpk="${id}" class="${mode === id ? 'on' : ''}" aria-pressed="${mode === id}">${l}</button>`).join('')}</div>${
        area ? `<div class="faint tp-area">⛰️ ${esc(area.cs)} – v horách je na každý den lepší túra než program po památkách.</div>` : ''}`;
      $$('[data-tpk]', kindEl).forEach(b => b.onclick = () => { if (mode !== b.dataset.tpk) { mode = b.dataset.tpk; go(); } });
    };
    // každý druh si pamatuje svůj poslední plán (přepnutí tam a zpět nic znovu neplánuje). Plán druhu, od kterého
    // uživatel mezitím přepnul (túry se poprvé plánují i 40 s), se jen zapamatuje – programem cesty se nestane.
    let current = saved; // plán uložený v cestě
    const keep = k => plan => { plans[k] = plan; if (mode !== k) return; current = plan; opts.onPlan && opts.onPlan(plan); };
    const go = () => {
      // vykreslovat smí jen poslední plánovač v tomto místě stránky (přepnutí druhu, jiné místo trasy)
      const my = (painters.get(host) || 0) + 1;
      painters.set(host, my);
      const alive = () => painters.get(host) === my;
      showKind(Boolean(area) || mode === 'hike' || isRural(plans.city));
      // zvolený druh je program cesty (shrnutí, kalendář) – i když se jen vrací k už hotovému plánu
      if (plans[mode] && plans[mode] !== current) { current = plans[mode]; opts.onPlan && opts.onPlan(current); }
      if (mode === 'hike') hikePlanner(body, { ...opts, plan: plans.hike, onPlan: keep('hike'), alive });
      else cityPlanner(body, { ...opts, plan: plans.city, onPlan: keep('city'), alive }, rural => { if (rural && kindEl.hidden) showKind(true); });
    };
    go();
  }

  /** Túra na každý den v rámci cesty (krok Program průvodce Cestou): z ubytování, nebo ze startu u cíle. */
  async function hikePlanner(host, opts) {
    const center = { lat: opts.lat, lon: opts.lon, label: opts.label, city: opts.city, country: opts.country };
    const pf = opts.plan && opts.plan.prefs ? opts.plan.prefs : null;
    const st = { kids: pf ? Boolean(pf.kids) : Array.isArray(opts.interests) && opts.interests.includes('kids'), exclude: new Set(pf && Array.isArray(pf.exclude) ? pf.exclude.map(String) : []), map: null };
    host.innerHTML = `<div class="row wrap" style="gap:8px;margin:10px 0"><button type="button" class="fchip ${st.kids ? 'on' : ''}" data-hkids aria-pressed="${st.kids}">🧒 S dětmi</button></div>
      <div class="ex-layout"><div><div id="tpPlan"></div></div><div class="ex-map" id="tpMap"></div></div>`;
    st.map = makeMap($('#tpMap', host), center);
    let seq = 0;
    const paint = plan => {
      $('#tpPlan', host).innerHTML = hikePlanHtml(plan, center);
      fillWx($('#tpPlan', host));
      drawHikes(st, center, plan, x => { const el = $(`#tpPlan .day-plan[data-day="${x.day}"]`, host); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      $$('[data-hdrop]', host).forEach(b => b.onclick = () => { st.exclude.add(b.dataset.hdrop); run(); });
      $$('[data-hgpx]', host).forEach(b => b.onclick = () => hikeGpx(plan, +b.dataset.hgpx, center));
    };
    const run = async () => {
      const my = ++seq;
      $('#tpPlan', host).innerHTML = waitHtml('hikes', false, '');
      try {
        const plan = await makeHikePlan({ ...opts, kids: st.kids, exclude: [...st.exclude] });
        if (my !== seq) return;
        opts.onPlan && opts.onPlan(plan);
        if (opts.alive && !opts.alive()) return; // mezitím přepnuto na program po místech – místo patří jemu
        paint(plan);
      } catch (e) {
        if (my !== seq || (opts.alive && !opts.alive())) return;
        $('#tpPlan', host).innerHTML = errHtml(errLead('hikes'), e.message, 'tpRetry');
        $('#tpRetry', host).onclick = () => run();
      }
    };
    $('[data-hkids]', host).onclick = e => {
      st.kids = !st.kids;
      e.currentTarget.classList.toggle('on', st.kids);
      e.currentTarget.setAttribute('aria-pressed', String(st.kids));
      run();
    };
    const p = opts.plan;
    if (p && p.kind === 'hike' && p.center && Math.abs(p.center.lat - center.lat) < 1e-4 && Math.abs(p.center.lon - center.lon) < 1e-4 && sameSpan(p, opts)) paint(p);
    else run();
  }

  /** Program po místech v rámci cesty; onRural(true) = vyšel hlavně v přírodě (aplikace pak nabídne túry). */
  async function cityPlanner(host, opts, onRural) {
    const st = { ...prefsOf(opts.plan?.prefs, opts), items: [], map: null, layers: null };
    const center = { lat: opts.lat, lon: opts.lon, label: opts.label, city: opts.city, country: opts.country, ...(opts.startAt === 'center' ? { startAt: 'center' } : {}) };
    host.innerHTML = `${plannerControls(st)}<div class="ex-layout"><div><div id="tpPlan"><div class="loading-row"><span class="spin dark"></span> Hledám, co stojí za vidění, a skládám program…</div></div></div><div class="ex-map" id="tpMap"></div></div>`;
    st.map = makeMap($('#tpMap', host), center);
    let seq = 0;
    const run = async () => {
      const my = ++seq; // jen poslední dotaz smí vykreslit (rychlé klikání na zájmy)
      try {
        const plan = await makePlan(st, center, opts);
        if (my !== seq) return;
        opts.onPlan && opts.onPlan(plan);
        if (opts.alive && !opts.alive()) return; // mezitím přepnuto na túry – místo patří jim
        paint(plan);
      } catch (e) {
        if (my !== seq || (opts.alive && !opts.alive())) return;
        $('#tpPlan', host).innerHTML = errHtml(errLead('city'), e.message, 'tpRetry');
        $('#tpRetry', host).onclick = () => { $('#tpPlan', host).innerHTML = '<div class="loading-row"><span class="spin dark"></span> Skládám program…</div>'; run(); };
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
      if (onRural) onRural(isRural(plan));
      drawOnMap(st, center, st.items.filter(p => plan.days.some(d => d.items.some(q => q.id === p.id)) || p.category !== 'daytrip'), plan, p => { const el = $(`[data-poi="${CSS.escape(p.id)}"]`, host); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      $$('[data-drop]', host).forEach(b => b.onclick = () => dropUndo(st, b.dataset.drop, plan, run));
      $$('[data-must]', host).forEach(b => b.onclick = e => { e.stopPropagation(); st.must.add(b.dataset.must); st.exclude.delete(b.dataset.must); run(); });
    };
    $$('[data-int]', host).forEach(b => b.onclick = () => { st.interests.has(b.dataset.int) ? st.interests.delete(b.dataset.int) : st.interests.add(b.dataset.int); b.classList.toggle('on', st.interests.has(b.dataset.int)); b.setAttribute('aria-pressed', st.interests.has(b.dataset.int)); run(); });
    $('[data-pace]', host).onchange = e => { st.pace = e.target.value; run(); };
    if (opts.plan && opts.plan.days && opts.plan.center && Math.abs(opts.plan.center.lat - center.lat) < 1e-4 && Math.abs(opts.plan.center.lon - center.lon) < 1e-4 && sameSpan(opts.plan, opts)) {
      try { const j = await getJson(`api/poi?lat=${center.lat}&lon=${center.lon}`); st.items = j.items; st.demo = j.demo; } catch { st.items = []; }
      if (opts.alive && !opts.alive()) return;
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
    for (const k of ['radius', 'mode', 'start', 'datePicked', 'days', 'transport', 'pace', 'recent', 'cCat']) if (r[k] !== undefined) ex[k] = r[k];
    if (r.place) ex.place = r.place;
    Object.assign(ex.tripDays, r.tripDays);
    Object.assign(ex.bike, r.bike);
    Object.assign(ex.hike, r.hike);
    if (r.interests) ex.interests = new Set(r.interests);
    if (r.tripInterests) ex.tripInterests = new Set(r.tripInterests);
  }
  // Zapamatovaný stav jednou – i před prvním otevřením Objevuj (náhled cíle z letů potřebuje zvolený okruh).
  function ensureUi() { if (!ex.restored) { ex.restored = true; if (!ex.place) restoreUi(); } }

  // seznam míst na telefonu: prvních LIST_TOP karet, ostatní po „Zobrazit další místa“ (24 karet = 3 400 px)
  const LIST_TOP = 8;
  // ✨ příklady vět pod hledáním (Smart.parseExplore)
  const EX_TRY = ['Lisabon na 3 dny', 'výlety z Brna', 'Krakov pěšky 10 km', 'Vídeň na kole'];
  // Inspirace na prázdném Objevuj: karty s fotkou oblíbených měst – klepnutí = místa k vidění v okolí
  const INSP = [
    { label: 'Lisabon', lat: 38.7223, lon: -9.1393, cc: 'PT', country: 'Portugalsko' }, { label: 'Řím', lat: 41.9028, lon: 12.4964, cc: 'IT', country: 'Itálie' },
    { label: 'Barcelona', lat: 41.3874, lon: 2.1686, cc: 'ES', country: 'Španělsko' }, { label: 'Paříž', lat: 48.8566, lon: 2.3522, cc: 'FR', country: 'Francie' },
    { label: 'Dubrovník', lat: 42.6507, lon: 18.0944, cc: 'HR', country: 'Chorvatsko' }, { label: 'Amsterdam', lat: 52.3676, lon: 4.9041, cc: 'NL', country: 'Nizozemsko' },
    { label: 'Istanbul', lat: 41.0082, lon: 28.9784, cc: 'TR', country: 'Turecko' }, { label: 'Kodaň', lat: 55.6761, lon: 12.5683, cc: 'DK', country: 'Dánsko' },
    { label: 'Český Krumlov', lat: 48.8127, lon: 14.3175, cc: 'CZ', country: 'Česko' }, { label: 'Kjóto', lat: 35.0116, lon: 135.7681, cc: 'JP', country: 'Japonsko' },
  ];
  /**
   * Místa rozpracované cesty z průvodce Cesta (let ještě neproběhl) – v Inspiraci mezi cestami uživatele (ownPlaces)
   * se štítkem „🧳 Tvoje cesta“: cíl, nebo všechna místa trasy (od kdy tam jsi). Cesta kamaráda z odkazu (#trip=), kterou
   * si příjemce neuložil, „🔗 Sdílená cesta“ (shared) – jeho cesta to ještě není.
   */
  function tripPlaces(t = typeof S !== 'undefined' && S.trip) {
    const out = t && t.flight && t.flight.out;
    if (!out || !(out.date >= fmtYMD(new Date()))) return [];
    return wizPlaces(t, out.date).map(p => ({ ...p, ...(t.shared ? { shared: true } : {}) }));
  }
  /** Místa cesty z průvodce t (i její kopie v plánovači): cíl od dne start, nebo místa trasy – bez opakování, nejvýš 4. */
  function wizPlaces(t, start) {
    let dates = [];
    try { dates = window.Trip && Trip.baseDates ? Trip.baseDates(t) : []; } catch (e) { dates = []; }
    const bases = t.route && t.route.mode === 'multi' && Array.isArray(t.route.bases) && t.route.bases.length ? t.route.bases : null;
    const list = bases ? bases.map((b, i) => ({ label: b.name, lat: b.lat, lon: b.lon, cc: b.cc, country: b.country, from: dates[i] && dates[i].checkin }))
      : t.dest ? [{ label: String(t.dest.label || '').replace(/ \(.*\)$/, ''), lat: t.dest.lat, lon: t.dest.lon, cc: t.dest.cc, country: t.dest.country, from: start }] : [];
    const seen = new Set();
    return list.filter(p => p.label && p.lat != null && p.lon != null && cleanPlace(p) && !seen.has(p.label) && seen.add(p.label)).slice(0, 4).map(p => ({ ...p, trip: true }));
  }
  /**
   * Místa cesty z plánovače: uložená z průvodce z jeho kopie (wizard), cesta jen z plánovače má jen název cíle – poloha
   * z Inspirace, jinak ji po klepnutí najde smartPlace (jako 🔁); cíl = země („Itálie“) otevře celou zemi (whole).
   */
  function savedPlaces(t) {
    if (t.wizard && typeof t.wizard === 'object') {
      try { const l = wizPlaces(t.wizard, t.start); if (l.length) return l; } catch (e) { /* poškozená kopie: aspoň podle názvu */ }
    }
    // „Řím, Barcelona“ (víc letů z hledání) i „Řím → Barcelona“: první místo, jako fotka karty v plánovači
    const label = String((t.place && t.place.label) || t.dest || '').split(/,|→/)[0].replace(/\s*\(.*\)$/, '').trim().slice(0, 120);
    if (!label || label === '—') return [];
    const cc = /^[A-Z]{2}$/.test(t.iso || '') && countryCs(t.iso) ? t.iso : '';
    if (cc && foldName(label) === foldName(countryCs(cc))) return [{ label, cc, country: countryCs(cc), whole: cc, from: t.start, trip: true }];
    return [{ ...(INSP.find(p => p.label === label) || { label, cc, country: countryCs(cc) }), from: t.start, trip: true }];
  }
  /**
   * 🧳 Místa cest uživatele v Inspiraci, nejbližší cesta první: rozpracovaná v průvodci (tripPlaces) a nadcházející
   * z plánovače (S.trips – s datem, proběhlé ne). Tatáž cesta uložená z průvodce (tripId = created) jen jednou, z průvodce
   * (může být novější než uložená kopie). Bez opakování, nejvýš 6 – za nimi 🔁 hledání a oblíbená města.
   */
  function ownPlaces(w = typeof S !== 'undefined' && S.trip, trips = typeof S !== 'undefined' && S.trips, today = fmtYMD(new Date())) {
    const wp = tripPlaces(w), groups = wp.length ? [{ start: w.flight.out.date, list: wp }] : [];
    for (const t of Array.isArray(trips) ? trips : []) {
      if (!t || typeof t !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(t.start || '') || (t.end || t.start) < today) continue;
      if (wp.length && t.tripId && t.tripId === w.created) continue;
      groups.push({ start: t.start, list: savedPlaces(t) });
    }
    const seen = new Set();
    return groups.sort((a, b) => a.start.localeCompare(b.start)).flatMap(g => g.list).filter(p => !seen.has(p.label) && seen.add(p.label)).slice(0, 6);
  }
  const ccOfFlag = f => { const c = [...String(f || '')].map(x => x.codePointAt(0) - 0x1F1E6); return c.length === 2 && c.every(x => x >= 0 && x < 26) ? String.fromCharCode(65 + c[0], 65 + c[1]) : ''; };
  /**
   * 🔁 Města, kam uživatel nedávno hledal letenky (S.recent) – v Inspiraci hned za vlastní cestou (nejvýš 2). Souřadnice
   * z Inspirace, jinak žádné: místo najde smartPlace až po klepnutí.
   */
  function searchedPlaces(skip = [], recent = typeof S !== 'undefined' && S.recent) {
    const out = [], seen = new Set(skip);
    for (const e of (Array.isArray(recent) ? recent : [])) {
      for (const x of (e && e.form && Array.isArray(e.form.to) ? e.form.to : [])) {
        if (!x || !['metro', 'city', 'airport'].includes(x.type)) continue;
        const label = String(x.label || '').replace(/\s*\(.*\)$/, '').trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        const known = INSP.find(p => p.label === label);
        out.push({ ...(known || { label, cc: ccOfFlag(x.flag) }), searched: true });
        if (out.length >= 2) return out;
      }
    }
    return out;
  }
  const inspList = () => {
    const tp = ownPlaces(), sp = searchedPlaces(tp.map(p => p.label)), own = new Set([...tp, ...sp].map(p => p.label));
    return [...tp, ...sp, ...INSP.filter(p => !own.has(p.label))];
  };
  const inspSub = p => (p.trip ? `${p.shared ? '🔗 Sdílená cesta' : '🧳 Tvoje cesta'}${p.from ? ` · od ${fmtDate(p.from)}` : ''}` : p.searched ? '🔁 hledal jsi sem lety' : esc(p.country || ''));
  const inspHtml = (list = inspList()) => `<div class="section-head ex-insp-h"><h2>Inspirace</h2></div><div class="dest-grid ex-insp">${list.map((p, i) => `<button type="button" class="card dest${p.trip || p.searched ? ' ex-mine' : ''}" data-insp="${i}" data-photo="${esc(p.label)}" style="--h:${window.ccHue ? ccHue(p.cc) : 215}"><div class="flag">${flag(p.cc)}</div><div class="dest-panel"><div class="cname">${esc(p.label)}</div><div class="ccont">${inspSub(p)}</div><div class="meta"><span class="chip accent">Co tam vidět</span><span>→</span></div></div></button>`).join('')}</div>`;
  /* ---------- 🌍 Celá země bez místa: výběr země (oblíbené nahoře, pak všechny A–Ž) ---------- */
  const CC_POP = ['IT', 'FR', 'ES', 'HR', 'GR', 'PT', 'CZ', 'AT', 'DE', 'GB', 'NL', 'TR'];
  function pickerHtml() {
    const all = typeof byIso !== 'undefined' ? Object.values(byIso).filter(c => c && c.iso2 && c.cs).sort((a, b) => a.cs.localeCompare(b.cs, 'cs')) : [];
    const pop = CC_POP.filter(cc => all.some(c => c.iso2 === cc));
    const tile = cc => `<button type="button" class="ex-cc-tile" data-cc="${cc}" data-ccn="${esc(foldName(`${countryCs(cc)} ${byIso[cc].en || ''}`))}"><span class="ex-cc-flag">${flag(cc)}</span><span>${esc(countryCs(cc))}</span></button>`;
    return `<div class="section-head ex-cc-h"><h2>🌍 Vyber zemi</h2></div>
      <div class="muted ex-cnote">To nejlepší v celé zemi: města, další cíle, památky UNESCO a národní parky na mapě. Zemi můžeš i napsat do hledání („Francie“, „Itálie“).</div>
      <input class="input ex-cc-q" id="exCcQ" placeholder="Hledat zemi…" autocomplete="off" aria-label="Hledat zemi">
      <div class="ex-cc-pop" id="exCcPop">${pop.map(tile).join('')}</div>
      <div class="poi-sec ex-cc-allh"><b>Všechny země</b> <span class="faint">(${all.length})</span></div>
      <div class="ex-cc-all" id="exCcAll">${all.map(c => tile(c.iso2)).join('')}</div>
      <div class="empty" id="exCcNone" hidden>Takovou zemi neznám – zkus její český nebo anglický název.</div>`;
  }
  function wirePicker(root) {
    const qi = $('#exCcQ', root);
    $$('[data-cc]', root).forEach(b => b.onclick = () => openWholeCountry(b.dataset.cc));
    if (!qi) return;
    qi.oninput = () => {
      const f = foldName(qi.value);
      let n = 0;
      $$('#exCcAll [data-cc]', root).forEach(b => { const on = !f || b.dataset.ccn.split(' ').some(w => w.startsWith(f)) || b.dataset.ccn.startsWith(f); b.hidden = !on; if (on) n++; });
      const pop = $('#exCcPop', root); if (pop) pop.hidden = Boolean(f);
      const none = $('#exCcNone', root); if (none) none.hidden = n > 0;
    };
    qi.onkeydown = e => { if (e.key !== 'Enter') return; const b = $$('#exCcAll [data-cc]', root).find(x => !x.hidden); if (b) openWholeCountry(b.dataset.cc); };
  }
  /**
   * 🌍 Celá země vybraná jménem (výběr, hledání, okno země): místo = hlavní město (střed z vlastních dat, odtud
   * vzdálenosti), jinak první město z přehledu země. Přehled se načte jednou, „🏙️ Řím · okruh“ pak vede do města.
   */
  async function openWholeCountry(cc) {
    const c = typeof byIso !== 'undefined' && byIso[cc];
    if (!c) return;
    ensureUi();
    if (typeof ex.radius === 'number') ex.lastKm = ex.radius;
    ex.radius = COUNTRY;
    const sel = $('#exRad'); if (sel) sel.value = COUNTRY;
    const my = ++exSeq;
    const body = $('#exBody');
    if (body) body.innerHTML = waitHtml('country', false, '');
    const capName = c.capCs || c.cap || '';
    let p = null, data = null;
    if (capName) {
      const j = await getJson('api/places?remote=0&q=' + enc(capName)).catch(() => ({ items: [] }));
      const it = (j.items || []).find(x => x && x.cc === cc && (x.type === 'metro' || x.type === 'city') && Number.isFinite(+x.lat) && Number.isFinite(+x.lon));
      if (it) p = { label: capName, lat: +it.lat, lon: +it.lon };
    }
    if (my !== exSeq) return;
    if (!p) {
      // hlavní město v datech není: přehled země jen podle kódu, místo = hlavní (jinak první) město přehledu
      try { data = await getJson(`api/poi/country?cc=${enc(cc)}`); } catch (e) {
        if (my !== exSeq) return;
        if (body && body.isConnected) { body.innerHTML = errHtml('Přehled země se nepodařilo načíst', e.message, 'exRetry'); $('#exRetry', body).onclick = () => openWholeCountry(cc); }
        return;
      }
      if (my !== exSeq) return;
      const cities = (data.city || []).filter(okPt);
      const cap = cities.find(x => [c.capCs, c.cap].some(n => n && foldName(n) === foldName(x.name))) || cities[0] || (data.dest || []).filter(okPt)[0];
      if (!cap) { if (body && body.isConnected) body.innerHTML = '<div class="empty">Pro tuhle zemi jsem nic nenašel – napiš do hledání nahoře konkrétní město nebo místo.</div>'; return; }
      p = { label: cap.name, lat: cap.lat, lon: cap.lon };
      data = { ...data, ...Object.fromEntries(C_GROUPS.map(([g]) => [g, (data[g] || []).map(x => (okPt(x) ? { ...x, distanceKm: Math.round(kmBetween([p.lon, p.lat], [x.lon, x.lat])) } : x))])) };
    }
    setPlace({ ...p, cc, country: c.cs, capital: true });
    if (data) ex.country = { place: ex.place, data };
    const root = $('#exploreRoot');
    if (root) { renderExplore(root); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  function renderExplore(root) {
    if (!root) return;
    ensureUi();
    if (!ex.start || ex.start < fmtYMD(new Date())) { ex.start = plusDays(fmtYMD(new Date()), 1); ex.datePicked = false; }
    const insp = inspList();
    // bez místa: fotka krásného místa s nadpisem nahoře, hledání na ní (jako Lety)
    root.innerHTML = `${ex.place ? '' : `<div class="fl-hero ex-hero" data-photo="${esc(window.heroPlace ? heroPlace(9) : 'Porto')}"><div class="fl-hero-in"><h1>Objev, co stojí za vidění</h1><p>Památky, muzea, vyhlídky a výlety kdekoliv na světě – a z nich program na pár dní</p></div></div>`}<div class="card search-card${ex.place ? '' : ' on-hero'}">
      <div class="ex-search">
        <div class="field" style="margin:0"><label for="exQ">Kam se chceš podívat? <span class="lab-hint">město, obec, ostrov, místo…</span></label>
          <div style="position:relative"><input class="input${ex.place ? ' has-clear' : ''}" id="exQ" placeholder="Lisabon, Francie, „Řím na 3 dny“" autocomplete="off" value="${esc(qLabel())}">${ex.place ? '<button type="button" class="in-clear" id="exClear" title="Začít znovu – zrušit místo i plány" aria-label="Začít znovu">✕</button>' : ''}<div class="pi-dd" id="exDd" hidden></div></div></div>
        <button class="btn ghost" id="exGeo" title="Moje poloha" style="align-self:end">📍 Tady</button>
        <div class="field" style="margin:0"><label for="exRad">Okruh</label><select id="exRad">${RADII.map(r => `<option value="${r}" ${ex.radius === r ? 'selected' : ''}>${r} km</option>`).join('')}<option value="${COUNTRY}" ${ex.radius === COUNTRY ? 'selected' : ''}>🌍 Celá země</option></select></div>
      </div><div class="ex-recent" id="exRecent" hidden></div>${ex.place || !window.Smart ? '' : `<div class="ex-try"><span class="faint">✨ Zkus:</span>${EX_TRY.map((x, i) => `<button type="button" class="fchip" data-extry="${i}">${esc(x)}</button>`).join('')}</div>`}</div>
      <div id="exBody">${ex.place ? '' : ex.radius === COUNTRY ? pickerHtml() : inspHtml(insp)}</div>
      <button type="button" class="ex-back" id="exBack" hidden></button>`;
    wireExploreSearch(root);
    if (!ex.place && ex.radius === COUNTRY) wirePicker(root);
    paintRecent();
    wireBack();
    const cl = $('#exClear', root); if (cl) cl.onclick = () => resetExplore();
    $$('[data-insp]', root).forEach(b => b.onclick = async () => {
      const it = insp[+b.dataset.insp], p = cleanPlace(it);
      if (p) return openPlace(p);
      if (it && it.whole) return openWholeCountry(it.whole); // cesta z plánovače do celé země
      if (!it || !(it.searched || it.trip) || b.disabled) return;
      // 🔁 město z hledání letů (i cíl cesty jen z plánovače) bez souřadnic: najít (jako ✨ věta)
      b.disabled = true;
      let down = false;
      const s = await smartPlace(it.label).catch(e => { down = Boolean(e && e.down); return null; });
      b.disabled = false;
      if (s) openPlace(s); else toast(down ? 'Místa teď nejde dohledat – zkontroluj připojení a zkus to znovu' : `Místo „${it.label}“ jsem nenašel – napiš ho do hledání`, 'err');
    });
    // ✨ příklady vět: vepsat do hledání a spustit jako Enter (místo, druh plánu, dny)
    $$('[data-extry]', root).forEach(b => b.onclick = () => { const q = $('#exQ', root); q.value = EX_TRY[+b.dataset.extry]; q.focus(); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    if (window.Photos) Photos.paint(root);
    // Návrat do Objevuj: už načtený seznam (přehled země) se jen překreslí (žádný nový dotaz na server).
    if (ex.place && ex.radius === COUNTRY) { if (ex.country?.place === ex.place && ex.country.data) paintCountry(); else loadCountry(); }
    else if (ex.place && ex.loaded?.place === ex.place && !needsFetch(ex.loaded.radius, cityKm(ex.radius))) paintExplore();
    else if (ex.place) loadExplore();
  }

  /**
   * ✨ Místo z věty: základní tvar (Smart.nominatives – „Brna“ → Brno). Napřed tvar, který zná našeptávač letů (známá
   * města, letiště, země) – ten se geokóduje; jinak geokódování s přesným názvem (upravené tvary před původním), nakonec
   * první výsledek původního tvaru.
   */
  // Tvary jména z věty: původní první, pak 1. pád s přídavným jménem („Českého Krumlova“ → Český Krumlov – geokódování
  // ani vlastní data „Českého Krumlov“ neznají), pak tvary posledního slova (Smart.nominatives)
  const placeCands = phrase => { const n = Smart.nominatives(phrase); return [...new Set([...n.slice(0, 1), ...(Smart.placeForms ? Smart.placeForms(phrase).slice(0, 2) : []), ...n.slice(1)])]; };
  // ✨ řádek: základní tvar místa z věty („Římě“ → Řím) jen z vlastních dat (rychle, bez geokódování); null = nevím
  const smartNames = new Map();
  async function smartName(phrase) {
    const cands = placeCands(phrase), same = (a, b) => Smart.fold(String(a || '').replace(/\s*\(.*\)$/, '')) === Smart.fold(b);
    // nature=1: i hory a příroda („na Sněžku“ → Sněžka, „do Krkonoš“ → Krkonoše)
    const fl = await Promise.all(cands.map(c => getJson('api/places?remote=0&nature=1&q=' + enc(c)).then(j => j.items || [], () => [])));
    let name = null;
    for (const [i, c] of cands.entries()) {
      // remote=0: jen vlastní data (i města bez letiště – Olomouc), geokódované vesnice tu nejsou
      const it = fl[i].find(x => [x.label, x.en, ...(x.aliases || [])].some(n => n && same(n, c)));
      if (it) { name = String(it.label).replace(/\s*\(.*\)$/, ''); break; }
    }
    // překlep („Krakv“): oprava z našeptávače – ✨ řádek ukáže, co se bude hledat
    const fz = name ? null : fl.flat().find(x => x.fuzzy);
    if (fz) name = String(fz.label).replace(/\s*\(.*\)$/, '');
    if (smartNames.size > 50) smartNames.clear();
    smartNames.set(phrase, name);
    return name;
  }
  async function smartPlace(phrase) {
    const cands = placeCands(phrase), same = (a, b) => Smart.fold(String(a || '').replace(/\s*\(.*\)$/, '')) === Smart.fold(b);
    let failed = 0;
    // remote=0: níž se berou jen místa z vlastních dat (ne geo:) – geokódování každého tvaru by jen zdrželo a stálo dotazy;
    // nature=1: i hory a příroda přesným názvem nebo tvarem („Krkonoš“)
    const fl = await Promise.all(cands.map(c => getJson('api/places?remote=0&nature=1&q=' + enc(c)).then(j => j.items || [], () => { failed++; return []; })));
    // server nedostupný (žádný dotaz neprošel) – ne „místo neznám“
    if (cands.length && failed === cands.length) throw Object.assign(new Error('Server teď neodpovídá'), { down: true });
    // hory a příroda (Sněžka, „v Krkonoších“, „do Dolomit“) rovnou s polohou: geokodér je zná špatně (Šumava = zastávka) a
    // před oblastí stejného jména (Dolomity – město jejich letiště, Verona, do hor nevede)
    for (const items of fl) { const n = items.find(x => x.nature); if (n) return n; }
    // jen místa z databáze letů (letiště, města, země, oblasti) – geokódované vesnice (geo:…, „Brná“ pro „Brna“) ne;
    // shoda i podle jiného názvu (en „Rome“, místní „Roma“, „Toscana“) → hledá se český název („Řím“, „Toskánsko“)
    let known = null, region = null;
    for (const [i, c] of cands.entries()) {
      const it = fl[i].find(x => !/^geo:/.test(x.id || '') && [x.label, x.en, ...(x.aliases || [])].some(n => n && same(n, c)));
      if (it) { known = String(it.label).replace(/\s*\(.*\)$/, ''); if (it.type === 'region') { region = await regionCity(it); if (region) known = region.name; } break; }
    }
    const geo = async c => (await getJson('api/geocode?q=' + enc(c)).catch(() => ({ items: [] }))).items || [];
    for (const c of known ? [known] : [...cands.slice(1), cands[0]]) {
      const items = await geo(c), hit = items.find(it => same(it.label, c)) || (known && !region ? items[0] : null);
      if (hit) return region ? { ...hit, region: region.key } : hit;
    }
    // město oblasti, které geokódování česky nezná (Heraklion → jen „Heraklion Airport Terminal“): poloha letiště
    if (region) return { label: region.name, lat: region.ap.lat, lon: region.ap.lon, cc: region.ap.cc || '', region: region.key };
    // překlep („Krakv“, „Lisabn“): oprava z našeptávače míst letů (fuzzy) – geokódování by našlo Krokvåg v Norsku
    const fz = known ? null : fl.flat().find(x => x.fuzzy && !/^geo:/.test(x.id || ''));
    if (fz) {
      const rc = fz.type === 'region' ? await regionCity(fz) : null, nm = rc ? rc.name : String(fz.label).replace(/\s*\(.*\)$/, '');
      const hit = (await geo(nm)).find(it => same(it.label, nm));
      if (hit) return rc ? { ...hit, region: rc.key } : hit;
      if (rc) return { label: rc.name, lat: rc.ap.lat, lon: rc.ap.lon, cc: rc.ap.cc || '', region: rc.key };
    }
    return (await geo(cands[0]))[0] || null;
  }
  // oblast (Toskánsko, Kréta…) nemá v geokódování střed – místo ní město jejího prvního letiště (Florencie, Heraklion);
  // key (toskansko) jde s místem do okruhu, ať zastávky zůstanou v oblasti
  async function regionCity(it) {
    const iata = (String(it.sub || '').match(/\b[A-Z]{3}\b/) || [])[0];
    if (!iata) return null;
    const ap = ((await getJson('api/places?q=' + enc(iata)).catch(() => ({ items: [] }))).items || []).find(x => x.id === 'ap:' + iata);
    // „Kréta (Heraklion)“ → město letiště (anglicky Heraklion), „Florencie“ → Florencie; ap = poloha pro zálohu
    return ap && Number.isFinite(+ap.lat) ? { name: /\(.*\)$/.test(ap.label) && ap.en ? ap.en : String(ap.label).replace(/\s*\(.*\)$/, ''), ap, key: String(it.id || '').replace(/^rg:/, '') } : null;
  }
  /** ✨ Volby z věty do Objevuj: druh plánu, dny, délka trasy, od kdy, zájmy; plán se po načtení míst sestaví sám. */
  function exploreApply(px, s) {
    // věta bez druhu plánu, ale s dny nebo zájmy („Lisabon na 3 dny“, „Řím s dětmi“) = program ve městě – ne kolo
    // z minulé věty; oblast na víc dní („Toskánsko na 4 dny“, „Kréta na týden“) = okruh po oblasti, ne program jen
    // v jejím městě (Florencie)
    // věta plánuje místo – ne přehled celé země
    if (ex.radius === COUNTRY) ex.radius = ex.lastKm || 10;
    if (px.mode) ex.mode = px.mode;
    else if (s && s.region && px.days >= 2) ex.mode = 'loop';
    // hory a příroda na víc dní („Krkonoše na 3 dny“): túra na každý den, ne program po místech
    else if (s && NATURE_KINDS.includes(s.nature) && px.days >= 2) { ex.mode = 'hike'; ex.hike.kind = 'days'; }
    else if (px.days || px.interests.length) ex.mode = 'city';
    if (px.mode === 'hike' && px.days >= 2) ex.hike.kind = 'days';
    // druh plánu z věty platí – u dalšího místa ho natureMode nevrátí (hory pak z „programu ve městě“ udělají pěšky)
    if (ex.auto && (px.mode || px.days || px.interests.length)) ex.auto.mode = null;
    const road = ex.mode === 'day' || ex.mode === 'loop';
    if (px.days) {
      const opts = ex.mode === 'loop' ? [2, 3, 4, 5, 6, 7, 10] : ex.mode === 'day' ? [1, 2, 3, 4, 5, 7] : [1, 2, 3, 4, 5, 6, 7, 10];
      const d = opts.filter(x => x <= px.days).pop() || opts[0];
      if (road) ex.tripDays[ex.mode] = d; else ex.days = d;
    }
    const near = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    if (px.km && ex.mode === 'bike') ex.bike.km = near([15, 25, 40, 60, 80, 100, 130], px.km);
    if (px.km && ex.mode === 'hike') ex.hike.km = near([5, 8, 10, 12, 15, 20, 25, 30], px.km);
    if (px.start) { ex.start = px.start; ex.datePicked = true; }
    // zájmy programu ve městě (history, art, nature, kids) a výletů (sights, culture, nature, kids)
    for (const k of px.interests) { if (road) ex.tripInterests.add({ history: 'sights', art: 'culture' }[k] || k); else ex.interests.add(k); }
    ex.planOpen = true; ex.autoPlan = true;
    remember();
  }

  // Nové místo: všechno, co patřilo k předchozímu (plány, vyřazená a vybraná místa, filtr, chyby), se zahodí.
  function setPlace(s) {
    // země podle kódu (česky, „Španělsko“) – kontext pro odkazy do Google Map
    const country = s.geo ? '' : s.country || (typeof byIso !== 'undefined' && byIso[s.cc]?.cs) || '';
    ex.place = { lat: s.lat, lon: s.lon, label: s.label, cc: s.cc || '', geo: Boolean(s.geo), country, ...(s.region ? { region: s.region } : {}), ...(s.capital ? { capital: true } : {}),
      ...(NATURE_KINDS.includes(s.nature) ? { nature: s.nature, ...(RADII.includes(+s.km) ? { km: +s.km } : {}) } : {}) };
    natureMode(ex.place);
    forget();
    if (!s.capital) ex.recent = pushRecent(ex.recent, ex.place); // hlavní město z výběru země do „Naposledy“ ne
    remember();
  }
  /**
   * Hory a příroda (Sněžka, Šumava, Pravčická brána): místo programu ve městě po památkách 🥾 pěšky s otevřeným plánováním
   * a okruh na celou oblast (km ze serveru: pohoří 20 km, hora nebo jeskyně 10 km; menší zvolený okruh se zvětší).
   * U dalšího místa (město) zpět, co bylo předtím – jen co uživatel mezitím sám nezměnil.
   */
  function natureMode(p) {
    const a = ex.auto;
    ex.auto = null;
    if (a) { if (ex.mode === a.mode) { ex.mode = a.was.mode; ex.planOpen = a.was.planOpen; } if (ex.radius === a.radius) ex.radius = a.was.radius; }
    if (!p || !p.nature) return;
    const was = { mode: ex.mode, radius: ex.radius, planOpen: ex.planOpen };
    if (ex.mode === 'city') { ex.mode = 'hike'; ex.planOpen = true; }
    const km = areaKm(p);
    if (typeof ex.radius === 'number' && ex.radius < km) ex.radius = km;
    if (ex.mode !== was.mode || ex.radius !== was.radius) ex.auto = { mode: ex.mode, radius: ex.radius, was };
  }
  // okruh oblasti místa v přírodě (ze serveru; starší záznam bez km: pohoří a parky 20 km, jinak 10 km)
  const areaKm = p => p.km || (p.nature === 'range' || p.nature === 'park' ? 20 : 10);
  // Pěšky u hor a přírody: druh a okruh oblasti do api/hike – server najde start u cíle (parkoviště, nádraží, obec)
  // a okruh povede přes cíl; u města nic
  const hikeNature = p => (p && p.nature ? { nature: p.nature, area: areaKm(p) } : {});
  // plány, vyřazená a vybraná místa, filtr a chyby místa
  function forget() {
    ex.listAll = false;
    ex.plan = null; ex.trips = {}; ex.bikeRoute = null; ex.trainRoute = null; ex.hikeRoute = null; ex.hikePlan = null; ex.hikeEx.clear(); ex.tripEx.clear(); ex.tripMust.clear();
    ex.cat = ''; ex.planState = null; ex.errs = {}; ex.loaded = null; ex.all = []; ex.items = []; ex.far = null; ex.country = null;
    for (const k of Object.keys(busy)) delete busy[k];
    redo.clear();
    clearTimeout(soonT); ex.replanNow = null; // odložené přeplánování patřilo předchozímu místu
  }
  /** ↺ Začít znovu: bez místa a plánů zpět na inspiraci (okruh, zájmy a „Naposledy“ zůstanou). */
  function resetExplore() {
    exSeq++; // načítání míst zrušeného místa už nic nepřepíše
    ex.place = null; forget();
    remember();
    const root = $('#exploreRoot');
    if (root) { renderExplore(root); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  function openPlace(s) {
    setPlace(s);
    // první místo: úvodní fotka nahoře už není potřeba – Objevuj znovu (s ✕ a místy rovnou pod hledáním)
    const root = $('#exploreRoot');
    if (root && $('.ex-hero', root)) return renderExplore(root);
    const q = $('#exQ');
    if (q) q.value = s.label;
    const sel = $('#exRad');
    if (sel) sel.value = String(ex.radius); // okruh podle místa (hory: celá oblast)
    paintRecent();
    loadExplore();
  }
  /**
   * Objevuj na místě odjinud (🔎 Co tam je ve výsledcích letů a v radaru) – jako místo vybrané v hledání: program ve městě
   * od dne příletu (start) na dny ve městě (days → nejbližší nabízený nižší počet; 0 = jen tam, zvolený počet zůstane).
   * Místa převezme z náhledu (preview, i ještě běžícího), zapamatované volby (okruh, zájmy, tempo) platí dál.
   * Neplatné místo → false a Objevuj se neotevře.
   */
  function openAt(s, { start = '', days = 0 } = {}) {
    const p = cleanPlace({ ...s, geo: false });
    if (!p) return false;
    ensureUi();
    if (okStart(start, fmtYMD(new Date()))) { ex.start = start; ex.datePicked = true; }
    const d = [1, 2, 3, 4, 5, 6, 7, 10].filter(x => x <= days).pop();
    if (d) ex.days = d;
    ex.mode = 'city';
    if (ex.radius === COUNTRY) ex.radius = ex.lastKm || 10; // program ve městě, ne přehled země
    setPlace(p);
    go('explore'); // renderExplore: místa z náhledu hned, jinak dotaz
    return true;
  }

  /** 🌍 Objevuj celou zemi odjinud (okno země v Zemích): přepnout na Objevuj a otevřít přehled země. */
  function openCountryView(cc) {
    if (typeof byIso === 'undefined' || !byIso[cc]) return false;
    ensureUi();
    if (typeof ex.radius === 'number') ex.lastKm = ex.radius;
    ex.radius = COUNTRY;
    if (!ex.place || ex.place.cc !== cc) { exSeq++; ex.place = null; forget(); }
    go('explore');
    if (!ex.place) openWholeCountry(cc);
    return true;
  }

  /* ---------- 🔎 Co tam je: náhled cíle z výsledků letů a radaru (flights.js) ---------- */
  // Místa stejným dotazem jako výchozí seznam Objevuj (okruh 10 km i s výlety; větší zvolený okruh Objevuj má přednost),
  // takže „🗺️ Naplánovat v Objevuj“ nečeká na druhý pomalý dotaz na Wikidata: loadExplore převezme hotový i ještě běžící
  // dotaz náhledu (pvFor). Menší zvolený okruh náhled z načtených míst jen vyfiltruje (previewHtml).
  // Výsledek drží 30 min, chyba se nepamatuje (další otevření se zeptá znovu).
  const PREVIEW_KM = 10;
  const PV_TTL = 30 * 60e3;
  const pv = new Map(); // místo (lat,lon na 3 desetinná místa jako mezipaměť serveru) → { km, at, p }
  const pvKey = p => `${(+p.lat).toFixed(3)},${(+p.lon).toFixed(3)}`;
  const poiUrl = (p, km) => `api/poi?lat=${p.lat}&lon=${p.lon}&radius=${km}`;
  // dotaz náhledu na místo p, který pokryje okruh km, nebo null
  const pvFor = (p, km, now = Date.now()) => { const x = pv.get(pvKey(p)); return x && x.km >= km && now - x.at < PV_TTL ? x : null; };
  /** Místa pro náhled cíle p ({ lat, lon }) → Promise({ items, demo, km }); znovu otevřený cíl bez nového dotazu. */
  function preview(p) {
    ensureUi();
    const km = Math.max(PREVIEW_KM, cityKm(ex.radius)), k = pvKey(p), hit = pvFor(p, km);
    if (hit) return hit.p;
    const x = { km, at: Date.now() };
    x.p = getJson(poiUrl(p, km)).then(j => ({ items: j.items || [], demo: Boolean(j.demo), km }), e => { if (pv.get(k) === x) pv.delete(k); throw e; });
    pv.delete(k); pv.set(k, x);
    if (pv.size > 12) pv.delete(pv.keys().next().value);
    return x.p;
  }
  /** Co vidět: nejvýš n míst ve městě (ne výlety do okolí) podle skóre – napřed s fotkou, bez fotky jen doplní. */
  function previewPick(items, n = 6) {
    const city = (items || []).filter(x => x && x.name && x.category !== 'daytrip').sort((a, b) => (b.score || 0) - (a.score || 0));
    return [...city.filter(x => x.image), ...city.filter(x => !x.image)].slice(0, n);
  }
  // „Další 3 místa a 8 výletů do okolí najdeš v Objevuj.“
  const moreTxt = (city, trips) => {
    const c = city > 0 ? (city === 1 ? 'Ještě jedno místo' : city <= 4 ? `Další ${city} místa` : `Dalších ${city} míst`) : '';
    const t = trips > 0 ? `${plural(trips, 'výlet', 'výlety', 'výletů')} do okolí` : '';
    return c || t ? `${[c, t].filter(Boolean).join(' a ')} najdeš v Objevuj.` : '';
  };
  /** Karta místa v náhledu: fotka (jinak ikona druhu), název, druh, vzdálenost a jedna věta popisu. */
  const previewCard = p => {
    const d = p.extract || p.description || '';
    return `<div class="dp-poi"><div class="dp-img"${p.image ? ` style="background-image:url('${esc(cssUrl(p.image))}')"` : ''} aria-hidden="true">${p.image ? '' : icon(p.category)}</div>
      <div class="dp-pt"><b>${esc(p.name)}</b><span class="dp-pm">${picon(p)} ${esc(p.categoryLabel || (CAT[p.category] || CAT.sight)[1])}${p.unesco ? ' · UNESCO' : ''}${p.distanceKm != null ? ` · ${String(p.distanceKm).replace('.', ',')}\u00a0km` : ''}</span>${
        d ? `<span class="dp-pd">${descHtml(isEnglish(d, p.descLang) ? d : firstSentence(d), p.descLang)}</span>` : ''}</div></div>`;
  };
  /**
   * „Co vidět“ v náhledu: 6 míst a kolik dalších (i výletů) ukáže Objevuj; km = okruh dotazu. Jen v okruhu, který pak
   * ukáže Objevuj („🗺️ Naplánovat“ zvolený okruh nemění): se zapamatovanými 3 km z načtených 10 km jen místa do 3 km.
   */
  function previewHtml(items, km = PREVIEW_KM) {
    ensureUi();
    const r = Math.min(km, cityKm(ex.radius));
    const all = inRadius((items || []).filter(x => x && x.name), r), list = previewPick(all);
    if (!list.length) return `<div class="faint dp-none">Do ${r} km od centra jsem nenašel nic, co by stálo za zmínku – zkus v Objevuj větší okruh nebo výlety do okolí.</div>`;
    const trips = all.filter(x => x.category === 'daytrip').length;
    const more = moreTxt(all.length - trips - list.length, trips);
    return `<div class="dp-sl">${list.map(previewCard).join('')}</div>${more ? `<div class="faint dp-more">${esc(more)}</div>` : ''}`;
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

  // Okruh: zmenšení jen vyfiltruje načtená místa (hned), nový dotaz až při zvětšení nad načtené (50/100 km: místa ve městě
  // do CITY_KM a k nim místa v okolí); celá země = přehled země (jednou na místo).
  function setRadius(km) {
    if (typeof ex.radius === 'number' && km === COUNTRY) ex.lastKm = ex.radius;
    ex.radius = km;
    remember();
    const sel = $('#exRad');
    if (sel) sel.value = String(km);
    const qi = $('#exQ');
    if (qi && ex.place) qi.value = qLabel();
    // bez místa: celá země = výběr země, okruh v km = inspirace
    if (!ex.place) { const root = $('#exploreRoot'); if (root) renderExplore(root); return; }
    if (km === COUNTRY) { if (ex.country?.place === ex.place && ex.country.data) paintCountry(); else loadCountry(); return; }
    if (ex.loaded?.place === ex.place && !needsFetch(ex.loaded.radius, cityKm(km))) paintExplore();
    else loadExplore();
  }

  function wireExploreSearch(root) {
    const q = $('#exQ', root), dd = $('#exDd', root);
    if (window.comboAria) comboAria(q, dd, 'Kam se chceš podívat'); // čtečka: combobox jako Odkud/Kam v Letech
    // sugFor = text, ke kterému návrhy patří (starý seznam se po dalším písmenu nesmí vybrat)
    let ctl = null, sugs = [], act = 0, sugFor = '', err = false, t = null;
    // ✨ věta („Lisabon na 3 dny“, „výlety z Brna“): jen řádek s tím, jak jí rozumím – návrhy pro celou větu by mátly
    // věta s volbami („Lisabon na 3 dny“), nebo jen otázka kolem místa („co vidět v Římě“ → Řím)
    const smartOf = text => { const px = window.Smart && Smart.parseExplore(text, { today: fmtYMD(new Date()) }); return px && (px.chips.length || (px.place && Smart.fold(px.place) !== Smart.fold(text))) && (px.place || ex.place) ? px : null; };
    const show = () => {
      const px = smartOf(q.value.trim());
      const wc = px && wholeCountryOf(px);
      dd.innerHTML = wc ? `<div class="pi-opt pi-smart on" data-smart="1"><span class="pi-flag">${flag(wc)}</span><span class="pi-t"><b>${esc(countryCs(wc))} – celá země</b><small>klepni nebo Enter – města, další cíle, UNESCO a národní parky</small></span><span class="pi-type">země</span></div>`
        : px ? `<div class="pi-opt pi-smart on" data-smart="1"><span class="pi-flag">✨</span><span class="pi-t"><b>${esc([px.place ? `📍 ${smartNames.get(px.place) || px.place}` : `📍 ${ex.place.label}`, ...px.chips].join(' · '))}</b><small>klepni nebo Enter – najdu místo a naplánuju</small></span><span class="pi-type">plánovat</span></div>`
        : sugHtml(sugs, act, err);
      dd.hidden = false;
      const sm = $('[data-smart]', dd); if (sm) sm.onmousedown = e => { e.preventDefault(); runSmart(px); };
      $$('.pi-opt:not([data-smart])', dd).forEach(o => o.onmousedown = e => { e.preventDefault(); pick(sugs[+o.dataset.i]); });
    };
    let smartSeq = 0;
    const runSmart = async px => {
      const my = ++smartSeq; // novější věta předbíhá starší (pomalé hledání místa)
      // „do Francie“, „co vidět v Itálii“ (země bez dnů, druhu plánu a zájmů) = přehled celé země
      const wc = wholeCountryOf(px);
      if (wc) { dd.hidden = true; q.blur(); return openWholeCountry(wc); }
      dd.innerHTML = '<div class="pi-empty"><span class="spin dark"></span> Hledám místo…</div>'; dd.hidden = false;
      let down = false;
      const s = px.place ? await smartPlace(px.place).catch(e => { down = Boolean(e && e.down); return null; }) : ex.place;
      if (my !== smartSeq) return;
      if (!s) { dd.innerHTML = `<div class="pi-empty">${down ? 'Místa teď nejde dohledat – zkontroluj připojení a zkus to znovu' : `Místo „${esc(px.place)}“ jsem nenašel – zkus jen jeho název`}</div>`; return; }
      dd.hidden = true; q.blur();
      exploreApply(px, s);
      if (px.place) openPlace(s); else paintExplore();
    };
    const pick = s => { if (!s) return; dd.hidden = true; if (s.ccPick) { q.blur(); openWholeCountry(s.ccPick); } else openPlace(s); };
    // Návrhy k textu; null = předběhl je novější dotaz (nebo psaní).
    const fetchSugs = async text => {
      if (ctl) ctl.abort();
      const my = ctl = new AbortController();
      try {
        // mapy=1: s klíčem Mapy.com na serveru i jejich návrhy (vesnice, adresy, hrady, rozhledny…)
        const j = await getJson('api/geocode?mapy=1&q=' + enc(text), { signal: my.signal });
        if (my !== ctl) return null;
        // 🌍 země („Francie – celá země“) před městy; geokódovaný střed té země (bod uprostřed Francie) ne
        const cs = countrySugs(text), names = new Set(cs.map(x => foldName(countryCs(x.ccPick))));
        sugs = [...cs, ...(j.items || []).filter(x => !names.has(foldName(String(x.label || '').replace(/\s*\(.*\)$/, ''))))]; err = false;
      } catch (e) {
        if (e.name === 'AbortError' || my !== ctl) return null;
        sugs = countrySugs(text); err = !sugs.length; // výpadek ≠ „Nic nenalezeno“ (země jdou i bez serveru)
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
      // pozdní odpověď po odchodu z pole (klik jinam) už nabídku znovu neotevře; věta (✨) bez dotazu na server
      t = setTimeout(async () => {
        t = null;
        const px = smartOf(text);
        if ((px || await fetchSugs(text)) && q.value.trim() === text && document.activeElement === q) show();
        // „co vidět v Římě“: v řádku základní tvar (Řím), jakmile ho vlastní data najdou
        if (px && px.place && !smartNames.has(px.place)) smartName(px.place).then(n => { if (n && q.value.trim() === text && !dd.hidden) show(); });
      }, 220);
    };
    q.onkeydown = async e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!sugs.length) return; e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + sugs.length) % sugs.length; show(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const text = q.value.trim();
        const px = smartOf(text);
        if (px) { clearTimeout(t); t = null; runSmart(px); return; }
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
    $('#exRad', root).onchange = e => setRadius(e.target.value === COUNTRY ? COUNTRY : +e.target.value);
    $('#exGeo', root).onclick = () => {
      if (!navigator.geolocation) return toast('Prohlížeč nepodporuje polohu', 'err');
      navigator.geolocation.getCurrentPosition(p => pick({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'Moje okolí', geo: true }), () => toast('Polohu se nepodařilo zjistit', 'err'), { timeout: 10000 });
    };
  }

  let exSeq = 0;
  async function loadExplore() {
    if (ex.radius === COUNTRY) return loadCountry();
    const body = $('#exBody'); if (!body) return;
    const p = ex.place;
    const km = cityKm(ex.radius);
    const my = ++exSeq; // pomalá starší odpověď nesmí přepsat novější místo/okruh
    hideBack();
    const wait = slow => { if (my === exSeq && body.isConnected) body.innerHTML = waitHtml('list', slow, p.label); };
    wait(false);
    const slowT = setTimeout(() => wait(true), SLOW_MS);
    try {
      // 🔎 Co tam je u letů už místa načetl nebo načítá stejným dotazem – žádný druhý
      const pre = pvFor(p, km);
      const j = await (pre ? pre.p : getJson(poiUrl(p, km)));
      if (my !== exSeq) return;
      ex.all = j.items || []; ex.demo = j.demo; ex.loaded = { place: p, radius: pre ? pre.km : km };
    } catch (e) {
      if (my !== exSeq) return;
      if (body.isConnected) {
        body.innerHTML = errHtml('Místa se nepodařilo načíst', e.message, 'exRetry');
        $('#exRetry', body).onclick = () => loadExplore();
        // offline: po návratu připojení načíst znovu samo (stejné místo, hláška ještě na obrazovce)
        if (e.offline && window.Pwa && Pwa.whenOnline) Pwa.whenOnline('explore', () => { if (my === exSeq && body.isConnected && $('#exRetry', body)) loadExplore(); });
      }
      return;
    } finally {
      clearTimeout(slowT);
    }
    paintExplore();
  }

  // Okruh 50/100 km: místa v okolí (cíle výletů do ~120 km) jednou na místo; seznam ve městě je mezitím vidět.
  async function loadFar() {
    const p = ex.place;
    if (!p || (ex.far?.place === p && !ex.far.err)) return;
    const f = ex.far = { place: p, items: [], busy: true, t0: Date.now() };
    const slowT = setTimeout(() => { if (ex.far === f && f.busy && farOn(ex.radius) && ex.place === p) paintExplore(); }, SLOW_MS);
    try {
      const j = await getJson(`api/poi/trips?lat=${p.lat}&lon=${p.lon}`);
      f.items = j.items || [];
    } catch (e) {
      f.err = e.message;
    } finally {
      f.busy = false;
      clearTimeout(slowT);
    }
    if (ex.far === f && ex.place === p && farOn(ex.radius)) paintExplore();
  }

  /* ---------- 🌍 celá země: města a cíle z Wikivoyage, UNESCO, národní parky ---------- */
  const C_GROUPS = [['city', '🏙️', 'Města', 'Město'], ['dest', '🧭', 'Další cíle', 'Cíl'], ['unesco', '🏛️', 'Památky UNESCO', 'UNESCO'], ['park', '🏞️', 'Národní parky', 'Národní park']];
  const countryItems = d => C_GROUPS.flatMap(([g]) => (Array.isArray(d?.[g]) ? d[g] : []).filter(x => x && x.name && okPt(x)).map(x => ({ ...x, group: g })));
  // skupina (ikona, nadpis, druh na kartě) míst načtených podle kategorie
  const CAT_GROUPS = { mountain: ['mountain', '⛰️', 'Hory', 'Hory'], beach: ['beach', '🏖️', 'Pláže a pobřeží', 'Pobřeží'], island: ['island', '🏝️', 'Ostrovy', 'Ostrov'],
    lake: ['lake', '💧', 'Jezera a vodopády', 'Voda'], castle: ['castle', '🏰', 'Hrady a zámky', 'Hrad / zámek'], sight: ['sight', '✨', 'Zajímavá místa', 'Zajímavost'] };
  const lazyCat = c => Object.hasOwn(CAT_GROUPS, c);
  /**
   * Položky přehledu země pro kategorii: { items, sections: [[skupina, položky]] }. Vše = všechny skupiny; města,
   * památky (UNESCO i města a cíle s UNESCO), příroda (parky a přírodní cíle); hory, pláže… = cíle Wikivoyage toho druhu
   * a načtená místa (loaded – null, dokud nejsou).
   */
  function countryPick(d, cat, loaded) {
    const all = countryItems(d);
    const bySec = list => C_GROUPS.map(g => [g, list.filter(x => x.group === g[0])]).filter(([, l]) => l.length);
    if (cat === 'city') return { items: all.filter(x => x.group === 'city'), sections: bySec(all.filter(x => x.group === 'city')) };
    if (cat === 'unesco') { const l = all.filter(x => x.group === 'unesco' || x.unesco); return { items: l, sections: bySec(l) }; }
    if (cat === 'nature') { const l = all.filter(x => x.group === 'park' || (x.nature && x.group !== 'city')); return { items: l, sections: bySec(l) }; }
    if (lazyCat(cat)) {
      const g = CAT_GROUPS[cat], seen = new Set();
      const wv = all.filter(x => Array.isArray(x.cats) && x.cats.includes(cat));
      const more = (loaded || []).filter(x => x && x.name && okPt(x));
      const l = [...wv, ...more].filter(x => !seen.has(x.id) && seen.add(x.id)).map(x => ({ ...x, group: cat }));
      return { items: l, sections: l.length ? [[g, l]] : [] };
    }
    return { items: all, sections: bySec(all) };
  }
  // Země místa česky (byIso), jinak z odpovědi serveru
  const countryName = (p, d) => d?.country || countryCs(p.cc) || p.country || '';
  // země jako cíl hledání letů (cc:IT – všechna letiště země)
  const countryTarget = (cc, name) => (/^[A-Z]{2}$/.test(cc || '') && name ? { id: `cc:${cc}`, type: 'country', label: name, flag: flag(cc) } : null);
  /** Karta cíle v přehledu země: fotka, druh, vzdálenost od místa, popis (český, jinak úryvek z Wikivoyage) a akce. */
  function countryCard(x, g, center) {
    const desc = x.extract || x.description || x.blurb || '';
    return `<div class="poi" data-cpoi="${esc(x.id)}">
      <div class="poi-img" ${x.image ? `style="background-image:url('${esc(cssUrl(x.image))}')"` : ''}>${x.image ? '' : g[1]}</div>
      <div><div class="poi-name">${g[1]} ${esc(x.name)}</div>
        <div class="poi-meta">${esc(g[3])}${x.distanceKm != null ? ` · ${num(x.distanceKm)} km` : ''}${x.unesco && g[0] !== 'unesco' ? ' · <b style="color:var(--warn)">UNESCO</b>' : ''}${x.wv ? ' · <b style="color:var(--good)" title="Vybral cestovní průvodce Wikivoyage">👍 Wikivoyage</b>' : ''}</div>
        <div class="poi-desc">${descHtml(desc, x.extract || x.description ? x.descLang : 'en')}</div>
        <div class="poi-acts"><button type="button" class="linkbtn" data-cgo="${esc(x.id)}">🔎 Prozkoumat</button>${x.url ? `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">Wikipedie ↗</a>` : ''}
          <a href="${esc(gmSearch(gq(x.name, center.country || '')))}" target="_blank" rel="noopener" data-gm>Google Maps ↗</a></div></div>
    </div>`;
  }
  async function loadCountry() {
    const body = $('#exBody'); if (!body) return;
    const p = ex.place;
    const my = ++exSeq; // pomalá starší odpověď nesmí přepsat novější místo/okruh
    hideBack();
    const wait = slow => { if (my === exSeq && body.isConnected) body.innerHTML = waitHtml('country', slow, ''); };
    wait(false);
    const slowT = setTimeout(() => wait(true), SLOW_MS);
    try {
      const j = await getJson(`api/poi/country?${p.cc ? `cc=${enc(p.cc)}&` : ''}lat=${p.lat}&lon=${p.lon}`);
      if (my !== exSeq) return;
      ex.country = { place: p, data: j };
    } catch (e) {
      if (my !== exSeq) return;
      if (body.isConnected) {
        body.innerHTML = errHtml('Přehled země se nepodařilo načíst', e.message, 'exRetry');
        $('#exRetry', body).onclick = () => loadCountry();
      }
      return;
    } finally {
      clearTimeout(slowT);
    }
    paintCountry();
  }
  // Kategorie země (hory, pláže…) jednou na zemi; přehled se překreslí, jen když je pořád ta země a kategorie.
  async function loadCountryCat(cat) {
    const c = ex.country;
    if (!c || !lazyCat(cat)) return;
    const st = c.cats || (c.cats = {});
    if (st[cat] && (st[cat].busy || st[cat].items)) return;
    st[cat] = { busy: true };
    const p = c.place, d = c.data || {};
    try {
      const j = await getJson(`api/poi/country?cc=${enc(d.cc || p.cc || '')}&cat=${cat}&lat=${p.lat}&lon=${p.lon}`);
      st[cat] = { items: j.items || [] };
    } catch (e) {
      st[cat] = { err: e.message };
    }
    if (ex.country === c && ex.radius === COUNTRY && ex.cCat === cat) paintCountry();
  }
  function paintCountry() {
    const body = $('#exBody'); if (!body) return;
    const p = ex.place, d = ex.country?.data || {};
    hideBack();
    const name = countryName(p, d), tgt = countryTarget(d.cc || p.cc, name);
    const cat = CC_CATS.some(c => c[0] === ex.cCat) ? ex.cCat : 'all';
    const st = lazyCat(cat) ? (ex.country?.cats || {})[cat] : null;
    if (lazyCat(cat) && !st) loadCountryCat(cat);
    const { items: all, sections } = countryPick(d, cat, st && st.items);
    const sec = ([g, list]) => `<div class="poi-sec"><b>${g[1]} ${esc(g[2])}</b> <span class="faint">(${list.length})</span></div>${list.map(x => countryCard(x, g, p)).join('')}`;
    const catName = (CC_CATS.find(c => c[0] === cat) || CC_CATS[0])[1].replace(/^\S+\s/, ''), lbl = catName.toLowerCase();
    const busy = lazyCat(cat) && (!st || st.busy);
    const listHtml = (st && st.err ? errHtml(`${catName} se nepodařilo načíst`, st.err, 'exCRetry') : '')
      + sections.map(sec).join('')
      + (busy ? `<div class="loading-row ex-busy" role="status"><span class="spin dark"></span><div><b>Hledám ${esc(lbl)}…</b><div class="ex-wait">Poprvé to trvá obvykle 3–15 s, příště je hned.</div></div></div>`
        : !all.length && !(st && st.err) ? '<div class="empty">K tomu jsem tu nic nenašel – zkus jinou kategorii.</div>' : '');
    const chips = `<div class="ex-ccats" role="group" aria-label="Co hledáš?"><span class="ex-ccats-l">Co hledáš?</span>${CC_CATS.map(([id, l]) => `<button type="button" class="fchip${id === cat ? ' on' : ''}" data-ccat="${id}" aria-pressed="${id === cat}">${esc(l)}</button>`).join('')}</div>`;
    const lastKm = ex.lastKm || 10;
    body.innerHTML = `${d.demo ? '<div class="note warn" style="margin-bottom:12px">⚠️ <div><b>DEMO data</b> – místa jsou vymyšlená.</div></div>' : ''}
      <div class="section-head ex-head" style="margin-top:6px"><h2>${flag(d.cc || p.cc || '')} ${esc(name || 'Země')} · celá země</h2><span class="ex-head-act">${window.Flights && tgt ? `<button type="button" class="btn sm ghost" id="exCFly" title="Hledat lety kamkoliv do země">✈️ Najít lety sem</button>` : ''}<button type="button" class="btn sm ghost" id="exReset" title="Vybrat jinou zemi">🌍 Jiná země</button></span></div>
      <div class="muted ex-cnote">Města a další cíle, které vybral cestovní průvodce Wikivoyage, památky UNESCO a národní parky. Vzdálenost od ${p.capital ? 'hlavního města' : 'místa'} ${esc(p.label)} vzdušnou čarou. 🔎 Prozkoumat ukáže, co je v místě k vidění.
        <span class="ex-cact"><button type="button" class="fchip" data-cback="city">🏙️ ${esc(p.label)} · okruh ${lastKm} km</button><button type="button" class="fchip" data-cback="loop">🧭 Okruh odsud na pár dní</button></span></div>
      ${d.degraded ? '<div class="faint" style="font-size:12px;margin:6px 0">Část údajů se teď nenačetla (popisy nebo výběr Wikivoyage) – zkus to později znovu.</div>' : ''}
      ${chips}
      <div class="ex-layout ex-main"><div id="exMapSlot"></div>
      <div class="ex-places"><div class="poi-list all" id="exCList">${listHtml}</div></div></div>
      <div class="faint" style="font-size:11.5px;margin-top:10px">Zdroj: Wikivoyage, Wikidata a Wikipedie (CC BY-SA), mapa © OpenFreeMap, OpenMapTiles, OpenStreetMap.</div>`;
    const ms = exploreMap(p);
    $('#exMapSlot', body).replaceWith(ms.el);
    if (ms.map) ms.map.resize();
    const ico = g => (C_GROUPS.find(c => c[0] === g) || CAT_GROUPS[g] || C_GROUPS[0])[1];
    const col = { city: '#5b8cff', dest: '#14b8a6', unesco: '#f59e0b', park: '#22c55e', mountain: '#8b5cf6', beach: '#06b6d4', island: '#0ea5e9', lake: '#3b82f6', castle: '#ef4444', sight: '#ec4899' };
    paintMap(ms, p, all.map(x => ({ id: x.id, lat: x.lat, lon: x.lon, color: col[x.group], label: `${ico(x.group)} ${x.name}`, q: gq(x.name, name), place: x })), [],
      x => { const el = $(`#exCList [data-cpoi="${CSS.escape(x.id)}"]`); if (el) { if (!stacked()) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(el); } }, null);
    // 🔎 Prozkoumat: Objevuj toho místa jako po výběru v hledání (okruh 10 km)
    const go = x => {
      ex.radius = 10;
      const sel = $('#exRad'); if (sel) sel.value = String(ex.radius);
      openPlace({ lat: x.lat, lon: x.lon, label: x.name, cc: d.cc || p.cc || '', country: name });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    $$('[data-cgo]', body).forEach(b => b.onclick = e => { e.stopPropagation(); const x = all.find(i => i.id === b.dataset.cgo); if (x) go(x); });
    $$('#exCList [data-cpoi]', body).forEach(c => c.onclick = e => {
      if (e.target.closest('a,button')) return;
      const x = all.find(i => i.id === c.dataset.cpoi);
      if (x && ms.byId?.has(x.id)) { focusOnMap(ms, x, 8); bringMap(ms, 'seznam'); }
    });
    $$('[data-cback]', body).forEach(b => b.onclick = () => {
      if (b.dataset.cback === 'loop') { ex.mode = 'loop'; ex.planOpen = true; }
      setRadius(ex.lastKm || 10);
    });
    const fl = $('#exCFly', body); if (fl) fl.onclick = () => Flights.searchTo([tgt]);
    const rs = $('#exReset', body); if (rs) rs.onclick = () => resetExplore();
    $$('[data-ccat]', body).forEach(b => b.onclick = () => { ex.cCat = b.dataset.ccat; remember(); paintCountry(); });
    // na telefonu je řada čipů posuvná – vybraný čip po překreslení vidět; posunout jen když by byl mimo, jinak by
    // u „Vše“ zajel popisek „Co hledáš?“ napůl pod okraj („EDÁŠ?“)
    const cr = $('.ex-ccats', body), on = cr && $('.fchip.on', cr);
    if (on && cr.scrollWidth > cr.clientWidth) {
      const r = on.getBoundingClientRect(), x = r.left - cr.getBoundingClientRect().left + cr.scrollLeft;
      cr.scrollLeft = x + r.width <= cr.clientWidth ? 0 : Math.max(0, x - 48);
    }
    const rt = $('#exCRetry', body); if (rt) rt.onclick = () => { if (ex.country?.cats) delete ex.country.cats[cat]; paintCountry(); };
    remember();
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
      exclude: [...ex.tripEx], include: [...ex.tripMust], region: p.region || undefined };
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
      <div class="poi-acts">${s.url ? `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Wikipedie ↗</a>` : ''}<a href="${esc(gmSearch(q))}" target="_blank" rel="noopener">Google Maps ↗</a>${transit ? '' : wazeLink(s)}</div></div>
      <button type="button" title="Vyřadit z výletu" aria-label="${esc(`Vyřadit z výletu: ${s.name}`)}" data-tdrop="${esc(s.id)}">✕</button></div>`;
  }
  // Výlet autem: navigace na zastávku ve Waze (otevře aplikaci v mobilu, jinak web; SearchHelp.wazeUrl)
  const wazeLink = s => {
    const u = window.SearchHelp && window.SearchHelp.wazeUrl({ lat: s.lat, lon: s.lon });
    return u ? `<a class="app-chip" href="${esc(safeUrl(u))}" target="_blank" rel="noopener" title="${esc(`Navigace autem ve Waze – ${s.name || ''}`)}">🚗 Navigovat ve Waze</a>` : '';
  };

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
        : 'Časy jízdy jsou orientační odhad autem; přesnou trasu ukáže Google Maps.'} ${trip.inRegion ? 'Cíle jen z oblasti (do ~120 km od místa).' : 'Cíle do ~120 km od místa.'}</div>`;
  }

  /* ---------- ✈️ Najít lety sem (Lety: cíl = místo, letiště do ~130 km vybere server) ---------- */
  // „geo:lat,lon|Název“ jako místo z našeptávače; „Moje okolí“ ne (tam se neletí).
  const flyTarget = p => (!p || p.geo || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon) ? null : {
    id: `geo:${(+p.lat).toFixed(4)},${(+p.lon).toFixed(4)}|${String(p.label || '').replace(/[|<>"'`]/g, '').slice(0, 60)}`,
    label: p.label, flag: p.cc ? flag(p.cc) : '📍', type: 'place',
  });
  // Termín jen, když ho uživatel v Objevuj vybral: přílet první den, odlet poslední den pobytu.
  // Kolo a pěšky mají jen jeden den („Kdy“) – let tam, zpáteční termín nechat na uživateli.
  const flyDates = s => {
    const n = s.mode === 'loop' ? s.tripDays.loop : s.mode === 'day' ? s.tripDays.day : s.mode === 'city' ? s.days : 0;
    return n ? { xOut: s.start, xBack: plusDays(s.start, Math.max(1, n) - 1) } : { xOut: s.start };
  };

  /* ---------- uložení do plánovače ---------- */
  /**
   * Výsledek Objevuj (trasa / výlety / program) → cesta pro plánovač { name, dest, iso, start, end, days, notes, src }.
   * src = druh výsledku (city, day-car, bike…): jeho řádky se při dalším uložení k téže cestě nahradí, ne přidají.
   */
  function plannerEntry({ rr, trip, plan, hikes, place: p, start }) {
    const src = rr ? (rr.activity === 'hike' ? 'hike' : rr.kind === 'train' ? 'train' : 'bike') : trip ? `${trip.mode}-${trip.transport}` : hikes ? 'hikes' : 'city';
    const days = {};
    let name, dates, notes = '';
    if (rr) {
      const day = start || fmtYMD(new Date());
      days[day] = routeLines(rr, p);
      notes = `${rr.train ? `Spojení vlakem: ${rr.train.idosUrl || rr.train.googleUrl}\n` : ''}Trasa v Mapy.com: ${rr.mapyUrl}\nGoogle Maps: ${rr.googleUrl}`;
      name = routeName(rr, p);
      dates = [day, day];
    } else if (hikes) {
      // túra na každý den: řádek s cílem, startem a délkou; v poznámkách odkazy na trasy dnů do Mapy.com
      hikes.days.forEach(d => { if (d.items.length) days[d.date] = d.items.map(x => `${x.name}${x.note ? ` (${x.note})` : ''}`); });
      notes = hikes.days.filter(d => d.hike).map(d => `${fmtDate(d.date)} ${d.hike.goal.name}: ${d.hike.mapyUrl}`).join('\n');
      name = `Túry: ${p.label}`;
      dates = [hikes.days[0].date, hikes.days.at(-1).date];
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
    return { name, dest: p.label, iso: typeof byIso !== 'undefined' && byIso[p.cc] ? p.cc : null, start: dates[0], end: dates[1], days, notes, src };
  }
  const normDest = s => String(s || '').trim().toLowerCase();
  // Cesta do stejného místa se stejným začátkem (program, výlety i kolo z jedné Barcelony = jedna cesta); jinak −1.
  const findTripFor = (trips, e) => (trips || []).findIndex(t => t && t.start && t.start === e.start && normDest(t.dest) === normDest(e.dest));
  /**
   * Přidá řádky dnů (bez opakování), prodlouží konec a připíše poznámky; vrátí počet nových řádků. Řádky, které do cesty
   * dřív uložil stejný druh výsledku (t.explore[src]), nejdřív odebere – přeplánovaný program nahradí ten starý, místo
   * aby se oba sčítaly (vyřazené místo zmizí, nic není dvakrát). Řádky napsané v plánovači ručně zůstanou.
   */
  function mergeInto(t, e) {
    let added = 0;
    t.days = t.days && typeof t.days === 'object' ? t.days : {};
    const prev = e.src && t.explore && t.explore[e.src];
    const had = new Set();
    if (prev) for (const [d, lines] of Object.entries(prev)) {
      if (!Array.isArray(t.days[d]) || !Array.isArray(lines)) continue;
      lines.forEach(x => had.add(`${d}\n${x}`));
      const keep = new Set(e.days[d] || []); // co v novém výsledku zůstává, zůstane i na svém místě
      t.days[d] = t.days[d].filter(x => keep.has(x) || !lines.includes(x));
      if (!t.days[d].length) delete t.days[d];
    }
    for (const [d, lines] of Object.entries(e.days)) {
      const have = t.days[d] || [];
      const add = lines.filter(x => !have.includes(x));
      if (add.length) { t.days[d] = [...have, ...add]; added += add.filter(x => !had.has(`${d}\n${x}`)).length; }
    }
    if (e.src) t.explore = { ...(t.explore && typeof t.explore === 'object' ? t.explore : {}), [e.src]: e.days };
    if (e.end && (!t.end || e.end > t.end)) t.end = e.end;
    // Poznámky (odkazy na trasu) stejného druhu výsledku se nahradí jako řádky – po „Jiná trasa“ nezůstanou odkazy na tu starou.
    const notesBy = t.exploreNotes && typeof t.exploreNotes === 'object' ? t.exploreNotes : {};
    const oldNotes = e.src && typeof notesBy[e.src] === 'string' ? notesBy[e.src] : '';
    if (oldNotes && oldNotes !== e.notes) t.notes = String(t.notes || '').replace(oldNotes, '').replace(/\n{3,}/g, '\n\n').trim();
    if (e.notes && !String(t.notes || '').includes(e.notes)) t.notes = [t.notes, e.notes].filter(Boolean).join('\n\n');
    if (e.src) t.exploreNotes = { ...notesBy, [e.src]: e.notes || '' };
    // Název z téhož druhu výsledku („Na kole z: Brno – 40 km“) se mění s ním; přejmenovanou cestu nechá být.
    if (e.src && e.name && t.src === e.src && t.genName === t.name) t.name = t.genName = e.name;
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
  // start túry u hor a přírody (server, Wikidata): druh → ikona a popis
  const TH_ICON = { parking: '🅿️', station: '🚉', town: '🏘️' };
  const TH_KIND = { parking: 'parkoviště', station: 'nádraží / zastávka', town: 'obec' };
  // Start túry: „🅿️ Start: Karpacz (obec) · 3,5 km od cíle Sněžka“; míjí-li okruh cíl o víc než 1 km, řekne to i s radou
  function trailheadHtml(r, center) {
    const th = r.trailhead;
    if (!th) return '';
    const miss = th.miss > 1 ? ` <span class="faint">– okruh vede nejblíž ~${num(th.miss)} km od cíle, zkus „Jiná trasa“ nebo delší okruh</span>` : '';
    return `<div class="ride-train">${TH_ICON[th.kind] || '📍'} Start: <b>${esc(th.name)}</b> <span class="faint">(${TH_KIND[th.kind] || 'start'} · ${num(th.km)} km vzdušnou čarou od cíle ${esc(center.label)})</span>${miss}</div>`;
  }
  const routeName = (r, center) => (r.activity === 'hike' ? `Pěšky z: ${r.trailhead ? r.trailhead.name : center.label} – ${num(r.km)} km`
    : r.kind === 'train' ? `Na kole z: ${r.station.name} do: ${center.label} – ${num(r.km)} km` : `Na kole z: ${center.label} – ${num(r.km)} km`);
  // Řádky do plánovače (den výletu). Stoupání chybí jen u trasy z Mapy.com bez výškového profilu (ascent null).
  const upTxt = r => (r.ascent != null ? `↗ ${r.ascent} m, ` : '');
  const routeLines = (r, center) => (r.activity === 'hike' ? [...(r.trailhead ? [`${TH_ICON[r.trailhead.kind] || '📍'} Start: ${r.trailhead.name} (${num(r.trailhead.km)} km od cíle ${center.label})`] : []),
    `🥾 Pěšky: ${num(r.km)} km, ${upTxt(r)}~${minTxt(r.minutes)} chůze`]
    : r.kind === 'train' ? [`🚆 Vlakem: ${center.label} → ${r.station.name}`, `🚴 Na kole zpět: ${num(r.km)} km, ${upTxt(r)}~${minTxt(r.minutes)} (${BIKE_LBL[r.bike] || ''})`]
    : [`🚴 Okruh na kole: ${num(r.km)} km, ${upTxt(r)}~${minTxt(r.minutes)} (${BIKE_LBL[r.bike] || ''})`]);

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
    if (r.unpavedPct === null) return ''; // trasa z Mapy.com (záloha) povrch a druh cesty nevrací
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
      r.demo ? `<div class="note warn" style="margin-bottom:10px">⚠️ <div><b>DEMO data</b> – ${train ? 'nádraží i trasa jsou vymyšlené' : r.trailhead ? 'start túry je vymyšlený a trasa jen ukázkový kruh' : 'trasa je jen ukázkový kruh'}.</div></div>` : '',
      off ? `<div class="note info" style="margin-bottom:10px">ℹ️ <div>${train ? `Jízda z nádraží vyšla na ${num(r.km)} km místo ${r.target} km – z okolních nádraží se zvolené délce přiblížit nepodařilo. Zkus „Jiné nádraží“ nebo jinou délku.`
        : `Trasa vyšla na ${num(r.km)} km místo ${r.target} km${r.via.length ? ' – vede přes památky po cestě' : ' – v okolí se přesněji naplánovat nedala'}. Zkus „Jiná trasa“.`}</div></div>` : '',
    ].join('');
    const title = hike ? `🥾 Pěšky ${r.trailhead ? `na: ${esc(center.label)}` : `z: ${esc(center.label)}`}` : train ? `🚆 Vlakem tam, 🚴 na kole zpět · ${esc(BIKE_LBL[r.bike] || '')}` : `🚴 Okruh z: ${esc(center.label)} · ${esc(BIKE_LBL[r.bike] || '')}`;
    const st = r.station;
    const back = routeBack(r, center);
    // návrat po půlnoci se porovná jako 23:59 (toHm by čas přetočil na „01:59“ a varování by zmizelo)
    const late = back.back >= 1440;
    const trainHtml = train ? `<div class="ride-train">🚆 Vlakem: <b>${esc(center.label)}</b> → <b>${esc(st.name)}</b> <span class="faint">(${Math.round(kmBetween([center.lon, center.lat], [st.lon, st.lat]))} km vzdušnou čarou)</span>
        <div>${r.train.idosUrl ? `${link(r.train.idosUrl, 'spojení na IDOS ↗')} · ` : ''}${link(r.train.googleUrl, 'spoje v Google Maps ↗')}</div></div>` : '';
    return `${head}<div class="day-plan"><h4><span>${title}</span></h4>
      ${wxSlot(train ? st : center, date, true)}
      ${sunSlot(train ? st : center, date, late ? '23:59' : toHm(back.back), `Počítám se startem v 9:00${back.train ? ` (vlakem ~${minTxt(back.train)})` : ''} a s přestávkami – zpět kolem ${toHm(back.back)}${late ? ' (po půlnoci)' : ''}.`)}
      ${trainHtml}${trailheadHtml(r, center)}
      <div class="bike-stats">${train ? '<span>🚴 Na kole zpět:</span>' : ''}<b>${num(r.km)} km</b>${r.ascent != null ? `<span>↗ ${r.ascent} m stoupání</span>` : ''}${train && r.ascent != null ? `<span>↘ ${r.descent ?? r.ascent} m klesání</span>` : ''}<span>⏱️ ~${minTxt(r.minutes)} ${hike ? 'chůze' : 'v sedle'}</span></div>
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
      <div class="faint" style="font-size:11.5px;margin-top:6px">${hike ? 'Čas chůze je bez přestávek.' : 'Čas v sedle je bez zastávek.'} ${r.source === 'mapy'
        ? `${train ? 'Nádraží: Wikidata. ' : r.trailhead ? 'Start túry: Wikidata. ' : ''}Trasa: ${mapyBy('Plánují')} – plánovač BRouter teď neodpovídá, proto bez rozboru povrchu a cest.`
        : `${train ? 'Nádraží: Wikidata. ' : r.trailhead ? 'Start túry: Wikidata. ' : ''}Trasa: BRouter${hike ? ' (profil pěší turistiky)' : ' (brouter.de)'} nad mapou © OpenStreetMap.`}
        ${footMore(`${r.source === 'mapy'
        ? `${r.ascent != null ? 'Výšky jsou z výškového profilu Mapy.com. ' : ''}${hike ? 'Čas chůze podle turistického vzorce DIN 33466.' : 'Čas je odhad Mapy.com.'}`
        : hike
        ? 'Čas chůze podle turistického vzorce DIN 33466 (4 km/h, 300 m stoupání a 500 m klesání za hodinu). „Spíš rovina“ se vyhýbá stoupání, „Do kopců“ dává přednost pěšinám a horským stezkám (kopce ale plánovač sám nevyhledá).'
        : 'Čas je odhad podle kola a převýšení.'}
        GPX nahraješ do Mapy.com, Garminu, Komootu či Stravy; odkazy do Mapy.com a Google Map vedou trasu přes několik bodů, takže se může mírně lišit.`)}</div>`;
  }

  /* ---------- 🗓️ túra na každý den (hory a příroda; server/lib/hikeplan.js) ---------- */
  // Plán túr má tvar programu (days[].items – shrnutí cesty, kalendář, plánovač) a navíc den.hike: cíl, start, trasa
  // nebo odhad, obtížnost, občerstvení po cestě a varianty do deště a s dětmi. Texty skládá aplikace, server dává čísla.
  const GOAL_ICON = { summit: '⛰️', ridge: '🏔️', water: '💧', rocks: '🪨', view: '🔭', cave: '🕳️', castle: '🏰', hut: '🛖' };
  const GOAL_KIND = { summit: 'vrchol', ridge: 'hřbet', water: 'voda', rocks: 'skály', view: 'vyhlídka', cave: 'jeskyně', castle: 'hrad', hut: 'chata' };
  const HK_THEME = { summit: 'hlavní vrchol', other: 'jiná část hor', easy: 'lehčí den' };
  const FOOD_ICON = { hut: '🛖', restaurant: '🍽️', cafe: '☕' };
  const HK_HOW = { parking: 'parkoviště – autem', station: 'nádraží / zastávka – vlakem nebo busem', town: 'obec – autem nebo busem' };
  const HK_NOTE = {
    arrival: 'Den příjezdu – na túru už není čas: procházka po okolí a odpočinek.',
    departure: 'Den odjezdu – na túru není čas: krátká procházka a cesta domů.',
    rest: 'Volno – odpočinek.',
    nogoal: 'Volný den – další cíl túry v okolí jsem nenašel. Zopakuj nejhezčí túru, nebo si vyber z dalších cílů níže.',
  };
  const kmTxt = x => `${num(x)} km`;
  /** Túry ze serveru (api/hikeplan) ve tvaru plánu (kind 'hike') – Objevuj, krok Program i ⚡ Poskládej v průvodci Cestou. */
  async function makeHikePlan(o) {
    const exclude = [...(o.exclude || [])];
    const body = { lat: o.lat, lon: o.lon, label: o.label || '', start: o.start, end: o.end, arrivalTime: o.arrivalTime || null, departureTime: o.departureTime || null,
      kids: Boolean(o.kids), fromBase: o.fromBase !== false, exclude, ...(o.radius ? { radius: o.radius } : {}) };
    const j = await getJson('api/hikeplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!Array.isArray(j.days)) throw new Error('Túry se nepodařilo naplánovat.');
    const center = { lat: o.lat, lon: o.lon, label: o.label, city: o.city, country: o.country };
    const span = { start: o.start, end: o.end, arrivalTime: o.arrivalTime || null, departureTime: o.departureTime || null };
    return { kind: 'hike', days: j.days, spare: Array.isArray(j.spare) ? j.spare : [], warnings: j.warnings || [], area: j.area || null, food: j.food !== false, fromBase: j.fromBase !== false,
      ...(j.tiles ? { tiles: j.tiles } : {}), ...(j.demo ? { demo: true } : {}), center, span, prefs: { kids: Boolean(o.kids), exclude }, created: Date.now() };
  }
  // „~2 h 40 min“ / „~6,2 km“ k variantě
  const altLen = a => [a.km != null ? `~${kmTxt(a.km)}${a.estimate ? ' tam a zpět, odhad' : ''}` : '', a.minutes ? `~${minTxt(a.minutes)}` : ''].filter(Boolean).join(', ');
  function rainTxt(h) {
    const a = h.rain || { kind: 'turn' };
    const what = a.kind === 'cave' ? `jeskyně <b>${esc(a.name)}</b> – pod střechou${a.km != null ? ` (~${kmTxt(a.km)} od startu)` : ''}`
      : a.kind === 'hut' ? `jen k chatě <b>${esc(a.name)}</b> a zpět (${altLen(a)})`
      : a.kind === 'goal' ? `kratší vycházka k cíli <b>${esc(a.name)}</b> (${altLen(a)})`
      : `zkrať túru – otoč to v půlce${altLen(a) ? ` (po ${altLen(a)})` : ''}`;
    return `🌧️ Když prší nebo je mlha: ${what}${h.exposed ? '. Za bouřky, mlhy či silného větru na hřebeny a vrcholy nechoď.' : '.'}`;
  }
  function kidsTxt(h) {
    const a = h.kids;
    if (!a) return '';
    const what = a.kind === 'ok' ? 'túra je zvládnutelná i s dětmi (do 8 km a 400 m stoupání).'
      : a.kind === 'hut' ? `jen k chatě <b>${esc(a.name)}</b> a zpět (${altLen(a)}).`
      : a.kind === 'goal' ? `k cíli <b>${esc(a.name)}</b> (${altLen(a)}).`
      : `celá túra je na děti dlouhá – otočte se po ~${minTxt(a.minutes || 60)} chůze.`;
    return `<div class="dp-tip">🧒 S dětmi: ${what}</div>`;
  }
  function foodTxt(h) {
    if (h.food === null || h.food === undefined) return '🍽️ Občerstvení po cestě teď nevím – chaty a restaurace ověř v Mapy.com; vezmi si svačinu a pití.';
    if (!h.food.length) return h.estimate ? '🍽️ U cíle jsem chatu ani restauraci nenašel – vezmi si svačinu a pití.' : '🍽️ Po cestě jsem chatu ani restauraci nenašel – vezmi si svačinu a pití.';
    return `🍽️ ${h.estimate ? 'U cíle' : 'Po cestě'}: ${h.food.map(f => `${FOOD_ICON[f.kind] || '🍽️'} ${esc(f.name)}${h.estimate ? '' : ` <span class="faint">(${kmTxt(f.km)})</span>`}`).join(' · ')}`;
  }
  function startTxt(h, fromBase) {
    const s = h.start;
    if (!s) return '📍 Start: najdi si ho v Mapy.com (parkoviště ani obec u cíle neznám).';
    if (s.kind === 'base') return `🚶 Start: <b>${esc(s.name)}</b> – pěšky tam a zpět`;
    const far = fromBase && s.km ? `, ~${kmTxt(s.km)} od ubytování` : '';
    return `${TH_ICON[s.kind] || '📍'} Start: <b>${esc(s.name)}</b> <span class="faint">(${HK_HOW[s.kind] || 'start'}${far}${s.toGoal != null ? ` · ${kmTxt(s.toGoal)} vzdušnou čarou od cíle` : ''})</span> – pak tam a zpět`;
  }
  // Čísla dne túry jen jako čísla (plán může přijít z cizího odkazu #trip=) – do stránky nic jiného nepustit.
  const nn = v => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
  const okGeom = g => Array.isArray(g) && g.length > 1 && g.every(c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) && (c[2] == null || Number.isFinite(c[2])));
  function normHike(h) {
    const alt = a => (a && typeof a === 'object' ? { kind: String(a.kind || ''), name: String(a.name || ''), km: nn(a.km), minutes: nn(a.minutes), estimate: Boolean(a.estimate) } : null);
    const lvl = h.difficulty && [1, 2, 3].includes(+h.difficulty.level) ? +h.difficulty.level : 0;
    return {
      ...h, km: nn(h.km), ascent: nn(h.ascent), descent: nn(h.descent), minutes: nn(h.minutes), top: nn(h.top), estimate: Boolean(h.estimate), long: Boolean(h.long),
      back: /^\d{2}:\d{2}$/.test(h.back || '') ? h.back : null, geometry: okGeom(h.geometry) ? h.geometry : null, rain: alt(h.rain), kids: h.kids ? alt(h.kids) : null,
      food: Array.isArray(h.food) ? h.food.filter(f => f && f.name).map(f => ({ name: String(f.name), kind: f.kind, km: nn(f.km) })) : null,
      difficulty: lvl ? { level: lvl, label: String(h.difficulty.label || '') } : null, exposed: Boolean(h.exposed),
      start: h.start && typeof h.start === 'object' ? { ...h.start, name: String(h.start.name || ''), km: nn(h.start.km), toGoal: nn(h.start.toGoal) } : null,
      goal: { ...h.goal, name: String(h.goal.name || ''), id: String(h.goal.id || '') },
    };
  }
  function hikeDayHtml(d, i, center, plan) {
    const h = d.hike && d.hike.goal && okPt(d.hike.goal) ? normHike(d.hike) : null;
    const typ = d.type === 'short' ? (d.arrival ? 'den příjezdu · kratší túra' : d.departure ? 'den odjezdu · kratší túra' : 'kratší túra')
      : d.type === 'rest' ? (d.arrival ? 'den příjezdu' : d.departure ? 'den odjezdu' : 'volno') : `celodenní túra${d.arrival ? ' · den příjezdu' : d.departure ? ' · den odjezdu' : ''}`;
    const head = `<h4><span><span style="color:${DAY_COLORS[i % DAY_COLORS.length]}">●</span> Den ${i + 1} · ${dayLbl(d.date)} · ${typ}${wxSlot(h ? h.goal : center, d.date)}</span>${h ? dayLinks(h.googleUrl, h.mapyUrl, 'túra') : ''}</h4>`;
    if (!h) return `<div class="day-plan hk-day" data-day="${i}">${head}<div class="faint" style="font-size:13px;padding:6px 0">${esc(HK_NOTE[d.note] || HK_NOTE.rest)}</div></div>`;
    const g = h.goal;
    const from = h.start ? `z: ${h.start.name}` : '';
    const diff = h.difficulty ? `<span class="hk-diff hk-d${h.difficulty.level}">${esc(h.difficulty.label)}</span>` : '';
    const budget = nn(d.budget) || 0;
    const stats = h.minutes && h.km != null
      ? `<div class="bike-stats"><b>${kmTxt(h.km)}</b>${h.ascent != null ? `<span>↗ ${h.ascent} m</span><span>↘ ${h.descent ?? h.ascent} m</span>` : ''}<span>⏱️ ~${minTxt(h.minutes)} chůze</span>${diff}</div>`
      : h.km ? `<div class="bike-stats"><b>~${kmTxt(h.km)}</b><span>tam a zpět – odhad vzdušnou čarou, převýšení a čas ověř v Mapy.com</span></div>` : '';
    // na celou túru dnes není čas (den příjezdu / odjezdu): otočit nejpozději v půlce času, který den má
    const long = h.long ? `<div class="note warn" style="margin:6px 0">⏳ <div>${d.type === 'full'
      ? `Dlouhá túra – vyraz brzy ráno${h.back ? ` (se startem ${esc(d.from)} a přestávkami zpět kolem ${esc(h.back)})` : ''}, nebo ji zkrať.`
      : `Na celou túru dnes není čas (${h.minutes ? `~${minTxt(h.minutes)} chůze, ` : ''}den má na chůzi ~${minTxt(budget)}) – jdi jen kus cesty a otoč to nejpozději po ~${minTxt(Math.max(30, Math.round(budget / 2 / 15) * 15))}.`}</div></div>` : '';
    const top = h.top ? `nejvýš ~${String(h.top).replace(/\B(?=(\d{3})+$)/, ' ')} m n. m.` : '';
    return `<div class="day-plan hk-day" data-day="${i}">${head}
      <div class="hk-goal"><b>${GOAL_ICON[g.kind] || '📍'} ${esc(g.name)}</b> <span class="faint">${[from ? esc(from) : '', g.theme && HK_THEME[g.theme] && d.type === 'full' ? HK_THEME[g.theme] : '', top].filter(Boolean).join(' · ')}</span>
        <button type="button" class="linkbtn hk-drop" data-hdrop="${esc(g.id)}" title="Vyřadit tento cíl a naplánovat jiný">✕ jiný cíl</button></div>
      ${stats}${long}
      <div class="dp-walk">${startTxt(h, plan.fromBase !== false)}</div>
      <div class="dp-walk">${foodTxt(h)}</div>
      ${h.back ? sunSlot(g, d.date, h.back, `Počítám se startem ${d.from} a s přestávkami – zpět kolem ${h.back}.`) : ''}
      ${h.geometry ? elevSvg(h.geometry, '#f97316') : ''}
      <div class="dp-tip">${rainTxt(h)}</div>${kidsTxt(h)}
      <div class="hk-acts">${h.geometry ? `<button type="button" class="linkbtn" data-hgpx="${i}">⬇️ GPX</button>` : ''}${g.url ? `<a class="linkbtn" href="${esc(safeUrl(g.url))}" target="_blank" rel="noopener">Wikipedie ↗</a>` : ''}</div>
    </div>`;
  }
  // Mapy.com na místě cíle (další cíle v okolí)
  const mapyAt = p => `https://mapy.com/fnc/v1/showmap?${new URLSearchParams({ mapset: 'outdoor', center: mll(p), zoom: '14', marker: 'true' })}`;
  function hikePlanHtml(plan, center) {
    if (!plan) return '';
    const n = plan.days.filter(d => d.hike).length;
    const warn = (plan.warnings || []).map(w => `<div class="note warn" style="margin-bottom:10px">⚠️ <div>${esc(w)}</div></div>`).join('');
    const spare = (plan.spare || []).filter(okPt);
    return `${plan.demo ? '<div class="note warn" style="margin-bottom:10px">⚠️ <div><b>DEMO data</b> – cíle, starty i trasy jsou vymyšlené.</div></div>' : ''}${warn}
      <div class="faint hk-intro">🥾 ${n ? `Túra na každý den${plan.area ? ` · ${esc(plan.area.cs)}` : ''} – každý den jiný cíl, ✕ u cíle naplánuje jiný.` : 'Na túru tu nevyšel ani jeden den.'}</div>
      ${plan.days.map((d, i) => hikeDayHtml(d, i, center, plan)).join('')}
      ${spare.length ? `<details class="more"><summary>Další cíle v okolí (${spare.length})</summary><div class="hk-spare">${spare.map(s => `<div>${GOAL_ICON[s.kind] || '📍'} <b>${esc(s.name)}</b> <span class="faint">· ${esc(GOAL_KIND[s.kind] || '')}${s.d != null && plan.fromBase !== false ? ` · ${kmTxt(s.d)}` : ''}</span> <a class="linkbtn" href="${esc(safeUrl(mapyAt(s)))}" target="_blank" rel="noopener">Mapy.com ↗</a></div>`).join('')}</div></details>` : ''}
      <div class="faint" style="font-size:11.5px;margin-top:8px">Provoz chat a lanovek ověř; v horách sleduj předpověď a značení. Data: Wikidata, BRouter a © OpenStreetMap. ${WX_SRC}.${footMore('Cíle: Wikidata (nejznámější vrcholy, hřbety, vodopády, jezera, skály, hrady a chaty v okolí), start u cíle: Wikidata, trasa tam a zpět: BRouter (profil pěší turistiky) nad © OpenStreetMap, občerstvení po cestě: © OpenStreetMap (Overpass). Čas chůze podle turistického vzorce DIN 33466 (4 km/h, 300 m stoupání a 500 m klesání za hodinu, kratší z obou časů se přičte polovinou), bez přestávek – na ně počítám ~20 %. Obtížnost: lehká do 3 h chůze a 400 m stoupání, náročná nad 6 h, 1 000 m stoupání nebo 20 km. Bez trasy odhad: vzdušná čára × 1,35 tam a zpět.')}</div>`;
  }
  // Mapa túr: cíle očíslované po dnech, start u cíle, trasa dne plnou čarou (odhad čárkovaně start → cíl).
  function drawHikes(state, center, plan, onClick) {
    if (!state.map || !plan) return;
    const pts = [];
    const lines = [];
    plan.days.forEach((d, i) => {
      const h = d.hike;
      if (!h || !okPt(h.goal)) return;
      const col = DAY_COLORS[i % DAY_COLORS.length];
      pts.push({ id: `hk${i}`, lat: h.goal.lat, lon: h.goal.lon, color: col, num: i + 1, big: true, day: i, label: `${GOAL_ICON[h.goal.kind] || '📍'} ${h.goal.name} · den ${i + 1}`, q: gq(h.goal.name, center.country || ''), place: { id: `hk${i}`, day: i } });
      if (h.start && h.start.kind !== 'base' && okPt(h.start)) pts.push({ id: `hks${i}`, lat: h.start.lat, lon: h.start.lon, color: '#0ea5e9', num: TH_ICON[h.start.kind] || '📍', day: i, label: `${TH_ICON[h.start.kind] || '📍'} ${h.start.name} – start túry (den ${i + 1})`, q: h.start.name });
      if (okGeom(h.geometry)) lines.push({ color: col, coords: h.geometry.map(c => [c[0], c[1]]), solid: true, fit: true });
      else if (h.start && okPt(h.start)) lines.push({ color: col, coords: [[h.start.lon, h.start.lat], [h.goal.lon, h.goal.lat]], fit: true });
    });
    paintMap(state.map, center, pts, lines, onClick, null, plan.tiles === 'mapy');
  }
  // GPX túry dne (geometrie ze serveru – v plánu cesty uložená, z odkazu bez ní)
  function hikeGpx(plan, i, center) {
    const d = plan.days[i];
    const h = d && d.hike;
    if (!h || !okGeom(h.geometry)) return;
    const name = `${h.goal.name}${h.start ? ` – z: ${h.start.name}` : ''} (${dayLbl(d.date).replace(/ /g, ' ')})`;
    downloadText(`atlas-tura-${slug(h.goal.name)}-${d.date}.gpx`, gpxOf({ geometry: h.geometry }, name), 'application/gpx+xml');
  }
  // Program je plán ve městě, ale okolí je hlavně příroda (Krkonoše z města v horách): nabídnout túry
  const isRural = plan => Boolean(plan && plan.kind !== 'hike' && (plan.days || []).some(d => d.rural));

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
  // Plány se starým termínem, počtem dní nebo tempem: do úspěšného přeplánování zešedlé a bez uložení,
  // přeplánují se i po přepnutí režimu a zpět.
  const redo = new Set();
  // Zahozený plán (jiný režim, doprava): i dotaz, který pro něj ještě běží – jeho odpověď se už neuloží.
  const dropPlan = k => {
    if (k === 'city') ex.plan = null; else if (k === 'hikes') ex.hikePlan = null; else delete ex.trips[k];
    if (busy[k]) { replanSeq[k] = (replanSeq[k] || 0) + 1; delete busy[k]; }
    redo.delete(k);
  };
  const curKey = () => (ex.mode === 'bike' ? (ex.bike.kind === 'train' ? 'train' : 'bike') : ex.mode === 'hike' ? (ex.hike.kind === 'days' ? 'hikes' : 'hike')
    : ex.mode === 'day' || ex.mode === 'loop' ? tripKey(ex.mode, ex.transport) : 'city');
  const keyKind = key => (key === 'city' ? 'city' : key === 'train' ? 'train' : key === 'hikes' ? 'hikes' : key === 'bike' || key === 'hike' ? 'route' : 'trips');
  const BTN_BUSY = { city: 'Skládám…', trips: 'Hledám cíle výletů…', train: 'Hledám nádraží a trasu…', route: 'Plánuju trasu…', hikes: 'Plánuju túry…' };
  const KEPT = { city: 'Níže je předchozí program.', trips: 'Níže jsou předchozí výlety.', train: 'Níže zůstává předchozí trasa.', route: 'Níže zůstává předchozí trasa.', hikes: 'Níže zůstávají předchozí túry.' };
  // Čekání ve výsledku: řádek se spinnerem nahoře (po SLOW_MS s vysvětlením), dosavadní výsledek pod ním zešedne.
  function showBusy() {
    const out = $('#exPlanOut');
    if (!out) return;
    const b = busy[curKey()];
    const row = $(':scope > .ex-busy', out);
    out.classList.toggle('stale', Boolean(b) || redo.has(curKey()));
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
  // Prázdný okruh: rovnou největší okruh ve městě (jeden dotaz, menší pak filtruje prohlížeč), z něj okruh 100 km
  // (nejzajímavější místa v okolí) a u programu ve městě tip na režimy, které fungují i bez památek v okolí.
  const MAX_R = RADII.at(-1);
  const nextR = r => (typeof r !== 'number' ? null : r < CITY_KM ? CITY_KM : r < MAX_R ? MAX_R : null);
  const emptyHtml = (radius, mode) => `<div class="empty" style="padding:26px 12px">V okruhu ${radius} km jsem nic zajímavého nenašel.${
    nextR(radius) ? `<div style="margin-top:12px"><button type="button" class="btn sm" data-rad="${nextR(radius)}">Zvětšit okruh na ${nextR(radius)} km</button></div>` : ''}${
    mode === 'city' ? altModesHtml() : ''}</div>`;
  const altModesHtml = () => `<div class="ex-alt"><span>I tady naplánuju:</span>${MODES.filter(([id]) => ['day', 'bike', 'hike'].includes(id)).map(([id, l]) => `<button type="button" class="fchip" data-mode="${id}">${l}</button>`).join('')}</div>`;
  // Program ve městě bez jediného místa: větší okruh pomůže jen pod CITY_KM (program bere místa nejvýš do něj), jinak jiný režim.
  const planEmptyHtml = radius => `<div class="empty" style="padding:18px 12px">Program není z čeho sestavit – v okruhu ${cityKm(radius)} km nejsou žádná místa.${
    typeof radius === 'number' && radius < CITY_KM ? `<div style="margin-top:12px"><button type="button" class="btn sm" data-rad="${CITY_KM}">Zvětšit okruh na ${CITY_KM} km</button></div>` : ''}${altModesHtml()}</div>`;

  function paintExplore() {
    // celá země: přehled země (doběhlý plán nebo místa v okolí ho nepřepíšou; načítání ho vykreslí samo)
    if (ex.radius === COUNTRY) { if (ex.country?.place === ex.place && ex.country.data) paintCountry(); return; }
    const body = $('#exBody'); if (!body) return;
    const p = ex.place;
    hideBack(); // po překreslení původní pozice v seznamu neplatí
    // okruh 50/100 km: k místům ve městě (do CITY_KM) nejzajímavější místa v okolí do okruhu
    const far = farOn(ex.radius), fr = far && ex.far?.place === p ? ex.far : null;
    ex.items = inRadius(far ? withFar(ex.all, fr?.items) : ex.all, ex.radius);
    const cats = [...new Set(ex.items.map(x => x.category))];
    if (ex.cat && !cats.includes(ex.cat)) ex.cat = ''; // filtr kategorie, která v okruhu už není
    const list = ex.items.filter(x => !ex.cat || x.category === ex.cat);
    const cityN = ex.items.filter(x => x.category !== 'daytrip').length;
    const tripN = ex.items.length - cityN;
    const st = ex.planState || (ex.planState = { interests: ex.interests, pace: ex.pace, exclude: new Set(), must: new Set(), items: [], map: null });
    const bikeMode = ex.mode === 'bike';
    const hikeMode = ex.mode === 'hike';
    // 🥾 Pěšky „Túra na každý den“: plán na víc dní (ne jedna trasa) – vlastní volby a výsledek
    const hikeDays = hikeMode && ex.hike.kind === 'days';
    const routeMode = bikeMode || (hikeMode && !hikeDays);
    const road = ex.mode === 'day' || ex.mode === 'loop';
    const trip = road ? ex.trips[tripKey(ex.mode, ex.transport)] : null;
    // Volby a trasa kola / pěšky; okruh a „vlakem tam“ mají každý svou trasu.
    const ro = hikeMode ? ex.hike : ex.bike;
    const train = bikeMode && ex.bike.kind === 'train';
    const rr = hikeMode ? (hikeDays ? null : ex.hikeRoute) : train ? ex.trainRoute : bikeMode ? ex.bikeRoute : null;
    const hp = hikeDays ? ex.hikePlan : null;
    const seqKey = curKey();
    const kind = keyKind(seqKey);
    const bz = busy[seqKey];
    const er = ex.errs[seqKey];
    const dayOpts = ex.mode === 'loop' ? [2, 3, 4, 5, 6, 7, 10] : ex.mode === 'day' ? [1, 2, 3, 4, 5, 7] : [1, 2, 3, 4, 5, 6, 7, 10];
    const curDays = road ? ex.tripDays[ex.mode] : ex.days;
    // Program bez jediného místa (prázdný okruh) se neukládá a místo dnů „Volno“ řekne proč.
    const cityPlan = Boolean(ex.plan?.days.some(d => d.items.length));
    const hasPlan = hikeDays ? hp : routeMode ? rr : road ? trip && trip.days.length : cityPlan;
    // program ve městě v horách (Krkonoše z Pece): nabídnout túru na každý den místo programu po místech
    const ruralTip = isRural(ex.plan) ? '<div class="note info hk-tip" style="margin-bottom:10px">⛰️ <div>Tady je hlavně příroda – místo programu po místech zkus túru na každý den. <button type="button" class="btn sm" data-tohike>🥾 Túra na každý den</button></div></div>' : '';
    const out = hikeDays ? hikePlanHtml(hp, p) : routeMode ? routeHtml(rr, p, ex.start) : road ? tripHtml(trip, p) : !ex.plan ? ''
      : cityPlan ? ruralTip + planHtml(ex.plan, p.geo ? p : { ...p, startAt: 'center' }) : planEmptyHtml(ex.radius);
    const inPlan = ex.mode === 'city' ? planIds(ex.plan) : new Set();
    // V režimu výletů jde z výpisu přidat jen výlet mimo město (do programu ve městě patří ostatní). Místo z okolí
    // (okruh 50/100 km), které program ve městě nezná, nabídne „🎒 Výlet sem“ (jednodenní výlety s ním).
    const inPool = new Set(ex.all.map(x => x.id));
    const drive = x => far && x.category === 'daytrip';
    const card = x => (road
      ? poiCard(x, x.category === 'daytrip' ? { tripToggle: true, center: p, drive: drive(x) } : { center: p })
      : routeMode || hikeDays ? poiCard(x, { center: p, drive: drive(x) })
        : x.category === 'daytrip' && !inPool.has(x.id) ? poiCard(x, { center: p, drive: true, tripGo: true })
          : poiCard(x, { toggle: true, must: st.must, inPlan, center: p, drive: drive(x) }));
    const segBtns = (list, attr, cur) => list.map(([id, l]) => `<button type="button" ${attr}="${id}" class="${cur === id ? 'on' : ''}">${l}</button>`).join('');
    const entryOf = () => plannerEntry({ rr, trip, plan: ex.plan, hikes: hp, place: p, start: ex.start });
    const saveBtn = hasPlan ? saveHtml(findTripFor(S.trips, entryOf()), S.trips) : '';
    const planLbl = routeMode ? 'Naplánovat trasu' : road ? 'Naplánovat výlet' : hikeDays ? 'Naplánovat túry' : 'Sestavit program';
    // hotový program: tlačítko už jen „↻ znovu“ a vedlejší – hlavní akce je teď program sám (a 💾 Uložit)
    const planBtn = `<button class="btn${hasPlan ? '' : ' primary'}" id="exPlan"${bz ? ' disabled' : ''}>${bz && !bz.other ? `<span class="spin"></span> ${BTN_BUSY[kind]}` : hasPlan ? `↻ ${planLbl}` : planLbl}</button>`;
    // Vlakem tam: jízda nevede přes památky, „městem“ = smíšeně.
    const scen = train ? BIKE_SCENERY.filter(([id]) => id !== 'city') : BIKE_SCENERY;
    const hikeKinds = hikeMode ? `<div class="seg wrap" style="margin:0 0 10px">${segBtns(HIKE_KINDS, 'data-hkind', ex.hike.kind)}</div>` : '';
    // túra na každý den: od kdy, kolik dní, s dětmi (stejný zájem jako u programu ve městě)
    const hikeDaysCtl = `${hikeKinds}<div class="row wrap" style="gap:10px;align-items:end">
          <div class="field" style="margin:0"><label for="exStart">Od</label><input class="input" type="date" id="exStart" value="${ex.start}"></div>
          <div class="field" style="margin:0"><label for="exDays">Počet dní</label><select id="exDays">${dayOpts.map(n => `<option ${curDays === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          ${planBtn}${saveBtn}
        </div>
        <div class="row wrap" style="gap:8px;margin:10px 0"><button type="button" class="fchip ${ex.interests.has('kids') ? 'on' : ''}" data-hkids aria-pressed="${ex.interests.has('kids')}">🧒 S dětmi</button></div>`;
    const routeCtl = `${bikeMode ? `<div class="seg wrap" style="margin:0 0 10px">${segBtns(BIKE_KINDS, 'data-bkind', ex.bike.kind)}</div>` : hikeKinds}
        <div class="row wrap" style="gap:10px;align-items:end">
          <div class="field" style="margin:0"><label for="exStart">Kdy</label><input class="input" type="date" id="exStart" value="${ex.start}"></div>
          <div class="field" style="margin:0"><label for="routeKm">${train ? 'Délka jízdy zpět' : 'Délka okruhu'}</label><select id="routeKm">${(hikeMode ? [5, 8, 10, 12, 15, 20, 25, 30] : [15, 25, 40, 60, 80, 100, 130]).map(n => `<option value="${n}" ${ro.km === n ? 'selected' : ''}>${n} km</option>`).join('')}</select></div>
          ${planBtn}${saveBtn}
        </div>
        ${bikeMode ? `<div class="row wrap" style="gap:8px;margin:10px 0 0"><div class="seg wrap">${segBtns(BIKE_TYPES, 'data-bike', ex.bike.bike)}</div></div>` : ''}
        <div class="row wrap" style="gap:8px;margin:10px 0"><div class="seg wrap">${segBtns(scen, 'data-scen', train && ro.scenery === 'city' ? 'mixed' : ro.scenery)}</div><div class="seg wrap">${segBtns(BIKE_HILLS, 'data-hills', ro.hills)}</div></div>`;
    // Chyba přímo ve výsledku (se „Zkusit znovu“), čekání nahoře nad dosavadním výsledkem.
    const errNote = er ? errHtml(errLead(kind, er.other), er.msg, 'exRetry', out ? KEPT[kind] : '') : '';
    const wait = bz ? waitHtml(bz.kind, Date.now() - bz.t0 >= SLOW_MS, '', bz.note) : '';
    const empty = cityN ? '<div class="empty">Nic v této kategorii.</div>' : emptyHtml(ex.radius, ex.mode);
    // okruh 50/100 km: dva oddíly (ve městě, v okolí) – z každého prvních LIST_TOP, další po „Zobrazit další místa“
    const cards = xs => xs.map((x, i) => (i < LIST_TOP ? card(x) : card(x).replace('class="', 'class="poi-x '))).join('');
    const cityL = list.filter(x => x.category !== 'daytrip'), farL = list.filter(x => x.category === 'daytrip');
    const farState = !far ? '' : fr?.busy ? waitHtml('far', Date.now() - fr.t0 >= SLOW_MS, '')
      : fr?.err ? errHtml('Místa v okolí se nepodařilo načíst', fr.err, 'exFarRetry', '') : '';
    const listIn = !far ? cards(list) || empty
      : `${cityL.length ? `<div class="poi-sec"><b>🏙️ Ve městě do ${CITY_KM} km</b> <span class="faint">(${cityL.length})</span></div>${cards(cityL)}` : ''}
        ${farL.length || farState ? `<div class="poi-sec"><b>🚗 V okolí do ${ex.radius} km</b> <span class="faint">${farL.length ? `(${farL.length}) · ` : ''}nejzajímavější města, hrady a příroda, doba jízdy autem odhadem</span></div>${farState}${cards(farL)}` : ''}`
        || empty;
    const hidden = far ? Math.max(0, cityL.length - LIST_TOP) + Math.max(0, farL.length - LIST_TOP) : Math.max(0, list.length - LIST_TOP);
    const placesIn = `${cats.length ? `<div class="ex-cats"><button type="button" data-cat="" class="${!ex.cat ? 'on' : ''}">Vše</button>${cats.map(c => `<button type="button" data-cat="${c}" class="${ex.cat === c ? 'on' : ''}">${icon(c)} ${(CAT[c] || CAT.sight)[1]}</button>`).join('')}</div>` : ''}
        <div class="poi-list${ex.listAll ? ' all' : ''}" id="exList">${listIn}</div>
        ${hidden && !ex.listAll ? `<button type="button" class="btn ghost poi-morebtn" id="exListMore">Zobrazit další místa (${hidden})</button>` : ''}`;
    // Na kole, pěšky a u výletů je hlavní výsledek trasa na mapě – seznam míst ve městě je sbalený.
    const places = ex.mode === 'city' ? `<div class="ex-places">${placesIn}</div>`
      : `<details class="more ex-places" id="exPlaces"${ex.listOpen ? ' open' : ''}><summary>📍 Místa v okolí (${ex.items.length})</summary>${placesIn}</details>`;
    body.innerHTML = `${ex.demo ? '<div class="note warn" style="margin-bottom:12px">⚠️ <div><b>DEMO data</b> – místa jsou vymyšlená.</div></div>' : ''}
      <div class="section-head ex-head" style="margin-top:6px"><h2>${p.cc ? flag(p.cc) : '📍'} ${esc(p.label)} · ${placesTxt(cityN)} do ${cityKm(ex.radius)} km${far ? (tripN ? ` <span class="ex-head-more">+ ${placesTxt(tripN)} v okolí do ${ex.radius} km</span>` : '')
          : tripN ? ` <span class="ex-head-more">+ ${plural(tripN, 'výlet', 'výlety', 'výletů')}</span>` : ''}</h2>${
        `<span class="ex-head-act">${window.Flights && flyTarget(p) ? '<button type="button" class="btn sm ghost" id="exFly">✈️ Najít lety sem</button>' : ''}<button type="button" class="btn sm ghost" id="exReset" title="Zrušit místo, plán i výběr míst">↺ Začít znovu</button></span>`}</div>
      <div class="ex-layout ex-main">
      <div class="card step-card ex-plan${ex.planOpen || out || bz || wait ? '' : ' shut'}" id="exPlanCard"><h3 class="ex-plan-h"><button type="button" class="ex-plan-tg" id="exPlanTg">🗓️ Naplánovat <span class="faint ex-plan-hint">– program, výlety, kolo, pěšky</span><span class="ex-plan-chev" aria-hidden="true">▾</span></button></h3>
        <div class="seg wrap" id="exMode" style="margin:4px 0 12px">${modeBtns(ex.mode)}</div>
        <div class="muted" style="font-size:13px;margin:-4px 0 10px">${ex.mode === 'city' ? 'Pěší program po památkách – každý den jiná část města.'
          : train ? `Vlakem z místa (${esc(p.label)}) na nádraží v dosahu zvolené délky jízdy a na kole zpátky: zvol délku, kolo a krajinu. Najdu nádraží, trasu domů a odkaz na spojení vlakem.`
          : bikeMode ? `Okruh na kole ze startu (${esc(p.label)}) a zpět: zvol délku, kolo a krajinu. Trasa vede hlavně po cyklostezkách a klidných cestách.`
          : hikeDays ? `Na každý den jiná túra tam a zpět${p.nature ? ` v okolí (${esc(p.label)})` : ` z: ${esc(p.label)}`}: hlavní vrchol, voda, skály nebo vyhlídka, lehčí den – s délkou, převýšením, časem chůze, obtížností, občerstvením po cestě a kratší variantou do deště.`
          : hikeMode ? `Pěší okruh ze startu (${esc(p.label)}) a zpět: zvol délku, krajinu a kopce. Plánovač dává přednost pěšinám, turistickým trasám a klidným cestám.`
          : ex.mode === 'day' ? `Ráno ${ex.transport === 'transit' ? 'vlakem nebo busem' : 'autem'} ven, večer zpátky: města, hrady a příroda do ~${ex.transport === 'transit' ? '3' : '2,5'} h cesty. Každý výlet jiný.`
          : `Okruh ${ex.transport === 'transit' ? 'vlakem a autobusem' : 'autem'} s přespáním po cestě – každý den pár zastávek, poslední den zpět na start.`}</div>
        ${hikeDays ? hikeDaysCtl : routeMode ? routeCtl : `<div class="row wrap" style="gap:10px;align-items:end">
          <div class="field" style="margin:0"><label for="exStart">Od</label><input class="input" type="date" id="exStart" value="${ex.start}"></div>
          <div class="field" style="margin:0"><label for="exDays">${ex.mode === 'day' ? 'Počet výletů' : 'Počet dní'}</label><select id="exDays">${dayOpts.map(n => `<option ${curDays === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          ${planBtn}${road ? '' : `<span class="ex-mustn" id="exMustN">${mustHtml(st.must.size)}</span>`}${saveBtn}
        </div>${road ? `<div class="row wrap" style="gap:8px;margin:10px 0"><div class="seg" id="exTransport">${TRANSPORTS.map(([id, l]) => `<button type="button" data-transport="${id}" class="${ex.transport === id ? 'on' : ''}">${l}</button>`).join('')}</div><select data-pace aria-label="Tempo programu" style="width:auto;padding:7px 30px 7px 10px;font-size:12.5px">${[['relaxed', '🐢 V klidu'], ['normal', '🚶 Normálně'], ['intense', '🏃 Nabitě']].map(o => `<option value="${o[0]}" ${ex.pace === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>
        <div class="row wrap" style="gap:8px;margin:0 0 10px"><span class="faint" style="font-size:12.5px;align-self:center">Co tě láká:</span>${TRIP_INTERESTS.map(([id, l]) => `<button type="button" class="fchip ${ex.tripInterests.has(id) ? 'on' : ''}" data-tint="${id}" aria-pressed="${ex.tripInterests.has(id)}">${l}</button>`).join('')}</div>` : plannerControls(st)}`}
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
      if (el.classList.contains('poi-x')) { ex.listAll = true; el.closest('.poi-list').classList.add('all'); const lb = $('#exListMore'); if (lb) lb.remove(); } // skrytá karta ze značky na mapě
      if (!stacked()) {
        const det = el.closest('details');
        if (det) det.open = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      flash(el);
    };
    if (rr) drawRoute(st, p, rr);
    else if (trip) drawTrips(st, p, trip, hl);
    // túry: klik na cíl na mapě zvýrazní jeho den
    else if (hp) drawHikes(st, p, hp, x => { const el = $(`#exPlanOut .day-plan[data-day="${x.day}"]`, body); if (el) { if (!stacked()) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(el); } });
    // u programu i zastávky mimo načtený seznam (připnuté, za okruhem)
    else if (ex.mode === 'city' && ex.plan) drawOnMap(st, p, withPlanStops(ex.items, ex.plan), ex.plan, hl);
    else drawOnMap(st, p, list, null, hl, far);
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
    const onlyThisTrip = () => { for (const k of new Set([...Object.keys(ex.trips), ...Object.keys(busy)])) if (k !== seqKey && keyKind(k) === 'trips') dropPlan(k); };
    $$('[data-tint]', body).forEach(b => b.onclick = () => {
      const id = b.dataset.tint;
      ex.tripInterests.has(id) ? ex.tripInterests.delete(id) : ex.tripInterests.add(id);
      b.classList.toggle('on', ex.tripInterests.has(id)); b.setAttribute('aria-pressed', ex.tripInterests.has(id));
      remember();
      onlyThisTrip();
      if (trip) replanSoon(seqKey); // zobrazený plán se přeplánuje (i po víc kliknutích jen jednou)
    });
    // odkaz v kartě (Wikipedie, Google Maps) jen otevře odkaz – kartu nezaměří (dřív atribut onclick se stopPropagation v HTML – ten CSP nepustí)
    $$('#exList [data-poi]', body).forEach(c => c.onclick = e => { if (!e.target.closest('a')) focus(ex.items.find(i => i.id === c.dataset.poi), c, 'seznam'); });
    const lm = $('#exListMore', body); if (lm) lm.onclick = () => { ex.listAll = true; $('#exList', body).classList.add('all'); lm.remove(); };
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
      b.classList.toggle('on', st.interests.has(b.dataset.int)); b.setAttribute('aria-pressed', st.interests.has(b.dataset.int));
      remember();
      if (ex.plan) replanSoon('city');
    });
    // Tempo platí pro všechny plány: zobrazený se přeplánuje, ostatní (jiný režim, doprava) se zahodí jako u zájmů.
    on('[data-pace]', 'onchange', e => {
      st.pace = e.target.value; ex.pace = e.target.value; remember();
      onlyThisTrip();
      if (road) dropPlan('city');
      replanShown();
    });
    // Termín, počet dní a tempo: zobrazený i právě plánovaný program / výlety hned zešednou (uložit nejde – byly by
    // se starými volbami), běžící dotaz se zahodí a přeplánuje se. onBlur = datum psané klávesnicí: až po opuštění pole.
    const replanShown = onBlur => {
      if (routeMode || !(road ? trip : hikeDays ? hp : ex.plan) && !busy[seqKey]) return;
      redo.add(seqKey);
      if (busy[seqKey]) { replanSeq[seqKey]++; delete busy[seqKey]; }
      $('#exPlanOut', body)?.classList.add('stale');
      $$('#exSave, #exSaveNew', body).forEach(b => { b.disabled = true; });
      if (!onBlur) replanSoon(seqKey);
    };
    // Klávesnicí Chrome hlásí změnu po každé části data (i neúplné, rok 0002) – překreslení by psaní přerušilo.
    let typed = false, later = false;
    on('#exStart', 'onkeydown', e => { typed = true; if (e.key === 'Enter') e.target.blur(); });
    on('#exStart', 'onblur', e => {
      typed = false;
      if (!okStart(e.target.value, fmtYMD(new Date()))) e.target.value = ex.start; // rozepsané / smazané → platný termín
      // napsaný termín se přeplánuje teď; ne když pole zmizelo překreslením (to přeplánuje samo)
      if (later) { later = false; setTimeout(() => { if (e.target.isConnected && redo.has(seqKey) && !busy[seqKey]) replanSoon(seqKey); }); }
    });
    on('#exStart', 'onchange', e => {
      if (!okStart(e.target.value, fmtYMD(new Date()))) return;
      later = typed;
      ex.start = e.target.value;
      ex.datePicked = true; // „Najít lety sem“ pak hledá přesně v termínu
      remember();
      // ostatní plány pro starý termín se zahodí (při přepnutí se naplánují znovu)
      onlyThisTrip();
      if (ex.mode !== 'city') dropPlan('city');
      if (!hikeDays) dropPlan('hikes'); // túry pro starý termín (Pěšky → jiný režim) se naplánují znovu
      replanShown(typed);
      // Uložení k cestě závisí na datu (stejné místo a začátek) – tlačítko podle nového dne (i po „✓ Uloženo“)
      if (rr) {
        const old = $$('#exSave, #exSaveNew', body);
        if (old.length) {
          old[0].insertAdjacentHTML('beforebegin', saveHtml(findTripFor(S.trips, plannerEntry({ rr, place: p, start: ex.start })), S.trips));
          old.forEach(b => b.remove());
          on('#exSave', 'onclick', () => store(false));
          on('#exSaveNew', 'onclick', () => store(true));
        }
      }
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
    on('#exDays', 'onchange', e => {
      if (road) {
        ex.tripDays[ex.mode] = +e.target.value;
        for (const [id] of TRANSPORTS) if (tripKey(ex.mode, id) !== seqKey) dropPlan(tripKey(ex.mode, id)); // jiná doprava pro starý počet
      } else {
        ex.days = +e.target.value;
        dropPlan(hikeDays ? 'city' : 'hikes'); // program ve městě a túry sdílejí počet dní – ten druhý pro starý počet pryč
      }
      remember();
      replanShown();
    });
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
    // Pěšky: jeden okruh / túra na každý den – každý druh ukazuje svůj výsledek
    $$('[data-hkind]', body).forEach(b => b.onclick = () => {
      if (ex.hike.kind === b.dataset.hkind) return;
      ex.hike.kind = b.dataset.hkind;
      remember();
      paintExplore();
    });
    // S dětmi (zájem sdílený s programem ve městě): hotové túry se přeplánují
    on('[data-hkids]', 'onclick', e => {
      if (ex.interests.has('kids')) ex.interests.delete('kids'); else ex.interests.add('kids');
      e.currentTarget.classList.toggle('on', ex.interests.has('kids'));
      e.currentTarget.setAttribute('aria-pressed', String(ex.interests.has('kids')));
      dropPlan('city');
      remember();
      if (hp || busy[seqKey]) replanShown();
    });
    // ✕ jiný cíl: cíl se vyřadí a túry se naplánují znovu (trasy ostatních dnů jsou v mezipaměti serveru)
    $$('[data-hdrop]', body).forEach(b => b.onclick = () => { ex.hikeEx.add(b.dataset.hdrop); replan(); });
    $$('[data-hgpx]', body).forEach(b => b.onclick = () => hp && hikeGpx(hp, +b.dataset.hgpx, p));
    on('[data-tohike]', 'onclick', () => { ex.mode = 'hike'; ex.hike.kind = 'days'; ex.autoPlan = !ex.hikePlan; remember(); paintExplore(); $('#exPlanCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
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
          const nat = hikeMode ? hikeNature(p) : {};
          const ask = () => getJson(hikeMode ? 'api/hike' : 'api/bike', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: p.lat, lon: p.lon, ...ro, variant, ...home, ...nat, sights }) });
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
        } else if (hikeDays) {
          // střed hor z Objevuj (Krkonoše) není ubytování – start každý den u cíle; místa ze stejného okruhu jako seznam
          const plan = await makeHikePlan({ lat: p.lat, lon: p.lon, label: p.label, city: p.label, country: p.country, start: ex.start, end: plusDays(ex.start, ex.days - 1),
            kids: ex.interests.has('kids'), fromBase: !p.nature, exclude: [...ex.hikeEx], ...(ex.loaded?.radius >= 10 ? { radius: Math.min(25, ex.loaded.radius) } : {}) });
          if (my !== replanSeq[key] || ex.place !== p) return;
          ex.hikePlan = plan;
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
          // Okruh: server vezme seznam z mezipaměti (načtený okruh) a místa za zvoleným okruhem vynechá; u okruhu
          // 50/100 km jen místa ve městě (do CITY_KM) – den programu nevede 90 km daleko.
          const km = cityKm(ex.radius);
          const plan = await makePlan(st, p, { start: ex.start, end: plusDays(ex.start, ex.days - 1), arrivalTime: '09:00', departureTime: null },
            { radius: ex.loaded?.radius || km, exclude: [...st.exclude, ...outsideIds(ex.all, km, st.must)] });
          if (my !== replanSeq[key] || ex.place !== p) return;
          plan.radius = km;
          ex.plan = plan;
        }
        ok = true;
        redo.delete(key);
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
    // ✨ věta v hledání („Lisabon na 3 dny“): plán se sestaví sám, jakmile jsou místa načtená
    if (ex.autoPlan && !bz) { ex.autoPlan = false; setTimeout(() => { const b = $('#exPlan'); if (b && !b.disabled && ex.place === p) replan(b); }, 0); }
    // telefon: karta Naplánovat sbalená do nadpisu, dokud není program (místa jsou hned pod hledáním)
    $('#exPlanTg', body).onclick = () => { const c = $('#exPlanCard', body), open = c.classList.contains('shut'); c.classList.toggle('shut', !open); ex.planOpen = open; };
    on('#routeOther', 'onclick', () => replan($('#routeOther'), { other: true }));
    on('#exRetry', 'onclick', () => replan(null, { other: er?.other }));
    on('#routeGpx', 'onclick', () => downloadText(`atlas-${hikeMode ? 'pesky' : rr.kind === 'train' ? 'vlak-kolo' : 'kolo'}-${slug(p.label)}-${rr.km}km.gpx`, gpxOf(rr, routeName(rr, p)), 'application/gpx+xml'));
    $$('[data-drop]', body).forEach(b => b.onclick = () => dropUndo(st, b.dataset.drop, ex.plan, () => replan()));
    $$('[data-tdrop]', body).forEach(b => b.onclick = () => { ex.tripEx.add(b.dataset.tdrop); ex.tripMust.delete(b.dataset.tdrop); onlyThisTrip(); replan(); });
    $$('[data-tmust]', body).forEach(b => b.onclick = e => { e.stopPropagation(); ex.tripMust.add(b.dataset.tmust); ex.tripEx.delete(b.dataset.tmust); onlyThisTrip(); replan(); });
    // 🎒 Výlet sem (místo z okolí v okruhu 50/100 km): jednodenní výlety s tímto místem – naplánují se hned
    $$('[data-tgo]', body).forEach(b => b.onclick = e => {
      e.stopPropagation();
      ex.tripMust.add(b.dataset.tgo); ex.tripEx.delete(b.dataset.tgo);
      for (const k of new Set([...Object.keys(ex.trips), ...Object.keys(busy)])) if (keyKind(k) === 'trips') dropPlan(k); // plány bez nového cíle
      ex.mode = 'day'; ex.planOpen = true; ex.autoPlan = true;
      paintExplore();
      $('#exPlanCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    on('#exFarRetry', 'onclick', () => loadFar());
    // Uložení: zůstává se v Objevuj (toast s „Otevřít v plánovači“); cesta do stejného místa se stejným začátkem
    // v plánovači už je → přidá se k ní (bez opakování řádků), „jako novou“ založí další.
    const store = asNew => {
      const entry = entryOf();
      const i = asNew ? -1 : findTripFor(S.trips, entry);
      let t = S.trips[i];
      if (t) mergeInto(t, entry);
      else S.trips.push(t = { ...entry, explore: { [entry.src]: entry.days }, exploreNotes: { [entry.src]: entry.notes }, genName: entry.name, pax: '2', budget: '', checklist: packFor(entry.src).map(x => ({ t: x, done: false })) });
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
    on('#exReset', 'onclick', () => resetExplore());
    on('#exSaveNew', 'onclick', () => store(true));
    remember();
    // Program pro jiný okruh (okruh se mezitím změnil) se přeplánuje sám – jen když zrovna neběží a neselhal.
    if (ex.mode === 'city' && ex.plan && ex.plan.radius != null && ex.plan.radius !== cityKm(ex.radius) && !bz && !er) replanSoon('city');
    // okruh 50/100 km: místa v okolí (jednou na místo, seznam ve městě je mezitím vidět)
    if (far && !(ex.far?.place === p)) loadFar();
    // Plán se starým termínem / tempem (režim se přepnul dřív, než se přeplánoval, nebo přeplánování selhalo): zešedlý, bez uložení.
    if (redo.has(seqKey)) {
      $('#exPlanOut', body).classList.add('stale');
      $$('#exSave, #exSaveNew', body).forEach(b => { b.disabled = true; });
      if (!bz && !er) replanSoon(seqKey);
    }
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
    renderExplore, renderPlanner, retheme, routeMap, dayRoute, gmDir, openAt, preview, previewHtml, openCountryView, makeHikePlan,
    // jen pro testy (test/places-ui.test.js)
    _t: { tripPlaces, ownPlaces, savedPlaces, inspSub, searchedPlaces, plural, placesTxt, mustTxt, inRadius, needsFetch, outsideIds, planIds, withPlanStops, enterAction, sugHtml, waitHtml, errLead, errHtml, httpErr, mustBtn, poiCard,
      uiSnapshot, uiRestore, okStart, pushRecent, samePlace, cleanPlace, getJson, firstSentence, descHtml, inclHtml, gq, poiQ, centerQ, gmDir, dayLbl, slug, gpxOf, SLOW_MS, UI_LS,
      countryCs, stopQ, mapyDir, dayLinks, planHtml, tripHtml, MAPY_WP, emptyHtml, planEmptyHtml, variantTxt, routeHtml, ROUTE_VARIANTS, blankHtml, looksEnglish, surfaceRows, surfaceHtml,
      afterDark, routeBack, sunSlot, sunHtml, fillSun, toHm, modeBtns, previewPick, previewCard, moreTxt, poiUrl, pvFor, PREVIEW_KM, ex, loadExplore,
      plannerEntry, findTripFor, mergeInto, saveHtml, flyTarget, flyDates, prefsOf, makePlan,
      RADII, CITY_KM, COUNTRY, cityKm, farOn, withFar, driveMin, countryItems, countryCard, countryTarget, C_GROUPS, CC_CATS, countryPick, loadCountryCat, setRadius, paintCountry, loadFar,
      countryOfText, countrySugs, wholeCountryOf, pickerHtml, openWholeCountry, CC_POP, smartPlace, smartName, setPlace, natureMode, exploreApply, hikeNature,
      makeHikePlan, hikePlanHtml, hikeDayHtml, rainTxt, kidsTxt, foodTxt, startTxt, isRural, HIKE_KINDS, curKey, keyKind },
  };
})();
