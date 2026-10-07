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
const MNS_FULL = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const CONTS = ['Evropa', 'Asie', 'Afrika', 'Severní Amerika', 'Jižní Amerika', 'Oceánie'];
const pad = n => String(n).padStart(2, '0');
const fmtYMD = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtDate = s => { if (!s) return ''; const [, m, d] = s.split('-'); return `${+d}.${+m}.`; };
const czk = n => n == null || !isFinite(n) ? '—' : Math.round(n).toLocaleString('cs-CZ') + ' Kč';

let COUNTRIES = [];
const byIso = {}, byM49 = {}, byEn = {};
let TOT = 197; const CONT_TOT = {};

/* ================= STATE ================= */
const LS = 'atlas_v1';
let S = load();
function load() { try { const d = JSON.parse(localStorage.getItem(LS)); if (d) return Object.assign(defState(), d); } catch (e) { } return defState(); }
function defState() { return { visited: [], trips: [], theme: 'dark', geo: {}, weather: {}, fx: null, home: null, watch: [], form: null, radar: null }; }
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { } }
let curIso = null;
const visited = new Set(S.visited);
function setVisited(iso, on) { on ? visited.add(iso) : visited.delete(iso); S.visited = [...visited]; save(); refreshStats(); paintMap(); }

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
  // Na mobilu hlavní sekce + „Více“ (mapa, země, doporučení).
  const MOBILE = ['dashboard', 'flights', 'trip', 'explore', 'planner'];
  $('#mobileNav').innerHTML = NAV.filter(n => MOBILE.includes(n[0])).map(n => `<div class="mi" data-view="${n[0]}">${ico(n[3])}<span>${n[1]}</span>${n[0] === 'dashboard' ? '<i class="mi-dot" id="mobDrops" hidden></i>' : ''}</div>`).join('')
    + `<div class="mi" id="moreNav">${ico('M5 12h.01M12 12h.01M19 12h.01')}<span>Více</span></div>`;
  $$('[data-view]').forEach(el => el.onclick = () => go(el.dataset.view));
  $('#moreNav').onclick = () => {
    modalOpen(`<div class="modal-body"><h3 style="margin-bottom:12px">Další sekce</h3><div class="more-nav">${NAV.filter(n => !MOBILE.includes(n[0])).map(n => `<button type="button" class="btn ghost" data-mv="${n[0]}" style="justify-content:flex-start;width:100%;margin-bottom:8px">${ico(n[3])} ${n[1]} <span class="faint" style="font-weight:400;margin-left:6px">${n[2]}</span></button>`).join('')}</div></div>`);
    $$('[data-mv]').forEach(b => b.onclick = () => { modalClose(); go(b.dataset.mv); });
    if (window.Pwa) Pwa.addToMenu($('.more-nav', $('#modal'))); // 📲 Přidat ATLAS na plochu (pwa.js)
  };
}
function go(v, opts = {}) {
  activeView = v;
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === v));
  $$('.mobile-nav .mi').forEach(el => el.classList.toggle('active', el.dataset.view === v || (el.id === 'moreNav' && ['map', 'countries', 'recommend'].includes(v))));
  const n = NAV.find(x => x[0] === v); $('#pageTitle').textContent = n[1]; $('#pageSub').textContent = n[2];
  if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  if (location.hash.slice(1) !== v && !opts.noHash) history.replaceState(null, '', '#' + v);
  if (v === 'map') initMap();
  if (v === 'countries') renderCountries();
  if (v === 'recommend') renderRecs();
  if (v === 'planner') renderPlanner();
  if (v === 'dashboard') renderDash();
  if (v === 'trip' && window.Trip) Trip.render();
  if (v === 'explore' && window.Places) Places.renderExplore($('#exploreRoot'));
}
function toast(msg, kind) { const t = $('#toast'); t.innerHTML = (kind === 'err' ? '⚠️ ' : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`) + esc(msg); t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600); }

/* theme */
function applyTheme() { document.documentElement.dataset.theme = S.theme; $('#themeLabel').textContent = S.theme === 'dark' ? 'Tmavý režim' : 'Světlý režim'; }
$('#themeToggle').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); if (window.Flights) Flights.repaintMap(); if (window.Places) Places.retheme(); };

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
    $('#contBars').innerHTML = CONTS.map(c => { const tot = CONT_TOT[c] || 1; const n = [...visited].filter(i => byIso[i]?.cont === c).length; const p = Math.round(n / tot * 100); return `<div class="cont-row"><div class="ct"><span>${c}</span><b>${n}/${tot}</b></div><div class="progress"><span style="width:${p}%"></span></div></div>`; }).join('');
  }
}

/* ================= DASHBOARD ================= */
function renderDash() {
  const st = stats(); const m = new Date().getMonth() + 1;
  const topRec = scoreCountries(m, {}).filter(r => !visited.has(r.c.iso2))[0];
  const w = (S.watch || []).length;
  $('#statGrid').innerHTML = [
    ['Navštívené země', `${st.count}<small> / ${TOT}</small>`, `${st.pct}% světa`, `<div class="progress"><span style="width:${st.pct}%"></span></div>`],
    ['Hlídané ceny', `<span id="watchStatVal">${w}</span>`, `<span id="watchStatSub">${window.Flights ? Flights.watchStatTxt() : ''}</span>`, ''],
    ['Naplánované cesty', `${S.trips.length}`, S.trips.length ? 'Mrkni do plánovače' : 'Začni plánovat', ''],
    ['Tip na ' + MNS_FULL[m - 1], topRec ? `${flag(topRec.c.iso2)}` : '—', topRec ? topRec.c.cs : '', ''],
  ].map(s => `<div class="card stat"><div class="lab">${s[0]}</div><div class="val">${s[1]}</div><div class="sub">${s[2]}</div>${s[3] || ''}</div>`).join('');
  const recs = scoreCountries(m, {}).filter(r => !visited.has(r.c.iso2)).slice(0, 4);
  $('#dashRecs').innerHTML = recs.map(r => destCard(r.c, r.score)).join('');
  bindDest('#dashRecs');
  $$('.link[data-go]').forEach(l => l.onclick = () => go(l.dataset.go));
  if (window.Flights) { Flights.renderQuick(); Flights.renderWatch(); Flights.renderRadar(); }
}

/* ================= DEST CARD ================= */
function costDots(n) { return `<span class="dots warm">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`; }
function destCard(c, score) {
  const months = c.months ? c.months.slice(0, 3).map(m => MNS[m - 1]).join(' · ') : '';
  return `<div class="card dest ${visited.has(c.iso2) ? 'visited' : ''}" data-iso="${c.iso2}">
    ${score ? `<div class="score-pill">${score}</div>` : `<div class="vmark"><svg viewBox="0 0 24 24" width="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>`}
    <div class="flag">${flag(c.iso2)}</div>
    <div class="cname">${c.cs}</div><div class="ccont">${c.cont}${c.cap ? ' · ' + c.cap : ''}</div>
    <div class="cblurb">${c.blurb || 'Objev tuto zemi – počasí, ceny i odkazy najdeš uvnitř.'}</div>
    ${entryChip(c.iso2)}<div class="meta">${c.cost ? costDots(c.cost) : '<span></span>'}${months ? `<span>${months}</span>` : ''}</div>
  </div>`;
}
// Vstupní podmínky (entry.js): čip na kartě; data se načítají po startu, pak se čipy doplní (paintEntryChips).
const entryChip = iso => (window.Entry && Entry.ready() ? Entry.cardChip(iso) : '');
function paintEntryChips() { $$('.dest[data-iso]').forEach(el => { const m = $('.meta', el); if (m && !$('.ec', el)) m.insertAdjacentHTML('beforebegin', entryChip(el.dataset.iso)); }); }
function bindDest(sel) { $$(sel + ' .dest[data-iso]').forEach(el => el.onclick = () => openCountry(el.dataset.iso)); }

/* ================= RECOMMENDATIONS ENGINE ================= */
function scoreCountries(month, opt) {
  const { vibe = '', budget = 9, safe = 0 } = opt || {};
  return COUNTRIES.filter(c => c.cost).filter(c => c.cost <= budget && c.safety >= safe).map(c => {
    let season = 0; if (c.months.includes(month)) season = 1; else if (c.months.includes(month % 12 + 1) || c.months.includes((month + 10) % 12 + 1)) season = .5;
    const value = (6 - c.cost) / 5, safety = c.safety / 5;
    let vm = 0; if (vibe) { const kws = VIBES[vibe] || []; const hay = norm(c.blurb + ' ' + (c.tags || []).join(' ')); if (kws.some(k => hay.includes(norm(k)))) vm = 1; }
    const total = season * 3 + value * 2 + safety * 1.5 + vm * 3 + (c.safety >= 4 ? .3 : 0);
    const max = vibe ? 9.8 : 6.8;
    return { c, score: Math.round(total / max * 100), season };
  }).sort((a, b) => b.score - a.score);
}
function renderRecs() {
  const m = +$('#rMonth').value, vibe = $('#rVibe').value, budget = +$('#rBudget').value, safe = +$('#rSafe').value;
  $('#recTitle').textContent = 'Kam vyrazit · ' + MNS_FULL[m - 1];
  const list = scoreCountries(m, { vibe, budget, safe }).slice(0, 18);
  $('#recGrid').innerHTML = list.map(r => {
    const reasons = []; if (r.season === 1) reasons.push('ideální počasí'); if (r.c.cost <= 2) reasons.push('levné'); if (r.c.safety >= 5) reasons.push('velmi bezpečné'); else if (r.c.safety >= 4) reasons.push('bezpečné');
    const c = r.c;
    return `<div class="card dest" data-iso="${c.iso2}"><div class="score-pill">${r.score}</div>
      <div class="flag">${flag(c.iso2)}</div><div class="cname">${c.cs}</div><div class="ccont">${c.cont}</div>
      <div class="cblurb">${c.blurb}</div>
      <div class="tags">${reasons.map(x => `<span class="tag" style="color:var(--good)">✓ ${x}</span>`).join('')}</div>
      ${entryChip(c.iso2)}<div class="meta">${costDots(c.cost)}<span>${c.months.slice(0, 3).map(x => MNS[x - 1]).join(' · ')}</span></div></div>`;
  }).join('');
  bindDest('#recGrid');
}

/* ================= COUNTRIES GRID ================= */
function renderCountries() {
  const q = norm($('#cSearch').value), cont = $('#cCont').value, cost = $('#cCost').value, sort = $('#cSort').value, vis = $('#cVisited .on').dataset.v, ent = $('#cEntry').value;
  let list = COUNTRIES.slice();
  if (q) list = list.filter(c => norm(c.cs).includes(q) || norm(c.en).includes(q) || (c.tags || []).some(t => norm(t).includes(q)));
  if (cont) list = list.filter(c => c.cont === cont);
  if (cost) list = list.filter(c => c.cost && (cost === '1' ? c.cost <= 1 : cost === '2' ? c.cost <= 2 : c.cost >= 3));
  if (vis === 'yes') list = list.filter(c => visited.has(c.iso2)); else if (vis === 'no') list = list.filter(c => !visited.has(c.iso2));
  if (ent && window.Entry) list = list.filter(c => c.iso2 !== 'CZ' && Entry.matches(c.iso2, ent));
  if (sort === 'cost') list.sort((a, b) => (a.cost || 9) - (b.cost || 9)); else if (sort === 'safety') list.sort((a, b) => (b.safety || 0) - (a.safety || 0)); else list.sort((a, b) => a.cs.localeCompare(b.cs, 'cs'));
  $('#countryGrid').innerHTML = list.length ? list.map(c => destCard(c)).join('') : `<div class="empty" style="grid-column:1/-1"><div class="ei">${ico('M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20')}</div><div>Nic nenalezeno. Zkus jiný filtr.</div></div>`;
  bindDest('#countryGrid');
}

/* ================= COUNTRY MODAL ================= */
function modalOpen(html) { $('#modal').innerHTML = html; $('#modalBg').classList.add('show'); }
function modalClose() { $('#modalBg').classList.remove('show'); }
$('#modalBg').onclick = e => { if (e.target === $('#modalBg')) modalClose(); };
function monthsStrip(best) { const now = new Date().getMonth() + 1; return `<div class="months">${MNS.map((m, i) => `<div class="m ${best && best.includes(i + 1) ? 'best' : ''} ${i + 1 === now ? 'now' : ''}">${m}</div>`).join('')}</div>`; }
// Průměrná denní maxima po měsících (NASA POWER, /api/climate); bez dat jen zástupné buňky stejné výšky.
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
    if (curIso !== iso || !box || !Array.isArray(c.hi)) return;
    $('.months', box).outerHTML = climStrip(c);
    $('#climWhere').textContent = c.city ? `· ${c.city} (${c.iata})` : '';
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
   <div class="modal-hero"><div class="mh-bg ${c.cost >= 4 ? 'warm' : ''}"></div>
     <button class="modal-close" onclick="modalClose()">${ico('M18 6L6 18M6 6l12 12')}</button>
     <div class="modal-hero-inner">
       <div style="font-size:54px;line-height:1">${flag(iso)}</div>
       <h2 style="font-size:28px;margin-top:6px">${c.cs}</h2>
       <div style="opacity:.85;font-size:13.5px">${c.en} · ${c.cont}${c.cap ? ' · ' + c.cap : ''}</div>
     </div>
   </div>
   <div class="modal-body">
     ${geoNote}
     <div id="wxBox" class="weather-now"><div class="wico">⏳</div><div><div class="muted" style="font-size:12px">Načítám počasí…</div><div class="temp">--°</div></div></div>
     <div id="fcBox" class="forecast"></div>
     <div class="divider"></div>
     <div class="kv">
       <div><div class="k">Cenová hladina</div><div class="v">${c.cost ? costDots(c.cost) : '—'}</div><div class="faint" style="font-size:12px">${costTxt}</div></div>
       <div><div class="k">Bezpečnost</div><div class="v" style="color:${c.safety >= 4 ? 'var(--good)' : c.safety >= 3 ? 'var(--warn)' : 'var(--bad)'}">${safeTxt}</div></div>
       <div><div class="k">Měna</div><div class="v" style="font-size:15px">${c.cur || '—'}</div><div class="faint" id="fxLine" style="font-size:12px"></div></div>
     </div>
     ${iso !== 'CZ' && window.Entry ? `<div id="entryBox">${Entry.ready() ? Entry.detailHtml(iso) : `<div class="faint" style="font-size:12.5px;margin-top:12px">🛂 Načítám vstupní podmínky… (jinak je najdeš na <a href="${mzv}" target="_blank" rel="noopener">webu MZV ČR</a>)</div>`}</div>` : ''}
     <div style="margin-top:14px"><div class="k" style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.04em">Nejlepší období${c.months ? '' : ' — orientačně'}</div>${monthsStrip(c.months)}</div>
     <div id="climBox" style="margin-top:12px" title="Dlouhodobý průměr let 2001–2020 (NASA POWER) – není to předpověď"><div class="k clim-k">Průměrná denní maxima <span id="climWhere" class="faint"></span></div>${climStrip(null)}</div>
     ${c.tags ? `<div class="tags" style="margin-top:16px">${c.tags.map(t => `<span class="chip accent">${t}</span>`).join('')}</div>` : ''}
     ${c.blurb ? `<p class="muted" style="margin-top:14px;font-size:14px">${c.blurb}</p>` : ''}
     <div class="note info" style="margin-top:16px">${ico('M12 16v-4M12 8h.01M12 2a10 10 0 100 20 10 10 0 000-20z')}<div>Bezpečnostní a geopolitická situace se mění. Před cestou si vždy ověř aktuální doporučení na <a href="${mzv}" target="_blank" rel="noopener" style="color:var(--info);text-decoration:underline">MZV ČR</a>.</div></div>
     <div class="divider"></div>
     <div class="row wrap">
       <button class="btn primary" onclick="modalClose();fromCountrySearch('${iso}')">${ico('M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z')} Najít lety sem</button>
       <button class="btn" onclick="stayLinks('${esc(c.cap || c.cs)}')">${ico('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z')} Ubytování</button>
       <button class="btn" onclick="addToPlan('${iso}')">${ico('M12 5v14M5 12h14')} Do plánu</button>
       <button class="btn ${isV ? 'warm' : 'ghost'}" id="visBtn" onclick="toggleVis('${iso}')">${isV ? '✓ Navštíveno' : 'Označit jako navštívené'}</button>
     </div>
   </div>`);
  loadWeather(c);
  loadFx(c);
  loadClimate(iso);
  // data ještě nedorazila (nebo se načtení nepovedlo – zkusit znovu)
  if (window.Entry && !Entry.ready()) { Entry.whenReady(() => { const b = $('#entryBox'); if (b && curIso === iso) b.innerHTML = Entry.detailHtml(iso); }); Entry.load().catch(() => { }); }
}
window.modalClose = modalClose;
window.toggleVis = iso => { const on = !visited.has(iso); setVisited(iso, on); const b = $('#visBtn'); if (b) { b.textContent = on ? '✓ Navštíveno' : 'Označit jako navštívené'; b.className = 'btn ' + (on ? 'warm' : 'ghost'); } toast(on ? 'Přidáno: ' + byIso[iso].cs : 'Odebráno: ' + byIso[iso].cs); renderCountries(); };
window.fromCountrySearch = iso => { if (window.Flights) Flights.searchTo([{ id: 'cc:' + iso, label: byIso[iso].cs, flag: flag(iso) }]); };
window.stayLinks = city => openStay(city);
window.addToPlan = iso => { newTrip(byIso[iso]); };

