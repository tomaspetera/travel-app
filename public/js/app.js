/* ATLAS – jádro aplikace: navigace, přehled, mapa, země, plánovač, doporučení.
   Vyhledávání letů je v flights.js. */

/* ================= HELPERS ================= */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const flag = iso => iso && iso.length === 2 ? String.fromCodePoint(...[...iso.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🏳️';
const enc = encodeURIComponent;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Do odkazů jen http(s) – sdílený odkaz na cestu nebo odpověď API nesmí podstrčit javascript: apod.
const safeUrl = u => /^https?:\/\//i.test(String(u ?? '').trim()) ? String(u).trim() : '#';
// URL do CSS url('…') – uvozovky a závorky zakódovat, aby nešlo vyskočit z hodnoty.
const cssUrl = u => safeUrl(u).replace(/['"()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const MNS = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
/** Nejlepší měsíce jako rozsahy: [1,2,3,7,8,9] → „led–bře · čvc–zář“, přes konec roku [11,12,1,2] → „lis–úno“ (ne jen první tři). */
function monthRanges(ms) {
  const set = new Set((ms || []).filter(m => m >= 1 && m <= 12));
  if (!set.size) return '';
  if (set.size === 12) return 'celý rok';
  const start = [...set].sort((a, b) => a - b).filter(m => !set.has(m === 1 ? 12 : m - 1));
  return start.map(m0 => { let m = m0; while (set.has(m === 12 ? 1 : m + 1)) m = m === 12 ? 1 : m + 1; return m === m0 ? MNS[m0 - 1] : `${MNS[m0 - 1]}–${MNS[m - 1]}`; }).join(' · ');
}
const MNS_FULL = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const MNS_LOC = ['v lednu', 'v únoru', 'v březnu', 'v dubnu', 'v květnu', 'v červnu', 'v červenci', 'v srpnu', 'v září', 'v říjnu', 'v listopadu', 'v prosinci']; // „odlet v listopadu“
const CONTS = ['Evropa', 'Asie', 'Afrika', 'Severní Amerika', 'Jižní Amerika', 'Oceánie'];
const pad = n => String(n).padStart(2, '0');
const fmtYMD = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtDate = s => { if (!s) return ''; const [, m, d] = s.split('-'); return `${+d}.${+m}.`; };
// „733 Kč“ s pevnou mezerou – na telefonu se „Kč“ neodtrhne od částky na další řádek (Je to dobrá cena?, z letišť od …)
const czk = n => n == null || !isFinite(n) ? '—' : Math.round(n).toLocaleString('cs-CZ') + '\u00a0Kč';

let COUNTRIES = [];
const byIso = {}, byM49 = {}, byEn = {};
let TOT = 197; const CONT_TOT = {};

/* ================= STATE ================= */
const LS = 'atlas_v1';
let S = load();
function load() { try { const d = JSON.parse(localStorage.getItem(LS)); if (d) return migratePrices(Object.assign(defState(), d), d.pv); } catch (e) { } return defState(); }
// Ceny letů jsou od pv 2 jen za letenku (+ zavazadla), dřív i s dopravou na letiště a do města: uložené karty radaru
// se načtou znovu a „naposledy prohlížené“ ceny zapomenou – jinak by vedle nových cen vypadaly dráž („zlevnilo“).
// Hlídané ceny si nový základ vezmou při příští kontrole (Alerts, w.pv), odložené nabídky se přepočítají (Pins).
// pv = verze uloženého stavu (před doplněním výchozích hodnot – defState už pv 2 má).
function migratePrices(s, pv) {
  if (pv === 2) return s;
  return { ...s, pv: 2, radar: null, viewed: (s.viewed || []).map(x => (x && typeof x === 'object' ? { ...x, czk: null } : x)) };
}
// theme: null = podle systému, dokud uživatel motiv nepřepne (themeOf)
function defState() { return { visited: [], trips: [], theme: null, mapStyle: 'light', geo: {}, weather: {}, fx: null, home: null, watch: [], form: null, recent: [], radar: null, radarMode: 'all', radarHoliday: null, backupAt: null, accessOwn: {}, fav: [], mute: [], pins: [], viewed: [], pv: 2 }; }
// Plné úložiště: uvolnit místo po uložených výsledcích posledního hledání (flights.js) – stav aplikace má přednost.
// Vrací, jestli se stav uložil (💾 obnova ze zálohy při plném úložišti nic nesloučí).
function save() {
  try {
    const s = JSON.stringify(S);
    try { localStorage.setItem(LS, s); } catch (e) { localStorage.removeItem('atlas_last'); localStorage.setItem(LS, s); }
    return true;
  } catch (e) { return false; }
}
let curIso = null;
const visited = new Set(S.visited);
function setVisited(iso, on) { on ? visited.add(iso) : visited.delete(iso); S.visited = [...visited]; save(); refreshStats(); paintMap(); if (window.Flights && Flights.refreshVisited) Flights.refreshVisited(); }

function initCountries(list) {
  COUNTRIES = list;
  COUNTRIES.forEach(c => { byIso[c.iso2] = c; byM49[String(c.m49).padStart(3, '0')] = c; byEn[norm(c.en)] = c; });
  Object.entries({ 'united states of america': 'US', 'dem. rep. congo': 'CD', 'democratic republic of the congo': 'CD', 'dominican rep.': 'DO', 'central african rep.': 'CF', 'eq. guinea': 'GQ', 'bosnia and herz.': 'BA', 'n. macedonia': 'MK', 's. sudan': 'SS', 'solomon is.': 'SB', 'republic of the congo': 'CG', 'congo': 'CG', "côte d'ivoire": 'CI', 'ivory coast': 'CI', 'korea': 'KR', 'dem. rep. korea': 'KP', 'lao pdr': 'LA', 'viet nam': 'VN', 'russian federation': 'RU', 'syria': 'SY', 'moldova': 'MD', 'brunei': 'BN', 'the gambia': 'GM', 'swaziland': 'SZ', 'timor-leste': 'TL', 'east timor': 'TL', 'kosovo': 'XK', 'macedonia': 'MK', 'czech rep.': 'CZ', 'czechia': 'CZ', 'w. sahara': 'EH', 'falkland is.': 'FK', 'fr. s. antarctic lands': 'TF', 'n. cyprus': 'CY', 'somaliland': 'SO', 'palestine': 'PS', 'eswatini': 'SZ', 'turkiye': 'TR', 'türkiye': 'TR' })
    .forEach(([k, v]) => { if (byIso[v]) byEn[norm(k)] = byIso[v]; });
  TOT = COUNTRIES.length;
  CONTS.forEach(k => CONT_TOT[k] = COUNTRIES.filter(c => c.cont === k).length);
}

/* ================= NAV / SHELL ================= */
const NAV = [['dashboard', 'Přehled', 'Radar cen a tvoje cesty', 'M3 12l9-9 9 9M5 10v10h14V10'],
['flights', 'Lety', 'Nejlevnější letenky ze všech letišť v okolí', 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z'],
['trip', 'Cesta', 'Let → trasa → ubytování → auto → program → shrnutí', 'M9 6V4h6v2M3 7h18v13H3zM8 7v13M16 7v13'],
['explore', 'Objevuj', 'Co vidět a kam vyrazit kdekoliv na světě', 'M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z'],
['map', 'Mapa', 'Procestuj svět a odškrtávej země', 'M9 20l-5.5 2.5V5L9 2.5m0 17.5l6-3m-6 3V2.5m6 14.5l5.5 2.5V5L15 2.5m0 14.5V2.5m-6 0l6 3'],
['countries', 'Země', 'Počasí, ceny, bezpečnost a tipy', 'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2c2.5 2.7 4 6.3 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.3-4-10s1.5-7.3 4-10z'],
['planner', 'Plánovač', 'Naplánuj si celou cestu', 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z'],
['recommend', 'Doporučení', 'Kam se vyplatí jet právě teď', 'M12 2l2.4 7.4H22l-6 4.3 2.3 7.3-6.3-4.6L5.7 21 8 13.7 2 9.4h7.6z']];
let activeView = 'dashboard';
function ico(d) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`; }
function buildNav() {
  // U přehledu odznak „zlevnilo“ z hlídaných cen (plní flights.js).
  $('#nav').innerHTML = NAV.map(n => `<div class="nav-item" data-view="${n[0]}">${ico(n[3])}<span>${n[1]}</span>${n[0] === 'map' ? '<span class="nav-badge" id="navBadge">0</span>' : n[0] === 'dashboard' ? '<span class="nav-badge drop" id="navDrops" title="Hlídané ceny, které od minule zlevnily" hidden></span>' : ''}</div>`).join('');
  // Na mobilu dole pět míst: Přehled, 3 sekce, které uživatel otevírá nejčastěji (bez historie Lety, Cesta, Objevuj),
  // a ⋯ Další – ostatní sekce jako dlaždice, záloha, vzhled, instalace. Výběr jen při spuštění (lišta se pod rukou
  // nemění), sekce v liště v pevném pořadí; pět míst = stejná šířka jako dřív. Svět = mapa a země s přepínačem nahoře.
  navBar = navSlots(S.navUse);
  const mi = k => k === 'world'
    ? `<div class="mi" id="worldNav" title="Svět" aria-label="Svět – mapa a země">${ico(NAV.find(n => n[0] === 'countries')[3])}<span>Svět</span></div>`
    : (n => `<div class="mi" data-view="${k}" title="${n[1]}" aria-label="${n[1]}">${ico(n[3])}<span>${n[1]}</span>${k === 'dashboard' ? '<i class="mi-dot" id="mobDrops" hidden></i>' : ''}</div>`)(NAV.find(n => n[0] === k));
  $('#mobileNav').innerHTML = ['dashboard', ...navBar].map(mi).join('')
    + `<div class="mi" id="moreNav" title="Další" aria-label="Další – ostatní sekce, záloha a vzhled">${ico('M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z')}<span>Další</span></div>`;
  $$('[data-view]').forEach(el => el.onclick = () => go(el.dataset.view));
  // Postranní panel (počítač, tablet – na telefonu skrytý): sekce přidá krok historie jako na webu – Zpět prohlížeče
  // vrátí na sekci, odkud uživatel přišel (ne vždy na Přehled), a tam, kde na ní byl. Z klávesnice Tab + Enter.
  $$('.nav-item').forEach(el => {
    el.tabIndex = 0; el.setAttribute('role', 'link');
    el.onclick = () => go(el.dataset.view, { drill: true });
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
  });
  const wn = $('#worldNav'); if (wn) wn.onclick = () => go(WORLD_VIEWS.includes(activeView) ? activeView : lastWorld);
  $$('.world-tabs [data-w]').forEach(b => b.onclick = () => go(b.dataset.w, { keepScroll: true }));
  $('#moreNav').onclick = openMore;
  $('#menuBtn').onclick = openMore;
}
// sekce, které mohou být v liště (world = Mapa a Země); výchozí náskok, aby jedno otevření pořadí nepřehodilo
const NAV_PICK = ['flights', 'trip', 'explore', 'world', 'planner', 'recommend'];
const NAV_PRIOR = { flights: 6, trip: 4, explore: 3, world: 2, planner: 0, recommend: 0 };
const NAV_INFO = { world: ['Svět', 'Mapa procestovaných zemí a průvodce zeměmi', 'countries'] };
let navBar = ['flights', 'trip', 'explore'], navLast = null;
/** 3 sekce do spodní lišty podle počtu otevření (+ výchozí náskok), v pevném pořadí NAV_PICK. */
function navSlots(use) {
  const sc = k => ((use && use[k]) || 0) + NAV_PRIOR[k];
  return NAV_PICK.slice().sort((a, b) => sc(b) - sc(a) || NAV_PICK.indexOf(a) - NAV_PICK.indexOf(b)).slice(0, 3)
    .sort((a, b) => NAV_PICK.indexOf(a) - NAV_PICK.indexOf(b));
}
/** Otevření sekce do počtů (staré se časem vytrácí – nad 200 otevření se vše vydělí dvěma). */
function navCount(v) {
  const k = WORLD_VIEWS.includes(v) ? 'world' : v;
  if (k === navLast || !NAV_PICK.includes(k)) { navLast = k; return; }
  navLast = k;
  const u = { ...(S.navUse || {}) };
  u[k] = (u[k] || 0) + 1;
  if (Object.values(u).reduce((a, b) => a + b, 0) > 200) for (const x of Object.keys(u)) u[x] = Math.floor(u[x] / 2);
  S.navUse = u; save();
}
/** ⋯ Další: sekce, které nejsou v liště (dlaždice, nejpoužívanější první), a nastavení. */
function openMore() {
  const sc = k => ((S.navUse && S.navUse[k]) || 0) + NAV_PRIOR[k];
  const rest = NAV_PICK.filter(k => !navBar.includes(k)).sort((a, b) => sc(b) - sc(a) || NAV_PICK.indexOf(a) - NAV_PICK.indexOf(b));
  const tile = k => {
    const n = NAV.find(x => x[0] === k), [lbl, sub, icoKey] = NAV_INFO[k] || [n[1], n[2], k];
    return `<button type="button" class="more-tile" data-mv="${k === 'world' ? lastWorld : k}"><span class="mt-ico">${ico(NAV.find(x => x[0] === icoKey)[3])}</span><b>${lbl}</b><small>${sub}</small></button>`;
  };
  modalOpen(`<div class="modal-body more-sheet"><h3>Další</h3><div class="mn-grid">${rest.map(tile).join('')}</div>
    <div class="more-h">Nastavení</div><div class="more-nav"></div>
    <p class="faint more-tip">Dole v liště jsou sekce, které otevíráš nejčastěji – podle toho se při dalším spuštění samy seřadí.</p></div>`);
  $$('[data-mv]', $('#modal')).forEach(b => b.onclick = () => { modalClose(); go(b.dataset.mv); });
  const list = $('.more-nav', $('#modal'));
  if (window.Transfer) Transfer.addToMenu(list); // 📲 Přenést do jiného zařízení – odkaz a QR kód (transfer.js)
  if (window.Backup) {
    list.insertAdjacentHTML('beforeend', `<button type="button" class="btn ghost" id="moreBk">💾 Přenos a záloha <span class="faint">soubor</span></button>`);
    $('#moreBk').onclick = () => { modalClose(); Backup.open(); };
  }
  if (window.About) About.addToMenu(list); // ℹ️ O aplikaci a soukromí (about.js)
  // motiv: přepínač v postranním panelu je na telefonu skrytý
  list.insertAdjacentHTML('beforeend', `<button type="button" class="btn ghost" id="moreTheme">🌗 ${themeNow() === 'dark' ? 'Světlý' : 'Tmavý'} režim <span class="faint">vzhled</span></button>`);
  $('#moreTheme').onclick = () => { modalClose(); $('#themeToggle').click(); };
  if (window.Pwa) Pwa.addToMenu(list); // 📲 Přidat ATLAS na plochu (pwa.js)
}
const WORLD_VIEWS = ['map', 'countries'];
let lastWorld = 'map';
/* ---------- Zpět (tlačítko a gesto telefonu, šipka prohlížeče) ----------
   Zpět nesmí aplikaci zavřít uprostřed práce. Sekce otevřená z lišty (Lety, Cesta, Objevuj…) má nad Přehledem jeden
   krok historie (atlasV = hloubka nad Přehledem) – Zpět z ní vrátí na Přehled a teprve z něj aplikace skončí, jako
   aplikace s lištou dole na Androidu; přepínání sekcí v liště krok jen přepíše (Zpět neprochází všechno, co uživatel
   kdy otevřel). Sekce otevřená z obsahu (Vybrat a pokračovat → Cesta, Uložit do plánovače) přidá krok navíc – Zpět
   vrátí tam, odkud uživatel přišel (k výsledkům, do Shrnutí). Stejně sekce z postranního panelu na počítači: šipka Zpět
   prohlížeče vrací na předchozí sekci jako na webu (Lety → Země → Zpět = Lety), Přehled z panelu vrátí všechny kroky.
   Průvodce Cestou má nad sebou ještě krok průvodce (atlasT): Zpět vrací po krocích, kterými uživatel prošel (histTrip). Otevřené okno (list zespodu) má vlastní krok
   (atlasM): Zpět ho zavře a sekce pod ním zůstane. Náhled cíle si krok řídí sám (flights.js dpOpen, atlasDp).
   Okno zavřené jinak (✕, klepnutí vedle, stažení dolů, Escape) svůj krok vrátí přes history.back() – ten je
   asynchronní: zápisy do historie, které přijdou mezitím (go() hned po modalClose(), další okno), počkají na jeho
   popstate, jinak by návrat skončil na staré adrese a hashchange přepnul pohled zpátky. */
const hist = { modal: false, mq: null, step: false, trail: [], backs: 0, queue: [], t: 0 };
// Posun stránky po Zpět řídí aplikace (sekce tam, kde uživatel byl – viewStep, okno a náhled stránkou nehýbou):
// automatická obnova prohlížeče by skočila na posun z dřívějška i ve chvíli, kdy se mezitím přepnula sekce (okno
// zavřené a hned jiná sekce) a nová sekce by začala uprostřed. Nové kroky ruční obnovu přebírají od aktuálního.
try { history.scrollRestoration = 'manual'; } catch (e) { /* starý prohlížeč */ }
function histFlush() { clearTimeout(hist.t); hist.backs = 0; const q = hist.queue; hist.queue = []; q.forEach(f => f()); }
// n kroků zpět jedním přesunem (jeden popstate)
function histBack(n = 1) {
  hist.backs++;
  clearTimeout(hist.t); hist.t = setTimeout(histFlush, 700); // pojistka, kdyby popstate nepřišel
  history.go(-n);
}
/** Zápis do historie hned, nebo až po rozběhnutém návratu (histBack). */
function histDo(f) { if (hist.backs) hist.queue.push(f); else f(); }
const histDepth = st => (st && st.atlasV ? Math.max(1, Math.round(+st.atlasV) || 1) : 0);
/**
 * Co udělat s historií při přepnutí na sekci v (st = history.state, hash = location.hash, drill = otevřeno z obsahu,
 * ne z lišty) → { back, how }: back = kolik kroků vrátit (k Přehledu nebo ke kroku sekce z lišty), how = pak
 * 'replace' (přepsat adresu kroku), 'push' (nový krok sekce nad Přehledem), 'drill' (krok navíc nad aktuální sekcí)
 * nebo '' (nic).
 */
function viewHist(v, st, hash, drill = false) {
  const d = histDepth(st);
  if (v === 'dashboard') return { back: d, how: 'replace' };
  if (hash.slice(1) === v) return { back: 0, how: '' };
  if (drill) return { back: 0, how: 'drill' };
  return d ? { back: d - 1, how: 'replace' } : { back: 0, how: 'push' };
}
// y = posun stránky, ze které se odchází (Přehled pod sekcí, výsledky pod Cestou): krok si ho pamatuje a Zpět na něj
// vrátí (hashchange) – jinak by se uživatel po Zpět hledal od začátku výpisu
function viewStep(v, drill, y = null) {
  const { back, how } = viewHist(v, history.state, location.hash, drill);
  const at = st => ({ ...st, y: y == null ? undefined : y }); // bez posunu ani starý – patřil jiné sekci
  if (back) { hist.step = false; hist.trail = []; histBack(back); } // odchod z Cesty: kroky průvodce začnou znovu
  if (how) histDo(() => {
    const st = history.state;
    if (how === 'replace') { if (location.hash.slice(1) !== v) history.replaceState(st, '', '#' + v); return; }
    if (how === 'drill') { history.replaceState(at(st), ''); return history.pushState({ atlasV: histDepth(st) + 1 }, '', '#' + v); }
    // pod sekcí vždy Přehled (i když aplikace začala jinde – zkratka, sdílený odkaz): Zpět vrátí tam
    history.replaceState(at(st), '', '#dashboard');
    history.pushState({ atlasV: 1 }, '', '#' + v);
  });
}
/**
 * Cesta kroků průvodce po přechodu z kroku cur na step: návrat na krok, kterým uživatel už prošel, ji zkrátí (Zpět
 * pak nekrouží mezi dvěma kroky), jinak se cur přidá na konec.
 */
const trailNext = (trail, cur, step) => { const i = trail.indexOf(step); return i >= 0 ? trail.slice(0, i) : [...trail, cur]; };
/**
 * Průvodce Cestou přešel z kroku cur na step (Pokračovat, lišta kroků, ⚡ – trip.js): Zpět telefonu se pak vrátí na cur,
 * ne rovnou pryč z Cesty. Cesta kroků platí, dokud je v historii krok průvodce – po odchodu z Cesty nebo obnovení
 * stránky začíná znovu.
 */
function histTrip(cur, step) {
  if (!cur || cur === step || activeView !== 'trip' || hist.modal) return;
  hist.trail = trailNext(hist.step ? hist.trail : [], cur, step);
  tripEntry(hist.trail.length > 0);
}
function tripEntry(on) {
  if (on === hist.step) return;
  hist.step = on;
  if (!on) return histBack();
  histDo(() => {
    let st = history.state;
    // Cesta bez kroku sekce (aplikace otevřená rovnou v ní): Přehled pod ní jako u sekce z lišty
    if (!histDepth(st)) { history.replaceState(st, '', '#dashboard'); history.pushState(st = { atlasV: 1 }, '', '#trip'); }
    history.pushState({ atlasV: histDepth(st) + 1, atlasT: 1 }, '', '#trip');
  });
}
function histPop() {
  if (hist.backs) { // návrat, který si aplikace sama vyžádala
    if (--hist.backs > 0) return;
    // skončil na kroku průvodce z doby před obnovením stránky (obnoveno s oknem otevřeným nad průvodcem – start):
    // ještě o krok, jinak by další Zpět „nic neudělal“ (níž)
    if (history.state && history.state.atlasT && !hist.step) return histBack();
    return histFlush();
  }
  // Zpět při otevřeném okně: krok okna už je pryč – jen ho zavřít
  if (hist.modal) { hist.modal = false; $('#modalBg').classList.remove('show'); }
  const st = history.state;
  // Zpět z kroku průvodce: předchozí krok, kterým uživatel prošel (krok, na kterém cesta už je, se přeskočí); krok
  // průvodce se vrátí, dokud je kam couvat – nebylo-li kam, Zpět pokračuje o krok dál (výsledky, Přehled)
  if (hist.step && !(st && st.atlasT)) {
    hist.step = false;
    let prev, moved = false;
    while (!moved && (prev = hist.trail.pop())) moved = Boolean(window.Trip && Trip.stepTo && Trip.stepTo(prev));
    if (moved) tripEntry(hist.trail.length > 0); else histBack();
    return;
  }
  // krok okna, které už otevřené není (Zpět z náhledu otevřeného nad oknem, náhled po přepnutí pohledu z něj, Vpřed
  // v prohlížeči), a krok průvodce, ke kterému už cesta kroků není (stránka se mezitím obnovila – Zpět z plánovače,
  // kam cestu uložilo Shrnutí): přeskočit – jinak by další Zpět „nic neudělal“
  if (st && ((st.atlasM || st.atlasDp) && !$('#modalBg').classList.contains('show') || st.atlasT && !hist.step)) histBack();
}
window.addEventListener('popstate', histPop);
/** Adresa se změnila (Zpět, Vpřed, odkaz na sekci): přepnout na její sekci. */
function hashView() {
  // Zpět na první krok bez # (aplikace otevřená na adrese bez sekce) = Přehled
  const v = location.hash.slice(1) || 'dashboard';
  if (v === 'now') return showNow(); // zkratka „Na cestě“ v už otevřené aplikaci
  if (v === activeView || !NAV.some(n => n[0] === v)) return;
  // Zpět na sekci: tam, kde uživatel byl (posun uložený v kroku – viewStep), jinak nahoru
  const y = history.state && Number.isFinite(history.state.y) ? history.state.y : null;
  go(v, { noHash: true, keepScroll: y != null });
  if (y != null) window.scrollTo(0, y);
}
function go(v, opts = {}) {
  // kde uživatel byl – Zpět ho tam vrátí (viewStep); bez nového kroku historie (start, Zpět) se posun nečte: čtení
  // scrollY si vynutí rozvržení celé stránky ještě před vykreslením sekce (při startu na telefonu desítky ms navíc)
  const from = activeView, y0 = opts.noHash ? 0 : Math.round(window.scrollY || 0);
  activeView = v;
  if (v !== 'dashboard') nowAsk = false;
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === v));
  // sekce mimo lištu (z ⋯ Další) rozsvítí Další
  const inBar = v === 'dashboard' || navBar.includes(WORLD_VIEWS.includes(v) ? 'world' : v);
  $$('.mobile-nav .mi').forEach(el => el.classList.toggle('active', el.dataset.view === v || (el.id === 'worldNav' && WORLD_VIEWS.includes(v)) || (el.id === 'moreNav' && !inBar)));
  navCount(v);
  if (WORLD_VIEWS.includes(v)) { lastWorld = v; $$('.world-tabs [data-w]').forEach(b => { b.classList.toggle('on', b.dataset.w === v); b.setAttribute('aria-pressed', String(b.dataset.w === v)); }); }
  const n = NAV.find(x => x[0] === v); $('#pageTitle').textContent = n[1]; $('#pageSub').textContent = n[2];
  // i left: 0 – posun na (0, 0) prohlížeč provede bez vynuceného rozvržení stránky (jen top by si ho vyžádal)
  if (!opts.keepScroll) window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  if (!opts.noHash) histDo(() => viewStep(v, opts.drill, from === 'dashboard' || opts.drill ? y0 : null));
  if (v === 'map') initMap();
  if (v === 'countries') renderCountries();
  if (v === 'recommend') renderRecs();
  if (v === 'planner') renderPlanner();
  if (v === 'dashboard') renderDash();
  if (v === 'trip') lazyView('trip', '#tripRoot', () => Trip.render());
  if (v === 'flights' && window.Flights && Flights.ageCheck) Flights.ageCheck(Boolean(opts.keepScroll)); // výsledky hledání z dřívějška: 🕘 kdy byly
  if (v === 'explore') lazyView('places', '#exploreRoot', () => Places.renderExplore($('#exploreRoot')));
}
/** fn s modulem, který se stahuje až po startu (lazy.js): načtený → hned jako dřív, jinak po načtení; bez zavaděče hned. */
const withMod = (mod, fn) => (window.Lazy ? Lazy.run(mod, fn) : fn());
/**
 * Sekce z modulu, který se stahuje až po startu (lazy.js): načtený → vykreslit hned jako dřív; jinak „Načítám…“ a po
 * načtení vykreslit, je-li sekce pořád otevřená. Modul se nenačetl (výpadek sítě) → hláška a tlačítko Zkusit znovu.
 */
function lazyView(mod, root, render) {
  if (!window.Lazy || Lazy.has(mod)) return render();
  const el = $(root), v = activeView;
  if (el && !el.childElementCount) el.innerHTML = '<div class="card"><div class="faint">⏳ Načítám…</div></div>';
  Lazy.need(mod).then(() => { if (activeView === v) render(); }, () => {
    if (activeView !== v || !el) return;
    el.innerHTML = '<div class="card"><div class="note warn">⚠️ <div>Tahle část aplikace se nenačetla – zkontroluj připojení.</div></div><div class="row" style="margin-top:12px"><button type="button" class="btn primary" data-lazy-retry>Zkusit znovu</button></div></div>';
    $('[data-lazy-retry]', el).onclick = () => { el.innerHTML = ''; lazyView(mod, root, render); };
  });
}
// act = { label, run }: tlačítko v hlášce (↩ Vrátit) – hláška pak vydrží déle, ať se na něj stihne klepnout
function toast(msg, kind, ms = 2600, act = null) {
  const t = $('#toast');
  t.innerHTML = (kind === 'err' ? '⚠️ ' : kind === 'info' ? '👆 ' : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`) + (act ? `<span>${esc(msg)}</span><button type="button" class="toast-act">${esc(act.label)}</button>` : esc(msg));
  if (act) $('.toast-act', t).onclick = () => { t.classList.remove('show'); act.run(); };
  t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), act ? Math.max(ms, 6000) : ms);
}

/* theme */
// Motiv zvolený přepínačem ('light' / 'dark'), jinak podle systému: nový uživatel má S.theme null (světlý telefon =
// světlý ATLAS). Kdo ATLAS používal dřív, má uložený motiv – i výchozí tmavý, který nejde odlišit od zvoleného – a ten
// mu zůstane. Stejné pravidlo jako skript na začátku index.html (motiv hned při startu, bez probliknutí).
const themeOf = (t, sysLight) => (t === 'light' || t === 'dark' ? t : sysLight ? 'light' : 'dark');
const sysLightMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
const themeNow = () => themeOf(S.theme, Boolean(sysLightMq && sysLightMq.matches));
function applyTheme() { const t = themeNow(); document.documentElement.dataset.theme = t; $('#themeLabel').textContent = t === 'dark' ? 'Tmavý režim' : 'Světlý režim'; }
function themeRepaint() { applyTheme(); if (window.Flights) Flights.repaintMap(); if (window.Places) Places.retheme(); }
$('#themeToggle').onclick = () => { S.theme = themeNow() === 'dark' ? 'light' : 'dark'; save(); themeRepaint(); };
// přepínač v postranním panelu i z klávesnice (Tab + Enter / mezerník)
$('#themeToggle').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } };
// bez vlastní volby motiv sleduje systém i za běhu (telefon večer sám přepne na tmavý)
if (sysLightMq) {
  const sysChanged = () => { if (themeOf(S.theme, true) !== themeOf(S.theme, false)) themeRepaint(); };
  if (sysLightMq.addEventListener) sysLightMq.addEventListener('change', sysChanged); else if (sysLightMq.addListener) sysLightMq.addListener(sysChanged);
}
/* mapy: světlé (čitelné i na slunci, výchozí) nebo tmavé – přepínač u mapy světa platí pro všechny mapy v aplikaci */
const MOON = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', SUN = 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4';
function applyMapStyle() {
  const dark = S.mapStyle === 'dark';
  document.documentElement.dataset.map = dark ? 'dark' : 'light';
  const b = $('#mapStyle'); if (!b) return;
  b.title = dark ? 'Světlá mapa (čitelná i na slunci)' : 'Tmavá mapa'; b.setAttribute('aria-label', b.title); b.innerHTML = ico(dark ? SUN : MOON);
}
$('#mapStyle').onclick = () => { S.mapStyle = S.mapStyle === 'dark' ? 'light' : 'dark'; save(); applyMapStyle(); if (window.Places) Places.retheme(); };

