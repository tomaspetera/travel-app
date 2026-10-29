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
  // celý popis pole Kam pro čtečku obrazovky (PlaceInput hint) – placeholder je kvůli úzkému telefonu zkrácený
  const KAM_HINT = 'Město, letiště, země, kamkoliv nebo věta jako „k moři v květnu“';
  const ODKUD_HINT = 'Město, letiště nebo země, třeba Brno, Vídeň, Česko nebo Jihlava';
  const PROV = {}; // id → {name,color,kind,note}
  let health = null;
  let lastResult = null;
  let lastPayload = null;
  // Filtry letišť a aerolinek vyřazují (excludeOrigins, excludeCarriers): letiště či aerolinka, která přibude s dalším
  // výsledkem (konečný po průběžném), je vidět – kromě „jen lety odsud“ (onlyOrigin), které platí i pro nová letiště.
  let view = { mode: 'list', sort: 'best', legSort: 'price', maxPrice: null, onlyDeals: false, newOnly: false, favOnly: false, showMuted: false, excludeOrigins: new Set(), onlyOrigin: null, excludeCarriers: new Set(), outDate: null, nights: null, expanded: new Set(), timeOpen: false, ocOpen: false, ...freshView() };
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
  // Výsledky z minula (restoreLast) se vykreslí až při prvním otevření Letů (lastDrawNow), ne při startu do skrytého
  // panelu: výpis stovek nabídek (s předpovědí počasí cílů) zdržel start na telefonu o ~0,15 s (4× pomalejší procesor)
  // a po dočtení vstupních podmínek se kreslil ještě jednou. Data (lastResult, parse ~20 ms) jsou načtená hned –
  // plánovač, hlídání cen i průvodce je čtou.
  let lastDraw = false;
  // Průvodce cestou (trip.js) a Objevuj (places.js) se stahují až po startu (lazy.js): načtený modul → fn hned jako
  // dřív, klepnutí před dostažením na něj počká; bez zavaděče hned. tripWait: překreslení výpisu po dostažení průvodce
  const withMod = (mod, fn) => (window.Lazy ? Lazy.run(mod, fn) : fn());
  let tripWait = false;
  let running = null; // právě běžící hledání uživatele: { key (dotaz JSON), ctl (AbortController), job (Promise) }
  let fromInput, toInput, heroFrom, heroTo;
  let radarAll = false; // telefon: radar rozbalený na všechny karty („Ukázat další“)
  let originPreview = [], apOpen = false;

  /* ---------- utility ---------- */
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtYMD(d); };
  const today = () => fmtYMD(new Date());
  // nezlomitelné mezery: „út 1. 12.“ se v řádku výsledku nerozdělí („út 1.“ a „12.“ na dalším řádku)
  const dayLabel = s => { const d = new Date(s.slice(0, 10) + 'T12:00:00'); return `${DOW[d.getDay()].toLowerCase()}\u00a0${d.getDate()}.\u00a0${d.getMonth() + 1}.`; };
  const timeOf = l => l.hasTime ? l.dep.slice(11, 16) : '';
  // přílet další den (noční a dálkové lety) → „00:20 +1“
  const arrTime = l => l.arr && l.hasTime ? (l.arrEst ? '~' : '') + l.arr.slice(11, 16) + (l.arr.slice(0, 10) > l.date ? ` +${SearchHelp.diffDays(l.date, l.arr.slice(0, 10))}` : '') : '';
  const dur = m => m ? `${Math.floor(m / 60)}\u00a0h ${pad(m % 60)}\u00a0min` : ''; // jednotka se neodtrhne od čísla
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
  // živá cena na osobu na stejném základu jako cena řádku (letenka + zavazadla)
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

  // Chyba bez hlášky serveru (výpadek, 502 z proxy, HTML místo JSON) česky, ne „HTTP 502“; hlášky serveru (limit hledání,
  // špatný dotaz) zůstanou. Pwa.httpError přidá status a u přetížení (429, 502–504) busy a until z Retry-After.
  async function httpErr(r) {
    if (window.Pwa && Pwa.httpError) return Pwa.httpError(r);
    const j = await r.json().catch(() => ({}));
    return new Error(j.error || 'Server teď neodpovídá – zkus to za chvíli znovu.');
  }
  /* Přetížený server odmítl hledání (503 „hledá pro hodně lidí“, 429, 502–504 z Renderu): do Retry-After se samo nehledá –
     radar po návratu do aplikace nebo na Přehled ukáže starší ceny s odpočtem a kontrola hlídaných cen počká. Každé další
     hledání by dostalo stejné odmítnutí a serveru, který nestíhá, jen přidalo práci. Hledání, o které uživatel požádá
     (Najít, ↻ v radaru, ↻ u hlídání), jde vždy; úspěšné hledání odklad zruší. */
  let overload = null; // { message, until, at } – poslední odmítnutí přetíženým serverem (at = kdy)
  const overloadNow = () => (overload && overload.until > Date.now() ? overload : null);
  const waitTxt = ms => (window.Pwa && Pwa.waitTxt ? Pwa.waitTxt(ms) : `za ${Math.ceil(ms / 1000)} s`);
  // ↻ Zkusit znovu: když server řekl, za jak dlouho (until), do té doby neaktivní s odpočtem (retryTick), pak normálně
  const retryBtn = (id, until) => {
    const left = (+until || 0) - Date.now();
    return `<button type="button" class="btn sm" id="${id}"${left > 0 ? ` disabled data-until="${+until}"` : ''}>↻ Zkusit znovu${left > 0 ? ` ${waitTxt(left)}` : ''}</button>`;
  };
  function retryTick(b) {
    if (!b || !b.dataset.until) return;
    const t = setInterval(() => {
      if (!b.isConnected) return clearInterval(t);
      const left = +b.dataset.until - Date.now();
      if (left > 0) { b.textContent = `↻ Zkusit znovu ${waitTxt(left)}`; return; }
      clearInterval(t);
      b.disabled = false; delete b.dataset.until; b.textContent = '↻ Zkusit znovu';
    }, 1000);
  }
  // Výpadek spojení (fetch selže) a nečitelná odpověď (useknutý stream) taky česky.
  const failMsg = e => (e instanceof TypeError && /fetch|network|load failed/i.test(e.message) ? 'Spojení se serverem se nepovedlo – zkontroluj připojení a zkus to znovu.'
    : e instanceof SyntaxError ? 'Server poslal neúplnou odpověď – zkus to znovu.' : e.message);

  async function api(path) {
    const r = await fetch(path);
    if (!r.ok) throw await httpErr(r);
    return r.json();
  }

  /** POST /api/search se streamem průběhu (NDJSON). */
  // Pozn.: Chrome (DevTools, Playwright) u streamovaného hledání často hlásí net::ERR_ABORTED / (canceled), i když odpověď
  // dorazila celá – jen hlášení prohlížeče. Skutečně se ruší jen přes AbortController (jiné hledání, kontrola hlídání po 3 min).
  // onPartial(result) = průběžné výsledky, dokud pomalejší zdroje hledají (jen náhled); bez něj je server neposílá
  // (noPartial – kontrola hlídaných cen, radar). Starší server je nepošle vůbec.
  async function runSearch(payload, { onProgress, onPartial, signal } = {}) {
    const r = await fetch('api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(onPartial ? payload : { ...payload, noPartial: true }), signal });
    if (!r.ok || !r.body) {
      const e = await httpErr(r);
      if (e.busy && e.until) overload = { message: e.message, until: Math.max(e.until, overload ? overload.until : 0), at: Date.now() };
      throw e;
    }
    // server hledání přijal – zase normálně; jen starší hotový výsledek radaru (stale níž) server pošle i při plné frontě,
    // ten odklad (Retry-After) nezruší
    const ov0 = overload;
    overload = null;
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', result = null, error = null, stale = null;
    for (; ;) {
      // Spojení, které se uprostřed zaseklo (slabý signál), skončí po limitu bez dat chybou (pwa.js readOrStall) – jinak
      // by „Hledám…“ viselo donekonečna a stejné hledání by nešlo spustit znovu (startSearch čeká na běžící).
      const { value, done } = await (window.Pwa && Pwa.readOrStall ? Pwa.readOrStall(reader) : reader.read());
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
        else if (ev.type === 'result') { result = ev.result; stale = ev.stale; }
        else if (ev.type === 'error') error = ev.error;
      }
    }
    if (stale && !overload) overload = ov0;
    if (error) throw new Error(error);
    if (!result) throw new Error('Server neposlal výsledek');
    // starší hotový výsledek radaru (server: stale-while-revalidate) – jak je starý (s, podle serveru, ne hodin telefonu)
    if (stale && stale.ageS >= 0) result.staleAgeS = +stale.ageS;
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
    // přetížený nebo probouzející se server (502–504): „našeptávač teď neodpovídá“, ne „Nic nenalezeno“ / „neznám“
    if (!r.ok) throw await httpErr(r);
    const j = await r.json(), items = j.items || [];
    if (j.partial) items.partial = true; // geokódování na serveru teď nešlo – jen vlastní data
    return items;
  }
  // chytré hledání: termíny podle svátků a délky pobytu jako ve formuláři
  const smartOpts = () => ({ today: today(), presets: PRESETS, holidays: SearchHelp.holidayList(today()), holidayDates: SearchHelp.holidayDates, eurCzk: health && health.fx ? health.fx.eurCzk : null });
  /** Místa z věty („do Říma“, „z Vídně“): tvar slova i se zkrácenou koncovkou → nejlepší návrh (Smart.bestPlace). */
  // Místo z tvaru ve větě („Říma“ → Řím): napřed vlastní data (rychle); geokódování (pomalejší, vesnice a místa mimo
  // databázi) jen když nic nenajdou
  async function resolvePlace(phrase, origin, near, signal, geo = true) {
    const look = remote => Promise.all(Smart.stems(phrase).map(q => placesFor(q, origin, near, signal, remote)
      .then(items => ({ q, items, local: !remote }), e => { if (e.name === 'AbortError') throw e; return { q, items: [] }; })));
    // opravený překlep („do Barcleony“) až nakonec – skutečné místo z geokódování (vesnice toho jména) má přednost
    const loc = await look(false), found = Smart.bestPlace(loc);
    if (found) return found;
    const rem = geo ? await look(true) : null;
    const fromRem = rem && Smart.bestPlace(rem);
    if (fromRem) return fromRem;
    const f = geo ? await formPlace(phrase, origin, near, signal) : null;
    return f || Smart.bestPlace(rem || loc, true);
  }
  /** „z Kutné Hory“, „do Českého Krumlova“: geokódování tvar s přídavným jménem nezná → zkusit 1. pád (Smart.placeForms). */
  async function formPlace(phrase, origin, near, signal) {
    const forms = Smart.placeForms ? Smart.placeForms(phrase) : [];
    if (!forms.length) return null;
    return Smart.bestPlace(await Promise.all(forms.map(q => placesFor(q, origin, near, signal)
      .then(items => ({ q, items }), e => { if (e.name === 'AbortError') throw e; return { q, items: [] }; }))));
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
  let piSeq = 0; // id našeptávačů (aria-controls)
  class PlaceInput {
    // smart = { run(hit), tips() } – chytré hledání (pole Kam): věta „k moři v květnu do 5000“ → ✨ řádek nahoře
    // s tím, jak jí rozumím, a prázdné pole po klepnutí → tipy podle toho, co uživatel hledá (Smart, smartTips)
    // label = jméno pole pro čtečku obrazovky (Odkud, Kam) – placeholder („Např. Brno…“) se po prvním místě mění;
    // hint = celý popis pro čtečku (aria-description), když se placeholder musel zkrátit, aby se vešel na 360 px
    constructor(el, { placeholder, label = '', hint = '', max = 5, onChange, dark = false, allowAnywhere = false, origin = false, near = null, smart = null }) {
      this.el = el; this.items = []; this.max = max; this.onChange = onChange || (() => { }); this.allowAnywhere = allowAnywhere;
      this.origin = origin; // odkud: světadíl nedává smysl
      this.near = near || (() => (S.home && S.home.from && S.home.from[0] && S.home.from[0].id) || ''); // domov pro pořadí návrhů
      this.smart = smart && window.Smart ? smart : null; this.hit = null; this.tips = [];
      el.classList.add('pi'); if (dark) el.classList.add('pi-dark');
      // našeptávač jako combobox: čtečka obrazovky ohlásí, že se nabídka otevřela, a šipkami vybraný návrh (aria-activedescendant)
      const id = 'pi' + (++piSeq), name = label || (origin ? 'Odkud' : 'Kam');
      el.innerHTML = `<div class="pi-chips"></div><input class="pi-input" placeholder="${esc(placeholder || '')}" aria-label="${esc(name)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}"${hint ? ` aria-description="${esc(hint)}"` : ''} autocomplete="off" spellcheck="false"><div class="pi-dd" id="${id}" role="listbox" aria-label="${esc(`Návrhy – ${name}`)}" hidden></div>`;
      this.chipsEl = $('.pi-chips', el); this.input = $('.pi-input', el); this.dd = $('.pi-dd', el); this.id = id;
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
      if (remote && !items.length && one && /\s/.test(one)) { const g = await formPlace(one, this.origin, this.near(), signal); if (g) items = [g]; }
      items = items.filter(s => !this.origin || s.type !== 'continent');
      // („letenky Praha Barcelona“: bez výplňových slov)
      const sq = one && /\s/.test(one) ? one : q;
      // (jen v plné nabídce – víceslovné místo jen z geokódování, „Nové Město“, by rychlý náhled rozdělil)
      const split = remote && !items.length && this.smart && !this.origin && /\s/.test(sq) ? await smartSplit(sq, this.near(), signal) : null;
      if (remote && !items.length && !split && /\s/.test(q)) { const p = await countryPlace(q, this.origin, this.near(), signal); if (p) items = [p]; }
      return { hit: split, items, partial: Boolean(list.partial) };
    }
    async fetch(retry = false) {
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
        done = true;
        // nic a geokódování na serveru teď nešlo (pomalé Open-Meteo): ne „Nic nenalezeno“ – za chvíli jednou znovu
        if (r.partial && !r.hit && !r.items.length && !retry) {
          if (q === this.input.value.trim()) { this.hit = null; this.sugs = []; this.open('slow'); }
          setTimeout(() => { if (q === this.input.value.trim() && document.activeElement === this.input) this.fetch(true); }, 1500);
          return;
        }
        show(r);
      } catch (e) { if (e.name !== 'AbortError') { this.hit = null; this.sugs = []; this.open(true); } }
    }
    open(err) {
      const typeLbl = { airport: 'letiště', metro: 'město', city: 'město', country: 'země', region: 'oblast', place: 'místo', continent: 'světadíl' };
      const rows = this.rows();
      const row = (r, i) => {
        const on = i === this.active ? ' on' : '';
        const opt = cls => `class="pi-opt${cls}${on}" data-i="${i}" id="${this.id}-${i}" role="option" aria-selected="${i === this.active}"`;
        if (r.hit) {
          const h = r.hit, places = h.chain ? [`🧳 ${h.chain.map(x => x.label).join(' → ')}`] : [...h.from.map(x => `🛫 ${x.label} →`), ...h.to.map(x => `📍 ${x.label}`), ...(h.back ? [`↩ návrat: ${h.back.label}`] : [])];
          const what = [...places, ...h.sm.chips.map(c => `${c.icon} ${c.text}`)].join(' · ');
          const sub = h.chain ? 'víc měst – nastavím lety, rozdělím termíny a hledám'
            : h.back && !h.miss.length ? 'tam a zpět z jiného města – nastavím 2 lety (přejezd mezi městy je na tobě) a hledám'
            : h.miss.length ? `„${h.miss.join('“, „')}“ neznám – hledám bez toho` : (h.sm.items && !h.to.length ? h.sm.items.map(x => x.label).join(', ') : 'klepni nebo Enter – nastavím a hledám');
          return `<div ${opt(' pi-smart')}><span class="pi-flag">✨</span><span class="pi-t"><b>${esc(what)}</b><small>${esc(sub)}</small></span><span class="pi-type">hledat</span></div>`;
        }
        if (r.tip) return `<div ${opt(' pi-tip')}><span class="pi-flag">${r.tip.icon}</span><span class="pi-t"><b>${esc(r.tip.text)}</b>${r.tip.sub ? `<small>${esc(r.tip.sub)}</small>` : ''}</span></div>`;
        const s = r.sug;
        return `<div ${opt('')}><span class="pi-flag">${s.flag || '📍'}</span><span class="pi-t"><b>${esc(s.label)}</b><small>${esc(s.sub || '')}</small></span><span class="pi-type">${typeLbl[s.type] || ''}</span></div>`;
      };
      this.dd.innerHTML = (this.tips.length ? '<div class="pi-head">✨ Pro tebe – nebo napiš celou větu, třeba „k moři v květnu do 5000“</div>' : '')
        + (rows[0] && rows[0].sug && rows[0].sug.fuzzy ? '<div class="pi-head">🔤 Překlep? Asi myslíš:</div>' : '')
        + (rows.length ? rows.map(row).join('') : `<div class="pi-empty">${err === 'slow' ? '<span class="spin dark"></span> Hledání míst je teď pomalé – zkouším znovu…' : err ? 'Našeptávač teď neodpovídá – zkus to za chvíli znovu' : `Nic nenalezeno – zkus jiný název nebo kód letiště${this.smart ? ', nebo napiš větu, třeba „k moři v květnu“' : ''}`}</div>`);
      this.dd.hidden = false;
      this.input.setAttribute('aria-expanded', 'true');
      if (this.active >= 0 && this.active < rows.length) this.input.setAttribute('aria-activedescendant', `${this.id}-${this.active}`); else this.input.removeAttribute('aria-activedescendant');
      if (!rows.length) say($('.pi-empty', this.dd).textContent); // „Nic nenalezeno…“ – v nabídce není co vybrat
      $$('.pi-opt', this.dd).forEach(o => o.onmousedown = e => { e.preventDefault(); this.choose(rows[+o.dataset.i]); });
    }
    close() { this.dd.hidden = true; this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant'); }
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
      let down = false, slow = false;
      try {
        const { hit, items, partial } = await this.lookup(q);
        if (hit) { this.input.value = ''; this.smart.run(hit); return 'run'; }
        if (items[0]) { this.pick(items[0]); return 'pick'; }
        slow = partial; // geokódování na serveru teď nešlo – místo možná existuje
      } catch (e) { down = e.busy ? 'busy' : true; } // našeptávač nedostupný (výpadek sítě / serveru) – nejde o neznámé místo
      toast(down === 'busy' ? 'Server je teď přetížený a místa nejde dohledat – zkus to za chvíli znovu' : down ? 'Místa teď nejde dohledat – zkontroluj připojení a zkus to znovu' : slow ? 'Hledání míst je teď pomalé – zkus to za chvilku znovu' : `„${q}“ neznám – vyber místo z nabídky`, 'err');
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
      this.chipsEl.innerHTML = this.items.map((x, i) => `<span class="pi-chip"><span>${x.flag || ''}</span>${esc(x.label)}<button type="button" data-x="${i}" aria-label="${esc(`Odebrat ${x.label}`)}">×</button></span>`).join('');
      $$('[data-x]', this.chipsEl).forEach(b => b.onclick = e => { e.stopPropagation(); this.items.splice(+b.dataset.x, 1); this.render(); this.onChange(this.items); });
      // krátce: vedle místa zbývá na 360 px jen ~64 px („přidat další…“ se uřízlo na „přidat d“)
      this.input.placeholder = this.items.length ? '+ další' : this.ph;
    }
  }

  /* ---------- formulář ---------- */
  function defaultForm() {
    return {
      from: S.home?.from || [], to: [], radius: S.home?.radius ?? 200, trip: 'return', len: 'week', nMin: 5, nMax: 9,
      dFrom: addDays(today(), 7), dTo: addDays(today(), 60), adults: 2, maxPrice: '',
      children: 0, infants: 0, // děti 2–11 let (sedadlo) a miminka do 2 let (na klíně) – sheet Cestující (paxSheet)
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
      adults: +$('#adults').value, children: +$('#children').value || 0, infants: +$('#infants').value || 0, maxPrice: $('#maxPrice').value, ground: $('#groundOn').checked,
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
    rollTouched = false; // 📅 Hlídat s posouváním termínu: zase podle začátku rozsahu
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
    setPax(f); $('#maxPrice').value = f.maxPrice || ''; $('#groundOn').checked = f.ground; $('#kmRate').value = f.kmRate;
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
  let rollTouched = false; // 📅 Hlídat s posouváním termínu přepnuté ručně (jinak podle začátku rozsahu – rollWanted)
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
  /* ---------- 👥 Cestující: dospělí, děti 2–11 let, miminka do 2 let (okno se stepery) ---------- */
  // Počty jsou ve skrytých polích formuláře (#adults, #children, #infants) – getForm, koncept i hlídání je čtou jako
  // ostatní pole. Na telefonu jen řádek „2 dospělí · 1 dítě“, stepery v okně zespodu; každá změna pošle 'change' jako
  // jiná políčka (souhrn Další možnosti, náhled letišť autem, rozepsané hledání).
  const paxNow = () => SearchHelp.paxOf({ adults: $('#adults').value, children: $('#children').value, infants: $('#infants').value });
  function setPax(f) {
    const p = SearchHelp.paxOf(f);
    $('#adults').value = String(p.adults); $('#children').value = String(p.children); $('#infants').value = String(p.infants);
    $('#paxSum').textContent = SearchHelp.paxTxt(p);
  }
  const PAX_ROWS = [['adults', 'Dospělí', 'od 12 let'], ['children', 'Děti', '2–11 let · vlastní sedadlo'], ['infants', 'Miminka', 'do 2 let · na klíně, jedno na dospělého']];
  function paxSheet() {
    modalOpen(`<div class="modal-body pax-sheet"><div class="row lw-head"><h3>👥 Cestující</h3><button type="button" class="icon-btn" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button></div>
      ${PAX_ROWS.map(([k, name, sub]) => `<div class="pax-row"><div><b>${name}</b><div class="faint">${sub}</div></div>
        <div class="pax-step" role="group" aria-label="${name}"><button type="button" data-px="${k}" data-d="-1" aria-label="${name} – ubrat">−</button><output data-pv="${k}" aria-live="polite"></output><button type="button" data-px="${k}" data-d="1" aria-label="${name} – přidat">+</button></div></div>`).join('')}
      <div class="faint pax-foot">Dítě platí sedadlo – u nízkonákladových aerolinek obvykle jako dospělý, cena celkem je proto za všechna sedadla. Miminko letí na klíně dospělého: aerolinka za něj účtuje poplatek za let, ten se doplní při nákupu. Nejvýš ${SearchHelp.PAX_MAX} sedadel.</div>
      <button type="button" class="btn primary pax-done" data-close>Hotovo</button></div>`);
    // stepery na místě (bez nového vykreslení okna – fokus zůstane na tlačítku); meze jako server: sedadel nejvýš 9,
    // miminek nejvýš tolik co dospělých (ubraný dospělý vezme i miminko)
    const paint = () => {
      const p = paxNow(), max = { adults: SearchHelp.PAX_MAX - p.children, children: SearchHelp.PAX_MAX - p.adults, infants: p.adults }, min = { adults: 1, children: 0, infants: 0 };
      $$('#modal [data-pv]').forEach(o => { o.textContent = p[o.dataset.pv]; });
      $$('#modal [data-px]').forEach(b => { const k = b.dataset.px; b.disabled = +b.dataset.d < 0 ? p[k] <= min[k] : p[k] >= max[k]; });
    };
    $$('#modal [data-px]').forEach(b => b.onclick = () => {
      const p = paxNow();
      p[b.dataset.px] += +b.dataset.d;
      setPax(p); paint();
      $('#adults').dispatchEvent(new Event('change', { bubbles: true }));
    });
    paint();
  }
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
  // Cestující do dotazu: děti a miminka jen s nimi – hledání bez dětí (i hlídané ceny a jejich klíče) zůstane stejné
  const paxPayload = f => { const p = SearchHelp.paxOf(f); return { adults: p.adults, ...(p.children ? { children: p.children } : {}), ...(p.infants ? { infants: p.infants } : {}) }; };
  function payloadOf(f) {
    const exact = f.dateMode === 'exact';
    if (f.trip === 'multi') {
      // Víc měst: každý let zvlášť (odkud 1. letu = pole Odkud s okruhem letišť), zbytek jako u ostatních hledání.
      return {
        trip: 'multi', from: f.from.map(x => x.id), radiusKm: f.radius, ...paxPayload(f), maxPrice: f.maxPrice ? +f.maxPrice : null,
        directOnly: f.directOnly, ...groundPayload(f), arrival: f.arrival !== false, openJaw: f.openJaw, exclude: f.exclude, ...(BAG_LBL[f.bags] ? { bags: f.bags } : {}),
        legs: (f.legs || []).map((l, i) => ({ from: (i ? l.from : f.from).map(x => x.id), to: l.to.map(x => x.id), date: l.date, flexDays: +l.flex || 0 })),
      };
    }
    return {
      from: f.from.map(x => x.id), to: f.to.map(x => x.id), radiusKm: f.radius,
      dateFrom: f.dFrom, dateTo: f.dTo, trip: f.trip, nightsMin: f.nMin, nightsMax: f.nMax,
      outDays: exact ? [] : f.outDays, backDays: exact ? [] : f.backDays, ...paxPayload(f), maxPrice: f.maxPrice ? +f.maxPrice : null,
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
    const len = $('#lenField').style.display === 'none' ? '' : `${word($('#lenPreset .on'))} ${SearchHelp.nightsRange($('#nMin').value, $('#nMax').value)}`; // „víkend 1–3 noci“, ne „1–3 nocí“
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
    if (f.adults !== 1 || f.children || f.infants) bits.push(SearchHelp.paxShort(f));
    if (f.maxPrice) bits.push(`do ${czk(+f.maxPrice)}`);
    $('.gm-field').classList.toggle('gm-off', !f.ground);
    if (!f.ground) bits.push('bez dopravy na letiště');
    else if (f.groundMode === 'car') bits.push(`🚗 na letiště autem (${FUEL_SHORT[f.carFuel] || 'nafta'})`);
    else if (+f.kmRate > 0) { // s jízdným × 0 se doprava nepočítá – ani vlastní ceny (seznam 🏠 je schovaný)
      if (+f.kmRate !== 1) bits.push(`jízdné × ${String(+f.kmRate).replace('.', ',')}`);
      const own = SearchHelp.ownClean(S.accessOwn) || {}, ks = originPreview.filter(a => !a.off && Object.hasOwn(own, a.iata)).map(a => a.iata);
      if (ks.length) bits.push(`🏠 vlastní cena na letiště ${ks.join(', ')}`);
    } else bits.push('bez dopravy na letiště (jízdné × 0)');
    if (f.arrival === false) bits.push('bez cesty z letiště do města');
    if (f.directOnly) bits.push('jen přímé');
    if (BAG_LBL[f.bags]) bits.push('🧳 ' + BAG_LBL[f.bags]);
    bits.push(...SearchHelp.dowBits(f)); // „odlet čt, pá nebo so · návrat ne nebo po“ (dřív jen odlet)
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
    modalOpen(`<div class="modal-body"><div class="row lw-head"><h3>🗓️ Kdy si vzít dovolenou</h3><button type="button" class="icon-btn" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button></div>
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
      if (i) row.from = new PlaceInput($('.ml-from', el), { placeholder: 'Město nebo letiště', label: `${i + 1}. let – odkud`, max: 3, onChange: () => { mlTouched = true; mlInfo(); formEdited(); } });
      row.to = new PlaceInput($('.ml-to', el), { placeholder: i === legs.length - 1 ? 'Město, nebo domů' : 'Město nebo letiště', label: `${i + 1}. let – kam`, max: 3, onChange: () => { mlFollow(i); formEdited(); } });
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
        // autem se dělí mezi všechny, kdo platí sedadlo (dospělí i děti) – stejně jako v hledání
        + `&adults=${SearchHelp.paxOf(f).seats}&trip=${nights == null ? 'oneway' : 'return'}${nights == null ? '' : `&nights=${nights}`}`;
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
        return `<button type="button" class="opill ${a.off ? 'off' : ''}${i >= 2 ? ' extra' : ''}" data-op="${a.iata}" title="${esc(a.name)}${a.seasonal ? ` · ☀️ ${esc(a.seasonal)}` : ''}${l ? ` · ${esc(l.title)}` : a.ground ? ` · cesta ~${hm(a.ground.minutes)}` : ''}">
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
      return { v, est, how: (a.seasonal ? `☀️ ${a.seasonal} · ` : '') + ownHow(g), title: `${a.name} – odhad ~${czk(est)} na osobu tam${v !== '' ? `, počítám s tvou cenou ${czk(v)}` : ''}` };
    };
    // stejná letiště: jen doplnit (pole, do kterého se zrovna píše, zůstane – Tab z jednoho pole do druhého)
    const cur = $$('[data-own]', list);
    if (cur.length === aps.length && cur.every((inp, i) => inp.dataset.own === aps[i].iata)) {
      cur.forEach((inp, i) => {
        const x = item(aps[i]), lb = inp.closest('label'), d = $('.gm-own-d', lb);
        inp.placeholder = `~${x.est}`; lb.title = x.title; lb.classList.toggle('on', x.v !== '');
        if (d) d.textContent = x.v !== '' ? `počítám s tvou cenou · odhad ~${x.est} Kč` : x.how;
        if (document.activeElement !== inp) inp.value = x.v;
      });
      return;
    }
    list.innerHTML = aps.map(a => {
      const x = item(a);
      return `<label class="gm-in gm-own-it${x.v !== '' ? ' on' : ''}" title="${esc(x.title)}"><b>${a.iata}</b><span class="gm-own-c">${esc(a.city || '')}</span><span class="gm-own-v"><input class="input xs" type="number" min="0" max="${SearchHelp.OWN_MAX_CZK}" step="1" inputmode="numeric" data-own="${a.iata}" value="${x.v}" placeholder="~${x.est}" aria-label="Moje cena na letiště ${a.iata} (Kč na osobu tam, prázdné = odhad)"> Kč</span><small class="gm-own-d">${esc(x.v !== '' ? `počítám s tvou cenou · odhad ~${x.est} Kč` : x.how)}</small></label>`;
    }).join('');
    $$('[data-own]', list).forEach(inp => inp.onchange = () => setOwn(inp.dataset.own, inp));
  }
  // Z čeho odhad je: „Praha → Pardubice vlakem / busem ~120 + MHD Pardubice ~30 · ~1 h 45 min“ (rozpis serveru, bez závorek)
  function ownHow(g) {
    const parts = (g.breakdown || []).filter(x => x && x.czk > 0).map(x => `${String(x.label || '').replace(/\s*\([^)]*\)/g, '').trim()} ~${x.czk}`);
    return [parts.join(' + '), g.minutes > 0 ? `~${hm(g.minutes)}` : ''].filter(Boolean).join(' · ');
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
    refreshOrigins(); formEdited(); paintGroundStale();
  }

  function buildForm() {
    // jako na Přehledu: na 360 px má prázdné pole jen ~172 px („Např. Brno, Vídeň, Česko, Jihlava…“ se uřízlo)
    fromInput = new PlaceInput($('#fromInput'), { origin: true, placeholder: 'Brno, Vídeň, Česko…', hint: ODKUD_HINT, onChange: () => { refreshOrigins(); updateHomeChip(); mlHomeChanged(); formEdited(); if (fromInput.items.length) fromAnswered(); } });
    // na 360 px má pole vedle ikony jen ~216 px – celý popis dostane čtečka (hint)
    toInput = new PlaceInput($('#toInput'), { placeholder: 'Kamkoliv 🌍 nebo „k moři“', hint: KAM_HINT, onChange: () => { syncFormUI(); formEdited(); }, near: () => (fromInput.items[0] && fromInput.items[0].id) || (S.home && S.home.from && S.home.from[0] && S.home.from[0].id) || '',
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
    ['#groundOn', '#kmRate'].forEach(s => $(s).onchange = () => { refreshOrigins(); syncFormUI(); paintGroundStale(); });
    $$('#groundMode button').forEach(b => b.onclick = () => { setGroundMode(b.dataset.g); refreshOrigins(); syncFormUI(); paintGroundStale(); });
    // autem: pohon (spotřeba a vlastní cena se pamatují pro každý zvlášť), spotřeba, vlastní cena
    $$('#gmFuel button').forEach(b => b.onclick = () => { readCar(); setCarFuel(b.dataset.f); refreshOrigins(); syncFormUI(); paintGroundStale(); });
    ['#gmCons', '#gmPrice'].forEach(s => {
      $(s).oninput = carInfo;
      $(s).onchange = () => { const c = readCar(); $('#gmCons').value = c.carCons; $('#gmPrice').value = c.carPrice ?? ''; carInfo(); refreshOrigins(); syncFormUI(); paintGroundStale(); };
    });
    ['#maxPrice', '#arrivalOn', '#depAfterOn'].forEach(s => $(s).onchange = syncFormUI);
    $('#directOnly').onchange = () => { S.directSmart = false; syncFormUI(); }; // zaškrtnuté ručně – další věta ho nechá
    ['#dFrom', '#dTo'].forEach(s => $(s).onchange = () => { leaveHolidayDays(); syncFormUI(); });
    $('#openJaw').onchange = () => { if (!carMode()) ojPref = $('#openJaw').checked; syncFormUI(); };
    // autem: cena na osobu a parkování závisí na počtu cestujících a délce cesty (okno Cestující posílá 'change' na #adults)
    $('#adults').onchange = () => { syncFormUI(); if (carMode()) refreshOrigins(); };
    $('#paxBtn').onclick = paxSheet;
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
    $('#geoBtn').onclick = () => useMyLocation(p => fromInput.set([...fromInput.items.filter(x => !/\|Moje poloha$/.test(x.id)), p]));
    // napsané, ale nevybrané místo nebo věta: nejdřív je použít (jinak by se hledalo bez nich – „kamkoliv“)
    $('#searchForm').onsubmit = async e => {
      e.preventDefault();
      if ((await fromInput.settle()) === false) return;
      const to = await toInput.settle();
      if (to !== false && to !== 'run') startSearch();
    };
    $('#watchBtn').onclick = () => addWatch();
    $('#formReset').onclick = () => resetSearch();
    // 📅 Hlídat s posouváním termínu mění jen způsob uložení ♡, ne hledání (žádné rozbalení formuláře ani Nedávno)
    $('#rollOn').addEventListener('change', e => { e.stopPropagation(); rollTouched = true; updateWatchBtn(); });
    $('#searchForm').addEventListener('change', formEdited);
    $('#guideLink').onclick = openGuide;
  }
  // Úprava formuláře – i bez události 'change' (čipy míst, Za teplem, letiště, lety cesty přes víc měst).
  function formEdited() {
    // na širší obrazovce je vidět i „sbalený“ formulář – souhrn by popisoval jiné hledání než ♡
    if (!$('#searchSum').hidden) expandForm();
    updateWatchBtn(); renderRecent(); // jiné hledání → zase „♡ Hlídat cenu“
    draftSoon(); // výběr z našeptávače je mimo formulář – jeho události by koncept nezachytily
  }
  // Po hledání změněná cesta na letiště (🏠 vlastní cena, jízdné ×, autem/veřejnou): ceny dopravy ve výsledcích jsou
  // ještě podle předchozího nastavení → nad výsledky „↻ Přepočítat“ (hledání znovu). Zmizí s novým hledáním
  // nebo když se nastavení vrátí.
  function paintGroundStale(clear = false) {
    const host = $('#groundStale'); if (!host) return;
    const stale = !clear && Boolean(lastResult) && !running && SearchHelp.groundChanged(lastResultPayload, groundPayload(getForm()));
    host.innerHTML = stale ? '<div class="note warn ground-stale"><span>🔄</span><div><b>Cesta na letiště je teď nastavená jinak</b> – ceny dopravy a řazení „i s cestou“ ve výsledcích jsou ještě podle předchozího hledání.</div><button type="button" class="btn sm" id="groundRerun">↻ Přepočítat</button></div>' : '';
    if (stale) $('#groundRerun').onclick = () => startSearch();
  }

  // 📍 Moje poloha: put(místo); bez polohy (odmítnutí, chyba) hláška – fail(text) ji ukáže po svém (uvítání nechá čipy)
  function useMyLocation(put, fail = msg => toast(msg, 'err')) {
    if (!navigator.geolocation) return fail('Prohlížeč nepodporuje polohu');
    toast('Zjišťuji polohu…');
    navigator.geolocation.getCurrentPosition(p => put(SearchHelp.myPlace(p.coords.latitude, p.coords.longitude)),
      () => fail('Polohu se nepodařilo zjistit'), { timeout: 10000, maximumAge: 600000 });
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
    // bez domova akce, ne další „Odkud létáš?“ – ptá se jen jedno místo na Přehledu (homeAsk), čip k němu vede
    chip.innerHTML = f.length ? `📍 ${esc(f.map(x => x.label).join(', '))} <span>+${r} km</span>` : '📍 Nastavit domov';
    // domov radaru se mění v radaru na Přehledu (hledání odjinud ho nemění)
    chip.onclick = () => { go('dashboard'); setTimeout(() => homeAsk(Boolean(h)), 60); };
  }
  /**
   * Čip domova nahoře → místo, kde se Přehled ptá, odkud uživatel létá: bez domova pole „Odkud letíš?“ v uvítání
   * (nového uživatele), jinak nastavení domova radaru. Posune k poli a dá do něj kurzor – dřív jen sjel k radaru
   * a pole muselo dostat ještě jedno klepnutí. Změna domova (edit) jen ukáže předvyplněné nastavení, klávesnici neotvírá.
   */
  function homeAsk(edit) {
    const wc = !edit && $('#whatsNew:not([hidden]) .wc-home .pi-input');
    if (!wc) radarSetup(edit);
    const inp = wc || (!edit && $('#radarFrom .pi-input'));
    if (!inp) return $('#radar').scrollIntoView({ behavior: 'smooth', block: 'center' });
    inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    inp.focus({ preventScroll: true });
  }

  /* ---------- hledání ---------- */
  /** Konec hledání pro čtečku obrazovky: cíl (u Kamkoliv počet destinací) a nejnižší cena z hlavičky výsledků, jinak hláška. */
  function sayDone() {
    const h = $('#results .res-head h2'), best = $('#results .res-head b.good'), note = $('#results .note');
    say(h ? `Hledání hotové: ${h.textContent.replace(/\s+/g, ' ').trim()}${best ? `, nejlevněji ${best.textContent} za osobu` : ''}.`
      : note ? note.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : 'Hledání hotové.');
  }
  async function startSearch(opts = {}) {
    const f = getForm();
    nudge = null;
    kidsAsk = Boolean(opts.kids);
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
    S.form = f; if (!S.home || !S.home.from?.length) S.home = { from: f.from, radius: f.radius, adults: Math.min(6, SearchHelp.paxOf({ ...f, adults: +f.adults || 2 }).seats) }; save(); updateHomeChip();
    draftClear(); // hledá se – rozepsaný formulář je teď uložené hledání
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
    // „Nejméně dovolené“ má jen zpáteční let – jinak by výběr ukazoval Doporučené, nadpis dovolenou a řadilo se podle ceny
    if (view.sort === 'leave' && f.trip !== 'return') view.sort = 'best';
    lastDraw = false; // nevykreslené výsledky z minula už na obrazovku nepatří (Lety ukážou průběh tohoto hledání)
    $('#results').innerHTML = ''; $('#results').classList.remove('aged'); paintGroundStale(true);
    const btn = $('#doSearch'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Hledám…';
    say('Hledám nejlevnější lety…'); // čtečka obrazovky: fokus zůstal na tlačítku, průběh se mění pod ním
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
      const paint = () => { renderProgress({ providers: res.providers }, false, res); if (s.shown) rerenderKeep(); else renderResults(); sayDone(); };
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
      const msg = failMsg(e);
      $('#progress').innerHTML = `<div class="note bad kiwi-note">${ico('M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z')}<div>${esc(s.shown ? SearchHelp.partialFail(msg) : msg)}</div>${retryBtn('searchRetry', e.until)}</div>`;
      retryTick($('#searchRetry')); // přetížený server: až po Retry-After (odpočet na tlačítku)
      $('#searchRetry').onclick = () => startSearch();
      say(msg);
      // na telefonu je hláška pod rozbaleným formulářem – posunout k ní, ať chyba není vidět jen jako „nic se nestalo“
      $('#progress').scrollIntoView({ block: 'center' });
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
  // Pohled výpisu k výsledku: přesná data začínají „✈︎ Lety“; kalendář je u jednoho cíle i u Kamkoliv a země, ne u
  // cesty přes víc měst (ta má vlastní výpis po úsecích).
  function fitMode(res) {
    if (legsOk(res) && view.mode === 'list' && legsPref) view.mode = 'legs';
    else if (!legsOk(res) && view.mode === 'legs') view.mode = 'list';
    if (view.mode === 'cal' && res.mode === 'multi') view.mode = 'list';
  }

  /**
   * Plánovač: nejlevnější nabídka posledního dokončeného hledání (bez 🙈 měst) – cíl, dny, cestující, cena a let.
   * Rozpočet i s odhadem dopravy na letiště a do města (jako „Celkem zatím“ v průvodci cestou), cena = letenka.
   */
  function lastPick() {
    const res = lastResult;
    if (!res || !lastResultAt || res.mode === 'multi' || !(res.groups || []).length) return null;
    const shown = prefOn(res) ? prefFor(res, res.groups).groups : res.groups, gs = shown.length ? shown : res.groups;
    const g = gs.reduce((m, x) => x.best.perPersonCzk < m.best.perPersonCzk ? x : m), t = g.best, pax = SearchHelp.paxOf(res.query).seats;
    const leg = l => `${l.from}→${l.to} ${fmtDate(l.date)}${timeOf(l) ? ' ' + timeOf(l) : ''} (${l.carrierName || provName(l.provider)})`;
    return { dest: g.dest.label, iso: g.dest.cc && byIso[g.dest.cc] ? g.dest.cc : null, start: t.out.date, end: t.back ? t.back.date : '', pax, czk: t.perPersonCzk,
      budget: Math.round((t.tripCzk ?? t.perPersonCzk) * pax), budgetNote: 'předvyplněno: letenky a cesta na letiště – bez ubytování a útraty', flight: `${leg(t.out)}${t.back ? `, zpět ${leg(t.back)}` : ''}` };
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
    lastDraw = true; // výpis až na Letech (ageCheck → lastDrawNow)
    // předpověď počasí cílů (Open-Meteo, štítky ve výpisu) až po startu – hotová dřív, než uživatel Lety otevře
    const res = lastResult;
    whenIdle(() => { if (lastDraw && lastResult === res) wxLoad(res); });
  }
  /** fn, až prohlížeč nemá co dělat (start, vykreslení); bez requestIdleCallback (Safari) za chvíli. */
  function whenIdle(fn) {
    if (window.requestIdleCallback) requestIdleCallback(() => fn(), { timeout: 4000 }); else setTimeout(fn, 1500);
  }
  /** Lety se ukázaly: výsledky z minula teď na obrazovku (jednou; nové hledání nebo ↺ Začít znovu je zahodí). */
  function lastDrawNow() {
    if (!lastDraw) return;
    lastDraw = false;
    if (!restored || !lastResult) return;
    renderRestored();
    renderResults();
  }
  /*
   * 📝 Rozepsané hledání: úpravy formuláře, které se ještě nehledaly, přežijí obnovení stránky i Android, který aplikaci
   * na pozadí bez varování zavře (start jinak vrátí formulář na poslední hledání S.form). Ukládá se s odstupem po úpravě
   * a hned, když se aplikace schová; hledání a ↺ Začít znovu koncept smažou. Kdy platí (stáří, minulé termíny, mezitím
   * jiné hledání) – SearchHelp.draftLoad. Při startu se vrací hned po S.form, tedy dřív než odkazy (#offer=, #trip=,
   * #watch=), chytrá věta nebo uvítání nového uživatele – co nastaví ony, platí.
   */
  const DRAFT_LS = 'atlas_draft';
  let draftT = 0; // čekající uložení (setTimeout)
  let draftBase = ''; // otisk S.form, nad kterým se teď upravuje (SearchHelp.formSig)
  let draftKey0 = ''; // formulář toho hledání (SearchHelp.formKey) – úpravy vrácené zpět = žádný koncept
  /** Start: base = otisk S.form spočítaný před setForm (setForm posouvá minulé lety cesty přes víc měst i v S.form). */
  function draftStart(base) {
    draftBase = base; draftKey0 = SearchHelp.formKey(getForm());
    let f = null;
    try {
      const s = localStorage.getItem(DRAFT_LS);
      f = s ? SearchHelp.draftLoad(s, { base, now: Date.now(), today: today() }) : null;
      if (s && !f) localStorage.removeItem(DRAFT_LS); // starý nebo přebitý pozdějším hledáním
    } catch (e) { /* zakázané úložiště */ }
    if (f) setForm(f);
    const form = $('#searchForm');
    ['input', 'change', 'click'].forEach(t => form.addEventListener(t, draftSoon));
    document.addEventListener('visibilitychange', () => { if (document.hidden) draftFlush(); });
    window.addEventListener('pagehide', draftFlush);
  }
  function draftSoon() { clearTimeout(draftT); draftT = setTimeout(draftSave, 700); }
  function draftFlush() { if (draftT) { clearTimeout(draftT); draftSave(); } }
  function draftSave() {
    draftT = 0;
    if (!fromInput) return;
    const f = getForm();
    try {
      if (SearchHelp.formKey(f) === draftKey0) localStorage.removeItem(DRAFT_LS);
      else localStorage.setItem(DRAFT_LS, SearchHelp.draftPack(f, draftBase, Date.now()));
    } catch (e) { /* plné nebo zakázané úložiště – koncept je jen pohodlí navíc */ }
  }
  /** Hledání a ↺ Začít znovu: formulář je teď uložené hledání (S.form) – koncept pryč, další úpravy vznikají nad ním. */
  function draftClear() {
    clearTimeout(draftT); draftT = 0;
    draftBase = SearchHelp.formSig(S.form); draftKey0 = SearchHelp.formKey(getForm());
    try { localStorage.removeItem(DRAFT_LS); } catch (e) { /* zakázané úložiště */ }
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
    if (lastDraw && $('#view-flights.active')) lastDrawNow(); // první otevření Letů: výsledky z minula (stejný krok jako přepnutí – bez probliknutí)
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
    sum.innerHTML = `<div class="ss-txt"><b>${esc(watchLabel(f))}</b><span class="faint">${esc(when + recentSub(f, !when))} · ${esc(SearchHelp.paxShort(f))}</span></div><button type="button" class="btn sm ghost" id="ssWatch" aria-label="Hlídat cenu">♡</button><button type="button" class="btn sm" id="ssEdit">✎ Upravit</button>`;
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
    // rodina s dětmi zůstane rodinou; jinak počet lidí z domova radaru jako dřív
    const kids = S.form && (S.form.children > 0 || S.form.infants > 0) ? SearchHelp.paxOf(S.form) : null;
    setForm({ ...defaultForm(), ...keep, ...(kids ? { adults: kids.adults, children: kids.children, infants: kids.infants } : { adults: S.home?.adults || 2 }) });
    lastResult = null; lastResultAt = 0; lastPayload = null; lastResultPayload = null; restored = false; fromCard = null; lastDraw = false;
    try { localStorage.removeItem(LAST_LS); } catch (e) { /* zakázané úložiště */ }
    $('#results').innerHTML = ''; $('#results').classList.remove('aged'); $('#progress').innerHTML = ''; paintGroundStale(true);
    expandForm();
    S.form = getForm(); save(); draftClear();
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
    // kdo už hledal, nepotřebuje úvodní fotku „Najdi nejlevnější letenky“ – na telefonu by tlačítko hledání odsunula pod lištu
    const v = $('#view-flights'); if (v) v.classList.toggle('fl-back', (S.recent || []).length > 0);
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
    // „za 0,0 s“ = totéž hledání nedávno na serveru (i cizí – výsledek z mezipaměti serveru) – to se neříká v sekundách;
    // „z nedávného hledání“ by v novém prohlížeči mátlo (stáří cen ukazuje „ceny z 14:32“)
    const sec = ms => (ms >= 50 ? ` za ${(ms / 1000).toFixed(1).replace('.', ',')} s` : ' – hned');
    const head = res ? (multi ? `Prohledáno ${plural(res.legs.length, 'let', 'lety', 'letů')}${sec(res.stats.ms)}` : `Prohledáno ${plural(res.origins.length, 'letiště', 'letiště', 'letišť')}${sec(res.stats.ms)}`)
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
  // řazení „i s cestou na letiště“ a doporučené pořadí (počítá s ním): pod cenou letenky i odhad s cestou na letiště
  // a do města
  const tripLine = (t, cls = 'cmp-tkt') => ((view.sort === 'trip' || view.sort === 'best') && t.tripCzk != null && Math.round(t.tripCzk) !== Math.round(t.perPersonCzk)
    ? `<small class="${cls}" title="Letenka + odhad dopravy na letiště a z letiště do města na osobu – ${view.sort === 'trip' ? 'podle toho se teď řadí' : 'doporučené pořadí s ním počítá'}">i s cestou ~${czk(t.tripCzk)}</small>` : '');
  // Doporučené pořadí (rank.js): kontext jednou na výsledek – srovnávací cenu každé nabídky si pamatuje (řazení ji volá
  // při každém porovnání). Úroveň ceny i u cest složených v prohlížeči (levelFor).
  let rankFor = null, rankC = null;
  const rankCtx = (res = lastResult) => { if (res !== rankFor) { rankFor = res; rankC = Rank.ctxOf(res, { level: levelFor }); } return rankC; };
  const rankOf = t => Rank.score(t, rankCtx());
  // ✓ proč je cíl v doporučeném pořadí výš než levnější letenka (klíč cíle → { text, title }) – jen prvních 10 cílů
  let whyNow = new Map();
  const whyItem = g => {
    const t = g.vis[0], alt = g.vis.reduce((a, b) => (b.perPersonCzk < a.perPersonCzk ? b : a));
    return { t, sc: rankOf(t), label: g.dest.label, cc: g.dest.cc, minTrip: Math.min(...g.vis.map(x => x.tripCzk ?? x.perPersonCzk)), ...(alt !== t ? { alt: { t: alt, sc: rankOf(alt) } } : {}) };
  };
  const whyChip = (g, cls) => { const w = whyNow.get(g.dest.key); return w ? `<span class="${cls}" title="${esc(w.title)}">✓ ${esc(w.text)}</span>` : ''; };
  function sortKey(t, g) {
    switch (view.sort) {
      // srovnávací cena: s cestou na letiště, časy, délkou pobytu a výhodností (rank.js)
      case 'best': return rankOf(t).czk;
      // i s odhadem dopravy na letiště a z letiště do města (cena nabídky je jen letenka)
      case 'trip': return t.tripCzk ?? t.perPersonCzk;
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
    whyNow = new Map();
    if (view.sort !== 'best') return pf.groups;
    // doporučené: pestrost (další cíl ze stejné země o kus níž) a ✓ proč výš než levnější letenka
    const gs = Rank.order(pf.groups, g => sortKey(g.vis[0], g), g => g.dest.cc);
    for (const [i, w] of Rank.reasons(gs.map(whyItem), 10)) whyNow.set(gs[i].dest.key, w);
    return gs;
  }

  // Přesná data ke konkrétnímu cíli → pohled „✈︎ Lety“ (jednotlivé lety tam a zpět).
  const legsOk = res => Boolean(res && res.mode === 'route' && res.query.exact);
  let pricedNow = null; // přímé lety s cenou ve výsledcích (v „dalších letech tento den“ se neopakují)
  let filledNow = []; // přesná data: cesty složené ze samostatných letenek, aby filtry času a přestupů neschovaly vyhovující lety
  let kiwiTimer = 0;
  // autem tam i zpět: složená cesta platí i parkování na celou cestu (jako server) a vrací se na letiště, kde auto stojí
  const legOpts = res => ({
    adults: SearchHelp.paxOf(res.query).seats, openJaw: res.query.openJaw, keep: t => visibleTrips([t]).length > 0, // celkem za sedadla
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
    return `<span title="${esc(tip)}">${car ? '🚗' : '🚆'} ${what} ~${czk(t.groundCzk)}/os.</span>`;
  }
  /** Pohon a cena u cesty autem ve výsledku (položka paliva u letišť odletu), jinak null (dřívější Kč/km). */
  const resFuel = res => (res && res.origins || []).map(o => SearchHelp.fuelItem(o.ground)).find(Boolean) || null;
  /** Patička výsledků: jak se počítá doprava na letiště. */
  function groundFoot(res, multi = false) {
    const q = res.query;
    if (!q.kmRate) return 'doprava na letiště se neukazuje (vypnuto v Další možnosti)';
    if (res.origins && res.origins.length && !res.origins.some(o => o && o.ground)) return 'doprava na letiště se neukazuje (odkud je celá země – není odkud ji počítat)';
    const where = multi ? 'na letiště na začátku cesty a z letiště domů' : 'na letiště a zpět';
    if (q.groundMode === 'car') {
      const e = resFuel(res), fuel = e && e.fuel === 'ev' ? 'nabíjení' : 'palivo';
      const how = e ? `${SearchHelp.energyTxt(e)} tam i zpět – ${e.priceLabel}`
        : q.carKmCzk ? `palivo ${String(q.carKmCzk).replace('.', ',')} Kč/km tam i zpět` : 'palivo tam i zpět';
      return `cesta autem ${where} je odhad (${how}; parkování u letiště podle délky cesty a dálniční známky v cizině, vše děleno počtem cestujících; ${multi
        ? `nejlevnější kombinace se vrací na letiště, kde auto parkuje; bez návratu domů = odvoz – ${fuel} tam i zpět, bez parkování`
        : `zpět jen na letiště, kde auto stojí; autem jen tam = odvoz – ${fuel} tam i zpět, bez parkování`})`;
    }
    const own = (res.origins || []).filter(o => o.ground && o.ground.own).map(o => o.iata);
    return `doprava ${where} veřejnou dopravou je odhad (jízdenka vlak/bus do města letiště za běžnou cenu podle vzdálenosti a živých cen RegioJetu + MHD nebo vlak na letiště, případně přímý bus až na letiště s příplatkem za mezinárodní spoj${q.kmRate !== 1 ? `; odhad jízdného × ${String(q.kmRate).replace('.', ',')}` : ''}${own.length ? `; ${own.join(', ')} – vlastní cena z 🏠 Kolik tě stojí cesta na letiště${q.kmRate !== 1 ? ', bez násobku' : ''}` : ''})`;
  }
  /* ---------- cesta z letiště do města (server/lib/arrival.js; tabulka ověřená 10/2026, jinde odhad) ---------- */
  /** Štítky u nabídky – „🚌 z letiště BVA do Paříže 17,90 € (~440 Kč) · 1 h 15“, drahé nebo dlouhé varovně. */
  // nbsp (u náhledu cíle níž): štítek se na úzkém telefonu láme na dva řádky – „1“ / „h 15“ ani „~460“ / „Kč)“ ne
  const arrChipHtml = c => `<span class="b arrv${c.warn ? ' warn' : ''}" title="${esc(c.title)}">${nbsp(esc(c.text))}</span>`;
  const arrivalChips = (t, res = lastResult) => (res ? SearchHelp.arrivalChips(t, res.arrivals, { on: Boolean(res.query.arrival) }) : []).map(arrChipHtml);
  /** Popisek „+ z letiště do města a zpět ~880 Kč/os.“ u ceny nabídky (jen když je v ceně) s rozpisem v title. */
  function arrivalPart(t, res = lastResult) {
    if (!t.arrCzk || !res) return '';
    const tip = SearchHelp.arrivalChips(t, res.arrivals, { on: true }).map(c => c.title).join(' ');
    return `<span title="${esc(tip)}">🚌 z letiště do města${t.back ? ' a zpět' : ''} ~${czk(t.arrCzk)}/os.</span>`;
  }
  /**
   * Doprava na letiště a z letiště do města pod cenou nabídky: jen pro představu (průměrná cena, odhad) – do ceny
   * letenky ani pořadí se nepočítá (Peter: odhady bývají nepřesné). Bez obou nic.
   */
  function extrasHtml(t, res = lastResult) {
    const parts = [groundPart(t, res), arrivalPart(t, res)].filter(Boolean);
    return parts.length ? `<div class="pd px">${parts.join(' · ')}<span class="px-n">průměrná cena, odhad – v ceně letenky není</span></div>` : '';
  }
  /** Patička výsledků: je cesta z letiště do města v ceně? */
  // nejstarší datum ověření jízdného mezi letišti výsledku („10/2026 · před 8 měsíci – mohlo se změnit“)
  const arrivalChecked = res => {
    const d = Object.values(res.arrivals || {}).filter(a => a && a.basis === 'table' && /^\d{4}-\d{2}/.test(a.date || '')).map(a => a.date).sort()[0];
    return d ? ` ${+d.slice(5, 7)}/${d.slice(0, 4)}${SearchHelp.dataAge(d).txt}` : '';
  };
  const arrivalFoot = (res, multi = false) => (res.query.arrival
    ? `cesta z letiště ${multi ? 'do měst na cestě a z nich zpět na letiště' : 'do města a zpět na letiště'}: jízdné letištního busu, vlaku nebo metra ${arrivalChecked(res) ? `ověřené${arrivalChecked(res)}` : 'z ověřené tabulky'}, jinde odhad`
    : 'cesta z letiště do města se neukazuje (vypnuto v Další možnosti)');
  /**
   * „🛫 Odkud se vyplatí letět“: nejlevnější letenky z každého letiště (ze všech nalezených nabídek, server o.best)
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
    const head = `🛫 <b>Odkud se vyplatí letět${oc.filtered ? ' (podle filtrů výpisu)' : ''}:</b> `, pp = '/os.';
    // zpáteční s návratem na jiné letiště se k letištím nepočítá – když je levnější, souhrn to řekne (ve výpisu je)
    const jaw = oc.jaw != null && oc.jaw < win.czk ? ` · s návratem na jiné letiště už od <b>${czk(oc.jaw)}</b>` : '';
    // základ = nejbližší letiště s nabídkou odsud a zpět; nejbližší vůbec být nemusí (to má třeba jen návraty jinam)
    const refTxt = r => (r.nearest ? `nejbližšího <b>${esc(r.iata)}</b>` : `<b>${esc(r.iata)}</b> (nejbližší letiště s nabídkou)`);
    // jiná cena dopravy na letiště na osobu (tam i zpět, autem s parkováním) – úspora letenky ji může smazat
    const dop = r => (!r.extraCzk || Math.abs(r.extraCzk) < 10 ? '' : `, doprava o ~${czk(Math.round(Math.abs(r.extraCzk) / 10) * 10)} ${r.extraCzk > 0 ? 'dráž' : 'levnější'}${r.extraCzk > 0 && r.diff + r.extraCzk >= 0 ? ' – s ní se to nevyplatí' : ''}`);
    const sum = win.ref ? `${head}nejlevněji z ${refTxt(win)} od <b>${czk(win.czk)}</b>${pp} – jiná letiště nejsou levnější${jaw}`
      : `${head}nejlevněji z <b>${esc(win.iata)}</b>${win.city !== win.iata ? ` (${esc(win.city)})` : ''} od <b>${czk(win.czk)}</b>${pp} – o ${czk(-win.diff)} méně než z ${refTxt(ref).replace(/<\/?b>/g, '')}${dop(win)}${win.extraMin > 0 ? `, cesta o ~${hm(win.extraMin)} déle${ret ? ' (tam i zpět)' : ''}` : win.extraMin < 0 ? `, a cesta je ještě kratší` : ''}${jaw}`;
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
    // 📅 Kalendář u jednoho cíle ze serveru, u Kamkoliv a země z načtených nabídek (destCalHtml)
    const modes = [...(exactRoute ? [['legs', '✈︎ Lety']] : []), ['list', exactRoute ? '☰ Kombinace' : isRoute ? '☰ Seznam' : '≡ Přehled'], ...(!isRoute ? [['cards', '☰ Karty']] : []), ['map', '🗺️ Mapa'], ['cal', '📅 Kalendář']];
    // telefon: filtry, řazení a „Odkud se vyplatí letět“ za jedním tlačítkem – výsledky hned pod hlavičkou (na počítači
    // vidět vždy); otevřené zůstane i po překreslení, otevřený panel času a přestupů ho drží otevřené. Poznámka o pořadí
    // pod filtry krátce (rozpis doporučeného pořadí jen v title – na telefonu to bylo 6–7 řádků drobného písma)
    // Mapa a Kalendář bez poznámek „♡ Hlídat cenu“ a vlak/bus (jsou v Seznamu) – na telefonu jinak mapa začínala až pod
    // nimi kolem 600 px a na první obrazovce z ní nebylo skoro nic
    const moreOpen = Boolean(view.moreOpen || view.timeOpen), nMore = chips.length + (view.sort !== 'best' ? 1 : 0);
    const summary = kiwiBanner(res) + `<div class="res-head">
      <div><h2>${isRoute ? `✈️ ${destTxt}${res.partial ? ' <span class="part-tag">⏳ zatím část nabídek</span>' : ''}` : `🌍 ${res.partial ? 'Zatím ' : ''}${groups.length < res.groups.length ? `${groups.length} ${zeN(res.groups.length)} ${res.groups.length} destinací` : plural(res.groups.length, 'destinace', 'destinace', 'destinací')} ${res.destination.kind === 'countries' ? '· ' + destTxt : ''}`}</h2>
      <div class="muted" style="font-size:13px">z ${res.origins.map(o => `<b>${o.iata}</b>`).join(', ')} · ${whenTxt(res.query)} · ${esc(SearchHelp.paxShort(res.query))}${BAG_LBL[res.query.bags] ? ` · 🧳 vč. ${res.query.bags === 'cabin' ? 'kabinového kufru' : 'kufru k odbavení'}` : ''}
      ${best ? ` · nejlevněji <b class="good">${czk(best.perPersonCzk)}</b>/os.` : ''}<span id="pinHead">${pinNow.n ? ` · <button type="button" class="linkbtn pin-open" id="pinOpen">📌 Odložené (${pinNow.n})</button>` : ''}</span></div></div>
      <div class="res-tools">
        <button type="button" class="btn sm ghost res-more-btn" id="resMoreBtn" aria-expanded="${moreOpen}" aria-controls="resMore" title="Filtry, řazení a srovnání letišť">⚙️ Filtry${nMore ? ` <b class="tf-n">${nMore}</b>` : ''} <span aria-hidden="true">${moreOpen ? '▴' : '▾'}</span></button>
        <div class="seg" id="viewSeg">${modes.map(v => { const [ic, ...w] = v[1].split(' '); return `<button type="button" data-v="${v[0]}" class="${view.mode === v[0] ? 'on' : ''}"><span class="vs-ic">${ic} </span>${w.join(' ')}</button>`; }).join('')}</div>
      </div></div>
      ${kidsHtml()}${view.mode === 'map' || view.mode === 'cal' ? '' : nudgeHtml() + groundBanner(res)}
      ${filterChips(chips)}
      <div class="res-more${moreOpen ? ' open' : ''}" id="resMore">
      <div class="res-filters">
        <div class="rf-group rf-sort"><span class="faint">Řazení:</span><select id="sortSel" title="Řazení" aria-label="Řazení">
          ${[['best', 'Doporučené (i s cestou na letiště, časy, výhodnost)'], ['total', `Nejlevnější letenka${BAG_LBL[res.query.bags] ? ' (vč. zavazadel)' : ''}`], ['trip', 'Nejlevnější i s cestou na letiště (odhad)'], ['fast', 'Cena + délka cesty'], ['deal', 'Nejvýhodnější vůči běžné ceně'], ['season', 'Cena + ideální sezóna'], ['warm', 'Nejtepleji'], ['date', 'Nejdřívější odlet'], ...(res.query.trip === 'return' ? [['leave', 'Nejméně dovolené']] : []), ['near', 'Nejblíž'], ['far', 'Nejdál']].map(o => `<option value="${o[0]}" ${view.sort === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>
        <div class="rf-group"><span class="faint">Letiště:</span>${res.origins.map(o => { const l = SearchHelp.accessLabel(o.ground, { nights: resNights(res) }); return `<button type="button" class="fchip ${view.excludeOrigins.has(o.iata) ? '' : 'on'}" data-fo="${o.iata}" title="${esc((o.name || '') + (o.hub ? ` – velké přestupní letiště pro dálkové lety (${o.distKm} km – cesta na letiště je u nabídek zvlášť)` : '') + (l ? ` · ${l.title}` : ''))}">${o.hub ? '✈︎ ' : ''}${o.iata}${o.ground && o.ground.czk ? ` <small>${o.ground.mode === 'car' ? `🚗+${Math.round(SearchHelp.carTrip(o.ground, resNights(res)).perPerson / 10) * 10}` : `${o.ground.own ? '🏠' : ''}+${o.ground.czk}`}</small>` : ''}</button>`; }).join('')}</div>
        ${usedProviders.length > 1 ? `<div class="rf-group"><span class="faint">Aerolinky:</span>${usedProviders.map(p => `<button type="button" class="fchip ${view.excludeCarriers.has(p) ? '' : 'on'}" data-fc="${p}"><i style="background:${provColor(p)}"></i>${esc(provName(p))}</button>`).join('')}</div>` : ''}
        <div class="rf-group rf-price"><span class="faint">Max.</span><input type="range" id="fPrice" aria-label="Nejvyšší cena za osobu" min="0" max="${Math.ceil(maxP / 100) * 100}" step="100" value="${view.maxPrice || Math.ceil(maxP / 100) * 100}"><b id="fPriceVal">${view.maxPrice ? czk(view.maxPrice) : 'bez limitu'}</b></div>
        <button type="button" class="fchip ${view.onlyDeals ? 'on' : ''}" id="fDeals" title="Jen nabídky s 🔥 Super cenou nebo 💚 Dobrou cenou">🔥 jen výhodné</button>
        ${nsplit && (view.newOnly || (nsplit.hidden && nsplit.keep)) ? `<button type="button" class="fchip ${view.newOnly ? 'on' : ''}" id="fNew" aria-pressed="${view.newOnly}" title="Jen země, které ještě nemáš na mapě navštívených (máš tam ${(S.visited || []).length} ${(S.visited || []).length <= 4 ? 'země' : 'zemí'}; domovská země se počítá jako navštívená)">🆕 jen nové země</button>` : ''}
        ${prefNow.favIn && (view.favOnly || prefNow.favIn < groups.length) ? `<button type="button" class="fchip ${view.favOnly ? 'on' : ''}" id="fFav" aria-pressed="${view.favOnly}" title="Jen města, která máš v ⭐ Moje cíle (ve výsledcích ${prefNow.favIn})">⭐ jen moje cíle</button>` : ''}
        ${prefNow.mutedIn && !view.favOnly ? `<button type="button" class="fchip mute-chip" id="fMute" aria-pressed="${view.showMuted}" title="Města, která máš v 🙈 Nezajímá mě – v Kamkoliv a v radaru se neukazují (seznam upravíš přes ⋯ u cíle → Upravit seznamy)">🙈 ${view.showMuted ? `ukázáno ${prefNow.mutedIn} · skrýt` : `skryto ${prefNow.muted} · ukázat`}</button>` : ''}
        <button type="button" class="fchip tf-toggle ${nTime ? 'on' : ''}" id="fTime" aria-expanded="${view.timeOpen}" aria-controls="tfPanel">🕐 Čas a přestupy${nTime ? ` <b class="tf-n">${nTime}</b>` : ''} <span aria-hidden="true">${view.timeOpen ? '▴' : '▾'}</span></button>
      </div>
      ${view.timeOpen ? timePanel(res, SearchHelp.timeStats(base), th) : ''}
      ${originCard(res)}
      <div class="faint rank-note"${view.sort === 'best' ? ' title="Doporučené počítá s cenou i s cestou na letiště a do města, časem na cestě, nočními odjezdy, tím, kolik zbude času na místě, a cenou pod obvyklou; další cíl ze stejné země dá o kus níž."' : ''}>Pořadí určuje jen zvolené řazení – žádná aerolinka ani partner si za lepší pozici neplatí.${view.sort === 'best' ? ' Doporučené počítá i s cestou na letiště a do města a s časy letů; proč je cíl výš, řekne ✓ u nabídky.' : ''}${health?.affiliate ? ' Odkazy na Aviasales jsou partnerské (affiliate, <span class="ad-tag">reklama</span>): při nákupu přes ně může ATLAS dostat provizi, cenu to pro tebe nemění.' : ''}</div>
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
    // Kamkoliv a země: kalendář ze všech cílů výpisu (bez vybraného dne – computeGroups počítá i čipy 🆕/⭐/🙈, ty zůstanou
    // podle výpisu), pod ním cíle s odletem ve vybraný den (klepnutí na den znovu nebo ✕ = všechny)
    else if (view.mode === 'cal') {
      const keep = [newHiddenNow, prefNow], vis = view.outDate ? anyDay(() => computeGroups()) : groups;
      [newHiddenNow, prefNow] = keep;
      body = destCalHtml(res, vis) + `<div class="section-head dc-head"><h2>${view.outDate ? `Cíle s odletem ${dayLabel(view.outDate)}` : 'Všechny cíle'}</h2>${view.outDate ? '<button type="button" class="linkbtn" data-af="outDate">✕ zrušit den</button>' : ''}</div>`
        + (groups.length ? compactList(groups, { strip: false }) : `<div class="empty">${view.outDate ? 'Pro tento den odletu nic neodpovídá filtrům – vyber jiný den v kalendáři.' : 'Filtrům nic neodpovídá.'}</div>`);
    }
    // cíle hledání do víc míst („k moři v prosinci“): s filtrem tepla nebo řazením „Nejtepleji“ i teplota (dlouhodobý
    // průměr, podle kterého se řadí) – jinak nebylo vidět, proč je který cíl první
    else body = isRoute ? (groups.length > 1 ? `<div class="dest-mini">${groups.map(g => `<span class="chip">${flag(g.dest.cc)} ${esc(g.dest.label)} od <b>${czk(g.vis[0].perPersonCzk)}</b>${(view.sort === 'warm' || res.query?.minTemp) && g.vis[0].tempHi != null ? ` · 🌡️ ${Math.round(g.vis[0].tempHi)}\u00a0°C` : ''}</span>`).join('')}</div>` : '') + directHintHtml(flat, pre) + flatList(flat)
      : view.mode === 'cards' ? groups.map(g => groupCard(g)).join('') : compactList(groups);
    // konkrétní cíl: výpis je z res.top (flat), ne z 6 nabídek skupiny – podle něj, jinak hláška pod nalezenými lety
    if (!body.trim() || ((view.mode === 'list' || view.mode === 'cards') && !(isRoute ? flat.length : groups.length))) body += `<div class="empty">Filtrům nic neodpovídá. Uvolni filtr ceny, letišť, aerolinek, nových zemí${view.favOnly ? ', mých cílů' : ''} nebo času a přestupů${prefNow.muted ? ' – nebo ukaž 🙈 skryté cíle' : ''}.</div>`;
    // Málo výsledků: ze serveru (thin), nebo je skryly filtry času a přestupů – pak nabídnout hlavně jejich zrušení.
    const thinVis = !res.partial && th.any > 0 && (isRoute ? flat.length : groups.length) < 3;
    if (thin || thinVis) body += smartHelp(res, false, { chips: chips.filter(c => c.time), any: th.any, onlyClear: !thin });
    // patička: co cena je, vidět hned; z čeho je odhad dopravy, kurz a teplota až po rozbalení (na telefonu 16–20 řádků)
    host.innerHTML = summary + body + `<div class="res-foot faint">Ceny jsou za letenky na osobu ${bagFoot(res.query.bags)}. Doprava na letiště a z letiště do města je u nabídek zvlášť – do ceny se nepočítá.${footMore(`Doprava je jen pro představu (průměrná cena)${view.sort === 'trip' ? ' a počítá se jen do řazení „i s cestou na letiště“' : view.sort === 'best' ? ' a počítá se jen do doporučeného pořadí' : view.sort === 'fast' ? ' a počítá se jen do řazení „Cena + délka cesty“' : ' a nepočítá se ani do pořadí'}: ${esc(groundFoot(res))}; ${esc(arrivalFoot(res))}. Živé ceny (Ryanair, Wizz Air) se mohou do rezervace změnit; ceny „z cache“ ověř. Kurz: ${fxFoot(res)}. 🌡️ Teplota u cíle je dlouhodobý průměr denních maxim v měsíci odletu (meteostanice u letiště, průměr 1991–2020; kde stanice není, NASA POWER 2001–2020) – ne předpověď počasí; u cest do 15 dní je u nabídky předpověď Open-Meteo.`)}</div>`;
    wireResults();
    if (window.Photos) Photos.paint(host); // fotky měst v řádcích výsledků (jen viditelné)
    wxFill();
    wireHelp(host);
    if (view.gndOpen) showGround(true, false);
    if (view.mode === 'map') drawResultMap(groups);
  }

  // ✈️ Nejlevnější nabídky jsou s přestupem, ale přímý let tam i zpět mezi nalezenými je – za kolik (jedním klepnutím „Jen přímé“).
  function directHintHtml(flat, pre) {
    const d = !lastResult?.partial && SearchHelp.directHint(flat, pre, view.time);
    if (!d) return '';
    return `<div class="direct-hint"><span>✈️ Bez přestupu od <b>${czk(d.czk)}</b>/os.${d.more ? ` <small>(o ${czk(d.more)} víc · z ${esc(d.from)})</small>` : ` <small>(z ${esc(d.from)})</small>`}</span><button type="button" class="btn sm" data-tst="0">Jen přímé</button></div>`;
  }

  // Rozpis v patičce výsledků (zdroje odhadů, kurz) – sbalený pod „Jak počítám ▾“; vidět zůstane jen, co cena je.
  function footMore(html) { return ` <details class="foot-more"><summary>Jak počítám</summary>${html}</details>`; }
  function fxFoot(res) { return res.fx ? `1 EUR = ${res.fx.eurCzk.toFixed(2).replace('.', ',')} Kč (${esc(res.fx.source)})` : '—'; }
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
      // vízum, povinný formulář před příletem a ETA při přestupu (entry.js, .ec-b, .ec-warn) se neschovávají – musí je vidět každý
      const kids = [...b.children].filter(c => !c.classList.contains('wx-slot') && !c.classList.contains('b-more') && !c.classList.contains('ec-b') && !c.classList.contains('ec-warn'));
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

  // Dvojice složená v prohlížeči (SearchHelp.composeTrip – bez bookUrl) ze dvou letů Ryanair/Wizz Air zpět stejnou
  // trasou v téže měně: jako server (search.js roundTripUrl) jeden odkaz na zpáteční let – cena stejná, platí se jednou
  const sameRound = t => (!t.bookUrl && t.back && (t.out.siteCur || '') === (t.back.siteCur || '') ? SearchHelp.roundBookUrl(t) : null);
  function bookButtons(t) {
    const btn = (url, label, prov) => url ? `<a class="btn sm book" style="--pc:${provColor(prov)}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${label}</a>` : `<span class="btn sm ghost" title="Demo data nemají rezervační odkaz" style="opacity:.55">${label}</span>`;
    if (t.bookUrl) return btn(t.bookUrl, `Koupit ${t.provider === 'travelpayouts' ? 'na Aviasales' : 'u ' + esc(shopName(t.provider))} ↗`, t.provider);
    const rt = sameRound(t);
    if (rt) return btn(rt, `Koupit u ${esc(shopName(t.out.provider))} ↗`, t.out.provider);
    if (!t.back) return btn(t.out.bookUrl, `Koupit u ${esc(shopName(t.out.provider))} ↗`, t.out.provider);
    return btn(t.out.bookUrl, `Tam: ${esc(shopName(t.out.provider))} ↗`, t.out.provider) + btn(t.back.bookUrl, `Zpět: ${esc(shopName(t.back.provider))} ↗`, t.back.provider);
  }

  // Ryanair a Wizz Air účtují v měně země odletu: let zpět z Itálie ukážou v eurech, i když je web česky – říct předem
  // a kolik to v té měně bude (cena letenky na osobu, jak ji dopravce poslal)
  const curFmt = (n, cur) => { try { return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: cur, maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n); } catch (e) { return `${Math.round(n)} ${cur}`; } };
  // Aviasales korunovou verzi nemá – odkaz otevře eura (currency=eur, bez měny by byly dolary)
  function buyNote(t) {
    const eur = lastResult && lastResult.fx && lastResult.fx.eurCzk, tp = l => l && l.provider === 'travelpayouts';
    const inEur = czk => (eur > 0 && czk > 0 ? ` – ~${esc(curFmt(czk / eur, 'EUR'))}/os.` : '');
    const foreign = l => Boolean(l && /^[A-Z]{3}$/.test(l.siteCur || '') && l.siteCur !== 'CZK');
    if (t.bookUrl || sameRound(t)) {
      if (tp(t.out)) return `<div class="buy-cur faint">💱 Aviasales ukáže cenu v eurech${inEur(t.flightCzk)} (v korunách web neumí)</div>`;
      // zpáteční v jedné rezervaci (search.js roundTripUrl): oba lety v téže cizí měně – z Vídně tam i zpět eura
      const o = t.out, b = t.back, cur = o && o.siteCur;
      if (!b || b.provider !== o.provider || !foreign(o) || b.siteCur !== cur) return '';
      const sum = o.sitePrice > 0 && b.sitePrice > 0 ? ` – ~${esc(curFmt(o.sitePrice + b.sitePrice, cur))}/os. tam i zpět` : '';
      return `<div class="buy-cur faint">💱 ${esc(shopName(o.provider))} ukáže cenu v ${esc(cur)}${sum} (aerolinka účtuje v měně země odletu)</div>`;
    }
    const legs = [['tam', t.out], ['zpět', t.back]].filter(([, l]) => l && l.bookUrl && (tp(l) || foreign(l)));
    if (!legs.length) return '';
    // dvě rezervace, aby cena seděla; jedna (zpět v měně letu tam) jako volba – aerolinka let zpět přepočte svým kurzem
    const one = SearchHelp.roundBookUrl(t), cur1 = t.out.siteCur === 'CZK' ? 'Kč' : t.out.siteCur;
    const oneTxt = one && cur1 ? `<br>Obojí v jedné rezervaci: <a href="${esc(safeUrl(one))}" target="_blank" rel="noopener">${esc(shopName(t.out.provider))} ↗</a> – celé v ${esc(cur1)}, let zpět ale aerolinka přepočte svým kurzem (bývá o pár % dráž)` : '';
    return `<div class="buy-cur faint">💱 ${legs.map(([d, l]) => `${t.back ? `Let ${d}: ` : ''}${tp(l) ? `Aviasales ukáže cenu v eurech${inEur(l.czk)} (v korunách web neumí)`
      : `${esc(shopName(l.provider))} ukáže cenu v ${esc(l.siteCur)}${l.sitePrice > 0 ? ` – ~${esc(curFmt(l.sitePrice, l.siteCur))}/os.` : ''} (aerolinka účtuje v měně země odletu)`}`).join(' · ')}${oneTxt}</div>`;
  }

  // S dětmi pod tlačítky Koupit: u kterého prodejce jsou děti a miminka v odkazu (Ryanair, Wizz Air) a kde je přidat na
  // webu (Kiwi.com, Aviasales a Ověřit – adresu s dětmi u nich ověřenou nemáme). q = dotaz nabídky, provs = zdroje odkazů.
  function kidsNote(q, provs) {
    const txt = SearchHelp.kidsBuyNote(q, provs, id => (id === 'travelpayouts' ? 'Aviasales' : shopName(id)));
    return txt ? `<div class="buy-cur faint pax-buy">👶 ${esc(txt)}. Ověřit (Google, Skyscanner) hledá jen dospělé.</div>` : '';
  }
  const buyProvs = t => (t.bookUrl ? [t.provider] : [t.out, t.back].filter(l => l && l.bookUrl).map(l => l.provider));

  // pax = počet dospělých nabídky (📌 Porovnat jde otevřít i bez výsledků na obrazovce); děti Google Flights ani
  // Skyscanner v adrese nedostanou (zápis ověřený nemáme) – říká to kidsNote
  function verifyLinks(t, pax = lastResult.query.adults) {
    const sameAp = t.back && t.back.from === t.out.to && t.back.to === t.out.from;
    const gq = (a, b, d1, d2) => `https://www.google.com/travel/flights?hl=cs&curr=CZK&q=${enc(d2 ? `Flights to ${b} from ${a} on ${d1} through ${d2}` : `Flights from ${a} to ${b} on ${d1} one way`)}`;
    const sk = (a, b, d1, d2) => `https://www.skyscanner.cz/transport/flights/${a.toLowerCase()}/${b.toLowerCase()}/${yymmdd(d1)}/${d2 ? yymmdd(d2) + '/' : ''}?adults=${pax}&rtn=${d2 ? 1 : 0}`;
    if (!t.back || sameAp) {
      const d2 = t.back ? t.back.date : null;
      return `<a href="${gq(t.out.from, t.out.to, t.out.date, d2)}" target="_blank" rel="noopener">Google Flights</a> · <a href="${sk(t.out.from, t.out.to, t.out.date, d2)}" target="_blank" rel="noopener">Skyscanner</a>`;
    }
    return `<a href="${gq(t.out.from, t.out.to, t.out.date)}" target="_blank" rel="noopener">tam (Google)</a> · <a href="${gq(t.back.from, t.back.to, t.back.date)}" target="_blank" rel="noopener">zpět (Google)</a>`;
  }

  // res = výsledek, ze kterého nabídka je (📌 Porovnat: složený z odložené nabídky – pinRes); idx = řádek výpisu, jinak null
  // ex = false: bez dopravy na letiště a do města pod cenou (📌 Porovnat ji má v řádku „Celkem i s cestou“)
  function priceBox(t, idx, res = lastResult, ex = true) {
    const q = res.query, note = SearchHelp.paxNote(q);
    return `<div class="pbox"><div class="pp">${czk(t.perPersonCzk)}</div><div class="pl">${t.back ? 'letenky tam i zpět' : 'letenka'} na osobu</div>${tripLine(t, 'pd pt')}
      ${t.bagCzk ? `<div class="pd">letenky ${czk(t.flightCzk)} + <span title="Odhad příplatku za ${BAG_LBL[res.query.bags] || 'zavazadlo'}${t.bagEst ? ' – hrubý, dopravce se nepodařilo ověřit' : ' – typická cena u dopravce'}">zavazadla ~${czk(t.bagCzk)}</span></div>` : ''}
      ${SearchHelp.paxTotalOn(q) ? `<div class="pd">${SearchHelp.paxTotalLbl(q)}: <b>${czk(t.totalCzk)}</b></div>` : ''}
      ${note ? `<div class="pd pax-note">👶 ${esc(note)}</div>` : ''}
      ${ex ? extrasHtml(t, res) : ''}
      ${idx != null && levelFor(t) ? `<button type="button" class="linkbtn pc-ask" data-pc="${idx}">Je to dobrá cena?</button>` : ''}</div>`;
  }

  function tripRow(t, g, idx) {
    return `<div class="trip-row" data-tid="${esc(t.id)}">
      <div class="tr-legs">${legHtml(t.out)}${t.back ? legHtml(t.back, true) : ''}<div class="tr-badges">${badges(t, g, idx)}</div>${scalSlot(t, idx)}</div>
      ${priceBox(t, idx)}
      <div class="tr-act"><button type="button" class="btn sm primary" data-pick="${idx}">Vybrat a pokračovat →</button>
        <div class="tr-buy">${bookButtons(t)}</div>${buyNote(t)}${kidsNote(lastResult.query, buyProvs(t))}
        <div class="tr-more"><span class="faint">Ověřit:</span> ${verifyLinks(t)}${SearchHelp.isCached(t) ? ` · <button type="button" class="linkbtn" data-live="${idx}">⚡ Ověřit cenu živě</button>` : ''}${g && byIso[g.dest.cc] ? ` · <button type="button" class="linkbtn" data-country="${g.dest.cc}">Info o zemi</button>${window.Entry && Entry.idNote(g.dest.cc) ? ' · ' + Entry.idNote(g.dest.cc) : ''}` : ''} · <button type="button" class="linkbtn pin-l" data-pin="${idx}">${pinOn(t) ? '📌 Odloženo ✓' : '📌 Odložit'}</button> · <button type="button" class="linkbtn" data-oshare="${idx}" title="Poslat odkaz na tuhle nabídku">📤 Sdílet</button></div>
      </div></div>`;
  }

  /* ---------- 📅 termín nabídky v kalendáři (SearchHelp.spanCal) ---------- */
  // Kalendáře otevřené u nabídek výpisu (t.id) – po překreslení výpisu (filtr, řazení, nové ceny) zůstanou otevřené.
  const scalOpen = new Set();
  const scalBtn = (on, attr) => `<button type="button" class="scal-btn" ${attr} aria-expanded="${on}">📅 V kalendáři <span aria-hidden="true">${on ? '▴' : '▾'}</span></button>`;
  /** Tlačítko pod lety nabídky výpisu a pod ním kalendář, když ho uživatel otevřel. */
  const scalSlot = (t, idx) => { const on = scalOpen.has(t.id); return `<div class="scal-slot">${scalBtn(on, `data-scal="${idx}"`)}${on ? scalHtml(t.out, t.back, { nights: t.nights, ics: `data-scalics="${idx}"`, dest: scalDest(t) }) : ''}</div>`; };
  const scalDest = t => { const g = shownRes && (shownRes.groups || []).find(x => x.dest.key === t.destKey); return g ? g.dest.label : t.out.to; };
  /**
   * Kalendář termínu cesty: lety out (a back) { date, dep, arr, hasTime, from, to } → měsíc(e) s dnem odletu, nocemi
   * na místě a dnem návratu, víkendy, svátky ČR a dnešek; pod ním lety s časy a „Přidat do kalendáře“ (ics = atribut
   * tlačítka .ics, '' = bez něj) a celá cesta jako událost Google Kalendáře.
   */
  function scalHtml(out, back, { nights = null, ics = '', dest = '' } = {}) {
    const c = SearchHelp.spanCal(out, back, { today: fmtYMD(new Date()), nights });
    if (!c) return '';
    const tm = c.times, lv = c.leave && SearchHelp.leaveTxt(c.leave);
    const legTxt = (l, dep) => `${dayLabel(l.date)}${dep ? ` v\u00a0${dep}` : ''} · ${esc(l.from || '')}\u00a0→\u00a0${esc(l.to || '')}${arrTime(l) ? ` (přílet ${esc(arrTime(l))})` : ''}`;
    const tip = x => [dayLabel(x.date),
      x.role === 'out' || x.role === 'both' ? `odlet tam${tm.outDep ? ' v ' + tm.outDep : ''}` : '', x.role === 'back' || x.role === 'both' ? `odlet zpět${tm.backDep ? ' v ' + tm.backDep : ''}` : '',
      x.role === 'night' ? 'na místě' : '', x.arr === 'out' ? `přílet tam${tm.outArr ? ' v ' + tm.outArr : ''}` : '', x.arr === 'back' ? `přílet domů${tm.backArr ? ' v ' + tm.backArr : ''}` : '',
      x.hol, x.today ? 'dnes' : ''].filter(Boolean).join(' · ');
    const cell = x => {
      const sub = x.role === 'out' || x.role === 'both' ? tm.outDep || 'tam' : x.role === 'back' ? tm.backDep || 'zpět' : x.arr ? 'přílet' : '';
      const cls = ['sc-d', x.role && 'r-' + x.role, x.role === 'out' && !c.back && 'solo', x.arr && 'a-' + x.arr, x.wknd && 'wk', x.hol && 'hol', x.today && 'now', x.past && 'past'].filter(Boolean).join(' ');
      return `<div class="${cls}" title="${esc(tip(x))}"><span>${x.d}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    };
    const month = m => `<div class="scal-m"><div class="scal-mt">${cap(m.name)} ${m.y}</div><div class="scal-g">${SearchHelp.SPAN_DOW.map((w, i) => `<div class="sc-w${i > 4 ? ' wk' : ''}">${w}</div>`).join('')}${'<div class="sc-d sc-e"></div>'.repeat(m.lead)}${m.cells.map(cell).join('')}</div></div>`;
    const gcal = window.Ics && Ics.gcalUrl({
      title: `✈️ ${dest || out.to}`, start: c.out, end: c.back || c.out, location: dest || '',
      description: [`Tam: ${dayLabel(out.date).replace(/\u00a0/g, ' ')}${tm.outDep ? ' ' + tm.outDep : ''} ${out.from} → ${out.to}`, back ? `Zpět: ${dayLabel(back.date).replace(/\u00a0/g, ' ')}${tm.backDep ? ' ' + tm.backDep : ''} ${back.from} → ${back.to}` : ''].filter(Boolean).join('\n'),
    });
    return `<div class="scal">
      <div class="scal-h"><b>${dayLabel(c.out)}${c.back ? ` → ${dayLabel(c.back)}` : ''}</b><span> · ${c.back ? nightsTxt(c.nights) : 'jen tam'}</span>${lv ? `<span title="${esc(lv.title)}"> · ${esc(lv.text)}</span>` : ''}</div>
      <div class="scal-ms">${c.months.map((m, i) => (i && c.gap ? '<div class="scal-gap" aria-hidden="true">⋯</div>' : '') + month(m)).join('')}</div>
      <div class="scal-legs"><div><i class="sl sl-out"></i><b>Tam</b> ${legTxt(out, tm.outDep)}</div>${back ? `<div><i class="sl sl-back"></i><b>Zpět</b> ${legTxt(back, tm.backDep)}</div>` : ''}${back && c.nights ? `<div><i class="sl sl-night"></i>${nightsTxt(c.nights)} na místě</div>` : ''}
        ${c.holidays.map(h => `<div${h.inTrip ? '' : ' class="faint"'}><i class="sl sl-hol"></i>${dayLabel(h.date)} ${esc(h.name)} (svátek${h.inTrip ? ' v termínu cesty' : ''})</div>`).join('')}</div>
      <div class="scal-act">${ics ? `<button type="button" class="linkbtn" ${ics}>📥 Přidat do kalendáře (.ics)</button>` : ''}${gcal ? `<a class="linkbtn" href="${esc(safeUrl(gcal))}" target="_blank" rel="noopener">Google Kalendář ↗</a>` : ''}</div>
    </div>`;
  }
  /** Lety nabídky jako události kalendáře (s časy, jinak celý den) a online check-in u Ryanairu a Wizz Air. */
  function scalEvents(t, dest) {
    const brief = l => Trip.legBrief(l), q = (shownRes || lastResult || {}).query;
    const ev = [Ics.flightEvent(brief(t.out), { url: t.out.bookUrl || t.bookUrl || undefined, note: `Let tam · ${dest}${q ? ` · ${SearchHelp.paxShort(q)}` : ''}` })];
    if (t.back) ev.push(Ics.flightEvent(brief(t.back), { url: t.back.bookUrl || t.bookUrl || undefined, note: `Let zpět · ${dest}` }));
    for (const l of [t.out, t.back].filter(Boolean)) { const e = Ics.checkinEvent({ ...brief(l), carrier: l.carrier || l.carrierName }); if (e) ev.push(e); }
    return ev;
  }
  const scalIcs = (t, dest) => withMod('trip', () => icsDownload(`atlas-${dest}-${t.out.date}`, scalEvents(t, dest), { name: dest }));
  /** Klepnutí na „📅 V kalendáři“ v nabídce výpisu: kalendář vloží / schová bez překreslení výpisu. */
  function scalToggle(b) {
    const i = +b.dataset.scal, r = rowRegistry[i]; if (!r) return;
    const on = !scalOpen.has(r.t.id);
    if (on) scalOpen.add(r.t.id); else scalOpen.delete(r.t.id);
    const slot = b.closest('.scal-slot');
    slot.innerHTML = scalBtn(on, `data-scal="${i}"`) + (on ? scalHtml(r.t.out, r.t.back, { nights: r.t.nights, ics: `data-scalics="${i}"`, dest: scalDest(r.t) }) : '');
    scalWire(slot);
    $('[data-scal]', slot).focus({ preventScroll: true });
  }
  function scalWire(host) {
    $$('[data-scal]', host).forEach(b => b.onclick = () => scalToggle(b));
    $$('[data-scalics]', host).forEach(b => b.onclick = () => { const r = rowRegistry[+b.dataset.scalics]; if (r) scalIcs(r.t, scalDest(r.t)); });
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
  const dmBtn = (d, attr = `data-dm="${esc(d.key)}"`) => (SearchHelp.destKeyOf(d.id) ? `<button type="button" class="dm-btn" ${attr} aria-label="${esc(d.label)}: chci tam / nezajímá mě / odložit / hlídat cenu" title="⭐ Chci tam · 🙈 Nezajímá mě · 📌 Odložit · ♡ Hlídat cenu">⋯</button>` : '<span></span>');
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
  // strip: false = bez tří velkých karet nahoře (pod kalendářem cílů)
  function compactList(groups, { strip = true } = {}) {
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
      // dny dovolené jen při řazení „Nejméně dovolené“ – na začátku termínu (na telefonu má termín celou šířku řádku,
      // konec s dopravcem se uřízne první); jinak je ukáže až rozbalená karta
      const lv = view.sort === 'leave' ? leaveOf(t) : null, lt = lv && SearchHelp.leaveTxt(lv);
      // řazení „Nejtepleji“: v řádku dlouhodobý průměr (podle něj se řadí), předpověď ukáže rozbalená karta
      const warmSort = view.sort === 'warm', ws = warmSort ? null : wxOf(t, g), wait = !ws && !warmSort && wxWait(t, g);
      // doporučené: cenu i s cestou řekne štítek ✓ pod řádkem (vedle ceny by na telefonu uřízla noci a dopravce)
      const tkt = view.sort === 'best' ? '' : tripLine(t);
      // název se zkrátí (…), štítky za ním zůstanou celé – na telefonu by jinak předpověď uřízl okraj
      // tlačítko řádku (rozbalit) jen vlajka, název, termín a cena – ⋯ vedle něj, ne uvnitř (čtečka obrazovky ho najde
      // jako samostatné tlačítko a nečte ho v názvu řádku); klepnutí kamkoliv na řádek mimo ⋯ rozbalí (myš, prst)
      return `<div class="cmp-row${open ? ' open' : ''}" data-cg="${esc(g.dest.key)}"><div class="cmp-hit" role="button" tabindex="0" aria-expanded="${open}" data-cgh="${esc(g.dest.key)}">
        ${gi < 40 ? `<span class="cmp-flag cmp-ph" data-photo="${esc(g.dest.label)}" style="--h:${ccHue(g.dest.cc)}"><i>${flag(g.dest.cc)}</i></span>` : `<span class="cmp-flag">${flag(g.dest.cc)}</span>`}
        <div class="cmp-main"><div class="cmp-name"><b class="cmp-city">${esc(g.dest.label)}</b><span class="cmp-bdg">${prefBadge(g.dest.key, pl)}${newBadge(g.dest.cc, vis)}${pinOn(t) ? ' <span class="b pin-b" title="Odložená nabídka – 📌 Porovnat">📌</span>' : ''}${hot.has(t.id) ? ' <span class="b hot" title="Jedna z nejvýhodnějších cen vůči běžné ceně na tu vzdálenost">🔥</span>' : ''}${ws ? ' ' + wxChip(ws, ws.short) : `${wait ? `<span class="wx-slot" data-wxc="${esc(g.dest.key)}"></span>` : ''}${t.tempHi != null && (lastResult?.query?.minTemp || warmSort) ? ` <span class="b sun${wait ? ' clim' : ''}">🌡️ ${Math.round(t.tempHi)} °C</span>` : ''}`}</span></div>
          <div class="faint cmp-sub"><span class="cmp-ap">${esc(t.out.from)} → ${esc(t.out.to)}${t.back && t.back.to !== t.out.from ? ` <span title="Návrat na jiné letiště než odlet">↩ ${esc(t.back.to)}</span>` : ''}${two ? ' <span title="2 aerolinky – dvě samostatné letenky, při zpoždění prvního letu druhá aerolinka nečeká">🔀</span>' : ''}</span><span class="cmp-when"><span class="cmp-dot"> · </span>${lt ? `<span class="cmp-lv" title="${esc(lt.title)}">${esc(lt.text)}</span> · ` : ''}${when}${who ? ' · ' + esc(who) : ''}${memAge(t) ? ` · ⏱ ${Alerts.agoTxt(memAge(t) * 60e3)}` : ''}</span></div></div>
        <div class="cmp-price"><b${SearchHelp.isCached(t) && liveSt(t, liveGet(SearchHelp.liveKey(t, liveAdults()))) === 'dearer' ? ' class="stale"' : ''}>${czk(t.perPersonCzk)}</b><small>/os.</small>${tkt}${liveHtml(t)}</div>${whyChip(g, 'cmp-why')}</div>${dmBtn(g.dest, `data-dm="${esc(g.dest.key)}" data-dmr="${ri}"`)}<span class="cmp-chev" aria-hidden="true">${open ? '▴' : '▾'}</span>
      </div>${open ? `<div class="cmp-card">${groupCard(g)}</div>` : ''}`;
    };
    return `${strip ? topStrip(groups) : ''}<div class="card cmp-list">${groups.slice(0, n).map(row).join('')}</div>${groups.length > n ? `<button type="button" class="more-btn" data-cmore>Zobrazit další cíle (${groups.length - n})</button>` : ''}`;
  }
  // nahoře nad přehledem cílů: první 3 podle řazení jako velké karty s fotkou (klepnutí rozbalí cíl v seznamu)
  function topStrip(groups) {
    if (groups.length < 3) return '';
    const lbl = { best: '👍 Doporučené', warm: '☀️ Nejtepleji', leave: '🏖️ Nejméně dovolené', fast: '⚡ Nejrychleji', trip: '🚆 Nejlevnější i s cestou' }[view.sort] || '💸 Nejlevnější teď';
    return `<div class="section-head res-top-h"><h2>${lbl}</h2></div><div class="dest-grid res-top">${groups.slice(0, 3).map(g => {
      const t = g.vis[0];
      return `<button type="button" class="card dest res-top-c" data-rtop="${esc(g.dest.key)}" data-photo="${esc(g.dest.label)}" style="--h:${ccHue(g.dest.cc)}"><div class="flag">${flag(g.dest.cc)}</div>
        <div class="dest-panel"><div class="cname">${esc(g.dest.label)}</div><div class="cblurb">${fmtDate(t.out.date)}${t.back ? '–' + fmtDate(t.back.date) : ''} · z ${esc(t.out.from)}</div>
        <div class="rt-price">${czk(t.perPersonCzk)}<small>/os.</small>${tripLine(t, 'rt-trip')}</div>${whyChip(g, 'rt-why')}</div></button>`;
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
        <div class="rc-name"><h3>${esc(g.dest.label)}${prefBadge(g.dest.key)}${newBadge(g.dest.cc)}</h3><div class="faint">${esc(g.dest.country || '')}${g.dest.airports.length > 1 ? ` · letiště ${g.dest.airports.join(', ')}` : ` · ${g.dest.airports[0]}`}${t.distanceKm ? ` · ${t.distanceKm.toLocaleString('cs')}\u00a0km` : ''}${c && c.cost ? ` · ceny na místě ${costDots(c.cost)}` : ''}</div></div>
        <button type="button" class="btn sm ghost rc-dp" data-dp="${esc(g.dest.key)}" title="Místa k vidění, cesta z letiště do města, počasí a vstup">🔎 Co tam je</button>
        ${dmBtn(g.dest, `data-dm="${esc(g.dest.key)}" data-dmr="${i0}"`)}
      </div>
      ${whyNow.has(g.dest.key) ? (w => `<div class="faint rc-why" title="${esc(w.title)}">✓ ${esc(w.lead || w.title)}</div>`)(whyNow.get(g.dest.key)) : ''}
      ${fb.length >= 2 ? `<div class="faint rc-from" title="Nejlevnější letenka sem z každého letiště (doprava na letiště je u nabídky zvlášť)">${fb.slice(0, 4).map(([k, v]) => `z ${esc(k)} od ${czk(v)}`).join(' · ')}</div>` : ''}
      ${gc && (gc.worth || g.ground.min <= GROUND_CHIP_MAX_MIN) ? groundChip(g, gc) : ''}
      ${tripRow(t, g, i0)}
      ${others.length ? `<button type="button" class="more-btn" data-exp="${esc(g.dest.key)}">${exp ? '▲ Skrýt' : `▼ Další termíny a letiště (${others.length})`}</button>
        ${exp ? `<div class="alt-list">${others.map(o => tripRow(o, g, reg(o, g))).join('')}</div>` : ''}` : ''}
      ${lastResult && lastResult.mode !== 'route' && g.dest.id ? `<button type="button" class="more-btn" data-alldates="${esc(g.dest.key)}">📅 Kalendář cen sem – všechny termíny</button>` : ''}
    </div>`;
  }

  // Telefon: kombinace jako krátké řádky (termín, noci, letiště, cena) – první celá, ostatní se rozbalí klepnutím;
  // celé karty pod sebou (~500 px každá) se na telefonu nedaly porovnat
  const flatCompact = () => Boolean(window.matchMedia && matchMedia('(max-width: 700px)').matches);
  // Hledání do víc cílů („k moři v květnu“ = Kréta, Kypr, Baleáry…): výpis míchá cíle, a tak každá nabídka nese i název
  // cíle – kódy letišť (PRG → CHQ) nováček nepřečte. U jednoho cíle ho říká nadpis výsledků.
  const destTag = (g, cls) => (g ? `<span class="${cls}">${flag(g.dest.cc)} ${esc(g.dest.label)}</span>` : '');
  function tripMini(t, g = null) {
    // letiště tam a zpět každé jako celek (nedělitelné mezery) – na úzkém telefonu se zalomí za nocemi nebo před ↩, ne
    // uprostřed letu; celá trasa jako jeden kus se na 360 px vedle ceny nevešla a konec („→ PRG“) uřízly tři tečky
    const r = `${t.out.from}\u00a0→\u00a0${t.out.to}${t.back ? ` ↩\u00a0${t.back.from !== t.out.to ? `${t.back.from}\u00a0→\u00a0` : ''}${t.back.to}` : ''}`;
    const pl = levelFor(t), tag = t.deal && t.deal.level === 'super' && (!pl || pl.level === 'low') ? '🔥 ' : pl && pl.level === 'low' ? '💚 ' : '';
    const stops = [t.out, t.back].some(l => l && l.stops) ? ' · s přestupem' : '';
    return `<button type="button" class="trip-mini" data-tmini="${esc(t.id)}" aria-expanded="false">
      <span class="tm-when">${destTag(g, 'tm-dest')}<b>${dayLabel(t.out.date)}${t.back ? ` – ${dayLabel(t.back.date)}` : ''}</b><small>${t.back ? nightsTxt(t.nights) : 'jen tam'} · ${esc(r)}${stops}</small></span>
      <span class="tm-price">${tag}${czk(t.perPersonCzk)}<small>/os.</small>${tripLine(t, 'tm-trip')}</span><span class="tm-chev" aria-hidden="true">▾</span></button>`;
  }
  function flatList(list) {
    if (!list || !list.length) return `<div class="empty">${view.nights != null ? 'Pro tento odlet a počet nocí nic neodpovídá filtrům – vyber jiný termín v kalendáři nebo mřížce.' : view.outDate ? 'Pro tento den odletu nic neodpovídá filtrům – vyber jiný den v kalendáři.' : 'Filtrům nic neodpovídá.'}</div>`;
    const byKey = new Map(lastResult.groups.map(g => [g.dest.key, g]));
    const n = view.flatN, rest = list.length - n, mini = flatCompact();
    const multi = new Set(list.map(t => t.destKey)).size > 1;
    view.fopen = view.fopen || new Set();
    return `<div class="card res-card flat${mini ? ' compact' : ''}">${list.slice(0, n).map((t, i) => {
      const g = byKey.get(t.destKey), dg = multi ? g : null;
      if (mini && i > 0 && !view.fopen.has(t.id)) return tripMini(t, dg);
      return destTag(dg, 'tr-dest') + tripRow(t, g, reg(t, g));
    }).join('')}</div>
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
    const title = sel ? (view.leg.out && view.leg.back ? 'Vybraná cesta' : `Kombinace s vybraným letem ${view.leg.out ? 'tam' : 'zpět'}`) : ret ? 'Nejlevnější tam i zpět' : 'Nejlevnější let';
    return `<div class="legs-bar"><span class="faint">${ret ? 'Vyber let tam a zpět – cena letenek tam i zpět na osobu.' : 'Cena letenky na osobu.'}</span>
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
    // nejlevnější s přestupem, přímý jen o málo dráž → nahoře jedním klepnutím (vybere ho jako klepnutí na řádek)
    const dn = view.legSort === 'price' && !view.leg[side] ? SearchHelp.directNear(list, pair) : null, xd = dn && list[dn.i];
    const dnHtml = xd ? `<button type="button" class="lr-direct" data-leg="${side}:${dn.i}">✈️ Přímý let ${dn.more ? `jen o <b>${czk(dn.more)}</b> dráž` : 'za stejnou cenu'} · ${esc(timeOf(xd.leg) || '')} ${esc(xd.leg.from)} → ${esc(xd.leg.to)}${xd.leg.durationMin && list[0].leg.durationMin ? ` · ${esc(dur(xd.leg.durationMin))} místo ${esc(dur(list[0].leg.durationMin))}` : ''}</button>` : '';
    return `<div class="lcol" id="lcol-${side}"><div class="lcol-h"><b>${side === 'out' ? '🛫 Tam' : '🛬 Zpět'}</b><span>${when}</span><span class="faint">${plural(list.length, 'let', 'lety', 'letů')}${hidden ? ` · <span title="Skryto filtry času a přestupů">${hidden} skryto</span>` : ''}</span></div>
      ${dnHtml}<div class="lcol-list">${shown.map((x, i) => legRow(x, side, i, pair, ret, days.length > 1)).join('')}</div>
      ${shown.length < list.length ? `<button type="button" class="more-btn" data-lall="${side}">▼ Všech ${list.length} letů</button>` : ''}</div>`;
  }
  function legRow(x, side, i, pair, ret, showDate) {
    const l = x.leg, sel = view.leg[side] === x.sig;
    const dim = Boolean(pair) && !x.paired;
    const t = pair && x.paired ? x.paired : x.best;
    const meta = [dur(l.durationMin), l.stops ? stopsTxt(l) : 'přímý', l.carrierName || provName(l.provider)].filter(Boolean).map(esc).join(' · ');
    const price = dim ? `<small>jen s jiným letem ${side === 'out' ? 'zpět' : 'tam'}</small>`
      : `<b>${ret && !pair ? 'od ' : ''}${czk(t.perPersonCzk)}</b>${ret ? `<small>${pair ? 'obě letenky' : 'tam i zpět'}</small>` : ''}`;
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
    const legs = res.legs, n = legs.length;
    const picks = mPicks(res), plan = mPlan(res, picks);
    const any = picks.some(x => x != null), full = picks.every(x => x != null);
    const cheapest = res.combos[0] || null;
    const head = kiwiBanner(res) + `<div class="res-head">
      <div><h2>🗺️ ${esc(res.destination.label)}</h2>
      <div class="muted" style="font-size:13px">${plural(n, 'let', 'lety', 'letů')} · ${fmtDate(legs[0].date)} → ${fmtDate(legs[n - 1].date)} · ${esc(SearchHelp.paxShort(res.query))}${BAG_LBL[res.query.bags] ? ` · 🧳 vč. ${res.query.bags === 'cabin' ? 'kabinového kufru' : 'kufru k odbavení'}` : ''}${cheapest ? ` · celá cesta nejlevněji <b class="good">${czk(cheapest.perPersonCzk)}</b>/os.` : ''}</div></div>
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
    const foot = `<div class="res-foot faint">Ceny jsou za letenky na osobu ${bagFoot(res.query.bags)}. Doprava na letiště a z letišť do měst je u cesty zvlášť a přejezdy mezi městy se nepočítají.${footMore(`Doprava je jen pro představu (průměrná cena): ${esc(groundFoot(res, true))}; ${esc(arrivalFoot(res, true))}. Živé ceny se mohou do rezervace změnit. Kurz: ${fxFoot(res)}.`)}</div>`;
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
    // cena = letenka (+ zavazadla); doprava na letiště a z letiště do města jen v popisku jako odhad navíc
    const fuelW = resFuel(res)?.fuel === 'ev' ? 'nabíjení' : 'palivo';
    const fx = [o.groundCzk ? `${res.query.groundMode === 'car' ? 'autem' : 'doprava'} ${i ? 'z letiště domů' : 'na letiště'} ~${czk(o.groundCzk)}/os.${res.query.groundMode === 'car' && !i ? (originGround(res, l.from)?.dropOff ? ` (odvoz: ${fuelW} tam i zpět)` : ` (${fuelW} a parkování na celou cestu)`) : ''}` : '',
      o.arrCzk ? `cesta mezi letištěm a městem ~${czk(o.arrCzk)}/os.` : ''].filter(Boolean).join(', ');
    const tip = `letenka ${czk(o.flightCzk)}${o.bagCzk ? ` + zavazadla ~${czk(o.bagCzk)}` : ''}${fx ? ` · zvlášť, odhad (v ceně není): ${fx}` : ''}`;
    return `<button type="button" class="lrow${sel ? ' sel' : ''}${dim ? ' dim' : ''}" data-mleg="${i}:${a}" aria-pressed="${sel}">
      <span class="cbadge" style="background:${provColor(l.provider)}" title="${esc(l.carrierName || provName(l.provider))}">${esc(l.carrier || '?')}</span>
      <span class="lr-main"><span class="lr-t">${res.legs[i].flex ? `<span class="ld">${dayLabel(l.date)}</span>` : ''}<b>${esc(timeOf(l)) || '—'}</b>${arrTime(l) ? ` <span class="arr">→</span> <b>${esc(arrTime(l))}</b>` : arrUnk(l) ? ` <span class="arr">→</span> ${arrUnk(l)}` : ''}<span class="lr-ap">${esc(l.from)} → ${esc(l.to)}</span></span>
        <span class="lr-x">${meta}</span>${cacheTag(l)}${dim ? `<span class="mc-why">⚠️ ${esc(why)}</span>` : ''}</span>
      <span class="lr-p"><b title="${esc(tip)}">${czk(o.perPersonCzk)}</b>${th != null && !dim && n > 1 ? `<small>letenky ${rest ? '' : 'od '}${czk(th)}</small>` : ''}${o.bagCzk ? `<small class="lr-f" title="${esc(tip)}">letenka ${czk(o.flightCzk)}</small>` : ''}</span>
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
    // přes skutečné okamžiky v zóně města (jako server, multi.js legFits) – v noci změny času by ručičky lhaly o hodinu
    const tz = p.toTz || q.fromTz, at = s => (tz && window.Ics ? Ics.localToUtc(String(s).slice(0, 16), tz) : null) ?? Date.parse(String(s).slice(0, 16) + ':00Z');
    let txt = days > 0 ? `🏙️ ${esc(city)}: ${nightsTxt(days)}`
      : p.arr && p.hasTime && q.hasTime ? `⏱ ${hm(Math.max(0, Math.round((at(q.dep) - at(p.arr)) / 60000)))} na přestup` : '⏱ týž den';
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
    const n = res.legs.length, pax = SearchHelp.paxOf(res.query).seats, note = SearchHelp.paxNote(res.query);
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
      : n === 2 && res.returnsHome ? 'Návrat nevede na začátek cesty – průvodce cestou ho neumí, cestu uložím do Mých cest (lety i do kalendáře).'
          : 'Mezi lety není v některém městě ani jedna noc (nebo ho neznám) – cestu uložím do Mých cest (lety i do kalendáře).';
    return `<div class="card res-card flat"><div class="trip-row mc-row" id="mcSel">
      <div class="tr-legs">${legs}<div class="tr-badges">${badges}</div></div>
      <div class="pbox"><div class="pp">${czk(total)}</div><div class="pl">letenky celé cesty na osobu</div>
        ${sum('bagCzk') ? `<div class="pd">letenky ${czk(sum('flightCzk'))} + zavazadla ~${czk(sum('bagCzk'))}</div>` : ''}
        ${SearchHelp.paxTotalOn(res.query) ? `<div class="pd">${SearchHelp.paxTotalLbl(res.query)}: <b>${czk(total * pax)}</b></div>` : ''}
        ${note ? `<div class="pd pax-note">👶 ${esc(note)}</div>` : ''}${kidsNote(res.query, opts.map(o => (o.bookUrl ? o.provider : o.out.bookUrl ? o.out.provider : null)))}
        ${sum('groundCzk') || sum('arrCzk') ? `<div class="pd px">${[sum('groundCzk') ? `<span title="${esc(groundFoot(res, true))}">${res.query.groundMode === 'car' ? '🚗 autem' : '🚆 doprava'} na letiště${res.returnsHome ? ' a zpět' : ''} ~${czk(sum('groundCzk'))}/os.</span>` : '', sum('arrCzk') ? `<span title="${esc(arrivalFoot(res, true))}">🚌 z letišť do měst a zpět ~${czk(sum('arrCzk'))}/os.</span>` : ''].filter(Boolean).join(' · ')}<span class="px-n">průměrná cena, odhad – v ceně letenek není</span></div>` : ''}</div>
      <div class="tr-act"><button type="button" class="btn sm primary" data-mgo="1">${wiz ? 'Vybrat a pokračovat →' : 'Vybrat a uložit do Mých cest →'}</button>
        ${wiz ? '<button type="button" class="btn sm" data-msave="1">💾 Do Mých cest</button>' : ''}
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
    $$('[data-mgo]', host).forEach(b => b.onclick = () => withMod('trip', () => { const p = best(); if (p) (mWizOk(res, p) ? multiWizard : multiSave)(res, p); }));
    $$('[data-msave]', host).forEach(b => b.onclick = () => withMod('trip', () => { const p = best(); if (p) multiSave(res, p); }));
    $$('[data-mics]', host).forEach(b => b.onclick = () => withMod('trip', () => { const p = best(); if (p) multiIcs(res, p); }));
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
    // průvodce ještě nedostažený (lazy.js): po načtení výpis překreslit – karta pak nabídne průvodce, jde-li to
    if (!window.Trip && window.Lazy && !tripWait) {
      tripWait = true;
      Lazy.need('trip').then(() => { if (lastResult) rerender(true); }, () => { }).finally(() => { tripWait = false; });
    }
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
      perPersonCzk: per, tripCzk: opts.reduce((x, o) => x + (o.tripCzk ?? o.perPersonCzk), 0), totalCzk: per * SearchHelp.paxOf(res.query).seats, nights: home ? SearchHelp.diffDays(a.out.date, b.out.date) : null,
      provider: opts.every(o => o.out.provider === a.out.provider) ? a.out.provider : 'mix', combined: false, bookUrl: null,
      distanceKm: a.distanceKm, destKey: a.destKey, tempHi: a.tempHi, deal: { level: 'normal', score: null, drop: null },
    };
    const dest = res.legs[0].dest || { label: res.legs[0].to, cc: '', country: '', lat: null, lon: null };
    Trip.start({ t, g: { dest }, result: { origins: res.origins, query: res.query, home: res.home, priceStats: null, arrivals: res.arrivals }, ccs: mCountries(res), at: SearchHelp.shownAt(res, lastResultAt, Date.now()), ...(route ? { stops: mStops(res, opts) } : {}) });
  }
  /** Cesta do plánovače: všechny lety (časy a zóny pro kalendář), odkazy na koupi v poznámkách. */
  function multiSave(res, picks) {
    const opts = picks.map((p, i) => mOpt(res, i, p)), n = opts.length, last = opts[n - 1].out;
    const per = opts.reduce((s, o) => s + o.perPersonCzk, 0), pax = SearchHelp.paxOf(res.query).seats;
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
    toast('Cesta uložena do Mých cest');
    go('planner'); // Moje cesty (app.js go)
    setTimeout(() => openTrip(S.trips.length - 1), 250);
  }
  /** Všechny lety cesty (+ celodenní blok celé cesty) do kalendáře (.ics). */
  function multiIcs(res, picks) {
    const opts = picks.map((p, i) => mOpt(res, i, p)), n = opts.length, last = opts[n - 1].out;
    const route = res.destination.label;
    const ev = [{ title: `🧳 ${route}`, start: opts[0].out.date, end: last.arr && last.hasTime ? last.arr.slice(0, 10) : last.date,
      description: `${plural(n, 'let', 'lety', 'letů')} · ${SearchHelp.paxShort(res.query)} · každý let je samostatná letenka`, location: res.legs.map(l => l.to).join(', ') },
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
    // autem tam i zpět: návrat jen na letiště, kde auto stojí (server, carNear) – řádky se sčítají na cenu letenek cesty;
    // kdyby auto stálo jinde, je u dne rozdíl letu na to letiště (ceny jen letenek, doprava a parkování jsou u nabídek)
    const carRet = res.query.groundMode === 'car' && res.query.trip === 'return' && Boolean(nb.back);
    const sgn = v => `${v > 0 ? '+' : '−'}${czk(Math.abs(v))}`;
    const carTip = (c, which) => (!c.tripAdj ? ''
      : which === 'out' ? ` – s návratem k autu do ${c.from} ${sgn(c.tripAdj)} proti řádku Zpět`
        : ` – auto by stálo u ${c.to}: let tam odtud ${sgn(c.tripAdj)} proti řádku Tam`);
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
    const what = `nejlevnější letenka daného dne v Kč/os.${carRet ? ' – autem zpět na letiště, kde auto stojí' : ''}`;
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
      // vlak/bus × letadlo od dveří ke dveřím: letenka i s odhadem cesty na letiště a do města
      const w = Ground.worth(est, { doorMin: p.cheap.doorMin, czk: Ground.doorCzk(t), trips: t.back ? 2 : 1, fast: p.fast && { doorMin: p.fast.doorMin, czk: Ground.doorCzk(p.fast.t) } });
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
  // Srovnání letadlo × vlak/bus: cena na osobu a čas od dveří ke dveřím (vlak/bus = jízda + 45 min na nádraží a z něj; cena
  // běžná – co typicky zaplatíš v daný den – a pod ní „od“). Cena i čas letadla vždy z téže cesty (c = groundCmp);
  // hidden = lety jsou, ale žádný neprošel filtry.
  function groundCompare(x, c, ret, hidden = false) {
    const n = ret ? 2 : 1, t = c && c.t;
    const time = t ? (c.door ? `~${Ground.hm(Ground.round5(c.door))} od dveří ke dveřím · ${t.out.stops ? `${t.out.stops}× přestup` : 'přímý let'}${ret ? ' (tam)' : ''}`
      : t.out.stops ? 'délku cesty s přestupem neznám – ověř' : '')
      : !hidden && x.doorMin ? `~${Ground.hm(x.doorMin)} od dveří ke dveřím` : '';
    const fast = t && c.fast ? `<span class="gb-fast">⚡ nejrychlejší ~${Ground.hm(Ground.round5(c.fast.doorMin))} od ${czk(Ground.doorCzk(c.fast.t))}${ret ? ' tam i zpět' : ''}</span>` : '';
    return `<div class="gb-cmp">
      <div class="gb-col"><span class="gb-l">✈️ Letadlo</span>${t ? `<b>od ${czk(Ground.doorCzk(t))}</b><small>na osobu${ret ? ', tam i zpět' : ''}, i s cestou na letiště</small>` : hidden ? '<b>skryto filtry</b><small>lety jsou, ale žádný neprošel filtry</small>' : '<b>nic nenalezeno</b><small>pro zadané termíny</small>'}${time ? `<span>${esc(time)}</span>` : ''}${fast}</div>
      <div class="gb-col win"><span class="gb-l">🚆 Vlak / bus <em>odhad</em></span><b>${x.typ > 0 ? 'běžně' : 'od'} ~${czk(Ground.typOf(x) * n)}</b><small>${x.typ > 0 && x.czk > 0 && x.czk < x.typ ? `od ~${czk(x.czk * n)} · ` : ''}na osobu${ret ? ', tam i zpět' : ''}</small><span>~${Ground.hm(x.min + Ground.STATION_MIN)} od dveří ke dveřím</span></div>
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
    Ground.panel(host, { q: x.q, date: d.out, back: d.back, adults: SearchHelp.paxOf(res.query).seats, flight: { czk: t ? Ground.doorCzk(t) : null, trips: t && t.back ? 2 : 1, min: t ? t.out.durationMin : null } });
    if (scroll) host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  /** Spoje k jedné destinaci z „kamkoliv“ (čip u výsledku) v okně. */
  function openGroundModal(g) {
    const x = g.ground, res = lastResult, c = groundCmp(res, x, g.vis || [g.best]), t = c.t || g.best, d = groundDates(res, t);
    modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button>
      <div class="modal-hero-inner"><h2 style="font-size:22px">🚆 ${esc(x.from)} → ${esc(x.to)}</h2><div style="opacity:.88;font-size:13px">vlakem nebo busem · ~${x.km.toLocaleString('cs')} km vzdušnou čarou · ${esc(Ground.basisTxt(x.basis, x.hills))}</div></div></div>
      <div class="modal-body"><div class="muted gm-why">${esc(c.reason || '')}</div>${groundCompare(x, c, Boolean(t && t.back))}<div id="gndModalPanel"></div></div>`);
    Ground.panel($('#gndModalPanel'), { q: x.q, date: d.out, back: d.back, adults: SearchHelp.paxOf(res.query).seats, flight: { czk: Ground.doorCzk(t), trips: t.back ? 2 : 1, min: t.out.durationMin } });
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
    withMod('trip', () => {
      Trip.start({ t, g, result: res, at });
      if (lastResult && !lastResult.partial && Trip.finalStats) Trip.finalStats(lastResult);
    });
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
      legs: { out: t.out, back, t }, // 📅 V kalendáři (s časy letů a .ics)
      go: () => pickTrip(t, g, res), goLbl: 'Vybrat let a pokračovat →',
    }, from);
  }
  /** Náhled z karty radaru (ⓘ): r = výsledek radaru, x = karta, q = dotaz radaru. */
  function openRadarPreview(r, x, q, from) {
    const c = byIso[x.cc], back = x.d2 && (!x.bf || x.bf === x.to) ? { from: x.to } : null; // zpět z jiného letiště: cestu z něj karta nezná
    dpShow({
      id: x.id, label: x.label, cc: x.cc, country: c ? c.cs : '', lat: x.lat, lon: x.lon, aps: [x.to], ar: x.ar,
      d1: x.d1, d2: x.d2 || null, nights: x.d2 ? SearchHelp.diffDays(x.d1, x.d2) : null, arrDay: x.d1, czk: x.czk, route: SearchHelp.radarRoute(x),
      arr: x.ar ? dpArr({ out: { to: x.to }, back }, { [x.to]: x.ar }, true) : [], tempHi: x.th ?? null,
      wxP: radarWxP && radarWxP.r === r ? radarWxP.p : null, ground: null,
      legs: { out: { date: x.d1, from: x.from, to: x.to, hasTime: false }, back: x.d2 ? { date: x.d2, from: x.bf || x.to, to: x.bt || x.from, hasTime: false } : null, t: null },
      go: () => radarGo(x, q), goLbl: x.buy && x.buy.length ? 'Všechny termíny →' : 'Hledat lety sem →', buy: x.buy,
      why: x.why && x.whyT ? { text: x.why, title: x.whyT, lead: x.whyL || x.whyT } : null, // ✓ proč je karta nad levnější letenkou (na telefonu bez najetí myší)
    }, from);
  }
  const dpFact = (ic, b, s, { cls = '', title = '' } = {}) => `<div class="dp-f${cls}"${title ? ` title="${esc(title)}"` : ''}><span class="dp-fi" aria-hidden="true">${ic}</span><div><b>${b}</b>${s ? `<small>${s}</small>` : ''}</div></div>`;
  // Počasí: do 15 dní předpověď na dny cesty, jinak dlouhodobý průměr měsíce (u nabídky ze serveru hned, u karty radaru
  // z api/climate). Řádek { ic, b (HTML), s, title }.
  const dpWxRow = w => `<div class="dp-f" id="dpWx"${w.title ? ` title="${esc(w.title)}"` : ''}><span class="dp-fi" aria-hidden="true">${w.ic}</span><div><b>${w.b}</b><small>${esc(w.s)}</small></div></div>`;
  // Weather.summary („☀️ 22° · 💧 10 %“, „🌧️ prší 2 dny ze 3“) → ikona zvlášť, „Přes den ~22 °C · 💧 10 %“ jako průměr
  // (°C s pevnou mezerou – na telefonu se jednotka neodtrhne od čísla)
  const dpFc = (d, s) => { const [ic, ...w] = s.text.split(' '); return { ic, b: esc(cap(w.join(' ').replace(/^(-?\d+)°/, 'přes den ~$1\u00a0°C'))), s: `předpověď na ${d.d2 ? 'dny cesty' : 'první 3 dny'} (Open-Meteo)`, title: s.title }; };
  const dpClim = (d, wait) => (d.tempHi != null ? { ic: '🌡️', b: `Přes den ~${Math.round(d.tempHi)}\u00a0°C`, s: `dlouhodobý průměr v ${MNS_IN[+String(d.d1).slice(5, 7) - 1]} – ${wait ? 'předpověď se načítá' : 'není to předpověď'}` } : null);
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
    return { ic: '🌡️', b: `Přes den ~${Math.round(n.hi)}\u00a0°C${Number.isFinite(+n.lo) ? `, v noci ~${Math.round(n.lo)}\u00a0°C` : ''}`, s: `dlouhodobý průměr v ${MNS_IN[n.month]}${Number.isFinite(+n.p) ? `, srážky ~${Math.round(n.p)} mm za měsíc` : ''} – není to předpověď` };
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
    const c = byIso[d.cc], geo = Boolean((window.Places || window.Lazy) && wxGeo(d)), w = dpClim(d, Boolean(window.Weather) && wxGeo(d) && wxWin(d.d1)), st = SearchHelp.stayPlan(d.d1, d.d2);
    const ent = window.Entry && d.cc && d.cc !== 'CZ' ? Entry.flightChip(d.cc, d.d2 || d.d1) || Entry.cardChip(d.cc) : '';
    const day = x => `<span class="dp-nw">${dayLabel(x)}</span>`;
    // role okna a jméno (nadpis #dpTitle) dává celé okno #modal (app.js modalName) – tady by bylo okno v okně
    return `<div class="dp">
      <div class="dp-hero" data-photo="${esc(d.label)}" style="--h:${ccHue(d.cc)}" aria-hidden="true"></div>
      <div class="dp-head"><span class="dp-flag" aria-hidden="true">${flag(d.cc)}</span><div class="dp-ttl"><h2 id="dpTitle">${esc(d.label)}</h2><div class="muted">${[esc(d.country), `letiště ${d.aps.map(esc).join(', ')}`].filter(Boolean).join(' · ')}</div></div>
        <button type="button" class="icon-btn dp-x" id="dpX" aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button></div>
      <div class="dp-trip">✈︎ <span class="dp-nw">${esc(d.route)}</span> · ${day(d.d1)}${d.d2 ? ` – ${day(d.d2)}` : ''} · <span class="dp-nw">${d.d2 ? (d.nights != null ? nightsTxt(d.nights) : 'zpáteční') : 'jen tam'}</span> · <span class="dp-nw"><b>${czk(d.czk)}</b>/os.</span></div>
      ${d.legs ? `<div class="dp-scal scal-slot">${scalBtn(false, 'id="dpScal"')}</div>` : ''}
      <div class="dp-chips">${ent}${c && c.cost ? `<span class="b dp-cost" title="Cenová hladina země – jídlo, doprava a ubytování na místě">ceny na místě ${costDots(c.cost)} ${COST_TXT[c.cost]}</span>` : ''}${c ? '<button type="button" class="linkbtn" id="dpCountry">Info o zemi</button>' : ''}</div>
      <div class="dp-facts">
        ${d.why ? dpFact('✓', esc(cap(d.why.text)), esc(d.why.lead || d.why.title), { title: d.why.title }) : ''}
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
    modalOpen(dpHtml(d), { hist: false }); // krok historie náhledu řídí dpOpen (návrat posunu, akce až po návratu)
    if (window.Photos) Photos.paint($('#modal')); // velká fotka města nahoře (jako detail v cestovních aplikacích)
    $('#modal').scrollTop = 0; // okno si jinak drží posun z minulého otevření
    dpOpen(from);
    $('#dpX').onclick = () => dpClose();
    $('#dpGo').onclick = () => dpClose(d.go);
    const cb = $('#dpCountry'); if (cb) cb.onclick = () => openCountry(d.cc); // přes náhled – Zpět zavře i to
    const gb = $('#dpGnd'); if (gb) gb.onclick = () => d.ground.open();
    const sb = $('#dpScal');
    if (sb) sb.onclick = function tog() {
      const slot = $('#dpScal').closest('.scal-slot'), on = !$('.scal', slot), L = d.legs;
      slot.innerHTML = scalBtn(on, 'id="dpScal"') + (on ? scalHtml(L.out, L.back, { nights: d.nights, ics: L.t ? 'id="dpScalIcs"' : '', dest: d.label }) : '');
      const nb = $('#dpScal'); nb.onclick = tog; nb.focus({ preventScroll: true });
      const ib = $('#dpScalIcs'); if (ib) ib.onclick = () => scalIcs(L.t, d.label);
    };
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
      return (window.Lazy ? Lazy.need('places') : Promise.resolve()).then(() => Places.preview(c)); // Objevuj se stahuje až po startu (lazy.js)
    }).then(j => { got = j; fill(Places.previewHtml(j.items, j.km) + (j.demo ? '<div class="faint dp-more">⚠️ demo data – místa jsou vymyšlená</div>' : '')); })
      .catch(e => { if (!got) fill(dpFail(e && e.message)); })
      .finally(() => clearTimeout(slow));
    const pb = $('#dpPlan');
    pb.onclick = async () => {
      pb.disabled = true; // střed města se ještě dohledává (nejvýš 6 s)
      const c = await center, st = SearchHelp.stayPlan(d.arrDay, d.d2);
      if (!mine('#dpPlan')) return; // mezitím zavřené – Objevuj neotevírat
      dpClose(() => withMod('places', () => Places.openAt({ label: c.label, lat: c.lat, lon: c.lon, cc: d.cc, country: d.country }, { start: d.arrDay, days: st.days })));
    };
  }
  // Okno náhledu má krok v historii: Zpět (gesto, tlačítko) ho zavře a z aplikace neodejde. Zavřené jinak (✕, Escape,
  // klepnutí vedle, okno otevřené z náhledu) krok vrátí. Akce, která přepíná pohled, počká, až se historie vrátí (go()
  // přepisuje adresu aktuálního kroku – návrat by pak skončil na staré adrese a hashchange přepnul pohled zpátky).
  const dpH = { on: false, hash: '', from: null, pend: null, t: 0, wired: false };
  function dpFinish({ then = null, from = null }) {
    if (then) return then();
    // fokus zpět na 🔎 / ⓘ, i když se výpis nebo radar mezitím překreslil
    const ri = from && (from.dataset.rinfo != null ? from.dataset.rinfo : from.dataset.ri);
    const el = from && (from.isConnected && from.dataset.ri == null ? from : from.dataset.dp != null ? $(`#results [data-dp="${CSS.escape(from.dataset.dp)}"]`)
      // karta radaru (<div>) fokus nebere – na její ⓘ (otevírá totéž), jinak by čtečka obrazovky začínala znovu od začátku stránky
      : ri != null ? $(`#radar [data-rinfo="${CSS.escape(ri)}"]`) : null);
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
    const slider = (id, r, v, name) => {
      const set = v && v < r.max;
      return `<div class="tf-range"><input type="range" id="${id}" aria-label="${name}" min="${r.min}" max="${r.max}" step="${r.step}" value="${set ? v : r.max}"><b id="${id}Val">${set ? 'do ' + hm(v) : 'bez limitu'}</b></div>`;
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
        ${st.dur ? field(`⏱ Max. délka cesty <small>${ret ? 'každým směrem' : 'vč. přestupů'}</small>`, slider('tfDur', st.dur, tf.maxDur, 'Max. délka cesty')) : ''}
        ${st.lay ? field('⌛ Nejdelší přestup', slider('tfLay', st.lay, tf.maxLay, 'Nejdelší přestup')) : ''}
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
  // 🚆 Vlakem/busem z nápovědy „Málo výsledků?“: panel se spoji je jen u srovnání v Seznamu – Mapa a Kalendář ho
  // nemají (#290), tlačítko by tam nic neudělalo. Přepne do seznamu (u přesné trasy do Letů, pokud je uživatel měl) a
  // spoje rozbalí tam.
  function groundAct() {
    if (!$('#gndPanel') && (view.mode === 'map' || view.mode === 'cal')) { view.mode = legsOk(lastResult) && legsPref ? 'legs' : 'list'; rerender(); }
    showGround(true);
  }
  // Ovládání nápovědy, nejbližších dnů, filtrů a pohledu „Lety“ (výsledky i prázdný stav).
  function wireHelp(host) {
    // akce s clear zruší filtr výpisu hned, ostatní upraví formulář a hledají znovu
    $$('[data-act]', host).forEach(b => b.onclick = () => { const a = actReg[+b.dataset.act]; if (a) a.ground ? groundAct() : a.clear ? clearFilter(a.clear) : rerun(a.patch); });
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
  /**
   * Měsíce kalendáře cen: days = dny s cenou { date, cost, … } (po filtrech), all = dny, které výsledek měl (den bez
   * ceny s filtry fOn = ✕, žádná nabídka neprošla filtry by); tip(x, den) = popisek dne, mark(x) = za číslem dne
   * (vlajka nejlevnějšího cíle v Kamkoliv); clickable = klepnutí vybere den odletu (data-day); trim = v měsíci jen
   * týdny od prvního do posledního dne s daty (hledání od 28. 10. neukáže čtyři prázdné říjnové týdny).
   */
  function calBox(days, title, clickable, all, { fOn = false, by = '', tip, mark = null, trim = false }) {
    const h4 = title ? `<h4>${title}</h4>` : ''; // bez nadpisu: nadpis je v <summary> sbaleného kalendáře
    if (!all.length) return `<div class="cal-box">${h4}<div class="faint">žádná data</div></div>`;
    const byDate = new Map(days.map(d => [d.date, d]));
    const had = new Set(all.map(d => d.date));
    const heat = heatOf(days.map(d => d.cost));
    const months = [...new Set(all.map(d => d.date.slice(0, 7)))].sort();
    return `<div class="cal-box">${h4}<div class="cal-ms">${months.map(m => {
      const [y, mo] = m.split('-').map(Number);
      const first = new Date(y, mo - 1, 1); const n = new Date(y, mo, 0).getDate();
      let d0 = 1, d1 = n; // první a poslední den mřížky (d0 ≤ 1 = od začátku měsíce s prázdnými poli před 1.)
      if (trim) {
        const got = [...had].filter(k => k.startsWith(m + '-')).map(k => +k.slice(8)).sort((a, b) => a - b);
        const dow = d => (new Date(y, mo - 1, d).getDay() + 6) % 7; // po = 0
        if (got.length) { d0 = got[0] - dow(got[0]); d1 = Math.min(n, got[got.length - 1] + 6 - dow(got[got.length - 1])); }
      }
      const offset = d0 <= 1 ? (first.getDay() + 6) % 7 : 0; // jinak je d0 pondělí
      let cells = '';
      for (let i = 0; i < offset; i++) cells += '<div class="cd empty"></div>';
      for (let d = Math.max(1, d0); d <= d1; d++) {
        const key = `${m}-${pad(d)}`; const x = byDate.get(key);
        if (!x && fOn && had.has(key)) { cells += `<div class="cd none gone" title="${esc(dayLabel(key))}: žádná z načtených nabídek neprošla ${by}"><span>${d}</span><b>✕</b></div>`; continue; }
        if (!x) { cells += `<div class="cd none"><span>${d}</span></div>`; continue; }
        const h = heat(x.cost);
        cells += `<div class="cd ${clickable ? 'click' : ''} ${clickable && view.outDate === key ? 'sel' : ''}" ${clickable ? `data-day="${key}"` : ''} style="--h:${h}" title="${esc(tip(x, key))}"><span>${d}${mark ? mark(x) : ''}</span><b>${calNum(x.cost)}</b></div>`;
      }
      // --cr = řádky měsíce (nadpis + týdny): na počítači tolik řádků mřížky měsíců, pod krátký měsíc se vejde další
      const rows = 1 + Math.ceil((offset + d1 - Math.max(1, d0) + 1) / 7);
      return `<div class="cal-month" style="--cr:${rows}"><div class="cm-t">${MNS_FULL[mo - 1]} ${y}</div><div class="cal-grid">${['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(x => `<div class="cdw">${x}</div>`).join('')}${cells}</div></div>`;
    }).join('')}</div></div>`;
  }
  /**
   * 📅 Kalendář pro „Kamkoliv“ a hledání do země: kalendář ze serveru je jen u jednoho cíle → z načtených nabídek (pár
   * nejlevnějších na cíl) cílů, které výpis ukazuje (filtry výpisu, času a přestupů, ⭐/🙈, bez vybraného dne): v každém
   * dni odletu nejlevnější cíl (vlajka a cena) a kolik cílů ten den odlétá; klepnutí = cíle s odletem v ten den. U
   * zpátečních i podle dne návratu (jen pro přehled). vis = skupiny výpisu bez vybraného dne (anyDay(computeGroups)).
   */
  function destCalHtml(res, vis) {
    const q = res.query, trip = q.trip === 'return';
    const destOf = new Map(res.groups.map(g => [g.dest.key, g.dest]));
    const opt = { destOf: t => destOf.get(t.destKey) || null };
    const cal = SearchHelp.dayCal(vis.flatMap(g => g.vis), opt);
    // filtry výpisu (letiště, aerolinky, cena, 🔥, 🆕, ⭐) nebo času a přestupů: dny, které hledání mělo, ale žádná
    // nabídka jimi neprošla, mají ✕ (jako kalendář u jednoho cíle)
    const tOn = SearchHelp.timeActive(view.time), lOn = Boolean(view.excludeOrigins.size || view.excludeCarriers.size || view.maxPrice || view.onlyDeals || view.newOnly || view.favOnly);
    const fOn = tOn || lOn, by = lOn ? `filtry výpisu${tOn ? ' i času a přestupů' : ''}` : 'filtry času a přestupů';
    const all = fOn ? SearchHelp.dayCal(res.groups.flatMap(g => g.options), opt) : cal;
    const cnt = x => (x.n > 1 ? ` · ${x.n} ${x.n <= 4 ? 'cíle' : 'cílů'}` : '');
    const tipOut = (x, key) => `${dayLabel(key)}: nejlevněji ${x.label} ${czk(x.cost)}/os. (${x.from}→${x.to})${x.backDate ? `, zpět ${fmtDate(x.backDate)}` : ''}${cnt(x)} s odletem tento den`;
    const tipBack = (x, key) => `${dayLabel(key)}: návrat nejlevněji z cíle ${x.label} – ${czk(x.cost)}/os. tam i zpět (odlet ${fmtDate(x.outDate)})${cnt(x)} s návratem tento den`;
    const mark = x => (x.cc ? `<i class="cd-f" aria-hidden="true">${flag(x.cc)}</i>` : '');
    const incl = [trip ? 'letenky tam i zpět' : 'letenka tam', BAG_LBL[q.bags] ? 'zavazadla' : ''].filter(Boolean).join(' + ');
    // co je v ceně, jen když to nadpis kalendáře neříká (zavazadla, max. cena hledání) – poznámka pod kalendářem měla
    // na telefonu 6–7 řádků
    const inclTxt = BAG_LBL[q.bags] || q.maxPrice ? `${incl}${q.maxPrice ? `, nejvýš ${czk(q.maxPrice)} (max. cena hledání)` : ''}` : '';
    // dny návratu sbalené (na telefonu by odsunuly cíle vybraného dne o několik obrazovek), otevřené zůstanou otevřené
    const back = trip ? `<details class="dc-back" id="dcBack"${view.calBack ? ' open' : ''}><summary>🛬 Podle dne návratu – nejlevnější cíl</summary>${calBox(cal.back, '', false, all.back, { fOn, by, tip: tipBack, mark, trim: true })}</details>` : '';
    return `<div class="card cal-card dest-cal">${calBox(cal.out, trip ? '🛫 Podle dne odletu – nejlevnější cíl, letenky tam i zpět (Kč/os.)' : '🛫 Podle dne odletu – nejlevnější cíl (Kč/os.)', true, all.out, { fOn, by, tip: tipOut, mark, trim: true })}${back}<div class="faint" style="font-size:12px;margin-top:8px">V každém dni nejlevnější cíl z nalezených nabídek – další termíny ukáže hledání do jednoho cíle.${inclTxt ? ` Cena na osobu: ${inclTxt}.` : ''} Klepni na den odletu a uvidíš všechny cíle s odletem v ten den.${fOn ? ` <b>${lOn ? `🔎 Podle filtrů výpisu${tOn ? ' i času a přestupů' : ''}` : '🕐 Podle filtrů času a přestupů'}</b> – ✕ = ten den žádná nabídka neprošla.` : ''}</div></div>`;
  }
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
    const tip = (x, key) => (x.outDate ? `${dayLabel(key)}: letenky tam i zpět od ${czk(x.cost)}/os. (${x.from}→${x.to} ${fmtDate(x.outDate)}, zpět ${fmtDate(x.backDate)} do ${x.backTo})` : `${dayLabel(key)}: ${czk(x.cost)} (${x.from}→${x.to}, ${provName(x.provider)})`);
    // bez prázdných týdnů před prvním a po posledním dni s nabídkou (hledání od 29. 10. = jen poslední týden října,
    // na telefonu dřív 4 prázdné řádky) – jako kalendář Kamkoliv
    const render = (days, title, clickable, all) => calBox(days, title, clickable, all, { fOn, by, tip, trim: true });
    // co je v ceně (jako kalendář ze serveru): letenky a zavazadla – doprava na letiště a do města je u nabídek zvlášť
    const q = res.query;
    const incl = [trip ? 'letenky tam i zpět' : 'letenka tam', BAG_LBL[q.bags] ? 'zavazadla' : ''].filter(Boolean).join(' + ');
    return `<div class="card cal-card"><div class="cal-wrap">${render(outDays, trip ? '🛫 Podle dne odletu – nejlevnější letenky tam i zpět (Kč/os.)' : '🛫 Nejlevnější odlet podle dne (Kč/os.)', true, cal.out)}${trip ? render(backDays, '🛬 Podle dne návratu – nejlevnější letenky tam i zpět', false, cal.back) : ''}</div><div class="faint" style="font-size:12px;margin-top:8px">Cena na osobu: ${incl}${trip && !q.exact ? ', se zadaným počtem nocí' : ''}${q.maxPrice ? `, nejvýš ${czk(q.maxPrice)} (max. cena hledání)` : ''}. Klikni na den odletu a uvidíš kombinace s tímto datem.${fOn ? ` <b>${fLbl}</b> – jen z načtených kombinací; ✕ = ten den žádná neprošla.` : ''}</div></div>`
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
      const tip = `Odlet ${dayLabel(r.date)}, návrat ${dayLabel(addDays(r.date, c.n))} (${nightsTxt(c.n)}): letenky tam i zpět od ${czk(c.cost)}/os. – klepnutím ${sel ? 'zase všechny kombinace' : 'jen kombinace s tímto termínem'}`;
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
    const kp = $('#kidsPax', host); if (kp) kp.onclick = () => { expandForm(); paxSheet(); };
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
    // 📤 Sdílet: odkaz se začne chystat už při dotyku – sdílení a schránka chtějí běžet ještě v gestu uživatele
    $$('[data-oshare]', host).forEach(b => { b.onpointerdown = () => offerPrep(+b.dataset.oshare); b.onclick = () => offerShare(+b.dataset.oshare); });
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
    $$('[data-tmini]', host).forEach(b => b.onclick = () => { (view.fopen = view.fopen || new Set()).add(b.dataset.tmini); rerender(true); });
    scalWire(host); // 📅 V kalendáři u nabídek
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
    $$('[data-day]', host).forEach(c => c.onclick = () => {
      const d = c.dataset.day; view.outDate = view.outDate === d && view.nights == null ? null : d; view.nights = null; rerender(true);
      // Kamkoliv: cíle vybraného dne jsou pod kalendářem – když nejsou vidět, posunout na ně (na telefonu jsou o obrazovku níž)
      const h = view.outDate && $('.dest-cal', host) && $('.dc-head', host);
      if (h && h.getBoundingClientRect().top > innerHeight * 0.75) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#dcBack', host)?.addEventListener('toggle', e => { view.calBack = e.target.open; });
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
    if (lastDraw) return; // výsledky z minula ještě nejsou na obrazovce – při otevření Letů se vykreslí celé, už s tím, co se změnilo
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
  // Statistika cen pro cestu: skupina jejího cíle, celá trasa jen u hledání s jedním cílem (PriceCheck.statsOf).
  const statsFor = (t, res = lastResult) => PriceCheck.statsOf(res, t && t.destKey);
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
    const dist = t.distanceKm ? `<p>Na ${t.distanceKm.toLocaleString('cs')}\u00a0km ${ret ? 'tam i zpět' : 'jedním směrem'} stojí letenka v průměru kolem <b>${czk(pl.ref)}</b>/os. Tahle je ${vs}.
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
    return `<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button>
      <div class="modal-hero-inner"><h2 style="font-size:23px">Je to dobrá cena?</h2><div style="opacity:.85;font-size:13px">${esc(t.out.from)} → ${esc(label)} · ${fmtDate(t.out.date)}${t.back ? '–' + fmtDate(t.back.date) : ''} · letenky ${czk(t.flightCzk)}/os.</div></div></div>
      <div class="modal-body pc-body">
        <div class="pc-verdict"><span class="b ${cls}">${txt}</span><span>${esc(pl.reason)}</span></div>
        ${sec('📊', `Oproti ostatním nabídkám do cíle ${esc(label)} v tomto hledání`, search)}
        ${sec('📏', 'Oproti průměrné ceně na tuto vzdálenost', dist)}
        ${sec('🧠', 'Co ATLAS na této trase viděl <small class="faint">(v tomto prohlížeči)</small>', memo)}
        ${left ? sec('📅', 'Do odletu', `<p>${left}</p>`) : ''}
        ${adv ? `<div class="note info pc-advice">💡<div><b>Co s tím?</b> ${esc(adv.text)}</div></div>` : ''}
        ${cache ? '<div class="note warn pc-advice">⏱<div>Cena je z cache (z hledání jiných uživatelů za posledních ~48 h) – před nákupem ji ověř.</div></div>' : ''}
        <div class="row wrap pc-act">${!inResults ? '' : isWatched(lastForm || getForm()) ? '<button type="button" class="btn" id="pcWatch" disabled title="Hledání už je v hlídaných cenách na Přehledu">✓ Tohle hledání už hlídáš</button>' : '<button type="button" class="btn primary" id="pcWatch">♡ Hlídat cenu tohoto hledání</button>'}<button type="button" class="btn ghost" data-close>Zavřít</button></div>
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
    if (proj.scale() > 2600) {
      // fitExtent nastavil posun k původnímu měřítku – po zmenšení body znovu doprostřed, jinak ujedou mimo mapu
      proj.scale(2600);
      const [[x0, y0], [x1, y1]] = d3.geoPath(proj).bounds(geo), [tx, ty] = proj.translate();
      proj.translate([tx + W / 2 - (x0 + x1) / 2, ty + H / 2 - (y0 + y1) / 2]);
    }
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
    // domov v g0 jako ostatní vrstvy – při přiblížení a posunu mapy jde s nimi
    const homeDot = home ? g0.append('circle').attr('cx', proj(home)[0]).attr('cy', proj(home)[1]).attr('r', 4).attr('class', 'rm-home') : null;
    const zoom = d3.zoom().scaleExtent([1, 10])
      .on('zoom', ev => { const k = ev.transform.k; g0.attr('transform', ev.transform); g0.selectAll('.rm-dot').attr('r', d => (d.t.deal.level === 'super' ? 7 : 5.5) / Math.sqrt(k)); if (homeDot) homeDot.attr('r', 4 / Math.sqrt(k)); sizeOrigins(k); g0.selectAll('.rm-lbl').style('font-size', lblSize(k) + 'px'); })
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
      // dep = odlet prvního letu (let s ± dny může odletět dřív než datum v hledání – Alerts.bestGone)
      const out0 = res.legs[0] && res.legs[0].options[c.picks[0]] && res.legs[0].options[c.picks[0]].out;
      return { czk: c.perPersonCzk, desc: c.picks.map((p, i) => { const l = res.legs[i].options[p].out; return `${fmtDate(l.date)} ${l.from}→${l.to}`; }).join(' · '), ...(out0 && out0.date ? { dep: out0.date } : {}) };
    }
    // Kamkoliv a hledání do země: bez 🙈 měst (jako výpis); všechna v 🙈 → aspoň nejlevnější ze všech
    const shown = prefOn(res) ? prefFor(res, res.groups).groups : res.groups, gs = shown.length ? shown : res.groups;
    if (!gs.length) return null;
    const g = gs.reduce((m, x) => x.best.perPersonCzk < m.best.perPersonCzk ? x : m), t = g.best;
    // key = město; hid = 🙈 města levnější než ono – vrácené z 🙈 příště není zlevnění (Alerts.rebaseWhy)
    const hid = gs === shown ? res.groups.filter(x => !shown.includes(x) && x.best.perPersonCzk < t.perPersonCzk).map(x => x.dest.key).slice(0, SearchHelp.DEST_MAX) : [];
    // 💡 tip na kartě hlídání: den odletu (kolik zbývá) a „Je to dobrá cena?“ téhle nabídky (úroveň ze serveru, cestu
    // složenou ze dvou letenek ohodnotí PriceCheck ze statistiky jejího cíle – ne z lastResult, kontrola je jiné hledání)
    const pl = t.priceLevel || PriceCheck.assess(t, PriceCheck.statsOf(res, g.dest.key));
    return { czk: t.perPersonCzk, desc: `${g.dest.label} · ${fmtDate(t.out.date)}${t.back ? '–' + fmtDate(t.back.date) : ''} · z ${t.out.from}`, key: g.dest.key, ...(hid.length ? { hid: hid.join(',') } : {}),
      dep: t.out.date, ...(pl && pl.level ? { lvl: pl.level, lvlWhy: String(pl.reason || '').slice(0, 160) } : {}) };
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
  // 📅 Hlídat s posouváním termínu: klouzavý termín pro ♡ z formuláře f (bez ručního přepnutí zapnutý, když rozsah začíná
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
  // věta „s dětmi“ bez počtu: hledá se s počtem osob z formuláře – nad výsledky připomenout, ať ho upraví
  let kidsAsk = false;
  const kidsHtml = () => (kidsAsk && lastForm ? `<div class="note info watch-nudge">🧒 <div>Hledám pro ${esc(SearchHelp.paxTxt(lastForm))} – <button type="button" class="linkbtn" id="kidsPax"><b>přidej děti</b></button> (2–11 let platí sedadlo, miminko do 2 let letí na klíně) a hledej znovu.</div></div>` : '');
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
    const w = { id: Date.now().toString(36), label: watchLabel(f), sub: watchSub(roll ? Alerts.rollForm(wf, today()) : f), form: wf, best: b, history: b ? [{ at: Date.now(), czk: b.czk }] : [], checked: Date.now(), base: czk0, low: czk0, seen: czk0, target: null, own: SearchHelp.ownPrint(res), pv: Alerts.PV };
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
    // 📅 Hlídat s posouváním termínu jen u flexibilního termínu, který jde posouvat (a jen dokud se nehlídá)
    const rl = $('#rollLbl'), roll = !on && Alerts.rollSpec(f, today());
    if (rl) {
      rl.hidden = !roll;
      if (roll) { if (!rollTouched) $('#rollOn').checked = Boolean(rollWanted(f)); rl.title = `♡ uloží hledání jako „${Alerts.rollTxt({ ...f, roll }, today(), { now: false })}“ – ${roll.lw ? 'po každém prodlouženém víkendu se posune na další' : 'termín se každý den posune'}, hlídání neproběhne`; }
    }
    b.textContent = on ? '♥ Hlídáš – na Přehledu' : '♡ Hlídat cenu';
    b.classList.toggle('on', on);
    b.onclick = on ? () => { go('dashboard'); setTimeout(() => $('#watchHead')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); } : () => addWatch();
    const w = $('#ssWatch'); // ♡ ve sbaleném formuláři (telefon)
    if (w) { w.textContent = on ? '♥' : '♡'; w.title = b.textContent; w.setAttribute('aria-label', b.textContent.slice(2)); w.classList.toggle('on', on); w.onclick = b.onclick; }
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
    // přetížený server (overloadNow – Retry-After): kontrola počká, až to půjde znovu
    canRun: () => !document.hidden && !busySearches && !overloadNow(),
    // i po otevření (po dlouhé pauze) nejvýš 4 hledání za cyklus, zbylá zastaralá hlídání po 4 každých 5 min (startAutoCheck)
    costOf: w => (w.form && w.form.trip === 'multi' ? 2 : 1), // cesta přes víc měst = 2 hledání v limitu serveru
  });
  const cardSel = id => `#watchList [data-w="${CSS.escape(id)}"]`;
  // Chrome na Androidu Notification má, ale ze stránky ho vytvořit nejde (jen přes service worker) → jako by ho neměl.
  const notifCtor = !(navigator.userAgentData && /Android/i.test(navigator.userAgent));
  const notifOk = () => notifCtor ? Alerts.notifState(window.Notification, window.isSecureContext !== false) : 'unsupported';

  // graf jen od poslední změny 🏠 vlastní ceny na letiště (Alerts.epoch) – starší ceny jsou s jinou cestou na letiště;
  // ze 2 bodů by „vývoj“ byla jedna čára – graf až od 3 kontrol, jinak jen řádky s cenami (st = Alerts.watchStats)
  function sparkSvg(w, st, now = Date.now()) {
    const hs = Alerts.epoch(w.history), W = 140, H = 46, sp = hs.length >= 3 && Alerts.sparkPath(hs, W, H, 5);
    if (!sp) return '';
    const n = sp.xy.length, [lx, ly] = sp.xy[sp.lo], [cx, cy] = sp.last, both = sp.lo === n - 1;
    // značka nejnižší ceny jen když je nejnižší cena v grafu (ne z kontroly, která už z historie vypadla)
    const lo = st.low && st.low.czk === sp.min;
    const lab = `Vývoj ceny za ${n} ${n < 5 ? 'kontroly' : 'kontrol'}: ${czk(sp.min)} až ${czk(sp.max)}${lo && st.low.at ? `, nejníž ${czk(sp.min)} (${Alerts.dayTxt(st.low.at, now)})` : ''}${st.cur ? `, teď ${czk(st.cur)}` : ''}`;
    const tgt = w.target >= sp.min && w.target <= sp.max ? `<path class="ws-tgt" d="M0 ${sp.y(w.target)}H${W}"/>` : '';
    // tečky = nulové úsečky s kulatým koncem (vector-effect: zůstanou kulaté i v roztaženém grafu); lem v barvě karty je oddělí od čáry
    const dot = (x, y) => `M${x} ${y}h0`;
    return `<svg class="w-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(lab)}"><title>${esc(lab)}</title>`
      + `<path class="ws-area" d="${sp.d}L${cx} ${H}L${sp.xy[0][0]} ${H}Z"/>${tgt}<path class="ws-line" d="${sp.d}"/>`
      + `<path class="ws-halo" d="${lo && !both ? dot(lx, ly) : ''}${dot(cx, cy)}"/>`
      + (lo && !both ? `<path class="ws-low" d="${dot(lx, ly)}"/>` : '')
      + `<path class="ws-dot${lo && both ? ' lo' : ''}" d="${dot(cx, cy)}"/></svg>`;
  }
  /** Řádky vedle grafu: Nejníž (kdy), Teď, změna za týden (šipka) a od uložení. */
  function watchLines(w, st, h, own, now) {
    const since = Alerts.pctChange(w.base ?? h[0]?.czk, st.cur), wk = st.week, L = [];
    // po první kontrole je nejnižší cena ta dnešní – stačí „Teď“
    if (st.low && (st.n > 1 || st.low.czk !== st.cur)) L.push(`<span><i class="w-lg lo" aria-hidden="true"></i>Nejníž: <b>${czk(st.low.czk)}</b> <span class="faint">(${st.low.at ? Alerts.dayTxt(st.low.at, now) : 'dřív'})</span></span>`);
    if (st.cur) L.push(`<span><i class="w-lg" aria-hidden="true"></i>Teď: <b>${czk(st.cur)}</b></span>`);
    if (wk) {
      const per = wk.days === 7 ? 'za týden' : `za ${plural(wk.days, 'den', 'dny', 'dní')}`;
      const tip = `${Alerts.dayTxt(wk.at, now)} ${czk(wk.czk)} → teď ${czk(st.cur)} (${Alerts.fmtPct(wk.pct)})`;
      L.push(`<span class="w-wk ${wk.dir === 'down' ? 'good' : wk.dir === 'up' ? 'bad' : ''}" title="${esc(tip)}">${wk.dir === 'down' ? `↓ ${czk(-wk.d)}` : wk.dir === 'up' ? `↑ ${czk(wk.d)}` : '→ beze změny'} ${per}</span>`);
    }
    if (since != null) L.push(`<span${own ? ` title="${w.rebWhy === 'price' ? 'Ceny jsou teď jen za letenku (doprava na letiště zvlášť) – ceny před tím byly i s ní a s novými se nesrovnávají' : 'Cena se přepočítala po změně 🏠 vlastní ceny na letiště nebo seznamu 🙈 – ceny před tím se s novými nesrovnávají'}"` : ''}>${own ? (w.rebWhy === 'price' ? 'od přepočtu cen' : 'od změny nastavení') : 'od uložení'} <b class="${since < 0 ? 'good' : since > 0 ? 'bad' : ''}">${Alerts.fmtPct(since)}</b></span>`);
    return L.join('');
  }
  /** 💡 Tip: koupit, nebo počkat (Alerts.buyTip) – jen u hlídání, které ještě jde koupit. */
  function tipHtml(w, st) {
    const b = w.best || {};
    const t = Alerts.buyTip(st, { days: Alerts.depDays(w, today()), level: b.lvl || null, lvlWhy: b.lvlWhy || '', target: w.target });
    return t ? `<div class="w-tip ${t.kind}" title="Jen odhad z cen, které ATLAS při kontrolách viděl, a z dní do odletu – jistotu nedává nikdo"><span class="w-tk">💡 Tip:</span> ${esc(t.text)}<small>${esc(t.why)}</small></div>` : '';
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
    const h = Alerts.epoch(w.history), own = h.length && h[0].own; // od nového základu (změna 🏠 vlastní ceny na letiště, 🙈, ceny jen za letenku – w.rebWhy)
    const cur = w.best?.czk;
    const past = Alerts.isPast(w.form, today());
    // nabídka z poslední kontroly už odletěla (termín hledání ještě trvá): přeškrtnutá, bez „📉 zlevnilo“, ↓ u ceny,
    // ✓ splněno a 💡 „kup“, než ji kontrola nahradí
    const gone = !past && Alerts.bestGone(w, today());
    const prev = h.length > 1 ? h[h.length - 2].czk : null;
    const diff = prev && cur && !gone ? cur - prev : 0;
    const st = wState.get(w.id);
    const ps = Alerts.watchStats(w, now); // Nejníž, Teď, za týden a 💡 tip
    const sv = sparkSvg(w, ps, now), ln = watchLines(w, ps, h, own, now);
    const drop = !past && !gone && Alerts.isDropped(w); // proběhlý termín: „📉 zlevnilo“ už nekoupíš (jako odznak a „Od minula“)
    const id = esc(w.id);
    const when = st === 'run' ? '<span class="spin dark"></span> kontroluji…' : st === 'wait' ? '⏳ čeká na kontrolu…'
      : w.checked ? `zkontrolováno <span data-ago="${+w.checked}" title="${esc(new Date(w.checked).toLocaleString('cs-CZ'))}">${Alerts.agoTxt(now - w.checked)}</span>` : 'zatím nezkontrolováno';
    // 📅 klouzavý termín: přepínač zapnutý, u pevného flexibilního vypnutý (u proběhlého tlačítko v poznámce) – dřív
    // u pevného odkaz „převést na klouzavé“, kterému běžný člověk nerozumí; vypnutý přepínač je stejný jako zapnutý
    const rolled = Alerts.rolls(w.form), canRoll = !rolled && Boolean(rollOf(w));
    const roll = rolled ? `<div class="w-roll"><label class="check-inline"><input type="checkbox" data-wr="${id}" checked> 📅 Posouvat termín s časem</label><span class="faint">porovnává se vždy aktuální termín</span></div>`
      : canRoll && !past ? `<div class="w-roll"><label class="check-inline" title="Termín se bude každý den posouvat (jako při uložení) – historie, cílová cena i „od uložení“ zůstanou"><input type="checkbox" data-wr="${id}"> 📅 Posouvat termín s časem</label></div>` : '';
    // karta: fotka cíle, hledání a cena nahoře, pod tím vývoj ceny, cílová cena a tlačítka
    const city = w.best && w.best.key ? String(w.best.desc || '').split(' · ')[0] : (w.form && w.form.to && w.form.to.length === 1 && !/^ct:/.test(w.form.to[0].id) ? w.form.to[0].label : '');
    return `<div class="card watch${st ? ' checking' : ''}${past ? ' past' : ''}${drop ? ' dropped' : ''}" data-w="${id}">
        <div class="w-top">${city ? `<span class="w-ph" data-photo="${esc(city)}" style="--h:${ccHue(city)}"></span>` : '<span class="w-ph">🔔</span>'}
          <div class="w-tt"><div class="w-t">${esc(w.label)}</div><div class="w-sub">${esc(subOf(w))}</div></div>
          <div class="w-p">${cur ? czk(cur) : '—'}<small>/os.</small>${diff ? `<span class="${diff < 0 ? 'good' : 'bad'}" title="Oproti minulé kontrole">${diff < 0 ? '↓' : '↑'} ${czk(Math.abs(diff))}</span>` : ''}</div></div>
        ${drop ? '<span class="b good w-drop">📉 zlevnilo</span>' : ''}${roll}
        ${sv || ln ? `<div class="w-main${sv ? '' : ' nochart'}">${sv}<div class="w-stats">${ln}</div></div>` : ''}
        <div class="w-desc">${gone ? `<s>${esc(w.best.desc || '')}</s> ⌛ termín už proběhl – novou nabídku najde příští kontrola` : esc(w.best?.desc || 'zatím bez výsledku')}</div>${past || gone ? '' : tipHtml(w, ps)}
        ${past ? `<div class="note warn w-past">⌛ <div>Termín proběhl – tohle hledání už hlídat nejde. ${canRoll ? `<button type="button" class="linkbtn" data-wr="${id}">📅 Posouvat termín s časem</button> – hlídání pojede dál s novým termínem, historie i cílová cena zůstanou. Nebo ho smaž.` : 'Smaž ho, nebo ho otevři a vyber nové datum.'}</div></div>`
        : `<label class="w-target">🎯 Upozornit pod <input class="input" type="number" inputmode="numeric" min="0" data-wt="${id}" value="${+w.target > 0 ? +w.target : ''}" aria-label="Cílová cena v Kč na osobu"> Kč <span class="good w-hit" ${cur && cur <= w.target && !gone ? '' : 'hidden'}>✓ splněno</span></label>
        <div class="w-cal"><button type="button" class="linkbtn" data-wcal="${id}" title="Stáhne událost do kalendáře: každé pondělí v 9:00 (8 týdnů) s odkazem zpět na tohle hlídání">📅 Připomínat</button><span class="faint">v pondělí v kalendáři</span></div>`}
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
      else if (b.dataset.wd) delWatch(b.dataset.wd);
      else if (b.dataset.wr) setRoll(b.dataset.wr, true);
      else if (b.dataset.wcal) remindWatch(b.dataset.wcal);
    };
    // ukládat průběžně (překreslení karty během psaní nic neztratí), potvrdit až po dopsání
    host.oninput = e => { if (e.target.dataset.wt) setTarget(e.target.dataset.wt, e.target.value); };
    host.onchange = e => { if (e.target.dataset.wt) setTarget(e.target.dataset.wt, e.target.value, true); else if (e.target.dataset.wr) setRoll(e.target.dataset.wr, e.target.checked); };
    $('#watchCheckAll').onclick = () => Promise.all((S.watch || []).filter(w => !Alerts.isPast(w.form, today())).map(w => checkWatch(w.id)));
    kbClick($('#watchCheckAll')); // „Zkontrolovat vše →“ (<span>) i z klávesnice
    updateWatchBadges();
    observeSeen();
  }
  // ✕ smaže hned (i s historií cen a cílovou cenou) – „↩ Vrátit“ v hlášce ho vrátí na stejné místo
  function delWatch(id) {
    const i = (S.watch || []).findIndex(x => x.id === id); if (i < 0) return;
    const w = S.watch[i];
    S.watch = S.watch.filter(x => x.id !== id); save(); renderWatch(); updateWatchBtn();
    toast(`Hlídání ${w.label || ''} smazáno`, '', 6000, { label: '↩ Vrátit', run: () => {
      if ((S.watch || []).some(x => x.id === id || watchKey(x) === watchKey(w))) return; // mezitím hlídané znovu
      S.watch = [...(S.watch || [])]; S.watch.splice(Math.min(i, S.watch.length), 0, w); save(); renderWatch(); updateWatchBtn();
    } });
  }
  function paintCard(id) {
    const el = $(cardSel(id)), w = (S.watch || []).find(x => x.id === id);
    if (el && w) { keepTyping(() => { el.outerHTML = watchCard(w); }); if (window.Photos) Photos.paint($('#watchList')); }
  }
  function setState(id, st) { st ? wState.set(id, st) : wState.delete(id); paintCard(id); }
  /** 📅 Připomínat: .ics s týdenní připomínkou – vrátí uživatele do ATLASu bez upozornění v telefonu. */
  function remindWatch(id) {
    const w = (S.watch || []).find(x => x.id === id); if (!w || !window.Ics) return;
    Ics.download(`atlas-hlidani-${w.label || id}`, [Alerts.remindEvent(w, { appUrl: location.origin + location.pathname })]);
    toast('Připomínka stažena – otevři ji v kalendáři (každé pondělí v 9:00, 8 týdnů)');
  }
  /**
   * Odkaz #watch=<id> z připomínky: posunout na kartu a krátce ji zvýraznit; zastaralé hlídání zkontrolovat stejnou
   * frontou jako ↻ (automatická kontrola ho pak už nehledá znovu). → false, když hlídání neexistuje.
   */
  function showWatch(id) {
    const w = (S.watch || []).find(x => x.id === id); if (!w) return false;
    if (!$(cardSel(id))) renderWatch();
    setTimeout(() => {
      const el = $(cardSel(id)); if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 2500);
    }, 350);
    if (!Alerts.isPast(w.form, today()) && Alerts.isStale(w, Date.now())) checkWatch(id);
    return true;
  }
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
    const met = !!(cur && w.target && cur <= w.target) && !Alerts.bestGone(w, today()); // odlétlá nabídka cíl nesplní
    const hit = $(`${cardSel(id)} .w-hit`); if (hit) hit.hidden = !met;
    // 💡 tip počítá s cílovou cenou („pod tvou cílovou cenou – kup“) – překreslit jen jeho, pole s kurzorem zůstane
    const tip = $(`${cardSel(id)} .w-tip`); if (tip) tip.outerHTML = tipHtml(w, Alerts.watchStats(w, Date.now()));
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
  /** 📅 na kartě: zapnout (i u proběhlého – hned se zkontroluje), vypnout = zůstane dnešní termín. */
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
      // přetížený server mezitím odmítl jiné hledání (třeba první ze „Zkontrolovat vše“): čekající kontroly se nepošlou,
      // dopadly by stejně – proč, už řekla hláška té první
      const ov = overloadNow();
      if (ov && ov.at >= asked) return;
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
      if (r.rebased) { if (!auto) toast(`${cur.label}: ${czk(b.czk)} – ${{ own: 'změnila se tvoje 🏠 vlastní cena na letiště', unmute: 'nejlevnější je město vrácené z 🙈 Nezajímá mě', mute: 'minule nejlevnější město máš teď v 🙈 Nezajímá mě', price: 'ceny jsou teď jen za letenku, bez dopravy na letiště' }[r.rebased]}, dál porovnávám od této ceny`); }
      else if (r.why) alertDrop(cur, r.why, r.prev);
      else if (!auto) toast(b && r.prev && b.czk < r.prev ? `📉 ${cur.label}: cena klesla na ${czk(b.czk)}!` : `${cur.label}: ${b ? czk(b.czk) : 'nic nenalezeno'}`);
    } catch (e) {
      // automatická kontrola chybu jen zapíše a zkusí to příští cyklus
      ((S.watch || []).find(x => x.id === id) || w).tried = Date.now(); save();
      if (!auto) toast(e.name === 'AbortError' ? `${w.label}: kontrola trvala moc dlouho – zkus to později` : e.message, 'err');
      // přetížený server (429, 502–504), chyba serveru, výpadek spojení nebo kontrola přes limit: další hledání by dopadla
      // stejně – automatický cyklus skončí (Alerts.scheduler 'stop'), zbylá hlídání příště
      else if (e.busy || e.status >= 500 || e.name === 'NetworkError' || e.name === 'AbortError') return 'stop';
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
    const list = S.watch || [], n = Alerts.droppedCount(list, today());
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
    // 🕘 karta Od minula po návratu (app.js) – až po 📉 kartě, ať neopakuje její hlídání; dokud je vidět (nebo ji
    // uživatel v tomhle okně zavřel ✕), tenhle řádek by říkal totéž podruhé
    if (typeof renderSince === 'function') renderSince();
    const since = $('#sinceCard'), quiet = Boolean(since && since.dataset.quiet);
    const hits = n.hits.filter(x => x !== top), drops = n.watch.filter(x => x !== top);
    const parts = [
      ...hits.slice(0, 2).map(x => `<button type="button" class="linkbtn" data-nl="watch">🎯 ${esc(x.label)} pod tvou cenou (${czk(x.czk)})</button>`),
      ...drops.slice(0, 2).map(x => `<button type="button" class="linkbtn" data-nl="watch">📉 ${esc(x.label)} −${czk(x.d)}</button>`),
      hits.length + drops.length > Math.min(2, hits.length) + Math.min(2, drops.length) ? `<span class="faint">+${hits.length + drops.length - Math.min(2, hits.length) - Math.min(2, drops.length)} další</span>` : '',
      n.down || n.fresh ? `<button type="button" class="linkbtn" data-nl="radar">📡 radar: ${[n.down ? `${n.down} ${n.down === 1 ? 'cíl' : n.down <= 4 ? 'cíle' : 'cílů'} levněji` : '', n.fresh ? `${n.fresh} ${n.fresh === 1 ? 'nový' : n.fresh <= 4 ? 'nové' : 'nových'}` : ''].filter(Boolean).join(' · ')}</button>` : '',
    ].filter(Boolean);
    el.hidden = !parts.length || quiet;
    el.innerHTML = parts.length ? `<b>Od minula:</b> ${parts.join('<span class="faint"> · </span>')}` : '';
    $$('[data-nl]', el).forEach(b => b.onclick = () => $(b.dataset.nl === 'radar' ? '#radar' : '#watchHead')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  /** 📉 Zlevnilo o 12 % – velká karta s fotkou cíle nahoře na Přehledu; zmizí po prohlédnutí seznamu nebo po otevření. */
  function renderDropCard(w, total) {
    const el = $('#dropCard'); if (!el) return;
    el.hidden = !w;
    el.dataset.wid = w ? w.id : ''; // karta Od minula (app.js renderSince) tohle hlídání neopakuje
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
    const n = Alerts.droppedCount(S.watch, today());
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

  /**
   * Automatické kontroly: chvíli po startu a pak každých 30 min, jen v otevřeném a viditelném panelu. Zbyla po cyklu
   * zastaralá hlídání (sched.more – limit 4 hledání za cyklus), další várka už za 5 min (Alerts.CFG.moreMs).
   */
  function startAutoCheck() {
    const C = Alerts.CFG;
    let moreT = 0;
    const tick = () => sched.cycle().then(n => {
      if (n < 0) return; // cyklus už běží – dohánění naplánuje on
      clearTimeout(moreT);
      if (sched.more) moreT = setTimeout(tick, C.moreMs);
    });
    setTimeout(tick, C.startMs);
    setInterval(tick, C.cycleMs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (Date.now() - sched.lastCycle >= (sched.more ? C.moreMs : C.cycleMs)) setTimeout(tick, 1500);
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
    radarAgoTick();
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
  /** Uložený radar pro dnešní domov a režim, jen karty, které ukazuje (karta Od minula v app.js – bez hledání) → { at, items, mode, partial } | null. */
  function radarNow() {
    if (!S.home?.from?.length) return null;
    const q = SearchHelp.radarQuery(S.radarMode, radarHome(), today(), S.radarHoliday), r = radarCached(q);
    if (!r || !SearchHelp.radarSame(r.key, radarKey(q))) return null;
    const v = radarVisible(r);
    return { at: v.at, items: v.items, mode: q.mode, partial: Boolean(v.partial) };
  }
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
      b.onclick = () => { S.radarNudged = true; if (b.dataset.m !== q.mode) { S.radarMode = b.dataset.m; save(); renderRadar(); } else save(); };
    });
    // podle chování: kdo hledá hlavně víkendy, tomu radar jednou nabídne Víkendy (vlastní volba režimu nabídku ukončí)
    const wk = q.mode === 'all' && !S.radarNudged && SearchHelp.weekendHabit(S.recent);
    $('#radarSub').innerHTML = `${esc(q.sub.replace(/^\s*·\s*/, ''))} <button type="button" class="linkbtn" id="radarHome">změnit</button>`
      + (wk ? `<button type="button" class="radar-nudge" id="radarWk">💡 Hledáš hlavně víkendy → ukázat Víkendy</button>` : '');
    const wb = $('#radarWk'); if (wb) wb.onclick = () => { S.radarNudged = true; S.radarMode = 'weekend'; save(); renderRadar(); };
    // Svátky: výběr z nejbližších prodloužených víkendů (s cenou, kterou radar už zná)
    paintLw(q);
    $('#radarHome').onclick = () => radarSetup(true);
    $('#radarReload').style.visibility = ''; $('#radarReload').onclick = () => renderRadar(true); kbClick($('#radarReload'));
    if (q.none) { renderNews(); radarEmpty(q, '🗓️'); return; }
    const c = radarCached(q);
    if (!force && c && c.key === key && Date.now() - c.at < 30 * 60e3 && SearchHelp.radarOwnOk(c, S.accessOwn)) return paintRadar(c, q);
    // Starší výsledek stejného dotazu se ukáže hned a nový se hledá na pozadí – po uspání serveru to trvá i přes minutu.
    const old = SearchHelp.radarStale(c, key, today());
    // Server před chvílí hledání odmítl (přetížený – Retry-After): samo (návrat do aplikace, na Přehled, jiný režim) se
    // teď nehledá – starší ceny zůstanou a ↻ Zkusit znovu odpočítává; ↻ Obnovit (force) hledá hned
    const ov = !force && !radarJobs[key] && overloadNow();
    if (ov) return radarFail(q, old, ov);
    if (old) paintRadar(old, q, { busy: true });
    else host.innerHTML = `<div class="faint radar-stale"><span class="spin"></span> Hledám nejlevnější lety z okolí – obvykle do půl minuty<span class="rp"></span></div><div class="radar-grid">${Array.from({ length: 8 }, () => '<div class="card radar-card skel"></div>').join('')}</div>`;
    // ↻ Obnovit / Zkusit znovu (force) u radaru, který už ceny ukazuje: starší hotový výsledek serveru jen novější než
    // ceny na obrazovce (newerThanS = jejich stáří) – stejný by nic neobnovil; jinak (nový domov, první otevření, návrat
    // po 30 min) ho rádo vezme
    const job = radarJobs[key] || (radarJobs[key] = radarSearch(q, key, force && old ? Math.max(0, Math.floor((Date.now() - old.at) / 1000)) : null).finally(() => { delete radarJobs[key]; }));
    try {
      const r = await job;
      if (radarWant === key) paintRadar(r, q);
    } catch (e) {
      if (radarWant !== key) return;
      // nenačetl se jen kvůli výpadku připojení (hledání na server ani nedošlo): po návratu online znovu sám – jinak
      // by „Jsi offline“ zůstalo, dokud uživatel neklepne; jinde než na přehledu ho načte příští otevření přehledu
      if (e.offline && window.Pwa && Pwa.whenOnline) Pwa.whenOnline('radar', () => { if (radarWant === key && $('#view-dashboard.active')) renderRadar(); });
      radarFail(q, old, e);
    }
  }
  /** Radar se nenačetl (e.message, u přetíženého serveru e.until): starší ceny s upozorněním, jinak hláška – obojí s ↻ Zkusit znovu. */
  function radarFail(q, old, e) {
    const host = $('#radar');
    if (old) return paintRadar(old, q, { error: e.message, until: e.until });
    host.innerHTML = `<div class="note warn kiwi-note">⚠️ <div>Radar se nepodařilo načíst: ${esc(e.message)}</div>${retryBtn('radarRetry', e.until)}</div>`;
    radarRetryOn(host);
  }
  function radarRetryOn(host) {
    const b = $('#radarRetry', host);
    if (b) { retryTick(b); b.onclick = () => renderRadar(true); }
  }
  /** Prázdný radar: hláška (větší okruh, Kdykoliv, Víkendy) i s tlačítky, ať se nemusí hledat, kde to změnit. */
  function radarEmpty(q, icon) {
    const host = $('#radar');
    const modes = q.none ? ['all', 'weekend'] : q.mode !== 'all' ? ['all'] : [];
    host.innerHTML = `<div class="note info kiwi-note">${icon} <div>${esc(q.empty)}</div>`
      + (q.none ? '' : '<button type="button" class="btn sm" id="radarWider">Větší okruh</button>')
      + modes.map(m => `<button type="button" class="btn sm" data-rm="${m}">${m === 'all' ? 'Kdykoliv' : 'Víkendy'}</button>`).join('') + '</div>';
    const w = $('#radarWider', host); if (w) w.onclick = () => radarSetup(true);
    $$('[data-rm]', host).forEach(b => b.onclick = () => { S.radarNudged = true; S.radarMode = b.dataset.rm; save(); renderRadar(); });
  }
  /** Nastavení domova radaru („Odkud obvykle létáš?“) – poprvé, nebo změna (edit: předvyplněné, se Zrušit). */
  function radarSetup(edit = false) {
    const host = $('#radar');
    radarWant = null; radarLast = null;
    $('#radarModes').hidden = true; $('#radarLw').hidden = true;
    $('#radarSub').textContent = '';
    $('#radarReload').style.visibility = S.home?.from?.length ? '' : 'hidden'; // bez domova není co obnovit
    // nový uživatel: „Odkud letíš?“ je nahoře v uvítání (app.js) – radar se neptá podruhé, jen řekne, co tu bude
    // (po skrytí uvítání se překreslí s nastavením)
    if (!edit && $('#whatsNew:not([hidden]) .wc-home')) {
      host.innerHTML = '<div class="card radar-setup radar-wait"><div class="muted" style="font-size:13px">📍 Až nahoře v uvítání vybereš, odkud letíš, ukážu tu nejlevnější lety z okolí na příštích 6 týdnů.</div></div>';
      return;
    }
    const rad = +(S.home?.radius ?? 200);
    host.innerHTML = `<div class="card radar-setup"><div><b>Odkud obvykle létáš?</b><div class="muted" style="font-size:13px">${edit ? 'Radar ukazuje nejlevnější lety z okolí tohoto místa. Jiná hledání ho nemění.' : 'Nastav výchozí místo a radar ti tu bude ukazovat nejlevnější lety z okolí na příštích 6 týdnů.'}</div></div><div class="rs-where"><div class="place-input" id="radarFrom"></div><label class="rs-radius faint">+ letiště do <select id="radarRadius">${[...new Set([0, 50, 100, 150, 200, 300, 400, 500, rad])].sort((a, b) => a - b).map(k => `<option value="${k}"${k === rad ? ' selected' : ''}>${k ? k + ' km' : '0 km (jen tohle)'}</option>`).join('')}</select></label><label class="rs-radius faint">ceny pro <select id="radarAdults">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === Math.min(6, radarAdults()) ? ' selected' : ''}>${n} ${n === 1 ? 'osobu' : n < 5 ? 'osoby' : 'osob'}</option>`).join('')}</select></label></div><div class="row" style="gap:8px"><button class="btn primary" id="radarGo">${edit ? 'Uložit' : 'Nastavit'}</button>${edit ? '<button class="btn ghost" id="radarCancel">Zrušit</button>' : ''}</div></div>`;
    const pi = new PlaceInput($('#radarFrom'), { origin: true, placeholder: 'Např. Brno, Praha, Vídeň…' });
    if (edit) pi.set(S.home.from, true);
    $('#radarGo').onclick = () => {
      if (!pi.items.length) return toast('Vyber místo ze seznamu', 'err');
      applyHome({ from: pi.items.slice(), radius: +$('#radarRadius').value, adults: +$('#radarAdults').value || 2 });
    };
    const cn = $('#radarCancel'); if (cn) cn.onclick = () => renderRadar();
  }
  /** Nový domov radaru: uložit, čip domova, Odkud v Letech (když je prázdné) a v hledání na Přehledu, radar. */
  function applyHome(home) {
    S.home = home; save(); updateHomeChip();
    // prázdné Odkud ve formuláři: domov i s okruhem (jinak by hledání z Lety šlo s výchozími 200 km)
    if (fromInput && !fromInput.items.length) { $('#radius').value = home.radius; $('#radiusVal').textContent = $('#radius').value + ' km'; fromInput.set(home.from); }
    renderRadar(true); heroFrom && heroFrom.set(home.from, true);
  }
  /**
   * Nováček bez domova vyplnil Odkud v hledání na Přehledu: to je odpověď i na „Odkud letíš?“ v uvítání hned pod ním –
   * domov jako z čipu uvítání (SearchHelp.homeOf, applyHome), řádek s otázkou zmizí a radar začne hledat. Dřív se
   * uvítání ptalo podruhé, čip nahoře dál nabízel „Nastavit domov“ a radar čekal na odpověď. Bez posunu stránky (píše
   * se dál do Kam); s domovem nebo bez otázky v uvítání nic – hledání odjinud domov nemění.
   */
  function heroHome(items) {
    const ask = $('#whatsNew:not([hidden]) .wc-home');
    if (!ask || S.home?.from?.length || items.length !== 1) return;
    const h = SearchHelp.homeOf(items[0]); if (!h) return;
    ask.remove();
    applyHome(h);
  }
  /**
   * Domov z uvítání („Odkud letíš?“): čip města (SearchHelp.HOME_CITIES) nebo 'geo' = 📍 Moje poloha. Radar pak hned
   * hledá a stránka na něj plynule sjede. done(true) po nastavení, done(false) bez polohy (hláška, čipy zůstanou).
   */
  function homeFromChip(chip, done = () => { }) {
    // done před posunem: uvítání schová čipy dřív, než se změřený cíl posunu pod ním zvedne
    const set = home => { applyHome(home); done(true); $('#radarHead').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    if (chip !== 'geo') { const h = SearchHelp.homeOf(chip); return h ? set(h) : done(false); }
    useMyLocation(p => set(SearchHelp.homeOf(p)), msg => { toast(msg + ' – vyber město', 'err'); done(false); });
  }
  async function radarSearch(q, key, newerThanS = null) {
    busySearches++;
    try {
      // radar: true – server pošle jen to, co radar níž čte (search.js radarResult, ~40 % velikosti); čte-li radar
      // z výsledku další pole, musí ho server posílat taky (test/radar-slim.test.js)
      // newerThanS – radar ukazuje ceny staré tolik sekund (↻ Obnovit): starší hotový výsledek serveru jen novější
      const res = SearchHelp.radarRes(await runSearch({ ...q.payload, radar: true, ...(newerThanS != null ? { newerThanS } : {}) }, { onProgress: ev => radarProgress(ev, key) }));
      // čas cen: starší hotový výsledek od serveru (staleAgeS – spočítal ho před chvílí pro jiného návštěvníka a teď ho
      // přepočítává) platí od spočítání – „Aktualizováno“ ukáže skutečné stáří, paměť cen ho zapíše k tomu času a 30min
      // platnost uloženého radaru běží od něj, takže příští hledání po ní dostane už nový výsledek
      const at = Date.now() - (res.staleAgeS > 0 ? res.staleAgeS * 1e3 : 0);
      PriceCheck.remember(res, { now: at });
      renderFav(); // ⭐ Moje cíle: ceny, které radar právě viděl
      // u svátků jen odlet první volný den nebo večer předem (SearchHelp.radarPick); s rezervou (RADAR_KEEP cílů mimo 🙈),
      // aby 🙈 později jen schovalo kartu a posunula se další – bez nového hledání; 🙈 cíle zůstanou uložené na svém
      // místě (do rezervy se nepočítají, schová je až paintRadar), takže cíl vrácený z 🙈 se hned zase ukáže
      const mute = prefLists().mute;
      // doporučené pořadí (rank.js): z nabídek cíle ta s nejnižší srovnávací cenou, cíle s pestrostí; ✓ proč výš než
      // levnější letenka (u svátků bez porovnání s ranními odlety předvečer – ty radar nebere)
      const rc = Rank.ctxOf(res), rk = Rank.radar(rc), picked = SearchHelp.radarPick(res.groups, q.lw, SearchHelp.RADAR_KEEP, SearchHelp.destKeys(mute), rk);
      // proti všem cílům hledání (nejlevnější letenka bývá až za 20. kartou) – karty jsou začátek téhož pořadí
      const why = Rank.reasons(SearchHelp.radarPick(res.groups, q.lw, Infinity, null, rk).map(({ g, t }) => {
        const all = [g.best, ...(g.options || [])].filter(Boolean), alt = q.lw ? t : all.reduce((a, b) => (b.perPersonCzk < a.perPersonCzk ? b : a), t);
        return { t, sc: Rank.score(t, rc), label: g.dest.label, cc: g.dest.cc, minTrip: Math.min(...all.map(x => x.tripCzk ?? x.perPersonCzk)), ...(alt !== t ? { alt: { t: alt, sc: Rank.score(alt, rc) } } : {}) };
      }), picked.length);
      const items = picked.map(({ g, t }, i) => ({ label: g.dest.label, cc: g.dest.cc, id: g.dest.id, czk: t.perPersonCzk, from: t.out.from, to: t.out.to, d1: t.out.date, d2: t.back?.date,
        // zpět z jiného letiště / na jiné letiště (kombinace z Kamkoliv) – na kartě „JCL → POZ ↩ PED“ (SearchHelp.radarRoute)
        ...(t.back && (t.back.from !== t.out.to || t.back.to !== t.out.from) ? { bf: t.back.from, bt: t.back.to } : {}),
        // čas odletu a přílet zpět kvůli dnům dovolené na kartě (SearchHelp.leaveDays)
        t1: t.out.hasTime ? String(t.out.dep).slice(11, 16) : '', a2: t.back && t.back.hasTime && t.back.arr ? String(t.back.arr).slice(0, 16) : '', deal: t.deal.level, score: t.deal.score, prov: t.out.provider,
        ...(wxGeo(g.dest) ? { lat: +g.dest.lat.toFixed(3), lon: +g.dest.lon.toFixed(3) } : {}), // předpověď na kartě
        // dlouhodobý průměr teplot v měsíci odletu – štítek karet mimo dosah předpovědi (dál než ~15 dní)
        ...(t.tempHi != null ? { th: Math.round(t.tempHi) } : {}),
        // z letiště do města (s polohou města – střed pro „Co vidět“) pro 🔎 Co tam je
        ...(res.arrivals && res.arrivals[t.out.to] ? { ar: res.arrivals[t.out.to] } : {}),
        // doprava na letiště a zpět a z letiště do města na osobu (odhad, jen když ji hledání zná) – 📌 Porovnat i s cestou
        ...(({ ground, arr }) => ({ ...(ground != null ? { gc: Math.round(ground) } : {}), ...(arr != null ? { ac: Math.round(arr) } : {}) }))(Pins.extras(t, res.query, res.origins, res.arrivals)),
        // odkaz na nabídku z karty – hledání do jednoho cíle ji nemusí vrátit (Kiwi dává pro „kamkoliv“ jiné nabídky)
        ...(t.bookUrl ? { buy: [[t.bookUrl, t.provider, 'all']] } : t.out.bookUrl || t.back?.bookUrl ? { buy: [...(t.out.bookUrl ? [[t.out.bookUrl, t.out.provider, 'out']] : []), ...(t.back?.bookUrl ? [[t.back.bookUrl, t.back.provider, 'back']] : [])] } : {}),
        // ✓ proč je karta výš než levnější letenka (štítek a rozpis v title)
        ...(why.has(i) ? { why: why.get(i).text, whyT: why.get(i).title, whyL: why.get(i).lead } : {}) }));
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
  // stáří cen radaru za časem v patičce, jen když už nejsou čerstvé: „Aktualizováno 14:02 (před 12 min)“ – starší hotový
  // výsledek od serveru bývá starý až 30 min, uložený radar taky; za otevřené aplikace se dopočítává (radarAgoTick)
  const radarAgo = at => (at > 0 && Date.now() - at >= 2 * 60e3 ? ` (${Alerts.agoTxt(Date.now() - at)})` : '');
  // jen text na obrazovce (žádné hledání): po minutě a po návratu do aplikace
  const radarAgoTick = () => $$('#radar [data-rago]').forEach(el => { el.textContent = radarAgo(+el.dataset.rago); });
  setInterval(radarAgoTick, 60e3);
  /** st: { busy } = starší výsledek, nový se hledá · { error } = starší výsledek, nový se nepodařilo načíst. */
  // název na kartě radaru s „i“: poslední slovo a „i“ nezalomitelné – „i“ nezůstane samo na dalším řádku (Memmingen (Mnichov))
  const rcName = (label, btn) => {
    const k = label.lastIndexOf(' ');
    return `<span class="rc-lbl">${esc(label.slice(0, k + 1))}<span class="rc-nw">${esc(label.slice(k + 1))}&nbsp;${btn}</span></span>`;
  };
  function paintRadar(r, q, st = null) {
    radarLast = { r, q, st };
    renderNews();
    if (q.lw) paintLw(q);
    const host = $('#radar');
    if (!r.items.length) { radarEmpty(q, 'ℹ️'); return; }
    // 🙈 cíle pryč, na jejich místo další uložené karty (radar si jich drží víc – RADAR_KEEP); ⭐ se štítkem
    const pl = prefLists(), shown = SearchHelp.radarShown(r.items, pl.mute);
    if (!shown.length) { host.innerHTML = `<div class="note info">🙈 <div>Všechny nalezené cíle máš v 🙈 Nezajímá mě. Klepni na <b>Obnovit</b> – radar pak hledá bez nich – nebo uprav seznam v ⭐ Moje cíle níž.</div></div>`; return; }
    // u víkendů i den v týdnu (Pá 17.10.–Ne 19.10.) – s datem nerozdělitelně, zalomí se nejvýš za pomlčkou
    const day = d => (q.mode === 'weekend' ? DOW[new Date(d + 'T12:00:00Z').getUTCDay()] + '\u00a0' : '') + fmtDate(d);
    // čas výsledku, u staršího než dnešního i den (8.10. 9:12)
    const at = new Date(r.at), when = (at.toDateString() === new Date().toDateString() ? '' : `${at.getDate()}.${at.getMonth() + 1}. `) + at.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    // nové ceny se nenačetly: proč (přetížený server: „hledá pro hodně lidí – zkus to za minutu“) a ↻ s odpočtem do Retry-After
    const stale = !st ? '' : st.error ? `<div class="note warn kiwi-note radar-stale">⚠️ <div>Aktuální ceny se nepodařilo načíst: ${esc(String(st.error).replace(/[.\s]+$/, ''))}. Zatím ukazuji ceny z ${when}.</div>${retryBtn('radarRetry', st.until)}</div>`
      : `<div class="faint radar-stale"><span class="spin"></span> Ukazuji ceny z ${when}, hledám aktuální…<span class="rp"></span></div>`;
    // 🔥 jen u 3 karet nejvýhodnějších vůči běžné ceně na tu vzdálenost – u 12 nejlevnějších cílů má „super cenu“ skoro každý
    const hot = new Set(shown.filter(({ x }) => x.deal === 'super').sort((a, b) => (b.x.score || 0) - (a.x.score || 0)).slice(0, 3).map(({ i }) => i));
    // 📌 karta, jejíž nabídku má uživatel odloženou (z radaru, nebo celou z hledání se stejným nastavením)
    const pins = pinList(), pinned = x => Pins.has(pins, Pins.fromRadar(x, { at: r.at, adults: q.payload?.adults }));
    host.innerHTML = `${r.demo ? '<div class="faint" style="font-size:12px;margin-bottom:8px">⚠️ demo data</div>' : ''}<div class="faint radar-what">Za osobu${q.payload?.adults > 1 ? ` (cestujete ${q.payload.adults})` : ''}: cena zpáteční letenky (doprava na letiště je u nabídky zvlášť) · <span title="Pořadí počítá s cenou i s cestou na letiště a do města, časem na cestě, nočními odjezdy, časem na místě a cenou pod obvyklou; další cíl ze stejné země o kus níž. Proč je karta nad levnější letenkou, řekne štítek ✓ (celá věta v detailu karty).">pořadí i s cestou a časy letů</span></div>${stale}<div class="radar-grid${st ? ' stale' : ''}">${shown.map(({ x, i }) => {
      const cn = (byIso[x.cc] && byIso[x.cc].cs) || '';
      // počasí: do ~15 dní předpověď (radarWx doplní), dál dlouhodobý průměr „🌡️ ~8°“ – ať má štítek každá karta
      const clim = x.th != null && !wxWin(x.d1) ? `<span class="b wxb clim" title="Dlouhodobý průměr denních maxim v ${MNS_IN[+x.d1.slice(5, 7) - 1]} – předpověď počasí bude asi 15 dní před odletem">🌡️ ~${x.th}°</span>` : '';
      const bd = `${prefBadge(SearchHelp.destKeyOf(x.id), pl)}${newBadge(x.cc)}${pinned(x) ? ' <span class="b pin-b" title="Odložená nabídka – 📌 Porovnat">📌</span>' : ''}${radarChange(x)}${hot.has(i) ? '<span class="b hot" title="Jedna z nejvýhodnějších cen vůči běžné ceně na tu vzdálenost">🔥 super cena</span>' : ''}${x.why ? `<span class="b why" title="${esc(x.whyT || '')}">✓ ${esc(x.why)}</span>` : ''}${clim}`.trim();
      return `<div class="card radar-card${hot.has(i) ? ' hot' : ''}" data-ri="${i}" data-photo="${esc(x.label)}" style="--h:${ccHue(x.cc)}">
      <div class="rc-badges">${bd}</div>
      ${dmBtn({ ...x, key: SearchHelp.destKeyOf(x.id) }, `data-rdm="${i}"`)}
      <div class="rc-panel">
        <div class="rc-city">${rcName(x.label, `<button type="button" class="rc-info" data-rinfo="${i}" aria-label="Co tam je – ${esc(x.label)}" title="🔎 Co tam je: místa k vidění, z letiště do města, počasí, vstup">i</button>`)}</div>
        <div class="rc-meta"><span class="rcf">${flag(x.cc)}</span>${cn ? `<span class="rc-cn">${esc(cn)}</span>` : ''}<span class="rc-dt">${cn ? '\u00a0·\u00a0' : ''}${day(x.d1)}${x.d2 ? '–' + day(x.d2) : ''}</span></div>
        <div class="rc-sub"${x.bt ? ' title="Zpět z jiného letiště nebo na jiné letiště než odlet"' : ''}>${esc(SearchHelp.radarRoute(x))}${radarLeave(x)}</div>
        <div class="rc-foot"><div class="rc-price">${czk(x.czk)}<small>/os.</small></div><span class="rc-go" aria-hidden="true">›</span></div>
      </div>
    </div>`;
    }).join('')}</div><div class="faint" style="font-size:11.5px;margin-top:8px">Aktualizováno ${when}<span data-rago="${+r.at || 0}">${radarAgo(r.at)}</span>${r.partial ? ' · ⚠️ část aerolinek neodpověděla – ceny můžou být vyšší' : ''} · klepni na kartu: detail, koupit let nebo všechny termíny · fotky měst z <a href="https://unsplash.com/?utm_source=atlas_letenky&utm_medium=referral" target="_blank" rel="noopener">Unsplash</a>, <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a> a Wikimedia Commons (autor u fotky)</div>`;
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
    radarRetryOn(host); // starší ceny po chybě: ↻ Zkusit znovu
    radarWx(r);
    radarPhotos(r);
  }
  // Počet lidí z radaru do formuláře – jen bez dětí ve formuláři: rodina z minulého hledání zůstane (SearchHelp.radarPax)
  const radarPax = n => SearchHelp.radarPax(S.form, n);
  /** Karta radaru → hledání do jejího cíle, všechny termíny. */
  function radarGo(x, q) {
    go('flights');
    // jako radar – i lety s přestupem a pro stejný počet lidí (stejná cena za osobu jako na kartě)
    setForm({ ...defaultForm(), ...prefsOf(S.form), from: S.home.from, to: [{ id: x.id, label: x.label, flag: flag(x.cc) }], ...q.form, ...radarPax(q.payload.adults), directOnly: false });
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
    const favCard = fav.length ? `<div class="card dest" data-qfav="1" data-photo="${esc(String(favNames(fav)).split(', ')[0])}" style="--h:200"><div class="flag">⭐</div><div class="dest-panel"><div class="cname">Moje cíle</div><div class="cblurb">${esc(favNames(fav))} · termíny jako radar</div><div class="meta"><span class="chip accent">Hledat lety</span><span>→</span></div></div></div>` : '';
    const qfHtml = QF.map((q, i) => `<div class="card dest" data-qf="${i}" data-photo="${esc(q[4])}" style="--h:${ccHue(q[1])}"><div class="flag">${q[0]}</div><div class="dest-panel"><div class="cname">${q[1]}</div><div class="cblurb">${q[2]}</div><div class="meta"><span class="chip accent">Hledat lety</span><span>→</span></div></div></div>`).join('');
    // Přehled (Rychlé hledání) i Lety (Nápady, kam letět); ⭐ Moje cíle jen v Letech – Přehled je má vlastní sekcí
    // i s „Hledat moje cíle“ (renderFav), v Rychlém hledání by byly podruhé
    [['#quickFlights', qfHtml], ['#flIdeas', favCard + qfHtml]].forEach(([sel, h]) => { const el = $(sel); if (el) { el.innerHTML = h; if (window.Photos) Photos.paint(el); } });
    $$('[data-qfav]').forEach(qv => { qv.onclick = () => searchFavs(prefLists().fav); kbClick(qv); });
    $$('[data-qf]').forEach(kbClick); // dlaždice Rychlého hledání i z klávesnice (Tab, Enter)
    $$('[data-qf]').forEach(el => el.onclick = () => {
      const q = QF[+el.dataset.qf][3];
      go('flights');
      const base = { ...defaultForm(), ...prefsOf(S.form), from: (S.home?.from || fromInput.items), to: [], dFrom: addDays(today(), 3), dTo: addDays(today(), 60), dateMode: 'flex', minTemp: 0 };
      const f = { ...base, ...q };
      if (q.len && PRESETS[q.len]) Object.assign(f, { nMin: PRESETS[q.len].nMin, nMax: PRESETS[q.len].nMax, outDays: PRESETS[q.len].out, backDays: PRESETS[q.len].back });
      else if (q.nMin != null) Object.assign(f, { outDays: [], backDays: [] }); // vlastní počet nocí (dálkové lety)
      else Object.assign(f, { len: 'week', nMin: 3, nMax: 9, outDays: [], backDays: [] });
      setForm(f);
      if (!f.from.length) { askFrom(); return; }
      startSearch();
    });
  }

  /**
   * Chybí Odkud (nový uživatel): pole v Letech zvýraznit, pod ním nápověda a po výběru místa hledání spustit samo –
   * uživatel hledat chtěl (dřív jen krátká hláška a hledat znovu ručně). then = co spustit, výchozí hledání formuláře.
   */
  let fromWait = null;
  function askFrom(then = () => startSearch()) {
    fromWait = { then, until: Date.now() + 5 * 60e3 };
    const field = fromInput.el.closest('.field') || fromInput.el;
    field.classList.add('need');
    // nejčastější města jedním klepnutím jako v uvítání (nováček, který napsal jen cíl, nemusí psát odkud)
    if (!$('#fromNeed')) {
      fromInput.el.parentElement.insertAdjacentHTML('afterend', `<div class="need-hint" id="fromNeed">👆 Odkud letíš? Klepni na město, napiš jiné, nebo klepni na 📍 – hledání pak spustím sám.<div class="wc-chips">${SearchHelp.HOME_CITIES.map(c => `<button type="button" class="fchip" data-need="${esc(c[0])}">${esc(c[0])}</button>`).join('')}</div></div>`);
      $$('#fromNeed [data-need]').forEach(b => b.onclick = () => { const h = SearchHelp.homeOf(b.dataset.need); if (h) fromInput.set(h.from); });
    }
    toast('Odkud letíš? Vyplň pole Odkud', 'info');
    setTimeout(() => { field.scrollIntoView({ block: 'center', behavior: 'smooth' }); fromInput.input.focus(); }, 250);
  }
  function fromAnswered() {
    const field = fromInput.el.closest('.field'); if (field) field.classList.remove('need');
    const h = $('#fromNeed'); if (h) h.remove();
    const w = fromWait; fromWait = null;
    if (w && Date.now() < w.until) w.then();
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
    // bez délky ve větě týden jako u běžného hledání (5–9 nocí): „Lisabon a zpět z Porta“ = 7 nocí, ne 3
    const total = p.nMin ? Math.round((p.nMin + (p.nMax || p.nMin)) / 2) : 7;
    return gap(start, Math.max(2, Math.round(total / Math.max(1, n - 1))));
  }
  // „jen přímé“ z věty jen pro tu větu: další věta bez něj ho vypne (zaškrtnuté ručně ve formuláři zůstane)
  function smartDirect(p) {
    const d = SearchHelp.smartDirect(p, S.directSmart);
    S.directSmart = d.smart;
    return 'directOnly' in d ? { directOnly: d.directOnly } : {};
  }
  // věta s víc šipkami → Víc měst: lety mezi místy v pořadí, osoby, zavazadla, přímé lety a cena z věty
  function smartChainRun(hit) {
    const p = hit.sm.patch, c = hit.chain, ds = chainDates(p, c.length - 1);
    const legs = c.slice(0, -1).map((a, i) => ({ from: [a], to: [c[i + 1]], date: ds[i], flex: 0 }));
    const keep = Object.fromEntries(['adults', 'children', 'infants', 'bags', 'directOnly', 'maxPrice'].filter(k => p[k] != null).map(k => [k, p[k]]));
    go('flights');
    setForm({ ...defaultForm(), ...prefsOf(S.form), ...keep, ...smartDirect(p), from: [c[0]], to: [], trip: 'multi', legs });
    startSearch();
  }
  // „do Říma a zpět z Neapole“ → Víc měst: tam do cíle, zpět z místa návratu domů (mezi nimi po zemi)
  function smartBackRun(hit, from) {
    const p = hit.sm.patch, home = (hit.from.length ? hit.from : from && from.length ? from : S.home?.from || []).slice(0, 1);
    go('flights');
    if (!home.length) { askFrom(() => smartBackRun(hit, fromInput.items)); return; }
    const ds = chainDates(p, 2);
    const legs = [{ from: home, to: [hit.to[0]], date: ds[0], flex: 0 }, { from: [hit.back], to: home, date: ds[1], flex: 0 }];
    const keep = Object.fromEntries(['adults', 'children', 'infants', 'bags', 'directOnly', 'maxPrice'].filter(k => p[k] != null).map(k => [k, p[k]]));
    setForm({ ...defaultForm(), ...prefsOf(S.form), ...keep, ...smartDirect(p), from: home, to: [], trip: 'multi', legs });
    startSearch();
  }
  function smartRun(hit, from) {
    if (hit.chain && hit.chain.length >= 3) return smartChainRun(hit);
    if (hit.back && hit.to.length === 1) return smartBackRun(hit, from);
    const p = hit.sm.patch, to = (hit.to.length ? hit.to : hit.sm.items || []).slice(0, 5);
    const f = { ...defaultForm(), ...prefsOf(S.form), from: hit.from.length ? hit.from : (from && from.length ? from : S.home?.from || []), to, ...p, ...smartDirect(p) };
    if (f.dateMode === 'exact' && !f.xBack) f.trip = 'oneway';
    go('flights');
    setForm(f);
    if (!fromInput.items.length) { askFrom(); return; }
    startSearch({ kids: hit.sm.askPax });
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
        if (fromInput.items.length) startSearch(); else askFrom();
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
  /**
   * Cesta z průvodce pro kartu ↩ Pokračuj → { t: S.trip, d: termín ubytování } nebo null: jen ta, která ještě nezačala
   * (průvodce pro uplynulý let už nepomůže); sestavenou a uloženou v Mých cestách ukazuje dlaždice „Nejbližší cesta“
   * (s odpočtem), rozpracovanou naopak tahle karta a dlaždice ji přeskočí (app.js nextTripStat) – jedna cesta jednou.
   */
  function resumeTrip() {
    const t = S.trip, d = t && t.flight && t.flight.out && window.Trip ? (() => { try { return Trip.stayDates(t); } catch (e) { return null; } })() : null;
    const saved = t && t.step === 'summary' && t.created && (S.trips || []).some(x => x && x.tripId === t.created);
    return d && t.flight.out.date >= today() && !saved ? { t, d } : null;
  }
  function renderResume() {
    const host = $('#resumeRow'); if (!host) return;
    const rs = resumeTrip(), trip = rs && rs.t, d = rs && rs.d;
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
    // u shrnutí je cesta sestavená – „Tvoje cesta“ a Otevřít (ne „rozpracovaná“ a Pokračovat); cesta kamaráda z odkazu,
    // kterou si příjemce neuložil, „Sdílená cesta“ (tvoje je až po 💾 Uložit si ji) – SearchHelp.resumeKind
    const kind = trip ? SearchHelp.resumeKind(trip) : '', done = kind === 'done', shared = kind === 'shared';
    // odpočet do odletu – dřív ho ukazovala dlaždice „Nejbližší cesta“ níž, ta teď tuhle cestu přeskakuje
    const dd = trip ? daysTo(today(), trip.flight.out.date) : null, soon = dd == null || shared ? '' : dd <= 0 ? 'dnes' : inDays(dd);
    host.innerHTML = `${trip ? `<div class="card resume-trip"><span class="rs-ico">${shared ? '🔗' : '🧳'}</span><div class="rs-t"><b>${shared ? 'Sdílená cesta' : done ? 'Tvoje cesta' : 'Rozpracovaná cesta'}: ${esc(name)}</b>
        <small>${fmtDate(d.checkin)}–${fmtDate(d.checkout)}${soon ? ` · ${soon}` : ''} · ${shared ? 'z odkazu, zatím neuložená' : done ? 'sestavená – shrnutí a co zarezervovat' : `krok ${esc(STEP_LBL[trip.step] || 'let')}`}${bases && trip.step === 'stay' && !shared ? ` (vybráno ${picked} z ${bases.length})` : ''}</small></div>
        <button type="button" class="btn sm primary" id="rsTrip">${done || shared ? 'Otevřít' : 'Pokračovat'} →</button></div>` : ''}
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
  /** Hledání z domova (jinak z Odkud v Letech) do jednoho cíle d = { id, label, cc }, termíny a lidé jako radar. */
  function watchFormTo(d) {
    const q = favQuery(), from = S.home?.from?.length ? S.home.from : (fromInput ? fromInput.items : []);
    return { ...defaultForm(), ...prefsOf(S.form), from, to: [{ id: d.id, label: d.label, flag: flag(d.cc) }], ...q.form, ...radarPax(q.payload.adults), directOnly: false };
  }
  /** ⭐ Hledat moje cíle: jedno hledání uživatele do prvních 5 cílů z domova radaru, termíny i počet lidí jako radar. */
  function searchFavs(list) {
    if (!list.length) return;
    const q = favQuery(), from = S.home?.from?.length ? S.home.from : fromInput.items;
    go('flights');
    setForm({ ...defaultForm(), ...prefsOf(S.form), from, to: list.slice(0, 5).map(x => ({ id: x.id, label: x.label, flag: flag(x.cc) })), ...q.form, ...radarPax(q.payload.adults), directOnly: false });
    if (!from.length) { askFrom(); return; }
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
    // ♡ hlídání sem jedním klepnutím: z domova do města, termíny a lidé jako radar (jako ⭐ Hledat moje cíle) – dřív
    // jen přes formulář v Letech; na Přehledu pak „zlevnilo“, když cena spadne
    const wf = watchFormTo(d), wOn = wf.from.length > 0 && isWatched(wf);
    modalOpen(`<div class="modal-body dm-modal"><h3>${flag(d.cc)} ${esc(d.label)}</h3>
      <div class="dm-acts"><button type="button" class="btn${p === 'fav' ? '' : ' primary'}" data-dmp="${p === 'fav' ? '' : 'fav'}">${p === 'fav' ? '⭐ Odebrat z mých cílů' : '⭐ Chci tam'}</button><button type="button" class="btn" data-dmp="${p === 'mute' ? '' : 'mute'}">${p === 'mute' ? '👀 Zase ukazovat' : '🙈 Nezajímá mě'}</button>${pin ? `<button type="button" class="btn" id="dmPin">${Pins.has(pinList(), pin) ? '📌 Odebrat z odložených' : `<span>📌 Odložit nabídku · <span class="dp-nw">${czk(Pins.price(pin))}</span> · <span class="dp-nw">${esc(pinWhen(pin))}</span></span>`}</button>` : ''}<button type="button" class="btn" id="dmWatch"${wOn ? ' disabled title="Hledání sem už hlídáš – Přehled → 🔔 Hlídané ceny"' : ''}>${wOn ? '♥ Cenu sem už hlídáš' : '♡ Hlídat cenu sem'}</button></div>
      <p class="faint dm-note">⭐ Moje cíle mají štítek ⭐ a na Přehledu nejnižší cenu, kterou ATLAS viděl. S 🙈 se město v radaru ani v Kamkoliv neukáže – hledání přímo sem ho ukáže vždy.${pin ? ' 📌 Odložit schová nabídku k porovnání (Přehled → 📌 Odložené nabídky).' : ''} ♡ Hlídat cenu sem najde lety (termíny jako radar) a když zlevní, uvidíš to na Přehledu.</p>
      <div class="dm-foot"><button type="button" class="linkbtn" id="dmEdit">Upravit seznamy (⭐ ${pl.fav.length} · 🙈 ${pl.mute.length})</button><button type="button" class="btn ghost sm" id="dmClose">Zavřít</button></div></div>`);
    $$('[data-dmp]', $('#modal')).forEach(b => b.onclick = () => {
      const which = b.dataset.dmp || null, nx = SearchHelp.destPrefSet(prefLists(), d, which);
      if (!nx) { toast(fullTxt(which), 'err'); return; }
      S.fav = nx.fav; S.mute = nx.mute;
      modalClose(); prefsChanged();
      // 🙈 jedním klepnutím schová město z radaru i Kamkoliv – hned jde vrátit (jinak až přes ⋯ → Upravit seznamy)
      const undo = which === 'mute' ? { label: '↩ Vrátit', run: () => { S.fav = pl.fav; S.mute = pl.mute; prefsChanged(); toast(`${d.label} se zase bude ukazovat`); } } : null;
      toast(which === 'fav' ? `Přidáno do mých cílů: ${d.label}` : which === 'mute' ? `${d.label} se v radaru ani v Kamkoliv už neukáže` : p === 'fav' ? `Odebráno z mých cílů: ${d.label}` : `${d.label} se zase bude ukazovat`, null, 2600, undo);
    });
    const dp = $('#dmPin'); if (dp) dp.onclick = () => { modalClose(); if (offer.row) pinToggleRow(offer.row.t, offer.row.g, offer.res); else pinToggleRadar(offer.radar, offer.r, offer.q); };
    // hledání proběhne v Letech (uživatel hned vidí nabídky), uloží ho addWatch; bez domova se nejdřív zeptá, odkud
    $('#dmWatch').onclick = () => {
      modalClose(); go('flights');
      if (!wf.from.length) { setForm(wf); askFrom(() => addWatch(getForm())); return; }
      addWatch(wf);
    };
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
        <div class="faint fav-note" title="Jen letenka – bez cesty na letiště, do města a zavazadel; s odletem od tohoto měsíce. Telefon a počítač mají každý svou paměť cen.">Cena = nejlevnější zpáteční letenka na osobu, jakou ATLAS viděl v tomhle zařízení.</div>`
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

  /**
   * 📌 Odložené nabídky na Přehledu (pod ⭐ Moje cíle): dlaždice v pořadí jako 📌 Porovnat (Pins.sorted – i s cestou
   * na letiště a do města, ta je pak na dlaždici vidět), klepnutím Porovnat s tou nabídkou na očích.
   */
  function renderPins() {
    const host = $('#pinSec'); if (!host) return;
    const list = Pins.sorted(pinList()), now = Date.now();
    host.hidden = !list.length;
    if (!list.length) { host.innerHTML = ''; return; }
    const tile = p => {
      const a = Pins.age(p.at, now), one = p.kind === 'r' ? !p.r.d2 : !p.t.back, d = Pins.door(p);
      return `<button type="button" class="fav-i" data-pinx="${esc(p.k)}"><span class="fav-n">${flag(p.dest.cc)} <b>${esc(p.dest.label)}</b></span><span class="fav-p">od <b>${czk(Pins.price(p))}</b>/os.</span>`
        + (d.ground != null || d.arr != null ? `<span class="fav-w">i s cestou ${d.full ? '' : 'aspoň '}~${czk(d.total)}/os.</span>` : '')
        + `<span class="fav-w">${esc(pinWhen(p))}${one ? ' jen tam' : ''}${a ? ` · <span class="pin-age${a.day ? ' old' : ''}">${a.day ? `⚠ ${esc(a.ago)}` : `ceny ${a.z} ${esc(a.when)}`}</span>` : ''}</span></button>`;
    };
    host.innerHTML = `<div class="section-head"><h2>📌 Odložené nabídky <span class="faint" style="font-size:13px;font-weight:600">· ${list.length}</span></h2><button type="button" class="link" id="pinAll">Porovnat →</button></div>
      <div class="card fav-card"><div class="fav-strip">${list.map(tile).join('')}</div></div>`;
    $('#pinAll').onclick = () => openPins();
    $$('[data-pinx]', host).forEach(b => b.onclick = () => openPins({ focus: b.dataset.pinx }));
  }
  const PIN_BAGS = { none: 'bez kufru', cabin: '🧳 kabinový kufr', checked: '🧳 kufr k odbavení' };
  const PIN_FUEL = { diesel: 'nafta', petrol: 'benzín', ev: 'elektro' };
  // pro koho a s čím je cena spočítaná (nabídky z různých hledání se tím liší); cestu do města ukáže „Celkem i s cestou“
  const pinBasis = q => [`pro ${SearchHelp.paxShort(q)}`, PIN_BAGS[q.bags] || PIN_BAGS.none, !q.kmRate ? 'bez dopravy na letiště' : q.groundMode === 'car' ? `🚗 autem na letiště${PIN_FUEL[q.carFuel] ? ` (${PIN_FUEL[q.carFuel]})` : ''}` : 'vlakem/busem na letiště'].join(' · ');
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
  const PIN_MISS = { ground: 'dopravy na letiště', arr: 'cesty do města' };
  const missTxt = ks => ks.map(k => PIN_MISS[k]).join(' a ');
  /**
   * Pořadí karty podle ceny i s cestou (Pins.rank): „nejlevnější celkem“, „+450 Kč“, u neúplné „aspoň +450 Kč“ nebo
   * „možná levnější?“ (bez neznámé části vychází levněji než nejlevnější úplná) → [třída, text, title] nebo null.
   */
  function pinRel(x) {
    const ty = x.d.miss.length > 1 ? 'ty' : 'tu';
    if (x.best) return ['good', 'nejlevnější celkem', x.d.full ? 'Nejnižší cena na osobu i s odhadem dopravy na letiště a do města' : `Nejnižší cena na osobu – bez ${missTxt(x.d.miss)} (${ty} u žádné nabídky neznám)`];
    if (x.maybe) return ['warn', 'možná levnější?', `Bez ${missTxt(x.d.miss)} (${ty} neznám) vychází levněji než nejlevnější úplná nabídka – s ${ty === 'ty' ? 'nimi' : 'ní'} může vyjít levněji i dráž`];
    if (x.diff == null) return null;
    const v = x.diff ? `+${czk(x.diff)}` : 'stejně';
    return x.exact ? ['', v, 'O kolik dráž než nejlevnější odložená nabídka i s cestou na letiště a do města (odhad)']
      : ['', `aspoň ${v}`, `Bez ${missTxt(x.d.miss)} (${ty} neznám) – rozdíl bude ještě větší`];
  }
  /**
   * Řádek „Celkem i s cestou ~3 450 Kč/os.“ s rozpisem (letenka + doprava na letiště a zpět + z letiště do města a zpět,
   * průměrné ceny). Neznámou část řekne nahlas („aspoň“, „doprava na letiště neznámá“) – do součtu ji nepočítá.
   */
  function pinDoor(p, d) {
    const back = p.kind === 'r' ? Boolean(p.r.d2) : Boolean(p.t.back), car = p.q.groundMode === 'car', zp = back ? ' a zpět' : '';
    const g = d.ground != null ? `<span title="Odhad ${car ? 'cesty autem (palivo, parkování a známky děleno počtem lidí)' : 'jízdenek veřejnou dopravou'} z domova na letiště${zp} na osobu – průměrná cena">${car ? '🚗' : '🚆'} na letiště${zp} ~${czk(d.ground)}</span>`
      : `<span class="pin-unk">${car ? '🚗' : '🚆'} doprava na letiště ${p.q.kmRate === 0 ? 'se v hledání nepočítala' : 'neznámá'}</span>`;
    const ar = d.arr != null ? `<span title="Odhad jízdného z letiště do města${zp ? ' a zpět na letiště' : ''} na osobu – průměrná cena">🚌 do města${zp} ~${czk(d.arr)}</span>`
      : '<span class="pin-unk">🚌 cesta do města neznámá</span>';
    return `<div class="pin-door${d.full ? '' : ' part'}"><div class="pin-dt">Celkem i s cestou <b>${d.full ? '' : 'aspoň '}~${czk(d.total)}</b>/os.</div>
      <div class="pin-dd">${p.kind === 'f' && p.t.bagCzk ? 'letenky se zavazadly' : back ? 'letenky' : 'letenka'} ${czk(d.ticket)} + ${g} + ${ar}</div>${d.ground != null || d.arr != null ? '<div class="pin-dn">odhad – průměrné ceny dopravy</div>' : ''}</div>`;
  }
  /** Karta porovnání: plná nabídka (rozpis ceny, termín, lety, stáří a základ ceny, akce) nebo karta radaru (co zná). x = řádek Pins.rank. */
  function pinCard(x, now) {
    const p = x.p, a = Pins.age(p.at, now), day = v => `<span class="dp-nw">${dayLabel(v)}</span>`, rl = pinRel(x);
    const rel = rl ? `<div class="pin-rel"><span class="b${rl[0] ? ' ' + rl[0] : ''}" title="${esc(rl[2])}">${esc(rl[1])}</span></div>` : '';
    // plná nabídka: řádek s dopravou pod cenou potřebuje celou šířku karty – rozdíl proti nejlevnější mezi štítky
    const relB = rl ? `<span class="b${rl[0] ? ' ' + rl[0] : ''}" title="${esc(rl[2])}">${esc(rl[1])}</span>` : '';
    const tail = (a ? `<div class="pin-age${a.day ? ' old' : ''}">${a.day ? `⚠ cena ${a.z} ${esc(a.txt)} – může být jiná` : `ceny ${a.z} ${esc(a.txt)}`}</div>` : '') + `<div class="pin-ln faint">${esc(pinBasis(p.q))}</div>`;
    if (p.kind === 'r') {
      const r = p.r, pax = SearchHelp.paxOf(p.q).seats;
      const buy = (r.buy || []).filter(b => /^https?:\/\//i.test(String(b[0] || ''))).map(([u, pv, leg]) => `<a class="btn sm book" style="--pc:${provColor(pv)}" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${leg === 'out' ? `Tam: ${esc(shopName(pv))}` : leg === 'back' ? `Zpět: ${esc(shopName(pv))}` : `Koupit ${pv === 'travelpayouts' ? 'na Aviasales' : 'u ' + esc(shopName(pv))}`} ↗</a>`).join('');
      return `<div class="card pin-card" data-pk="${esc(p.k)}">${pinHead(p)}
        <div class="pin-pr"><div class="pbox"><div class="pp">${czk(r.czk)}</div><div class="pl">na osobu</div><div class="pd">${r.d2 ? 'zpáteční letenka' : 'letenka'}</div>${pax > 1 ? `<div class="pd">celkem ${pax} os.: <b>${czk(r.czk * pax)}</b></div>` : ''}</div>${rel}</div>
        ${pinDoor(p, x.d)}
        <div class="pin-ln">✈︎ ${esc(SearchHelp.radarRoute(r))} · ${day(r.d1)}${r.d2 ? ` – ${day(r.d2)} · ${nightsTxt(SearchHelp.diffDays(r.d1, r.d2))}` : ' · jen tam'}${radarLeave(r)}</div>
        <div class="pin-ln faint">z radaru – rozpis ceny a lety ukáže hledání</div>${tail}
        <div class="pin-act"><button type="button" class="btn sm primary" data-psrch="${esc(p.k)}">🔎 Najít tento termín →</button>${buy ? `<div class="tr-buy">${buy}</div>` : ''}</div></div>`;
    }
    const t = p.t, lv = SearchHelp.leaveDays(t.out, t.back), lt = lv && SearchHelp.leaveTxt(lv), dw = p.was ? t.perPersonCzk - p.was.czk : 0;
    return `<div class="card pin-card" data-pk="${esc(p.k)}">${pinHead(p)}
      <div class="pin-pr">${priceBox(t, null, pinRes(p), false)}</div>
      ${pinDoor(p, x.d)}
      <div class="pin-tags">${relB}${priceTag(t, null, t.priceLevel || null)}${p.part ? '<span class="b" title="Pomalejší zdroje tehdy ještě hledaly – úroveň ceny a statistika chybí">z průběžných výsledků</span>' : ''}</div>
      <div class="pin-ln">🗓️ ${day(t.out.date)}${t.back ? ` – ${day(t.back.date)}${t.nights != null ? ` · ${nightsTxt(t.nights)}` : ''}${lt ? ` · <span title="${esc(lt.title)}">${esc(lt.text)}</span>` : ''}` : ' · jen tam'}</div>
      ${pinLeg(t.out)}${t.back ? pinLeg(t.back, true) : ''}${tail}
      ${dw ? `<div class="pin-ln ${dw < 0 ? 'good' : 'pin-warn'}" title="Při odložení ${czk(p.was.czk)}/os.">${dw < 0 ? '↓' : '↑'} o ${czk(Math.abs(dw))} od odložení</div>` : ''}${pinLive(p)}
      <div class="pin-act"><button type="button" class="btn sm primary" data-pgo="${esc(p.k)}">Vybrat a pokračovat →</button><div class="tr-buy">${bookButtons(t)}</div>${buyNote(t)}${kidsNote(p.q, buyProvs(t))}<div class="tr-more">${verifyLinks(t, p.q.adults)}</div></div></div>`;
  }
  // ⚡ Ověřit ceny: plné nabídky (ne demo) bez čerstvého ověření, nejstarší ceny první, nejvýš 3 na klepnutí
  let pinBusy = false;
  const pinTodo = () => pinList().filter(p => p.kind === 'f' && !p.demo && !liveGet(SearchHelp.liveKey(p.t, p.q.adults))).sort((a, b) => a.at - b.at).slice(0, 3);
  /** 📌 Porovnat (okno): karty podle ceny na osobu – na telefonu pruh do strany, na počítači mřížka. focus = klíč nabídky. */
  function openPins({ focus = null, keep = false } = {}) {
    const rk = Pins.rank(pinList()), list = rk.rows.map(x => x.p), now = Date.now(), m = $('#modal');
    if (!list.length) { if (keep) modalClose(); return; }
    const sc0 = keep && $('.pin-cards', m), sx = sc0 ? sc0.scrollLeft : 0, sy = keep ? m.scrollTop : 0, todo = pinTodo();
    const old = list.filter(p => (Pins.age(p.at, now) || {}).day).length;
    // poškozená nabídka (cizí záloha) nesmí rozbít okno – aspoň ✕
    const card = x => { try { return pinCard(x, now); } catch (e) { return `<div class="card pin-card" data-pk="${esc(x.p.k)}">${pinHead(x.p)}<div class="pin-ln faint">Nabídku se nepodařilo zobrazit.</div></div>`; } };
    modalOpen(`<div class="modal-body pin-modal">
      <div class="pin-top"><h3>📌 Odložené nabídky <span class="faint">${list.length}/${Pins.MAX}</span></h3><button type="button" class="icon-btn pin-close" id="pinX" aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button></div>
      <div class="faint pin-why">Pořadí podle ceny na osobu <b>i s cestou</b>: letenka + odhad dopravy na letiště a z letiště do města${rk.skip.length ? ` – bez ${missTxt(rk.skip)}, ${rk.skip.length > 1 ? 'ty' : 'tu'} u žádné nabídky neznám` : ''}.</div>
      ${new Set(list.map(p => Pins.basis(p.q))).size > 1 ? '<div class="note info pin-note">ℹ️ <div>Nabídky jsou spočítané pro jiný počet lidí, zavazadla nebo dopravu na letiště – porovnávej i řádek „letenky“.</div></div>' : ''}
      ${old ? `<div class="note warn pin-note">⚠️ <div>${old === 1 ? '1 cena je starší než 24 h – před nákupem ji ověř.' : `${old} ${old <= 4 ? 'ceny jsou' : 'cen je'} starší než 24 h – před nákupem je ověř.`}</div></div>` : ''}
      <div class="pin-cards">${rk.rows.map(card).join('')}</div>
      <div class="pin-foot"><button type="button" class="btn sm" id="pinShare">📤 Poslat k výběru</button>${pinBusy || todo.length ? `<button type="button" class="btn sm" id="pinVerify"${pinBusy ? ' disabled' : ''}>${pinBusy ? '<span class="spin dark"></span> Ověřuji…' : `⚡ Ověřit ceny (${todo.length})`}</button><span class="faint pin-vn">přes Kiwi.com, nejvýš 3 nejstarší ceny</span>` : ''}</div>
      <textarea class="pin-txt" id="pinTxt" rows="8" readonly hidden aria-label="Text k zkopírování"></textarea></div>`);
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
    setForm({ ...defaultForm(), ...prefsOf(S.form), from: S.home?.from?.length ? S.home.from : fromInput.items, to: [{ id: p.dest.id || `ap:${r.to}`, label: p.dest.label, flag: flag(p.dest.cc) }], dateMode: 'exact', xOut: r.d1, xFlex: 0, ...(ret ? { trip: 'return', xBack: r.d2 } : { trip: 'oneway' }), ...radarPax(p.q.adults), directOnly: false });
    if (!getForm().from.length) { askFrom(() => startSearch({ card: r })); return; }
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

  /* ---------- 📤 Sdílet jednu nabídku odkazem #offer=… (offershare.js, zkomprimovaný – sharelink.js) ---------- */
  // JSON nabídky z řádku výpisu i = rowRegistry (stejný záznam jako 📌 Odložit – cena s časem výpisu); jinak null
  function offerJson(i) {
    const r = rowRegistry[i], res = shownRes || lastResult, now = Date.now();
    const rec = r && res && Pins.fromRow(r.t, r.g, res, SearchHelp.shownAt(res, lastResultAt, now), now);
    try { return rec ? OfferShare.json(rec) : null; } catch (e) { return null; }
  }
  function offerPrep(i) { const j = offerJson(i); if (j) ShareLink.prepare('offer', j); }
  /** Sdílení telefonu (WhatsApp, e-mail…) s textem a odkazem, jinak text s odkazem do schránky, jinak k ručnímu zkopírování. */
  async function offerShare(i) {
    const j = offerJson(i);
    if (!j) return toast('Tuhle nabídku sdílet nejde', 'err');
    const o = JSON.parse(j), e = ShareLink.prepare('offer', j), text = OfferShare.text(o);
    const url = e.url || await e.done;
    if (navigator.share) {
      try { await navigator.share({ title: `✈️ ${o.dest.label}`, text, url }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Nabídka zkopírovaná – vlož ji do zprávy'); return; } catch (err) { }
    prompt('Zkopíruj odkaz na nabídku:', url);
  }
  // let sdílené nabídky jedním řádkem „🛫 pá 14. 11. 06:10 PRG → NAP 08:05 · přímý · Ryanair“
  const offerLeg = (l, back) => `<div class="pin-ln">${back ? '🛬' : '🛫'} <span class="dp-nw">${dayLabel(l.date)}</span> ${[`${l.dep ? esc(l.dep.slice(11, 16)) + ' ' : ''}${esc(l.from)} → ${esc(l.to)}${l.arr ? ' ' + esc(l.arr.slice(11, 16)) : ''}`, l.stops ? `${l.stops}× přestup` : l.stops === 0 ? 'přímý' : '', esc(l.air)].filter(Boolean).join(' · ')}</div>`;
  /** Karta nabídky ze sdíleného odkazu (#offer=, app.js): cena z doby sdílení s upozorněním, Koupit a Hledat znovu. */
  function openOffer(o) {
    const a = o.at ? Pins.age(o.at, Date.now()) : null, past = o.out.date < today(), pq = OfferShare.paxQ(o), note = SearchHelp.paxNote(pq);
    const buy = o.buy.map(([u, pv, leg]) => `<a class="btn sm book" style="--pc:${provColor(pv)}" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${leg === 'out' ? `Tam: ${esc(shopName(pv))}` : leg === 'back' ? `Zpět: ${esc(shopName(pv))}` : `Koupit${pv === 'travelpayouts' ? ' na Aviasales' : pv ? ' u ' + esc(shopName(pv)) : ''}`} ↗</a>`).join('');
    modalOpen(`<div class="modal-body offer-modal">
      <div class="pin-top"><h3>📤 Sdílená nabídka</h3><button type="button" class="icon-btn pin-close" id="ofX" aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button></div>
      <div class="note warn pin-note">⚠️ <div>${past ? '<b>Termín už proběhl.</b> Hledej nový – formulář předvyplním.' : `<b>Cena se mohla změnit.</b> ${a ? `Je ${a.z} ${esc(a.txt)}` : 'Je z doby sdílení'} – aktuální ukáže Koupit nebo nové hledání.`}</div></div>
      <div class="card pin-card">
        <div class="pin-h"><span class="pin-f">${flag(o.dest.cc)}</span><b class="pin-n">${esc(o.dest.label)}</b>${o.demo ? '<span class="b warn" title="Demo data – cena je vymyšlená">DEMO</span>' : ''}</div>
        <div class="pbox"><div class="pp">${czk(o.czk)}</div><div class="pl">${o.back ? 'letenky tam i zpět' : 'letenka'} na osobu${o.bags !== 'none' ? ` · ${esc(PIN_BAGS[o.bags])}` : ''}</div>${SearchHelp.paxTotalOn(pq) && o.total ? `<div class="pd">${SearchHelp.paxTotalLbl(pq)}: <b>${czk(o.total)}</b></div>` : ''}${note ? `<div class="pd pax-note">👶 ${esc(note)}</div>` : ''}</div>
        <div class="pin-ln">🗓️ ${o.back ? `${o.nights != null ? nightsTxt(o.nights) : `${SearchHelp.diffDays(o.out.date, o.back.date)} dní`}` : 'jen tam'}</div>
        ${offerLeg(o.out)}${o.back ? offerLeg(o.back, true) : ''}
        <div class="pin-act"><button type="button" class="btn sm primary" id="ofAgain">🔎 Hledat znovu</button>${buy && !past ? `<div class="tr-buy">${buy}</div>` : ''}</div>
      </div></div>`);
    $('#ofX').onclick = () => modalClose();
    $('#ofAgain').onclick = () => offerSearch(o);
  }
  /** Hledat znovu: formulář s trasou, termínem a počtem lidí nabídky – hledání spustí až uživatel. */
  function offerSearch(o) {
    modalClose();
    go('flights');
    // letiště odletu se svým názvem z domova / minulého hledání, jinak kód (jako searchLegs)
    const k = [...(S.home?.from || []), ...(S.form?.from || [])].find(x => x && x.id === 'ap:' + o.out.from);
    const from = [k ? { ...k } : { id: 'ap:' + o.out.from, label: o.out.from, flag: '', type: 'airport' }];
    // termín jen v mezích serveru (jako searchTo): odlet nejvýš ~rok dopředu, zpáteční nejvýš 45 nocí
    const x = o.out.date, y = o.back && o.back.date;
    const ex = x >= today() && x <= addDays(today(), 359) ? { dateMode: 'exact', xOut: x, xFlex: 0, ...(y && SearchHelp.diffDays(x, y) <= 45 ? { trip: 'return', xBack: y } : { trip: 'oneway' }) } : {};
    setForm({ ...defaultForm(), ...prefsOf(S.form), from, to: [{ id: o.dest.id || 'ap:' + o.out.to, label: o.dest.label, flag: flag(o.dest.cc) }], ...ex, ...OfferShare.paxQ(o), bags: o.bags, directOnly: false });
    draftSoon(); // předvyplněné, ale nehledané – přežije i zavření aplikace (třeba při kontrole termínu v kalendáři)
    expandForm();
    $('#searchForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(ex.xOut ? 'Formulář je předvyplněný – hledání spustíš tlačítkem dole' : 'Termín už proběhl – vyber nový a spusť hledání');
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
  // dFrom / dTo: odlet kdykoliv v rozmezí (Doporučení – měsíc, na který tip platí)
  function searchTo(items, { xOut = '', xBack = '', dFrom = '', dTo = '' } = {}) {
    go('flights');
    // odkud jako minulé hledání, jinak domov radaru
    const o = S.form && S.form.from?.length ? { from: S.form.from, radius: S.form.radius ?? 200, exclude: S.form.exclude || [] }
      : S.home && S.home.from?.length ? { from: S.home.from, radius: S.home.radius ?? 200, exclude: [] } : {};
    // termín cesty z plánovače (ještě před ní): přesná data, s návratem tam i zpět
    // v mezích serveru: odlet nejvýš ~rok dopředu, zpáteční nejvýš 45 nocí (delší pobyt → jen tam)
    const ymd = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
    // (359: server v UTC má po půlnoci našeho času ještě včerejšek – jeho limit 360 dní by jinak den přetekl)
    const ex = ymd(xOut) && xOut >= today() && xOut <= addDays(today(), 359)
      ? { dateMode: 'exact', xOut, xFlex: 0, ...(ymd(xBack) && xBack >= xOut && SearchHelp.diffDays(xOut, xBack) <= 45 ? { trip: 'return', xBack } : { trip: 'oneway' }) }
      : ymd(dFrom) && ymd(dTo) && dTo >= dFrom && dTo >= today() ? { dateMode: 'flex', dFrom: dFrom < today() ? today() : dFrom, dTo } : {};
    const f = { ...defaultForm(), ...prefsOf(S.form), ...o, ...ex, to: items }; // odkud jako minulé hledání
    setForm(f);
    if (!f.from.length) { askFrom(); return; }
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
    modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button>
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
    // 📌 odložené ze starší verze (cena i s dopravou na letiště): jednou přepočítat na letenku, karty radaru bez rozpisu zahodit
    if (Array.isArray(S.pins) && S.pins.some(p => p && p.pv !== 2)) { S.pins = Pins.clean(S.pins, { today: today() }); save(); }
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
      // ±20 % náhodně: po výpadku nebo nasazení se všechny otevřené aplikace neptají znovu ve stejnou vteřinu
      const t = setTimeout(go, Math.round(wait * (0.8 + Math.random() * 0.4))); wait = Math.min(wait * 2, 300000);
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
    PROV.travelpayouts = PROV.travelpayouts || { name: 'Ostatní aerolinky', color: '#c25100' };
    PROV.mix = { name: 'kombinace', color: '#4970cc' };
    renderSources();
    buildForm();
    const base = SearchHelp.formSig(S.form);
    setForm(S.form || defaultForm());
    draftStart(base); // 📝 rozepsané hledání přes poslední hledání (obnovené výsledky níž zůstanou)
    updateHomeChip();
    restoreLast();
    renderRecent();
    renderQuick(); // Nápady, kam letět – i na Letech
    heroFrom = new PlaceInput($('#heroFrom'), { origin: true, placeholder: 'Brno, Vídeň, Česko…', hint: ODKUD_HINT, dark: true, max: 3, onChange: heroHome });
    heroTo = new PlaceInput($('#heroTo'), { placeholder: 'kamkoliv 🌍, „k moři v květnu“', hint: KAM_HINT, dark: true, max: 4,
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
  window.Flights = { init, warm, busy, ageCheck, lastPick, renderQuick, renderResume, resumeTrip, renderWatch, showWatch, renderRadar, renderNews, radarNow, renderFav, refreshPrefs: prefsPaint, homeChanged, homeFromChip,renderPins, refreshPins: pinsPaint, openOffer, searchTo, searchLegs, repaintMap: () => { if (view.mode === 'map' && lastResult) rerender(true); }, PlaceInput, smartRun, smartTips, runSearch, watchStatTxt, priceCheck: openPriceCheck, priceTag, watchKey, updateHomeChip,
    // navštívené země se změnily (mapa, země, 💾 obnova) → 🆕 a „jen nové země“ ve výsledcích hned podle nich
    refreshVisited: () => { if (lastResult && lastResult.mode !== 'multi' && !running && $('#results') && $('#results').children.length) rerender(true); },
    // 🏠 vlastní ceny na letiště se změnily (💾 obnova) → náhled letišť a seznam cen ve formuláři znovu
    refreshOrigins: () => { if (fromInput && $('#originPills')) refreshOrigins(); } };
})();
