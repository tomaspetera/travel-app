/* ATLAS – „Před cestou“: co zařídit (cestovní pojištění, EHIC, DROZD, řidičský průkaz, zásuvky, měna, očkování)
   a chytrý seznam věcí na cestu podle podnebí v termínu cesty, délky pobytu, dopravy a zavazadel, dokladů,
   očkování a aktivit. Data: public/data/pretrip.json (ověřeno 10/2026, zdroje v README), vstupní podmínky z Entry
   (data/entry.json), podnebí z api/climate (dlouhodobý průměr: meteostanice u letiště, jinak NASA POWER). Odškrtnuté položky jsou v localStorage
   pro každou cestu zvlášť (atlas_pretrip_v1); zvolené aktivity a vlastní položky jsou v cestě (t.pretrip.acts,
   t.pretrip.custom). Sdílený odkaz #trip= nese i odškrtnutí (t.pretrip.done – po importu se přesunou do localStorage
   nové cesty). Texty vždy přes esc(), odkazy přes safeUrl() (obojí z app.js). */
(function () {
  let DATA = null;
  let loading = null;
  let failed = false; // data se nepodařilo načíst (karta to řekne; znovu až po obnovení stránky)
  let last = null; // naposledy vykreslená cesta – po dorazu dat nebo podnebí se karta překreslí na místě
  let refreshTimer = null;
  const LS = 'atlas_pretrip_v1';
  const KEEP = 30; // odškrtnuté položky si pamatujeme u nejvýš tolika cest
  // Id odškrtnutí ze sdíleného odkazu (cizí vstup) jen ve známém tvaru: úkol (todo:ins) nebo věc ze seznamu
  // (pack:doc-pass, pack:tc-adapter-AB, vlastní pack:my-3); nejvýš DONE_MAX. Vlastních položek nejvýš OWN_MAX po OWN_LEN znacích.
  const DONE_ID = /^(todo:[a-z]{2,8}|pack:[a-z]{2,4}-[A-Za-z0-9-]{1,24})$/;
  const DONE_MAX = 200, OWN_MAX = 30, OWN_LEN = 80;
  // Území USA mají pravidla USA (stejně jako v entry.js)
  const ALIAS = { PR: 'US', VI: 'US', GU: 'US', MP: 'US' };
  const canon = iso => (Object.hasOwn(ALIAS, iso) ? ALIAS[iso] : iso);
  const own = (o, k) => Boolean(o) && typeof o === 'object' && Object.hasOwn(o, k);
  // Aktivity, podle kterých se doplní seznam věcí (výchozí výběr podle programu, země a podnebí)
  const ACTS = [['beach', '🏖️ Pláž a moře'], ['hike', '🥾 Turistika a příroda'], ['city', '🏙️ Města a památky'], ['snow', '⛷️ Sníh a hory v zimě']];
  const ACT_IDS = ACTS.map(a => a[0]);
  // Kategorie míst z programu (places.js), které znamenají prohlídky měst a památek
  const CITY_CATS = ['museum', 'gallery', 'church', 'castle', 'palace', 'monument', 'square', 'oldtown', 'tower', 'bridge', 'market', 'theatre', 'sight', 'ruins'];
  const BEACH_TAGS = /pláž|moře|ostrov|karibik|lagun|atol|surf|potápě|resort|jadran/i;
  const HIKE_TAGS = /hory|treky|alpy|andy|himálaj|sopky|fjordy|pyreneje|patagonie|vodopád|národní park/i;
  // hory (ne vodopády a národní parky): výchozí turistika tam vede do chladnějších výšek – rada balit na vrstvy
  const MOUNTAIN_TAGS = /hory|treky|alpy|andy|himálaj|sopky|fjordy|pyreneje|patagonie/i;
  const SNOW_TAGS = /lyže|alpy|hory|himálaj|andy/i;
  const SACRED_TAGS = /chrám|klášter|mešit/i;
  const MOSQUITO = /malári|antimalari|dengue|komár|žlut\S* zimnic|japonsk\S* encefalitid|zika|chikungunya/i;
  const MALARIA = /malári|antimalari/i;
  // povinné očkování jen při příletu / příjezdu z rizikové země (cesty z ČR se netýká)
  const COND = /při (příletu|příjezdu|tranzitu)|z rizikov|ze země s rizikem/i;

  /* ---------- pomocné ---------- */
  const isYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
  const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const nightsBetween = (a, b) => Math.max(0, Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5));
  const dmy = ymd => { const [y, m, d] = ymd.split('-').map(Number); return `${d}. ${m}. ${y}`; };
  // teplota se znaménkem minus (−5), rozsah „12–19“ / „−11 až −5“, stejné hodnoty jednou („~25“)
  const deg = n => (n < 0 ? `−${-n}` : String(n));
  const span = (a, b) => (a === b ? `~${deg(a)}` : a < 0 || b < 0 ? `${deg(a)} až ${deg(b)}` : `${a}–${b}`);
  const country = iso => (typeof byIso !== 'undefined' && byIso[iso]) || null;
  const name = iso => (country(iso) && country(iso).cs) || iso;
  const flagOf = iso => (typeof flag === 'function' ? flag(iso) + ' ' : '');
  const names = list => list.map(name).join(', ');
  // platné kódy bez Česka, území USA jako USA, bez duplicit
  const uniq = list => [...new Set((Array.isArray(list) ? list : []).filter(x => typeof x === 'string' && /^[A-Z]{2}$/.test(x)).map(canon))].filter(x => x !== 'CZ');
  const entry = iso => (window.Entry && Entry.ready() ? Entry.get(iso) : null);
  const link = (u, txt) => (safeUrl(u) === '#' ? '' : `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(txt)}</a>`);
  const src = () => (DATA && DATA.sources) || {};
  // „2026-10“ → „10/2026“
  const checkedTxt = () => { const m = /^(\d{4})-(\d{2})$/.exec((DATA && DATA.checked) || ''); return m ? `${+m[2]}/${m[1]}` : ''; };
  let curNames = null;
  /** „JPY“ → „japonský jen“ (Intl, česky); bez podpory jen kód. */
  function curName(code) {
    try { curNames = curNames || new Intl.DisplayNames(['cs'], { type: 'currency' }); return curNames.of(code) || code; } catch (e) { return code; }
  }

  /* ---------- data ---------- */
  function set(data) {
    DATA = data && data.health && data.plugs && data.driving ? data : null;
    if (DATA) refresh();
  }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (!loading) {
      failed = false;
      loading = fetch('data/pretrip.json').then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))).then(d => { set(d); return DATA; })
        .catch(e => { loading = null; failed = true; refresh(); throw e; });
    }
    return loading;
  }
  const ready = () => Boolean(DATA);
  const isEea = iso => Boolean(DATA) && DATA.eea.includes(iso);
  // EU/Schengen režim vstupu (vč. Švýcarska, Norska, Islandu, Lichtenštejnska); bez vstupních dat EHP + Švýcarsko
  const isEuRegime = iso => { const r = entry(iso); return r ? r.visa === 'eu' : isEea(iso) || iso === 'CH'; };

  /* ---------- odškrtnuté položky (localStorage, každá cesta zvlášť) ---------- */
  /** Klíč cesty: vznik cesty v prohlížeči, datum cesty tam a cíl (sdílená cesta po importu dostane vlastní). */
  function tripKey(t) {
    const out = t && t.overland && t.overland.on && t.overland.out ? t.overland.out : t && t.flight && t.flight.out;
    return [t && Number.isFinite(t.created) ? t.created : 0, out && isYmd(out.date) ? out.date : '', (t && t.dest && (t.dest.cc || t.dest.label)) || '']
      .join(':').replace(/[^\w:.-]/g, '').slice(0, 80);
  }
  function store() {
    try { const s = JSON.parse(localStorage.getItem(LS)); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; } catch (e) { return {}; }
  }
  function doneOf(key) {
    const x = store()[key];
    return x && x.d && typeof x.d === 'object' ? x.d : {};
  }
  /** Změní odškrtnutí u cesty (ids: { 'pack:doc-pass': true|false }) a uloží jen posledních KEEP cest. */
  function writeDone(key, ids) {
    const s = store();
    const x = s[key] && s[key].d && typeof s[key].d === 'object' ? s[key] : { d: {} };
    for (const [id, on] of Object.entries(ids)) { if (on) x.d[id] = 1; else delete x.d[id]; }
    x.at = Date.now();
    s[key] = x;
    // jen posledních KEEP cest
    const keys = Object.keys(s).filter(k => s[k] && typeof s[k] === 'object').sort((a, b) => (s[b].at || 0) - (s[a].at || 0));
    for (const k of keys.slice(KEEP)) delete s[k];
    try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) { /* plné nebo zakázané úložiště – odškrtnutí jen do obnovení stránky */ }
  }
  const setDone = (key, id, on) => writeDone(key, { [id]: on });

  /* ---------- sdílený odkaz (#trip=) ---------- */
  /** Id odškrtnutí ve známém tvaru, bez duplicit, nejvýš DONE_MAX (vlastní položky jen ty, které cesta má). */
  function cleanDone(list, custom) {
    const own = new Set(custom.map(x => `pack:${x.id}`));
    return [...new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string' && DONE_ID.test(id) && (!id.startsWith('pack:my-') || own.has(id))))].slice(0, DONE_MAX);
  }
  /** { acts?, custom?, done? } jen s neprázdnými částmi (zvolené „žádné aktivity“ = acts: [] zůstane); undefined, když nic. */
  function shared(acts, custom, done) {
    const o = { ...(acts ? { acts } : {}), ...(custom.length ? { custom } : {}), ...(done.length ? { done } : {}) };
    return Object.keys(o).length ? o : undefined;
  }
  /** Stav karty do sdíleného odkazu: zvolené aktivity, vlastní položky a odškrtnutí této cesty z localStorage. */
  function shareState(t) {
    const custom = customOf(t);
    return shared(actsOf(t), custom, cleanDone(Object.keys(doneOf(tripKey(t))), custom));
  }
  /** t.pretrip ze sdíleného odkazu (cizí vstup): jen známé aktivity, pročištěné vlastní položky a odškrtnutí; jinak undefined. */
  function sanitize(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return undefined;
    const custom = customOf({ pretrip: p });
    return shared(actsOf({ pretrip: p }), custom, cleanDone(p.done, custom));
  }
  /**
   * Sdílená cesta po importu (už s vlastním t.created): odškrtnutí z odkazu (t.pretrip.done) uloží k ní do localStorage
   * – jen pod jejím klíčem, odškrtnutí jiných cest zůstanou – a z cesty je odebere. Vrací počet převzatých položek.
   */
  function adopt(t) {
    const p = t && t.pretrip;
    if (!p || typeof p !== 'object' || !('done' in p)) return 0;
    const done = cleanDone(p.done, customOf(t));
    delete p.done;
    if (done.length) writeDone(tripKey(t), Object.fromEntries(done.map(id => [id, true])));
    return done.length;
  }

  /* ---------- podnebí ---------- */
  const climates = new Map(); // klíč místa → { data: { hi, lo, p } | null, done }
  const placeKey = p => (Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && p.lat != null && p.lon != null ? `${(+p.lat).toFixed(1)},${(+p.lon).toFixed(1)}` : p.iata ? `iata:${p.iata}` : null);
  const okSeries = a => Array.isArray(a) && a.length === 12 && a.every(x => typeof x === 'number' && Number.isFinite(x));
  /** Místa cesty pro podnebí: místa trasy, cíl (vlakem město příjezdu), jinak letiště příletu. */
  function placesOf(t, multi, ov) {
    if (multi) return t.route.bases.map(b => ({ name: b.name, lat: b.lat, lon: b.lon })).filter(placeKey);
    if (ov && t.overland.to) return [{ name: t.overland.to.label, lat: t.overland.to.lat, lon: t.overland.to.lon }].filter(placeKey);
    const d = t.dest || {}, c = t.cityCenter;
    const p = c && c.lat != null ? { name: d.label || c.label, lat: c.lat, lon: c.lon } : { name: d.label, lat: d.lat, lon: d.lon, iata: t.flight && t.flight.out && /^[A-Z]{3}$/.test(t.flight.out.to || '') ? t.flight.out.to : null };
    return placeKey(p) ? [{ ...p, name: String(p.name || '').replace(/ \(.*\)$/, '') }] : [];
  }
  function fetchClimate(p) {
    const k = placeKey(p);
    if (!k || climates.has(k) || typeof fetch !== 'function') return;
    const hit = { data: null, done: false };
    climates.set(k, hit);
    const url = k.startsWith('iata:') ? `api/climate?iata=${encodeURIComponent(p.iata)}` : `api/climate?lat=${(+p.lat).toFixed(3)}&lon=${(+p.lon).toFixed(3)}`;
    fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => {
      hit.data = j && okSeries(j.hi) && okSeries(j.lo) && okSeries(j.p) ? { hi: j.hi, lo: j.lo, p: j.p } : null;
      hit.done = true;
      scheduleRefresh();
    });
  }
  /** Měsíce cesty (0–11) od odjezdu do návratu. */
  function monthsOf(start, end) {
    if (!isYmd(start)) return [];
    const last = isYmd(end) && end >= start ? end : start, out = new Set();
    for (let d = start, i = 0; d <= last && i < 400; d = addDays(d, 1), i++) out.add(+d.slice(5, 7) - 1);
    return [...out];
  }
  /**
   * Souhrn podnebí míst v měsících cesty: { places: [{ name, hi, minHi, lo, p }], hi, minHi, lo, p } | null.
   * hi = nejteplejší průměrné denní maximum, minHi = nejchladnější maximum, lo = nejnižší minimum, p = nejvíc srážek (mm/měsíc).
   */
  function summarize(list, months) {
    const rows = (Array.isArray(list) ? list : []).filter(x => x && okSeries(x.hi) && okSeries(x.lo) && okSeries(x.p));
    if (!rows.length || !months.length) return null;
    const pick = a => months.map(m => a[m]);
    const places = rows.map(x => ({ name: String(x.name || ''), hi: Math.max(...pick(x.hi)), minHi: Math.min(...pick(x.hi)), lo: Math.min(...pick(x.lo)), maxLo: Math.max(...pick(x.lo)), p: Math.max(...pick(x.p)) }));
    return {
      places, hi: Math.max(...places.map(x => x.hi)), minHi: Math.min(...places.map(x => x.minHi)),
      lo: Math.min(...places.map(x => x.lo)), maxLo: Math.max(...places.map(x => x.maxLo)), p: Math.max(...places.map(x => x.p)),
    };
  }

  /* ---------- kontext cesty ---------- */
  /**
   * Co pravidla potřebují vědět o cestě z průvodce: země (isos), přestupy (via), termín, noci, auto na místě, doprava
   * (let / vlak-bus), zavazadla, kategorie programu, štítky zemí, podnebí, aktivity.
   * o = { isos, via, ret, climate } – přebije odvozené hodnoty (shrnutí je zná; testy dodají podnebí rovnou:
   * climate = [{ name, hi: [12], lo: [12], p: [12] }]).
   */
  function contextOf(t, o = {}) {
    const T = window.Trip;
    const ov = Boolean(t.overland && t.overland.on && t.overland.out);
    const out = ov ? t.overland.out : t.flight && t.flight.out;
    const back = ov ? t.overland.back : t.flight && t.flight.back;
    const start = out && isYmd(out.date) ? out.date : null;
    let end = isYmd(o.ret) ? o.ret : back && isYmd(back.date) ? back.date : null;
    if (!end && T && T.stayDates) { try { end = T.stayDates(t).checkout; } catch (e) { /* bez termínu */ } }
    if (!end && start) end = addDays(start, t.nightsOneWay || 3);
    const multi = Boolean(t.route && t.route.mode === 'multi' && Array.isArray(t.route.bases) && t.route.bases.length >= 2);
    let isos = o.isos;
    if (!isos) { try { isos = T && T.tripCountries ? T.tripCountries(t) : null; } catch (e) { isos = null; } }
    isos = uniq(isos || [t.dest && t.dest.cc]);
    const via = uniq(o.via).filter(x => !isos.includes(x));
    // auto na místě: vybrané auto, nebo trasa autem přes víc míst, dokud ho cestovatel výslovně neodmítl
    const carMode = t.car && t.car.mode;
    const car = carMode ? carMode !== 'skip' : multi && t.route.transport === 'car';
    const cats = new Set();
    for (const p of multi ? t.route.bases.map(b => b.plan) : [t.plan]) {
      for (const d of (p && Array.isArray(p.days) ? p.days : [])) {
        for (const x of (d && Array.isArray(d.items) ? d.items : [])) if (x && typeof x.category === 'string') cats.add(x.category);
      }
    }
    const tags = isos.flatMap(i => (country(i) && Array.isArray(country(i).tags) ? country(i).tags : [])).join(' ');
    const months = monthsOf(start, end);
    let climate = null, pending = false;
    if (o.climate !== undefined) climate = summarize(o.climate, months);
    else {
      const places = placesOf(t, multi, ov);
      places.forEach(fetchClimate);
      const got = places.map(p => ({ p, hit: climates.get(placeKey(p)) }));
      pending = typeof fetch === 'function' && got.some(x => !x.hit || !x.hit.done);
      climate = summarize(got.filter(x => x.hit && x.hit.data).map(x => ({ name: x.p.name, ...x.hit.data })), months);
    }
    const ctx = {
      isos, via, start, end, nights: start && end ? nightsBetween(start, end) : t.nightsOneWay || 3, car,
      mode: ov ? 'ground' : 'flight', bags: ov ? null : ['none', 'cabin', 'checked'].includes(t.bags) ? t.bags : 'none',
      cats, tags, climate, pending, custom: customOf(t),
    };
    const chosen = actsOf(t);
    ctx.acts = new Set(chosen || defaultActs(ctx));
    ctx.actsChosen = Boolean(chosen);
    return ctx;
  }
  /** Aktivity zvolené u cesty (t.pretrip.acts – i ze sdíleného odkazu, proto jen známé hodnoty); null = výchozí. */
  function actsOf(t) {
    const a = t && t.pretrip && Array.isArray(t.pretrip.acts) ? t.pretrip.acts : null;
    return a ? ACT_IDS.filter(id => a.includes(id)) : null;
  }
  /**
   * Text vlastní položky: bez znaků pro HTML (<>"`), řídicích znaků a obracení směru textu, apostrof typografický
   * (obyčejný by sdílený odkaz vypustil), mezery sloučené, nejvýš OWN_LEN znaků (i bez rozpůleného emoji).
   */
  const ownText = v => (typeof v === 'string' ? v.replace(/'/g, '’').replace(/[<>"`\u202a-\u202e\u2066-\u2069]/g, '').replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, OWN_LEN).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, m => (m.length === 2 ? m : '')).trim() : '');
  /** Vlastní položky seznamu věcí (t.pretrip.custom – i ze sdíleného odkazu, proto znovu pročištěné): [{ id: 'my-3', text }]. */
  function customOf(t) {
    const out = [];
    for (const x of t && t.pretrip && Array.isArray(t.pretrip.custom) ? t.pretrip.custom : []) {
      const id = x && typeof x.id === 'string' && /^my-\d{1,3}$/.test(x.id) ? x.id : '', text = x ? ownText(x.text) : '';
      if (id && text && !out.some(y => y.id === id)) out.push({ id, text });
      if (out.length >= OWN_MAX) break;
    }
    return out;
  }
  /** Výchozí aktivity: podle kategorií v programu, štítků země a podnebí v termínu. */
  function defaultActs(ctx) {
    const c = ctx.climate, cats = ctx.cats, out = [];
    if (cats.has('beach') || (BEACH_TAGS.test(ctx.tags) && c && c.hi >= 24)) out.push('beach');
    // hory a treky podle štítků země jen bez programu (program ve městě = výlet do hor neplánuje)
    if (cats.has('nature') || (!cats.size && HIKE_TAGS.test(ctx.tags) && !(c && c.minHi <= 3))) out.push('hike');
    if (!cats.size || CITY_CATS.some(x => cats.has(x))) out.push('city');
    if (c && c.minHi <= 3 && SNOW_TAGS.test(ctx.tags)) out.push('snow');
    return out;
  }

  /* ---------- pravidla: co zařídit ---------- */
  /** Věta o povinném pojištění z poznámky ke vstupu („nutný pas, pojištění min. 10 000 EUR.“); jinak ''. */
  function insuranceNote(r) {
    if (!r || typeof r.notes !== 'string') return '';
    // věty a části za středníkem („31. 12. 2026“ ani „min. 10 000“ větu nekončí – za tečkou nenásleduje velké písmeno)
    const parts = r.notes.replace(/\.\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/g, '.\n').split(/;\s*|\n/);
    return parts.filter(s => /pojištění|pojistit/i.test(s)).map(s => s.trim().replace(/\.$/, '')).join('; ');
  }
  /** Řidičský průkaz v zemi: { n: ok|rec|req|transl|local|?, f?: 1949|1968|any, t?, s?, conv? }. */
  function drivingOf(iso) {
    const d = DATA.driving;
    if (own(d, iso)) return d[iso];
    if (isEea(iso)) return { n: 'ok', t: 'V EU a EHP platí český řidičský průkaz, mezinárodní není potřeba.', s: src().idp };
    return { n: '?', conv: own(DATA.conv, iso) ? DATA.conv[iso] : null };
  }
  const CONV_TXT = { both: 'Ženevské (1949) i Vídeňské (1968) úmluvy', 1949: 'Ženevské úmluvy (1949)', 1968: 'Vídeňské úmluvy (1968)' };
  const FORM_TXT = { 1949: 'vzor 1949', 1968: 'vzor 1968' };
  // Doklady k zemi na webu MZV (vstupní podmínky odkazují na „Víza“, řidičský průkaz bývá v „Doklady“)
  const mzvDocs = iso => { const r = entry(iso); return r && /^https:\/\/mzv\.gov\.cz\/.+\/cestovani\/[\w-]+\.html$/.test(r.source || '') ? r.source.replace(/[\w-]+\.html$/, 'documents.html') : src().idp; };
  /**
   * Který vzor mezinárodního řidičského průkazu (MŘP) vyřídit: { forms: ['1949', '1968'], need, rec }.
   * need = země, kde je MŘP nutný (i s překladem / místním povolením), rec = doporučený.
   * „any“ (uznávají oba vzory) splní kterýkoli jiný potřebný vzor; samotné „any“ → 1968 (platí 3 roky).
   */
  function idpPlan(rows) {
    // místní povolení se vydává na základě MŘP (Srí Lanka, Grenada) → MŘP je potřeba i tam
    const need = rows.filter(r => ['req', 'transl'].includes(r.n) || (r.n === 'local' && (r.f || /MŘP/.test(r.t || ''))));
    const rec = rows.filter(r => r.n === 'rec');
    const strict = new Set([...need, ...rec].map(r => r.f).filter(f => f === '1949' || f === '1968'));
    const flex = [...need, ...rec].some(r => r.f === 'any');
    const forms = strict.size ? [...strict].sort() : flex ? ['1968'] : [];
    return { forms, need, rec };
  }
  const formsTxt = forms => (forms.length === 2 ? ' (oba vzory: 1949 i 1968)' : forms.length ? ` (${FORM_TXT[forms[0]]})` : '');
  const VERDICT = {
    ok: ['ok', 'stačí český ŘP'], rec: ['rec', 'MŘP doporučen'], req: ['must', 'nutný MŘP'], transl: ['must', 'jen s úředním překladem nebo MŘP'],
    local: ['must', 'nutné místní povolení'], '?': ['unk', 'neověřeno'],
  };
  /** Zásuvky v zemi: { types: ['A','B'], v: '120', hz: '60', fit: 'ok'|'part'|'no', low } | null. */
  function plugOf(iso) {
    const p = own(DATA.plugs, iso) ? DATA.plugs[iso] : null;
    if (!p) return null;
    const types = String(p.t).split(',').filter(Boolean);
    const fit = types.some(x => x === 'E' || x === 'F') ? 'ok' : types.includes('C') ? 'part' : 'no';
    const low = p.v ? String(p.v).split('/').some(v => +v < 200) : false;
    return { types, ...(p.m ? { main: String(p.m).split(',') } : {}), v: p.v || null, hz: p.hz, fit, low };
  }

  /**
   * Položky „Co zařídit“: [{ id, icon, level: must|rec|info, title, short, lines: [html], links: [[url, text]] }].
   * Pořadí: pojištění, EHIC, DROZD, řidičský průkaz, očkování, zásuvky, měna.
   */
  function todos(ctx) {
    if (!DATA) return [];
    const S = src(), out = [], dest = ctx.isos;
    if (!dest.length) return out;
    const ehicSet = new Set(DATA.health.ehic), contract = DATA.health.contract;
    const ehic = dest.filter(i => ehicSet.has(i)), ctr = dest.filter(i => own(contract, i)), third = dest.filter(i => !ehicSet.has(i) && !own(contract, i));

    // 1) cestovní pojištění – vždy
    const ins = ['Bez pojištění léčebných výloh MZV nedoporučuje vůbec vycestovat. Přečti si, co pojistka kryje a jaké má limity.'];
    if (third.length) ins.push(`<b>${esc(names(third))}</b>: mimo EU, EHP, Švýcarsko a Velkou Británii ošetření platíš sám – česká zdravotní pojišťovna proplatí jen neodkladnou péči, a to nejvýš do výše českých cen. Pojištění kryje léčení, převoz domů i asistenční službu.`);
    if (ctr.length) ins.push(`<b>${esc(names(ctr))}</b>: smluvní stát – ze zdravotního pojištění máš nárok jen na nutnou a neodkladnou péči, Kancelář zdravotního pojištění doporučuje i cestovní pojištění.`);
    if (!third.length && !ctr.length) ins.push('I v EU se vyplatí: EHIC nekryje spoluúčast, převoz do ČR ani asistenční službu.');
    for (const i of dest) { const n = insuranceNote(entry(i)); if (n) ins.push(`<b>Podmínka vstupu – ${esc(name(i))}:</b> ${esc(n)}.`); }
    const risky = ['hike', 'snow'].filter(a => ctx.acts.has(a));
    if (risky.length) ins.push(`Ověř, že pojistka kryje i ${risky.length === 2 ? 'horskou turistiku a zimní sporty' : risky[0] === 'hike' ? 'turistiku na horách' : 'zimní sporty'} – úrazy při sportu běžná pojistka krýt nemusí.`);
    out.push({ id: 'ins', icon: '🛡️', level: 'must', title: 'Sjednej cestovní pojištění léčebných výloh', short: 'cestovní pojištění', lines: ins, links: [[S.desatero, 'MZV: Desatero na cesty'], [S.kzpInsurance, 'KZP: cestovní pojištění vs. EHIC']] });

    // 2) EHIC a smluvní státy
    if (ehic.length || ctr.length) {
      const lines = [];
      if (ehic.length) {
        lines.push(`Platí v zemích: <b>${esc(names(ehic))}</b> – nárok na lékařsky nezbytnou péči za stejných podmínek jako místní, u lékařů a nemocnic napojených na veřejný systém (se stejnou spoluúčastí). Převoz domů nekryje, cestovní pojištění nenahrazuje.`);
        lines.push('U VZP je EHIC přímo modrý průkaz pojištěnce – zkontroluj jeho platnost; když chybí, pojišťovna vystaví náhradní Potvrzení.');
      }
      for (const i of ctr) lines.push(`<b>${esc(name(i))}:</b> ${esc(contract[i])}`);
      const forms = ctr.filter(i => /CZ\/[A-Z]{2} 111/.test(contract[i]));
      const title = ehic.length || forms.length < ctr.length ? 'Vezmi Evropský průkaz zdravotního pojištění (EHIC)' : `Vyžádej si u pojišťovny formulář pro ${names(forms)}`;
      out.push({ id: 'ehic', icon: '💳', level: 'must', title, short: ehic.length || forms.length < ctr.length ? 'zkontrolovat EHIC' : 'formulář od zdravotní pojišťovny', lines, links: [[S.kzpTourist, 'KZP: na co mám nárok'], [S.vzpEhic, 'VZP: EHIC'], [S.kzpCountries, 'KZP: podmínky v jednotlivých státech']] });
    }

    // 3) DROZD – mimo EU/Schengen nebo do rizikovějších zemí (bezpečnost ≤ 3 z data/countries.json)
    const safety = i => (country(i) && Number.isFinite(country(i).safety) ? country(i).safety : 5);
    const unsafe = dest.filter(i => safety(i) <= 2), drozd = dest.filter(i => !isEuRegime(i) || safety(i) <= 3);
    if (drozd.length) {
      const lines = [];
      if (unsafe.length) lines.push(`⚠️ MZV k zemi <b>${esc(names(unsafe))}</b> vydává varování nebo doporučuje zvýšenou opatrnost – před cestou si přečti aktuální upozornění a zvaž, zda jet.`);
      lines.push('Dobrovolná registrace u ministerstva zahraničí: při mimořádné události (přírodní katastrofa, nepokoje) ti pošle varování e-mailem či SMS a konzulát tě snáz najde. Údaje se smažou 30 dní po návratu; registrovat se dá i v aplikaci Portál občana.');
      lines.push(`Itinerář nech i blízké osobě v ČR. Nouzová linka MZV (nonstop): <b>${esc((DATA.phones && DATA.phones.emergency) || '')}</b>.`);
      out.push({ id: 'drozd', icon: '📝', level: unsafe.length ? 'must' : 'rec', title: 'Zaregistruj cestu v systému DROZD', short: 'registrace v DROZD', lines, links: [[S.drozd, 'Registrace DROZD (MZV)'], [S.drozdInfo, 'MZV: co je DROZD'], ...(unsafe.length ? [[S.warnings, 'MZV: upozornění na cesty']] : [])] });
    }

    // 4) řidičský průkaz – jen s autem na místě
    if (ctx.car) {
      const rows = dest.map(i => ({ iso: i, ...drivingOf(i) }));
      const plan = idpPlan(rows), unknown = rows.filter(r => r.n === '?');
      const lines = rows.map(r => {
        const [cls, label] = VERDICT[r.n] || VERDICT['?'];
        const f = r.f === '1949' || r.f === '1968' ? ` (${FORM_TXT[r.f]})` : r.f === 'any' && r.n !== 'ok' ? ' (kterýkoli vzor)' : '';
        const note = r.n === '?'
          ? `Podmínky si ověř na webu MZV (záložka Doklady). ${r.conv ? `Země je smluvní stranou ${CONV_TXT[r.conv]} o silničním provozu – mezinárodní řidičský průkaz podle ní by měla uznávat.` : 'Země není smluvní stranou úmluv o silničním provozu – mezinárodní průkaz tam platit nemusí, ověř u zastupitelského úřadu.'}`
          : r.t || '';
        return `${flagOf(r.iso)}<b>${esc(name(r.iso))}</b> <span class="pt-v pt-v-${cls}">${esc(label + (cls === 'must' || cls === 'rec' ? f : ''))}</span> ${esc(note)} ${link(r.s || mzvDocs(r.iso), 'zdroj ↗')}`;
      });
      const local = rows.filter(r => r.n === 'local');
      const idp = plan.need.length || plan.rec.length || unknown.length;
      if (idp) lines.push(`MŘP vydá obecní úřad obce s rozšířenou působností na počkání za 200 Kč – vezmi řidičák, doklad totožnosti a fotku 3,5 × 4,5 cm. Vzor 1949 platí 1 rok, vzor 1968 3 roky (nejdéle do konce platnosti řidičáku)${plan.forms.length === 2 ? '; na oba vzory dostaneš dva průkazy (2 fotky)' : ''}.`);
      const title = plan.need.length ? `Vyřiď mezinárodní řidičský průkaz${formsTxt(plan.forms)}`
        : local.length ? `Řízení v zemi ${names(local.map(r => r.iso))}: český ani mezinárodní průkaz nestačí`
          : plan.rec.length ? `Zvaž mezinárodní řidičský průkaz${formsTxt(plan.forms)}`
            : unknown.length ? 'Ověř, jestli ti stačí český řidičský průkaz' : 'Řidičský průkaz: stačí český';
      out.push({ id: 'drive', icon: '🚗', level: plan.need.length || local.length ? 'must' : plan.rec.length || unknown.length ? 'rec' : 'info', title, short: plan.need.length ? `mezinárodní řidičský průkaz${formsTxt(plan.forms)}` : 'řidičský průkaz', lines, links: [[S.idp, 'Portál veřejné správy: vydání MŘP']], forms: plan.forms, need: plan.need.length > 0 });
    }

    // 5) očkování a antimalarika (data vstupních podmínek)
    const vac = dest.map(i => ({ i, r: entry(i) })).filter(x => x.r && (x.r.vaccinesRequired || x.r.vaccinesRecommended));
    if (vac.length) {
      const strict = vac.some(x => x.r.vaccinesRequired && !COND.test(x.r.vaccinesRequired));
      out.push({
        id: 'vacc', icon: '💉', level: strict ? 'must' : 'rec', title: 'Očkování: poraď se s lékařem nebo v očkovacím centru', short: 'očkování (konzultace)',
        lines: vac.map(x => `<b>${esc(name(x.i))}:</b> ${x.r.vaccinesRequired ? `povinné – ${esc(x.r.vaccinesRequired)}${x.r.vaccinesRecommended ? '; ' : ''}` : ''}${x.r.vaccinesRecommended ? `doporučené – ${esc(x.r.vaccinesRecommended)}` : ''}`),
        links: [],
      });
    }

    // 6) zásuvky a napětí
    const plugs = dest.map(i => ({ i, p: plugOf(i) }));
    if (plugs.some(x => x.p)) {
      const bad = plugs.filter(x => x.p && x.p.fit !== 'ok');
      const FIT = { ok: 'české zástrčky pasují', part: 'pasují jen ploché dvoukolíkové zástrčky (europlug), na ostatní adaptér', no: 'potřebuješ adaptér' };
      const lines = plugs.map(({ i, p }) => (p
        ? `${flagOf(i)}<b>${esc(name(i))}</b>: zásuvky typ ${esc(p.types.join(', '))}${p.v ? ` · ${esc(p.v)} V` : ''} / ${esc(p.hz)} Hz – <span class="pt-v pt-v-${p.fit === 'ok' ? 'ok' : p.fit === 'part' ? 'rec' : 'must'}">${esc(FIT[p.fit])}</span>${p.low ? ` · nižší napětí: spotřebiče se štítkem 100–240 V (nabíječky telefonů a notebooků) fungují, fén, kulmu nebo konvici ber jen dvounapěťové` : ''}${p.v ? '' : ' · napětí ověř'}`
        : `${flagOf(i)}<b>${esc(name(i))}</b>: údaje o zásuvkách nemám – ověř před cestou`));
      out.push({ id: 'plug', icon: '🔌', level: bad.length ? 'rec' : 'info', title: bad.length ? 'Kup cestovní adaptér do zásuvky' : 'Zásuvky: české zástrčky pasují', short: 'cestovní adaptér', lines, links: [[S.plugs, 'Přehled zásuvek a napětí']] });
    }

    // 7) měna a peníze
    const curs = [...new Set(dest.map(i => country(i) && country(i).cur).filter(c => typeof c === 'string' && /^[A-Z]{3}$/.test(c) && c !== 'CZK'))];
    if (curs.length) {
      out.push({
        id: 'money', icon: '💶', level: 'info', title: `Měna: ${curs.map(c => `${curName(c)} (${c})`).join(', ')}`, short: 'peníze',
        lines: ['Peníze a karty si rozděl na víc míst a měj záložní kartu zvlášť; trochu hotovosti v místní měně se hodí hned po příjezdu.'], links: [],
      });
    }
    return out;
  }

  /* ---------- pravidla: co sbalit ---------- */
  /** Seznam věcí po skupinách: [{ id, icon, title, items: [{ id, text, note? }] }]. */
  function pack(ctx) {
    const groups = [];
    const group = (id, icon, title) => { const g = { id, icon, title, items: [] }; groups.push(g); return g; };
    const has = (g, id) => g.items.some(x => x.id === id);
    const add = (g, id, text, note) => { if (!has(g, id)) g.items.push(note ? { id, text, note } : { id, text }); };
    const dest = ctx.isos, all = [...dest, ...ctx.via], c = ctx.climate, acts = ctx.acts, flight = ctx.mode === 'flight';
    const rows = dest.map(i => ({ i, r: entry(i) })).filter(x => x.r);
    // komáři a malárie podle doporučených očkování (povinná žlutá zimnice „při příletu z rizikové země“ se cesty z ČR netýká)
    const texts = rows.map(x => x.r.vaccinesRecommended || '').join(' ');

    // doklady a peníze
    const docs = group('docs', '🛂', 'Doklady a peníze');
    if (window.Entry && Entry.ready() && all.some(i => entry(i))) {
      const pass = all.some(i => entry(i) && !entry(i).idCard);
      let until = null;
      try { for (const x of Entry.checklist(dest, { ret: ctx.end })) if (x.until && (!until || x.until > until)) until = x.until; } catch (e) { /* bez lhůty */ }
      if (pass) add(docs, 'doc-pass', 'Cestovní pas', until ? `platný aspoň do ${dmy(until)}` : 'občanský průkaz nestačí');
      else add(docs, 'doc-op', 'Občanský průkaz (nebo pas)', until ? `platný aspoň do ${dmy(until)}` : '');
      for (const i of all) {
        const r = entry(i), k = r && Entry.kind(r);
        if (!k || !k.need || (ctx.via.includes(i) && r.transitEta !== true)) continue;
        if (r.visa === 'voa') add(docs, `doc-voa-${i}`, `Na vízum při příletu (${name(i)}): poplatek a doklady podle podmínek vstupu`);
        else add(docs, `doc-reg-${i}`, `Potvrzení: ${Entry.regName(r)} (${name(i)})`, 'vytištěné i v mobilu');
      }
    } else add(docs, 'doc-id', 'Cestovní pas nebo občanský průkaz', 'co platí, ukáže blok 🛂 Před cestou');
    add(docs, 'doc-copy', 'Kopie dokladů', 'papírově i v mobilu, odděleně od originálů');
    add(docs, 'doc-ins', 'Doklad o cestovním pojištění', 'a telefon na asistenční službu');
    if (DATA) {
      if (dest.some(i => DATA.health.ehic.includes(i) || ['RS', 'ME', 'MK'].includes(i))) add(docs, 'doc-ehic', 'Evropský průkaz zdravotního pojištění (EHIC)');
      for (const i of dest) { const m = own(DATA.health.contract, i) && /CZ\/[A-Z]{2} 111/.exec(DATA.health.contract[i]); if (m) add(docs, `doc-form-${i}`, `Formulář ${m[0]} od zdravotní pojišťovny (${name(i)})`); }
    }
    // očkovací průkaz: žlutá zimnice doporučená (země s rizikem), nebo povinná bez podmínky příletu z rizikové země
    const yf = /žlut\S* zimnic/i;
    if (rows.some(x => yf.test(x.r.vaccinesRecommended || ''))) add(docs, 'doc-vacc', 'Mezinárodní očkovací průkaz', 'když se necháš očkovat proti žluté zimnici');
    else if (rows.some(x => yf.test(x.r.vaccinesRequired || '') && !COND.test(x.r.vaccinesRequired))) add(docs, 'doc-vacc', 'Mezinárodní očkovací průkaz', 'očkování proti žluté zimnici je podmínkou vstupu');
    if (ctx.car) {
      add(docs, 'doc-dl', 'Řidičský průkaz');
      const drive = DATA ? idpPlan(dest.map(i => ({ iso: i, ...drivingOf(i) }))) : null;
      if (drive && (drive.need.length || drive.rec.length)) add(docs, 'doc-idp', `Mezinárodní řidičský průkaz${formsTxt(drive.forms)}`, drive.need.length ? '' : 'doporučený');
      add(docs, 'doc-card-car', 'Platební karta na jméno řidiče', 'kauce v půjčovně – ověř její podmínky');
    }
    add(docs, 'doc-tickets', flight ? 'Letenky a palubní vstupenky' : 'Jízdenky na vlak / autobus', 'v mobilu nebo vytištěné');
    add(docs, 'doc-stay', 'Potvrzení rezervací (ubytování, auto)');
    add(docs, 'doc-card', 'Platební karta a záložní karta');
    const curs = [...new Set(dest.map(i => country(i) && country(i).cur).filter(x => typeof x === 'string' && /^[A-Z]{3}$/.test(x) && x !== 'CZK'))];
    if (curs.length) add(docs, 'doc-cash', `Trochu hotovosti: ${curs.map(curName).join(', ')}`);

    // zdraví
    const health = group('health', '💊', 'Zdraví a hygiena');
    add(health, 'hl-meds', 'Léky, které užíváš', 'i se zásobou na pár dní navíc');
    add(health, 'hl-kit', 'Lékárnička', 'náplasti, dezinfekce, léky na bolest, horečku a průjem');
    add(health, 'hl-toil', 'Hygienické potřeby', flight && ctx.bags !== 'checked' ? 'tekutiny do příručního zavazadla jen v balení do 100 ml' : '');
    if ((c && c.hi >= 22) || acts.has('beach') || acts.has('snow')) add(health, 'hl-sun', 'Opalovací krém s vysokým faktorem');
    // komáři: jen kde o nich mluví zdravotní doporučení a v termínu není zima
    if (MOSQUITO.test(texts) && (!c || c.hi >= 18)) add(health, 'hl-rep', 'Repelent proti komárům');
    if (MALARIA.test(texts)) add(health, 'hl-mal', 'Antimalarika', 'jen po poradě s lékařem');

    // oblečení podle podnebí
    const clo = group('clothes', '👕', 'Oblečení');
    const days = Math.max(1, ctx.nights + 1);
    add(clo, 'cl-under', `Spodní prádlo a ponožky (${Math.min(days, 7)}×)`, days > 7 ? 'na delší cestu počítej s praním' : '');
    add(clo, 'cl-sleep', 'Oblečení na spaní');
    if (c) {
      if (c.hi >= 27) add(clo, 'cl-light', 'Lehké vzdušné oblečení (trička, kraťasy)', `přes den až ~${deg(c.hi)} °C`);
      else if (c.hi >= 20) add(clo, 'cl-tee', 'Trička a lehké kalhoty nebo kraťasy', `přes den ${span(c.minHi, c.hi)} °C`);
      else add(clo, 'cl-long', c.hi <= 8 ? 'Teplé dlouhé kalhoty a vrstvy s dlouhým rukávem' : 'Dlouhé kalhoty a tričko s dlouhým rukávem', `přes den ${span(c.minHi, c.hi)} °C`);
      const cold = c.lo <= 3 || c.minHi <= 8;
      if (cold) add(clo, 'cl-warm', 'Teplá zimní bunda', `ráno kolem ${deg(c.lo)} °C`);
      else if (c.minHi <= 14 || c.lo <= 8) add(clo, 'cl-jacket', 'Přechodová bunda', `ráno a večer kolem ${deg(c.lo)} °C`);
      if (c.lo <= 15 && !cold) add(clo, 'cl-layer', 'Mikina nebo svetr', `na večer, kolem ${deg(c.lo)} °C`);
      if (cold) add(clo, 'cl-sweater', 'Teplý svetr nebo fleece');
      if (c.lo <= 0 || c.minHi <= 5) add(clo, 'cl-hat', 'Čepice, rukavice a šála');
      if (c.minHi <= 0) { add(clo, 'cl-thermo', 'Termoprádlo a teplé ponožky'); add(clo, 'cl-boots', 'Zimní boty s pevnou podrážkou', c.p >= 60 ? 'nepromokavé – srážky padají jako sníh' : ''); }
      if (c.hi >= 24) { add(clo, 'cl-cap', 'Kšiltovka nebo klobouk proti slunci'); add(clo, 'cl-sunglass', 'Sluneční brýle'); }
      // v mrazu prší sníh – deštník nepomůže (stačí nepromokavé boty a bunda výš)
      if (c.hi > 3) {
        if (c.p >= 200) add(clo, 'cl-rainjacket', 'Nepromokavá bunda nebo pončo', `období dešťů – až ~${c.p} mm srážek za měsíc`);
        else if (c.p >= 90) add(clo, 'cl-umbrella', 'Skládací deštník nebo pláštěnka', `srážky ~${c.p} mm za měsíc`);
      }
    } else add(clo, 'cl-weather', 'Oblečení podle počasí', ctx.pending ? 'podnebí v termínu cesty načítám…' : 'předpověď zkontroluj pár dní před odjezdem');
    if (acts.has('city') || acts.has('hike')) add(clo, 'cl-shoes', 'Pohodlné boty na celodenní chození');
    if (ctx.cats.has('church') || SACRED_TAGS.test(ctx.tags)) add(clo, 'cl-modest', 'Oblečení zakrývající ramena a kolena', 'do kostelů a chrámů tě jinak nemusí pustit');

    // aktivity
    if (acts.size) {
      const gear = group('acts', '🎒', 'Na výlety, pláž a hory');
      if (acts.has('beach')) {
        add(gear, 'ac-swim', 'Plavky');
        add(gear, 'ac-towel', 'Osuška na pláž');
        add(gear, 'ac-sandals', 'Žabky nebo sandály do vody');
        if (!has(clo, 'cl-sunglass')) add(gear, 'ac-sunglass', 'Sluneční brýle');
      }
      if (acts.has('hike')) {
        add(gear, 'ac-boots', 'Pevné boty do terénu');
        add(gear, 'ac-pack', 'Batoh na celodenní výlet');
        add(gear, 'ac-bottle', 'Láhev na vodu');
        if (!has(clo, 'cl-rainjacket')) add(gear, 'ac-shell', 'Nepromokavá bunda do hor');
        add(gear, 'ac-lamp', 'Čelovka');
      }
      if (acts.has('snow')) {
        if (!has(clo, 'cl-thermo')) add(gear, 'ac-thermo', 'Termoprádlo');
        if (!has(clo, 'cl-hat')) add(gear, 'ac-gloves', 'Zimní rukavice a čepice');
        add(gear, 'ac-goggles', 'Sluneční nebo lyžařské brýle');
        add(gear, 'ac-lips', 'Krém na rty s UV filtrem');
      }
      if (acts.has('city')) add(gear, 'ac-daybag', 'Malý batoh nebo taška přes rameno');
      if (!gear.items.length) groups.pop();
    }

    // elektronika
    const tech = group('tech', '🔌', 'Elektronika');
    add(tech, 'tc-charger', 'Nabíječka a kabely k telefonu');
    add(tech, 'tc-power', 'Powerbanka', flight ? 'jen v příručním zavazadle, do odbaveného kufru nesmí' : '');
    if (DATA) {
      // adaptér na každou skupinu zásuvek, kam české zástrčky nepasují (USA a Japonsko = jeden adaptér A/B)
      const need = new Map();
      for (const i of dest) {
        const p = plugOf(i);
        if (!p || p.fit === 'ok') continue;
        // hlavní typ zásuvky (m), když přehled uvádí i historické (Velká Británie: G, ne D a M)
        const types = (p.main || p.types.filter(x => x !== 'C')).join('/') || 'C';
        need.set(types, [...(need.get(types) || []), i]);
      }
      for (const [types, list] of need) add(tech, `tc-adapter-${types.replace(/\//g, '')}`, `Adaptér do zásuvky typu ${types}`, names(list));
    }

    // vlastní položky (přidané v kartě nebo ze sdíleného odkazu) – v kartě s tlačítkem smazat
    const mine = group('own', '✏️', 'Vlastní položky');
    for (const x of ctx.custom || []) mine.items.push({ id: x.id, text: x.text, own: true });

    return groups.filter(g => g.items.length);
  }

  /**
   * Má smysl balit na vrstvy? Chladno (přes den do 18 °C nebo ráno do 10 °C), velký rozdíl mezi dnem a nocí (aspoň
   * 9 °C a noci do 16 °C – Dubaj v lednu ~24 / 15 °C), sníh, nebo hory (turistika zvolená u cesty, nebo výchozí
   * v zemi s horami – ne jen kvůli vodopádům a národním parkům). Ve stálém horku (Bangkok: přes den 30–34 °C, v noci 21–27 °C) ne; bez podnebí
   * jen na hory a sníh.
   */
  function layers(ctx) {
    if (ctx.acts.has('snow') || (ctx.acts.has('hike') && (ctx.actsChosen || MOUNTAIN_TAGS.test(ctx.tags)))) return true;
    const c = ctx.climate;
    return Boolean(c) && (c.minHi <= 18 || c.lo <= 10 || c.places.some(p => p.lo <= 16 && p.hi - p.lo >= 9));
  }
  /** Tipy k zavazadlu podle dopravy a zavazadel z hledání letů (bags: none = jen pod sedadlo, cabin, checked). */
  function bagTips(ctx) {
    if (ctx.mode !== 'flight') return [];
    const tips = [];
    if (ctx.bags === 'none') tips.push(`Letíš jen s malým zavazadlem pod sedadlo – rozměry ověř u aerolinky${ctx.nights >= 5 ? `; na ${ctx.nights} nocí ${layers(ctx) ? 'bal na vrstvy a ' : ''}počítej s praním` : ''}.`);
    else if (ctx.bags === 'cabin') tips.push('Kabinový kufr: rozměry a váhu ověř u aerolinky.');
    else tips.push('Kufr k odbavení: powerbanku a náhradní baterie dej do příručního zavazadla.');
    if (ctx.bags !== 'checked') tips.push('Tekutiny v příručním zavazadle: balení do 100 ml v průhledném uzavíratelném sáčku do 1 l (některá letiště s novými skenery povolují víc – ověř u letiště).');
    return tips;
  }

  /* ---------- připomínky do kalendáře ---------- */
  /**
   * Celodenní připomínky před odjezdem (formát Ics): pojištění (14 dní předem), MŘP (21 dní, jen když je nutný),
   * DROZD (3 dny, jen když se doporučuje). Připomínka v minulosti → dnes; v den odjezdu a později žádná.
   * o = { isos, via, ret, today, climate } jako u contextOf.
   */
  function reminders(t, o = {}) {
    if (!DATA || !t) return [];
    const ctx = contextOf(t, o), depart = ctx.start, today = isYmd(o.today) ? o.today : null;
    if (!depart || !ctx.isos.length) return [];
    const list = todos(ctx), byId = id => list.find(x => x.id === id);
    const where = names(ctx.isos);
    const ev = [];
    const push = (id, days, title, url, lines) => {
      let date = addDays(depart, -days);
      if (today && date < today) { if (today >= depart) return; date = today; }
      ev.push({ title, start: date, uid: `atlas-pretrip-${id}-${depart}`, url: safeUrl(url) === '#' ? undefined : safeUrl(url), description: [...lines, `Odjezd: ${dmy(depart)}. Stav informací ${checkedTxt()} – před cestou ověř.`].join('\n') });
    };
    push('ins', 14, `🛡️ Sjednat cestovní pojištění (${where})`, src().desatero, ['Pojištění léčebných výloh včetně převozu domů a asistenční služby – MZV bez něj nedoporučuje vycestovat.', byId('ehic') ? 'Vezmi i Evropský průkaz zdravotního pojištění (EHIC), případně formulář od zdravotní pojišťovny.' : '']);
    const drive = byId('drive');
    if (drive && drive.need) push('idp', 21, `🚘 Vyřídit mezinárodní řidičský průkaz${formsTxt(drive.forms)}`, src().idp, ['Obecní úřad obce s rozšířenou působností, na počkání, 200 Kč; s sebou řidičák, doklad totožnosti a fotku 3,5 × 4,5 cm.']);
    if (byId('drozd')) push('drozd', 3, `📝 Registrace v systému DROZD (${where})`, src().drozd, ['Dobrovolná registrace cesty u MZV – varování e-mailem či SMS a snazší pomoc při mimořádné události.', `Nouzová linka MZV: ${(DATA.phones && DATA.phones.emergency) || ''}`]);
    return ev.map(e => ({ ...e, description: e.description.split('\n').filter(Boolean).join('\n') }));
  }

  /* ---------- plánovač ---------- */
  /** Seznam „Sbaleno“ pro plánovač (a sdílený plán #plan=): úkoly a věci s odškrtnutím z této cesty; max 80 × 120 znaků. */
  function plannerChecklist(t, o = {}) {
    if (!DATA || !t) return null;
    const ctx = contextOf(t, o), done = doneOf(tripKey(t));
    const items = [
      ...todos(ctx).filter(x => x.level !== 'info').map(x => ({ t: `Zařídit: ${x.short}`, done: Boolean(done[`todo:${x.id}`]) })),
      ...pack(ctx).flatMap(g => g.items.map(x => ({ t: x.note ? `${x.text} (${x.note})` : x.text, done: Boolean(done[`pack:${x.id}`]) }))),
    ];
    return items.slice(0, 80).map(x => ({ t: x.t.replace(/["<>`]/g, '').slice(0, 120), done: x.done }));
  }

  /* ---------- vykreslení ---------- */
  const LEVEL = { must: ['důležité', 'must'], rec: ['doporučeno', 'rec'], info: ['', 'info'] };
  function subtitle(ctx) {
    const bits = [names(ctx.isos)];
    // dny na cestě od odjezdu do návratu (balí se i na den cesty tam a zpět)
    const days = ctx.nights + 1;
    if (ctx.start && ctx.end) bits.push(`${dmy(ctx.start).replace(/ \d{4}$/, '')} – ${dmy(ctx.end)}`, days === 1 ? '1 den' : days <= 4 ? `${days} dny` : `${days} dní`);
    bits.push(ctx.mode === 'ground' ? 'vlakem / busem' : ctx.bags === 'none' ? 'let jen s malým zavazadlem' : ctx.bags === 'cabin' ? 'let s kabinovým kufrem' : 'let s kufrem k odbavení');
    if (ctx.car) bits.push('auto na místě');
    return bits.filter(Boolean).join(' · ');
  }
  function climateHtml(ctx) {
    const c = ctx.climate;
    if (!c) return ctx.pending ? '<div class="pt-clim faint">🌡️ Načítám podnebí v termínu cesty…</div>' : '';
    const rows = c.places.map(p => `<b>${esc(p.name)}</b>: přes den ${span(p.minHi, p.hi)} °C, v noci ${span(p.lo, p.maxLo)} °C, srážky do ~${p.p} mm za měsíc`);
    return `<div class="pt-clim">🌡️ ${rows.join('<br>')} <span class="faint">(dlouhodobý průměr pro měsíce cesty z meteostanic, jinde z NASA POWER – ne předpověď)</span></div>`;
  }
  function chk(kind, id, done) {
    return `<input type="checkbox" data-ptk="${esc(`${kind}:${id}`)}" ${done[`${kind}:${id}`] ? 'checked' : ''}>`;
  }
  /**
   * Karta „🧭 Co zařídit a co sbalit“ do shrnutí průvodce (pod „🛂 Před cestou“). o = { isos, via, ret } (jako u contextOf).
   * Když data ještě nejsou, vrátí zástupnou kartu a po načtení (dat i podnebí) se překreslí sama.
   */
  function html(t, o = {}) {
    if (!t) return '';
    last = { t, o };
    const key = tripKey(t);
    const head = '<h3>🧭 Co zařídit a co sbalit</h3>';
    if (!DATA) {
      // po chybě už znovu nezkoušet (překreslení po chybě by jinak načítalo dokola) – pomůže obnovení stránky
      if (!failed && typeof fetch === 'function') load().catch(() => { });
      return `<div class="card step-card pt-card" id="preTrip" data-ptkey="${esc(key)}">${head}${failed
        ? '<div class="note warn" style="margin-top:8px">⚠️ <div>Seznam se nepodařilo načíst – zkus to znovu za chvíli (obnov stránku).</div></div>'
        : '<div class="loading-row"><span class="spin dark"></span> Připravuji seznam…</div>'}</div>`;
    }
    const ctx = contextOf(t, o);
    if (!ctx.isos.length) return '';
    const done = doneOf(key), list = todos(ctx), groups = pack(ctx);
    const todoHtml = list.map(x => {
      const [lbl, cls] = LEVEL[x.level] || LEVEL.info;
      const box = x.level === 'info' ? '<span class="pt-dot" aria-hidden="true">ℹ️</span>' : chk('todo', x.id, done);
      const links = x.links.filter(l => l && safeUrl(l[0]) !== '#').map(l => link(l[0], `${l[1]} ↗`)).join(' · ');
      return `<li class="pt-item lv-${cls}${done[`todo:${x.id}`] ? ' done' : ''}"><label class="pt-row">${box}<span class="pt-t">${esc(x.icon)} <b>${esc(x.title)}</b>${lbl ? ` <span class="pt-lv">${lbl}</span>` : ''}</span></label>
        <div class="pt-body">${x.lines.filter(Boolean).map(l => `<p>${l}</p>`).join('')}${links ? `<p class="pt-links">${links}</p>` : ''}</div></li>`;
    }).join('');
    const chips = ACTS.map(([id, label]) => `<button type="button" class="fchip${ctx.acts.has(id) ? ' on' : ''}" data-pt-act="${id}" aria-pressed="${ctx.acts.has(id)}">${esc(label)}</button>`).join('');
    const tips = bagTips(ctx);
    const packHtml = groups.map(g => `<div class="pt-grp"><h5>${esc(g.icon)} ${esc(g.title)}</h5>
      <ul class="pt-pack">${g.items.map(x => `<li class="${[x.own && 'pt-own', done[`pack:${x.id}`] && 'done'].filter(Boolean).join(' ')}"><label class="pt-row">${chk('pack', x.id, done)}<span>${esc(x.text)}${x.note ? ` <span class="faint">– ${esc(x.note)}</span>` : ''}</span></label>${x.own ? `<button type="button" class="pt-del" data-pt-del="${esc(x.id)}" title="Smazat položku" aria-label="Smazat položku ${esc(x.text)}">✕</button>` : ''}</li>`).join('')}</ul></div>`).join('');
    const addHtml = `<form class="pt-add" data-pt-add><input class="input" maxlength="${OWN_LEN}" placeholder="Přidat vlastní položku…" aria-label="Přidat vlastní položku do seznamu věcí" autocomplete="off" enterkeyhint="done"><button type="submit" class="btn sm">+ Přidat</button></form>`;
    const total = list.filter(x => x.level !== 'info').length + groups.reduce((s, g) => s + g.items.length, 0);
    const ticked = list.filter(x => x.level !== 'info' && done[`todo:${x.id}`]).length + groups.reduce((s, g) => s + g.items.filter(x => done[`pack:${x.id}`]).length, 0);
    const S = src();
    return `<div class="card step-card pt-card" id="preTrip" data-ptkey="${esc(key)}">
      <div class="pt-top"><div>${head}<div class="muted pt-sub">${esc(subtitle(ctx))}</div></div>
        <div class="pt-tools"><span class="pt-prog" data-pt-prog title="Hotovo / celkem">✔ ${ticked}/${total}</span><button type="button" class="btn sm" data-pt-print>🖨️ Vytisknout</button></div></div>
      <div class="pt-grid">
        <section class="pt-sec"><h4>📋 Co zařídit</h4><ul class="pt-todo">${todoHtml}</ul></section>
        <section class="pt-sec"><h4>🎒 Co sbalit</h4>
          <div class="pt-acts" role="group" aria-label="Co budeš na cestě dělat"><span class="faint">Co budeš dělat:</span> ${chips}</div>
          ${climateHtml(ctx)}${tips.length ? `<ul class="pt-tips">${tips.map(x => `<li>🧳 ${esc(x)}</li>`).join('')}</ul>` : ''}<div class="pt-groups">${packHtml}</div>${addHtml}</section>
      </div>
      <div class="faint pt-src">Informativní přehled (stav ${esc(checkedTxt() + (window.SearchHelp && DATA ? SearchHelp.dataAge(DATA.checked).txt : ''))}): ${link(S.desatero, 'MZV ČR')}, ${link(S.kzpTourist, 'Kancelář zdravotního pojištění')}, ${link(S.vzpEhic, 'VZP')}, ${link(S.idp, 'Portál veřejné správy')}, ${link(S.untc1949, 'OSN – úmluvy o silničním provozu')}, ${link(S.plugs, 'přehled zásuvek')}. Pravidla se mění – před cestou je vždy ověř. Odškrtnutí se ukládá v tomto prohlížeči a odkaz na cestu ho přenese i s vlastními položkami.</div>
    </div>`;
  }

  /** Překreslí kartu na místě (po načtení dat nebo podnebí, po změně aktivit) – jen když ukazuje tutéž cestu. */
  function refresh() {
    if (typeof document === 'undefined' || !last) return;
    const el = document.getElementById('preTrip');
    if (!el || el.dataset.ptkey !== tripKey(last.t)) return;
    // rozepsaná vlastní položka překreslení přežije (podnebí může dorazit zrovna při psaní)
    const inp = el.querySelector('[data-pt-add] input'), typed = inp ? inp.value : '', focused = Boolean(inp) && document.activeElement === inp;
    el.outerHTML = html(last.t, last.o);
    const again = typed || focused ? document.querySelector('#preTrip [data-pt-add] input') : null;
    if (again) { again.value = typed; if (focused) again.focus(); }
  }
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 30);
  }
  /** Uloží změnu stavu karty do cesty (t.pretrip; save() z app.js). */
  function patch(t, o) {
    t.pretrip = { ...(t.pretrip && typeof t.pretrip === 'object' ? t.pretrip : {}), ...o };
    if (typeof save === 'function') save();
  }
  function toggleAct(id) {
    if (!last || !ACT_IDS.includes(id)) return;
    const t = last.t, ctx = contextOf(t, last.o), on = new Set(ctx.acts);
    if (on.has(id)) on.delete(id); else on.add(id);
    patch(t, { acts: ACT_IDS.filter(x => on.has(x)) });
    refresh();
    // překreslením karta přijde o fokus – vrátit ho na stejný čip (ovládání klávesnicí)
    const chip = document.querySelector(`#preTrip [data-pt-act="${id}"]`);
    if (chip) chip.focus();
  }
  /** Přidá vlastní položku do seznamu věcí; vrátí '' (přidáno), nebo proč ne. */
  function addCustom(t, text) {
    const list = customOf(t), v = ownText(text);
    if (!v) return 'Napiš, co chceš přidat.';
    if (list.length >= OWN_MAX) return `Vlastních položek může být nejvýš ${OWN_MAX}.`;
    if (list.some(x => x.text.toLowerCase() === v.toLowerCase())) return 'Tahle položka už v seznamu je.';
    let n = 1; // nejmenší volné číslo – smazaná položka si odškrtnutí vzala s sebou
    while (list.some(x => x.id === `my-${n}`)) n++;
    patch(t, { custom: [...list, { id: `my-${n}`, text: v }] });
    return '';
  }
  /** Smaže vlastní položku i s jejím odškrtnutím; false = cesta takovou nemá. */
  function delCustom(t, id) {
    const list = customOf(t), key = tripKey(t);
    if (!list.some(x => x.id === id)) return false;
    if (doneOf(key)[`pack:${id}`]) setDone(key, `pack:${id}`, false);
    patch(t, { custom: list.filter(x => x.id !== id) });
    return true;
  }
  /** „+ Přidat“ v kartě: přidá položku a překreslí kartu; fokus zůstane v poli pro další položku. */
  function addFromForm(form) {
    const inp = form.querySelector('input');
    if (!last || !inp || !inp.value.trim()) return;
    const err = addCustom(last.t, inp.value);
    if (err) { if (typeof toast === 'function') toast(err, 'err'); return; }
    inp.value = '';
    refresh();
    const again = document.querySelector('#preTrip [data-pt-add] input');
    if (again) again.focus();
  }
  /** ✕ u vlastní položky: smaže ji a fokus dá na sousední ✕ (po poslední položce z klávesnice do pole pro přidání). */
  function delFromCard(id, keyboard) {
    if (!last) return;
    const ids = customOf(last.t).map(x => x.id), i = ids.indexOf(id);
    if (!delCustom(last.t, id)) return;
    refresh();
    const rest = ids.filter(x => x !== id), next = rest[Math.min(i, rest.length - 1)];
    const el = next ? document.querySelector(`#preTrip [data-pt-del="${next}"]`) : keyboard ? document.querySelector('#preTrip [data-pt-add] input') : null;
    if (el) el.focus();
  }
  function progress(root) {
    const boxes = [...root.querySelectorAll('input[data-ptk]')];
    const el = root.querySelector('[data-pt-prog]');
    if (el) el.textContent = `✔ ${boxes.filter(b => b.checked).length}/${boxes.length}`;
  }
  /** Tisk jen karty „Před cestou“ (tisková CSS skryje zbytek stránky podle třídy na body). */
  function printList() {
    document.body.classList.add('pt-print');
    const off = () => { document.body.classList.remove('pt-print'); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    window.print();
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('change', e => {
      const cb = e.target && e.target.closest ? e.target.closest('#preTrip input[data-ptk]') : null;
      if (!cb) return;
      const root = cb.closest('#preTrip');
      setDone(root.dataset.ptkey, cb.dataset.ptk, cb.checked);
      const li = cb.closest('li');
      if (li) li.classList.toggle('done', cb.checked);
      progress(root);
    });
    document.addEventListener('click', e => {
      const t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      const a = t.closest('#preTrip [data-pt-act]');
      if (a) { toggleAct(a.dataset.ptAct); return; }
      // klik z klávesnice (Enter, mezerník) má detail 0
      const del = t.closest('#preTrip [data-pt-del]');
      if (del) { delFromCard(del.dataset.ptDel, e.detail === 0); return; }
      if (t.closest('#preTrip [data-pt-print]')) printList();
    });
    document.addEventListener('submit', e => {
      const f = e.target && e.target.closest ? e.target.closest('#preTrip [data-pt-add]') : null;
      if (!f) return;
      e.preventDefault();
      addFromForm(f);
    });
  }

  window.PreTrip = {
    set, load, ready, contextOf, defaultActs, summarize, monthsOf, insuranceNote, drivingOf, plugOf, idpPlan, todos, pack, bagTips, layers, reminders,
    plannerChecklist, html, tripKey, doneOf, setDone, customOf, addCustom, delCustom, shareState, sanitize, adopt, ACTS,
  };
})();