/* ================= STATS ================= */
function stats() {
  const v = [...visited]; const conts = new Set(v.map(i => byIso[i]?.cont).filter(Boolean));
  return { count: v.length, pct: Math.round(v.length / TOT * 100), conts: conts.size };
}
function refreshStats() {
  const st = stats();
  const badge = $('#navBadge'); if (badge) badge.textContent = st.count;
  if ($('#mapPct')) {
    $('#mapPct').textContent = st.pct + ' %'; $('#mapBar').style.width = st.pct + '%'; $('#mapCount').textContent = st.count; $('#mapCont').textContent = st.conts;
    const chip = $('#mapChip'), zemi = n => n >= 1 && n <= 4 ? 'země' : 'zemí';
    if (chip) chip.innerHTML = `<span><b>${st.pct} %</b> světa · ${st.count} ${zemi(st.count)}</span><small>${st.count ? 'klepni na zemi pro detail' : 'klepni na zemi, kde jsi byl/a'}</small>`;
    const vl = $('#visitedList');
    if (vl) {
      const v = [...visited].filter(i => byIso[i]).sort((a, b) => byIso[a].cs.localeCompare(byIso[b].cs, 'cs'));
      vl.innerHTML = v.length ? v.map(i => `<button type="button" class="pill" data-vi="${i}">${flag(i)} ${esc(byIso[i].cs)}</button>`).join('')
        : '<span class="faint">Zatím žádná – klepni na zemi v mapě a dej „Byl/a jsem tu“.</span>';
      $$('[data-vi]', vl).forEach(b => b.onclick = () => openCountry(b.dataset.vi));
    }
    $('#contBars').innerHTML = CONTS.map(c => { const tot = CONT_TOT[c] || 1; const n = [...visited].filter(i => byIso[i]?.cont === c).length; const p = Math.round(n / tot * 100); return `<div class="cont-row"><div class="ct"><span>${c}</span><b>${n}/${tot}</b></div><div class="progress"><span style="width:${p}%"></span></div></div>`; }).join('');
  }
}

/* ================= DASHBOARD ================= */
/** Dnešek (místní) a počet dní mezi dny YYYY-MM-DD. */
const todayLocal = () => fmtYMD(new Date());
const daysTo = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const inDays = d => (d === 1 ? 'zítra' : `za ${d} ${d <= 4 ? 'dny' : 'dní'}`);
/** Karta „Naplánované cesty“: nejbližší cesta s odpočtem a co ještě zbývá zařídit (bez upozornění – vidět na Přehledu). */
function nextTripStat() {
  const now = todayLocal();
  const next = S.trips.map((t, i) => ({ t, i })).filter(x => x.t.start && (x.t.end || x.t.start) >= now).sort((a, b) => a.t.start.localeCompare(b.t.start))[0];
  if (!next) return ['Naplánované cesty', `${S.trips.length}`, S.trips.length ? 'Mrkni do plánovače' : 'Začni plánovat', '<button type="button" class="linkbtn nt-open" data-gop>Otevřít plánovač →</button>'];
  const t = next.t, d = daysTo(now, t.start);
  const todo = (t.checklist || []).filter(x => !x.done && /^Zařídit/i.test(x.t || '')).length;
  const when = d <= 0 ? 'právě probíhá' : inDays(d);
  return ['Nejbližší cesta', `<span class="nt-name">${t.iso && byIso[t.iso] ? flag(t.iso) + ' ' : ''}${esc(t.dest && t.dest !== '—' ? t.dest : t.name)}</span>`,
    `${when}${todo ? ` · zbývá zařídit ${todo}` : ''}`, `<button type="button" class="linkbtn nt-open" data-nt="${next.i}">Otevřít plán →</button>`];
}

/* ---------- 📍 Dnes na cestě ----------
   Karta nahoře na Přehledu od 2 dnů před odjezdem do konce uložené cesty (i zkratka aplikace „Na cestě“ → #now): řádky
   průběhu cesty na dnešek (Trip.timeline – stejné jako ve shrnutí průvodce), ubytování, posun času, 🔖 rezervace.
   Vše z localStorage – funguje i bez signálu, žádné dotazy na server ani partnery. */
const okYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const ymdPlus = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** Místní čas 'YYYY-MM-DDTHH:MM' v zóně tz v okamžiku now (ms); bez známé zóny čas zařízení. */
const wallAt = (tz, now) => {
  const off = tz && window.Ics ? Ics.tzOffset(tz, now) : null, d = new Date(now);
  return off == null ? `${fmtYMD(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : new Date(now + off * 6e4).toISOString().slice(0, 16);
};
/**
 * Spoje cesty z plánovače (lety t.legs, vlak / bus t.ground) podle odjezdu (bez času jako v poledne). at = okamžik
 * odjezdu (ms; bez času nebo zóny null – odpočet ani „Sbaleno“ si čas nevymýšlí), sw = kdy je cesta v cíli spoje:
 * přílet, bez něj odjezd, spoj bez času až o půlnoci po dni odjezdu (ten den ještě doma).
 */
function tripLegs(t) {
  const list = [...(Array.isArray(t.legs) ? t.legs : []), ...(Array.isArray(t.ground) ? t.ground.map(g => ({ ...g, ground: true })) : [])].filter(l => l && okYmd(l.date));
  const utc = (v, tz) => (v && tz && window.Ics ? Ics.localToUtc(String(v).slice(0, 16), tz) : null);
  return list.map(l => {
    const at = utc(l.dep, l.fromTz);
    return { l, at, sw: utc(l.arr, l.toTz) ?? at ?? utc(`${ymdPlus(l.date, 1)}T00:00`, l.fromTz || l.toTz), k: String(l.dep || `${l.date}T12:00`) };
  }).sort((a, b) => a.k.localeCompare(b.k));
}
/** Zóna místa, kde cesta v okamžiku now je: do prvního příletu zóna odjezdu (doma, i v letadle), pak cíl posledního spoje. */
function tripZone(t, now) {
  const ls = tripLegs(t);
  let tz = ls.length ? ls[0].l.fromTz || null : null;
  for (const x of ls) if (x.sw != null && x.sw <= now) tz = x.l.toTz || null;
  return tz;
}
/** Spoj zpět (tripLegs): u cesty z průvodce druhý ze dvou (let / vlak zpět), jinak Trip.legBack – poslední končí, kde první začal. */
const tripBack = (t, ls) => (ls.length > 1 && ((t.wizard && ls.length === 2) || (window.Trip && Trip.legBack && Trip.legBack(ls[0].l, ls.at(-1).l))) ? ls.at(-1) : null);
/**
 * Cesta pro kartu „📍 Dnes na cestě“: od 2 dnů před odjezdem do posledního dne cesty včetně. „Dnes“ = den v místě, kde
 * cesta právě je (zóna ze spojů – v Lisabonu je po půlnoci pražského času ještě včera), jinak den zařízení. Cesty bez
 * data a skončené se nepočítají. Návrat přes půlnoc (dálkový let zpět) – do dne příletu. Víc cest najednou:
 *  1. spoj, který právě letí / jede nebo odjíždí do 24 h (nejbližší) – ráno odletu i večer před dalším odletem;
 *  2. probíhající: cesta se spoji, z průvodce nebo s letem před výletem z plánovače či z Objevuj, pak naposledy začatá
 *     (výlet uprostřed delší cesty), pak dřív končící;
 *  3. nejbližší odjezd;
 *  4. cesta, ze které se už vrátil (spoj zpět přistál) – zbytek dne jen, když není nic jiného.
 * Ostatní probíhající cesty (výlet z plánovače v den letu) jsou v also – karta je ukáže pod dnešními řádky.
 * → { t, i, today, tz, on, day, days, until, end, home, also: [{ t, i, today }] } | null
 */
function tripNow(trips, now = Date.now()) {
  const all = [];
  (Array.isArray(trips) ? trips : []).forEach((t, i) => {
    if (!t || typeof t !== 'object' || !okYmd(t.start)) return;
    const ls = tripLegs(t), arr = ls.length ? String(ls.at(-1).l.arr || '').slice(0, 10) : '', end0 = okYmd(t.end) && t.end >= t.start ? t.end : t.start;
    const end = okYmd(arr) && arr > end0 && daysTo(end0, arr) <= 2 ? arr : end0, tz = tripZone(t, now);
    let today = wallAt(tz, now).slice(0, 10);
    // po odletu už ne „před odjezdem“ (přes datovou hranici se přiletí „včera“)
    if (today < t.start && ls.some(x => x.l.date >= t.start && x.at != null && x.at <= now)) today = t.start;
    const until = daysTo(today, t.start);
    if (today > end || until > 2) return;
    const back = tripBack(t, ls), home = Boolean(back && back.sw != null && back.sw <= now);
    // spoj právě na cestě (= teď) nebo s odjezdem do 24 h
    let soon = null;
    if (!home) for (const y of ls) {
      const v = y.at == null ? null : y.at > now ? (y.at - now <= 864e5 ? y.at : null) : y.sw != null && y.sw > now ? now : null;
      if (v != null && (soon == null || v < soon)) soon = v;
    }
    all.push({ t, i, today, tz, on: until <= 0, day: 1 - Math.min(0, until), days: daysTo(t.start, end) + 1, until: Math.max(0, until), end, home,
      soon, sub: ls.length > 0 || Boolean(t.wizard) || Boolean(String(t.flight || '').trim()) });
  });
  const tier = x => (x.soon != null ? 0 : x.home ? 3 : x.on ? 1 : 2);
  const better = (a, b) => {
    const ta = tier(a), tb = tier(b);
    if (ta !== tb) return ta < tb;
    if (ta === 0 && a.soon !== b.soon) return a.soon < b.soon;
    if (ta === 2) return a.t.start !== b.t.start ? a.t.start < b.t.start : a.sub && !b.sub;
    if (a.sub !== b.sub) return a.sub;
    return a.t.start !== b.t.start ? a.t.start > b.t.start : a.end < b.end;
  };
  let best = null;
  for (const x of all) if (!best || better(x, best)) best = x;
  if (!best) return null;
  const { soon, sub, ...x } = best;
  return { ...x, also: all.filter(y => y !== best && y.on && !y.home).slice(0, 2).map(y => ({ t: y.t, i: y.i, today: y.today })) };
}
/**
 * Řádky průběhu cesty (Trip.timeline) a cesta z průvodce. Ta je pročištěná jako při „Otevřít v průvodci“, jen apostrofy
 * a uvozovky zůstanou (Castel Sant'Angelo jako v Itineráři) – karta všechno escapuje.
 */
function tripRows(t) {
  let w = null;
  if (t.wizard && window.Trip) try { w = Trip.sanitizeTrip(JSON.parse(JSON.stringify(t.wizard)), { quotes: true }); } catch (e) { w = null; }
  // u cesty z průvodce: aktivity přidané v plánovači (ty od průvodce jsou v jeho programu) a ty od průvodce, které
  // v plánovači smazal nebo přejmenoval (z programu dne pryč – karta ukáže totéž co Itinerář); bez genDays nepoznám které
  const own = {}, drop = {}, arr = v => (Array.isArray(v) ? v : []);
  if (w && t.genDays && typeof t.genDays === 'object') {
    const pd = t.days && typeof t.days === 'object' ? t.days : {};
    for (const d of new Set([...Object.keys(pd), ...Object.keys(t.genDays)])) {
      const a = arr(pd[d]), gen = arr(t.genDays[d]), mine = a.filter(v => !gen.includes(v)), gone = gen.filter(v => !a.includes(v));
      if (mine.length) own[d] = mine;
      if (gone.length) drop[d] = gone;
    }
  }
  let all = [];
  try { all = window.Trip ? Trip.timeline(w || t, { own, drop }) : []; } catch (e) { all = []; }
  return { w, all };
}
/**
 * Které dnešní řádky už proběhly (karta je ztlumí, neschová): řádek s časem, jehož poslední čas v textu („LIS 10:00 →
 * PRG 14:35“ = přílet) je dřív než teď, a řádek bez času před ním (metro na letiště před odletem, program dne před
 * večerním odletem). Po návratu domů (home) proběhlo všechno.
 */
function pastRows(rows, hm, home) {
  const out = rows.map(() => Boolean(home));
  if (home) return out;
  let later = false;
  for (let k = rows.length - 1; k >= 0; k--) {
    const m = [...String(rows[k][2]).replace(/<[^>]*>/g, '').matchAll(/\b(\d{1,2}):(\d{2})\b/g)].at(-1);
    if (m) later = later || `${m[1].padStart(2, '0')}:${m[2]}` < hm;
    out[k] = later;
  }
  return out;
}
/**
 * Obsah karty pro cestu z tripNow: řádky průběhu cesty na dnešek a první zítřejší (před odjezdem všechny až do dne
 * odjezdu), místo a ubytování (u trasy přes víc míst to dnešní; jen v cíli – po příletu a do odjezdu zpět), posun času
 * proti Praze, nejbližší odjezd (do 24 h), co ze „Sbaleno“ ještě zbývá (před odjezdem), dnešek ostatních probíhajících
 * cest (x.also) a 🔖 rezervace – i těch cest.
 */
function nowParts(x, now = Date.now()) {
  const t = x.t, { w, all } = tripRows(t), also0 = Array.isArray(x.also) ? x.also : [];
  const tomorrow = ymdPlus(x.today, 1), pl = w && window.Trip ? Trip.placeOn(w, x.today) : null;
  const ls = tripLegs(t), first = ls[0] || null, back = tripBack(t, ls), ahead = ls.find(l => l.at != null && l.at > now) || null;
  // v cíli: po příletu (spoj bez času – už v den odjezdu) a do odjezdu zpět; doma navigace do hotelu nemá smysl
  const there = (!first || first.at == null || first.sw == null || first.sw <= now) && !(back && back.at != null && back.at <= now);
  // posun času proti Praze: tam, kde cesta je (před odjezdem v cíli prvního spoje)
  const tz = x.on ? x.tz : first && first.l.toTz, off = tz && window.Ics ? Ics.tzOffset(tz, now) : null, cz = window.Ics ? Ics.tzOffset('Europe/Prague', now) : null;
  const shift = off != null && cz != null ? off - cz : 0;
  // „odlet“ jen u cesty s letem (spoje, průvodce bez vlaku, text letu); jinak (autem, z Objevuj, ručně) „odjezd“
  const ft = String(t.flight || '').trim(), fly = ls.length ? ls.some(l => !l.l.ground) : w ? !(w.overland && w.overland.on) : Boolean(ft) && !/^🚆/u.test(ft);
  const ck = (Array.isArray(t.checklist) ? t.checklist : []).filter(c => c && !c.done), zar = c => /^Zařídit/i.test(c.t || '');
  // rezervace této cesty, pod nimi ostatních probíhajících (stejná dvakrát jen jednou)
  const seen = new Set(), refs = window.Backup ? [t, ...also0.map(y => y.t)].flatMap(z => Backup.cleanRefs(z.refs)).filter(r => !seen.has(r.co + '\n' + r.kod) && seen.add(r.co + '\n' + r.kod)) : [];
  const rows = all.filter(r => (x.on ? r[0] === x.today : r[0] >= x.today && r[0] <= t.start));
  return {
    rows, next: x.on ? all.find(r => r[0] === tomorrow) || null : null, past: x.on && x.tz ? pastRows(rows, wallAt(x.tz, now).slice(11, 16), x.home) : rows.map(() => false),
    place: pl ? pl.name : t.dest && t.dest !== '—' ? t.dest : t.name, verb: fly ? 'odlet' : 'odjezd', spoje: Boolean(ls.length || w || ft),
    // car = cesta s půjčeným autem (průvodce) → k navigaci do hotelu i Waze
    hotel: x.on && there && pl && pl.hotel ? { name: pl.hotel, ...(pl.near ? { near: pl.near } : {}), q: [pl.hotel, pl.city, pl.country].filter(Boolean).join(', '), ...(w.car && w.car.mode !== 'skip' ? { car: true } : {}) } : null,
    shift, clock: shift ? wallAt(tz, now).slice(11, 16) : '',
    ahead: ahead && ahead.at - now <= 864e5 ? { l: ahead.l, min: Math.ceil((ahead.at - now) / 6e4) } : null,
    // před odjezdem (v den odjezdu do prvního spoje)
    todo: !x.on || (x.day === 1 && !(first && first.at != null && first.at <= now)) ? { zar: ck.filter(zar).length, bal: ck.filter(c => !zar(c)).length } : null,
    also: also0.map(y => ({ i: y.i, name: String(y.t.name || y.t.dest || ''), rows: tripRows(y.t).all.filter(r => r[0] === y.today) })),
    refs,
  };
}
// odpočet „za 2 h 5 min“: jednotka s pevnou mezerou, na úzkém telefonu se neodtrhne od čísla
const hmTxt = m => (m >= 60 ? `${Math.floor(m / 60)}\u00a0h${m % 60 ? ` ${m % 60}\u00a0min` : ''}` : `${m}\u00a0min`);
const dowLbl = ymd => { const d = new Date(ymd + 'T12:00:00'); return `${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`; };
const canCopy = () => Boolean(navigator.clipboard && navigator.clipboard.writeText);
/** Karta „📍 Dnes na cestě“ (HTML). Hodiny a odpočet se doplňují každou minutu do [data-nw] (renderNow). */
function nowCard(x, p) {
  const t = x.t, tag = d => (d === x.today ? 'dnes' : d === ymdPlus(x.today, 1) ? 'zítra' : dowLbl(d));
  // den programu: trasa od ubytování pěšky (Google Maps i Mapy.com), celodenní výlet spoji – jako v programu (places.js)
  const walk = r => {
    const m = r[3], u = m && m.day.items.length && m.plan.center && window.Places && Places.dayRoute ? Places.dayRoute(m.plan.center, m.day) : null;
    return u && u.url ? ` <span class="nw-walk">${u.trip ? '🚆 cesta na výlet' : '🗺️ trasa pěšky'}: <a href="${esc(safeUrl(u.url))}" target="_blank" rel="noopener">Google Maps ↗</a>${u.mapy ? ` · <a href="${esc(safeUrl(u.mapy))}" target="_blank" rel="noopener">Mapy.com ↗</a>` : ''}</span>` : '';
  };
  const row = (r, d, past) => `<li${past ? ' class="nw-past"' : ''}><span class="nw-i">${r[1]}</span><span>${d ? `<span class="nw-d">${tag(r[0])}</span>` : ''}${r[2]}${walk(r)}</span></li>`;
  // po návratu domů (poslední den, spoj zpět přistál) už ne „na cestě“ – karta zůstane do půlnoci kvůli kódům a plánu
  const head = x.home ? `🏠 Zpátky doma · <b>${esc(p.place)}</b> <span class="faint">· den ${x.day} z ${x.days}</span>`
    : x.on ? `📍 Dnes na cestě · den ${x.day} z ${x.days} · <b>${esc(p.place)}</b>`
    : `🧳 ${x.until === 1 ? 'Zítra' : `Za ${x.until} dny`} ${p.verb} · <b>${esc(p.place)}</b> <span class="faint">${dowLbl(t.start)}</span>`;
  const h = Math.abs(p.shift) / 60, shift = `o ${String(h).replace('.', ',')}\u00a0h ${p.shift < 0 ? 'méně' : 'víc'} než v Praze`;
  const meta = [
    p.ahead ? `<span>${p.ahead.l.ground ? '🚆 Odjezd' : '✈️ Odlet'} ${esc(p.ahead.l.from)} → ${esc(p.ahead.l.to)} <b data-nw="cd"></b></span>` : '',
    p.shift && !x.home ? `<span>🕐 ${x.on ? 'Místní čas <b data-nw="clock"></b> – ' : 'V cíli je '}${shift}</span>` : '',
    p.hotel ? `<span>🏨 ${esc(p.hotel.name)}${p.hotel.near ? ` <span class="faint">(${esc(p.hotel.near)})</span>` : ''}${window.Places && Places.gmDir ? ` · <a href="${esc(safeUrl(Places.gmDir('', [p.hotel.q], 'transit')))}" target="_blank" rel="noopener">navigovat ↗</a>` : ''}${p.hotel.car && window.SearchHelp ? ` <a class="app-chip" href="${esc(safeUrl(window.SearchHelp.wazeUrl({ q: p.hotel.q })))}" target="_blank" rel="noopener" title="Najít ubytování ve Waze a navigovat autem">🚗 Waze</a>` : ''}</span>` : '',
  ].filter(Boolean);
  // před odjezdem řádky po dnech (dnes, zítra, den odjezdu)
  // dnešek ostatních probíhajících cest (výlet z plánovače či z Objevuj v den letu) – jedním řádkem s odkazem na plán
  const also = (p.also || []).map(a => `<li class="nw-also"><span class="nw-i">📌</span><span><span class="nw-d">také dnes</span><b>${esc(a.name)}</b>${a.rows.map(r => ` · ${/^(📍|📝)$/u.test(r[1]) ? '' : `${r[1]} `}${r[2]}`).join('')} · <button type="button" class="linkbtn" data-nw-plan="${a.i}">Otevřít plán →</button></span></li>`).join('');
  const body = p.rows.map((r, k) => `${x.on || (k && p.rows[k - 1][0] === r[0]) ? '' : `<li class="nw-day">${tag(r[0])}</li>`}${row(r, false, p.past && p.past[k])}`).join('') || (x.on && also ? '' : `<li class="faint"><span class="nw-i">🌤️</span><span>${x.on ? 'Dnes nic naplánovaného' : p.spoje ? 'Časy spojů v plánu nemáš – ověř je v rezervaci' : 'Do odjezdu nic naplánovaného'}</span></li>`);
  const refs = p.refs.length ? `<div class="nw-refs">${p.refs.map(r => `<div class="nw-ref"><span>🔖${r.co ? ` ${esc(r.co)}` : ''}</span>${r.kod ? `<code>${esc(r.kod)}</code>${canCopy() ? `<button type="button" class="nw-copy" data-copy="${esc(r.kod)}" aria-label="Zkopírovat kód ${esc(r.kod)}">Kopírovat</button>` : ''}` : ''}${r.pozn ? `<span class="faint">${esc(r.pozn)}</span>` : ''}</div>`).join('')}</div>` : '';
  const todo = p.todo && (p.todo.zar || p.todo.bal) ? `<div class="nw-todo">🧾 Před cestou zbývá ${[p.todo.zar && `zařídit ${p.todo.zar}`, p.todo.bal && `sbalit ${p.todo.bal}`].filter(Boolean).join(' a ')} · <button type="button" class="linkbtn" data-nw-plan="${x.i}">odškrtat v plánu →</button></div>` : '';
  return `<div class="card now-card" id="nowCard" tabindex="-1" role="region" aria-label="Dnes na cestě">
    <div class="nw-top"><div class="nw-h">${head}</div><button type="button" class="linkbtn nw-open" data-nw-plan="${x.i}">📋 Celý plán →</button></div>
    ${meta.length ? `<div class="nw-meta">${meta.join('')}</div>` : ''}
    <ul class="nw-rows">${x.on ? body + also : also + body}${p.next ? row(p.next, true).replace('<li>', '<li class="nw-next">') : ''}</ul>${refs}${todo}</div>`;
}
/** #now bez cesty na kartu: krátce, že žádná neprobíhá, a nejbližší naplánovaná. */
function nowNone() {
  const today = todayLocal(), n = S.trips.map((t, i) => ({ t, i })).filter(y => y.t && okYmd(y.t.start) && y.t.start > today).sort((a, b) => a.t.start.localeCompare(b.t.start))[0];
  return `<div class="card now-card none" id="nowCard" tabindex="-1" role="region" aria-label="Na cestě"><div class="nw-h">📍 Žádná cesta právě neprobíhá</div><div class="nw-meta"><span>${n
    ? `Nejbližší: <b>${esc(n.t.dest && n.t.dest !== '—' ? n.t.dest : n.t.name)}</b> ${fmtDate(n.t.start)} (${inDays(daysTo(today, n.t.start))}) · <button type="button" class="linkbtn" data-nw-plan="${n.i}">Otevřít plán →</button>`
    : 'Naplánovanou cestu zatím nemáš · <button type="button" class="linkbtn" data-nw-go="planner">Plánovač →</button>'}</span></div></div>`;
}
/** Cesta poskládaná v průvodci, ale neuložená do plánovače (Trip.unsavedNow): karta by na cestě nic neukázala –
 *  nabídnout uložení jedním klepnutím (bez něj by „Dnes na cestě“ tvrdil, že cestu nemáš). */
function nowUnsaved(today) {
  const u = window.Trip && Trip.unsavedNow ? Trip.unsavedNow(today) : null;
  if (!u) return '';
  const d = daysTo(today, u.start);
  return `<div class="card now-card none" id="nowCard" tabindex="-1" role="region" aria-label="Na cestě"><div class="nw-h">📍 Cesta ${u.cc ? flag(u.cc) + ' ' : ''}${esc(u.label)} ${d > 0 ? 'začíná ' + inDays(d) : 'právě probíhá'}</div><div class="nw-meta"><span>Ještě není v plánovači – ulož ji a tady uvidíš na každý den program, ubytování a spoje, i bez signálu. <button type="button" class="linkbtn" data-nw-save>💾 Uložit do plánovače</button></span></div></div>`;
}
let nowAsk = false, nowShown = ''; // nowAsk: otevřeno přes #now – bez cesty aspoň poznámka
/** Karta nahoře na Přehledu; překreslí se jen při změně, hodiny a odpočet se jen přepíšou (výběr kódu zůstane). */
function renderNow() {
  const el = $('#nowTrip'); if (!el) return;
  const now = Date.now();
  let x = null, p = null, h = '';
  // poškozená uložená cesta nesmí rozbít Přehled – karta se pak jen neukáže
  try { x = tripNow(S.trips, now); p = x && nowParts(x, now); h = p ? nowCard(x, p) : nowUnsaved(todayLocal()) || (nowAsk ? nowNone() : ''); } catch (e) { p = null; h = ''; }
  if (h !== nowShown) {
    nowShown = h; el.innerHTML = h; el.hidden = !h;
    $$('[data-nw-plan]', el).forEach(b => b.onclick = () => openTrip(+b.dataset.nwPlan));
    $$('[data-nw-go]', el).forEach(b => b.onclick = () => go(b.dataset.nwGo));
    // uložit cestu z průvodce a zůstat na Přehledu – karta se hned překreslí na „Dnes na cestě“ (i dlaždice cest)
    $$('[data-nw-save]', el).forEach(b => b.onclick = () => { Trip.saveToPlanner({ stay: true }); renderDashStats(); });
    $$('[data-copy]', el).forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Zkopírováno: ' + b.dataset.copy), () => toast('Kód se nepodařilo zkopírovat – podrž na něm prst', 'err')));
  }
  if (!p) return;
  const cd = $('[data-nw="cd"]', el), clock = $('[data-nw="clock"]', el);
  if (cd && p.ahead) cd.textContent = 'za ' + hmTxt(p.ahead.min);
  if (clock) clock.textContent = p.clock.replace(/^0/, '');
}
/**
 * Potřebuje Přehled při startu průvodce (trip.js, stahuje se až po startu – lazy.js)? Rozpracovaná cesta z průvodce
 * (↩ Pokračuj, neuložená cesta na kartě „Dnes na cestě“; ne sestavená a uložená v plánovači) nebo cesta v okně karty
 * „Dnes na cestě“ (průběh dne – Trip.timeline). Zda se karta ukáže, na průvodci nezávisí (tripNow bez něj).
 */
function tripSoon() {
  try {
    const w = S.trip, saved = w && w.step === 'summary' && w.created && (S.trips || []).some(x => x && x.tripId === w.created);
    return Boolean((w && w.flight && w.flight.out && !saved) || tripNow(S.trips));
  } catch (e) { return true; }
}
/** Zkratka aplikace „Na cestě“ (#now): Přehled s kartou nahoře (bez probíhající cesty poznámka s nejbližší cestou). */
function showNow() {
  nowAsk = true;
  go('dashboard');
  const c = $('#nowCard'); if (c) c.focus({ preventScroll: true });
}
/* ---------- ✨ Co je nového ----------
   Novinky posledních verzí a kde je v aplikaci najít – na Přehledu, dokud je uživatel neskryje (nová sada = WN_ID). */
const WN_ID = '2026-10-23e';
const WHATS_NEW = [
  ['🔀', 'Auto jen na část cesty', 'v kroku <b>Auto</b> průvodce Cestou vybereš <b>📅 dny auta</b> – třeba v Lisabonu jen 2. a 3. den na výlety: vyzvednutí i vrácení ve městě a z letiště do města dál metrem. Na trase přes víc míst má každý přejezd přepínač <b>🚗 / 🚆</b> s časem a cenou – auto se půjčí jen na úseky autem a ATLAS řekne, kde ho vyzvednout a kde vrátit.'],
  ['🚗', 'Auto na místě s radou', 'v kroku <b>Auto</b> průvodce Cestou ATLAS řekne, kdy auto nepotřebuješ (bydlíš ve městě s metrem nebo vlakem z letiště, mezi místy trasy je rychlejší vlak), upozorní na zóny ZTL v italských městech, elektronické mýtné v Portugalsku a vrácení auta v jiné zemi a napíše, co je v ceně auta a co se počítá zvlášť.'],
  ['📲', 'Přenos do jiného zařízení QR kódem', 'pod <b>Další</b> (na počítači vlevo dole) je <b>📲 Přenést do jiného zařízení</b>: QR kód, který naskenuješ fotoaparátem druhého telefonu, nebo odkaz, který si pošleš (AirDrop, Quick Share, e-mail, chat). Přenese cesty, hlídané ceny, odložené nabídky, ⭐ / 🙈 města, navštívené země i domov – bez účtu, data jdou jen v odkazu, na server ne. Druhé zařízení ukáže, co přibude, a nabídne <b>Sloučit</b> nebo <b>Nahradit</b>.'],
  ['💡', 'Kdy koupit hlídanou letenku', 'karta hlídání na <b>Přehledu</b> má graf ceny od uložení se zeleně vyznačenou nejnižší cenou, řádky <b>Nejníž</b> (kdy to bylo), <b>Teď</b> a šipku, jak se cena změnila za týden. Pod tím krátký <b>💡 tip</b> s důvodem – koupit, nebo ještě počkat – podle historie cen, dní do odletu a „Je to dobrá cena?“. Je to jen odhad, jistotu nedává nikdo.'],
  ['👨‍👩‍👧', 'Cesta s dětmi', 'v <b>Letech</b> → Další možnosti → <b>Cestující</b> přidáš děti (2–11 let) a miminka (do 2 let). Cena celkem je za všechna sedadla – dítě platí sedadlo, u nízkonákladových aerolinek obvykle jako dospělý; miminko letí na klíně a poplatek aerolinky se doplní při nákupu. Ryanair a Wizz Air dostanou děti rovnou do odkazu na rezervaci, jinde je přidáš na webu. V průvodci Cestou je rozpočet na osobu za všechna sedadla a odkazy na ubytování s celou rodinou.'],
  ['🕘', 'Od minula', 'když ATLAS otevřeš jiný den, nahoře na <b>Přehledu</b> uvidíš, co se od minula změnilo pro tebe: která hlídaná cena zlevnila a o kolik, kdy odlétáš na uloženou cestu (i kdy se otevírá online check-in), nové levné cíle v radaru a propadlé odložené nabídky. Nejvýš 3 řádky, klepnutím na místo, ✕ je skryje, dokud nebude něco nového. Bez upozornění v telefonu.'],
  ['📝', 'Rozepsané hledání se neztratí', 'když v <b>Letech</b> upravíš formulář (odkud, kam, termín, noci, cestující, zavazadla…) a hledat nestihneš, ATLAS si ho zapamatuje – i když telefon aplikaci na pozadí zavře. Po návratu ho najdeš vyplněný (3 dny, minulé termíny vynechá); <b>↺ Začít znovu</b> ho smaže.'],
  ['📌', 'Porovnat i s cestou na letiště', 'odložené nabídky v <b>📌 Porovnat</b> se řadí podle ceny <b>i s cestou</b> – letenka + odhad dopravy na letiště a zpět a z letiště do města. Levnější letenka z Mnichova tak nevyhraje, když cesta na letiště stojí o 500 Kč víc. Co neznám, napíšu – cena letenky zůstává vidět.'],
  ['🔗', 'Sdílená cesta', 'cesta nebo plán z odkazu od kamaráda ukáže, z kdy jsou ceny (u nových odkazů den sdílení), a <b>💾 Uložit si ji</b> ji přidá do tvého plánovače – pak je to tvoje cesta.'],
  ['◀️', 'Zpět na telefonu', 'tlačítko nebo gesto Zpět nejdřív zavře otevřené okno, v průvodci <b>Cestou</b> vrátí o krok a z Cesty zpět k výsledkům, ze kterých jsi let vybral (na stejné místo ve výpisu) – aplikace se zavře až z Přehledu.'],
  ['📤', 'Sdílet cestu rovnou do WhatsAppu', 've Shrnutí průvodce a u plánu v plánovači otevře <b>Sdílet</b> na telefonu nabídku sdílení (WhatsApp, Messenger, e-mail) – bez kopírování odkazu.'],
  ['📍', 'Dnes na cestě i bez plánovače', 'cestu poskládanou v průvodci, kterou jsi neuložil, ti Přehled 2 dny před odletem nabídne <b>💾 Uložit do plánovače</b> – pak tam každý den uvidíš program, ubytování a spoje.'],
  ['💡', 'Věděl jsi?', 'na Přehledu občas malý tip na funkci, kterou jsi ještě nezkusil (Kamkoliv, hlídání ceny, ⚡ Poskládej cestu…) – nejvýš jeden denně, tlačítkem ji rovnou otevřeš, křížkem tip skryješ natrvalo.'],
  ['🧾', 'Rozpočet cesty', 've <b>Shrnutí</b> průvodce Cestou je cena po položkách (letenky, doprava, ubytování, auto a přejezdy) za osobu i celkem – odhady jsou označené. Do pole <b>Můj rozpočet</b> zadej, kolik chceš utratit, a uvidíš, kolik zbývá, nebo o kolik je cesta dražší.'],
  ['📤', 'Sdílet jednu letenku', 'u nabídky ve výsledcích je <b>📤 Sdílet</b> (vedle 📌 Odložit) – pošle krátký odkaz s trasou, termínem, cenou, aerolinkou a odkazem na koupi. Příjemci se otevře karta nabídky s upozorněním, že se cena mohla změnit, a <b>🔎 Hledat znovu</b> mu předvyplní formulář.'],
  ['ℹ️', 'O aplikaci a soukromí', 'pod <b>Další</b>: odkud ATLAS bere ceny a data, co se ukládá (jen v tomhle prohlížeči, žádné cookies ani analytika), jak se řadí výsledky a verze aplikace.'],
  ['📅', 'Připomínka hlídané ceny v kalendáři', 'na kartě hlídání na Přehledu je <b>📅 Připomínat</b> – stáhne událost do kalendáře na každé pondělí v 9:00 (8 týdnů) s poslední nejnižší cenou. Odkaz v ní otevře ATLAS přímo na tomhle hlídání a cenu zkontroluje znovu.'],
  ['📅', 'Termín letu v kalendáři', 'u každého letu tlačítko <b>📅 V kalendáři</b> – den odletu a návratu s časy, noci mezi nimi, víkendy a svátky; jedním klepnutím lety do kalendáře v mobilu (.ics). A <b>Kalendář</b> mají i výsledky Kamkoliv: v každém dni nejlevnější cíl, klepnutím na den všechny cíle s odletem ten den.'],
  ['🏡', 'Ubytování s cenou na každém místě trasy', 'když TripAdvisor malé místo nezná (Pachino, Castelmezzano), ukážu hotely s cenou z nejbližšího okolí (Noto, Potenza) – s porovnáním webů a <b>Vybrat</b> s ověřením volna jako u prvního místa, na kartě „v okolí: Noto · 24 km“. Pod nimi penziony a agroturistiky přímo v místě z OpenStreetMap (bez ceny). Plánovač trasy teď radši volí místa, kde hotely s cenou jsou.'],
  ['🌙', 'V noci taxi za pevnou cenu', 'když přistáváš nebo vyrážíš na letiště před 5:00 či po 23:00 v Římě, Paříži, Madridu, Aténách, Florencii, Neapoli, Miláně nebo New Yorku, odhad ceny počítá úřední pevnou cenu taxi za auto (Fiumicino 55 €) místo MHD, která v noci nejezdí.'],
  ['🧭', 'Okruh po oblasti', '„Toskánsko na 4 dny“ v <b>Objevuj</b> naplánuje okruh, který zůstane v Toskánsku (ne Rimini ani Perugia) – stejně Apulie, Istrie, Algarve, Skotsko a Laponsko. Bazilika sv. Petra má v programu hodinu, ne půl, a se zájmem „s dětmi“ přibydou ZOO a parky.'],
  ['🏝️', 'Hotely i u letišť na ostrovech', 'Tenerife Jih, Lanzarote, Gran Canaria nebo Rhodos – ubytování se hledá ve městě u letiště (dřív nic). <b>Vyber za mě</b> v Cestě ověří volno a vyprodaný hotel přeskočí.'],
  ['⛽', 'Auto v cíli za skutečné ceny', 'palivo za cenu v zemi, kudy jedeš (všechny země EU), a mýtné na dálnicích v Itálii, Francii a Chorvatsku.'],
  ['🗓️', 'Celá sezóna u zemí', 'karty zemí ukazují všechny dobré měsíce („led–bře · čvc–zář“) a <b>Kam letos</b> řadí země mimo sezónu níž.'],
  ['🚕', 'Z letiště do města na 157 letištích', 'přibyly řecké a španělské ostrovy, Chorvatsko, Turecko, Pobaltí a Jordánsko; v Egyptě, Akabě a na Djerbě, kde autobus nejezdí, počítám taxi (cena za auto pro dva). U Stanstedu a dalších vidíš vedle ceny „od“ i běžnou cenu v den cesty (Stansted Express od 9,90 £, běžně 21 £).'],
  ['🚆', 'Vlak nebo bus místo letadla', 'cena konkrétního spoje za běžnou cenu (Praha–Vídeň ~500 Kč, ne akční 249) a čas i s cestou na nádraží. Auto na letiště počítá parkování podle ceníku letiště.'],
  ['🔄', 'Přepočítat po změně', 'když po hledání změníš v <b>Další možnosti</b> cestu na letiště (vlastní cenu, jízdné × nebo auto), nad výsledky je <b>↻ Přepočítat</b>. Čipy 📝 a 🛂 u letu otevřou podmínky vstupu i na telefonu.'],
  ['🏨', 'Ubytování s ověřeným volnem', 'když v Cestě klepneš na <b>Vybrat</b>, ATLAS hned zjistí, jestli má hotel na tvoje dny pořád volno a za kolik – vyprodaný se nevybere. Hotely bez ceny na tvoje dny (často obsazené) jsou schované pod tlačítkem.'],
  ['🎫', 'Cesta na letiště za skutečné ceny', 'odhad teď počítá jízdenku na konkrétní spoj v danou hodinu (ne nejlevnější spoj dne), MHD z domova na nádraží a běžný čas jízdy – z Prahy do Pardubic ~240 Kč, do Brna ~350 Kč. V <b>Další možnosti</b> uvidíš u každého letiště, z čeho odhad je.'],
  ['🚆', 'Reálnější časy cest', 'vlak mezi městy jede rychlotratí jen tam, kde opravdu vede (Barcelona → Valencie ~3 h 25, ne 2 h 10), jízdenky po Itálii, Španělsku a Francii za běžné ceny, autem na letiště podle skutečné rychlosti a „Vyraž z ubytování“ i s cestou na zastávku. Když brzy ráno vyrážíš na letiště ve svém městě a MHD ještě nejede, počítám v průběhu cesty s taxi 🚕.'],
  ['📝', 'Formulář před příletem', 'Thajsko (TDAC), Filipíny, Malajsie, Singapur, Korea, Indonésie a další chtějí online formulář – uvidíš to u letu, v Před cestou i v Co zařídit s odkazem na oficiální web.'],
  ['↻', 'Když hledání selže', 'uvidíš hned proč a tlačítko <b>Zkusit znovu</b>; 🙈 Nezajímá mě v radaru jde vrátit.'],
  ['💰', 'Cena = letenka', 'u nabídek, v radaru i v kalendáři je teď jen cena letenky (se zavazadly, když je vybereš). Doprava na letiště a z letiště do města je pod cenou zvlášť – jen pro představu, kolik zhruba stojí. Řazení „i s cestou na letiště“ je ve Filtrech.'],
  ['💱', 'Odkazy v korunách', 'Kiwi.com se otevře česky v Kč; u Ryanairu a Wizz Air uvidíš předem, v jaké měně web ukáže let zpět (účtují v měně země odletu).'],
  ['👀', 'Zaujalo tě', 'cíle, které sis po hledání Kamkoliv rozbalil, nabídne prázdné pole <b>Kam</b> – jedním klepnutím lety jen tam ve stejném termínu.'],
  ['🧭', 'Lišta podle tebe', 'dole jsou Přehled a 3 sekce, které otevíráš nejčastěji; zbytek, záloha a vzhled jsou pod <b>Další</b>. Karty radaru mají štítek počasí vždy – do 15 dní předpověď, dál dlouhodobý průměr 🌡️.'],
  ['🗣️', 'Hledání rozumí ještě víc', '„příští pátek“, „pozítří“, „mám 5000“, „do 80 €“, „z Kutné Hory“, „do Nového Zélandu“, „Slunečné pobřeží“ – a kdo hledá hlavně víkendy, tomu radar na Přehledu nabídne <b>Víkendy</b>.'],
  ['🔤', 'Překlep nevadí', '„Barcleona“, „Lodnýn“ nebo „Krakv na 2 dny“ – našeptávač nabídne „Překlep? Asi myslíš:“ se správným místem, v Letech i v Objevuj.'],
  ['🔎', 'Stačí napsat a klepnout na Najít lety', 'našeptávač rozumí i „do Barcelony“, „levně do Paříže“, „z Brna“ nebo „Praha Londýn“; napsaný text tlačítko <b>Najít lety</b> použije, i když nic nevybereš z nabídky.'],
  ['🔁', 'Objevuj podle toho, co hledáš', 'v Inspiraci jsou nahoře města, kam jsi nedávno hledal letenky – jedním klepnutím, co tam vidět.'],
  ['🧳', 'Víc měst jednou větou', 'napiš „Praha → Řím → Barcelona → Praha 10. 11. – 17. 11.“ – nastavím lety mezi městy, termíny rozdělím a hledám.'],
  ['🔁', 'Hlídání podle toho, co hledáš', 'když stejnou cestu hledáš znovu, nabídnu nad výsledky <b>♡ Hlídat cenu</b> – na Přehledu pak uvidíš, kdy zlevní.'],
  ['🗣️', 'Hledání rozumí víc', 'dny slovy („20. listopadu“, „koncem listopadu“), den odletu („v pátek“, „od pátku do neděle“), svátky („o Velikonocích“, „jarní prázdniny“, „na Valentýna“, „vánoční trhy“), šipku i pomlčku („Vídeň → Nice“, „Praha - Londýn“, i jen „Praha Londýn“), „bez kufru“, místní názvy („Roma“, „Wien“, „Lisboa“) a oblasti jako Toskánsko, Apulie, Dalmácie nebo Laponsko – v Letech i v Objevuj.'],
  ['📏', 'Kratší obrazovky', 'shrnutí cesty má <b>Uložit</b> a <b>Sdílet</b> hned pod „Co zarezervovat“, celý průběh a podrobnosti se rozbalí na klepnutí; Objevuj ukáže nejdřív 8 míst.'],
  ['📅', 'Plánovač a cesty přes víc měst', 'lety po řádcích, <b>Hledat lety</b> znovu najde stejnou trasu a <b>Ubytování</b> nabídne každé místo s jeho termínem.'],
  ['✨', 'Vyber za mě', 'v Cestě přes víc míst vybere v kroku Ubytování jedním klepnutím hotel s nejlepším poměrem ceny a hodnocení v každém místě – změnit ho můžeš kdykoliv.'],
  ['↩', 'Pokračuj, kde jsi skončil', 'na Přehledu je rozpracovaná cesta (u kterého kroku jsi) a poslední hledání – jedním klepnutím zpátky. Cesta přes víc měst letadlem jde do průvodce i bez návratu domů.'],
  ['✨', 'Chytré hledání', 'do pole <b>Kam</b> napiš celou větu – „k moři v květnu do 5000“, „Řím na víkend ve dvou“, „z Vídně do Barcelony 12. 11. – 16. 11.“ – a nahoře uvidíš, jak jí rozumím. Prázdné pole nabídne tipy podle toho, co hledáš. V Objevuj třeba „Lisabon na 3 dny“ nebo „výlety z Brna“.'],
  ['🧳', 'Cesta přes víc měst letadlem', 'vyber v Letech <b>Víc měst</b> (třeba Praha → Řím → Barcelona → Praha) a <b>Vybrat a pokračovat</b>: v Cestě je trasa podle letů, ke každému městu ubytování a program, ve shrnutí všechny letenky.'],
  ['↺', 'Začít znovu', 'v Letech pod tlačítkem hledání, v Objevuj u místa (i ✕ v poli) a v Cestě nahoře vedle vlajky – vyprázdní, co si aplikace pamatuje.'],
  ['🏨', 'Ubytování najde víc', 'v Cestě se ceny hotelů samy doplňují (TripAdvisor je u nového termínu zjišťuje pomalu) a hotely, ke kterým cena ještě nepřišla, uvidíš s běžnou cenou <b>od ~… Kč/noc</b> a odkazem na ceny na tvoje dny.'],
  ['💸', 'Nejlevnější nahoře', 'po hledání Kamkoliv jsou první 3 cíle velké karty s fotkou; detail země má nahoře fotku hlavního města.'],
  ['📅', 'Plánovač a Objevuj', 'cesty jako karty s fotkou cíle a štítkem „za 12 dní“; Objevuj s fotkou nahoře a hledáním na ní.'],
  ['🗺️', 'Mapa a Cesta v novém', 'mapa přes celý rámeček se štítkem „procestováno“ a seznamem navštívených zemí; v Cestě fotka cíle nahoře, kroky s popisky a let jako jízdenka.'],
  ['✈️', 'Nové Lety', 'fotka cíle nahoře, Odkud a Kam s tlačítkem ⇅ (prohodí je), letiště v okolí v jednom řádku, velké tlačítko hledání a <b>Nápady, kam letět</b> s fotkami.'],
  ['📉', 'Zlevnilo – hned nahoře', 'když hlídaná cena klesne nebo je pod tvou cílovou cenou, uvidíš ji na Přehledu jako velkou kartu s fotkou a tlačítkem <b>Zobrazit lety</b>.'],
  ['🧭', 'Přehlednější telefon', 'dole jen 5 sekcí – Mapa a Země jsou spolu ve <b>Světě</b>; Plánovač, Doporučení, záloha a vzhled v menu ☰ nahoře. V Letech je délka pobytu a teplota pod <b>Upřesnit</b>.'],
  ['📱', 'Nový vzhled', 'radar jako velké karty s fotkou města (na telefonu posun prstem do strany), plovoucí spodní lišta, okna zespodu – zavřeš je stažením dolů.'],
  ['⚙️', 'Výsledky hned nahoře', 'na mobilu jsou filtry, řazení a „Odkud se vyplatí letět“ pod tlačítkem ⚙️ Filtry; formulář se po hledání sbalí (✎ Upravit).'],
  ['📌', 'Odložené nabídky', '„📌 Odložit“ u nabídky nebo v ⋯ na kartě – pak <b>Porovnat</b> vedle sebe a 📤 poslat k výběru.'],
  ['🔎', 'Co tam je', 'na kartě výsledku a pod ⓘ v radaru: místa s fotkou, cesta z letiště do města, počasí, vstup.'],
  ['⭐', 'Moje cíle / 🙈 Nezajímá mě', 'v ⋯ na kartě; oblíbené s cenami v pruhu níž na Přehledu.'],
  ['🚆', 'Vlak a bus podle skutečných jízdenek', '„běžně ~X Kč (od ~Y)“; vlastní cenu cesty na letiště zadáš v Lety → Další možnosti → 🏠.'],
  ['🕘', 'Stáří cen', '„ceny z 14:32“ nad výsledky, po hodině upozornění a ↻ Hledat znovu; v průvodci „cena z …“.'],
  ['🏨', 'Hotely s cenami', 'v průvodci Cesta → Ubytování: odkaz na web, kde je pokoj na tvoje dny volný, a ↻ Aktualizovat ceny.'],
];
// Úplně nový uživatel (nic uloženého): místo seznamu novinek krátké „Vítej“ ve 3 krocích – novinky by ho jen zahltily.
// Uvítání vydrží, dokud ho uživatel neskryje: atlas_wn = WN_ID + WN_NEW. Bez toho by po výběru domova nebo prvním
// hledání (už „není nový“) místo uvítání vyskočilo 50 novinek – pro někoho, kdo aplikaci otevřel před minutou, nic
// nového. Novinky pak uvidí až s další sadou (jiné WN_ID).
const WN_NEW = '+vitej';
const firstVisit = seen => seen == null && !S.home && !S.trip && !S.trips.length && !S.recent.length && !S.watch.length;
/** Co ukázat v kartě novinek: 'welcome' (uvítání), 'news' (novinky), '' (nic – skryté). seen = atlas_wn. */
const wnMode = (seen, id = WN_ID) => (seen === id ? '' : seen === id + WN_NEW || firstVisit(seen) ? 'welcome' : 'news');
const WN_TOP = 4; // nejnovější novinky hned, starší pod „Starší novinky“
function renderWhatsNew() {
  const el = $('#whatsNew'); if (!el) return;
  let seen = null; try { seen = localStorage.getItem('atlas_wn'); } catch (e) { /* soukromé okno */ }
  const mode = wnMode(seen);
  el.hidden = !mode;
  if (el.hidden) return;
  if (mode === 'welcome' && seen !== WN_ID + WN_NEW) try { localStorage.setItem('atlas_wn', WN_ID + WN_NEW); } catch (e) { /* soukromé okno */ }
  const hide = () => { try { localStorage.setItem('atlas_wn', WN_ID); } catch (e) { /* nevadí */ } el.hidden = true; };
  // „~350 Kč“, „~3 h 25“ v textu novinek s pevnou mezerou – na úzkém telefonu se jednotka neodtrhne od čísla
  const unit = s => s.replace(/(\d) (?=(Kč|km|h|min|°C)(?![\p{L}]))/gu, '$1\u00a0').replace(/(\d\u00a0h) (?=\d)/g, '$1\u00a0');
  const li = x => `<li><span class="wn-ic" aria-hidden="true">${x[0]}</span><div><b>${esc(x[1])}</b> – ${unit(x[2])}</div></li>`;
  if (mode === 'welcome') {
    el.classList.add('welcome');
    // „Odkud letíš?“ hned nahoře: jedno klepnutí nastaví domov a radar níž začne ukazovat lety (bez domova je prázdný
    // a jeho „Odkud obvykle létáš?“ je až pod přehybem)
    const homeRow = window.Flights && Flights.homeFromChip && !S.home?.from?.length
      ? `<div class="wc-home"><b>Odkud letíš?</b><div class="wc-chips">${SearchHelp.HOME_CITIES.map(c => `<button type="button" class="fchip" data-wch="${esc(c[0])}">${esc(c[0])}</button>`).join('')}<button type="button" class="fchip" data-wch="geo">📍 Moje poloha</button></div></div>` : '';
    el.innerHTML = `<h3 class="wc-h">👋 Vítej! Najdu levné letenky a poskládám z nich celou cestu.</h3>
      ${homeRow}
      <ol class="wc-steps">
        <li><span class="wc-n">1</span><div><b>Napiš, kam chceš</b><small>město, „kamkoliv“, nebo celou větu – třeba „k moři v květnu do 5000“</small></div></li>
        <li><span class="wc-n">2</span><div><b>Vyber let</b><small>nejlevnější letenky nahoře, doprava na letiště zvlášť pod cenou</small></div></li>
        <li><span class="wc-n">3</span><div><b>Poskládej cestu</b><small>ubytování, auto, program a shrnutí s odkazy k rezervaci</small></div></li>
      </ol>
      <div class="row wrap" style="gap:8px"><button type="button" class="btn primary" id="wcGo">Začít hledat</button><button type="button" class="btn ghost" id="wnHide">Rozumím</button></div>`;
    $('#wcGo').onclick = () => {
      hide();
      const inp = $('#heroTo input'); if (inp) { inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); inp.focus({ preventScroll: true }); }
    };
    // domov nastavený → řádek zmizí (uvítání zůstane); bez polohy čipy zůstanou na výběr
    $$('[data-wch]', el).forEach(b => b.onclick = () => {
      $$('[data-wch]', el).forEach(x => { x.disabled = true; });
      Flights.homeFromChip(b.dataset.wch, ok => {
        if (ok) { const r = $('.wc-home', el); if (r) r.remove(); } else $$('[data-wch]', el).forEach(x => { x.disabled = false; });
      });
    });
  } else {
    el.classList.remove('welcome');
    const more = WHATS_NEW.slice(WN_TOP);
    el.innerHTML = `<details open><summary><b>✨ Co je nového</b> <span class="faint">– kde novinky najdeš</span></summary>
      <ul class="wn-list">${WHATS_NEW.slice(0, WN_TOP).map(li).join('')}</ul>
      ${more.length ? `<details class="wn-more"><summary>Starší novinky (${more.length})</summary><ul class="wn-list">${more.map(li).join('')}</ul></details>` : ''}
      <button type="button" class="btn sm ghost" id="wnHide">Rozumím, skrýt</button></details>`;
  }
  $('#wnHide').onclick = hide;
}
/* ---------- 🕘 Od minula ----------
   Karta nahoře na Přehledu po návratu jiný den (since.js): co se od poslední návštěvy změnilo pro uživatele – bez
   upozornění v telefonu a bez dotazů na server, jen z uloženého stavu. Stav okna v atlas_since (ne v záloze – patří
   k zařízení). Kopie v paměti jako u atlas_tip: když localStorage nejde zapsat, ✕ platí aspoň do obnovení stránky. */
const SINCE_LS = 'atlas_since';
let sinceMem = null;
function sinceLoad() {
  if (!sinceMem) { try { sinceMem = JSON.parse(localStorage.getItem(SINCE_LS)) || {}; } catch (e) { sinceMem = {}; } }
  return sinceMem;
}
function sinceSave(m) { sinceMem = m; try { localStorage.setItem(SINCE_LS, JSON.stringify(m)); } catch (e) { /* soukromé okno – platí kopie v paměti */ } }
/** Při startu: návrat po dni otevře okno „Od minula“; propadlé odložené nabídky zachytit dřív, než je aplikace uklidí. */
function sinceStart() {
  if (!window.Since) return;
  try {
    const g = Since.gate(sinceLoad(), Date.now());
    if (g.from) { const gone = Since.gonePins(g.mem.gone, S.pins, todayLocal()); if (gone.length) g.mem.gone = gone; }
    sinceSave(g.mem);
  } catch (e) { /* poškozený stav – karta se jen neukáže */ }
}
// poslední návštěva = kdy uživatel aplikaci naposledy opustil (skrytý panel, zavřená aplikace); návrat do aplikace,
// kterou telefon nechal na pozadí (bez nového načtení stránky), je taky návrat – okno „Od minula“ se otevře i tak
document.addEventListener('visibilitychange', () => {
  if (!window.Since) return;
  if (document.hidden) return sinceSave({ ...sinceLoad(), last: Date.now() });
  sinceStart();
  if (window.Flights && Flights.renderNews) Flights.renderNews(); else renderSince();
});
let sinceShown = '';
// jednopísmenná předložka a spojka („v pondělí“, „o 210 Kč“, „a 2 další“) nezůstane na konci řádku, „check-in“ se nerozdělí;
// dvakrát kvůli dvěma za sebou („a v pondělí“) – bez lookbehind, který starší Safari nezná (app.js by se nenačetl)
const SINCE_NB = /(^|[\s(])([ovkszuaiOVKSZUAI]) /g;
const sinceNb = s => esc(s).replace(SINCE_NB, '$1$2\u00a0').replace(SINCE_NB, '$1$2\u00a0').replace(/check-in/g, 'check\u2011in');
/**
 * Karta „Od minula“ (nejvýš 3 řádky, klepnutí vede na místo, ✕ skryje, dokud se řádek nezmění). Volá ji i
 * Flights.renderNews (po kontrole hlídané ceny, novém radaru) – 📉 karta už ukazuje svoje hlídání (data-wid), to se
 * neopakuje. Dokud je karta vidět nebo ji uživatel v tomhle okně zavřel ✕, řádek „Od minula“ pod hledáním mlčí
 * (data-quiet → renderNews) – jinak by po ✕ hned ukázal totéž znovu.
 */
function renderSince() {
  const el = $('#sinceCard'); if (!el || !window.Since) return;
  const m = sinceLoad(), now = Date.now(), drop = $('#dropCard');
  let lines = [];
  const open = Boolean(m.from && m.at && now - m.at < Since.CFG.hold);
  if (open) {
    try {
      lines = Since.digest({
        from: m.from, now, today: todayLocal(), watch: S.watch, trips: S.trips, gone: m.gone, hid: m.hid,
        skip: drop && !drop.hidden && drop.dataset.wid ? [drop.dataset.wid] : [],
        radar: window.Flights && Flights.radarNow ? Flights.radarNow() : null,
      });
    } catch (e) { lines = []; }
  }
  const h = lines.length ? `<div class="card since-card" role="region" aria-label="Od minula">
    <div class="sc-top"><span class="sc-h">🕘 Od minula <span class="faint">· naposledy ${sinceNb(Since.dayRef(m.from, now))}</span></span><button type="button" class="dt-x" id="scX" title="Skrýt – ukážu, až bude něco nového" aria-label="Skrýt Od minula">✕</button></div>
    <ul class="sc-rows">${lines.map((l, k) => `<li><button type="button" class="sc-row" data-sc="${k}"><span class="sc-i" aria-hidden="true">${l.ico}</span><span class="sc-t"><b>${sinceNb(l.b)}:</b> ${sinceNb(l.t)}</span><span class="sc-go" aria-hidden="true">›</span></button></li>`).join('')}</ul></div>` : '';
  el.hidden = !h;
  el.dataset.quiet = h || (open && m.shut === m.at) ? '1' : '';
  if (h === sinceShown) return;
  sinceShown = h; el.innerHTML = h;
  if (!h) return;
  $$('[data-sc]', el).forEach(b => b.onclick = () => sinceGo(lines[+b.dataset.sc].go));
  $('#scX').onclick = () => {
    const cur = sinceLoad();
    sinceSave({ ...cur, hid: [...(cur.hid || []), ...lines.map(l => l.sig)].slice(-Since.CFG.hidCap), shut: cur.at });
    if (window.Flights && Flights.renderNews) Flights.renderNews(); else renderSince();
  };
}
function sinceGo(g) {
  const to = sel => { const x = $(sel); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); return Boolean(x); };
  if (g.to === 'watch') to(`#watchList [data-w="${CSS.escape(String(g.id))}"]`) || to('#watchHead');
  else if (g.to === 'trip') openTrip(g.i);
  else if (g.to === 'radar') to('#radarHead');
  else if (g.to === 'search' && window.Flights) Flights.searchTo(g.places.map(p => ({ id: p.id, label: p.label, flag: p.cc ? flag(p.cc) : '' })));
  else go('flights');
}
/* ---------- 💡 Věděl jsi? ----------
   Jeden tip denně na funkci, kterou uživatel ještě nepoužil – poznáno jen z toho, co už je uložené (S a Objevuj).
   Ne při prvním spuštění (bez domova a hledání), skrytý tip se už neukáže. atlas_tip = { day, id, hid: [skryté] }.
   used(s, x): x.explore = Objevuj má uložený stav; ok(s, today): tip má smysl (Na cestě jen s cestou před sebou). */
const tipNext = (s, today) => (s.trips || []).map((t, i) => ({ t, i })).filter(y => y.t && /^\d{4}-\d{2}-\d{2}$/.test(y.t.start || '') && (y.t.end || y.t.start) >= today)
  .sort((a, b) => a.t.start.localeCompare(b.t.start))[0] || null;
const DASH_TIPS = [
  { id: 'any', ico: '🌍', h: 'Kamkoliv', t: 'nech pole Kam prázdné a najdu nejlevnější cíle z tvých letišť; v 📅 Kalendáři uvidíš nejlevnější den.', btn: 'Hledat kamkoliv',
    used: s => (s.recent || []).some(e => e && e.form && Array.isArray(e.form.to) && !e.form.to.length && e.form.trip !== 'multi'), run: () => (window.Flights ? Flights.searchTo([]) : go('flights')) },
  { id: 'watch', ico: '♡', h: 'Hlídání ceny', t: 'nad výsledky hledání klepni na ♡ Hlídat cenu – tady na Přehledu pak uvidíš, kdy cesta zlevní.', btn: 'Otevřít Lety',
    used: s => (s.watch || []).length > 0, run: () => go('flights') },
  { id: 'pin', ico: '📌', h: 'Odložené nabídky', t: '📌 Odložit u nabídky ji schová na později – pak je porovnáš vedle sebe a pošleš k výběru.', btn: 'Otevřít Lety',
    used: s => (s.pins || []).length > 0, run: () => go('flights') },
  { id: 'auto', ico: '⚡', h: 'Hotová cesta', t: 'v Cestě vyber let a klepni na ⚡ Poskládej celou cestu za mě – ubytování i program vyberu za tebe.', btn: 'Otevřít Cestu',
    used: s => Boolean(s.trip) || (s.trips || []).some(t => t && t.wizard), run: () => go('trip') },
  { id: 'explore', ico: '🧭', h: 'Objevuj', t: 'napiš město nebo „Lisabon na 3 dny“ – ukážu, co tam vidět, a naplánuju program po dnech.', btn: 'Otevřít Objevuj',
    used: (s, x) => Boolean(x.explore || (s.navUse && s.navUse.explore)), run: () => go('explore') },
  { id: 'now', ico: '📍', h: 'Na cestě', t: 'ulož si k cestě kód rezervace – od 2 dnů před odjezdem ho uvidíš nahoře na Přehledu s programem dne, i bez signálu.', btn: 'Přidat rezervaci',
    ok: (s, today) => Boolean(tipNext(s, today)), used: s => (s.trips || []).some(t => t && Array.isArray(t.refs) && t.refs.length),
    run: () => { const n = tipNext(S, todayLocal()); if (n) openTrip(n.i); } },
];
/** Dnešní tip → položka DASH_TIPS nebo null. Týž den týž tip (po skrytí už žádný), další den další nepoužitý v pořadí. */
function tipPick(s, x, mem, today) {
  if (!s.home || !s.home.from || !s.home.from.length || !(s.recent || []).length) return null;
  const m = mem && typeof mem === 'object' ? mem : {}, hid = Array.isArray(m.hid) ? m.hid : [];
  const ok = DASH_TIPS.filter(t => !hid.includes(t.id) && (!t.ok || t.ok(s, today)) && !t.used(s, x));
  if (m.day === today) return ok.find(t => t.id === m.id) || null;
  const k = DASH_TIPS.findIndex(t => t.id === m.id);
  return ok.find(t => DASH_TIPS.indexOf(t) > k) || ok[0] || null;
}
// Kopie atlas_tip v paměti: když localStorage nejde číst ani zapsat (soukromé okno, zablokované úložiště), ✕ by se
// jinak nezapsalo a skrytý tip by se vrátil při dalším vykreslení Přehledu – takhle zůstane skrytý aspoň do obnovení.
// Co se v tomhle sezení zapsalo, platí před tím, co je v úložišti (zápis tam mohl selhat).
let tipMem = null;
function renderDashTip() {
  const el = $('#dashTip'); if (!el) return;
  let mem = null, explore = false;
  try { mem = JSON.parse(localStorage.getItem('atlas_tip')); explore = localStorage.getItem('atlas_explore_v1') != null; } catch (e) { /* soukromé okno, poškozený zápis */ }
  if (tipMem) mem = tipMem;
  const today = todayLocal(), tip = tipPick(S, { explore }, mem, today), hid = mem && Array.isArray(mem.hid) ? mem.hid : [];
  const put = m => { tipMem = m; try { localStorage.setItem('atlas_tip', JSON.stringify(m)); } catch (e) { /* nevadí – platí kopie v paměti */ } };
  el.hidden = !tip;
  if (!tip) { el.innerHTML = ''; return; }
  if (!mem || mem.day !== today || mem.id !== tip.id) put({ day: today, id: tip.id, hid });
  el.innerHTML = `<span class="dt-ic" aria-hidden="true">${tip.ico}</span><div class="dt-b"><b>💡 Věděl jsi? ${esc(tip.h)}</b> – ${esc(tip.t)}
    <div><button type="button" class="btn sm" id="dtGo">${esc(tip.btn)}</button></div></div><button type="button" class="dt-x" id="dtX" title="Skrýt tip" aria-label="Skrýt tip">✕</button>`;
  $('#dtGo').onclick = () => tip.run();
  $('#dtX').onclick = () => { put({ day: today, id: null, hid: [...hid, tip.id] }); el.hidden = true; };
}
function renderDash() {
  renderSince();
  renderDashStats();
  renderWhatsNew();
  renderDashTip();
  $$('.link[data-go]').forEach(l => { l.onclick = () => go(l.dataset.go); kbClick(l); });
  if (window.Flights) { Flights.renderResume(); Flights.renderQuick(); Flights.renderWatch(); Flights.renderRadar(); Flights.renderFav(); Flights.renderPins(); }
}
/** Dlaždice a „Kam vyrazit“ na přehledu (po změně navštívených zemí nebo cest – bez radaru a hlídaných cen). */
function renderDashStats() {
  renderNow();
  const st = stats(); const m = new Date().getMonth() + 1;
  const topRec = scoreCountries(m, {}).filter(r => !visited.has(r.c.iso2))[0];
  const w = (S.watch || []).length;
  // jen dlaždice, ve kterých něco je (nový uživatel neuvidí řadu nul); bez nich ani tip měsíce – ten je níž v Tipech
  const tiles = [
    st.count ? ['Navštívené země', `${st.count}<small> / ${TOT}</small>`, `${st.pct}% světa`, `<div class="progress"><span style="width:${st.pct}%"></span></div>`] : null,
    w ? ['Hlídané ceny', `<span id="watchStatVal">${w}</span>`, `<span id="watchStatSub">${window.Flights ? Flights.watchStatTxt() : ''}</span>`, ''] : null,
    S.trips.length ? nextTripStat() : null,
  ].filter(Boolean);
  if (tiles.length) tiles.push(['Tip na ' + MNS_FULL[m - 1], topRec ? `${flag(topRec.c.iso2)}` : '—', topRec ? topRec.c.cs : '', topRec ? `<button type="button" class="linkbtn nt-open" data-tipiso="${topRec.c.iso2}">Proč tam →</button>` : '']);
  $('#statGrid').hidden = !tiles.length;
  $('#statGrid').innerHTML = tiles.map(s => `<div class="card stat"><div class="lab">${s[0]}</div><div class="val">${s[1]}</div><div class="sub">${s[2]}</div>${s[3] || ''}</div>`).join('');
  const recs = scoreCountries(m, {}).filter(r => !visited.has(r.c.iso2)).slice(0, 4);
  paintHero();
  $('#dashRecs').innerHTML = recs.map(r => destCard(r.c, r.score)).join('');
  bindDest('#dashRecs');
  Photos.paint($('#dashRecs'));
  $$('[data-nt]').forEach(b => b.onclick = () => { go('planner'); setTimeout(() => openTrip(+b.dataset.nt), 250); });
  $$('[data-gop]').forEach(b => b.onclick = () => go('planner'));
  $$('[data-tipiso]').forEach(b => b.onclick = () => openCountry(b.dataset.tipiso));
}

/* ================= DEST CARD ================= */
function costDots(n) { return `<span class="dots warm">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`; }
/* ================= 📷 FOTKY NA KARTÁCH =================
   Prvek s data-photo="Řím" dostane fotku města jako pozadí (--ph, třída ph), až je skoro vidět. Adresy z api/photos
   (Pexels nebo Unsplash s klíčem, jinak Wikimedia; jeden dotaz na viditelné karty), v prohlížeči 30 dní – fotky
   z Wikimedie 6 hodin, ať se po přidání klíče brzy vymění (server je má v mezipaměti, dotaz je levný). Fotka se na kartu dá až načtená a jen tak velká, jak ji karta
   na displeji potřebuje (~40–150 kB, pak v mezipaměti prohlížeče). U fotky z Pexels a Unsplash drobně autor s odkazem
   na jeho profil a na zdroj (podmínky Unsplash API) – odkaz otevře nové okno, karta pod ním se neotevře. */
const Photos = (() => {
  const KEY = 'atlas_ph8', TTL = { pexels: 30 * 864e5, unsplash: 30 * 864e5, wiki: 6 * 36e5 };
  // zdroj fotky podle serveru, odkud se načítá: název a odkaz zpět (Unsplash s utm)
  const SRC = { 'images.pexels.com': ['Pexels', 'https://www.pexels.com/'], 'images.unsplash.com': ['Unsplash', 'https://unsplash.com/?utm_source=atlas_letenky&utm_medium=referral'] };
  const srcOf = u => SRC[(/^https:\/\/([^/]+)\//.exec(u) || [])[1]] || null;
  try { ['atlas_ph', 'atlas_ph2', 'atlas_ph3', 'atlas_ph4', 'atlas_ph5', 'atlas_ph6', 'atlas_ph7'].forEach(k => localStorage.removeItem(k)); } catch (e) { /* nevadí */ }
  let mem = null, timer = null, io = null;
  const queue = new Set();
  const store = () => { if (!mem) { try { mem = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { mem = {}; } } return mem; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(store()).sort((a, b) => b[1].t - a[1].t).slice(0, 400)))); } catch (e) { /* plné úložiště */ } };
  const fresh = (e, now) => e && now - e.t < (TTL[e.p] || TTL.wiki);
  // Pexels a Unsplash: výřez přesně na tvar karty (šířka po stupních, ať se fotka v prohlížeči znovu použije), displej
  // nejvýš 2× (víc na fotce pod textem vidět není), kvalita 60; Wikimedia: fotka na šířku vyplní kartu → šířka 330/500/960
  const dprOf = () => Math.min(window.devicePixelRatio || 1, 2);
  function sized(u, el) {
    const cw = el.clientWidth * dprOf(), ch = el.clientHeight * dprOf();
    if (srcOf(u)) {
      const w = [400, 600, 800, 1200, 1600].find(x => x >= cw) || 1600, h = Math.min(2000, Math.round((w * ch) / Math.max(1, cw) / 50) * 50) || w;
      return u.replace(/w=960&h=1200/, `w=${w}&h=${h}`).replace('&q=75', '&q=60');
    }
    const need = Math.max(cw, ch * 1.5);
    return need <= 330 ? u.replace('/960px-', '/330px-') : need <= 560 ? u.replace('/960px-', '/500px-') : u;
  }
  // náhled ~1 kB (Pexels, Unsplash): karta má hned rozmazanou fotku, ostrá se dosadí, až se načte
  const tinyOf = (u, el) => u.replace(/w=960&h=1200/, `w=24&h=${Math.max(8, Math.round((24 * el.clientHeight) / Math.max(1, el.clientWidth)))}`).replace('&q=75', '&q=30');
  function show(el) {
    const e = store()[el.dataset.photo];
    if (!e || !/^https:\/\//.test(e.u) || !el.isConnected || el.dataset.phu === e.u) return;
    el.dataset.phu = e.u;
    const src = sized(e.u, el), img = new Image();
    const set = s => { el.style.setProperty('--ph', `url("${s.replace(/["\\]/g, encodeURIComponent)}")`); el.classList.add('ph'); credit(el, e); };
    let sharp = false;
    if (srcOf(e.u)) {
      const lo = new Image(), tiny = tinyOf(e.u, el);
      lo.onload = () => { if (!sharp && el.isConnected) set(tiny); };
      lo.src = tiny;
    }
    img.onload = () => {
      sharp = true;
      if (el.isConnected) set(src);
    };
    img.src = src;
  }
  /**
   * Autor fotky (podmínky Unsplash): jen drobné ⓘ v rohu fotky – klepnutí (na počítači i najetí myší) ukáže „Foto: Jméno /
   * Unsplash“ s odkazy na profil a zdroj; na malé ikonce (srovnání, hlídání) jen v title.
   */
  function credit(el, e) {
    const src = srcOf(e.u);
    if (!src || !e.by) return;
    el.title = `Foto: ${e.by} / ${src[0]}`;
    if (el.clientWidth < 140 || el.querySelector(':scope > .ph-cr')) return;
    const bu = /^https:\/\/(www\.)?(unsplash|pexels)\.com\/[^\s"'<>]*$/.test(e.bu || '') ? e.bu : '';
    const lk = (href, txt, cls = '') => `<span class="ph-a${cls}" role="link" tabindex="0" data-href="${esc(href)}">${esc(txt)}</span>`;
    const s = document.createElement('span');
    s.className = 'ph-cr';
    // dlouhé jméno autora se zkrátí (…), zdroj („/ Unsplash“) zůstane celý
    s.innerHTML = `<span class="ph-i" role="button" tabindex="0" aria-label="Kdo fotil">i</span><span class="ph-pop"><span>Foto:</span>${bu ? lk(bu, e.by, ' ph-by') : `<span class="ph-by">${esc(e.by)}</span>`}<span>/</span>${lk(src[1], src[0])}</span>`;
    el.append(s);
  }
  // ⓘ otevře popisek (karta pod ním se neotevře); odkaz v popisku: nové okno; klepnutí jinam popisek zavře
  // (karty bývají tlačítka – <a> v nich nejde)
  const openCredit = ev => {
    const t = ev.target && ev.target.closest ? ev.target : null;
    const i = t && t.closest('.ph-cr .ph-i'), a = t && t.closest('.ph-cr [data-href]');
    if (ev.type === 'keydown' && ev.key !== 'Enter') return;
    $$('.ph-cr.open').forEach(c => { if (!i || c !== i.parentNode) c.classList.remove('open'); });
    if (!i && !a) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (i) i.parentNode.classList.toggle('open');
    else window.open(a.dataset.href, '_blank', 'noopener');
  };
  document.addEventListener('click', openCredit, true);
  document.addEventListener('keydown', openCredit, true);
  async function flush() {
    const els = [...queue].filter(el => el.isConnected);
    queue.clear();
    const st = store(), now = Date.now();
    // fotky uložené v prohlížeči hned (i starší – obnoví se na pozadí); na server (po uspání se i minutu probouzí)
    // čekají jen karty, které fotku ještě nemají
    els.forEach(el => { if (st[el.dataset.photo] && st[el.dataset.photo].u) show(el); });
    const ask = [...new Set(els.map(el => el.dataset.photo).filter(t => t && !fresh(st[t], now)))].slice(0, 30);
    if (ask.length) {
      try {
        // v=3 (a nový klíč atlas_ph8): fotky uložené v prohlížeči před lepším výběrem z Unsplash se znovu nepoužijí
        const j = await (await fetch('api/photos?v=3&t=' + enc(ask.join('|')))).json(), p = Object.hasOwn(TTL, j.prov) ? j.prov : 'wiki';
        // náhradní výběr (zdroj neodpověděl) jen na den – pak hezčí fotka
        for (const [t, u] of Object.entries(j.photos || {})) st[t] = { u: String(u || ''), t: j.partial ? now - TTL[p] + 864e5 : now, p, by: String((j.by || {})[t] || ''), bu: String((j.bu || {})[t] || '') };
        save();
      } catch (e) { /* bez sítě: karty bez fotek, příště znovu */ }
    }
    els.forEach(show);
  }
  function want(el) { queue.add(el); clearTimeout(timer); timer = setTimeout(flush, 60); }
  /** Fotky pro karty s data-photo v root – až jsou karty skoro vidět (i v pruhu do strany). */
  function paint(root = document) {
    const els = $$('[data-photo]', root).filter(el => !el.classList.contains('ph') && !el.dataset.phw);
    if (!els.length) return;
    els.forEach(el => { el.dataset.phw = '1'; });
    if (!('IntersectionObserver' in window)) { els.forEach(want); return; }
    io = io || new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); want(e.target); } }), { rootMargin: '600px 1200px' }); // pruhy do strany a kus dolů dopředu
    els.forEach(el => io.observe(el));
  }
  return { paint };
})();
window.Photos = Photos;
// úvod Přehledu: velká fotka krásného místa (každý den jiná) pod „Kam poletíme?“ a hledáním na skle
const HERO_PLACES = ['Santorini', 'Benátky', 'Dubrovník', 'Lisabon', 'Amalfi', 'Kjóto', 'Bali', 'Paříž', 'Barcelona', 'Porto', 'Hallstatt', 'Kapské Město', 'Rio de Janeiro', 'Madeira'];
function paintHero() {
  const h = $('#heroBox');
  if (!h || h.dataset.photo) return;
  h.dataset.photo = HERO_PLACES[Math.floor(Date.now() / 864e5) % HERO_PLACES.length];
  Photos.paint(h.parentNode);
}
// barva karty bez fotky: tlumený přechod podle země (stejná země = stejná barva), jen chladné tóny
const ccHue = cc => 175 + [...String(cc || '')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 110, 7);
window.ccHue = ccHue;
// místo dne s posunem (Lety mají jiné než Přehled)
window.heroPlace = (off = 0) => HERO_PLACES[(Math.floor(Date.now() / 864e5) + off) % HERO_PLACES.length];

