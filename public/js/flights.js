/* ATLAS – vyhledávač letenek (UI). Data z /api/search (server prohledává Ryanair, Wizz Air, Kiwi.com, Travelpayouts). */
(function () {
  const DOW = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const PRESETS = {
    weekend: { nMin: 1, nMax: 3, out: [4, 5, 6], back: [0, 1] },
    long: { nMin: 3, nMax: 5, out: [3, 4, 5], back: [0, 1, 2] },
    week: { nMin: 5, nMax: 9, out: [], back: [] },
    '2weeks': { nMin: 11, nMax: 16, out: [], back: [] },
  };
  const MNS_IN = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
  const EXOTIC = ['TH', 'ID', 'VN', 'AE', 'LK', 'MV', 'JP', 'MX', 'DO', 'CU', 'KE', 'TZ', 'OM', 'JO'];
  const PROV = {}; // id → {name,color,kind,note}
  let health = null;
  let lastResult = null;
  let lastPayload = null;
  // Filtry letišť a aerolinek vyřazují (excludeOrigins, excludeCarriers): letiště či aerolinka, která přibude s dalším
  // výsledkem (konečný po průběžném), je vidět – kromě „jen lety odsud“ (onlyOrigin), které platí i pro nová letiště.
  let view = { mode: 'list', sort: 'total', legSort: 'price', maxPrice: null, onlyDeals: false, newOnly: false, favOnly: false, showMuted: false, excludeOrigins: new Set(), onlyOrigin: null, excludeCarriers: new Set(), outDate: null, nights: null, expanded: new Set(), timeOpen: false, ocOpen: false, ...freshView() };
  // Výpis per hledání: vybraný let tam/zpět (sig), rozbalené sloupce letů, kolik kombinací ukázat, filtry času a přestupů
  // (jako 🔥 jen výhodné platí do dalšího hledání; otevřený panel filtrů zůstává).
  // kolik výsledků hned: na telefonu méně (karta letu má ~500 px – 40 karet by bylo přes 20 000 px), další po „Další…“
  // (deklarace funkcí: view výš je potřebuje už při načtení skriptu)
  function onPhone() { return typeof matchMedia === 'function' && matchMedia('(max-width:760px)').matches; }
  function flatPage() { return onPhone() ? 15 : 40; }
  function cmpPage() { return onPhone() ? 25 : 60; }
  function freshView() { return { leg: { out: null, back: null }, legAll: {}, legMore: false, flatN: flatPage(), cmpN: cmpPage(), cexp: new Set(), time: SearchHelp.freshTime(), mPicks: [], mAll: {}, mCombos: 6, gndOpen: false, moreOpen: false }; }
  let legsPref = true; // přesná data: začínat pohledem „✈︎ Lety“ (dokud si uživatel nevybere kombinace)
  let lastForm = null; // formulář posledního hledání – z něj vycházejí úpravy jedním kliknutím
  let lastResultAt = 0;
  let lastResultPayload = null; // dotaz, ke kterému je lastResult (lastPayload je i nedokončeného hledání)
  // Poslední výsledky přežijí zavření aplikace (vlastní klíč – stav aplikace má přednost, viz save() v app.js).
  const LAST_LS = 'atlas_last';
  let restored = false; // výsledky na obrazovce jsou uložené z minula, ne z hledání teď
  let running = null; // právě běžící hledání uživatele: { key (dotaz JSON), ctl (AbortController), job (Promise) }
  let fromInput, toInput, heroFrom, heroTo;
  let radarAll = false; // telefon: radar rozbalený na všechny karty („Ukázat další“)
  let originPreview = [], apOpen = false;

  /* ---------- utility ---------- */
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtYMD(d); };
  const today = () => fmtYMD(new Date());
  const dayLabel = s => { const d = new Date(s.slice(0, 10) + 'T12:00:00'); return `${DOW[d.getDay()].toLowerCase()} ${d.getDate()}. ${d.getMonth() + 1}.`; };
  const timeOf = l => l.hasTime ? l.dep.slice(11, 16) : '';
  // přílet další den (noční a dálkové lety) → „00:20 +1“
  const arrTime = l => l.arr && l.hasTime ? (l.arrEst ? '~' : '') + l.arr.slice(11, 16) + (l.arr.slice(0, 10) > l.date ? ` +${SearchHelp.diffDays(l.date, l.arr.slice(0, 10))}` : '') : '';
  const dur = m => m ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : '';
  // Let z cache (Travelpayouts / Aviasales): cena z hledání jiných uživatelů; u přestupu bez věrohodné délky i přílet neznámý.
  const CACHE_TIP = 'Cena z vyhledávání jiných uživatelů Aviasales za posledních ~48 h – let i cenu před nákupem ověř.';
  const UNK_TIP = 'Přílet neznám: cache u letu s přestupem neuvádí věrohodnou délku cesty (nejspíš jen čas ve vzduchu bez přestupu) – ověř v rezervaci.';
  const cacheTag = l => (l && l.live === false ? `<span class="b warn cache-tag" title="${esc(l.arrUnknown ? `${CACHE_TIP} ${UNK_TIP}` : CACHE_TIP)}">⏱ z cache – ověř</span>` : '');

  /* ---------- živé ověření cen z mezipaměti (Aviasales) přes /api/verify (Kiwi.com) ---------- */
  // Po hledání „kamkoliv“ se v pozadí ověří nejvýš 3 ceny z mezipaměti mezi prvními 10 cíli – po jedné (Kiwi má
  // pojistku proti výpadkům pro všechny: 3 chyby za sebou ho na minutu vypnou), při chybě nebo limitu stop;
  // ostatní tlačítkem „⚡ Ověřit cenu živě“. Rozběhnuté ověření nové hledání neruší (výsledek platí pro tutéž cestu).
  // Ukládá se jen živá cena (stejná pro všechny nabídky téže trasy a dnů); verdikt (platí / dráž) se počítá pro každou
  // nabídku zvlášť z její vlastní ceny – dvě nabídky na stejné dny (různé aerolinky) mají každá svůj.
  const liveChk = new Map(); // klíč (SearchHelp.liveKey) → { st: 'run' | 'done' | 'none', min, at }
  const liveTrips = new Map(); // id nabídky → nabídka naposledy vykreslená (pro přepsání štítku na místě)
  const liveSt = (t, x) => (!x ? null : x.st === 'run' || x.st === 'none' ? x.st : SearchHelp.liveVerdict(t.flightCzk, [{ flightCzk: x.min }]).st);
  const LIVE_TTL = 30 * 60e3; // jako mezipaměť Kiwi na serveru
  let liveGen = 0; // nové hledání → fronta automatického ověřování předchozího skončí
  const liveAdults = () => (lastResult && lastResult.query && lastResult.query.adults) || 1;
  const liveGet = k => { const x = liveChk.get(k); return x && (x.st === 'run' || Date.now() - x.at < LIVE_TTL) ? x : null; };
  const liveWhen = x => new Date(x.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  // živá cena na osobu na stejném základu jako cena řádku (doprava na letiště, zavazadla, cesta do města)
  const liveTotal = (t, x) => t.perPersonCzk - t.flightCzk + x.min;
  /** Stav ověření pod cenou v Přehledu: „⏱ z cache“, „ověřuji živě…“, „✓ cena platí“, „⚠ živě 2 488 Kč“… */
  function liveHtml(t) {
    if (!SearchHelp.isCached(t)) return '';
    const k = SearchHelp.liveKey(t, liveAdults()), x = liveGet(k), st = liveSt(t, x);
    liveTrips.set(t.id, t);
    let cls = 'faint', txt = '⏱ z cache', title = CACHE_TIP;
    if (st === 'run') { txt = '<span class="spin dark"></span> ověřuji živě…'; title = ''; }
    else if (st === 'ok') { cls = 'good'; txt = `✓ živě od ${czk(liveTotal(t, x))}`; title = `Nejlevnější živá nabídka na stejné dny: ${czk(liveTotal(t, x))}/os. (Kiwi.com, ověřeno ${liveWhen(x)})`; }
    else if (st === 'dearer') { cls = 'warn'; txt = `⚠ živě ${czk(liveTotal(t, x))}`; title = `Cena ${czk(t.perPersonCzk)} je z mezipaměti Aviasales (až 2 dny stará) a živě ji teď nikdo nenabízí – nejlevnější živá nabídka na stejné dny je ${czk(liveTotal(t, x))}/os. (Kiwi.com, ověřeno ${liveWhen(x)})`; }
    else if (st === 'none') { txt = 'živě nenalezeno'; title = 'Kiwi.com na tyhle dny živou nabídku nenašlo – cenu ověř u aerolinky nebo na Aviasales.'; }
    return `<span class="cmp-live ${cls}" data-lk="${esc(k)}" data-ltid="${esc(t.id)}"${title ? ` title="${esc(title)}"` : ''}>${txt}</span>`;
  }
  /** Štítek v kartě nabídky: bez ověření „⏱ z cache – ověř“, po ověření výsledek. */
  function liveBadge(t) {
    const k = SearchHelp.liveKey(t, liveAdults()), x = liveGet(k), st = liveSt(t, x);
    liveTrips.set(t.id, t);
    const lk = `data-lk="${esc(k)}" data-ltid="${esc(t.id)}"`;
    if (!x) return cacheTag([t.out, t.back].find(l => l && l.arrUnknown) || (t.out.live === false ? t.out : t.back)).replace('class="b warn cache-tag"', `class="b warn cache-tag live-b" ${lk}`);
    if (st === 'run') return `<span class="b live-b" ${lk}><span class="spin dark"></span> ověřuji živě…</span>`;
    if (st === 'dearer') return `<span class="b warn live-b" ${lk} title="${esc(`Nejlevnější živá nabídka na stejné dny (Kiwi.com, ověřeno ${liveWhen(x)})`)}">⚠ z cache – živě od ${czk(liveTotal(t, x))}/os.</span>`;
    if (st === 'none') return `<span class="b warn live-b" ${lk}>⏱ z cache – živě nenalezeno</span>`;
    return `<span class="b good live-b" ${lk} title="${esc(`Nejlevnější živá nabídka na stejné dny (Kiwi.com, ověřeno ${liveWhen(x)})`)}">✓ ověřeno živě: od ${czk(liveTotal(t, x))}/os.</span>`;
  }
  /** Přepsat stav ověření u nabídky klíče k na místě (bez nového vykreslení – posun stránky ani otevřená karta se nemění). */
  function patchLive(k) {
    $$('[data-lk]').filter(el => el.dataset.lk === k).forEach(el => {
      const t = liveTrips.get(el.dataset.ltid); // každý štítek se svou nabídkou (verdikt podle její ceny)
      if (!t) return;
      const price = el.classList.contains('cmp-live') ? el.closest('.cmp-price') : null;
      el.outerHTML = el.classList.contains('cmp-live') ? liveHtml(t) : liveBadge(t);
      const b = price && price.querySelector('b');
      if (b) b.classList.toggle('stale', liveSt(t, liveGet(k)) === 'dearer');
    });
  }
  /**
   * Živé ověření jedné nabídky → 'ok' | 'dearer' | 'none' | 'run' (už se ověřuje) | 'limit' (429) | 'off' (nedostupné) | 'err'.
   * adults = počet lidí nabídky (📌 odložená může být z jiného hledání než výsledky na obrazovce).
   */
  async function verifyOne(t, adults = liveAdults()) {
    const k = SearchHelp.liveKey(t, adults);
    // štítek ve výpisu zůstane u své nabídky (📌 odložená s jiným nastavením má stejné id, ale jinou cenu)
    if (!liveTrips.has(t.id)) liveTrips.set(t.id, t);
    const prev = liveGet(k); // při chybě nechat dřívější výsledek ověření
    if (prev && prev.st === 'run') return 'run';
    liveChk.set(k, { st: 'run', at: Date.now() }); patchLive(k);
    const qs = new URLSearchParams({ from: t.out.from, to: t.out.to, out: t.out.date, adults });
    if (t.back) { qs.set('back', t.back.date); qs.set('backFrom', t.back.from); qs.set('backTo', t.back.to); }
    // Kiwi na serveru má na dotaz až 40 s i s opakováním
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 45000);
    const fail = st => { if (prev && prev.st !== 'run') liveChk.set(k, prev); else liveChk.delete(k); patchLive(k); return st; };
    try {
      const r = await fetch('api/verify?' + qs, { signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) return fail('limit');
      if (!r.ok || !j.available) return fail('off');
      const v = SearchHelp.liveVerdict(t.flightCzk, j.items, j.error);
      if (v.st === 'err') return fail('err');
      liveChk.set(k, { st: v.st === 'none' ? 'none' : 'done', min: v.min, at: Date.now() }); patchLive(k);
      return v.st;
    } catch (e) {
      return fail('err');
    } finally {
      clearTimeout(tm);
    }
  }
  // hláška k ověření, které se nepovedlo (tlačítko ⚡ u nabídky i v 📌 Porovnat)
  function liveToast(st) {
    if (st === 'limit') toast('Živé ověření je teď vytížené – zkus to za pár minut.', 'err');
    else if (st === 'off') toast('Živé ověření teď není dostupné.');
    else if (st === 'err') toast('Ověření se nepodařilo – zkus to znovu.', 'err');
  }
  /** Po hledání „kamkoliv“ / do zemí: v pozadí ověřit nejvýš 3 ceny z mezipaměti mezi prvními 10 cíli. */
  async function autoVerify(res) {
    const gen = ++liveGen;
    if (!res || res.partial || res.mode !== 'explore' || res.demo || document.hidden || SearchHelp.kiwiOutage(res.providers)) return;
    const todo = SearchHelp.livePick(computeGroups(), { rows: 10, max: 3, adults: liveAdults(), done: k => Boolean(liveGet(k)) });
    await new Promise(r => setTimeout(r, 1000)); // ať nejde v jedné dávce s posledními dotazy hledání
    while (todo.length && gen === liveGen) {
      const st = await verifyOne(todo.shift());
      if (st === 'limit' || st === 'off' || st === 'err') return;
    }
  }
  // přílet „?“ u letu s přestupem bez známé délky (místo vymyšleného času)
  const arrUnk = l => (l && l.arrUnknown && l.hasTime ? `<span class="tm unk" title="${esc(UNK_TIP)}">přílet ?</span>` : '');
  const hm = SearchHelp.hm;
  // „1× přestup (MUC 1 h 35 min)“ – kde a jak dlouho, známe-li časy úseků (Kiwi)
  const stopsTxt = l => `${l.stops}× přestup${(l.layovers || []).length ? ` (${l.layovers.map(x => `${x.at || ''} ${hm(x.min)}`.trim()).join(', ')})` : ''}`;
  const yymmdd = s => s.slice(2, 10).replace(/-/g, '');
  const nightsTxt = n => n === 1 ? '1 noc' : n >= 2 && n <= 4 ? `${n} noci` : `${n} nocí`;
  const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
  const provName = id => PROV[id]?.name || id;
  const provColor = id => PROV[id]?.color || '#64748b';
  // Na tlačítko jen jméno prodejce („Kiwi.com“), bez vysvětlivky v závorce.
  const shopName = id => provName(id).replace(/\s*\(.*\)\s*$/, '');
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  async function api(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  }

  /** POST /api/search se streamem průběhu (NDJSON). */
  // Pozn.: Chrome (DevTools, Playwright) u streamovaného hledání často hlásí net::ERR_ABORTED / (canceled), i když odpověď
  // dorazila celá – jen hlášení prohlížeče. Skutečně se ruší jen přes AbortController (jiné hledání, kontrola hlídání po 3 min).
  // onPartial(result) = průběžné výsledky, dokud pomalejší zdroje hledají (jen náhled); bez něj je server neposílá
  // (noPartial – kontrola hlídaných cen, radar). Starší server je nepošle vůbec.
  async function runSearch(payload, { onProgress, onPartial, signal } = {}) {
    const r = await fetch('api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(onPartial ? payload : { ...payload, noPartial: true }), signal });
    if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', result = null, error = null;
    for (; ;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === 'progress' && onProgress) onProgress(ev);
        // náhled je navíc – chyba při jeho vykreslení nesmí shodit hledání
        else if (ev.type === 'partial' && onPartial && ev.result) { try { onPartial(ev.result); } catch (e) { console.error(e); } }
        else if (ev.type === 'result') result = ev.result;
        else if (ev.type === 'error') error = ev.error;
      }
    }
    if (error) throw new Error(error);
    if (!result) throw new Error('Server neposlal výsledek');
    return result;
  }

  /* ---------- PlaceInput: čipy + našeptávač ---------- */
  // Kontext našeptávače: role pole a domov (pořadí podle vzdálenosti). Poloha „Moje poloha“ jen na desetiny stupně.
  function placeCtx(origin, nearId) {
    let n = String(nearId || '');
    const g = /^geo:(-?[\d.]+),(-?[\d.]+)/.exec(n);
    if (g) n = `geo:${(+g[1]).toFixed(1)},${(+g[2]).toFixed(1)}`;
    return (origin ? '&role=from' : '') + (/^(ap|metro|geo|cc):/.test(n) ? '&near=' + enc(n) : '');
  }
  // návrhy míst našeptávače (api/places)
  async function placesFor(q, origin, near, signal, remote = true) {
    const r = await fetch('api/places?q=' + enc(q) + placeCtx(origin, near) + (remote ? '' : '&remote=0'), { signal });
    return (await r.json()).items || [];
  }
  // chytré hledání: termíny podle svátků a délky pobytu jako ve formuláři
  const smartOpts = () => ({ today: today(), presets: PRESETS, holidays: SearchHelp.holidayList(today()), holidayDates: SearchHelp.holidayDates });
  /** Místa z věty („do Říma“, „z Vídně“): tvar slova i se zkrácenou koncovkou → nejlepší návrh (Smart.bestPlace). */
  // Místo z tvaru ve větě („Říma“ → Řím): napřed vlastní data (rychle); geokódování (pomalejší, vesnice a místa mimo
  // databázi) jen když nic nenajdou
  async function resolvePlace(phrase, origin, near, signal, geo = true) {
    const look = remote => Promise.all(Smart.stems(phrase).map(q => placesFor(q, origin, near, signal, remote)
      .then(items => ({ q, items }), e => { if (e.name === 'AbortError') throw e; return { q, items: [] }; })));
    // opravený překlep („do Barcleony“) až nakonec – skutečné místo z geokódování (vesnice toho jména) má přednost
    const loc = await look(false), found = Smart.bestPlace(loc);
    if (found) return found;
    const rem = geo ? await look(true) : null;
    return (rem && Smart.bestPlace(rem)) || Smart.bestPlace(rem || loc, true);
  }
  async function smartResolve(hit, near, signal, geo = true) {
    const one = (phrase, origin) => resolvePlace(phrase, origin, near, signal, geo);
    const [to, from] = await Promise.all([Promise.all(hit.sm.to.map(x => one(x, false))), Promise.all(hit.sm.from.map(x => one(x, true)))]);
    const item = x => ({ id: x.id, label: x.label, flag: x.flag || '📍', type: x.type });
    // cesta přes víc měst („Praha → Řím → Barcelona → Praha“): všechna místa v pořadí, jen města a letiště
    const stop = x => x && ['airport', 'metro', 'city'].includes(x.type);
    hit.chain = hit.sm.chain && stop(from[0]) && to.length <= 5 && to.every(stop) ? [from[0], ...to].map(item) : null;
    hit.to = to.filter(Boolean).map(item).slice(0, 5);
    hit.from = from.filter(x => x && x.type !== 'continent').map(item).slice(0, 3);
    hit.miss = [...hit.sm.to.filter((x, i) => !to[i]), ...hit.sm.from.filter((x, i) => !from[i] || from[i].type === 'continent')];
    // „a zpět z Neapole“: návrat z jiného místa (město nebo letiště)
    const bk = hit.sm.back ? await one(hit.sm.back, true) : null;
    hit.back = stop(bk) ? item(bk) : null;
    if (hit.sm.back && !hit.back) hit.miss.push(hit.sm.back);
  }
  /**
   * „Praha Londýn“ (bez z/do a pomlčky), které jako jedno místo neexistuje: zkusit rozdělit na odkud → kam
   * (jen vlastní data – geokódování by ze zlomku názvu našlo vesnici).
   */
  async function smartSplit(q, near, signal) {
    const w = q.trim().split(/\s+/);
    if (w.length < 2 || w.length > 5) return null;
    for (let i = 1; i < w.length; i++) {
      const sm = Smart.parse(`${w.slice(0, i).join(' ')} → ${w.slice(i).join(' ')}`, smartOpts());
      if (sm.from.length !== 1 || sm.to.length !== 1) continue;
      const hit = { sm, to: [], from: [], miss: [] };
      await smartResolve(hit, near, signal, false);
      // odkud jen město nebo letiště („Egypt Hurghada“ není z Egypta do Hurghady)
      if (!hit.miss.length && hit.from.length && hit.to.length && ['airport', 'metro', 'city'].includes(hit.from[0].type)) return hit;
    }
    return null;
  }
  /** „Egypt Hurghada“, „Řecko Kréta“: země a místo v ní → to místo (jen vlastní data). */
  async function countryPlace(q, origin, near, signal) {
    const w = q.trim().split(/\s+/);
    if (w.length < 2 || w.length > 5) return null;
    for (let i = 1; i < w.length; i++) {
      const [a, b] = await Promise.all([w.slice(0, i), w.slice(i)].map(x => resolvePlace(x.join(' '), origin, near, signal, false)));
      if (a && b && a.type === 'country' && b.type !== 'country' && (b.cc === a.cc || b.type === 'region')) return b;
    }
    return null;
  }
  class PlaceInput {
    // smart = { run(hit), tips() } – chytré hledání (pole Kam): věta „k moři v květnu do 5000“ → ✨ řádek nahoře
    // s tím, jak jí rozumím, a prázdné pole po klepnutí → tipy podle toho, co uživatel hledá (Smart, smartTips)
    constructor(el, { placeholder, max = 5, onChange, dark = false, allowAnywhere = false, origin = false, near = null, smart = null }) {
      this.el = el; this.items = []; this.max = max; this.onChange = onChange || (() => { }); this.allowAnywhere = allowAnywhere;
      this.origin = origin; // odkud: světadíl nedává smysl
      this.near = near || (() => (S.home && S.home.from && S.home.from[0] && S.home.from[0].id) || ''); // domov pro pořadí návrhů
      this.smart = smart && window.Smart ? smart : null; this.hit = null; this.tips = [];
      el.classList.add('pi'); if (dark) el.classList.add('pi-dark');
      el.innerHTML = `<div class="pi-chips"></div><input class="pi-input" placeholder="${esc(placeholder || '')}" autocomplete="off" spellcheck="false"><div class="pi-dd" hidden></div>`;
      this.chipsEl = $('.pi-chips', el); this.input = $('.pi-input', el); this.dd = $('.pi-dd', el);
      this.active = -1; this.sugs = []; this.ctl = null; this.ph = placeholder;
      const load = debounce(() => this.fetch(), 160);
      this.input.addEventListener('input', () => { if (this.input.value.trim().length >= 2) load(); else if (!this.input.value.trim()) this.showTips(); else this.close(); });
      this.input.addEventListener('focus', () => { if (this.input.value.trim().length >= 2) load(); else if (!this.input.value.trim()) this.showTips(); });
      this.input.addEventListener('keydown', e => this.key(e));
      this.input.addEventListener('blur', () => setTimeout(() => this.close(), 150));
      el.addEventListener('click', e => { if (e.target === el || e.target === this.chipsEl) this.input.focus(); });
      this.render();
    }
    // řádky nabídky: ✨ chytré hledání, tipy (prázdné pole), návrhy míst
    rows() { return [...(this.hit ? [{ hit: this.hit }] : []), ...this.tips.map(t => ({ tip: t })), ...this.sugs.map(s => ({ sug: s }))]; }
    showTips() {
      if (!this.smart) return;
      this.hit = null; this.sugs = [];
      try { this.tips = this.smart.tips() || []; } catch (e) { this.tips = []; }
      this.active = -1; // Enter v prázdném poli dál odešle formulář
      if (this.tips.length) this.open(); else this.close();
    }
    /**
     * Co k textu nabídnout: ✨ věta (hit – termín, cena, „k moři“…, odkud, víc míst; návrhy pro kus věty by mátly),
     * jinak místa – i z tvaru ve větě („do Barcelony“, „levně do Paříže“ → Barcelona, Paříž; „z Brna“ v Odkud → Brno)
     * a „Praha Londýn“ jako odkud → kam, když to jako jedno místo neexistuje.
     */
    // remote = false: jen vlastní data, bez geokódování (rychlý první náhled nabídky)
    async lookup(q, signal, remote = true) {
      const sm = window.Smart ? Smart.parse(q, smartOpts()) : null;
      const hit = this.smart && sm && (sm.chips.length || sm.from.length || sm.to.length >= 2 || sm.back) ? { sm, to: [], from: [], miss: [] } : null;
      if (hit) { await smartResolve(hit, this.near(), signal, remote); return { hit, items: [] }; }
      const one = sm && !sm.kind && !sm.chips.length && sm.to.length + sm.from.length === 1 ? sm.to[0] || sm.from[0] : null;
      const qq = one && Smart.fold(one) !== Smart.fold(q) ? one : q;
      const [list, known] = await Promise.all([
        qq.length >= 2 ? placesFor(qq, this.origin, this.near(), signal, remote) : [],
        one ? resolvePlace(one, this.origin, this.near(), signal, false) : null,
      ]);
      // tvar slova („do Paříže“, „Vídně“, „z Brna“): známé místo ze zkrácené koncovky (Paříž) před podobně znějícími
      // místy z geokódování (Pariževići, Vidne, Brná); bez předložky ne, když místo přesně tak jmenované už v návrzích
      // je („Brná“ napsané celé) – po předložce je to vždy tvar slova
      const low = x => String(x || '').normalize('NFC').toLocaleLowerCase('cs');
      let items = list;
      // (návrh jako oprava překlepu – „Paříže“ = Paříž? – se nepočítá: známé místo ho nahradí)
      if (known && !known.fuzzy && !items.some(x => x.id === known.id && !x.fuzzy) && (qq !== q || !items.some(x => low(x.label) === low(qq)))) items = [known, ...items.filter(x => x.id !== known.id)];
      // vesnice ve tvaru věty („do Hronova“): i geokódováním; víceslovné ne („Brno Londýn“ by našlo ulici)
      if (remote && !items.length && one && !/\s/.test(one)) { const g = await resolvePlace(one, this.origin, this.near(), signal); if (g) items = [g]; }
      items = items.filter(s => !this.origin || s.type !== 'continent');
      // („letenky Praha Barcelona“: bez výplňových slov)
      const sq = one && /\s/.test(one) ? one : q;
      const split = !items.length && this.smart && !this.origin && /\s/.test(sq) ? await smartSplit(sq, this.near(), signal) : null;
      if (!items.length && !split && /\s/.test(q)) { const p = await countryPlace(q, this.origin, this.near(), signal); if (p) items = [p]; }
      return { hit: split, items };
    }
    async fetch() {
      const q = this.input.value.trim();
      if (this.ctl) this.ctl.abort();
      this.ctl = new AbortController();
      const signal = this.ctl.signal;
      this.tips = [];
      const show = ({ hit, items }) => {
        if (q !== this.input.value.trim()) return;
        this.hit = hit;
        this.sugs = items; this.active = this.hit || this.sugs.length ? 0 : -1; this.open();
      };
      // hned nabídka z vlastních dat; geokódování (Open-Meteo – občas i několik sekund) ji pak doplní. Náhled jen bez
      // míst „neznám“ a bez opravy překlepu na prvním místě (to může geokódování najít skutečné místo)
      let done = false;
      this.lookup(q, signal, false).then(r => {
        if (!done && (r.hit ? !r.hit.miss.length : r.items.length && !r.items[0].fuzzy)) show(r);
      }, () => { });
      try {
        const r = await this.lookup(q, signal);
        done = true; show(r);
      } catch (e) { if (e.name !== 'AbortError') { this.hit = null; this.sugs = []; this.open(true); } }
    }
    open(err) {
      const typeLbl = { airport: 'letiště', metro: 'město', city: 'město', country: 'země', region: 'oblast', place: 'místo', continent: 'světadíl' };
      const rows = this.rows();
      const row = (r, i) => {
        const on = i === this.active ? ' on' : '';
        if (r.hit) {
          const h = r.hit, places = h.chain ? [`🧳 ${h.chain.map(x => x.label).join(' → ')}`] : [...h.from.map(x => `🛫 ${x.label} →`), ...h.to.map(x => `📍 ${x.label}`), ...(h.back ? [`↩ návrat: ${h.back.label}`] : [])];
          const what = [...places, ...h.sm.chips.map(c => `${c.icon} ${c.text}`)].join(' · ');
          const sub = h.chain ? 'víc měst – nastavím lety mezi nimi (termíny rozdělím) a hledám'
            : h.back && !h.miss.length ? 'tam a zpět z jiného města – nastavím 2 lety (přejezd mezi městy je na tobě) a hledám'
            : h.miss.length ? `„${h.miss.join('“, „')}“ neznám – hledám bez toho` : (h.sm.items && !h.to.length ? h.sm.items.map(x => x.label).join(', ') : 'klepni nebo Enter – nastavím a hledám');
          return `<div class="pi-opt pi-smart${on}" data-i="${i}"><span class="pi-flag">✨</span><span class="pi-t"><b>${esc(what)}</b><small>${esc(sub)}</small></span><span class="pi-type">hledat</span></div>`;
        }
        if (r.tip) return `<div class="pi-opt pi-tip${on}" data-i="${i}"><span class="pi-flag">${r.tip.icon}</span><span class="pi-t"><b>${esc(r.tip.text)}</b>${r.tip.sub ? `<small>${esc(r.tip.sub)}</small>` : ''}</span></div>`;
        const s = r.sug;
        return `<div class="pi-opt${on}" data-i="${i}"><span class="pi-flag">${s.flag || '📍'}</span><span class="pi-t"><b>${esc(s.label)}</b><small>${esc(s.sub || '')}</small></span><span class="pi-type">${typeLbl[s.type] || ''}</span></div>`;
      };
      this.dd.innerHTML = (this.tips.length ? '<div class="pi-head">✨ Pro tebe – nebo napiš celou větu, třeba „k moři v květnu do 5000“</div>' : '')
        + (rows[0] && rows[0].sug && rows[0].sug.fuzzy ? '<div class="pi-head">🔤 Překlep? Asi myslíš:</div>' : '')
        + (rows.length ? rows.map(row).join('') : `<div class="pi-empty">${err ? 'Našeptávač je nedostupný' : 'Nic nenalezeno – zkus jiný název nebo kód letiště'}</div>`);
      this.dd.hidden = false;
      $$('.pi-opt', this.dd).forEach(o => o.onmousedown = e => { e.preventDefault(); this.choose(rows[+o.dataset.i]); });
    }
    close() { this.dd.hidden = true; }
    /**
     * Text napsaný v poli, ale nevybraný z nabídky, a formulář odeslaný tlačítkem: věta → ✨ jako Enter ('run'),
     * název → první návrh ('pick'); nic → false (a hláška). Prázdné pole → 'none'.
     */
    // dvojklik na Najít lety: druhé odeslání čeká na totéž (jinak by po vyprázdnění pole hledalo „kamkoliv“)
    settle() { return this.settling || (this.settling = this.settleNow().finally(() => { this.settling = null; })); }
    async settleNow() {
      const q = this.input.value.trim();
      if (!q) return 'none';
      if (this.ctl) this.ctl.abort();
      this.close();
      let down = false;
      try {
        const { hit, items } = await this.lookup(q);
        if (hit) { this.input.value = ''; this.smart.run(hit); return 'run'; }
        if (items[0]) { this.pick(items[0]); return 'pick'; }
      } catch (e) { down = true; } // našeptávač nedostupný (výpadek sítě / serveru) – nejde o neznámé místo
      toast(down ? 'Místa teď nejde dohledat – zkontroluj připojení a zkus to znovu' : `„${q}“ neznám – vyber místo z nabídky`, 'err');
      this.input.focus();
      return false;
    }
    choose(r) {
      if (!r) return;
      if (r.sug) return this.pick(r.sug);
      this.input.value = ''; this.close(); this.input.blur();
      if (r.hit) this.smart.run(r.hit);
      else if (r.tip) r.tip.run();
    }
    key(e) {
      const n = this.rows().length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (this.dd.hidden || !n) return;
        e.preventDefault(); this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; this.open();
      } else if (e.key === 'Enter') {
        if (!this.dd.hidden && this.active >= 0 && this.active < n) { e.preventDefault(); this.choose(this.rows()[this.active]); }
      } else if (e.key === 'Escape') this.close();
      else if (e.key === 'Backspace' && !this.input.value && this.items.length) { this.items.pop(); this.render(); this.onChange(this.items); }
    }
    pick(s) {
      if (!s) return;
      const item = { id: s.id, label: s.label, flag: s.flag || '📍', type: s.type };
      if (!this.items.some(x => x.id === item.id)) {
        if (this.items.length >= this.max) { toast(`Nejvýš ${this.max} ${this.max <= 4 ? 'místa' : 'míst'} – nejdřív některé odeber`, 'err'); return; }
        this.items.push(item);
      }
      this.input.value = ''; this.close(); this.render(); this.onChange(this.items);
    }
    set(items, silent) { this.items = (items || []).slice(0, this.max); this.render(); if (!silent) this.onChange(this.items); }
    add(item) { this.pick(item); }
    render() {
      this.chipsEl.innerHTML = this.items.map((x, i) => `<span class="pi-chip"><span>${x.flag || ''}</span>${esc(x.label)}<button type="button" data-x="${i}" aria-label="Odebrat">×</button></span>`).join('');
      $$('[data-x]', this.chipsEl).forEach(b => b.onclick = e => { e.stopPropagation(); this.items.splice(+b.dataset.x, 1); this.render(); this.onChange(this.items); });
      this.input.placeholder = this.items.length ? 'přidat další…' : this.ph;
    }
  }

  /* ---------- formulář ---------- */
  function defaultForm() {
    return {
      from: S.home?.from || [], to: [], radius: S.home?.radius ?? 200, trip: 'return', len: 'week', nMin: 5, nMax: 9,
      dFrom: addDays(today(), 7), dTo: addDays(today(), 60), adults: 2, maxPrice: '',
      // doprava na letiště: groundMode transit (veřejnou dopravou) | car (autem); kmRate = násobek odhadu jízdného;
      // autem pohon carFuel (diesel | petrol | ev), spotřeba a vlastní cena (null = aktuální) pro každý pohon zvlášť
      ground: true, groundMode: 'transit', kmRate: 1, carFuel: 'diesel', ...carDefaults(),
      // cesta z letiště příletu do města a zpět na letiště (jízdné z ověřené tabulky, jinak odhad) v ceně
      arrival: true,
      openJaw: true, directOnly: false, outDays: [], backDays: [], exclude: [], minTemp: 0, bags: 'none',
      depAfter: null, // prodloužený víkend z radaru: { date, time } – v předvečer jen odlety od time
      dateMode: 'flex', xOut: addDays(today(), 14), xBack: addDays(today(), 21), xFlex: 0,
      legs: [], // cesta přes víc měst: [{ from, to, date, flex }] (odkud 1. letu = from)
    };
  }
  function getForm() {
    return {
      // kopie: uložené hlídání ani S.form nesmí sdílet pole s políčky (další úprava čipů by je potichu přepsala)
      from: fromInput.items.slice(), to: toInput.items.slice(), radius: +$('#radius').value,
      trip: $('#tripType .on').dataset.v, len: $('#lenPreset .on')?.dataset.v || 'custom',
      nMin: +$('#nMin').value, nMax: +$('#nMax').value, dFrom: $('#dFrom').value, dTo: $('#dTo').value,
      adults: +$('#adults').value, maxPrice: $('#maxPrice').value, ground: $('#groundOn').checked,
      groundMode: $('#groundMode .on')?.dataset.g === 'car' ? 'car' : 'transit', kmRate: +$('#kmRate').value, ...carForm(),
      arrival: $('#arrivalOn').checked,
      openJaw: ojPref, directOnly: $('#directOnly').checked,
      outDays: $$('#outDays .on').map(b => +b.dataset.d), backDays: $$('#backDays .on').map(b => +b.dataset.d),
      depAfter: depAfterOn() ? { ...depAfterVal } : null,
      // náhled letišť se po setForm načítá se zpožděním – do té doby platí vyřazená letiště z formuláře
      exclude: originPreview.length ? originPreview.filter(a => a.off).map(a => a.iata) : [...pendingExclude], minTemp: +($('#minTemp .on')?.dataset.t || 0),
      bags: $('#bags .on')?.dataset.b || 'none',
      dateMode: $('#dateMode .on').dataset.v, xOut: $('#xOut').value, xBack: $('#xBack').value, xFlex: +($('#xFlex .on')?.dataset.f || 0),
      // lety jen u Víc měst nebo když je uživatel upravil (výchozí se při přepnutí předvyplní z formuláře)
      legs: mlTouched || $('#tripType .on').dataset.v === 'multi' ? mlRead() : [],
    };
  }
  function setForm(f) {
    f = { ...defaultForm(), ...SearchHelp.groundForm(f) }; // starší uložená hledání: kmRate v Kč/km → násobek
    rollTouched = false; // 📅 Posouvat termín s časem: zase podle začátku rozsahu
    if (f.dFrom < today()) {
      // termín, který už začal: hledání, které se hlídá klouzavě, dostane dnešní rozsah hlídání (od dneška + 3 by u „odlet
      // za 7–60 dní“ bylo jiné hledání), ostatní stejně dlouhý rozsah od dneška + 3
      const rf = rolledOf(f), r = rf && Alerts.rollForm(rf.form, today());
      const span = Math.max(14, (new Date(f.dTo) - new Date(f.dFrom)) / 864e5 | 0);
      f.dFrom = r ? r.dFrom : addDays(today(), 3); f.dTo = r ? r.dTo : addDays(f.dFrom, span);
    }
    if (!f.xOut || f.xOut < today()) { const n = f.xOut && f.xBack ? Math.max(0, (new Date(f.xBack) - new Date(f.xOut)) / 864e5 | 0) : 7; f.xOut = addDays(today(), 14); f.xBack = addDays(f.xOut, n); }
    $$('#dateMode button').forEach(b => b.classList.toggle('on', b.dataset.v === f.dateMode));
    $('#xOut').value = f.xOut; $('#xBack').value = f.xBack || addDays(f.xOut, 7);
    $$('#xFlex button').forEach(b => b.classList.toggle('on', +b.dataset.f === (f.xFlex || 0)));
    fromInput.set(f.from, true); toInput.set(f.to, true);
    $('#radius').value = f.radius; $('#radiusVal').textContent = f.radius + ' km';
    $$('#tripType button').forEach(b => b.classList.toggle('on', b.dataset.v === f.trip));
    $$('#lenPreset button').forEach(b => b.classList.toggle('on', b.dataset.v === f.len));
    $('#nMin').value = f.nMin; $('#nMax').value = f.nMax; $('#dFrom').value = f.dFrom; $('#dTo').value = f.dTo;
    $('#adults').value = String(f.adults); $('#maxPrice').value = f.maxPrice || ''; $('#groundOn').checked = f.ground; $('#kmRate').value = f.kmRate;
    $('#arrivalOn').checked = f.arrival !== false;
    ojPref = f.openJaw !== false;
    setGroundMode(f.groundMode); setCar(f);
    $('#directOnly').checked = f.directOnly;
    mlSet(f);
    setMinTemp(f.minTemp);
    setBags(f.bags);
    $$('#outDays button').forEach(b => b.classList.toggle('on', f.outDays.includes(+b.dataset.d)));
    $$('#backDays button').forEach(b => b.classList.toggle('on', f.backDays.includes(+b.dataset.d)));
    const da = f.depAfter;
    depAfterVal = da && /^\d{4}-\d{2}-\d{2}$/.test(da.date) && /^\d{2}:\d{2}$/.test(da.time) ? { date: da.date, time: da.time } : null;
    $('#depAfterOn').checked = true;
    originPreview = []; pendingExclude = new Set(f.exclude || []);
    syncFormUI(); refreshOrigins();
  }
  let pendingExclude = new Set();
  let rollTouched = false; // 📅 Posouvat termín s časem přepnuté ručně (jinak podle začátku rozsahu – rollWanted)
  // Prodloužený víkend (karta radaru „Svátky“): v předvečer volna jen odlety od daného času. Platí, dokud je den
  // v rozsahu odletu, hledání není přesná data / víc měst a uživatel ho nevypnul.
  let depAfterVal = null;
  // jen v termínu z karty (odlet v předvečer nebo první volný den) – roztažený termín („3 měsíce“) už je jiné hledání
  const depAfterWin = d => Boolean(d) && $('#dFrom').value === d.date && $('#dTo').value >= d.date && $('#dTo').value <= addDays(d.date, 1)
    && $('#tripType .on').dataset.v !== 'multi' && $('#dateMode .on').dataset.v !== 'exact';
  function depAfterOn() {
    return depAfterWin(depAfterVal) && $('#depAfterOn').checked;
  }
  function syncDepAfter() {
    const d = depAfterVal, show = depAfterWin(d);
    $('#depAfterLbl').hidden = !show;
    if (show) $('#depAfterTxt').textContent = `${DOW[new Date(d.date + 'T12:00:00Z').getUTCDay()]} ${fmtDate(d.date)} (předvečer volna) jen odlety od ${d.time}`;
  }
  // Za teplem: 0 = kdekoliv, jinak 20 / 25 / 30 °C (starší uložená hledání pole nemají).
  function setMinTemp(t) { $$('#minTemp button').forEach(b => b.classList.toggle('on', +b.dataset.t === (+t || 0))); }
  // Zavazadla: none = jen malé pod sedadlo (starší uložená hledání a hlídané ceny pole nemají).
  const BAG_LBL = { cabin: 'kabinový kufr', checked: 'kufr k odbavení' };
  function setBags(b) { $$('#bags button').forEach(x => x.classList.toggle('on', x.dataset.b === (BAG_LBL[b] ? b : 'none'))); }
  // Na letiště 🚌 veřejnou dopravou / 🚗 autem (starší uložená hledání pole nemají = veřejnou dopravou).
  function setGroundMode(m) {
    const car = m === 'car';
    $$('#groundMode button').forEach(b => { b.classList.toggle('on', (b.dataset.g === 'car') === car); b.setAttribute('aria-pressed', String((b.dataset.g === 'car') === car)); });
    $('#gmTransit').hidden = car; $('#gmCar').hidden = !car;
    syncOpenJaw();
    if (car) loadFuel();
  }
  const carMode = () => $('#groundMode .on')?.dataset.g === 'car';
  // „Návrat i na jiné letiště v okolí“: autem se vracíš k autu – zaškrtávátko je vypnuté a prázdné (server autem návrat
  // na jiné letiště nehledá), volba z veřejné dopravy se pamatuje (ojPref) a v dotazu platí jen pro letiště v cíli.
  let ojPref = true;
  function syncOpenJaw() {
    const cb = $('#openJaw'), car = carMode();
    cb.disabled = car;
    cb.checked = car ? false : ojPref;
    $('#openJawLbl').classList.toggle('dis', car);
    $('#openJawLbl').title = car ? 'Autem se vracíš na letiště, kde parkuje auto – návrat na jiné letiště v okolí v režimu autem nehledám.' : '';
    $('#ojHint').hidden = !car;
  }

  /* ---------- autem: pohon, spotřeba a cena paliva / nabíjení (aktuální z /api/fuel, nebo vlastní) ---------- */
  const FUELS = ['diesel', 'petrol', 'ev'];
  const FUEL_SHORT = { diesel: 'nafta', petrol: 'benzín', ev: 'elektro' };
  // Výchozí spotřeba každého pohonu a žádná vlastní cena (= aktuální).
  function carDefaults() {
    return { carCons: Object.fromEntries(FUELS.map(k => [k, SearchHelp.CAR_FUELS[k].cons])), carPrice: Object.fromEntries(FUELS.map(k => [k, null])) };
  }
  let carMem = carDefaults(); // spotřeba a vlastní cena pro každý pohon zvlášť – přepnutí pohonu je zachová
  let fuelInfo = null, fuelState = null; // odpověď /api/fuel; načítání null | 'load' | 'ok' | 'err'
  let fuelCc = 'CZ'; // země, jejíž cena paliva platí (z náhledu letišť – access.fuelCc ze serveru), jinak Česko
  const curFuel = () => $('#gmFuel .on')?.dataset.f || 'diesel';
  function loadFuel() {
    if (fuelState === 'load' || fuelState === 'ok') return;
    fuelState = 'load';
    api('api/fuel').then(j => {
      fuelInfo = j; fuelState = 'ok';
      // studený start serveru: náhled letišť mohl počítat s vestavěnou cenou – s aktuální ho přepočítat
      const e = SearchHelp.carEnergy(readCar(), j, fuelCc);
      if (e && carMode() && originPreview.some(a => { const x = SearchHelp.fuelItem(a.ground); return x && x.fuel === e.fuel && x.priceLabel !== e.priceLabel; })) refreshOrigins();
    }, () => { fuelState = 'err'; }).finally(carInfo);
  }
  // Pole spotřeby a ceny → paměť zvoleného pohonu (prázdná nebo nesmyslná spotřeba = výchozí, prázdná cena = aktuální).
  function readCar() {
    const c = SearchHelp.carOpts({ carFuel: curFuel(), carCons: $('#gmCons').value, carPrice: $('#gmPrice').value });
    carMem.carCons[c.carFuel] = c.carCons; carMem.carPrice[c.carFuel] = c.carPrice;
    return c;
  }
  const carForm = () => { const c = readCar(); return { carFuel: c.carFuel, carCons: { ...carMem.carCons }, carPrice: { ...carMem.carPrice } }; };
  // Uložený formulář (už převedený SearchHelp.groundForm) → paměť pohonů a pole.
  function setCar(f) {
    const m = carDefaults();
    for (const k of FUELS) {
      const c = SearchHelp.carOpts({ carFuel: k, carCons: f.carCons && f.carCons[k], carPrice: f.carPrice && f.carPrice[k] });
      m.carCons[k] = c.carCons; m.carPrice[k] = c.carPrice;
    }
    carMem = m;
    setCarFuel(f.carFuel);
  }
  // Pohon → přepínač, jednotky a meze polí, spotřeba a vlastní cena z paměti toho pohonu.
  function setCarFuel(fuel) {
    fuel = FUELS.includes(fuel) ? fuel : 'diesel';
    $$('#gmFuel button').forEach(b => { const on = b.dataset.f === fuel; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const f = SearchHelp.CAR_FUELS[fuel], cons = $('#gmCons'), price = $('#gmPrice');
    cons.min = f.consRange[0]; cons.max = f.consRange[1]; cons.value = carMem.carCons[fuel];
    price.min = f.priceRange[0]; price.max = f.priceRange[1]; price.value = carMem.carPrice[fuel] ?? '';
    $('#gmConsUnit').textContent = `${f.unit}/100 km`;
    $('#gmPriceUnit').textContent = `Kč/${f.unit}`;
    cons.setAttribute('aria-label', `Spotřeba (${f.unit} na 100 km)`);
    price.setAttribute('aria-label', `Vlastní cena (Kč za ${f.unit === 'l' ? 'litr' : 'kWh'}), prázdné = aktuální`);
    $('#gmWhat').textContent = fuel === 'ev' ? 'nabíjení' : 'palivo';
    $('#gmEvNote').hidden = fuel !== 'ev';
    carInfo();
  }
  // Řádek s aktuální cenou a Kč/km (s vlastní cenou, je-li zadaná). Bez /api/fuel aspoň z náhledu letišť (počítá server).
  function carInfo() {
    const line = $('#gmPriceLine'); if (!line) return;
    const c = readCar();
    const srv = originPreview.map(a => SearchHelp.fuelItem(a.ground)).find(x => x && !x.custom && x.fuel === c.carFuel && x.cons === c.carCons);
    const cur = SearchHelp.carEnergy({ ...c, carPrice: null }, fuelInfo, fuelCc) || srv || null;
    const e = c.carPrice ? SearchHelp.carEnergy(c, fuelInfo, fuelCc) : cur;
    line.textContent = cur ? SearchHelp.fuelLine(cur) : fuelState === 'err' ? 'aktuální cenu se nepodařilo načíst – počítám s poslední známou' : 'načítám aktuální cenu…';
    const ev = c.carFuel === 'ev' && fuelInfo && fuelInfo.ev;
    line.title = (ev ? `Nabíjení bez předplatného, Kč/kWh (stav ${SearchHelp.dm(ev.date)} ${ev.date.slice(0, 4)}): ${ev.operators.map(o => o.text).join(' · ')}. * ze sekundárních zdrojů. Cena se liší podle provozovatele, výkonu nabíječky a členství či předplatného – počítám ${ev.default} Kč/kWh (běžně ${ev.range.join('–')}).`
      : cur ? cur.priceLabel : '') + (c.carPrice ? ' Počítám s tvou vlastní cenou – aktuální je jen pro srovnání.' : '');
    line.classList.toggle('own', Boolean(c.carPrice)); // vlastní cena přebíjí aktuální
    $('#gmPrice').placeholder = cur ? SearchHelp.priceTxt(c.carFuel, cur.price) : '';
    $('#gmKm').textContent = e ? `≈ ${SearchHelp.kmTxt(e.kmCzk)} Kč/km${c.carPrice ? ' (vlastní cena)' : ''}` : '';
  }
  // Cesta autem: parkování podle délky cesty – v náhledu letišť typická délka z formuláře (null = jen tam, odvoz).
  function previewNights(f) {
    if (f.trip === 'oneway') return null;
    if (f.trip === 'multi') {
      const legs = (f.legs || []).filter(l => l.date), last = f.legs && f.legs[f.legs.length - 1];
      const home = last && idsOf(last.to) === idsOf(f.from);
      return home && legs.length >= 2 ? Math.max(0, SearchHelp.diffDays(legs[0].date, legs[legs.length - 1].date)) : null;
    }
    if (f.dateMode === 'exact') return f.xOut && f.xBack ? Math.max(0, SearchHelp.diffDays(f.xOut, f.xBack)) : 7;
    return Math.round(((+f.nMin || 0) + (+f.nMax || 0)) / 2);
  }
  // Doprava na letiště do dotazu: kmRate 0 = nepočítat; groundMode vždy (bez něj by server bral kmRate jako dřívější Kč/km).
  // Autem platí jen „započítat“ – skrytý násobek jízdného (třeba 0) cenu auta nevypne; pohon, spotřeba a vlastní cena
  // zvoleného pohonu (carFuel vždy – bez něj by server počítal dřívější Kč/km). Veřejnou dopravou 🏠 vlastní ceny na
  // letiště (S.accessOwn – nastavení zařízení, ne formuláře) jako accessOverride – starší server pole ignoruje; s jízdným
  // × 0 ne (doprava se nepočítá, server by je stejně nepoužil).
  const groundPayload = f => {
    const car = f.groundMode === 'car', own = !car && f.ground && +f.kmRate > 0 ? SearchHelp.ownClean(S.accessOwn) : null;
    return { kmRate: f.ground ? (car ? 1 : f.kmRate) : 0, groundMode: car ? 'car' : 'transit', ...(car ? SearchHelp.carPayload(f) : {}), ...(own ? { accessOverride: own } : {}) };
  };
  function payloadOf(f) {
    const exact = f.dateMode === 'exact';
    if (f.trip === 'multi') {
      // Víc měst: každý let zvlášť (odkud 1. letu = pole Odkud s okruhem letišť), zbytek jako u ostatních hledání.
      return {
        trip: 'multi', from: f.from.map(x => x.id), radiusKm: f.radius, adults: f.adults, maxPrice: f.maxPrice ? +f.maxPrice : null,
        directOnly: f.directOnly, ...groundPayload(f), arrival: f.arrival !== false, openJaw: f.openJaw, exclude: f.exclude, ...(BAG_LBL[f.bags] ? { bags: f.bags } : {}),
        legs: (f.legs || []).map((l, i) => ({ from: (i ? l.from : f.from).map(x => x.id), to: l.to.map(x => x.id), date: l.date, flexDays: +l.flex || 0 })),
      };
    }
    return {
      from: f.from.map(x => x.id), to: f.to.map(x => x.id), radiusKm: f.radius,
      dateFrom: f.dFrom, dateTo: f.dTo, trip: f.trip, nightsMin: f.nMin, nightsMax: f.nMax,
      outDays: exact ? [] : f.outDays, backDays: exact ? [] : f.backDays, adults: f.adults, maxPrice: f.maxPrice ? +f.maxPrice : null,
      directOnly: f.directOnly, ...groundPayload(f), arrival: f.arrival !== false, openJaw: f.openJaw, exclude: f.exclude,
      ...(!exact && f.depAfter ? { depAfter: f.depAfter } : {}),
      ...(f.minTemp ? { minTemp: +f.minTemp } : {}),
      ...(BAG_LBL[f.bags] ? { bags: f.bags } : {}),
      // Přesná data: server hledá jen odlet xOut a návrat xBack (± xFlex dní).
      ...(exact ? { exactOut: f.xOut, exactBack: f.trip === 'return' ? f.xBack : null, flexDays: f.xFlex || 0 } : {}),
    };
  }
  // Telefon: cesta, délka pobytu a teplota pod „Upřesnit“ – v tlačítku souhrn, co je nastavené; Víc měst ho otevře
  // (seznam letů se jinak nedá přepnout zpátky)
  let refineOpen = false;
  // fotka nahoře na Letech: jeden zadaný cíl (město, ostrov, země) – jinak krásné místo dne
  function paintFlHero() {
    const h = $('#flHero');
    if (!h || !window.Photos || !toInput) return;
    const one = toInput.items.length === 1 && !/^ct:/.test(toInput.items[0].id) ? toInput.items[0].label : '';
    const want = one || (window.heroPlace ? heroPlace(5) : 'Lisabon');
    if (h.dataset.photo === want) return;
    h.dataset.photo = want; h.classList.remove('ph'); h.style.removeProperty('--ph'); delete h.dataset.phw;
    Photos.paint(h.parentNode);
  }
  // telefon: letiště v okolí jen jako jeden řádek „6 letišť do 200 km · PRG, PED…“, posuvník a seznam po klepnutí
  function apSumPaint() {
    const b = $('#apSum'); if (!b) return;
    const on = originPreview.filter(a => !a.off);
    b.hidden = !on.length;
    if (!on.length) return;
    const n = on.length, codes = on.slice(0, 3).map(a => a.iata).join(', ') + (n > 3 ? '…' : '');
    b.innerHTML = `<span class="ap-n">${n} ${n === 1 ? 'letiště' : n <= 4 ? 'letiště' : 'letišť'} do ${+$('#radius').value} km</span><span class="ap-c">${esc(codes)}</span><span class="ap-chev" aria-hidden="true">▾</span>`;
    b.setAttribute('aria-expanded', String(apOpen));
  }
  // na telefonu se Cesta, Délka pobytu a Za teplem přesunou pod tlačítko (rozbalí se pod ním, ne nad ním); na širší obrazovce zpět
  const refineMq = matchMedia('(max-width:560px)');
  let refineMoved = null;
  function refinePlace() {
    const panel = $('#refinePanel');
    if (!panel) return;
    if (refineMq.matches && !refineMoved) {
      refineMoved = $$('#searchForm .sf-ref').map((el) => { const mark = document.createComment('sf-ref'); el.before(mark); panel.append(el); return [el, mark]; });
    } else if (!refineMq.matches && refineMoved) {
      refineMoved.forEach(([el, mark]) => mark.replaceWith(el));
      refineMoved = null;
    }
  }
  refineMq.addEventListener?.('change', refinePlace);
  function refineUi(multi) {
    refinePlace();
    const form = $('#searchForm'), btn = $('#refineBtn');
    if (!form || !btn) return;
    if (multi) refineOpen = true;
    form.classList.toggle('refine', refineOpen);
    btn.setAttribute('aria-expanded', String(refineOpen));
    if (!btn.onclick) btn.onclick = () => { refineOpen = !refineOpen; refineUi(false); };
    const word = el => (el ? el.textContent.replace(/^[^\p{L}≥]+/u, '').trim().toLowerCase() : '');
    const len = $('#lenField').style.display === 'none' ? '' : `${word($('#lenPreset .on'))} ${$('#nMin').value}–${$('#nMax').value} nocí`;
    const t = +($('#minTemp .on')?.dataset.t || 0);
    $('#refineSum').textContent = [word($('#tripType .on')), len, t ? `≥ ${t} °C` : ''].filter(Boolean).join(' · ');
  }
  function syncFormUI() {
    updateWatchBtn();
    const multi = $('#tripType .on').dataset.v === 'multi';
    const ret = $('#tripType .on').dataset.v === 'return';
    const exact = $('#dateMode .on').dataset.v === 'exact' && !multi;
    // Víc měst: místo Kam a termínu seznam letů; Odkud = začátek cesty (okruh letišť a doprava pro 1. let a návrat).
    $('#multiField').hidden = !multi;
    $('.sf-to').style.display = multi ? 'none' : '';
    $('#multiHint').hidden = !multi;
    $('#dateMode').style.display = $('#dateModeLbl').style.display = multi ? 'none' : '';
    $('#fromHint').textContent = multi ? 'začátek cesty – okruh letišť a doprava platí pro 1. let a návrat domů' : 'město, letiště, země nebo tvoje poloha';
    $('#lenField').style.display = ret && !exact ? '' : 'none';
    syncHoliday();
    $('#flexField').style.display = exact || multi ? 'none' : '';
    $('#exactField').hidden = !exact;
    $('#xBackWrap').style.display = ret ? '' : 'none';
    $('#xBackLbl').style.display = ret ? '' : 'none';
    // Dny v týdnu při přesných datech nedávají smysl.
    $('#backDaysField').style.display = ret && !exact ? '' : 'none';
    $('#outDays').closest('.field').style.display = exact || multi ? 'none' : '';
    if (exact) {
      const out = $('#xOut').value, back = $('#xBack').value, fl = +($('#xFlex .on')?.dataset.f || 0);
      const n = out && back ? Math.round((new Date(back) - new Date(out)) / 864e5) : null;
      $('#xInfo').textContent = !out ? 'Vyber datum odletu.'
        : ret && (!back || n < 0) ? '⚠️ Návrat musí být stejný den nebo po odletu.'
        : ret ? `${fmtDate(out)} → ${fmtDate(back)} · ${n === 0 ? 'týž den' : n === 1 ? '1 noc' : n <= 4 ? n + ' noci' : n + ' nocí'}${fl ? ` · každé datum ± ${fl} ${fl === 1 ? 'den' : 'dny'}` : ' · jen tyto dva dny'}`
        : `odlet ${fmtDate(out)}${fl ? ` ± ${fl} ${fl === 1 ? 'den' : 'dny'}` : ' · jen tento den'}`;
    }
    refineUi(multi);
    paintFlHero();
    const f = getForm();
    const bits = [];
    if (f.adults !== 1) bits.push(`${f.adults} os.`);
    if (f.maxPrice) bits.push(`do ${czk(+f.maxPrice)}`);
    $('.gm-field').classList.toggle('gm-off', !f.ground);
    if (!f.ground) bits.push('bez dopravy na letiště');
    else if (f.groundMode === 'car') bits.push(`🚗 na letiště autem (${FUEL_SHORT[f.carFuel] || 'nafta'})`);
    else if (+f.kmRate > 0) { // s jízdným × 0 se doprava nepočítá – ani vlastní ceny (seznam 🏠 je schovaný)
      const own = SearchHelp.ownClean(S.accessOwn) || {}, ks = originPreview.filter(a => !a.off && Object.hasOwn(own, a.iata)).map(a => a.iata);
      if (ks.length) bits.push(`🏠 vlastní cena na letiště ${ks.join(', ')}`);
    }
    if (f.arrival === false) bits.push('bez cesty z letiště do města');
    if (f.directOnly) bits.push('jen přímé');
    if (BAG_LBL[f.bags]) bits.push('🧳 ' + BAG_LBL[f.bags]);
    if (f.outDays.length && !multi) bits.push('odlet ' + f.outDays.map(d => DOW[d]).join(','));
    syncDepAfter();
    if (f.depAfter) bits.push(`${fmtDate(f.depAfter.date)} odlet od ${f.depAfter.time}`);
    $('#moreSummary').textContent = bits.length ? '· ' + bits.join(' · ') : '';
    $('#quickDest').querySelectorAll('[data-any]').forEach(b => b.classList.toggle('on', !toInput.items.length));
  }
  /* Délka pobytu → 🎉 Svátky: termín prodlouženého víkendu jako karta radaru (SearchHelp.holidayDates) */
  let lwPick = null; // začátek víkendu vybraného ve formuláři (výchozí při dalším klepnutí na 🎉 Svátky)
  let preHoliday = null; // termín před 🎉 Svátky – jiná předvolba délky ho vrátí (Svátky jako jediná mění data)
  const holidayOn = () => $('#lenPreset .on')?.dataset.v === 'holiday';
  // formulář pořád drží termín svátku (i po přepnutí na Vlastní úpravou nocí nebo dnů) – jiná předvolba ho má vrátit
  const inHoliday = () => holidayOn() || Boolean(preHoliday && SearchHelp.holidayOf({ dFrom: $('#dFrom').value, dTo: $('#dTo').value }, today()));
  /** Ruční změna data ve Svátcích: dny odletu a návratu patřily svátku – pryč s nimi. */
  function leaveHolidayDays() { if (holidayOn()) $$('#outDays button, #backDays button').forEach(x => x.classList.remove('on')); }
  function applyHoliday(start) {
    const list = SearchHelp.holidayList(today());
    const lw = list.find(x => x.start === start) || list.find(x => x.start === lwPick) || list.find(x => x.start === S.radarHoliday) || list[0];
    if (!lw) { toast('V příštích 5 měsících není prodloužený víkend kolem svátku'); return applyPreset('custom'); }
    const h = SearchHelp.holidayDates(lw, today());
    if (!inHoliday()) preHoliday = { dFrom: $('#dFrom').value, dTo: $('#dTo').value, nMin: $('#nMin').value, nMax: $('#nMax').value };
    lwPick = lw.start;
    $$('#lenPreset button').forEach(b => b.classList.toggle('on', b.dataset.v === 'holiday'));
    $('#nMin').value = h.nMin; $('#nMax').value = h.nMax; $('#dFrom').value = h.dFrom; $('#dTo').value = h.dTo;
    $$('#outDays button').forEach(b => b.classList.toggle('on', h.outDays.includes(+b.dataset.d)));
    $$('#backDays button').forEach(b => b.classList.toggle('on', h.backDays.includes(+b.dataset.d)));
    depAfterVal = h.depAfter; $('#depAfterOn').checked = true;
    syncFormUI();
    if (carMode()) refreshOrigins(); // parkování podle počtu nocí
  }
  /** Čipy víkendů pod 🎉 Svátky; upravený termín (datum, „2 týdny“…) předvolbu zruší → Vlastní. */
  function syncHoliday() {
    const box = $('#lenLw'), hint = $('#lenLwHint');
    let on = $('#lenPreset .on')?.dataset.v === 'holiday';
    const vis = on && $('#lenField').style.display !== 'none';
    const cur = vis ? SearchHelp.holidayOf({ dFrom: $('#dFrom').value, dTo: $('#dTo').value }, today()) : null;
    if (vis && !cur) {
      // termín už není víkend se svátkem (jiné datum, víkend minul): Vlastní. Dny odletu a návratu zůstanou – uložené
      // hledání (Nedávno, start aplikace) se tak zopakuje přesně; při ruční změně data je smaže leaveHolidayDays.
      on = false;
      $$('#lenPreset button').forEach(x => x.classList.toggle('on', x.dataset.v === 'custom'));
    }
    box.hidden = hint.hidden = !(vis && cur);
    if (box.hidden) return;
    lwPick = cur.start;
    box.innerHTML = SearchHelp.holidayList(today()).map(x => `<button type="button" class="fchip ${x.start === cur.start ? 'on' : ''}" data-lw="${x.start}" aria-pressed="${x.start === cur.start}" title="${esc(x.name)}${x.bridge ? ` – s volnem ${SearchHelp.dm(x.bridge)}` : ''}">🎉 ${SearchHelp.dmRange(x.start, x.end)} <small>${esc(x.name)}</small></button>`).join('');
    $$('[data-lw]', box).forEach(b => b.onclick = () => applyHoliday(b.dataset.lw));
    hint.textContent = SearchHelp.holidayHint(cur, today());
  }
  function applyPreset(k) {
    if (k === 'holiday') return applyHoliday();
    if (inHoliday()) {
      // ze Svátků jinam: zpět původní termín (nebo výchozí), bez dvoudenního okna a pravidla „odlet od 16:00“
      const r = preHoliday && preHoliday.dTo >= today() ? preHoliday : { dFrom: addDays(today(), 7), dTo: addDays(today(), 60) };
      $('#dFrom').value = [today(), r.dFrom].sort()[1]; $('#dTo').value = r.dTo;
      // i bez dnů odletu a návratu svátku (jako leaveHolidayDays) a s původním počtem nocí (Vlastní žádné nemá)
      $$('#outDays button, #backDays button').forEach(x => x.classList.remove('on'));
      if (r.nMin) { $('#nMin').value = r.nMin; $('#nMax').value = r.nMax; }
      depAfterVal = null; preHoliday = null;
    }
    const p = PRESETS[k];
    $$('#lenPreset button').forEach(b => b.classList.toggle('on', b.dataset.v === k));
    if (p) {
      $('#nMin').value = p.nMin; $('#nMax').value = p.nMax;
      $$('#outDays button').forEach(b => b.classList.toggle('on', p.out.includes(+b.dataset.d)));
      $$('#backDays button').forEach(b => b.classList.toggle('on', p.back.includes(+b.dataset.d)));
    }
    syncFormUI();
  }
  /* Délka pobytu → 🗓️ Kdy si vzít dovolenou: nejvíc volna kolem svátků za nejmíň dní dovolené (SearchHelp.leaveWindows) */
  function openLeavePlan() {
    const max = [1, 2, 3, 4, 5].includes(S.leaveMax) ? S.leaveMax : 2, now = today();
    const list = SearchHelp.leaveWindows(now, { maxLeave: max });
    const dny = n => n === 1 ? 'den' : n <= 4 ? 'dny' : 'dní';
    // ★ u oken s nejvíc dny volna na den dovolené: dvě nejlepší a ta, co jsou s druhým stejně dobrá; mají-li všechna stejně, žádné
    const ratio = w => w.days / w.leave.length, paid = list.filter(w => w.leave.length);
    const ranks = paid.map(ratio).sort((a, b) => b - a), thr = ranks.length > 2 ? ranks[1] : Infinity;
    const star = w => w.leave.length > 0 && ratio(w) >= thr && ranks.some(r => r < thr);
    const yr = w => (w.start.slice(0, 4) !== now.slice(0, 4) ? ` ${w.start.slice(0, 4)}` : '');
    modalOpen(`<div class="modal-body"><div class="row lw-head"><h3>🗓️ Kdy si vzít dovolenou</h3><button type="button" class="icon-btn" onclick="modalClose()" aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button></div>
      <div class="lw-max"><span class="faint">Dovolená nejvýš:</span><div class="seg wrap" id="lwMax">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-lm="${n}" class="${n === max ? 'on' : ''}" aria-pressed="${n === max}">${n} ${dny(n)}</button>`).join('')}</div></div>
      ${list.length ? list.map((w, i) => `<div class="lw-row"><div><b>${SearchHelp.dmRange(w.start, w.end)}${yr(w)}</b> · ${w.days} ${dny(w.days)} volna ${w.leave.length ? `za ${w.leave.length} ${dny(w.leave.length)} dovolené` : 'bez dovolené'}${star(w) ? ' <span class="b good">★ nejvíc volna na den dovolené</span>' : ''}<div class="faint">🎉 ${esc(w.name)}${w.leave.length ? ` · dovolená: ${w.leave.map(d => dayLabel(d).replace(/ /g, '\u00a0')).join(', ')}` : ''}</div></div><button type="button" class="btn sm" data-lwgo="${i}">✈️ Hledat lety</button></div>`).join('')
        : '<div class="note info">🗓️ <div>V příštích 12 měsících nic – zkus víc dní dovolené.</div></div>'}
      <div class="faint lw-foot">Volno = víkendy a svátky ČR (státní i ostatní – dny pracovního klidu podle zákona č. 245/2000 Sb., Velikonoce výpočtem). Odletět můžeš už večer před prvním volným dnem (od 16:00), vrátit se poslední volný den.</div></div>`);
    $$('#lwMax [data-lm]').forEach(b => b.onclick = () => { S.leaveMax = +b.dataset.lm; save(); openLeavePlan(); });
    // jako čip 🎉 Svátky: termín okna (odlet večer předem od 16:00, návrat poslední volný den) a jedno hledání
    $$('#modal [data-lwgo]').forEach(b => b.onclick = () => {
      const w = list[+b.dataset.lwgo];
      modalClose(); go('flights');
      setForm({ ...getForm(), dateMode: 'flex', trip: 'return', len: 'custom', ...SearchHelp.holidayDates(w, today()) });
      startSearch();
    });
  }

  /* ---------- cesta přes víc měst: seznam letů ve formuláři ---------- */
  const ML_MAX = 4;
  const ML_FLEX = [[0, 'přesně'], [1, '± 1 den'], [2, '± 2 dny'], [3, '± 3 dny']];
  let mlRows = []; // [{ el, from: PlaceInput | null (1. let = pole Odkud nahoře), to: PlaceInput, prevTo }]
  let mlTouched = false; // lety upravené uživatelem (jinak se při přepnutí na Víc měst předvyplní z formuláře)
  let mlHomeIds = ''; // Odkud při posledním překreslení – návrat domů ho následuje
  const idsOf = items => (items || []).map(x => x.id).sort().join('|');
  const homeTxt = () => fromInput.items.length ? `📍 ${esc(fromInput.items.map(x => x.label).join(', '))} <span>+${+$('#radius').value} km</span>` : '<span>📍 vyplň Odkud nahoře</span>';

  /** Lety z formuláře: [{ from, to, date, flex }] (odkud 1. letu = pole Odkud). */
  function mlRead() {
    return mlRows.map((r, i) => ({
      from: (i ? r.from : fromInput).items.slice(), to: r.to.items.slice(),
      date: $('.ml-date', r.el).value, flex: +$('.ml-flex', r.el).value || 0,
    }));
  }
  /** Výchozí 2 lety podle formuláře: tam do cíle (Kam), zpět domů (Kam druhého letu = Odkud). */
  function mlDefaults(f) {
    const d1 = f.xOut && f.xOut >= today() ? f.xOut : addDays(today(), 14);
    const d2 = f.xBack && f.xBack > d1 ? f.xBack : addDays(d1, 7);
    return [{ from: f.from, to: f.to || [], date: d1, flex: 0 }, { from: f.to || [], to: f.from, date: d2, flex: 0 }];
  }
  /** Lety z uloženého formuláře (setForm); termín v minulosti se posune celý (zachová rozestupy). */
  function mlSet(f) {
    const legs = (f.legs || []).filter(l => l && Array.isArray(l.to)).slice(0, ML_MAX);
    mlTouched = legs.length >= 2;
    if (!mlTouched) return mlRender(mlDefaults(f));
    const first = legs[0].date;
    if (first && first < today()) {
      const shift = SearchHelp.diffDays(first, addDays(today(), 14));
      legs.forEach(l => { if (l.date) l.date = addDays(l.date, shift); });
    }
    mlRender(legs.map(l => ({ ...l, from: l.from || [], to: l.to || [] })));
  }
  function mlRender(legs) {
    const host = $('#mlList');
    mlHomeIds = idsOf(fromInput.items);
    host.innerHTML = legs.map((l, i) => `<div class="ml-row" data-ml="${i}">
      <span class="ml-n" aria-hidden="true">${i + 1}</span>
      <div class="ml-f"><span class="ml-lab">${i + 1}. let – odkud</span>${i ? '<div class="place-input ml-from"></div>'
        : `<button type="button" class="ml-home" title="Začátek cesty (i okruh letišť) se mění v poli Odkud nahoře">${homeTxt()}</button>`}</div>
      <div class="ml-f"><span class="ml-lab">kam</span><div class="place-input ml-to"></div></div>
      <div class="ml-f ml-when"><span class="ml-lab">datum</span><div class="ml-dt"><input class="input ml-date" type="date" min="${today()}" value="${esc(l.date || '')}" aria-label="Datum ${i + 1}. letu"><select class="ml-flex" aria-label="Tolerance data ${i + 1}. letu">${ML_FLEX.map(([v, t]) => `<option value="${v}" ${+l.flex === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <button type="button" class="ml-del" data-mldel="${i}" ${legs.length <= 2 ? 'disabled' : ''} aria-label="Odebrat ${i + 1}. let" title="Odebrat let">✕</button>
    </div>`).join('');
    mlRows = legs.map((l, i) => {
      const el = $(`[data-ml="${i}"]`, host);
      const row = { el, from: null, to: null, prevTo: idsOf(l.to) };
      if (i) row.from = new PlaceInput($('.ml-from', el), { placeholder: 'Město nebo letiště', max: 3, onChange: () => { mlTouched = true; mlInfo(); formEdited(); } });
      row.to = new PlaceInput($('.ml-to', el), { placeholder: i === legs.length - 1 ? 'Město – nebo zpět domů' : 'Město nebo letiště', max: 3, onChange: () => { mlFollow(i); formEdited(); } });
      if (row.from) row.from.set(l.from || [], true);
      row.to.set(l.to || [], true);
      $('.ml-flex', el).onchange = () => { mlTouched = true; mlInfo(); };
      $('.ml-date', el).onchange = () => { mlTouched = true; mlShift(i); mlInfo(); };
      row.date = l.date || '';
      return row;
    });
    $$('[data-mldel]', host).forEach(b => b.onclick = () => { const legs = mlRead(); legs.splice(+b.dataset.mldel, 1); mlTouched = true; mlRender(legs); formEdited(); });
    $$('.ml-home', host).forEach(b => b.onclick = () => fromInput.input.focus());
    $('#mlAdd').disabled = legs.length >= ML_MAX;
    mlInfo();
  }
  // Posun data letu za pozdější let → pozdější lety se posunou o stejně dní (zachová se délka pobytů), jinak nic.
  function mlShift(i) {
    const row = mlRows[i], d = $('.ml-date', row.el).value, prev = row.date;
    row.date = d;
    const later = mlRows.slice(i + 1);
    if (!d || !prev || !later.some(r => r.date && r.date < d)) return;
    const delta = SearchHelp.diffDays(prev, d);
    for (const r of later) if (r.date) { r.date = addDays(r.date, delta); $('.ml-date', r.el).value = r.date; }
  }
  // Nový cíl letu → odkud dalšího letu ho následuje (bylo-li to dosud jeho výchozí místo nebo prázdné).
  function mlFollow(i) {
    mlTouched = true;
    const row = mlRows[i], next = mlRows[i + 1];
    if (next && next.from && (!next.from.items.length || idsOf(next.from.items) === row.prevTo)) next.from.set(row.to.items.slice(), true);
    row.prevTo = idsOf(row.to.items);
    mlInfo();
  }
  // Změna Odkud (nebo okruhu) nahoře: popisek 1. letu a návrat domů, který vedl do původního Odkud.
  function mlHomeChanged() {
    const b = $('#mlList .ml-home');
    if (b) b.innerHTML = homeTxt();
    const last = mlRows[mlRows.length - 1], ids = idsOf(fromInput.items);
    if (last && ids !== mlHomeIds && idsOf(last.to.items) === mlHomeIds) { last.to.set(fromInput.items.slice(), true); last.prevTo = ids; }
    mlHomeIds = ids;
    mlInfo();
  }
  function mlAdd() {
    const legs = mlRead();
    if (legs.length >= ML_MAX) return;
    const last = legs[legs.length - 1], prev = legs[legs.length - 2];
    let at = legs.length;
    if (prev && idsOf(last.to) === idsOf(fromInput.items)) {
      // poslední let vede domů → nové město patří před něj (Praha → Řím → [nové] → Praha)
      const gap = prev.date && last.date ? SearchHelp.diffDays(prev.date, last.date) : 6;
      legs.splice(at = legs.length - 1, 0, { from: prev.to, to: [], date: prev.date ? addDays(prev.date, Math.max(0, Math.floor(gap / 2))) : '', flex: 0 });
      last.from = [];
    } else {
      legs.push({ from: last.to, to: [], date: last.date ? addDays(last.date, 3) : '', flex: 0 });
    }
    mlTouched = true;
    mlRender(legs); formEdited();
    mlRows[at].to.input.focus();
  }
  /** Rychlá volba: tam do jednoho města, zpět z jiného (2 lety A → B, C → A). */
  function mlOpenJaw() {
    const legs = mlRead(), f = getForm();
    const to = (legs[0] && legs[0].to.length ? legs[0].to : f.to) || [];
    const d1 = legs[0] && legs[0].date >= today() ? legs[0].date : addDays(today(), 14);
    const d2 = legs[1] && legs[1].date > d1 ? legs[1].date : addDays(d1, 7);
    mlTouched = true;
    mlRender([{ from: f.from, to, date: d1, flex: 0 }, { from: [], to: f.from, date: d2, flex: 0 }]); formEdited();
    (to.length ? mlRows[1].from : mlRows[0].to).input.focus();
    toast(to.length ? 'Zadej, odkud se vracíš – třeba jiné město v okolí' : 'Zadej, kam letíš a odkud se vracíš');
  }
  /** První chyba v letech → { msg, el } (prvek k zaměření), jinak null. */
  function mlProblem(legs) {
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i], r = mlRows[i], n = `${i + 1}.`;
      if (!l.from.length) return { msg: i ? `Zadej, odkud je ${n} let` : 'Zadej, odkud letíš (pole Odkud)', el: i ? r.from.input : fromInput.input };
      if (!l.to.length) return { msg: `Zadej, kam je ${n} let`, el: r.to.input };
      if (!l.date || l.date < today()) return { msg: `Zadej datum ${n} letu (dnes nebo později)`, el: $('.ml-date', r.el) };
      if (i && legs[i - 1].date && l.date < legs[i - 1].date) return { msg: `${n} let nesmí být dřív než ${i}. – seřaď lety podle data`, el: $('.ml-date', r.el) };
    }
    return null;
  }
  function mlInfo() {
    const el = $('#mlInfo'); if (!el || !mlRows.length) return;
    const legs = mlRead();
    const bad = legs.findIndex((l, i) => i && l.date && legs[i - 1].date && l.date < legs[i - 1].date);
    const dates = legs.map(l => l.date).filter(Boolean);
    el.textContent = bad > 0 ? `⚠️ ${bad + 1}. let je dřív než ${bad}. – lety musí jít po sobě.`
      : dates.length === legs.length ? `${plural(legs.length, 'let', 'lety', 'letů')} · ${fmtDate(dates[0])} → ${fmtDate(dates[dates.length - 1])} · lety se stejným letištěm páruju s rezervou aspoň 3 h, přejezd jinam nejdřív další den`
        : 'Vyplň datum každého letu.';
  }

  const refreshOrigins = debounce(async () => {
    const f = getForm();
    const host = $('#originPills');
    if (!f.from.length) { originPreview = []; apSumPaint(); host.innerHTML = '<span class="faint">Zadej, odkud letíš – třeba „Brno“, „Vídeň“, „Česko“ nebo použij 📍 polohu.</span>'; return; }
    try {
      // cesta na letiště jako v hledání: veřejnou dopravou na osobu tam, autem tam i zpět s parkováním na typickou délku cesty
      const nights = previewNights(f), g = groundPayload(f);
      const qs = f.from.map(x => 'from=' + enc(x.id)).join('&') + `&radius=${f.radius}&kmRate=${g.kmRate}&groundMode=${g.groundMode}`
        + (g.carFuel ? `&carFuel=${g.carFuel}&carCons=${g.carCons}${g.carPrice ? `&carPrice=${g.carPrice}` : ''}` : '')
        + (g.accessOverride ? `&own=${enc(SearchHelp.ownQs(g.accessOverride))}` : '')
        + `&adults=${f.adults}&trip=${nights == null ? 'oneway' : 'return'}${nights == null ? '' : `&nights=${nights}`}`;
      const j = await api('api/origins?' + qs);
      const prevOff = new Set([...originPreview.filter(a => a.off).map(a => a.iata), ...pendingExclude]);
      pendingExclude = new Set();
      originPreview = j.airports.map(a => ({ ...a, off: prevOff.has(a.iata) }));
      fuelCc = (j.access && j.access.fuelCc) || 'CZ'; // cena paliva v zemi domova – stejná země jako na serveru
      carInfo();
      const max = health?.maxOrigins || 8;
      // která se prohledají: prvních max zapnutých v pořadí serveru (zadané, pak blízká s víc cestujícími)
      const markOver = () => {
        const used = new Set(originPreview.filter(a => !a.off).sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99)).slice(0, max).map(a => a.iata));
        $$('[data-op]', host).forEach(b => b.classList.toggle('over', !used.has(b.dataset.op) && !b.classList.contains('off')));
      };
      host.innerHTML = originPreview.map((a, i) => {
        const l = SearchHelp.accessLabel(a.ground, { nights });
        return `<button type="button" class="opill ${a.off ? 'off' : ''}${i >= 2 ? ' extra' : ''}" data-op="${a.iata}" title="${esc(a.name)}${l ? ` · ${esc(l.title)}` : a.ground ? ` · cesta ~${hm(a.ground.minutes)}` : ''}">
        <b>${a.iata}</b> <span class="n">${esc(a.city)}</span>${a.distKm ? ` <span>${a.distKm} km</span>` : ''}${l ? ` <span class="g">${esc(l.text)}</span>` : ''}</button>`;
      }).join('')
        + (originPreview.length > max ? `<span class="faint" style="font-size:12px" title="Přednost mají blízká letiště, odkud se hodně létá; malá letiště s pár linkami jen když zbude místo.">prohledá se ${max} – blízká a větší mají přednost</span>` : '');
      // telefon: jen 2 letiště, zbytek tlačítkem (formulář je jinak přes celou obrazovku)
      if (originPreview.length > 2) {
        const n = originPreview.length - 2;
        host.insertAdjacentHTML('beforeend', `<button type="button" class="op-more" id="opMore">${apOpen ? 'Méně letišť ▴' : `+ ${n} ${n === 1 ? 'další letiště' : n <= 4 ? 'další letiště' : 'dalších letišť'} ▾`}</button>`);
        host.classList.toggle('open', apOpen);
        $('#opMore', host).onclick = () => { apOpen = !apOpen; host.classList.toggle('open', apOpen); $('#opMore', host).textContent = apOpen ? 'Méně letišť ▴' : `+ ${n} ${n <= 4 ? 'další letiště' : 'dalších letišť'} ▾`; };
      }
      markOver();
      renderOwn();
      apSumPaint();
      syncFormUI();
      $$('[data-op]', host).forEach(b => b.onclick = () => { const a = originPreview.find(x => x.iata === b.dataset.op); a.off = !a.off; b.classList.toggle('off', a.off); markOver(); renderOwn(); apSumPaint(); formEdited(); });
    } catch (e) { host.innerHTML = `<span class="faint">Náhled letišť nedostupný (${esc(e.message)})</span>`; renderOwn(); }
  }, 200);

  /* ---------- 🏠 Moje cena na letiště: vlastní cena veřejnou dopravou tam na osobu místo odhadu ---------- */
  // S.accessOwn = { IATA: Kč } – nastavení zařízení (i v záloze), do hledání jako accessOverride; nejvýš 12 letišť
  // (nejstarší zadané mimo náhled ustoupí novému). Seznam = zapnutá letiště z náhledu, placeholder = odhad serveru.
  function renderOwn() {
    const box = $('#gmOwn'), list = $('#gmOwnList');
    if (!box) return;
    const aps = originPreview.filter(a => !a.off && a.ground && a.ground.mode === 'transit' && !a.ground.off);
    box.hidden = !aps.length;
    const own = S.accessOwn || {};
    const item = a => {
      const g = a.ground, est = g.own ? g.estCzk : g.czk, v = Object.hasOwn(own, a.iata) ? own[a.iata] : '';
      return { v, est, title: `${a.name} – odhad ~${czk(est)} na osobu tam${v !== '' ? `, počítám s tvou cenou ${czk(v)}` : ''}` };
    };
    // stejná letiště: jen doplnit (pole, do kterého se zrovna píše, zůstane – Tab z jednoho pole do druhého)
    const cur = $$('[data-own]', list);
    if (cur.length === aps.length && cur.every((inp, i) => inp.dataset.own === aps[i].iata)) {
      cur.forEach((inp, i) => {
        const x = item(aps[i]), lb = inp.closest('label');
        inp.placeholder = `~${x.est}`; lb.title = x.title; lb.classList.toggle('on', x.v !== '');
        if (document.activeElement !== inp) inp.value = x.v;
      });
      return;
    }
    list.innerHTML = aps.map(a => {
      const x = item(a);
      return `<label class="gm-in gm-own-it${x.v !== '' ? ' on' : ''}" title="${esc(x.title)}"><b>${a.iata}</b><input class="input xs" type="number" min="0" max="${SearchHelp.OWN_MAX_CZK}" step="1" inputmode="numeric" data-own="${a.iata}" value="${x.v}" placeholder="~${x.est}" aria-label="Moje cena na letiště ${a.iata} (Kč na osobu tam, prázdné = odhad)"> Kč</label>`;
    }).join('');
    $$('[data-own]', list).forEach(inp => inp.onchange = () => setOwn(inp.dataset.own, inp));
  }
  function setOwn(iata, inp) {
    const raw = inp.value.trim(), own = { ...(S.accessOwn || {}) }, n = Number(raw);
    if (raw === '') delete own[iata];
    else if (!Number.isInteger(n) || n < 0 || n > SearchHelp.OWN_MAX_CZK) {
      toast(`Cena na letiště: celé koruny od 0 do ${SearchHelp.OWN_MAX_CZK.toLocaleString('cs-CZ')} Kč`, 'err');
      inp.value = Object.hasOwn(own, iata) ? own[iata] : '';
      return;
    } else {
      if (!Object.hasOwn(own, iata) && Object.keys(own).length >= SearchHelp.OWN_MAX) {
        // nejstarší mimo náhled (jinak by ji šlo smazat jen s jiným Odkud) ustoupí – a řekne se která
        const shown = new Set(originPreview.map(a => a.iata)), old = Object.keys(own).find(k => !shown.has(k));
        if (!old) { toast(`Vlastní cenu jde zadat nejvýš u ${SearchHelp.OWN_MAX} letišť – smaž některou jinou`, 'err'); inp.value = ''; return; }
        toast(`Vlastní cenu jde mít nejvýš u ${SearchHelp.OWN_MAX} letišť – nejstarší (${old} ${czk(own[old])}) jsem smazal`);
        delete own[old];
      }
      delete own[iata]; own[iata] = n; // naposledy zadané na konci (nejstarší ustoupí první)
    }
    S.accessOwn = own; save();
    refreshOrigins(); formEdited();
  }

  function buildForm() {
    fromInput = new PlaceInput($('#fromInput'), { origin: true, placeholder: 'Např. Brno, Vídeň, Česko, Jihlava…', onChange: () => { refreshOrigins(); updateHomeChip(); mlHomeChanged(); formEdited(); } });
    toInput = new PlaceInput($('#toInput'), { placeholder: 'Kamkoliv 🌍, nebo „k moři v květnu“', onChange: () => { syncFormUI(); formEdited(); }, near: () => (fromInput.items[0] && fromInput.items[0].id) || (S.home && S.home.from && S.home.from[0] && S.home.from[0].id) || '',
      smart: { run: hit => smartRun(hit, fromInput.items), tips: () => smartTips(() => fromInput.items) } });
    // ⇅ prohodit Odkud a Kam (světadíl do Odkud nejde)
    $('#swapBtn').onclick = () => {
      const a = fromInput.items.slice(), b = toInput.items.slice();
      if (!b.length) return toast('Nejdřív vyplň Kam – pak Odkud a Kam prohodím');
      if (b.some(x => /^ct:/.test(x.id))) return toast('Světadíl nejde dát do Odkud – vyber zemi nebo město', 'err');
      fromInput.set(b); toInput.set(a);
    };
    $('#apSum').onclick = () => {
      apOpen = !apOpen;
      $('.sf-from').classList.toggle('ap-open', apOpen); $('#originPills').classList.toggle('open', apOpen);
      apSumPaint();
    };
    $('#outDays').innerHTML = DOW_ORDER.map(d => `<button type="button" data-d="${d}">${DOW[d]}</button>`).join('');
    $('#backDays').innerHTML = DOW_ORDER.map(d => `<button type="button" data-d="${d}">${DOW[d]}</button>`).join('');
    $$('#outDays button, #backDays button').forEach(b => b.onclick = () => { b.classList.toggle('on'); $$('#lenPreset button').forEach(x => x.classList.toggle('on', x.dataset.v === 'custom')); syncFormUI(); });
    $$('#tripType button').forEach(b => b.onclick = () => {
      // první přepnutí na Víc měst: lety podle aktuálního formuláře (tam do cíle, zpět domů)
      if (b.dataset.v === 'multi' && !mlTouched) mlRender(mlDefaults(getForm()));
      $$('#tripType button').forEach(x => x.classList.toggle('on', x === b)); syncFormUI();
    });
    $('#mlAdd').onclick = mlAdd;
    $('#mlOpenJaw').onclick = mlOpenJaw;
    $$('#dateMode button').forEach(b => b.onclick = () => { $$('#dateMode button').forEach(x => x.classList.toggle('on', x === b)); syncFormUI(); });
    $$('#xFlex button').forEach(b => b.onclick = () => { $$('#xFlex button').forEach(x => x.classList.toggle('on', x === b)); syncFormUI(); });
    $$('#minTemp button').forEach(b => b.onclick = () => { setMinTemp(b.dataset.t); formEdited(); });
    $$('#bags button').forEach(b => b.onclick = () => { setBags(b.dataset.b); syncFormUI(); });
    $('#xOut').min = today(); $('#xBack').min = today();
    $('#xOut').onchange = () => {
      // Posun odletu posune i návrat (zachová počet nocí), ať návrat není před odletem.
      const prev = $('#xOut').dataset.prev, back = $('#xBack').value, out = $('#xOut').value;
      if (prev && back && out) { const n = Math.round((new Date(back) - new Date(prev)) / 864e5); if (n >= 0) $('#xBack').value = addDays(out, n); }
      $('#xOut').dataset.prev = out; syncFormUI();
    };
    $('#xOut').onfocus = () => { $('#xOut').dataset.prev = $('#xOut').value; };
    $('#xBack').onchange = syncFormUI;
    $$('#lenPreset button').forEach(b => b.onclick = () => applyPreset(b.dataset.v));
    $('#leavePlan').onclick = openLeavePlan;
    ['#nMin', '#nMax'].forEach(s => $(s).oninput = () => { $$('#lenPreset button').forEach(x => x.classList.toggle('on', x.dataset.v === 'custom')); syncHoliday(); });
    $('#radius').oninput = () => { $('#radiusVal').textContent = $('#radius').value + ' km'; refreshOrigins(); updateHomeChip(); mlHomeChanged(); };
    ['#groundOn', '#kmRate'].forEach(s => $(s).onchange = () => { refreshOrigins(); syncFormUI(); });
    $$('#groundMode button').forEach(b => b.onclick = () => { setGroundMode(b.dataset.g); refreshOrigins(); syncFormUI(); });
    // autem: pohon (spotřeba a vlastní cena se pamatují pro každý zvlášť), spotřeba, vlastní cena
    $$('#gmFuel button').forEach(b => b.onclick = () => { readCar(); setCarFuel(b.dataset.f); refreshOrigins(); syncFormUI(); });
    ['#gmCons', '#gmPrice'].forEach(s => {
      $(s).oninput = carInfo;
      $(s).onchange = () => { const c = readCar(); $('#gmCons').value = c.carCons; $('#gmPrice').value = c.carPrice ?? ''; carInfo(); refreshOrigins(); syncFormUI(); };
    });
    ['#maxPrice', '#directOnly', '#arrivalOn', '#depAfterOn'].forEach(s => $(s).onchange = syncFormUI);
    ['#dFrom', '#dTo'].forEach(s => $(s).onchange = () => { leaveHolidayDays(); syncFormUI(); });
    $('#openJaw').onchange = () => { if (!carMode()) ojPref = $('#openJaw').checked; syncFormUI(); };
    // autem: cena na osobu a parkování závisí na počtu cestujících a délce cesty
    $('#adults').onchange = () => { syncFormUI(); if (carMode()) refreshOrigins(); };
    ['#nMin', '#nMax', '#xOut', '#xBack'].forEach(s => $(s).addEventListener('change', () => { if (carMode()) refreshOrigins(); }));
    $$('#tripType button, #dateMode button, #lenPreset button').forEach(b => b.addEventListener('click', () => { if (carMode()) refreshOrigins(); }));
    $$('#quickRange button').forEach(b => b.onclick = () => {
      leaveHolidayDays();
      if (b.dataset.m) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
        const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        $('#dFrom').value = fmtYMD(d); $('#dTo').value = fmtYMD(e);
      } else {
        const from = $('#dFrom').value && $('#dFrom').value >= today() ? $('#dFrom').value : addDays(today(), 3);
        $('#dFrom').value = from; $('#dTo').value = addDays(from, +b.dataset.d);
      }
      syncFormUI();
    });
    // „Za teplem“ už není pevný seznam zemí – je to filtr podle podnebí pod tímto řádkem.
    $('#quickDest').innerHTML = [
      ['🌍 Kamkoliv', 'any'],
      ['🏙️ Evropa', 'eu'],
      ['🌏 Exotika', 'exotic'],
    ].map(q => `<button type="button" class="qd" data-qd="${q[1]}" ${q[1] === 'any' ? 'data-any="1"' : ''}>${q[0]}</button>`).join('');
    $$('#quickDest [data-qd]').forEach(b => b.onclick = () => {
      const k = b.dataset.qd;
      if (k === 'exotic') toInput.set(EXOTIC.slice(0, 5).map(cc => ({ id: 'cc:' + cc, label: byIso[cc]?.cs || cc, flag: flag(cc) })));
      else toInput.set([]);
      if (k === 'eu') toast('Evropa = kamkoliv; seřaď výsledky podle ceny 😉');
    });
    $('#geoBtn').onclick = () => useMyLocation(fromInput);
    // napsané, ale nevybrané místo nebo věta: nejdřív je použít (jinak by se hledalo bez nich – „kamkoliv“)
    $('#searchForm').onsubmit = async e => {
      e.preventDefault();
      if ((await fromInput.settle()) === false) return;
      const to = await toInput.settle();
      if (to !== false && to !== 'run') startSearch();
    };
    $('#watchBtn').onclick = () => addWatch();
    $('#formReset').onclick = () => resetSearch();
    // 📅 Posouvat termín s časem mění jen způsob uložení ♡, ne hledání (žádné rozbalení formuláře ani Nedávno)
    $('#rollOn').addEventListener('change', e => { e.stopPropagation(); rollTouched = true; updateWatchBtn(); });
    $('#searchForm').addEventListener('change', formEdited);
    $('#guideLink').onclick = openGuide;
  }
  // Úprava formuláře – i bez události 'change' (čipy míst, Za teplem, letiště, lety cesty přes víc měst).
  function formEdited() {
    // na širší obrazovce je vidět i „sbalený“ formulář – souhrn by popisoval jiné hledání než ♡
    if (!$('#searchSum').hidden) expandForm();
    updateWatchBtn(); renderRecent(); // jiné hledání → zase „♡ Hlídat cenu“
  }

  function useMyLocation(input) {
    if (!navigator.geolocation) return toast('Prohlížeč nepodporuje polohu', 'err');
    toast('Zjišťuji polohu…');
    navigator.geolocation.getCurrentPosition(p => {
      const lat = p.coords.latitude.toFixed(4), lon = p.coords.longitude.toFixed(4);
      input.set([...input.items.filter(x => !/\|Moje poloha$/.test(x.id)), { id: `geo:${lat},${lon}|Moje poloha`, label: 'Moje poloha', flag: '📍', type: 'place' }]);
    }, () => toast('Polohu se nepodařilo zjistit', 'err'), { timeout: 10000, maximumAge: 600000 });
  }

  /* ---------- domov (odkud obvykle létáš) ---------- */
  // Domov radaru, režim nebo svátek změněný jinde (jiné okno, obnova zálohy): čip domova, Odkud v hledání na Přehledu,
  // radar a pruh ⭐ podle nich – ne podle stavu před změnou (nastavení radaru otevřené právě teď nechá být)
  function homeChanged() {
    updateHomeChip();
    if (heroFrom) heroFrom.set(S.home?.from || [], true);
    if (document.querySelector('#radarGo')) return;
    if (!$('#view-dashboard') || $('#view-dashboard').classList.contains('active')) { renderRadar(); renderFav(); }
  }
  function updateHomeChip() {
    const h = S.home && S.home.from?.length ? S.home : null;
    const f = h ? h.from : fromInput ? fromInput.items : [];
    const r = h ? (h.radius ?? 200) : $('#radius') ? +$('#radius').value : 200;
    const chip = $('#homeChip');
    chip.innerHTML = f.length ? `📍 ${esc(f.map(x => x.label).join(', '))} <span>+${r} km</span>` : '📍 Odkud létáš?';
    // domov radaru se mění v radaru na Přehledu (hledání odjinud ho nemění)
    chip.onclick = () => { go('dashboard'); setTimeout(() => { radarSetup(Boolean(h)); $('#radar').scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); };
  }

  /* ---------- hledání ---------- */
  async function startSearch(opts = {}) {
    const f = getForm();
    nudge = null;
    if (!f.from.length) { toast('Zadej, odkud chceš letět', 'err'); fromInput.input.focus(); return; }
    if (f.trip === 'multi') {
      const bad = mlProblem(f.legs);
      if (bad) { toast(bad.msg, 'err'); bad.el.focus(); return; }
    } else if (f.dateMode !== 'exact' && f.dTo < f.dFrom) { toast('Konec rozsahu je před začátkem', 'err'); return; }
    else if (f.dateMode === 'exact') {
      if (!f.xOut || f.xOut < today()) { toast('Zadej datum odletu (dnes nebo později)', 'err'); $('#xOut').focus(); return; }
      if (f.trip === 'return' && (!f.xBack || f.xBack < f.xOut)) { toast('Návrat musí být stejný den nebo po odletu', 'err'); $('#xBack').focus(); return; }
    }
    const payload = payloadOf(f);
    const pkey = JSON.stringify(payload);
    // Totéž hledání už běží (♡ Hlídat cenu během hledání, dvojklik na „Nedávno“, 2× Enter): počkat na něj – zrušit ho
    // a spustit znovu by stálo další hledání z limitu serveru (40 za 10 min) a začalo by od nuly.
    if (running && running.key === pkey) {
      if (opts.card) fromCard = { x: opts.card, key: pkey };
      return running.job;
    }
    // domov radaru („Odkud obvykle létáš“) jen poprvé – zkušební hledání z Mnichova ho nepřepíše (mění se v radaru)
    S.form = f; if (!S.home || !S.home.from?.length) S.home = { from: f.from, radius: f.radius, adults: Math.min(6, Math.max(1, +f.adults || 2)) }; save(); updateHomeChip();
    collapseForm(f);
    // karta zůstane i pro totéž hledání znovu (↻ Zkusit znovu po výpadku zdroje)
    fromCard = opts.card ? { x: opts.card, key: pkey } : fromCard && fromCard.key === pkey ? fromCard : null;
    // Kalendář cen zůstane jen u hledání do stejného cíle (nebo na vyžádání) – jiný cíl začne seznamem.
    if (view.mode === 'cal' && !opts.cal && JSON.stringify((lastPayload || {}).to || null) !== JSON.stringify(payload.to || null)) view.mode = 'list';
    lastPayload = payload; lastForm = f;
    // jiné hledání (uživatel změnil formulář): předchozí zrušit (i živé ověřování jeho cen)
    if (running) running.ctl.abort();
    paintDrop(); // odložené překreslení předchozího hledání (průběžné výsledky) už neplatí
    liveGen++;
    const ctl = new AbortController();
    // filtry výpisu (i 🔥 jen výhodné, čas a přestupy) platí jen pro jedno hledání
    view = { ...view, excludeOrigins: new Set(), onlyOrigin: null, excludeCarriers: new Set(), outDate: null, nights: null, expanded: new Set(), maxPrice: null, onlyDeals: false, newOnly: false, favOnly: false, showMuted: false, ...freshView() };
    if (opts.keepView) Object.assign(view, opts.keepView); // ✕ u filtru hledání: ostatní filtry výpisu zůstanou
    $('#results').innerHTML = ''; $('#results').classList.remove('aged');
    const btn = $('#doSearch'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Hledám…';
    renderProgress({ providers: [], ...(f.trip === 'multi' ? { legs: f.legs.map((l, i) => ({ label: `${(i ? l.from : f.from).map(x => x.label).join(', ')} → ${l.to.map(x => x.label).join(', ')}`, state: 'pending' })) } : {}) }, true);
    if (!opts.noScroll) $('#progress').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const job = (async () => {
    busySearches++;
    const s = { ctl, shown: false, q: null }; // průběžné výsledky tohoto hledání už na obrazovce, q = jejich dotaz (JSON)
    try {
      const res = SearchHelp.gridTrips(await runSearch(payload, {
        onProgress: ev => renderProgress(ev, false, null, s.shown),
        // čas cen náhledu, jak přišel (překreslení se může odložit) – stáří, průvodce; po nedokončeném hledání zůstane vidět
        onPartial: r => { r.at = Date.now(); paintSoon(() => showPartial(r, s)); },
        signal: ctl.signal,
      })); // + cesty buněk mřížky termínů
      lastResult = res; lastResultAt = Date.now(); lastResultPayload = payload; restored = false;
      PriceCheck.remember(res); // paměť cen v tomto prohlížeči („Je to dobrá cena?“)
      if (window.Trip && Trip.finalStats) Trip.finalStats(res); // let vybraný z průběžných výsledků: „Je to dobrá cena?“ až z konečného
      pinsFinal(res); // 📌 odložené nabídky, které hledání se stejným nastavením našlo znovu: nová cena a čas (výpis hned po tom)
      fitMode(res);
      fitOrigins(res);
      nudge = seenBump(f); // stejné hledání po několikáté → nabídka ♡ Hlídat cenu nad výsledky
      // po průběžných výsledcích jen překreslit (filtry, pohled, rozbalení, posun i fokus zůstanou) – ne pod rukou
      const paint = () => { renderProgress({ providers: res.providers }, false, res); if (s.shown) rerenderKeep(); else renderResults(); };
      paintDrop();
      if (s.shown) paintSoon(paint); else paint();
      if (!health && healthNow) healthNow(); // stav serveru při startu nedorazil – hledání prošlo, server žije: načíst hned
      autoVerify(res); // ceny z mezipaměti mezi prvními cíli živě v pozadí
      S.recent = SearchHelp.recentAdd(S.recent, { form: f, at: lastResultAt }, watchKey); save(); renderRecent();
      const at = lastResultAt;
      setTimeout(() => saveLast({ at, form: f, payload, res, card: fromCard && fromCard.key === JSON.stringify(payload) ? fromCard.x : null }), 0); // velký zápis až po vykreslení
      return res;
    } catch (e) {
      // let vybraný z průběžných výsledků tohoto hledání: konečný nepřijde (zrušilo ho jiné hledání, selhalo) –
      // „Je to dobrá cena?“ aspoň z průběžného výsledku
      if (s.query && window.Trip && Trip.statsGiveUp) Trip.statsGiveUp(s.query);
      if (e.name === 'AbortError') return;
      expandForm(); // chyba hledání: formulář zase vidět (hláška radí ho upravit)
      paintDrop();
      $('#progress').innerHTML = `<div class="note bad">${ico('M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z')}<div>${esc(s.shown ? SearchHelp.partialFail(e.message) : e.message)}</div></div>`;
    } finally {
      busySearches--;
      // tlačítko odemkne jen poslední hledání – zrušené předchozí by ho odemklo uprostřed běžícího
      if (running && running.ctl === ctl) { running = null; btn.disabled = false; btn.innerHTML = '🔎 Najít nejlevnější lety'; }
    }
    })();
    running = { key: pkey, ctl, job };
    return job;
  }

  // Průběžný výsledek (pomalejší zdroje ještě hledají) jen na obrazovku: lastResult bez času a dotazu výsledku (♡ Hlídat ho
  // nevezme), do paměti cen, nedávných ani uloženého hledání, k ověřování živě ani hlídání nejde – to až konečný.
  // Filtry, pohled, rozbalené nabídky, posun i fokus zůstanou (view se nuluje jen na začátku hledání).
  function showPartial(r, s) {
    if (!running || running.ctl !== s.ctl || !(r.groups || []).length) return;
    r.partial = true;
    s.query = JSON.stringify(r.query); // dotaz hledání, na jehož konečný výsledek čeká let vybraný z náhledu (Trip.statsGiveUp)
    lastResult = SearchHelp.gridTrips(r);
    fitMode(r);
    fitOrigins(r);
    renderProgress({ providers: r.providers }, false, null, true);
    s.shown = true;
    rerenderKeep();
  }
  // Nové nabídky výpisem pod rukou nehýbou: řádek, který je teď nahoře na obrazovce (cíl, nabídka, nadpis kombinací
  // s vybraným letem), zůstane po překreslení na stejném místě, i když nad ním přibude levnější cíl, pruh, nejbližší dny
  // nebo filtr. Sloupce „✈︎ Lety“ se řadí podle ceny (levnější let přibude i mezi řádky na obrazovce) – tam zůstane let
  // nejblíž čtecí linii (třetina výšky obrazovky), a když se už do zkráceného sloupce nevejde, aspoň sloupec. Řádek
  // zmizel → další z viditelných; nahoře na stránce aspoň stejný posun stránky (rerender). Mapa: přiblížení (i projekce)
  // a detail cíle otevřený klepnutím na bod zůstanou.
  function rerenderKeep() {
    const host = $('#results');
    const topOf = e => e.getBoundingClientRect().top, line = innerHeight / 3;
    // (řádek v horní polovině obrazovky – první řádek až dole na telefonu by s mřížkou termínů, která přibude nad výpisem,
    // odsunul pruh i nadpis, na které se uživatel dívá, o celou obrazovku)
    const vis = scrollY > 0 ? $$('.cmp-row[data-cg], .res-card[id^="g-"], .trip-row[data-tid], .lrow[data-lsig], #legPick', host).filter(e => e.getBoundingClientRect().bottom > 80 && topOf(e) < innerHeight / 2) : [];
    const legs = vis.filter(e => e.matches('.lrow')).sort((a, b) => Math.abs(topOf(a) - line) - Math.abs(topOf(b) - line));
    const order = legs.length ? [...legs, legs[0].closest('.lcol[id]'), ...vis.filter(e => !e.matches('.lrow'))] : vis;
    const keyOf = e => (e.dataset.cg != null ? `.cmp-row[data-cg="${CSS.escape(e.dataset.cg)}"]` : e.dataset.lsig != null ? `.lrow[data-lsig="${CSS.escape(e.dataset.lsig)}"]`
      : e.id ? '#' + CSS.escape(e.id) : `.trip-row[data-tid="${CSS.escape(e.dataset.tid)}"]`);
    const anchors = order.filter(Boolean).map(e => ({ sel: keyOf(e), top: topOf(e) }));
    const sv = view.mode === 'map' && typeof d3 !== 'undefined' ? $('#resMap svg', host) : null, z = sv && sv.__pj ? d3.zoomTransform(sv) : null;
    mapKeep = z && (z.k !== 1 || z.x || z.y) ? { ...sv.__pj, z: { k: z.k, x: z.x, y: z.y } } : null;
    const mg = view.mode === 'map' ? $('#mapList', host)?.dataset.g : null;
    rerender(true);
    mapKeep = null; // mapa se (bez výsledků) nekreslila – příště zase podle výsledků
    const g = mg && $('#mapList', host) && computeGroups().find(x => x.dest.key === mg);
    if (g) showMapDetail(g, false);
    const a = anchors.find(x => $(x.sel, host));
    if (a) window.scrollBy(0, $(a.sel, host).getBoundingClientRect().top - a.top);
  }
  // Uživatel právě kliká, táhne, posouvá stránku nebo má otevřené okno → výpis se mu pod rukou nepřekreslí (průběžné
  // výsledky, konečné po nich): zkusí se znovu za chvíli, novější náhled starší nahradí.
  const hands = { down: 0, scroll: 0 };
  const handsOn = () => (hands.down && Date.now() - hands.down < 15000) || Date.now() - hands.scroll < 250 || Boolean($('#modalBg')?.classList.contains('show'));
  let paintT = 0, paintFn = null; // odložené překreslení (paintFn čeká, až uživatel pustí obrazovku nebo zavře okno)
  function paintSoon(fn) { clearTimeout(paintT); paintFn = fn; if (handsOn()) paintT = setTimeout(() => paintSoon(fn), 300); else { paintFn = null; fn(); } }
  const paintDrop = () => { clearTimeout(paintT); paintFn = null; };
  /** Čekající překreslení hned (⭐ / 🙈 výpis stejně překreslí) → bylo nějaké? */
  function paintNow() { const fn = paintFn; paintDrop(); if (fn) fn(); return Boolean(fn); }

  /** Upravené hledání jedním kliknutím (jiný den, ± dny, zrušený filtr, širší cíl…): formulář + nové hledání. */
  function rerun(patch = {}, opts = {}) {
    setForm({ ...(lastForm || getForm()), ...patch });
    return startSearch(opts);
  }
  // „Jen lety odsud“ (Odkud se vyplatí letět) i pro letiště, která přibudou s dalším výsledkem téhož hledání (třeba
  // přestupní letiště pro dálkové lety jen v konečném) – jinak by se jejich lety pod „jen z X“ potichu objevily.
  function fitOrigins(res) {
    if (view.onlyOrigin) view.excludeOrigins = SearchHelp.onlyOriginSet(view.onlyOrigin, (res.origins || []).map(o => o.iata), view.excludeOrigins);
  }
  // Pohled výpisu k výsledku: přesná data začínají „✈︎ Lety“, kalendář cen je jen u konkrétního cíle.
  function fitMode(res) {
    if (legsOk(res) && view.mode === 'list' && legsPref) view.mode = 'legs';
    else if (!legsOk(res) && view.mode === 'legs') view.mode = 'list';
    if (view.mode === 'cal' && res.mode !== 'route') view.mode = 'list';
  }

  /** Plánovač: nejlevnější nabídka posledního dokončeného hledání (bez 🙈 měst) – cíl, dny, cestující, cena a let. */
  function lastPick() {
    const res = lastResult;
    if (!res || !lastResultAt || res.mode === 'multi' || !(res.groups || []).length) return null;
    const shown = prefOn(res) ? prefFor(res, res.groups).groups : res.groups, gs = shown.length ? shown : res.groups;
    const g = gs.reduce((m, x) => x.best.perPersonCzk < m.best.perPersonCzk ? x : m), t = g.best, pax = +(res.query && res.query.adults) || 1;
    const leg = l => `${l.from}→${l.to} ${fmtDate(l.date)}${timeOf(l) ? ' ' + timeOf(l) : ''} (${l.carrierName || provName(l.provider)})`;
    return { dest: g.dest.label, iso: g.dest.cc && byIso[g.dest.cc] ? g.dest.cc : null, start: t.out.date, end: t.back ? t.back.date : '', pax, czk: t.perPersonCzk,
      budget: Math.round(t.perPersonCzk * pax), flight: `${leg(t.out)}${t.back ? `, zpět ${leg(t.back)}` : ''}` };
  }

  /* ---------- poslední výsledky a nedávná hledání ---------- */
  function saveLast(c) {
    if (!c.res || c.res.partial) return; // průběžný výsledek se neukládá (a uložený konečný z minula nesmaže)
    try {
      const s = SearchHelp.lastPack(c);
      if (s) localStorage.setItem(LAST_LS, s); else localStorage.removeItem(LAST_LS);
    } catch (e) { try { localStorage.removeItem(LAST_LS); } catch (e2) { } } // plné úložiště: raději nic než stav aplikace
  }
  // Po otevření aplikace výsledky posledního hledání (do 12 h) – s časem hledání a „↻ Hledat znovu“.
  function restoreLast() {
    let c = null;
    try { c = SearchHelp.lastLoad(localStorage.getItem(LAST_LS), Date.now()); } catch (e) { }
    if (!c) return;
    lastResult = SearchHelp.gridTrips(c.res); lastResultAt = c.at; lastPayload = c.payload; lastResultPayload = c.payload; lastForm = { ...defaultForm(), ...c.form }; restored = true;
    fromCard = c.card && typeof c.card === 'object' ? { x: c.card, key: JSON.stringify(c.payload) } : null;
    fitMode(c.res);
    // sbalit jen když formulář je to hledání (jinak – rozdělané pozdější hledání – zůstane formulář vidět)
    if (watchKey({ form: getForm() }) === watchKey({ form: lastForm })) collapseForm(lastForm);
    renderRestored();
    renderResults();
  }
  function renderRestored(a = SearchHelp.resultAge(lastResultAt, Date.now()), part = false) {
    $('#progress').innerHTML = `<div class="note info last-note"><span>🕘</span><div>${esc(SearchHelp.ageNote(a, part))}</div><button type="button" class="btn sm" id="lastRerun">↻ Hledat znovu</button></div>`;
    $('#lastRerun').onclick = () => rerun();
  }
  /**
   * Výsledky na obrazovce stárnou (Android drží aplikaci otevřenou, vrátíš se za pár hodin): po hodině místo řádku
   * „✓ Prohledáno … ceny z 9:12“ poznámka 🕘 jako u obnovených výsledků (u nich jen aktuální „před …“) a výpis trochu
   * ztlumený. Náhled nedokončeného hledání (chyba po průběžných výsledcích) stárne od svého času a poznámka nahradí
   * chybu. Při návratu do aplikace, přepnutí na Lety a každých 5 min – jen na viditelných Letech, když nic nehledá.
   * keep = výpis nechat na místě (ne po přepnutí na Lety – stránka tam jede nahoru).
   */
  function ageCheck(keep = true) {
    const host = $('#results'), pr = $('#progress');
    if (document.hidden || !host || !pr || !$('#view-flights.active') || !lastResult || running || !host.children.length) return;
    const part = Boolean(lastResult.partial), a = SearchHelp.resultAge(SearchHelp.shownAt(lastResult, lastResultAt, Date.now()), Date.now());
    if (!a) return;
    host.classList.toggle('aged', a.stale);
    // poznámka (i u obnovených) jen s novým „před …“; řádek po hledání (u náhledu jeho chyba) až po hodině
    const note = $('.last-note', pr);
    if (note ? note.textContent.includes(a.txt) : !(a.stale && $(part ? '.note.bad' : 'details.progress-card.done', pr))) return;
    // poznámka je vyšší než řádek – výpis, ve kterém se čte, zůstane na místě
    const y = host.getBoundingClientRect().top;
    renderRestored(a, part);
    const d = host.getBoundingClientRect().top - y;
    if (keep && d && y < 0) window.scrollBy(0, d);
  }
  // Stáří cen na obrazovce: výsledky na Letech (ageCheck) a „cena z …“ v průvodci (krok Let, Shrnutí – Trip.ageRefresh,
  // sám pozná, jestli je průvodce otevřený).
  function ageTick() {
    ageCheck();
    if (!document.hidden && window.Trip && window.Trip.ageRefresh) window.Trip.ageRefresh();
  }
  // Koupit u výsledků starších 3 h (i náhledu nedokončeného hledání): poprvé jen hláška s časem cen (odkaz by ji schoval
  // pod web prodejce), další klepnutí koupí.
  let ageWarned = 0;
  function ageBuy(e) {
    const a = e.target.closest && e.target.closest('a.book');
    if (!a || running || !lastResult) return;
    const at = SearchHelp.shownAt(lastResult, lastResultAt, Date.now()), x = SearchHelp.resultAge(at, Date.now());
    if (!x || !x.old || ageWarned === at) return;
    e.preventDefault();
    ageWarned = at;
    toast(`Ceny jsou ${x.z} ${x.txt} – mohly se změnit. Pro nákup klepni znovu.`, 'err', 6000);
  }
  /**
   * Na telefonu se po hledání formulář sbalí do řádku „Brno → kamkoliv · 17.10.–9.12. · 5–9 nocí · 2 os. [✎ Upravit] [♡]“,
   * aby výsledky začínaly nahoře (formulář má na výšku přes obrazovku) – i na počítači.
   */
  function collapseForm(f) {
    const sum = $('#searchSum'); if (!sum || !f || !f.from?.length) return;
    const lw = f.len === 'holiday' && f.trip === 'return' && f.dateMode !== 'exact' && SearchHelp.holidayOf(f, today()); // „🎉 Vánoce 24.–27. 12.“ stačí
    const when = f.trip !== 'multi' && f.dateMode !== 'exact' && !lw ? `${fmtDate(f.dFrom)}–${fmtDate(f.dTo)} · ` : '';
    sum.innerHTML = `<div class="ss-txt"><b>${esc(watchLabel(f))}</b><span class="faint">${esc(when + recentSub(f, !when))} · ${+f.adults || 1} os.</span></div><button type="button" class="btn sm ghost" id="ssWatch">♡</button><button type="button" class="btn sm" id="ssEdit">✎ Upravit</button>`;
    sum.hidden = false;
    $('#searchForm').classList.add('collapsed');
    $('#ssEdit').onclick = () => { expandForm(); $('#searchForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    updateWatchBtn();
  }
  function expandForm() { const sum = $('#searchSum'); if (sum) sum.hidden = true; $('#searchForm').classList.remove('collapsed'); }
  /**
   * ↺ Začít znovu: formulář na výchozí hodnoty (odkud a okruh z domova, doprava na letiště a pohon auta jako minule),
   * běžící hledání zrušit a uložené výsledky schovat i smazat. Nedávná hledání a hlídání zůstanou.
   */
  function resetSearch() {
    if (running) running.ctl.abort();
    paintDrop();
    const keep = Object.fromEntries(['ground', 'groundMode', 'kmRate', 'carFuel', 'carCons', 'carPrice', 'arrival'].filter(k => S.form && S.form[k] !== undefined).map(k => [k, S.form[k]]));
    mlTouched = false;
    setForm({ ...defaultForm(), ...keep, adults: S.home?.adults || 2 });
    lastResult = null; lastResultAt = 0; lastPayload = null; lastResultPayload = null; restored = false; fromCard = null;
    try { localStorage.removeItem(LAST_LS); } catch (e) { /* zakázané úložiště */ }
    $('#results').innerHTML = ''; $('#results').classList.remove('aged'); $('#progress').innerHTML = '';
    expandForm();
    S.form = getForm(); save();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Hledání je zase prázdné – zadej, kam chceš letět');
  }
  // Kratší popis hledání na čip: termín nebo počet nocí.
  function recentSub(f, withWhen = true) {
    const lw = f.len === 'holiday' && f.trip === 'return' && f.dateMode !== 'exact' ? SearchHelp.holidayOf(f, today()) : null;
    if (lw) return `🎉 ${lw.name} ${SearchHelp.dmRange(lw.start, lw.end)}`;
    if (f.trip === 'multi') return `${plural((f.legs || []).length, 'let', 'lety', 'letů')} od ${fmtDate(f.legs[0].date)}`;
    if (f.dateMode === 'exact') return `${fmtDate(f.xOut)}${f.trip === 'return' && f.xBack ? `–${fmtDate(f.xBack)}` : ' jen tam'}`;
    // „prosinec · 5–9 nocí“: termín, jen když ho hledání zúžilo (výchozí týdny dopředu by čip jen prodloužily)
    const w = withWhen ? SearchHelp.recentWhen(f) : '';
    const len = { weekend: 'víkend', long: 'prodl. víkend', week: 'týden', '2weeks': '2 týdny' }[f.len];
    return (w ? w + ' · ' : '') + (f.trip === 'return' ? len || SearchHelp.nightsRange(f.nMin, f.nMax) : 'jen tam');
  }
  /** „Nedávno hledané“ pod formulářem (bez toho, co je ve formuláři teď) – jedním klepnutím znovu. */
  function renderRecent() {
    const host = $('#recentSearches'); if (!host || !fromInput) return;
    // každé hledání jednou (stejné hledání z různých dnů je od dneška totéž)
    const seen = new Set([watchKey({ form: getForm() })]);
    const items = (S.recent || []).map(e => ({ e, f: SearchHelp.recentForm(e.form, today()) })).filter(x => { const k = x.f && watchKey({ form: x.f }); return k && !seen.has(k) && seen.add(k); }).slice(0, 4);
    host.hidden = !items.length;
    host.innerHTML = items.length ? `<span class="faint">Nedávno:</span>${items.map((x, i) => `<button type="button" class="recent-chip" data-recent="${i}" title="Hledat znovu: ${esc(watchLabel(x.f))} · ${esc(recentSub(x.f))}">${esc(watchLabel(x.f))} <small>${esc(recentSub(x.f))}</small></button>`).join('')}` : '';
    $$('[data-recent]', host).forEach(b => b.onclick = () => { setForm(items[+b.dataset.recent].f); startSearch(); });
  }

  // part = pod průběhem už jsou průběžné výsledky → jen tenký pruh (co ještě hledá), řádky zdrojů po rozkliknutí
  function renderProgress(ev, starting, res, part = false) {
    const host = $('#progress');
    const rows = (ev.providers || []).map(p => {
      const pct = p.calls ? Math.round(p.done / p.calls * 100) : (p.state === 'done' ? 100 : 0);
      const st = { pending: 'čeká', running: 'hledám…', done: 'hotovo', partial: 'částečně', error: 'chyba' }[p.state] || p.state;
      return `<div class="prow ${p.state}"><span class="pdot" style="background:${provColor(p.id)}"></span><b>${esc(provName(p.id))}</b>
        <div class="pbar"><span style="width:${pct}%"></span></div>
        <span class="pnum">${p.calls ? `${p.done}/${p.calls}` : ''}</span>
        <span class="pst">${st}${p.found ? ` · ${plural(p.found, 'nález', 'nálezy', 'nálezů')}` : ''}${p.ms && !starting && p.state !== 'running' ? ` · ${(p.ms / 1000).toFixed(1).replace('.', ',')} s` : ''}</span>
        ${p.note ? `<div class="pnote">${esc(p.note)}</div>` : ''}${p.error ? `<div class="pnote err">${esc(p.error)}</div>` : ''}</div>`;
    }).join('');
    const disabled = (health?.providers || []).filter(p => !p.enabled && p.hint && p.kind !== 'stays').map(p => `<div class="prow off"><span class="pdot" style="background:${p.color}"></span><b>${esc(p.name)}</b><span class="pst">vypnuto</span><div class="pnote">${esc(p.hint)}</div></div>`).join('');
    const multi = res ? res.mode === 'multi' : Boolean(ev.legs);
    const sec = ms => (ms / 1000).toFixed(1).replace('.', ',');
    const head = res ? (multi ? `Prohledáno ${plural(res.legs.length, 'let', 'lety', 'letů')} za ${sec(res.stats.ms)} s` : `Prohledáno ${plural(res.origins.length, 'letiště', 'letiště', 'letišť')} za ${sec(res.stats.ms)} s`)
      : multi ? '<span class="spin"></span> Hledám lety pro celou cestu (nejvýš dva lety najednou)…'
      : `<span class="spin"></span> Prohledávám letiště${originPreview.length ? ` (${originPreview.filter(a => !a.off).sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99)).slice(0, health?.maxOrigins || 8).sort((x, y) => x.distKm - y.distKm).map(a => a.iata).join(', ')})` : ''}…`;
    // cesta přes víc měst: stav hledání každého letu
    const ST = { pending: '⏳', running: '<span class="spin"></span>', done: '✓', error: '⚠️' };
    const legs = !res && ev.legs ? `<div class="ml-prog">${ev.legs.map((l, i) => `<span class="${esc(l.state)}">${ST[l.state] || ''} ${i + 1}. ${esc(l.label)}</span>`).join('')}</div>` : '';
    if (res) {
      // Po dohledání jen jeden řádek (na mobilu by jinak průběh odsunul první nabídku pod okraj), podrobnosti po rozkliknutí;
      // s chybou zdroje rozbalené.
      // pokrytí tras (Wizz Air: na hledání jen část tras, další přijdou na řadu příště) – „Wizz Air 40 (20/39 tras)“
      const cov = p => (p.coverage && p.coverage.skipped + p.coverage.memory > 0 ? ` (${p.coverage.total - p.coverage.skipped}/${p.coverage.total} tras)` : '');
      const found = (ev.providers || []).filter(p => p.found).map(p => `${esc(shopName(p.id))} ${p.found}${cov(p)}`).join(' · ');
      const bad = (ev.providers || []).some(p => p.state === 'error');
      const more = (ev.providers || []).find(p => p.coverage && p.coverage.skipped > 0);
      // kdy jsou ceny konečného výsledku („ceny z 14:32 · podrobnosti ▾“ vpravo – na telefonu i se širokým řádkem obchodů
      // se tam vejde a řádek nezvýší); po hodině ho nahradí poznámka 🕘 (ageCheck)
      const age = SearchHelp.resultAge(lastResultAt, Date.now()), at = age ? `<span class="ps-at">ceny ${age.z} ${esc(age.when)}</span>` : '';
      host.innerHTML = `<details class="card progress-card done"${bad ? ' open' : ''}><summary class="ph">✓ ${head}${found ? `<span class="faint ps-found"> · ${found}</span>` : ''}<span class="ps-more faint">${at}<span class="ps-pd">${at ? ' · ' : ''}podrobnosti</span></span></summary>${rows}${disabled}</details>`
        + (more ? `<div class="more-routes"><button type="button" class="btn sm" id="moreRoutes" title="Na jedno hledání smí ATLAS na ${esc(shopName(more.id))} jen omezený počet dotazů – další hledání vezme nejdřív trasy, na které nedošlo">Prohledat zbylé trasy ${esc(shopName(more.id))} (${more.coverage.skipped})</button></div>` : '');
      const mr = $('#moreRoutes', host); if (mr) mr.onclick = () => rerun();
      return;
    }
    if (part && !multi) {
      // Další průběh jen přepíše text a řádky zdrojů – pruh i „podrobnosti“ zůstanou (rozbalení, klepnutí rozpracované
      // pod prstem se neztratí; průběh chodí až 4× za s).
      const d = $('details.progress-card.part', host), sum = d && $('summary', d);
      if (sum) {
        $('.ph-txt', sum).textContent = SearchHelp.partialHead(ev.providers, shopName);
        while (sum.nextSibling) sum.nextSibling.remove();
        sum.insertAdjacentHTML('afterend', rows + disabled);
        return;
      }
      host.innerHTML = `<details class="card progress-card part"><summary class="ph"><span><span class="spin"></span> <span class="ph-txt">${esc(SearchHelp.partialHead(ev.providers, shopName))}</span></span><span class="ps-more faint">podrobnosti</span></summary>${rows}${disabled}</details>`;
      return;
    }
    host.innerHTML = `<div class="card progress-card"><div class="ph">${head}</div>${legs}${rows}</div>`;
  }

  /* ---------- výsledky ---------- */
  function countryInfo(cc) { return byIso[cc] || null; }
  function seasonOk(cc, ymd) { const c = countryInfo(cc); if (!c || !c.months) return null; return c.months.includes(+ymd.slice(5, 7)); }

  // Filtry výpisu kromě času a přestupů (letiště, aerolinky, cena, 🔥 jen výhodné, den odletu z kalendáře, z mřížky i noci).
  function baseOk(t) {
    if (view.excludeOrigins.has(t.out.from)) return false;
    if (t.back && view.excludeOrigins.has(t.back.to)) return false;
    // aerolinka vyřazená, jen když jsou vyřazené oba lety (kombinace s jinou aerolinkou zůstane)
    if (view.excludeCarriers.size && view.excludeCarriers.has(t.out.provider) && (!t.back || view.excludeCarriers.has(t.back.provider))) return false;
    if (view.maxPrice && t.perPersonCzk > view.maxPrice) return false;
    if (view.onlyDeals && !goodPrice(t)) return false;
    if (view.outDate && t.out.date !== view.outDate) return false;
    if (view.nights != null && t.nights !== view.nights) return false;
    return true;
  }
  function visibleTrips(trips) {
    return trips.filter(t => baseOk(t) && SearchHelp.timeOk(t, view.time));
  }
  // dny dovolené nabídky jednou (řazení je volá při každém porovnání a překreslení)
  const leaveMemo = new WeakMap();
  const leaveOf = t => { if (!t.back) return null; if (!leaveMemo.has(t)) leaveMemo.set(t, SearchHelp.leaveDays(t.out, t.back)); return leaveMemo.get(t); };
  function sortKey(t, g) {
    switch (view.sort) {
      case 'flight': return t.flightCzk;
      case 'fast': return SearchHelp.fastKey(t, 250, (originGround(lastResult, t.out.from)?.minutes || 0) + (t.back ? originGround(lastResult, t.back.to)?.minutes || 0 : 0));
      case 'deal': return -t.deal.score;
      case 'season': { const s = seasonOk(g?.dest.cc || '', t.out.date); const c = countryInfo(g?.dest.cc); return t.perPersonCzk * (s === true ? 0.65 : s === false ? 1.2 : 1) * (c && c.safety ? (1.25 - c.safety * 0.05) : 1); }
      case 'warm': return -(t.tempHi ?? -99);
      case 'near': return t.distanceKm;
      case 'far': return -t.distanceKm;
      case 'date': return t.out.date + (t.out.dep || '');
      // nejméně dní dovolené, při shodě nejlevnější (jen tam → jako cena)
      case 'leave': { const lv = leaveOf(t); return (lv ? lv.n : 99) * 1e7 + t.perPersonCzk; }
      default: return t.perPersonCzk;
    }
  }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  // extra = cesty složené ve výpisu (SearchHelp.fillLegs) – patří ke skupině podle destKey
  let newHiddenNow = 0; // cíle, které schoval „🆕 jen nové země“ (čip aktivního filtru)
  let prefNow = { muted: 0, mutedIn: 0, favIn: 0, notFav: 0 }; // ⭐ / 🙈 ve výpisu (SearchHelp.prefGroups) – čipy filtrů
  function computeGroups(extra = filledNow) {
    const res = lastResult;
    const out = [];
    newHiddenNow = 0;
    const vis = view.newOnly ? visitedNow() : null;
    for (const g of res.groups) {
      const trips = visibleTrips(g.options).concat(extra.filter(t => t.destKey === g.dest.key));
      if (!trips.length) continue;
      if (view.newOnly && SearchHelp.wasThere(g.dest.cc, vis)) { newHiddenNow++; continue; }
      trips.sort((a, b) => cmp(sortKey(a, g), sortKey(b, g)) || a.perPersonCzk - b.perPersonCzk);
      out.push({ ...g, vis: trips });
    }
    // 🙈 schované a „⭐ jen moje cíle“ jen v Kamkoliv a hledání do země či světadílu – hledaný cíl se neschová nikdy
    const pf = prefOn(res) ? prefFor(res, out, view) : { groups: out, muted: 0, mutedIn: 0, favIn: 0, notFav: 0 };
    prefNow = pf;
    pf.groups.sort((a, b) => cmp(sortKey(a.vis[0], a), sortKey(b.vis[0], b)));
    return pf.groups;
  }

  // Přesná data ke konkrétnímu cíli → pohled „✈︎ Lety“ (jednotlivé lety tam a zpět).
  const legsOk = res => Boolean(res && res.mode === 'route' && res.query.exact);
  let pricedNow = null; // přímé lety s cenou ve výsledcích (v „dalších letech tento den“ se neopakují)
  let filledNow = []; // přesná data: cesty složené ze samostatných letenek, aby filtry času a přestupů neschovaly vyhovující lety
  let kiwiTimer = 0;
  // autem tam i zpět: složená cesta platí i parkování na celou cestu (jako server) a vrací se na letiště, kde auto stojí
  const legOpts = res => ({
    adults: res.query.adults, openJaw: res.query.openJaw, keep: t => visibleTrips([t]).length > 0,
    ...(res.query.groundMode === 'car' && res.query.trip === 'return' ? { park: (iata, n) => SearchHelp.parkCzk(originGround(res, iata), n) } : {}),
  });

  /* ---------- doprava na letiště ve výsledcích (odhad ze serveru, access.js) ---------- */
  const originGround = (res, iata) => (res && res.origins || []).find(o => o.iata === iata)?.ground || null;
  // Typická délka cesty hledání (autem: parkování v popisku letiště); null = jen tam (odvoz).
  function resNights(res) {
    const q = res.query;
    if (q.trip === 'multi') return res.returnsHome && q.legs?.length ? SearchHelp.diffDays(q.legs[0].date, q.legs[q.legs.length - 1].date) : null;
    if (q.trip !== 'return') return null;
    if (q.exact && q.exact.back) return SearchHelp.diffDays(q.exact.out, q.exact.back);
    return Math.round((q.nightsMin + q.nightsMax) / 2);
  }
  /** Popisek „doprava na letiště a zpět X Kč/os.“ u ceny nabídky (t = cesta, tam i zpět nebo jen tam) s rozpisem v title. */
  function groundPart(t, res = lastResult) {
    if (!t.groundCzk) return '';
    const g = originGround(res, t.out.from) || (t.back && originGround(res, t.back.to)), car = g && g.mode === 'car';
    const what = `${car ? 'autem' : 'doprava'} na letiště${t.back ? ' a zpět' : car && g.dropOff ? ' (odvoz)' : ''}`;
    let tip;
    if (car) {
      const pk = t.parkCzk || 0, nights = t.back ? SearchHelp.diffDays(t.out.date, t.back.date) : 0, days = SearchHelp.parkDays(nights);
      const e = SearchHelp.fuelItem(g), fuel = e && e.fuel === 'ev' ? 'nabíjení' : 'palivo';
      tip = `Autem na letiště ${t.out.from}${t.back ? ' a zpět' : ` – odvoz: někdo tě odveze a vrátí se (${fuel} tam i zpět)`}: ${fuel}${(g.tolls || []).length ? ' a dálniční známky' : ''} ~${czk(t.groundCzk - pk)}/os.`
        + (pk ? ` + parkování online předem na ${days} ${days === 1 ? 'den' : days <= 4 ? 'dny' : 'dní'} ~${czk(pk)}/os.` : '')
        + ` (${SearchHelp.fuelFormula(g)} za auto každým směrem, ${g.adults} os. v autě${e ? `; ${e.priceLabel}` : ''}) – odhad.`;
    } else {
      // 🏠 vlastní cena bez „~“ a bez vysvětlení odhadu (u obou směrů vlastní = žádný odhad)
      const a = originGround(res, t.out.from), b = t.back ? originGround(res, t.back.to) : null;
      const p = x => (x.own ? `${czk(x.czk)} (vlastní cena)` : `~${czk(x.czk)}`), est = [a, b].some(x => x && x.czk && !x.own);
      tip = `Veřejnou dopravou${a && a.czk ? ` na letiště ${t.out.from} ${p(a)}` : ''}${b && b.czk ? ` + z letiště ${t.back.to} domů ${p(b)}` : ''} na osobu${est ? ` – vlak/bus do města letiště za běžnou cenu a MHD nebo vlak na letiště (z Prahy a Brna do Vídně, Mnichova a Berlína i přímý bus až na letiště)${[a, b].some(x => x && (x.breakdown || []).some(i => i.k === 'border')) ? ', příplatek za mezinárodní spoj' : ''}. Odhad, ne jízdní řád.` : '.'}`;
    }
    return ` + <span title="${esc(tip)}">${what} ${czk(t.groundCzk)}/os.</span>`;
  }
  /** Pohon a cena u cesty autem ve výsledku (položka paliva u letišť odletu), jinak null (dřívější Kč/km). */
  const resFuel = res => (res && res.origins || []).map(o => SearchHelp.fuelItem(o.ground)).find(Boolean) || null;
  /** Patička výsledků: jak se počítá doprava na letiště. */
  function groundFoot(res, multi = false) {
    const q = res.query;
    if (!q.kmRate) return 'bez dopravy na letiště (vypnuto v Další možnosti)';
    if (res.origins && res.origins.length && !res.origins.some(o => o && o.ground)) return 'bez dopravy na letiště (odkud je celá země – není odkud ji počítat)';
    const where = multi ? 'na letiště na začátku cesty a z letiště domů' : 'na letiště a zpět';
    if (q.groundMode === 'car') {
      const e = resFuel(res), fuel = e && e.fuel === 'ev' ? 'nabíjení' : 'palivo';
      const how = e ? `${SearchHelp.energyTxt(e)} tam i zpět – ${e.priceLabel}`
        : q.carKmCzk ? `palivo ${String(q.carKmCzk).replace('.', ',')} Kč/km tam i zpět` : 'palivo tam i zpět';
      return `vč. odhadu cesty autem ${where} (${how}; parkování u letiště podle délky cesty a dálniční známky v cizině, vše děleno počtem cestujících; ${multi
        ? `nejlevnější kombinace se vrací na letiště, kde auto parkuje; bez návratu domů = odvoz – ${fuel} tam i zpět, bez parkování`
        : `zpět jen na letiště, kde auto stojí; autem jen tam = odvoz – ${fuel} tam i zpět, bez parkování`})`;
    }
    const own = (res.origins || []).filter(o => o.ground && o.ground.own).map(o => o.iata);
    return `vč. odhadu dopravy ${where} veřejnou dopravou (jízdenka vlak/bus do města letiště za běžnou cenu podle vzdálenosti a živých cen RegioJetu + MHD nebo vlak na letiště, případně přímý bus až na letiště s příplatkem za mezinárodní spoj${q.kmRate !== 1 ? `; odhad jízdného × ${String(q.kmRate).replace('.', ',')}` : ''}${own.length ? `; ${own.join(', ')} – vlastní cena z 🏠 Moje cena na letiště${q.kmRate !== 1 ? ', bez násobku' : ''}` : ''})`;
  }
  /* ---------- cesta z letiště do města (server/lib/arrival.js; tabulka ověřená 10/2026, jinde odhad) ---------- */
  /** Štítky u nabídky – „🚌 z letiště BVA do Paříže 17,90 € (~440 Kč) · 1 h 15“, drahé nebo dlouhé varovně. */
  const arrChipHtml = c => `<span class="b arrv${c.warn ? ' warn' : ''}" title="${esc(c.title)}">${esc(c.text)}</span>`;
  const arrivalChips = (t, res = lastResult) => (res ? SearchHelp.arrivalChips(t, res.arrivals, { on: Boolean(res.query.arrival) }) : []).map(arrChipHtml);
  /** Popisek „+ z letiště do města a zpět ~880 Kč/os.“ u ceny nabídky (jen když je v ceně) s rozpisem v title. */
  function arrivalPart(t, res = lastResult) {
    if (!t.arrCzk || !res) return '';
    const tip = SearchHelp.arrivalChips(t, res.arrivals, { on: true }).map(c => c.title).join(' ');
    return ` + <span title="${esc(tip)}">z letiště do města${t.back ? ' a zpět' : ''} ~${czk(t.arrCzk)}/os.</span>`;
  }
  /** Patička výsledků: je cesta z letiště do města v ceně? */
  // nejstarší datum ověření jízdného mezi letišti výsledku („10/2026 · před 8 měsíci – mohlo se změnit“)
  const arrivalChecked = res => {
    const d = Object.values(res.arrivals || {}).filter(a => a && a.basis === 'table' && /^\d{4}-\d{2}/.test(a.date || '')).map(a => a.date).sort()[0];
    return d ? ` ${+d.slice(5, 7)}/${d.slice(0, 4)}${SearchHelp.dataAge(d).txt}` : '';
  };
  const arrivalFoot = (res, multi = false) => (res.query.arrival
    ? `vč. cesty z letiště ${multi ? 'do měst na cestě a z nich zpět na letiště' : 'do města a zpět na letiště'} (jízdné letištního busu, vlaku nebo metra ${arrivalChecked(res) ? `ověřené${arrivalChecked(res)}` : 'z ověřené tabulky'}, jinde odhad)`
    : 'bez cesty z letiště do města (vypnuto v Další možnosti)');
  /**
   * „🛫 Odkud se vyplatí letět“: nejlevnější celá cesta z každého letiště (ze všech nalezených nabídek, server o.best)
   * proti nejbližšímu – sbalená karta, souhrn odpoví hned. Klepnutí na letiště = jen lety odsud, další klepnutí = všechna.
   */
  // Filtry výpisu kromě letišť (🆕, čas a přestupy, cena, aerolinky, 🔥, den odletu) – karta pak počítá z toho, co výpis ukazuje.
  const listFiltered = () => Boolean(view.newOnly || view.favOnly || prefNow.muted || view.onlyDeals || view.maxPrice || view.excludeCarriers.size || view.outDate || view.nights != null || SearchHelp.timeActive(view.time));
  function ocTrips(res) {
    const ex = view.excludeOrigins; view.excludeOrigins = new Set(); // filtr letišť nastavuje karta sama
    try {
      if (res.mode === 'route') return visibleTrips(res.top || []);
      const vis = view.newOnly ? visitedNow() : null;
      const gs = res.groups.filter(g => !(vis && SearchHelp.wasThere(g.dest.cc, vis)));
      return (prefOn(res) ? prefFor(res, gs, view).groups : gs).flatMap(g => visibleTrips(g.options));
    } finally { view.excludeOrigins = ex; }
  }
  // „ze 2 / ze 3 nabídek“, „z 5 nabídek“ (předložka podle čtení čísla)
  const zeN = n => { const lead = n < 20 ? n : n < 100 ? Math.floor(n / 10) : n < 1000 ? Math.floor(n / 100) : 0; return [1, 2, 3, 4, 6, 7, 12, 13, 14, 16, 17].includes(lead) && !(n < 20 && lead === 1) ? 'ze' : 'z'; };
  function originCard(res) {
    const oc = SearchHelp.originCompare(res, listFiltered() ? { trips: ocTrips(res) } : {});
    if (!oc.rows.length || view.mode === 'map') return '';
    const { win, ref } = oc, ret = res.query.trip === 'return', all = res.origins.map(o => o.iata);
    const head = `🛫 <b>Odkud se vyplatí letět${oc.filtered ? ' (podle filtrů výpisu)' : ''}:</b> `, pp = `/os.${res.query.kmRate ? '' : ' bez dopravy na letiště'}`;
    // zpáteční s návratem na jiné letiště se k letištím nepočítá – když je levnější, souhrn to řekne (ve výpisu je)
    const jaw = oc.jaw != null && oc.jaw < win.czk ? ` · s návratem na jiné letiště už od <b>${czk(oc.jaw)}</b>` : '';
    // základ = nejbližší letiště s nabídkou odsud a zpět; nejbližší vůbec být nemusí (to má třeba jen návraty jinam)
    const refTxt = r => (r.nearest ? `nejbližšího <b>${esc(r.iata)}</b>` : `<b>${esc(r.iata)}</b> (nejbližší letiště s nabídkou)`);
    const sum = win.ref ? `${head}nejlevněji z ${refTxt(win)} od <b>${czk(win.czk)}</b>${pp} – jiná letiště nejsou levnější${jaw}`
      : `${head}nejlevněji z <b>${esc(win.iata)}</b>${win.city !== win.iata ? ` (${esc(win.city)})` : ''} od <b>${czk(win.czk)}</b>${pp} – o ${czk(-win.diff)} méně než z ${refTxt(ref).replace(/<\/?b>/g, '')}${win.extraMin > 0 ? `, cesta o ~${hm(win.extraMin)} déle${ret ? ' (tam i zpět)' : ''}` : win.extraMin < 0 ? `, a cesta je ještě kratší` : ''}${jaw}`;
    const row = r => {
      const only = view.excludeOrigins.size === all.length - 1 && !view.excludeOrigins.has(r.iata);
      const gnd = !res.query.kmRate ? 'bez dopravy' : r.minutes ? `${r.mode === 'car' ? '🚗' : '🚌'} ~${hm(r.minutes)}` : '';
      const tip = r.czk == null ? (r.jaw ? 'Jen cesty s návratem na jiné letiště – jsou ve výpisu, k žádnému letišti se nepočítají' : 'Odsud se nic nenašlo')
        : `${r.n === 1 ? 'Jediná nabídka' : `Nejlevnější ${zeN(r.n)} ${r.n} nabídek`} ${ret ? 'odsud a zpět sem' : 'odsud'} · ${only ? 'klepnutím zase všechna letiště' : `klepnutím jen lety z ${r.iata}`}`;
      return `<button type="button" class="oc-row${view.excludeOrigins.has(r.iata) ? ' off' : ''}${r.ref ? ' ref' : ''}" data-ofo="${esc(r.iata)}" aria-pressed="${only}" title="${esc(tip)}"${r.czk == null ? ' disabled' : ''}>`
        + `<span class="oc-ap">${r.hub ? '✈︎ ' : ''}<b>${esc(r.iata)}</b> ${esc(r.city)}</span><span class="oc-gnd">${gnd}</span>`
        + `<span class="oc-price">${r.czk == null ? (r.jaw ? 'jen s návratem jinam' : 'nic nenalezeno') : `od <b>${czk(r.czk)}</b>/os.`}</span>${r.czk != null ? `<span class="oc-diff">${esc(SearchHelp.originDiffTxt(r))}</span>` : ''}</button>`;
    };
    return `<details class="card oc-card" id="ocCard"${view.ocOpen ? ' open' : ''}><summary>${sum}</summary><div class="oc-rows">${oc.rows.map(row).join('')}</div>`
      + `<div class="faint oc-foot">${esc(SearchHelp.originFoot(res, oc))}</div></details>`;
  }
  // filtry výpisu bez dne odletu (a počtu nocí) vybraného v kalendáři nebo mřížce
  const anyDay = fn => { const d = view.outDate, n = view.nights; view.outDate = null; view.nights = null; try { return fn(); } finally { view.outDate = d; view.nights = n; } };

  function renderResults() {
    const res = lastResult; if (!res) return;
    rowRegistry = [];
    shownRes = res;
    pinNow = pinIndex(res);
    clearInterval(kiwiTimer);
    filledNow = [];
    if (res.mode === 'multi') return renderMulti(res);
    if (!res.partial) wxLoad(res); // předpověď v cíli: jednou na (konečný) výsledek hledání (při překreslení už je načtená nebo se načítá)
    pricedNow = SearchHelp.pricedTimes([...(res.top || []), ...res.groups.flatMap(g => g.options)]);
    const host = $('#results');
    const isRoute = res.mode === 'route';
    const exactRoute = legsOk(res);
    // Filtry času a přestupů: nabídky po ostatních filtrech (pre), kolik z nich skryly, rozsahy pro posuvníky.
    const base = isRoute ? (res.top || []) : res.groups.flatMap(g => g.options);
    const pre = base.filter(baseOk);
    const th = SearchHelp.timeHidden(pre, view.time);
    const shown = isRoute ? visibleTrips(res.top || []) : null;
    // Přesná data tam i zpět: let, který filtrům času a přestupů vyhoví, ale žádná jeho kombinace ze serveru ne
    // („Jen přímé“: přímé lety tam i zpět jsou, jen každý v kombinaci s přestupem druhým směrem), se složí s nejlevnějším
    // vyhovujícím letem druhým směrem – ve všech pohledech (Lety, Kombinace, Kalendář), ne jen ve sloupcích.
    const fill = () => (exactRoute && res.query.trip === 'return' ? SearchHelp.fillLegs(base.filter(baseOk), visibleTrips(res.top || []), view.time, legOpts(res)) : []);
    filledNow = fill();
    if (view.newOnly && (S.visited || []).length < SearchHelp.NEW_MIN) view.newOnly = false; // odškrtnuté země pod práh – filtr nic neschová
    const groups = computeGroups();
    // skupina cíle k řazení (Cena + ideální sezóna potřebuje zemi cíle)
    const gOf = new Map((res.groups || []).map(g => [g.dest.key, g])), gk = t => gOf.get(t.destKey);
    const flat = isRoute ? shown.concat(filledNow).sort((a, b) => cmp(sortKey(a, gk(a)), sortKey(b, gk(b)))) : null;
    // filtrům vyhoví jen dvojice samostatných letenek, které ATLAS složil sám – říct to rovnou
    const onlyFilled = filledNow.length > 0 && !shown.length;
    const usedProviders = [...new Set(res.groups.flatMap(g => g.options.flatMap(t => [t.out.provider, t.back?.provider].filter(Boolean))))];
    const chips = SearchHelp.activeFilters(res.filters, view, Object.fromEntries(Object.keys(PROV).map(k => [k, provName(k)])), { hidden: th.by, ret: res.query.trip === 'return' }, { newHidden: newHiddenNow, favHidden: prefNow.notFav, origins: res.origins.map(o => o.iata), carriers: usedProviders });
    // 🆕 jen nové země: přepínač jen tam, kde by něco schoval a něco nechal (aspoň 3 země na mapě navštívených)
    const nsplit = isRoute ? null : SearchHelp.newSplit(res.groups, visitedNow());
    const nTime = chips.filter(c => c.time).length;
    const all = groups.flatMap(g => g.vis);
    const best = all.length ? all.reduce((m, t) => t.perPersonCzk < m.perPersonCzk ? t : m) : null;
    // konkrétní cíl: posuvník přes ceny výpisu (res.top a složené dvojice), ne jen přes nejlevnější cestu skupiny
    const prices = (isRoute && (res.top || []).length ? [...res.top, ...filledNow] : res.groups.map(g => g.best)).map(t => t.perPersonCzk);
    const maxP = prices.length ? Math.max(...prices) : 0;
    const destTxt = res.destination.kind === 'anywhere' ? 'kamkoliv' : esc(res.destination.label);

    if (!res.groups.length) {
      host.innerHTML = emptyState(res);
      $$('[data-mt]', host).forEach(b => b.onclick = () => { setMinTemp(b.dataset.mt); startSearch({ noScroll: true }); });
      wireHelp(host);
      if (view.gndOpen) showGround(true, false);
      return;
    }
    const thin = !res.partial && SearchHelp.isThin(res); // průběžné výsledky: „málo výsledků“ až podle konečných
    // „Kamkoliv“ a země: výchozí Přehled (řádek na město, klepnutím plná karta), Karty = každý cíl celou kartou
    if (isRoute && view.mode === 'cards') view.mode = 'list';
    const modes = [...(exactRoute ? [['legs', '✈︎ Lety']] : []), ['list', exactRoute ? '☰ Kombinace' : isRoute ? '☰ Seznam' : '≡ Přehled'], ...(!isRoute ? [['cards', '☰ Karty']] : []), ['map', '🗺️ Mapa'], ...(isRoute ? [['cal', '📅 Kalendář']] : [])];
    // telefon: filtry, řazení a „Odkud se vyplatí letět“ za jedním tlačítkem – výsledky hned pod hlavičkou (na počítači
    // vidět vždy); otevřené zůstane i po překreslení, otevřený panel času a přestupů ho drží otevřené
    const moreOpen = Boolean(view.moreOpen || view.timeOpen), nMore = chips.length + (view.sort !== 'total' ? 1 : 0);
    const summary = kiwiBanner(res) + `<div class="res-head">
      <div><h2>${isRoute ? `✈️ ${destTxt}${res.partial ? ' <span class="part-tag">⏳ zatím část nabídek</span>' : ''}` : `🌍 ${res.partial ? 'Zatím ' : ''}${plural(res.groups.length, 'destinace', 'destinace', 'destinací')} ${res.destination.kind === 'countries' ? '· ' + destTxt : ''}`}</h2>
      <div class="muted" style="font-size:13px">z ${res.origins.map(o => `<b>${o.iata}</b>`).join(', ')} · ${whenTxt(res.query)} · ${res.query.adults} os.${BAG_LBL[res.query.bags] ? ` · 🧳 vč. ${res.query.bags === 'cabin' ? 'kabinového kufru' : 'kufru k odbavení'}` : ''}
      ${best ? ` · nejlevněji <b class="good">${czk(best.perPersonCzk)}</b>/os.` : ''}<span id="pinHead">${pinNow.n ? ` · <button type="button" class="linkbtn pin-open" id="pinOpen">📌 Odložené (${pinNow.n})</button>` : ''}</span></div></div>
      <div class="res-tools">
        <button type="button" class="btn sm ghost res-more-btn" id="resMoreBtn" aria-expanded="${moreOpen}" aria-controls="resMore" title="Filtry, řazení a srovnání letišť">⚙️ Filtry${nMore ? ` <b class="tf-n">${nMore}</b>` : ''} <span aria-hidden="true">${moreOpen ? '▴' : '▾'}</span></button>
        <div class="seg" id="viewSeg">${modes.map(v => { const [ic, ...w] = v[1].split(' '); return `<button type="button" data-v="${v[0]}" class="${view.mode === v[0] ? 'on' : ''}"><span class="vs-ic">${ic} </span>${w.join(' ')}</button>`; }).join('')}</div>
      </div></div>
      ${nudgeHtml()}${groundBanner(res)}
      ${filterChips(chips)}
      <div class="res-more${moreOpen ? ' open' : ''}" id="resMore">
      <div class="res-filters">
        <div class="rf-group rf-sort"><span class="faint">Řazení:</span><select id="sortSel" title="Řazení">
          ${[['total', `Nejlevnější celkem (vč. dopravy${BAG_LBL[res.query.bags] ? ' a zavazadel' : ''})`], ['flight', 'Nejlevnější letenka'], ['fast', 'Cena + délka cesty'], ['deal', 'Nejvýhodnější vůči běžné ceně'], ['season', 'Cena + ideální sezóna'], ['warm', 'Nejtepleji'], ['date', 'Nejdřívější odlet'], ...(res.query.trip === 'return' ? [['leave', 'Nejméně dovolené']] : []), ['near', 'Nejblíž'], ['far', 'Nejdál']].map(o => `<option value="${o[0]}" ${view.sort === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>
        <div class="rf-group"><span class="faint">Letiště:</span>${res.origins.map(o => { const l = SearchHelp.accessLabel(o.ground, { nights: resNights(res) }); return `<button type="button" class="fchip ${view.excludeOrigins.has(o.iata) ? '' : 'on'}" data-fo="${o.iata}" title="${esc((o.name || '') + (o.hub ? ` – velké přestupní letiště pro dálkové lety (${o.distKm} km, cesta na letiště započtena)` : '') + (l ? ` · ${l.title}` : ''))}">${o.hub ? '✈︎ ' : ''}${o.iata}${o.ground && o.ground.czk ? ` <small>${o.ground.mode === 'car' ? `🚗+${Math.round(SearchHelp.carTrip(o.ground, resNights(res)).perPerson / 10) * 10}` : `${o.ground.own ? '🏠' : ''}+${o.ground.czk}`}</small>` : ''}</button>`; }).join('')}</div>
        ${usedProviders.length > 1 ? `<div class="rf-group"><span class="faint">Aerolinky:</span>${usedProviders.map(p => `<button type="button" class="fchip ${view.excludeCarriers.has(p) ? '' : 'on'}" data-fc="${p}"><i style="background:${provColor(p)}"></i>${esc(provName(p))}</button>`).join('')}</div>` : ''}
        <div class="rf-group rf-price"><span class="faint">Max.</span><input type="range" id="fPrice" min="0" max="${Math.ceil(maxP / 100) * 100}" step="100" value="${view.maxPrice || Math.ceil(maxP / 100) * 100}"><b id="fPriceVal">${view.maxPrice ? czk(view.maxPrice) : 'bez limitu'}</b></div>
        <button type="button" class="fchip ${view.onlyDeals ? 'on' : ''}" id="fDeals" title="Jen nabídky s 🔥 Super cenou nebo 💚 Dobrou cenou">🔥 jen výhodné</button>
        ${nsplit && (view.newOnly || (nsplit.hidden && nsplit.keep)) ? `<button type="button" class="fchip ${view.newOnly ? 'on' : ''}" id="fNew" aria-pressed="${view.newOnly}" title="Jen země, které ještě nemáš na mapě navštívených (máš tam ${(S.visited || []).length} ${(S.visited || []).length <= 4 ? 'země' : 'zemí'}; domovská země se počítá jako navštívená)">🆕 jen nové země</button>` : ''}
        ${prefNow.favIn && (view.favOnly || prefNow.favIn < groups.length) ? `<button type="button" class="fchip ${view.favOnly ? 'on' : ''}" id="fFav" aria-pressed="${view.favOnly}" title="Jen města, která máš v ⭐ Moje cíle (ve výsledcích ${prefNow.favIn})">⭐ jen moje cíle</button>` : ''}
        ${prefNow.mutedIn && !view.favOnly ? `<button type="button" class="fchip mute-chip" id="fMute" aria-pressed="${view.showMuted}" title="Města, která máš v 🙈 Nezajímá mě – v Kamkoliv a v radaru se neukazují (seznam upravíš přes ⋯ u cíle → Upravit seznamy)">🙈 ${view.showMuted ? `ukázáno ${prefNow.mutedIn} · skrýt` : `skryto ${prefNow.muted} · ukázat`}</button>` : ''}
        <button type="button" class="fchip tf-toggle ${nTime ? 'on' : ''}" id="fTime" aria-expanded="${view.timeOpen}" aria-controls="tfPanel">🕐 Čas a přestupy${nTime ? ` <b class="tf-n">${nTime}</b>` : ''} <span aria-hidden="true">${view.timeOpen ? '▴' : '▾'}</span></button>
      </div>
      ${view.timeOpen ? timePanel(res, SearchHelp.timeStats(base), th) : ''}
      ${originCard(res)}
      <div class="faint rank-note">Pořadí určuje jen zvolené řazení (cena, termín, vzdálenost) – žádná aerolinka ani partner si za lepší pozici neplatí.${health?.affiliate ? ' Odkazy na Aviasales jsou partnerské (affiliate, <span class="ad-tag">reklama</span>): při nákupu přes ně může ATLAS dostat provizi, cenu to pro tebe nemění.' : ''}</div>
      </div>
      ${onlyFilled ? `<div class="note info tf-filled" style="margin-bottom:14px">🔀 <div><b>Filtrům času a přestupů nevyhoví žádná z nalezených kombinací celá</b> – lety tam a zpět, které jim vyhoví, jsem spároval sám (${plural(filledNow.length, 'dvojice', 'dvojice', 'dvojic')} dvou samostatných letenek, každou kupuješ zvlášť).</div></div>` : ''}
      ${nearbyHtml(res, thin)}
      ${res.warm ? `<div class="note info" style="margin-bottom:14px">🌡️ <div><b>Za teplem ≥ ${res.warm.minTemp} °C:</b> jen cíle, kde je v měsíci odletu dlouhodobý průměr denních maxim aspoň ${res.warm.minTemp} °C${res.warm.dropped ? ` – ${plural(res.warm.dropped, 'nabídka', 'nabídky', 'nabídek')} do chladnějších míst ${res.warm.dropped === 1 ? 'vyřazena' : res.warm.dropped <= 4 ? 'vyřazeny' : 'vyřazeno'}` : ''}.</div></div>` : ''}
      ${res.demo ? `<div class="note warn" style="margin-bottom:14px">⚠️ <div><b>DEMO data</b> – ceny i lety jsou vymyšlené, slouží jen k vyzkoušení aplikace.</div></div>` : ''}
      ${res.fx && res.fx.source === 'approx' && !res.demo ? `<div class="note warn" style="margin-bottom:14px">💱 <div>Kurzy měn se nepodařilo načíst – přepočet do Kč je orientační.</div></div>` : ''}`;

    let body = '';
    if (view.mode === 'legs' && exactRoute) body = legsView(flat, res, pre);
    // mapa bez nabídek (všechny skryly filtry) by kreslila z nekonečných souřadnic → jen hláška, že filtrům nic neodpovídá
    else if (view.mode === 'map') body = !groups.length ? '' : `<div class="card res-map-card"><div id="resMap" class="res-map"></div><div class="map-legend"><span><i class="lg-dot t0"></i>nejlevnější</span><span><i class="lg-dot t1"></i>střední</span><span><i class="lg-dot t2"></i>dražší</span><span class="faint">klikni na bod → detail</span></div></div><div id="mapList"></div>`;
    // kalendář ukazuje všechny dny i s vybraným dnem odletu → složené dvojice i pro ostatní dny (jinak by měly ✕)
    else if (view.mode === 'cal' && isRoute) body = calendarHtml(res, view.outDate ? anyDay(fill) : filledNow) + `<div class="section-head"><h2>Nejlepší kombinace${view.outDate ? ' · odlet ' + fmtDate(view.outDate) + (view.nights != null ? ', ' + nightsTxt(view.nights) : '') : ''}</h2></div>` + flatList(flat);
    else body = isRoute ? (groups.length > 1 ? `<div class="dest-mini">${groups.map(g => `<span class="chip">${flag(g.dest.cc)} ${esc(g.dest.label)} od <b>${czk(g.vis[0].perPersonCzk)}</b></span>`).join('')}</div>` : '') + flatList(flat)
      : view.mode === 'cards' ? groups.map(g => groupCard(g)).join('') : compactList(groups);
    // konkrétní cíl: výpis je z res.top (flat), ne z 6 nabídek skupiny – podle něj, jinak hláška pod nalezenými lety
    if (!body.trim() || ((view.mode === 'list' || view.mode === 'cards') && !(isRoute ? flat.length : groups.length))) body += `<div class="empty">Filtrům nic neodpovídá. Uvolni filtr ceny, letišť, aerolinek, nových zemí${view.favOnly ? ', mých cílů' : ''} nebo času a přestupů${prefNow.muted ? ' – nebo ukaž 🙈 skryté cíle' : ''}.</div>`;
    // Málo výsledků: ze serveru (thin), nebo je skryly filtry času a přestupů – pak nabídnout hlavně jejich zrušení.
    const thinVis = !res.partial && th.any > 0 && (isRoute ? flat.length : groups.length) < 3;
    if (thin || thinVis) body += smartHelp(res, false, { chips: chips.filter(c => c.time), any: th.any, onlyClear: !thin });
    host.innerHTML = summary + body + `<div class="res-foot faint">Ceny jsou za osobu ${bagFoot(res.query.bags)}, ${esc(groundFoot(res))}, ${esc(arrivalFoot(res))}. Živé ceny (Ryanair, Wizz Air) se mohou do rezervace změnit; ceny „z cache“ ověř. Kurz: ${res.fx ? `1 EUR = ${res.fx.eurCzk.toFixed(2)} Kč (${esc(res.fx.source)})` : '—'}. 🌡️ Teplota u cíle je dlouhodobý průměr denních maxim v měsíci odletu (meteostanice u letiště, průměr 1991–2020; kde stanice není, NASA POWER 2001–2020) – ne předpověď počasí; u cest do 15 dní je u nabídky předpověď Open-Meteo.</div>`;
    wireResults();
    if (window.Photos) Photos.paint(host); // fotky měst v řádcích výsledků (jen viditelné)
    wxFill();
    wireHelp(host);
    if (view.gndOpen) showGround(true, false);
    if (view.mode === 'map') drawResultMap(groups);
  }

  // Co je v ceně za zavazadla (patička výsledků); příplatky jsou jen odhad podle dopravce.
  function bagFoot(bags) {
    if (!BAG_LBL[bags]) return 'jen s malým zavazadlem pod sedadlo (kufr si přidej v „Další možnosti → 🧳 Zavazadla“)';
    return `vč. odhadu příplatku za ${bags === 'cabin' ? 'kabinový kufr do 10 kg' : 'kufr k odbavení 20–23 kg (kabinový kufr se nepočítá)'} – typická cena u dopravce při nákupu s letenkou, přesnou ukáže až rezervace`;
  }

  function emptyState(res) {
    const errs = res.providers.filter(p => p.error).map(p => `<li><b>${esc(provName(p.id))}:</b> ${esc(p.error)}</li>`).join('');
    const notes = res.providers.filter(p => p.note).map(p => `<li><b>${esc(provName(p.id))}:</b> ${esc(p.note)}</li>`).join('');
    const aps = `${res.origins.length === 1 ? 'letiště' : 'letišť'} ${res.origins.map(o => o.iata).join(', ')}`; // „Z letiště BRQ“, „Z letišť BRQ, VIE“
    // Za teplem: vysvětli, že lety jsou, jen ne do tepla, a nabídni nižší limit (zvýrazněný ten, který už něco pustí).
    const w = res.warm;
    const lower = w ? [25, 20].filter(x => x < w.minTemp) : [];
    const warmest = w ? w.maxHi ?? w.destHi ?? null : null;
    const fits = warmest != null ? lower.find(x => x <= warmest) : null;
    // Filtry ze vstupu, které nabídky skryly (max. cena, jen přímé) – pak lety jsou, jen neprošly filtrem.
    const fl = res.filters || {}, fh = fl.hidden || {};
    const hid = [fl.maxPrice && fh.maxPrice ? [`„do ${czk(fl.maxPrice)}“`, fh.maxPrice] : null, fl.directOnly && fh.directOnly ? ['„jen přímé“', fh.directOnly] : null].filter(Boolean);
    const hidTxt = hid.map(([n, c]) => `filtr ${n} skryl ${plural(c, 'nabídku', 'nabídky', 'nabídek')}`).join(' a ');
    const msg = hid.length && !(w && w.dropped)
      ? `Z ${aps} jsem lety${res.destination.kind !== 'anywhere' ? ' do cíle ' + esc(res.destination.label) : ''} našel, ale ${hidTxt}.`
      : w && w.dropped
      ? `Z ${aps} jsem našel ${plural(w.dropped, 'nabídku', 'nabídky', 'nabídek')}, ale žádná nevede tam, kde bývá v měsíci odletu přes den aspoň ${w.minTemp} °C${w.maxHi != null ? ` – nejtepleji bylo kolem ${w.maxHi} °C` : ''}.`
      : w && w.destHi != null && w.destHi < w.minTemp
      ? `V cíli ${esc(res.destination.label)} bývá v měsících odletu přes den průměrně nejvýš ~${w.destHi} °C – na filtr „za teplem“ ≥ ${w.minTemp} °C to nestačí.`
      : `Z ${aps} jsem pro zadané termíny nenašel žádný let${res.destination.kind !== 'anywhere' ? ' do cíle ' + esc(res.destination.label) : ''}.${w ? ` Filtr „za teplem“ pouští jen cíle, kde bývá v měsíci odletu přes den aspoň ${w.minTemp} °C.` : ''}`;
    return `${kiwiBanner(res)}${groundBanner(res)}${nearbyHtml(res, true)}<div class="card empty-res"><div class="ei">${w ? '🌡️' : '🧭'}</div><h2>${hid.length && !(w && w.dropped) ? 'Filtrům nic neodpovídá' : 'Nic jsem nenašel'}</h2>
      <p class="muted">${msg}</p>
      ${w ? `<div class="row wrap warm-retry">${lower.map(x => `<button type="button" class="btn sm ${x === fits ? 'primary' : ''}" data-mt="${x}">Snížit na ≥ ${x} °C</button>`).join('')}<button type="button" class="btn sm ghost" data-mt="0">Hledat bez teplotního filtru</button></div>` : ''}
      ${smartHelp(res, true)}
      ${errs ? `<div class="note bad" style="text-align:left;margin-top:12px"><div><b>Chyby zdrojů:</b><ul>${errs}</ul></div></div>` : ''}
      ${notes ? `<div class="note info" style="text-align:left;margin-top:12px"><div><ul>${notes}</ul></div></div>` : ''}</div>`;
  }

  function legHtml(l, back) {
    const ap = a => `<b>${esc(a)}</b>`;
    const t1 = esc(timeOf(l)), t2 = esc(arrTime(l));
    return `<div class="leg ${back ? 'back' : ''}">
      <span class="cbadge" style="background:${provColor(l.provider)}" title="${esc(l.carrierName || provName(l.provider))}">${esc(l.carrier || '?')}</span>
      <span class="ld">${dayLabel(l.date)}</span>
      <span class="lr">${ap(l.from)}${t1 ? ` <span class="tm">${t1}</span>` : ''} <span class="arr">→</span> ${ap(l.to)}${t2 ? ` <span class="tm">${t2}</span>` : ''}${arrUnk(l) ? ' ' + arrUnk(l) : ''}</span>
      <span class="lx">${[dur(l.durationMin), l.stops ? stopsTxt(l) : (l.provider === 'travelpayouts' ? '' : 'přímý'), l.flightNo, l.carrierName].filter(Boolean).map(esc).join(' · ')}</span>
      ${depsHtml(l, 'lod')}
    </div>`;
  }

  // Další odlety téhož dne bez ceny (Ryanair z letového řádu, Wizz Air z jeho dat) – kromě těch, co výsledky ukazují s cenou.
  function depsHtml(l, cls) {
    const deps = SearchHelp.freeDeps(l, pricedNow);
    return deps.length ? `<span class="${cls}">další lety tento den: ${deps.map(esc).join(', ')} <i>(cena v rezervaci u aerolinky)</i></span>` : '';
  }

  /* ---------- předpověď počasí v cíli (weather.js: Open-Meteo přímo z prohlížeče) ---------- */
  // Cesty s odletem do 15 dní: jeden dotaz na výsledek hledání (pevná místa i dny – řazení a filtry nic znovu nenačítají),
  // štítek předpovědi nahradí štítek dlouhodobého průměru 🌡️. Než předpověď dorazí, drží jí místo prázdný .wx-slot.
  let wx = { res: null, p: null, map: null };
  const wxWin = d => Weather.inForecast(d); // dnes … poslední den, na který Open-Meteo předpověď vydá
  const wxGeo = x => Boolean(x && Number.isFinite(x.lat) && Number.isFinite(x.lon));
  function wxLoad(res) {
    if (wx.res === res) return;
    wx = { res, p: null, map: null };
    if (!window.Weather) return;
    // nejvýš 40 míst: napřed cíle, jejichž nejlevnější nabídka do 15 dní odlétá (ty řádek ukazuje), pak ostatní
    // konkrétní cíl: řádky jsou z res.top (stovky nabídek), ne z 6 nejlevnějších možností skupiny
    const tripsOf = g => (res.mode === 'route' ? (res.top || []).filter(t => res.groups.length === 1 || t.destKey === g.dest.key) : g.options);
    const gs = res.groups.filter(g => wxGeo(g.dest) && tripsOf(g).some(t => wxWin(t.out.date)));
    const locs = gs.filter(g => g.best && wxWin(g.best.out.date)).concat(gs.filter(g => !(g.best && wxWin(g.best.out.date)))).slice(0, 40);
    if (!locs.length) return;
    wx.p = Weather.span(locs.map(g => ({ lat: g.dest.lat, lon: g.dest.lon }))).then(m => { if (wx.res === res) { wx.map = m; wxFill(); } });
  }
  // předpověď na dny cesty d1..d2 z načtené předpovědi m → Weather.summary nebo null (i odlet mimo dosah, viz Weather.trip)
  const wxSum = (m, x, d1, d2) => (m && wxGeo(x) ? Weather.trip(m.get(Weather.key(x.lat, x.lon)), d1, d2) : null);
  const wxOf = (t, g) => (wx.res === lastResult && wx.map && g ? wxSum(wx.map, g.dest, t.out.date, t.back && t.back.date) : null);
  // předpověď pro tenhle výsledek se ještě načítá a nabídka do ní spadá → místo pro štítek
  const wxWait = (t, g) => Boolean(wx.res === lastResult && wx.p && !wx.map && g && wxGeo(g.dest) && wxWin(t.out.date));
  const wxChip = (s, txt) => `<span class="b wxb${s.wet ? ' wet' : ''}" title="${esc(s.title)}">${esc(txt)}</span>`;
  /** Předpověď dorazila: místa pro štítky (.wx-slot) vyplnit na místě, bez nového vykreslení (posun ani fokus se nemění). */
  function wxFill() {
    const host = $('#results'), slots = host ? $$('.wx-slot', host) : [];
    if (!slots.length || (wx.p && !wx.map)) return;
    const cg = slots.some(el => el.dataset.wxc != null) ? new Map(computeGroups().map(g => [g.dest.key, g])) : null;
    for (const el of slots) {
      const cmp = el.dataset.wxc != null, r = cmp ? cg.get(el.dataset.wxc) : rowRegistry[+el.dataset.wxt];
      const s = r && (cmp ? wxOf(r.vis[0], r) : wxOf(r.t, r.g));
      if (!s) { el.remove(); continue; } // bez předpovědi zůstane štítek průměru 🌡️
      $$('.clim', el.closest(cmp ? '.cmp-name' : '.tr-badges') || el.parentNode).forEach(c => c.remove());
      el.outerHTML = cmp ? ' ' + wxChip(s, s.short) : wxChip(s, s.text);
    }
  }

  /**
   * Telefon: u nabídky nejvýš BADGE_TOP štítků (noci, cena, cesta z letiště, brzký odjezd / pozdní návrat – pořadí
   * podle důležitosti), další pod „+N“ – karta má jinak 8 štítků a je na půl obrazovky.
   */
  const BADGE_TOP = 5;
  function foldBadges(host) {
    if (!onPhone()) return;
    $$('.tr-badges', host).forEach(b => {
      const kids = [...b.children].filter(c => !c.classList.contains('wx-slot') && !c.classList.contains('b-more'));
      if (kids.length <= BADGE_TOP + 1 || b.querySelector('.b-more')) return; // „+1“ by nic neušetřilo
      kids.slice(BADGE_TOP).forEach(c => c.classList.add('b-x'));
      b.insertAdjacentHTML('beforeend', `<button type="button" class="b b-more" title="Další údaje o nabídce">+${kids.length - BADGE_TOP} další</button>`);
      b.querySelector('.b-more').onclick = e => { e.stopPropagation(); b.querySelectorAll('.b-x').forEach(x => x.classList.remove('b-x')); e.currentTarget.remove(); };
    });
  }
  // stáří ceny z paměti tras (Wizz Air, ≤ 6 h) v minutách; 0 = čerstvá
  const memAge = t => Math.max(+(t.out && t.out.memAgeMin) || 0, +(t.back && t.back.memAgeMin) || 0);
  function badges(t, g, idx) {
    const out = [];
    // dny dovolené ve stejném štítku jako noci (víkendy a svátky volno, odlet od 16:00 po práci)
    const lv = leaveOf(t), lt = lv && SearchHelp.leaveTxt(lv);
    if (t.nights != null) out.push(`<span class="b"${lt ? ` title="${esc(lt.title)}"` : ''}>🌙 ${nightsTxt(t.nights)}${lt ? ` · ${esc(lt.text)}` : ''}</span>`);
    const pb = priceTag(t, idx); if (pb) out.push(pb);
    // cesta z letiště do města (a zpět na letiště): drahá nebo dlouhá = „levná“ letenka, která levná není → varovně
    const arr = arrivalChips(t);
    out.push(...arr);
    // kdy z domu / kdy doma (odhad): jen když je to v noci – brzký odjezd z domu, návrat domů po půl jedné
    const r = SearchHelp.reach(t, originGround(lastResult, t.out.from), t.back ? originGround(lastResult, t.back.to) : null, { before: SearchHelp.beforeFor(g && g.dest.cc) });
    for (const x of [r.out && r.out.early && r.out, r.back && r.back.late && r.back]) if (x) out.push(`<span class="b${x.warn ? ' warn' : ''}" title="${esc(x.title)}">${esc(x.text)}</span>`);
    // zlevnění u dopravce vedle „🔺 Dráž než obvykle“ bez zelené – jinak by štítky mluvily proti sobě
    const dear = (levelFor(t) || {}).level === 'high';
    if (t.deal.drop) out.push(`<span class="b ${dear ? '' : 'good'}" title="Oproti předchozí ceně u dopravce${dear ? ' – i tak je dráž než obvykle' : ''}">↓ zlevnilo o ${t.deal.drop} %</span>`);
    if (!t.out.live || (t.back && !t.back.live)) out.push(SearchHelp.isCached(t) ? liveBadge(t) : cacheTag([t.out, t.back].find(l => l && l.arrUnknown) || (!t.out.live ? t.out : t.back)));
    // u dvou aerolinek jméno té, jejíž cena je z paměti (stáří = nejstarší z obou letů)
    const age = memAge(t), ml = age && [t.out, t.back].find(l => l && +l.memAgeMin === age);
    if (age) out.push(`<span class="b warn" title="${esc(shopName((ml || t.out).provider))}: tuhle trasu ATLAS prohledal ${Alerts.agoTxt(age * 60e3)} – na jedno hledání smí jen omezený počet dotazů, trasy se proto střídají. Aktuální cenu ukáže rezervace.">⏱ cena ${Alerts.agoTxt(age * 60e3)}</span>`);
    if (t.back && t.back.to !== t.out.from) out.push(`<span class="b info" title="Návrat na jiné letiště než odlet">↩ návrat do ${t.back.to}</span>`);
    // zpět z jiného letiště – štítek cesty „zpět na letiště X“ už to říká
    if (t.back && t.back.from !== t.out.to && arr.length < 2) out.push(`<span class="b info" title="Zpět z jiného letiště v cílové oblasti">✈ zpět z ${t.back.from}</span>`);
    const bags = lastResult?.query.bags;
    if (BAG_LBL[bags] && !t.bagCzk) out.push(`<span class="b good" title="${t.bagEst ? 'Hrubý odhad – u dopravce se to nepodařilo ověřit, zkontroluj při rezervaci' : 'U dopravce bývá v ceně i nejlevnějšího tarifu'}">🧳 ${bags === 'cabin' ? 'kabinový kufr' : 'kufr'} ${t.bagEst ? 'nejspíš ' : ''}v ceně</span>`);
    if (t.back && t.back.provider !== t.out.provider) out.push('<span class="b info" title="Dvě samostatné letenky – při zpoždění prvního letu druhá aerolinka nečeká">🔀 2 aerolinky</span>');
    // cesta do 15 dní: předpověď na dny cesty místo dlouhodobého průměru (dokud se načítá, průměr s místem pro ni);
    // „ideální sezóna“ je dlouhodobá – vedle předpovědi by jí mohla odporovat, s předpovědí zmizí
    const ws = wxOf(t, g), wait = !ws && wxWait(t, g);
    const s = g && !ws ? seasonOk(g.dest.cc, t.out.date) : null;
    if (s === true) out.push(`<span class="b good${wait ? ' clim' : ''}" title="Podle ATLAS je to ideální období pro tuto zemi">📅 ideální sezóna</span>`);
    if (ws) out.push(wxChip(ws, ws.text));
    else if (wait) out.push(`<span class="wx-slot" data-wxt="${idx}"></span>`);
    // řazení „Nejtepleji“ jde podle dlouhodobého průměru – ten zůstane vidět i vedle předpovědi
    if ((!ws || view.sort === 'warm') && t.tempHi != null) out.push(`<span class="b ${t.tempHi >= 25 ? 'sun' : t.tempHi < 15 ? 'info' : ''}${wait ? ' clim' : ''}" title="Dlouhodobý průměr denních maxim v ${MNS_IN[+t.out.date.slice(5, 7) - 1]} (meteostanice u letiště, jinak NASA POWER) – není to předpověď">🌡️ ~${t.tempHi} °C</span>`);
    if (!arr.length && g && g.dest.airportDistKm > 30) out.push(`<span class="b" title="Vzdálenost letiště od centra">📏 ${g.dest.airportDistKm} km od centra</span>`);
    // vstupní podmínky: jen když je co vyřizovat (ESTA, e-vízum…) nebo cesta vychází po konci dočasného režimu, a přestup v zemi, kde registrace platí i pro tranzit
    if (window.Entry) out.push(Entry.flightChip(g?.dest.cc, (t.back || t.out).date), Entry.transitHtml([t.out, t.back], g?.dest.cc));
    return out.join('');
  }

  function bookButtons(t) {
    const btn = (url, label, prov) => url ? `<a class="btn sm book" style="--pc:${provColor(prov)}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${label}</a>` : `<span class="btn sm ghost" title="Demo data nemají rezervační odkaz" style="opacity:.55">${label}</span>`;
    if (t.bookUrl) return btn(t.bookUrl, `Koupit ${t.provider === 'travelpayouts' ? 'na Aviasales' : 'u ' + esc(shopName(t.provider))} ↗`, t.provider);
    if (!t.back) return btn(t.out.bookUrl, `Koupit u ${esc(shopName(t.out.provider))} ↗`, t.out.provider);
    return btn(t.out.bookUrl, `Tam: ${esc(shopName(t.out.provider))} ↗`, t.out.provider) + btn(t.back.bookUrl, `Zpět: ${esc(shopName(t.back.provider))} ↗`, t.back.provider);
  }

  // pax = počet lidí nabídky (📌 Porovnat jde otevřít i bez výsledků na obrazovce)
  function verifyLinks(t, pax = lastResult.query.adults) {
    const sameAp = t.back && t.back.from === t.out.to && t.back.to === t.out.from;
    const gq = (a, b, d1, d2) => `https://www.google.com/travel/flights?hl=cs&curr=CZK&q=${enc(`Flights from ${a} to ${b} on ${d1}${d2 ? ' returning ' + d2 : ' one way'}`)}`;
    const sk = (a, b, d1, d2) => `https://www.skyscanner.cz/transport/flights/${a.toLowerCase()}/${b.toLowerCase()}/${yymmdd(d1)}/${d2 ? yymmdd(d2) + '/' : ''}?adults=${pax}&rtn=${d2 ? 1 : 0}`;
    if (!t.back || sameAp) {
      const d2 = t.back ? t.back.date : null;
      return `<a href="${gq(t.out.from, t.out.to, t.out.date, d2)}" target="_blank" rel="noopener">Google Flights</a> · <a href="${sk(t.out.from, t.out.to, t.out.date, d2)}" target="_blank" rel="noopener">Skyscanner</a>`;
    }
    return `<a href="${gq(t.out.from, t.out.to, t.out.date)}" target="_blank" rel="noopener">tam (Google)</a> · <a href="${gq(t.back.from, t.back.to, t.back.date)}" target="_blank" rel="noopener">zpět (Google)</a>`;
  }

  // res = výsledek, ze kterého nabídka je (📌 Porovnat: složený z odložené nabídky – pinRes); idx = řádek výpisu, jinak null
  function priceBox(t, idx, res = lastResult) {
    const pax = res.query.adults;
    return `<div class="pbox"><div class="pp">${czk(t.perPersonCzk)}</div><div class="pl">na osobu</div>
      <div class="pd">letenky ${czk(t.flightCzk)}${t.bagCzk ? ` + <span title="Odhad příplatku za ${BAG_LBL[res.query.bags] || 'zavazadlo'}${t.bagEst ? ' – hrubý, dopravce se nepodařilo ověřit' : ' – typická cena u dopravce'}">zavazadla ~${czk(t.bagCzk)}</span>` : ''}${groundPart(t, res)}${arrivalPart(t, res)}</div>
      ${pax > 1 ? `<div class="pd">celkem ${pax} os.: <b>${czk(t.totalCzk)}</b></div>` : ''}
      ${idx != null && levelFor(t) ? `<button type="button" class="linkbtn pc-ask" data-pc="${idx}">Je to dobrá cena?</button>` : ''}</div>`;
  }

  function tripRow(t, g, idx) {
    return `<div class="trip-row" data-tid="${esc(t.id)}">
      <div class="tr-legs">${legHtml(t.out)}${t.back ? legHtml(t.back, true) : ''}<div class="tr-badges">${badges(t, g, idx)}</div></div>
      ${priceBox(t, idx)}
      <div class="tr-act"><button type="button" class="btn sm primary" data-pick="${idx}">Vybrat a pokračovat →</button>
        <div class="tr-buy">${bookButtons(t)}</div>
        <div class="tr-more"><span class="faint">Ověřit:</span> ${verifyLinks(t)}${SearchHelp.isCached(t) ? ` · <button type="button" class="linkbtn" data-live="${idx}">⚡ Ověřit cenu živě</button>` : ''}${g && byIso[g.dest.cc] ? ` · <button type="button" class="linkbtn" data-country="${g.dest.cc}">Info o zemi</button>${window.Entry && Entry.idNote(g.dest.cc) ? ' · ' + Entry.idNote(g.dest.cc) : ''}` : ''} · <button type="button" class="linkbtn pin-l" data-pin="${idx}">${pinOn(t) ? '📌 Odloženo ✓' : '📌 Odložit'}</button></div>
      </div></div>`;
  }

  // Navštívené země pro 🆕: z mapy, a když jich je aspoň 3, i domovská země (domov radaru a nejbližší letiště odletu).
  const flagCc = f => { const c = [...String(f || '')].map(x => x.codePointAt(0) - 0x1F1E6); return c.length === 2 && c.every(x => x >= 0 && x < 26) ? String.fromCharCode(65 + c[0], 65 + c[1]) : ''; };
  function visitedNow() {
    const v = new Set(S.visited || []);
    if (v.size < SearchHelp.NEW_MIN) return v;
    for (const p of (S.home && S.home.from) || []) { const cc = p.cc || flagCc(p.flag); if (cc) v.add(cc); }
    const near = ((lastResult && lastResult.origins) || []).filter(o => !o.hub && o.cc).sort((a, b) => (a.distKm ?? 1e9) - (b.distKm ?? 1e9))[0];
    if (near) v.add(near.cc);
    return v;
  }
  // 🆕 u země, kterou ještě nemáš na mapě navštívených (až od 3 označených zemí)
  const newBadge = (cc, vis = visitedNow()) => (SearchHelp.isNewCountry(cc, vis) ? ' <span class="b info new-cc" title="Země, kterou ještě nemáš na mapě navštívených">🆕</span>' : '');
  // ⭐ Moje cíle / 🙈 Nezajímá mě (S.fav, S.mute) – štítek u cíle a ⋯ s volbou (funguje i na telefonu, žádné najetí myší)
  const prefLists = () => ({ fav: Array.isArray(S.fav) ? S.fav.filter(x => x && x.key) : [], mute: Array.isArray(S.mute) ? S.mute.filter(x => x && x.key) : [] });
  // schovávat 🙈 a „⭐ jen moje cíle“ jen ve výsledcích bez konkrétního cíle (Kamkoliv, země, světadíl) – hledaný cíl nikdy
  const prefOn = res => Boolean(res && res.mode === 'explore');
  // ⭐ / 🙈 ve skupinách výsledku res: jediné město hledané země (Malta, Lucembursko – server destination.sole) je hledaný
  // cíl, 🙈 ho neschová
  const prefFor = (res, groups, opts = {}) => SearchHelp.prefGroups(groups, prefLists(), { ...opts, keep: (res && res.destination && res.destination.sole) || null });
  const prefBadge = (key, lists = prefLists()) => ({ fav: ' <span class="b fav-b" title="Moje cíle – chci tam">⭐</span>', mute: ' <span class="b mute-b" title="Nezajímá mě – jinak se tu neukazuje">🙈</span>' }[SearchHelp.destPref(key, lists)] || '');
  const dmBtn = (d, attr = `data-dm="${esc(d.key)}"`) => (SearchHelp.destKeyOf(d.id) ? `<button type="button" class="dm-btn" ${attr} aria-label="${esc(d.label)}: chci tam / nezajímá mě / odložit" title="⭐ Chci tam · 🙈 Nezajímá mě · 📌 Odložit">⋯</button>` : '<span></span>');
  let rowRegistry = [];
  function reg(t, g) { rowRegistry.push({ t, g }); return rowRegistry.length - 1; }
  // Výsledek, ze kterého jsou řádky na obrazovce (rowRegistry): konečný výsledek může v lastResult čekat, než se dá
  // překreslit (paintSoon – prst na obrazovce, otevřené okno), a výpis zatím ukazuje průběžný.
  let shownRes = null;
  // 📌 odložené nabídky výpisu na obrazovce (klíče Pins.rowKey s nastavením jeho hledání) – odkaz „Odloženo ✓“, štítek 📌
  let pinNow = { b: '', keys: new Set(), n: 0 };
  const pinIndex = res => { const l = pinList(); return { b: res && res.query ? Pins.basis(res.query) : '', keys: new Set(l.map(p => p.k)), n: l.length }; };
  const pinOn = t => pinNow.keys.has(Pins.rowKey(t, pinNow.b));

  /** Přehled cílů („kamkoliv“): řádek na město – cena, termín, letiště; klepnutím se rozbalí plná karta s nabídkami. */
  function compactList(groups) {
    if (!groups.length) return '';
    const n = Math.min(groups.length, view.cmpN || 60);
    // 🔥 jen u 5 nejvýhodnějších vůči běžné ceně na tu vzdálenost (super cenu má jinak skoro každý levný cíl nahoře)
    const hot = new Set(groups.map(g => g.vis[0]).filter(t => t.deal.level === 'super').sort((a, b) => (b.deal.score || 0) - (a.deal.score || 0)).slice(0, 5).map(t => t.id));
    const vis = visitedNow(), pl = prefLists();
    const row = (g, gi) => {
      const t = g.vis[0], open = view.cexp && view.cexp.has(g.dest.key), ri = reg(t, g); // ri: nabídka řádku pro 📌 v ⋯
      const when = `${fmtDate(t.out.date)}${t.back ? '–' + fmtDate(t.back.date) : ''}${t.nights != null ? ' · ' + nightsTxt(t.nights) : ''}`;
      // dvě aerolinky / návrat na jiné letiště (kombinace z Kamkoliv) už v řádku – 🔀 a ↩ hned za letišti (konec řádku
      // na telefonu uřízne), druhá aerolinka jménem až za první; plné štítky ukáže rozbalená karta
      const two = t.back && t.back.provider !== t.out.provider ? ` + ${t.back.carrierName || provName(t.back.provider)}` : '';
      const who = [(t.out.carrierName || provName(t.out.provider)) + two, t.out.stops ? `${t.out.stops}× přestup` : ''].filter(Boolean).join(' · ');
      // dny dovolené jen při řazení „Nejméně dovolené“ – na začátku řádku, na telefonu se konec řádku nevejde
      // (jinak je ukáže až rozbalená karta)
      const lv = view.sort === 'leave' ? leaveOf(t) : null, lt = lv && SearchHelp.leaveTxt(lv);
      // řazení „Nejtepleji“: v řádku dlouhodobý průměr (podle něj se řadí), předpověď ukáže rozbalená karta
      const warmSort = view.sort === 'warm', ws = warmSort ? null : wxOf(t, g), wait = !ws && !warmSort && wxWait(t, g);
      // řazení „Nejlevnější letenka“: pod celkovou cenou i cena letenek (podle ní se řadí)
      const tkt = view.sort === 'flight' ? `<small class="cmp-tkt" title="Cena letenek na osobu bez dopravy na letiště, cesty do města a zavazadel – podle ní se teď řadí">${t.back ? 'letenky' : 'letenka'} ${czk(t.flightCzk)}</small>` : '';
      // název se zkrátí (…), štítky za ním zůstanou celé – na telefonu by jinak předpověď uřízl okraj
      // tlačítko řádku (rozbalit) jen vlajka, název, termín a cena – ⋯ vedle něj, ne uvnitř (čtečka obrazovky ho najde
      // jako samostatné tlačítko a nečte ho v názvu řádku); klepnutí kamkoliv na řádek mimo ⋯ rozbalí (myš, prst)
      return `<div class="cmp-row${open ? ' open' : ''}" data-cg="${esc(g.dest.key)}"><div class="cmp-hit" role="button" tabindex="0" aria-expanded="${open}" data-cgh="${esc(g.dest.key)}">
        ${gi < 40 ? `<span class="cmp-flag cmp-ph" data-photo="${esc(g.dest.label)}" style="--h:${ccHue(g.dest.cc)}"><i>${flag(g.dest.cc)}</i></span>` : `<span class="cmp-flag">${flag(g.dest.cc)}</span>`}
        <div class="cmp-main"><div class="cmp-name"><b class="cmp-city">${esc(g.dest.label)}</b><span class="cmp-bdg">${prefBadge(g.dest.key, pl)}${newBadge(g.dest.cc, vis)}${pinOn(t) ? ' <span class="b pin-b" title="Odložená nabídka – 📌 Porovnat">📌</span>' : ''}${hot.has(t.id) ? ' <span class="b hot" title="Jedna z nejvýhodnějších cen vůči běžné ceně na tu vzdálenost">🔥</span>' : ''}${ws ? ' ' + wxChip(ws, ws.short) : `${wait ? `<span class="wx-slot" data-wxc="${esc(g.dest.key)}"></span>` : ''}${t.tempHi != null && (lastResult?.query?.minTemp || warmSort) ? ` <span class="b sun${wait ? ' clim' : ''}">🌡️ ${Math.round(t.tempHi)} °C</span>` : ''}`}</span></div>
          <div class="faint cmp-sub">${lt ? `<span class="cmp-lv" title="${esc(lt.title)}">${esc(lt.text)}</span> · ` : ''}${esc(t.out.from)} → ${esc(t.out.to)}${t.back && t.back.to !== t.out.from ? ` <span title="Návrat na jiné letiště než odlet">↩ ${esc(t.back.to)}</span>` : ''}${two ? ' <span title="2 aerolinky – dvě samostatné letenky, při zpoždění prvního letu druhá aerolinka nečeká">🔀</span>' : ''}<span class="cmp-when"><span class="cmp-dot"> · </span>${when}${who ? ' · ' + esc(who) : ''}${memAge(t) ? ` · ⏱ ${Alerts.agoTxt(memAge(t) * 60e3)}` : ''}</span></div></div>
        <div class="cmp-price"><b${SearchHelp.isCached(t) && liveSt(t, liveGet(SearchHelp.liveKey(t, liveAdults()))) === 'dearer' ? ' class="stale"' : ''}>${czk(t.perPersonCzk)}</b><small>/os.</small>${tkt}${liveHtml(t)}</div></div>${dmBtn(g.dest, `data-dm="${esc(g.dest.key)}" data-dmr="${ri}"`)}<span class="cmp-chev" aria-hidden="true">${open ? '▴' : '▾'}</span>
      </div>${open ? `<div class="cmp-card">${groupCard(g)}</div>` : ''}`;
    };
    return `${topStrip(groups)}<div class="card cmp-list">${groups.slice(0, n).map(row).join('')}</div>${groups.length > n ? `<button type="button" class="more-btn" data-cmore>Zobrazit další cíle (${groups.length - n})</button>` : ''}`;
  }
  // nahoře nad přehledem cílů: první 3 podle řazení jako velké karty s fotkou (klepnutí rozbalí cíl v seznamu)
  function topStrip(groups) {
    if (groups.length < 3) return '';
    const lbl = { warm: '☀️ Nejtepleji', leave: '🏖️ Nejméně dovolené', fast: '⚡ Nejrychleji', flight: '💸 Nejlevnější letenky' }[view.sort] || '💸 Nejlevnější teď';
    return `<div class="section-head res-top-h"><h2>${lbl}</h2></div><div class="dest-grid res-top">${groups.slice(0, 3).map(g => {
      const t = g.vis[0];
      return `<button type="button" class="card dest res-top-c" data-rtop="${esc(g.dest.key)}" data-photo="${esc(g.dest.label)}" style="--h:${ccHue(g.dest.cc)}"><div class="flag">${flag(g.dest.cc)}</div>
        <div class="dest-panel"><div class="cname">${esc(g.dest.label)}</div><div class="cblurb">${fmtDate(t.out.date)}${t.back ? '–' + fmtDate(t.back.date) : ''} · z ${esc(t.out.from)}</div>
        <div class="rt-price">${czk(t.perPersonCzk)}<small>/os.</small></div></div></button>`;
    }).join('')}</div><div class="section-head res-top-h"><h2>Všechny cíle</h2></div>`;
  }
  function groupCard(g) {
    const t = g.vis[0], i0 = reg(t, g); // první řádek karty – i jeho 📌 v ⋯
    // vlak/bus: srovnání s nabídkami, které karta ukazuje (po filtrech výpisu)
    const gc = g.ground ? groundCmp(lastResult, g.ground, g.vis) : null;
    const c = byIso[g.dest.cc];
    const exp = view.expanded.has(g.dest.key);
    const others = g.vis.slice(1);
    // „kamkoliv“: nejlevnější celá cesta sem z každého letiště (ze všech nabídek cíle) – jen u víc letišť po filtru
    // „z BRQ od … · z VIE od …“ jen z nabídek, které karta po filtrech ukazuje (odlet i návrat na totéž letiště)
    const fbm = {};
    if (lastResult && lastResult.mode === 'explore') for (const x of g.vis) if (!x.back || x.back.to === x.out.from) fbm[x.out.from] = Math.min(fbm[x.out.from] ?? Infinity, Math.round(x.perPersonCzk));
    const fb = Object.entries(fbm).sort((a, b) => a[1] - b[1]);
    return `<div class="card res-card" id="g-${esc(g.dest.key)}">
      <div class="rc-head">
        <div class="rc-flag">${flag(g.dest.cc)}</div>
        <div class="rc-name"><h3>${esc(g.dest.label)}${prefBadge(g.dest.key)}${newBadge(g.dest.cc)}</h3><div class="faint">${esc(g.dest.country || '')}${g.dest.airports.length > 1 ? ` · letiště ${g.dest.airports.join(', ')}` : ` · ${g.dest.airports[0]}`}${t.distanceKm ? ` · ${t.distanceKm.toLocaleString('cs')} km` : ''}${c && c.cost ? ` · ceny na místě ${costDots(c.cost)}` : ''}</div></div>
        <button type="button" class="btn sm ghost rc-dp" data-dp="${esc(g.dest.key)}" title="Místa k vidění, cesta z letiště do města, počasí a vstup">🔎 Co tam je</button>
        ${dmBtn(g.dest, `data-dm="${esc(g.dest.key)}" data-dmr="${i0}"`)}
      </div>
      ${fb.length >= 2 ? `<div class="faint rc-from" title="${lastResult.query.kmRate ? 'Nejlevnější celá cesta sem z každého letiště (vč. dopravy na letiště)' : 'Nejlevnější cena sem z každého letiště (bez dopravy na letiště)'}">${fb.slice(0, 4).map(([k, v]) => `z ${esc(k)} od ${czk(v)}`).join(' · ')}</div>` : ''}
      ${gc && (gc.worth || g.ground.min <= GROUND_CHIP_MAX_MIN) ? groundChip(g, gc) : ''}
      ${tripRow(t, g, i0)}
      ${others.length ? `<button type="button" class="more-btn" data-exp="${esc(g.dest.key)}">${exp ? '▲ Skrýt' : `▼ Další termíny a letiště (${others.length})`}</button>
        ${exp ? `<div class="alt-list">${others.map(o => tripRow(o, g, reg(o, g))).join('')}</div>` : ''}` : ''}
      ${lastResult && lastResult.mode !== 'route' && g.dest.id ? `<button type="button" class="more-btn" data-alldates="${esc(g.dest.key)}">📅 Kalendář cen sem – všechny termíny</button>` : ''}
    </div>`;
  }

  function flatList(list) {
    if (!list || !list.length) return `<div class="empty">${view.nights != null ? 'Pro tento odlet a počet nocí nic neodpovídá filtrům – vyber jiný termín v kalendáři nebo mřížce.' : view.outDate ? 'Pro tento den odletu nic neodpovídá filtrům – vyber jiný den v kalendáři.' : 'Filtrům nic neodpovídá.'}</div>`;
    const byKey = new Map(lastResult.groups.map(g => [g.dest.key, g]));
    const n = view.flatN, rest = list.length - n;
    return `<div class="card res-card flat">${list.slice(0, n).map(t => { const g = byKey.get(t.destKey); return tripRow(t, g, reg(t, g)); }).join('')}</div>
      ${rest > 0 ? `<button type="button" class="more-btn" data-fmore="1">▼ ${Math.min(flatPage(), rest) <= 4 ? 'Další' : 'Dalších'} ${plural(Math.min(flatPage(), rest), 'kombinace', 'kombinace', 'kombinací')} (${rest >= 2 && rest <= 4 ? 'zbývají' : 'zbývá'} ${rest})</button>` : ''}`;
  }

  /* ---------- přesná data: jednotlivé lety tam a zpět (jako Google Flights) ---------- */
  let legReg = { out: [], back: [] };
  // trips = kombinace po filtrech i se složenými (filledNow: filtr jednoho směru – třeba „odlet zpět ráno“ nebo
  // „jen přímé“ – nesmí schovat lety, které mu samy vyhoví)
  function legsView(trips, res, pre) {
    const ret = res.query.trip === 'return';
    const sides = ret ? ['out', 'back'] : ['out'];
    // vybraný let, který po změně filtrů ve výpisu není, se nepočítá
    for (const s of sides) if (view.leg[s] && !trips.some(t => t[s] && SearchHelp.legSig(t[s]) === view.leg[s])) view.leg[s] = null;
    if (!trips.length) return flatList(trips);
    const sel = view.leg.out || view.leg.back;
    // kolik letů v každém sloupci skryly filtry času a přestupů
    const hid = side => (SearchHelp.timeActive(view.time) ? new Set(pre.filter(t => t[side]).map(t => SearchHelp.legSig(t[side]))).size : 0);
    // sloupce napřed: legCol plní legReg (i se složenými dvojicemi samostatných letenek)
    const cols = sides.map(side => legCol(trips, side, ret, res, hid(side))).join('');
    let picked = trips.filter(t => (!view.leg.out || SearchHelp.legSig(t.out) === view.leg.out) && (!view.leg.back || (t.back && SearchHelp.legSig(t.back) === view.leg.back)));
    if (!picked.length && view.leg.out && view.leg.back) {
      // dvojice mezi nejlepšími kombinacemi ze serveru není → složit ze dvou samostatných letenek
      const xb = legReg.back.find(x => x.sig === view.leg.back);
      if (xb && xb.paired) picked = [xb.paired];
    }
    const n = view.legMore ? 30 : sel ? 3 : 1;
    const byKey = new Map(res.groups.map(g => [g.dest.key, g]));
    const rows = picked.slice(0, n).map(t => { const g = byKey.get(t.destKey); return tripRow(t, g, reg(t, g)); }).join('');
    const title = sel ? (view.leg.out && view.leg.back ? 'Vybraná cesta' : `Kombinace s vybraným letem ${view.leg.out ? 'tam' : 'zpět'}`) : ret ? 'Nejlevnější celá cesta' : 'Nejlevnější let';
    return `<div class="legs-bar"><span class="faint">${ret ? 'Vyber let tam a zpět – cena je za celou cestu na osobu vč. dopravy na letiště.' : 'Cena na osobu vč. dopravy na letiště.'}</span>
        <div class="seg" id="legSort">${[['price', 'Nejlevnější'], ['time', 'Podle času']].map(o => `<button type="button" data-ls="${o[0]}" class="${view.legSort === o[0] ? 'on' : ''}">${o[1]}</button>`).join('')}</div></div>
      <div class="legs-cols${ret ? '' : ' one'}">${cols}</div>
      <div class="section-head legs-pick" id="legPick"><h2>${title}</h2>${sel ? '<button type="button" class="linkbtn" data-lclear="1">Zrušit výběr</button>' : ''}</div>
      ${picked.length ? `<div class="card res-card flat">${rows}</div>` : '<div class="empty">Tyhle dva lety spolu zkombinovat nejdou – vyber jiný let.</div>'}
      ${picked.length > n ? `<button type="button" class="more-btn" data-lmore="1">▼ ${ret ? 'Další kombinace' : 'Další lety'} (${Math.min(30, picked.length) - n})</button>` : ''}`;
  }
  function legCol(trips, side, ret, res, before = 0) {
    const pair = ret ? view.leg[side === 'out' ? 'back' : 'out'] : null;
    const list = SearchHelp.sortLegs(SearchHelp.distinctLegs(trips, side, pair, legOpts(res)), view.legSort, pair);
    legReg[side] = list;
    const shown = view.legAll[side] || list.length <= 12 ? list : list.slice(0, 10);
    const days = [...new Set(list.map(x => x.leg.date))].sort();
    const when = days.length === 1 ? dayLabel(days[0]) : `${fmtDate(days[0])}–${fmtDate(days[days.length - 1])}`;
    const hidden = Math.max(0, before - list.length);
    return `<div class="lcol" id="lcol-${side}"><div class="lcol-h"><b>${side === 'out' ? '🛫 Tam' : '🛬 Zpět'}</b><span>${when}</span><span class="faint">${plural(list.length, 'let', 'lety', 'letů')}${hidden ? ` · <span title="Skryto filtry času a přestupů">${hidden} skryto</span>` : ''}</span></div>
      <div class="lcol-list">${shown.map((x, i) => legRow(x, side, i, pair, ret, days.length > 1)).join('')}</div>
      ${shown.length < list.length ? `<button type="button" class="more-btn" data-lall="${side}">▼ Všech ${list.length} letů</button>` : ''}</div>`;
  }
  function legRow(x, side, i, pair, ret, showDate) {
    const l = x.leg, sel = view.leg[side] === x.sig;
    const dim = Boolean(pair) && !x.paired;
    const t = pair && x.paired ? x.paired : x.best;
    const meta = [dur(l.durationMin), l.stops ? stopsTxt(l) : 'přímý', l.carrierName || provName(l.provider)].filter(Boolean).map(esc).join(' · ');
    const price = dim ? `<small>jen s jiným letem ${side === 'out' ? 'zpět' : 'tam'}</small>`
      : `<b>${ret && !pair ? 'od ' : ''}${czk(t.perPersonCzk)}</b>${ret ? `<small>${pair ? 'celá cesta' : 'tam i zpět'}</small>` : ''}`;
    return `<button type="button" class="lrow${sel ? ' sel' : ''}${dim ? ' dim' : ''}" data-leg="${side}:${i}" data-lsig="${esc(side + ':' + x.sig)}" aria-pressed="${sel}">
      <span class="cbadge" style="background:${provColor(l.provider)}" title="${esc(l.carrierName || provName(l.provider))}">${esc(l.carrier || '?')}</span>
      <span class="lr-main"><span class="lr-t">${showDate ? `<span class="ld">${dayLabel(l.date)}</span>` : ''}<b>${esc(timeOf(l)) || '—'}</b>${arrTime(l) ? ` <span class="arr">→</span> <b>${esc(arrTime(l))}</b>` : arrUnk(l) ? ` <span class="arr">→</span> ${arrUnk(l)}` : ''}<span class="lr-ap">${esc(l.from)} → ${esc(l.to)}</span></span>
        <span class="lr-x">${meta}</span>${cacheTag(l)}${depsHtml(l, 'lr-od')}</span>
      <span class="lr-p">${price}${l.czk > 0 && !t.combined ? `<small class="lr-f">letenka ${czk(l.czk)}</small>` : ''}</span>
    </button>`;
  }

  /* ---------- cesta přes víc měst: lety po krocích, vybraná cesta, nejlevnější kombinace ---------- */
  // „Praha → Řím · Neapol → Praha“: navazující lety jednou šipkou, přejezd mezi nimi tečkou (stejně jako server).
  function multiRoute(legs) {
    return legs.map((l, i) => (!i ? `${l.from} → ${l.to}` : l.from === legs[i - 1].to ? ` → ${l.to}` : ` · ${l.from} → ${l.to}`)).join('');
  }
  const mOpt = (res, i, a) => res.legs[i].options[a];
  // Lety do míst na cestě (bez posledního letu domů); země cesty = jejich cíle + země odletu (open-jaw) – vstupní podmínky.
  const mVisit = res => res.legs.slice(0, res.returnsHome ? res.legs.length - 1 : res.legs.length);
  const mCountries = res => [...new Set([...mVisit(res).map(l => l.dest && l.dest.cc), ...res.legs.slice(1).map(l => l.fromCc)].filter(cc => cc && cc !== 'CZ'))];
  // země přestupů vybraných letů, kde registrace platí i pro tranzit (jen kódy)
  const mVia = (res, opts) => (window.Entry ? Entry.transitCcs(opts.map(o => o.out), mCountries(res)) : []);
  // Vybrané lety platné pro tento výsledek (jinak null).
  const mPicks = res => res.legs.map((l, i) => { const a = view.mPicks[i]; return Number.isInteger(a) && a >= 0 && a < l.options.length ? a : null; });
  // autem s návratem domů (parkování, ne odvoz): nejlevnější cesta se vrací na letiště, kde auto parkuje – jako kombinace ze serveru
  const mEnds = res => (res.query.groundMode === 'car' && res.returnsHome && res.legs.length >= 2 && res.origins.some(o => o.ground && o.ground.mode === 'car' && !o.ground.dropOff)
    ? { from: res.legs[0].options.map(o => o.out.from), to: res.legs[res.legs.length - 1].options.map(o => o.out.to) } : null);
  const mPlan = (res, picks = mPicks(res)) => SearchHelp.multiPlan(res.legs.map(l => l.options.map(o => o.perPersonCzk)), res.links, picks, mEnds(res));

  function renderMulti(res) {
    const host = $('#results');
    const legs = res.legs, n = legs.length, pax = res.query.adults;
    const picks = mPicks(res), plan = mPlan(res, picks);
    const any = picks.some(x => x != null), full = picks.every(x => x != null);
    const cheapest = res.combos[0] || null;
    const head = kiwiBanner(res) + `<div class="res-head">
      <div><h2>🗺️ ${esc(res.destination.label)}</h2>
      <div class="muted" style="font-size:13px">${plural(n, 'let', 'lety', 'letů')} · ${fmtDate(legs[0].date)} → ${fmtDate(legs[n - 1].date)} · ${pax} os.${BAG_LBL[res.query.bags] ? ` · 🧳 vč. ${res.query.bags === 'cabin' ? 'kabinového kufru' : 'kufru k odbavení'}` : ''}${cheapest ? ` · celá cesta nejlevněji <b class="good">${czk(cheapest.perPersonCzk)}</b>/os.` : ''}</div></div>
      <div class="res-tools"><div class="seg" id="mSort">${[['price', 'Nejlevnější'], ['time', 'Podle času']].map(o => `<button type="button" data-ms="${o[0]}" class="${view.legSort === o[0] ? 'on' : ''}">${o[1]}</button>`).join('')}</div></div></div>
      ${filterChips(SearchHelp.activeFilters(res.filters))}
      ${res.demo ? '<div class="note warn" style="margin-bottom:14px">⚠️ <div><b>DEMO data</b> – ceny i lety jsou vymyšlené, slouží jen k vyzkoušení aplikace.</div></div>' : ''}
      ${res.fx && res.fx.source === 'approx' && !res.demo ? '<div class="note warn" style="margin-bottom:14px">💱 <div>Kurzy měn se nepodařilo načíst – přepočet do Kč je orientační.</div></div>' : ''}
      <div class="note info mc-note">🎫 <div><b>Každý let je samostatná letenka</b> – kupuješ je zvlášť, tlačítkem u každého letu.
        <details class="mc-why"><summary>Co to znamená?</summary>Když se jeden let zpozdí nebo ho zruší, další aerolinka na tebe nečeká a peníze nevrací. ATLAS proto páruje lety s rezervou: na stejném letišti aspoň 3 h (jiné letiště téhož města 5 h), z jiného města nejdřív další den a aspoň 8 h po příletu.</details></div></div>`;
    const steps = `<div class="legs-bar"><span class="faint">Vyber let v každém kroku – cena celé cesty se přepočítá a lety, které na výběr nenavazují, zešednou s důvodem.</span>${any ? '<button type="button" class="linkbtn" data-mclear="1">Zrušit výběr</button>' : ''}</div>
      <div class="mc-cols">${legs.map((l, i) => mCol(res, i, picks, plan)).join('')}</div>`;
    const title = full ? 'Vybraná cesta' : any ? 'Nejlevnější cesta s vybranými lety' : 'Nejlevnější celá cesta';
    const body = `<div class="section-head legs-pick" id="mcPick"><h2>${title}</h2></div>`
      + (plan.best ? mCard(res, plan.best.picks) : `<div class="empty">${any ? 'Vybrané lety spolu nejdou spojit – vyber jiný let nebo zruš výběr.' : esc(mEmptyTxt(res))}</div>`);
    const foot = `<div class="res-foot faint">Ceny jsou za osobu ${bagFoot(res.query.bags)}, ${esc(groundFoot(res, true))}, ${esc(arrivalFoot(res, true))}; přejezdy mezi městy na cestě se nepočítají. Živé ceny se mohou do rezervace změnit. Kurz: ${res.fx ? `1 EUR = ${res.fx.eurCzk.toFixed(2)} Kč (${esc(res.fx.source)})` : '—'}.</div>`;
    host.innerHTML = head + steps + body + (res.combos.length > 1 ? mCombos(res, picks) : '') + foot;
    wireMulti(host, res);
    wireHelp(host);
  }
  // Proč není žádná celá cesta: krok bez letů, filtr ceny, nebo lety, které na sebe nenavazují.
  function mEmptyTxt(res) {
    const none = res.legs.findIndex(l => !l.options.length);
    if (none >= 0) return `Pro ${none + 1}. let (${res.legs[none].label}) jsem ${res.legs[none].flex ? 'v tyto dny' : 'v tento den'} nic nenašel – zkus jiný den nebo ± dny (u kroku nahoře).`;
    if (res.filters && res.filters.hidden && res.filters.hidden.maxPrice) return `Všechny cesty jsou dražší než tvůj limit ${czk(res.filters.maxPrice)}/os. – zruš ho v aktivních filtrech.`;
    return 'Nalezené lety na sebe nenavazují (další let odlétá dřív, než předchozí přistane, nebo bez rezervy) – posuň datum dalšího letu nebo zvol ± dny.';
  }
  function mCol(res, i, picks, plan) {
    const l = res.legs[i];
    const items = l.options.map((o, a) => ({ o, a })).sort(view.legSort === 'time'
      ? (x, y) => (x.o.out.dep || '').localeCompare(y.o.out.dep || '') || x.o.perPersonCzk - y.o.perPersonCzk
      : (x, y) => x.o.perPersonCzk - y.o.perPersonCzk);
    const all = view.mAll[i] || items.length <= 8;
    let shown = all ? items : items.slice(0, 6);
    if (!all && picks[i] != null && !shown.some(x => x.a === picks[i])) shown = [...shown, items.find(x => x.a === picks[i])]; // vybraný let vždy vidět
    return `<div class="lcol" id="mcol-${i}"><div class="lcol-h"><b>${i + 1}. let</b><span>${esc(l.label)}</span><span class="faint">${dayLabel(l.date)}${l.flex ? ` ± ${l.flex}` : ''} · ${plural(l.options.length, 'let', 'lety', 'letů')}</span></div>
      <div class="lcol-list">${l.options.length ? shown.map(x => mRow(res, i, x.a, picks, plan)).join('') : mNone(res, i)}</div>
      ${shown.length < items.length ? `<button type="button" class="more-btn" data-mall="${i}">▼ Všech ${items.length} letů</button>` : ''}</div>`;
  }
  function mRow(res, i, a, picks, plan) {
    const o = mOpt(res, i, a), l = o.out, n = res.legs.length, sel = picks[i] === a;
    const prev = i && picks[i - 1] != null ? res.links[i - 1][picks[i - 1]][a] : null;
    const next = i < n - 1 && picks[i + 1] != null ? res.links[i][a][picks[i + 1]] : null;
    const th = plan.through[i][a];
    // krok bez letů: celou cestu nesložit nejde kvůli němu, ne kvůli tomuhle letu
    const gap = res.legs.some(x => !x.options.length);
    const why = prev ? SearchHelp.multiWhy(prev, 'prev') : next ? SearchHelp.multiWhy(next, 'next') : th == null && !gap ? 'nenavazuje na žádný let ostatních kroků' : '';
    const dim = !sel && Boolean(why);
    const rest = picks.every((x, j) => j === i || x != null); // ostatní kroky vybrané → přesná cena celé cesty
    const meta = [dur(l.durationMin), l.stops ? stopsTxt(l) : 'přímý', l.carrierName || provName(l.provider)].filter(Boolean).map(esc).join(' · ');
    return `<button type="button" class="lrow${sel ? ' sel' : ''}${dim ? ' dim' : ''}" data-mleg="${i}:${a}" aria-pressed="${sel}">
      <span class="cbadge" style="background:${provColor(l.provider)}" title="${esc(l.carrierName || provName(l.provider))}">${esc(l.carrier || '?')}</span>
      <span class="lr-main"><span class="lr-t">${res.legs[i].flex ? `<span class="ld">${dayLabel(l.date)}</span>` : ''}<b>${esc(timeOf(l)) || '—'}</b>${arrTime(l) ? ` <span class="arr">→</span> <b>${esc(arrTime(l))}</b>` : arrUnk(l) ? ` <span class="arr">→</span> ${arrUnk(l)}` : ''}<span class="lr-ap">${esc(l.from)} → ${esc(l.to)}</span></span>
        <span class="lr-x">${meta}</span>${cacheTag(l)}${dim ? `<span class="mc-why">⚠️ ${esc(why)}</span>` : ''}</span>
      <span class="lr-p"><b>${czk(o.perPersonCzk)}</b>${th != null && !dim && n > 1 ? `<small>celá cesta ${rest ? '' : 'od '}${czk(th)}</small>` : ''}${o.groundCzk || o.bagCzk || o.arrCzk ? `<small class="lr-f" title="${esc(`letenka ${czk(o.flightCzk)}${o.groundCzk ? ` + ${res.query.groundMode === 'car' ? 'autem' : 'doprava'} ${i ? 'z letiště domů' : 'na letiště'} ${czk(o.groundCzk)}/os.${res.query.groundMode === 'car' && !i ? (originGround(res, l.from)?.dropOff ? ` (odvoz: ${resFuel(res)?.fuel === 'ev' ? 'nabíjení' : 'palivo'} tam i zpět)` : ` (${resFuel(res)?.fuel === 'ev' ? 'nabíjení' : 'palivo'} a parkování na celou cestu)`) : ''}` : ''}${o.bagCzk ? ` + zavazadla ~${czk(o.bagCzk)}` : ''}${o.arrCzk ? ` + cesta mezi letištěm a městem ~${czk(o.arrCzk)}/os.` : ''}`)}">letenka ${czk(o.flightCzk)}</small>` : ''}</span>
    </button>`;
  }
  // Krok bez letů: nejlevnější okolní dny (známé z hledání) a ± 3 dny jedním kliknutím.
  function mNone(res, i) {
    const l = res.legs[i];
    const near = ((l.nearby && l.nearby.days) || []).filter(d => d.date !== l.date).sort((a, b) => a.cost - b.cost).slice(0, 4).sort((a, b) => a.date.localeCompare(b.date));
    return `<div class="mc-none"><p>${l.flex ? 'V tyto dny' : 'V tento den'} jsem let nenašel.</p>
      ${near.length ? `<div class="mc-near">${near.map(d => `<button type="button" class="fchip" data-mday="${i}:${esc(d.date)}">${dayLabel(d.date)} · od ${czk(d.cost)}</button>`).join('')}</div>` : ''}
      ${l.flex < 3 ? `<button type="button" class="btn sm" data-mflex="${i}">Hledat ± 3 dny</button>` : ''}</div>`;
  }
  // Mezi lety: pobyt ve městě (noci), nebo čas na přestup; jiné letiště / město = přejezd vlastní dopravou.
  function mGap(res, i, p, q) {
    const aDate = p.arr && p.hasTime ? p.arr.slice(0, 10) : p.date;
    const days = SearchHelp.diffDays(aDate, q.date);
    const city = res.legs[i - 1].to, from = res.legs[i].from;
    const wall = s => Date.parse(String(s).slice(0, 16) + ':00Z');
    let txt = days > 0 ? `🏙️ ${esc(city)}: ${nightsTxt(days)}`
      : p.arr && p.hasTime && q.hasTime ? `⏱ ${hm(Math.max(0, Math.round((wall(q.dep) - wall(p.arr)) / 60000)))} na přestup` : '⏱ týž den';
    if (p.to !== q.from) txt += city === from ? ` · jiné letiště ${esc(p.to)} → ${esc(q.from)}` : ` · přejezd ${esc(city)} → ${esc(from)} (${esc(p.to)} → ${esc(q.from)}) vlastní dopravou`;
    return `<div class="mc-gap">${txt}</div>`;
  }
  function mBuy(o, i) {
    const url = o.bookUrl || o.out.bookUrl, prov = o.bookUrl ? o.provider : o.out.provider;
    const gq = `https://www.google.com/travel/flights?hl=cs&curr=CZK&q=${enc(`Flights from ${o.out.from} to ${o.out.to} on ${o.out.date} one way`)}`;
    return (url ? `<a class="btn sm book" style="--pc:${provColor(prov)}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">Koupit ${i + 1}. let ${prov === 'travelpayouts' ? 'na Aviasales' : 'u ' + esc(shopName(prov))} ↗</a>`
      : `<span class="btn sm ghost" title="Demo data nemají rezervační odkaz" style="opacity:.55">Koupit ${i + 1}. let</span>`)
      + ` <a class="mc-ver" href="${esc(gq)}" target="_blank" rel="noopener">Ověřit (Google)</a>`;
  }
  function mCard(res, picks) {
    const n = res.legs.length, pax = res.query.adults;
    const opts = picks.map((a, i) => mOpt(res, i, a));
    const sum = k => opts.reduce((s, o) => s + (o[k] || 0), 0);
    const total = sum('perPersonCzk');
    const wiz = mWizOk(res, picks);
    // vstupní podmínky v zemích na cestě (bez návratu domů) – čip u letu do země, kde je co vyřizovat;
    // odlet z jiné země, než kam vedl předchozí let (přejezd: tam do Turecka, zpět z Egypta), má čip té země u svého letu
    const visit = mVisit(res), chipped = new Set(visit.map(l => l.dest && l.dest.cc));
    const entry = i => {
      if (!window.Entry) return '';
      const to = i < visit.length ? Entry.flightChip(res.legs[i].dest?.cc, (opts[i + 1] || opts[i]).out.date) : '';
      const cc = i ? res.legs[i].fromCc : null;
      const from = cc && !chipped.has(cc) && cc !== res.legs[i - 1].dest?.cc ? Entry.flightChip(cc, opts[i].out.date) : '';
      return from + to;
    };
    // cesta z města na letiště odletu a z letiště příletu do města u každého letu (ne doma)
    const home = new Set((res.origins || []).map(x => x.iata));
    const arr = o => SearchHelp.arrivalLegChips(o.out, res.arrivals, home, { on: Boolean(res.query.arrival) }).map(arrChipHtml).join('');
    const legs = opts.map((o, i) => `${i ? mGap(res, i, opts[i - 1].out, o.out) : ''}<div class="mc-leg"><div class="mc-lh"><span class="mc-n">${i + 1}. let</span><span class="mc-lab">${esc(res.legs[i].label)}</span>${entry(i)}<b>${czk(o.perPersonCzk)}</b></div>${legHtml(o.out)}${arr(o) ? `<div class="mc-arr">${arr(o)}</div>` : ''}<div class="mc-buy">${mBuy(o, i)}</div></div>`).join('');
    const badges = [`<span class="b info" title="Každý let kupuješ zvlášť – při zpoždění jednoho letu další aerolinka nečeká">🎫 ${plural(n, 'samostatná letenka', 'samostatné letenky', 'samostatných letenek')}</span>`,
      window.Entry ? Entry.transitHtml(opts.map(o => o.out), mCountries(res)) : '',
      new Set(opts.map(o => o.out.provider)).size > 1 ? '<span class="b info">🔀 víc aerolinek</span>' : '',
      opts.some(o => !o.out.live) ? cacheTag(opts.map(o => o.out).find(l => l.arrUnknown) || opts.find(o => !o.out.live).out) : '',
      BAG_LBL[res.query.bags] && opts.every(o => !o.bagCzk) ? `<span class="b good">🧳 ${res.query.bags === 'cabin' ? 'kabinový kufr' : 'kufr'} v ceně</span>` : '',
      // autem: ručně vybraný návrat na jiné letiště, než kde auto parkuje – cena přejezd k autu nepočítá
      res.query.groundMode === 'car' && res.returnsHome && opts[n - 1].out.to !== opts[0].out.from && !originGround(res, opts[0].out.from)?.dropOff
        ? `<span class="b warn" title="Cena počítá s návratem k autu – cesta mezi letišti v ní není">🚗 auto stojí u ${esc(opts[0].out.from)}, návrat na ${esc(opts[n - 1].out.to)}</span>` : ''].join('');
    const why = wiz ? (n === 2 && res.returnsHome ? `Průvodce cestou: ubytování (i ve víc městech), auto a program – přílet ${esc(opts[0].out.to)}, odlet ${esc(opts[1].out.from)}.`
      : `Průvodce cestou: ubytování a program v každém městě (${esc(mVisit(res).map(l => (l.dest ? l.dest.label : l.to).replace(/ \(.*\)$/, '')).join(', '))}) – noci podle letů${res.returnsHome ? '' : ', v posledním městě kolik chceš'}.`)
      : n === 2 && res.returnsHome ? 'Návrat nevede na začátek cesty – průvodce cestou ho neumí, cestu uložím do plánovače (lety i do kalendáře).'
          : 'Mezi lety není v některém městě ani jedna noc (nebo ho neznám) – cestu uložím do plánovače (lety i do kalendáře).';
    return `<div class="card res-card flat"><div class="trip-row mc-row" id="mcSel">
      <div class="tr-legs">${legs}<div class="tr-badges">${badges}</div></div>
      <div class="pbox"><div class="pp">${czk(total)}</div><div class="pl">celá cesta na osobu</div>
        <div class="pd">letenky ${czk(sum('flightCzk'))}${sum('bagCzk') ? ` + zavazadla ~${czk(sum('bagCzk'))}` : ''}${sum('groundCzk') ? ` + <span title="${esc(groundFoot(res, true))}">${res.query.groundMode === 'car' ? 'autem' : 'doprava'} na letiště${res.returnsHome ? ' a zpět' : ''} ${czk(sum('groundCzk'))}/os.</span>` : ''}${sum('arrCzk') ? ` + <span title="${esc(arrivalFoot(res, true))}">z letišť do měst a zpět ~${czk(sum('arrCzk'))}/os.</span>` : ''}</div>
        ${pax > 1 ? `<div class="pd">celkem ${pax} os.: <b>${czk(total * pax)}</b></div>` : ''}</div>
      <div class="tr-act"><button type="button" class="btn sm primary" data-mgo="1">${wiz ? 'Vybrat a pokračovat →' : 'Vybrat a uložit do plánovače →'}</button>
        ${wiz ? '<button type="button" class="btn sm" data-msave="1">💾 Do plánovače</button>' : ''}
        <button type="button" class="btn sm" data-mics="1">📅 Do kalendáře (.ics)</button>
        <div class="tr-more faint">${why}</div></div>
    </div></div>`;
  }
  function mCombos(res, picks) {
    const list = res.combos.slice(0, view.mCombos);
    const same = c => c.picks.every((a, i) => a === picks[i]);
    return `<div class="section-head"><h2>Nejlevnější kombinace</h2><span class="faint">celé cesty podle ceny · klikni a vyberu je nahoře</span></div>
      <div class="card mc-combos">${list.map((c, k) => `<button type="button" class="mc-combo${same(c) ? ' sel' : ''}" data-mcombo="${k}" aria-pressed="${same(c)}">
        <span class="mc-cl">${c.picks.map((a, i) => { const l = mOpt(res, i, a).out; return `<span><b>${i + 1}.</b> ${dayLabel(l.date)} ${esc(timeOf(l))} ${esc(l.from)} → ${esc(l.to)} <i>${esc(l.carrierName || l.carrier || '')}${l.stops ? ` · ${l.stops}× přestup` : ''}</i></span>`; }).join('')}</span>
        <span class="mc-cp"><b>${czk(c.perPersonCzk)}</b><small>/os.</small></span></button>`).join('')}</div>
      ${res.combos.length > list.length ? `<button type="button" class="more-btn" data-mcmore="1">▼ Další kombinace (${Math.min(10, res.combos.length - list.length)})</button>` : ''}`;
  }
  function wireMulti(host, res) {
    const best = () => (mPlan(res).best || {}).picks;
    $$('[data-ms]', host).forEach(b => b.onclick = () => { view.legSort = b.dataset.ms; rerender(true); });
    $$('[data-mleg]', host).forEach(b => b.onclick = () => {
      const [i, a] = b.dataset.mleg.split(':').map(Number), picks = mPicks(res);
      if (picks[i] === a) picks[i] = null;
      else {
        picks[i] = a;
        // vybrané sousední lety, které na tenhle nenavazují, se zruší – vybrat znovu
        if (i && picks[i - 1] != null && res.links[i - 1][picks[i - 1]][a]) picks[i - 1] = null;
        if (i < picks.length - 1 && picks[i + 1] != null && res.links[i][a][picks[i + 1]]) picks[i + 1] = null;
      }
      view.mPicks = picks;
      rerender(true);
      // sloupce pod sebou (mobil): posunout k dalšímu kroku, nebo k vybrané cestě
      const k = picks.findIndex(x => x == null), next = k >= 0 ? $('#mcol-' + k) : $('#mcPick');
      if (picks[i] != null && next && next.getBoundingClientRect().top > innerHeight * 0.75) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $$('[data-mall]', host).forEach(b => b.onclick = () => { view.mAll[b.dataset.mall] = true; rerender(true); });
    $$('[data-mclear]', host).forEach(b => b.onclick = () => { view.mPicks = []; rerender(true); });
    $$('[data-mcombo]', host).forEach(b => b.onclick = () => {
      const c = res.combos[+b.dataset.mcombo]; if (!c) return;
      view.mPicks = c.picks.slice(); rerender(true);
      $('#mcPick').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $$('[data-mcmore]', host).forEach(b => b.onclick = () => { view.mCombos += 10; rerender(true); });
    $$('[data-mgo]', host).forEach(b => b.onclick = () => { const p = best(); if (p) (mWizOk(res, p) ? multiWizard : multiSave)(res, p); });
    $$('[data-msave]', host).forEach(b => b.onclick = () => { const p = best(); if (p) multiSave(res, p); });
    $$('[data-mics]', host).forEach(b => b.onclick = () => { const p = best(); if (p) multiIcs(res, p); });
    $$('[data-mday]', host).forEach(b => b.onclick = () => { const [i, d] = b.dataset.mday.split(':'); mRerunLeg(+i, { date: d }); });
    $$('[data-mflex]', host).forEach(b => b.onclick = () => mRerunLeg(+b.dataset.mflex, { flex: 3 }));
  }
  /** Jiný den nebo ± dny u jednoho letu → nové hledání (pozdější lety se případně posunou, ať jdou po sobě). */
  function mRerunLeg(i, patch) {
    const legs = ((lastForm && lastForm.legs) || []).map(l => ({ ...l }));
    if (!legs[i]) return;
    Object.assign(legs[i], patch);
    for (let j = i + 1; j < legs.length; j++) if (legs[j].date < legs[j - 1].date) legs[j].date = legs[j - 1].date;
    rerun({ trip: 'multi', legs });
  }
  /**
   * Cíle letů cesty přes víc měst (bez letu domů) jako místa trasy: cíl úseku, jen když do něj vybraný let opravdu
   * vede (úsek „do Itálie“ může mít let jinam) – jinak null.
   */
  const mStops = (res, opts) => mVisit(res).map((l, i) => (l.dest && opts[i] && opts[i].destKey === l.dest.key ? l.dest : null));
  /**
   * Jde cesta do průvodce? 2 lety tam a zpět domů (open-jaw), nebo trasa podle letů s aspoň 1 nocí v každém městě –
   * s návratem domů i bez něj (poslední město pak na počet nocí, který se zadá v průvodci).
   */
  function mWizOk(res, picks) {
    const n = res.legs.length;
    if (n < 2) return false;
    if (n === 2 && res.returnsHome) return true;
    const opts = picks.map((p, i) => mOpt(res, i, p));
    return Boolean(window.Trip && Trip.flyOk) && opts.every(Boolean)
      && Trip.flyOk({ out: opts[0].out, mid: opts.slice(1, res.returnsHome ? -1 : n).map(o => o.out), back: res.returnsHome ? opts[n - 1].out : null }, mStops(res, opts));
  }
  /** Lety tam a zpět domů → průvodce cestou: 2 lety jako open-jaw (přílet do 1. cíle, odlet z místa 2. letu), víc letů
   *  jako trasa podle letů (místa = cíle letů, mezi nimi lety t.mid). */
  function multiWizard(res, picks) {
    const opts = picks.map((p, i) => mOpt(res, i, p)), n = opts.length, a = opts[0], b = opts[n - 1], home = res.returnsHome;
    const sum = k => opts.reduce((s, o) => s + (o[k] || 0), 0), per = sum('perPersonCzk');
    // bez návratu domů: všechny další lety vedou do dalších měst, zpět žádný
    const mid = opts.slice(1, home ? -1 : n).map(o => o.out), route = !home || n > 2;
    const t = {
      id: opts.map(o => o.id).join('#'), out: a.out, back: home ? b.out : null, ...(mid.length ? { mid } : {}), flightCzk: sum('flightCzk'),
      groundCzk: sum('groundCzk'), bagCzk: sum('bagCzk'), bagEst: opts.some(o => o.bagEst) || undefined,
      arrCzk: sum('arrCzk'),
      perPersonCzk: per, totalCzk: per * res.query.adults, nights: home ? SearchHelp.diffDays(a.out.date, b.out.date) : null,
      provider: opts.every(o => o.out.provider === a.out.provider) ? a.out.provider : 'mix', combined: false, bookUrl: null,
      distanceKm: a.distanceKm, destKey: a.destKey, tempHi: a.tempHi, deal: { level: 'normal', score: null, drop: null },
    };
    const dest = res.legs[0].dest || { label: res.legs[0].to, cc: '', country: '', lat: null, lon: null };
    Trip.start({ t, g: { dest }, result: { origins: res.origins, query: res.query, home: res.home, priceStats: null, arrivals: res.arrivals }, ccs: mCountries(res), at: SearchHelp.shownAt(res, lastResultAt, Date.now()), ...(route ? { stops: mStops(res, opts) } : {}) });
  }
  /** Cesta do plánovače: všechny lety (časy a zóny pro kalendář), odkazy na koupi v poznámkách. */
  function multiSave(res, picks) {
    const opts = picks.map((p, i) => mOpt(res, i, p)), n = opts.length, last = opts[n - 1].out;
    const per = opts.reduce((s, o) => s + o.perPersonCzk, 0), pax = res.query.adults;
    const visit = res.legs.slice(0, res.returnsHome ? n - 1 : n);
    const ccs = [...new Set(visit.map(l => l.dest && l.dest.cc).filter(Boolean))], all = mCountries(res), via = mVia(res, opts);
    S.trips.push({
      name: res.destination.label.slice(0, 120), dest: [...new Set(visit.map(l => l.to))].join(', ').slice(0, 120) || '—',
      iso: ccs.length === 1 && byIso[ccs[0]] ? ccs[0] : null,
      // víc zemí na cestě: jen kódy zemí (vstupní podmínky se dopočítají z dat, sdílený odkaz zůstane krátký)
      ...(all.length > 1 ? { isos: all } : {}),
      // přestupy v zemích, kde registrace platí i pro tranzit (ESTA v USA…)
      ...(via.length ? { via } : {}),
      start: opts[0].out.date, end: last.arr && last.hasTime ? last.arr.slice(0, 10) : last.date,
      pax: String(pax), budget: String(Math.round(per * pax)),
      flight: `${opts.map((o, i) => `${i + 1}. ${o.out.from}→${o.out.to} ${fmtDate(o.out.date)} ${timeOf(o.out)} (${o.out.carrierName || provName(o.out.provider)})`).join(', ')} · ${plural(n, 'samostatná letenka', 'samostatné letenky', 'samostatných letenek')}`.slice(0, 500),
      legs: opts.map(o => Trip.legBrief(o.out)), days: {}, checklist: PACK.map(x => ({ t: x, done: false })),
      notes: ['Každý let je samostatná letenka – kup je zvlášť:', ...opts.map((o, i) => `${i + 1}. let ${o.out.from}→${o.out.to} ${fmtDate(o.out.date)}: ${o.bookUrl || o.out.bookUrl || 'rezervace u aerolinky'}`)].join('\n'),
    });
    save();
    toast('Cesta uložena do plánovače');
    go('planner');
    setTimeout(() => openTrip(S.trips.length - 1), 250);
  }
  /** Všechny lety cesty (+ celodenní blok celé cesty) do kalendáře (.ics). */
  function multiIcs(res, picks) {
    const opts = picks.map((p, i) => mOpt(res, i, p)), n = opts.length, last = opts[n - 1].out;
    const route = res.destination.label;
    const ev = [{ title: `🧳 ${route}`, start: opts[0].out.date, end: last.arr && last.hasTime ? last.arr.slice(0, 10) : last.date,
      description: `${plural(n, 'let', 'lety', 'letů')} · ${res.query.adults} os. · každý let je samostatná letenka`, location: res.legs.map(l => l.to).join(', ') },
    ...opts.map((o, i) => Ics.flightEvent(Trip.legBrief(o.out), { url: o.bookUrl || o.out.bookUrl || undefined, note: `${i + 1}. let z ${n} · ${route} · samostatná letenka` }))];
    // „🛂 Vyřídit ESTA (USA)“ před prvním odletem – země cesty i přestupy s registrací
    if (window.Entry) ev.push(...Entry.reminders(mCountries(res), opts[0].out.date, fmtYMD(new Date()), mVia(res, opts)));
    icsDownload(`atlas-${route}`, ev, { name: route });
  }

  /* ---------- přesná data: nejbližší dny (±3) ---------- */
  function nearbyHtml(res, hot) {
    const nb = res.nearby;
    if (!nb || !nb.out || !res.query.exact) return '';
    // bez cen v okolních dnech má pruh smysl jen jako rychlý výběr jiného dne, když je výsledků málo
    const other = [nb.out, nb.back].some(x => x && x.days.some(d => d.date !== x.around));
    if (!hot && !other) return '';
    // autem tam i zpět: řádky se sčítají na cenu celé cesty (server, carNear) – parkování na celou cestu je u Tam,
    // u Zpět jen jeho změna proti zadanému návratu (a rozdíl, kdyby auto stálo u jiného letiště)
    const carRet = res.query.groundMode === 'car' && res.query.trip === 'return' && Boolean(nb.back);
    const sgn = v => `${v > 0 ? '+' : '−'}${czk(Math.abs(v))}`;
    const days0 = carRet ? SearchHelp.parkDays(SearchHelp.diffDays(res.query.exact.out, res.query.exact.back)) : 0;
    const carTip = (c, which) => {
      if (which === 'out') {
        return ` – let tam + cesta autem na letiště${c.parkCzk ? ` + parkování na ${plural(c.parkDays, 'den', 'dny', 'dní')} ~${czk(c.parkCzk)}/os.` : ''}`
          + `${c.tripAdj ? ` + návrat k autu do ${c.from} ${sgn(c.tripAdj)} proti řádku Zpět` : ''}`;
      }
      if (c.tripAdj) return ` – let zpět + cesta autem domů; auto by stálo u ${c.to}: let tam odtud ${sgn(c.tripAdj)}${c.parkCzk ? `, parkování ${sgn(c.parkCzk)}` : ''} proti řádku Tam`;
      const k = c.parkDays ? Math.abs(c.parkDays - days0) : 0;
      const pk = !c.parkCzk ? '' : k ? ` ${c.parkCzk > 0 ? '+' : '−'} o ${plural(k, 'den', 'dny', 'dní')} ${c.parkCzk > 0 ? 'delší' : 'kratší'} parkování ~${czk(Math.abs(c.parkCzk))}/os.`
        : ` ${c.parkCzk > 0 ? '+' : '−'} rozdíl parkování ~${czk(Math.abs(c.parkCzk))}/os.`;
      return ` – let zpět + cesta autem domů${pk} (parkování na celou cestu je v řádku Tam)`;
    };
    const row = (side, which) => {
      const cells = SearchHelp.nearStrip(side, { minDate: which === 'back' ? res.query.exact.out : null });
      return `<div class="nb-row"><span class="nb-lab">${which === 'out' ? '🛫 Tam' : '🛬 Zpět'}</span><div class="nb-days">${cells.map(c => {
        const d = new Date(c.date + 'T12:00:00');
        const tip = c.cost != null ? `${dayLabel(c.date)}: ${carRet ? '' : 'nejlevnější let '}od ${czk(c.cost)}/os.${c.carrierName ? ` (${c.carrierName}${c.stops ? ', s přestupem' : ''})` : ''}${carRet ? carTip(c, which) : c.parkCzk ? ` – vč. parkování na ${plural(c.parkDays, 'den', 'dny', 'dní')} ~${czk(c.parkCzk)}/os.` : ''}`
          : c.around ? `${dayLabel(c.date)}: nic nenalezeno` : c.disabled ? `${dayLabel(c.date)}: návrat před odletem nejde` : `${dayLabel(c.date)}: cenu zatím neznám – klikni a vyhledám`;
        return `<button type="button" class="nb-d${c.around ? ' on' : ''}${c.best ? ' best' : ''}${c.cost == null ? ' none' : ''}" data-nb="${which}:${esc(c.date)}" ${c.around || c.disabled ? 'disabled' : ''} title="${esc(tip)}"><span>${DOW[d.getDay()]}</span><span>${d.getDate()}. ${d.getMonth() + 1}.</span><b>${c.cost != null ? Math.round(c.cost).toLocaleString('cs-CZ') : c.around ? '—' : '?'}</b></button>`;
      }).join('')}</div></div>`;
    };
    const head = hot ? SearchHelp.nearHeadline(nb) : null;
    const priced = [nb.out, nb.back].some(x => x && x.days.length);
    const what = carRet ? `cena dne v Kč/os. (let + cesta autem${res.query.arrival ? ' + z letiště do města' : ''}) – parkování na celou cestu je u Tam, u Zpět jen o kolik se změní, takže Tam + Zpět = cena celé cesty`
      : `nejlevnější let daného dne v Kč/os. vč. dopravy na letiště${res.query.arrival ? ' i z letiště do města' : ''}`;
    return `<div class="card nb-card${hot ? ' hot' : ''}"><div class="nb-h"><b>📅 Nejbližší dny</b><span class="faint">${priced ? what : 'ceny okolních dnů zatím neznám'} · klikni na den a hledám znovu</span></div>
      ${head ? `<div class="nb-hint">💡 ${esc(head)}</div>` : ''}${row(nb.out, 'out')}${nb.back ? row(nb.back, 'back') : ''}</div>`;
  }
  function pickNearDay(which, d) {
    const f = lastForm; if (!f) return;
    if (which === 'back') return rerun({ dateMode: 'exact', xBack: d });
    const patch = { dateMode: 'exact', xOut: d };
    // návrat zůstává; jen kdyby byl před novým odletem, posune se se zachovaným počtem nocí
    if (f.trip === 'return' && f.xBack && f.xBack < d) patch.xBack = SearchHelp.addDays(d, Math.max(0, SearchHelp.diffDays(f.xOut, f.xBack)));
    rerun(patch);
  }

  /* ---------- vlak nebo bus místo letadla (odhad ze serveru, spoje až na vyžádání) ---------- */
  // Datum spojů: přesná data → den odletu a návratu; den vybraný v kalendáři; jinak dny nejlevnější cesty
  // (bez letů začátek rozsahu).
  function groundDates(res, t) {
    const q = res.query;
    if (q.exact) return { out: q.exact.out, back: q.exact.back || null };
    if (view.outDate) return { out: view.outDate, back: view.nights != null ? addDays(view.outDate, view.nights) : null };
    if (t) return { out: t.out.date, back: t.back ? t.back.date : null };
    return { out: q.dateFrom < today() ? today() : q.dateFrom, back: null };
  }
  // Nabídky do cíle srovnání s vlakem/busem: u víc cílů v hledání (Berlín, Budapešť…) jen do toho, ke kterému je odhad.
  // Skupina má jen nejlevnější nabídky – u konkrétního cíle i žebříček kombinací (top), ať je mezi nimi i nejrychlejší let.
  const groundTrips = res => {
    const k = res.ground && res.ground.destKey, g = k && res.groups.find(x => x.dest.key === k);
    if (!g) return [];
    const seen = new Set(g.options.map(t => t.id));
    return g.options.concat((res.top || []).filter(t => t.destKey === k && !seen.has(t.id)));
  };
  // Nabídky pro srovnání – jen ty, které projdou filtry výpisu (čas, přestupy, cena…), i dvojice složené ve výpisu.
  const groundVisible = res => { const k = res.ground && res.ground.destKey; return k ? visibleTrips(groundTrips(res)).concat(filledNow.filter(t => t.destKey === k)) : []; };
  // Lety se našly, jen je skryly filtry (ze vstupu, za teplem nebo ve výpisu) – ne „nic nenalezeno“.
  const groundHidden = res => groundTrips(res).length > 0 || (!res.groups.length && (Object.values((res.filters && res.filters.hidden) || {}).some(n => n > 0) || Boolean(res.warm && res.warm.dropped > 0)));
  /**
   * Letadlo × vlak/bus nad nabídkami, které výpis ukazuje: nejlevnější cesta i s časem svého letu tam (vč. přestupů),
   * nejrychlejší se svou cenou (je-li aspoň o hodinu rychlejší – u zpáteční oběma směry) a podle nich „vyplatí se?“
   * i důvod – stejné pravidlo jako server (Ground.worth), aby text srovnával s letem, který je vidět.
   * x = odhad ze serveru (res.ground / g.ground); pool = přesná data tam i zpět: kombinace, ze kterých složit
   * nejrychlejší dvojici samostatných letenek (SearchHelp.fastPair, projde filtry výpisu).
   * → { t: nejlevnější cesta | null, door, fast: { t, doorMin } | null, worth, reason }
   */
  function groundCmp(res, x, trips, { hidden = false, pool = null } = {}) {
    const home = Boolean(res.home && Number.isFinite(res.home.lat));
    const access = iata => { const o = home && res.origins.find(a => a.iata === iata); return o && o.ground ? +o.ground.minutes || 0 : 0; };
    // let od dveří ke dveřím: tam z domova na letiště odletu, zpět z letiště cíle domů (ap = letiště domova)
    const legDoor = (l, ap) => Ground.flightDoor(l, access(ap), x.egressMin || 0);
    if (pool) {
      const f = SearchHelp.fastPair(pool, (l, side) => legDoor(l, side === 'out' ? l.from : l.to), legOpts(res));
      const sig = t => SearchHelp.legSig(t.out) + '#' + (t.back ? SearchHelp.legSig(t.back) : '');
      if (f && !trips.some(t => sig(t) === sig(f))) trips = trips.concat(f);
    }
    const p = Ground.planeOptions(trips, t => legDoor(t.out, t.out.from), t => Ground.tripDoor(t, legDoor));
    const t = p.cheap && p.cheap.t;
    const est = { ok: true, minutes: x.min, czk: x.czk, typ: x.typ };
    if (t) {
      const w = Ground.worth(est, { doorMin: p.cheap.doorMin, czk: t.perPersonCzk, trips: t.back ? 2 : 1, fast: p.fast && { doorMin: p.fast.doorMin, czk: p.fast.t.perPersonCzk } });
      return { t, door: p.cheap.doorMin, fast: p.fast, worth: w.worth, reason: w.reason };
    }
    // lety jsou, ale filtry je skryly: důvod ze serveru by jmenoval skrytý let
    if (hidden) { const w = Ground.worth(est, {}); return { t: null, door: null, fast: null, worth: w.worth, reason: w.worth ? w.reason : `Vlakem/busem ~${Ground.hm(x.min)} (odhad) – lety skryly filtry, srovnání s letadlem se ukáže po jejich uvolnění.` }; }
    return { t: null, door: null, fast: null, worth: x.worth, reason: x.reason };
  }
  // Čip u cílů kamkoliv jen pro rozumně dlouhou cestu (Benátky ~12 h vlakem by jen zahlcovaly výpis), výhodnou vždy.
  const GROUND_CHIP_MAX_MIN = 8 * 60;
  function groundChip(g, c) {
    const x = g.ground, ret = lastResult.query.trip === 'return';
    const tip = `${c.reason || ''} Cena: ${Ground.priceTxt(x, ret ? 2 : 1)} na osobu${ret ? ' tam i zpět' : ''}, odhad. Klikni pro spoje a odkazy.`;
    return `<button type="button" class="gnd-chip${c.worth ? ' hot' : ''}" data-gchip="${esc(g.dest.key)}" title="${esc(tip.trim())}">${esc(Ground.chipText(x, ret))} <small>odhad</small></button>`;
  }
  // Srovnání letadlo × vlak/bus: cena na osobu a čas od dveří ke dveřím (vlak/bus = jízda + 30 min na nádraží; cena
  // běžná – co typicky zaplatíš v daný den – a pod ní „od“). Cena i čas letadla vždy z téže cesty (c = groundCmp);
  // hidden = lety jsou, ale žádný neprošel filtry.
  function groundCompare(x, c, ret, hidden = false) {
    const n = ret ? 2 : 1, t = c && c.t;
    const time = t ? (c.door ? `~${Ground.hm(Ground.round5(c.door))} od dveří ke dveřím · ${t.out.stops ? `${t.out.stops}× přestup` : 'přímý let'}${ret ? ' (tam)' : ''}`
      : t.out.stops ? 'délku cesty s přestupem neznám – ověř' : '')
      : !hidden && x.doorMin ? `~${Ground.hm(x.doorMin)} od dveří ke dveřím` : '';
    const fast = t && c.fast ? `<span class="gb-fast">⚡ nejrychlejší ~${Ground.hm(Ground.round5(c.fast.doorMin))} od ${czk(c.fast.t.perPersonCzk)}${ret ? ' tam i zpět' : ''}</span>` : '';
    return `<div class="gb-cmp">
      <div class="gb-col"><span class="gb-l">✈️ Letadlo</span>${t ? `<b>od ${czk(t.perPersonCzk)}</b><small>na osobu${ret ? ', tam i zpět' : ''}</small>` : hidden ? '<b>skryto filtry</b><small>lety jsou, ale žádný neprošel filtry</small>' : '<b>nic nenalezeno</b><small>pro zadané termíny</small>'}${time ? `<span>${esc(time)}</span>` : ''}${fast}</div>
      <div class="gb-col win"><span class="gb-l">🚆 Vlak / bus <em>odhad</em></span><b>${x.typ > 0 ? 'běžně' : 'od'} ~${czk(Ground.typOf(x) * n)}</b><small>${x.typ > 0 && x.czk > 0 && x.czk < x.typ ? `od ~${czk(x.czk * n)} · ` : ''}na osobu${ret ? ', tam i zpět' : ''}</small><span>~${Ground.hm(x.min + 30)} od dveří ke dveřím</span></div>
    </div>`;
  }
  // Banner a panel se spoji u konkrétního cíle: nabídky po filtrech a u přesných dat tam i zpět i nejrychlejší dvojice
  // samostatných letenek (přímý let tam i zpět mezi nejlevnějšími kombinacemi ze serveru často není).
  const bannerCmp = (res, hidden = false) => groundCmp(res, res.ground, groundVisible(res), { hidden, pool: legsOk(res) && res.query.trip === 'return' ? groundTrips(res) : null });
  function groundBanner(res) {
    const x = res.ground;
    if (!x) return '';
    const ret = res.query.trip === 'return', hidden = groundHidden(res);
    const c = bannerCmp(res, hidden), t = c.t;
    const src = `${x.regiojet ? 'RegioJet – živé ceny po kliknutí' : 'RegioJet tu nejezdí'}${x.flixbus ? ' · FlixBus – jen odkaz' : ''} · IDOS a Google Mapy – odkazy`;
    if (!c.worth && t) {
      return `<div class="gnd-line">🚆 <div>Vlakem/busem ${esc(x.from)} → ${esc(x.to)} ~${esc(Ground.hm(x.min))} · ${ret ? 'tam i zpět ' : ''}${esc(Ground.priceTxt(x, ret ? 2 : 1))} – odhad, letadlo tu vychází lépe. <button type="button" class="linkbtn" data-gshow="1">Spoje a odkazy</button></div></div><div id="gndPanel"></div>`;
    }
    return `<div class="card gnd-banner">
      <div class="gb-h"><span class="gb-ic">🚆</span><div><b>${esc(x.from)} → ${esc(x.to)} i vlakem nebo busem</b><div class="muted">${esc(c.reason || '')}</div></div></div>
      ${groundCompare(x, c, ret, !t && hidden)}
      <div class="gb-act"><button type="button" class="btn sm primary" data-gshow="1">${view.gndOpen ? 'Skrýt spoje' : 'Ukázat spoje'}</button><span class="faint">${esc(src)}</span></div>
      <div id="gndPanel"></div></div>`;
  }
  /** Panel se spoji pod srovnáním (výsledky ke konkrétnímu cíli i prázdný výsledek). */
  function showGround(open, scroll = true) {
    const res = lastResult, x = res && res.ground, host = $('#gndPanel');
    view.gndOpen = Boolean(open && x && host);
    $$('[data-gshow]').forEach(b => { if (b.classList.contains('btn')) b.textContent = view.gndOpen ? 'Skrýt spoje' : 'Ukázat spoje'; });
    if (!host) return;
    if (!view.gndOpen) { host.innerHTML = ''; return; }
    const t = bannerCmp(res).t, d = groundDates(res, t);
    Ground.panel(host, { q: x.q, date: d.out, back: d.back, adults: res.query.adults, flight: { czk: t ? t.perPersonCzk : null, trips: t && t.back ? 2 : 1, min: t ? t.out.durationMin : null } });
    if (scroll) host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  /** Spoje k jedné destinaci z „kamkoliv“ (čip u výsledku) v okně. */
  function openGroundModal(g) {
    const x = g.ground, res = lastResult, c = groundCmp(res, x, g.vis || [g.best]), t = c.t || g.best, d = groundDates(res, t);
    modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" onclick="modalClose()" aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button>
      <div class="modal-hero-inner"><h2 style="font-size:22px">🚆 ${esc(x.from)} → ${esc(x.to)}</h2><div style="opacity:.88;font-size:13px">vlakem nebo busem · ~${x.km.toLocaleString('cs')} km vzdušnou čarou · ${esc(Ground.basisTxt(x.basis, x.hills))}</div></div></div>
      <div class="modal-body"><div class="muted gm-why">${esc(c.reason || '')}</div>${groundCompare(x, c, Boolean(t && t.back))}<div id="gndModalPanel"></div></div>`);
    Ground.panel($('#gndModalPanel'), { q: x.q, date: d.out, back: d.back, adults: res.query.adults, flight: { czk: t.perPersonCzk, trips: t.back ? 2 : 1, min: t.out.durationMin } });
  }

  /* ---------- 🔎 Co tam je: náhled cíle z výsledků a radaru ---------- */
  // Nejlevnější týden často vede do neznámého města (Trapani, Kutaisi, Řešov): okno hned ukáže, co výsledek ví (vstup,
  // ceny na místě, z letiště do města, počasí, vlak/bus), „Co vidět“ dočte až po otevření (Places.preview – stejný dotaz
  // jako Objevuj, „🗺️ Naplánovat v Objevuj“ ho převezme). Na telefonu list zespodu, jinak okno uprostřed.
  const COST_TXT = ['', 'velmi levné', 'levné', 'střední', 'dražší', 'drahé'];
  const DP_WAIT = 12000; // déle „Co vidět“ nečeká – pak „zkus Objevuj“ (dotaz běží dál a doplní se, když dorazí)
  const cap = x => (x ? x[0].toUpperCase() + x.slice(1) : '');
  // „~20 Kč“, „1 h 15“, „30 min“ se na telefonu nerozdělí na dva řádky
  const nbsp = x => String(x).replace(/(\d) (?=Kč|zł|€|£|Ft|lei|h\b|min\b)/g, '$1\u00a0').replace(/\bh (?=\d)/g, 'h\u00a0');
  let dpSeq = 0;
  const dpGeo = new Map(); // název|země → střed města z api/geocode
  // Střed města (SearchHelp.destCenter); u odhadu cesty z letiště ho dohledá api/geocode (jako průvodce cestou), nejvýš
  // 6 s – jinak poloha cíle (letiště).
  async function dpCenter(d) {
    const c = SearchHelp.destCenter(d, d.ar), own = { lat: d.lat, lon: d.lon, label: d.label };
    if (c) return c;
    const k = `${d.label}|${d.cc}`;
    if (!dpGeo.has(k)) {
      const find = async () => {
        for (const q of SearchHelp.geoNames(d.label)) {
          const j = await fetch(`api/geocode?q=${enc(q)}&cc=${enc(d.cc || '')}`).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
          const h = SearchHelp.geoCenter(j.items, d.cc, d);
          if (h) return h;
        }
        return null;
      };
      const h = await Promise.race([find(), new Promise(r => setTimeout(r, 6000, null))]);
      if (!h) return own;
      dpGeo.set(k, h);
    }
    return dpGeo.get(k);
  }
  // Cesta z letiště do města jako u nabídky (SearchHelp.arrivalChips) – řádek okna: ikona, text, čím jet a poznámka
  // (zpět na jiné letiště spoj z města na letiště – sub štítku).
  const dpArr = (t, A, on) => SearchHelp.arrivalChips(t, A, { on }).map(c => {
    const [ic, ...w] = c.text.split(' ');
    return { ic, b: nbsp(cap(w.join(' '))), s: c.sub, title: c.title, warn: c.warn };
  });
  // „Vybrat a pokračovat“: průvodce s nabídkou; res = výsledek, ze kterého nabídka je (i průběžný, když konečný čeká na
  // překreslení) – jinak by cesta vzala statistiku cen průběžné skupiny jako konečnou; konečný už dorazil → statistika
  // z něj hned (finalStats na něj už nepočká); čas cen do průvodce („cena z 3. 10. 14:12“): konečný výsledek
  // z lastResultAt (i obnovený), náhled ze svého času (i ten, který po nedokončeném hledání zůstal na obrazovce);
  // 📌 odložená nabídka nese svůj čas (at)
  function pickTrip(t, g, res, at = SearchHelp.shownAt(res, lastResultAt, Date.now())) {
    Trip.start({ t, g, result: res, at });
    if (lastResult && !lastResult.partial && Trip.finalStats) Trip.finalStats(lastResult);
  }
  /** Náhled cíle z karty výsledků: g = cíl, t = nejlepší nabídka karty, res = výsledek, ze kterého karta je. */
  /**
   * 👀 Cíl, který uživatele ve výsledcích zaujal (rozbalil ho, otevřel náhled) – jen z hledání aspoň 3 cílů (kamkoliv,
   * země, oblast); tip v prázdném poli Kam pak nabídne hledat jen tam (smartTips).
   */
  function noteViewed(key) {
    const res = shownRes || lastResult, g = res && res.groups && res.groups.length >= 3 && res.groups.find(x => x.dest.key === key);
    if (!g || !g.dest.id) return;
    S.viewed = SearchHelp.viewedAdd(S.viewed, { id: g.dest.id, label: g.dest.label, cc: g.dest.cc || '', czk: g.best ? Math.round(g.best.perPersonCzk) : null, at: Date.now() });
    save();
  }
  function openDestPreview(g, t, { res = shownRes || lastResult, from = null } = {}) {
    noteViewed(g.dest.key);
    const x = g.dest, back = t.back || null, w = wx;
    const gc = g.ground ? groundCmp(res, g.ground, g.vis || [g.best]) : null;
    dpShow({
      id: x.id, label: x.label, cc: x.cc, country: x.country || '', lat: x.lat, lon: x.lon, aps: x.airports && x.airports.length ? x.airports : [t.out.to],
      ar: res.arrivals && res.arrivals[t.out.to], d1: t.out.date, d2: back ? back.date : null, nights: back ? t.nights : null, czk: t.perPersonCzk,
      arrDay: t.out.hasTime && t.out.arr ? String(t.out.arr).slice(0, 10) : t.out.date, // program od dne příletu (noční let)
      // zpět z jiného letiště / na jiné letiště jako na kartě radaru: „BRQ → WAW ↩ WMI → BRQ“, „BRQ → ERF ↩ BTS“
      route: `${t.out.from} → ${t.out.to}${back && (back.from !== t.out.to || back.to !== t.out.from) ? ` ↩ ${back.from !== t.out.to ? `${back.from} → ` : ''}${back.to}` : ''}`,
      arr: dpArr(t, res.arrivals, Boolean(res.query.arrival)), tempHi: t.tempHi,
      // předpověď výsledku (štítky výpisu) – žádný dotaz navíc
      wxP: w.res === res && (w.map || w.p) ? (w.map ? Promise.resolve(w.map) : w.p.then(() => w.map)) : null,
      ground: gc && (gc.worth || g.ground.min <= GROUND_CHIP_MAX_MIN) ? { x: g.ground, ret: Boolean(back), c: gc, open: () => openGroundModal(g) } : null,
      go: () => pickTrip(t, g, res), goLbl: 'Vybrat let a pokračovat →',
    }, from);
  }
  /** Náhled z karty radaru (ⓘ): r = výsledek radaru, x = karta, q = dotaz radaru. */
  function openRadarPreview(r, x, q, from) {
    const c = byIso[x.cc], back = x.d2 && (!x.bf || x.bf === x.to) ? { from: x.to } : null; // zpět z jiného letiště: cestu z něj karta nezná
    dpShow({
      id: x.id, label: x.label, cc: x.cc, country: c ? c.cs : '', lat: x.lat, lon: x.lon, aps: [x.to], ar: x.ar,
      d1: x.d1, d2: x.d2 || null, nights: x.d2 ? SearchHelp.diffDays(x.d1, x.d2) : null, arrDay: x.d1, czk: x.czk, route: SearchHelp.radarRoute(x),
      arr: x.ar ? dpArr({ out: { to: x.to }, back }, { [x.to]: x.ar }, true) : [], tempHi: null,
      wxP: radarWxP && radarWxP.r === r ? radarWxP.p : null, ground: null,
      go: () => radarGo(x, q), goLbl: x.buy && x.buy.length ? 'Všechny termíny →' : 'Hledat lety sem →', buy: x.buy,
    }, from);
  }
  const dpFact = (ic, b, s, { cls = '', title = '' } = {}) => `<div class="dp-f${cls}"${title ? ` title="${esc(title)}"` : ''}><span class="dp-fi" aria-hidden="true">${ic}</span><div><b>${b}</b>${s ? `<small>${s}</small>` : ''}</div></div>`;
  // Počasí: do 15 dní předpověď na dny cesty, jinak dlouhodobý průměr měsíce (u nabídky ze serveru hned, u karty radaru
  // z api/climate). Řádek { ic, b (HTML), s, title }.
  const dpWxRow = w => `<div class="dp-f" id="dpWx"${w.title ? ` title="${esc(w.title)}"` : ''}><span class="dp-fi" aria-hidden="true">${w.ic}</span><div><b>${w.b}</b><small>${esc(w.s)}</small></div></div>`;
  // Weather.summary („☀️ 22° · 💧 10 %“, „🌧️ prší 2 dny ze 3“) → ikona zvlášť, „Přes den ~22 °C · 💧 10 %“ jako průměr
  const dpFc = (d, s) => { const [ic, ...w] = s.text.split(' '); return { ic, b: esc(cap(w.join(' ').replace(/^(-?\d+)°/, 'přes den ~$1 °C'))), s: `předpověď na ${d.d2 ? 'dny cesty' : 'první 3 dny'} (Open-Meteo)`, title: s.title }; };
  const dpClim = (d, wait) => (d.tempHi != null ? { ic: '🌡️', b: `Přes den ~${Math.round(d.tempHi)} °C`, s: `dlouhodobý průměr v ${MNS_IN[+String(d.d1).slice(5, 7) - 1]} – ${wait ? 'předpověď se načítá' : 'není to předpověď'}` } : null);
  async function dpWx(d) {
    if (!window.Weather || !wxGeo(d)) return null;
    if (wxWin(d.d1)) {
      const m = d.wxP ? await d.wxP.catch(() => null) : null;
      const s = (m && wxSum(m, d, d.d1, d.d2)) || wxSum(await Weather.span([{ lat: d.lat, lon: d.lon }]), d, d.d1, d.d2);
      if (s) return dpFc(d, s);
    }
    if (d.tempHi != null) return dpClim(d, false);
    const n = await Weather.normal(d.lat, d.lon, d.d1).catch(() => null);
    if (!n || !Number.isFinite(+n.hi)) return null;
    return { ic: '🌡️', b: `Přes den ~${Math.round(n.hi)} °C${Number.isFinite(+n.lo) ? `, v noci ~${Math.round(n.lo)} °C` : ''}`, s: `dlouhodobý průměr v ${MNS_IN[n.month]}${Number.isFinite(+n.p) ? `, srážky ~${Math.round(n.p)} mm za měsíc` : ''} – není to předpověď` };
  }
  // Vlak/bus místo letadla (jako čip u cíle): „Vlakem/busem ~4 h 20 · tam i zpět běžně ~900 Kč“, pod tím proč (bez opakování)
  function dpGround({ x, ret, c }) {
    const lead = `Vlakem/busem ~${Ground.hm(x.min)}`, why = String(c.reason || '');
    const rest = cap((why.startsWith(lead) ? why.slice(lead.length) : why).replace(/^\s*(?:–|a)\s+/, ''));
    return dpFact('🚆', `${esc(lead)} · ${ret ? 'tam i zpět ' : ''}${esc(Ground.priceTxt(x, ret ? 2 : 1))} <span class="dp-est">odhad</span>`,
      `${rest ? `${esc(rest)} ` : ''}<button type="button" class="linkbtn" id="dpGnd">Spoje a odkazy</button>`, { cls: c.worth ? ' hot' : '' });
  }
  const dpSkel = () => `<div class="dp-sl">${'<div class="dp-poi"><div class="dp-img skel"></div><div class="dp-pt"><span class="skel dp-sk"></span><span class="skel dp-sk s"></span></div></div>'.repeat(4)}</div><div class="faint dp-more"><span class="spin dark"></span> Hledám, co tam stojí za vidění…</div>`;
  const dpFail = why => `<div class="note warn dp-fail" role="status">⚠️ <div><b>Místa se nepodařilo načíst – zkus Objevuj.</b>${why ? ` ${esc(why)}` : ''}</div></div>`;
  // Koupit let z karty radaru přímo z detailu (odkaz obchodu z hledání radaru – cena se u prodejce může mezitím změnit)
  function dpBuy(d) {
    const buy = (Array.isArray(d.buy) ? d.buy : []).filter(b => Array.isArray(b) && /^https?:\/\//i.test(String(b[0] || '')));
    const shop = p => (p === 'travelpayouts' ? 'na Aviasales' : 'u ' + shopName(p));
    return buy.map(([u, p, leg]) => `<a class="btn primary" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${leg === 'out' ? 'Let tam' : leg === 'back' ? 'Let zpět' : 'Koupit let'} ${esc(shop(p))} ↗</a>`).join('');
  }
  function dpHtml(d) {
    // „víkend“ podle termínu cesty, jak ho okno ukazuje (ne podle dne příletu – noční let pá → so by z pá–út udělal víkend)
    const c = byIso[d.cc], geo = Boolean(window.Places && wxGeo(d)), w = dpClim(d, Boolean(window.Weather) && wxGeo(d) && wxWin(d.d1)), st = SearchHelp.stayPlan(d.d1, d.d2);
    const ent = window.Entry && d.cc && d.cc !== 'CZ' ? Entry.flightChip(d.cc, d.d2 || d.d1) || Entry.cardChip(d.cc) : '';
    const day = x => `<span class="dp-nw">${dayLabel(x)}</span>`;
    return `<div class="dp" role="dialog" aria-modal="true" aria-labelledby="dpTitle">
      <div class="dp-hero" data-photo="${esc(d.label)}" style="--h:${ccHue(d.cc)}" aria-hidden="true"></div>
      <div class="dp-head"><span class="dp-flag" aria-hidden="true">${flag(d.cc)}</span><div class="dp-ttl"><h2 id="dpTitle">${esc(d.label)}</h2><div class="muted">${[esc(d.country), `letiště ${d.aps.map(esc).join(', ')}`].filter(Boolean).join(' · ')}</div></div>
        <button type="button" class="icon-btn dp-x" id="dpX" aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button></div>
      <div class="dp-trip">✈︎ <span class="dp-nw">${esc(d.route)}</span> · ${day(d.d1)}${d.d2 ? ` – ${day(d.d2)}` : ''} · <span class="dp-nw">${d.d2 ? (d.nights != null ? nightsTxt(d.nights) : 'zpáteční') : 'jen tam'}</span> · <span class="dp-nw"><b>${czk(d.czk)}</b>/os.</span></div>
      <div class="dp-chips">${ent}${c && c.cost ? `<span class="b dp-cost" title="Cenová hladina země – jídlo, doprava a ubytování na místě">ceny na místě ${costDots(c.cost)} ${COST_TXT[c.cost]}</span>` : ''}${c ? '<button type="button" class="linkbtn" id="dpCountry">Info o zemi</button>' : ''}</div>
      <div class="dp-facts">
        ${d.arr.map(a => dpFact(a.ic, esc(a.b), esc(a.s), { cls: a.warn ? ' warn' : '', title: a.title })).join('')}
        ${w ? dpWxRow(w) : '<div class="dp-f" id="dpWx" hidden></div>'}
        ${d.ground ? dpGround(d.ground) : ''}
      </div>
      ${geo ? `<h3 class="dp-h" id="dpSightsH">Co vidět</h3><div id="dpSights" aria-live="polite" aria-busy="true">${dpSkel()}</div>` : ''}
      <div class="dp-act">${dpBuy(d)}${geo ? `<button type="button" class="btn" id="dpPlan">🗺️ Naplánovat ${st.weekend ? 'víkend' : 'pobyt'} v Objevuj</button>` : ''}<button type="button" class="btn${dpBuy(d) ? '' : ' primary'}" id="dpGo">${esc(d.goLbl)}</button></div>
    </div>`;
  }
  function dpShow(d, from) {
    const my = ++dpSeq;
    modalOpen(dpHtml(d));
    if (window.Photos) Photos.paint($('#modal')); // velká fotka města nahoře (jako detail v cestovních aplikacích)
    $('#modal').scrollTop = 0; // okno si jinak drží posun z minulého otevření
    dpOpen(from);
    $('#dpX').onclick = () => dpClose();
    $('#dpGo').onclick = () => dpClose(d.go);
    const cb = $('#dpCountry'); if (cb) cb.onclick = () => openCountry(d.cc); // přes náhled – Zpět zavře i to
    const gb = $('#dpGnd'); if (gb) gb.onclick = () => d.ground.open();
    // okno je pořád tohle (mezitím nezavřené, nepřepsané jiným oknem) → prvek, jinak null
    const mine = sel => (my === dpSeq && $('#modalBg').classList.contains('show') ? $(sel) : null);
    dpWx(d).then(w => { const el = mine('#dpWx'); if (el && w) el.outerHTML = dpWxRow(w); }).catch(() => { });
    if (!$('#dpSights')) return;
    const center = dpCenter(d);
    let got = null;
    const fill = html => { const b = mine('#dpSights'); if (b) { b.innerHTML = html; b.removeAttribute('aria-busy'); } };
    const slow = setTimeout(() => { if (!got) fill(dpFail('Nové místo se poprvé načítá i půl minuty – v Objevuj na něj počkáš.')); }, DP_WAIT);
    center.then(c => {
      // místa jiného města než v názvu cíle (Memmingen → Mnichov, Mallorca → Palma): řekne, kterého
      const h = mine('#dpSightsH'); if (h && norm(c.label) !== norm(SearchHelp.geoNames(d.label)[0] || '')) h.textContent = `Co vidět · ${c.label}`;
      return Places.preview(c);
    }).then(j => { got = j; fill(Places.previewHtml(j.items, j.km) + (j.demo ? '<div class="faint dp-more">⚠️ demo data – místa jsou vymyšlená</div>' : '')); })
      .catch(e => { if (!got) fill(dpFail(e && e.message)); })
      .finally(() => clearTimeout(slow));
    const pb = $('#dpPlan');
    pb.onclick = async () => {
      pb.disabled = true; // střed města se ještě dohledává (nejvýš 6 s)
      const c = await center, st = SearchHelp.stayPlan(d.arrDay, d.d2);
      if (!mine('#dpPlan')) return; // mezitím zavřené – Objevuj neotevírat
      dpClose(() => Places.openAt({ label: c.label, lat: c.lat, lon: c.lon, cc: d.cc, country: d.country }, { start: d.arrDay, days: st.days }));
    };
  }
  // Okno náhledu má krok v historii: Zpět (gesto, tlačítko) ho zavře a z aplikace neodejde. Zavřené jinak (✕, Escape,
  // klepnutí vedle, okno otevřené z náhledu) krok vrátí. Akce, která přepíná pohled, počká, až se historie vrátí (go()
  // přepisuje adresu aktuálního kroku – návrat by pak skončil na staré adrese a hashchange přepnul pohled zpátky).
  const dpH = { on: false, hash: '', from: null, pend: null, t: 0, wired: false };
  function dpFinish({ then = null, from = null }) {
    if (then) return then();
    // fokus zpět na 🔎 / ⓘ, i když se výpis nebo radar mezitím překreslil
    const el = from && (from.isConnected ? from : from.dataset.dp != null ? $(`#results [data-dp="${CSS.escape(from.dataset.dp)}"]`)
      : from.dataset.rinfo != null ? $(`#radar [data-rinfo="${CSS.escape(from.dataset.rinfo)}"]`) : null);
    if (el && !$('#modalBg').classList.contains('show')) el.focus({ preventScroll: true });
  }
  // Krok, ze kterého se okno otevřelo, má ruční obnovu posunu a původní zapsanou v history.state (atlasSr, dpOpen). Jakmile
  // je zase aktuální (návrat po zavření, Zpět po přepnutí pohledu z okna přes Info o zemi → Najít lety sem, i po obnovení
  // stránky), dostane ji zpět – jinak by prohlížeč na tom kroku posun už nikdy neobnovil.
  const dpSr = () => {
    const s = history.state;
    if (!s || !s.atlasSr) return;
    const { atlasSr, ...o } = s;
    history.scrollRestoration = atlasSr; history.replaceState(Object.keys(o).length ? o : null, '');
  };
  window.addEventListener('popstate', dpSr); dpSr();
  // akce až po popstate (go → nahoru, hledání → průběh) – nic ji pak nepřebije
  const dpDone = () => { clearTimeout(dpH.t); const p = dpH.pend; dpH.pend = null; if (p) setTimeout(() => dpFinish(p), 0); };
  function dpBack(then = null) {
    const p = { then, from: dpH.from };
    dpH.from = null;
    if (!dpH.on) return dpFinish(p);
    dpH.on = false;
    // pohled se mezitím přepnul (Info o zemi → Najít lety sem): krok zůstane, Zpět pak vrátí na původní pohled
    if (location.hash !== dpH.hash) return dpFinish({ then });
    dpH.pend = p;
    history.back();
    dpH.t = setTimeout(dpDone, 700); // pojistka, kdyby popstate nepřišel
  }
  function dpClose(then = null) { modalClose(); dpBack(then); }
  function dpOpen(from) {
    dpH.from = from || null;
    $('#dpX').focus({ preventScroll: true });
    if (!dpH.wired) {
      dpH.wired = true;
      window.addEventListener('popstate', () => {
        if (dpH.pend) return dpDone(); // návrat po zavření okna
        if (!dpH.on) return;
        // Zpět při otevřeném náhledu (nebo okně otevřeném z něj)
        const p = { from: dpH.from };
        dpH.on = false; dpH.from = null;
        modalClose(); dpFinish(p);
      });
      // okno zavřené jinak než přes náhled (Escape, klepnutí vedle, ✕ okna otevřeného z náhledu) → krok historie zpět
      new MutationObserver(() => { if (dpH.on && !$('#modalBg').classList.contains('show')) dpBack(); }).observe($('#modalBg'), { attributes: true, attributeFilter: ['class'] });
    }
    if (!dpH.on) {
      // návrat z kroku náhledu stránkou nehýbe (okno ji neposunulo; akce z okna – hledání do země, Objevuj, průvodce – si
      // posun nastaví sama a obnova posunu by ji přebila): krok, ze kterého se okno otevírá, dostane ruční obnovu posunu
      // (původní si pamatuje sám – dpSr)
      const sr = history.scrollRestoration;
      history.replaceState({ ...history.state, atlasSr: sr }, ''); history.scrollRestoration = 'manual';
      history.pushState({ atlasDp: 1 }, ''); history.scrollRestoration = sr;
      dpH.on = true; dpH.hash = location.hash;
    }
  }

  /* ---------- výpadek Kiwi.com, aktivní filtry, chytrá nápověda ---------- */
  function kiwiBanner(res) {
    // průběžné výsledky: výpadky zdrojů a „nabídka z karty chybí“ až u konečných (Zkusit znovu by hledání jen zdvojilo)
    return res.partial ? '' : lowcostBanner(res) + kiwiOnly(res) + cardNote(res);
  }
  // Hledání z karty radaru: nabídku z karty hledání do jednoho cíle nevrátilo a vše je dražší – proč, a odkaz na ni.
  let fromCard = null;
  function cardNote(res) {
    const c = fromCard;
    if (!c || res !== lastResult || JSON.stringify(lastResultPayload) !== c.key) return '';
    const x = c.x, all = [...(res.top || []), ...(res.groups || []).flatMap(g => [g.best, ...(g.options || [])])].filter(Boolean);
    // let z karty (stejná letiště a dny) ve výsledku je → nic; celkové ceny se srovnat nedají (proklik počítá zavazadla
    // a dopravu podle formuláře, jiný let může mít levnější letenku a dražší cestu na letiště); prázdný výsledek = chybí
    if (all.some(t => t.out && t.out.from === x.from && t.out.to === x.to && t.out.date === x.d1 && (!x.d2 || (t.back && t.back.date === x.d2)))) return '';
    const buy = (Array.isArray(x.buy) ? x.buy : []).filter(b => Array.isArray(b) && /^https?:\/\//i.test(String(b[0] || '')));
    const shop = p => (p === 'travelpayouts' ? 'na Aviasales' : 'u ' + shopName(p));
    const links = buy.map(([u, p, leg]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${leg === 'out' ? 'Tam' : leg === 'back' ? 'Zpět' : 'Koupit nabídku z karty'} ${esc(shop(p))} ↗</a>`).join(' · ');
    return `<div class="note info card-note">ℹ️ <div>Na kartě radaru bylo <b>${czk(x.czk)}/os.</b> (${esc(SearchHelp.radarRoute(x))} · ${fmtDate(x.d1)}${x.d2 ? '–' + fmtDate(x.d2) : ''}). Hledání do jednoho cíle tuhle nabídku teď nevrátilo – zdroje (hlavně Kiwi.com) dávají pro „kamkoliv“ a pro konkrétní cíl různé nabídky a ceny se mění.${links ? ` ${links}` : ''}</div></div>`;
  }
  /** Ryanair nebo Wizz Air neodpověděl: nejlevnější lety chybí a „nejlevněji“ může klamat – nahlas a se Zkusit znovu. */
  function lowcostBanner(res) {
    const out = SearchHelp.lowcostOutage(res.providers);
    if (!out.length) return '';
    const down = out.filter(x => x.level !== 'partial'), part = out.filter(x => x.level === 'partial');
    const names = xs => xs.map(x => x.name).join(' a ');
    const txt = [
      down.length ? `<b>${names(down)} teď ${down.length > 1 ? 'neodpověděly' : 'neodpověděl'}</b> – ${down.length > 1 ? 'jejich' : 'jeho'} lety (často ty nejlevnější) ve výsledcích chybí, takže skutečná nejnižší cena může být nižší.${down.some(x => x.level === 'blocked') ? ' Po výpadku je ATLAS na pár minut vynechává.' : ''}` : '',
      part.length ? `<b>${names(part)} ${part.length > 1 ? 'odpověděly' : 'odpověděl'} jen zčásti</b> – některé ${part.length > 1 ? 'jejich' : 'jeho'} lety můžou chybět.` : '',
    ].filter(Boolean).join(' ');
    // všechny vynechané po výpadku (Wizz Air po 429 až 10 min): nové hledání by je stejně přeskočilo – tlačítko po odpočtu
    const until = out.every(x => x.level === 'blocked' && x.retryAfter > 0) ? lastResultAt + Math.min(...out.map(x => x.retryAfter)) * 1000 : 0;
    const left = until ? Math.ceil((until - Date.now()) / 1000) : 0;
    return `<div class="note ${down.length ? 'bad' : 'warn'} kiwi-note"><span>📡</span><div>${txt}</div><button type="button" class="btn sm" id="lcRetry"${left > 0 ? ` disabled data-until="${until}"` : ''}>↻ Zkusit znovu${left > 0 ? ` za ${left} s` : ''}</button></div>`;
  }
  function kiwiOnly(res) {
    const k = SearchHelp.kiwiOutage(res.providers);
    if (!k) return '';
    const who = k.others.map(id => ({ ryanair: 'Ryanairu', wizzair: 'Wizz Air' }[id])).join(' a ');
    const left = k.level === 'blocked' ? Math.ceil((lastResultAt + k.retryAfter * 1000 - Date.now()) / 1000) : 0;
    const txt = k.level === 'partial'
      ? `<b>Kiwi.com odpovědělo jen zčásti</b> – ${k.failed ? `${plural(k.failed, 'dotaz', 'dotazy', 'dotazů')} ${k.failed === 1 ? 'selhal' : k.failed <= 4 ? 'selhaly' : 'selhalo'}` : 'část dotazů nestihlo'}, takže některé lety (hlavně jiných aerolinek a s přestupem) můžou chybět.`
      : `<b>Kiwi.com teď neodpovědělo</b> – ${who ? (res.mode === 'route' ? `vidíš jen nejlevnější let dne od ${who}` : `vidíš jen nabídky ${who}`) : 'lety ostatních aerolinek (i dálkové) teď chybí'}.${k.level === 'blocked' ? ' Po výpadku ho ATLAS na chvíli vynechává.' : ''}`;
    return `<div class="note ${k.level === 'partial' ? 'warn' : 'bad'} kiwi-note"><span>📡</span><div>${txt}</div><button type="button" class="btn sm" id="kiwiRetry"${left > 0 ? ` disabled data-until="${lastResultAt + k.retryAfter * 1000}"` : ''}>↻ Zkusit znovu${left > 0 ? ` za ${left} s` : ''}</button></div>`;
  }
  function filterChips(chips) {
    if (!chips.length) return '';
    return `<div class="af-row"><span class="faint">Aktivní filtry:</span>${chips.map(c => `<button type="button" class="fchip on af" data-af="${esc(c.key)}" title="${c.rerun ? 'Zrušit filtr a hledat znovu' : 'Zrušit filtr'}">${esc(c.label)}${c.hidden ? ` <small>skryto ${+c.hidden}</small>` : ''} <span aria-hidden="true">✕</span></button>`).join('')}${chips.length > 1 ? '<button type="button" class="linkbtn" data-af="all">Zrušit všechny</button>' : ''}</div>`;
  }
  // Čip filtru času a přestupů → co v view.time vynulovat.
  const TIME_KEYS = { tOut: 'out', tBack: 'back', arrBy: 'arrBy', stops: 'stops', maxDur: 'maxDur', maxLay: 'maxLay', reach: 'reach' };
  function clearFilter(k) {
    const all = k === 'all', f = lastResult?.filters || {};
    if (all || k === 'onlyDeals') view.onlyDeals = false;
    if (all || k === 'newOnly') view.newOnly = false;
    if (all || k === 'favOnly') view.favOnly = false;
    if (all || k === 'viewPrice') view.maxPrice = null;
    if (all || k === 'outDate') { view.outDate = null; view.nights = null; }
    if (all || k === 'origins') { view.excludeOrigins = new Set(); view.onlyOrigin = null; }
    if (all || k === 'carriers') view.excludeCarriers = new Set();
    if (all || k === 'time') view.time = SearchHelp.freshTime();
    else if (TIME_KEYS[k]) view.time[TIME_KEYS[k]] = SearchHelp.freshTime()[TIME_KEYS[k]];
    // max. cena a „jen přímé“ omezují už hledání → zrušit = hledat znovu (ostatní filtry výpisu zůstanou)
    const patch = {};
    if ((all || k === 'maxPrice') && f.maxPrice) patch.maxPrice = '';
    if ((all || k === 'directOnly') && f.directOnly) patch.directOnly = false;
    const { excludeOrigins, onlyOrigin, excludeCarriers, onlyDeals, newOnly, favOnly, showMuted, time, maxPrice, outDate, nights } = view;
    if (Object.keys(patch).length) rerun(patch, { keepView: { excludeOrigins, onlyOrigin, excludeCarriers, onlyDeals, newOnly, favOnly, showMuted, time, maxPrice, outDate, nights } }); else rerender(true);
  }

  /* ---------- filtry času a přestupů: panel pod lištou filtrů (filtruje hned, bez nového hledání) ---------- */
  const ARR_BY = [[null, 'Kdykoliv'], [18, '18:00'], [20, '20:00'], [22, '22:00'], [24, 'Půlnoc']];
  function timePanel(res, st, th) {
    const tf = view.time, ret = res.query.trip === 'return';
    const field = (lbl, html) => `<div class="tf-f"><span class="tf-l">${lbl}</span>${html}</div>`;
    const parts = side => `<div class="tf-parts" role="group">${SearchHelp.DAYPARTS.map(([k, name, a, b]) => {
      const on = tf[side].includes(k);
      return `<button type="button" class="${on ? 'on' : ''}" data-tp="${side}:${k}" aria-pressed="${on}"><b>${name}</b><small>${a}–${b} h</small></button>`;
    }).join('')}</div>`;
    const seg = (attr, opts, cur) => `<div class="seg tf-seg" role="group">${opts.map(([v, l]) => `<button type="button" class="${cur === v ? 'on' : ''}" ${attr}="${v ?? ''}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
    const slider = (id, r, v) => {
      const set = v && v < r.max;
      return `<div class="tf-range"><input type="range" id="${id}" min="${r.min}" max="${r.max}" step="${r.step}" value="${set ? v : r.max}"><b id="${id}Val">${set ? 'do ' + hm(v) : 'bez limitu'}</b></div>`;
    };
    const stops = [[null, 'Libovolně'], ...(st.maxStops >= 2 || tf.stops === 1 ? [[1, 'Max. 1 přestup']] : []), [0, 'Jen přímé']];
    const on = SearchHelp.timeActive(tf);
    // „Jen dostupné z domova“: jen s veřejnou dopravou na letiště (autem se dá jet kdykoliv)
    const home = res.query.groundMode !== 'car' && (tf.reach || SearchHelp.reachCtx(res.origins, res.groups));
    return `<div class="card tf-panel" id="tfPanel">
      <div class="tf-head"><b>🕐 Čas a přestupy</b><span class="faint">${on ? (th.any ? `skryto <b>${th.any}</b> z ${plural(th.total, 'nabídky', 'nabídek', 'nabídek')}` : 'filtry teď nic neskrývají') : 'filtruje hned, bez nového hledání'}</span>
        ${on ? '<button type="button" class="linkbtn" data-af="time">Zrušit filtry času</button>' : ''}<button type="button" class="tf-x" data-tfx="1" aria-label="Zavřít panel">✕</button></div>
      <div class="tf-grid">
        ${field(ret ? '🛫 Odlet tam' : '🛫 Odlet', parts('out'))}
        ${ret ? field('🛬 Odlet zpět', parts('back')) : ''}
        ${field(`🕙 Přílet nejpozději${ret ? ' <small>tam i zpět</small>' : ''}`, `<div class="tf-parts tf-arr" role="group">${ARR_BY.map(([v, l]) => {
          const tip = v === 24 ? 'Přílet do půlnoci, ne v noci (0–5 h)' : v ? `Přílet do ${v}:00 místního času (ne v noci 0–5 h)` : 'Bez omezení příletu';
          return `<button type="button" class="${tf.arrBy === v ? 'on' : ''}" data-tarr="${v ?? ''}" aria-pressed="${tf.arrBy === v}" title="${esc(tip)}"><b>${l}</b></button>`;
        }).join('')}</div>`)}
        ${st.maxStops > 0 || tf.stops != null ? field('🔁 Přestupy', seg('data-tst', stops, tf.stops)) : ''}
        ${st.dur ? field(`⏱ Max. délka cesty <small>${ret ? 'každým směrem' : 'vč. přestupů'}</small>`, slider('tfDur', st.dur, tf.maxDur)) : ''}
        ${st.lay ? field('⌛ Nejdelší přestup', slider('tfLay', st.lay, tf.maxLay)) : ''}
        ${home ? field('🏠 Z domova', `<div class="tf-parts tf-one" role="group"><button type="button" class="${tf.reach ? 'on' : ''}" data-treach aria-pressed="${Boolean(tf.reach)}" title="Skryje lety, na které se z domova (nebo z nichž domů) veřejnou dopravou nejspíš nedostaneš: odjezd z domu před 4:30 nebo návrat domů mezi půl jednou a pátou ráno (odhad: cesta na letiště + 2 h před odletem, mimo Schengen 2,5 h, 45 min po přistání). U letiště ve tvém městě počítá s taxi."><b>Jen dostupné z domova</b></button></div>`) : ''}
      </div>
      <div class="tf-note faint">Časy jsou místní (odlet na letišti odletu, přílet v cíli). Lety bez známého času, délky nebo časů přestupů filtry neskrývají.${home ? ' Čas z domova je odhad.' : ''}</div>
    </div>`;
  }
  let actReg = [];
  // time = { chips, any, onlyClear }: filtry času a přestupů, které nabídky skryly (onlyClear = výsledků je dost, jen je skryly)
  function smartHelp(res, empty, time = null) {
    let acts = lastForm ? SearchHelp.smartActions(lastForm, res, { today: today(), country: cc => byIso[cc] ? { name: byIso[cc].cs, cont: byIso[cc].cont } : null, flag, time }) : [];
    if (time && time.onlyClear) acts = acts.filter(a => a.clear);
    actReg = acts;
    if (!acts.length) return '';
    const head = time && time.onlyClear ? `<b>Filtry času a přestupů skryly ${plural(time.any, 'nabídku', 'nabídky', 'nabídek')}.</b> Uvolni je jedním kliknutím:` : '<b>Málo výsledků?</b> Zkus jedním kliknutím:';
    return `<div class="smart-help${empty ? '' : ' card'}">${empty ? '<h3>Zkus jedním kliknutím</h3>' : `<div class="sh-h">${head}</div>`}
      <div class="sh-acts">${acts.map((a, i) => `<button type="button" class="btn sm${i === 0 ? ' primary' : ''}" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>
      <button type="button" class="linkbtn sh-guide" data-guide="1">💡 Jak hledat chytře (hlavně dálkové lety)</button></div>`;
  }
  function openGuide() {
    const g = $('#smartGuide'); if (!g) return;
    g.open = true;
    g.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Ovládání nápovědy, nejbližších dnů, filtrů a pohledu „Lety“ (výsledky i prázdný stav).
  function wireHelp(host) {
    // akce s clear zruší filtr výpisu hned, ostatní upraví formulář a hledají znovu
    $$('[data-act]', host).forEach(b => b.onclick = () => { const a = actReg[+b.dataset.act]; if (a) a.ground ? showGround(true) : a.clear ? clearFilter(a.clear) : rerun(a.patch); });
    $$('[data-gshow]', host).forEach(b => b.onclick = () => showGround(!view.gndOpen));
    $$('[data-guide]', host).forEach(b => b.onclick = openGuide);
    $$('[data-nb]', host).forEach(b => b.onclick = () => { const [w, d] = b.dataset.nb.split(':'); pickNearDay(w, d); });
    $$('[data-af]', host).forEach(b => b.onclick = () => clearFilter(b.dataset.af));
    // ↻ Zkusit znovu: u zdroje vynechaného po výpadku (blocked) až po odpočtu
    clearInterval(kiwiTimer);
    const tick = $$('#lcRetry, #kiwiRetry', host).filter(b => { b.onclick = () => rerun(); return b.dataset.until; });
    if (tick.length) kiwiTimer = setInterval(() => {
      if (!tick.some(b => b.isConnected)) return clearInterval(kiwiTimer);
      tick.forEach(b => {
        const left = Math.ceil((+b.dataset.until - Date.now()) / 1000);
        if (left > 0) b.textContent = `↻ Zkusit znovu za ${left} s`;
        else if (b.disabled) { b.disabled = false; b.textContent = '↻ Zkusit znovu'; }
      });
    }, 1000);
    $$('[data-leg]', host).forEach(b => b.onclick = () => {
      const [side, i] = b.dataset.leg.split(':'), x = legReg[side][+i];
      if (!x) return;
      const other = side === 'out' ? 'back' : 'out';
      if (view.leg[side] === x.sig) view.leg[side] = null;
      else {
        view.leg[side] = x.sig;
        if (view.leg[other] && !x.paired) view.leg[other] = null; // s tímto letem nespárováno → vybrat znovu
      }
      view.legMore = false;
      rerender(true);
      // sloupce pod sebou (mobil): posunout k dalšímu kroku
      const next = side === 'out' && lastResult.query.trip === 'return' && !view.leg.back ? $('#lcol-back') : $('#legPick');
      if (view.leg[side] && next && next.getBoundingClientRect().top > innerHeight * 0.75) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $$('[data-lall]', host).forEach(b => b.onclick = () => { view.legAll[b.dataset.lall] = true; rerender(true); });
    $$('[data-ls]', host).forEach(b => b.onclick = () => { view.legSort = b.dataset.ls; rerender(true); });
    $$('[data-lclear]', host).forEach(b => b.onclick = () => { view.leg = { out: null, back: null }; view.legMore = false; rerender(true); });
    $$('[data-lmore]', host).forEach(b => b.onclick = () => { view.legMore = true; rerender(true); });
  }

  // Barva ceny v kalendáři a mřížce termínů: odstín podle pořadí mezi cenami (zelená nejlevnější → červená nejdražší).
  const heatOf = list => { const costs = [...list].sort((a, b) => a - b); return v => 140 - costs.findIndex(c => c >= v) / Math.max(1, costs.length - 1) * 140; };
  const calNum = c => c >= 10000 ? Math.round(c / 1000) + 'k' : c;
  function calendarHtml(res, extra = []) {
    const cal = res.calendar; if (!cal) return '';
    const trip = cal.kind === 'trip';
    // Filtry času a přestupů i filtry výpisu (letiště, aerolinky, posuvník ceny, 🔥 jen výhodné): kalendář a mřížka ze
    // serveru jsou bez nich → nejlevnější z načtených kombinací, které jimi projdou (dny a buňky, kde žádná neprošla,
    // mají ✕) – jinak by ukázaly cenu, kterou výpis po klepnutí nemá. Vybraný den a noci se nepočítají (anyDay).
    const tOn = SearchHelp.timeActive(view.time), lOn = Boolean(view.excludeOrigins.size || view.excludeCarriers.size || view.maxPrice || view.onlyDeals);
    const fOn = tOn || lOn, by = lOn ? `filtry výpisu${tOn ? ' i času a přestupů' : ''}` : 'filtry času a přestupů';
    const fLbl = lOn ? `🔎 Podle filtrů výpisu${tOn ? ' i času a přestupů' : ''}` : '🕐 Podle filtrů času a přestupů';
    let outDays = cal.out, backDays = cal.back, ok = null;
    if (fOn) {
      ok = anyDay(() => (res.top || []).filter(t => baseOk(t) && SearchHelp.timeOk(t, view.time))).concat(extra);
      const byDay = pick => {
        const m = new Map();
        for (const t of ok) {
          const d = pick(t); if (!d) continue;
          const p = m.get(d);
          if (!p || t.perPersonCzk < p.cost) m.set(d, { date: d, cost: t.perPersonCzk, from: t.out.from, to: t.out.to, provider: t.provider, ...(trip ? { outDate: t.out.date, backDate: t.back.date, backTo: t.back.to } : {}) });
        }
        return [...m.values()];
      };
      outDays = byDay(t => t.out.date);
      backDays = trip ? byDay(t => t.back && t.back.date) : [];
    }
    const render = (days, title, clickable, all) => {
      if (!all.length) return `<div class="cal-box"><h4>${title}</h4><div class="faint">žádná data</div></div>`;
      const byDate = new Map(days.map(d => [d.date, d]));
      const had = new Set(all.map(d => d.date));
      const heat = heatOf(days.map(d => d.cost));
      const months = [...new Set(all.map(d => d.date.slice(0, 7)))].sort();
      return `<div class="cal-box"><h4>${title}</h4>${months.map(m => {
        const [y, mo] = m.split('-').map(Number);
        const first = new Date(y, mo - 1, 1); const n = new Date(y, mo, 0).getDate();
        const offset = (first.getDay() + 6) % 7;
        let cells = '';
        for (let i = 0; i < offset; i++) cells += '<div class="cd empty"></div>';
        for (let d = 1; d <= n; d++) {
          const key = `${m}-${pad(d)}`; const x = byDate.get(key);
          if (!x && fOn && had.has(key)) { cells += `<div class="cd none gone" title="${esc(dayLabel(key))}: žádná z načtených nabídek neprošla ${by}"><span>${d}</span><b>✕</b></div>`; continue; }
          if (!x) { cells += `<div class="cd none"><span>${d}</span></div>`; continue; }
          const h = heat(x.cost);
          const tip = x.outDate ? `${dayLabel(key)}: celá cesta od ${czk(x.cost)}/os. (${x.from}→${x.to} ${fmtDate(x.outDate)}, zpět ${fmtDate(x.backDate)} do ${x.backTo})` : `${dayLabel(key)}: ${czk(x.cost)} (${x.from}→${x.to}, ${provName(x.provider)})`;
          cells += `<div class="cd ${clickable ? 'click' : ''} ${view.outDate === key ? 'sel' : ''}" ${clickable ? `data-day="${key}"` : ''} style="--h:${h}" title="${esc(tip)}"><span>${d}</span><b>${calNum(x.cost)}</b></div>`;
        }
        return `<div class="cal-month"><div class="cm-t">${MNS_FULL[mo - 1]} ${y}</div><div class="cal-grid">${['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(x => `<div class="cdw">${x}</div>`).join('')}${cells}</div></div>`;
      }).join('')}</div>`;
    };
    // co je v ceně (jako kalendář ze serveru): letenky, zavazadla, doprava na letiště, cesta z letiště do města
    const q = res.query;
    const incl = [trip ? 'letenky tam i zpět' : 'letenka tam', BAG_LBL[q.bags] ? 'zavazadla' : '', q.kmRate ? `${q.groundMode === 'car' ? 'autem' : 'doprava'} na letiště${trip ? ' a zpět' : ''}` : '',
      q.arrival ? `z letiště do města${trip ? ' a zpět' : ''}` : ''].filter(Boolean).join(' + ');
    return `<div class="card cal-card"><div class="cal-wrap">${render(outDays, trip ? '🛫 Podle dne odletu – nejlevnější celá cesta (Kč/os.)' : '🛫 Nejlevnější odlet podle dne (Kč/os.)', true, cal.out)}${trip ? render(backDays, '🛬 Podle dne návratu – nejlevnější celá cesta', false, cal.back) : ''}</div><div class="faint" style="font-size:12px;margin-top:8px">${trip ? 'Cena celé cesty' : 'Cena'} na osobu: ${incl}${trip && !q.exact ? ', se zadaným počtem nocí' : ''}${q.maxPrice ? `, nejvýš ${czk(q.maxPrice)} (max. cena hledání)` : ''}. Klikni na den odletu a uvidíš kombinace s tímto datem.${fOn ? ` <b>${fLbl}</b> – jen z načtených kombinací; ✕ = ten den žádná neprošla.` : ''}</div></div>`
      + (trip ? gridHtml(res, ok, { by, fLbl }) : '');
  }
  // Mřížka termínů (flexibilní termín s rozsahem nocí): den odletu × počet nocí, v buňce nejlevnější celá cesta jako
  // v kalendáři; tučně nejlevnější v řádku, orámovaná nejlevnější celkem. S filtry výpisu, času a přestupů z načtených
  // kombinací (ok; by/fLbl = které filtry), jako kalendář. Klepnutí = kombinace s tímto odletem a počtem nocí (view.nights), znovu = zrušit.
  // Na telefonu se tabulka posouvá uvnitř karty (první sloupec s datem i řádek nocí zůstanou) – dnů bývá víc než nocí,
  // takže otočená by byla mnohem širší.
  function gridHtml(res, ok, { by = 'filtry času a přestupů', fLbl = '🕐 Podle filtrů času a přestupů' } = {}) {
    const m = SearchHelp.gridModel(res.calendar.grid, ok); if (!m) return '';
    const g = res.calendar.grid, b = m.best, heat = heatOf(m.cells.map(c => c[2])), q = res.query;
    const rows = m.rows.map(r => `<tr${view.outDate === r.date ? ' class="on"' : ''}><th scope="row">${dayLabel(r.date)}</th>${r.cells.map(c => {
      if (c.cost == null) return c.gone ? `<td class="dg-x" title="${esc(`${dayLabel(r.date)}, ${nightsTxt(c.n)}: žádná z načtených kombinací neprošla ${by}`)}">✕</td>` : '<td class="dg-x">–</td>';
      const sel = view.outDate === r.date && view.nights === c.n;
      const tip = `Odlet ${dayLabel(r.date)}, návrat ${dayLabel(addDays(r.date, c.n))} (${nightsTxt(c.n)}): celá cesta od ${czk(c.cost)}/os. – klepnutím ${sel ? 'zase všechny kombinace' : 'jen kombinace s tímto termínem'}`;
      return `<td><button type="button" class="dg-c${c.cost === r.min ? ' rmin' : ''}${b && c.cost === b.cost ? ' best' : ''}${sel ? ' sel' : ''}" data-cell="${r.date}|${c.n}" aria-pressed="${sel}" style="--h:${heat(c.cost)}" title="${esc(tip)}">${calNum(c.cost)}</button></td>`;
    }).join('')}</tr>`).join('');
    const n0 = m.nights[0], n1 = m.nights[m.nights.length - 1], cut = n0 > q.nightsMin || n1 < q.nightsMax;
    const part = cut || g.skipped > 0 ? `Jen ${cut ? `${SearchHelp.nightsRange(n0, n1)} (kolem nejlevnější)` : ''}${cut && g.skipped > 0 ? ' a ' : ''}${g.skipped > 0 ? `${m.rows.length} nejlevnějších dnů odletu` : ''} – ostatní termíny ukazuje kalendář výše. ` : '';
    return `<div class="card dg-card"><h4>🗓️ Mřížka termínů – odlet × počet nocí (Kč/os.)</h4>`
      + (b ? `<button type="button" class="dg-sum" id="dgSum" data-dgsum="${b.date}|${b.n}" title="Ukázat v mřížce a vybrat kombinace s tímto termínem">💡 ${esc(b.text)} – <b class="good">${czk(b.cost)}</b>/os.</button>` : '')
      + `<div class="dg-scroll" id="dgScroll" tabindex="0" role="region" aria-label="Mřížka termínů: den odletu × počet nocí"><table class="dg"><thead><tr><th scope="col">Odlet</th>${m.nights.map(n => `<th scope="col">${nightsTxt(n)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
      + `<div class="faint dg-foot">${part}Klepni na cenu a uvidíš kombinace s tímto odletem a počtem nocí (znovu = zrušit). <b>Tučně</b> nejlevnější v řádku, orámovaná nejlevnější celkem, – = nic nenalezeno${q.maxPrice ? ` (nebo dráž než max. cena ${czk(q.maxPrice)})` : ''}.${ok ? ` <b>${fLbl}</b> – orientační, jen z načtených kombinací; ✕ = žádná neprošla.` : ''}</div></div>`;
  }
  // Buňku mřížky posunout do karty tak, aby ji nezakryl lepivý sloupec s datem ani řádek nocí (scrollIntoView o nich
  // neví a zarovná ji pod ně) – i s rámečkem výběru, pak podle potřeby i stránku.
  function dgShow(c) {
    const sc = c.closest('.dg-scroll'), th = c.closest('tr').querySelector('th'), hd = sc && sc.querySelector('thead th');
    if (!sc || !th || !hd) return;
    const s = sc.getBoundingClientRect(), r = c.getBoundingClientRect(), pad = 4;
    const left = th.getBoundingClientRect().right + pad, top = hd.getBoundingClientRect().bottom + pad;
    const right = s.left + sc.clientLeft + sc.clientWidth - pad, bottom = s.top + sc.clientTop + sc.clientHeight - pad;
    if (r.left < left) sc.scrollLeft -= left - r.left; else if (r.right > right) sc.scrollLeft += r.right - right;
    if (r.top < top) sc.scrollTop -= top - r.top; else if (r.bottom > bottom) sc.scrollTop += r.bottom - bottom;
    c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function wireResults() {
    const host = $('#results');
    const nw = $('#nudgeWatch', host); if (nw) nw.onclick = async () => { const f = nudge && nudge.form; nudge = null; await addWatch(f || undefined); rerender(true); };
    $('#sortSel', host).onchange = e => { view.sort = e.target.value; rerender(); };
    const mb = $('#resMoreBtn', host);
    if (mb) mb.onclick = () => { const open = !$('#resMore', host).classList.contains('open'); view.moreOpen = open; if (!open) view.timeOpen = false; rerender(true); };
    $$('#viewSeg button', host).forEach(b => b.onclick = () => {
      view.mode = b.dataset.v;
      if (legsOk(lastResult) && (view.mode === 'legs' || view.mode === 'list')) legsPref = view.mode === 'legs';
      rerender();
    });
    $$('[data-fo]', host).forEach(b => b.onclick = () => { const k = b.dataset.fo; view.excludeOrigins.has(k) ? view.excludeOrigins.delete(k) : view.excludeOrigins.add(k); view.onlyOrigin = null; rerender(); });
    // „Odkud se vyplatí letět“: rozbalení platí i pro další hledání; letiště = jen lety odsud, znovu = všechna
    $('#ocCard', host)?.addEventListener('toggle', e => { view.ocOpen = e.target.open; });
    $$('[data-ofo]', host).forEach(b => b.onclick = () => {
      const all = lastResult.origins.map(o => o.iata), k = b.dataset.ofo;
      const only = view.excludeOrigins.size === all.length - 1 && !view.excludeOrigins.has(k);
      view.excludeOrigins = only ? new Set() : new Set(all.filter(x => x !== k));
      view.onlyOrigin = only ? null : k; // „jen odsud“ i pro letiště, která přibudou s konečným výsledkem
      rerender(true);
    });
    $$('[data-fc]', host).forEach(b => b.onclick = () => {
      const k = b.dataset.fc; const all = [...new Set($$('[data-fc]', host).map(x => x.dataset.fc))];
      view.excludeCarriers.has(k) ? view.excludeCarriers.delete(k) : view.excludeCarriers.add(k);
      if (all.every(x => view.excludeCarriers.has(x))) view.excludeCarriers = new Set(); // vypnuté všechny = zase všechny
      rerender();
    });
    const fp = $('#fPrice', host);
    if (fp) {
      fp.oninput = () => { $('#fPriceVal').textContent = +fp.value >= +fp.max ? 'bez limitu' : czk(+fp.value); };
      fp.onchange = () => { view.maxPrice = +fp.value >= +fp.max ? null : +fp.value; rerender(); };
    }
    const fd = $('#fDeals', host); if (fd) fd.onclick = () => { view.onlyDeals = !view.onlyDeals; rerender(); };
    const fn = $('#fNew', host); if (fn) fn.onclick = () => { view.newOnly = !view.newOnly; rerender(); };
    const ff = $('#fFav', host); if (ff) ff.onclick = () => { view.favOnly = !view.favOnly; rerender(); };
    const fm = $('#fMute', host); if (fm) fm.onclick = () => { view.showMuted = !view.showMuted; rerender(true); };
    // ⋯ u cíle: ⭐ Chci tam / 🙈 Nezajímá mě / 📌 Odložit nabídku řádku či karty (řádek Přehledu cílů se tím nerozbalí)
    $$('[data-dm]', host).forEach(b => b.onclick = e => {
      e.stopPropagation();
      const res = shownRes || lastResult, g = ((res || {}).groups || []).find(x => x.dest.key === b.dataset.dm), r = b.dataset.dmr != null ? rowRegistry[+b.dataset.dmr] : null;
      if (g) destMenu(g.dest, r ? { row: r, res } : null);
    });
    // 📌 Odložit / Odloženo ✓ na konci řádku „Ověřit:“ (i řádky bez ⋯ – konkrétní cíl, další termíny, lety)
    $$('[data-pin]', host).forEach(b => b.onclick = () => { const r = rowRegistry[+b.dataset.pin]; if (r) pinToggleRow(r.t, r.g, shownRes || lastResult); });
    const po = $('#pinOpen', host); if (po) po.onclick = () => openPins();
    // čas a přestupy
    const ft = $('#fTime', host); if (ft) ft.onclick = () => { view.timeOpen = !view.timeOpen; rerender(true); };
    $$('[data-tfx]', host).forEach(b => b.onclick = () => { view.timeOpen = false; rerender(true); });
    $$('[data-tp]', host).forEach(b => b.onclick = () => {
      const [side, k] = b.dataset.tp.split(':'), cur = view.time[side];
      const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
      view.time[side] = next.length === SearchHelp.DAYPARTS.length ? [] : next; // všechny části dne = bez filtru
      rerender(true);
    });
    $$('[data-tarr]', host).forEach(b => b.onclick = () => { view.time.arrBy = b.dataset.tarr ? +b.dataset.tarr : null; rerender(true); });
    $$('[data-tst]', host).forEach(b => b.onclick = () => { view.time.stops = b.dataset.tst === '' ? null : +b.dataset.tst; rerender(true); });
    $$('[data-treach]', host).forEach(b => b.onclick = () => { view.time.reach = view.time.reach ? null : SearchHelp.reachCtx(lastResult.origins, lastResult.groups); rerender(true); });
    for (const [id, key] of [['tfDur', 'maxDur'], ['tfLay', 'maxLay']]) {
      const r = $('#' + id, host); if (!r) continue;
      r.oninput = () => { $('#' + id + 'Val', host).textContent = +r.value >= +r.max ? 'bez limitu' : 'do ' + hm(+r.value); };
      r.onchange = () => { view.time[key] = +r.value >= +r.max ? null : +r.value; rerender(true); };
    }
    $$('[data-fmore]', host).forEach(b => b.onclick = () => { view.flatN += flatPage(); rerender(true); });
    $$('[data-exp]', host).forEach(b => b.onclick = () => {
      const k = b.dataset.exp; view.expanded.has(k) ? view.expanded.delete(k) : (view.expanded.add(k), noteViewed(k));
      // karta pod mapou: překreslit jen ji (celý výpis by mapu nakreslil znovu a kartu zavřel)
      const g = b.closest('#mapList') && computeGroups().find(x => x.dest.key === k);
      if (g) showMapDetail(g); else rerender(true);
    });
    // Přehled cílů: klepnutí na řádek rozbalí / sbalí plnou kartu (odkazy a tlačítka v kartě fungují normálně)
    const cmpToggle = r => { const k = r.dataset.cg; view.cexp = view.cexp || new Set(); view.cexp.has(k) ? view.cexp.delete(k) : (view.cexp.add(k), noteViewed(k)); rerender(true); };
    $$('.cmp-row[data-cg]', host).forEach(r => { r.onclick = () => cmpToggle(r); });
    $$('[data-rtop]', host).forEach(b => { b.onclick = () => {
      const k = b.dataset.rtop; view.cexp = view.cexp || new Set(); view.cexp.add(k); rerender(true);
      requestAnimationFrame(() => { const r = $(`.cmp-row[data-cg="${CSS.escape(k)}"]`); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }; });
    $$('[data-cgh]', host).forEach(b => { b.onkeydown = e => { if (e.target === b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cmpToggle(b.closest('[data-cg]')); } }; });
    const cm = $('[data-cmore]', host); if (cm) cm.onclick = () => { view.cmpN = (view.cmpN || cmpPage()) + cmpPage(); rerender(true); };
    // z „kamkoliv“ do jednoho cíle: stejné hledání jen do tohoto města a rovnou kalendář cen
    $$('[data-alldates]', host).forEach(b => b.onclick = () => {
      const g = lastResult.groups.find(x => x.dest.key === b.dataset.alldates); if (!g) return;
      view.mode = 'cal';
      // po hledání na přesná data kalendář kolem nich (flexibilně, ± 2 noci) – jinak by ukázal jen ty dva dny
      const lf = lastForm || getForm(), x = lf.dateMode === 'exact' && lf.xOut;
      const n = x && lf.trip === 'return' && lf.xBack ? Math.max(1, SearchHelp.diffDays(lf.xOut, lf.xBack)) : null;
      const flexPatch = x ? { dateMode: 'flex', dFrom: [today(), addDays(lf.xOut, -14)].sort()[1], dTo: addDays(lf.xOut, 30), outDays: [], backDays: [], ...(n ? { len: 'custom', nMin: Math.max(1, n - 2), nMax: n + 2 } : {}) } : {};
      rerun({ ...flexPatch, to: [{ id: g.dest.id, label: g.dest.label, flag: flag(g.dest.cc) }] }, { cal: true });
    });
    // den v kalendáři: všechny délky pobytu (z buňky mřížky téhož dne nejdřív na celý den, znovu = zrušit)
    $$('[data-day]', host).forEach(c => c.onclick = () => { const d = c.dataset.day; view.outDate = view.outDate === d && view.nights == null ? null : d; view.nights = null; rerender(true); });
    // buňka mřížky termínů: odlet + počet nocí, znovu = zrušit; souhrn „Nejlevněji…“ navíc buňku v mřížce ukáže
    $$('[data-cell], [data-dgsum]', host).forEach(b => b.onclick = () => {
      const [d, n] = (b.dataset.cell || b.dataset.dgsum).split('|'), same = view.outDate === d && view.nights === +n;
      view.outDate = same ? null : d; view.nights = same ? null : +n;
      rerender(true);
      const c = b.dataset.dgsum && $('#dgScroll .dg-c.sel'); if (c) dgShow(c);
    });
    // výsledek, ze kterého řádek je (průběžný i tehdy, když konečný čeká na překreslení) – jinak by cesta vzala statistiku
    // cen průběžné skupiny jako konečnou; konečný už dorazil → statistika z něj hned (finalStats na něj už nepočká)
    $$('[data-pick]', host).forEach(b => b.onclick = () => { const r = rowRegistry[+b.dataset.pick]; pickTrip(r.t, r.g, shownRes || lastResult); });
    // 🔎 Co tam je: náhled cíle s nejlepší nabídkou karty (první řádek karty – jeho Vybrat a pokračovat)
    $$('[data-dp]', host).forEach(b => b.onclick = () => {
      const p = $('.trip-row [data-pick]', b.closest('.res-card')), r = p && rowRegistry[+p.dataset.pick];
      if (r) openDestPreview(r.g, r.t, { res: shownRes || lastResult, from: b });
    });
    $$('[data-pc]', host).forEach(b => b.onclick = () => { const r = rowRegistry[+b.dataset.pc]; if (r) openPriceCheck(r.t, { g: r.g }); });
    $$('[data-live]', host).forEach(b => b.onclick = async () => {
      const r = rowRegistry[+b.dataset.live];
      if (!r) return;
      b.disabled = true;
      const st = await verifyOne(r.t);
      b.disabled = false;
      liveToast(st);
    });
    $$('[data-country]', host).forEach(b => b.onclick = () => openCountry(b.dataset.country));
    foldBadges(host);
    // skupina i s nabídkami po filtrech výpisu (vis) – okno porovná s letem, který karta ukazuje
    $$('[data-gchip]', host).forEach(b => b.onclick = () => { const k = b.dataset.gchip, g = computeGroups().find(x => x.dest.key === k) || lastResult.groups.find(x => x.dest.key === k); if (g) openGroundModal(g); });
  }
  // Prvek výpisu s fokusem (klávesnice) jako selektor platný i po překreslení: id, stálý klíč (filtr, pohled, cíl, let –
  // data-lsig, ne pořadí v data-leg), nebo tlačítko v řádku nabídky podle data-tid řádku (data-pick/pc/live jsou pořadí
  // v rowRegistry – po překreslení, třeba konečnými výsledky po průběžných, jiné).
  const FOCUS_KEYS = ['tp', 'tarr', 'tst', 'fo', 'ofo', 'fc', 'v', 'mleg', 'ms', 'mcombo', 'cell', 'cgh', 'cg', 'exp', 'alldates', 'gchip', 'dp', 'cmore', 'lsig'];
  function focusSel(a) {
    if (a.id) return '#' + CSS.escape(a.id);
    const k = FOCUS_KEYS.find(k => a.dataset[k] != null);
    if (k) return `[data-${k}="${CSS.escape(a.dataset[k])}"]`;
    const row = a.closest('.trip-row[data-tid]'), rk = row && ['pick', 'pc', 'live', 'country', 'pin'].find(k => a.dataset[k] != null);
    return rk ? `.trip-row[data-tid="${CSS.escape(row.dataset.tid)}"] [data-${rk}]` : null;
  }
  function rerender(keepScroll) {
    const y = window.scrollY;
    // ovládací prvek s fokusem najít i v překresleném výpisu (stejný klíč víckrát: stejně kolikátý)
    const a = document.activeElement, sel = a && a !== document.body && $('#results').contains(a) ? focusSel(a) : null;
    const nth = sel ? Math.max(0, $$(sel, $('#results')).indexOf(a)) : 0;
    const dg = $('#dgScroll'), dgAt = dg && [dg.scrollLeft, dg.scrollTop]; // mřížka termínů se posouvá uvnitř karty
    rowRegistry = [];
    renderResults();
    if (keepScroll) window.scrollTo(0, y);
    const dg2 = dgAt && $('#dgScroll'); if (dg2) [dg2.scrollLeft, dg2.scrollTop] = dgAt;
    const all = sel ? $$(sel, $('#results')) : [], el = all[nth] || all[0];
    if (el) el.focus({ preventScroll: true });
  }

  /* ---------- „Je to dobrá cena?“: štítek u nabídky a panel s vysvětlením ---------- */
  const PL_BADGE = { low: ['good', '💚 Dobrá cena'], normal: ['', 'Běžná cena'], high: ['dear', '🔺 Dráž než obvykle'] };
  const groupOf = (t, res = lastResult) => (res && t.destKey ? res.groups.find(g => g.dest.key === t.destKey) : null) || null;
  // Statistika cen pro cestu: skupina jejího cíle, jinak celá trasa (konkrétní cíl).
  const statsFor = (t, res = lastResult) => (groupOf(t, res) || {}).priceStats || (res && res.priceStats) || null;
  // Úroveň ceny je ze serveru; cestu složenou v prohlížeči ze dvou letenek a cestu buňky mřížky termínů (server ji
  // posílá bez úrovně) ohodnotí PriceCheck stejným pravidlem.
  function levelFor(t) {
    if (t && !t.priceLevel && (t.composed || t.cell)) t.priceLevel = PriceCheck.assess(t, statsFor(t));
    return (t && t.priceLevel) || null;
  }
  const goodPrice = t => ['super', 'good'].includes(t.deal.level) || (levelFor(t) || {}).level === 'low';
  // 🔥 Super cena je silnější „dobrá cena“ – na nabídce je vždy jen jeden cenový štítek.
  const tagOf = (t, pl) => (t.deal && t.deal.level === 'super' && pl.level === 'low' ? ['hot', '🔥 Super cena'] : PL_BADGE[pl.level] || PL_BADGE.normal);
  /** Cenový štítek: ve výpisu tlačítko (idx = řádek v rowRegistry) otevře panel, jinde jen štítek. */
  function priceTag(t, idx = null, pl = levelFor(t)) {
    if (!pl) return t.deal && t.deal.level === 'super' ? '<span class="b hot">🔥 Super cena</span>' : '';
    const [cls, txt] = tagOf(t, pl);
    return idx == null ? `<span class="b ${cls}" title="${esc(pl.reason)}">${txt}</span>`
      : `<button type="button" class="b pc-b ${cls}" data-pc="${idx}" title="${esc(pl.reason + ' – klikni: Je to dobrá cena?')}">${txt}</button>`;
  }

  /**
   * Panel „Je to dobrá cena?“. opts: g = skupina cíle, stats = statistika cen (průvodce cestou si ji nese sám),
   * label = cílové město, inResults = otevřeno z výsledků (nabídne ♡ hlídání tohoto hledání).
   */
  function openPriceCheck(t, { g = null, stats = null, label = null, inResults = true } = {}) {
    if (inResults) g = g || groupOf(t);
    stats = stats || (g && g.priceStats) || (inResults ? statsFor(t) : null);
    // trasa, která se při hledání do paměti nevešla (limit nových tras z jednoho hledání), se zapíše teď (průběžný
    // výsledek ne – jen část zdrojů)
    const key = PriceCheck.tripKey(t);
    if (inResults && lastResult && !lastResult.partial && key) PriceCheck.remember(lastResult, { only: key, now: lastResultAt || Date.now() });
    const x = PriceCheck.explain(t, { stats, store: PriceCheck.load(), now: Date.now(), today: today(), query: inResults && lastResult ? lastResult.query : null });
    if (!x) return;
    modalOpen(priceCheckHtml(t, x, { label: label || (g && g.dest.label) || t.out.to, inResults }));
    $('#modal').scrollTop = 0; // okno si jinak drží posun z minulého otevření
    // hledání výsledků na obrazovce (lastForm), ne formulář upravený po hledání
    const w = $('#pcWatch'); if (w) w.onclick = () => { modalClose(); addWatch(lastForm ? { ...lastForm } : undefined); };
  }
  // Rozpětí cen hledání: nejlevnější … nejdražší, čárky = čtvrtina nejlevnějších a medián, puntík = tahle letenka.
  // Pár extrémně drahých nabídek by stupnici stlačilo – pravý konec nejvýš p75 + 1,5 × mezikvartilové rozpětí.
  function pcBar(st, v) {
    const fence = st.p75 + 1.5 * (st.p75 - st.p25);
    const hi = Math.round(Math.max(v, fence > st.median ? Math.min(st.max, fence) : st.max));
    const span = Math.max(1, hi - st.min);
    const at = x => Math.min(100, Math.max(0, (x - st.min) / span * 100)).toFixed(1);
    return `<div class="pc-bar" role="img" aria-label="${esc(`Ceny v hledání ${czk(st.min)} až ${czk(st.max)}, medián ${czk(st.median)}, tahle letenka ${czk(v)}`)}">
      <i class="pc-tick" style="left:${at(st.p25)}%"></i><i class="pc-tick med" style="left:${at(st.median)}%"></i><i class="pc-me" style="left:${at(v)}%"></i></div>
      <div class="pc-scale"><span>${czk(st.min)}</span><span>${czk(hi)}${hi < st.max ? ' a víc' : ''}</span></div>`;
  }
  function priceCheckHtml(t, x, { label, inResults }) {
    const { pl, stats: st, mem, days } = x;
    const [cls, txt] = tagOf(t, pl);
    const ret = Boolean(t.back);
    const month = MNS_IN[+t.out.date.slice(5, 7) - 1];
    const sec = (icon, title, body) => `<div class="pc-sec"><h4>${icon} ${title}</h4>${body}</div>`;
    // 1) ostatní nabídky tohoto hledání
    let search;
    if (st && st.n >= 2) {
      const span = st.dateFrom === st.dateTo ? fmtDate(st.dateFrom) : `${fmtDate(st.dateFrom)}–${fmtDate(st.dateTo)}`;
      // statistika je za nabídky do cíle téhle cesty (u „kamkoliv“ jedna destinace), ne za celé hledání
      const where = pl.pos == null ? 'Pozice mezi nabídkami není známá' : pl.pos === 0 ? 'Nejlevnější nabídka do tohoto cíle' : pl.pos === 100 ? 'Nejdražší nabídka do tohoto cíle'
        : pl.pos <= 50 ? `Levnější než ${100 - pl.pos} % nabídek do tohoto cíle` : `Dražší než ${pl.pos} % nabídek do tohoto cíle`;
      search = `${pcBar(st, t.flightCzk)}<p><b>${where}</b>${pl.est && pl.pos != null ? ' (odhad)' : ''} – celkem ${st.n}, ${st.dateFrom === st.dateTo ? 'odlet' : 'odlety'} ${span}</p>
        <p>Nejlevnější ${czk(st.min)}, čtvrtina nejlevnějších do ${czk(st.p25)}, medián ${czk(st.median)}, nejdražší ${czk(st.max)}.</p>
        ${st.n < PriceCheck.CFG.smallN ? '<p class="pc-warn">⚠️ Nabídek je na spolehlivé srovnání málo – odhad se proto řídí hlavně průměrnou cenou na vzdálenost.</p>' : ''}`;
    } else search = '<p>Jiné nabídky do tohoto cíle tohle hledání nemá – odhad se řídí průměrnou cenou na vzdálenost.</p>';
    // 2) průměrná cena na vzdálenost (prahy jako distanceLevel: výhodná ≥ ~41 % pod, dražší > 25 % nad)
    const vs = pl.vsRef <= -5 ? `o <b>${-pl.vsRef} %</b> levnější` : pl.vsRef >= 5 ? `o <b>${pl.vsRef} %</b> dražší` : 'zhruba stejně drahá';
    const dist = t.distanceKm ? `<p>Na ${t.distanceKm.toLocaleString('cs')} km ${ret ? 'tam i zpět' : 'jedním směrem'} stojí letenka v průměru kolem <b>${czk(pl.ref)}</b>/os. Tahle je ${vs}.
      <span class="faint">Nízkonákladovky bývají pod průměrem běžně – za výhodnou ATLAS bere letenku zhruba od 40 % pod ním, za dražší než obvykle od 25 % nad ním. Hrubé pravidlo podle vzdálenosti, ne podle konkrétní trasy.</span></p>`
      : '<p>Vzdálenost letu neznám.</p>';
    // 3) paměť cen v tomto prohlížeči
    const route = `${t.out.from} → ${label}, odlet v ${month}, ${ret ? 'zpáteční' : 'jen tam'}`;
    let memo;
    if (!mem) memo = `<p>Na trase <b>${esc(route)}</b> zatím ATLAS žádné ceny nemá. Ukládá si nejlevnější letenky z každého hledání a příště porovná.</p>`;
    else {
      const tr = mem.trend;
      const arrow = tr ? { down: '↓ zlevňuje', flat: '→ beze změny', up: '↑ zdražuje' }[tr.dir] : '';
      const when = tr ? (tr.days ? `o ${plural(tr.days, 'den', 'dny', 'dní')} dřív` : 'dřív téhož dne') : '';
      // trasu zná jen z posledních ~24 h (často jen z tohoto hledání) – nepředstírat dlouhou historii
      const o = x.otherMin, oTxt = o ? `<span class="faint">${o.kind === 'other' ? 'V jiném hledání téže trasy' : 'Dřív na trase'} viděl i ${czk(o.czk)}/os. (${PriceCheck.agoTxt(o.ago)}).</span>` : '';
      if (x.vsMem == null) memo = `<p>Tohle hledání ATLAS v paměti zatím nemá, takže letenku napřímo srovnat nemá s čím. ${x.cheapestSeen ? 'Levnější letenku na trase ale zatím neviděl.' : oTxt}</p>`;
      else {
        const low = x.scoped ? mem.scopeMin : mem.min, lowAgo = x.scoped ? mem.scopeAgo : mem.ago, inSearch = x.scoped ? ' v tomhle hledání' : '';
        memo = `<p>${mem.sinceDays > 0 ? `Nejlevnější letenka${inSearch}, co ATLAS na trase <b>${esc(route)}</b> viděl: <b>${czk(low)}</b>/os. (${PriceCheck.agoTxt(lowAgo)}, trasu sleduje ${plural(mem.sinceDays, 'den', 'dny', 'dní')}).`
            : `Trasu <b>${esc(route)}</b> ATLAS sleduje teprve od dneška – nejlevnější letenka${inSearch}, co na ní zatím viděl: <b>${czk(low)}</b>/os.`}
          ${x.vsMem <= 0 ? 'Tahle je zatím nejlevnější.' : `Tahle je o ${x.vsMem} % dražší.`} ${oTxt}</p>`;
      }
      memo += `${tr ? `<p class="pc-trend ${tr.dir}"><b>${arrow}</b> – nejlevnější letenka stejného hledání ${when}: ${czk(tr.prev)} → teď ${czk(tr.cur)} (${tr.pct > 0 ? '+' : tr.pct < 0 ? '−' : ''}${Math.abs(tr.pct)} %)</p>`
        : '<p class="faint">Trend (↓ / → / ↑) se ukáže, až stejné hledání zopakuješ později (za 6 h a víc) – třeba když ho uložíš ♡ a ATLAS ho bude kontrolovat.</p>'}`;
    }
    // 4) čas do odletu
    const left = days == null ? '' : days <= 0 ? 'Odlet je dnes.' : days === 1 ? 'Odlet je zítra.'
      : `Do odletu zbývá ${plural(days, 'den', 'dny', 'dní')}${days >= 14 ? ` (asi ${plural(Math.round(days / 7), 'týden', 'týdny', 'týdnů')})` : ''}.`;
    const adv = x.advice;
    const cache = !t.out.live || (t.back && !t.back.live);
    return `<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" onclick="modalClose()" aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button>
      <div class="modal-hero-inner"><h2 style="font-size:23px">Je to dobrá cena?</h2><div style="opacity:.85;font-size:13px">${esc(t.out.from)} → ${esc(label)} · ${fmtDate(t.out.date)}${t.back ? '–' + fmtDate(t.back.date) : ''} · letenky ${czk(t.flightCzk)}/os.</div></div></div>
      <div class="modal-body pc-body">
        <div class="pc-verdict"><span class="b ${cls}">${txt}</span><span>${esc(pl.reason)}</span></div>
        ${sec('📊', `Oproti ostatním nabídkám do cíle ${esc(label)} v tomto hledání`, search)}
        ${sec('📏', 'Oproti průměrné ceně na tuto vzdálenost', dist)}
        ${sec('🧠', 'Co ATLAS na této trase viděl <small class="faint">(v tomto prohlížeči)</small>', memo)}
        ${left ? sec('📅', 'Do odletu', `<p>${left}</p>`) : ''}
        ${adv ? `<div class="note info pc-advice">💡<div><b>Co s tím?</b> ${esc(adv.text)}</div></div>` : ''}
        ${cache ? '<div class="note warn pc-advice">⏱<div>Cena je z cache (z hledání jiných uživatelů za posledních ~48 h) – před nákupem ji ověř.</div></div>' : ''}
        <div class="row wrap pc-act">${!inResults ? '' : isWatched(lastForm || getForm()) ? '<button type="button" class="btn" id="pcWatch" disabled title="Hledání už je v hlídaných cenách na Přehledu">✓ Tohle hledání už hlídáš</button>' : '<button type="button" class="btn primary" id="pcWatch">♡ Hlídat cenu tohoto hledání</button>'}<button type="button" class="btn ghost" onclick="modalClose()">Zavřít</button></div>
        <p class="faint pc-foot">Je to odhad, ne předpověď. ATLAS porovnává cenu letenek na osobu (bez dopravy na letiště a zavazadel) s ostatními nabídkami tohoto hledání, s hrubou průměrnou cenou na vzdálenost a s cenami, které viděl v tomto prohlížeči. Jak se cena dál vyvine, dopředu nikdo neví.</p>
      </div>`;
  }


  /* ---------- mapa výsledků ---------- */
  // Přiblížená mapa při automatickém překreslení (průběžné → konečné výsledky, rerenderKeep): stejná projekce i přiblížení,
  // nové cíle přibudou na svém místě – jednorázově { W, scale, translate, z }.
  let mapKeep = null;
  async function drawResultMap(groups) {
    if (!$('#resMap')) return;
    if (typeof d3 === 'undefined' || typeof topojson === 'undefined') { try { await window.loadD3(); } catch (e) { return; } } // mapové knihovny až teď
    const el = $('#resMap'); if (!el) return;
    const keep = mapKeep; mapKeep = null;
    const world = await loadWorld();
    const feats = topojson.feature(world, world.objects.countries).features;
    const W = el.clientWidth || 900, H = Math.max(380, Math.min(620, W * 0.58));
    const res = lastResult;
    const pts = groups.filter(g => g.dest.lat != null).map(g => ({ g, t: g.vis[0], lon: g.dest.lon, lat: g.dest.lat }));
    const orig = res.origins.filter(o => o.lat != null);
    const geo = { type: 'MultiPoint', coordinates: [...pts.map(p => [p.lon, p.lat]), ...orig.map(o => [o.lon, o.lat])] };
    const kept = keep && keep.W === W;
    const proj = kept ? d3.geoNaturalEarth1().scale(keep.scale).translate(keep.translate) : d3.geoNaturalEarth1().fitExtent([[30, 30], [W - 30, H - 30]], geo);
    if (proj.scale() > 2600) proj.scale(2600);
    const path = d3.geoPath(proj);
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'rm-svg');
    svg.node().__pj = { W, scale: proj.scale(), translate: proj.translate() };
    const g0 = svg.append('g');
    g0.append('g').selectAll('path').data(feats).join('path').attr('d', path).attr('class', 'rm-land');
    const prices = pts.map(p => p.t.perPersonCzk).sort((a, b) => a - b);
    const qOf = v => prices.length > 1 ? prices.findIndex(x => x >= v) / (prices.length - 1) : 0;
    const tier = v => { const q = qOf(v); return q < .33 ? 't0' : q < .66 ? 't1' : 't2'; }; // barvy v CSS (paleta mapy)
    const home = res.home ? [res.home.lon, res.home.lat] : (orig[0] ? [orig[0].lon, orig[0].lat] : null);
    const lines = g0.append('g');
    pts.slice().sort((a, b) => a.t.perPersonCzk - b.t.perPersonCzk).slice(0, 25).forEach(p => {
      const o = res.origins.find(x => x.iata === p.t.out.from) || orig[0];
      if (!o) return;
      lines.append('path').datum({ type: 'LineString', coordinates: [[o.lon, o.lat], [p.lon, p.lat]] }).attr('d', path).attr('class', `rm-arc ${tier(p.t.perPersonCzk)}`);
    });
    const tip = $('#mapTip');
    g0.append('g').selectAll('circle').data(pts).join('circle')
      .attr('cx', d => proj([d.lon, d.lat])[0]).attr('cy', d => proj([d.lon, d.lat])[1])
      .attr('r', d => d.t.deal.level === 'super' ? 7 : 5.5).attr('class', d => `rm-dot ${tier(d.t.perPersonCzk)}`)
      .on('mousemove', (e, d) => { tip.innerHTML = `${flag(d.g.dest.cc)} ${esc(d.g.dest.label)} · <span style="color:var(--good)">${czk(d.t.perPersonCzk)}</span>${d.t.tempHi != null ? ` · 🌡️ ~${d.t.tempHi} °C` : ''}`; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.style.opacity = 1; })
      .on('mouseleave', () => tip.style.opacity = 0)
      .on('click', (e, d) => { tip.style.opacity = 0; showMapDetail(d.g); });
    // Popisky nejlevnějších bez překrývání: od nejlevnějšího vpravo od bodu, jinak vlevo, nad nebo pod ním; co se
    // nevejde, vynechá se (cena je i v bublině a v seznamu). Po přiblížení se rozmístí znovu a přibudou další.
    const byPrice = pts.slice().sort((a, b) => a.t.perPersonCzk - b.t.perPersonCzk);
    const lblTxt = d => `${d.g.dest.label} ${Math.round(d.t.perPersonCzk).toLocaleString('cs')}`;
    const lblG = g0.append('g');
    // velikost písma v jednotkách mapy: na obrazovce 11 px, po přiblížení nejvýš 15 px
    const lblSize = k => Math.min(11 * Math.sqrt(k), 15) / k;
    let lblK = 0;
    const placeLabels = k => {
      if (k === lblK) return;
      lblK = k;
      const f = lblSize(k), r = 7 / Math.sqrt(k) + 3 / k, max = Math.round((W < 520 ? 6 : 12) * Math.sqrt(k));
      const boxes = [], out = [];
      for (const d of byPrice) {
        if (out.length >= max) break;
        const [x, y] = proj([d.lon, d.lat]), w = lblTxt(d).length * f * 0.6, h = f * 1.2;
        const spot = [[x + r, y - h / 2, 'start'], [x - r - w, y - h / 2, 'end'], [x - w / 2, y - r - h, 'middle'], [x - w / 2, y + r, 'middle']]
          .find(([bx, by]) => bx >= 0 && by >= 0 && bx + w <= W && by + h <= H && !boxes.some(b => bx < b[2] && bx + w > b[0] && by < b[3] && by + h > b[1]));
        if (!spot) continue;
        const [bx, by, anchor] = spot;
        boxes.push([bx, by, bx + w, by + h]);
        out.push({ d, anchor, x: anchor === 'start' ? bx : anchor === 'end' ? bx + w : bx + w / 2, y: by + f * 0.9 });
      }
      lblG.selectAll('text').data(out).join('text').attr('class', 'rm-lbl').attr('text-anchor', o => o.anchor)
        .attr('x', o => o.x).attr('y', o => o.y).style('font-size', f + 'px').text(o => lblTxt(o.d));
    };
    placeLabels(1);
    const origins = g0.append('g').selectAll('rect').data(orig).join('rect').attr('class', 'rm-origin');
    const sizeOrigins = k => { const a = 8 / Math.sqrt(k); origins.attr('x', d => proj([d.lon, d.lat])[0] - a / 2).attr('y', d => proj([d.lon, d.lat])[1] - a / 2).attr('width', a).attr('height', a); };
    sizeOrigins(1);
    if (home) svg.append('circle').attr('cx', proj(home)[0]).attr('cy', proj(home)[1]).attr('r', 4).attr('class', 'rm-home');
    const zoom = d3.zoom().scaleExtent([1, 10])
      .on('zoom', ev => { const k = ev.transform.k; g0.attr('transform', ev.transform); g0.selectAll('circle').attr('r', d => (d.t.deal.level === 'super' ? 7 : 5.5) / Math.sqrt(k)); sizeOrigins(k); g0.selectAll('.rm-lbl').style('font-size', lblSize(k) + 'px'); })
      .on('end', ev => placeLabels(ev.transform.k));
    svg.call(zoom);
    if (kept && keep.z) svg.call(zoom.transform, d3.zoomIdentity.translate(keep.z.x, keep.z.y).scale(keep.z.k));
  }
  // Detail cíle pod mapou (klik na bod); scroll = false: obnovený po automatickém překreslení – stránkou nehýbat.
  function showMapDetail(g, scroll = true) {
    rowRegistry = [];
    const ml = $('#mapList');
    ml.innerHTML = groupCard(g);
    ml.dataset.g = g.dest.key;
    wireResults();
    if (scroll) ml.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- hlídané ceny ---------- */
  // Popis termínu: přesná data („tam 14.11. · zpět 21.11.“) nebo rozsah + počet nocí.
  function whenTxt(q) {
    const x = q.exact;
    if (x) {
      const pm = x.flex ? ` ±${x.flex}` : '';
      return `📅 tam ${fmtDate(x.out)}${pm}${x.back ? ` · zpět ${fmtDate(x.back)}${pm}` : ' · jen tam'}${x.flex ? '' : ' (přesná data)'}`;
    }
    return `${fmtDate(q.dateFrom)}–${fmtDate(q.dateTo)} · ${q.trip === 'return' ? SearchHelp.nightsRange(q.nightsMin, q.nightsMax) : 'jen tam'}${q.depAfter ? ` · ${fmtDate(q.depAfter.date)} odlet od ${q.depAfter.time}` : ''}`;
  }
  function watchLabel(f) {
    if (f.trip === 'multi') return multiRoute((f.legs || []).map((l, i) => ({ from: (i ? l.from : f.from).map(x => x.label).join(', '), to: l.to.map(x => x.label).join(', ') })));
    const from = f.from.map(x => x.label).join(', ');
    const to = f.to.length ? f.to.map(x => x.label).join(', ') : 'kamkoliv';
    return `${from} → ${to}`;
  }
  function bestOf(res) {
    if (res.mode === 'multi') {
      // cesta přes víc měst: nejlevnější celá cesta (všechny lety), popis = dny a trasy letů
      const c = (res.combos || [])[0];
      if (!c) return null;
      return { czk: c.perPersonCzk, desc: c.picks.map((p, i) => { const l = res.legs[i].options[p].out; return `${fmtDate(l.date)} ${l.from}→${l.to}`; }).join(' · ') };
    }
    // Kamkoliv a hledání do země: bez 🙈 měst (jako výpis); všechna v 🙈 → aspoň nejlevnější ze všech
    const shown = prefOn(res) ? prefFor(res, res.groups).groups : res.groups, gs = shown.length ? shown : res.groups;
    if (!gs.length) return null;
    const g = gs.reduce((m, x) => x.best.perPersonCzk < m.best.perPersonCzk ? x : m), t = g.best;
    // key = město; hid = 🙈 města levnější než ono – vrácené z 🙈 příště není zlevnění (Alerts.rebaseWhy)
    const hid = gs === shown ? res.groups.filter(x => !shown.includes(x) && x.best.perPersonCzk < t.perPersonCzk).map(x => x.dest.key).slice(0, SearchHelp.DEST_MAX) : [];
    return { czk: t.perPersonCzk, desc: `${g.dest.label} · ${fmtDate(t.out.date)}${t.back ? '–' + fmtDate(t.back.date) : ''} · z ${t.out.from}`, key: g.dest.key, ...(hid.length ? { hid: hid.join(',') } : {}) };
  }
  // Formulář hlídaného hledání tak, jak se kontroluje: starší uložené doplněné o výchozí hodnoty (kmRate v Kč/km);
  // hlídané před cestou z letiště do města bez ní (cena i historie bez ní); klouzavý termín (form.roll) na dnešek.
  function watchForm(w) {
    const f = { ...defaultForm(), ...SearchHelp.groundForm(Alerts.rollForm(w.form, today())) };
    if (w.form && w.form.arrival == null) f.arrival = false;
    return f;
  }
  // Stejné hledání = stejný dotaz na server (jako při kontrole: termín, který už začal, od dneška) – hlídá se jen jednou.
  // Klouzavý termín: místo dnešních dat jeho popis (klíč se den ode dne nemění – sloučení, záloha, ♥ Hlídáš).
  // Vlastní ceny na letiště (nastavení zařízení) hledání nerozlišují – v klíči nejsou.
  function watchKey(w) {
    try {
      const f = watchForm(w), roll = Alerts.rolls(f), { accessOverride, ...p } = payloadOf(roll ? f : SearchHelp.recentForm(f, today()) || f);
      return Alerts.searchKey(roll ? { ...p, roll: f.roll } : p);
    } catch (e) { return `?${w.id}`; }
  }
  // 📅 Posouvat termín s časem: klouzavý termín pro ♡ z formuláře f (bez ručního přepnutí zapnutý, když rozsah začíná
  // nejpozději za 7 dní) → roll nebo null
  function rollWanted(f) {
    const roll = Alerts.rollSpec(f, today());
    return roll && (rollTouched ? $('#rollOn').checked : f.dFrom <= addDays(today(), Alerts.CFG.rollNear)) ? roll : null;
  }
  // Klouzavé hlídání téhož hledání f s daty z jiného dne (Alerts.rollSame): formulář obnovený z minula (poslední hledání,
  // Nedávno, uložené výsledky) má termín ze dne hledání – z { off: 3 } uloženého včera by dnes vyšlo { off: 2 }, jiný klíč
  function rolledOf(f) {
    if (!f || f.trip === 'multi' || f.dateMode === 'exact') return null;
    const t = today();
    return (S.watch || []).find(w => {
      const r = w && Alerts.rolls(w.form) && !w.form.roll.lw ? w.form.roll : null, at = r && Alerts.savedAt(w, Date.now());
      return r && Alerts.rollSame(r, f, t, { saved: at ? fmtYMD(new Date(at)) : null }) && watchKey({ form: { ...f, roll: r } }) === watchKey(w);
    }) || null;
  }
  // hlídané pevně i klouzavě (♥ Hlídáš – stejné hledání se znovu neukládá ani s přepnutým 📅)
  /**
   * Chování: kolikrát uživatel spustil totéž hledání (podle watchKey, posledních 20 různých). Po druhém a dalším
   * (a když ho ještě nehlídá) nabídne výsledek ♡ Hlídat cenu – na Přehledu pak uvidí, když zlevní.
   */
  let nudge = null;
  function seenBump(f) {
    const k = watchKey({ form: f }); if (!k) return null;
    const m = { ...(S.seen && typeof S.seen === 'object' ? S.seen : {}) }, n = ((m[k] && +m[k][0]) || 0) + 1;
    m[k] = [n, Date.now()];
    S.seen = Object.fromEntries(Object.entries(m).sort((a, b) => b[1][1] - a[1][1]).slice(0, 20));
    return n >= 2 && !isWatched(f) && (S.watch || []).length < 12 ? { n, form: f } : null;
  }
  const nudgeHtml = () => (nudge ? `<div class="note info watch-nudge">🔁 <div>Tohle hledáš už po ${nudge.n}. – <button type="button" class="linkbtn" id="nudgeWatch"><b>♡ Hlídat cenu</b></button> a na Přehledu uvidíš, kdy zlevní.</div></div>` : '');
  const isWatched = f => {
    const roll = Alerts.rollSpec(f, today()), ks = new Set([watchKey({ form: f }), ...(roll ? [watchKey({ form: { ...f, roll } })] : [])]);
    return (S.watch || []).some(w => ks.has(watchKey(w))) || Boolean(rolledOf(f));
  };
  // Popis hlídání pod názvem: termín (klouzavý „vždy příštích 8 týdnů (teď 14. 10.–9. 12.)“), noci, zavazadla, auto.
  function watchSub(f) {
    const legs = f.trip === 'multi' ? f.legs : null;
    return (legs ? `🗺️ ${plural(legs.length, 'let', 'lety', 'letů')} · ${fmtDate(legs[0].date)} → ${fmtDate(legs[legs.length - 1].date)}` : f.dateMode === 'exact' ? whenTxt({ exact: { out: f.xOut, back: f.trip === 'return' ? f.xBack : null, flex: f.xFlex } }) : `${Alerts.rolls(f) ? Alerts.rollTxt(f, today()) : `${fmtDate(f.dFrom)}–${fmtDate(f.dTo)}`} · ${f.trip === 'return' ? SearchHelp.nightsRange(f.nMin, f.nMax) : 'jen tam'}${f.depAfter ? ` · ${fmtDate(f.depAfter.date)} odlet od ${f.depAfter.time}` : ''}${f.minTemp ? ` · 🌡️ ≥ ${f.minTemp} °C` : ''}`) + (BAG_LBL[f.bags] ? ` · 🧳 ${BAG_LBL[f.bags]}` : '') + (f.ground && f.groundMode === 'car' ? ` · 🚗 na letiště autem (${FUEL_SHORT[f.carFuel] || 'nafta'})` : '');
  }
  // klouzavé hlídání ukazuje dnešní termín, pevné popis z uložení
  const subOf = w => (Alerts.rolls(w.form) ? watchSub(watchForm(w)) : w.sub);
  // form = hledání výsledků („Je to dobrá cena?“), jinak formulář
  async function addWatch(form) {
    const f = form || getForm();
    if (!f.from.length) return toast('Nejdřív zadej, odkud letíš', 'err');
    // nejvýš 12 hlídání (Alerts.upsertWatch) – nové nesmí potichu smazat nejstarší i s cílovou cenou a historií
    if (!isWatched(f) && (S.watch || []).length >= 12) return toast('Hlídáš už 12 hledání – nejdřív některé na Přehledu smaž', 'err');
    // výchozí cena hlídání z čerstvého konečného výsledku – starší (i uložený z minula) nebo průběžný se nejdřív dohledá
    const wkey = JSON.stringify(payloadOf(f));
    if (running && running.key === wkey) toast('♡ Uložím, až hledání doběhne…');
    let res = SearchHelp.reusable(lastResult, { at: lastResultAt, key: JSON.stringify(lastResultPayload), want: wkey, now: Date.now() }) ? lastResult : form ? await rerun(form, { noScroll: true }) : await startSearch({ noScroll: true });
    if (!res) return;
    const b = bestOf(res);
    const czk0 = b ? b.czk : null;
    // 📅 klouzavý termín: uloží se odstup a délka rozsahu (nebo „nejbližší prodloužený víkend“), ne data; hledání, které už
    // se hlídá klouzavě (data z jiného dne – rolledOf), dostane jeho termín, ať ho upsertWatch nezdvojí
    const same = rolledOf(f), roll = same ? same.form.roll : rollWanted(f), wf = roll ? { ...f, roll } : f;
    // own = otisk 🏠 vlastních cen na letiště v ceně – jejich změna pak při kontrole není „zlevnilo“ (Alerts.applyCheck)
    const w = { id: Date.now().toString(36), label: watchLabel(f), sub: watchSub(roll ? Alerts.rollForm(wf, today()) : f), form: wf, best: b, history: b ? [{ at: Date.now(), czk: b.czk }] : [], checked: Date.now(), base: czk0, low: czk0, seen: czk0, target: null, own: SearchHelp.ownPrint(res) };
    // stejné hledání podruhé (♡ pod formulářem i v „Je to dobrá cena?“) jen aktualizuje cenu té, co už je
    const r = Alerts.upsertWatch(S.watch || [], w, watchKey, { now: Date.now(), cap: 12, partial: Alerts.incomplete(res.providers) });
    S.watch = r.list; save();
    updateWatchBadges(); updateWatchBtn();
    toast(r.dup ? `Tohle hledání už hlídáš na Přehledu${b ? ` – cena teď ${czk(b.czk)}/os.` : ''}` : roll ? `Hlídám na Přehledu, dokud máš ATLAS otevřený – termín se posouvá s časem (${Alerts.rollTxt(wf, today(), { now: false })})` : 'Hledání uloženo – cenu hlídám na Přehledu, dokud máš ATLAS otevřený');
  }
  /** Tlačítko ♡ pod formulářem: hlídané hledání → „♥ Hlídáš“ (klik ukáže hlídané ceny na Přehledu). */
  function updateWatchBtn() {
    const b = $('#watchBtn'); if (!b || !fromInput) return;
    const f = getForm(), on = isWatched(f);
    // 📅 Posouvat termín s časem jen u flexibilního termínu, který jde posouvat (a jen dokud se nehlídá)
    const rl = $('#rollLbl'), roll = !on && Alerts.rollSpec(f, today());
    if (rl) {
      rl.hidden = !roll;
      if (roll) { if (!rollTouched) $('#rollOn').checked = Boolean(rollWanted(f)); rl.title = `♡ uloží hledání jako „${Alerts.rollTxt({ ...f, roll }, today(), { now: false })}“ – ${roll.lw ? 'po každém prodlouženém víkendu se posune na další' : 'termín se každý den posune'}, hlídání neproběhne`; }
    }
    b.textContent = on ? '♥ Hlídáš – na Přehledu' : '♡ Hlídat cenu';
    b.classList.toggle('on', on);
    b.onclick = on ? () => { go('dashboard'); setTimeout(() => $('#watchHead')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); } : () => addWatch();
    const w = $('#ssWatch'); // ♡ ve sbaleném formuláři (telefon)
    if (w) { w.textContent = on ? '♥' : '♡'; w.title = b.textContent; w.classList.toggle('on', on); w.onclick = b.onclick; }
  }

  // Stav karet během kontroly: id → 'wait' (ve frontě) | 'run' (právě se kontroluje).
  const wState = new Map();
  let busySearches = 0; // hledání spuštěná uživatelem – automatická kontrola počká
  const sched = Alerts.scheduler({
    list: () => S.watch || [],
    check: id => checkOne(id, true),
    sync: syncWatches,
    today,
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    canRun: () => !document.hidden && !busySearches,
    firstMax: 12, // po otevření (i po dlouhé pauze) zkontrolovat zastaralá hlídání za nejvýš 12 hledání, pak po 4
    costOf: w => (w.form && w.form.trip === 'multi' ? 2 : 1), // cesta přes víc měst = 2 hledání v limitu serveru
  });
  const cardSel = id => `#watchList [data-w="${CSS.escape(id)}"]`;
  // Chrome na Androidu Notification má, ale ze stránky ho vytvořit nejde (jen přes service worker) → jako by ho neměl.
  const notifCtor = !(navigator.userAgentData && /Android/i.test(navigator.userAgent));
  const notifOk = () => notifCtor ? Alerts.notifState(window.Notification, window.isSecureContext !== false) : 'unsupported';

  // graf jen od poslední změny 🏠 vlastní ceny na letiště (Alerts.epoch) – starší ceny jsou s jinou cestou na letiště
  function sparkSvg(w) {
    const hs = Alerts.epoch(w.history), W = 120, H = 34, sp = Alerts.sparkPath(hs, W, H, 4);
    if (!sp) return '';
    const n = hs.length;
    const lab = `Vývoj ceny za ${n} ${n < 5 ? 'kontroly' : 'kontrol'}: ${czk(sp.min)} až ${czk(sp.max)}`;
    const tgt = w.target >= sp.min && w.target <= sp.max ? `<path class="ws-tgt" d="M0 ${sp.y(w.target)}H${W}"/>` : '';
    return `<svg class="w-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(lab)}"><title>${esc(lab)}</title>${tgt}<path class="ws-line" d="${sp.d}"/><path class="ws-dot" d="M${sp.last[0]} ${sp.last[1]}h0"/></svg>`;
  }
  function watchBar() {
    const n = {
      default: '<button type="button" class="btn sm ghost" id="notifBtn" title="Upozornit i oznámením v prohlížeči">🔔 Upozorňovat</button>',
      granted: '<span class="w-ntf">🔔 Upozornění v prohlížeči jsou zapnutá.</span>',
      denied: '<span class="w-ntf">🔕 Upozornění má prohlížeč pro ATLAS zablokovaná – povolíš je v nastavení webu (ikona vedle adresy).</span>',
      unsupported: '<span class="w-ntf">Tento prohlížeč upozornění neumí – zlevnění uvidíš tady a u položky Přehled.</span>',
    }[notifOk()];
    return `<div class="watch-bar"><span title="Každé hledání kontroluji automaticky zhruba jednou za 6 h – ale jen dokud máš ATLAS otevřený v prohlížeči a panel není schovaný na pozadí. Zavřená stránka nehlídá nic.">🔄 Kontroluji samo zhruba každých 6 h, dokud máš ATLAS otevřený.</span>${n}</div>`;
  }
  function watchCard(w, now = Date.now()) {
    const h = Alerts.epoch(w.history), own = h.length && h[0].own; // od nového základu (změna 🏠 vlastní ceny na letiště, 🙈)
    const cur = w.best?.czk;
    const prev = h.length > 1 ? h[h.length - 2].czk : null;
    const diff = prev && cur ? cur - prev : 0;
    const past = Alerts.isPast(w.form, today());
    const st = wState.get(w.id);
    const since = Alerts.pctChange(w.base ?? h[0]?.czk, cur);
    const low = Alerts.lowest([w.low, ...h.map(x => x.czk), cur]);
    const drop = Alerts.isDropped(w);
    const id = esc(w.id);
    const when = st === 'run' ? '<span class="spin dark"></span> kontroluji…' : st === 'wait' ? '⏳ čeká na kontrolu…'
      : w.checked ? `zkontrolováno <span data-ago="${+w.checked}" title="${esc(new Date(w.checked).toLocaleString('cs-CZ'))}">${Alerts.agoTxt(now - w.checked)}</span>` : 'zatím nezkontrolováno';
    // 📅 klouzavý termín: přepínač (zapnutý), u pevného flexibilního „převést na klouzavé“ (u proběhlého v poznámce)
    const rolled = Alerts.rolls(w.form), canRoll = !rolled && Boolean(rollOf(w));
    const roll = rolled ? `<div class="w-roll"><label class="check-inline"><input type="checkbox" data-wr="${id}" checked> 📅 Posouvat termín s časem</label><span class="faint">porovnává se vždy aktuální termín</span></div>`
      : canRoll && !past ? `<div class="w-roll"><button type="button" class="linkbtn" data-wr="${id}" title="Termín se bude každý den posouvat (jako při uložení) – historie, cílová cena i „od uložení“ zůstanou">📅 převést na klouzavé</button></div>` : '';
    // karta: fotka cíle, hledání a cena nahoře, pod tím vývoj ceny, cílová cena a tlačítka
    const city = w.best && w.best.key ? String(w.best.desc || '').split(' · ')[0] : (w.form && w.form.to && w.form.to.length === 1 && !/^ct:/.test(w.form.to[0].id) ? w.form.to[0].label : '');
    return `<div class="card watch${st ? ' checking' : ''}${past ? ' past' : ''}${drop ? ' dropped' : ''}" data-w="${id}">
        <div class="w-top">${city ? `<span class="w-ph" data-photo="${esc(city)}" style="--h:${ccHue(city)}"></span>` : '<span class="w-ph">🔔</span>'}
          <div class="w-tt"><div class="w-t">${esc(w.label)}</div><div class="w-sub">${esc(subOf(w))}</div></div>
          <div class="w-p">${cur ? czk(cur) : '—'}<small>/os.</small>${diff ? `<span class="${diff < 0 ? 'good' : 'bad'}" title="Oproti minulé kontrole">${diff < 0 ? '↓' : '↑'} ${czk(Math.abs(diff))}</span>` : ''}</div></div>
        ${drop ? '<span class="b good w-drop">📉 zlevnilo</span>' : ''}${roll}
        <div class="w-main">${sparkSvg(w)}<div class="w-stats">${since != null ? `<span${own ? ' title="Cena se přepočítala po změně 🏠 vlastní ceny na letiště nebo seznamu 🙈 – ceny před tím se s novými nesrovnávají"' : ''}>${own ? 'od změny nastavení' : 'od uložení'} <b class="${since < 0 ? 'good' : since > 0 ? 'bad' : ''}">${Alerts.fmtPct(since)}</b></span>` : ''}${low ? `<span>nejnižší ${czk(low)}</span>` : ''}</div></div>
        <div class="w-desc">${esc(w.best?.desc || 'zatím bez výsledku')}</div>
        ${past ? `<div class="note warn w-past">⌛ <div>Termín proběhl – tohle hledání už hlídat nejde. ${canRoll ? `<button type="button" class="linkbtn" data-wr="${id}">📅 Převést na klouzavé</button> – termín se pak bude posouvat s časem a historie i cílová cena zůstanou. Nebo ho smaž.` : 'Smaž ho, nebo ho otevři a vyber nové datum.'}</div></div>`
        : `<label class="w-target">🎯 Upozornit pod <input class="input" type="number" inputmode="numeric" min="0" data-wt="${id}" value="${+w.target > 0 ? +w.target : ''}" aria-label="Cílová cena v Kč na osobu"> Kč <span class="good w-hit" ${cur && cur <= w.target ? '' : 'hidden'}>✓ splněno</span></label>`}
        <div class="w-foot"><div class="w-st faint">${when}</div>
        <div class="row w-act">${past ? `<button class="btn sm" data-wd="${id}">🗑 Smazat</button><button class="btn sm ghost" data-wo="${id}">Otevřít</button>`
        : `<button class="btn sm primary" data-wo="${id}">Otevřít</button><button class="btn sm ghost w-ic" data-wc="${id}" ${st ? 'disabled' : ''} title="Zkontrolovat cenu teď" aria-label="Zkontrolovat cenu teď">↻</button><button class="btn sm ghost w-ic" data-wd="${id}" title="Smazat" aria-label="Smazat">✕</button>`}</div></div>
      </div>`;
  }
  // Rozepsanou cílovou cenu při překreslení nezahodit.
  function keepTyping(fn) {
    const a = document.activeElement, k = a && a.dataset && a.dataset.wt ? { id: a.dataset.wt, v: a.value } : null;
    fn();
    const el = k && $(`#watchList [data-wt="${CSS.escape(k.id)}"]`);
    // hodnotu nastavit až po fokusu (přes prázdnou), jinak kurzor skončí na začátku a „15“ + „00“ = „0015“
    if (el && el !== a) { el.focus(); el.value = ''; el.value = k.v; }
  }
  function renderWatch() {
    updateWatchBtn();
    const list = S.watch || [], host = $('#watchList');
    $('#watchHead').hidden = !list.length;
    const now = Date.now();
    keepTyping(() => { host.innerHTML = list.length ? `${watchBar()}<div class="watch-grid">${list.map(w => watchCard(w, now)).join('')}</div>` : ''; });
    if (window.Photos) Photos.paint(host);
    host.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'notifBtn') askNotif();
      else if (b.dataset.wc) checkWatch(b.dataset.wc);
      else if (b.dataset.wo) openWatch(b.dataset.wo);
      else if (b.dataset.wd) { S.watch = S.watch.filter(x => x.id !== b.dataset.wd); save(); renderWatch(); }
      else if (b.dataset.wr) setRoll(b.dataset.wr, true);
    };
    // ukládat průběžně (překreslení karty během psaní nic neztratí), potvrdit až po dopsání
    host.oninput = e => { if (e.target.dataset.wt) setTarget(e.target.dataset.wt, e.target.value); };
    host.onchange = e => { if (e.target.dataset.wt) setTarget(e.target.dataset.wt, e.target.value, true); else if (e.target.dataset.wr) setRoll(e.target.dataset.wr, e.target.checked); };
    $('#watchCheckAll').onclick = () => Promise.all((S.watch || []).filter(w => !Alerts.isPast(w.form, today())).map(w => checkWatch(w.id)));
    updateWatchBadges();
    observeSeen();
  }
  function paintCard(id) {
    const el = $(cardSel(id)), w = (S.watch || []).find(x => x.id === id);
    if (el && w) { keepTyping(() => { el.outerHTML = watchCard(w); }); if (window.Photos) Photos.paint($('#watchList')); }
  }
  function setState(id, st) { st ? wState.set(id, st) : wState.delete(id); paintCard(id); }
  function openWatch(id) {
    const w = (S.watch || []).find(x => x.id === id); if (!w) return;
    // stejné hledání jako kontrola (watchForm, termín, který už začal, od dneška) – setForm by celý termín posunul
    const f = watchForm(w);
    go('flights'); setForm(SearchHelp.recentForm(f, today()) || f); startSearch();
  }
  function setTarget(id, v, done) {
    const w = (S.watch || []).find(x => x.id === id); if (!w) return;
    const n = Math.round(+v), cur = w.best?.czk;
    w.target = n > 0 ? n : null;
    const met = !!(cur && w.target && cur <= w.target);
    const hit = $(`${cardSel(id)} .w-hit`); if (hit) hit.hidden = !met;
    // Už teď splněno → tuhle cenu znovu nehlásit, ozvat se až při dalším zlevnění.
    if (done && met) w.notified = cur;
    // nový cíl nad cenou ohlášenou dřív (třeba „📉 zlevnilo“) – jinak by ji shouldNotify bralo za už ohlášený cíl a 🎯 by nepřišlo
    else if (done && w.target && +w.notified > 0 && w.notified <= w.target) { delete w.notified; delete w.notifiedAt; }
    save(); renderNews(); // „🎯 pod tvou cenou“ v řádku Od minula hned podle nové cílové ceny
    if (done) toast(!w.target ? 'Cílová cena zrušena' : met ? `Už teď stojí ${czk(cur)} – ozvu se, až cena ještě klesne` : `Upozorním, až bude cena ${czk(w.target)} nebo méně`);
  }
  // Klouzavý termín pro uložené hlídání: rozsah, který už začal, se posune jako v den uložení (čas v id, jinak první bod historie).
  function rollOf(w) {
    const at = Alerts.savedAt(w, Date.now());
    return Alerts.rollSpec({ ...defaultForm(), ...w.form }, today(), { saved: at ? fmtYMD(new Date(at)) : null });
  }
  /** 📅 na kartě: zapnout (i „převést na klouzavé“ u proběhlého – hned se zkontroluje), vypnout = zůstane dnešní termín. */
  function setRoll(id, on) {
    const w = (S.watch || []).find(x => x.id === id); if (!w) return;
    const t = today(), was = Alerts.isPast(w.form, t), spec = on && rollOf(w);
    if (on && !spec) return renderWatch();
    const { roll, ...fixed } = Alerts.rollForm(w.form, t); // vypnuto: dnešní termín natrvalo
    const form = on ? { ...w.form, roll: spec } : fixed;
    // pevný termín může být stejné hledání jako jiné hlídání (a naopak) – dvakrát totéž ne
    const k = watchKey({ ...w, form });
    if ((S.watch || []).some(x => x !== w && watchKey(x) === k)) { toast('Tohle hledání už hlídáš v jiné kartě', 'err'); return renderWatch(); }
    w.form = form; w.sub = watchSub(watchForm(w)); save(); renderWatch();
    toast(on ? `📅 Termín se posouvá s časem – ${Alerts.rollTxt(form, t)}` : `Termín zůstane ${fmtDate(fixed.dFrom)}–${fmtDate(fixed.dTo)}`);
    if (on && was) checkWatch(id);
  }
  /** Ruční kontrola – zařadí se do stejné fronty jako automatická, takže se nikdy nepotkají. */
  function checkWatch(id) {
    if (wState.has(id)) return Promise.resolve();
    setState(id, 'wait');
    const asked = Date.now();
    return sched.exclusive(() => {
      const w = (S.watch || []).find(x => x.id === id);
      // mezitím ho zkontrolovala automatická kontrola → jen ukázat výsledek
      if (w && w.checked >= asked) return toast(`${w.label}: ${w.best ? czk(w.best.czk) : 'nic nenalezeno'}`);
      return checkOne(id, false);
    }).finally(() => { if (wState.get(id) === 'wait') setState(id, null); });
  }
  async function checkOne(id, auto) {
    const w = (S.watch || []).find(x => x.id === id); if (!w) return;
    if (Alerts.isPast(w.form, today())) { if (!auto) toast(`${w.label}: termín už proběhl`, 'err'); return; }
    setState(id, 'run');
    // limit i pro ruční kontrolu – zaseknuté spojení by jinak navždy drželo frontu
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), Alerts.CFG.timeoutMs);
    try {
      const f = watchForm(w);
      if (f.dFrom < today()) f.dFrom = today();
      const payload = payloadOf(f), res = await runSearch(payload, { signal: ctl.signal });
      PriceCheck.remember(res); // každá kontrola hlídaného hledání = další bod trendu ceny
      const cur = (S.watch || []).find(x => x.id === id); if (!cur) return; // mezitím smazané
      // jiné 🏠 vlastní ceny (S.accessOwn jde do hledání, klíč hlídání je nemá) nebo nejlevnější město změnilo 🙈: nový základ, ne zlevnění
      const r = Alerts.applyCheck(cur, bestOf(res), Date.now(), undefined, { partial: Alerts.incomplete(res.providers), own: SearchHelp.ownPrint(res) });
      if (r.skipped) {
        // výpadek zdroje: cenu nepřepisovat (falešné „zlevnilo“ při další kontrole), za chvíli to zkusí znovu
        Object.assign(cur, r.w); save();
        if (!auto) toast(`${cur.label}: některá aerolinka teď neodpověděla – cenu ${czk(r.prev)} nechávám, zkusím to znovu později`);
        return;
      }
      Object.assign(cur, r.w); delete cur.partials; save();
      const b = cur.best;
      if (r.rebased) { if (!auto) toast(`${cur.label}: ${czk(b.czk)} – ${{ own: 'změnila se tvoje 🏠 vlastní cena na letiště', unmute: 'nejlevnější je město vrácené z 🙈 Nezajímá mě', mute: 'minule nejlevnější město máš teď v 🙈 Nezajímá mě' }[r.rebased]}, dál porovnávám od této ceny`); }
      else if (r.why) alertDrop(cur, r.why, r.prev);
      else if (!auto) toast(b && r.prev && b.czk < r.prev ? `📉 ${cur.label}: cena klesla na ${czk(b.czk)}!` : `${cur.label}: ${b ? czk(b.czk) : 'nic nenalezeno'}`);
    } catch (e) {
      // automatická kontrola chybu jen zapíše a zkusí to příští cyklus
      ((S.watch || []).find(x => x.id === id) || w).tried = Date.now(); save();
      if (!auto) toast(e.name === 'AbortError' ? `${w.label}: kontrola trvala moc dlouho – zkus to později` : e.message, 'err');
    } finally {
      clearTimeout(tm); setState(id, null); updateWatchBadges(); observeSeen();
    }
  }
  function alertDrop(w, why, prev) {
    const cur = w.best.czk, pct = Alerts.pctChange(prev, cur);
    const more = why === 'drop' && pct ? `${Alerts.fmtPct(pct)} od minulé kontroly` : w.target ? `tvůj limit ${czk(w.target)}` : '';
    toast(`${why === 'target' ? '🎯' : '📉'} ${w.label}: ${czk(cur)}${more ? ' · ' + more : ''}`);
    if (notifOk() !== 'granted') return;
    try {
      const n = new Notification(why === 'target' ? `ATLAS: ${czk(cur)} – pod tvou cenou` : `ATLAS: cena klesla na ${czk(cur)}`, { body: `${w.label} · ${subOf(w) || ''}${more ? `\n${more}` : ''}\nKlikni a otevřu hledání.`, tag: 'atlas-watch-' + w.id });
      n.onclick = () => { window.focus(); n.close(); openWatch(w.id); };
    } catch (e) { } // např. Android Chrome umí upozornění jen přes service worker
  }
  function askNotif() {
    if (notifOk() !== 'default') return renderWatch();
    let done = false;
    const fin = p => {
      if (done) return; done = true;
      if (p === 'granted') toast('Upozornění zapnutá – ozvu se, až cena klesne');
      renderWatch();
    };
    try { const r = Notification.requestPermission(fin); if (r && r.then) r.then(fin, () => fin(Notification.permission)); } catch (e) { fin(Notification.permission); }
  }
  // Jiný panel s ATLASem mohl mezitím kontrolovat, přidat nebo smazat hledání – převzít to
  // (neupozorňovat dvakrát a při příštím uložení jeho změny nepřepsat starým seznamem).
  function syncWatches() {
    try {
      const d = JSON.parse(localStorage.getItem(LS)), r = Alerts.mergeWatches(S.watch, d && d.watch);
      if (r.changed) S.watch = r.list;
      return r.changed;
    } catch (e) { return false; }
  }

  /* ukazatel „zlevnilo od minule“ – zmizí, když si uživatel seznam na přehledu prohlédne */
  function watchStatTxt() {
    const list = S.watch || [], n = Alerts.droppedCount(list);
    return n ? `<b class="good">📉 Zlevnilo od minule: ${n}</b>` : list.length ? 'Hlídám, dokud máš ATLAS otevřený' : 'Ulož hledání tlačítkem ♡';
  }
  /** „Od minula: 📉 Brno → Řím −380 Kč · 🎯 Londýn pod tvou cenou · 📡 radar: 3 cíle levněji“ hned pod hledáním. */
  function renderNews() {
    const el = $('#newsLine'); if (!el) return;
    // radar jen pro současný domov a režim (po změně domova by hlásil změny starého)
    const q = S.home?.from?.length ? SearchHelp.radarQuery(S.radarMode, radarHome(), today(), S.radarHoliday) : null;
    const r = radarCached(q);
    // jen karty, které radar ukazuje (bez 🙈, prvních 12 z uložených)
    const n = Alerts.news(S.watch, r && SearchHelp.radarSame(r.key, radarKey(q)) ? radarVisible(r) : null, today());
    // nejdůležitější (pod cílovou cenou, jinak největší zlevnění) jako velká karta úplně nahoře, zbytek v řádku
    const top = n.hits[0] || n.watch[0];
    renderDropCard(top && (S.watch || []).find(w => w.id === top.id), n.hits.length + n.watch.length);
    const hits = n.hits.filter(x => x !== top), drops = n.watch.filter(x => x !== top);
    const parts = [
      ...hits.slice(0, 2).map(x => `<button type="button" class="linkbtn" data-nl="watch">🎯 ${esc(x.label)} pod tvou cenou (${czk(x.czk)})</button>`),
      ...drops.slice(0, 2).map(x => `<button type="button" class="linkbtn" data-nl="watch">📉 ${esc(x.label)} −${czk(x.d)}</button>`),
      hits.length + drops.length > Math.min(2, hits.length) + Math.min(2, drops.length) ? `<span class="faint">+${hits.length + drops.length - Math.min(2, hits.length) - Math.min(2, drops.length)} další</span>` : '',
      n.down || n.fresh ? `<button type="button" class="linkbtn" data-nl="radar">📡 radar: ${[n.down ? `${n.down} ${n.down === 1 ? 'cíl' : n.down <= 4 ? 'cíle' : 'cílů'} levněji` : '', n.fresh ? `${n.fresh} ${n.fresh === 1 ? 'nový' : n.fresh <= 4 ? 'nové' : 'nových'}` : ''].filter(Boolean).join(' · ')}</button>` : '',
    ].filter(Boolean);
    el.hidden = !parts.length;
    el.innerHTML = parts.length ? `<b>Od minula:</b> ${parts.join('<span class="faint"> · </span>')}` : '';
    $$('[data-nl]', el).forEach(b => b.onclick = () => $(b.dataset.nl === 'radar' ? '#radar' : '#watchHead')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  /** 📉 Zlevnilo o 12 % – velká karta s fotkou cíle nahoře na Přehledu; zmizí po prohlédnutí seznamu nebo po otevření. */
  function renderDropCard(w, total) {
    const el = $('#dropCard'); if (!el) return;
    el.hidden = !w;
    if (!w) { el.innerHTML = ''; return; }
    const cur = w.best.czk, hit = +w.target > 0 && cur <= w.target, drop = Alerts.isDropped(w);
    const pct = drop ? Alerts.pctChange(w.seen, cur) : null;
    const city = w.best.key ? String(w.best.desc || '').split(' · ')[0] : '';
    const head = drop && pct ? `📉 Zlevnilo o ${Alerts.fmtPct(pct).replace(/^−/, '')}` : '🎯 Pod tvou cenou';
    el.innerHTML = `<div class="card dest drop-card"${city ? ` data-photo="${esc(city)}"` : ''} style="--h:155">
      <span class="drop-chip">${head}</span>
      <div class="dest-panel"><div class="cname">${esc(w.label)}</div>
        <div class="drop-price"><b>${czk(cur)}</b><small>/os.</small>${drop ? ` <s>${czk(w.seen)}</s>` : ''}${hit ? ` <span class="drop-tg">pod ${czk(w.target)}</span>` : ''}</div>
        <div class="cblurb">${esc(w.best.desc || subOf(w) || '')}</div>
        <div class="drop-act"><button type="button" class="btn primary sm" data-dco>Zobrazit lety</button><button type="button" class="btn sm drop-all" data-dca>${total > 1 ? `Všechna zlevnění (${total})` : 'Hlídané ceny'}</button></div>
      </div></div>`;
    // otevřením je zlevnění „viděné“ (jako po prohlédnutí seznamu)
    $('[data-dco]', el).onclick = () => { w.seen = cur; save(); updateWatchBadges(); openWatch(w.id); };
    $('[data-dca]', el).onclick = () => $('#watchHead')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.Photos) Photos.paint(el);
  }
  function updateWatchBadges() {
    renderNews();
    const n = Alerts.droppedCount(S.watch);
    const nb = $('#navDrops'); if (nb) { nb.hidden = !n; nb.textContent = '📉 ' + n; }
    const md = $('#mobDrops'); if (md) md.hidden = !n;
    const val = $('#watchStatVal'); if (val) val.textContent = (S.watch || []).length;
    const sub = $('#watchStatSub');
    if (sub) { sub.innerHTML = watchStatTxt(); sub.onclick = n ? () => $('#watchHead').scrollIntoView({ behavior: 'smooth', block: 'start' }) : null; sub.classList.toggle('jump', !!n); }
  }
  let seenIO = null, seenT = 0;
  function observeSeen() {
    const el = $('#watchList .watch-grid'); if (!el || !window.IntersectionObserver) return;
    // karty musí být opravdu na obrazovce (ne jen okraj pod ohybem stránky)
    seenIO = seenIO || new IntersectionObserver(es => { clearTimeout(seenT); if (es.some(e => e.isIntersecting)) seenT = setTimeout(markSeen, 1500); }, { rootMargin: '0px 0px -25% 0px' });
    seenIO.disconnect(); seenIO.observe(el); // znovu vyhodnotit i bez posunu stránky
  }
  function markSeen() {
    if (activeView !== 'dashboard' || document.hidden) return;
    let ch = 0;
    for (const w of S.watch || []) if (w.best?.czk > 0 && w.seen !== w.best.czk) { w.seen = w.best.czk; ch++; }
    if (ch) { save(); updateWatchBadges(); }
  }

  /** Automatické kontroly: chvíli po startu a pak každých 30 min, jen v otevřeném a viditelném panelu. */
  function startAutoCheck() {
    const C = Alerts.CFG, tick = () => sched.cycle();
    setTimeout(tick, C.startMs);
    setInterval(tick, C.cycleMs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (Date.now() - sched.lastCycle >= C.cycleMs) setTimeout(tick, 1500);
      observeSeen();
    });
    window.addEventListener('storage', e => { if (e.key === LS && syncWatches()) renderWatch(); });
    setInterval(() => $$('#watchList [data-ago]').forEach(el => { el.textContent = Alerts.agoTxt(Date.now() - +el.dataset.ago); }), 60e3);
  }

  /* ---------- živý radar na přehledu (Kdykoliv / Víkendy – SearchHelp.radarQuery) ---------- */
  // Rozběhnuté hledání radaru podle dotazu: přepnutí tam a zpět ani nové vykreslení přehledu ho nespustí podruhé.
  const radarJobs = {};
  let radarWant = null; // dotaz, jehož výsledek má radar ukázat – pozdě doběhlé hledání druhého režimu se jen uloží
  // Návrat do aplikace (z plochy, z jiné karty) na otevřený přehled: zastaralý radar se sám obnoví (starší ceny zůstanou
  // vidět, dokud nedorazí nové).
  document.addEventListener('visibilitychange', () => {
    ageTick(); // výsledky hledání na Letech a cena letu v průvodci: jak jsou staré
    if (document.hidden || !document.querySelector('#view-dashboard.active') || !(S.home && S.home.from?.length) || $('#radarGo')) return; // rozdělané „Odkud obvykle létáš?“ nechat
    const c = radarCached(SearchHelp.radarQuery(S.radarMode, radarHome(), today(), S.radarHoliday));
    if (!c || Date.now() - c.at >= 30 * 60e3 || !SearchHelp.radarOwnOk(c, S.accessOwn)) renderRadar();
  });
  // Klíč výsledku radaru: dotaz, u svátků i který prodloužený víkend (jiný svátek = jiné hledání, žádné „↓ od minula“).
  // Bez 🏠 vlastních cen na letiště (nastavení zařízení, i letišť mimo okruh) – platnost uložených cen s nimi hlídá
  // otisk own výsledku (SearchHelp.radarOwnOk): změna ceny u MUC radar z Brna nezahodí, u BRQ hledá znovu se starými kartami.
  const radarKey = q => { const { accessOverride, ...p } = q.payload || {}; return JSON.stringify(q.payload ? (q.lw ? { ...p, lw: q.lw.start } : p) : null); };
  // domov radaru + počet cestujících radaru (nastavení domova, výchozí 2 jako ve formuláři) – ne z posledního hledání,
  // jinak by střídání 1 a 2 lidí pokaždé zahodilo uložený radar; proklik z karty hledá pro stejný počet (stejná cena)
  const radarAdults = () => Math.min(9, Math.max(1, Math.round(+S.home?.adults) || 2));
  // + 🏠 vlastní ceny na letiště (veřejnou dopravou jako v hledání – proklik z karty pak ukáže stejnou cenu)
  const radarHome = () => ({ ...S.home, adults: radarAdults(), own: S.accessOwn });
  const radarModeKey = () => (['weekend', 'holiday'].includes(S.radarMode) ? S.radarMode : 'all');
  // uložený výsledek dotazu q: u svátků zvlášť pro každý prodloužený víkend (přepnutí čipu tam a zpět nehledá znovu)
  const radarCached = q => (!q || q.none ? null : q.mode === 'holiday' ? (S.radar?.lw || {})[q.lw.start] : S.radar?.[q.mode]) || null;
  // uložený výsledek jen s kartami, které radar ukazuje (bez 🙈 cílů, nejvýš 12)
  const radarVisible = e => (e && Array.isArray(e.items) ? { ...e, items: SearchHelp.radarShown(e.items, prefLists().mute).map(s => s.x) } : e);
  let radarLast = null; // naposledy vykreslený výsledek radaru – ⭐ / 🙈 ho překreslí bez hledání
  /** Čipy prodloužených víkendů v radaru, u každého nejlevnější cena z uloženého výsledku (žádné hledání navíc). */
  function paintLw(q) {
    const lwBox = $('#radarLw'), all = (q.lw && q.lw.all) || [];
    lwBox.hidden = all.length < 2;
    if (all.length < 2) { lwBox.innerHTML = ''; return; }
    // jen ceny spočtené s dnešními 🏠 vlastními cenami letišť radaru (radarOwnOk)
    const lwMap = Object.fromEntries(Object.entries(S.radar?.lw || {}).filter(([, e]) => SearchHelp.radarOwnOk(e, S.accessOwn)).map(([k, e]) => [k, radarVisible(e)]));
    const pr = SearchHelp.lwPrices(lwMap, all, x => radarKey(SearchHelp.radarQuery('holiday', radarHome(), today(), x.start)), Date.now(), today());
    const known = Object.values(pr), best = known.length > 1 ? Math.min(...known.map(p => p.czk)) : null;
    const bestTxt = known.length < all.length ? ' – nejlevnější z víkendů s cenou' : all.length === 2 ? ' – nejlevnější z obou' : ' – nejlevnější ze všech';
    const at = t => { const d = new Date(t); return `${d.toDateString() === new Date().toDateString() ? '' : `${d.getDate()}. ${d.getMonth() + 1}. `}${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`; };
    lwBox.innerHTML = all.map(x => { const p = pr[x.start]; return `<button type="button" class="fchip ${x.start === q.lw.start ? 'on' : ''}" data-lw="${x.start}" title="${esc(x.name)}${x.bridge ? ' – s jedním dnem volna' : ''}${p ? ` · nejlevnější v radaru ${czk(p.czk)}/os. (${at(p.at)})${p.czk === best ? bestTxt : ''}` : ' · cenu ukáže radar po klepnutí'}">🎉 ${SearchHelp.dmRange(x.start, x.end)} <small>${esc(x.name)}</small>${p ? ` <span class="lw-p${p.czk === best ? ' best' : ''}">od ${czk(p.czk)}</span>` : ''}</button>`; }).join('');
    $$('[data-lw]', lwBox).forEach(b => b.onclick = () => { if (b.dataset.lw !== q.lw.start) { S.radarHoliday = b.dataset.lw; save(); renderRadar(); } });
  }
  async function renderRadar(force) {
    const host = $('#radar'), modes = $('#radarModes');
    radarLast = null;
    if (!S.home || !S.home.from?.length) return radarSetup();
    const q = SearchHelp.radarQuery(S.radarMode, radarHome(), today(), S.radarHoliday), key = radarKey(q);
    radarWant = key;
    modes.hidden = false;
    $$('button', modes).forEach(b => {
      b.classList.toggle('on', b.dataset.m === q.mode);
      b.onclick = () => { if (b.dataset.m !== q.mode) { S.radarMode = b.dataset.m; save(); renderRadar(); } };
    });
    $('#radarSub').innerHTML = `${esc(q.sub.replace(/^\s*·\s*/, ''))} <button type="button" class="linkbtn" id="radarHome">změnit</button>`;
    // Svátky: výběr z nejbližších prodloužených víkendů (s cenou, kterou radar už zná)
    paintLw(q);
    $('#radarHome').onclick = () => radarSetup(true);
    $('#radarReload').style.visibility = ''; $('#radarReload').onclick = () => renderRadar(true);
    if (q.none) { renderNews(); host.innerHTML = `<div class="note info">🗓️ <div>${esc(q.empty)}</div></div>`; return; }
    const c = radarCached(q);
    if (!force && c && c.key === key && Date.now() - c.at < 30 * 60e3 && SearchHelp.radarOwnOk(c, S.accessOwn)) return paintRadar(c, q);
    // Starší výsledek stejného dotazu se ukáže hned a nový se hledá na pozadí – po uspání serveru to trvá i přes minutu.
    const old = SearchHelp.radarStale(c, key, today());
    if (old) paintRadar(old, q, { busy: true });
    else host.innerHTML = `<div class="faint radar-stale"><span class="spin"></span> Hledám nejlevnější lety z okolí – obvykle do půl minuty<span class="rp"></span></div><div class="radar-grid">${Array.from({ length: 8 }, () => '<div class="card radar-card skel"></div>').join('')}</div>`;
    const job = radarJobs[key] || (radarJobs[key] = radarSearch(q, key).finally(() => { delete radarJobs[key]; }));
    try {
      const r = await job;
      if (radarWant === key) paintRadar(r, q);
    } catch (e) {
      if (radarWant !== key) return;
      if (old) paintRadar(old, q, { error: e.message });
      else host.innerHTML = `<div class="note warn">⚠️ <div>Radar se nepodařilo načíst: ${esc(e.message)}</div></div>`;
    }
  }
  /** Nastavení domova radaru („Odkud obvykle létáš?“) – poprvé, nebo změna (edit: předvyplněné, se Zrušit). */
  function radarSetup(edit = false) {
    const host = $('#radar');
    radarWant = null; radarLast = null;
    $('#radarModes').hidden = true; $('#radarLw').hidden = true;
    $('#radarSub').textContent = '';
    $('#radarReload').style.visibility = S.home?.from?.length ? '' : 'hidden'; // bez domova není co obnovit
    const rad = +(S.home?.radius ?? 200);
    host.innerHTML = `<div class="card radar-setup"><div><b>Odkud obvykle létáš?</b><div class="muted" style="font-size:13px">${edit ? 'Radar ukazuje nejlevnější lety z okolí tohoto místa. Jiná hledání ho nemění.' : 'Nastav výchozí místo a radar ti tu bude ukazovat nejlevnější lety z okolí na příštích 6 týdnů.'}</div></div><div class="rs-where"><div class="place-input" id="radarFrom"></div><label class="rs-radius faint">+ letiště do <select id="radarRadius">${[...new Set([0, 50, 100, 150, 200, 300, 400, 500, rad])].sort((a, b) => a - b).map(k => `<option value="${k}"${k === rad ? ' selected' : ''}>${k ? k + ' km' : '0 km (jen tohle)'}</option>`).join('')}</select></label><label class="rs-radius faint">ceny pro <select id="radarAdults">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === Math.min(6, radarAdults()) ? ' selected' : ''}>${n} ${n === 1 ? 'osobu' : n < 5 ? 'osoby' : 'osob'}</option>`).join('')}</select></label></div><div class="row" style="gap:8px"><button class="btn primary" id="radarGo">${edit ? 'Uložit' : 'Nastavit'}</button>${edit ? '<button class="btn ghost" id="radarCancel">Zrušit</button>' : ''}</div></div>`;
    const pi = new PlaceInput($('#radarFrom'), { origin: true, placeholder: 'Např. Brno, Praha, Vídeň…' });
    if (edit) pi.set(S.home.from, true);
    $('#radarGo').onclick = () => {
      if (!pi.items.length) return toast('Vyber místo ze seznamu', 'err');
      S.home = { from: pi.items.slice(), radius: +$('#radarRadius').value, adults: +$('#radarAdults').value || 2 }; save(); updateHomeChip();
      // prázdné Odkud ve formuláři: domov i s okruhem (jinak by hledání z Lety šlo s výchozími 200 km)
      if (fromInput && !fromInput.items.length) { $('#radius').value = S.home.radius; $('#radiusVal').textContent = $('#radius').value + ' km'; fromInput.set(pi.items); }
      renderRadar(true); heroFrom && heroFrom.set(pi.items, true);
    };
    const cn = $('#radarCancel'); if (cn) cn.onclick = () => renderRadar();
  }
  async function radarSearch(q, key) {
    busySearches++;
    try {
      const res = await runSearch(q.payload, { onProgress: ev => radarProgress(ev, key) });
      PriceCheck.remember(res);
      renderFav(); // ⭐ Moje cíle: ceny, které radar právě viděl
      // u svátků jen odlet první volný den nebo večer předem (SearchHelp.radarPick); s rezervou (RADAR_KEEP cílů mimo 🙈),
      // aby 🙈 později jen schovalo kartu a posunula se další – bez nového hledání; 🙈 cíle zůstanou uložené na svém
      // místě (do rezervy se nepočítají, schová je až paintRadar), takže cíl vrácený z 🙈 se hned zase ukáže
      const mute = prefLists().mute;
      const at = Date.now(), items = SearchHelp.radarPick(res.groups, q.lw, SearchHelp.RADAR_KEEP, SearchHelp.destKeys(mute)).map(({ g, t }) => ({ label: g.dest.label, cc: g.dest.cc, id: g.dest.id, czk: t.perPersonCzk, from: t.out.from, to: t.out.to, d1: t.out.date, d2: t.back?.date,
        // zpět z jiného letiště / na jiné letiště (kombinace z Kamkoliv) – na kartě „JCL → POZ ↩ PED“ (SearchHelp.radarRoute)
        ...(t.back && (t.back.from !== t.out.to || t.back.to !== t.out.from) ? { bf: t.back.from, bt: t.back.to } : {}),
        // čas odletu a přílet zpět kvůli dnům dovolené na kartě (SearchHelp.leaveDays)
        t1: t.out.hasTime ? String(t.out.dep).slice(11, 16) : '', a2: t.back && t.back.hasTime && t.back.arr ? String(t.back.arr).slice(0, 16) : '', deal: t.deal.level, score: t.deal.score, prov: t.out.provider,
        ...(wxGeo(g.dest) ? { lat: +g.dest.lat.toFixed(3), lon: +g.dest.lon.toFixed(3) } : {}), // předpověď na kartě
        // z letiště do města (s polohou města – střed pro „Co vidět“) pro 🔎 Co tam je
        ...(res.arrivals && res.arrivals[t.out.to] ? { ar: res.arrivals[t.out.to] } : {}),
        // odkaz na nabídku z karty – hledání do jednoho cíle ji nemusí vrátit (Kiwi dává pro „kamkoliv“ jiné nabídky)
        ...(t.bookUrl ? { buy: [[t.bookUrl, t.provider, 'all']] } : t.out.bookUrl || t.back?.bookUrl ? { buy: [...(t.out.bookUrl ? [[t.out.bookUrl, t.out.provider, 'out']] : []), ...(t.back?.bookUrl ? [[t.back.bookUrl, t.back.provider, 'back']] : [])] } : {}) }));
      // co se od minulého výsledku změnilo (↓ cena, nový cíl – proti kartám, které radar ukazoval); s výpadkem zdroje bez značek
      const r = SearchHelp.radarEntry(radarCached(q), items, key, at, { demo: res.demo, partial: Alerts.incomplete(res.providers), mute, own: SearchHelp.ownPrint(res), ap: (res.origins || []).map(o => o.iata) });
      // domov se mezitím změnil: starý dotaz už nic nepřepíše
      // (u svátků se porovná víkend tohoto hledání – výsledek víkendu, od kterého uživatel mezitím překlikl, se uloží)
      if (!S.home?.from?.length || radarKey(SearchHelp.radarQuery(q.mode, radarHome(), today(), q.lw ? q.lw.start : S.radarHoliday)) !== key) return r;
      // každý režim zvlášť, svátky po víkendech (minulé víkendy a dřívější tvar se zahodí)
      S.radar = { all: S.radar?.all, weekend: S.radar?.weekend, lw: S.radar?.lw, ...(q.mode === 'holiday' ? { lw: SearchHelp.lwKeep(S.radar?.lw, q.lw.all, q.lw.start, r) } : { [q.mode]: r }) };
      save();
      // pozdě doběhlý jiný víkend: jeho cena hned na čip
      // (radarWant = null: otevřené „Odkud obvykle létáš?“ – čipy tam nepatří)
      if (q.mode === 'holiday' && radarWant && radarWant !== key && S.radarMode === 'holiday') paintLw(SearchHelp.radarQuery('holiday', radarHome(), today(), S.radarHoliday));
      return r;
    } finally { busySearches--; }
  }
  /** Průběh hledání radaru po zdrojích (Ryanair ✓ · Wizz Air 6/10 · Kiwi.com…) – jen když radar ukazuje právě tenhle dotaz. */
  function radarProgress(ev, key) {
    const el = radarWant === key && $('#radar .rp');
    if (!el || !ev || !Array.isArray(ev.providers) || !ev.providers.length) return;
    el.textContent = ' · ' + ev.providers.map(p => `${shopName(p.id)} ${p.state === 'done' || p.state === 'partial' ? '✓' : p.state === 'error' ? '✕' : p.calls ? `${p.done}/${p.calls}` : '…'}`).join(' · ');
  }
  /** Značka změny od minula: „↓ 420 Kč“ (zlevnilo), „↑ 300 Kč“ (zdražilo), „nové“ (cíl tu minule nebyl). */
  function radarChange(x) {
    const when = t => { const d = new Date(t); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`; };
    if (x.was && x.was.czk !== x.czk) {
      const down = x.czk < x.was.czk, d = Math.abs(x.czk - x.was.czk);
      return `<span class="b ${down ? 'good' : 'dear'}" title="Předtím ${czk(x.was.czk)}/os. (${when(x.was.at)})">${down ? '↓' : '↑'} ${czk(d)}</span>`;
    }
    return x.newAt ? `<span class="b info" title="Minule mezi nejlevnějšími nebyl">nové</span>` : '';
  }
  /** Dny dovolené na kartě radaru (pod termínem „🏖️ 1 den dovolené“); starší uložené karty bez času odletu počítají celý den odletu. */
  function radarLeave(x) {
    const lv = x.d2 ? SearchHelp.leaveDays({ date: x.d1, hasTime: !!x.t1, dep: x.t1 ? `${x.d1}T${x.t1}` : '' }, { date: x.d2, hasTime: !!x.a2, arr: x.a2 || '' }) : null;
    if (!lv) return '';
    const lt = SearchHelp.leaveTxt(lv);
    return `<span class="rc-lv" title="${esc(lt.title)}">${esc(lt.text)}</span>`;
  }
  /** st: { busy } = starší výsledek, nový se hledá · { error } = starší výsledek, nový se nepodařilo načíst. */
  function paintRadar(r, q, st = null) {
    radarLast = { r, q, st };
    renderNews();
    if (q.lw) paintLw(q);
    const host = $('#radar');
    if (!r.items.length) { host.innerHTML = `<div class="note info">ℹ️ <div>${esc(q.empty)}</div></div>`; return; }
    // 🙈 cíle pryč, na jejich místo další uložené karty (radar si jich drží víc – RADAR_KEEP); ⭐ se štítkem
    const pl = prefLists(), shown = SearchHelp.radarShown(r.items, pl.mute);
    if (!shown.length) { host.innerHTML = `<div class="note info">🙈 <div>Všechny nalezené cíle máš v 🙈 Nezajímá mě. Klepni na <b>Obnovit</b> – radar pak hledá bez nich – nebo uprav seznam v ⭐ Moje cíle níž.</div></div>`; return; }
    // u víkendů i den v týdnu (Pá 17.10.–Ne 19.10.) – s datem nerozdělitelně, zalomí se nejvýš za pomlčkou
    const day = d => (q.mode === 'weekend' ? DOW[new Date(d + 'T12:00:00Z').getUTCDay()] + '\u00a0' : '') + fmtDate(d);
    // čas výsledku, u staršího než dnešního i den (8.10. 9:12)
    const at = new Date(r.at), when = (at.toDateString() === new Date().toDateString() ? '' : `${at.getDate()}.${at.getMonth() + 1}. `) + at.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    const stale = !st ? '' : `<div class="faint radar-stale">${st.error ? `⚠️ Aktuální ceny se nepodařilo načíst (${esc(st.error)}) – ukazuji ceny z ${when}.` : `<span class="spin"></span> Ukazuji ceny z ${when}, hledám aktuální…<span class="rp"></span>`}</div>`;
    // 🔥 jen u 3 karet nejvýhodnějších vůči běžné ceně na tu vzdálenost – u 12 nejlevnějších cílů má „super cenu“ skoro každý
    const hot = new Set(shown.filter(({ x }) => x.deal === 'super').sort((a, b) => (b.x.score || 0) - (a.x.score || 0)).slice(0, 3).map(({ i }) => i));
    // 📌 karta, jejíž nabídku má uživatel odloženou (z radaru, nebo celou z hledání se stejným nastavením)
    const pins = pinList(), pinned = x => Pins.has(pins, Pins.fromRadar(x, { at: r.at, adults: q.payload?.adults }));
    host.innerHTML = `${r.demo ? '<div class="faint" style="font-size:12px;margin-bottom:8px">⚠️ demo data</div>' : ''}<div class="faint radar-what">Za osobu${q.payload?.adults > 1 ? ` (cestujete ${q.payload.adults})` : ''}: zpáteční letenka + cesta na letiště a z letiště do města</div>${stale}<div class="radar-grid${st ? ' stale' : ''}">${shown.map(({ x, i }) => {
      const cn = (byIso[x.cc] && byIso[x.cc].cs) || '';
      const bd = `${prefBadge(SearchHelp.destKeyOf(x.id), pl)}${newBadge(x.cc)}${pinned(x) ? ' <span class="b pin-b" title="Odložená nabídka – 📌 Porovnat">📌</span>' : ''}${radarChange(x)}${hot.has(i) ? '<span class="b hot" title="Jedna z nejvýhodnějších cen vůči běžné ceně na tu vzdálenost">🔥 super cena</span>' : ''}`.trim();
      return `<div class="card radar-card${hot.has(i) ? ' hot' : ''}" data-ri="${i}" data-photo="${esc(x.label)}" style="--h:${ccHue(x.cc)}">
      <div class="rc-badges">${bd}</div>
      ${dmBtn({ ...x, key: SearchHelp.destKeyOf(x.id) }, `data-rdm="${i}"`)}
      <div class="rc-panel">
        <div class="rc-city"><span class="rc-lbl">${esc(x.label)}</span>&#8288;<button type="button" class="rc-info" data-rinfo="${i}" aria-label="Co tam je – ${esc(x.label)}" title="🔎 Co tam je: místa k vidění, z letiště do města, počasí, vstup">i</button></div>
        <div class="rc-meta"><span class="rcf">${flag(x.cc)}</span>${esc(cn)}${cn ? ' · ' : ''}${day(x.d1)}${x.d2 ? '–' + day(x.d2) : ''}</div>
        <div class="rc-sub"${x.bt ? ' title="Zpět z jiného letiště nebo na jiné letiště než odlet"' : ''}>${esc(SearchHelp.radarRoute(x))}${radarLeave(x)}</div>
        <div class="rc-foot"><div class="rc-price">${czk(x.czk)}<small>/os.</small></div><span class="rc-go" aria-hidden="true">›</span></div>
      </div>
    </div>`;
    }).join('')}</div><div class="faint" style="font-size:11.5px;margin-top:8px">Aktualizováno ${when}${r.partial ? ' · ⚠️ část aerolinek neodpověděla – ceny můžou být vyšší' : ''} · klepni na kartu: detail, koupit let nebo všechny termíny · fotky <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a> a Wikimedia Commons</div>`;
    // telefon: nejdřív 6 karet, zbytek tlačítkem (CSS skryje 7.+ jen na úzké obrazovce; rozbalené zůstane do zavření aplikace)
    const rg = $('.radar-grid', host), rcN = rg ? rg.children.length : 0;
    if (rg && rcN > 6) {
      if (radarAll) rg.classList.add('all');
      else {
        const m = rcN - 6;
        rg.insertAdjacentHTML('afterend', `<button type="button" class="more-btn radar-more" id="radarMore">Ukázat další ${m} ${m === 1 ? 'cíl' : m <= 4 ? 'cíle' : 'cílů'}</button>`);
        $('#radarMore', host).onclick = e => { radarAll = true; rg.classList.add('all'); e.currentTarget.remove(); };
      }
    }
    $$('[data-rdm]', host).forEach(b => b.onclick = e => { e.stopPropagation(); const x = r.items[+b.dataset.rdm]; destMenu({ id: x.id, label: x.label, cc: x.cc }, { radar: x, r, q }); });
    $$('[data-rinfo]', host).forEach(b => b.onclick = e => { e.stopPropagation(); openRadarPreview(r, r.items[+b.dataset.rinfo], q, b); });
    // klepnutí na kartu: detail cíle (fotka, termín, cesta z letiště, Koupit let, Všechny termíny) – k nákupu o krok blíž
    $$('[data-ri]', host).forEach(c => c.onclick = () => openRadarPreview(r, r.items[+c.dataset.ri], q, c));
    radarWx(r);
    radarPhotos(r);
  }
  /** Karta radaru → hledání do jejího cíle, všechny termíny. */
  function radarGo(x, q) {
    go('flights');
    // jako radar – i lety s přestupem a pro stejný počet lidí (stejná cena za osobu jako na kartě)
    setForm({ ...defaultForm(), ...prefsOf(S.form), from: S.home.from, to: [{ id: x.id, label: x.label, flag: flag(x.cc) }], ...q.form, adults: q.payload.adults, directOnly: false });
    startSearch({ card: x });
  }
  // Předpověď na kartách radaru (odlet do 15 dní): jeden dotaz na všechny karty, weather.js ho hodinu drží v paměti.
  // Karty uložené dřív bez souřadnic štítek nedostanou; mezitím překreslený radar (jiné karty) se nepřepisuje.
  let radarWxP = null; // { r, p } – předpověď karet radaru i pro jejich 🔎 Co tam je (žádný dotaz navíc)
  function radarWx(r) {
    const cards = $$('#radar [data-ri]');
    const its = window.Weather ? r.items.map((x, i) => [x, cards.find(c => +c.dataset.ri === i)]).filter(([x, c]) => c && wxGeo(x) && wxWin(x.d1)) : [];
    if (!its.length) return;
    radarWxP = { r, p: Weather.span(its.map(([x]) => x)) };
    radarWxP.p.then(m => its.forEach(([x, c]) => {
      const s = c.isConnected && wxSum(m, x, x.d1, x.d2);
      if (!s) return;
      const box = $('.rc-badges', c); // štítky nahoře na kartě
      if (box) box.insertAdjacentHTML('beforeend', wxChip(s, s.short));
    }));
  }

  // 📷 fotky měst na kartách radaru (app.js Photos – až jsou karty skoro vidět)
  function radarPhotos() { if (window.Photos) Photos.paint($('#radar')); }

  /* ---------- rychlé hledání (přehled) ---------- */
  function renderQuick() {
    const QF = [
      ['🌍', 'Kamkoliv nejlevněji', 'Celý svět z tvého okolí, příští 2 měsíce', { to: [] }, 'Lisabon'],
      ['☀️', 'Za teplem', 'Kde bývá přes den 25 °C a víc · příští 2 měsíce', { to: [], minTemp: 25, trip: 'return', len: 'custom', nMin: 5, nMax: 10 }, 'Tenerife'],
      ['🏙️', 'Víkend v Evropě', 'Čt/Pá–Ne/Po, příštích 6 týdnů', { to: [], len: 'weekend', dTo: addDays(today(), 45) }, 'Paříž'],
      // pole Kam pojme nejvýš 5 míst
      ['🌏', 'Dálky a exotika', 'Thajsko, Bali, Vietnam, Emiráty, Srí Lanka', { to: EXOTIC.slice(0, 5).map(cc => ({ id: 'cc:' + cc, label: byIso[cc]?.cs || cc, flag: flag(cc) })), len: 'custom', nMin: 7, nMax: 21, dTo: addDays(today(), 90) }, 'Bali'],
      ['🏯', 'Asie', 'Thajsko, Vietnam, Japonsko, Bali, Srí Lanka…', { to: [{ id: 'ct:asia', label: 'Asie', flag: '🌏' }], len: 'custom', nMin: 7, nMax: 21, dTo: addDays(today(), 60) }, 'Kjóto'],
      ['🦁', 'Afrika', 'Egypt, Maroko, Keňa, Zanzibar, Kapské Město…', { to: [{ id: 'ct:africa', label: 'Afrika', flag: '🌍' }], len: 'custom', nMin: 7, nMax: 16, dTo: addDays(today(), 60) }, 'Kapské Město'],
      ['🗽', 'Amerika', 'New York, Mexiko, Karibik, Kuba…', { to: [{ id: 'ct:namerica', label: 'Severní a Střední Amerika', flag: '🗽' }], len: 'custom', nMin: 7, nMax: 21, dTo: addDays(today(), 60) }, 'New York'],
    ];
    // ⭐ Moje cíle: prvních 5 (pole Kam jich víc nepojme) v termínech radaru
    const fav = prefLists().fav;
    const qfHtml = (fav.length ? `<div class="card dest" data-qfav="1" data-photo="${esc(String(favNames(fav)).split(', ')[0])}" style="--h:200"><div class="flag">⭐</div><div class="dest-panel"><div class="cname">Moje cíle</div><div class="cblurb">${esc(favNames(fav))} · termíny jako radar</div><div class="meta"><span class="chip accent">Hledat lety</span><span>→</span></div></div></div>` : '')
      + QF.map((q, i) => `<div class="card dest" data-qf="${i}" data-photo="${esc(q[4])}" style="--h:${ccHue(q[1])}"><div class="flag">${q[0]}</div><div class="dest-panel"><div class="cname">${q[1]}</div><div class="cblurb">${q[2]}</div><div class="meta"><span class="chip accent">Hledat lety</span><span>→</span></div></div></div>`).join('');
    // Přehled (Rychlé hledání) i Lety (Nápady, kam letět)
    ['#quickFlights', '#flIdeas'].forEach(sel => { const el = $(sel); if (el) { el.innerHTML = qfHtml; if (window.Photos) Photos.paint(el); } });
    $$('[data-qfav]').forEach(qv => { qv.onclick = () => searchFavs(prefLists().fav); });
    $$('[data-qf]').forEach(el => el.onclick = () => {
      const q = QF[+el.dataset.qf][3];
      go('flights');
      const base = { ...defaultForm(), ...prefsOf(S.form), from: (S.home?.from || fromInput.items), to: [], dFrom: addDays(today(), 3), dTo: addDays(today(), 60), dateMode: 'flex', minTemp: 0 };
      const f = { ...base, ...q };
      if (q.len && PRESETS[q.len]) Object.assign(f, { nMin: PRESETS[q.len].nMin, nMax: PRESETS[q.len].nMax, outDays: PRESETS[q.len].out, backDays: PRESETS[q.len].back });
      else if (q.nMin != null) Object.assign(f, { outDays: [], backDays: [] }); // vlastní počet nocí (dálkové lety)
      else Object.assign(f, { len: 'week', nMin: 3, nMax: 9, outDays: [], backDays: [] });
      setForm(f);
      if (!f.from.length) { toast('Zadej, odkud letíš'); fromInput.input.focus(); return; }
      startSearch();
    });
  }

  /* ---------- ✨ chytré hledání (smart.js): věta → formulář → hledání ---------- */
  /** Věta rozebraná (Smart.parse) a místa dohledaná (smartResolve) → formulář Letů a hledání. from = odkud z pole, kde se psalo. */
  /**
   * Termíny letů cesty přes víc měst z věty: přesná data od–do rozdělí mezi místa rovnoměrně (poslední let v den
   * návratu), jen od = 3 noci na místo; bez přesných dat od začátku okna (jinak za 2 týdny) po délce pobytu / místa.
   */
  function chainDates(p, n) {
    const t = today(), gap = (from, per) => Array.from({ length: n }, (_, i) => addDays(from, i * per));
    if (p.dateMode === 'exact' && p.xOut) {
      if (!p.xBack || n < 2) return gap(p.xOut, 3);
      const span = Math.max(n - 1, SearchHelp.diffDays(p.xOut, p.xBack));
      return Array.from({ length: n }, (_, i) => addDays(p.xOut, Math.round(i * span / (n - 1))));
    }
    const start = p.dFrom && p.dFrom > t ? p.dFrom : addDays(t, 14);
    const total = p.nMin ? Math.round((p.nMin + (p.nMax || p.nMin)) / 2) : 0;
    return gap(start, Math.max(2, total ? Math.round(total / Math.max(1, n - 1)) : 3));
  }
  // věta s víc šipkami → Víc měst: lety mezi místy v pořadí, osoby, zavazadla, přímé lety a cena z věty
  function smartChainRun(hit) {
    const p = hit.sm.patch, c = hit.chain, ds = chainDates(p, c.length - 1);
    const legs = c.slice(0, -1).map((a, i) => ({ from: [a], to: [c[i + 1]], date: ds[i], flex: 0 }));
    const keep = Object.fromEntries(['adults', 'bags', 'directOnly', 'maxPrice'].filter(k => p[k] != null).map(k => [k, p[k]]));
    go('flights');
    setForm({ ...defaultForm(), ...prefsOf(S.form), ...keep, from: [c[0]], to: [], trip: 'multi', legs });
    startSearch();
  }
  // „do Říma a zpět z Neapole“ → Víc měst: tam do cíle, zpět z místa návratu domů (mezi nimi po zemi)
  function smartBackRun(hit, from) {
    const p = hit.sm.patch, home = (hit.from.length ? hit.from : from && from.length ? from : S.home?.from || []).slice(0, 1);
    go('flights');
    if (!home.length) { toast('Zadej, odkud letíš'); fromInput.input.focus(); return; }
    const ds = chainDates(p, 2);
    const legs = [{ from: home, to: [hit.to[0]], date: ds[0], flex: 0 }, { from: [hit.back], to: home, date: ds[1], flex: 0 }];
    const keep = Object.fromEntries(['adults', 'bags', 'directOnly', 'maxPrice'].filter(k => p[k] != null).map(k => [k, p[k]]));
    setForm({ ...defaultForm(), ...prefsOf(S.form), ...keep, from: home, to: [], trip: 'multi', legs });
    startSearch();
  }
  function smartRun(hit, from) {
    if (hit.chain && hit.chain.length >= 3) return smartChainRun(hit);
    if (hit.back && hit.to.length === 1) return smartBackRun(hit, from);
    const p = hit.sm.patch, to = (hit.to.length ? hit.to : hit.sm.items || []).slice(0, 5);
    const f = { ...defaultForm(), ...prefsOf(S.form), from: hit.from.length ? hit.from : (from && from.length ? from : S.home?.from || []), to, ...p };
    if (f.dateMode === 'exact' && !f.xBack) f.trip = 'oneway';
    go('flights');
    setForm(f);
    if (!fromInput.items.length) { toast('Zadej, odkud letíš'); fromInput.input.focus(); return; }
    startSearch();
  }
  // tip s větou: rozebrat a hledat (bez míst – „k moři“, termín, délka)
  const phraseTip = (icon, text, sub, from) => ({ icon, text, sub, run: () => smartRun({ sm: Smart.parse(text, smartOpts()), to: [], from: [], miss: [] }, from()) });
  /**
   * Tipy v prázdném poli Kam podle toho, co uživatel dělá: nedávná hledání, ⭐ moje cíle, k moři / za teplem v příštím
   * měsíci v délce, jakou nejčastěji hledá (víkendy, týden…), nejbližší prodloužený víkend a kamkoliv co nejdřív.
   */
  function smartTips(from) {
    const t = today(), nm = (+t.slice(5, 7)) % 12, tips = [];
    const recent = (S.recent || []).map(e => SearchHelp.recentForm(e.form, t)).filter(f => f && f.trip !== 'multi');
    const seen = new Set();
    for (const f of recent) {
      const k = watchKey({ form: f });
      if (!k || seen.has(k) || seen.size >= 2) continue;
      seen.add(k);
      tips.push({ icon: '🔁', text: watchLabel(f), sub: `znovu · ${recentSub(f)}`, run: () => { go('flights'); setForm(f); startSearch(); } });
    }
    const fav = prefLists().fav;
    // 👀 cíle, které sis nedávno rozbalil ve výsledcích „kamkoliv“ (bez ⭐ a 🙈 – ty mají vlastní řádek / nechceš je)
    const pl = prefLists(), seenD = SearchHelp.viewedPick(S.viewed, Date.now(), new Set([...pl.fav, ...pl.mute].map(x => x.key)));
    if (seenD.length) {
      const min = Math.min(...seenD.map(x => x.czk).filter(Number.isFinite));
      // termín a délka z posledního hledání (tam sis je prohlížel), jinak jako ⭐ moje cíle
      const lf = recent[0], to = seenD.map(x => ({ id: x.id, label: x.label, flag: flag(x.cc) }));
      tips.push({ icon: '👀', text: `Zaujalo tě: ${seenD.map(x => x.label).join(', ')}`, sub: `jen sem${lf ? ` · ${recentSub({ ...lf, to })}` : ''}${Number.isFinite(min) ? ` · od ${czk(min)}` : ''}`,
        run: () => { if (!lf) return searchFavs(seenD); go('flights'); setForm({ ...lf, to }); startSearch(); } });
    }
    if (fav.length) tips.push({ icon: '⭐', text: `Moje cíle: ${favNames(fav)}`, sub: 'nejlevnější lety do všech najednou', run: () => searchFavs(fav) });
    const lens = recent.map(f => f.len).filter(l => Object.hasOwn(PRESETS, l));
    const habit = lens.slice().sort((a, b) => lens.filter(x => x === b).length - lens.filter(x => x === a).length)[0];
    const suf = { weekend: ' na víkend', long: ' na prodloužený víkend', week: ' na týden', '2weeks': ' na 2 týdny' }[habit] || '';
    const sea = nm >= 4 && nm <= 8; // květen–září k moři v Evropě, jinak za teplem
    tips.push(phraseTip(sea ? '🏖️' : '☀️', `${sea ? 'k moři' : 'za teplem'} v ${MNS_IN[nm]}${suf}`, habit ? 'v délce, jakou obvykle hledáš' : 'nejlevnější cíle, kde je příští měsíc teplo', from));
    const lw = SearchHelp.holidayList(t)[0];
    if (lw) {
      tips.push({ icon: '🎉', text: `Kamkoliv · ${lw.name}`, sub: `prodloužený víkend ${SearchHelp.dmRange(lw.start, lw.end)}`, run: () => {
        go('flights'); setForm({ ...defaultForm(), ...prefsOf(S.form), from: from().length ? from() : S.home?.from || [], to: [], dateMode: 'flex', trip: 'return', len: 'holiday', ...SearchHelp.holidayDates(lw, t) });
        if (fromInput.items.length) startSearch(); else { toast('Zadej, odkud letíš'); fromInput.input.focus(); }
      } });
    }
    tips.push(phraseTip('🌍', `kamkoliv${suf || ' na víkend'} co nejdřív`, 'nejlevnější lety v příštích 2 týdnech', from));
    return tips.slice(0, 6);
  }
  /**
   * ↩ Pokračuj na Přehledu: rozpracovaná cesta v průvodci (kam, kdy, u kterého kroku) a poslední 2 hledání – ať se
   * uživatel po návratu neztratí. Nic rozpracovaného → schované.
   */
  const STEP_LBL = { flight: 'let', route: 'trasa', stay: 'ubytování', car: 'auto', program: 'program', summary: 'shrnutí' };
  function renderResume() {
    const host = $('#resumeRow'); if (!host) return;
    const t = S.trip, d = t && t.flight && t.flight.out && window.Trip ? (() => { try { return Trip.stayDates(t); } catch (e) { return null; } })() : null;
    // cesta, která ještě nezačala (průvodce pro uplynulý let už nepomůže)
    const trip = d && t.flight.out.date >= today() ? t : null;
    const bases = trip && trip.route && trip.route.mode === 'multi' && Array.isArray(trip.route.bases) && trip.route.bases.length >= 2 ? trip.route.bases : null;
    const name = trip ? (bases ? bases.map(b => b.name).join(' → ') : trip.dest && trip.dest.label) || trip.flight.out.to : '';
    const picked = bases ? bases.filter(b => b.stay).length : 0;
    const recent = [], seen = new Set();
    for (const e of S.recent || []) {
      const f = SearchHelp.recentForm(e.form, today()), k = f && f.trip !== 'multi' && watchKey({ form: f });
      if (!k || seen.has(k)) continue;
      seen.add(k); recent.push(f);
      if (recent.length >= 2) break;
    }
    host.hidden = !trip && !recent.length;
    // u shrnutí je cesta sestavená – „Tvoje cesta“ a Otevřít (ne „rozpracovaná“ a Pokračovat)
    const done = trip && trip.step === 'summary';
    host.innerHTML = `${trip ? `<div class="card resume-trip"><span class="rs-ico">🧳</span><div class="rs-t"><b>${done ? 'Tvoje cesta' : 'Rozpracovaná cesta'}: ${esc(name)}</b>
        <small>${fmtDate(d.checkin)}–${fmtDate(d.checkout)} · ${done ? 'sestavená – shrnutí a co zarezervovat' : `krok ${esc(STEP_LBL[trip.step] || 'let')}`}${bases && trip.step === 'stay' ? ` (vybráno ${picked} z ${bases.length})` : ''}</small></div>
        <button type="button" class="btn sm primary" id="rsTrip">${done ? 'Otevřít' : 'Pokračovat'} →</button></div>` : ''}
      ${recent.length ? `<div class="resume-recent"><span class="faint">🔁 Naposledy:</span>${recent.map((f, i) => `<button type="button" class="recent-chip" data-rsr="${i}" title="Hledat znovu">${esc(watchLabel(f))} <small>${esc(recentSub(f))}</small></button>`).join('')}</div>` : ''}`;
    const b = $('#rsTrip', host); if (b) b.onclick = () => go('trip');
    $$('[data-rsr]', host).forEach(x => x.onclick = () => { go('flights'); setForm(recent[+x.dataset.rsr]); startSearch(); });
  }
  /**
   * ✨ Zkus napsat: příklady vět pod hledáním na Přehledu (klepnutí = hledat) – podle ročního období (příští měsíc):
   * v létě k moři a na hory, v zimě za teplem a na lyže, jinak za teplem a k moři na jaře.
   */
  function tryList(t = today(), home = String((S.home && S.home.from && S.home.from[0] && S.home.from[0].label) || '').replace(/\s*\(.*\)$/, '')) {
    const nm = (+t.slice(5, 7)) % 12, mn = MNS_IN[nm], summer = nm >= 4 && nm <= 8, hike = nm >= 5 && nm <= 8, snow = nm === 11 || nm <= 2;
    return [summer ? `k moři v ${mn} do 5000` : 'k moři v květnu do 5000', 'Řím na víkend ve dvou',
      ...(hike ? [`na hory v ${mn} na týden`] : [`za teplem v ${mn} na týden`, ...(snow ? [`na hory v ${mn} na lyže`] : [])]),
      'Londýn příští měsíc jen přímé',
      // víc měst jednou větou – z domova (bez něj by věta neměla odkud)
      ...(home ? [`${home} → Řím → Barcelona → ${home}`] : [])];
  }
  function paintSmartTry() {
    const host = $('#smartTry'); if (!host || !window.Smart) return;
    const TRY = tryList();
    host.innerHTML = `<span class="st-lab">✨ Zkus napsat:</span>${TRY.map((x, i) => `<button type="button" class="st-chip" data-try="${i}">${esc(x)}</button>`).join('')}`;
    $$('[data-try]', host).forEach(b => b.onclick = async () => {
      const sm = Smart.parse(TRY[+b.dataset.try], smartOpts()), hit = { sm, to: [], from: [], miss: [] };
      b.disabled = true;
      try { await smartResolve(hit, heroFrom.items[0]?.id || '', undefined); } catch (e) { /* bez míst */ } finally { b.disabled = false; }
      smartRun(hit, heroFrom.items);
    });
  }

  /* ---------- ⭐ Moje cíle a 🙈 Nezajímá mě (S.fav, S.mute; SearchHelp.destPref…) ---------- */
  // „Porto, Tbilisi, Palermo“ – prvních 5 (víc pole Kam nepojme)
  const favNames = fav => fav.slice(0, 5).map(x => x.label).join(', ') + (fav.length > 5 ? ` (prvních 5 z ${fav.length})` : '');
  // termíny jako radar (Kdykoliv / Víkendy / Svátky); bez prodlouženého víkendu v dohledu jako Kdykoliv
  function favQuery() {
    const home = S.home && S.home.from?.length ? radarHome() : { from: [], radius: 200, adults: radarAdults() };
    const q = SearchHelp.radarQuery(S.radarMode, home, today(), S.radarHoliday);
    return q.none ? SearchHelp.radarQuery('all', home, today()) : q;
  }
  /** ⭐ Hledat moje cíle: jedno hledání uživatele do prvních 5 cílů z domova radaru, termíny i počet lidí jako radar. */
  function searchFavs(list) {
    if (!list.length) return;
    const q = favQuery(), from = S.home?.from?.length ? S.home.from : fromInput.items;
    go('flights');
    setForm({ ...defaultForm(), ...prefsOf(S.form), from, to: list.slice(0, 5).map(x => ({ id: x.id, label: x.label, flag: flag(x.cc) })), ...q.form, adults: q.payload.adults, directOnly: false });
    if (!from.length) { toast('Zadej, odkud letíš'); fromInput.input.focus(); return; }
    startSearch();
  }
  /** Po změně seznamů: radar (jen překreslit – žádné hledání), pruh na Přehledu, rychlé hledání a výpis hned podle nich. */
  function prefsChanged() { save(); prefsPaint(); }
  // jen překreslit – seznamy už uložené (💾 obnova, změna v jiném okně ATLAS)
  // Výpis: konečný výsledek, který čeká na překreslení (dorazil při otevřeném okně ⋯), se ukáže hned i s průběhem
  // hledání; jinak jen překreslit – obojí bez pohybu výpisu pod rukou (rerenderKeep, jako „Zavřít“).
  function prefsPaint() {
    if (radarLast) paintRadar(radarLast.r, radarLast.q, radarLast.st);
    renderFav(); renderQuick();
    if (lastResult && lastResult.mode !== 'multi' && $('#results') && $('#results').children.length && !paintNow()) rerenderKeep();
  }
  // plný seznam: v okně ⋯ odkaz na Upravit seznamy, v nich samotných ✕ u města
  const fullTxt = (which, edit = false) => `Seznam ${which === 'fav' ? '⭐ Moje cíle' : '🙈 Nezajímá mě'} už má ${SearchHelp.DEST_MAX} měst (víc nepojme) – ${edit ? 'nejdřív nějaké odeber (✕)' : 'nějaké odeber v Upravit seznamy'}`;
  /**
   * ⋯ u cíle (karta radaru, řádek a karta Kamkoliv): ⭐ Chci tam / 🙈 Nezajímá mě, zpět, úprava seznamů. d = { id, label, cc };
   * offer = nabídka, kterou řádek či karta ukazuje (u karty cíle její první řádek) – { row: { t, g }, res } nebo z radaru
   * { radar, r, q } → 📌 Odložit nabídku.
   */
  function destMenu(d, offer = null) {
    const key = SearchHelp.destKeyOf(d.id); if (!key) return;
    const pl = prefLists(), p = SearchHelp.destPref(key, pl), now = Date.now();
    const pin = !offer ? null : offer.row ? Pins.fromRow(offer.row.t, offer.row.g, offer.res, SearchHelp.shownAt(offer.res, lastResultAt, now), now) : Pins.fromRadar(offer.radar, { at: offer.r.at, adults: offer.q.payload?.adults }, now);
    modalOpen(`<div class="modal-body dm-modal"><h3>${flag(d.cc)} ${esc(d.label)}</h3>
      <div class="dm-acts"><button type="button" class="btn${p === 'fav' ? '' : ' primary'}" data-dmp="${p === 'fav' ? '' : 'fav'}">${p === 'fav' ? '⭐ Odebrat z mých cílů' : '⭐ Chci tam'}</button><button type="button" class="btn" data-dmp="${p === 'mute' ? '' : 'mute'}">${p === 'mute' ? '👀 Zase ukazovat' : '🙈 Nezajímá mě'}</button>${pin ? `<button type="button" class="btn" id="dmPin">${Pins.has(pinList(), pin) ? '📌 Odebrat z odložených' : `<span>📌 Odložit nabídku · <span class="dp-nw">${czk(Pins.price(pin))}</span> · <span class="dp-nw">${esc(pinWhen(pin))}</span></span>`}</button>` : ''}</div>
      <p class="faint dm-note">⭐ Moje cíle mají štítek ⭐ a na Přehledu nejnižší cenu, kterou ATLAS viděl. S 🙈 se město v radaru ani v Kamkoliv neukáže – hledání přímo sem ho ukáže vždy.${pin ? ' 📌 Odložit schová nabídku k porovnání (Přehled → 📌 Odložené nabídky).' : ''}</p>
      <div class="dm-foot"><button type="button" class="linkbtn" id="dmEdit">Upravit seznamy (⭐ ${pl.fav.length} · 🙈 ${pl.mute.length})</button><button type="button" class="btn ghost sm" id="dmClose">Zavřít</button></div></div>`);
    $$('[data-dmp]', $('#modal')).forEach(b => b.onclick = () => {
      const which = b.dataset.dmp || null, nx = SearchHelp.destPrefSet(prefLists(), d, which);
      if (!nx) { toast(fullTxt(which), 'err'); return; }
      S.fav = nx.fav; S.mute = nx.mute;
      modalClose(); prefsChanged();
      toast(which === 'fav' ? `Přidáno do mých cílů: ${d.label}` : which === 'mute' ? `${d.label} se v radaru ani v Kamkoliv už neukáže` : p === 'fav' ? `Odebráno z mých cílů: ${d.label}` : `${d.label} se zase bude ukazovat`);
    });
    const dp = $('#dmPin'); if (dp) dp.onclick = () => { modalClose(); if (offer.row) pinToggleRow(offer.row.t, offer.row.g, offer.res); else pinToggleRadar(offer.radar, offer.r, offer.q); };
    $('#dmEdit').onclick = () => prefsEdit();
    $('#dmClose').onclick = () => modalClose();
    $('[data-dmp]', $('#modal')).focus();
  }
  /**
   * Úprava seznamů: odebrat, přesunout do druhého seznamu, ⭐ nahoru (Hledat moje cíle bere prvních 5).
   * Po úpravě se okno překreslí: focus = selektor tlačítka, které dostane fokus, y = kam bylo okno posunuté.
   */
  function prefsEdit(focus = null, y = 0) {
    const pl = prefLists();
    const row = (x, which, i) => `<li class="pe-row"><span class="pe-n">${flag(x.cc)} ${esc(x.label)}</span><span class="pe-acts">`
      + (which === 'fav' && i ? `<button type="button" class="btn ghost sm" data-pe="top:${esc(x.key)}" title="Nahoru – Hledat moje cíle hledá prvních 5" aria-label="${esc(x.label)} nahoru">⬆</button>` : '')
      + `<button type="button" class="btn ghost sm" data-pe="${which === 'fav' ? 'mute' : 'fav'}:${esc(x.key)}" title="${which === 'fav' ? 'Přesunout do 🙈 Nezajímá mě' : 'Přesunout do ⭐ Moje cíle'}" aria-label="${esc(x.label)}: ${which === 'fav' ? 'nezajímá mě' : 'chci tam'}">${which === 'fav' ? '🙈' : '⭐'}</button>`
      + `<button type="button" class="btn ghost sm" data-pe="del:${esc(x.key)}" title="Odebrat" aria-label="Odebrat ${esc(x.label)}">✕</button></span></li>`;
    const list = (which, title, empty) => `<h4 class="pe-h">${title} <span class="faint">${pl[which].length}/${SearchHelp.DEST_MAX}</span></h4>`
      + (pl[which].length ? `<ol class="pe-list">${pl[which].map((x, i) => row(x, which, i)).join('')}</ol>` : `<p class="faint pe-empty" id="peEmpty-${which}" tabindex="-1">${empty}</p>`);
    modalOpen(`<div class="modal-body pe-modal"><h3>⭐ Moje cíle a 🙈 Nezajímá mě</h3>
      ${list('fav', '⭐ Moje cíle', 'Zatím žádné – přidáš je přes ⋯ u karty radaru nebo u cíle v Kamkoliv.')}
      ${list('mute', '🙈 Nezajímá mě', 'Nic skrytého – v radaru i v Kamkoliv se ukazuje všechno.')}
      <p class="faint pe-note">Seznamy jsou jen v tomhle zařízení a v 💾 záloze. <b>Hledat moje cíle</b> hledá prvních 5 – ⬆ posune město nahoru.</p>
      <div class="pe-foot"><button type="button" class="btn primary" id="peDone">Hotovo</button></div></div>`);
    $$('[data-pe]', $('#modal')).forEach(b => b.onclick = () => {
      const [op, key] = b.dataset.pe.split(':'), cur = prefLists(), x = [...cur.fav, ...cur.mute].find(y => y.key === key);
      if (!x) return;
      const nx = op === 'top' ? { fav: SearchHelp.destTop(cur.fav, key), mute: cur.mute } : SearchHelp.destPrefSet(cur, x, op === 'del' ? null : op);
      if (!nx) { toast(fullTxt(op, true), 'err'); return; }
      // u smazaného ✕ města, které se posunulo na jeho místo (u posledního předchozího, v prázdném seznamu poznámka)
      const wl = cur.fav.includes(x) ? 'fav' : 'mute', nb = nx[wl][Math.min(cur[wl].indexOf(x), nx[wl].length - 1)];
      S.fav = nx.fav; S.mute = nx.mute;
      prefsChanged();
      prefsEdit(op !== 'del' ? `[data-pe="${op === 'mute' ? 'fav' : 'mute'}:${key}"]` : nb ? `[data-pe="del:${nb.key}"]` : `#peEmpty-${wl}`, $('#modal').scrollTop);
    });
    $('#peDone').onclick = () => modalClose();
    // klávesnice: fokus zůstane u přesunutého města, u smazaného na sousedním – okno zůstane, kde bylo (fokus na Hotovo
    // dole by ho po každém ✕ posunul na konec); při otevření na Hotovo bez posunu, dlouhý seznam začne nahoře
    const m = $('#modal'); m.scrollTop = y;
    const f = (focus && $(focus, m)) || $('#peDone'); if (f) f.focus({ preventScroll: f.id === 'peDone' });
  }
  /**
   * ⭐ Moje cíle na Přehledu (pod radarem): u každého města nejlevnější zpáteční letenka, kterou ATLAS v tomhle zařízení
   * už viděl (paměť cen „Je to dobrá cena?“, PriceCheck.seenMin), klepnutím hledání sem; Hledat moje cíle = prvních 5.
   */
  function renderFav() {
    const host = $('#favSec'); if (!host) return;
    const pl = prefLists();
    host.hidden = !pl.fav.length && !pl.mute.length;
    if (host.hidden) { host.innerHTML = ''; return; }
    const store = PriceCheck.load(), now = Date.now(), q = favQuery();
    const tile = (x, i) => {
      const s = PriceCheck.seenMin(store, x.key, now), mi = s && +s.month.slice(5, 7) - 1, mon = s && MNS_FULL[mi];
      const tip = s ? `Nejlevnější zpáteční letenka na osobu, kterou ATLAS v tomhle zařízení viděl: ${czk(s.czk)} z ${s.from}, odlet ${MNS_LOC[mi]}, ${PriceCheck.agoTxt(s.ago)}.` : 'ATLAS sem v tomhle zařízení zatím žádnou cenu neviděl.';
      return `<button type="button" class="fav-i" data-fs="${i}" title="${esc(tip)} Klepnutím hledáš sem – termíny jako radar."><span class="fav-n">${flag(x.cc)} <b>${esc(x.label)}</b></span>`
        + (s ? `<span class="fav-p">letenka od <b>${czk(s.czk)}</b></span><span class="fav-w">z ${esc(s.from)} · ${mon} · ${PriceCheck.agoTxt(s.ago)}</span>` : '<span class="fav-w">zatím neviděno</span>') + '</button>';
    };
    host.innerHTML = `<div class="section-head"><h2>⭐ Moje cíle${pl.fav.length ? ` <span class="faint" style="font-size:13px;font-weight:600">· ${pl.fav.length}</span>` : ''}</h2><button type="button" class="link" id="favEdit">Upravit →</button></div>
      <div class="card fav-card">${pl.fav.length ? `<div class="fav-strip">${pl.fav.map(tile).join('')}</div>
        <div class="fav-foot"><button type="button" class="btn primary sm" id="favGo">🔎 Hledat moje cíle</button><span class="faint">${esc(favNames(pl.fav))} · ${esc(q.sub.split(' · ').slice(1).join(' · '))}</span></div>
        <div class="faint fav-note">Cena = nejlevnější zpáteční letenka na osobu (jen letenka – bez cesty na letiště, do města a zavazadel, proto bývá nižší než v radaru) s odletem od tohoto měsíce, kterou ATLAS viděl při hledání v tomhle zařízení – telefon a počítač mají každý svou paměť.</div>`
        : '<div class="faint">Zatím žádné – přidáš je přes ⋯ u karty radaru nebo u cíle v Kamkoliv (⭐ Chci tam).</div>'}
        ${pl.mute.length ? `<div class="faint fav-mute">🙈 Nezajímá mě – v radaru a v Kamkoliv skryto: ${plural(pl.mute.length, 'město', 'města', 'měst')}</div>` : ''}</div>`;
    $('#favEdit').onclick = () => prefsEdit();
    const g = $('#favGo'); if (g) g.onclick = () => searchFavs(prefLists().fav);
    $$('[data-fs]', host).forEach(b => b.onclick = () => { const x = pl.fav[+b.dataset.fs]; if (x) searchFavs([x]); });
  }

  /* ---------- 📌 Odložené nabídky (S.pins, pins.js): odložit z výpisu a radaru, porovnat, poslat k výběru, ověřit ---------- */
  // Odložené bez nabídek s odletem v minulosti – ty zmizí samy (i z uloženého stavu)
  function pinList() {
    const list = Pins.alive(S.pins, today());
    if (!Array.isArray(S.pins) || list.length !== S.pins.length) { S.pins = list; save(); }
    return list;
  }
  // „14.–16. 11.“, jen tam „14. 11.“
  const pinWhen = p => { const d1 = p.kind === 'r' ? p.r.d1 : p.t.out.date, d2 = p.kind === 'r' ? p.r.d2 : p.t.back && p.t.back.date; return d2 ? SearchHelp.dmRange(d1, d2) : SearchHelp.dm(d1); };
  const pinModalOn = () => Boolean($('#modalBg').classList.contains('show') && $('#modal .pin-modal'));
  /** Po změně odložených (i z jiného okna, 💾 obnovy): radar, Přehled, výpis a otevřené Porovnat – jen překreslit. */
  function pinsPaint() {
    if (radarLast) paintRadar(radarLast.r, radarLast.q, radarLast.st);
    renderPins();
    if (lastResult && lastResult.mode !== 'multi' && $('#results') && $('#results').children.length && !paintNow()) rerenderKeep();
    if (pinModalOn()) openPins({ keep: true });
  }
  // plné úložiště: změna se vrátí (po obnovení stránky by jinak zmizela)
  function pinSet(list) {
    const before = S.pins;
    S.pins = list;
    if (save() === false) { S.pins = before; toast('V prohlížeči není místo – nabídku se nepodařilo odložit', 'err'); return false; }
    pinsPaint();
    return true;
  }
  function pinToggle(rec) {
    if (!rec) return;
    const x = Pins.toggle(pinList(), rec);
    if (x.full) return toast(`Odložit jde nejvýš ${Pins.MAX} nabídek – nějakou odeber v 📌 Porovnat`, 'err');
    if (!pinSet(x.list)) return;
    toast(x.on ? `📌 Odloženo: ${rec.dest.label} ${czk(Pins.price(rec))} – porovnáš v „📌 Odložené (${x.list.length})“` : `Odebráno z odložených: ${rec.dest.label}`, '', x.on ? 4000 : 2600);
  }
  /** 📌 nabídka t z řádku výsledku res – s časem cen výpisu (i obnoveného a průběžného). */
  function pinToggleRow(t, g, res) {
    if (!res || res.mode === 'multi') return;
    levelFor(t); // složená cesta a buňka mřížky: úroveň ceny teď (server ji neposílá)
    const now = Date.now();
    let rec = Pins.fromRow(t, g, res, SearchHelp.shownAt(res, lastResultAt, now), now);
    // řádek průběžných výsledků, konečný už dorazil a čeká na překreslení (otevřené ⋯, prst na obrazovce) – pinsFinal
    // proběhl před odložením: nabídka rovnou z konečného (cena, úroveň, statistika), je-li v něm
    if (rec && res.partial && lastResult && lastResult !== res && !lastResult.partial) rec = Pins.refresh([rec], lastResult, lastResultAt, now, levelFor).list[0];
    pinToggle(rec);
  }
  const pinToggleRadar = (x, r, q) => pinToggle(Pins.fromRadar(x, { at: r.at, adults: q.payload?.adults, demo: r.demo }, Date.now()));
  // Odložená nabídka jako výsledek hledání a skupina cíle: priceBox, průvodce (Trip.start) – nic nečte lastResult
  const pinRes = p => ({ mode: 'route', partial: false, demo: Boolean(p.demo), query: { ...p.q }, origins: p.origins || [], arrivals: p.arrivals || {}, home: p.home ? { label: p.home } : null, priceStats: p.stats || null, groups: [] });
  const pinG = p => ({ dest: { ...p.dest, airports: [p.t.out.to] }, priceStats: p.stats || null, ground: p.ground || null });

  /** 📌 Odložené nabídky na Přehledu (pod ⭐ Moje cíle): dlaždice podle ceny, klepnutím Porovnat s tou nabídkou na očích. */
  function renderPins() {
    const host = $('#pinSec'); if (!host) return;
    const list = Pins.sorted(pinList()), now = Date.now();
    host.hidden = !list.length;
    if (!list.length) { host.innerHTML = ''; return; }
    const tile = p => {
      const a = Pins.age(p.at, now), one = p.kind === 'r' ? !p.r.d2 : !p.t.back;
      return `<button type="button" class="fav-i" data-pinx="${esc(p.k)}"><span class="fav-n">${flag(p.dest.cc)} <b>${esc(p.dest.label)}</b></span><span class="fav-p">od <b>${czk(Pins.price(p))}</b>/os.</span>`
        + `<span class="fav-w">${esc(pinWhen(p))}${one ? ' jen tam' : ''}${a ? ` · <span class="pin-age${a.day ? ' old' : ''}">${a.day ? `⚠ ${esc(a.ago)}` : `ceny ${a.z} ${esc(a.when)}`}</span>` : ''}</span></button>`;
    };
    host.innerHTML = `<div class="section-head"><h2>📌 Odložené nabídky <span class="faint" style="font-size:13px;font-weight:600">· ${list.length}</span></h2><button type="button" class="link" id="pinAll">Porovnat →</button></div>
      <div class="card fav-card"><div class="fav-strip">${list.map(tile).join('')}</div></div>`;
    $('#pinAll').onclick = () => openPins();
    $$('[data-pinx]', host).forEach(b => b.onclick = () => openPins({ focus: b.dataset.pinx }));
  }
  const PIN_BAGS = { none: 'bez kufru', cabin: '🧳 kabinový kufr', checked: '🧳 kufr k odbavení' };
  const PIN_FUEL = { diesel: 'nafta', petrol: 'benzín', ev: 'elektro' };
  // pro koho a s čím je cena spočítaná (nabídky z různých hledání se tím liší)
  const pinBasis = q => [`pro ${q.adults} os.`, PIN_BAGS[q.bags] || PIN_BAGS.none, !q.kmRate ? 'bez dopravy na letiště' : q.groundMode === 'car' ? `🚗 autem na letiště${PIN_FUEL[q.carFuel] ? ` (${PIN_FUEL[q.carFuel]})` : ''}` : 'vlakem/busem na letiště', q.arrival ? 'vč. cesty do města' : 'bez cesty do města'].join(' · ');
  // let jedním řádkem „🛫 06:10 BRQ → NAP 08:05 · přímý · Ryanair“ (ne legHtml – ten bere další lety dne z výpisu)
  const pinLeg = (l, back) => `<div class="pin-ln">${back ? '🛬' : '🛫'} ${[`${esc(timeOf(l))} ${esc(l.from)} → ${esc(l.to)} ${esc(arrTime(l))}${arrUnk(l) ? ' ' + arrUnk(l) : ''}`.trim(), l.stops ? esc(stopsTxt(l)) : l.provider === 'travelpayouts' ? '' : 'přímý', esc(l.carrierName || provName(l.provider))].filter(Boolean).join(' · ')}${l.live === false ? ' ' + cacheTag(l) : ''}</div>`;
  // ⚡ ověření přes Kiwi.com: u ceny z cache verdikt jako ve výpisu, u živé ceny jen neutrálně (Kiwi bývá dráž než aerolinka)
  function pinLive(p) {
    const x = liveGet(SearchHelp.liveKey(p.t, p.q.adults));
    if (!x) return '';
    if (x.st === 'run') return '<div class="pin-ln faint"><span class="spin dark"></span> ověřuji živě…</div>';
    if (x.st === 'none') return '<div class="pin-ln faint">Kiwi.com tyhle dny živě nenabízí</div>';
    const v = czk(liveTotal(p.t, x));
    if (SearchHelp.isCached(p.t)) return liveSt(p.t, x) === 'dearer' ? `<div class="pin-ln pin-warn">⚠ živě ${v}/os.</div>` : `<div class="pin-ln good">✓ živě od ${v}/os.</div>`;
    return `<div class="pin-ln faint" title="Kiwi.com prodává i letenky Ryanairu a Wizz Air, často dráž než aerolinka – přesnou cenu ukáže Koupit.">⚡ Kiwi.com teď od ${v}/os. (${liveWhen(x)})</div>`;
  }
  const pinHead = p => `<div class="pin-h"><span class="pin-f">${flag(p.dest.cc)}</span><b class="pin-n">${esc(p.dest.label)}</b>${p.demo ? '<span class="b warn" title="Demo data – cena je vymyšlená">DEMO</span>' : ''}<button type="button" class="pin-x" data-pdel="${esc(p.k)}" title="Odebrat z odložených" aria-label="Odebrat ${esc(p.dest.label)} z odložených">✕</button></div>`;
  /** Karta porovnání: plná nabídka (rozpis ceny, termín, lety, stáří a základ ceny, akce) nebo karta radaru (co zná). */
  function pinCard(p, best, now) {
    const a = Pins.age(p.at, now), d = Pins.price(p) - best, day = x => `<span class="dp-nw">${dayLabel(x)}</span>`;
    const rel = `<div class="pin-rel">${d > 0 ? `+${czk(d)}` : '<span class="b good">nejlevnější</span>'}</div>`;
    const tail = (a ? `<div class="pin-age${a.day ? ' old' : ''}">${a.day ? `⚠ cena ${a.z} ${esc(a.txt)} – může být jiná` : `ceny ${a.z} ${esc(a.txt)}`}</div>` : '') + `<div class="pin-ln faint">${esc(pinBasis(p.q))}</div>`;
    if (p.kind === 'r') {
      const r = p.r, pax = p.q.adults;
      const buy = (r.buy || []).filter(b => /^https?:\/\//i.test(String(b[0] || ''))).map(([u, pv, leg]) => `<a class="btn sm book" style="--pc:${provColor(pv)}" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${leg === 'out' ? `Tam: ${esc(shopName(pv))}` : leg === 'back' ? `Zpět: ${esc(shopName(pv))}` : `Koupit ${pv === 'travelpayouts' ? 'na Aviasales' : 'u ' + esc(shopName(pv))}`} ↗</a>`).join('');
      return `<div class="card pin-card" data-pk="${esc(p.k)}">${pinHead(p)}
        <div class="pin-pr"><div class="pbox"><div class="pp">${czk(r.czk)}</div><div class="pl">na osobu</div><div class="pd">letenka + cesta na letiště a do města</div>${pax > 1 ? `<div class="pd">celkem ${pax} os.: <b>${czk(r.czk * pax)}</b></div>` : ''}</div>${rel}</div>
        <div class="pin-ln">✈︎ ${esc(SearchHelp.radarRoute(r))} · ${day(r.d1)}${r.d2 ? ` – ${day(r.d2)} · ${nightsTxt(SearchHelp.diffDays(r.d1, r.d2))}` : ' · jen tam'}${radarLeave(r)}</div>
        <div class="pin-ln faint">z radaru – rozpis ceny a lety ukáže hledání</div>${tail}
        <div class="pin-act"><button type="button" class="btn sm primary" data-psrch="${esc(p.k)}">🔎 Najít tento termín →</button>${buy ? `<div class="tr-buy">${buy}</div>` : ''}</div></div>`;
    }
    const t = p.t, lv = SearchHelp.leaveDays(t.out, t.back), lt = lv && SearchHelp.leaveTxt(lv), dw = p.was ? t.perPersonCzk - p.was.czk : 0;
    return `<div class="card pin-card" data-pk="${esc(p.k)}">${pinHead(p)}
      <div class="pin-pr">${priceBox(t, null, pinRes(p))}${rel}</div>
      <div class="pin-tags">${priceTag(t, null, t.priceLevel || null)}${p.part ? '<span class="b" title="Pomalejší zdroje tehdy ještě hledaly – úroveň ceny a statistika chybí">z průběžných výsledků</span>' : ''}</div>
      <div class="pin-ln">🗓️ ${day(t.out.date)}${t.back ? ` – ${day(t.back.date)}${t.nights != null ? ` · ${nightsTxt(t.nights)}` : ''}${lt ? ` · <span title="${esc(lt.title)}">${esc(lt.text)}</span>` : ''}` : ' · jen tam'}</div>
      ${pinLeg(t.out)}${t.back ? pinLeg(t.back, true) : ''}${tail}
      ${dw ? `<div class="pin-ln ${dw < 0 ? 'good' : 'pin-warn'}" title="Při odložení ${czk(p.was.czk)}/os.">${dw < 0 ? '↓' : '↑'} o ${czk(Math.abs(dw))} od odložení</div>` : ''}${pinLive(p)}
      <div class="pin-act"><button type="button" class="btn sm primary" data-pgo="${esc(p.k)}">Vybrat a pokračovat →</button><div class="tr-buy">${bookButtons(t)}</div><div class="tr-more">${verifyLinks(t, p.q.adults)}</div></div></div>`;
  }
  // ⚡ Ověřit ceny: plné nabídky (ne demo) bez čerstvého ověření, nejstarší ceny první, nejvýš 3 na klepnutí
  let pinBusy = false;
  const pinTodo = () => pinList().filter(p => p.kind === 'f' && !p.demo && !liveGet(SearchHelp.liveKey(p.t, p.q.adults))).sort((a, b) => a.at - b.at).slice(0, 3);
  /** 📌 Porovnat (okno): karty podle ceny na osobu – na telefonu pruh do strany, na počítači mřížka. focus = klíč nabídky. */
  function openPins({ focus = null, keep = false } = {}) {
    const list = Pins.sorted(pinList()), now = Date.now(), m = $('#modal');
    if (!list.length) { if (keep) modalClose(); return; }
    const sc0 = keep && $('.pin-cards', m), sx = sc0 ? sc0.scrollLeft : 0, sy = keep ? m.scrollTop : 0, todo = pinTodo();
    const best = Pins.price(list[0]), old = list.filter(p => (Pins.age(p.at, now) || {}).day).length;
    // poškozená nabídka (cizí záloha) nesmí rozbít okno – aspoň ✕
    const card = p => { try { return pinCard(p, best, now); } catch (e) { return `<div class="card pin-card" data-pk="${esc(p.k)}">${pinHead(p)}<div class="pin-ln faint">Nabídku se nepodařilo zobrazit.</div></div>`; } };
    modalOpen(`<div class="modal-body pin-modal">
      <div class="pin-top"><h3>📌 Odložené nabídky <span class="faint">${list.length}/${Pins.MAX}</span></h3><button type="button" class="icon-btn pin-close" id="pinX" aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button></div>
      ${new Set(list.map(p => Pins.basis(p.q))).size > 1 ? '<div class="note info pin-note">ℹ️ <div>Nabídky jsou spočítané pro jiný počet lidí, zavazadla nebo dopravu na letiště – porovnávej i řádek „letenky“.</div></div>' : ''}
      ${old ? `<div class="note warn pin-note">⚠️ <div>${old === 1 ? '1 cena je starší než 24 h – před nákupem ji ověř.' : `${old} ${old <= 4 ? 'ceny jsou' : 'cen je'} starší než 24 h – před nákupem je ověř.`}</div></div>` : ''}
      <div class="pin-cards">${list.map(card).join('')}</div>
      <div class="pin-foot"><button type="button" class="btn sm" id="pinShare">📤 Poslat k výběru</button>${pinBusy || todo.length ? `<button type="button" class="btn sm" id="pinVerify"${pinBusy ? ' disabled' : ''}>${pinBusy ? '<span class="spin dark"></span> Ověřuji…' : `⚡ Ověřit ceny (${todo.length})`}</button><span class="faint pin-vn">přes Kiwi.com, nejvýš 3 nejstarší ceny</span>` : ''}</div>
      <textarea class="pin-txt" id="pinTxt" rows="8" readonly hidden></textarea></div>`);
    const sc = $('.pin-cards', m), byK = k => list.find(p => p.k === k);
    if (keep) { sc.scrollLeft = sx; m.scrollTop = sy; }
    else {
      m.scrollTop = 0; // okno si jinak drží posun z minulého otevření
      const c = focus && $$('.pin-card', m).find(e => e.dataset.pk === focus);
      if (c) { c.classList.add('on'); c.scrollIntoView({ block: 'nearest', inline: 'start' }); }
      $('#pinX').focus({ preventScroll: true });
    }
    $('#pinX').onclick = () => modalClose();
    $('#pinShare').onclick = () => pinShare();
    const pv = $('#pinVerify'); if (pv) pv.onclick = () => pinVerify();
    $$('[data-pgo]', m).forEach(b => b.onclick = () => { const p = byK(b.dataset.pgo); if (!p) return; modalClose(); pickTrip(p.t, pinG(p), pinRes(p), p.at); });
    $$('[data-psrch]', m).forEach(b => b.onclick = () => { const p = byK(b.dataset.psrch); if (p) pinSearch(p); });
    $$('[data-pdel]', m).forEach(b => b.onclick = () => {
      const p = byK(b.dataset.pdel);
      if (p && confirm(`Odebrat ${p.dest.label} ${czk(Pins.price(p))} z odložených?`)) pinSet(pinList().filter(x => x.k !== p.k));
    });
  }
  /** ⚡ Ověřit ceny: po jedné přes /api/verify (Kiwi.com, stejný limit jako ⚡ u nabídky), při limitu nebo chybě stop. */
  async function pinVerify() {
    const todo = pinTodo();
    if (pinBusy || !todo.length) return;
    pinBusy = true;
    try {
      for (const p of todo) {
        const job = verifyOne(p.t, p.q.adults);
        if (pinModalOn()) openPins({ keep: true }); // „ověřuji živě…“ u karty
        const st = await job;
        if (st === 'limit' || st === 'off' || st === 'err') { liveToast(st); break; }
        if (pinModalOn()) openPins({ keep: true });
      }
    } finally {
      pinBusy = false;
      if (pinModalOn()) openPins({ keep: true });
    }
  }
  /** 📤 Poslat k výběru: prostý text přes sdílení telefonu (WhatsApp, e-mail…), jinak do schránky, jinak k ručnímu kopírování. */
  async function pinShare() {
    const text = Pins.shareText(pinList(), { now: Date.now() }); // ještě v klepnutí – sdílení chce gesto uživatele
    if (navigator.share) {
      try { await navigator.share({ title: 'Kam pojedeme?', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast('Nabídky zkopírované – vlož je do zprávy'); return; } catch (e) { }
    const ta = pinModalOn() && $('#pinTxt');
    if (!ta) return;
    ta.value = text; ta.hidden = false; ta.focus(); ta.select();
    toast('Zkopíruj text ručně');
  }
  /** 🔎 Najít tento termín (nabídka z radaru): hledání do jejího cíle přesně na její dny; chybí-li v něm, řekne proč (cardNote). */
  function pinSearch(p) {
    const r = p.r, ret = Boolean(r.d2) && SearchHelp.diffDays(r.d1, r.d2) <= 45;
    modalClose();
    go('flights');
    setForm({ ...defaultForm(), ...prefsOf(S.form), from: S.home?.from?.length ? S.home.from : fromInput.items, to: [{ id: p.dest.id || `ap:${r.to}`, label: p.dest.label, flag: flag(p.dest.cc) }], dateMode: 'exact', xOut: r.d1, xFlex: 0, ...(ret ? { trip: 'return', xBack: r.d2 } : { trip: 'oneway' }), adults: p.q.adults, directOnly: false });
    if (!getForm().from.length) { toast('Zadej, odkud letíš'); setTimeout(() => fromInput.input.focus(), 300); return; }
    startSearch({ card: r });
  }
  /**
   * Konečný výsledek hledání: odložené nabídky, které našel znovu se stejným nastavením, převezmou novou cenu a čas.
   * Složená cesta a buňka mřížky dostanou úroveň ceny hned (levelFor, lastResult = res) – výpis ji doplní až při kreslení.
   */
  function pinsFinal(res) {
    const x = Pins.refresh(pinList(), res, lastResultAt, Date.now(), levelFor);
    if (x.n) { S.pins = x.list; save(); renderPins(); }
  }

  /* ---------- veřejné API pro app.js ---------- */
  // Hledání do jednoho cíle (rychlé volby, hledání ze země, hlavní stránka): z cesty přes víc měst tam i zpět.
  function singleTrip(f) { f = SearchHelp.groundForm(f); return f && f.trip === 'multi' ? { ...f, trip: 'return' } : (f || {}); }
  /**
   * Osobní nastavení z minulého hledání pro nové hledání odjinud (Přehled, rychlé hledání, karta radaru, stránka země):
   * počet lidí, doprava na letiště, zavazadla… – ne tvar cesty (noci, dny v týdnu, termín, typ cesty, cenový limit)
   * a ne místo odletu (odkud, okruh a vypnutá letiště patří k minulému hledání – jinak by hledání z domova radaru
   * hledalo s okruhem a bez letišť hledání z Mnichova). Odkud a okruh doplní defaultForm() z domova (S.home).
   */
  function prefsOf(f) {
    const { from, radius, exclude, to, trip, len, nMin, nMax, dFrom, dTo, outDays, backDays, depAfter, dateMode, xOut, xBack, xFlex, legs, minTemp, maxPrice, ...rest } = singleTrip(f);
    return rest;
  }
  function searchTo(items, { xOut = '', xBack = '' } = {}) {
    go('flights');
    // odkud jako minulé hledání, jinak domov radaru
    const o = S.form && S.form.from?.length ? { from: S.form.from, radius: S.form.radius ?? 200, exclude: S.form.exclude || [] }
      : S.home && S.home.from?.length ? { from: S.home.from, radius: S.home.radius ?? 200, exclude: [] } : {};
    // termín cesty z plánovače (ještě před ní): přesná data, s návratem tam i zpět
    // v mezích serveru: odlet nejvýš ~rok dopředu, zpáteční nejvýš 45 nocí (delší pobyt → jen tam)
    const ymd = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
    // (359: server v UTC má po půlnoci našeho času ještě včerejšek – jeho limit 360 dní by jinak den přetekl)
    const ex = ymd(xOut) && xOut >= today() && xOut <= addDays(today(), 359)
      ? { dateMode: 'exact', xOut, xFlex: 0, ...(ymd(xBack) && xBack >= xOut && SearchHelp.diffDays(xOut, xBack) <= 45 ? { trip: 'return', xBack } : { trip: 'oneway' }) } : {};
    const f = { ...defaultForm(), ...prefsOf(S.form), ...o, ...ex, to: items }; // odkud jako minulé hledání
    setForm(f);
    if (!f.from.length) { toast('Zadej, odkud letíš'); setTimeout(() => fromInput.input.focus(), 300); return; }
    startSearch();
  }

  /**
   * „Hledat lety“ u cesty přes víc měst v plánovači: stejná trasa znovu – Víc měst, letiště z letenek, data letů;
   * names = místa trasy (přílet i-tého letu = i-té místo) pro popisky v poli. Lety už proběhly → jen Lety.
   */
  function searchLegs(legs, names = []) {
    go('flights');
    const ok = legs.length >= 2 && legs.every(l => l && /^[A-Z]{3}$/.test(l.from) && /^[A-Z]{3}$/.test(l.to) && /^\d{4}-\d{2}-\d{2}$/.test(l.date));
    if (!ok || legs[0].date < today()) { toast('Lety téhle cesty už proběhly – vyhledej nové', 'err'); return false; }
    // letiště domova / minulého hledání se svým názvem („Praha“), jinak místo trasy („Řím (FCO)“) nebo kód
    const known = [...(S.home?.from || []), ...(S.form?.from || [])];
    const ap = (c, n) => { const k = known.find(x => x && x.id === 'ap:' + c); return [k ? { ...k } : { id: 'ap:' + c, label: n ? `${n} (${c})` : c, flag: '', type: 'airport' }]; };
    const ls = legs.map((l, i) => ({ from: ap(l.from, i ? names[i - 1] : ''), to: ap(l.to, names[i] || ''), date: l.date, flex: 0 }));
    setForm({ ...defaultForm(), ...prefsOf(S.form), from: ls[0].from, to: [], trip: 'multi', legs: ls });
    startSearch();
    return true;
  }

  function renderSources() {
    const box = $('#srcBox'); if (!box || !health) return;
    // hotely: stačí jeden zapnutý zdroj (LiteAPI s ostrým klíčem, jinak TripAdvisor přes Xotelo)
    const tpOff = health.providers.some(p => p.id === 'travelpayouts' && !p.enabled);
    const staysOff = health.providers.some(p => p.kind === 'stays') && !health.providers.some(p => p.kind === 'stays' && p.enabled);
    box.innerHTML = `<div class="src-t">Zdroje cen</div>` + health.providers.map(p => `<div class="src ${p.enabled ? 'on' : ''}" title="${esc(p.note || '')}${p.hint ? ' – ' + esc(p.hint) : ''}"><i style="background:${p.color}"></i>${esc(p.name)}<span>${p.enabled ? (p.blocked ? 'blokováno' : p.tag ? esc(p.tag) : p.kind === 'cached' ? 'cache' : p.kind === 'demo' ? 'demo' : 'živě') : p.kind === 'stays' && !staysOff ? 'nepoužito' : 'vypnuto'}</span></div>`).join('')
      + (tpOff || staysOff
        ? `<button type="button" class="linkbtn" id="tpHelp" style="margin-top:6px">➕ Zapnout ${tpOff ? 'všechny aerolinky' : 'hotely s cenami'}</button>` : '');
    const h = $('#tpHelp'); if (h) h.onclick = () => window.showSetupGuide(tpOff ? null : 'guideStays');
  }

  /**
   * Návod: bezplatný token Travelpayouts = stovky dalších aerolinek (nízkonákladové i dálkové), hotely
   * s cenou (Xotelo bez klíče, ostrý klíč LiteAPI). Co už na serveru běží, se jen potvrdí (✓) – návod jen na to, co zapnuté není.
   */
  function showTpGuide() {
    const on = id => Boolean(health && health.providers.some(p => p.id === id && p.enabled));
    const tpOn = on('travelpayouts'), liteOn = on('liteapi'), xoOn = on('xotelo'), staysOn = liteOn || xoOn;
    // Xotelo po chybách (429, odmítá dotazy, výpadek) na chvíli vynechané – ne „✓ zapnuté“
    const xoBlocked = health && health.providers.find(p => p.id === 'xotelo' && p.enabled && p.blocked);
    const title = tpOn ? (staysOn ? 'Zdroje cen jsou zapnuté' : 'Hotely s cenou přímo v ATLASu') : `Zapnout všechny aerolinky${staysOn ? '' : ' a hotely'}`;
    const sub = tpOn ? (staysOn ? 'aerolinky i hotely' : 'volitelné – bez toho funguje všechno, hotel jen vybereš u partnerů') : `easyJet, Vueling, Lufthansa, Emirates, Qatar, Turkish…${staysOn ? '' : ' + hotely s hodnocením'} – zdarma, asi 5 minut`;
    // kroky pro ostrý klíč LiteAPI (bez Xotela nutné, s ním volitelné)
    const liteSteps = `<ol class="guide">
          <li>Zaregistruj se zdarma na <a href="https://dashboard.liteapi.travel/" target="_blank" rel="noopener">dashboard.liteapi.travel</a>.</li>
          <li>V části <b>API Keys</b> zkopíruj klíč. <b>Sandbox</b> (začíná <code>sand_</code>) dává jen testovací hotely – pro skutečné ceny zapni <b>Production</b> (chce kartu, ale za hledání se neplatí).</li>
          <li>Na Renderu přidej proměnnou <code>LITEAPI_KEY</code> se zkopírovaným klíčem → <b>Save Changes</b>.</li>
        </ol>`;
    modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" onclick="modalClose()">${ico('M18 6L6 18M6 6l12 12')}</button>
      <div class="modal-hero-inner"><h2 style="font-size:23px">${title}</h2><div style="opacity:.85;font-size:13px">${sub}</div></div></div>
      <div class="modal-body">
        ${tpOn ? '<div class="note good" style="margin-bottom:12px">✓ <div><b>Všechny aerolinky jsou zapnuté</b> – Ryanair a Wizz Air živě, ostatní přes Travelpayouts / Aviasales, živé ceny k vybranému letu přes Kiwi.com. Tady není co nastavovat.</div></div>' : `<p class="muted" style="font-size:14px;margin-bottom:12px">Ryanair a Wizz Air ATLAS hledá přímo. Ostatní aerolinky (nízkonákladové i dálkové lety s přestupy) přidá bezplatný přístup k datům <b>Travelpayouts / Aviasales</b>:</p>
        <ol class="guide">
          <li>Zaregistruj se zdarma na <a href="https://www.travelpayouts.com/" target="_blank" rel="noopener">travelpayouts.com</a> (stačí e-mail).</li>
          <li>V profilu otevři <b>Profile → API token</b> (nebo Tools → API) a zkopíruj <b>API token</b>.</li>
          <li>Na <a href="https://dashboard.render.com/" target="_blank" rel="noopener">dashboard.render.com</a> otevři službu <b>atlas-letenky</b> → <b>Environment</b> → <b>Add Environment Variable</b>.</li>
          <li>Key: <code>TRAVELPAYOUTS_TOKEN</code>, Value: tvůj token → <b>Save Changes</b>. Render aplikaci za minutu sám restartuje.</li>
        </ol>
        <div class="note info" style="margin-top:12px">ℹ️ <div>Ceny z Travelpayouts pocházejí z hledání ostatních uživatelů za poslední dny – u výsledků jsou označené „z cache“ a před nákupem je ověř. Pokud budeš chtít z odkazů provize, doplň i <code>TRAVELPAYOUTS_MARKER</code> (tvoje partnerské ID).</div></div>
        <p class="muted" style="font-size:14px;margin:12px 0 8px"><b>Živé ceny všech aerolinek k vybranému letu</b> (Kiwi.com) jsou zapnuté samy – klíč nepotřebují.</p>`}
        <h3 id="guideStays" style="font-size:16px;margin:18px 0 8px">🏨 Hotely s cenou a hodnocením</h3>
        ${liteOn ? '<div class="note good">✓ <div><b>Zapnuté</b> – u ubytování ATLAS ukazuje hotely s cenou a hodnocením přímo (LiteAPI).</div></div>'
          : xoOn ? `${xoBlocked ? `<div class="note warn">⚠️ <div><b>Zapnuté, ale teď nefunguje</b> – Xotelo ${esc(xoBlocked.reason || 'hlásí chyby')}. Hledání ubytování zatím nabídne jen odkazy na partnery; ATLAS to zkusí znovu sám${xoBlocked.retryAfter ? ` za ${Math.max(1, Math.round(xoBlocked.retryAfter / 60))} min` : ''}.</div></div>`
            : '<div class="note good">✓ <div><b>Zapnuté, bez klíče</b> – u ubytování ATLAS ukazuje hotely s hodnocením a orientačními cenami z TripAdvisoru (Booking, Agoda, Trip.com…) přes bezplatné neoficiální API Xotelo. Tady není co nastavovat.</div></div>'}
        <details class="more" style="margin-top:10px"><summary>Volitelně: LiteAPI místo TripAdvisoru</summary>
          <p class="muted" style="font-size:13px;margin:8px 0">Ostrý klíč LiteAPI má přednost: ceny přímo k rezervaci a později i možnost provizí (u Xotela provize nebudou). Kdyby Xotelo přestalo fungovat, zůstanou odkazy na partnery.</p>${liteSteps}</details>`
          : `<p class="muted" style="font-size:13px;margin-bottom:8px"><b>Volitelné.</b> Bez klíče ATLAS u ubytování nabídne předvyplněné hledání na Booking.com (hodnocení 8+, od nejlevnějšího), Airbnb, Google Hotels a dalších – stačí to. Ceny a hodnocení hotelů přímo v průvodci ${health && health.providers.some(p => p.id === 'xotelo') ? 'zapne buď TripAdvisor přes Xotelo (bez klíče – na serveru ho vypnula proměnná <code>XOTELO=off</code>, stačí ji odebrat), nebo ostrý klíč LiteAPI' : 'přidá klíč LiteAPI'}:</p>${liteSteps}`}
      </div>`);
  }
  window.showSetupGuide = (section) => {
    showTpGuide();
    if (section) setTimeout(() => { const el = document.getElementById(section); if (el) el.scrollIntoView({ block: 'start' }); }, 50);
  };

  // „💡 Jak hledat chytře“: ceny registrací z dat vstupních podmínek (ne napevno v textu)
  function guideEntry() {
    const el = $('#sgEntry');
    if (!el || !['US', 'CA', 'GB'].every(iso => Entry.get(iso))) return;
    // „ESTA (~36 €, i na přestup)“ – tranzit podle dat (transitEta), u Británie jen s pasovou kontrolou
    const reg = iso => {
      const r = Entry.get(iso), eur = Number(r.etaCostEur);
      const bits = [r.etaCostEur != null && eur >= 0 ? `~${eur} €` : '', r.transitEta === true ? 'i na přestup' : r.transitEta ? 'i na přestup s pasovou kontrolou' : ''].filter(Boolean);
      return `${esc(Entry.regName(r))}${bits.length ? ` (${bits.join(', ')})` : ''}`;
    };
    el.innerHTML = `<b>Hlídej vstupní podmínky.</b> Do USA potřebuješ ${reg('US')}, do Kanady ${reg('CA')}, do Británie ${reg('GB')}. Vyřizuj je jen na oficiálních webech (zprostředkovatelé si účtují víc). ATLAS je ukáže u výsledků (🛂) a podrobně v detailu země – zdroj MZV ČR, ověřeno ${esc(Entry.checkedTxt() + Entry.ageTxt())}.`;
  }

  /* Pruh „Čekám na server“ s letadlem (uspaný server na Renderu zdarma): 'wait' ukázat, 'ok' doletět a zmizet, jinak zmizet. */
  const JET = 'M97 50C97 47 94 45.5 90 45.5H60L40 9H33L45 45.5H22L14 31H9L12 47L11 50L12 53L9 69H14L22 54.5H45L33 91H40L60 54.5H90C94 54.5 97 53 97 50Z';
  function wakeBar(state) {
    let bar = $('#wakeBar');
    if (state === 'wait') {
      if (bar || navigator.onLine === false) return;
      bar = document.createElement('div');
      bar.id = 'wakeBar';
      bar.className = 'wake-bar';
      bar.setAttribute('role', 'status');
      bar.innerHTML = `<div class="wake-track" aria-hidden="true"><svg class="wake-jet" viewBox="0 0 100 100"><path fill="currentColor" d="${JET}"/></svg></div><span><b>Čekám na server ATLASu…</b> Na bezplatném hostingu usíná, probudí se do půl minuty. Uložené cesty fungují hned.</span>`;
      const demo = $('#demoBanner'), main = $('.main');
      if (demo) demo.after(bar); else if (main) main.prepend(bar);
      return;
    }
    if (!bar) return;
    if (state !== 'ok') return bar.remove();
    bar.classList.add('done');
    bar.querySelector('span').innerHTML = '<b>✓ Server je vzhůru</b> – hledání letů a ceny jsou k dispozici.';
    setTimeout(() => bar.remove(), 2400);
  }

  // Stav serveru (aerolinky, DEMO, kurz) se začne stahovat hned při startu aplikace (app.js) souběžně s daty zemí.
  let healthReq = null;
  let healthNow = null; // čekající nový pokus o stav serveru – zavolat hned (úspěšné hledání = server žije)
  // nepovedený dotaz se nepamatuje – další warm() (nový pokus v init) se serveru zeptá znovu
  const warm = () => { if (!healthReq) { const p = healthReq = api('api/health'); p.catch(() => { if (healthReq === p) healthReq = null; }); } return healthReq; };
  async function init() {
    // domov radaru z dřívější verze (bez počtu cestujících): jednou podle formuláře – sólo cestovatel zůstane u 1 os.
    if (S.home?.from?.length && S.home.adults == null) { S.home.adults = Math.min(6, Math.max(1, Math.round(+S.form?.adults) || 2)); save(); }
    // prst / myš dole a posouvání: průběžné výsledky počkají (paintSoon)
    document.addEventListener('pointerdown', () => { hands.down = Date.now(); }, true);
    ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { hands.down = 0; }, true));
    window.addEventListener('scroll', () => { hands.scroll = Date.now(); }, { passive: true });
    const useHealth = h => {
      health = h;
      for (const p of h.providers) PROV[p.id] = p;
      if (h.demo) $('#demoBanner').hidden = false;
      if (window.Entry && h.fx) Entry.setRate(h.fx.eurCzk); // vstupní poplatky v € → Kč
    };
    let wasDown = false;
    const down = e => { if (!e.offline) { wasDown = true; toast('Server ATLAS neodpovídá – vyhledávání letů nepůjde', 'err'); } }; // offline: pruh „Jsi offline“ (pwa.js)
    // Stav serveru nedorazil (start bez spojení, server se probouzí / nasazuje, 5xx): znovu po návratu online, po úspěšném
    // hledání, jinak za 15 s, 30 s … nejdéle 5 min – zdroje cen, DEMO, jména aerolinek ve výsledcích. Čeká vždy jen jeden pokus.
    let wait = 15000;
    const retry = () => {
      if (healthNow) return;
      const go = () => {
        clearTimeout(t); window.removeEventListener('online', go); healthNow = null;
        warm().then(x => {
          useHealth(x); renderSources();
          if (wasDown) { wasDown = false; toast('Server ATLAS zase odpovídá'); }
          if (!lastResult || !$('#results').children.length) return;
          rerender(true);
          // řádek „✓ Prohledáno … · Demo Air 132“ po hledání: jména obchodů místo id (rozbalení zůstane)
          const pc = $('#progress details.progress-card');
          if (pc && !restored && !running) { const open = pc.open; renderProgress({ providers: lastResult.providers }, false, lastResult); $('#progress details').open = open; }
        }, retry);
      };
      const t = setTimeout(go, wait); wait = Math.min(wait * 2, 300000);
      window.addEventListener('online', go);
      healthNow = go;
    };
    try {
      // Na stav serveru se při startu čeká nejvýš 1 s: uspaný server (Render zdarma) se probouzí až půl minuty –
      // aplikace se zatím vykreslí bez něj a zdroje cen se doplní, až odpoví. Trvá-li to přes 2,5 s, nahoře je pruh
      // s letadlem, dokud server neodpoví.
      const h = await Promise.race([warm(), new Promise(r => setTimeout(r, 1000, null))]);
      if (h) useHealth(h);
      else {
        const t = setTimeout(() => wakeBar('wait'), 1500);
        warm().then(x => { clearTimeout(t); useHealth(x); renderSources(); wakeBar('ok'); }, e => { clearTimeout(t); wakeBar('fail'); down(e); retry(); });
      }
    } catch (e) {
      down(e); retry();
    }
    // výsledky vykreslené dřív, než dorazily vstupní podmínky, doplnit o čipy
    if (window.Entry) Entry.whenReady(() => { guideEntry(); if (lastResult) rerender(true); });
    PROV.travelpayouts = PROV.travelpayouts || { name: 'Ostatní aerolinky', color: '#ff6b00' };
    PROV.mix = { name: 'kombinace', color: '#5b8cff' };
    renderSources();
    buildForm();
    setForm(S.form || defaultForm());
    updateHomeChip();
    restoreLast();
    renderRecent();
    renderQuick(); // Nápady, kam letět – i na Letech
    heroFrom = new PlaceInput($('#heroFrom'), { origin: true, placeholder: 'Brno, Vídeň, Česko…', dark: true, max: 3 });
    heroTo = new PlaceInput($('#heroTo'), { placeholder: 'kamkoliv 🌍, nebo „k moři v květnu“', dark: true, max: 4,
      smart: { run: hit => smartRun(hit, heroFrom.items), tips: () => smartTips(() => heroFrom.items) } });
    paintSmartTry();
    heroFrom.set(S.home?.from || [], true);
    $('#heroSearch').onsubmit = async e => {
      e.preventDefault();
      if ((await heroFrom.settle()) === false) return;
      if (!heroFrom.items.length) { toast('Zadej, odkud letíš', 'err'); heroFrom.input.focus(); return; }
      const to = await heroTo.settle();
      if (to === false || to === 'run') return;
      go('flights');
      setForm({ ...defaultForm(), ...prefsOf(S.form), from: heroFrom.items, to: heroTo.items });
      startSearch();
    };
    updateWatchBadges();
    startAutoCheck();
    $('#results').addEventListener('click', ageBuy);
    setInterval(ageTick, 5 * 60e3); // stáří výsledků a ceny letu v průvodci – jinde nebo se schovanou aplikací nic nedělá
  }

  // běží hledání (uživatel, radar, kontrola hlídané ceny)? – PWA se pak po návratu sama neobnoví (zrušila by ho)
  const busy = () => busySearches > 0 || [...wState.values()].includes('run');
  window.Flights = { init, warm, busy, ageCheck, lastPick, renderQuick, renderResume, renderWatch, renderRadar, renderFav, refreshPrefs: prefsPaint, homeChanged, renderPins, refreshPins: pinsPaint, searchTo, searchLegs, repaintMap: () => { if (view.mode === 'map' && lastResult) rerender(true); }, PlaceInput, smartRun, smartTips, runSearch, watchStatTxt, priceCheck: openPriceCheck, priceTag, watchKey, updateHomeChip,
    // navštívené země se změnily (mapa, země, 💾 obnova) → 🆕 a „jen nové země“ ve výsledcích hned podle nich
    refreshVisited: () => { if (lastResult && lastResult.mode !== 'multi' && !running && $('#results') && $('#results').children.length) rerender(true); },
    // 🏠 vlastní ceny na letiště se změnily (💾 obnova) → náhled letišť a seznam cen ve formuláři znovu
    refreshOrigins: () => { if (fromInput && $('#originPills')) refreshOrigins(); } };
})();