/* weather + fx (LIVE z Open-Meteo / ER-API přímo z prohlížeče) */
async function geocode(c) {
  if (S.geo[c.iso2]) return S.geo[c.iso2];
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(c.cap || c.en)}&count=1&language=cs&format=json`); const j = await r.json();
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
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`);
    const j = await r.json(); S.weather[c.iso2] = { ts: Date.now(), data: j }; save(); if (box()) paintWeather(j);
  } catch (e) { if (box()) box().innerHTML = '<div class="wico">🌐</div><div class="muted" style="font-size:13px">Počasí se teď nepodařilo načíst.</div>'; }
}
function paintWeather(j) {
  if (!$('#wxBox') || !j || !j.current) return;
  const cur = j.current, [ci, ct] = wIco(cur.weather_code);
  $('#wxBox').innerHTML = `<div class="wico">${ci}</div><div style="flex:1"><div class="muted" style="font-size:12px">Teď v hlavním městě · ${ct}</div><div class="temp">${Math.round(cur.temperature_2m)}°</div><div class="faint" style="font-size:12px">💨 ${Math.round(cur.wind_speed_10m)} km/h · 💧 ${cur.relative_humidity_2m ?? '–'} %</div></div>`;
  const d = j.daily; const days = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  $('#fcBox').innerHTML = d.time.map((t, i) => { const dt = new Date(t); const [ic] = wIco(d.weather_code[i]); return `<div class="fc"><div class="d">${i === 0 ? 'Dnes' : days[dt.getDay()]}</div><div class="i">${ic}</div><div class="t">${Math.round(d.temperature_2m_max[i])}°<small> ${Math.round(d.temperature_2m_min[i])}°</small></div></div>`; }).join('');
}
async function loadFx(c) {
  if (!c.cur || c.cur === 'CZK') { const el = $('#fxLine'); if (el) el.textContent = c.cur === 'CZK' ? 'domácí měna' : ''; return; }
  if (!S.fx || Date.now() - S.fx.ts > 86400000) { try { const r = await fetch('https://open.er-api.com/v6/latest/CZK'); const j = await r.json(); if (j && j.rates) { S.fx = { ts: Date.now(), rates: j.rates }; save(); } } catch (e) { } }
  const el = $('#fxLine'); if (!el || curIso !== c.iso2) return; // mezitím otevřená jiná země
  if (S.fx && S.fx.rates[c.cur]) { const v = 1 / S.fx.rates[c.cur]; el.textContent = `1 ${c.cur} ≈ ${v.toFixed(v < 1 ? 3 : 2)} Kč`; }
}
function provLink(name, sub, url, color, lab) { return `<a class="result-link" href="${url}" target="_blank" rel="noopener"><div class="lg" style="background:${color}">${lab}</div><div><div class="rl-t">${name}</div><div class="rl-s">${sub}</div></div><div class="go">${ico('M5 12h14M13 6l6 6-6 6')}</div></a>`; }