function destCard(c, score) {
  const months = c.months ? monthRanges(c.months) : '';
  return `<div class="card dest ${visited.has(c.iso2) ? 'visited' : ''}" data-iso="${c.iso2}" data-photo="${esc(c.capCs || c.cap || c.cs)}" style="--h:${ccHue(c.iso2)}">
    ${score ? `<div class="score-pill">${score}</div>` : `<div class="vmark"><svg viewBox="0 0 24 24" width="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>`}
    <div class="flag">${flag(c.iso2)}</div>
    <div class="dest-panel"><div class="cname">${c.cs}</div><div class="ccont">${c.cont}${c.cap ? ' · ' + (c.capCs || c.cap) : ''}</div>
    <div class="cblurb">${c.blurb || 'Objev tuto zemi – počasí, ceny i odkazy najdeš uvnitř.'}</div>
    ${entryChip(c.iso2)}<div class="meta">${c.cost ? costDots(c.cost) : '<span></span>'}${months ? `<span>${months}</span>` : ''}</div></div>
  </div>`;
}
// Vstupní podmínky (entry.js): čip na kartě; data se načítají po startu, pak se čipy doplní (paintEntryChips).
const entryChip = iso => (window.Entry && Entry.ready() ? Entry.cardChip(iso) : '');
function paintEntryChips() { $$('.dest[data-iso]').forEach(el => { const m = $('.meta', el); if (m && !$('.ec', el)) m.insertAdjacentHTML('beforebegin', entryChip(el.dataset.iso)); }); }
function bindDest(sel) { $$(sel + ' .dest[data-iso]').forEach(el => { el.onclick = () => openCountry(el.dataset.iso); kbClick(el); }); }
/**
 * Karta nebo odkaz z <div>/<span> s klikem (karta země, dlaždice Rychlého hledání, cesta v Plánovači, „Obnovit →“) i pro
 * klávesnici: Tab na ně skočí a Enter / mezerník je otevře jako klik – na počítači se k nim bez myši nedalo dostat
 * (Země, Doporučení i Plánovač jen myší). Jako postranní lišta (.nav-item). Klávesa na tlačítku uvnitř karty (ⓘ autor
 * fotky) kartu neotevře.
 */
function kbClick(el) {
  if (!el) return;
  el.tabIndex = 0; el.setAttribute('role', 'button');
  el.onkeydown = e => { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); } };
}

/* ================= RECOMMENDATIONS ENGINE ================= */
function scoreCountries(month, opt) {
  const { vibe = '', budget = 9, safe = 0 } = opt || {};
  return COUNTRIES.filter(c => c.cost).filter(c => c.cost <= budget && c.safety >= safe).map(c => {
    let season = 0; if (c.months.includes(month)) season = 1; else if (c.months.includes(month % 12 + 1) || c.months.includes((month + 10) % 12 + 1)) season = .5;
    const value = (6 - c.cost) / 5, safety = c.safety / 5;
    let vm = 0; if (vibe) { const kws = VIBES[vibe] || []; const hay = norm(c.blurb + ' ' + (c.tags || []).join(' ')); if (kws.some(k => hay.includes(norm(k)))) vm = 1; }
    // mimo nejlepší měsíce (ani o měsíc vedle) výrazně níž: levná a bezpečná země v monzunu (Srí Lanka v červenci)
    // nesmí předběhnout zemi, kde je teď sezóna
    const total = (season * 3 + value * 2 + safety * 1.5 + vm * 3 + (c.safety >= 4 ? .3 : 0)) * (season ? 1 : 0.55);
    const max = vibe ? 9.8 : 6.8;
    return { c, score: Math.round(total / max * 100), season, vibe: vm ? vibe : '' };
  }).sort((a, b) => b.score - a.score);
}
const VIBE_TAG = { 'pláže': 'pláže a moře', hory: 'hory', historie: 'historie', safari: 'příroda', 'město': 'města' };
function renderRecs() {
  const m = +$('#rMonth').value, vibe = $('#rVibe').value, budget = +$('#rBudget').value, safe = +$('#rSafe').value;
  $('#recTitle').textContent = 'Kam vyrazit · ' + MNS_FULL[m - 1];
  const list = scoreCountries(m, { vibe, budget, safe }).slice(0, 18);
  $('#recGrid').innerHTML = list.map(r => {
    // zvolený styl, který země splňuje, napřed („✓ hory“) – jinak by Litva mezi horami vypadala jako horská
    const reasons = r.vibe ? [VIBE_TAG[r.vibe] || r.vibe] : []; if (r.season === 1) reasons.push('ideální počasí'); if (r.c.cost <= 2) reasons.push('levné'); if (r.c.safety >= 5) reasons.push('velmi bezpečné'); else if (r.c.safety >= 4) reasons.push('bezpečné');
    const c = r.c;
    return `<div class="card dest" data-iso="${c.iso2}" data-photo="${esc(c.capCs || c.cap || c.cs)}" style="--h:${ccHue(c.iso2)}"><div class="score-pill">${r.score}</div>
      <div class="flag">${flag(c.iso2)}</div><div class="dest-panel"><div class="cname">${c.cs}</div><div class="ccont">${c.cont}</div>
      <div class="cblurb">${c.blurb}</div>
      <div class="tags">${reasons.map(x => `<span class="tag">✓ ${x}</span>`).join('')}</div>
      ${entryChip(c.iso2)}<div class="meta">${costDots(c.cost)}<span>${monthRanges(c.months)}</span></div></div></div>`;
  }).join('');
  bindDest('#recGrid');
  Photos.paint($('#recGrid'));
}

/* ================= COUNTRIES GRID ================= */
// Země po stránkách (telefon 24, jinak 60) – 197 karet by byla obrazovka přes 26 000 px; jiný filtr = zase od začátku,
// překreslení se stejnými filtry (✓ Navštíveno v detailu) nechá, kolik už bylo vidět
let cLimit = 0, cKey = '';
const cPage = () => (typeof matchMedia === 'function' && matchMedia('(max-width:760px)').matches ? 24 : 60);
function renderCountries() {
  const q = norm($('#cSearch').value), cont = $('#cCont').value, cost = $('#cCost').value, sort = $('#cSort').value, vis = $('#cVisited .on').dataset.v, ent = $('#cEntry').value;
  const key = [q, cont, cost, sort, vis, ent].join('|');
  if (key !== cKey || !cLimit) { cKey = key; cLimit = cPage(); }
  let list = COUNTRIES.slice();
  if (q) list = list.filter(c => norm(c.cs).includes(q) || norm(c.en).includes(q) || (c.tags || []).some(t => norm(t).includes(q)));
  if (cont) list = list.filter(c => c.cont === cont);
  // skupiny jako popisky v detailu: 1–2 levné, 3 střední, 4–5 dražší/drahé
  if (cost) list = list.filter(c => c.cost && (cost === '1' ? c.cost <= 2 : cost === '2' ? c.cost === 3 : c.cost >= 4));
  if (vis === 'yes') list = list.filter(c => visited.has(c.iso2)); else if (vis === 'no') list = list.filter(c => !visited.has(c.iso2));
  if (ent && window.Entry) list = list.filter(c => c.iso2 !== 'CZ' && Entry.matches(c.iso2, ent));
  if (sort === 'cost') list.sort((a, b) => (a.cost || 9) - (b.cost || 9)); else if (sort === 'safety') list.sort((a, b) => (b.safety || 0) - (a.safety || 0)); else list.sort((a, b) => a.cs.localeCompare(b.cs, 'cs'));
  const rest = list.length - cLimit;
  $('#countryGrid').innerHTML = list.length ? list.slice(0, cLimit).map(c => destCard(c)).join('')
    + (rest > 0 ? `<button type="button" class="btn c-more" id="cMore">Zobrazit další země (${rest})</button>` : '')
    : `<div class="empty" style="grid-column:1/-1"><div class="ei">${ico('M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20')}</div><div>Hledání a filtrům neodpovídá žádná země – zkus jiný název nebo filtry uvolni.</div><button type="button" class="btn sm" id="cReset" style="margin-top:12px">Zrušit filtry</button></div>`;
  const more = $('#cMore'); if (more) more.onclick = () => { cLimit += cPage() * 2; renderCountries(); };
  // prázdný výsledek: hledání i filtry pryč jedním klepnutím (řazení zůstane)
  const reset = $('#cReset'); if (reset) reset.onclick = () => {
    ['#cSearch', '#cCont', '#cCost', '#cEntry'].forEach(s => { $(s).value = ''; });
    $$('#cVisited button').forEach(b => b.classList.toggle('on', b.dataset.v === 'all'));
    // přes obsluhu výběru (cFilt + renderCountries): jinak by na telefonu zůstal na ⚙️ Filtry starý počet filtrů
    $('#cCont').onchange();
  };
  bindDest('#countryGrid');
  Photos.paint($('#countryGrid'));
}

/* ================= COUNTRY MODAL ================= */
// hláška z předchozí akce („📌 Odloženo…“) by zakryla spodek panelu s tlačítky – s otevřením okna zmizí; překreslení už
// otevřeného okna (📌 Odložené po ⚡ Ověřit) ji nechá – vysvětluje, co se právě stalo
// o.hist === false: okno si krok historie řídí samo (náhled cíle – flights.js dpOpen)
function modalOpen(html, o = {}) {
  const was = $('#modalBg').classList.contains('show');
  if (!was) modalKb.ret = document.activeElement; // tlačítko, které okno otevřelo – po zavření na něj vrátit fokus
  $('#modal').innerHTML = html; $('#modalBg').classList.add('show');
  if (!was) { $('#toast').classList.remove('show'); $('#modal').scrollTop = 0; } // nové okno nahoře, ne s posunem z minulého
  // krok historie jen pro nově otevřené okno – okno otevřené z okna (Info o zemi z náhledu…) ho jen nahradí
  if (!was && o.hist !== false && !hist.modal) {
    hist.modal = true;
    const push = () => { if (hist.mq === push) hist.mq = null; history.pushState({ atlasM: 1 }, ''); };
    hist.mq = hist.backs ? push : null; // krok čeká na rozběhnutý návrat – okno zavřené dřív ho jen zruší
    histDo(push);
  }
}
function modalClose() {
  $('#modalBg').classList.remove('show');
  if (!hist.modal) return;
  // krok okna zpět (Zpět by jinak napoprvé „nic neudělal“); ještě nezapsaný krok jen zrušit – návrat navíc by vedl mimo
  hist.modal = false;
  if (hist.mq) { hist.queue = hist.queue.filter(f => f !== hist.mq); hist.mq = null; } else histBack();
}
$('#modalBg').onclick = e => { if (e.target === $('#modalBg')) modalClose(); };
/* Okno a klávesnice na počítači: fokus zůstával na tlačítku pod oknem a Tab chodil po stránce schované za ním (okno
   je v HTML až na konci) – z klávesnice se v okně nedalo nic vybrat. Otevřené okno teď fokus dostane (šipky a PageDown
   posouvají okno), Tab v něm koluje dokola a po zavření (✕, Escape, Zpět, klik vedle) se fokus vrátí na tlačítko,
   které okno otevřelo. Jen počítač s myší – na telefonu beze změny. Okno, které fokus dá samo dovnitř (nabídka ⋯), si
   ho nechá. */
const modalKb = { ret: null, mq: window.matchMedia ? matchMedia('(min-width:1024px) and (hover:hover) and (pointer:fine)') : null };
new MutationObserver(() => {
  const m = $('#modal'), on = $('#modalBg').classList.contains('show');
  if (on === modalKb.on) return;
  modalKb.on = on;
  if (!modalKb.mq || !modalKb.mq.matches) return;
  const a = document.activeElement;
  if (on) { if (!m.contains(a)) { m.tabIndex = -1; m.focus({ preventScroll: true }); } return; }
  const r = modalKb.ret; modalKb.ret = null;
  // fokus někam přesunula sama akce okna (náhled cíle vrací na 🔎) → nechat
  if ((!a || a === document.body || $('#modalBg').contains(a)) && r && r.isConnected && r.getClientRects().length) r.focus({ preventScroll: true });
}).observe($('#modalBg'), { attributes: true, attributeFilter: ['class'] });
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || e.defaultPrevented || !$('#modalBg').classList.contains('show')) return;
  const m = $('#modal'), a = document.activeElement;
  const fs = $$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])', m)
    .filter(x => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
  const i = fs.indexOf(a);
  const to = !fs.length ? m : !m.contains(a) || (e.shiftKey && a === m) ? fs[e.shiftKey ? fs.length - 1 : 0]
    : e.shiftKey && i === 0 ? fs[fs.length - 1] : !e.shiftKey && i === fs.length - 1 ? fs[0] : null;
  if (!to) return;
  e.preventDefault();
  if (to === m) m.tabIndex = -1;
  to.focus();
});
// ✕ (data-close) ve všech oknech jednou obsluhou: obsluhy v atributech HTML (onclick) CSP stránky nepustí (server/lib/security.js)
$('#modal').addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-close]')) modalClose(); });
// telefon: panel zespodu jde zavřít stažením za horní okraj (úchyt) dolů – jen když je obsah odscrollovaný nahoru
(() => {
  const m = $('#modal');
  let y0 = null, dy = 0;
  const reset = () => { m.style.transform = ''; m.style.transition = ''; };
  m.addEventListener('touchstart', e => {
    y0 = null;
    if (innerWidth > 560 || m.scrollTop > 0 || e.touches.length > 1) return;
    if (e.touches[0].clientY - m.getBoundingClientRect().top > 64 || e.target.closest('input,textarea,select,.maplibregl-map')) return;
    y0 = e.touches[0].clientY; dy = 0; m.style.transition = 'none';
  }, { passive: true });
  m.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    m.style.transform = dy ? `translateY(${dy}px)` : '';
  }, { passive: true });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    m.style.transition = 'transform .2s ease';
    if (dy > 90) { m.style.transform = 'translateY(100%)'; setTimeout(() => { modalClose(); reset(); }, 190); }
    else { m.style.transform = ''; setTimeout(reset, 210); }
  };
  m.addEventListener('touchend', end);
  m.addEventListener('touchcancel', end);
})();
function monthsStrip(best) { const now = new Date().getMonth() + 1; return `<div class="months">${MNS.map((m, i) => `<div class="m ${best && best.includes(i + 1) ? 'best' : ''} ${i + 1 === now ? 'now' : ''}">${m}</div>`).join('')}</div>`; }
// Průměrná denní maxima po měsících (/api/climate: meteostanice u hlavního letiště, jinak NASA POWER); bez dat jen zástupné buňky stejné výšky.
const tempBg = t => `hsl(${Math.max(0, Math.min(220, 220 - (t + 5) * 6.3))} 85% 55% / .28)`;
function climStrip(c) {
  const now = new Date().getMonth() + 1;
  const r = (a, i) => Math.round(+a[i]);
  return `<div class="months clim">${MNS.map((m, i) => c
    ? `<div class="m ${i + 1 === now ? 'now' : ''}" style="background:${tempBg(r(c.hi, i))}" title="${MNS_FULL[i]}: přes den ~${r(c.hi, i)} °C, v noci ~${r(c.lo, i)} °C, srážky ~${r(c.p, i)} mm">${m}<b>${r(c.hi, i)}°</b></div>`
    : `<div class="m ${i + 1 === now ? 'now' : ''}">${m}<b>·</b></div>`).join('')}</div>`;
}
const CLIM = {};
async function loadClimate(iso) {
  try {
    if (!CLIM[iso]) {
      const r = await fetch('api/climate?cc=' + enc(iso));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      CLIM[iso] = await r.json();
    }
    const c = CLIM[iso], box = $('#climBox');
    if (curIso !== iso || !box) return;
    if (!Array.isArray(c.hi)) return box.remove(); // země bez údajů ({ none: true }) – zapamatovaná, bez dalšího dotazu
    $('.months', box).outerHTML = climStrip(c);
    $('#climWhere').textContent = c.city ? `· ${c.city} (${c.iata})` : '';
    if (c.source) box.title = `Dlouhodobý průměr: ${c.source}. Není to předpověď.`;
  } catch (e) {
    // bez údajů o podnebí se řádek prostě nezobrazí
    const box = $('#climBox'); if (box && curIso === iso) box.remove();
  }
}

function openCountry(iso) {
  const c = byIso[iso]; if (!c) return; curIso = iso;
  const isV = visited.has(iso);
  const mzv = 'https://www.mzv.gov.cz/jnp/cz/cestujeme/index.html';
  const geoNote = c.geo ? `<div class="note ${c.safety <= 2 ? 'bad' : 'warn'}" style="margin-bottom:14px">${ico('M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z')}<div>${c.geo}</div></div>` : '';
  const safeTxt = c.safety ? ['', 'velmi rizikové', 'zvýšená opatrnost', 'střední', 'bezpečné', 'velmi bezpečné'][c.safety] : '—';
  const costTxt = c.cost ? ['', 'velmi levné', 'levné', 'střední', 'dražší', 'drahé'][c.cost] : '—';
  modalOpen(`
   <div class="modal-hero mh-photo" data-photo="${esc(c.capCs || c.cap || c.cs)}"><div class="mh-bg ${c.cost >= 4 ? 'warm' : ''}"></div>
     <button class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button>
     <div class="modal-hero-inner">
       <div class="mh-flag">${flag(iso)}</div>
       <h2 class="mh-name">${c.cs}</h2>
       <div class="mh-sub">${c.cont}${c.cap ? ' · ' + (c.capCs || c.cap) : ''} · ${c.en}</div>
       ${c.blurb ? `<div class="mh-blurb">${c.blurb}</div>` : ''}
     </div>
   </div>
   <div class="modal-body">
     ${geoNote}
     <div class="row wrap cm-acts">
       <button class="btn primary" data-cm="search">${ico('M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z')} Najít lety sem</button>
       ${window.Lazy || (window.Places && Places.openCountryView) ? `<button class="btn" data-cm="explore">🌍 Objevuj celou zemi</button>` : ''}
       <button class="btn" data-cm="stay">${ico('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z')} Ubytování</button>
       <button class="btn" data-cm="plan">${ico('M12 5v14M5 12h14')} Do plánu</button>
       <button class="btn ${isV ? 'warm' : 'ghost'}" id="visBtn" data-cm="vis">${isV ? '✓ Navštíveno' : 'Byl/a jsem tu'}</button>
     </div>
     <div id="wxBox" class="weather-now"><div class="wico">⏳</div><div><div class="muted" style="font-size:12px">Načítám počasí…</div><div class="temp">--°</div></div></div>
     <div id="fcBox" class="forecast"></div>
     <div class="divider"></div>
     <div class="kv">
       <div><div class="k">Cenová hladina</div><div class="v">${c.cost ? costDots(c.cost) : '—'}</div><div class="faint" style="font-size:12px">${costTxt}</div></div>
       <div><div class="k">Bezpečnost</div><div class="v ${c.safety >= 4 ? 'safe-ok' : c.safety >= 3 ? 'safe-mid' : 'safe-bad'}">${safeTxt}</div></div>
       <div><div class="k">Měna</div><div class="v" style="font-size:15px">${c.cur || '—'}</div><div class="faint" id="fxLine" style="font-size:12px"></div></div>
     </div>
     ${iso !== 'CZ' && window.Entry ? `<div id="entryBox">${Entry.ready() ? Entry.detailHtml(iso) : `<div class="faint" style="font-size:12.5px;margin-top:12px">🛂 Načítám vstupní podmínky… (jinak je najdeš na <a href="${mzv}" target="_blank" rel="noopener">webu MZV ČR</a>)</div>`}</div>` : ''}
     <div style="margin-top:14px"><div class="k" style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.04em">Nejlepší období${c.months ? '' : ' — orientačně'}</div>${monthsStrip(c.months)}</div>
     <div id="climBox" style="margin-top:12px" title="Dlouhodobý průměr – není to předpověď"><div class="k clim-k">Průměrná denní maxima <span id="climWhere" class="faint"></span></div>${climStrip(null)}</div>
     ${c.tags ? `<div class="tags" style="margin-top:16px">${c.tags.map(t => `<span class="chip accent">${t}</span>`).join('')}</div>` : ''}
     <div class="note info" style="margin-top:16px">${ico('M12 16v-4M12 8h.01M12 2a10 10 0 100 20 10 10 0 000-20z')}<div>Bezpečnostní a geopolitická situace se mění. Před cestou si vždy ověř aktuální doporučení na <a href="${mzv}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">MZV ČR</a>.</div></div>
   </div>`);
  // tlačítka okna (data-cm) – obsluha tady, ne atributem onclick v HTML (CSP)
  const cmActs = { search: () => { modalClose(); fromCountrySearch(iso); }, explore: () => { modalClose(); withMod('places', () => Places.openCountryView(iso)); }, stay: () => stayLinks(iso), plan: () => addToPlan(iso), vis: () => toggleVis(iso) };
  $$('#modal [data-cm]').forEach(b => { b.onclick = () => cmActs[b.dataset.cm](); });
  Photos.paint($('#modal')); // fotka hlavního města v hlavičce
  loadWeather(c);
  loadFx(c);
  loadClimate(iso);
  // data ještě nedorazila (nebo se načtení nepovedlo – zkusit znovu)
  if (window.Entry && !Entry.ready()) { Entry.whenReady(() => { const b = $('#entryBox'); if (b && curIso === iso) b.innerHTML = Entry.detailHtml(iso); }); Entry.load().catch(() => { }); }
}
window.modalClose = modalClose;
window.toggleVis = iso => { const on = !visited.has(iso); setVisited(iso, on); const b = $('#visBtn'); if (b) { b.textContent = on ? '✓ Navštíveno' : 'Byl/a jsem tu'; b.className = 'btn ' + (on ? 'warm' : 'ghost'); } toast(on ? 'Přidáno: ' + byIso[iso].cs : 'Odebráno: ' + byIso[iso].cs); renderCountries(); if (activeView === 'dashboard') renderDashStats(); };
window.fromCountrySearch = iso => { if (window.Flights) Flights.searchTo([{ id: 'cc:' + iso, label: byIso[iso].cs, flag: flag(iso) }]); };
// Ubytování z karty země: hlavní město i se zemí (samotné „San José“ nebo „Victoria“ najde Booking i jinde)
window.stayLinks = iso => {
  const c = byIso[iso];
  if (c) openStay(c.cap ? `${c.cap}, ${c.en}` : c.cs, '', '', 2, { label: c.capCs || c.cap || c.cs, hw: hwCityPage(c, c.cap) });
};
window.addToPlan = iso => { newTrip(byIso[iso]); };

/* weather + fx (LIVE z Open-Meteo / ER-API přímo z prohlížeče) */
// Počasí a kurz v okně země: bez odpovědi do 8 s chyba (jinak „Načítám počasí…“ visí, když open-meteo neodpovídá)
const wxSignal = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined);
async function geocode(c) {
  if (S.geo[c.iso2]) return S.geo[c.iso2];
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(c.cap || c.en)}&count=1&language=cs&format=json`, { signal: wxSignal() }); const j = await r.json();
    if (j.results && j.results[0]) { const g = { lat: j.results[0].latitude, lon: j.results[0].longitude }; S.geo[c.iso2] = g; save(); return g; }
  } catch (e) { }
  return null;
}
async function loadWeather(c) {
  const cache = S.weather[c.iso2];
  if (cache && Date.now() - cache.ts < 3600000) { return paintWeather(cache.data); }
  // odpověď kreslit jen do okna téže země – mezitím mohla být otevřená jiná (nebo okno zavřené)
  const box = () => (curIso === c.iso2 ? $('#wxBox') : null);
  const g = await geocode(c); if (!g) { if (box()) box().innerHTML = '<div class="wico">🌐</div><div class="muted" style="font-size:13px">Počasí se teď nepodařilo načíst.<br>Zkontroluj připojení a dej Aktualizovat.</div>'; return; }
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`, { signal: wxSignal() });
    const j = await r.json(); if (!j || !j.current || !j.daily) throw new Error('bez počasí');
    S.weather[c.iso2] = { ts: Date.now(), data: j }; save(); if (box()) paintWeather(j);
  } catch (e) { if (box()) box().innerHTML = '<div class="wico">🌐</div><div class="muted" style="font-size:13px">Počasí se teď nepodařilo načíst.</div>'; }
}
function paintWeather(j) {
  if (!$('#wxBox') || !j || !j.current) return;
  const cur = j.current, [ci, ct] = wIco(cur.weather_code);
  $('#wxBox').innerHTML = `<div class="wico">${ci}</div><div style="flex:1"><div class="muted" style="font-size:12px">Teď v hlavním městě · ${ct}</div><div class="temp">${Math.round(cur.temperature_2m)}°</div><div class="faint" style="font-size:12px">💨 ${Math.round(cur.wind_speed_10m)} km/h · 💧 ${cur.relative_humidity_2m ?? '–'} %</div></div>`;
  const d = j.daily; const days = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  // den v týdnu z data samotného: new Date('2026-10-25') je půlnoc UTC – v telefonu s časem New Yorku ještě sobota
  $('#fcBox').innerHTML = d.time.map((t, i) => { const dt = new Date(t + 'T12:00:00Z'); const [ic] = wIco(d.weather_code[i]); return `<div class="fc"><div class="d">${i === 0 ? 'Dnes' : days[dt.getUTCDay()]}</div><div class="i">${ic}</div><div class="t">${Math.round(d.temperature_2m_max[i])}°<small> ${Math.round(d.temperature_2m_min[i])}°</small></div></div>`; }).join('');
}
async function loadFx(c) {
  if (!c.cur || c.cur === 'CZK') { const el = $('#fxLine'); if (el) el.textContent = c.cur === 'CZK' ? 'domácí měna' : ''; return; }
  if (!S.fx || Date.now() - S.fx.ts > 86400000) { try { const r = await fetch('https://open.er-api.com/v6/latest/CZK', { signal: wxSignal() }); const j = await r.json(); if (j && j.rates) { S.fx = { ts: Date.now(), rates: j.rates }; save(); } } catch (e) { } }
  const el = $('#fxLine'); if (!el || curIso !== c.iso2) return; // mezitím otevřená jiná země
  if (S.fx && S.fx.rates[c.cur]) { const v = 1 / S.fx.rates[c.cur], dp = v < 1 ? 3 : 2; el.textContent = `1 ${c.cur} ≈ ${v.toLocaleString('cs-CZ', { minimumFractionDigits: dp, maximumFractionDigits: dp })} Kč`; }
}
function provLink(name, sub, url, color, lab) { return `<a class="result-link" href="${url}" target="_blank" rel="noopener"><div class="lg" style="background:${color}">${lab}</div><div><div class="rl-t">${name}</div><div class="rl-s">${sub}</div></div><div class="go">${ico('M5 12h14M13 6l6 6-6 6')}</div></a>`; }

/* ================= MAP (D3) ================= */
let mapInited = false, mapSel = null, mapZoom = null, WORLD = null;
// d3 + topojson (~100 kB) až pro mapu světa a mapu výsledků – ne při každém otevření aplikace
let d3Load = null;
function loadD3() {
  if (typeof d3 !== 'undefined' && typeof topojson !== 'undefined') return Promise.resolve();
  const add = src => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('nenačteno: ' + src)); document.head.append(s); });
  return d3Load || (d3Load = add('vendor/d3.min.js').then(() => add('vendor/topojson-client.min.js')).catch(e => { d3Load = null; throw e; }));
}
window.loadD3 = loadD3;
async function loadWorld() {
  if (WORLD) return WORLD;
  WORLD = await (await fetch('vendor/countries-110m.json')).json();
  return WORLD;
}
function isoOf(d) { return (byM49[String(d.id).padStart(3, '0')] || byEn[norm(d.properties && d.properties.name)] || {}).iso2 || null; }
function paintMap() { if (mapSel) mapSel.classed('visited', function () { return this.dataset.iso && visited.has(this.dataset.iso); }); }
async function initMap() {
  refreshStats();
  if (mapInited) return; mapInited = true;
  try { await loadD3(); } catch (e) { return mapFallback('Mapové knihovny se nenačetly.'); }
  try {
    const world = await loadWorld();
    const feats = topojson.feature(world, world.objects.countries).features;
    const svg = d3.select('#worldmap'), W = 960, H = 500;
    const proj = d3.geoNaturalEarth1().fitSize([W, H], { type: 'FeatureCollection', features: feats });
    const path = d3.geoPath(proj), g = svg.append('g');
    mapSel = g.selectAll('path').data(feats).join('path').attr('d', path).attr('class', 'map-path')
      .each(function (d) { const iso = isoOf(d); if (iso) this.dataset.iso = iso; })
      .on('mousemove', (e, d) => { const iso = isoOf(d), nm = iso && byIso[iso] ? byIso[iso].cs : (d.properties.name || ''); const tip = $('#mapTip'); tip.textContent = (iso ? flag(iso) + ' ' : '') + nm; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.style.opacity = 1; })
      .on('mouseleave', () => $('#mapTip').style.opacity = 0)
      .on('click', (e, d) => { const iso = isoOf(d); if (!iso) return toast('Tato oblast není v seznamu'); mapPopover(e, iso); });
    mapZoom = d3.zoom().scaleExtent([1, 8]).on('zoom', ev => g.attr('transform', ev.transform));
    svg.call(mapZoom);
    $('#zoomIn').onclick = () => svg.transition().call(mapZoom.scaleBy, 1.6);
    $('#zoomOut').onclick = () => svg.transition().call(mapZoom.scaleBy, .6);
    $('#zoomReset').onclick = () => svg.transition().call(mapZoom.transform, d3.zoomIdentity);
    paintMap();
  } catch (e) { mapFallback('Mapu se teď nepodařilo načíst.'); }
}
function mapPopover(e, iso) {
  const c = byIso[iso], isV = visited.has(iso), p = $('#mapPop');
  p.innerHTML = `<div class="row" style="gap:10px"><div style="font-size:30px">${flag(iso)}</div><div><div style="font-weight:800">${c.cs}</div><div class="faint" style="font-size:12px">${c.cont}</div></div></div><div class="row" style="margin-top:12px;gap:8px"><button class="btn sm ${isV ? 'warm' : 'primary'}" style="flex:1" id="popVis">${isV ? '✓ Byl/a jsem' : 'Byl/a jsem tu'}</button><button class="btn sm ghost" id="popDet">Detail</button></div>`;
  // bublina (230 px) na střed kliknutí – nevyjet z obrazovky ani vlevo (USA, Mexiko na telefonu)
  p.style.left = Math.max(125, Math.min(e.clientX, innerWidth - 130)) + 'px'; p.style.top = Math.min(e.clientY, innerHeight - 120) + 'px'; p.classList.add('show');
  $('#popVis').onclick = () => { setVisited(iso, !visited.has(iso)); p.classList.remove('show'); toast(visited.has(iso) ? 'Přidáno: ' + c.cs : 'Odebráno: ' + c.cs); };
  $('#popDet').onclick = () => { p.classList.remove('show'); openCountry(iso); };
}
document.addEventListener('click', e => { const p = $('#mapPop'); if (p.classList.contains('show') && !p.contains(e.target) && !e.target.closest('.map-path')) p.classList.remove('show'); });
function mapFallback(msg) {
  const wrap = $('#mapWrap'); wrap.style.minHeight = 'auto';
  wrap.innerHTML = `<div style="padding:18px"><div class="note info" style="margin-bottom:14px">${ico('M12 16v-4M12 8h.01M12 2a10 10 0 100 20 10 10 0 000-20z')}<div>${msg} Země můžeš odškrtávat i tady v seznamu.</div></div><div id="fbList"></div></div>`;
  $('#fbList').innerHTML = CONTS.map(ct => `<div style="margin-bottom:16px"><div style="font-weight:800;margin:6px 0 8px">${ct} <span class="faint" style="font-weight:600">(${CONT_TOT[ct]})</span></div><div class="row wrap" style="gap:6px">${COUNTRIES.filter(c => c.cont === ct).map(c => `<span class="pill ${visited.has(c.iso2) ? 'on' : ''}" data-fbiso="${c.iso2}">${flag(c.iso2)} ${c.cs}</span>`).join('')}</div></div>`).join('');
  $$('[data-fbiso]').forEach(p => p.onclick = () => { const iso = p.dataset.fbiso; setVisited(iso, !visited.has(iso)); p.classList.toggle('on'); });
}

/* ================= PLANNER ================= */
function dateRange(a, b) { if (!a) return []; const out = []; let d = new Date(a), end = b ? new Date(b) : new Date(a); let n = 0; while (d <= end && n < 367) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); n++; } return out; }
function resolveCountry(text) { const t = norm(text); if (!t) return null; let c = COUNTRIES.find(c => norm(c.cs) === t || norm(c.en) === t); if (!c) c = COUNTRIES.find(c => norm(c.cs).startsWith(t) && t.length > 2); return c || null; }
// Doprava uložená z průvodce cestou: let (✈️), nebo vlak/bus (text začíná 🚆).
const planIco = f => /^🚆/u.test(String(f || '')) ? '🚆' : '✈️';
const planTransport = f => /^🚆/u.test(String(f || '')) ? String(f) : '✈️ ' + f;
// Lety v detailu plánu: cesta přes víc měst („1. PRG→FCO 11.11. 16:35 (…), 2. …“) po řádcích, ať se dá přečíst
const planFlightHtml = f => String(f || '').replace(/^🚆\s*/u, '').split(/, (?=\d+\. )| · (?=samostatné letenky$)/u).map(esc).join('<br>');
// 💾 Přenos a záloha (backup.js) nad plánovačem
const bkTools = () => (window.Backup ? Backup.plannerTools() : '');
const bkWire = () => { const b = $('#bkOpen'); if (b) b.onclick = () => Backup.open(); };
function renderPlanner() {
  const host = $('#plannerList');
  // ✈️ z posledního hledání: nejlevnější nabídka (cíl, dny, cestující, rozpočet a let) rovnou do formuláře nové cesty
  let pick = window.Flights && Flights.lastPick ? Flights.lastPick() : null;
  if (pick && S.trips.some(t => t.dest === pick.dest && t.start === pick.start)) pick = null; // z téhle nabídky už cesta je
  const fromPick = () => newTrip(null, { dest: pick.dest, iso: pick.iso, start: pick.start, end: pick.end, pax: pick.pax, budget: pick.budget, budgetNote: pick.budgetNote, flight: pick.flight });
  const pickTxt = pick ? `${esc(pick.dest)} · ${fmtDate(pick.start)}${pick.end ? '–' + fmtDate(pick.end) : ''} · ${pick.czk.toLocaleString('cs')} Kč/os.` : '';
  if (!S.trips.length) {
    host.innerHTML = `${bkTools()}<div class="plan-empty"><div class="card dest plan-hero" data-photo="${esc(window.heroPlace ? heroPlace(3) : 'Santorini')}" style="--h:200"><div class="flag">📅</div><div class="dest-panel"><div class="cname">Zatím žádná cesta</div>
      <div class="cblurb">Program, ubytování, rozpočet i balení na jednom místě – nebo ji ulož z nalezeného letu.</div></div></div>
      ${pick ? `<div class="plan-last"><span class="faint">✈️ Poslední hledání</span><b>${pickTxt}</b></div>` : ''}
      <div class="plan-empty-act">${pick ? `<button class="btn primary" id="emptyLast">✈️ Vytvořit cestu z posledního hledání</button><button class="btn" id="emptyNew">${ico('M12 5v14M5 12h14')} Prázdná cesta</button>`
        : `<button class="btn primary" id="emptyNew">${ico('M12 5v14M5 12h14')} Nová cesta</button><button class="btn" id="emptyFind">✈️ Nejdřív najít let</button>`}</div></div>`;
    Photos.paint(host);
    $('#emptyNew').onclick = () => newTrip();
    if (pick) $('#emptyLast').onclick = fromPick; else $('#emptyFind').onclick = () => go('flights');
    bkWire(); return;
  }
  // nadcházející podle data odjezdu (bez data na konci), proběhlé zvlášť pod nimi
  const now = todayLocal(), all = S.trips.map((t, i) => ({ t, i }));
  const past = all.filter(x => (x.t.end || x.t.start) && (x.t.end || x.t.start) < now).sort((a, b) => (b.t.start || '').localeCompare(a.t.start || ''));
  const coming = all.filter(x => !past.includes(x)).sort((a, b) => (a.t.start || '9999').localeCompare(b.t.start || '9999'));
  host.innerHTML = `${bkTools()}<div class="trip-grid">${coming.map(x => tripCard(x.t, x.i)).join('')}<div class="card new-trip" id="newTripTile"><div class="plus">${ico('M12 5v14M5 12h14')}</div><div style="font-weight:700">Nová cesta</div></div>${pick ? `<div class="card new-trip" id="lastTripTile"><div class="plus">✈️</div><div style="font-weight:700">Z posledního hledání</div><div class="faint" style="font-size:12.5px;margin-top:2px">${pickTxt}</div></div>` : ''}</div>${past.length ? `<div class="section-head"><h2>Proběhlé cesty</h2></div><div class="trip-grid past">${past.map(x => tripCard(x.t, x.i)).join('')}</div>` : ''}`;
  $$('.trip[data-ti]').forEach(el => { el.onclick = () => openTrip(+el.dataset.ti); kbClick(el); });
  $('#newTripTile').onclick = () => newTrip(); kbClick($('#newTripTile'));
  Photos.paint(host);
  if (pick) { $('#lastTripTile').onclick = fromPick; kbClick($('#lastTripTile')); }
  bkWire();
}
// kdy cesta je: „za 12 dní“, „právě probíhá“, „proběhla“ (bez data nic)
function tripWhen(t) {
  if (!t.start) return '';
  const now = todayLocal(), d = daysTo(now, t.start);
  if ((t.end || t.start) < now) return 'proběhla';
  return d <= 0 ? 'právě probíhá' : inDays(d);
}
// název z průvodce je „Barcelona 10.11.“ – datum je hned pod ním, na kartě stačí „Barcelona“
const tripTitle = t => (t.start && t.name && t.name.endsWith(' ' + fmtDate(t.start)) && t.name.length > fmtDate(t.start).length + 1 ? t.name.slice(0, -fmtDate(t.start).length - 1) : t.name);
function tripCard(t, i) {
  const c = t.iso ? byIso[t.iso] : null, warm = c && c.cost >= 4, na = t.days ? Object.values(t.days).flat().length : 0;
  const photo = t.place?.label || (t.dest && t.dest !== '—' ? String(t.dest).split(',')[0] : '') || c?.cs || '', when = tripWhen(t);
  return `<div class="card trip" data-ti="${i}"><div class="trip-top ${warm ? 'warm' : ''}"${photo ? ` data-photo="${esc(photo)}" style="--h:${ccHue(t.iso || photo)}"` : ''}>${when ? `<span class="tt-when">${when}</span>` : ''}<div class="tt-name">${esc(tripTitle(t))}</div><div class="tt-meta">${c ? flag(t.iso) + ' ' : '📍 '}${esc(t.dest)}${t.start ? ' · ' + dateSpan(t.start, t.end) : ''}</div></div><div class="trip-body"><div class="bar"><span>👤 ${t.pax || 1} os.</span><span>${t.budget ? (+t.budget).toLocaleString('cs') + ' Kč' : 'rozpočet —'}</span></div>${t.flight ? `<div class="faint" style="font-size:12px;margin-bottom:4px">${esc(planTransport(t.flight))}</div>` : ''}<div class="muted" style="font-size:12.5px">${na} ${na === 1 ? 'aktivita' : na >= 2 && na <= 4 ? 'aktivity' : 'aktivit'} · ${(t.checklist || []).filter(x => x.done).length}/${(t.checklist || []).length} sbaleno</div></div></div>`;
}
function newTrip(c, pre = {}) {
  const dest = pre.dest || (c ? c.cs : '');
  modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button><div class="modal-hero-inner"><h2 style="font-size:24px">Nová cesta</h2><div style="opacity:.85;font-size:13px">Vyplň základ, detaily doladíš potom</div></div></div>
  <div class="modal-body">
    <div class="field"><label>Název cesty</label><input class="input" id="ntName" placeholder="Např. Léto v Portugalsku" value="${esc(pre.name || (dest ? 'Cesta: ' + dest : ''))}"></div>
    <div class="field" style="margin-top:12px"><label>Destinace</label><input class="input" id="ntDest" placeholder="Země nebo město" value="${esc(dest)}"></div>
    <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px"><div class="field"><label>Odjezd</label><input class="input" type="date" id="ntStart" value="${pre.start || ''}"></div><div class="field"><label>Návrat</label><input class="input" type="date" id="ntEnd" value="${pre.end || ''}" min="${pre.start || ''}"></div></div>
    <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px"><div class="field"><label>Cestující</label><select id="ntPax">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<option ${n === (pre.pax || 2) ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="field"><label>Rozpočet (Kč)</label><input class="input" type="number" id="ntBudget" placeholder="nepovinné" value="${pre.budget || ''}">${pre.budget && pre.budgetNote ? `<small class="faint" style="display:block;font-size:11.5px;margin-top:4px">${esc(pre.budgetNote)}</small>` : ''}</div></div>
    <button class="btn primary block" style="margin-top:18px" id="ntSave">Vytvořit cestu</button>
  </div>`);
  $('#ntStart').onchange = e => { $('#ntEnd').min = e.target.value; };
  $('#ntSave').onclick = () => saveTrip(c ? c.iso2 : (pre.iso || null), pre.flight || null);
}
async function saveTrip(iso, flightTxt) {
  // vše z formuláře hned – během dohledávání místa může uživatel okno zavřít nebo otevřít jiné
  const b = $('#ntSave');
  const f = { name: $('#ntName').value.trim() || 'Moje cesta', dest: $('#ntDest').value.trim(), start: $('#ntStart').value, end: $('#ntEnd').value, pax: $('#ntPax').value, budget: $('#ntBudget').value };
  if (f.start && f.end && f.end < f.start) { toast('Návrat je před odjezdem', 'err'); return; } // termín pak nejde upravit
  // země jen při přesném názvu („Itálie“); začátek názvu („Kos“ → Kosovo) až když místo toho jména neexistuje
  let fiso = iso, place = null; if (!fiso && f.dest) { const t = norm(f.dest), c = COUNTRIES.find(c => norm(c.cs) === t || norm(c.en) === t); if (c) fiso = c.iso2; }
  // město („Lisabon“): země a cíl pro „Hledat lety“ z našeptávače míst – jen přesná shoda názvu. Metropole (Londýn,
  // Barcelona) vyhrává nad stejnojmennými letišti jinde; jinak velká letiště, a jen když všechna leží v jedné zemi
  // (Birmingham je v Anglii i v USA → nic nehádat); nejvýš 4 s čekání
  if (!fiso && f.dest) {
    if (b) { b.disabled = true; b.textContent = 'Hledám místo…'; }
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 4000);
    try {
      const j = await (await fetch(`api/places?q=${enc(f.dest)}`, { signal: ctl.signal })).json();
      const x = SearchHelp.placeGuess(j.items, f.dest);
      if (x) {
        fiso = byIso[x.cc] ? x.cc : null;
        if (/^(ap|metro):/.test(x.id)) place = { id: x.id, label: x.label, flag: x.flag || '' };
      } else {
        // „USA“, „Anglie“, „Holandsko“: našeptávač dá zemi na první místo (u „Kos“ je první ostrov, ne Kosovo)
        const top = (j.items || [])[0];
        if (top && !top.fuzzy && /^cc:[A-Z]{2}$/.test(top.id) && byIso[top.cc]) fiso = top.cc; // ne oprava překlepu
      }
    } catch (e) { /* bez sítě nebo pomalý server: cesta bez země */ } finally { clearTimeout(tm); }
    if (!fiso && !place) { const c = resolveCountry(f.dest); if (c) fiso = c.iso2; }
  }
  const trip = { name: f.name, dest: f.dest || '—', iso: fiso || null, ...(place ? { place } : {}), start: f.start, end: f.end, pax: f.pax, budget: f.budget, flight: flightTxt, days: {}, checklist: PACK.map(t => ({ t, done: false })), notes: '' };
  S.trips.push(trip);
  save();
  // okno mezitím zavřené nebo nahrazené jiným: uložit potichu, nic nezavírat ani neotevírat
  if (b && !(b.isConnected && $('#modalBg').classList.contains('show'))) { toast('Cesta vytvořena'); renderPlanner(); return; }
  // právě uložená cesta (jiné uložení z dřívějšího okna mohlo mezitím přidat další)
  modalClose(); go('planner'); toast('Cesta vytvořena'); setTimeout(() => { const i = S.trips.indexOf(trip); if (i >= 0) openTrip(i); }, 250);
}
/** „Hledat lety“ u cesty v plánovači: do jejího města (nebo země) v termínu cesty, je-li ještě před ní. */
window.planSearch = i => {
  const t = S.trips[i]; if (!t || !window.Flights) return go('flights');
  // cesta přes víc měst letadlem (z průvodce): stejná trasa znovu, ne zpáteční let do prvního města
  const wf = t.wizard && t.wizard.flight;
  if (wf && wf.out && Array.isArray(wf.mid) && wf.mid.length && Flights.searchLegs) {
    return Flights.searchLegs([wf.out, ...wf.mid, ...(wf.back ? [wf.back] : [])], ((t.wizard.route && t.wizard.route.bases) || []).map(b => b.name));
  }
  const wd = t.wizard && t.wizard.dest, p = t.place || (wd && { id: wd.id, label: wd.label, flag: wd.cc ? flag(wd.cc) : '' });
  const to = p && /^(ap|metro):[A-Z]{3}$/.test(p.id || '') ? [{ id: p.id, label: String(p.label || ''), flag: p.flag || (t.iso ? flag(t.iso) : '') }]
    : t.iso && byIso[t.iso] ? [{ id: 'cc:' + t.iso, label: byIso[t.iso].cs, flag: flag(t.iso) }] : null;
  if (!to) return go('flights');
  Flights.searchTo(to, { xOut: t.start, xBack: t.end });
};
/** Po cestě: země, které ještě nejsou na mapě navštívených – jedním klikem je přidat. */
function tripNotVisited(t) {
  const end = t.end || t.start;
  if (!end || end >= todayLocal()) return [];
  return [...new Set([...(t.isos || []), t.iso].filter(cc => cc && byIso[cc] && !visited.has(cc)))];
}
function visitedPrompt(t) {
  const ccs = tripNotVisited(t);
  return ccs.length ? `<div class="note info" style="margin-top:10px">🗺️ <div>Cesta proběhla – <button type="button" class="linkbtn" id="tripVisited">přidat ${ccs.map(cc => esc(byIso[cc].cs)).join(', ')} na mapu navštívených</button></div></div>` : '';
}
// Cesta v okně (objekt): jiný panel může cesty mezitím posunout nebo smazat – index z vykreslení pak neplatí.
let tripShown = null;
const tripIdx = i => (tripShown && S.trips[i] !== tripShown ? S.trips.indexOf(tripShown) : i);
// „19. 10.“ u jednodenního výletu, jinak „19. 10.–21. 10.“ (sep mezi daty)
const dateSpan = (a, b, sep = '–') => (a ? fmtDate(a) + (b && b !== a ? sep + fmtDate(b) : '') : '');
function openTrip(i) {
  const t = S.trips[i]; if (!t) return; tripShown = t; const c = t.iso ? byIso[t.iso] : null; const city = c && c.cap ? c.cap : t.dest;
  const local = localTrip(t) && !t.flight && !t.wizard;
  // výlet z Objevuj uložený dřív s cestovním seznamem (pas, adaptér…), nic neodškrtnuté → seznam na den venku
  if (local && Array.isArray(t.checklist) && t.checklist.length === PACK.length && t.checklist.every((x, k) => x && x.t === PACK[k] && !x.done)) { t.checklist = packFor(t.src).map(x => ({ t: x, done: false })); save(); }
  const days = dateRange(t.start, t.end);
  modalOpen(`<div class="modal-hero"><div class="mh-bg ${c && c.cost >= 4 ? 'warm' : ''}"></div><button class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button><div class="modal-hero-inner"><div style="font-size:40px;line-height:1">${c ? flag(t.iso) : '🧳'}</div><h2 style="font-size:25px;margin-top:4px;overflow-wrap:anywhere">${esc(t.name)}</h2><div style="opacity:.85;font-size:13px">${esc(t.dest)}${t.start ? ' · ' + dateSpan(t.start, t.end, ' – ') : ''} · ${t.pax} os.</div></div></div>
  <div class="modal-body">
    ${t.flight ? `<div class="note info" style="margin-bottom:14px">${planIco(t.flight)} <div>${planFlightHtml(t.flight)}</div></div>` : ''}
    <div class="row wrap">${local ? '' : `<button class="btn primary" id="tripSearch">${ico('M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z')} Hledat lety</button><button class="btn" id="tripStay">${ico('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z')} Ubytování</button>`}${t.wizard && (window.Trip || window.Lazy) ? '<button class="btn" id="tripWizard">🧳 Otevřít v průvodci</button>' : ''}${c ? '<button class="btn ghost" id="tripCountry">Info o zemi</button>' : ''}</div>
    ${tripEntryHtml(t)}${visitedPrompt(t)}
    <div class="row wrap" style="gap:8px;margin-top:10px">${days.length ? '<button class="btn sm" id="tripIcs">📅 Do kalendáře (.ics)</button>' : ''}<button class="btn sm" id="tripShare">🔗 Sdílet plán</button>${days.length ? `<a class="btn sm ghost" id="tripGcal" href="${esc(safeUrl(Ics.gcalUrl(planEvents(t)[0])))}" target="_blank" rel="noopener">Přidat do Google Kalendáře ↗</a>` : ''}</div>
    <div class="divider"></div>
    <div class="row" style="justify-content:space-between"><h3 style="font-size:16px">🗺️ Itinerář</h3><span class="faint" style="font-size:12px">${days.length ? days.length + (days.length === 1 ? ' den' : days.length < 5 ? ' dny' : ' dní') : 'doplň termíny'}</span></div>
    <div style="margin-top:10px">${days.length ? days.map((d, di) => { const acts = t.days[d] || []; return `<div class="day-block" data-day="${d}"><h4>Den ${di + 1} <span class="faint" style="font-weight:600">· ${fmtDate(d)}</span></h4>${acts.map((a, ai) => `<div class="act"><span>${esc(a)}</span><button data-delact="${ai}" aria-label="Smazat aktivitu">${ico('M18 6L6 18M6 6l12 12')}</button></div>`).join('')}<div class="row" style="gap:8px;margin-top:8px"><input class="input" id="act-${i}-${d}" data-addact placeholder="Přidej aktivitu…"><button class="btn sm" data-addact>Přidat</button></div></div>`; }).join('') : `<div class="note info">${ico('M12 16v-4M12 8h.01M12 2a10 10 0 100 20 10 10 0 000-20z')}<div>Doplň termíny cesty a objeví se itinerář den po dni.</div></div>`}</div>
    ${refsHtml(t, i)}
    <div class="divider"></div>
    <div class="grid trip-two">
      <div><h3 style="font-size:16px;margin-bottom:10px">🧾 Sbaleno</h3><div id="checkList">${(t.checklist || []).map((x, xi) => `<label class="check"><input type="checkbox" ${x.done ? 'checked' : ''} data-check="${xi}"><span style="${x.done ? 'opacity:.5;text-decoration:line-through' : ''}">${esc(x.t)}</span></label>`).join('')}</div><div class="row" style="gap:8px;margin-top:10px"><input class="input" id="newCheck-${i}" data-addcheck placeholder="Přidej položku…"><button class="btn sm" data-addcheck aria-label="Přidat položku">+</button></div></div>
      <div><h3 style="font-size:16px;margin-bottom:10px">💰 Rozpočet</h3><div class="field"><label>Celkový rozpočet (Kč)</label><input class="input" type="number" id="bud-${i}" value="${esc(t.budget || '')}"></div>${t.budget ? `<div class="muted" style="font-size:13px;margin-top:10px">Na osobu: <b style="color:var(--text)">${Math.round(t.budget / (t.pax || 1)).toLocaleString('cs')} Kč</b></div>` : ''}<div class="field" style="margin-top:14px"><label>Poznámky</label><textarea id="notes-${i}" rows="3" placeholder="Cokoliv k cestě…">${esc(t.notes || '')}</textarea></div></div>
    </div>
    <div class="divider"></div>
    <button class="btn ghost block" style="color:var(--bad);border-color:rgba(251,113,133,.3)" id="tripDel">Smazat cestu</button>
  </div>`);
  // ubytování v cíli cesty (Barcelona, ne hlavní město země) pro počet cestujících z cesty
  // ubytování v zadaném městě; země („Itálie“) nebo víc míst („Lisabon, Porto“) → hlavní město
  const oneCity = t.dest && t.dest !== '—' && !/[,;+&/→]|\s(a|–|-)\s/.test(t.dest) && !resolveCountry(t.dest);
  // ovládání okna – obsluhy tady, ne atributy onclick / onkeydown v HTML (CSP stránky je nepustí)
  const m = $('#modal'), enter = fn => e => { if (e.key === 'Enter' && !e.isComposing) fn(); };
  const tsr = $('#tripSearch'); if (tsr) tsr.onclick = () => { modalClose(); planSearch(i); };
  const tco = $('#tripCountry'); if (tco) tco.onclick = () => { modalClose(); openCountry(t.iso); };
  $$('.day-block[data-day]', m).forEach(b => {
    const d = b.dataset.day;
    $$('[data-delact]', b).forEach(x => { x.onclick = () => delAct(i, d, +x.dataset.delact); });
    $$('input[data-addact]', b).forEach(x => { x.onkeydown = enter(() => addAct(i, d)); });
    $$('button[data-addact]', b).forEach(x => { x.onclick = () => addAct(i, d); });
  });
  $$('[data-check]', m).forEach(x => { x.onchange = () => toggleCheck(i, +x.dataset.check); });
  $$('input[data-addcheck]', m).forEach(x => { x.onkeydown = enter(() => addCheck(i)); });
  $$('button[data-addcheck]', m).forEach(x => { x.onclick = () => addCheck(i); });
  $('#bud-' + i).onchange = e => setBudget(i, e.target.value);
  const notes = $('#notes-' + i);
  notes.addEventListener('input', () => setNotesSoon(i, notes.value));
  notes.addEventListener('change', () => setNotes(i, notes.value));
  $$('[data-refk]', m).forEach(x => { x.onkeydown = e => refKey(e, i, +x.dataset.refk); });
  $$('[data-delref]', m).forEach(x => { x.onclick = () => delRef(i, +x.dataset.delref); });
  $$('[data-addref]', m).forEach(x => { x.onclick = () => addRef(i); });
  $('#tripDel').onclick = () => delTrip(i);
  // termíny míst trasy počítá průvodce (routeStays – Trip.baseDates): klepnutí před jeho dostažením na něj počká
  const ts = $('#tripStay'); if (ts) ts.onclick = () => withMod('trip', () => routeStays(t) || openStay(oneCity ? t.dest : city, t.start || '', t.end || '', +t.pax || 2));
  const tw = $('#tripWizard'); if (tw) tw.onclick = () => { modalClose(); withMod('trip', () => Trip.openSaved(t.wizard, t.tripId)); };
  const tv = $('#tripVisited');
  if (tv) tv.onclick = () => { const ccs = tripNotVisited(t); ccs.forEach(cc => setVisited(cc, true)); toast(`Na mapě navštívených: ${ccs.map(cc => byIso[cc].cs).join(', ')}`); openTrip(i); };
  const ics = $('#tripIcs'); if (ics) ics.onclick = () => exportPlan(i);
  // Poznámky se ukládají bez překreslení – odkaz do Google Kalendáře je musí mít aktuální.
  const gcal = $('#tripGcal'); if (gcal) $('#notes-' + i).addEventListener('change', () => { gcal.href = safeUrl(Ics.gcalUrl(planEvents(t)[0])); });
  $('#tripShare').onclick = () => sharePlan(i);
  ShareLink.prepare('plan', PlanShare.json(t)); // kliknutí pak jen zkopíruje hotový odkaz (Safari)
}

