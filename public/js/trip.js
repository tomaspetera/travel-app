/* ATLAS – průvodce cestou: let → ubytování → auto → program → shrnutí.
   Stav je v S.trip (localStorage), cestu lze sdílet odkazem #trip=… */
(function () {
  const STEPS = [
    ['flight', '✈️', 'Let'],
    ['stay', '🏨', 'Ubytování'],
    ['car', '🚗', 'Auto'],
    ['program', '🗺️', 'Program'],
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

  function stayDates(t) {
    // Přílet po půlnoci (do 5:00) → pokoj už od předchozího večera, ať je kde přespat.
    const arr = arrivalAt(t.flight.out);
    const checkin = t.flight.out.hasTime && +arr.slice(11, 13) < 5 ? addDaysYmd(arr.slice(0, 10), -1) : arr.slice(0, 10);
    const checkout = t.flight.back ? t.flight.back.date : addDaysYmd(checkin, t.nightsOneWay || 3);
    return { checkin, checkout, nights: Math.max(0, Math.round((new Date(checkout) - new Date(checkin)) / 864e5)) };
  }

  function costs(t) {
    const pax = t.adults;
    const flights = Math.round(t.flight.flightCzk * pax);
    const ground = Math.round((t.flight.groundCzk || 0) * pax);
    const stay = t.stay && t.stay.mode !== 'skip' ? Math.round(t.stay.totalCzk || 0) : 0;
    const car = t.car && t.car.mode !== 'skip' ? Math.round(t.car.totalCzk || 0) : 0;
    const total = flights + ground + stay + car;
    return { flights, ground, stay, car, total, perPerson: Math.round(total / pax) };
  }

  /* ---------- start z výsledků hledání ---------- */
  function start({ t, g, result }) {
    const originsBy = Object.fromEntries((result.origins || []).map(o => [o.iata, o]));
    const dest = g ? g.dest : { label: t.out.to, cc: '', country: '', lat: null, lon: null };
    S.trip = {
      v: 1,
      created: Date.now(),
      adults: result.query.adults,
      flight: t,
      dest: { label: dest.label, country: dest.country, cc: dest.cc, lat: dest.lat, lon: dest.lon, id: dest.id },
      home: result.home ? result.home.label : null,
      ground: {
        out: originsBy[t.out.from]?.ground || null,
        back: t.back ? (originsBy[t.back.to]?.ground || null) : null,
      },
      nightsOneWay: 3,
      stay: null,
      car: null,
      plan: null,
      booked: {},
      step: 'stay',
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
    const c = costs(t);
    const { checkin, checkout, nights } = stayDates(t);
    const idx = STEPS.findIndex(s => s[0] === t.step);
    root.innerHTML = `
      <div class="trip-head card">
        <div class="th-dest"><span class="th-flag">${flag(t.dest.cc)}</span><div><h2>${esc(t.dest.label)}</h2>
          <div class="muted">${esc(t.dest.country || '')} · ${fmtDate(checkin)}–${fmtDate(checkout)} · ${t.flight.back ? nightsTxt(nights) : 'jen tam'} · ${t.adults} os.</div></div></div>
        <div class="th-total"><div class="faint">Celkem zatím</div><div class="tt">${czk(c.total)}</div><div class="faint">${czk(c.perPerson)} na osobu</div></div>
      </div>
      <div class="stepbar">${STEPS.map((s, i) => `<button type="button" class="st ${i < idx ? 'done' : ''} ${i === idx ? 'on' : ''}" data-step="${s[0]}" ${s[0] === 'flight' ? 'data-flight="1"' : ''}><span>${i < idx ? '✓' : s[1]}</span>${s[2]}</button>`).join('<i></i>')}</div>
      <div id="tripStep"></div>`;
    $$('.stepbar [data-step]').forEach(b => b.onclick = () => b.dataset.step === 'flight' ? flightStep() : setStep(b.dataset.step));
    if (t.step === 'stay') stayStep();
    else if (t.step === 'car') carStep();
    else if (t.step === 'program') programStep();
    else summaryStep();
  }

  function legLine(l, back) {
    return `<div class="tl-leg"><span class="cbadge" style="background:#5b8cff">${esc(l.carrier || '✈')}</span>
      <b>${dayLbl(l.date)}</b> ${l.from} ${hhmm(l.dep)} → ${l.to} ${arrHm(l)} <span class="faint">${esc(l.carrierName || '')}${l.flightNo ? ' · ' + esc(l.flightNo) : ''}</span>${back ? '' : ''}</div>`;
  }

  function flightStep() {
    const t = T();
    const host = $('#tripStep');
    $$('.stepbar .st').forEach(b => b.classList.toggle('on', b.dataset.step === 'flight'));
    host.innerHTML = `<div class="card step-card"><h3>✈️ Vybraný let</h3>
      ${legLine(t.flight.out)}${t.flight.back ? legLine(t.flight.back, true) : ''}
      <div class="muted" style="margin-top:8px;font-size:13px">Letenky ${czk(t.flight.flightCzk)}/os.${t.flight.groundCzk ? ` + doprava na letiště ${czk(t.flight.groundCzk)}/os.` : ''}</div>
      <div class="row wrap" style="margin-top:14px;gap:8px"><button class="btn" id="tfBack">↩ Vybrat jiný let</button><button class="btn" id="tfVerify">🔄 Ověřit živou cenu a porovnat aerolinky</button><button class="btn primary" id="tfNext">Pokračovat k ubytování →</button></div>
      <div id="tfAlt"></div></div>`;
    $('#tfBack').onclick = () => go('flights');
    $('#tfNext').onclick = () => setStep('stay');
    $('#tfVerify').onclick = () => verifyFlight();
  }

  /** Živé ceny všech aerolinek pro zvolená data a letiště (Kiwi.com). */
  async function verifyFlight() {
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
      if (!j.available) { host.innerHTML = '<div class="note info" style="margin-top:12px">ℹ️ <div>Živé ověření není v tomto režimu dostupné.</div></div>'; return; }
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
        persist(); render(); flightStep(); toast('Let aktualizován');
      });
    } catch (e) {
      host.innerHTML = `<div class="note warn" style="margin-top:12px">⚠️ <div>${esc(e.message)}</div></div>`;
    }
  }

  /* ---------- ubytování ---------- */
  async function stayStep() {
    const t = T();
    const host = $('#tripStep');
    const { checkin, checkout, nights } = stayDates(t);
    const oneWayNights = !t.flight.back ? `<div class="field" style="max-width:220px;margin-bottom:12px"><label>Kolik nocí zůstaneš?</label><input class="input" type="number" min="1" max="30" id="owNights" value="${t.nightsOneWay}"></div>` : '';
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🏨 Ubytování v ${esc(t.dest.label)}</h3><div class="muted">${dayLbl(checkin)} – ${dayLbl(checkout)} · ${nightsTxt(nights)} · ${t.adults} ${t.adults === 1 ? 'host' : 'hosté'}</div></div>
      ${t.stay ? `<div class="chosen">Vybráno: <b>${esc(t.stay.name || (t.stay.mode === 'skip' ? 'bez ubytování' : ''))}</b>${t.stay.totalCzk ? ` · ${czk(t.stay.totalCzk)}` : ''}</div>` : ''}</div>
      ${oneWayNights}
      <div id="stayBody"><div class="loading-row"><span class="spin dark"></span> Hledám ubytování s nejlepším poměrem ceny a hodnocení…</div></div>
      <div class="divider"></div>
      <div class="manual-row"><div class="muted" style="font-size:13px">Vybral sis jinde? Zadej celkovou cenu a pokračuj:</div>
        <input class="input" id="manName" placeholder="Název (nepovinné)" value="${t.stay && t.stay.mode === 'manual' ? esc(t.stay.name) : ''}">
        <input class="input" id="manPrice" type="number" min="0" step="100" placeholder="Cena celkem v Kč" value="${t.stay && t.stay.mode === 'manual' ? t.stay.totalCzk : ''}">
        <button class="btn" id="manSave">Uložit</button></div>
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn ghost" id="staySkip">Ubytování neřeším →</button>${t.stay ? '<button class="btn primary" id="stayNext">Pokračovat →</button>' : ''}</div>
    </div>`;
    const ow = $('#owNights');
    if (ow) ow.onchange = () => {
      t.nightsOneWay = Math.min(30, Math.max(1, +ow.value || 3));
      staysData = null;
      t.plan = null; // program pro jiný počet dní neplatí
      // Cena vybraného hotelu platila pro původní počet nocí → vyber znovu (ruční cenu nech, ale upozorni).
      if (t.stay && t.stay.mode === 'pick') { t.stay = null; toast('Počet nocí se změnil – vyber ubytování znovu'); }
      else if (t.stay && t.stay.mode === 'manual') toast('Zkontroluj cenu ubytování pro nový počet nocí');
      persist(); render();
    };
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
        const qs = new URLSearchParams({ city: t.dest.label.replace(/ \(.*\)$/, ''), country: t.dest.country || '', cc: t.dest.cc || '', iata: t.flight.out.to, checkin, checkout, adults: t.adults });
        if (t.dest.lat != null) { qs.set('lat', t.dest.lat); qs.set('lon', t.dest.lon); }
        const r = await fetch('api/stays?' + qs);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        staysData = { key, ...j };
      } catch (e) {
        $('#stayBody').innerHTML = `<div class="note warn">⚠️ <div>Nabídky se nepodařilo načíst: ${esc(e.message)}</div></div>`;
        return;
      }
    }
    // Mezitím se změnil počet nocí (novější dotaz) nebo krok → tuhle odpověď nevykresluj.
    if (T() !== t || t.step !== 'stay' || !staysData || staysData.key !== key) return;
    renderStays();
  }

  // Odkazy na partnery; affiliate odkazy viditelně označené (zákon o ochraně spotřebitele, rel=sponsored).
  const SPONSOR_NOTE = '<div class="faint" style="font-size:11.5px;margin-top:6px">Odkazy označené „reklama“ jsou partnerské (affiliate): při rezervaci přes ně může ATLAS dostat provizi. Cenu pro tebe to nezvyšuje a pořadí nabídek to neovlivňuje.</div>';
  function linkGrid(links, color) {
    const html = links.map(l => `<a class="result-link" href="${esc(safeUrl(l.url))}" target="_blank" rel="${l.sponsored ? 'sponsored nofollow noopener' : 'noopener'}"><div class="lg" style="background:${color}">${esc(l.name.slice(0, 2))}</div><div><div class="rl-t">${esc(l.name)}${l.sponsored ? ' <span class="ad-tag">reklama</span>' : ''}</div><div class="rl-s">${esc(l.note)}</div></div><div class="go">↗</div></a>`).join('');
    return `<div class="link-grid">${html}</div>${links.some(l => l.sponsored) ? SPONSOR_NOTE : ''}`;
  }

  function stayCard(h, i) {
    const t = T();
    const chosen = t.stay && t.stay.mode === 'pick' && t.stay.id === h.id;
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
      T().stay = { mode: 'pick', id: h.id, name: h.name, totalCzk: h.priceTotalCzk || 0, url: h.bookUrl, lat: h.lat, lon: h.lon, rating: h.rating, provider: h.provider };
      persist(); setStep('car');
    });
  }

  /* ---------- auto ---------- */
  function carDefaults(t) {
    const pickupAt = shiftDt(arrivalAt(t.flight.out), 45);
    let dropAt;
    if (t.flight.back) dropAt = t.flight.back.hasTime ? shiftDt(t.flight.back.dep.slice(0, 16), -120) : `${t.flight.back.date}T10:00`;
    else dropAt = `${stayDates(t).checkout}T10:00`;
    return { pickup: t.flight.out.to, dropoff: t.flight.back ? t.flight.back.from : t.flight.out.to, from: pickupAt, to: dropAt };
  }

  async function carStep() {
    const t = T();
    const host = $('#tripStep');
    const def = t.car && t.car.mode !== 'skip' && t.car.from ? t.car : carDefaults(t);
    const days = Math.max(1, Math.ceil((new Date(def.to + ':00Z') - new Date(def.from + ':00Z')) / 864e5));
    host.innerHTML = `<div class="card step-card">
      <div class="sc-head"><div><h3>🚗 Auto na místě</h3><div class="muted">Vyzvednutí na letišti po příletu, vrácení před odletem.</div></div>
      ${t.car ? `<div class="chosen">${t.car.mode === 'skip' ? 'Bez auta' : `Auto: <b>${czk(t.car.totalCzk)}</b>`}</div>` : ''}</div>
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
      <div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn ghost" id="carSkip">Auto nepotřebuji →</button>${t.car ? '<button class="btn primary" id="carNext">Pokračovat →</button>' : ''}</div>
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
  async function programStep() {
    const t = T();
    const host = $('#tripStep');
    const { checkin, checkout, nights } = stayDates(t);
    // Program začíná dnem příletu (při příletu po půlnoci je check-in o den dřív, program ne).
    const progStart = arrivalAt(t.flight.out).slice(0, 10);
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
        lat: center.lat, lon: center.lon, label: center.label || t.dest.label, cc: t.dest.cc,
        start: progStart, end: checkout, plan: t.plan,
        arrivalTime: arrivalAt(t.flight.out).slice(11, 16),
        departureTime: t.flight.back && t.flight.back.hasTime ? t.flight.back.dep.slice(11, 16) : null,
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
    const rows = [
      ['✈️', `Letenky (${t.adults} os.)`, c.flights],
      c.ground ? ['🚌', 'Doprava na letiště a zpět (odhad)', c.ground] : null,
      t.stay && t.stay.mode !== 'skip' ? ['🏨', `Ubytování · ${nightsTxt(nights)}${t.stay.name ? ' · ' + t.stay.name : ''}`, c.stay] : null,
      t.car && t.car.mode !== 'skip' ? ['🚗', 'Auto', c.car] : null,
    ].filter(Boolean);
    const provLabel = p => ({ kiwi: 'Kiwi.com', travelpayouts: 'Aviasales', ryanair: 'Ryanair', wizzair: 'Wizz Air' })[p] || p;
    const flightLinks = f.bookUrl ? [[f.combined ? `Koupit letenky (${provLabel(f.provider)})` : 'Koupit letenky', f.bookUrl]]
      : [[`Letenka tam (${f.out.carrierName || f.out.provider})`, f.out.bookUrl], ...(f.back ? [[`Letenka zpět (${f.back.carrierName || f.back.provider})`, f.back.bookUrl]] : [])];
    const steps = [
      ...flightLinks.map(([label, url], i) => ({ id: 'flight' + i, label, url })),
      t.stay && t.stay.mode !== 'skip' ? { id: 'stay', label: `Ubytování${t.stay.name ? ': ' + t.stay.name : ''}`, url: t.stay.url || (staysData && staysData.links[0]?.url) } : null,
      t.car && t.car.mode !== 'skip' ? { id: 'car', label: 'Auto', url: carsData && carsData.links[0]?.url } : null,
    ].filter(Boolean);
    const timeline = [];
    if (t.ground.out) timeline.push([f.out.date, '🚌', `Cesta na letiště ${esc(f.out.from)} (~${minutesToHm(t.ground.out.minutes)}, odhad)`]);
    if (f.back && t.ground.back) timeline.push([f.back.date + '~', '🚌', `Cesta z letiště ${esc(f.back.to)} domů (~${minutesToHm(t.ground.back.minutes)})`]);
    timeline.push([f.out.date, '🛫', `${esc(f.out.from)} ${hhmm(f.out.dep)} → ${esc(f.out.to)} ${arrHm(f.out)} · ${esc(f.out.carrierName || '')}`]);
    if (t.car && t.car.mode !== 'skip' && t.car.from) timeline.push([t.car.from.slice(0, 10), '🚗', `Vyzvednutí auta ${esc(t.car.pickup)} ${t.car.from.slice(11, 16)}`]);
    if (t.stay && t.stay.mode !== 'skip') timeline.push([checkin, '🏨', `Ubytování: ${esc(t.stay.name || '')}`]);
    for (const d of (t.plan?.days || [])) timeline.push([d.date, '📍', d.items.map(x => esc(x.name)).join(' · ') || 'volný den']);
    if (t.car && t.car.mode !== 'skip' && t.car.to) timeline.push([t.car.to.slice(0, 10), '🚗', `Vrácení auta ${esc(t.car.dropoff)} ${t.car.to.slice(11, 16)}`]);
    if (f.back) timeline.push([f.back.date, '🛬', `${esc(f.back.from)} ${hhmm(f.back.dep)} → ${esc(f.back.to)} · ${esc(f.back.carrierName || '')}`]);
    // Stabilní řazení podle data; „~“ za datem = až po ostatních položkách dne.
    timeline.sort((a, b) => a[0].localeCompare(b[0]));
    for (const x of timeline) x[0] = x[0].replace('~', '');
    host.innerHTML = `<div class="sum-grid">
      <div class="card step-card"><h3>🧾 Cena cesty</h3>
        <table class="cost">${rows.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${czk(r[2])}</td></tr>`).join('')}
        <tr class="tot"><td></td><td>Celkem</td><td>${czk(c.total)}</td></tr><tr><td></td><td class="faint">na osobu</td><td class="faint">${czk(c.perPerson)}</td></tr></table>
        <div class="faint" style="font-size:12px;margin-top:8px">Letenky bez zavazadel. Ceny u partnerů ověř před zaplacením.</div>
      </div>
      <div class="card step-card"><h3>✅ Co zarezervovat (v tomhle pořadí)</h3>
        ${steps.map((s, i) => `<label class="check"><input type="checkbox" data-bk="${s.id}" ${t.booked[s.id] ? 'checked' : ''}><span>${i + 1}. ${esc(s.label)}</span>${s.url ? `<a class="btn sm" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" style="margin-left:auto">Otevřít ↗</a>` : ''}</label>`).join('')}
        ${f.back && f.back.provider !== f.out.provider ? '<div class="note warn" style="margin-top:10px">⚠️ <div>Lety tam a zpět jsou dvě samostatné letenky – při zpoždění prvního letu druhá aerolinka nečeká.</div></div>' : ''}
      </div></div>
      <div class="card step-card"><h3>🗓️ Průběh cesty</h3><div class="timeline">${timeline.map(x => `<div class="tl-row"><span class="tl-d">${dayLbl(x[0])}</span><span class="tl-i">${x[1]}</span><span>${x[2]}</span></div>`).join('')}</div></div>
      <div class="row wrap" style="gap:8px;margin-top:6px">
        <button class="btn primary" id="sumSave">💾 Uložit do plánovače</button>
        <button class="btn" id="sumShare">🔗 Zkopírovat odkaz na cestu</button>
        <button class="btn ghost" id="sumNew">Začít novou cestu</button>
      </div>`;
    $$('[data-bk]', host).forEach(cb => cb.onchange = () => { t.booked[cb.dataset.bk] = cb.checked; persist(); });
    $('#sumSave').onclick = () => saveToPlanner();
    $('#sumShare').onclick = () => share();
    $('#sumNew').onclick = () => { if (confirm('Zahodit rozpracovanou cestu?')) { S.trip = null; persist(); go('flights'); } };
  }

  function saveToPlanner() {
    const t = T();
    const c = costs(t);
    const { checkin, checkout } = stayDates(t);
    const f = t.flight;
    const days = {};
    for (const d of (t.plan?.days || [])) days[d.date] = d.items.map(x => x.name + (x.note ? ` – ${x.note}` : ''));
    const flightTxt = `${f.out.from}→${f.out.to} ${fmtDate(f.out.date)} ${hhmm(f.out.dep)} (${f.out.carrierName || f.out.provider})${f.back ? `, zpět ${f.back.from}→${f.back.to} ${fmtDate(f.back.date)} ${hhmm(f.back.dep)} (${f.back.carrierName || f.back.provider})` : ''}`;
    const notes = [
      t.stay && t.stay.mode !== 'skip' ? `Ubytování: ${t.stay.name || ''} ${t.stay.totalCzk ? '– ' + czk(t.stay.totalCzk) : ''}${t.stay.url ? ' ' + t.stay.url : ''}` : '',
      t.car && t.car.mode !== 'skip' ? `Auto: ${t.car.pickup || ''} ${t.car.from || ''} → ${t.car.dropoff || ''} ${t.car.to || ''} – ${czk(t.car.totalCzk)}` : '',
    ].filter(Boolean).join('\n');
    S.trips.push({
      name: `${t.dest.label} ${fmtDate(checkin)}`, dest: t.dest.label, iso: byIso[t.dest.cc] ? t.dest.cc : null,
      start: f.out.date, end: f.back ? f.back.date : checkout, pax: String(t.adults), budget: String(c.total), flight: flightTxt,
      days, checklist: PACK.map(x => ({ t: x, done: false })), notes,
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
    for (const k of ['stay', 'car']) if (t[k] && typeof t[k] === 'object') t[k].totalCzk = num(t[k].totalCzk, 0, 1e7, 0);
    if (!t.dest || typeof t.dest !== 'object') t.dest = { label: t.flight.out.to };
    if (!t.ground || typeof t.ground !== 'object') t.ground = {};
    if (t.plan && !Array.isArray(t.plan.days)) t.plan = null;
    return t;
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

  window.Trip = { start, render: safeRender, importFromHash, costs };
})();
