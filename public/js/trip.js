/* ATLAS – průvodce cestou: let → trasa pobytu → ubytování → auto → program → shrnutí.
   Stav je v S.trip (localStorage), cestu lze sdílet odkazem #trip=…
   Trasa pobytu: jedno místo celý pobyt (t.route chybí nebo mode 'single'), nebo víc míst
   (t.route.mode 'multi', t.route.bases [{ name, lat, lon, nights, stay, plan }] – každé má svůj hotel a program).
   Vlak nebo bus místo letu: t.overland { on, from, to, km, est, out, back, links } – když je on, nahrazuje let
   v termínech, ceně, shrnutí, plánovači i kalendáři (t.flight zůstává, jde se k němu vrátit). */
(function () {
  const STEPS = [
    ['flight', '✈️', 'Let'],
    ['route', '🗺️', 'Trasa'],
    ['stay', '🏨', 'Ubytování'],
    ['car', '🚗', 'Auto'],
    ['program', '📍', 'Program'],
    ['summary', '✅', 'Shrnutí'],
  ];
  const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
  const STAY_BADGES = {
    'best-value': ['🏆 Nejlepší poměr cena/hodnocení', 'good'],
    'cheapest-good': ['💚 Nejlevnější s hodnocením 8+', 'good'],
    cheapest: ['💰 Nejlevnější', 'info'],
    'top-rated': ['⭐ Nejlépe hodnocené', 'hot'],
  };
  let stayView = { sort: 'value', minRating: 0, maxNight: null, type: '' };
  let staysData = null;
  let carsData = null;
  const staysCache = new Map(); // nabídky ubytování podle dotazu (místo|termín|osoby) – přepínání míst trasy
  let staySlot = null; // kam se ukládá vybraný hotel: celý pobyt (t.stay), nebo jedno místo trasy (base.stay)
  let stayIdx = 0; // místo trasy v kroku Ubytování
  let progIdx = 0; // místo trasy v kroku Program
  let routeSeq = 0; // jen poslední odpověď návrhu/přepočtu trasy se vykreslí
  let routeMapPaint = null;
  const MAX_BASES = 6;
  const BASE_COLORS = ['#5b8cff', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#a855f7'];

  /* ---------- pomocné ---------- */
  const T = () => S.trip;
  const persist = () => save();
  const addDaysYmd = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return fmtYMD(d); };
  const dayLbl = ymd => { const d = new Date(ymd + 'T12:00:00'); return `${DOW[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`; };
  const hhmm = s => (s && s.length >= 16 ? s.slice(11, 16) : '');
  const arrHm = l => (l.arr && l.hasTime ? (l.arrEst ? '~' : '') + hhmm(l.arr) : '');
  const nightsTxt = n => n === 1 ? '1 noc' : n >= 2 && n <= 4 ? `${n} noci` : `${n} nocí`;
  const daysTxt = n => n === 1 ? '1 den' : n >= 2 && n <= 4 ? `${n} dny` : `${n} dní`;
  const minutesToHm = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;
  const stars = n => n ? '★'.repeat(Math.round(n)) : '';
  const ratingWord = r => r >= 9 ? 'Výjimečné' : r >= 8.5 ? 'Vynikající' : r >= 8 ? 'Velmi dobré' : r >= 7 ? 'Dobré' : r >= 6 ? 'Ucházející' : 'Slabé';

  /** Přílet tam: čas příletu, nebo odlet + délka letu, nebo poledne. */
  function arrivalAt(leg) {
    if (leg.arr && leg.hasTime) return leg.arr.slice(0, 16);
    if (leg.hasTime && leg.durationMin) {
      const d = new Date(leg.dep.slice(0, 16) + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() + leg.durationMin);
      return d.toISOString().slice(0, 16);
    }
    return `${leg.date}T12:00`;
  }
  function shiftDt(dt, minutes) {
    const d = new Date(dt.slice(0, 16) + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() + minutes);
    return d.toISOString().slice(0, 16);
  }

  /* ---------- vlak / bus místo letu ---------- */
  /** Jede se vlakem/busem (t.overland.on) místo vybraného letu? */
  const ovOn = t => Boolean(t && t.overland && t.overland.on && t.overland.out);
  /** Úsek po zemi ve tvaru letu pro termíny, program a auto (dep/arr místní čas; odhad bez času = jen den). */
  const groundLeg = g => ({
    date: g.date, dep: g.dep ? g.dep.slice(0, 16) + ':00' : `${g.date}T00:00:00`, arr: g.arr ? g.arr.slice(0, 16) + ':00' : null,
    hasTime: Boolean(g.dep && g.arr), durationMin: g.min || null, ground: true,
  });
  /** Cesta tam a zpět: let, nebo vlak/bus. */
  const outLeg = t => (ovOn(t) ? groundLeg(t.overland.out) : t.flight.out);
  const backLeg = t => (ovOn(t) ? (t.overland.back ? groundLeg(t.overland.back) : null) : t.flight.back);
  /** Letiště pro návrh trasy a auto: vlakem/busem se vrací z cílového města (letiště u něj), ne z letiště odletu letu. */
  const tripAirports = t => ({ arrival: t.flight.out.to, departure: backLeg(t) ? (ovOn(t) ? t.flight.out.to : t.flight.back.from) : null });
  const gKind = g => (g.kinds || []).map(k => ({ TRAIN: 'vlak', BUS: 'bus' })[k]).filter(Boolean).join(' + ') || 'vlak / bus';
  const gIco = g => ((g.kinds || []).length === 1 && g.kinds[0] === 'BUS' ? '🚌' : '🚆');
  const gTime = g => (g.dep ? `${hhmm(g.dep)} → ${hhmm(g.arr)}` : `~${minutesToHm(g.min || 0)}, čas ověř`);
  // Odkaz na jízdenku: RegioJet u vybraného spoje, jinak první odkaz (RegioJet, FlixBus, IDOS).
  const gUrl = (g, links) => ((links || []).find(l => l.id === (g.source === 'regiojet' ? 'regiojet' : l.id)) || {}).url || null;
  const gWho = g => (g.source === 'regiojet' ? 'RegioJet' : 'odhad');

  function stayDates(t) {
    // Přílet po půlnoci (do 5:00) → pokoj už od předchozího večera, ať je kde přespat.
    const o = outLeg(t), b = backLeg(t);
    const arr = arrivalAt(o);
    const checkin = o.hasTime && +arr.slice(11, 13) < 5 ? addDaysYmd(arr.slice(0, 10), -1) : arr.slice(0, 10);
    const checkout = b ? b.date : addDaysYmd(checkin, t.nightsOneWay || 3);
    return { checkin, checkout, nights: Math.max(0, Math.round((new Date(checkout) - new Date(checkin)) / 864e5)) };
  }

  /** Víc míst (aspoň 2) a pobyt aspoň 2 noci; jinak jedno místo celý pobyt jako dřív. */
  const isMulti = t => Boolean(t && t.route && t.route.mode === 'multi' && Array.isArray(t.route.bases) && t.route.bases.length >= 2 && stayDates(t).nights >= 2);
  /** Termíny míst trasy: navazují na sebe (check-out jednoho místa = check-in dalšího). */
  function baseDates(t) {
    let d = stayDates(t).checkin;
    return t.route.bases.map(b => { const checkin = d; d = addDaysYmd(d, b.nights); return { checkin, checkout: d, nights: b.nights }; });
  }
  /** Kolik nocí pobytu zbývá rozdělit (záporné = rozděleno víc, než pobyt trvá). */
  const nightsLeft = t => stayDates(t).nights - t.route.bases.reduce((s, b) => s + b.nights, 0);
  // Cena vybraného ubytování (hotel nebo ručně zadaná cena; „jen odkazy“ a „neřeším“ = 0).
  const stayCzk = s => s && (s.mode === 'pick' || s.mode === 'manual') ? Math.round(s.totalCzk || 0) : 0;
  const hotelName = s => s && (s.mode === 'pick' || s.mode === 'manual') ? s.name || '' : '';
  const trIcon = tr => tr === 'transit' ? '🚆' : '🚗';
  const legMin = (x, tr) => x ? (tr === 'transit' ? x.transitMin : x.carMin) : null;
  const legTxt = (x, tr) => tr === 'transit' ? `~${minutesToHm(x.transitMin)} vlakem / busem` : `${x.km} km · ~${minutesToHm(x.carMin)} autem`;
  const legUrl = (x, tr) => x && (tr === 'transit' ? x.transitUrl : x.carUrl);
  const nightWord = n => n === 1 ? 'noc' : n >= 2 && n <= 4 ? 'noci' : 'nocí';
  const distKm = (a, b) => {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  // Hledání ubytování na Booking.com (stejný formát jako odkazy ve zbytku aplikace) – místo bez načtených nabídek.
  const bookingSearch = (place, checkin, checkout, adults) => `https://www.booking.com/searchresults.cs.html?${new URLSearchParams({ ss: place, checkin, checkout, group_adults: String(adults), no_rooms: '1', lang: 'cs', selected_currency: 'CZK' })}`;
  // Odkaz z nabídek partnerů jen pro stejný termín (po změně nocí by vedl na jiná data); partneři
  // spolehlivěji poznají anglický název města („Bologna“) než český („Boloňa“).
  const baseSearchUrl = (t, b, d) => (b.searchUrl && b.searchUrl.includes(d.checkin) && b.searchUrl.includes(d.checkout) ? b.searchUrl
    : bookingSearch([b.nameEn || b.name, b.country].filter(Boolean).join(', '), d.checkin, d.checkout, t.adults));
  /** Program místa trasy, jen když platí pro jeho současný termín (po změně nocí nebo pořadí ho krok Program sestaví znovu). */
  function basePlan(t, i) {
    const p = t.route.bases[i].plan;
    if (!p || !Array.isArray(p.days)) return null;
    const w = baseProgram(t, i), s = p.span;
    return (s ? s.start === w.start && s.end === w.end : p.days.every(d => d.date >= w.start && d.date <= w.end)) ? p : null;
  }
  // Rezervace ubytování místa trasy patří k místu a termínu (ne k pořadí v trase).
  const stayBookId = (b, d) => `stay:${b.id}:${d.checkin}:${d.checkout}`;

  function costs(t) {
    const pax = t.adults;
    const ov = ovOn(t);
    // Vlak/bus místo letu: letenky, zavazadla ani doprava na letiště se nepočítají.
    const flights = ov ? 0 : Math.round(t.flight.flightCzk * pax);
    const ground = ov ? 0 : Math.round((t.flight.groundCzk || 0) * pax);
    const bags = ov ? 0 : Math.round((t.flight.bagCzk || 0) * pax); // odhad příplatku za zavazadla z hledání letů
    const overland = ov ? Math.round(((t.overland.out.czk || 0) + (t.overland.back ? t.overland.back.czk || 0 : 0)) * pax) : 0;
    const stay = isMulti(t) ? t.route.bases.reduce((s, b) => s + stayCzk(b.stay), 0)
      : t.stay && t.stay.mode !== 'skip' ? Math.round(t.stay.totalCzk || 0) : 0;
    const car = t.car && t.car.mode !== 'skip' ? Math.round(t.car.totalCzk || 0) : 0;
    const total = flights + bags + ground + overland + stay + car;
    return { flights, bags, ground, overland, stay, car, total, perPerson: Math.round(total / pax) };
  }

  /* ---------- start z výsledků hledání ---------- */
  function start({ t, g, result }) {
    const originsBy = Object.fromEntries((result.origins || []).map(o => [o.iata, o]));
    const dest = g ? g.dest : { label: t.out.to, cc: '', country: '', lat: null, lon: null };
    S.trip = {
      v: 1,
      created: Date.now(),
      adults: result.query.adults,
      bags: result.query.bags || 'none',
      flight: t,
      dest: { label: dest.label, country: dest.country, cc: dest.cc, lat: dest.lat, lon: dest.lon, id: dest.id },
      home: result.home ? result.home.label : null,
      // Cíl v dosahu vlaku/busu (odhad z hledání) → v kroku Let nabídka „Pojedu vlakem / busem“.
      groundRef: g && g.ground ? { ...g.ground } : null,
      overland: null,
      ground: {
        out: originsBy[t.out.from]?.ground || null,
        back: t.back ? (originsBy[t.back.to]?.ground || null) : null,
      },
      nightsOneWay: 3,
      stay: null,
      car: null,
      plan: null,
      booked: {},
      // Nejdřív shrnutí letu s živým ověřením ceny (Kiwi.com), pak ubytování.
      step: 'flight',
    };
    staysData = null; carsData = null;
    persist();
    go('trip');
  }

  function setStep(step) {
    if (!T()) return;
    T().step = step; persist(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- vykreslení ---------- */
  function render() {
    const root = $('#tripRoot'); if (!root) return;
    const t = T();
    if (!t) {
      root.innerHTML = `<div class="empty"><div class="ei">🧳</div><h2 style="font-size:20px;margin-bottom:6px">Zatím nesestavuješ žádnou cestu</h2>
        <p style="max-width:460px;margin:0 auto 18px">Najdi let a u výsledku klikni na <b>Vybrat a pokračovat</b>. Pak ti nabídnu ubytování, auto, program na místě a spočítám celkovou cenu.</p>
        <div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap"><button class="btn primary" id="tripGoSearch">✈️ Hledat lety</button><button class="btn" id="tripGoExplore">🗺️ Jen objevovat místa</button></div></div>`;
      $('#tripGoSearch').onclick = () => go('flights');
      $('#tripGoExplore').onclick = () => go('explore');
      return;
    }
    const idx = STEPS.findIndex(s => s[0] === t.step);
    root.innerHTML = `
      <div class="trip-head card">
        <div class="th-dest"><span class="th-flag">${flag(t.dest.cc)}</span><div><h2>${esc(t.dest.label)}</h2>
          <div class="muted" id="thSub">${headSub(t)}</div></div></div>
        <div class="th-total" id="thTotal">${headTotal(t)}</div>
      </div>
      <div class="stepbar">${STEPS.map((s, i) => `<button type="button" class="st ${i < idx ? 'done' : ''} ${i === idx ? 'on' : ''}" data-step="${s[0]}" ${s[0] === 'flight' ? 'data-flight="1"' : ''}><span>${i < idx ? '✓' : s[1]}</span>${s[2]}</button>`).join('<i></i>')}</div>
      <div id="tripStep"></div>`;
    $$('.stepbar [data-step]').forEach(b => b.onclick = () => setStep(b.dataset.step));
    if (t.step === 'flight') flightStep();
    else if (t.step === 'route') routeStep();
    else if (t.step === 'stay') stayStep();
    else if (t.step === 'car') carStep();
    else if (t.step === 'program') programStep();
    else summaryStep();
  }

  // Hlavička cesty: termín, trasa přes víc míst, cena celkem (při úpravě trasy se přepíše jen ona).
  function headSub(t) {
    const { checkin, checkout, nights } = stayDates(t);
    const route = isMulti(t) ? t.route.bases.map(b => `${b.name} (${b.nights})`).join(' → ') : '';
    return `${esc(t.dest.country || '')} · ${fmtDate(checkin)}–${fmtDate(checkout)} · ${backLeg(t) ? nightsTxt(nights) : 'jen tam'} · ${t.adults} os.${ovOn(t) ? ' · 🚆 vlakem/busem' : ''}${route ? `<div class="th-route">🧭 ${esc(route)}</div>` : ''}`;
  }
  function headTotal(t) {
    const c = costs(t);
    return `<div class="faint">Celkem zatím</div><div class="tt">${czk(c.total)}</div><div class="faint">${czk(c.perPerson)} na osobu</div>`;
  }
  function refreshHead() {
    const t = T(), s = $('#thSub'), c = $('#thTotal');
    if (s) s.innerHTML = headSub(t);
    if (c) c.innerHTML = headTotal(t);
  }

  function legLine(l, back) {
    return `<div class="tl-leg"><span class="cbadge" style="background:#5b8cff">${esc(l.carrier || '✈')}</span>
      <b>${dayLbl(l.date)}</b> ${l.from} ${hhmm(l.dep)} → ${l.to} ${arrHm(l)} <span class="faint">${esc(l.carrierName || '')}${l.flightNo ? ' · ' + esc(l.flightNo) : ''}</span>${back ? '' : ''}</div>`;
  }

  function flightStep() {
    const t = T();
    const host = $('#tripStep');
    $$('.stepbar .st').forEach(b => b.classList.toggle('on', b.dataset.step === 'flight'));
    if (ovOn(t)) return overlandStep();
    host.innerHTML = `<div class="card step-card"><h3>✈️ Vybraný let</h3>
      ${legLine(t.flight.out)}${t.flight.back ? legLine(t.flight.back, true) : ''}
      <div class="muted" style="margin-top:8px;font-size:13px">Letenky ${czk(t.flight.flightCzk)}/os.${t.flight.bagCzk ? ` + zavazadla ~${czk(t.flight.bagCzk)}/os.` : ''}${t.flight.groundCzk ? ` + doprava na letiště ${czk(t.flight.groundCzk)}/os.` : ''}</div>
      <div class="row wrap" style="margin-top:14px;gap:8px"><button class="btn" id="tfBack">↩ Vybrat jiný let</button><button class="btn" id="tfVerify">🔄 Ověřit živou cenu a porovnat aerolinky</button><button class="btn primary" id="tfNext">Pokračovat →</button></div>
      <div id="tfAlt"></div></div>${groundOffer(t)}`;
    $('#tfBack').onclick = () => go('flights');
    $('#tfNext').onclick = () => setStep('route');
    $('#tfVerify').onclick = () => verifyFlight();
    const os = $('#ovStart'); if (os) os.onclick = () => overlandPicker(t);
    // Při prvním zobrazení vybraného letu ověř cenu automaticky (jednou za cestu).
    if (!t.verifiedAt) { t.verifiedAt = Date.now(); persist(); verifyFlight({ auto: true }); }
  }

  /** Živé ceny všech aerolinek pro zvolená data a letiště (Kiwi.com). */
  async function verifyFlight({ auto = false } = {}) {
    const t = T();
    const f = t.flight;
    const host = $('#tfAlt');
    host.innerHTML = '<div class="loading-row"><span class="spin dark"></span> Ověřuji aktuální ceny u všech aerolinek…</div>';
    try {
      const qs = new URLSearchParams({ from: f.out.from, to: f.out.to, out: f.out.date, adults: t.adults });
      if (f.back) { qs.set('back', f.back.date); qs.set('backFrom', f.back.from); qs.set('backTo', f.back.to); }
      const r = await fetch('api/verify?' + qs);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (!j.available) { host.innerHTML = auto ? '' : '<div class="note info" style="margin-top:12px">ℹ️ <div>Živé ověření není v tomto režimu dostupné.</div></div>'; return; }
      if (!j.items.length) { host.innerHTML = `<div class="note warn" style="margin-top:12px">⚠️ <div>Pro tato data jsem živé nabídky nenašel${j.error ? ` (${esc(j.error)})` : ''}. Cenu ověř přímo u aerolinky.</div></div>`; return; }
      const cur = f.flightCzk;
      const openJaw = f.back && (f.back.from !== f.out.to || f.back.to !== f.out.from);
      host.innerHTML = `<div class="divider"></div><div class="muted" style="font-size:13px;margin-bottom:8px">Živé nabídky pro ${dayLbl(f.out.date)}${f.back ? ` – ${dayLbl(f.back.date)}` : ''} (${esc(f.out.from)} → ${esc(f.out.to)}${openJaw ? `, zpět ${esc(f.back.from)} → ${esc(f.back.to)} – dvě samostatné letenky` : ''}), cena na osobu:</div>
        <div class="alt-flights">${j.items.map((x, i) => `<div class="alt-f">
          <div><b>${esc(x.out.carrierName || '')}</b> <span class="faint">${x.out.stops ? `${x.out.stops}× přestup` : 'přímý'}${x.back ? ` · zpět ${esc(x.back.carrierName || '')}${x.back.stops ? ` (${x.back.stops}× přestup)` : ''}` : ''}</span>
            <div class="faint" style="font-size:12px">${hhmm(x.out.dep)}–${hhmm(x.out.arr)}${x.back ? ` · zpět ${hhmm(x.back.dep)}–${hhmm(x.back.arr)}` : ''}</div></div>
          <div class="alt-p ${x.flightCzk < cur ? 'good' : ''}">${czk(x.flightCzk)}</div>
          <div class="row" style="gap:6px"><button class="btn sm" data-alt="${i}">Použít</button>${x.bookUrl ? `<a class="btn sm ghost" href="${esc(safeUrl(x.bookUrl))}" target="_blank" rel="noopener">Kiwi ↗</a>`
            : [x.out.bookUrl ? `<a class="btn sm ghost" href="${esc(safeUrl(x.out.bookUrl))}" target="_blank" rel="noopener">tam ↗</a>` : '', x.back && x.back.bookUrl ? `<a class="btn sm ghost" href="${esc(safeUrl(x.back.bookUrl))}" target="_blank" rel="noopener">zpět ↗</a>` : ''].join('')}</div></div>`).join('')}</div>
        ${j.items.some(x => x.out.stops) ? '<div class="faint" style="font-size:11.5px;margin-top:6px">Lety s přestupem přes Kiwi.com bývají samostatné letenky – Kiwi ručí za návaznost svou garancí.</div>' : ''}`;
      $$('[data-alt]', host).forEach(b => b.onclick = () => {
        const x = j.items[+b.dataset.alt];
        t.flight = { ...x, groundCzk: t.flight.groundCzk, perPersonCzk: x.flightCzk + (t.flight.groundCzk || 0), totalCzk: (x.flightCzk + (t.flight.groundCzk || 0)) * t.adults };
        t.bags = 'none'; // u jiné nabídky příplatek za zavazadla neznáme
        toast('Let aktualizován');
        if (isMulti(t)) reconcileStays(t); // jiný čas příletu může posunout termíny míst trasy (upozorní vlastní zprávou)
        persist(); render();
      });
    } catch (e) {
      host.innerHTML = `<div class="note warn" style="margin-top:12px">⚠️ <div>${esc(e.message)}</div></div>`;
    }
  }

  /* ---------- vlak / bus místo letu (blízký cíl) ---------- */
  /** Nabídka pod vybraným letem: cíl v dosahu vlaku/busu (odhad z hledání). */
  function groundOffer(t) {
    const g = t.groundRef;
    if (!g || !g.q || !window.Ground) return '';
    return `<div class="card step-card gnd-offer${g.worth ? ' hot' : ''}"><div class="sc-head"><div><h3>🚆 Nebo vlakem / busem</h3>
      <div class="muted">${esc(g.from)} → ${esc(g.to)} · ~${esc(Ground.hm(g.min))} · od ~${czk(g.czk)}/os. jedním směrem <span class="b">odhad</span></div>
      ${g.reason ? `<div class="faint" style="font-size:12.5px;margin-top:4px">${esc(g.reason)}</div>` : ''}</div></div>
      <div class="row wrap" style="gap:8px"><button class="btn${g.worth ? ' primary' : ''}" id="ovStart">🚆 Pojedu vlakem / busem</button></div>
      <div id="ovPick"></div></div>`;
  }

  /** Cesta vlakem/busem místo letu: úseky, cena, odkazy; zpět k letu jedním kliknutím. */
  function overlandStep() {
    const t = T(), ov = t.overland, host = $('#tripStep'), f = t.flight;
    const leg = (g, what, a, b) => g ? `<div class="ov-leg"><span class="ov-ic">${gIco(g)}</span><div><b>${what}: ${esc(a)} → ${esc(b)}</b> · ${dayLbl(g.date)} ${esc(gTime(g))}
      <small>${esc([g.dep ? `${minutesToHm(g.min || 0)} · ${gKind(g)}, ${g.transfers ? `${g.transfers}× přestup` : 'přímý'}` : 'odhad – konkrétní spoj vyber v odkazu',
    g.fromStation ? `${g.fromStation} → ${g.toStation}` : '', `${g.source === 'regiojet' ? '' : 'od ~'}${czk(g.czk)}/os. (${gWho(g)})`].filter(Boolean).join(' · '))}</small></div></div>` : '';
    host.innerHTML = `<div class="card step-card"><h3>🚆 Cesta vlakem / busem</h3>
      <div class="muted" style="font-size:13px;margin-bottom:6px">~${+ov.km || 0} km vzdušnou čarou · místo letu ${esc(f.out.from)} → ${esc(f.out.to)}</div>
      ${leg(ov.out, 'Tam', ov.from.label, ov.to.label)}${leg(ov.back, 'Zpět', ov.to.label, ov.from.label)}
      <div class="ov-sum"><span>Vlak / bus celkem za ${t.adults} os.:</span><b>${czk(costs(t).overland)}</b>${[ov.out, ov.back].some(g => g && g.source !== 'regiojet') ? '<span class="b warn">odhad – cenu ověř v odkazu</span>' : '<span class="b good">ceny RegioJetu z hledání</span>'}</div>
      ${window.Ground ? Ground.linksHtml(ov.links && ov.links.out) : ''}
      <div class="faint" style="font-size:12px;margin-top:6px">Jízdenky ATLAS neprodává – kup je u dopravce (RegioJet, FlixBus, ČD přes IDOS). Ceny i volná místa se mohou změnit.</div>
      <div class="row wrap" style="margin-top:14px;gap:8px"><button class="btn" id="ovFly">✈️ Radši letět (${esc(f.out.from)} → ${esc(f.out.to)})</button>${ov.q ? '<button class="btn" id="ovEdit">🔄 Změnit spoje</button>' : ''}<button class="btn primary" id="tfNext">Pokračovat →</button></div>
      <div id="ovPick"></div></div>`;
    $('#ovFly').onclick = () => setOverland(t, null);
    const ed = $('#ovEdit'); if (ed) ed.onclick = () => overlandPicker(t);
    $('#tfNext').onclick = () => setStep('route');
  }

  /** Zapne/vypne vlak/bus (ov = nový t.overland, null = zpět k letu) a srovná termíny ubytování, programu a auta. */
  function setOverland(t, ov) {
    const before = JSON.stringify(stayDates(t));
    if (ov) t.overland = ov; else if (t.overland) t.overland.on = false;
    if (JSON.stringify(stayDates(t)) !== before) {
      staysData = null;
      t.plan = null; // program pro jiné dny neplatí
      if (isMulti(t)) reconcileStays(t);
      else if (t.stay && t.stay.mode === 'pick') { t.stay = null; toast('Termín pobytu se změnil – vyber ubytování znovu'); }
      else if (t.stay && t.stay.mode === 'manual') toast('Termín pobytu se změnil – zkontroluj cenu ubytování');
      if (t.car && t.car.mode !== 'skip') t.car = null;
    }
    toast(ov ? 'Pojedeš vlakem / busem – let se nepočítá' : 'Zpět k letu');
    persist(); render();
  }

  /** Výběr spojů tam a zpět (živě z RegioJetu, jinak odhad) – dny podle letu, lze změnit. */
  function overlandPicker(t) {
    const host = $('#ovPick'); if (!host || !window.Ground) return;
    const ov = t.overland, q = ov && ov.q ? ov.q : t.groundRef && t.groundRef.q;
    if (!q) return;
    const out0 = ov && ov.out ? ov.out.date : t.flight.out.date;
    const back0 = ov ? (ov.back ? ov.back.date : null) : t.flight.back ? t.flight.back.date : null;
    const today = fmtYMD(new Date());
    const st = { out: null, back: null, pick: { out: ov && ov.out ? ov.out.id : '', back: ov && ov.back ? ov.back.id : '' } };
    host.innerHTML = `<div class="divider"></div>
      <div class="ov-dates"><div class="field"><label for="ovOut">Tam</label><input class="input" type="date" id="ovOut" min="${today}" value="${esc(out0)}"></div>
        <label class="check"><input type="checkbox" id="ovRet" ${back0 ? 'checked' : ''}><span>i zpět vlakem / busem</span></label>
        <div class="field" id="ovBackF" ${back0 ? '' : 'hidden'}><label for="ovBack">Zpět</label><input class="input" type="date" id="ovBack" min="${today}" value="${esc(back0 || addDaysYmd(out0, t.nightsOneWay || 3))}"></div></div>
      <div class="gp-dir"><div class="gp-dh"><b>Tam</b><span class="faint" id="ovOutLbl"></span></div><div id="ovOutList"></div></div>
      <div class="gp-dir" id="ovBackBox" ${back0 ? '' : 'hidden'} style="margin-top:10px"><div class="gp-dh"><b>Zpět</b><span class="faint" id="ovBackLbl"></span></div><div id="ovBackList"></div></div>
      <div class="ov-sum" id="ovSum"></div>
      <div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn primary" id="ovUse" disabled>✓ Pojedu tímhle – místo letu</button><button class="btn ghost" id="ovCancel">Zrušit</button></div>`;
    const dateOf = w => $(w === 'out' ? '#ovOut' : '#ovBack').value;
    // vybraný spoj (jen ten, který jde koupit), jinak odhad pro daný den
    const pickedLeg = w => {
      const j = st[w]; if (!j || !j.est) return null;
      const id = st.pick[w];
      const x = id && j.live && j.live.ok && (j.live.items || []).find(i => i.id === id && i.bookable);
      return x ? Ground.legFromLive(x, dateOf(w)) : Ground.legFromEst(dateOf(w), j.est);
    };
    const sum = () => {
      const legs = ['out', ...($('#ovRet').checked ? ['back'] : [])].map(pickedLeg);
      const ok = legs.every(Boolean);
      $('#ovUse').disabled = !ok;
      $('#ovSum').innerHTML = ok ? `<span>Za ${t.adults} os.:</span><b>${czk(legs.reduce((a, l) => a + (l.czk || 0), 0) * t.adults)}</b>${legs.some(l => l.source !== 'regiojet') ? '<span class="b warn">odhad</span>' : '<span class="b good">RegioJet – živé ceny</span>'}` : '<span class="faint">Načítám spoje…</span>';
    };
    const load = async w => {
      const date = dateOf(w), list = $(w === 'out' ? '#ovOutList' : '#ovBackList');
      if (!date || !list) return;
      st[w] = null; sum();
      list.innerHTML = '<div class="loading-row"><span class="spin dark"></span> Hledám spoje…</div>';
      const qq = w === 'out' ? q : { from: q.to, to: q.from };
      try {
        const j = await Ground.load({ from: qq.from, to: qq.to, date, adults: t.adults });
        if (!list.isConnected || date !== dateOf(w)) return;
        if (!j.est) { list.innerHTML = `<div class="note info">ℹ️ <div>${esc(j.why || 'Sem vlak ani bus nedává smysl.')}</div></div>`; return; }
        st[w] = j;
        // dřív vybraný spoj platí jen pro stejný den
        if (st.pick[w] && !(j.live && j.live.ok && (j.live.items || []).some(i => i.id === st.pick[w] && i.bookable))) st.pick[w] = '';
        $(w === 'out' ? '#ovOutLbl' : '#ovBackLbl').textContent = `${j.from.label} → ${j.to.label} · ${dayLbl(date)}`;
        list.innerHTML = Ground.liveHtml(j, { sel: 'ov-' + w, picked: st.pick[w] || null, max: 20 });
        $$(`input[name="ov-${w}"]`, list).forEach(r => r.onchange = () => { st.pick[w] = r.value; sum(); });
        sum();
      } catch (e) {
        if (list.isConnected) list.innerHTML = `<div class="note warn">⚠️ <div>${esc(e.message)}</div></div>`;
      }
    };
    $('#ovOut').onchange = () => {
      if ($('#ovRet').checked && dateOf('back') < dateOf('out')) { $('#ovBack').value = dateOf('out'); load('back'); }
      load('out');
    };
    $('#ovBack').onchange = () => { if (dateOf('back') < dateOf('out')) { $('#ovBack').value = dateOf('out'); toast('Návrat nemůže být před cestou tam', 'err'); } load('back'); };
    $('#ovRet').onchange = () => {
      const on = $('#ovRet').checked;
      $('#ovBackF').hidden = !on; $('#ovBackBox').hidden = !on;
      if (on && !st.back) load('back'); else sum();
    };
    $('#ovCancel').onclick = () => { host.innerHTML = ''; };
    $('#ovUse').onclick = () => {
      const ret = $('#ovRet').checked, out = pickedLeg('out'), back = ret ? pickedLeg('back') : null;
      if (!out || (ret && !back)) return;
      const j = st.out, lk = x => (x && x.links || []).map(l => ({ id: l.id, name: l.name, url: l.url }));
      setOverland(t, { on: true, q, km: j.km, est: j.est, from: j.from, to: j.to, out, back, links: { out: lk(j), back: back ? lk(st.back) : [] } });
    };
    load('out');
    if (back0) load('back');
    sum();
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- trasa pobytu: jedno místo, nebo víc míst ---------- */
  async function postJson(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  // Počet nocí u letu jen tam (u zpátečního ho dávají data letů) – v kroku Trasa i Ubytování.
  const oneWayField = t => !backLeg(t) ? `<div class="field" style="max-width:220px;margin-bottom:12px"><label>Kolik nocí zůstaneš?</label><input class="input" type="number" min="1" max="30" id="owNights" value="${t.nightsOneWay}"></div>` : '';
  function wireOneWay(t) {
    const ow = $('#owNights');
    if (!ow) return;
    ow.onchange = () => {
      t.nightsOneWay = Math.min(30, Math.max(1, +ow.value || 3));
      staysData = null;
      t.plan = null; // program pro jiný počet dní neplatí
      if (t.route && t.route.mode === 'multi') {
        if (t.route.bases.length && nightsLeft(t) !== 0) toast('Počet nocí se změnil – uprav jejich rozdělení v trase');
      } else if (t.stay && t.stay.mode === 'pick') {
        // Cena vybraného hotelu platila pro původní počet nocí → vyber znovu (ruční cenu nech, ale upozorni).
        t.stay = null; toast('Počet nocí se změnil – vyber ubytování znovu');
      } else if (t.stay && t.stay.mode === 'manual') toast('Zkontroluj cenu ubytování pro nový počet nocí');
      persist(); render();
    };
  }

  function routeStep() {
    const t = T();
    const host = $('#tripStep');
    const { checkin, checkout, nights } = stayDates(t);
    const canMulti = nights >= 2;
    const multi = canMulti && Boolean(t.route && t.route.mode === 'multi');
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🗺️ Trasa pobytu</h3><div class="muted">${dayLbl(checkin)} – ${dayLbl(checkout)} · ${nightsTxt(nights)} · zůstaneš na jednom místě, nebo poznáš víc míst?</div></div></div>
      ${oneWayField(t)}
      <div class="route-choice">
        <button type="button" class="rc-opt ${multi ? '' : 'on'}" data-rmode="single" aria-pressed="${!multi}"><span class="rc-ic">🏨</span><span><b>Jedno místo celý pobyt</b><small>${esc(t.dest.label.replace(/ \(.*\)$/, ''))} · jeden hotel na ${nightsTxt(nights)}, výlety do okolí naplánuješ v programu.</small></span></button>
        <button type="button" class="rc-opt ${multi ? 'on' : ''}" data-rmode="multi" aria-pressed="${multi}" ${canMulti ? '' : 'disabled'}><span class="rc-ic">🧭</span><span><b>Víc míst</b><small>${canMulti ? 'Navrhnu trasu přes 2–4 zajímavá města s přejezdy a rozdělím noci – pak ke každému místu vybereš hotel.' : 'Na jednu noc není co rozdělit.'}</small></span></button>
      </div>
      <div id="routeBody"></div>
    </div>`;
    wireOneWay(t);
    $$('[data-rmode]', host).forEach(b => b.onclick = () => setRouteMode(b.dataset.rmode));
    if (multi) return routeEditor();
    $('#routeBody').innerHTML = '<div class="row wrap" style="gap:8px"><button class="btn primary" id="rtNext">Pokračovat k ubytování →</button></div>';
    $('#rtNext').onclick = () => setStep('stay');
  }

  function setRouteMode(mode) {
    const t = T();
    if (mode === 'multi') {
      if (stayDates(t).nights < 2) return;
      if (!t.route || !Array.isArray(t.route.bases)) t.route = { mode: 'multi', transport: 'car', bases: [], transfers: [], legs: {}, exclude: [], candidates: [], notes: [] };
      t.route.mode = 'multi';
    } else if (t.route) t.route.mode = 'single';
    persist(); render();
  }

  const routeReady = t => t.route.bases.length >= 2 && nightsLeft(t) === 0;

  function routeEditor() {
    const t = T(), r = t.route;
    $('#routeBody').innerHTML = `<div class="route-tools" id="rtTools"></div>
      <div class="ex-layout route-layout"><div><div id="rtList"></div>
        <div class="route-add"><label for="rtQ">➕ Přidat místo do trasy</label>
          <div style="position:relative"><input class="input" id="rtQ" placeholder="Město nebo místo – napiš název…" autocomplete="off"><div class="pi-dd" id="rtDd" hidden></div></div>
          <div class="rt-cands" id="rtCands"></div></div></div>
        <div class="ex-map route-map" id="rtMap"></div></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn primary" id="rtNext" disabled>Pokračovat k ubytování →</button><button class="btn ghost" id="rtSingle">Přeskočit – zůstanu na jednom místě</button></div>`;
    routeMapPaint = null;
    if (!(window.Places && Places.routeMap)) $('#rtMap').remove();
    wireRouteSearch();
    $('#rtNext').onclick = () => {
      if (!routeReady(t)) return;
      stayIdx = Math.max(0, t.route.bases.findIndex(b => !b.stay));
      progIdx = 0;
      setStep('stay');
    };
    $('#rtSingle').onclick = () => { t.route.mode = 'single'; persist(); setStep('stay'); };
    if (!r.bases.length) return suggestRoute(r.want);
    paintRoute();
    // Sdílená cesta nebo přerušený přepočet: přejezdy chybí → dopočítat.
    if (!Array.isArray(r.transfers) || r.transfers.length !== r.bases.length - 1) refreshTransfers();
  }

  function baseRow(t, b, i, d, left) {
    const n = t.route.bases.length;
    const why = [b.reason, b.highlights && b.highlights.length ? '👀 ' + b.highlights.join(', ') : ''].filter(Boolean).join(' · ');
    return `<div class="rb">
      <span class="rb-n" style="background:${BASE_COLORS[i % BASE_COLORS.length]}">${i + 1}</span>
      <div class="rb-main"><div class="rb-name">${esc(b.name)}</div>
        <div class="rb-dates">${dayLbl(d.checkin)} – ${dayLbl(d.checkout)}${hotelName(b.stay) ? ` · 🏨 ${esc(hotelName(b.stay))}` : ''}</div>
        ${why ? `<div class="rb-why">${esc(why)}</div>` : ''}</div>
      <div class="rb-nights"><button type="button" data-nm="${i}" ${b.nights <= 1 ? 'disabled' : ''} title="O noc méně" aria-label="O noc méně">−</button><span><b>${b.nights}</b> ${nightWord(b.nights)}</span><button type="button" data-np="${i}" ${left <= 0 || b.nights >= 30 ? 'disabled' : ''} title="O noc víc" aria-label="O noc víc">+</button></div>
      <div class="rb-acts"><button type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Posunout dřív" aria-label="Posunout dřív">↑</button><button type="button" data-down="${i}" ${i === n - 1 ? 'disabled' : ''} title="Posunout později" aria-label="Posunout později">↓</button><button type="button" data-del="${i}" ${n <= 1 ? 'disabled' : ''} title="Odebrat z trasy" aria-label="Odebrat z trasy">✕</button></div>
    </div>`;
  }

  function transferRow(x, a, b, tr, date) {
    const url = legUrl(x, tr);
    return `<div class="rt-tr ${x && x.long ? 'long' : ''}"><span class="rt-ic">${trIcon(tr)}</span><div>
      ${x ? `<b>${legTxt(x, tr)}</b> <span class="faint">(odhad; ${tr === 'transit' ? `autem ~${minutesToHm(x.carMin)}` : `vlakem ~${minutesToHm(x.transitMin)}`})</span>` : '<span class="faint">počítám přejezd…</span>'}
      <div class="faint">${dayLbl(date)} · ${esc(a.name)} → ${esc(b.name)}${url ? ` · <a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${tr === 'transit' ? 'spoje' : 'trasa'} v Google Maps ↗</a>` : ''}</div>
      ${x && x.long ? '<div class="rt-warn">⚠️ Dlouhý přejezd – zvaž místo mezi nimi.</div>' : ''}</div></div>`;
  }

  function paintRoute() {
    const t = T(), list = $('#rtList');
    if (!list || !t || !t.route || t.step !== 'route') return;
    const r = t.route;
    const tr = r.transport === 'transit' ? 'transit' : 'car';
    const total = stayDates(t).nights;
    const left = nightsLeft(t);
    const dates = baseDates(t);
    const f = t.flight, n = r.bases.length;
    $('#rtTools').innerHTML = `<div class="seg">${[['car', '🚗 Autem'], ['transit', '🚆 Vlakem a busem']].map(([v, l]) => `<button type="button" data-tr="${v}" class="${tr === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="seg" title="Kolik míst navrhnout">${[2, 3, 4].filter(k => k <= total).map(k => `<button type="button" data-cnt="${k}" class="${r.want === k ? 'on' : ''}">${k} místa</button>`).join('')}</div>
      <button type="button" class="btn sm ghost" id="rtAgain">↻ Navrhnout znovu</button>`;
    const legRow = (x, ic, html) => `<div class="rt-leg"><span class="rt-ic">${ic}</span><div>${html}${x && x.km >= 1 ? `<div class="faint">${legTxt(x, tr)} (odhad)${legUrl(x, tr) ? ` · <a href="${esc(safeUrl(legUrl(x, tr)))}" target="_blank" rel="noopener">${tr === 'transit' ? 'spoje' : 'trasa'} ↗</a>` : ''}</div>` : ''}</div></div>`;
    const legs = r.legs || {};
    const ov = ovOn(t), o = outLeg(t), bk = backLeg(t);
    const sum = n < 2 ? ['warn', 'Přidej aspoň jedno další místo (níže), nebo zůstaň na jednom místě.']
      : left === 0 ? ['ok', `✓ Všech ${nightsTxt(total)} rozděleno mezi ${n} ${n <= 4 ? 'místa' : 'míst'}`]
        : left > 0 ? ['warn', `Rozděleno ${total - left} z ${total} nocí – zbývá rozdělit ${nightsTxt(left)} (tlačítko +)`]
          : ['warn', `Rozděleno o ${nightsTxt(-left)} víc, než trvá pobyt (${nightsTxt(total)}) – ${r.bases.some(b => b.nights > 1) ? 'uber tlačítkem −' : 'odeber místo tlačítkem ✕'}`];
    list.innerHTML = `${r.demo ? '<div class="faint" style="font-size:12px;margin-bottom:8px">⚠️ demo data – vymyšlená města</div>' : ''}
      <div class="route-list">
        ${ov ? legRow(null, '🚆', `Příjezd vlakem / busem <b>${esc(t.overland.to.label)}</b> · ${dayLbl(o.date)}${o.hasTime ? ' ' + hhmm(o.arr) : ''}`)
          : legRow(legs.arrival, '✈️', `Přílet <b>${esc(f.out.to)}</b> · ${dayLbl(f.out.date)}${arrHm(f.out) ? ' ' + arrHm(f.out) : ''}`)}
        ${r.bases.map((b, i) => baseRow(t, b, i, dates[i], left) + (i < n - 1 ? transferRow(r.transfers && r.transfers[i], b, r.bases[i + 1], tr, dates[i].checkout) : '')).join('')}
        ${ov ? (bk ? legRow(null, '🚆', `Odjezd vlakem / busem <b>${esc(t.overland.to.label)}</b> · ${dayLbl(bk.date)}${bk.hasTime ? ' ' + hhmm(bk.dep) : ''}`) : '')
          : f.back ? legRow(legs.departure, '🛫', `Odlet <b>${esc(f.back.from)}</b> · ${dayLbl(f.back.date)}${f.back.hasTime ? ' ' + hhmm(f.back.dep) : ''}`) : ''}
      </div>
      <div class="route-sum ${sum[0]}">${esc(sum[1])}</div>
      ${(r.notes || []).map(x => `<div class="note warn" style="margin-top:8px">⚠️ <div>${esc(x)}</div></div>`).join('')}`;
    const cands = (r.candidates || []).filter(c => !r.bases.some(b => b.id === c.id || distKm(b, c) < 5)).slice(0, 8);
    $('#rtCands').innerHTML = cands.length ? `<span class="faint">Tipy:</span>${cands.map(c => `<button type="button" class="fchip" data-cand="${esc(c.id)}" title="${esc([c.reason, (c.highlights || []).join(', ')].filter(Boolean).join(' · '))}">+ ${esc(c.name)}</button>`).join('')}` : '';
    $$('[data-tr]').forEach(b => b.onclick = () => {
      if (r.transport === b.dataset.tr) return;
      r.transport = b.dataset.tr; persist(); paintRoute(); refreshTransfers({ keep: true });
    });
    $$('[data-cnt]').forEach(b => b.onclick = () => suggestRoute(+b.dataset.cnt));
    $('#rtAgain').onclick = () => suggestRoute(r.want);
    $$('[data-nm]', list).forEach(b => b.onclick = () => setNights(+b.dataset.nm, -1));
    $$('[data-np]', list).forEach(b => b.onclick = () => setNights(+b.dataset.np, 1));
    $$('[data-up]', list).forEach(b => b.onclick = () => moveBase(+b.dataset.up, -1));
    $$('[data-down]', list).forEach(b => b.onclick = () => moveBase(+b.dataset.down, 1));
    $$('[data-del]', list).forEach(b => b.onclick = () => removeBase(+b.dataset.del));
    $$('[data-cand]').forEach(b => b.onclick = () => { const c = (r.candidates || []).find(x => x.id === b.dataset.cand); if (c) addBase(c); });
    const nx = $('#rtNext'); if (nx) nx.disabled = !routeReady(t);
    refreshHead();
    paintRouteMap(t);
  }

  // Mapa trasy: letiště příletu (střed), očíslovaná místa, letiště odletu, přejezdy čárkovaně.
  function paintRouteMap(t) {
    const r = t.route, el = $('#rtMap');
    if (!el || !r.bases.length || !(window.Places && Places.routeMap)) return;
    const a = r.arrival || r.bases[0];
    if (!routeMapPaint || routeMapPaint.el !== el) {
      routeMapPaint = Places.routeMap(el, { lat: a.lat, lon: a.lon, label: r.arrival ? `✈️ Přílet ${r.arrival.iata}` : r.bases[0].name, geo: true });
      routeMapPaint.el = el;
    }
    const pts = r.bases.map((b, i) => ({ id: 'b' + i, lat: b.lat, lon: b.lon, color: BASE_COLORS[i % BASE_COLORS.length], num: i + 1, big: true, label: `${i + 1}. ${b.name} · ${nightsTxt(b.nights)}`, q: [b.name, b.country].filter(Boolean).join(', ') }));
    const dep = backLeg(t) && r.departure;
    if (dep && (!r.arrival || dep.iata !== r.arrival.iata)) pts.push({ id: 'dep', lat: dep.lat, lon: dep.lon, color: '#a855f7', label: `✈️ Odlet ${dep.iata}`, q: `${dep.iata} airport` });
    routeMapPaint(pts, [r.arrival, ...r.bases, dep].filter(Boolean).map(p => [p.lon, p.lat]));
  }

  /** Po změně trasy: hotel s cenou na jiné noci neplatí (vyber znovu), ruční cenu jen přesuň na nový termín. */
  function reconcileStays(t) {
    const dates = baseDates(t);
    const nightsOf = s => (s.checkin && s.checkout ? Math.round((new Date(s.checkout) - new Date(s.checkin)) / 864e5) : null);
    let dropped = 0, manual = 0;
    t.route.bases.forEach((b, i) => {
      const s = b.stay, d = dates[i];
      if (!s || (s.checkin === d.checkin && s.checkout === d.checkout)) return;
      if (s.mode === 'pick') { b.stay = null; dropped++; return; }
      // Ruční cena platila pro původní počet nocí (jako u jednoho místa: nech ji, ale upozorni).
      if (s.mode === 'manual' && nightsOf(s) !== d.nights) manual++;
      s.checkin = d.checkin; s.checkout = d.checkout;
    });
    const msg = [dropped ? (dropped === 1 ? 'Termín jednoho místa se změnil – hotel tam vyber znovu' : `Termín ${dropped} míst se změnil – hotely tam vyber znovu`) : '',
      manual ? 'Zkontroluj ručně zadanou cenu ubytování – změnil se počet nocí' : ''].filter(Boolean).join('. ');
    if (msg) toast(msg);
  }

  function setNights(i, delta) {
    const t = T(), b = t.route.bases[i];
    if (!b) return;
    const n = b.nights + delta;
    if (n < 1 || n > 30 || (delta > 0 && nightsLeft(t) <= 0)) return;
    b.nights = n;
    reconcileStays(t); persist(); paintRoute();
  }

  function moveBase(i, dir) {
    const t = T(), bs = t.route.bases, j = i + dir;
    if (j < 0 || j >= bs.length) return;
    [bs[i], bs[j]] = [bs[j], bs[i]];
    reconcileStays(t); persist(); refreshTransfers();
  }

  function removeBase(i) {
    const t = T(), r = t.route;
    if (r.bases.length <= 1 || !r.bases[i]) return;
    const [b] = r.bases.splice(i, 1);
    // Noci odebraného místa připadnou předchozímu (u prvního dalšímu), ať součet dál sedí.
    const heir = r.bases[Math.max(0, i - 1)];
    heir.nights = Math.min(30, heir.nights + b.nights);
    r.exclude = [...new Set([...(r.exclude || []), b.id])].slice(-30);
    if (!(r.candidates || []).some(c => c.id === b.id)) r.candidates = [pickCand(b), ...(r.candidates || [])].slice(0, 12);
    reconcileStays(t); persist(); toast(`Odebráno: ${b.name}`); refreshTransfers();
  }

  const pickCand = c => ({ id: String(c.id), name: c.name, nameEn: c.nameEn || '', lat: c.lat, lon: c.lon, cc: c.cc || '', country: c.country || '', reason: c.reason || '', highlights: (c.highlights || []).slice(0, 3) });

  function addBase(c) {
    const t = T(), r = t.route, total = stayDates(t).nights;
    if (r.bases.length >= Math.min(MAX_BASES, total)) return toast(r.bases.length >= MAX_BASES ? `Víc než ${MAX_BASES} míst trasa mít nemůže` : 'Každé místo potřebuje aspoň 1 noc – víc míst se do pobytu nevejde', 'err');
    if (r.bases.some(b => distKm(b, c) < 5)) return toast(`${c.name} už v trase je`, 'err');
    if (nightsLeft(t) <= 0) {
      // Noc pro nové místo: od místa s nejvíc nocemi.
      const donor = r.bases.reduce((m, b) => (b.nights > m.nights ? b : m), r.bases[0]);
      if (!donor || donor.nights <= 1) return toast('Každé místo má jen 1 noc – nejdřív nějaké odeber', 'err');
      donor.nights--;
    }
    // Vložit tam, kde nejméně prodlouží cestu od letiště příletu k letišti odletu – město příletu
    // zůstane první a město u letiště odletu poslední (přesunout je jde šipkami).
    const n = r.bases.length;
    const from = n && r.bases[0].anchor === 'arrival' ? 1 : 0, to = n > from && r.bases[n - 1].anchor === 'departure' ? n - 1 : n;
    let at = to, best = Infinity;
    for (let i = from; i <= to; i++) {
      const a = i ? r.bases[i - 1] : r.arrival, z = i < r.bases.length ? r.bases[i] : (backLeg(t) ? r.departure : null);
      const add = (a ? distKm(a, c) : 0) + (z ? distKm(c, z) : 0) - (a && z ? distKm(a, z) : 0);
      if (add < best - 1e-9) { best = add; at = i; }
    }
    r.bases.splice(at, 0, { ...pickCand(c), anchor: null, nights: 1, stay: null, plan: null });
    r.exclude = (r.exclude || []).filter(x => x !== c.id);
    reconcileStays(t); persist(); toast(`Přidáno: ${c.name}`); refreshTransfers();
  }

  async function suggestRoute(count) {
    const t = T(), r = t.route;
    const my = ++routeSeq;
    const list = $('#rtList');
    if (list) list.innerHTML = '<div class="loading-row"><span class="spin dark"></span> Hledám zajímavá města v okolí a skládám trasu… (poprvé to může trvat i půl minuty)</div>';
    try {
      const j = await postJson('api/stayplan', {
        ...tripAirports(t), nights: stayDates(t).nights,
        transport: r.transport || 'car', count: count || null, exclude: r.exclude || [],
        city: t.cityCenter ? { lat: t.cityCenter.lat, lon: t.cityCenter.lon } : null,
      });
      if (my !== routeSeq || T() !== t) return;
      // Hotel a program zůstanou u místa, které v trase zůstalo (se stejným termínem – viz reconcileStays).
      // Režim se tu nemění: kdo mezitím zvolil jedno místo (nebo Přeskočit), u něj zůstane.
      const prev = new Map(r.bases.map(b => [b.id, b]));
      r.bases = j.bases.map(b => {
        const p = prev.get(b.id);
        return { ...pickCand(b), anchor: b.anchor || null, nights: b.nights, stay: p ? p.stay : null, plan: p ? p.plan : null, searchUrl: p ? p.searchUrl : null };
      });
      Object.assign(r, { transfers: j.transfers, legs: j.legs, arrival: j.arrival, departure: j.departure, candidates: (j.candidates || []).map(pickCand), notes: j.notes || [], want: j.want, demo: Boolean(j.demo) });
      reconcileStays(t); persist(); paintRoute();
    } catch (e) {
      if (my !== routeSeq || T() !== t || !$('#rtList')) return;
      $('#rtList').innerHTML = `<div class="note warn">⚠️ <div>${esc(e.message)}</div></div>
        <div class="row wrap" style="gap:8px;margin:10px 0"><button class="btn" id="rtRetry">↻ Zkusit znovu</button>${!r.bases.length && t.dest.lat != null ? '<button class="btn ghost" id="rtManual">Sestavit trasu ručně</button>' : ''}</div>`;
      $('#rtRetry').onclick = () => suggestRoute(count);
      const m = $('#rtManual');
      if (m) m.onclick = () => {
        // Ručně: začni městem příletu a přidávej místa vyhledáním.
        const c = t.cityCenter || t.dest;
        r.bases = [{ ...pickCand({ id: 'dest', name: t.dest.label.replace(/ \(.*\)$/, ''), lat: c.lat, lon: c.lon, cc: t.dest.cc, country: t.dest.country }), anchor: 'arrival', nights: stayDates(t).nights, stay: null, plan: null }];
        r.transfers = []; r.notes = [];
        persist(); paintRoute(); refreshTransfers();
      };
    }
  }

  async function refreshTransfers({ keep = false } = {}) {
    const t = T(), r = t.route;
    const my = ++routeSeq;
    if (!keep) r.transfers = [];
    paintRoute();
    if (!r.bases.length) return;
    try {
      const j = await postJson('api/stayplan', { ...tripAirports(t), transport: r.transport || 'car', bases: r.bases.map(b => ({ name: b.name, lat: b.lat, lon: b.lon, cc: b.cc || '' })) });
      if (my !== routeSeq || T() !== t) return;
      Object.assign(r, { transfers: j.transfers, legs: j.legs, notes: j.notes || [], arrival: j.arrival, departure: j.departure });
      persist(); paintRoute();
    } catch (e) {
      if (my === routeSeq) toast(`Přejezdy se nepodařilo spočítat: ${e.message}`, 'err');
    }
  }

  // Přidání místa vyhledáním (stejné našeptávání jako v Objevuj; místa v zemi cíle první).
  function wireRouteSearch() {
    const q = $('#rtQ'), dd = $('#rtDd');
    if (!q) return;
    let ctl = null, sugs = [], act = 0, tm;
    const pick = s => {
      dd.hidden = true; q.value = '';
      const cc = String(s.cc || '').toUpperCase();
      addBase({ id: `geo:${(+s.lat).toFixed(4)},${(+s.lon).toFixed(4)}`, name: String(s.label || '').replace(/ \(.*\)$/, ''), lat: +s.lat, lon: +s.lon, cc: /^[A-Z]{2}$/.test(cc) ? cc : '', country: (typeof byIso !== 'undefined' && byIso[cc] && byIso[cc].cs) || '' });
    };
    const show = () => {
      dd.innerHTML = sugs.length ? sugs.map((s, i) => `<div class="pi-opt ${i === act ? 'on' : ''}" data-i="${i}"><span class="pi-flag">${esc(s.flag || '📍')}</span><span class="pi-t"><b>${esc(s.label)}</b><small>${esc(s.sub || '')}</small></span></div>`).join('') : '<div class="pi-empty">Nic nenalezeno</div>';
      dd.hidden = false;
      $$('.pi-opt', dd).forEach(o => o.onmousedown = e => { e.preventDefault(); pick(sugs[+o.dataset.i]); });
    };
    q.oninput = () => {
      clearTimeout(tm);
      if (q.value.trim().length < 2) { dd.hidden = true; return; }
      tm = setTimeout(async () => {
        if (ctl) ctl.abort();
        ctl = new AbortController();
        try {
          const r = await fetch(`api/geocode?q=${enc(q.value.trim())}&cc=${enc(T().dest.cc || '')}`, { signal: ctl.signal });
          const j = await r.json();
          sugs = (j.items || []).filter(s => Number.isFinite(+s.lat) && Number.isFinite(+s.lon)).slice(0, 8); act = 0; show();
        } catch (e) { if (e.name !== 'AbortError') { sugs = []; show(); } }
      }, 220);
    };
    q.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!sugs.length) return; e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + sugs.length) % sugs.length; show(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (sugs[act] && !dd.hidden) pick(sugs[act]); }
      else if (e.key === 'Escape') dd.hidden = true;
    };
    q.onblur = () => setTimeout(() => { dd.hidden = true; }, 150);
  }

  /* ---------- ubytování ---------- */
  /** Nabídky ubytování (api/stays) pro místo a termín – v paměti, ať přepínání míst trasy nenačítá znovu. */
  async function loadStays(key, params) {
    if (staysCache.has(key)) return staysCache.get(key);
    const r = await fetch('api/stays?' + new URLSearchParams(params));
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    const d = { key, ...j };
    staysCache.set(key, d);
    return d;
  }

  async function stayStep() {
    const t = T();
    if (isMulti(t)) return stayStepMulti();
    staySlot = { get: () => T().stay, set: v => { T().stay = v; }, next: () => setStep('car') };
    const host = $('#tripStep');
    const { checkin, checkout, nights } = stayDates(t);
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🏨 Ubytování v ${esc(t.dest.label)}</h3><div class="muted">${dayLbl(checkin)} – ${dayLbl(checkout)} · ${nightsTxt(nights)} · ${t.adults} ${t.adults === 1 ? 'host' : 'hosté'}</div></div>
      ${t.stay ? `<div class="chosen">Vybráno: <b>${esc(t.stay.name || (t.stay.mode === 'skip' ? 'bez ubytování' : ''))}</b>${t.stay.totalCzk ? ` · ${czk(t.stay.totalCzk)}` : ''}</div>` : ''}</div>
      ${oneWayField(t)}
      <div id="stayBody"><div class="loading-row"><span class="spin dark"></span> Hledám ubytování s nejlepším poměrem ceny a hodnocení…</div></div>
      <div class="divider"></div>
      <div class="manual-row"><div class="muted" style="font-size:13px">Vybral sis jinde? Zadej celkovou cenu a pokračuj:</div>
        <input class="input" id="manName" placeholder="Název (nepovinné)" value="${t.stay && t.stay.mode === 'manual' ? esc(t.stay.name) : ''}">
        <input class="input" id="manPrice" type="number" min="0" step="100" placeholder="Cena celkem v Kč" value="${t.stay && t.stay.mode === 'manual' ? t.stay.totalCzk : ''}">
        <button class="btn" id="manSave">Uložit</button></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn ghost" id="staySkip">Ubytování neřeším →</button>${t.stay ? '<button class="btn primary" id="stayNext">Pokračovat →</button>' : ''}</div>
    </div>`;
    wireOneWay(t);
    $('#manSave').onclick = () => {
      const price = +$('#manPrice').value;
      if (!(price > 0)) return toast('Zadej cenu ubytování', 'err');
      t.stay = { mode: 'manual', name: $('#manName').value.trim() || 'Vlastní ubytování', totalCzk: price };
      persist(); setStep('car');
    };
    $('#staySkip').onclick = () => { t.stay = { mode: 'skip', name: 'bez ubytování', totalCzk: 0 }; persist(); setStep('car'); };
    const nx = $('#stayNext'); if (nx) nx.onclick = () => setStep('car');

    if (nights < 1) {
      $('#stayBody').innerHTML = '<div class="note info">ℹ️ <div>Zpáteční let je ještě týž den – ubytování není potřeba. Klikni na <b>Ubytování neřeším</b>.</div></div>';
      return;
    }
    const key = `${t.dest.label}|${checkin}|${checkout}|${t.adults}`;
    if (!staysData || staysData.key !== key) {
      try {
        const qs = { city: t.dest.label.replace(/ \(.*\)$/, ''), country: t.dest.country || '', cc: t.dest.cc || '', iata: t.flight.out.to, checkin, checkout, adults: t.adults };
        if (t.dest.lat != null) Object.assign(qs, { lat: t.dest.lat, lon: t.dest.lon });
        staysData = await loadStays(key, qs);
      } catch (e) {
        if (T() === t && t.step === 'stay') $('#stayBody').innerHTML = `<div class="note warn">⚠️ <div>Nabídky se nepodařilo načíst: ${esc(e.message)}</div></div>`;
        return;
      }
    }
    // Mezitím se změnil počet nocí (novější dotaz) nebo krok → tuhle odpověď nevykresluj.
    if (T() !== t || t.step !== 'stay' || !staysData || staysData.key !== key) return;
    renderStays();
  }

  // Stav ubytování místa trasy (v záložkách a ve shrnutí).
  const stayState = s => !s ? 'nevybráno' : s.mode === 'links' ? 'jen odkazy' : s.mode === 'skip' ? 'neřeším' : s.name || 'vlastní ubytování';
  const baseTabs = (r, i, done, attr) => `<div class="base-tabs">${r.bases.map((x, j) => `<button type="button" class="bt ${j === i ? 'on' : ''} ${done(x, j) ? 'done' : ''}" ${attr}="${j}"><span class="bt-n" style="background:${BASE_COLORS[j % BASE_COLORS.length]}">${done(x, j) ? '✓' : j + 1}</span><span class="bt-t"><b>${esc(x.name)}</b><small>${esc(attr === 'data-bt' ? stayState(x.stay) : nightsTxt(x.nights))}</small></span></button>`).join('')}</div>`;

  function goStayBase(i) { stayIdx = i; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  // Po výběru: další místo bez ubytování (nejdřív za tímto), jinak dál k autu.
  function nextStayBase(i) {
    const bs = T().route.bases;
    const after = bs.findIndex((x, k) => k > i && !x.stay);
    const any = after >= 0 ? after : bs.findIndex(x => !x.stay);
    if (any >= 0 && any !== i) goStayBase(any); else setStep('car');
  }

  /** Ubytování pro každé místo trasy zvlášť (vlastní termín, nabídky z api/stays, nebo jen odkazy). */
  async function stayStepMulti() {
    const t = T(), r = t.route, host = $('#tripStep');
    const total = stayDates(t).nights;
    if (nightsLeft(t) !== 0) {
      host.innerHTML = `<div class="card step-card"><h3>🏨 Ubytování na trase</h3><div class="note warn" style="margin-top:10px">⚠️ <div>Noci v trase nesedí s délkou pobytu (${nightsTxt(total)}) – uprav jejich rozdělení v kroku Trasa.</div></div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="stayRoute">← Upravit trasu</button></div></div>`;
      $('#stayRoute').onclick = () => setStep('route');
      return;
    }
    const dates = baseDates(t);
    if (!(stayIdx >= 0 && stayIdx < r.bases.length)) stayIdx = 0;
    const i = stayIdx, b = r.bases[i], d = dates[i], n = r.bases.length;
    staySlot = { get: () => b.stay, set: v => { b.stay = { ...v, checkin: d.checkin, checkout: d.checkout }; }, next: () => nextStayBase(i) };
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🏨 Ubytování na trase</h3><div class="muted">${n} ${n <= 4 ? 'místa' : 'míst'} · ${nightsTxt(total)} · ${t.adults} ${t.adults === 1 ? 'host' : 'hosté'} · vybráno ${r.bases.filter(x => x.stay).length} z ${n}</div></div></div>
      ${baseTabs(r, i, x => Boolean(x.stay), 'data-bt')}
      <div class="sc-head" style="margin-top:14px"><div><h3 style="font-size:15.5px">${i + 1}. ${esc(b.name)}</h3><div class="muted">${dayLbl(d.checkin)} – ${dayLbl(d.checkout)} · ${nightsTxt(d.nights)}</div></div>
        ${b.stay ? `<div class="chosen">Vybráno: <b>${esc(stayState(b.stay))}</b>${stayCzk(b.stay) ? ` · ${czk(stayCzk(b.stay))}` : ''}</div>` : ''}</div>
      <div id="stayBody"><div class="loading-row"><span class="spin dark"></span> Hledám ubytování s nejlepším poměrem ceny a hodnocení…</div></div>
      <div class="divider"></div>
      <div class="manual-row"><div class="muted" style="font-size:13px">Vybral sis jinde? Zadej celkovou cenu za ${nightsTxt(d.nights)}:</div>
        <input class="input" id="manName" placeholder="Název (nepovinné)" value="${b.stay && b.stay.mode === 'manual' ? esc(b.stay.name) : ''}">
        <input class="input" id="manPrice" type="number" min="0" step="100" placeholder="Cena celkem v Kč" value="${b.stay && b.stay.mode === 'manual' ? b.stay.totalCzk : ''}">
        <button class="btn" id="manSave">Uložit</button></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn ghost" id="stayLinks">Vyberu později – jen odkazy →</button><button class="btn primary" id="stayNext">${i < n - 1 ? `Další místo: ${esc(r.bases[i + 1].name)} →` : 'Pokračovat k autu →'}</button></div>
    </div>`;
    $$('[data-bt]', host).forEach(x => x.onclick = () => goStayBase(+x.dataset.bt));
    $('#manSave').onclick = () => {
      const price = +$('#manPrice').value;
      if (!(price > 0)) return toast('Zadej cenu ubytování', 'err');
      staySlot.set({ mode: 'manual', name: $('#manName').value.trim() || 'Vlastní ubytování', totalCzk: price });
      persist(); staySlot.next();
    };
    $('#stayLinks').onclick = () => { staySlot.set({ mode: 'links', name: '', totalCzk: 0 }); persist(); staySlot.next(); };
    $('#stayNext').onclick = () => (i < n - 1 ? goStayBase(i + 1) : setStep('car'));
    const params = { city: b.name, country: b.country || '', cc: b.cc || '', checkin: d.checkin, checkout: d.checkout, adults: t.adults, lat: b.lat, lon: b.lon };
    if (b.nameEn) params.cityEn = b.nameEn; // odkazy na Booking, Airbnb… (český název „Boloňa“ by nenašly)
    // Město příletu/odletu: letiště pomůže najít střed metropole a zemi.
    if (b.anchor === 'arrival') Object.assign(params, { iata: t.flight.out.to, country: b.country || t.dest.country || '', cc: b.cc || t.dest.cc || '' });
    else if (b.anchor === 'departure' && backLeg(t)) params.iata = tripAirports(t).departure;
    const key = `${b.name}|${(+b.lat).toFixed(3)},${(+b.lon).toFixed(3)}|${d.checkin}|${d.checkout}|${t.adults}`;
    let data;
    try {
      data = await loadStays(key, params);
    } catch (e) {
      if (T() === t && t.step === 'stay' && stayIdx === i) $('#stayBody').innerHTML = `<div class="note warn">⚠️ <div>Nabídky se nepodařilo načíst: ${esc(e.message)}</div></div>${linkGrid([{ name: 'Booking.com', note: 'hledání na tvoje data', url: baseSearchUrl(t, b, d) }], '#003580')}`;
      return;
    }
    if (T() !== t || t.step !== 'stay' || stayIdx !== i) return;
    staysData = data;
    // Odkaz na hledání pro shrnutí (místo bez vybraného hotelu = „vyber přes odkaz“).
    if (data.links && data.links[0] && b.searchUrl !== data.links[0].url) { b.searchUrl = data.links[0].url; persist(); }
    renderStays();
  }

  // Odkazy na partnery; affiliate odkazy viditelně označené (zákon o ochraně spotřebitele, rel=sponsored).
  const SPONSOR_NOTE = '<div class="faint" style="font-size:11.5px;margin-top:6px">Odkazy označené „reklama“ jsou partnerské (affiliate): při rezervaci přes ně může ATLAS dostat provizi. Cenu pro tebe to nezvyšuje a pořadí nabídek to neovlivňuje.</div>';
  function linkGrid(links, color) {
    const html = links.map(l => `<a class="result-link" href="${esc(safeUrl(l.url))}" target="_blank" rel="${l.sponsored ? 'sponsored nofollow noopener' : 'noopener'}"><div class="lg" style="background:${color}">${esc(l.name.slice(0, 2))}</div><div><div class="rl-t">${esc(l.name)}${l.sponsored ? ' <span class="ad-tag">reklama</span>' : ''}</div><div class="rl-s">${esc(l.note)}</div></div><div class="go">↗</div></a>`).join('');
    return `<div class="link-grid">${html}</div>${links.some(l => l.sponsored) ? SPONSOR_NOTE : ''}`;
  }

  function stayCard(h, i) {
    const cur = staySlot && staySlot.get();
    const chosen = cur && cur.mode === 'pick' && cur.id === h.id;
    const badges = (h.badges || []).map(b => STAY_BADGES[b] ? `<span class="b ${STAY_BADGES[b][1]}">${STAY_BADGES[b][0]}</span>` : '').join('');
    return `<div class="stay ${chosen ? 'chosen' : ''}">
      <div class="st-img" ${h.photo ? `style="background-image:url('${esc(cssUrl(h.photo))}')"` : ''}>${h.photo ? '' : '🏨'}</div>
      <div class="st-main">
        <div class="st-name">${esc(h.name)} <span class="st-stars">${stars(h.stars)}</span></div>
        <div class="faint" style="font-size:12.5px">${esc([h.typeLabel, h.address, h.distanceKm != null ? `${h.distanceKm.toFixed(1)} km od centra` : ''].filter(Boolean).join(' · '))}</div>
        ${h.rating != null ? `<div class="st-rate-inline"><b>${h.rating.toFixed(1)}</b> ${ratingWord(h.rating)}${h.reviews ? ` · ${h.reviews.toLocaleString('cs')} recenzí` : ''}</div>` : ''}
        <div class="st-badges">${badges}${h.freeCancellation ? '<span class="b good">zdarma storno</span>' : ''}${h.breakfast ? '<span class="b">snídaně</span>' : ''}</div>
      </div>
      <div class="st-rating">${h.rating != null ? `<div class="rt">${h.rating.toFixed(1)}</div><div class="faint">${ratingWord(h.rating)}${h.reviews ? `<br>${h.reviews.toLocaleString('cs')} recenzí` : ''}</div>` : '<div class="faint">bez hodnocení</div>'}</div>
      <div class="st-price">${h.priceTotalCzk ? `<div class="pp">${czk(h.priceTotalCzk)}</div><div class="faint">celkem · ${czk(h.pricePerNightCzk)}/noc</div>` : '<div class="faint">cena na webu</div>'}
        <button class="btn sm primary" data-pick="${i}">${chosen ? '✓ Vybráno' : 'Vybrat'}</button>
        ${h.bookUrl ? `<a class="linkbtn" href="${esc(safeUrl(h.bookUrl))}" target="_blank" rel="noopener">detail ↗</a>` : ''}</div>
    </div>`;
  }

  function renderStays() {
    const host = $('#stayBody'); if (!host || !staysData) return;
    const d = staysData;
    let items = d.items.filter(h => (h.rating ?? 0) >= stayView.minRating || stayView.minRating === 0)
      .filter(h => !stayView.maxNight || (h.pricePerNightCzk && h.pricePerNightCzk <= stayView.maxNight))
      .filter(h => !stayView.type || h.type === stayView.type);
    const sorters = {
      value: (a, b) => (b.value ?? -1) - (a.value ?? -1),
      price: (a, b) => (a.priceTotalCzk || Infinity) - (b.priceTotalCzk || Infinity),
      rating: (a, b) => (b.adjRating ?? -1) - (a.adjRating ?? -1),
      dist: (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
    };
    items = [...items].sort(sorters[stayView.sort]);
    const types = [...new Set(d.items.map(h => h.type).filter(Boolean))];
    const links = linkGrid(d.links, '#003580');
    const errs = d.providers.filter(p => !p.ok).map(p => `${esc(p.name)}: ${esc(p.error)}`).join(' · ');
    if (!d.items.length) {
      host.innerHTML = `<div class="note info">ℹ️ <div>${d.providers.length ? 'Pro tento termín nemám přímé nabídky' : 'Přímé nabídky ubytování zatím nejsou zapnuté'} – otevři si hledání u partnerů, je už <b>předvyplněné na tvoje data a seřazené podle hodnocení a ceny</b>. Až si vybereš, zadej cenu níže.${errs ? `<br><span class="faint">${errs}</span>` : ''}${!d.providers.length && window.showSetupGuide ? ` <a href="#" id="stayGuide">Jak zapnout hotely s cenou a hodnocením přímo tady →</a>` : ''}</div></div>${links}`;
      const g = $('#stayGuide'); if (g) g.onclick = e => { e.preventDefault(); window.showSetupGuide('guideStays'); };
      return;
    }
    const testNote = d.providers.some(p => p.ok && p.test && p.count) ? `<div class="note warn" style="margin-bottom:10px">⚠️ <div><b>Ukázková / testovací nabídka</b> – hotely a ceny nejsou skutečné (demo režim nebo testovací klíč LiteAPI). Skutečné ceny ověř přes odkazy na partnery dole.</div></div>` : '';
    host.innerHTML = `${testNote}<div class="stay-tools">
        <select id="staySort">${[['value', '🏆 Nejlepší poměr cena/hodnocení'], ['price', '💰 Nejlevnější'], ['rating', '⭐ Nejlépe hodnocené'], ['dist', '📍 Nejblíž centru']].map(o => `<option value="${o[0]}" ${stayView.sort === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
        <div class="seg" id="stayMin">${[[0, 'vše'], [7, '7+'], [8, '8+'], [9, '9+']].map(o => `<button type="button" data-v="${o[0]}" class="${stayView.minRating === o[0] ? 'on' : ''}">${o[1]}</button>`).join('')}</div>
        ${types.length > 1 ? `<select id="stayType"><option value="">všechny typy</option>${types.map(x => `<option ${stayView.type === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
        <input class="input" id="stayMax" type="number" min="0" step="100" placeholder="max Kč/noc" value="${stayView.maxNight || ''}" style="max-width:130px">
        <span class="faint" style="font-size:12px">${items.length} z ${d.items.length} nabídek</span>
      </div>
      <div class="stay-list">${items.map((h) => stayCard(h, d.items.indexOf(h))).join('') || '<div class="empty">Filtrům nic neodpovídá.</div>'}</div>
      ${errs ? `<div class="faint" style="font-size:12px;margin-top:6px">${errs}</div>` : ''}
      <details class="more" style="margin-top:12px"><summary>Další nabídky u partnerů</summary>${links}</details>`;
    $('#staySort').onchange = e => { stayView.sort = e.target.value; renderStays(); };
    $$('#stayMin button').forEach(b => b.onclick = () => { stayView.minRating = +b.dataset.v; renderStays(); });
    const ty = $('#stayType'); if (ty) ty.onchange = e => { stayView.type = e.target.value; renderStays(); };
    $('#stayMax').onchange = e => { stayView.maxNight = +e.target.value || null; renderStays(); };
    $$('[data-pick]', host).forEach(b => b.onclick = () => {
      const h = d.items[+b.dataset.pick];
      staySlot.set({ mode: 'pick', id: h.id, name: h.name, totalCzk: h.priceTotalCzk || 0, url: h.bookUrl, lat: h.lat, lon: h.lon, rating: h.rating, provider: h.provider });
      persist(); staySlot.next();
    });
  }

  /* ---------- auto ---------- */
  function carDefaults(t) {
    const o = outLeg(t), b = backLeg(t), ap = tripAirports(t);
    const pickupAt = shiftDt(arrivalAt(o), o.ground ? 30 : 45);
    let dropAt;
    // před odletem 2 h na letišti, před vlakem/busem stačí hodina
    if (b) dropAt = b.hasTime ? shiftDt(b.dep.slice(0, 16), b.ground ? -60 : -120) : `${b.date}T10:00`;
    else dropAt = `${stayDates(t).checkout}T10:00`;
    return { pickup: ap.arrival, dropoff: ap.departure || ap.arrival, from: pickupAt, to: dropAt };
  }

  /** Trasa přes víc míst: autem vyzvednutí na letišti příletu a vrácení na letišti odletu, vlakem spoje mezi místy. */
  function routeCarNote(t) {
    if (!isMulti(t)) return '';
    const r = t.route, f = t.flight;
    if (r.transport === 'transit') {
      const dates = baseDates(t);
      const rows = r.bases.slice(1).map((b, i) => {
        const x = r.transfers && r.transfers[i];
        return `<div>${dayLbl(dates[i].checkout)} · ${esc(r.bases[i].name)} → ${esc(b.name)}${x ? ` · ~${minutesToHm(x.transitMin)} (odhad) · <a href="${esc(safeUrl(x.transitUrl))}" target="_blank" rel="noopener">spoje v Google Maps ↗</a>` : ''}</div>`;
      }).join('');
      return `<div class="note info" style="margin-bottom:12px">🚆 <div><b>Mezi místy pojedeš vlakem nebo autobusem</b> – auto nepotřebuješ (půjčit si ho můžeš i jen na pár dní).
        <div class="rt-trains">${rows}</div><div style="font-size:12px">Čas je odhad – skutečné spoje ukáže odkaz; jízdenky koupíš u národního dopravce nebo na nádraží.</div></div></div>`;
    }
    const km = [r.legs && r.legs.arrival, ...(r.transfers || []), r.legs && r.legs.departure].reduce((s, x) => s + (x ? x.km : 0), 0);
    const pu = f.out.to, back = f.back ? f.back.from : null;
    if (ovOn(t)) {
      return `<div class="note info" style="margin-bottom:12px">🧭 <div><b>Trasa autem: ${esc(r.bases.map(b => b.name).join(' → '))}</b>${km ? ` · přejezdy celkem ~${km} km` : ''}.<br>
        Přijedeš vlakem / busem – auto si půjč na místě (třeba na letišti <b>${esc(pu)}</b> u ${esc(t.overland.to.label)}) a vrať ho tam před cestou zpět.</div></div>`;
    }
    return `<div class="note info" style="margin-bottom:12px">🧭 <div><b>Trasa autem: ${esc(r.bases.map(b => b.name).join(' → '))}</b>${km ? ` · přejezdy celkem ~${km} km` : ''}.<br>
      ${back ? `Auto vyzvedni na letišti příletu <b>${esc(pu)}</b> a vrať na letišti odletu <b>${esc(back)}</b>${back !== pu ? ' – jednosměrný pronájem (one-way) bývá dražší, příplatek za vrácení jinde ověř ve srovnávači' : ''}.` : `Auto vyzvedni na letišti příletu <b>${esc(pu)}</b>; místo vrácení zadej podle toho, kde cestu končíš.`}</div></div>`;
  }

  async function carStep() {
    const t = T();
    const host = $('#tripStep');
    const def = t.car && t.car.mode !== 'skip' && t.car.from ? t.car : carDefaults(t);
    const days = Math.max(1, Math.ceil((new Date(def.to + ':00Z') - new Date(def.from + ':00Z')) / 864e5));
    const byTrain = isMulti(t) && t.route.transport === 'transit';
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🚗 Auto na místě</h3><div class="muted">${ovOn(t) ? `Půjčovny bývají na letišti u cíle (${esc(t.flight.out.to)}) – vyzvednutí po příjezdu, vrácení před cestou zpět.` : 'Vyzvednutí na letišti po příletu, vrácení před odletem.'}</div></div>
      ${t.car ? `<div class="chosen">${t.car.mode === 'skip' ? 'Bez auta' : `Auto: <b>${czk(t.car.totalCzk)}</b>`}</div>` : ''}</div>
      ${routeCarNote(t)}
      <div class="car-form">
        <div class="field"><label>Vyzvednutí</label><div class="row" style="gap:6px"><input class="input" id="carPu" value="${esc(def.pickup)}" maxlength="3" style="max-width:80px;text-transform:uppercase"><input class="input" type="datetime-local" id="carFrom" value="${def.from}"></div></div>
        <div class="field"><label>Vrácení</label><div class="row" style="gap:6px"><input class="input" id="carDo" value="${esc(def.dropoff)}" maxlength="3" style="max-width:80px;text-transform:uppercase"><input class="input" type="datetime-local" id="carTo" value="${def.to}"></div></div>
        <div class="field"><label>Věk řidiče</label><input class="input" type="number" id="carAge" min="18" max="99" value="${def.age || 30}" style="max-width:90px"></div>
      </div>
      <div class="faint" style="font-size:12.5px;margin:6px 0 12px">${daysTxt(days)} pronájmu${def.pickup !== def.dropoff ? ` · vrácení na jiném letišti (${esc(def.dropoff)}) může stát příplatek` : ''}</div>
      <div id="carBody"><div class="loading-row"><span class="spin dark"></span> Připravuji nabídky…</div></div>
      <div class="divider"></div>
      <div class="manual-row"><div class="muted" style="font-size:13px">Vybral sis auto? Zadej celkovou cenu:</div>
        <input class="input" id="carPrice" type="number" min="0" step="100" placeholder="Cena celkem v Kč" value="${t.car && t.car.mode === 'manual' ? t.car.totalCzk : ''}">
        <button class="btn" id="carSave">Uložit</button></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn ${byTrain && !t.car ? 'primary' : 'ghost'}" id="carSkip">Auto nepotřebuji →</button>${t.car ? '<button class="btn primary" id="carNext">Pokračovat →</button>' : ''}</div>
    </div>`;
    const read = () => ({ pickup: $('#carPu').value.trim().toUpperCase(), dropoff: $('#carDo').value.trim().toUpperCase(), from: $('#carFrom').value, to: $('#carTo').value, age: +$('#carAge').value || 30 });
    const load = async () => {
      const q = read();
      if (!/^[A-Z]{3}$/.test(q.pickup) || !q.from || !q.to) return;
      try {
        const r = await fetch('api/cars?' + new URLSearchParams({ pickup: q.pickup, dropoff: q.dropoff || q.pickup, from: q.from, to: q.to, age: q.age }));
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        carsData = j;
        $('#carBody').innerHTML = `<div class="muted" style="font-size:13px;margin-bottom:8px">Srovnávače půjčoven – <b>předvyplněné na letiště ${esc(j.query.pickupName || q.pickup)} a tvoje časy</b>:</div>
          ${linkGrid(j.links, '#ff690f')}`;
      } catch (e) {
        $('#carBody').innerHTML = `<div class="note warn">⚠️ <div>${esc(e.message)}</div></div>`;
      }
    };
    ['#carPu', '#carDo', '#carFrom', '#carTo', '#carAge'].forEach(s => $(s).onchange = load);
    $('#carSave').onclick = () => {
      const price = +$('#carPrice').value;
      if (!(price > 0)) return toast('Zadej cenu auta', 'err');
      t.car = { mode: 'manual', totalCzk: price, ...read() };
      persist(); setStep('program');
    };
    $('#carSkip').onclick = () => { t.car = { mode: 'skip', totalCzk: 0 }; persist(); setStep('program'); };
    const nx = $('#carNext'); if (nx) nx.onclick = () => setStep('program');
    load();
  }

  /* ---------- program ---------- */
  // Čas „HH:MM“ + minuty (zaokrouhleno na čtvrthodiny nahoru, nejpozději 19:00).
  const addHm = (hm, min) => {
    const m = Math.min(19 * 60, Math.ceil((+hm.slice(0, 2) * 60 + +hm.slice(3, 5) + min) / 15) * 15);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const CHECKOUT_HM = '11:00'; // den přejezdu: dopoledne ještě na místě, odjezd kolem 11:00

  /** Termín programu místa trasy: den příletu / přejezdu a čas příjezdu, den odjezdu a odlet. */
  function baseProgram(t, i) {
    const r = t.route, d = baseDates(t)[i], last = i === r.bases.length - 1, b = backLeg(t);
    const arr = arrivalAt(outLeg(t));
    return {
      start: i === 0 ? arr.slice(0, 10) : d.checkin, end: d.checkout,
      arrivalTime: i === 0 ? arr.slice(11, 16) : addHm(CHECKOUT_HM, legMin(r.transfers && r.transfers[i - 1], r.transport) || 120),
      // dayCapacities končí program 3 h před „odletem“ → odjezd v 11:00 = program do 11:00
      departureTime: last ? (b && b.hasTime ? b.dep.slice(11, 16) : null) : addHm(CHECKOUT_HM, 180),
    };
  }

  /** Program pro každé místo trasy zvlášť (záložky), dny podle termínu místa. */
  function programStepMulti() {
    const t = T(), r = t.route, host = $('#tripStep'), n = r.bases.length;
    if (nightsLeft(t) !== 0) {
      // Bez sedících nocí by program posledního místa přesahoval odlet (krok lze otevřít i z lišty kroků).
      host.innerHTML = `<div class="card step-card"><h3>📍 Program na trase</h3><div class="note warn" style="margin-top:10px">⚠️ <div>Noci v trase nesedí s délkou pobytu (${nightsTxt(stayDates(t).nights)}) – uprav jejich rozdělení v kroku Trasa.</div></div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="progRoute">← Upravit trasu</button></div></div>`;
      $('#progRoute').onclick = () => setStep('route');
      return;
    }
    if (!(progIdx >= 0 && progIdx < n)) progIdx = 0;
    const i = progIdx, b = r.bases[i], last = i === n - 1;
    const p = baseProgram(t, i);
    const center = b.stay && b.stay.mode === 'pick' && b.stay.lat != null ? { lat: b.stay.lat, lon: b.stay.lon, label: b.stay.name } : { lat: b.lat, lon: b.lon, label: b.name };
    host.innerHTML = `<div class="card step-card"><div class="sc-head"><div><h3>📍 Program na trase</h3>
      <div class="muted">Každé místo má vlastní program na dny, kdy tam budeš${b.stay && b.stay.mode === 'pick' ? ' (kolem ubytování)' : ''} – můžeš ho upravit.</div></div></div>
      ${baseTabs(r, i, (x, j) => Boolean(basePlan(t, j)), 'data-pt')}
      <h3 class="base-h" style="font-size:15.5px;margin:14px 0 2px">${i + 1}. ${esc(b.name)} <span class="muted" style="font-weight:600;font-size:13px">· ${dayLbl(p.start)} – ${dayLbl(p.end)}${i ? ` · příjezd ~${p.arrivalTime}` : ''}${last ? '' : ` · odjezd ~${CHECKOUT_HM}`}</span></h3>
      <div id="tripPlaces"></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn primary" id="progNext">${last ? 'Pokračovat ke shrnutí →' : `Další místo: ${esc(r.bases[i + 1].name)} →`}</button>${last ? '' : '<button class="btn ghost" id="progSum">Rovnou ke shrnutí</button>'}</div></div>`;
    const goBase = j => { progIdx = j; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    $$('[data-pt]', host).forEach(x => x.onclick = () => goBase(+x.dataset.pt));
    $('#progNext').onclick = () => (last ? setStep('summary') : goBase(i + 1));
    const ps = $('#progSum'); if (ps) ps.onclick = () => setStep('summary');
    if (window.Places) {
      Places.renderPlanner($('#tripPlaces'), {
        lat: center.lat, lon: center.lon, label: center.label, city: b.name, country: b.country || t.dest.country || '', cc: b.cc || t.dest.cc,
        ...p, plan: b.plan, onPlan: plan => { b.plan = plan; persist(); },
      });
    }
  }

  async function programStep() {
    const t = T();
    if (isMulti(t)) return programStepMulti();
    const host = $('#tripStep');
    const { checkin, checkout, nights } = stayDates(t);
    // Program začíná dnem příletu (při příletu po půlnoci je check-in o den dřív, program ne).
    const progStart = arrivalAt(outLeg(t)).slice(0, 10);
    const progDays = Math.max(1, Math.round((new Date(checkout) - new Date(progStart)) / 864e5) + 1);
    let center = t.stay && t.stay.lat != null ? { lat: t.stay.lat, lon: t.stay.lon, label: t.stay.name } : null;
    if (!center) {
      // Střed města (souřadnice cíle bývají poloha letiště, které může být daleko od centra).
      if (!t.cityCenter) {
        try {
          const r = await fetch(`api/geocode?q=${enc(t.dest.label.replace(/ \(.*\)$/, '').replace(/-.*$/, ''))}&cc=${enc(t.dest.cc || '')}`);
          const j = await r.json();
          const hit = (j.items || []).find(x => !t.dest.cc || x.cc === t.dest.cc);
          if (hit) { t.cityCenter = { lat: hit.lat, lon: hit.lon, label: hit.label }; persist(); }
        } catch { /* použij polohu cíle */ }
      }
      center = t.cityCenter || { lat: t.dest.lat, lon: t.dest.lon, label: t.dest.label };
    }
    if (T() !== t || t.step !== 'program') return;
    host.innerHTML = `<div class="card step-card"><div class="sc-head"><div><h3>🗺️ Co dělat v ${esc(t.dest.label)}</h3>
      <div class="muted">Návrh programu na ${daysTxt(progDays)}${t.stay && t.stay.lat != null ? ' kolem tvého ubytování' : ''} – můžeš ho upravit.</div></div></div>
      <div id="tripPlaces"></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn primary" id="progNext">Pokračovat ke shrnutí →</button></div></div>`;
    $('#progNext').onclick = () => setStep('summary');
    if (window.Places && center.lat != null) {
      Places.renderPlanner($('#tripPlaces'), {
        lat: center.lat, lon: center.lon, label: center.label || t.dest.label, city: t.cityCenter ? t.cityCenter.label : t.dest.label.replace(/ \(.*\)$/, ''), country: t.dest.country || '', cc: t.dest.cc,
        start: progStart, end: checkout, plan: t.plan,
        arrivalTime: arrivalAt(outLeg(t)).slice(11, 16),
        departureTime: backLeg(t) && backLeg(t).hasTime ? backLeg(t).dep.slice(11, 16) : null,
        onPlan: plan => { T().plan = plan; persist(); },
      });
    } else {
      $('#tripPlaces').innerHTML = '<div class="note info">ℹ️ <div>Pro tuto destinaci neznám souřadnice – program nejde navrhnout.</div></div>';
    }
  }

  /* ---------- shrnutí ---------- */
  function summaryStep() {
    const t = T();
    const host = $('#tripStep');
    const c = costs(t);
    const { checkin, checkout, nights } = stayDates(t);
    const f = t.flight;
    const multi = isMulti(t), r = t.route, dates = multi ? baseDates(t) : [];
    const ov = ovOn(t) ? t.overland : null;
    const unpriced = multi ? r.bases.filter(b => !stayCzk(b.stay)).map(b => b.name) : [];
    const rows = [
      ov ? ['🚆', `Vlak / bus ${ov.back ? 'tam i zpět' : 'tam'} (${t.adults} os.)${[ov.out, ov.back].some(g => g && g.source !== 'regiojet') ? ' – odhad' : ''}`, c.overland] : ['✈️', `Letenky (${t.adults} os.)`, c.flights],
      c.bags ? ['🧳', 'Zavazadla (odhad příplatku)', c.bags] : null,
      c.ground ? ['🚌', 'Doprava na letiště a zpět (odhad)', c.ground] : null,
      ...(multi ? [
        ...r.bases.map(b => stayCzk(b.stay) ? ['🏨', `Ubytování · ${b.name} · ${nightsTxt(b.nights)}${hotelName(b.stay) ? ' · ' + hotelName(b.stay) : ''}`, stayCzk(b.stay)] : null),
        unpriced.length ? ['🏨', `Ubytování zatím bez ceny · ${unpriced.join(', ')}`, null] : null,
      ] : [t.stay && t.stay.mode !== 'skip' ? ['🏨', `Ubytování · ${nightsTxt(nights)}${t.stay.name ? ' · ' + t.stay.name : ''}`, c.stay] : null]),
      t.car && t.car.mode !== 'skip' ? ['🚗', 'Auto', c.car] : null,
    ].filter(Boolean);
    const provLabel = p => ({ kiwi: 'Kiwi.com', travelpayouts: 'Aviasales', ryanair: 'Ryanair', wizzair: 'Wizz Air' })[p] || p;
    const flightLinks = f.bookUrl ? [[f.combined ? `Koupit letenky (${provLabel(f.provider)})` : 'Koupit letenky', f.bookUrl]]
      : [[`Letenka tam (${f.out.carrierName || f.out.provider})`, f.out.bookUrl], ...(f.back ? [[`Letenka zpět (${f.back.carrierName || f.back.provider})`, f.back.bookUrl]] : [])];
    // Vlak/bus: jízdenka tam a zpět (RegioJet u vybraného spoje, jinak první odkaz – RegioJet, FlixBus, IDOS).
    const groundSteps = ov ? [[ov.out, 'tam', ov.from.label, ov.to.label, ov.links && ov.links.out], [ov.back, 'zpět', ov.to.label, ov.from.label, ov.links && ov.links.back]]
      .filter(x => x[0]).map(([g, what, a, b, links], i) => ({ id: `ground${i}:${g.date}`, label: `Jízdenka ${what}: ${a} → ${b} (${fmtDate(g.date)}${g.dep ? ' ' + hhmm(g.dep) : ''}${g.source === 'regiojet' ? ', RegioJet' : ''})`, url: gUrl(g, links) })) : null;
    const steps = [
      ...(groundSteps || flightLinks.map(([label, url], i) => ({ id: 'flight' + i, label, url }))),
      ...(multi ? r.bases.map((b, i) => b.stay && b.stay.mode === 'skip' ? null : {
        id: stayBookId(b, dates[i]), label: `Ubytování ${b.name} (${fmtDate(dates[i].checkin)}–${fmtDate(dates[i].checkout)})${hotelName(b.stay) ? ': ' + hotelName(b.stay) : ' – vyber přes odkaz'}`,
        url: (b.stay && b.stay.mode === 'pick' && b.stay.url) || baseSearchUrl(t, b, dates[i]),
      }) : [t.stay && t.stay.mode !== 'skip' ? { id: 'stay', label: `Ubytování${t.stay.name ? ': ' + t.stay.name : ''}`, url: t.stay.url || (staysData && staysData.links[0]?.url) } : null]),
      t.car && t.car.mode !== 'skip' ? { id: 'car', label: 'Auto', url: carsData && carsData.links[0]?.url } : null,
    ].filter(Boolean);
    const timeline = [];
    const gRow = (g, a, b) => `${esc(a)} → ${esc(b)} · ${esc(gTime(g))} · ${esc(gKind(g))}${g.fromStation ? ` · ${esc(g.fromStation)} → ${esc(g.toStation)}` : ''} (${esc(gWho(g))})`;
    if (ov) timeline.push([ov.out.date, gIco(ov.out), gRow(ov.out, ov.from.label, ov.to.label)]);
    else {
      if (t.ground.out) timeline.push([f.out.date, '🚌', `Cesta na letiště ${esc(f.out.from)} (~${minutesToHm(t.ground.out.minutes)}, odhad)`]);
      if (f.back && t.ground.back) timeline.push([f.back.date + '~', '🚌', `Cesta z letiště ${esc(f.back.to)} domů (~${minutesToHm(t.ground.back.minutes)})`]);
      timeline.push([f.out.date, '🛫', `${esc(f.out.from)} ${hhmm(f.out.dep)} → ${esc(f.out.to)} ${arrHm(f.out)} · ${esc(f.out.carrierName || '')}`]);
    }
    if (t.car && t.car.mode !== 'skip' && t.car.from) timeline.push([t.car.from.slice(0, 10), '🚗', `Vyzvednutí auta ${esc(t.car.pickup)} ${t.car.from.slice(11, 16)}`]);
    if (multi) {
      // Pořadí v rámci dne přejezdu: dopoledne program, přejezd, ubytování a program na dalším místě.
      const tr = r.transport, legs = r.legs || {};
      if (!ov && legs.arrival && legs.arrival.km >= 1) timeline.push([f.out.date, trIcon(tr), `Z letiště ${esc(f.out.to)} → ${esc(r.bases[0].name)} · ${legTxt(legs.arrival, tr)} (odhad)`]);
      r.bases.forEach((b, i) => {
        timeline.push([dates[i].checkin, '🏨', `<b>${esc(b.name)}</b> · ${nightsTxt(b.nights)} · ${esc(hotelName(b.stay) || (b.stay && b.stay.mode === 'skip' ? 'ubytování neřeším' : 'ubytování zatím nevybráno'))}`]);
        for (const d of (basePlan(t, i)?.days || [])) timeline.push([d.date, '📍', `${esc(b.name)}: ${d.items.map(x => esc(x.name)).join(' · ') || 'volno'}`]);
        const x = r.transfers && r.transfers[i];
        if (i < r.bases.length - 1) timeline.push([dates[i].checkout, trIcon(tr), `Přejezd ${esc(b.name)} → ${esc(r.bases[i + 1].name)}${x ? ` · ${legTxt(x, tr)} (odhad) · <a href="${esc(safeUrl(legUrl(x, tr)))}" target="_blank" rel="noopener">${tr === 'transit' ? 'spoje' : 'trasa'} ↗</a>` : ''}`]);
      });
      if (!ov && f.back && legs.departure && legs.departure.km >= 1) timeline.push([f.back.date, trIcon(tr), `${esc(r.bases.at(-1).name)} → letiště ${esc(f.back.from)} · ${legTxt(legs.departure, tr)} (odhad)`]);
    } else {
      if (t.stay && t.stay.mode !== 'skip') timeline.push([checkin, '🏨', `Ubytování: ${esc(t.stay.name || '')}`]);
      for (const d of (t.plan?.days || [])) timeline.push([d.date, '📍', d.items.map(x => esc(x.name)).join(' · ') || 'volný den']);
    }
    if (t.car && t.car.mode !== 'skip' && t.car.to) timeline.push([t.car.to.slice(0, 10), '🚗', `Vrácení auta ${esc(t.car.dropoff)} ${t.car.to.slice(11, 16)}`]);
    if (ov) { if (ov.back) timeline.push([ov.back.date, gIco(ov.back), gRow(ov.back, ov.to.label, ov.from.label)]); }
    else if (f.back) timeline.push([f.back.date, '🛬', `${esc(f.back.from)} ${hhmm(f.back.dep)} → ${esc(f.back.to)} · ${esc(f.back.carrierName || '')}`]);
    // Stabilní řazení podle data; „~“ za datem = až po ostatních položkách dne.
    timeline.sort((a, b) => a[0].localeCompare(b[0]));
    for (const x of timeline) x[0] = x[0].replace('~', '');
    host.innerHTML = `<div class="sum-grid">
      <div class="card step-card"><h3>🧾 Cena cesty</h3>
        <table class="cost">${rows.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${czk(r[2])}</td></tr>`).join('')}
        <tr class="tot"><td></td><td>Celkem</td><td>${czk(c.total)}</td></tr><tr><td></td><td class="faint">na osobu</td><td class="faint">${czk(c.perPerson)}</td></tr></table>
        <div class="faint" style="font-size:12px;margin-top:8px">${ov ? 'Vlak / bus: cena vybraného spoje RegioJetu, nebo odhad – jízdenky kup u dopravce.' : c.bags ? 'Zavazadla jsou odhad podle dopravce.' : t.bags && t.bags !== 'none' ? 'Zavazadlo je podle ceníku dopravce v ceně letenky.' : 'Letenky bez zavazadel.'} Ceny u partnerů ověř před zaplacením.</div>
      </div>
      <div class="card step-card"><h3>✅ Co zarezervovat (v tomhle pořadí)</h3>
        ${steps.map((s, i) => `<label class="check"><input type="checkbox" data-bk="${esc(s.id)}" ${t.booked[s.id] ? 'checked' : ''}><span>${i + 1}. ${esc(s.label)}</span>${s.url ? `<a class="btn sm" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" style="margin-left:auto">Otevřít ↗</a>` : ''}</label>`).join('')}
        ${!ov && f.back && f.back.provider !== f.out.provider ? '<div class="note warn" style="margin-top:10px">⚠️ <div>Lety tam a zpět jsou dvě samostatné letenky – při zpoždění prvního letu druhá aerolinka nečeká.</div></div>' : ''}
      </div></div>
      ${multi && nightsLeft(t) !== 0 ? '<div class="note warn" style="margin-bottom:14px">⚠️ <div>Noci v trase nesedí s délkou pobytu – uprav je v kroku <b>Trasa</b>, jinak termíny ubytování nebudou navazovat na lety.</div></div>' : ''}
      <div class="card step-card"><h3>🗓️ Průběh cesty</h3><div class="timeline">${timeline.map(x => `<div class="tl-row"><span class="tl-d">${dayLbl(x[0])}</span><span class="tl-i">${x[1]}</span><span>${x[2]}</span></div>`).join('')}</div></div>
      <div class="row wrap" style="gap:8px;margin-top:6px">
        <button class="btn primary" id="sumSave">💾 Uložit do plánovače</button>
        <button class="btn" id="sumShare">🔗 Zkopírovat odkaz na cestu</button>
        <button class="btn" id="sumIcs">📅 Do kalendáře</button>
        <a class="btn ghost" href="${esc(safeUrl(Ics.gcalUrl(tripEvent(t))))}" target="_blank" rel="noopener">Přidat do Google Kalendáře ↗</a>
        <button class="btn ghost" id="sumNew">Začít novou cestu</button>
      </div>`;
    $$('[data-bk]', host).forEach(cb => cb.onchange = () => { t.booked[cb.dataset.bk] = cb.checked; persist(); });
    $('#sumSave').onclick = () => saveToPlanner();
    $('#sumShare').onclick = () => share();
    $('#sumIcs').onclick = () => icsDownload(`atlas-${t.dest.label}-${checkin}`, calendarEvents(t), { name: `Cesta: ${t.dest.label}` });
    $('#sumNew').onclick = () => { if (confirm('Zahodit rozpracovanou cestu?')) { S.trip = null; persist(); go('flights'); } };
  }

  /* ---------- kalendář ---------- */
  /** Let ve tvaru pro kalendář a plánovač: místní časy + zóny letišť (bez času odletu dep = null). */
  const legBrief = l => ({
    from: l.from, to: l.to, date: l.date, dep: l.hasTime ? l.dep.slice(0, 16) : null, arr: l.hasTime && l.arr ? l.arr.slice(0, 16) : null,
    arrEst: !!l.arrEst, fromTz: l.fromTz || null, toTz: l.toTz || null, carrier: l.carrierName || l.carrier || '', flightNo: l.flightNo || '', durationMin: l.durationMin || null,
  });

  /** Úsek vlakem/busem pro kalendář a plánovač: místní časy a zóny měst (bez spoje jen den). */
  const groundBrief = (g, a, b) => ({
    from: a.label, to: b.label, date: g.date, dep: g.dep || null, arr: g.arr || null, fromTz: a.tz || null, toTz: b.tz || null,
    kind: gKind(g), carrier: g.source === 'regiojet' ? 'RegioJet' : '', min: g.min || null, fromStation: g.fromStation || '', toStation: g.toStation || '',
  });
  /** Úseky vlakem/busem tam (a zpět) ve tvaru groundBrief. */
  const groundBriefs = ov => [ov.out && groundBrief(ov.out, ov.from, ov.to), ov.back && groundBrief(ov.back, ov.to, ov.from)].filter(Boolean);

  /** Lety (nebo vlak/bus) tam a zpět s časy, pobyt, auto a dny programu jako události kalendáře. */
  function calendarEvents(t) {
    const f = t.flight, dest = t.dest.label;
    const { checkin, checkout, nights } = stayDates(t);
    const ov = ovOn(t) ? t.overland : null;
    const ev = ov ? groundBriefs(ov).map((g, i) => Ics.groundEvent(g, { url: gUrl(i ? ov.back : ov.out, ov.links && (i ? ov.links.back : ov.links.out)), note: `${i ? 'Cesta zpět' : 'Cesta'}: ${dest} · ${t.adults} os.` }))
      : [Ics.flightEvent(legBrief(f.out), { url: f.out.bookUrl || f.bookUrl, note: `Cesta: ${dest} · ${t.adults} os.` })];
    if (!ov && f.back) ev.push(Ics.flightEvent(legBrief(f.back), { url: f.back.bookUrl || f.bookUrl, note: `Zpáteční let · ${dest}` }));
    const multi = isMulti(t);
    if (multi) {
      // Víc míst: celodenní pobyt na každém místě (i bez vybraného hotelu – je to kde budeš) a přejezdy mezi nimi.
      const r = t.route, tr = r.transport, dates = baseDates(t);
      r.bases.forEach((b, i) => {
        const d = dates[i], s = b.stay, hotel = hotelName(s), next = r.bases[i + 1];
        ev.push({
          title: `🏨 ${hotel ? `${hotel} – ${b.name}` : `Ubytování: ${b.name}`}`, start: d.checkin, end: d.checkout,
          location: [hotel, b.name, b.country].filter(Boolean).join(', '), url: (s && s.mode === 'pick' && s.url) || baseSearchUrl(t, b, d),
          description: [`${i + 1}. místo trasy · ${b.name} · ${nightsTxt(b.nights)}`, `Check-in ${dayLbl(d.checkin)}, check-out ${dayLbl(d.checkout)}`,
            stayCzk(s) ? `Cena celkem ${czk(stayCzk(s))}` : hotel ? '' : 'Ubytování zatím nevybráno', b.highlights && b.highlights.length ? `Uvidíš: ${b.highlights.join(', ')}` : ''].filter(Boolean).join('\n'),
        });
        if (!next) return;
        const x = r.transfers && r.transfers[i];
        ev.push({
          title: `${trIcon(tr)} Přejezd ${b.name} → ${next.name}`, start: `${d.checkout}T${CHECKOUT_HM}`, tz: (ov ? ov.to.tz : f.out.toTz) || null, durationMin: legMin(x, tr) || 120,
          location: next.name, url: legUrl(x, tr) || undefined,
          description: [x ? `${legTxt(x, tr)} (odhad)` : '', `Check-out ${b.name}, check-in ${next.name}`].filter(Boolean).join('\n'),
        });
      });
    } else if (t.stay && t.stay.mode !== 'skip' && nights >= 1) {
      ev.push({
        title: `🏨 ${t.stay.name || 'Ubytování'}`, start: checkin, end: checkout, location: [t.stay.name, dest].filter(Boolean).join(', '), url: t.stay.url,
        description: [`Ubytování · ${dest} · ${nightsTxt(nights)}`, `Check-in ${dayLbl(checkin)}, check-out ${dayLbl(checkout)}`, t.stay.totalCzk ? `Cena celkem ${czk(t.stay.totalCzk)}` : ''].filter(Boolean).join('\n'),
      });
    }
    if (t.car && t.car.mode !== 'skip' && t.car.from && t.car.to) {
      // Zóna letiště vyzvednutí/vrácení z letů (auto se půjčuje na letišti příletu/odletu).
      const tz = { [f.out.to]: f.out.toTz, ...(f.back ? { [f.back.from]: f.back.fromTz } : {}) };
      const note = `Auto na místě${t.car.totalCzk ? ` · ${czk(t.car.totalCzk)}` : ''}`;
      ev.push({ title: `🚗 Vyzvednutí auta (${t.car.pickup})`, start: t.car.from, tz: tz[t.car.pickup], durationMin: 30, location: `Letiště ${t.car.pickup}`, description: note });
      ev.push({ title: `🚗 Vrácení auta (${t.car.dropoff})`, start: t.car.to, tz: tz[t.car.dropoff], durationMin: 30, location: `Letiště ${t.car.dropoff}`, description: note });
    }
    const progDays = multi ? t.route.bases.map((b, i) => [b.name, basePlan(t, i)?.days || []]) : [[dest, t.plan?.days || []]];
    for (const [place, days] of progDays) {
      days.forEach((d, i) => {
        if (d.items && d.items.length) ev.push({ title: `Den ${i + 1} – ${place}`, start: d.date, location: place, description: d.items.map(x => `• ${x.name}${x.note ? ` – ${x.note}` : ''}`).join('\n') });
      });
    }
    return ev;
  }

  /** Celá cesta jako jedna celodenní událost (odkaz do Google Kalendáře). */
  function tripEvent(t) {
    const f = t.flight, { checkout } = stayDates(t), ov = ovOn(t) ? t.overland : null;
    const fl = l => `✈️ ${[l.from, l.hasTime && hhmm(l.dep), '→', l.to, arrHm(l)].filter(Boolean).join(' ')} (${fmtDate(l.date)}${l.carrierName ? ', ' + l.carrierName : ''})`;
    const gl = (g, a, b) => `${gIco(g)} ${a} → ${b} ${gTime(g)} (${fmtDate(g.date)}, ${gWho(g)})`;
    const b = backLeg(t);
    return {
      title: `🧳 Cesta: ${t.dest.label}`, start: outLeg(t).date, end: b ? b.date : checkout, location: t.dest.label,
      description: [ov ? gl(ov.out, ov.from.label, ov.to.label) : fl(f.out), ov ? (ov.back ? gl(ov.back, ov.to.label, ov.from.label) : '') : f.back ? fl(f.back) : '',
        isMulti(t) ? `🧭 ${t.route.bases.map(b => `${b.name} (${nightsTxt(b.nights)}${hotelName(b.stay) ? ', ' + hotelName(b.stay) : ''})`).join(' → ')}`
          : t.stay && t.stay.mode !== 'skip' ? `🏨 ${t.stay.name || 'Ubytování'}` : '',
        t.car && t.car.mode !== 'skip' ? '🚗 Auto na místě' : ''].filter(Boolean).join('\n'),
    };
  }

  function saveToPlanner() {
    const t = T();
    const c = costs(t);
    const { checkin, checkout } = stayDates(t);
    const f = t.flight;
    const days = {};
    const multi = isMulti(t);
    // Den přejezdu patří dvěma místům – aktivity se spojí.
    for (const [place, plan] of multi ? t.route.bases.map((b, i) => [b.name, basePlan(t, i)]) : [[null, t.plan]]) {
      for (const d of (plan?.days || [])) days[d.date] = [...(days[d.date] || []), ...d.items.map(x => (place ? `${place}: ` : '') + x.name + (x.note ? ` – ${x.note}` : ''))];
    }
    const dates = multi ? baseDates(t) : [];
    const ov = ovOn(t) ? t.overland : null;
    const gTxt = (g, a, b) => `${a}→${b} ${fmtDate(g.date)}${g.dep ? ' ' + hhmm(g.dep) : ''} (${g.source === 'regiojet' ? 'RegioJet, ' : ''}${gKind(g)}${g.source === 'regiojet' ? '' : ', odhad'})`;
    const flightTxt = ov ? `🚆 ${gTxt(ov.out, ov.from.label, ov.to.label)}${ov.back ? `, zpět ${gTxt(ov.back, ov.to.label, ov.from.label)}` : ''}`
      : `${f.out.from}→${f.out.to} ${fmtDate(f.out.date)} ${hhmm(f.out.dep)} (${f.out.carrierName || f.out.provider})${f.back ? `, zpět ${f.back.from}→${f.back.to} ${fmtDate(f.back.date)} ${hhmm(f.back.dep)} (${f.back.carrierName || f.back.provider})` : ''}`;
    const notes = [
      ...(multi ? [`Trasa: ${t.route.bases.map(b => `${b.name} (${nightsTxt(b.nights)})`).join(' → ')}`,
        ...t.route.bases.map((b, i) => `Ubytování ${b.name} ${fmtDate(dates[i].checkin)}–${fmtDate(dates[i].checkout)}: ${hotelName(b.stay) || 'zatím nevybráno'}${stayCzk(b.stay) ? ' – ' + czk(stayCzk(b.stay)) : ''}${b.stay && b.stay.mode === 'pick' && b.stay.url ? ' ' + b.stay.url : ''}`)]
        : [t.stay && t.stay.mode !== 'skip' ? `Ubytování: ${t.stay.name || ''} ${t.stay.totalCzk ? '– ' + czk(t.stay.totalCzk) : ''}${t.stay.url ? ' ' + t.stay.url : ''}` : '']),
      t.car && t.car.mode !== 'skip' ? `Auto: ${t.car.pickup || ''} ${t.car.from || ''} → ${t.car.dropoff || ''} ${t.car.to || ''} – ${czk(t.car.totalCzk)}` : '',
    ].filter(Boolean).join('\n');
    S.trips.push({
      name: `${t.dest.label} ${fmtDate(checkin)}`, dest: t.dest.label, iso: byIso[t.dest.cc] ? t.dest.cc : null,
      start: outLeg(t).date, end: backLeg(t) ? backLeg(t).date : checkout, pax: String(t.adults), budget: String(c.total), flight: flightTxt,
      ...(ov ? { ground: groundBriefs(ov) } : { legs: [f.out, f.back].filter(Boolean).map(legBrief) }), days, checklist: PACK.map(x => ({ t: x, done: false })), notes,
    });
    persist();
    toast('Cesta uložena do plánovače');
    go('planner');
  }

  function b64urlEncode(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64urlDecode(s) { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); }

  function share() {
    const t = T();
    const slim = { ...t, booked: {}, created: undefined };
    if (t.route) {
      // Program míst jen s tím, co vykreslí plánovač a shrnutí (bez popisů, fotek a „dalších míst“) – kratší odkaz.
      const item = x => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, category: x.category, tripKind: x.tripKind, visitMin: x.visitMin, fromPrevKm: x.fromPrevKm, fromPrevMin: x.fromPrevMin, transit: x.transit, note: x.note });
      const plan = p => (p ? { ...p, spare: undefined, days: (p.days || []).map(d => ({ ...d, items: (d.items || []).map(item) })) } : null);
      slim.route = { ...t.route, candidates: undefined, bases: (t.route.bases || []).map((b, i) => ({ ...b, plan: plan(isMulti(t) ? basePlan(t, i) : b.plan) })) };
    }
    const url = `${location.origin}${location.pathname}#trip=${b64urlEncode(JSON.stringify(slim))}`;
    navigator.clipboard?.writeText(url).then(() => toast('Odkaz zkopírován – pošli ho komukoliv'), () => prompt('Zkopíruj odkaz:', url));
  }

  /**
   * Data ze sdíleného odkazu jsou cizí vstup: z textů odstraň znaky, které by šly použít k vložení
   * HTML (<, >, uvozovky, `), čísla převeď na čísla a odkazy pustí dál jen safeUrl při vykreslení.
   */
  function sanitizeTrip(raw) {
    // Odkazy (…url/Url) mohou být dlouhé (Ryanair ~400 znaků) – nezkracovat; texty do 300 znaků.
    const clean = (v, key = '') => typeof v === 'string' ? v.replace(/[<>"'`]/g, '').slice(0, /url$/i.test(key) ? 4000 : 300)
      : typeof v === 'number' ? (Number.isFinite(v) ? v : 0)
      : typeof v === 'boolean' || v == null ? v
      : Array.isArray(v) ? v.slice(0, 200).map(x => clean(x, key))
      : typeof v === 'object' ? Object.fromEntries(Object.entries(v).slice(0, 200).filter(([k]) => /^[\w-]{1,40}$/.test(k)).map(([k, x]) => [k, clean(x, k)])) : null;
    const t = clean(raw);
    const isLeg = l => l && typeof l === 'object' && typeof l.from === 'string' && typeof l.to === 'string' && typeof l.date === 'string' && (l.dep == null || typeof l.dep === 'string') && (l.arr == null || typeof l.arr === 'string');
    if (!t || typeof t.flight !== 'object' || !isLeg(t.flight.out) || (t.flight.back != null && !isLeg(t.flight.back))) throw new Error('neplatný let');
    if (t.dest != null && (typeof t.dest !== 'object' || typeof (t.dest.label ?? '') !== 'string' || typeof (t.dest.cc ?? '') !== 'string')) throw new Error('neplatný cíl');
    const num = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
    const iata = v => /^[A-Z0-9]{3}$/.test(v || '') ? v : '???';
    const leg = l => l && typeof l === 'object' ? { ...l, from: iata(l.from), to: iata(l.to), date: /^\d{4}-\d{2}-\d{2}$/.test(l.date || '') ? l.date : '1970-01-01' } : null;
    t.adults = Math.round(num(t.adults, 1, 9, 1));
    t.nightsOneWay = Math.round(num(t.nightsOneWay, 1, 30, 3));
    t.flight.out = leg(t.flight.out);
    t.flight.back = leg(t.flight.back);
    t.flight.flightCzk = num(t.flight.flightCzk, 0, 1e7, 0);
    t.flight.groundCzk = num(t.flight.groundCzk, 0, 1e6, 0);
    t.flight.bagCzk = num(t.flight.bagCzk, 0, 1e6, 0);
    for (const k of ['stay', 'car']) if (t[k] && typeof t[k] === 'object') t[k].totalCzk = num(t[k].totalCzk, 0, 1e7, 0);
    if (!t.dest || typeof t.dest !== 'object') t.dest = { label: t.flight.out.to };
    if (!t.ground || typeof t.ground !== 'object') t.ground = {};
    if (t.plan && !Array.isArray(t.plan.days)) t.plan = null;
    t.route = cleanRoute(t.route);
    t.overland = cleanOverland(t.overland);
    t.groundRef = cleanGroundRef(t.groundRef);
    return t;
  }

  // Vlak/bus ze sdíleného odkazu (už prošel clean()): jen známá pole, čísla v mezích, odkazy jen http(s).
  const okObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const okFin = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const okStr = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const okYmd = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')) ? v : null;
  const okDt = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v.slice(0, 16)) && okYmd(v.slice(0, 10)) ? v.slice(0, 16) : null;
  const okTz = v => typeof v === 'string' && v.length <= 40 && /^[A-Za-z][\w+-]*(\/[\w+-]+){0,2}$/.test(v) ? v : null;
  // ID míst z aplikace (ap:VIE, metro:PAR, geo:lat,lon|Název) – posílají se serveru, který je ještě ověří
  const okPlaceId = v => typeof v === 'string' && /^(ap|metro|geo):[^<>"'`\n]{1,110}$/.test(v) ? v : null;
  const okQ = q => (okObj(q) && okPlaceId(q.from) && okPlaceId(q.to) ? { from: q.from, to: q.to } : null);
  function cleanGroundLeg(g) {
    if (!okObj(g) || !okYmd(g.date)) return null;
    const dep = okDt(g.dep), arr = dep ? okDt(g.arr) : null;
    return {
      source: g.source === 'regiojet' && dep && arr ? 'regiojet' : 'estimate', id: /^[\w,.-]{0,60}$/.test(g.id || '') ? g.id || '' : '', date: g.date,
      dep: dep && arr ? dep : null, arr: dep && arr ? arr : null, min: okFin(g.min, 1, 3000) ? Math.round(g.min) : null, czk: okFin(g.czk, 0, 1e5) ? Math.round(g.czk) : 0,
      kinds: Array.isArray(g.kinds) ? [...new Set(g.kinds.filter(k => k === 'TRAIN' || k === 'BUS'))] : [], transfers: okFin(g.transfers, 0, 9) ? Math.round(g.transfers) : null,
      fromStation: okStr(g.fromStation, 60), toStation: okStr(g.toStation, 60),
    };
  }
  function cleanGroundPlace(p) {
    if (!okObj(p) || !okFin(p.lat, -90, 90) || !okFin(p.lon, -180, 180) || !okStr(p.label, 80)) return null;
    return { label: okStr(p.label, 80), cc: /^[A-Z]{2}$/.test(p.cc || '') ? p.cc : '', lat: p.lat, lon: p.lon, tz: okTz(p.tz), regiojet: p.regiojet === true, flixbus: p.flixbus === true };
  }
  const LINK_IDS = ['regiojet', 'flixbus', 'idos', 'google'];
  const cleanLinks = v => (Array.isArray(v) ? v.slice(0, 4) : []).filter(l => okObj(l) && LINK_IDS.includes(l.id) && typeof l.url === 'string' && /^https:\/\//i.test(l.url))
    .map(l => ({ id: l.id, name: okStr(l.name, 30) || l.id, url: l.url.slice(0, 2000) }));
  function cleanOverland(o) {
    if (!okObj(o)) return null;
    const from = cleanGroundPlace(o.from), to = cleanGroundPlace(o.to), out = cleanGroundLeg(o.out);
    if (!from || !to || !out) return null;
    const back = cleanGroundLeg(o.back);
    return {
      on: o.on === true, q: okQ(o.q), km: okFin(o.km, 0, 5000) ? Math.round(o.km) : 0, from, to, out, back: back && back.date >= out.date ? back : null,
      est: okObj(o.est) && okFin(o.est.minutes, 1, 3000) && okFin(o.est.czk, 0, 1e5) ? { minutes: Math.round(o.est.minutes), czk: Math.round(o.est.czk), basis: o.est.basis === 'measured' ? 'measured' : 'distance' } : null,
      links: { out: cleanLinks(okObj(o.links) ? o.links.out : null), back: cleanLinks(okObj(o.links) ? o.links.back : null) },
    };
  }
  function cleanGroundRef(g) {
    if (!okObj(g) || !okQ(g.q) || !okFin(g.min, 1, 3000) || !okFin(g.czk, 0, 1e5)) return null;
    return {
      q: okQ(g.q), km: okFin(g.km, 0, 5000) ? Math.round(g.km) : 0, min: Math.round(g.min), czk: Math.round(g.czk), basis: g.basis === 'measured' ? 'measured' : 'distance',
      worth: g.worth === true, rule: ['time', 'short', 'cheap'].includes(g.rule) ? g.rule : null, reason: okStr(g.reason, 300), doorMin: okFin(g.doorMin, 0, 5000) ? Math.round(g.doorMin) : null,
      from: okStr(g.from, 80), to: okStr(g.to, 80), regiojet: g.regiojet === true, flixbus: g.flixbus === true,
    };
  }

  /**
   * Trasa ze sdíleného odkazu (už prošla clean()): jen známá pole, čísla v mezích, odkazy jen http(s),
   * nejvýš 6 míst; neplatné místo se vyřadí a s méně než 2 místy zůstane jedno místo celý pobyt.
   */
  function cleanRoute(r) {
    const obj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
    if (!obj(r)) return null;
    const fin = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const url = v => (typeof v === 'string' && /^https?:\/\//i.test(v) ? v.slice(0, 4000) : null);
    const ymd = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const pos = x => obj(x) && fin(x.lat, -90, 90) && fin(x.lon, -180, 180);
    const leg = x => (obj(x) && fin(x.km, 0, 20000) && fin(x.carMin, 0, 10000) && fin(x.transitMin, 0, 10000)
      ? { km: Math.round(x.km), carMin: Math.round(x.carMin), transitMin: Math.round(x.transitMin), long: x.long === true, carUrl: url(x.carUrl), transitUrl: url(x.transitUrl) } : null);
    const airport = x => (pos(x) && /^[A-Z0-9]{3}$/.test(x.iata || '') ? { iata: x.iata, name: str(x.name, 80), lat: x.lat, lon: x.lon } : null);
    const stay = x => (obj(x) && ['pick', 'manual', 'skip', 'links'].includes(x.mode) ? {
      mode: x.mode, id: str(x.id, 120), name: str(x.name, 120), totalCzk: fin(x.totalCzk, 0, 1e7) ? x.totalCzk : 0, url: url(x.url),
      lat: fin(x.lat, -90, 90) ? x.lat : null, lon: fin(x.lon, -180, 180) ? x.lon : null, rating: fin(x.rating, 0, 10) ? x.rating : null,
      provider: str(x.provider, 40), checkin: ymd(x.checkin), checkout: ymd(x.checkout),
    } : null);
    // Program místa: dny s platným datem a místy s názvem a polohou (vykreslí ho plánovač programu).
    const plan = p => (obj(p) && Array.isArray(p.days) && pos(p.center) ? {
      ...p, spare: [], days: p.days.slice(0, 31).filter(d => obj(d) && ymd(d.date) && Array.isArray(d.items))
        .map(d => ({ ...d, items: d.items.slice(0, 30).filter(x => obj(x) && typeof x.name === 'string' && pos(x)) })),
    } : null);
    const base = (b, i) => {
      if (!pos(b) || !str(b.name, 80)) return null;
      const nights = b.nights;
      if (!Number.isInteger(nights) || nights < 1 || nights > 30) return null;
      return {
        id: /^[\w:.,-]{1,100}$/.test(b.id || '') ? b.id : `b${i}`, name: str(b.name, 80), nameEn: str(b.nameEn, 80), lat: b.lat, lon: b.lon, nights,
        cc: /^[A-Z]{2}$/.test(b.cc || '') ? b.cc : '', country: str(b.country, 60), anchor: ['arrival', 'departure'].includes(b.anchor) ? b.anchor : null,
        reason: str(b.reason, 200), highlights: Array.isArray(b.highlights) ? b.highlights.filter(x => typeof x === 'string').slice(0, 5).map(x => x.slice(0, 80)) : [],
        searchUrl: url(b.searchUrl), stay: stay(b.stay), plan: plan(b.plan),
      };
    };
    const bases = (Array.isArray(r.bases) ? r.bases.slice(0, MAX_BASES) : []).map(base).filter(Boolean);
    const transport = r.transport === 'transit' ? 'transit' : 'car';
    if (bases.length < 2) return { mode: 'single', transport, bases: [], transfers: [], legs: {}, exclude: [], candidates: [], notes: [] };
    const transfers = Array.isArray(r.transfers) ? r.transfers.slice(0, bases.length - 1).map(leg) : [];
    return {
      mode: r.mode === 'multi' ? 'multi' : 'single', transport, bases,
      // chybějící nebo poškozené přejezdy se v kroku Trasa dopočítají
      transfers: transfers.length === bases.length - 1 && transfers.every(Boolean) ? transfers : [],
      legs: { arrival: leg(obj(r.legs) ? r.legs.arrival : null), departure: leg(obj(r.legs) ? r.legs.departure : null) },
      arrival: airport(r.arrival), departure: airport(r.departure),
      want: [2, 3, 4].includes(r.want) ? r.want : null,
      exclude: Array.isArray(r.exclude) ? r.exclude.filter(x => typeof x === 'string' && x.length <= 100).slice(0, 30) : [],
      notes: Array.isArray(r.notes) ? r.notes.filter(x => typeof x === 'string').slice(0, 5).map(x => x.slice(0, 300)) : [],
      candidates: [], demo: r.demo === true,
    };
  }

  /** Načte sdílenou cestu z #trip=… (volá app.js při startu). */
  function importFromHash() {
    const m = location.hash.match(/^#trip=([A-Za-z0-9_-]+)$/);
    if (!m) return false;
    try {
      const parsed = JSON.parse(b64urlDecode(m[1]));
      if (!parsed || !parsed.flight || !parsed.flight.out) throw new Error('neplatná data');
      const t = sanitizeTrip(parsed);
      const mine = S.trip;
      if (mine && mine.flight && JSON.stringify(mine.flight.out) !== JSON.stringify(t.flight.out)
        && !confirm(`Otevíráš sdílenou cestu do ${t.dest.label || t.flight.out.to}. Nahradit jí tvoji rozpracovanou cestu do ${mine.dest?.label || mine.flight.out.to}?`)) {
        history.replaceState(null, '', '#trip');
        return false;
      }
      S.trip = { ...t, booked: {}, step: 'summary', created: Date.now() };
      persist();
      history.replaceState(null, '', '#trip');
      toast('Načetl jsem sdílenou cestu');
      return true;
    } catch (e) {
      toast('Odkaz na cestu je poškozený', 'err');
      return false;
    }
  }

  // Poškozená uložená cesta nesmí zablokovat celou sekci – nabídni ji zahodit.
  function safeRender() {
    try {
      render();
    } catch (e) {
      console.error(e);
      const root = $('#tripRoot');
      if (root) {
        root.innerHTML = `<div class="card step-card"><div class="note warn">⚠️ <div>Uloženou cestu se nepodařilo zobrazit (${esc(e.message)}).</div></div><div class="row" style="gap:8px;margin-top:12px"><button class="btn primary" id="tripReset">Zahodit a začít znovu</button></div></div>`;
        $('#tripReset').onclick = () => { S.trip = null; persist(); go('flights'); };
      }
    }
  }

  window.Trip = { start, render: safeRender, importFromHash, costs, sanitizeTrip, calendarEvents, baseDates, stayDates, tripEvent };
})();