/** 🔖 Rezervace v okně cesty: kódy letenek, potvrzení ubytování… (nejvýš 6) – jen v tomto zařízení a v záloze (backup.js
 *  je i čistí), do odkazů ani kalendáře nejdou; na kartě „📍 Dnes na cestě“ s tlačítkem Kopírovat. */
function refsHtml(t, i) {
  if (!window.Backup) return '';
  // Enter (na telefonu „Další“ / „Hotovo“): z „Co“ a z prázdného „Kódu“ na další pole, uloží až kód nebo poslední pole
  const refs = Backup.cleanRefs(t.refs), L = Backup.REF_LEN, enter = k => `enterkeyhint="${k ? 'done' : 'next'}" data-refk="${k}"`;
  return `<div class="divider"></div>
    <div class="row wrap" style="justify-content:space-between;gap:4px 10px"><h3 style="font-size:16px">🔖 Rezervace</h3><span class="faint" style="font-size:12px">kódy zůstanou jen v tomto zařízení a v záloze, do odkazů nejdou</span></div>
    <div style="margin-top:10px">${refs.map((r, k) => `<div class="act ref-row"><span>${r.co ? `<b>${esc(r.co)}</b> ` : ''}${r.kod ? `<code class="ref-kod">${esc(r.kod)}</code>` : ''}${r.pozn ? ` <span class="faint">${esc(r.pozn)}</span>` : ''}</span><button type="button" data-delref="${k}" title="Smazat" aria-label="Smazat rezervaci ${esc(r.kod || r.co)}">${ico('M18 6L6 18M6 6l12 12')}</button></div>`).join('')}
    ${refs.length < Backup.REFS_MAX ? `<div class="ref-add"><input class="input" id="refCo-${i}" maxlength="${L.co}" placeholder="Co (let tam, hotel…)" aria-label="Co je to za rezervaci" ${enter(0)}><input class="input ref-kod-in" id="refKod-${i}" maxlength="${L.kod}" placeholder="Kód (PNR)" aria-label="Kód rezervace" autocomplete="off" autocapitalize="characters" spellcheck="false" ${enter(1)}><input class="input" id="refNote-${i}" maxlength="${L.pozn}" placeholder="Poznámka (nepovinná)" aria-label="Poznámka k rezervaci" ${enter(2)}><button type="button" class="btn sm" data-addref>Přidat</button></div>` : ''}</div>`;
}