/* ================= MAP (D3) ================= */
let mapInited = false, mapSel = null, mapZoom = null, WORLD = null;
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
  if (typeof d3 === 'undefined' || typeof topojson === 'undefined') return mapFallback('Mapové knihovny se nenačetly.');
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
  p.style.left = Math.min(e.clientX, innerWidth - 130) + 'px'; p.style.top = Math.min(e.clientY, innerHeight - 120) + 'px'; p.classList.add('show');
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
function dateRange(a, b) { if (!a) return []; const out = []; let d = new Date(a), end = b ? new Date(b) : new Date(a); let n = 0; while (d <= end && n < 31) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); n++; } return out; }
function resolveCountry(text) { const t = norm(text); if (!t) return null; let c = COUNTRIES.find(c => norm(c.cs) === t || norm(c.en) === t); if (!c) c = COUNTRIES.find(c => norm(c.cs).startsWith(t) && t.length > 2); return c || null; }
// Doprava uložená z průvodce cestou: let (✈️), nebo vlak/bus (text začíná 🚆).
const planIco = f => /^🚆/u.test(String(f || '')) ? '🚆' : '✈️';
const planTransport = f => /^🚆/u.test(String(f || '')) ? String(f) : '✈️ ' + f;
function renderPlanner() {
  const host = $('#plannerList');
  if (!S.trips.length) { host.innerHTML = `<div class="empty"><div class="ei">${ico('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z')}</div><h2 style="font-size:20px;margin-bottom:6px">Zatím žádná cesta</h2><p style="max-width:420px;margin:0 auto 18px">Naplánuj si itinerář, ubytování i rozpočet na jednom místě. Cestu můžeš vytvořit i přímo z nalezeného letu (tlačítko „Do plánu“).</p><button class="btn primary" id="emptyNew">${ico('M12 5v14M5 12h14')} Nová cesta</button></div>`; $('#emptyNew').onclick = () => newTrip(); return; }
  host.innerHTML = `<div class="trip-grid">${S.trips.map((t, i) => tripCard(t, i)).join('')}<div class="card new-trip" id="newTripTile"><div class="plus">${ico('M12 5v14M5 12h14')}</div><div style="font-weight:700">Nová cesta</div></div></div>`;
  $$('.trip[data-ti]').forEach(el => el.onclick = () => openTrip(+el.dataset.ti));
  $('#newTripTile').onclick = () => newTrip();
}
function tripCard(t, i) {
  const c = t.iso ? byIso[t.iso] : null, warm = c && c.cost >= 4;
  return `<div class="card trip" data-ti="${i}"><div class="trip-top ${warm ? 'warm' : ''}"><div class="tt-name">${esc(t.name)}</div><div class="tt-meta">${c ? flag(t.iso) + ' ' : '📍 '}${esc(t.dest)}${t.start ? ' · ' + fmtDate(t.start) + (t.end ? '–' + fmtDate(t.end) : '') : ''}</div></div><div class="trip-body"><div class="bar"><span>👤 ${t.pax || 1} os.</span><span>${t.budget ? (+t.budget).toLocaleString('cs') + ' Kč' : 'rozpočet —'}</span></div>${t.flight ? `<div class="faint" style="font-size:12px;margin-bottom:4px">${esc(planTransport(t.flight))}</div>` : ''}<div class="muted" style="font-size:12.5px">${(t.days ? Object.values(t.days).flat().length : 0)} aktivit · ${(t.checklist || []).filter(x => x.done).length}/${(t.checklist || []).length} sbaleno</div></div></div>`;
}
function newTrip(c, pre = {}) {
  const dest = pre.dest || (c ? c.cs : '');
  modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" onclick="modalClose()">${ico('M18 6L6 18M6 6l12 12')}</button><div class="modal-hero-inner"><h2 style="font-size:24px">Nová cesta</h2><div style="opacity:.85;font-size:13px">Vyplň základ, detaily doladíš potom</div></div></div>
  <div class="modal-body">
    <div class="field"><label>Název cesty</label><input class="input" id="ntName" placeholder="Např. Léto v Portugalsku" value="${esc(pre.name || (dest ? 'Cesta: ' + dest : ''))}"></div>
    <div class="field" style="margin-top:12px"><label>Destinace</label><input class="input" id="ntDest" placeholder="Země nebo město" value="${esc(dest)}"></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="field"><label>Odjezd</label><input class="input" type="date" id="ntStart" value="${pre.start || ''}"></div><div class="field"><label>Návrat</label><input class="input" type="date" id="ntEnd" value="${pre.end || ''}"></div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="field"><label>Cestující</label><select id="ntPax">${[1, 2, 3, 4, 5, 6].map(n => `<option ${n === (pre.pax || 2) ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="field"><label>Rozpočet (Kč)</label><input class="input" type="number" id="ntBudget" placeholder="nepovinné" value="${pre.budget || ''}"></div></div>
    <button class="btn primary block" style="margin-top:18px" id="ntSave">Vytvořit cestu</button>
  </div>`);
  $('#ntSave').onclick = () => saveTrip(c ? c.iso2 : (pre.iso || null), pre.flight || null);
}
function saveTrip(iso, flightTxt) {
  const name = $('#ntName').value.trim() || 'Moje cesta'; const dest = $('#ntDest').value.trim();
  let fiso = iso; if (!fiso && dest) { const c = resolveCountry(dest); if (c) fiso = c.iso2; }
  S.trips.push({ name, dest: dest || '—', iso: fiso || null, start: $('#ntStart').value, end: $('#ntEnd').value, pax: $('#ntPax').value, budget: $('#ntBudget').value, flight: flightTxt, days: {}, checklist: PACK.map(t => ({ t, done: false })), notes: '' });
  save(); modalClose(); go('planner'); toast('Cesta vytvořena'); setTimeout(() => openTrip(S.trips.length - 1), 250);
}
function openTrip(i) {
  const t = S.trips[i]; if (!t) return; const c = t.iso ? byIso[t.iso] : null; const city = c && c.cap ? c.cap : t.dest;
  const days = dateRange(t.start, t.end);
  modalOpen(`<div class="modal-hero"><div class="mh-bg ${c && c.cost >= 4 ? 'warm' : ''}"></div><button class="modal-close" onclick="modalClose()">${ico('M18 6L6 18M6 6l12 12')}</button><div class="modal-hero-inner"><div style="font-size:40px;line-height:1">${c ? flag(t.iso) : '🧳'}</div><h2 style="font-size:25px;margin-top:4px;overflow-wrap:anywhere">${esc(t.name)}</h2><div style="opacity:.85;font-size:13px">${esc(t.dest)}${t.start ? ' · ' + fmtDate(t.start) + (t.end ? ' – ' + fmtDate(t.end) : '') : ''} · ${t.pax} os.</div></div></div>
  <div class="modal-body">
    ${t.flight ? `<div class="note info" style="margin-bottom:14px">${planIco(t.flight)} <div>${esc(t.flight.replace(/^🚆\s*/u, ''))}</div></div>` : ''}
    <div class="row wrap"><button class="btn primary" onclick="modalClose();${c ? `fromCountrySearch('${t.iso}')` : `go('flights')`}">${ico('M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z')} Hledat lety</button><button class="btn" id="tripStay">${ico('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z')} Ubytování</button>${c ? `<button class="btn ghost" onclick="modalClose();openCountry('${t.iso}')">Info o zemi</button>` : ''}</div>
    ${tripEntryHtml(t)}
    <div class="row wrap" style="gap:8px;margin-top:10px">${days.length ? '<button class="btn sm" id="tripIcs">📅 Do kalendáře (.ics)</button>' : ''}<button class="btn sm" id="tripShare">🔗 Sdílet plán</button>${days.length ? `<a class="btn sm ghost" id="tripGcal" href="${esc(safeUrl(Ics.gcalUrl(planEvents(t)[0])))}" target="_blank" rel="noopener">Přidat do Google Kalendáře ↗</a>` : ''}</div>
    <div class="divider"></div>
    <div class="row" style="justify-content:space-between"><h3 style="font-size:16px">🗺️ Itinerář</h3><span class="faint" style="font-size:12px">${days.length ? days.length + (days.length === 1 ? ' den' : days.length < 5 ? ' dny' : ' dní') : 'doplň termíny'}</span></div>
    <div style="margin-top:10px">${days.length ? days.map((d, di) => { const acts = t.days[d] || []; return `<div class="day-block"><h4>Den ${di + 1} <span class="faint" style="font-weight:600">· ${fmtDate(d)}</span></h4>${acts.map((a, ai) => `<div class="act"><span>${esc(a)}</span><button onclick="delAct(${i},'${d}',${ai})">${ico('M18 6L6 18M6 6l12 12')}</button></div>`).join('')}<div class="row" style="gap:8px;margin-top:8px"><input class="input" id="act-${i}-${d}" placeholder="Přidej aktivitu…" onkeydown="if(event.key==='Enter')addAct(${i},'${d}')"><button class="btn sm" onclick="addAct(${i},'${d}')">Přidat</button></div></div>`; }).join('') : `<div class="note info">${ico('M12 16v-4M12 8h.01M12 2a10 10 0 100 20 10 10 0 000-20z')}<div>Doplň termíny cesty a objeví se itinerář den po dni.</div></div>`}</div>
    <div class="divider"></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:20px">
      <div><h3 style="font-size:16px;margin-bottom:10px">🧾 Sbaleno</h3><div id="checkList">${(t.checklist || []).map((x, xi) => `<label class="check"><input type="checkbox" ${x.done ? 'checked' : ''} onchange="toggleCheck(${i},${xi})"><span style="${x.done ? 'opacity:.5;text-decoration:line-through' : ''}">${esc(x.t)}</span></label>`).join('')}</div><div class="row" style="gap:8px;margin-top:10px"><input class="input" id="newCheck-${i}" placeholder="Přidej položku…" onkeydown="if(event.key==='Enter')addCheck(${i})"><button class="btn sm" onclick="addCheck(${i})">+</button></div></div>
      <div><h3 style="font-size:16px;margin-bottom:10px">💰 Rozpočet</h3><div class="field"><label>Celkový rozpočet (Kč)</label><input class="input" type="number" id="bud-${i}" value="${t.budget || ''}" onchange="setBudget(${i},this.value)"></div>${t.budget ? `<div class="muted" style="font-size:13px;margin-top:10px">Na osobu: <b style="color:var(--text)">${Math.round(t.budget / (t.pax || 1)).toLocaleString('cs')} Kč</b></div>` : ''}<div class="field" style="margin-top:14px"><label>Poznámky</label><textarea id="notes-${i}" rows="3" placeholder="Cokoliv k cestě…" onchange="setNotes(${i},this.value)">${esc(t.notes || '')}</textarea></div></div>
    </div>
    <div class="divider"></div>
    <button class="btn ghost block" style="color:var(--bad);border-color:rgba(251,113,133,.3)" onclick="delTrip(${i})">Smazat cestu</button>
  </div>`);
  $('#tripStay').onclick = () => openStay(city, t.start || '', t.end || '');
  const ics = $('#tripIcs'); if (ics) ics.onclick = () => exportPlan(i);
  // Poznámky se ukládají bez překreslení – odkaz do Google Kalendáře je musí mít aktuální.
  const gcal = $('#tripGcal'); if (gcal) $('#notes-' + i).addEventListener('change', () => { gcal.href = safeUrl(Ics.gcalUrl(planEvents(S.trips[i])[0])); });
  $('#tripShare').onclick = () => sharePlan(i);
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
function sharePlan(i) {
  const url = `${location.origin}${location.pathname}#plan=${PlanShare.encode(S.trips[i])}`;
  const manual = () => prompt('Zkopíruj odkaz na plán:', url);
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Odkaz na plán zkopírován – pošli ho komukoliv'), manual); else manual();
}
/** Sdílený plán z #plan=… (při startu a při změně adresy): náhled a import do plánovače. */
function importPlanFromHash() {
  if (!/^#plan=/.test(location.hash)) return false;
  let p = null;
  try { p = PlanShare.fromHash(location.hash); } catch (e) { toast('Odkaz na plán je poškozený', 'err'); }
  history.replaceState(null, '', '#planner');
  if (p) previewPlan(p);
  return true;
}
function previewPlan(p) {
  const c = p.iso ? byIso[p.iso] : null, days = Object.keys(p.days).sort(), acts = days.reduce((n, d) => n + p.days[d].length, 0);
  modalOpen(`<div class="modal-hero"><div class="mh-bg ${c && c.cost >= 4 ? 'warm' : ''}"></div><button class="modal-close" onclick="modalClose()">${ico('M18 6L6 18M6 6l12 12')}</button><div class="modal-hero-inner"><div style="font-size:40px;line-height:1">${c ? flag(p.iso) : '🧳'}</div><h2 style="font-size:24px;margin-top:4px;overflow-wrap:anywhere">${esc(p.name)}</h2><div style="opacity:.85;font-size:13px">Sdílený plán · ${esc(p.dest)}${p.start ? ' · ' + fmtDate(p.start) + (p.end && p.end !== p.start ? ' – ' + fmtDate(p.end) : '') : ''} · ${esc(p.pax)} os.</div></div></div>
  <div class="modal-body">
    <p class="muted" style="font-size:14px;margin-bottom:12px">Někdo ti poslal plán cesty. Zkontroluj ho a přidej si ho do plánovače – uloží se jen u tebe.</p>
    ${p.flight ? `<div class="note info" style="margin-bottom:12px">${planIco(p.flight)} <div>${esc(p.flight.replace(/^🚆\s*/u, ''))}</div></div>` : ''}
    ${days.slice(0, 6).map(d => `<div class="act"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${fmtDate(d)}</b> ${esc(p.days[d].join(' · '))}</span></div>`).join('')}
    <div class="faint" style="font-size:12.5px;margin-top:8px">${acts} ${acts === 1 ? 'aktivita' : acts >= 2 && acts <= 4 ? 'aktivity' : 'aktivit'}${days.length > 6 ? ` · ${days.length} dní s programem` : ''}${+p.budget ? ' · rozpočet ' + czk(+p.budget) : ''}${p.notes ? ' · s poznámkami' : ''}</div>
    <div class="row wrap" style="gap:8px;margin-top:16px"><button class="btn primary" id="planImport">Přidat do plánovače</button><button class="btn ghost" id="planSkip">Nepřidávat</button></div>
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
window.addAct = (i, d) => { const inp = $('#act-' + i + '-' + d); const v = inp.value.trim(); if (!v) return; S.trips[i].days[d] = S.trips[i].days[d] || []; S.trips[i].days[d].push(v); save(); openTrip(i); };
window.delAct = (i, d, ai) => { S.trips[i].days[d].splice(ai, 1); save(); openTrip(i); };
window.toggleCheck = (i, xi) => { S.trips[i].checklist[xi].done = !S.trips[i].checklist[xi].done; save(); openTrip(i); };
window.addCheck = i => { const inp = $('#newCheck-' + i); const v = inp.value.trim(); if (!v) return; S.trips[i].checklist.push({ t: v, done: false }); save(); openTrip(i); };
window.setBudget = (i, v) => { S.trips[i].budget = v; save(); openTrip(i); };
window.setNotes = (i, v) => { S.trips[i].notes = v; save(); };
window.delTrip = i => { if (confirm('Opravdu smazat tuto cestu?')) { S.trips.splice(i, 1); save(); modalClose(); renderPlanner(); toast('Cesta smazána'); } };
window.openStay = (city, start, end) => {
  const b = `https://www.booking.com/searchresults.cs.html?ss=${enc(city)}${start ? `&checkin=${start}&checkout=${end || ''}` : ''}&group_adults=2`;
  const a = `https://www.airbnb.cz/s/${enc(city)}/homes${start ? `?checkin=${start}&checkout=${end || ''}` : ''}`;
  const h = `https://www.hostelworld.com/s?q=${enc(city)}${start ? `&from=${start}&to=${end || ''}` : ''}`;
  modalOpen(`<div class="modal-hero"><div class="mh-bg"></div><button class="modal-close" onclick="modalClose()">${ico('M18 6L6 18M6 6l12 12')}</button><div class="modal-hero-inner"><h2 style="font-size:23px">Ubytování · ${esc(city)}</h2><div style="opacity:.85;font-size:13px">${start ? fmtDate(start) + (end ? ' – ' + fmtDate(end) : '') : 'vyber si termín na webu'}</div></div></div><div class="modal-body"><div class="grid" style="gap:12px">${provLink('Booking.com', 'Hotely, apartmány, penziony', b, '#003580', 'B.')}${provLink('Airbnb', 'Bydlení u místních', a, '#ff385c', 'A')}${provLink('Hostelworld', 'Hostely a levné lůžka', h, '#ff5a00', 'H')}</div><div class="note info" style="margin-top:16px">${ico('M12 16v-4M12 8h.01M12 2a10 10 0 100 20 10 10 0 000-20z')}<div>Odkazy otevřou hledání s předvyplněnou destinací (a termínem, pokud je v cestě zadaný).</div></div></div>`);
};

/* ================= INIT / EVENTS ================= */
function fillSelects() {
  $('#cCont').innerHTML = '<option value="">Všechny kontinenty</option>' + CONTS.map(c => `<option>${c}</option>`).join('');
  const m = new Date().getMonth() + 1;
  $('#rMonth').innerHTML = MNS_FULL.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n.charAt(0).toUpperCase() + n.slice(1)}</option>`).join('');
}
function wireEvents() {
  $$('#cVisited button').forEach(b => b.onclick = () => { $$('#cVisited button').forEach(x => x.classList.remove('on')); b.classList.add('on'); renderCountries(); });
  // Hledání země jen při psaní: „change“ po opuštění pole by mřížku překreslil uprostřed kliknutí na kartu (karta pod
  // myší zmizí a první klik by detail neotevřel).
  $('#cSearch').oninput = renderCountries;
  ['#cCont', '#cCost', '#cSort', '#cEntry'].forEach(s => { const el = $(s); el.oninput = renderCountries; el.onchange = renderCountries; });
  ['#rMonth', '#rVibe', '#rBudget', '#rSafe'].forEach(s => $(s).onchange = renderRecs);
  $('#refreshBtn').onclick = () => { S.weather = {}; S.fx = null; S.radar = null; save(); toast('Data aktualizována'); if ($('#modalBg').classList.contains('show') && curIso) openCountry(curIso); if (activeView === 'dashboard') renderDash(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modalClose(); });
  // Odkaz na plán vložený do už otevřené stránky (mění se jen #).
  window.addEventListener('hashchange', () => { if (importPlanFromHash()) go('planner', { noHash: true }); });
}
function renderTips() { $('#flightTips').innerHTML = TIPS.map(t => `<div class="tip"><div class="tn"><span>${t[0]}</span>${t[1]}</div><p>${t[2]}</p></div>`).join(''); }

async function boot() {
  applyTheme(); buildNav(); fillSelects(); wireEvents(); renderTips();
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
  const shared = window.Trip && Trip.importFromHash();
  const plan = !shared && importPlanFromHash();
  const v = shared ? 'trip' : plan ? 'planner' : location.hash.slice(1);
  go(NAV.some(n => n[0] === v) ? v : 'dashboard', { noHash: true });
}
document.addEventListener('DOMContentLoaded', boot);