/* vstupní podmínky cesty z plánovače: země z kódu (iso, u cesty přes víc zemí isos; via = přestupy s registrací) – nic dalšího se neukládá */
const tripIsos = t => (Array.isArray(t.isos) && t.isos.length ? t.isos : t.iso ? [t.iso] : []);
const tripVia = t => (Array.isArray(t.via) ? t.via : []);
const tripEntryHtml = t => (window.Entry && Entry.ready() ? `<div style="margin-top:14px">${Entry.checklistHtml(tripIsos(t), { ret: t.end || t.start || null, pax: +t.pax || 1, via: tripVia(t) })}</div>` : '');

/* kalendář (.ics) a sdílení plánu odkazem #plan=… */
function planEvents(t) {
  const days = dateRange(t.start, t.end); if (!days.length) return [];
  const dest = t.dest && t.dest !== '—' ? t.dest : '';
  const info = [dest && 'Cíl: ' + dest, `Cestující: ${t.pax || 1}`, +t.budget ? 'Rozpočet: ' + czk(+t.budget) : '', t.flight ? planTransport(t.flight) : '', t.notes || ''].filter(Boolean).join('\n');
  const ev = [{ title: '🧳 ' + t.name, start: t.start, end: t.end || t.start, description: info, location: dest }];
  // Let (nebo vlak/bus) uložený z průvodce cestou má přesné časy a zóny; jinak jen text v den odjezdu.
  if (t.legs && t.legs.length) t.legs.forEach(l => ev.push(Ics.flightEvent(l, { note: t.name })));
  else if (t.ground && t.ground.length) t.ground.forEach(g => ev.push(Ics.groundEvent(g, { note: t.name })));
  else if (t.flight) ev.push({ title: `${planIco(t.flight)} ${/^🚆/u.test(t.flight) ? 'Cesta' : 'Let'} – ${dest || t.name}`, start: t.start, description: t.flight, location: dest });
  days.forEach((d, di) => { const acts = (t.days || {})[d] || []; if (acts.length) ev.push({ title: `Den ${di + 1} – ${dest || t.name}`, start: d, description: acts.map(a => '• ' + a).join('\n'), location: dest }); });
  // připomínka „🛂 Vyřídit ESTA (USA)“ před odletem, když země cesty chce registraci nebo vízum
  if (window.Entry) ev.push(...Entry.reminders(tripIsos(t), t.start, fmtYMD(new Date()), tripVia(t)));
  return ev;
}
function exportPlan(i) {
  const t = S.trips[i], ev = planEvents(t);
  if (!ev.length) return toast('Nejdřív doplň termíny cesty', 'err');
  icsDownload('atlas-' + t.name, ev, { name: t.name });
}
/** Stáhne .ics (i z průvodce cestou); do kalendáře se události dostanou až otevřením souboru. */
function icsDownload(filename, events, opts) {
  const n = Ics.download(filename, events, opts).split('\r\nBEGIN:VEVENT\r\n').length - 1;
  toast(`Soubor .ics stažen (${n} ${n === 1 ? 'událost' : n >= 2 && n <= 4 ? 'události' : 'událostí'}) – otevři ho v kalendáři`);
}
/** Odkaz na plán (zkomprimovaný – sharelink.js; připravený už při otevření plánu): na telefonu rovnou nabídka sdílení
 *  (WhatsApp, e-mail…), s myší do schránky (ShareLink.send), jinak k ručnímu zkopírování. */
function sharePlan(i) {
  const t = S.trips[i];
  return ShareLink.send('plan', PlanShare.json(t), { title: `🧳 ${t.name || 'Plán cesty'}`, text: `🧳 ${t.name || 'Plán cesty'} – plán cesty v ATLASu:` })
    .then(r => (r.shared || r.aborted ? null : r.copied ? toast('Odkaz na plán zkopírován – pošli ho komukoliv') : prompt('Zkopíruj odkaz na plán:', r.url)));
}
/**
 * 📅 Připomínka hlídání v kalendáři otevřela #watch=<id>: Přehled, posun na kartu (Flights.showWatch). Adresa se přepíše
 * na #dashboard, ať obnovení stránky kartu neotevírá znovu. Neznámé id → hláška a běžný Přehled. → true, když šlo o #watch=.
 */
function openWatchFromHash() {
  const id = window.Alerts && Alerts.watchFromHash(location.hash);
  if (!id && !/^#watch=/.test(location.hash)) return false;
  go('dashboard');
  if (!id || !window.Flights || !Flights.showWatch(id)) toast('Hlídání nenalezeno', 'err');
  return true;
}
/** Sdílený plán z #plan=… (při startu a při změně adresy): náhled a import do plánovače → Promise<boolean>. */
async function importPlanFromHash() {
  const hash = location.hash;
  if (!/^#plan=/.test(hash)) return false;
  history.replaceState(null, '', '#planner');
  let p = null;
  try { p = await PlanShare.fromHash(hash); } catch (e) { toast('Odkaz na plán je poškozený', 'err'); }
  if (p) previewPlan(p);
  return true;
}
/**
 * Sdílená nabídka letu z #offer=… (při startu a při změně adresy): Lety a karta nabídky (Flights.openOffer). Adresa se
 * přepíše na #flights, ať obnovení stránky kartu neotevírá znovu → Promise<boolean> (true, když šlo o #offer=).
 */
async function openOfferFromHash() {
  const hash = location.hash;
  if (!/^#offer=/.test(hash)) return false;
  history.replaceState(null, '', '#flights');
  go('flights', { noHash: true });
  let o = null;
  try { o = await OfferShare.fromHash(hash); } catch (e) { toast('Odkaz na nabídku je poškozený', 'err'); }
  if (o && window.Flights) Flights.openOffer(o);
  return true;
}
/** Náhled plánu z odkazu (#plan=): co v něm je, z kdy jsou ceny (sharedOn) a 💾 Uložit si ji – pak je to vlastní plán. */
function previewPlan(shared) {
  const { sharedOn, ...p } = shared; // den sdílení jen pro poznámku, do plánovače ne
  const c = p.iso ? byIso[p.iso] : null, days = Object.keys(p.days).sort(), acts = days.reduce((n, d) => n + p.days[d].length, 0);
  modalOpen(`<div class="modal-hero"><div class="mh-bg ${c && c.cost >= 4 ? 'warm' : ''}"></div><button class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button><div class="modal-hero-inner"><div style="font-size:40px;line-height:1">${c ? flag(p.iso) : '🧳'}</div><h2 style="font-size:24px;margin-top:4px;overflow-wrap:anywhere">${esc(p.name)}</h2><div style="opacity:.85;font-size:13px">Sdílený plán · ${esc(p.dest)}${p.start ? ' · ' + fmtDate(p.start) + (p.end && p.end !== p.start ? ' – ' + fmtDate(p.end) : '') : ''} · ${esc(p.pax)} os.</div></div></div>
  <div class="modal-body">
    <p class="muted" style="font-size:14px;margin-bottom:12px">Někdo ti poslal plán cesty. Zkontroluj ho a ulož si ho do plánovače – uloží se jen u tebe.</p>
    <div class="note info" style="margin-bottom:12px">🔗 <div><b>Sdílená cesta</b> – ${sharedOn ? `ceny jsou z doby sdílení (${+sharedOn.slice(8, 10)}.\u00a0${+sharedOn.slice(5, 7)}.)` : 'ceny se mohly změnit'}. Před nákupem je ověř.</div></div>
    ${p.flight ? `<div class="note info" style="margin-bottom:12px">${planIco(p.flight)} <div>${planFlightHtml(p.flight)}</div></div>` : ''}
    ${days.slice(0, 6).map(d => `<div class="act"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${fmtDate(d)}</b> ${esc(p.days[d].join(' · '))}</span></div>`).join('')}
    <div class="faint" style="font-size:12.5px;margin-top:8px">${acts} ${acts === 1 ? 'aktivita' : acts >= 2 && acts <= 4 ? 'aktivity' : 'aktivit'}${days.length > 6 ? ` · ${days.length} dní s programem` : ''}${+p.budget ? ' · rozpočet ' + czk(+p.budget) : ''}${p.notes ? ' · s poznámkami' : ''}</div>
    <div class="row wrap" style="gap:8px;margin-top:16px"><button class="btn primary" id="planImport">💾 Uložit si ji</button><button class="btn ghost" id="planSkip">Nepřidávat</button></div>
  </div>`);
  $('#planSkip').onclick = modalClose;
  $('#planImport').onclick = () => {
    const key = x => { const { checklist, ...rest } = PlanShare.sanitize(x); return JSON.stringify(rest); };
    let i = S.trips.findIndex(t => key(t) === key(p));
    if (i < 0) { S.trips.push({ ...p, checklist: p.checklist.length ? p.checklist : PACK.map(t => ({ t, done: false })) }); i = S.trips.length - 1; save(); toast('Plán přidán do plánovače'); }
    else toast('Tenhle plán už v plánovači máš');
    modalClose(); go('planner'); setTimeout(() => openTrip(i), 250);
  };
}
// úprava v okně cesty: uložit a překreslit okno i kartu v plánovači pod ním (rozpočet, aktivity, sbaleno)
const reTrip = i => { save(); openTrip(i); if (activeView === 'planner') renderPlanner(); else if (activeView === 'dashboard') renderDashStats(); };
window.addAct = (i, d) => { const inp = $('#act-' + i + '-' + d); const v = inp.value.trim(); if (!v) return; S.trips[i].days[d] = S.trips[i].days[d] || []; S.trips[i].days[d].push(v); reTrip(i); };
window.delAct = (i, d, ai) => { S.trips[i].days[d].splice(ai, 1); reTrip(i); };
window.toggleCheck = (i, xi) => { S.trips[i].checklist[xi].done = !S.trips[i].checklist[xi].done; reTrip(i); };
window.addCheck = i => { const inp = $('#newCheck-' + i); const v = inp.value.trim(); if (!v) return; S.trips[i].checklist.push({ t: v, done: false }); reTrip(i); };
window.addRef = i => {
  const t = S.trips[i], v = k => ($(`#${k}-${i}`) || { value: '' }).value;
  if (!t || !window.Backup) return;
  const r = Backup.cleanRefs([{ co: v('refCo'), kod: v('refKod'), pozn: v('refNote') }])[0];
  if (!r) return toast('Napiš kód rezervace (nebo aspoň, co to je)', 'err');
  t.refs = Backup.cleanRefs([...Backup.cleanRefs(t.refs), r]); reTrip(i);
  const co = $(`#refCo-${i}`); if (co) co.focus(); // další rezervace (okno je překreslené)
};
/** Enter v poli rezervace (k: 0 Co, 1 Kód, 2 Poznámka): s kódem nebo v poznámce uložit, jinak na další pole. */
function refKey(e, i, k) {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const kod = $(`#refKod-${i}`), next = k < 2 && $(`#${k ? 'refNote' : 'refKod'}-${i}`);
  if (k === 2 || (kod && kod.value.trim()) || !next) addRef(i); else next.focus();
}
window.delRef = (i, k) => {
  const t = S.trips[i], refs = t && window.Backup ? Backup.cleanRefs(t.refs) : [], r = refs[k];
  if (!r || !confirm(`Smazat rezervaci ${r.kod || r.co}?`)) return;
  refs.splice(k, 1);
  if (refs.length) t.refs = refs; else delete t.refs;
  reTrip(i);
};
// „change“ přijde i při překreslení okna po změně z jiného panelu – patří k cestě v okně (smazaná: nic)
window.setBudget = (i, v) => { i = tripIdx(i); if (i < 0) return; S.trips[i].budget = v; reTrip(i); };
window.setNotes = (i, v) => { i = tripIdx(i); if (i < 0) return; S.trips[i].notes = v; save(); };
// Poznámky už při psaní („change“ přijde až po opuštění pole – obnovení stránky nebo zavřená aplikace by text ztratily).
// Čekající text patří k cestě (ne k pořadí – mezitím smazaná cesta nic nepřepíše).
let notesP = null;
function flushNotes() { if (!notesP) return; const { t, v } = notesP; notesP = null; if (S.trips.includes(t) && t.notes !== v) { t.notes = v; save(); } }
window.setNotesSoon = (i, v) => { clearTimeout(notesP && notesP.tm); notesP = { t: S.trips[i], v, tm: setTimeout(flushNotes, 300) }; };
window.addEventListener('pagehide', flushNotes);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNotes(); });
// čipy vstupu u letů (📝 TDAC předem, 🛂 vízum, ✈︎ ETA při přestupu) jsou klepnutelné i na telefonu: otevřou zemi u
// podmínek vstupu (termín, oficiální web). Zachytí se dřív, než by klepnutí rozbalilo řádek nabídky, ve kterém čip je.
document.addEventListener('click', e => {
  const c = e.target.closest && e.target.closest('[data-ec]'); if (!c || !byIso[c.dataset.ec]) return;
  e.preventDefault(); e.stopPropagation();
  openCountry(c.dataset.ec);
  setTimeout(() => { const b = $('#entryBox'); if (b) b.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 250);
}, true);
// smaže hned – „↩ Vrátit“ v hlášce ji vrátí na stejné místo (jako smazané hlídání; na telefonu bez systémového dotazu)
window.delTrip = i => {
  const t = S.trips[i]; if (!t) return;
  const redraw = () => { save(); renderPlanner(); if (activeView === 'dashboard') renderDashStats(); };
  S.trips.splice(i, 1); modalClose(); redraw();
  toast(`Cesta ${t.name ? `„${t.name}“ ` : ''}smazána`, '', 6000, { label: '↩ Vrátit', run: () => { S.trips.splice(Math.min(i, S.trips.length), 0, t); redraw(); toast('Cesta je zpět'); } });
};
/** Cesty z jiného panelu: nezměněné zůstanou tytéž objekty (okno cesty, rozepsaná poznámka), cesta upravená na svém
 *  místě (stejný počet cest) se přepíše na místě; ostatní se převezmou. */
function adoptTrips(nw) {
  const old = Array.isArray(S.trips) ? S.trips : [], js = old.map(t => JSON.stringify(t));
  const out = nw.map(t => { const k = js.indexOf(JSON.stringify(t)); if (k < 0) return null; js[k] = null; return old[k]; });
  return out.map((o, n) => {
    const t = nw[n], p = old[n];
    if (o || old.length !== nw.length || js[n] === null || !p || typeof p !== 'object' || !t || typeof t !== 'object') return o || t;
    js[n] = null; Object.keys(p).forEach(k => delete p[k]); return Object.assign(p, t);
  });
}
/** Okno cesty po převzetí cest z jiného panelu: cesta smazaná → zavřít; posunutá nebo upravená → překreslit (handlery
 *  okna mají pořadí z vykreslení), rozepsané pole zůstane i s textem. */
function tripModalSync(mi, mt, mj) {
  const ni = S.trips.indexOf(mt);
  if (ni === mi && JSON.stringify(mt) === mj) return;
  const a = document.activeElement, inM = a && $('#modal').contains(a);
  const f = inM && a.id ? { id: a.id.replace(/^(\w+)-\d+/, `$1-${ni}`), v: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
  if (inM) a.blur(); // „change“ rozpočtu nebo poznámky ještě k cestě v okně (tripIdx)
  if (ni < 0) { modalClose(); return toast('Cesta byla smazána v jiném okně'); }
  const refs = ['refCo', 'refKod', 'refNote'].map(k => { const e = document.getElementById(`${k}-${mi}`); return e ? e.value : ''; }); // rozepsaná 🔖 rezervace
  flushNotes(); openTrip(ni);
  ['refCo', 'refKod', 'refNote'].forEach((k, n) => { const e = document.getElementById(`${k}-${ni}`); if (e && refs[n]) e.value = refs[n]; });
  const el = f && document.getElementById(f.id); if (!el) return;
  if (/^(act|newCheck)-/.test(f.id)) el.value = f.v; // rozepsaná aktivita nebo položka
  el.focus(); if (f.s != null) try { el.setSelectionRange(f.s, f.e); } catch (x) { }
}
/**
 * Ubytování u cesty přes víc míst (z průvodce): každé místo trasy se svým termínem – klepnutí = odkazy na Booking,
 * Airbnb… pro to místo. Jiná cesta → false (odkazy pro cíl cesty).
 */
function routeStays(t) {
  const w = t.wizard, bs = w && w.route && w.route.mode === 'multi' && Array.isArray(w.route.bases) ? w.route.bases : [];
  if (bs.length < 2 || !window.Trip) return false;
  let ds = [];
  try { ds = Trip.baseDates(Trip.sanitizeTrip(JSON.parse(JSON.stringify(w)))); } catch (e) { ds = []; }
  const pax = +t.pax || 2;
  modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button><div class="modal-hero-inner"><h2 style="font-size:23px">Ubytování na trase</h2><div style="opacity:.85;font-size:13px">${bs.length} ${bs.length <= 4 ? 'místa' : 'míst'} · vyber místo</div></div></div>
    <div class="modal-body"><div class="grid" style="gap:10px">${bs.map((b, i) => `<button type="button" class="result-link" data-rs="${i}" style="text-align:left;width:100%"><div class="lg" style="background:#003580">${i + 1}</div><div class="rl-b"><div class="rl-t">${esc(b.name)}</div><div class="rl-s">${ds[i] ? `${fmtDate(ds[i].checkin)} – ${fmtDate(ds[i].checkout)}` : ''}${b.stay && b.stay.name ? ` · vybráno: ${esc(b.stay.name)}` : ''}</div></div><div class="go">→</div></button>`).join('')}</div></div>`);
  $$('[data-rs]').forEach(x => x.onclick = () => { const i = +x.dataset.rs, d = ds[i] || {}; openStay(bs[i].name, d.checkin || '', d.checkout || '', pax); });
  return true;
}
// Hostelworld: hledání z adresy (/s?q=) vede na 404 – stránka města /hostels/<kontinent>/<země>/<město>/ (jako
// server/lib/links.js; termín z adresy nebere), když známe zemi a anglický název města; jinak úvodní stránka webu
const HW_CONT = { Evropa: 'europe', Afrika: 'africa', Asie: 'asia', 'Severní Amerika': 'north-america', 'Jižní Amerika': 'south-america', 'Oceánie': 'oceania' };
const hwSlug = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hwCityPage = (c, cityEn) => (c && HW_CONT[c.cont] && c.en && hwSlug(cityEn) ? `https://www.hostelworld.com/hostels/${HW_CONT[c.cont]}/${hwSlug(c.en)}/${hwSlug(cityEn)}/` : null);
// opts: label = název do nadpisu (jinak city), hw = stránka města na Hostelworldu
window.openStay = (city, start, end, adults = 2, opts = {}) => {
  const n = Math.min(9, Math.max(1, Math.round(+adults) || 2));
  const b = `https://www.booking.com/searchresults.cs.html?ss=${enc(city)}${start ? `&checkin=${start}&checkout=${end || ''}` : ''}&group_adults=${n}&no_rooms=1&selected_currency=CZK`;
  const a = `https://www.airbnb.cz/s/${enc(city)}/homes?${start ? `checkin=${start}&checkout=${end || ''}&` : ''}adults=${n}`;
  const h = opts.hw || 'https://www.hostelworld.com/';
  modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" data-close aria-label="Zavřít">${ico('M18 6L6 18M6 6l12 12')}</button><div class="modal-hero-inner"><h2 style="font-size:23px">Ubytování · ${esc(opts.label || city)}</h2><div style="opacity:.85;font-size:13px">${start ? fmtDate(start) + (end ? ' – ' + fmtDate(end) : '') : 'vyber si termín na webu'}</div></div></div><div class="modal-body"><div class="grid" style="gap:12px">${provLink('Booking.com', 'Hotely, apartmány, penziony', b, '#003580', 'B.')}${provLink('Airbnb', 'Bydlení u místních', a, '#ff385c', 'A')}${provLink('Hostelworld', opts.hw ? 'Hostely a levná lůžka – stránka města, termín zadej na webu' : 'Hostely a levná lůžka – město a termín zadej na webu', h, '#ff5a00', 'H')}</div><div class="note info" style="margin-top:16px">${ico('M12 16v-4M12 8h.01M12 2a10 10 0 100 20 10 10 0 000-20z')}<div>Booking a Airbnb otevřou hledání s předvyplněnou destinací (a termínem, pokud je v cestě zadaný).</div></div></div>`);
};

/* ================= INIT / EVENTS ================= */
function fillSelects() {
  // „Kontinent: vše“ jako „Cena: vše“ a „Vstup: vše“ vedle – „Všechny kontinenty“ se na telefonu (360 px, dva výběry
  // vedle sebe) nevešlo a končilo „Všechny kontine“
  $('#cCont').innerHTML = '<option value="">Kontinent: vše</option>' + CONTS.map(c => `<option>${c}</option>`).join('');
  const m = new Date().getMonth() + 1;
  $('#rMonth').innerHTML = MNS_FULL.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n.charAt(0).toUpperCase() + n.slice(1)}</option>`).join('');
}
function wireEvents() {
  $$('#cVisited button').forEach(b => b.onclick = () => { $$('#cVisited button').forEach(x => x.classList.remove('on')); b.classList.add('on'); renderCountries(); });
  // Hledání země jen při psaní: „change“ po opuštění pole by mřížku překreslil uprostřed kliknutí na kartu (karta pod
  // myší zmizí a první klik by detail neotevřel).
  $('#cSearch').oninput = renderCountries;
  // telefon: kontinent, cena, vstup a řazení pod tlačítkem Filtry (s počtem zapnutých)
  const cFilt = () => { const n = ['#cCont', '#cCost', '#cEntry'].filter(s => $(s).value).length + ($('#cSort').value !== 'cs' ? 1 : 0); $('#cFiltN').textContent = n ? ` · ${n}` : ''; };
  ['#cCont', '#cCost', '#cSort', '#cEntry'].forEach(s => { const el = $(s); el.oninput = () => { cFilt(); renderCountries(); }; el.onchange = el.oninput; });
  $('#cFiltBtn').onclick = () => { const tb = $('#cFiltBtn').closest('.toolbar'), on = !tb.classList.contains('f-open'); tb.classList.toggle('f-open', on); $('#cFiltBtn').setAttribute('aria-expanded', String(on)); };
  ['#rMonth', '#rVibe', '#rBudget', '#rSafe'].forEach(s => $(s).onchange = renderRecs);
  // ⟳: počasí a kurz znovu; radar se obnoví s dosavadními kartami (ne šedé dlaždice) a se značkami změn od minula
  $('#refreshBtn').onclick = () => { S.weather = {}; S.fx = null; save(); toast('Aktualizuji…'); if ($('#modalBg').classList.contains('show') && curIso) openCountry(curIso); if (activeView === 'dashboard') { renderDash(); Flights.renderRadar(true); } };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modalClose(); });
  // „/“ (na počítači, jako na webech zvykem): kurzor do hlavního hledání obrazovky – Přehled a Lety pole Kam, Objevuj
  // místo, Země hledání; sbalený formulář Letů se rozbalí. Ne při psaní v poli a s otevřeným oknem.
  const SLASH = { dashboard: '#heroTo input', flights: '#toInput input', explore: '#exQ', countries: '#cSearch' };
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || !SLASH[activeView]) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || $('#modalBg').classList.contains('show')) return;
    let el = $(SLASH[activeView]);
    if (el && !el.offsetParent && activeView === 'flights') { const ed = $('#searchSum:not([hidden]) #ssEdit'); if (ed) { ed.click(); el = $(SLASH[activeView]); } }
    if (!el || !el.offsetParent) return;
    e.preventDefault();
    el.focus();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  // 📍 Dnes na cestě: odpočet, místní čas a půlnoc (nový den) i v otevřené aplikaci a po návratu do ní
  setInterval(() => { if (activeView === 'dashboard' && !document.hidden) renderNow(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && activeView === 'dashboard') renderNow(); });
  // Odkaz na cestu, plán nebo sekci vložený do už otevřené stránky (mění se jen #, stránka se nenačte znovu).
  window.addEventListener('hashchange', async () => {
    if (window.Lazy && /^#trip=/.test(location.hash)) await Lazy.need('trip').catch(() => { }); // průvodce ještě nedostažený (lazy.js)
    if (window.Trip && await Trip.importFromHash()) return go('trip', { noHash: true });
    if (await importPlanFromHash()) return go('planner', { noHash: true });
    if (window.Transfer && Transfer.fromHash()) return go('dashboard', { noHash: true }); // 📲 přenos (#sync=)
    if (await openOfferFromHash()) return;
    if (openWatchFromHash()) return;
    hashView();
  });
  // Jiný panel s ATLAS (karta, aplikace na ploše) uložil stav: převzít ho, jinak by další uložení tady smazalo, co tam přibylo.
  // Jen změněné klíče (průvodce poznává svoji cestu podle S.trip === t, okno cesty a poznámka svoji cestu podle objektu
  // – adoptTrips); hlídané ceny slučuje flights.js.
  window.addEventListener('storage', e => {
    if (e.key !== LS || !e.newValue) return;
    let d; try { d = JSON.parse(e.newValue); } catch (x) { return; }
    if (!d || typeof d !== 'object') return;
    // otevřené okno cesty: jeho cesta, pořadí z vykreslení (v handlerech okna) a obsah
    const mEl = $('#modalBg').classList.contains('show') && $('#modal [id^="notes-"]');
    const mt = mEl ? tripShown : null, mi = mt ? +mEl.id.slice(6) : -1, mj = mt && JSON.stringify(mt);
    const ch = new Set(), def = defState();
    for (const k of new Set([...Object.keys(S), ...Object.keys(d)])) {
      const v = k in d ? d[k] : def[k]; // chybějící klíč jako při načtení (load)
      if (k === 'watch' || JSON.stringify(S[k]) === JSON.stringify(v)) continue;
      if (v === undefined) delete S[k]; else S[k] = k === 'trips' && Array.isArray(v) ? adoptTrips(v) : v;
      ch.add(k);
    }
    if (ch.has('theme') || ch.has('mapStyle')) { applyTheme(); applyMapStyle(); if (window.Flights) Flights.repaintMap(); if (window.Places) Places.retheme(); }
    if (ch.has('visited')) {
      visited.clear(); (S.visited || []).forEach(c => visited.add(c));
      refreshStats(); paintMap(); if (window.Flights && Flights.refreshVisited) Flights.refreshVisited();
      if (activeView === 'countries') renderCountries();
    }
    if (activeView === 'planner' && ch.has('trips')) renderPlanner();
    if (activeView === 'dashboard' && (ch.has('trips') || ch.has('visited'))) renderDashStats();
    if (mt && ch.has('trips')) tripModalSync(mi, mt, mj);
    if (ch.has('trip') && activeView === 'trip' && window.Trip) Trip.render(); // handlery průvodce na převzatou S.trip
    // ⭐ / 🙈 z jiného okna: radar, pruh ⭐ Moje cíle, rychlé hledání a výpis hned podle nich (jen překreslit, bez ukládání)
    if ((ch.has('fav') || ch.has('mute')) && window.Flights && Flights.refreshPrefs) Flights.refreshPrefs();
    // domov radaru, Kdykoliv / Víkendy / Svátky nebo vybraný svátek z jiného okna: čip, Odkud na Přehledu i radar
    if ((ch.has('home') || ch.has('radarMode') || ch.has('radarHoliday')) && window.Flights && Flights.homeChanged) Flights.homeChanged();
    // 📌 odložené nabídky z jiného okna: radar, Přehled, výpis i otevřené Porovnat
    if (ch.has('pins') && window.Flights && Flights.refreshPins) Flights.refreshPins();
  });
}
function renderTips() { $('#flightTips').innerHTML = TIPS.map(t => `<div class="tip"><div class="tn"><span>${t[0]}</span>${t[1]}</div><p>${t[2]}</p></div>`).join(''); }

/* Úvodní obrazovka aplikace na ploše (index.html #launch): zmizí, až je přehled vykreslený a písma načtená (na písma
   nejvýš 0,8 s) – start bez poskakování obsahu. Pojistka: 3,1 s od otevření stránky začne mizet (bez čekání na písma),
   za 3,5 s je pryč; přišla-li stránka pozdě (pomalá síť, uspaný server), drží se aspoň 2 s, než se přehled vykreslí. */
function launchDone(now) {
  const el = $('#launch'); if (!el || el.dataset.out) return;
  el.dataset.out = '1';
  const out = () => { el.classList.add('out'); setTimeout(() => el.remove(), 700); };
  if (now === true) return out();
  // vlaštovka musí nejdřív vzlétnout (~0,9 s od prvního vykreslení; bez animací se nečeká)
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const takeoff = new Promise(r => setTimeout(r, calm ? 0 : Math.max(0, (window.atlasLaunchAt || 0) + 950 - performance.now())));
  const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]) : Promise.resolve();
  Promise.all([fonts, takeoff]).then(() => requestAnimationFrame(() => requestAnimationFrame(out)));
}
setTimeout(() => launchDone(true), Math.max(2000, 3100 - performance.now()));
async function boot() {
  try { await start(); } finally {
    document.documentElement.classList.add('booted'); // Přehled je vykreslený – ukázat i sekce pod úvodem (atlas.css)
    launchDone();
    if (window.Lazy) Lazy.soon(); // průvodce, Objevuj a Před cestou, až prohlížeč nemá co dělat (lazy.js)
  }
}
async function start() {
  // obnovená stránka na kroku okna nebo průvodce (okno po obnovení zavřené, cesta kroků zapomenutá): krok přeskočit –
  // Zpět by jinak napoprvé „nic neudělal“
  if (history.state && (history.state.atlasM || history.state.atlasDp || history.state.atlasT)) histBack();
  sinceStart(); // 🕘 Od minula: dřív, než aplikace uklidí propadlé odložené nabídky
  if (window.Flights) Flights.warm(); // stav serveru souběžně s daty zemí – rychlejší start
  applyTheme(); applyMapStyle(); buildNav(); fillSelects(); wireEvents(); renderTips();
  if (window.Entry) {
    // vstupní podmínky (~20 kB gzip) souběžně se startem; po načtení doplnit čipy a otevřený seznam zemí
    Entry.whenReady(() => { paintEntryChips(); if (activeView === 'countries' && $('#cEntry').value) renderCountries(); });
    Entry.load().catch(() => { });
  }
  try {
    initCountries(await (await fetch('data/countries.json')).json());
  } catch (e) {
    toast('Nepodařilo se načíst data zemí', 'err');
  }
  if (window.Flights) await Flights.init();
  refreshStats();
  // průvodce cestou (trip.js) se stahuje až po startu (lazy.js); hned ho potřebuje sdílená cesta z odkazu a Přehled
  // s rozpracovanou nebo právě probíhající cestou – na něj se počká (karty se pak nepřekreslují pod rukama)
  if (window.Lazy && (/^#trip=/.test(location.hash) || tripSoon())) await Lazy.need('trip').catch(() => { });
  const shared = window.Trip && await Trip.importFromHash();
  const plan = !shared && await importPlanFromHash();
  // 📲 přenos z jiného zařízení (#sync=, transfer.js): Přehled hned, náhled přenosu nad ním, až se odkaz přečte
  if (!shared && !plan && window.Transfer && Transfer.fromHash()) return go('dashboard', { noHash: true });
  if (!shared && !plan && (await openOfferFromHash() || openWatchFromHash())) return;
  const v = shared ? 'trip' : plan ? 'planner' : location.hash.slice(1);
  if (v === 'now') return showNow(); // zkratka aplikace „Na cestě“
  go(NAV.some(n => n[0] === v) ? v : 'dashboard', { noHash: true });
}
document.addEventListener('DOMContentLoaded', boot);
